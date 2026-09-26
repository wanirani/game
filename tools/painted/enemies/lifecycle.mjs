// Rig lifecycle QA: (1) window grows after the bake → the next room entry re-bakes at the new texel density and swaps
// the rig in without a vector fallback frame; (2) moving to another stage releases the rigs that stage does not use;
// (3) settings.painted=false stops the roomEntered preload; (4) late load: with the atlas download delayed 2.5 s an
// enemy already on screen draws vector, then cross-fades to painted over 0.3 s (samples the fade weight per frame);
// (5) missing art: the bat's rig.json/atlas 404 → the bat stays vector, no page errors; ?painted=0 → all vector.
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
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
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
// (4) late load
{
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx2.route('**/assets/painted/enemies/**/atlas.webp*', async (route) => { await new Promise((r) => setTimeout(r, 2500)); await route.continue(); });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errs.push('PAGEERROR(late) ' + e.message));
  await p2.goto(`http://localhost:${port}/index.html?scene=stage&stage=s01`);
  await p2.waitForFunction(() => window.__game?.world?.player, null, { timeout: 30000 });
  out.late = await p2.evaluate(async () => {
    const g = window.__game, w = g.world, p = w.player;
    p.takeHit = () => false;
    const e = w.spawnEnemy('skeleton', p.cx + 150, p.bottom, { facing: -1, elite: false });
    e.awake = true; e.update = function (dt) { this.t += dt; this.animT += dt; };
    const samples = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 5000) {
      await new Promise((r) => requestAnimationFrame(r));
      const k = e._pT === undefined ? (e._vecSeen ? 0 : null) : Math.min(1, (performance.now() - e._pT) / 300);
      samples.push(k);
    }
    const firstPainted = samples.findIndex((k) => k != null && k > 0);
    const ramp = samples.slice(firstPainted, firstPainted + 40).filter((k) => k > 0 && k < 1).length;
    return { vectorFramesFirst: samples.filter((k) => k === 0).length, crossfadeFrames: ramp, endsPainted: samples[samples.length - 1] === 1 };
  });
  await ctx2.close();
}
// (5) missing art folder (served as 404) and ?painted=0
for (const mode of ['missing', 'off']) {
  const c3 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (mode === 'missing') await c3.route('**/assets/painted/enemies/bat/**', (route) => route.fulfill({ status: 404, body: 'not found' }));
  const p3 = await c3.newPage();
  p3.on('pageerror', (e) => errs.push(`PAGEERROR(${mode}) ` + e.message));
  await p3.goto(`http://localhost:${port}/index.html?scene=stage&stage=s01${mode === 'off' ? '&painted=0' : ''}`);
  await p3.waitForFunction(() => window.__game?.world?.player, null, { timeout: 30000 });
  out[mode] = await p3.evaluate(async () => {
    const g = window.__game, w = g.world, p = w.player;
    p.takeHit = () => false;
    const L = ['bat', 'skeleton'].map((id, i) => { const e = w.spawnEnemy(id, p.cx + 120 + i * 90, p.bottom - (id === 'bat' ? 80 : 0), { facing: -1, elite: false }); e.awake = true; return e; });
    await new Promise((r) => setTimeout(r, 2500));
    const k = await import('/src/render/painted/enemy_kit.js');
    for (const e of L) e.takeHit(e.hp + 1, { dir: 1, kb: [100, -100] }, w, {});
    await new Promise((r) => setTimeout(r, 800));
    return { rigs: Object.fromEntries(Object.entries(k.rigStats()).map(([id, s]) => [id, s.ready ? 'ready' : s.failed ? 'failed' : 'loading'])), vecSeen: L.map((e) => !!e._vecSeen) };
  });
  await c3.close();
}
console.log(JSON.stringify(out, null, 1));
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
