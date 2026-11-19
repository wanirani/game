// WORLD (THINGS, 2026-11-19) - DROP-IN: no body is left standing inside a solid after it came down from a higher floor.  docs/v2/ENV_KIT.md 25
//
// The rules (src/v2/play/collide.js, sim.js _fall): a floor is a box with `walk`; a solid without `walk` (a prop's footprint, a low heap) holds a body
// that comes at it from the side, but a body ABOVE it (feet + STEP_UP over its top) passes over it and, when it comes down there, lands on the floor
// underneath - inside the box (groundAt does not see a box without `walk`). A body inside a solid may walk out in any direction, so the game goes on;
// it looks broken (the hero half buried in the fallen stair of graveyard_now, 11-19).
//
// What this file finds, with the rules' own moveXZ / groundAt and the same gravity (TUNE.gravity 3000, pit at -170):
//   every reachable place (the lane's reach grid, flooded from every spawn, entry spawn, whip-ring landing and crossing bell; a 10 px lattice) from which a
//   body can leave its floor over an edge with a drop of more than STEP_DOWN WITHOUT a jump - walking or running off, rolled or knocked off - and every place
//   within REACH 160 px of that edge where it can come down: flights in 9 directions about the way off, landing distances 0..160 in steps of 8. A landing
//   whose body square (r 14) overlaps a solid without `walk` that stands higher than a step over his feet is a DROP-IN.
//   A thing is cured when a body lands ON it (a top with `walk`), or BESIDE it (it is as tall as the floor above + a step: the body meets its side in the
//   air and slides down), or when it stands further than the reach.
//   Not counted (said in ENV_KIT 25): a deliberate jump off the edge (it clears anything lower than the floor + 130, like a hop from the ground onto any low prop).
//   Breakables (jars, crates: the game's own dynamic solids, AREA_FORMAT 15) are listed apart - they are not stage parts.
//
//   node tools/v2/world_dropin.mjs [--areas a,b] [--reach 160] [--json out.json]      exit 1 when the list is not empty
//   node tools/v2/world_dropin.mjs --knock [--seed 7]                                 the seeded test: the real Sim, 40 places along the ossuary terrace of
//                                                                                     graveyard_now / _past, a blow that knocks the hero off; he must stand free
import fs from 'node:fs';
import { loadPropsNode } from './world_node.mjs';

const STEP_UP = 18, STEP_DOWN = 20, GRAV = 3000, PIT = -170, HR = 14, HH = 92, EPS = 0.1;
export const DROP_REACH = 160;
/** the kinds of src/v2/play/breakables.js BREAK_KINDS: half-size of the square box, height */
const BRK = { jar: [17, 66], pot: [19, 40], urn: [11, 32], crate: [27, 52], barrel: [23, 70] };

const insideOf = (boxes, x, z, y, r = HR - EPS) => { for (const b of boxes) if (b.solid && !b.walk && x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.y1 > y + STEP_UP && b.y0 < y + 60) return b; return null; };
const nameOf = (b) => { const P = b.part; if (b.brk) return `breakable ${b.brk.kind} (${b.brk.x}, ${b.brk.z})`; if (!P) return `box x ${Math.round(b.x0)}..${Math.round(b.x1)} z ${Math.round(b.z0)}..${Math.round(b.z1)}`; return `${P.t}${P.mesh ? ' ' + P.mesh : ''}${P.kind ? ':' + P.kind : ''} (${Math.round(P.x ?? (b.x0 + b.x1) / 2)}, ${Math.round(P.z ?? (b.z0 + b.z1) / 2)})`; };

/**
 * -> { edges, flights, places: [{ what, box: [x0, x1, z0, z1], top, n, from: [x, z, y], lands: [x, z, y] }], breakables: [same] }
 * mods = { groundAt, moveXZ } of src/v2/b/world.js, reachGrid of src/v2/world/reach.js
 */
