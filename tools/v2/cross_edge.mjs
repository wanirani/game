// CROSSING lane: what must not break around the staged bell crossing (fast-forward ticks, Fold size, one browser).
//   node tools/v2/cross_edge.mjs [--only refuse,lost,leave,memory,alloc,tiers,gl1,post] [--root <tree>] [--out <dir>] [--res 0.5]
//   refuse  the other night has nowhere to stand: dull toll, nothing changes, area.enter {refused} is raised, the frame copies are gone
//   lost    the WebGL context is lost 0.5 s into the crossing / during the passage and comes back: the hero ends in the other night, the picture is back
//   leave   the scene is left in the middle of the ring / of the passage: nothing of the crossing stays behind; the scene opens again and crosses
//   memory  a fallen enemy and a broken jar of one night after crossing there and back (run on both trees: the two lines must be equal)
//   alloc   bytes allocated per frame while each phase is held (sampling heap profiler), next to plain play
//   tiers   low / mid / high: one crossing each (the low tier shows ring, frozen picture, reveal - frames are written to <out>/tier_<t>/)
//   gl1     WebGL1 (?v2gl=1): the old veil still crosses
//   post    the post pass on (?v2post=1): one crossing, frames to <out>/post/
import fs from 'node:fs';
import { argv, serve, launch, openArea, standAtBell, steps, frame } from './cross_lib.mjs';

