// WORLD lane check (docs/v2/AREA_FORMAT.md 10, docs/v2/ENV_KIT.md 13):
//   1. node: validateAll() - names, reachability of spawns / exits / actors / interact / triggers on the kit's own collision, twins, no flat cards
//   2. browser (scene v2c ?area=<id>, prototype rules, software WebGL): each area opens with 0 page errors on fold_open and phone2,
//      a bot walks from the default spawn into EVERY exit box (path from the same reach grid), numbers per spot (static triangles, draw calls, texture memory)
//   3. captures of fixed spots -> /tmp/claude-0/v2/world/shots/<area>_<spot>.png (fold_open only; --shots 0 to skip)
//   4. WORLD-2: every area also in its flagged story states (STATES: ?flags=a,b): opens with 0 page errors, the bot walks into every exit again;
//      extra walks (WALKS): the climb of the bell tower from the door to the bell chamber (stairs, ledges, jumps over the broken floors - the bot
//      jumps at a gap or a ledge and the route is planned again from where it stands after a fall), the ossuary end to end over the wedge;
//      the tower drop test: the hero is dropped on a lattice over the whole tower and must always land on a floor (no pit, no damage).
//   5. WORLD-3: every jump the bot makes is counted (also the one it presses when stuck) and printed per flight of stairs; a jump on a flight,
//      or a stuck-jump anywhere, fails the run. Jumps at gaps and ledges are by design (the broken floors and the half-height ledges of the tower).
//   node tools/v2/world_check.mjs [--devices fold_open,phone2] [--areas eshville_now,eshville_past,graveyard_now] [--shots 1] [--json out.json] [--states 0]
// Headless Chromium renders with SwiftShader: frame times here say nothing about the device. Triangles, draw calls and memory are exact.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { loadPropsNode } from './world_node.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(','), SHOTS = String(args.shots ?? '1') !== '0', OUT = '/tmp/claude-0/v2/world/shots';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
// WORLD-LOOK (2026-11-18): +8,000 triangles and +2 draws for the land beyond the walls (the 'far' chunk; ENV_KIT 23) - the budget was 35,000 / 40 / 30
const BUDGET = { tris: 43000, draws: 42, staticDraws: 32, texMB: 8 }, WITH_STATES = String(args.states ?? '1') !== '0';
const SPOTS = {
  eshville: [['1_outskirts', 330, 150], ['2_outskirts_b', 1160, 150], ['3_street_inn', 1840, 150], ['4_street_smithy', 2660, 150], ['5_square_south', 3900, 220], ['6_square_well', 3900, 640], ['7_church_steps', 3900, 1040], ['8_church_front', 3900, 1440], ['9_grave_road', 4590, 1090]],
  graveyard: [['1_road', 600, 300], ['2_road_b', 600, 700], ['3_gate', 600, 1010], ['4_field', 600, 1300], ['5_field_west', 380, 1540], ['6_mausoleum', 600, 1860]],
  slice0: [['1_garden', 2190, 1250], ['2_yard', 2190, 1860]],
  belltower: [['1_door', 360, 80], ['2_floor1', 200, 320], ['3_roost', 360, 480], ['4_floor3', 200, 640], ['5_floor4', 500, 800], ['6_bell', 360, 1000]],
  ossuary: [['1_entry', 600, 200], ['2_coffins', 600, 560], ['3_wedge', 600, 1120], ['4_arena', 600, 1750], ['5_lamp', 640, 2250], ['6_riddle', 600, 2540], ['7_rest', 500, 2880], ['8_boss', 600, 3250], ['9_posts', 600, 3730]],
};
/** flagged story states opened besides the base state (AREA_FORMAT 13) */
const STATES = {
  eshville_now: ['gate_open', 'bells_answered'], eshville_past: ['past_gate_open'], graveyard_now: ['bell_hung,ossuary_open'], graveyard_past: ['bell_hung'],
  belltower_now: ['fell'], ossuary_now: ['wedge_stone', 'knells_hung,queen_sent'], ossuary_past: ['wedge_stone', 'wedge_wood'],
};
/** walks besides "into every exit": [state, from (spawn name | [x, z]), to (spawn name | [x, z]), what it shows] */
const WALKS = {
  belltower_now: [['', 'default', 'top', 'climbs the tower from the door to the bell chamber'], ['', 'top', [330, 1030], 'walks up to the bell']],
  // (CHAPTER 2026-11-19: in 1697 a wooden screen at z 1494 shuts the inner rooms off behind the gap - they are reached by the bells beyond it, so the walk from the entry ends at the far side of the gap and the inner walk starts at the lantern room)
  ossuary_past: [['wedge_stone', 'default', 'wedge_far', 'walks from the entry over the statue plinth to the far side of the gap'], ['wedge_stone', 'lamp', 'boss', 'walks from the lantern room behind the wooden screen to the last hall'], ['wedge_stone', 'boss', [600, 3740], 'walks to the bell posts'], ['wedge_wood', 'default', 'wedge_far', 'crosses the gap on the crate']],
  ossuary_now: [['wedge_stone', [700, 900], 'boss', 'walks from behind the coffin wall over the statue plinth to the last hall'], ['', 'lamp', [600, 3740], 'walks from the lantern stand to the bell posts']],
  graveyard_now: [['bell_hung,ossuary_open', 'default', 'from_ossuary', 'walks the rebuilt stair up to the ossuary door']],
};
fs.mkdirSync(OUT, { recursive: true });
const fails = [], report = { validate: {}, devices: {} }, fail = (m) => { fails.push(m); console.log('  ✗ ' + m); }, ok = (m) => console.log('  ✓ ' + m);

