// T1 painted machine-creature: 불풀무 (bellows). Parts (one Kling parts sheet): stitched leather bag with iron bands and
// wooden handles, scorched plank front wall with the socket, iron nozzle pipe, brass idol head (fire in its hollow skull,
// open mouth), iron claw leg (x3, far ones darkened).
// The nozzle is raised ~55 degrees so the idol's mouth sits on the AI's mouth point (AI_C.bellows.mouth: feet +
// (w/2, -mouthY 50)) where ZONE_C.flamecone starts. Driven by AI_C.bellows: idle (slow breathing, e.inflate ~0.3) ·
// inhale (bag swells with e.inflate, head strains back, air streaks rush into the mouth, the skull fire brightens) ·
// blow (bag collapses, the head bucks forward and shakes, white-hot mouth, sparks) · hurt (flash, squash, rattle) ·
// death (the machine falls apart: bag, wall, pipe, head and legs tumble, ember burst).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';
import { claimDebris } from './_biped.js';

export const spec = {
  id: 'bellows', tier: 'T1', src: 'bellows',
  scale: 0.95,       // the assembled machine stands 67 px on its claw legs; the logic rect is 64
  bake: { outline: 0.4, deep: { leg: 0.55 }, deepTint: 'rgb(150,110,96)', glow: { head: '#ff9a40' } },
};

const _q = [0, 0], _m = [0, 0];
const PL = []; let NP = 0;
function place(name, pv, x, y, rot, sx = 1, sy = 1, vn = 'base') {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.pv = pv; o.x = x; o.y = y; o.rot = rot; o.sx = sx; o.sy = sy; o.vn = vn; NP++;
  return o;
}

/** pose → placements (reused objects); returns the mouth position in _m */
function layout(e, t) {
  NP = 0;
  const an = e.anim, at = e.animT ?? 0;
  const inf = clamp(e.inflate ?? 0.3, 0, 1);
  const hurt = K.hurtOf(e);
  const inh = an === 'inhale', blow = an === 'blow';
  const rattle = (hurt ? Math.sin(t * 60) * 0.6 : 0) + (blow ? Math.sin(t * 47) * 0.5 * clamp(1 - at / 1.2, 0, 1) : 0) + (inh ? Math.sin(t * 31) * 0.25 * inf : 0);
  const baseY = -13, LY = -15;
  // legs (far first)
  place('leg', 'a', -26, LY - 1, 0.12 + Math.sin(t * 2.1) * 0.02, 1.15, 1.15, 'deep');
  place('leg', 'a', -9, LY, 0.04, 1.15, 1.15, 'deep');
  // bag behind the wall: anchored on its front edge, swells with inflate (x more than y, like a lung)
  const br = Math.sin(t * 2.2) * 0.015;
  const bsx = lerp(0.78, 1.1, inf) + br, bsy = lerp(0.9, 1.05, inf) + br * 0.5;
  place('bag', 'front', -8 + rattle * 0.3, -36 + (1 - bsy) * 20, -0.02 * (1 - inf), bsx, bsy);
  // front wall (plank board) + near leg
  place('leg', 'a', 7, LY, -0.08, 1.2, 1.2);
  const bx = 1 + rattle * 0.4, bY = baseY + Math.abs(rattle) * 0.3;
  place('board', 'a', bx, bY, rattle * 0.01);
  K.pivotPos('board', 'a', 'sock', bx, bY, rattle * 0.01, 1, 1, _q);
  const sx0 = _q[0], sy0 = _q[1];
  // nozzle: raised; strains back while inhaling, bucks forward while blowing
  let na = -0.95 + (inh ? -0.06 * inf : 0) + (blow ? 0.07 * clamp(1 - at / 0.5, 0, 1) : 0) + rattle * 0.02;
  place('nozzle', 'a', sx0, sy0, na);
  K.pivotPos('nozzle', 'a', 'b', sx0, sy0, na, 1, 1, _q);
  const hx = _q[0], hy = _q[1];
  const ha = -0.55 + (na + 0.95) * 1.3 + (blow ? Math.sin(t * 38) * 0.05 : 0);
  const hs = 1 + (blow ? 0.06 * clamp(1 - at / 0.4, 0, 1) : 0) + (inh ? -0.03 * inf : 0);
  const head = place('head', 'a', hx, hy, ha, hs, hs);
  K.pivotPos('head', 'a', 'mouth', hx, hy, ha, hs, hs, _m);
  return head;
}

