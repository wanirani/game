// WORLD-3 (node, no browser): every flight of stairs of every area is climbed and descended with the STICK ALONE under the real rules
// (src/v2/play/sim.js + collide.js: hero half-width r 14, STEP_UP 18, STEP_DOWN 20) - no jump is ever pressed here.
//   up:   the hero stands 30 before the foot, the stick is held along the flight's dir for at most 400 ticks -> he must stand on the top (y >= y0 + h - 0.5)
//   down: from 30 beyond the top the stick is held the other way -> he must reach the foot's ground, never leaving the ground for more than 3 ticks
//         (a walked step down is one airless snap; a fall is not walking)
//   both at the flight's centre line and 16 inside each edge (a hero hugging the cheek wall or the open side)
// Also the static rule the flights are built to: rise <= STEP_UP and tread > hero r (his body touches the step after the next when a tread is shallower).
//   node tools/v2/world_stairs_node.mjs [--areas a,b] [--v 1]
import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { AREAS, areaStates, stateName } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { Sim } = await import('../../src/v2/play/index.js');
const { groundAt, STEP_UP } = await import('../../src/v2/play/collide.js');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const LIST = String(args.areas || Object.keys(AREAS).join(',')).split(','), DT = 1 / 60, HR = 14;
let bad = 0, flights = 0; const seen = new Set();
const DIR = { 'x+': [1, 0], 'x-': [-1, 0], 'z+': [0, 1], 'z-': [0, -1] };
function run(W, x, z, y, mx, mz, done, ticks = 400) {
  const sim = new Sim({ ...W, spawns: [], start: { x, z } }, {}), h = sim.hero;
  h.x = x; h.z = z; h.y = y; h.vx = h.vz = h.vy = 0; h.onGround = true; h.safe = { x, z, y };
  let air = 0, airMax = 0, t = 0;
  for (; t < ticks; t++) { sim.update(DT, { mx, mz }); air = h.onGround ? 0 : air + 1; airMax = Math.max(airMax, air); if (done(h)) break; }
  return { t, x: h.x, z: h.z, y: h.y, airMax, ok: done(h) };
}
for (const id of LIST) for (const flags of areaStates(id)) {
  const a = await AREAS[id](flags), W = compileEnv(a.stage);
  for (const P of a.stage.parts) {
    if (P.t !== 'stairs') continue;
    const key = [id, P.x, P.z, P.w, P.d, P.y ?? 0, P.h, P.dir].join(' '); if (seen.has(key)) continue; seen.add(key); flights++;
    const n = P.steps ?? Math.max(2, Math.round(P.h / 12)), y0 = P.y ?? 0, [ux, uz] = DIR[P.dir], alongX = ux !== 0, len = alongX ? P.w : P.d, wid = alongX ? P.d : P.w, rise = P.h / n, tread = len / n;
    const foot = alongX ? (ux > 0 ? P.x : P.x + P.w) : (uz > 0 ? P.z : P.z + P.d), top = foot + (alongX ? ux : uz) * len, c0 = alongX ? P.z : P.x;
    const res = [], tag = `${id}${stateName(flags) === 'base' ? '' : '@' + stateName(flags)} stairs (${P.x},${P.z}) ${P.dir} y ${y0}→${y0 + P.h}: ${n} steps, rise ${rise.toFixed(1)}, tread ${tread.toFixed(1)}`;
    let ok = rise <= STEP_UP && tread > HR; if (!ok) res.push(`rule broken (needs rise <= ${STEP_UP} and tread > ${HR})`);
    for (const off of [wid / 2, 16, wid - 16]) {
      const c = c0 + off, at = (s) => (alongX ? [s, c] : [c, s]);
      const [fx, fz] = at(foot - (alongX ? ux : uz) * 30), gf = groundAt(W, fx, fz, y0 + STEP_UP);
      if (!Number.isFinite(gf) || Math.abs(gf - y0) > STEP_UP) { res.push(`off ${off}: no ground at the foot (${fx},${fz})`); ok = false; continue; }
      const up = run(W, fx, fz, gf, ux, uz, (h) => h.onGround && h.y >= y0 + P.h - 0.5);
      if (!up.ok) { ok = false; res.push(`off ${off}: UP stops at (${up.x.toFixed(0)}, ${up.z.toFixed(0)}, y ${up.y.toFixed(1)}) after ${up.t} ticks`); continue; }
      // down: start on the top step's far end (where the floor above meets it), stick the other way
      const [tx, tz] = at(top - (alongX ? ux : uz) * 6), dn = run(W, tx, tz, y0 + P.h, -ux, -uz, (h) => h.onGround && h.y <= gf + 0.5);
      if (!dn.ok || dn.airMax > 3) { ok = false; res.push(`off ${off}: DOWN ${dn.ok ? 'left the ground for ' + dn.airMax + ' ticks' : 'stops at (' + dn.x.toFixed(0) + ', ' + dn.z.toFixed(0) + ', y ' + dn.y.toFixed(1) + ')'}`); continue; }
      res.push(`off ${Math.round(off)}: up ${up.t} ticks, down ${dn.t} ticks`);
    }
    console.log(`${ok ? '  ✓' : '  ✗'} ${tag} — 0 jumps — ${res.join(' · ')}`); if (!ok) bad++;
  }
}
console.log(bad ? `FAIL: ${bad} of ${flights} flights cannot be walked with the stick alone` : `ALL OK: ${flights} flights walked up and down with the stick alone (0 jumps)`);
process.exit(bad ? 1 : 0);
