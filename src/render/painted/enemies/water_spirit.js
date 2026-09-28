// T1 painted sprite: 물의 정령 (water_spirit, 40×66, flying). One painted figure from the Kling parts sheet (soft matte): the
// translucent water maiden with glowing white eyes and heart, a gown of flowing water and a water ribbon wrapped around
// her. She sways through a seam-free warp (hair and hem ripple like water), glows from within, sheds droplets.
// Driven by AI_B.spirit: float (bobbing, slow ripple) · cast (0.6 s: the ribbon whips faster, light gathers between the
// hands and at the heart, glint in front → the AI looses 3 wave orbs from cy−6, a burst of spray) · summon (0.35 s: the
// hands flare, a column of light rises under her → the AI raises the water pillar under the player) · hurt · death
// (dissolves into falling water).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'water_spirit', tier: 'T1', src: 'water_spirit',
  bake: { outline: 0, glow: { body: '#3aa8ff' } },
};

const _q = [0, 0], _h = [0, 0], _r = [0, 0], _e = [0, 0];
let T = 0, AMP = 1, TD = 2;
function sway(u) { _q[0] = (Math.sin(T * 2.2 + u * 4) * 1.6 + Math.sin(T * 3.7 - u * 6) * 0.5) * AMP * u * TD; _q[1] = 0; return _q; }

function die(e, world, rig, bob) {
  e._pcorpse = true;
  K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: 0, y: bob, rot: 0, sx: 1, sy: 1 }],
    { life: 0.9, strips: 10, drift: 30, rise: -20, col: '#8ad8ff', kind: 1, n: 22, spread: 120, glow: '#3aa8ff', cy: -33 });
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const cast = an === 'cast', summon = an === 'summon';
  const ck = cast ? clamp(at / 0.6, 0, 1) : summon ? clamp(at / 0.35, 0, 1) : 0;
  const after = cast ? clamp((at - 0.6) / 0.3, 0, 1) : summon ? clamp((at - 0.35) / 0.3, 0, 1) : 0;
  const bob = Math.sin(t * 2.2) * 3;
  if (e.dying > 0 && world) { if (!e._pcorpse) die(e, world, rig, bob); return; }
  T = t * (1 + ck * 1.5); TD = rig.td; AMP = 1 + ck * 1.2 + K.squashK(e) * 2;
  const sq = K.squashK(e);
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(0, -38 + bob, 46, '#3aa8ff', 0.26 + ck * 0.2);
  const sx = 1 + 0.06 * sq, sy = 1 - 0.06 * sq;
  K.pivotPos('body', 'a', 'mid', 0, bob, 0, sx, sy, _h);
  if (K.lod() > 0) K.warpY('body', 'mid', _h[0], _h[1], 0, sx, sy, K.nStrips(10), sway, 0.9, 'base', 1);
  else K.put('body', 'a', 0, bob, 0, sx, sy, 0.9);
  if (!o.flash) {
    K.pivotPos('body', 'a', 'heart', 0, bob, 0, sx, sy, _h);
    const pk = 0.5 + 0.5 * Math.sin(t * 3);
    K.glow(_h[0], _h[1], 5 + pk * 2 + ck * 6, '#e8fbff', 0.45 + 0.2 * pk + ck * 0.4, 0.2);
    K.pivotPos('body', 'a', 'eye', 0, bob, 0, sx, sy, _e);
    K.glow(_e[0], _e[1], 3 + ck * 2, '#ffffff', 0.5 + ck * 0.4, 0.2);
    K.pivotPos('body', 'a', 'handL', 0, bob, 0, sx, sy, _h);
    K.pivotPos('body', 'a', 'handR', 0, bob, 0, sx, sy, _r);
    if (ck > 0) {
      K.glow(_h[0], _h[1], 4 + ck * 6, '#8ad8ff', ck * 0.8);
      K.glow(_r[0], _r[1], 4 + ck * 6, '#8ad8ff', ck * 0.8);
    }
    if (cast && after <= 0) {
      // light gathers in front of her (the orbs leave from cy − 6, 16 px ahead)
      K.glow(16, -39 + bob, 5 + ck * 9, '#bff0ff', ck, 0.3);
      if (ck > 0.5) glint(ctx, 16, -39 + bob, 4 + 6 * ck, '#e8fbff', (ck - 0.5) * 2);
    }
    if (summon) {
      K.glow(0, -6 + bob, 14 + ck * 14, '#6ad8ff', ck * 0.6 * (1 - after));
      if (ck > 0.5 && after <= 0) glint(ctx, 0, -74 + bob, 4 + 6 * ck, '#e8fbff', (ck - 0.5) * 2);
    }
  }
  K.end();
  // droplets shed off the hem, spray on the cast (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(20));
    const dt = pool.step(K.clockOf(e, world));
    const sc = (e.scale || 1) * (rig.scale ?? 1), f = e.facing < 0 ? -1 : 1;
    for (let n = pool.rate(0, K.lod() === 0 ? 3 : 6, dt); n > 0; n--) pool.add(1, e.cx + K.frand(-12, 12) * sc, e.bottom + (bob - K.frand(0, 8)) * sc, K.frand(-10, 10), K.frand(10, 40), K.frand(0.4, 0.8), 1.3 * sc, '#8ad8ff');
    if (after > 0 && after < 0.3 && !e._burst) { e._burst = true; for (let i = 0; i < 10; i++) pool.add(0, e.cx + f * 16 * sc, e.bottom + (-39 + bob) * sc, f * K.frand(40, 200), K.frand(-120, 60), K.frand(0.25, 0.45), K.frand(2, 3.5) * sc, '#bff0ff'); }
    if (after <= 0) e._burst = false;
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
