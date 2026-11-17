// v2 animreview: 소유자용 한 장 — 카엘의 주요 순간(달리기 · 구르기 · 3연타 · 강공격 · 막기 · 튕겨내기 · 피격 · 주문)을 한국어 이름표와 함께. docs/v2/ANIM_LIBRARY.md §11
//   node tools/v2/animreview_owner.mjs <out.png> [--glb=모델] [--cw=250 --ch=300]
// 라이브러리 뷰어(tools/v2/animlib_view.html)를 헤드리스로 띄워 정해 둔 (클립, 시각)을 찍고 한 장으로 붙인다.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), '1'] : [a.slice(2, i), a.slice(i + 1)]; }));
const out = args[0]; if (!out) { console.error('usage: animreview_owner.mjs <out.png>'); process.exit(2); }
const W = Number(opt.cw ?? 250), H = Number(opt.ch ?? 300);
// 줄마다: 제목 + 칸들 {c 클립, t 시각(초), l 이름표, k 강조('hit' = 타격 순간)}
const ROWS = [
  { title: '달리기 · 구르기', tiles: [
    { c: 'run', t: 0.0, l: '달리기 ① 오른발 디딤' }, { c: 'run', t: 0.2, l: '달리기 ② 뜬 순간' }, { c: 'run', t: 0.43, l: '달리기 ③ 왼발 디딤' },
    { c: 'roll', t: 0.18, l: '구르기 ① 몸을 낮춤' }, { c: 'roll', t: 0.5, l: '구르기 ② 구르는 중' }, { c: 'roll', t: 0.8, l: '구르기 ③ 일어섬' }, { c: 'roll', t: 1.15, l: '구르기 ④ 다시 준비 자세' } ] },
  { title: '3연타 — 사선 내려베기 → 되받아 긋기 → 한 바퀴 돌며 넓게', tiles: [
    { c: 'atk1', t: 0.14, l: '1타 준비' }, { c: 'atk1', t: 0.33, l: '1타 타격', k: 'hit' },
    { c: 'atk2', t: 0.17, l: '2타 준비' }, { c: 'atk2', t: 0.4, l: '2타 타격', k: 'hit' },
    { c: 'atk3', t: 0.42, l: '3타 준비 (몸을 틂)' }, { c: 'atk3', t: 0.73, l: '3타 타격 (넓게)', k: 'hit' }, { c: 'atk3', t: 1.05, l: '3타 마무리' } ] },
  { title: '강공격 · 막기 · 튕겨내기 · 피격 · 주문', tiles: [
    { c: 'heavy', t: 0.75, l: '강공격 준비 (머리 위로)' }, { c: 'heavy', t: 1.23, l: '강공격 타격', k: 'hit' },
    { c: 'block', t: 0.5, l: '막기 (누르는 동안)' }, { c: 'parry', t: 0.2, l: '튕겨내기 (새로 바꿈)', k: 'hit' },
    { c: 'hit_heavy', t: 0.3, l: '피격 (강하게 맞음)' },
    { c: 'cast_big', t: 0.6, l: '주문 모으기' }, { c: 'cast_big', t: 1.7, l: '주문 터뜨림', k: 'hit' } ] },
];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const srv = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; } fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); }); });
const port = 9100 + Math.floor(Math.random() * 300);
await new Promise((r) => srv.listen(port, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let ok = false, tries = 0;
while (!ok && tries++ < 4) {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`http://localhost:${port}/tools/v2/animlib_view.html?glb=${encodeURIComponent(opt.glb ?? '../../assets/v2/char3d/kael.glb')}&weapon=1`);
  await page.waitForFunction(() => window.__al?.ready || window.__al?.error, null, { timeout: 60000 });
  const meta = await page.evaluate(() => { window.__al.hold = true; document.getElementById('ui').style.display = 'none'; document.getElementById('info').style.display = 'none'; return { info: window.__al.info, error: window.__al.error }; });
  if (meta.error) { console.error('뷰어 오류: ' + meta.error); break; }
  const rows = [];
  for (const r of ROWS) { const tiles = []; for (const t of r.tiles) { if (!meta.info.clips[t.c]) { console.error('없는 클립 ' + t.c); continue; } await page.evaluate((o) => window.__al.draw(o), { clip: t.c, fixed: t.t, yaw: Number(opt.yaw ?? 38), pitch: Number(opt.pitch ?? 30), zoom: opt.zoom ?? 'body' }); tiles.push({ b64: (await page.screenshot({ type: 'png' })).toString('base64'), l: t.l, k: t.k ?? '', sub: `${t.c} ${t.t.toFixed(2)}초` }); } rows.push({ title: r.title, tiles }); }
  if (await page.evaluate(() => window.__al.lost?.() ?? false)) { console.log('GL 컨텍스트를 잃었습니다 — 다시 찍습니다'); await page.context().close(); continue; }
  const C = Math.max(...rows.map((r) => r.tiles.length)), TH = 34, HEAD = 64, FOOT = 30, SW = C * W, SH = HEAD + rows.length * (TH + H) + FOOT;
  const sheet = await browser.newPage({ viewport: { width: SW, height: SH }, deviceScaleFactor: 1 });
  await sheet.setContent(`<body style="margin:0;background:#0c0f16"><canvas id="c" width="${SW}" height="${SH}"></canvas></body>`);
  await sheet.evaluate(async ({ rows, W, H, TH, HEAD, SW, SH }) => {
    const x = document.getElementById('c').getContext('2d'), F = '"Noto Sans KR","WenQuanYi Zen Hei",sans-serif';
    x.fillStyle = '#0c0f16'; x.fillRect(0, 0, SW, SH);
    x.fillStyle = '#ffe9b0'; x.font = `700 26px ${F}`; x.fillText('카엘 — 새 움직임의 주요 순간', 16, 34);
    x.fillStyle = '#9fb0c8'; x.font = `15px ${F}`; x.fillText('공용 클립 라이브러리(71개)에서 뽑은 장면 · 빨간 테두리 = 타격/터뜨림 순간(소리 · 효과 · 멈칫을 얹는 프레임) · 검수 2026-11-17', 16, 56);
    let y = HEAD;
    for (const r of rows) {
      x.fillStyle = '#1a2130'; x.fillRect(0, y, SW, TH); x.fillStyle = '#c9a66a'; x.font = `700 18px ${F}`; x.fillText(r.title, 14, y + 23); y += TH;
      for (let i = 0; i < r.tiles.length; i++) {
        const t = r.tiles[i], im = new Image(); im.src = 'data:image/png;base64,' + t.b64; await im.decode();
        const cx = i * W; x.drawImage(im, cx, y);
        x.font = `700 15px ${F}`; const tw = x.measureText(t.l).width;
        x.fillStyle = 'rgba(0,0,0,.72)'; x.fillRect(cx, y, tw + 16, 26); x.fillStyle = t.k ? '#ff8a8a' : '#ffe9b0'; x.fillText(t.l, cx + 8, y + 18);
        x.font = `12px ${F}`; x.fillStyle = '#9fb0c8'; x.fillText(t.sub, cx + 8, y + H - 8);
        if (t.k) { x.strokeStyle = '#e0485a'; x.lineWidth = 3; x.strokeRect(cx + 1.5, y + 1.5, W - 3, H - 3); }
        else { x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1; x.strokeRect(cx + 0.5, y + 0.5, W - 1, H - 1); }
      }
      y += H;
    }
    x.fillStyle = '#7f8aa0'; x.font = `13px ${F}`; x.fillText('보는 각도는 게임 카메라처럼 위에서 비스듬히. 무기는 시험용 칼(실제 채찍은 코드가 그리는 띠). 전부 보기: tools/v2/animlib_view.html', 16, SH - 10);
  }, { rows, W, H, TH, HEAD, SW, SH });
  await sheet.locator('#c').screenshot({ path: out });
  console.log(`${out}: ${SW}×${SH} · 칸 ${rows.reduce((s, r) => s + r.tiles.length, 0)}`);
  ok = true;
}
await browser.close(); srv.close();
process.exit(ok ? 0 : 1);
