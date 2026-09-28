// Deterministic stepping for input checks on a loaded machine (MASTER_PLAN W4 note: pause the loop, step game.tick).
//
//   await freeze(page)                   the real rAF loop keeps running but its tick/render become no-ops; performance.now
//                                        becomes a virtual clock that advances 1/60 s per step
//   await step(page, n)                  n fixed steps of 1/60 s: input.pollFrame() (pad) + game.tick; one render at the end
//   await stepUntil(page, fnSrc, max)    steps until the page predicate (string over g, w, p) holds; → steps taken or -1
//   await unfreeze(page)
//   const rec = await stepRec(page, n, exprs)   steps n and samples the given expressions after every step
//
// Real CDP input (page.keyboard, Touch, fake pad __padSet) lands in input.js listeners immediately; the next step's
// input.update() turns it into pressed/released edges, so a press held for k steps is exactly k game frames long,
// whatever the machine load. Page predicates run through page.evaluate (CDP), so they also work under the production CSP.

export async function freeze(page) {
  await page.evaluate(() => {
    const g = window.__game;
    if (!g || g.__qaFrozen) return;
    g.__qaFrozen = true;
    g.__qaTick = g.tick; g.__qaRender = g.render;
    g.tick = () => {}; g.render = () => {};
    // virtual clock: performance.now advances 1/60 s per step, so wall-clock rules (L3 hold 0.25 s, touch swap long-press
    // 350 ms, double-tap windows) see game time, not the few real milliseconds a synchronous step loop takes
    const realNow = performance.now.bind(performance);
    let vt = realNow();
    g.__qaRealNow = realNow;
    performance.now = () => vt;
    window.__qaStep = (n = 1, render = true) => {
      const inp = g.input;
      for (let i = 0; i < n; i++) { vt += 1000 / 60; try { inp?.pollFrame?.(); } catch { /* */ } g.__qaTick.call(g, 1 / 60); }
      if (render) { try { inp?.beginRender?.(); g.__qaRender.call(g); inp?.endRender?.(); } catch (e) { console.error(e); } }
      return g.frame;
    };
  });
}
export async function unfreeze(page) {
  await page.evaluate(() => {
    const g = window.__game;
    if (!g?.__qaFrozen) return;
    if (g.__qaRealNow) performance.now = g.__qaRealNow;
    g.tick = g.__qaTick; g.render = g.__qaRender; g.__qaFrozen = false; g.last = performance.now();
  });
}
export const step = (page, n = 1, render = true) => page.evaluate(([n, render]) => window.__qaStep(n, render), [n, render]);

/** Steps (one at a time, render every 6th) until `pred` (JS expression over g, w, p) is truthy. → steps or -1. */
export function stepUntil(page, pred, max = 600) {
  return page.evaluate(([pred, max]) => {
    // eslint-disable-next-line no-new-func
    const f = new Function('g', 'w', 'p', `return (${pred});`);
    const g = window.__game;
    for (let i = 0; i < max; i++) {
      const w = g.world, p = w?.player;
      if (f(g, w, p)) return i;
      window.__qaStep(1, i % 6 === 5);
    }
    return -1;
  }, [pred, max]);
}

/**
 * Steps n times and returns [{i, …samples}] with each expression evaluated after every step.
 * exprs: { name: 'js expression over g, w, p, input' }
 */
export function stepRec(page, n, exprs) {
  return page.evaluate(([n, exprs]) => {
    const g = window.__game;
    const fns = Object.entries(exprs).map(([k, src]) => [k, new Function('g', 'w', 'p', 'input', `try { return (${src}); } catch (e) { return 'ERR ' + e.message; }`)]);
    const out = [];
    for (let i = 0; i < n; i++) {
      window.__qaStep(1, i % 6 === 5 || i === n - 1);
      const w = g.world, p = w?.player, r = { i };
      for (const [k, f] of fns) r[k] = f(g, w, p, g.input);
      out.push(r);
    }
    return out;
  }, [n, exprs]);
}

/** Records bus events in the page: installs once, returns a reader. */
export async function busRecorder(page, names) {
  await page.evaluate(async (names) => {
    const { bus } = await import('/src/core/events.js');
    const R = (window.__qaBus ||= { log: [], on: new Set() });
    for (const n of names) {
      if (R.on.has(n)) continue;
      R.on.add(n);
      bus.on(n, (d) => { R.log.push({ ev: n, t: window.__game?.world?.time ?? 0, f: window.__game?.frame ?? 0, d: (() => { try { return JSON.parse(JSON.stringify(d ?? null)); } catch { return null; } })() }); });
    }
  }, names);
  return {
    clear: () => page.evaluate(() => { if (window.__qaBus) window.__qaBus.log.length = 0; }),
    read: () => page.evaluate(() => (window.__qaBus?.log || []).slice()),
  };
}

/**
 * Steps n frames, closing dialogue / story / join overlays that open meanwhile (like tools/test_mount.mjs) so the
 * stage stays on top. → names of the scenes that were closed.
 */
export function settle(page, n = 30) {
  return page.evaluate((n) => {
    const g = window.__game, closed = [];
    for (let i = 0; i < n; i++) {
      window.__qaStep(1, i === n - 1);
      for (let k = 0; k < 8 && /^(dialogue|companionJoin|story|bossIntro|document)$/.test(g.top?.name ?? ''); k++) { closed.push(g.top.name); g.pop(); }
    }
    return closed;
  }, n);
}
