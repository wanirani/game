// 스모크 테스트: 헤드리스 Chromium으로 게임을 열고 콘솔 오류 수집 + 스크린샷 + 간단 입력 시뮬레이션
// 사용: node tools/smoke.mjs [--url "index.html?scene=stage&stage=s01"] [--out dir] [--steps "right:1.5,attack:0.2,..."] [--mobile]
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const out = args.out || '/tmp/claude-0/shots';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const mobile = !!args.mobile;
const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
const url = `http://localhost:${port}/${args.url || 'index.html?scene=stage&stage=s01'}`;
await page.goto(url);
await page.waitForTimeout(Number(args.wait || 2500));
await page.screenshot({ path: `${out}/00_start.png` });
const KEY = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', jump: 'KeyZ', attack: 'KeyX', dash: 'KeyC', sub: 'KeyA', skill1: 'KeyS', skill2: 'KeyD', ult: 'KeyF', menu: 'Escape', enter: 'Enter', swap: 'KeyQ' };
const steps = (args.steps || 'right:1.2,attack:0.15,wait:0.3,attack:0.15,wait:0.2,jump:0.3,right:0.8,shot,attack:0.1,attack:0.1,attack:0.1,right:1.5,shot,sub:0.1,wait:0.5,shot').split(',');
let n = 1;
for (const s of steps) {
  const [k, d] = s.split(':');
  if (k === 'shot') { await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}.png` }); continue; }
  if (k === 'wait') { await page.waitForTimeout(Number(d) * 1000); continue; }
  if (k.startsWith('eval=')) { await page.evaluate(k.slice(5)); continue; }
  const combo = k.split('+').map((x) => KEY[x] || x);
  for (const c of combo) await page.keyboard.down(c);
  await page.waitForTimeout(Number(d || 0.1) * 1000);
  for (const c of combo.reverse()) await page.keyboard.up(c);
  await page.waitForTimeout(30);
}
const info = await page.evaluate(() => { const g = window.__game; return g ? { scenes: g.scenes.map((s) => s.name), fps: g.fps, hp: g.world?.player?.hp, room: g.world?.roomId, ents: g.world?.entities.length } : null; });
console.log(JSON.stringify(info));
console.log(errors.length ? errors.slice(0, 30).join('\n') : 'NO ERRORS');
await browser.close();
srv.close();
