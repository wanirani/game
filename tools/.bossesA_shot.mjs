// (임시) 보스 갤러리 캡처: node tools/.bossesA_shot.mjs "<query>" out.png
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
const [,, query, out] = process.argv;
const port = 9000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1900, height: 1200 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + '\n' + e.stack));
await page.goto(`http://localhost:${port}/tools/gallery_bosses_a.html?${query}`);
await page.waitForFunction(() => window.__done === true, null, { timeout: 30000 }).catch(() => errs.push('timeout'));
const el = await page.$('#c');
await el.screenshot({ path: out });
console.log(errs.length ? errs.slice(0, 20).join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
