// v2 char3d: 빌드한 폴더에서 시범판 B 가 입체 영웅을 실제로 불러오는지 확인한다.  node tools/v2/char3d_built_check.mjs [dist/web]
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
const port = 8700 + Math.floor(Math.random() * 200); const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1000, height: 756 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://localhost:${port}/${process.argv[2] ?? 'dist/web'}/index.html?scene=v2b`);
await page.waitForFunction(() => window.__v2?.id === 'b' && (window.__v2.ready || window.__v2.error), null, { timeout: 40000 });
const r = await page.evaluate(() => { const g = window.__game; g._pageHidden = true; for (let i = 0; i < 30; i++) g.tick(1 / 60); g.render(); const s = window.__v2.stats; return { hero3d: s.hero3d, draws: s.gl.draws, tris: s.gl.tris, build: window.__BN_BUILD?.version }; });
console.log(JSON.stringify(r)); console.log(errs.length ? errs.join(' | ') : 'NO ERRORS');
await browser.close(); srv.close();
