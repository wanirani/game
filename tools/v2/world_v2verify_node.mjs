// WORLD2-VERIFY (node, no browser): what the lane's own node check does not cover.
//   A. story hooks: every area hook src/v2/data/events.js listens to + the table of docs/v2/DATA_FORMAT.md 12, against every state of every area
//   B. camera rays (as tools/v2/world_verify_node.mjs) on EVERY standable cell, seeded from every spawn / entry / ring landing, in the flagged states
//      (the lane's check floods from the default spawn of the base state only: the ossuary beyond the coffin wall and the gap was never looked at)
//   C. the two nights of the ossuary: same floors / walls / fixed props?
//   D. the boss hall: room to go round a boss of the queen's size, dead-end pockets
//   node tools/v2/world_v2verify_node.mjs [--json out.json] [--only A,B,C,D]
import fs from 'node:fs';
import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { AREAS, AREA_FLAGS, areaStates, stateName } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const { groundAt, sectionAt, STEP_UP } = await import('../../src/v2/b/world.js');
const { EVENTS } = await import('../../src/v2/data/events.js');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const ONLY = String(args.only || 'A,B,C,D').split(','), out = {}, problems = [];
const bad = (m) => { problems.push(m); console.log('  !! ' + m); };

// ───────── A. hooks ─────────
const U = {};   // area -> union over states
for (const id of Object.keys(AREAS)) {
  const u = U[id] = { spawns: new Set(), exits: new Map(), trig: [], inter: [], actors: [], groups: new Set(), states: [] };
  for (const flags of areaStates(id)) {
    const a = await AREAS[id](flags), st = stateName(flags); u.states.push(st);
    Object.keys(a.spawns).forEach((s) => u.spawns.add(s)); a.exits.forEach((x) => u.exits.set(x.id, x));
    a.triggers.forEach((t) => u.trig.push({ ...t, st })); a.interact.forEach((t) => u.inter.push({ ...t, st })); a.actors.forEach((t) => u.actors.push({ ...t, st }));
    a.enemies.forEach((e) => e.group && u.groups.add(e.group));
  }
}
if (ONLY.includes('A')) {
  console.log('== A. story hooks ==');
  const allTrig = Object.entries(U).flatMap(([id, u]) => u.trig.map((t) => ({ ...t, area: id }))), allInter = Object.entries(U).flatMap(([id, u]) => u.inter.map((t) => ({ ...t, area: id })));
  const allGroups = new Set(Object.values(U).flatMap((u) => [...u.groups]));
  const areaOf = (ev) => { const c = (ev.if ?? []).find((s) => typeof s === 'string' && s.startsWith('area:')); return c ? c.slice(5) : ev.match?.area ?? null; };
  const walk = (steps, f) => { for (const s of steps ?? []) { if (!Array.isArray(s)) continue; f(s); if (s[0] === 'if') { walk(s[2], f); walk(s[3], f); } } };
  let n = 0;
  for (const ev of EVENTS) {
    const m = ev.match ?? {}, ar = areaOf(ev), tag = `${ev.id}${ev.waiting ? ' [waiting ' + ev.waiting + ']' : ''}${ev.bridge ? ' [bridge]' : ''}`;
    if (ev.on === 'trigger' && m.event) { n++; const hit = allTrig.filter((t) => t.event === m.event && (!ar || t.area === ar)); if (!hit.length && !['bell.toll'].includes(m.event)) bad(`${tag}: no trigger with event ${m.event}${ar ? ' in ' + ar : ''}`); }
    if (ev.on === 'interact' && m.event) { n++; const hit = allInter.filter((t) => t.event === m.event && (!m.id || t.id === m.id) && Object.entries(m).every(([k, v]) => !k.startsWith('data.') || t.data?.[k.slice(5)] === v)); if (!hit.length) bad(`${tag}: no interact ${JSON.stringify(m)}`); }
    if (ev.on === 'group.clear' && m.group) { n++; if (!allGroups.has(m.group)) bad(`${tag}: no enemy group ${m.group}`); }
    if (ev.on === 'area.enter' && m.area) { n++; if (!AREAS[m.area]) bad(`${tag}: area ${m.area} is not built`); }
    walk(ev.steps, (s) => {
      if (s[0] === 'gotoArea') { n++; if (!AREAS[s[1]]) bad(`${tag}: gotoArea ${s[1]} not built`); else if (s[2] && !U[s[1]].spawns.has(s[2])) bad(`${tag}: gotoArea ${s[1]} has no spawn ${s[2]}`); }
      if (s[0] === 'wakeGroup') { n++; if (!allGroups.has(s[1])) bad(`${tag}: wakeGroup ${s[1]}: no such group`); }
      if (s[0] === 'showActor' || s[0] === 'hideActor') { n++; if (!U[s[2]]) bad(`${tag}: ${s[0]} ${s[1]} in ${s[2]}: area not built`); else if (!U[s[2]].actors.some((a) => a.id === s[1])) bad(`${tag}: ${s[0]} ${s[1]}: no such actor in ${s[2]}`); }
    });
  }
  console.log(`  events.js: ${EVENTS.length} sequences, ${n} area references checked`);
  // the table of DATA_FORMAT 12
  const T = (c, m) => { if (!c) bad('DATA_FORMAT 12: ' + m); else console.log('  ok  ' + m); };
  const has = (id, list, f) => U[id][list].some(f);
  T(has('eshville_now', 'actors', (a) => a.id === 'hadwin' && a.talk === 'hadwin.smithy.now'), 'eshville_now actor hadwin talk hadwin.smithy.now');
  T(has('eshville_past', 'actors', (a) => a.id === 'elise' && a.when === 'elise_found'), 'eshville_past actor elise when elise_found');
  T(has('eshville_past', 'inter', (a) => a.id === 'inn_door' && a.event === 'door.tavern') && has('eshville_past', 'actors', (a) => a.id === 'edmund' && a.talk === 'edmund.tavern'), 'eshville_past interact inn_door door.tavern + actor edmund talk edmund.tavern');
  T(U.eshville_past.spawns.has('from_belltower') && U.eshville_past.spawns.has('bell'), 'eshville_past spawns from_belltower, bell');
  T(has('graveyard_past', 'trig', (a) => a.event === 'grave.edmund'), 'graveyard_past trigger grave.edmund');
  T(has('graveyard_past', 'actors', (a) => a.id === 'edmund' && a.when === 'past_gate_open'), 'graveyard_past actor edmund when past_gate_open');
  T(has('graveyard_past', 'inter', (a) => a.id === 'road_bell' && a.kind === 'bell' && a.event === 'bell.hang' && a.st === 'base'), 'graveyard_past interact road_bell kind bell event bell.hang (base)');
  T(has('graveyard_past', 'inter', (a) => a.id === 'road_bell' && a.kind === 'bell' && a.event === 'bell.ring' && a.st.includes('bell_hung')), 'graveyard_past road_bell rings (bell.ring) once bell_hung');
  T(has('graveyard_now', 'inter', (a) => a.id === 'road_bell' && a.event === 'bell.ring'), 'graveyard_now road_bell bell.ring');
  T(U.graveyard_now.spawns.has('from_ossuary') && U.graveyard_past.spawns.has('from_ossuary'), 'graveyard_* spawn from_ossuary');
  T(U.belltower_now.spawns.has('bottom'), 'belltower_now spawn bottom');
  T(has('belltower_now', 'trig', (a) => a.event === 'tower.top' && a.wake === 'tower_bats') && U.belltower_now.groups.has('tower_bats'), 'belltower_now trigger tower.top wake tower_bats + group tower_bats');
  T(has('belltower_now', 'actors', (a) => a.id === 'elise'), 'belltower_now actor elise');
  T(U.ossuary_now.spawns.has('entry'), 'ossuary_now spawn entry');
  for (const e of ['oss.coffins', 'oss.gap', 'oss.arena', 'oss.lamp', 'boss.enter']) T(has('ossuary_now', 'trig', (a) => a.event === e), 'ossuary_now trigger ' + e);
  T(has('ossuary_now', 'trig', (a) => a.event === 'oss.gap' && a.once === false), 'ossuary_now oss.gap once:false');
  T(has('ossuary_now', 'trig', (a) => a.event === 'oss.arena' && a.wake === 'oss_arena') && U.ossuary_now.groups.has('oss_arena'), 'ossuary_now oss.arena wake oss_arena + group');
  T(has('ossuary_now', 'inter', (a) => a.event === 'oss.riddle' && a.kind === 'sign'), 'ossuary_now interact oss.riddle kind sign');
  T(has('ossuary_now', 'inter', (a) => a.event === 'rest' && a.id === 'boss_rest'), 'ossuary_now interact rest id boss_rest');
  for (const id of ['ossuary_now', 'ossuary_past']) T(new Set(U[id].inter.filter((a) => a.kind === 'bell' && a.event === 'bell.ring').map((a) => a.id)).size === 4, id + ' three room bells + the arena bell (kind bell, bell.ring)');
  T(has('ossuary_now', 'actors', (a) => a.id === 'sera' && a.talk === 'sera.ossuary' && a.when === 'sera_follows'), 'ossuary_now actor sera talk sera.ossuary when sera_follows');
  T(U.ossuary_now.groups.has('boss'), 'ossuary_now enemy group boss (banshee_queen)');
  T(has('ossuary_past', 'inter', (a) => a.event === 'oss.wedge' && a.kind === 'pull'), 'ossuary_past interact oss.wedge kind pull');
  for (const p of [1, 2, 3, 4]) T(has('ossuary_past', 'inter', (a) => a.event === 'oss.knell' && a.data?.post === p), 'ossuary_past oss.knell post ' + p);
  T(has('ossuary_past', 'inter', (a) => a.event === 'oss.elise'), 'ossuary_past interact oss.elise');
  // twin bells: a bell crossing lands at the same x, z in the other night - is that spot standable there, in every wedge state?
  for (const fl of [{}, { wedge_stone: true }, { wedge_wood: true }]) for (const [id, tw] of [['ossuary_now', 'ossuary_past'], ['ossuary_past', 'ossuary_now'], ['graveyard_now', 'graveyard_past'], ['graveyard_past', 'graveyard_now']]) {
    if (id.startsWith('graveyard') && Object.keys(fl).length) continue;
    const a = await AREAS[id](fl), b = await AREAS[tw](fl), W = compileEnv(b.stage), g = reachGrid(W, 0, 0, 14, { noStart: true, seeds: Object.values(b.spawns).map((s) => [s.x, s.z]) });
    for (const it of a.interact.filter((i) => i.kind === 'bell' && i.event === 'bell.ring')) { const p = g.near(it.x, it.z, it.r ?? 70); if (!p) bad(`${id}@${stateName(fl)} bell ${it.id} (${it.x},${it.z}): nowhere to stand within its radius in ${tw} (a crossing would land inside something)`); else if (g.blocked(it.x, it.z, 14)) console.log(`  note ${id}@${stateName(fl)} bell ${it.id}: its own spot (${it.x},${it.z}) is blocked in ${tw}; nearest standable ${p}`); }
  }
}

