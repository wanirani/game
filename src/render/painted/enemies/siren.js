// T2 painted puppet (floating): 세이렌 (siren). Parts: armless body (fin-crowned skull head, ribbed torso, the long curled
// scaly tail with the torn fin: undulates by sheared strips, a swimming wave travelling down the tail), webbed clawed arm
// (near arm + darkened far arm), singing head (mouth split ear to ear, swapped in while singing).
// Driven by AI_C.siren: float (slow swim-hover, tail wave, arms sway) · sing (state cast, P.sing 0.8 s wind-up: arms spread,
// the singing head swaps in and the gills flare cyan; the song ring (ZONE_C.songring) leaves at 0.8 s) · dive (state aim:
// coils back with the claws raised · state dive: the body pitches along the velocity, claws forward, tail streams) ·
// vanish / appear (dissolves into a water swirl while the AI fades alpha) · hurt (flash, squash, recoil) · death (strip
// dissolve into water droplets, outlives the entity).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'siren', tier: 'T2', src: 'siren',
  bake: { outline: 0.35, deep: { arm: 0.55 }, deepTint: 'rgb(90,130,150)', glow: { body: '#5ab8d8' } },
};

const _q = [0, 0];
const WATER = '#9fe8ff';

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim, st = e.state;
  const f = e.facing < 0 ? -1 : 1;
  const P = e.params || {};
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const sing = an === 'sing' ? clamp(at / (P.sing ?? 0.8), 0, 1) : 0;
  const sung = an === 'sing' && at >= (P.sing ?? 0.8);
  const aim = an === 'dive' && st === 'aim' ? clamp(at / (P.aim ?? 0.4), 0, 1) : 0;
  const diving = an === 'dive' && st === 'dive';
  const fade = an === 'vanish' ? clamp(at / 0.3, 0, 1) : an === 'appear' ? 1 - clamp(at / 0.3, 0, 1) : 0;
  const bob = Math.sin(t * 1.6) * 3;
  // body pitch: dive along the velocity, coil back while aiming
  let rot = Math.sin(t * 1.1) * 0.04 - aim * 0.3 + (hurt ? -0.25 : 0) + sing * -0.08;
  if (diving) rot = clamp(Math.atan2(e.vy ?? 0, Math.abs(e.vx ?? 1)) * 0.8, -0.9, 0.9) + 0.15;
  const ax = 8 + (hurt ? -3 : 0), ay = -52 + bob;                  // chest anchor ('a')
  const sx = 1 + sq * 0.1, sy = 1 - sq * 0.08;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: ax, y: ay, rot, sx, sy }],
        { life: 0.8, strips: 14, drift: 50, rise: 10, col: WATER, kind: 0, n: 22, spread: 160, glow: '#6ad8ff', cy: -45 });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(ax - 4, ay, 40, '#4ab8e8', 0.18 + 0.3 * sing);
  // tail wave: strips below the waist shift sideways (wave travels down the tail); faster while diving,
  // a spiralling smear while vanishing
  const freq = diving ? 9 : 4.2, amp = diving ? 3.5 : 5 + fade * 14;
  const off = (u) => {
    const w = clamp((u - 0.36) / 0.64, 0, 1);
    _q[0] = (Math.sin(t * freq - u * 7) * amp * w * w - (diving ? w * w * 10 : 0) + fade * Math.sin(u * 20 + t * 12) * 6) * rig.td; _q[1] = 0; return _q;
  };
  K.pivotPos('body', 'a', 'top', ax, ay, rot, sx, sy, _q);
  const tx = _q[0], ty = _q[1];
  K.pivotPos('body', 'a', 'arm', ax, ay, rot, sx, sy, _q);
  const shx = _q[0], shy = _q[1];
  // arm angles (world dir, 0 = forward): hang/sway · spread up while singing · claws forward when diving
  let dN = 1.2 + Math.sin(t * 2.1) * 0.15, dF = 1.45 + Math.sin(t * 2.1 + 1) * 0.12;
  if (sing > 0) { dN = lerp(dN, 0.35, Math.min(1, sing * 1.6)); dF = lerp(dF, -2.2, Math.min(1, sing * 1.6)); }   // arms flung open
  if (aim > 0) { dN = lerp(dN, -0.9, aim); dF = lerp(dF, -1.2, aim); }
  if (diving) { dN = rot + 0.05; dF = rot + 0.25; }
  if (hurt) { dN += 0.6; dF += 0.5; }
  K.bone('arm', shx - 2, shy + 1, dF, 0.95, 'deep');                      // far arm behind the body
  if (!o.flash && K.lod() > 1) {                                          // cold rim so the dark tail reads on dark water
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.strips('body', 'top', tx, ty, rot, sx * 1.02, sy * 1.01, 6, 'y', off, 0.14 + 0.12 * sing, 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.strips('body', 'top', tx, ty, rot, sx, sy, K.nStrips(12), 'y', off, 1);
  // singing head swaps in
  const sk = Math.max(sung ? 1 : clamp((sing - 0.3) / 0.4, 0, 1), hurt ? 0.6 : 0);
  if (sk > 0.02) {
    K.pivotPos('body', 'a', 'head', ax, ay, rot, sx, sy, _q);
    K.put('sing', 'a', _q[0] + 1, _q[1] + 1, rot * 0.8 - 0.1 * sk, 1, 1, sk);
  }
  K.bone('arm', shx, shy, dN, 1);                                         // near arm
  if (!o.flash) {
    K.pivotPos('body', 'a', 'eye', ax, ay, rot, sx, sy, _q);
    K.glow(_q[0], _q[1], 2.2 + 1.5 * sk, '#bff8ff', 0.7);
    K.pivotPos('body', 'a', 'gill', ax, ay, rot, sx, sy, _q);
    K.glow(_q[0] - 2, _q[1] + 4, 4 + 4 * sing, '#6af0ff', 0.2 + 0.35 * sing + 0.08 * Math.sin(t * 5));
    if (sk > 0.2) {
      K.pivotPos('body', 'a', 'mouth', ax, ay, rot, sx, sy, _q);
      K.glow(_q[0] + 3, _q[1], 6 + 8 * sk, '#bff4ff', 0.3 * sk, 0.2);
    }
    if (aim > 0.3) {                                                    // claws glint before the dive
      const ap = K.part('arm'), L = ap ? ap.len : 24;
      K.glow(shx + Math.cos(dN) * L, shy + Math.sin(dN) * L, 4 + 5 * aim, '#e0ffff', aim);
    }
  }
  K.end();
  // droplets shed from the tail + bubbles; a water swirl while vanishing / appearing
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(24));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    for (let n = pool.rate(0, diving ? 14 : 4, dt); n > 0; n--) pool.add(1, e.cx - f * sc * K.frand(0, 18), e.bottom - sc * K.frand(5, 30), 0, K.frand(20, 60), K.frand(0.4, 0.8), 1.3, WATER);
    if (fade > 0) for (let n = pool.rate(1, 30, dt); n > 0; n--) { const a = K.frand(0, 6.28), r = K.frand(8, 26); pool.add(0, e.cx + Math.cos(a) * r, e.bottom - 45 + Math.sin(a) * r * 1.4, -Math.sin(a) * 90, Math.cos(a) * 90, K.frand(0.3, 0.6), K.frand(4, 8), '#7fe0ff'); }
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 8; i++) pool.add(1, e.cx + K.frand(-10, 10), e.bottom - 45 + K.frand(-10, 10), K.frand(-150, 150), K.frand(-220, -40), K.frand(0.4, 0.7), 1.6, WATER); }
    if (e.flashT <= 0) e._hitFx = false;
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
