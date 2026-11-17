// UI lane: where does hud.update + hud.draw allocate? (sampling heap profiler over a tight loop on the test page)
//   node tools/v2/ui_alloc.mjs [--device phone2] [--view boss] [--frames 4000]
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const dev = String(args.device || 'phone2'), view = String(args.view || 'boss'), N = Number(args.frames) || 4000;
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
try {
  const ctx = await browser.newContext(contextOptions(dev)), page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/tools/v2/ui_view.html?view=${view}&bg=black&dev=${dev}&freeze=1`);
  await page.waitForFunction(() => window.__ui?.ready && window.__ui.hud.ready, null, { timeout: 20000 });
  const run = (n) => page.evaluate((n) => { const u = window.__ui, cv = document.getElementById('screen'), c = cv.getContext('2d'), S = u.state; for (let i = 0; i < n; i++) { u.hud.update(1 / 60, S); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.setTransform(S.scale, 0, 0, S.scale, 0, 0); u.hud.draw(c, S); } }, n);
  await run(1200);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });   // garbage counts too
  await run(N);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const rows = [];
  (function walk(n, path) { const f = n.callFrame, name = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-1)[0]}:${f.lineNumber + 1}`; if (n.selfSize > 0) rows.push([n.selfSize, name, path.slice(-2).join(' < ')]); for (const c of n.children || []) walk(c, [...path, name]); })(profile.head, []);
  rows.sort((a, b) => b[0] - a[0]);
  let total = 0; for (const r of rows) total += r[0];
  console.log(`${dev} ${view}: sampled ${total} bytes over ${N} frames = ${(total / N).toFixed(1)} bytes/frame`);
  for (const r of rows.slice(0, 14)) console.log(`  ${(r[0] / N).toFixed(1).padStart(7)} B/frame  ${r[1]}   (${r[2]})`);
} finally { await browser.close(); srv.close(); }
