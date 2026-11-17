// v2g quick probe (ENGINE lane): open the scene headless, print readiness, page errors and the stats block, save one capture.
//   node tools/v2/game_probe.mjs [--device fold_open] [--q "v2res=0.5&v2dbg=1"] [--ticks 120] [--shot /tmp/claude-0/v2/engine/probe.png] [--js "<expression evaluated in the page>"]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', "--enable-precise-memory-info", "--js-flags=--expose-gc"];
const port = 8900 + Math.floor(Math.random() * 90), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
try {
  const page = await (await browser.newContext(contextOptions(String(args.device || 'fold_open')))).newPage(), errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ` + m.text()); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + '\n' + (e.stack ?? '').split('\n').slice(0, 6).join('\n')));
  await page.goto(`http://localhost:${port}/index.html?scene=${args.scene || 'v2g'}${args.q ? '&' + args.q : ''}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 60000 }).catch(() => errs.push('ready timeout'));
  const n = Number(args.ticks ?? 60);
  const out = await page.evaluate(async ([n, js]) => {
    const g = window.__game, v = window.__v2; if (!v) return { none: true, top: g?.top?.name };
    g._pageHidden = true;
    let extra = null;
    try { for (let i = 0; i < n; i++) { g.tick(1 / 60); if (i % 5 === 0) g.render(); } g.render(); if (js) extra = await (0, eval)(js); } catch (e) { return { thrown: String(e?.stack ?? e) }; }
    const s = v.ready ? v.stats : null;
    return { ready: v.ready, error: v.error, hero: v.hero, section: v.section, enemies: v.enemies.length, stats: s, extra };
  }, [n, args.js ? String(args.js) : null]);
  if (out.stats?.assets) { out.assetN = out.stats.assets.length; if (!args.assets) delete out.stats.assets; }
  console.log(JSON.stringify(out, null, 1));
  console.log(errs.length ? 'PAGE MESSAGES:\n' + errs.join('\n') : 'no page errors or warnings');
  const shot = String(args.shot || '/tmp/claude-0/v2/engine/probe.png'); fs.mkdirSync(shot.replace(/[^/]*$/, ''), { recursive: true });
  await page.waitForTimeout(150); await page.screenshot({ path: shot });
} finally { await browser.close(); srv.close(); }
