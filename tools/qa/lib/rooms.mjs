// Room helpers for the frozen-page QA tools (perf_budget, visual_review, soak): go to a stage room inside one page, wait
// for the painted bakes, walk into a boss fight, make the world safe to measure. All of them expect lib/step.mjs freeze().
import { step, stepUntil, settle } from './step.mjs';

/** Go to a stage room inside the same page and wait until it runs; enemies/triggers kept (real rooms). */
export async function gotoRoom(s, stage, room, { hero = null } = {}) {
  await s.eval(async ({ stage, room, hero }) => {
    const g = window.__game;
    if (hero && g.state?.hero?.charId !== hero) {
      const { newGameState } = await import('/src/game/state.js');
      g.state = newGameState({ slot: 1, difficulty: 'normal', charId: hero });
    }
    if (window.__perf) window.__perf.armed = false;
    g.go('stage', { stageId: stage, roomId: room }, { fade: false });
  }, { stage, room, hero });
  // let the async stage load (assets, painted bakes) finish: real time passes between these evaluates
  for (let i = 0; i < 80; i++) {
    const ok = await s.eval(({ stage }) => { const g = window.__game, w = g.world; return !!(w?.player && (w.stageId ?? w.stage?.id ?? w.def?.id) === stage && g.top?.world === w); }, { stage }).catch(() => false);
    if (ok) break;
    await step(s.page, 2, false);
    await s.wait(100);
  }
  await settle(s.page, 20);
  await waitBakes(s);
  await idleFlush(s);
}

/** Real time for the game's own idle-time prewarm after boot / stage entry (hitfx sprite caches, ultfx pools and
 *  prepareFor: setTimeout 250–300 ms + requestIdleCallback). A player always gets it (title card, intro); a frozen page that
 *  arms the canvas counter at once would count those pools as "created after stage start". */
export async function idleFlush(s, ms = 700) {
  // web fonts first: a late font load bumps ui.fontEpoch and every glyph/text cache rebuilds (new canvases) mid-measurement
  await s.eval(() => Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 5000))])).catch(() => {});
  await s.eval((ms) => new Promise((res) => setTimeout(() => {
    const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 1500 }) : (f) => setTimeout(f, 50);
    idle(() => idle(() => res()));
  }, ms)), ms).catch(() => {});
}

/** Waits (real time, ≤ maxMs) until no painted rig / painted boss / enemy rig is still loading or baking. */
export async function waitBakes(s, maxMs = 8000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < maxMs) {
    last = await s.eval(async () => {
      let n = 0;
      try { const E = await import('/src/render/painted/enemy_kit.js'); n += Object.values(E.rigStats()).filter((r) => !r.ready && !r.failed).length; } catch { /* */ }
      try { const R = await import('/src/render/painted/registry.js'); n += R.paintedIds().filter((id) => R.paintedState(id) === 'loading').length; } catch { /* */ }
      return n;
    });
    if (!last) break;
    await step(s.page, 1, true);
    await s.wait(150);
  }
  await settle(s.page, 5);
  return last;
}

/** Boss room: step over the arena line (walls/pillars on the way are not the point of these tools; walks right when the
 *  room has no arena marker), close intro/dialogues, wait for the fight. */
export async function enterFight(s) {
  await s.eval(() => {
    const w = window.__game.world, p = w?.player;
    if (!p || w.boss || w.arenaX === undefined) return;
    p.x = w.arenaX + 48 * 1.6; p.vx = 0;   // TILE = 48 (core/game.js); startBoss fires past arenaX + TILE
  });
  await s.page.keyboard.down('ArrowRight');
  const n = await stepUntil(s.page, '!!w.boss', 900);
  await s.page.keyboard.up('ArrowRight');
  for (let i = 0; i < 120; i++) {
    const st = await s.eval(() => { const g = window.__game, w = g.world; return { top: g.top?.name, cut: !!w?.cutscene, active: !!w?.bossActive, boss: !!w?.boss }; });
    if (st.top === 'stage' && !st.cut && (st.active || i > 60)) return { boss: st.boss, n };
    if (st.top === 'dialogue') { await s.page.keyboard.down('Enter'); await step(s.page, 2, false); await s.page.keyboard.up('Enter'); }
    else if (st.top === 'bossIntro') { await s.page.keyboard.down('KeyZ'); await step(s.page, 2, false); await s.page.keyboard.up('KeyZ'); }
    await step(s.page, 10, false);
  }
  return { boss: await s.eval(() => !!window.__game.world?.boss), n };
}

/** Makes the current world safe to measure: invulnerable hero, story triggers off (enemies stay). */
export const prepWorld = (s) => s.eval(() => {
  const w = window.__game.world, p = w?.player;
  if (!p) return;
  p.buffs.invincible = 9999;
  for (const e of w.entities || []) if (e.kind === 'trigger' || e.constructor?.name === 'StoryTrigger') e.dead = true;
});
