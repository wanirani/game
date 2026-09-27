// T1 painted sprite + procedural deformation (ghost pipeline): 유리 망령 (glass_wraith). Parts: armless glass body (cracked
// mirror-pane torso, glass-bone skull, shard-mist tail), splinter arm with needle claws, screaming head (swapped in),
// six void-glass shards from the shared glass sheet (orbit, gather, shatter).
// The body is a seam-free warpY cloth warp (the shard tail streams back and ripples), bob + lean into motion, cold rim glow.
// States (AI_B.wraith, anims 'float' 'cast' 'vanish', state 'appear'): float (shard cloud orbits the tail) · cast (0.65 s:
// the arm reaches for the player, the shards spiral into the claw and flare, the screaming head swaps in; the frost bolts
// leave at 0.65 s) · vanish (the figure SHATTERS: strips of the body fly apart with the shards while the AI fades alpha) ·
// appear (the same shatter in reverse) · hurt (flash, squash, crack flare, shard burst) · death (strip dissolve into glass
// dust with a burst of shards, outlives the entity).
import * as K from '../enemy_kit.js';
import { clamp, lerp, TAU } from '../../../core/math.js';

export const spec = {
  id: 'glass_wraith', tier: 'T1', src: 'glass_wraith',
  bake: { outline: 0.35, outlineParts: { body: 0.6 }, glow: { body: '#9fdcff', scream: '#9fdcff' }, flash: ['body', 'arm', 'scream'] },
};

const _q = [0, 0], _d = [0, 0];
const ICE = '#cfefff';
const SH = ['sh1', 'sh2', 'sh3', 'sh4', 'sh5', 'sh6'];

