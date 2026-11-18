// env kit — breakables: the meshes (pure JS: no DOM, no GL -> runs in node). docs/v2/ENV_KIT.md 22
//
//   whole things   : jar (tall storage jar) · pot (round pot) · urn (small lidded offering jar) · crate (nailed boards) · barrel (staves + iron hoops)
//   their pieces   : curved clay shards with a glaze side, a raw side and a raw edge · crate boards and splinters · barrel staves, hoops, head halves
//   what drops     : a silver coin · a red heal piece · a blue-white resonance mote
// Everything is a small triangle list in the model's own space (position · normal · uv · colour), in the world renderer's vertex format once it is
// written (28 bytes: pos 3f, uv 2f, colour 4ub, extra 4ub — src/v2/game/glr.js). Whole things are lit once, vertex by vertex, with the same
// lightAt() the kit bakes its props with (bakeWhole); pieces and pickups are transformed and shaded every frame (writeDyn: no allocation).
// One atlas for all of it (paintBreakAtlas: drawn at run time on a 512 canvas — glaze with runs and a band, raw clay, linen, boards with nails,
// staves, iron, rope, a barrel head, a coin face), so the whole lot is ONE texture and one draw call per buffer.
import { lightAt } from '../b/world.js';

export const BRK_VERT = 28;
const TAU = Math.PI * 2;
const px = (x, y, w, h, pad = 1.5) => [(x + pad) / 512, (y + pad) / 512, (x + w - pad) / 512, (y + h - pad) / 512];
/** atlas pieces [u0, v0, u1, v1] (v grows downward, as on the canvas) */
export const REG = {
  glazeA: px(0, 0, 256, 160, 0.5), glazeB: px(0, 160, 256, 160, 0.5), raw: px(256, 0, 128, 96), cloth: px(384, 0, 128, 96),
  plank: px(0, 320, 256, 192), frame: px(256, 96, 256, 32), stave: px(256, 128, 256, 128, 0.5), iron: px(256, 256, 256, 24, 0.5), rope: px(256, 280, 256, 24, 0.5),
  lid: px(256, 304, 112, 112), coin: px(368, 304, 112, 112), edge: px(256, 416, 256, 16, 0.5), gem: px(256, 432, 80, 80), white: px(340, 436, 32, 32, 4), dark: px(484, 308, 24, 104, 4),
};
const lcg = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

// ───────────────────────── model builder ─────────────────────────
class MB {
  constructor() { this.p = []; this.n = []; this.t = []; this.c = []; }
  /** one triangle; outward = a direction the front must face (the kit's winding: clockwise seen from outside) */
  tri(a, b, c, na, nb, nc, ta, tb, tc, col, out) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx, o = out ?? [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
    const pv = Array.isArray(col[0]), ca = pv ? col[0] : col, cb = pv ? col[1] : col, cc = pv ? col[2] : col;   // one colour, or one per corner
    if (gx * o[0] + gy * o[1] + gz * o[2] > 0) { this._v(a, na, ta, ca); this._v(c, nc, tc, cc); this._v(b, nb, tb, cb); } else { this._v(a, na, ta, ca); this._v(b, nb, tb, cb); this._v(c, nc, tc, cc); }
  }
  quad(a, b, c, d, na, nb, nc, nd, ta, tb, tc, td, col, out) {
    const pv = Array.isArray(col[0]);
    this.tri(a, b, c, na, nb, nc, ta, tb, tc, pv ? [col[0], col[1], col[2]] : col, out); this.tri(a, c, d, na, nc, nd, ta, tc, td, pv ? [col[0], col[2], col[3]] : col, out);
  }
  _v(p, n, t, col) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.t.push(t[0], t[1]); this.c.push(col[0], col[1], col[2]); }
  /** axis-aligned box (x0..x1, y0..y1, z0..z1), faces named by letters L R D U F(-z) B(+z); uv = one region for all faces (or a function of the face) */
  box(x0, y0, z0, x1, y1, z1, reg, col, faces = 'LRUFB', uvOf = null) {
    const F = { L: [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0]], R: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]],
      D: [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0]], U: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]],
      F: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]], B: [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1]] };
    for (const f of faces) { const q = F[f], n = q[4], r = uvOf ? uvOf(f) : reg; this.quad(q[0], q[1], q[2], q[3], n, n, n, n, [r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]], col, n); }
  }
  done() { return { n: this.p.length / 3, p: new Float32Array(this.p), nr: new Float32Array(this.n), t: new Float32Array(this.t), c: new Float32Array(this.c) }; }
}
/** ring normals of a lathe profile [[r, y] ...] (smooth; the ends keep their own segment) */
function profNormals(prof) {
  const seg = []; for (let j = 0; j < prof.length - 1; j++) { const dr = prof[j + 1][0] - prof[j][0], dy = prof[j + 1][1] - prof[j][1], l = Math.hypot(dr, dy) || 1; seg.push([dy / l, -dr / l]); }
  return prof.map((_, j) => { const a = seg[Math.max(0, j - 1)], b = seg[Math.min(seg.length - 1, j)], x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1; return [x / l, y / l]; });
}
const A0 = Math.PI / 2;   // the lathe seam looks away from the camera (+z)
const ang = (i, sides) => A0 + (i / sides) * TAU;
/**
 * lathe surface into mb. prof [[r, y]], reg = atlas piece (u once around, v0 = top of the piece = the highest y of v range).
 * o: { sides, i0, i1 (side range), col | colAt(j), vy: [yLow, yHigh] (v range in world y; default the profile's own), inside (normals inward, offset), k }
 */
function lathe(mb, prof, reg, o = {}) {
  const sides = o.sides ?? 12, i0 = o.i0 ?? 0, i1 = o.i1 ?? sides, N = profNormals(prof), yl = o.vy ? o.vy[0] : prof[0][1], yh = o.vy ? o.vy[1] : prof[prof.length - 1][1], sg = o.inside ? -1 : 1;
  const U = (i) => reg[0] + (reg[2] - reg[0]) * (i / sides), V = (y) => reg[3] - (reg[3] - reg[1]) * Math.max(0, Math.min(1, (y - yl) / ((yh - yl) || 1)));
  const P = (j, i) => { const a = ang(i, sides), r = prof[j][0]; return [Math.cos(a) * r, prof[j][1], Math.sin(a) * r]; };
  const NN = (j, i) => { const a = ang(i, sides); return [Math.cos(a) * N[j][0] * sg, N[j][1] * sg, Math.sin(a) * N[j][0] * sg]; };
  for (let j = 0; j < prof.length - 1; j++) {
    const ca = o.colAt ? o.colAt(j) : o.col, cb = o.colAt ? o.colAt(j + 1) : o.col;
    for (let i = i0; i < i1; i++) {
      const a = P(j, i), b = P(j, i + 1), c = P(j + 1, i + 1), d = P(j + 1, i), na = NN(j, i), nb = NN(j, i + 1), nc = NN(j + 1, i + 1), nd = NN(j + 1, i);
      const ta = [U(i), V(prof[j][1])], tb = [U(i + 1), V(prof[j][1])], tc = [U(i + 1), V(prof[j + 1][1])], td = [U(i), V(prof[j + 1][1])];
      const out = [na[0] + nc[0], na[1] + nc[1], na[2] + nc[2]];
      if (prof[j][0] < 0.01) mb.tri(a, c, d, na, nc, nd, ta, tc, td, [ca, cb, cb], out);
      else if (prof[j + 1][0] < 0.01) mb.tri(a, b, c, na, nb, nc, ta, tb, tc, [ca, ca, cb], out);
      else mb.quad(a, b, c, d, na, nb, nc, nd, ta, tb, tc, td, [ca, ca, cb, cb], out);
    }
  }
}
/** flat disc (fan) at height y, radius r, facing up (ny 1) or down; uv = the round middle of a region */
function disc(mb, y, r, reg, col, sides = 12, up = 1) {
  const cu = (reg[0] + reg[2]) / 2, cv = (reg[1] + reg[3]) / 2, ru = (reg[2] - reg[0]) / 2, rv = (reg[3] - reg[1]) / 2, n = [0, up, 0];
  for (let i = 0; i < sides; i++) {
    const a0 = ang(i, sides), a1 = ang(i + 1, sides);
    mb.tri([0, y, 0], [Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a1) * r, y, Math.sin(a1) * r], n, n, n, [cu, cv], [cu + Math.cos(a0) * ru, cv + Math.sin(a0) * rv], [cu + Math.cos(a1) * ru, cv + Math.sin(a1) * rv], col, n);
  }
}

