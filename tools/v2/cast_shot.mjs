// v2 char3d: 뷰어(tools/v2/cast_view.html)를 헤드리스로 띄워 장면을 찍는다.
//   node tools/v2/cast_shot.mjs <out.png> <glb 주소 또는 /__x/파일> '<JSON 목록: [{yaw,clip,t,zoom,pitch,light,weapon,label}]>' [칸 w] [칸 h] [열] [추가 쿼리]
//   --extra=<dir> 를 주면 그 폴더를 /__x/ 로 내준다 (저장소 밖 작업 파일을 볼 때).
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8);
const [out, glb = '../../assets/v2/char3d/kael.glb', shotsJson = '[{"yaw":20}]', cw = '360', chh = '520', cols = '4', query = ''] = args;
const shots = JSON.parse(shotsJson);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = extra && u.startsWith('/__x/') ? path.join(extra, u.slice(5)) : path.join(root, u);
  if (!(f.startsWith(root) || (extra && f.startsWith(extra)))) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
});
const port = 8900 + Math.floor(Math.random() * 600);
await new Promise((r) => srv.listen(port, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = Number(cw), H = Number(chh), C = Math.min(Number(cols), shots.length), rows = Math.ceil(shots.length / C);
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
await page.goto(`http://localhost:${port}/tools/v2/cast_view.html?glb=${encodeURIComponent(glb)}${query ? '&' + query : ''}`);
try { await page.waitForFunction(() => window.__c3d?.ready || window.__c3d?.error, null, { timeout: 30000 }); } catch { errs.push('timeout'); }
const meta = await page.evaluate(() => { window.__c3d.hold = true; document.getElementById('ui').style.display = 'none'; document.getElementById('info').style.display = 'none'; return { info: window.__c3d.info, error: window.__c3d.error, gl: window.__c3d.gl }; });
const tiles = [];
for (const s of shots) {
  await page.evaluate((s) => window.__c3d.draw({ yaw: s.yaw ?? 20, pitch: s.pitch ?? 6, clip: s.clip ?? 'bind', fixed: s.t ?? 0, zoom: s.zoom ?? 'body', light: s.light ?? 'studio', weapon: s.weapon ?? false, tint: s.tint ?? [1, 1, 1] }), s);
  tiles.push({ buf: await page.screenshot({ type: 'png' }), label: s.label ?? `${s.clip ?? 'bind'} ${s.t ?? 0} y${s.yaw ?? 20}` });
}
// 한 장으로 이어 붙인다 (브라우저 캔버스로)
const sheet = await browser.newPage({ viewport: { width: C * W, height: rows * H }, deviceScaleFactor: 1 });
await sheet.setContent(`<body style="margin:0;background:#000"><canvas id="c" width="${C * W}" height="${rows * H}"></canvas></body>`);
await sheet.evaluate(async ({ tiles, W, H, C }) => {
  const x = document.getElementById('c').getContext('2d');
  for (let i = 0; i < tiles.length; i++) {
    const im = new Image(); im.src = 'data:image/png;base64,' + tiles[i].b64; await im.decode();
    const cx = (i % C) * W, cy = Math.floor(i / C) * H; x.drawImage(im, cx, cy);
    x.font = '600 13px sans-serif'; x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(cx, cy, x.measureText(tiles[i].label).width + 12, 20); x.fillStyle = '#ffe9b0'; x.fillText(tiles[i].label, cx + 6, cy + 14);
  }
}, { tiles: tiles.map((t) => ({ b64: t.buf.toString('base64'), label: t.label })), W, H, C });
await sheet.locator('#c').screenshot({ path: out });
console.log(JSON.stringify(meta).slice(0, 1500));
console.log(errs.length ? errs.slice(0, 10).join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
