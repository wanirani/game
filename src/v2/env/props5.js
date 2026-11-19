// DETAIL (docs/v2/ENV_KIT.md 24): things that read as things. Wall hangings that tell the night (a washing line, a harvest garland, a sign that
// hangs from a bracket, ivy whose leaves stand off the wall) and small props of a kept place (the rest spot, the gravekeeper's tools, a wood pile,
// the charred rafters of a hut). Like the rest of the kit: static geometry, baked light, textures the areas load anyway (the oak / iron / cloth /
// straw pieces of k_trim, the stone of `block`). Nothing here collides; place it along walls and in corners.
import { Frame, hash } from './geo.js';
import { PROPS, WALLPROPS } from './props.js';
import { WEAR } from './wear.js';
import './props4.js';

const fx = (G) => G.fx ?? (G.fx = { glows: [], pools: [], shadows: [] });
const shadow = (G, x, y, z, rx, rz = rx * 0.62, a = 0.5) => fx(G).shadows.push({ x, y, z, rx, rz, a });

const sign0 = WALLPROPS.sign, ivy0 = WALLPROPS.ivy;
Object.assign(WALLPROPS, {
  soot() {}, pipe() {},   // drawn by the wall itself (kit.js wallDetail): they need the wall's material, shade and tint
  /** a sign that hangs from an iron bracket, 15 off the wall, its painted face to the street (the flat board nailed to the wall when the stage has no wear) */
  sign(G, F, s) {
    if (!WEAR.age || s.perp) return sign0(G, F, s);
    const u = s.u, w = s.w ?? 70, hh = s.h ?? 24, y = s.y - 6, c = s.c ?? [0.5, 0.16, 0.14], M = { vary: 0, k: 0.7, keep: true }, off = 15, yb = y + hh + 13;
    for (const e of [-1, 1]) { const ue = u + e * (w / 2 - 6); G.tube('metal', F.pt(ue, yb, 0), F.pt(ue, yb, off + 2), 1.7, 1.7, 4, M); G.tube('metal', F.pt(ue, yb - 15, 0), F.pt(ue, yb - 1, off - 3), 1.2, 1.2, 3, M); F.box(G, 'metal', ue - 1, ue + 1, y + hh, yb, off - 1, off + 1, { faces: 'FLR', vary: 0, k: 0.6 }); }
    G.tube('metal', F.pt(u - w / 2 - 5, yb, off), F.pt(u + w / 2 + 5, yb, off), 1.8, 1.8, 4, M);
    F.box(G, 'timber', u - w / 2, u + w / 2, y, y + hh, off - 1.6, off + 1.6, { faces: 'FLRT', tint: [0.86, 0.7, 0.56], vary: 0.2 });
    F.face(G, 'white', u - w / 2 + 3, u + w / 2 - 3, y + 3, y + hh - 3, off + 1.9, { tint: c, vary: 0.12 });
    for (const k of [-0.28, 0, 0.28]) G.poly('white', [F.pt(u + w * k, y + 6, off + 2.2), F.pt(u + w * k + 6, y + hh / 2, off + 2.2), F.pt(u + w * k, y + hh - 6, off + 2.2), F.pt(u + w * k - 6, y + hh / 2, off + 2.2)], F.n, { tint: [1.2, 0.95, 0.4], vary: 0 });
  },
  /** ivy: woody stems climbing from the foot and leaves that stand off the wall (each leaf tilts out and down: its upper side takes the moon) */
  ivy(G, F, s) {
    if (!WEAR.age) return ivy0(G, F, s);
    const w = s.w ?? 120, h = s.h ?? 180, sd = s.seed ?? 1, ns = Math.max(2, Math.round(w / 46)), stems = [];
    for (let k = 0; k < ns; k++) {   // stems: flat ribbons with bends
      let u = s.u + (k + 0.5 - ns / 2) * w * 0.3 / Math.max(1, ns / 2), y = s.y; const top = h * (0.55 + 0.45 * hash(sd, k + 1)), seg = 4, pts = [[u, y]];
      for (let i = 1; i <= seg; i++) { u += (hash(sd + k * 3, i) - 0.5) * w * 0.3; y = s.y + top * i / seg; pts.push([u, y]); }
      for (let i = 0; i < seg; i++) { const a = pts[i], b = pts[i + 1], t = 2.4 * (1 - i / (seg + 1)); G.quad4('timber', F.pt(a[0] - t, a[1], 1.4), F.pt(a[0] + t, a[1], 1.4), F.pt(b[0] + t * 0.8, b[1], 1.4), F.pt(b[0] - t * 0.8, b[1], 1.4), F.n, { tint: [0.34, 0.3, 0.24], vary: 0.1, k: 0.8 }); }
      stems.push(pts);
    }
    const n = s.n ?? Math.max(12, Math.round(w * h / 560));
    for (let i = 0; i < n; i++) {
      const st = stems[i % ns], t = hash(i * 1.3 + sd, 4.1), f = t * (st.length - 1), j = Math.min(st.length - 2, Math.floor(f)), g = f - j, cu = st[j][0] + (st[j + 1][0] - st[j][0]) * g, cy = st[j][1] + (st[j + 1][1] - st[j][1]) * g;
      const sp = w * 0.34 * (1 - 0.6 * t), uu = cu + (hash(sd * 2.2, i * 1.9) - 0.5) * 2 * sp, yy = cy + (hash(i, sd * 3.7) - 0.5) * 26, r = (6.5 + 6 * hash(i, sd + 3)) * (1 - 0.3 * t), a = (hash(i + sd, 8.8) - 0.5) * 1.5, out = 3.5 + 5.5 * hash(i, sd);
      const dx = Math.sin(a) * r, dy = -Math.cos(a) * r, px = Math.cos(a) * r * 0.62, py = Math.sin(a) * r * 0.62, gr = 0.19 + 0.16 * hash(sd, i * 2.7), q = { tint: [gr * 0.55, gr, gr * 0.42], vary: 0.25, k: 0.8 + 0.45 * hash(i + 4, sd) };
      // a kite: stalk end on the wall, the two shoulders a little off it, the tip furthest out and lowest
      G.quad4('white', F.pt(uu, yy, 1.2), F.pt(uu + dx * 0.5 + px, yy + dy * 0.5 + py, 1.2 + out * 0.6), F.pt(uu + dx, yy + dy, 1.2 + out), F.pt(uu + dx * 0.5 - px, yy + dy * 0.5 - py, 1.2 + out * 0.6), [F.nx * 0.55, 0.83, F.nz * 0.55], q);
    }
  },
  /** a washing line along a wall (1697): { u (middle), y (height of the hooks), w (span), sag, n (pieces), off (distance from the wall), seed } */
  washline(G, F, s) {
    const w = s.w ?? 200, sag = s.sag ?? 16, off = s.off ?? 10, n = s.n ?? 5, sd = s.seed ?? 1, seg = 8, yt = (t) => s.y - sag * 4 * t * (1 - t), ut = (t) => s.u - w / 2 + w * t;
    for (const e of [0, 1]) G.tube('metal', F.pt(ut(e), s.y + 1, 0), F.pt(ut(e), s.y + 1, off + 1), 1.3, 1.3, 3, { vary: 0, k: 0.6, keep: true });
    for (let i = 0; i < seg; i++) { const a = i / seg, b = (i + 1) / seg; G.quad4('cloth', F.pt(ut(a), yt(a) - 0.9, off), F.pt(ut(b), yt(b) - 0.9, off), F.pt(ut(b), yt(b) + 0.9, off), F.pt(ut(a), yt(a) + 0.9, off), F.n, { tint: [0.5, 0.44, 0.36], vary: 0 }); }
    const C = [[0.86, 0.84, 0.78], [0.62, 0.66, 0.78], [0.8, 0.74, 0.6], [0.7, 0.5, 0.44], [0.9, 0.88, 0.84]];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5 + (hash(sd, i) - 0.5) * 0.4) / n, pw = (12 + 12 * hash(i, sd + 2)) / w, len = 26 + 26 * hash(sd + i, 3.3), ta = Math.max(0.02, t - pw), tb = Math.min(0.98, t + pw), sw = (hash(i, sd) - 0.5) * 5, c = C[(i + sd) % C.length];
      G.quad4('cloth', F.pt(ut(ta) + sw, yt(ta) - len, off + 1.5), F.pt(ut(tb) + sw, yt(tb) - len * (0.86 + 0.2 * hash(i, 7)), off + 1.5), F.pt(ut(tb), yt(tb) + 1.4, off + 0.6), F.pt(ut(ta), yt(ta) + 1.4, off + 0.6), F.n, { tint: c, vary: 0.14, k: 0.9 + 0.2 * hash(sd, i + 4) });
    }
  },
  /** a harvest garland (1697): a swag of straw and leaves with fruit in it, bows at the hooks: { u, y, w, sag, seed } */
  garland(G, F, s) {
    const w = s.w ?? 160, sag = s.sag ?? 26, sd = s.seed ?? 1, n = 8, w0 = 4.5, yt = (t) => s.y - sag * 4 * t * (1 - t), ut = (t) => s.u - w / 2 + w * t;
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n, th = 5 + 2.5 * Math.sin(i * 2.3 + sd), g = i % 2;
      G.quad4('straw', F.pt(ut(a), yt(a) - th, w0 + 1.5), F.pt(ut(b), yt(b) - th, w0 + 1.5), F.pt(ut(b), yt(b) + th * 0.7, w0), F.pt(ut(a), yt(a) + th * 0.7, w0), [F.nx * 0.9, 0.44, F.nz * 0.9], { tint: g ? [0.5, 0.62, 0.3] : [1.0, 0.86, 0.5], vary: 0.2, k: 0.95 });
      if (i % 2 === 1) { const cu = ut(a), cy = yt(a) - 2, r = 4.2, c = hash(sd, i) > 0.5 ? [1.0, 0.42, 0.12] : [0.78, 0.14, 0.1]; G.poly('white', [F.pt(cu, cy - r, w0 + 2.6), F.pt(cu + r, cy, w0 + 2.6), F.pt(cu, cy + r, w0 + 2.6), F.pt(cu - r, cy, w0 + 2.6)], F.n, { tint: c, vary: 0, k: 1.05 }); }
    }
    for (const e of [0, 1]) { const ue = ut(e), q = { tint: [0.9, 0.84, 0.62], vary: 0.1 }; G.tri('cloth', F.pt(ue, s.y, w0 + 1), F.pt(ue - 9, s.y - 22, w0 + 2), F.pt(ue - 2, s.y - 24, w0 + 2), F.n, q); G.tri('cloth', F.pt(ue, s.y, w0 + 1), F.pt(ue + 2, s.y - 26, w0 + 2), F.pt(ue + 9, s.y - 20, w0 + 2), F.n, q); G.tube('metal', F.pt(ue, s.y + 2, 0), F.pt(ue, s.y + 2, w0 + 1), 1.3, 1.3, 3, { vary: 0, k: 0.6, keep: true }); }
  },
});

