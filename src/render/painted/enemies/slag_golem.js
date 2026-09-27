// T3 large painted puppet: 쇳물 골렘 (slag_golem). Parts: body (spiked riveted pauldrons, the skull sunk in the collar,
// the molten core bleeding drips, the chains; arms and legs cut off by a Step-4 edit), arm (bicep → cracked forearm →
// glowing fist; used twice: near + darkened far), legs (hips and legs standing in molten puddles, one piece that rocks).
// Damage variants by HP (dmg1 < 60 %, dmg2 < 30 %: more cracks, charring, chipped holes).
// Driven by AI_C.slag: idle (breathing, the core pulses, drips) · walk (lumbering: the legs rock, the body sways, the arms
// swing) · windup (P.windup 0.8: both fists raised over the head, the body leans back, e.glow heats the arms white-orange)
// · slam (0.65 s: the fists come down in front, the body lunges forward, a molten shock glow at the impact) · spit
// (P.spitWindup 0.6: rears back, the maw floods with light, then thrusts the head forward as the glob leaves) · hurt
// (flash, squash, recoil) · death (the golem collapses: legs, torso and both arms fall apart in a shower of embers).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';

const DMG = { cracks: 3, char: 1.2, holes: 1, crackMinLum: 30, stain: '#1a0c06' };
export const spec = {
  id: 'slag_golem', tier: 'T3', src: 'slag_golem',
  bake: {
    outline: 0.5, deep: { arm: 0.62 }, deepTint: 'rgb(130,80,60)',
    glow: { arm: '#ff8a2a', body: '#ff6a1a' },
    damage: { body: DMG, arm: DMG, legs: DMG },
  },
};

