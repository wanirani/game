// 임시: 갤러리 스크린샷 (enemiesA 전용)
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
const [,, query = '', out = '/tmp/claude-0/enemiesA_shots/gal.png', width = '1100'] = process.argv;
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(width), height: 600 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:${port}/tools/gallery_enemies_a.html?${query}`);
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: true });
console.log(errors.length ? errors.join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
