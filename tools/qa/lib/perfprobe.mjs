// In-page render probe for the perf/soak tools: counts per rendered frame what MASTER_PLAN §5.2 / feel §8 budget.
//
//   env.page(vp, url, { initScripts: [perfProbeInit()] })
//   page.evaluate(() => window.__perf …)      (see the API below; everything runs in the page)
//
// window.__perf
//   armed            canvases created while armed are recorded with their call site (after stage start = a budget miss)
//   on               counting is active (set around one game.render() by measureFrames)
//   f                per-frame counters: grad (linear/radial/conic), pat, canv, draw (drawImage/fill/stroke/…Rect/…Text on any
//                    context), mainDraw (on the game canvas), full (full-screen fills/blits on the game canvas), comp (draws
//                    under a non source-over composite), special (saturation/difference/… blends), rng (Math.random), fx (fx
//                    spawns while rendering), ms (real render time)
//   sites            { grad: Map(site → n), canv: Map, rng: Map, fx: Map } call sites (file:line) while counting / armed
//   live()           live canvases created since load (WeakRef) → { n, bytes }
// Math.random is replaced by a seeded PRNG for the whole page (reproducible counts; window.__perfSeed(n) reseeds).
// A context method is counted only while __perf.on or __perf.armed (canvas creation), so gameplay outside the measured
// frames costs nothing extra.
export function perfProbeInit() {
  return {
    fn: () => {
      if (window.__perf) return;
      const realNow = performance.now.bind(performance);
      const P = window.__perf = {
        on: false, armed: false, realNow,
        f: null, sites: { grad: new Map(), canv: new Map(), rng: new Map(), fx: new Map() }, refs: [], mainCanvas: null,
        reset() { this.f = { grad: 0, pat: 0, canv: 0, draw: 0, mainDraw: 0, full: 0, comp: 0, special: 0, rng: 0, fx: 0, ms: 0 }; },
        clearSites() { for (const m of Object.values(this.sites)) m.clear(); },
        live() { let n = 0, bytes = 0; this.refs = this.refs.filter((r) => { const c = r.deref(); if (!c) return false; n++; bytes += (c.width || 0) * (c.height || 0) * 4; return true; }); return { n, bytes }; },
      };
      P.reset();
      const SPECIAL = new Set(['saturation', 'difference', 'hue', 'color', 'luminosity', 'exclusion', 'color-dodge', 'color-burn', 'soft-light', 'hard-light']);
      /** caller file:line outside this probe (skip n frames) */
      const site = (skip = 3) => {
        const st = (new Error().stack || '').split('\n').slice(skip);
        for (const l of st) {
          const m = l.match(/\/((?:src|tools)\/[^\s:)]+):(\d+):\d+/);
          if (m) return `${m[1]}:${m[2]}`;
        }
        return '(unknown)';
      };
      /** the first two src/ call sites, "creator ← caller" (canvas helpers such as mkCanvas are one frame deep) */
      const site2 = (skip = 3) => {
        const st = (new Error().stack || '').split('\n').slice(skip);
        const out = [];
        for (const l of st) { const m = l.match(/\/((?:src|tools)\/[^\s:)]+):(\d+):\d+/); if (m) { out.push(`${m[1]}:${m[2]}`); if (out.length === 2) break; } }
        return out.join(' ← ') || '(unknown)';
      };
      const bump = (map, k, cap = 400) => { if (map.size < cap || map.has(k)) map.set(k, (map.get(k) || 0) + 1); };
      // canvases
      const ce = Document.prototype.createElement;
      Document.prototype.createElement = function (tag, ...a) {
        const el = ce.call(this, tag, ...a);
        if (String(tag).toLowerCase() === 'canvas') {
          P.refs.push(new WeakRef(el));
          if (P.on) P.f.canv++;
          if (P.armed || P.on) bump(P.sites.canv, site2(2));
        }
        return el;
      };
      if (typeof OffscreenCanvas === 'function') {
        const OC = OffscreenCanvas;
        window.OffscreenCanvas = function (w, h) {
          const c = new OC(w, h);
          P.refs.push(new WeakRef(c));
          if (P.on) P.f.canv++;
          if (P.armed || P.on) bump(P.sites.canv, site2(2));
          return c;
        };
        window.OffscreenCanvas.prototype = OC.prototype;
      }
      // gradients, patterns, draws
      const protos = [window.CanvasRenderingContext2D?.prototype, window.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean);
      for (const pr of protos) {
        for (const m of ['createLinearGradient', 'createRadialGradient', 'createConicGradient']) {
          const o = pr[m];
          if (typeof o !== 'function') continue;
          pr[m] = function (...a) { if (P.on) { P.f.grad++; bump(P.sites.grad, site()); } return o.apply(this, a); };
        }
        const op = pr.createPattern;
        if (op) pr.createPattern = function (...a) { if (P.on) P.f.pat++; return op.apply(this, a); };
        for (const m of ['drawImage', 'fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'putImageData']) {
          const o = pr[m];
          if (typeof o !== 'function') continue;
          pr[m] = function (...a) {
            if (P.on) {
              P.f.draw++;
              const main = this.canvas === P.mainCanvas;
              if (main) {
                P.f.mainDraw++;
                const gco = this.globalCompositeOperation;
                if (gco !== 'source-over') { P.f.comp++; if (SPECIAL.has(gco)) P.f.special++; }
                // full-screen pass: a fillRect / drawImage whose transformed box covers ≥ 90 % of the game canvas
                if (m === 'fillRect' || m === 'drawImage') {
                  let x, y, w, h;
                  if (m === 'fillRect') [x, y, w, h] = a;
                  else if (a.length >= 5) { x = a[a.length === 5 ? 1 : 5]; y = a[a.length === 5 ? 2 : 6]; w = a[a.length === 5 ? 3 : 7]; h = a[a.length === 5 ? 4 : 8]; }
                  if (w !== undefined) {
                    const t = this.getTransform();
                    const W = Math.abs(w * t.a) , H = Math.abs(h * t.d);
                    const cw = this.canvas.width, ch = this.canvas.height;
                    if (W * H >= 0.9 * cw * ch) P.f.full++;
                  }
                }
              }
            }
            return o.apply(this, a);
          };
        }
      }
      // gameplay RNG consumed while rendering. Math.random is also SEEDED (mulberry32, fixed seed) so two runs of the same
      // scene draw the same spawns/patterns and the counts are reproducible (a p95 at the budget edge must not flip between
      // runs); window.__perfSeed(n) reseeds.
      let seed = 0x5eed2026;
      const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      window.__perfSeed = (n) => { seed = n | 0; };
      Math.random = function () { if (P.on) { P.f.rng++; if (P.f.rng <= 40) bump(P.sites.rng, site2(2)); } return rnd(); };
      P.hookFx = (fx) => {
        if (!fx || fx.__perfHooked) return;
        fx.__perfHooked = true;
        for (const m of ['emit', 'burst', 'ring', 'ering', 'flash', 'slash', 'text', 'sprite', 'speedLine', 'dmg', 'callout', 'ghost', 'addDecal']) {
          const o = fx[m];
          if (typeof o !== 'function') continue;
          fx[m] = function (...a) { if (P.on) { P.f.fx++; bump(P.sites.fx, `${m} ← ${site(2)}`); } return o.apply(this, a); };
        }
      };
    },
    arg: null,
  };
}

