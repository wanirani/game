// SCREENS-VERIFY (2026-11-19): an adversarial pass over the screens lane's work (docs/v2/UI_API.md 10) - what its own check (screens_check.mjs) does not press.
//   node tools/v2/screens_verify.mjs --out <dir> [--devices fold_open,phone2] [--only stills,break,choice,queen,reload,ending,oldpad,cost] [--saves <bot saves>]
// stills   the book and the bag at each state of the first piece (a fresh save, the first crossing, the key left / found, the stones, the graves, the knells, the ending),
//          every row's text printed once, the list dragged past both ends
// break    by touch through the pointer handlers in game time: 50 x open / close of each screen, a screen asked for in a dialogue, in a crossing, while falling, on the
//          frame of a blow, two fingers, closing taps over the attack / roll / jump buttons, purchases at the price, one under, twice in a tick, at the limit
// The in-page helpers (F.tap, F.tick, F.M ...) are the lane's own, read out of screens_check.mjs, so both tools press the same way.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
if (!args.out || args.out === true) { console.error('usage: node tools/v2/screens_verify.mjs --out <dir> [--devices fold_open,phone2] [--only stills,break,choice,queen,reload,ending,oldpad,cost]'); process.exit(2); }
const OUT = String(args.out), DEVICES = String(args.devices || 'fold_open').split(','), SAVES = String(args.saves || '/tmp/claude-0/v2/pre13/chapter/saves');
const ONLY = args.only ? new Set(String(args.only).split(',')) : null, want = (p) => !ONLY || ONLY.has(p);
const ROOT = new URL('../..', import.meta.url).pathname;
fs.mkdirSync(OUT + '/stills', { recursive: true });
let fails = 0, passes = 0; const failed = [];
const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (cond) passes++; else { fails++; failed.push(name); } };
const say = (s) => console.log('     ' + s);
const saveOf = (n) => { const f = fs.readdirSync(SAVES).find((x) => x.startsWith(String(n).padStart(3, '0') + '_')); if (!f) throw new Error('no bot save ' + n + ' in ' + SAVES); const o = JSON.parse(fs.readFileSync(SAVES + '/' + f, 'utf8')); return o.save ?? o; };
const SRC = fs.readFileSync(ROOT + 'tools/v2/screens_check.mjs', 'utf8'), i0 = SRC.indexOf('function install() {'), i1 = SRC.indexOf('\n  const inside');
if (i0 < 0 || i1 < i0) throw new Error('the in-page helpers were not found in screens_check.mjs');
const install = new Function('return ' + SRC.slice(i0, i1).replace('function install', 'function'))();
/** more in-page helpers of this tool */
function extra() {
  const F = window.__F, g = window.__game, sc = window.__v2.scene;
  F.hide = (h) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); };
  F.touch = () => { const c = g.canvasRect; F.tapCss(c.x + c.w * 0.62, c.y + c.h * 0.36, 1, 60); F.tick(6); };
  /** n ticks of play: did the hero do anything by himself (a swing, a roll, a press carried)? is the game going on? */
  F.alive = (n = 30) => { const t0 = sc.sim.time; let swung = 0; for (let i = 0; i < n; i++) { F.tick(1, false); const q = F.hero(); if (q.move !== null || q.buf !== '' || q.dashT > 0) swung++; } F.tick(2); const m = F.M(); return { modal: sc.hud.modal, screen: sc.hud.screen, pad: m.pad?.shown, ran: sc.sim.time > t0, swung, dead: !!sc.sim.hero.dead, busy: !!sc.host?.st.busy }; };
  F.story = () => { try { const o = JSON.parse(localStorage.getItem('bn.v2.save')); return JSON.stringify(o.story) + '|' + o.coins + '|' + JSON.stringify(o.scr); } catch { return null; } };
  F.chipC = () => { const c = F.M().cards.chip; return c ? F.toClient(c.x + c.w / 2, c.y + c.h / 2) : null; };
  F.chipUp = () => { sc.host.model.wrote(); let n = 0; while (n++ < 90 && !F.M().cards.chip) F.tick(1, false); F.tick(2); return F.chipC(); };
  F.drag = (dy, steps = 12, id = 81) => { const m = F.M().screen, cx = m.list.x + m.list.w * 0.25, y0 = m.list.y + m.list.h / 2; let c = F.toClient(cx, y0); F.fire('pointerdown', id, c[0], c[1]); F.tick(1, false); for (let i = 1; i <= steps; i++) { c = F.toClient(cx, y0 + dy * i / steps); F.fire('pointermove', id, c[0], c[1]); F.tick(1, false); } const held = F.M().screen.scroll; F.fire('pointerup', id, c[0], c[1]); F.tick(1); return held; };
  F.rest = (n = 400) => { let i = 0, lo = 0, hi = 0, unbaked = 0; for (; i < n; i++) { F.tick(1, true); const m = F.M().screen; if (!m) break; if (m.scroll < lo) lo = m.scroll; if (m.scroll - m.max > hi) hi = m.scroll - m.max; if (m.rows.some((r) => r.on && !r.baked)) unbaked++; if (m.v === 0 && m.scroll >= 0 && m.scroll <= m.max && i > 3) break; } const m = F.M().screen; return { ticks: i, scroll: m ? m.scroll : null, max: m ? m.max : null, v: m ? m.v : null, lo, hi, unbaked }; };
  F.top = () => g.top?.constructor?.name ?? null;
}
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const errs = [];
const J = (o) => JSON.stringify(o);
try {
  for (const DEV of DEVICES) {
    console.log(`\n════ ${DEV} ════`);
    const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`[${DEV} pageerror] ` + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`[${DEV} console] ` + m.text().slice(0, 300)); });
    const ev = (fn, a) => page.evaluate(fn, a);
    const shot = async (name) => { await ev(() => window.__F.draw()); await page.screenshot({ path: `${OUT}/stills/${DEV}_${name}.png` }); };
    const open = async (sv, q = '') => {
      const o = typeof sv === 'number' ? saveOf(sv) : sv;
      await page.goto(`http://localhost:${port}/tools/v2/fx_view.css`).catch(() => {});
      if (o !== undefined) await ev((s) => { if (s === null) localStorage.removeItem('bn.v2.save'); else localStorage.setItem('bn.v2.save', JSON.stringify(s)); localStorage.removeItem('bn.v2.ui'); }, o ?? null);
      await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&v2res=0.5${q}`);
      await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 });
      await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui' || /v2ui=0/.test(location.search), null, { timeout: 20000 }).catch(() => {});
      const cdp = await ctx.newCDPSession(page), T = new Touch(cdp, page);
      await ensureTouchMode(T, page); await page.waitForTimeout(250);
      const st = await ev(install); await ev(extra); await ev(() => window.__F.tick(30));
      return st;
    };
    /** ticks from the node side until `done` (areas are built between ticks: a crossing, a fall) */
    const until = async (done, max = 120, each = null) => { let x = null; for (let i = 0; i < max; i++) { x = await ev((each) => { const F = window.__F, sc = window.__v2.scene, S = F.safe(); let opened = 0; try { for (let k = 0; k < 20; k++) { if (each && k % 5 === 2) { F.fire('pointerdown', 91, each.chip[0], each.chip[1]); F.fire('pointerup', 91, each.chip[0], each.chip[1]); F.fire('pointerdown', 92, each.pause[0], each.pause[1]); F.fire('pointerup', 92, each.pause[0], each.pause[1]); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); } if (!each && sc.hud.modal === 'dialog' && k % 9 === 0) F.tap(S.vw / 2, S.vh * 0.3, 1); window.__game.tick(1 / 60); if (each && k % 5 === 3) window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape', bubbles: true })); if (each && sc.hud.modal) { opened++; if (sc.hud.screen) sc.hud.closeScreen(); else if (sc.hud.pauseOpen) sc.hud.closePause(); } } F.draw(); } catch (e) { return { err: String(e?.message ?? e) }; } const pb = F.M().pad?.buttons?.find((q) => q.id === 'pause'); return { area: window.__v2.area, ready: window.__v2.ready, xing: !!sc.xing, go: !!sc._go, dead: !!sc.sim?.hero?.dead, modal: sc.hud.modal, busy: !!sc.host?.st.busy, opened, pauseOn: !!pb && F.M().pad?.shown === true }; }, each).catch(() => null); if (x && !x.err && done(x)) break; await page.waitForTimeout(100); } return x; };

    // ───────────── the stills: every state of the first piece ─────────────
    if (want('stills')) {
      const STATES = DEV === 'fold_open' ? [[null, '0_fresh'], [22, '1_first_crossing'], [29, '2_key_left'], [33, '3_key_found'], [43, '4_stones_seen'], [51, '5_graves_carved'], [71, '6_knells'], [84, '7_ending']] : [[22, '1_first_crossing'], [33, '3_key_found'], [51, '5_graves_carved'], [84, '7_ending']];
      for (const [n, name] of STATES) {
        await open(n);
        const r = await ev(() => { const F = window.__F, sc = window.__v2.scene, M = sc.host.model; F.tick(6); const opened = sc.hud.openScreen('chronicle'); F.tick(60); const m = F.M().screen;
          return { opened, area: window.__v2.area, modal: sc.hud.modal, max: m ? m.max : -1, n: m ? m.n : 0, list: m ? m.list : null, rowsOn: m ? m.rows.filter((q) => q.on).length : 0, rows: M.book().map((q) => ({ id: q.id, kind: q.kind, era: q.era, L: q.L, R: q.R, hint: q.kind === 'blank' ? q.hint : '' })), bag: M.bag(), chron: sc.host.st.state.chronicle.slice(), flags: Object.keys(sc.host.st.state.flags).length }; });
        console.log(`  [${DEV} ${name}] area ${r.area} · opened ${r.opened} · rows ${r.n} (in the window ${r.rowsOn}) · scroll max ${Math.round(r.max)} · written by the story: ${r.chron.join(' ') || '-'}`);
        if (DEV === DEVICES[0]) for (const q of r.rows) say(`${q.id} [${q.kind}/${q.era}]  L: ${q.L ? q.L.title + ' — ' + q.L.text : '·'}  |  R: ${q.R ? q.R.title + ' — ' + q.R.text : '·'}${q.hint ? '  |  hint: ' + q.hint : ''}`);
        if (DEV === DEVICES[0]) say('bag: ' + r.bag.story.map((q) => `${q.name}(${q.icon}): ${q.desc}`).join(' / ') + ' || ' + r.bag.use.map((q) => `${q.name}(${q.icon})×${q.n}: ${q.desc}`).join(' / '));
        await shot(`${name}_book`);
        if (r.max > 0) {   // past both ends, then to the end for a still
          const d = await ev(() => { const F = window.__F, m0 = F.M().screen, H = m0.list.h; const heldTop = F.drag(H * 0.9, 10); const a = F.rest(); let heldEnd = 0; for (let i = 0; i < 8; i++) heldEnd = F.drag(-H * 0.95, 6, 82 + i); const b = F.rest(); const fl = F.drag(H * 0.9, 2, 95); const c = F.rest(); for (let i = 0; i < 8; i++) F.drag(-H * 0.95, 6, 100 + i); const e = F.rest(); return { heldTop, a, heldEnd, b, fl, c, e, max: F.M().screen.max }; });
          ok(`${DEV} ${name}: the list dragged past its top springs back to 0, past its end back to the end, a fling comes to rest inside; no row in the window was ever unbaked`, d.heldTop < 0 && d.a.scroll === 0 && d.heldEnd > d.max && Math.abs(d.b.scroll - d.max) < 0.5 && d.c.scroll >= 0 && d.c.scroll <= d.max && d.a.unbaked + d.b.unbaked + d.c.unbaked === 0 && d.c.lo >= -80 && Math.abs(d.e.scroll - d.max) < 0.5, `held at ${Math.round(d.heldTop)} -> ${d.a.scroll} in ${d.a.ticks} ticks · held at ${Math.round(d.heldEnd)} of ${Math.round(d.max)} -> ${Math.round(d.b.scroll)} in ${d.b.ticks} · fling -> ${Math.round(d.c.scroll)} (lowest ${Math.round(d.c.lo)}) · unbaked ${d.a.unbaked + d.b.unbaked + d.c.unbaked}`);
          await shot(`${name}_book_end`);
        }
        await ev(() => { const F = window.__F, sc = window.__v2.scene; sc.hud.closeScreen(); F.tick(12); sc.hud.openScreen('bag'); F.tick(40); });
        await shot(`${name}_bag`);
      }
    }

    // ───────────── break it by touch ─────────────
    if (want('break')) {
      await open(33);
      const pos = await ev(() => { const F = window.__F; const chip = F.chipUp(); return { chip, pause: F.pauseBtn(), atk: F.btn('attack'), roll: F.btn('roll'), jump: F.btn('jump'), st: F.story(), model: F.model() }; });
      ok(`${DEV}: (set-up) the chip, the pause button and the three action buttons are on screen`, !!pos.chip && !!pos.pause && !!pos.atk && !!pos.roll && !!pos.jump, J({ chip: pos.chip, pause: pos.pause, atk: pos.atk, roll: pos.roll }));
      // 50 x each screen
      const t1 = await ev(() => { const F = window.__F, sc = window.__v2.scene, out = { chronicle: 0, bag: 0, bad: [] };
        for (const kind of ['chronicle', 'bag']) for (let i = 0; i < 50; i++) {
          if (!F.openPause()) { out.bad.push(kind + i + ':pause'); break; }
          F.pauseRow(kind); F.tick(4 + (i % 7), false); if (sc.hud.screen !== kind) { out.bad.push(kind + i + ':open ' + sc.hud.screen); break; }
          F.closeBtn(); F.tick(3 + (i % 9), false); if (sc.hud.screen !== null || !F.M().pause) { out.bad.push(kind + i + ':close ' + sc.hud.screen); break; }
          F.pauseRow('resume'); F.tick(2 + (i % 4), false); if (sc.hud.modal !== null) { out.bad.push(kind + i + ':resume ' + sc.hud.modal); break; }
          out[kind]++;
        }
        return { out, alive: F.alive(), st: F.story(), model: F.model() }; });
      ok(`${DEV}: the book and the bag opened and closed 50 times each by touch (pause button, row, close button, 「이어 하기」): nothing stuck, the pad back, time running, the save whole`, t1.out.chronicle === 50 && t1.out.bag === 50 && t1.alive.modal === null && t1.alive.pad === true && t1.alive.ran && t1.alive.swung === 0 && t1.st === pos.st, J(t1.out) + ' ' + J(t1.alive));
      const t1s = await ev(() => { const F = window.__F, sc = window.__v2.scene, bad = []; let n = 0; F.put(3476, 150, -1, 0); F.tick(40);
        for (let i = 0; i < 50; i++) { let p = null, k = 0; while (k++ < 120 && !(p = F.M().prompts.find((q) => q.action === 'confirm'))) F.tick(1); if (!p) { bad.push(i + ':pill'); break; } F.tapRect(p); F.tick(5 + (i % 6), false); if (sc.hud.screen !== 'shop') { bad.push(i + ':open ' + sc.hud.screen + ' ' + sc.hud.modal); break; } F.closeBtn(); F.tick(2 + (i % 5), false); if (sc.hud.modal !== null || sc.host.st.busy) { bad.push(i + ':close ' + sc.hud.modal + ' busy ' + sc.host.st.busy); break; } n++; }
        return { n, bad, alive: F.alive(), waits: sc.host.waits.length, st: F.story() }; });
      ok(`${DEV}: Rook's shop opened by its pill and closed 50 times: the story's step ends every time, nothing stuck, the save whole`, t1s.n === 50 && t1s.alive.modal === null && t1s.alive.pad === true && t1s.alive.ran && !t1s.alive.busy && t1s.alive.swung === 0 && t1s.waits === 0 && t1s.st === pos.st, J({ n: t1s.n, bad: t1s.bad, alive: t1s.alive, waits: t1s.waits }));
      // purchases
      const t10 = await ev(() => { const F = window.__F, sc = window.__v2.scene, M = sc.host.model; const coins = (n) => { sc.brk.coins = n; sc.state.coins = n; M.touch(); F.tick(2); }; M.dr = 0; M.touch();
        let p = null, n = 0; while (n++ < 120 && !(p = F.M().prompts.find((q) => q.action === 'confirm'))) F.tick(1); if (!p) return { err: 'no pill' };
        F.tapRect(p); F.tick(16); if (sc.hud.screen !== 'shop') return { err: 'no shop' };
        const row = (i) => F.M().screen.rows[i], tap2 = (i) => { F.tapRect(row(i)); F.tick(10); F.tapRect(row(i)); F.tick(3); }, snap = () => ({ dr: M.dr, coins: M.coins(), st: row(0).state, sel: F.M().screen.sel, say: F.M().screen.say }), out = {};
        coins(19); tap2(0); out.less = snap();
        coins(20); tap2(0); out.exact = snap();
        coins(40); M.dr = 0; M.touch(); F.tick(2); F.tapRect(row(0)); F.tick(10); const m = F.mid(row(0)), c = F.toClient(m[0], m[1]);
        F.fire('pointerdown', 65, c[0], c[1]); F.fire('pointerup', 65, c[0], c[1]); F.fire('pointerdown', 66, c[0], c[1]); F.fire('pointerup', 66, c[0], c[1]); out.sameTick = { dr: M.dr, coins: M.coins() }; F.tick(1); F.fire('pointerdown', 67, c[0], c[1]); F.fire('pointerup', 67, c[0], c[1]); F.tick(3); out.twice = snap();
        coins(60); M.dr = 2; M.touch(); F.tick(2); tap2(0); out.limit = snap();
        M.dr = 1; M.touch(); coins(20); tap2(0); out.lastOne = snap(); tap2(0); out.over = snap();
        M.dr = 0; M.touch(); coins(0); F.closeBtn(); F.tick(10); out.closed = { screen: sc.hud.screen, modal: sc.hud.modal, busy: sc.host.st.busy }; out.alive = F.alive(); return out; });
      if (t10.err) ok(`${DEV}: purchases by touch`, false, t10.err);
      else {
        ok(`${DEV}: one silver less than the price (19 of 20): refused, nothing taken`, t10.less.dr === 0 && t10.less.coins === 19, J(t10.less));
        ok(`${DEV}: exactly the price (20): bought, 0 silver left`, t10.exact.dr === 1 && t10.exact.coins === 0, J(t10.exact));
        ok(`${DEV}: two whole taps in one tick on the chosen row, a third in the next tick: one draught is sold, not two`, t10.sameTick.dr === 1 && t10.sameTick.coins === 20 && t10.twice.dr === 1 && t10.twice.coins === 20, J(t10.sameTick) + ' -> ' + J(t10.twice));
        ok(`${DEV}: at the limit (two carried, 60 silver): refused; with one carried the last one is sold and the next refused`, t10.limit.dr === 2 && t10.limit.coins === 60 && t10.lastOne.dr === 2 && t10.lastOne.coins === 0 && t10.over.dr === 2 && t10.over.coins === 0, J(t10.limit) + ' ' + J(t10.lastOne) + ' ' + J(t10.over));
        ok(`${DEV}: the shop closed after all that: the game goes on`, t10.closed.screen === null && t10.closed.modal === null && !t10.closed.busy && t10.alive.ran && t10.alive.swung === 0 && t10.alive.pad === true, J(t10.closed) + ' ' + J(t10.alive));
      }
      // closing taps over the buttons of the pad
      const t9 = await ev((pos) => { const F = window.__F, sc = window.__v2.scene, out = [];
        for (const [name, p] of [['attack', pos.atk], ['roll', pos.roll], ['jump', pos.jump]]) {
          const chip = F.chipUp(); if (!chip) { out.push({ name, err: 'no chip' }); continue; }
          F.fire('pointerdown', 61, p[0], p[1]); F.fire('pointerup', 61, p[0], p[1]);   // a press in the tick the chip is touched: the rules would carry it for 0.19 s
          F.fire('pointerdown', 62, chip[0], chip[1]); F.fire('pointerup', 62, chip[0], chip[1]); F.tick(8, false);
          const opened = sc.hud.screen; F.tapCss(p[0], p[1], 2, 63);   // a tap on the button's place with the book open
          F.closeBtn(); const a1 = F.alive(24);                          // closed by its button: the game runs at once
          const chip2 = F.chipUp(); F.fire('pointerdown', 62, chip2[0], chip2[1]); F.fire('pointerup', 62, chip2[0], chip2[1]); F.tick(8, false); const opened2 = sc.hud.screen;
          F.fire('pointerdown', 64, p[0], p[1]); F.tick(2, false); F.key('Escape');   // the finger lies on the button's place while the back key closes the book
          const closed = sc.hud.screen === null && sc.hud.modal === null; let swung = 0; for (let i = 0; i < 6; i++) { F.tick(1, false); const q = F.hero(); if (q.move !== null || q.buf !== '' || q.dashT > 0) swung++; }
          F.fire('pointerup', 64, p[0], p[1]); const a2 = F.alive(30); F.touch(); F.tick(30, false);
          out.push({ name, opened, a1, opened2, closed, swung: swung + a2.swung, a2modal: a2.modal });
        }
        return out; }, pos);
      ok(`${DEV}: a press on attack / roll / jump in the tick the chip is touched, a tap on the button's place with the book open, the book closed by its button, then by the back key with a finger lying on the button's place: the hero does nothing when the game runs again`, t9.every((q) => !q.err && q.opened === 'chronicle' && q.a1.modal === null && q.a1.ran && q.a1.swung === 0 && q.opened2 === 'chronicle' && q.closed && q.swung === 0), t9.map((q) => `${q.name}: ${q.err ?? `open ${q.opened} · after the button swung ${q.a1.swung} · after back swung ${q.swung} closed ${q.closed}`}`).join(' | '));
      // two fingers
      const t6 = await ev((pos) => { const F = window.__F, sc = window.__v2.scene, out = {};
        let chip = F.chipUp(); F.tapCss(chip[0], chip[1]); F.tick(12); let m = F.M().screen; if (!m) return { err: 'the book did not open' };
        const a = F.toClient(m.list.x + m.list.w / 2, m.list.y + m.list.h / 2); let c = F.toClient(m.close.x + m.close.w / 2, m.close.y + m.close.h / 2);
        F.fire('pointerdown', 71, a[0], a[1]); F.fire('pointermove', 71, a[0], a[1] - 30); F.fire('pointerdown', 72, c[0], c[1]); F.fire('pointerup', 72, c[0], c[1]); F.tick(1, false); F.fire('pointermove', 71, a[0], a[1] - 60); F.fire('pointerup', 71, a[0], a[1] - 60); F.tick(8);
        out.a = { screen: sc.hud.screen, modal: sc.hud.modal }; if (sc.hud.screen) { F.closeBtn(); F.tick(8); } out.aAlive = F.alive();
        chip = F.chipUp(); F.fire('pointerdown', 73, pos.atk[0], pos.atk[1]); F.fire('pointerdown', 74, chip[0], chip[1]); F.tick(1, false); F.fire('pointerup', 73, pos.atk[0], pos.atk[1]); F.fire('pointerup', 74, chip[0], chip[1]); F.tick(10);
        out.b = { screen: sc.hud.screen, move: F.hero().move, buf: F.hero().buf }; m = F.M().screen;
        if (m) { c = F.toClient(m.close.x + m.close.w / 2, m.close.y + m.close.h / 2); F.fire('pointerdown', 75, c[0], c[1]); F.fire('pointerup', 75, c[0], c[1]); } out.bAlive = F.alive();
        F.openPause(); const P = F.M().pause;
        if (P) { const r1 = P.rows[P.ids.indexOf('chronicle')], r2 = P.rows[P.ids.indexOf('bag')], p1 = F.toClient(r1.x + r1.w / 2, r1.y + r1.h / 2), p2 = F.toClient(r2.x + r2.w / 2, r2.y + r2.h / 2); F.fire('pointerdown', 76, p1[0], p1[1]); F.fire('pointerdown', 77, p2[0], p2[1]); F.fire('pointerup', 76, p1[0], p1[1]); F.fire('pointerup', 77, p2[0], p2[1]); F.tick(12); out.c = { screen: sc.hud.screen, modal: sc.hud.modal, panel: !!F.M().pause }; if (sc.hud.screen) { F.closeBtn(); F.tick(10); } out.c2 = { screen: sc.hud.screen, panel: !!F.M().pause }; if (F.M().pause) { F.pauseRow('resume'); F.tick(4); } }
        out.cAlive = F.alive(); return out; }, pos);
      if (t6.err) ok(`${DEV}: two fingers`, false, t6.err);
      else {
        ok(`${DEV}: two fingers - one drags the list while the other taps the close button: the book closes, nothing is left dragging`, t6.a.screen === null && t6.aAlive.modal === null && t6.aAlive.ran && t6.aAlive.swung === 0 && t6.aAlive.pad === true, J(t6.a) + ' ' + J(t6.aAlive));
        ok(`${DEV}: two fingers - the attack button and the chip in the same tick: the book opens, and after it is closed the hero does not swing`, t6.b.screen === 'chronicle' && t6.bAlive.modal === null && t6.bAlive.swung === 0 && t6.bAlive.ran, J(t6.b) + ' ' + J(t6.bAlive));
        ok(`${DEV}: two fingers - 「연대기」 and 「가방」 of the pause panel in the same tick: one screen is up, closing it gives the panel back, the game resumes`, !!t6.c && !!t6.c.screen && t6.c2.screen === null && t6.c2.panel && t6.cAlive.modal === null && t6.cAlive.ran && t6.cAlive.pad === true, J(t6.c) + ' ' + J(t6.c2) + ' ' + J(t6.cAlive));
      }
      // a blow on the frame the book opens
      const t5 = await ev(() => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim, h = sim.hero; const chip = F.chipUp(); if (!chip) return { err: 'no chip' };
        h.ifr = 0; sc._graceT = 0; const hp0 = h.hp, r = sim.hurtHero(5, -1, 0, {}); F.fire('pointerdown', 93, chip[0], chip[1]); const opened = sc.hud.screen; F.fire('pointerup', 93, chip[0], chip[1]); const t0 = sim.time; F.tick(60); const frozen = sim.time === t0; F.closeBtn(); F.tick(4);
        return { r, hp0, hp: h.hp, opened, frozen, alive: F.alive(120), dead: h.dead }; });
      ok(`${DEV}: the book opened on the frame a blow lands: the game stands still behind it, and goes on with the hero up and free when it is closed`, !t5.err && t5.opened === 'chronicle' && t5.frozen && t5.hp < t5.hp0 && t5.alive.modal === null && t5.alive.ran && !t5.dead && t5.alive.pad === true, J(t5));
      // in a dialogue
      const t2 = await ev((pos) => { const F = window.__F, sc = window.__v2.scene, S = F.safe(); F.chipUp(); const def = sc.area.actors.find((a) => a.talk); if (!def) return { err: 'nobody to talk to' };
        sc.emit('talk', { id: def.id, talk: def.talk, actor: def }); let n = 0; while (n++ < 180 && sc.hud.modal !== 'dialog') F.tick(1, false); if (sc.hud.modal !== 'dialog') return { err: 'no dialogue from ' + def.talk };
        const seen = []; F.tick(20, false);
        F.tapCss(pos.chip[0], pos.chip[1]); seen.push(sc.hud.screen + '/' + sc.hud.modal);
        if (sc.hud.modal === 'dialog') { F.tapCss(pos.pause[0], pos.pause[1]); seen.push(sc.hud.screen + '/' + sc.hud.modal + '/' + !!F.M().pause); }
        if (sc.hud.modal === 'dialog') { F.key('Escape'); seen.push(sc.hud.screen + '/' + sc.hud.modal + '/' + !!F.M().pause); F.touch(); }
        const api = sc.hud.modal === 'dialog' ? sc.hud.openScreen('chronicle') : null; F.tick(12); const over = { api, screen: sc.hud.screen, modal: sc.hud.modal }; if (sc.hud.screen) { F.closeBtn(); F.tick(10); } const back = { screen: sc.hud.screen, modal: sc.hud.modal };
        n = 0; while (n++ < 1500 && (sc.hud.modal === 'dialog' || sc.host.st.busy)) { if (sc.hud.modal === 'dialog' && n % 9 === 0) F.tap(S.vw / 2, S.vh * 0.3, 1); else F.tick(1, false); }
        return { talk: def.talk, seen, over, back, alive: F.alive() }; }, pos);
      ok(`${DEV}: in a dialogue no touch opens a screen (where the chip was, where the pause button was, the back key): the dialogue only goes on; afterwards the game runs`, !t2.err && t2.seen.every((q) => q.startsWith('null/')) && t2.alive.modal === null && t2.alive.ran && t2.alive.swung === 0, J(t2));
      if (!t2.err) say(`(the interface asked directly - hud.openScreen during a dialogue -> ${J(t2.over)}; closed -> ${J(t2.back)})`);
      // a crossing, with the draught used on its first frame
      const t3 = await ev(() => { const F = window.__F, sc = window.__v2.scene, M = sc.host.model; M.dr = 1; M.touch(); F.put(4200, 1392, 0, -1); F.tick(20); const h = sc.sim.hero, d0 = sc.sim.deaths, hdr = h.draughts, okx = sc.cross({}); h.ifr = 0; sc._graceT = 0; h.hp = 1; const r = sc.sim.hurtHero(999, -1, 0, {}); return { okx, r, dead: h.dead, hp: h.hp, hdr, deaths: sc.sim.deaths - d0, area: window.__v2.area, dr: M.dr }; });
      let opened = 0, pauseOn = 0, samples = 0;
      const x3 = await until((x) => { opened += x.opened; samples++; if (x.pauseOn && (x.xing || x.go)) pauseOn++; return x.ready && !x.xing && !x.go && x.area !== t3.area; }, 140, pos);
      const t3b = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.touch(); F.tick(60); const m = F.M(); return { model: F.model(), hero: F.hero(), hudDr: m.hud.draughts, alive: F.alive(), area: window.__v2.area, deaths: sc.sim.deaths }; });
      ok(`${DEV}: during a bell crossing nothing opens (the chip's place, the pause button's place and the back key pressed all the way through), and the crossing ends in the other night`, t3.okx === true && opened === 0 && !!x3 && x3.area === 'eshville_past' && t3b.alive.modal === null && t3b.alive.ran && t3b.alive.pad === true, `ticks with something open ${opened} · samples ${samples} · samples with the pause button on screen during the crossing ${pauseOn} · ${J(t3b.alive)}`);
      ok(`${DEV}: the draught used on the first frame of the crossing: he does not fall, it is gone on the far side (model, rules, HUD), no fall is counted`, t3.r !== false && t3.dead === false && t3.deaths === 0 && t3b.model.dr === 0 && t3b.hero.draughts === 0 && !t3b.hudDr && !t3b.hero.dead, J(t3) + ' -> ' + J({ dr: t3b.model.dr, heroDr: t3b.hero.draughts, hp: t3b.hero.hp, hud: t3b.hudDr }));
      // while falling
      const t4 = await ev((pos) => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim, h = sim.hero; const chip = F.chipUp() ?? pos.chip; h.ifr = 0; sc._graceT = 0; h.hp = 1; const d0 = sim.deaths; sim.hurtHero(999, -1, 0, {}); const fell = h.dead; F.tick(3, false);
        F.tapCss(chip[0], chip[1]); const a = { screen: sc.hud.screen, modal: sc.hud.modal }; let frozen = null;
        if (sc.hud.screen) { const t0 = sim.time; F.tick(60); frozen = sim.time === t0; F.closeBtn(); F.tick(6); }
        const pb = F.pauseBtn(); if (pb) F.tapCss(pb[0], pb[1]); const b = { modal: sc.hud.modal, panel: !!F.M().pause }; if (F.M().pause) { F.pauseRow('resume'); F.tick(4); }
        return { fell, a, frozen, b }; }, pos);
      const x4 = await until((x) => !x.dead && x.ready && !x.go && !x.busy && x.modal === null, 140, null);
      const t4b = await ev(() => { const F = window.__F; F.touch(); F.tick(30); return { alive: F.alive(), model: F.model(), area: window.__v2.area }; });
      ok(`${DEV}: the book and the pause panel asked for while he falls: whatever opens stops the fall and gives it back, and he stands up again as always - nothing stuck`, t4.fell === true && (t4.a.screen === null || t4.frozen === true) && !!x4 && !x4.dead && t4b.alive.modal === null && t4b.alive.ran && t4b.alive.pad === true && !t4b.alive.dead, J(t4) + ' -> ' + J(t4b.alive) + ' in ' + t4b.area);
    }

    // ───────────── a choice chosen once and left ─────────────
    if (want('choice')) {
      await open(28);
      const c = await ev(() => { const F = window.__F, sc = window.__v2.scene, H = sc.host, S = F.safe(); const st0 = F.story();
        const def = sc.area.actors.find((a) => a.talk === 'hadwin1.smithy') ?? { id: 'hadwin1', talk: 'hadwin1.smithy' }; sc.emit('talk', { id: def.id, talk: 'hadwin1.smithy', actor: def });
        const flags = () => Object.keys(H.st.state.flags).filter((k) => k.startsWith('key_')).join(' ');
        let n = 0; while (n++ < 1200) { const d = F.M().dialog; if (d && d.cards) break; if (sc.hud.modal === 'dialog' && n % 9 === 0) F.tap(S.vw / 2, S.vh * 0.3, 1); else F.tick(1, false); }
        const d0 = F.M().dialog; if (!d0 || !d0.cards) return { err: 'the cards did not come up' }; F.tick(30); const r = d0.choiceRects;
        F.tap(r[0].x + r[0].w / 2, r[0].y + r[0].h / 2, 1); F.tick(2); const one = { sel: F.M().dialog?.sel, flags: flags() };
        F.tick(900, false); F.tick(2); const later = { sel: F.M().dialog?.sel, flags: flags(), modal: sc.hud.modal };            // fifteen seconds
        F.hide(true); F.tick(30, false); F.hide(false); F.tick(30); const hidden = { sel: F.M().dialog?.sel, flags: flags(), modal: sc.hud.modal, cards: !!F.M().dialog?.cards };
        F.key('Escape'); F.tick(4); const esc = { sel: F.M().dialog?.sel, flags: flags(), modal: sc.hud.modal, panel: !!F.M().pause, cards: !!F.M().dialog?.cards }; F.touch();
        const pb = F.pauseBtn(); const padOn = F.M().pad?.shown;
        return { one, later, hidden, esc, padOn, saved: F.story() === st0, st0 }; });
      if (c.err) ok(`${DEV}: a choice chosen once and left`, false, c.err);
      else ok(`${DEV}: a choice card tapped once and left alone (15 s, the page hidden and back, the back key): it stays chosen or is let go, the story decides nothing, the stored save is untouched`, c.one.sel === 0 && c.one.flags === '' && c.later.flags === '' && c.later.modal === 'dialog' && c.hidden.flags === '' && c.hidden.modal === 'dialog' && c.hidden.cards && c.esc.flags === '' && c.esc.modal === 'dialog' && c.esc.cards, J({ one: c.one, later: c.later, hidden: c.hidden, esc: c.esc, saveUntouched: c.saved }));
      await open(undefined);
      const c2 = await ev(() => { const F = window.__F, sc = window.__v2.scene, H = sc.host; return { flags: Object.keys(H.st.state.flags).filter((k) => k.startsWith('key_')).join(' '), alive: F.alive(), area: window.__v2.area }; });
      ok(`${DEV}: the page reloaded with the cards up: the game comes back before the question (nothing decided), the hero free`, c2.flags === '' && c2.alive.modal === null && c2.alive.ran && !c2.alive.busy, J(c2));
    }

    // ───────────── the draught at the queen ─────────────
    if (want('queen')) {
      await open(74);
      const q = await ev(() => { const F = window.__F, sc = window.__v2.scene, M = sc.host.model, sim = sc.sim, h = sim.hero; F.tick(30); M.dr = 2; M.touch(); F.tick(2);
        const st0 = { modal: sc.hud.modal, busy: sc.host.st.busy, hold: !!sim.hold, area: window.__v2.area, q: JSON.stringify(sc.ch.out().queen), E: sim.enemies.filter((e) => !e.dead).length, boss: sc.state.boss ? Math.round((sc.state.boss.hp ?? sc.state.boss.k ?? 0) * 100) / 100 : null };
        const e = sim.enemies.find((x) => !x.dead) ?? {}, out = { st0, hits: [] };
        for (let i = 0; i < 3; i++) { F.tick(90, false); h.ifr = 0; sc._graceT = 0; h.hp = 1; const d0 = sim.deaths, r = sim.hurtHero(999, -1, 0, e); const o = { r, dead: h.dead, hp: h.hp, deaths: sim.deaths - d0 }; F.tick(2, false); o.dr = M.dr; o.hdr = sim.hero.draughts; out.hits.push(o); if (h.dead) break; }
        out.q1 = JSON.stringify(sc.ch.out().queen); out.hud = F.M().hud.draughts; out.cards = F.M().cards.up.map((c) => c.text); return out; });
      ok(`${DEV}: at the queen (bot save 074) two draughts save him twice and the third blow fells him; her own state is not touched by a draught`, q.hits.length === 3 && q.hits[0].dead === false && q.hits[0].dr === 1 && q.hits[1].dead === false && q.hits[1].dr === 0 && q.hits[2].dead === true && q.hits[0].deaths === 0 && q.hits[1].deaths === 0, J(q));
      const xq = await until((x) => !x.dead && x.ready && !x.go && !x.busy && x.modal === null, 160, null);
      const q2 = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.touch(); F.tick(30); return { alive: F.alive(), area: window.__v2.area, model: F.model().dr, q: JSON.stringify(sc.ch.out().queen) }; });
      ok(`${DEV}: …after that fall he stands up at his rest spot and the game goes on`, !!xq && !xq.dead && q2.alive.modal === null && q2.alive.ran && !q2.alive.dead, J(q2));
    }

    // ───────────── a reload with each screen open; the page hidden and back ─────────────
    if (want('reload')) {
      for (const kind of ['chronicle', 'bag']) {
        await open(33);
        const a = await ev((kind) => { const F = window.__F, sc = window.__v2.scene; const st0 = F.story(); F.openPause(); F.pauseRow(kind); F.tick(20); const scr = sc.hud.screen; F.hide(true); F.tick(20, false); const hid = { screen: sc.hud.screen, modal: sc.hud.modal }; F.hide(false); F.tick(20); return { scr, hid, back: { screen: sc.hud.screen, modal: sc.hud.modal, panel: !!F.M().pause }, model: F.model(), st0, st1: F.story(), why: JSON.parse(localStorage.getItem('bn.v2.save')).why }; }, kind);
        await open(undefined);
        const b = await ev(() => { const F = window.__F; return { model: F.model(), alive: F.alive() }; });
        ok(`${DEV}: ${kind} - the page hidden and back with it open: it is still open and nothing else is; reloaded with it open: the game comes back free with the same rows, bag and silver`, a.scr === kind && a.hid.screen === kind && a.back.screen === kind && a.back.modal === 'pause' && b.model.book.replace(/\*/g, '') === a.model.book.replace(/\*/g, '') && b.model.bag === a.model.bag && b.model.coins === a.model.coins && b.alive.modal === null && b.alive.ran && b.alive.pad === true, J({ hid: a.hid, back: a.back, savedOnHide: a.why, after: b.alive, unread: [a.model.unread, b.model.unread] }));
      }
      for (const hide of [false, true]) {
        await open(33);
        const a = await ev((hide) => { const F = window.__F, sc = window.__v2.scene, M = sc.host.model; sc.brk.coins = 45; sc.state.coins = 45; M.touch(); F.tick(2); sc.host.saveNow('test'); F.put(3476, 150, -1, 0); F.tick(40);
          let p = null, n = 0; while (n++ < 120 && !(p = F.M().prompts.find((q) => q.action === 'confirm'))) F.tick(1); if (!p) return { err: 'no pill' }; F.tapRect(p); F.tick(16); if (sc.hud.screen !== 'shop') return { err: 'no shop' };
          const row = F.M().screen.rows[0]; F.tapRect(row); F.tick(10); F.tapRect(row); F.tick(4); const bought = { dr: M.dr, coins: M.coins() };
          if (hide) { F.hide(true); F.tick(10, false); F.hide(false); F.tick(10); } const o = JSON.parse(localStorage.getItem('bn.v2.save')); return { bought, screen: sc.hud.screen, saved: { coins: o.coins, dr: o.scr?.dr, why: o.why, running: sc.host.st.running } }; }, hide);
        if (a.err) { ok(`${DEV}: the shop reloaded (${hide ? 'after the page was hidden' : 'at once'})`, false, a.err); continue; }
        await open(undefined);
        const b = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.tick(10); const m = F.M(); return { dr: sc.host.model.dr, coins: sc.host.model.coins(), hero: F.hero().draughts, hud: m.hud.draughts ? m.hud.draughts.n : 0, alive: F.alive() }; });
        const pair = b.coins + '/' + b.dr;
        ok(`${DEV}: the shop, a draught bought, the page reloaded with the shop open (${hide ? 'the page was hidden first: the purchase is in the save' : 'no save in between: the purchase never happened'}): silver and draughts agree, the game is free`, a.bought.dr === 1 && a.bought.coins === 25 && a.screen === 'shop' && (hide ? pair === '25/1' : pair === '45/0') && b.hero === b.dr && b.hud === b.dr && b.alive.modal === null && b.alive.ran && !b.alive.busy, `bought ${J(a.bought)} · stored ${J(a.saved)} · after the reload silver/draughts ${pair} (rules ${b.hero}, HUD ${b.hud})`);
      }
    }

    // ───────────── the ending: the card, the book, the chooser ─────────────
    if (want('ending')) {
      await open(84);
      const e0 = await ev(() => { const F = window.__F, sc = window.__v2.scene; let n = 0, free = 0; while (n++ < 900 && sc.hud.modal !== 'end') { F.tick(1, false); if (sc.hud.modal === null && !sc.host.locks() && !sc.host.inputLock) free++; } F.tick(2); return { n, free, modal: sc.hud.modal, end: F.M().end, pos: { chip: F.chipC(), pause: F.pauseBtn() }, padShown: F.M().pad?.shown }; });
      ok(`${DEV}: a save after the last line: the ending card comes up, the hero is never free on the way`, e0.modal === 'end' && e0.free === 0, J({ ticks: e0.n, free: e0.free, end: e0.end, pad: e0.padShown }));
      const e1 = await ev(() => { const F = window.__F, sc = window.__v2.scene, S = F.safe(), H = sc.host; let n = 0; while (n++ < 600 && !(F.M().end && F.M().end.ready)) F.tick(1, false);
        const seen0 = H.seen.length; F.key('Escape'); F.tick(3); const esc = { modal: sc.hud.modal, screen: sc.hud.screen, panel: !!F.M().pause }; F.touch();
        const c = F.toClient(S.vw / 2, S.vh / 2); F.fire('pointerdown', 31, c[0], c[1]); F.fire('pointerdown', 32, c[0] + 40, c[1] + 10); F.fire('pointerup', 31, c[0], c[1]); F.fire('pointerup', 32, c[0] + 40, c[1] + 10);   // two fingers in one tick
        n = 0; while (n++ < 600 && sc.hud.screen !== 'chronicle' && F.top() !== 'V2Chooser') F.tick(1, false); F.tick(20);
        const books = H.seen.slice(seen0).filter((q) => q[0] === 'book').length, m = F.M().screen;
        return { esc, screen: sc.hud.screen, modal: sc.hud.modal, books, top: F.top(), rows: m ? m.rows.map((r) => r.id + ':' + r.kind).join(' ') : '', max: m ? m.max : 0, stored: JSON.parse(localStorage.getItem('bn.v2.save')).ch?.card ?? null }; });
      ok(`${DEV}: the back key on the card opens nothing; two fingers on the card in one tick: the book opens once (nothing saved yet)`, e1.esc.modal === 'end' && !e1.esc.panel && e1.screen === 'chronicle' && e1.books === 1 && e1.top !== 'V2Chooser' && !e1.stored, J(e1));
      await shot('ending_book_after_card');
      const e2 = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.hide(true); F.tick(30, false); const why = JSON.parse(localStorage.getItem('bn.v2.save')).why; F.hide(false); F.tick(20); const a = { screen: sc.hud.screen, why, card: JSON.parse(localStorage.getItem('bn.v2.save')).ch?.card ?? null };
        const S = F.safe(), pb = F.toClient(S.x + S.w * 0.9, S.y + S.h * 0.88); F.tapCss(pb[0], pb[1], 2, 33); F.tick(4); a.after = sc.hud.screen; return a; });
      ok(`${DEV}: the page hidden and back with the book open after the card: the book is still there, the save still says the card was not dismissed`, e2.screen === 'chronicle' && !e2.card && e2.after === 'chronicle', J(e2));
      await open(undefined);
      const e3 = await ev(() => { const F = window.__F, sc = window.__v2.scene; let n = 0, free = 0; while (n++ < 900 && sc.hud.modal !== 'end') { F.tick(1, false); if (sc.hud.modal === null && !sc.host.locks() && !sc.host.inputLock) free++; } return { modal: sc.hud.modal, free, n }; });
      ok(`${DEV}: reloaded with that book open: the card comes back (the hero free in ${e3.free} of ${e3.n} ticks)`, e3.modal === 'end' && e3.free === 0, J(e3));
      const e4 = await ev(() => { const F = window.__F, sc = window.__v2.scene, S = F.safe(); let n = 0; while (n++ < 600 && !(F.M().end && F.M().end.ready)) F.tick(1, false); F.tap(S.vw / 2, S.vh / 2, 2); n = 0; while (n++ < 600 && sc.hud.screen !== 'chronicle') F.tick(1, false); F.tick(20); const scr = sc.hud.screen; F.closeBtn(); return { scr }; });
      let top = null; for (let i = 0; i < 60; i++) { top = await ev(() => { try { for (let k = 0; k < 20; k++) window.__game.tick(1 / 60); window.__game.render(); } catch { /* between scenes */ } return { top: window.__game.top?.constructor?.name ?? null, card: (() => { try { return JSON.parse(localStorage.getItem('bn.v2.save')).ch?.card ?? null; } catch { return null; } })(), why: (() => { try { return JSON.parse(localStorage.getItem('bn.v2.save')).why; } catch { return null; } })() }; }).catch(() => null); if (top && top.top === 'V2Chooser') break; await page.waitForTimeout(100); }
      ok(`${DEV}: the book closed by touch: the 3D chooser is on top (never the 2D title), the save says the card was dismissed`, e4.scr === 'chronicle' && !!top && top.top === 'V2Chooser' && top.card === true, J({ e4, top }));
    }
    if (want('oldpad')) {
      await open(84, '&v2ui=0');
      let top = null, seen = [], kind = await ev(() => window.__v2.scene.hudKind);
      for (let i = 0; i < 90; i++) { top = await ev(() => { try { for (let k = 0; k < 30; k++) window.__game.tick(1 / 60); window.__game.render(); } catch { /* between scenes */ } return window.__game.top?.constructor?.name ?? null; }).catch(() => null); if (top && !seen.includes(top)) seen.push(top); if (top === 'V2Chooser') break; await page.waitForTimeout(80); }
      ok(`${DEV}: with the built-in HUD of the old pad (v2ui=0) the ending leaves for the 3D chooser by itself, and no other scene is on top on the way`, kind === 'builtin' && top === 'V2Chooser' && seen.every((q) => q === 'V2Chooser' || /V2G|Game|Scene/.test(q)) && !seen.some((q) => /Title/i.test(q)), `hud ${kind} · scenes on top in turn: ${seen.join(' -> ')}`);
    }

    // ───────────── cost ─────────────
    if (want('cost')) {
      await open(84);
      const cost = await ev(() => {
        const F = window.__F, g = window.__game, sc = window.__v2.scene, out = {};
        const made = []; const dc = document.createElement.bind(document); document.createElement = (t, o) => { const el = dc(t, o); if (String(t).toLowerCase() === 'canvas') made.push(el); return el; };
        const OC = window.OffscreenCanvas; if (OC) window.OffscreenCanvas = function (w, h) { const c = new OC(w, h); made.push(c); return c; };
        const bytes = () => made.reduce((s, c) => s + c.width * c.height * 4, 0);
        const P = CanvasRenderingContext2D.prototype, names = ['drawImage', 'fillRect', 'fill', 'stroke', 'fillText', 'strokeText'], orig = {}, cnt = {}; let counting = false;
        for (const n of names) { orig[n] = P[n]; cnt[n] = 0; P[n] = function (...a) { if (counting) cnt[n]++; return orig[n].apply(this, a); }; }
        const calls = () => { for (const n of names) cnt[n] = 0; counting = true; g.tick(1 / 60); g.render(); counting = false; return names.map((n) => n + ' ' + cnt[n]).join(' · '); };
        const heap = (frames, each) => { for (let i = 0; i < 30; i++) { g.tick(1 / 60); g.render(); } gc(); gc(); const a = performance.memory.usedJSHeapSize; for (let i = 0; i < frames; i++) { if (each) each(i); g.tick(1 / 60); g.render(); } const b = performance.memory.usedJSHeapSize; return Math.round((b - a) / frames); };
        sc.hud.openScreen('chronicle'); F.tick(60); sc.hud.closeScreen(); F.tick(20);   // (the ending's own card is kept waiting behind whatever is open)
        sc.hud.openPause({}); F.tick(30); out.base = { alloc: heap(300), calls: calls() }; sc.hud.closePause(); F.tick(10);
        const b0 = bytes();
        for (const kind of ['chronicle', 'bag', 'shop']) {
          const b1 = bytes(); if (!sc.hud.openScreen(kind, kind === 'shop' ? { shop: 'rook' } : undefined)) { out[kind] = { err: 'did not open' }; continue; } F.tick(90);
          const o = { still: heap(300), calls: calls() }; const m = F.M().screen;
          if (m.max > 0) { const cx = m.list.x + m.list.w * 0.3, y0 = m.list.y + m.list.h / 2, c0 = F.toClient(cx, y0); F.fire('pointerdown', 88, c0[0], c0[1]); F.tick(2, false); o.scroll = heap(300, (i) => { const k = (i % 120) / 120, c = F.toClient(cx, y0 - Math.sin(k * Math.PI * 2) * m.list.h * 0.45); F.fire('pointermove', 88, c[0], c[1]); }); F.fire('pointerup', 88, c0[0], c0[1]); F.rest(); o.scrollMax = Math.round(m.max); }
          o.bytes = bytes() - b1; o.baked = F.M().screen.baked; out[kind] = o; sc.hud.closeScreen(); F.tick(20);
        }
        out.bytesAll = bytes() - b0; out.canvases = made.length;
        document.createElement = dc; if (OC) window.OffscreenCanvas = OC; for (const n of names) P[n] = orig[n];
        return out; });
      say(`${DEV} cost (whole frame = game tick + render; the pause panel open is the base): base ${J(cost.base)}`);
      for (const k of ['chronicle', 'bag', 'shop']) say(`${DEV} cost ${k}: ${J(cost[k])}`);
      say(`${DEV} cost: canvases baked by the three screens ${(cost.bytesAll / 1048576).toFixed(1)} MB of pixels`);
      const lim = 64;
      ok(`${DEV}: with a screen open and still a frame allocates no more than the frame with the pause panel open (+${lim} B)`, ['chronicle', 'bag', 'shop'].every((k) => !cost[k].err && cost[k].still <= cost.base.alloc + lim), `base ${cost.base.alloc} B/frame · book ${cost.chronicle.still} · bag ${cost.bag.still} · shop ${cost.shop.still}${cost.chronicle.scroll !== undefined ? ' · book while dragged ' + cost.chronicle.scroll + ' (the test\'s own pointer events included)' : ''}`);
      // the game's own frame with every card and chip up
      await open(33);
      const fr = await ev(() => { const F = window.__F, g = window.__game, sc = window.__v2.scene, M = sc.host.model; F.tick(60);
        const run = (n, each) => { const a = []; for (let i = 0; i < n; i++) { if (each) each(i); g.tick(1 / 60); const t0 = performance.now(); g.render(); a.push(performance.now() - t0); } a.sort((x, y) => x - y); const hs = sc.hud.stats(); return { med: +a[n >> 1].toFixed(2), p95: +a[Math.floor(n * 0.95)].toFixed(2), hud: +hs.drawMs.avg.toFixed(3), hudMax: +hs.drawMs.max.toFixed(2) }; };
        const plain = run(240); M.dr = 2; M.wrote(); M.touch();
        const full = run(240, (i) => { if (i % 60 === 0) { sc.hud.card('item', { name: '낡은 은 열쇠', icon: 'key_silver', n: 1 }); sc.hud.card('chronicle', { id: 'graveyard_key', title: '묘지 문 열쇠' }); sc.hud.card('note', { text: '성수가 쓰였다 — 촛불 한 자루로 버틴다', icon: 'draught' }); } });
        const up = F.M().cards.up.length, chip = !!F.M().cards.chip; M.dr = 0; M.touch(); return { plain, full, up, chip }; });
      ok(`${DEV}: the game's frame with three cards, the chip and the draught mark up is not slower than without (render median within 1 ms, HUD draw within 0.5 ms on this machine)`, fr.up >= 1 && fr.chip && fr.full.med <= fr.plain.med + 1 && fr.full.hud <= fr.plain.hud + 0.5, J(fr));
    }
    await ctx.close();
  }
} finally { await browser.close(); srv.close?.(); }
for (const e of errs) console.log('PAGE ERROR ' + e);
console.log(`\n${fails || errs.length ? 'FAILED' : 'OK'}: ${passes} passed, ${fails} failed, page errors ${errs.length}`);
if (fails) console.log('failed:\n  ' + failed.join('\n  '));
process.exit(fails || errs.length ? 1 : 0);
