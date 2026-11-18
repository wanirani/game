// WHIP-VERIFY: break the whip simulation (node, no browser).   node --expose-gc tools/v2/whip_fuzz.mjs [--seed=N] [--quick]
//   A  systematic: every move interrupted at every tick by every other mode (all three tiers)
//   B  random, realistic hand (an arm's reach from the hero): mode changes at random, dt of 0, 1/240, 1/60, 1/30, 0.25, teleports of thousands of px
//   C  random, hostile hand (inside the body, under the ground, zero direction), a new mode EVERY tick, targets behind / inside the hero / at zero distance
// After every update: every number finite (nodes, speeds, tip, lash length, streak, the mesh), no node spacing over 115 % of rest length outside the taut
// line modes, nothing under the ground plane, a dt = 0 tick moves nothing. Then: bytes allocated per tick in steady state over all modes, time per tick.
import { createWhip, TRAIL_N } from '../../src/v2/whip/sim.js';
import { meshInfo, writeWhipMesh } from '../../src/v2/whip/mesh.js';
import { driveWhip } from '../../src/v2/whip/drive.js';
import { MOVES } from '../../src/v2/play/moves.js';
import { TUNE } from '../../src/v2/play/tune.js';

const argv = process.argv.slice(2), QUICK = argv.includes('--quick');
let seed = +((argv.find((a) => a.startsWith('--seed=')) || '').slice(7)) || 20261118;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd(), pick = (a) => a[(rnd() * a.length) | 0];
const DTS = [0, 1 / 240, 1 / 60, 1 / 60, 1 / 60, 1 / 30, 0.25];
const SWINGS = ['c1', 'c2', 'c3', 'sweep', 'whip', 'plunge', 'launcher', 'charge', 'far', 'nosuchmove'];
const DUR = (id) => (MOVES[id] ? Math.min(0.9, MOVES[id].dur) : id === 'charge' ? 0.95 : 0.62);

const V = { total: 0, byCat: {}, first: [] };
const stat = {}, worst = {};   // per mode: max spacing ratio, max len / L0, lowest node above the ground, fastest node
function bad(cat, ctx, detail) {
  V.total++; V.byCat[cat] = (V.byCat[cat] || 0) + 1;
  if ((V.first.filter((f) => f.cat === cat).length) < 4) V.first.push({ cat, ...ctx, detail });
}
let ticks = 0;
const before = new Float32Array(64);

function mkHand() { return { x: 0, y: 60, z: 0, dx: 0, dy: 1, dz: 0, bx: 0, by: 0, bz: 0, br: 12, bh: 104, fx: 1, fz: 0, ground: 0 }; }

