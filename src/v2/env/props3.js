// env kit - props added by the WORLD-2 lane (docs/v2/ENV_KIT.md 18). Same shape as props2.js: PROPS[name](G, x, y, z, o).
// Code-built: the whip ring, the road-bell post, foot bridges, tower faces and timber, bone heaps - shapes that must be exact or change with story flags.
// The crypt furniture (sarcophagus, coffin stack, bone pile, skull wall, candelabrum, chandelier, altar, mourner, crypt door, wooden stairs) has a
// plain code-built stand-in here; when the baked pack holds a generated model of the same name, build.js uses that instead.
import { Frame, hash } from './geo.js';
import { PROPS } from './props.js';
import { bakedDef, bakedProp } from './baked.js';

const fx = (G) => G.fx ?? (G.fx = { glows: [], pools: [], shadows: [] });
const shadow = (G, x, y, z, rx, rz = rx * 0.62, a = 0.5) => fx(G).shadows.push({ x, y, z, rx, rz, a });
const IRON = [0.46, 0.46, 0.52], RUST = [0.78, 0.44, 0.3], BRONZE = [1.55, 1.08, 0.5], VERDI = [0.62, 0.86, 0.72], WAX = [0.95, 0.9, 0.74], BONE = [1.06, 1.0, 0.86];
export const RING_GLOW = [0.62, 0.86, 1.0];   // the colour of every whip ring (pale bell-silver blue): readable at night in both eras
/** a ring of tube segments in the plane facing the camera (normal -z), centre (x, y, z) */
function torus(G, mat, x, y, z, R, r, seg, o) {
  for (let i = 0; i < seg; i++) { const a = i * 2 * Math.PI / seg, b = (i + 1) * 2 * Math.PI / seg; G.tube(mat, [x + Math.cos(a) * R, y + Math.sin(a) * R, z], [x + Math.cos(b) * R, y + Math.sin(b) * R, z], r, r, 4, { keep: true, ...o }); }
}
const candle = (G, cx, y, cz, ch, r = 2.6, lit = true) => {
  G.lathe('white', cx, cz, [[r, y], [r * 0.86, y + ch]], 5, { tint: WAX, vary: 0, cap: true });
  if (lit) G.tri('white', [cx - 2.2, y + ch, cz - 1], [cx + 2.2, y + ch, cz - 1], [cx, y + ch + 9, cz - 1], [0, 0, -1], { emis: 1.6, tint: [1, 0.8, 0.4], fog: 0.4, keep: true });
};