loadPropsNode();
const { AREAS, validateAll } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const LIST = String(args.areas || 'eshville_now,eshville_past,graveyard_now,graveyard_past,belltower_now,ossuary_now,ossuary_past').split(',');
const flagsOf = (st) => Object.fromEntries(String(st || '').split(',').filter(Boolean).map((f) => [f, true]));

console.log('[validate]');
{
  const R = await validateAll();
  for (const [id, r] of Object.entries(R)) {
    report.validate[id] = r; const s = r.stats;
    if (r.errors.length) for (const e of r.errors) fail(`${id}: ${e}`); else ok(`${id}: errors 0 (warnings ${r.warnings.length}) · static tris ${s.tris} · chunks ${Object.entries(s.chunks).map(([c, q]) => `${c} ${q.tris}/${q.draws}dc`).join(' ')} · lights ${s.lights} · reach cells ${s.reachCells}`);
  }
}
// routes: default spawn -> a point inside each exit box (fat grid: keeps the bot off wall corners; thin grid if the fat one cannot get there)
const ROUTES = {}, WORLDS = {};
const stateKey = (id, st) => (st ? id + '@' + st : id);
for (const id of LIST) for (const st of ['', ...(WITH_STATES ? STATES[id] ?? [] : [])]) {
  const a = await AREAS[id](flagsOf(st)), W = compileEnv(a.stage), d = a.spawns.default, fat = reachGrid(W, d.x, d.z, 26, { onFoot: true }), thin = reachGrid(W, d.x, d.z, 14, { onFoot: true });
  WORLDS[stateKey(id, st)] = { a, W };
  ROUTES[stateKey(id, st)] = a.exits.map((x) => { const g = fat.anyIn(x.x0, x.x1, x.z0, x.z1) ? fat : thin, p = g.anyIn(x.x0 + (x.x1 - x.x0) * 0.3, x.x1, x.z0 + (x.z1 - x.z0) * 0.3, x.z1) ?? g.anyIn(x.x0, x.x1, x.z0, x.z1); return { id: x.id, wps: p ? g.path(p[0], p[1]) : null }; });
}
/** a route on this lane's reach grid from (fx, fz) to (tx, tz): the fat grid keeps the bot off corners, the thin one is the fallback */
function plan(W, fx, fz, tx, tz) {
  for (const R of [26, 14, 8]) { const g = reachGrid(W, fx, fz, R, { onFoot: true }), p = g.reachable(tx, tz) ? [tx, tz] : g.near(tx, tz, 40); if (p) { const w = g.path(p[0], p[1], true); if (w) return w; } }
  return null;
}

