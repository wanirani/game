// DETAIL (docs/v2/ENV_KIT.md 24): relief and wear of walls, and the masonry skirt under the front edge of the ground.
// Owner: "배경도 좀 더 디테일하게 ... 사물이나 벽면 등도". A tall wall was a flat box with a texture: no foot, nothing standing proud, no trace of the
// night it stands in. Everything here is static geometry with baked light like the rest of the kit (no alpha, no new texture, no draw call):
//   relief  a splayed footing under the plinth, a string course, a corbel course under the cornice, stones that stand proud, putlog holes
//   wear    laid over the wall 0.5 in front of it IN THE WALL'S OWN MATERIAL with a colour factor per vertex (Geo `mul`): the factor is 1 at the rim,
//           so there is no seam, and falls to dark inside - soot above a torch or a burning window, damp at the foot, dirt streaks under the
//           cornice and the sills; patches (plaster fallen off the stone, fresh whitewash) are polygons of another material with a dark upper lip
//   skirt   the front face of the ground (the stage's front edge) as a retaining wall: kerb, courses, piers with sloped heads, a battered foot
// All of it is switched on by the stage: `stage.wear = 'now' | 'past'` (compileEnv sets WEAR.age). A stage without it compiles exactly as before
// (the test strip slice0 and the env-kit test scene).
import { Frame, hash, sm } from './geo.js';

export const WEAR = { age: null };

const ONE = [1, 1, 1];
const slopeN = (F, k) => [F.nx * k, Math.sqrt(1 - k * k), F.nz * k];

/** a fan of triangles on a wall face (frame F, w in front of it): centre c = [u, y] with factor mc, rim = [[u, y, factor?], ...] with factor mr */
export function fan(G, F, mat, w, c, rim, mc, mr = ONE, o = {}) {
  const C = F.pt(c[0], c[1], w);
  for (let i = 0; i + 1 < rim.length; i++) { const a = rim[i], b = rim[i + 1]; G.tri(mat, C, F.pt(a[0], a[1], w), F.pt(b[0], b[1], w), F.n, { ...o, mul: [mc, a[2] ?? mr, b[2] ?? mr] }); }
}
/** soot licking up a wall from (u, y): a teardrop wd wide and h tall, darkest just above its foot */
export function soot(G, F, mat, w, u, y, wd, h, dark = 0.34, seed = 1, o = {}) {
  const rim = [], n = 9, lean = (hash(seed, 3.3) - 0.5) * wd * 0.5;
  for (let i = 0; i < n; i++) { const a = -Math.PI * 0.5 + (i / n) * Math.PI * 2, s = Math.sin(a), j = 0.8 + 0.4 * hash(seed + i * 1.7, u); rim.push([u + Math.cos(a) * wd * 0.5 * j + (s > 0 ? s * lean : 0), y + (s > 0 ? s * h * j : s * h * 0.14)]); }
  rim.push(rim[0]);
  fan(G, F, mat, w, [u + lean * 0.2, y + h * 0.16], rim, [dark, dark * 0.96, dark * 0.96], ONE, o);
}
/** damp and moss rising from the foot of a wall between u0 and u1: a band with a ragged top */
export function damp(G, F, mat, w, u0, u1, yb, hgt, D = [0.56, 0.66, 0.56], seed = 1, o = {}) {
  const n = Math.max(1, Math.round((u1 - u0) / 118)), T = (i) => yb + hgt * (0.4 + 0.8 * hash(seed + i * 2.3, u0 + i * 7));
  for (let i = 0; i < n; i++) { const a = u0 + (u1 - u0) * i / n, b = u0 + (u1 - u0) * (i + 1) / n; G.quad4(mat, F.pt(a, yb, w), F.pt(b, yb, w), F.pt(b, T(i + 1), w), F.pt(a, T(i), w), F.n, { ...o, mul: [D, D, ONE, ONE] }); }
}
/** a dirt streak running down from (u, yt) - its top edge must lie under a band or a sill */
export function streak(G, F, mat, w, u, yt, L, wd, dark = 0.6, seed = 1, o = {}) {
  const j = (hash(seed, u) - 0.5) * wd * 0.6;
  fan(G, F, mat, w, [u, yt], [[u - wd, yt], [u - wd * 0.72, yt - L * 0.42], [u - wd * 0.2 + j, yt - L], [u + wd * 0.2 + j, yt - L], [u + wd * 0.72, yt - L * 0.5], [u + wd, yt]], [dark, dark, dark * 1.05], ONE, o);
}
/** a patch of another material on the wall (stone where the plaster fell, fresh whitewash): an irregular polygon; lip < 1 darkens its upper edge (the shadow of the layer above it) */
export function patch(G, F, mat, w, u, y, wd, h, seed = 1, o = {}) {
  const n = 8, rim = [], lip = o.lip ?? 0.55, kk = o.k ?? 1, lo = kk * (o.low ?? 0.94);
  for (let i = 0; i <= n; i++) { const q = i % n, a = q / n * 6.2832 + (hash(seed, q + 0.5) - 0.5) * 0.55, r = 0.6 + 0.4 * hash(seed + q * 3.1, u), s = Math.sin(a); rim.push([u + Math.cos(a) * wd * 0.5 * r, y + s * h * 0.5 * r, s > 0.2 ? [lip * kk, lip * kk, lip * kk] : [lo, lo, lo]]); }
  fan(G, F, mat, w, [u, y], rim, [kk, kk, kk], ONE, { tint: o.tint, vary: o.vary ?? 0.2 });
}
/** a crack running up the face from (u, y): thin dark slivers of the trim sheet's white piece */
export function crackUp(G, F, w, u0, y0, len, seed = 1, lean = 0) {
  const n = Math.max(3, Math.round(len / 28)), q = { tint: [0.05, 0.05, 0.065], vary: 0, k: 1 };
  let u = u0, y = y0, wd = 2.0;
  for (let i = 0; i < n; i++) {
    const nu = u + (hash(i + seed, u0) - 0.5) * 28 + lean * len / n, ny = y + len / n * (0.7 + 0.6 * hash(seed, i + 2)), nw = wd * 0.8;
    G.quad4('white', F.pt(u - wd, y, w), F.pt(u + wd, y, w), F.pt(nu + nw, ny, w), F.pt(nu - nw, ny, w), F.n, q);
    u = nu; y = ny; wd = nw;
  }
}

