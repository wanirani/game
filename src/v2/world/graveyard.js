// WORLD: the Misty Graveyard, tonight (GDD 9.1 minutes 36-58): the road from the village gate, the inner gate with its keeper, the grave field and the mausoleum.
// docs/v2/AREA_FORMAT.md. The 1697 twin (graveyard_past: tidy, three Valkrein stones, the keeper's hut) is not built yet - it must reuse this layout function.
import { D, rnd, inChunk, rect } from './gen.js';

export function graveyard(era = 'now') {
  const P = [], anchors = [], r = rnd(7741), add = (chunk, ...parts) => P.push(...inChunk(chunk, parts.flat()));
  const COLD = [0.7, 0.85, 1], LP = (x, z, o = {}) => ({ t: 'prop', mesh: 'lanternpost', x, z, h: 180, solid: 9, solidZ: 9, light: { r: 300, i: 1.3, y: 120, c: COLD }, c: COLD, flicker: true, ...o });
  // ground
  add('road', { t: 'floor', x: 490, z: 0, w: 220, d: 900, mat: 'dirt', kit: { mat: 'cobworn', rag: 34, strips: [{ x0: 0, x1: 46, mat: 'soil' }, { x0: 174, x1: 220, mat: 'soil' }] } },
    { t: 'floor', x: 100, z: 0, w: 346, d: 900, mat: 'dirt', walk: false, kit: { mat: 'soil', rag: 40, strips: [{ x0: 120, x1: 346, z0: 200, z1: 520, mat: 'moss' }] } },
    { t: 'floor', x: 754, z: 0, w: 346, d: 900, mat: 'dirt', walk: false, kit: { mat: 'soil', rag: 40, strips: [{ x0: 0, x1: 200, z0: 380, z1: 700, mat: 'moss' }] } },
    { t: 'blocker', x: 100, z: -60, w: 1000, d: 60, y: -400, h: 1200 });
  add('field', { t: 'floor', x: 100, z: 900, w: 1000, d: 1200, mat: 'dirt', kit: { mat: 'soil', rag: 44, strips: [{ x0: 400, x1: 600, z0: 0, z1: 1000, mat: 'cobworn' }, { x0: 60, x1: 940, z0: 560, z1: 680, mat: 'cobworn' }, { x0: 380, x1: 620, z0: 940, z1: 1110, mat: 'flags' }, { x0: 40, x1: 300, z0: 120, z1: 420, mat: 'moss' }, { x0: 700, x1: 960, z0: 760, z1: 1040, mat: 'moss' }] } });
  // walls
  add('road', { t: 'wall', x: 0, z: -60, w: 100, d: 960, h: 240, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'R', battlement: true, buttress: [200, 500, 800].map((u) => ({ side: 'R', u, h: 190, d: 20 })) } },
    { t: 'wall', x: 1100, z: -60, w: 100, d: 960, h: 240, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'L', battlement: true, buttress: [160, 460, 760].map((u) => ({ side: 'L', u, h: 190, d: 20 })) } },
    { t: 'wall', x: 446, z: 130, w: 44, d: 770, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FR', coping: true, rail: 'R', piers: 154 } },
    { t: 'wall', x: 710, z: 130, w: 44, d: 770, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FL', coping: true, rail: 'L', piers: 154 } },
    { t: 'deco', mesh: 'cemgate', x: 600, z: 96, w: 164, h: 200, open: 0.75 }, { t: 'blocker', x: 446, z: 78, w: 74, d: 52 }, { t: 'blocker', x: 680, z: 78, w: 74, d: 52 });
  add('field', { t: 'wall', x: 100, z: 900, w: 390, d: 60, h: 190, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'F', coping: true, cornice: false, rail: 'F', buttress: [{ u: 120, h: 150, d: 18 }, { u: 300, h: 150, d: 18 }] } },
    { t: 'wall', x: 710, z: 900, w: 390, d: 60, h: 190, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'F', coping: true, cornice: false, rail: 'F', buttress: [{ u: 90, h: 150, d: 18 }, { u: 270, h: 150, d: 18 }] } },
    { t: 'deco', mesh: 'cemgate', x: 600, z: 930, w: 164, h: 210, open: 0.5 }, { t: 'blocker', x: 490, z: 912, w: 30, d: 36 }, { t: 'blocker', x: 680, z: 912, w: 30, d: 36 },
    { t: 'wall', x: 0, z: 900, w: 100, d: 1290, h: 250, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'R', battlement: true, buttress: [200, 520, 840, 1160].map((u) => ({ side: 'R', u, h: 200, d: 20 })) } },
    { t: 'wall', x: 1100, z: 900, w: 100, d: 1290, h: 250, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'L', battlement: true, buttress: [130, 450, 770, 1090].map((u) => ({ side: 'L', u, h: 200, d: 20 })) } },
    { t: 'wall', x: 100, z: 2100, w: 1000, d: 90, h: 280, mat: 'facade', kit: { style: 'rubble', lower: 'fieldstone', faces: 'F', battlement: true, buttress: [{ u: 140, h: 220, d: 22 }, { u: 860, h: 220, d: 22 }] } });
  // the roadside gardens (not walkable): graves, crosses, trees
  const KINDS = ['round', 'point', 'cross', 'broken', 'round', 'obelisk', 'point'];
  for (const side of [0, 1]) for (let i = 0; i < 9; i++) {
    const x = (side ? 790 : 140) + r() * 260, z = 150 + i * 84 + r() * 30;
    add('road', { t: 'deco', mesh: 'grave', kind: KINDS[(i + side * 3) % KINDS.length], x: Math.round(x), z: Math.round(z), h: Math.round(70 + r() * 40) });
  }
  add('road', { t: 'deco', mesh: 'deadtree', x: 250, z: 420, h: 300 }, { t: 'deco', mesh: 'deadtree', x: 960, z: 640, h: 280, flip: true }, { t: 'deco', mesh: 'deadtree', x: 180, z: 800, h: 240, flip: true }, { t: 'deco', mesh: 'cross', x: 900, z: 300, h: 170 }, { t: 'deco', mesh: 'angel', x: 330, z: 640, h: 200 },
    LP(516, 300), LP(684, 620, { flip: true }));
  for (const [x, z] of [[600, 250], [600, 560], [600, 820]]) anchors.push({ id: 'mist_road_' + z, kind: 'mist', x, y: 0, z, size: 2 });
  // the grave field: rows of solid stones with clear lanes (the middle path x 500..700 and the cross path z 1460..1580 stay empty)
  const stones = [];
  for (let row = 0; row < 7; row++) for (let col = 0; col < 8; col++) {
    const x = 170 + col * 110 + (row % 2) * 40 + r() * 24, z = 1090 + row * 130 + r() * 30;
    if ((x > 470 && x < 730) || (z > 1430 && z < 1610) || z > 1900 || r() < 0.22) continue;
    stones.push([Math.round(x), Math.round(z)]);
    add('field', { t: 'prop', mesh: 'grave', kind: KINDS[(row * 3 + col) % KINDS.length], x: Math.round(x), z: Math.round(z), h: Math.round(72 + r() * 44), solid: 22, solidZ: 9, solidH: 60 });
  }
  add('field', { t: 'prop', mesh: 'mausoleum', x: 600, z: 2040, w: 200, h: 150, d: 110, solid: 104, solidZ: 60, solidH: 200 },
    { t: 'prop', mesh: 'niche', x: 330, z: 2078, w: 170, h: 160, solid: 86, solidZ: 20 }, { t: 'prop', mesh: 'niche', x: 870, z: 2078, w: 170, h: 160, solid: 86, solidZ: 20 },
    { t: 'prop', mesh: 'gargoyle', x: 450, z: 2010, h: 150 }, { t: 'prop', mesh: 'gargoyle', x: 750, z: 2010, h: 150, flip: true },
    { t: 'prop', mesh: 'angel', x: 190, z: 1520, h: 210 }, { t: 'prop', mesh: 'angel', x: 1010, z: 1520, h: 210, flip: true },
    { t: 'prop', mesh: 'deadtree', x: 180, z: 1040, h: 310 }, { t: 'prop', mesh: 'deadtree', x: 1010, z: 1900, h: 300, flip: true }, { t: 'prop', mesh: 'deadtree', x: 960, z: 1060, h: 260 }, { t: 'prop', mesh: 'deadtree', x: 200, z: 1960, h: 270, flip: true },
    { t: 'prop', mesh: 'cross', x: 400, z: 1700, h: 180, solid: 26, solidZ: 18 }, { t: 'prop', mesh: 'cross', x: 800, z: 1250, h: 170, solid: 26, solidZ: 18 },
    { t: 'prop', mesh: 'coffin', x: 770, z: 1730, solid: 54, solidZ: 20, h: 40 }, { t: 'deco', mesh: 'coffin', x: 300, z: 1300, len: 100 },
    LP(470, 1010), LP(730, 1010, { flip: true }), LP(470, 1520), LP(730, 1880, { flip: true }), LP(250, 1530), LP(950, 1530, { flip: true }),
    // the four Valkrein stones beside the middle path
    ...[[452, 1640, 'point', 120], [452, 1730, 'round', 110], [452, 1820, 'round', 110], [748, 1640, 'broken', 100]].map(([x, z, kind, h]) => ({ t: 'prop', mesh: 'grave', kind, x, z, h, solid: 26, solidZ: 10, solidH: 70 })),
    { t: 'deco', mesh: 'candles', x: 520, z: 1000, light: { r: 180, i: 1.0, y: 20 } });
  for (const [x, z] of [[300, 1200], [900, 1250], [600, 1520], [320, 1800], [880, 1820], [600, 1980]]) anchors.push({ id: `mist_${x}_${z}`, kind: 'mist', x, y: 0, z, size: 2.4 });
  anchors.push({ id: 'fog_field', kind: 'fog_bank', x: 600, y: 0, z: 1500, size: 8 });
  const S = [0, -1], N = [0, 1];
  const enemies = [
    ...[[540, 380], [660, 300]].map(([x, z]) => ({ kind: 'skeleton_soldier', x, z, group: 'road' })), ...[[600, 520], [560, 660], [650, 720]].map(([x, z]) => ({ kind: 'bat', x, z, group: 'bats' })),
    { kind: 'gravekeeper_armor', x: 600, z: 1090, group: 'gate', yard: true },
    ...[[340, 1510], [860, 1510], [600, 1700], [600, 1880]].map(([x, z]) => ({ kind: 'grave_ghost', x, z, group: 'ghosts', yard: true })),
  ];
  const camV = { yaw: 0, pitch: 14 * D, dist: 660, lookY: 62, leadX: 0, leadZ: 140, minX: 570, maxX: 630, zFollow: 1, tallK: 0.15 };
  return {
    id: 'graveyard_' + era, name: '안개의 묘지', era, twin: 'graveyard_' + (era === 'now' ? 'past' : 'now'),
    room: 'field', rooms: { road: 'alley', field: 'field' }, music: 'graveyard_mist',
    stage: {
      id: 'graveyard_' + era, name: '안개의 묘지',
      sky: { img: 'bg/s02_graveyard', crop: 0.66, span: 84 * D, bottom: -7 * D, top: [0.04, 0.06, 0.075] },
      fog: { color: [0.1, 0.135, 0.15], near: 380, far: 2300, max: 0.965 },
      light: { ambient: [0.27, 0.33, 0.38], moon: [0.42, 0.52, 0.6], moonDir: [-0.447, 0.745, -0.496] },
      sections: [
        { id: 'road', label: '묘지 가는 길', x0: 0, x1: 1200, z0: -100, z1: 900, cam: camV },
        { id: 'field', label: '안개의 묘지', x0: 0, x1: 1200, z0: 900, z1: 2300, cam: { yaw: 0, pitch: 26 * D, dist: 880, lookY: 30, leadX: 0, leadZ: 60, minX: 380, maxX: 820, zFollow: 1, tallK: 0.12 } },
      ],
      parts: P,
      decals: [[600, 200, 'puddle', 50, 40], [560, 480, 'leaves', 80, 70], [640, 760, 'moss', 40, 90], [600, 1000, 'stain', 110, 60], [320, 1500, 'leaves', 90, 60], [860, 1540, 'leaves', 90, 60], [600, 1300, 'puddle', 60, 44], [600, 1760, 'crack', 80, 50], [600, 1940, 'moss', 110, 40], [760, 1700, 'stain', 90, 50], [250, 1250, 'moss', 90, 60]].map(([x, z, k, rx, rz]) => ({ k, x, z, rx, rz })),
    },
    spawns: { default: { x: 600, z: 190, face: N, section: 'road' }, from_eshville: { x: 600, z: 190, face: N, section: 'road' }, from_ossuary: { x: 600, z: 1900, face: S, section: 'field' }, gate: { x: 600, z: 1010, face: N, section: 'field' } },
    exits: [
      { id: 'to_eshville', ...rect(530, 0, 140, 56), to: 'eshville_' + era, spawn: 'from_graveyard', label: '에슈빌', locked: null },
      { id: 'to_ossuary', ...rect(556, 1932, 88, 34), to: 'ossuary_' + era, spawn: 'entry', label: '배웅의 납골당', locked: 'story:ossuary' },
    ],
    actors: [],
    enemies,
    triggers: [{ id: 'road_bats', ...rect(490, 420, 220, 50), event: 'bats.swoop', wake: 'bats' }, { id: 'gate_keeper', ...rect(520, 960, 160, 50), event: 'elite.gravekeeper', wake: 'gate' }, { id: 'echo_hint', ...rect(100, 1380, 1000, 50), event: 'echo.hint', wake: 'ghosts' }],
    interact: [
      { id: 'valkrein_stones', kind: 'sign', x: 500, z: 1730, r: 70, label: '발크레인의 비석', event: 'sign.valkrein' },
      { id: 'nameless_a', kind: 'grave', x: 300, z: 1560, r: 70, label: '이름 새기기', event: 'grave.carve', data: { grave: 'a' } }, { id: 'nameless_b', kind: 'grave', x: 900, z: 1560, r: 70, label: '이름 새기기', event: 'grave.carve', data: { grave: 'b' } },
      { id: 'gate_rest', kind: 'rest', x: 540, z: 1010, r: 60, label: '촛불', event: 'rest' }, { id: 'ossuary_door', kind: 'door', x: 600, z: 1950, r: 60, label: '배웅의 납골당', event: 'door.ossuary', locked: 'story:ossuary' },
    ],
    anchors,
  };
}
