// WORLD lane: prop bake (docs/v2/ENV_KIT.md 11). Static prop models -> ONE geometry pack + ONE texture atlas.
//   node tools/v2/world_props_bake.mjs [--glb <dir with <id>.glb (+ optional <id>.json {h, rotY, foot:[rx,rz], footH, light})>] [--only a,b] [--out assets/v2/props]
// Sources:  (1) sculpts in tools/v2/world_sculpts.mjs (signed distance fields -> surface nets -> quadric decimation -> texture baked from the full-detail surface)
//           (2) generated GLB models (image-to-3D). A GLB named like a sculpt replaces it.
// Output:   assets/v2/props/props.bin  = 'BNP1' + u32 json length + json + payload (per prop: int16 pos, int8 normal, uint16 uv, uint16 index)
//           assets/v2/props/props_atlas.webp  (one texture for every baked prop -> a prop costs triangles, not a draw call)
// Runtime:  src/v2/env/baked.js (bakedProp writes the triangles into the kit's chunk meshes).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SCULPTS } from './world_sculpts.mjs';

const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1';
const OUT = opt.out ?? 'assets/v2/props', TMP = opt.tmp ?? '/tmp/claude-0/v2/world/bake', PITCH = 18 * Math.PI / 180, CP = Math.cos(PITCH), SP = Math.sin(PITCH);
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
/** heights (world px) and footprints for generated models, by id (tools: /tmp/claude-0/v2/world/gen_requests.json) */
const GLB_META = {
  angel: { h: 192, foot: [29, 23] }, gargoyle: { h: 152, foot: [29, 24] }, bell: { h: 190, foot: [60, 34] }, well: { h: 150, foot: [46, 34] }, cart: { h: 104, foot: [70, 24] },
  tombs4: { h: 96, foot: [0, 0] }, cross: { h: 170, foot: [22, 16] }, mausoleum: { h: 250, foot: [90, 60] }, gate: { h: 240, foot: [0, 0] }, deadtree: { h: 300, foot: [20, 14] },
  lanternpost: { h: 196, foot: [9, 9], light: { y: 150, r: 320, i: 1.6 } }, brazier: { h: 112, foot: [20, 14], light: { y: 90, r: 380, i: 1.8, c: [1, 0.55, 0.22] } }, coffin: { h: 46, foot: [50, 20] },
  niche: { h: 170, foot: [70, 20] }, goods: { h: 96, foot: [56, 26] }, plaguepost: { h: 210, foot: [10, 10] }, stall: { h: 150, foot: [74, 30] }, wreck: { h: 130, foot: [80, 40] }, fountain: { h: 150, foot: [62, 50] },
};

