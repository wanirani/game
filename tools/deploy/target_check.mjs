#!/usr/bin/env node
// 빌드 대상 점검 (앱 분리, 2026-11-18) — build_web.mjs --target v1 | 3d 로 만든 웹 빌드를 브라우저로 열어 본다.
//   node tools/deploy/target_check.mjs --dir dist/web3d [--shots <폴더>] [--areas eshville_now,…] [--scenes v2b,v2c,v2bench] [--res 0.5]
//   node tools/deploy/target_check.mjs --dir dist/web   [--shots <폴더>] [--devices phone2,phone1,fold_open,fold_cover]
// 대상은 <dir>/build-info.js 의 window.__BN_BUILD.target 으로 정한다 (없으면 all → 실패: 이 점검은 v1·3d 용).
//  3d: ① 주소에 장면이 없으면 3D 고르기 화면(v2pick)으로 부팅, 2D 타이틀을 거치지 않음, 「돌아가기」 줄 없음, exitOnBack,
//         Esc 를 눌러도 고르기 화면 그대로 (휴대폰 · 폴드 화면 캡처)
//      ② 「본 게임」(첫 줄)을 고르면 v2g 가 열리고 입체 영웅이 선다
//      ③ src/v2/world/index.js 의 AREAS 지역마다 index.html?scene=v2g&area=<id> → 영웅 · 페이지 오류 0 · 4xx 0
//      ④ (--scenes) 다른 3D 장면도 연다 (v2b · v2c · v2bench · v2a)
//      어느 단계든 4xx 응답은 모두 모아 마지막에 경로 목록으로 보여 준다 (tools/deploy/web3d_ship.txt · v2_ship.txt 에 더할 것)
//  v1: 타이틀 메뉴 줄이 여덟 (「리빌드 시범」 없음), 줄이 화면(안전 영역) 안에 겹치지 않게 놓이고 높이 ≥ 44 UI px,
//      키보드 ↓ 로 모든 줄을 돌아 처음으로, 패드 ↓(버튼 13)도 줄을 옮긴다, 터치 영역(TapMenu.rects) 수 = 줄 수, 페이지 오류 0 · 4xx 0
// 브라우저는 하나만 띄워 차례로 돈다 (WebGL 은 소프트웨어 렌더러).
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextOptions } from '../qa/lib/viewports.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const DIR = path.resolve(arg('--dir', 'dist/web3d'));
const SHOTS = arg('--shots', null);
const RES = Number(arg('--res', 0.5));
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
if (!fs.existsSync(path.join(DIR, 'index.html'))) { console.error(`웹 빌드가 없습니다: ${DIR}`); process.exit(2); }
let INFO = null;
try { INFO = JSON.parse(/window\.__BN_BUILD\s*=\s*(\{.*\})\s*;/s.exec(fs.readFileSync(path.join(DIR, 'build-info.js'), 'utf8'))[1]); } catch { INFO = null; }
const TARGET = INFO?.target || 'all';
if (TARGET !== 'v1' && TARGET !== '3d') { console.error(`${DIR} 의 빌드 대상이 ${TARGET} 입니다 (v1 · 3d 만 점검한다 — build_web.mjs --target)`); process.exit(2); }
const AREA_IDS = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'src/v2/world/index.js'), 'utf8');
  const block = /export const AREAS = \{([\s\S]*?)\n\};/.exec(src)?.[1] || '';
  return [...block.matchAll(/^\s+(\w+):\s*make\(/gm)].map((m) => m[1]);
})();
const AREAS = arg('--areas', AREA_IDS.join(',')).split(',').filter(Boolean);
const SCENES = arg('--scenes', '').split(',').filter(Boolean);
const DEVICES = arg('--devices', TARGET === 'v1' ? 'phone2,phone1,fold_open,fold_cover' : 'phone2,fold_open').split(',').filter(Boolean);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8' };
const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = path.join(DIR, u);
  if (!f.startsWith(DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
const port = 9800 + (process.pid % 150);
await new Promise((r) => srv.listen(port, r));
const BASE = `http://localhost:${port}`;

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const IGNORE = /ERR_CERT|ERR_INTERNET_DISCONNECTED|fonts\.g/;
const fails = [];
const all4xx = new Map();   // 경로 → 처음 본 곳
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) fails.push(m); return c; };

