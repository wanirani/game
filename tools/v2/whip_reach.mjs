// WHIP-VERIFY: timing and reach, measured independently of whip_check (node, no browser).   node tools/v2/whip_reach.mjs [--v]
// Every hero move in src/v2/play/moves.js AS IT IS NOW is started through the real rules (Sim._startMove, Sim.update) with the real skeleton and clips
// driving the hand, the whip driven exactly as docs/v2/WHIP.md section 7 says (hooks.hit -> set('crack'), driveWhip, update(play dt)).
//   1  no enemy, eight facings: when does the lash arrive (tip inside the hit shape by the RULES' own test and lash extended) against the tick the
//      window opens? Late = a hit could land before the lash is there. Share of window ticks with the tip inside the shape.
//   2  an enemy at several places in the hit shape, eight facings: on the tick the rules land the hit, where is the tip (distance to the hit point,
//      to the enemy's body), where was it one tick before (how far it jumps in that tick) and how extended is the lash.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, Animator } from '../../src/v2/char3d/skel.js';
import { buildClips } from '../../src/v2/char3d/clips.js';
import { Char3D, GRIP } from '../../src/v2/char3d/hero3d.js';
import { clipsFromGroup } from '../../src/v2/play/animlib.js';
import { createWhip, driveWhip, WHIP_SHAPES, WHIP_ALIAS } from '../../src/v2/whip/index.js';
const P = await import('../../src/v2/play/index.js');
const { Sim, TUNE, MOVES, flatArena, driveHero, usePlayClips, UNIT, KINDS, registerKind } = P;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), DIR = path.join(root, 'assets/v2/char3d');
const DT = 1 / 60, VERB = process.argv.includes('--v');
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'clips/index.json'), 'utf8')), lib = {};
for (const g of index.groups) if (['locomotion', 'combat', 'reactions', 'magic', 'enemy'].includes(g.g)) Object.assign(lib, clipsFromGroup(buildModel(readGLB(path.join(DIR, 'clips', g.file))), index));
usePlayClips(lib);
const kael = buildModel(readGLB(path.join(DIR, 'kael.glb')));
function mkChar() {
  const rig = new Rig(kael), asset = { model: kael, clips: buildClips(rig, kael.anims), url: 'assets/v2/char3d/kael.glb' }, ch = Object.create(Char3D.prototype);
  Object.assign(ch, { asset, rig: new Rig(kael), dx: 1, dz: 0, scale: UNIT, kbT: 0, kbSp: 0, M: new Float32Array(16), WM: new Float32Array(16), _g: new Float32Array(16), _t: new Float32Array(16), grip: { ...GRIP } });
  ch.anim = new Animator(ch.rig, asset.clips); ch.anim.play('idle', { fade: 0 }); ch.anim.update(0); return ch;
}
registerKind('dummy', { ...KINDS.skeleton_soldier, name: 'dummy', hp: 99999, attacks: [], sight: 9999 }, (s, e, dt) => { s.setAnim(e, 'idle', dt); });

let problems = 0; const notes = [];
const flag = (m) => { problems++; notes.push(m); };