// ───────── noise ─────────
const h3 = (i, j, k) => { let n = (i * 374761393 + j * 668265263 + k * 1274126177) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function vn3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = x - i, fy = y - j, fz = z - k, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(i, j, k), h3(i + 1, j, k), sx), L(h3(i, j + 1, k), h3(i + 1, j + 1, k), sx), sy), L(L(h3(i, j, k + 1), h3(i + 1, j, k + 1), sx), L(h3(i, j + 1, k + 1), h3(i + 1, j + 1, k + 1), sx), sy), sz);
}
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ───────── surface nets ─────────
function surfaceNets(f, B, cell) {
  const [x0, y0, z0, x1, y1, z1] = B, nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const V = new Float32Array(nx * ny * nz), at = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[at(i, j, k)] = f(x0 + i * cell, y0 + j * cell, z0 + k * cell);
  const cid = new Int32Array(nx * ny * nz).fill(-1), P = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k + 1 < nz; k++) for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const v = [], c = [];
    for (let q = 0; q < 8; q++) { const a = i + (q & 1), b = j + ((q >> 1) & 1), d = k + ((q >> 2) & 1); v.push(V[at(a, b, d)]); c.push([a, b, d]); }
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) if ((v[a] < 0) !== (v[b] < 0)) { const t = v[a] / (v[a] - v[b]); sx += c[a][0] + (c[b][0] - c[a][0]) * t; sy += c[a][1] + (c[b][1] - c[a][1]) * t; sz += c[a][2] + (c[b][2] - c[a][2]) * t; n++; }
    if (!n) continue;
    cid[at(i, j, k)] = P.length / 3; P.push(x0 + sx / n * cell, y0 + sy / n * cell, z0 + sz / n * cell);
  }
  const T = [], quad = (a, b, c, d) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; T.push(a, b, c, a, c, d); };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = V[at(i, j, k)] < 0;
    if (i + 1 < nx && j >= 1 && k >= 1 && s !== (V[at(i + 1, j, k)] < 0)) quad(cid[at(i, j - 1, k - 1)], cid[at(i, j, k - 1)], cid[at(i, j, k)], cid[at(i, j - 1, k)]);
    if (j + 1 < ny && i >= 1 && k >= 1 && s !== (V[at(i, j + 1, k)] < 0)) quad(cid[at(i - 1, j, k - 1)], cid[at(i, j, k - 1)], cid[at(i, j, k)], cid[at(i - 1, j, k)]);
    if (k + 1 < nz && i >= 1 && j >= 1 && s !== (V[at(i, j, k + 1)] < 0)) quad(cid[at(i - 1, j - 1, k)], cid[at(i, j - 1, k)], cid[at(i, j, k)], cid[at(i - 1, j, k)]);
  }
  return { P: Float64Array.from(P), T: Int32Array.from(T) };
}

