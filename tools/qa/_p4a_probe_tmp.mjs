import { openEnv } from './lib/server.mjs';
const env = await openEnv({});
const s = await env.page('fold_open', null);
await s.goto('index.html?scene=stage&stage=s01&room=boss');
await s.waitGame('g.world && g.world.player && g.top && g.top.name === "stage"', 60000);
await new Promise((r) => setTimeout(r, 1500));
const r = await s.eval(async () => {
  const { touchpad } = await import('/src/core/touchpad.js');
  const { input } = await import('/src/core/input.js');
  const g = window.__game;
  const occ = touchpad.occupiedRects?.();
  return { vw: g.viewW, vh: g.viewH, mode: input.mode, touchMode: input.touchMode, n: occ?.length, occ: (occ || []).slice(0, 20).map((o) => [o.id, Math.round(o.x), Math.round(o.y), Math.round(o.w), Math.round(o.h)]) };
});
console.log(JSON.stringify(r));
await env.close();
