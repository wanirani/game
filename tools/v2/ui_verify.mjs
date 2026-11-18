// UI-VERIFY lane: adversarial checks of the v2 interface (src/v2/ui) inside the REAL game scene, with real touch events.
//   node tools/v2/ui_verify.mjs [--devices fold_open,phone2] [--out /tmp/claude-0/v2/uiverify] [--reenter 5] [--skip stress,reenter]
// Opens index.html?scene=v2g&v2ui=1 (the opt-in switch of src/v2/game/seams.js), so no file of another lane is edited.
// Parts: wiring · every button (tap, hold, slide off, slide over, two and three fingers with the stick) · text sizes ·
// resize / rotate · simulated safe-area insets · pause · dialogue · stress (long names, 16 candles, boss + banners + toasts,
// rapid numbers) · per-frame blur / canvas creation counters · scene exit and re-entry (DOM nodes, canvases, listeners, heap).
// Headless Chromium has no GPU: every time printed here is a software-raster figure, not the device's.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(','), OUT = String(args.out || '/tmp/claude-0/v2/uiverify');
const SKIP = new Set(String(args.skip || '').split(',')), REENTER = Number(args.reenter ?? 5);
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'];
fs.mkdirSync(OUT, { recursive: true });
const fails = [], notes = [], report = {};
let passN = 0;
const ok = (c, m) => { if (c) passN++; else { fails.push(m); console.log('  FAIL ' + m); } return !!c; };
const note = (m) => { notes.push(m); console.log('  note ' + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 8300 + Math.floor(Math.random() * 500), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });

async function openGame(dev, q = 'scene=v2g&v2ui=1&area=slice0&v2auto=0') {   // the test route (the default area is eshville_now), fixed render size
  const ctx = await browser.newContext(contextOptions(dev)), page = await ctx.newPage(); page._errs = [];
  page.on('pageerror', (e) => page._errs.push('pageerror: ' + String(e.message).slice(0, 240)));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /v2ui|\[v2g\]|hud/i.test(m.text()))) page._errs.push(m.type() + ': ' + m.text().slice(0, 240)); });
  await page.goto(`http://localhost:${port}/index.html?${q}&nosw`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 90000 }).catch(() => page._errs.push('scene ready timeout'));
  const client = await ctx.newCDPSession(page);
  return { ctx, page, client };
}
function toucher(client) {
  const pts = new Map();
  const send = (type) => client.send('Input.dispatchTouchEvent', { type, touchPoints: [...pts].map(([id, p]) => ({ x: p[0], y: p[1], id })) });
  return {
    async down(id, x, y) { pts.set(id, [x, y]); await send('touchStart'); },
    async move(id, x, y) { pts.set(id, [x, y]); await send('touchMove'); },
    // CDP: touchEnd takes no points and lifts every finger; to lift one of several, send the remaining ones as a move
    async up(id) { pts.delete(id); if (pts.size) await send('touchMove'); else await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); },
    async cancel() { pts.clear(); await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); },
  };
}
const M = (page) => page.evaluate(() => { const sc = window.__v2.scene, g = window.__game, m = sc.hud.metrics(); return { ...m, win: { w: innerWidth, h: innerHeight }, rect: g.canvasRect, css: g.cssScale, safeCss: g.safeCss, mode: g.input.mode, hudKind: sc.hudKind, padShown: m.pad?.shown, v2pads: document.querySelectorAll('#v2pad').length }; });
const logOf = (page) => page.evaluate(() => window.__vl.splice(0));
const downs = (page, list) => page.evaluate((l) => l.map((a) => !!window.__game.input.down(a)), list);
const ACT = { attack: ['attack'], jump: ['jump'], roll: ['dash', 'guard'], skill: ['skill1'], bell: ['ult'], lock: ['lock'] };
const ALL_ACTS = ['attack', 'jump', 'dash', 'guard', 'skill1', 'ult', 'lock', 'left', 'right', 'up', 'down'];

function geometry(tag, m) {
  const P = m.pad, B = P.buttons, W = m.win; let minGap = 1e9, minD = 1e9;
  for (const b of B) {
    const r = b.d / 2, L = b.labelRect; minD = Math.min(minD, b.d);
    ok(b.d >= 44, `${tag}: ${b.id} is ${b.d} px (< 44)`);
    ok(b.cx - r >= 0 && b.cx + r <= W.w && b.cy - r >= 0 && L.y + L.h <= W.h + 0.5 && L.x >= 0 && L.x + L.w <= W.w, `${tag}: ${b.id} (circle or label) leaves the window ${JSON.stringify({ cx: b.cx, cy: b.cy, d: b.d, L })}`);
    for (const o of B) { if (o === b) continue; const gap = Math.hypot(o.cx - b.cx, o.cy - b.cy) - r - o.d / 2; minGap = Math.min(minGap, gap); ok(gap >= 6, `${tag}: ${b.id} and ${o.id} are ${gap.toFixed(1)} px apart`); }
  }
  return { minGap: +minGap.toFixed(1), minD };
}

