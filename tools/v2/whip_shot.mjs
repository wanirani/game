// WHIP: 시험 화면(tools/v2/whip_view.html)을 헤드리스로 띄워 기술마다 붙임 그림(두 틱마다 한 칸)을 찍는다.
//   node tools/v2/whip_shot.mjs                 모든 묶음 → /tmp/claude-0/v2/whip/<이름>.png  (게임 카메라 + 가까이)
//   node tools/v2/whip_shot.mjs combo hook      이름이 그 글자로 시작하는 묶음만
//   --shot="demo:t:cam:w:h[:era[:reso[:dir]]]" --name=이름   한 장만
//   --owner    소유자용 한 장 → /tmp/claude-0/v2/owner_whip.png
//   --thick    붙임 그림 없이 화면 굵기만 잰다
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
  { n: 'far_close', demo: 'far', from: 0.45, count: 24, cam: 'close', cols: 8, cw: 300, ch: 250 },
  { n: 'launcher_game', demo: 'launcher', from: 0.45, count: 24, cam: 'game', cols: 12, cw: 200, ch: 190 },
  { n: 'launcher_close', demo: 'launcher', from: 0.45, count: 24, cam: 'close', cols: 8, cw: 240, ch: 270 },
  { n: 'slam_game', demo: 'slam', from: 1.1, count: 36, cam: 'game', cols: 12, cw: 200, ch: 190 },
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
  await page.goto(`http://localhost:${port}/tools/v2/whip_view.html?hold=1${argv.includes('--aa0') ? '&aa=0' : ''}`);   // --aa0 = 캔버스 안티에일리어싱 끔 (끈 가장자리가 스스로 부드러운지 볼 때)
  try { await page.waitForFunction(() => window.__whip?.ready || window.__whip?.error, null, { timeout: 90000 }); } catch { errs.push('timeout waiting for ready'); }
  const err = await page.evaluate(() => window.__whip?.error);
  if (err) { errs.push('[page error] ' + err); code = 1; }
  else if (opt('shot', '')) {   // --shot="demo:t:cam:w:h[:era[:reso[:dir]]]" --name=이름  (그때그때 한 장)
    const [d, t, cam, w, h, era, reso, dir] = opt('shot', '').split(':');
    const url = await page.evaluate(([d, t, o]) => window.__whip.shot(d, t, o), [d, Number(t), { cam: cam || 'close', w: Number(w) || 640, h: Number(h) || 480, era: era || 'now', reso: Number(reso ?? 0.3), dir: Number(dir ?? 0), tier: opt('tier', 'mid') }]);
    const f = path.join(outDir, (opt('name', 'shot_' + d)) + '.png'); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('wrote', f, JSON.stringify(await page.evaluate(() => window.__whip.state())).slice(0, 400));
  }
  else if (argv.includes('--owner')) {
    // 소유자용 한 장: 칸마다 한국어 설명. 솔직하게 — 아직 약한 곳도 한 줄
    const shot = (d, t, o) => page.evaluate(([d, t, o]) => window.__whip.shot(d, t, { era: 'now', reso: 0.3, dir: 0, tier: 'mid', ...o }), [d, t, o]);
    const strip = (d, o) => page.evaluate(([d, o]) => window.__whip.strip(d, { era: 'now', dir: 0, tier: 'mid', slow: false, stop: true, box: false, label: false, ...o }), [d, o]);
    const strips = [];   // 한 줄 = { t 제목, parts: [그림 dataURL …] (옆으로 이어 붙인다) }
    { const parts = []; for (const [t, lab] of [[0.6, '연타 1 — 뒤로 감았다가'], [0.7, '연타 1 — 맞는 순간'], [1.02, '연타 2 — 위에서 내리친다']]) parts.push(await shot('combo', t, { cam: 'game', w: 666, h: 360, label: lab })); strips.push({ t: '연타 3 — 게임 카메라 그대로의 크기 (영웅 키 약 76 px)', parts }); }
    { const parts = []; for (const [t, lab] of [[1.33, '연타 3 — 머리 위로 크게 돌려'], [1.45, '연타 3 — 넓게 후려친다'], [1.6, '연타 3 — 지나간 뒤']]) parts.push(await shot('combo', t, { cam: 'game', w: 666, h: 360, label: lab })); strips.push({ t: '', parts }); }
    strips.push({ t: '연타 3 — 가까이, 두 틱(1/30초)마다 한 칸: 끈이 펴지며 끝이 휘어 감기고, 맞는 순간 번쩍임과 불티 고리', parts: [await strip('combo', { from: 0.6, count: 10, every: 2, cam: 'close', cols: 10, cw: 200, ch: 190 })] });
    strips.push({ t: '모아 휘감기 → 끌어오기 (머리 위로 돌리며 모았다가 멀리 던져 감고 당긴다)', parts: [await strip('charge', { from: 1.25, count: 8, every: 5, cam: 'close', cols: 8, cw: 250, ch: 190 })] });
    strips.push({ t: '휘감아 문 당기기 (문은 시험 화면에서 흉내 낸 것 — 규칙에는 아직 문이 없다)', parts: [await strip('door', { from: 0.74, count: 8, every: 12, cam: 'close', cols: 8, cw: 250, ch: 190 })] });
    strips.push({ t: '솜씨: 빛나는 고리에 걸고 건너뛰기 — 걸리면 팽팽한 직선', parts: [await strip('hook', { from: 0.52, count: 8, every: 5, cam: 'game', cols: 8, cw: 250, ch: 200 })] });
    strips.push({ t: '종 — 짧게(메아리) 네 칸 · 길게 네 칸: 종 조각을 치켜들어 울린다', parts: [await strip('echo', { from: 0.66, count: 4, every: 6, cam: 'game', cols: 4, cw: 250, ch: 230 }), await strip('knell', { from: 1.0, count: 4, every: 16, cam: 'game', cols: 4, cw: 250, ch: 230 })] });
    const singles = [];
    for (const sg of [
      { t: '손잡이 · 땋은 끈 · 종 조각 (울림이 차면 밝아진다)', demo: 'rest', at: 0.6, o: { cam: 'macro', w: 500, h: 330, reso: 0.55 } },
      { t: '쉬는 모습: 손에 사려 쥔다', demo: 'rest', at: 0.9, o: { cam: 'close', w: 330, h: 330 } },
      { t: '그 밤(붉은 달)의 빛에서', demo: 'combo', at: 1.02, o: { cam: 'close', era: 'past', w: 330, h: 330 } },
      { t: '멀리서 (키 70 px)도 끈이 보인다', demo: 'combo', at: 0.7, o: { cam: 'far', w: 420, h: 330 } },
      { t: '먼 종 치기', demo: 'far', at: 0.75, o: { cam: 'game', w: 420, h: 330 } },
    ]) singles.push({ t: sg.t, a: await shot(sg.demo, sg.at, sg.o) });
    const weak = opt('weak', '아직 약한 곳: 이 그림은 모두 시험 화면이다 — 본 게임 장면에는 아직 꽂지 않았다. 손가락이 없어 손잡이가 손바닥에 붙어 보이고, 문 당기기 · 먼 종 치기는 규칙에 없어 흉내만 냈다. 기기 속도 · 소리는 확인 못 함.');
    const url = await page.evaluate(async ([strips, singles, weak]) => {
      const img = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; });
      const W = 2000, pad = 14, th = 36; let y = 66; const lay = [];
      for (const s of strips) { const ims = []; for (const u of s.parts) ims.push(await img(u)); const hh = Math.max(...ims.map((i) => i.height)), top = s.t ? th : 2; lay.push({ s, ims, y, top }); y += top + hh + 4; }
      y += 8; const sy = y; let sh = 0; const sing = []; for (const s of singles) { const a = await img(s.a); sing.push({ s, a }); sh = Math.max(sh, a.height); }
      y += th + sh + pad + 50;
      const c = document.createElement('canvas'); c.width = W; c.height = y; const g = c.getContext('2d');
      g.fillStyle = '#0b0d13'; g.fillRect(0, 0, W, y);
      g.fillStyle = '#ffe2b0'; g.font = 'bold 34px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText('채찍 비질리아 — 코드로 만든 3D 채찍 (땋은 가죽 끈, 끝에 종 조각)', pad, 34);
      for (const L of lay) { if (L.s.t) { g.fillStyle = '#d8cfc0'; g.font = '24px system-ui, sans-serif'; g.fillText(L.s.t, pad, L.y + th / 2); } let x = 0; for (const im of L.ims) { g.drawImage(im, x, L.y + L.top); x += im.width + (L.ims.length > 2 ? 1 : 0); } }
      let x = 0; for (const q of sing) { g.fillStyle = '#d8cfc0'; g.font = '19px system-ui, sans-serif'; g.fillText(q.s.t, x + 6, sy + th / 2, q.a.width - 10); g.drawImage(q.a, x, sy + th); x += q.a.width; }
      g.fillStyle = '#f0b090'; g.font = '22px system-ui, sans-serif'; g.fillText(weak, pad, y - 28, W - pad * 2);
      return c.toDataURL('image/png');
    }, [strips, singles, weak]);
    const f = opt('owner', '') || '/tmp/claude-0/v2/owner_whip.png'; fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('wrote', f);
  } else {
    const stats = {};
    for (const s of SETS) {
      if (argv.includes('--thick') || (want.length && !want.some((w) => s.n.startsWith(w)))) continue;   // --thick = 굵기만 잰다
      const t0 = Date.now();
      const url = await page.evaluate(([d, o]) => window.__whip.strip(d, o), [s.demo, { era: 'now', dir: 0, tier: 'mid', slow: false, stop: true, box: false, ...s }]);
      const st = await page.evaluate(() => { const L = window.__whip.lastStates; return { ext: Math.max(...L.map((q) => q.ext)), speed: Math.max(...L.map((q) => q.speed)), modes: [...new Set(L.map((q) => q.mode))].join(','), ev: [...new Set(L.flatMap((q) => q.ev).filter((e) => e.startsWith('채찍')))].join(' '), stats: L[L.length - 1].stats, ribbons: Math.max(...L.map((q) => q.fx?.ribbons ?? 0)) }; });
      const f = path.join(outDir, s.n + '.png'); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
      stats[s.n] = st;
      console.log(`wrote ${f}  (${s.count} frames, ${((Date.now() - t0) / 1000).toFixed(1)} s)  modes ${st.modes} · max ext ${st.ext} · max tip speed ${st.speed} · tris ${st.stats.tris} draws ${st.stats.draws} · ${st.ev}`);
    }
    if (!want.length || argv.includes('--thick')) {
      // 최소 굵기: 끈이 펴진 순간(연타 1 의 타격)에 끈 한가운데를 가로지르는 세로줄의 화면 굵기(px). 멀리 = 영웅 키 약 70 px
      for (const [cam, w, h] of [['far', 960, 540], ['game', 960, 540], ['far', 480, 270]]) {
        const th = await page.evaluate(([cam, w, h]) => { const a = window.__whip; a.shot('combo', 0.7, { cam, w, h, era: 'now', dir: 0 }); return [0.3, 0.55, 0.8].map((f) => a.thickness(f)); }, [cam, w, h]);
        console.log(`lash thickness on screen, camera ${cam} ${w}x${h} (at 30 % · 55 % · 80 % of the lash): ${th.map((t) => (t ? `${t.changed} px (${t.strong} solid)` : 'off screen')).join(' · ')}`);
      }
    }
  }
  const pe = await page.evaluate(() => window.__whip?.errors ?? []); for (const e of pe) errs.push('[window error] ' + e);
} catch (e) { errs.push('[exception] ' + e.message); code = 1; }
console.log(errs.length ? errs.slice(0, 12).join('\n') : 'NO ERRORS');
console.log(`page errors: ${errs.filter((e) => /pageerror|page error|window error|exception/.test(e)).length}`);
await browser.close(); srv.close();
process.exit(code || (errs.some((e) => /pageerror|page error|window error|exception/.test(e)) ? 1 : 0));