// ───────── B. camera rays on every standable cell ─────────
function triGrid(W) {
  const T = []; let up = 0;
  for (const m of W.env.meshes) {
    const f = new Float32Array(m.data), n = m.count;
    for (let v = 0; v + 2 < n; v += 3) {
      const a = v * 7, b = a + 7, c = b + 7, t = [f[a], f[a + 1], f[a + 2], f[b], f[b + 1], f[b + 2], f[c], f[c + 1], f[c + 2]];
      const e1 = [t[3] - t[0], t[4] - t[1], t[5] - t[2]], e2 = [t[6] - t[0], t[7] - t[1], t[8] - t[2]], nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      t.push(nrm[0], nrm[1], nrm[2], m.tex); up += Math.sign(nrm[1]) * (Math.abs(nrm[1]) > 0.9 * Math.hypot(...nrm) ? 1 : 0); T.push(t);
    }
  }
  const sgn = up >= 0 ? 1 : -1, S = 120, map = new Map();
  T.forEach((t, i) => { const a0 = Math.floor(Math.min(t[0], t[3], t[6]) / S), a1 = Math.floor(Math.max(t[0], t[3], t[6]) / S), b0 = Math.floor(Math.min(t[2], t[5], t[8]) / S), b1 = Math.floor(Math.max(t[2], t[5], t[8]) / S); for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) { const k = a * 100003 + b; let L = map.get(k); if (!L) map.set(k, L = []); L.push(i); } });
  return { T, sgn, S, map };
}
function blockedRay(TG, o, p) {
  const { T, sgn, S, map } = TG, d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const a0 = Math.floor(Math.min(o[0], p[0]) / S), a1 = Math.floor(Math.max(o[0], p[0]) / S), b0 = Math.floor(Math.min(o[2], p[2]) / S), b1 = Math.floor(Math.max(o[2], p[2]) / S), done = new Set();
  for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) {
    const L = map.get(a * 100003 + b); if (!L) continue;
    for (const i of L) {
      if (done.has(i)) continue; done.add(i);
      const t = T[i]; if ((t[9] * d[0] + t[10] * d[1] + t[11] * d[2]) * sgn >= 0) continue;
      const e1x = t[3] - t[0], e1y = t[4] - t[1], e1z = t[5] - t[2], e2x = t[6] - t[0], e2y = t[7] - t[1], e2z = t[8] - t[2];
      const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det, tx = o[0] - t[0], ty = o[1] - t[1], tz = o[2] - t[2], u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt > 0.02 && tt < 0.985) return t[12];
    }
  }
  return null;
}
function eye(R, hx, hy, hz, face, viewH) {
  const yaw = R.yaw + (R.yawLead ?? 0.03) * face, pitch = R.pitch, dist = R.dist, lookY = R.lookY, leadX = (R.leadX ?? 0) * face, leadZ = R.leadZ ?? 0;
  let tx = hx + leadX, tz = 130 + (hz - 130) * R.zFollow + leadZ; const ck = R.center?.k ?? 0; if (ck > 0.001 && R.center) { tx += (R.center.x - tx) * ck; tz += (R.center.z - tz) * ck; }
  const tall = Math.max(0, viewH - 540), ly = hy + lookY + tall * (R.tallK ?? 0.4), cp = Math.cos(pitch), sp = Math.sin(pitch);
  let px = tx - Math.sin(yaw) * cp * dist; const py = ly + sp * dist, pz = tz - Math.cos(yaw) * cp * dist;
  px = Math.max(R.minX ?? -1e5, Math.min(R.maxX ?? 1e5, px));
  return [px, py, pz];
}
const cluster = (pts, d = 30) => { const cl = []; for (const p of pts) { let c = cl.find((c) => p[0] >= c.x0 - d && p[0] <= c.x1 + d && p[1] >= c.z0 - d && p[1] <= c.z1 + d); if (!c) { c = { n: 0, x0: p[0], x1: p[0], z0: p[1], z1: p[1], tex: new Set() }; cl.push(c); } c.n++; c.tex.add(p[2]); c.x0 = Math.min(c.x0, p[0]); c.x1 = Math.max(c.x1, p[0]); c.z0 = Math.min(c.z0, p[1]); c.z1 = Math.max(c.z1, p[1]); } return cl.sort((a, b) => b.n - a.n); };
const RAY_STATES = {
  belltower_now: [{}], ossuary_now: [{}, { wedge_stone: true, knells_hung: true }, { wedge_wood: true }], ossuary_past: [{}, { wedge_stone: true, knell_1: true, knell_2: true, knell_3: true, knell_4: true, queen_fled: true }, { wedge_wood: true }],
  graveyard_now: [{ bell_hung: true, ossuary_open: true }], graveyard_past: [{ bell_hung: true }],
};
if (ONLY.includes('B')) {
  console.log('== B. hero hidden from the camera: every standable cell, every spawn seeded ==');
  for (const [id, states] of Object.entries(RAY_STATES)) for (const fl of states) {
    const a = await AREAS[id](fl), W = compileEnv(a.stage), key = id + '@' + stateName(fl);
    const seeds = [...Object.values(a.spawns).map((s) => [s.x, s.z]), ...(a.stage.hookPoints ?? []).filter((h) => h.to).map((h) => h.to)];
    const g = reachGrid(W, 0, 0, 14, { noStart: true, seeds, hooks: a.stage.hookPoints ?? [] }), TG = triGrid(W);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const b of W.boxes) if (b.walk) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1); }
    const cells = []; for (let x = x0 + 10; x < x1; x += 20) for (let z = z0 + 10; z < z1; z += 20) if (g.reachable(x, z)) cells.push([x, z, groundAt(W, x, z)]);
    const r = out[key] = {};
    for (const [dev, viewH] of [['fold_open', 726], ['phone2', 540]]) {
      const hid = [], bySec = {}; let n = 0, part = 0;
      for (const c of cells) {
        const sec = sectionAt(W, c[0], c[1]); if (!sec?.cam) continue; n++; const S = bySec[sec.id] ??= { tested: 0, hidden: 0, part: 0 }; S.tested++;
        let worst = 0, tex = null;
        for (const face of [1, -1]) { const o = eye(sec.cam, c[0], c[2], c[1], face, viewH); let k = 0; for (const hy of [6, 52, 100]) { const t = blockedRay(TG, o, [c[0], c[2] + hy, c[1]]); if (t) { k++; tex = t; } } worst = Math.max(worst, k); }
        if (worst === 3) { hid.push([c[0], c[1], tex, sec.id]); S.hidden++; } else if (worst === 2) { part++; S.part++; }
      }
      r[dev] = { tested: n, hidden: hid.length, twoOfThree: part, bySec, clusters: cluster(hid).slice(0, 10).map((q) => ({ n: q.n, x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, tex: [...q.tex].join(',') })) };
      console.log(`[${key}] ${dev}: hidden ${hid.length} of ${n} cells (2 of 3 rays: ${part}) — ` + Object.entries(bySec).map(([s, v]) => `${s} ${v.hidden}/${v.tested}`).join(' · '));
      if (hid.length) console.log('      ' + r[dev].clusters.map((c) => `x ${c.x0}..${c.x1} z ${c.z0}..${c.z1} (${c.n}) [${c.tex}]`).join(' | '));
    }
  }
}

