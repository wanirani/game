// WORLD-VERIFY (node, no browser): an independent look at every area of src/v2/world.
//   1. walk flood with the prototype's own moveXZ (hero r 14, h 80) on a 10-unit grid - NOT the lane's reach grid
//      -> cells outside every section, open edges into the void, deco props the hero walks through
//   2. lights under the floor, props floating / sunk
//   3. camera rays (section rig, both facings, fold_open and phone2) from the eye to the hero's feet / chest / head
//      against the static meshes (front faces) -> cells where the hero is fully hidden
//   node tools/v2/world_verify_node.mjs [--areas a,b] [--json out.json]
import fs from 'node:fs';
import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { AREAS } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { groundAt, moveXZ, sectionAt, STEP_UP, JUMP_UP } = await import('../../src/v2/b/world.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const LIST = String(args.areas || Object.keys(AREAS).join(',')).split(',');
const C = 10, HR = 14, HH = 80;
const out = {};

function flood(W, sx, sz) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const b of W.boxes) if (b.walk && !b.inv) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1); }
  x0 -= 40; z0 -= 40; x1 += 40; z1 += 40;
  const nx = Math.ceil((x1 - x0) / C), nz = Math.ceil((z1 - z0) / C), seen = new Uint8Array(nx * nz), gy = new Float32Array(nx * nz);
  const cx = (i) => x0 + (i + 0.5) * C, cz = (j) => z0 + (j + 0.5) * C;
  const i0 = Math.floor((sx - x0) / C), j0 = Math.floor((sz - z0) / C), q = [j0 * nx + i0]; seen[q[0]] = 1; gy[q[0]] = groundAt(W, cx(i0), cz(j0));
  const edges = [];
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % nx, j = Math.floor(k / nx), g = gy[k];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const m = b * nx + a; if (seen[m]) continue;
      const e = { x: cx(i), z: cz(j), y: g, r: HR, h: HH }; moveXZ(W, e, di * C, dj * C);
      if (Math.abs(e.x - cx(a)) > 0.5 || Math.abs(e.z - cz(b)) > 0.5) {   // blocked on the ground: try again at jump height (hop over low things)
        const e2 = { x: cx(i), z: cz(j), y: g + JUMP_UP - STEP_UP, r: HR, h: HH }; moveXZ(W, e2, di * C, dj * C);
        if (Math.abs(e2.x - cx(a)) > 0.5 || Math.abs(e2.z - cz(b)) > 0.5) continue;
      }
      const g2 = groundAt(W, cx(a), cz(b), g + JUMP_UP);
      if (!Number.isFinite(g2)) { edges.push([cx(a), cz(b), g]); continue; }   // walks off into nothing
      seen[m] = 1; gy[m] = g2; q.push(m);
    }
  }
  return { nx, nz, x0, z0, seen, gy, cells: q.map((k) => [cx(k % nx), cz(Math.floor(k / nx)), gy[k]]), edges };
}
const cluster = (pts, d = 45) => {   // greedy clusters of points -> [{n, x0,x1,z0,z1}]
  const cl = [];
  for (const p of pts) { let c = cl.find((c) => p[0] >= c.x0 - d && p[0] <= c.x1 + d && p[1] >= c.z0 - d && p[1] <= c.z1 + d); if (!c) { c = { n: 0, x0: p[0], x1: p[0], z0: p[1], z1: p[1] }; cl.push(c); } c.n++; c.x0 = Math.min(c.x0, p[0]); c.x1 = Math.max(c.x1, p[0]); c.z0 = Math.min(c.z0, p[1]); c.z1 = Math.max(c.z1, p[1]); }
  return cl.sort((a, b) => b.n - a.n);
};

