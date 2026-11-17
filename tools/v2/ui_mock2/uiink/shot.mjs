// 캡처 한 장: node tools/v2/ui_mock2/uiink/shot.mjs <저장소 기준 경로> <out.png> [w] [h] [dpr]   (strip.html 이면 대비 값을 contrast.json 으로도 적는다)
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
const contrast = await page.evaluate(() => window.__contrast || null);
if (contrast) { const { writeFileSync } = await import('node:fs'); writeFileSync(out.replace(/[^/]+$/, 'contrast.json'), JSON.stringify(contrast, null, 1)); for (const c of contrast) console.log(`${c.name}: 바탕 ${c.bgLum} → 유리 밑 ${c.glassLum} · 그림:유리 최소 ${c.iconMin}:1(${c.iconWorst}) 평균 ${c.iconAvg}:1 · 맨 글자 ${c.bareInk}:1 · 먹 얼룩 위 ${c.inkOnWash}:1 · [${c.per.join(', ')}]`); }
console.log('wrote', out);
await browser.close(); srv.close();
