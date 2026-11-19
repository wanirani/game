// v2 whip - the mesh, rebuilt every frame from the nodes into caller-owned arrays (no allocation). docs/v2/WHIP.md section 3
// One vertex = 10 floats: pos xyz | aux xyz | u, v, radius, kind
//   lash   (kind 0..1 = leather..metal): pos = centre line, aux = tangent, u = arc length from the tip (px), v = -1 | +1 across, radius = half width.
//          The vertex shader turns it to the camera and widens it to the minimum on-screen thickness; the fragment shader shades it as a round braid.
//   solid  (kind 2 grip leather, 3 bronze, 4 bell shard): pos = final position, aux = normal, u = along the handle axis, v = around 0..1
//   glow   (kind 6): pos = centre, u v = corner -1..1, radius = half size (billboard, additive)
//   streak (kind 7): the path of the tip over the last ticks (three points a tick); pos = centre line, aux = tangent, u = strength, v = -1 | +1, radius (additive)
import { TRAIL_N, TRAIL_PER } from './sim.js';
export const WHIP_VERT = 10;
const TRAIL_SEC = TRAIL_N;   // one section per remembered point (28, as before: it was 10 points with 3 curve pieces between each)
const SHARD_LEN = 11.5;
const TRAIL_P = new Float32Array(TRAIL_N * 3), TRAIL_T = new Float32Array(TRAIL_N * 3), TRAIL_K = new Float32Array(TRAIL_N);   // the streak's points, unit tangents, fold dimming (scratch of writeWhipMesh - nothing is made per frame)

// handle profile along its axis (px from the grip point; the lash leaves at +11): [s, radius, kind]
const HANDLE = [
  [-10.6, 0.05, 3], [-10.1, 1.9, 3], [-8.8, 2.6, 3], [-7.5, 2.0, 3], [-7.1, 1.55, 3],
  [-7.0, 1.6, 2], [-4.6, 1.9, 2], [-2.0, 1.7, 2], [0.6, 1.9, 2], [3.2, 1.7, 2], [5.4, 1.8, 2],
  [5.5, 2.1, 3], [6.2, 3.3, 3], [7.0, 3.3, 3], [7.7, 2.2, 3], [9.4, 1.9, 3], [11.0, 1.55, 3],
];
// bell shard, local frame (t along the lash end, a, b across): an uneven sliver broken off a bronze bell
const SH_V = [[0, 0, 0], [3.4, 3.3, 0.8], [5.8, 0.9, 1.6], [4.3, -2.4, 0.5], [4.9, 0.3, -1.2], [SHARD_LEN, -1.3, 0.3], [8.3, 2.7, 0.5]];   // 5 = the long point, 6 = the broken shoulder
const SH_F = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [6, 2, 1], [5, 2, 6], [5, 6, 4], [6, 1, 4], [5, 3, 2], [5, 4, 3]];

/** sizes and the static index list for a whip (tier decides). main = lash + handle + shard, then the glow quad */
export function meshInfo(whip) {
  const sections = (whip.n - 1) * whip.sub + 1, sides = whip.sides, rings = HANDLE.length;
  const vLash = sections * 2, vHandle = rings * (sides + 1), vShard = SH_F.length * 3, vGlow = 4;
  const verts = vLash + vHandle + vShard + vGlow + TRAIL_SEC * 2;
  const idx = new Uint16Array((sections - 1) * 6 + (rings - 1) * sides * 6 + vShard + 6 + (TRAIL_SEC - 1) * 6);
  let q = 0;
  for (let r = 0; r < rings - 1; r++) for (let s = 0; s < sides; s++) {   // handle first: the lash and shard cover its end
    const a = vLash + r * (sides + 1) + s, b = a + sides + 1;
    idx[q++] = a; idx[q++] = b; idx[q++] = a + 1; idx[q++] = a + 1; idx[q++] = b; idx[q++] = b + 1;
  }
  for (let i = 0; i < sections - 1; i++) { const a = i * 2; idx[q++] = a; idx[q++] = a + 1; idx[q++] = a + 2; idx[q++] = a + 1; idx[q++] = a + 3; idx[q++] = a + 2; }
  for (let i = 0; i < vShard; i++) idx[q++] = vLash + vHandle + i;
  const nMain = q, g = vLash + vHandle + vShard;
  idx[q++] = g; idx[q++] = g + 1; idx[q++] = g + 2; idx[q++] = g; idx[q++] = g + 2; idx[q++] = g + 3;
  for (let i = 0; i < TRAIL_SEC - 1; i++) { const a = g + 4 + i * 2; idx[q++] = a; idx[q++] = a + 1; idx[q++] = a + 2; idx[q++] = a + 1; idx[q++] = a + 3; idx[q++] = a + 2; }
  return { verts, idx, nMain, nGlow: 6, nTrail: (TRAIL_SEC - 1) * 6, sections, tris: nMain / 3 + 2, trisTrail: (TRAIL_SEC - 1) * 2, floats: verts * WHIP_VERT };
}

