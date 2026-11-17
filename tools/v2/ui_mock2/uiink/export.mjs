// 스프라이트 내보내기: node tools/v2/ui_mock2/uiink/export.mjs → /dev/shm/uiink/export/<group>/<name>.png (그 뒤 pack_atlas.py 가 assets/v2/ui/uiink/ 로 묶는다)
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { start } from '../../../serve.mjs';
const dir = process.argv[2] || '/dev/shm/uiink/export';
const port = 8100 + Math.floor(Math.random() * 800), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/tools/v2/ui_mock2/uiink/export.html`);
await page.waitForFunction(() => window.__done, null, { timeout: 60000 });
const list = await page.evaluate(() => window.__export);
for (const e of list) { mkdirSync(`${dir}/${e.group}`, { recursive: true }); writeFileSync(`${dir}/${e.group}/${e.name}.png`, Buffer.from(e.url.split(',')[1], 'base64')); }
console.log('exported', list.length, 'sprites to', dir);
await browser.close(); srv.close();
