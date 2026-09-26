// (임시) 보스전 자동 테스트: node tools/.bossesA_fight.mjs <stageId> <outDir> [seconds] [diff]
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';
const [,, stage = 's01', out = '/tmp/claude-0/bossesA_shots/f', secs = '16', diff = 'normal'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const port = 9000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=${stage}&room=boss&diff=${diff}`);
await page.waitForTimeout(2500);
const setup = await page.evaluate(() => {
  const g = window.__game, w = g.world;
  if (!w) return 'no world';
  const id = w.room.bossId ?? w.stage.boss;
  g.state.progress.seenScripts.push(id + '_pre');
  w.player.x = (w.arenaX ?? 400) + 80;
  w.startBoss();
  return { id, arena: w.arena, boss: !!w.boss, floor: w.boss?.floorY, scenes: g.scenes.map((s) => s.name) };
});
console.log(JSON.stringify(setup));
await page.waitForTimeout(4300);
const keys = ['KeyX', 'KeyZ', 'ArrowLeft', 'ArrowRight'];
const T = Number(secs);
let shot = 0;
const phaseAt = [T * 0.35, T * 0.65];
const t0 = Date.now();
let ph = 0;
while ((Date.now() - t0) / 1000 < T) {
  const el = (Date.now() - t0) / 1000;
  if (ph < 2 && el > phaseAt[ph]) {
    ph++;
    await page.evaluate((k) => { const w = window.__game.world; const b = w.boss; if (b && !b.dead) b.takeHit(Math.max(0, b.hp - b.stats.maxHp * (k === 1 ? 0.58 : 0.28)), {}, w, {}); }, ph);
  }
  await page.evaluate(() => { const p = window.__game.world?.player; if (p) { p.hp = p.stats.hp; } });
  const dir = Math.random() < 0.5 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(dir);
  if (Math.random() < 0.5) { await page.keyboard.down('KeyZ'); await page.waitForTimeout(120); await page.keyboard.up('KeyZ'); }
  await page.keyboard.down('KeyX'); await page.waitForTimeout(90); await page.keyboard.up('KeyX');
  await page.waitForTimeout(150);
  await page.keyboard.up(dir);
  if (el > shot * 1.6) { await page.screenshot({ path: `${out}/${String(shot).padStart(2, '0')}.png` }); shot++; }
}
const info = await page.evaluate(() => { const w = window.__game.world; const b = w.boss; return { hp: b?.hp, max: b?.stats.maxHp, phase: b?.phase, state: b?.state, ents: w.entities.length, fps: window.__game.fps, kinds: w.entities.map((e) => e.kind).reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {}) }; });
console.log(JSON.stringify(info));
// 처치 연출
await page.evaluate(() => { const w = window.__game.world; const b = w.boss; if (b) b.takeHit(b.hp + 1, {}, w, {}); });
for (let i = 0; i < 3; i++) { await page.waitForTimeout(700); await page.screenshot({ path: `${out}/death${i}.png` }); }
console.log(errs.length ? errs.slice(0, 20).join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
