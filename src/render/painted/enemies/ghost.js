// T1 painted sprite + procedural deformation + ectoplasm: 원혼 (ghost). Parts: hooded shroud body (feet faded into
// mist), skeletal reaching arm, screaming hooded head.
// The shroud is a DISPLACEMENT-STRIP warp (12 horizontal bands): the hem streams back against the flight direction and
// ripples; the whole figure bobs, leans into its motion, breathes (squash/stretch) and flickers translucently (it phases
// through walls). Ectoplasm: pooled additive wisps shed from the hem + slow drips (render RNG, camera space).
// States (AI.floater, anim 'fly'): drift (out of sight) · pursue (lean + trail) · lunge (near the player: screaming
// head swaps in, arm reaches, surge forward) · hurt (flash, squash, recoil, wisp burst) · death (dissolves into
// ectoplasm: strip dissolve + wisp burst, outlives the entity).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'ghost', tier: 'T1', src: 'ghost',
  bake: { outline: 0.35, outlineParts: { body: 0.6 }, glow: { body: '#7ab8ff', scream: '#7ab8ff' } },
};

const _q = [0, 0];
const ECTO = '#8fe6ff';

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const S = 1.05;                                       // visible figure ≈ the 56 px hurtbox (hem fades into mist)
  const f = e.facing < 0 ? -1 : 1;
  const vx = (e.vx ?? 0) * f, vy = e.vy ?? 0, spd = Math.hypot(vx, vy);
  const p = world?.player;
  const near = p ? clamp(1 - (Math.hypot(p.cx - e.cx, p.cy - e.cy) - 60) / 120, 0, 1) : (e.near ?? 0);
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const bob = Math.sin(t * 2.4) * 3;
  const lean = clamp(vx * 0.0035, -0.25, 0.4) + near * 0.18 - (hurt ? 0.3 : 0);
  const surge = near * 6 * (0.6 + 0.4 * Math.sin(t * 9));
  const ax = surge - (hurt ? 4 : 0), ay = -30 + bob;            // local anchor = body 'a' (chest)
  const breath = 1 + Math.sin(t * 1.7) * 0.025;
  const sx = S * (1 + sq * 0.12), sy = S * breath * (1 - sq * 0.1);
  const fade = 0.72 + 0.2 * Math.sin(t * 1.7) + near * 0.08;

  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: ax, y: ay, rot: lean, sx, sy }],
        { life: 0.9, strips: 14, drift: 50, rise: 26, col: ECTO, kind: 0, n: 22, spread: 120, glow: '#6aaeff', cy: -30 });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  // soft halo behind the figure
  if (!o.flash) K.glow(ax, ay - 6, 46, '#5a8aff', 0.32 * fade);
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (o.flash ? 1 : fade);
  // shroud: bands below the chest stream back (−x) with speed and ripple; the hood (u≈0) stays put
  const trail = 6 + Math.min(16, spd * 0.14);
  K.pivotPos('body', 'a', 'top', ax, ay, lean, sx, sy, _q);
  const tx = _q[0], ty = _q[1];
  const ph = t * 4;
  const off = (u) => {
    const w = Math.max(0, u - 0.18) / 0.82;
    _q[0] = (-(w * w) * trail - Math.sin(ph - u * 5) * w * 3.2) * rig.td / S; _q[1] = Math.sin(ph * 0.7 - u * 3) * w * 1.2 * rig.td; return _q;
  };
  if (!o.flash && K.lod() > 0) {   // additive ghost glow pass (baked colour silhouette, unwarped: it is a soft halo)
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('body', 'top', tx - trail * 0.25, ty - 1, lean, sx * 1.05, sy * 1.02, 0.2, 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.warpY('body', 'top', tx, ty, lean, sx, sy, K.nStrips(12), off, 1, 'base', 0);
  // reaching arm from the sleeve: sways idle, reaches for the player when close
  K.pivotPos('body', 'top', 'arm', tx, ty, lean, sx, sy, _q);
  const arm = K.part('arm');
  const reach = lerp(0.35 + Math.sin(t * 2.2) * 0.15, 1.35, near) + (hurt ? -0.4 : 0);
  K.put('arm', 'a', _q[0], _q[1], -reach + lean, S, S, 1);
  // screaming head swaps in (crossfade) when lunging / hurt
  const scream = Math.max(near * near, hurt ? 1 : 0);
  if (scream > 0.02) {
    K.pivotPos('body', 'top', 'head', tx, ty, lean, sx, sy, _q);
    K.put('scream', 'a', _q[0] - 3, _q[1] + 12, lean * 0.6 - 0.1, S, S, scream);
  }
  ctx.globalAlpha = ga;
  if (!o.flash) {
    K.pivotPos('body', 'top', 'eye', tx, ty, lean, sx, sy, _q);
    K.glow(_q[0], _q[1], 3 + scream * 2, '#7affff', 0.8);
  }
  K.end();
  void arm;
  // ectoplasm: wisps shed from the hem trail in world space; occasional drips; burst when hit
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(28));
    const sc = e.scale || 1;
    const hx = e.cx + f * sc * (ax - 10 - trail * 0.5), hy = e.bottom + sc * (ay + 20);
    if (K.fr() < 0.45) pool.add(0, hx + K.frand(-8, 8), hy + K.frand(-6, 10), -f * K.frand(10, 40) - (e.vx ?? 0) * 0.2, K.frand(-30, -8), K.frand(0.6, 1.2), K.frand(5, 10), ECTO);
    if (K.fr() < 0.04) pool.add(1, hx + K.frand(-6, 6), hy, 0, K.frand(10, 40), K.frand(0.6, 1.0), 1.4, '#9ff4ff');
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 8; i++) pool.add(0, e.cx + K.frand(-10, 10), e.bottom - 30 + K.frand(-10, 10), K.frand(-120, 120), K.frand(-120, 60), K.frand(0.4, 0.7), K.frand(4, 8), ECTO); }
    if (e.flashT <= 0) e._hitFx = false;
    pool.step(K.clockOf(e, world));
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
