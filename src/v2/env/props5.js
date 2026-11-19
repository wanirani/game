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
  /** the gravekeeper's tools hung on a wall: a peg rail with a spade, a rake and a coil of rope: { u, y (foot of the tools), old (tonight: rust, the rope gone, the rake fallen askew) } */
  tools(G, F, s) {
    const u = s.u, y = s.y, old = !!s.old, Tn = old ? [0.56, 0.5, 0.46] : [0.9, 0.76, 0.58], iron = { vary: 0.1, k: old ? 0.6 : 0.85, tint: old ? [0.9, 0.62, 0.5] : [0.8, 0.82, 0.92] }, wd = { tint: Tn, vary: 0.2 };
    F.box(G, 'timber', u - 44, u + 44, y + 64, y + 69, 0, 2.6, { faces: 'FLRT', ...wd });
    F.box(G, 'timber', u - 27, u - 23.4, y + 16, y + 74, 2.6, 5.4, { faces: 'FLR', ...wd });                                                                    // spade
    G.quad4('metal', F.pt(u - 32, y, 4.6), F.pt(u - 18.4, y, 4.6), F.pt(u - 17.4, y + 17, 4.6), F.pt(u - 33, y + 17, 4.6), F.n, iron);
    const lean = old ? 9 : 0;                                                                                                                                  // rake: head up
    G.quad4('timber', F.pt(u + 1 + lean, y + 2, 3.6), F.pt(u + 4.4 + lean, y + 2, 3.6), F.pt(u + 4.4, y + 84, 3.6), F.pt(u + 1, y + 84, 3.6), F.n, wd);
    F.box(G, 'timber', u - 9, u + 14.4, y + 84, y + 88, 2.6, 5.6, { faces: 'FLRT', ...wd }); for (let i = 0; i < 5; i++) F.box(G, 'metal', u - 7.6 + i * 5, u - 6 + i * 5, y + 77, y + 84, 3.2, 4.6, { faces: 'F', ...iron });
    if (!old) { const cu = u + 30, cy = y + 50, r0 = 11, r1 = 6.5; for (let i = 0; i < 6; i++) { const a = i * 1.0472, b = a + 1.0472; G.quad4('straw', F.pt(cu + Math.cos(a) * r1, cy + Math.sin(a) * r1, 3.2), F.pt(cu + Math.cos(a) * r0, cy + Math.sin(a) * r0, 3.2), F.pt(cu + Math.cos(b) * r0, cy + Math.sin(b) * r0, 3.2), F.pt(cu + Math.cos(b) * r1, cy + Math.sin(b) * r1, 3.2), F.n, { tint: [0.9, 0.78, 0.54], vary: 0.2, k: 0.9 + 0.2 * (i % 2) }); } }
    else F.box(G, 'metal', u + 27, u + 33, y + 58, y + 64, 0, 4, { faces: 'FLR', ...iron });
  },
  /**
   * STORY2: a crow's flight feather left on a ledge (the inn's window sill - the chapter's last picture, ENV_KIT 24.4): { u (the middle of its length), y (the
   * ledge's top), w (how far out of the wall face its quill end lies - it may reach over the ledge's front edge), len (26), back (how much nearer the wall
   * its tip lies), tilt (degrees its vane leans back from the ledge: flat it is a line three pixels high to a camera eight degrees above the ledge),
   * lift (0.4 clear of the ledge: nothing of it lies in the ledge's plane) }. Quill end at -u, tip at +u. The wide vane rests on the ledge, the shaft bows up.
   * The kit's white with a colour per vertex (blue-black vanes with a sheen at their edges, a pale quill, a split in each vane) in the baked light of its
   * spot: 36 triangles, no collision. The colours are set for a warm spot (light about 1.9, 1.3, 1.1 at the inn's sill): the vane's blue leans against it.
   */
  feather(G, F, s) {
    const L = s.len ?? 26, k = L / 26, a = (s.tilt ?? 50) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), w0 = s.w ?? 5, back = s.back ?? 6, lift = s.lift ?? 0.4, n = F.vec(0, ca, sa);
    // stations from the quill end to the tip: [t, the shaft's height up the leaning plane, wide (lower) vane, narrow (upper) vane, half the quill's width]
    const S = [[0, 0.5, 0, 0, 0.5], [0.17, 1.75, 0, 0, 0.46], [0.32, 2.95, 2.1, 1.0, 0.4], [0.5, 3.75, 3.3, 1.5, 0.34], [0.68, 3.95, 3.6, 1.6, 0.27], [0.85, 3.45, 2.8, 1.3, 0.2], [1, 2.3, 0, 0, 0.03]];
    const NOTCH = { 3: [1, 0.42], 4: [-1, 0.52] };   // a split between the barbs: segment -> [the vane (1 narrow, -1 wide), where along the segment]
    const at = (t, v) => F.pt(s.u + (t - 0.5) * L, s.y + lift + v * k * sa, w0 - back * t - v * k * ca);
    const mix = (A, B, f) => [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
    const CORE = [0.025, 0.041, 0.088], LO = [0.058, 0.112, 0.248], HI = [0.089, 0.142, 0.292], Q = (t) => mix([0.484, 0.612, 0.549], [0.22, 0.284, 0.336], t);
    const fan = (P, C) => { for (let i = 1; i + 1 < P.length; i++) G.tri('white', P[0], P[i], P[i + 1], n, { vary: 0, mul: [C[0], C[i], C[i + 1]] }); };
    for (let i = 0; i + 1 < S.length; i++) {
      const A = S[i], B = S[i + 1], st = (f) => A.map((v, j) => v + (B[j] - v) * f);                                                      // the station at f along this piece
      const qe = (e, f) => { const [t, r, , , q] = st(f); return at(t, r + e * q); };                                                    // the quill's edge (e -1 below the shaft, 1 above)
      const ve = (e, f) => { const [t, r, l, u, q] = st(f); return at(t, r + e * (q + (e < 0 ? l : u))); };                               // the vane's edge
      fan([qe(-1, 0), qe(-1, 1), qe(1, 1), qe(1, 0)], [Q(A[0]), Q(B[0]), Q(B[0]), Q(A[0])]);
      for (const e of [-1, 1]) {
        const j = e < 0 ? 2 : 3, EDGE = e < 0 ? LO : HI, has0 = A[j] > 0, has1 = B[j] > 0, N = NOTCH[i];
        if (!has0 && !has1) continue;
        if (N && N[0] === e) {   // two five-cornered pieces with a slit between them, slanting back towards the quill end as the barbs lie
          const f = N[1], fa = f - 0.14, sA = st(fa), apex = at(sA[0], sA[1] + e * (sA[4] + sA[j] * 0.28)), cA = mix(CORE, EDGE, 0.28);
          fan([qe(e, 0), qe(e, fa), apex, ve(e, f - 0.06), ve(e, 0)], [CORE, CORE, cA, EDGE, EDGE]);
          fan([qe(e, fa), qe(e, 1), ve(e, 1), ve(e, f + 0.06), apex], [CORE, CORE, EDGE, EDGE, cA]);
        } else fan([qe(e, 0), qe(e, 1), ...(has1 ? [ve(e, 1)] : []), ...(has0 ? [ve(e, 0)] : [])], [CORE, CORE, ...(has1 ? [EDGE] : []), ...(has0 ? [EDGE] : [])]);
      }
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
   * the things of a place someone keeps (a rest spot), set against the front of a low wall: on the floor a folded blanket and a kneeling board, both flat and
   * within 9 of the wall (inside the wall's own collision skin: the hero's body never reaches them); on the wall top (o.shelf = its height above the floor,
   * o.back = how far behind the group's line the top lies) a basket of loaves under a cloth, a jug and a bowl, and a cloth hanging over the coping.
   * x, z = the middle of the group on the floor, right in front of the wall; it lies along x. o = { w (default 150), old (tonight: grey, dusty), bread: false }.
   */
  keptplace(G, x, y, z, o = {}) {
    const old = !!o.old, w = o.w ?? 150, k = old ? 0.74 : 1, ys = y + (o.shelf ?? 62), zs = z + (o.back ?? 12), T = old ? [0.42, 0.4, 0.42] : [0.52, 0.2, 0.18];
    // floor: a blanket folded twice (a stripe along its edge), a kneeling board on two blocks
    const bx = x - w * 0.3;   // (with w 208 at x 322 the blanket and the board lie in the two bays between the piers of the ossuary's rail wall)
    G.box('cloth', bx - 22, y, z - 4.5, bx + 22, y + 6, z + 4.5, { faces: 'FLRT', tint: T, vary: 0.2, k }); G.box('cloth', bx - 20, y + 6, z - 4, bx + 17, y + 10.5, z + 4.5, { faces: 'FLRT', tint: [T[0] * 1.12, T[1] * 1.12, T[2] * 1.12], vary: 0.2, k });
    G.quad('cloth', [bx - 20, y + 6.6, z - 4.2], [37, 0, 0], [0, 2.4, 0], [0, 0, -1], { tint: [0.9, 0.82, 0.6], vary: 0, k });
    const kx = x + w * 0.22;
    G.box('timber', kx - 26, y + 5, z - 4.5, kx + 26, y + 8.5, z + 4.5, { faces: 'FLRT', tint: [0.86, 0.72, 0.56], vary: 0.2, k }); for (const e of [-1, 1]) G.box('timber', kx + e * 20 - 3, y, z - 4, kx + e * 20 + 3, y + 5, z + 4, { faces: 'FLR', tint: [0.7, 0.58, 0.46], vary: 0.2, k });
    // on the wall top: a basket with loaves under a cloth (Lotte's bread), a jug and a bowl
    if (o.bread !== false) {
      const cx = x + w * 0.1, cz = zs;
      pot(G, cx, ys, cz, [[7, 0], [10.5, 4], [11.5, 9], [10.5, 10.5]], 'straw', old ? [0.62, 0.56, 0.44] : [1.0, 0.86, 0.56], 8, [0.16, 0.12, 0.08]);
      for (const [dx, dz, r] of [[-3, -1, 5.2], [4, 1, 4.6], [0.5, 3.4, 4.2]]) G.lathe('white', cx + dx, cz + dz, [[r, ys + 9], [r * 0.82, ys + 12.5], [0, ys + 14.6]], 6, { tint: old ? [0.5, 0.42, 0.3] : [0.86, 0.6, 0.3], vary: 0.2, sq: 0.8, k });
      G.quad4('cloth', [cx - 12.5, ys + 8.5, cz - 7], [cx + 1.5, ys + 7.5, cz - 10.5], [cx + 3, ys + 12.4, cz - 4.5], [cx - 10.5, ys + 12, cz - 1.5], [0, 0.6, -0.8], { tint: [0.9, 0.88, 0.8], vary: 0.12, k });
    }
    const jx = x + w * 0.24;
    pot(G, jx, ys, zs, [[4.2, 0], [7, 5], [6.6, 12], [3.4, 17], [4.4, 21]], 'white', old ? [0.36, 0.32, 0.3] : [0.56, 0.34, 0.24], 7, [0.07, 0.06, 0.06]);
    G.tube('white', [jx + 4, ys + 17, zs - 1], [jx + 8.5, ys + 11, zs - 1], 1.2, 1.2, 3, { tint: [0.5, 0.3, 0.22], vary: 0, keep: true });
    pot(G, jx + 20, ys, zs - 1, [[3.4, 0], [7, 3.8], [7.4, 5]], 'timber', [0.8, 0.66, 0.5], 7, [0.18, 0.14, 0.1]);
    // a cloth hanging over the coping, down the wall's face
    const hx = x - w * 0.36, hz = z + 5.5;
    G.quad4('cloth', [hx - 13, ys - 30, hz], [hx + 13, ys - 26, hz], [hx + 13, ys + 0.6, hz], [hx - 13, ys + 0.6, hz], [0, 0, -1], { tint: old ? [0.5, 0.5, 0.52] : [0.84, 0.8, 0.7], vary: 0.15, k });
    G.quad4('cloth', [hx - 13, ys + 0.6, hz], [hx + 13, ys + 0.6, hz], [hx + 13, ys + 0.6, hz + 12], [hx - 13, ys + 0.6, hz + 12], [0, 1, 0], { tint: old ? [0.56, 0.56, 0.58] : [0.9, 0.86, 0.76], vary: 0.15, k });
    shadow(G, x, y, z, w * 0.5, 9, 0.4);
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