// ───────── quadric edge-collapse decimation ─────────
/** subset = true keeps original vertices only (attributes stay valid: used for GLB models with uv) */
function decimate(P, T, target, subset = false) {
  const nv = P.length / 3, nt0 = T.length / 3, Q = new Float64Array(nv * 10), vf = Array.from({ length: nv }, () => []), tAlive = new Uint8Array(nt0).fill(1), vAlive = new Uint8Array(nv).fill(1), stamp = new Int32Array(nv);
  const tn = (t, out) => { const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]; out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx; return out; };
  const N = [0, 0, 0];
  for (let t = 0; t < nt0; t++) {
    tn(t, N); const l = Math.hypot(N[0], N[1], N[2]) || 1e-12, a = N[0] / l, b = N[1] / l, c = N[2] / l, i0 = T[t * 3] * 3, d = -(a * P[i0] + b * P[i0 + 1] + c * P[i0 + 2]), w = l;
    const q = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
    for (let e = 0; e < 3; e++) { const v = T[t * 3 + e]; vf[v].push(t); for (let k = 0; k < 10; k++) Q[v * 10 + k] += q[k] * w; }
  }
  const err = (q, x, y, z) => q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  const heap = [];
  const push = (e) => { let i = heap.length; heap.push(e); while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= e[0]) break; heap[i] = heap[p]; i = p; } heap[i] = e; };
  const pop = () => { const top = heap[0], e = heap.pop(); if (heap.length) { let i = 0; for (;;) { let c = i * 2 + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[c][0] >= e[0]) break; heap[i] = heap[c]; i = c; } heap[i] = e; } return top; };
  const qs = new Float64Array(10);
  const cost = (a, b) => {
    for (let k = 0; k < 10; k++) qs[k] = Q[a * 10 + k] + Q[b * 10 + k];
    const ea = err(qs, P[a * 3], P[a * 3 + 1], P[a * 3 + 2]), eb = err(qs, P[b * 3], P[b * 3 + 1], P[b * 3 + 2]);
    if (subset) return ea <= eb ? [ea, a, b, stamp[a], stamp[b], 0] : [eb, a, b, stamp[a], stamp[b], 1];
    const mx = (P[a * 3] + P[b * 3]) / 2, my = (P[a * 3 + 1] + P[b * 3 + 1]) / 2, mz = (P[a * 3 + 2] + P[b * 3 + 2]) / 2, em = err(qs, mx, my, mz);
    return em <= ea && em <= eb ? [em, a, b, stamp[a], stamp[b], 2] : ea <= eb ? [ea, a, b, stamp[a], stamp[b], 0] : [eb, a, b, stamp[a], stamp[b], 1];
  };
  const seen = new Set();
  for (let t = 0; t < nt0; t++) for (let e = 0; e < 3; e++) { const a = T[t * 3 + e], b = T[t * 3 + (e + 1) % 3], k = a < b ? a * nv + b : b * nv + a; if (!seen.has(k)) { seen.add(k); push(cost(Math.min(a, b), Math.max(a, b))); } }
  let nt = nt0; const n0 = [0, 0, 0], n1 = [0, 0, 0];
  const nbr = (v) => { const s = new Set(); for (const t of vf[v]) if (tAlive[t]) for (let e = 0; e < 3; e++) if (T[t * 3 + e] !== v) s.add(T[t * 3 + e]); return s; };
  while (nt > target && heap.length) {
    const [, a, b, sa, sb, mode] = pop();
    if (!vAlive[a] || !vAlive[b] || stamp[a] !== sa || stamp[b] !== sb) continue;
    const na = nbr(a), nb = nbr(b); let common = 0; for (const v of na) if (nb.has(v)) common++;
    if (common !== 2) continue;   // keeps the surface a manifold (and leaves open borders alone)
    const keep = mode === 1 ? b : a, gone = keep === a ? b : a;
    const px = mode === 2 ? (P[a * 3] + P[b * 3]) / 2 : P[keep * 3], py = mode === 2 ? (P[a * 3 + 1] + P[b * 3 + 1]) / 2 : P[keep * 3 + 1], pz = mode === 2 ? (P[a * 3 + 2] + P[b * 3 + 2]) / 2 : P[keep * 3 + 2];
    // no face may flip
    let bad = false; const old = [[P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]]];
    for (const v of [a, b]) { if (bad) break; for (const t of vf[v]) { if (!tAlive[t]) continue; const i0 = T[t * 3], i1 = T[t * 3 + 1], i2 = T[t * 3 + 2]; if ((i0 === a || i1 === a || i2 === a) && (i0 === b || i1 === b || i2 === b)) continue; tn(t, n0); P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz; tn(t, n1); const o = v === a ? old[0] : old[1]; P[v * 3] = o[0]; P[v * 3 + 1] = o[1]; P[v * 3 + 2] = o[2]; const l0 = Math.hypot(n0[0], n0[1], n0[2]), l1 = Math.hypot(n1[0], n1[1], n1[2]); if (l1 < 1e-9 || (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) < 0.25 * l0 * l1) { bad = true; break; } } }
    if (bad) continue;
    P[keep * 3] = px; P[keep * 3 + 1] = py; P[keep * 3 + 2] = pz;
    for (let k = 0; k < 10; k++) Q[keep * 10 + k] = Q[a * 10 + k] + Q[b * 10 + k];
    for (const t of vf[gone]) { if (!tAlive[t]) continue; const i0 = T[t * 3], i1 = T[t * 3 + 1], i2 = T[t * 3 + 2]; if (i0 === keep || i1 === keep || i2 === keep) { tAlive[t] = 0; nt--; } else { for (let e = 0; e < 3; e++) if (T[t * 3 + e] === gone) T[t * 3 + e] = keep; vf[keep].push(t); } }
    vAlive[gone] = 0; stamp[keep]++; vf[keep] = vf[keep].filter((t) => tAlive[t]);
    for (const v of nbr(keep)) push(cost(Math.min(keep, v), Math.max(keep, v)));
  }
  const map = new Int32Array(nv).fill(-1), outP = [], outT = [], keepIdx = [];
  for (let t = 0; t < nt0; t++) if (tAlive[t]) for (let e = 0; e < 3; e++) { const v = T[t * 3 + e]; if (map[v] < 0) { map[v] = outP.length / 3; outP.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); keepIdx.push(v); } outT.push(map[v]); }
  return { P: Float64Array.from(outP), T: Int32Array.from(outT), keepIdx };
}

