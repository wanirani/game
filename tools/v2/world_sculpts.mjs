// WORLD lane: sculpted stand-in props, defined as signed distance fields (docs/v2/ENV_KIT.md 11).
// Used by tools/v2/world_props_bake.mjs. A generated GLB of the same name replaces a sculpt (bake --glb).
// Axes: x right, y up, z into the screen. The front of a prop looks at -z (towards the camera). Units = world px (a person is 104 tall).
const len = (x, y, z) => Math.hypot(x, y, z), cl = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smin = (a, b, k) => { const h = cl(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h); };
export const smax = (a, b, k) => -smin(-a, -b, k);
const sph = (x, y, z, c, r) => len(x - c[0], y - c[1], z - c[2]) - r;
const ell = (x, y, z, c, r) => { const px = (x - c[0]) / r[0], py = (y - c[1]) / r[1], pz = (z - c[2]) / r[2], k = len(px, py, pz); return (k - 1) * Math.min(r[0], r[1], r[2]) * (k < 1 ? 1 : 0.8 + 0.2 / k); };
const box = (x, y, z, c, h, rd = 1.5) => { const qx = Math.abs(x - c[0]) - h[0] + rd, qy = Math.abs(y - c[1]) - h[1] + rd, qz = Math.abs(z - c[2]) - h[2] + rd; return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rd; };
/** capsule from a (radius ra) to b (radius rb) */
const cap = (x, y, z, a, b, ra, rb = ra) => { const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], px = x - a[0], py = y - a[1], pz = z - a[2], t = cl((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1); return len(px - bx * t, py - by * t, pz - bz * t) - (ra + (rb - ra) * t); };
/** rotate a point about the z axis then the y axis around centre c (degrees) -> local coordinates */
const rot = (x, y, z, c, az, ay) => { let px = x - c[0], py = y - c[1], pz = z - c[2]; const a = az * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a); [px, py] = [px * ca + py * sa, -px * sa + py * ca]; const b = ay * Math.PI / 180, cb = Math.cos(b), sb = Math.sin(b); [px, pz] = [px * cb + pz * sb, -px * sb + pz * cb]; return [px, py, pz]; };
const U = (k, ...d) => d.reduce((a, b) => smin(a, b, k));

/** weeping angel on a pedestal, 210 tall */
function angel(x, y, z) {
  const ax = Math.abs(x);
  const ped = Math.min(box(x, y, z, [0, 9, 0], [31, 9, 25], 2), box(x, y, z, [0, 28, 0], [25, 12, 20], 2), box(x, y, z, [0, 43, 0], [28, 4, 23], 1.5));
  const ang = Math.atan2(z, x), fold = 1.7 * Math.sin(ang * 10 + y * 0.03) * cl((112 - y) / 50, 0, 1);
  const robe = cap(x, y, z, [0, 56, 1], [0, 118, 1], 22, 13.5) - fold;
  const hem = ell(x, y, z, [0, 52, 0], [25, 7, 21]);
  const chest = ell(x, y, z, [0, 127, 0], [20, 13, 11.5]);
  const neck = cap(x, y, z, [0, 136, -2], [0, 146, -7], 5.5, 5);
  const head = sph(x, y, z, [0, 151, -10], 10.5), hair = ell(x, y, z, [0, 152, -5], [12, 12.5, 12]);
  const tress = cap(ax, y, z, [9, 150, -3], [12, 128, -2], 5, 3);
  const upper = cap(ax, y, z, [19, 131, 0], [15, 116, -13], 6.2, 5.2), fore = cap(ax, y, z, [15, 116, -13], [5, 143, -19], 5, 4.2), hand = ell(ax, y, z, [4.5, 147, -20], [5.5, 6.5, 4]);
  const sleeve = cap(ax, y, z, [15, 114, -13], [14, 96, -9], 6.5, 3);
  // wings: tall folded blades behind the shoulders, with feather rows
  const w1 = rot(ax, y, z, [25, 126, 15], -9, 22), w2 = rot(ax, y, z, [31, 156, 15], -30, 22);
  const rows = 0.9 * Math.sin(y * 0.27 + ax * 0.1);
  const wing = smin(ell(w1[0], w1[1], w1[2], [0, 0, 0], [14, 62, 6.5]), ell(w2[0], w2[1], w2[2], [0, 0, 0], [12, 30, 6.5]), 6) - rows * cl((ax - 10) / 12, 0, 1);
  const body = U(5, robe, hem, chest, neck, U(3, head, hair, tress), U(3.5, upper, fore, hand, sleeve));
  return Math.min(ped, smin(body, wing, 3));
}

