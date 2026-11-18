// FIRE2-VERIFY: an independent look at the fire of the game scene (v2g) - every fire anchor and candle group of every area, found from the
// running scene (not from a hand-made list), from the game camera. One browser, one page at a time (headless WebGL = software rendering).
//   node tools/v2/fire2verify.mjs --mode look  [--devices fold_open,phone2] [--areas a,b] [--tiers mid] [--out DIR] [--candlemax 99] [--noshot 1]
//        per spot: three frames 0.2 s apart (<area>_<device>_<tier>_<i>_<k>.jpg) + numbers (live particles, fire particles, ring fill, draw calls,
//        lights, overdraw) -> DIR/look_<device>_<tier>.json; blazes (k >= 1.3) also get the hero (and an enemy if the area has one) standing right
//        in front of and behind the fire (.._front.jpg / .._behind.jpg)
//   --mode gc      garbage of the fire alone: anchors.tick + particles.update 1500 times at the widest fire view, JS heap before / after (precise)
//   --mode mem     enter and leave an area five times: WebGL objects alive (counted at the context) and the game's own byte figures
//   --mode presets [--before <commit>]  every preset of the effects test page at two times, seeded -> DIR/preset_hash.json (sha1 of the picture)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const MODE = String(args.mode || 'look'), OUT = String(args.out || '/tmp/claude-0/v2/fire2verify/' + MODE);
const DEVICES = String(args.devices || 'fold_open').split(','), TIERS = String(args.tiers || 'mid').split(',');
const AREAS = String(args.areas || 'eshville_now,eshville_past,ossuary_now,ossuary_past,belltower_now,graveyard_now,slice0').split(',');
const CMAX = Number(args.candlemax ?? 99), NOSHOT = !!args.noshot, DPR = args.dpr ? Number(args.dpr) : null;
fs.mkdirSync(OUT, { recursive: true });
const BEFORE = args.before ? String(args.before) : null;
const BEFORE_FILES = ['src/v2/game/anchors.js', 'src/v2/env/props2.js', 'src/v2/env/props3.js', 'src/v2/fx/engine.js', 'src/v2/fx/sprites.js'];
const OLD = BEFORE ? Object.fromEntries(BEFORE_FILES.map((f) => [f, execFileSync('git', ['show', BEFORE + ':' + f], { encoding: 'utf8', maxBuffer: 1 << 26 })])) : {};
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const errs = []; const rows = [];
const log = (o) => { rows.push(o); console.log(JSON.stringify(o)); };

