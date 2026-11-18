// FIRE-2: fire captures and numbers in the game scene (v2g), one browser, one page at a time (headless WebGL = software rendering: slow).
//   node tools/v2/fire2_shot.mjs --out DIR [--tier mid] [--only esh_roof,brazier] [--before <commit>] [--dpr 2.6] [--ticks 330]
//       one crop per fire spot (+ <spot>_full.jpg); --before serves the fire files of that commit through page routes (the rest is today's tree)
//   --stats 1          per spot x low/mid/high: live particles, how many of them are fire (ambient), draw calls, lights, overdraw (all effects and
//                      fire only; quad area / the 960x726 screen), anchors alive  -> DIR/stats.json
//   --strip esh_roof   six frames of one spot, 0.1 s apart -> DIR/strip_<spot>_<i>.png
//   --presets 1        hit and magic effects in the effects test page with a seeded Math.random (three presets at fixed times) -> DIR/preset_*.png:
//                      run once with --before and once without, then compare the files byte for byte / pixel for pixel
// Spots: the eight fire spots of tools/v2/speedfire_fire.mjs + close-ups of candles and a brazier.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const OUT = String(args.out || '/tmp/claude-0/v2/fire2/now'), TIER = String(args.tier || 'mid'), ONLY = args.only ? String(args.only).split(',') : null, DPR = args.dpr ? Number(args.dpr) : null;
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = args.before ? String(args.before) : null;
const BEFORE_FILES = ['src/v2/game/anchors.js', 'src/v2/env/props2.js', 'src/v2/env/props3.js', 'src/v2/fx/engine.js', 'src/v2/fx/sprites.js', 'src/v2/fx/presets.js', 'src/v2/fx/index.js'];
const OLD = BEFORE ? Object.fromEntries(BEFORE_FILES.map((f) => [f, execFileSync('git', ['show', BEFORE + ':' + f], { encoding: 'utf8', maxBuffer: 1 << 26 })])) : {};
const SPOTS = [
  { n: 'esh_roof', area: 'eshville_now', hx: 300, hz: 150, f: [200, 250, 300], crop: [620, 420], label: 'outskirts: roof and wall-top blaze' },
  { n: 'esh_wreck', area: 'eshville_now', hx: 470, hz: 140, f: [450, 50, 244], crop: [560, 400], label: 'outskirts: burning wreck' },
  { n: 'brazier', area: 'eshville_now', hx: 2640, hz: 180, f: [2700, 100, 262], crop: [460, 380], label: 'main street: brazier' },
  { n: 'ossuary_past', area: 'ossuary_past', hx: 600, hz: 2880, f: [450, 110, 2980], crop: [560, 400], label: '1697 ossuary: door bowls' },
  { n: 'ossuary_now', area: 'ossuary_now', hx: 600, hz: 2880, f: [450, 110, 2980], crop: [560, 400], label: 'ossuary tonight: door bowls' },
  { n: 'tower_brazier', area: 'belltower_now', hx: 180, hz: 1140, f: [70, 790, 1204], crop: [520, 400], label: 'bell tower: brazier' },
  { n: 'past_brazier', area: 'eshville_past', hx: 2640, hz: 180, f: [2700, 100, 262], crop: [460, 380], label: '1697 main street: brazier' },
  { n: 'slice0_brazier', area: 'slice0', hx: 1730, hz: 1540, f: [1790, 100, 1624], crop: [460, 380], label: 'test slice: brazier' },
  // close-ups (not part of the eight): candles on the floor of the crypt, the brazier bowl
  { n: 'candles', area: 'ossuary_past', hx: 420, hz: 2850, f: [340, 14, 2900], crop: [300, 230], close: true, label: 'candles (1697 ossuary)' },
  { n: 'candles_now', area: 'ossuary_now', hx: 420, hz: 2850, f: [340, 14, 2900], crop: [300, 230], close: true, label: 'candles (ossuary tonight)' },
  { n: 'brazier_close', area: 'eshville_now', hx: 2640, hz: 180, f: [2700, 110, 262], crop: [250, 230], close: true, label: 'brazier bowl' },
].filter((s) => (ONLY ? ONLY.includes(s.n) : !s.close || args.close));
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = []; const rows = [];
function install() {
  const sc = window.__v2.scene, g = window.__game; g._pageHidden = true;
  window.__S = {
    put(x, z, dx, dz) { const h = sc.sim.hero, B = sc.W.boxes; let gy = -Infinity; for (const b of B) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 > gy) gy = b.y1; }
      h.x = x; h.z = z; if (Number.isFinite(gy)) h.y = gy; h.vx = h.vz = h.vy = 0; h.onGround = true; const l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ;
      if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; } h._px = h.x; h._py = h.y; h._pz = h.z; sc.visY = sc.visYP = h.y; sc.cam.snap = true;
      for (const e of sc.sim.enemies) { e.active = false; e.x += 5000; } },   // enemies out of the way (the fire is what we look at)
    tick(n) { for (let i = 0; i < n; i++) { const h = sc.sim.hero; h.hp = h.hpMax ?? 100; g.tick(1 / 60); if (i % 6 === 0) g.render(); } },
    shot(fx, fy, fz) { g.alpha = 1; g.render(); const p = sc.project(fx, fy, fz, {}), W = g.viewW, H = g.viewH, cv = document.querySelector('canvas'), r = cv.getBoundingClientRect();
      const st = sc.stats(), P = sc.fx?.particles, m = sc.fx?.measure?.() ?? null, pm = P?.measure?.() ?? null;
      return { css: [r.left + (p.x / W) * r.width, r.top + (p.y / H) * r.height], fx: st.fx, draws: st.gl?.draws, worldDraws: st.world?.draws, anchors: st.anchors, tier: st.fx?.tier, hero: [Math.round(sc.sim.hero.x), Math.round(sc.sim.hero.y), Math.round(sc.sim.hero.z)],
        live: pm?.n ?? null, fire: pm?.ambN ?? null, over: m ? +m.overdraw.toFixed(3) : null, overFire: pm?.ambArea != null ? +(pm.ambArea / (960 * 726)).toFixed(3) : null, pdraws: P?.draws ?? null, gov: P ? +P.gov.toFixed(2) : null, gain: sc.fx ? +sc.fx.gain.toFixed(2) : null }; },
  };
  return { area: window.__v2.area, tier: sc.perf.tier };
}
let page = null, cur = '';
const open = async (area, tier) => {
  const key = area + ':' + tier; if (cur === key) return; cur = key;
  if (page) await page.context().close();
  const ctx = await browser.newContext({ ...contextOptions('fold_open'), ...(DPR ? { deviceScaleFactor: DPR } : {}), serviceWorkers: 'block' }); page = await ctx.newPage();   // (a service worker would answer the module requests and skip the --before routes)
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  if (BEFORE) for (const f of BEFORE_FILES) await page.route('**/' + f, (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: OLD[f] }));
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${area}&v2auto=0&v2tier=${tier}&nosw`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 }).catch(() => {});
  const ok = await page.evaluate(() => !!window.__v2?.ready); if (!ok) throw new Error('scene not ready: ' + area);
  await page.evaluate(install); await page.evaluate((n) => { window.__TICKS = n; }, Number(args.ticks ?? 330));   // until the area name banner is gone
};
const clipOf = (s, i) => { const vp = page.viewportSize(), w = Math.min(s.crop[0], vp.width), h = Math.min(s.crop[1], vp.height); return { x: Math.max(0, Math.min(vp.width - w, i.css[0] - w / 2)), y: Math.max(0, Math.min(vp.height - h, i.css[1] - h * 0.55)), width: w, height: h }; };
try {
  if (args.presets) {   // the effects test page, deterministic: seeded Math.random, manual stepping
    const ctx = await browser.newContext({ ...contextOptions('fold_open'), deviceScaleFactor: 1, serviceWorkers: 'block' }); page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
    await page.addInitScript(() => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; });
    if (BEFORE) for (const f of BEFORE_FILES) await page.route('**/' + f, (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: OLD[f] }));
    await page.goto(`http://localhost:${port}/tools/v2/fx_view.html?ui=0&tier=${TIER}`);
    await page.waitForFunction(() => window.__fx && window.__fx.ready && window.__fx.texReady, null, { timeout: 30000 });
    for (const [nm, t] of [['hit.slash.heavy', 0.06], ['hit.finisher', 0.1], ['fire.pillar', 0.85], ['ice.nova', 0.62], ['enemy.breath', 0.8]]) {
      const r = await page.evaluate(([nm, t]) => { let s = 777; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        const a = window.__fx; a.manual = true; a.reset(); a.steps(2, 1 / 60); a.fire(nm); a.steps(Math.round(t * 120), 1 / 120); a.steps(1, 0);
        const m = a.fx.measure(); return { url: document.getElementById('c').toDataURL('image/png'), particles: m.particles, over: +m.overdraw.toFixed(4), draws: a.fx.particles.draws + a.fx.quads.draws + a.fx.meshes.draws + a.fx.ribbons.draws }; }, [nm, t]);
      fs.writeFileSync(`${OUT}/preset_${nm}.png`, Buffer.from(r.url.split(',')[1], 'base64'));
      rows.push({ preset: nm, at: t, particles: r.particles, overdraw: r.over, draws: r.draws }); console.log(JSON.stringify(rows[rows.length - 1]));
    }
    // the cost of every preset alone (the test page's own measure: emitted, peak live particles, peak draw calls, peak overdraw), same seed
    const cost = await page.evaluate((tier) => window.__fx.presets.map((p) => { let s = 4242; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const c = window.__fx.cost(p.name, tier); return [p.name, c.emitted, c.peakParticles, c.peakDraws, c.peakOverdraw, c.peakQuads, c.peakMeshes, c.peakLights].join(' '); }), TIER);
    fs.writeFileSync(`${OUT}/preset_cost.txt`, cost.join('\n') + '\n'); console.log('preset cost lines', cost.length);
    fs.writeFileSync(`${OUT}/presets.json`, JSON.stringify(rows, null, 1));
  } else if (args.stats) {
    for (const s of SPOTS) for (const t of ['low', 'mid', 'high']) {
      await open(s.area, t);
      const i = await page.evaluate(([s]) => { window.__S.put(s.hx, s.hz, s.f[0] - s.hx, s.f[2] - s.hz); window.__S.tick(240);
        let mx = null; for (let k = 0; k < 8; k++) { window.__S.tick(9); const q = window.__S.shot(s.f[0], s.f[1], s.f[2]); if (!mx || (q.live ?? 0) > (mx.live ?? 0)) mx = q; if (q.overFire != null) mx.overFireMax = Math.max(mx.overFireMax ?? 0, q.overFire); }   // the worst of eight looks
        return mx; }, [s]);
      rows.push({ spot: s.n, tier: t, particles: i.fx?.particles, live: i.live, fire: i.fire, overdraw: i.over, overFire: i.overFireMax ?? i.overFire, pdraws: i.pdraws, draws: i.draws, lights: i.fx?.lights, gov: i.gov, gain: i.gain, anchorsLive: i.anchors?.live, anchorsLit: i.anchors?.lit });
      console.log(JSON.stringify(rows[rows.length - 1]));
    }
    fs.writeFileSync(`${OUT}/stats.json`, JSON.stringify(rows, null, 1));
  } else if (args.strip) {
    const s = SPOTS.find((q) => q.n === String(args.strip)) ?? SPOTS[0]; await open(s.area, TIER);
    let i = await page.evaluate(([s]) => { window.__S.put(s.hx, s.hz, s.f[0] - s.hx, s.f[2] - s.hz); window.__S.tick(Number(window.__TICKS ?? 150)); return window.__S.shot(s.f[0], s.f[1], s.f[2]); }, [s]);
    for (let k = 0; k < 6; k++) { await page.screenshot({ path: `${OUT}/strip_${s.n}_${k}.png`, clip: clipOf(s, i) }); i = await page.evaluate(([s]) => { window.__S.tick(6); return window.__S.shot(s.f[0], s.f[1], s.f[2]); }, [s]); }
    console.log('strip', s.n, 'ok');
  } else for (const s of SPOTS) {
    await open(s.area, TIER);
    const i = await page.evaluate(([s]) => { window.__S.put(s.hx, s.hz, s.f[0] - s.hx, s.f[2] - s.hz); window.__S.tick(Number(window.__TICKS ?? 150)); return window.__S.shot(s.f[0], s.f[1], s.f[2]); }, [s]);
    const f = `${OUT}/${s.n}.png`; await page.screenshot({ path: f, clip: clipOf(s, i) }); if (!s.close) await page.screenshot({ path: `${OUT}/${s.n}_full.jpg`, type: 'jpeg', quality: 70 });
    rows.push({ spot: s.n, file: f, hero: i.hero, particles: i.fx?.particles, live: i.live, fire: i.fire, over: i.over, overFire: i.overFire, lights: i.fx?.lights, draws: i.draws, anchors: i.anchors }); console.log(JSON.stringify(rows[rows.length - 1]));
  }
} catch (e) { errs.push('exception: ' + (e?.stack ?? e)); }
console.log(errs.length ? errs.slice(0, 8).join('\n') : 'NO ERRORS');
await browser.close(); srv.close?.();
process.exit(errs.some((e) => /pageerror|exception/.test(e)) ? 1 : 0);
