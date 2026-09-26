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
    const tierOf = new Function('g', `return ${TIER};`);
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
    const t0 = C.vt;
    performance.now = () => C.vt;
    window.requestAnimationFrame = (cb) => { C.q.push(cb); return C.q.length; };
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
