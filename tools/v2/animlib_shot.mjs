// v2 animlib: 라이브러리 뷰어(tools/v2/animlib_view.html)를 헤드리스로 띄워 찍는다. docs/v2/ANIM_LIBRARY.md §6
//   node tools/v2/animlib_shot.mjs sheet <out.png> <묶음 이름 | 클립,클립,…> [--glb=모델 주소] [--cw=200 --ch=250 --cols=6] [--yaw=30 --pitch=24 --zoom=wide] [--extra=폴더]
//       클립마다 세 순간(공격: 준비 · 타격 · 마무리 / 순환: 0 · ⅓ · ⅔ / 그 밖: 15 · 50 · 88%)을 한 줄로.
//   node tools/v2/animlib_shot.mjs video <out.mp4> '<JSON {steps:[{clip, at, fade, speed, move:[dx,dz], moveT:[t0,t1]}], dur, fps, w, h, yaw, pitch, zoom}>' [--glb=…]
//       정해 둔 순서대로 클립을 바꿔 가며(실제 Animator 의 섞기 그대로) 프레임을 찍어 ffmpeg 로 묶는다.
//   node tools/v2/animlib_shot.mjs info <out.json> [--glb=…]     → 뷰어가 읽은 클립 목록
//   --extra=<dir> : 그 폴더를 /__x/ 로 내준다 (저장소 밖 모델을 볼 때 --glb=/__x/파일.glb).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), '1'] : [a.slice(2, i), a.slice(i + 1)]; }));
const [mode, out, what = 'locomotion'] = args;
if (!mode || !out) { console.error('usage: animlib_shot.mjs sheet|video|info <out> …'); process.exit(2); }
const extra = opt.extra ?? '';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = extra && u.startsWith('/__x/') ? path.join(extra, u.slice(5)) : path.join(root, u);
  if (!(f.startsWith(root) || (extra && f.startsWith(extra)))) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
});
const port = 9500 + Math.floor(Math.random() * 400);
await new Promise((r) => srv.listen(port, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [];
async function open(W, H) {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  const glb = opt.glb ?? '../../assets/v2/char3d/kael.glb';
  await page.goto(`http://localhost:${port}/tools/v2/animlib_view.html?glb=${encodeURIComponent(glb)}${opt.lib ? '&lib=' + encodeURIComponent(opt.lib) : ''}&weapon=${opt.weapon ?? '1'}`);
  try { await page.waitForFunction(() => window.__al?.ready || window.__al?.error, null, { timeout: 60000 }); } catch { errs.push('timeout'); }
  const meta = await page.evaluate(() => { window.__al.hold = true; document.getElementById('ui').style.display = 'none'; document.getElementById('info').style.display = 'none'; return { info: window.__al.info, error: window.__al.error, title: window.__al.title }; });
  if (meta.error) { console.error('뷰어 오류: ' + meta.error); }
  return { page, meta };
}

const lost = (page) => page.evaluate(() => window.__al.lost?.() ?? false).catch(() => true);
let tries = 0, again = true;
while (again && tries++ < 4) {
again = false; errs.length = 0;
if (mode === 'info') {
  const { meta } = await open(400, 400);
  fs.writeFileSync(out, JSON.stringify(meta, null, 1)); console.log(meta.title, '· 클립', Object.keys(meta.info?.clips ?? {}).length);
} else if (mode === 'sheet') {
  const W = Number(opt.cw ?? 200), H = Number(opt.ch ?? 250), cols = Number(opt.cols ?? 6);
  const { page, meta } = await open(W, H);
  const all = meta.info.clips, names = what.includes(',') || all[what] ? what.split(',') : Object.keys(all).filter((k) => all[k].g === what);
  const tiles = [];
  for (const n of names) {
    const c = all[n]; if (!c) { errs.push('없는 클립 ' + n); continue; }
    const d = c.d, hit = c.ev.find((e) => e[1] === 'hit' || e[1] === 'release');
    const ts = c.loop ? [0, d / 3, (2 * d) / 3] : c.strike ? [Math.max(0, c.strike[0] - 0.13), hit ? hit[0] : (c.strike[0] + c.strike[1]) / 2, Math.min(d, c.strike[1] + 0.22)] : hit ? [Math.max(0, hit[0] - 0.25), hit[0], Math.min(d, hit[0] + 0.4)] : [d * 0.15, d * 0.5, d * 0.88];
    for (let i = 0; i < 3; i++) {
      await page.evaluate((o) => window.__al.draw(o), { clip: n, fixed: ts[i], yaw: Number(opt.yaw ?? 30), pitch: Number(opt.pitch ?? 24), zoom: opt.zoom ?? 'wide' });
      tiles.push({ buf: await page.screenshot({ type: 'png' }), label: i === 0 ? `${n}  ${d.toFixed(2)}s${c.loop ? ' ∞' : ''}` : '', sub: ts[i].toFixed(2) + (i === 1 && hit ? ' ' + hit[1] : '') });
    }
  }
  const C = Math.min(cols, tiles.length), rows = Math.ceil(tiles.length / C);
  const sheet = await browser.newPage({ viewport: { width: C * W, height: rows * H }, deviceScaleFactor: 1 });
  await sheet.setContent(`<body style="margin:0;background:#000"><canvas id="c" width="${C * W}" height="${rows * H}"></canvas></body>`);
  await sheet.evaluate(async ({ tiles, W, H, C }) => {
    const x = document.getElementById('c').getContext('2d');
    for (let i = 0; i < tiles.length; i++) {
      const im = new Image(); im.src = 'data:image/png;base64,' + tiles[i].b64; await im.decode();
      const cx = (i % C) * W, cy = Math.floor(i / C) * H; x.drawImage(im, cx, cy);
      x.font = '600 13px sans-serif';
      if (tiles[i].label) { x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(cx, cy, x.measureText(tiles[i].label).width + 12, 20); x.fillStyle = '#ffe9b0'; x.fillText(tiles[i].label, cx + 6, cy + 14); x.fillStyle = '#c0485a'; x.fillRect(cx, cy, 2, H); }
      x.font = '11px sans-serif'; x.fillStyle = '#9fb0c8'; x.fillText(tiles[i].sub, cx + 6, cy + H - 6);
    }
  }, { tiles: tiles.map((t) => ({ b64: t.buf.toString('base64'), label: t.label, sub: t.sub })), W, H, C });
  if (await lost(page)) { again = true; console.log('GL 컨텍스트를 잃었습니다 — 다시 찍습니다'); await page.context().close(); continue; }
  await sheet.locator('#c').screenshot({ path: out });
  console.log(`${out}: 클립 ${names.length}개 · 칸 ${tiles.length}`);
} else if (mode === 'strip') {   // 클립 하나를 고르게 n 장 (자를 곳을 정할 때)
  const W = Number(opt.cw ?? 150), H = Number(opt.ch ?? 190), n = Number(opt.n ?? 12);
  const { page, meta } = await open(W, H);
  const names = what.split(','), tiles = [];
  for (const nm of names) { const c = meta.info.clips[nm]; if (!c) { errs.push('없는 클립 ' + nm); continue; } const t0 = Number(opt.t0 ?? 0), t1 = Number(opt.t1 ?? c.d);
    for (let i = 0; i < n; i++) { const t = t0 + ((t1 - t0) * i) / (n - 1); await page.evaluate((o) => window.__al.draw(o), { clip: nm, fixed: t, yaw: Number(opt.yaw ?? 30), pitch: Number(opt.pitch ?? 24), zoom: opt.zoom ?? 'wide' }); tiles.push({ buf: await page.screenshot({ type: 'png' }), label: i === 0 ? nm : '', sub: t.toFixed(2) }); } }
  const sheet = await browser.newPage({ viewport: { width: n * W, height: names.length * H }, deviceScaleFactor: 1 });
  await sheet.setContent(`<body style="margin:0;background:#000"><canvas id="c" width="${n * W}" height="${names.length * H}"></canvas></body>`);
  await sheet.evaluate(async ({ tiles, W, H, C }) => { const x = document.getElementById('c').getContext('2d'); for (let i = 0; i < tiles.length; i++) { const im = new Image(); im.src = 'data:image/png;base64,' + tiles[i].b64; await im.decode(); const cx = (i % C) * W, cy = Math.floor(i / C) * H; x.drawImage(im, cx, cy); x.font = '600 12px sans-serif'; x.fillStyle = '#ffe9b0'; x.fillText((tiles[i].label ? tiles[i].label + ' ' : '') + tiles[i].sub, cx + 4, cy + 13); } }, { tiles: tiles.map((t) => ({ b64: t.buf.toString('base64'), label: t.label, sub: t.sub })), W, H, C: n });
  await sheet.locator('#c').screenshot({ path: out });
} else if (mode === 'video') {
  const T = JSON.parse(what), fps = T.fps ?? 30, W = T.w ?? 540, H = T.h ?? 480;
  const { page, meta } = await open(W, H);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alvid-'));
  await page.evaluate((o) => { Object.assign(window.__al.S, o); }, { yaw: T.yaw ?? 35, pitch: T.pitch ?? 36, zoom: T.zoom ?? 'game', x: 0, z: 0 });
  const N = Math.round(T.dur * fps), started = new Set(), log = [];
  for (let i = 0; i < N; i++) {
    const t = i / fps; let x = T.start?.[0] ?? 0, z = T.start?.[1] ?? 0;
    for (const [k, s] of T.steps.entries()) {
      if (t + 1e-6 < s.at) continue;
      if (!started.has(k)) { started.add(k); await page.evaluate((s) => window.__al.play(s.clip, { fade: s.fade ?? 0.12, ...(s.speed != null ? { speed: s.speed } : {}) }), s); }
      if (s.move) { const sp = s.speed ?? meta.info.clips[s.clip]?.speed ?? 1, mt = s.moveT ?? [0, meta.info.clips[s.clip].d], a = s.at + mt[0] / sp, b = s.at + mt[1] / sp, u = Math.max(0, Math.min(1, (t - a) / Math.max(0.01, b - a))); x += s.move[0] * u; z += s.move[1] * u; }
    }
    const ev = await page.evaluate(({ x, z, dt }) => { const A = window.__al; A.S.x = x; A.S.z = z; A.events.length = 0; A.tick(dt); return A.events.slice(); }, { x, z, dt: i === 0 ? 0 : 1 / fps });
    for (const e of ev) log.push(`${t.toFixed(2)} ${e[0]}`);
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.png`), type: 'png' });
  }
  if (await lost(page)) { again = true; console.log('GL 컨텍스트를 잃었습니다 — 다시 찍습니다'); fs.rmSync(dir, { recursive: true, force: true }); await page.context().close(); continue; }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', out]);
  if (opt.strip) {   // 프레임 몇 장을 한 줄로 (눈으로 확인용)
    const k = Number(opt.strip), pick = Array.from({ length: k }, (_, i) => path.join(dir, `f${String(Math.round((i * (N - 1)) / (k - 1))).padStart(4, '0')}.png`));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...pick.flatMap((p) => ['-i', p]), '-filter_complex', `hstack=inputs=${k},scale=iw/2:ih/2`, out.replace(/\.\w+$/, '_strip.jpg')]);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${out}: ${N} 프레임 ${T.dur}초 · 이벤트 ${log.join(' | ')}`);
}
}
console.log(errs.filter((e) => !/404/.test(e)).length ? errs.slice(0, 10).join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