// ---- triangles of the static meshes in a coarse xz grid
function triGrid(W) {
  const T = []; let up = 0;
  for (const m of W.env.meshes) {
    const f = new Float32Array(m.data), n = m.count;
    for (let v = 0; v + 2 < n; v += 3) {
      const a = v * 7, b = a + 7, c = b + 7;
      const t = [f[a], f[a + 1], f[a + 2], f[b], f[b + 1], f[b + 2], f[c], f[c + 1], f[c + 2]];
      const e1 = [t[3] - t[0], t[4] - t[1], t[5] - t[2]], e2 = [t[6] - t[0], t[7] - t[1], t[8] - t[2]];
      const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      t.push(nrm[0], nrm[1], nrm[2], m.tex); up += Math.sign(nrm[1]) * (Math.abs(nrm[1]) > 0.9 * Math.hypot(...nrm) ? 1 : 0); T.push(t);
    }
  }
  const sgn = up >= 0 ? 1 : -1, S = 120, map = new Map();
  T.forEach((t, i) => { const a0 = Math.floor(Math.min(t[0], t[3], t[6]) / S), a1 = Math.floor(Math.max(t[0], t[3], t[6]) / S), b0 = Math.floor(Math.min(t[2], t[5], t[8]) / S), b1 = Math.floor(Math.max(t[2], t[5], t[8]) / S); for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) { const k = a * 100003 + b; let L = map.get(k); if (!L) map.set(k, L = []); L.push(i); } });
  return { T, sgn, S, map };
}
function blockedRay(TG, o, p) {   // any front-facing triangle between eye o and point p (t in 0.02..0.985)?
  const { T, sgn, S, map } = TG, d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const a0 = Math.floor(Math.min(o[0], p[0]) / S), a1 = Math.floor(Math.max(o[0], p[0]) / S), b0 = Math.floor(Math.min(o[2], p[2]) / S), b1 = Math.floor(Math.max(o[2], p[2]) / S);
  const done = new Set();
  for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) {
    const L = map.get(a * 100003 + b); if (!L) continue;
    for (const i of L) {
      if (done.has(i)) continue; done.add(i);
      const t = T[i]; if ((t[9] * d[0] + t[10] * d[1] + t[11] * d[2]) * sgn >= 0) continue;   // back face: not drawn
      const e1x = t[3] - t[0], e1y = t[4] - t[1], e1z = t[5] - t[2], e2x = t[6] - t[0], e2y = t[7] - t[1], e2z = t[8] - t[2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det, tx = o[0] - t[0], ty = o[1] - t[1], tz = o[2] - t[2], u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt > 0.02 && tt < 0.985) return t[12];
    }
  }
  return null;
}
function eye(R, hx, hy, hz, face, viewH) {   // the prototype's _camera with snap = true
  const yaw = R.yaw + (R.yawLead ?? 0.03) * face, pitch = R.pitch, dist = R.dist, lookY = R.lookY, leadX = (R.leadX ?? 0) * face, leadZ = R.leadZ ?? 0;
  let tx = hx + leadX, tz = 130 + (hz - 130) * R.zFollow + leadZ; const ck = R.center?.k ?? 0; if (ck > 0.001 && R.center) { tx += (R.center.x - tx) * ck; tz += (R.center.z - tz) * ck; }
  const tall = Math.max(0, viewH - 540), ly = hy + lookY + tall * (R.tallK ?? 0.4), cp = Math.cos(pitch), sp = Math.sin(pitch);
  let px = tx - Math.sin(yaw) * cp * dist; const py = ly + sp * dist, pz = tz - Math.cos(yaw) * cp * dist;
  px = Math.max(R.minX ?? -1e5, Math.min(R.maxX ?? 1e5, px));
  return [px, py, pz];
}

