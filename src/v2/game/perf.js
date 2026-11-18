// v2g perf settings — reads localStorage['bn.v2.perf'] written by the bench scene (docs/v2/PERF_NOTES.md) + address options.
// The render size itself is chosen in res.js (device pixel ratio, tier caps, automatic step-down); resK here is the saved factor on top.
export function readPerf() {
  const o = { resK: 1, everyFrame: true, post: false, tier: 'mid', debug: false, texCap: 1024, saved: false, hz: 0, ui: null, auto: true, area: null, spawn: null };
  try { const u = globalThis.localStorage?.getItem('bn.v2.ui'); if (u === '1') o.ui = true; else if (u === '0') o.ui = false; } catch { /* private mode */ }
  let P = null; try { P = JSON.parse(globalThis.localStorage?.getItem('bn.v2.perf') ?? 'null'); } catch { P = null; }
  if (P && P.v === 1) {
    o.saved = true;
    if (P.resK === 1 || P.resK === 0.75 || P.resK === 0.5) o.resK = P.resK;
    o.everyFrame = P.cap !== 60;
    if (typeof P.hz === 'number') o.hz = P.hz;
    if (P.post === true) o.post = true;
    if (P.tier === 'low' || P.tier === 'mid' || P.tier === 'high') o.tier = P.tier;
  }
  let Q = null; try { Q = new URLSearchParams(globalThis.location?.search ?? ''); } catch { Q = null; }
  if (Q) {
    const r = Number(Q.get('v2res')); if (r >= 0.4 && r <= 1) o.resK = r;
    const c = Q.get('v2cap'); if (c === '60') o.everyFrame = false; else if (c === '0') o.everyFrame = true;
    const p = Q.get('v2post'); if (p === '1') o.post = true; else if (p === '0') o.post = false;
    const t = Q.get('v2tier'); if (t === 'low' || t === 'mid' || t === 'high') o.tier = t;
    if (Q.get('v2dbg') === '1') o.debug = true;
    const x = Number(Q.get('v2tex')); if (x >= 256 && x <= 2048) o.texCap = x;
    const u = Q.get('v2ui'); if (u === '1') o.ui = true; else if (u === '0') o.ui = false;
    if (Q.get('v2auto') === '0') o.auto = false;   // keep the render size fixed (captures, measurements)
    const a = Q.get('area'); if (a && /^[a-z0-9_]+$/.test(a)) o.area = a;
    const sp = Q.get('spawn'); if (sp && /^[a-z0-9_]+$/.test(sp)) o.spawn = sp;
  }
  return o;
}