// ───────────────────────── whole things ─────────────────────────
const W = [1, 1, 1];
/** body profiles [r, y] (bottom -> top), in px; the hero is 104 tall */
export const PROFILE = {
  jar: [[9.5, 0], [12.5, 5], [16, 17], [17, 30], [15.6, 43], [11.4, 53], [8.4, 58], [8.6, 62], [10.6, 66]],
  pot: [[11, 0], [15.6, 5], [19, 14], [19, 23], [16, 31], [12.6, 35], [13, 37.5], [15, 40]],
  urn: [[5.6, 0], [8.2, 4], [10.8, 11], [10.6, 17], [8, 23], [5.6, 26.5], [6.6, 28.5]],
};
const barrelR = (f) => 23 * (0.8 + 0.2 * Math.sin(Math.PI * f));
const BARREL = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => [barrelR(f), 70 * f]);
const BARREL_SH = [0, 0.34, 0.67, 1].map((f) => [barrelR(f), 70 * f]);
const HOOPS = [0.11, 0.5, 0.89];
const CLOTH_CAP = [[12.4, 56.5], [10.9, 60.6], [11.9, 66.4], [7.6, 68.6], [0, 69.2]];   // a linen cover over the mouth of a jar, gathered under the lip
/** shade toward the foot (contact) and inside the mouth */
const ao = (y, span = 16) => 0.62 + 0.38 * Math.min(1, Math.max(0, y / span));
function clayBody(mb, prof, reg, top, o = {}) {
  const tone = o.tone ?? W;
  lathe(mb, prof, reg, { colAt: (j) => { const k = ao(prof[j][1], o.span ?? 14); return [tone[0] * k, tone[1] * k, tone[2] * k]; }, vy: [0, top] });
}
function mouth(mb, r, y, depth = 7) {   // the dark hollow: a short wall going down inside the lip and a dark floor
  lathe(mb, [[r * 0.84, y - depth], [r, y]], REG.raw, { inside: true, colAt: (j) => (j ? [0.82, 0.8, 0.78] : [0.2, 0.18, 0.17]) });
  disc(mb, y - depth, r * 0.84, REG.dark, [0.16, 0.14, 0.13]);
}
function ropeRing(mb, r, y, w = 1.9) { lathe(mb, [[r + 0.3, y - w], [r + w * 1.15, y], [r + 0.3, y + w]], REG.rope, { col: [1, 0.98, 0.94] }); }
function build(kind, v) {
  const mb = new MB();
  if (kind === 'jar') {
    const P = PROFILE.jar, top = 66, dark = v === 2;
    clayBody(mb, P, dark ? REG.glazeB : REG.glazeA, top, { tone: dark ? [1.02, 1.04, 1.06] : v === 1 ? [1.06, 0.98, 0.9] : W });
    if (v === 1) {   // a linen cover tied down with rope
      lathe(mb, CLOTH_CAP, REG.cloth, { col: [1, 0.97, 0.9], vy: [56, 70] });
      ropeRing(mb, 10.4, 60.6, 1.7);
    } else { mouth(mb, 9.2, 66); lathe(mb, [[10.6, 66], [9.2, 66]], REG.raw, { col: [1.02, 0.96, 0.9] }); ropeRing(mb, 8.5, 59.2, 1.6); }
  } else if (kind === 'pot') {
    const P = PROFILE.pot, top = 40;
    clayBody(mb, P, v === 1 ? REG.glazeB : REG.glazeA, top, { tone: v === 1 ? [1.08, 1.06, 1.0] : [1.04, 0.94, 0.86], span: 10 });
    if (v === 2) { disc(mb, 41.2, 16.2, REG.lid, [1, 0.95, 0.88]); lathe(mb, [[16.2, 39.4], [16.2, 41.2]], REG.frame, { col: [0.86, 0.8, 0.74] }); lathe(mb, [[3, 41.2], [3.6, 44], [2, 45.2], [0, 45.4]], REG.frame, { col: [0.9, 0.84, 0.78], sides: 6 }); }   // a wooden lid with a knob
    else { mouth(mb, 13.4, 40, 8); lathe(mb, [[15, 40], [13.4, 40]], REG.raw, { col: [1.02, 0.96, 0.9] }); }
    for (const s of [-1, 1]) mb.box(s * 18.2 - 2.2, 25.5, -3.4, s * 18.2 + 2.2, 29.5, 3.4, REG.raw, [0.9, 0.78, 0.7], 'LRUFBD');   // two lug handles
  } else if (kind === 'urn') {
    const P = PROFILE.urn, top = 28.5;
    clayBody(mb, P, v === 1 ? REG.glazeA : REG.glazeB, top, { tone: v === 1 ? [0.96, 0.9, 0.86] : [1.1, 1.12, 1.14], span: 8 });
    lathe(mb, [[7.2, 28.2], [6.4, 30.4], [2.4, 32], [1.7, 33.6], [2.6, 35.4], [0, 36.2]], v === 1 ? REG.glazeA : REG.glazeB, { col: v === 1 ? [0.9, 0.84, 0.8] : [1.04, 1.06, 1.08], vy: [22, 37] });   // lid with a knob
  } else if (kind === 'crate') {
    const hw = 25.4, h = 52, e = 6.2, c0 = [1, 0.97, 0.93];
    const body = (f) => (f === 'U' ? REG.plank : REG.plank);
    mb.box(-hw, 0, -hw, hw, h - 1.4, hw, REG.plank, c0, 'LRUFB', body);
    // frame boards and a brace on each side (they stand 1.6 proud of the planks), nail heads are in the texture
    const side = (ux, uz, nx, nz) => {
      const at = (u, y, w) => [ux * u + nx * (hw + w), y, uz * u + nz * (hw + w)], n = [nx, 0, nz], fr = REG.frame, c = [0.9, 0.86, 0.82], c2 = [0.74, 0.7, 0.66];
      const bar = (u0, u1, y0, y1, flip) => {
        const a = at(u0, y0, 1.6), b = at(u1, y0, 1.6), cc = at(u1, y1, 1.6), d = at(u0, y1, 1.6);
        if (flip) mb.quad(a, b, cc, d, n, n, n, n, [fr[0], fr[3]], [fr[0], fr[1]], [fr[2], fr[1]], [fr[2], fr[3]], c, n); else mb.quad(a, b, cc, d, n, n, n, n, [fr[0], fr[3]], [fr[2], fr[3]], [fr[2], fr[1]], [fr[0], fr[1]], c, n);
        const up = [0, 1, 0];   // the lip on top of the board catches light: reads as thickness
        mb.quad(at(u0, y1, 0), at(u1, y1, 0), at(u1, y1, 1.6), at(u0, y1, 1.6), up, up, up, up, [fr[0], fr[1]], [fr[2], fr[1]], [fr[2], fr[1] + 0.004], [fr[0], fr[1] + 0.004], [1.05, 1, 0.95], up);
      };
      bar(-hw - 1.6, hw + 1.6, 0, e, false); bar(-hw - 1.6, hw + 1.6, h - e, h, false); bar(-hw - 1.6, -hw - 1.6 + e, e, h - e, true); bar(hw + 1.6 - e, hw + 1.6, e, h - e, true);
      const b0 = at(-hw + e - 1.6, e, 1.1), b1 = at(-hw + e + 5, e, 1.1), b2 = at(hw - e + 1.6, h - e, 1.1), b3 = at(hw - e - 5, h - e, 1.1);
      mb.quad(b0, b1, b2, b3, n, n, n, n, [fr[0], fr[3]], [fr[0], fr[1]], [fr[2], fr[1]], [fr[2], fr[3]], c2, n);
    };
    side(1, 0, 0, -1); side(0, 1, 1, 0); side(-1, 0, 0, 1); side(0, -1, -1, 0);
    for (const s of [-1, 1]) mb.box(s * (hw - 3.2) - 3.4, h - 1.4, -hw - 1.6, s * (hw - 3.2) + 3.4, h + 0.6, hw + 1.6, REG.frame, [0.96, 0.92, 0.88], 'LRUFB');   // two battens on the lid
  } else if (kind === 'barrel') {
    lathe(mb, BARREL, REG.stave, { colAt: (j) => { const k = ao(BARREL[j][1], 18); return [k, k * 0.98, k * 0.95]; }, vy: [0, 70] });
    for (const f of HOOPS) { const r = barrelR(f) + 0.9, y = 70 * f; lathe(mb, [[r, y - 3.2], [r + 0.5, y], [r, y + 3.2]], REG.iron, { col: [1, 1, 1.04] }); }
    lathe(mb, [[barrelR(1), 70], [barrelR(1) - 2.2, 70]], REG.frame, { col: [0.8, 0.76, 0.72] });   // the chime (rim) around a sunk head
    lathe(mb, [[barrelR(1) - 2.2, 67.6], [barrelR(1) - 2.2, 70]], REG.stave, { inside: true, col: [0.5, 0.47, 0.45] });
    disc(mb, 67.6, barrelR(1) - 2.2, REG.lid, [0.92, 0.88, 0.84]);
  }
  return mb.done();
}
const VARIANTS = { jar: 3, pot: 3, urn: 2, crate: 1, barrel: 1 };
/** how dark each kind is drawn against the atlas (the atlas is painted light; these bring the wood down to the kit's own barrels and crates, the glaze to an old brown) */
export const KIND_TONE = { jar: 0.8, pot: 0.8, urn: 0.86, crate: 0.68, barrel: 0.74 };
const WHOLE = new Map();
/** the whole model of a kind (variant picked from the entry's index) */
export function wholeModel(kind, i = 0) { const v = i % (VARIANTS[kind] ?? 1), k = kind + v; let m = WHOLE.get(k); if (!m) { m = build(kind, v); WHOLE.set(k, m); } return m; }
/** which glaze / tone a variant's shards carry */
const clayLook = (kind, v) => (kind === 'jar' ? { reg: v === 2 ? REG.glazeB : REG.glazeA, tone: v === 2 ? [1.02, 1.04, 1.06] : v === 1 ? [1.06, 0.98, 0.9] : W }
  : kind === 'pot' ? { reg: v === 1 ? REG.glazeB : REG.glazeA, tone: v === 1 ? [1.08, 1.06, 1.0] : [1.04, 0.94, 0.86] } : { reg: v === 1 ? REG.glazeA : REG.glazeB, tone: v === 1 ? [0.96, 0.9, 0.86] : [1.1, 1.12, 1.14] });

