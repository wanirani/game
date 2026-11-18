// WORLD-LOOK: is there empty space beyond the world? The hero is put on every standable spot of an area's walk boxes (a lattice that
// includes every edge, plus exits, spawns and hot spots; both facings) and at the places of the story's pulled-back camera shots
// (src/v2/game/storyhost.js SHOTS: the opening moon shot, the bell shots ...). With the game camera at rest there, one frame is drawn
// WITHOUT the sky picture on a magenta clear colour: a pixel that stays magenta is a pixel where nothing of the world is drawn - in the
// game it shows the fog-coloured foot of the sky picture or the clear colour. Below the horizon that is empty space where ground,
// wall or backdrop should be.
//   measure per spot = magenta pixels below the horizon line / all pixels of the picture   (flagged from --min, default 0.3 %)
//   node tools/v2/look_edge.mjs [--areas a,b] [--out /tmp/claude-0/v2/look/edge] [--tag before] [--step 150] [--keep 8] [--min 0.3]
//        [--device fold_open] [--flags gate_open] [--stills 0] [--png 1]
// Two pages per area, one after the other in one browser: the scan (tier low: smaller picture, no MSAA, no post - the world geometry
// and the camera are the same in every tier) and the stills of the worst spots as the player sees them (tier mid).
// Prints a table, writes <out>/look_edge_<tag>.json. Exit 1 only on page errors (the numbers are the report, not a gate).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import http from 'node:http';
import path from 'node:path';

// --root <dir>: serve another copy of the game (a snapshot taken before a change: its own src/ and index.html, everything else linked) instead of this tree
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8' };
const serveRoot = (root, p) => new Promise((r) => { const srv = http.createServer((req, res) => { let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(root, u); if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; } fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); }); }); srv.listen(p, () => r(srv)); });

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/look/edge'), TAG = String(args.tag || 'run');
const ALL = ['eshville_now', 'eshville_past', 'graveyard_now', 'graveyard_past', 'belltower_now', 'ossuary_now', 'ossuary_past', 'slice0'];
const AREAS = args.areas && args.areas !== true ? String(args.areas).split(',').filter(Boolean) : ALL;
const STEP = Math.max(60, Number(args.step ?? 150)), KEEP = Math.max(0, Number(args.keep ?? 8)), MIN = Number(args.min ?? 0.3), STILLS = String(args.stills ?? '1') !== '0', PNG = !!args.png;
const FLAGS = args.flags && args.flags !== true ? String(args.flags).split(',').filter(Boolean) : [];
// the story's camera shots and where the hero stands when they run (src/v2/data/events.js): [shot, x, z, dx, dz, what]
const SHOT_AT = {
  eshville_now: [['moon_bell', 160, 150, 1, 0, 'opening'], ['years', 4200, 1390, 0, 1, 'big bell']],
  eshville_past: [['years', 4200, 1390, 0, 1, 'big bell'], ['wake_past', 3900, 1560, 0, -1, 'tower foot'], ['two_keepers', 4200, 1390, 0, 1, 'big bell'], ['ring_widen', 4200, 1390, 0, 1, 'ending']],
  graveyard_now: [['years', 520, 1900, 0, 1, 'road bell']], graveyard_past: [['years', 520, 1900, 0, 1, 'road bell']],
  belltower_now: [['bell_crack', 300, 1100, -1, 0, 'bell chamber'], ['fall', 300, 1100, -1, 0, 'bell chamber']],
  ossuary_now: [['years', 600, 150, 0, 1, 'entry bell'], ['banshee_song', 600, 3120, 0, 1, 'last hall']], ossuary_past: [['years', 600, 150, 0, 1, 'entry bell'], ['banshee_song', 600, 3120, 0, 1, 'last hall']],
};
const SHOTS = { moon_bell: { pitch: -0.2, dist: 1500, lookY: 420 }, bell_crack: { pitch: -0.3, dist: 900, lookY: 520 }, fall: { pitch: 0.9, dist: 1300, lookY: 40 }, wake_past: { pitch: 0.1, dist: 480, lookY: 70 }, table: { pitch: 0.22, dist: 520, lookY: 80 },
  knot: { pitch: 0.16, dist: 360, lookY: 86 }, years: { pitch: 0.42, dist: 1040, lookY: 110 }, banshee_song: { pitch: 0.12, dist: 1100, lookY: 220 }, two_keepers: { pitch: 0.2, dist: 560, lookY: 90 }, ring_widen: { pitch: 1.1, dist: 2400, lookY: 0 } };   // = storyhost.js SHOTS (pitch, dist, lookY)

