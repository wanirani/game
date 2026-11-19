// POLISH-VERIFY (2026-11-19): the verifier's own stills of the POLISH lane's small things - no banner through the pause panel, the book, the bag or the
// settings; what the banner does after the panel closes; a story banner; the empty book on a fresh save; the chisel and the pack at game size.
//   node tools/v2/polishverify_stills.mjs --device fold_open|phone2 [--out /tmp/claude-0/v2/polish14verify] [--saves <bot saves>] [--only banner,empty,icons]
// One device a command (one browser). It prints what the HUD says of the banner at every step and exits 1 when a banner is drawn under a panel or a screen.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const OUT = String(args.out || '/tmp/claude-0/v2/polish14verify'), DEV = String(args.device || 'fold_open'), SAVES = String(args.saves || '/tmp/claude-0/v2/polish14verify/saves');
const ONLY = args.only ? new Set(String(args.only).split(',')) : null, want = (p) => !ONLY || ONLY.has(p);
fs.mkdirSync(OUT, { recursive: true });
let fails = 0, passes = 0;
const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (cond) passes++; else fails++; };
const saveOf = (n) => { const f = fs.readdirSync(SAVES).find((x) => x.startsWith(String(n).padStart(3, '0') + '_')); if (!f) throw new Error('no bot save ' + n + ' in ' + SAVES); const o = JSON.parse(fs.readFileSync(SAVES + '/' + f, 'utf8')); return o.save ?? o; };

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = [];
function install() {
  const g = window.__game, v = window.__v2, sc = v.scene; g._pageHidden = true;
  const F = (window.__F = { n: 0 });
  F.fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
  F.toClient = (lx, ly) => { const r = g.canvasRect, s = sc.state; return [r.x + lx / s.viewW * r.w, r.y + ly / s.viewH * r.h]; };
  F.draw = () => { g.alpha = 1; g.render(); };
  F.tick = (n = 1, draw = true) => { for (let i = 0; i < n; i++) { g.tick(1 / 60); F.n++; } if (draw) F.draw(); };
  F.tap = (lx, ly, hold = 2, id = 41) => { const c = F.toClient(lx, ly); F.fire('pointerdown', id, c[0], c[1]); F.tick(hold, false); F.fire('pointerup', id, c[0], c[1]); F.tick(1); };
  F.tapCss = (x, y, hold = 2, id = 42) => { F.fire('pointerdown', id, x, y); F.tick(hold, false); F.fire('pointerup', id, x, y); F.tick(1); };
  F.tapRect = (r, hold = 2) => { F.tap(r.x + r.w / 2, r.y + r.h / 2, hold); };
  F.key = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); F.tick(1, false); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); F.tick(1); };
  F.M = () => sc.hud.metrics();
  F.pauseBtn = () => { const b = F.M().pad?.buttons?.find((q) => q.id === 'pause'); return b ? [b.cx, b.cy] : null; };
  F.openPause = () => { F.tick(2, false); const p = F.pauseBtn(); if (!p) return false; F.tapCss(p[0], p[1]); F.tick(4); return sc.hud.modal === 'pause' && !!F.M().pause; };
  F.pauseRow = (id) => { const m = F.M().pause; if (!m) return false; const i = m.ids.indexOf(id); if (i < 0) return false; F.tapRect(m.rows[i]); F.tick(3); return true; };
  F.closeBtn = () => { const m = F.M().screen; if (!m) return false; F.tapRect(m.close); F.tick(2); return true; };
  /** ticks until the banner's clock reaches t (or the banner is gone) */
  F.toT = (t) => { let n = 0; while (n < 900) { const a = sc.hud.stats(); if (!a.banner || a.bannerT >= t) break; F.tick(1, false); n++; } return n; };
  F.B = () => { const h = sc.hud, a = h.stats(); return { banner: a.banner, title: a.bannerTitle, shown: a.bannerShown, t: Math.round(a.bannerT * 1000) / 1000, modal: h.modal, screen: h.screen, top: g.scene?.constructor?.name ?? g.top?.constructor?.name ?? null, simT: Math.round(sc.sim.time * 1000) / 1000 }; };
  return { ready: v.ready, area: v.area, hud: v.stats?.hud };
}
try {
  const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('[console] ' + m.text().slice(0, 300)); });
  const ev = (fn, a) => page.evaluate(fn, a);
  const shot = async (name) => { await ev(() => window.__F.draw()); await page.screenshot({ path: `${OUT}/${DEV}_${name}.png` }); };
  const open = async (sv, early = false) => {
    const o = typeof sv === 'number' ? saveOf(sv) : sv;
    await page.goto(`http://localhost:${port}/tools/v2/fx_view.css`).catch(() => {});
    await ev((s) => { if (s === null) localStorage.removeItem('bn.v2.save'); else localStorage.setItem('bn.v2.save', JSON.stringify(s)); localStorage.removeItem('bn.v2.ui'); }, o ?? null);
    await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&v2res=0.5`);
    if (early) {
      await page.waitForFunction(() => { const v = window.__v2; if (v?.id === 'g' && v.ready && v.stats?.hud === 'ui') { window.__game._pageHidden = true; return true; } return !!v?.error; }, null, { timeout: 180000, polling: 30 });
      const st = await ev(install); await ev(() => { const F = window.__F, c = window.__game.canvasRect; F.tapCss(c.x + c.w * 0.62, c.y + c.h * 0.36, 1, 60); F.tick(2); });
      return st;
    }
    await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 });
    await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 20000 }).catch(() => {});
    const cdp = await ctx.newCDPSession(page), T = new Touch(cdp, page);
    await ensureTouchMode(T, page); await page.waitForTimeout(250);
    const st = await ev(install); await ev(() => window.__F.tick(30));
    return st;
  };
  const B = async (label) => { const s = await ev(() => window.__F.B()); console.log(`  [${label}] ` + JSON.stringify(s)); return s; };

  // ───────────── the place name: the panel opened 0.3 s, 1 s and 2 s after arriving; the book and the bag from the panel ─────────────
  if (want('banner')) {
    console.log(`\n════ ${DEV}: the place-name banner and the pause panel (bot save 033) ════`);
    const st = await open(33, true); console.log('  ' + JSON.stringify(st));
    const b0 = await B('arrived'); await shot('arrive');
    ok(`${DEV}: the place name is up on arriving`, b0.banner === 'area' && b0.shown === true, `${b0.title} at ${b0.t} s`);
    let i = 0;
    for (const T of [0.3, 1.0, 2.0]) {
      const tag = ['03', '10', '20'][i++];
      const op = await ev((t) => { const F = window.__F; F.toT(t - 0.15); return F.openPause(); }, T);
      const a = await B(`panel opened at about ${T} s`); await shot(`pause_${tag}`);
      ok(`${DEV}: ${T} s - the panel is open and no banner is drawn under it`, op && a.modal === 'pause' && a.banner === 'area' && a.shown === false, `clock ${a.t} s`);
      await ev(() => { const F = window.__F; F.pauseRow('chronicle'); F.tick(12); }); const bk = await B('the book'); await shot(`book_${tag}`);
      ok(`${DEV}: ${T} s - the book from the panel: no banner drawn, the clock stands`, bk.screen === 'chronicle' && bk.shown === false && bk.t === a.t, `clock ${bk.t} s`);
      await ev(() => { const F = window.__F; F.closeBtn(); F.tick(10); F.pauseRow('bag'); F.tick(12); }); const bg = await B('the bag'); await shot(`bag_${tag}`);
      ok(`${DEV}: ${T} s - the bag from the panel: no banner drawn, the clock stands`, bg.screen === 'bag' && bg.shown === false && bg.t === a.t, `clock ${bg.t} s`);
      await ev(() => { const F = window.__F; F.closeBtn(); F.tick(10); F.tick(240, false); }); const h = await B('four seconds later, the panel still open');
      ok(`${DEV}: ${T} s - four more seconds behind the panel: the clock has not moved, the rules stand`, h.modal === 'pause' && h.screen === null && h.shown === false && h.t === a.t && h.simT === a.simT, `clock ${h.t} s, rules ${a.simT} -> ${h.simT}`);
      await ev(() => { const F = window.__F; F.pauseRow('resume'); F.tick(4); }); const r1 = await B('a few ticks after 「이어 하기」'); await shot(`resumed_${tag}_a`);
      await ev(() => { window.__F.tick(20); }); const r2 = await B('24 ticks more'); await shot(`resumed_${tag}_b`);
      ok(`${DEV}: ${T} s - after the panel closes the banner is drawn again and its clock runs on from where it stood`, r1.modal === null && r1.shown === true && r1.t > a.t && r1.t < a.t + 0.25 && r2.shown === true && r2.t > r1.t, `${a.t} -> ${r1.t} -> ${r2.t} s`);
    }
    const end = await ev(() => { const F = window.__F, sc = window.__v2.scene; const t0 = sc.hud.stats().bannerT; let n = 0; while (n < 600 && sc.hud.stats().banner) { F.tick(1, false); n++; } return { t0, n, banner: sc.hud.stats().banner }; });
    ok(`${DEV}: the place name goes out when its 3.2 s are over (not sooner, not later)`, end.banner === null && Math.abs(end.t0 + end.n / 60 - 3.2) < 0.06, `it stood at ${end.t0.toFixed(2)} s and went out ${end.n} ticks later = ${(end.t0 + end.n / 60).toFixed(2)} s`);

    // a story banner (the chapter's name, as the story raises it) and the night banner; the settings from the panel
    console.log(`\n════ ${DEV}: the story's banners ════`);
    await ev(() => { const F = window.__F, sc = window.__v2.scene; F.tick(20, false); sc.hud.banner('area', '2장 — 안개의 묘지', '열쇠와 이름과 길종'); F.tick(36); });
    const s0 = await B('the chapter banner, 0.6 s'); await shot('story_up');
    const sp = await ev(() => window.__F.openPause()); const s1 = await B('the panel over it'); await shot('story_pause');
    ok(`${DEV}: a story banner (the chapter's name) is not drawn under the panel and waits`, sp && s0.shown === true && s1.shown === false && s1.banner === 'area' && s1.title === s0.title, `clock ${s0.t} -> ${s1.t} s`);
    await ev(() => { const F = window.__F; F.tick(300, false); F.pauseRow('resume'); F.tick(24); }); const s2 = await B('five seconds behind the panel, then 「이어 하기」'); await shot('story_resumed');
    ok(`${DEV}: …and is there again, whole, after five seconds behind the panel`, s2.shown === true && s2.title === s0.title && s2.t < s1.t + 0.6, `clock ${s2.t} s`);
    await ev(() => { const F = window.__F, sc = window.__v2.scene; let n = 0; while (n < 600 && sc.hud.stats().banner) { F.tick(1, false); n++; } F.tick(10, false); sc.hud.banner('night', '오늘 밤이 달라졌다', '1797 · 오늘 밤'); F.tick(40); });
    const n0 = await B('the night banner, 0.7 s'); await shot('night_up');
    const np = await ev(() => window.__F.openPause()); const n1 = await B('the panel over it'); await shot('night_pause');
    ok(`${DEV}: the night banner is not drawn under the panel`, np && n0.shown === true && n1.shown === false && n1.banner === 'night');
    // the settings (the options scene pushed from the panel)
    const se = await ev(() => { const F = window.__F, g = window.__game; const r = F.pauseRow('settings'); F.tick(20); const names = (g.stack ?? g.scenes ?? []).map?.((q) => q?.constructor?.name ?? q?.id ?? '?') ?? null; return { r, names, cur: g.current?.constructor?.name ?? g.scene?.constructor?.name ?? null, keys: Object.keys(g).filter((k) => /scene|stack|top|cur/i.test(k)) }; });
    console.log('  settings: ' + JSON.stringify(se)); const n2 = await B('the settings over the panel'); await shot('night_settings');
    ok(`${DEV}: the settings from the panel: no banner drawn, the clock stands`, n2.shown === false && n2.t === n1.t, `clock ${n1.t} -> ${n2.t} s`);
    await ev(() => { const F = window.__F; F.key('Escape'); F.tick(20); }); const n3 = await B('back from the settings (ESC)'); await shot('night_settings_back');
    ok(`${DEV}: back from the settings the panel is up again and the banner still waits`, n3.modal === 'pause' && n3.shown === false && n3.banner === 'night' && n3.t === n1.t, `modal ${n3.modal}, clock ${n3.t} s`);
    await ev(() => { const F = window.__F; F.pauseRow('resume'); F.tick(24); }); const n4 = await B('「이어 하기」'); await shot('night_resumed');
    ok(`${DEV}: …and goes on after 「이어 하기」`, n4.modal === null && n4.shown === true && n4.banner === 'night' && n4.t > n1.t, `clock ${n4.t} s`);
  }

  // ───────────── the empty book on a fresh save ─────────────
  if (want('empty')) {
    console.log(`\n════ ${DEV}: the empty book (no save: a new game, the opening) ════`);
    await open(null, true);
    const e = await ev(() => { const F = window.__F, sc = window.__v2.scene; const a = F.openPause(); F.pauseRow('chronicle'); F.tick(14); const m = F.M().screen; return { a, screen: sc.hud.screen, rows: m?.rows?.map((r) => r.kind).join(' ') ?? null, n: m?.n ?? null, m: m ? { x: m.x, y: m.y, w: m.w, h: m.h, cols: m.cols, fold: m.fold ?? null, keys: Object.keys(m) } : null, vw: sc.state.viewW, vh: sc.state.viewH, dpr: window.devicePixelRatio, rect: window.__game.canvasRect }; });
    console.log('  ' + JSON.stringify(e)); await shot('emptybook');
    ok(`${DEV}: a fresh save - the book opens with its one empty row`, e.a && e.screen === 'chronicle' && e.rows === 'empty', e.rows ?? 'no rows');
  }

  // ───────────── the two icons at game size: the chisel in the bag (bot save 050), the pack at the head of Rook's shop ─────────────
  if (want('icons')) {
    console.log(`\n════ ${DEV}: the chisel in the bag, the pack over Rook's shop (bot save 050) ════`);
    await open(50);
    const g = await ev(() => { const F = window.__F, sc = window.__v2.scene, M = sc.host.model; F.tick(6); const o = sc.hud.openScreen('bag'); F.tick(40); const m = F.M().screen, bag = M.bag(); const toC = (r) => { const a = F.toClient(r.x, r.y), b = F.toClient(r.x + r.w, r.y + r.h); return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] }; }; return { o, screen: sc.hud.screen, story: bag.story.map((q) => q.id + '/' + q.icon).join(' '), use: bag.use.map((q) => q.id + '/' + q.icon).join(' '), rows: (m?.rows ?? []).map((r) => ({ id: r.id, c: toC(r) })), dpr: window.devicePixelRatio, css: window.__game.cssScale }; });
    console.log('  ' + JSON.stringify(g)); await shot('bag_chisel');
    ok(`${DEV}: the bag of bot save 050 carries the chisel`, g.screen === 'bag' && /chisel/.test(g.story), g.story);
    const s = await ev(() => { const F = window.__F, sc = window.__v2.scene; sc.hud.closeScreen(); F.tick(12); const o = sc.hud.openScreen('shop', { shop: 'rook' }); F.tick(40); const m = F.M().screen; return { o, screen: sc.hud.screen, keys: m ? Object.keys(m) : null }; });
    console.log('  ' + JSON.stringify(s)); await shot('shop');
    ok(`${DEV}: Rook's shop is open`, s.screen === 'shop');
    await ev(() => { const F = window.__F, sc = window.__v2.scene; sc.hud.closeScreen(); F.tick(12); });
  }
  await ctx.close();
} catch (e) { console.log('ERROR ' + (e.stack ?? e)); fails++; }
await browser.close(); srv.close?.();
for (const e of errs) console.log('PAGE ' + e);
if (errs.length) fails++;
console.log(`\n${fails ? 'FAILED' : 'OK'}: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
