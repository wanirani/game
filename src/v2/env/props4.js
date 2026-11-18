// WORLD-LOOK (docs/v2/ENV_KIT.md 23): what lies beyond the edge of an area - ground running on into the fog, ridges of hills, tree lines,
// far houses and a churchyard wall. Static geometry like everything else (baked light, fogged by distance), built to be cheap: big
// cells, a handful of triangles per tree or house, ONE material for a whole backdrop (o.mat - a texture the area loads anyway), so a
// backdrop chunk costs one draw call. Nothing here collides (stage parts of type 'deco'); none of it is reachable.
//   { t: 'deco', mesh: 'apron',    x, z, w, d, y, mat, cell, tint, k, strips: [{ x0, x1, z0, z1, mat, tint, k }] }      x, z = the near left corner
//   { t: 'deco', mesh: 'ridge',    x, z, x1, z1, y, h, amp, seg, depth, to: [x, z], tint, k, mat, seed }               a line on the ground -> a slope up to a ragged crest
//   { t: 'deco', mesh: 'treeline', x, z, x1, z1, y, n | gap, h, hv, wob, kind: 'fir' | 'bare' | 'round', tint, mat, seed }
//   { t: 'deco', mesh: 'farhouse', x, z, w, d, h, rh, y, tint, roofTint, lit, mat, seed }                                x, z = the middle of its front
//   { t: 'deco', mesh: 'farwall',  x, z, x1, z1, y, h, mat, tint, piers, to: [x, z] }                                    a plain long wall with a coping and piers
import { hash, vnoise } from './geo.js';
import { PROPS } from './props.js';

/** backdrops are not lifted like props (they are scenery, not obstacles) and take no shade or tint of the piece built before them */
const plain = (G, f) => { const l = G.lift, s = G.shade, t = G.tintMul; G.lift = false; G.shade = null; G.tintMul = null; try { f(); } finally { G.lift = l; G.shade = s; G.tintMul = t; } };
const facing = (x, z, dx, dz, to) => { const len = Math.hypot(dx, dz) || 1; let nx = dz / len, nz = -dx / len; const t = to ?? [x + dx / 2, -1e7]; if ((t[0] - x) * nx + (t[1] - z) * nz < 0) { nx = -nx; nz = -nz; } return [nx, nz, len]; };

const TREE = {
  /** a conifer: two tiers of dark boughs on a short trunk */
  fir(G, x, y, z, h, s, o) {
    const mat = o.mat ?? 'white', T = o.tint ?? [0.2, 0.26, 0.24], r = h * (0.2 + 0.07 * hash(s, 3.3)), a0 = Math.PI / 4 + (hash(s, 9.1) - 0.5) * 0.5;
    G.lathe(mat, x, z, [[h * 0.035, y], [h * 0.03, y + h * 0.2]], 4, { a0, tint: [T[0] * 0.8, T[1] * 0.7, T[2] * 0.7], vary: 0, k: 0.8 });
    G.lathe(mat, x, z, [[r, y + h * 0.16], [r * 0.4, y + h * 0.56], [r * 0.74, y + h * 0.54], [0, y + h]], 4, { a0, tint: T, vary: 0.3, flat: true, k: o.k ?? 1 });
  },
  /** a bare tree: a leaning trunk and a few boughs */
  bare(G, x, y, z, h, s, o) {
    const mat = o.mat ?? 'white', T = o.tint ?? [0.2, 0.19, 0.2], q = { tint: T, vary: 0.2, k: o.k ?? 1 }, lean = (hash(s, 1.7) - 0.5) * h * 0.22, top = [x + lean, y + h * 0.62, z];
    G.tube(mat, [x, y, z], top, h * 0.045, h * 0.026, 4, q);
    const n = 3 + (hash(s, 5.5) > 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI + (hash(s + i, 2.2) - 0.5) * 0.9, up = 0.5 + 0.4 * hash(i, s * 1.3), len = h * (0.3 + 0.22 * hash(s * 3.1, i));
      const from = [x + lean * (0.55 + 0.15 * i), y + h * (0.4 + 0.075 * i), z];
      G.tube(mat, from, [from[0] + Math.cos(a) * len * (1 - up * 0.4), from[1] + len * up, from[2] - Math.sin(a) * len * 0.25], h * 0.022, h * 0.006, 3, q);
    }
    G.tube(mat, top, [top[0] + lean * 0.5, y + h, z], h * 0.024, h * 0.005, 3, q);
  },
  /** a tree in leaf: a faceted crown on a trunk */
  round(G, x, y, z, h, s, o) {
    const mat = o.mat ?? 'white', T = o.tint ?? [0.22, 0.24, 0.18], r = h * (0.26 + 0.08 * hash(s, 4.4)), a0 = hash(s, 7.7) * 1.2;
    G.lathe(mat, x, z, [[h * 0.04, y], [h * 0.03, y + h * 0.42]], 4, { tint: [T[0] * 0.8, T[1] * 0.66, T[2] * 0.66], vary: 0, k: 0.8 });
    G.lathe(mat, x, z, [[r * 0.45, y + h * 0.36], [r, y + h * 0.54], [r * 0.92, y + h * 0.74], [r * 0.5, y + h * 0.92], [0, y + h]], 5, { a0, tint: T, vary: 0.34, flat: true, k: o.k ?? 1, sq: 0.8 });
  },
};

