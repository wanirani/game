// FENCE (node, no browser): every fence, railing, balustrade, low wall, stair parapet and gate the kit DRAWS holds the hero where it is drawn.
//   For every area and every flagged state whose geometry differs (areaStates, as world_verify_node):
//   - each fence-like piece is drawn again into a capturing Geo with the kit's own functions (every face, no culling) -> its triangles
//     pieces: stage part t:'fence' (kit fenceAt: iron railing / wooden fence), walls of style 'low' or with rail / piers (dressWall),
//     blocks with a balustrade (kit balustrade), stairs with cheeks (kit stairCheeks), the cemetery gate prop (posts + railing leaves)
//   - the collision is the game's own (compileEnv -> W.boxes), the movement the rules' own (src/v2/play/collide.js moveXZ; hero r 14, body 92 high)
//   1. static: every reachable spot within 70 of a piece on a 5-unit lattice (reach grid flooded from every spawn, ring landing and bell, as
//      world_verify_node; a spot must fit the rules' body square)
//   2. walks: from every 2nd of those spots, 24 directions x { run 7 u/tick, roll 9 u/tick, jump arc (v 822, g 3000 -> apex 112) }, 30 ticks,
//      sliding along with moveXZ, following the ground (step up 18, falls)
//   penetration = 14 - (distance in x,z from the body's centre to the nearest drawn triangle reaching into the body's height span)
//   FAIL (exit 1) when any penetration > 0.5 (the body circle overlaps drawn bars) anywhere.
// node tools/v2/world_fence_node.mjs [--areas a,b] [--json out.json] [--quick]
import fs from 'node:fs';
import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { AREAS, areaStates, stateName } = await import('../../src/v2/world/index.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { Geo } = await import('../../src/v2/env/geo.js');
const K = await import('../../src/v2/env/kit.js');
const { PROPS } = await import('../../src/v2/env/props.js');
await import('../../src/v2/env/props2.js'); await import('../../src/v2/env/props3.js');   // they add their props to PROPS
const { moveXZ, groundAt, STEP_UP } = await import('../../src/v2/play/collide.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const LIST = String(args.areas || Object.keys(AREAS).join(',')).split(',');
const HR = 14, HH = 92, TOL = 0.5, NEAR = 70, LAT = 5, DIRS = 24, TICKS = 30;

/** a Geo that keeps the triangles (x, z of three corners + y span + the 3D corners) instead of writing vertices */
class Cap extends Geo {
  constructor(W) { super(W, { cull: false }); this.T = []; }
  _emit(M, P) { const tri = (a, b, c) => this.T.push([a[0], a[2], b[0], b[2], c[0], c[2], Math.min(a[1], b[1], c[1]), Math.max(a[1], b[1], c[1]), [a, b, c]]); tri(P[0], P[1], P[2]); if (P.length === 4) tri(P[0], P[2], P[3]); this.tris++; }
}
/** the part of a triangle inside the height span lo..hi, as x,z points (Sutherland-Hodgman against two planes) */
function clipY(V, lo, hi) {
  let poly = V;
  for (const [k, s] of [[lo, 1], [hi, -1]]) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], da = (a[1] - k) * s, db = (b[1] - k) * s;
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
    }
    poly = out; if (poly.length < 3) return poly.length ? poly : null;
  }
  return poly;
}
function polyD(px, pz, Q) {   // distance in x,z from a point to a (convex, maybe flat) polygon of 3D points
  let pos = 0, neg = 0, best = Infinity;
  for (let i = 0; i < Q.length; i++) {
    const a = Q[i], b = Q[(i + 1) % Q.length], c = (b[0] - a[0]) * (pz - a[2]) - (b[2] - a[2]) * (px - a[0]);
    if (c > 1e-9) pos++; else if (c < -1e-9) neg++;
    best = Math.min(best, segD2(px, pz, a[0], a[2], b[0], b[2]));
  }
  let area = 0; for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; area += a[0] * b[2] - b[0] * a[2]; }
  if (Math.abs(area) > 1e-6 && (pos === 0 || neg === 0)) return 0;
  return Math.sqrt(best);
}
/** the fence-like pieces of a stage, each drawn into its own capture */
function pieces(S, W) {
  const out = [], cap = (kind, P, fn) => { const G = new Cap(W); fn(G); if (G.T.length) out.push({ kind, P, T: G.T }); };
  for (const P of S.parts) {
    const k = P.kit ?? {};
    if (P.t === 'fence') cap(P.kind === 'wood' ? 'fence.wood' : 'fence.iron', P, (G) => K.fenceAt(G, P));
    else if (P.t === 'wall' && (k.style === 'low' || k.rail || k.piers)) cap(k.rail ? 'lowwall.rail' : 'lowwall', P, (G) => K.dressWall(G, P, []));
    else if (P.t === 'block' && k.balustrade) cap('balustrade', P, (G) => K.balustrade(G, P));
    else if (P.t === 'stairs' && k.cheeks) cap('stair.cheeks', P, (G) => K.stairCheeks(G, P));
    else if ((P.t === 'deco' || P.t === 'prop') && P.mesh === 'cemgate') cap('gate', P, (G) => PROPS.cemgate(G, P.x, P.y ?? 0, P.z, P));
  }
  for (const p of out) {   // bounds + a coarse grid of the triangles (16-unit cells)
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const t of p.T) { x0 = Math.min(x0, t[0], t[2], t[4]); x1 = Math.max(x1, t[0], t[2], t[4]); z0 = Math.min(z0, t[1], t[3], t[5]); z1 = Math.max(z1, t[1], t[3], t[5]); }
    p.bb = { x0, x1, z0, z1 }; p.grid = new Map(); p.over = p.kind === 'gate' ? (p.P.y ?? 0) + 110 : Infinity;   // the gate's iron arch spans the way 150+ up: nothing in the rules holds the hero under it
    p.T.forEach((t, i) => { const a = Math.floor(Math.min(t[0], t[2], t[4]) / 16), b = Math.floor(Math.max(t[0], t[2], t[4]) / 16), c = Math.floor(Math.min(t[1], t[3], t[5]) / 16), d = Math.floor(Math.max(t[1], t[3], t[5]) / 16);
      for (let i2 = a; i2 <= b; i2++) for (let j = c; j <= d; j++) { const key = i2 * 100003 + j; let l = p.grid.get(key); if (!l) p.grid.set(key, (l = [])); l.push(i); } });
  }
  return out;
}
const segD2 = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz; let t = l > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const qx = ax + dx * t - px, qz = az + dz * t - pz; return qx * qx + qz * qz; };
function triD(px, pz, t) {
  const [ax, az, bx, bz, cx, cz] = t, area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  if (Math.abs(area) > 1e-6) { const s1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax), s2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx), s3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx); if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return 0; }
  return Math.sqrt(Math.min(segD2(px, pz, ax, az, bx, bz), segD2(px, pz, bx, bz, cx, cz), segD2(px, pz, cx, cz, ax, az)));
}
/** how deep the body circle at (x, z) with feet y reaches into the drawn piece (> 0 = overlap) */
function pen(p, x, z, y) {
  if (x < p.bb.x0 - HR || x > p.bb.x1 + HR || z < p.bb.z0 - HR || z > p.bb.z1 + HR) return -HR;
  let best = HR; const a = Math.floor((x - HR) / 16), b = Math.floor((x + HR) / 16), c = Math.floor((z - HR) / 16), d = Math.floor((z + HR) / 16), seen = new Set();
  for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) for (const k of p.grid.get(i * 100003 + j) ?? []) {
    if (seen.has(k)) continue; seen.add(k); const t = p.T[k];
    if (t[7] <= y + 0.5 || t[6] >= y + HH || t[6] > p.over) continue;   // on the ground under the feet, over the head, or overhead work (the gate's arch)
    let dd;
    if (t[6] >= y + 0.5 && t[7] <= y + HH) dd = triD(x, z, t);
    else { const Q = clipY(t[8], y + 0.5, y + HH); if (!Q) continue; dd = Q.length < 3 ? Math.sqrt(segD2(x, z, Q[0][0], Q[0][2], Q[Q.length - 1][0], Q[Q.length - 1][2])) : polyD(x, z, Q); }
    if (dd < best) best = dd;
  }
  return HR - best;
}
const fits = (Wl, x, z, g) => { for (const b of Wl.boxes) if (b.solid && x + HR > b.x0 && x - HR < b.x1 && z + HR > b.z0 && z - HR < b.z1 && b.y1 > g + STEP_UP && b.y0 < g + HH) return false; return true; };
const localW = (W, bb, m = 260) => ({ boxes: W.boxes.filter((b) => b.x1 > bb.x0 - m && b.x0 < bb.x1 + m && b.z1 > bb.z0 - m && b.z0 < bb.z1 + m) });

