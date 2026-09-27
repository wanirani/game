// T2 painted mini-puppet (knight-rig reuse): 창병 갑옷 (spear_guard). The armour-knight cuirass + crimson tabard, limbs
// and greaves (armor_knight atlas cuts, re-packed into this type's atlas) with its own plumed closed helm (red visor)
// and a long war spear (gold bands, glowing leaf spearhead) held in BOTH hands — the front hand drives the spear, the
// back arm reaches the shaft by 2-bone IK.
// Driven by AI_A.lancer: idle / walk (7 rad/s, keeps its distance) · thrust: e.high picks the line — HIGH = spear
// levelled at head height, LOW = the guard drops into a crouch and aims at the shins — wind-up (spear drawn back,
// visor flare, spearhead glint) → lunge at params.windup (0.55) with a white thrust streak → recovery · hurt · airborne ·
// death (armour pieces clatter, the plumed helm rolls, the spear drops).
import * as K from '../enemy_kit.js';
import { atkPhase } from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { bipedPose, dirOf, glint, ik2 } from './_biped.js';
import { Placer, claimDeathDebris } from './blood_skeleton.js';

export const spec = {
  id: 'spear_guard', tier: 'T2', src: 'spear_guard',
  scale: 1.12,       // the knight cut stands 80 px; logic rect / vector spear guard: 90 px
  bake: { outline: 0.42, deep: { '*': 0.62 }, deepTint: 'rgb(140,146,176)', glow: { spear: '#7ae8ff' } },
};

const P = new Placer();
const _q = [0, 0], _r = [0, 0];

function pose(e) {
  const q = bipedPose(e, { stride: 7, pose: 'none', legSwing: 0.42, armSwing: 0.3, knee: 0.8, bobAmp: 2.2, walkLean: 0.06 });
  q.spear = -1.25 + Math.sin((e.t ?? 0) * 2) * 0.02;       // world direction of the spear (0 = forward, − = up)
  q.push = 0; q.visor = 0; q.tele = 0;
  if (e.anim === 'thrust') {
    const ap = atkPhase(e.animT ?? 0, e.params?.windup ?? 0.55, 0.08);
    const kw = ease.outCubic(ap.w), ks = ease.outBack(ap.s);
    const high = e.high !== false;
    if (ap.s <= 0) { q.shF = lerp(0.3, 0.8, kw); q.elF = lerp(0.6, 1.0, kw); q.lean = lerp(0.02, -0.15, kw); q.stepX = -5 * kw; }
    else { q.shF = lerp(0.8, 1.3, ks); q.elF = lerp(1.0, 0.3, ks); q.lean = lerp(-0.15, 0.2, ks); q.stepX = lerp(-5, 10, ks); q.hipF = 0.6; q.knF = -0.3; q.hipB = -0.45; }
    if (!high) { q.bob += 8 * kw; q.hipF = lerp(q.hipF, 0.9, kw); q.knF = lerp(q.knF, -1.3, kw); q.hipB = lerp(q.hipB, -0.6, kw); q.knB = lerp(q.knB, -0.9, kw); }
    const aim = high ? -0.12 : 0.35;
    q.spear = lerp(-1.25, aim, clamp(ap.w * 2.5, 0, 1));
    q.tele = ap.s <= 0 ? ap.w : 0;
    q.visor = kw;
    q.push = ap.s > 0 ? clamp(1 - ap.after / 0.25, 0, 1) : 0;
  }
  if (q.hurt) q.lean = -0.2;
  return q;
}

/** knight limb whose painted piece is shorter than the bone: pivot b on the far joint, stretched along it */
function limb(name, x, y, dir, L, vn, st, sx) {
  const p = K.part(name);
  const ex = x + Math.cos(dir) * L, ey = y + Math.sin(dir) * L;
  if (p) P.place(name, ex, ey, dir - p.ang, vn, sx, st, 'b');
  _r[0] = ex; _r[1] = ey;
  return _r;
}

