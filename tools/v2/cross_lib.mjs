// CROSSING lane: what the cross_*.mjs tools share (a static server for any copy of the tree, the headless browser, fast-forward steps in the page).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextOptions } from '../qa/lib/viewports.mjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..');
export const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4', '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
export const argv = () => Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
/** serve a copy of the tree -> { port, close() } */
export async function serve(root = REPO) {
  const R = path.resolve(root);
  const srv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
    const f = path.join(R, u); if (!f.startsWith(R)) { res.writeHead(403); res.end(); return; }
    fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
  });
  const port = 8900 + Math.floor(Math.random() * 600);
  await new Promise((r) => srv.listen(port, r));
  return { port, close: () => srv.close() };
}
/** one headless browser with one page of the device -> { browser, ctx, page, errs } */
export async function launch(device = 'fold_open') {
  const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
  const ctx = await browser.newContext(contextOptions(device)), page = await ctx.newPage(), errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 300)));
  return { browser, ctx, page, errs };
}
/** open scene v2g on an area (no story unless q says so) and wait until it plays */
export async function openArea(page, port, area, q = '') {
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&area=${area}${q}`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 });
  await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  await page.evaluate(() => { window.__game._pageHidden = true; });   // the tool drives ticks and frames itself from here on
}
/** in the page: put the hero in front of a bell of the area (or keep him where he is) -> [x, z] | null */
export const standAtBell = (page, id) => page.evaluate((want) => {
  const sc = window.__v2.scene, h = sc.sim.hero, S = sc.people.spots.filter((q) => q.def.kind === 'bell' && (!want || q.id === want));
  for (const q of S) for (const [dx, dz] of [[-60, -70], [0, -80], [60, -70], [-80, 0], [80, 0], [0, 80], [0, -120]]) {
    const p = { x: q.x + dx, z: q.z + dz, y: q.y };
    if (sc._spotOk(p)) { h.x = p.x; h.z = p.z; h.y = p.y; h.vx = h.vz = h.vy = 0; h.dirX = dx > 0 ? -1 : 1; h.dirZ = 0; if (h.safe) { h.safe.x = h.x; h.safe.z = h.z; h.safe.y = h.y; } sc.cam.snap = true; for (let i = 0; i < 40; i++) window.__game.tick(1 / 60); return [Math.round(p.x), Math.round(p.z)]; }
  }
  return null;
}, id ?? null);
/** n ticks of 1/60 s, then one drawn frame */
export const steps = (page, n) => page.evaluate((k) => { const g = window.__game; for (let i = 0; i < k; i++) g.tick(1 / 60); g.alpha = 1; g.render(); }, n);
export const frame = async (page, file) => { await page.evaluate(() => { const g = window.__game; g.alpha = 1; g.render(); }); await page.waitForTimeout(110); await page.screenshot({ path: file }); };
