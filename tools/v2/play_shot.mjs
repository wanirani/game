// PLAY: 시험 화면(tools/v2/play_view.html)을 헤드리스로 띄워 움직임 붙임 그림(contact sheet)을 찍는다.
//   node tools/v2/play_shot.mjs                 모든 묶음 → /tmp/claude-0/v2/play/<이름>.jpg
//   node tools/v2/play_shot.mjs run turn        이름이 그 글자로 시작하는 묶음만
//   node tools/v2/play_shot.mjs --page=fight    폴드 편 화면 크기로 한 장면 전체(단추 포함) → page_<demo>.png
//   --out=<폴더>  --list
// 한 번에 브라우저 하나. 헤드리스 WebGL 은 소프트웨어 렌더링이라 느리다(프레임 시간은 기기와 무관).
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2), want = argv.filter((a) => !a.startsWith('--'));
const opt = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const outDir = opt('out', '/tmp/claude-0/v2/play');
const range = (a, b, s) => { const o = []; for (let t = a; t <= b + 1e-6; t += s) o.push(+t.toFixed(4)); return o; };
const C8 = Array.from({ length: 8 }, (_, k) => k * 2.48).flatMap((b) => [b + 0.31, b + 0.6, b + 1.02]);
/** 묶음: { 이름, demo, times, cam, cols, cw, ch, box, who(적의 클립을 이름표로) } */
const SETS = [
  { n: 'run8_close', demo: 'run8', times: range(0.125, 10, 0.125), cam: 'close', cols: 10, cw: 190, ch: 200 },
  { n: 'run8_game', demo: 'run8', times: range(0.25, 10, 0.25), cam: 'game', cols: 10, cw: 240, ch: 200 },
  { n: 'turn_close', demo: 'turn', times: range(0.7, 5.9, 0.0667), cam: 'close', cols: 13, cw: 170, ch: 190 },
  { n: 'turn_top', demo: 'turn', times: range(0.8, 3.0, 0.05), cam: 'top', cols: 15, cw: 150, ch: 150, box: true },
  { n: 'walk_close', demo: 'walk', times: range(0.1, 7.3, 0.15), cam: 'close', cols: 12, cw: 170, ch: 190 },
  { n: 'combo1_close', demo: 'combo1', times: range(0.36, 1.92, 0.0333), cam: 'close', cols: 12, cw: 190, ch: 200 },
  { n: 'combo1_side', demo: 'combo1', times: range(0.36, 1.92, 0.0333), cam: 'side', cols: 12, cw: 190, ch: 200 },
  { n: 'combo1_top', demo: 'combo1', times: range(0.36, 1.92, 0.0333), cam: 'top', cols: 12, cw: 170, ch: 170, box: true },
  { n: 'comboUp_close', demo: 'comboUp', times: range(0.3, 4.1, 0.0667), cam: 'close', cols: 12, cw: 190, ch: 200 },
  { n: 'combo8_high', demo: 'combo', times: C8, cam: 'high', cols: 6, cw: 300, ch: 240, box: true },
  { n: 'roll_close', demo: 'roll', times: [...range(0.25, 1.4, 0.05), ...range(4.85, 6.0, 0.05)], cam: 'close', cols: 12, cw: 190, ch: 200 },
  { n: 'roll_game', demo: 'roll', times: range(0.2, 6.2, 0.125), cam: 'game', cols: 12, cw: 200, ch: 170, box: true },
  { n: 'jump_close', demo: 'jump', times: [...range(0.35, 1.5, 0.05), ...range(1.9, 3.25, 0.05)], cam: 'close', cols: 13, cw: 180, ch: 230 },
  { n: 'jump_side', demo: 'jump', times: range(1.9, 3.25, 0.05), cam: 'side', cols: 14, cw: 170, ch: 230 },
  { n: 'guard_close', demo: 'guard', times: range(0.6, 7.8, 0.1), cam: 'close', cols: 12, cw: 200, ch: 200, box: true },
  { n: 'block_close', demo: 'block', times: range(0.6, 5.3, 0.1), cam: 'close', cols: 12, cw: 200, ch: 200 },
  { n: 'hurt_game', demo: 'hurt', times: range(0.4, 9.9, 0.16), cam: 'game', cols: 12, cw: 210, ch: 180 },
  ...['soldier', 'mage', 'corpse', 'ghost', 'armor', 'bat'].map((k) => ({ n: 'enemy_' + k, demo: k, times: range(0.3, 9.0, 0.15), cam: 'game', cols: 10, cw: 260, ch: 200, box: true, who: true })),
  { n: 'fight_game', demo: 'fight', times: range(0.5, 20, 0.33), cam: 'game', cols: 10, cw: 260, ch: 190, box: true },
  { n: 'elite_game', demo: 'elite', times: range(0.5, 20, 0.33), cam: 'game', cols: 10, cw: 260, ch: 190, box: true },
];
if (argv.includes('--list')) { for (const s of SETS) console.log(s.n.padEnd(16), s.demo.padEnd(9), s.times.length + ' frames', s.cam); process.exit(0); }
fs.mkdirSync(outDir, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || /keystore/i.test(f)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
});
const port = 9500 + Math.floor(Math.random() * 400);
await new Promise((r) => srv.listen(port, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
let code = 0;
try {
  const pageDemo = opt('page', null);
  const page = await (await browser.newContext({ viewport: pageDemo ? { width: 884, height: 1104 } : { width: 400, height: 300 }, deviceScaleFactor: 1 })).newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/tools/v2/play_view.html?hold=${pageDemo ? 0 : 1}${pageDemo ? '&demo=' + pageDemo + '&box=1' : ''}`);
  try { await page.waitForFunction(() => window.__play?.ready || window.__play?.error, null, { timeout: 90000 }); } catch { errs.push('timeout waiting for ready'); }
  const err0 = await page.evaluate(() => window.__play?.error ?? null);
  if (err0) { errs.push('page error: ' + err0); code = 1; }
  else if (pageDemo) {
    await page.waitForTimeout(Number(opt('wait', 6000)));
    const f = path.join(outDir, `page_${pageDemo}.png`); await page.screenshot({ path: f }); console.log('wrote', f, JSON.stringify(await page.evaluate(() => window.__play.state())).slice(0, 600));
  } else {
    await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; document.getElementById('info').style.display = 'none'; });
    for (const s of SETS) {
      if (want.length && !want.some((w) => s.n.startsWith(w))) continue;
      const t0 = Date.now();
      const url = await page.evaluate((s) => window.__play.sheet(s.demo, s.times, { cols: s.cols, cw: s.cw, ch: s.ch, cam: s.cam, box: s.box, who: s.who }), s);
      const f = path.join(outDir, s.n + '.jpg'); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      const stt = await page.evaluate(() => window.__play.lastStates);
      fs.writeFileSync(path.join(outDir, s.n + '.json'), JSON.stringify(stt));
      const clips = [...new Set(stt.map((q) => q.hero.clip))].join(' '), eclips = [...new Set(stt.flatMap((q) => q.enemies.map((e) => e.clip)))].join(' ');
      console.log(`wrote ${f}  (${s.times.length} frames, ${((Date.now() - t0) / 1000).toFixed(1)} s)  hero clips: ${clips}${eclips ? '  enemy clips: ' + eclips : ''}`);
    }
  }
} catch (e) { errs.push('exception: ' + (e?.stack ?? e)); code = 1; }
console.log(errs.length ? errs.slice(0, 12).join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
process.exit(code || (errs.some((e) => /pageerror|page error|exception/.test(e)) ? 1 : 0));
