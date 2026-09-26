// Rig lifecycle QA: (1) window grows after the bake → the next room entry re-bakes at the new texel density and swaps
// the rig in without a vector fallback frame; (2) moving to another stage releases the rigs that stage does not use;
// (3) settings.painted=false stops the roomEntered preload.
//   node tools/painted/enemies/lifecycle.mjs
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';

const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=s01`);
await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 30000 });
await page.waitForTimeout(2500);
const out = {};
out.small = await page.evaluate(async () => { const k = await import('/src/render/painted/enemy_kit.js'); window.__k = k; return { scale: +window.__game.scale.toFixed(2), rigs: k.rigStats() }; });
// (1) grow the window, re-enter the room
await page.setViewportSize({ width: 1600, height: 900 });
await page.waitForTimeout(400);
out.grown = await page.evaluate(async () => {
  const g = window.__game, w = g.world, k = window.__k;
  const { PAINTED_ENEMIES } = await import('/src/render/painted/enemies/index.js');
  const before = k.requestRig(PAINTED_ENEMIES.skeleton.spec);
  w.loadRoom(w.roomId);
  let vectorFrames = 0;
  for (let i = 0; i < 60; i++) { if (!k.requestRig(PAINTED_ENEMIES.skeleton.spec).ready) vectorFrames++; await new Promise((r) => setTimeout(r, 50)); }
  const after = k.requestRig(PAINTED_ENEMIES.skeleton.spec);
  return { scale: +g.scale.toFixed(2), swapped: before !== after, tdBefore: before.td, tdAfter: after.td, vectorFrames, rigs: k.rigStats() };
});
// (2) stage change: s05 uses only the ghost among the painted types
out.stage = await page.evaluate(async () => {
  const { bus } = await import('/src/core/events.js');
  bus.emit('roomEntered', { stageId: 's05', roomId: 'r1' });
  await new Promise((r) => setTimeout(r, 1500));
  return { rigs: Object.keys(window.__k.rigStats()), memMB: +window.__k.rigMemMB().toFixed(2) };
});
// (3) painted off in settings: no preload on room entry
out.off = await page.evaluate(async () => {
  const { bus } = await import('/src/core/events.js');
  const g = window.__game; g.settings.painted = false;
  bus.emit('roomEntered', { stageId: 's03', roomId: 'r1' });
  await new Promise((r) => setTimeout(r, 300));
  g.settings.painted = true;
  return { rigs: Object.keys(window.__k.rigStats()) };
});
console.log(JSON.stringify(out, null, 1));
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
