// Cold-load suite — platform.md §1.4, §6.7, §9.1, §11 WP-8 acceptance 3 (P-09); MASTER_PLAN §5.2 load budgets.
// Measures index.html → first frame (boot screen gone, game running) and → title background ready, on phone1 emulation
// with the cache disabled, per network profile; counts requests/bytes, the bytes on the first-screen critical path and
// how spread out the up-front script requests are.
//
//   node tools/qa/platform_load.mjs              # the repo tree (tools/serve.mjs, no compression): fast4g + wifi, metrics;
//                                                # budgets pending until DELIVERY-WEB lands, skipped once dist/web exists
//   node tools/qa/platform_load.mjs --dist       # dist/web (tools/deploy/serve_dist.mjs start() if it exports one,
//                                                # else a brotli static server): slow4g + fast4g + wifi, budgets enforced
//   [--net slow4g,fast4g,wifi] [--dir <build dir> (with --dist)] [--strict]
// Budgets (hard checks): first frame slow 4G ≤ 9 s, fast 4G ≤ 2.5 s; critical path ≤ 1.6 MB as served (brotli with --dist;
// = build_web.mjs BUDGET.criticalBr); the up-front scripts requested within 2 RTT (+ 250 ms parse slack) of the first.
// Two-phase boot (R1-REQ-229): src/main.js loads only core + scenes/title.js up front and dynamic-imports every other scene
// after the title's first frames (game.lazyScenes / game.loadScenes). So the phases are split at the moment the title scene
// is active (main.js publishes window.__game right after game.go('title'); an init script stamps performance.now() then):
//   up front  = the <script src> / <link rel=modulepreload> URLs of index.html (build-info.js, boot-gate.js, the main
//               chunk) + any module requested before the title was active → the preload spread check
//   critical  = index.html + every request started before the title was active (css, fonts, scripts, bg/title, icon)
//   lazy      = module requests started after that (lazy chunks, dev-tree scene modules) → metrics only, never pass/fail
// Report: /tmp/claude-0/qa/platform/platform_load.json (platform_load_dist.json with --dist)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Suite, parseArgs } from './lib/suite.mjs';
import { openEnv, startStatic, ROOT } from './lib/server.mjs';
import { NETWORKS, LOAD_BUDGET_MS, emulateNetwork, netMeter } from './lib/net.mjs';

const MB = 1048576;
const CRITICAL_BUDGET = 1.6 * MB; // tools/deploy/build_web.mjs BUDGET.criticalBr (platform §9.1)

const args = parseArgs();
if (args.dist) args.tag = 'dist';
const suite = new Suite('platform_load', args);
const nets = args.net ? String(args.net).split(',') : args.dist ? ['slow4g', 'fast4g', 'wifi'] : ['fast4g', 'wifi'];
// The budgets are defined for the delivered build (brotli + modulepreload). Against the raw repo tree they are pending
// until DELIVERY-WEB lands (or red with --strict when no build exists); once dist/web exists they are skipped here
// and measured by --dist instead, so a repo-tree run never goes red on a budget it cannot meet by design.
const distBuilt = fs.existsSync(path.join(ROOT, 'dist/web/index.html'));
const repoSkip = !args.dist && distBuilt ? 'budgets apply to dist/web: run platform_load.mjs --dist' : null;

/** Stamps performance.now() when main.js publishes window.__game (right after game.go('title')): the title is active. */
function titleMarkInit() {
  try { performance.setResourceTimingBufferSize(4000); } catch { /* old engine */ } // the clock calibration reads it
  let g;
  Object.defineProperty(window, '__game', {
    configurable: true, enumerable: true,
    get() { return g; },
    set(v) { g = v; if (window.__qaTitleAt == null && v) window.__qaTitleAt = performance.now(); },
  });
}

/** Paths (no query) of the scripts index.html asks for up front: <script src> and <link rel=modulepreload href>. */
function upFrontScripts(html) {
  const out = new Set();
  const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, 'i')) || [])[1];
  for (const m of html.matchAll(/<script\b[^>]*>/gi)) { const u = attr(m[0], 'src'); if (u) out.add(u); }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) if (/\srel\s*=\s*["']?modulepreload/i.test(m[0])) { const u = attr(m[0], 'href'); if (u) out.add(u); }
  return [...out].map((u) => new URL(u, 'http://x/').pathname);
}

/**
 * Every http(s) request of a page as CDP sees it: url, path, wall-clock issue time (ms), encoded bytes once finished,
 * sw = answered by the service worker (its network bytes are not visible to the page: counted as 0 here).
 */
function requestLog(cdp) {
  const byId = new Map();
  cdp.on('Network.requestWillBeSent', (e) => {
    if (!/^https?:/.test(e.request.url) || byId.has(e.requestId)) return; // a redirect reuses the id: keep the first
    let p = e.request.url;
    try { p = new URL(p).pathname; } catch { /* keep */ }
    byId.set(e.requestId, { u: e.request.url, p, wall: e.wallTime * 1000, bytes: 0, done: false, sw: false });
  });
  cdp.on('Network.responseReceived', (e) => { const r = byId.get(e.requestId); if (r && e.response.fromServiceWorker) r.sw = true; });
  cdp.on('Network.loadingFinished', (e) => { const r = byId.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.done = true; } });
  return () => [...byId.values()];
}

