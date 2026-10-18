import { openEnv } from './lib/server.mjs';
import { freeze, step } from './lib/step.mjs';
import { waitBakes, idleFlush } from './lib/rooms.mjs';
const env = await openEnv({});
const s = await env.page('fold_open', null);
await s.goto('index.html?scene=stage&stage=s16&room=boss');
await s.waitGame('g.world && g.world.player && g.top && g.top.name === "stage"', 60000);
await freeze(s.page); await step(s.page, 20, true); await waitBakes(s); await idleFlush(s, 300);
await s.eval(() => { const w = window.__game.world, p = w.player; p.buffs.invincible = 9999; p.x = w.arenaX - 48 * 3; });
await step(s.page, 200, false);
await s.page.keyboard.down('ArrowRight');
for (let i = 0; i < 900; i++) { const top = await s.eval(() => window.__game.top?.name); if (top === 'bossIntro') break; if (top === 'dialogue') { await s.page.keyboard.up('ArrowRight'); await s.page.keyboard.down('Enter'); await step(s.page, 2, false); await s.page.keyboard.up('Enter'); await step(s.page, 2, false); continue; } await step(s.page, 1, false); }
await s.page.keyboard.up('ArrowRight');
await step(s.page, 30, false);
const r = await s.eval(() => {
  const w = window.__game.world, b = w.boss;
  const own = w.entities.filter((e) => e === b || e.host === b).map((e) => ({ k: e.kind, c: e.constructor?.name, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h), z: e.z }));
  const other = w.entities.filter((e) => e !== b && e.host !== b && e !== w.player).map((e) => ({ k: e.kind, c: e.constructor?.name, host: e.host?.def?.id ?? e.host?.kind ?? null, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w), h: Math.round(e.h) }));
  return { own, other: other.slice(0, 30), xf: w.reveal?.xf, bossPos: { x: b.x, y: b.y, w: b.w, h: b.h }, painted: !!b.painted, keys: Object.keys(b).filter((k) => /paint|art|proxy|front|pulpit|altar/i.test(k)) };
});
console.log(JSON.stringify(r, null, 1));
await env.close?.();
process.exit(0);