// ───────────────────────── pieces ─────────────────────────
/** a finished piece: the model is moved so that its centroid is the origin; o = where that origin sits in the whole thing; out = which way it leaves */
function piece(mb, flat, restH, stay = false) {
  const m = mb.done(), n = m.n; let cx = 0, cy = 0, cz = 0, r = 0;
  for (let i = 0; i < n; i++) { cx += m.p[i * 3]; cy += m.p[i * 3 + 1]; cz += m.p[i * 3 + 2]; }
  cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < n; i++) { m.p[i * 3] -= cx; m.p[i * 3 + 1] -= cy; m.p[i * 3 + 2] -= cz; r = Math.max(r, Math.hypot(m.p[i * 3], m.p[i * 3 + 1], m.p[i * 3 + 2])); }
  const l = Math.hypot(cx, cz);
  return { m, ox: cx, oy: cy, oz: cz, out: l > 0.5 ? [cx / l, cz / l] : [0, 0], flat, restH, r, stay, tris: n / 3 };
}
const mirror = (u) => (u > 1 ? 2 - u : u < 0 ? -u : u);   // a shard across the seam: the glaze runs on mirrored instead of jumping
/** a curved clay shard: a patch of the lathe (sides i0..i1, rings j0..j1) with a glazed outside, a raw inside 1.8 nearer the axis and a raw edge; corners pulled in = a broken outline */
function clayShard(prof, look, top, i0, i1, j0, j1, rnd, sides = 12) {
  const mb = new MB(), N = profNormals(prof), th = 1.9, reg = look.reg, raw = REG.raw, tone = look.tone;
  const jag = (i, j) => {   // grid vertex -> [angle index (float), ring position (float)]
    let fi = i, fj = j; const ei = i === i0 || i === i1, ej = j === j0 || j === j1;
    if (ei && ej) { fi += (i === i0 ? 1 : -1) * (0.18 + 0.5 * rnd()) * Math.min(1, (i1 - i0) / 2); fj += (j === j0 ? 1 : -1) * (0.15 + 0.45 * rnd()) * Math.min(1, (j1 - j0) / 2); }
    else if (ei) fi += (i === i0 ? 1 : -1) * 0.3 * rnd(); else if (ej) fj += (j === j0 ? 1 : -1) * 0.3 * rnd();
    return [fi, fj];
  };
  const G = []; for (let j = j0; j <= j1; j++) { const row = []; for (let i = i0; i <= i1; i++) row.push(jag(i, j)); G.push(row); }
  const at = (g, off) => {
    const j = Math.min(prof.length - 2, Math.floor(g[1])), f = g[1] - j, r = prof[j][0] + (prof[j + 1][0] - prof[j][0]) * f, y = prof[j][1] + (prof[j + 1][1] - prof[j][1]) * f, a = ang(g[0], sides);
    const nr = N[j][0] + (N[j + 1][0] - N[j][0]) * f, ny = N[j][1] + (N[j + 1][1] - N[j][1]) * f, l = Math.hypot(nr, ny) || 1, n = [Math.cos(a) * nr / l, ny / l, Math.sin(a) * nr / l];
    return { p: [Math.cos(a) * r - n[0] * off, y - n[1] * off, Math.sin(a) * r - n[2] * off], n, t: [reg[0] + (reg[2] - reg[0]) * mirror(g[0] / sides), reg[3] - (reg[3] - reg[1]) * Math.min(1, y / top)], y };
  };
  const rt = (u, v) => [raw[0] + (raw[2] - raw[0]) * u, raw[1] + (raw[3] - raw[1]) * v], neg = (n) => [-n[0], -n[1], -n[2]];
  const edge = [];   // the outline, in order
  for (let j = 0; j < G.length - 1; j++) for (let i = 0; i < G[0].length - 1; i++) {
    const a = at(G[j][i], 0), b = at(G[j][i + 1], 0), c = at(G[j + 1][i + 1], 0), d = at(G[j + 1][i], 0), k = ao(a.y, 14), col = [tone[0] * k, tone[1] * k, tone[2] * k];
    mb.quad(a.p, b.p, c.p, d.p, a.n, b.n, c.n, d.n, a.t, b.t, c.t, d.t, col);
    const a2 = at(G[j][i], th), b2 = at(G[j][i + 1], th), c2 = at(G[j + 1][i + 1], th), d2 = at(G[j + 1][i], th), u0 = i / (G[0].length - 1), u1 = (i + 1) / (G[0].length - 1), v0 = j / (G.length - 1), v1 = (j + 1) / (G.length - 1);
    mb.quad(a2.p, b2.p, c2.p, d2.p, neg(a.n), neg(b.n), neg(c.n), neg(d.n), rt(u0, 1 - v0), rt(u1, 1 - v0), rt(u1, 1 - v1), rt(u0, 1 - v1), [1.14, 1.07, 1.0]);
  }
  const R = G.length - 1, C = G[0].length - 1;
  for (let i = 0; i < C; i++) edge.push([G[0][i], G[0][i + 1], [0, -1, 0]]);
  for (let j = 0; j < R; j++) edge.push([G[j][C], G[j + 1][C], null]);
  for (let i = C; i > 0; i--) edge.push([G[R][i], G[R][i - 1], [0, 1, 0]]);
  for (let j = R; j > 0; j--) edge.push([G[j][0], G[j - 1][0], null]);
  let cx = 0, cy = 0, cz = 0, cn = 0; for (const row of G) for (const g of row) { const q = at(g, 0).p; cx += q[0]; cy += q[1]; cz += q[2]; cn++; } cx /= cn; cy /= cn; cz /= cn;
  for (const [g0, g1] of edge) {
    const a = at(g0, 0), b = at(g1, 0), a2 = at(g0, th), b2 = at(g1, th), mx = (a.p[0] + b.p[0]) / 2 - cx, my = (a.p[1] + b.p[1]) / 2 - cy, mz = (a.p[2] + b.p[2]) / 2 - cz, l = Math.hypot(mx, my, mz) || 1, n = [mx / l, my / l, mz / l];
    mb.quad(a.p, b.p, b2.p, a2.p, n, n, n, n, rt(0.1, 0.1), rt(0.9, 0.1), rt(0.9, 0.3), rt(0.1, 0.3), [1.3, 1.2, 1.1], n);
  }
  const mid = at([(i0 + i1) / 2, (j0 + j1) / 2], 0);
  return piece(mb, mid.n, 2.2);
}
function clayPieces(kind, v) {
  const prof = PROFILE[kind], look = clayLook(kind, v), top = prof[prof.length - 1][1], rnd = lcg(kind.charCodeAt(0) * 977 + v * 131 + 7), out = [], R = prof.length - 1;
  const bands = kind === 'jar' ? [[1, 3], [3, 5], [5, R]] : kind === 'pot' ? [[1, 3], [3, R]] : [[1, 3], [3, R]];
  const per = kind === 'urn' ? 3 : 4, step = 12 / per;
  bands.forEach((b, bi) => { const sh = (bi * 1.5) % step; for (let s = 0; s < per; s++) out.push(clayShard(prof, look, top, sh + s * step, sh + (s + 1) * step, b[0], b[1], rnd)); });
  {   // the foot stays where it stood: a low broken bowl (outside glazed, the floor raw)
    const mb = new MB(), k = 0.7, tone = look.tone;
    lathe(mb, [prof[0], prof[1]], look.reg, { col: [tone[0] * k, tone[1] * k, tone[2] * k], vy: [0, top] });
    lathe(mb, [[prof[1][0] - 1.9, prof[1][1]], [prof[0][0] - 1.5, 1.2]], REG.raw, { inside: true, col: [0.7, 0.66, 0.64] });
    lathe(mb, [[prof[1][0], prof[1][1]], [prof[1][0] - 1.9, prof[1][1]]], REG.raw, { col: [1.1, 1.04, 0.98] });
    disc(mb, 1.2, prof[0][0] - 1.5, REG.raw, [0.62, 0.58, 0.56]);
    out.push(piece(mb, [0, 1, 0], prof[1][1] / 2, true));
  }
  if (kind === 'urn') { const mb = new MB(); lathe(mb, [[7.2, 28.2], [6.4, 30.4], [2.4, 32], [1.7, 33.6], [2.6, 35.4], [0, 36.2]], look.reg, { col: look.tone, vy: [22, 37] }); disc(mb, 28.2, 7.2, REG.raw, [0.8, 0.76, 0.74], 12, -1); out.push(piece(mb, [0, 1, 0], 3)); }
  if (kind === 'jar' && v === 1) { const mb = new MB(); lathe(mb, CLOTH_CAP, REG.cloth, { col: [1, 0.97, 0.9], vy: [56, 70] }); out.push(piece(mb, [0, 1, 0], 3)); }
  if (kind === 'pot' && v === 2) { const mb = new MB(); disc(mb, 41.2, 16.2, REG.lid, [1, 0.95, 0.88]); disc(mb, 39.6, 16.2, REG.lid, [0.7, 0.66, 0.62], 12, -1); lathe(mb, [[16.2, 39.6], [16.2, 41.2]], REG.frame, { col: [0.86, 0.8, 0.74] }); out.push(piece(mb, [0, 1, 0], 1.2)); }
  return out;
}
function cratePieces() {
  const out = [], hw = 25.4, h = 52, pk = REG.plank, th = 2.6, rnd = lcg(4242);
  const third = (k) => [pk[0], pk[1] + (pk[3] - pk[1]) * (2 - k) / 3, pk[2], pk[1] + (pk[3] - pk[1]) * (3 - k) / 3];
  // each side: three boards one above the other (the texture's three boards), each a thin box
  const side = (ux, uz, nx, nz) => {
    for (let k = 0; k < 3; k++) {
      const mb = new MB(), y0 = (h / 3) * k + 0.4, y1 = (h / 3) * (k + 1) - 0.4, r = third(k), c = [1, 0.97, 0.93], cut = (rnd() - 0.5) * 8;
      const at = (u, y, w) => [ux * u + nx * (hw - w), y, uz * u + nz * (hw - w)], n = [nx, 0, nz], nn = [-nx, 0, -nz], e0 = -hw + 1 + Math.max(0, cut), e1 = hw - 1 + Math.min(0, cut);
      mb.quad(at(e0, y0, 0), at(e1, y0, 0), at(e1, y1, 0), at(e0, y1, 0), n, n, n, n, [r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]], c, n);
      mb.quad(at(e0, y0, th), at(e1, y0, th), at(e1, y1, th), at(e0, y1, th), nn, nn, nn, nn, [r[0], r[3]], [r[2], r[3]], [r[2], r[1]], [r[0], r[1]], [0.72, 0.68, 0.64], nn);
      const up = [0, 1, 0], dn = [0, -1, 0], fr = REG.raw, w0 = [1.15, 1.02, 0.86];   // fresh wood where it split
      mb.quad(at(e0, y1, 0), at(e1, y1, 0), at(e1, y1, th), at(e0, y1, th), up, up, up, up, [fr[0], fr[1]], [fr[2], fr[1]], [fr[2], fr[1] + 0.01], [fr[0], fr[1] + 0.01], w0, up);
      mb.quad(at(e0, y0, 0), at(e1, y0, 0), at(e1, y0, th), at(e0, y0, th), dn, dn, dn, dn, [fr[0], fr[1]], [fr[2], fr[1]], [fr[2], fr[1] + 0.01], [fr[0], fr[1] + 0.01], w0, dn);
      const p = piece(mb, [nx, 0, nz], th / 2); p.out = [nx, nz]; out.push(p);
    }
  };
  side(1, 0, 0, -1); side(0, 1, 1, 0); side(-1, 0, 0, 1); side(0, -1, -1, 0);
  for (let k = 0; k < 3; k++) { const mb = new MB(), z0 = -hw + (2 * hw / 3) * k + 0.5, z1 = -hw + (2 * hw / 3) * (k + 1) - 0.5; mb.box(-hw, h - 4, z0, hw, h - 1.4, z1, pk, [1, 0.97, 0.93], 'LRUFBD', () => third(k)); const p = piece(mb, [0, 1, 0], 1.3); p.out = [0, k - 1]; out.push(p); }
  for (let k = 0; k < 4; k++) { const mb = new MB(), sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1; mb.box(sx * hw - 2.4, 2, sz * hw - 2.4, sx * hw + 2.4, h - 2, sz * hw + 2.4, REG.frame, [0.9, 0.86, 0.82], 'LRUFBD'); const p = piece(mb, [1, 0, 0], 2.4); out.push(p); }   // corner posts
  for (let k = 0; k < 6; k++) {   // splinters: long thin wedges
    const mb = new MB(), L = 14 + rnd() * 12, w = 1.6 + rnd() * 1.4, a = rnd() * TAU, r = 8 + rnd() * 12, x = Math.cos(a) * r, z = Math.sin(a) * r, y = 12 + rnd() * 28, fr = REG.raw, c = [1.18, 1.04, 0.86];
    const A = [x - L / 2, y, z], B = [x + L / 2, y + (rnd() - 0.5) * 2, z], C1 = [x, y + w, z - w], C2 = [x, y - w * 0.6, z + w], t0 = [fr[0], fr[1]], t1 = [fr[2], fr[1]], t2 = [fr[0], fr[3]];
    for (const [p, q, s] of [[A, C1, C2], [B, C2, C1], [A, B, C1], [A, C2, B]]) { const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = s[0] - p[0], vy = s[1] - p[1], vz = s[2] - p[2], n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(n[0], n[1], n[2]) || 1, m = [(p[0] + q[0] + s[0]) / 3 - x, (p[1] + q[1] + s[1]) / 3 - y, (p[2] + q[2] + s[2]) / 3 - z], sg = n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0 ? -1 : 1, nn = [n[0] / l * sg, n[1] / l * sg, n[2] / l * sg]; mb.tri(p, q, s, nn, nn, nn, t0, t1, t2, c, nn); }
    out.push(piece(mb, [0, 1, 0], w * 0.6));
  }
  return out;
}
function barrelPieces() {
  const out = [], sv = REG.stave, th = 2.2, rnd = lcg(909), prof = BARREL_SH, N = profNormals(prof), n8 = 8;
  for (let s = 0; s < n8; s++) {   // staves: 45 degrees each, two facets wide, bowed like the barrel
    const mb = new MB(), sub = 2, a0 = s / n8, a1 = (s + 1) / n8, lean = (rnd() - 0.5) * 0.02;
    const at = (j, q, off) => { const f = a0 + (a1 - a0) * (q / sub) + lean * j, a = A0 + f * TAU, r = prof[j][0] - off, n = [Math.cos(a) * N[j][0], N[j][1], Math.sin(a) * N[j][0]]; return { p: [Math.cos(a) * r, prof[j][1], Math.sin(a) * r], n, t: [sv[0] + (sv[2] - sv[0]) * (a0 + (a1 - a0) * (q / sub)), sv[3] - (sv[3] - sv[1]) * (prof[j][1] / 70)] }; };
    for (let j = 0; j < prof.length - 1; j++) {
      const k = ao(prof[j][1], 18), c = [k, k * 0.98, k * 0.95];
      for (let q = 0; q < sub; q++) {
        const a = at(j, q, 0), b = at(j, q + 1, 0), cc = at(j + 1, q + 1, 0), d = at(j + 1, q, 0); mb.quad(a.p, b.p, cc.p, d.p, a.n, b.n, cc.n, d.n, a.t, b.t, cc.t, d.t, c);
        const a2 = at(j, q, th), b2 = at(j, q + 1, th), c2 = at(j + 1, q + 1, th), d2 = at(j + 1, q, th), ng = (n) => [-n[0], -n[1], -n[2]]; mb.quad(a2.p, b2.p, c2.p, d2.p, ng(a.n), ng(b.n), ng(cc.n), ng(d.n), a.t, b.t, cc.t, d.t, [0.6, 0.56, 0.52]);
      }
      for (const q of [0, sub]) { const a = at(j, q, 0), d = at(j + 1, q, 0), a2 = at(j, q, th), d2 = at(j + 1, q, th), sg = q ? 1 : -1, ta = A0 + (q ? a1 : a0) * TAU, n = [-Math.sin(ta) * sg, 0, Math.cos(ta) * sg], fr = REG.raw; mb.quad(a.p, d.p, d2.p, a2.p, n, n, n, n, [fr[0], fr[3]], [fr[0], fr[1]], [fr[0] + 0.01, fr[1]], [fr[0] + 0.01, fr[3]], [1.1, 0.98, 0.84], n); }
    }
    const am = A0 + (a0 + a1) / 2 * TAU; out.push(piece(mb, [Math.cos(am), 0, Math.sin(am)], th / 2 + 1));
  }
  for (const f of HOOPS) {   // iron hoops: rigid rings that roll and ring
    const mb = new MB(), r = barrelR(f) + 0.9, y = 70 * f;
    lathe(mb, [[r, y - 3.2], [r, y + 3.2]], REG.iron, { col: [1, 1, 1.04] }); lathe(mb, [[r - 1.2, y - 3.2], [r - 1.2, y + 3.2]], REG.iron, { inside: true, col: [0.6, 0.6, 0.64] });
    const p = piece(mb, [0, 1, 0], 3.2); p.hoop = true; p.out = [0, 0]; out.push(p);
  }
  for (const s of [-1, 1]) {   // the head, split in two
    const mb = new MB(), r = barrelR(1) - 2.2, ld = REG.lid, cu = (ld[0] + ld[2]) / 2, cv = (ld[1] + ld[3]) / 2, ru = (ld[2] - ld[0]) / 2, rv = (ld[3] - ld[1]) / 2;
    for (let i = 0; i < 6; i++) { const b0 = (i / 6) * Math.PI - (s > 0 ? 0 : Math.PI), b1 = ((i + 1) / 6) * Math.PI - (s > 0 ? 0 : Math.PI), P0 = [Math.cos(b0) * r, 67.6, Math.sin(b0) * r], P1 = [Math.cos(b1) * r, 67.6, Math.sin(b1) * r];
      for (const up of [1, -1]) { const n = [0, up, 0]; mb.tri([0, 67.6 - (up < 0 ? 1.6 : 0), 0], [P0[0], P0[1] - (up < 0 ? 1.6 : 0), P0[2]], [P1[0], P1[1] - (up < 0 ? 1.6 : 0), P1[2]], n, n, n, [cu, cv], [cu + Math.cos(b0) * ru, cv + Math.sin(b0) * rv], [cu + Math.cos(b1) * ru, cv + Math.sin(b1) * rv], up > 0 ? [0.92, 0.88, 0.84] : [0.6, 0.56, 0.52], n); } }
    const p = piece(mb, [0, 1, 0], 0.9); p.out = [0, s]; out.push(p);
  }
  return out;
}
const PIECES = new Map();
/** the pieces of a kind (variant from the entry's index) -> [{ m, ox, oy, oz, out, flat, restH, r, stay, hoop? }] */
export function pieceModels(kind, i = 0) {
  const v = i % (VARIANTS[kind] ?? 1), k = kind + v; let p = PIECES.get(k);
  if (!p) { p = kind === 'crate' ? cratePieces() : kind === 'barrel' ? barrelPieces() : clayPieces(kind, v); PIECES.set(k, p); }
  return p;
}

