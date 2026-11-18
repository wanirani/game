// WORLD-LOOK: what lies beyond the edge of each area (docs/v2/AREA_FORMAT.md 16, docs/v2/ENV_KIT.md 23). The game camera looks over every
// wall that is lower than it stands (220 - 660 above the ground): behind the walls there was nothing - the fog-coloured foot of the sky
// picture and, below it, the clear colour. Here the land runs on: ground out into the fog, a road, fences, hedges, rows of trees, far
// houses, a churchyard wall, more graves. Stage parts of type 'deco' (no collision, nothing reachable), all in one chunk 'far' that is
// built from ONE material the area loads anyway (one draw call), plus a few pieces in the neighbouring chunk where its own textures fit.
// Both nights get the same pieces at the same places (the land does not move in a hundred years): only trees, windows and colours differ.

/** a tint that gives a surface drawn with the soil texture about this colour (the texture's average is 0.27, 0.24, 0.2) */
const C = (r, g, b) => [r / 0.27, g / 0.24, b / 0.2];
const far = (parts) => parts.map((p) => ({ t: 'deco', chunk: 'far', mat: 'soil', ...p }));

/** Eshville: fields and back gardens behind the house row, the road out of the west gate, the churchyard behind the church, the lane to the graveyard */
export function beyondEshville(now, cold = false) {
  const warm = now && !cold, Y = -4;
  const tree = now ? C(0.13, 0.1, 0.1) : C(0.14, 0.15, 0.12), fir = now ? C(0.11, 0.11, 0.115) : C(0.09, 0.13, 0.13), wall = now ? C(0.2, 0.17, 0.18) : C(0.24, 0.23, 0.25), roof = now ? C(0.1, 0.09, 0.1) : C(0.16, 0.13, 0.1);
  const kind = now ? 'bare' : 'round', lit = now ? 0.3 : 0.75, glow = warm ? [1, 0.42, 0.16] : [1, 0.62, 0.3];
  const H = (x, z, w, h, rh, seed, o = {}) => ({ mesh: 'farhouse', x, y: Y, z, w, d: 130, h, rh, tint: wall, roofTint: roof, lit, glow, emis: 5, seed, ...o });
  const out = far([
    // ground: behind the houses (it lies 4 under the floors, so it passes below everything built there), west of the gate wall, east of the east wall, and far out
    { mesh: 'apron', x: -2000, y: Y, z: 296, w: 8800, d: 2600, cell: 330, tile: 520, k: 0.72, strips: [
      { x0: 300, x1: 1500, z0: 380, z1: 900, tint: [0.8, 0.84, 0.8], k: 0.62 }, { x0: 2500, x1: 3900, z0: 300, z1: 800, tint: [1.12, 1.06, 0.96], k: 0.7 }, { x0: 4300, x1: 5100, z0: 900, z1: 1700, tint: [0.84, 0.88, 0.84], k: 0.62 },
      { x0: 800, x1: 2300, z0: 1100, z1: 1700, tint: [1.1, 1.04, 0.94], k: 0.66 }, { x0: 6480, x1: 6700, z0: 1204, z1: 2600, tint: [1.25, 1.2, 1.15], k: 0.8, cell: 200 } ] },   // the last strip: the lane running on to the graveyard
    { mesh: 'apron', x: -9000, y: Y, z: 0, w: 8840, d: 296, cell: 300, tile: 520, k: 0.72, skirt: 520, strips: [{ x0: 6400, x1: 8840, z0: 92, z1: 208, tint: [1.34, 1.26, 1.16], k: 0.95, cell: 240 }] },   // west: the road out of the gate (z 92..208)
    { mesh: 'apron', x: 4800, y: Y, z: 0, w: 5600, d: 296, cell: 300, tile: 520, k: 0.7, skirt: 520 },
    { mesh: 'apron', x: -160, y: Y, z: -60, w: 100, d: 60, k: 0.5, skirt: 520 }, { mesh: 'apron', x: 4700, y: Y, z: -60, w: 100, d: 60, k: 0.5, skirt: 520 },   // under the fronts of the two end walls
    { mesh: 'apron', x: -60, y: Y, z: 0.6, w: 4760, d: 3, k: 0.5, skirt: 520 },   // the front of the ground under the floors' own 220-deep fronts: the square's camera looked under them (kept in this chunk: a deeper floor makes its chunk's box taller and the street, the outskirts and the square were then all drawn together)
    { mesh: 'apron', x: -12000, y: Y, z: 2896, w: 29000, d: 14000, cell: 3600, tile: 700, k: 0.66 },
    { mesh: 'apron', x: 6800, y: Y, z: 296, w: 10200, d: 2600, cell: 1300, tile: 700, k: 0.68 }, { mesh: 'apron', x: -12000, y: Y, z: 296, w: 10000, d: 2600, cell: 1300, tile: 700, k: 0.68 },
    // far out, a bank of land that rises just over the horizon: where the ground ends the picture goes on into the sky's own haze, not into a bare strip of its foot
    { mesh: 'ridge', x: -12000, y: Y, z: 16000, x1: 17000, z1: 16000, h: 980, amp: 0.12, seg: 2400, depth: 700, tint: C(0.2, 0.2, 0.22), seed: 3 },
    { mesh: 'ridge', x: -11800, y: Y, z: 300, x1: -11800, z1: 16000, h: 980, amp: 0.12, seg: 2400, depth: 700, tint: C(0.2, 0.2, 0.22), seed: 5, to: [2000, 8000] },
    { mesh: 'ridge', x: 16800, y: Y, z: 300, x1: 16800, z1: 16000, h: 980, amp: 0.12, seg: 2400, depth: 700, tint: C(0.2, 0.2, 0.22), seed: 7, to: [2000, 8000] },
    // the road west: a row of trees on either side, a hedge, a farm
    { mesh: 'treeline', x: -230, y: Y, z: 44, x1: -2300, z1: 20, n: 8, h: 330, hv: 0.3, wob: 26, kind, tint: tree, seed: 4 },
    { mesh: 'treeline', x: -210, y: Y, z: 262, x1: -2300, z1: 300, n: 7, h: 350, hv: 0.3, wob: 26, kind, tint: tree, seed: 9 },
    { mesh: 'ridge', x: -180, y: Y, z: 222, x1: -1700, z1: 232, h: 46, amp: 0.25, seg: 90, depth: 18, tint: fir, seed: 2 }, { mesh: 'ridge', x: -180, y: Y, z: 78, x1: -1700, z1: 70, h: 40, amp: 0.3, seg: 90, depth: 16, tint: fir, seed: 8 },
    H(-640, 470, 250, 150, 86, 3), H(-1320, 560, 200, 130, 80, 5, { lit: lit * 0.6 }),
    // behind the house row: back gardens, a row of trees, far houses, firs
    { mesh: 'ridge', x: -100, y: Y, z: 468, x1: 3200, z1: 476, h: 46, amp: 0.3, seg: 110, depth: 20, tint: fir, seed: 6 },
    { mesh: 'treeline', x: -150, y: Y, z: 560, x1: 3180, z1: 600, n: 15, h: 330, hv: 0.34, wob: 60, kind, tint: tree, seed: 12 },
    H(240, 760, 260, 160, 90, 7), H(900, 860, 220, 140, 84, 8), H(1560, 780, 300, 180, 96, 11), H(2260, 900, 230, 150, 86, 13), H(2860, 800, 260, 170, 92, 17),
    { mesh: 'treeline', x: -900, y: Y, z: 1240, x1: 3100, z1: 1300, n: 16, h: 420, hv: 0.3, wob: 90, kind: 'fir', tint: fir, seed: 21 },
    { mesh: 'treeline', x: -1600, y: Y, z: 2100, x1: 6400, z1: 2200, n: 26, h: 470, hv: 0.3, wob: 120, kind: 'fir', tint: fir, seed: 25 },
    // behind the church: graves along the churchyard wall, firs, roofs
    { mesh: 'gravefield', x: 3340, y: Y, z: 1790, w: 1300, d: 150, n: 16, h: 64, tint: wall, seed: 3 },
    { mesh: 'treeline', x: 3140, y: Y, z: 2010, x1: 4860, z1: 2030, n: 10, h: 520, hv: 0.25, wob: 40, kind: 'fir', tint: fir, seed: 31 },
    H(3440, 2180, 280, 230, 120, 19), H(4020, 2260, 320, 260, 130, 23), H(4560, 2160, 240, 210, 110, 29),
    // east of the east wall: a hedge, trees, a house
    { mesh: 'treeline', x: 4960, y: Y, z: 60, x1: 5020, z1: 1700, n: 9, h: 380, hv: 0.3, wob: 60, kind, tint: tree, seed: 33 },
    H(5300, 700, 260, 170, 92, 37), H(5560, 1500, 230, 150, 86, 41),
    // the lane to the graveyard beyond the end of the walkable road: low walls, a row of stones, bare trees
    { mesh: 'gravefield', x: 4720, y: Y, z: 1640, w: 260, d: 700, n: 12, h: 70, tint: wall, seed: 5 },
    { mesh: 'treeline', x: 4440, y: Y, z: 1560, x1: 4430, z1: 2500, n: 5, h: 300, hv: 0.3, wob: 24, kind: 'bare', tint: tree, seed: 43 },
  ]);
  // the churchyard wall behind the church and the lane's low walls: real masonry (the second and last texture of the far chunk)
  const east = [
    { t: 'deco', chunk: 'far', mesh: 'farwall', x: 3100, y: Y, z: 1960, x1: 4900, z1: 1960, h: 150, mat: 'fieldstone', piers: 300, k: 0.8 },
    { t: 'deco', chunk: 'far', mesh: 'farwall', x: 4478, y: Y, z: 1500, x1: 4478, z1: 2500, h: 60, mat: 'fieldstone', piers: 250, k: 0.8, to: [4590, 2000] },
    { t: 'deco', chunk: 'far', mesh: 'farwall', x: 4702, y: Y, z: 1500, x1: 4702, z1: 2500, h: 60, mat: 'fieldstone', piers: 250, k: 0.8, to: [4590, 2000] },
  ];
  return [...out, ...east];   // (wooden fences along the west road were tried in the outskirts chunk: its 'wood' then no longer folded into the oak texture - one more texture loaded, +1.4 MB; the road runs between two hedges instead)
}

