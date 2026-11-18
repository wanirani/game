// WORLD2-VERIFY (browser, scene v2c, software WebGL): trusted touch (CDP touch events on the stick and the jump button) in the new areas.
//   tower: climb door -> bell chamber with the stick and the jump button; walk off every floor edge and into every notch
//   ossuary: walk into the gap (pit rule), cross the statue plinth / the crate WITHOUT jumping, loop the boss hall along its walls
//   captures of the same spots in both nights, numbers (static tris / draws in the worst view, GL texture + buffer bytes, load), enter/leave x5
//   node tools/v2/world_v2verify_shot.mjs [--devices fold_open,phone2] [--out dir] [--json file] [--part tower,oss,num,cycle]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode, padLayout } from '../qa/lib/touch.mjs';
import { freeze } from '../qa/lib/step.mjs';
import { loadPropsNode } from './world_node.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(','), OUT = String(args.out || '/tmp/claude-0/v2/world2verify/shots'), PART = String(args.part || 'tower,oss,num,cycle').split(',');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
fs.mkdirSync(OUT, { recursive: true });
loadPropsNode();
const { AREAS } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const flagsOf = (st) => Object.fromEntries(String(st || '').split(',').filter(Boolean).map((f) => [f, true]));
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port), report = {}, fails = [];
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) fails.push(m); return c; };
const note = (m) => console.log('  note ' + m);