// ───────────────────────── pickups ─────────────────────────
function coinModel() {
  const mb = new MB(), r = 7.4, t = 1.3, sides = 14, cn = REG.coin, ed = REG.edge, cu = (cn[0] + cn[2]) / 2, cv = (cn[1] + cn[3]) / 2, ru = (cn[2] - cn[0]) / 2, rv = (cn[3] - cn[1]) / 2, c = [0.96, 0.98, 1.04];
  for (let i = 0; i < sides; i++) {   // stands on its edge: the faces look along +-z, it spins about y
    const a0 = (i / sides) * TAU, a1 = ((i + 1) / sides) * TAU, x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r;
    for (const s of [-1, 1]) { const n = [0, 0, s]; mb.tri([0, 0, s * t], [x0, y0, s * t], [x1, y1, s * t], n, n, n, [cu, cv], [cu + Math.cos(a0) * ru * s, cv - Math.sin(a0) * rv], [cu + Math.cos(a1) * ru * s, cv - Math.sin(a1) * rv], c, n); }
    const n0 = [Math.cos(a0), Math.sin(a0), 0], n1 = [Math.cos(a1), Math.sin(a1), 0], u0 = ed[0] + (ed[2] - ed[0]) * (i / sides), u1 = ed[0] + (ed[2] - ed[0]) * ((i + 1) / sides);
    mb.quad([x0, y0, -t], [x1, y1, -t], [x1, y1, t], [x0, y0, t], n0, n1, n1, n0, [u0, ed[3]], [u1, ed[3]], [u1, ed[1]], [u0, ed[1]], [0.8, 0.82, 0.9]);
  }
  return mb.done();
}
/** a cut stone: n-sided double pyramid (top taller), flat facets */
function gemModel(n, r, up, down, col, col2) {
  const mb = new MB(), g = REG.gem, t0 = [g[0], g[3]], t1 = [g[2], g[3]], t2 = [(g[0] + g[2]) / 2, g[1]];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, A = [Math.cos(a0) * r, 0, Math.sin(a0) * r], B = [Math.cos(a1) * r, 0, Math.sin(a1) * r], am = (a0 + a1) / 2;
    for (const [tip, cc] of [[[0, up, 0], i & 1 ? col : col2], [[0, -down, 0], i & 1 ? col2 : col]]) { const ny = tip[1] > 0 ? r / up : -r / down, l = Math.hypot(1, ny), nn = [Math.cos(am) / l, ny / l, Math.sin(am) / l]; mb.tri(A, B, tip, nn, nn, nn, t0, t1, t2, cc, nn); }
  }
  return mb.done();
}
let PK = null;
/** [coin, heal piece, resonance mote] models */
export function pickupModels() { return PK ?? (PK = [coinModel(), gemModel(6, 5.6, 10.5, 6.5, [1.5, 0.2, 0.22], [1.15, 0.1, 0.16]), gemModel(4, 5.2, 7.4, 7.4, [1.2, 1.5, 1.9], [0.86, 1.2, 1.8])]); }

