// Network profiles and a byte counter (platform.md §1.4, §9; MASTER_PLAN §5.2 load budgets).
//
//   await emulateNetwork(s.cdp, 'slow4g');       // CDP Network.emulateNetworkConditions + cache disabled
//   const meter = netMeter(s.cdp);  …  meter.summary() → {requests, bytes, byType, firstJs, lastModuleAt, …}

export const NETWORKS = {
  slow4g: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 },
  fast4g: { latency: 40, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 },
  wifi: { latency: 10, downloadThroughput: 50e6 / 8, uploadThroughput: 20e6 / 8 },
};

/** Load budgets (ms): first frame. Only enforced against dist/web (brotli), platform §11 WP-8 acceptance 3. */
export const LOAD_BUDGET_MS = { slow4g: 9000, fast4g: 2500 };

export async function emulateNetwork(cdp, name, { cache = false } = {}) {
  const n = NETWORKS[name];
  if (!n) throw new Error(`unknown network '${name}'`);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: !cache });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...n });
}
export async function setOffline(cdp, offline = true) {
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}

/** Counts requests and encoded bytes per extension; tracks when each module was requested (for the waterfall depth). */
export function netMeter(cdp) {
  const t0 = Date.now();
  const reqs = new Map();
  const m = { requests: 0, bytes: 0, byType: {}, modules: [], html: null };
  cdp.on('Network.requestWillBeSent', (e) => {
    const u = e.request.url.split('?')[0];
    reqs.set(e.requestId, { u, t: Date.now() - t0 });
    if (/\/src\/.*\.js$/.test(u)) m.modules.push({ u, t: Date.now() - t0 });
    if (m.html === null && /\.html$|\/$/.test(u)) m.html = Date.now() - t0;
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId); if (!r) return;
    m.requests++; m.bytes += e.encodedDataLength;
    const ext = (r.u.match(/\.(\w+)$/) || [, 'other'])[1];
    m.byType[ext] = (m.byType[ext] || 0) + e.encodedDataLength;
  });
  return {
    raw: m,
    summary() {
      const mods = m.modules.map((x) => x.t).sort((a, b) => a - b);
      return {
        requests: m.requests, bytes: m.bytes, mb: +(m.bytes / 1048576).toFixed(2),
        byTypeKB: Object.fromEntries(Object.entries(m.byType).map(([k, v]) => [k, Math.round(v / 1024)])),
        modules: mods.length, firstModuleMs: mods[0] ?? null, lastModuleMs: mods[mods.length - 1] ?? null, htmlMs: m.html,
      };
    },
  };
}
