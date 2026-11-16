// DAWNWISP — the world: one wisp of dawn-light against the Long Night. The wisp
// moves, its aura of light and its fading trail cleanse shades that come close,
// cleansed shades drop embers, embers charge the Nova, and every cleared wave
// offers a choice of three blessings. Survive all 10 waves and the dawn breaks;
// keep going in the Endless Night after that.
//
// The world is pure simulation: step(dt, input) advances it by fixed steps and
// reports what happened as event bits, so the live loop, the autopilot and the
// staged screenshots all drive the same code.
import {
  VIEW,
  STEP,
  WAVES_TO_WIN,
  NOVA_RADIUS,
  NOVA_BASE_DAMAGE,
  PLAYER,
  ENEMIES,
  BOSS_HP_WAVE_10,
  UPGRADES,
  waveMix,
  spawnInterval,
} from './config.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_WIN = 8;
export const EVENT_NOVA = 16;
export const EVENT_CLEANSE = 32;
export const EVENT_BOSS = 64;
export const EVENT_UPGRADE = 128;

const TAU = Math.PI * 2;

function makePlayer() {
  return {
    x: VIEW.width / 2,
    y: VIEW.height / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER.radius,
    speed: PLAYER.speed,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    auraRadius: PLAYER.auraRadius,
    auraDps: PLAYER.auraDps,
    trailLife: PLAYER.trailLife,
    trailDps: PLAYER.trailDps,
    magnetRadius: PLAYER.magnetRadius,
    novaDamage: NOVA_BASE_DAMAGE,
    novaCost: 1,
    golden: false,
    invuln: 0,
    faceX: 1,
    faceY: 0,
  };
}