for (const dev of DEVICES) {
  console.log(`[${dev}] live v2g + src/v2/ui`);
  const R = (report[dev] = {});
  const { ctx, page, client } = await openGame(dev);
  const T = toucher(client);
  const shot = (name) => page.screenshot({ path: `${OUT}/${dev}_${name}.png` });
  try {
    await page.waitForFunction(() => window.__v2?.scene?.hudKind === 'ui' && window.__v2.scene.hud.ready, null, { timeout: 30000 }).catch(() => {});
    if (args.tough) await page.evaluate(() => { window.__tough = true; });
    // instrumentation: input log, canvas pointerdown counter, per-frame blur / filter / canvas creation counters
    await page.evaluate(() => {
      window.__vl = []; const T = window.__game.input.touch;
      for (const k of ['set', 'tap', 'axis']) { const f = T[k].bind(T); T[k] = (...a) => { if (k !== 'axis' || a[0] || a[1]) window.__vl.push([k, ...a.map((v) => (typeof v === 'number' ? +v.toFixed(2) : v))]); return f(...a); }; }
      window.__gap = { max: 0, n: 0, over450: 0, last: performance.now() }; (function raf() { const now = performance.now(), d = now - window.__gap.last; window.__gap.last = now; window.__gap.n++; if (d > window.__gap.max) window.__gap.max = d; if (d > 450) window.__gap.over450++; requestAnimationFrame(raf); })();
      window.__cvDown = 0; window.__game.canvas.addEventListener('pointerdown', () => { window.__cvDown++; });
      const proto = CanvasRenderingContext2D.prototype; window.__cnt = { sb: 0, fl: 0, cv: 0, gid: 0 };
      const d1 = Object.getOwnPropertyDescriptor(proto, 'shadowBlur'); Object.defineProperty(proto, 'shadowBlur', { get() { return d1.get.call(this); }, set(v) { if (v > 0) window.__cnt.sb++; d1.set.call(this, v); } });
      const d2 = Object.getOwnPropertyDescriptor(proto, 'filter'); if (d2) Object.defineProperty(proto, 'filter', { get() { return d2.get.call(this); }, set(v) { if (v && v !== 'none') window.__cnt.fl++; d2.set.call(this, v); } });
      const ce = document.createElement.bind(document); document.createElement = (t, ...a) => { if (String(t).toLowerCase() === 'canvas') window.__cnt.cv++; return ce(t, ...a); };
      const gi = proto.getImageData; proto.getImageData = function (...a) { window.__cnt.gid++; return gi.apply(this, a); };
    });
    // the first touch switches the game to touch mode (a neutral spot: top centre)
    let m = await M(page);
    await T.down(1, m.win.w * 0.5, 20); await T.up(1); await sleep(500);
    m = await M(page);
    ok(m.hudKind === 'ui', `${dev}: scene runs the UI lane's HUD (hudKind ${m.hudKind})`);
    ok(m.mode === 'touch' && m.padShown, `${dev}: touch mode shows the v2 pad (mode ${m.mode}, shown ${m.padShown})`);
    ok(m.v2pads === 1, `${dev}: exactly one #v2pad (${m.v2pads})`);
    // the v1 pad is a canvas layer whose only owner is game.syncPad (game.padShown); its DOM box stays in the page
    const v1 = await page.evaluate(() => ({ padShown: window.__game.padShown, hidePad: window.__v2.scene.hidePad, showPad: window.__v2.scene.showPad }));
    ok(v1.padShown === false && v1.hidePad === true, `${dev}: v1 pad is hidden (${JSON.stringify(v1)})`);
    const filt = await page.evaluate(() => [...document.querySelectorAll('#v2pad, #v2pad *')].map((e) => { const s = getComputedStyle(e); return [s.backdropFilter || s.webkitBackdropFilter || 'none', s.filter, s.boxShadow]; }).filter((a) => a[0] !== 'none' || a[1] !== 'none' || a[2] !== 'none'));
    ok(filt.length === 0, `${dev}: no backdrop-filter / filter / box-shadow on the pad layer (${JSON.stringify(filt.slice(0, 2))})`);
    R.geometry = geometry(`${dev}/normal`, m);
    await sleep(400); await shot('live_idle');

    // ── every button: tap, hold, slide off ──
    const B = Object.fromEntries(m.pad.buttons.map((b) => [b.id, b]));
    if (!SKIP.has('input')) {   // --skip input,stress,reenter = only the wiring and the fight capture
    await logOf(page);
    for (const id of Object.keys(ACT)) {
      const b = B[id], acts = ACT[id];
      const cv0 = await page.evaluate(() => window.__cvDown);
      await T.down(1, b.cx, b.cy); await sleep(60); await T.up(1); await sleep(120);
      let lg = await logOf(page);
      ok(acts.every((a) => lg.some((e) => (e[0] === 'set' && String(e[1]).split(',').includes(a) && e[2] === true))), `${dev}: tap ${id} presses ${acts} (${JSON.stringify(lg)})`);
      ok(acts.every((a) => lg.some((e) => (e[0] === 'set' && String(e[1]).split(',').includes(a) && e[2] === false))), `${dev}: tap ${id} releases ${acts}`);
      ok((await page.evaluate(() => window.__cvDown)) === cv0, `${dev}: tap on ${id} does not reach the game canvas`);
      // hold
      await T.down(1, b.cx + 3, b.cy - 2); await sleep(420);
      ok((await downs(page, acts)).every(Boolean), `${dev}: hold ${id} keeps ${acts} down`);
      // slide off into empty space (toward the screen centre): the press is kept until the finger lifts
      let ex = m.win.w * 0.5, ey = m.win.h * 0.45, found = false;
      for (let a = 0; a < 24 && !found; a++) {   // a direction whose whole path is clear of the other buttons and inside the window
        const ang = -Math.PI / 2 - a * Math.PI / 12, tx = b.cx + Math.cos(ang) * (b.d / 2 + 30), ty = b.cy + Math.sin(ang) * (b.d / 2 + 30);
        if (tx < 4 || ty < 4 || tx > m.win.w - 4 || ty > m.win.h - 4) continue;
        let clear = true;
        for (let i = 1; i <= 8 && clear; i++) { const qx = b.cx + (tx - b.cx) * i / 8, qy = b.cy + (ty - b.cy) * i / 8; for (const o of m.pad.buttons) if (o.id !== b.id && Math.hypot(qx - o.cx, qy - o.cy) < o.d / 2 + 9) clear = false; }
        if (clear) { ex = tx; ey = ty; found = true; }
      }
      for (let i = 1; i <= 4; i++) await T.move(1, b.cx + (ex - b.cx) * i / 4, b.cy + (ey - b.cy) * i / 4);
      await sleep(80);
      const still = (await downs(page, acts)).every(Boolean);
      await T.up(1); await sleep(120);
      ok(!(await downs(page, ALL_ACTS)).some(Boolean), `${dev}: after ${id} slide-off + lift nothing stays down`);
      if (id === 'attack') R.slideOffKeepsPress = still;
      ok(still || !found, `${dev}: ${id} stays pressed while the finger slides off it (until it lifts)`); if (!found) note(`${dev}: ${id} has no clear slide-off path (boxed in) - slide-off not asserted`);
      await logOf(page);
    }
    // slide from attack to jump: attack is cancelled, jump pressed
    await T.down(1, B.attack.cx, B.attack.cy); await sleep(80);
    for (let i = 1; i <= 5; i++) await T.move(1, B.attack.cx + (B.jump.cx - B.attack.cx) * i / 5, B.attack.cy + (B.jump.cy - B.attack.cy) * i / 5);
    await sleep(100);
    let d = await downs(page, ['attack', 'jump']);
    ok(!d[0] && d[1], `${dev}: slide attack -> jump moves the press (attack ${d[0]}, jump ${d[1]})`);
    await T.up(1); await sleep(100);
    // stick + attack + jump (three fingers), released in a different order
    const z = m.pad.stick.zone, sx = z.x + z.w * 0.4, sy = z.y + z.h * 0.7;
    const hx0 = await page.evaluate(() => window.__v2.hero.x);
    await T.down(1, sx, sy); for (let i = 1; i <= 6; i++) await T.move(1, sx + i * 12, sy); await sleep(150);
    let vec = await page.evaluate(() => { const v = window.__game.input.touchStick ?? window.__game.input._touchVec; return { x: v.x, y: v.y, mag: v.mag }; });
    R.rafGapInput = await page.evaluate(() => ({ maxMs: Math.round(window.__gap.max), frames: window.__gap.n, over450: window.__gap.over450 }));
    ok(vec.x > 0.6 && Math.abs(vec.y) < 0.3, `${dev}: stick right gives x>0.6 (${JSON.stringify(vec)}, frame gaps ${JSON.stringify(R.rafGapInput)})`);
    await T.down(2, B.attack.cx, B.attack.cy); await sleep(120);
    await T.down(3, B.jump.cx, B.jump.cy); await sleep(150);
    d = await downs(page, ['attack', 'jump']);
    vec = await page.evaluate(() => { const v = window.__game.input.touchStick ?? window.__game.input._touchVec; return { x: v.x, mag: v.mag }; });
    ok(d[0] && d[1] && vec.x > 0.6, `${dev}: stick + attack + jump together (attack ${d[0]}, jump ${d[1]}, stick ${vec.x})`);
    await T.up(3); await T.up(2); await T.up(1); await sleep(700);
    ok(!(await downs(page, ALL_ACTS)).some(Boolean), `${dev}: all fingers up -> nothing down`);
    const hx1 = await page.evaluate(() => window.__v2.hero.x);
    ok(hx1 > hx0 + 4, `${dev}: the stick moved the hero (${hx0.toFixed(0)} -> ${hx1.toFixed(0)})`);
    // release order, one finger at a time. CDP touch can only lift all fingers at once, so this part uses synthetic
    // pointer events (pointerType touch) on window - the same events the pad listens to.
    const syn = (type, id, x, y) => page.evaluate(([t, i, px, py]) => { window.dispatchEvent(new PointerEvent(t, { pointerId: i, pointerType: 'touch', clientX: px, clientY: py, bubbles: true, cancelable: true })); }, [type, id, x, y]);
    await syn('pointerdown', 101, sx, sy); await syn('pointermove', 101, sx + 70, sy); await syn('pointerdown', 102, B.attack.cx, B.attack.cy); await syn('pointerdown', 103, B.jump.cx, B.jump.cy); await sleep(120);
    await syn('pointerup', 101, sx + 70, sy); await sleep(120);
    d = await downs(page, ['attack', 'jump', 'right']);
    ok(d[0] && d[1] && !d[2], `${dev}: lifting the stick finger keeps the buttons (attack ${d[0]}, jump ${d[1]}, right ${d[2]})`);
    await syn('pointerup', 103, B.jump.cx, B.jump.cy); await sleep(100);
    d = await downs(page, ['attack', 'jump']);
    ok(d[0] && !d[1], `${dev}: lifting jump keeps attack (attack ${d[0]}, jump ${d[1]})`);
    await syn('pointerdown', 104, sx, sy); await syn('pointermove', 104, sx - 70, sy); await sleep(100);   // the stick is taken again while attack is still held
    d = await downs(page, ['attack', 'left']);
    ok(d[0] && d[1], `${dev}: stick can be taken again while attack is held (attack ${d[0]}, left ${d[1]})`);
    await syn('pointerup', 102, B.attack.cx, B.attack.cy); await syn('pointerup', 104, sx - 70, sy); await sleep(150);
    ok(!(await downs(page, ALL_ACTS)).some(Boolean), `${dev}: synthetic fingers all up -> nothing down`);
    // a long frame (main thread blocked 800 ms) while the stick and attack are held: the pad must not drop them
    await T.down(1, sx, sy); for (let i = 1; i <= 6; i++) await T.move(1, sx + i * 12, sy); await T.down(2, B.attack.cx, B.attack.cy); await sleep(200);
    await page.evaluate(() => { const t = performance.now(); while (performance.now() - t < 800); }); await sleep(350);
    d = await downs(page, ['attack']);
    vec = await page.evaluate(() => { const v = window.__game.input.touchStick ?? window.__game.input._touchVec; return { x: v.x, shown: window.__v2.scene.hud.metrics().pad.shown }; });
    ok(d[0] && vec.x > 0.6 && vec.shown, `${dev}: an 800 ms hitch keeps the held stick and attack (attack ${d[0]}, stick ${vec.x}, pad shown ${vec.shown})`);
    await T.up(2); await T.up(1); await sleep(300);
    ok(!(await downs(page, ALL_ACTS)).some(Boolean), `${dev}: after the hitch test nothing stays down`);
    // touchcancel (system gesture) while holding: nothing may stay pressed
    await page.evaluate(() => { window.__pc = 0; window.addEventListener('pointercancel', () => { window.__pc++; }, true); });
    await T.down(1, B.attack.cx, B.attack.cy); await T.down(2, sx, sy); await T.move(2, sx + 50, sy); await sleep(80); await T.cancel(); await sleep(200);
    let dn = await downs(page, ALL_ACTS); const pcN = await page.evaluate(() => window.__pc);
    R.touchCancel = { pointercancelEvents: pcN, stillDown: ALL_ACTS.filter((a, i) => dn[i]) };
    if (pcN >= 2) ok(!dn.some(Boolean), `${dev}: touchcancel releases everything (still down: ${R.touchCancel.stillDown})`);
    else { note(`${dev}: CDP touchCancel produced ${pcN} pointercancel event(s) in the page - real cancel not testable this way, synthetic pointercancel used instead`); await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {}); await sleep(150); }
    await syn('pointerdown', 106, B.attack.cx, B.attack.cy); await syn('pointerdown', 107, sx, sy); await syn('pointermove', 107, sx + 60, sy); await sleep(80);
    await syn('pointercancel', 106, B.attack.cx, B.attack.cy); await syn('pointercancel', 107, sx + 60, sy); await sleep(150);
    dn = await downs(page, ALL_ACTS);
    ok(!dn.some(Boolean), `${dev}: pointercancel on both fingers releases everything (still down: ${ALL_ACTS.filter((a, i) => dn[i])})`);
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(100);

    // ── text sizes ──
    for (const ts of ['large', 'xlarge', 'normal']) {
      await page.evaluate((t) => { const g = window.__game; g.settings.textSize = t; window.__v2.scene.resize(); }, ts); await sleep(450);
      const mm = await M(page), gg = geometry(`${dev}/${ts}`, mm);
      R['text_' + ts] = { labelPx: mm.pad.labelPx, ...gg };
      if (ts === 'xlarge') await shot('live_xlarge');
    }
    // ── resize / rotate ──
    const base = page.viewportSize();
    for (const [w, h, tag] of [[968, 410, 'cover'], [base.height, base.width, 'portrait'], [base.width, base.height, 'back']]) {
      if (tag === 'portrait') { await T.down(1, B.attack.cx, B.attack.cy); await sleep(60); }   // a finger is down while the screen turns
      await page.setViewportSize({ width: w, height: h }); await sleep(900);
      if (tag === 'portrait') { await T.up(1); await sleep(100); ok(!(await downs(page, ALL_ACTS)).some(Boolean), `${dev}: rotate with a finger down leaves nothing pressed`); }
      const mm = await M(page);
      if (mm.padShown) { const gg = geometry(`${dev}/resize-${tag}`, mm); R['resize_' + tag] = { ...gg, win: mm.win, rect: mm.rect }; const bd = mm.pad.bounds; ok(bd.r <= mm.rect.x + mm.rect.w + 0.6 && bd.b <= mm.rect.y + mm.rect.h + 0.6 && bd.l >= mm.rect.x - 0.6, `${dev}: pad bounds follow the canvas after resize-${tag} (${JSON.stringify(bd)} vs ${JSON.stringify(mm.rect)})`); }
      else R['resize_' + tag] = { padShown: false, win: mm.win };
      if (tag !== 'back') await shot('resize_' + tag);
    }
    // ── simulated safe-area insets (CSS px l,t,r,b = 44,0,34,21) ──
    const ins = await page.evaluate(() => {
      const g = window.__game, sc = window.__v2.scene, keep = [g.safeCss, g.safe], c = g.cssScale;
      g.safeCss = { l: 44, t: 0, r: 34, b: 21 }; g.safe = { l: 44 / c, t: 0, r: 34 / c, b: 21 / c }; sc.resize();
      return new Promise((res) => setTimeout(() => { const m = sc.hud.metrics(); g.safeCss = keep[0]; g.safe = keep[1]; sc.resize(); res({ bounds: m.pad.bounds, buttons: m.pad.buttons, w: innerWidth, h: innerHeight }); }, 350));
    });
    for (const b of ins.buttons) { const r = b.d / 2, L = b.labelRect; ok(b.cx - r >= 44 - 0.5 && b.cx + r <= ins.w - 34 + 0.5 && L.y + L.h <= ins.h - 21 + 0.5 && L.x + L.w <= ins.w - 34 + 0.5, `${dev}: with insets ${b.id} stays inside the safe area`); }
    await sleep(400);

    // ── pause ──
    m = await M(page); const pb = m.pad.buttons.find((b) => b.id === 'pause');
    await T.down(1, B.attack.cx, B.attack.cy); await sleep(60);                 // one finger holds attack while another taps pause
    await syn('pointerdown', 105, pb.cx, pb.cy); await sleep(60); await syn('pointerup', 105, pb.cx, pb.cy); await sleep(450);
    let st = await page.evaluate(() => { const sc = window.__v2.scene; return { modal: sc.hud.modal, t: sc.sim.time, shown: sc.hud.metrics().pad.shown, rows: sc.hud.metrics().pause?.rows, css: window.__game.cssScale, rect: window.__game.canvasRect, vw: window.__game.viewW, vh: window.__game.viewH }; });
    ok(st.modal === 'pause' && !st.shown, `${dev}: pause button opens the pause menu and hides the pad (${st.modal}, pad ${st.shown})`);
    await T.up(1); await sleep(500);
    const t2 = await page.evaluate(() => window.__v2.scene.sim.time);
    ok(Math.abs(t2 - st.t) < 1e-6, `${dev}: rules are frozen while paused (${st.t} -> ${t2})`);
    await shot('live_pause');
    const toCss = (lx, ly) => [st.rect.x + (lx / st.vw) * st.rect.w, st.rect.y + (ly / st.vh) * st.rect.h];
    let rows = st.rows ?? (await page.evaluate(() => window.__v2.scene.hud.metrics().pause?.rows));
    ok(!!rows && rows.every((r) => r.h * st.css >= 44), `${dev}: pause rows are >= 44 CSS px (${rows?.map((r) => (r.h * st.css).toFixed(0))})`);
    await T.down(1, 12, st.rect.h - 12); await T.up(1); await sleep(250);         // a tap outside the rows keeps it open
    ok((await page.evaluate(() => window.__v2.scene.hud.modal)) === 'pause', `${dev}: tap outside the rows keeps the pause menu`);
    let [px0, py0] = toCss(rows[0].x + rows[0].w / 2, rows[0].y + rows[0].h / 2);
    await T.down(1, px0, py0); await T.up(1); await sleep(600);
    st = await page.evaluate(() => { const sc = window.__v2.scene; return { modal: sc.hud.modal, shown: sc.hud.metrics().pad.shown, t: sc.sim.time, held: window.__game.input.down('attack') }; });
    ok(st.modal === null && st.shown && !st.held, `${dev}: "resume" closes the menu, pad back, attack not stuck (${JSON.stringify(st)})`);
    await sleep(400);
    ok((await page.evaluate(() => window.__v2.scene.sim.time)) > st.t, `${dev}: rules run again after resume`);

    // ── dialogue: long speaker name, three pages, two choices ──
    await page.evaluate(() => {
      window.__dlg = [];
      window.__v2.scene.hud.showDialog({ speaker: '배웅의 납골당을 지키는 늙은 종지기 알베르토 신부', portrait: 'alberto', text: '종이 울리면 그 밤으로 건너가네. 돌아올 길은 종소리가 닿는 데까지일세. '.repeat(7) + '\n촛불을 아끼게, 사냥꾼.', choices: ['건넌다 — 종이 식기 전에 반드시 돌아오겠다', '아직 아니다'], onChoice(i) { window.__dlg.push(i); } });
    });
    await sleep(500);
    st = await page.evaluate(() => { const sc = window.__v2.scene, i = sc.hud.metrics(); return { modal: sc.hud.modal, shown: i.pad.shown, dlg: i.dialog, vw: window.__game.viewW, vh: window.__game.viewH }; });
    ok(st.modal === 'dialog' && !st.shown, `${dev}: dialogue opens and hides the pad`);
    ok(st.dlg && st.dlg.pages >= 2, `${dev}: long text is split into pages (${st.dlg?.pages})`);
    ok(st.dlg && st.dlg.box.x >= 0 && st.dlg.box.x + st.dlg.box.w <= st.vw && st.dlg.box.y + st.dlg.box.h <= st.vh && st.dlg.box.top >= 0, `${dev}: dialogue box inside the view (${JSON.stringify(st.dlg?.box)})`);
    await sleep(700); await shot('dialog_long');
    const cv1 = await page.evaluate(() => window.__cvDown);
    for (let i = 0; i < 12; i++) {   // tap where the attack button was: it must only turn pages, never attack
      const s2 = await page.evaluate(() => { const d = window.__v2.scene.hud.metrics().dialog; return d ? { page: d.page, pages: d.pages, shown: d.shown, total: d.total } : null; });
      if (!s2 || (s2.page === s2.pages - 1 && s2.shown >= s2.total)) break;
      await T.down(1, B.attack.cx, B.attack.cy); await sleep(40); await T.up(1); await sleep(220);
    }
    ok(!(await downs(page, ['attack']))[0] && (await page.evaluate(() => window.__cvDown)) === cv1, `${dev}: taps during a dialogue do not attack and do not reach the canvas`);
    st = await page.evaluate(() => { const sc = window.__v2.scene, i = sc.hud.metrics(); return { dlg: i.dialog, css: window.__game.cssScale, rect: window.__game.canvasRect, vw: window.__game.viewW, vh: window.__game.viewH }; });
    ok(st.dlg && st.dlg.page === st.dlg.pages - 1 && st.dlg.choiceRects.length === 2, `${dev}: last page shows two choices (${JSON.stringify(st.dlg && { page: st.dlg.page, pages: st.dlg.pages })})`);
    if (st.dlg) {
      for (const r of st.dlg.choiceRects) ok(r.x >= 0 && r.x + r.w <= st.vw && r.y >= 0 && r.h * st.css >= 44, `${dev}: choice box inside the view and >= 44 px (${JSON.stringify(r)}, view ${st.vw})`);
      await sleep(300); await shot('dialog_choice');
      const r = st.dlg.choiceRects[1], cx = st.rect.x + ((r.x + r.w / 2) / st.vw) * st.rect.w, cy = st.rect.y + ((r.y + r.h / 2) / st.vh) * st.rect.h;
      await T.down(1, cx, cy); await T.up(1); await sleep(400);
      const res = await page.evaluate(() => ({ dlg: window.__dlg, modal: window.__v2.scene.hud.modal, shown: window.__v2.scene.hud.metrics().pad.shown }));
      ok(res.dlg.length === 1 && res.dlg[0] === 1 && res.modal === null, `${dev}: tapping the second choice calls onChoice(1) once and closes (${JSON.stringify(res)})`);
    }
    await sleep(300);
    // a normal short dialogue for the owner sheet
    await page.evaluate(() => { window.__v2.scene.hud.showDialog({ speaker: '엘리제', portrait: 'elise', text: '종이 울리면 그 밤으로 건너가요. 돌아올 길은 종소리가 닿는 데까지예요.\n촛불을 아끼세요, 사냥꾼.' }); });
    await sleep(2600); await shot('live_dialog');
    await page.evaluate(() => window.__v2.scene.hud.closeDialog()); await sleep(300);

    // ── per-frame counters in steady play (no blur, no filter, no new canvas, no read-back) ──
    await page.evaluate(() => { const c = window.__cnt; c.sb = c.fl = c.cv = c.gid = 0; window.__f0 = window.__game.frame ?? 0; window.__t0 = performance.now(); });
    await sleep(3000);
    R.steady = await page.evaluate(() => ({ ...window.__cnt, ms: Math.round(performance.now() - window.__t0), hud: window.__v2.scene.hud.stats() }));
    ok(R.steady.fl === 0, `${dev}: no canvas filter is ever set (${R.steady.fl})`);
    ok(R.steady.sb === 0 && R.steady.cv === 0 && R.steady.gid === 0, `${dev}: steady play sets no shadow blur, creates no canvas, reads no pixels (${JSON.stringify({ sb: R.steady.sb, cv: R.steady.cv, gid: R.steady.gid })})`);

    }
    // ── fight: walk into the nearest enemy, lock on, attack (real buttons) ──
    await page.evaluate(() => { const sim = window.__v2.scene.sim, h = sim.hero; let best = null, bd = 1e9; for (const e of sim.enemies) { if (e.dead) continue; const dd = Math.hypot(e.x - h.x, e.z - h.z); if (dd < bd) { bd = dd; best = e; } } if (best) { h.x = best.x - 70; h.z = best.z; window.__v2.scene.cam.snap = true; if (window.__tough) { best.hpMax = 5000; best.hp = 5000; } window.__best = best.id; } });
    await sleep(600);
    await T.down(1, B.lock.cx, B.lock.cy); await sleep(60); await T.up(1); await sleep(200);
    let gotNum = false;
    for (let i = 0; i < 14 && !gotNum; i++) { await T.down(1, B.attack.cx, B.attack.cy); await sleep(90); await T.up(1); await sleep(260); gotNum = await page.evaluate(() => window.__v2.scene.numbers.some((n) => n.on && n.t < 0.5)); }
    R.fight = await page.evaluate(() => ({ lock: window.__v2.scene.sim.hero.lock ?? null, hp: window.__v2.hero.hp, numbers: window.__v2.scene.numbers.filter((n) => n.on).length }));
    ok(gotNum, `${dev}: attacking a real enemy with the attack button shows damage numbers (${JSON.stringify(R.fight)})`);
    ok(R.fight.lock != null, `${dev}: the lock button locks on (${R.fight.lock})`);
    await page.evaluate(() => { const sc = window.__v2.scene, h = sc.sim.hero; sc.hud.callout(h.x + 40, 90, h.z, '튕겨냄', 'parry'); });
    await page.evaluate(() => { const N = window.__v2.scene.numbers; window.__keep = setInterval(() => { let k = 0; for (const n of N) if (n.on) { const cap = 0.16 + 0.15 * (k++ % 4); if (n.t > cap) n.t = cap; } }, 16); });   // the numbers of the last real hits stay up for the capture
    for (let i = 0; i < 3; i++) { await T.down(1, B.attack.cx, B.attack.cy); await sleep(90); await T.up(1); await sleep(300); }
    // make sure the capture shows a lock ring on a living enemy: press "next target" until the locked enemy is alive and on screen
    for (let i = 0; i < 4; i++) {
      const good = await page.evaluate(() => { const sc = window.__v2.scene, id = sc.sim.hero.lock; if (id == null) return false; const e = sc.sim.enemies.find((q) => q.id === id); if (!e || e.dead || e.state === 'dead') return false; const p = sc.project(e.x, e.y + 40, e.z, {}); return p.w > 1 && p.x > 60 && p.x < window.__game.viewW - 60 && p.y > 60 && p.y < window.__game.viewH - 60; });
      if (good) break;
      if (i === 3) { await page.evaluate(() => { if (window.__best != null) window.__v2.scene.sim.hero.lock = window.__best; }); note(`${dev}: lock ring for the capture set directly (the lock button did not land on the staged enemy)`); break; }
      await T.down(1, B.lock.cx, B.lock.cy); await sleep(60); await T.up(1); await sleep(250);
    }
    await T.down(1, B.attack.cx, B.attack.cy); await sleep(90); await T.up(1); await sleep(200);
    await page.evaluate(() => { const sc = window.__v2.scene, h = sc.sim.hero; sc.hud.callout(h.x + 40, 90, h.z, '튕겨냄', 'parry'); });
    await sleep(150); await shot('live_fight');
    R.fightShot = await page.evaluate(() => ({ lock: window.__v2.scene.sim.hero.lock ?? null, numbersOn: window.__v2.scene.numbers.filter((n) => n.on).map((n) => n.str) }));
    await page.evaluate(() => clearInterval(window.__keep));

    if (!SKIP.has('stress')) {
      // ── stress: 16 candles, long boss name, banners, three long toasts, rapid numbers ──
      await page.evaluate(() => {
        const sc = window.__v2.scene, s = sc.state, hud = sc.hud;
        s.candles = { lit: 11.4, max: 16 }; s.resonance = { value: 5, cells: 5 }; s.moon = { phase: 1 };
        s.boss = { name: '밴시 여왕', sub: '배웅의 납골당', hp: 640, hpMax: 1000, stagger: 0.45 };
        s.prompts = [{ action: 'confirm', label: '종을 살핀다' }];
      });
      await sleep(500); await shot('live_boss');
      await page.evaluate(() => {
        const sc = window.__v2.scene, s = sc.state, hud = sc.hud;
        s.boss = { name: '울부짖는 밤의 통곡하는 밴시 여왕 에스메랄다 폰 그라우엔슈타인', sub: '배웅의 납골당 가장 깊은 곳', hp: 640, hpMax: 1000, stagger: 0.45 };
        s.section.label = '배웅의 납골당으로 내려가는 길고 어두운 돌계단';
        hud.banner('area', '안개가 걷히지 않는 오래된 묘지와 무너진 종탑 아래 마을', '오늘 밤 · 종이 울리기 전');
        hud.toast('은종 조각 ×2 그리고 아주 오래된 길종의 깨진 조각을 주웠다 — 주머니가 가득 찼다', { kind: 'item' });
        hud.toast('촛불이 한 자루 남았다', { kind: 'warn' }); hud.toast('길종이 울렸다', { kind: 'info' });
        s.prompts = [{ action: 'confirm', label: '종을 살핀다' }, { action: 'skill1', label: '채찍을 걸어 건너편 난간으로 넘어간다' }, { action: 'confirm', label: '문을 연다', x: sc.sim.hero.x + 60, y: 80, z: sc.sim.hero.z }];
        window.__spam = setInterval(() => { const N = sc.numbers, h = sc.sim.hero; for (let i = 0; i < N.length; i++) { const n = N[i]; n.on = true; n.t = Math.random() * 0.5; n.x = h.x + (Math.random() - 0.5) * 300; n.y = 40 + Math.random() * 80; n.z = h.z + (Math.random() - 0.5) * 80; n.str = String(Math.floor(Math.random() * 9999)); n.big = i % 4 === 0; n.color = i % 5 === 0 ? '#ff8a80' : '#fff'; } for (let i = 0; i < 4; i++) hud.callout(h.x + (Math.random() - 0.5) * 200, 90, h.z, i % 2 ? '튕겨냄' : '막음', i % 2 ? 'parry' : 'guard'); }, 50);
      });
      await sleep(900); await shot('stress');
      await page.evaluate(() => window.__v2.scene.hud.banner('night')); await sleep(900); await shot('stress_night');
      await page.evaluate(() => { const c = window.__cnt; c.sb = c.fl = c.cv = c.gid = 0; window.__t0 = performance.now(); });   // every slot has been baked once by now
      await sleep(2500);
      R.stress = await page.evaluate(() => { clearInterval(window.__spam); const sc = window.__v2.scene; return { hudKind: sc.hudKind, cnt: { ...window.__cnt }, ms: Math.round(performance.now() - window.__t0), hud: sc.hud.stats(), frameMs: window.__v2.stats.frameMs }; });
      ok(R.stress.hudKind === 'ui', `${dev}: HUD survived the stress state (hudKind ${R.stress.hudKind})`);
      ok(R.stress.cnt.cv === 0 && R.stress.cnt.fl === 0 && R.stress.cnt.gid === 0, `${dev}: after warm-up the number storm creates no canvas, sets no filter, reads no pixels (${JSON.stringify(R.stress.cnt)})`);
      note(`${dev}: number storm (16 numbers + 4 callouts re-baked every 50 ms): ${R.stress.cnt.sb} glow bakes (shadow blur on a small offscreen canvas) in ${R.stress.ms} ms; hud.draw avg ${R.stress.hud.drawMs.avg.toFixed(2)} p95 ${R.stress.hud.drawMs.p95.toFixed(1)} max ${R.stress.hud.drawMs.max.toFixed(1)} ms`);
      await page.evaluate(() => { const s = window.__v2.scene.state; s.boss = null; s.prompts = null; s.candles = undefined; s.resonance = undefined; s.moon = undefined; });
    }

    if (!SKIP.has('reenter') && REENTER > 0) {
      // ── leave and come back N times ──
      await client.send('HeapProfiler.enable');
      const snap = async () => {
        await client.send('HeapProfiler.collectGarbage'); await sleep(150); await client.send('HeapProfiler.collectGarbage');
        const heap = (await client.send('Runtime.getHeapUsage')).usedSize;
        const { result } = await client.send('Runtime.evaluate', { expression: 'window' });
        const ls = (await client.send('DOMDebugger.getEventListeners', { objectId: result.objectId })).listeners;
        const dom = await page.evaluate(() => ({ nodes: document.querySelectorAll('*').length, canvases: document.querySelectorAll('canvas').length, v2pads: document.querySelectorAll('#v2pad').length, v2b: document.querySelectorAll('canvas.v2b').length }));
        return { heapMB: +(heap / 1048576).toFixed(1), winListeners: ls.length, ...dom };
      };
      const seq = [await snap()];
      for (let i = 0; i < REENTER; i++) {
        await page.evaluate(() => { const g = window.__game; g.go(g.registry.v2pick ? 'v2pick' : 'title', {}, { fade: false }); }); await page.waitForFunction(() => !window.__v2, null, { timeout: 20000 }).catch(() => {});
        await sleep(400);
        const away = await page.evaluate(() => ({ v2pads: document.querySelectorAll('#v2pad').length, top: window.__game.top?.name }));
        ok(away.v2pads === 0 && away.top !== 'v2g', `${dev}: after leaving (${i + 1}) no #v2pad is left (top scene ${away.top})`);
        await page.evaluate(() => window.__game.go('v2g', {}, { fade: false }));
        await page.waitForFunction(() => window.__v2 && window.__v2.ready && window.__v2.scene.hudKind === 'ui', null, { timeout: 90000 }).catch(() => page._errs.push('re-entry ' + (i + 1) + ' not ready'));
        await sleep(1200); await T.down(1, 300, 20); await T.up(1); await sleep(300);
        seq.push(await snap());
      }
      R.reenter = seq;
      const a = seq[1] ?? seq[0], z2 = seq[seq.length - 1];
      ok(z2.nodes <= a.nodes && z2.canvases <= a.canvases && z2.v2pads === 1 && z2.v2b === 7, `${dev}: DOM does not grow over ${REENTER} re-entries (${JSON.stringify(a)} -> ${JSON.stringify(z2)})`);
      ok(z2.winListeners <= a.winListeners, `${dev}: window listeners do not grow (${a.winListeners} -> ${z2.winListeners})`);
      note(`${dev}: heap after GC per entry (MB): ${seq.map((s) => s.heapMB).join(' → ')}`);
      const mm = await M(page); ok(mm.padShown && mm.hudKind === 'ui', `${dev}: pad works after the last re-entry (shown ${mm.padShown})`);
      const b2 = mm.pad.buttons.find((b) => b.id === 'attack'); await page.evaluate(() => { window.__vl = []; });
      await T.down(1, b2.cx, b2.cy); await sleep(200); const dd = await downs(page, ['attack']); await T.up(1); await sleep(100);
      ok(dd[0], `${dev}: attack button still presses after re-entries`);
    }
    R.errors = page._errs.slice();
    ok(page._errs.length === 0, `${dev}: page errors / HUD warnings: ${JSON.stringify(page._errs.slice(0, 4))}`);
  } catch (e) { ok(false, `${dev}: script error ${String(e?.stack ?? e).slice(0, 400)}`); }
  await ctx.close();
}
await browser.close(); srv.close();
report.pass = passN; report.fails = fails; report.notes = notes;
fs.writeFileSync(`${OUT}/verify.json`, JSON.stringify(report, null, 1));
console.log(`\nUI VERIFY: ${passN} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