/** all the checks after one update. ctx: where we are (for the report). realistic: the hand is where an arm can put it */
function check(w, hand, dt, ctx, S) {
  ticks++;
  const n = w.n, N = w.nodes, Vv = w.vel, line = (w.mode === 'hook' || w.mode === 'wrap') && w.tg.caught;
  const key = w.mode + (line ? '/taut' : '');
  const st = stat[key] || (stat[key] = { n: 0, seg: 0, len: 0, low: 1e9, v: 0, body: 0 });
  st.n++;
  let fin = Number.isFinite(w.len) && Number.isFinite(w.ext) && Number.isFinite(w.tip.x + w.tip.y + w.tip.z + w.tip.speed) && Number.isFinite(w.flash + w.glow + w.taut + w.spin + w.trailLive);
  for (let i = 0; i < n * 3 && fin; i++) if (!Number.isFinite(N[i]) || !Number.isFinite(Vv[i]) || !Number.isFinite(w.prev[i])) fin = false;
  for (let i = 0; i < TRAIL_N * 4 && fin; i++) if (!Number.isFinite(w.hist[i])) fin = false;
  if (!fin) { bad('not finite (sim)', ctx, `len ${w.len} ext ${w.ext} tip ${w.tip.x},${w.tip.y},${w.tip.z}`); return false; }
  // mesh
  if (S.vtx) {
    const nv = writeWhipMesh(w, S.vtx, S.alpha, S.tmp), m = nv * 10; let ok = nv === S.info.verts;
    for (let i = 0; i < m && ok; i++) if (!Number.isFinite(S.vtx[i])) ok = false;
    if (!ok) bad('not finite (mesh)', ctx, `verts ${nv}/${S.info.verts}`);
  }
  if (dt === 0) { for (let i = 0; i < n * 3; i++) if (N[i] !== before[i]) { bad('moved while dt = 0', ctx, `node ${(i / 3) | 0}`); break; } return true; }
  const seg = w.len / (n - 1), gy = hand.ground;
  let mx = 0, low = 1e9, vmax = 0, body = 0;
  for (let i = 1; i < n; i++) {
    const o = i * 3, d = Math.hypot(N[o] - N[o - 3], N[o + 1] - N[o - 2], N[o + 2] - N[o - 1]) / seg; if (d > mx) mx = d;
    if (N[o + 1] - gy < low) low = N[o + 1] - gy;
    const v = Math.hypot(Vv[o], Vv[o + 1], Vv[o + 2]); if (v > vmax) vmax = v;
    if (i > 2 && N[o + 1] > hand.by + 2 && N[o + 1] < hand.by + hand.bh * 0.95 && Math.hypot(N[o] - hand.bx, N[o + 2] - hand.bz) < hand.br - 0.5) body++;
  }
  if (mx > st.seg) st.seg = mx; if (w.len / w.L0 > st.len) st.len = w.len / w.L0; if (low < st.low) st.low = low; if (vmax > st.v) st.v = vmax; st.body += body;
  if (!line) {
    const rootIn = Math.hypot(w.root.x - hand.bx, w.root.z - hand.bz) < hand.br + 1 && w.root.y < hand.by + hand.bh, rootUnder = w.root.y < gy + 1.2;
    const why = rootUnder ? ' (lash root under the ground)' : rootIn ? ' (lash root inside the body cylinder)' : ctx.real ? (ctx.odd ? ' (realistic hand, odd target)' : '') : ' (hostile hand, other)';
    if (mx > 1.15) { bad('spacing over 115 %' + why, ctx, `${(mx * 100).toFixed(1)} % of ${seg.toFixed(2)} px, len ${w.len.toFixed(1)}`); const k2 = 'worst spacing' + why; if (!(worst[k2] >= mx)) worst[k2] = mx; }
    if (low < -0.01 && !rootUnder) bad('under the ground' + (ctx.real ? '' : ' (hostile hand)'), ctx, `${low.toFixed(2)} px`);
    if (body && ctx.real && !rootIn) bad('inside the body', ctx, `${body} nodes`);
  } else if (low < -0.01 && w.tg.y - 9 >= gy && w.root.y - 4 >= gy) bad('under the ground (taut line, hand and target above ground)', ctx, `${low.toFixed(2)} px`);
  if (vmax > 3401) bad('speed over the cap', ctx, vmax.toFixed(0));
  return true;
}

