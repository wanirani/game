// (임시) 보스 렌더 비용 측정
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
const port = 9000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:${port}/tools/gallery_bosses_a.html?boss=b_nightwing&cells=idle@0.1`);
await page.waitForFunction(() => window.__done === true, null, { timeout: 30000 });
const res = await page.evaluate(async () => {
  const { BOSS_A } = await import('/src/game/bosses/bosses_a.js');
  const { BOSSES_A } = await import('/src/data/bosses_a.js');
  const { Particles } = await import('/src/core/particles.js');
  const { getDiff } = await import('/src/data/difficulty.js');
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 540; const ctx = cv.getContext('2d');
  const out = {};
  for (const id of Object.keys(BOSS_A)) {
    for (const ph of [0, 2]) {
      const w = { diff: getDiff('normal'), stage: { level: 1 }, state: { difficulty: 'normal' }, arena: { x0: 0, x1: 1400 }, fx: new Particles(), camera: { shake() {}, punchZoom() {} }, game: { flash() {}, settings: {} }, entities: [], add(e) { this.entities.push(e); return e; }, spawnProjectile() { return {}; }, spawnEnemy() { return null; }, map: { typeAt: (x, y) => (y >= 9 ? 1 : 0), typeAtPx() { return 0; } }, player: { cx: 400, cy: 390, x: 385, y: 350, w: 30, h: 82, bottom: 432, hurtbox: () => ({ x: -9999, y: -9999, w: 1, h: 1 }) }, platforms: [], time: 0 };
      const b = new BOSS_A[id](w, BOSSES_A[id], 900, 432);
      if (ph) { b.phase = ph; b.phaseApply?.(ph, w); }
      b.setState('idle');
      for (let i = 0; i < 30; i++) { b.t += 1 / 60; }
      const N = 120;
      const t0 = performance.now();
      for (let i = 0; i < N; i++) { b.t += 1 / 60; ctx.clearRect(0, 0, 1280, 540); ctx.save(); b.render(ctx, w); ctx.restore(); ctx.getImageData(0, 0, 1, 1); }
      out[id + ':' + ph] = +((performance.now() - t0) / N).toFixed(2);
    }
  }
  return out;
});
console.log(JSON.stringify(res));
await browser.close(); srv.close();
