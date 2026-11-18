// CROSSING lane: how a bell crossing runs in real time (headless, the page's own frame loop — no fast-forward).
//   node tools/v2/cross_measure.mjs [--root <tree>] [--res 0.5] [--device fold_open] [--tier mid] [--plan eshville_now:12,graveyard_now:6,ossuary_now:6] [--out file.json] [--years]
// For every crossing: total time (cross() -> the hero can move again), the time the picture of the old night was gone until the new one was
// live ("load"), frames drawn in that window, the longest gap between two frames in it and the longest main-thread task (longtask observer).
// --root serves another copy of the tree (the commit this lane started from) with the same tool: before / after numbers come from one script.
// Works on both: the old crossing (veil) is recognised by scene.cx being absent.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(String(args.root || path.join(HERE, '..', '..'))), RES = Number(args.res ?? 0.5), DEV = String(args.device || 'fold_open'), TIER = String(args.tier || '');
const PLAN = String(args.plan || 'eshville_now:12,graveyard_now:6,ossuary_now:6').split(',').map((s) => { const [id, n] = s.split(':'); return { id, n: Number(n || 6) }; });
const OUT = args.out ? String(args.out) : '', YEARS = !!args.years, POST = args.post ? '&v2post=1' : '';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.m4a': 'audio/mp4', '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  const f = path.join(ROOT, u); if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); });
});
const port = 8900 + Math.floor(Math.random() * 600);
await new Promise((r) => srv.listen(port, r));
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const errs = [], rows = [];
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
try {
  const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 300)));
  for (const { id, n } of PLAN) {
    await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&area=${id}${RES < 1 ? '&v2res=' + RES : ''}${TIER ? '&v2tier=' + TIER : ''}${POST}`);
    await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const v = window.__v2, sc = v.scene, h = sc.sim.hero, S = sc.people.spots.filter((q) => q.def.kind === 'bell');
      // stand in front of a bell when the area has one (towards the camera side of it), on a floor
      let at = null;
      for (const q of S) { for (const [dx, dz] of [[0, -70], [-70, 0], [70, 0], [0, 70], [0, -110]]) { const p = { x: q.x + dx, z: q.z + dz, y: q.y }; if (sc._spotOk(p)) { at = p; break; } } if (at) break; }
      if (at) { h.x = at.x; h.z = at.z; h.y = at.y; h.vx = h.vz = h.vy = 0; if (h.safe) { h.safe.x = h.x; h.safe.z = h.z; h.safe.y = h.y; } sc.cam.snap = true; }
      window.__cm = { frames: [], long: [] };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cm.long.push([e.startTime, e.duration]); }).observe({ entryTypes: ['longtask'] }); } catch { /* no longtask */ }
      const loop = (t) => { const F = window.__cm.frames; F.push(t); if (F.length > 6000) F.splice(0, 3000); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
      return { area: v.area, bell: at ? [Math.round(at.x), Math.round(at.z)] : null, canvas: v.stats.gl.canvas, tier: v.stats.fx?.tier ?? null, post: v.stats.fx?.post ?? null, staged: !!sc.cx, renderer: v.stats.gl.renderer };
    });
    console.log(`  ${id}: ${JSON.stringify(info)}`);
    await page.waitForTimeout(800);
    for (let i = 0; i < n; i++) {
      const r = await page.evaluate(async (years) => {
        const v = window.__v2, sc = v.scene, cm = window.__cm, raf = () => new Promise((res) => requestAnimationFrame(res));
        cm.frames.length = 0; cm.long.length = 0;
        const from = v.area, t0 = performance.now();
        const ok = sc.cross(years ? { years: true } : null);
        if (!ok) return { ok: false, from };
        let tGone = 0, tLive = 0, tEnd = 0, guard = 0;
        while (guard++ < 3000) {
          await raf();
          const now = performance.now();
          if (!tGone && !sc.ready) tGone = now;
          if (tGone && !tLive && sc.ready) tLive = now;
          if (!sc.xing && sc.ready && !sc._go && (tLive || now - t0 > 400)) { tEnd = now; break; }
        }
        // the old veil kept thinning after the hero was free: wait it out so the next crossing starts clean
        let w = 0; while (w++ < 240 && ((sc.fadeA ?? 0) > 0.01 || sc.cx?.on || performance.now() - tEnd < 900)) await raf();
        const F = cm.frames.filter((t) => t >= tGone && t <= tLive); let gap = 0; for (let k = 1; k < F.length; k++) gap = Math.max(gap, F[k] - F[k - 1]);
        if (F.length) { gap = Math.max(gap, F[0] - tGone, tLive - F[F.length - 1]); } else gap = tLive - tGone;
        const all = cm.frames.filter((t) => t >= t0 && t <= tEnd); let gapAll = 0; for (let k = 1; k < all.length; k++) gapAll = Math.max(gapAll, all[k] - all[k - 1]);
        const LT = cm.long.filter(([s, d]) => s + d >= t0 && s <= tEnd), ltLoad = cm.long.filter(([s, d]) => s + d >= tGone && s <= tLive);
        const log = sc.cx ? { ...sc.cx.log } : null;
        const fpsIn = (a, b) => (b > a ? +(cm.frames.filter((t) => t >= a && t <= b).length / ((b - a) / 1000)).toFixed(1) : 0);
        const fps = log ? { ring: fpsIn(log.begin, log.freeze), load: fpsIn(log.freeze, log.loaded), hold: fpsIn(log.loaded, log.reveal), reveal: fpsIn(log.reveal, log.land), after: fpsIn(log.land, log.land + 800) } : { veilUp: fpsIn(t0, tGone), load: fpsIn(tGone, tLive), veilDown: fpsIn(tLive, tLive + 800) };
        return { ok: true, from, to: v.area, total: tEnd - t0, toGone: tGone - t0, load: tLive - tGone, frames: F.length, fps: F.length / Math.max(0.001, (tLive - tGone) / 1000), gap, gapAll, long: LT.length ? Math.max(...LT.map((q) => q[1])) : 0, longLoad: ltLoad.length ? Math.max(...ltLoad.map((q) => q[1])) : 0, longN: LT.length,
          fpsBy: fps, loadMs: v.stats.loadMs, heap: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1024), cxBytes: sc.cx?.bytes ?? 0,
          phases: log ? { answer: Math.round(log.answer - log.begin), toll: Math.round(log.toll - log.begin), freeze: Math.round(log.freeze - log.begin), loaded: Math.round(log.loaded - log.begin), reveal: Math.round(log.reveal - log.begin), land: Math.round(log.land - log.begin), passFrames: log.frames, passGap: Math.round(log.gap), yields: log.yields, steps: Array.from(sc.cx.prof ?? []).map((t, i, A) => (i && t ? Math.round(t - (A.slice(0, i).reverse().find((q) => q > 0) ?? t)) : 0)).join(' ') } : null };
      }, YEARS);
      r.area = id; r.i = i; rows.push(r);
      console.log(`    #${i + 1} ${r.from} -> ${r.to ?? '?'}: total ${(r.total / 1000).toFixed(2)} s, load ${Math.round(r.load)} ms (engine ${r.loadMs} ms), frames ${r.frames} (${r.fps?.toFixed(0)}/s), longest gap ${Math.round(r.gap)} ms, longest task ${Math.round(r.longLoad)} ms${r.phases ? ' | ' + JSON.stringify(r.phases) : ''} | fps ${JSON.stringify(r.fpsBy)}`);
      await page.waitForTimeout(500);
    }
  }
  await ctx.close();
} catch (e) { errs.push('tool error: ' + String(e?.stack ?? e)); console.log(String(e?.stack ?? e)); }
await browser.close(); srv.close();
const sum = {};
for (const { id } of PLAN) {
  const R = rows.filter((r) => r.area === id && r.ok);
  if (!R.length) continue;
  sum[id] = { n: R.length, totalMed: +(med(R.map((r) => r.total)) / 1000).toFixed(2), totalMax: +(Math.max(...R.map((r) => r.total)) / 1000).toFixed(2), loadMed: Math.round(med(R.map((r) => r.load))), loadMax: Math.round(Math.max(...R.map((r) => r.load))),
    framesMed: med(R.map((r) => r.frames)), fpsMin: +Math.min(...R.map((r) => r.fps)).toFixed(1), fpsMed: +med(R.map((r) => r.fps)).toFixed(1), gapMed: Math.round(med(R.map((r) => r.gap))), gapMax: Math.round(Math.max(...R.map((r) => r.gap))), taskMed: Math.round(med(R.map((r) => r.longLoad))), taskMax: Math.round(Math.max(...R.map((r) => r.longLoad))) };
  console.log(`  == ${id}: ${JSON.stringify(sum[id])}`);
}
const all = rows.filter((r) => r.ok);
if (all.length) console.log(`  == all ${all.length}: total median ${(med(all.map((r) => r.total)) / 1000).toFixed(2)} s, longest ${(Math.max(...all.map((r) => r.total)) / 1000).toFixed(2)} s; load median ${Math.round(med(all.map((r) => r.load)))} ms; longest frame gap in a load ${Math.round(Math.max(...all.map((r) => r.gap)))} ms; longest task ${Math.round(Math.max(...all.map((r) => r.longLoad)))} ms; fewest frames/s in a load ${Math.min(...all.map((r) => r.fps)).toFixed(1)}`);
console.log(`  page errors: ${errs.length}`); for (const e of errs.slice(0, 8)) console.log('    ' + e);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ root: ROOT, res: RES, device: DEV, tier: TIER, when: new Date().toISOString(), sum, rows, errs }, null, 1));
process.exit(errs.length || rows.some((r) => !r.ok) ? 1 : 0);