Object.assign(PROPS, {
  /**
   * Whip ring: an iron ring on a bracket with a faint glow (the hero's whip hooks onto it - AREA_FORMAT 13, interact kind 'ring').
   * o.h = height of the ring's centre above y (default 150). o.mount: 'post' (default: a stout post under the bracket) | 'wall' (bracket only: a wall or
   * a beam stands right behind, +z) | 'hang' (hangs on a chain from above, o.drop = chain length). o.c = glow colour. o.lit === false = dead ring.
   */
  whipring(G, x, y, z, o = {}) {
    const h = o.h ?? 150, R = o.R ?? 15, m = o.mount ?? 'post', lit = o.lit !== false, c = o.c ?? RING_GLOW, I = { tint: IRON, vary: 0, keep: true }, zr = z - 16, cy = y + h;
    if (m === 'post') {
      G.box('stone', x - 13, y, z - 13, x + 13, y + 16, z + 13, { faces: 'FLRT', top: 'trimstone' });
      G.box('timber', x - 6.5, y + 16, z - 6.5, x + 6.5, cy + R + 22, z + 6.5, { faces: 'FLRT', vary: 0.2 });
      for (const yy of [y + 40, cy - R - 20]) G.box('metal', x - 7.6, yy, z - 7.6, x + 7.6, yy + 5, z + 7.6, { faces: 'FLR', ...I });
      G.tube('metal', [x, cy + R + 12, z - 4], [x, cy + R + 10, zr], 3, 3, 4, I); G.tube('metal', [x, cy - R - 14, z - 6], [x, cy + R + 8, zr + 3], 2.2, 2.2, 4, I);
      shadow(G, x, y, z, 20, 14, 0.5);
    } else if (m === 'wall') {
      G.box('metal', x - 9, cy + R + 2, z - 3, x + 9, cy + R + 22, z + 1, { faces: 'FLRT', ...I });
      G.tube('metal', [x, cy + R + 14, z - 2], [x, cy + R + 10, zr], 3, 3, 4, I); G.tube('metal', [x, cy + R - 8, z - 2], [x, cy + R + 8, zr + 3], 2.2, 2.2, 4, I);
    } else {
      const top = cy + R + (o.drop ?? 120);
      for (let yy = cy + R + 4; yy < top; yy += 12) G.tube('metal', [x + ((yy / 12) & 1 ? 1.5 : -1.5), yy, zr], [x + ((yy / 12) & 1 ? -1.5 : 1.5), Math.min(top, yy + 12), zr], 1.7, 1.7, 4, I);
    }
    G.tube('metal', [x, cy + R + 10, zr], [x, cy + R - 2, zr], 2.4, 2.4, 4, I);                      // the eye the ring hangs from
    torus(G, 'metal', x, cy, zr, R, 3.1, 10, { tint: lit ? [0.62, 0.66, 0.78] : IRON, vary: 0 });       // the ring itself: thick, readable at 150 px distance
    if (lit) {
      torus(G, 'white', x, cy, zr - 2.6, R, 1.25, 10, { emis: 1.25, tint: c, fog: 0.5 });               // a thin lit line on the ring's face
      fx(G).glows.push({ x, y: cy, z: zr - 5, r: R * 2.6, c, flicker: false });
      if (m === 'post') fx(G).pools.push({ x, y, z: z - 10, r: 86, c, a: 0.2, flicker: false });
    }
  },
  /**
   * Road-bell post: a stone-footed oak post with an arm and a hook. o.state: 'empty' (default) | 'hung' (a new bronze bell) | 'rusty' (the same bell a hundred
   * years later: green and rust, the rope gone). o.h = post height (default 176).
   */
  roadbell(G, x, y, z, o = {}) {
    const h = o.h ?? 176, s = h / 176, st = o.state ?? 'empty', old = st === 'rusty' || o.old, T = { vary: 0.25, tint: old ? [0.62, 0.6, 0.62] : [0.95, 0.86, 0.8] }, I = { tint: old ? RUST : IRON, vary: 0.1, keep: true };
    G.box('stone', x - 20 * s, y, z - 18 * s, x + 20 * s, y + 12 * s, z + 18 * s, { faces: 'FLRT', top: 'trimstone' });
    G.box('stone', x - 14 * s, y + 12 * s, z - 13 * s, x + 14 * s, y + 26 * s, z + 13 * s, { faces: 'FLRT', top: 'trimstone' });
    G.box('timber', x - 8 * s, y + 26 * s, z - 8 * s, x + 8 * s, y + h, z + 8 * s, { faces: 'FLRT', ...T });
    G.box('timber', x - 12 * s, y + h, z - 12 * s, x + 12 * s, y + h + 7 * s, z + 12 * s, { faces: 'FLRT', ...T });                    // cap
    const ax = x + 46 * s, ay = y + h - 22 * s;
    G.box('timber', x - 16 * s, ay, z - 6 * s, ax + 6 * s, ay + 12 * s, z + 6 * s, { faces: 'FLRT', ...T });                                // arm
    G.tube('timber', [x + 6 * s, ay - 44 * s, z - 2 * s], [ax - 10 * s, ay + 2 * s, z - 2 * s], 4.4 * s, 4.4 * s, 4, { keep: true, ...T });   // brace
    for (const u of [x - 9 * s, ax - 3 * s]) G.box('metal', u - 3 * s, ay - 2 * s, z - 7.5 * s, u + 3 * s, ay + 14 * s, z + 7.5 * s, { faces: 'FLRT', ...I });
    const bx = ax - 12 * s, hy = ay - 12 * s;
    G.tube('metal', [bx, ay, z - 3 * s], [bx, hy, z - 3 * s], 1.8 * s, 1.8 * s, 4, I);                                                        // hook
    G.tube('metal', [bx, hy, z - 3 * s], [bx + 4 * s, hy - 4 * s, z - 3 * s], 1.8 * s, 1.4 * s, 4, I);
    if (st !== 'empty') {
      const yb = hy - 42 * s, B = { tint: old ? VERDI : BRONZE, vary: old ? 0.45 : 0.22 };
      G.lathe('metal', bx, z - 3 * s, [[15 * s, yb], [14 * s, yb + 3 * s], [11 * s, yb + 9 * s], [9 * s, yb + 20 * s], [7.6 * s, yb + 29 * s], [4.4 * s, yb + 35 * s], [1.6 * s, yb + 38 * s]], 10, { ...B, cap: true });
      G.lathe('metal', bx, z - 3 * s, [[15.5 * s, yb + 0.8 * s], [15.5 * s, yb + 3.4 * s]], 10, { tint: old ? [0.9, 0.56, 0.36] : [1.9, 1.4, 0.7], vary: 0 });
      G.lathe('metal', bx, z - 3 * s, [[2 * s, yb - 5 * s], [3 * s, yb - 1.5 * s], [1.6 * s, yb + 3 * s]], 5, { vary: 0, k: 0.7 });                 // clapper
      if (!old) G.tube('cloth', [bx, yb - 4 * s, z - 4 * s], [bx + 3 * s, yb - 44 * s, z - 6 * s], 1.7 * s, 1.7 * s, 4, { tint: [0.95, 0.82, 0.6], keep: true });
      fx(G).glows.push({ x: bx, y: yb + 16 * s, z: z - 20 * s, r: 34 * s, c: old ? [0.6, 0.86, 0.9] : [1, 0.82, 0.5], flicker: false });     // the bell sigil's faint light: this is a place to cross
    }
    shadow(G, x, y, z, 26 * s, 18 * s, 0.5);
  },
  /** Foot bridge laid over a gap (a walkable prop: give the part walk: true, solid = half width, solidZ = half length, solidH = thickness, y = top - thickness).
   *  o.kind: 'planks' (default: boards on two beams) | 'slab' (old stone slabs). o.w (x width), o.len (z length), o.th (thickness, default 12) */
  footbridge(G, x, y, z, o = {}) {
    const w = o.w ?? 70, L = o.len ?? 240, th = o.th ?? o.solidH ?? 12, top = y + th, x0 = x - w / 2, z0 = z - L / 2, stone = o.kind === 'slab';
    if (stone) {
      const n = Math.max(2, Math.round(L / 62));
      for (let i = 0; i < n; i++) { const a = z0 + L * i / n + 1.2, b = z0 + L * (i + 1) / n - 1.2, j = (hash(i, x) - 0.5) * 5; G.box('trimstone', x0 + j, y, a, x0 + w + j, top - 1.5 * hash(x, i), b, { faces: 'FLRT', vary: 0.3, k: 0.86 + 0.2 * hash(i + 3, z) }); }
    } else {
      for (const sx of [0.16, 0.84]) G.box('timber', x0 + w * sx - 5, y - 6, z0 - 8, x0 + w * sx + 5, top - 4, z0 + L + 8, { faces: 'FLRT', vary: 0.2, k: 0.8 });
      const n = Math.max(3, Math.round(L / 17));
      for (let i = 0; i < n; i++) { const a = z0 + L * i / n + 0.8, b = z0 + L * (i + 1) / n - 0.8, j = (hash(i, x + z) - 0.5) * 7; G.box('wood', x0 + j, top - 4, a, x0 + w + j, top - 1.2 * hash(z, i), b, { faces: 'FLRT', vary: 0.3, k: 0.8 + 0.3 * hash(i + 7, x), tint: o.tint ?? [0.82, 0.7, 0.62] }); }
    }
  },
  /** A wall face under a terrace edge (deco, no collision): dressed stone courses, a coping lip, oak joist ends. o.w, o.h; the face is at z, bottom y. o.mat */
  towerface(G, x, y, z, o = {}) {
    const w = o.w ?? 200, h = o.h ?? 110, x0 = x - w / 2, F = new Frame(x0, z, 0, -1);
    G.shade = (px, py) => 0.55 + 0.45 * Math.min(1, (py - y) / 60);
    F.face(G, o.mat ?? 'ashlar', 0, w, y, y + h - 8, 0.5, { cell: 44, vary: 0.3 });
    G.shade = null;
    F.box(G, 'trimstone', -2, w + 2, y + h - 8, y + h + 0.6, -1, 5, { faces: 'FLRT', vary: 0.12 });
    for (let u = 22; u < w - 10; u += o.step ?? 58) F.box(G, 'timber', u - 5.5, u + 5.5, y + h - 26, y + h - 12, 0, 8, { faces: 'FLRT', vary: 0.2, k: 0.9 });
    if (o.slit) for (const u of [].concat(o.slit)) { F.face(G, 'white', u - 5, u + 5, y + h * 0.3, y + h * 0.72, 0.9, { tint: [0.05, 0.05, 0.07], vary: 0 }); F.box(G, 'trimstone', u - 8, u + 8, y + h * 0.3 - 5, y + h * 0.3, 0, 4, { faces: 'FLRT', vary: 0.1 }); }
  },
  /** A heavy oak beam (deco): from (x, y, z) along +x for o.len, o.r thick; o.posts = add two posts down to o.floor. o.dz = along z instead */
  beam(G, x, y, z, o = {}) {
    const L = o.len ?? 300, r = o.r ?? 9, T = { faces: 'FLRTB', vary: 0.22, k: o.k ?? 0.9 };
    if (o.dz) G.box('timber', x - r, y - r, z, x + r, y + r, z + L, T); else G.box('timber', x, y - r, z - r, x + L, y + r, z + r, T);
    if (o.posts != null) for (const u of [0.04, 0.96]) { const px = o.dz ? x : x + L * u, pz = o.dz ? z + L * u : z; G.box('timber', px - r, o.posts, pz - r, px + r, y - r, pz + r, { faces: 'FLR', vary: 0.22, k: 0.85 }); }
  },
  /** A long rope or chain hanging straight down from (x, y + o.len, z) to (x, y, z) (deco). o.chain */
  rope(G, x, y, z, o = {}) {
    const L = o.len ?? 300;
    if (o.chain) { for (let yy = y; yy < y + L; yy += 12) G.tube('metal', [x + ((yy / 12) & 1 ? 1.6 : -1.6), yy, z], [x + ((yy / 12) & 1 ? -1.6 : 1.6), Math.min(y + L, yy + 12), z], 1.8, 1.8, 4, { tint: IRON, vary: 0, keep: true }); return; }
    G.tube('cloth', [x + 3, y, z - 2], [x, y + L, z], 2.6, 2.6, 5, { tint: [0.95, 0.82, 0.6], keep: true, vary: 0.2 });
    G.lathe('cloth', x + 3, z - 2, [[4.6, y - 14], [5.2, y - 6], [2.8, y + 2]], 6, { tint: [0.8, 0.3, 0.26], vary: 0.1 });   // the red grip at the end of the bell rope
  },
  /** A hanging bat cluster under a beam (deco): dark folded shapes, a few red eye points. o.n */
  roost(G, x, y, z, o = {}) {
    for (let i = 0; i < (o.n ?? 6); i++) {
      const bx = x + (i - (o.n ?? 6) / 2) * 15 + (hash(i, x) - 0.5) * 8, hh = 20 + 9 * hash(x, i), bw = 5 + 3 * hash(i + 2, z), zz = z - 2 - 5 * hash(i, z);
      G.lathe('cloth', bx, zz, [[0.6, y - hh], [bw, y - hh * 0.72], [bw * 0.9, y - hh * 0.3], [1.4, y]], 5, { tint: [0.17, 0.15, 0.2], vary: 0.2 });
      for (const sx of [-1, 1]) G.tri('white', [bx + sx * 1.2, y - hh * 0.8, zz - bw - 0.4], [bx + sx * 2.6, y - hh * 0.8, zz - bw - 0.4], [bx + sx * 1.9, y - hh * 0.8 + 1.6, zz - bw - 0.4], [0, 0, -1], { emis: 1.2, tint: [1, 0.25, 0.2], fog: 0.5, keep: true });
    }
  },
  /** Heap of rotten planks (what a wooden crate is after a hundred years). o.w */
  debris(G, x, y, z, o = {}) {
    const w = o.w ?? 90;
    for (let i = 0; i < 7; i++) { const a = hash(i, x) * 3.1, l = w * (0.3 + 0.3 * hash(x, i)), cx = x + (hash(i + 5, z) - 0.5) * w * 0.7, cz = z + (hash(z, i) - 0.5) * w * 0.4, dx = Math.cos(a) * l / 2, dz = Math.sin(a) * l / 4; G.tube('wood', [cx - dx, y + 2 + 5 * hash(i, 9), cz - dz], [cx + dx, y + 3 + 9 * hash(9, i), cz + dz], 3.4, 2.6, 4, { tint: [0.5, 0.42, 0.38], vary: 0.3, keep: true }); }
    G.lathe('dirt', x, z, [[w * 0.5, y], [w * 0.3, y + 5], [0, y + 8]], 8, { tint: [0.55, 0.48, 0.42], sq: 0.55, vary: 0.3 });
  },
  /** Heap of broken stone steps and blocks (the fallen stair). o.w, o.h */
  rubble(G, x, y, z, o = {}) {
    const w = o.w ?? 140, h = o.h ?? 60;
    G.lathe('fieldstone', x, z, [[w * 0.52, y], [w * 0.4, y + h * 0.35], [w * 0.2, y + h * 0.75], [0, y + h * 0.9]], 9, { sq: 0.6, vary: 0.4, k: 0.8 });
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + hash(i, x), rr = w * (0.1 + 0.34 * hash(x, i)), bx = x + Math.cos(a) * rr, bz = z + Math.sin(a) * rr * 0.5 - 6, t = 1 - rr / (w * 0.5), by = y + h * 0.75 * t, bw = 12 + 16 * hash(i + 3, z), bh = 7 + 9 * hash(z, i);
      G.box(i % 3 ? 'trimstone' : 'stone', bx - bw, by, bz - bw * 0.5, bx + bw, by + bh, bz + bw * 0.5, { faces: 'FLRT', vary: 0.3, k: 0.8 + 0.3 * hash(i, 7) });
    }
    shadow(G, x, y, z, w * 0.6, w * 0.34, 0.45);
  },
  /** A plain dressed stone block (a plinth, a stepping stone wedged into a gap). o.w, o.d, o.h; the block rises from y to y + h */
  stoneblock(G, x, y, z, o = {}) {
    const w = o.w ?? 120, d = o.d ?? 120, h = o.h ?? 60;
    G.box('ashlar', x - w / 2, y, z - d / 2, x + w / 2, y + h - 8, z + d / 2, { faces: 'FLR', cell: 44, vary: 0.3 });
    G.box('trimstone', x - w / 2 - 2, y + h - 8, z - d / 2 - 2, x + w / 2 + 2, y + h, z + d / 2 + 2, { faces: 'FLRT', vary: 0.2, top: 'slabs' });
  },
  // ───────────── stand-ins for the generated crypt furniture (used only while the pack has no model of that name) ─────────────
  sarcophagus(G, x, y, z, o = {}) {
    const h = o.h ?? 70, s = h / 70, w = 74 * s, d = 30 * s;
    G.box('stone', x - w - 8 * s, y, z - d - 8 * s, x + w + 8 * s, y + 10 * s, z + d + 8 * s, { faces: 'FLRT', top: 'trimstone' });
    G.box('ashlar', x - w, y + 10 * s, z - d, x + w, y + 52 * s, z + d, { faces: 'FLR', cell: 40 });
    G.box('trimstone', x - w - 5 * s, y + 52 * s, z - d - 5 * s, x + w + 5 * s, y + 62 * s, z + d + 5 * s, { faces: 'FLRT', vary: 0.15 });
    G.box('trimstone', x - w * 0.8, y + 62 * s, z - d * 0.6, x + w * 0.8, y + 70 * s, z + d * 0.6, { faces: 'FLRT', vary: 0.2 });
    shadow(G, x, y, z, w * 1.2, d * 1.3, 0.5);
  },
  coffinstack(G, x, y, z, o = {}) {
    const h = o.h ?? 120, s = h / 120;
    for (const [dx, dy, dz, len] of [[-44, 0, 0, 84], [44, 0, 4, 84], [0, 0, -18, 84], [-22, 38, 0, 80], [24, 38, 2, 80], [2, 76, 0, 76]]) PROPS.coffin(G, x + dx * s, y + dy * s, z + dz * s, { len: len * s, tint: [0.42, 0.36, 0.36] });
  },
  bonepile(G, x, y, z, o = {}) {
    const h = o.h ?? 46, r = (o.w ?? h * 2.6) / 2;
    G.lathe('bone', x, z, [[r, y], [r * 0.86, y + h * 0.4], [r * 0.5, y + h * 0.82], [r * 0.12, y + h]], 9, { sq: 0.62, tint: BONE, vary: 0.3, cap: true });
    shadow(G, x, y, z, r * 1.1, r * 0.7, 0.45);
  },
  skullwall(G, x, y, z, o = {}) { PROPS.niche(G, x, y, z, { ...o, w: o.w ?? (o.h ?? 160) * 1.4 }); },
  candelabrum(G, x, y, z, o = {}) {
    const h = o.h ?? 150, s = h / 150, lit = o.lit !== false, I = { tint: IRON, vary: 0.1 };
    G.lathe('metal', x, z, [[20 * s, y], [18 * s, y + 5 * s], [6 * s, y + 14 * s], [5 * s, y + 60 * s], [8 * s, y + 66 * s], [5 * s, y + 72 * s], [5 * s, y + 112 * s], [22 * s, y + 124 * s], [24 * s, y + 130 * s]], 8, { ...I, cap: true });
    for (let i = 0; i < 5; i++) { const a = i * 1.257 + 0.4; candle(G, x + Math.cos(a) * 13 * s * (i ? 1 : 0), y + 130 * s, z + Math.sin(a) * 9 * s * (i ? 1 : 0) - 2, (12 + 8 * hash(i, x)) * s, 3.4 * s, lit); }
    if (lit) { fx(G).glows.push({ x, y: y + 150 * s, z: z - 10, r: 56 * s, c: [1, 0.74, 0.38], flicker: true }); fx(G).pools.push({ x, y, z, r: 150, c: [1, 0.66, 0.3], a: 0.3, flicker: true }); }
    shadow(G, x, y, z, 22 * s, 15 * s, 0.5);
  },
  chandelier(G, x, y, z, o = {}) {
    const h = o.h ?? 90, s = h / 90, R = 44 * s, lit = o.lit !== false, I = { tint: IRON, vary: 0.1, keep: true };
    G.lathe('metal', x, z, [[R, y], [R + 3 * s, y + 3 * s], [R + 3 * s, y + 9 * s], [R, y + 12 * s]], 10, { ...I, sq: 0.7 });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.6; G.tube('metal', [x + Math.cos(a) * R, y + 10 * s, z + Math.sin(a) * R * 0.7], [x, y + h, z], 2 * s, 2 * s, 4, I); }
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (Math.sin(a) > 0.5) continue; candle(G, x + Math.cos(a) * R, y + 12 * s, z + Math.sin(a) * R * 0.7, (10 + 6 * hash(i, x)) * s, 3.2 * s, lit); }
    if (lit) fx(G).glows.push({ x, y: y + 26 * s, z: z - R, r: 80 * s, c: [1, 0.74, 0.38], flicker: true });
  },
  altar(G, x, y, z, o = {}) {
    const h = o.h ?? 78, s = h / 78, w = 70 * s, d = 28 * s;
    G.box('stone', x - w - 10 * s, y, z - d - 12 * s, x + w + 10 * s, y + 9 * s, z + d, { faces: 'FLRT', top: 'trimstone' });
    G.box('ashlar', x - w, y + 9 * s, z - d, x + w, y + 60 * s, z + d, { faces: 'FLR', cell: 40 });
    G.box('trimstone', x - w - 7 * s, y + 60 * s, z - d - 7 * s, x + w + 7 * s, y + 70 * s, z + d + 4 * s, { faces: 'FLRT', vary: 0.15 });
    for (const sx of [-1, 1]) candle(G, x + sx * w * 0.7, y + 70 * s, z - 4 * s, 18 * s, 4 * s, o.lit !== false);
    if (o.lit !== false) fx(G).glows.push({ x, y: y + 96 * s, z: z - d - 6, r: 60 * s, c: [1, 0.74, 0.38], flicker: true });
    shadow(G, x, y, z, w * 1.2, d * 1.3, 0.5);
  },
  mourner(G, x, y, z, o = {}) { PROPS.statue(G, x, y, z, o); },
  cryptdoor(G, x, y, z, o = {}) {
    const h = o.h ?? 190, s = h / 190, w = 62 * s, F = new Frame(x - w - 22 * s, z, 0, -1);
    F.box(G, 'ashlar', 0, 22 * s, y, y + h * 0.72, -20 * s, 6 * s, { faces: 'FLRT', cell: 40 }); F.box(G, 'ashlar', 2 * w + 22 * s, 2 * w + 44 * s, y, y + h * 0.72, -20 * s, 6 * s, { faces: 'FLRT', cell: 40 });
    F.box(G, 'trimstone', -4 * s, 2 * w + 48 * s, y + h * 0.72, y + h, -20 * s, 8 * s, { faces: 'FLRT', vary: 0.2 });
    F.face(G, 'darkwood', 22 * s, 2 * w + 22 * s, y, y + h * 0.72, -4 * s, { vary: 0.3 });
    for (const yy of [0.14, 0.4, 0.62]) F.box(G, 'metal', 22 * s, 2 * w + 22 * s, y + h * yy, y + h * yy + 7 * s, -4 * s, -1.5 * s, { faces: 'FT', tint: IRON, vary: 0 });
    F.box(G, 'stone', 12 * s, 2 * w + 32 * s, y, y + 7 * s, -4 * s, 16 * s, { faces: 'FLRT', top: 'trimstone' });
  },
  stairs(G, x, y, z, o = {}) {
    const h = o.h ?? 110, s = h / 110, w = 60 * s, L = 110 * s, n = 8;
    for (let i = 0; i < n; i++) G.box('wood', x - w, y, z - L / 2 + L * i / n, x + w, y + h * (i + 1) / n, z - L / 2 + L * (i + 1) / n, { faces: 'FLRT', vary: 0.3, tint: [0.8, 0.68, 0.6] });
  },
});

/** names of generated models that take over a code-built prop under another name when the pack has them (build.js FALLBACK goes the other way) */
export const GEN_ALIAS = { stall: 'stall2', wreck: 'wreck2', niche: 'skullwall' };
export { bakedDef, bakedProp };