function glCount() {   // before any page script: count WebGL objects alive at the context itself
  const C = window.__GLC = { tex: 0, buf: 0, vao: 0, prog: 0, fbo: 0, rbo: 0 };
  const P = WebGL2RenderingContext.prototype, wrap = (mk, del, k) => { const a = P[mk], b = P[del]; P[mk] = function (...x) { C[k]++; return a.apply(this, x); }; P[del] = function (o, ...x) { if (o) C[k]--; return b.call(this, o, ...x); }; };
  wrap('createTexture', 'deleteTexture', 'tex'); wrap('createBuffer', 'deleteBuffer', 'buf'); wrap('createVertexArray', 'deleteVertexArray', 'vao'); wrap('createProgram', 'deleteProgram', 'prog'); wrap('createFramebuffer', 'deleteFramebuffer', 'fbo'); wrap('createRenderbuffer', 'deleteRenderbuffer', 'rbo');
}
function install() {
  const sc = window.__v2.scene, g = window.__game; g._pageHidden = true;
  const floorAt = (x, z, yMax) => { let best = null; for (const b of sc.W.boxes) { if (!b.walk || x < b.x0 + 14 || x > b.x1 - 14 || z < b.z0 + 14 || z > b.z1 - 14) continue; if (yMax != null && b.y1 > yMax) continue; if (!best || b.y1 > best.y1) best = b; } return best; };
  const solidAt = (x, z, fl) => sc.W.boxes.some((b) => !b.walk && x > b.x0 - 15 && x < b.x1 + 15 && z > b.z0 - 15 && z < b.z1 + 15 && b.y1 > fl + 6 && (b.y0 ?? -1e9) < fl + 70);
  const S = window.__S = {
    spots(cmax) {   // every fire anchor + candle group the scene really has
      const out = []; let nc = 0;
      sc.anchors.list.forEach((a, i) => {
        if (a.kind === 'fire') out.push({ i, kind: 'fire', x: a.x, y: a.y, z: a.z, w: a.w, k: a.set.k, bh: a.set.bh, cold: a.set.light[2] > a.set.light[0], light: a.light });
        else if (a.kind === 'candles' && nc++ < cmax) out.push({ i, kind: 'candles', x: a.x, y: a.y, z: a.z, w: 30, k: 0, bh: 30, n: a.n });
      });
      return out;
    },
    put(x, z, fl, dx, dz) { const h = sc.sim.hero;
      h.x = x; h.z = z; h.y = fl; h.vx = h.vz = h.vy = 0; h.onGround = true; const l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ;
      if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; } h._px = h.x; h._py = h.y; h._pz = h.z; sc.visY = sc.visYP = h.y; sc.cam.snap = true; },
    clearEnemies() { for (const e of sc.sim.enemies) { if (e._fv) continue; e._fv = [e.x, e.z, e.y, e.active]; e.active = false; e.x += 9000; } },
    enemy(x, z, fl) { const e = sc.sim.enemies.find((q) => !q.dead && q.state !== 'dead'); if (!e) return null; e.x = x; e.z = z; e.y = fl; e.vx = e.vz = 0; e.active = false; return e.kind ?? e.type ?? 'enemy'; },
    /** a standing place near the spot: the first offset with floor under it and nothing solid in it. offs = [[dx, dz], ...] */
    stand(s, offs) { const top = s.kind === 'fire' ? s.y + 20 : s.y + 40;
      for (const [ox, oz] of offs) { const x = s.x + ox, z = s.z + oz, b = floorAt(x, z, top); if (!b || solidAt(x, z, b.y1)) continue; S.put(x, z, b.y1, -ox, -oz); return { x, z, fl: b.y1 }; }
      return null; },
    tick(n, every = 60) { for (let i = 0; i < n; i++) { const h = sc.sim.hero; h.hp = h.hpMax ?? 100; g.tick(1 / 60); if (i % every === every - 1) g.render(); } },
    shot(fx, fy, fz) { g.alpha = 1; g.render(); const p = sc.project(fx, fy, fz, {}), W = g.viewW, H = g.viewH, cv = document.querySelector('canvas'), r = cv.getBoundingClientRect();
      const st = sc.stats(), P = sc.fx?.particles, m = sc.fx?.measure?.() ?? null, pm = P?.measure?.() ?? null, h = sc.sim.hero, hp = sc.project(h.x, h.y + 40, h.z, {});
      return { css: [r.left + (p.x / W) * r.width, r.top + (p.y / H) * r.height], heroCss: [r.left + (hp.x / W) * r.width, r.top + (hp.y / H) * r.height], scale: r.width / W, draws: st.gl?.draws, lights: st.fx?.lights, anchors: st.anchors, hero: [Math.round(h.x), Math.round(h.y), Math.round(h.z)],
        live: pm?.n ?? null, fire: pm?.ambN ?? null, ring: P?.count ?? null, cap: P?.cap ?? null, over: m ? +m.overdraw.toFixed(3) : null, overFire: pm?.ambArea != null ? +(pm.ambArea / (960 * 726)).toFixed(3) : null, pdraws: P?.draws ?? null, gov: P ? +P.gov.toFixed(2) : null, gain: sc.fx ? +sc.fx.gain.toFixed(2) : null, dropped: Math.round(P?.dropped ?? 0), view: [W, H] }; },
  };
  return { area: window.__v2.area, tier: sc.perf.tier, anchors: sc.anchors.list.length };
}
let page = null;
const open = async (area, tier, dev, extra = '') => {
  if (page) await page.context().close();
  const ctx = await browser.newContext({ ...contextOptions(dev), ...(DPR ? { deviceScaleFactor: DPR } : {}), serviceWorkers: 'block' }); page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + area + ' ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|Failed to load resource/.test(m.text())) errs.push('[console] ' + area + ' ' + m.text().slice(0, 200)); });
  await page.addInitScript(glCount);
  if (BEFORE) for (const f of BEFORE_FILES) await page.route('**/' + f, (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: OLD[f] }));
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${area}&v2auto=0&v2tier=${tier}&nosw${extra}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 }).catch(() => {});
  const ok = await page.evaluate(() => !!window.__v2?.ready); if (!ok) throw new Error('scene not ready: ' + area + ' ' + (await page.evaluate(() => String(window.__v2?.error ?? ''))));
  return page.evaluate(install);
};
const FRONT = [[90, -110], [-90, -110], [90, -70], [-90, -70], [0, -150], [140, -50], [-140, -50], [0, -220], [70, 50], [-70, 50], [0, 90]];
const clipAt = (css, w, h, up = 0.55) => { const vp = page.viewportSize(); w = Math.min(w, vp.width); h = Math.min(h, vp.height); return { x: Math.max(0, Math.min(vp.width - w, css[0] - w / 2)), y: Math.max(0, Math.min(vp.height - h, css[1] - h * up)), width: w, height: h }; };
try {
  if (MODE === 'look') {
    for (const dev of DEVICES) for (const tier of TIERS) for (const area of AREAS) {
      const info = await open(area, tier, dev);
      const spots = await page.evaluate((c) => { window.__S.clearEnemies(); return window.__S.spots(c); }, CMAX);
      let first = true;
      for (const s of spots) {
        const at = await page.evaluate(([s, offs, n]) => { const p = window.__S.stand(s, offs); if (!p) return null; window.__S.tick(4, 2); window.__S.tick(n); return p; }, [s, FRONT, first ? 330 : 200]);
        const name = `${area}_${dev}_${tier}_${String(s.i).padStart(2, '0')}_${s.kind}`;
        if (!at) { log({ area, dev, tier, i: s.i, kind: s.kind, at: [s.x, s.y, s.z], err: 'no standing place found' }); continue; }
        first = false;
        const fy = s.y + (s.kind === 'fire' ? s.bh * 0.5 : 12), big = s.kind === 'fire' ? [Math.min(640, 300 + s.w * 1.6 + s.bh), Math.min(520, 240 + s.bh * 1.5)] : [260, 200];
        let worst = null;
        for (let k = 0; k < 3; k++) {
          const i = await page.evaluate(([s, fy]) => window.__S.shot(s.x, fy, s.z), [s, fy]);
          if (!worst || i.live > worst.live) worst = i; worst.overFireMax = Math.max(worst.overFireMax ?? 0, i.overFire ?? 0); worst.ringMax = Math.max(worst.ringMax ?? 0, i.ring ?? 0);
          if (!NOSHOT) await page.screenshot({ path: `${OUT}/${name}_${k}.jpg`, type: 'jpeg', quality: 86, clip: clipAt(i.css, big[0] * i.scale, big[1] * i.scale, s.kind === 'fire' ? 0.6 : 0.5) });
          await page.evaluate(() => window.__S.tick(12, 99));
        }
        log({ area, dev, tier, i: s.i, kind: s.kind, at: [s.x, Math.round(s.y), s.z], w: s.w, k: s.k, cold: s.cold, hero: worst.hero, live: worst.live, fire: worst.fire, ring: worst.ringMax, cap: worst.cap, overFire: worst.overFireMax, over: worst.over, pdraws: worst.pdraws, draws: worst.draws, lights: worst.lights, lit: worst.anchors?.lit, anchorsLive: worst.anchors?.live, gov: worst.gov, gain: worst.gain, view: worst.view });
        if (s.kind === 'fire' && s.k >= 1.25 && !NOSHOT) {   // a blaze: the hero (and an enemy) right in front of it and right behind it
          for (const [pose, offs] of [['front', [[0, -34], [0, -50], [0, -70], [20, -90]]], ['behind', [[0, 44], [0, 60], [14, 80]]]]) {
            const r = await page.evaluate(([s, offs, pose]) => { const p = window.__S.stand(s, offs); if (!p) return null; const en = window.__S.enemy(p.x + 64, p.z, p.fl); window.__S.tick(4, 2); window.__S.tick(60, 30); const q = window.__S.shot(s.x, s.y + s.bh * 0.4, s.z); q.at = p; q.enemy = en; q.pose = pose; window.__S.clearEnemies(); return q; }, [s, offs, pose]);
            if (!r) { log({ area, dev, tier, i: s.i, pose, err: 'no place ' + pose }); continue; }
            await page.screenshot({ path: `${OUT}/${name}_${pose}.jpg`, type: 'jpeg', quality: 86, clip: clipAt(r.css, 560 * r.scale, 440 * r.scale, 0.6) });
            log({ area, dev, tier, i: s.i, pose, hero: r.hero, enemy: r.enemy });
          }
        }
      }
      console.log('# done', area, dev, tier, JSON.stringify(info), 'spots', spots.length);
    }
    fs.writeFileSync(`${OUT}/look_${DEVICES.join('+')}_${TIERS.join('+')}.json`, JSON.stringify(rows, null, 1));
  } else if (MODE === 'gc') {
    await open(String(args.area || 'eshville_now'), TIERS[0], DEVICES[0]);
    const r = await page.evaluate(([offs]) => {
      const sc = window.__v2.scene, S = window.__S, P = sc.fx.particles; S.clearEnemies();
      const s = S.spots(99).filter((q) => q.kind === 'fire').sort((a, b) => b.w - a.w)[0]; S.stand(s, offs); S.tick(4, 2); S.tick(300);
      const cam = sc.cam, A = sc.anchors, fx = sc.fx, vp = sc.vp, out = { spot: [s.x, s.y, s.z, s.w], anchorsLive: A.live };
      const run = (n) => { for (let i = 0; i < n; i++) { A.tick(sc, fx, 1 / 60, vp, cam.tx, cam.tz); P.fr[0] += 1 / 60; P.update(); } };
      run(600);   // warm up (the optimiser settles)
      const heap = () => performance.memory.usedJSHeapSize;
      out.runs = [];
      for (let k = 0; k < 4; k++) { globalThis.gc?.(); const sp0 = P.spawned, m0 = heap(); run(1500); const m1 = heap(); out.runs.push({ bytes: m1 - m0, perTick: +((m1 - m0) / 1500).toFixed(2), emitted: P.spawned - sp0 }); }
      // the same loop with nothing in view (the anchors are culled): the floor of the measurement
      const tx = cam.tx; globalThis.gc?.(); const m2 = heap(); for (let i = 0; i < 1500; i++) { A.tick(sc, fx, 1 / 60, vp, tx + 90000, cam.tz); P.fr[0] += 1 / 60; P.update(); } out.culled = { bytes: heap() - m2 };
      out.gcExposed = typeof globalThis.gc === 'function'; out.sets = null;
      return out; }, [FRONT]);
    log(r); fs.writeFileSync(`${OUT}/gc.json`, JSON.stringify(r, null, 1));
  } else if (MODE === 'mem') {
    const A = String(args.area || 'eshville_now'), B = String(args.other || 'ossuary_past');
    await open(A, TIERS[0], DEVICES[0]);
    const snap = () => page.evaluate(() => { const sc = window.__v2.scene, st = sc.stats(); return { area: sc.area?.id, gl: { ...window.__GLC }, texBytes: st.gl?.texBytes, bufBytes: st.gl?.bufBytes, fxBytes: st.fx?.bytes, anchors: st.anchors?.n, ring: sc.fx.particles.count, lights: sc.fx.lights.count, heap: Math.round(performance.memory.usedJSHeapSize / 1024) }; });
    const go = async (to) => { const ok = await page.evaluate(async (to) => { const sc = window.__v2.scene, g = window.__game; if (!sc.travelTo(to, null)) return 'refused';
      for (let i = 0; i < 400; i++) { for (let k = 0; k < 10; k++) g.tick(1 / 60); g.render(); await new Promise((r) => setTimeout(r, 30)); if (sc.area?.id === to && !sc._go && sc.ready && sc.fadeA < 0.05) { for (let k = 0; k < 90; k++) g.tick(1 / 60); g.render(); globalThis.gc?.(); return 'ok'; } }
      return 'timeout ' + sc.area?.id; }, to); if (ok !== 'ok') throw new Error('travel ' + to + ': ' + ok); };
    await page.evaluate(() => { window.__S.tick(120); globalThis.gc?.(); });
    log({ round: 0, ...(await snap()) });
    for (let r = 1; r <= 5; r++) { await go(B); const b = await snap(); await go(A); log({ round: r, there: { gl: b.gl, texBytes: b.texBytes, bufBytes: b.bufBytes, anchors: b.anchors }, ...(await snap()) }); }
    fs.writeFileSync(`${OUT}/mem.json`, JSON.stringify(rows, null, 1));
  } else if (MODE === 'presets') {
    const ctx = await browser.newContext({ ...contextOptions('fold_open'), deviceScaleFactor: 1, serviceWorkers: 'block' }); page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
    await page.addInitScript(() => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; });
    if (BEFORE) for (const f of BEFORE_FILES) await page.route('**/' + f, (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: OLD[f] }));
    await page.goto(`http://localhost:${port}/tools/v2/fx_view.html?ui=0&tier=${TIERS[0]}`);
    await page.waitForFunction(() => window.__fx && window.__fx.ready && window.__fx.texReady, null, { timeout: 30000 });
    const names = await page.evaluate(() => window.__fx.presets.map((p) => p.name)); const H = {};
    for (const nm of names) for (const t of [0.07, 0.3, 0.75]) {
      const r = await page.evaluate(([nm, t]) => { let s = 777; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        const a = window.__fx; a.manual = true; a.reset(); a.steps(2, 1 / 60); a.fire(nm); a.steps(Math.round(t * 120), 1 / 120); a.steps(1, 0);
        const m = a.fx.measure(); return { url: document.getElementById('c').toDataURL('image/png'), p: m.particles, o: +m.overdraw.toFixed(4) }; }, [nm, t]);
      H[nm + '@' + t] = crypto.createHash('sha1').update(r.url).digest('hex').slice(0, 16) + ' p' + r.p + ' o' + r.o;
    }
    fs.writeFileSync(`${OUT}/preset_hash${BEFORE ? '_before' : ''}.json`, JSON.stringify(H, null, 1)); console.log('presets hashed', Object.keys(H).length, 'names', names.length);
  }
} catch (e) { errs.push('exception: ' + (e?.stack ?? e)); }
console.log(errs.length ? errs.slice(0, 12).join('\n') : 'NO ERRORS');
await browser.close(); srv.close?.();
process.exit(errs.some((e) => /pageerror|exception/.test(e)) ? 1 : 0);
