// T1 painted sprite: 마도서 악령 (book_fiend). The painted grimoire seen from the front, cut in two halves that flap
// about the spine like wings (each half scaled in X = the cover turning in depth, the outer edge lifting), the fanged
// eye in the gutter on top (looks around, pulses, snaps), and the red ribbon swaying below (strip warp).
// Driven by AI_A.bookfiend: fly (8.5 rad/s flapping, bob, loose pages flutter off) · cast (the pages blaze gold, a
// rune circle spins in front of the book, the eye glares — glint on the leading edge before the paper blades fly at
// params.castT) · bite (every third attack: frantic flapping, the book tips forward and the maw lunges) · hurt
// (flash + squash, pages burst) · death (strip dissolve into paper scraps and embers).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { glint } from './_biped.js';
import { runeCircle } from './blood_skeleton.js';

export const spec = {
  id: 'book_fiend', tier: 'T1', src: 'book_fiend',
  bake: { outline: 0.35, glow: { halfL: '#ffcf60', halfR: '#ffcf60' } },
};

const _q = [0, 0];
let T = 0, TD = 2;
function sway(u) {
  _q[0] = (Math.sin(T * 4 - u * 3) * 3 * u + Math.sin(T * 7 - u * 5) * u * 0.8) * TD; _q[1] = 0;
  return _q;
}

export function draw(ctx, e, world, o, rig) {
  T = e.t ?? 0; TD = rig.td;
  const an = e.anim, at = e.animT ?? 0;
  const cast = an === 'cast', bite = an === 'bite';
  const k = cast ? clamp(at / (e.params?.castT ?? 0.55), 0, 1) : 0;
  const ph = T * (bite ? 16 : 8.5);
  const c1 = bite ? 0.35 + Math.abs(Math.sin(ph)) * 0.6 : 0.72 + Math.sin(ph) * 0.24 + k * 0.12;
  const c2 = bite ? c1 : 0.72 + Math.sin(ph + 0.35) * 0.24 + k * 0.12;
  const l1 = Math.cos(ph) * 0.09, l2 = Math.cos(ph + 0.35) * 0.09;
  const by = -17 + Math.sin(T * 3) * 2.5;
  const sq = K.squashK(e);
  const rot = Math.sin(T * 2.2) * 0.08 + (bite ? 0.2 : 0) + (cast ? Math.sin(T * 40) * 0.04 * k : 0);
  const S = 1 - sq * 0.08;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      const pl = [{ name: 'halfL', pv: 'a', x: 0, y: by, rot, sx: c1, sy: 1 }, { name: 'halfR', pv: 'a', x: 0, y: by, rot, sx: c2, sy: 1 }, { name: 'maw', pv: 'a', x: 0, y: by + 1.6, rot }];
      K.spawnDissolve(world, e, rig, pl, { life: 0.8, strips: 10, drift: 60, rise: 16, col: '#efe4c8', kind: 4, n: 20, spread: 160, glow: '#ff8040', cy: -17 });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) {
    K.glow(0, by, 26, '#ff4060', 0.28);
    if (cast) { K.glow(0, by, 30 + k * 12, '#ffcf60', 0.5 * k); runeCircle(ctx, 0, by, 22 + k * 7, T * 2, '#ffd070', 0.8 * k, false); }
  }
  // ribbon hangs from the spine (behind the pages)
  K.pivotPos('halfL', 'a', 'a', 0, by, rot, 1, 1, _q);
  const sx0 = _q[0], sy0 = _q[1];
  K.strips('ribbon', 'a', sx0 + Math.sin(rot) * 16, sy0 + 15, rot * 0.5, S, S, K.nStrips(5), 'y', sway, 1);
  // the two halves flap about the spine; the outer edges lift with the stroke
  K.put('halfL', 'a', sx0, sy0, rot - l1, c1 * S, S);
  K.put('halfR', 'a', sx0, sy0, rot + l2, c2 * S, S);
  if (cast && !o.flash && k > 0.05) {          // the runes on the pages blaze while casting
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('halfL', 'a', sx0, sy0, rot - l1, c1 * S, S, 0.35 * k * (0.7 + 0.3 * Math.sin(T * 10)), 'glow');
    K.put('halfR', 'a', sx0, sy0, rot + l2, c2 * S, S, 0.35 * k * (0.7 + 0.3 * Math.cos(T * 11)), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  // the fanged eye in the gutter: narrows when biting, the whole maw lunges forward
  const mawS = 0.8 + 0.2 * (c1 + c2) / 2, eo = bite ? 0.72 + Math.abs(Math.sin(ph)) * 0.3 : 1;
  const mx = sx0 + (bite ? 4 * clamp(at / 0.3, 0, 1) : 0);
  K.put('maw', 'a', mx, sy0 + 1.6, rot, mawS * S, eo * S);
  if (!o.flash) {
    K.pivotPos('maw', 'a', 'eye', mx, sy0 + 1.6, rot, mawS, eo, _q);
    K.glow(_q[0] + Math.sin(T * 1.3) * 1.2, _q[1], 8, '#ff3040', 0.45 + k * 0.4);
  }
  if (k > 0.55) glint(ctx, 18, by, 5 + 7 * k, '#fff0c0', (k - 0.55) / 0.45);
  if (bite && at < 0.3) glint(ctx, 18, by, 8, '#ff9080', at / 0.3);
  K.end();
  // loose pages flutter off behind it (world space, per second)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(10));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    for (let n = pool.rate(0, cast ? 5 : 1.5, dt); n > 0; n--) pool.add(4, e.cx - f * sc * K.frand(6, 14), e.bottom + sc * (by + K.frand(-8, 8)), -f * K.frand(20, 60), K.frand(-90, -30), K.frand(0.6, 1.0), K.frand(2, 3.2) * sc, '#efe2c4');
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 6; i++) pool.add(4, e.cx, e.bottom + sc * by, K.frand(-140, 140), K.frand(-200, -40), K.frand(0.5, 0.8), K.frand(2, 3.5) * sc, '#f4e8cc'); }
    if (e.flashT <= 0) e._hitFx = false;
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