/** one run. o: { id, a (facing), enemy: { f, r } in the hero frame or null } */
function run(o) {
  const mv = MOVES[o.id], ca = Math.cos(o.a), sa = Math.sin(o.a), plunge = mv.kind === 'plunge';
  const spawns = o.enemy ? [{ kind: 'dummy', x: 700 + ca * o.enemy.f + sa * o.enemy.r, z: 500 + sa * o.enemy.f - ca * o.enemy.r, active: true }] : [];
  const hits = []; let whip = null;
  const hooks = { hit: (e, dmg, m, x, y, z) => { hits.push({ k: tick, x, y, z, e, ex: e.x, ez: e.z, tipBefore: [whip.tip.x, whip.tip.y, whip.tip.z], extBefore: whip.ext }); whip.set('crack', { x, y, z, strength: { L: 0.7, M: 1, H: 1.3, F: 1.6 }[m.str] ?? 1 }); } };
  const sim = new Sim(flatArena(1400, 1000, spawns), hooks), h = sim.hero, ch = mkChar();
  const hand = { x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0, bx: 0, by: 0, bz: 0, br: 12, bh: 104, fx: 1, fz: 0, ground: 0 };
  const evs = []; whip = createWhip({ onEvent: (n, e) => evs.push({ n, kind: e.kind, k: tick }) });
  let tick = -100;
  h.x = 700; h.z = 500; h.dirX = ca; h.dirZ = sa;
  const pose = (dt) => { if (dt > 0) driveHero(ch, h, dt, TUNE); ch.dx = h.dirX; ch.dz = h.dirZ; whip.handFromMatrix(ch.weaponMatrix(ch.place(h.x, h.y, h.z)), hand); hand.bx = h.x; hand.by = h.y; hand.bz = h.z; hand.fx = h.dirX; hand.fz = h.dirZ; hand.ground = plunge ? 0 : h.y; };
  for (let i = 0; i < 40; i++) { tick++; sim.update(DT); h.x = 700; h.z = 500; h.dirX = ca; h.dirZ = sa; pose(DT); driveWhip(whip, h, TUNE, null); whip.update(DT, hand); }
  for (const e of sim.enemies) e.hp = e.hpMax;
  if (plunge) { h.onGround = false; h.y = 200; h.vy = 0; }
  if (mv.kind === 'whip') h.whipLv = 1;
  sim._startMove(h, mv, ca, sa, true);
  tick = 0; const rec = []; let pullE = null;
  for (let i = 0; i < 80 && (h.move === mv || i < 4); i++, tick++) {
    const frozen = sim.stop > 0, t0 = h.moveT;
    sim.update(DT);
    if (frozen && sim.stop > 0) { whip.update(0, hand); rec.push({ k: tick, frozen: true }); continue; }
    pose(DT);
    for (const e of sim.enemies) if (e.pullT > 0) pullE = e;
    const pull = pullE && (pullE.pullT > 0 || h.pullT > 0) ? { x: pullE.x, y: pullE.y + (pullE.h ?? 80) * 0.55, z: pullE.z, r: Math.max(8, pullE.r * 0.55) } : null;
    driveWhip(whip, h, TUNE, pull); whip.update(DT, hand);
    const inS = h.move ? sim._inShape(h, mv, whip.tip.x, whip.tip.z, 0, whip.tip.y, whip.tip.y) : false;
    const dx = whip.tip.x - h.x, dz = whip.tip.z - h.z;
    rec.push({ k: tick, t: h.move ? h.moveT : t0, mode: whip.mode, ext: whip.ext, inS, f: dx * h.dirX + dz * h.dirZ, r: dx * h.dirZ - dz * h.dirX, y: whip.tip.y - h.y, tip: [whip.tip.x, whip.tip.y, whip.tip.z], s: whip.sw.s, land: h.plungeLand });
  }
  return { rec, hits, evs, mv, h };
}

const ids = Object.keys(MOVES), noShape = ids.filter((id) => !WHIP_SHAPES[id] && !WHIP_SHAPES[WHIP_ALIAS[id]]);
console.log(`moves in src/v2/play/moves.js now: ${ids.join(' ')}`);
console.log(noShape.length ? `MOVES WITHOUT A WHIP SHAPE: ${noShape.join(' ')}` : 'every move has its own whip shape (WHIP_SHAPES / WHIP_ALIAS)');
if (noShape.length) flag('moves without a shape: ' + noShape.join(' '));
console.log(`weapon class in the move table: ${ids.map((id) => id + '=' + MOVES[id].weapon).join(' ')}`);

console.log('\n1  air swing, eight facings (ms relative to the tick the window opens; + = late)');
console.log('   move    window      lash arrives (ext >= 0.9 and tip in shape)   tip enters shape   tip in shape during window   ext at window open   crack/air');
for (const id of ids) {
  const mv = MOVES[id], rows = [];
  for (let d = 0; d < 8; d++) {
    const R = run({ id, a: (d * Math.PI) / 4, enemy: null }).rec.filter((q) => !q.frozen), live = R.filter((q) => q.mode === 'swing');
    const open = live.find((q) => q.t >= mv.hit[0] - 1e-9), arrive = live.find((q) => q.ext >= 0.9 && q.inS), enter = live.find((q) => q.inS);
    const win = live.filter((q) => q.t >= mv.hit[0] - 1e-9 && (mv.kind === 'plunge' ? q.land == null : q.t <= mv.hit[1] + 1e-9)), inW = win.filter((q) => q.inS).length;
    rows.push({ d, late: arrive && open ? (arrive.t - open.t) * 1000 : null, enter: enter && open ? (enter.t - open.t) * 1000 : null, share: win.length ? inW / win.length : 0, ext0: open ? open.ext : 0, n: win.length });
  }
  const lates = rows.map((r) => r.late), ent = rows.map((r) => r.enter), sh = rows.map((r) => r.share), e0 = rows.map((r) => r.ext0);
  const rng = (a, f = 0) => (a.some((v) => v == null) ? 'NEVER in some facing' : `${Math.min(...a).toFixed(f)}..${Math.max(...a).toFixed(f)}`);
  console.log(`   ${id.padEnd(7)} ${String(mv.hit[0]).padEnd(4)}-${String(mv.hit[1]).padEnd(5)}  ${rng(lates).padEnd(22)} ms                    ${rng(ent).padEnd(12)} ms     ${rng(sh.map((v) => v * 100))} %                   ${rng(e0, 2)}`);
  if (lates.some((v) => v == null)) flag(`${id}: the lash never arrives (extended + in shape) in some facing`);
  else if (Math.max(...lates) > 17) flag(`${id}: the lash arrives up to ${Math.max(...lates).toFixed(0)} ms after the window opens (a hit can land ${Math.round(Math.max(...lates) / 16.7)} tick(s) before it)`);
  if (VERB) for (const r of rows) console.log(`        facing ${r.d * 45}: arrive ${r.late?.toFixed(0)} ms, enter ${r.enter?.toFixed(0)} ms, in shape ${(r.share * 100).toFixed(0)} % of ${r.n} ticks, ext at open ${r.ext0.toFixed(2)}`);
}

