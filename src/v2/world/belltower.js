// WORLD-2: inside the bell tower of Eshville, tonight (GDD 9.1 minutes 15-20: "jump, climb"). docs/v2/AREA_FORMAT.md 13.
// The climb is laid out so that the raised camera reads it all the way up: five floors, each one LV higher and one row deeper into the screen than
// the one before (nothing in front is ever taller than what stands behind it). Stairs and ledges at alternating ends make the hero cross every
// floor; three floors are broken in the middle (a gap to jump). A fall lands on the floor below - never out of the world (every x, z has ground).
//   floor 0 (y 0, z 0..240) -> stone stair (right) -> floor 1 (gap) -> wooden stair (left) -> floor 2 (the bats' roost) -> two ledges (right)
//   -> floor 3 (gap) -> wooden stair (left) -> floor 4 (gap) -> two ledges (right) -> the bell chamber (y 550, z 880..1280): the big bell, the rope, Elise.
import { D, inChunk, rect } from './gen.js';

const W = 720, LV = 136, ROW = 160,   // LV 136: a floor edge cannot be hopped straight up (jump apex 112 + step 18 = 130) - the way up is the stairs and the half-height ledges
   Z1 = 240, TOP = 5 * LV, ZT = Z1 + 4 * ROW;   // ZT = 880: where the bell chamber begins