// ───────── sculpt -> mesh + texture ─────────
const grad = (f, x, y, z, e = 0.7) => { const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e), l = Math.hypot(gx, gy, gz) || 1; return [gx / l, gy / l, gz / l]; };
function bakeSculpt(name, S) {
  const t0 = Date.now(), f = S.f, raw = surfaceNets(f, S.box, S.cell), dec = decimate(raw.P, raw.T, S.tris), P = dec.P, T = dec.T, nv = P.length / 3;
  const Nrm = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) { const g = grad(f, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); Nrm[i * 3] = g[0]; Nrm[i * 3 + 1] = g[1]; Nrm[i * 3 + 2] = g[2]; }
  for (let t = 0; t < T.length; t += 3) {   // outward winding: geometric normal along the field gradient
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, g = grad(f, (P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3);
    if (nx * g[0] + ny * g[1] + nz * g[2] < 0) { const q = T[t + 1]; T[t + 1] = T[t + 2]; T[t + 2] = q; }
  }
  // texture: the full-detail surface seen from the front, 18 degrees from above (the game camera looks down 13..29 degrees). image axes: u = x, v = y*cos + z*sin
  const [bx0, by0, bz0, bx1, by1, bz1] = S.box, [tw, th] = S.tex;
  const vOf = (y, z) => y * CP + z * SP;   // image "up" coordinate of a point
  let v0 = 1e9, v1 = -1e9, u0 = 1e9, u1 = -1e9; for (let i = 0; i < nv; i++) { const v = vOf(P[i * 3 + 1], P[i * 3 + 2]); if (v < v0) v0 = v; if (v > v1) v1 = v; if (P[i * 3] < u0) u0 = P[i * 3]; if (P[i * 3] > u1) u1 = P[i * 3]; }
  u0 -= 1.5; u1 += 1.5; v0 -= 1.5; v1 += 1.5;
  const img = new Float32Array(tw * th * 3), hit = new Uint8Array(tw * th), dx = 0, dy = -SP, dz = CP, Ld = [-0.45, 0.75, -0.5], Ll = Math.hypot(...Ld), stone = S.look !== 'bark';
  const span = Math.hypot(by1 - by0, bz1 - bz0) + 40;
  for (let py = 0; py < th; py++) for (let px = 0; px < tw; px++) {
    const u = u0 + (px + 0.5) / tw * (u1 - u0), v = v1 - (py + 0.5) / th * (v1 - v0);
    // a point on the image plane through the origin: (u, v*cos, -v*sin) ; start far in front and walk along (0,-sin,cos)
    let x = u, y = v * CP + SP * span, z = v * SP - CP * span, ok = false, tt = 0;
    for (let i = 0; i < 200 && tt < span * 2.2; i++) { const d = f(x, y, z); if (d < 0.2) { ok = true; break; } const st = Math.max(d * 0.85, 0.35); x += dx * st; y += dy * st; z += dz * st; tt += st; }
    if (!ok || y < by0 - 0.5) continue;
    const n = grad(f, x, y, z, 0.5); let ao = 0; for (let k = 1; k <= 4; k++) { const s = k * 3.2; ao += Math.max(0, s - f(x + n[0] * s, y + n[1] * s, z + n[2] * s)) / s / k; }
    ao = 1 - Math.min(1, ao * 0.62); const diff = Math.max(0, (n[0] * Ld[0] + n[1] * Ld[1] + n[2] * Ld[2]) / Ll), rim = Math.pow(1 - Math.max(0, -(n[2] * CP - n[1] * SP)), 2);
    let sh = (0.56 + 0.5 * diff) * (0.4 + 0.6 * ao) * (1 - 0.18 * rim), r, g, b;
    const sp = vn3(x * 0.42, y * 0.42, z * 0.42), bl = vn3(x * 0.045 + 7, y * 0.045, z * 0.045), fine = vn3(x * 1.3, y * 1.3, z * 1.3);
    if (stone) {
      sh *= 0.86 + 0.16 * sp + 0.12 * (bl - 0.5) + 0.08 * (fine - 0.5);
      const streak = sm(0.55, 0.85, vn3(x * 0.33, y * 0.02, 3.3)) * sm(0.6, 0.1, n[1]); sh *= 1 - 0.22 * streak;
      r = 0.78 * sh; g = 0.79 * sh; b = 0.83 * sh;
      const moss = sm(0.35, 0.8, n[1]) * sm(0.35, 0.7, vn3(x * 0.08, y * 0.08 + 5, z * 0.08)) * 0.75 + sm(0.62, 0.9, vn3(x * 0.06 + 11, y * 0.05, z * 0.06)) * 0.35 * (1 - ao + 0.3);
      r += (0.33 * sh - r) * moss; g += (0.44 * sh - g) * moss; b += (0.25 * sh - b) * moss;
      const lich = sm(0.72, 0.8, vn3(x * 0.19 + 3, y * 0.19, z * 0.19 + 9)) * 0.4; r += (0.86 * sh - r) * lich; g += (0.84 * sh - g) * lich; b += (0.7 * sh - b) * lich;
    } else {
      const ang = Math.atan2(z, x), grain = vn3(ang * 5 + x * 0.25, y * 0.035, 1.7), crack = sm(0.62, 0.72, vn3(ang * 9 + x * 0.5, y * 0.05, 8.2));
      sh *= 0.74 + 0.4 * grain + 0.1 * (fine - 0.5); sh *= 1 - 0.4 * crack;
      r = 0.5 * sh; g = 0.44 * sh; b = 0.41 * sh;
      const pale = sm(0.6, 0.85, bl) * 0.45; r += (0.72 * sh - r) * pale; g += (0.7 * sh - g) * pale; b += (0.66 * sh - b) * pale;
      const moss = sm(0.4, 0.8, n[1]) * sm(0.4, 0.7, sp) * 0.5; r += (0.3 * sh - r) * moss; g += (0.4 * sh - g) * moss; b += (0.22 * sh - b) * moss;
    }
    const o = (py * tw + px) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b; hit[py * tw + px] = 1;
  }
  for (let pass = 0; pass < 24; pass++) {   // bleed colour into the empty texels (edges sample them)
    const add = [];
    for (let py = 0; py < th; py++) for (let px = 0; px < tw; px++) { if (hit[py * tw + px]) continue; let r = 0, g = 0, b = 0, n = 0; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const qx = px + ox, qy = py + oy; if (qx < 0 || qy < 0 || qx >= tw || qy >= th || !hit[qy * tw + qx]) continue; const o = (qy * tw + qx) * 3; r += img[o]; g += img[o + 1]; b += img[o + 2]; n++; } if (n) add.push([py * tw + px, r / n, g / n, b / n]); }
    if (!add.length) break; for (const [i, r, g, b] of add) { img[i * 3] = r; img[i * 3 + 1] = g; img[i * 3 + 2] = b; hit[i] = 1; }
  }
  const rgb = new Uint8Array(tw * th * 3); for (let i = 0; i < rgb.length; i++) rgb[i] = Math.max(0, Math.min(255, Math.round((hit[(i / 3) | 0] ? img[i] : 0.4) * 255)));
  const UV = new Float32Array(nv * 2); for (let i = 0; i < nv; i++) { UV[i * 2] = (P[i * 3] - u0) / (u1 - u0); UV[i * 2 + 1] = (v1 - vOf(P[i * 3 + 1], P[i * 3 + 2])) / (v1 - v0); }
  console.log(`  sculpt ${name}: grid ${raw.T.length / 3} tris -> ${T.length / 3} tris, ${nv} verts, texture ${tw}x${th}, ${Date.now() - t0} ms`);
  return { name, src: 'sculpt', P: Float32Array.from(P), N: Nrm, UV, T: Uint16Array.from(T), tw, th, rgb, h: S.h, foot: S.foot, footH: S.footH, light: S.light ?? null };
}