const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
async function open(device, query) {
  const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS }), ctx = await browser.newContext(contextOptions(device)), page = await ctx.newPage(), errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/index.html?scene=v2c&${query}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 60000 }).catch(() => errs.push('not ready in 60 s'));
  return { browser, page, errs };
}
const place = (page, x, z, ticks = 50) => page.evaluate(([x, z, ticks]) => {
  const g = window.__game, v = window.__v2, sc = v.scene, h = sc.sim.hero; g._pageHidden = true;
  let gy = -1e9; for (const b of sc.W.boxes) if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > gy) gy = b.y1;   // on the ground of the spot (the tower's floors are above the old drop height)
  if (gy < -1e8) gy = 259;
  h.x = x; h.z = z; h.y = gy + 1; h.vx = h.vz = h.vy = 0; h.onGround = false; h.safe = { x, z, y: gy }; sc.cam.snap = true;
  for (let i = 0; i < ticks; i++) g.tick(1 / 60);
  g.render(); const st = v.stats;
  return { draws: st.gl.draws, tris: st.gl.tris, heroTris: st.hero3d?.tris ?? 0, staticTris: st.env?.visibleStaticTris ?? 0, staticDraws: st.env?.staticDraws ?? 0, chunks: st.env?.visibleChunks ?? 0, texMB: +(st.gl.texBytes / 1048576).toFixed(1), kitTexMB: +((st.env?.kitTexBytes ?? 0) / 1048576).toFixed(1), y: Math.round(h.y), sec: v.section };
}, [x, z, ticks]);
/** start: null = from the default spawn (sim.reset) | [x, z] = put the hero there first | 'stay' = go on from where he stands (after a fall) */
const walk = (page, wps, start = null) => page.evaluate(([wps, start]) => {
  const g = window.__game, v = window.__v2, sc = v.scene, input = g.input; let act = {}; input.setAutoSource(() => act); g._pageHidden = true;
  const ground = (x, z) => { let gy = -1e9; for (const b of sc.W.boxes) if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > gy) gy = b.y1; return gy; };
  if (start !== 'stay') { sc.sim.reset(); sc.areaState.in = {}; if (start) { const h = sc.sim.hero, gy = ground(start[0], start[1]); h.x = start[0]; h.z = start[1]; h.y = gy + 1; h.vx = h.vz = h.vy = 0; h.onGround = false; h.safe = { x: h.x, z: h.z, y: gy }; } }
  sc.cam.snap = true;
  const hp0 = sc.sim.hero.hp, trace = []; let i = 0, stuck = 0, lx = 0, lz = 0, jump = 0, t = 0, fell = false, jumps = 0, minY = 1e9, lock = null; const jlog = [];   // WORLD-3: EVERY jump is counted and logged [x, z, y, why] - also the one pressed when stuck (it used to hide stairs the stick cannot climb)
  for (; t < 9000 && i < wps.length; t++) {
    const h = sc.sim.hero, dx = wps[i][0] - h.x, dz = wps[i][1] - h.z, dd = Math.hypot(dx, dz);
    const exact = Math.abs(ground(wps[i][0], wps[i][1]) - ground(h.x, h.z)) > 1;   // WORLD-3: on a flight (the next cell stands higher or lower) the bot walks the route cell by cell - with the loose 22 it cut the corner at a flight's top and walked into the floor face beside it
    if (dd < (i === wps.length - 1 ? 5 : exact ? 9 : 22)) { i++; continue; }
    const dzn = stuck >= 2 || exact ? 0.5 : 3; act = {}; if (dx > dzn) act.right = true; else if (dx < -dzn) act.left = true; if (dz > dzn) act.up = true; else if (dz < -dzn) act.down = true;   // (WORLD-3: a bot that has not moved for 12 ticks steers exactly - the 3-unit dead zone left it pressing against a corner)
    if (h.y < minY) minY = h.y;
    if (h.onGround && jump <= 0) {   // WORLD-2: a gap before a waypoint at this height, or a ledge higher than a step -> jump
      const gh = ground(h.x, h.z), ga = ground(h.x + dx / dd * 26, h.z + dz / dd * 26), gt = ground(wps[i][0], wps[i][1]);
      if (gt > gh + 90) { fell = true; break; }   // the next waypoint is more than a jump above: the hero fell off the route -> plan again from here
      // jump straight at the edge: along the axis on which the gap or the ledge lies (a diagonal run-up slides off the side of a ledge)
      // a gap = a real drop 26 ahead while the next waypoint is at this height; a ledge = more than two stair steps up 18 ahead while the route goes up
      // (stairs rise 15 per 14: probing further, or with a lower threshold, made the bot hop up the stairs and arrive at a gap in the air)
      const sx = Math.abs(dx) > 3 ? Math.sign(dx) : 0, sz = Math.abs(dz) > 3 ? Math.sign(dz) : 0;
      const gap = (ux, uz) => (ux || uz) && Math.abs(ux ? dx : dz) > 50 && ground(h.x + ux * 26, h.z + uz * 26) < gh - 60 && gt >= gh - 30;   // (WORLD-3: only towards a waypoint beyond the gap - a hop is 60 or more; the drop beside the top of a flight is not a gap to jump)
      const ledge = (ux, uz) => { if (!(ux || uz)) return false; const g2 = ground(h.x + ux * 18, h.z + uz * 18); return g2 > gh + 36 && g2 <= gh + 100 && gt > gh + 16; };
      const why = gap(0, sz) ? ['gap', 'z'] : ledge(0, sz) ? ['ledge', 'z'] : gap(sx, 0) ? ['gap', 'x'] : ledge(sx, 0) ? ['ledge', 'x'] : null;
      if (why) { jump = 20; jumps++; lock = why[1]; jlog.push([Math.round(h.x), Math.round(h.z), Math.round(h.y), why[0]]); }
    }
    if (jump > 0 && lock === 'z') { act.left = act.right = false; } else if (jump > 0 && lock === 'x') { act.up = act.down = false; }
    if (t % 6 === 0) { const m = Math.hypot(h.x - lx, h.z - lz); lx = h.x; lz = h.z; stuck = m < 2 ? stuck + 1 : 0; if (stuck >= 4) { jump = 22; stuck = 0; lock = null; jumps++; jlog.push([Math.round(h.x), Math.round(h.z), Math.round(h.y), 'stuck', wps[i][0], wps[i][1]]); } if (stuck === 3 && h.onGround && ground(wps[i][0], wps[i][1]) > ground(h.x, h.z) + 60) { fell = true; break; } }
    if (jump > 0) { jump--; act.jump = jump > 6; }
    if (t % 4 === 0) { trace.push([t, Math.round(h.x), Math.round(h.z), Math.round(h.y), jump, lock, wps[i][0], wps[i][1]].join(' ')); if (trace.length > 400) trace.shift(); }
    g.tick(1 / 60);
  }
  act = {}; input.setAutoSource(null); for (let k = 0; k < 4; k++) g.tick(1 / 60);
  const h = sc.sim.hero; return { arrived: i >= wps.length, fell, ticks: t, jumps, x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), minY: Math.round(minY), hp: h.hp, hurt: hp0 - h.hp, hits: v.areaInfo.hits.slice(), fired: v.areaInfo.fired.slice(), trace, jlog };
}, [wps, start]);
/** walk from A to B, planning again from where the hero stands whenever he fell off the route (a missed jump) */
async function go(page, W, from, to) {
  let wps = plan(W, from[0], from[1], to[0], to[1]), start = from, ticks = 0, jumps = 0, plans = 0, w = null; const jlog = [];
  for (; plans < 7 && wps; plans++) {
    w = await walk(page, wps, start); ticks += w.ticks; jumps += w.jumps; jlog.push(...w.jlog);
    if (args.trace && !w.arrived) console.log(`      [trace] plan ${plans}: ${w.fell ? 'fell' : 'stopped'} at (${w.x}, ${w.z}, y ${w.y}) — t x z y jump lock -> waypoint\n        ` + w.trace.slice(-Number(args.trace)).join('\n        '));
    if (w.arrived) break;
    start = 'stay'; wps = plan(W, w.x, w.z, to[0], to[1]);
  }
  return { ...(w ?? {}), arrived: !!w?.arrived, ticks, jumps, jlog, plans: plans + (w?.arrived ? 1 : 0), noPath: !wps && !w?.arrived };
}
/**
 * WORLD-3: where the bot jumped. A jump made on a flight of stairs or within 34 of its foot belongs to that flight - and a flight must need none
 * (tools/v2/world_stairs_node.mjs proves the same with the real rules; scene v2c runs the prototype rules, same STEP_UP 18 and hero r 14).
 * -> { flights: [{ name, jumps }], stair: n, other: { gap, ledge, stuck } }
 */
