// WHIP: 시험 화면(tools/v2/whip_view.html)을 헤드리스로 띄워 기술마다 붙임 그림(두 틱마다 한 칸)을 찍는다.
//   node tools/v2/whip_shot.mjs                 모든 묶음 → /tmp/claude-0/v2/whip/<이름>.png  (게임 카메라 + 가까이)
//   node tools/v2/whip_shot.mjs combo hook      이름이 그 글자로 시작하는 묶음만
//   --owner    소유자용 한 장 → /tmp/claude-0/v2/owner_whip.png
//   --list  --out=<폴더>
// 한 번에 브라우저 하나. 헤드리스 WebGL 은 소프트웨어 렌더링이라 느리다 (프레임 시간은 기기와 무관).
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2), want = argv.filter((a) => !a.startsWith('--'));
const opt = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const outDir = opt('out', '/tmp/claude-0/v2/whip');
fs.mkdirSync(outDir, { recursive: true });
/** 묶음: { n 이름, demo, from(초), count(칸), every(틱), cam, cols, cw, ch, dir, era, tier, slow } */
const SETS = [
  { n: 'combo_game', demo: 'combo', from: 0.5, count: 36, cam: 'game', cols: 12, cw: 200, ch: 170 },
  { n: 'combo_close', demo: 'combo', from: 0.5, count: 36, cam: 'close', cols: 9, cw: 250, ch: 230 },
  { n: 'combo_top', demo: 'combo', from: 0.5, count: 36, cam: 'top', cols: 12, cw: 190, ch: 190, box: true },
  { n: 'combo_far70', demo: 'combo', from: 0.5, count: 24, cam: 'far', cols: 12, cw: 180, ch: 130 },
  { n: 'combo_past', demo: 'combo', from: 0.5, count: 24, cam: 'game', era: 'past', cols: 12, cw: 200, ch: 170 },
  ...[2, 4, 6].map((d) => ({ n: 'combo_dir' + d, demo: 'combo', from: 0.5, count: 24, cam: 'game', dir: d, cols: 12, cw: 200, ch: 170 })),
  { n: 'combo_slow', demo: 'combo', from: 0.5, count: 24, cam: 'close', slow: true, every: 4, cols: 12, cw: 200, ch: 200 },
  { n: 'sweep_game', demo: 'sweep', from: 0.75, count: 24, cam: 'game', cols: 12, cw: 200, ch: 170 },
  { n: 'sweep_close', demo: 'sweep', from: 0.75, count: 24, cam: 'close', cols: 8, cw: 250, ch: 230 },
  { n: 'plunge_game', demo: 'plunge', from: 0.4, count: 30, cam: 'game', cols: 10, cw: 200, ch: 200 },
  { n: 'plunge_close', demo: 'plunge', from: 0.4, count: 30, cam: 'close', cols: 10, cw: 220, ch: 280 },
  { n: 'charge_game', demo: 'charge', from: 0.4, count: 40, cam: 'game', cols: 10, cw: 260, ch: 170 },
  { n: 'charge_close', demo: 'charge', from: 0.6, count: 40, cam: 'close', cols: 8, cw: 300, ch: 230 },
  { n: 'door_game', demo: 'door', from: 0.6, count: 40, every: 3, cam: 'game', cols: 10, cw: 240, ch: 180 },
  { n: 'door_close', demo: 'door', from: 0.6, count: 40, every: 3, cam: 'close', cols: 8, cw: 300, ch: 230 },
  { n: 'hook_game', demo: 'hook', from: 0.45, count: 36, cam: 'game', cols: 9, cw: 260, ch: 220 },
  { n: 'hook_close', demo: 'hook', from: 0.45, count: 30, cam: 'close', cols: 10, cw: 240, ch: 260 },
  { n: 'echo_game', demo: 'echo', from: 0.55, count: 24, cam: 'game', cols: 12, cw: 190, ch: 190 },
  { n: 'echo_close', demo: 'echo', from: 0.55, count: 24, cam: 'close', cols: 8, cw: 240, ch: 260 },
  { n: 'knell_game', demo: 'knell', from: 0.55, count: 40, every: 3, cam: 'game', cols: 10, cw: 190, ch: 200 },
  { n: 'knell_close', demo: 'knell', from: 0.55, count: 40, every: 3, cam: 'close', cols: 8, cw: 240, ch: 270 },
  { n: 'far_game', demo: 'far', from: 0.45, count: 30, cam: 'game', cols: 10, cw: 280, ch: 200 },
  { n: 'launcher_close', demo: 'launcher', from: 0.45, count: 24, cam: 'close', cols: 8, cw: 240, ch: 270 },
  { n: 'slam_close', demo: 'slam', from: 1.1, count: 36, cam: 'close', cols: 9, cw: 260, ch: 250 },
  { n: 'rest_game', demo: 'rest', from: 0.2, count: 36, every: 8, cam: 'game', cols: 12, cw: 190, ch: 170 },
  { n: 'rest_close', demo: 'rest', from: 0.2, count: 32, every: 9, cam: 'close', cols: 8, cw: 230, ch: 240 },
  { n: 'low_tier', demo: 'combo', from: 0.5, count: 24, cam: 'close', tier: 'low', cols: 8, cw: 250, ch: 230 },
  { n: 'high_tier', demo: 'combo', from: 0.5, count: 24, cam: 'close', tier: 'high', cols: 8, cw: 250, ch: 230 },
];
if (argv.includes('--list')) { for (const s of SETS) console.log(s.n.padEnd(16), s.demo.padEnd(9), s.count + ' frames', s.cam); process.exit(0); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.css': 'text/css', '.woff2': 'font/woff2' };
const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(root) || /keystore/i.test(f)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
});
const port = 9900 + Math.floor(Math.random() * 90);
await new Promise((r) => srv.listen(port, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = []; let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall due to ReadPixels/.test(m.text())) errs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/tools/v2/whip_view.html?hold=1`);
  try { await page.waitForFunction(() => window.__whip?.ready || window.__whip?.error, null, { timeout: 90000 }); } catch { errs.push('timeout waiting for ready'); }
  const err = await page.evaluate(() => window.__whip?.error);
  if (err) { errs.push('[page error] ' + err); code = 1; }
  else if (argv.includes('--owner')) {
    // 소유자용 한 장: 칸마다 한국어 설명. 솔직하게 — 아직 약한 곳도 한 줄
    const rows = [
      { t: '연타 3 — 게임 카메라 (두 틱마다 한 칸)', demo: 'combo', o: { from: 0.5, count: 30, cam: 'game', cols: 10, cw: 200, ch: 150, label: false } },
      { t: '연타 3 — 가까이: 끈이 펴지는 순간과 맞는 순간의 번쩍임', demo: 'combo', o: { from: 0.56, count: 10, every: 3, cam: 'close', cols: 10, cw: 200, ch: 190, label: false } },
      { t: '모아 휘감기 → 끌어오기', demo: 'charge', o: { from: 1.3, count: 10, every: 3, cam: 'game', cols: 10, cw: 200, ch: 130, label: false } },
      { t: '휘감아 문 당기기 (문은 시험 화면에서 흉내 낸 것)', demo: 'door', o: { from: 0.72, count: 10, every: 10, cam: 'game', cols: 10, cw: 200, ch: 150, label: false } },
      { t: '솜씨: 빛나는 고리에 걸고 건너뛰기 — 걸리면 팽팽한 직선', demo: 'hook', o: { from: 0.5, count: 10, every: 4, cam: 'game', cols: 10, cw: 200, ch: 170, label: false } },
      { t: '종 — 짧게(메아리) 다섯 칸 · 길게 다섯 칸: 종 조각을 치켜들어 울린다', demo: 'echo', o: { from: 0.62, count: 5, every: 5, cam: 'close', cols: 5, cw: 200, ch: 220, label: false }, second: { demo: 'knell', o: { from: 0.9, count: 5, every: 13, cam: 'close', cols: 5, cw: 200, ch: 220, label: false } } },
    ];
    const strips = [];
    for (const r of rows) {
      const a = await page.evaluate(([d, o]) => window.__whip.strip(d, o), [r.demo, r.o]);
      const b = r.second ? await page.evaluate(([d, o]) => window.__whip.strip(d, o), [r.second.demo, r.second.o]) : null;
      strips.push({ t: r.t, a, b });
    }
    const singles = [];
    for (const s of [
      { t: '손잡이 · 땋은 끈 · 종 조각 (가까이)', demo: 'rest', at: 0.6, o: { cam: 'macro', w: 500, h: 330, reso: 1 } },
      { t: '쉬는 모습: 손에 사려 쥔다', demo: 'rest', at: 0.9, o: { cam: 'close', w: 330, h: 330 } },
      { t: '그 밤(붉은 달)의 빛에서', demo: 'combo', at: 1.34, o: { cam: 'close', era: 'past', w: 330, h: 330 } },
      { t: '멀리서 (영웅 키 70 px): 끈이 가는 선으로 꺼지지 않는다', demo: 'combo', at: 1.34, o: { cam: 'far', w: 420, h: 330 } },
      { t: '먼 종 치기', demo: 'far', at: 0.72, o: { cam: 'game', w: 420, h: 330 } },
    ]) singles.push({ t: s.t, a: await page.evaluate(([d, t, o]) => window.__whip.shot(d, t, { era: 'now', reso: 0.3, ...o }), [s.demo, s.at, s.o]), w: s.o.w });
    const weak = opt('weak', '아직 약한 곳: 손에 손가락이 없어 손잡이가 손바닥에 붙어 보이고, 문 당기기와 올려치기·내려찍기는 규칙에 없어 시험 화면에서만 흉내 냈습니다. 실제 기기에서의 속도는 재지 못했습니다.');
    const url = await page.evaluate(async ([strips, singles, weak]) => {
      const img = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; });
      const W = 2000, pad = 14, th = 34; let y = 64; const lay = [];
      for (const s of strips) { const a = await img(s.a), b = s.b ? await img(s.b) : null; lay.push({ s, a, b, y }); y += th + a.height + pad; }
      const sy = y; let sh = 0; const sing = []; for (const s of singles) { const a = await img(s.a); sing.push({ s, a }); sh = Math.max(sh, a.height); }
      y += th + sh + pad + 48;
      const c = document.createElement('canvas'); c.width = W; c.height = y; const g = c.getContext('2d');
      g.fillStyle = '#0b0d13'; g.fillRect(0, 0, W, y);
      g.fillStyle = '#ffe2b0'; g.font = 'bold 34px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText('채찍 비질리아 — 3D 채찍 (끝에 종 조각)', pad, 34);
      g.font = '24px system-ui, sans-serif';
      for (const L of lay) { g.fillStyle = '#d8cfc0'; g.fillText(L.s.t, pad, L.y + th / 2); g.drawImage(L.a, 0, L.y + th); if (L.b) g.drawImage(L.b, L.a.width, L.y + th); }
      let x = 0; for (const q of sing) { g.fillStyle = '#d8cfc0'; g.font = '19px system-ui, sans-serif'; g.fillText(q.s.t, x + 6, sy + th / 2); g.drawImage(q.a, x, sy + th); x += q.a.width; }
      g.fillStyle = '#f0b090'; g.font = '22px system-ui, sans-serif'; g.fillText(weak, pad, y - 26, W - pad * 2);
      return c.toDataURL('image/png');
    }, [strips, singles, weak]);
    const f = opt('owner', '') || '/tmp/claude-0/v2/owner_whip.png'; fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('wrote', f);
  } else {
    const stats = {};
    for (const s of SETS) {
      if (want.length && !want.some((w) => s.n.startsWith(w))) continue;
      const t0 = Date.now();
      const url = await page.evaluate(([d, o]) => window.__whip.strip(d, o), [s.demo, { era: 'now', dir: 0, tier: 'mid', slow: false, stop: true, box: false, ...s }]);
      const st = await page.evaluate(() => { const L = window.__whip.lastStates; return { ext: Math.max(...L.map((q) => q.ext)), speed: Math.max(...L.map((q) => q.speed)), modes: [...new Set(L.map((q) => q.mode))].join(','), ev: [...new Set(L.flatMap((q) => q.ev).filter((e) => e.startsWith('채찍')))].join(' '), stats: L[L.length - 1].stats, ribbons: Math.max(...L.map((q) => q.fx?.ribbons ?? 0)) }; });
      const f = path.join(outDir, s.n + '.png'); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      stats[s.n] = st;
      console.log(`wrote ${f}  (${s.count} frames, ${((Date.now() - t0) / 1000).toFixed(1)} s)  modes ${st.modes} · max ext ${st.ext} · max tip speed ${st.speed} · tris ${st.stats.tris} draws ${st.stats.draws} · ${st.ev}`);
    }
    if (!want.length) {
      // 최소 굵기: 멀리(영웅 키 70 px) · 게임 카메라에서 끈 한가운데의 화면 굵기(px)
      for (const cam of ['far', 'game']) { const th = await page.evaluate(([cam]) => { const a = window.__whip; a.shot('rest', 0.6, { cam, w: 960, h: 540, era: 'now' }); a.S.cam = cam; return a.thickness(); }, [cam]); console.log(`thickness at camera ${cam}: ${JSON.stringify(th)}`); }
    }
  }
  const pe = await page.evaluate(() => window.__whip?.errors ?? []); for (const e of pe) errs.push('[window error] ' + e);
} catch (e) { errs.push('[exception] ' + e.message); code = 1; }
console.log(errs.length ? errs.slice(0, 12).join('\n') : 'NO ERRORS');
console.log(`page errors: ${errs.filter((e) => /pageerror|page error|window error|exception/.test(e)).length}`);
await browser.close(); srv.close();
process.exit(code || (errs.some((e) => /pageerror|page error|window error|exception/.test(e)) ? 1 : 0));