// ───────── generated GLB -> mesh + texture ─────────
async function bakeGlb(id, file) {
  const { readGLB } = await import('./char3d_glbio.mjs'), { buildModel } = await import('../../src/v2/char3d/glb.js');
  const side = fs.existsSync(file.replace(/\.glb$/, '.json')) ? JSON.parse(fs.readFileSync(file.replace(/\.glb$/, '.json'), 'utf8')) : {}, meta = { ...(GLB_META[id] ?? { h: 120, foot: [20, 14] }), ...side };
  const M = buildModel(readGLB(file)), pr = M.prims[0]; let P = Float64Array.from(pr.pos), N = Float32Array.from(pr.nrm), UV = Float32Array.from(pr.uv), T = Int32Array.from(pr.idx);
  if (T.length / 3 > (meta.tris ?? 1500)) { const d = decimate(P, T, meta.tris ?? 1500, true), k = d.keepIdx; P = d.P; T = d.T; N = Float32Array.from(k.flatMap((v) => [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]])); UV = Float32Array.from(k.flatMap((v) => [UV[v * 2], UV[v * 2 + 1]])); }
  const ry = (meta.rotY ?? 0) * Math.PI / 180, c = Math.cos(ry), s = Math.sin(ry), nv = P.length / 3; let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < nv; i++) { const x = P[i * 3], z = P[i * 3 + 2]; P[i * 3] = c * x + s * z; P[i * 3 + 2] = -s * x + c * z; const a = N[i * 3], b = N[i * 3 + 2]; N[i * 3] = c * a + s * b; N[i * 3 + 2] = -s * a + c * b; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i * 3 + k]); hi[k] = Math.max(hi[k], P[i * 3 + k]); } }
  const sc = meta.h / (hi[1] - lo[1]), cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
  for (let i = 0; i < nv; i++) { P[i * 3] = (P[i * 3] - cx) * sc; P[i * 3 + 1] = (P[i * 3 + 1] - lo[1]) * sc; P[i * 3 + 2] = (P[i * 3 + 2] - cz) * sc; }
  const tex = meta.tex ?? 320, imgFile = path.join(TMP, id + '.img'); fs.writeFileSync(imgFile, M.images[pr.image]?.bytes ?? new Uint8Array(0));
  console.log(`  glb ${id}: ${T.length / 3} tris, ${nv} verts, h ${meta.h}, texture -> ${tex}x${tex}`);
  return { name: id, src: 'glb', P: Float32Array.from(P), N, UV, T: Uint16Array.from(T), tw: tex, th: tex, imgFile, h: meta.h, foot: meta.foot ?? [0, 0], footH: meta.footH ?? meta.h * 0.8, light: meta.light ?? null };
}

