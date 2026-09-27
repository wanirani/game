// T1 painted sprite + procedural deformation: 도깨비불 (wisp). Two painted frames of the same teal soul flame with a
// screaming skull in its core (reference = jaw half open, frame 2 = jaw wide open), crossfaded while charging.
// The flame tongues flicker through a sheared strip warp around the skull (the skull row stays put, the tips lash and
// trail against the drift direction); additive halo + white-hot core; embers rise from the tips (render particles,
// emitted per second of game time).
// States (AI_A.wisp): fly / drift (bob, lean into the drift, tongues trail back) · charge (0.55 s: the flame swells to
// +45 %, the jaw opens wide, the core flares and a ring contracts onto it, glint at the end = the instant the three
// soulfire bolts leave) · hurt (flash + squash + flame gutters) · death (strip dissolve + teal ember burst).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'wisp', tier: 'T1', src: 'wisp',
  bake: { outline: 0.3, glow: { body: '#40ffc0' } },
};

const _q = [0, 0];
const EYES = ['eyeL', 'eyeR'];
const TEAL = '#40ffc0', PALE = '#b8fff0';
const CY = -9;              // eye line (local): the skull sits in the 24x24 logic rect, the tongues rise above it
const S0 = 0.92;

let OFF_T = 0, OFF_L = 0, OFF_A = 0, OFF_TD = 1;
/** strip offsets (texels): rows above the skull lash sideways and trail back against the drift; the chin row stays */
function flick(u, i) {
  const w = u * u;
  _q[0] = (Math.sin(OFF_T * 9 - u * 6 + i * 0.3) * 2.2 * OFF_A * u + OFF_L * w * 7) * OFF_TD;
  _q[1] = 0;
  return _q;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const charge = e.anim === 'charge';
  const ck = charge ? clamp((e.animT ?? 0) / (e.params?.chargeT ?? 0.55), 0, 1) : 0;
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const f = e.facing < 0 ? -1 : 1;
  const vx = (e.vx ?? 0) * f, vy = e.vy ?? 0;
  const bob = Math.sin(t * 3.1) * 1.6;
  const lean = clamp(vx * 0.0016, -0.22, 0.22) + clamp(vy * 0.0006, -0.08, 0.08);
  const swell = 1 + ease.outCubic(ck) * 0.45 + Math.sin(t * 9) * 0.035;
  const sx = S0 * swell * (1 + sq * 0.16), sy = S0 * swell * (1 - sq * 0.14) * (1 + Math.sin(t * 11) * 0.02);
  const x = hurt ? -2 : 0, y = CY + bob;

  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x, y, rot: lean, sx, sy }],
        { life: 0.7, strips: 12, drift: 44, rise: 30, col: '#80ffd8', kind: 3, n: 20, spread: 160, glow: TEAL, cy: CY - 4 });
    }
    return;
  }

  K.begin(ctx, rig, K.flashK(e, o));
  const hi = K.lod() > 1;
  // halo behind the flame (brighter while charging)
  if (!o.flash) K.glow(x, y - 8 * sy, 26 + ck * 14, TEAL, 0.42 + ck * 0.35);
  OFF_T = t; OFF_L = -clamp(vx / 160, -1, 1) - 0.25; OFF_A = 1 + ck * 0.6 + (hurt ? 1.2 : 0); OFF_TD = rig.td / sx;
  const n = K.nStrips(7);
  const open = charge ? ease.inOutQuad(clamp(ck * 1.6, 0, 1)) : 0;
  if (open < 0.98) K.strips('body', 'a', x, y, lean, sx, sy, n, 'y', flick, 1);
  if (open > 0.02) K.strips('open', 'a', x, y, lean, sx, sy, n, 'y', flick, open);
  if (!o.flash) {
    // additive soul-fire pass of the silhouette (high quality only) + white-hot core + eye embers
    if (hi) {
      const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      K.put('body', 'a', x, y, lean, sx * 1.03, sy * 1.02, 0.14 + 0.1 * Math.sin(t * 7) + ck * 0.14, 'glow');
      ctx.globalCompositeOperation = gco;
    }
    K.pivotPos('body', 'a', 'core', x, y, lean, sx, sy, _q);
    K.glow(_q[0], _q[1], 6 + ck * 6, PALE, 0.28 + ck * 0.28, 0.2);
    for (const pn of EYES) {
      K.pivotPos(open > 0.5 ? 'open' : 'body', 'a', pn, x, y, lean, sx, sy, _q);
      K.glow(_q[0], _q[1], 2.2 + ck * 1.6, '#e8fff8', 0.8);
    }
  }
  K.end();
  // charge: a ring contracts onto the core, glint on release (same cue as the vector wisp)
  if (charge && !o.flash) {
    K.begin(ctx, rig, 0); K.local();
    const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ga * 0.65 * ck;
    ctx.strokeStyle = '#78ffdc'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y - 3, lerp(26, 9, ck), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
    if (ck > 0.6) glint(ctx, x, y - 3, 8 + 6 * ck, '#c0fff0', (ck - 0.6) / 0.4);
    K.end();
  }
  // embers rising from the tongues (world space, camera transform), a gutter burst when hit
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(18));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    const hx = e.cx, hy = e.bottom + sc * (y - 16 * sy);
    for (let k = pool.rate(0, (K.lod() === 0 ? 5 : 9) * (1 + ck), dt); k > 0; k--) pool.add(3, hx + K.frand(-7, 7) * sc, hy + K.frand(-4, 6) * sc, -f * K.frand(8, 30) - (e.vx ?? 0) * 0.3, K.frand(-60, -25), K.frand(0.4, 0.8), K.frand(1.2, 2.4) * sc, '#8affe0');
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let k = 0; k < 7; k++) pool.add(0, e.cx + K.frand(-8, 8), e.bottom + sc * (CY + K.frand(-8, 6)), K.frand(-110, 110), K.frand(-120, 40), K.frand(0.3, 0.55), K.frand(3, 6), TEAL); }
    if (e.flashT <= 0) e._hitFx = false;
    ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
  }
}
