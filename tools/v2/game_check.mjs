// v2g check (ENGINE lane, docs/v2/ENGINE_API.md 9): opens the real game scene on fold_open and phone2 and checks
//   1 scene ready, every character a 3D model, nothing flat left, saved perf settings honoured
//   2 real touch: 360 degree stick, attack / jump / roll buttons
//   3 touch route: a bot plays the whole route (street -> corner -> alley -> yard) through the virtual pad's stick and buttons (touch pointer events every tick)
//   4 the same route fast-forwarded (input auto source) for the frame numbers: draw calls, triangles, texture MB
//   5 hit feel is wired: strikes through the bridge, hit-stop, shots as effects, dissolve on death
//   6 turning: a stick reversal turns the hero at a bounded rate, in one direction, without wobble
//   7 interpolation between ticks, allocation per frame, far characters skipped
//   8 GL context loss -> restore
//   9 leave and re-enter three times: no canvas / GL / heap growth; a v1 stage still runs afterwards
//  10 without WebGL: a Korean notice only, no page error
//  11 seams: story events and area reload
//  12 fallback run (?v2ui=0): built-in HUD + old pad by real touch; the pause menu row switches between the old pad and the new buttons and is remembered
//  (steps 2-3 drive the NEW pad — the default — with button centres from scene.hud.metrics(); real areas: tools/v2/game_walk.mjs)
//   node tools/v2/game_check.mjs [--devices fold_open,phone2] [--json out.json] [--shots /tmp/claude-0/v2/engine] [--quick 1 = skip the no-WebGL pass] [--only touch,troute,route,turn,interp,alloc,far,shots,seams,ctx,cycle,v1,nogl,ui] [--verbose 1]
// Headless Chromium draws WebGL with a software renderer: frame times here say nothing about a phone.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, padLayout, pressButton, stickHold, ensureTouchMode } from '../qa/lib/touch.mjs';
import { installBot } from './game_bot.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(',');
const SHOTS = String(args.shots || '/tmp/claude-0/v2/engine');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'];
const FULL = !!args.fullres;
const ONLY = args.only ? String(args.only).split(',') : null, want = (k) => !ONLY || ONLY.includes(k);   // --only touch,troute,route,turn,interp,alloc,far,shots,ctx,cycle,v1,nogl
const fails = [], report = { devices: {}, noWebgl: null };
const fail = (m) => { fails.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(SHOTS, { recursive: true });

const port = 8200 + Math.floor(Math.random() * 700);
const srv = await start(port);

async function open(device, extra = GL_ARGS, q = '') {
  const browser = await chromium.launch({ executablePath: EXE, args: extra });
  const ctx = await browser.newContext(contextOptions(device));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=slice0&v2auto=0${FULL ? '' : '&v2aa=0&v2res=0.5612'}${q}`);   // the test route (the default area is eshville_now: tools/v2/game_walk.mjs); fixed render size.
  // By default the 3D picture is rendered at the old size (CSS size, no antialiasing): 2.4 MP with MSAA on the software renderer makes the run three times longer. --fullres 1 = the real default size.
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 60000 }).catch(() => errs.push('ready timeout'));
  return { browser, page, errs };
}
/** the new pad (cut-glass interface, the default): button centres in CSS px from scene.hud.metrics(). null when the old pad is on (v2ui=0) */
const v2pad = (page) => page.evaluate(() => { const m = window.__v2?.scene?.hud?.metrics?.(); if (!m?.pad?.buttons?.length) return null; const B = {}; for (const b of m.pad.buttons) B[b.id === 'roll' ? 'dash' : b.id] = { cx: b.cx, cy: b.cy, d: b.d, disabled: !!b.disabled }; return { v2: true, buttons: B, stick: m.pad.stick }; });
const press = async (T, page, pad, id, ms) => { if (!pad.v2) return pressButton(T, page, id, ms); const b = pad.buttons[id]; await T.down(11, b.cx, b.cy); await page.waitForTimeout(ms); await T.up(11); await page.waitForTimeout(60); return b; };
const shot = async (page, name) => { await page.waitForTimeout(120); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
/** run JS in the page with the loop frozen (deterministic ticks), then draw one frame */
const staged = (page, js, steps = 0) => page.evaluate(([js, steps]) => { const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim; g._pageHidden = true; const r = (0, eval)(`(function(g,v,sc,sim){${js}})`)(g, v, sc, sim); for (let i = 0; i < steps; i++) g.tick(1 / 60); g.alpha = 1; g.render(); return r ?? null; }, [js, steps]);

for (const dev of DEVICES) {
  console.log(`\n[${dev}]`);
  const R = (report.devices[dev] = {});
  const { browser, page, errs } = await open(dev);
  try {
    // ── 1) ready, 3D cast, nothing flat ──
    const st0 = await page.evaluate(() => { const v = window.__v2, g = window.__game; if (!v?.ready) return { ready: false, err: v?.error ?? null }; g._pageHidden = true; for (let i = 0; i < 10; i++) g.tick(1 / 60); g.render(); const s = v.stats, sc = v.scene; return { ready: true, id: v.id, stats: s, enemies: v.enemies.map((e) => ({ kind: e.kind, model: e.model })), heroModel: sc.heroA?.asset.id, heroTris: sc.heroA?.gpu.tris, kinds: [...sc.cast.assets.values()].map((a) => ({ id: a.id, tris: a.tris, joints: a.joints, h: +a.height.toFixed(2) })), sprites: sc.W.sprites.length, flat: sc.area.flatProps, atlasKeys: Object.keys(sc.spr), dom: [...document.querySelectorAll('canvas')].map((c) => c.id || '(game)'), under: g.canvasAlpha, pad: g.top.padHideButtons }; });
    if (!st0.ready) { fail(`${dev}: scene did not get ready ${JSON.stringify(st0)}`); continue; }
    R.start = st0; const S = st0.stats;
    ok(`scene v2g ready: ${S.gl.api} · layers "${S.mode}" (${st0.dom.join(' + ')}) · res ${S.resK} · every frame ${S.everyFrame} · load ${S.loadMs} ms`);
    const no3d = st0.enemies.filter((e) => !e.model);
    if (st0.heroModel === 'kael' && !no3d.length && S.chars.clips >= 40 && !S.chars.libError) ok(`cast is 3D: hero ${st0.heroModel} (${st0.heroTris} tris) + ${st0.enemies.length} enemies as ${S.chars.models.slice(1).join(', ')} with ${S.chars.weapons.join(', ')} · shared clip library ${S.chars.clips} clips`);
    else fail(`${dev}: cast not fully 3D ${JSON.stringify({ hero: st0.heroModel, no3d, clips: S.chars.clips, lib: S.chars.libError })}`);
    console.log('       models: ' + st0.kinds.map((k) => `${k.id} ${k.tris} tris/${k.joints} joints`).join(' · '));
    const flatLeft = st0.atlasKeys.filter((k) => !['glow', 'blob', 'moss', 'puddle', 'stain', 'crack', 'scorch', 'ash', 'leaves', 'straw'].includes(k));
    if (!flatLeft.length) ok(`nothing flat is drawn: atlas holds only ground decals and glows (${st0.atlasKeys.join(' ')}); ${st0.flat.length} prop cards of the stage are dropped (${st0.flat.map((f) => f.img).join(', ')})`);
    else fail(`${dev}: flat pictures left in the atlas: ${flatLeft.join(' ')}`);
    if (S.mode === 'under' && st0.dom.length === 2) ok('WebGL canvas sits under the alpha game canvas (no full-screen copy, no HUD canvas)'); else console.log(`       note: layer mode "${S.mode}", canvases ${st0.dom.join(' + ')}`);
    await shot(page, `${dev}_01_start`);
    await page.evaluate(installBot);

    // ── 2) real touch: stick and buttons ──
    let T = null, pad = null;
    if (contextOptions(dev).hasTouch && (want('touch') || want('troute'))) {
      const cdp = await page.context().newCDPSession(page); T = new Touch(cdp, page);
      await page.evaluate(() => { window.__game._pageHidden = false; window.__bot.act = {}; });
      await ensureTouchMode(T, page); await page.waitForTimeout(300);
      await page.waitForFunction(() => window.__v2.stats.hud === 'ui', null, { timeout: 8000 }).catch(() => {});
      pad = (await v2pad(page)) ?? (await padLayout(page));   // the new pad by default; the v1 pad only when the interface module failed
      const ids = Object.keys(pad.buttons ?? {}), vp0 = await page.evaluate(() => [innerWidth, innerHeight]), AT = { at: [Math.round(vp0[0] * 0.2), Math.round(vp0[1] * 0.68)] };
      R.pad = pad.v2 ? 'v2 (cut-glass)' : 'v1';
      const h0 = await page.evaluate(() => window.__v2.hero);
      await stickHold(T, page, 46, -46, 1100, AT);
      const h1 = await page.evaluate(() => window.__v2.hero);
      await page.evaluate(() => { const sim = window.__v2.scene.sim; for (const e of sim.enemies) if (!e.yard) e.dead = true; sim.hero.x = 900; sim.hero.z = 190; });   // controls only: clear the street (the yard group stays, or the area would count as cleared), stand in the open
      const until = (what, ms) => page.evaluate(async ([what, ms]) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const h = window.__v2.hero; if (what === 'air' ? !h.onGround : h.anim === what) return true; await new Promise((r) => setTimeout(r, 8)); } return false; }, [what, ms]);
      const [, wa] = await Promise.all([press(T, page, pad, 'attack', 220), until('attack', 6000)]);
      await page.waitForFunction(() => !window.__v2.scene.sim.hero.move, null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(300);
      const [, wj] = await Promise.all([press(T, page, pad, 'jump', 220), until('air', 6000)]);
      await page.waitForTimeout(600);
      // roll = the roll button while the stick is pushed (without the stick the same button guards — PLAY_API 1)
      await page.waitForFunction(() => { const h = window.__v2.scene.sim.hero; return h.onGround && !h.move && !(h.landT > 0); }, null, { timeout: 20000 }).catch(() => {});   // a loaded machine plays slower than real time: wait for the jump to end
      await page.waitForTimeout(300);
      const rolling = page.evaluate(async () => { const t0 = performance.now(); while (performance.now() - t0 < 8000) { const h = window.__v2.scene.sim.hero; if (h.dashT > 0 || h.anim === 'roll' || h.anim === 'dash') return true; await new Promise((r) => setTimeout(r, 8)); } return false; });
      await stickHold(T, page, 50, 0, 400, { keep: true, ...AT });
      await press(T, page, pad, 'dash', 260); await page.waitForTimeout(400);
      await T.upAll();
      const wd = await rolling;
      R.touch = { pad: ids, moved: [Math.round(h1.x - h0.x), Math.round(h1.z - h0.z)], face: h1.face.map((n) => +n.toFixed(2)), attack: wa, jump: wj, dash: wd };
      const T_OK = R.touch.moved[0] > 40 && R.touch.moved[1] > 25 && wa && wj && wd && ['attack', 'jump', 'dash'].every((b) => ids.includes(b));
      if (T_OK) ok(`touch (${R.pad} pad): stick right+up moved the hero ${R.touch.moved.join(',')} facing (${R.touch.face.join(',')}), attack / jump / roll buttons work (pad buttons: ${ids.join(' ')})`); else fail(`${dev}: touch controls ${JSON.stringify(R.touch)}`);
      await page.evaluate(() => { const v = window.__v2; v.scene.sim.reset(); v.scene.cam.snap = true; window.__bot.wp = 0; window.__bot.minHp = 100; window.__bot.feel0 = v.scene.feelN; });
    }

    // ── 3) touch route: the pilot plays the whole route through the virtual pad (stick drag + button presses), fast-forwarded ──
    // (CDP touches are answered only about once a second by the software-rendered page, too slow to fight with; the trusted touches of step 2
    //  prove the browser -> pad path, this step drives the same pad handlers with touch pointer events every tick)
    if (T && pad && want('troute')) {
      const vp = await page.evaluate(() => [innerWidth, innerHeight]);
      await page.evaluate(([x0, y0, R, btn]) => { const v = window.__v2, B = window.__bot; v.scene.sim.reset(); v.scene.cam.snap = true; v.scene.fx?.clear(); B.wp = 0; B.minHp = 100; B.t = 0; B.ticks = 0; B.simT = -1; B.skipMap = {}; B.deaths = v.scene.sim.deaths ?? 0; B.feel0 = v.scene.feelN; B.touchSetup(x0, y0, R, btn); }, [Math.round(vp[0] * 0.2), Math.round(vp[1] * 0.68), 56, pad.buttons]);
      let r = null, seen = [], cap = new Set(); const t0 = Date.now(), d0 = await page.evaluate(() => window.__v2.scene.sim.deaths ?? 0);
      for (let i = 0; i < 80 && Date.now() - t0 < 300000; i++) {
        r = await page.evaluate(() => window.__bot.touchRun(240, 12));
        if (!seen.includes(r.sec)) seen.push(r.sec);
        if (args.verbose) console.log('       ' + JSON.stringify({ sec: r.sec, x: r.x, z: r.z, hp: r.hp, left: r.left, deaths: r.deaths, wp: r.wp, skips: r.skips, feelN: r.feelN, presses: r.presses }));
        if (dev === DEVICES[0]) for (const [sec, name] of [['corner', '02_touch_corner'], ['alley', '03_touch_alley'], ['yard', '04_touch_yard']]) if (r.sec === sec && !cap.has(sec)) { cap.add(sec); await shot(page, `${dev}_${name}`); }
        if (r.sec === 'done') break;
      }
      await page.evaluate(() => window.__bot.touchEnd());
      R.touchRoute = { ...r, sections: seen, falls: r.deaths - d0, wallSec: +((Date.now() - t0) / 1000).toFixed(1) };
      if (r?.sec === 'done' && r.mode === 'touch' && r.presses.attack > 10) ok(`touch bot finished the route through the virtual pad: ${(r.ticks / 60).toFixed(1)} s of play, stick moved ${r.stickMoves} times, buttons pressed attack ${r.presses.attack} · roll ${r.presses.dash} · guard ${r.presses.guard} · jump ${r.presses.jump}, hp left ${r.hp} (lowest ${r.minHp}), fell ${R.touchRoute.falls} times, strikes ${r.feelN}, sections ${seen.join(' > ')}`);
      else fail(`${dev}: touch bot did not finish the route ${JSON.stringify(R.touchRoute)}`);
      await shot(page, `${dev}_05_touch_end`);
    }

    // ── 4) the route fast-forwarded: frame numbers ──
    if (want('route')) {
    await page.evaluate(() => { const v = window.__v2, B = window.__bot; window.__game._pageHidden = true; v.scene.sim.reset(); v.scene.cam.snap = true; v.scene.fx?.clear(); B.wp = 0; B.minHp = 100; B.t = 0; B.ticks = 0; B.simT = -1; B.deaths = v.scene.sim.deaths ?? 0; B.skipMap = {}; B.feel0 = v.scene.feelN; for (const k of Object.keys(B.max)) B.max[k] = 0; window.__game.input.setAutoSource(() => B.act); });
    if (args.debug) await page.evaluate((js) => { const v = window.__v2, sc = v.scene, sim = sc.sim, g = window.__game; (0, eval)(`(function(g,v,sc,sim){${js}})`)(g, v, sc, sim); }, String(args.debug));   // debugging aid: run a snippet before the route
    let r = null; const t0 = Date.now();
    for (let i = 0; i < 60 && Date.now() - t0 < 240000; i++) { r = await page.evaluate(() => window.__bot.run(300, 10)); if (args.verbose) console.log('       ' + JSON.stringify({ sec: r.sec, x: r.x, z: r.z, hp: r.hp, left: r.left, deaths: r.deaths, wp: r.wp, skips: r.skips, feelN: r.feelN })); if (r.sec === 'done') break; }
    R.bot = r;
    if (r?.sec === 'done') ok(`fast-forward bot finished: ${(r.ticks / 60).toFixed(1)} s of ticks (${(r.t / 60).toFixed(1)} s of rule time, the rest is hit-stop), hp left ${r.hp} (lowest ${r.minHp}), fell ${r.deaths} times, strikes ${r.feelN}`);
    else fail(`${dev}: fast-forward bot did not finish ${JSON.stringify(r)}`);
    if (r) console.log(`       peak during the route: draw calls ${r.max.draws} · triangles ${Math.round(r.max.tris)} (characters ${Math.round(r.max.charTris)}) · characters drawn ${r.max.drawn}, skipped ${r.max.culled} · effect lights ${r.max.lights}`);
    // ── 5) hit feel ──
    if (r && r.feelN > 10 && r.max.stop > 0.03 && r.max.shots > 0 && r.max.dying > 0) ok(`hit feel is wired: ${r.feelN} strikes through the bridge, longest hit-stop ${r.max.stop.toFixed(3)} s, enemy shots followed as 3D effects (peak ${r.max.shots}), ${r.max.dying} enemies dissolving at once`);
    else fail(`${dev}: hit feel not seen ${JSON.stringify({ feelN: r?.feelN, max: r?.max })}`);
    const F = await staged(page, `sim.reset(); sc.cam.snap = true; sc.fx && sc.fx.clear(); const e = sim.enemies[0], h = sim.hero; h.x = e.x - 60; h.z = e.z; h.dirX = 1; h.dirZ = 0; h.facing = 1; e.active = true; const n0 = sc.feelN, calls = []; const hit0 = sc.bridge.onEvent; let ev = 0; sc.fx && (sc.fx.onEvent = function (n, x, y, z, vol) { ev++; calls.push(n); return hit0(n, x, y, z, vol); }); window.__bot.act = { attack: true }; let stopT = 0, tr = 0, i = 0; for (; i < 60 && sc.feelN === n0; i++) { g.tick(1 / 60); window.__bot.act = {}; } const f = sc.fx ? sc.fx.feel : null; if (f) { stopT = f.stop; tr = f.trauma; } const r = sc.lastFeel; if (sc.fx) sc.fx.onEvent = hit0; return { ticksToHit: i, strikes: sc.feelN - n0, stop: stopT, trauma: tr, table: r ? { stop: r.stop, shake: r.shake, key: r.key } : null, events: calls, particles: sc.fx ? sc.fx.particles.live ?? null : null };`, 2);
    R.oneHit = F;
    if (F && F.strikes === 1 && F.table && Math.abs(F.stop - F.table.stop) < 0.02 && F.trauma <= F.table.shake + 0.02 && F.trauma > 0) ok(`one hit = one strike: recipe ${F.table.key} from the feel table, screen hit-stop ${F.stop.toFixed(3)} s (table ${F.table.stop}), shake ${F.trauma.toFixed(2)} (table ${F.table.shake}, applied once), sound events ${F.events.join(' ')}`);
    else fail(`${dev}: one-hit feel check ${JSON.stringify(F)}`);
    await shot(page, `${dev}_06_hit`);
    }

    // ── 6) turning ──
    if (want('turn')) {
    const turn = await staged(page, `sim.reset(); sc.cam.snap = true; const B = window.__bot, ang = () => Math.atan2(sc.heroA.dz, sc.heroA.dx), out = {}; for (const e of sim.enemies) if (!e.yard) e.dead = true;
      const run = (first, seq, n) => { sim.hero.x = 900; sim.hero.z = 190; B.act = first; for (let i = 0; i < 40; i++) g.tick(1 / 60); const a = [ang()]; for (let i = 0; i < n; i++) { B.act = seq(i); g.tick(1 / 60); a.push(ang()); } let mx = 0, flips = 0, sgn = 0, done = -1, tot = 0; for (let i = 1; i < a.length; i++) { let d = a[i] - a[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; tot += d; mx = Math.max(mx, Math.abs(d)); if (Math.abs(d) > 0.004 && Math.abs(tot) < 2.3) { const s = Math.sign(d); if (sgn && s !== sgn) flips++; sgn = s; } if (done < 0 && Math.abs(Math.abs(tot) - Math.PI) < 0.2) done = i; } return { maxStep: +mx.toFixed(3), flips, doneTick: done, total: +tot.toFixed(2) }; };
      out.reverse = run({ right: true }, () => ({ left: true }), 30);
      out.back = run({ left: true }, () => ({ right: true }), 30);
      out.jitter = run({ right: true }, (i) => (i % 2 ? { left: true, up: true } : { left: true, down: true }), 30);
      out.attack = run({ right: true }, (i) => (i === 0 ? { left: true, attack: true } : { left: true }), 14);
      B.act = {}; return out;`, 0);
    R.turn = turn;
    const tOK = turn && turn.reverse.flips === 0 && turn.back.flips === 0 && turn.reverse.maxStep <= 15 / 60 + 0.01 && turn.reverse.doneTick > 6 && turn.reverse.doneTick <= 24 && turn.back.doneTick > 6 && turn.back.doneTick <= 24 && turn.jitter.flips === 0 && Math.abs(turn.jitter.total) > 2.2 && turn.attack.doneTick > 0 && turn.attack.doneTick <= 9;
    if (tOK) ok(`turning: a stick reversal turns the body in one direction, at most ${turn.reverse.maxStep} rad per tick, done in ${turn.reverse.doneTick} / ${turn.back.doneTick} ticks (no snap, no wobble); a stick that jumps between two back-diagonals every tick still turns one way (${turn.jitter.flips} direction changes on the way round); with an attack the body faces the hit box in ${turn.attack.doneTick} ticks`);
    else fail(`${dev}: turning ${JSON.stringify(turn)}`);
    }

    // ── 7) interpolation, allocation, far characters ──
    if (want('interp')) {
    const ip = await staged(page, `sim.reset(); sc.cam.snap = true; for (const e of sim.enemies) if (!e.yard) e.dead = true; sim.hero.x = 800; sim.hero.z = 190; window.__bot.act = { right: true }; for (let i = 0; i < 50; i++) g.tick(1 / 60); const P = {}; const at = (a) => { g.alpha = a; g.render(); const h = sim.hero; return [sc.heroA.M[12], sc.eye0[0], h._px, h.x]; }; const a0 = at(0), a5 = at(0.5), a1 = at(1); window.__bot.act = {}; return { hero: [a0[0], a5[0], a1[0]], eye: [a0[1], a5[1], a1[1]], prev: a0[2], cur: a0[3] };`, 0);
    R.interp = ip;
    const mid = (a) => Math.abs(a[1] - (a[0] + a[2]) / 2) < 0.02 && Math.abs(a[2] - a[0]) > 1;
    if (ip && mid(ip.hero) && mid(ip.eye) && Math.abs(ip.hero[0] - ip.prev) < 0.01 && Math.abs(ip.hero[2] - ip.cur) < 0.01) ok(`interpolation: between two ticks the hero is drawn at ${ip.hero.map((n) => n.toFixed(1)).join(' / ')} (alpha 0 / 0.5 / 1) and the camera follows (${ip.eye.map((n) => n.toFixed(1)).join(' / ')})`);
    else fail(`${dev}: interpolation ${JSON.stringify(ip)}`);
    }
    if (want('alloc')) {
    const al = await page.evaluate(async () => {
      const g = window.__game, v = window.__v2, sc = v.scene, B = window.__bot; g._pageHidden = true; sc.sim.reset(); sc.cam.snap = true; sc.fx?.clear(); B.wp = 0; B.t = 0; B.skipMap = {};
      const gc = () => { if (window.gc) { window.gc(); window.gc(); } }, mem = () => performance.memory.usedJSHeapSize;
      const NONE = {}, RIGHT = { right: true }, LEFT = { left: true }, ATK = { attack: true }, DASH = { dash: true, right: true };   // fixed input objects: the measurement must not count the bot's own garbage
      const script = (i) => (i % 24 < 2 ? ATK : i % 180 === 100 ? DASH : i % 96 < 30 ? RIGHT : i % 96 < 48 ? NONE : i % 96 < 78 ? LEFT : NONE);
      const measure = (n, fight) => { gc(); const m0 = mem(); for (let i = 0; i < n; i++) { B.act = fight ? script(i) : NONE; g.tick(1 / 60); g.alpha = 0.5; g.render(); } const m1 = mem(); return Math.round((m1 - m0) / n); };
      const stub = (on) => { if (on) { sc.update = function () {}; sc.render = function () {}; } else { delete sc.update; delete sc.render; } };   // instance fields shadow the class methods: the v1 shell alone
      const toYard = () => { sc.sim.reset(); sc.cam.snap = true; v.teleport('yard'); sc.sim.hero.z = 1700; };
      const resK = sc.perf.resK; sc.perf.resK = 0.08;   // tiny picture while measuring: the JS work is the same, the software GPU does not fall minutes behind
      toYard(); for (let i = 0; i < 1200; i++) { B.act = script(i); g.tick(1 / 60); g.render(); }   // warm the JIT on the same path (cheap now: tiny picture)
      sc.sim.reset(); sc.cam.snap = true; for (let i = 0; i < 900; i++) { B.act = NONE; g.tick(1 / 60); g.render(); }
      stub(true); const shell = [measure(240, false), measure(240, false), measure(240, false)]; stub(false);
      const idle = [measure(240, false), measure(240, false), measure(240, false), measure(240, false), measure(240, false)];
      toYard(); const play = [measure(300, true), measure(300, true), measure(300, true), measure(300, true), measure(300, true)]; B.act = NONE;
      sc.perf.resK = resK;
      return { shell, idle, play, gc: !!window.gc, hits: sc.feelN };
    });
    R.alloc = al;
    // The heap counter also moves when the collector runs inside a repeat, so single repeats scatter (even below the shell-only figure);
    // the median of the repeats is compared with the shell alone. V8 allocates number boxes in code it has not optimised yet,
    // which is why tools/v2/fx_check.mjs found the same kind of leftover bytes.
    const med = (a) => { const q = [...a].sort((x, y) => x - y); return q.length % 2 ? q[(q.length - 1) / 2] : Math.round((q[q.length / 2 - 1] + q[q.length / 2]) / 2); };
    const shellB = med(al.shell), idleB = med(al.idle), playB = med(al.play);
    R.allocScene = { shell: shellB, idle: idleB, play: playB };
    // informational gate (gross regressions only): what remains comes mostly from the rules' animation calls and from code V8 has not optimised yet — see the report
    if (al.gc && idleB <= shellB + 12288 && playB <= shellB + 20480) ok(`allocation per frame (tick + draw, JS heap, median of the repeats): v1 shell alone (input, pad) ${shellB} bytes · with the scene standing still ${idleB} bytes · in a scripted yard fight ${playB} bytes (repeats: shell ${al.shell.join('/')}, standing ${al.idle.join('/')}, fight ${al.play.join('/')})`);
    else fail(`${dev}: allocation per frame too high or not measurable ${JSON.stringify(al)}`);
    }
    if (want('far')) {
    const far = await staged(page, `sim.reset(); sc.cam.snap = true; for (let i = 0; i < 5; i++) g.tick(1 / 60); g.render(); const far = sc.actors.filter((a) => !a.vis), t0 = far.map((a) => a.anim.t ?? a.anim.time ?? 0); for (let i = 0; i < 30; i++) { g.tick(1 / 60); g.render(); } const moved = far.filter((a, i) => (a.anim.t ?? a.anim.time ?? 0) !== t0[i] && !a.vis).length; return { actors: sc.actors.length, far: far.length, animatedWhileFar: moved, drawn: sc.c3.drawn, culled: sc.c3.culled };`, 0);
    R.far = far;
    if (far && far.far > 0 && far.animatedWhileFar === 0 && far.culled === far.far) ok(`far characters cost nothing: ${far.far} of ${far.actors} enemies are outside the view — not animated, not drawn (drawn ${far.drawn})`);
    else fail(`${dev}: far characters ${JSON.stringify(far)}`);
    }

    // ── captures (first device) ──
    if (dev === DEVICES[0] && want('shots')) {
      await staged(page, `sim.reset(); sc.cam.snap = true; sc.fx && sc.fx.clear(); const m = sim.enemies.find((e) => e.kind === 'ranged' || /mage/.test(e.kind)); if (m) { const h = sim.hero; h.x = m.x - 330; h.z = m.z; h.y = m.y; h.safe && (h.safe.x = h.x); m.active = true; for (let i = 0; i < 400 && !sim.shots.some((s) => !s.dead); i++) g.tick(1 / 60); for (let i = 0; i < 14; i++) g.tick(1 / 60); }`, 0);
      await shot(page, `${dev}_07_magic_shot`);
      await staged(page, `sim.reset(); sc.cam.snap = true; sc.fx && sc.fx.clear(); v.teleport('yard'); sim.hero.z = 1700; const B = window.__bot; B.wp = 99; B.skipMap = {}; for (let i = 0; i < 420; i++) { B.think(); g.tick(1 / 60); if (i % 6 === 0) g.render(); if (sc.actors.some((a) => a.dieAge > 0.25 && a.dieAge < 0.5 && a.vis)) break; }`, 0);
      await shot(page, `${dev}_08_yard_dissolve`);
      await staged(page, `const B = window.__bot; for (let i = 0; i < 200; i++) { B.think(); g.tick(1 / 60); if (i % 6 === 0) g.render(); if (sc.fx && sc.fx.feel.stop > 0.02 && i > 30) break; }`, 0);
      await shot(page, `${dev}_09_yard_fight`);
      await staged(page, `sim.reset(); sc.cam.snap = true; sc.fx && sc.fx.clear(); v.teleport('alley'); window.__bot.act = {};`, 40);
      await shot(page, `${dev}_10_alley`);
    }
    const nums = await staged(page, `const out = {}; sim.reset(); for (const s of ['street', 'corner', 'alley', 'stairs', 'garden', 'yard']) { if (!v.teleport(s)) continue; for (let i = 0; i < 30; i++) g.tick(1 / 60); g.render(); const st = v.stats; out[s] = { draws: st.gl.draws, tris: st.gl.tris, world: st.world.tris, chars: st.chars.tris, drawn: st.chars.drawn, culled: st.chars.culled }; } const st = v.stats; v.teleport('street'); return { sections: out, texMB: st.gl.texMB, worldTexMB: +(st.world.texBytes / 1048576).toFixed(1), charTexMB: +(st.chars.texBytes / 1048576).toFixed(1), fxMB: +((st.fx?.bytes ?? 0) / 1048576).toFixed(1), bufKB: Math.round(st.gl.bufBytes / 1024), assets: st.assets };`, 0);
    R.numbers = nums;
    for (const [s, q] of Object.entries(nums.sections)) console.log(`       ${s.padEnd(7)} draw calls ${String(q.draws).padStart(2)} · triangles ${String(q.tris).padStart(6)} (world ${q.world}, characters ${q.chars}: ${q.drawn} drawn, ${q.culled} skipped)`);
    console.log(`       GPU memory: textures ${nums.texMB} MB (world ${nums.worldTexMB} + characters ${nums.charTexMB} + effects ${nums.fxMB}) · vertex buffers ${nums.bufKB} KB · ${nums.assets.length} assets/v2 files loaded`);

    // ── seams: story events, area reload ──
    if (want('seams')) {
      const sm = await page.evaluate(async () => {
        const g = window.__game, v = window.__v2, sc = v.scene; g._pageHidden = true; window.__bot.act = {};
        const log = []; let apiOk = false;
        sc.setStory((name, data, api) => { log.push(name); apiOk = typeof api.lock === 'function' && typeof api.gotoArea === 'function' && api.sim === sc.sim; });
        sc.sim.reset(); sc.cam.snap = true; for (let i = 0; i < 5; i++) g.tick(1 / 60);
        v.teleport('alley'); for (let i = 0; i < 5; i++) g.tick(1 / 60);
        const e = sc.sim.enemies.find((q) => !q.dead && !q.yard), h = sc.sim.hero; h.x = e.x - 60; h.z = e.z; h.y = e.y; e.hp = 1; e.active = true;
        for (let i = 0; i < 90 && e.hp > 0; i++) { window.__bot.act = i % 8 < 2 ? { attack: true, right: true } : { right: true }; g.tick(1 / 60); }
        window.__bot.act = {};
        const s0 = v.stats, before = { tex: s0.gl.texBytes, buf: s0.gl.bufBytes, canvases: s0.canvases };
        const okGo = await sc.gotoArea('slice0', 'yard');
        for (let i = 0; i < 20; i++) g.tick(1 / 60); g.render();
        const s1 = v.stats; sc.setStory(null);
        return { events: [...new Set(log)], apiOk, okGo, section: v.section, after: { tex: s1.gl.texBytes, buf: s1.gl.bufBytes, canvases: s1.canvases }, before, enemies: v.enemies.length, drawn: s1.chars.drawn, ready: v.ready };
      });
      R.seams = sm;
      const need = ['section.enter', 'enemy.kill', 'area.enter'];
      if (sm.apiOk && need.every((n) => sm.events.includes(n)) && sm.okGo && sm.ready && sm.section === 'yard' && sm.after.tex === sm.before.tex && sm.after.buf === sm.before.buf && sm.after.canvases === sm.before.canvases && sm.enemies === 16) ok(`seams: the story function received ${sm.events.join(' · ')}; gotoArea() reloaded the area at spawn "yard" with the same GPU bytes and canvases`);
      else fail(`${dev}: seams ${JSON.stringify(sm)}`);
    }

    // ── 8) context loss ──
    if (want('ctx')) {
    R.ctxLoss = await page.evaluate(async () => {
      const g = window.__game, v = window.__v2; g._pageHidden = false; window.__bot.act = {};
      const okLose = v.loseContext();
      await new Promise((r) => setTimeout(r, 150));
      const lostMid = v.stats.gl.lost;
      await new Promise((r) => setTimeout(r, 1800));
      const s = v.stats;
      return { okLose, lostMid, lostAfter: s.gl.lost, restored: s.gl.restored, draws: s.gl.draws, chars: s.chars.drawn, fx: !!v.scene.fx?.ok };
    });
    if (R.ctxLoss.okLose && R.ctxLoss.lostMid && !R.ctxLoss.lostAfter && R.ctxLoss.restored >= 1 && R.ctxLoss.draws > 5 && R.ctxLoss.chars >= 1) ok(`context lost -> restored, drawing again (${JSON.stringify(R.ctxLoss)})`);
    else fail(`${dev}: context restore ${JSON.stringify(R.ctxLoss)}`);
    if (dev === DEVICES[0]) { await staged(page, '', 20); await shot(page, `${dev}_11_after_restore`); }
    }

    // ── 9) leave and re-enter three times, then a v1 stage ──
    if (want('cycle')) {
    R.cycle = await page.evaluate(async () => {
      const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms)), out = []; g._pageHidden = false;
      const gc = () => { if (window.gc) { window.gc(); window.gc(); } };
      const snap = () => { const s = window.__v2.stats; return { tex: s.gl.texBytes, buf: s.gl.bufBytes, canvases: s.canvases, dom: document.querySelectorAll('canvas').length }; };
      const first = snap(); gc(); const heap0 = performance.memory.usedJSHeapSize;
      for (let i = 0; i < 3; i++) {
        g.go('title', {}, { fade: false }); await wait(500);
        const away = { top: g.top?.name, v2: typeof window.__v2, dom: document.querySelectorAll('canvas').length, gl: !!document.getElementById('v2g-gl') };
        g.go('v2g', {}, { fade: false });
        const t0 = performance.now(); while (performance.now() - t0 < 40000 && !(window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error))) await wait(50);
        await wait(300);
        out.push({ away, back: window.__v2?.ready ? snap() : { err: window.__v2?.error ?? 'not ready' } });
      }
      gc(); const heap1 = performance.memory.usedJSHeapSize;
      return { first, rounds: out, heapMB: [+(heap0 / 1048576).toFixed(1), +(heap1 / 1048576).toFixed(1)] };
    });
    { const C = R.cycle, f = C.first, good = C.rounds.every((q) => q.away.top === 'title' && q.away.v2 === 'undefined' && !q.away.gl && q.away.dom === f.dom - 1 && q.back.tex === f.tex && q.back.buf === f.buf && q.back.canvases === f.canvases && q.back.dom === f.dom) && C.heapMB[1] - C.heapMB[0] < 12;
      if (good) ok(`left and re-entered three times: DOM canvases ${f.dom} -> ${f.dom - 1} -> ${f.dom} each time, same GPU bytes (textures ${(f.tex / 1048576).toFixed(1)} MB, buffers ${(f.buf / 1024) | 0} KB), JS heap ${C.heapMB[0]} -> ${C.heapMB[1]} MB`);
      else fail(`${dev}: leak after re-entering ${JSON.stringify(C)}`); }
    }
    if (want('v1')) {
    R.v1 = await page.evaluate(async () => {
      const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms));
      g.go('title', {}, { fade: false }); await wait(400);
      const dom = document.querySelectorAll('canvas').length, v2 = typeof window.__v2;
      const { newGameState } = await import('/src/game/state.js'); g.state = g.saves.markDebug(newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' }));
      g.go('stage', { stageId: 's01' }, { fade: false }); await wait(2500);
      const x0 = g.world?.player?.x ?? null; g.input.setAutoSource(() => ({ right: true })); await wait(1200); g.input.setAutoSource(null);
      return { dom, v2, scenes: g.scenes.map((s) => s.name), hp: g.world?.player?.hp ?? null, moved: g.world?.player ? Math.round(g.world.player.x - x0) : null, room: g.world?.roomId ?? null };
    });
    if (R.v1.v2 === 'undefined' && R.v1.scenes.includes('stage') && R.v1.hp > 0 && R.v1.moved > 20) ok(`after leaving, the v1 stage runs: scenes ${R.v1.scenes.join('+')}, room ${R.v1.room}, player moved ${R.v1.moved}, hp ${R.v1.hp}`);
    else fail(`${dev}: v1 stage after leaving ${JSON.stringify(R.v1)}`);
    if (dev === DEVICES[0]) await shot(page, `${dev}_12_v1_stage_after`);
    }
    R.errors = errs.slice(0, 20);
    if (errs.length) fail(`${dev}: ${errs.length} page errors — ${errs.slice(0, 3).join(' | ')}`); else ok('0 page errors');
  } catch (e) { fail(`${dev}: check script exception ${e.message}\n${(e.stack ?? '').split('\n').slice(1, 4).join('\n')}`); } finally { await browser.close(); }
}

// ── 10) no WebGL ──
if (!args.quick && want('nogl')) {
  console.log('\n[no WebGL]');
  const { browser, page, errs } = await open(DEVICES[0], ['--disable-gpu', '--disable-3d-apis']);
  try {
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ err: window.__v2?.error ?? null, ready: !!window.__v2?.ready, top: window.__game?.top?.name }));
    report.noWebgl = { ...r, errors: errs.slice(0, 5) };
    if (r.err && !r.ready && !errs.length) ok('without WebGL: a notice only (' + r.err + '), 0 page errors'); else fail('no-WebGL handling: ' + JSON.stringify(report.noWebgl));
    await page.screenshot({ path: `${SHOTS}/x_no_webgl.png` });
  } finally { await browser.close(); }
}
// ── 11) the UI lane's HUD through the seam (opt-in): the scene must keep running whatever that module does ──
if (want('ui')) {
  // the fallback run: the built-in HUD and the old (v1) pad still play, and the owner can switch between the two by touch (pause menu row, remembered)
  console.log('\n[fallback: ?v2ui=0 — built-in HUD + old pad, and the way back by touch]');
  const { browser, page, errs } = await open(DEVICES[0], GL_ARGS, '&v2ui=0');
  try {
    await page.waitForTimeout(1200);
    const cdp = await page.context().newCDPSession(page), T = new Touch(cdp, page);
    await ensureTouchMode(T, page); await page.waitForTimeout(300);
    const s0 = await page.evaluate(() => { const v = window.__v2; if (!v?.ready) return { ready: false, err: v?.error ?? null }; return { ready: true, hud: v.stats.hud, hidePad: !!v.scene.hidePad, v2pad: !!document.getElementById('v2pad'), x: v.hero.x }; });
    await page.evaluate(() => { const sim = window.__v2.scene.sim; for (const e of sim.enemies) if (!e.yard) e.dead = true; });
    await stickHold(T, page, 46, 0, 1000);
    const x1 = await page.evaluate(() => window.__v2.hero.x);
    const swing = page.evaluate(async () => { const t0 = performance.now(); while (performance.now() - t0 < 6000) { if (window.__v2.hero.anim === 'attack') return true; await new Promise((r) => setTimeout(r, 8)); } return false; });
    await pressButton(T, page, 'attack', 220); const wa = await swing;
    const rowTap = async (pick) => { const q = await page.evaluate((pick) => { const g = window.__game, m = window.__v2.scene.hud.metrics().pause; if (!m) return null; const i = pick === 'extra' ? (m.ids ? m.ids.indexOf('extra') : 1) : 0, r = m.rows[i]; return r ? { x: g.canvasRect.x + (r.x + r.w / 2) * g.cssScale, y: g.canvasRect.y + (r.y + r.h / 2) * g.cssScale, n: m.rows.length } : null; }, pick); if (q) await T.tap(q.x, q.y, 70); return q; };
    // old pad -> pause (the v1 pad's pause button) -> row 「새 단추로 바꾸기」
    const pb = await page.evaluate(async () => { const tp = (await import('/src/core/touchpad.js')).touchpad; const b = tp.buttons().find((x) => x.id === 'pause'); return b ? { x: b.cx ?? b.x + b.w / 2, y: b.cy ?? b.y + b.h / 2 } : null; });
    if (pb) await T.tap(pb.x, pb.y, 70); else await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__v2?.scene?.hud?.modal === 'pause', null, { timeout: 8000 }).catch(() => {});
    const m1 = await page.evaluate(() => window.__v2?.scene?.hud?.modal ?? null);
    await page.waitForTimeout(350); const q1 = await rowTap('extra');
    await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    const s1 = await page.evaluate(() => ({ hud: window.__v2?.stats?.hud ?? null, saved: localStorage.getItem('bn.v2.ui'), hidePad: !!window.__v2?.scene?.hidePad, modal: window.__v2?.scene?.hud?.modal ?? null }));
    await page.screenshot({ path: `${SHOTS}/x_ui_switched_new.png` });
    // new buttons -> pause button of the new pad -> row 「옛 단추로 바꾸기」
    const np = await v2pad(page); let s2 = null, m2 = null, q2 = null;
    if (np?.buttons.pause) {
      await T.tap(np.buttons.pause.cx, np.buttons.pause.cy, 70);
      await page.waitForFunction(() => window.__v2.scene.hud.modal === 'pause', null, { timeout: 8000 }).catch(() => {});
      m2 = await page.evaluate(() => ({ modal: window.__v2.scene.hud.modal, ids: window.__v2.scene.hud.metrics().pause?.ids ?? null }));
      await page.screenshot({ path: `${SHOTS}/x_ui_pause_row.png` });
      await page.waitForTimeout(350); q2 = await rowTap('extra');
      await page.waitForFunction(() => window.__v2.stats.hud === 'builtin', null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(400);
      s2 = await page.evaluate(() => ({ hud: window.__v2.stats.hud, saved: localStorage.getItem('bn.v2.ui'), hidePad: !!window.__v2.scene.hidePad, showPad: !!window.__v2.scene.showPad }));
    }
    report.ui = { s0, moved: Math.round(x1 - (s0.x ?? 0)), attack: wa, m1, q1, s1, m2, q2, s2, errors: errs.slice(0, 5) };
    await page.evaluate(() => localStorage.removeItem('bn.v2.ui'));
    if (s0.ready && s0.hud === 'builtin' && !s0.hidePad && report.ui.moved > 40 && wa && !errs.length) ok(`v2ui=0: the scene plays with the built-in HUD and the old pad by real touch (stick moved the hero ${report.ui.moved} px, attack swings), 0 page errors`);
    else fail('fallback run (v2ui=0): ' + JSON.stringify({ s0, moved: report.ui.moved, attack: wa, errors: report.ui.errors }));
    if (m1 === 'pause' && s1.hud === 'ui' && s1.saved === '1' && s1.hidePad) ok('way back by touch: old pad -> pause -> 「새 단추로 바꾸기」 switches to the cut-glass interface while playing and remembers it (bn.v2.ui = 1)');
    else fail('switch old pad -> new buttons: ' + JSON.stringify({ m1, q1, s1 }));
    if (s2 && m2?.modal === 'pause' && s2.hud === 'builtin' && s2.saved === '0' && !s2.hidePad) ok(`and back: new pad -> 멈춤 -> 「옛 단추로 바꾸기」 (pause rows ${m2.ids?.join(' ')}) returns the old pad and remembers it (bn.v2.ui = 0)`);
    else fail('switch new buttons -> old pad: ' + JSON.stringify({ m2, q2, s2 }));
  } catch (e) { fail('fallback run: check script exception ' + e.message); } finally { await browser.close(); }
}
srv.close();
report.fails = fails;
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1));
console.log(fails.length ? `\nFAIL ${fails.length}` : '\nALL OK');
process.exit(fails.length ? 1 : 0);