/**
 * Measures n frames in a frozen page (lib/step.mjs freeze first): per frame one game step, then one counted render.
 * script (optional, string of JS run in the page each frame with (g, w, p, i, key)) drives input, e.g. attacks.
 * → { frames: [{grad, canv, draw, mainDraw, full, comp, special, rng, fx, ms, parts, dmg, decals}], sites }
 */
export function measureFrames(page, n, script = '') {
  return page.evaluate(([n, script]) => {
    const g = window.__game, P = window.__perf;
    P.mainCanvas = g.canvas;
    // eslint-disable-next-line no-new-func
    const drive = script ? new Function('g', 'w', 'p', 'i', 'key', script) : null;
    const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
    const frames = [];
    P.clearSites();
    for (let i = 0; i < n; i++) {
      const w0 = g.world;
      if (w0?.fx) P.hookFx(w0.fx);
      if (drive) { try { drive(g, w0, w0?.player, i, key); } catch (e) { console.warn('[perf drive]', e?.message); } }
      window.__qaStep(1, false);
      const w = g.world;
      if (w?.fx) P.hookFx(w.fx);
      P.reset(); P.on = true;
      const t0 = P.realNow();
      try { g.input?.beginRender?.(); g.__qaRender.call(g); g.input?.endRender?.(); } finally { P.on = false; }
      const f = P.f; f.ms = +(P.realNow() - t0).toFixed(2);
      f.parts = w?.fx?.list?.length ?? 0; f.top = g.top?.name ?? null;
      // live damage numbers counted from the list (fx.dmgLive is a running counter), decals (hitfx.stampDecal) — feel §8
      let nd = 0; for (const q of w?.fx?.list || []) if (q.shape === 'dmg') nd++;
      f.dmg = nd; f.decals = w?.fx?.decals?.length ?? 0;
      frames.push({ ...f });
    }
    const top = (m, k = 8) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
    return { frames, sites: { grad: top(P.sites.grad), canv: top(P.sites.canv, 20), rng: top(P.sites.rng), fx: top(P.sites.fx) } };
  }, [n, script]);
}

/** Summary stats of a numeric series: {avg, p50, p95, max} */
export function stats(xs) {
  if (!xs.length) return { avg: 0, p50: 0, p95: 0, max: 0 };
  const s = xs.slice().sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return { avg: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2), p50: q(0.5), p95: q(0.95), max: s[s.length - 1] };
}
