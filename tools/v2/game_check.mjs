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
//  11 seams: story events and area reload; the UI lane's HUD through the opt-in switch (?v2ui=1) never stops the scene
//   node tools/v2/game_check.mjs [--devices fold_open,phone2] [--json out.json] [--shots /tmp/claude-0/v2/engine] [--quick 1 = skip the no-WebGL pass] [--only touch,troute,route,turn,interp,alloc,far,shots,seams,ctx,cycle,v1,nogl,ui] [--verbose 1]
// Headless Chromium draws WebGL with a software renderer: frame times here say nothing about a phone.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, padLayout, pressButton, stickHold, ensureTouchMode } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(',');
const SHOTS = String(args.shots || '/tmp/claude-0/v2/engine');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'];
const ONLY = args.only ? String(args.only).split(',') : null, want = (k) => !ONLY || ONLY.includes(k);   // --only touch,troute,route,turn,interp,alloc,far,shots,ctx,cycle,v1,nogl
const fails = [], report = { devices: {}, noWebgl: null };
const fail = (m) => { fails.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(SHOTS, { recursive: true });

const port = 8200 + Math.floor(Math.random() * 700);
const srv = await start(port);

/** in the page: the route bot. think() = digital decisions for the fast-forward run, pilot() = analog wishes for the touch run */
function installBot() {
  const g = window.__game, v = window.__v2, input = g.input;
  const ROUTE = [[330, 120], [560, 182], [790, 190], [1230, 190], [1300, 182], [1480, 182], [1520, 130], [1720, 190], [1990, 190], [2190, 190], [2190, 420], [2190, 960], [2190, 1500], [2190, 1720], [2190, 1860]];
  const B = (window.__bot = { wp: 0, t: 0, ticks: 0, simT: -1, deaths: v.scene.sim.deaths ?? 0, act: {}, stuck: 0, lx: 0, lz: 0, side: 0, atk: 0, minHp: 100, jumpT: 0, dodge: 0, fs: 0, skipMap: {}, skips: 0, max: { draws: 0, tris: 0, charTris: 0, drawn: 0, culled: 0, stop: 0, shots: 0, dying: 0, lights: 0 }, feel0: 0 });
  const target = (h, E, now) => { let tg = null, bd = 1e9; for (const e of E) { if (e.state === 'dead' || (B.skipMap[e.id] ?? 0) > now) continue; const d = Math.hypot(e.x - h.x, (e.z - h.z) * 1.5); if (Math.abs(e.y - h.y) > 110) continue; if (!(e.active ? d < 620 : d < 300)) continue; if (d < bd) { bd = d; tg = e; } } return tg; };
  const waypoint = (h) => { let ni = B.wp, nd = 1e9; for (let i = B.wp; i < ROUTE.length; i++) { const d = Math.hypot(ROUTE[i][0] - h.x, ROUTE[i][1] - h.z); if (d < nd) { nd = d; ni = i; } } B.wp = ni; const w = ROUTE[B.wp]; if (Math.hypot(w[0] - h.x, w[1] - h.z) < 26 && B.wp < ROUTE.length - 1) B.wp++; return ROUTE[B.wp]; };
  input.setAutoSource(() => B.act);
  // ── one brain for both input paths: decide() -> analog wishes { mx, mz, attack, dash(roll), guard, jump } ──
  //    tactics for the real rules: walk the route; guard an attack that is being wound up in front of the hero (the roll button
  //    held without the stick), roll away from what cannot be guarded or comes from behind, strike in the gaps
  const D = (B.d = { lx: 0, lz: 0, lt: 0, stuckT: 0, escT: 0, escS: 1, rollT: 0, fs: 0, o: { mx: 0, mz: 0, attack: false, dash: false, guard: false, jump: false } });
  B.pt = 0; B.now = () => B.pt / 60;   // the bot's clock = rule ticks (works fast-forwarded, stands still during hit-stop)
  B.decide = () => {
    const sim = v.scene.sim, h = sim.hero, E = sim.enemies, now = B.now(), o = D.o;
    o.mx = 0; o.mz = 0; o.attack = false; o.dash = false; o.guard = false; o.jump = false;
    B.minHp = Math.min(B.minHp, h.hp);
    if (h.dead || sim.section === 'done') return o;
    const hdx = h.dirX ?? h.facing ?? 1, hdz = h.dirZ ?? 0;
    // 1) something is about to hit: an enemy winding up within its reach, or a shot close by
    let th = null, td = 1e9, tx0 = 0, tz0 = 0, canGuard = true;
    for (let i = 0; i < E.length; i++) {
      const e = E[i]; if (e.dead || e.state === 'dead' || Math.abs(e.y - h.y) > 110) continue;
      const A = e.atk, wind = e.tele !== undefined ? e.tele > 0.2 && A && !A.shot : e.state === 'attack';
      if (!wind) continue;
      const d = Math.hypot(e.x - h.x, e.z - h.z), reach = A ? (A.box ? A.box.f1 + (A.lunge ?? 0) : A.radius ? A.radius.r + A.radius.fwd : 100) + 36 : 110;
      if (d < reach && d < td) { td = d; th = e; tx0 = e.x; tz0 = e.z; canGuard = e.tele !== undefined && (!A || (A.guard !== 'break' && A.guard !== 'chip')); }
    }
    const S = sim.shots;
    for (let i = 0; i < S.length; i++) { const q = S[i]; if (q.dead || q.friendly) continue; const d = Math.hypot(q.x - h.x, q.z - h.z); if (d < 150 && d < td && Math.abs(q.y - h.y - 60) < 90) { td = d; th = q; tx0 = q.x; tz0 = q.z; canGuard = sim.hero.guard !== undefined; } }
    if (th) {
      const ux = (tx0 - h.x) / (td || 1), uz = (tz0 - h.z) / (td || 1), front = hdx * ux + hdz * uz;
      if (canGuard && front > 0.35) { o.guard = true; return o; }                       // face it and block (the rules turn an early block into a parry)
      if (now > D.rollT) { D.rollT = now + 0.7; o.dash = true; o.mx = -ux; o.mz = -uz; if (Math.abs(o.mz) < 0.3 && (h.z < 100 || h.z > 2000)) o.mz = h.z < 100 ? 0.7 : -0.7; return o; }   // roll away
      o.mx = -ux; o.mz = -uz; return o;                                                  // roll not ready: step back
    }
    // 2) fight the nearest enemy that has seen us (or stands in the way), else follow the route
    const tg = target(h, v.enemies, B.t);
    let tx = null, tz = 0, fight = false;
    if (tg) {
      fight = true; const dx = tg.x - h.x, dz = tg.z - h.z, d = Math.hypot(dx, dz);
      if (d < 96 && Math.abs(dz) < 40) { o.mx = (dx / (d || 1)) * 0.55; o.mz = (dz / (d || 1)) * 0.55; o.attack = true; }   // in reach: face it (360 degrees) and strike
      else { const side = h.x <= tg.x ? -1 : 1; tx = tg.x + side * 62; tz = tg.z; }
    } else { const w = waypoint(h); tx = w[0]; tz = w[1]; }
    if (tx !== null) { const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz); if (d > 6) { const k = d > 50 ? 1 : 0.6; o.mx = (dx / d) * k; o.mz = (dz / d) * k; } }
    if (now - D.lt >= 0.25) { const moved = Math.hypot(h.x - D.lx, h.z - D.lz); D.lx = h.x; D.lz = h.z; D.lt = now; if ((o.mx || o.mz) && !o.attack && moved < 6) D.stuckT += 0.25; else D.stuckT = Math.max(0, D.stuckT - 0.25); }
    if (D.stuckT >= 0.75) { if (fight && ++D.fs >= 3) { B.skipMap[tg.id] = B.t + 420; D.fs = 0; B.skips++; } D.stuckT = 0; D.escT = now + 0.5; D.escS = h.z > 150 && h.z < 260 ? -1 : 1; if (fight && Math.random() < 0.5) D.escS = -D.escS; }
    if (now < D.escT) { o.jump = D.escT - now > 0.25; o.mz = D.escS; o.mx *= 0.3; o.attack = false; }
    return o;
  };
  const restart = () => { const d = v.scene.sim.deaths ?? 0; if (d !== B.deaths) { B.deaths = d; B.wp = 0; B.skipMap = {}; D.stuckT = 0; D.escT = 0; } };   // fell and started over: follow the route from its beginning again
  /** true when the rules moved since the last call (false during hit-stop: keep the last decision) */
  const ruleTick = () => { const st = v.scene.sim.time ?? 0; B.ticks++; if (st === B.simT) return false; B.simT = st; B.t++; B.pt++; restart(); return true; };
  // digital path (keyboard-like actions through the input auto source)
  B.think = () => {
    if (!ruleTick()) return;
    const o = B.decide(), a = (B.act = {});
    if (o.mx > 0.3) a.right = true; else if (o.mx < -0.3) a.left = true;
    if (o.mz > 0.3) a.up = true; else if (o.mz < -0.3) a.down = true;
    if (o.guard) a.dash = true;                                   // held with no direction = guard
    else if (o.dash) a.dash = B.t % 2 === 0;                      // a fresh press
    if (o.attack) { B.atk++; if (B.atk % 7 < 3) a.attack = true; }
    if (o.jump) a.jump = true;
  };
  const watch = () => {
    const sc = v.scene, s = sc.c3, F = sc.fx?.feel, M = B.max, G = sc.glr.stats;
    M.draws = Math.max(M.draws, G.draws + (sc.fx?.stats.draws ?? 0)); M.tris = Math.max(M.tris, G.tris); M.charTris = Math.max(M.charTris, s.tris); M.drawn = Math.max(M.drawn, s.drawn); M.culled = Math.max(M.culled, s.culled);
    if (F) M.stop = Math.max(M.stop, F.stop); M.shots = Math.max(M.shots, sc.shotN); M.lights = Math.max(M.lights, sc.fx?.lights.count ?? 0);
    let dy = 0; for (const a of sc.actors) if (a.dieAge >= 0) dy++; M.dying = Math.max(M.dying, dy);
  };
  B.run = (n, renderEvery) => {
    g._pageHidden = true;
    for (let i = 0; i < n; i++) {
      B.think(); g.tick(1 / 60); watch();
      if (renderEvery && i % renderEvery === 0) { g.alpha = 1; g.render(); watch(); }
      if (v.section === 'done') break;
    }
    g.alpha = 1; g.render();
    return B.status();
  };
  B.status = () => { const h = v.hero; return { ticks: B.ticks, sec: v.section, x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), hp: h.hp, left: v.enemies.length, yard: v.enemies.filter((e) => e.yard).length, wp: B.wp, t: B.t, deaths: v.scene.sim.deaths ?? 0, minHp: B.minHp, max: B.max, skips: B.skips, feelN: v.scene.feelN - B.feel0, simT: +(v.scene.sim.time ?? 0).toFixed(1) }; };
  // touch driver: the pilot's wishes go through the virtual pad's own pointer handlers (stick drag + button presses) every tick
  const fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 21, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
  const COOL = { attack: 5, dash: 24, jump: 12 }, FINGER = { attack: 11, dash: 12, jump: 13 };
  B.touchSetup = (x0, y0, R, btn) => { B.ts = { x0, y0, R, btn, stick: false, held: { attack: 0, dash: 0, jump: 0 }, presses: { attack: 0, dash: 0, jump: 0, guard: 0 }, moves: 0 }; input.setAutoSource(null); B.act = {}; };
  B.touchStep = () => {
    const S = B.ts; if (!ruleTick()) return;
    const w = B.decide(); watch();
    if (!S.stick) { fire('pointerdown', 21, S.x0, S.y0); S.stick = true; }
    fire('pointermove', 21, S.x0 + w.mx * S.R, S.y0 - w.mz * S.R); S.moves++;
    for (const k of ['attack', 'dash', 'jump']) {
      const b = S.btn[k]; let st = S.held[k]; if (!b) continue;
      if (k === 'dash' && st === 999) { if (!w.guard) { fire('pointerup', FINGER[k], b.cx, b.cy); st = -3; } }          // guarding: the roll button stays down
      else if (k === 'dash' && w.guard && st <= 0) { fire('pointerdown', FINGER[k], b.cx, b.cy); S.presses.guard++; st = 999; }
      else if (st > 0) { if (--st === 0) { fire('pointerup', FINGER[k], b.cx, b.cy); st = -COOL[k]; } }
      else if (st < 0) st++;
      else if (w[k]) { fire('pointerdown', FINGER[k], b.cx, b.cy); S.presses[k]++; st = 3; }
      S.held[k] = st;
    }
  };
  B.touchEnd = () => { const S = B.ts; if (!S) return; for (const k of ['attack', 'dash', 'jump']) if (S.held[k] > 0 && S.btn[k]) fire('pointerup', FINGER[k], S.btn[k].cx, S.btn[k].cy); if (S.stick) fire('pointerup', 21, S.x0, S.y0); S.stick = false; };
  B.touchRun = (n, renderEvery) => {
    g._pageHidden = true;
    for (let i = 0; i < n; i++) { B.touchStep(); g.tick(1 / 60); if (renderEvery && i % renderEvery === 0) { g.alpha = 1; g.render(); watch(); } if (v.section === 'done') break; }
    g.alpha = 1; g.render();
    const st = B.status(); st.presses = B.ts.presses; st.stickMoves = B.ts.moves; st.mode = input.mode; return st;
  };
  B.stop = () => { B.act = {}; input.setAutoSource(null); };
  return true;
}

