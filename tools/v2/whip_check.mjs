// WHIP lane check (node, no browser): node tools/v2/whip_check.mjs [--perf] [--trace=c1]
// What it looks at, with the real hero skeleton and clips driving the hand (driveHero) and the rules' move table (MOVES) as it is now:
//   1 every hero move: the lash is fully extended at its peak, the tip is inside the move's hit shape there, the tip is at its fastest inside the hit window,
//     the lash never stretches (no segment over 105 % of its rest length, counted against the lash as it reels in), no node inside the hero's body, same shape in every facing, identical on a second run
//   2 hit-stop (dt = 0) freezes the lash and it continues unchanged; slow motion (dt / 4) and a coarse tick (1/20) stay stable; teleport makes no speed
//   3 wrap: catch, winding, pull, release. hook: catch, taut straight line, release. bell rings: event + shard held high. far strike: tip on the target
//   4 rest: coiled by the hand and still. driveWhip: every rules state maps to a whip mode without error
//   5 numbers (child process with --expose-gc): CPU per tick and per mesh build over 100,000 runs, bytes allocated per tick (must be 0), triangles, GPU bytes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, Animator } from '../../src/v2/char3d/skel.js';
import { buildClips } from '../../src/v2/char3d/clips.js';
import { Char3D, GRIP } from '../../src/v2/char3d/hero3d.js';
import { clipsFromGroup } from '../../src/v2/play/animlib.js';
import { createWhip, WHIP_TIERS } from '../../src/v2/whip/sim.js';
import { WHIP_SHAPES, WHIP_ALIAS, shapeOf } from '../../src/v2/whip/shapes.js';
import { meshInfo, writeWhipMesh, WHIP_VERT } from '../../src/v2/whip/mesh.js';
import { driveWhip } from '../../src/v2/whip/drive.js';

const P = await import('../../src/v2/play/index.js');
const { Sim, TUNE, MOVES, flatArena, driveHero, usePlayClips, UNIT } = P;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(root, 'assets/v2/char3d');
const DT = 1 / 60, argv = process.argv.slice(2), PERF = argv.includes('--perf'), TRACE = (argv.find((a) => a.startsWith('--trace=')) || '').slice(8);
let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; fails.push(name + (extra ? ' - ' + extra : '')); } console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  (' + extra + ')' : '')); };
const f1 = (v) => v.toFixed(1), f2 = (v) => v.toFixed(2);

