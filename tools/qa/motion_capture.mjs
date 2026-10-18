// 영웅 동작 비교 녹화 (MOTION-FEEL, owner: motion) — 같은 입력 대본을 두 트리(예전/지금)에서 프레임 단위로 똑같이 재생한다.
// node tools/qa/motion_capture.mjs --out DIR [--root TREE] [--char kael] [--cls kael_hunter] [--stage s01]
//        [--script "..."] [--preset combo|full] [--crop 520x440] [--every 1] [--q 0.88] [--quality high|medium|low]
//        [--w 1280 --h 720 --dpr 1] [--label 'AFTER'] [--fps 60|30]
// --root: 정적 서버 루트 (기본 = 이 저장소). 예전 트리는 tools/qa/motion_oldtree.sh 가 /dev/shm 에 만든다.
// 게임 루프를 멈추고(tools/qa/lib/step.mjs freeze) 1/fps 초씩 진행 → every 스텝마다 플레이어를 따라가는 상자를 JPEG 로 저장 (DIR/f00000.jpg).
// 대본 토큰: key:n (n 스텝 누름; right left up down jump attack dash) · a+b:n · wait:n · clear(적 치우기) · dummy(앞에 허수아비)
//           · hurt(앞에서 맞음) · hurtbig(큰 넉백) · face=1|-1 · tag=name(그 다음 저장 프레임 번호를 tags 에 기록) · eval=JS (;; 는 ,)
// 출력 끝에 JSON {errs, frames, tags, tier, pup}
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeze } from './lib/step.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(String(opt('root', REPO)));
const out = String(opt('out', '/dev/shm/motion_rec'));
const char = String(opt('char', 'kael')), cls = String(opt('cls', '')), stage = String(opt('stage', 's01'));
const every = Number(opt('every', 1)), q = Number(opt('q', 0.88));
const crop = String(opt('crop', '520x440')).split('x').map(Number);
const quality = String(opt('quality', 'high'));
const fps = Number(opt('fps', 60));
const label = String(opt('label', ''));
const PRESETS = {
  // 공격 연타 → 달리기 시작·멈춤 → 방향 전환 → 점프·착지 → 대시 → 높은 낙하 착지
  full: 'clear,face=1,wait:24,tag=idle,dummy,wait:6,tag=atk1,attack:1,wait:13,tag=atk2,attack:1,wait:13,tag=atk3,attack:1,wait:13,tag=atk4,attack:1,wait:40,clear,'
    + 'tag=runstart,right:6,tag=run,right:34,tag=stop,wait:22,right:30,tag=turn,left:16,wait:18,tag=jump,jump:12,tag=apex,wait:16,tag=fall,wait:18,tag=land,wait:20,'
    + 'tag=dash,dash:2,wait:18,tag=dashend,wait:16',
  combo: 'clear,face=1,wait:20,dummy,wait:6,tag=atk1,attack:1,wait:13,tag=atk2,attack:1,wait:13,tag=atk3,attack:1,wait:13,tag=atk4,attack:1,wait:40',
  loco: 'clear,face=1,wait:20,tag=runstart,right:6,tag=run,right:40,tag=stop,wait:24,right:30,tag=turn,left:18,wait:20',
  air: 'clear,face=1,wait:16,tag=jump,jump:12,tag=apex,wait:16,tag=fall,wait:18,tag=land,wait:24,tag=dash,dash:2,wait:18,tag=dashend,wait:16',
  hurt: 'clear,face=1,wait:20,tag=hurt,hurt,wait:40,tag=hurtbig,hurtbig,wait:60',
  idle: 'clear,face=1,wait:300',
};
const script = String(opt('script', PRESETS[String(opt('preset', 'full'))] ?? PRESETS.full));
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^f\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(out, f));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const f = path.join(root, u);
  if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});
