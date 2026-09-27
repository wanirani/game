// T2 painted puppet: 산호 게 (coral_crab). Parts: body (spiked coral-crusted shell with the branching coral horns,
// antennae, whiskered face and the eight spined legs; the claws cut off by a Step-4 edit), the drowned shrine with its coral
// garden riding on the back (its window glows like a lantern), giant spined claw (near + darkened far).
// Driven by AI.knight (walker; P.windup 0.55, reach 110, shield: the front shell turns blades): idle (the shell breathes,
// the claws open and close, antennae twitch) · walk (skittering bob and roll, the claws held up like a guard) · attack
// (wind-up: the near claw is raised high and gapes, the body rears; strike: the claw chops down in front, the shell
// lurches forward; recovery) · hurt (flash, squash, recoil) · death (the crab flips over, the claws and the shrine fall
// off as corpse pieces with a puff of silt).
import * as K from '../enemy_kit.js';
import { claimDebris } from './_biped.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'coral_crab', tier: 'T2', src: 'coral_crab',
  bake: { outline: 0.4, deep: { claw: 0.6 }, deepTint: 'rgb(120,70,70)' },
};

const _q = [0, 0];
const ease = (k) => k * (2 - k);

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim;
  const f = e.facing < 0 ? -1 : 1;
  const P = e.params || {};
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const walk = an === 'walk', atk = an === 'attack';
  const ph = atk ? K.atkPhase(at, P.windup ?? 0.55, 0.1) : null;
  const w = ph ? ph.w : 0, s = ph ? ph.s : 0, rec = ph ? clamp((ph.after - 0.25) / 0.35, 0, 1) : 0;
  const bob = walk ? Math.sin(t * 12) * 1.2 : Math.sin(t * 2) * 0.5;
  let rot = walk ? Math.sin(t * 6) * 0.03 : 0;
  if (atk) rot += s > 0 ? lerp(-0.08, 0.1, s) * (1 - rec) : -0.08 * ease(w);
  if (hurt) rot -= 0.1;
  const ax = (hurt ? -2 : 0) + (atk && s > 0 ? 4 * (1 - rec) : 0), ay = bob;
  const br = 1 + Math.sin(t * 2) * 0.01;
  const sx = (1 + sq * 0.1) * (2 - br), sy = (1 - sq * 0.1) * br;
  // claws (world dir of the arm-base → pincer axis; -π/2 = pincer straight up)
  let dN = -0.62 + Math.sin(t * 1.7) * 0.05 + (walk ? Math.sin(t * 12) * 0.06 : 0), dF = -0.85 + Math.sin(t * 1.7 + 1) * 0.05;
  if (atk) { dN = s > 0 ? lerp(-2.35, 0.25, ease(s)) : lerp(dN, -2.35, ease(w)); dN = lerp(dN, -0.62, rec); dF = lerp(dF, -1.3, w * (1 - rec)); }
  if (hurt) { dN -= 0.3; dF -= 0.25; }
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      claimDebris(world, e);                 // stone material: Enemy.die spawned vector debris for this body
      K.begin(ctx, rig, 0);
      K.pivotPos('body', 'a', 'clN', ax, ay, rot, sx, sy, _q); const nx = _q[0], ny = _q[1];
      K.pivotPos('body', 'a', 'seat', ax, ay, rot, sx, sy, _q); const kx = _q[0], ky = _q[1];
      const cp = K.part('claw'), ca = cp ? cp.ang : -1.8;
      K.end();
      K.spawnCorpse(world, e, rig, [
        { name: 'body', pv: 'a', x: ax, y: ay, rot, sx: 1, sy: 1, vn: 'base', vx: K.frand(-30, 30), vy: -K.frand(160, 260), vr: K.frand(3, 5) * (K.fr() < 0.5 ? -1 : 1) },
        { name: 'claw', pv: 'a', x: nx, y: ny, rot: dN + rot - ca, sx: 1, sy: 1, vn: 'base', vx: K.frand(40, 140), vy: -K.frand(120, 240), vr: K.frand(-6, 6) },
        { name: 'shrine', pv: 'a', x: kx, y: ky, rot, sx: 1, sy: 1, vn: 'base', vx: K.frand(-120, -30), vy: -K.frand(160, 280), vr: K.frand(-5, 5) },
      ], { life: 1.5, fade: 0.5, bounce: 0.3, dust: { n: 12, w: 30, h: 8, col: '#a89080' } });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.shadow(34, 0.45);
  K.pivotPos('body', 'a', 'clN', ax, ay, rot, sx, sy, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('body', 'a', 'clF', ax, ay, rot, sx, sy, _q); const fx = _q[0], fy = _q[1];
  K.bone('claw', fx, fy, dF + rot, 0.8, 'deep');                            // far claw behind the shell
  K.put('body', 'a', ax, ay, rot, sx, sy);
  K.pivotPos('body', 'a', 'seat', ax, ay, rot, sx, sy, _q);
  const sway = (walk ? Math.sin(t * 12 + 0.8) * 0.04 : 0) + (atk && s > 0 ? 0.08 * (1 - rec) : 0) - (atk ? 0.05 * w : 0);
  K.put('shrine', 'a', _q[0], _q[1] + 2, rot + sway, 1, 1);
  const kx = _q[0], ky = _q[1] + 2;
  // near claw: pincer gapes while winding up (squash along the claw = the fingers spread)
  const gape = atk && s === 0 ? w : Math.max(0, Math.sin(t * 1.3)) * 0.15;
  K.bone('claw', nx, ny, dN + rot, 1 + 0.05 * gape);
  if (!o.flash) {
    // shrine window lantern, the eye's wet glint
    K.pivotPos('shrine', 'a', 'lamp', kx, ky, rot + sway, 1, 1, _q);
    K.glow(_q[0], _q[1], 6 + Math.sin(t * 5) * 1, '#ffd890', 0.55 + 0.15 * Math.sin(t * 3.3));
    K.pivotPos('body', 'a', 'eye', ax, ay, rot, sx, sy, _q);
    K.glow(_q[0] + 0.5, _q[1] - 0.5, 1.6, '#ffffff', 0.7, 0.2);
    if (atk && s > 0 && s < 1) {                                            // chop streak
      const cp = K.part('claw'), L = cp ? cp.len : 40;
      K.glow(nx + Math.cos(dN + rot) * L, ny + Math.sin(dN + rot) * L, 10, '#ffe0c0', 0.5 * (1 - s));
    }
    if (atk && ph.after > 0 && ph.after < 0.3) snapJet(ctx, e, P, rig, nx + Math.cos(dN + rot) * clawLen(), ny + Math.sin(dN + rot) * clawLen(), ph.after);
  }
  K.end();
  // silt kicked up on the chop, bubbles
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(20));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    if (walk) for (let n = pool.rate(0, 6, dt); n > 0; n--) pool.add(2, e.cx + f * sc * K.frand(-30, 30), e.bottom - 2, K.frand(-20, 20), K.frand(-30, -8), K.frand(0.4, 0.7), K.frand(3, 5), '#8a7a6a');
    if (atk && s >= 1 && !e._chop) {
      e._chop = true;
      const far = (P.reachX ?? 10) + (P.reach ?? 110);                     // silt + bubbles along the whole snap jet
      for (let i = 0; i < 10; i++) pool.add(2, e.cx + f * K.frand(30, far), e.bottom - 3, f * K.frand(-40, 120), K.frand(-80, -20), K.frand(0.5, 0.9), K.frand(4, 7), '#9a8a78');
      for (let i = 0; i < 6; i++) pool.add(0, e.cx + f * K.frand(50, far), e.bottom - K.frand(6, 24), f * K.frand(-20, 40), K.frand(-60, -20), K.frand(0.4, 0.7), K.frand(2, 3.5), '#dff6ff');
    }
    if (!(atk && s >= 1)) e._chop = false;
    for (let n = pool.rate(1, 1.2, dt); n > 0; n--) pool.add(0, e.cx + f * sc * K.frand(10, 30), e.bottom - sc * K.frand(25, 40), K.frand(-5, 5), K.frand(-40, -20), K.frand(0.6, 1.0), K.frand(1.5, 2.5), '#bfeaff');
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}