async function open(dev, id, st = '') {
  const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS }), ctx = await browser.newContext(contextOptions(dev)), page = await ctx.newPage(), errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errs.push('[console] ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 200)));
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/index.html?scene=v2c&area=${id}&peace=1&areanav=0&nosw${st ? '&flags=' + st : ''}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 90000 });
  const wallMs = Date.now() - t0, cdp = await ctx.newCDPSession(page), t = new Touch(cdp, page);
  await page.waitForTimeout(500); await ensureTouchMode(t, page); await page.waitForTimeout(150); await freeze(page);
  const [vw, vh] = await page.evaluate(() => [innerWidth, innerHeight]), sx = Math.round(vw * 0.2), sy = Math.round(vh * 0.68);
  const a = await AREAS[id](flagsOf(st)), W = compileEnv(a.stage);
  const ground = (x, z) => { let gy = -1e9; for (const b of W.boxes) if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > gy) gy = b.y1; return gy; };
  const axis = async (ax, az) => { const m = Math.hypot(ax, az) || 1; if (!t.active.has(21)) await t.down(21, sx, sy); await t.move(21, sx + ax / m * 70, sy - az / m * 70); };
  const step = (n, render = false) => page.evaluate(([n, r]) => { window.__qaStep(n, r); const h = window.__v2.scene.sim.hero; return { x: h.x, z: h.z, y: h.y, og: !!h.onGround, hp: h.hp, hits: window.__v2.areaInfo?.hits?.slice() ?? [], fired: window.__v2.areaInfo?.fired?.slice() ?? [] }; }, [n, render]);
  const place = (x, z, ticks = 30, y = null) => page.evaluate(([x, z, ticks, y]) => {
    const v = window.__v2, sc = v.scene, h = sc.sim.hero; let gy = -1e9; for (const b of sc.W.boxes) if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > gy) gy = b.y1; if (y != null) gy = y;
    h.x = x; h.z = z; h.y = gy + 1; h.vx = h.vz = h.vy = 0; h.onGround = false; h.safe = { x, z, y: gy }; sc.cam.snap = true; sc.areaState.in = {};
    window.__qaStep(ticks - 1, false); window.__qaStep(1, true); const st = v.stats;
    return { x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), hp: h.hp, draws: st.gl.draws, tris: st.gl.tris, staticTris: st.env?.visibleStaticTris ?? 0, staticDraws: st.env?.staticDraws ?? 0, chunks: st.env?.visibleChunks ?? 0, sec: v.section };
  }, [x, z, ticks, y]);
  const mem = () => page.evaluate(() => { const st = window.__v2.stats; return { texBytes: st.gl.texBytes, bufBytes: st.gl.bufBytes, heroTex: st.hero3d?.texBytes ?? 0, dom: document.querySelectorAll('canvas').length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, staticTris: st.env?.staticTris, staticBytes: st.env?.staticBytes, kitTexBytes: st.env?.kitTexBytes, compileMs: st.env?.compileMs, loadMs: st.env?.loadMs, lights: st.env?.lights, textures: st.env?.textures }; });
  const shot = async (name, x, z) => { const p = await place(x, z, 40); await page.waitForTimeout(100); await page.screenshot({ path: `${OUT}/${name}.png` }); return p; };
  const jumpBtn = (await padLayout(page)).buttons.jump;
  /** push the stick along (ax, az) for n ticks from (x, z); -> where the hero ends */
  const push = async (x, z, ax, az, n = 60) => { const a0 = await place(x, z, 20); await axis(ax, az); const b = await step(n); await t.upAll(); const c = await step(40); return { from: a0, to: { x: Math.round(c.x), z: Math.round(c.z), y: Math.round(c.y), hp: c.hp, og: c.og } }; };
  /** walk with the stick (and the jump button) along the reach grid's route to (tx, tz) */
  const go = async (from, to, { jumpOk = true, max = 2600 } = {}) => {
    let h = await place(from[0], from[1], 20), wps = reachGrid(W, from[0], from[1], 14).path(to[0], to[1], true), i = 0, ticks = 0, jumps = 0, plans = 1, jl = 0, lock = null, lx = h.x, lz = h.z, stuck = 0, minY = 1e9, hp0 = h.hp, hurt = 0;
    if (!wps) return { arrived: false, noPath: true };
    h = await step(1);
    while (ticks < max && i < wps.length) {
      const dx = wps[i][0] - h.x, dz = wps[i][1] - h.z, dd = Math.hypot(dx, dz) || 1;
      if (dd < (i === wps.length - 1 ? 8 : 22)) { i++; continue; }
      minY = Math.min(minY, h.y); if (h.hp < hp0) { hurt += hp0 - h.hp; hp0 = h.hp; }
      let ax = Math.abs(dx) > 3 ? Math.sign(dx) : 0, az = Math.abs(dz) > 3 ? Math.sign(dz) : 0;
      if (h.og && jl <= 0) {
        const gh = ground(h.x, h.z), gt = ground(wps[i][0], wps[i][1]);
        if (gt > gh + 90) { const w2 = reachGrid(W, h.x, h.z, 14).path(to[0], to[1], true); if (!w2 || plans > 8) break; wps = w2; i = 0; plans++; continue; }   // fell off the route: plan again from here
        const gap = (ux, uz) => (ux || uz) && ground(h.x + ux * 26, h.z + uz * 26) < gh - 60 && gt >= gh - 30;
        const ledge = (ux, uz) => { if (!(ux || uz)) return false; const g2 = ground(h.x + ux * 18, h.z + uz * 18); return g2 > gh + 36 && g2 <= gh + 100 && gt > gh + 16; };
        if (jumpOk && (gap(0, az) || ledge(0, az))) { jl = 20; jumps++; lock = 'z'; } else if (jumpOk && (gap(ax, 0) || ledge(ax, 0))) { jl = 20; jumps++; lock = 'x'; }
        if (jl === 20) await t.down(12, jumpBtn.cx, jumpBtn.cy);
      }
      if (jl > 0 && lock === 'z') ax = 0; else if (jl > 0 && lock === 'x') az = 0;
      await axis(ax, az); h = await step(2); ticks += 2;
      if (jl > 0) { jl -= 2; if (jl <= 6 && t.active.has(12)) await t.up(12); }
      if (ticks % 6 === 0) { const m = Math.hypot(h.x - lx, h.z - lz); lx = h.x; lz = h.z; stuck = m < 2 ? stuck + 1 : 0; if (stuck >= 5) { if (!jumpOk) break; jl = 22; lock = null; stuck = 0; jumps++; await t.down(12, jumpBtn.cx, jumpBtn.cy); } }
    }
    await t.upAll(); h = await step(6);
    return { arrived: i >= wps.length, ticks, jumps, plans, x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), minY: Math.round(minY), hurt: hurt + Math.max(0, hp0 - h.hp), fired: h.fired, hits: h.hits };
  };
  const lattice = async () => {
    const thin = reachGrid(W, 0, 0, 14, { noStart: true, seeds: Object.values(a.spawns).map((s) => [s.x, s.z]) }); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const b of W.boxes) if (b.walk && !b.inv) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1); }
    let wd = { staticDraws: 0 }, wt = { staticTris: 0 }, wf = { draws: 0 }, n = 0;
    for (let x = x0 + 60; x < x1; x += 240) for (let z = z0 + 60; z < z1; z += 180) if (thin.reachable(x, z)) { const p = await place(x, z, 10); n++; if (p.staticDraws > wd.staticDraws) wd = p; if (p.staticTris > wt.staticTris) wt = p; if (p.draws > wf.draws) wf = p; }
    return { spots: n, staticDraws: wd.staticDraws, at: [wd.x, wd.z], staticTris: wt.staticTris, atT: [wt.x, wt.z], frameDraws: wf.draws };
  };
  const cycle = async () => {
    const seq = [];
    for (let k = 0; k < 5; k++) {
      const left = await page.evaluate(async () => { const g = window.__game; g.go('title', {}, { fade: false }); window.__qaStep(6, true); await new Promise((r) => setTimeout(r, 200)); return { v2: typeof window.__v2, glCanvas: !!document.getElementById('v2b-gl') }; });
      await page.evaluate(([id, fl]) => { window.__game.go('v2c', { area: id, ...(fl ? { flags: fl } : {}) }, { fade: false }); window.__qaStep(3, true); }, [id, st]);
      for (let w = 0; w < 240; w++) { const r = await page.evaluate(() => { window.__qaStep(2, false); return !!(window.__v2 && (window.__v2.ready || window.__v2.error)); }); if (r) break; await page.waitForTimeout(200); }
      await step(4, true); const m = await mem(); seq.push({ left, texBytes: m.texBytes, bufBytes: m.bufBytes, dom: m.dom, heap: m.heap, staticTris: m.staticTris });
    }
    return seq;
  };
  return { browser, page, errs, wallMs, a, W, t, ground, axis, step, place, mem, shot, push, go, lattice, cycle };
}
const MB = (b) => (b / 1048576).toFixed(1);
async function numbers(S, key, R, withCycle) {
  const m = await S.mem(), L = await S.lattice(); R.mem = m; R.worst = L; R.wallMs = S.wallMs;
  console.log(`  numbers ${key}: static ${m.staticTris} tris · worst view ${L.staticTris} static tris at (${L.atT}) / ${L.staticDraws} static draws at (${L.at}) (frame ${L.frameDraws}) over ${L.spots} spots · GL textures ${MB(m.texBytes)} MB (kit ${MB(m.kitTexBytes)}, hero ${MB(m.heroTex)}) · GL buffers ${Math.round(m.bufBytes / 1024)} KB (static vertex ${Math.round(m.staticBytes / 1024)} KB) · opened in ${S.wallMs} ms (scene load ${m.loadMs} ms, compile ${m.compileMs} ms) · lights ${m.lights}`);
  if (withCycle) { const seq = await S.cycle(); R.cycle = seq; ok(seq.every((s) => s.left.v2 === 'undefined' && !s.left.glCanvas) && seq.every((s) => s.texBytes === m.texBytes && s.bufBytes === m.bufBytes), `enter/leave x5 ${key}: GL textures ${MB(m.texBytes)} → ${seq.map((s) => MB(s.texBytes)).join(' → ')} MB · buffers ${Math.round(m.bufBytes / 1024)} → ${seq.map((s) => Math.round(s.bufBytes / 1024)).join(' → ')} KB · canvases ${seq.map((s) => s.dom).join(' → ')} · JS heap ${seq.map((s) => s.heap).join(' → ')} MB`); }
}

