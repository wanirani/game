// Virtual frame clock for pacing and governor checks (platform.md §6.4, §6.5; P-12, P-13).
// Replaces requestAnimationFrame and performance.now at runtime, so every rAF gets a timestamp exactly `stepMs`
// after the previous one no matter how fast the machine is (120 Hz = 8.333 ms, a slow phone = 30 ms).
//
//   await runFrames(s.page, 8.333, 240)   → { frames, renders, ticks, virtualMs, tiers: [[t, tier], …] }
//   (the real clock is restored afterwards; game.last is reset so the loop does not see a time jump)

/** Effective quality tier as the game reports it (game.tier / qualityTier, else the setting). */
export const TIER_EXPR = "(g.tier ?? g.qualityTier ?? g.quality ?? g.settings?.quality ?? null)";

export async function runFrames(page, stepMs, frames, { sampleTier = false } = {}) {
  return page.evaluate(async ({ stepMs, frames, sampleTier, TIER }) => {
    const g = window.__game;
    // same expression as TIER_EXPR, written out (no new Function: the page may run under a CSP without 'unsafe-eval')
    const tierOf = (g) => (g.tier ?? g.qualityTier ?? g.quality ?? g.settings?.quality ?? null);
    const realRaf = window.requestAnimationFrame.bind(window);
    const realNow = performance.now.bind(performance);
    let renders = 0, ticks = 0;
    const R = g.render, T = g.tick;
    g.render = function (...a) { renders++; return R.apply(this, a); };
    g.tick = function (...a) { ticks++; return T.apply(this, a); };
    const C = { vt: realNow(), q: [], n: 0 };
    const tiers = [];
    let lastTier = sampleTier ? tierOf(g) : null;
    if (sampleTier) tiers.push([0, lastTier]);
    window.requestAnimationFrame = (cb) => { C.q.push(cb); return C.q.length; };
    // The loop's pending callback still sits in the REAL rAF queue (handed back by a previous runFrames, or it never left
    // it): wait until it has run once on the real clock and re-registered into the fake queue, else the storm below can
    // finish before the next real frame and record 0 renders / 0 ticks (request #82). Bounded: a page without a running
    // loop starts after ~1.5 s anyway. Counters and the virtual clock start only after that.
    for (let i = 0; i < 60 && !C.q.length; i++) await new Promise((r) => { realRaf(() => r()); setTimeout(r, 25); });
    renders = 0; ticks = 0;
    C.vt = realNow();
    const t0 = C.vt;
    performance.now = () => C.vt;
    const ch = new MessageChannel();
    await new Promise((resolve) => {
      ch.port1.onmessage = () => {
        C.vt += stepMs; C.n++;
        const cbs = C.q.splice(0);
        for (const cb of cbs) { try { cb(C.vt); } catch (e) { console.error(e); } }
        if (sampleTier) { const t = tierOf(g); if (t !== lastTier) { tiers.push([Math.round(C.vt - t0), t]); lastTier = t; } }
        if (C.n >= frames) resolve(); else ch.port2.postMessage(0);
      };
      ch.port2.postMessage(0);
    });
    performance.now = realNow;
    window.requestAnimationFrame = realRaf;
    g.render = R; g.tick = T;
    const pending = C.q.splice(0);
    g.last = realNow();
    for (const cb of pending) realRaf(cb);
    return { frames: C.n, renders, ticks, virtualMs: Math.round(C.vt - t0), tiers, endTier: sampleTier ? tierOf(g) : null };
  }, { stepMs, frames, sampleTier, TIER: TIER_EXPR });
}
