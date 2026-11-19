// DETAIL: a quick look at the effects test page (tools/v2/fx_view.html): console messages, shader link state, one preset fired, a still.
//   node tools/v2/fire2_probe.mjs [--preset fire.pillar] [--out /tmp/claude-0/v2/detail/probe.png]
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ ...contextOptions('fold_open'), deviceScaleFactor: 1, serviceWorkers: 'block' }), page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message)); page.on('console', (m) => { if (m.type() !== 'log') console.log('[' + m.type() + ']', m.text().slice(0, 400)); });
  await page.goto(`http://localhost:${port}/tools/v2/fx_view.html?ui=0&tier=mid`);
  await page.waitForFunction(() => window.__fx && window.__fx.ready && window.__fx.texReady, null, { timeout: 30000 }).catch((e) => console.log('not ready:', e.message.slice(0, 100)));
  const r = await page.evaluate((nm) => { const a = window.__fx; a.manual = true; a.reset(); a.steps(2, 1 / 60); a.fire(nm); a.steps(36, 1 / 120); a.steps(1, 0); const m = a.fx.measure(); const gl = document.getElementById('c').getContext('webgl2'); return { p: m.particles, o: m.overdraw, err: gl ? gl.getError() : 'no gl', url: document.getElementById('c').toDataURL('image/png').length }; }, String(args.preset || 'fire.pillar'));
  console.log(JSON.stringify(r));
  await page.screenshot({ path: String(args.out || '/tmp/claude-0/v2/detail/probe.png') });
} finally { await browser.close(); srv.close(); }
