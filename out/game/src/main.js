// DAWNWISP — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there. The game
// moves between six screens: title, play, upgrade, paused, win and game over.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|boss|dawn (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createWorld, EVENT_BOSS, EVENT_HIT, EVENT_NOVA, EVENT_OVER, EVENT_UPGRADE, EVENT_WAVE_CLEAR, EVENT_WIN } from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_ENDLESS,
  ACTION_MUTE,
  ACTION_NOVA,
  ACTION_PAUSE,
  ACTION_PICK_1,
  ACTION_PICK_2,
  ACTION_PICK_3,
  ACTION_RESTART,
  createInput,
} from './input.js';
import {
  createRenderer,
  endButtonRects,
  upgradeCardRects,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_UPGRADE,
  SCREEN_WIN,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { muted: false, hoverCard: -1 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let hoverCard = -1;
  let lastCleanseAt = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.click();
    world.startRun();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Three hearts. Survive ten waves.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.gameOver();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function winGame() {
    screen = SCREEN_WIN;
    audio.victory();
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Dawn breaks. You won with ${world.state.score} points.`);
  }

  function pickUpgrade(index) {
    if (world.chooseUpgrade(index)) {
      audio.upgrade();
      screen = SCREEN_PLAY;
      announce(`Blessing chosen. Wave ${world.state.wave}.`);
    }
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startGame();
      return;
    }
    if (screen === SCREEN_WIN) {
      if (actions & ACTION_ENDLESS) {
        audio.click();
        world.continueEndless();
        screen = SCREEN_PLAY;
        announce('The Endless Night. How long can the light last?');
      } else if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startGame();
      return;
    }
    if (screen === SCREEN_UPGRADE) {
      if (actions & ACTION_PICK_1) pickUpgrade(0);
      else if (actions & ACTION_PICK_2) pickUpgrade(1);
      else if (actions & ACTION_PICK_3) pickUpgrade(2);
      else if (actions & ACTION_CONFIRM && hoverCard >= 0) pickUpgrade(hoverCard);
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_PLAY && (actions & ACTION_PAUSE)) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  }

  // stepInput carries the frame's Nova press; the first fixed step consumes it.
  function step(stepInput) {
    const state = world.state;
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, nova: false, attract: true });
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    input.tick(state.time);
    const move = input.moveVector(state.player.x, state.player.y);
    const nova = stepInput.nova;
    stepInput.nova = false;
    const events = world.step(STEP, { mx: move.x, my: move.y, nova, attract: false });
    if (state.kills !== lastCleanseAt) {
      lastCleanseAt = state.kills;
      audio.cleanse(state.combo);
    }
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_NOVA) audio.nova();
    if (events & EVENT_BOSS) audio.boss();
    if (events & EVENT_WAVE_CLEAR) audio.waveStart();
    if (events & EVENT_UPGRADE) {
      screen = SCREEN_UPGRADE;
      announce('Wave cleared. Choose a blessing: 1, 2 or 3.');
    } else if (events & EVENT_WIN) winGame();
    else if (events & EVENT_OVER) endGame();
  }

  function hoverUpgrade() {
    if (screen !== SCREEN_UPGRADE) {
      hoverCard = -1;
      return;
    }
    const mouse = input.mouse();
    const rects = upgradeCardRects();
    hoverCard = -1;
    rects.forEach((r, i) => {
      if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) hoverCard = i;
    });
  }

  function clickEndButtons() {
    const mouse = input.mouse();
    if (!mouse.down) return;
    const btns = endButtonRects();
    const inside = (r) => mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h;
    if (screen === SCREEN_WIN) {
      if (inside(btns.endless)) {
        audio.click();
        world.continueEndless();
        screen = SCREEN_PLAY;
        announce('The Endless Night. How long can the light last?');
      } else if (inside(btns.again)) startGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // A click on an upgrade card or an end-screen button acts at once.
    if (screen === SCREEN_UPGRADE && input.mouse().down) {
      const mouse = input.mouse();
      const rects = upgradeCardRects();
      rects.forEach((r, i) => {
        if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) pickUpgrade(i);
      });
    }
    clickEndButtons();
    // Actions are read exactly once per frame and shared by the handlers and
    // the fixed steps, so a Space/click Nova is never eaten twice.
    const actions = input.takeActions();
    const stepInput = { nova: Boolean(actions & ACTION_NOVA) };
    handleActions(actions);
    hoverUpgrade();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step(stepInput);
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.draw(world.state, screen, best, { muted: audio.isMuted(), hoverCard });
  }

  // Leaving the tab pauses a running game rather than letting shades close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Dawnwisp. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
