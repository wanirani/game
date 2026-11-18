// v2g integration verifier (INTEGRATE-VERIFY): adversarial runs on the scene the integration lanes built.
//   node tools/v2/game_iverify.mjs --plan touch     [--device fold_open]  clean save, story on, REAL-TIME play with trusted (CDP) touches:
//                                                    opening by taps, stick, attack/jump/roll, pause, old pad and back, person + dialogue, fall + retry, leave + continue
//   node tools/v2/game_iverify.mjs --plan cross     trusted long press on the bell button next to the bell: there and back (story off), events + sounds fired
//   node tools/v2/game_iverify.mjs --plan kinds     every enemy kind of the real areas met by the bot (drawn, model, clips, hits both ways), one still each
//   node tools/v2/game_iverify.mjs --plan saves     broken saves: empty, truncated, future version, wrong shapes, absurd numbers
//   node tools/v2/game_iverify.mjs --plan ctx       WebGL context lost in a real area, during a crossing, during a journey
//   node tools/v2/game_iverify.mjs --plan resize    rotate / resize during a fight and during a crossing
//   node tools/v2/game_iverify.mjs --plan leaveload leave while an area is loading, re-enter 5 times (heap, canvases)
//   node tools/v2/game_iverify.mjs --plan combos    v2ui=0/1/stored x stored perf settings (valid, absurd, broken)
//   node tools/v2/game_iverify.mjs --plan cross50   50 crossings at exits, stairs, area edges (+ graveyard and ossuary pairs); time, heap, GPU bytes
//   node tools/v2/game_iverify.mjs --plan fuzz      [--ticks 12000] [--areas a,b] random input in each area: bad numbers, outside the map, stuck
//   [--device fold_open|phone2] [--out /tmp/claude-0/v2/integverify] [--res 0.5]
// Trusted touches = CDP Input.dispatchTouchEvent (tools/qa/lib/touch.mjs); the page counts isTrusted on every pointerdown it receives.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';
import { installBot } from './game_bot.mjs';
import { loadPropsNode } from './world_node.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const PLAN = String(args.plan || 'touch'), DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/integverify'), RES = Number(args.res ?? 0.5);
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'];
fs.mkdirSync(OUT, { recursive: true });
const fails = [], notes = [], R = { plan: PLAN, device: DEV, at: new Date().toISOString() };
const fail = (m) => { fails.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const info = (m) => { notes.push(m); console.log('  info ' + m); };
const chk = (c, m) => (c ? ok(m) : fail(m));

loadPropsNode();
const { AREAS } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const built = new Map();
async function areaOf(id, flags) { const k = id + '|' + Object.keys(flags ?? {}).filter((f) => flags[f]).sort().join('+'); let o = built.get(k); if (!o) { const a = await AREAS[id](flags ?? {}); o = { a, W: compileEnv(a.stage) }; built.set(k, o); } return o; }

/** in the page: counters, sanity checks, fast-forward */
function installIv() {
  const g = window.__game, v = window.__v2;
  if (window.__iv && window.__iv.scene === v.scene) return;
  const I = (window.__iv = { scene: v.scene, ev: [], trusted: 0, untrusted: 0, snd: [], bcache: {} });
  if (!window.__ivOnce) {
    window.__ivOnce = { trusted: 0, untrusted: 0, snd: [] };
    window.addEventListener('pointerdown', (e) => { if (e.isTrusted) window.__ivOnce.trusted++; else window.__ivOnce.untrusted++; }, true);
    for (const C of [window.AudioBufferSourceNode, window.OscillatorNode]) { if (!C) continue; const st = C.prototype.start; C.prototype.start = function (...a) { const L = window.__ivOnce.snd; if (L.length < 6000) L.push([Math.round(performance.now()), this.buffer ? +this.buffer.duration.toFixed(2) : 0]); return st.apply(this, a); }; }
  }
  const sc = v.scene, em = sc.emit;
  sc.emit = function (n, d) { I.ev.push(n + (d && d.phase ? ':' + d.phase : '')); if (I.ev.length > 6000) I.ev.shift(); return em.call(this, n, d); };
  I.counts = () => ({ trusted: window.__ivOnce.trusted, untrusted: window.__ivOnce.untrusted, snd: window.__ivOnce.snd.length });
  I.draw = () => { g.alpha = 1; g.render(); };
  I.rt = (on) => { g._pageHidden = !on; if (on) { g.last = performance.now(); g.dirty = true; } };
  I.ff = (n, every = 40) => { g._pageHidden = true; let i = 0; for (; i < n; i++) { g.tick(1 / 60); if (every && i % every === 0) I.draw(); } I.draw(); return i; };
  I.st = () => { const s = v.scene, sim = s.sim, h = sim?.hero, H = s.host; return { ready: !!v.ready, err: v.error ? String(v.error).slice(0, 120) : null, area: v.area, era: s.area?.era ?? null, x: h ? Math.round(h.x) : null, y: h ? Math.round(h.y) : null, z: h ? Math.round(h.z) : null, hp: h ? Math.round(h.hp) : null, hpMax: h?.hpMax ?? null, dead: !!h?.dead, onGround: !!h?.onGround, act: h?.act ?? null, move: h?.move?.id ?? null, modal: s.hud?.modal ?? null, go: !!s._go, xing: !!s.xing, fade: +(+s.fadeA).toFixed(2), locked: !!s.locked, hud: s.hudKind, busy: !!H?.st?.busy, obj: H?.objective ?? '', seen: H?.seen?.length ?? 0, deaths: sim?.deaths ?? 0, prompt: v.prompt?.id ?? null, time: +(sim?.time ?? 0).toFixed(2), story: !!H }; };
  I.bounds = () => { const s = v.scene, id = s.area?.id ?? ''; let b = I.bcache[id]; if (!b) { b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, y0: 1e9, y1: -1e9 }; for (const q of s.W.boxes) { if (!q.walk) continue; b.x0 = Math.min(b.x0, q.x0); b.x1 = Math.max(b.x1, q.x1); b.z0 = Math.min(b.z0, q.z0); b.z1 = Math.max(b.z1, q.z1); b.y0 = Math.min(b.y0, q.y1); b.y1 = Math.max(b.y1, q.y1); } I.bcache[id] = b; } return b; };
  /** [] when every number of the hero, enemies, shots and camera is finite and the hero is inside the map */
  I.sane = () => {
    const s = v.scene, sim = s.sim, bad = []; if (!sim) return ['no sim'];
    const h = sim.hero, fin = (o, keys, tag) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && !Number.isFinite(o[k])) bad.push(tag + '.' + k + '=' + o[k]); };
    fin(h, ['x', 'y', 'z', 'vx', 'vy', 'vz', 'hp', 'dirX', 'dirZ'], 'hero');
    for (const e of sim.enemies) fin(e, ['x', 'y', 'z', 'hp'], e.kind);
    for (const q of sim.shots ?? []) fin(q, ['x', 'y', 'z'], 'shot');
    fin(s.cam, ['px', 'py', 'pz', 'fx', 'fy', 'fz', 'dist'], 'cam');
    const st = s.state ?? {}; for (const k of ['hp', 'hpMax']) if (st[k] !== undefined && !Number.isFinite(st[k])) bad.push('state.' + k);
    const B = I.bounds(); if (h.x < B.x0 - 30 || h.x > B.x1 + 30 || h.z < B.z0 - 30 || h.z > B.z1 + 30) bad.push(`hero outside the map (${Math.round(h.x)},${Math.round(h.z)})`); if (h.y < B.y0 - 260) bad.push('hero under the world y=' + Math.round(h.y));
    return bad;
  };
  I.inside = () => { const s = v.scene, h = s.sim.hero; for (const q of s.W.boxes) if (q.solid && !q.walk && h.x > q.x0 + 2 && h.x < q.x1 - 2 && h.z > q.z0 + 2 && h.z < q.z1 - 2 && h.y + 50 > q.y0 && h.y + 10 < q.y1) return [q.x0, q.x1, q.z0, q.z1, q.y0, q.y1]; return null; };
  I.ground = (x, z) => { const s = v.scene; let gy = -1e9; for (const b of s.W.boxes) if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > gy) gy = b.y1; return gy > -1e8 ? gy : null; };
  I.put = (x, z, y) => { const s = v.scene; if (!s.sim) return null; const h = s.sim.hero; h.x = x; h.z = z; const gy = y ?? I.ground(x, z); if (gy != null) h.y = gy; h.vx = 0; h.vz = 0; h.vy = 0; if (h.safe) { h.safe.x = x; h.safe.z = z; h.safe.y = h.y; } s.cam.snap = true; g.tick(1 / 60); return [Math.round(h.x), Math.round(h.y), Math.round(h.z)]; };
  I.fellNear = (r) => { const sim = v.scene.sim, h = sim.hero; let n = 0; for (const e of sim.enemies) if (!e.dead && e.state !== 'dead' && Math.hypot(e.x - h.x, e.z - h.z) < r) { e.hp = 0; sim._kill(e); n++; } return n; };
  I.mem = () => { try { window.gc?.(); } catch { /* no gc */ } const s = v.stats; return { tex: s.gl.texBytes, buf: s.gl.bufBytes, canvases: s.canvases, dom: document.querySelectorAll('canvas').length, heap: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1024), models: s.chars.models.length, area: s.area }; };
  I.gl = () => { const s = v.stats; return { draws: s.gl.draws, tris: s.gl.tris, world: s.world?.tris ?? null, chars: s.chars?.tris ?? null, drawn: s.chars?.drawn ?? null, texMB: s.gl.texMB, bufMB: +(s.gl.bufBytes / 1048576).toFixed(1), res: s.res, loadMs: s.loadMs, hud: s.hud, canvas: s.gl.canvas ?? null, models: s.chars.models.length, fx: s.fx?.particles ?? s.fx?.live ?? null }; };
}