function jumpsPerFlight(a, jlog) {
  const F = a.stage.parts.filter((P) => P.t === 'stairs').map((P) => ({ name: `(${P.x},${P.z}) ${P.dir} y ${P.y ?? 0}→${(P.y ?? 0) + P.h}`, P, jumps: 0 })), other = { gap: 0, ledge: 0, stuck: 0 }; let stair = 0;
  for (const [x, z, y, why] of jlog) {
    const f = F.find(({ P }) => x > P.x - 34 && x < P.x + P.w + 34 && z > P.z - 34 && z < P.z + P.d + 34 && y > (P.y ?? 0) - 20 && y < (P.y ?? 0) + P.h - 4);
    if (f) { f.jumps++; stair++; } else other[why]++;
  }
  return { flights: F.map(({ name, jumps }) => ({ name, jumps })), stair, other };
}
const jumpLine = (J) => `jumps per flight: ${J.flights.length ? J.flights.map((f) => `${f.name}: ${f.jumps}`).join(' · ') : 'no stairs here'} — elsewhere: gaps ${J.other.gap}, ledges ${J.other.ledge}, stuck ${J.other.stuck}`;
/** the tower drop test: dropped anywhere over the tower the hero lands on a floor - never in a pit, never out of the world, never hurt */
const dropTest = (page, x0, x1, z0, z1, step) => page.evaluate(([x0, x1, z0, z1, step]) => {
  const g = window.__game, sc = window.__v2.scene, bad = []; let n = 0; g._pageHidden = true; sc.sim.reset(); const h = sc.sim.hero, hp0 = h.hp;
  for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) {
    h.x = x; h.z = z; h.y = 900; h.vx = h.vz = h.vy = 0; h.onGround = false; h.safe = { x: 360, z: 80, y: 0 }; let t = 0;
    for (; t < 400 && !h.onGround; t++) g.tick(1 / 60);
    n++; if (!h.onGround || h.y < -1 || h.hp < hp0 || Math.abs(h.x - x) > 60 || Math.abs(h.z - z) > 60) { bad.push([x, z, Math.round(h.y), h.hp]); h.hp = hp0; }
  }
  return { n, bad };
}, [x0, x1, z0, z1, step]);

