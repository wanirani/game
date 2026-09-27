// T1 painted sprite + procedural deformation: 용광로 임프 (forge_imp). Parts: soot-black imp body with molten cracks,
// satchel of red-hot rivets, goat legs and dangling claws (Step-4 edit of the sheet figure, wings/tail cut off), torn bat
// wing (bending chain, near + darkened far wing), ember-tipped tail, loose arm (raised behind the head to hurl rivets).
// Driven by AI_C.forgeimp: fly (wing beat 15 rad/s, bob, tilt with the velocity, tail sway) · cast (P.windup 0.55: the arm
// swings back over the head with a white-hot rivet, the three rivets leave at the wind-up end, follow-through) · aim (0.4 s:
// wings fold up, the body crouches and shivers, eyes and cracks flare) · dive (body pitched along the velocity, wings swept
// back, fire streak) · hurt (flash, squash, recoil) · death (strip dissolve into embers).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'forge_imp', tier: 'T1', src: 'forge_imp',
  bake: { outline: 0.4, deep: { wing: 0.6, arm: 0.6 }, deepTint: 'rgb(150,90,70)', glow: { body: '#ff7a2a' } },
};

const _q = [0, 0];
const PI = Math.PI;
const EMBER = '#ff9a40';

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim;
  const f = e.facing < 0 ? -1 : 1;
  const P = e.params || {};
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const wu = P.windup ?? 0.55;
  const cast = an === 'cast', aim = an === 'aim', dive = an === 'dive';
  const ck = cast ? clamp(at / wu, 0, 1) : 0, thrown = cast && at >= wu;
  const ak = aim ? clamp(at / (P.aim ?? 0.4), 0, 1) : 0;
  const vx = (e.vx ?? 0) * f, vy = e.vy ?? 0;
  const beat = Math.sin(t * (dive ? 26 : aim ? 22 : 15));
  const bob = dive ? 0 : -beat * 2;
  let tilt = clamp(vx * 0.0012, -0.25, 0.3) + clamp(vy * 0.0008, -0.2, 0.2) - (hurt ? 0.3 : 0);
  if (dive) tilt = clamp(Math.atan2(vy, Math.abs(vx) + 1) * 0.9, -1.0, 1.2);
  if (aim) tilt = -0.15 + Math.sin(t * 60) * 0.04 * ak;
  const ax = (aim ? -2 * ak : 0), ay = -24 + bob;
  const sx = (1 + sq * 0.12) * (aim ? 1 + 0.06 * ak : 1), sy = (1 - sq * 0.1) * (aim ? 1 - 0.08 * ak : 1);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: ax, y: ay, rot: tilt, sx, sy }],
        { life: 0.7, strips: 10, drift: 50, rise: 16, col: EMBER, kind: 3, n: 24, spread: 200, glow: '#ff6a1a', cy: -24 });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(ax, ay, 30, '#ff5a1a', 0.25 + 0.3 * ak + (dive ? 0.25 : 0));
  // wing roots
  K.pivotPos('body', 'a', 'wF', ax, ay, tilt, sx, sy, _q); const fx0 = _q[0], fy0 = _q[1];
  K.pivotPos('body', 'a', 'wN', ax, ay, tilt, sx, sy, _q); const nx0 = _q[0], ny0 = _q[1];
  // wing direction (texel +x of the painted wing): back (π) + up-stroke/down-stroke; folded up while aiming, swept back when diving
  let wd = PI + 0.12 + beat * 0.55;
  if (aim) wd = lerp(wd, PI + 0.95, ak);
  if (dive) wd = PI - 0.05 + beat * 0.12;
  if (hurt) wd += 0.4;
  const bend = (u) => (dive ? 0.02 : -0.12 * Math.cos(t * 15)) * (0.3 + u);
  // far wing + far (casting) arm behind the body
  K.chain('wing', fx0 - 2, fy0 + 1, wd + tilt - 0.45, 0.85, K.nStrips(6), bend, 1, 'deep', true);
  if (cast) {
    K.pivotPos('body', 'a', 'armF', ax, ay, tilt, sx, sy, _q);
    const shx = _q[0], shy = _q[1];
    // swing back over the head during the wind-up, whip forward on release
    const dir = thrown ? lerp(-2.2, 0.35, clamp((at - wu) / 0.12, 0, 1)) : lerp(1.4, -2.2, ck * (2 - ck));
    K.bone('arm', shx, shy, dir + tilt, 1, 'deep');
    const ap = K.part('arm'), L = ap ? ap.len : 18;
    if (!thrown && !o.flash) {
      const hx = shx + Math.cos(dir + tilt) * L, hy = shy + Math.sin(dir + tilt) * L;
      K.glow(hx, hy, 4 + 6 * ck, '#ffd070', 0.6 + 0.4 * ck, 0.2);
      K.glow(hx, hy, 10 + 8 * ck, '#ff6a1a', 0.5 * ck);
    }
  }
  // tail sways behind
  K.pivotPos('body', 'a', 'tail', ax, ay, tilt, sx, sy, _q);
  K.put('tail', 'a', _q[0], _q[1], tilt + Math.sin(t * 3.4) * 0.22 + (dive ? -0.4 : 0), 1, 1);
  // body + molten-crack glow pass
  K.put('body', 'a', ax, ay, tilt, sx, sy);
  if (!o.flash && K.lod() > 0) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('body', 'a', ax, ay, tilt, sx, sy, 0.06 + 0.22 * ak + 0.08 * Math.max(0, Math.sin(t * 4)) + (dive ? 0.15 : 0), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  // near wing in front
  K.chain('wing', nx0, ny0, wd + tilt, 1, K.nStrips(6), bend, 1, 'base', true);
  if (!o.flash) {
    for (const pn of ['eye', 'eye2']) { K.pivotPos('body', 'a', pn, ax, ay, tilt, sx, sy, _q); K.glow(_q[0], _q[1], 2.5 + 2 * ak, '#ffd040', 0.9); }
    K.pivotPos('body', 'a', 'mouth', ax, ay, tilt, sx, sy, _q);
    K.glow(_q[0], _q[1], 4 + 3 * ak, '#ffb040', 0.35 + 0.35 * ak);
  }
  K.end();
  // embers from the tail tip + a fire streak while diving (world space, per second)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(24));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    for (let n = pool.rate(0, dive ? 26 : 6, dt); n > 0; n--) pool.add(3, e.cx - f * sc * K.frand(8, 20), e.bottom - sc * K.frand(8, 30), -(e.vx ?? 0) * 0.3 + K.frand(-20, 20), K.frand(-60, -10) - (e.vy ?? 0) * 0.3, K.frand(0.3, 0.7), K.frand(1.2, 2.4), EMBER);
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 8; i++) pool.add(3, e.cx + K.frand(-8, 8), e.bottom - 24 + K.frand(-8, 8), K.frand(-160, 160), K.frand(-180, 40), K.frand(0.3, 0.6), K.frand(1.5, 3), '#ffd070'); }
    if (e.flashT <= 0) e._hitFx = false;
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
