// ui2review — "더 맑은 유리"(?glass=clear) 판을 찍고 불투명도를 잰다.  node tools/v2/ui_mock2/ui2review/clear.mjs
import { chromium } from 'playwright-core';
import { start } from '../../../serve.mjs';
import { contextOptions } from '../../../qa/lib/viewports.mjs';
const out = '/tmp/claude-0/v2/ui2review';
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const jobs = [['uigem', 'tools/v2/ui_mock2/uigem', '&glass=clear', 'clear'], ['uiink', 'tools/v2/ui_mock2/uiink', '&glass=clear', 'clear'], ['r1glass', 'tools/v2/ui_mock/glass', '', 'base']];
for (const [name, dir, extra, tag] of jobs) for (const dev of ['fold_open', 'phone2']) {
  const ctx = await browser.newContext(contextOptions(dev)); const page = await ctx.newPage();
  for (const bg of ['yard', 'street']) {
    if (name === 'r1glass' && bg !== 'yard') continue;
    await page.goto(`http://localhost:${port}/${dir}/index.html?view=play&bg=${bg}&shot=1${extra}`);
    await page.waitForFunction(() => window.__ui, null, { timeout: 60000 }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}_${dev}_${tag}_${bg}.png` });
    if (bg === 'yard') for (const [c, col] of [['w', '#fff'], ['k', '#000']]) { await page.addStyleTag({ content: `#bg{background:${col} !important;filter:none !important}` }); await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${name}_${dev}_${tag}_alpha_${c}.png` }); }
  }
  await ctx.close(); console.log(name, dev);
}
await browser.close(); srv.close();
