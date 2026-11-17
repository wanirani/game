// WORLD lane check (docs/v2/AREA_FORMAT.md 10, docs/v2/ENV_KIT.md 13):
//   1. node: validateAll() - names, reachability of spawns / exits / actors / interact / triggers on the kit's own collision, twins, no flat cards
//   2. browser (scene v2c ?area=<id>, prototype rules, software WebGL): each area opens with 0 page errors on fold_open and phone2,
//      a bot walks from the default spawn into EVERY exit box (path from the same reach grid), numbers per spot (static triangles, draw calls, texture memory)
//   3. captures of fixed spots -> /tmp/claude-0/v2/world/shots/<area>_<spot>.png (fold_open only; --shots 0 to skip)
//   node tools/v2/world_check.mjs [--devices fold_open,phone2] [--areas eshville_now,eshville_past,graveyard_now] [--shots 1] [--json out.json]
// Headless Chromium renders with SwiftShader: frame times here say nothing about the device. Triangles, draw calls and memory are exact.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { loadPropsNode } from './world_node.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(','), SHOTS = String(args.shots ?? '1') !== '0', OUT = '/tmp/claude-0/v2/world/shots';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const BUDGET = { tris: 35000, draws: 40, texMB: 8 };
const SPOTS = {
  eshville: [['1_outskirts', 330, 150], ['2_outskirts_b', 1160, 150], ['3_street_inn', 1840, 150], ['4_street_smithy', 2660, 150], ['5_square_south', 3900, 220], ['6_square_well', 3900, 640], ['7_church_steps', 3900, 1040], ['8_church_front', 3900, 1440], ['9_grave_road', 4590, 1090]],
  graveyard: [['1_road', 600, 300], ['2_road_b', 600, 700], ['3_gate', 600, 1010], ['4_field', 600, 1300], ['5_field_west', 380, 1540], ['6_mausoleum', 600, 1860]],
  slice0: [['1_garden', 2190, 1250], ['2_yard', 2190, 1860]],
};
fs.mkdirSync(OUT, { recursive: true });
const fails = [], report = { validate: {}, devices: {} }, fail = (m) => { fails.push(m); console.log('  ✗ ' + m); }, ok = (m) => console.log('  ✓ ' + m);

loadPropsNode();
const { AREAS, validateAll } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const LIST = String(args.areas || 'eshville_now,eshville_past,graveyard_now,graveyard_past').split(',');

console.log('[validate]');
{
  const R = await validateAll();
  for (const [id, r] of Object.entries(R)) {
    report.validate[id] = r; const s = r.stats;
    if (r.errors.length) for (const e of r.errors) fail(`${id}: ${e}`); else ok(`${id}: errors 0 (warnings ${r.warnings.length}) · static tris ${s.tris} · chunks ${Object.entries(s.chunks).map(([c, q]) => `${c} ${q.tris}/${q.draws}dc`).join(' ')} · lights ${s.lights} · reach cells ${s.reachCells}`);
  }
}
// routes: default spawn -> a point inside each exit box (fat grid: keeps the bot off wall corners; thin grid if the fat one cannot get there)
const ROUTES = {};
for (const id of LIST) {
  const a = await AREAS[id](), W = compileEnv(a.stage), d = a.spawns.default, fat = reachGrid(W, d.x, d.z, 26), thin = reachGrid(W, d.x, d.z, 14);
  ROUTES[id] = a.exits.map((x) => { const g = fat.anyIn(x.x0, x.x1, x.z0, x.z1) ? fat : thin, p = g.anyIn(x.x0 + (x.x1 - x.x0) * 0.3, x.x1, x.z0 + (x.z1 - x.z0) * 0.3, x.z1) ?? g.anyIn(x.x0, x.x1, x.z0, x.z1); return { id: x.id, wps: p ? g.path(p[0], p[1]) : null }; });
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
  h.x = x; h.z = z; h.y = 260; h.vx = h.vz = h.vy = 0; h.onGround = false; h.safe = { x, z, y: 0 }; sc.cam.snap = true;
  for (let i = 0; i < ticks; i++) g.tick(1 / 60);
  g.render(); const st = v.stats;
  return { draws: st.gl.draws, tris: st.gl.tris, heroTris: st.hero3d?.tris ?? 0, staticTris: st.env?.visibleStaticTris ?? 0, staticDraws: st.env?.staticDraws ?? 0, chunks: st.env?.visibleChunks ?? 0, texMB: +(st.gl.texBytes / 1048576).toFixed(1), kitTexMB: +((st.env?.kitTexBytes ?? 0) / 1048576).toFixed(1), y: Math.round(h.y), sec: v.section };
}, [x, z, ticks]);
const walk = (page, wps) => page.evaluate(([wps]) => {
  const g = window.__game, v = window.__v2, sc = v.scene, input = g.input; let act = {}; input.setAutoSource(() => act); g._pageHidden = true;
  sc.sim.reset(); sc.cam.snap = true; sc.areaState.in = {};
  let i = 0, stuck = 0, lx = 0, lz = 0, jump = 0, t = 0;
  for (; t < 9000 && i < wps.length; t++) {
    const h = sc.sim.hero, dx = wps[i][0] - h.x, dz = wps[i][1] - h.z;
    if (Math.hypot(dx, dz) < (i === wps.length - 1 ? 5 : 22)) { i++; continue; }
    act = {}; if (dx > 3) act.right = true; else if (dx < -3) act.left = true; if (dz > 3) act.up = true; else if (dz < -3) act.down = true;
    if (t % 6 === 0) { const m = Math.hypot(h.x - lx, h.z - lz); lx = h.x; lz = h.z; stuck = m < 2 ? stuck + 1 : 0; if (stuck >= 4) { jump = 22; stuck = 0; } }
    if (jump > 0) { jump--; act.jump = jump > 8; }
    g.tick(1 / 60);
  }
  act = {}; input.setAutoSource(null); for (let k = 0; k < 4; k++) g.tick(1 / 60);
  const h = sc.sim.hero; return { arrived: i >= wps.length, ticks: t, x: Math.round(h.x), z: Math.round(h.z), hp: h.hp, hits: v.areaInfo.hits.slice(), fired: v.areaInfo.fired.slice() };
}, [wps]);