const P = { move: 'c1', t: 0, dirX: 1, dirZ: 0, hit: null, dur: 0, landT: null, x: null, y: 0, z: 0, r: 14, phase: 'throw', kind: 'short', style: 'coil', throwT: 0.16, level: 0, strength: 1 };
function target(hand, kind) {   // where the lash is sent
  const fx = hand.fx, fz = hand.fz, k = kind ?? ((rnd() * 9) | 0);
  if (k === 0) { const d = rr(60, 330); P.x = hand.bx + fx * d + rr(-40, 40); P.y = hand.by + rr(20, 200); P.z = hand.bz + fz * d + rr(-40, 40); }   // ahead
  else if (k === 1) { const d = rr(40, 300); P.x = hand.bx - fx * d; P.y = hand.by + rr(0, 120); P.z = hand.bz - fz * d; }                              // behind the hero
  else if (k === 2) { P.x = hand.bx; P.y = hand.by + 60; P.z = hand.bz; }                                                                                // inside the hero
  else if (k === 3) { P.x = hand.x + hand.dx * 11; P.y = hand.y + hand.dy * 11; P.z = hand.z + hand.dz * 11; }                                             // zero distance from the lash root
  else if (k === 4) { P.x = hand.x; P.y = hand.y; P.z = hand.z; }                                                                                         // on the grip
  else if (k === 5) { P.x = hand.bx + fx * rr(20, 200); P.y = hand.ground; P.z = hand.bz + fz * rr(20, 200); }                                             // on the ground
  else if (k === 6) { P.x = hand.x; P.y = hand.y + rr(50, 300); P.z = hand.z; }                                                                           // straight above the hand
  else if (k === 7) { P.x = hand.bx + rr(-5000, 5000); P.y = hand.by + rr(-500, 2000); P.z = hand.bz + rr(-5000, 5000); }                                   // very far
  else { P.x = hand.bx + fx * rr(60, 250); P.y = hand.ground - rr(5, 80); P.z = hand.bz + fz * rr(60, 250); }                                             // under the ground
  return k;
}
/** apply one mode. m: name; st: per-run state { id, t } */
function setMode(w, hand, m, st, dt) {
  P.dirX = hand.fx; P.dirZ = hand.fz; P.hit = null; P.dur = 0; P.landT = null; P.x = null; P.t = 0;
  if (m === 'coil') { P.style = 'coil'; w.set('rest', P); }
  else if (m === 'hang') { P.style = 'hang'; w.set('rest', P); }
  else if (m === 'stow') w.set('stow');
  else if (m === 'spin') { P.level = rnd(); w.set('spin', P); }
  else if (m === 'swing') { st.t += dt; P.move = st.id; P.t = st.t; if (st.id === 'far' && st.aim) { P.x = st.ax; P.y = st.ay; P.z = st.az; } if (st.id === 'plunge' && st.t > st.land) P.landT = st.land; w.set('swing', P); }
  else if (m === 'ringS' || m === 'ringL') { st.t += dt; P.kind = m === 'ringS' ? 'short' : 'long'; P.t = st.t; w.set('ring', P); }
  else if (m === 'crack') { target(hand, st.tk); P.strength = pick([0.7, 1, 1.3, 1.6]); w.set('crack', P); }
  else if (m === 'wrapT' || m === 'wrapH' || m === 'wrapP' || m === 'hookT' || m === 'hookR') {
    if (st.fresh) { st.tk = target(hand, st.tk); st.ax = P.x; st.ay = P.y; st.az = P.z; st.fresh = false; }
    P.x = st.ax; P.y = st.ay; P.z = st.az; P.r = st.r; P.t = st.ext ? (st.t += dt) : null;
    P.phase = m === 'wrapH' ? 'hold' : m === 'wrapP' ? 'pull' : m === 'hookR' ? 'release' : 'throw';
    w.set(m.startsWith('wrap') ? 'wrap' : 'hook', P);
  }
}
const MODES = ['coil', 'hang', 'stow', 'spin', 'swing', 'ringS', 'ringL', 'crack', 'wrapT', 'wrapH', 'wrapP', 'hookT', 'hookR'];
function fresh(st, m, lineAboveOnly) {
  st.t = rnd() < 0.2 ? rr(0, 0.5) : 0; st.id = pick(SWINGS); st.aim = rnd() < 0.7; st.land = rr(0.1, 0.5); st.fresh = true; st.ext = rnd() < 0.5; st.r = pick([14, 8, 30, 0, 0.001, 200]);
  st.tk = lineAboveOnly ? pick([0, 1, 5, 6]) : (rnd() * 9) | 0;
  if (m === 'swing' && st.id === 'far' && st.aim) { /* aim set on first use */ }
}

