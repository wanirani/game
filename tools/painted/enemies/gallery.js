// Painted-enemy gallery: every reference enemy in every state, painted vs vector (A/B), over a stage backdrop.
// Open tools/painted/enemies/gallery.html?ids=skeleton,bat[&t=1.2 freeze][&vec=1][&zoom=2][&bg=bg/s02_graveyard][&cellw=110&cellh=130][&noclip=1]
import { drawEnemy } from '../../../src/render/enemies.js';
import { ENEMIES } from '../../../src/data/enemies.js';
import { rigStats } from '../../../src/render/painted/enemy_kit.js';
import { game } from '../../../src/core/game.js';

const Q = new URLSearchParams(location.search);
const W = (d) => d.aiParams?.windup ?? 0.45;
// state presets per enemy: [label, fields]
export const CASES = {
  skeleton: (d) => [
    ['idle', { anim: 'idle' }], ['walk a', { anim: 'walk', tOff: 0.0 }], ['walk b', { anim: 'walk', tOff: 0.17 }],
    ['wind-up', { anim: 'attack', animT: W(d) * 0.7 }], ['strike', { anim: 'attack', animT: W(d) + 0.05 }], ['follow', { anim: 'attack', animT: W(d) + 0.2 }],
    ['hurt', { anim: 'walk', flashT: 0.11, stun: 0.2 }], ['stun', { anim: 'idle', stun: 0.18 }], ['air', { anim: 'idle', onGround: false }], ['dying', { anim: 'idle', dying: 0.15 }],
  ],
  armor_knight: (d) => CASES.skeleton(d),
  bat: () => [
    ['hang', { anim: 'hang', state: 'hang' }], ['fly a', { anim: 'fly', state: 'fly', tOff: 0 }], ['fly b', { anim: 'fly', state: 'fly', tOff: 0.03 }], ['fly c', { anim: 'fly', state: 'fly', tOff: 0.06 }],
    ['drop', { anim: 'fly', state: 'drop', stateT: 0.15 }], ['dive', { anim: 'fly', state: 'dive', vx: 200, vy: 180 }], ['hover', { anim: 'fly', state: 'hover' }],
    ['hurt', { anim: 'fly', state: 'fly', flashT: 0.11, stun: 0.2 }], ['dying', { anim: 'fly', dying: 0.15 }],
  ],
  ghost: () => [
    ['float a', { anim: 'fly', tOff: 0 }], ['float b', { anim: 'fly', tOff: 0.6 }], ['move', { anim: 'fly', vx: 60, vy: -10 }], ['lunge', { anim: 'fly', vx: 70, near: 1 }], ['fast', { anim: 'fly', vx: 160 }],
    ['hurt', { anim: 'fly', flashT: 0.11, stun: 0.2 }], ['dying', { anim: 'fly', dying: 0.2 }],
  ],
  gravedigger: (d) => [
    ['idle', { anim: 'idle' }], ['walk a', { anim: 'walk', tOff: 0 }], ['walk b', { anim: 'walk', tOff: 0.26 }],
    ['slam wind', { anim: 'slam', state: 'slam', animT: 0.5 }], ['slam hit', { anim: 'slam', state: 'slam', animT: 0.75 }], ['slam after', { anim: 'slam', state: 'slam', animT: 1.0 }],
    ['fling wind', { anim: 'fling', state: 'fling', animT: 0.35 }], ['fling out', { anim: 'fling', state: 'fling', animT: 0.58 }],
    ['hurt', { anim: 'walk', flashT: 0.11, stun: 0.2 }], ['dmg 50%', { anim: 'idle', hpK: 0.5 }], ['dmg 20%', { anim: 'idle', hpK: 0.2 }], ['dying', { anim: 'idle', dying: 0.15 }],
  ],

  // ── ART-ENEMY-3/4/5 (s07–s13): poses from each renderer's header (AI_B anims + wind-up times in aiParams) ──
  // s07 연금술 공방
  slime: () => [
    ['idle', { anim: 'idle' }], ['idle b', { anim: 'idle', tOff: 0.7 }], ['squash .5', A('squash', 0.18)], ['squash 1', A('squash', 0.34)],
    ['jump up', { anim: 'jump', state: 'jump', onGround: false, vx: 120, vy: -380 }], ['jump down', { anim: 'jump', state: 'jump', onGround: false, vx: 120, vy: 320 }],
    ['land', A('land', 0.08)], HURT('idle'), AIR('idle'), DIE('idle'),
  ],
  homunculus: (d) => [
    ['idle', { anim: 'idle' }], ...WALK(0.22), ['crouch .5', A('crouch', (d.aiParams?.crouch ?? 0.38) * 0.5)], ['crouch 1', A('crouch', (d.aiParams?.crouch ?? 0.38) * 0.95)],
    ['leap', { anim: 'leap', state: 'leap', onGround: false, vx: 420, vy: -120 }], ['land', A('land', 0.1)], HURT(), AIR('idle'), DIE('idle'),
  ],
  flesh_golem: (d) => BRUTE(d, 'slam'),
  plague_doctor: (d) => [
    ['idle', { anim: 'idle' }], ...WALK(0.45), ['throw wind', A('throw', W(d) * 0.5)], ['throw', A('throw', W(d) + 0.03)], ['throw after', A('throw', W(d) + 0.25)],
    ['hop', { ...A('hop', 0.12), onGround: false, vx: -160, vy: -200 }], HURT(), DIE('idle'),
  ],
  acid_turret: (d) => [
    ['idle', { anim: 'idle' }], ['idle b', { anim: 'idle', tOff: 0.5 }], ['charge .5', A('charge', (d.aiParams?.charge ?? 0.8) * 0.5)], ['charge 1', A('charge', (d.aiParams?.charge ?? 0.8) * 0.97)],
    ['fire', A('fire', 0.08)], ['fire b', A('fire', 0.3)], HURT('idle'), DIE('idle'),
  ],
  // s08 지하 수로
  merman: (d) => [
    ['lurk', A('lurk', 0.3)], ['rise .5', A('rise', 0.25)], ['leap', { anim: 'leap', state: 'leap', onGround: false, vy: -420 }], ['fall', { anim: 'fall', state: 'fall', onGround: false, vy: 320 }],
    ['idle', { anim: 'idle' }], ...WALK(0.39), ['spit .5', A('spit', (d.aiParams?.spit ?? 0.5) * 0.5)], ['spit', A('spit', (d.aiParams?.spit ?? 0.5) + 0.03)], HURT(), DIE('idle'),
  ],
  killer_fish: () => [
    ['swim', A('swim', 0.2)], ['swim b', { ...A('swim', 0.2), tOff: 0.4, vx: 80 }], ['ripple .5', A('ripple', 0.17)], ['ripple 1', A('ripple', 0.33)],
    ['leap up', { anim: 'leap', state: 'leap', vx: 120, vy: -620 }], ['leap down', { anim: 'leap', state: 'leap', vx: 120, vy: 480 }], HURT('leap'), DIE('leap'),
  ],
  frog_demon: (d) => [
    ['idle', { anim: 'idle' }], ['swell .5', A('swell', 0.22)], ['swell 1', A('swell', 0.43)],
    ['tongue ½', { ...A('tongue', 0.08), tongue: (d.aiParams?.tongue ?? 170) * 0.5, reach: 40 + (d.aiParams?.tongue ?? 170) * 0.5 }], ['tongue', { ...A('tongue', 0.15), tongue: d.aiParams?.tongue ?? 170, reach: 44 + (d.aiParams?.tongue ?? 170) }],
    ['jump up', { anim: 'jump', state: 'jump', onGround: false, vx: 140, vy: -380 }], ['jump down', { anim: 'jump', state: 'jump', onGround: false, vx: 140, vy: 300 }], ['land', A('land', 0.1)], HURT('idle'), DIE('idle'),
  ],
  drowned: (d) => [
    ['rise .3', A('rise', (d.aiParams?.riseTime ?? 1) * 0.3)], ['rise .7', A('rise', (d.aiParams?.riseTime ?? 1) * 0.7)], ['idle', { anim: 'idle' }], ...WALK(0.7),
    ['spew .5', A('spew', 0.27)], ['spew', { ...A('spew', 0.6), reach: 28 + (d.aiParams?.spew ?? 150) }], HURT(), DIE('idle'),
  ],
  water_spirit: () => [
    ['float', { anim: 'fly' }], ['float b', { anim: 'fly', tOff: 0.9 }], ['cast .5', A('cast', 0.3)], ['cast 1', A('cast', 0.58)], ['summon .5', A('summon', 0.17)], ['summon 1', A('summon', 0.33)], HURT('fly'), DIE('fly'),
  ],
  // s09 시계탑
  gear_golem: (d) => [
    ['idle', { anim: 'idle' }], ...WALK(0.63), ['punch wind', A('punch', W(d) * 0.6)], ['punch', { ...A('punch', W(d) + 0.04), reach: 132 }], ['punch after', A('punch', W(d) + 0.3)],
    ['throw wind', A('throw', 0.3)], ['throw', A('throw', 0.56)], HURT(), DIE('idle'),
  ],
  harpy: () => [
    ['fly a', { anim: 'fly', state: 'fly' }], ['fly b', { anim: 'fly', state: 'fly', tOff: 0.04 }], ['spread .5', A('spread', 0.25)], ['spread 1', A('spread', 0.48)], ['shoot', A('shoot', 0.1)],
    ['aim', A('aim', 0.3)], ['dive', { anim: 'dive', state: 'dive', vx: 300, vy: 360 }], ['climb', { anim: 'fly', state: 'climb', vy: -200 }], HURT('fly'), DIE('fly'),
  ],
  clockwork_soldier: (d) => [
    ['idle', { anim: 'idle' }], ...WALK(0.45), ['aim .4', { ...A('aim', (d.aiParams?.aim ?? 0.7) * 0.4), aimA: 0, aimLen: 150, reach: 182 }], ['aim lock', { ...A('aim', (d.aiParams?.aim ?? 0.7) * 0.95), aimA: -0.18, aimLen: 170, reach: 198 }],
    ['fire', A('fire', 0.08)], ['winddown', A('winddown', 0.6)], HURT(), DIE('idle'),
  ],
  cog_wheel: (d) => [
    ['roll', { anim: 'roll', state: 'roll', vx: 90, rot: 0.4 }], ['roll fast', { anim: 'roll', state: 'roll', vx: 360, rot: 1.3 }], ['wind .5', { ...A('wind', W(d) * 0.5), rot: 2 }], ['wind 1', { ...A('wind', W(d) * 0.95), rot: 2.6 }], HURT('roll'), DIE('roll'),
  ],
  // s10 얼음 첨탑
  ice_bat: () => [
    ['hang', { anim: 'hang', state: 'hang' }], ['fly a', { anim: 'fly', state: 'fly' }], ['fly b', { anim: 'fly', state: 'fly', tOff: 0.03 }], ['shiver .5', A('fly', 0.19, 'shiver')], ['shiver 1', A('fly', 0.37, 'shiver')],
    ['dive', { anim: 'fly', state: 'dive', vx: 200, vy: 180 }], HURT('fly'), DIE('fly'),
  ],
  snow_wolf: (d) => HOUND(d),
  frozen_knight: (d) => SWORD(d),
  frost_wraith: () => [
    ['float', { anim: 'fly' }], ['float b', { anim: 'fly', tOff: 0.8 }], ['cast .5', A('cast', 0.32)], ['cast 1', A('cast', 0.63)], ['vanish', { ...A('vanish', 0.15), alpha: 0.5 }], ['appear', { anim: 'fly', state: 'appear', stateT: 0.15, alpha: 0.5 }],
    HURT('fly'), DIE('fly'),
  ],
  // s11 타락한 예배당
  succubus: () => [
    ['fly a', { anim: 'fly', state: 'fly' }], ['fly b', { anim: 'fly', state: 'fly', tOff: 0.6 }], ['kiss .5', A('kiss', 0.27)], ['kiss 1', A('kiss', 0.53)], ['fold', A('fold', 0.3)],
    ['dive', { anim: 'dive', state: 'dive', vx: 320, vy: 300 }], ['climb', { anim: 'fly', state: 'climb', vy: -180 }], HURT('fly'), DIE('fly'),
  ],
  blood_priest: () => [
    ['idle', { anim: 'idle' }], ...WALK(0.5), ['cast raise', A('cast', 0.15)], ['cast held', A('cast', 0.6)], ['channel', A('channel', 0.4)], HURT(), DIE('idle'),
  ],
  bone_angel: () => [
    ['fly a', { anim: 'fly', state: 'fly' }], ['fly b', { anim: 'fly', state: 'fly', tOff: 0.5 }], ['raise .5', A('raise', 0.27)], ['raise 1', A('raise', 0.53)], ['aim', { ...A('aim', 0.3), aimA: 0.5 }],
    ['dive', { anim: 'dive', state: 'dive', vx: 300, vy: 340 }], ['climb', { anim: 'fly', state: 'climb', vy: -180 }], HURT('fly'), DIE('fly'),
  ],
  cursed_nun: (d) => [
    ['float', { anim: 'idle' }], ['float b', { anim: 'idle', tOff: 1.1 }], ['move', { anim: 'walk', state: 'walk', vx: 60 }],
    ['pray .3', A('pray', (d.aiParams?.pray ?? 0.9) * 0.33)], ['pray .6', A('pray', (d.aiParams?.pray ?? 0.9) * 0.67)], ['pray 1.2', A('pray', 1.2)], HURT('idle'), DIE('idle'),
  ],
  ice_golem: (d) => BRUTE(d, 'slam'),
  death_knight: (d) => ROW([...SWORD(d), ['dmg 50%', { anim: 'idle', hpK: 0.5 }], ['dmg 20%', { anim: 'idle', hpK: 0.2 }]], { reach: 82 }),
  // s12 왕좌의 방 · s13 심연
  bat_swarm: () => [
    ['fly a', { anim: 'fly', state: 'fly' }], ['fly b', { anim: 'fly', state: 'fly', tOff: 0.05, vx: 120 }], ['gather .5', A('gather', 0.25)], ['gather 1', A('gather', 0.48)],
    ['charge', { ...A('charge', 0.2), vx: 420 }], HURT('fly'), DIE('fly'),
  ],
  royal_guard: () => ROW([   // the upright halberd stands ~150 px over the feet
    ['idle', { anim: 'idle' }], ...WALK(0.48), ['sweep wind', { ...A('sweep', 0.4), reachL: 74, rise: 176 }], ['sweep', { ...A('sweep', 0.66), reach: 134 }], ['sweep after', { ...A('sweep', 0.9), reach: 124 }],
    ['thrust high', { ...A('thrust', 0.4), high: true, reach: 120 }], ['thrust high!', { ...A('thrust', 0.58), high: true, reach: 206 }], ['thrust low!', { ...A('thrust', 0.58), high: false, reach: 204 }], HURT(), DIE('idle'),
  ], { rise: 160 }),
  hellhound: (d) => [...HOUND(d), ['breath .5', A('breath', (d.aiParams?.breath ?? 0.5) * 0.5)], ['breath', { ...A('breath', (d.aiParams?.breath ?? 0.5) + 0.1), reach: 92 }]],
  shadow_hunter: () => [
    ['idle', { heroAnim: 'idle', heroAnimT: 0.3 }], ['run', { heroAnim: 'run', heroAnimT: 0.2, vx: 230 }], ['run b', { heroAnim: 'run', heroAnimT: 0.45, vx: 230 }],
    ['jump', { heroAnim: 'jump', heroAnimT: 0.1, onGround: false, vy: -300 }], ['fall', { heroAnim: 'fall', heroAnimT: 0.1, onGround: false, vy: 300 }],
    ['dash', { heroAnim: 'dash', heroAnimT: 0.05, dashT: 0.12, vx: 520 }], ['hurt', { heroAnim: 'idle', flashT: 0.11, stun: 0.2 }], ['dying', { heroAnim: 'idle', dying: 0.2 }],
  ],
  vampire_bride: () => [
    ['float', { anim: 'float' }], ['move', { anim: 'move', vx: 110 }], ['scream .5', A('scream', 0.3)], ['scream 1', A('scream', 0.58)], ['gather', A('gather', 0.3)],
    ['mist', { ...A('mist', 0.25), vx: 380 }], ['claw wind', A('claw', 0.15)], ['claw', A('claw', 0.28)], HURT('float'), DIE('float'),
  ],
  chaos_spawn: () => [
    ['idle', { anim: 'idle' }], ...WALK(0.3), ['swell .5', A('swell', 0.3)], ['swell 1', A('swell', 0.58)], ['leap', { anim: 'leap', state: 'leap', onGround: false, vx: 200, vy: -260 }], HURT('idle'), DIE('idle'),
  ],
  abyss_eye: (d) => [
    ['idle', { anim: 'idle' }], ['idle b', { anim: 'idle', tOff: 1.3 }], ['aim .5', A('aim', (d.aiParams?.aim ?? 1.1) * 0.5)], ['aim 1', A('aim', (d.aiParams?.aim ?? 1.1) * 0.95)],
    ['fire', A('fire', 0.3)], ['recover', A('recover', 0.3)], HURT('idle'), DIE('idle'),
  ],
  void_demon: () => [
    ['float', { anim: 'float' }], ['float b', { anim: 'float', tOff: 1.2 }], ['cast .5', { ...A('cast', 0.3), reach: 84 }], ['cast 1', { ...A('cast', 0.58), reach: 84 }], ['rift', { ...A('rift', 0.4), rise: 136 }], ['blink', { ...A('blink', 0.2), alpha: 0.5 }],
    ['claw wind', A('claw', 0.3)], ['claw', { ...A('claw', 0.44), reach: 76 }], ['dmg 50%', { anim: 'float', hpK: 0.5 }], ['dmg 20%', { anim: 'float', hpK: 0.2 }], HURT('float'), DIE('float'),
  ],
  demon_lord: (d) => ROW([   // the flaming greatsword reaches ~125 px ahead even at rest
    ['idle', { anim: 'idle' }], ...WALK(0.63), ['swing wind', { ...A('swing', W(d) * 0.65), reachL: 80, rise: 208 }], ['swing', { ...A('swing', W(d) + 0.03), reach: 156, rise: 170 }], ['swing after', { ...A('swing', W(d) + 0.4), reach: 148 }],
    ['fireball .5', A('fireball', 0.28)], ['fireball 1', A('fireball', 0.54)], ['hellfire', A('hellfire', 0.3)], ['dmg 50%', { anim: 'idle', hpK: 0.5 }], ['dmg 20%', { anim: 'idle', hpK: 0.2 }], HURT(), DIE('idle'),
  ], { reach: 134, reachL: 68 }),
};
/** pose held at t s into an anim: animT = stateT = t (state defaults to the anim name, as the AIs set it) */
function A(anim, t, state = anim) { return { anim, state, animT: t, stateT: t }; }
function HURT(anim = 'walk') { return ['hurt', { anim, flashT: 0.11, stun: 0.2 }]; }
function AIR(anim = 'idle') { return ['air', { anim, onGround: false }]; }
function DIE(anim = 'idle') { return ['dying', { anim, dying: 0.15 }]; }
function WALK(off) { return [['walk a', { anim: 'walk', state: 'walk', vx: 60 }], ['walk b', { anim: 'walk', state: 'walk', vx: 60, tOff: off }]]; }
/** row-wide cell extents (reach / reachL / rise, logical px) as defaults under each case's own fields */
function ROW(cases, ext) { return cases.map(([label, f]) => [label, { ...ext, ...f }]); }
/** AI_B.brute (flesh_golem, ice_golem): idle / walk / slam wind-up → hit → recovery */
function BRUTE(d, atk) {
  const w = W(d);
  // extents from measure.mjs (flesh_golem winds the fist back ~85 px, ice_golem's slam lands ~83 px ahead)
  return [['idle', { anim: 'idle' }], ...WALK(0.6), [`${atk} wind`, { ...A(atk, w * 0.5), reach: 86, reachL: 96 }], [`${atk} top`, { ...A(atk, w * 0.95), reachL: 82, rise: 132 }],
    [atk, { ...A(atk, w + 0.05), reach: 96 }], [`${atk} after`, { ...A(atk, w + 0.45), reach: 84 }], HURT(), AIR(), DIE('idle')];
}
/** AI_B.swordsman (frozen_knight, death_knight): guard, the combo cuts (comboI), counter */
function SWORD(d) {
  // extents from measure.mjs: the held sword ends ~70 px ahead, the wind-up ~90 px behind, cut arcs ~100 px ahead and up to ~170 px high
  const w = W(d), n = d.aiParams?.combo ?? 2, out = [['idle', { anim: 'idle' }], ...WALK(0.5), ['guard', { anim: 'guard', state: 'guard', rise: 132 }]];
  out.push(['cut 1 wind', { ...A('slash', w * 0.6), comboI: 0, reachL: 98 }], ['cut 1', { ...A('slash', w + 0.04), comboI: 0, reach: 112 }]);
  for (let i = 1; i < n; i++) out.push([`cut ${i + 1}`, { ...A('slash', 0.34), comboI: i, reach: 116, rise: 176 }]);
  out.push(['counter', { ...A('slash', 0.29), counter: true, comboI: 0, reach: 112 }], HURT(), AIR(), DIE('idle'));
  return ROW(out, { reach: 82 });
}
/** AI.charger (snow_wolf, hellhound): wind (growl) → charge gallop, crouch (anim 'wind' in state 'crouch') → leap */
function HOUND(d) {
  return [
    ['idle', { anim: 'idle' }], ...WALK(0.35), ['wind', A('wind', W(d) * 0.7)], ['charge a', { anim: 'charge', state: 'charge', vx: 420 }], ['charge b', { anim: 'charge', state: 'charge', vx: 420, tOff: 0.1 }],
    ['crouch', A('wind', 0.2, 'crouch')], ['leap up', { anim: 'leap', state: 'leap', onGround: false, vx: 300, vy: -380 }], ['leap down', { anim: 'leap', state: 'leap', onGround: false, vx: 300, vy: 300 }],
    HURT(), AIR(), DIE('idle'),
  ];
}
/** default stage backdrop per enemy (the gallery's ?bg= overrides) */
const STAGE_OF = {
  slime: 's07_alchemy', homunculus: 's07_alchemy', flesh_golem: 's07_alchemy', plague_doctor: 's07_alchemy', acid_turret: 's07_alchemy',
  merman: 's08_waterway', killer_fish: 's08_waterway', frog_demon: 's08_waterway', drowned: 's08_waterway', water_spirit: 's08_waterway',
  gear_golem: 's09_clocktower', harpy: 's09_clocktower', clockwork_soldier: 's09_clocktower', cog_wheel: 's09_clocktower',
  ice_bat: 's10_spire', snow_wolf: 's10_spire', frozen_knight: 's10_spire', frost_wraith: 's10_spire', ice_golem: 's10_spire',
  succubus: 's11_chapel', blood_priest: 's11_chapel', bone_angel: 's11_chapel', cursed_nun: 's11_chapel', death_knight: 's11_chapel',
  bat_swarm: 's12_throne', royal_guard: 's12_throne', hellhound: 's12_throne', vampire_bride: 's12_throne',
  shadow_hunter: 's13_abyss', chaos_spawn: 's13_abyss', abyss_eye: 's13_abyss', void_demon: 's13_abyss', demon_lord: 's13_abyss',
};