function walk(Wl, p, x, z, g, ang, mode) {
  const e = { x, z, y: g, r: HR, h: HH }, sp = mode === 'roll' ? 9 : 7, c = Math.cos(ang), s = Math.sin(ang), vx = Math.abs(c) < 1e-9 ? 0 : c * sp, vz = Math.abs(s) < 1e-9 ? 0 : s * sp;
  let worst = -HR, at = null, vy = mode === 'jump' ? 822 / 60 : 0, air = mode === 'jump';
  for (let t = 0; t < TICKS; t++) {
    const px = e.x, pz = e.z; moveXZ(Wl, e, vx, vz);
    // the rules snap a body that is already inside a box (it fell into a prop's top from a jump) out to the box's near face, whatever is there:
    // that is the rules' landing, not this piece's line - the walk ends there (counted as snaps)
    if ((e.x - px) * Math.sign(vx || 1) < -0.01 || (e.z - pz) * Math.sign(vz || 1) < -0.01 || Math.abs(e.x - px) > Math.abs(vx) + 0.01 || Math.abs(e.z - pz) > Math.abs(vz) + 0.01) { SNAPS++; break; }
    if (air) { e.y += vy; vy -= 3000 / 3600; const gg = groundAt(Wl, e.x, e.z, e.y + STEP_UP); if (vy < 0 && Number.isFinite(gg) && e.y <= gg) { e.y = gg; air = false; } }
    else { const gg = groundAt(Wl, e.x, e.z, e.y + STEP_UP); if (!Number.isFinite(gg)) break; e.y = gg; }
    const q = pen(p, e.x, e.z, e.y); if (q > worst) { worst = q; at = [Math.round(e.x), Math.round(e.z), Math.round(e.y), mode, Math.round(ang * 180 / Math.PI)]; }
  }
  return [worst, at];
}

