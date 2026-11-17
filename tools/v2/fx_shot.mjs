// v2 fx — 빠른 캡처: node tools/v2/fx_shot.mjs [프리셋=fold_open] [ui=1] [tier=high] ["효과@초,효과@초"]  → /tmp/claude-0/v2/fxcore/boot_*.png
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import fs from 'node:fs';
const port = 8931; const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const ctx = await browser.newContext({ ...contextOptions(process.argv[2] || 'fold_open'), deviceScaleFactor: 1 });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
await page.goto(`http://localhost:${port}/tools/v2/fx_view.html?ui=${process.argv[3] || '1'}&tier=${process.argv[4] || 'high'}`);
await page.waitForFunction(() => window.__fx && window.__fx.ready && window.__fx.texReady, null, { timeout: 15000 }).catch((e) => errs.push('wait: ' + e.message));
if (!(await page.evaluate(() => !!(window.__fx && window.__fx.ready)))) { console.log('boot failed', errs.join('\n')); await browser.close(); srv.close(); process.exit(1); }
const names = (process.argv[5] || 'hit.slash.heavy,fire.pillar').split(',');
let i = 0;
for (const n of names) {
  const [nm, t] = n.split('@');
  await page.evaluate(([nm, t]) => { const a = window.__fx; a.manual = true; a.reset(); a.steps(2, 1 / 60); a.fire(nm); a.steps(Math.round(Number(t || 0.1) * 120), 1 / 120); }, [nm, t]);
  await page.screenshot({ path: `/tmp/claude-0/v2/fxcore/boot_${i++}_${nm}.png` });
}
console.log(JSON.stringify(await page.evaluate(() => window.__fx ? window.__fx.fx.stats : null)));
console.log('errors', errs.length, errs.slice(0, 12).join('\n'));
await browser.close(); srv.close();
