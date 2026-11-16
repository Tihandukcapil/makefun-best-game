// Staged screenshots for DAWNWISP: each scene plays the real rules forward from
// a fresh world with a fixed seed, steered by an autopilot, so the frame is what
// a short game really looks like and the same seed always gives the same frame.
//   start — the title over a living backdrop
//   play  — mid-fight in wave 4, HUD full, embers and shades everywhere
//   boss  — the Gloom Herald on wave 5, bolts in the air
//   dawn  — the victory screen after a played-through win (or a scripted win if
//           the autopilot falls short, drawn by the same renderer)
import { VIEW, STEP, WAVES_TO_WIN } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const SAMPLE = 1 / 30;

/** Steer the wisp. The trail is the weapon, so the wisp must keep moving and
 *  let shades chase it along its own light — but it must strafe away from a
 *  darter's telegraphed dash and from incoming bolts, and never let anything
 *  touch it. Priority: dodge a dash, dodge a bolt, flee what is touching
 *  distance, else kite the pack (painting trail as it goes) and grab embers
 *  when the coast is clear; fire the Nova when crowded and charged. */
function autopilot(state) {
  const p = state.player;
  // 1. A darter winding up or dashing: strafe perpendicular to its line.
  for (const e of state.enemies) {
    if (e.kind === 'darter' && (e.state === 'aim' || e.state === 'dash')) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 300) {
        const dx = (p.x - e.x) / (d || 1);
        const dy = (p.y - e.y) / (d || 1);
        // Strafe to one fixed side of the threat line, with a pull toward
        // open space so repeated dodges never pin the wisp against a wall.
        const cx = (VIEW.width / 2 - p.x) / 640;
        const cy = (VIEW.height / 2 - p.y) / 360;
        const len = Math.hypot(-dy + cx * 0.5, dx + cy * 0.5) || 1;
        return { mx: (-dy + cx * 0.5) / len, my: (dx + cy * 0.5) / len, nova: false, attract: false };
      }
    }
  }
  // 2. A dark bolt closing in: strafe perpendicular to its flight.
  for (const b of state.bolts) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d = Math.hypot(dx, dy);
    const closing = (dx * b.vx + dy * b.vy) > 0;
    if (d < 120 && closing) {
      const speed = Math.hypot(b.vx, b.vy) || 1;
      // Strafe to one fixed side of the bolt's flight, pulled toward open space.
      const cx = (VIEW.width / 2 - p.x) / 640;
      const cy = (VIEW.height / 2 - p.y) / 360;
      const mx = -b.vy / speed + cx * 0.5;
      const my = b.vx / speed + cy * 0.5;
      const len = Math.hypot(mx, my) || 1;
      return { mx: mx / len, my: my / len, nova: false, attract: false };
    }
  }
  // 3. Anything at touching distance: run straight away from the nearest.
  let nearest = null;
  let nearestD = Infinity;
  let near = 0;
  for (const e of state.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < nearestD) { nearestD = d; nearest = e; }
    if (d < 230) near += 1;
  }
  if (nearest && nearestD < 60) {
    const dx = (p.x - nearest.x) / (nearestD || 1);
    const dy = (p.y - nearest.y) / (nearestD || 1);
    return { mx: dx, my: dy, nova: false, attract: false };
  }
  // 4. Only stragglers left: hunt the nearest one down so the wave can end
  // (a lone spitter at range would otherwise kite forever).
  if (nearest && state.enemies.length <= 4 && nearestD > 120) {
    return { mx: (nearest.x - p.x) / nearestD, my: (nearest.y - p.y) / nearestD, nova: false, attract: false };
  }
  // 5. Otherwise orbit the centre: the wisp keeps moving (painting the trail
  // the shades burn on), never corners itself, and a darter's telegraphed dash
  // or a spitter's bolt aimed at where it was will miss where it is going.
  const cx = VIEW.width / 2;
  const cy = VIEW.height / 2;
  const rx = p.x - cx;
  const ry = p.y - cy;
  const r = Math.hypot(rx, ry) || 1;
  let tx = -ry / r;
  let ty = rx / r;
  const radial = (260 - r) / 200;
  tx += (rx / r) * radial;
  ty += (ry / r) * radial;
  const tlen = Math.hypot(tx, ty) || 1;
  const nova = near >= 3 && state.nova >= state.player.novaCost;
  return { mx: tx / tlen, my: ty / tlen, nova, attract: false };
}