for (const id of LIST) {
  const a = await AREAS[id](), W = compileEnv(a.stage), d = a.spawns.default, r = out[id] = {};
  const F = flood(W, d.x, d.z);
  r.cells = F.cells.length;
  // 1a. outside every section
  r.outside = cluster(F.cells.filter((c) => !sectionAt(W, c[0], c[1]))).slice(0, 8);
  // 1b. open edges (the hero can step off into nothing). Pits of the test route are intended.
  r.openEdges = cluster(F.edges, 60).slice(0, 12); r.openEdgeCells = F.edges.length;
  // 1c. props without collision that the hero can stand in
  const reach = (x, z) => { const i = Math.floor((x - F.x0) / C), j = Math.floor((z - F.z0) / C); return i >= 0 && j >= 0 && i < F.nx && j < F.nz && F.seen[j * F.nx + i]; };
  r.walkThrough = []; r.floating = []; r.sunk = [];
  for (const P of a.stage.parts) {
    if ((P.t !== 'prop' && P.t !== 'deco') || !P.mesh) continue;
    const g = groundAt(W, P.x, P.z), inBox = W.boxes.some((b) => b.solid && !b.walk && P.x > b.x0 && P.x < b.x1 && P.z > b.z0 && P.z < b.z1);
    if (reach(P.x, P.z) && !inBox) r.walkThrough.push(`${P.t} ${P.mesh}${P.kind ? ':' + P.kind : ''} (${Math.round(P.x)},${Math.round(P.z)}) h${P.h ?? '?'}`);
    if (P.y == null && !Number.isFinite(g)) r.floating.push(`${P.mesh} (${Math.round(P.x)},${Math.round(P.z)}): no ground under it, stands at y 0`);
    if (P.y != null && Number.isFinite(g)) {
      const tops = W.boxes.filter((b) => P.x >= b.x0 && P.x <= b.x1 && P.z >= b.z0 && P.z <= b.z1).map((b) => b.y1);
      if (!tops.some((t) => Math.abs(t - P.y) < 4)) (P.y > g ? r.floating : r.sunk).push(`${P.mesh} (${Math.round(P.x)},${Math.round(P.z)}) y ${P.y}: ground ${g}, box tops ${[...new Set(tops)].join('/')}`);
    }
  }
  // 2. lights under the floor / far above
  r.lightsUnder = W.lights.filter((l) => { const g = groundAt(W, l.x, l.z); return Number.isFinite(g) && l.y < g + 4; }).map((l) => `(${Math.round(l.x)},${Math.round(l.y)},${Math.round(l.z)}) ground ${groundAt(W, l.x, l.z)}`);
  r.lights = W.lights.length;
  // 3. camera occlusion
  const TG = triGrid(W); r.tris = TG.T.length; r.occ = {};
  for (const [dev, viewH] of [['fold_open', 726], ['phone2', 540]]) {
    const hid = [], part = []; let n = 0;
    for (const c of F.cells) {
      if ((Math.round(c[0] / C) + Math.round(c[1] / C)) % 2) continue;   // every other cell (20-unit checker)
      const sec = sectionAt(W, c[0], c[1]); if (!sec?.cam) continue; n++;
      let worst = 0, tex = null;
      for (const face of [1, -1]) {
        const o = eye(sec.cam, c[0], c[2], c[1], face, viewH); let k = 0;
        for (const hy of [6, 52, 100]) { const t = blockedRay(TG, o, [c[0], c[2] + hy, c[1]]); if (t) { k++; tex = t; } }
        worst = Math.max(worst, k);
      }
      if (worst === 3) hid.push([c[0], c[1], tex]); else if (worst === 2) part.push([c[0], c[1]]);
    }
    r.occ[dev] = { tested: n, hidden: hid.length, twoOfThree: part.length, clusters: cluster(hid, 30).slice(0, 14).map((q) => ({ ...q, tex: [...new Set(hid.filter((h) => h[0] >= q.x0 && h[0] <= q.x1 && h[1] >= q.z0 && h[1] <= q.z1).map((h) => h[2]))].join(',') })) };
  }
  r.sky = a.stage.sky; r.fog = a.stage.fog; r.light = a.stage.light;
  const fmt = (c) => `x ${Math.round(c.x0)}..${Math.round(c.x1)} z ${Math.round(c.z0)}..${Math.round(c.z1)} (${c.n})${c.tex ? ' [' + c.tex + ']' : ''}`;
  console.log(`[${id}] flood cells ${r.cells} · static tris ${r.tris} · lights ${r.lights}`);
  console.log(`  outside every section: ${r.outside.length ? r.outside.map(fmt).join(' | ') : 'none'}`);
  console.log(`  open edges into nothing: ${r.openEdgeCells} cells${r.openEdges.length ? ' — ' + r.openEdges.map(fmt).join(' | ') : ''}`);
  console.log(`  no-collision props on walkable ground (${r.walkThrough.length}): ${r.walkThrough.join('; ') || 'none'}`);
  console.log(`  floating: ${r.floating.join('; ') || 'none'}`);
  console.log(`  sunk: ${r.sunk.join('; ') || 'none'}`);
  console.log(`  lights under the floor: ${r.lightsUnder.join('; ') || 'none'}`);
  for (const dev of Object.keys(r.occ)) { const o = r.occ[dev]; console.log(`  hero fully hidden @${dev}: ${o.hidden} of ${o.tested} cells (2 of 3 rays: ${o.twoOfThree})${o.clusters.length ? ' — ' + o.clusters.map(fmt).join(' | ') : ''}`); }
}
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(out, null, 1));