/** a round thing on the floor (jug, basket, bowl): a lathe with a lid or an open dark mouth */
const pot = (G, x, y, z, prof, mat, tint, sides = 7, mouth = null) => { G.lathe(mat, x, z, prof.map(([r, h]) => [r, y + h]), sides, { tint, vary: 0.15, cap: mouth ? 'white' : mat, capTint: mouth ?? tint, capK: mouth ? 1 : 0.9 }); };
/** a pole leaning from the floor at (x, z) against something at (x + dx, top, z + dz) */
const pole = (G, x, y, z, dx, top, dz, r, mat = 'timber', tint = [0.8, 0.68, 0.54]) => G.tube(mat, [x, y, z], [x + dx, y + top, z + dz], r, r * 0.9, 4, { tint, vary: 0.15, keep: true });

Object.assign(PROPS, {
  /**
   * the things of a place someone keeps (a rest spot): a folded blanket, a three-legged stool, a basket of loaves under a cloth, a jug and a bowl.
   * o = { w (how wide the group lies, default 150), old (tonight: grey and dusty, the stool fallen), bread: false (no basket) }. x, z = the middle of the group; it
   * lies along +x. Nothing is taller than 26.
   */
  keptplace(G, x, y, z, o = {}) {
    const old = !!o.old, w = o.w ?? 150, k = old ? 0.72 : 1, sd = Math.round(x + z);
    // a blanket folded twice (cloth, a stripe along its edge)
    const bx = x - w * 0.36, T = old ? [0.42, 0.4, 0.42] : [0.52, 0.2, 0.18];
    G.box('cloth', bx - 21, y, z - 11, bx + 21, y + 6, z + 11, { faces: 'FLRT', tint: T, vary: 0.2, k }); G.box('cloth', bx - 19, y + 6, z - 10, bx + 16, y + 10.5, z + 9, { faces: 'FLRT', tint: [T[0] * 1.12, T[1] * 1.12, T[2] * 1.12], vary: 0.2, k });
    G.quad('cloth', [bx - 19, y + 6.6, z - 10.2], [35, 0, 0], [0, 2.4, 0], [0, 0, -1], { tint: [0.9, 0.82, 0.6], vary: 0, k });
    // a stool
    const sx = x - w * 0.06, sz = z + 3;
    if (old) { G.lathe('timber', sx, sz, [[9.5, y + 2], [9.5, y + 5]], 7, { tint: [0.6, 0.52, 0.46], vary: 0.2, cap: 'timber', sq: 0.9 }); pole(G, sx + 6, y, sz - 6, 16, 3, -4, 1.4); }
    else { for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; pole(G, sx + Math.cos(a) * 8, y, sz + Math.sin(a) * 6, -Math.cos(a) * 3, 15, -Math.sin(a) * 2.5, 1.5); } G.lathe('timber', sx, sz, [[10, y + 15], [10.5, y + 18.5]], 8, { tint: [0.9, 0.76, 0.6], vary: 0.2, cap: 'timber', sq: 0.9 }); }
    // a basket with loaves under a cloth (Lotte's bread)
    if (o.bread !== false) {
      const kx = x + w * 0.2, kz = z - 2;
      pot(G, kx, y, kz, [[9, 0], [13.5, 5], [14.5, 12], [13.5, 13.5]], 'straw', old ? [0.62, 0.56, 0.44] : [1.0, 0.86, 0.56], 8, [0.16, 0.12, 0.08]);
      for (const [dx, dz, r] of [[-4, -1, 6.4], [5, 1.5, 5.6], [0.5, 4.5, 5]]) G.lathe('white', kx + dx, kz + dz, [[r, y + 12], [r * 0.82, y + 16], [0, y + 18.4]], 6, { tint: old ? [0.5, 0.42, 0.3] : [0.86, 0.6, 0.3], vary: 0.2, sq: 0.8, k });
      G.quad4('cloth', [kx - 15.5, y + 11, kz - 9], [kx + 2, y + 9.5, kz - 13.5], [kx + 4, y + 15.5, kz - 6], [kx - 13, y + 15, kz - 2], [0, 0.6, -0.8], { tint: [0.9, 0.88, 0.8], vary: 0.12, k });
    }
    // a jug and a bowl
    const jx = x + w * 0.4, jz = z + 4;
    pot(G, jx, y, jz, [[5, 0], [8.5, 6], [8, 14], [4.2, 20], [5.2, 25]], 'white', old ? [0.36, 0.32, 0.3] : [0.56, 0.34, 0.24], 7, [0.07, 0.06, 0.06]);
    G.tube('white', [jx + 5, y + 20, jz - 1], [jx + 10, y + 13, jz - 1], 1.4, 1.4, 3, { tint: [0.5, 0.3, 0.22], vary: 0, keep: true });
    pot(G, jx - 19, y, jz - 8, [[4, 0], [8.5, 4.5], [9, 6]], 'timber', [0.8, 0.66, 0.5], 7, [0.18, 0.14, 0.1]);
    shadow(G, x, y, z + 2, w * 0.56, 16, 0.42);
  },
  /**
   * the gravekeeper's tools leaning against a wall: a spade, a rake and a pick, a wooden bucket, a coil of rope. x, z = the foot of the group; `lean` = [dx, dz]
   * the way to the wall the handles rest on (unit vector, default [0, 1] = a wall behind it). o.old (tonight) = rust, the spade fallen, no rope.
   */
  tools(G, x, y, z, o = {}) {
    const [lx, lz] = o.lean ?? [0, 1], ax = Math.abs(lz), az = Math.abs(lx), old = !!o.old, Tn = old ? [0.56, 0.5, 0.46] : [0.86, 0.72, 0.56], iron = { vary: 0.1, k: old ? 0.62 : 0.85, tint: old ? [0.9, 0.62, 0.5] : [0.8, 0.82, 0.92], keep: true };
    const at = (s, t) => [x + ax * s + lx * t, z + az * s + lz * t];   // s along the wall, t toward it
    // spade
    if (old) { const [px, pz] = at(-30, -14), [qx, qz] = at(22, -4); G.tube('timber', [px, y + 2, pz], [qx, y + 3, qz], 1.7, 1.5, 4, { tint: Tn, vary: 0.15, keep: true }); G.quad4('metal', [qx - ax * 2, y + 0.8, qz - 7], [qx + ax * 13 + lx * 2, y + 0.8, qz - 5], [qx + ax * 13 + lx * 2, y + 1.6, qz + 6], [qx - ax * 2, y + 1.6, qz + 7], [0, 1, 0], iron); }
    else { const [px, pz] = at(-22, -15), [qx, qz] = at(-18, -1); pole(G, px, y + 13, pz, qx - px, 62, qz - pz, 1.7, 'timber', Tn); G.quad4('metal', [px - ax * 6 - az * 6, y, pz], [px + ax * 6 + az * 6, y, pz], [px + ax * 6.5 + az * 6.5 + (qx - px) * 0.2, y + 15, pz + (qz - pz) * 0.2], [px - ax * 6.5 - az * 6.5 + (qx - px) * 0.2, y + 15, pz + (qz - pz) * 0.2], [-lx * 0.9, 0.3, -lz * 0.9], iron); }
    // rake: teeth up
    { const [px, pz] = at(2, -17), [qx, qz] = at(5, -1), top = old ? 64 : 80; pole(G, px, y, pz, qx - px, top, qz - pz, 1.6, 'timber', Tn);
      G.box('timber', qx - ax * 11 - 1.4, y + top - 2, qz - az * 11 - 1.4, qx + ax * 11 + 1.4, y + top + 2, qz + az * 11 + 1.4, { faces: 'FLRT', tint: Tn, vary: 0.1 });
      for (let i = -2; i <= 2; i++) G.tube('metal', [qx + ax * i * 4.6 - lx * 1.5, y + top + 1, qz + az * i * 4.6 - lz * 1.5], [qx + ax * i * 4.6 - lx * 7, y + top - 4, qz + az * i * 4.6 - lz * 7], 0.9, 0.5, 3, iron); }
    // pick
    { const [px, pz] = at(26, -13), [qx, qz] = at(24, -1), top = 58; pole(G, px, y, pz, qx - px, top, qz - pz, 1.8, 'timber', Tn); G.tube('metal', [qx - ax * 13, y + top - 4, qz - az * 13], [qx + ax * 13, y + top - 4, qz + az * 13], 1.2, 2.2, 4, iron); G.tube('metal', [qx - ax * 13, y + top - 4, qz - az * 13], [qx - ax * 17, y + top - 10, qz - az * 17], 1.2, 0.3, 3, iron); }
    // bucket and rope
    { const [bx, bz] = at(48, -9); pot(G, bx, y, bz, [[8, 0], [10.5, 17], [11, 18.5]], 'timber', old ? [0.5, 0.44, 0.4] : [0.84, 0.7, 0.54], 8, [0.1, 0.09, 0.09]); G.lathe('metal', bx, bz, [[10.2, y + 12], [10.5, y + 14]], 8, { vary: 0, k: 0.7 });
      if (!old) { const [rx, rz] = at(-46, -9); for (let i = 0; i < 3; i++) G.lathe('straw', rx, rz, [[11 - i * 1.2, y + i * 3.2], [12 - i * 1.2, y + i * 3.2 + 1.6], [11 - i * 1.2, y + i * 3.2 + 3.2]], 8, { tint: [0.86, 0.74, 0.52], vary: 0.15, sq: 0.8 }); } }
    shadow(G, x, y, z - 6, 62, 18, 0.4);
  },
  /** split logs stacked against a wall: { w (length along x), h, d (depth), rows }. x, z = the middle of its front foot. Cut ends show at the front */
  woodpile(G, x, y, z, o = {}) {
    const w = o.w ?? 90, h = o.h ?? 40, d = o.d ?? 16, rows = o.rows ?? 3, rh = h / rows, sd = Math.round(x * 0.7 + z), nx = o.side ? 1 : 0;   // side: true = the pile runs along z (against a side wall), its cut ends face -x or +x
    for (let r = 0; r < rows; r++) {
      const n = Math.max(3, Math.round(w / 15)) - (r % 2), y0 = y + r * rh;
      for (let i = 0; i < n; i++) {
        const c = -w / 2 + w * (i + 0.5 + (r % 2) * 0.5) / (n + (r % 2)), rr = rh * (0.42 + 0.1 * hash(i + sd, r)), tint = [0.62 + 0.3 * hash(i, r + sd), 0.5 + 0.22 * hash(sd, i * 3 + r), 0.38 + 0.14 * hash(r, i)];
        const cx = nx ? x : x + c, cz = nx ? z + c : z, e = o.face ?? -1;   // e: which way the cut ends look along the pile's depth
        if (nx) { const pts = []; for (let k = 0; k < 6; k++) pts.push([cx + e * 0.01, y0 + rh / 2 + Math.sin(k * 1.047) * rr, cz + Math.cos(k * 1.047) * rr * 1.05]); G.poly('timber', pts, [e, 0, 0], { tint, vary: 0.2, k: 1.15, rot: true }); G.quad4('timber', [cx, y0 + rh / 2 + rr * 0.8, cz - rr], [cx, y0 + rh / 2 + rr * 0.8, cz + rr], [cx - e * d, y0 + rh / 2 + rr * 0.8, cz + rr], [cx - e * d, y0 + rh / 2 + rr * 0.8, cz - rr], [0, 1, 0], { tint: [tint[0] * 0.6, tint[1] * 0.6, tint[2] * 0.6], vary: 0.2 }); }
        else { const pts = []; for (let k = 0; k < 6; k++) pts.push([cx + Math.cos(k * 1.047) * rr * 1.05, y0 + rh / 2 + Math.sin(k * 1.047) * rr, cz]); G.poly('timber', pts, [0, 0, -1], { tint, vary: 0.2, k: 1.15, rot: true }); if (r === rows - 1) G.quad4('timber', [cx - rr, y0 + rh / 2 + rr * 0.8, cz], [cx + rr, y0 + rh / 2 + rr * 0.8, cz], [cx + rr, y0 + rh / 2 + rr * 0.8, cz + d], [cx - rr, y0 + rh / 2 + rr * 0.8, cz + d], [0, 1, 0], { tint: [tint[0] * 0.6, tint[1] * 0.6, tint[2] * 0.6], vary: 0.2 }); }
      }
    }
    shadow(G, x, y, z, (nx ? d : w) * 0.6, (nx ? w : d) * 0.5, 0.45);
  },
  /** what a fire left of a roof: charred rafter pairs over a wall of width w and depth d (x, z = the middle of its front top), a ridge pole fallen at one end */
  rafters(G, x, y, z, o = {}) {
    const w = o.w ?? 240, d = o.d ?? 70, rh = o.rh ?? 34, n = o.n ?? 4, q = { tint: [0.3, 0.27, 0.27], vary: 0.2, keep: true };
    for (let i = 0; i < n; i++) {
      const cx = x - w / 2 + w * (i + 0.5) / n + (hash(i, x) - 0.5) * 14, gone = hash(x + i * 3.3, 7) < 0.3;
      G.tube('timber', [cx, y, z + 2], [cx + 3, y + rh, z + d / 2], 3, 2.4, 4, q);
      if (!gone) G.tube('timber', [cx + 3, y + rh, z + d / 2], [cx, y, z + d - 2], 2.4, 3, 4, q);
    }
    G.tube('timber', [x - w * 0.46, y + rh, z + d / 2], [x + w * 0.1, y + rh - 2, z + d / 2], 2.6, 2.6, 4, q);
    G.tube('timber', [x + w * 0.1, y + rh - 2, z + d / 2], [x + w * 0.44, y + 4, z + d * 0.3], 2.6, 2.2, 4, q);
  },
});
