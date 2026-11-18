// WORLD lane check (docs/v2/AREA_FORMAT.md 10, docs/v2/ENV_KIT.md 13):
//   1. node: validateAll() - names, reachability of spawns / exits / actors / interact / triggers on the kit's own collision, twins, no flat cards
//   2. browser (scene v2c ?area=<id>, prototype rules, software WebGL): each area opens with 0 page errors on fold_open and phone2,
//      a bot walks from the default spawn into EVERY exit box (path from the same reach grid), numbers per spot (static triangles, draw calls, texture memory)
//   3. captures of fixed spots -> /tmp/claude-0/v2/world/shots/<area>_<spot>.png (fold_open only; --shots 0 to skip)
//   4. WORLD-2: every area also in its flagged story states (STATES: ?flags=a,b): opens with 0 page errors, the bot walks into every exit again;
//      extra walks (WALKS): the climb of the bell tower from the door to the bell chamber (stairs, ledges, jumps over the broken floors - the bot
//      jumps at a gap or a ledge and the route is planned again from where it stands after a fall), the ossuary end to end over the wedge;
//      the tower drop test: the hero is dropped on a lattice over the whole tower and must always land on a floor (no pit, no damage).
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
const BUDGET = { tris: 35000, draws: 40, staticDraws: 30, texMB: 8 }, WITH_STATES = String(args.states ?? '1') !== '0';
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
  ossuary_past: [['wedge_stone', 'default', 'boss', 'walks from the entry over the statue plinth to the last hall'], ['wedge_stone', 'boss', [600, 3740], 'walks to the bell posts'], ['wedge_wood', 'default', 'wedge_far', 'crosses the gap on the crate']],
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
  const a = await AREAS[id](flagsOf(st)), W = compileEnv(a.stage), d = a.spawns.default, fat = reachGrid(W, d.x, d.z, 26), thin = reachGrid(W, d.x, d.z, 14);
  WORLDS[stateKey(id, st)] = { a, W };
  ROUTES[stateKey(id, st)] = a.exits.map((x) => { const g = fat.anyIn(x.x0, x.x1, x.z0, x.z1) ? fat : thin, p = g.anyIn(x.x0 + (x.x1 - x.x0) * 0.3, x.x1, x.z0 + (x.z1 - x.z0) * 0.3, x.z1) ?? g.anyIn(x.x0, x.x1, x.z0, x.z1); return { id: x.id, wps: p ? g.path(p[0], p[1]) : null }; });
}
/** a route on this lane's reach grid from (fx, fz) to (tx, tz): the fat grid keeps the bot off corners, the thin one is the fallback */
function plan(W, fx, fz, tx, tz) {
  for (const R of [26, 14, 8]) { const g = reachGrid(W, fx, fz, R), p = g.reachable(tx, tz) ? [tx, tz] : g.near(tx, tz, 40); if (p) { const w = g.path(p[0], p[1], true); if (w) return w; } }
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
  const hp0 = sc.sim.hero.hp; let i = 0, stuck = 0, lx = 0, lz = 0, jump = 0, t = 0, fell = false, jumps = 0, minY = 1e9, lock = null;
  for (; t < 9000 && i < wps.length; t++) {
    const h = sc.sim.hero, dx = wps[i][0] - h.x, dz = wps[i][1] - h.z, dd = Math.hypot(dx, dz);
    if (dd < (i === wps.length - 1 ? 5 : 22)) { i++; continue; }
    act = {}; if (dx > 3) act.right = true; else if (dx < -3) act.left = true; if (dz > 3) act.up = true; else if (dz < -3) act.down = true;
    if (h.y < minY) minY = h.y;
    if (h.onGround && jump <= 0) {   // WORLD-2: a gap before a waypoint at this height, or a ledge higher than a step -> jump
      const gh = ground(h.x, h.z), ga = ground(h.x + dx / dd * 26, h.z + dz / dd * 26), gt = ground(wps[i][0], wps[i][1]);
      if (gt > gh + 90) { fell = true; break; }   // the next waypoint is more than a jump above: the hero fell off the route -> plan again from here
      // jump straight at the edge: along the axis on which the gap or the ledge lies (a diagonal run-up slides off the side of a ledge)
      const need = (g2) => (g2 < gh - 30 && gt >= gh - 30) || (g2 > gh + 16 && g2 <= gh + 100);
      const gz = Math.abs(dz) > 3 ? ground(h.x, h.z + Math.sign(dz) * 26) : gh, gx = Math.abs(dx) > 3 ? ground(h.x + Math.sign(dx) * 26, h.z) : gh;
      if (need(gz)) { jump = 20; jumps++; lock = 'z'; } else if (need(gx)) { jump = 20; jumps++; lock = 'x'; } else if (need(ga)) { jump = 20; jumps++; lock = null; }
    }
    if (jump > 0 && lock === 'z') { act.left = act.right = false; } else if (jump > 0 && lock === 'x') { act.up = act.down = false; }
    if (t % 6 === 0) { const m = Math.hypot(h.x - lx, h.z - lz); lx = h.x; lz = h.z; stuck = m < 2 ? stuck + 1 : 0; if (stuck >= 4) { jump = 22; stuck = 0; } if (stuck === 3 && h.onGround && ground(wps[i][0], wps[i][1]) > ground(h.x, h.z) + 60) { fell = true; break; } }
    if (jump > 0) { jump--; act.jump = jump > 6; }
    g.tick(1 / 60);
  }
  act = {}; input.setAutoSource(null); for (let k = 0; k < 4; k++) g.tick(1 / 60);
  const h = sc.sim.hero; return { arrived: i >= wps.length, fell, ticks: t, jumps, x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), minY: Math.round(minY), hp: h.hp, hurt: hp0 - h.hp, hits: v.areaInfo.hits.slice(), fired: v.areaInfo.fired.slice() };
}, [wps, start]);
/** walk from A to B, planning again from where the hero stands whenever he fell off the route (a missed jump) */
async function go(page, W, from, to) {
  let wps = plan(W, from[0], from[1], to[0], to[1]), start = from, ticks = 0, jumps = 0, plans = 0, w = null;
  for (; plans < 7 && wps; plans++) {
    w = await walk(page, wps, start); ticks += w.ticks; jumps += w.jumps;
    if (w.arrived) break;
    start = 'stay'; wps = plan(W, w.x, w.z, to[0], to[1]);
  }
  return { ...(w ?? {}), arrived: !!w?.arrived, ticks, jumps, plans: plans + (w?.arrived ? 1 : 0), noPath: !wps && !w?.arrived };
}
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
        if (!r.wps) { fail(`${dev} ${id}: no path to exit ${r.id}`); continue; }
        const w = await walk(page, r.wps); A.exits[r.id] = w;
        if (w.hits.includes(r.id)) ok(`bot walked into exit ${r.id} (${w.ticks} ticks, ${r.wps.length} waypoints, triggers ${w.fired.length})`); else fail(`${dev} ${id}: bot did not reach exit ${r.id} - stopped at (${w.x}, ${w.z}) after ${w.ticks} ticks`);
      }
      for (const [wst, from, to, what] of (WALKS[id0] ?? []).filter((w) => w[0] === state)) {
        const { a, W } = WORLDS[id], P = (p) => (typeof p === 'string' ? [a.spawns[p].x, a.spawns[p].z] : p), w = await go(page, W, P(from), P(to)); A.walks.push({ what, ...w });
        if (w.arrived) ok(`bot ${what} (${w.ticks} ticks, ${w.jumps} jumps, planned ${w.plans}x, lowest y ${w.minY}, hurt ${w.hurt})`); else fail(`${dev} ${id}: bot did not finish "${what}" - ${w.noPath ? 'no path' : 'stopped'} at (${w.x}, ${w.z}, y ${w.y}) after ${w.ticks} ticks`);
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
