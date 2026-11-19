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

// ───────── CHAPTER lane (2026-11-18): proofs for what was changed after the audit ─────────
let bad = 0; const ok = (cond, text) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${text}`); if (!cond) bad++; };
// 4) the empty night of 1697 cannot be walked past the wailing room and the lamp: from the entry on foot the wooden screen ends the way (both wedge states)
for (const flags of [{ wedge_stone: true }, { wedge_wood: true }]) {
  const { a, W } = await build('ossuary_past', flags), d = a.spawns.default, G = reachGrid(W, d.x, d.z, 14), far = ['arena', 'lamp', 'riddle', 'rest', 'boss', 'posts'].filter((id) => { const s = a.stage.sections.find((q) => q.id === id); return G.anyIn(s.x0, s.x1, s.z0, s.z1); });
  ok(far.length === 0, `ossuary_past [${Object.keys(flags).join('+')}]: on foot from the entry the rooms behind the wooden screen are closed (reached: ${far.join(' ') || 'none'})`);
}
{ const { a, W } = await build('ossuary_now', { wedge_stone: true }), b = a.interact.find((q) => q.id === 'bell_coffins'), G = reachGrid(W, b.x, b.z - 30, 14), s = (id) => a.stage.sections.find((q) => q.id === id);
  ok(['arena', 'lamp', 'riddle', 'rest', 'boss'].every((id) => G.anyIn(s(id).x0, s(id).x1, s(id).z0, s(id).z1)), 'ossuary_now [wedge_stone]: from the corridor bell the way runs over the statue through the wailing room and the lamp room to the last hall');
  const t = a.triggers.find((q) => q.event === 'boss.enter'), ba = a.interact.find((q) => q.id === 'bell_arena');
  ok(ba.x >= t.x0 && ba.x < t.x1 && ba.z >= t.z0 && ba.z < t.z1 && t.once === false, `ossuary_now: the arena bell's spot (${ba.x},${ba.z}) lies inside trigger boss.enter [${t.x0}..${t.x1} x ${t.z0}..${t.z1}], which fires on every entry`); }
{ const p0 = (await build('ossuary_past', { wedge_stone: true })).a, p1 = (await build('ossuary_past', { wedge_stone: true, queen_fled: true })).a, ev = (a) => a.interact.find((q) => q.id === 'bell_arena').event;
  ok(ev(p0) === 'bell.sealed' && ev(p1) === 'bell.ring', `ossuary_past: the arena bell answers ${ev(p0)} before the queen has fled and ${ev(p1)} after`);
  ok(!p0.enemies.some((e) => e.kind === 'banshee_queen') && p1.enemies.some((e) => e.kind === 'banshee_queen' && e.phase === 2 && !e.active), 'ossuary_past: the queen stands there only after her flight, in her second act, asleep until the hero is in her hall'); }
// 5) nobody appears on the spot the hero stands on: every person against every spawn of her area, in every state the area is built from (+ the story's own flags for the people)
{ const { AREA_FLAGS } = await import('../../src/v2/world/index.js'); const EXTRA = { eshville_past: ['elise_found', 'keepers_promised', 'street_clear'], eshville_now: ['square_clear', 'street_clear'], ossuary_now: ['sera_follows'], graveyard_past: ['past_gate_open'] }; let n = 0; const hits = [];
  for (const id of Object.keys(AREAS)) { if (id === 'slice0') continue; const F = [...(AREA_FLAGS[id] ?? []), ...(EXTRA[id] ?? [])], states = [{}, ...F.map((f) => ({ [f]: true })), Object.fromEntries(F.filter((f) => f !== 'wedge_wood').map((f) => [f, true]))];
    for (const fl of states) { const a = await AREAS[id](fl); for (const p of a.actors) for (const [sn, s] of Object.entries(a.spawns)) { n++; if (Math.abs(p.x - s.x) < 36 && Math.abs(p.z - s.z) < 36) hits.push(`${id}[${Object.keys(fl).join('+') || 'base'}] ${p.id} (${p.x},${p.z}) on spawn ${sn} (${s.x},${s.z})`); } } }
  ok(hits.length === 0, `no person's place lies on a spawn (${n} person x spawn pairs over every area state)${hits.length ? ': ' + [...new Set(hits)].join('; ') : ''}`); }
