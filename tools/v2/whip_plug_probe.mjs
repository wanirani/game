// WHIP-VERIFY: plug-in dry run. Opens the real game scene (index.html?scene=v2g), imports src/v2/whip/ inside the page and attaches the whip to the
// scene's hero WITHOUT editing the scene: every step of docs/v2/WHIP.md section 7 is done from outside through window.__v2.scene
// (wrapping _sync, _gl, cr.end and the rules' hooks). Then a short fight with the hero's real move state, captures and numbers.
//   node tools/v2/whip_plug_probe.mjs [--device fold_open|phone2] [--out /tmp/claude-0/v2/whipverify]
// What it proves: the interface in the doc is enough. What it prints under "missing": anything the doc did not say.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/whipverify');
fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const errs = []; let code = 0;
try {
  const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=slice0&v2auto=0&v2aa=0&v2res=0.5612`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 }).catch(() => {});
  const st = await page.evaluate(() => ({ ready: window.__v2?.ready, error: String(window.__v2?.error ?? '') }));
  if (!st.ready) throw new Error('scene v2g is not ready: ' + st.error);

  const plug = await page.evaluate(async () => {
    const v = window.__v2, sc = v.scene, g = window.__game, gl = sc.glr.gl, missing = [], notes = [];
    const W = await import('/src/v2/whip/index.js'), PL = await import('/src/v2/play/index.js');
    let feel = null; try { feel = (await import('/src/v2/feel/index.js')).feel ?? null; } catch (e) { notes.push('feel not importable: ' + e.message); }
    if (PL.TUNE == null) missing.push('TUNE is not exported by src/v2/play/index.js');
    if (!(gl instanceof WebGL2RenderingContext)) missing.push('scene GL is not WebGL2');
    if (!['low', 'mid', 'high'].includes(sc.perf?.tier)) missing.push('scene.perf.tier is not low|mid|high: ' + sc.perf?.tier);
    // 1 create
    const link = W.whipFx(sc.fx, feel), whip = W.createWhip({ tier: sc.perf.tier, onEvent: (n, e) => { P.ev[n + (e.kind ? '/' + e.kind : '')] = (P.ev[n + (e.kind ? '/' + e.kind : '')] || 0) + 1; link.onEvent(n, e); } }), wr = new W.WhipRenderer(gl);
    const hand = { x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0, bx: 0, by: 0, bz: 0, br: 12, bh: 104, fx: 1, fz: 0, ground: 0 }, pull = { x: 0, y: 0, z: 0, r: 12 }, C = { x: 0, y: 0, z: 0, strength: 1 };
    const P = (window.__probe = { whip, wr, link, ev: {}, modes: {}, bad: 0, glErr: 0, draws: 0, ticks: 0, frozenTicks: 0, hits: 0, pullE: null, a: 1, maxRootGrip: 0, tipHit: [], ground: 0 });
    // 2 sword off: the doc says cast.actor(HERO_MODEL, null, {}). Check that an actor without a weapon still gives the grip matrix
    const bare = sc.cast.actor('kael', null, {}); if (!bare) missing.push("cast.actor('kael', null, {}) returned null");
    else { const a = sc.heroA._g, b = bare._g; let d = 0; for (let i = 0; i < 16; i++) d = Math.max(d, Math.abs(a[i] - b[i])); if (d > 1e-6) missing.push('grip matrix of an actor without a weapon differs from the blade grip by ' + d); notes.push('actor without a weapon: grip matrix same as the blade grip (max difference ' + d + ')'); }
    sc.heroA.weapon = null;   // (the probe keeps the live actor; the scene does it where it creates heroA)
    // 3 rules hooks (the scene's own object: sim.hooks)
    const H = sc.sim.hooks; if (!H || typeof H.hit !== 'function') missing.push('sim.hooks.hit not found');
    const hit0 = H.hit; H.hit = function (e, dmg, mv, x, y, z, info) { C.x = x; C.y = y; C.z = z; C.strength = { L: 0.7, M: 1, H: 1.3, F: 1.6 }[mv?.str] ?? 1; whip.set('crack', C); P.hits++; P.lastHit = [x, y, z]; P.hitTick = P.ticks; return hit0.apply(this, arguments); };
    if (H.pull) notes.push('sim.hooks.pull already exists in the scene - chained'); const pull0 = H.pull; H.pull = function (e) { P.pullE = e; return pull0 ? pull0.apply(this, arguments) : undefined; };
    // 4 tick: after the scene's own _sync (hero pose is set there)
    const groundUnder = (h) => { const B = sc.W?.boxes; if (!B) return h.y; let gy = -Infinity; for (let i = 0; i < B.length; i++) { const b = B[i]; if (h.x < b.x0 || h.x > b.x1 || h.z < b.z0 || h.z > b.z1 || !b.walk) continue; if (b.y1 <= h.y + 30 && b.y1 > gy) gy = b.y1; } return Number.isFinite(gy) ? gy : h.y; };
    const sync0 = sc._sync.bind(sc);
    sc._sync = function (pdt, dt) {
      sync0(pdt, dt);
      const h = sc.sim.hero, ha = sc.heroA;
      if (sc._rb >= 0 && sc.fx) { sc.fx.ribbons.end(sc._rb); sc._rb = sc.fx.ribbons.start({ ...(P.nullRb ?? (P.nullRb = { mode: 0, life: 0.01, width: 0.01, col: [0, 0, 0, 0] })) }); }   // probe only: the blade trail is muted (step 6 deletes it)
      if (ha.weaponMatrix(ha.place(h.x, sc.visY, h.z))) {
        whip.handFromMatrix(ha.WM, hand);
        hand.bx = h.x; hand.by = sc.visY; hand.bz = h.z; hand.fx = h.dirX; hand.fz = h.dirZ; hand.ground = P.ground = groundUnder(h);
        let pl = null; const pe = P.pullE;
        if (pe) { if (pe.pullT > 0 || h.pullT > 0) { pull.x = pe.x; pull.y = (pe.gy ?? pe.y) + pe.h * 0.55; pull.z = pe.z; pull.r = Math.max(8, pe.r * 0.55); pl = pull; } else P.pullE = null; }
        whip.resonance = h.resoMax ? h.reso / h.resoMax : 0;
        W.driveWhip(whip, h, PL.TUNE, pl);
        whip.update(pdt, hand);
        P.ticks++; P.pdt = pdt; if (!(pdt > 0)) P.frozenTicks++; P.modes[whip.mode] = (P.modes[whip.mode] || 0) + 1;
        for (let i = 0; i < whip.n * 3; i++) if (!Number.isFinite(whip.nodes[i])) { P.bad++; break; }
        if (P.hitTick === P.ticks - 1 && P.lastHit) P.tipHit.push(+Math.hypot(whip.tip.x - P.lastHit[0], whip.tip.y - P.lastHit[1], whip.tip.z - P.lastHit[2]).toFixed(1));
      } else if (!P.noWM) { P.noWM = true; missing.push('heroA.weaponMatrix() returned null'); }
    };
    // 5 draw: right after cr.end() inside _gl, with the alpha _gl was given
    const gl0 = sc._gl.bind(sc); sc._gl = function (Wv, Hv, a, warm) { P.a = a; P.vw = Wv; P.vh = Hv; return gl0(Wv, Hv, a, warm); };
    const end0 = sc.cr.end.bind(sc.cr);
    sc.cr.end = function () {
      end0();
      const o = sc.heroA.opt, fx = sc.fx; wr.tint[0] = o.tint[0]; wr.tint[1] = o.tint[1]; wr.tint[2] = o.tint[2]; wr.flash = o.flash; wr.alpha = o.alpha ?? 1;
      sc.env.lightPos = fx ? fx.lights.pos : null; sc.env.lightCol = fx ? fx.lights.col : null; sc.env.viewport = [gl.getParameter(gl.VIEWPORT)[2], gl.getParameter(gl.VIEWPORT)[3]];
      if (!P.off) wr.draw(whip, sc.env, P.a);
      P.draws++; const e = gl.getError(); if (e) P.glErr++;
    };
    // 6 the crescents of the sword are dropped here (the scene deletes the presets)
    if (sc._fxp) { const f0 = sc._fxp.bind(sc); sc._fxp = function (name) { if (name === 'swing.light' || name === 'swing.heavy') return; return f0.apply(null, arguments); }; }
    P.env = { hasVp: sc.env.vp?.length === 16, eye: !!sc.env.eye, fog: sc.env.fog ? Object.keys(sc.env.fog) : null, sunDir: !!sc.env.sunDir, sun: !!sc.env.sun, amb: !!sc.env.amb };
    for (const k of ['vp', 'eye', 'sunDir', 'sun', 'amb']) if (!sc.env[k]) missing.push('scene.env.' + k + ' missing');
    if (sc.env.fog && !('near' in sc.env.fog && 'far' in sc.env.fog && 'color' in sc.env.fog)) missing.push('scene.env.fog has other fields than near/far/max/color: ' + Object.keys(sc.env.fog));
    // the bot (fixed action objects)
    g._pageHidden = true;
    const ACT = []; for (let i = 0; i < 64; i++) ACT.push({ left: !!(i & 1), right: !!(i & 2), up: !!(i & 4), down: !!(i & 8), attack: !!(i & 16), dash: !!(i & 32) });
    P.cur = ACT[0]; P.n = 0; P.hold = 0; g.input.setAutoSource(() => P.cur);
    P.bot = () => {
      const sim = sc.sim, h = sim.hero, E = sim.enemies; P.n++; let m = 0, tg = null, bd = 1e9;
      for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.dead || e.state === 'dead' || Math.abs(e.y - h.y) > 110) continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd) { bd = d; tg = e; } }
      if (tg && !h.dead) { const dx = tg.x - h.x, dz = tg.z - h.z, near = P.hold > 0 ? 190 : 78; if (bd > near) { if (dx > 12) m |= 2; else if (dx < -12) m |= 1; if (dz > 10) m |= 4; else if (dz < -10) m |= 8; } if (P.hold > 0) { if (P.hold > 12 && bd < 240) m |= 16; P.hold--; } else if (bd < 90 && P.n % 9 < 2) m |= 16; }
      P.cur = ACT[m]; P.dist = bd;
    };
    /** run until cond(P, sim) or max ticks; one render at the end */
    P.run = (what, max) => {
      const sim = sc.sim, h = sim.hero; let k = 0, got = false;
      for (; k < max; k++) {
        if (sim.hero.hp < 60) sim.hero.hp = sim.hero.hpMax ?? 100;
        P.bot(); g.tick(1 / 60);
        const w = whip, frozen = P.pdt === 0 && P.hitTick > P.ticks - 6;
        if (what === 'idle' ? k >= max - 1 : what === 'hit' ? frozen && w.mode === 'swing' && w.sw.id !== 'c3' : what === 'hit3' ? frozen && w.mode === 'swing' && w.sw.id === 'c3' : what === 'spin' ? w.mode === 'spin' && h.charge > 0.8 : what === 'wrap' ? w.mode === 'wrap' : what === 'air' ? w.mode === 'swing' && w.sw.s > 0.1 && w.sw.s < 0.5 && !frozen : false) { got = true; break; }
      }
      g.render();
      return { what, got, ticks: k, mode: whip.mode, move: h.move?.id ?? null, s: whip.mode === 'swing' ? +whip.sw.s.toFixed(2) : null, ext: +whip.ext.toFixed(2), len: +whip.len.toFixed(0), stop: +sim.stop.toFixed(3), dist: +(P.dist ?? 0).toFixed(0), hero: [h.x | 0, h.y | 0, h.z | 0], ground: P.ground, tipAboveGround: +(whip.tip.y - P.ground).toFixed(1), stats: { ...wr.stats }, heroPx: (() => { const a = v.project(h.x, h.y, h.z), b = v.project(h.x, h.y + 104, h.z); return a && b ? +Math.abs((a.y ?? a[1]) - (b.y ?? b[1])).toFixed(0) : null; })() };
    };
    return { missing, notes, tier: sc.perf.tier, env: P.env, section: v.section };
  });
  console.log('plug:', JSON.stringify(plug));
  const shots = [];
  const shot = async (name, what, max, pre) => {
    if (pre) await page.evaluate(pre);
    const r = await page.evaluate(([w, m]) => window.__probe.run(w, m), [what, max]);
    const f = `${OUT}/plug_${DEV}_${name}.png`; await page.screenshot({ path: f }); shots.push(f);
    console.log(`  ${name}: ${JSON.stringify(r)}`);
    return r;
  };
  await page.evaluate(() => { window.__v2.teleport('yard'); });
  await shot('1_idle', 'idle', 30);
  await shot('2_hit', 'hit', 600);
  await shot('3_hit_c3', 'hit3', 600);
  await shot('4_air', 'air', 300);
  await shot('5_spin', 'spin', 500, () => { window.__probe.hold = 80; });
  await shot('6_wrap', 'wrap', 300, () => { window.__probe.hold = 0; });
  // without the whip (same frame): what the whip adds to the scene's frame
  const sum = await page.evaluate(() => {
    const P = window.__probe, v = window.__v2, g = window.__game, s1 = v.stats; P.off = true; g.render(); const s0 = v.stats; P.off = false;
    return { ticks: P.ticks, frozenTicks: P.frozenTicks, draws: P.draws, glErrors: P.glErr, notFinite: P.bad, hits: P.hits, tipToHitPointPx: P.tipHit.slice(0, 12), events: P.ev, modes: P.modes, whip: { ...P.wr.stats }, sceneDrawsWith: s1.gl?.draws, sceneTrisWith: s1.gl?.tris, fxEvents: P.link.count };
  });
  console.log('summary:', JSON.stringify(sum));
  console.log('captures:', shots.join(' '));
  if (plug.missing.length) { console.log('MISSING (not in docs/v2/WHIP.md):'); for (const m of plug.missing) console.log('  - ' + m); }
  if (sum.glErrors || sum.notFinite) code = 1;
} catch (e) { errs.push('[exception] ' + e.message); code = 1; }
console.log(errs.length ? errs.slice(0, 10).join('\n') : 'NO PAGE ERRORS');
await browser.close(); srv.close?.();
process.exit(code || (errs.some((e) => /pageerror|exception/.test(e)) ? 1 : 0));
