import { chromium } from 'playwright-core';
import { start } from '/home/user/game/tools/serve.mjs';
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=s01`);
await page.waitForFunction(() => window.__game?.world?.player);
await page.waitForTimeout(1500);
await page.evaluate(() => { const w = window.__game.world, p = w.player; const e = w.spawnEnemy('skeleton', p.cx + 150, p.bottom, {}); e.awake = true; window.__e = e; });
await page.waitForTimeout(600);
await page.evaluate(() => { const w = window.__game.world; window.__e.takeHit(999, { dir: 1, kb: [200, -200] }, w, {}); window.__t0 = performance.now(); window.__wt0 = w.time; });
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(200);
  console.log(await page.evaluate(() => { const w = window.__game.world; const gh = w.fx.list.filter((p) => p.shape === 'ghost'); return `real ${(performance.now() - window.__t0).toFixed(0)}ms world ${(w.time - window.__wt0).toFixed(2)} ghosts ${gh.length} life ${gh.map((g) => g.life.toFixed(2)).join(',')} dying ${window.__e.dying.toFixed(2)} dead ${window.__e.dead}`; }));
}
await browser.close(); srv.close();