// ── hero skeleton + clip library in node (same way as play_motion_check) ──
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'clips/index.json'), 'utf8')), lib = {};
for (const g of index.groups) if (['locomotion', 'combat', 'reactions', 'magic', 'enemy'].includes(g.g)) Object.assign(lib, clipsFromGroup(buildModel(readGLB(path.join(DIR, 'clips', g.file))), index));
usePlayClips(lib);
const kaelModel = buildModel(readGLB(path.join(DIR, 'kael.glb')));
function mkChar() {
  const rig = new Rig(kaelModel), asset = { model: kaelModel, clips: buildClips(rig, kaelModel.anims), url: 'assets/v2/char3d/kael.glb' };
  const ch = Object.create(Char3D.prototype);
  Object.assign(ch, { asset, rig: new Rig(kaelModel), dx: 1, dz: 0, scale: UNIT, kbT: 0, kbSp: 0, M: new Float32Array(16), WM: new Float32Array(16), _g: new Float32Array(16), _t: new Float32Array(16), grip: { ...GRIP } });
  ch.anim = new Animator(ch.rig, asset.clips); ch.anim.play('idle', { fade: 0 }); ch.anim.update(0);
  return ch;
}
const mkHero = (a = 0) => { const h = new Sim(flatArena(520, 360, []), {}).hero; h.dirX = Math.cos(a); h.dirZ = Math.sin(a); h.x = 0; h.z = 0; h.y = 0; return h; };
const mkHand = () => ({ x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0, bx: 0, by: 0, bz: 0, br: 12, bh: 104, fx: 1, fz: 0, ground: 0 });
/** hero pose -> hand for the whip (exactly what the scene does) */
function pose(ch, h, hand, whip, dt) {
  driveHero(ch, h, dt, TUNE);
  ch.dx = h.dirX; ch.dz = h.dirZ;                         // the picture turns toward the facing over a few ticks; the check wants the settled case
  const W = ch.weaponMatrix(ch.place(h.x, h.y, h.z));
  whip.handFromMatrix(W, hand);
  hand.bx = h.x; hand.by = h.y; hand.bz = h.z; hand.fx = h.dirX; hand.fz = h.dirZ; hand.ground = 0;
}
const stretch = (w) => { const N = w.nodes, seg = w.len / (w.n - 1); let m = 0; for (let i = 1; i < w.n; i++) { const o = i * 3; m = Math.max(m, Math.hypot(N[o] - N[o - 3], N[o + 1] - N[o - 2], N[o + 2] - N[o - 1]) / seg); } return m; };
const finite = (w) => { for (let i = 0; i < w.n * 3; i++) if (!Number.isFinite(w.nodes[i])) return false; return true; };
const inBody = (w, h) => { let c = 0; const N = w.nodes; for (let i = 3; i < w.n; i++) { const o = i * 3; if (N[o + 1] > h.y + 2 && N[o + 1] < h.y + 104 * 0.95 && Math.hypot(N[o] - h.x, N[o + 2] - h.z) < 11.5) c++; } return c; };
/** tip in the hero frame: f forward, r right, y above the feet */
const local = (w, h) => { const dx = w.tip.x - h.x, dz = w.tip.z - h.z; return { f: dx * h.dirX + dz * h.dirZ, r: dx * h.dirZ - dz * h.dirX, y: w.tip.y - h.y }; };
function inShape(L, mv) {
  if (mv.box) { const b = mv.box; return L.f >= b.f0 - 0.5 && L.f <= b.f1 + 0.5 && Math.abs(L.r) <= b.side + 0.5 && L.y >= b.y0 - 0.5 && L.y <= b.y1 + 0.5; }
  if (mv.arc) { const a = mv.arc; return Math.hypot(L.f, L.r) <= a.r + 0.5 && Math.abs(Math.atan2(L.r, L.f)) <= ((a.deg / 2) * Math.PI) / 180 + 0.01 && L.y >= a.y0 - 0.5 && L.y <= a.y1 + 0.5; }
  return true;
}
const shapeTxt = (mv) => (mv.box ? `box f ${mv.box.f0}..${mv.box.f1} side ${mv.box.side} y ${mv.box.y0}..${mv.box.y1}` : mv.arc ? `arc r ${mv.arc.r} ${mv.arc.deg} deg y ${mv.arc.y0}..${mv.arc.y1}` : 'no shape');