// ───────────────────────── writing vertices ─────────────────────────
const q2 = (k) => (k <= 0 ? 0 : k >= 2 ? 255 : (k * 127.5 + 0.5) | 0);
/**
 * a whole thing into a vertex buffer, lit like the kit's props (lightAt at every vertex, lifted the same way). f/u = Float32/Uint8 views of
 * one ArrayBuffer, v0 = first vertex. rot turns it about y (clay ignores it: the gloss of the glaze always faces the camera). -> vertices written
 */
export function bakeWhole(m, Wd, x, y, z, rot, f, u, v0, tone = null) {
  const cs = Math.cos(rot), sn = Math.sin(rot), n = m.n, tr = tone ? tone[0] : 1, tg = tone ? tone[1] : 1, tb = tone ? tone[2] : 1;
  for (let i = 0; i < n; i++) {
    const px0 = m.p[i * 3], py = m.p[i * 3 + 1], pz0 = m.p[i * 3 + 2], nx0 = m.nr[i * 3], ny = m.nr[i * 3 + 1], nz0 = m.nr[i * 3 + 2];
    const wx = x + px0 * cs - pz0 * sn, wy = y + py, wz = z + px0 * sn + pz0 * cs, nx = nx0 * cs - nz0 * sn, nz = nx0 * sn + nz0 * cs;
    const L = lightAt(Wd, wx + nx * 2, wy + ny * 2, wz + nz * 2, nx, ny, nz), o = (v0 + i) * 7, c = (v0 + i) * BRK_VERT + 20;
    const lr = Math.min(1.6, 0.42 + 0.72 * L[0]), lg = Math.min(1.6, 0.42 + 0.72 * L[1]), lb = Math.min(1.6, 0.42 + 0.72 * L[2]);
    f[o] = wx; f[o + 1] = wy; f[o + 2] = wz; f[o + 3] = m.t[i * 2]; f[o + 4] = m.t[i * 2 + 1];
    u[c] = q2(lr * m.c[i * 3] * tr); u[c + 1] = q2(lg * m.c[i * 3 + 1] * tg); u[c + 2] = q2(lb * m.c[i * 3 + 2] * tb); u[c + 3] = 128;
    u[c + 4] = 255; u[c + 5] = 0; u[c + 6] = 0; u[c + 7] = 255;
  }
  return n;
}
/**
 * a moving model into a dynamic buffer: R = 3x3 rotation (row major, Float32Array(9)) times scale s, then (tx, ty, tz); light (lr, lg, lb) is
 * the colour of the place, shaded per vertex by its turned normal against a key light from above the camera; al = 0..1 (fading pieces).
 * Nothing is allocated. -> vertices written
 */