let base = null;
for (const dev of DEVICES) {
  const R = (report.devices[dev] = {});
  if (dev === DEVICES[0]) {   // the test route, for the texture memory comparison
    const { browser, page, errs } = await open(dev, 'x=1');
    try { const n = await place(page, 2190, 1250); base = n.texMB; R.slice0 = n; console.log(`\n[${dev}] slice0 (test route): textures ${n.texMB} MB (kit ${n.kitTexMB}) · ${n.staticTris} static tris · ${n.draws} draws`); if (errs.length) fail(`${dev} slice0: ${errs[0]}`);
      if (SHOTS) for (const [name, x, z] of SPOTS.slice0) { await place(page, x, z, 60); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/slice0_${name}.png` }); }
    } finally { await browser.close(); }
  }
  for (const id0 of LIST) for (const state of ['', ...(WITH_STATES ? STATES[id0] ?? [] : [])]) {
    const id = stateKey(id0, state), base0 = !state;
    console.log(`\n[${dev}] ${id}`);
    const { browser, page, errs } = await open(dev, `area=${id0}&peace=1&areanav=0${state ? '&flags=' + state : ''}`), A = (R[id] = { spots: {}, exits: {}, walks: [] });
    try {
      const st = await page.evaluate(() => ({ ready: window.__v2?.ready, err: window.__v2?.error, area: window.__v2?.areaInfo }));
      if (!st.ready || st.area?.id !== id0) { fail(`${dev} ${id}: did not load ${JSON.stringify(st)}`); continue; }
      ok('opened in scene v2c');
      for (const [name, x, z] of base0 ? SPOTS[id0.split('_')[0]] ?? [] : []) {
        const n = await place(page, x, z, 60); A.spots[name] = n;
        console.log(`    ${name.padEnd(18)} static ${String(n.staticTris).padStart(5)} tris / ${String(n.staticDraws).padStart(2)} draws (${n.chunks} chunks) · frame ${n.tris} tris / ${n.draws} draws (hero ${n.heroTris}) · ${n.sec}`);
        if (n.staticTris > BUDGET.tris) fail(`${dev} ${id} ${name}: ${n.staticTris} static tris > ${BUDGET.tris}`);
        if (n.draws > BUDGET.draws) fail(`${dev} ${id} ${name}: ${n.draws} draws > ${BUDGET.draws}`);
        if (n.staticDraws > BUDGET.staticDraws) fail(`${dev} ${id} ${name}: ${n.staticDraws} static draws > ${BUDGET.staticDraws}`);
        if (SHOTS && dev === DEVICES[0]) { await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${id}_${name}.png` }); }
      }
      const any = Object.values(A.spots)[0]; A.texMB = any?.texMB; A.kitTexMB = any?.kitTexMB;
      if (base != null && any) { const d = +(any.texMB - base).toFixed(1); console.log(`    textures ${any.texMB} MB (test route ${base} MB, ${d >= 0 ? '+' : ''}${d} MB)`); if (d > BUDGET.texMB) fail(`${dev} ${id}: textures +${d} MB over the test route > ${BUDGET.texMB}`); }
      for (const r of ROUTES[id]) {
        const { a, W } = WORLDS[id], d = a.spawns.default, X = a.exits.find((x) => x.id === r.id);
        let from = [d.x, d.z], how = '', pre = null, to = null;   // (nothing is kept on r: the same routes are walked again on the next device)
        if (!r.wps) {   // not reachable on foot from the default spawn in this state: (a) it lies behind something shut -> walk in from the spawn behind it; (b) a whip ring leads there
          const inBox = (g) => g.anyIn(X.x0, X.x1, X.z0, X.z1);
          for (const n of a.entry ?? []) { const s = a.spawns[n], g = s && reachGrid(W, s.x, s.z, 14), p = g && inBox(g); if (p) { from = [s.x, s.z]; to = p; how = ` from spawn ${n} (it lies behind what is shut in this state)`; break; } }
          if (!to) for (const h of a.stage.hookPoints ?? []) {
            const g0 = reachGrid(W, d.x, d.z, 14), base = g0.near(h.x, h.z, 280), g1 = reachGrid(W, h.to[0], h.to[1], 14), p = inBox(g1);
            if (base && p) { pre = base; from = [h.to[0], h.to[1]]; to = p; how = ` by way of whip ring ${h.id} (walked to (${base[0]}, ${base[1]}) under the ring, then set on its landing spot: the prototype rules of scene v2c have no whip)`; break; }
          }
          if (!to) { fail(`${dev} ${id}: no path to exit ${r.id}`); continue; }
        } else to = r.wps[r.wps.length - 1];
        if (pre) { const w0 = await go(page, W, [d.x, d.z], pre); if (!w0.arrived) { fail(`${dev} ${id}: bot did not reach the whip ring on the way to exit ${r.id} - stopped at (${w0.x}, ${w0.z})`); continue; } }
        const w = await go(page, W, from, to); A.exits[r.id] = w;
        if (w.hits?.includes(r.id)) ok(`bot walked into exit ${r.id}${how} (${w.ticks} ticks, ${w.jumps} jumps, triggers ${w.fired.length})`); else fail(`${dev} ${id}: bot did not reach exit ${r.id} - stopped at (${w.x}, ${w.z}) after ${w.ticks} ticks`);
        { const J = jumpsPerFlight(a, w.jlog ?? []); if (J.stair || J.other.stuck) fail(`${dev} ${id}: on the way to exit ${r.id} the bot had to jump ${J.stair}x on stairs and ${J.other.stuck}x because it was stuck — ${jumpLine(J)}`); }
      }
      for (const [wst, from, to, what] of (WALKS[id0] ?? []).filter((w) => w[0] === state)) {
        const { a, W } = WORLDS[id], P = (p) => (typeof p === 'string' ? [a.spawns[p].x, a.spawns[p].z] : p), w = await go(page, W, P(from), P(to)); A.walks.push({ what, ...w });
        const J = jumpsPerFlight(a, w.jlog ?? []); w.jumpsPerFlight = J; A.walks[A.walks.length - 1].jumpsPerFlight = J;
        if (w.arrived) { ok(`bot ${what} (${w.ticks} ticks, ${w.jumps} jumps, planned ${w.plans}x, lowest y ${w.minY}, hurt ${w.hurt})`); console.log('      ' + jumpLine(J)); }
        if (J.stair) fail(`${dev} ${id}: "${what}" needed ${J.stair} jump(s) on stairs (a flight must be walked with the stick alone) — ${jumpLine(J)} — every jump [x, z, y, why]: ${JSON.stringify(w.jlog)}`);
        if (J.other.stuck) fail(`${dev} ${id}: "${what}" pressed jump ${J.other.stuck}x because the bot was stuck (not at a gap or a ledge) at ${JSON.stringify((w.jlog ?? []).filter((j) => j[3] === 'stuck').slice(0, 4))}`);
        if (!w.arrived) fail(`${dev} ${id}: bot did not finish "${what}" - ${w.noPath ? 'no path' : 'stopped'} at (${w.x}, ${w.z}, y ${w.y}) after ${w.ticks} ticks`);
        if (w.arrived && w.hurt > 0) fail(`${dev} ${id}: "${what}" hurt the hero by ${w.hurt} (a fall must never be a pit here)`);
      }
      if (id0.startsWith('belltower') && base0) {
        const d = await dropTest(page, 30, 690, 30, 1250, 60); A.drop = d;
        if (d.bad.length) fail(`${dev} ${id}: drop test - ${d.bad.length} of ${d.n} drops did not land on a floor unhurt: ${JSON.stringify(d.bad.slice(0, 6))}`); else ok(`drop test: ${d.n} drops over the whole tower all landed on a floor, unhurt (a fall never leaves the world)`);
      }
      if (errs.length) for (const e of errs.slice(0, 5)) fail(`${dev} ${id}: ${e}`); else ok('page errors 0');
    } finally { await browser.close(); }
  }
}
srv.close();
if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 1));
console.log(fails.length ? `\nFAIL (${fails.length})\n` + fails.map((f) => ' - ' + f).join('\n') : '\nALL OK');
process.exit(fails.length ? 1 : 0);