function drawParts() { for (let i = 0; i < NP; i++) { const p = PL[i]; K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn); } }

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      claimDebris(world, e);
      K.begin(ctx, rig, 0); layout(e, t); K.end();
      const pieces = [];
      for (let i = 0; i < NP; i++) {
        const p = PL[i], heavy = p.name === 'board' || p.name === 'bag';
        pieces.push({ ...p, vx: K.frand(-110, 110) * (heavy ? 0.4 : 1), vy: -K.frand(120, 340) * (heavy ? 0.5 : 1) - (p.name === 'head' ? 160 : 0), vr: K.frand(-8, 8) * (heavy ? 0.3 : 1) });
      }
      K.spawnCorpse(world, e, rig, pieces, { life: 1.5, fade: 0.5, bounce: 0.25, dust: { n: 10, w: 26, h: 30, col: '#3a2a22' } });
      // ember burst from the split bag
      K.spawnDissolve(world, e, rig, [], { life: 0.6, n: 18, col: '#ff8a3a', kind: 3, spread: 220, cy: -34 });
    }
    return;
  }
  const inf = clamp(e.inflate ?? 0.3, 0, 1), an = e.anim, at = e.animT ?? 0;
  const blow = an === 'blow', inh = an === 'inhale';
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(30, 0.45);
  const head = layout(e, t);
  // skull fire glow behind the head (additive silhouette, pulses with the air in the bag)
  const heat = 0.25 + 0.35 * inf + (blow ? 0.5 * clamp(1 - at / 1.2, 0, 1) : 0);
  drawParts();
  if (!o.flash) {
    const gco = ctx.globalCompositeOperation;
    if (K.lod() > 0) {
      ctx.globalCompositeOperation = 'lighter';
      K.put('head', head.pv, head.x, head.y, head.rot, head.sx * 1.03, head.sy * 1.03, 0.06 + 0.12 * heat + 0.03 * Math.sin(t * 9), 'glow');
      ctx.globalCompositeOperation = gco;
    }
    K.pivotPos('head', 'a', 'fire', head.x, head.y, head.rot, head.sx, head.sy, _q);
    K.glow(_q[0], _q[1], 6 + 5 * heat, '#ff8a2a', 0.5 + 0.4 * heat + 0.1 * Math.sin(t * 13));
    K.pivotPos('head', 'a', 'eye', head.x, head.y, head.rot, head.sx, head.sy, _q);
    K.glow(_q[0], _q[1], 2.5 + 2 * heat, '#ffd070', 0.6 + 0.4 * heat);
    // bag seam: the fire inside shows through the middle band
    K.glow(-22 * lerp(0.78, 1.1, inf), -36, 10 + 6 * inf, '#ff6a1a', 0.18 + 0.25 * inf + (blow ? 0.25 : 0));
    // mouth: hot while blowing, sucking glow while inhaling
    if (blow) {
      const k = clamp(1 - at / 1.25, 0, 1);
      K.glow(_m[0], _m[1], 10 + 12 * k, '#fff0b0', 0.9 * k, 0.2);
      K.glow(_m[0] + 6, _m[1], 20 + 10 * k, '#ff7a2a', 0.6 * k);
    } else K.glow(_m[0], _m[1], 4 + 6 * inf, '#ff9a40', 0.35 + 0.4 * (inh ? inf : 0));
    // inhale: air streaks rushing into the mouth (render only, deterministic)
    if (inh) {
      K.local();
      const ga = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#e8d8c0'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        const u = (t * 2.4 + i / 5) % 1, a = (K.h1(i + Math.floor(t * 2.4 + i / 5) * 7) - 0.5) * 1.1 - 0.35, r = 16 + (1 - u) * 60;
        const x0 = _m[0] + Math.cos(a) * r * 0.7, y0 = _m[1] + Math.sin(a) * r * 0.7;
        ctx.globalAlpha = ga * 0.45 * u * inf;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - Math.cos(a) * 10, y0 - Math.sin(a) * 10); ctx.stroke();
      }
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
    }
  }
  K.end();
  // embers from the seams and the mouth (world space, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(22));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    const mx = e.cx + f * sc * _m[0], my = e.bottom + sc * _m[1];
    for (let n = pool.rate(0, 3 + 5 * inf, dt); n > 0; n--) pool.add(3, e.cx + f * sc * K.frand(-34, -10), e.bottom - sc * K.frand(24, 44), K.frand(-15, 15), K.frand(-60, -25), K.frand(0.5, 1.0), K.frand(1.2, 2.2), '#ff9a40');
    if (blow) for (let n = pool.rate(1, K.lod() === 0 ? 10 : 20, dt); n > 0; n--) pool.add(3, mx, my + K.frand(-4, 4), f * K.frand(140, 320), K.frand(-60, 40), K.frand(0.25, 0.5), K.frand(1.5, 3), '#ffd070');
    else if (at < 0.6 && e._wasBlow) for (let n = pool.rate(2, 8, dt); n > 0; n--) pool.add(2, mx, my, f * K.frand(10, 40), K.frand(-50, -20), K.frand(0.6, 1.1), K.frand(3, 6), '#3a3230');
    e._wasBlow = blow || (e._wasBlow && at < 0.6);
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
