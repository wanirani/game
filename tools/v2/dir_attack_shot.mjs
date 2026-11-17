// 네 방향(위·아래·왼쪽·오른쪽)으로 공격하는 영웅을 꾸민 배경 장면(v2c)에서 찍는다 — 보는 방향대로 베는지 눈으로 확인. node tools/v2/dir_attack_shot.mjs
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import fs from 'node:fs';
const OUT = '/tmp/claude-0/v2/dirfix'; fs.mkdirSync(OUT, { recursive: true });
const port = 9871; const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 726 }, deviceScaleFactor: 1 })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/index.html?scene=v2c&nosw`);
await page.waitForFunction(() => !!window.__v2?.hero, null, { timeout: 90000 });
await page.waitForTimeout(3000);
const KEY = process.argv[2] || 'KeyX';
for (const [name, key] of [['up', 'ArrowUp'], ['down', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight']]) {
  await page.evaluate(() => { const s = window.__game.top.sim; const h = s.hero; h.x = 420; h.z = 130; h.vx = h.vz = 0; h.move = null; for (const e of s.enemies) { e.x = 9000; e.z = 9000; e.active = false; } });
  await page.keyboard.down(key); await page.waitForTimeout(260);
  await page.keyboard.press(KEY); await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${name}_a.png`, clip: { x: 230, y: 250, width: 420, height: 380 } });
  await page.waitForTimeout(110);
  await page.screenshot({ path: `${OUT}/${name}_b.png`, clip: { x: 230, y: 250, width: 420, height: 380 } });
  const st = await page.evaluate(() => { const h = window.__game.top.sim.hero; return { move: !!h.move, anim: h.anim, dirX: +h.dirX.toFixed(2), dirZ: +h.dirZ.toFixed(2) }; });
  console.log(name, JSON.stringify(st));
  await page.keyboard.up(key); await page.waitForTimeout(700);
}
console.log('errors', errs.length, errs.slice(0, 3));
await browser.close(); srv.close();