export function writeDyn(m, f, u, v0, R, s, tx, ty, tz, lr, lg, lb, al, glow) {
  const n = m.n, P = m.p, Nn = m.nr, T = m.t, C = m.c, a8 = al >= 1 ? 128 : al <= 0 ? 0 : (al * 128 + 0.5) | 0, g0 = glow || 0;
  const r0 = R[0], r1 = R[1], r2 = R[2], r3 = R[3], r4 = R[4], r5 = R[5], r6 = R[6], r7 = R[7], r8 = R[8];
  for (let i = 0; i < n; i++) {
    const i3 = i * 3, x = P[i3], y = P[i3 + 1], z = P[i3 + 2], nx = Nn[i3], ny = Nn[i3 + 1], nz = Nn[i3 + 2];
    const wnx = r0 * nx + r1 * ny + r2 * nz, wny = r3 * nx + r4 * ny + r5 * nz, wnz = r6 * nx + r7 * ny + r8 * nz;
    let d = wnx * -0.28 + wny * 0.74 + wnz * -0.61; if (d < 0) d = d * -0.18;   // key light from above and from the camera's side; a little bounce from below
    const k = 0.4 + 0.62 * d + g0, o = (v0 + i) * 7, c = (v0 + i) * BRK_VERT + 20;
    f[o] = tx + (r0 * x + r1 * y + r2 * z) * s; f[o + 1] = ty + (r3 * x + r4 * y + r5 * z) * s; f[o + 2] = tz + (r6 * x + r7 * y + r8 * z) * s; f[o + 3] = T[i * 2]; f[o + 4] = T[i * 2 + 1];
    const cr = lr * k * C[i3], cg = lg * k * C[i3 + 1], cb = lb * k * C[i3 + 2];
    u[c] = cr <= 0 ? 0 : cr >= 2 ? 255 : (cr * 127.5 + 0.5) | 0; u[c + 1] = cg <= 0 ? 0 : cg >= 2 ? 255 : (cg * 127.5 + 0.5) | 0; u[c + 2] = cb <= 0 ? 0 : cb >= 2 ? 255 : (cb * 127.5 + 0.5) | 0; u[c + 3] = a8;
    u[c + 4] = 255; u[c + 5] = 0; u[c + 6] = 0; u[c + 7] = 255;
  }
  return n;
}
/** triangles of everything a kind is (for the budget table): { whole, pieces, shards } */
export function breakStats(kind, i = 0) { const p = pieceModels(kind, i); return { whole: wholeModel(kind, i).n / 3, pieces: p.length, shards: p.reduce((a, q) => a + q.tris, 0) }; }