/**
 * Fill vtx (Float32Array, meshInfo().floats long) from the whip. alpha = display interpolation between the last two ticks (default 1).
 * tmp = Float32Array(whip.n * 3) scratch owned by the caller. Returns the number of vertices written (always meshInfo().verts).
 */
export function writeWhipMesh(whip, vtx, alpha, tmp) {
  const n = whip.n, sub = whip.sub, sides = whip.sides, a = alpha == null ? 1 : alpha;
  const N = whip.drawn(a, tmp);   // (sim.js drawn(): interpolation between the ticks + the hand end kept in the drawn hand + the swing-over of a side hit)
  let o = 0;
  // total length first (u runs from the tip)
  let total = 0;
  for (let i = 1; i < n; i++) { const p = i * 3; total += Math.sqrt((N[p] - N[p - 3]) * (N[p] - N[p - 3]) + (N[p + 1] - N[p - 2]) * (N[p + 1] - N[p - 2]) + (N[p + 2] - N[p - 1]) * (N[p + 2] - N[p - 1])); }
  const sections = (n - 1) * sub + 1;
  // crack ripple - drawn only (the simulation, the tip, the events and the checks never see it): for a moment after the crack a wave runs
  // down the lash toward the tip, zero at the handle and at the tip. A lash frozen by a hit-stop then reads as a whip mid-crack, not a rod.
  // It follows whip.flash (1 at the crack, fades in about 0.15 s, frozen while dt = 0), so it needs no state of its own.
  const rip = whip.mode === 'swing' ? Math.min(1, whip.flash * 1.3) : 0;
  const ripA = rip > 0.004 ? rip * Math.min(7, total * 0.07) : 0, ripK = 7.85, ripP = (1 - whip.flash) * 7, ripT = Math.max(1, total);
  let run = 0, lx = N[0], ly = N[1], lz = N[2], ttx = 0, tty = 1, ttz = 0;
  for (let j = 0; j < sections; j++) {
    const i = Math.min(n - 2, (j / sub) | 0), u = j / sub - i;
    const p0 = Math.max(0, i - 1) * 3, p1 = i * 3, p2 = (i + 1) * 3, p3 = Math.min(n - 1, i + 2) * 3;
    const u2 = u * u, u3 = u2 * u;
    const c0 = -0.5 * u3 + u2 - 0.5 * u, c1 = 1.5 * u3 - 2.5 * u2 + 1, c2 = -1.5 * u3 + 2 * u2 + 0.5 * u, c3 = 0.5 * u3 - 0.5 * u2;
    const d0 = -1.5 * u2 + 2 * u - 0.5, d1 = 4.5 * u2 - 5 * u, d2 = -4.5 * u2 + 4 * u + 0.5, d3 = 1.5 * u2 - u;
    let x = c0 * N[p0] + c1 * N[p1] + c2 * N[p2] + c3 * N[p3], y = c0 * N[p0 + 1] + c1 * N[p1 + 1] + c2 * N[p2 + 1] + c3 * N[p3 + 1], z = c0 * N[p0 + 2] + c1 * N[p1 + 2] + c2 * N[p2 + 2] + c3 * N[p3 + 2];
    let tx = d0 * N[p0] + d1 * N[p1] + d2 * N[p2] + d3 * N[p3], ty = d0 * N[p0 + 1] + d1 * N[p1 + 1] + d2 * N[p2 + 1] + d3 * N[p3 + 1], tz = d0 * N[p0 + 2] + d1 * N[p1 + 2] + d2 * N[p2 + 2] + d3 * N[p3 + 2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (tl > 1e-5) { tx /= tl; ty /= tl; tz /= tl; ttx = tx; tty = ty; ttz = tz; } else { tx = ttx; ty = tty; tz = ttz; }
    run += Math.sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly) + (z - lz) * (z - lz)); lx = x; ly = y; lz = z;   // arc length (and with it the braid pattern) is measured before the ripple
    const q = j / (sections - 1), fromTip = Math.max(0, total - run);
    if (ripA > 0) {
      const nx = -ty * tx, ny = 1 - ty * ty, nz = -ty * tz;   // world up made square to the lash (not normalised: a lash that points up or down ripples less)
      const env = Math.sin(3.1416 * q), ph = ripK * q - ripP, sn = Math.sin(ph), d = ripA * env * sn;
      const dd = (ripA * (3.1416 * Math.cos(3.1416 * q) * sn + env * ripK * Math.cos(ph))) / ripT;
      x += nx * d; y += ny * d; z += nz * d;
      tx += nx * dd; ty += ny * dd; tz += nz * dd; const l2 = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1; tx /= l2; ty /= l2; tz /= l2;
    }
    const rad = 2.45 - 1.4 * Math.pow(q, 0.85) + 0.3 * Math.sin(Math.min(1, q * 5) * 3.1416);    // belly just past the handle, thin at the tip
    const metal = run < 3.2 ? 1 : fromTip < 4.5 ? 1 : fromTip < 6 ? (6 - fromTip) / 1.5 : run < 4.4 ? (4.4 - run) / 1.2 : 0;
    for (let s = -1; s <= 1; s += 2) {
      vtx[o] = x; vtx[o + 1] = y; vtx[o + 2] = z; vtx[o + 3] = tx; vtx[o + 4] = ty; vtx[o + 5] = tz; vtx[o + 6] = fromTip; vtx[o + 7] = s; vtx[o + 8] = fromTip < 4.5 ? rad * 1.5 : rad; vtx[o + 9] = metal;
      o += WHIP_VERT;
    }
  }
  // handle: a lathe around the handle axis, interpolated like the nodes
  // (WHIP2: in the drawn hand - this tick's grip and direction, moved with the hero's drawn place. It used to be half way between the two ticks' hands while the arm was drawn in this tick's pose)
  const g = whip.grip, r = whip.root, pb = whip.pb, k1 = a - 1;
  let jx = (whip.bx - pb[0]) * k1, jy = (whip.by - pb[1]) * k1, jz = (whip.bz - pb[2]) * k1; if (jx * jx + jy * jy + jz * jz > 3600) { jx = 0; jy = 0; jz = 0; }
  const gx = g.x + jx, gy = g.y + jy, gz = g.z + jz;
  let dx = r.dx, dy = r.dy, dz = r.dz; const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; dx /= dl; dy /= dl; dz /= dl;
  let ax, ay, az;
  if (Math.abs(dy) < 0.9) { ax = dz; ay = 0; az = -dx; } else { ax = 0; ay = -dz; az = dy; }   // cross(d, up) or cross(d, x)
  const al = Math.sqrt(ax * ax + ay * ay + az * az) || 1; ax /= al; ay /= al; az /= al;
  const bx = dy * az - dz * ay, by = dz * ax - dx * az, bz = dx * ay - dy * ax;
  for (let k = 0; k < HANDLE.length; k++) {
    const H = HANDLE[k], s = H[0], rad = H[1], cx = gx + dx * s, cy = gy + dy * s, cz = gz + dz * s;
    for (let i = 0; i <= sides; i++) {
      const an = (i / sides) * 6.2832, cs = Math.cos(an), sn = Math.sin(an), nx = ax * cs + bx * sn, ny = ay * cs + by * sn, nz = az * cs + bz * sn;
      vtx[o] = cx + nx * rad; vtx[o + 1] = cy + ny * rad; vtx[o + 2] = cz + nz * rad; vtx[o + 3] = nx; vtx[o + 4] = ny; vtx[o + 5] = nz; vtx[o + 6] = s; vtx[o + 7] = i / sides; vtx[o + 8] = 0; vtx[o + 9] = H[2];
      o += WHIP_VERT;
    }
  }
  // bell shard on the tip, spinning slowly around the lash end so its facets catch the light
  const e = (n - 1) * 3, e1 = (n - 2) * 3;
  let tx = N[e] - N[e1], ty = N[e + 1] - N[e1 + 1], tz = N[e + 2] - N[e1 + 2]; const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1; tx /= tl; ty /= tl; tz /= tl;
  let px, py, pz;
  if (Math.abs(ty) < 0.9) { px = tz; py = 0; pz = -tx; } else { px = 0; py = -tz; pz = ty; }
  const pl = Math.sqrt(px * px + py * py + pz * pz) || 1; px /= pl; py /= pl; pz /= pl;
  const qx = ty * pz - tz * py, qy = tz * px - tx * pz, qz = tx * py - ty * px;
  const cs = Math.cos(whip.spin), sn = Math.sin(whip.spin);
  const ux = px * cs + qx * sn, uy = py * cs + qy * sn, uz = pz * cs + qz * sn, wx = qx * cs - px * sn, wy = qy * cs - py * sn, wz = qz * cs - pz * sn;
  const ox = N[e], oy = N[e + 1], oz = N[e + 2], S = 1.0;
  for (let f = 0; f < SH_F.length; f++) {
    const F = SH_F[f], A = SH_V[F[0]], B = SH_V[F[1]], C = SH_V[F[2]];
    const x0 = ox + (tx * A[0] + ux * A[1] + wx * A[2]) * S, y0 = oy + (ty * A[0] + uy * A[1] + wy * A[2]) * S, z0 = oz + (tz * A[0] + uz * A[1] + wz * A[2]) * S;
    const x1 = ox + (tx * B[0] + ux * B[1] + wx * B[2]) * S, y1 = oy + (ty * B[0] + uy * B[1] + wy * B[2]) * S, z1 = oz + (tz * B[0] + uz * B[1] + wz * B[2]) * S;
    const x2 = ox + (tx * C[0] + ux * C[1] + wx * C[2]) * S, y2 = oy + (ty * C[0] + uy * C[1] + wy * C[2]) * S, z2 = oz + (tz * C[0] + uz * C[1] + wz * C[2]) * S;
    let nx = (y1 - y0) * (z2 - z0) - (z1 - z0) * (y2 - y0), ny = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0), nz = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    // facing outward: away from the shard axis point
    const mx = (x0 + x1 + x2) / 3 - (ox + tx * 5), my = (y0 + y1 + y2) / 3 - (oy + ty * 5), mz = (z0 + z1 + z2) / 3 - (oz + tz * 5);
    if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    vtx[o] = x0; vtx[o + 1] = y0; vtx[o + 2] = z0; vtx[o + 3] = nx; vtx[o + 4] = ny; vtx[o + 5] = nz; vtx[o + 6] = f; vtx[o + 7] = 0; vtx[o + 8] = 0; vtx[o + 9] = 4; o += WHIP_VERT;
    vtx[o] = x1; vtx[o + 1] = y1; vtx[o + 2] = z1; vtx[o + 3] = nx; vtx[o + 4] = ny; vtx[o + 5] = nz; vtx[o + 6] = f; vtx[o + 7] = 0; vtx[o + 8] = 0; vtx[o + 9] = 4; o += WHIP_VERT;
    vtx[o] = x2; vtx[o + 1] = y2; vtx[o + 2] = z2; vtx[o + 3] = nx; vtx[o + 4] = ny; vtx[o + 5] = nz; vtx[o + 6] = f; vtx[o + 7] = 0; vtx[o + 8] = 0; vtx[o + 9] = 4; o += WHIP_VERT;
  }
  // glow around the shard
  const cx = ox + tx * 5, cy = oy + ty * 5, cz = oz + tz * 5, size = 7 + 11 * Math.min(1.5, whip.glow) + 12 * whip.flash;
  for (let k = 0; k < 4; k++) {
    vtx[o] = cx; vtx[o + 1] = cy; vtx[o + 2] = cz; vtx[o + 3] = 0; vtx[o + 4] = 0; vtx[o + 5] = 0; vtx[o + 6] = k === 0 || k === 3 ? -1 : 1; vtx[o + 7] = k < 2 ? -1 : 1; vtx[o + 8] = size; vtx[o + 9] = 6; o += WHIP_VERT;
  }
  // the streak behind the tip: the tip's path, three points a tick (sim.js hist), drawn as it is - the points are dense enough to need no curve.
  // The head is the tip as drawn; of the newest tick only what lies behind the drawn moment is used (the rest is folded onto the tip).
  // Where the path really folds (in to the hit, out again) the streak goes dark at the fold instead of drawing a corner (TK from the cos of the turn).
  const H = whip.hist, w0 = 4.4 * whip.trailW, TP = TRAIL_P, TT = TRAIL_T, TK = TRAIL_K, fut = whip._arc ? a : 1;
  TP[0] = ox; TP[1] = oy; TP[2] = oz;
  for (let i = 1; i < TRAIL_N; i++) {
    const p = i * 4, q = i * 3;
    if (i < TRAIL_PER && 1 - i / TRAIL_PER > fut + 1e-6) { TP[q] = ox; TP[q + 1] = oy; TP[q + 2] = oz; } else { TP[q] = H[p]; TP[q + 1] = H[p + 1]; TP[q + 2] = H[p + 2]; }
  }
  TK[0] = 1; TK[TRAIL_N - 1] = 1;
  for (let i = 1; i < TRAIL_N - 1; i++) {   // folds, from the path as it was walked
    const q = i * 3, ax = TP[q - 3] - TP[q], ay = TP[q - 2] - TP[q + 1], az = TP[q - 1] - TP[q + 2], bx2 = TP[q] - TP[q + 3], by2 = TP[q + 1] - TP[q + 4], bz2 = TP[q + 2] - TP[q + 5];
    const la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(bx2 * bx2 + by2 * by2 + bz2 * bz2);
    TK[i] = 1; if (la > 2 && lb > 2) { const c = (ax * bx2 + ay * by2 + az * bz2) / (la * lb); if (c < 0.3) TK[i] = c < -0.2 ? 0 : (c + 0.2) / 0.5; }
  }
  // the tick's own corner (the tip follows the authored curve with a little lag and is then put on the target: the last two ticks of a strike meet at
  // some 65 degrees) is rounded: two passes of a 1-2-1 mean over the inner points - the head (the tip) and the tail stay where they are
  for (let pass = 0; pass < 2; pass++) {
    let px = TP[0], py = TP[1], pz = TP[2];
    for (let i = 1; i < TRAIL_N - 1; i++) { const q = i * 3, cx2 = TP[q], cy2 = TP[q + 1], cz2 = TP[q + 2]; TP[q] = 0.25 * px + 0.5 * cx2 + 0.25 * TP[q + 3]; TP[q + 1] = 0.25 * py + 0.5 * cy2 + 0.25 * TP[q + 4]; TP[q + 2] = 0.25 * pz + 0.5 * cz2 + 0.25 * TP[q + 5]; px = cx2; py = cy2; pz = cz2; }
  }
  let lx2 = tx, ly2 = ty, lz2 = tz;
  for (let i = 0; i < TRAIL_N; i++) {
    const q = i * 3, a3 = i > 0 ? q - 3 : q, b3 = i < TRAIL_N - 1 ? q + 3 : q;
    const x = TP[a3] - TP[b3], y = TP[a3 + 1] - TP[b3 + 1], z = TP[a3 + 2] - TP[b3 + 2], l = Math.sqrt(x * x + y * y + z * z);
    if (l > 1e-3) { lx2 = x / l; ly2 = y / l; lz2 = z / l; }
    TT[q] = lx2; TT[q + 1] = ly2; TT[q + 2] = lz2;
  }
  for (let j = 0; j < TRAIL_SEC; j++) {
    const q3 = j * 3, q = j / (TRAIL_SEC - 1), str = H[j * 4 + 3] * TK[j] * Math.pow(1 - q, 1.3), rad = w0 * (1 - 0.8 * q);
    for (let s = -1; s <= 1; s += 2) {
      vtx[o] = TP[q3]; vtx[o + 1] = TP[q3 + 1]; vtx[o + 2] = TP[q3 + 2]; vtx[o + 3] = TT[q3]; vtx[o + 4] = TT[q3 + 1]; vtx[o + 5] = TT[q3 + 2]; vtx[o + 6] = str; vtx[o + 7] = s; vtx[o + 8] = rad; vtx[o + 9] = 7;
      o += WHIP_VERT;
    }
  }
  return o / WHIP_VERT;
}