Object.assign(PROPS, {
  apron(G, x, y, z, o = {}) {
    plain(G, () => {
      const cell = o.cell ?? 320, mat = o.mat ?? 'soil';
      G.quad(mat, [x, y, z], [o.w, 0, 0], [0, 0, o.d], [0, 1, 0], { cell, vary: o.vary ?? 0.34, k: o.k ?? 0.8, tint: o.tint, tile: o.tile });
      for (const s of o.strips ?? []) G.quad(s.mat ?? mat, [x + s.x0, y + 0.7, z + s.z0], [s.x1 - s.x0, 0, 0], [0, 0, s.z1 - s.z0], [0, 1, 0], { cell: s.cell ?? cell, vary: s.vary ?? 0.3, k: s.k ?? o.k ?? 0.8, tint: s.tint, tile: s.tile ?? o.tile });
    });
  },
  ridge(G, x, y, z, o = {}) {
    plain(G, () => {
      const dx = o.x1 - x, dz = o.z1 - z, [nx, nz, len] = facing(x, z, dx, dz, o.to);
      const n = Math.max(2, Math.round(len / (o.seg ?? 170))), h = o.h ?? 400, amp = o.amp ?? 0.3, dep = o.depth ?? h * 0.8, sd = o.seed ?? 1, mat = o.mat ?? 'white', tint = o.tint ?? [0.3, 0.32, 0.38];
      const H = (i) => h * (1 - amp + amp * 2 * (0.62 * vnoise(i * 0.31 + sd * 7.1, sd * 3.3) + 0.38 * vnoise(i * 1.27 + sd, 9.7)));
      const shade = (px, py) => 0.72 + 0.4 * Math.min(1, Math.max(0, (py - y) / h));
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n, fa = [x + dx * a, y, z + dz * a], fb = [x + dx * b, y, z + dz * b];
        const ca = [fa[0] - nx * dep, y + H(i), fa[2] - nz * dep], cb = [fb[0] - nx * dep, y + H(i + 1), fb[2] - nz * dep];
        G.quad4(mat, fa, fb, cb, ca, [nx * 0.7, 0.71, nz * 0.7], { keep: true, vary: o.vary ?? 0.3, k: o.k ?? 1, tint, shade, tile: o.tile });
      }
    });
  },
  treeline(G, x, y, z, o = {}) {
    plain(G, () => {
      const dx = o.x1 - x, dz = o.z1 - z, len = Math.hypot(dx, dz) || 1, n = o.n ?? Math.max(1, Math.round(len / (o.gap ?? 150))), sd = o.seed ?? 3, f = TREE[o.kind ?? 'fir'] ?? TREE.fir;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.2 + 0.6 * hash(i + sd, sd * 3.1)) / n, w = (hash(sd, i * 1.7) - 0.5) * 2 * (o.wob ?? 60);
        f(G, x + dx * t - dz / len * w, y, z + dz * t + dx / len * w, (o.h ?? 300) * (1 - (o.hv ?? 0.3) * hash(i * 2.3, sd + 5)), i + sd * 17, o);
      }
    });
  },
  farhouse(G, x, y, z, o = {}) {
    plain(G, () => {
      const mat = o.mat ?? 'white', w = o.w ?? 220, d = o.d ?? 140, h = o.h ?? 150, rh = o.rh ?? 80, x0 = x - w / 2, x1 = x + w / 2, z1 = z + d, zm = z + d / 2, sd = o.seed ?? 1;
      const wall = o.tint ?? [0.5, 0.48, 0.5], roof = o.roofTint ?? [0.3, 0.3, 0.38], ov = 12, ye = y + h - 4, yr = y + h + rh;
      G.box(mat, x0, y, z, x1, y + h, z1, { faces: 'FLR', tint: wall, vary: 0.24 });
      G.quad4(mat, [x0 - ov, ye, z - ov], [x1 + ov, ye, z - ov], [x1 + ov, yr, zm], [x0 - ov, yr, zm], [0, 0.6, -0.8], { tint: roof, vary: 0.3, keep: true });
      for (const sx of [-1, 1]) { const xe = sx < 0 ? x0 : x1; G.tri(mat, [xe, y + h, z], [xe, y + h, z1], [xe, yr, zm], [sx, 0, 0], { tint: wall, k: 0.82, vary: 0.2, keep: true }); }
      const cx = x0 + w * (0.2 + 0.6 * hash(sd, 2.1));
      G.box(mat, cx - 11, yr - rh * 0.5, zm - 11, cx + 11, yr + 16, zm + 11, { faces: 'FLRT', tint: wall, k: 0.8, vary: 0.1 });
      const nw = Math.max(1, Math.round(w / 100));
      for (let i = 0; i < nw; i++) {
        const wx = x0 + w * (i + 0.5) / nw, on = (o.lit ?? 0) > hash(sd + i * 3.7, 5.1);
        G.quad(mat, [wx - 11, y + h * 0.42, z - 0.9], [22, 0, 0], [0, Math.min(34, h * 0.3), 0], [0, 0, -1], on ? { emis: o.emis ?? 1.9, tint: o.glow ?? [1, 0.6, 0.26], fog: 0.55 } : { tint: [0.1, 0.1, 0.13], vary: 0, k: 0.6 });
      }
    });
  },
  farwall(G, x, y, z, o = {}) {
    plain(G, () => {
      const dx = o.x1 - x, dz = o.z1 - z, [nx, nz, len] = facing(x, z, dx, dz, o.to), h = o.h ?? 160, mat = o.mat ?? 'fieldstone', tint = o.tint, ux = dx / len, uz = dz / len, th = o.th ?? 26;
      const P = (u, yy, wd) => [x + ux * u + nx * wd, yy, z + uz * u + nz * wd], N = [nx, 0, nz], q = { keep: true, vary: 0.2, tint, k: o.k ?? 1, cell: o.cell ?? 200 };
      G.quad4(mat, P(0, y, 0), P(len, y, 0), P(len, y + h, 0), P(0, y + h, 0), N, q);
      G.quad4(mat, P(0, y + h, 3), P(len, y + h, 3), P(len, y + h + 7, 3), P(0, y + h + 7, 3), N, { ...q, k: (o.k ?? 1) * 1.15, vary: 0.08 });
      G.quad4(mat, P(0, y + h + 7, 3), P(len, y + h + 7, 3), P(len, y + h + 7, -th), P(0, y + h + 7, -th), [0, 1, 0], { ...q, k: (o.k ?? 1) * 1.1, vary: 0.08 });
      const np = Math.max(1, Math.round(len / (o.piers ?? 260)));
      for (let i = 0; i <= np; i++) { const u = len * i / np; G.quad4(mat, P(u - 13, y, 7), P(u + 13, y, 7), P(u + 13, y + h + 16, 7), P(u - 13, y + h + 16, 7), N, { ...q, k: (o.k ?? 1) * 1.08 }); G.quad4(mat, P(u - 13, y + h + 16, 7), P(u + 13, y + h + 16, 7), P(u + 13, y + h + 16, -th), P(u - 13, y + h + 16, -th), [0, 1, 0], { ...q, k: (o.k ?? 1) * 1.15 }); }
    });
  },
});
