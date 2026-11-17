// uigem: 아이콘 한 벌(sheet) · 세 배경 띠(strip) 캡처 + 잰 값용 자료.
//   node tools/v2/ui_mock2/uigem/extras.mjs [outDir=/tmp/claude-0/v2/uigem]
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { start } from '../../../serve.mjs';
const out = process.argv[2] || '/tmp/claude-0/v2/uigem';
mkdirSync(out, { recursive: true });
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const base = `http://localhost:${port}/tools/v2/ui_mock2/uigem`;
const page = await (await browser.newContext({ viewport: { width: 1040, height: 800 }, deviceScaleFactor: 3 })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message)); page.on('response', (r) => { if (r.status() >= 400) console.log(r.status(), r.url()); });
const go = async (u) => { await page.goto(u); await page.waitForFunction(() => window.__ready); await page.waitForTimeout(300); };
await go(`${base}/sheet.html`); await page.locator('body').screenshot({ path: `${out}/icon_sheet.png` });
await go(`${base}/strip.html`); await page.locator('body').screenshot({ path: `${out}/strip_backgrounds.png` });
const body = await page.locator('body').boundingBox();
writeFileSync(`${out}/_strip_rects.json`, JSON.stringify({ dpr: 3, ox: body.x, oy: body.y, rects: await page.evaluate(() => window.__rects()) }));
await go(`${base}/strip.html?hide=ink`); await page.locator('body').screenshot({ path: `${out}/_strip_noink.png` });
console.log('wrote icon_sheet.png, strip_backgrounds.png');
await browser.close(); srv.close();