/** play one move by hand (state set like the rules do) and record the lash. o: { a facing, dt, stopAt (tick index to insert hit-stop), stopN, tier } */
function playMove(id, mv, o = {}) {
  const a = o.a ?? 0, dt = o.dt ?? DT, h = mkHero(a), ch = mkChar(), hand = mkHand(), events = [];
  const whip = createWhip({ tier: o.tier ?? 'mid', onEvent: (n, e) => events.push({ n, kind: e.kind, x: e.x, y: e.y, z: e.z, t: h.moveT }) });
  const plunge = mv.kind === 'plunge', real = !!MOVES[id];
  h.onGround = true; pose(ch, h, hand, whip, DT);
  for (let i = 0; i < 50; i++) { driveWhip(whip, h, TUNE, null); pose(ch, h, hand, whip, DT); whip.update(DT, hand); }   // settle at rest first
  if (real) { h.move = mv; h.combo = mv.n ?? 0; h.anim = 'attack'; h.hitIds = new Set(); h.stepDist = 0; h.swung = true; }
  if (plunge) { h.onGround = false; h.y = 190; h.plungeLand = null; h.plungeEta = 1; h.vy = -520; }
  const dur = plunge ? 0.75 : mv.dur, rec = [], hit0 = mv.hit[0], hit1 = plunge ? 9 : mv.hit[1];
  let peak = null, best = { v: 0, t: 0 }, maxStretch = 0, body = 0, inWin = 0, nWin = 0, k = 0, bad = false, lastTip = null;
  for (let t = 0; t <= dur + 1e-9; t += dt, k++) {
    h.moveT = t;
    if (plunge) { if (h.plungeLand == null) { h.y = Math.max(0, 190 - 620 * Math.max(0, t - 0.04)); h.plungeEta = h.y / 620; if (h.y <= 0) { h.plungeLand = t; h.onGround = true; } } }
    pose(ch, h, hand, whip, dt);
    if (real) driveWhip(whip, h, TUNE, null); else whip.set('swing', { move: id, t, dirX: h.dirX, dirZ: h.dirZ, x: o.target?.x, y: o.target?.y, z: o.target?.z });
    if (o.stopAt === k) { const before = Float32Array.from(whip.nodes); for (let j = 0; j < (o.stopN ?? 8); j++) whip.update(0, hand); for (let i = 0; i < before.length; i++) if (before[i] !== whip.nodes[i]) bad = true; }
    whip.update(dt, hand);
    const L = local(whip, h), s = whip.sw.s, sh = whip.sw.shape;
    if (!finite(whip)) bad = true;
    maxStretch = Math.max(maxStretch, stretch(whip)); body += inBody(whip, h);
    const tv = lastTip ? Math.hypot(whip.tip.x - lastTip[0], whip.tip.y - lastTip[1], whip.tip.z - lastTip[2]) / dt : 0; lastTip = [whip.tip.x, whip.tip.y, whip.tip.z];   // real travel of the tip (whip.tip.speed is capped for the physics)
    if (t > 0.05 && tv > best.v) best = { v: tv, t };
    const inside = inShape(L, mv);
    if (t >= hit0 && t <= hit1 && s <= 1) { nWin++; if (inside) inWin++; }
    if (!peak && s >= sh.peak) peak = { t, ext: whip.ext, L, inside, len: whip.len, nodes: Float32Array.from(whip.nodes), speed: whip.tip.speed };
    rec.push({ t, s, L, ext: whip.ext, v: tv, len: whip.len, st: stretch(whip) });
    if (TRACE === id && !o.quiet) console.log(`   t ${t.toFixed(3)} s ${f2(s)}  tip f ${f1(L.f)} r ${f1(L.r)} y ${f1(L.y)}  v ${tv.toFixed(0)}  ext ${f2(whip.ext)} len ${f1(whip.len)} stretch ${f2(stretch(whip))} ${inside ? 'in' : '--'}`);
  }
  return { peak, best, maxStretch, body, inWin, nWin, events, bad, rec, whip, h, hit0, hit1: plunge ? (h.plungeLand ?? dur) + 0.1 : hit1 };
}

