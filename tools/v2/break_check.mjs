// BREAK lane check (scene v2g, one browser): numbers per area with everything whole and everything broken, the memory of what is broken
// (rebuild in place / leave and come back), the save (coins, broken, the saved spot beside a jar, an old save, the grace after a load).
//   node tools/v2/break_check.mjs [--only areas|memory|save] [--device fold_open]
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.device || 'fold_open'), ONLY = args.only ? String(args.only) : null, want = (k) => !ONLY || ONLY === k;
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
let pass = 0, fail = 0; const errs = [];
const ok = (name, cond, extra = '') => { if (cond) pass++; else fail++; console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  (' + extra + ')' : '')); };
const ready = (page) => page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 });
const T = (page, n) => page.evaluate((k) => { const g = window.__game; g._pageHidden = true; for (let i = 0; i < k; i++) g.tick(1 / 60); g.render(); }, n);
const waitReady = async (page) => { for (let i = 0; i < 400; i++) { if (await page.evaluate(() => { const g = window.__game; g._pageHidden = true; g.tick(1 / 60); g.render(); const sc = window.__v2.scene; return sc.ready && !sc._go && sc.fadeA <= 0.01; })) return true; await page.waitForTimeout(40); } return false; };
try {
  const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
  if (want('areas')) {
    console.log('[numbers per area: all whole -> all broken (after the pieces have faded)]');
    for (const id of ['eshville_now', 'eshville_past', 'graveyard_now', 'graveyard_past', 'belltower_now', 'ossuary_now', 'ossuary_past']) {
      await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${id}&v2seed=3`); await ready(page); await T(page, 30);
      const r = await page.evaluate(() => { const sc = window.__v2.scene, g = window.__game, sim = sc.sim, tick = (n) => { for (let i = 0; i < n; i++) g.tick(1 / 60); g.render(); };
        sim.done = true; for (const e of sim.enemies) { e.dead = true; e.hp = 0; e.active = false; } tick(20);
        const st0 = { ...sc.brk.stat }, gl0 = window.__v2.stats.gl, n = sim.breakables.length; let peak = 0, peakTris = 0;
        sim.breakAt(sim.hero.x, sim.hero.z, 1e6, 'c1'); for (let i = 0; i < 12; i++) { tick(1); peak = Math.max(peak, sc.brk.shN); peakTris = Math.max(peakTris, sc.brk.stat.tris); }
        for (const p of sim.pickups) p.on = false; sim.pickN = 0; tick(330);
        const st1 = { ...sc.brk.stat }, gl1 = window.__v2.stats.gl;
        return { n, whole: { draws: st0.draws, tris: Math.round(st0.tris), frameDraws: gl0.draws }, broken: { draws: st1.draws, tris: Math.round(st1.tris), frameDraws: gl1.draws, live: sim.brkLive, shards: sc.brk.shN }, allAtOnce: { shards: peak, tris: Math.round(peakTris) } }; });
      ok(`${id}: ${r.n} breakables · whole +${r.whole.draws} draw, +${r.whole.tris} triangles (frame ${r.whole.frameDraws} draws) · all broken +${r.broken.draws} draws, +${r.broken.tris} triangles (frame ${r.broken.frameDraws}) · all ${r.n} broken in one tick: ${r.allAtOnce.shards} pieces live (pool 128), ${r.allAtOnce.tris} triangles`, r.whole.draws === 1 && r.broken.draws === 0 && r.broken.tris === 0 && r.broken.live === 0 && r.broken.shards === 0 && r.n >= 8);
    }
  }
  if (want('memory')) {
    console.log('[what is broken stays broken while the hero stays; whole again on a new arrival]');
    await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=eshville_now&v2seed=3`); await ready(page); await T(page, 30);
    const a = await page.evaluate(() => { const sc = window.__v2.scene, sim = sc.sim, g = window.__game; sim.done = true; for (const e of sim.enemies) { e.dead = true; e.hp = 0; e.active = false; }
      const L = sim.breakables; for (const i of [0, 1, 9]) { L[i].drop = i === 9 ? 'coin4' : 'none'; sim.breakAt(L[i].x, L[i].z, 2, 'c1'); } for (let i = 0; i < 30; i++) g.tick(1 / 60);
      sc.sim.hooks.pickup('coin', 3, sim.hero); const b = L[1]; sim.hero.x = b.x; sim.hero.z = b.z - 4;   // he stands where the jar stood
      return { broken: L.filter((q) => q.broken).map((q) => q.id), coins: sc.brk.coins, keys: sc.brk.brokenOut(), rebuilt: sc.rebuildArea() }; });
    ok('rebuildArea() started', a.rebuilt === true && a.broken.join() === '0,1,9', JSON.stringify(a));
    await waitReady(page);
    const b = await page.evaluate(() => { const sc = window.__v2.scene, sim = sc.sim, h = sim.hero, sp = sc.area.spawns.default; return { broken: sim.breakables.filter((q) => q.broken).map((q) => q.id), live: sim.brkLive, n: sim.breakables.length, coins: sc.brk.coins, state: sc.state.coins, drawn: sc.brk.live, atSpawn: Math.hypot(h.x - sp.x, h.z - sp.z) < 5, pos: [Math.round(h.x), Math.round(h.z)] }; });
    ok('after the rebuild in place: the same three are broken, the rest whole, coins kept, the hero where he stood (on the broken jar\'s spot, not at the spawn)', b.broken.join() === '0,1,9' && b.live === b.n - 3 && b.drawn === b.n - 3 && b.coins === 3 && b.state === 3 && !b.atSpawn, JSON.stringify(b));
    await page.evaluate(() => window.__v2.scene.travelTo('graveyard_now', 'default')); await waitReady(page);
    const c = await page.evaluate(() => { const sc = window.__v2.scene; return { area: sc.area.id, broken: sc.sim.breakables.filter((q) => q.broken).length, n: sc.sim.breakables.length, coins: sc.brk.coins }; });
    await page.evaluate(() => window.__v2.scene.travelTo('eshville_now', 'from_graveyard')); await waitReady(page);
    const d = await page.evaluate(() => { const sc = window.__v2.scene; return { area: sc.area.id, broken: sc.sim.breakables.filter((q) => q.broken).length, n: sc.sim.breakables.length, coins: sc.brk.coins }; });
    ok('travel to the graveyard and back: everything stands again in both, the coins travel with the hero', c.area === 'graveyard_now' && c.broken === 0 && c.coins === 3 && d.area === 'eshville_now' && d.broken === 0 && d.n === 23 && d.coins === 3, JSON.stringify([c, d]));
    const e = await page.evaluate(() => { const sc = window.__v2.scene, sim = sc.sim, g = window.__game; sim.breakAt(sim.breakables[5].x, sim.breakables[5].z, 2, 'c1'); for (let i = 0; i < 5; i++) g.tick(1 / 60); sim.reset(); for (let i = 0; i < 5; i++) g.tick(1 / 60); g.render(); return { broken: sim.breakables.filter((q) => q.broken).map((q) => q.id), coins: sim.hero.coins }; });
    ok('the rules start the area over (sim.reset, the hero fell): what he broke in this visit stays broken, hero.coins is kept', e.broken.join() === '5' && e.coins === 3, JSON.stringify(e));
  }
  if (want('save')) {
    console.log('[the save: coins, what is broken, the saved spot, an old save, the grace after a load]');
    await page.goto(`http://localhost:${port}/index.html?scene=v2g`); await ready(page); await T(page, 60);
    const s0 = await page.evaluate(() => { const sc = window.__v2.scene, sim = sc.sim, g = window.__game, L = sim.breakables; if (!sc.host) return { host: false };
      for (const i of [2, 3]) { L[i].drop = 'none'; sim.breakAt(L[i].x, L[i].z, 2, 'c1'); } for (let i = 0; i < 20; i++) g.tick(1 / 60);
      sc.sim.hooks.pickup('coin', 7, sim.hero); const b = L[3], h = sim.hero; h.x = b.x - 2; h.z = b.z - 6; h.vx = h.vz = 0; h.onGround = true; if (h.safe) { h.safe.x = h.x; h.safe.z = h.z; }
      const okS = sc.host.saveNow('test'), sv = JSON.parse(localStorage.getItem('bn.v2.save') || 'null');
      return { host: true, okS, area: sc.area.id, sv: sv ? { area: sv.area, coins: sv.coins, broken: sv.broken, pos: sv.pos } : null, jar: [b.x, b.z] }; });
    ok('save written with the new fields: coins 7, two broken keys, the position on the broken jar\'s spot', s0.host && s0.okS && s0.sv && s0.sv.coins === 7 && Array.isArray(s0.sv.broken) && s0.sv.broken.length === 2 && !!s0.sv.pos, JSON.stringify(s0).slice(0, 300));
    await page.reload(); await ready(page); await T(page, 5);
    const s1 = await page.evaluate(() => { const sc = window.__v2.scene, sim = sc.sim, h = sim.hero, g = window.__game, sp = sc.area.spawns.default; const r = { area: sc.area.id, broken: sim.breakables.filter((q) => q.broken).map((q) => q.id), coins: sc.brk.coins, state: sc.state.coins, pos: [Math.round(h.x), Math.round(h.z)], atSpawn: Math.hypot(h.x - sp.x, h.z - sp.z) < 5, grace0: sc._graceT };
      let minIfr = 9, blink = 0; for (let i = 0; i < 100; i++) { g.tick(1 / 60); if (i < 95) minIfr = Math.min(minIfr, h.ifr); if (sc.heroA.opt.flash > 0.25 && !(h.flash > 0)) blink++; } r.minIfr = +minIfr.toFixed(3); r.blink = blink; r.graceLeft = +sc._graceT.toFixed(2);
      for (let i = 0; i < 40; i++) g.tick(1 / 60); r.after = +h.ifr.toFixed(3); r.graceEnd = sc._graceT; r.held = !!(sc.host && sc.host.locks()) || !!sc.hud.modal; return r; });
    ok('load: same area, the two stay broken, coins 7, the hero stands at the saved spot (not thrown back to the spawn)', s1.area === s0.area && s1.broken.join() === '2,3' && s1.coins === 7 && s1.state === 7 && !s1.atSpawn && Math.abs(s1.pos[0] - (s0.jar[0] - 2)) < 3, JSON.stringify(s1));
    ok('after the load the hero is untouchable for 2 s without blinking (rules\' own time kept up), then not', s1.grace0 > 1.5 && s1.minIfr > 0.05 && s1.blink === 0 && s1.graceEnd <= 0 && (s1.held || s1.after <= 0.16), `grace ${s1.grace0} · lowest ifr in the first 1.6 s ${s1.minIfr} · blink frames ${s1.blink} · grace left after 2.3 s ${s1.graceEnd} · ifr then ${s1.after}${s1.held ? ' (the story itself holds the hero here: its own 0.4 s top-up)' : ''}`);
    // the first attack ends the grace
    await page.reload(); await ready(page); await T(page, 5);
    const s2 = await page.evaluate(() => { const sc = window.__v2.scene, g = window.__game, h = sc.sim.hero; const g0 = sc._graceT; sc.inp.attack = true; for (let i = 0; i < 6; i++) g.tick(1 / 60); return { g0, g1: sc._graceT, move: h.move ? h.move.id : null }; });
    ok('his first attack ends the grace at once', s2.g0 > 1.5 && s2.g1 === 0 && s2.move === 'c1', JSON.stringify(s2));
    // an old save: no coins, no broken list, and a saved spot inside a jar that stands again
    const s3pre = await page.evaluate(() => { const sc = window.__v2.scene, sv = JSON.parse(localStorage.getItem('bn.v2.save')), b = sc.sim.breakables[0]; delete sv.coins; delete sv.broken; sv.pos = { x: Math.round(b.x), z: Math.round(b.z - 8), y: Math.round(b.y), face: [1, 0] }; window.__noSave = true; sc.host.saveNow = () => false; localStorage.setItem('bn.v2.save', JSON.stringify(sv)); return { jar: [b.x, b.z], id: b.id }; });
    await page.reload(); await ready(page); await T(page, 5);
    const s3 = await page.evaluate(() => { const sc = window.__v2.scene, sim = sc.sim, h = sim.hero, sp = sc.area.spawns.default; return { broken: sim.breakables.filter((q) => q.broken).map((q) => q.id), coins: sc.brk.coins, pos: [Math.round(h.x), Math.round(h.z)], atSpawn: Math.hypot(h.x - sp.x, h.z - sp.z) < 5 }; });
    ok('an old save (no coins, no broken list) whose spot lies inside a jar: coins read 0, the hero stands at the saved spot and that one jar starts broken', s3.coins === 0 && !s3.atSpawn && s3.broken.join() === String(s3pre.id) && Math.abs(s3.pos[0] - s3pre.jar[0]) < 3, JSON.stringify(s3));
    const s4 = await page.evaluate(() => { const sc = window.__v2.scene; sc.sim.hooks.pickup('coin', 5, sc.sim.hero); const c0 = sc.brk.coins; return { c0, r: sc.restart() }; }); await waitReady(page);
    const s5 = await page.evaluate(() => { const sc = window.__v2.scene; return { coins: sc.brk.coins, state: sc.state.coins, broken: sc.sim.breakables.filter((q) => q.broken).length }; });
    ok('scene.restart() wipes the coins and what was broken', s4.c0 === 5 && s4.r === true && s5.coins === 0 && s5.state === 0 && s5.broken === 0, JSON.stringify([s4, s5]));
  }
} catch (e) { console.error('FAILED', e); fail++; } finally { await browser.close(); srv.close(); }
ok('0 page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`\n${fail ? 'FAIL' : 'ALL OK'}: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