function install(scan) {
  const v = window.__v2, sc = v.scene, g = window.__game; g._pageHidden = true;
  const L = (window.__L = {}), sim = sc.sim, gl = sc.glr.gl, cv = sc.glr.canvas;
  sim.update = function () {};   // the rules stand still: nobody wakes or walks while the camera is moved about
  const groundAt = (x, z) => { let gy = -Infinity; for (const b of sc.W.boxes) { if (!b.walk || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue; if (b.y1 > gy && b.y1 < 2000) gy = b.y1; } return gy; };
  const ok = (x, z) => { const y = groundAt(x, z); return Number.isFinite(y) && sc._spotOk({ x, z, y }) ? y : null; };
  L.tick = (n) => { for (let i = 0; i < n; i++) { const h = sim.hero; h.hp = h.hpMax ?? h.hp; g.tick(1 / 60); } };
  L.put = (x, y, z, dx, dz) => {
    const h = sim.hero; h.x = x; h.z = z; h.y = y; h.vx = 0; h.vz = 0; h.vy = 0; h.onGround = true; h.move = null; h.act = null; h.dashT = 0;
    const l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; if (h.facing !== undefined && Math.abs(dx) > 0.3) h.facing = dx > 0 ? 1 : -1; if (h.wishX !== undefined) { h.wishX = 0; h.wishZ = 0; }
    if (sc.heroA) { sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ; } if (h.safe) { h.safe.x = x; h.safe.y = y; h.safe.z = z; } h._px = x; h._py = y; h._pz = z; h._gy = y; sc.visY = sc.visYP = y; sc.cam.snap = true; sc._whipReset = true;
  };
  /** every standable spot: a lattice over each walk box (its edges included), exits, spawns, hot spots */
  L.lattice = (step) => {
    const A = sc.area.def ?? sc.area, P = [], seen = new Set();
    const add = (x, z, why) => { x = Math.round(x); z = Math.round(z); const y = ok(x, z); if (y == null) return; const k = Math.round(x / (step * 0.45)) + ':' + Math.round(z / (step * 0.45)) + ':' + Math.round(y / 40); if (seen.has(k)) return; seen.add(k); P.push({ x, y, z, why }); };
    for (const [n, s] of Object.entries(A.spawns ?? {})) add(s.x, s.z, 'spawn ' + n);
    for (const e of A.exits ?? []) { add((e.x0 + e.x1) / 2, (e.z0 + e.z1) / 2, 'exit ' + e.id); if (e.lockAt) add((e.lockAt.x0 + e.lockAt.x1) / 2, e.lockAt.z0 - 20, 'lock of ' + e.id); }
    for (const it of A.interact ?? []) add(it.x, it.z - 36, 'at ' + it.id);
    for (const b of sc.W.boxes) {
      if (!b.walk || b.y1 >= 2000 || b.brk !== undefined) continue;
      const w = b.x1 - b.x0, d = b.z1 - b.z0; if (w < 34 || d < 34) continue;
      const nx = Math.max(1, Math.ceil((w - 32) / step)), nz = Math.max(1, Math.ceil((d - 32) / step));
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) add(b.x0 + 16 + (w - 32) * i / nx, b.z0 + 16 + (d - 32) * j / nz, i === 0 || j === 0 || i === nx || j === nz ? 'edge' : 'floor');
    }
    return P;
  };
  // the coverage frame: no sky picture, no characters, no particles, no ground stickers or halos, magenta where nothing is drawn
  const MAG = [1, 0, 1], begin0 = sc.glr.begin;
  L.coverOn = () => { sc.glr.begin = function (vp, fog, clear, A) { return begin0.call(this, vp, fog, MAG, A); }; sc._sky = function () {}; sc._chars = function () { this.c3.drawn = 0; this.c3.culled = 0; }; sc._decals = function () {}; sc._glows = function () {}; if (sc.fx) { sc.fx.setPost(false); L.fxDraw = sc.fx.draw; sc.fx.draw = function () {}; } };
  L.shot = (S) => { const R = sc._sec?.cam; if (!R) return null; const keep = { pitch: R.pitch, dist: R.dist, lookY: R.lookY }; R.pitch = S.pitch; R.dist = S.dist; R.lookY = S.lookY; return () => { R.pitch = keep.pitch; R.dist = keep.dist; R.lookY = keep.lookY; }; };
  /** the camera at rest for the hero at this spot (a story shot bends the section rig as storyhost does) -> the frame is drawn */
  L.frame = (p, dx, dz, S) => {
    L.put(p.x, p.y, p.z, dx, dz); L.tick(1);
    const undo = S ? L.shot(S) : null; sc.cam.snap = true; L.tick(scan ? 1 : 10); g.alpha = 1; g.render(); if (undo) undo();
  };
  L.cover = (p, dx, dz, S) => {
    L.frame(p, dx, dz, S);
    const w = cv.width, h = cv.height, px = L.px && L.px.length === w * h * 4 ? L.px : (L.px = new Uint8Array(w * h * 4));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const c = sc.cam, e = sc.eye, fl = Math.hypot(c.fx, c.fz) || 1, q = sc.project(e[0] + c.fx / fl * 1e6, e[1], e[2] + c.fz / fl * 1e6, {});
    const hy = q.w > 1 ? q.y / g.viewH : (c.fy < 0 ? -1 : 2), hr = Math.max(0, Math.min(h, Math.round(hy * h)));   // horizon row from the top (rows below it look at the ground)
    let below = 0, above = 0, sx = 0, sy = 0;
    for (let y = 0; y < h; y++) { const row = (h - 1 - y) * w * 4, isB = y >= hr; for (let x = 0; x < w; x++) { const i = row + x * 4; if (px[i] === 255 && px[i + 1] === 0 && px[i + 2] === 255) { if (isB) { below++; sx += x; sy += y; } else above++; } } }
    const T = w * h;
    return { below: +(below / T * 100).toFixed(3), above: +(above / T * 100).toFixed(2), horizon: +hy.toFixed(3), cx: below ? +(sx / below / w).toFixed(2) : null, cy: below ? +(sy / below / h).toFixed(2) : null, lost: gl.isContextLost() };
  };
  L.info = () => { const st = v.stats || {}; return { draws: st.gl?.draws ?? null, tris: st.gl?.tris ?? null, worldTris: st.world?.tris ?? null, worldDraws: st.world?.draws ?? null, lost: gl.isContextLost() }; };
  return { ready: v.ready, area: v.area };
}