/**
 * Relief of one face of a tall wall (frame F, 0..len along it, y0..y1).
 * o = { lower (material of the stones), base, ph (plinth height), segs: [[u0, u1]] (the plinth's runs between the doors), holes: [{u0,u1,y0,y1}] (windows, doors),
 *       keep: [[u0, u1]] (buttresses: nothing stands proud there), course (y of a string course | 0), corbel (true = a corbel course under the cornice), top (y1 of the stone part), seed }
 */
export function wallRelief(G, F, len, y0, y1, o) {
  const sd = o.seed ?? 1, ph = o.ph ?? 0, top = o.top ?? y1, h = top - y0;
  // a splayed footing under the plinth: its sloped face catches the moon - the wall stands on something
  if (ph) for (const [p, q] of o.segs) { if (q - p < 8) continue; const n = Math.max(1, Math.round((q - p) / 170)); for (let i = 0; i < n; i++) { const a = p + (q - p) * i / n, b = p + (q - p) * (i + 1) / n; G.quad4('stone', F.pt(a, o.base, 9), F.pt(b, o.base, 9), F.pt(b, o.base + 12, 4.5), F.pt(a, o.base + 12, 4.5), slopeN(F, 0.5), { vary: 0.14, k: 0.98 }); } }
  if (o.course) F.box(G, 'trimstone', 0, len, o.course - 4.5, o.course + 4.5, 0, 3.2, { faces: 'FT', vary: 0.08, cell: 230 });
  if (o.baseCourse) F.box(G, 'stone', 0, len, o.base + ph, o.base + ph + o.baseCourse, 0, 2.4, { faces: 'FT', top: 'trimstone', vary: 0.16, k: 0.96, cell: 230 });   // a second, shallower step of big blocks over the plinth
  const used = [];
  if (o.slit) {   // openings with a dressed frame standing proud: arrow loops in a town wall, burial niches (loculi) in a crypt wall
    const S = o.slit, ns = Math.max(1, Math.round(len / S.every));
    for (let i = 0; i < ns; i++) {
      const u = len * (i + 0.5 + (hash(sd + i * 5.1, 3.7) - 0.5) * 0.36) / ns, y = y0 + (S.y ?? h * 0.6) + (S.jit ?? 0) * (hash(i, sd + 9) - 0.5) + (S.alt && i % 2 ? S.alt : 0), hw = S.w / 2, hh = S.h / 2;
      if ((o.keep ?? []).some(([p, q]) => u - hw - 8 < q && u + hw + 8 > p) || (o.holes ?? []).some((r) => u - hw - 8 < r.u1 && u + hw + 8 > r.u0 && y - hh - 10 < r.y1 && y + hh + 10 > r.y0)) continue;
      used.push([u - hw - 9, u + hw + 9, y - hh - 9, y + hh + 9]);
      F.face(G, 'stone', u - hw, u + hw, y - hh, y + hh, 0.5, { k: S.dark ?? 0.13, vary: 0, tint: S.tint });
      F.box(G, 'trimstone', u - hw - 5, u + hw + 5, y + hh, y + hh + 6, 0, 3, { faces: 'FT', vary: 0.05 }); F.box(G, 'trimstone', u - hw - 6, u + hw + 6, y - hh - 5, y - hh, 0, 4.2, { faces: 'FT', vary: 0.05, k: 1.05 });
      F.box(G, 'trimstone', u - hw - 4.5, u - hw, y - hh, y + hh, 0, 2.4, { faces: 'F', vary: 0.05, k: 0.92 }); F.box(G, 'trimstone', u + hw, u + hw + 4.5, y - hh, y + hh, 0, 2.4, { faces: 'F', vary: 0.05, k: 0.92 });
    }
  }
  if (o.mend) {   // masonry of another kind where the wall was mended: a big irregular patch standing a little proud
    const nm = Math.max(1, Math.round(len / o.mend.every));
    for (let i = 0; i < nm; i++) {
      const wd = 110 + 80 * hash(sd, i + 2.2), hh = 80 + 60 * hash(i, sd + 5.5), u = len * (i + 0.25 + 0.5 * hash(sd + i * 2.3, 1.2)) / nm, y = y0 + ph + (o.baseCourse ?? 0) + 14 + hh / 2 + hash(i * 1.7, sd + 3) * Math.max(0, h - ph - (o.baseCourse ?? 0) - hh - 60);
      if ((o.keep ?? []).some(([p, q]) => u - wd / 2 < q && u + wd / 2 > p) || (o.holes ?? []).some((r) => u - wd / 2 < r.u1 && u + wd / 2 > r.u0 && y - hh / 2 < r.y1 && y + hh / 2 > r.y0) || used.some(([a, b, c, d]) => u - wd / 2 < b && u + wd / 2 > a && y - hh / 2 < d && y + hh / 2 > c) || (o.course && y - hh / 2 < o.course + 6 && y + hh / 2 > o.course - 6)) continue;
      used.push([u - wd / 2, u + wd / 2, y - hh / 2, y + hh / 2]);
      patch(G, F, o.mend.mat, 1.0, u, y, wd, hh, sd + i * 11, { lip: 1.08, low: 0.86, k: o.mend.k ?? 0.98 });
    }
  }
  if (o.corbel) F.box(G, 'stone', 0, len, y1 - 23, y1 - 13, 0, 2.6, { faces: 'F', vary: 0.1, k: 0.9, cell: 230 });
  const blocked = (a, b, c, d) => used.some(([p, q, r, s]) => a < q && b > p && c < s && d > r) || (o.holes ?? []).some((r) => a < r.u1 + 6 && b > r.u0 - 6 && c < r.y1 + 6 && d > r.y0 - 8) || (o.keep ?? []).some(([p, q]) => a < q && b > p) || (o.course && c < o.course + 6 && d > o.course - 6);
  const n = Math.round(len / (o.every ?? 150));
  for (let i = 0; i < n; i++) {
    const u = len * (i + 0.15 + 0.7 * hash(sd + i * 1.9, 4.2)) / n, y = y0 + ph + 26 + hash(i * 3.3, sd + 2) * Math.max(10, h - ph - 84), hw = 9 + 6 * hash(i, sd + 7), hh = 6 + 3 * hash(sd, i + 1);
    if (y + hh > top - 26 || blocked(u - hw - 4, u + hw + 4, y - hh - 4, y + hh + 4)) continue;
    if (i % 3 === 2) F.face(G, 'stone', u - 4.5, u + 4.5, y - 4.5, y + 4.5, 0.5, { k: 0.2, vary: 0 });                 // a putlog hole
    else F.box(G, o.lower, u - hw, u + hw, y - hh, y + hh, 0, 2.4, { faces: 'FLRT', vary: 0.22, k: 1.1 });               // a stone standing proud
  }
}

