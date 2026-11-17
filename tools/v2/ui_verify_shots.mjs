// UI-VERIFY lane: captures for the owner sheet that ui_verify.mjs does not take.
//   node tools/v2/ui_verify_shots.mjs [--out /tmp/claude-0/v2/uiverify]
//   1) "before": the live 3D scene with the built-in HUD and the v1 ornate pad (index.html?scene=v2g&v2ui=0), fold_open
//   2) a v1 stage with its pad (index.html?scene=stage&stage=s01), fold_open - proof that v1 is unchanged
//   3) every pad button cropped at device resolution over a bright and a dark backdrop (test page), fold_open + phone2
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const OUT = String(args.out || '/tmp/claude-0/v2/uiverify'), ONLY = args.only ? new Set(String(args.only).split(',')) : null;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
fs.mkdirSync(OUT + '/icons', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 8300 + Math.floor(Math.random() * 500), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const want = (k) => !ONLY || ONLY.has(k);
const info = {};
try {
  if (want('before')) {
    const ctx = await browser.newContext(contextOptions('fold_open')), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
    await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2ui=0&nosw`);
    await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 90000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 20, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(1500);
    info.before = await page.evaluate(() => ({ hud: window.__v2.scene.hudKind, mode: window.__game.input.mode }));
    await page.screenshot({ path: `${OUT}/fold_open_before_v1pad.png` });
    await ctx.close();
  }
  if (want('v1')) {
    const ctx = await browser.newContext(contextOptions('fold_open')), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page), errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
    await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=s01&nosw`);
    await page.waitForFunction(() => window.__game?.top?.name === 'stage', null, { timeout: 60000 }).catch(() => errs.push('stage not on top'));
    await sleep(1500);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 500, y: 300, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(1500);
    info.v1 = await page.evaluate(() => ({ top: window.__game.top?.name, mode: window.__game.input.mode, tpad: !!document.getElementById('tpad'), v2pad: document.querySelectorAll('#v2pad').length }));
    info.v1.errors = errs;
    await page.screenshot({ path: `${OUT}/fold_open_v1_stage.png` });
    await ctx.close();
  }
  if (want('icons')) {
    info.icons = {};
    for (const dev of ['fold_open', 'phone2']) for (const bg of ['bright', 'dark']) {
      const opt = { ...contextOptions(dev), deviceScaleFactor: 3 }, ctx = await browser.newContext(opt), page = await ctx.newPage();   // 3 device px per CSS px: the 3x row of the owner sheet is pixel-exact
      await page.goto(`http://localhost:${port}/tools/v2/ui_view.html?view=empty&bg=${bg}&dev=${dev}&freeze=1`);
      await page.waitForFunction(() => window.__ui?.ready && window.__ui.hud.ready, null, { timeout: 20000 });
      await sleep(500);
      const rects = await page.evaluate(() => [...document.querySelectorAll('#v2pad canvas.v2b')].map((c) => { const r = c.getBoundingClientRect(); return { id: c.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height }; }));
      for (const r of rects) await page.screenshot({ path: `${OUT}/icons/${dev}_${bg}_${r.id}.png`, clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.w, height: r.h } });
      info.icons[dev] = rects.map((r) => [r.id, Math.round(r.w), Math.round(r.h)]);
      await page.screenshot({ path: `${OUT}/${dev}_staged_empty_${bg}.png` });
      await ctx.close();
    }
  }
} finally { await browser.close(); srv.close(); }
fs.writeFileSync(`${OUT}/shots.json`, JSON.stringify(info, null, 1));
console.log(JSON.stringify(info));
