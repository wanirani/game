// CHAPTER-AUDIT (read-only helper, no browser): static proofs on the areas' own collision.
//   node tools/v2/chapter_reach.mjs
// 1) the cemetery gate: can the hero get within the 36 px margin of the locked exit `to_graveyard` (where the scene raises exit.locked) while the gate is shut?
// 2) the tower door before the promise: can it be reached without stepping into trigger church.arrive?
// 3) the ossuary tonight: which sections are walkable from the entry, before / after the wedge
import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { AREAS } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const build = async (id, flags) => { const a = await AREAS[id](flags); const W = compileEnv(a.stage); W.hookPoints = a.stage.hookPoints ?? []; return { a, W }; };
const nearBox = (G, x, m) => { let best = null; for (let px = x.x0 - m; px <= x.x1 + m; px += 10) for (let pz = x.z0 - m; pz <= x.z1 + m; pz += 10) if (G.reachable(px, pz)) { best = [px, pz]; break; } return best; };
for (const [id, flags] of [['eshville_now', { door_pulled: true, promise: true }], ['eshville_past', {}], ['eshville_now', { gate_open: true }]]) {
  const { a, W } = await build(id, flags), d = a.spawns.default, G = reachGrid(W, d.x, d.z, 14), x = a.exits.find((q) => q.id === 'to_graveyard');
  let far = -1e9, at = null; for (let pz = 900; pz <= 1320; pz += 10) for (let px = 4500; px <= 4680; px += 10) if (G.reachable(px, pz) && pz > far) { far = pz; at = [px, pz]; }
  console.log(`${id} [${Object.keys(flags).join('+') || 'base'}]: exit to_graveyard box z ${x.z0}..${x.z1} locked=${x.locked ?? 'no'}; a reachable cell within 36 of the box: ${JSON.stringify(nearBox(G, x, 36))}; deepest reachable z in the lane x 4500..4680: ${far} at ${JSON.stringify(at)} -> the hero stops ${x.z0 - 36 - far} px short of the margin`);
}
{ const { a, W } = await build('eshville_now', {}), d = a.spawns.default, t = a.triggers.find((q) => q.event === 'church.arrive'), x = a.exits.find((q) => q.id === 'to_belltower');
  const W2 = { ...W, boxes: [...W.boxes, { x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, y0: -50, y1: 400, solid: true, walk: false }] };
  const G = reachGrid(W2, d.x, d.z, 14), G0 = reachGrid(W, d.x, d.z, 14);
  console.log(`eshville_now base: tower door box [${x.x0}..${x.x1} x ${x.z0}..${x.z1}]; reachable near it normally: ${JSON.stringify(nearBox(G0, x, 36))}; with trigger church.arrive [${t.x0}..${t.x1} x ${t.z0}..${t.z1}] as a wall: ${JSON.stringify(nearBox(G, x, 36))}`); }
for (const [id, flags] of [['ossuary_now', {}], ['ossuary_now', { wedge_stone: true }], ['ossuary_now', { wedge_wood: true }], ['ossuary_past', {}], ['ossuary_past', { wedge_stone: true }]]) {
  const { a, W } = await build(id, flags), d = a.spawns.default, G = reachGrid(W, d.x, d.z, 14);
  console.log(`${id} [${Object.keys(flags).join('+') || 'base'}] from the entry on foot: ` + a.stage.sections.map((s) => `${s.id}:${G.anyIn(s.x0, s.x1, s.z0, s.z1) ? 'yes' : 'NO'}`).join(' ') + ' | bells ' + a.interact.filter((q) => q.kind === 'bell').map((q) => `${q.id}:${G.near(q.x, q.z, q.r) ? 'yes' : 'NO'}`).join(' '));
}
