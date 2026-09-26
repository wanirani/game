// visuals QA 캡처: 월드를 고정한 뒤 지정 카메라 위치에서 오프스크린 렌더 (HUD 없음)
// node tools/.qa_visuals/cap.mjs <outDir> [id,id,...]
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import fs from 'node:fs';
const out = process.argv[2];
const only = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(out, { recursive: true });
const CASES = [
  { id: 's10r2', stage: 's10', room: 'r2', cams: 'v6' },
  { id: 's12r2', stage: 's12', room: 'r2', cams: 'v5' },
  { id: 's13r2', stage: 's13', room: 'r2', cams: 'v6' },
  { id: 's10boss', stage: 's10', room: 'boss', cams: 'h2' },
  { id: 's12boss', stage: 's12', room: 'boss', cams: 'h2' },
  { id: 's13boss', stage: 's13', room: 'boss', cams: 'h2' },
  { id: 's08r1', stage: 's08', room: 'r1', cams: [[14, 8]] },
  { id: 's06r1', stage: 's06', room: 'r1', cams: 'h4' },
  { id: 's05r3', stage: 's05', room: 'r3', cams: 'h3' },
  { id: 's02r1', stage: 's02', room: 'r1', cams: 'h4' },
  { id: 's04r1', stage: 's04', room: 'r1', cams: 'h4' },
  { id: 's11r1', stage: 's11', room: 'r1', cams: 'h3' },
  { id: 's09r1', stage: 's09', room: 'r1', cams: 'h3' },
];
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
for (const c of CASES) {
  if (only && !only.includes(c.id)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=${c.stage}&room=${c.room}`);
  await page.waitForTimeout(3500);
  const cams = await page.evaluate((spec) => {
    const g = window.__game, w = g.world;
    w.update = () => {}; w.banner = null;
    const T = 48, m = w.map, vw = g.viewW, vh = g.viewH;
    if (Array.isArray(spec)) return spec.map(([tx, ty]) => [tx * T + T / 2, ty * T + T / 2]);
    const n = Number(spec.slice(1));
    const res = [];
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : i / (n - 1);
      if (spec[0] === 'v') res.push([m.pxW / 2, vh / 2 + f * Math.max(0, m.pxH - vh)]);
      else res.push([vw / 2 + f * Math.max(0, m.pxW - vw), m.pxH - vh / 2]);
    }
    return res;
  }, c.cams);
  let i = 0;
  for (const [cx, cy] of cams) {
    const url = await page.evaluate(([cx, cy]) => {
      const g = window.__game, w = g.world, cam = w.camera;
      cam.zoom = 1; cam.zoomTarget = 1; cam.shakeX = cam.shakeY = 0; cam.focus = null;
      cam.x = cx - cam.vw / 2; cam.y = cy - cam.vh / 2; cam.clamp();
      const cv = document.createElement('canvas'); cv.width = g.viewW; cv.height = g.viewH;
      w.render(cv.getContext('2d'));
      return cv.toDataURL('image/png');
    }, [cx, cy]);
    fs.writeFileSync(`${out}/${c.id}_${i++}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(c.id, cams.length, errs.length ? errs.join('\n') : 'ok');
  await ctx.close();
}
await browser.close();
srv.close();