export function createWorld(random) {
  let state = null;

  function reset() {
    state = {
      time: 0,
      wave: 0,
      score: 0,
      embers: 0,
      nova: 0,
      combo: 0,
      comboTimer: 0,
      kills: 0,
      player: makePlayer(),
      enemies: [],
      bolts: [],
      emberBits: [],
      particles: [],
      floaters: [],
      trail: [],
      trailTimer: 0,
      spawnQueue: [],
      spawnTimer: 0,
      boss: null,
      bossSpawned: false,
      waveActive: false,
      betweenWaves: 0,
      pendingUpgrades: null,
      endless: false,
      won: false,
      over: false,
      shake: 0,
      flash: 0,
      flashColor: '#ffffff',
      banner: null,
      bannerTimer: 0,
      bossWarned: false,
    };
  }

  function showBanner(text, sub, dur) {
    state.banner = { text, sub: sub || '', t: 0, dur: dur || 2.2 };
    state.bannerTimer = 0;
  }

  function burst(x, y, color, count, speed, size, life) {
    for (let i = 0; i < count; i += 1) {
      const angle = random.next() * TAU;
      const v = speed * (0.3 + random.next() * 0.7);
      state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: 0,
        maxLife: life * (0.6 + random.next() * 0.7),
        size: size * (0.6 + random.next() * 0.8),
        color,
        drag: 2.4,
        kind: 'dot',
      });
    }
  }

  function ring(x, y, color, maxR, life) {
    state.particles.push({ x, y, vx: 0, vy: 0, life: 0, maxLife: life, size: maxR, color, drag: 0, kind: 'ring' });
  }

  function floater(x, y, text, color, size) {
    state.floaters.push({ x, y, text, color: color || '#ffc46b', size: size || 17, life: 0, maxLife: 1.1 });
  }

  function spawnEdge(kind) {
    const def = ENEMIES[kind];
    const side = random.int(0, 3);
    let x;
    let y;
    if (side === 0) { x = random.range(40, VIEW.width - 40); y = -30; }
    else if (side === 1) { x = VIEW.width + 30; y = random.range(40, VIEW.height - 40); }
    else if (side === 2) { x = random.range(40, VIEW.width - 40); y = VIEW.height + 30; }
    else { x = -30; y = random.range(40, VIEW.height - 40); }
    const enemy = {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: def.hp,
      maxHp: def.hp,
      speed: def.speed * random.range(0.9, 1.1),
      radius: def.radius,
      score: def.score,
      wobble: random.next() * TAU,
      state: 'chase',
      stateT: 0,
      dashX: 0,
      dashY: 0,
      shootT: random.range(1.5, 3),
      blinkT: random.range(1.5, 3),
      flash: 0,
    };
    if (kind === 'boss') {
      enemy.hp = state.wave >= 10 ? BOSS_HP_WAVE_10 : def.hp;
      enemy.maxHp = enemy.hp;
      enemy.x = VIEW.width / 2;
      enemy.y = -70;
    }
    state.enemies.push(enemy);
    return enemy;
  }

  function buildWave(wave) {
    const mix = waveMix(wave);
    const queue = [];
    for (const [kind, count] of Object.entries(mix)) {
      for (let i = 0; i < count; i += 1) queue.push(kind);
    }
    // Shuffle the queue so the wave arrives mixed, not in blocks.
    for (let i = queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random.next() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }
    return queue;
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = buildWave(wave);
    state.spawnTimer = 0.6;
    state.waveActive = true;
    state.bossSpawned = false;
    state.bossWarned = false;
    if (wave === 5 || wave === 10) {
      showBanner(wave === 10 ? 'THE FINAL WAVE' : 'WAVE 5', 'Something vast stirs in the dark…', 2.6);
    } else {
      showBanner(`WAVE ${wave}`, wave > WAVES_TO_WIN ? 'The Endless Night' : `of ${WAVES_TO_WIN} — hold the light`, 2.0);
    }
  }

  function rollUpgrades() {
    const pool = UPGRADES.slice();
    const picks = [];
    while (picks.length < 3 && pool.length > 0) {
      const index = Math.floor(random.next() * pool.length);
      picks.push(pool.splice(index, 1)[0]);
    }
    return picks;
  }

  function applyUpgrade(id) {
    const p = state.player;
    if (id === 'radiant') p.auraRadius += 30;
    else if (id === 'swift') p.speed *= 1.18;
    else if (id === 'searing') p.auraDps *= 1.3;
    else if (id === 'longtrail') { p.trailLife += 0.8; p.trailDps += 15; }
    else if (id === 'magnet') p.magnetRadius *= 1.9;
    else if (id === 'novasurge') { p.novaDamage *= 1.6; p.novaCost = Math.max(0.6, p.novaCost - 0.2); }
    else if (id === 'secondwind') { p.maxHp += 1; p.hp = Math.min(p.maxHp, p.hp + 1); }
    else if (id === 'golden') p.golden = true;
  }

  function damageEnemy(enemy, amount, kx, ky) {
    enemy.hp -= amount;
    enemy.flash = 0.12;
    if (kx || ky) {
      enemy.x += kx;
      enemy.y += ky;
    }
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    const index = state.enemies.indexOf(enemy);
    if (index === -1) return;
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = 2.5;
    const mult = 1 + Math.min(7, Math.floor(state.combo / 4));
    const gained = enemy.score * mult;
    state.score += gained;
    floater(enemy.x, enemy.y - enemy.radius, `+${gained}`, mult > 1 ? '#ffe9a8' : '#ffc46b', mult > 1 ? 20 : 16);
    burst(enemy.x, enemy.y, '#ffd98a', enemy.kind === 'boss' ? 60 : 16, 260, 4, 0.7);
    burst(enemy.x, enemy.y, '#4df0c0', enemy.kind === 'boss' ? 30 : 8, 180, 3, 0.9);
    ring(enemy.x, enemy.y, '#ffe9a8', enemy.radius * 3, 0.45);
    const drops = enemy.kind === 'boss' ? 10 : enemy.kind === 'bulwark' ? 3 : random.int(1, 2);
    for (let i = 0; i < drops; i += 1) {
      const angle = random.next() * TAU;
      state.emberBits.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * random.range(30, 110),
        vy: Math.sin(angle) * random.range(30, 110),
        bob: random.next() * TAU,
        life: 0,
      });
    }
    if (enemy.kind === 'boss') {
      state.boss = null;
      state.shake = Math.max(state.shake, 18);
      state.flash = 0.5;
      state.flashColor = '#fff3c4';
      showBanner('THE HERALD FALLS', 'The dark recoils — for now.', 2.2);
    }
  }

  function hurtPlayer(fromX, fromY) {
    const p = state.player;
    if (p.invuln > 0 || state.over || state.won) return EVENT_HIT;
    p.hp -= 1;
    p.invuln = PLAYER.invulnSeconds;
    const dx = p.x - fromX;
    const dy = p.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    p.x += (dx / len) * 26;
    p.y += (dy / len) * 26;
    p.x = Math.max(24, Math.min(VIEW.width - 24, p.x));
    p.y = Math.max(24, Math.min(VIEW.height - 24, p.y));
    state.combo = 0;
    state.comboTimer = 0;
    state.shake = Math.max(state.shake, 13);
    state.flash = 0.35;
    state.flashColor = '#ff5d73';
    burst(p.x, p.y, '#ff5d73', 18, 240, 4, 0.6);
    if (p.hp <= 0) {
      state.over = true;
      state.waveActive = false;
      burst(p.x, p.y, '#fff7d6', 50, 320, 5, 1.2);
      ring(p.x, p.y, '#fff7d6', 260, 0.9);
      return EVENT_HIT | EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function fireNova() {
    const p = state.player;
    if (state.nova < p.novaCost || state.over || state.won) return 0;
    state.nova = 0;
    state.flash = 0.45;
    state.flashColor = '#fff3c4';
    state.shake = Math.max(state.shake, 16);
    ring(p.x, p.y, '#ffe9a8', NOVA_RADIUS, 0.7);
    ring(p.x, p.y, '#4df0c0', NOVA_RADIUS * 0.7, 0.55);
    burst(p.x, p.y, '#ffe9a8', 40, 420, 4, 0.8);
    let hitAny = false;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < NOVA_RADIUS + e.radius) {
        hitAny = true;
        const push = 260 * (1 - dist / (NOVA_RADIUS + e.radius));
        damageEnemy(e, p.novaDamage, (dx / (dist || 1)) * push, (dy / (dist || 1)) * push);
      }
    }
    return hitAny ? EVENT_NOVA : EVENT_NOVA;
  }

  function stepEnemy(e, dt) {
    const p = state.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    e.wobble += dt * 3;
    if (e.flash > 0) e.flash -= dt;
    e.stateT += dt;

    if (e.kind === 'darter') {
      if (e.state === 'chase') {
        e.x += ux * e.speed * dt;
        e.y += uy * e.speed * dt;
        if (dist < 190 && e.stateT > 0.9) { e.state = 'aim'; e.stateT = 0; }
      } else if (e.state === 'aim') {
        e.x += ux * e.speed * 0.25 * dt;
        e.y += uy * e.speed * 0.25 * dt;
        if (e.stateT > 0.45) {
          e.state = 'dash';
          e.stateT = 0;
          e.dashX = ux;
          e.dashY = uy;
        }
      } else if (e.state === 'dash') {
        e.x += e.dashX * 430 * dt;
        e.y += e.dashY * 430 * dt;
        if (e.stateT > 0.35) { e.state = 'chase'; e.stateT = 0; }
      }
    } else if (e.kind === 'spitter') {
      if (dist > 320) { e.x += ux * e.speed * dt; e.y += uy * e.speed * dt; }
      else if (dist < 220) { e.x -= ux * e.speed * 0.7 * dt; e.y -= uy * e.speed * 0.7 * dt; }
      e.shootT -= dt;
      if (e.shootT <= 0 && dist < 560) {
        e.shootT = random.range(2.2, 3.2);
        state.bolts.push({
          x: e.x, y: e.y, vx: ux * 185, vy: uy * 185,
          radius: 6, life: 0, maxLife: 4, friendly: false,
        });
      }
    } else if (e.kind === 'wraith') {
      e.x += ux * e.speed * dt;
      e.y += uy * e.speed * dt;
      e.blinkT -= dt;
      if (e.blinkT <= 0) {
        e.blinkT = random.range(2.2, 3.4);
        burst(e.x, e.y, '#8fb7ff', 8, 120, 3, 0.5);
        e.x += ux * 130;
        e.y += uy * 130;
        burst(e.x, e.y, '#8fb7ff', 8, 120, 3, 0.5);
      }
    } else if (e.kind === 'boss') {
      e.x += ux * e.speed * dt;
      e.y += uy * e.speed * dt;
      e.shootT -= dt;
      if (e.shootT <= 0) {
        e.shootT = 3.6;
        const count = 10;
        for (let i = 0; i < count; i += 1) {
          const a = (i / count) * TAU + e.wobble * 0.2;
          state.bolts.push({
            x: e.x, y: e.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
            radius: 7, life: 0, maxLife: 5, friendly: false,
          });
        }
        ring(e.x, e.y, '#ff5d73', 120, 0.5);
      }
      e.blinkT -= dt;
      if (e.blinkT <= 0) {
        e.blinkT = 8;
        for (let i = 0; i < 3; i += 1) spawnEdge('shade');
      }
    } else {
      // shade and bulwark: a steady, hungry chase.
      e.x += ux * e.speed * dt;
      e.y += uy * e.speed * dt;
    }
    e.x = Math.max(-60, Math.min(VIEW.width + 60, e.x));
    e.y = Math.max(-60, Math.min(VIEW.height + 60, e.y));
  }

  function step(dt, input) {
    let events = 0;
    if (!state) reset();
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.6);
    if (state.banner) {
      state.banner.t += dt;
      if (state.banner.t >= state.banner.dur) state.banner = null;
    }
    const p = state.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // Trail motes fade; particles and floaters age.
    for (let i = state.trail.length - 1; i >= 0; i -= 1) {
      state.trail[i].age += dt;
      if (state.trail[i].age > p.trailLife) state.trail.splice(i, 1);
    }
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life += dt;
      if (pt.life >= pt.maxLife) { state.particles.splice(i, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      const dragF = Math.max(0, 1 - pt.drag * dt);
      pt.vx *= dragF;
      pt.vy *= dragF;
    }
    for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
      const f = state.floaters[i];
      f.life += dt;
      f.y -= 34 * dt;
      if (f.life >= f.maxLife) state.floaters.splice(i, 1);
    }

    // Attract mode: the title screen's living backdrop — a wisp wanders, a few
    // shades drift, nothing can die and nothing is scored.
    if (input.attract) {
      const t = state.time;
      p.x = VIEW.width / 2 + Math.cos(t * 0.35) * 260;
      p.y = VIEW.height / 2 + Math.sin(t * 0.5) * 130;
      state.trailTimer -= dt;
      if (state.trailTimer <= 0) {
        state.trailTimer = PLAYER.trailTick;
        state.trail.push({ x: p.x, y: p.y, age: 0 });
      }
      if (state.enemies.length < 5 && random.chance(dt * 0.5)) spawnEdge('shade');
      for (const e of state.enemies) {
        e.x += Math.sin(state.time + e.wobble) * 12 * dt;
        e.y += Math.cos(state.time * 0.7 + e.wobble) * 12 * dt;
      }
      return events;
    }

    if (state.over || state.won || state.pendingUpgrades) return events;

    // --- player movement ---
    const mx = input.mx || 0;
    const my = input.my || 0;
    const mag = Math.hypot(mx, my);
    if (mag > 0.01) {
      const nx = mx / Math.max(1, mag);
      const ny = my / Math.max(1, mag);
      const speed = p.speed * Math.min(1, mag);
      p.x += nx * speed * dt;
      p.y += ny * speed * dt;
      p.faceX = nx;
      p.faceY = ny;
    }
    p.x = Math.max(20, Math.min(VIEW.width - 20, p.x));
    p.y = Math.max(20, Math.min(VIEW.height - 20, p.y));
    state.trailTimer -= dt;
    if (state.trailTimer <= 0) {
      state.trailTimer = PLAYER.trailTick;
      state.trail.push({ x: p.x, y: p.y, age: 0 });
    }

    if (input.nova) events |= fireNova();

    // --- wave flow ---
    if (state.waveActive) {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          state.spawnTimer = spawnInterval(state.wave);
          spawnEdge(state.spawnQueue.shift());
        }
      }
      const isBossWave = state.wave === 5 || state.wave === 10;
      if (isBossWave && !state.bossSpawned && state.spawnQueue.length === 0 && state.enemies.length <= 2) {
        state.bossSpawned = true;
        const boss = spawnEdge('boss');
        state.boss = boss;
        showBanner('THE GLOOM HERALD', 'Break its crown of night.', 2.6);
        events |= EVENT_BOSS;
      }
      if (state.spawnQueue.length === 0 && state.enemies.length === 0 && !state.boss) {
        state.waveActive = false;
        if (state.wave >= WAVES_TO_WIN && !state.endless) {
          state.won = true;
          burst(p.x, p.y, '#ffe9a8', 60, 380, 5, 1.4);
          return events | EVENT_WIN;
        }
        state.betweenWaves = 1.4;
        state.pendingUpgrades = null;
        showBanner(`WAVE ${state.wave} CLEARED`, state.wave >= WAVES_TO_WIN ? 'The Endless Night deepens…' : 'Choose a blessing.', 1.6);
        events |= EVENT_WAVE_CLEAR;
      }
    } else if (!state.won && !state.over) {
      // Breather between waves, then the upgrade choice.
      state.betweenWaves -= dt;
      if (state.betweenWaves <= 0 && !state.pendingUpgrades) {
        state.pendingUpgrades = rollUpgrades();
        events |= EVENT_UPGRADE;
      }
    }

    // --- aura + trail damage ---
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < p.auraRadius + e.radius) damageEnemy(e, p.auraDps * dt, 0, 0);
    }
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      for (const mote of state.trail) {
        const d = Math.hypot(e.x - mote.x, e.y - mote.y);
        if (d < e.radius + 26) {
          damageEnemy(e, p.trailDps * dt, 0, 0);
          break;
        }
      }
    }

    // --- enemies move, touch, shoot ---
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      stepEnemy(e, dt);
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < e.radius + p.radius - 2) {
        events |= hurtPlayer(e.x, e.y);
        if (state.over) return events;
        // A shade that lands a hit is knocked back so it cannot chain-hit.
        e.x += ((e.x - p.x) / (d || 1)) * 30;
        e.y += ((e.y - p.y) / (d || 1)) * 30;
      }
    }

    // --- dark bolts ---
    for (let i = state.bolts.length - 1; i >= 0; i -= 1) {
      const b = state.bolts[i];
      b.life += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life >= b.maxLife || b.x < -20 || b.x > VIEW.width + 20 || b.y < -20 || b.y > VIEW.height + 20) {
        state.bolts.splice(i, 1);
        continue;
      }
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < b.radius + p.radius - 2) {
        state.bolts.splice(i, 1);
        events |= hurtPlayer(b.x, b.y);
        if (state.over) return events;
      }
    }

    // --- embers: drift, magnet, collect ---
    for (let i = state.emberBits.length - 1; i >= 0; i -= 1) {
      const bit = state.emberBits[i];
      bit.life += dt;
      bit.bob += dt * 4;
      bit.vx *= Math.max(0, 1 - 2.2 * dt);
      bit.vy *= Math.max(0, 1 - 2.2 * dt);
      const dx = p.x - bit.x;
      const dy = p.y - bit.y;
      const d = Math.hypot(dx, dy);
      if (d < p.magnetRadius) {
        const pull = 420 * (1 - d / (p.magnetRadius + 1)) + 120;
        bit.vx += (dx / (d || 1)) * pull * dt * 4;
        bit.vy += (dy / (d || 1)) * pull * dt * 4;
      }
      bit.x += bit.vx * dt;
      bit.y += bit.vy * dt;
      if (d < 22) {
        state.emberBits.splice(i, 1);
        state.embers += 1;
        const scoreGain = (p.golden ? 10 : 5);
        state.score += scoreGain;
        state.nova = Math.min(1, state.nova + PLAYER.novaChargePerEmber * (p.golden ? 1.5 : 1));
        if (state.embers % 5 === 0) floater(p.x, p.y - 26, `+${scoreGain}`, '#ffcf6e', 14);
      }
    }

    return events;
  }

  function chooseUpgrade(index) {
    if (!state.pendingUpgrades) return false;
    const pick = state.pendingUpgrades[index];
    if (!pick) return false;
    applyUpgrade(pick.id);
    state.pendingUpgrades = null;
    const next = state.wave + 1;
    startWave(next);
    return true;
  }

  function startRun() {
    reset();
    startWave(1);
  }

  function continueEndless() {
    state.won = false;
    state.endless = true;
    state.player.hp = state.player.maxHp;
    state.pendingUpgrades = null;
    startWave(WAVES_TO_WIN + 1);
  }

  reset();

  return {
    get state() {
      return state;
    },
    reset,
    startRun,
    startWave,
    chooseUpgrade,
    continueEndless,
    step,
    showBanner,
    burst,
    floater,
  };
}
