// T1 painted sprite + procedural deformation (ghost-rig reuse): 서리 망령 (frost_wraith). The ghost sheet re-painted by a
// composition-keeping Kling edit (tools/painted/enemies/frost_wraith/parts.json reuses the ghost body box and arm inpaint):
// frosted hooded shroud (hanging hand inpainted away, feet faded into mist), long icy skeletal arm with the ragged frozen
// sleeve, screaming crowned skull (swapped in), and the ice crown worn on the hood.
// The shroud is a seam-free warpY cloth warp (hem streams back against the motion and ripples), bob + lean, cold rim glow.
// States (AI_B.wraith, anims 'float' 'cast' 'vanish', state 'appear'): float (slow drift, snow sifting off the hem, the arm
// sways) · cast (0.65 s: the frost crown flares, the arm reaches for the player while ice shards gather in the claw, the
// crowned skull screams; the shard fan leaves at 0.65 s with a flash from the claw) · vanish (0.35 s: the shroud comes
// apart into drifting snow bands while the AI fades alpha) · appear (the same in reverse) · hurt (flash, squash, recoil,
// scream, snow burst) · death (strip dissolve into snow with ice sparks, outlives the entity).
import * as K from '../enemy_kit.js';
import { clamp, lerp, TAU } from '../../../core/math.js';

export const spec = {
  id: 'frost_wraith', tier: 'T1', src: 'frost_wraith',
  bake: {
    outline: 0.35, outlineParts: { body: 0.6 },
    glow: { body: '#8fd8ff', scream: '#8fd8ff', crown: '#e8fbff' },
    flash: ['body', 'arm', 'scream', 'crown'],
  },
};

const _q = [0, 0], _c = [0, 0];
const SNOW = '#e4f6ff';
const S = 1.12;                                   // the painted shroud ≈ the 72 px hurtbox (hem fades into mist)
const CAST = 0.65;

// hoisted warp callbacks (no per-frame closures); WW is set right before each warp
const WW = { t: 0, mist: 0, td: 1, trail: 0, ph: 0 };
const mistOff = (u) => {
  const mist = WW.mist, k = WW.td / S;
  _q[0] = (Math.sin(WW.t * 9 - u * 11) * 10 * mist - u * 16 * mist) * k; _q[1] = -u * mist * 10 * k; return _q;
};
const shroudOff = (u) => {
  const w = Math.max(0, u - 0.22) / 0.78;
  _q[0] = (-(w * w) * WW.trail - Math.sin(WW.ph - u * 5) * w * 3) * WW.td / S; _q[1] = Math.sin(WW.ph * 0.7 - u * 3) * w * 1.2 * WW.td; return _q;
};