const ms = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)} ms`);
const sec = (v) => `${(v / 1000).toFixed(1)} s`;
const shortName = (p) => p.replace(/^\/src\/bundle\/[^/]+\//, '').replace(/^\//, '');

let server = null, env = null;
try {
  await suite.group('load', async () => {
    let dir = ROOT;
    if (args.dist) {
      dir = path.resolve(ROOT, typeof args.dir === 'string' ? args.dir : 'dist/web'); // --dir: serve another build directory
      if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error('dist/web/index.html missing — run node tools/deploy/build_web.mjs first');
      const sd = path.join(ROOT, 'tools/deploy/serve_dist.mjs');
      let mod = null;
      if (fs.existsSync(sd)) { try { mod = await import(pathToFileURL(sd).href); } catch { mod = null; } }
      if (typeof mod?.start === 'function') {
        const r = await mod.start(0, { dir, quiet: true });
        const port = r?.port ?? r?.address?.()?.port;
        server = { origin: `http://localhost:${port}`, port, close: async () => { try { await (r.close?.() ?? r.server?.close?.()); } catch { /* closed */ } } };
      } else server = await startStatic(dir, { brotli: true });
    }
    const upFront = upFrontScripts(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'));
    env = await openEnv({ server });
    for (const net of nets) {
      const s = await env.page('phone1', null, { wait: false, sw: true, initScripts: [titleMarkInit] }); // the real page, service worker included
      await emulateNetwork(s.cdp, net);
      const meter = netMeter(s.cdp);
      const log = requestLog(s.cdp);
      const t0 = Date.now();
      await s.goto('index.html', { wait: false, timeout: 180000 });
      await s.page.waitForFunction(() => window.__game?.scenes?.length && !document.getElementById('boot'), null, { timeout: 180000, polling: 100 });
      const firstFrame = Date.now() - t0;
      await s.page.waitForFunction(() => window.__game?.assets?.has?.('bg/title'), null, { timeout: 180000, polling: 100 }).catch(() => {});
      const bg = Date.now() - t0;
      await s.wait(500);
      // the lazy scene graph (R1-REQ-229): wait for it so its chunks show up in the metrics (never pass/fail)
      const ready = await s.page.waitForFunction(() => window.__game?.scenesReady === true, null, { timeout: 60000, polling: 100 }).then(() => Date.now() - t0, () => null);
      const m = meter.summary();
      // CDP stamps requests with the browser's wall clock, the title stamp is page time: map CDP → page time with the
      // median offset over the requests Resource Timing also lists (it only lists finished ones; CDP also sees in-flight)
      const tl = await s.page.evaluate(() => ({
        origin: performance.timeOrigin, titleAt: window.__qaTitleAt ?? null,
        res: performance.getEntriesByType('resource').map((e) => [e.name, e.startTime]),
      }));
      const reqs = log();
      const offs = [];
      for (const [u, t] of tl.res) { const r = reqs.find((x) => x.u === u); if (r) offs.push(r.wall - tl.origin - t); }
      offs.sort((a, b) => a - b);
      const off = offs.length ? offs[offs.length >> 1] : 0;
      for (const r of reqs) r.t = r.wall - tl.origin - off;
      const rtt = NETWORKS[net].latency;
      const titleAt = tl.titleAt;
      const early = (r) => titleAt !== null && r.t < titleAt;
      const srcJs = (r) => /^\/src\/.*\.js$/.test(r.p);
      const front = reqs.filter((r) => upFront.includes(r.p) || (srcJs(r) && early(r)));
      const lazy = reqs.filter((r) => srcJs(r) && !front.includes(r));
      const frontT = front.map((r) => r.t).sort((a, b) => a - b);
      const spread = frontT.length ? frontT[frontT.length - 1] - frontT[0] : null;
      const missing = upFront.filter((p) => !front.some((r) => r.p === p));
      const critList = titleAt === null ? [] : reqs.filter(early);
      const critBytes = titleAt === null ? null : critList.reduce((a, r) => a + r.bytes, 0);
      const swN = (list) => { const n = list.filter((r) => r.sw).length; return n ? ` + ${n} from the service worker` : ''; };
      const since = (t) => `+${sec(t - (titleAt ?? 0))}`;
      const lazyT = lazy.map((r) => r.t).sort((a, b) => a - b);
      const lazyInfo = lazy.length
        ? `${lazy.length} lazy module request(s) ${since(lazyT[0])} … ${since(lazyT[lazyT.length - 1])} after the title was active, ${Math.round(lazy.reduce((a, r) => a + r.bytes, 0) / 1024)} KB${swN(lazy)} (metrics only)`
        : 'no lazy module request';
      const metrics = {
        net, firstFrameMs: firstFrame, titleBgMs: bg, scenesReadyMs: ready, ...m, source: args.dist ? 'dist/web' : 'repo',
        titleActiveMs: titleAt === null ? null : Math.round(titleAt), clockOffsetMs: +off.toFixed(1), clockSamples: offs.length,
        upFront: front.map((r) => ({ u: shortName(r.p), t: Math.round(r.t) })), upFrontSpreadMs: spread === null ? null : Math.round(spread),
        lazyModules: lazy.map((r) => ({ u: shortName(r.p), t: Math.round(r.t), afterTitleMs: titleAt === null ? null : Math.round(r.t - titleAt), kb: Math.round(r.bytes / 1024), done: r.done, sw: r.sw })),
        criticalBytes: critBytes, criticalMB: critBytes === null ? null : +(critBytes / MB).toFixed(2), criticalRequests: critList.length,
        criticalTop: [...critList].sort((a, b) => b.bytes - a.bytes).slice(0, 6).map((r) => [shortName(r.p), Math.round(r.bytes / 1024)]),
      };
      const critTxt = critBytes === null ? 'critical path n/a (title stamp missing)' : `critical path ${metrics.criticalMB} MB in ${metrics.criticalRequests} requests${swN(critList)}`;
      const budget = LOAD_BUDGET_MS[net];
      const base = `first frame ${sec(firstFrame)}, title bg ${sec(bg)}, ${critTxt}, scenes ready ${ready === null ? 'timed out' : sec(ready)}, ${m.requests} requests / ${m.mb} MB by then`;
      await suite.check({ id: `load.${net}`, group: 'load', issue: 'P-09', gate: 'DELIVERY-WEB', title: budget ? `${net}: first frame ≤ ${budget / 1000} s (${metrics.source})` : `${net}: cold load (metrics)` }, async () => (
        budget && repoSkip ? { skip: `${repoSkip} (repo tree: ${base})`, metrics }
          : budget ? { pass: firstFrame <= budget, detail: `${base}; ${lazyInfo}`, metrics }
          : { pass: true, detail: `${base}; ${lazyInfo}`, metrics }));
      if (net !== 'wifi') {
        await suite.check({ id: `load.${net}.critical`, group: 'load', issue: 'P-09', gate: 'DELIVERY-WEB', title: `${net}: first-screen critical path ≤ ${CRITICAL_BUDGET / MB} MB (requests before the title is active)` }, async () => (
          repoSkip ? { skip: `${repoSkip} (repo tree: ${critTxt}, uncompressed)` }
            : critBytes === null ? (() => { throw new Error('the title-active stamp (window.__game setter) never fired'); })()
            : { pass: critBytes <= CRITICAL_BUDGET, detail: `${critTxt} (budget ${CRITICAL_BUDGET / MB} MB; largest ${metrics.criticalTop.map(([u, kb]) => `${u} ${kb} KB`).join(', ')})` }));
        await suite.check({ id: `load.${net}.preload`, group: 'load', issue: 'P-09', gate: 'DELIVERY-WEB', title: `${net}: up-front scripts requested within 2 RTT of the first (modulepreload; lazy chunks excluded)` }, async () => {
          const what = `${front.map((r) => shortName(r.p)).join(', ') || 'none'} over ${ms(spread)} (2 RTT = ${2 * rtt} ms)`;
          if (repoSkip) return { skip: `${repoSkip} (repo tree: ${front.length} up-front modules over ${ms(spread)}; ${lazyInfo})` };
          if (missing.length) return { pass: false, detail: `index.html scripts never requested: ${missing.join(', ')}; ${what}` };
          return { pass: spread !== null && spread <= 2 * rtt + 250, detail: `${what}; ${lazyInfo}` };
        });
      }
      await suite.errors({ id: `load.${net}.errors`, group: 'load' }, s);
      await s.close();
    }
  }, { closeSessions: async () => env?.closeSessions() });
} catch (e) {
  await suite.check({ id: 'harness', group: 'harness', title: 'suite ran to completion' }, async () => { throw e; });
} finally {
  await env?.close();
  if (server) await server.close();
}
process.exit(await suite.finish());
