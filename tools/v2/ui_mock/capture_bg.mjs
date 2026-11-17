// 인터페이스 시안용 바탕 그림: 시범판 B 를 HUD·가상 패드 없이 찍는다 (읽기 전용 — 시범판 코드는 건드리지 않는다).
//   node tools/v2/ui_mock/capture_bg.mjs [outDir=/dev/shm/uipilot/bg]
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import { contextOptions } from '../../qa/lib/viewports.mjs';
const out = process.argv[2] || '/dev/shm/uipilot/bg';
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
for (const dev of ['fold_open', 'phone2']) {
  const ctx = await browser.newContext(contextOptions(dev));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/index.html?scene=v2b&v2layer=1`);
  try { await page.waitForFunction(() => window.__v2?.id === 'b' && (window.__v2.ready || window.__v2.error), null, { timeout: 30000 }); } catch (e) { errs.push('timeout waiting ready'); }
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '#v2b-hud,#tpad{visibility:hidden !important}' });
  for (const [tp, steps] of [['street', 40], ['alley', 50], ['yard', 70]]) {
    const r = await page.evaluate(([tp, steps]) => {
      const g = window.__game; g._pageHidden = true;
      window.__v2.teleport(tp);
      for (let i = 0; i < steps; i++) g.tick(1 / 60);
      g.render();
      return { hero: window.__v2.hero, sec: window.__v2.section, mode: window.__v2.stats && window.__v2.stats.mode, n: window.__v2.enemies.length };
    }, [tp, steps]);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${dev}_${tp}.png` });
    console.log(dev, tp, JSON.stringify(r));
  }
  console.log(dev, errs.length ? errs.join('\n') : 'NO ERRORS');
  await ctx.close();
}
await browser.close(); srv.close();
