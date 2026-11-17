// ui2review — 두 시안의 밝기 띠(strip.html)를 "더 맑은 유리"로 찍는다.  node tools/v2/ui_mock2/ui2review/strip_clear.mjs
import { chromium } from 'playwright-core';
import { start } from '../../../serve.mjs';
const port = 8100 + Math.floor(Math.random() * 800); const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1.5 })).newPage();
for (const n of ['uigem', 'uiink']) {
  await page.goto(`http://localhost:${port}/tools/v2/ui_mock2/${n}/strip.html?glass=clear&shot=1`);
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1500);
  await page.evaluate(() => { document.body.classList.add('clear'); }); await page.waitForTimeout(300);
  await page.screenshot({ path: `/tmp/claude-0/v2/ui2review/${n}_strip_clear.png`, fullPage: true });
}
await browser.close(); srv.close();