let base = null;
for (const dev of DEVICES) {
  const R = (report.devices[dev] = {});
  if (dev === DEVICES[0]) {   // the test route, for the texture memory comparison
    const { browser, page, errs } = await open(dev, 'x=1');
    try { const n = await place(page, 2190, 1250); base = n.texMB; R.slice0 = n; console.log(`\n[${dev}] slice0 (test route): textures ${n.texMB} MB (kit ${n.kitTexMB}) · ${n.staticTris} static tris · ${n.draws} draws`); if (errs.length) fail(`${dev} slice0: ${errs[0]}`);
      if (SHOTS) for (const [name, x, z] of SPOTS.slice0) { await place(page, x, z, 60); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/slice0_${name}.png` }); }
    } finally { await browser.close(); }
  }
  for (const id of LIST) {
    console.log(`\n[${dev}] ${id}`);
    const { browser, page, errs } = await open(dev, `area=${id}&peace=1&areanav=0`), A = (R[id] = { spots: {}, exits: {} });
    try {
      const st = await page.evaluate(() => ({ ready: window.__v2?.ready, err: window.__v2?.error, area: window.__v2?.areaInfo }));
      if (!st.ready || st.area?.id !== id) { fail(`${dev} ${id}: did not load ${JSON.stringify(st)}`); continue; }
      ok('opened in scene v2c');
      for (const [name, x, z] of SPOTS[id.split('_')[0]] ?? []) {
        const n = await place(page, x, z, 60); A.spots[name] = n;
        console.log(`    ${name.padEnd(18)} static ${String(n.staticTris).padStart(5)} tris / ${String(n.staticDraws).padStart(2)} draws (${n.chunks} chunks) · frame ${n.tris} tris / ${n.draws} draws (hero ${n.heroTris}) · ${n.sec}`);
        if (n.staticTris > BUDGET.tris) fail(`${dev} ${id} ${name}: ${n.staticTris} static tris > ${BUDGET.tris}`);
        if (n.draws > BUDGET.draws) fail(`${dev} ${id} ${name}: ${n.draws} draws > ${BUDGET.draws}`);
        if (SHOTS && dev === DEVICES[0]) { await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${id}_${name}.png` }); }
      }
      const any = Object.values(A.spots)[0]; A.texMB = any?.texMB; A.kitTexMB = any?.kitTexMB;
      if (base != null && any) { const d = +(any.texMB - base).toFixed(1); console.log(`    textures ${any.texMB} MB (test route ${base} MB, ${d >= 0 ? '+' : ''}${d} MB)`); if (d > BUDGET.texMB) fail(`${dev} ${id}: textures +${d} MB over the test route > ${BUDGET.texMB}`); }
      for (const r of ROUTES[id]) {
        if (!r.wps) { fail(`${dev} ${id}: no path to exit ${r.id}`); continue; }
        const w = await walk(page, r.wps); A.exits[r.id] = w;
        if (w.hits.includes(r.id)) ok(`bot walked into exit ${r.id} (${w.ticks} ticks, ${r.wps.length} waypoints, triggers ${w.fired.length})`); else fail(`${dev} ${id}: bot did not reach exit ${r.id} - stopped at (${w.x}, ${w.z}) after ${w.ticks} ticks`);
      }
      if (errs.length) for (const e of errs.slice(0, 5)) fail(`${dev} ${id}: ${e}`); else ok('page errors 0');
    } finally { await browser.close(); }
  }
}
srv.close();
if (args.json) fs.writeFileSync(args.json, JSON.stringify(report, null, 1));
console.log(fails.length ? `\nFAIL (${fails.length})\n` + fails.map((f) => ' - ' + f).join('\n') : '\nALL OK');
process.exit(fails.length ? 1 : 0);