const A = argv(), OUT = String(A.out || '/tmp/claude-0/v2/cross/edge'), RES = Number(A.res ?? 0.5), ONLY = String(A.only || 'refuse,lost,leave,memory,alloc,tiers,gl1,post').split(',');
fs.mkdirSync(OUT, { recursive: true });
const S = await serve(A.root ? String(A.root) : undefined), { browser, ctx, page, errs } = await launch(String(A.device || 'fold_open'));
const fails = [], lines = [];
const ok = (m) => { lines.push('ok   ' + m); console.log('  ok   ' + m); }, fail = (m) => { fails.push(m); lines.push('FAIL ' + m); console.log('  FAIL ' + m); }, info = (m) => { lines.push('info ' + m); console.log('  info ' + m); };
const Q = `${RES < 1 ? '&v2res=' + RES : ''}`;
const st = () => page.evaluate(() => { const v = window.__v2, sc = v?.scene, cx = sc?.cx; return sc ? { area: v.area, ready: !!sc.ready, xing: !!sc.xing, go: !!sc._go, locked: !!sc.locked, phase: cx?.phase ?? '', on: !!cx?.on, t: cx?.t ?? 0, bytes: cx?.bytes ?? 0, cross: sc.state.cross ? 1 : 0, lost: !!sc.glr?.lost, loaded: cx?.log.loaded ?? 0, answer: cx ? cx.pre !== undefined : true, fade: sc.fadeA ?? 0, hp: Math.round(sc.sim?.hero?.hp ?? 0), err: v.error ?? null } : null; });
/** tick (waiting in real time for what runs in real time) until pred(state) */
async function until(pred, max = 1500) { let s = null; for (let i = 0; i < max; i++) { s = await st(); if (!s || pred(s)) return s; if ((s.phase === 'gather' && !s.answer) || (s.phase === 'passage' && !s.loaded) || (!s.ready && !s.on)) await page.waitForTimeout(60); await steps(page, 2); } return s; }
const done = (s) => s.ready && !s.xing && !s.on && !s.go && s.fade <= 0.01;
const cross = (o) => page.evaluate((opts) => window.__v2.scene.cross(opts ?? null), o ?? null);
const errN = () => errs.length;
try {
  if (ONLY.includes('refuse')) {
    await openArea(page, S.port, 'eshville_now', Q); await standAtBell(page, 'big_bell'); await steps(page, 20);
    const pre = await page.evaluate(() => { const sc = window.__v2.scene, h = sc.sim.hero; window.__ev = []; sc.setStory((n, d) => { if (n === 'area.enter') window.__ev.push(JSON.stringify(d)); }); const b = sc.cx._build; sc.cx._build = async function () { await this._yield(); sc.cx._build = b; return { pre: null, spot: null }; }; return { x: h.x, z: h.z, hp: h.hp, area: window.__v2.area, nights: sc.nights.size }; });
    const e0 = errN(), r = await cross(); await until((s) => s.phase === 'dull' && s.t > 0.2); await frame(page, `${OUT}/refuse_dull.png`); const mid = await st();
    const s = await until(done); await steps(page, 30);
    const post = await page.evaluate(() => { const sc = window.__v2.scene, h = sc.sim.hero; return { x: h.x, z: h.z, hp: h.hp, area: window.__v2.area, ev: window.__ev, refused: sc._refused, log: sc.cx.log.refused, pad: sc.hud.metrics?.().pad?.back ?? null, nights: sc.nights.size, tex: [sc.cx.texA, sc.cx.texB, sc.cx.depth, sc.cx.texF].filter(Boolean).length }; });
    const line = `refusal: cross() -> ${r}; dull phase seen ${mid.phase === 'dull'} (hero held ${mid.locked}); after: area ${post.area}, hero moved ${Math.round(Math.hypot(post.x - pre.x, post.z - pre.z))} px, hp ${pre.hp} -> ${post.hp}, crossing state ${s.xing}/${s.on}/${s.locked}, state.cross ${s.cross}, frame copies ${post.tex} (${s.bytes} bytes), pad back ${post.pad}, raised ${JSON.stringify(post.ev)}, page errors ${errN() - e0}`;
    if (r === true && mid.phase === 'dull' && post.area === pre.area && !s.xing && !s.on && !s.locked && !s.cross && s.bytes === 0 && post.tex === 0 && post.ev.length === 1 && post.ev[0].includes('"refused":true') && Math.hypot(post.x - pre.x, post.z - pre.z) < 2 && post.hp === pre.hp && errN() === e0 && post.pad === false) ok(line); else fail(line);
    const r2 = await cross(); const s2 = await until(done); await steps(page, 20);
    if (r2 === true && s2.area === 'eshville_past') ok(`after a refusal the next crossing arrives (${s2.area})`); else fail(`after a refusal: cross() -> ${r2}, area ${s2?.area}`);
  }
  if (ONLY.includes('lost')) {
    for (const when of ['ring', 'passage']) {
      await openArea(page, S.port, 'eshville_now', Q); await standAtBell(page, 'big_bell'); await steps(page, 20);
      const e0 = errN(); await cross();
      if (when === 'ring') await until((s) => s.phase === 'ring' && s.t >= 0.38); else await until((s) => s.phase === 'passage' && s.t >= 0.2);   // (gather 0.1 + ring 0.4 = 0.5 s into the crossing)
      await page.evaluate(() => { const gl = window.__v2.scene.glr.gl; window.__lc = gl.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
      await page.waitForTimeout(150); await steps(page, 20); const lost = await st(); await frame(page, `${OUT}/lost_${when}_a.png`);
      await page.waitForTimeout(400); await steps(page, 12);
      await page.evaluate(() => window.__lc.restoreContext()); await page.waitForTimeout(300); await steps(page, 6); await frame(page, `${OUT}/lost_${when}_b.png`);
      const s = await until(done, 2500); await steps(page, 40); await frame(page, `${OUT}/lost_${when}_c.png`);
      const p = await page.evaluate(() => { const v = window.__v2, sc = v.scene, gl = sc.glr.gl, px = new Uint8Array(4 * 16); sc._gl(sc.game.viewW, sc.game.viewH, 1, false); gl.readPixels((gl.drawingBufferWidth >> 1) - 2, (gl.drawingBufferHeight >> 1) - 2, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, px); let sum = 0; for (let i = 0; i < 64; i += 4) sum += px[i] + px[i + 1] + px[i + 2]; const e1 = gl.getError(); while (gl.getError()) { /* drain what the dead objects left */ } sc._gl(sc.game.viewW, sc.game.viewH, 1, false); return { lit: sum, lost: sc.glr.lost, restored: sc.glr.restored, glErr: e1 + ' right after, ' + gl.getError() + ' on the next frame', hero: sc.sim.hero.onGround, bytes: sc.cx.bytes }; });
      const line = `context lost in the ${when} (${lost.phase || 'no phase'} when it went, context lost ${lost.lost}): ended in ${s?.area}, crossing over ${s ? !s.xing && !s.on : false}, context back ${!p.lost} (restored ${p.restored}), picture drawn (centre sum ${p.lit}), GL error ${p.glErr}, frame copies ${p.bytes} bytes, page errors ${errN() - e0}`;
      if (s && s.area === 'eshville_past' && !s.xing && !s.on && !s.locked && !p.lost && p.lit > 60 && p.bytes === 0 && errN() === e0) ok(line); else fail(line);
    }
  }
  if (ONLY.includes('leave')) {
    for (const when of ['ring', 'passage']) {
      await openArea(page, S.port, 'eshville_now', Q); await standAtBell(page, 'big_bell'); await steps(page, 20);
      const e0 = errN(), n0 = await page.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length, pad: !!document.getElementById('v2pad') }));
      await cross(); await until((s) => (when === 'ring' ? s.phase === 'ring' && s.t >= 0.2 : s.phase === 'passage' && s.t >= 0.3));
      const mid = await st();
      const left = await page.evaluate(async () => {
        const g = window.__game, sc = window.__v2.scene, cx = sc.cx; window.__old = sc;
        g.go(g.registry.v2pick ? 'v2pick' : 'title', {}, {}); for (let i = 0; i < 90; i++) g.tick(1 / 60); g.render();
        await new Promise((r) => setTimeout(r, 900));   // whatever the load still had in flight lands on a scene that is gone
        for (let i = 0; i < 30; i++) g.tick(1 / 60); g.render();
        return { top: g.top?.constructor?.name ?? '?', v2: !!window.__v2, glr: !!sc.glr, xing: !!sc.xing, on: cx.on, progs: [cx.pPass, cx.pWorld, cx.pField, cx.vao].filter(Boolean).length, tex: [cx.texA, cx.texB, cx.depth, cx.texF, cx.texL, cx.fboA, cx.fboB, cx.fboF].filter(Boolean).length, bytes: cx.bytes, yq: cx._yq.length, port: cx._ch.port1.onmessage === null, hold: !!cx._holdRes, loop: cx.loopId,
          canvases: document.querySelectorAll('canvas').length, glCanvas: !!document.getElementById('v2g-gl'), pad: !!document.getElementById('v2pad'), hudLayer: !!document.getElementById('v2g-hud') };
      });
      const line = `left in the ${when} (${mid.phase} ${mid.t.toFixed(2)} s, ${mid.bytes} bytes of frame copies): scene gone ${!left.v2 && !left.glr}, crossing ${left.on}/${left.xing}, programs ${left.progs}, textures + frame buffers ${left.tex} (${left.bytes} bytes), waiting yields ${left.yq}, message port closed ${left.port}, held load ${left.hold}, sound loop ${left.loop}, canvases ${n0.canvases} -> ${left.canvases} (GL canvas ${left.glCanvas}, pad layer ${left.pad}, HUD layer ${left.hudLayer}), page errors ${errN() - e0}`;
      if (!left.v2 && !left.glr && !left.on && !left.xing && left.progs === 0 && left.tex === 0 && left.bytes === 0 && left.yq === 0 && left.port && !left.hold && !left.loop && !left.glCanvas && !left.pad && !left.hudLayer && errN() === e0) ok(line); else fail(line);
    }
    // the scene opens again and crosses
    await openArea(page, S.port, 'eshville_now', Q); await standAtBell(page, 'big_bell'); await steps(page, 20); await cross(); const s = await until(done); await steps(page, 10);
    if (s?.area === 'eshville_past') ok('opened again after leaving: the crossing arrives'); else fail('opened again after leaving: ' + JSON.stringify(s));
  }
  if (ONLY.includes('memory')) {
    await openArea(page, S.port, 'eshville_now', Q); await standAtBell(page, 'big_bell'); await steps(page, 20);
    const a = await page.evaluate(async () => {
      const sc = window.__v2.scene, sim = sc.sim, m = await import('/src/v2/play/breakables.js');
      const e = sim.enemies.find((q) => !q.dead && q.state !== 'dead'); if (e) { e.hp = 0; sim._kill(e); }
      const b = (sim.breakables ?? []).find((q) => !q.broken); if (b) m.breakOne(sim, b, 'hero', 1, 0);
      for (let i = 0; i < 90; i++) window.__game.tick(1 / 60);
      return { fell: e ? e.kind + '@' + Math.round(e.homeX ?? e.x) + ',' + Math.round(e.homeZ ?? e.z) : null, broke: b ? b.id : null, dead: sim.enemies.filter((q) => q.dead || q.state === 'dead').length, broken: sim.breakables.filter((q) => q.broken).length, coins: sc.brk.coins };
    });
    await cross(); await until(done); await steps(page, 20); await standAtBell(page, 'big_bell'); await steps(page, 10);
    const mid = await page.evaluate(() => { const sc = window.__v2.scene; return { area: window.__v2.area, nights: [...sc.nights.keys()].map((k) => k + ':' + sc.nights.get(k).dead.size) }; });
    await cross(); await until(done); await steps(page, 20);
    const b = await page.evaluate(() => { const sc = window.__v2.scene, sim = sc.sim; return { area: window.__v2.area, dead: sim.enemies.filter((q) => q.dead || q.state === 'dead').length, broken: sim.breakables.filter((q) => q.broken).length, coins: sc.brk.coins, nights: [...sc.nights.keys()].map((k) => k + ':' + sc.nights.get(k).dead.size) }; });
    info(`MEMORY (compare between trees): fell ${a.fell}, broke ${a.broke}; before leaving: fallen ${a.dead}, broken ${a.broken}, coins ${a.coins}; over there ${mid.area} nights ${mid.nights.join(' ')}; back in ${b.area}: fallen ${b.dead}, broken ${b.broken}, coins ${b.coins}, nights ${b.nights.join(' ')}`);
    if (b.area === 'eshville_now' && b.dead === a.dead && b.coins === a.coins) ok('the fallen stay fallen and the purse is kept across there-and-back'); else fail('memory changed: ' + JSON.stringify({ a, b }));
  }
  if (ONLY.includes('alloc')) {
    await openArea(page, S.port, 'eshville_now', Q); await standAtBell(page, 'big_bell'); await steps(page, 120);
    const cdp = await ctx.newCDPSession(page);
    const sample = async (label, n, prep) => {
      await page.evaluate(() => { try { window.gc(); window.gc(); } catch { /* no gc */ } });
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await page.evaluate(([k, p]) => { const g = window.__game, cx = window.__v2.scene.cx; for (let i = 0; i < k; i++) { if (p === 'ring') cx.t = 0.2; else if (p === 'reveal') cx.t = 0.4; g.tick(1 / 60); g.alpha = 1; g.render(); } }, [n, prep]);
      const { profile } = await cdp.send('HeapProfiler.stopSampling'); const by = new Map(); let all = 0;
      const walk = (nd) => { const u = (nd.callFrame.url || '').replace(/^.*\/src\//, 'src/'), k = `${nd.callFrame.functionName || '(anonymous)'} ${u}:${nd.callFrame.lineNumber + 1}`; if (nd.selfSize && !/evaluate|__playwright/.test(k) && u) { by.set(k, (by.get(k) ?? 0) + nd.selfSize); all += nd.selfSize; } for (const c of nd.children ?? []) walk(c); };
      walk(profile.head);
      const mine = [...by].filter(([k]) => /crossing\.js|ui\/hud\.js|ui\/pad\.js|ui\/index\.js/.test(k)).reduce((q, [, v]) => q + v, 0);
      const top = [...by].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([k, v]) => `${(v / n).toFixed(0)} B ${k.replace(/^.* src\//, '')}`).join('; ');
      info(`alloc ${label}: ${(all / n).toFixed(0)} bytes per frame over ${n} frames (in crossing.js + the HUD/pad of the interface: ${(mine / n).toFixed(0)}); top: ${top || '-'}`);
      return { all: all / n, mine: mine / n };
    };
    const base = await sample('plain play (no crossing)', 240, '');
    await cross(); await until((s) => s.phase === 'ring'); const ring = await sample('ring (held)', 240, 'ring');
    await page.evaluate(() => { window.__v2.scene.cx.minT = 1e9; }); await until((s) => s.phase === 'passage' && s.loaded > 0); const pass = await sample('passage (held, the load done)', 240, '');
    await page.evaluate(() => { window.__v2.scene.cx.minT = 0; }); await until((s) => s.phase === 'reveal'); const rev = await sample('reveal (held)', 240, 'reveal');
    await until((s) => s.phase === 'glow'); const glow = await sample('glow (the badge turns, the controls return)', 60, '');
    await until(done); await steps(page, 10);
    const worst = Math.max(ring.mine, pass.mine, rev.mine, glow.mine);
    if (worst <= 24) ok(`nothing is allocated per frame by the crossing, its HUD part or the pad (at most ${worst.toFixed(0)} bytes per frame sampled; plain play ${base.all.toFixed(0)}, ring ${ring.all.toFixed(0)}, passage ${pass.all.toFixed(0)}, reveal ${rev.all.toFixed(0)}, glow ${glow.all.toFixed(0)} bytes per frame in all code)`); else fail(`per-frame allocation in the crossing's own code: ring ${ring.mine.toFixed(0)}, passage ${pass.mine.toFixed(0)}, reveal ${rev.mine.toFixed(0)}, glow ${glow.mine.toFixed(0)} bytes per frame`);
  }
  for (const [name, q] of [['tiers', null], ['gl1', '&v2gl=1'], ['post', '&v2post=1']]) {
    if (!ONLY.includes(name)) continue;
    for (const tier of name === 'tiers' ? ['low', 'mid', 'high'] : ['mid']) {
      const dir = name === 'tiers' ? `${OUT}/tier_${tier}` : `${OUT}/${name}`; fs.mkdirSync(dir, { recursive: true });
      await openArea(page, S.port, 'eshville_now', `${Q}&v2tier=${tier}${q ?? ''}`); await standAtBell(page, 'big_bell'); await steps(page, 20);
      const e0 = errN(), inf = await page.evaluate(() => ({ canvas: window.__v2.stats.gl.canvas, api: window.__v2.stats.gl.api, post: window.__v2.stats.fx?.post ?? null, tier: window.__v2.stats.fx?.tier ?? null, usable: !!window.__v2.scene.cx?.usable }));
      await cross();
      if (inf.usable) {
        await until((s) => s.phase === 'ring' && s.t >= 0.14); await frame(page, `${dir}/1_ring.png`);
        await until((s) => s.phase === 'passage' && s.t >= 0.7); await frame(page, `${dir}/2_passage.png`); const bytes = (await st()).bytes;
        await until((s) => s.phase === 'reveal' && s.t >= 0.4); await frame(page, `${dir}/3_reveal.png`);
        const s = await until(done); await steps(page, 30); await frame(page, `${dir}/4_after.png`);
        const line = `${name} ${tier}: ${JSON.stringify(inf)} -> ${s?.area}; frame copies while it ran ${(bytes / 1048576).toFixed(1)} MB, after ${s?.bytes} bytes; page errors ${errN() - e0}`;
        if (s?.area === 'eshville_past' && s.bytes === 0 && errN() === e0) ok(line); else fail(line);
      } else {
        await steps(page, 30); await frame(page, `${dir}/1_veil.png`); const s = await until(done, 2500); await steps(page, 30); await frame(page, `${dir}/4_after.png`);
        const line = `${name}: ${JSON.stringify(inf)} -> ${s?.area} by the old veil; page errors ${errN() - e0}`;
        if (s?.area === 'eshville_past' && errN() === e0) ok(line); else fail(line);
      }
    }
  }
} catch (e) { fail('tool error: ' + String(e?.stack ?? e)); }
console.log(`  page errors: ${errs.length}`); for (const e of errs.slice(0, 10)) console.log('    ' + e);
fs.writeFileSync(`${OUT}/edge.txt`, lines.join('\n') + '\n' + (errs.length ? 'page errors:\n' + errs.join('\n') + '\n' : ''));
await ctx.close(); await browser.close(); S.close();
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL OK');
process.exit(fails.length ? 1 : 0);