async function open(browser, area, tier, errs) {
  const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`[pageerror] ${area}: ${e.message} ${(e.stack ?? '').split('\n').slice(1, 3).join(' | ')}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`[console] ${area}: ${m.text().slice(0, 300)}`); });
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${area}&v2auto=0&v2tier=${tier}&v2story=0`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 }).catch(() => {});
  const st = await page.evaluate(() => ({ ready: window.__v2?.ready, error: String(window.__v2?.error ?? '') }));
  if (!st.ready) { await ctx.close(); throw new Error('scene not ready: ' + st.error); }
  if (FLAGS.length) {
    await page.evaluate((flags) => { const sc = window.__v2.scene; if (typeof sc.setWorldFlags === 'function') { const o = { ...(sc.worldFlags || {}) }; for (const f of flags) o[f] = true; sc.setWorldFlags(o); } }, FLAGS);
    await page.evaluate(async () => { const g = window.__game; g._pageHidden = true; for (let i = 0; i < 40; i++) { for (let k = 0; k < 6; k++) g.tick(1 / 60); g.render(); await new Promise((r) => setTimeout(r, 50)); if (!window.__v2.scene.xing && !window.__v2.scene._rebuilding) break; } });
  }
  return { ctx, page };
}

fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700), srv = args.root && args.root !== true ? await serveRoot(path.resolve(String(args.root)), port) : await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = [], report = {}; let code = 0;
try {
  for (const area of AREAS) {
    const R = (report[area] = { spots: 0, views: 0, flagged: 0, worst: 0, list: [], shots: [], stills: [] });
    try {
      // 1) the scan
      let { ctx, page } = await open(browser, area, 'low', errs);
      await page.evaluate(install, true);
      const P = await page.evaluate((step) => { window.__L.coverOn(); return window.__L.lattice(step); }, STEP);
      R.spots = P.length;
      const all = [];
      for (let i = 0; i < P.length; i += 12) {
        const part = await page.evaluate((ps) => { const L = window.__L, out = []; for (const p of ps) for (const f of [1, -1]) { const c = L.cover(p, f, 0, null); out.push({ ...p, f, ...c }); } return out; }, P.slice(i, i + 12));
        all.push(...part);
      }
      if (all.some((a) => a.lost)) { errs.push(`[tool] ${area}: context lost during the scan`); code = 1; }
      R.views = all.length;
      for (const [shot, x, z, dx, dz, what] of SHOT_AT[area] ?? []) {
        const c = await page.evaluate(([x, z, dx, dz, S]) => { const L = window.__L, sc = window.__v2.scene; let gy = -Infinity; for (const b of sc.W.boxes) { if (!b.walk || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue; if (b.y1 > gy && b.y1 < 2000) gy = b.y1; } if (!Number.isFinite(gy)) return null; return { y: gy, ...L.cover({ x, y: gy, z }, dx, dz, S) }; }, [x, z, dx, dz, SHOTS[shot]]);
        if (c) R.shots.push({ shot, what, x, z, dx, dz, ...c });
      }
      await ctx.close();
      all.sort((a, b) => b.below - a.below);
      R.flagged = all.filter((a) => a.below >= MIN).length; R.worst = all.length ? all[0].below : 0;
      R.mean = all.length ? +(all.reduce((s, a) => s + a.below, 0) / all.length).toFixed(3) : 0;
      const pick = [];
      for (const a of all) { if (a.below < MIN || pick.length >= Math.max(KEEP, 12)) break; if (pick.some((q) => Math.hypot(q.x - a.x, q.z - a.z) < 300 && Math.abs(q.y - a.y) < 60)) continue; pick.push(a); }
      R.list = pick.map((a) => ({ x: a.x, y: a.y, z: a.z, f: a.f, why: a.why, below: a.below, above: a.above, horizon: a.horizon, at: [a.cx, a.cy] }));
      console.log(`[${area}] ${R.spots} spots, ${R.views} views: ${R.flagged} with >= ${MIN} % empty below the horizon, worst ${R.worst} %, mean ${R.mean} %`);
      for (const a of R.list) console.log(`    (${a.x}, ${a.z}) y ${a.y} facing ${a.f > 0 ? '+x' : '-x'} [${a.why}]: ${a.below} % (centre of the empty part at ${a.at.join(', ')} of the picture; horizon at ${a.horizon})`);
      for (const s of R.shots) console.log(`    shot ${s.shot} (${s.what}) at (${s.x}, ${s.z}): ${s.below} % below the horizon, ${s.above} % above (horizon at ${s.horizon})`);
      // 2) the stills, as the player sees them
      if (STILLS && (R.list.length || R.shots.length)) {
        ({ ctx, page } = await open(browser, area, 'mid', errs));
        await page.evaluate(install, false);
        const ext = PNG ? 'png' : 'jpg', snap = async (file) => { await page.screenshot(PNG ? { path: file } : { path: file, type: 'jpeg', quality: 88 }); };
        let n = 0;
        for (const a of R.list.slice(0, KEEP)) {
          const info = await page.evaluate(([a]) => { const L = window.__L; L.frame(a, a.f, 0, null); return L.info(); }, [a]);
          const file = `${OUT}/${TAG}_${area}_${String(++n).padStart(2, '0')}_${a.x}_${a.z}_${a.f > 0 ? 'r' : 'l'}.${ext}`; await snap(file);
          R.stills.push({ file, x: a.x, z: a.z, f: a.f, below: a.below, ...info });
        }
        for (const s of R.shots) {
          const info = await page.evaluate(([s, S]) => { const L = window.__L; L.frame(s, s.dx, s.dz, S); return L.info(); }, [s, SHOTS[s.shot]]);
          const file = `${OUT}/${TAG}_${area}_shot_${s.shot}.${ext}`; await snap(file);
          R.stills.push({ file, shot: s.shot, x: s.x, z: s.z, below: s.below, ...info });
        }
        await ctx.close();
      }
    } catch (e) { errs.push(`[tool] ${area}: ${e.stack || e.message}`); code = 1; }
  }
} finally { await browser.close(); srv.close?.(); }
console.log('\narea             spots  views  flagged   worst %   mean %   shots (% below the horizon)');
for (const [a, R] of Object.entries(report)) console.log(`${a.padEnd(16)} ${String(R.spots).padStart(5)} ${String(R.views).padStart(6)} ${String(R.flagged).padStart(8)} ${String(R.worst).padStart(9)} ${String(R.mean ?? 0).padStart(8)}   ${R.shots.map((s) => `${s.shot} ${s.below}`).join(' · ')}`);
fs.writeFileSync(`${OUT}/look_edge_${TAG}.json`, JSON.stringify({ tag: TAG, device: DEV, step: STEP, min: MIN, report }, null, 1));
if (errs.length) { console.log('ERRORS:'); for (const e of errs.slice(0, 20)) console.log('  ' + e); if (errs.some((e) => e.startsWith('[pageerror]') || e.startsWith('[tool]'))) code = 1; }
console.log(code ? 'FAIL' : 'OK');
process.exit(code);