// ───────── C. the two nights of the ossuary ─────────
if (ONLY.includes('C')) {
  console.log('== C. ossuary: the same room twice ==');
  const sig = (P) => [P.t, P.mesh ?? '', P.x, P.z, P.y ?? 0, P.w ?? P.r ?? '', P.d ?? '', P.h ?? ''].join(' ');
  for (const fl of [{}, { wedge_stone: true }, { wedge_wood: true }]) {
    const n = await AREAS.ossuary_now(fl), p = await AREAS.ossuary_past(fl), st = stateName(fl);
    const fixed = (a) => new Set(a.stage.parts.filter((P) => ['floor', 'wall', 'pillar', 'stairs', 'block', 'blocker'].includes(P.t)).map(sig));
    const A = fixed(n), B = fixed(p), onlyN = [...A].filter((s) => !B.has(s)), onlyP = [...B].filter((s) => !A.has(s));
    console.log(`[${st}] floors/walls/pillars/blocks: tonight ${A.size}, 1697 ${B.size}; only tonight: ${onlyN.join(' | ') || 'none'}; only 1697: ${onlyP.join(' | ') || 'none'}`);
    const props = (a) => new Map(a.stage.parts.filter((P) => (P.t === 'prop' || P.t === 'deco') && P.mesh).map((P) => [`${P.mesh} ${P.x} ${P.z}`, P]));
    const pn = props(n), pp = props(p), both = [...pn.keys()].filter((k) => pp.has(k));
    console.log(`      props at the same spot in both nights: ${both.length} (${[...new Set(both.map((k) => k.split(' ')[0]))].join(', ')}); only tonight ${pn.size - both.length} (${[...new Set([...pn.keys()].filter((k) => !pp.has(k)).map((k) => k.split(' ')[0]))].join(', ')}); only 1697 ${pp.size - both.length} (${[...new Set([...pp.keys()].filter((k) => !pn.has(k)).map((k) => k.split(' ')[0]))].join(', ')})`);
    console.log(`      sections ${JSON.stringify(n.stage.sections.map((s) => [s.id, s.z0, s.z1])) === JSON.stringify(p.stage.sections.map((s) => [s.id, s.z0, s.z1])) ? 'identical' : 'DIFFER'} · spawns ${JSON.stringify(n.spawns) === JSON.stringify(p.spawns) ? 'identical' : 'DIFFER'} · lights tonight ${compileEnv(n.stage).lights.length} / 1697 ${compileEnv(p.stage).lights.length}`);
    // where can the hero get, from the entry, using walking + jumping + bell crossings between the two nights?
    const Wn = compileEnv(n.stage), Wp = compileEnv(p.stage), bells = n.interact.filter((i) => i.kind === 'bell' && i.event === 'bell.ring');
    let seedsN = [[n.spawns.entry.x, n.spawns.entry.z]], seedsP = [], gN, gP, grew = true, rounds = 0;
    while (grew && rounds++ < 8) {
      grew = false; gN = reachGrid(Wn, 0, 0, 14, { noStart: true, seeds: seedsN }); gP = seedsP.length ? reachGrid(Wp, 0, 0, 14, { noStart: true, seeds: seedsP }) : null;
      for (const b of bells) {
        const inN = gN.near(b.x, b.z, b.r), inP = gP?.near(b.x, b.z, b.r);
        if (inN && !seedsP.some((s) => s[2] === b.id)) { const q = reachGrid(Wp, 0, 0, 14, { noStart: true, seeds: Object.values(p.spawns).map((s) => [s.x, s.z]) }).near(inN[0], inN[1], 60) ?? inN; seedsP.push([q[0], q[1], b.id]); grew = true; }
        if (inP && !seedsN.some((s) => s[2] === b.id)) { const q = reachGrid(Wn, 0, 0, 14, { noStart: true, seeds: Object.values(n.spawns).map((s) => [s.x, s.z]) }).near(inP[0], inP[1], 60) ?? inP; seedsN.push([q[0], q[1], b.id]); grew = true; }
      }
    }
    const secReach = (a, g) => a.stage.sections.map((s) => `${s.id}${g && g.anyIn(110, 1090, Math.max(s.z0, 0) + 10, s.z1 - 10) ? '' : '✗'}`).join(' ');
    console.log(`      route from the entry with bell crossings (${rounds} rounds): tonight ${secReach(n, gN)} · 1697 ${secReach(p, gP)}`);
    for (const t of n.triggers) if (!gN.anyIn(t.x0, t.x1, t.z0, t.z1)) console.log(`      !! tonight trigger ${t.id} (${t.event}) cannot be reached in this state`);
    for (const it of [...n.interact.map((i) => [i, gN, 'tonight']), ...p.interact.map((i) => [i, gP, '1697'])]) if (!it[1]?.near(it[0].x, it[0].z, it[0].r ?? 60)) console.log(`      !! ${it[2]} interact ${it[0].id} (${it[0].event}) cannot be reached in this state`);
    const boss = n.enemies.find((e) => e.kind === 'banshee_queen'); if (boss && !gN.reachable(boss.x, boss.z - 100)) console.log('      !! tonight the boss hall cannot be reached in this state');
  }
}

