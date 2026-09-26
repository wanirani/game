// Cold-load suite — platform.md §1.4, §6.7, §9.1, §11 WP-8 acceptance 3 (P-09); MASTER_PLAN §5.2 load budgets.
// Measures index.html → first frame (boot screen gone, game running) and → title background ready, on phone1 emulation
// with the cache disabled, per network profile; counts requests/bytes and how spread out the module requests are.
//
//   node tools/qa/platform_load.mjs              # the repo tree (tools/serve.mjs, no compression): fast4g + wifi, metrics;
//                                                # budgets pending until DELIVERY-WEB lands, skipped once dist/web exists
//   node tools/qa/platform_load.mjs --dist       # dist/web (tools/deploy/serve_dist.mjs start() if it exports one,
//                                                # else a brotli static server): slow4g + fast4g + wifi, budgets enforced
//   [--net slow4g,fast4g,wifi] [--dir <build dir> (with --dist)] [--strict]
// Budgets: first frame slow 4G ≤ 9 s, fast 4G ≤ 2.5 s; all modules requested within 2 RTT (+ 250 ms parse slack) of the first.
// Report: /tmp/claude-0/qa/platform/platform_load.json (platform_load_dist.json with --dist)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Suite, parseArgs, fmt } from './lib/suite.mjs';
import { openEnv, startStatic, ROOT } from './lib/server.mjs';
import { NETWORKS, LOAD_BUDGET_MS, emulateNetwork, netMeter } from './lib/net.mjs';

const args = parseArgs();
if (args.dist) args.tag = 'dist';
const suite = new Suite('platform_load', args);
const nets = args.net ? String(args.net).split(',') : args.dist ? ['slow4g', 'fast4g', 'wifi'] : ['fast4g', 'wifi'];
// The budgets are defined for the delivered build (brotli + modulepreload). Against the raw repo tree they are pending
// until DELIVERY-WEB lands (or red with --strict when no build exists); once dist/web exists they are skipped here
// and measured by --dist instead, so a repo-tree run never goes red on a budget it cannot meet by design.
const distBuilt = fs.existsSync(path.join(ROOT, 'dist/web/index.html'));
const repoSkip = !args.dist && distBuilt ? 'budgets apply to dist/web: run platform_load.mjs --dist' : null;

let server = null, env = null;
try {
  await suite.group('load', async () => {
    if (args.dist) {
      const dir = path.resolve(ROOT, typeof args.dir === 'string' ? args.dir : 'dist/web'); // --dir: serve another build directory
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
    env = await openEnv({ server });
    for (const net of nets) {
      const s = await env.page('phone1', null, { wait: false, sw: true }); // the real page, service worker included
      await emulateNetwork(s.cdp, net);
      const meter = netMeter(s.cdp);
      const t0 = Date.now();
      await s.goto('index.html', { wait: false, timeout: 180000 });
      await s.page.waitForFunction(() => window.__game?.scenes?.length && !document.getElementById('boot'), null, { timeout: 180000, polling: 100 });
      const firstFrame = Date.now() - t0;
      await s.page.waitForFunction(() => window.__game?.assets?.has?.('bg/title'), null, { timeout: 180000, polling: 100 }).catch(() => {});
      const bg = Date.now() - t0;
      await s.wait(500);
      const m = meter.summary();
      const rtt = NETWORKS[net].latency;
      const spread = m.lastModuleMs !== null ? m.lastModuleMs - m.firstModuleMs : null;
      const metrics = { net, firstFrameMs: firstFrame, titleBgMs: bg, ...m, moduleSpreadMs: spread, source: args.dist ? 'dist/web' : 'repo' };
      const budget = LOAD_BUDGET_MS[net];
      await suite.check({ id: `load.${net}`, group: 'load', issue: 'P-09', gate: 'DELIVERY-WEB', title: budget ? `${net}: first frame ≤ ${budget / 1000} s (${metrics.source})` : `${net}: cold load (metrics)` }, async () => (
        budget && repoSkip ? { skip: `${repoSkip} (repo tree: first frame ${(firstFrame / 1000).toFixed(1)} s, ${m.requests} requests, ${m.mb} MB)`, metrics }
          : budget ? { pass: firstFrame <= budget, detail: `first frame ${(firstFrame / 1000).toFixed(1)} s, title bg ${(bg / 1000).toFixed(1)} s, ${m.requests} requests, ${m.mb} MB, ${m.modules} modules requested over ${spread} ms`, metrics }
          : { pass: true, detail: `first frame ${(firstFrame / 1000).toFixed(1)} s, title bg ${(bg / 1000).toFixed(1)} s, ${m.requests} requests, ${m.mb} MB, ${m.modules} modules over ${spread} ms`, metrics }));
      if (net !== 'wifi') {
        await suite.check({ id: `load.${net}.preload`, group: 'load', issue: 'P-09', gate: 'DELIVERY-WEB', title: `${net}: every module requested within 2 RTT of the first (modulepreload)` }, async () => (repoSkip ? { skip: `${repoSkip} (repo tree: modules spread over ${spread} ms)` } : { pass: spread !== null && spread <= 2 * rtt + 250, detail: `module requests spread over ${spread} ms (2 RTT = ${2 * rtt} ms)` }));
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
