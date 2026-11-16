// DAWNWISP — tuning, palette and upgrade definitions. One job: every number the
// game balances on lives here, so tuning never means hunting through logic.
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const BEST_KEY = 'dawnwisp-best';
export const WAVES_TO_WIN = 10;
export const NOVA_RADIUS = 340;
export const NOVA_BASE_DAMAGE = 260;

export const PALETTE = {
  skyTop: '#070a1e',
  skyMid: '#12163a',
  skyBottom: '#241a4d',
  auroraTeal: '#4df0c0',
  auroraGreen: '#7dff8a',
  auroraViolet: '#9d7bff',
  auroraPink: '#ff7ad9',
  gold: '#ffc46b',
  goldDeep: '#ff9a3d',
  wispCore: '#fff7d6',
  shadeBody: '#17112e',
  shadeRim: '#7a5cff',
  shadeEye: '#c9a6ff',
  danger: '#ff5d73',
  ember: '#ffcf6e',
  text: '#f4f1ff',
  textDim: '#b9b3d9',
};

export const PLAYER = {
  radius: 14,
  speed: 280,
  maxHp: 3,
  // The aura is a weak deterrent, not a kill zone: a shade crossing it takes
  // 14 damage a second and survives to reach the wisp. The TRAIL is the
  // weapon — shades that chase the wisp along its glowing trail burn fast.
  // Standing still is fatal; painting light while moving is how you survive.
  auraRadius: 102,
  auraDps: 38,
  trailLife: 1.4,
  trailDps: 30,
  trailTick: 0.05,
  magnetRadius: 70,
  invulnSeconds: 1.2,
  novaChargePerEmber: 0.055,
};

// Enemy kinds: hp, speed, radius, score, body colour, rim colour.
export const ENEMIES = {
  shade: { hp: 30, speed: 72, radius: 17, score: 10, body: '#17112e', rim: '#7a5cff', eye: '#c9a6ff' },
  darter: { hp: 16, speed: 148, radius: 13, score: 15, body: '#101a33', rim: '#4dd7ff', eye: '#bdf3ff' },
  bulwark: { hp: 130, speed: 40, radius: 30, score: 25, body: '#1c1030', rim: '#b06bff', eye: '#ffd6ff' },
  spitter: { hp: 26, speed: 56, radius: 15, score: 20, body: '#2a1030', rim: '#ff7ad9', eye: '#ffc2ec' },
  wraith: { hp: 42, speed: 112, radius: 15, score: 30, body: '#0e1428', rim: '#8fb7ff', eye: '#eaf2ff' },
  boss: { hp: 950, speed: 44, radius: 48, score: 500, body: '#120a24', rim: '#ff5d73', eye: '#ff2e4d' },
};

export const BOSS_HP_WAVE_10 = 1600;

// Wave composition: how many of each kind join the spawn queue of wave n.
export function waveMix(wave) {
  const mix = { shade: 10 + 4 * wave, darter: 0, spitter: 0, bulwark: 0, wraith: 0 };
  if (wave >= 2) mix.darter = 2 + wave;
  if (wave >= 3) mix.spitter = 1 + Math.floor(wave / 2);
  if (wave >= 4) mix.bulwark = Math.floor(wave / 2);
  if (wave >= 7) mix.wraith = wave - 5;
  return mix;
}

export function spawnInterval(wave) {
  return Math.max(0.32, 1.05 - wave * 0.06);
}

// Upgrade pool: id, name, description, and the stat it changes (applied in world.js).
export const UPGRADES = [
  { id: 'radiant', name: 'Radiant Aura', desc: '+30 light radius. Your glow reaches further.' },
  { id: 'swift', name: 'Swift Wisp', desc: '+18% move speed. Outrun the dark.' },
  { id: 'searing', name: 'Searing Light', desc: '+30% aura damage. Shades melt faster.' },
  { id: 'longtrail', name: 'Long Trail', desc: '+0.8s trail life, +15 trail damage.' },
  { id: 'magnet', name: 'Ember Magnet', desc: '+90% ember pickup radius.' },
  { id: 'novasurge', name: 'Nova Surge', desc: '+60% Nova damage, Nova costs 20% less.' },
  { id: 'secondwind', name: 'Second Wind', desc: '+1 max heart and heal 1 heart now.' },
  { id: 'golden', name: 'Golden Embers', desc: 'Embers are worth double score and charge Nova 50% faster.' },
];
