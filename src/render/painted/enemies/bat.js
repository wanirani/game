// T1 painted sprite + procedural deformation: 흡혈 박쥐 (bat, also golden_bat-ready). Parts: compact furry flying body
// ('fly', front 3/4, claws tucked — a dedicated Step-3 single-part image), one painted wing (mirrored for the other
// side), wrapped hanging cocoon.
// Wings flap through a mesh-free BENDING CHAIN (6 strips, root → tip, the tip lags the stroke), body squash/stretch and
// bob synced to the wing beat, tilt toward the flight direction.
// States (AI_A.vbat): hang (cocoon under the ceiling, breathing sway) · drop (0.28 s wake-up: cocoon → wings unfurl) ·
// dive (lunge: wings swept back, body pitched along the velocity) · fly / hover (sine flight, beat 19 / 14 rad/s) ·
// hurt (flash, squash, wings jolt) · death (strip dissolve + embers, outlives the entity).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'bat', tier: 'T1', src: 'bat',
  bake: { outline: 0.4, deep: { wing: 0.7 }, deepTint: 'rgb(170,150,170)' },
};

const _q = [0, 0];
const EYES = ['eyeL', 'eyeR'];
const PI = Math.PI;

function wingDirs(e, t) {
  // returns { beat A (-1..1), open 0..1, lift } for the current state
  const st = e.state, anim = e.anim;
  let freq = st === 'hover' ? 14 : 19, open = 1, sweep = 0;
  if (st === 'dive') { freq = 26; sweep = 1; }
  if (st === 'drop') open = clamp((e.stateT ?? 0) / (0.28 / Math.sqrt(e.aggro || 1)), 0, 1);   // AI_A.vbat drop time
  if (anim === 'idle' && st !== 'fly') freq = 16;
  const A = Math.sin(t * freq);
  return { A, open, sweep, freq };
}

/** flying body part ('body' = name used by atlases built before the dedicated flight pose existed) */
const bodyOf = (rig) => (rig.parts.fly ? 'fly' : 'body');

export function draw(ctx, e, world, o, rig) { drawBat(ctx, e, world, o, rig, DEF); }
const DEF = { eye: '#ff2a3a', eyeA: 0.7, death: '#ff5a3a', hang: true };

/** shared by golden_bat.js (gold-recoloured atlas): opt = { eye, eyeA, death, hang } */
export function drawBat(ctx, e, world, o, rig, opt = DEF) {
  const t = e.t ?? 0, s = 1, BODY = bodyOf(rig);
  const hanging = opt.hang && (e.anim === 'hang' || e.state === 'hang');
  const W = wingDirs(e, t);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      const cy = -13;
      K.begin(ctx, rig, 0);                        // wing roots from the body's pivots (same joints as in flight)
      K.pivotPos(BODY, 'a', 'wl', 0, cy, 0, 1, 1, _q); const lx = _q[0] + 1, ly = _q[1];
      K.pivotPos(BODY, 'a', 'wr', 0, cy, 0, 1, 1, _q); const rx = _q[0] - 1, ry = _q[1];
      K.end();
      K.spawnDissolve(world, e, rig, [
        { name: 'wing', pv: 'a', x: lx, y: ly, rot: PI + 0.3, sx: 1, sy: -1, vn: 'deep' },
        { name: 'wing', pv: 'a', x: rx, y: ry, rot: -0.3 },
        { name: BODY, pv: 'a', x: 0, y: cy },
      ], { life: 0.7, strips: 9, drift: 40, col: opt.death, n: 18, spread: 170, cy });
    }
    return;
  }
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  K.begin(ctx, rig, K.flashK(e, o));
  if (opt.hang && (hanging || (e.state === 'drop' && W.open < 1))) {
    // cocoon hanging from the ceiling: grip at the entity's top, slow sway + breathing
    const top = -(e.def?.size?.h ?? 26);
    const k = hanging ? 1 : 1 - W.open;
    const br = 1 + Math.sin(t * 2.2) * 0.03;
    K.put('hang', 'a', 0, top, Math.sin(t * 1.8) * 0.08, 1 + sq * 0.1, br - sq * 0.1, k);
    // sleeping face: a slow red eye-glint so a hanging bat stays findable on dark stages and phones
    if (!o.flash) { K.pivotPos('hang', 'a', 'face', 0, top, Math.sin(t * 1.8) * 0.08, 1, br, _q); K.glow(_q[0], _q[1], 6, '#ff2a3a', (0.45 + 0.2 * Math.sin(t * 2.2)) * k); }
    if (hanging) { K.end(); return; }
  }
  const cy = -13;
  const vx = (e.vx ?? 0) * (e.facing < 0 ? -1 : 1), vy = e.vy ?? 0;
  const bob = -W.A * 2.2;                         // body rises on the down-stroke
  let tilt = clamp(vy * 0.0012, -0.35, 0.35) + clamp(vx * 0.0006, -0.2, 0.2);
  if (W.sweep) tilt = clamp(Math.atan2(vy, Math.abs(vx) + 1) * 0.6, -0.6, 0.9);
  if (hurt) tilt -= 0.25;
  const sy = 1 + W.A * 0.05 - sq * 0.12, sx = 1 - W.A * 0.03 + sq * 0.12;
  const alpha = e.state === 'drop' ? W.open : 1;
  // wing root angle (world dir of the right-hand wing): up-stroke raises it, dive sweeps both back and up
  const openA = lerp(-1.35, 0, W.open);           // folded (up along the body) → spread
  let dirR = -0.12 - W.A * 0.62 + openA - (hurt ? 0.5 : 0);
  if (W.sweep) dirR = -0.95 + W.A * 0.12;
  const bend = (u) => (W.sweep ? -0.16 : 0.2 * Math.cos(t * W.freq) - 0.03) * (0.4 + u) + (1 - W.open) * -0.25;
  K.pivotPos(BODY, 'a', 'wl', 0, cy + bob, tilt, sx, sy, _q); const wlx = _q[0], wly = _q[1];
  K.pivotPos(BODY, 'a', 'wr', 0, cy + bob, tilt, sx, sy, _q); const wrx = _q[0], wry = _q[1];
  K.shadow(12, 0.18, 0);
  // far wing (left, behind), near wing (right)
  K.chain('wing', wlx + 1, wly, PI - dirR + tilt, 0.9 * s, K.nStrips(6), (u) => -bend(u), alpha, 'deep', true);
  K.chain('wing', wrx - 1, wry, dirR + tilt, s, K.nStrips(6), bend, alpha);
  K.put(BODY, 'a', 0, cy + bob, tilt, sx, sy, alpha);
  if (!o.flash) {
    for (const pn of EYES) { K.pivotPos(BODY, 'a', pn, 0, cy + bob, tilt, sx, sy, _q); K.glow(_q[0], _q[1], 2.4, opt.eye, opt.eyeA * alpha); }
  }
  K.end();
}
