// WORLD: Eshville, the village at the centre of the valley - tonight (1797, 'now') and that night (1697, 'past'). docs/v2/AREA_FORMAT.md, GDD 3 / 9.1.
// One layout function for both eras: floors, building footprints, walls, spawns and exits are the SAME numbers.
// What differs: dressing (burning ruins and wreckage | thatch, harvest stalls, plague posts), lights, people, enemies, sky/fog/moon.
//   outskirts (x -60..1500) -> main street (1500..3300) -> square with the well (3300..4700, z 0..900)
//   -> church front + bell tower door (z 900..1770)   and the graveyard road (x 4480..4700, z 900..1300)
import { D, house, inChunk, rect } from './gen.js';

const BLACK = [0.14, 0.13, 0.16], RED = [0.62, 0.12, 0.14], BLUE = [0.2, 0.26, 0.5];
const FIRE = (r = 420, i = 2.0) => ({ r, i, y: 30, c: [1, 0.5, 0.2] });

/** flags (docs/v2/AREA_FORMAT.md 13): now - door_pulled · gate_open · promise · elise_home · bells_answered; past - past_gate_open · past_street_clear */
export function eshville(era, flags = {}) {
  const now = era === 'now', past = !now, out = now && !!flags.bells_answered, gateOpen = !!(now ? flags.gate_open : flags.past_gate_open), P = [], anchors = [], enemies = [], actors = [], interact = [], triggers = [];
  const add = (chunk, ...parts) => P.push(...inChunk(chunk, parts.flat()));
  // the generated lantern post has its origin under the post and its arm toward +x; x - 20 keeps the post where the first pack (origin under the middle of the model) showed it
  const LAMP = (x, z, o = {}) => (now ? { t: 'prop', mesh: 'lamp', h: 196, solid: 9, solidZ: 9, light: { r: 330, i: 1.6, y: 170 }, x, z, ...o } : { t: 'prop', mesh: 'lanternpost', h: 190, solid: 9, solidZ: 9, light: { r: 300, i: 1.5, y: 130, c: [1, 0.7, 0.36] }, flicker: true, code: !(z >= 264 && z <= 280), x: z >= 264 && z <= 280 ? x - 20 : x, z, ...o });   // generated lantern post against the house fronts; the thin code-built one where the hero can walk behind it (the thick post hid him: world_verify_node)
  const fire = (chunk, id, x, y, z, w, h, lr = 420) => { if (out) { if (w > 100) anchors.push({ id: id + '_smoke', kind: 'smoke', x, y, z, size: 1 }); return; } add(chunk, { t: 'deco', mesh: 'fire', x, y, z, w, h, n: Math.max(4, Math.round(w / 18)), light: FIRE(lr, 1.9) }); anchors.push({ id, kind: 'fire', x, y, z, size: +(h / 70).toFixed(2), light: true }); };

  // ───────────── ground ─────────────
  add('out', { t: 'floor', x: -60, z: 0, w: 1560, d: 300, mat: 'dirt', kit: { mat: 'cobworn', cell: 44, rag: 44, strips: [{ z0: 0, z1: 56, mat: 'soil' }, { z0: 232, z1: 300, mat: 'soil' }] } });
  add('street', { t: 'floor', x: 1500, z: 0, w: 1800, d: 300, mat: 'cobble', kit: { cell: 44, rag: 30, strips: [{ z0: 104, z1: 196, mat: 'cobworn' }, { z0: 0, z1: 16, mat: 'flags' }] } },
    { t: 'pave', x: 1500, z: 280, w: 1800, d: 20, h: 7, kerb: 'F' });
  add('east', { t: 'floor', x: 3300, z: 0, w: 1400, d: 900, mat: 'cobble', kit: { mat: 'cobble2', cell: 50, rag: 38, strips: [{ x0: 470, x1: 730, z0: 320, z1: 580, mat: 'flags' }, { x0: 520, x1: 680, z0: 580, z1: 900, mat: 'flags' }, { x0: 0, x1: 470, z0: 104, z1: 196, mat: 'cobworn' }, { x0: 1180, x1: 1400, z0: 560, z1: 900, mat: 'cobworn' }] } });
  add('east', { t: 'floor', x: 3660, z: 900, w: 480, d: 200, mat: 'stone', kit: { mat: 'flags', rag: 26, strips: [{ x0: 0, x1: 110, mat: 'cobble2' }, { x0: 370, x1: 480, mat: 'cobble2' }] } },
    { t: 'stairs', x: 3660, z: 1100, w: 480, d: 150, h: 84, dir: 'z+', steps: 7, mat: 'stone', kit: { cheeks: 'LR' } },
    { t: 'floor', x: 3460, z: 1250, w: 880, d: 400, y: 84, thick: 330, mat: 'stone', kit: { mat: 'flags', rag: 30, strips: [{ z0: 0, z1: 60, mat: 'cobble2' }, { x0: 0, x1: 150, z0: 60, z1: 400, mat: 'cobble2' }, { x0: 730, x1: 880, z0: 60, z1: 400, mat: 'cobble2' }] } },
    { t: 'floor', x: 3300, z: 990, w: 316, d: 260, mat: 'dirt', walk: false, kit: { mat: 'soil', cell: 60 } },
    { t: 'floor', x: 4184, z: 990, w: 256, d: 260, mat: 'dirt', walk: false, kit: { mat: 'soil', cell: 60 } });
  add('east', { t: 'floor', x: 4480, z: 900, w: 220, d: 600, mat: 'dirt', kit: { mat: 'cobworn', rag: 34, strips: [{ x0: 0, x1: 50, z0: 120, mat: 'soil' }, { x0: 170, x1: 220, z0: 120, mat: 'soil' }] } });
  add('out', { t: 'blocker', x: -60, z: -60, w: 4900, d: 60, y: -400, h: 1200 }, { t: 'blocker', x: 4480, z: 1500, w: 220, d: 40, y: -400, h: 1200 });

  // ───────────── boundary walls ─────────────
  add('out', { t: 'wall', x: -160, z: -60, w: 100, d: 450, h: 280, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', cell: 64, faces: 'R', gates: [{ side: 'R', u: 210, w: 130, h: 200 }], buttress: [{ side: 'R', u: 90, h: 220, d: 18 }, { side: 'R', u: 330, h: 220, d: 18 }], battlement: true } });
  add('east', { t: 'wall', x: 3200, z: 390, w: 100, d: 510, h: 300, mat: 'facade', kit: { style: 'stone', faces: 'R', quoins: true, courses: [156], windows: [130, 300, 440].flatMap((u, i) => [{ side: 'R', u, y: 70, w: 42, h: 66, lit: [0.7, 0, 0.5][i] * (now ? 0.6 : 1), shutters: i === 1 }, { side: 'R', u, y: 184, w: 40, h: 66, arch: 'round', lit: [0, 0.6, 0][i] }]), hang: [{ type: 'banner', side: 'R', u: 215, y: 66, len: 96, w: 36, c: past ? BLACK : BLUE }] } },
    { t: 'roof', x: 3200, z: 390, w: 100, d: 510, y: 300, h: 50, kit: { gable: 'ashlar', chimney: 'fieldstone' } },
    { t: 'wall', x: 4700, z: -60, w: 100, d: 1560, h: 330, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', cell: 70, faces: 'L', battlement: true, buttress: [200, 520, 840, 1160, 1440].map((u) => ({ side: 'L', u, h: 250, d: 22, w: 40 })), hang: [{ type: 'banner', side: 'L', u: 1050, y: 110, len: 120, w: 44, c: past ? BLACK : RED }, { type: 'sconce', side: 'L', u: 700, y: 150 }] } });
  add('east', { t: 'wall', x: 3200, z: 900, w: 100, d: 800, h: 260, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', cell: 70, faces: 'R', battlement: true, buttress: [150, 420, 690].map((u) => ({ side: 'R', u, h: 200, d: 20 })) } },
    { t: 'wall', x: 3616, z: 990, w: 44, d: 260, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FR', coping: true, rail: 'R', piers: 130 } },
    { t: 'wall', x: 4140, z: 990, w: 44, d: 260, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FL', coping: true, rail: 'L', piers: 130 } },
    { t: 'wall', x: 3460, z: 1250, w: 200, d: 30, y: 84, h: 44, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'F', coping: true, rail: 'F', piers: 100 } },
    { t: 'wall', x: 4140, z: 1250, w: 200, d: 30, y: 84, h: 44, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'F', coping: true, rail: 'F', piers: 100 } },
    { t: 'wall', x: 3400, z: 1250, w: 60, d: 400, h: 150, collideH: 900, mat: 'facade', kit: { style: 'stone', faces: 'FR', coping: true, cornice: false } },
    { t: 'wall', x: 4340, z: 1250, w: 100, d: 400, h: 150, collideH: 900, mat: 'facade', kit: { style: 'stone', faces: 'FL', coping: true, cornice: false } },
    { t: 'wall', x: 4440, z: 990, w: 40, d: 510, h: 120, collideH: 800, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'FR', coping: true, cornice: false } });

  // ───────────── houses (same footprints in both eras) ─────────────
  add('out',
    house({ x: -60, z: 300, w: 420, h: now ? 210 : 190, style: 'rubble', seed: 11, burnt: now, cold: out, lit: 0.5, roofMat: 'thatch', kit: { lower: 'fieldstone' } }),
    house({ x: 360, z: 300, w: 160, h: now ? 96 : 150, style: now ? 'rubble' : 'plaster', seed: 12, burnt: now, cold: out, door: false, lit: 0.6, roofMat: 'thatch', kit: now ? { lower: 'fieldstone', windows: [] } : {} }),
    house({ x: 520, z: 300, w: 440, h: 300, style: 'timber', seed: 13, lit: now ? 0.12 : 0.6, roofMat: past ? 'thatch' : undefined, banner: past ? BLACK : null }),
    house({ x: 960, z: 300, w: 540, h: now ? 230 : 240, style: 'stone', seed: 14, burnt: now, cold: out, lit: 0.55, sconce: past, roofMat: past ? 'thatch' : undefined }));   // 1697: every roof west of the square is thatch (one roof material per chunk = one draw call less)
  add('street',
    house({ x: 1500, z: 300, w: 580, h: now ? 340 : 300, style: 'timber', seed: 21, base: 7, lit: 0.85, door: 300, sign: true, sconce: true, shop: true, roofMat: past ? 'thatch' : undefined }),   // inn (now) / small tavern (past)
    house({ x: 2080, z: 300, w: 380, h: now ? 280 : 250, style: 'stone', seed: 22, base: 7, lit: now ? 0.15 : 0.5, door: 190, doorOpt: now && flags.door_pulled ? { open: true } : {}, banner: past ? BLACK : BLUE, roofMat: past ? 'thatch' : undefined }),                                  // the house with the trapped villager
    house({ x: 2460, z: 300, w: 460, h: 250, style: 'rubble', seed: 23, base: 7, lit: 0.7, door: 120, shop: true, sign: { c: [0.3, 0.2, 0.16] }, roofMat: past ? 'thatch' : undefined, roofKit: { chimneys: [{ u: 330, t: 0.7, w: 44, h: 60 }] }, kit: { lower: 'fieldstone' } }),   // smithy
    house({ x: 2920, z: 300, w: 380, h: now ? 320 : 280, style: past ? 'plaster' : 'timber', seed: 24, base: 7, lit: now ? 0.3 : 0.6, faces: 'FR', roofMat: past ? 'thatch' : undefined, kit: { jettySides: 'F' } }));
  add('east',
    house({ x: 3300, z: 900, w: 360, h: 300, style: 'timber', seed: 31, lit: now ? 0.3 : 0.7, faces: 'FR', sconce: true, kit: { jettySides: 'F' } }),
    house({ x: 4140, z: 900, w: 340, h: 320, style: 'stone', seed: 32, lit: now ? 0.25 : 0.6, faces: 'FLR', banner: past ? BLACK : RED }));
  // ───────────── church + bell tower ─────────────
  const NAVE = (x, seed) => ({ t: 'wall', x, z: 1650, w: 300, d: 120, y: 84, h: 400, mat: 'facade', kit: { style: 'stone', cell: 56, faces: 'F', plinth: 34, courses: [330], quoins: true, tint: [0.98, 0.98, 1.04],
    windows: [{ u: 90, y: 100, w: 54, h: 200, arch: 'point', lit: seed ? 0.8 : 0.6, rows: 4 }, { u: 210, y: 100, w: 54, h: 200, arch: 'point', lit: seed ? 0.55 : 0.85, rows: 4 }],
    buttress: [{ u: 16, h: 300, d: 24, w: 34 }, { u: 150, h: 300, d: 24, w: 34 }, { u: 284, h: 300, d: 24, w: 34 }], hang: past ? [{ type: 'banner', u: 150, y: 150, len: 120, w: 40, c: BLACK }] : [] } });
  add('east', NAVE(3460, 0), NAVE(4040, 1),
    { t: 'roof', x: 3460, z: 1650, w: 300, d: 120, y: 484, h: 96, kit: { gable: 'ashlar' } }, { t: 'roof', x: 4040, z: 1650, w: 300, d: 120, y: 484, h: 96, kit: { gable: 'ashlar' } },
    { t: 'wall', x: 3760, z: 1622, w: 280, d: 148, y: 84, h: 700, mat: 'facade', kit: { style: 'stone', cell: 60, faces: 'FLR', plinth: 40, courses: [250, 470, 640], quoins: true, battlement: true, tint: [1.0, 1.0, 1.05],
      doors: [{ u: 140, w: 96, h: 160, arch: 'point' }],
      windows: [{ u: 140, y: 290, w: 64, h: 130, arch: 'point', lit: 0.75, rows: 3, cols: 2 }, { u: 86, y: 510, w: 46, h: 100, arch: 'point', rows: 1, cols: 1 }, { u: 194, y: 510, w: 46, h: 100, arch: 'point', rows: 1, cols: 1 }],
      buttress: [{ u: 18, h: 420, d: 26, w: 36 }, { u: 262, h: 420, d: 26, w: 36 }], hang: [{ type: 'sconce', u: 62, y: 150 }, { type: 'sconce', u: 218, y: 150 }] } },
    { t: 'roof', x: 3760, z: 1622, w: 280, d: 148, y: 784, h: 170, kit: { gable: 'ashlar' } });

  // ───────────── props that stand in both eras (same spots) ─────────────
  add('street', LAMP(1760, 266), LAMP(2500, 266), LAMP(3130, 266), LAMP(2300, 8, { solid: 0 }),
    { t: 'fence', kind: 'iron', x0: 1860, z0: 5, x1: 2180, z1: 5, h: 44 }, { t: 'fence', kind: 'iron', x0: 2700, z0: 5, x1: 3020, z1: 5, h: 44 },
    { t: 'prop', mesh: 'brazier', h: 112, solid: 30, solidZ: 24, x: 2700, z: 262, light: { r: 380, i: 1.8, y: 90, c: [1, 0.55, 0.22] } });   // (BREAK: the barrel that stood at 2420, 264 is a breakable now - see breakables below)
  add('out', LAMP(now ? 620 : 640, 262, now ? { mesh: 'lanternpost', lit: false, light: null, h: 190 } : {}), LAMP(1380, 8, { solid: 0 }),
    { t: 'fence', kind: 'wood', x0: 80, z0: 6, x1: 420, z1: 6, h: 50 }, { t: 'fence', kind: 'wood', x0: 860, z0: 6, x1: 1240, z1: 6, h: 50 },
    { t: 'prop', mesh: 'deadtree', x: 20, z: 258, h: 300, solid: 56, solidZ: 40, solidH: 240 });   // the footprint covers the root flare (162 x 149 at this size): the hero walked 65 units over the roots
  add('east', { t: 'prop', mesh: 'well', x: 3900, z: 450, h: 132, solid: 46, solidZ: 30 },
    LAMP(3520, 300), LAMP(4280, 300), LAMP(3440, 800), LAMP(4420, 660),
    { t: 'fence', kind: 'iron', x0: 3500, z0: 5, x1: 3820, z1: 5, h: 44 }, { t: 'fence', kind: 'iron', x0: 4100, z0: 5, x1: 4420, z1: 5, h: 44 },
    { t: 'prop', mesh: 'crate', x: 3380, z: 96, h: 60, solid: 30, solidZ: 18 }, { t: 'prop', mesh: 'lanternpost', x: 3350, z: 150, h: 170, solid: 9, solidZ: 9, light: { r: 260, i: 1.4, y: 110, c: [0.7, 1, 0.6] }, c: [0.7, 1, 0.55], code: true });   // the masked merchant's corner (both nights)
  add('east', { t: 'prop', mesh: 'bell', x: 4200, z: 1450, y: 84, h: 190, solid: 62, solidZ: 30 },
    { t: 'prop', mesh: 'angel', x: 3540, z: 1330, y: 84, h: 200 }, { t: 'prop', mesh: 'angel', x: 4260, z: 1330, y: 84, h: 200, flip: true },
    { t: 'prop', mesh: 'gargoyle', x: 3700, z: 1610, y: 84, h: 150 }, { t: 'prop', mesh: 'gargoyle', x: 4100, z: 1610, y: 84, h: 150, flip: true },
    { t: 'prop', mesh: 'brazier', h: 112, solid: 22, solidZ: 22, x: 3810, y: 84, z: 1590, light: { r: 380, i: 1.8, y: 90, c: [1, 0.55, 0.22] } }, { t: 'prop', mesh: 'brazier', h: 112, solid: 22, solidZ: 22, x: 3990, y: 84, z: 1590, light: { r: 380, i: 1.8, y: 90, c: [1, 0.55, 0.22] } },
    { t: 'deco', mesh: 'candles', x: 3620, y: 84, z: 1600, light: { r: 200, i: 1.1, y: 20 } },
    LAMP(3700, 960), LAMP(4100, 960),
    { t: 'deco', mesh: 'deadtree', x: 3420, z: 1130, h: 280 }, { t: 'deco', mesh: 'deadtree', x: 4330, z: 1160, h: 250, flip: true },
    ...[[3380, 1060, 'point', 92], [3470, 1090, 'round', 80], [3560, 1050, 'cross', 96], [3500, 1190, 'obelisk', 120], [3380, 1200, 'broken', 80], [4240, 1070, 'round', 84], [4390, 1060, 'point', 90], [4250, 1200, 'ledger', 80], [4400, 1190, 'cross', 100]].map(([x, z, kind, h]) => ({ t: 'deco', mesh: 'grave', kind, x, z, h })),
    { t: 'deco', mesh: 'cross', x: 4320, z: 1090, h: 170 },
    { t: 'deco', mesh: 'cemgate', x: 4590, z: 1010, w: 164, h: 200, open: gateOpen ? 1.385 : 0 }, { t: 'blocker', x: 4472, z: 992, w: 38, d: 36 }, { t: 'blocker', x: 4670, z: 992, w: 38, d: 36 },
    ...(gateOpen ? [] : [{ t: 'blocker', x: 4508, z: 1000, w: 164, d: 20 }]),   // the shut leaves (story state): nothing walks through them
    { t: 'prop', mesh: 'lanternpost', x: 4510, z: 1180, h: 180, solid: 9, solidZ: 9, light: { r: 280, i: 1.3, y: 120, c: [0.75, 0.85, 1] }, c: [0.75, 0.85, 1], flip: true, code: true });   // thin code-built post: the lane runs on behind it

  // ───────────── era dressing ─────────────
  if (now) {
    add('out', { t: 'prop', mesh: 'wreck', x: 440, z: 256, w: 150, solid: 68, solidZ: 26, solidH: 60, ...(out ? { fire: false } : { light: FIRE(460, 2.1) }) },
      { t: 'prop', mesh: 'cart', x: 820, z: 252, h: 104, solid: 90, solidZ: 36 }, { t: 'prop', mesh: 'goods', x: 1040, z: 250, h: 92, solid: 64, solidZ: 40, solidH: 70 },   // barrels, crates and sacks in one generated model (was a barrel and a crate)
      { t: 'prop', mesh: 'wreck', x: 1290, z: 258, w: 130, fire: false, solid: 60, solidZ: 24, solidH: 60 });
    anchors.push(out ? { id: 'smoke_wreck', kind: 'smoke', x: 450, y: 20, z: 244, size: 1 } : { id: 'fire_wreck', kind: 'fire', x: 450, y: 20, z: 244, size: 1.2, light: true }, { id: 'smoke_wreck2', kind: 'smoke', x: 1290, y: 40, z: 250, size: 1 });
    fire('out', 'fire_h1a', 90, 70, 296, 40, 56); fire('out', 'fire_h1roof', 200, 210, 300, 190, 84, 520); fire('out', 'fire_ruin', 440, 96, 300, 120, 64, 380);
    fire('out', 'fire_h3a', 1120, 72, 296, 40, 60); fire('out', 'fire_h3roof', 1300, 230, 300, 210, 90, 540);
    if (!out) for (const [x, z] of [[230, 120], [760, 200], [1180, 60]]) anchors.push({ id: 'embers_' + x, kind: 'embers', x, y: 0, z, size: 1 });
    add('street', { t: 'prop', mesh: 'hay', x: 3060, z: 262, h: 62, solid: 34, solidZ: 16 });   // (BREAK: the crate at 2150 and the sacks at 1960 are breakables now)
    add('east', { t: 'prop', mesh: 'wreck', x: 4560, z: 200, w: 140, solid: 64, solidZ: 26, solidH: 60, ...(out ? { fire: false } : { light: FIRE(440, 2.0) }) }, { t: 'prop', mesh: 'cart', x: 3560, z: 830, h: 104, solid: 90, solidZ: 36 });   // (BREAK: the barrel at 4080, 846 and the sacks at 4340, 842 are breakables now)
    if (!out) anchors.push({ id: 'fire_sq', kind: 'fire', x: 4570, y: 20, z: 190, size: 1.1, light: true });
    anchors.push({ id: 'red_moon', kind: 'glow_red', x: 3900, y: 900, z: 2600, size: 4 });
  } else {
    add('out', { t: 'prop', mesh: 'hay', x: 430, z: 262, h: 62, solid: 34, solidZ: 16 }, { t: 'prop', mesh: 'harvest', x: 330, z: 266, h: 46, solid: 30, solidZ: 12 },
      { t: 'prop', mesh: 'cart', x: 820, z: 252, h: 104, solid: 90, solidZ: 36 }, { t: 'prop', mesh: 'goods', x: 1040, z: 250, h: 92, solid: 64, solidZ: 40, solidH: 70, flip: true },
      { t: 'prop', mesh: 'plaguepost', x: 1290, z: 264, h: 200, solid: 10, solidZ: 10 });
    add('street', { t: 'prop', mesh: 'stall', x: 2240, z: 258, h: 130, w: 140, solid: 72, solidZ: 23 }, { t: 'prop', mesh: 'hay', x: 3060, z: 262, h: 62, solid: 34, solidZ: 16 });   // (BREAK: the sacks at 1960 that read as untextured jars are real clay jars now - breakables below)
    add('east', { t: 'prop', mesh: 'plaguepost', x: 4560, z: 200, h: 220, code: true, solid: 10, solidZ: 10 }, { t: 'prop', mesh: 'stall', x: 3500, z: 836, h: 130, w: 140, solid: 72, solidZ: 23 }, { t: 'prop', mesh: 'stall', x: 4300, z: 836, h: 130, w: 140, solid: 72, solidZ: 23 },
      { t: 'prop', mesh: 'hay', x: 3624, z: 850, h: 62, solid: 34, solidZ: 16 }, { t: 'deco', mesh: 'candles', x: 3900, z: 400, light: { r: 180, i: 1.0, y: 20 } });
    add('east', { t: 'deco', mesh: 'candles', x: 3760, y: 84, z: 1600, n: 5, light: { r: 200, i: 1.1, y: 20 } }, { t: 'deco', mesh: 'candles', x: 4040, y: 84, z: 1600, n: 5, light: { r: 200, i: 1.1, y: 20 } });
    for (const [x, z] of [[900, 150], [2600, 150], [3900, 600]]) anchors.push({ id: 'mist_' + x, kind: 'mist', x, y: 0, z, size: 2 });
  }
  anchors.push({ id: 'mist_gate', kind: 'mist', x: 4590, y: 0, z: 1150, size: 2 });

  // ───────────── people, enemies, hot spots ─────────────
  const S = [0, -1], N = [0, 1], E = [1, 0], W = [-1, 0];
  actors.push({ id: 'rook', model: 'rook', x: 3420, z: 140, face: E, talk: 'rook.' + era, pose: 'idle' });
  if (now) {
    for (const [k, x, z, g] of [['skeleton_soldier', 620, 150, 'out_a'], ['skeleton_soldier', 700, 90, 'out_a'], ['skeleton_soldier', 1150, 140, 'out_b'], ['skeleton_soldier', 1230, 200, 'out_b'], ['skeleton_soldier', 1310, 100, 'out_b'],
      ['skeleton_soldier', 1900, 150, 'st_a'], ['skeleton_soldier', 2010, 216, 'st_a'], ['skeleton_mage', 2130, 120, 'st_a'], ['skeleton_mage', 2770, 200, 'st_b'], ['skeleton_soldier', 2850, 110, 'st_b'], ['skeleton_soldier', 2930, 180, 'st_b'],
      ['skeleton_mage', 3780, 640, 'sq'], ['skeleton_mage', 4060, 300, 'sq'], ['skeleton_soldier', 3700, 430, 'sq'], ['skeleton_soldier', 4010, 580, 'sq'], ['skeleton_soldier', 4160, 470, 'sq']]) if (!out) enemies.push({ kind: k, x, z, group: g, yard: g === 'sq' });
    actors.push({ id: 'sera', model: 'sera', x: 4300, z: 770, face: E, talk: 'sera.square.now', pose: 'kneel', when: 'square_clear' }, { id: 'wounded', model: 'villager_m', x: 4350, z: 776, face: W, talk: 'wounded.square', pose: 'sit', when: 'square_clear', solid: false },
      { id: 'trapped', model: 'villager_f', x: 2270, z: 262, face: S, talk: 'trapped.freed', pose: 'cower', when: 'door_pulled' }, { id: 'marta', model: 'marta', x: 1820, z: 262, face: S, talk: 'marta.inn.now', pose: 'idle', when: 'street_clear' },
      { id: 'alberto', model: 'alberto', x: 3840, z: 1540, face: S, talk: 'alberto.church', pose: 'talk' },
      { id: 'hadwin', model: 'hadwin', x: 2640, z: 262, face: S, talk: 'hadwin.smithy.now', pose: 'idle' });   // the smith at his door (DATA_FORMAT 12: the grandson's drawer)
    if (!flags.promise || flags.elise_home) actors.push({ id: 'elise', model: 'elise', x: 3950, z: 1572, face: S, talk: 'elise.promise', pose: 'idle' });   // gone after the promise (she is up the tower, then lost in 1697), back when she is home
    interact.push({ id: 'trapped_door', kind: 'pull', x: 2270, z: 278, r: 70, label: '문 당기기', event: 'door.pull' }, { id: 'inn_door', kind: 'door', x: 1800, z: 284, r: 54, label: '흑묘 여관', event: 'door.inn', locked: 'not_built' }, { id: 'smithy_door', kind: 'shop', x: 2580, z: 284, r: 54, label: '대장간', event: 'shop.smithy', locked: 'not_built' });
    triggers.push({ id: 'first_bell', ...rect(260, 0, 60, 300), event: 'bell.toll' }, { id: 'street_enter', ...rect(1500, 0, 60, 300), event: 'tutorial.guard', wake: 'st_a' }, { id: 'square_enter', ...rect(3300, 0, 60, 300), event: 'square.enter', wake: 'sq' }, { id: 'church_steps', ...rect(3660, 1100, 480, 60), event: 'church.arrive' });
  } else {
    for (const [x, z, g] of [[900, 150, 'out_p'], [980, 90, 'out_p'], [1070, 190, 'out_p'], [1800, 160, 'st_p'], [1890, 100, 'st_p'], [2620, 150, 'st_p'], [2700, 216, 'st_p'], [2790, 120, 'st_p'], [3760, 560, 'sq_p'], [4050, 330, 'sq_p'], [4150, 560, 'sq_p']]) enemies.push({ kind: 'plague_corpse', x, z, group: g, yard: g === 'sq_p' });
    actors.push({ id: 'lotte', model: 'lotte', x: 3950, z: 1560, face: S, talk: 'lotte.fell', pose: 'idle' }, { id: 'edmund', model: 'edmund', x: 1800, z: 262, face: S, talk: 'edmund.tavern', pose: 'idle', when: 'past_street_clear' in flags ? 'past_street_clear' : 'street_clear' },   // street_clear has two meanings (tonight: Marta; 1697: Edmund). A caller that knows the new flag (passes the key, true or false) gets it; the old name keeps working
      { id: 'elise', model: 'elise', x: 4290, z: 1420, face: S, talk: 'keepers.promise', pose: 'idle', when: 'elise_found' },   // near the big bell after the rescue (DATA_FORMAT 12)
      { id: 'hadwin1', model: 'hadwin1', x: 2640, z: 262, face: S, talk: 'hadwin1.smithy', pose: 'work' }, { id: 'stallkeeper', model: 'villager_f', x: 3500, z: 772, face: S, talk: 'villager.stall', pose: 'cower', tint: [1.05, 0.95, 0.85] }, { id: 'farmer', model: 'villager_m', x: 4300, z: 772, face: S, talk: 'villager.plague', pose: 'idle', tint: [1.05, 0.95, 0.85] });
    interact.push({ id: 'inn_door', kind: 'door', x: 1800, z: 284, r: 54, label: '작은 주막', event: 'door.tavern', locked: 'not_built' }, { id: 'smithy_door', kind: 'shop', x: 2580, z: 284, r: 54, label: '대장간', event: 'shop.smithy1', locked: 'not_built' });
    triggers.push({ id: 'past_street', ...rect(1500, 0, 60, 300), event: 'past.street', wake: 'st_p' }, { id: 'square_enter', ...rect(3300, 0, 60, 300), event: 'square.enter', wake: 'sq_p' }, { id: 'church_steps', ...rect(3660, 1100, 480, 60), event: 'church.arrive' });
  }
  interact.push({ id: 'big_bell', kind: 'bell', x: 4200, z: 1408, y: 84, r: 80, label: '종 치기', event: 'bell.ring' }, { id: 'church_rest', kind: 'rest', x: 3640, z: 1570, y: 84, r: 70, label: '촛불', event: 'rest' },
    { id: 'well', kind: 'sign', x: 3900, z: 400, r: 70, label: '우물', event: 'sign.well' }, { id: 'rook_shop', kind: 'shop', x: 3440, z: 140, r: 70, label: '로크', event: 'shop.rook' });

  if (out) for (const t of triggers) delete t.wake;   // the fires are out and the dead are gone: the triggers stay (same ids) but wake nobody
  const camH = { yaw: 12 * D, pitch: 20 * D, dist: 790, lookY: 64, leadX: 90, leadZ: 0, zFollow: 0.55 };
  const sections = [
    { id: 'outskirts', label: '마을 외곽', x0: -200, x1: 1500, z0: -100, z1: 400, cam: { ...camH, minX: 40 } },
    { id: 'street', label: '큰길', x0: 1500, x1: 3300, z0: -100, z1: 400, cam: { ...camH } },
    { id: 'square', label: '광장', x0: 3300, x1: 4800, z0: -100, z1: 900, cam: { yaw: 0, pitch: 27 * D, dist: 900, lookY: 30, leadX: 0, leadZ: 40, minX: 3700, maxX: 4300, zFollow: 1, tallK: 0.12 } },
    { id: 'church', label: '성당 앞', x0: 3300, x1: 4440, z0: 900, z1: 1800, cam: { yaw: 0, pitch: 17 * D, dist: 720, lookY: 62, leadX: 0, leadZ: 140, minX: 3760, maxX: 4040, zFollow: 1, tallK: 0.2 } },
    { id: 'graveroad', label: '묘지 가는 길', x0: 4440, x1: 4800, z0: 900, z1: 1600, cam: { yaw: 0, pitch: 14 * D, dist: 660, lookY: 62, leadX: 0, leadZ: 140, minX: 4560, maxX: 4620, zFollow: 1, tallK: 0.15 } },
  ];
  return {
    id: 'eshville_' + era, name: '에슈빌', era, twin: 'eshville_' + (now ? 'past' : 'now'),
    room: 'street', rooms: { outskirts: 'field', street: 'street', square: 'courtyard', church: 'courtyard', graveroad: 'alley' }, music: now ? 'village_burning' : 'village_past',
    stage: {
      id: 'eshville_' + era, name: '에슈빌',
      sky: { img: 'bg/s01_village', crop: 0.66, span: 84 * D, bottom: -7 * D, top: now ? [0.1, 0.035, 0.045] : [0.03, 0.045, 0.08] },
      fog: out ? { color: [0.085, 0.09, 0.12], near: 800, far: 3400, max: 0.93 } : now ? { color: [0.15, 0.075, 0.075], near: 760, far: 3300, max: 0.94 } : { color: [0.06, 0.085, 0.135], near: 800, far: 3400, max: 0.93 },
      light: out ? { ambient: [0.3, 0.3, 0.4], moon: [0.56, 0.46, 0.52], moonDir: [-0.447, 0.745, -0.496] } : now ? { ambient: [0.37, 0.28, 0.33], moon: [0.7, 0.38, 0.34], moonDir: [-0.447, 0.745, -0.496] } : { ambient: [0.27, 0.31, 0.45], moon: [0.42, 0.48, 0.68], moonDir: [-0.447, 0.745, -0.496] },
      sections, parts: P,
      decals: decals(now),
    },
    spawns: {
      default: { x: 160, z: 150, face: E, section: 'outskirts' }, from_west: { x: 30, z: 150, face: E, section: 'outskirts' }, from_graveyard: { x: 4590, z: 1150, face: S, section: 'graveroad' },
      from_belltower: { x: 3900, z: 1560, face: S, section: 'church' }, bell: { x: 4200, z: 1390, face: N, section: 'church' }, inn: { x: 1800, z: 250, face: S, section: 'street' }, square: { x: 3900, z: 250, face: N, section: 'square' },
    },
    exits: [
      { id: 'to_graveyard', ...rect(4510, 1230, 160, 70), to: 'graveyard_' + era, spawn: 'from_eshville', label: '안개의 묘지', locked: gateOpen ? null : now ? 'key_graveyard' : 'past_gate' },
      { id: 'to_belltower', ...rect(3852, 1578, 96, 44), to: 'belltower_' + era, spawn: 'bottom', label: '종탑', locked: 'story:belltower' },
      { id: 'to_west', ...rect(-60, 110, 50, 130), to: 'stable_' + era, spawn: 'from_eshville', label: '성문 밖', locked: 'not_built' },
    ],
    actors, enemies, triggers, interact, anchors,
    breakables: breakables(now),   // BREAK: jars, pots, crates and barrels the hero can break (AREA_FORMAT 15) - dynamic things, not stage parts
    entry: gateOpen ? [] : ['from_graveyard'],   // behind the shut cemetery gate: reached only by coming in from the graveyard
  };
}

/**
 * BREAK: what can be broken (AREA_FORMAT 15), in small groups beside the way: tonight what the fire left by the wrecks, the inn and the smithy;
 * in 1697 the harvest market's jars and barrels by the stalls. Never in the way, at a door, beside a person, a bell, an exit or where an enemy starts.
 * On the street the kerb starts at z 280: everything stands in front of it.
 */
function breakables(now) {
  const B = [], put = (kind, x, z, o) => B.push({ kind, x, z, ...(o ?? {}) });
  if (now) {
    put('pot', 172, 270); put('jar', 212, 266); put('barrel', 536, 262, { rot: 0.3 }); put('jar', 585, 266); put('jar', 940, 268); put('crate', 1392, 262, { rot: 0.12 });   // outskirts
    put('barrel', 1632, 254); put('jar', 1676, 260); put('urn', 1706, 246); put('crate', 2150, 250, { rot: -0.08 }); put('jar', 2198, 260); put('barrel', 2420, 254); put('pot', 2462, 258); put('pot', 1938, 258); put('jar', 2992, 260);   // street: inn front, the house, the smithy side
    put('jar', 3340, 846); put('barrel', 3390, 852, { rot: 0.5 }); put('barrel', 4168, 856); put('crate', 4222, 858, { rot: 0.2 }); put('jar', 4268, 866); put('pot', 4664, 470);   // the square: corners of its north wall, the east wall
    put('urn', 3478, 1420); put('urn', 4322, 1420);   // offering urns on the church terrace
  } else {
    put('jar', 212, 266); put('pot', 250, 270); put('barrel', 536, 262, { rot: 0.3 }); put('jar', 585, 266); put('jar', 940, 268); put('crate', 1392, 262, { rot: 0.12 });   // outskirts: the harvest road
    put('barrel', 1632, 254); put('jar', 1676, 260); put('jar', 1946, 260); put('pot', 1986, 258); put('urn', 1966, 226); put('barrel', 2420, 254); put('pot', 2376, 258); put('jar', 2992, 260); put('pot', 2954, 258);   // street: the tavern side, the jars that were sacks, the smithy side
    put('jar', 3340, 846); put('barrel', 3390, 852, { rot: 0.5 }); put('jar', 4160, 858); put('pot', 4200, 862); put('crate', 4400, 856, { rot: 0.2 }); put('pot', 4664, 470);   // the square: the market stalls' wares
    put('urn', 3478, 1420); put('urn', 4322, 1500);
  }
  return B;
}

/** ground decals: the same puddles and moss in both eras; scorch, ash and embers tonight; straw and leaves that night */
function decals(now) {
  const d = [];
  const put = (k, x, z, rx, rz, y) => d.push(y ? { k, x, z, rx, rz, y } : { k, x, z, rx, rz });
  for (const [x, z, rx, rz] of [[520, 110, 60, 28], [1150, 80, 46, 24], [1720, 200, 54, 26], [2360, 120, 66, 30], [3000, 70, 50, 24], [3620, 250, 70, 34], [4200, 640, 60, 40], [3800, 780, 54, 30]]) put('puddle', x, z, rx, rz);
  for (const [x, z, rx, rz] of [[150, 250, 90, 30], [900, 270, 90, 24], [1640, 262, 90, 20], [2600, 30, 110, 30], [3380, 500, 40, 110], [4640, 500, 40, 120], [3690, 1000, 30, 80], [4110, 1040, 30, 80]]) put('moss', x, z, rx, rz);
  for (const [x, z, rx, rz] of [[700, 150, 120, 60], [1429, 150, 90, 60], [2190, 150, 130, 60], [2900, 170, 110, 50], [3900, 450, 150, 100], [3900, 980, 120, 70]]) put('stain', x, z, rx, rz);
  for (const [x, z, rx, rz] of [[1000, 150, 70, 40], [2050, 80, 80, 40], [3300, 150, 80, 50], [4100, 250, 90, 60], [3900, 760, 80, 50]]) put('crack', x, z, rx, rz);
  put('moss', 3600, 1300, 90, 40, 84); put('stain', 3900, 1450, 160, 90, 84); put('crack', 4050, 1400, 80, 50, 84); put('puddle', 3760, 1380, 50, 30, 84);
  if (now) {
    for (const [x, z, rx, rz] of [[440, 236, 130, 50], [200, 262, 120, 36], [1290, 250, 120, 44], [1300, 276, 150, 26], [4560, 190, 120, 50]]) put('scorch', x, z, rx, rz);
    for (const [x, z, rx, rz] of [[330, 150, 90, 50], [760, 190, 80, 40], [1180, 70, 90, 44], [4440, 300, 90, 50]]) put('ash', x, z, rx, rz);
  } else {
    for (const [x, z, rx, rz] of [[430, 240, 90, 36], [2240, 226, 100, 30], [3060, 240, 80, 30], [3500, 790, 110, 36], [4300, 790, 110, 36]]) put('straw', x, z, rx, rz);
    for (const [x, z, rx, rz] of [[20, 230, 80, 40], [1500, 60, 80, 36], [3400, 700, 70, 60], [4590, 1100, 80, 70]]) put('leaves', x, z, rx, rz);
  }
  return d;
}