export function dropIn(area, W, mods, opt = {}) {
  const { groundAt, moveXZ, reachGrid } = mods, REACH = opt.reach ?? DROP_REACH, C = 10;
  const bells = (area.interact ?? []).filter((it) => it.kind === 'bell' && it.event === 'bell.ring');
  const seeds = [...Object.values(area.spawns).map((p) => [p.x, p.z]), ...(area.stage.hookPoints ?? []).filter((h) => h.to).map((h) => h.to), ...bells.map((b) => [b.x, b.z])];
  const G = reachGrid(W, 0, 0, 14, { noStart: true, seeds, hooks: area.stage.hookPoints ?? [] });
  const brk = (area.breakables ?? []).map((q) => { const [r, h] = BRK[q.kind] ?? [16, 40], g = groundAt(W, q.x, q.z, q.y != null ? q.y + STEP_UP : Infinity), y = Number.isFinite(g) ? g : 0; return { x0: q.x - r, x1: q.x + r, z0: q.z - r, z1: q.z + r, y0: y, y1: y + h, solid: true, walk: false, brk: q }; });
  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9; for (const b of W.boxes) if (b.walk) { bx0 = Math.min(bx0, b.x0); bx1 = Math.max(bx1, b.x1); bz0 = Math.min(bz0, b.z0); bz1 = Math.max(bz1, b.z1); }
  const hits = new Map(), bhits = new Map(); let edges = 0, flights = 0;
  const note = (M, b, from, at) => { let h = M.get(b); if (!h) M.set(b, h = { what: nameOf(b), box: [b.x0, b.x1, b.z0, b.z1].map((v) => Math.round(v)), top: Math.round(b.y1), n: 0, from: from.map((v) => Math.round(v)), lands: at.map((v) => Math.round(v)) }); h.n++; };
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
  for (let x = bx0 + C / 2; x < bx1; x += C) for (let z = bz0 + C / 2; z < bz1; z += C) {
    if (!G.reachable(x, z)) continue;
    const g = groundAt(W, x, z); if (!Number.isFinite(g) || insideOf(W.boxes, x, z, g)) continue;
    for (const [dx, dz] of D8) {
      const qx = x + dx * 15, qz = z + dz * 15, g2 = groundAt(W, qx, qz, g + STEP_UP);
      if (g2 >= g - STEP_DOWN || !Number.isFinite(g2)) continue;                                   // level, a step, or a pit (the pit rule takes him back)
      const e = { x, z, y: g, r: HR, h: HH }; moveXZ(W, e, dx * 15, 0); moveXZ(W, e, 0, dz * 15);
      if (Math.abs(e.x - qx) > 0.5 || Math.abs(e.z - qz) > 0.5) continue;                           // something holds him on the floor here (a rail, a wall)
      edges++;
      const H = g - g2, tf = Math.sqrt(2 * H / GRAV), a0 = Math.atan2(dz, dx);
      for (let k = -4; k <= 4; k++) for (let L = 0; L <= REACH; L += 8) {
        const a = a0 + k * Math.PI / 8, v = L / tf, b = { x: qx, z: qz, y: g, r: HR, h: HH }; let vy = 0, landed = false; flights++;
        for (let t = 0; t < 240; t++) {
          moveXZ(W, b, Math.cos(a) * v / 60, 0); moveXZ(W, b, 0, Math.sin(a) * v / 60);
          const gg = groundAt(W, b.x, b.z, b.y + STEP_UP); vy -= GRAV / 60; if (vy < -1500) vy = -1500; b.y += vy / 60;
          if (b.y <= gg) { b.y = gg; landed = true; break; }
          if (b.y < PIT) break;
        }
        if (!landed) continue;
        const s = insideOf(W.boxes, b.x, b.z, b.y); if (s) note(hits, s, [x, z, g], [b.x, b.z, b.y]);
        const s2 = insideOf(brk, b.x, b.z, b.y); if (s2) note(bhits, s2, [x, z, g], [b.x, b.z, b.y]);
      }
    }
  }
  const list = (M) => [...M.values()].sort((p, q) => q.n - p.n);
  return { edges, flights, places: list(hits), breakables: list(bhits) };
}

/** the seeded test: a blow knocks the hero off the ossuary terrace at n places along its edge (the real Sim); he must come to rest on ground, clear of every solid */
export async function knockTest(areaId, flags, { n = 40, seed = 7 } = {}) {
  const { AREAS } = await import('../../src/v2/world/index.js'), { compileEnv } = await import('../../src/v2/env/build.js'), { Sim } = await import('../../src/v2/play/sim.js');
  const area = await AREAS[areaId](flags), W0 = compileEnv(area.stage), W = { ...W0, spawns: [], hookPoints: area.stage.hookPoints ?? [] };
  let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const terr = W.boxes.filter((b) => b.walk && b.part?.t === 'floor' && b.y1 >= 100).sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))[0];
  const res = [];
  for (let i = 0; i < n; i++) {
    const sim = new Sim(W, {}), h = sim.hero, z = terr.z0 + 2 + rnd() * 16; let x = terr.x0 + 30 + (terr.x1 - terr.x0 - 60) * (i + 0.5) / n;   // 2..18 px behind the edge: most blows carry him off
    while (insideOf(W.boxes, x, z, terr.y1)) x += 30;   // (not from inside the ring's post)
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 1.6, kb = [150, 240, 300, 320, 380][Math.floor(rnd() * 5)], str = kb >= 300 ? 'H' : 'M';
    h.x = x; h.z = z; h.y = terr.y1; h.vx = h.vz = h.vy = 0; h.onGround = true; h.ifr = 0; h.safe.x = x; h.safe.z = z; h.safe.y = terr.y1;
    for (let t = 0; t < 3; t++) sim.update(1 / 60);
    const y0 = h.y, ok0 = !insideOf(W.boxes, h.x, h.z, h.y);
    sim.hurtHero(1, Math.cos(ang), Math.sin(ang), { atk: { knock: kb, str } });
    let fell = false, minY = h.y; for (let t = 0; t < 200; t++) { sim.update(1 / 60); if (!h.onGround) fell = true; if (h.y < minY) minY = h.y; }
    const box = insideOf(W.boxes, h.x, h.z, h.y);
    res.push({ i, from: [Math.round(x), Math.round(z), Math.round(y0)], knock: kb, dir: [+Math.cos(ang).toFixed(2), +Math.sin(ang).toFixed(2)], fell, rest: [+h.x.toFixed(1), +h.z.toFixed(1), +h.y.toFixed(1)], onGround: h.onGround, startFree: ok0, inSolid: box ? nameOf(box) : null });
  }
  return { area: areaId, flags, edge: [terr.x0, terr.x1, terr.z0, terr.y1], res };
}

