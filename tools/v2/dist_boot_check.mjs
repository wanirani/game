#!/usr/bin/env node
// 배포 빌드(dist/web)에서 3D 판 장면이 실제로 열리는지 본다 — APK 를 내기 전 마지막 확인.
//   node tools/v2/dist_boot_check.mjs [--dir dist/web] [--scenes v2b,v2c,v2bench] [--shots <폴더>]
//  장면마다: 페이지 오류 0 · 400 이상 응답 0 (tools/deploy/v2_ship.txt 에서 빠진 파일을 달라고 하면 여기서 잡힌다) ·
//           장면이 떠 있음 · (v2b/v2c) window.__v2 와 입체 카엘 모델 요청 · 캔버스에 그림이 있음
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const DIR = path.resolve(arg('--dir', 'dist/web'));
const SCENES = arg('--scenes', 'v2b,v2c,v2bench').split(',').filter(Boolean);
const SHOTS = arg('--shots', null);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
if (!fs.existsSync(path.join(DIR, 'index.html'))) { console.error(`배포 빌드가 없습니다: ${DIR} (먼저 node tools/deploy/build_web.mjs)`); process.exit(2); }

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
const port = 9100 + (process.pid % 700);
await new Promise((r) => srv.listen(port, r));

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const IGNORE = /ERR_CERT|ERR_INTERNET_DISCONNECTED|fonts\.g/;
const fails = [];
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) fails.push(m); return c; };

const browser = await chromium.launch({ executablePath: fs.existsSync(EXE) ? EXE : undefined, args: GL_ARGS });
try {
  for (const id of SCENES) {
    console.log(`\n== ${id} ==`);
    // 폴드를 편 화면 (터치)
    const ctx = await browser.newContext({ viewport: { width: 960, height: 726 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errs = [], bad = [], reqs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text()) && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
    page.on('response', (r) => { const u = new URL(r.url()); if (u.port === String(port)) { reqs.push(u.pathname); if (r.status() >= 400) bad.push(`${r.status()} ${u.pathname}`); } });
    try {
      await page.goto(`http://localhost:${port}/index.html?scene=${id}&nosw`);
      await page.waitForFunction(() => !!window.__game?.top, null, { timeout: 45000 });
      const isBench = id === 'v2bench';
      if (isBench) {
        await page.waitForFunction(() => { const n = window.__game.top?.constructor?.name || ''; return n && n !== 'V2Pending'; }, null, { timeout: 45000 });
        await page.waitForTimeout(6000);
      } else {
        await page.waitForFunction(() => !!window.__v2?.hero, null, { timeout: 60000 });
        await page.waitForTimeout(4000);
      }
      const info = await page.evaluate(() => {
        const t = window.__game.top;
        return { top: t?.constructor?.name, err: t?.err ? String(t.err.message || t.err) : null, v2: window.__v2 ? { id: window.__v2.id, section: window.__v2.section, hero: !!window.__v2.hero, enemies: (window.__v2.enemies || []).length } : null , canvases: document.querySelectorAll('canvas').length };
      });
      ok(info.top && info.top !== 'V2Pending' && !info.err, `장면이 열림 (${info.top}${info.err ? ` · 오류: ${info.err}` : ''})`);
      if (!isBench) ok(!!info.v2?.hero, `window.__v2 (id ${info.v2?.id}, 구간 ${info.v2?.section}, 적 ${info.v2?.enemies})`);
      // 화면에 그림이 있는가: 빈 화면의 PNG 는 아주 작다 (WebGL 캔버스는 다른 캔버스로 옮겨 그리면 비어 보일 수 있어 화면 캡처로 본다)
      const shot = await page.screenshot(SHOTS ? { path: path.join(SHOTS, `${id}.png`) } : {});
      ok(shot.length >= 150_000, `화면에 그림이 있음 (캡처 ${(shot.length / 1024).toFixed(0)} KB, 캔버스 ${info.canvases}개)`);
      ok(reqs.some((p) => p.endsWith('/kael.glb')), '입체 카엘 모델을 받음 (assets/v2/char3d/kael.glb)');
      if (id === 'v2c') ok(reqs.some((p) => p.startsWith('/assets/v2/env/')), `꾸민 배경 질감을 받음 (${reqs.filter((p) => p.startsWith('/assets/v2/env/')).length}개)`);
      ok(bad.length === 0, `400 이상 응답 없음${bad.length ? ` — ${bad.slice(0, 6).join(', ')}` : ''}`);
      ok(errs.length === 0, `페이지 오류 없음${errs.length ? ` — ${errs.slice(0, 4).join(' | ')}` : ''}`);
    } catch (e) {
      ok(false, `${id}: ${String(e.message).split('\n')[0]}${errs.length ? ` — ${errs.slice(0, 3).join(' | ')}` : ''}${bad.length ? ` — ${bad.slice(0, 4).join(', ')}` : ''}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(fails.length ? `\n실패 ${fails.length}건` : '\n모두 통과');
process.exit(fails.length ? 1 : 0);