const clawLen = () => K.part('claw')?.len ?? 40;
/**
 * Pistol-shrimp snap: the chop fires a pressure jet along the floor from the pincer to the far edge of the AI strike
 * rect (AI.walker: x reachX .. reachX + reach = 10..120 px, y -50..0). The claw itself ends ~65 px out, so without it
 * the player could not read the real range of the hit (docs/art/ENEMY_PIPELINE.md §9.2). after = s since the hit instant.
 * Local rig space (call between K.begin/K.end); the rect is in logic px, so divide by the elite / rig scale.
 */
function snapJet(ctx, e, P, rig, tx, ty, after) {
  const far = ((P.reachX ?? 10) + (P.reach ?? 110)) / ((e.scale || 1) * (rig.scale ?? 1)) - 10;
  const k = clamp(after / 0.07, 0, 1), fade = 1 - clamp((after - 0.08) / 0.22, 0, 1);
  if (fade <= 0.01) return;
  const x1 = lerp(tx, far, k), y1 = lerp(ty, -12, k);
  K.local();
  const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  ctx.globalAlpha = ga * 0.45 * fade; ctx.strokeStyle = '#8fd8ff'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.globalAlpha = ga * 0.8 * fade; ctx.strokeStyle = '#f0fcff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.globalAlpha = ga * 0.7 * fade; ctx.lineWidth = 2;                   // cavitation ring at the front of the jet
  ctx.beginPath(); ctx.ellipse(x1, y1, 4 + 8 * k, 3 + 7 * k, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
  for (let i = 1; i <= 3; i++) K.glow(lerp(tx, x1, i / 4), lerp(ty, y1, i / 4), 9, '#9fe4ff', 0.35 * fade);
  K.glow(x1, y1, 10 + 8 * k, '#ffffff', 0.75 * fade * k, 0.2);
}
