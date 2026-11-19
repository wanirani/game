// WHIP lane — proof that removing Math.hypot from src/v2/whip changed nothing: the lash (nodes) and its mesh (vertex floats) are compared bit
// for bit, tick by tick, between the whip module of commit --base run the way the scene ran it (Math.hypot swapped for a square root of squares
// while the whip's code runs) and today's module, both driven by the same seeded play of the real rules (every move, cracks, hook, charge).
//   node tools/v2/whip_bits.mjs [--base 9468e00] [--ticks 3000] [--out /tmp/claude-0/v2/whip] [--still] [--nohyp]
// WHIP2 (2026-11-19) changed the lash ON PURPOSE (a strike runs on the rules' clock, the lash lands on the nearest of several struck, the streak keeps three
// points a tick, the mesh is built from whip.drawn): against a base from before that the full comparison cannot pass any more. Two uses remain:
//   --still   the same seeded play WITHOUT attack presses (run, roll, jump, hook, call): the lash NODES must still be bit for bit those of --base 9468e00 -
//             nothing outside a strike was meant to change (the streak and the mesh are not compared: their layout and the drawn hand end changed on purpose)
//   --base <a commit that already has WHIP2's lash> --nohyp   everything (nodes, streak, mesh floats) bit for bit: the proof for changes that only remove garbage
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', '9468e00'), N = Number(arg('ticks', 3000)), OUT = arg('out', '/tmp/claude-0/v2/whip'), ROOT = new URL('../..', import.meta.url).pathname, STILL = process.argv.includes('--still'), NOHYP = process.argv.includes('--nohyp');
const dir = `${OUT}/base_src`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
execSync(`git archive ${BASE} src/v2 | tar -x -C ${dir}`, { cwd: ROOT, maxBuffer: 1 << 28 });
const NEW = await import(ROOT + 'src/v2/whip/index.js'), OLD = await import(dir + '/src/v2/whip/index.js'), P = await import(ROOT + 'src/v2/play/index.js');
const HYP0 = Math.hypot, HYP3 = function (x, y, z) { return arguments.length > 3 ? HYP0.apply(Math, arguments) : Math.sqrt(x * x + y * y + (z === undefined ? 0 : z * z)); };
let seed = 20261119; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; Math.random = rnd;
const sim = new P.Sim(P.flatArena(900, 600, [{ kind: 'melee', x: 90, z: 0, active: true }, { kind: 'corpse', x: -80, z: 60, active: true }, { kind: 'bat', x: 60, z: -90, active: true }]), {});
sim.hookPoints.push({ id: 'r', x: 260, y: 0, z: 60, to: [320, 80] });
const mk = (M) => { const w = M.createWhip({ tier: 'mid' }), I = M.meshInfo(w); return { M, w, vtx: new Float32Array(I.floats), tmp: new Float32Array(w.n * 3), hand: { x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0, bx: 0, by: 0, bz: 0, br: 12, bh: 104, fx: 1, fz: 0, ground: 0 }, C: { x: 0, y: 0, z: 0, strength: 1 }, pull: null, P: { x: 0, y: 0, z: 0, r: 12 } }; };
const A = mk(OLD), B = mk(NEW); let crack = null, pullE = null, stopT = 0;
sim.hooks.hit = (e, dmg, mv, x, y, z) => { crack = { x, y, z, k: { L: 0.7, M: 1, H: 1.3, F: 1.6 }[mv.str] ?? 1 }; stopT = 3; };
sim.hooks.pull = (e) => { pullE = e; };
const same = (a, b) => { const x = new Uint32Array(a.buffer, a.byteOffset, a.length), y = new Uint32Array(b.buffer, b.byteOffset, b.length); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return i; return -1; };
let bad = 0, firstBad = '', moves = {}, cracks = 0, frozen = 0;
for (let t = 0; t < N; t++) {
  const h = sim.hero, ph = t % 240; h.hp = 100; for (const e of sim.enemies) { e.hp = Math.max(e.hp, 40); }
  const inp = { mx: ph < 40 ? 1 : ph > 150 && ph < 170 ? -0.6 : 0, mz: ph > 100 && ph < 120 ? 0.8 : 0, attack: (ph > 40 && ph < 100 && ph % 9 === 0) || ph === 130 || ph === 141, attackHeld: ph >= 175 && ph < 225, dash: ph === 120, jump: ph === 125, jumpHeld: ph >= 125 && ph < 132, skill: ph === 232, guard: false };
  if (ph === 175) inp.attack = true;
  if (STILL) { inp.attack = false; inp.attackHeld = false; }
  crack = null; const frozenTick = stopT > 0; if (frozenTick) { stopT--; frozen++; } else { sim.stop = 0; sim.update(1 / 60, inp); sim.stop = 0; }
  if (h.move) moves[h.move.id] = (moves[h.move.id] ?? 0) + 1; if (h.act) moves[h.act] = (moves[h.act] ?? 0) + 1; if (h.charging) moves.charge = (moves.charge ?? 0) + 1;
  for (const S of [A, B]) {
    const H = S.hand, a = t * 0.07; H.x = h.x + h.dirX * 14 + Math.cos(a) * 6; H.y = h.y + 62 + Math.sin(a * 1.3) * 10; H.z = h.z + h.dirZ * 14 + Math.sin(a) * 6; H.dx = Math.cos(a * 0.9) * 0.6 + h.dirX * 0.5; H.dy = 0.5 + 0.4 * Math.sin(a * 0.7); H.dz = Math.sin(a * 0.9) * 0.6 + h.dirZ * 0.5;
    H.bx = h.x; H.by = h.y; H.bz = h.z; H.fx = h.dirX; H.fz = h.dirZ; H.ground = 0;
    let pull = null; if (pullE) { if (pullE.pullT > 0 || h.pullT > 0) { S.P.x = pullE.x; S.P.y = pullE.y + pullE.h * 0.55; S.P.z = pullE.z; S.P.r = Math.max(8, pullE.r * 0.55); pull = S.P; } }
    const old = S === A; if (old && !NOHYP) Math.hypot = HYP3;
    try { if (crack) { S.C.x = crack.x; S.C.y = crack.y; S.C.z = crack.z; S.C.strength = crack.k; S.w.set('crack', S.C); } S.M.driveWhip(S.w, h, P.TUNE, pull); S.w.update(frozenTick ? 0 : 1 / 60, H); S.M.writeWhipMesh(S.w, S.vtx, 0.5, S.tmp); } finally { Math.hypot = HYP0; }
  }
  if (pullE && !(pullE.pullT > 0 || h.pullT > 0)) pullE = null; if (crack) cracks++;
  const i1 = same(A.w.nodes, B.w.nodes), i2 = STILL ? -1 : A.vtx.length !== B.vtx.length ? 0 : same(A.vtx, B.vtx), i3 = STILL ? -1 : A.w.hist.length !== B.w.hist.length ? 0 : same(A.w.hist, B.w.hist);
  if (i1 >= 0 || i2 >= 0 || i3 >= 0) { bad++; if (!firstBad) firstBad = `tick ${t}: nodes ${i1} mesh ${i2} streak ${i3} (mode ${A.w.mode}/${B.w.mode})`; }
}
console.log(`whip_bits: ${N} ticks of seeded play (moves seen: ${Object.entries(moves).map(([k, v]) => k + ' ' + v).join(' · ')}; ${cracks} cracks, ${frozen} frozen ticks)`);
console.log(bad === 0 ? (STILL ? `PASS without a strike the lash nodes are bit for bit the same on every tick: module of ${BASE} = today's module` : `PASS the lash nodes, the tip streak and the ${A.vtx.length} mesh floats are bit for bit the same on every tick: module of ${BASE}${NOHYP ? '' : ' with Math.hypot swapped (as the scene ran it)'} = today's module`) : `FAIL ${bad} ticks differ — first: ${firstBad}`);
process.exit(bad ? 1 : 0);