// ───────── D. the boss hall ─────────
if (ONLY.includes('D')) {
  console.log('== D. boss hall (section boss + posts, z 3000..3900) ==');
  const QR = 30, HR = 14;
  for (const [id, fl] of [['ossuary_now', {}], ['ossuary_now', { knells_hung: true }], ['ossuary_past', { queen_fled: true }]]) {
    const a = await AREAS[id](fl), W = compileEnv(a.stage), key = id + '@' + stateName(fl);
    const solids = W.boxes.filter((b) => b.solid && !b.walk && b.z1 > 2960 && b.z0 < 3920 && b.y1 > STEP_UP && b.y0 < 60);
    const free = (x, z, r) => x - r >= 100 && x + r <= 1100 && !solids.some((b) => x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1);
    const inner = solids.filter((b) => b.x0 > 100 && b.x1 < 1100 && b.z0 >= 2960 && b.z1 < 3900);
    console.log(`[${key}] solid things on the floor (not walls): ${inner.map((b) => `(${Math.round((b.x0 + b.x1) / 2)},${Math.round((b.z0 + b.z1) / 2)}) ${Math.round(b.x1 - b.x0)}x${Math.round(b.z1 - b.z0)} h${Math.round(b.y1)}`).join(' ')}`);
    // can the hero go round the queen standing at (bx, bz)? ring of radius rho around her fully standable
    const res = {};
    for (const rho of [QR + HR + 6, 100, 150]) {
      let n = 0, okN = 0; const badPts = [];
      for (let bx = 140; bx <= 1060; bx += 20) for (let bz = 3040; bz <= 3860; bz += 20) {
        if (!free(bx, bz, QR)) continue; n++;
        let ok = true; for (let k = 0; k < 48 && ok; k++) { const t = k / 48 * Math.PI * 2; ok = free(bx + Math.cos(t) * rho, bz + Math.sin(t) * rho, HR); }
        if (ok) okN++; else badPts.push([bx, bz]);
      }
      res[rho] = { n, okN }; const zs = badPts.filter((p) => p[0] > 100 + rho + HR + 20 && p[0] < 1100 - rho - HR - 20 && p[1] < 3900 - 90 - rho - HR - 20 && p[1] > 3000 + rho + HR + 20);
      console.log(`      ring ${rho}: free all the way round at ${okN} of ${n} boss positions (${Math.round(okN / n * 100)}%); blocked away from the walls at ${zs.length} positions${zs.length ? ' e.g. ' + cluster(zs.map((p) => [p[0], p[1], ''])).slice(0, 6).map((c) => `x ${c.x0}..${c.x1} z ${c.z0}..${c.z1} (${c.n})`).join(' | ') : ''}`);
    }
    const q = a.enemies.find((e) => e.kind === 'banshee_queen'); if (q) { const d = Math.min(...solids.map((b) => Math.hypot(Math.max(b.x0 - q.x, 0, q.x - b.x1), Math.max(b.z0 - q.z, 0, q.z - b.z1)))); console.log(`      queen starts at (${q.x},${q.z}): nearest solid ${Math.round(d)} away (needs ${QR + 2 * HR} for the hero to pass behind her)`); }
    // dead-end pockets: standable cells whose free run is short in BOTH axes
    const pockets = [];
    for (let x = 110; x <= 1090; x += 10) for (let z = 3010; z <= 3890; z += 10) {
      if (!free(x, z, HR)) continue;
      let l = 0, r = 0, u = 0, d = 0; while (l < 200 && free(x - l - 10, z, HR)) l += 10; while (r < 200 && free(x + r + 10, z, HR)) r += 10; while (u < 200 && free(x, z + u + 10, HR)) u += 10; while (d < 200 && free(x, z - d - 10, HR)) d += 10;
      if (l + r < 2 * QR + 10 && u + d < 2 * QR + 10) pockets.push([x, z, '']); else if ((l + r < 50 && Math.min(u, d) < 20) || (u + d < 50 && Math.min(l, r) < 20)) pockets.push([x, z, '']);
    }
    console.log(`      pockets (dead ends narrower than the queen, where the hero can be shut in): ${pockets.length} cells${pockets.length ? ' — ' + cluster(pockets, 15).slice(0, 12).map((c) => `x ${c.x0}..${c.x1} z ${c.z0}..${c.z1} (${c.n})`).join(' | ') : ''}`);
    out['hall:' + key] = { inner: inner.length, res, pockets: pockets.length };
  }
}
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(out, null, 1));
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nno hook problems');