for (const dev of DEVICES) {
  const R = report[dev] = {}, first = dev === DEVICES[0];
  // ───────── the tower ─────────
  if (PART.includes('tower')) {
    console.log(`\n== ${dev} · belltower_now ==`);
    const S = await open(dev, 'belltower_now');
    try {
      const sp = S.a.spawns, c = await S.go([sp.bottom.x, sp.bottom.z], [360, 1000]); R.climb = c;
      ok(c.arrived && c.hurt === 0, `touch climb door -> bell chamber: ${c.arrived ? 'arrived' : 'NOT arrived, stopped at (' + c.x + ',' + c.z + ', y ' + c.y + ')'} · ${c.ticks} ticks · ${c.jumps} jumps · planned ${c.plans}x · lowest y ${c.minY} · hurt ${c.hurt} · triggers ${JSON.stringify(c.fired)}`);
      // walk off every floor edge towards the camera, and into every notch from both sides
      const LV = 136, falls = []; let badF = 0;
      for (let k = 1; k <= 5; k++) { const z = (k === 5 ? 880 : 240 + (k - 1) * 160) + 24; for (const x of [60, 200, 350, 500, 660]) { if (S.ground(x, z) < k * LV - 1) continue; const p = await S.push(x, z, 0, -1, 50); const good = p.to.og && p.to.hp === p.from.hp && p.to.y >= -1 && Number.isFinite(S.ground(p.to.x, p.to.z)) && Math.abs(p.to.y - S.ground(p.to.x, p.to.z)) < 3; falls.push([k, x, p.from.y, p.to.y, p.to.z]); if (!good) { badF++; note(`fall off floor ${k} at x ${x}: from y ${p.from.y} -> (${p.to.x},${p.to.z}, y ${p.to.y}) onGround ${p.to.og} hp ${p.from.hp}->${p.to.hp}`); } } }
      for (const [k, g0, g1] of [[1, 300, 400], [3, 330, 430], [4, 270, 370]]) { const z = 240 + (k - 1) * 160 + 80; for (const [x, ax] of [[g0 - 30, 1], [g1 + 30, -1]]) { const p = await S.push(x, z, ax, 0, 40); const out = await S.go([p.to.x, p.to.z], [360, 80], { max: 1500 }); const good = p.to.og && p.to.hp === p.from.hp && Math.abs(p.to.y - (k - 1) * LV) < 3 && out.arrived; falls.push([k, x, p.from.y, p.to.y, 'notch']); if (!good) { badF++; note(`notch of floor ${k} from x ${x}: landed (${p.to.x},${p.to.z}, y ${p.to.y}) hp ${p.from.hp}->${p.to.hp}; way back to the door: ${out.arrived ? 'ok' : 'NOT found, stopped at (' + out.x + ',' + out.z + ', y ' + out.y + ')'}`); } } }
      R.falls = falls; ok(badF === 0, `touch walks off ${falls.length} floor edges / notch sides: ${falls.length - badF} land on a floor unhurt and (notches) walk back out`);
      // can a floor edge be hopped straight up (skipping the stairs)?
      let skip = 0; for (let k = 1; k <= 5; k++) { const z = (k === 5 ? 880 : 240 + (k - 1) * 160) - 20; for (const x of [200, 360, 500]) { const g0 = S.ground(x, z); if (g0 < (k - 1) * LV - 1 || g0 > (k - 1) * LV + 1) continue; await S.place(x, z, 10); await S.axis(0, 1); await S.t.down(12, (await padLayout(S.page)).buttons.jump.cx, (await padLayout(S.page)).buttons.jump.cy); const h = await S.step(40); await S.t.upAll(); const e = await S.step(30); if (e.y > g0 + 100) { skip++; note(`floor ${k} edge hopped straight up at x ${x}: y ${Math.round(e.y)}`); } } }
      ok(skip === 0, `floor edges cannot be hopped straight up with stick + jump (15 tries): ${skip} got up`);
      if (first) { for (const [n, x, z] of [['1_door', 360, 80], ['2_floor1', 200, 320], ['3_roost', 360, 480], ['4_floor3', 560, 640], ['5_floor4', 200, 800], ['6_top', 360, 960], ['7_bell', 300, 1090], ['8_top_corner', 660, 1240]]) await S.shot(`tower_${n}`, x, z); }
      if (PART.includes('num') && first) await numbers(S, 'belltower_now', R.tower = {}, PART.includes('cycle'));
      ok(S.errs.length === 0, `page errors ${S.errs.length}${S.errs.length ? ': ' + S.errs.slice(0, 2).join(' | ') : ''}`);
    } catch (e) { ok(false, `${dev} belltower_now: ${String(e?.message ?? e).slice(0, 300)}`); } finally { await S.browser.close(); }
  }
  // ───────── the ossuary ─────────
  if (PART.includes('oss')) {
    const SPOTS = [['1_entry', 600, 150], ['2_coffins', 600, 560], ['2b_coffins_far', 600, 880], ['3_wedge', 600, 1120], ['3b_wedge_far', 600, 1450], ['4_arena', 600, 1750], ['5_lamp', 600, 2250], ['6_riddle', 600, 2560], ['7_rest', 600, 2880], ['8_boss', 600, 3150], ['8b_boss_mid', 600, 3450], ['8c_boss_corner', 180, 3250], ['9_posts', 600, 3740]];
    for (const [id, st, what] of [['ossuary_now', '', 'full'], ['ossuary_past', '', 'full'], ['ossuary_now', 'wedge_stone,knells_hung', 'cross'], ['ossuary_past', 'wedge_stone', 'cross'], ['ossuary_past', 'wedge_wood', 'cross'], ['ossuary_now', 'wedge_wood', 'gap']]) {
      if (!first && what !== 'cross') continue;
      const key = id + (st ? '@' + st : ''); console.log(`\n== ${dev} · ${key} ==`);
      const S = await open(dev, id, st), Q = R[key] = {};
      try {
        if (what === 'full') {
          for (const x of [300, 600, 900]) { const p = await S.push(x, 1150, 0, 1, 70); ok(p.to.og && p.to.z < 1200 && p.to.hp === p.from.hp - 8, `stick into the gap at x ${x}: back on safe ground (${p.to.x},${p.to.z}, y ${p.to.y}), hp ${p.from.hp} -> ${p.to.hp} (pit rule: 8)`); }
          // along both side walls, the whole length this state allows (pushed into the wall at 45 degrees)
          for (const [x, ax] of [[125, -1], [1075, 1]]) { let stuckAt = []; for (const z0 of [40, 1010, 1420, 2110, 2460, 2810, 3020, 3400, 3720]) { const g = S.ground(x, z0); if (!(g > -1e8)) continue; const p = await S.push(x + (ax < 0 ? 30 : -30), z0, ax, 1, 90); if (p.to.z - p.from.z < 40) stuckAt.push(`${z0}->(${p.to.x},${p.to.z})`); } note(`wall ${ax < 0 ? 'left' : 'right'}: pushed into the wall and along it from 9 starts; moved less than 40 ahead in 90 ticks at: ${stuckAt.join(' ') || 'none'}`); Q['wall' + ax] = stuckAt; }
          const loop = [[300, 3040], [135, 3230], [135, 3640], [300, 3700], [900, 3700], [1065, 3640], [1065, 3230], [900, 3040], [600, 3040]]; let lt = 0, lok = true, at = [600, 3120];
          for (const wp of loop) { const g = await S.go(at, wp, { jumpOk: false, max: 900 }); lt += g.ticks ?? 0; if (!g.arrived) { lok = false; note(`boss hall loop: could not walk ${at} -> ${wp} without jumping (stopped at ${g.x},${g.z}${g.noPath ? ', no path' : ''})`); } at = wp; }
          ok(lok, `boss hall: touch walk along the walls all the way round (9 legs, no jump): ${lt} ticks`);
          if (first) for (const [n, x, z] of SPOTS) { const g = S.ground(x, z); if (g > -1e8) await S.shot(`${id}_${n}`, x, z); }
          if (PART.includes('num')) await numbers(S, key, Q, PART.includes('cycle'));
        } else if (what === 'cross') {
          for (const x of st.includes('wood') ? [540, 600, 660] : [530, 560, 650, 672]) { const p = await S.push(x, 1150, 0, 1, 130); const over = p.to.z > 1400 && p.to.hp === p.from.hp; Q['x' + x] = p.to; ok(over, `stick straight across the gap at x ${x} WITHOUT jumping: ${over ? 'across' : 'NOT across'} -> (${p.to.x},${p.to.z}, y ${p.to.y}) hp ${p.from.hp} -> ${p.to.hp}`); }
          const g = await S.go([600, 1100], [600, 1460], { max: 900 }); ok(g.arrived && g.hurt === 0, `touch route over the gap (jump allowed): ${g.arrived ? 'arrived' : 'NOT arrived (' + g.x + ',' + g.z + ')'} · ${g.ticks} ticks · ${g.jumps} jumps · hurt ${g.hurt}`);
          if (first) { await S.shot(`${id}_${st.replace(/,.*/, '')}_gap`, 600, 1120); await S.shot(`${id}_${st.replace(/,.*/, '')}_gap_far`, 600, 1450); if (st.includes('knells')) await S.shot(`${id}_knells_posts`, 600, 3740); }
          if (PART.includes('num') && first) await numbers(S, key, Q, false);
        } else { await S.shot(`${id}_wedge_wood_gap`, 600, 1120); const p = await S.push(600, 1150, 0, 1, 70); ok(p.to.z < 1200 && p.to.hp === p.from.hp - 8, `tonight after the crate: the gap is open again (stick into it at x 600 -> back at z ${p.to.z}, hp ${p.from.hp} -> ${p.to.hp})`); }
        ok(S.errs.length === 0, `page errors ${S.errs.length}${S.errs.length ? ': ' + S.errs.slice(0, 2).join(' | ') : ''}`);
      } catch (e) { ok(false, `${dev} ${key}: ${String(e?.message ?? e).slice(0, 300)}`); } finally { await S.browser.close(); }
    }
  }
  // ───────── numbers of the other areas / flagged states ─────────
  if (PART.includes('num') && first) {
    for (const [id, st, cyc, spots] of [['eshville_now', '', true, []], ['eshville_now', 'door_pulled,gate_open,promise,elise_home,bells_answered', false, []], ['eshville_past', '', true, []], ['eshville_past', 'past_gate_open,past_street_clear', false, []],
      ['graveyard_now', '', true, []], ['graveyard_now', 'bell_hung,ossuary_open,carved_a,carved_b', false, [['terrace', 600, 1900], ['stair', 600, 1760]]], ['graveyard_past', '', true, [['terrace', 600, 1900], ['stair', 600, 1760], ['edmund', 600, 1620]]], ['graveyard_past', 'bell_hung,carved_a,carved_b', false, [['terrace', 600, 1900]]], ['slice0', '', true, []]]) {
      const key = id + (st ? '@' + st : ''); console.log(`\n== ${dev} · ${key} ==`);
      const S = await open(dev, id, st);
      try { for (const [n, x, z] of spots) { const g = reachGrid(S.W, 0, 0, 14, { noStart: true, seeds: [...Object.values(S.a.spawns).map((s) => [s.x, s.z]), ...(S.a.stage.hookPoints ?? []).filter((h) => h.to).map((h) => h.to)] }).near(x, z, 120); if (g) await S.shot(`${id}_${st ? st.split(',')[0] : 'base'}_${n}`, g[0], g[1]); }
        await numbers(S, key, R[key] = {}, cyc && PART.includes('cycle')); ok(S.errs.length === 0, `page errors ${S.errs.length}${S.errs.length ? ': ' + S.errs.slice(0, 2).join(' | ') : ''}`);
      } catch (e) { ok(false, `${dev} ${key}: ${String(e?.message ?? e).slice(0, 300)}`); } finally { await S.browser.close(); }
    }
  }
}
srv.close();
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1));
console.log(fails.length ? `\nFAIL (${fails.length})\n` + fails.map((f) => ' - ' + f).join('\n') : '\nALL OK');
process.exit(fails.length ? 1 : 0);