// ───────── run ─────────
const only = opt.only ? new Set(opt.only.split(',')) : null, items = new Map();
for (const [name, S] of Object.entries(SCULPTS)) if (!only || only.has(name)) items.set(name, bakeSculpt(name, S));
if (opt.glb && fs.existsSync(opt.glb)) for (const fn of fs.readdirSync(opt.glb).filter((n) => n.endsWith('.glb')).sort()) { const id = fn.replace(/\.glb$/, ''); if (!only || only.has(id)) items.set(id, await bakeGlb(id, path.join(opt.glb, fn))); }
// atlas: shelves, widest first
const list = [...items.values()].sort((a, b) => b.th - a.th), PAD = 4, AW = Number(opt.atlas ?? 1024); let x = PAD, y = PAD, rowH = 0;
for (const it of list) { if (x + it.tw + PAD > AW) { x = PAD; y += rowH + PAD; rowH = 0; } it.ax = x; it.ay = y; x += it.tw + PAD; rowH = Math.max(rowH, it.th); }
let AH = 64; while (AH < y + rowH + PAD) AH *= 2;
if (AH > 2048) throw new Error('atlas would be taller than 2048 - lower the cell sizes');
const jobs = list.map((it) => { let raw = null; if (it.rgb) { raw = path.join(TMP, it.name + '.rgb'); fs.writeFileSync(raw, it.rgb); } return { x: it.ax, y: it.ay, w: it.tw, h: it.th, raw, img: it.imgFile ?? null }; });
const py = `
import sys, json
from PIL import Image
J = json.loads(sys.argv[1]); A = Image.new('RGB', (J['w'], J['h']), (96, 96, 100))
for c in J['cells']:
    if c['raw']: im = Image.frombytes('RGB', (c['w'], c['h']), open(c['raw'], 'rb').read())
    else: im = Image.open(c['img']).convert('RGB').resize((c['w'], c['h']), Image.LANCZOS)
    big = im.resize((c['w'] + 8, c['h'] + 8)); A.paste(big, (c['x'] - 4, c['y'] - 4)); A.paste(im, (c['x'], c['y']))
A.save(J['out'], 'WEBP', quality=int(J['q']), method=6); A.save(J['png'])
`;
const atlasFile = path.join(OUT, 'props_atlas.webp');
execFileSync('python3', ['-I', '-c', py, JSON.stringify({ w: AW, h: AH, cells: jobs, out: atlasFile, png: path.join(TMP, 'atlas.png'), q: opt.q ?? 84 })], { stdio: 'inherit' });
// pack
const head = { v: 1, atlas: { w: AW, h: AH, file: 'props_atlas.webp' }, props: {} }, chunks = []; let off = 0;
const put = (ta) => { const b = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength), padN = (4 - (b.length % 4)) % 4; chunks.push(b, Buffer.alloc(padN)); const o = off; off += b.length + padN; return o; };
for (const it of list) {
  const nv = it.P.length / 3, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], it.P[i * 3 + k]); hi[k] = Math.max(hi[k], it.P[i * 3 + k]); }
  const qp = new Int16Array(nv * 3), qn = new Int8Array(nv * 4), qu = new Uint16Array(nv * 2);
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) { qp[i * 3 + k] = Math.round(((it.P[i * 3 + k] - lo[k]) / Math.max(1e-6, hi[k] - lo[k])) * 65535 - 32768); qn[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, it.N[i * 3 + k])) * 127); }
    const u = Math.max(0, Math.min(1, it.UV[i * 2])), v = Math.max(0, Math.min(1, it.UV[i * 2 + 1]));
    qu[i * 2] = Math.round(((it.ax + 1 + u * (it.tw - 2)) / AW) * 65535); qu[i * 2 + 1] = Math.round(((it.ay + 1 + v * (it.th - 2)) / AH) * 65535);
  }
  head.props[it.name] = { src: it.src, nv, ni: it.T.length, tris: it.T.length / 3, lo: lo.map((v) => +v.toFixed(2)), hi: hi.map((v) => +v.toFixed(2)), h: +(hi[1] - lo[1]).toFixed(1), foot: it.foot, footH: it.footH, light: it.light, cell: [it.ax, it.ay, it.tw, it.th], pos: put(qp), nrm: put(qn), uv: put(qu), idx: put(it.T) };
}
const js = Buffer.from(JSON.stringify(head), 'utf8'), jpad = (4 - (js.length % 4)) % 4, hd = Buffer.alloc(8); hd.write('BNP1', 0, 'latin1'); hd.writeUInt32LE(js.length + jpad, 4);
const bin = Buffer.concat([hd, js, Buffer.alloc(jpad, 0x20), ...chunks]);
fs.writeFileSync(path.join(OUT, 'props.bin'), bin);
console.log(`pack ${path.join(OUT, 'props.bin')}: ${bin.length} bytes, ${list.length} props, ${list.reduce((a, it) => a + it.T.length / 3, 0)} tris | atlas ${AW}x${AH} ${fs.statSync(atlasFile).size} bytes`);
for (const it of list) console.log(`  ${it.name.padEnd(12)} ${String(it.T.length / 3).padStart(5)} tris  ${it.src}  cell ${it.tw}x${it.th}`);
