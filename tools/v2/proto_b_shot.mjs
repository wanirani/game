// 시범판 B 빠른 캡처: node tools/v2/proto_b_shot.mjs <device> <out 머리말> [teleport,teleport…] [steps] [evalJS] [추가 쿼리 예: v2layer=1] → <out>_<teleport>.png
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
const [dev = 'fold_open', out = '/dev/shm/protob/s.png', tp = '', steps = '30', ev = '', query = ''] = process.argv.slice(2);
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext(contextOptions(dev));
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + '\n' + e.stack));
await page.goto(`http://localhost:${port}/index.html?scene=v2b${query ? '&' + query : ''}`);
try { await page.waitForFunction(() => window.__v2?.id === 'b' && (window.__v2.ready || window.__v2.error), null, { timeout: 30000 }); } catch (e) { errs.push('timeout waiting ready'); }
await page.waitForTimeout(1500);
let r = null;
for (const t of (tp || 'street').split(',')) {
  r = await page.evaluate(([tp, steps, ev]) => {
    const g = window.__game; g._pageHidden = true;
    if (tp) window.__v2.teleport(tp);
    if (ev) (0, eval)(ev);
    for (let i = 0; i < Number(steps); i++) g.tick(1 / 60);
    g.render();
    return { st: window.__v2.stats, hero: window.__v2.hero, sec: window.__v2.section, cam: window.__v2.cam };
  }, [t, steps, ev]);
  await page.waitForTimeout(200);
  await page.screenshot({ path: out.replace(/\.png$/, '') + '_' + t + '.png' });
}
console.log(JSON.stringify(r).slice(0, 900));
console.log(errs.length ? errs.slice(0, 12).join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