/** shatter amount 0..1 (vanish: 0→1, appear: 1→0) */
function shatterOf(e) {
  if (e.anim === 'vanish') return clamp((e.animT ?? 0) / 0.3, 0, 1);
  if (e.state === 'appear') return 1 - clamp((e.stateT ?? 0) / 0.3, 0, 1);
  return 0;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0;
  const f = e.facing < 0 ? -1 : 1;
  const vx = (e.vx ?? 0) * f, vy = e.vy ?? 0, spd = Math.hypot(vx, vy);
  const cast = e.anim === 'cast' ? clamp(at / 0.65, 0, 1) : 0;
  const fired = e.anim === 'cast' && at >= 0.65;
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const shat = shatterOf(e);
  const bob = Math.sin(t * 2.2) * 3;
  const lean = clamp(vx * 0.003, -0.2, 0.35) + cast * 0.22 - (hurt ? 0.3 : 0);
  const ax = cast * 4 - (hurt ? 4 : 0), ay = -40 + bob;
  const breath = 1 + Math.sin(t * 1.9) * 0.02;
  const sx = 1 + sq * 0.12, sy = breath * (1 - sq * 0.1);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: ax, y: ay, rot: lean, sx, sy }],
        { life: 0.8, strips: 14, drift: 70, rise: 18, col: ICE, kind: 3, n: 26, spread: 200, glow: '#8fd0ff', cy: -40 });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  const ga = ctx.globalAlpha;
  if (!o.flash) K.glow(ax, ay - 4, 44, '#6aaeff', (0.28 + 0.3 * cast) * (1 - shat * 0.6));
  // orbiting shards: behind the body first (phase in the back half), in front after it
  const orbit = (front) => {
    for (let i = 0; i < SH.length; i++) {
      const ph = t * (0.9 + (i % 3) * 0.25) + i * (TAU / SH.length);
      const z = Math.sin(ph);
      if ((z >= 0) !== front) continue;
      const r = 16 + (i % 3) * 5;
      let x = ax - 6 + Math.cos(ph) * r, y = ay + 12 + z * 5 + Math.sin(t * 1.3 + i) * 3;
      // cast: the shards spiral into the claw; shatter: fly outward
      if (cast > 0 && !fired) { x = lerp(x, _d[0], cast * cast); y = lerp(y, _d[1], cast * cast); }
      if (shat > 0) { x += Math.cos(ph) * shat * 40; y += (K.h1(i) - 0.7) * shat * 50; }
      const a = fired ? clamp(1 - (at - 0.65) / 0.2, 0, 1) * 0.3 + clamp((at - 0.85) / 0.3, 0, 1) : 1;
      K.put(SH[i], 'a', x, y, ph * 1.7 + i, 1 + (i % 2) * 0.3, 1 + (i % 2) * 0.3, a * (front ? 1 : 0.75), front ? 'base' : 'base');
    }
  };
  // the claw target for the gathering shards (computed from the arm pose below; last frame's value is fine here)
  if (!e._clw) e._clw = [ax + 20, ay];
  _d[0] = e._clw[0]; _d[1] = e._clw[1];
  orbit(false);
  // body: warped glass shroud; shatter = rigid strips flying apart
  const trail = 5 + Math.min(14, spd * 0.12);
  K.pivotPos('body', 'a', 'top', ax, ay, lean, sx, sy, _q);
  const tx = _q[0], ty = _q[1];
  const ph = t * 3.6;
  if (shat > 0.01) {
    K.strips('body', 'top', tx, ty, lean, sx, sy, K.nStrips(18), 'y', (u, i) => {
      const h = K.h1(i * 3.1 + 7), g = K.h1(i * 1.7 + 3);
      if (shat * 1.3 > 1 - g * 0.5 && shat > 0.6) return null;          // the last panes wink out
      _q[0] = (h - 0.5) * shat * 56 * rig.td; _q[1] = (g - 0.5) * shat * 18 * rig.td; return _q;
    }, 1 - shat * 0.6, 'base', false);
  } else {
    if (!o.flash && K.lod() > 1) {
      const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      K.put('body', 'top', tx - trail * 0.2, ty, lean, sx * 1.04, sy * 1.02, 0.16 + 0.2 * cast + (hurt ? 0.2 : 0), 'glow');
      ctx.globalCompositeOperation = gco;
    }
    K.warpY('body', 'top', tx, ty, lean, sx, sy, K.nStrips(10), (u) => {
      const w = Math.max(0, u - 0.3) / 0.7;
      _q[0] = (-(w * w) * trail - Math.sin(ph - u * 5) * w * 3) * rig.td; return _q;
    }, 1, 'base', 1);
  }
  // splinter arm: hangs and sways; reaches for the player while casting; recoils when hit
  K.pivotPos('body', 'top', 'arm', tx, ty, lean, sx, sy, _q);
  const shx = _q[0], shy = _q[1];
  const hang = Math.PI / 2 - 0.35 + Math.sin(t * 2) * 0.12;
  let dir = lerp(hang, -0.15, Math.min(1, cast * 1.3)) + (hurt ? 0.5 : 0);
  if (fired) dir = lerp(-0.2, hang, clamp((at - 0.7) / 0.3, 0, 1));
  const armFront = cast > 0.3 || fired;          // reaching arm crosses in front of the screaming head
  if (!armFront) K.bone('arm', shx, shy, dir, 1, 'base', 1 - shat);
  const ap = K.part('arm');
  const L = ap ? ap.len : 30;
  const cx = shx + Math.cos(dir) * L, cy = shy + Math.sin(dir) * L;
  e._clw[0] = cx; e._clw[1] = cy;
  // screaming head swaps in while casting / hurt
  const scream = Math.max(clamp((cast - 0.35) / 0.3, 0, 1) * (fired ? clamp(1 - (at - 0.75) / 0.2, 0, 1) : 1), hurt ? 1 : 0) * (1 - shat);
  if (scream > 0.02) {
    K.pivotPos('body', 'top', 'head', tx, ty, lean, sx, sy, _q);
    K.put('scream', 'a', _q[0] + 1, _q[1] + 1, lean * 0.6 - 0.12, 1, 1, scream);
  }
  if (armFront) K.bone('arm', shx, shy, dir, 1, 'base', 1 - shat);
  orbit(true);
  ctx.globalAlpha = ga;
  if (!o.flash) {
    K.pivotPos('body', 'top', 'eye', tx, ty, lean, sx, sy, _q);
    K.glow(_q[0], _q[1], 3 + 2 * scream, '#dff8ff', 0.85 * (1 - shat));
    if (cast > 0.2 && !fired) K.glow(cx, cy, 6 + 12 * cast, '#bfefff', cast, 0.2);
    if (fired && at < 0.9) K.glow(cx, cy, 22 * (1 - (at - 0.65) / 0.25), '#ffffff', 1 - (at - 0.65) / 0.25, 0.15);
  }
  K.end();
  // glass dust shed from the tail + a shard burst when hit (world space, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(26));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    const hx = e.cx + f * sc * (ax - 8 - trail * 0.5), hy = e.bottom + sc * (ay + 30);
    for (let n = pool.rate(0, K.lod() === 0 ? 5 : 10, dt); n > 0; n--) pool.add(3, hx + K.frand(-8, 8), hy + K.frand(-8, 6), -f * K.frand(10, 40), K.frand(-20, 10), K.frand(0.4, 0.9), K.frand(1, 2), ICE);
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 10; i++) pool.add(4, e.cx + K.frand(-10, 10), e.bottom - 40 + K.frand(-12, 12), K.frand(-160, 160), K.frand(-200, 20), K.frand(0.4, 0.7), K.frand(2, 4), '#d8f0ff'); }
    if (e.flashT <= 0) e._hitFx = false;
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