const port = 9500 + Math.floor(Math.random() * 400);
await new Promise((r) => srv.listen(port, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: Number(opt('w', 1280)), height: Number(opt('h', 720)) }, deviceScaleFactor: Number(opt('dpr', 1)) });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=${stage}&char=${char}`);
await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 90000 });
await page.evaluate((qq) => {
  const g = window.__game; g.autoQualityOn = () => false; if (g.gov) g.gov.toasted = true;
  g._tier = qq; g.world?.applyQuality?.();
}, quality);
await page.evaluate(async () => { window.__hero = await import('/src/render/hero.js'); });
if (cls) await page.evaluate(async (cls) => { const pl = window.__game.world.player; if (!pl.hero) return; pl.hero.classId = cls; const st = await import('/src/game/stats.js'); pl.look = st.composeLook(pl.state, pl.hero); }, cls);
for (let k = 0; k < 160; k++) {
  const ok = await page.evaluate((char) => {
    const g = window.__game;
    for (let i = 0; i < 4 && /^(dialogue|bossIntro|story|document|companionJoin)$/.test(g.top?.name ?? ''); i++) g.pop();
    if (g.world) { g.world.cutscene = false; g.world.inputLock = false; }
    const s = window.__hero.puppetStatus();
    return Object.entries(s).some(([k2, v]) => k2.startsWith(char + '/') && v.state === 1);
  }, char);
  if (ok && k > 10) break;
  await page.waitForTimeout(150);
}
await page.evaluate((qq) => { const g = window.__game; g._tier = qq; g.world?.applyQuality?.(); }, quality);
await freeze(page);
// 시뮬레이션은 늘 1/60 고정 스텝(game.js STEP) — 30fps 기기 = 두 스텝마다 한 번 그림. 한 '프레임' = 60/fps 스텝 + 그리기 1회
const SPF = Math.max(1, Math.round(60 / fps));
const KEY = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', jump: 'KeyZ', attack: 'KeyX', dash: 'KeyC' };
let fi = 0, saved = 0;
const tags = {};
let pendingTag = null;
const cam = { x: null, y: null };
async function frame() {
  const r = await page.evaluate(([doShot, crop, q, cx0, cy0, label, SPF]) => {
    const g = window.__game;
    if (SPF > 1) window.__qaStep(SPF - 1, false);
    window.__qaStep(1, doShot);
    for (let k = 0; k < 4 && /^(dialogue|bossIntro|story|document|companionJoin)$/.test(g.top?.name ?? ''); k++) g.pop();
    if (g.world) { g.world.cutscene = false; g.world.inputLock = false; }
    if (!doShot) return null;
    const w = g.world, p = w.player, c = w.camera, z = c.zoom || 1, k = g.scale;
    const px = (p.cx - c.x - (c.shakeX || 0)) * z * k, py = (p.bottom - c.y - (c.shakeY || 0)) * z * k;
    let cx = px, cy = py;
    if (cx0 != null) { cx = cx0 + (px - cx0) * 0.25; cy = cy0 + (py - cy0) * 0.2; }
    const [W, H] = crop;
    cx = Math.max(W / 2, Math.min(g.canvas.width - W / 2, cx)); cy = Math.max(H * 0.78, Math.min(g.canvas.height - H * 0.22, cy));
    const o = (window.__recCv ||= document.createElement('canvas'));
    o.width = W; o.height = H;
    const oc = o.getContext('2d');
    oc.fillStyle = '#000'; oc.fillRect(0, 0, W, H);
    oc.drawImage(g.canvas, Math.round(cx - W / 2), Math.round(cy - H * 0.78), W, H, 0, 0, W, H);
    if (label) {
      oc.font = 'bold 20px sans-serif'; oc.fillStyle = 'rgba(0,0,0,0.55)'; oc.fillRect(0, 0, oc.measureText(label).width + 20, 30);
      oc.fillStyle = label.startsWith('BEFORE') ? '#ffb0a0' : '#b0ffb8'; oc.fillText(label, 10, 22);
    }
    return { url: o.toDataURL('image/jpeg', q), cx, cy };
  }, [fi % every === 0, crop, q, cam.x, cam.y, label, SPF]);
  if (r) {
    cam.x = r.cx; cam.y = r.cy;
    if (pendingTag) { tags[pendingTag] = saved; pendingTag = null; }
    fs.writeFileSync(path.join(out, `f${String(saved++).padStart(5, '0')}.jpg`), Buffer.from(r.url.split(',')[1], 'base64'));
  }
  fi++;
}
const ev = (fn, arg) => page.evaluate(fn, arg).catch((e) => errs.push('EVAL ' + e.message));
for (const tok of script.split(',').map((s) => s.trim()).filter(Boolean)) {
  if (tok.startsWith('eval=')) { await ev(tok.slice(5).replaceAll(';;', ',')); continue; }
  if (tok.startsWith('tag=')) { pendingTag = tok.slice(4); continue; }
  if (tok === 'clear') {
    await ev(() => {
      const w = window.__game.world;
      for (const e of w.entities) if (e.kind === 'enemy' || e.kind === 'projectile') { e.dead = true; e.hidden = true; }
      w.entities = w.entities.filter((e) => !(e.kind === 'enemy' || e.kind === 'projectile'));
      const p = w.player; p.hp = p.stats.hp; p.iframes = 0;
    });
    continue;
  }
  if (tok === 'dummy') {
    await ev(() => {
      const w = window.__game.world, p = w.player;
      const e = w.spawnEnemy('skeleton', p.cx + p.facing * 70, p.bottom - 4, { facing: -p.facing });
      if (e) { e.hp = e.maxHp = 1e7; e.ai = { update() {}, init() {} }; e.noKnock = true; window.__dummy = e; }
    });
    continue;
  }
  if (tok === 'hurt' || tok === 'hurtbig') {
    await ev((big) => {
      const w = window.__game.world, p = w.player; p.iframes = 0;
      p.takeHit?.(1, { team: 'enemy', dir: -p.facing, kb: big ? [520, -620] : [240, -360] }, w, {});
    }, tok === 'hurtbig');
    continue;
  }
  if (tok.startsWith('face=')) { await ev((f) => { window.__game.world.player.facing = f; }, Number(tok.slice(5))); continue; }
  const [k, nS] = tok.split(':'); const n = Number(nS || 1);
  if (k === 'wait') { for (let i = 0; i < n; i++) await frame(); continue; }
  const keys = k.split('+').map((x) => KEY[x] || x);
  for (const kk of keys) await page.keyboard.down(kk);
  for (let i = 0; i < n; i++) await frame();
  for (const kk of keys) await page.keyboard.up(kk);
}
const pup = await page.evaluate((char) => Object.fromEntries(Object.entries(window.__hero.puppetStatus()).filter(([k]) => k.startsWith(char + '/')).map(([k, v]) => [k, v.state])), char);
const tier = await page.evaluate(() => window.__game.tier ?? null);
fs.writeFileSync(path.join(out, 'tags.json'), JSON.stringify(tags));
console.log(JSON.stringify({ errs: errs.slice(0, 20), frames: saved, steps: fi, tags, tier, pup }));
await browser.close(); srv.close();