async function open(device, extra = GL_ARGS, q = '') {
  const browser = await chromium.launch({ executablePath: EXE, args: extra });
  const ctx = await browser.newContext(contextOptions(device));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/index.html?scene=v2g${q}`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 60000 }).catch(() => errs.push('ready timeout'));
  return { browser, page, errs };
}
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
    const flatLeft = st0.atlasKeys.filter((k) => !['glow', 'blob', 'moss', 'puddle', 'stain'].includes(k));
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
      pad = await padLayout(page);
      const ids = Object.keys(pad.buttons ?? {});
      const h0 = await page.evaluate(() => window.__v2.hero);
      await stickHold(T, page, 46, -46, 1100);
      const h1 = await page.evaluate(() => window.__v2.hero);
      await page.evaluate(() => { const sim = window.__v2.scene.sim; for (const e of sim.enemies) if (!e.yard) e.dead = true; sim.hero.x = 900; sim.hero.z = 190; });   // controls only: clear the street (the yard group stays, or the area would count as cleared), stand in the open
      const until = (what, ms) => page.evaluate(async ([what, ms]) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const h = window.__v2.hero; if (what === 'air' ? !h.onGround : h.anim === what) return true; await new Promise((r) => setTimeout(r, 8)); } return false; }, [what, ms]);
      const [, wa] = await Promise.all([pressButton(T, page, 'attack', 220), until('attack', 3000)]);
      await page.waitForTimeout(500);
      const [, wj] = await Promise.all([pressButton(T, page, 'jump', 220), until('air', 3000)]);
      await page.waitForTimeout(900);
      // roll = the roll button while the stick is pushed (without the stick the same button guards — PLAY_API 1)
      const rolling = page.evaluate(async () => { const t0 = performance.now(); while (performance.now() - t0 < 3500) { const h = window.__v2.scene.sim.hero; if (h.dashT > 0 || h.anim === 'roll' || h.anim === 'dash') return true; await new Promise((r) => setTimeout(r, 8)); } return false; });
      await stickHold(T, page, 50, 0, 250, { keep: true });
      await pressButton(T, page, 'dash', 200); await page.waitForTimeout(300);
      await T.upAll();
      const wd = await rolling;
      R.touch = { pad: ids, moved: [Math.round(h1.x - h0.x), Math.round(h1.z - h0.z)], face: h1.face.map((n) => +n.toFixed(2)), attack: wa, jump: wj, dash: wd };
      const T_OK = R.touch.moved[0] > 40 && R.touch.moved[1] > 25 && wa && wj && wd && ['attack', 'jump', 'dash'].every((b) => ids.includes(b));
      if (T_OK) ok(`touch: stick right+up moved the hero ${R.touch.moved.join(',')} facing (${R.touch.face.join(',')}), attack / jump / roll buttons work (pad buttons: ${ids.join(' ')})`); else fail(`${dev}: touch controls ${JSON.stringify(R.touch)}`);
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
      toYard(); for (let i = 0; i < 360; i++) { B.act = script(i); g.tick(1 / 60); g.render(); }   // warm the JIT on the same path
      sc.sim.reset(); sc.cam.snap = true; for (let i = 0; i < 120; i++) { B.act = NONE; g.tick(1 / 60); g.render(); }
      stub(true); const shell = [measure(240, false), measure(240, false), measure(240, false)]; stub(false);
      const idle = [measure(240, false), measure(240, false), measure(240, false), measure(240, false)];
      toYard(); const play = [measure(300, true), measure(300, true), measure(300, true), measure(300, true)]; B.act = NONE;
      return { shell, idle, play, gc: !!window.gc, hits: sc.feelN };
    });
    R.alloc = al;
    // The heap counter also moves when the collector runs inside a repeat, so single repeats scatter (even below the shell-only figure);
    // the median of the repeats is compared with the shell alone. V8 allocates number boxes in code it has not optimised yet,
    // which is why tools/v2/fx_check.mjs found the same kind of leftover bytes.
    const med = (a) => { const q = [...a].sort((x, y) => x - y); return q.length % 2 ? q[(q.length - 1) / 2] : Math.round((q[q.length / 2 - 1] + q[q.length / 2]) / 2); };
    const shellB = med(al.shell), idleB = med(al.idle), playB = med(al.play);
    R.allocScene = { shell: shellB, idle: idleB, play: playB };
    if (al.gc && idleB <= shellB + 2048 && playB <= shellB + 4096) ok(`allocation per frame (tick + draw, JS heap, median of the repeats): v1 shell alone (input, pad) ${shellB} bytes · with the scene standing still ${idleB} bytes · in a scripted yard fight ${playB} bytes (repeats: shell ${al.shell.join('/')}, standing ${al.idle.join('/')}, fight ${al.play.join('/')})`);
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
  console.log('\n[UI seam: ?v2ui=1]');
  const { browser, page, errs } = await open(DEVICES[0], GL_ARGS, '&v2ui=1');
  try {
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const g = window.__game, v = window.__v2; if (!v?.ready) return { ready: false, err: v?.error ?? null }; g._pageHidden = true; g.input.setAutoSource(() => ({ right: true })); for (let i = 0; i < 120; i++) { g.tick(1 / 60); if (i % 10 === 0) g.render(); } g.render(); g.input.setAutoSource(null); const s = v.stats; return { ready: true, hud: s.hud, x: Math.round(v.hero.x), draws: s.gl.draws, pad: !!document.getElementById('v2pad'), hidePad: !!v.scene.hidePad }; });
    report.ui = { ...r, errors: errs.slice(0, 5) };
    await page.screenshot({ path: `${SHOTS}/x_ui_seam.png` });
    if (r.ready && r.x > 300 && r.draws > 5 && !errs.length) ok(`with v2ui=1 the scene runs with the "${r.hud}" HUD (${r.hud === 'ui' ? 'the UI lane module drew without an exception' : 'the UI module failed and the built-in HUD took over'}), hero walked to x ${r.x}, 0 page errors`);
    else fail('UI seam: ' + JSON.stringify(report.ui));
  } catch (e) { fail('UI seam: check script exception ' + e.message); } finally { await browser.close(); }
}
srv.close();
report.fails = fails;
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1));
console.log(fails.length ? `\nFAIL ${fails.length}` : '\nALL OK');
process.exit(fails.length ? 1 : 0);
