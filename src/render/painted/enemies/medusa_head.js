// T1 painted sprite + procedural deformation: 메두사 머리 (medusa_head). Parts: the bald severed head (scaly face,
// golden slit eyes, open fanged mouth, torn bloody neck stump) and one painted snake drawn as five bending chains that
// grow from the scalp — two behind the skull (darkened), three in front — each writhing with its own phase.
// States (AI.wave, anim 'fly'): sine flight across the screen (the head pitches with the wave: nose up while rising,
// down while falling; the snakes stream back against the flight) · a periodic hiss (render clock: the snakes rear
// forward, jaws gape, eyes flare) · hurt (flash + squash + snakes recoil) · death (strip dissolve + a spray of
// blood and scales).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'medusa_head', tier: 'T1', src: 'medusa_head',
  bake: { outline: 0.35, deep: { snake: 0.6 }, deepTint: 'rgb(120,150,120)' },
};

const _q = [0, 0];
const CY = -18;
// scalp roots: [pivot, base dir (world, head unrotated), phase, scale, behind]
const SNAKES = [
  ['s5', -2.75, 0.0, 0.9, true], ['s4', -2.35, 1.7, 1.0, true],
  ['s1', -2.0, 3.1, 1.05, false], ['s2', -1.62, 4.4, 0.95, false], ['s3', -1.22, 5.6, 0.85, false],
];
let SN_T = 0, SN_PH = 0, SN_AMP = 0.3;
const writhe = (u) => SN_AMP * Math.sin(SN_T * 6 + SN_PH - u * 7) * (0.45 + u);

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const ph = e.phase ?? t * 3.2;
  // AI.wave: y = base + sin(phase)·amp → rising while cos(phase) < 0; a negative (counter-clockwise) turn lifts the nose
  const tilt = clamp(Math.cos(ph) * 0.28, -0.3, 0.3) - (hurt ? 0.3 : 0);
  const hiss = Math.pow(Math.max(0, Math.sin(t * 1.9 + (e.id?.length ?? 0))), 10);
  const sx = 1 + sq * 0.14 + hiss * 0.04, sy = 1 - sq * 0.12;
  const x = hurt ? -2 : hiss * 2, y = CY;

  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [{ name: 'head', pv: 'a', x, y, rot: tilt, sx, sy }],
        { life: 0.7, strips: 10, drift: 40, rise: 8, col: '#9a1a1a', kind: 4, n: 18, spread: 150, glow: '#ffd040', cy: CY });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  SN_T = t;
  SN_AMP = 0.3 + hiss * 0.1 + (hurt ? 0.22 : 0);
  const stream = -0.35 - (hurt ? 0.5 : 0) + hiss * 0.9;        // the snakes trail back in flight, rear forward on the hiss
  const n = K.nStrips(7);
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) K.put('head', 'a', x, y, tilt, sx, sy);
    for (const [pv, d0, p0, s, behind] of SNAKES) {
      if (behind !== (pass === 0)) continue;
      K.pivotPos('head', 'a', pv, x, y, tilt, sx, sy, _q);
      SN_PH = p0;
      K.chain('snake', _q[0], _q[1], d0 + tilt + stream * (behind ? 0.6 : 1), s, n, writhe, 1, behind ? 'deep' : 'base');
    }
  }
  if (!o.flash) {
    const ea = 0.65 + hiss * 0.35;
    K.pivotPos('head', 'a', 'eye', x, y, tilt, sx, sy, _q); K.glow(_q[0], _q[1], 2.6 + hiss * 2, '#ffd040', ea);
    K.pivotPos('head', 'a', 'eye2', x, y, tilt, sx, sy, _q); K.glow(_q[0], _q[1], 1.8 + hiss, '#ffd040', ea * 0.7);
  }
  K.end();
  // blood drips from the torn neck (render particles, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(8));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    for (let k = pool.rate(0, K.lod() === 0 ? 1.5 : 3, dt); k > 0; k--) pool.add(1, e.cx + f * sc * lerp(-6, 2, K.fr()), e.bottom - 2 * sc, -(e.vx ?? 0) * 0.3, K.frand(20, 60), K.frand(0.4, 0.7), 1.3, '#7a0a10');
    ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
  }
}
