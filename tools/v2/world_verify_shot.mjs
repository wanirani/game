// WORLD-VERIFY (browser, scene v2c ?area=<id>, software WebGL - frame times mean nothing here):
//   per device (fold_open, phone2) and area: load time, GL memory, static triangles; REAL touch (CDP touch events on the virtual stick):
//   push from every spawn along its face, steer the last stretch into every exit box; worst view over a lattice of standable spots;
//   captures of fixed spots (fold_open); enter / leave five times and compare GL bytes and canvases.
//   node tools/v2/world_verify_shot.mjs [--devices fold_open,phone2] [--areas a,b] [--out dir] [--json file] [--cycle eshville_now]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';
import { freeze } from '../qa/lib/step.mjs';
import { loadPropsNode } from './world_node.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(','), OUT = String(args.out || '/tmp/claude-0/v2/worldverify/shots');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const SPOTS = {
  eshville: [['1_outskirts', 330, 150], ['3_street_inn', 1840, 150], ['6_square_well', 3900, 640], ['8_church_front', 3900, 1440], ['9_grave_road', 4590, 1090], ['x_bell_behind', 4250, 1450]],
  graveyard: [['1_road', 600, 300], ['3_gate', 600, 1010], ['4_field', 600, 1300], ['5_field_west', 300, 1150], ['6_mausoleum', 600, 1860], ['x_hut_behind', 900, 1250]],
  slice0: [['1_street', 420, 150], ['2_alley', 2190, 520], ['3_garden', 2190, 1250], ['4_yard', 2190, 1860], ['x_garden_side', 2340, 1350], ['c5_stairs', 2190, 640], ['c6_yard', 2190, 1640]],
};
fs.mkdirSync(OUT, { recursive: true });
loadPropsNode();
const { AREAS } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const LIST = String(args.areas || 'eshville_now,eshville_past,graveyard_now,graveyard_past,slice0,belltower_now,ossuary_now,ossuary_past').split(',');   // WORLD-2: + the tower and the ossuary
const CYCLE = String(args.cycle ?? 'eshville_now').split(',');
const PLAN = {};
for (const id of LIST) {
  // WORLD-2: the flood also starts behind what is shut in the base state (area.entry: the cemetery gate) and at the landing of every whip ring
  // (the ossuary terrace) - the last stretch into those exits is pushed from there (scene v2c has no whip and opens no gate)
  const a = await AREAS[id](), W = compileEnv(a.stage), d = a.spawns.default, opt = { hooks: a.stage.hookPoints ?? [], seeds: (a.entry ?? []).map((n) => [a.spawns[n].x, a.spawns[n].z]) };
  const fat = reachGrid(W, d.x, d.z, 26, opt), thin = reachGrid(W, d.x, d.z, 14, opt);
  const exits = a.exits.map((x) => { const g = fat.anyIn(x.x0, x.x1, x.z0, x.z1) ? fat : thin, p = g.anyIn(x.x0 + (x.x1 - x.x0) * 0.3, x.x1, x.z0 + (x.z1 - x.z0) * 0.3, x.z1) ?? g.anyIn(x.x0, x.x1, x.z0, x.z1), wps0 = p ? g.path(p[0], p[1]) : null;
    // WORLD-2: the stretch that is pushed starts after the last whip-ring link of the route (a leap of more than 130 units or 100 up): the stick cannot fly
    let cut = 0; if (wps0) for (let i = 1; i < wps0.length; i++) if (Math.hypot(wps0[i][0] - wps0[i - 1][0], wps0[i][1] - wps0[i - 1][1]) > 130 || Math.abs(g.ground(wps0[i][0], wps0[i][1]) - g.ground(wps0[i - 1][0], wps0[i - 1][1])) > 100) cut = i;
    const wps = wps0 ? wps0.slice(cut) : null; return { id: x.id, wps: wps ? wps.slice(-9) : null }; });
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const b of W.boxes) if (b.walk && !b.inv) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1); }
  const lattice = []; for (let x = x0 + 60; x < x1; x += 260) for (let z = z0 + 60; z < z1; z += 200) if (thin.reachable(x, z)) lattice.push([x, z]);
  PLAN[id] = { spawns: Object.entries(a.spawns).map(([n, s]) => ({ n, x: s.x, z: s.z, face: s.face })), exits, lattice };
}
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port), report = {}, fails = [];
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) fails.push(m); return c; };
const stepN = (page, n, render = false) => page.evaluate(([n, r]) => window.__qaStep(n, r), [n, render]);
const place = (page, x, z, ticks = 40) => page.evaluate(([x, z, ticks]) => {
  const v = window.__v2, sc = v.scene, h = sc.sim.hero;
  let gy = -1e9; for (const b of sc.W.boxes) if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > gy) gy = b.y1;   // WORLD-2: on the ground of the spot (y 300 is inside the tower's upper floors)
  if (gy < -1e8) gy = 299;
  h.x = x; h.z = z; h.y = gy + 1; h.vx = h.vz = h.vy = 0; h.onGround = false; h.safe = { x, z, y: gy }; sc.cam.snap = true; sc.areaState.in = {};
  window.__qaStep(ticks - 1, false); window.__qaStep(1, true); const st = v.stats;
  return { x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), draws: st.gl.draws, tris: st.gl.tris, staticTris: st.env?.visibleStaticTris ?? 0, staticDraws: st.env?.staticDraws ?? 0, chunks: st.env?.visibleChunks ?? 0, sec: v.section };
}, [x, z, ticks]);
const heroAt = (page) => page.evaluate(() => { const h = window.__v2.scene.sim.hero, a = window.__v2.areaInfo; return { x: h.x, z: h.z, y: h.y, hp: h.hp, hits: a?.hits?.slice() ?? [] }; });
const memOf = (page) => page.evaluate(() => { const st = window.__v2.stats; return { texBytes: st.gl.texBytes, bufBytes: st.gl.bufBytes, heroTex: st.hero3d?.texBytes ?? 0, heroBuf: st.hero3d?.bufBytes ?? 0, canvases: st.canvases, dom: document.querySelectorAll('canvas').length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, staticTris: st.env?.staticTris, staticBytes: st.env?.staticBytes, kitTexBytes: st.env?.kitTexBytes, compileMs: st.env?.compileMs, loadMs: st.env?.loadMs, lights: st.env?.lights, cards: st.env?.cards, textures: st.env?.textures }; });

