// SPEED-FIRE-VERIFY (node, no browser): per-tick numbers of the hero moves with the rules (sim) + the motion layer (driveHero) on the kael model.
//   node tools/v2/speedfireverify_tick.mjs [--rows 1]
// Per tick: speed (px/s), angle between the velocity and the body facing (deg; >100 = moving backwards, 30-100 = sideways),
// body turn this tick (deg), planted-foot slip (px/s of the lowest foot while it is on the ground), clip.
// Flags: skating = a planted foot slides faster than 25 % of the body speed while running; snapping = body turns more than 17 deg in a tick;
// sideways/backwards = velocity over 60 px/s more than 30 deg off the facing outside a roll's last ticks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, Animator } from '../../src/v2/char3d/skel.js';
import { buildClips } from '../../src/v2/char3d/clips.js';
import { Char3D, GRIP } from '../../src/v2/char3d/hero3d.js';
import { clipsFromGroup } from '../../src/v2/play/animlib.js';

const P = await import(process.env.PLAY_ENTRY || '../../src/v2/play/index.js');
const { Sim, TUNE, flatArena, driveHero, usePlayClips, UNIT } = P;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), DIR = path.join(root, 'assets/v2/char3d');
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'clips/index.json'), 'utf8')), lib = {};
for (const g of index.groups) if (['locomotion', 'combat', 'reactions', 'magic', 'enemy'].includes(g.g)) Object.assign(lib, clipsFromGroup(buildModel(readGLB(path.join(DIR, 'clips', g.file))), index));
usePlayClips(lib);
function mkChar(id) {
  const model = buildModel(readGLB(path.join(DIR, id + '.glb'))), rig = new Rig(model), asset = { model, clips: buildClips(rig, model.anims), url: 'assets/v2/char3d/' + id + '.glb' };
  const ch = Object.create(Char3D.prototype);
  Object.assign(ch, { asset, rig: new Rig(model), dx: 1, dz: 0, scale: UNIT, kbT: 0, kbSp: 0, M: new Float32Array(16), WM: new Float32Array(16), _g: new Float32Array(16), _t: new Float32Array(16), grip: { ...GRIP } });
  ch.anim = new Animator(ch.rig, asset.clips); ch.anim.play('idle', { fade: 0 }); ch.anim.update(0);
  return ch;
}
let seed = 99; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const DT = 1 / 60, ROWS = process.argv.includes('--rows'), D = 180 / Math.PI;
const dAng = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function run(name, script, n) {
  const sim = new Sim(flatArena(6000, 6000, []), {}), h = sim.hero, ch = mkChar('kael');
  const foot = (k) => { const W = ch.rig.boneWorld(k); return [h.x + (ch.dx * W[14] - ch.dz * W[12]) * UNIT, W[13] * UNIT, h.z + (ch.dz * W[14] + ch.dx * W[12]) * UNIT]; };
  const rows = []; let pf = null, pa = Math.atan2(ch.dz, ch.dx);
  for (let i = 0; i < n; i++) {
    sim.update(DT, script(i, h) ?? {}); if (sim.stop > 0) sim.stop = 0; driveHero(ch, h, DT, TUNE);
    const L = foot('footL'), R = foot('footR'), sp = Math.hypot(h.vx, h.vz), fa = Math.atan2(ch.dz, ch.dx), va = Math.atan2(h.vz, h.vx);
    let slip = null;
    if (pf) { const low = L[1] < R[1] ? 'L' : 'R', c = low === 'L' ? L : R, p = low === 'L' ? pf[0] : pf[1]; if (Math.min(L[1], R[1]) < 4 && c[1] < 4 && p[1] < 4) slip = Math.hypot(c[0] - p[0], c[2] - p[2]) / DT; }
    rows.push({ t: i + 1, sp: +sp.toFixed(0), off: sp > 20 ? +Math.abs(dAng(va, fa) * D).toFixed(0) : 0, turn: +Math.abs(dAng(fa, pa) * D).toFixed(1), slip: slip == null ? null : +slip.toFixed(0), y: +h.y.toFixed(0), anim: h.anim, clip: ch.anim.cur?.name ?? '', move: h.move?.id ?? '' });
    pf = [L, R]; pa = fa;
  }
  const runRows = rows.filter((r) => (r.anim === 'run') && r.sp > 200 && r.slip != null);
  const skate = runRows.filter((r) => r.slip > r.sp * 0.25).length, maxTurn = Math.max(...rows.map((r) => r.turn)), side = rows.filter((r) => r.sp > 60 && r.off > 30 && r.anim !== 'roll').length;
  const meanSlip = runRows.length ? runRows.reduce((s, r) => s + r.slip / r.sp, 0) / runRows.length : null;
  console.log(`${name.padEnd(12)} ticks ${n} · top speed ${Math.max(...rows.map((r) => r.sp))} px/s · max turn ${maxTurn}°/tick${maxTurn > 17 ? ' SNAP' : ''} · velocity >30° off facing (not rolling, >60 px/s): ${side} ticks · running planted-foot slip mean ${meanSlip == null ? '-' : Math.round(meanSlip * 100) + '%'} of body speed, ticks over 25 %: ${skate}/${runRows.length} · clips ${[...new Set(rows.map((r) => r.clip))].join('>')}`);
  if (ROWS) for (const r of rows) console.log('   ' + JSON.stringify(r));
  return rows;
}
run('run+stop', (i) => (i < 60 ? { mx: 1, mz: 0 } : {}), 80);
run('run depth', (i) => (i < 60 ? { mx: 0, mz: 1 } : {}), 70);
run('reversal', (i) => (i < 50 ? { mx: 1, mz: 0 } : { mx: -1, mz: 0 }), 90);
run('rev diag', (i) => (i < 50 ? { mx: 1, mz: 0 } : { mx: -0.7, mz: 0.7 }), 90);
const roll = run('roll', (i) => (i < 20 ? { mx: 1, mz: 0 } : i === 20 ? { mx: 1, mz: 0, dash: true } : { mx: 1, mz: 0 }), 60);
const rollRows = roll.filter((r) => r.anim === 'roll'); console.log(`             roll: ${rollRows.length} ticks in 'roll' · speed during roll ${rollRows.map((r) => r.sp).join(' ')}`);
const jump = run('jump', (i) => (i < 20 ? { mx: 1, mz: 0 } : i === 20 ? { mx: 1, mz: 0, jump: true, jumpHeld: true } : { mx: 1, mz: 0, jumpHeld: true }), 70);
console.log(`             jump: heights ${jump.slice(19, 56).map((r) => r.y).join(' ')}`);
const combo = run('combo mash', (i) => ({ attack: i % 4 === 0 && i < 70 }), 90);
console.log(`             combo: moves ${[...new Set(combo.map((r) => r.move).filter(Boolean))].join('>')} · ticks per move ${['c1', 'c2', 'c3'].map((m) => combo.filter((r) => r.move === m).length).join('/')}`);
const runCombo = run('run+attack', (i) => (i < 40 ? { mx: 1, mz: 0 } : { mx: 1, mz: 0, attack: i === 40 }), 70);
console.log(`             run into attack: speed ${runCombo.slice(36, 60).map((r) => r.sp).join(' ')}`);
