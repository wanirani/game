// 환경 키트 보기(tools/v2/env_view.html) 캡처: node tools/v2/envkit_view_shot.mjs '[["이름","쿼리"],…]' <폴더>
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
const port = 8950 + Math.floor(Math.random() * 40);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 756 }, deviceScaleFactor: 2 });
const errs = []; page.on('pageerror', (e) => errs.push(e.message + '\n' + e.stack)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const shots = JSON.parse(process.argv[2]);
for (const [name, query] of shots) {
  await page.goto(`http://localhost:${port}/tools/v2/env_view.html?${query}`);
  await page.waitForFunction(() => window.__envView?.ready, null, { timeout: 30000 }).catch(() => errs.push('timeout ' + name));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${process.argv[3]}/${name}.png` });
  console.log(name, JSON.stringify(await page.evaluate(() => window.__envView?.stats())));
}
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