/** snow-dissolve amount 0..1 (vanish: 0→1, appear: 1→0) */
function mistOf(e) {
  if (e.anim === 'vanish') return clamp((e.animT ?? e.stateT ?? 0) / 0.3, 0, 1);
  if (e.state === 'appear') return 1 - clamp((e.stateT ?? 0) / 0.3, 0, 1);
  return 0;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0;
  const f = e.facing < 0 ? -1 : 1;
  const vx = (e.vx ?? 0) * f, vy = e.vy ?? 0, spd = Math.hypot(vx, vy);
  const casting = e.anim === 'cast';
  const cast = casting ? clamp(at / CAST, 0, 1) : 0;
  const fired = casting && at >= CAST;
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const mist = mistOf(e);
  const bob = Math.sin(t * 2) * 3;
  // the cast lean eases back after the release (the AI returns to 'float' at 1.0 s; holding it until then snapped)
  const castLean = casting ? (fired ? 1 - clamp((at - 0.72) / 0.26, 0, 1) : cast) : 0;
  const lean = clamp(vx * 0.003, -0.2, 0.32) + castLean * 0.16 - (hurt ? 0.28 : 0);
  const ax = castLean * 3 - (hurt ? 4 : 0), ay = -40 + bob;
  const breath = 1 + Math.sin(t * 1.7) * 0.02;
  const sx = S * (1 + sq * 0.12), sy = S * breath * (1 - sq * 0.1);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: ax, y: ay, rot: lean, sx, sy }],
        { life: 0.9, strips: 14, drift: 46, rise: 24, col: SNOW, kind: 3, n: 24, spread: 150, glow: '#8fd8ff', cy: -40 });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  const ga = ctx.globalAlpha;
  // cold halo behind the figure (brighter while the crown charges)
  if (!o.flash) K.glow(ax, ay - 8, 44, '#5aa8ff', (0.26 + 0.3 * cast) * (1 - mist * 0.7));
  // shroud: bands below the chest stream back (−x) with speed and ripple; vanish/appear = bands drift apart as snow
  const trail = 6 + Math.min(16, spd * 0.13);
  K.pivotPos('body', 'a', 'top', ax, ay, lean, sx, sy, _q);
  const tx = _q[0], ty = _q[1];
  const ph = t * 3.8;
  WW.t = t; WW.mist = mist; WW.td = rig.td; WW.trail = trail; WW.ph = ph;
  if (mist > 0.01) {
    // blown apart into snow: the bands shear sideways in a fast wave, rise and thin out
    K.warpY('body', 'top', tx, ty - mist * 8, lean, sx * (1 + mist * 0.15), sy, K.nStrips(14), mistOff, (1 - mist) ** 1.5, 'base', 0);
  } else {
    if (!o.flash && K.lod() > 1) {   // additive frost glow pass (high quality only)
      const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      K.put('body', 'top', tx - trail * 0.25, ty - 1, lean, sx * 1.04, sy * 1.02, 0.16 + 0.22 * cast + (hurt ? 0.2 : 0), 'glow');
      ctx.globalCompositeOperation = gco;
    }
    K.warpY('body', 'top', tx, ty, lean, sx, sy, K.nStrips(10), shroudOff, 1, 'base', 0);
  }
  const vis = 1 - mist;
  // long skeletal arm from the sleeve: hangs and sways; reaches for the player while casting; recoils when hit
  K.pivotPos('body', 'top', 'arm', tx, ty, lean, sx, sy, _q);
  const shx = _q[0], shy = _q[1];
  const hang = Math.PI / 2 - 0.28 + Math.sin(t * 1.9) * 0.1;
  let aim = -0.1;
  const p = world?.player;
  if (p) {
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    aim = clamp(Math.atan2((p.cy - 8) - (e.bottom + shy * sc), Math.max(8, (p.cx - e.cx) * f)), -0.7, 1.1);
  }
  let dir = lerp(hang, aim, Math.min(1, cast * 1.4)) + (hurt ? 0.55 : 0);
  if (fired) dir = lerp(aim, hang, clamp((at - 0.72) / 0.28, 0, 1));
  const armFront = cast > 0.3 || fired;          // the reaching arm crosses in front of the screaming skull
  const ap = K.part('arm');
  if (!armFront) K.bone('arm', shx, shy, dir, S, 'base', vis);
  // claw point (a→tip of the arm part) for the gathering shards / release flash
  K.pivotPos('arm', 'a', 'tip', shx, shy, dir - (ap ? ap.ang : 0), S, S, _c);
  const cx = _c[0], cy = _c[1];
  // screaming crowned skull swaps in while casting / hurt
  const scream = Math.max(clamp((cast - 0.35) / 0.3, 0, 1) * (fired ? clamp(1 - (at - 0.8) / 0.2, 0, 1) : 1), hurt ? 1 : 0) * vis;
  K.pivotPos('body', 'top', 'head', tx, ty, lean, sx, sy, _q);
  const hx = _q[0], hy = _q[1];
  if (scream > 0.02) K.put('scream', 'a', hx + 1, hy + 5, lean * 0.6 - 0.1, S, S, scream);
  // the ice crown on the hood (hidden under the skull's own crown while it screams); flares on the wind-up
  const flare = cast * (fired ? clamp(1 - (at - CAST) / 0.25, 0, 1) : 1);
  if (scream < 0.98) {
    K.pivotPos('body', 'top', 'crown', tx, ty, lean, sx, sy, _q);
    K.put('crown', 'a', _q[0], _q[1] + 1, lean * 0.8 - 0.08, S * (1 + 0.14 * flare), S * (1 + 0.2 * flare), vis * (1 - scream));
    if (!o.flash && flare > 0.02) {
      const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      K.put('crown', 'a', _q[0], _q[1] + 1, lean * 0.8 - 0.08, S * (1.1 + 0.14 * flare), S * (1.12 + 0.2 * flare), flare * 0.8 * vis, 'glow');
      ctx.globalCompositeOperation = gco;
      K.glow(_q[0], _q[1] - 3, 8 + 14 * flare, '#dff8ff', 0.6 * flare, 0.25);
    }
  }
  if (armFront) K.bone('arm', shx, shy, dir, S, 'base', vis);
  ctx.globalAlpha = ga;
  if (!o.flash) {
    K.pivotPos('body', 'top', 'eye', tx, ty, lean, sx, sy, _q);
    K.glow(_q[0], _q[1], 3 + 2 * scream + 2 * cast, '#7affff', 0.85 * vis);
    if (cast > 0.15 && !fired) { shards(ctx, cx, cy, t, cast); K.glow(cx, cy, 6 + 12 * cast, '#bfefff', cast * 0.9, 0.2); }
    if (fired && at < CAST + 0.25) K.glow(cx, cy, 24 * (1 - (at - CAST) / 0.25), '#ffffff', 1 - (at - CAST) / 0.25, 0.15);
  }
  K.end();
  // snow sifting from the hem, a snow burst on hit / vanish (world space, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(28));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    const lo = K.lod() === 0 ? 0.5 : 1;
    const hx2 = e.cx + f * sc * (ax - 8 - trail * 0.5), hy2 = e.bottom + sc * (ay + 34);
    if (!o.flash) {
      for (let n = pool.rate(0, 9 * lo * (1 - mist * 0.5), dt); n > 0; n--) pool.add(3, hx2 + K.frand(-9, 9), hy2 + K.frand(-8, 6), -f * K.frand(8, 34), K.frand(6, 30), K.frand(0.5, 1.0), K.frand(1.2, 2.2), SNOW);
      for (let n = pool.rate(1, 10 * lo * mist, dt); n > 0; n--) pool.add(2, e.cx + K.frand(-16, 16) * sc, e.bottom + sc * (ay + K.frand(-22, 26)), K.frand(-30, 30), K.frand(-40, -10), K.frand(0.4, 0.8), K.frand(3, 6) * sc, '#dff2ff');
    }
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 9; i++) pool.add(4, e.cx + K.frand(-10, 10), e.bottom - 40 + K.frand(-12, 12), K.frand(-150, 150), K.frand(-180, 20), K.frand(0.4, 0.7), K.frand(1.6, 3), '#d8f2ff'); }
    if (e.flashT <= 0) e._hitFx = false;
    ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
  }
}

/** ice shards spiralling into the claw during the wind-up (local space, deterministic) */
function shards(ctx, x, y, t, k) {
  K.local();
  const ga = ctx.globalAlpha;
  ctx.fillStyle = 'rgba(214,244,255,0.95)';
  ctx.strokeStyle = 'rgba(40,90,140,0.85)'; ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const a = t * 3.2 + i * (TAU / 5), r = lerp(16, 3, k) + (i % 2) * 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.7;
    const ro = a + Math.PI / 2, L = 2.5 + 2 * k, W = 0.9;
    const c = Math.cos(ro), s = Math.sin(ro);
    ctx.globalAlpha = ga * clamp(k * 1.5, 0, 1);
    ctx.beginPath();
    ctx.moveTo(px + c * L, py + s * L); ctx.lineTo(px - s * W, py + c * W); ctx.lineTo(px - c * L, py - s * L); ctx.lineTo(px + s * W, py - c * W);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = ga;
}
