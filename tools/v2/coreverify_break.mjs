// CORE-VERIFY: tries to break scene v2g and measures it (compare with v2c).
//   node tools/v2/coreverify_break.mjs [--device fold_open] [--out /tmp/claude-0/v2/coreverify] [--only stats,alloc,allocrt,allocc,cycle,perf,gl1,hz,fuzz,stuck]
// alloc: sampling heap profiler (CDP) attributes allocated bytes to functions; heap growth over 60 s of fighting.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/coreverify');
const ONLY = args.only ? String(args.only).split(',') : null, want = (k) => !ONLY || ONLY.includes(k);
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'];
const R = { device: DEV }, fails = [];
const fail = (m) => { fails.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const note = (m) => console.log('       ' + m);
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
fs.mkdirSync(`${OUT}/${DEV}`, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const errs = [];

/** page side: a small fight bot through the input auto source (fixed action objects: the bot itself allocates nothing per tick) */
function installBot() {
  const g = window.__game; g._pageHidden = true;
  const ACT = []; for (let i = 0; i < 64; i++) ACT.push({ left: !!(i & 1), right: !!(i & 2), up: !!(i & 4), down: !!(i & 8), attack: !!(i & 16), dash: !!(i & 32) });
  const B = (window.__fb = { n: 0, cur: ACT[0], seed: 1 });
  g.input.setAutoSource(() => B.cur);
  B.fight = () => {
    const sim = window.__v2.scene.sim, h = sim.hero, E = sim.enemies; B.n++; let m = 0;
    let tg = null, bd = 1e9; for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.dead || e.state === 'dead' || Math.abs(e.y - h.y) > 110) continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd) { bd = d; tg = e; } }
    if (tg && !h.dead) { const dx = tg.x - h.x, dz = tg.z - h.z; if (dx > 12) m |= 2; else if (dx < -12) m |= 1; if (dz > 10) m |= 4; else if (dz < -10) m |= 8; if (bd < 80) { if (B.n % 9 < 2) m |= 16; else if (B.n % 150 === 149) m |= 32; } }
    B.cur = ACT[m];
  };
  B.rnd = () => { B.seed = (B.seed * 1103515245 + 12345) & 0x7fffffff; return B.seed / 0x7fffffff; };
  B.fuzz = (mode) => { B.n++; if (B.n % 7 === 0) { let m = Math.floor(B.rnd() * 16); const r = B.rnd(); if (mode === 'spam') m |= 16; else { if (r < 0.25) m |= 16; if (r > 0.8) m |= 32; } B.cur = ACT[m]; } if (mode === 'spam' && B.n % 2) B.cur = ACT[B.cur === ACT[0] ? 16 : (ACT.indexOf(B.cur) ^ 16)]; };
  B.ACT = ACT;
  return true;
}