if (process.argv[1] && process.argv[1].endsWith('world_dropin.mjs')) {
  loadPropsNode();
  const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
  if (args.knock) {
    let bad = 0;
    for (const [id, fl] of [['graveyard_now', {}], ['graveyard_past', {}], ['graveyard_past', { bell_hung: true }], ['graveyard_now', { bell_hung: true }]]) {
      const r = await knockTest(id, fl, { seed: +(args.seed ?? 7), n: +(args.n ?? 40) }), fell = r.res.filter((q) => q.fell).length, ins = r.res.filter((q) => q.inSolid || !q.onGround);
      console.log(`[${id}${Object.keys(fl).length ? '@' + Object.keys(fl).join('+') : ''}] terrace x ${r.edge[0]}..${r.edge[1]} edge z ${r.edge[2]} y ${r.edge[3]}: ${r.res.length} blows (knock 150..380, +-46 deg about straight off), ${fell} left the terrace, standing free at rest ${r.res.length - ins.length} of ${r.res.length}`);
      for (const q of ins) { bad++; console.log(`   FAIL #${q.i} from (${q.from}) knock ${q.knock} dir (${q.dir}) -> rest (${q.rest}) ${q.inSolid ? 'inside ' + q.inSolid : 'not on ground'}`); }
      if (args.v) for (const q of r.res) console.log(`   #${q.i} from (${q.from}) knock ${q.knock} dir (${q.dir}) fell ${q.fell} -> (${q.rest})`);
    }
    console.log(bad ? `\nFAIL (${bad})` : '\nALL OK (every knocked body stands free)'); process.exit(bad ? 1 : 0);
  }
  const { AREAS, areaStates, stateName } = await import('../../src/v2/world/index.js'), { reachGrid } = await import('../../src/v2/world/reach.js'), { compileEnv } = await import('../../src/v2/env/build.js'), { groundAt, moveXZ } = await import('../../src/v2/b/world.js');
  const LIST = String(args.areas || Object.keys(AREAS).join(',')).split(','), out = {}; let bad = 0, nb = 0;
  for (const id of LIST) {
    const seen = new Set();
    for (const flags of areaStates(id)) {
      const st = stateName(flags), a = await AREAS[id](flags), W = compileEnv(a.stage);
      const geo = W.boxes.map((b) => [b.x0, b.x1, b.z0, b.z1, b.y0, b.y1, +b.solid, +b.walk].join(',')).join('|') + '#' + JSON.stringify(a.breakables ?? []) + JSON.stringify(a.stage.hookPoints ?? []);
      if (seen.has(geo)) continue; seen.add(geo);
      const r = dropIn(a, W, { groundAt, moveXZ, reachGrid }, { reach: +(args.reach ?? DROP_REACH) }); out[`${id}@${st}`] = r; bad += r.places.length; nb += r.breakables.length;
      console.log(`[${id}@${st}] edges ${r.edges} · flights ${r.flights} · drop-in places ${r.places.length}${r.breakables.length ? ` · breakables a body can come down into: ${r.breakables.length}` : ''}`);
      for (const p of r.places) console.log(`   DROP-IN ${p.what} box x ${p.box[0]}..${p.box[1]} z ${p.box[2]}..${p.box[3]} top ${p.top}: ${p.n} landings, e.g. off (${p.from}) down to (${p.lands})`);
      for (const p of r.breakables) console.log(`   (breakable) ${p.what} top ${p.top}: ${p.n} landings, e.g. off (${p.from})`);
    }
  }
  if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(out, null, 1));
  console.log(bad ? `\nFAIL: ${bad} drop-in place(s)` : `\nALL OK (drop-in list empty${nb ? `; ${nb} breakable(s) listed apart` : ''})`);
  process.exit(bad ? 1 : 0);
}
