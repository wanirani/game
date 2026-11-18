// WORLD-3 (node): nearestFreeSpot(area, W, x, z) of src/v2/world - a bell crossing never lands the hero inside something.
//   for both ossuary nights and both graveyard nights, in the wedge / bell states: from every standable spot within r of every crossing bell (20-unit
//   lattice) the same x, z in the twin night -> the helper must return a spot that is standable (clear of solids by 14), reachable and at most 200 away;
//   plus fixed points inside known solids (a coffin stack, the coffin wall, a side wall, the gap).      node tools/v2/world_spot_test.mjs
import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { AREAS, nearestFreeSpot, stateName } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
for (const [A, B, states] of [['ossuary_now', 'ossuary_past', [{}, { wedge_stone: true }, { wedge_wood: true }]], ['ossuary_past', 'ossuary_now', [{}, { wedge_stone: true }, { wedge_wood: true }]], ['graveyard_now', 'graveyard_past', [{ bell_hung: true }]], ['graveyard_past', 'graveyard_now', [{ bell_hung: true }]]]) for (const fl of states) {
  const a = await AREAS[A](fl), b = await AREAS[B](fl), Wa = compileEnv(a.stage), Wb = compileEnv(b.stage), ga = nearestFreeSpot(a, Wa, a.spawns.default.x, a.spawns.default.z).grid; let grid = null, n = 0, moved = 0, far = 0;
  for (const it of a.interact.filter((i) => i.kind === 'bell' && i.event === 'bell.ring')) for (let x = it.x - it.r; x <= it.x + it.r; x += 20) for (let z = it.z - it.r; z <= it.z + it.r; z += 20) {
    if (Math.hypot(x - it.x, z - it.z) > it.r || !ga.reachable(x, z) || ga.blocked(x, z, 14)) continue;
    const s = nearestFreeSpot(b, Wb, x, z, { grid }); n++; grid = s?.grid ?? grid;
    ok(!!s && !s.grid.blocked(s.x, s.z, 14) && s.grid.reachable(s.x, s.z) && s.moved <= 200 && Number.isFinite(s.y), `${A}@${stateName(fl)} bell ${it.id} from (${x},${z}) -> ${B}: ${s ? `(${s.x},${s.z}) moved ${s.moved}` : 'null'}`);
    if (s?.moved) { moved++; far = Math.max(far, s.moved); }
  }
  console.log(`${A}@${stateName(fl)} -> ${B}: ${n} crossing spots, ${moved} would land inside something and are moved (furthest ${far})`);
}
{ const a = await AREAS.ossuary_now(), W = compileEnv(a.stage);
  for (const [x, z, what] of [[190, 1640, 'inside a coffin stack'], [600, 700, 'inside the coffin wall'], [40, 2000, 'inside the side wall'], [600, 1300, 'over the gap'], [600, 3350, 'the middle of the last hall (free)']]) { const s = nearestFreeSpot(a, W, x, z); ok(!!s && !s.grid.blocked(s.x, s.z, 14) && (what.includes('free') ? s.moved === 0 : s.moved > 0), `ossuary_now ${what} (${x},${z})`); console.log(`ossuary_now ${what} (${x},${z}) -> ${s ? `(${s.x},${s.z}) y ${s.y}, moved ${s.moved}` : 'null'}`); } }
console.log(fail ? `FAIL: ${fail} of ${pass + fail}` : `ALL OK: ${pass} spots`);
process.exit(fail ? 1 : 0);