// ───────────────────────── the atlas (drawn on a 512 x 512 canvas 2D context) ─────────────────────────
export function paintBreakAtlas(x) {
  const R = lcg(20261118), rr = (a, b) => a + R() * (b - a);
  x.fillStyle = '#5a4a3c'; x.fillRect(0, 0, 512, 512);
  const clip = (X, Y, Wd, H, fn) => { x.save(); x.beginPath(); x.rect(X, Y, Wd, H); x.clip(); x.translate(X, Y); fn(); x.restore(); };
  const speck = (Wd, H, n, cols, a0, a1, s0 = 0.6, s1 = 2) => { for (let i = 0; i < n; i++) { x.globalAlpha = rr(a0, a1); x.fillStyle = cols[(R() * cols.length) | 0]; const s = rr(s0, s1); x.fillRect(rr(0, Wd), rr(0, H), s, s * rr(0.6, 1.6)); } x.globalAlpha = 1; };
  const glaze = (X, Y, base, deep, run, band, gloss) => clip(X, Y, 256, 160, () => {
    const g = x.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, base[0]); g.addColorStop(0.45, base[1]); g.addColorStop(1, base[2]); x.fillStyle = g; x.fillRect(0, 0, 256, 160);
    for (let y = 3; y < 160; y += rr(4, 9)) { x.globalAlpha = rr(0.05, 0.16); x.fillStyle = R() < 0.5 ? '#000' : '#fff'; x.fillRect(0, y, 256, rr(0.8, 1.8)); }   // throwing rings
    x.globalAlpha = 1; speck(256, 160, 520, [deep, '#1a0f08', '#e8c9a0'], 0.08, 0.3);
    for (let i = 0; i < 13; i++) {   // glaze that ran down from the shoulder (drawn three times: the piece wraps around the jar)
      const cx = rr(0, 256), w = rr(7, 20), len = rr(34, 118), a = rr(0.4, 0.72);
      for (const dx of [-256, 0, 256]) {
        x.globalAlpha = a; x.fillStyle = run; x.beginPath(); x.moveTo(cx + dx - w / 2, 0); x.lineTo(cx + dx + w / 2, 0); x.lineTo(cx + dx + w / 2, len - w / 2); x.arc(cx + dx, len - w / 2, w / 2, 0, Math.PI); x.closePath(); x.fill();
        x.globalAlpha = a * 0.5; x.fillStyle = '#fff2d8'; x.fillRect(cx + dx - w / 2 + 1, 2, 1.4, len - w * 0.6); x.beginPath(); x.arc(cx + dx - w * 0.12, len - w * 0.55, w * 0.16, 0, TAU); x.fill();
      }
    }
    x.globalAlpha = 0.7; x.fillStyle = run; x.fillRect(0, 0, 256, 15);
    x.globalAlpha = 0.85; x.fillStyle = band; x.fillRect(0, 60, 256, 2.2); x.fillRect(0, 76, 256, 2.2);   // an incised double line and a wave between
    x.strokeStyle = band; x.lineWidth = 1.8; x.beginPath(); for (let u = 0; u <= 256; u += 4) { const y = 69 + Math.sin(u / 256 * TAU * 8) * 3.6; if (u) x.lineTo(u, y); else x.moveTo(u, y); } x.stroke();
    x.globalAlpha = 0.5; x.fillStyle = '#f6dcc0'; x.fillRect(0, 0, 256, 2.5);   // the worn lip
    x.globalAlpha = 0.34; x.fillStyle = '#120a06'; x.fillRect(0, 150, 256, 10);   // dirt at the foot
    const gl = x.createLinearGradient(86, 0, 124, 0); gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, gloss); gl.addColorStop(1, 'rgba(255,255,255,0)');   // the gloss of the glaze, on the side the camera sees
    x.globalAlpha = 1; x.fillStyle = gl; x.fillRect(86, 14, 38, 118);
    x.globalAlpha = 0.5; x.fillStyle = '#fff'; x.beginPath(); x.ellipse(104, 40, 3.2, 8, 0, 0, TAU); x.fill(); x.globalAlpha = 1;
  });
  glaze(0, 0, ['#a8683a', '#8f5229', '#6e3c1e'], '#4a2814', '#3e1f10', '#d9b084', 'rgba(255,236,208,0.34)');   // A: brown salt glaze
  glaze(0, 160, ['#5b6a68', '#46544f', '#333d3a'], '#1e2624', '#1c2422', '#a9bdb4', 'rgba(226,246,240,0.3)');   // B: dark ash glaze
  clip(256, 0, 128, 96, () => { x.fillStyle = '#c48e62'; x.fillRect(0, 0, 128, 96); speck(128, 96, 700, ['#8a5a36', '#e6bd94', '#70462a', '#d9a878'], 0.12, 0.4, 0.8, 2.6); for (let i = 0; i < 9; i++) { x.globalAlpha = 0.16; x.fillStyle = '#5e3a22'; x.fillRect(0, rr(0, 96), 128, rr(0.8, 2)); } x.globalAlpha = 1; });   // raw clay
  clip(384, 0, 128, 96, () => { x.fillStyle = '#b9aa8a'; x.fillRect(0, 0, 128, 96); for (let i = 0; i < 128; i += 3) { x.globalAlpha = 0.2; x.fillStyle = i % 6 ? '#7d7058' : '#e9dfc6'; x.fillRect(i, 0, 1.2, 96); } for (let j = 0; j < 96; j += 3) { x.globalAlpha = 0.16; x.fillStyle = j % 6 ? '#6d624c' : '#efe6d0'; x.fillRect(0, j, 128, 1.2); } x.globalAlpha = 1; speck(128, 96, 160, ['#5e533e', '#f4ecd8'], 0.1, 0.3);
    for (let i = 0; i < 7; i++) { x.globalAlpha = 0.22; x.strokeStyle = '#5a4e3a'; x.lineWidth = 1.4; x.beginPath(); const u = rr(0, 128); x.moveTo(u, 96); x.quadraticCurveTo(u + rr(-10, 10), 60, u + rr(-6, 6), rr(30, 52)); x.stroke(); } x.globalAlpha = 1; });   // linen with folds
  const wood = (Wd, H, base, n, len = 40) => { x.fillStyle = base; x.fillRect(0, 0, Wd, H); for (let i = 0; i < n; i++) { x.globalAlpha = rr(0.07, 0.24); x.fillStyle = R() < 0.6 ? '#2e1c0e' : '#e3c08e'; x.fillRect(rr(-10, Wd), rr(0, H), rr(len * 0.4, len * 1.8), rr(0.7, 1.7)); } x.globalAlpha = 1; };
  const nail = (u, v, r = 2.1) => { x.globalAlpha = 0.5; x.fillStyle = '#140c06'; x.beginPath(); x.arc(u + 0.6, v + 0.9, r + 0.9, 0, TAU); x.fill(); x.globalAlpha = 1; x.fillStyle = '#3c3e46'; x.beginPath(); x.arc(u, v, r, 0, TAU); x.fill(); x.fillStyle = '#b0b6c6'; x.beginPath(); x.arc(u - 0.6, v - 0.7, r * 0.42, 0, TAU); x.fill(); };
  clip(0, 320, 256, 192, () => {   // three boards of a crate side, one above the other
    wood(256, 192, '#8e6a44', 520);
    for (let k = 0; k < 3; k++) { const y = k * 64; x.globalAlpha = 0.16; x.fillStyle = k === 1 ? '#fff0d0' : '#20120a'; x.fillRect(0, y, 256, 64); x.globalAlpha = 0.85; x.fillStyle = '#1c1008'; x.fillRect(0, y + 61.5, 256, 2.5); x.globalAlpha = 0.3; x.fillStyle = '#ffe9c4'; x.fillRect(0, y, 256, 1.6);
      x.globalAlpha = 0.5; x.strokeStyle = '#3a2412'; x.lineWidth = 1.2; x.beginPath(); const ky = y + rr(16, 46), kx = rr(40, 216); x.ellipse(kx, ky, rr(5, 9), rr(2.4, 4), 0, 0, TAU); x.stroke(); x.beginPath(); x.ellipse(kx, ky, 13, 6, 0, 0, TAU); x.stroke(); x.globalAlpha = 1; }
    x.globalAlpha = 0.28; x.fillStyle = '#120a05'; x.fillRect(0, 168, 256, 24); x.globalAlpha = 1;
  });
  clip(256, 96, 256, 32, () => { wood(256, 32, '#73522f', 130, 60); x.globalAlpha = 0.55; x.fillStyle = '#170d06'; x.fillRect(0, 29.5, 256, 2.5); x.fillRect(0, 0, 2, 32); x.fillRect(254, 0, 2, 32); x.globalAlpha = 0.3; x.fillStyle = '#ffe6bc'; x.fillRect(0, 0, 256, 1.6); x.globalAlpha = 1; for (const u of [9, 247]) for (const v of [9, 23]) nail(u, v); nail(128, 16, 1.8); });   // a frame board with nail heads
  clip(256, 128, 256, 128, () => {   // eight staves around a barrel
    wood(256, 128, '#7d5a36', 40, 6);
    for (let s = 0; s < 8; s++) { const u = s * 32; x.globalAlpha = rr(0.04, 0.2); x.fillStyle = R() < 0.5 ? '#fff0d0' : '#1a0e06'; x.fillRect(u, 0, 32, 128); x.globalAlpha = 0.9; x.fillStyle = '#160c06'; x.fillRect(u + 30.6, 0, 1.6, 128); x.globalAlpha = 0.28; x.fillStyle = '#ffe9c4'; x.fillRect(u + 0.2, 0, 1.2, 128);
      for (let i = 0; i < 16; i++) { x.globalAlpha = rr(0.08, 0.22); x.fillStyle = R() < 0.6 ? '#2a180c' : '#e0bd8c'; x.fillRect(u + rr(2, 28), rr(0, 128), rr(0.7, 1.5), rr(14, 60)); } }
    x.globalAlpha = 0.3; x.fillStyle = '#100803'; x.fillRect(0, 112, 256, 16); x.globalAlpha = 0.22; x.fillRect(0, 0, 256, 8); x.globalAlpha = 1;
  });
  clip(256, 256, 256, 24, () => { const g = x.createLinearGradient(0, 0, 0, 24); g.addColorStop(0, '#6e7482'); g.addColorStop(0.3, '#4a4e5a'); g.addColorStop(1, '#25272e'); x.fillStyle = g; x.fillRect(0, 0, 256, 24); speck(256, 24, 260, ['#8a5a3a', '#15161a', '#9aa0b0'], 0.1, 0.34, 0.8, 2.4); x.globalAlpha = 0.6; x.fillStyle = '#c3c9d8'; x.fillRect(0, 1.5, 256, 1.4); x.globalAlpha = 1; for (let u = 16; u < 256; u += 64) nail(u, 12, 2.4); });   // iron hoop with rivets and rust
  clip(256, 280, 256, 24, () => { x.fillStyle = '#9c865c'; x.fillRect(0, 0, 256, 24); for (let u = -24; u < 256; u += 9) { x.globalAlpha = 0.6; x.fillStyle = '#5c4a2c'; x.beginPath(); x.moveTo(u, 24); x.lineTo(u + 16, 0); x.lineTo(u + 19, 0); x.lineTo(u + 3, 24); x.fill(); x.globalAlpha = 0.5; x.fillStyle = '#e4d2a4'; x.beginPath(); x.moveTo(u + 4, 24); x.lineTo(u + 20, 0); x.lineTo(u + 22.4, 0); x.lineTo(u + 6.4, 24); x.fill(); } x.globalAlpha = 0.35; x.fillStyle = '#20160a'; x.fillRect(0, 0, 256, 3); x.fillRect(0, 21, 256, 3); x.globalAlpha = 1; });   // rope
  clip(256, 304, 112, 112, () => {   // a barrel head: boards across a round
    x.fillStyle = '#2a1a0e'; x.fillRect(0, 0, 112, 112); x.save(); x.beginPath(); x.arc(56, 56, 53, 0, TAU); x.clip(); wood(112, 112, '#7a5a38', 150, 30);
    for (let k = 1; k < 5; k++) { x.globalAlpha = 0.8; x.fillStyle = '#170d06'; x.fillRect(0, k * 22.4 - 1, 112, 2); x.globalAlpha = 0.25; x.fillStyle = '#ffe9c4'; x.fillRect(0, k * 22.4 + 1, 112, 1.2); } x.globalAlpha = 1; x.restore();
    x.globalAlpha = 0.55; x.strokeStyle = '#120a05'; x.lineWidth = 5; x.beginPath(); x.arc(56, 56, 51, 0, TAU); x.stroke(); x.globalAlpha = 1; nail(56, 20, 2); nail(56, 92, 2);
  });
  clip(368, 304, 112, 112, () => {   // a silver coin: a raised rim, a ring of beads, a bell struck in the middle (dark field: the relief has to read at 14 px)
    x.fillStyle = '#4a4f5c'; x.fillRect(0, 0, 112, 112);
    const g = x.createRadialGradient(42, 38, 4, 56, 56, 56); g.addColorStop(0, '#aeb5c6'); g.addColorStop(0.6, '#7d8496'); g.addColorStop(1, '#565c6c'); x.fillStyle = g; x.beginPath(); x.arc(56, 56, 55, 0, TAU); x.fill();
    x.strokeStyle = '#f4f6ff'; x.lineWidth = 7; x.beginPath(); x.arc(56, 56, 50, 0, TAU); x.stroke(); x.strokeStyle = '#3c4150'; x.lineWidth = 2.4; x.beginPath(); x.arc(56, 56, 45.4, 0, TAU); x.stroke();
    for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU; x.fillStyle = '#e4e8f4'; x.beginPath(); x.arc(56 + Math.cos(a) * 39, 56 + Math.sin(a) * 39, 2.6, 0, TAU); x.fill(); }
    const bell = () => { x.beginPath(); x.moveTo(56, 24); x.bezierCurveTo(74, 26, 75, 52, 82, 70); x.lineTo(30, 70); x.bezierCurveTo(37, 52, 38, 26, 56, 24); x.fill(); x.beginPath(); x.arc(56, 77, 6.5, 0, TAU); x.fill(); x.fillRect(52.5, 17, 7, 9); };
    x.save(); x.translate(1.6, 2.2); x.fillStyle = '#2c303c'; bell(); x.restore(); x.fillStyle = '#eef1fb'; bell();
    x.fillStyle = '#8f96a8'; x.beginPath(); x.moveTo(60, 30); x.bezierCurveTo(69, 34, 70, 52, 75, 66); x.lineTo(66, 66); x.bezierCurveTo(64, 52, 64, 38, 60, 30); x.fill();
  });
  clip(256, 416, 256, 16, () => { x.fillStyle = '#aab0c0'; x.fillRect(0, 0, 256, 16); for (let u = 0; u < 256; u += 4) { x.fillStyle = '#5e6474'; x.fillRect(u, 0, 1.6, 16); x.fillStyle = '#f0f3fc'; x.fillRect(u + 2, 0, 1, 16); } });   // reeded edge
  clip(256, 432, 80, 80, () => { x.fillStyle = '#e9e9ee'; x.fillRect(0, 0, 80, 80); for (let i = 0; i < 26; i++) { x.globalAlpha = rr(0.1, 0.4); x.fillStyle = R() < 0.5 ? '#fff' : '#9a9aae'; x.beginPath(); const u = rr(0, 80), v = rr(0, 80); x.moveTo(u, v); x.lineTo(u + rr(-22, 22), v + rr(8, 30)); x.lineTo(u + rr(-6, 6), v + rr(10, 36)); x.fill(); } x.globalAlpha = 1; });   // facets of a cut stone
  x.fillStyle = '#fff'; x.fillRect(336, 432, 40, 40);
  x.fillStyle = '#0e0b0a'; x.fillRect(480, 304, 32, 112);
}