const res = {}; let fail = 0, nPieces = 0, SNAPS = 0;
for (const id of LIST) {
  const seenGeo = new Set(); res[id] = {};
  for (const flags of areaStates(id)) {
    const a = await AREAS[id](flags), W = compileEnv(a.stage), st = stateName(flags);
    const P = pieces(a.stage, W);
    const geo = P.map((p) => p.T.length).join(',') + '#' + W.boxes.map((b) => [b.x0, b.x1, b.z0, b.z1, b.y0, b.y1, +b.solid, +b.walk].join(',')).join('|');
    if (seenGeo.has(geo)) continue; seenGeo.add(geo);
    const bells = a.interact.filter((it) => it.kind === 'bell' && it.event === 'bell.ring');
    const seeds = [...Object.values(a.spawns).map((s) => [s.x, s.z]), ...(a.stage.hookPoints ?? []).filter((h) => h.to).map((h) => h.to), ...bells.map((b) => [b.x, b.z])];
    const g = reachGrid(W, 0, 0, HR, { noStart: true, seeds, hooks: a.stage.hookPoints ?? [] });
    const R = res[id][st] = [];
    for (const p of P) {
      nPieces++;
      const Wl = localW(W, p.bb), r = { kind: p.kind, at: p.P.t === 'fence' ? `${p.P.x0},${p.P.z0}->${p.P.x1},${p.P.z1}` : `${p.P.x},${p.P.z} ${p.P.w ?? ''}x${p.P.d ?? ''}`, spots: 0, staticPen: -HR, staticAt: null, walkPen: -HR, walkAt: null, walks: 0 };
      const spots = [];
      for (let x = Math.floor((p.bb.x0 - NEAR) / LAT) * LAT; x <= p.bb.x1 + NEAR; x += LAT) for (let z = Math.floor((p.bb.z0 - NEAR) / LAT) * LAT; z <= p.bb.z1 + NEAR; z += LAT) {
        if (!g.reachable(x, z)) continue;
        const gy = groundAt(Wl, x, z); if (!Number.isFinite(gy) || !fits(Wl, x, z, gy)) continue;
        spots.push([x, z, gy]); const q = pen(p, x, z, gy); if (q > r.staticPen) { r.staticPen = q; r.staticAt = [x, z, gy]; }
      }
      r.spots = spots.length;
      const step = args.quick ? 4 : 2;
      for (let i = 0; i < spots.length; i += step) {
        const [x, z, gy] = spots[i]; if (pen(p, x, z, gy) < -40) continue;   // only spots within 54 of the piece start a walk
        for (let d = 0; d < DIRS; d++) for (const mode of ['run', 'roll', 'jump']) { const [q, at] = walk(Wl, p, x, z, gy, d * 2 * Math.PI / DIRS, mode); r.walks++; if (q > r.walkPen) { r.walkPen = q; r.walkAt = at; } }
      }
      r.staticPen = +r.staticPen.toFixed(2); r.walkPen = +r.walkPen.toFixed(2);
      r.ok = r.staticPen <= TOL && r.walkPen <= TOL; if (!r.ok) fail++;
      R.push(r);
      console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${id.padEnd(15)} ${st.slice(0, 28).padEnd(28)} ${r.kind.padEnd(13)} ${r.at.padEnd(26)} spots ${String(r.spots).padStart(5)} walks ${String(r.walks).padStart(6)}  overlap static ${String(r.staticPen).padStart(6)} walk ${String(r.walkPen).padStart(6)}${r.ok ? '' : '  worst at ' + JSON.stringify(r.walkPen > r.staticPen ? r.walkAt : r.staticAt)}`);
    }
  }
}
console.log(`\nwalks ended by the rules' snap out of a box they fell into (not counted): ${SNAPS}`);
console.log(`${nPieces} drawn pieces checked (areas x geometry states); ${fail} hold the hero inside what is drawn (overlap > ${TOL}: the body circle r ${HR} overlaps the drawn bars).`);
if (args.json) fs.writeFileSync(args.json, JSON.stringify(res, null, 1));
process.exit(fail ? 1 : 0);