/** flags: fell (after the bell cracked: no Elise at the rope, no bats) */
export function belltower(era = 'now', flags = {}) {
  const P = [], anchors = [], add = (chunk, ...parts) => P.push(...inChunk(chunk, parts.flat())), fell = !!flags.fell;
  const zOf = (k) => (k ? Z1 + (k - 1) * ROW : 0), SC = (side, u, y) => ({ type: 'sconce', side, u, y, lr: 300, li: 1.5 });
  // ── floors: floor k is a slab from the ground up (a fall lands on the one in front); gaps are notches whose ground is the floor below ──
  const GAP = { 1: [300, 400], 3: [330, 430], 4: [270, 370] };
  add('low', { t: 'floor', x: 0, z: 0, w: W, d: Z1, mat: 'stone', kit: { mat: 'flags', cell: 40, strips: [{ x0: 260, x1: 460, mat: 'slabs' }] } }, { t: 'blocker', x: -90, z: -60, w: W + 180, d: 60, y: -200, h: 2400 });
  for (let k = 1; k <= 4; k++) {
    const z = zOf(k), y = k * LV, g = GAP[k], chunk = k <= 2 ? 'low' : 'high', mat = k % 2 ? 'planks' : 'flags', kit = { mat, cell: 40 };
    if (!g) add(chunk, { t: 'floor', x: 0, z, w: W, d: ROW, y, thick: y, mat: 'stone', kit });
    else add(chunk, { t: 'floor', x: 0, z, w: g[0], d: ROW, y, thick: y, mat: 'stone', kit }, { t: 'floor', x: g[1], z, w: W - g[1], d: ROW, y, thick: y, mat: 'stone', kit },
      { t: 'floor', x: g[0], z, w: g[1] - g[0], d: ROW, y: y - LV, thick: Math.max(20, y - LV), mat: 'stone', kit: { mat: 'slabs', cell: 50 } },   // the notch: its ground is the floor below
      { t: 'deco', mesh: 'beam', x: g[0] - 8, y: y - 12, z: z + 14, len: 26, r: 6 }, { t: 'deco', mesh: 'beam', x: g[1] - 18, y: y - 12, z: z + ROW - 30, len: 26, r: 6 },   // broken joist ends
      { t: 'deco', mesh: 'debris', x: (g[0] + g[1]) / 2, y: y - LV, z: z + ROW * 0.55, w: 80 });
    // the face under each floor edge: dressed stone, a coping lip, joist ends, arrow slits
    const segs = g ? [[0, g[0]], [g[1], W]] : [[0, W]];
    for (const [a, b] of segs) add(chunk, { t: 'deco', mesh: 'towerface', x: (a + b) / 2, y: y - LV, z, w: b - a, h: LV, mat: k % 2 ? 'fieldstone' : 'ashlar', slit: k % 2 ? [] : [b - a > 300 ? (b - a) * 0.35 : -99] });
  }
  add('high', { t: 'floor', x: 0, z: ZT, w: W, d: 400, y: TOP, thick: TOP, mat: 'stone', kit: { mat: 'planks', cell: 40, strips: [{ x0: 0, x1: 60, mat: 'flags' }, { x0: W - 60, x1: W, mat: 'flags' }, { z0: 340, z1: 400, mat: 'flags' }] } },
    { t: 'deco', mesh: 'towerface', x: W / 2, y: TOP - LV, z: ZT, w: W, h: LV, mat: 'ashlar', slit: [150, 570] });
  // ── the ways up ──
  // WORLD-3: every flight is climbed with the stick alone. The rules (src/v2/play/collide.js, sim.js): the hero is a square of half-width r 14 and walks
  // up a step of at most STEP_UP 18 - but his body already touches the step AFTER the next one when a tread is shallower than r, and that one stands
  // 2 x rise above his feet. So a flight needs rise <= 18 AND tread > 14 (the old flights: rise 15.1 on treads of 13.3-13.8 - he stopped at the foot).
  // Now: 12 steps, rise 11.3, tread 16. The stone flight runs into the screen on the deep ground floor; the two wooden flights run sideways along the
  // face of the next floor (a floor row is only 160 deep) up to a landing in the corner, from which the hero steps onto the floor above.
  const stone = { cheeks: 'LR' }, wood = { mat: 'darkwood', tread: 'wood' }, NS = 12, TR = 16, FL = NS * TR, SW = 64, LAND = 60;
  const flight = (k) => [   // floor k -> k + 1, along the back of floor k on the left: the landing in the corner, the flight rising towards it
    { t: 'block', x: 0, z: zOf(k + 1) - SW, w: LAND, d: SW, y: k * LV, h: LV, kit: { mat: 'darkwood', top: 'planks' } },
    { t: 'stairs', x: LAND, z: zOf(k + 1) - SW, w: FL, d: SW, y: k * LV, h: LV, dir: 'x-', steps: NS, mat: 'stone', kit: wood }];
  add('low', { t: 'stairs', x: 520, z: Z1 - FL, w: 160, d: FL, h: LV, dir: 'z+', steps: NS, mat: 'stone', kit: stone },                                    // 0 -> 1 (right, stone)
    flight(1),                                                                                                                                             // 1 -> 2 (left, wooden)
    { t: 'block', x: 560, z: zOf(3) - 70, w: 120, d: 70, y: 2 * LV, h: LV / 2, kit: { mat: 'fieldstone', top: 'slabs' } });                                      // 2 -> 3 (right): a ledge half a floor high, then the floor edge (the stair that stood here is gone: a climb on purpose)
  add('high', flight(3),                                                                                                                                   // 3 -> 4 (left, wooden)
    { t: 'block', x: 540, z: ZT - 70, w: 140, d: 70, y: 4 * LV, h: LV / 2, kit: { mat: 'fieldstone', top: 'slabs' } });                                          // 4 -> top (right)
  // ── the shell: side walls and the back wall of the belfry (open arches to the night) ──
  const side = (x, face) => ({ t: 'wall', x, z: -60, w: 90, d: ZT + 400 + 60, h: TOP + 330, mat: 'facade', kit: { style: 'stone', cell: 70, faces: face, plinth: 0, quoins: false, cornice: false, courses: [LV * 2 + 60, LV * 4 + 60],
    windows: [[330, 250], [650, 470], [1010, 640], [1190, 640]].map(([u, y]) => ({ side: face, u: face === 'R' ? u : ZT + 460 - u, y, w: 34, h: 96, arch: 'point', rows: 1, cols: 1 })),
    hang: [SC(face, face === 'R' ? 150 : ZT + 460 - 210, 150), SC(face, face === 'R' ? 520 : ZT + 460 - 560, 150 + 2 * LV), SC(face, face === 'R' ? 800 : ZT + 460 - 840, 150 + 4 * LV), SC(face, face === 'R' ? 1120 : ZT + 460 - 1120, 150 + TOP)] } });
  add('low', side(-90, 'R'), side(W, 'L'));
  add('high', { t: 'wall', x: -90, z: ZT + 400, w: W + 180, d: 90, y: 0, h: TOP + 330, mat: 'facade', kit: { style: 'stone', cell: 70, faces: 'F', plinth: 0, quoins: false, battlement: true, courses: [TOP + 150],
    windows: [200, 450, 700].map((u) => ({ u, y: TOP + 44, w: 96, h: 190, arch: 'point', rows: 5, cols: 1, lit: 0 })) } });
  // ── dressing ──
  add('low', { t: 'prop', mesh: 'goods', x: 150, z: 196, h: 88, solid: 60, solidZ: 36, solidH: 66 },   // (BREAK: the loose barrels and crates of the tower are breakables now - see breakables below)
    { t: 'prop', mesh: 'stairs', x: 250, z: 176, h: 90, rot: 0.5, solid: 40, solidZ: 36, solidH: 70 },                                                                                      // a spare wooden flight leaning by the wall
    { t: 'deco', mesh: 'candles', x: 330, z: 214, n: 4, light: { r: 200, i: 1.0, y: 20 } },
    { t: 'deco', mesh: 'candles', x: 120, y: LV, z: zOf(1) + 30, n: 3, light: { r: 180, i: 0.9, y: 20 } },
    // the bats' roost: a beam along the face under floor 3 (against the wall: it hides nothing) with the bats hanging from it
    { t: 'deco', mesh: 'beam', x: 0, y: 3 * LV - 34, z: zOf(3) - 9, len: 540, r: 8 }, { t: 'deco', mesh: 'roost', x: 250, y: 3 * LV - 42, z: zOf(3) - 12, n: 7 }, { t: 'deco', mesh: 'roost', x: 440, y: 3 * LV - 42, z: zOf(3) - 12, n: 5 });
  add('high', { t: 'deco', mesh: 'beam', x: 0, y: TOP - 34, z: ZT - 9, len: 520, r: 8 }, { t: 'deco', mesh: 'roost', x: 300, y: TOP - 42, z: ZT - 12, n: 6 },
    { t: 'deco', mesh: 'candles', x: 600, y: 3 * LV, z: zOf(3) + 30, n: 3, light: { r: 180, i: 0.9, y: 20 } },
    { t: 'prop', mesh: 'goods', x: 120, z: zOf(4) + 116, y: 4 * LV, h: 80, solid: 52, solidZ: 30, solidH: 60, flip: true },
    // the bell chamber: the big bell in its oak frame against the back arches, the rope, braziers, the keeper's corner
    { t: 'prop', mesh: 'bell', x: 360, z: ZT + 300, y: TOP, h: 300, solid: 98, solidZ: 50, solidH: 240 },
    { t: 'deco', mesh: 'rope', x: 268, y: TOP + 34, z: ZT + 232, len: 262, r: 3.6 },                                                                       // the bell rope: from the top beam down to hand height, in front of the frame (Elise stands at it)
    { t: 'prop', mesh: 'brazier', x: 70, z: ZT + 330, y: TOP, h: 112, solid: 22, solidZ: 22, light: { r: 420, i: 1.9, y: 90, c: [1, 0.55, 0.22] } }, { t: 'prop', mesh: 'brazier', x: 650, z: ZT + 330, y: TOP, h: 112, solid: 22, solidZ: 22, light: { r: 420, i: 1.9, y: 90, c: [1, 0.55, 0.22] } },
    { t: 'deco', mesh: 'candles', x: 600, y: TOP, z: ZT + 60, n: 5, light: { r: 200, i: 1.0, y: 20 } },
    { t: 'deco', mesh: 'beam', x: 0, y: TOP + 300, z: ZT + 300, len: W, r: 13 }, { t: 'deco', mesh: 'beam', x: 268, y: TOP + 296, z: ZT + 226, len: 80, r: 7, dz: true });   // the top beam and the short arm the rope runs over
  anchors.push({ id: 'brazier_l', kind: 'fire', x: 70, y: TOP + 96, z: ZT + 324, size: 0.5, light: true }, { id: 'brazier_r', kind: 'fire', x: 650, y: TOP + 96, z: ZT + 324, size: 0.5, light: true },
    { id: 'dust_shaft', kind: 'mist', x: 360, y: 2 * LV, z: zOf(2) + 60, size: 1.2 }, { id: 'red_moon', kind: 'glow_red', x: 360, y: TOP + 700, z: ZT + 1500, size: 4 });
  const N = [0, 1], S = [0, -1];
  const bats = fell ? [] : [
    ...[[250, zOf(2) + 100], [470, zOf(2) + 90]].map(([x, z]) => ({ kind: 'bat', x, z, group: 'tower_roost' })),
    ...[[150, ZT + 200], [280, ZT + 120], [440, ZT + 130], [570, ZT + 210], [360, ZT + 180]].map(([x, z]) => ({ kind: 'bat', x, z, group: 'tower_bats', yard: true })),
  ];
  const cam = { yaw: 0, pitch: 30 * D, dist: 800, lookY: 66, leadX: 0, leadZ: 60, minX: 320, maxX: 400, zFollow: 1, tallK: 0.12 };
  return {
    id: 'belltower_' + era, name: '종탑', era, twin: null, room: 'tower', rooms: { stairs: 'tower', top: 'tower' }, music: null,
    stage: {
      id: 'belltower_' + era, name: '종탑',
      sky: { img: 'bg/s01_village', crop: 0.66, span: 84 * D, bottom: -7 * D, top: [0.1, 0.035, 0.045] },
      fog: { color: [0.07, 0.05, 0.06], near: 700, far: 2600, max: 0.9 },
      light: { ambient: [0.3, 0.27, 0.31], moon: [0.5, 0.36, 0.36], moonDir: [-0.447, 0.745, -0.496] },
      sections: [
        { id: 'stairs', label: '종탑 계단', x0: -100, x1: W + 100, z0: -100, z1: ZT, cam },
        { id: 'top', label: '종 아래', x0: -100, x1: W + 100, z0: ZT, z1: ZT + 500, cam: { ...cam, pitch: 26 * D, dist: 780, leadZ: 90 } },
      ],
      chunks: [{ id: 'low', z1: zOf(3) }, { id: 'high', z1: Infinity }],
      parts: P,
      decals: [[360, 120, 'stain', 110, 60, 0], [200, zOf(1) + 80, 'crack', 70, 40, LV], [520, zOf(2) + 70, 'stain', 80, 50, 2 * LV], [360, ZT + 150, 'stain', 150, 90, TOP], [520, ZT + 250, 'crack', 80, 50, TOP]].map(([x, z, k, rx, rz, y]) => ({ k, x, z, rx, rz, y })),
    },
    spawns: { default: { x: 360, z: 80, face: N, section: 'stairs' }, bottom: { x: 360, z: 80, face: N, section: 'stairs' }, top: { x: 360, z: ZT + 60, face: N, section: 'top' } },
    exits: [{ id: 'to_eshville', ...rect(290, 0, 140, 36), to: 'eshville_' + era, spawn: 'from_belltower', label: '성당 앞', locked: null }],
    actors: fell ? [] : [{ id: 'elise', model: 'elise', x: 232, z: ZT + 222, face: S, talk: 'elise.promise', pose: 'idle' }],   // at the rope (DATA_FORMAT 12)
    enemies: bats,
    triggers: fell ? [] : [{ id: 'tower_roost', ...rect(0, zOf(2), W, 50), event: 'tower.roost', wake: 'tower_roost' }, { id: 'tower_top', ...rect(0, ZT + 20, W, 60), event: 'tower.top', wake: 'tower_bats' }],
    interact: [],
    anchors,
    // BREAK (AREA_FORMAT 15): the store room at the foot (a barrel, a jar, a pot), one crate or barrel on a landing of each floor, the keeper's corner by the bell
    breakables: [
      { kind: 'barrel', x: 60, z: 60 }, { kind: 'jar', x: 106, z: 50 }, { kind: 'pot', x: 58, z: 112 },
      { kind: 'crate', x: 660, z: zOf(1) + 96, rot: 0.1 }, { kind: 'barrel', x: 80, z: zOf(2) + 110 }, { kind: 'crate', x: 650, z: zOf(3) + 110, rot: -0.15 },
      { kind: 'crate', x: 80, z: ZT + 120, rot: 0.2 }, { kind: 'urn', x: 112, z: ZT + 372 },
    ],
  };
}