function layout(e, q) {
  P.reset();
  const hipY = -36 + q.bob, sx0 = q.stepX, tr = q.lean;
  K.pivotPos('torso', 'a', 'neck', sx0, hipY, tr, 1, 1, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('torso', 'a', 'shN', sx0, hipY, tr, 1, 1, _q); const snx = _q[0], sny = _q[1];
  K.pivotPos('torso', 'a', 'shF', sx0, hipY, tr, 1, 1, _q); const sfx = _q[0], sfy = _q[1];
  const up = K.part('uarm'), fp = K.part('farm'), sp = K.part('spear');
  // front hand first (pure math): it carries the spear
  const fex = snx + Math.cos(dirOf(q.shF)) * up.len, fey = sny + Math.sin(dirOf(q.shF)) * up.len;
  const ffr = dirOf(q.shF + q.elF) - fp.ang;
  K.pivotPos('farm', 'a', 'grip', fex, fey, ffr, 1, 1, _q);
  const gx = _q[0], gy = _q[1];
  const srot = q.spear - sp.ang;
  K.pivotPos('spear', 'a', 'grip2', gx, gy, srot, 1, 1, _q);
  const g2x = _q[0], g2y = _q[1];
  // back arm reaches the shaft (IK), behind the body
  const lg = Math.hypot(fp.piv.grip[0] - fp.piv.a[0], fp.piv.grip[1] - fp.piv.a[1]) / P.td;   // elbow → grip, logical px
  const d = ik2(sfx - 1, sfy + 1, g2x, g2y, up.len, lg, -1);
  const d1 = d[0], d2 = d[1];
  P.place('uarm', sfx - 1, sfy + 1, d1 - up.ang, 'deep');
  const bex = sfx - 1 + Math.cos(d1) * up.len, bey = sfy + 1 + Math.sin(d1) * up.len;
  P.place('farm', bex, bey, d2 - P.gAng, 'deep');
  // back leg (the rerebrace doubles as the cuisse)
  let b = limb('uarm', sx0 - 2, hipY, dirOf(q.hipB), 15, 'deep', 1.15, 1.2);
  P.bone('shin', b[0], b[1], dirOf(q.hipB + q.knB), 'deep');
  P.place('torso', sx0, hipY, tr);
  b = limb('uarm', sx0 + 2, hipY, dirOf(q.hipF), 15, 'base', 1.15, 1.2);
  P.bone('shin', b[0], b[1], dirOf(q.hipF + q.knF));
  const hr = q.lean * 0.5 + q.head * 0.7;
  P.place('helm', nx + 1, ny + 2, hr);
  // spear across the body, then the front arm over it (gauntlet wraps the shaft)
  const spr = P.place('spear', gx, gy, srot);
  P.place('uarm', snx, sny, dirOf(q.shF) - up.ang);
  P.place('farm', fex, fey, ffr);
  K.pivotPos('spear', 'a', 'b', gx, gy, srot, 1, 1, _q);
  return { nx, ny, hr, gx, gy, tipx: _q[0], tipy: _q[1], spr };
}

function die(e, world, rig) {
  e._pcorpse = true;
  claimDeathDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'torso';
    const up = p.name === 'helm' ? 1.3 : p.name === 'spear' ? 0.45 : heavy ? 0.5 : 1;
    return [kb * 40 + K.frand(-90, 90) * (heavy ? 0.4 : 1), -K.frand(80, 300) * up, K.frand(-7, 7) * (heavy || p.name === 'spear' ? 0.35 : 1)];
  }, { life: 1.6, fade: 0.55, bounce: 0.2, dust: { n: 8, w: 18, h: 20, col: '#6a6470' } });
}

export function draw(ctx, e, world, o, rig) {
  P.td = rig.td;
  if (P.gAng === undefined || P.rig !== rig) {       // a→grip direction of the gauntlet (texel space), once per rig
    const fp = rig.parts.farm;
    P.gAng = Math.atan2(fp.piv.grip[1] - fp.piv.a[1], fp.piv.grip[0] - fp.piv.a[0]); P.rig = rig;
  }
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(19);
  const L = layout(e, q);
  // the spearhead's rune edge glows (baked colour silhouette under the part, high quality only)
  if (!o.flash && K.lod() > 1) {
    const s = L.spr, gco = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    K.put('spear', s.pv, s.x, s.y, s.rot, 1.01, 1.12, 0.18 + 0.3 * q.tele + 0.08 * Math.sin((e.t ?? 0) * 6), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  P.draw();
  if (!o.flash) {
    K.pivotPos('helm', 'a', 'eye', L.nx + 1, L.ny + 2, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 3 + 4 * q.visor, '#ff3020', 0.55 + 0.45 * q.visor + 0.1 * Math.sin((e.t ?? 0) * 5));
    if (q.push > 0) {
      // thrust streak: a white-hot wedge running out along the spear line past the tip
      K.local();
      const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
      const c = Math.cos(q.spear), s = Math.sin(q.spear);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * q.push * 0.85; ctx.fillStyle = '#ffe8c0';
      ctx.beginPath();
      ctx.moveTo(L.gx + c * 20 - s * 3, L.gy + s * 20 + c * 3);
      ctx.lineTo(L.gx + c * 100, L.gy + s * 100);
      ctx.lineTo(L.gx + c * 20 + s * 3, L.gy + s * 20 - c * 3);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
    }
  }
  if (q.tele > 0.4) glint(ctx, L.tipx, L.tipy, 5 + 6 * q.tele, '#e0f8ff', (q.tele - 0.4) / 0.6);
  K.end();
}
