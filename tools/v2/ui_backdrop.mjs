// UI lane: capture clean backdrops of the real 3D scene for the HUD test page (tools/v2/ui_view.html).
//   node tools/v2/ui_backdrop.mjs [--devices fold_open,phone2] [--out tools/v2/ui_bg]
// Opens index.html?scene=v2c (headless Chromium, software WebGL), hides the pilot HUD and the v1 pad,
// teleports to a lamp-lit spot, a dark spot and the brazier yard, and saves one JPEG per device and spot.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(',');
const OUT = path.resolve(ROOT, String(args.out || 'tools/v2/ui_bg'));
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const SPOTS = [['bright', 'street'], ['dark', 'alley'], ['yard', 'yard']];

fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
try {
  for (const dev of DEVICES) {
    const ctx = await browser.newContext(contextOptions(dev));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
    await page.goto(`http://localhost:${port}/index.html?scene=v2c`);
    await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 60000 });
    await page.evaluate(() => {
      const sc = window.__v2.scene; sc._hud = () => {}; sc._numbers = () => {}; sc.showPad = false; sc.hidePad = true;
      window.__game.toasts && (window.__game.toasts.length = 0);
    });
    for (const [name, sec] of SPOTS) {
      await page.evaluate((s) => window.__v2.teleport(s), sec);
      await page.waitForTimeout(1400);
      const f = path.join(OUT, `${dev}_${name}.jpg`);
      await page.screenshot({ path: f, type: 'jpeg', quality: 82 });
      console.log('saved', path.relative(ROOT, f), fs.statSync(f).size, 'bytes');
    }
    if (errs.length) console.log('page errors on', dev, errs);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.close();
}
