// Draw-cost benchmark: N enemies of the reference types on screen, painted vs vector, desktop or 844x390 mobile
// (optionally CPU-throttled). The game loop is frozen and frames are stepped manually so both runs see identical states.
//   node tools/painted/enemies/perf.mjs [--n 30] [--mobile] [--throttle 4] [--frames 120] [--types bat,skeleton,ghost,armor_knight,gravedigger]
//        [--quality low|medium|high (persisted setting before load: canvas dpr cap, rig texel density, warp strip LOD)]
// Prints per-frame total render ms and the share spent inside Enemy.draw (avg / p95), and the rig memory.
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';

const A = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; A[k] = v; }
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', ...(A.gpu ? [] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])] });
const mobile = !!A.mobile;
const results = [];
for (const painted of [true, false]) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: Number(A.dpr ?? 1) });
  if (A.quality) await ctx.addInitScript((q) => { try { const k = 'bloodnocturne_settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.quality = q; localStorage.setItem(k, JSON.stringify(s)); } catch { /* ignore */ } }, String(A.quality));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  if (A.throttle) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(A.throttle) }); }
  await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=${A.stage ?? 's03'}`);
  await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async ({ painted, n, types, frames }) => {
    const g = window.__game, w = g.world, p = w.player;
    if (!painted) globalThis.__paintedEnemies = false;
    const kit = await import('/src/render/painted/enemy_kit.js');
    const { ENEMIES } = await import('/src/data/enemies.js');
    const { Enemy } = await import('/src/game/enemy.js');
    p.takeHit = () => false;
    for (const e of w.enemies()) e.dead = true;
    const T = types.split(',');
    const cam = w.camera, vw = g.viewW;
    const list = [];
    for (let i = 0; i < n; i++) {
      const id = T[i % T.length], d = ENEMIES[id];
      const fx = cam.x + 60 + (i * 97) % (vw - 120), fy = p.bottom - (d.flying ? 60 + (i * 37) % 160 : 0);
      const e = w.spawnEnemy(id, fx, fy, { facing: i % 2 ? 1 : -1 });
      e.awake = true;
      // scripted animation cycle (no AI/physics so both runs are identical): walk / attack / fly with varied phase
      const ph = i * 0.37;
      e.update = function (dt) { this.t += dt; this.animT += dt; this.stateT += dt; const k = (this.t + ph) % 3; if (!this.def.flying) { this.onGround = true; this.anim = k < 2 ? 'walk' : (this.def.id === 'gravedigger' ? 'slam' : 'attack'); if (k >= 2) this.animT = k - 2; } else { this.anim = 'fly'; this.state = 'fly'; this.vx = Math.sin(this.t) * 90; this.vy = Math.cos(this.t * 2) * 60; } };
      list.push(e);
    }
    // wait for rigs
    if (painted) {
      for (let k = 0; k < 100; k++) { const st = Object.values(kit.rigStats()); if (st.length >= T.length && st.every((s) => s.ready || s.failed)) break; await new Promise((res) => setTimeout(res, 100)); }
    }
    // freeze the loop, step manually
    const tick = g.tick?.bind(g), render = g.render?.bind(g);
    g.tick = () => {}; g.render = () => {};
    const proto = Enemy.prototype, od = proto.draw;
    let acc = 0;
    proto.draw = function (ctx, world) { const t0 = performance.now(); od.call(this, ctx, world); acc += performance.now() - t0; };
    const ctx2 = g.ctx ?? g.canvas.getContext('2d');
    const tot = [], enm = [];
    for (let f = 0; f < frames + 20; f++) {
      tick(1 / 60);
      acc = 0;
      const t0 = performance.now();
      render();
      ctx2.getImageData(0, 0, 1, 1);             // force the frame to finish (flush) so timing includes raster
      const dt = performance.now() - t0;
      if (f >= 20) { tot.push(dt); enm.push(acc); }
    }
    proto.draw = od;
    const s = (a) => { const b = [...a].sort((x, y) => x - y); return { avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +b[Math.floor(b.length * 0.95)].toFixed(2) }; };
    const visible = list.filter((e) => cam.visible(e.x, e.y, e.w, e.h, 0)).length;
    return { painted, n: list.length, visible, frame: s(tot), enemyDraw: s(enm), rigs: kit.rigStats(), scale: g.scale, quality: g.settings?.quality };
  }, { painted, n: Number(A.n ?? 30), types: A.types ?? 'bat,skeleton,ghost,armor_knight,gravedigger', frames: Number(A.frames ?? 120) });
  r.errs = errs;
  results.push(r);
  await ctx.close();
}
for (const r of results) console.log(JSON.stringify(r));
const [P, V] = results;
console.log(`frame ms painted ${P.frame.avg} (p95 ${P.frame.p95}) vs vector ${V.frame.avg} (p95 ${V.frame.p95}); enemy draw painted ${P.enemyDraw.avg} vs vector ${V.enemyDraw.avg} ms/frame for ${P.visible} visible enemies`);
const mem = Object.values(P.rigs).reduce((a, s) => a + (s.MB || 0), 0);
console.log(`rig memory ${mem.toFixed(2)} MB`);
await browser.close(); srv.close();
