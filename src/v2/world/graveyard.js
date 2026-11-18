// WORLD: the Misty Graveyard, tonight (GDD 9.1 minutes 36-58): the road from the village gate, the inner gate with its keeper, the grave field and the mausoleum.
// docs/v2/AREA_FORMAT.md. One layout function for both nights: 'now' = mist, ghosts, leaning and broken stones, the keeper's hut in ruins;
// 'past' (1697) = a tended graveyard: upright stones, three Valkrein stones instead of four, warm lanterns, the keeper at his hut, plague corpses on the road.
import { D, rnd, inChunk, rect, house } from './gen.js';

/** flags (docs/v2/AREA_FORMAT.md 13): bell_hung · ossuary_open · carved_a · carved_b */
export function graveyard(era = 'now', flags = {}) {
  const now = era === 'now', TY = 140, hung = !!flags.bell_hung, P = [], anchors = [], r = rnd(7741), add = (chunk, ...parts) => P.push(...inChunk(chunk, parts.flat()));
  const COLD = now ? [0.7, 0.85, 1] : [1, 0.74, 0.4], LP = (x, z, o = {}) => ({ t: 'prop', mesh: 'lanternpost', x: x + (o.flip ? 20 : -20), z, h: 180, solid: 9, solidZ: 9, light: { r: 300, i: 1.3, y: 120, c: COLD }, c: COLD, flicker: true, ...o });
  // ground
  add('road', { t: 'floor', x: 490, z: 0, w: 220, d: 900, mat: 'dirt', kit: { mat: 'cobworn', rag: 34, strips: [{ x0: 0, x1: 46, mat: 'soil' }, { x0: 174, x1: 220, mat: 'soil' }] } },
    { t: 'floor', x: 100, z: 0, w: 346, d: 900, mat: 'dirt', walk: false, kit: { mat: 'soil', rag: 40, strips: [{ x0: 120, x1: 346, z0: 200, z1: 520, mat: 'moss' }] } },
    { t: 'floor', x: 754, z: 0, w: 346, d: 900, mat: 'dirt', walk: false, kit: { mat: 'soil', rag: 40, strips: [{ x0: 0, x1: 200, z0: 380, z1: 700, mat: 'moss' }] } },
    { t: 'blocker', x: 100, z: -60, w: 1000, d: 60, y: -400, h: 1200 });
  // the field (z 900..1850) and, since WORLD-2, the ossuary forecourt on a terrace TY above it (z 1850..2100): the stone stair that led up is broken in both nights
  // (GDD 9.1 minute 58: "the broken stone path") - a whip ring on the terrace edge lifts the hero up; when the road bell has hung there for a hundred years the stair is whole again tonight
  const STRIPS = [[500, 700, 900, 1900, 'cobworn'], [160, 1040, 1460, 1580, 'cobworn'], [480, 720, 1840, 2010, 'flags'], [140, 400, 1020, 1320, 'moss'], [800, 1060, 1660, 1940, 'moss']];
  const strips = (x, z, w, d) => STRIPS.filter(([x0, x1, z0, z1]) => x0 < x + w && x1 > x && z0 < z + d && z1 > z).map(([x0, x1, z0, z1, mat]) => ({ x0: Math.max(0, x0 - x), x1: Math.min(w, x1 - x), z0: Math.max(0, z0 - z), z1: Math.min(d, z1 - z), mat }));
  add('field', { t: 'floor', x: 100, z: 900, w: 1000, d: 950, mat: 'dirt', kit: { mat: 'soil', rag: 44, strips: strips(100, 900, 1000, 950) } },
    { t: 'floor', x: 100, z: 1850, w: 1000, d: 250, y: TY, thick: TY + 220, mat: 'dirt', kit: { mat: 'soil', rag: 36, strips: strips(100, 1850, 1000, 250) } },
    { t: 'deco', mesh: 'towerface', x: 300, y: 0, z: 1850, w: 400, h: TY, mat: 'fieldstone', step: 1e6 }, { t: 'deco', mesh: 'towerface', x: 900, y: 0, z: 1850, w: 400, h: TY, mat: 'fieldstone', step: 1e6 },
    { t: 'deco', mesh: 'towerface', x: 600, y: 0, z: 1850, w: 200, h: TY, mat: 'ashlar', step: 1e6 },
    { t: 'blocker', x: 0, z: 1850, w: 100, d: 340, y: 0, h: 1200 }, { t: 'blocker', x: 1100, z: 1850, w: 100, d: 340, y: 0, h: 1200 });   // on the terrace the side walls stand only 110 above the feet: a jump would clear them
  if (now && hung) add('field', { t: 'stairs', x: 540, z: 1740, w: 120, d: 110, h: TY, dir: 'z+', steps: 10, mat: 'stone', state: 'bell_hung', kit: { cheeks: 'LR' } });   // tonight, a hundred years after the bell was hung: the stair is whole
  else add('field', { t: 'prop', mesh: 'rubble', x: 600, z: 1806, w: 150, h: 64, solid: 70, solidZ: 40, solidH: 60 },                                               // the fallen stair: a heap of broken steps (solid, not climbable)
    { t: 'deco', mesh: 'footbridge', kind: 'slab', x: 600, y: TY - 12, z: 1838, w: 110, len: 22, th: 12 });                                                           // the top step still hangs on the edge
  // walls
  add('road', { t: 'wall', x: 0, z: -60, w: 100, d: 960, h: 240, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'R', battlement: true, buttress: [200, 500, 800].map((u) => ({ side: 'R', u, h: 190, d: 20 })) } },
    { t: 'wall', x: 1100, z: -60, w: 100, d: 960, h: 240, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'L', battlement: true, buttress: [160, 460, 760].map((u) => ({ side: 'L', u, h: 190, d: 20 })) } },
    { t: 'wall', x: 446, z: 130, w: 44, d: 770, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FR', coping: true, rail: 'R', piers: 154 } },
    { t: 'wall', x: 710, z: 130, w: 44, d: 770, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FL', coping: true, rail: 'L', piers: 154 } },
    { t: 'wall', x: 446, z: 0, w: 44, d: 130, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FR', coping: true, rail: 'R' } }, { t: 'wall', x: 710, z: 0, w: 44, d: 130, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FL', coping: true, rail: 'L' } });   // (the village-side gate stands in eshville; a gate here would sit between the camera and the arriving hero)
  add('field', { t: 'wall', x: 100, z: 900, w: 390, d: 60, h: 64, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'F', coping: true, rail: 'F', piers: 130 } },   // low wall + railing: a 190-high wall here hid the hero in a 300-deep band of the field behind it (camera rays, world_verify_node.mjs)
    { t: 'wall', x: 710, z: 900, w: 390, d: 60, h: 64, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'F', coping: true, rail: 'F', piers: 130 } },
    { t: 'deco', mesh: 'cemgate', x: 600, z: 930, w: 164, h: 210, open: 1.25 }, { t: 'blocker', x: 490, z: 912, w: 30, d: 36 }, { t: 'blocker', x: 680, z: 912, w: 30, d: 36 },
    { t: 'wall', x: 0, z: 900, w: 100, d: 1290, h: 250, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'R', battlement: true, buttress: [200, 520, 840, 1160].map((u) => ({ side: 'R', u, h: 200, d: 20 })) } },
    { t: 'wall', x: 1100, z: 900, w: 100, d: 1290, h: 250, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'L', battlement: true, buttress: [130, 450, 770, 1090].map((u) => ({ side: 'L', u, h: 200, d: 20 })) } },
    { t: 'wall', x: 100, z: 2100, w: 1000, d: 90, h: 400, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'F', battlement: true, buttress: [{ u: 140, h: 340, d: 22 }, { u: 860, h: 340, d: 22 }] } });
  // the roadside gardens (not walkable): graves, crosses, trees
  const KINDS = now ? ['round', 'point', 'cross', 'broken', 'round', 'obelisk', 'point'] : ['round', 'point', 'cross', 'round', 'round', 'obelisk', 'point'];   // that night nothing is broken yet
  for (const side of [0, 1]) for (let i = 0; i < 9; i++) {
    const x = (side ? 790 : 140) + r() * 260, z = 150 + i * 84 + r() * 30;
    add('road', { t: 'deco', mesh: 'grave', kind: KINDS[(i + side * 3) % KINDS.length], x: Math.round(x), z: Math.round(z), h: Math.round(70 + r() * 40) });
  }
  add('road', { t: 'deco', mesh: 'deadtree', x: 250, z: 420, h: 300 }, { t: 'deco', mesh: 'deadtree', x: 960, z: 640, h: 280, flip: true }, { t: 'deco', mesh: 'deadtree', x: 180, z: 800, h: 240, flip: true }, { t: 'deco', mesh: 'cross', x: 900, z: 300, h: 170 }, { t: 'deco', mesh: 'angel', x: 330, z: 640, h: 200 },
    LP(516, 300), LP(684, 620, { flip: true }));
  if (now) for (const [x, z] of [[600, 250], [600, 560], [600, 820]]) anchors.push({ id: 'mist_road_' + z, kind: 'mist', x, y: 0, z, size: 2 });
  // the keeper's hut behind the inner gate wall (same footprint both nights: lit and thatched in 1697, a roofless ruin tonight)
  add('field', house({ x: 770, z: 1000, w: 260, h: now ? 120 : 132, d: 70, style: 'rubble', seed: 91, burnt: now, lit: 1, door: 200, roofMat: 'thatch', roofH: 30, roofKit: { chimneys: [] }, kit: { lower: 'fieldstone', plinth: 20 } }));   // kept low (ridge 162, no chimney): at 170 + 50 the hut hid the hero in a 375-deep patch of the field behind it
  // the grave field: rows of solid stones with clear lanes (the middle path x 500..700 and the cross path z 1460..1580 stay empty)
  const stones = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 8; col++) {
    const x = 170 + col * 110 + (row % 2) * 40 + r() * 24, z = 1090 + row * 130 + r() * 30;
    if ((x > 470 && x < 730) || (z > 1430 && z < 1610) || z > 1900 || r() < 0.22 || (x > 730 && z < 1130)) continue;
    stones.push([Math.round(x), Math.round(z)]);
    add('field', { t: 'prop', mesh: 'grave', kind: KINDS[(row * 3 + col) % KINDS.length], x: Math.round(x), z: Math.round(z), h: Math.round(72 + r() * 44), solid: 22, solidZ: 9, solidH: 60 });
  }
  add('field', { t: 'prop', mesh: 'mausoleum', x: 600, z: 2040, w: 200, h: 150, d: 110, solid: 104, solidZ: 60, solidH: 200 },
    { t: 'prop', mesh: 'niche', x: 330, z: 2078, w: 170, h: 160, solid: 86, solidZ: 20 }, { t: 'prop', mesh: 'niche', x: 870, z: 2078, w: 170, h: 160, solid: 86, solidZ: 20 },
    { t: 'prop', mesh: 'gargoyle', x: 450, z: 2010, h: 150 }, { t: 'prop', mesh: 'gargoyle', x: 750, z: 2010, h: 150, flip: true },
    { t: 'prop', mesh: 'angel', x: 190, z: 1520, h: 196 }, { t: 'prop', mesh: 'angel', x: 1010, z: 1520, h: 196, flip: true },
    { t: 'deco', mesh: 'deadtree', x: -46, y: 0, z: 1090, h: 420 }, { t: 'deco', mesh: 'deadtree', x: 1250, y: 0, z: 1820, h: 400, flip: true }, { t: 'deco', mesh: 'deadtree', x: 1246, y: 0, z: 1130, h: 380 },   // the field's dead trees now stand OUTSIDE the side walls (crowns over the battlements): the generated tree has a wide root flare and hid the hero behind it
    { t: 'prop', mesh: 'cross', x: 400, z: 1700, h: 180, solid: 26, solidZ: 18 }, { t: 'prop', mesh: 'cross', x: 800, z: 1250, h: 170, solid: 26, solidZ: 18 },
    { t: 'prop', mesh: 'coffin', x: 770, z: 1730, solid: 60, solidZ: 22, h: 62, solidH: 50 }, { t: 'prop', mesh: 'coffin', x: 300, z: 1300, solid: 56, solidZ: 20, h: 58, solidH: 46, flip: true },
    { t: 'prop', mesh: 'chapel', x: 172, z: 2012, h: 220, solid: 60, solidZ: 72, solidH: 210 },   // a small tomb chapel in the back corner (generated model; against the back and side walls: nothing walkable behind it). It took the place of a dead tree
    LP(470, 1010), LP(730, 1010, { flip: true }), LP(470, 1520), LP(730, 1880, { flip: true }), LP(250, 1530), LP(950, 1530, { flip: true }),
    // the four Valkrein stones beside the middle path
    ...[[452, 1640, 'point', 120], [452, 1730, 'round', 110], [452, 1820, 'round', 110], ...(now ? [[748, 1640, 'broken', 100]] : [])].map(([x, z, kind, h]) => ({ t: 'prop', mesh: 'grave', kind, x, z, h, solid: 26, solidZ: 10, solidH: 70 })),
    { t: 'deco', mesh: 'candles', x: 520, z: 1000, light: { r: 180, i: 1.0, y: 20 } },
    // WORLD-2: the road-bell post in front of the ossuary (empty until the bell is hung in 1697; a rusted bell tonight once it was) and the whip ring on the terrace edge
    { t: 'prop', mesh: 'roadbell', x: 500, z: 1940, h: 176, solid: 16, solidZ: 14, solidH: 150, state: hung ? (now ? 'rusty' : 'hung') : 'empty', old: now, light: hung ? { r: 170, i: 0.7, y: 120, c: now ? [0.6, 0.86, 0.9] : [1, 0.82, 0.5] } : null },
    { t: 'prop', mesh: 'whipring', x: 668, z: 1868, h: 150, solid: 12, solidZ: 12, solidH: 170, light: { r: 150, i: 0.6, y: 150, c: [0.62, 0.86, 1] } },
    ...['a', 'b'].filter((g) => flags['carved_' + g]).map((g) => ({ t: 'deco', mesh: 'candles', x: g === 'a' ? 300 : 900, z: 1540, n: 3, light: { r: 150, i: 0.8, y: 20 } })));
  if (now) { for (const [x, z] of [[300, 1200], [900, 1250], [600, 1520], [320, 1800], [880, 1820], [600, 1980]]) anchors.push({ id: `mist_${x}_${z}`, kind: 'mist', x, y: z > 1850 ? TY : 0, z, size: 2.4 }); anchors.push({ id: 'fog_field', kind: 'fog_bank', x: 600, y: 0, z: 1500, size: 8 }); }
  else anchors.push({ id: 'mist_low', kind: 'mist', x: 600, y: 0, z: 1500, size: 1.5 });
  const S = [0, -1], N = [0, 1];
  const enemies = !now ? [[540, 380], [660, 300], [600, 640]].map(([x, z]) => ({ kind: 'plague_corpse', x, z, group: 'road' })) : [
    ...[[540, 380], [660, 300]].map(([x, z]) => ({ kind: 'skeleton_soldier', x, z, group: 'road' })), ...[[600, 520], [560, 660], [650, 720]].map(([x, z]) => ({ kind: 'bat', x, z, group: 'bats' })),
    { kind: 'gravekeeper_armor', x: 600, z: 1090, group: 'gate', yard: true },
    ...[[340, 1510, 'carved_a'], [860, 1510, 'carved_b'], [600, 1700], [600, 1880]].filter(([, , f]) => !(f && flags[f])).map(([x, z]) => ({ kind: 'grave_ghost', x, z, group: 'ghosts', yard: true })),   // a named grave lets its ghost go (GDD 2.3 carve)
  ];
  const camV = { yaw: 0, pitch: 14 * D, dist: 660, lookY: 62, leadX: 0, leadZ: 140, minX: 570, maxX: 630, zFollow: 1, tallK: 0.15 };
  return {
    id: 'graveyard_' + era, name: '안개의 묘지', era, twin: 'graveyard_' + (era === 'now' ? 'past' : 'now'),
    room: 'field', rooms: { road: 'alley', field: 'field' }, music: 'graveyard_mist',
    stage: {
      id: 'graveyard_' + era, name: '안개의 묘지',
      sky: { img: 'bg/s02_graveyard', crop: 0.66, span: 84 * D, bottom: -7 * D, top: [0.04, 0.06, 0.075] },
      fog: now ? { color: [0.1, 0.135, 0.15], near: 380, far: 2300, max: 0.965 } : { color: [0.06, 0.085, 0.135], near: 800, far: 3200, max: 0.92 },
      light: now ? { ambient: [0.27, 0.33, 0.38], moon: [0.42, 0.52, 0.6], moonDir: [-0.447, 0.745, -0.496] } : { ambient: [0.28, 0.32, 0.45], moon: [0.46, 0.5, 0.7], moonDir: [-0.447, 0.745, -0.496] },
      sections: [
        { id: 'road', label: '묘지 가는 길', x0: 0, x1: 1200, z0: -100, z1: 900, cam: camV },
        { id: 'field', label: '안개의 묘지', x0: 0, x1: 1200, z0: 900, z1: 2300, cam: { yaw: 0, pitch: 26 * D, dist: 880, lookY: 30, leadX: 0, leadZ: 60, minX: 380, maxX: 820, zFollow: 1, tallK: 0.12 } },
      ],
      parts: P,
      decals: (now ? [[600, 200, 'puddle', 50, 40], [560, 480, 'leaves', 80, 70], [640, 760, 'moss', 40, 90], [600, 1000, 'stain', 110, 60], [320, 1500, 'leaves', 90, 60], [860, 1540, 'leaves', 90, 60], [600, 1300, 'puddle', 60, 44], [600, 1760, 'crack', 80, 50], [600, 1940, 'moss', 110, 40], [760, 1700, 'stain', 90, 50], [250, 1250, 'moss', 90, 60]] : [[600, 200, 'puddle', 50, 40], [600, 1000, 'stain', 110, 60], [860, 1100, 'straw', 70, 40]]).map(([x, z, k, rx, rz]) => (z > 1850 ? { k, x, z, rx, rz, y: TY } : { k, x, z, rx, rz })),
    },
    spawns: { default: { x: 600, z: 190, face: N, section: 'road' }, from_eshville: { x: 600, z: 190, face: N, section: 'road' }, from_ossuary: { x: 600, z: 1900, face: S, section: 'field' }, gate: { x: 600, z: 1010, face: N, section: 'field' } },
    exits: [
      { id: 'to_eshville', ...rect(530, 0, 140, 56), to: 'eshville_' + era, spawn: 'from_graveyard', label: '에슈빌', locked: null },
      { id: 'to_ossuary', ...rect(556, 1932, 88, 34), to: 'ossuary_' + era, spawn: 'entry', label: '배웅의 납골당', locked: flags.ossuary_open ? null : 'story:ossuary' },
    ],
    actors: now ? [] : [{ id: 'keeper', model: 'villager_m', x: 800, z: 1100, face: [0, -1], talk: 'keeper.graveyard', pose: 'idle', tint: [0.9, 0.9, 1.0] },
      { id: 'edmund', model: 'edmund', x: 520, z: 1730, face: [0, -1], talk: 'grave.edmund', pose: 'idle', when: 'past_gate_open' }],   // at the foot of the broken stair, on the near side (DATA_FORMAT 12)
    enemies,
    triggers: now ? [{ id: 'road_bats', ...rect(490, 420, 220, 50), event: 'bats.swoop', wake: 'bats' }, { id: 'gate_keeper', ...rect(520, 960, 160, 50), event: 'elite.gravekeeper', wake: 'gate' }, { id: 'echo_hint', ...rect(100, 1380, 1000, 50), event: 'echo.hint', wake: 'ghosts' }]
      : [{ id: 'road_corpses', ...rect(490, 240, 220, 50), event: 'past.graveroad', wake: 'road' }, { id: 'keeper_greets', ...rect(520, 960, 160, 50), event: 'keeper.greets' }, { id: 'edmund_grave', ...rect(480, 1640, 240, 60), event: 'grave.edmund' }],
    interact: [
      { id: 'valkrein_stones', kind: 'sign', x: 500, z: 1730, r: 70, label: '발크레인의 비석', event: 'sign.valkrein' },
      ...['a', 'b'].map((g, i) => (now ? { id: 'nameless_' + g, kind: 'sign', x: i ? 900 : 300, z: 1560, r: 70, label: '이름 없는 무덤', event: 'grave.nameless', data: { grave: g } } : { id: 'nameless_' + g, kind: 'grave', x: i ? 900 : 300, z: 1560, r: 70, label: '이름 새기기', event: 'grave.carve', data: { grave: g } })),
      { id: 'gate_rest', kind: 'rest', x: 540, z: 1010, r: 60, label: '촛불', event: 'rest' }, { id: 'ossuary_door', kind: 'door', x: 600, z: 1950, y: TY, r: 60, label: '배웅의 납골당', event: 'door.ossuary', locked: flags.ossuary_open ? null : 'story:ossuary' },
      // WORLD-2 (GDD 9.1 minute 58-68): the whip ring over the broken stair and the road-bell post beyond it
      { id: 'depths_ring', kind: 'ring', x: 668, z: 1868, y: TY, h: 150, r: 300, label: '채찍 걸기', event: 'ring.hook', landing: { x: 600, y: TY, z: 1905 } },
      ...(!now && !hung ? [{ id: 'road_bell', kind: 'bell', x: 500, z: 1915, y: TY, r: 70, label: '길종 걸기', event: 'bell.hang' }] : now && !hung ? [] : [{ id: 'road_bell', kind: 'bell', x: 500, z: 1915, y: TY, r: 70, label: '종 치기', event: 'bell.ring' }]),
    ],
    anchors,
  };
}