// ── A. every move interrupted at every tick by every other mode ──
function runA(tier) {
  const follow = ['coil', 'hang', 'stow', 'spin', 'swing', 'ringS', 'wrapT', 'wrapH', 'hookT', 'crack'];
  const ids = [...SWINGS.slice(0, 9), 'ringS', 'ringL'], DT = 1 / 60;
  for (const id of ids) {
    const dur = id === 'ringS' ? 0.52 : id === 'ringL' ? 1.5 : DUR(id), K = Math.ceil(dur / DT), stepK = QUICK ? 5 : 1;
    for (let k = 0; k <= K; k += stepK) for (const f of follow) {
      const w = createWhip({ tier }), hand = mkHand(), info = meshInfo(w), S = { info, vtx: new Float32Array(info.floats), tmp: new Float32Array(w.n * 3), alpha: 0.5, lineAbove: true };
      const st = { t: 0, id: id.startsWith('ring') ? 'c1' : id, aim: true, ax: 300, ay: 90, az: 40, land: 0.3, fresh: true, ext: false, r: 14, tk: 0 };
      const ctx = { run: 'A', tier, move: id, cutAt: k, then: f, real: true, tick: 0 };
      hand.x = 22; hand.y = 62; hand.z = -18; hand.dx = 0.5; hand.dy = 0.6; hand.dz = -0.3;
      for (let i = 0; i < 20; i++) { setMode(w, hand, 'coil', st, DT); w.update(DT, hand); }
      const m0 = id === 'ringS' || id === 'ringL' ? id : 'swing';
      for (let i = 0; i < k; i++) {
        hand.x = 22 + 8 * Math.sin(i * 0.3); hand.y = 62 + 30 * Math.sin(i * 0.21); hand.z = -18 + 6 * Math.cos(i * 0.27);   // the arm swings
        setMode(w, hand, m0, st, DT); w.update(DT, hand); ctx.tick = i; ctx.phase = 'move'; check(w, hand, DT, ctx, S);
      }
      const st2 = { t: 0, id: pick(SWINGS), aim: true, ax: -200, ay: 40, az: 10, land: 0.2, fresh: true, ext: false, r: 14, tk: pick([0, 0, 6]) };
      for (let i = 0; i < 36; i++) {
        hand.x = 22 + 8 * Math.sin((k + i) * 0.3); hand.y = 62 + 30 * Math.sin((k + i) * 0.21);
        if (f === 'crack') { if (i === 0) setMode(w, hand, 'crack', st2, DT); else setMode(w, hand, i < 12 ? m0 : 'coil', st, DT); } else setMode(w, hand, f, st2, DT);
        const dt = i === 3 ? 0 : DT;
        if (dt === 0) before.set(w.nodes);
        w.update(dt, hand); ctx.tick = k + i; ctx.phase = 'after'; check(w, hand, dt, ctx, S);
      }
    }
  }
}