// 6) the rules: enemies wait while the story holds the hero · a long press of the bell that began while the bell rested rings when it is ready
{ const { Sim, TUNE } = await import('../../src/v2/play/index.js');
  const flat = () => ({ boxes: [{ x0: -2000, x1: 2000, z0: -2000, z1: 2000, y0: -50, y1: 0, walk: true, solid: false }], start: { x: 0, y: 0, z: 0 }, sections: [{ id: 'yard', x0: -2000, x1: 2000, z0: -2000, z1: 2000 }], spawns: [] });
  for (const kind of ['skeleton_soldier', 'plague_corpse', 'skeleton_mage', 'grave_ghost', 'banshee_queen']) {
    const W = flat(); W.spawns = [{ kind, x: 90, z: 0, active: true }]; let hurt = 0, tells = 0; const sim = new Sim(W, { heroHurt() { hurt++; }, event(n) { if (n === 'tell') tells++; } }), e = sim.enemies[0], h = sim.hero;
    sim.hold = true; let minD = 1e9; for (let i = 0; i < 600; i++) { h.ifr = 0.4; sim.update(1 / 60, { mx: 0, mz: 0 }); if (i > 120) minD = Math.min(minD, Math.hypot(e.x - h.x, e.z - h.z)); }
    const t0 = tells, far = e.def.boss || minD >= 118;
    sim.hold = false; let first = -1; for (let i = 0; i < 900 && first < 0; i++) { sim.update(1 / 60, { mx: 0, mz: 0 }); if (tells > t0) first = i; }
    ok(t0 === 0 && hurt === 0 && far && first >= 0, `${kind}: 10 s of story hold - attacks begun ${t0}, hero hurt ${hurt}, nearest ${Math.round(minD)} px${e.def.boss ? ' (a boss floats where she is)' : ''}; first attack ${first < 0 ? 'never' : (first / 60).toFixed(1) + ' s'} after the story let go`);
  }
  { const sim = new Sim(flat(), {}), h = sim.hero; let rang = 0; sim.hooks.event = (n) => { if (n === 'ringLong') rang++; };
    const step = (inp) => sim.update(1 / 60, inp);
    step({ mx: 0, mz: 0, bell: true, bellHeld: true }); for (let i = 0; i < 4; i++) step({ mx: 0, mz: 0, bellHeld: true }); for (let i = 0; i < 60; i++) step({ mx: 0, mz: 0, bellHeld: false });   // a short ring: the echo, then the bell rests (bellCd)
    const cd = h.bellCd; step({ mx: 0, mz: 0, bell: true, bellHeld: true }); let n = 0; for (; n < 600 && !rang; n++) step({ mx: 0, mz: 0, bellHeld: true });
    ok(cd > 0 && rang === 1, `the bell: a long press begun ${cd.toFixed(1)} s before the bell was ready rang after ${(n / 60).toFixed(1)} s of holding (rests ${TUNE.bellCd} s, hold ${TUNE.bellTap} + ${TUNE.ringT} s)`);
    const sim2 = new Sim(flat(), {}), h2 = sim2.hero; let r2 = 0; sim2.hooks.event = (n2) => { if (n2 === 'ringLong' || n2 === 'bell') r2++; };
    sim2.update(1 / 60, { mx: 0, mz: 0, bell: true, bellHeld: true }); for (let i = 0; i < 4; i++) sim2.update(1 / 60, { mx: 0, mz: 0, bellHeld: true }); for (let i = 0; i < 40; i++) sim2.update(1 / 60, { mx: 0, mz: 0 });
    const before = r2; sim2.update(1 / 60, { mx: 0, mz: 0, bell: true, bellHeld: true }); sim2.update(1 / 60, { mx: 0, mz: 0, bellHeld: true }); for (let i = 0; i < 400; i++) sim2.update(1 / 60, { mx: 0, mz: 0 });
    ok(r2 === before && !h2.bellWait, 'the bell: a press begun while it rested and let go before it was ready rings nothing later'); }
}
if (bad) { console.log(`FAIL (${bad})`); process.exit(1); } else console.log('ALL OK (chapter proofs)');