const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage(), errs = [], reqs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 300)));
page.on('request', (q) => { const u = q.url(); if (/\.(ogg|mp3|m4a|wav|webm|opus)(\?|$)/.test(u)) reqs.push([Date.now(), u.replace(/^.*?\/assets\//, 'assets/')]); });
page.on('response', (r) => { if (r.status() >= 400) errs.push(`[http ${r.status()}] ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); });
const base = `http://localhost:${port}`;
let T = null;
const ev = (fn, a) => page.evaluate(fn, a);
const st = () => ev(() => window.__iv.st());
const shot = async (name, draw = true) => { if (draw) await ev(() => window.__iv?.draw()).catch(() => {}); await page.waitForTimeout(120); await page.screenshot({ path: `${OUT}/${name}.png` }); return name; };
async function clean(set) { const n = errs.length; await page.goto(base + '/robots.txt'); await ev((s) => { localStorage.clear(); for (const k of Object.keys(s ?? {})) localStorage.setItem(k, s[k]); }, set ?? null); await page.waitForTimeout(60); errs.length = n; }   // the helper page's own favicon 404 is not the game's
async function open(q = '', { wait = 90000, bot = true } = {}) {
  const t0 = Date.now();
  await page.goto(`${base}/index.html?scene=v2g&v2auto=0${RES < 1 ? '&v2res=' + RES : ''}${q}`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: wait }).catch(() => errs.push('ready timeout ' + q));
  const ready = await ev(() => !!window.__v2?.ready).catch(() => false);
  if (!ready) return { ready: false, err: await ev(() => String(window.__v2?.error ?? 'no __v2')).catch((e) => String(e)), ms: Date.now() - t0 };
  await page.waitForTimeout(250);
  const cdp = await page.context().newCDPSession(page); T = new Touch(cdp, page);
  if (contextOptions(DEV).hasTouch) { await ensureTouchMode(T, page); await page.waitForTimeout(200); }
  if (bot) await ev(installBot, [[0, 0]]);
  await ev(installIv);
  return { ready: true, ms: Date.now() - t0, ...(await st()) };
}
const padOf = () => ev(() => { const m = window.__v2.scene.hud.metrics?.(); if (!m?.pad) return null; const o = {}; for (const b of m.pad.buttons) o[b.id] = { cx: b.cx, cy: b.cy, d: b.d, disabled: !!b.disabled }; return o; });
const botTouch = async () => { const pad = await padOf(); if (!pad) return false; const Bt = {}; for (const k of Object.keys(pad)) Bt[k === 'roll' ? 'dash' : k] = pad[k]; const vp = await ev(() => [innerWidth, innerHeight]); await ev(([x0, y0, btn]) => { const B = window.__bot; B.opt.giveUp = 1500; B.touchSetup(x0, y0, 56, btn); }, [Math.round(vp[0] * 0.2), Math.round(vp[1] * 0.68), Bt]); return true; };
/** fast-forward n rule ticks with the bot on the pad's own handlers (untrusted pointer events, as the lanes' tools do) or without it */
const ff = (n, bot = false, every = 40) => ev(([k, b, e]) => { const g = window.__game, B = window.__bot, v = window.__v2; g._pageHidden = true; let i = 0; for (; i < k; i++) { if (b && v.ready && !v.scene._go && !v.scene.xing && !v.scene.hud.modal && B.ts) B.touchStep(); g.tick(1 / 60); if (e && i % e === 0) window.__iv.draw(); } if (b && B.ts) B.touchEnd(); window.__iv.draw(); return window.__iv.st(); }, [n, bot, every]);
/** fast-forward through dialogues with untrusted taps until the story is idle (used to get past story holds quickly, not counted as play) */
const settle = (max = 2400) => ev((m) => { const g = window.__game, v = window.__v2, sc = v.scene; g._pageHidden = true; const fire = (type, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: 31, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 })); let idle = 0, i = 0; for (; i < m; i++) { if (sc.hud.modal === 'dialog' && i % 9 === 0) { const d = sc.hud.metrics?.().dialog, r = g.canvasRect, s = sc.state; let lx = s.viewW / 2, ly = s.viewH * 0.3; if (d && d.choices && Array.isArray(d.choiceRects) && d.choiceRects.length && d.shown >= d.total && d.page >= d.pages - 1) { const c = d.choiceRects[0]; lx = c.x + c.w / 2; ly = c.y + c.h / 2; } const x = r.x + lx / s.viewW * r.w, y = r.y + ly / s.viewH * r.h; fire('pointerdown', x, y); fire('pointerup', x, y); } g.tick(1 / 60); const q = v.ready && !sc.hud.modal && !(sc.host?.st.busy) && !sc._go && !sc.xing && sc.fadeA <= 0.01; idle = q ? idle + 1 : 0; if (idle > 40) break; } window.__iv.draw(); return window.__iv.st(); }, max);
const waitReady = async (pred, ms = 60000) => { const t0 = Date.now(); let s = null; while (Date.now() - t0 < ms) { s = await st().catch(() => null); if (s && pred(s)) return s; await page.waitForTimeout(200); } return s; };
const rt = (on) => ev((o) => window.__iv.rt(o), on);
const toClient = (lx, ly) => ev(([x, y]) => { const g = window.__game, r = g.canvasRect, s = window.__v2.scene.state; return [r.x + x / s.viewW * r.w, r.y + y / s.viewH * r.h]; }, [lx, ly]);
const rowTap = async (id, nth = 0) => { const q = await ev(([id2, n]) => { const g = window.__game, m = window.__v2.scene.hud.metrics().pause; if (!m) return null; let i = -1, k = 0; if (m.ids) { for (let j = 0; j < m.ids.length; j++) if (m.ids[j] === id2 && k++ === n) { i = j; break; } } else i = id2 === 'resume' ? 0 : id2 === 'leave' ? m.rows.length - 1 : id2 === 'extra' ? 1 + n : -1; const r = m.rows[i]; return r ? { x: g.canvasRect.x + (r.x + r.w / 2) * g.cssScale, y: g.canvasRect.y + (r.y + r.h / 2) * g.cssScale, ids: m.ids ?? null, i } : { ids: m.ids ?? null, i }; }, [id, nth]); if (q && q.x != null) await T.tap(q.x, q.y, 80); return q; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

try {
  // ───────────────────────────── touch: the owner's first minutes by real touches, in real time ─────────────────────────────
  if (PLAN === 'touch') {
    await clean();
    const o = await open('');
    chk(o.ready && o.area === 'eshville_now' && o.story && o.hud === 'ui', `clean save: 「본 게임」 opens ${o.area} (story ${o.story}, hud ${o.hud}) in ${o.ms} ms`);
    await rt(true);
    // 1) the opening, advanced only by trusted taps
    const t0 = Date.now(); let taps = 0, firstDlg = false, idleN = 0; const vp = await ev(() => [innerWidth, innerHeight]);
    while (Date.now() - t0 < 150000) {
      const s = await st();
      if (s.modal === 'dialog') { if (!firstDlg) { firstDlg = true; await page.waitForTimeout(900); await shot(`touch_${DEV}_01_opening_dialog`, false); } await T.tap(vp[0] * 0.5, vp[1] * 0.3, 60); taps++; idleN = 0; await page.waitForTimeout(260); continue; }
      const idle = s.ready && !s.modal && !s.busy && !s.go && !s.xing && s.fade <= 0.01; idleN = idle ? idleN + 1 : 0; if (idleN >= 4) break;
      await page.waitForTimeout(250);
    }
    let s = await st(); const c1 = await ev(() => window.__iv.counts());
    chk(firstDlg && !s.busy && !s.modal && s.obj !== '' && c1.trusted >= taps && taps > 0, `opening played in real time by ${taps} trusted taps in ${((Date.now() - t0) / 1000).toFixed(0)} s wall (page saw ${c1.trusted} trusted / ${c1.untrusted} untrusted pointerdowns); objective "${s.obj}"; ${s.seen} things shown`);
    await shot(`touch_${DEV}_02_first_view`, false);
    const idleRT = async (ms = 40000) => { const t1 = Date.now(); let n = 0, k = 0; while (Date.now() - t1 < ms) { const q = await st(); if (q.modal === 'dialog') { await T.tap(vp[0] * 0.5, vp[1] * 0.3, 60); n++; k = 0; await page.waitForTimeout(240); continue; } const idle = q.ready && !q.modal && !q.busy && !q.go && !q.xing && q.fade <= 0.01; k = idle ? k + 1 : 0; if (k >= 3) break; await page.waitForTimeout(200); } return n; };
    // 2) the stick and the three main buttons
    const pad = await padOf(); R.pad = pad;
    const x0 = Math.round(vp[0] * 0.2), y0 = Math.round(vp[1] * 0.68), h0 = await st();
    await T.down(1, x0, y0); await page.waitForTimeout(40); for (let i = 1; i <= 4; i++) { await T.move(1, x0 + 14 * i, y0); await page.waitForTimeout(20); }
    await page.waitForTimeout(1600); const h1 = await st(); await shot(`touch_${DEV}_03_running`, false); await T.up(1);
    chk(h1.x - h0.x > 60, `stick held right 1.6 s: hero moved ${h1.x - h0.x} px`);
    const dl = await idleRT(); if (dl) info(`a story dialogue opened while walking (first bell): closed by ${dl} trusted taps`);
    const seeMove = () => ev(async () => { const t = performance.now(), seen = new Set(); while (performance.now() - t < 2500) { const h = window.__v2.scene.sim.hero; if (h.move?.id) seen.add(h.move.id); if (!h.onGround) seen.add('air'); if (h.act) seen.add('act:' + h.act); if (h.dashT > 0) seen.add('roll'); if (h.guard) seen.add('guard'); await new Promise((r) => setTimeout(r, 6)); } return [...seen]; });
    let p = seeMove(); await page.waitForTimeout(100); for (let k = 0; k < 3; k++) { await T.tap(pad.attack.cx, pad.attack.cy, 90, 11); await page.waitForTimeout(240); } let mv = await p;
    chk(mv.some((m) => !m.startsWith('act:') && m !== 'air' && m !== 'roll' && m !== 'guard'), `attack button x3: moves seen ${mv.join(' ') || 'none'}`);
    await shot(`touch_${DEV}_04_swing`, false);
    await idleRT(8000); p = seeMove(); await page.waitForTimeout(100); await T.tap(pad.jump.cx, pad.jump.cy, 90, 12); mv = await p; chk(mv.includes('air'), `jump button: ${mv.join(' ') || 'nothing seen'}`);
    await ev(() => { const sim = window.__v2.scene.sim, up = sim.update, L = (window.__rl = { maxDash: 0 }); sim.update = function (dt, inp) { const r = up.call(this, dt, inp); if (this.hero.dashT > L.maxDash) L.maxDash = this.hero.dashT; return r; }; });
    p = seeMove(); await page.waitForTimeout(100); await T.down(1, x0, y0); await T.move(1, x0 + 50, y0); await page.waitForTimeout(700); await T.tap(pad.roll.cx, pad.roll.cy, 120, 13); await page.waitForTimeout(500); await T.up(1); mv = await p; const rl = await ev(() => window.__rl?.maxDash ?? -1); chk(rl > 0, `roll button with the stick held: rolled (longest roll time ${rl.toFixed(2)} s; seen between frames: ${mv.join(' ') || 'nothing'})`); await idleRT(8000);
    // 3) pause -> old pad -> back to the new buttons
    await T.tap(pad.pause.cx, pad.pause.cy, 80); s = await waitReady((q) => q.modal === 'pause', 8000); await page.waitForTimeout(500); await shot(`touch_${DEV}_05_pause`, false);
    const rows = await ev(() => { const m = window.__v2.scene.hud.metrics().pause; return m ? { ids: m.ids ?? null, n: m.rows.length } : null; });
    chk(s?.modal === 'pause', `pause button opens the pause menu (rows ${rows?.ids?.join(' ')})`);
    await rowTap('extra', 0); s = await waitReady((q) => q.hud === 'builtin', 8000); await page.waitForTimeout(900);
    const oldPad = await ev(async () => { const tp = (await import('/src/core/touchpad.js')).touchpad; const b = tp.buttons().find((x) => x.id === 'pause'); return { vis: tp.visible ?? null, pause: b ? { x: b.cx ?? b.x + b.w / 2, y: b.cy ?? b.y + b.h / 2 } : null, v2pad: getComputedStyle(document.getElementById('v2pad') ?? document.body).display, saved: localStorage.getItem('bn.v2.ui'), modal: window.__v2.scene.hud.modal ?? null }; });
    await shot(`touch_${DEV}_06_old_pad`, false);
    chk(s?.hud === 'builtin' && oldPad.saved === '0', `row 「옛 단추로 바꾸기」: built-in HUD + old pad while playing (bn.v2.ui ${oldPad.saved}, old pad pause button ${oldPad.pause ? 'present' : 'MISSING'}, modal after ${oldPad.modal})`);
    const hA = await st(); await T.down(21, x0, y0); await page.waitForTimeout(40); for (let i = 1; i <= 4; i++) { await T.move(21, x0 + 12 * i, y0); await page.waitForTimeout(20); } await page.waitForTimeout(1200); await T.up(21); const hB = await st();
    chk(hB.x - hA.x > 40, `old pad: stick moved the hero ${hB.x - hA.x} px`);
    // the story on the old pad: a dialogue must still open and close by touch
    { await idleRT(15000); const s0 = await st(); await ev(() => { const sc = window.__v2.scene; window.__ivDlg = 0; sc.host.api.showDialog({ speaker: '카엘', text: '(옛 단추에서도 말이 보이는가.)', onDone() { window.__ivDlg = 1; } }); }).catch((e) => info('showDialog threw on the old pad: ' + String(e).slice(0, 160)));
      await page.waitForTimeout(1200); const s1 = await st(); await shot(`touch_${DEV}_06b_old_pad_dialog`, false); let n = 0; const t2 = Date.now(); while (Date.now() - t2 < 20000 && !(await ev(() => window.__ivDlg === 1))) { await T.tap(vp[0] * 0.5, vp[1] * 0.3, 60); n++; await page.waitForTimeout(300); }
      const done = await ev(() => window.__ivDlg === 1), s2 = await st(); chk(done && !s2.modal, `old pad + story: a dialogue shows (modal ${s1.modal}) and ${n} trusted taps close it (done ${done}, modal after ${s2.modal})`); }
    if (oldPad.pause) { await T.tap(oldPad.pause.x, oldPad.pause.y, 80); s = await waitReady((q) => q.modal === 'pause', 8000); await page.waitForTimeout(500); await shot(`touch_${DEV}_07_old_pause`, false); const q = await rowTap('extra', 0); s = await waitReady((q2) => q2.hud === 'ui', 10000); await page.waitForTimeout(700); chk(s?.hud === 'ui', `old pad pause -> 「새 단추로 바꾸기」 (rows ${q?.ids?.join(' ')}): back on the cut-glass interface (${s?.hud})`); await shot(`touch_${DEV}_08_new_again`, false); }
    await ev(() => localStorage.removeItem('bn.v2.ui'));
    // 4) a townsperson: stand by her (the tool fells what is awake nearby and walks the hero there by the bot), then a real tap on the pill and real taps through the lines
    await rt(false); await ev(installIv); await botTouch();
    const A = (await areaOf('eshville_now', {})).a, who = await ev(() => window.__v2.people.filter((q) => q.on && q.solid).map((q) => ({ id: q.id, x: q.x, z: q.z })));
    const m0 = who.find((q) => q.id === 'marta') ?? who[0];
    if (!m0) fail('no townsperson stands in eshville_now at the start'); else {
      await ev(([x, z]) => { window.__iv.put(x - 44, z - 34); window.__iv.fellNear(800); }, [m0.x, m0.z]); await settle(2400); await ff(60);
      await ev(([x, z]) => { const h = window.__v2.scene.sim.hero; if (Math.hypot(h.x - x, h.z - z) > 80) window.__iv.put(x - 44, z - 34); window.__iv.fellNear(800); }, [m0.x, m0.z]); await settle(1200); await ff(40);
      await rt(true); s = await waitReady((q) => !!q.prompt, 6000); await shot(`touch_${DEV}_09_person_prompt`, false);
      const pill = await ev(() => { const P = window.__v2.scene.hud.metrics?.().prompts ?? []; const q = P.find((r) => r.action === 'confirm') ?? P[0]; return q ? [q.x + q.w / 2, q.y + q.h / 2, q.label ?? ''] : null; });
      if (!pill || !s?.prompt) fail(`no prompt pill next to ${m0.id} (prompt ${s?.prompt}, hero ${s?.x},${s?.z})`); else {
        const c = await toClient(pill[0], pill[1]); const seen0 = s.seen; await T.tap(c[0], c[1], 80); s = await waitReady((q) => q.modal === 'dialog', 6000); await page.waitForTimeout(1200); await shot(`touch_${DEV}_10_person_dialog`, false);
        let n = 0; const tt = Date.now(); while (Date.now() - tt < 60000) { const q = await st(); if (q.modal !== 'dialog' && !q.busy) break; if (q.modal === 'dialog') { await T.tap(vp[0] * 0.5, vp[1] * 0.3, 60); n++; } await page.waitForTimeout(260); }
        const e2 = await st(); chk(s?.modal === 'dialog' && e2.modal !== 'dialog', `a trusted tap on the pill of ${s.prompt ?? m0.id} opens the dialogue; ${n} taps close it (${e2.seen - seen0} things shown)`);
      }
    }
    // 5) fall and retry
    await rt(true); const d0 = await st();
    await ev(() => { const sim = window.__v2.scene.sim, h = sim.hero; h.ifr = 0; h.hp = 1; sim.hurtHero(50, 1, 0, {}); });
    await page.waitForTimeout(900); const dA = await st(); await shot(`touch_${DEV}_11_fallen`, false);
    await rt(false); let dB = null, dT = 0; for (; dT < 2400; dT += 60) { dB = await ff(60, false, 20); if (dB.ready && !dB.dead && dB.deaths > d0.deaths && dB.fade <= 0.05) break; if (!dB.ready) await page.waitForTimeout(250); } await ff(30); dB = await st(); await shot(`touch_${DEV}_12_retry`); info(`retry came ${dT} rule ticks after the fall`); await rt(true);
    chk(dA.dead && dB && !dB.dead && dB.hp > 0, `fall (hp 0): dead ${dA.dead}; retry: stands again at (${dB?.x},${dB?.z}) hp ${dB?.hp}/${dB?.hpMax}, deaths ${d0.deaths} -> ${dB?.deaths}, area ${dB?.area}, objective kept "${dB?.obj}"`);
    // 6) leave by the pause menu, come back: continues from the save
    const dl2 = await idleRT(30000); if (dl2) info(`after the retry a story line opened: closed by ${dl2} trusted taps`);
    // walk a little first, so that "continue" is not trivially the spawn
    await T.down(1, x0, y0); await page.waitForTimeout(40); for (let i = 1; i <= 4; i++) { await T.move(1, x0 + 14 * i, y0 + 3 * i); await page.waitForTimeout(20); } await page.waitForTimeout(1500); await T.up(1); await idleRT(20000); await page.waitForTimeout(400);
    const before = await st(); const pad2 = await padOf();
    await T.tap(pad2.pause.cx, pad2.pause.cy, 80); const pm = await waitReady((q) => q.modal === 'pause', 8000); if (pm?.modal !== 'pause') fail(`the pause button did not open the menu (modal ${pm?.modal}, busy ${pm?.busy})`); await page.waitForTimeout(450);
    const lq = await rowTap('leave', 0); await page.waitForTimeout(2500);
    const top = await ev(() => { const g = window.__game, t = g.scenes[g.scenes.length - 1]; return { name: Object.keys(g.registry).find((k) => t instanceof g.registry[k]) ?? t?.constructor?.name ?? '?', save: (() => { try { const o = JSON.parse(localStorage.getItem('bn.v2.save')); return o ? { v: o.v, why: o.why, area: o.area, pos: o.pos, hp: o.hp } : null; } catch (e) { return 'broken'; } })() }; });
    await page.screenshot({ path: `${OUT}/touch_${DEV}_13_after_leave.png` });
    chk(top.save && top.save.why === 'leave', `pause -> 「나가기」 (rows ${lq?.ids?.join(' ')}): top scene now ${top.name}; save written ${JSON.stringify(top.save)}`);
    const o2 = await open(''); const after = o2; await rt(true); await page.waitForTimeout(1500); const later = await st(); await shot(`touch_${DEV}_14_continued`, false);
    if (later.hp < after.hp) info(`1.5 s after continuing the hero had already been hit (hp ${after.hp} -> ${later.hp}): enemies next to the saved spot act at once`);
    chk(o2.ready && after.area === before.area && Math.abs(after.x - before.x) < 12 && Math.abs(after.z - before.z) < 12 && after.obj === before.obj, `continue: ${after.area} (${after.x},${after.z}) hp ${after.hp}/${after.hpMax} objective "${after.obj}" — before leaving (${before.x},${before.z}) hp ${before.hp} "${before.obj}"`);
    R.counts = await ev(() => window.__iv.counts());
    // 7) what is left of the 2D game on the old pad: its top-right buttons
    await ev(() => window.__v2.scene.setUi(false)); await page.waitForTimeout(1200); await idleRT(10000);
    const old = await ev(async () => { const tp = (await import('/src/core/touchpad.js')).touchpad; let L = []; try { L = tp.buttons({ all: true }); } catch { L = tp.buttons(); } return L.map((b) => ({ id: b.id, x: Math.round(b.cx ?? b.x + b.w / 2), y: Math.round(b.cy ?? b.y + b.h / 2) })); });
    info('old pad buttons on screen: ' + old.map((b) => b.id).join(' '));
    const topName = () => ev(() => { const g = window.__game, t = g.scenes[g.scenes.length - 1]; return Object.keys(g.registry).find((k) => t instanceof g.registry[k]) ?? t?.constructor?.name ?? '?'; });
    R.oldTop = [];
    for (const id of ['auto', 'maptog', 'bag']) { const b = old.find((q) => q.id === id); if (!b) { R.oldTop.push({ id, shown: false }); continue; } const e0 = errs.length; await T.tap(b.x, b.y, 90); await page.waitForTimeout(900); const tn = await topName(), q = await st().catch(() => null); R.oldTop.push({ id, shown: true, top: tn, modal: q?.modal ?? null, errs: errs.length - e0 }); await page.screenshot({ path: `${OUT}/touch_${DEV}_15_old_${id}.png` }); if (tn !== 'v2g') { fail(`old pad: the 2D game's 「${id}」 button opened scene ${tn} over the 3D game`); await page.keyboard.press('Escape'); await page.waitForTimeout(700); } }
    info('2D top buttons on the old pad: ' + JSON.stringify(R.oldTop));
    await ev(() => localStorage.removeItem('bn.v2.ui'));
  }

  // ───────────────────────────── cross: a real long press on the bell button, there and back ─────────────────────────────
  if (PLAN === 'cross') {
    await clean(); const o = await open('&area=eshville_now&v2story=0'); chk(o.ready && !o.story, `eshville_now without the story opens (${o.ms} ms)`);
    const A = (await areaOf('eshville_now', {})).a, b = A.interact.find((q) => q.event === 'bell.ring');
    await ev(([x, z]) => { window.__iv.put(x, z + 120); window.__iv.fellNear(900); }, [b.x, b.z]); await ff(60); await rt(true); await page.waitForTimeout(600);
    for (const leg of ['there', 'back']) {
      const s0 = await st(), pad = await padOf(), ev0 = await ev(() => window.__iv.ev.length), snd0 = await ev(() => window.__ivOnce.snd.length), r0 = reqs.length, t0 = Date.now();
      await shot(`cross_${DEV}_${leg}_0_before`, false);
      if (!pad?.bell || pad.bell.disabled) { fail(`${leg}: bell button ${pad?.bell ? 'disabled' : 'missing'} next to the bell`); break; }
      await T.down(15, pad.bell.cx, pad.bell.cy); let held = 0, s = null; while (held < 9000) { await page.waitForTimeout(150); held += 150; s = await st(); if (s.xing || s.go) break; } const tStart = Date.now() - t0;
      await page.waitForTimeout(350); await shot(`cross_${DEV}_${leg}_1_veil`, false); await T.up(15);
      s = await waitReady((q) => q.ready && !q.xing && !q.go && q.area !== s0.area, 60000); const tArr = Date.now() - t0; await page.waitForTimeout(500); await shot(`cross_${DEV}_${leg}_2_arrived`, false); await page.waitForTimeout(1800); await shot(`cross_${DEV}_${leg}_3_settled`, false);
      const evs = await ev((n) => window.__iv.ev.slice(n), ev0), snd = await ev((n) => window.__ivOnce.snd.slice(n), snd0), e = await st(), bad = await ev(() => window.__iv.sane()), ins = await ev(() => window.__iv.inside());
      chk(!!s && e.area !== s0.area && e.era !== s0.era && !bad.length && !ins && e.onGround, `${leg}: long press ${tStart} ms -> crossing -> ${e.area} (${e.era}) at (${e.x},${e.z}) from (${s0.x},${s0.z}) in ${tArr} ms wall; events ${[...new Set(evs)].join(' ') || 'none'}; ${snd.length} sound sources started (buffers ${snd.filter((q) => q[1] > 0).length}, longest ${Math.max(0, ...snd.map((q) => q[1]))} s); audio files asked ${reqs.slice(r0).map((q) => q[1]).join(' ') || 'none'}${bad.length ? ' BAD ' + bad.join(',') : ''}${ins ? ' INSIDE ' + ins : ''}`);
      await ev(() => window.__iv.fellNear(900)); await page.waitForTimeout(800);
    }
    R.audioAll = [...new Set(reqs.map((q) => q[1]))];
  }

  // ───────────────────────────── ring: the whip ring of the graveyard by a real press on the skill button ─────────────────────────────
  if (PLAN === 'ring') {
    await clean(); const o = await open('&area=graveyard_now&v2story=0'); chk(o.ready, `graveyard_now opens (${o.ms} ms)`);
    const at = args.at ? String(args.at).split(',').map(Number) : [704, 1793];
    await ev(([x, z]) => { window.__iv.put(x, z); window.__iv.fellNear(1200); }, at); await ff(90);
    const q0 = await ev(() => { const v = window.__v2, h = v.scene.sim.hero, m = v.scene.hud.metrics(); return { hookId: h.hookId ?? null, act: h.act ?? null, onGround: h.onGround, x: Math.round(h.x), y: Math.round(h.y), z: Math.round(h.z), buttons: m.pad.buttons.map((b) => ({ id: b.id, cx: Math.round(b.cx), cy: Math.round(b.cy), d: Math.round(b.d), disabled: !!b.disabled, shown: b.shown ?? null, icon: b.icon ?? null })), vw: innerWidth, vh: innerHeight, caps: v.scene.state.pad ?? null, points: (v.scene.W.hookPoints ?? []).map((p) => [p.id, p.x, p.y, p.z]) }; });
    info('before the press: ' + JSON.stringify(q0));
    await rt(true); await page.waitForTimeout(500); await shot(`ring_${DEV}_0_under_the_ring`, false);
    const sk = q0.buttons.find((b) => b.id === 'skill'); let seen = [];
    if (!sk) fail('no skill button in the pad'); else {
      for (let k = 0; k < 4 && !seen.includes('hook'); k++) { const p = ev(async () => { const t = performance.now(), s = new Set(); while (performance.now() - t < 2500) { const h = window.__v2.scene.sim.hero; if (h.act) s.add(h.act); await new Promise((r) => setTimeout(r, 6)); } return [...s]; }); await page.waitForTimeout(80); await T.tap(sk.cx, sk.cy, 110, 14); seen = seen.concat(await p); if (k === 0) await shot(`ring_${DEV}_1_after_press`, false); }
      await page.waitForTimeout(1500); const e = await st(); await shot(`ring_${DEV}_2_end`, false);
      chk(seen.includes('hook') && e.y > 60, `trusted press on the skill button under the ring (${q0.hookId}): acts seen ${[...new Set(seen)].join(' ') || 'none'}; hero ends at (${e.x},${e.y},${e.z}) — pad button ${JSON.stringify(sk)}`);
    }
  }

  // ring2: the same spot with the area's enemies alive, pressed the way tools/v2/game_walk.mjs presses (pad handlers, 4 ticks down, every 12 ticks) after 180 ticks of the bot
  if (PLAN === 'ring2') {
    await clean(); const o = await open('&area=graveyard_now&v2story=0'); await botTouch();
    await ev(([x, z]) => { window.__iv.put(x, z); }, [704, 1793]);
    for (let round = 0; round < 6; round++) {
      const r = await ev(() => { const B = window.__bot, v = window.__v2, g = window.__game, I = window.__iv; B.setRoute([[704, 1796]]); B.touchRun(180, 45); const h = v.scene.sim.hero, sk = v.scene.hud.metrics().pad.buttons.find((b) => b.id === 'skill');
        const snap = () => ({ act: h.act ?? null, move: h.move?.id ?? null, guard: !!h.guard, hurtT: +(h.hurtT ?? 0).toFixed(2), onGround: !!h.onGround, hookId: h.hookId ?? null, x: Math.round(h.x), y: Math.round(h.y), z: Math.round(h.z), hp: Math.round(h.hp), stun: +(h.stun ?? 0).toFixed(2), roll: +(h.rollT ?? 0).toFixed(2), caps: JSON.stringify(v.scene.state.pad?.skill ?? null), awake: v.enemies.filter((e) => e.active).map((e) => e.kind + '@' + Math.round(Math.hypot(e.x - h.x, e.z - h.z))).join(' '), ts: !!B.ts, down: B.ts ? JSON.stringify(B.ts.down ?? B.ts.held ?? null) : null });
        const before = snap(); const fire = (type) => window.dispatchEvent(new PointerEvent(type, { pointerId: 14, pointerType: 'touch', isPrimary: false, clientX: sk.cx, clientY: sk.cy, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
        g._pageHidden = true; let thrown = false; const acts = new Set(), log = [];
        for (let i = 0; i < 150 && !thrown; i += 12) { if (h.hookId == null) { log.push('hookId null'); break; } fire('pointerdown'); for (let k = 0; k < 4; k++) g.tick(1 / 60); fire('pointerup'); for (let k = 0; k < 8; k++) { g.tick(1 / 60); if (h.act) acts.add(h.act); if (h.move?.id) acts.add('move:' + h.move.id); if (h.act === 'hook') thrown = true; } }
        for (let i = 0; i < 120 && (h.act === 'hook' || !h.onGround); i++) g.tick(1 / 60); for (let i = 0; i < 12; i++) g.tick(1 / 60); I.draw();
        return { before, thrown, acts: [...acts], log, after: snap() }; });
      info(`round ${round + 1}: thrown ${r.thrown}; acts ${r.acts.join(' ') || 'none'}; before ${JSON.stringify(r.before)}; after ${JSON.stringify(r.after)} ${r.log.join(' ')}`);
      if (round === 0) await shot(`ring2_${DEV}_round1`);
      if (r.thrown && r.after.y > 60) { ok(`the walk tool's own press threw the hook in round ${round + 1} with the area's enemies alive`); break; }
      if (round === 5) fail('the walk tool\'s press never threw the hook in 6 rounds with the enemies alive');
    }
  }

  // roll: why a trusted tap on the roll button with the stick held shows no roll in real time
  if (PLAN === 'roll') {
    await clean(); const o = await open('&area=eshville_now&v2story=0'); await ev(() => { window.__iv.fellNear(1500); });
    await ev(() => { const sc = window.__v2.scene, sim = sc.sim, up = sim.update, L = (window.__rl = { dash: [], ticks: 0, maxDash: 0, guard: 0 }); sim.update = function (dt, inp) { L.ticks++; if (inp.dash) L.dash.push([+inp.mx.toFixed(2), +inp.mz.toFixed(2), +(this.hero.rollCd).toFixed(2), +(this.hero.dashT).toFixed(2), this.hero.move?.id ?? null, +(this.hero.hurtT ?? 0).toFixed(2), !!sc.locked]); const r = up.call(this, dt, inp); if (this.hero.dashT > L.maxDash) L.maxDash = this.hero.dashT; if (this.hero.guard) L.guard++; return r; }; });
    const pad = await padOf(), vp = await ev(() => [innerWidth, innerHeight]), x0 = Math.round(vp[0] * 0.2), y0 = Math.round(vp[1] * 0.68);
    const reset = () => ev(() => { const L = window.__rl; L.dash = []; L.ticks = 0; L.maxDash = 0; L.guard = 0; const h = window.__v2.scene.sim.hero; h.rollCd = 0; });
    const read = () => ev(() => ({ ...window.__rl, x: Math.round(window.__v2.scene.sim.hero.x) }));
    await rt(true); await page.waitForTimeout(500);
    for (const [name, stickMs, holdMs, stick] of [['A stick 700 ms then a 120 ms tap', 700, 120, true], ['B stick 700 ms then a 500 ms hold', 700, 500, true], ['C stick 1500 ms then a 40 ms tap', 1500, 40, true], ['D no stick, 120 ms tap (guard)', 0, 120, false]]) {
      await reset(); const a = await read();
      if (stick) { await T.down(1, x0, y0); await page.waitForTimeout(30); for (let i = 1; i <= 4; i++) { await T.move(1, x0 + 13 * i, y0); await page.waitForTimeout(16); } await page.waitForTimeout(stickMs); }
      await T.down(13, pad.roll.cx, pad.roll.cy); await page.waitForTimeout(holdMs); await T.up(13); await page.waitForTimeout(900); if (stick) await T.up(1); await page.waitForTimeout(300);
      const b = await read();
      info(`${name}: rule ticks ${b.ticks}, ticks with a dash press ${b.dash.length} ${JSON.stringify(b.dash.slice(0, 3))}, longest dashT ${b.maxDash.toFixed(2)}, guard ticks ${b.guard}, hero x ${a.x} -> ${b.x}`);
      if (stick) chk(b.maxDash > 0, `${name}: rolled ${b.maxDash > 0}`); else chk(b.guard > 0, `${name}: guarded ${b.guard > 0}`);
    }
  }

  // oldpad: the fallback pad (v2ui=0) — are the whip skill and the bell there, and what do the 2D game's top buttons do
  if (PLAN === 'oldpad') {
    await clean(); const o = await open('&area=graveyard_now&v2story=0&v2ui=0'); chk(o.ready && o.hud === 'builtin', `graveyard_now on the old pad opens (hud ${o.hud})`);
    await ev(() => { window.__iv.put(704, 1793); window.__iv.fellNear(1500); }); await ff(60); await rt(true); await page.waitForTimeout(900);
    const L = async () => ev(async () => { const tp = (await import('/src/core/touchpad.js')).touchpad, g = window.__game, cv = document.getElementById('screen').getBoundingClientRect(); let occ = []; try { occ = tp.occupiedRects(); } catch { occ = []; } return { shown: tp.buttons().map((b) => ({ id: b.id, x: Math.round(b.cx ?? b.x + b.w / 2), y: Math.round(b.cy ?? b.y + b.h / 2) })), occ: occ.map((r) => ({ id: r.id ?? '?', x: Math.round(cv.x + (r.x + r.w / 2) * cv.width / g.viewW), y: Math.round(cv.y + (r.y + r.h / 2) * cv.height / g.viewH) })) }; });
    let B = await L(); info('old pad: buttons shown ' + B.shown.map((b) => b.id).join(' ') + ' | occupied rects ' + B.occ.map((b) => b.id).join(' '));
    await page.screenshot({ path: `${OUT}/oldpad_${DEV}_0_under_ring.png` });
    const see = (ms = 2600) => ev(async (m) => { const t = performance.now(), s = new Set(); while (performance.now() - t < m) { const h = window.__v2.scene.sim.hero; if (h.act) s.add(h.act); await new Promise((r) => setTimeout(r, 6)); } return [...s]; }, ms);
    const sk = B.shown.find((b) => b.id === 'skill1'), ul = B.shown.find((b) => b.id === 'ult');
    if (!sk) fail('old pad: no skill button (skill1) — the whip ring cannot be used'); else { const p = see(); await page.waitForTimeout(80); await T.tap(sk.x, sk.y, 140, 14); const a = await p; await page.waitForTimeout(1500); const e = await st(); chk(a.includes('hook') && e.y > 60, `old pad: a trusted press on skill1 under the ring -> acts ${a.join(' ') || 'none'}, hero at (${e.x},${e.y},${e.z})`); await page.screenshot({ path: `${OUT}/oldpad_${DEV}_1_hooked.png` }); }
    if (!ul) fail('old pad: no bell button (ult) — the bell cannot be rung'); else { const p = see(); await page.waitForTimeout(80); await T.tap(ul.x, ul.y, 120, 15); const a = await p; chk(a.includes('echo') || a.includes('ring'), `old pad: a trusted tap on ult -> acts ${a.join(' ') || 'none'}`); await page.waitForTimeout(2600); const p2 = see(4500); const p3 = ev(async () => { const g = window.__game, h = window.__v2.scene.sim.hero, t = performance.now(); let down = 0, n = 0, hold = 0, okN = 0; while (performance.now() - t < 4200) { n++; if (g.input.down('ult')) down++; hold = Math.max(hold, h.bellHoldT ?? 0); if (h.bellOk) okN++; await new Promise((r) => setTimeout(r, 8)); } return { samples: n, down, hold: +hold.toFixed(2), bellOk: okN, cd: +(h.bellCd ?? 0).toFixed(2) }; }); await page.waitForTimeout(600); await T.down(15, ul.x, ul.y); await page.waitForTimeout(2600); await T.up(15); const a2 = await p2, d3 = await p3; chk(a2.includes('ring'), `old pad: holding ult 2.6 s -> acts ${a2.join(' ') || 'none'} (long ring); input.down('ult') in ${d3.down}/${d3.samples} samples, longest hold seen by the rules ${d3.hold} s, bellOk in ${d3.bellOk} samples, cooldown left ${d3.cd}`); await page.screenshot({ path: `${OUT}/oldpad_${DEV}_2_bell.png` }); }
    const topName = () => ev(() => { const g = window.__game, t = g.scenes[g.scenes.length - 1]; return Object.keys(g.registry).find((k) => t instanceof g.registry[k]) ?? t?.constructor?.name ?? '?'; });
    for (const id of ['auto', 'maptog', 'bag']) { const b = B.occ.find((q) => q.id === id) ?? B.shown.find((q) => q.id === id); if (!b) { info(`2D button ${id}: not on screen`); continue; } const e0 = errs.length, h0 = await st(); await T.tap(b.x, b.y, 90); await page.waitForTimeout(1500); const tn = await topName(), q = await st().catch(() => null); const auto = await ev(() => { const g = window.__game; return { autoOn: !!(g.auto?.on ?? g.autoOn ?? g.input?.autoOn), src: JSON.stringify(g.input?.sources?.auto ?? {}) }; }).catch(() => null);
      await page.screenshot({ path: `${OUT}/oldpad_${DEV}_3_${id}.png` });
      (tn === 'v2g' && errs.length === e0 ? info : fail)(`2D button ${id} tapped at (${b.x},${b.y}): top scene ${tn}, modal ${q?.modal ?? null}, hero (${h0.x},${h0.z}) -> (${q?.x},${q?.z}) act ${q?.act ?? null} move ${q?.move ?? null}, auto ${JSON.stringify(auto)}, new errors ${errs.length - e0}`); if (tn !== 'v2g') { await page.keyboard.press('Escape'); await page.waitForTimeout(800); } }
  }

  // ───────────────────────────── kinds: every enemy kind of the real areas ─────────────────────────────
  if (PLAN === 'kinds') {
    const PL = [['eshville_now', ['skeleton_soldier', 'skeleton_mage']], ['eshville_past', ['plague_corpse']], ['graveyard_now', ['bat', 'gravekeeper_armor', 'grave_ghost']], ['ossuary_now', ['banshee_queen']]];
    await clean(); R.kinds = {};
    for (const [area, kinds] of PL) {
      const o = await open(`&area=${area}&v2story=0`); if (!o.ready) { fail(`${area} did not open: ${o.err}`); continue; }
      await botTouch();
      for (const kind of kinds) {
        const tg = await ev((k) => { const sim = window.__v2.scene.sim, I = window.__iv; const L = sim.enemies.filter((e) => e.kind === k && !e.dead && e.state !== 'dead'); if (!L.length) return null; const e = L[0]; let spot = null; for (const [dx, dz] of [[-90, 0], [90, 0], [0, -80], [0, 80], [-140, 0], [140, 0]]) { const gy = I.ground(e.x + dx, e.z + dz); if (gy != null && Math.abs(gy - (e.gy ?? e._gy ?? gy)) < 60) { spot = [e.x + dx, e.z + dz, gy]; break; } } if (!spot) spot = [e.x - 90, e.z, I.ground(e.x - 90, e.z)]; I.put(spot[0], spot[1], spot[2]); const h = sim.hero; h.hp = h.hpMax; I.tg = e; I.k = { hp0: e.hp, hero0: h.hp, clips: {}, tele: 0, drawn: 0, n: 0, hitAt: -1 }; return { id: e.id, hp: e.hp, x: Math.round(e.x), z: Math.round(e.z), y: Math.round(e.y), n: L.length }; }, kind);
        if (!tg) { fail(`${area}: no ${kind} placed`); continue; }
        let shotDone = false, s = null;
        for (let c = 0; c < 12; c++) {
          s = await ev(() => { const g = window.__game, B = window.__bot, v = window.__v2, I = window.__iv, e = I.tg, K = I.k, sim = v.scene.sim; g._pageHidden = true; let stop = false; for (let i = 0; i < 60 && !stop; i++) { if (v.ready && !v.scene.hud.modal && B.ts) B.touchStep(); g.tick(1 / 60); K.n++; const c2 = e._a3?.anim.cur?.name; if (c2) K.clips[c2] = (K.clips[c2] ?? 0) + 1; if ((e.tele ?? 0) > 0) K.tele++; if (e._a3?.vis) K.drawn++; if (K.hitAt < 0 && e.hp < K.hp0) { K.hitAt = K.n; stop = true; } } if (B.ts) B.touchEnd(); I.draw(); return { hp: e.hp, dead: !!e.dead || e.state === 'dead', hero: Math.round(sim.hero.hp), heroDead: !!sim.hero.dead, K, model: v.scene.cast ? (e._a3 ? true : false) : null, d: Math.round(Math.hypot(e.x - sim.hero.x, e.z - sim.hero.z)) }; });
          if (!shotDone && (s.K.hitAt >= 0 || c === 5)) { await shot(`kind_${DEV}_${kind}`); shotDone = true; }
          if (s.dead || s.heroDead) break;
        }
        const K = s.K; R.kinds[kind] = { area, ...K, hpEnd: s.hp, dead: s.dead, heroEnd: s.hero };
        chk(K.drawn > 0 && Object.keys(K.clips).length > 0, `${kind} in ${area}: drawn ${K.drawn}/${K.n} ticks, clips ${Object.keys(K.clips).join(' ')}; whip hit it ${K.hitAt >= 0 ? 'at tick ' + K.hitAt : 'NEVER in ' + K.n + ' ticks'} (hp ${K.hp0} -> ${s.hp}${s.dead ? ', fell' : ''}); it wound up attacks for ${K.tele} ticks, hero hp ${K.hero0} -> ${s.hero}${s.heroDead ? ' (hero fell)' : ''}`);
        if (K.hitAt < 0) info(`${kind}: the bot never landed a hit in ${K.n} ticks (distance at the end ${s.d} px)`);
        const bad = await ev(() => window.__iv.sane()); if (bad.length) fail(`${kind}: ${bad.join(', ')}`);
      }
    }
  }

  // ───────────────────────────── saves: broken data ─────────────────────────────
  if (PLAN === 'saves') {
    await clean(); let o = await open(''); await settle(3000); await ff(120);
    const good = await ev(() => { const sc = window.__v2.scene; sc.host.saveNow('leave'); return localStorage.getItem('bn.v2.save'); });
    chk(!!good && good.length > 50, `a real save was written (${good?.length} bytes): ${String(good).slice(0, 160)}…`);
    const G = JSON.parse(good), mut = (f) => { const c = JSON.parse(good); f(c); return JSON.stringify(c); };
    const CASES = [
      ['empty string', ''], ['one space', ' '], ['the word null', 'null'], ['an array', '[]'], ['an empty object', '{}'], ['a number', '7'], ['a string', '"x"'],
      ['truncated at one third', good.slice(0, Math.floor(good.length / 3))], ['truncated by one byte', good.slice(0, -1)],
      ['future version v 2', mut((c) => { c.v = 2; })], ['future version v 99 with unknown fields', mut((c) => { c.v = 99; c.zz = { a: 1 }; })], ['version as text "1"', mut((c) => { c.v = '1'; })],
      ['story null', mut((c) => { c.story = null; })], ['story flags an array', mut((c) => { c.story.flags = [1, 2]; })], ['story done a number', mut((c) => { c.story.done = 5; })],
      ['pos far outside (1e9)', mut((c) => { c.pos = { x: 1e9, z: -1e9, y: 5e6, face: [0, 0] }; })], ['pos text', mut((c) => { c.pos = { x: 'a', z: null, y: {}, face: 'q' }; })], ['pos inside a house wall', mut((c) => { c.pos = { x: 1800, z: 520, y: 0, face: [1, 0] }; })],
      ['hp -5', mut((c) => { c.hp = -5; })], ['hp 1e9', mut((c) => { c.hp = 1e9; })], ['hp text', mut((c) => { c.hp = 'abc'; })], ['reso text / nights a number', mut((c) => { c.reso = 'x'; c.nights = 5; })],
      ['nights with wrong shapes', mut((c) => { c.nights = { eshville_now: { dead: 'x', done: 'y' }, zz: null, eshville_past: [] }; })], ['area of the test route', mut((c) => { c.area = 'slice0'; c.story.area = 'slice0'; })], ['area __proto__', mut((c) => { c.area = '__proto__'; c.story.area = '__proto__'; })],
      ['story area graveyard, save area eshville', mut((c) => { c.story.area = 'graveyard_now'; c.story.spawn = 'zzz'; })],
    ];
    R.saves = []; const ONLYC = args.cases ? String(args.cases).split('|') : null;
    for (const [name, data] of CASES) {
      if (ONLYC && !ONLYC.some((q) => name.includes(q))) continue;
      const e0 = errs.length; await page.goto(base + '/robots.txt'); await ev((d) => localStorage.setItem('bn.v2.save', d), data);
      o = await open('', { wait: 60000 }); let line = `${name}: `;
      if (!o.ready) { fail(line + 'did not open: ' + o.err); R.saves.push({ name, ready: false }); continue; }
      const s1 = await settle(900), t1 = s1.time; const s2 = await ff(90), bad = await ev(() => window.__iv.sane()), ins = await ev(() => window.__iv.inside());
      const s3 = await ff(600, false, 0);   // ten more seconds: a hero put somewhere he cannot stand falls, is hurt by the pit rule, or dies
      if (s3.y < -40 || s3.deaths > 0 || s2.y < -40) bad.push(`hero not on a floor after loading (y ${s2.y} -> ${s3.y}, falls ${s3.deaths}, hp ${s2.hp} -> ${s3.hp})`);
      const good2 = s2.ready && !s2.err && s2.hp > 0 && s2.hp <= s2.hpMax && s2.hpMax > 0 && s2.time > t1 && !bad.length && !ins && errs.length === e0 && Object.keys(AREAS).includes(s2.area);
      line += `${s2.area} (${s2.x},${s2.y},${s2.z}) hp ${s2.hp}/${s2.hpMax}, rules run ${s2.time > t1}, objective "${s2.obj}", new page errors ${errs.length - e0}${bad.length ? ', BAD ' + bad.join(',') : ''}${ins ? ', INSIDE A SOLID ' + ins : ''}`;
      R.saves.push({ name, area: s2.area, x: s2.x, z: s2.z, hp: s2.hp, hpMax: s2.hpMax, bad, ins, errs: errs.slice(e0, e0 + 3) });
      chk(good2, line);
    }
  }

  // ───────────────────────────── ctx: the GL context is lost ─────────────────────────────
  if (PLAN === 'ctx') {
    await clean();
    const lum = async () => ev(() => { const g = window.__game, v = window.__v2; window.__iv.draw(); const c = v.scene.glr?.canvas ?? v.scene.glr?.gl?.canvas; if (!c) return -1; const t = document.createElement('canvas'); t.width = 64; t.height = 48; const x = t.getContext('2d'); try { x.drawImage(c, 0, 0, 64, 48); } catch { return -2; } const d = x.getImageData(0, 0, 64, 48).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return Math.round(s / (d.length / 4)); });
    for (const q of ['&area=graveyard_now&v2story=0', '']) {
      const o = await open(q); if (!o.ready) { fail('ctx: did not open ' + q); continue; } await settle(2400); await ff(90);
      const g0 = await ev(() => window.__iv.gl()), l0 = await lum(); await shot(`ctx_${DEV}_${o.area}_0_before`);
      const lost = await ev(() => window.__v2.loseContext()); await rt(true); await page.waitForTimeout(2500); await rt(false); await ff(40);
      const g1 = await ev(() => window.__iv.gl()), l1 = await lum(), s1 = await st(); await shot(`ctx_${DEV}_${o.area}_1_restored`);
      const moved = await (async () => { await botTouch(); await ev(() => { const h = window.__v2.scene.sim.hero; window.__bot.setRoute([[h.x + 200, h.z], [h.x + 400, h.z]]); }); const a = await st(); const b2 = await ff(60, true); return Math.hypot(b2.x - a.x, b2.z - a.z); })();
      chk(lost && s1.ready && !s1.err && g1.draws > 0 && g1.tris > 0.5 * g0.tris && Math.abs(l1 - l0) < 0.35 * Math.max(l0, 30), `${o.area}: context lost in play -> restored (draw calls ${g0.draws} -> ${g1.draws}, triangles ${g0.tris} -> ${g1.tris}, textures ${g0.texMB} -> ${g1.texMB} MB, picture brightness ${l0} -> ${l1}, hero then moved ${Math.round(moved)} px)`);
      // during a crossing / a journey
      const twin = await ev(() => window.__v2.scene.area.twin ?? null);
      if (twin) { const c = await ev(() => window.__v2.scene.cross(null)); await ff(30, false, 10); const l2 = await ev(() => window.__v2.loseContext()); await rt(true); const s2 = await waitReady((q2) => q2.ready && !q2.xing && !q2.go, 60000); await page.waitForTimeout(1200); await rt(false); await ff(60); const g2 = await ev(() => window.__iv.gl()), lm = await lum(), e2 = await st(), bad = await ev(() => window.__iv.sane()); await shot(`ctx_${DEV}_${o.area}_2_lost_during_crossing`);
        chk(c && l2 && e2.ready && !e2.err && !e2.xing && !e2.locked && g2.draws > 0 && lm > 8 && !bad.length, `${o.area}: context lost 0.5 s into a crossing -> ends in ${e2.area} (ready ${e2.ready}, crossing over ${!e2.xing}, input free ${!e2.locked}, veil ${e2.fade}, draw calls ${g2.draws}, brightness ${lm})${bad.length ? ' BAD ' + bad.join(',') : ''}`); }
      const ex = await ev(() => { const sc = window.__v2.scene; const x = (sc.area.exits ?? []).find((q2) => !q2.locked); return x ? x.to : null; });
      if (ex) { const c = await ev((to) => window.__v2.scene.travelTo(to, null), ex); await ff(12, false, 4); const l3 = await ev(() => window.__v2.loseContext()); await rt(true); const s3 = await waitReady((q2) => q2.ready && !q2.go && q2.area === ex, 60000); await page.waitForTimeout(1200); await rt(false); await ff(60); const g3 = await ev(() => window.__iv.gl()), lm = await lum(), e3 = await st(); await shot(`ctx_${DEV}_${o.area}_3_lost_during_journey`);
        chk(c && l3 && e3.ready && e3.area === ex && g3.draws > 0 && lm > 8 && !e3.locked, `${o.area}: context lost at the start of a journey to ${ex} -> ${e3.area} ready ${e3.ready}, draw calls ${g3.draws}, brightness ${lm}, input free ${!e3.locked}`); }
    }
  }

  // ───────────────────────────── resize: rotate and resize in a fight and in a crossing ─────────────────────────────
  if (PLAN === 'resize') {
    await clean(); const o = await open('&area=eshville_now&v2story=0'); const vp0 = contextOptions(DEV).viewport; await botTouch();
    const A = (await areaOf('eshville_now', {})).a, e0 = A.enemies.find((q) => q.kind === 'skeleton_soldier') ?? A.enemies[0];
    await ev(([x, z]) => window.__iv.put(x - 80, z), [e0.x, e0.z]); await ff(120, true);
    const fit = () => ev(() => { const v = window.__v2, s = v.stats, m = v.scene.hud.metrics?.(), W = innerWidth, H = innerHeight, out = []; for (const b of m?.pad?.buttons ?? []) if (b.cx - b.d / 2 < -2 || b.cx + b.d / 2 > W + 2 || b.cy - b.d / 2 < -2 || b.cy + b.d / 2 > H + 2) out.push(b.id); const c = v.scene.glr?.canvas ?? v.scene.glr?.gl?.canvas, r = c?.getBoundingClientRect(), g = window.__game.canvasRect; return { vw: W, vh: H, res: [s.res.w, s.res.h, s.res.dpr, s.res.scale], glCss: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null, hudCss: g ? [Math.round(g.x), Math.round(g.y), Math.round(g.w), Math.round(g.h)] : null, padOut: out, n: m?.pad?.buttons?.length ?? 0, view: [v.scene.state.viewW, v.scene.state.viewH] }; });
    const SIZES = [['rotated', vp0.height, vp0.width], ['small', 520, 300], ['wide', 1280, 420], ['back', vp0.width, vp0.height]];
    for (const [name, w, h] of SIZES) {
      const e1 = errs.length; await page.setViewportSize({ width: w, height: h }); await rt(true); await page.waitForTimeout(900); await rt(false); await botTouch();
      const a = await st(); const b2 = await ff(180, true); const f = await fit(), bad = await ev(() => window.__iv.sane()); await shot(`resize_${DEV}_fight_${name}`);
      const same = f.glCss && f.hudCss && Math.abs(f.glCss[2] - f.hudCss[2]) <= 2 && Math.abs(f.glCss[3] - f.hudCss[3]) <= 2 && Math.abs(f.glCss[0] - f.hudCss[0]) <= 2;
      chk(b2.ready && !bad.length && errs.length === e1 && !f.padOut.length && f.n > 0 && same && f.res[0] > 0, `fight, ${name} ${w}x${h}: 3D canvas ${f.glCss?.join(',')} vs HUD canvas ${f.hudCss?.join(',')} (CSS), render ${f.res[0]}x${f.res[1]}, logical view ${f.view.join('x')}, pad buttons ${f.n} (outside the screen: ${f.padOut.join(' ') || 'none'}), hero moved ${Math.round(Math.hypot(b2.x - a.x, b2.z - a.z))} px in 3 s, new errors ${errs.length - e1}${bad.length ? ' BAD ' + bad.join(',') : ''}`);
    }
    const b = A.interact.find((q) => q.event === 'bell.ring'); await ev(([x, z]) => { window.__iv.put(x, z + 120); window.__iv.fellNear(900); }, [b.x, b.z]); await ff(40);
    const c = await ev(() => window.__v2.scene.cross(null)); await ff(25, false, 5); await page.setViewportSize({ width: vp0.height, height: vp0.width }); await rt(true); await page.waitForTimeout(700); await page.setViewportSize({ width: 600, height: 340 }); await page.waitForTimeout(700); await page.setViewportSize({ width: vp0.width, height: vp0.height });
    const s2 = await waitReady((q) => q.ready && !q.xing && !q.go, 60000); await page.waitForTimeout(1500); await rt(false); await ff(60); const f2 = await fit(), e2 = await st(), bad2 = await ev(() => window.__iv.sane()); await shot(`resize_${DEV}_after_crossing`);
    chk(c && e2.area === 'eshville_past' && !e2.locked && !bad2.length && !f2.padOut.length, `rotate + shrink + restore during a crossing: arrived in ${e2.area}, input free ${!e2.locked}, veil ${e2.fade}, render ${f2.res[0]}x${f2.res[1]}, 3D canvas ${f2.glCss?.join(',')} vs HUD ${f2.hudCss?.join(',')}${bad2.length ? ' BAD ' + bad2.join(',') : ''}`);
  }

  // ───────────────────────────── leaveload: leave while loading, re-enter ─────────────────────────────
  if (PLAN === 'leaveload') {
    await clean(); const o = await open(''); await settle(3000); await ff(60); const m0 = await ev(() => window.__iv.mem()); R.mem = [m0];
    const scName = () => ev(() => { const g = window.__game, t = g.scenes[g.scenes.length - 1]; return Object.keys(g.registry).find((k) => t instanceof g.registry[k]) ?? '?'; });
    // a) leave in the middle of a journey (the next area is being built)
    await rt(true); const tr = await ev(() => window.__v2.scene.travelTo('graveyard_now', 'from_eshville')); await page.waitForTimeout(450); const mid = await st(); await ev(() => window.__v2.scene._leave()); await page.waitForTimeout(3000);
    const a1 = await scName(), cv1 = await ev(() => document.querySelectorAll('canvas').length), e1 = errs.length;
    chk(tr && e1 === 0, `left while travelling to graveyard_now (ready ${mid.ready}, journey ${mid.go}, veil ${mid.fade}): top scene ${a1}, canvases in the page ${cv1}, page errors ${e1}`);
    // b) enter and leave before the first area is ready, 3 times
    for (let i = 0; i < 3; i++) { await ev(() => window.__game.go('v2g', {}, { fade: false })); await page.waitForTimeout(120 + i * 250); const r = await ev(() => ({ ready: !!window.__v2?.ready, id: window.__v2?.id })); await ev(() => { const g = window.__game, t = g.scenes[g.scenes.length - 1]; if (t._leave) t._leave(); else g.go(g.registry.v2pick ? 'v2pick' : 'title', {}, { fade: false }); }); await page.waitForTimeout(1500); info(`enter + leave after ${120 + i * 250} ms (ready then: ${r.ready}): top scene ${await scName()}, canvases ${await ev(() => document.querySelectorAll('canvas').length)}, errors ${errs.length}`); }
    // c) 5 full re-entries: heap, canvases, GPU bytes
    for (let i = 0; i < 5; i++) { await ev(() => window.__game.go('v2g', {}, { fade: false })); const s = await waitReady((q) => q.ready, 60000).catch(() => null); await page.waitForFunction(() => window.__v2?.ready, null, { timeout: 60000 }).catch(() => {}); await ev(installBot, [[0, 0]]); await ev(installIv); await settle(1200); await ff(60); const m = await ev(() => window.__iv.mem()); R.mem.push(m); info(`re-entry ${i + 1}: heap ${m.heap} KB, canvases ${m.canvases}/${m.dom}, textures ${m.tex}, buffers ${m.buf}, area ${m.area}`); await ev(() => window.__v2.scene._leave()); await page.waitForTimeout(1200); }
    const H = R.mem.slice(1).map((m) => m.heap), D = R.mem.slice(1).map((m) => m.dom), X = R.mem.slice(1).map((m) => m.tex);
    chk(errs.length === 0 && new Set(D.slice(1)).size === 1 && new Set(X.slice(1)).size === 1, `5 re-entries: heap KB ${H.join(' ')} (first entry ${m0.heap}; growth per re-entry over the last four ${((H[4] - H[0]) / 4 / 1024).toFixed(2)} MB), canvases ${D.join(' ')}, texture bytes ${[...new Set(X)].join('/')}, page errors ${errs.length}`);
  }

  // ───────────────────────────── combos: interface x stored performance settings ─────────────────────────────
  if (PLAN === 'combos') {
    const PERF = [['none', null], ['low', '{"tier":"low"}'], ['mid', '{"tier":"mid"}'], ['high', '{"tier":"high"}'], ['low + resK 0.5 + cap 30', '{"tier":"low","resK":0.5,"cap":30}'], ['absurd numbers', '{"tier":"zzz","resK":-3,"cap":0,"tex":7,"post":"x","aa":"no"}'], ['resK 99', '{"tier":"high","resK":99}'], ['not JSON', '{tier:'], ['an array', '[1,2]'], ['the word null', 'null']];
    const UI = [['v2ui=1', '&v2ui=1', null], ['v2ui=0', '&v2ui=0', null], ['stored 0', '', '0'], ['stored 1', '', '1'], ['stored junk', '', 'zz']];
    R.combos = []; const vp = contextOptions(DEV).viewport, dpr = contextOptions(DEV).deviceScaleFactor;
    const save = RES; let n = 0, bad = 0;
    for (const [pn, pv] of PERF) for (const [un, uq, us] of UI) {
      if (n++ % 2 === 1 && pn !== 'none' && pn !== 'absurd numbers' && pn !== 'not JSON') continue;   // every other combination of the plain tiers (time), all of the broken ones
      const set = {}; if (pv !== null) set['bn.v2.perf'] = pv; if (us !== null) set['bn.v2.ui'] = us; await clean(set); const e0 = errs.length;
      const t0 = Date.now(); await page.goto(`${base}/index.html?scene=v2g&v2auto=0&area=slice0${uq}`); await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 60000 }).catch(() => errs.push('ready timeout'));
      await page.waitForTimeout(700);
      const r = await ev(() => { const v = window.__v2; if (!v?.ready) return { ready: false, err: String(v?.error ?? '') }; const s = v.stats, g = window.__game; g._pageHidden = true; const t = v.scene.sim.time; for (let i = 0; i < 30; i++) g.tick(1 / 60); g.alpha = 1; g.render(); const s2 = v.stats; return { ready: true, hud: s2.hud, res: s2.res, draws: s2.gl.draws, tris: s2.gl.tris, ran: v.scene.sim.time > t, v2pad: !!document.getElementById('v2pad'), perfSaved: s2.perfSaved ?? null, resK: s2.resK }; });
      const wantHud = uq === '&v2ui=0' || us === '0' ? 'builtin' : 'ui';
      const px = r.ready ? r.res.w * r.res.h : 0, okk = r.ready && r.hud === wantHud && r.ran && r.draws > 0 && px > 20000 && px <= vp.width * vp.height * dpr * dpr * 1.02 && Number.isFinite(r.res.scale ?? 1) && errs.length === e0;
      if (!okk) bad++;
      R.combos.push({ perf: pn, ui: un, ...r });
      (okk ? ok : fail)(`perf ${pn} · ${un}: ${r.ready ? `hud ${r.hud} (wanted ${wantHud}), render ${r.res.w}x${r.res.h} (tier ${r.res.tier}, aa ${r.res.aa}, scale ${r.res.scale}, resK ${r.resK}), draw calls ${r.draws}, rules run ${r.ran}` : 'NOT READY ' + r.err}, new errors ${errs.length - e0}, ${Date.now() - t0} ms`);
    }
    info(`${R.combos.length} combinations opened, ${bad} bad`);
  }

  // ───────────────────────────── cross50: fifty crossings where it should be hard ─────────────────────────────
  if (PLAN === 'cross50') {
    await clean(); const o = await open('&area=eshville_now&v2story=0'); await settle(600); await ff(60); await botTouch();   // story off: a hero put at 50 different spots would walk into story triggers, and a crossing is (rightly) refused while their dialogues are open
    const spotsOf = async (id) => { const { a, W } = await areaOf(id, {}), sp = a.spawns.default, g = reachGrid(W, sp.x, sp.z, 26), out = [];
      for (const x of a.exits) if (x.locked) out.push(['locked exit ' + x.id, (x.x0 + x.x1) / 2, (x.z0 + x.z1) / 2]);   // an open exit starts a journey as soon as the hero stands in it: only its edge is tried (next line)
      for (const x of a.exits) { const p = g.near((x.x0 + x.x1) / 2, (x.z0 + x.z1) / 2, 160); if (p) out.push(['next to exit ' + x.id, p[0], p[1]]); }
      const steps = W.boxes.filter((q) => q.walk && q.y1 > 8 && q.y1 < 200 && (q.x1 - q.x0) < 400).slice(0, 40); for (let i = 0; i < steps.length; i += Math.max(1, Math.floor(steps.length / 6))) { const q = steps[i]; out.push([`step y ${Math.round(q.y1)}`, (q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, q.y1]); }
      let B = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 }; for (const q of W.boxes) if (q.walk) { B.x0 = Math.min(B.x0, q.x0); B.x1 = Math.max(B.x1, q.x1); B.z0 = Math.min(B.z0, q.z0); B.z1 = Math.max(B.z1, q.z1); }
      for (const [nx, x, z] of [['edge west', B.x0 + 6, (B.z0 + B.z1) / 2], ['edge east', B.x1 - 6, (B.z0 + B.z1) / 2], ['edge near', (B.x0 + B.x1) / 2, B.z0 + 6], ['edge far', (B.x0 + B.x1) / 2, B.z1 - 6], ['corner', B.x0 + 8, B.z0 + 8], ['corner far', B.x1 - 8, B.z1 - 8]]) { const p = g.near(x, z, 400); if (p) out.push([nx, p[0], p[1]]); }
      for (const q of a.interact.filter((q2) => q2.event === 'bell.ring')) out.push(['bell', q.x, q.z + 50]);
      for (const q of a.actors.slice(0, 3)) out.push(['on person ' + q.id, q.x, q.z]);
      return out.filter(([, x, z]) => !a.exits.some((e) => !e.locked && x > e.x0 - 60 && x < e.x1 + 60 && z > e.z0 - 60 && z < e.z1 + 60)); };   // not inside (or right at) an open exit: that starts a journey
    const rows = []; let n = 0, badN = 0, refused = 0; const T0 = Date.now();
    const run = async (id, count) => { const S1 = await spotsOf(id), tw = (await areaOf(id, {})).a.twin, S2 = tw ? await spotsOf(tw) : S1;
      for (let i = 0; i < count; i++) { const cur = (await st()).area, L = cur === id ? S1 : S2, sp = L[Math.floor(i / 2) % L.length];
        const at = await ev(([x, z, y]) => window.__iv.put(x, z, y ?? null), [sp[1], sp[2], sp[3] ?? null]); await ff(8, false, 0);
        const t0 = Date.now(), c = await ev(() => window.__v2.scene.cross(null)); if (!c) { refused++; const q = await st(); if (refused <= 4) fail(`crossing ${n + 1} at ${cur} ${sp[0]} (${at}): cross() refused — modal ${q.modal}, busy ${q.busy}, journey ${q.go}, crossing ${q.xing}, ready ${q.ready}, dead ${q.dead}`); n++; continue; }
        let s = null; for (let k = 0; k < 400; k++) { s = await ff(30, false, 0); if (s.ready && !s.xing && !s.go) break; if (!s.ready) await page.waitForTimeout(120); } const ms = Date.now() - t0; await ff(100, false, 0);
        const bad = await ev(() => window.__iv.sane()), ins = await ev(() => window.__iv.inside()), e = await st();
        // can the hero walk away?
        let best = 0; for (const [dx, dz] of [[-1, 0.15], [0, -1], [1, 0.15], [0, 1]]) { await ev(([ux, uz]) => { const h = window.__v2.scene.sim.hero; window.__bot.setRoute([[h.x + ux * 200, h.z + uz * 200], [h.x + ux * 400, h.z + uz * 400]]); }, [dx, dz]); const a0 = await st(), b0 = await ff(45, true, 0); best = Math.max(best, Math.hypot(b0.x - a0.x, b0.z - a0.z)); if (best > 20) break; }
        const stayed = e.area === cur, good = !bad.length && !ins && e.onGround && !e.locked && !e.xing && e.fade < 0.06 && best > 20 && !e.dead;
        const m = await ev(() => window.__iv.mem()); rows.push({ n: n + 1, from: cur, spot: sp[0], at, to: e.area, stayed, ms, moved: Math.round(best), heap: m.heap, tex: m.tex, buf: m.buf, dom: m.dom, hp: e.hp }); n++;
        if (!good) { badN++; fail(`crossing ${n} from ${cur} at ${sp[0]} (${at}) -> ${e.area} (${e.x},${e.y},${e.z}): on the ground ${e.onGround}, inside a solid ${ins ? JSON.stringify(ins) : 'no'}, input free ${!e.locked}, veil ${e.fade}, walks away ${Math.round(best)} px${bad.length ? ', BAD ' + bad.join(',') : ''}`); await shot(`cross50_${DEV}_bad_${n}`); }
        else if (stayed) info(`crossing ${n} from ${cur} at ${sp[0]} (${at}): refused cleanly (no floor near that spot in the other night) — hero stays, moves ${Math.round(best)} px`);
        if (n % 10 === 0) console.log(`       ${n} crossings: last ${cur} -> ${e.area} ${ms} ms, heap ${m.heap} KB, tex ${m.tex}, buf ${m.buf}, canvases ${m.dom}`);
      } };
    const LEGS = args.legs ? String(args.legs).split(',') : ['eshville', 'graveyard', 'ossuary'];
    if (LEGS.includes('eshville')) await run('eshville_now', 38);
    await ev(() => window.__v2.scene.travelTo('graveyard_now', 'from_eshville')); let s = null; for (let k = 0; k < 300; k++) { s = await ff(30, false, 0); if (s.ready && !s.go && s.area === 'graveyard_now' && s.fade <= 0.02) break; if (!s.ready) await page.waitForTimeout(150); } await settle(600); chk(s.area === 'graveyard_now', 'journey to graveyard_now for the next crossings');
    if (LEGS.includes('graveyard')) await run('graveyard_now', 6);
    await ev(() => window.__v2.scene.travelTo('ossuary_now', 'entry')); for (let k = 0; k < 300; k++) { s = await ff(30, false, 0); if (s.ready && !s.go && s.area === 'ossuary_now' && s.fade <= 0.02) break; if (!s.ready) await page.waitForTimeout(150); } await settle(600); chk(s.area === 'ossuary_now', 'journey to ossuary_now for the next crossings');
    if (LEGS.includes('ossuary')) await run('ossuary_now', 6);
    R.rows = rows;
    const E = rows.filter((r) => r.from.startsWith('eshville')), msA = rows.map((r) => r.ms), heap = E.map((r) => r.heap);
    const h10 = mean(heap.slice(6, 12)), h30 = mean(heap.slice(26, 32)), stayed = rows.filter((r) => r.stayed).length;
    chk(n >= 12 && badN === 0 && refused === 0, `${n} crossings (legs ${LEGS.join(' ')}) in ${((Date.now() - T0) / 1000).toFixed(0)} s wall: ${badN} left the hero in a bad state, ${refused} refused by cross(), ${stayed} ended on the same side (no floor near the spot)`);
    info(`crossing time (veil up to playable, headless software renderer at res ${RES}): median ${msA.slice().sort((a, b) => a - b)[Math.floor(msA.length / 2)]} ms, max ${Math.max(...msA)} ms`);
    info(`heap KB after each Eshville crossing: ${heap.join(' ')}`);
    info(`heap trend: mean of crossings 7-12 ${Math.round(h10)} KB, of 27-32 ${Math.round(h30)} KB = ${((h30 - h10) / 20).toFixed(0)} KB per crossing; after 30: ${heap[29]} KB; texture bytes seen ${[...new Set(E.map((r) => r.tex))].join('/')}, buffer bytes ${[...new Set(E.map((r) => r.buf))].join('/')}, canvases ${[...new Set(rows.map((r) => r.dom))].join('/')}`);
  }

  // ───────────────────────────── fuzz: random input in each area ─────────────────────────────
  if (PLAN === 'fuzz') {
    const TICKS = Number(args.ticks ?? 12000), LIST = args.areas ? String(args.areas).split(',') : ['eshville_now', 'eshville_past', 'graveyard_now', 'graveyard_past', 'belltower_now', 'ossuary_now', 'ossuary_past'];
    await clean(); R.fuzz = [];
    for (const id of LIST) {
      const e0 = errs.length, o = await open(`&area=${id}&v2story=0`, { bot: false }); if (!o.ready) { fail(`${id} did not open: ${o.err}`); continue; }
      const t0 = Date.now();
      await ev((seed) => { const g = window.__game, I = window.__iv; let s = seed >>> 0; I.rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; I.fz = { n: 0, cur: {}, bad: null, outside: 0, minY: 1e9, deaths: 0, stuck: 0, maxStuck: 0, lx: 0, lz: 0, moves: 0, thrown: null, crossed: 0, hold: 0, travels: 0, areas: {}, modal: 0, frozen: 0, lt: -1 }; g.input.setAutoSource(() => I.fz.cur); }, 1234567 + id.length * 977);
      let done = 0, r = null;
      while (done < TICKS) {
        r = await ev((n) => { const g = window.__game, v = window.__v2, I = window.__iv, F = I.fz, K = ['left', 'right', 'up', 'down']; g._pageHidden = true;
          try { for (let i = 0; i < n; i++) {
            if (F.n % 9 === 0) { const a = {}; const m = Math.floor(I.rnd() * 16); if (m & 1) a.left = true; if (m & 2) a.right = true; if (m & 4) a.up = true; if (m & 8) a.down = true; const q = I.rnd(); if (q < 0.3) a.attack = true; else if (q < 0.42) a.jump = true; else if (q < 0.54) a.dash = true; else if (q < 0.6) a.skill1 = true; else if (q < 0.66) a.ult = true; else if (q < 0.69) a.guard = true; else if (q < 0.7) a.confirm = true; if (F.hold > 0) { a.ult = true; F.hold--; } else if (I.rnd() < 0.004) F.hold = 14; F.cur = a; }
            F.n++; g.tick(1 / 60); if (F.n % 120 === 0) I.draw();
            const sc = v.scene; if (!v.ready || !sc.sim) { F.lt = -1; continue; }
            if (sc.hud.modal) { F.modal++; if (F.modal % 30 === 0) { try { sc.hud.closeModal?.(); } catch { /* ui */ } if (sc.hud.modal === 'pause') g.input.setAutoSource(() => ({ pause: F.n % 4 < 2 })); } continue; } else if (F.modal) { F.modal = 0; g.input.setAutoSource(() => F.cur); }
            const h = sc.sim.hero; F.areas[v.area] = (F.areas[v.area] ?? 0) + 1;
            if (sc.sim.time === F.lt && !sc._go && !sc.xing) F.frozen++; F.lt = sc.sim.time;
            if (F.n % 15 === 0) { const b = I.sane(); if (b.length && !F.bad) F.bad = { at: F.n, area: v.area, b: b.slice(0, 4), hero: [Math.round(h.x), Math.round(h.y), Math.round(h.z)] }; if (b.some((q) => q.includes('outside') || q.includes('under'))) F.outside += 15; }
            if (h.y < F.minY) F.minY = h.y;
            if (F.n % 60 === 0) { const d = Math.hypot(h.x - F.lx, h.z - F.lz); if (d < 4 && !h.dead && !sc.locked) F.stuck += 60; else { F.maxStuck = Math.max(F.maxStuck, F.stuck); F.stuck = 0; F.moves++; } F.lx = h.x; F.lz = h.z; }
            F.deaths = sc.sim.deaths ?? 0;
          } } catch (e) { F.thrown = String(e?.stack ?? e).slice(0, 400); }
          F.maxStuck = Math.max(F.maxStuck, F.stuck); const sc = v.scene, h = sc.sim?.hero; return { ...F, cur: undefined, area: v.area, ready: !!v.ready, hero: h ? [Math.round(h.x), Math.round(h.y), Math.round(h.z)] : null, hp: h ? Math.round(h.hp) : null, locked: !!sc.locked, modalNow: sc.hud?.modal ?? null }; }, Math.min(1500, TICKS - done));
        done += 1500; if (r.thrown) break; if (!r.ready) await page.waitForTimeout(300);
      }
      await shot(`fuzz_${DEV}_${id}`);
      const okk = !r.thrown && !r.bad && r.outside === 0 && r.maxStuck < 1800 && errs.length === e0 && r.frozen < TICKS * 0.5;
      R.fuzz.push({ id, ...r, errs: errs.slice(e0, e0 + 4), wall: Date.now() - t0 });
      (okk ? ok : fail)(`fuzz ${id}: ${r.n} ticks (${(r.n / 60 / 60).toFixed(1)} min of play) in ${((Date.now() - t0) / 1000).toFixed(0)} s; areas visited ${Object.entries(r.areas).map(([k, v2]) => k + ' ' + v2).join(', ')}; lowest y ${Math.round(r.minY)}, outside the map ${r.outside} ticks, falls ${r.deaths}, longest time without moving 4 px ${r.maxStuck} ticks, ticks with the rules standing still ${r.frozen}, ends at ${r.hero} hp ${r.hp}${r.locked ? ' INPUT LOCKED' : ''}${r.modalNow ? ' modal ' + r.modalNow : ''}${r.bad ? ' BAD ' + JSON.stringify(r.bad) : ''}${r.thrown ? ' THROWN ' + r.thrown : ''}; new page errors ${errs.length - e0}${errs.length > e0 ? ': ' + errs.slice(e0, e0 + 2).join(' | ') : ''}`);
    }
  }
} catch (e) { fail('tool error: ' + String(e?.stack ?? e).slice(0, 700)); }
R.errs = errs.slice(0, 30); R.fails = fails; R.notes = notes;
fs.writeFileSync(`${OUT}/iv_${PLAN}_${DEV}.json`, JSON.stringify(R, null, 1));
console.log(`\npage errors ${errs.length}${errs.length ? ': ' + errs.slice(0, 6).join(' | ').slice(0, 900) : ''}`);
await browser.close(); srv.close?.();
if (errs.length && !fails.some((f) => f.startsWith('page errors'))) fails.push('page errors ' + errs.length);
console.log(fails.length ? `FAIL ${fails.length}` : 'ALL OK');
process.exit(fails.length ? 1 : 0);