/** the Misty Graveyard: the cemetery goes on beyond its walls - more stones, bare trees, a far chapel, low hills */
export function beyondGraveyard(now) {
  const Y = -4, stone = now ? C(0.17, 0.2, 0.23) : C(0.2, 0.22, 0.28), tree = now ? C(0.07, 0.085, 0.1) : C(0.08, 0.09, 0.12), hill = now ? C(0.1, 0.125, 0.14) : C(0.09, 0.105, 0.15), lit = now ? 0 : 0.6;
  return far([
    { mesh: 'apron', x: -2600, y: Y, z: -60, w: 2610, d: 3180, cell: 330, tile: 520, k: 0.7, skirt: 420 }, { mesh: 'apron', x: 1190, y: Y, z: -60, w: 2610, d: 3180, cell: 330, tile: 520, k: 0.7, skirt: 420 },
    { mesh: 'apron', x: 0, y: Y, z: 2180, w: 1200, d: 940, cell: 300, tile: 520, k: 0.7 },
    { mesh: 'apron', x: 10, y: Y, z: 0.6, w: 1180, d: 3, k: 0.5, skirt: 520 },   // the front of the ground under the road's and the gardens' own fronts
    { mesh: 'apron', x: -12000, y: Y, z: 3100, w: 25200, d: 14000, cell: 3600, tile: 700, k: 0.64 }, { mesh: 'apron', x: -12000, y: Y, z: -60, w: 9400, d: 3180, cell: 1600, tile: 700, k: 0.66, skirt: 420 }, { mesh: 'apron', x: 3800, y: Y, z: -60, w: 9400, d: 3180, cell: 1600, tile: 700, k: 0.66, skirt: 420 },
    // graves outside the walls, thinning out with the distance
    { mesh: 'gravefield', x: -520, y: Y, z: 120, w: 480, d: 760, n: 22, h: 80, tint: stone, seed: 2 }, { mesh: 'gravefield', x: 1240, y: Y, z: 120, w: 480, d: 760, n: 22, h: 80, tint: stone, seed: 5 },
    { mesh: 'gravefield', x: -620, y: Y, z: 960, w: 580, d: 1200, n: 30, h: 84, tint: stone, seed: 7 }, { mesh: 'gravefield', x: 1240, y: Y, z: 960, w: 580, d: 1200, n: 30, h: 84, tint: stone, seed: 11 },
    { mesh: 'gravefield', x: -1500, y: Y, z: 300, w: 800, d: 2200, n: 20, h: 90, tint: stone, seed: 13 }, { mesh: 'gravefield', x: 1900, y: Y, z: 300, w: 800, d: 2200, n: 20, h: 90, tint: stone, seed: 17 },
    { mesh: 'gravefield', x: 60, y: Y, z: 2230, w: 1080, d: 500, n: 22, h: 90, tint: stone, seed: 19 },
    // bare trees and a far chapel
    { mesh: 'treeline', x: -330, y: Y, z: 60, x1: -420, z1: 2300, n: 9, h: 360, hv: 0.35, wob: 110, kind: 'bare', tint: tree, seed: 3 },
    { mesh: 'treeline', x: 1540, y: Y, z: 40, x1: 1640, z1: 2300, n: 9, h: 360, hv: 0.35, wob: 110, kind: 'bare', tint: tree, seed: 8 },
    { mesh: 'treeline', x: -1300, y: Y, z: 2460, x1: 2500, z1: 2560, n: 16, h: 430, hv: 0.3, wob: 120, kind: 'bare', tint: tree, seed: 14 },
    { mesh: 'farhouse', x: -900, y: Y, z: 1500, w: 190, d: 150, h: 170, rh: 150, tint: stone, roofTint: hill, lit, glow: [0.7, 0.9, 1], emis: 5, seed: 4 },
    { mesh: 'farhouse', x: 2100, y: Y, z: 1100, w: 170, d: 140, h: 150, rh: 140, tint: stone, roofTint: hill, lit: 0, seed: 6 },
    // low hills behind everything: dark shapes in the mist; far out a bank that rises just over the horizon
    { mesh: 'ridge', x: -12000, y: Y, z: 16500, x1: 13200, z1: 16500, h: 900, amp: 0.12, seg: 2400, depth: 700, tint: hill, seed: 21 },
    { mesh: 'ridge', x: -11800, y: Y, z: -60, x1: -11800, z1: 16500, h: 900, amp: 0.12, seg: 2400, depth: 700, tint: hill, seed: 23, to: [600, 8000] },
    { mesh: 'ridge', x: 13000, y: Y, z: -60, x1: 13000, z1: 16500, h: 900, amp: 0.12, seg: 2400, depth: 700, tint: hill, seed: 27, to: [600, 8000] },
    { mesh: 'ridge', x: -3200, y: Y, z: 2900, x1: 4400, z1: 3000, h: 300, amp: 0.4, seg: 260, depth: 420, tint: hill, seed: 5 },
    { mesh: 'ridge', x: -2700, y: Y, z: 200, x1: -2500, z1: 3000, h: 260, amp: 0.4, seg: 260, depth: 380, tint: hill, seed: 9, to: [600, 1500] },
    { mesh: 'ridge', x: 3700, y: Y, z: 200, x1: 3900, z1: 3000, h: 260, amp: 0.4, seg: 260, depth: 380, tint: hill, seed: 12, to: [600, 1500] },
  ]);
}
