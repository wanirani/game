// UI lane: captures of the v2 interface test page (tools/v2/ui_view.html) at fold_open and phone2.
//   node tools/v2/ui_shot.mjs [--devices fold_open,phone2] [--views play,boss,states,dialog,choice,pause,night,toast,kb]
//                             [--bgs bright,dark] [--texts normal] [--out /tmp/claude-0/v2/ui/shots] [--dsf 1.3] [--hold attack]
//                             [--live v2g]   (one capture per device of the HUD plugged into the live game, software WebGL)
// File names: <device>_<view>_<bg>[_<text>].jpg. --hold keeps a finger on that button while capturing (pressed state).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const list = (k, d) => String(args[k] || d).split(',').filter(Boolean);
const DEVICES = list('devices', 'fold_open,phone2'), VIEWS = list('views', 'play,boss,states,dialog,choice,pause,night,toast,kb'), BGS = list('bgs', 'bright,dark'), TEXTS = list('texts', 'normal');
const OUT = String(args.out || '/tmp/claude-0/v2/ui/shots');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: args.live ? GL_ARGS : [] });
const errs = [];
try {
  for (const dev of DEVICES) {
    const ctx = await browser.newContext(contextOptions(dev, args.dsf ? { deviceScaleFactor: Number(args.dsf) } : {}));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`${dev}: ${String(e.message).slice(0, 200)}`));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`${dev} console: ${m.text().slice(0, 200)}`); });
    page.on('requestfailed', (r) => errs.push(`${dev} request failed: ${r.url().slice(-80)}`));
    page.on('response', (r) => { if (r.status() >= 400) errs.push(`${dev} HTTP ${r.status()}: ${r.url().slice(-80)}`); });
    if (args.live) {
      await page.goto(`http://localhost:${port}/tools/v2/ui_view.html?live=${args.live}`);
      await page.waitForFunction(() => window.__ui?.live, null, { timeout: 90000 });
      await page.waitForTimeout(2500);
      const f = path.join(OUT, `${dev}_live_${args.live}.jpg`); await page.screenshot({ path: f, type: 'jpeg', quality: 86 }); console.log('saved', f);
      await ctx.close(); continue;
    }
    for (const view of VIEWS) for (const bg of BGS) for (const text of TEXTS) {
      await page.goto(`http://localhost:${port}/tools/v2/ui_view.html?view=${view}&bg=${bg}&dev=${dev}&text=${text}&freeze=1`);
      await page.waitForFunction(() => window.__ui?.ready && window.__ui.hud.ready, null, { timeout: 20000 }).catch(() => errs.push(`${dev} ${view}: page not ready after 20 s`));
      await page.waitForTimeout(350);
      let client = null;
      if (args.hold) {
        const b = await page.evaluate((id) => window.__ui.hud.metrics().pad.buttons.find((q) => q.id === id), String(args.hold));
        if (b) { client = await ctx.newCDPSession(page); await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.cx, y: b.cy, id: 1 }] }); await page.waitForTimeout(120); }
      }
      const f = path.join(OUT, `${dev}_${view}_${bg}${text === 'normal' ? '' : '_' + text}${args.hold ? '_hold' : ''}.jpg`);
      await page.screenshot({ path: f, type: 'jpeg', quality: 86 });
      if (client) await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      console.log('saved', f);
    }
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }
if (errs.length) { console.log('PAGE ERRORS (' + errs.length + ')'); for (const e of [...new Set(errs)].slice(0, 20)) console.log('  ' + e); process.exitCode = 1; } else console.log('page errors: 0');