const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, args: GL_ARGS });
async function open(dev, url, tag) {
  const ctx = await browser.newContext(contextOptions(dev));
  const page = await ctx.newPage();
  const errs = [], bad = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text()) && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  page.on('response', (r) => { const u = new URL(r.url()); if (u.port === String(port) && r.status() >= 400) { bad.push(`${r.status()} ${u.pathname}`); if (!all4xx.has(u.pathname)) all4xx.set(u.pathname, tag); } });
  await page.goto(BASE + url);
  await page.waitForFunction(() => !!window.__game?.top, null, { timeout: 60000 });
  return { ctx, page, errs, bad };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const key = async (page, k) => { await page.keyboard.down(k); await page.waitForTimeout(90); await page.keyboard.up(k); await page.waitForTimeout(160); };
const tail = (o) => `${o.bad.length ? ` — 4xx: ${o.bad.slice(0, 4).join(', ')}${o.bad.length > 4 ? ` 외 ${o.bad.length - 4}` : ''}` : ''}${o.errs.length ? ` — 오류: ${o.errs.slice(0, 3).join(' | ')}` : ''}`;

try {
  console.log(`대상 ${TARGET} · ${path.relative(ROOT, DIR)} (${INFO?.version}, bn-${INFO?.hash})`);
  if (TARGET === '3d') {
    // ① 첫 화면 = 고르기 화면
    for (const dev of DEVICES) {
      console.log(`\n== 부팅 (${dev}) ==`);
      const o = await open(dev, '/index.html?nosw', `boot ${dev}`);
      try {
        await page_wait(o.page, () => window.__game?.top?.name === 'v2pick', 30000);
        await o.page.waitForTimeout(1500);
        const st = await o.page.evaluate(() => {
          const g = window.__game, t = g.top;
          return { top: t?.name, stack: g.scenes.map((s) => s.name), exitOnBack: t?.exitOnBack, rows: t?.menu?.count, rects: (t?.menu?.rects || []).filter(Boolean).length, layout: t?.layout, W: g.uiW || g.viewW, H: g.uiH || g.viewH, title: document.title, debugBoot: !!g.saves?.debugBoot };
        });
        ok(st.top === 'v2pick' && st.stack.join('>') === 'v2pick', `첫 장면이 3D 고르기 화면 (장면 ${st.stack.join('>')}, 창 제목 ${st.title})`);
        ok(st.title === '블러드 녹턴 3D', `창 제목 「블러드 녹턴 3D」 (${st.title})`);
        ok(st.rows === 5 && st.rects === 5, `줄 다섯 (「돌아가기」 없음): 줄 ${st.rows} · 터치 영역 ${st.rects}`);
        const L = st.layout;
        ok(L && L.top >= 0 && L.top + L.total <= st.H + 0.5 && L.cardH >= 46, `줄이 화면 안 (위 ${L && Math.round(L.top)} · 높이 ${L && Math.round(L.total)} / ${Math.round(st.H)} · 줄 ${L?.cardH})`);
        ok(st.exitOnBack === true, '고르기 화면 exitOnBack (안드로이드 뒤로 = 종료 확인)');
        await shot(o.page, `3d_chooser_${dev}`);
        await key(o.page, 'Escape');
        await o.page.waitForTimeout(800);
        const after = await o.page.evaluate(() => window.__game.scenes.map((s) => s.name).join('>'));
        ok(after === 'v2pick', `Esc 를 눌러도 고르기 화면 그대로 (2D 타이틀로 가지 않음): ${after}`);
        if (dev === DEVICES[0]) {
          // ② 「본 게임」 = 첫 줄 → v2g, 입체 영웅
          await key(o.page, 'Enter');
          await page_wait(o.page, () => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error) && !!window.__v2.hero, 90000).catch(() => {});
          await o.page.waitForTimeout(2500);
          const g = await o.page.evaluate(() => ({ top: window.__game.top?.name, id: window.__v2?.id, hero: !!window.__v2?.hero, err: window.__v2?.error ? String(window.__v2.error) : null, area: window.__v2?.area?.id ?? window.__v2?.areaId ?? null }));
          ok(g.top === 'v2g' && g.hero && !g.err, `「본 게임」 → v2g, 입체 영웅 (지역 ${g.area}${g.err ? ' · 오류 ' + g.err : ''})`);
          await shot(o.page, `3d_v2g_from_chooser_${dev}`);
        }
        ok(o.bad.length === 0 && o.errs.length === 0, `4xx 0 · 페이지 오류 0${tail(o)}`);
      } catch (e) { ok(false, `부팅 ${dev}: ${String(e.message).split('\n')[0]}${tail(o)}`); }
      await o.ctx.close();
    }
    // ③ 지역마다
    for (const id of AREAS) {
      console.log(`\n== 지역 ${id} ==`);
      const o = await open('fold_open', `/index.html?scene=v2g&area=${id}&v2auto=0&nosw${RES < 1 ? '&v2res=' + RES : ''}`, `area ${id}`);
      try {
        await page_wait(o.page, () => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), 90000);
        await o.page.waitForTimeout(3000);
        const g = await o.page.evaluate(() => ({ hero: !!window.__v2?.hero, err: window.__v2?.error ? String(window.__v2.error?.message || window.__v2.error) : null, enemies: (window.__v2?.enemies || []).length }));
        ok(g.hero && !g.err, `지역이 열림 · 영웅 (적 ${g.enemies}${g.err ? ' · 오류 ' + g.err : ''})`);
        await shot(o.page, `3d_area_${id}`);
        ok(o.bad.length === 0 && o.errs.length === 0, `4xx 0 · 페이지 오류 0${tail(o)}`);
      } catch (e) { ok(false, `지역 ${id}: ${String(e.message).split('\n')[0]}${tail(o)}`); }
      await o.ctx.close();
    }
    // ④ 다른 3D 장면
    for (const id of SCENES) {
      console.log(`\n== 장면 ${id} ==`);
      const o = await open('fold_open', `/index.html?scene=${id}&nosw`, `scene ${id}`);
      try {
        await page_wait(o.page, () => { const n = window.__game.top?.constructor?.name || ''; return n && n !== 'V2Pending'; }, 60000);
        await o.page.waitForTimeout(id === 'v2bench' ? 6000 : 4000);
        const top = await o.page.evaluate(() => window.__game.top?.constructor?.name);
        ok(!!top, `장면이 열림 (${top})`);
        await shot(o.page, `3d_scene_${id}`);
        ok(o.bad.length === 0 && o.errs.length === 0, `4xx 0 · 페이지 오류 0${tail(o)}`);
      } catch (e) { ok(false, `장면 ${id}: ${String(e.message).split('\n')[0]}${tail(o)}`); }
      await o.ctx.close();
    }
  } else {
    // v1: 타이틀 메뉴 여덟 줄
    for (const dev of DEVICES) {
      console.log(`\n== 타이틀 메뉴 (${dev}) ==`);
      const o = await open(dev, '/index.html?nosw', `title ${dev}`);
      try {
        await page_wait(o.page, () => window.__game?.top?.name === 'title', 30000);
        await o.page.waitForTimeout(1200);
        for (let i = 0; i < 6 && (await o.page.evaluate(() => window.__game.top.mode)) !== 'menu'; i++) { await key(o.page, 'Enter'); await o.page.waitForTimeout(500); }
        await o.page.waitForTimeout(900);
        const st = await o.page.evaluate(() => {
          const t = window.__game.top, L = t.layout();
          const rects = (t.menu.rects || []).slice(0, t.menu.count).filter(Boolean).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
          return { mode: t.mode, ids: t.items.map((i) => i.id), count: t.menu.count, index: t.menu.index, L: { n: L.n, rowH: L.rowH, gap: L.gap, y0: L.y0, bottom: L.bottom, st: L.st, sb: L.sb, H: L.H, W: L.W }, rects };
        });
        ok(st.mode === 'menu', `타이틀 메뉴 열림 (${st.mode})`);
        ok(st.ids.length === 8 && !st.ids.includes('v2') && st.count === 8, `줄 여덟, 「리빌드 시범」 없음: ${st.ids.join(',')}`);
        const L = st.L, lastBot = L.y0 + L.n * L.rowH + (L.n - 1) * L.gap;
        ok(L.y0 >= L.st - 0.5 && lastBot <= L.bottom + 0.5 && L.rowH >= 44, `줄 배치가 화면 안 (위 ${Math.round(L.y0)} ≥ ${Math.round(L.st)}, 아래 ${Math.round(lastBot)} ≤ ${Math.round(L.bottom)} / ${Math.round(L.H)}, 줄 높이 ${L.rowH}, 틈 ${L.gap})`);
        const overlap = st.rects.some((r, i) => i > 0 && r.y < st.rects[i - 1].y + st.rects[i - 1].h - 0.5);
        ok(st.rects.length === 8 && !overlap && st.rects.every((r) => r.h >= 44 && r.y >= 0 && r.y + r.h <= L.H + 0.5), `터치 영역 여덟 (겹침 없음, 높이 ≥ 44): ${st.rects.map((r) => Math.round(r.y) + '+' + Math.round(r.h)).join(' ')}`);
        await shot(o.page, `v1_title_menu_${dev}`);
        // 키보드: ↓ 여덟 번 → 모든 줄을 지나 처음 줄로 (이어하기가 막혀 있어도 줄은 지나간다)
        const seen = new Set([st.index]);
        for (let i = 0; i < 8; i++) { await key(o.page, 'ArrowDown'); seen.add(await o.page.evaluate(() => window.__game.top.menu.index)); }
        const back = await o.page.evaluate(() => window.__game.top.menu.index);
        ok(seen.size === 8 && back === st.index, `키보드 ↓ 로 여덟 줄을 돌아 제자리 (본 줄 ${[...seen].sort().join(',')}, 끝 ${back})`);
        // 패드: 버튼 13(아래) 한 번 → 줄이 하나 옮겨진다
        await o.page.evaluate(() => {
          const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
          window.__vpad = pad;
          Navigator.prototype.getGamepads = function () { return [pad, null, null, null]; };
          const e = new Event('gamepadconnected'); Object.defineProperty(e, 'gamepad', { value: pad }); window.dispatchEvent(e);
        });
        const i0 = await o.page.evaluate(() => window.__game.top.menu.index);
        let moved = false;
        for (let k = 0; k < 3 && !moved; k++) {
          await o.page.evaluate(() => { const b = window.__vpad.buttons[13]; b.pressed = true; b.value = 1; window.__vpad.timestamp = performance.now(); });
          await o.page.waitForTimeout(120);
          await o.page.evaluate(() => { const b = window.__vpad.buttons[13]; b.pressed = false; b.value = 0; window.__vpad.timestamp = performance.now(); });
          await o.page.waitForTimeout(250);
          moved = (await o.page.evaluate(() => window.__game.top.menu.index)) !== i0;
        }
        const i1 = await o.page.evaluate(() => window.__game.top.menu.index);
        ok(moved && i1 === (i0 + 1) % 8, `패드 ↓ 로 줄이 하나 옮겨짐 (${i0} → ${i1})`);
        ok(o.bad.length === 0 && o.errs.length === 0, `4xx 0 · 페이지 오류 0${tail(o)}`);
      } catch (e) { ok(false, `타이틀 ${dev}: ${String(e.message).split('\n')[0]}${tail(o)}`); }
      await o.ctx.close();
    }
  }
} finally {
  await browser.close();
  srv.close();
}
async function page_wait(page, fn, timeout) { await page.waitForFunction(fn, null, { timeout }); }
if (all4xx.size) {
  console.log(`\n4xx 경로 ${all4xx.size}개 (처음 본 곳):`);
  for (const [p, where] of [...all4xx].sort()) console.log(`  ${p}   (${where})`);
}
console.log(fails.length ? `\n실패 ${fails.length}건` : '\n모두 통과');
process.exit(fails.length ? 1 : 0);
