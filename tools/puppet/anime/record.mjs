// 애니풍 시범: 결정적(프레임 단위) 게임 녹화 — 같은 입력 대본을 플래그 끔/켬으로 똑같이 재생해 비교 영상을 만든다.
// node tools/puppet/anime/record.mjs --out DIR [--anime] [--stage s01] [--w 1280 --h 720 --dpr 1] [--mobile]
//        [--script "wait:30,right:40,jump:6,..."] [--every 2] [--crop 420x480] [--q 0.9] [--hud 1]
// 게임 루프를 멈추고(tools/qa/lib/step.mjs freeze) 1/60 초씩 진행 → every 프레임마다 게임 캔버스를 JPEG 로 저장 (DIR/f00000.jpg).
// --crop WxH: 플레이어 발을 따라가는 상자(부드럽게)만 잘라 저장 (비교 영상용). 없으면 캔버스 전체.
// 대본 토큰: key:n (n 프레임 누름; right left up down jump attack dash sub skill1 skill2 ult) · a+b:n · wait:n · hurt (피격 1회) ·
//           eval=JS (;; 는 ,) · face=1|-1 (방향 맞추기)
// 출력 끝에 JSON {errs, frames, pup} — pup 은 퍼펫 상태 (애니면 'kael/kael_hunter@anime').
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import { freeze } from '../../qa/lib/step.mjs';
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const out = opt('out', '/tmp/claude-0/g3/art_scratch/rec'), anime = !!opt('anime', false), stage = opt('stage', 's01'), mobile = !!opt('mobile', false);
const every = Number(opt('every', 2)), q = Number(opt('q', 0.9));
const crop = opt('crop', '') ? String(opt('crop')).split('x').map(Number) : null;
const script = String(opt('script', 'wait:60'));
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^f\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(out, f));
const port = 8900 + Math.floor(Math.random() * 600);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext(mobile
  ? { viewport: { width: Number(opt('w', 740)), height: Number(opt('h', 360)) }, deviceScaleFactor: Number(opt('dpr', 3)), hasTouch: true, isMobile: true }
  : { viewport: { width: Number(opt('w', 1280)), height: Number(opt('h', 720)) }, deviceScaleFactor: Number(opt('dpr', 1)) });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=${stage}&char=kael${anime ? '&anime=1' : ''}`);
await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 60000 });
// 퍼펫 준비 (애니: '@anime' 항목) + 대사 창 닫기
await page.evaluate(async () => { window.__hero = await import('/src/render/hero.js'); });
for (let k = 0; k < 120; k++) {
  const ok = await page.evaluate((anime) => {
    const g = window.__game, top = g.scenes[g.scenes.length - 1];
    if (top && /Dialogue|BossIntro|Story/.test(top.constructor?.name || '')) g.pop();
    if (g.world) { g.world.cutscene = false; g.world.inputLock = false; }
    const s = window.__hero.puppetStatus();
    return Object.entries(s).some(([k2, v]) => k2.startsWith('kael/') && (anime ? k2.endsWith('@anime') : !k2.endsWith('@anime')) && v.state === 1);
  }, anime);
  if (ok && k > 8) break;
  await page.waitForTimeout(150);
}
await freeze(page);
const KEY = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', jump: 'KeyZ', attack: 'KeyX', dash: 'KeyC', sub: 'KeyA', skill1: 'KeyS', skill2: 'KeyD', ult: 'KeyF' };
let fi = 0, saved = 0;
const cam = { x: null, y: null };
async function frame() {
  const r = await page.evaluate(([doShot, crop, q, cx0, cy0]) => {
    const g = window.__game;
    window.__qaStep(1, doShot);
    // 대사·소개 창이 열리면 닫는다 (녹화 대본이 막히지 않게)
    for (let k = 0; k < 4 && /^(dialogue|bossIntro|story|document|companionJoin)$/.test(g.top?.name ?? ''); k++) g.pop();
    if (g.world) { g.world.cutscene = false; g.world.inputLock = false; }
    if (!doShot) return null;
    const w = g.world, p = w.player, c = w.camera, z = c.zoom || 1, k = g.scale;
    const px = (p.cx - c.x - (c.shakeX || 0)) * z * k, py = (p.bottom - c.y - (c.shakeY || 0)) * z * k;
    if (!crop) return { url: g.canvas.toDataURL('image/jpeg', q), px, py };
    // 따라가는 상자: 발이 아래 82% 높이에 오게. 지난 상자에서 부드럽게 (튀지 않게)
    let cx = px, cy = py;
    if (cx0 != null) { cx = cx0 + (px - cx0) * 0.35; cy = cy0 + (py - cy0) * 0.35; }
    const [W, H] = crop;
    cx = Math.max(W / 2, Math.min(g.canvas.width - W / 2, cx)); cy = Math.max(H * 0.82, Math.min(g.canvas.height - H * 0.18, cy));
    const o = (window.__recCv ||= document.createElement('canvas'));
    o.width = W; o.height = H;
    const oc = o.getContext('2d');
    oc.fillStyle = '#000'; oc.fillRect(0, 0, W, H);
    oc.drawImage(g.canvas, Math.round(cx - W / 2), Math.round(cy - H * 0.82), W, H, 0, 0, W, H);
    return { url: o.toDataURL('image/jpeg', q), px, py, cx, cy };
  }, [fi % every === 0, crop, q, cam.x, cam.y]);
  if (r) {
    if (r.cx != null) { cam.x = r.cx; cam.y = r.cy; }
    fs.writeFileSync(path.join(out, `f${String(saved++).padStart(5, '0')}.jpg`), Buffer.from(r.url.split(',')[1], 'base64'));
  }
  fi++;
}
for (const tok of script.split(',').map((s) => s.trim()).filter(Boolean)) {
  if (tok.startsWith('eval=')) { await page.evaluate(tok.slice(5).replaceAll(';;', ',')).catch((e) => errs.push('EVAL ' + e.message)); continue; }
  if (tok === 'hurt') { await page.evaluate(() => { const w = window.__game.world, p = w.player; p.invulnT = 0; p.takeHit?.(1, { team: 'enemy', dir: -p.facing, kb: [-260, -320] }, w, {}); }).catch((e) => errs.push('HURT ' + e.message)); continue; }
  if (tok.startsWith('face=')) { await page.evaluate((f) => { window.__game.world.player.facing = f; }, Number(tok.slice(5))); continue; }
  const [k, nS] = tok.split(':'); const n = Number(nS || 1);
  if (k === 'wait') { for (let i = 0; i < n; i++) await frame(); continue; }
  const keys = k.split('+').map((x) => KEY[x] || x);
  for (const kk of keys) await page.keyboard.down(kk);
  for (let i = 0; i < n; i++) await frame();
  for (const kk of keys) await page.keyboard.up(kk);
}
const pup = await page.evaluate(() => Object.fromEntries(Object.entries(window.__hero.puppetStatus()).filter(([k]) => k.startsWith('kael/')).map(([k, v]) => [k, v.state])));
console.log(JSON.stringify({ errs, frames: saved, steps: fi, pup }));
await browser.close(); srv.close();