/**
 * The front face of the ground at the stage's front edge as a retaining wall (x0..x1 at z0, from y down t): kerb stones at the top, a course,
 * piers with sloped heads, weep holes with a streak below them and a battered foot. 'plain' = kerb and courses only (the wall of a pit).
 */
export function skirt(G, x0, x1, y, t, z0, seed = 1, plain = false) {
  const F = new Frame(x0, z0, 0, -1), len = x1 - x0, yb = y - t, sh = (px, py) => 0.4 + 0.52 * sm(0, t, py - yb), so = { shade: sh, vary: 0.2 };
  G.quad('stone', [x0, yb, z0], [len, 0, 0], [0, t, 0], [0, 0, -1], { cell: 64, ...so });
  G.box('trimstone', x0, y - 10, z0 - 4.5, x1, y - 0.4, z0, { faces: 'FT', cell: 200, vary: 0.12 });                  // kerb stones: the edge of the street
  const yc = y - t * 0.42;
  G.box('trimstone', x0, yc - 4, z0 - 3, x1, yc + 4, z0, { faces: 'FT', cell: 280, vary: 0.08, k: 0.78 });
  if (plain) return;
  for (let a = 0; a < len; a += 240) { const b = Math.min(len, a + 240); G.quad4('stone', F.pt(a, yb, 20), F.pt(b, yb, 20), F.pt(b, yb + 48, 0), F.pt(a, yb + 48, 0), [0, 0.38, -0.925], { vary: 0.18, k: 0.62 }); }   // the battered foot
  const n = Math.max(1, Math.round(len / 340));
  for (let i = 0; i < n; i++) {
    const u = len * (i + 0.5 + (hash(seed + i, 1.1) - 0.5) * 0.3) / n;
    F.box(G, 'stone', u - 17, u + 17, yb, y - 34, 0, 13, { faces: 'FLR', ...so });                              // a pier
    G.quad4('trimstone', F.pt(u - 17, y - 34, 13), F.pt(u + 17, y - 34, 13), F.pt(u + 17, y - 16, 0), F.pt(u - 17, y - 16, 0), [0, 0.6, -0.8], { vary: 0, k: 0.9 });
    const wu = len * (i + 1) / n - 40 - 60 * hash(i, seed + 3), wy = y - 52 - 30 * hash(seed, i + 5);                     // a weep hole between two piers and what runs out of it
    if (wu > 20 && wu < len - 20) { F.face(G, 'stone', wu - 4, wu + 4, wy - 5.5, wy + 5.5, 0.5, { k: 0.14, vary: 0 }); streak(G, F, 'stone', 0.4, wu, wy - 5, 70 + 50 * hash(i, 9), 9, 0.5, seed + i, so); }
  }
  damp(G, F, 'stone', 0.4, 0, len, yb + 40, 60, [0.6, 0.74, 0.6], seed + 11, so);
}
