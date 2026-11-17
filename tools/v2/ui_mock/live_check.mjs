// ?live=1 검사: 시안을 실제 시범판 B 위에 얹고, 시안의 스틱·공격이 영웅을 움직이는지 본다.  node tools/v2/ui_mock/live_check.mjs [style=glass]
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import { contextOptions } from '../../qa/lib/viewports.mjs';
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext(contextOptions('fold_open'));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
await page.goto(`http://localhost:${port}/tools/v2/ui_mock/${process.argv[2] || 'glass'}/index.html?live=1&shot=1`);
const fr = () => page.frames().find((f) => /scene=v2b/.test(f.url()));
await page.waitForFunction(() => { const f = document.querySelector('iframe'); return f && f.contentWindow.__v2 && (f.contentWindow.__v2.ready || f.contentWindow.__v2.error); }, null, { timeout: 40000 });
await page.waitForTimeout(2500);
const before = await fr().evaluate(() => ({ ...window.__v2.hero, mode: window.__v2.stats.mode }));
// 시안의 스틱을 오른쪽으로 끌고, 공격을 누른다
const st = await page.locator('#stick').boundingBox();
await page.touchscreen.tap(st.x + st.width / 2, st.y + st.height / 2).catch(() => {});
await page.dispatchEvent('#stick', 'pointerdown', { pointerId: 7, clientX: st.x + st.width / 2, clientY: st.y + st.height / 2, bubbles: true });
await page.dispatchEvent('#stick', 'pointermove', { pointerId: 7, clientX: st.x + st.width / 2 + 60, clientY: st.y + st.height / 2, bubbles: true });
await page.waitForTimeout(1800);
const mid = await fr().evaluate(() => ({ x: window.__v2.hero.x, anim: window.__v2.hero.anim }));
await page.dispatchEvent('#b-attack', 'pointerdown', { pointerId: 8, bubbles: true });
const seen = new Set();
for (let i = 0; i < 12; i++) { await page.waitForTimeout(60); seen.add(await fr().evaluate(() => window.__v2.hero.anim)); }
const atk = [...seen];
await page.screenshot({ path: `/tmp/claude-0/v2/uipilot/live_${process.argv[2] || 'glass'}_fold_open.png` });
await page.dispatchEvent('#stick', 'pointerup', { pointerId: 7, bubbles: true });
console.log(JSON.stringify({ before, mid, atk, errs }));
await browser.close(); srv.close();