const _q = [0, 0];
const VARS = [['base', 'deep'], ['dmg1', 'deep_dmg1'], ['dmg2', 'deep_dmg2']];
const MOLTEN = '#ffb040';
const ease = (k) => k * (2 - k);

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim;
  const f = e.facing < 0 ? -1 : 1;
  const P = e.params || {};
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const heat = clamp(e.glow ?? 0, 0, 1);
  const hpK = e.stats?.maxHp ? e.hp / e.stats.maxHp : 1;
  const dl = e.dying > 0 ? 2 : hpK < 0.3 ? 2 : hpK < 0.6 ? 1 : 0;
  const [vN, vF] = VARS[dl];
  const walk = an === 'walk', wind = an === 'windup', slam = an === 'slam', spit = an === 'spit';
  const ww = wind ? clamp(at / (P.windup ?? 0.8), 0, 1) : 0;
  const sk = slam ? ease(clamp(at / 0.12, 0, 1)) : 0, rec = slam ? clamp((at - 0.3) / 0.35, 0, 1) : 0;
  const swu = P.spitWindup ?? 0.6;
  const sp = spit ? clamp(at / swu, 0, 1) : 0, spr = spit && at >= swu ? clamp((at - swu) / 0.12, 0, 1) : 0;
  const step = walk ? Math.sin(t * 5) : 0;
  // legs rock, the hips sit on top of them
  const lr = walk ? step * 0.05 : 0;
  const lp = K.part('legs'), LL = lp ? lp.len : 48;
  const hipY = -LL + 3 + (walk ? -Math.abs(step) * 2 : 0) + (slam ? 5 * sk * (1 - rec) : 0) + (wind ? -2 * ww : 0);
  let rot = walk ? step * 0.035 : Math.sin(t * 1.2) * 0.01;
  if (wind) rot -= 0.12 * ease(ww);
  if (slam) rot += lerp(-0.12, 0.26, sk) * (1 - rec) + 0.0 * rec;
  if (spit) rot += spr > 0 ? lerp(-0.14, 0.12, spr) : -0.14 * ease(sp);
  if (hurt) rot -= 0.1;
  const hx = (hurt ? -2 : 0) + (slam ? 4 * sk * (1 - rec) : 0), hy = hipY;
  const br = 1 + Math.sin(t * 1.6) * 0.012;
  const sx = (1 + sq * 0.08) * (2 - br), sy = (1 - sq * 0.07) * br;
  // arms (world dir, π/2 = hanging)
  let dN = 1.5 + (walk ? -step * 0.25 : Math.sin(t * 1.2) * 0.03), dF = 1.3 + (walk ? step * 0.2 : Math.sin(t * 1.2 + 1) * 0.03);
  if (wind) { const k = ease(Math.min(1, ww * 1.4)); dN = lerp(dN, -1.75, k); dF = lerp(dF, -1.45, k); }
  if (slam) { dN = lerp(lerp(-1.75, 1.0, sk), 1.45, rec); dF = lerp(lerp(-1.45, 0.85, sk), 1.3, rec); }
  if (spit) { dN = lerp(dN, 1.9, sp); dF = lerp(dF, 0.9, sp); }
  if (hurt) { dN += 0.3; dF += 0.3; }
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.begin(ctx, rig, 0);
      K.pivotPos('body', 'a', 'shN', hx, hy, rot, sx, sy, _q); const nx = _q[0], ny = _q[1];
      K.pivotPos('body', 'a', 'shF', hx, hy, rot, sx, sy, _q); const fx = _q[0], fy = _q[1];
      const ap = K.part('arm'), pa = ap ? ap.ang : 1.38;
      K.end();
      K.spawnCorpse(world, e, rig, [
        { name: 'arm', pv: 'a', x: fx, y: fy, rot: dF + rot - pa, sx: 0.95, sy: 0.95, vn: 'deep_dmg2', vx: K.frand(20, 90), vy: -K.frand(80, 160), vr: K.frand(-3, 3) },
        { name: 'legs', pv: 'a', x: 0, y: -LL, rot: lr, sx: 1, sy: 1, vn: 'dmg2', vx: K.frand(-20, 20), vy: -K.frand(20, 60), vr: K.frand(-1, 1) },
        { name: 'body', pv: 'a', x: hx, y: hy, rot, sx: 1, sy: 1, vn: 'dmg2', vx: K.frand(-50, 30), vy: -K.frand(60, 140), vr: K.frand(-2.2, -0.6) },
        { name: 'arm', pv: 'a', x: nx, y: ny, rot: dN + rot - pa, sx: 1, sy: 1, vn: 'dmg2', vx: K.frand(-110, -30), vy: -K.frand(100, 200), vr: K.frand(-4, 4) },
      ], { life: 1.9, fade: 0.6, bounce: 0.18, dust: { n: 18, w: 34, h: 30, col: '#ff8a2a', k: 3 } });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) {
    K.shadow(30, 0.45);
    K.glow(0, -6, 34, '#ff5a10', 0.25 + 0.15 * Math.sin(t * 2));            // the molten puddles light the floor
  }
  K.pivotPos('body', 'a', 'shN', hx, hy, rot, sx, sy, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('body', 'a', 'shF', hx, hy, rot, sx, sy, _q); const fx = _q[0], fy = _q[1];
  const hot = !o.flash && K.lod() > 0 && heat > 0.02;
  const gco = ctx.globalCompositeOperation;
  // far arm behind everything
  K.bone('arm', fx, fy, dF + rot, 0.95, vF);
  if (hot) { ctx.globalCompositeOperation = 'lighter'; K.bone('arm', fx, fy, dF + rot, 0.95, 'glow', 0.35 * heat); ctx.globalCompositeOperation = gco; }
  K.put('legs', 'a', 0, -LL, lr, 1, 1, 1, vN);
  K.put('body', 'a', hx, hy, rot, sx, sy, 1, vN);
  if (hot) { ctx.globalCompositeOperation = 'lighter'; K.put('body', 'a', hx, hy, rot, sx, sy, 0.18 * heat, 'glow'); ctx.globalCompositeOperation = gco; }
  K.bone('arm', nx, ny, dN + rot, 1, vN);
  if (hot) { ctx.globalCompositeOperation = 'lighter'; K.bone('arm', nx, ny, dN + rot, 1, 'glow', 0.4 * heat); ctx.globalCompositeOperation = gco; }
  if (!o.flash) {
    // the core, the eyes, the maw
    K.pivotPos('body', 'a', 'core', hx, hy, rot, sx, sy, _q);
    K.glow(_q[0], _q[1], 10 + 6 * heat + Math.sin(t * 3) * 1.5, '#ff8a1a', 0.55 + 0.35 * heat);
    K.glow(_q[0], _q[1], 3.5 + 2 * heat, '#fff0b0', 0.8, 0.25);
    for (const pn of ['eye', 'eye2']) { K.pivotPos('body', 'a', pn, hx, hy, rot, sx, sy, _q); K.glow(_q[0], _q[1], 2.2 + 1.5 * heat, '#ffd060', 0.9); }
    const maw = Math.max(sp * (spr > 0 ? 1 - spr * 0.5 : 1), heat * 0.4);
    if (maw > 0.05) { K.pivotPos('body', 'a', 'mouth', hx, hy, rot, sx, sy, _q); K.glow(_q[0] + 2, _q[1], 5 + 8 * maw, '#ffb040', 0.3 + 0.5 * maw, 0.25); }
    // fists glow; the slam's molten shock at the impact
    const ap = K.part('arm'), AL = ap ? ap.len : 50;
    K.glow(nx + Math.cos(dN + rot) * AL, ny + Math.sin(dN + rot) * AL, 5 + 7 * heat, '#ff9a30', 0.3 + 0.5 * heat);
    if (slam && at < 0.55) {
      const k = clamp(at / 0.55, 0, 1);
      K.glow(30 + 30 * k, -3, 20 + 30 * k, '#ff7a20', 0.8 * (1 - k));
      K.glow(26, -4, 10, '#fff0b0', 0.9 * (1 - k), 0.3);
    }
  }
  K.end();
  // molten drips off the core and the fists, embers; a spray of sparks on the slam
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(30));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    for (let n = pool.rate(0, 4 + 6 * heat, dt); n > 0; n--) pool.add(1, e.cx + f * sc * K.frand(-6, 14), e.bottom - sc * K.frand(45, 58), 0, K.frand(10, 40), K.frand(0.4, 0.8), K.frand(1.4, 2.2), MOLTEN);
    for (let n = pool.rate(1, 5 + 10 * heat, dt); n > 0; n--) pool.add(3, e.cx + f * sc * K.frand(-26, 26), e.bottom - sc * K.frand(10, 90), K.frand(-15, 15), K.frand(-60, -20), K.frand(0.4, 0.9), K.frand(1.2, 2.4), '#ff9a40');
    if (slam && sk > 0.9 && !e._slamFx) {
      e._slamFx = true;
      for (let i = 0; i < 16; i++) pool.add(3, e.cx + f * sc * K.frand(20, 70), e.bottom - 4, f * K.frand(-60, 260), K.frand(-320, -90), K.frand(0.4, 0.8), K.frand(1.5, 3), i % 3 ? '#ffb040' : '#fff0b0');
    }
    if (!slam) e._slamFx = false;
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
