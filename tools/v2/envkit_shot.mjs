// 환경 키트 빠른 캡처: node tools/v2/envkit_shot.mjs <device> <out 머리말> [teleport,…] [steps] [evalJS] [쿼리] [scene=v2c] → <out>_<teleport>.png
// (tools/v2/proto_b_shot.mjs 와 같은 방식 — 장면만 고를 수 있다. 헤드리스는 소프트웨어 WebGL 이다)
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
const [dev = 'fold_open', out = '/dev/shm/envkit/s.png', tp = '', steps = '30', ev = '', query = '', scene = 'v2c'] = process.argv.slice(2);
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext(contextOptions(dev));
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + '\n' + e.stack));
await page.goto(`http://localhost:${port}/index.html?scene=${scene}${query ? '&' + query : ''}`);
try { await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 40000 }); } catch (e) { errs.push('timeout waiting ready'); }
await page.waitForTimeout(1500);
let r = null;
for (const t of (tp || 'street').split(',')) {
  r = await page.evaluate(([tp, steps, ev]) => {
    const g = window.__game; g._pageHidden = true;
    if (tp && tp !== '-') window.__v2.teleport(tp);
    if (ev) (0, eval)(ev);
    for (let i = 0; i < Number(steps); i++) g.tick(1 / 60);
    g.render();
    const st = window.__v2.stats;
    return { gl: st.gl && { draws: st.gl.draws, tris: st.gl.tris, tex: st.gl.texBytes, buf: st.gl.bufBytes }, env: st.env, hero: window.__v2.hero, sec: window.__v2.section };
  }, [t, steps, ev]);
  await page.waitForTimeout(200);
  await page.screenshot({ path: out.replace(/\.png$/, '') + '_' + t + '.png' });
}
console.log(JSON.stringify(r).slice(0, 1400));
console.log(errs.length ? errs.slice(0, 12).join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