for (const dev of DEVICES) {
  report[dev] = {};
  for (const id of LIST) {
    console.log(`\n== ${dev} · ${id} ==`);
    const R = (report[dev][id] = {}), P = PLAN[id];
    const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS }), ctx = await browser.newContext(contextOptions(dev)), page = await ctx.newPage(), errs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errs.push('[console] ' + m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 200)));
    page.on('response', (r) => { if (r.status() >= 400) errs.push(`[http ${r.status()}] ${r.url().replace(/^.*localhost:\d+\//, '')}`); });
    try {
      const t0 = Date.now();
      await page.goto(`http://localhost:${port}/index.html?scene=v2c&area=${id}&peace=1&areanav=0&nosw`);
      await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 90000 });
      R.wallMs = Date.now() - t0;
      const cdp = await ctx.newCDPSession(page), t = new Touch(cdp, page);
      await page.waitForTimeout(600); await ensureTouchMode(t, page); await page.waitForTimeout(200);
      await freeze(page);
      R.mem = await memOf(page);
      ok(R.mem.cards === 0 || id === 'slice0', `opened in ${R.wallMs} ms (scene load ${R.mem.loadMs} ms, compile ${R.mem.compileMs} ms) · static ${R.mem.staticTris} tris, vertex ${Math.round(R.mem.staticBytes / 1024)} KB · GL textures ${(R.mem.texBytes / 1048576).toFixed(1)} MB (kit ${(R.mem.kitTexBytes / 1048576).toFixed(1)}) + hero ${(R.mem.heroTex / 1048576).toFixed(1)} MB · GL buffers ${Math.round(R.mem.bufBytes / 1024)} KB · lights ${R.mem.lights} · flat cards ${R.mem.cards}`);
      const [vw, vh] = await page.evaluate(() => [innerWidth, innerHeight]), sx = Math.round(vw * 0.2), sy = Math.round(vh * 0.68);
      const axis = async (ax, az) => { if (!t.active.has(21)) await t.down(21, sx, sy); await t.move(21, sx + ax * 70, sy - az * 70); };
      // real touch: push from every spawn along its face
      R.spawns = {};
      for (const s of P.spawns) {
        const a = await place(page, s.x, s.z, 30); await axis(s.face[0], s.face[1]); await stepN(page, 45); const b = await heroAt(page); await t.upAll(); await stepN(page, 3);
        const moved = Math.hypot(b.x - a.x, b.z - a.z), along = (b.x - a.x) * s.face[0] + (b.z - a.z) * s.face[1]; R.spawns[s.n] = { landed: [a.x, a.z, a.y], moved: Math.round(moved), along: Math.round(along) };
        let back = 0;   // a spawn may face a solid thing on purpose (the bell): then the hero must at least walk away from it
        if (along <= 60) { await place(page, s.x, s.z, 30); await axis(-s.face[0], -s.face[1]); await stepN(page, 45); const c = await heroAt(page); await t.upAll(); await stepN(page, 3); back = -((c.x - s.x) * s.face[0] + (c.z - s.z) * s.face[1]); R.spawns[s.n].back = Math.round(back); }
        ok(Math.abs(a.x - s.x) < 3 && Math.abs(a.z - s.z) < 3 && (along > 60 || back > 60), `touch stick from spawn ${s.n} (${s.x},${s.z}) along face [${s.face}]: moved ${Math.round(along)} in 45 ticks${along <= 60 ? ' (faces something solid ' + Math.round(along + 14) + ' ahead; walking away: ' + Math.round(back) + ')' : ''} (stands at y ${a.y})`);
      }
      // real touch: steer the last stretch into every exit
      R.exits = {};
      for (const x of P.exits) {
        if (!x.wps) { ok(false, `exit ${x.id}: no path`); continue; }
        await place(page, x.wps[0][0], x.wps[0][1], 30); let i = 1, hit = false, n = 0, last = null;
        for (; n < 160 && !hit; n++) {
          const h = await heroAt(page); last = h; if (h.hits.includes(x.id)) { hit = true; break; }
          while (i < x.wps.length - 1 && Math.hypot(x.wps[i][0] - h.x, x.wps[i][1] - h.z) < 24) i++;
          const dx = x.wps[i][0] - h.x, dz = x.wps[i][1] - h.z, m = Math.hypot(dx, dz) || 1; await axis(dx / m, dz / m); await stepN(page, 6);
        }
        await t.upAll(); await stepN(page, 3); R.exits[x.id] = { hit, ticks: n * 6 };
        ok(hit, `touch stick into exit ${x.id}: ${hit ? 'entered after ' + n * 6 + ' ticks' : 'NOT entered, stopped at ' + Math.round(last.x) + ',' + Math.round(last.z)}`);
      }
      // worst view over a lattice
      let worst = { draws: 0 }, worstT = { tris: 0 }, worstS = { staticTris: 0 };
      for (const [x, z] of P.lattice) { const n = await place(page, x, z, 12); if (n.draws > worst.draws) worst = n; if (n.tris > worstT.tris) worstT = n; if (n.staticTris > worstS.staticTris) worstS = n; }
      R.worst = { draws: worst, tris: worstT, staticTris: worstS, spots: P.lattice.length };
      console.log(`  worst over ${P.lattice.length} spots: ${worst.draws} draws at (${worst.x},${worst.z}) [static ${worst.staticDraws} draws, ${worst.chunks} chunks] · ${worstT.tris} frame tris at (${worstT.x},${worstT.z}) · ${worstS.staticTris} static tris in view at (${worstS.x},${worstS.z})`);
      // captures
      if (dev === DEVICES[0]) for (const [name, x, z] of SPOTS[id.split('_')[0]] ?? []) { await place(page, x, z, 50); await page.waitForTimeout(120); await page.screenshot({ path: `${OUT}/${id}_${name}.png` }); }
      // enter / leave five times
      if (CYCLE.includes(id) && dev === DEVICES[0]) {
        const seq = [];
        for (let k = 0; k < 5; k++) {
          const left = await page.evaluate(async () => { const g = window.__game; g.go('title', {}, { fade: false }); window.__qaStep(6, true); await new Promise((r) => setTimeout(r, 250)); return { v2: typeof window.__v2, glCanvas: !!document.getElementById('v2b-gl'), dom: document.querySelectorAll('canvas').length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; });
          await page.evaluate((id) => { window.__game.go('v2c', { area: id }, { fade: false }); window.__qaStep(3, true); }, id);
          for (let w = 0; w < 240; w++) { const r = await page.evaluate(() => { window.__qaStep(2, false); return !!(window.__v2 && (window.__v2.ready || window.__v2.error)); }); if (r) break; await page.waitForTimeout(250); }
          await stepN(page, 4, true); const m = await memOf(page); seq.push({ left, texBytes: m.texBytes, bufBytes: m.bufBytes, heroTex: m.heroTex, canvases: m.canvases, dom: m.dom, heap: m.heap });
        }
        R.cycle = seq; const a = seq[0], z = seq[4];
        ok(seq.every((s) => s.left.v2 === 'undefined' && !s.left.glCanvas) && z.texBytes === a.texBytes && z.bufBytes === a.bufBytes && z.dom === a.dom, `enter/leave x5: after leaving __v2 gone and GL canvas removed ${seq.filter((s) => s.left.v2 === 'undefined' && !s.left.glCanvas).length}/5 · GL textures ${seq.map((s) => (s.texBytes / 1048576).toFixed(1)).join(' → ')} MB · buffers ${seq.map((s) => Math.round(s.bufBytes / 1024)).join(' → ')} KB · DOM canvases ${seq.map((s) => s.dom).join(' → ')} (left: ${seq.map((s) => s.left.dom).join(' → ')}) · JS heap ${seq.map((s) => s.heap).join(' → ')} MB`);
      }
      R.errs = errs.slice(0, 8); ok(errs.length === 0, `page errors ${errs.length}${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    } catch (e) { ok(false, `${dev} ${id}: ${String(e?.message ?? e).slice(0, 300)}`); } finally { await browser.close(); }
  }
}
srv.close();
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1));
console.log(fails.length ? `\nFAIL (${fails.length})\n` + fails.map((f) => ' - ' + f).join('\n') : '\nALL OK');
process.exit(fails.length ? 1 : 0);
