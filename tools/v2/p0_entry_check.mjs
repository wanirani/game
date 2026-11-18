#!/usr/bin/env node
// 타이틀의 '리빌드 시범' 줄 → 고르기 화면(src/v2/chooser.js: 본 게임(v2g) · 시범판 B · 꾸민 배경(v2c) · 성능 진단(v2bench) · 시범판 A · 돌아가기) → 각 장면 → 돌아오기 검사
//   node tools/v2/p0_entry_check.mjs [--shots <폴더>]
//  터치(fold_open · phone2, 글자 크기 기본·크게·아주 크게): 다섯 줄이 화면 안에 있고 서로 겹치지 않는가 · 글이 줄어들지 않는가,
//    눌러서 고르기 화면 → A → 일시정지 → 고르기(A 줄) → 꾸민 배경 → 일시정지 단추 → 고르기(꾸민 배경 줄) → 성능 진단 → 나가기 → 고르기(성능 진단 줄) → 돌아가기
//    본 게임(v2g, 첫 줄)은 새 인터페이스가 기본값: 새 단추의 「멈춤」 → 일시정지 판 → 「나가기」 줄 (키보드는 Esc → 일시정지 판 → ↓ 로 「나가기」 → Enter) — 11-18 통합 A 가 이 흐름으로 고쳤다
//  키보드(desk): 방향키 + Enter 로 고르기 → B → Esc(일시정지 = 나가기) → 고르기(B 줄) → ↓ Enter → 꾸민 배경 → Esc → ↓ Enter → 성능 진단 → Esc → 고르기 → Esc → 타이틀 (줄이 그대로 골라져 있는가)
//  패드(desk, 가짜 게임패드): 십자키 + A 로 고르기 → ↓↓↓ A → 시범판 A → START(일시정지) → SELECT(나가기) → 고르기(A 줄) → B(취소) → 타이틀
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
      const C = await page.evaluate(() => { const t = window.__game.top, g = window.__game; return { rects: t.menu.rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })), H: g.uiH, W: g.uiW, k: g.uiK, css: g.cssScale, lay: t.layout, idx: t.menu.index }; });
      const cIn = C.rects.every((r) => r.y > 30 && r.y + r.h <= C.H && r.x >= 0 && r.x + r.w <= C.W), cGap = C.rects.every((r, i) => i === 0 || r.y >= C.rects[i - 1].y + C.rects[i - 1].h + 2), cTap = C.rects.every((r) => r.h * C.k * C.css >= 34);
      ok(C.rects.length === 6 && cIn && cGap && cTap && C.idx === 0, `고르기 화면: 6줄이 화면 안 · 겹침 없음 (첫 줄 y ${Math.round(C.rects[0].y)}, 끝 줄 아래 ${Math.round(C.rects[5].y + C.rects[5].h)} / ${Math.round(C.H)}, 줄 높이 ${C.rects.map((r) => (r.h * C.k * C.css).toFixed(0)).join('·')} CSS px, ${C.lay?.tight ? '좁은' : '넉넉한'} 배치)`);
      // 글자가 줄 너비를 넘지 않는가 (같은 글꼴·크기로 재 본다 — maxWidth 로 줄어들면 읽기 어렵다). 글은 chooser.js 가 내보내는 것을 그대로 읽는다
      const fit = await page.evaluate(async () => { const m = await import('/src/v2/chooser.js'); const g = window.__game, ctx = g.ctx, t = g.top, w = t.menu.rects[0].w - 44; const size = Math.max(15, g.textFloor || 0); const meas = (str, wt = 500) => { ctx.save(); ctx.font = `${wt} ${size}px "Noto Sans KR", sans-serif`; const v = Math.round(ctx.measureText(str).width); ctx.restore(); return v; }; const descs = m.ROWS.filter((r) => r.desc); return { ids: m.ROWS.map((r) => r.id), out: descs.map((r) => meas(r.desc)), tags: descs.map((r) => (r.tag ? meas(r.label, 800) * 1.7 + meas(r.tag, 700) : 0)), head: meas(m.HEAD_NOTE), headShown: !t.layout.tight, w: Math.round(w), full: Math.round(t.menu.rects[0].w), floor: g.textFloor, cardH: t.layout.cardH }; });
      ok(fit.ids.join(' ') === 'v2g v2b v2c v2bench v2a back', `줄 순서: ${fit.ids.join(' ')}`);
      ok(fit.out.every((v) => v <= fit.w) && (!fit.headShown || fit.head <= fit.full) && fit.tags.every((v) => v <= fit.w), `설명 글이 줄어들지 않고 들어감 (글 폭 ${fit.out.join('·')} ≤ ${fit.w}${fit.headShown ? `, 머리말 ${fit.head} ≤ ${fit.full}` : ', 머리말 안내 글은 좁은 배치에서 생략'}, 글자 하한 ${fit.floor}, 줄 높이 ${fit.cardH} UI)`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/chooser_${vp}_${ts}.png` });
      if (ts === 'normal') {
        const chooserBack = async (what, idx) => {
          await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser' && typeof window.__v2 === 'undefined' && typeof window.__v2bench === 'undefined', null, { timeout: 12000 });
          await page.waitForTimeout(900);
          const st = await page.evaluate(() => ({ idx: window.__game.top.menu.index, gl: document.querySelectorAll('canvas').length, ta: !!document.getElementById('v2bench-text') }));
          ok(st.idx === idx && !st.ta, `${what} → 고르기 화면으로 돌아옴 (그 줄이 골라져 있음: ${st.idx}, 남은 캔버스 ${st.gl}개)`);
          return st;
        };
        const pauseBtn = () => page.evaluate(async () => { const tp = (await import('/src/core/touchpad.js')).touchpad; const b = tp.buttons().find((x) => x.id === 'pause'); return b ? { x: b.cx ?? b.x + b.w / 2, y: b.cy ?? b.y + b.h / 2 } : null; });
        const cv0 = await page.evaluate(() => document.querySelectorAll('canvas').length);
        // 본 게임 (첫 줄, v2g) — 가상 패드의 일시정지 단추가 나가기
        const g0 = await cssOf(page, C.rects[0]);
        await page.touchscreen.tap(g0.x, g0.y);
        await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 60000 });
        const gst = await page.evaluate(() => ({ ready: !!window.__v2.ready, err: window.__v2.error ?? null, mode: window.__v2.stats?.mode ?? null }));
        ok(gst.ready && !gst.err, `본 게임 줄을 눌러 v2g 가 열림 (${JSON.stringify(gst)})`);
        await page.waitForTimeout(1500);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/v2g_${vp}.png` });
        // 본 게임은 새 인터페이스(세공한 유리)가 기본값이다 (11-18 통합 A): 새 단추 층의 「멈춤」 단추 → 일시정지 판 → 「나가기」 줄. 옛 단추로 돌고 있으면 v1 패드의 일시정지 단추가 같은 판을 연다
        const hudKind = await page.evaluate(() => window.__v2.stats?.hud ?? null);
        const pg = (await page.evaluate(() => { const b = window.__v2.scene?.hud?.metrics?.()?.pad?.buttons?.find((x) => x.id === 'pause'); return b ? { x: b.cx, y: b.cy } : null; })) ?? (await pauseBtn());
        await page.touchscreen.tap(pg.x, pg.y);
        await page.waitForFunction(() => window.__v2?.scene?.hud?.modal === 'pause', null, { timeout: 8000 });
        await page.waitForTimeout(500);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/v2g_pause_${vp}.png` });
        const lv = await page.evaluate(() => { const g = window.__game, m = window.__v2.scene.hud.metrics().pause, ids = m.ids ?? m.rows.map((r) => r.label), r = m.rows[m.rows.length - 1]; return { x: g.canvasRect.x + (r.x + r.w / 2) * g.cssScale, y: g.canvasRect.y + (r.y + r.h / 2) * g.cssScale, ids, paused: window.__v2.scene.hud.modal }; });
        ok(lv.paused === 'pause' && lv.ids.length >= 3 && lv.ids[lv.ids.length - 1] === 'leave', `본 게임: 「멈춤」 단추 → 일시정지 판이 열림 (인터페이스 ${hudKind}, 줄: ${lv.ids.join(' ')})`);
        await page.touchscreen.tap(lv.x, lv.y);
        await chooserBack('본 게임 → 멈춤 단추 → 일시정지 판의 「나가기」', 0);
        // 시범판 A (다섯째 줄)
        const a = await cssOf(page, C.rects[4]);
        await page.touchscreen.tap(a.x, a.y);
        await page.waitForFunction(() => window.__v2?.id === 'a', null, { timeout: 30000 });
        await page.waitForTimeout(1200);
        const pb = await pauseBtn();
        await page.touchscreen.tap(pb.x, pb.y); await page.waitForTimeout(500);
        const tb = await page.evaluate(() => { const g = window.__game, r = window.__v2.scene.btns.title, c = g.canvasRect, k = g.cssScale; return { x: c.x + (r.x + r.w / 2) * k, y: c.y + (r.y + r.h / 2) * k }; });
        await page.touchscreen.tap(tb.x, tb.y);
        await chooserBack('A 를 눌러 들어감 → 일시정지 → [타이틀로]', 4);
        // 꾸민 배경 (셋째 줄) — 가상 패드의 일시정지 단추가 나가기
        const c1 = await cssOf(page, C.rects[2]);
        await page.touchscreen.tap(c1.x, c1.y);
        await page.waitForFunction(() => window.__v2?.id === 'c' && (window.__v2.ready || window.__v2.error), null, { timeout: 40000 });
        const cst = await page.evaluate(() => ({ ready: !!window.__v2.ready, err: window.__v2.error ?? null, chunks: window.__v2.stats?.env?.visibleChunks ?? null }));
        ok(cst.ready && !cst.err, `꾸민 배경 줄을 눌러 v2c 가 열림 (${JSON.stringify(cst)})`);
        await page.waitForTimeout(1500);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/v2c_${vp}.png` });
        const pc = await pauseBtn();
        await page.touchscreen.tap(pc.x, pc.y);
        await chooserBack('꾸민 배경 → 일시정지 단추', 2);
        // 성능 진단 (넷째 줄) — 재는 도중에는 단추가 없으므로(끝나면 「나가기」) 여기서는 취소 키로 나온다
        const c2 = await cssOf(page, C.rects[3]);
        await page.touchscreen.tap(c2.x, c2.y);
        await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Bench' && !!window.__v2bench, null, { timeout: 30000 });
        ok(true, '성능 진단 줄을 눌러 v2bench 가 열림');
        await page.waitForTimeout(2500);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/v2bench_${vp}.png` });
        await page.keyboard.press('Escape');
        const after = await chooserBack('성능 진단 → 취소', 3);
        ok(after.gl <= cv0, `장면들을 드나든 뒤 캔버스가 늘지 않음 (${cv0} → ${after.gl})`);
        const C2 = await page.evaluate(() => window.__game.top.menu.rects.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })));
        const b = await cssOf(page, C2[5]);
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
    await key('Enter');
    await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 60000 });
    ok(await page.evaluate(() => !!window.__v2.ready), 'Enter → Enter 로 본 게임(v2g)이 열림 (첫 줄)');
    await page.waitForTimeout(1500);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/v2g_desk.png` });
    // 본 게임: Esc = 일시정지 판 (나가기는 그 안의 마지막 줄). Esc 를 한 번 더 누르면 이어 하기
    await key('Escape', 500);
    await page.waitForFunction(() => window.__v2?.scene?.hud?.modal === 'pause', null, { timeout: 8000 });
    const pm = await page.evaluate(() => { const m = window.__v2.scene.hud.metrics().pause; return { ids: m.ids ?? m.rows.map((r) => r.label), sel: m.sel ?? 0 }; });
    await key('Escape', 500);
    const resumed = await page.evaluate(() => window.__v2?.scene?.hud?.modal ?? null);
    ok(pm.ids[pm.ids.length - 1] === 'leave' && resumed === null, `본 게임에서 Esc → 일시정지 판 (줄: ${pm.ids.join(' ')}), Esc 한 번 더 → 이어 하기`);
    await key('Escape', 500);
    await page.waitForFunction(() => window.__v2?.scene?.hud?.modal === 'pause', null, { timeout: 8000 });
    for (let i = 0; i < pm.ids.length - 1; i++) await key('ArrowDown', 160);
    await key('Enter', 400);
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser' && typeof window.__v2 === 'undefined', null, { timeout: 8000 });
    let idx = await page.evaluate(() => window.__game.top.menu.index);
    ok(idx === 0, `본 게임에서 Esc → 일시정지 판 → ↓ 로 「나가기」 → Enter → 고르기 화면 (본 게임 줄이 골라져 있음: ${idx})`);
    await page.waitForTimeout(900);
    await key('ArrowDown'); await key('Enter');
    await page.waitForFunction(() => window.__v2?.id === 'b' && (window.__v2.ready || window.__v2.error), null, { timeout: 30000 });
    ok(await page.evaluate(() => !!window.__v2.ready), '↓ Enter 로 시범판 B 가 열림 (둘째 줄)');
    await page.waitForTimeout(1500);
    await key('Escape', 400);
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser' && typeof window.__v2 === 'undefined', null, { timeout: 8000 });
    idx = await page.evaluate(() => window.__game.top.menu.index);
    ok(idx === 1, `B 에서 Esc → 고르기 화면 (B 줄이 골라져 있음: ${idx})`);
    await page.waitForTimeout(900);
    await key('ArrowDown'); await key('Enter');
    await page.waitForFunction(() => window.__v2?.id === 'c' && (window.__v2.ready || window.__v2.error), null, { timeout: 40000 });
    ok(await page.evaluate(() => !!window.__v2.ready), '↓ Enter 로 꾸민 배경(v2c)이 열림');
    await page.waitForTimeout(1500);
    await key('Escape', 400);
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser' && typeof window.__v2 === 'undefined', null, { timeout: 8000 });
    idx = await page.evaluate(() => window.__game.top.menu.index);
    ok(idx === 2, `꾸민 배경에서 Esc → 고르기 화면 (꾸민 배경 줄: ${idx})`);
    await page.waitForTimeout(900);
    await key('ArrowDown'); await key('Enter');
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Bench' && !!window.__v2bench, null, { timeout: 30000 });
    ok(true, '↓ Enter 로 성능 진단(v2bench)이 열림');
    await page.waitForTimeout(2000);
    await key('Escape', 400);
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser' && typeof window.__v2bench === 'undefined', null, { timeout: 8000 });
    idx = await page.evaluate(() => window.__game.top.menu.index);
    ok(idx === 3, `성능 진단에서 Esc → 고르기 화면 (성능 진단 줄: ${idx})`);
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
    for (let i = 0; i < 4; i++) await padPress(page, 13, 90, 200);   // 본 게임 · B · 꾸민 배경 · 성능 진단 다음이 시범판 A (다섯째 줄)
    const pi = await page.evaluate(() => window.__game.top.menu.index);
    await padPress(page, 0);
    await page.waitForFunction(() => window.__v2?.id === 'a', null, { timeout: 30000 });
    ok(pi === 4, `A 단추 → 고르기 화면 → 십자키 ↓ 네 번(줄 ${pi}) → A 단추 → 시범판 A 가 열림`);
    await page.waitForTimeout(1200);
    let paused = false;   // 기계가 바쁘면 짧은 누름이 한 틱도 못 잡히는 일이 있어, 될 때까지 몇 번 누른다
    for (let i = 0; i < 4 && !paused; i++) { await padPress(page, 9, 130, 400); paused = await page.evaluate(() => !!window.__v2?.scene?.paused); }
    for (let i = 0; i < 4; i++) { await padPress(page, 8, 130, 500); if (await page.evaluate(() => typeof window.__v2 === 'undefined')) break; }
    await page.waitForFunction(() => window.__game.top?.constructor?.name === 'V2Chooser' && typeof window.__v2 === 'undefined', null, { timeout: 8000 });
    const pidx = await page.evaluate(() => window.__game.top.menu.index);
    ok(paused && pidx === 4, `START → 일시정지, SELECT → 고르기 화면으로 (시범판 A 줄: ${pidx})`);
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