const ids = (Q.get('ids') ?? 'skeleton').split(',');
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const vecBox = document.getElementById('vec'), zoomR = document.getElementById('zoom');
if (Q.get('vec')) vecBox.checked = true;
if (Q.get('zoom')) zoomR.value = Q.get('zoom');
game.scale = Number(Q.get('td') ?? 2);          // texel density the rigs are baked at
const bg = new Image(); bg.src = `assets/${Q.get('bg') ?? (STAGE_OF[ids[0]] ? 'bg/' + STAGE_OF[ids[0]] : 'bg/s01_village')}.webp`;
const rows = ids.map((id) => {
  const d = ENEMIES[id];
  const cases = (CASES[id] ?? CASES.skeleton)(d);
  return { id, d, cases: cases.map(([label, f]) => ({ label, f, e: mkEnt(d, f) })) };
});
function mkEnt(d, f) {
  return {
    def: d, id: d.id, t: 0, anim: 'idle', animT: 0, state: 'idle', stateT: 0, flashT: 0, stun: 0, dying: 0, params: { ...(d.aiParams || {}) },
    facing: 1, scale: 1, elite: false, vx: 0, vy: 0, alpha: 1, onGround: !d.flying, hp: 1, stats: { maxHp: 1 },
    w: d.size?.w ?? 40, h: d.size?.h ?? 60, cx: 0, bottom: 0, x: 0, y: 0, ...f,
  };
}
const T0 = performance.now();
// default cell size grows with the tallest enemy on the sheet (T3 bodies are ~100 px tall; ?cellw= / ?cellh= override)
const maxH = Math.max(...rows.map((r) => r.d.size?.h ?? 40));
const CELL_W = Number(Q.get('cellw') ?? Math.max(110, Math.ceil(maxH * 1.15))), CELL_H = Number(Q.get('cellh') ?? Math.max(130, Math.ceil(maxH * 1.3 + 16)));
// a case may reach past half a cell (tongue, laser sight, halberd, spew, sword arc): fields reach / reachL / rise = logical px
// the pose needs right / left of the enemy's centre and above its feet (values from measure.mjs + a margin for glows) → that
// cell is widened (the enemy sits reachL from its left edge) and the row made taller. Every cell is clipped to its own
// rectangle so a long pose never paints over its neighbours (?noclip=1 turns clipping off to see the full overhang)
const CLIP = !Q.get('noclip');
let sheetH = 0;
for (const r of rows) {
  let x = 0;
  for (const c of r.cases) {
    const L = Math.max(CELL_W / 2, Number(c.f.reachL) || 0), R = Math.max(CELL_W / 2, Number(c.f.reach) || 0);
    c.x = x; c.L = L; c.w = Math.ceil(L + R); x += c.w;
  }
  r.w = x;
  r.h = Math.max(CELL_H, ...r.cases.map((c) => Math.ceil((Number(c.f.rise) || 0) + 30)));   // 16 px floor strip + label room
  r.y = sheetH; sheetH += r.h;
}
const SHEET_W = Math.max(...rows.map((r) => r.w));
function frame() {
  const z = Number(zoomR.value);
  const dpr = window.devicePixelRatio || 1;
  const W_ = Math.ceil(SHEET_W * z + 20), H_ = Math.ceil(sheetH * z + 20);
  if (cv.width !== W_ * dpr) { cv.width = W_ * dpr; cv.height = H_ * dpr; cv.style.width = W_ + 'px'; cv.style.height = H_ + 'px'; }
  globalThis.__paintedEnemies = !vecBox.checked;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#120c14'; ctx.fillRect(0, 0, W_, H_);
  if (bg.complete && bg.naturalWidth) { ctx.globalAlpha = 0.85; ctx.drawImage(bg, 0, 0, W_, W_ * bg.naturalHeight / bg.naturalWidth); ctx.globalAlpha = 1; }
  const t = Q.get('t') ? Number(Q.get('t')) : (performance.now() - T0) / 1000;
  rows.forEach((r) => r.cases.forEach((c) => {
    const e = c.e, f = c.f, cw = c.w, cellH = r.h;
    e.t = t + (f.tOff ?? 0);
    if (f.animT === undefined && !Q.get('t')) e.animT = e.t % 2;
    if (f.hpK) { e.hp = f.hpK; e.stats.maxHp = 1; }
    const x0 = 10 + c.x * z, y0 = 10 + r.y * z;
    ctx.save();
    ctx.translate(x0, y0); ctx.scale(z, z);
    if (CLIP) { ctx.beginPath(); ctx.rect(0, 0, cw, cellH); ctx.clip(); }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(2, 2, cw - 4, cellH - 4);
    ctx.fillStyle = 'rgba(40,30,20,0.6)'; ctx.fillRect(2, cellH - 16, cw - 4, 14);
    e.cx = c.L; e.bottom = r.d.flying ? cellH * 0.55 + (r.d.size?.h ?? 40) / 2 : cellH - 16;
    try { drawEnemy(ctx, e, null); } catch (err) { console.error(r.id, c.label, err); }
    ctx.fillStyle = '#ffd98a'; ctx.font = '9px sans-serif'; ctx.fillText(`${r.id} · ${c.label}`, 5, 11);
    ctx.restore();
  }));
  document.getElementById('info').textContent = JSON.stringify(rigStats());
  window.__galleryReady = Object.values(rigStats()).every((s) => s.ready || s.failed) && Object.keys(rigStats()).length > 0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