/** crouching gargoyle on a plinth, 150 tall */
function gargoyle(x, y, z) {
  const ax = Math.abs(x);
  const ped = Math.min(box(x, y, z, [0, 24, 2], [27, 24, 23], 2), box(x, y, z, [0, 51, 2], [31, 3.5, 26], 1.5));
  const hip = ell(x, y, z, [0, 80, 9], [21, 22, 19]), chest = ell(x, y, z, [0, 99, -5], [17, 17, 14]);
  const neck = cap(x, y, z, [0, 108, -9], [0, 117, -15], 9, 8);
  const head = ell(x, y, z, [0, 122, -18], [12, 11, 12.5]), snout = cap(x, y, z, [0, 119, -25], [0, 113, -37], 6.5, 4), jaw = cap(x, y, z, [0, 112, -22], [0, 107, -33], 5, 3);
  const brow = cap(ax, y, z, [3, 127, -27], [10, 129, -23], 3.2, 2.6);
  const horn = cap(ax, y, z, [7, 130, -14], [16, 149, -5], 4, 1.6), ear = cap(ax, y, z, [11, 124, -13], [22, 131, -8], 3.6, 1.6);
  const arm = cap(ax, y, z, [16, 102, -8], [15, 78, -20], 6.5, 5.5), forearm = cap(ax, y, z, [15, 78, -20], [14, 59, -21], 5.5, 4.6), claw = ell(ax, y, z, [14, 57, -23], [7, 5, 7]);
  const thigh = ell(ax, y, z, [21, 72, 3], [10, 17, 15]), foot = cap(ax, y, z, [21, 58, -4], [21, 57, -21], 6, 4.5);
  const tail = Math.min(cap(x, y, z, [0, 66, 26], [-22, 60, 22], 5, 3.5), cap(x, y, z, [-22, 60, 22], [-33, 58, 6], 3.5, 2.2));
  // wings: a thin plate with three finger ridges and a scalloped lower edge
  const w = rot(ax, y, z, [36, 113, 16], -20, 33);
  let plate = ell(w[0], w[1], w[2], [0, 0, 0], [24, 33, 3.6]);
  plate = smax(plate, -sph(w[0], w[1], w[2], [-8, -34, 0], 13), 2); plate = smax(plate, -sph(w[0], w[1], w[2], [13, -30, 0], 12), 2);
  const sh = [15, 112, 9], fingers = Math.min(cap(ax, y, z, sh, [50, 146, 26], 4, 2), cap(ax, y, z, sh, [62, 118, 32], 3.6, 1.8), cap(ax, y, z, sh, [50, 86, 26], 3.4, 1.8));
  const body = U(5, hip, chest, neck, U(3, head, snout, jaw, brow), U(4, arm, forearm, claw), U(4, thigh, foot), tail);
  return Math.min(ped, smin(smin(body, Math.min(horn, ear), 2), smin(plate, fingers, 3), 3));
}

/** dead gnarled tree, 300 tall */
function deadtree(x, y, z) {
  const ang = Math.atan2(z, x), bark = 1.6 * Math.sin(ang * 7 + y * 0.045) * cl(y / 40, 0.3, 1) * cl((200 - y) / 60, 0, 1);
  const trunk = U(8, cap(x, y, z, [0, -4, 0], [5, 70, 2], 25, 17), cap(x, y, z, [5, 70, 2], [-2, 132, 0], 17, 13), cap(x, y, z, [-2, 132, 0], [-8, 188, 3], 13, 9)) - bark;
  const roots = Math.min(cap(x, y, z, [8, 18, -4], [44, -2, -16], 9, 4), cap(x, y, z, [-8, 18, -2], [-46, -2, -10], 9, 4), cap(x, y, z, [0, 16, 6], [10, -2, 34], 8, 4), cap(x, y, z, [-4, 14, -6], [-12, -2, -34], 8, 4), cap(x, y, z, [10, 14, 4], [40, -2, 22], 7, 3.5));
  const brR = U(5, cap(x, y, z, [2, 112, 0], [48, 168, -6], 10, 7), cap(x, y, z, [48, 168, -6], [84, 196, -2], 7, 5), cap(x, y, z, [84, 196, -2], [104, 246, 4], 5, 3.4), cap(x, y, z, [60, 178, -5], [86, 168, -12], 5, 3.4));
  const brL = U(5, cap(x, y, z, [-4, 146, 0], [-46, 196, 6], 9, 6.5), cap(x, y, z, [-46, 196, 6], [-66, 250, 2], 6.5, 4.4), cap(x, y, z, [-66, 250, 2], [-98, 276, -4], 4.4, 3.4), cap(x, y, z, [-52, 212, 5], [-88, 214, 12], 5, 3.4));
  const top = U(5, cap(x, y, z, [-8, 188, 3], [8, 246, -4], 9, 6), cap(x, y, z, [8, 246, -4], [30, 296, 2], 6, 3.4), cap(x, y, z, [4, 232, -3], [-22, 284, -8], 5, 3.4));
  const stub = Math.min(cap(x, y, z, [-12, 96, -4], [-34, 112, -12], 6.5, 4.5), cap(x, y, z, [14, 60, -8], [28, 70, -20], 6, 4.5));
  let d = U(7, trunk, roots, brR, brL, top, stub);
  d = smax(d, -sph(x, y, z, [5, 84, -19], 8.5), 3);   // hollow knot
  return d;
}

/**
 * name -> { f(x,y,z) distance, box [x0,y0,z0,x1,y1,z1] sample bounds, cell grid size, tris target, tex [w,h] atlas cell,
 *           look: 'stone' | 'bark', h height, foot [rx, rz] collision half extents, footH }
 */
export const SCULPTS = {
  angel: { f: angel, box: [-62, 0, -34, 62, 216, 44], cell: 3.0, tris: 1400, tex: [224, 400], look: 'stone', h: 192, foot: [29, 23], footH: 150 },
  gargoyle: { f: gargoyle, box: [-82, 0, -46, 82, 176, 50], cell: 2.8, tris: 1500, tex: [320, 352], look: 'stone', h: 152, foot: [29, 24], footH: 110 },
  deadtree: { f: deadtree, box: [-112, 0, -42, 116, 304, 42], cell: 3.4, tris: 1300, tex: [288, 384], look: 'bark', h: 300, foot: [20, 14], footH: 200 },
};