async function open(q, { dev = DEV, init = null } = {}) {
  const ctx = await browser.newContext(contextOptions(dev)), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`[pageerror ${q}] ` + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`[console ${q}] ` + m.text().slice(0, 300)); });
  if (init) await page.addInitScript(init);
  await page.goto(`http://localhost:${port}/index.html?${q}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 }).catch(() => {});
  return { ctx, page };
}

/** sampling heap profile of fn running in the page; returns top functions by allocated bytes */
async function profiled(page, src, arg) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await page.evaluate(() => { if (window.gc) { window.gc(); window.gc(); } });
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const res = await page.evaluate(([s, a]) => (0, eval)(s)(a), [src, arg]);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const by = new Map(); let total = 0;
  const walk = (n, parents) => { const f = n.callFrame, key = `${f.functionName || '(anon)'} ${String(f.url).replace(/^.*?\/(src|tools)\//, '$1/')}:${f.lineNumber + 1}`; if (n.selfSize) { total += n.selfSize; const o = by.get(key) ?? { self: 0, via: new Map() }; o.self += n.selfSize; const p = parents.slice(-3).join(' < '); o.via.set(p, (o.via.get(p) ?? 0) + n.selfSize); by.set(key, o); } for (const c of n.children ?? []) walk(c, [...parents, f.functionName || '(anon)']); };
  walk(profile.head, []);
  const top = [...by.entries()].sort((a, b) => b[1].self - a[1].self).slice(0, 14).map(([k, o]) => ({ fn: k, bytes: o.self, via: [...o.via.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '' }));
  await cdp.detach();
  return { res, total, top };
}
const RUN = `(async (o) => {
  const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim, B = window.__fb, mem = () => performance.memory.usedJSHeapSize, gc = () => { if (window.gc) { window.gc(); window.gc(); } };
  if (o.spot) { sim.reset(); sc.cam.snap = true; v.teleport(o.spot); }
  if (sc.perf && o.tiny) sc.perf.resK = 0.08;
  for (let i = 0; i < (o.warm || 0); i++) { if (o.fight) B.fight(); else B.cur = B.ACT[0]; g.tick(1 / 60); g.render(); }
  gc(); const m0 = mem(), t0 = performance.now(); let up = 0, last = m0, n = 0, kills = 0, hits = 0, deaths0 = sim.deaths || 0, maxDraw = 0, maxTri = 0;
  const alive = () => { let c = 0; for (const e of sim.enemies) if (!e.dead && e.state !== 'dead') c++; return c; };
  let a0 = alive();
  for (; n < o.ticks; n++) {
    if (o.fight) { B.fight(); if (n % 600 === 599 && alive() === 0) { kills += a0; sim.reset(); v.teleport(o.spot); a0 = alive(); } if (sim.hero.hp < 40 && !sim.hero.dead) sim.hero.hp = 100; } else B.cur = B.ACT[0];
    g.tick(1 / 60); g.alpha = 0.5; g.render();
    const m = mem(); if (m > last) up += m - last; last = m;
    if (o.gap) await new Promise((r) => setTimeout(r, o.gap));   // real-time pacing: the engine gets time to optimize, as on a device
    if (performance.now() - t0 > o.maxMs) { n++; break; }
  }
  const m1 = mem(); gc(); const m2 = mem();
  const s = v.stats;
  return { ticks: n, wallMs: Math.round(performance.now() - t0), heapStart: m0, heapEndBeforeGc: m1, heapEndAfterGc: m2, retainedGrowth: m2 - m0, risePerTick: Math.round(up / n), deaths: (sim.deaths || 0) - deaths0, kills: kills + a0 - alive(), gl: s.gl ? { draws: s.gl.draws, tris: s.gl.tris, texMB: s.gl.texMB } : null };
})`;

try {
  // ───────── v2g: numbers at each spot, allocation, fuzz, stuck ─────────
  if (want('stats') || want('alloc') || want('allocrt') || want('fuzz') || want('stuck')) {
    const { ctx, page } = await open('scene=v2g&area=slice0&v2auto=0');
    const st = await page.evaluate(() => ({ ready: window.__v2?.ready, error: window.__v2?.error }));
    if (!st.ready) fail('v2g not ready: ' + JSON.stringify(st));
    await page.evaluate(installBot);
    if (want('stats')) {
      R.stats = await page.evaluate(() => { const g = window.__game, v = window.__v2, out = {}; for (const s of ['street', 'corner', 'alley', 'stairs', 'garden', 'yard']) { v.scene.sim.reset(); v.teleport(s); for (let i = 0; i < 20; i++) g.tick(1 / 60); g.render(); const q = v.stats; out[s] = { draws: q.gl.draws, tris: q.gl.tris, worldTris: q.world.tris, charTris: q.chars.tris, drawn: q.chars.drawn, culled: q.chars.culled, texMB: q.gl.texMB, bufMB: +(q.gl.bufBytes / 1048576).toFixed(1), canvas: q.gl.canvas, api: q.gl.api, resK: q.resK, hud: q.hud, mode: q.mode }; } return out; });
      ok('v2g numbers per spot: ' + Object.entries(R.stats).map(([k, s]) => `${k} ${s.draws} draws ${Math.round(s.tris / 1000)}k tris (chars ${Math.round(s.charTris / 1000)}k) drawn ${s.drawn}/${s.drawn + s.culled}`).join(' · '));
      note(`textures ${R.stats.yard.texMB} MB, buffers ${R.stats.yard.bufMB} MB, GL canvas ${R.stats.yard.canvas.join('x')}, ${R.stats.yard.api}, resK ${R.stats.yard.resK}, hud ${R.stats.yard.hud}, layer ${R.stats.yard.mode}`);
    }
    if (want('alloc')) {
      const idle = await profiled(page, RUN, { spot: 'street', warm: 600, ticks: 600, tiny: true, maxMs: 120000 });
      R.allocIdle = idle; note(`v2g standing in the street, 600 frames: sampled ${Math.round(idle.total / idle.res.ticks)} B/frame (heap rise ${idle.res.risePerTick} B/frame), ${idle.res.wallMs} ms`);
      for (const t of idle.top.slice(0, 8)) note(`   ${String(Math.round(t.bytes / idle.res.ticks)).padStart(6)} B/frame  ${t.fn}   via ${t.via}`);
      const fight = await profiled(page, RUN, { spot: 'yard', warm: 300, ticks: 3600, fight: true, tiny: true, maxMs: 200000 });
      R.allocFight = fight; const f = fight.res;
      note(`v2g fighting in the yard, ${f.ticks} frames (${(f.ticks / 60).toFixed(0)} s of play, ${f.wallMs} ms wall): sampled ${Math.round(fight.total / f.ticks)} B/frame, heap rise ${f.risePerTick} B/frame, heap after GC ${(f.heapStart / 1048576).toFixed(1)} > ${(f.heapEndAfterGc / 1048576).toFixed(1)} MB (kept ${(f.retainedGrowth / 1024).toFixed(0)} KB), kills ${f.kills}, hero deaths ${f.deaths}`);
      for (const t of fight.top.slice(0, 10)) note(`   ${String(Math.round(t.bytes / f.ticks)).padStart(6)} B/frame  ${t.fn}   via ${t.via}`);
    }
    if (want('allocrt')) {   // the same fight paced in real time (about 60 frames a second) for 30 s
      const rt = await profiled(page, RUN, { spot: 'yard', warm: 300, ticks: 1800, fight: true, tiny: true, gap: 12, maxMs: 40000 });
      R.allocFightRealtime = rt; const f = rt.res;
      note(`v2g fighting in the yard in real time, ${f.ticks} frames in ${f.wallMs} ms: sampled ${Math.round(rt.total / f.ticks)} B/frame, heap rise ${f.risePerTick} B/frame, kept ${(f.retainedGrowth / 1024).toFixed(0)} KB`);
      for (const t of rt.top.slice(0, 8)) note(`   ${String(Math.round(t.bytes / f.ticks)).padStart(6)} B/frame  ${t.fn}   via ${t.via}`);
    }
    if (want('fuzz')) {
      const fz = await page.evaluate(async () => {
        const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim, B = window.__fb, W = sim.W, out = [];
        const S = W.sections ?? []; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const s of S) { x0 = Math.min(x0, s.x0); x1 = Math.max(x1, s.x1); z0 = Math.min(z0, s.z0); z1 = Math.max(z1, s.z1); }
        for (const [mode, spot, seed] of [['mix', 'street', 7], ['mix', 'pit', 11], ['mix', 'corner', 3], ['mix', 'stairs', 5], ['mix', 'yard', 9], ['spam', 'yard', 2], ['spam', 'alley', 4]]) {
          sim.reset(); const tp = v.teleport(spot); B.seed = seed; B.n = 0; const d0 = sim.deaths || 0;
          const r = { mode, spot, tp, ticks: 0, bad: null, minY: 1e9, outside: 0, pitFalls: 0, deaths: 0, swings: 0, rolls: 0, maxMoveAge: 0, stuckAnim: null, thrown: null };
          let hp = sim.hero.hp, lastMove = null, moveAge = 0;
          try {
            for (let i = 0; i < 3000; i++) {
              B.fuzz(mode); g.tick(1 / 60); if (i % 30 === 0) g.render();
              const h = sim.hero; r.ticks++;
              if (!Number.isFinite(h.x + h.y + h.z + h.vx + h.vz + h.dirX + h.dirZ)) { r.bad = { i, x: h.x, y: h.y, z: h.z, vx: h.vx, dirX: h.dirX }; break; }
              r.minY = Math.min(r.minY, h.y);
              if (h.x < x0 - 40 || h.x > x1 + 40 || h.z < z0 - 40 || h.z > z1 + 40) r.outside++;
              if (h.hp < hp && h.y < -100) r.pitFalls++; hp = h.hp;
              if (h.move) { if (h.move === lastMove) moveAge++; else { moveAge = 0; r.swings++; } r.maxMoveAge = Math.max(r.maxMoveAge, moveAge); } lastMove = h.move;
              if (mode === 'spam' && h.hp < 60) h.hp = 100;
              for (const e of sim.enemies) if (!e.dead && !Number.isFinite(e.x + e.y + e.z)) { r.bad = { i, enemy: e.id, kind: e.kind, x: e.x, y: e.y, z: e.z }; break; }
              if (r.bad) break;
            }
          } catch (e) { r.thrown = String(e?.stack ?? e).slice(0, 500); }
          r.deaths = (sim.deaths || 0) - d0; r.end = [Math.round(sim.hero.x), Math.round(sim.hero.y), Math.round(sim.hero.z), sim.hero.hp, sim.section]; r.minY = Math.round(r.minY);
          out.push(r);
        }
        B.cur = B.ACT[0]; return { bounds: [x0, x1, z0, z1], runs: out };
      });
      R.fuzz = fz;
      for (const r of fz.runs) (r.bad || r.thrown || r.outside > 0 || r.maxMoveAge > 600 ? fail : ok)(`fuzz ${r.mode} from ${r.spot}: ${r.ticks} ticks, lowest y ${r.minY}, outside the map ${r.outside} ticks, deaths ${r.deaths}, swings ${r.swings}, longest single move ${r.maxMoveAge} ticks, ends ${r.end.join(',')}${r.bad ? ' BAD ' + JSON.stringify(r.bad) : ''}${r.thrown ? ' THROWN ' + r.thrown : ''}`);
    }
    if (want('stuck')) {
      const sk = await page.evaluate(() => {
        const g = window.__game, v = window.__v2, sim = v.scene.sim, B = window.__fb, out = {};
        for (const spot of ['street', 'corner', 'alley', 'garden', 'yard']) {
          sim.reset(); v.teleport(spot); B.cur = B.ACT[0]; const P = new Map();
          for (let i = 0; i < 1500; i++) { sim.hero.hp = 100; g.tick(1 / 60); if (i === 1200) for (const e of sim.enemies) P.set(e.id, [e.x, e.z]); if (i % 60 === 0) g.render(); }
          const h = sim.hero, L = [];
          for (const e of sim.enemies) { if (e.dead || e.state === 'dead' || !e.active) continue; const p = P.get(e.id), mv = p ? Math.hypot(e.x - p[0], e.z - p[1]) : -1, d = Math.hypot(e.x - h.x, e.z - h.z); if (d > 260 && mv < 12 && !e.def?.shot && e.kind !== 'ranged') L.push({ id: e.id, kind: e.kind, state: e.state, d: Math.round(d), moved: Math.round(mv), at: [Math.round(e.x), Math.round(e.y), Math.round(e.z)] }); }
          out[spot] = { active: sim.enemies.filter((e) => !e.dead && e.active).length, total: sim.enemies.filter((e) => !e.dead).length, stuck: L, hero: [Math.round(h.x), Math.round(h.z)] };
        }
        return out;
      });
      R.stuck = sk; const all = Object.entries(sk).flatMap(([k, s]) => s.stuck.map((q) => ({ spot: k, ...q })));
      (all.length ? fail : ok)(`stuck enemies (hero stands 25 s at each spot): ${all.length ? JSON.stringify(all) : 'none'}; awake ` + Object.entries(sk).map(([k, s]) => `${k} ${s.active}/${s.total}`).join(' · '));
    }
    await ctx.close();
  }

  // ───────── v2c: the same fight for comparison ─────────
  if (want('allocc')) {
    const { ctx, page } = await open('scene=v2c');
    await page.evaluate(installBot);
    R.statsC = await page.evaluate(() => { const g = window.__game, v = window.__v2, out = {}; for (const s of ['street', 'alley', 'yard']) { v.scene.sim.reset(); v.teleport(s); for (let i = 0; i < 20; i++) g.tick(1 / 60); g.render(); const q = v.stats; out[s] = { draws: q.gl?.draws, tris: q.gl?.tris, texMB: q.gl?.texMB ?? (q.gl?.texBytes ? +(q.gl.texBytes / 1048576).toFixed(1) : null), keys: Object.keys(q) }; } return out; });
    note('v2c numbers per spot: ' + JSON.stringify(R.statsC).slice(0, 500));
    const fight = await profiled(page, RUN, { spot: 'yard', warm: 300, ticks: 3600, fight: true, tiny: false, maxMs: 200000 });
    R.allocFightC = fight; const f = fight.res;
    note(`v2c fighting in the yard, ${f.ticks} frames (${f.wallMs} ms wall): sampled ${Math.round(fight.total / f.ticks)} B/frame, heap rise ${f.risePerTick} B/frame, heap after GC ${(f.heapStart / 1048576).toFixed(1)} > ${(f.heapEndAfterGc / 1048576).toFixed(1)} MB (kept ${(f.retainedGrowth / 1024).toFixed(0)} KB)`);
    for (const t of fight.top.slice(0, 6)) note(`   ${String(Math.round(t.bytes / f.ticks)).padStart(6)} B/frame  ${t.fn}   via ${t.via}`);
    await ctx.close();
  }

  // ───────── leave and re-enter five times ─────────
  if (want('cycle')) {
    const { ctx, page } = await open('scene=v2g&area=slice0&v2auto=0');
    const cy = await page.evaluate(async () => {
      const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms)), out = [];
      const gc = () => { if (window.gc) { window.gc(); window.gc(); } };
      const snap = () => { const s = window.__v2.stats; gc(); return { tex: s.gl.texBytes, buf: s.gl.bufBytes, canvases: s.canvases, dom: document.querySelectorAll('canvas').length, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) }; };
      const play = () => { g._pageHidden = true; const sim = window.__v2.scene.sim; for (let i = 0; i < 240; i++) { g.tick(1 / 60); if (i % 20 === 0) g.render(); } g._pageHidden = false; return sim.hero.hp; };
      play(); const first = snap();
      for (let i = 0; i < 5; i++) {
        g.go(i % 2 ? 'title' : (g.registry.v2pick ? 'v2pick' : 'title'), {}, { fade: false }); await wait(500);
        gc(); const away = { top: g.top?.constructor?.name, v2: typeof window.__v2, dom: document.querySelectorAll('canvas').length, gl: !!document.getElementById('v2g-gl'), heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) };
        g.go('v2g', {}, { fade: false });
        const t0 = performance.now(); while (performance.now() - t0 < 60000 && !(window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error))) await wait(50);
        await wait(300);
        if (!window.__v2?.ready) { out.push({ away, back: { err: window.__v2?.error ?? 'not ready' } }); break; }
        play(); out.push({ away, back: snap() });
      }
      return { first, out };
    });
    R.cycle = cy; const last = cy.out[cy.out.length - 1]?.back ?? {};
    const same = cy.out.length === 5 && cy.out.every((c) => c.back.tex === cy.first.tex && c.back.buf === cy.first.buf && c.back.dom === cy.first.dom && c.back.canvases === cy.first.canvases && !c.away.gl);
    (same ? ok : fail)(`leave and re-enter 5 times: GPU bytes and canvases ${same ? 'the same every time' : 'CHANGED ' + JSON.stringify(cy).slice(0, 600)}; JS heap after GC ${cy.first.heapMB} > ${cy.out.map((c) => c.back.heapMB ?? '?').join(' > ')} MB (away: ${cy.out.map((c) => c.away.heapMB).join(' / ')})`);
    if (last.heapMB - cy.out[1]?.back?.heapMB > 6) fail(`JS heap keeps growing over re-entries: ${cy.out.map((c) => c.back.heapMB).join(' > ')} MB`);
    await ctx.close();
  }

  // ───────── saved perf settings, WebGL1 ─────────
  if (want('perf')) {
    const V = [['{"v":1,"resK":0.5,"cap":60,"post":true,"tier":"low"}', 'low 0.5 cap60 post'], ['{"v":1,"resK":0.75,"hz":120,"post":true,"tier":"high"}', 'high 0.75 120Hz post'], ['{{{not json', 'broken text'], ['{"v":2,"resK":9}', 'unknown version'], ['{"v":1,"resK":-3,"cap":"x","tier":7,"post":"yes","hz":"fast"}', 'wrong types'], ['[]', 'array'], ['"1"', 'string']];
    R.perf = [];
    for (const [val, label] of V) {
      const n0 = errs.length;
      const { ctx, page } = await open('scene=v2g&area=slice0&v2auto=0', { init: `try { localStorage.setItem('bn.v2.perf', ${JSON.stringify(val)}); } catch (e) {}` });
      const r = await page.evaluate(() => { const g = window.__game, v = window.__v2; if (!v?.ready) return { ready: false, error: v?.error ?? null }; g._pageHidden = true; for (let i = 0; i < 30; i++) g.tick(1 / 60); g.render(); const s = v.stats; return { ready: true, resK: s.resK, everyFrame: s.everyFrame, saved: s.perfSaved, tier: s.fx?.tier, post: s.fx?.post, canvas: s.gl.canvas, draws: s.gl.draws }; });
      r.label = label; r.errors = errs.length - n0; R.perf.push(r);
      if (label.startsWith('low')) await page.screenshot({ path: `${OUT}/${DEV}/perf_low.jpg`, type: 'jpeg', quality: 84, scale: 'css' });
      if (label.startsWith('high')) await page.screenshot({ path: `${OUT}/${DEV}/perf_high_post.jpg`, type: 'jpeg', quality: 84, scale: 'css' });
      (r.ready && r.errors === 0 ? ok : fail)(`stored perf "${label}": ready ${r.ready}, resK ${r.resK}, every frame ${r.everyFrame}, tier ${r.tier}, post ${r.post}, GL canvas ${r.canvas?.join('x')}, page errors ${r.errors}`);
      await ctx.close();
    }
  }
  if (want('gl1')) {
    const n0 = errs.length;
    const { ctx, page } = await open('scene=v2g&area=slice0&v2auto=0&v2gl=1');
    const r = await page.evaluate(() => { const g = window.__game, v = window.__v2; if (!v?.ready) return { ready: false, error: String(v?.error ?? 'no __v2') }; g._pageHidden = true; const sim = v.scene.sim; v.teleport('yard'); let thrown = null; try { for (let i = 0; i < 240; i++) { g.tick(1 / 60); if (i % 10 === 0) g.render(); } g.render(); } catch (e) { thrown = String(e?.stack ?? e).slice(0, 400); } const s = v.stats; return { ready: true, api: s.gl.api, fx: s.fx, draws: s.gl.draws, tris: s.gl.tris, drawn: s.chars?.drawn, thrown }; });
    await page.screenshot({ path: `${OUT}/${DEV}/gl1_yard.jpg`, type: 'jpeg', quality: 84, scale: 'css' });
    r.errors = errs.slice(n0); R.gl1 = r;
    (r.ready && r.api === 'webgl1' && !r.thrown && !r.errors.length ? ok : fail)(`WebGL1 path (?v2gl=1): ${JSON.stringify(r).slice(0, 700)}`);
    await ctx.close();
  }

  // ───────── 120 Hz and uneven frame timing: drive the real frame loop with made-up timestamps ─────────
  if (want('hz')) {
    const { ctx, page } = await open('scene=v2g&area=slice0&v2auto=0', { init: `(() => { const real = window.requestAnimationFrame.bind(window); window.__raf = { q: [], manual: false }; window.requestAnimationFrame = (cb) => { if (window.__raf.manual) { window.__raf.q.push(cb); return 0; } return real(cb); }; })();` });
    await page.evaluate(installBot);
    const hz = await page.evaluate(async () => {
      const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim, B = window.__fb, R = window.__raf, out = {};
      g._pageHidden = false; R.manual = true; await new Promise((r) => setTimeout(r, 400));   // the pending real rAF fires once and re-registers through the manual hook
      if (!R.q.length) return { error: 'frame loop not captured' };
      let ts = performance.now() + 1000; const frame = (ms) => { ts += ms; const q = R.q; R.q = []; for (const cb of q) cb(ts); };   // every pending rAF callback (the game loop is one of several)
      const pattern = { hz60: () => 1000 / 60, hz120: () => 1000 / 120, hz90: () => 1000 / 90, uneven: (i) => (i % 9 === 8 ? 34 : i % 2 ? 6.2 : 10.4), hz48: () => 1000 / 48 };
      for (const k of Object.keys(pattern)) {
        sim.reset(); for (const e of sim.enemies) if (!e.yard) e.dead = true; sim.hero.x = 700; sim.hero.z = 190; sc.cam.snap = true; B.cur = B.ACT[0];
        for (let i = 0; i < 30; i++) frame(pattern[k](i)); B.cur = B.ACT[2];   // run right
        for (let i = 0; i < 40; i++) frame(pattern[k](i));
        const t0 = ts, x0 = sim.hero.x, d0 = g.drawn; let prevX = null, prevEye = null, back = 0, steps = [], camSteps = [], n = 0, simT = 0;
        while (ts - t0 < 2000) { const ms = pattern[k](n); frame(ms); n++; const dx = sc.heroA.M[12], ex = sc.eye0[0]; if (prevX !== null) { const d = dx - prevX; steps.push(d / ms); camSteps.push((ex - prevEye) / ms); if (d < -0.01) back++; } prevX = dx; prevEye = ex; }
        const mean = steps.reduce((a, b) => a + b, 0) / steps.length, dev = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length);
        const cm = camSteps.reduce((a, b) => a + b, 0) / camSteps.length, cdev = Math.sqrt(camSteps.reduce((a, b) => a + (b - cm) ** 2, 0) / camSteps.length);
        out[k] = { frames: n, drawn: g.drawn - d0, pxPerSec: +((sim.hero.x - x0) / ((ts - t0) / 1000)).toFixed(1), backSteps: back, drawnSpeedJitter: +(dev / Math.abs(mean || 1)).toFixed(3), camSpeedJitter: +(cdev / Math.abs(cm || 1)).toFixed(3) };
      }
      B.cur = B.ACT[0]; return out;
    });
    R.hz = hz;
    if (hz.error) fail('timing simulation: ' + hz.error);
    else {
      const ref = hz.hz60.pxPerSec; const bad = Object.entries(hz).filter(([k, h]) => Math.abs(h.pxPerSec - ref) > ref * 0.04 || h.backSteps > 0 || h.drawn < h.frames - 1);
      (bad.length ? fail : ok)('frame timing (real loop, made-up clock, hero running right 2 s): ' + Object.entries(hz).map(([k, h]) => `${k} ${h.frames} frames/${h.drawn} drawn, ${h.pxPerSec} px/s, backward steps ${h.backSteps}, drawn-speed jitter ${h.drawnSpeedJitter}, camera ${h.camSpeedJitter}`).join(' | '));
    }
    await ctx.close();
  }
  (errs.length ? fail : ok)(`page errors ${errs.length}${errs.length ? ': ' + errs.slice(0, 5).join(' || ') : ''}`);
} catch (e) { fail('script stopped: ' + String(e?.stack ?? e).slice(0, 700)); }
finally { await browser.close(); srv.close(); }
R.errors = errs.slice(0, 30);
fs.writeFileSync(`${OUT}/break_${DEV}${ONLY ? '_' + ONLY.join('_') : ''}.json`, JSON.stringify(R, null, 1));
console.log(fails.length ? `\n${fails.length} FAIL` : '\nall ok');
process.exit(fails.length ? 1 : 0);