console.log('\n2  with an enemy in the hit shape, eight facings: the tick the rules land the hit');
console.log('   move    enemy at (f, r)   hit at t (window opens)   tip -> hit point px   tip -> enemy axis px (enemy r)   lash ext   tip jump in that tick px   tip one tick before: f, behind the hero?');
for (const id of ids) {
  const mv = MOVES[id], sh = mv.box ?? mv.arc, reach = mv.box ? mv.box.f1 : mv.arc.r;
  const spots = mv.kind === 'plunge' ? [{ f: 40, r: 0 }, { f: 70, r: 0 }, { f: 40, r: 30 }] : [{ f: Math.max(34, reach * 0.3), r: 0 }, { f: reach * 0.62, r: 0 }, { f: reach * 0.95, r: 0 }, { f: reach * 0.6, r: (mv.box ? mv.box.side : reach * 0.6) * 0.8 }, { f: reach * 0.6, r: -(mv.box ? mv.box.side : reach * 0.6) * 0.8 }];
  if (mv.arc && mv.arc.deg >= 180) spots.push({ f: 0, r: reach * 0.7 }, { f: 0, r: -reach * 0.7 }); if (mv.arc && mv.arc.deg >= 270) spots.push({ f: -reach * 0.5, r: reach * 0.5 });
  void sh;
  for (const sp of spots) {
    const agg = { n: 0, miss: 0, tipHit: [], tipAxis: [], ext: [], jump: [], tHit: [], fBefore: [], er: 0 };
    for (let d = 0; d < 8; d++) {
      const R = run({ id, a: (d * Math.PI) / 4, enemy: sp }), H = R.hits[0];
      if (!H) { agg.miss++; continue; }
      const q = R.rec.find((x) => x.k === H.k && !x.frozen) ?? R.rec.find((x) => x.k >= H.k && !x.frozen);
      if (!q) { agg.miss++; continue; }
      const e = H.e; agg.er = e.r; agg.n++;
      agg.tipHit.push(Math.hypot(q.tip[0] - H.x, q.tip[1] - H.y, q.tip[2] - H.z)); agg.tipAxis.push(Math.hypot(q.tip[0] - H.ex, q.tip[2] - H.ez)); agg.ext.push(q.ext);
      agg.jump.push(Math.hypot(q.tip[0] - H.tipBefore[0], q.tip[1] - H.tipBefore[1], q.tip[2] - H.tipBefore[2])); agg.tHit.push(q.t);
      const bx = H.tipBefore[0] - R.h.x, bz = H.tipBefore[2] - R.h.z; agg.fBefore.push(bx * R.h.dirX + bz * R.h.dirZ);
    }
    const mm = (a, f = 0) => (a.length ? `${Math.min(...a).toFixed(f)}..${Math.max(...a).toFixed(f)}` : '-');
    console.log(`   ${id.padEnd(7)} (${sp.f.toFixed(0).padStart(4)}, ${sp.r.toFixed(0).padStart(4)})      ${mm(agg.tHit, 3)} (${mv.hit[0]})${agg.miss ? '  NO HIT in ' + agg.miss + ' facings' : ''}      ${mm(agg.tipHit).padEnd(12)}          ${mm(agg.tipAxis).padEnd(10)} (${agg.er})            ${mm(agg.ext, 2)}     ${mm(agg.jump).padEnd(10)}               ${mm(agg.fBefore)}`);
    if (agg.tipHit.length && Math.max(...agg.tipHit) > 14) flag(`${id} enemy (${sp.f.toFixed(0)}, ${sp.r.toFixed(0)}): on the hit tick the tip is up to ${Math.max(...agg.tipHit).toFixed(0)} px from the hit point`);
    if (agg.jump.length && Math.max(...agg.jump) > 110) flag(`${id} enemy (${sp.f.toFixed(0)}, ${sp.r.toFixed(0)}): the tip jumps up to ${Math.max(...agg.jump).toFixed(0)} px in the hit tick (the lash was not yet near: the hit lands ahead of the lash)`);
  }
}
console.log(`\nwhip_reach: ${problems} mismatch(es)`);
for (const n of notes) console.log('  - ' + n);
process.exit(problems ? 1 : 0);