// ── 5. numbers ──
if (PERF) {
  const gc = globalThis.gc, N = 100000;
  const whip = createWhip({}), hand = mkHand(), h = mkHero(0), ch = mkChar();
  // a 6 s loop of hands and states recorded once (so the measured loop is the whip alone)
  const seq = [], ids = ['c1', 'c2', 'c3', 'sweep'];
  for (let i = 0; i < 360; i++) {
    const m = (i / 90) | 0, t = (i % 90) * DT, mv = MOVES[ids[m]]; h.move = t < mv.dur ? mv : null; h.moveT = t; h.combo = mv.n ?? 0; h.anim = h.move ? 'attack' : 'idle';
    pose(ch, h, hand, whip, DT); seq.push({ ...hand, id: h.move ? mv.id : null, t });
  }
  const P1 = { move: '', t: 0, dirX: 1, dirZ: 0 }, R1 = { style: 'coil' };
  const tick = (i) => { const s = seq[i % 360]; if (s.id) { P1.move = s.id; P1.t = s.t; whip.set('swing', P1); } else whip.set('rest', R1); whip.update(DT, s); };
  for (let i = 0; i < 20000; i++) tick(i);
  gc?.(); const h0 = process.memoryUsage().heapUsed, t0 = performance.now();
  for (let i = 0; i < N; i++) tick(i);
  const t1 = performance.now(); gc?.(); const h1 = process.memoryUsage().heapUsed;
  const info = meshInfo(whip), vtx = new Float32Array(info.floats), tmp = new Float32Array(whip.n * 3);
  for (let i = 0; i < 20000; i++) writeWhipMesh(whip, vtx, 0.5, tmp);
  gc?.(); const h2 = process.memoryUsage().heapUsed, t2 = performance.now();
  for (let i = 0; i < N; i++) { tick(i); writeWhipMesh(whip, vtx, (i % 7) / 7, tmp); }
  const t3 = performance.now(); gc?.(); const h3 = process.memoryUsage().heapUsed;
  const perTick = ((t1 - t0) / N) * 1000, perFrame = ((t3 - t2) / N) * 1000 - perTick, bTick = (h1 - h0) / N, bFrame = (h3 - h2) / N;
  console.log(`numbers (mid tier, ${whip.n} nodes, node ${process.version}, ${gc ? 'gc exposed' : 'NO gc - bytes are not reliable'}):`);
  console.log(`  cpu per tick   ${perTick.toFixed(2)} us   (${N} ticks: swings c1 c2 c3 sweep + rest)`);
  console.log(`  cpu per frame  ${perFrame.toFixed(2)} us   (mesh build: ${info.verts} vertices, ${info.floats * 4} bytes written)`);
  console.log(`  heap per tick  ${bTick.toFixed(3)} bytes   heap per tick+frame ${bFrame.toFixed(3)} bytes`);
  for (const tier of ['low', 'mid', 'high']) { const w = createWhip({ tier }), I = meshInfo(w); console.log(`  tier ${tier}: nodes ${w.n} · lash sections ${I.sections} · vertices ${I.verts} · triangles ${I.tris} · draw calls 1 (+1 glow) · GPU bytes ${I.floats * 4 + I.idx.byteLength} (vertex ${I.floats * 4} + index ${I.idx.byteLength})`); }
  ok('allocation: 0 bytes per tick in steady state', Math.abs(bTick) < 1, `${bTick.toFixed(3)} bytes/tick over ${N} ticks`);
  ok('allocation: 0 bytes per tick + mesh build', Math.abs(bFrame) < 1, `${bFrame.toFixed(3)} bytes over ${N} ticks + frames`);
  ok('cpu: a tick + a mesh build under 60 us in node', perTick + perFrame < 60, `${(perTick + perFrame).toFixed(1)} us`);
  console.log(`\nperf: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ── 1. every move ──
const table = [];
for (const [id, mv] of Object.entries(MOVES)) table.push({ id, mv, real: true });
for (const [id, sh] of Object.entries(WHIP_SHAPES)) if (!MOVES[id] && sh.nominal && (sh.nominal.box || sh.nominal.arc)) table.push({ id, mv: { id, dur: sh.nominal.dur, hit: sh.nominal.hit, box: sh.nominal.box, arc: sh.nominal.arc }, real: false });
console.log(`moves in the rules table now: ${Object.keys(MOVES).join(' ')}  ·  whip shapes: ${Object.keys(WHIP_SHAPES).join(' ')}`);
for (const { id, mv, real } of table) {
  const own = !!(WHIP_SHAPES[id] || WHIP_SHAPES[WHIP_ALIAS[id]]);
  const R = playMove(id, mv), p = R.peak, tag = `${id}${real ? '' : ' (nominal - not in the rules table)'}`;
  ok(`${tag}: has its own tip path`, own, own ? '' : 'falls back to c1');
  ok(`${tag}: lash fully extended at the peak`, !!p && p.ext >= 0.93, p ? `ext ${f2(p.ext)} at t ${p.t.toFixed(3)} s · lash ${f1(p.len)} px` : 'no peak reached');
  ok(`${tag}: tip inside the hit shape at the peak`, !!p && p.inside, p ? `tip f ${f1(p.L.f)} r ${f1(p.L.r)} y ${f1(p.L.y)} · ${shapeTxt(mv)}` : '');
  ok(`${tag}: tip fastest inside the hit window`, R.best.t >= R.hit0 - 0.02 && R.best.t <= R.hit1 + 0.02, `peak speed ${R.best.v.toFixed(0)} px/s at ${R.best.t.toFixed(3)} s · window ${mv.hit[0]}..${mv.kind === 'plunge' ? 'landing' : mv.hit[1]}`);
  ok(`${tag}: tip sweeps through the hit shape during the window`, R.nWin > 0 && R.inWin / R.nWin >= 0.4, `${R.inWin}/${R.nWin} window ticks inside`);
  ok(`${tag}: no stretch, no node in the body, finite`, R.maxStretch <= 1.05 && R.body === 0 && !R.bad, `max segment ${f2(R.maxStretch * 100)} % of rest · nodes inside the body ${R.body}`);
  const ev = R.events.filter((e) => e.n === 'crack' || e.n === 'ring');
  ok(`${tag}: one peak event inside the window`, ev.length === 1 && ev[0].t >= R.hit0 - 0.02 && ev[0].t <= R.hit1 + 0.02, ev.map((e) => `${e.n}:${e.kind}@${e.t.toFixed(3)}`).join(' ') || 'none');
}

// ── same shape in every facing · identical on a second run ──
{
  const mv = MOVES.c1, base = playMove('c1', mv, { quiet: true }); let worst = 0;
  for (let k = 1; k < 8; k++) { const R = playMove('c1', mv, { a: (k * Math.PI) / 4, quiet: true }); worst = Math.max(worst, Math.hypot(R.peak.L.f - base.peak.L.f, R.peak.L.r - base.peak.L.r, R.peak.L.y - base.peak.L.y)); }
  ok('c1 in eight facings: the tip at the peak is the same point in the hero frame', worst < 1.5, `worst difference ${f2(worst)} px`);
  const again = playMove('c1', mv, { quiet: true }); let same = true; for (let i = 0; i < base.peak.nodes.length; i++) if (base.peak.nodes[i] !== again.peak.nodes[i]) same = false;
  ok('c1 twice: every node at the peak is bit-identical', same);
  // hit-stop: 8 frozen ticks in the middle of the window, then the same peak
  const st = playMove('c1', mv, { stopAt: Math.round((mv.hit[0] + 0.02) / DT), stopN: 8, quiet: true }); let d = 0;
  for (let i = 0; i < base.peak.nodes.length; i++) d = Math.max(d, Math.abs(base.peak.nodes[i] - st.peak.nodes[i]));
  ok('hit-stop (dt = 0 for 8 ticks inside the window): lash frozen, then continues to the same peak', !st.bad && d < 1e-3, `nodes moved while frozen: ${st.bad ? 'yes' : 'no'} · peak difference ${d.toExponential(1)} px`);
  // slow motion and a coarse tick
  const slow = playMove('c1', mv, { dt: DT / 4, quiet: true }), sr = slow.rec.reduce((b, r) => (Math.abs(r.t - base.peak.t) < Math.abs(b.t - base.peak.t) ? r : b)), sd = Math.hypot(sr.L.f - base.peak.L.f, sr.L.r - base.peak.L.r, sr.L.y - base.peak.L.y);   // compared at the same move time
  ok('slow motion (dt / 4): stable, same peak', !slow.bad && slow.maxStretch <= 1.035 && slow.peak.ext >= 0.93 && sd < 8, `peak difference ${f1(sd)} px · ext ${f2(slow.peak.ext)} · max segment ${f2(slow.maxStretch * 100)} %`);
  const coarse = playMove('c3', MOVES.c3, { dt: 1 / 20, quiet: true });
  ok('coarse tick (1/20 s, c3): stable', !coarse.bad && coarse.maxStretch <= 1.035, `max segment ${f2(coarse.maxStretch * 100)} %`);
  for (const tier of ['low', 'high']) { const R = playMove('c3', MOVES.c3, { tier, quiet: true }); ok(`tier ${tier} (${WHIP_TIERS[tier].n} nodes), c3: extended, in shape, no stretch`, R.peak && R.peak.ext >= 0.93 && R.peak.inside && R.maxStretch <= 1.035 && !R.bad, `ext ${f2(R.peak.ext)} · max segment ${f2(R.maxStretch * 100)} %`); }
}

// ── 2. teleport · rest ──
{
  const h = mkHero(0), ch = mkChar(), hand = mkHand(), whip = createWhip({});
  for (let i = 0; i < 150; i++) { driveWhip(whip, h, TUNE, null); pose(ch, h, hand, whip, DT); whip.update(DT, hand); }
  let far = 0; for (let i = 0; i < whip.n; i++) far = Math.max(far, Math.hypot(whip.nodes[i * 3] - hand.x, whip.nodes[i * 3 + 1] - hand.y, whip.nodes[i * 3 + 2] - hand.z));
  ok('rest: coiled by the hand, still, clear of the body', far < 36 && whip.tip.speed < 25 && inBody(whip, h) === 0, `farthest node ${f1(far)} px from the hand · tip speed ${f1(whip.tip.speed)} px/s · tip height ${f1(whip.tip.y)}`);
  h.x += 3000; h.z += 400; driveWhip(whip, h, TUNE, null); pose(ch, h, hand, whip, DT); whip.update(DT, hand);
  let vmax = 0, dmax = 0; for (let i = 0; i < whip.n; i++) { vmax = Math.max(vmax, Math.hypot(whip.vel[i * 3], whip.vel[i * 3 + 1], whip.vel[i * 3 + 2])); dmax = Math.max(dmax, Math.hypot(whip.nodes[i * 3] - hand.x, whip.nodes[i * 3 + 1] - hand.y, whip.nodes[i * 3 + 2] - hand.z)); }
  ok('teleport (3000 px in one tick): the lash comes along, no speed spike', vmax < 150 && dmax < 40 && finite(whip), `fastest node ${f1(vmax)} px/s · farthest ${f1(dmax)} px`);
  // run in a circle for 3 s: the coil sways but stays with the hand and out of the body
  let worst = 0, body = 0, st = 0; h.anim = 'run'; h.onGround = true;
  for (let i = 0; i < 180; i++) { const a = i * 0.06; h.dirX = Math.cos(a); h.dirZ = Math.sin(a); h.vx = h.dirX * 275; h.vz = h.dirZ * 208; h.x += h.vx * DT; h.z += h.vz * DT; h.gait = (i / 48) % 1; h.gaitMode = 'run'; h.pushed = true; driveWhip(whip, h, TUNE, null); pose(ch, h, hand, whip, DT); whip.update(DT, hand); worst = Math.max(worst, Math.hypot(whip.tip.x - hand.x, whip.tip.y - hand.y, whip.tip.z - hand.z)); body += inBody(whip, h); st = Math.max(st, stretch(whip)); }
  ok('running in a circle 3 s: coil stays with the hand, no stretch, out of the body', worst < 60 && st <= 1.035 && body === 0 && finite(whip), `tip at most ${f1(worst)} px from the hand · max segment ${f2(st * 100)} % · nodes inside the body ${body}`);
}

// ── 3. wrap · hook · bell · far ──
{
  const h = mkHero(0), ch = mkChar(), hand = mkHand(), ev = [], whip = createWhip({ onEvent: (n, e) => ev.push(n + (e.kind ? ':' + e.kind : '')) });
  const step = (n, fn) => { for (let i = 0; i < n; i++) { fn?.(i); pose(ch, h, hand, whip, DT); whip.update(DT, hand); } };
  step(40, () => driveWhip(whip, h, TUNE, null));
  const tg = { x: 190, y: 62, z: 20, r: 15 };
  let t = 0; step(14, () => { whip.set('wrap', { ...tg, phase: 'throw', t }); t += DT; });
  const caught = ev.includes('wrap.catch'), axis = Math.hypot(whip.tip.x - tg.x, whip.tip.z - tg.z);
  ok('wrap: the tip flies to the target and winds around it', caught && Math.abs(axis - tg.r) < 2 && finite(whip), `events ${ev.join(' ')} · tip ${f1(axis)} px from the target axis (radius ${tg.r})`);
  let turn = 0; { const N = whip.nodes, n = whip.n; let pa = null; for (let i = 0; i < n; i++) { const dx = N[i * 3] - tg.x, dz = N[i * 3 + 2] - tg.z; if (Math.abs(Math.hypot(dx, dz) - tg.r) < 1.5) { const a = Math.atan2(dz, dx); if (pa != null) { let d = a - pa; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; turn += d; } pa = a; } } }
  ok('wrap: more than one and a third turns around the target', Math.abs(turn) > 1.33 * 2 * Math.PI, `${f2(Math.abs(turn) / (2 * Math.PI))} turns`);
  step(20, (i) => { tg.x -= 3; whip.set('wrap', { ...tg, phase: 'pull' }); });
  const lineOk = (() => { const N = whip.nodes, r = whip.root, nl = whip.n - Math.max(5, Math.round(whip.n * 0.45)); let m = 0; const ex = N[(nl - 1) * 3] - r.x, ey = N[(nl - 1) * 3 + 1] - r.y, ez = N[(nl - 1) * 3 + 2] - r.z, el = Math.hypot(ex, ey, ez); for (let i = 0; i < nl; i++) { const px = N[i * 3] - r.x, py = N[i * 3 + 1] - r.y, pz = N[i * 3 + 2] - r.z, u = (px * ex + py * ey + pz * ez) / (el * el); m = Math.max(m, Math.hypot(px - ex * u, py - ey * u, pz - ez * u)); } return m; })();
  ok('wrap pull: the line stays taut while the target comes closer', ev.includes('wrap.pull') && lineOk < 3 && whip.taut > 0.9 && finite(whip), `line bows ${f2(lineOk)} px · taut ${f2(whip.taut)} · lash ${f1(whip.len)} px`);
  step(70, () => driveWhip(whip, h, TUNE, null));
  ok('wrap release: the lash comes back to the hand and settles', Math.abs(whip.len - whip.L0) < 5 && stretch(whip) <= 1.035 && finite(whip) && whip.tip.speed < 200, `lash ${f1(whip.len)} px · tip speed ${f1(whip.tip.speed)} px/s`);

  // hook, driven through the rules' state names (act = 'hook')
  ev.length = 0; h.act = 'hook'; h.anim = 'hook'; h.actT = 0; h.whipOn = 1; h.whipX = 250; h.whipY = 160; h.whipZ = 40;
  let latchTick = -1; step(40, (i) => { h.actT = i * DT; driveWhip(whip, h, TUNE, null); if (latchTick < 0 && ev.includes('hook.catch')) latchTick = i; if (i > 12) { h.x += 4; h.y = 30 * Math.sin((i - 12) / 28 * Math.PI); } });
  const dTip = Math.hypot(whip.tip.x - 250, whip.tip.y - 160, whip.tip.z - 40);
  const bow = (() => { const N = whip.nodes, r = whip.root, ex = 250 - r.x, ey = 160 - r.y, ez = 40 - r.z, el = Math.hypot(ex, ey, ez); let m = 0; for (let i = 0; i < whip.n; i++) { const px = N[i * 3] - r.x, py = N[i * 3 + 1] - r.y, pz = N[i * 3 + 2] - r.z, u = (px * ex + py * ey + pz * ez) / (el * el); m = Math.max(m, Math.hypot(px - ex * u, py - ey * u, pz - ez * u)); } return m; })();
  ok('hook: latches when the rules say (hookThrow), tip on the ring, straight taut line while the hero flies', latchTick >= 0 && Math.abs(latchTick * DT - TUNE.hookThrow) < 0.035 && dTip < 0.5 && bow < 3 && whip.ext > 0.995, `catch at ${f2(latchTick * DT)} s (hookThrow ${TUNE.hookThrow}) · tip ${f2(dTip)} px from the ring · line bows ${f2(bow)} px · ext ${f2(whip.ext)}`);
  h.act = null; h.anim = 'idle'; h.whipOn = 0; h.y = 0; step(70, () => driveWhip(whip, h, TUNE, null));
  ok('hook release: back to the hand', Math.abs(whip.len - whip.L0) < 5 && stretch(whip) <= 1.035 && finite(whip), `lash ${f1(whip.len)} px`);

  // bell: short (act echo) and long (act ring)
  ev.length = 0; h.act = 'echo'; h.anim = 'echo'; let ringAt = -1, top = 0;
  step(Math.round(TUNE.echoT / DT), (i) => { h.actT = i * DT; driveWhip(whip, h, TUNE, null); if (ringAt < 0 && ev.includes('ring:short')) ringAt = h.actT; top = Math.max(top, whip.tip.y); });
  ok('bell short (act echo): rings when the rules echo (echoAt), shard lifted above the head', ringAt >= 0 && Math.abs(ringAt - TUNE.echoAt) < 0.035 && top > 125, `ring at ${f2(ringAt)} s (echoAt ${TUNE.echoAt}) · shard up to ${f1(top)} px`);
  ev.length = 0; h.act = 'ring'; h.anim = 'ring'; h.actDone = false; ringAt = -1; top = 0; let tt = 0;
  step(Math.round((TUNE.ringT + 0.5) / DT), (i) => { tt = i * DT; if (tt >= TUNE.ringT && !h.actDone) { h.actDone = true; } h.actT = h.actDone ? tt - TUNE.ringT : tt; h.bellCharge = Math.min(1, tt / TUNE.ringT); driveWhip(whip, h, TUNE, null); if (ringAt < 0 && ev.includes('ring:long')) ringAt = tt; top = Math.max(top, whip.tip.y); });
  ok('bell long (act ring): rings when the hold is full (ringT), shard held high', ringAt >= 0 && Math.abs(ringAt - TUNE.ringT) < 0.06 && top > 130 && whip.pulse > 0.05, `ring at ${f2(ringAt)} s (ringT ${TUNE.ringT}) · shard up to ${f1(top)} px`);
  h.act = null; h.anim = 'idle'; h.actDone = false;

  // charging (spin) -> state mapping, then the far strike at a target
  h.charging = true; h.anim = 'charge'; let stMax = 0; step(40, (i) => { h.charge = Math.min(1, i / 33); driveWhip(whip, h, TUNE, null); stMax = Math.max(stMax, stretch(whip)); });
  ok('charging: the lash circles over the hand, curved (not a spoke)', whip.mode === 'spin' && whip.tip.y > hand.y + 12 && whip.ext < 0.9 && whip.ext > 0.55 && stMax <= 1.035 && finite(whip), `tip ${f1(whip.tip.y - hand.y)} px above the hand · ext ${f2(whip.ext)} · max segment ${f2(stMax * 100)} %`);
  h.charging = false; h.anim = 'idle';
  const T2 = { x: 300, y: 150, z: -90 }; ev.length = 0; let pk = null; const sh = shapeOf('far'), nm = sh.nominal;
  step(Math.round(nm.dur / DT), (i) => { whip.set('swing', { move: 'far', t: i * DT, dirX: 1, dirZ: 0, ...T2 }); });
  { const w2 = createWhip({}), hd = mkHand(); let best = 1e9, ext = 0; for (let i = 0; i < 50; i++) { w2.set('rest'); pose(ch, h, hd, w2, DT); w2.update(DT, hd); } for (let t2 = 0; t2 <= nm.dur; t2 += DT) { w2.set('swing', { move: 'far', t: t2, dirX: 1, dirZ: 0, ...T2 }); pose(ch, h, hd, w2, DT); w2.update(DT, hd); const d = Math.hypot(w2.tip.x - T2.x, w2.tip.y - T2.y, w2.tip.z - T2.z); if (d < best) { best = d; ext = w2.ext; } } pk = { best, ext }; }
  ok('far bell strike: the tip reaches a target 330 px away, lash extended', pk.best < 6 && pk.ext >= 0.93 && ev.includes('crack:air'), `closest ${f1(pk.best)} px · ext ${f2(pk.ext)} · events ${ev.join(' ')}`);
  // every state name the rules can be in maps to a mode without throwing
  let threw = '';
  for (const st of [{ dead: true }, { act: 'call', actT: 0.1 }, { act: 'hook', actT: 0.05, whipX: 100, whipY: 100, whipZ: 0 }, { act: 'echo', actT: 0.1 }, { act: 'ring', actT: 0.3 }, { charging: true, charge: 0.4 }, { move: MOVES.c2, moveT: 0.1 }, {}]) {
    const hh = { ...mkHero(0), ...st }; try { driveWhip(whip, hh, TUNE, null); pose(ch, h, hand, whip, DT); whip.update(DT, hand); if (!finite(whip)) threw += ' NaN:' + JSON.stringify(Object.keys(st)); } catch (e) { threw += ' ' + e.message; }
  }
  try { driveWhip(whip, mkHero(0), TUNE, { x: 120, y: 60, z: 0, r: 16 }); pose(ch, h, hand, whip, DT); whip.update(DT, hand); } catch (e) { threw += ' pull:' + e.message; }
  ok('driveWhip: every rules state (dead, call, hook, echo, ring, charging, move, idle, pull) maps to a mode', threw === '' && finite(whip), threw);
}

const child = spawnSync(process.execPath, ['--expose-gc', fileURLToPath(import.meta.url), '--perf'], { encoding: 'utf8' });
const out = (child.stdout || '') + (child.stderr || '');
const perfOut = out.slice(out.indexOf('numbers ('));
console.log('\n' + (perfOut.length > 20 ? perfOut.trim() : 'perf child failed:\n' + out.slice(-1500)));
const pm = /perf: (\d+) passed, (\d+) failed/.exec(out);
if (pm) { pass += +pm[1]; fail += +pm[2]; if (+pm[2]) fails.push('numbers (see above)'); } else { fail++; fails.push('perf child did not finish'); }
console.log(`\nwhip_check: ${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