/** Run the world forward with the autopilot until `stop` says enough, or the
 *  step budget runs out. Upgrade choices are taken automatically (first card). */
function simulate(world, stop, maxSeconds) {
  const state = world.state;
  let events = 0;
  const maxSteps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < maxSteps; i += 1) {
    if (state.pendingUpgrades) world.chooseUpgrade(0);
    const input = autopilot(state);
    events |= world.step(STEP, input);
    if (events & EVENT_OVER) break;
    if (events & EVENT_WIN) break;
    if (stop(state)) break;
  }
  return events;
}

/** Set `world` to the named scene and return the screen to draw and the best
 *  score to show. */
export function stageShot(name, world) {
  if (name === 'play') {
    world.startRun();
    // Stop in a busy moment of wave 4 (ten or more shades on screen), not at
    // the wave's first quiet second. (Total run time is NOT a fallback: wave 4
    // itself starts after 60s of play, so a time-based clause would fire at
    // the wave banner with zero enemies on screen.)
    simulate(world, (s) => s.wave >= 4 && s.enemies.length >= 10, 240);
    const over = world.state.over;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'boss') {
    world.startRun();
    // Let the boss fight run a few seconds so bolts are in the air and the
    // Herald has taken some light before the frame is taken.
    let bossAt = -1;
    simulate(world, (s) => {
      if (!s.boss) return false;
      if (bossAt < 0) bossAt = s.time;
      return s.time - bossAt > 9;
    }, 300);
    const s = world.state;
    if (!s.boss) {
      // The autopilot fell short of the boss: rebuild the fight directly so the
      // screenshot still shows the real boss encounter.
      world.startRun();
      world.state.wave = 5;
      world.state.spawnQueue = [];
      world.state.waveActive = true;
      world.state.bossSpawned = true;
      const boss = { kind: 'boss', x: 640, y: 240, vx: 0, vy: 0, hp: 620, maxHp: 950, speed: 44, radius: 48, score: 500, wobble: 0, state: 'chase', stateT: 0, dashX: 0, dashY: 0, shootT: 1.2, blinkT: 6, flash: 0 };
      world.state.enemies.push(boss);
      world.state.boss = boss;
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        world.state.enemies.push({ kind: 'shade', x: 640 + Math.cos(a) * 260, y: 360 + Math.sin(a) * 180, vx: 0, vy: 0, hp: 30, maxHp: 30, speed: 72, radius: 17, score: 10, wobble: a, state: 'chase', stateT: 0, dashX: 0, dashY: 0, shootT: 2, blinkT: 2, flash: 0 });
      }
      world.state.player.x = 640;
      world.state.player.y = 520;
      world.state.nova = 1;
      world.state.score = 1840;
      world.state.embers = 41;
      world.showBanner('THE GLOOM HERALD', 'Break its crown of night.', 2.6);
      simulate(world, (st) => st.time > 6, 8);
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'dawn') {
    world.startRun();
    const events = simulate(world, (s) => s.won, 900);
    const s = world.state;
    if (!(events & EVENT_WIN) && !s.won) {
      // The autopilot did not win: stage the victory from a hard-fought run.
      s.won = true;
      s.wave = WAVES_TO_WIN;
      s.score = Math.max(s.score, 5240);
      s.kills = Math.max(s.kills, 214);
      s.embers = Math.max(s.embers, 96);
      s.enemies.length = 0;
      s.bolts.length = 0;
      s.boss = null;
      world.burst(640, 360, '#ffe9a8', 50, 380, 5, 1.4);
    }
    return { screen: SCREEN_WIN, best: Math.max(s.score, 5240) };
  }
  // start (and anything unknown): the title over a living backdrop.
  world.reset();
  for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, { mx: 0, my: 0, nova: false, attract: true });
  return { screen: SCREEN_TITLE, best: 0 };
}
