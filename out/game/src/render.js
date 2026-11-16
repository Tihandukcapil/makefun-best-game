// DAWNWISP — every pixel the player (and the judge) sees. Canvas 2D, no assets:
// the sky, aurora, stars and vignette are painted or pre-rendered here, and the
// wisp, shades, embers and particles are drawn from glow sprites so a busy
// frame stays fast. All motion is driven by state.time, so a staged screenshot
// is deterministic.
import { VIEW, PALETTE, WAVES_TO_WIN } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;

function makeGlow(color, inner) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner || '#ffffff');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function upgradeCardRects() {
  const w = 300;
  const h = 216;
  const gap = 28;
  const total = w * 3 + gap * 2;
  const x0 = (VIEW.width - total) / 2;
  const y = 268;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y, w, h }));
}

export function endButtonRects() {
  return {
    again: { x: VIEW.width / 2 - 330, y: 520, w: 300, h: 64 },
    endless: { x: VIEW.width / 2 + 30, y: 520, w: 300, h: 64 },
  };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const glows = {
    white: makeGlow('rgba(255,247,214,0.55)', '#fffdf2'),
    gold: makeGlow('rgba(255,196,107,0.6)', '#ffe9a8'),
    teal: makeGlow('rgba(77,240,192,0.55)', '#d8fff1'),
    violet: makeGlow('rgba(122,92,255,0.6)', '#e3d9ff'),
    pink: makeGlow('rgba(255,122,217,0.55)', '#ffd6f2'),
    red: makeGlow('rgba(255,93,115,0.65)', '#ffdce1'),
    blue: makeGlow('rgba(143,183,255,0.55)', '#eaf2ff'),
  };
  // Static sky + vignette, painted once.
  const sky = document.createElement('canvas');
  sky.width = VIEW.width;
  sky.height = VIEW.height;
  {
    const g = sky.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyBottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, VIEW.width, VIEW.height);
    // Distant ridge line, barely there.
    g.fillStyle = 'rgba(5,6,18,0.55)';
    g.beginPath();
    g.moveTo(0, VIEW.height);
    for (let x = 0; x <= VIEW.width; x += 40) {
      g.lineTo(x, VIEW.height - 46 - Math.sin(x * 0.008) * 22 - Math.sin(x * 0.021) * 10);
    }
    g.lineTo(VIEW.width, VIEW.height);
    g.closePath();
    g.fill();
    // Vignette.
    const vg = g.createRadialGradient(640, 360, 260, 640, 360, 780);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,3,10,0.5)');
    g.fillStyle = vg;
    g.fillRect(0, 0, VIEW.width, VIEW.height);
  }
  // Stars, seeded once so they never jump.
  const stars = [];
  {
    let s = 1234567;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 150; i += 1) {
      stars.push({ x: rnd() * VIEW.width, y: rnd() * VIEW.height * 0.75, r: 0.6 + rnd() * 1.5, p: rnd() * TAU, s: 0.4 + rnd() * 1.2 });
    }
  }

  function drawGlow(sprite, x, y, size, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  function drawSky(time) {
    ctx.drawImage(sky, 0, 0);
    for (const st of stars) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * st.s + st.p));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#dfe6ff';
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Aurora ribbons: three slow sine bands, additive.
    ctx.globalCompositeOperation = 'lighter';
    const bands = [
      { color: PALETTE.auroraTeal, y: 150, amp: 42, alpha: 0.13, speed: 0.11, phase: 0 },
      { color: PALETTE.auroraGreen, y: 210, amp: 55, alpha: 0.10, speed: 0.08, phase: 2.1 },
      { color: PALETTE.auroraViolet, y: 110, amp: 34, alpha: 0.12, speed: 0.14, phase: 4.2 },
    ];
    for (const b of bands) {
      ctx.beginPath();
      for (let x = -20; x <= VIEW.width + 20; x += 24) {
        const y = b.y + Math.sin(x * 0.004 + time * b.speed + b.phase) * b.amp
          + Math.sin(x * 0.011 - time * b.speed * 0.6 + b.phase * 2) * 14;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = b.alpha;
      ctx.lineWidth = 46;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTrail(state) {
    if (state.trail.length < 2) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < state.trail.length; i += 1) {
      const a = state.trail[i - 1];
      const b = state.trail[i];
      const fade = 1 - b.age / state.player.trailLife;
      if (fade <= 0) continue;
      ctx.strokeStyle = `rgba(255,214,130,${(fade * 0.55).toFixed(3)})`;
      ctx.lineWidth = 4 + fade * 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawEmbers(state, time) {
    for (const bit of state.emberBits) {
      const bobY = Math.sin(bit.bob) * 3;
      drawGlow(glows.gold, bit.x, bit.y + bobY, 34, 0.85);
      ctx.save();
      ctx.translate(bit.x, bit.y + bobY);
      ctx.rotate(Math.PI / 4 + Math.sin(bit.bob * 0.5) * 0.3);
      ctx.fillStyle = '#ffcf6e';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(-2.5, -2.5, 5, 5);
      ctx.restore();
    }
  }

  function drawEnemy(e, time) {
    const wob = Math.sin(e.wobble) * 0.06;
    ctx.save();
    ctx.translate(e.x, e.y);
    const glowSprite = e.kind === 'darter' ? glows.blue : e.kind === 'spitter' ? glows.pink : e.kind === 'wraith' ? glows.blue : e.kind === 'boss' ? glows.red : glows.violet;
    drawGlow(glowSprite, 0, 0, e.radius * 4.4, e.kind === 'boss' ? 0.8 : 0.5);
    if (e.flash > 0) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (e.kind === 'boss') {
      ctx.rotate(wob * 0.5);
      ctx.fillStyle = '#120a24';
      ctx.strokeStyle = '#ff5d73';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < 9; i += 1) {
        const a = (i / 9) * TAU;
        const r = i % 2 === 0 ? e.radius + 16 : e.radius - 4;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Three burning eyes.
      ctx.fillStyle = '#ff2e4d';
      for (const ex of [-20, 0, 20]) {
        ctx.beginPath();
        ctx.arc(ex, -8, 6, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ffdce1';
      for (const ex of [-20, 0, 20]) {
        ctx.beginPath();
        ctx.arc(ex, -8, 2.2, 0, TAU);
        ctx.fill();
      }
    } else if (e.kind === 'darter') {
      const ang = Math.atan2(e.vy || 0, e.vx || 0);
      ctx.rotate(Number.isFinite(ang) ? ang : 0);
      ctx.fillStyle = '#101a33';
      ctx.strokeStyle = '#4dd7ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(e.radius + 8, 0);
      ctx.lineTo(-e.radius, -e.radius * 0.75);
      ctx.lineTo(-e.radius * 0.4, 0);
      ctx.lineTo(-e.radius, e.radius * 0.75);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#bdf3ff';
      ctx.beginPath();
      ctx.arc(e.radius * 0.35, -4, 2.4, 0, TAU);
      ctx.arc(e.radius * 0.35, 4, 2.4, 0, TAU);
      ctx.fill();
    } else if (e.kind === 'bulwark') {
      ctx.rotate(wob);
      ctx.fillStyle = '#1c1030';
      ctx.strokeStyle = '#b06bff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU + Math.PI / 6;
        const x = Math.cos(a) * e.radius;
        const y = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(176,107,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-e.radius * 0.5, -e.radius * 0.3);
      ctx.lineTo(0, e.radius * 0.2);
      ctx.lineTo(e.radius * 0.45, -e.radius * 0.4);
      ctx.stroke();
      ctx.fillStyle = '#ffd6ff';
      ctx.beginPath();
      ctx.arc(-8, -6, 3.4, 0, TAU);
      ctx.arc(8, -6, 3.4, 0, TAU);
      ctx.fill();
    } else if (e.kind === 'spitter') {
      ctx.fillStyle = '#2a1030';
      ctx.strokeStyle = '#ff7ad9';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * TAU;
        const r = i % 2 === 0 ? e.radius + 7 : e.radius - 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffc2ec';
      ctx.beginPath();
      ctx.arc(-5, -3, 3, 0, TAU);
      ctx.arc(5, -3, 3, 0, TAU);
      ctx.fill();
    } else if (e.kind === 'wraith') {
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = '#0e1428';
      ctx.strokeStyle = '#8fb7ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -2, e.radius, Math.PI, 0);
      ctx.lineTo(e.radius, e.radius * 0.7 + Math.sin(time * 6 + e.wobble * 5) * 3);
      ctx.lineTo(e.radius * 0.5, e.radius * 0.45);
      ctx.lineTo(0, e.radius * 0.75 + Math.sin(time * 6 + e.wobble * 5 + 1) * 3);
      ctx.lineTo(-e.radius * 0.5, e.radius * 0.45);
      ctx.lineTo(-e.radius, e.radius * 0.7 + Math.sin(time * 6 + e.wobble * 5 + 2) * 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#eaf2ff';
      ctx.beginPath();
      ctx.arc(-5, -4, 2.6, 0, TAU);
      ctx.arc(5, -4, 2.6, 0, TAU);
      ctx.fill();
    } else {
      // shade: a dark blob with a violet rim and two watching eyes.
      const squash = 1 + Math.sin(e.wobble * 2) * 0.07;
      ctx.scale(squash, 1 / squash);
      ctx.fillStyle = '#17112e';
      ctx.strokeStyle = '#7a5cff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c9a6ff';
      ctx.beginPath();
      ctx.arc(-6, -4, 3.2, 0, TAU);
      ctx.arc(6, -4, 3.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#17112e';
      ctx.beginPath();
      ctx.arc(-6, -4, 1.4, 0, TAU);
      ctx.arc(6, -4, 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // Wounded enemies show a small health bar.
    if (e.hp < e.maxHp && e.kind !== 'boss') {
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w, 4);
      ctx.fillStyle = '#ff5d73';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w * Math.max(0, e.hp / e.maxHp), 4);
    }
  }

  function drawBolts(state) {
    for (const b of state.bolts) {
      drawGlow(glows.red, b.x, b.y, 40, 0.8);
      ctx.fillStyle = '#2a0a18';
      ctx.strokeStyle = '#ff5d73';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff8ba0';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, TAU);
      ctx.fill();
    }
  }

  function drawPlayer(state, time) {
    const p = state.player;
    const blink = p.invuln > 0 && Math.floor(time * 14) % 2 === 0;
    // Aura ring: the visible edge of the light.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,214,130,${0.10 + 0.05 * Math.sin(time * 2.4)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.auraRadius, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffd682';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.auraRadius, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (!blink) {
      drawGlow(glows.gold, p.x, p.y, 150, 0.95);
      drawGlow(glows.white, p.x, p.y, 70, 0.95);
      ctx.fillStyle = '#fff7d6';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffc46b';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Two sparkles orbiting the core.
      for (let i = 0; i < 2; i += 1) {
        const a = time * 2.2 + i * Math.PI;
        const sx = p.x + Math.cos(a) * (p.radius + 9);
        const sy = p.y + Math.sin(a) * (p.radius + 9);
        ctx.fillStyle = '#fff3c4';
        ctx.beginPath();
        ctx.arc(sx, sy, 2.4, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      const f = 1 - pt.life / pt.maxLife;
      if (pt.kind === 'ring') {
        ctx.globalAlpha = f * 0.8;
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 3 + f * 4;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (1 - f * f), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = f;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(0.5, pt.size * f), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawFloaters(state) {
    ctx.textAlign = 'center';
    for (const f of state.floaters) {
      const a = 1 - f.life / f.maxLife;
      ctx.globalAlpha = a;
      ctx.font = `bold ${f.size}px 'Trebuchet MS', Verdana, sans-serif`;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHeart(x, y, filled, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.bezierCurveTo(-11, -3, -7, -11, 0, -5);
    ctx.bezierCurveTo(7, -11, 11, -3, 0, 7);
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = '#ff5d73';
      ctx.fill();
      ctx.strokeStyle = '#ffdce1';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,93,115,0.18)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,93,115,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function pill(x, y, w, h, fill, stroke) {
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawHUD(state, ui) {
    const p = state.player;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    // Hearts + wave.
    for (let i = 0; i < p.maxHp; i += 1) drawHeart(36 + i * 30, 34, i < p.hp, 1);
    pill(20, 56, 150, 28, 'rgba(7,10,30,0.62)', 'rgba(185,179,217,0.35)');
    ctx.fillStyle = PALETTE.text;
    ctx.font = "bold 15px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillText(state.wave > WAVES_TO_WIN || state.endless ? `WAVE ${state.wave} · ENDLESS` : `WAVE ${state.wave} / ${WAVES_TO_WIN}`, 34, 75);
    // Score, centre.
    ctx.textAlign = 'center';
    ctx.font = "bold 34px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(String(state.score), VIEW.width / 2, 44);
    const mult = 1 + Math.min(7, Math.floor(state.combo / 4));
    if (state.combo >= 4) {
      ctx.font = "bold 16px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(`COMBO x${mult}  ·  ${state.combo} cleansed`, VIEW.width / 2, 68);
    }
    // Embers + Nova, right.
    ctx.textAlign = 'right';
    drawGlow(glows.gold, VIEW.width - 148, 30, 26, 0.9);
    ctx.save();
    ctx.translate(VIEW.width - 148, 30);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffcf6e';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
    ctx.font = "bold 20px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(String(state.embers), VIEW.width - 128, 37);
    // Nova meter.
    const nx = VIEW.width - 240;
    const ny = 56;
    const nw = 220;
    pill(nx, ny, nw, 16, 'rgba(7,10,30,0.62)', 'rgba(185,179,217,0.35)');
    const frac = Math.min(1, state.nova / p.novaCost);
    if (frac > 0) {
      const grad = ctx.createLinearGradient(nx, 0, nx + nw, 0);
      grad.addColorStop(0, '#ff9a3d');
      grad.addColorStop(1, '#ffe9a8');
      roundRect(ctx, nx + 2, ny + 2, (nw - 4) * frac, 12, 6);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.font = "bold 12px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = frac >= 1 ? '#ffe9a8' : PALETTE.textDim;
    ctx.fillText(frac >= 1 ? 'NOVA READY — SPACE / CLICK' : 'NOVA', VIEW.width - 20, ny + 34);
    // Boss bar.
    if (state.boss) {
      const bw = 420;
      const bx = (VIEW.width - bw) / 2;
      const by = 84;
      ctx.textAlign = 'center';
      ctx.font = "bold 13px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = '#ffb3bd';
      ctx.fillText('THE GLOOM HERALD', VIEW.width / 2, by - 6);
      pill(bx, by, bw, 12, 'rgba(7,10,30,0.7)', 'rgba(255,93,115,0.5)');
      roundRect(ctx, bx + 2, by + 2, (bw - 4) * Math.max(0, state.boss.hp / state.boss.maxHp), 8, 4);
      ctx.fillStyle = '#ff5d73';
      ctx.fill();
    }
    // Controls hint, bottom left (fades once the fight is underway).
    if (state.wave <= 1 && state.time < 14) {
      ctx.textAlign = 'left';
      ctx.globalAlpha = Math.max(0, Math.min(0.85, (14 - state.time) / 4));
      ctx.font = "14px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText('WASD / arrows / mouse — move    ·    SPACE / click — Nova    ·    P — pause    ·    M — sound', 20, VIEW.height - 18);
      ctx.globalAlpha = 1;
    }
    // Mute state, bottom right.
    ctx.textAlign = 'right';
    ctx.font = "13px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(ui.muted ? 'M — sound off' : 'M — sound on', VIEW.width - 20, VIEW.height - 18);
  }

  function drawBanner(state) {
    const b = state.banner;
    if (!b) return;
    const f = b.t / b.dur;
    const alpha = f < 0.15 ? f / 0.15 : f > 0.7 ? Math.max(0, 1 - (f - 0.7) / 0.3) : 1;
    const scale = f < 0.15 ? 0.85 + (f / 0.15) * 0.15 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(VIEW.width / 2, 250);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = "bold 52px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = '#fff7d6';
    ctx.shadowColor = '#ffc46b';
    ctx.shadowBlur = 24;
    ctx.fillText(b.text, 0, 0);
    ctx.shadowBlur = 0;
    if (b.sub) {
      ctx.font = "18px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText(b.sub, 0, 34);
    }
    ctx.restore();
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(4,6,18,0.45)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    // Title with a gold glow.
    ctx.font = "bold 92px 'Trebuchet MS', Verdana, sans-serif";
    ctx.shadowColor = '#ffc46b';
    ctx.shadowBlur = 34;
    const grad = ctx.createLinearGradient(0, 150, 0, 250);
    grad.addColorStop(0, '#fffdf2');
    grad.addColorStop(1, '#ffc46b');
    ctx.fillStyle = grad;
    ctx.fillText('DAWNWISP', VIEW.width / 2, 238);
    ctx.shadowBlur = 0;
    ctx.font = "italic 22px Georgia, 'Times New Roman', serif";
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('The night is endless. Your light is not.', VIEW.width / 2, 282);
    // Three things the game is.
    const feats = [
      ['YOUR LIGHT', 'cleanses the shades'],
      ['EMBERS', 'charge your Nova'],
      ['10 WAVES', 'then the dawn breaks'],
    ];
    ctx.font = "bold 16px 'Trebuchet MS', Verdana, sans-serif";
    feats.forEach((f, i) => {
      const x = VIEW.width / 2 + (i - 1) * 300;
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(f[0], x, 350);
      ctx.font = "15px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText(f[1], x, 376);
      ctx.font = "bold 16px 'Trebuchet MS', Verdana, sans-serif";
    });
    // Controls box.
    roundRect(ctx, VIEW.width / 2 - 330, 420, 660, 92, 14);
    ctx.fillStyle = 'rgba(7,10,30,0.62)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(185,179,217,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = "16px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('Move — WASD, arrow keys, or mouse', VIEW.width / 2, 452);
    ctx.fillText('Nova burst — SPACE or click (when the meter is full)', VIEW.width / 2, 478);
    ctx.fillText('Pause — P      ·      Sound — M', VIEW.width / 2, 504);
    // Start prompt, pulsing.
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.font = "bold 24px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = '#fff7d6';
    ctx.fillText('PRESS SPACE OR CLICK TO BEGIN', VIEW.width / 2, 580);
    ctx.globalAlpha = 1;
    if (best > 0) {
      ctx.font = "16px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText(`Best score: ${best}`, VIEW.width / 2, 616);
    }
  }

  function drawUpgradeCard(rect, upgrade, key, hover) {
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 16);
    ctx.fillStyle = hover ? 'rgba(38,28,74,0.95)' : 'rgba(12,16,44,0.9)';
    ctx.fill();
    ctx.strokeStyle = hover ? '#ffc46b' : 'rgba(185,179,217,0.4)';
    ctx.lineWidth = hover ? 2.5 : 1.5;
    ctx.stroke();
    ctx.textAlign = 'center';
    // Icon: a small drawn glyph per blessing.
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + 52;
    drawGlow(glows.gold, cx, cy, 74, 0.8);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = "bold 30px 'Trebuchet MS', Verdana, sans-serif";
    const glyphs = { radiant: '✦', swift: '»', searing: '☀', longtrail: '～', magnet: '◎', novasurge: '✺', secondwind: '♥', golden: '◆' };
    ctx.fillText(glyphs[upgrade.id] || '✦', cx, cy + 10);
    ctx.font = "bold 19px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(upgrade.name, cx, rect.y + 116);
    ctx.font = "14px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.textDim;
    const words = upgrade.desc.split(' ');
    let line = '';
    let ly = rect.y + 142;
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 26) {
        ctx.fillText(line.trim(), cx, ly);
        ly += 19;
        line = word;
      } else {
        line += ' ' + word;
      }
    }
    if (line.trim()) ctx.fillText(line.trim(), cx, ly);
    ctx.font = "bold 13px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(`press ${key} or click`, cx, rect.y + rect.h - 16);
  }

  function drawUpgrade(state, ui) {
    ctx.fillStyle = 'rgba(4,6,18,0.66)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.font = "bold 40px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = '#fff7d6';
    ctx.shadowColor = '#ffc46b';
    ctx.shadowBlur = 20;
    ctx.fillText('CHOOSE A BLESSING', VIEW.width / 2, 190);
    ctx.shadowBlur = 0;
    ctx.font = "17px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(`Wave ${state.wave} cleared — score ${state.score} — one blessing carries into the next wave.`, VIEW.width / 2, 224);
    const rects = upgradeCardRects();
    const choices = state.pendingUpgrades || [];
    choices.forEach((u, i) => {
      const hover = ui.hoverCard === i;
      drawUpgradeCard(rects[i], u, String(i + 1), hover);
    });
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(4,6,18,0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.font = "bold 56px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = '#fff7d6';
    ctx.fillText('PAUSED', VIEW.width / 2, 340);
    ctx.font = "18px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('Press P or click to keep playing', VIEW.width / 2, 384);
  }

  function drawWin(state, best) {
    // Dawn sky: warm gold rising over the night.
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, '#2a1a5e');
    grad.addColorStop(0.45, '#7a3d7e');
    grad.addColorStop(0.75, '#ff9a3d');
    grad.addColorStop(1, '#ffe9a8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawGlow(glows.white, VIEW.width / 2, 480, 700, 0.5);
    ctx.textAlign = 'center';
    ctx.font = "bold 76px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = '#fffdf2';
    ctx.shadowColor = '#ff9a3d';
    ctx.shadowBlur = 30;
    ctx.fillText('DAWN BREAKS', VIEW.width / 2, 250);
    ctx.shadowBlur = 0;
    ctx.font = "italic 22px Georgia, 'Times New Roman', serif";
    ctx.fillStyle = '#fff3d6';
    ctx.fillText('The Long Night ends. Ten waves held — the light remains.', VIEW.width / 2, 296);
    ctx.font = "bold 30px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = '#fffdf2';
    ctx.fillText(`Score  ${state.score}`, VIEW.width / 2, 368);
    ctx.font = "17px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = '#ffe9c4';
    ctx.fillText(`${state.kills} shades cleansed  ·  ${state.embers} embers gathered  ·  Best ${Math.max(best, state.score)}`, VIEW.width / 2, 404);
    const btns = endButtonRects();
    for (const [key, label, sub] of [['again', 'PLAY AGAIN', 'R — a fresh night'], ['endless', 'ENDLESS NIGHT', 'E — waves without end']]) {
      const r = btns[key];
      roundRect(ctx, r.x, r.y, r.w, r.h, 14);
      ctx.fillStyle = 'rgba(20,10,40,0.72)';
      ctx.fill();
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = "bold 20px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = '#fff7d6';
      ctx.fillText(label, r.x + r.w / 2, r.y + 28);
      ctx.font = "13px 'Trebuchet MS', Verdana, sans-serif";
      ctx.fillStyle = '#ffe9c4';
      ctx.fillText(sub, r.x + r.w / 2, r.y + 50);
    }
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(4,5,16,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.font = "bold 64px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = '#ffb3bd';
    ctx.shadowColor = '#ff5d73';
    ctx.shadowBlur = 26;
    ctx.fillText('THE NIGHT CLAIMS YOU', VIEW.width / 2, 280);
    ctx.shadowBlur = 0;
    ctx.font = "20px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(`You fell on wave ${state.wave} — the dawn was ${Math.max(0, WAVES_TO_WIN - state.wave)} wave${WAVES_TO_WIN - state.wave === 1 ? '' : 's'} away.`, VIEW.width / 2, 326);
    ctx.font = "bold 32px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(`Score  ${state.score}`, VIEW.width / 2, 396);
    ctx.font = "17px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(`${state.kills} shades cleansed  ·  ${state.embers} embers gathered  ·  Best ${Math.max(best, state.score)}`, VIEW.width / 2, 432);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3);
    ctx.globalAlpha = pulse;
    ctx.font = "bold 24px 'Trebuchet MS', Verdana, sans-serif";
    ctx.fillStyle = '#fff7d6';
    ctx.fillText('PRESS R OR CLICK TO TRY AGAIN', VIEW.width / 2, 510);
    ctx.globalAlpha = 1;
  }

  function draw(state, screen, best, ui) {
    ctx.save();
    if (state.shake > 0.2) {
      const s = state.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    if (screen === SCREEN_WIN) {
      drawWin(state, best);
      ctx.restore();
      return;
    }
    drawSky(state.time);
    drawTrail(state);
    drawEmbers(state, state.time);
    drawBolts(state);
    for (const e of state.enemies) drawEnemy(e, state.time);
    if (!state.over) drawPlayer(state, state.time);
    drawParticles(state);
    drawFloaters(state);
    if (state.flash > 0) {
      ctx.globalAlpha = Math.min(0.5, state.flash);
      ctx.fillStyle = state.flashColor;
      ctx.fillRect(-20, -20, VIEW.width + 40, VIEW.height + 40);
      ctx.globalAlpha = 1;
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_UPGRADE || screen === SCREEN_PAUSED) {
      drawHUD(state, ui);
      drawBanner(state);
    }
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_UPGRADE) drawUpgrade(state, ui);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
    ctx.restore();
  }

  return { draw };
}
