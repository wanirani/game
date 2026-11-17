#!/usr/bin/env node
// 타이틀의 '리빌드 시범' 줄 → 고르기 화면(src/v2/chooser.js) → 시범판 A·B → 돌아오기 검사
//   node tools/v2/p0_entry_check.mjs [--shots <폴더>]
//  터치(fold_open · phone2, 글자 크기 기본·크게·아주 크게): 줄이 화면 안에 있고 서로 겹치지 않는가, 눌러서 고르기 화면 → A → 일시정지 → 고르기 → 돌아가기
//  키보드(desk): 방향키 + Enter 로 고르기 → B → Esc(일시정지 = 나가기) → 고르기 → Esc → 타이틀 (줄이 그대로 골라져 있는가)
//  패드(desk, 가짜 게임패드): 십자키 + A 로 고르기 → A → START(일시정지) → SELECT(나가기) → 고르기 → B(취소) → 타이틀
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { fakePadInit, press as padPress } from '../qa/lib/fakepad.mjs';

const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const IGNORE = /Failed to load resource|ERR_CERT|ERR_INTERNET_DISCONNECTED|fonts\.g/;
const port = 9500 + Math.floor(Math.random() * 400);
const srv = await start(port);
const fails = [];
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) fails.push(m); return c; };

async function open(vp, settings, init) {
  const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
  const ctx = await browser.newContext(contextOptions(vp));
  await ctx.addInitScript((s) => { try { localStorage.setItem('bloodnocturne_settings', JSON.stringify({ settingsVersion: 2, ...s })); } catch { /* */ } }, settings || {});
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${port}/index.html?nosw`);
  await page.waitForFunction(() => window.__game?.top?.constructor?.name === 'TitleScene', null, { timeout: 45000 });
  return { browser, page, errs };
}
const top = (page) => page.evaluate(() => window.__game.top?.constructor?.name);
// UI 좌표의 사각형 가운데 → 화면(CSS) 좌표
const cssOf = (page, r) => page.evaluate((r) => { const g = window.__game, c = g.canvasRect, k = (g.top?.uiScale ? g.uiK : 1) * g.cssScale; return { x: c.x + (r.x + r.w / 2) * k, y: c.y + (r.y + r.h / 2) * k }; }, r);
const rows = (page) => page.evaluate(() => { const t = window.__game.top; return { n: t.items?.length ?? t.menu.count, idx: t.menu.index, rects: t.menu.rects.map((r) => r && ({ x: r.x, y: r.y, w: r.w, h: r.h })), ids: (t.items || []).map((i) => i.id), H: window.__game.uiH, W: window.__game.uiW, k: window.__game.uiK, css: window.__game.cssScale, mode: t.mode }; });

for (const vp of ['fold_open', 'phone2']) {
  for (const ts of ['normal', 'large', 'xlarge']) {
    console.log(`\n== 터치 · ${vp} · 글자 ${ts} ==`);
    const s = await open(vp, ts === 'normal' ? {} : { textSize: ts });
    const { page } = s;
    try {
      const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
      for (let i = 0; i < 6; i++) { if ((await page.evaluate(() => window.__game.top.mode)) === 'menu') break; await page.touchscreen.tap(w * 0.5, h * 0.42); await page.waitForTimeout(700); }
      await page.waitForTimeout(1500);
      const R = await rows(page);
      const vi = R.ids.indexOf('v2'), rr = R.rects.filter(Boolean);
      const inside = rr.length === R.n && rr.every((r) => r.y >= 0 && r.y + r.h <= R.H - 22 && r.x >= 0 && r.x + r.w <= R.W);
      const noOverlap = rr.every((r, i) => i === 0 || r.y >= rr[i - 1].y + rr[i - 1].h - 0.5);
      const cssH = rr.length ? rr[0].h * R.k * R.css : 0;
      ok(R.mode === 'menu' && vi === R.n - 1, `타이틀 메뉴 ${R.n}줄, 마지막 줄 = 리빌드 시범 (${R.ids.join(' ')})`);
      ok(inside && noOverlap, `줄이 화면 안 · 겹침 없음 (UI ${Math.round(R.W)}×${Math.round(R.H)}, 첫 줄 y ${Math.round(rr[0]?.y)}, 끝 줄 아래 ${Math.round(rr[rr.length - 1]?.y + rr[rr.length - 1]?.h)}, 줄 높이 ${rr[0]?.h} UI = ${cssH.toFixed(1)} CSS px)`);
      ok(cssH >= 34, `줄 높이 ${cssH.toFixed(1)} CSS px ≥ 34 (누르는 영역은 44 까지 여유가 붙는다)`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/title_${vp}_${ts}.png` });
      const p = await cssOf(page, rr[vi]);
      await page.touchscreen.tap(p.x, p.y);
      await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser', null, { timeout: 8000 });
      await page.waitForTimeout(900);
      const C = await page.evaluate(() => { const t = window.__game.top, g = window.__game; return { rects: t.menu.rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })), H: g.uiH, W: g.uiW, k: g.uiK, css: g.cssScale }; });
      ok(C.rects.length === 3 && C.rects.every((r) => r.y > 40 && r.y + r.h <= C.H && r.x >= 0 && r.x + r.w <= C.W) && C.rects.every((r) => r.h * C.k * C.css >= 34), `고르기 화면: 3줄이 화면 안 (끝 줄 아래 ${Math.round(C.rects[2].y + C.rects[2].h)} / ${Math.round(C.H)}, 줄 높이 ${C.rects.map((r) => (r.h * C.k * C.css).toFixed(0)).join('·')} CSS px)`);
      // 글자가 줄 너비를 넘지 않는가 (같은 글꼴·크기로 재 본다 — maxWidth 로 줄어들면 읽기 어렵다)
      const fit = await page.evaluate(() => { const g = window.__game, ctx = g.ctx, t = g.top, w = t.menu.rects[0].w - 48; const out = []; for (const str of ['그림을 깊이에 맞춰 겹쳐 그린 화면 (카메라 고정)', '길과 건물을 입체로 세운 화면 (카메라가 돈다)', '같은 구간을 두 가지 화면으로 만들었습니다. 둘 다 해 보고 골라 주세요.']) { const size = Math.max(15, g.textFloor || 0); ctx.save(); ctx.font = `500 ${size}px "Noto Sans KR", sans-serif`; out.push(Math.round(ctx.measureText(str).width)); ctx.restore(); } return { out, w: Math.round(w), full: Math.round(t.menu.rects[0].w), floor: g.textFloor }; });
      ok(fit.out[0] <= fit.w && fit.out[1] <= fit.w && fit.out[2] <= fit.full, `설명 글이 줄어들지 않고 들어감 (글 폭 ${fit.out.join('·')} ≤ ${fit.w}·${fit.full}, 글자 하한 ${fit.floor})`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/chooser_${vp}_${ts}.png` });
      if (ts === 'normal') {
        const a = await cssOf(page, C.rects[0]);
        await page.touchscreen.tap(a.x, a.y);
        await page.waitForFunction(() => window.__v2?.id === 'a', null, { timeout: 30000 });
        await page.waitForTimeout(1200);
        const pb = await page.evaluate(async () => { const tp = (await import('/src/core/touchpad.js')).touchpad; const b = tp.buttons().find((x) => x.id === 'pause'); return b ? { x: b.cx ?? b.x + b.w / 2, y: b.cy ?? b.y + b.h / 2 } : null; });
        await page.touchscreen.tap(pb.x, pb.y); await page.waitForTimeout(500);
        const tb = await page.evaluate(() => { const g = window.__game, r = window.__v2.scene.btns.title, c = g.canvasRect, k = g.cssScale; return { x: c.x + (r.x + r.w / 2) * k, y: c.y + (r.y + r.h / 2) * k }; });
        await page.touchscreen.tap(tb.x, tb.y);
        await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser' && typeof window.__v2 === 'undefined', null, { timeout: 8000 });
        ok(true, 'A 를 눌러 들어감 → 일시정지 → [타이틀로] → 고르기 화면으로 돌아옴 (__v2 정리됨)');
        await page.waitForTimeout(900);
        const C2 = await page.evaluate(() => window.__game.top.menu.rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })));
        const b = await cssOf(page, C2[2]);
        await page.touchscreen.tap(b.x, b.y);
        await page.waitForFunction(() => window.__game.top?.constructor?.name === 'TitleScene', null, { timeout: 8000 });
        await page.waitForTimeout(500);
        const R2 = await rows(page);
        ok(R2.mode === 'menu' && R2.ids[R2.idx] === 'v2', `[돌아가기] → 타이틀 메뉴, 리빌드 시범 줄이 골라져 있음 (${R2.ids[R2.idx]})`);
      }
    } catch (e) { ok(false, `${vp}/${ts}: ${String(e.message).slice(0, 240)} (맨 위 ${await top(page).catch(() => '?')})`); }
    ok(s.errs.length === 0, `페이지 오류 0${s.errs.length ? ' — ' + s.errs.slice(0, 2).join(' / ') : ''}`);
    await s.browser.close();
  }
}
{
  console.log('\n== 키보드 · desk ==');
  const s = await open('desk', {});
  const { page } = s;
  try {
    const key = async (k, ms = 260) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };
    for (let i = 0; i < 6; i++) { if ((await page.evaluate(() => window.__game.top.mode)) === 'menu') break; await key('Enter', 700); }
    await page.waitForTimeout(1200);
    let R = await rows(page);
    for (let i = 0; i < 12 && R.ids[R.idx] !== 'v2'; i++) { await key('ArrowDown'); R = await rows(page); }
    ok(R.ids[R.idx] === 'v2', '방향키 ↓ 로 리빌드 시범 줄까지');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/title_desk.png` });
    await key('Enter');
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser', null, { timeout: 8000 });
    await page.waitForTimeout(900);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/chooser_desk.png` });
    await key('ArrowDown'); await key('Enter');
    await page.waitForFunction(() => window.__v2?.id === 'b' && (window.__v2.ready || window.__v2.error), null, { timeout: 30000 });
    ok(await page.evaluate(() => !!window.__v2.ready), 'Enter → ↓ → Enter 로 시범판 B 가 열림');
    await page.waitForTimeout(1500);
    await key('Escape', 400);
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser' && typeof window.__v2 === 'undefined', null, { timeout: 8000 });
    const idx = await page.evaluate(() => window.__game.top.menu.index);
    ok(idx === 1, `B 에서 Esc → 고르기 화면 (B 줄이 골라져 있음: ${idx})`);
    await page.waitForTimeout(900);
    await key('Escape', 500);
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'TitleScene', null, { timeout: 8000 });
    R = await rows(page);
    ok(R.mode === 'menu' && R.ids[R.idx] === 'v2', 'Esc → 타이틀 메뉴 (리빌드 시범 줄)');
  } catch (e) { ok(false, `desk: ${String(e.message).slice(0, 240)} (맨 위 ${await top(page).catch(() => '?')})`); }
  ok(s.errs.length === 0, `페이지 오류 0${s.errs.length ? ' — ' + s.errs.slice(0, 2).join(' / ') : ''}`);
  await s.browser.close();
}
{
  // 패드: 가짜 게임패드(tools/qa/lib/fakepad.mjs) — A(0) = 확인, B(1) = 취소, START(9) = 일시정지, SELECT(8) = 지도/가방, 십자키 아래(13)
  console.log('\n== 패드 · desk ==');
  const s = await open('desk', {}, fakePadInit({ connected: true }));
  const { page } = s;
  try {
    for (let i = 0; i < 6; i++) { if ((await page.evaluate(() => window.__game.top.mode)) === 'menu') break; await padPress(page, 0, 90, 600); }
    await page.waitForTimeout(1200);
    let R = await rows(page);
    for (let i = 0; i < 12 && R.ids[R.idx] !== 'v2'; i++) { await padPress(page, 13, 90, 160); R = await rows(page); }
    ok(R.ids[R.idx] === 'v2', '십자키 ↓ 로 리빌드 시범 줄까지');
    await padPress(page, 0);
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser', null, { timeout: 8000 });
    await page.waitForTimeout(900);
    await padPress(page, 0);
    await page.waitForFunction(() => window.__v2?.id === 'a', null, { timeout: 30000 });
    ok(true, 'A 단추 → 고르기 화면 → A 단추 → 시범판 A 가 열림');
    await page.waitForTimeout(1200);
    await padPress(page, 9, 90, 300);
    const paused = await page.evaluate(() => window.__v2.scene.paused);
    await padPress(page, 8, 90, 300);
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser' && typeof window.__v2 === 'undefined', null, { timeout: 8000 });
    ok(paused, 'START → 일시정지, SELECT → 고르기 화면으로');
    await page.waitForTimeout(900);
    await padPress(page, 1, 90, 400);
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'TitleScene', null, { timeout: 8000 });
    R = await rows(page);
    ok(R.mode === 'menu' && R.ids[R.idx] === 'v2', 'B 단추(취소) → 타이틀 메뉴 (리빌드 시범 줄)');
  } catch (e) { ok(false, `pad: ${String(e.message).slice(0, 240)} (맨 위 ${await top(page).catch(() => '?')})`); }
  ok(s.errs.length === 0, `페이지 오류 0${s.errs.length ? ' — ' + s.errs.slice(0, 2).join(' / ') : ''}`);
  await s.browser.close();
}
await new Promise((r) => srv.close(() => r()));
console.log(fails.length ? `\nFAIL ${fails.length}\n - ` + fails.join('\n - ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
