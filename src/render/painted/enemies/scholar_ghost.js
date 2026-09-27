// T1 painted sprite (ghost pipeline): 학자 유령 (scholar_ghost). The painted spectral old scholar (mortarboard, round
// spectacles, long beard, black gown dissolving into blue mist, one hand reaching out) re-rastered through a seam-free
// warpY: the misty hem streams and ripples; the floating grimoire circles beside it; spectral wisps shed from the hem.
// Driven by AI_A.teleporter: appear (0.45 s: the figure condenses — stretched, translucent, fading in) · float (bob,
// translucent flicker) · cast (the book flies open in front of it, the reaching hand kindles a spinning rune ring,
// glint just before the glyphs fire at params.castT) · vanish (0.45 s: stretches and fades into mist) · hidden
// (nothing drawn) · hurt (flash, recoil) · death (strip dissolve into blue ectoplasm).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';
import { runeCircle } from './blood_skeleton.js';

export const spec = {
  id: 'scholar_ghost', tier: 'T1', src: 'scholar_ghost',
  bake: { outline: 0.3, outlineParts: { body: 0.55 }, glow: { body: '#9fb8ff', book: '#a0b8ff' } },
};

const _q = [0, 0];
const MIST = '#9fc8ff';
let T = 0, TRAIL = 0, TD = 2;
function hemOff(u) {    // u = 0 at the chest pivot … 1 at the hood / the hem: only the lower half streams and ripples
  const w = Math.max(0, u - 0.25) / 0.75;
  _q[0] = (-(w * w) * TRAIL - Math.sin(T * 4 - u * 5) * w * 3) * TD; _q[1] = 0;
  return _q;
}

export function draw(ctx, e, world, o, rig) {
  T = e.t ?? 0; TD = rig.td;
  const an = e.anim, at = e.animT ?? 0;
  const cast = an === 'cast';
  const k = cast ? clamp(at / (e.params?.castT ?? 0.7), 0, 1) : 0;
  let a = 0.82;
  if (an === 'appear') a = clamp(at / 0.45, 0, 1) * 0.82;
  if (an === 'vanish') a = (1 - clamp(at / 0.45, 0, 1)) * 0.82;
  if (an === 'hidden') a = 0;
  const dist = an === 'appear' || an === 'vanish' ? 1 - a / 0.82 : 0;
  const f = e.facing < 0 ? -1 : 1;
  const vx = (e.vx ?? 0) * f;
  TRAIL = 3 + Math.min(12, Math.abs(vx) * 0.12);
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const by = -44 + Math.sin(T * 2) * 3;
  const lean = clamp(vx * 0.003, -0.2, 0.3) - (hurt ? 0.25 : 0) - k * 0.06;
  const sx = (1 - dist * 0.5) * (1 + sq * 0.1), sy = (1 + dist * 0.6) * (1 - sq * 0.1);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      // killed while (almost) invisible — mid appear / vanish: the dissolve starts fully opaque, so a figure that was
      // not on screen would pop in to die. Enemy.die's soul burst is the whole death then (the vector path does the same)
      if (a < 0.35) return;
      K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: 0, y: by, rot: lean, sx, sy }],
        { life: 0.9, strips: 14, drift: 46, rise: 24, col: MIST, kind: 0, n: 22, spread: 120, glow: '#6a8aff', cy: -40 });
    }
    return;
  }
  if (a <= 0.01 && !o.flash) return;
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(0, by - 4, 46, '#8aa0ff', 0.34 * a);
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (o.flash ? 1 : a + 0.12 + 0.06 * Math.sin(T * 1.7));
  if (!o.flash && K.lod() > 1) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('body', 'a', -TRAIL * 0.2, by, lean, sx * 1.04, sy * 1.02, 0.18, 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.warpY('body', 'a', 0, by, lean, sx, sy, K.nStrips(10), hemOff, 1, 'base', 2);
  // the grimoire: circles beside the ghost while floating, flies open in front of it to cast
  const orbit = T * 1.1;
  const bxF = 22 + Math.cos(orbit) * 4, byF = by - 6 + Math.sin(orbit * 1.3) * 3;
  const bx = lerp(bxF, 26, ease.outCubic(k)), bb = lerp(byF, by - 14, ease.outCubic(k));
  const bs = 0.62 + 0.22 * k;
  K.put('book', 'a', bx, bb, Math.sin(orbit) * 0.15 - 0.2 * k, bs, bs * (0.8 + 0.2 * Math.sin(T * 3)), 1);
  ctx.globalAlpha = ga;
  if (!o.flash) {
    for (const pn of ['eye', 'eye2']) { K.pivotPos('body', 'a', pn, 0, by, lean, sx, sy, _q); K.glow(_q[0], _q[1], 2.2 + k, '#a0c0ff', 0.7 * a + 0.2); }
    if (cast) {
      K.glow(bx, bb, 14 + k * 10, '#a0b8ff', 0.8 * k);
      K.pivotPos('body', 'a', 'hand', 0, by, lean, sx, sy, _q);
      runeCircle(ctx, _q[0] + 4, _q[1] - 4, 8 + k * 10, T * 3, '#b0c0ff', k, false);
      if (k > 0.55) glint(ctx, _q[0] + 4, _q[1] - 4, 5 + 7 * k, '#e0e8ff', (k - 0.55) / 0.45);
    }
  }
  K.end();
  // spectral wisps shed from the hem (world space, per second)
  if (world && o.cam && a > 0.05) {
    const pool = e._fx ?? (e._fx = new K.FxPool(20));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    const hx = e.cx - f * sc * (6 + TRAIL * 0.5), hy = e.bottom + sc * (by + 36);
    for (let n = pool.rate(0, (K.lod() === 0 ? 6 : 12) * a, dt); n > 0; n--) pool.add(0, hx + K.frand(-12, 12), hy + K.frand(-6, 6), -f * K.frand(8, 30) - (e.vx ?? 0) * 0.2, K.frand(-26, -6), K.frand(0.6, 1.1), K.frand(5, 9), MIST);
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
