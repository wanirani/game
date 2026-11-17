// 캡처 한 장: node tools/v2/ui_mock2/uiink/shot.mjs <서버 경로 또는 file://> <out.png> [w] [h] [dpr] [wait 식]
import { chromium } from 'playwright-core';
import { start } from '../../../serve.mjs';
const [url, out, w = 1720, h = 1100, dpr = 1, full = '1'] = process.argv.slice(2);
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--allow-file-access-from-files'] });
const page = await (await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message)); page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text()); });
await page.goto(url.startsWith('file:') ? url : `http://localhost:${port}/${url}`);
await page.waitForFunction(() => window.__done || window.__ui, null, { timeout: 30000 });
await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: full === '1' });
console.log('wrote', out);
await browser.close(); srv.close();
