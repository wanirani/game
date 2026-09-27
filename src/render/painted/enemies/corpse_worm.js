// T1 painted sprite: 시체 벌레 (corpse_worm). One painted giant maggot bent along a bending chain (7 strips, tail → head
// along the belly line), so the body ripples like a crawling larva and the front third can rear up.
// Driven by AI.walker: idle (slow breathing ripple, mouth works) · walk (peristaltic crawl wave running tail → head,
// segments bunch and stretch) · attack (wind-up: the front of the body rears up and the lamprey mouth gapes with a glint
// → strike at params.windup: it lunges forward and slams the mouth down → recovery) · hurt (flash + squash, blood
// drips) · death (the body bursts: strip dissolve with gore chips + a dark blood splash). Drool drips from the mouth.
import * as K from '../enemy_kit.js';
import { clamp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'corpse_worm', tier: 'T1', src: 'corpse_worm',
  bake: { outline: 0.35 },
};

const _q = [0, 0];
let T = 0, WALK = 0, REAR = 0, LUNGE = 0, N = 7;
function bend(u) {
  // crawl wave (walk) / breathing ripple (idle): alternating small bends travelling tail → head
  const w = WALK ? Math.cos(T * 8 - u * 7) * 0.075 : Math.cos(T * 2 - u * 5) * 0.022;
  // rear-up: the front 40 % curls upward (negative = up), then the lunge throws the head back down
  const front = Math.max(0, u - 0.4) / 0.6;
  return (w - front * REAR * 1.25 + front * LUNGE * 0.3) * (7 / N);
}

export function draw(ctx, e, world, o, rig) {
  T = e.t ?? 0; WALK = e.anim === 'walk' ? 1 : 0;
  const P = e.params || {};
  const ap = e.anim === 'attack' ? K.atkPhase(e.animT ?? 0, P.windup ?? 0.45, 0.1) : null;
  REAR = ap ? (ap.s <= 0 ? ease.outCubic(ap.w) : 1 - ease.inCubic(ap.s)) : 0;
  LUNGE = ap && ap.s > 0 ? ease.outBack(ap.s) * clamp(1 - ap.after / 0.35, 0, 1) : 0;
  N = K.nStrips(7);
  const sq = K.squashK(e);
  // the lunge throws the whole worm forward and stretches it (length only: sy2 keeps the girth) so the maw reaches
  // the far end of the AI's strike rect (hit x 6..58)
  const x0 = -28 + LUNGE * 13 - REAR * 2 + (WALK ? Math.sin(T * 8) * 0.8 : 0);
  const st = 1 + LUNGE * 0.2;
  const sy2 = (1 + (WALK ? Math.sin(T * 8) * 0.05 : Math.sin(T * 2) * 0.02) - sq * 0.14) / st;
  const s = (1 + sq * 0.08) * st;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: x0, y: -3.2, rot: 0 }],
        { life: 0.7, strips: 10, drift: 40, rise: 6, col: '#8a1414', kind: 4, n: 18, spread: 170, cy: -10, layer: 'back' });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(26, 0.3);
  if (!o.flash) K.glow(-6, -1, 24, '#3a0406', 0.3, 0.7);          // wet stain under it
  K.chain('body', x0, -3.2, 0, s, N, bend, 1, 'base', false, sy2);
  // head position (end of the chain): accumulate the same bends
  let jx = x0, jy = -3.2, cum = 0;
  const p = K.part('body'), L = p.len * s;
  for (let i = 0; i < N; i++) { cum += bend(i / N); jx += Math.cos(cum) * L / N; jy += Math.sin(cum) * L / N; }
  if (!o.flash) {
    const c = Math.cos(cum), sn = Math.sin(cum), ex = -5.6 * s, ey = -5.9 * s * sy2;       // eye relative to the head end
    K.glow(jx + c * ex - sn * ey, jy + sn * ex + c * ey, 1.8 + REAR, '#ff3040', 0.85);
    if (REAR > 0.05) K.glow(jx - 2, jy - 3, 5 + 5 * REAR, '#ff6070', 0.3 * REAR);
  }
  if (ap && ap.s <= 0 && ap.w > 0.5) glint(ctx, jx + 2, jy - 4, 5 + 5 * ap.w, '#ffd0d0', (ap.w - 0.5) * 2);
  K.end();
  // drool / blood drips from the mouth (world space, per second)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(10));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    for (let n = pool.rate(0, 1.6 + REAR * 4 + (e.flashT > 0 ? 8 : 0), dt); n > 0; n--) pool.add(1, e.cx + f * sc * (jx - 1), e.bottom + sc * (jy - 1), 0, K.frand(10, 40), K.frand(0.3, 0.55), 1.2, '#b8c890');
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