// ── B / C. random ──
function runRandom(name, tier, N, o) {
  const w = createWhip({ tier, onEvent: (n, e) => { if (!Number.isFinite(e.x + e.y + e.z + e.dx + e.dy + e.dz)) bad('event with a number that is not finite', { run: name, tier, ev: n }, `${e.x},${e.y},${e.z} d ${e.dx},${e.dy},${e.dz}`); evs[n] = (evs[n] || 0) + 1; } });
  const hand = mkHand(), info = meshInfo(w), S = { info, vtx: new Float32Array(info.floats), tmp: new Float32Array(w.n * 3), alpha: 1, lineAbove: false };
  const st = {}; let m = 'coil', prevM = 'coil', hx = 0, hy = 0, hz = 0, vx = 0, vz = 0, ang = 0, of = 20, or = 18, oy = 70, ground = 0;
  const hero = { dead: false, act: null, actT: 0, actDone: false, charging: false, charge: 0, move: null, moveT: 0, dirX: 1, dirZ: 0, plungeLand: null, whipX: 0, whipY: 0, whipZ: 0 };
  fresh(st, m, false); let oddCrack = 0;
  for (let i = 0; i < N; i++) {
    const dt = pick(DTS);
    // hero
    vx += rr(-60, 60); vz += rr(-60, 60); vx *= 0.9; vz *= 0.9; hx += vx * dt; hz += vz * dt; ang += rr(-0.3, 0.3); if (rnd() < 0.02) ang += Math.PI;
    let tele = '';
    if (rnd() < 0.003) { hx += rr(-9000, 9000); hz += rr(-9000, 9000); hy += rr(-2000, 2000); tele = 'far'; } else if (rnd() < 0.003) { const a = rnd() * 6.283, d = rr(150, 300); hx += Math.cos(a) * d; hz += Math.sin(a) * d; tele = 'near220'; }
    if (rnd() < 0.01) hy += rr(-60, 120); if (rnd() < 0.05) hy += (0 - hy) * 0.5;
    hand.fx = Math.cos(ang); hand.fz = Math.sin(ang);
    if (o.hostile) {
      const k = (rnd() * 8) | 0; ground = rnd() < 0.5 ? hy : hy + rr(-80, 80);
      if (k === 0) { of = 0; or = 0; } else if (k === 1) { oy = rr(-60, 10); } else if (k === 2) { of = rr(-200, 200); or = rr(-200, 200); oy = rr(-100, 400); } else { of += rr(-25, 25); or += rr(-25, 25); oy += rr(-25, 25); }
      hand.dx = rr(-1, 1); hand.dy = rr(-1, 1); hand.dz = rr(-1, 1); if (rnd() < 0.05) { hand.dx = 0; hand.dy = 0; hand.dz = 0; } if (rnd() < 0.05) { hand.dx *= 1e-9; hand.dy *= 1e-9; hand.dz *= 1e-9; }
    } else {
      ground = hy;
      of = Math.max(-34, Math.min(46, of + rr(-9, 9))); or = Math.max(-42, Math.min(42, or + rr(-9, 9))); oy = Math.max(26, Math.min(150, oy + rr(-9, 9)));
      if (rnd() < 0.03) { of = rr(-34, 46); or = rr(-42, 42); oy = rr(26, 150); }   // the clip snaps the arm
      const d = Math.hypot(of, or); if (d < 15 && oy < 104) { const k = 15 / (d || 1); of = (of || 15) * k; or *= k; }   // an arm does not go through the trunk
      const a = rr(0, 6.283), e = rr(-1.3, 1.3); hand.dx = Math.cos(a) * Math.cos(e); hand.dy = Math.sin(e); hand.dz = Math.sin(a) * Math.cos(e);
    }
    hand.bx = hx; hand.by = hy; hand.bz = hz; hand.ground = ground;
    hand.x = hx + hand.fx * of + hand.fz * or; hand.y = hy + oy; hand.z = hz + hand.fz * of - hand.fx * or;
    // mode
    if (rnd() < o.pMode) { prevM = m; m = pick(MODES); fresh(st, m, false); }
    if (o.viaDrive && rnd() < 0.5) {   // through the rules' eyes
      hero.dirX = hand.fx; hero.dirZ = hand.fz; hero.dead = m === 'hang'; hero.act = m === 'hookT' ? 'hook' : m === 'ringS' ? 'echo' : m === 'ringL' ? 'ring' : null; hero.actT = (st.t += dt); hero.actDone = st.t > 0.8;
      hero.charging = m === 'spin'; hero.charge = rnd(); const id = MOVES[st.id] ? st.id : 'c1'; hero.move = m === 'swing' ? MOVES[id] : null; hero.moveT = st.t; hero.plungeLand = id === 'plunge' && st.t > st.land ? st.land : null;
      if (st.fresh) { target(hand, st.tk); st.ax = P.x; st.ay = P.y; st.az = P.z; st.fresh = false; }
      hero.whipX = st.ax; hero.whipY = st.ay; hero.whipZ = st.az;
      driveWhip(w, hero, TUNE, m === 'wrapP' ? { x: st.ax, y: st.ay, z: st.az, r: st.r } : null);
    } else {
      if (m === 'swing' && st.id === 'far' && st.fresh) { target(hand, st.tk); st.ax = P.x; st.ay = P.y; st.az = P.z; st.fresh = false; }
      setMode(w, hand, m, st, dt);
      if (m === 'crack') { m = prevM === 'crack' ? 'coil' : prevM; }   // a crack is one call; the mode underneath goes on
    }
    if (oddCrack > 0) oddCrack--;
    if (rnd() < 0.02) { const k = target(hand); P.strength = 1.3; if (k !== 0) oddCrack = 40; w.set('crack', P); }
    if (dt === 0) before.set(w.nodes);
    S.alpha = rnd();
    if (rnd() < 0.0005) { w.reset(hand); if (dt === 0) before.set(w.nodes); }
    w.update(dt, hand);
    if (!check(w, hand, dt, { run: name, tier, i, mode: w.mode, m, prevM, dt, tele, real: !o.hostile, odd: st.tk !== 0 && st.tk !== 6 || oddCrack > 0, id: st.id, t: +st.t.toFixed(3), tk: st.tk }, S)) { w.reset(hand); if (!Number.isFinite(w.nodes[3])) { console.log('   reset() does not recover from the bad state - new whip'); return runRandom(name + "'", tier, N - i - 1, o); } }
  }
}
const evs = {};

