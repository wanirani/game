// WORLD-VERIFY (node, no browser): an independent look at every area of src/v2/world.
//   1. walk flood with the prototype's own moveXZ (hero r 14, h 80) on a 10-unit grid - NOT the lane's reach grid
//      -> cells outside every section, open edges into the void, deco props the hero walks through
//   2. lights under the floor, props floating / sunk
//   3. camera rays (section rig, both facings, fold_open and phone2) from the eye to the hero's feet / chest / head
//      against the static meshes (front faces) -> cells where the hero is fully hidden
//   WORLD-3 (2026-11-18): part 3 is honest now - every standable cell (the lane's reach grid on a 20-unit lattice, as tools/v2/world_v2verify_node.mjs),
//      flooded from EVERY spawn, entry spawn, whip-ring landing and bell spot, in EVERY flagged state whose geometry differs from the base state;
//      hidden cells are printed per area, state and section and the run FAILS over these limits (docs/v2/AREA_FORMAT.md 14):
//        a. ossuary section `boss` (the fight floor), both nights: 0 hidden cells
//        b. within 60 units of any crossing bell (interact kind bell, event bell.ring) in any area: 0
//        c. the strip behind the coffin wall at the corridor bell (ossuary_now, x 410..770, z 790..930): 0
//        d. every other section of the ossuary and the bell tower: under 3 % of its cells
//        e. the older areas keep what they had (no worse): LIMIT_AREA below, % of all cells of the area
//   4. the last hall cannot trap and leaves room to roll round the boss (hallTest below)
//   5. DROP-IN (THINGS, 2026-11-19; tools/v2/world_dropin.mjs, docs/v2/ENV_KIT.md 25): every place where a body that leaves a floor over an edge without a jump (walked,
//      rolled or knocked off) can come down, within 160 px, INSIDE a solid that has no top to stand on - every area, every state whose collision differs. The list must
//      be empty (slice0, the test strip, is printed only). Breakables a body can come down into are printed apart (the game's own dynamic solids).
//   node tools/v2/world_verify_node.mjs [--areas a,b] [--json out.json]   exit 1 over a limit
import fs from 'node:fs';
import { loadPropsNode } from './world_node.mjs';
import { dropIn } from './world_dropin.mjs';
loadPropsNode();
const { AREAS, areaStates, stateName } = await import('../../src/v2/world/index.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
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

// ---- WORLD-3 limits (docs/v2/AREA_FORMAT.md 14)
const STRICT = ['ossuary', 'belltower'];                                     // per-section limits (a-d)
const LIMIT_AREA = { eshville_now: 3, eshville_past: 4, graveyard_now: 11, graveyard_past: 14, slice0: 5 };   // e: % of all cells, what these areas had before this round (no worse)
const ZONES = { ossuary_now: [{ name: 'the strip behind the coffin wall (x 410..770, z 790..930)', x0: 410, x1: 770, z0: 790, z1: 930, max: 0 }] };
const overs = [], over = (m) => { if (!overs.includes(m)) overs.push(m); };
/**
 * The last hall of the ossuary (sections rest + boss + posts, z 2800..3900) against a boss of radius QR 30, hero r 14, on a 10-unit lattice.
 *  trap:  the boss is put on every 20-unit spot where it fits; hero cells within QR + r of it are taken away; what is left must stay ONE piece.
 *         A piece cut off = cells the hero can stand in but cannot leave by walking while the boss stands there. A plain corner of two walls gives
 *         at most 5 such cells (the hero is cornered, he rolls out); more than TRAP_MAX 6 cells in one piece is a nook or a slot -> FAIL.
 *  orbit: a ring of radius 150 (one roll) round the boss, 48 points, all standable. Counted (a) on the fight floor = the flagstone field
 *         x 300..900, z 3100..3600 where the fight is laid out -> must be >= 70 %, and (b) on every spot of boss + posts where the boss fits
 *         (the reviewer's count; the walls alone cap it near 50 %) -> printed only.
 */
async function hallTest(id) {
  const QR = 30, TRAP_MAX = 6, res = [], sts = id === 'ossuary_now' ? [{}, { knells_hung: true }, { wedge_stone: true, knells_hung: true, queen_sent: true }] : [{}, { queen_fled: true }, { wedge_stone: true, knell_1: true, knell_2: true, knell_3: true, knell_4: true, queen_fled: true }];
  for (const fl of sts) {
    const a = await AREAS[id](fl), W = compileEnv(a.stage), st = stateName(fl);
    const solids = W.boxes.filter((b) => b.solid && !b.walk && b.z1 > 2760 && b.z0 < 3940 && b.y1 > STEP_UP && b.y0 < 60);
    const free = (x, z, r) => x - r >= 100 && x + r <= 1100 && z - r >= 2800 && z + r <= 3900 && !solids.some((b) => x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1);
    const NX = 100, NZ = 110, cell = new Uint8Array(NX * NZ), X = (i) => 105 + i * 10, Z = (j) => 2805 + j * 10; let nFree = 0;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) if (free(X(i), Z(j), HR)) { cell[j * NX + i] = 1; nFree++; }
    let worst = { n: 0 }, traps = 0; const comp = new Int32Array(NX * NZ), q = new Int32Array(NX * NZ);
    for (let bx = 130; bx <= 1070; bx += 20) for (let bz = 3030; bz <= 3870; bz += 20) {
      if (!free(bx, bz, QR)) continue;
      comp.fill(0); let nc = 0, big = 0; const sizes = [0], first = [null];
      const blocked = (k) => { const i = k % NX, j = (k - i) / NX; return (X(i) - bx) ** 2 + (Z(j) - bz) ** 2 < (QR + HR) ** 2; };
      // only cells near the boss can be cut off: flood the neighbourhood (within 260) and treat cells on its rim as joined to the rest of the hall
      const i0 = Math.max(0, Math.floor((bx - 260 - 105) / 10)), i1 = Math.min(NX - 1, Math.ceil((bx + 260 - 105) / 10)), j0 = Math.max(0, Math.floor((bz - 260 - 2805) / 10)), j1 = Math.min(NZ - 1, Math.ceil((bz + 260 - 2805) / 10));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k0 = j * NX + i; if (!cell[k0] || comp[k0] || blocked(k0)) continue;
        nc++; let h = 0, t = 0, rim = false; q[t++] = k0; comp[k0] = nc;
        while (h < t) { const k = q[h++], ci = k % NX, cj = (k - ci) / NX; if (ci === i0 || ci === i1 || cj === j0 || cj === j1) rim = true;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a2 = ci + di, b2 = cj + dj; if (a2 < i0 || a2 > i1 || b2 < j0 || b2 > j1) continue; const m = b2 * NX + a2; if (cell[m] && !comp[m] && !blocked(m)) { comp[m] = nc; q[t++] = m; } } }
        if (!rim && t > TRAP_MAX) { traps++; if (t > worst.n) worst = { n: t, bx, bz, x: X(k0 % NX), z: Z((k0 - k0 % NX) / NX) }; }
      }
    }
    const ring = (inFloor) => { let n = 0, okN = 0; for (let bx = 140; bx <= 1060; bx += 20) for (let bz = 3040; bz <= 3860; bz += 20) { if (inFloor && !(bx >= 300 && bx <= 900 && bz >= 3100 && bz <= 3600)) continue; if (!free(bx, bz, QR)) continue; n++; let ok = true; for (let k = 0; k < 48 && ok; k++) { const t = k / 48 * Math.PI * 2; ok = free(bx + Math.cos(t) * 150, bz + Math.sin(t) * 150, HR); } if (ok) okN++; } return [okN, n, Math.round(okN / Math.max(1, n) * 100)]; };
    const rf = ring(true), ra = ring(false), bell = a.interact.find((it) => it.id === 'bell_arena');
    const inner = solids.filter((b) => b.x0 >= 300 - 1 && b.x1 <= 900 + 1 && b.z0 >= 3100 - 1 && b.z1 <= 3600 + 1);
    const line = `trap pieces over ${TRAP_MAX} cells: ${traps}${traps ? ` (worst ${worst.n} cells at (${worst.x}, ${worst.z}) with the boss at (${worst.bx}, ${worst.bz}))` : ''} · roll orbit 150 free at ${rf[0]} of ${rf[1]} boss spots on the fight floor (${rf[2]} %) · on every spot of the hall ${ra[0]} of ${ra[1]} (${ra[2]} %) · solid things on the fight floor: ${inner.length} · bell_arena at (${bell?.x}, ${bell?.z})`;
    res.push({ state: st, traps, worst, orbitFloor: rf, orbitAll: ra, line });
    if (traps) over(`${id}@${st}: the last hall has ${traps} boss spots that shut the hero in (worst: ${worst.n} cells at (${worst.x}, ${worst.z}), boss at (${worst.bx}, ${worst.bz}))`);
    if (rf[2] < 70) over(`${id}@${st}: roll orbit free at ${rf[2]} % of boss spots on the fight floor — limit 70 %`);
    if (inner.length) over(`${id}@${st}: ${inner.length} solid thing(s) stand on the fight floor`);
  }
  return res;
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
  // 3. camera occlusion: every state whose geometry differs, every standable cell, seeded from every spawn / entry / ring landing / bell
  r.occ = {}; const seenGeo = new Set();
  for (const flags of areaStates(id)) {
    const st = stateName(flags), a2 = st === 'base' ? a : await AREAS[id](flags), W2 = st === 'base' ? W : compileEnv(a2.stage);
    const geo = W2.env.meshes.map((m) => m.count + ':' + m.tex).join('|') + '#' + W2.boxes.map((b) => [b.x0, b.x1, b.z0, b.z1, b.y0, b.y1, +b.solid, +b.walk].join(',')).join('|');
    if (seenGeo.has(geo)) continue; seenGeo.add(geo);
    { const dr = dropIn(a2, W2, { groundAt, moveXZ, reachGrid }); (r.dropIn ??= {})[st] = dr;   // 5. drop-in
      if (id !== 'slice0') for (const p of dr.places) over(`${id}@${st}: DROP-IN - a body that comes off (${p.from}) can come down inside ${p.what} (box x ${p.box[0]}..${p.box[1]} z ${p.box[2]}..${p.box[3]}, top ${p.top}; ${p.n} landings)`); }
    const bells = a2.interact.filter((it) => it.kind === 'bell' && it.event === 'bell.ring');
    const seeds = [...Object.values(a2.spawns).map((p) => [p.x, p.z]), ...(a2.stage.hookPoints ?? []).filter((h) => h.to).map((h) => h.to), ...bells.map((b) => [b.x, b.z])];
    const g = reachGrid(W2, 0, 0, 14, { noStart: true, seeds, hooks: a2.stage.hookPoints ?? [] }), TG = triGrid(W2); if (st === 'base') r.tris = TG.T.length;
    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9; for (const b of W2.boxes) if (b.walk) { bx0 = Math.min(bx0, b.x0); bx1 = Math.max(bx1, b.x1); bz0 = Math.min(bz0, b.z0); bz1 = Math.max(bz1, b.z1); }
    const cells = []; for (let x = bx0 + 10; x < bx1; x += 20) for (let z = bz0 + 10; z < bz1; z += 20) if (g.reachable(x, z)) cells.push([x, z, groundAt(W2, x, z)]);
    const R = r.occ[st] = {};
    for (const [dev, viewH] of [['fold_open', 726], ['phone2', 540]]) {
      const hid = [], bySec = {}; let n = 0, part = 0;
      for (const c of cells) {
        const sec = sectionAt(W2, c[0], c[1]); if (!sec?.cam) continue; n++; const S = bySec[sec.id] ??= { tested: 0, hidden: 0 }; S.tested++;
        let worst = 0, tex = null;
        for (const face of [1, -1]) { const o = eye(sec.cam, c[0], c[2], c[1], face, viewH); let k = 0; for (const hy of [6, 52, 100]) { const t = blockedRay(TG, o, [c[0], c[2] + hy, c[1]]); if (t) { k++; tex = t; } } worst = Math.max(worst, k); }
        if (worst === 3) { hid.push([c[0], c[1], tex, sec.id]); S.hidden++; } else if (worst === 2) part++;
      }
      const nearBell = hid.filter((h) => bells.some((b) => Math.hypot(h[0] - b.x, h[1] - b.z) <= 60)), zones = (ZONES[id] ?? []).map((q) => ({ ...q, n: hid.filter((h) => h[0] >= q.x0 && h[0] <= q.x1 && h[1] >= q.z0 && h[1] <= q.z1).length }));
      R[dev] = { tested: n, hidden: hid.length, twoOfThree: part, bySec, nearBell: nearBell.length, zones, clusters: cluster(hid, 30).slice(0, 12).map((q) => ({ ...q, tex: [...new Set(hid.filter((h) => h[0] >= q.x0 && h[0] <= q.x1 && h[1] >= q.z0 && h[1] <= q.z1).map((h) => h[2]))].join(',') })) };
      const tag = `${id}@${st} ${dev}`, pct = (v, t) => (t ? v / t * 100 : 0);
      if (STRICT.includes(id.split('_')[0])) { for (const [sid, S] of Object.entries(bySec)) { if (id.startsWith('ossuary') && sid === 'boss') { if (S.hidden) over(`${tag}: ${S.hidden} hidden cells on the fight floor (section boss) — limit 0`); } else if (pct(S.hidden, S.tested) >= 3) over(`${tag}: section ${sid} ${S.hidden} of ${S.tested} hidden (${pct(S.hidden, S.tested).toFixed(1)} %) — limit under 3 %`); } }
      else if (pct(hid.length, n) > (LIMIT_AREA[id] ?? 3)) over(`${tag}: ${hid.length} of ${n} hidden (${pct(hid.length, n).toFixed(1)} %) — limit ${LIMIT_AREA[id] ?? 3} % for this area`);
      if (nearBell.length) over(`${tag}: ${nearBell.length} hidden cells within 60 of a crossing bell: ${nearBell.slice(0, 5).map((h) => `(${h[0]},${h[1]})`).join(' ')}`);
      for (const q of zones) if (q.n > q.max) over(`${tag}: ${q.n} hidden cells in ${q.name} — limit ${q.max}`);
    }
  }
  if (id.startsWith('ossuary')) r.hall = await hallTest(id);
  r.sky = a.stage.sky; r.fog = a.stage.fog; r.light = a.stage.light;
  const fmt = (c) => `x ${Math.round(c.x0)}..${Math.round(c.x1)} z ${Math.round(c.z0)}..${Math.round(c.z1)} (${c.n})${c.tex ? ' [' + c.tex + ']' : ''}`;
  console.log(`[${id}] flood cells ${r.cells} · static tris ${r.tris} · lights ${r.lights}`);
  console.log(`  outside every section: ${r.outside.length ? r.outside.map(fmt).join(' | ') : 'none'}`);
  console.log(`  open edges into nothing: ${r.openEdgeCells} cells${r.openEdges.length ? ' — ' + r.openEdges.map(fmt).join(' | ') : ''}`);
  console.log(`  no-collision props on walkable ground (${r.walkThrough.length}): ${r.walkThrough.join('; ') || 'none'}`);
  console.log(`  floating: ${r.floating.join('; ') || 'none'}`);
  console.log(`  sunk: ${r.sunk.join('; ') || 'none'}`);
  console.log(`  lights under the floor: ${r.lightsUnder.join('; ') || 'none'}`);
  for (const [st, R] of Object.entries(r.occ)) for (const dev of Object.keys(R)) { const o = R[dev]; console.log(`  hero fully hidden @${st} ${dev}: ${o.hidden} of ${o.tested} cells (${(o.hidden / Math.max(1, o.tested) * 100).toFixed(1)} %; 2 of 3 rays: ${o.twoOfThree}; within 60 of a crossing bell: ${o.nearBell}) — ${Object.entries(o.bySec).map(([k, v]) => `${k} ${v.hidden}/${v.tested}`).join(' · ')}${o.clusters.length ? '\n      ' + o.clusters.map(fmt).join(' | ') : ''}`); }
  if (r.hall) for (const h of r.hall) console.log(`  last hall @${h.state}: ${h.line}`);
  for (const [st, dr] of Object.entries(r.dropIn ?? {})) console.log(`  drop-in @${st}: ${dr.edges} edge spots, ${dr.flights} flights - ${dr.places.length ? dr.places.map((p) => `${p.what} top ${p.top} (${p.n})`).join('; ') + (id === 'slice0' ? '  [test strip: printed only]' : '') : 'none'}${dr.breakables.length ? ` · breakables a body can come down into (listed apart): ${dr.breakables.map((p) => p.what.replace('breakable ', '')).join(', ')}` : ''}`);
}
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(out, null, 1));
console.log(overs.length ? `\nFAIL (${overs.length} over the limits)\n` + overs.map((m) => ' - ' + m).join('\n') : '\nALL OK (hidden-hero limits, the last hall, drop-in)');
process.exit(overs.length ? 1 : 0);
