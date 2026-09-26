// Art-vs-logic measurement for painted enemies (QA §9.2/§9.5/§9.6): draws every gallery state of each enemy, painted
// and vector, into an offscreen canvas and prints the opaque bounding box (logical px, feet origin, facing right)
// next to the logic rect (hurtbox) and — for attack states — the AI's strike rect, so reach/overhang/cull problems
// show up as numbers instead of eyeballing screenshots.
//   node tools/painted/enemies/measure.mjs [--ids bat,ghost,...] [--alpha 96] [--json out.json]
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import fs from 'node:fs';

const A = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; A[k] = v; }
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
const ids = A.ids ?? 'bat,ghost,skeleton,armor_knight,gravedigger';
await page.goto(`http://localhost:${port}/tools/painted/enemies/gallery.html?ids=${ids}&t=1.3`);
await page.waitForFunction(() => window.__galleryReady, null, { timeout: 30000 });
const rows = await page.evaluate(async ({ ids, thr }) => {
  const { CASES } = await import('/tools/painted/enemies/gallery.js');
  const { drawEnemy } = await import('/src/render/enemies.js');
  const { ENEMIES } = await import('/src/data/enemies.js');
  const S = 4, W = 900, H = 900, OX = 450, OY = 620;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  const out = [];
  // strike rects of the AIs (feet-relative, facing right): walker reachX/reachY/reach/reachH, digger slam
  const hitRect = (d, label) => {
    const P = d.aiParams || {};
    if (d.id === 'gravedigger') return /slam/.test(label) ? [8, -118, 114, 118] : null;
    if (P.reach != null && /strike|follow/.test(label)) return [P.reachX ?? 10, -(P.reachY ?? d.size.h * 0.8), P.reach, P.reachH ?? d.size.h * 0.6];
    return null;
  };
  for (const id of ids.split(',')) {
    const d = ENEMIES[id];
    const cases = (CASES[id] ?? CASES.skeleton)(d);
    if (id === 'gravedigger') cases.push(['slam end', { anim: 'slam', state: 'slam', animT: 0.8 }], ['slam +0.3', { anim: 'slam', state: 'slam', animT: 1.0 }]);
    for (const [label, f] of cases) {
      const res = { id, label };
      for (const painted of [true, false]) {
        globalThis.__paintedEnemies = painted;
        const e = { def: d, id, t: 1.3, anim: 'idle', animT: 0, state: 'idle', stateT: 0, flashT: 0, stun: 0, dying: 0, params: { ...(d.aiParams || {}) },
          facing: 1, scale: 1, elite: false, vx: 0, vy: 0, alpha: 1, onGround: !d.flying, hp: 1, stats: { maxHp: 1 }, w: d.size.w, h: d.size.h, cx: 0, bottom: 0, x: 0, y: 0, ...f };
        e.t = 1.3 + (f.tOff ?? 0);
        if (f.hpK) { e.hp = f.hpK; }
        if (f.dying) continue;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
        g.setTransform(S, 0, 0, S, OX, OY);
        drawEnemy(g, e, null);
        const px = g.getImageData(0, 0, W, H).data;
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] >= thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const r = x1 < 0 ? null : [+((x0 - OX) / S).toFixed(1), +((y0 - OY) / S).toFixed(1), +((x1 - OX) / S).toFixed(1), +((y1 - OY) / S).toFixed(1)];
        res[painted ? 'painted' : 'vector'] = r;
      }
      res.logic = [-d.size.w / 2, -d.size.h, d.size.w / 2, 0];
      res.hit = hitRect(d, label);
      out.push(res);
    }
  }
  globalThis.__paintedEnemies = true;
  return out;
}, { ids, thr: Number(A.alpha ?? 96) });
const fmt = (r) => (r ? `x ${String(r[0]).padStart(6)}..${String(r[2]).padEnd(6)} y ${String(r[1]).padStart(6)}..${String(r[3]).padEnd(5)}` : '—'.padEnd(34));
console.log('id/state'.padEnd(28), 'painted bbox'.padEnd(36), 'vector bbox'.padEnd(36), 'logic rect / strike rect (x0,y0,w,h)');
for (const r of rows) {
  const warn = [];
  if (r.painted && r.logic) {
    const over = Math.max(r.logic[0] - r.painted[0], r.painted[2] - r.logic[2], r.logic[1] - r.painted[1], r.painted[3] - r.logic[3]);
    if (over > 150) warn.push(`OVERHANG ${over.toFixed(0)}px (cull margin 200)`);
  }
  if (r.hit && r.painted) {
    const reachP = r.painted[2], reachH = r.hit[0] + r.hit[2], reachV = r.vector?.[2];
    if (reachH - reachP > 20) warn.push(`ART SHORT of strike by ${(reachH - reachP).toFixed(0)}px (vector ${reachV != null ? (reachH - reachV).toFixed(0) : '?'})`);
  }
  console.log(`${r.id}·${r.label}`.padEnd(28), fmt(r.painted).padEnd(36), fmt(r.vector).padEnd(36), `${r.logic.join(',')}${r.hit ? '  hit ' + r.hit.join(',') : ''}`, warn.join('; '));
}
if (A.json) fs.writeFileSync(A.json, JSON.stringify(rows, null, 1));
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