const t0 = performance.now();
for (const tier of ['low', 'mid', 'high']) runA(tier);
const nA = ticks; console.log(`A  systematic interrupts: ${nA} ticks, violations so far ${V.total}`);
const NB = QUICK ? 30000 : 140000, NC = QUICK ? 30000 : 110000;
for (const tier of ['low', 'mid', 'high']) { runRandom('B realistic, mode change 4 %/tick', tier, NB, { pMode: 0.04, viaDrive: true }); runRandom('B realistic, mode change every tick', tier, NB / 2, { pMode: 1, viaDrive: true }); }
const nB = ticks - nA; console.log(`B  random, realistic hand: ${nB} ticks, violations so far ${V.total}`);
for (const tier of ['low', 'mid', 'high']) { runRandom('C hostile, mode change every tick', tier, NC, { pMode: 1, hostile: true, viaDrive: true }); runRandom('C hostile, mode change 5 %/tick', tier, NC, { pMode: 0.05, hostile: true, viaDrive: false }); }
const nC = ticks - nA - nB; console.log(`C  random, hostile hand: ${nC} ticks`);
console.log(`\nfuzz total: ${ticks} ticks in ${((performance.now() - t0) / 1000).toFixed(1)} s (seed ${argv.find((a) => a.startsWith('--seed=')) ? argv.find((a) => a.startsWith('--seed=')).slice(7) : 20261118})`);
console.log('events seen:', Object.entries(evs).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('\nper mode (all runs):  ticks · widest node spacing (% of rest) · longest lash (x base) · lowest node above ground (px) · fastest node (px/s) · nodes inside body');
for (const [k, s] of Object.entries(stat).sort()) console.log(`  ${k.padEnd(12)} ${String(s.n).padStart(8)} · ${(s.seg * 100).toFixed(1).padStart(9)} % · ${s.len.toFixed(2).padStart(8)} · ${s.low.toFixed(2).padStart(9)} · ${s.v.toFixed(0).padStart(6)} · ${s.body}`);
console.log(`\nviolations: ${V.total}`);
for (const [k, v] of Object.entries(V.byCat).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(7)}  ${k}`);
for (const [k, v] of Object.entries(worst)) console.log(`  ${k}: ${(v * 100).toFixed(0)} %`);
for (const f of V.first) console.log('   e.g. ' + JSON.stringify(f));

// ── allocation and time per tick, steady state, ALL modes (the lane's own measure covers swings and rest only) ──
{
  const gc = globalThis.gc;
  for (const tier of ['low', 'mid', 'high']) {
    const w = createWhip({ tier, onEvent: () => { cnt++; } }); let cnt = 0;
    const hand = mkHand(), L = 2400, seqM = new Uint8Array(L), seqT = new Float32Array(L), seqH = new Float32Array(L * 6), seqD = new Float32Array(L);
    const plan = ['coil', 'swing:c1', 'swing:c2', 'swing:c3', 'coil', 'spin', 'swing:whip', 'wrapP', 'coil', 'hookT', 'coil', 'ringS', 'coil', 'ringL', 'hang', 'swing:sweep', 'swing:plunge', 'stow', 'swing:far', 'coil'];
    for (let i = 0; i < L; i++) { const b = (i / 120) | 0; seqM[i] = b % plan.length; seqT[i] = (i % 120) / 60; const a = i * 0.05; seqH[i * 6] = 16 + 12 * Math.sin(a); seqH[i * 6 + 1] = 62 + 28 * Math.sin(a * 0.7); seqH[i * 6 + 2] = -14 + 9 * Math.cos(a * 0.9); seqH[i * 6 + 3] = Math.cos(a); seqH[i * 6 + 4] = 0.5; seqH[i * 6 + 5] = Math.sin(a); seqD[i] = i % 97 === 5 ? 0 : 1 / 60; }
    const Q = { move: 'c1', t: 0, dirX: 1, dirZ: 0, x: 220, y: 70, z: 30, r: 14, phase: 'throw', kind: 'short', style: 'coil', level: 0.6, throwT: 0.16, strength: 1 };
    const QN = { move: 'c1', t: 0, dirX: 1, dirZ: 0 };
    const tick = (i) => {
      const j = i % L, p = plan[seqM[j]], t = seqT[j];
      hand.x = seqH[j * 6]; hand.y = seqH[j * 6 + 1]; hand.z = seqH[j * 6 + 2]; hand.dx = seqH[j * 6 + 3]; hand.dy = seqH[j * 6 + 4]; hand.dz = seqH[j * 6 + 5];
      if (p === 'coil') { Q.style = 'coil'; w.set('rest', Q); } else if (p === 'hang') { Q.style = 'hang'; w.set('rest', Q); } else if (p === 'stow') w.set('stow', Q);
      else if (p === 'spin') w.set('spin', Q); else if (p === 'wrapP') { Q.phase = t < 0.4 ? 'hold' : 'pull'; w.set('wrap', Q); } else if (p === 'hookT') { Q.phase = t < 1.5 ? 'throw' : 'release'; w.set('hook', Q); }
      else if (p === 'ringS') { Q.kind = 'short'; Q.t = t; w.set('ring', Q); } else if (p === 'ringL') { Q.kind = 'long'; Q.t = t; w.set('ring', Q); }
      else if (p === 'swing:far') { Q.move = 'far'; Q.t = t; w.set('swing', Q); }
      else { QN.move = p.slice(6); QN.t = t; w.set('swing', QN); if (seqT[j] > 0.2 && seqT[j] < 0.22) w.set('crack', Q); }
      w.update(seqD[j], hand);
    };
    const info = meshInfo(w), vtx = new Float32Array(info.floats), tmp = new Float32Array(w.n * 3), NN = QUICK ? 60000 : 240000;
    const runT = (n) => { for (let i = 0; i < n; i++) tick(i); }, runF = (n) => { for (let i = 0; i < n; i++) { tick(i); writeWhipMesh(w, vtx, (i % 5) / 5, tmp); } };
    runT(NN); runF(NN); runT(NN); runF(NN);
    process.memoryUsage(); performance.now(); gc?.(); gc?.();
    const h0 = process.memoryUsage().heapUsed, a0 = performance.now(); runT(NN); const a1 = performance.now(); gc?.(); gc?.(); const h1 = process.memoryUsage().heapUsed;
    gc?.(); const h2 = process.memoryUsage().heapUsed, b0 = performance.now(); runF(NN); const b1 = performance.now(); gc?.(); gc?.(); const h3 = process.memoryUsage().heapUsed;
    console.log(`\nsteady state, tier ${tier}, all modes (${NN} ticks, gc ${gc ? 'exposed' : 'NOT exposed - heap numbers are noise'}): ${((a1 - a0) * 1000 / NN).toFixed(2)} us/tick · ${(Math.max(0, h1 - h0) / NN).toFixed(4)} bytes/tick   |   tick + mesh ${((b1 - b0) * 1000 / NN).toFixed(2)} us · ${(Math.max(0, h3 - h2) / NN).toFixed(4)} bytes   (events fired ${cnt})`);
  }
}
process.exit(V.total ? 1 : 0);
