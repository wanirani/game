// T2 painted mini-puppet (knight-rig reuse): 근위 갑옷 (royal_guard). The armour-knight cuirass, limbs and greaves
// re-painted as crimson-lacquered plate with gold filigree and a navy velvet tabard/cape (composition-keeping Kling edits,
// so the knight cut coordinates still fit), a closed helm with a flowing crimson horsehair plume and golden visor glow,
// the crimson tower shield with the gold cross on the FAR arm (behind the body, its front edge braced ahead of the chest,
// like the vector version) and a long royal halberd (gold crescent axe, back spike, spear point, crimson tassel) in the
// NEAR hand.
// Driven by AI_B.halberdier: idle / walk (halberd upright, 6.5 rad/s heavy gait, cape sway) · sweep (0.62 s wind-up:
// the halberd rises back over the helm, visor flares, blade glint → big overhead cleave down-forward at the AI's hit
// frame with a gold crescent trail and a small step) · thrust (e.high picks the line: HIGH = levelled at head height,
// LOW = the guard drops into a crouch and aims at the shins; 0.52 s wind-up drawing the halberd back → lunge with a
// white-hot streak past the spear point) · front block (AI sparks; the painted shield jolts when hit from the front) ·
// hurt · airborne · death (armour pieces clatter, the plumed helm rolls, the halberd falls).
import * as K from '../enemy_kit.js';
import { atkPhase } from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { bipedPose, dirOf, glint, swingTrail } from './_biped.js';
import { Placer, claimDeathDebris } from './blood_skeleton.js';

export const spec = {
  id: 'royal_guard', tier: 'T2', src: 'royal_guard',
  scale: 1.15,       // the knight cut stands 80 px to the helm crest; logic rect 98 px incl. the plume (measure.mjs)
  bake: { outline: 0.42, deep: { '*': 0.62 }, deepTint: 'rgb(150,120,150)', glow: { halberd: '#ffd98a' } },
};

const P = new Placer();
const _q = [0, 0], _r = [0, 0];
const SWEEP_WU = 0.62, THRUST_WU = 0.52;   // AI_B.halberdier hit frames

/** pose: vector-convention arm angles (0 = down, + = forward) + halberd world direction (0 = forward, − = up) */
function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = bipedPose(e, { stride: 6.5, pose: 'none', legSwing: 0.42, armSwing: 0.28, knee: 0.8, bobAmp: 2.2, walkLean: 0.05 });
  q.shF = 0.75 + (q.walking ? Math.sin(q.ph) * 0.06 : 0); q.elF = 0.85;
  q.hal = -1.5 + (q.walking ? Math.sin(t * 6.5) * 0.04 : Math.sin(t * 1.6) * 0.015);   // upright, a touch forward
  q.shB = 0.95; q.elB = 0.55;                      // far arm braces the shield
  q.tele = 0; q.visor = 0; q.push = 0; q.trail = null; q.shieldX = 0; q.shieldR = 0;
  if (an === 'sweep') {
    const ap = atkPhase(at, SWEEP_WU, 0.12);
    if (ap.s <= 0) {
      const k = ease.outCubic(ap.w);
      q.shF = lerp(0.9, 2.7, k); q.elF = lerp(0.6, 0.35, k); q.hal = lerp(-1.5, dirOf(3.95), k); q.lean = -0.1 * k;
      q.tele = ap.w; q.visor = k; q.shieldX = -3 * k; q.shieldR = -0.1 * k;
    } else {
      const k = ease.outExpo(ap.s);
      q.shF = lerp(2.7, 1.15, k); q.elF = lerp(0.35, 0.2, k); q.hal = lerp(dirOf(3.95), dirOf(1.05), k); q.lean = 0.2 * k; q.stepX = 5 * k;
      q.hipF = 0.5; q.knF = -0.35; q.hipB = -0.4;
      q.visor = 1 - k * 0.5;
      const f = clamp(1 - ap.after / 0.3, 0, 1);
      if (f > 0) q.trail = [3.95, lerp(3.95, 1.05, k), f];
    }
  } else if (an === 'thrust') {
    const ap = atkPhase(at, THRUST_WU, 0.08);
    const high = e.high !== false;
    const aim = high ? -0.12 : 0.18;
    const kw = ease.outCubic(ap.w), ks = ease.outBack(ap.s);
    const back = ap.s > 0 ? clamp((ap.after - 0.3) / 0.2, 0, 1) : 0;
    if (ap.s <= 0) { q.shF = lerp(0.9, 1.0, kw); q.elF = lerp(0.8, 1.35, kw); q.lean = -0.14 * kw; q.stepX = -5 * kw; }
    else { q.shF = lerp(1.0, 1.5, ks * (1 - back)); q.elF = lerp(1.35, 0.1, ks * (1 - back)); q.lean = lerp(-0.14, 0.2, ks) * (1 - back); q.stepX = lerp(-5, 10, ks) * (1 - back); q.hipF = 0.6; q.knF = -0.3; q.hipB = -0.45; }
    if (!high) { q.bob += 9 * kw; q.hipF = lerp(q.hipF, 0.9, kw); q.knF = lerp(q.knF, -1.3, kw); q.hipB = lerp(q.hipB, -0.6, kw); q.knB = lerp(q.knB, -0.9, kw); }
    q.hal = lerp(-1.5, aim, clamp(ap.w * 2.2, 0, 1));
    q.tele = ap.s <= 0 ? ap.w : 0;
    q.visor = kw;
    q.push = ap.s > 0 ? clamp(1 - ap.after / 0.25, 0, 1) : 0;
    q.shieldX = 2 * kw;
  }
  if (q.hurt) { q.lean = -0.2; q.shieldX -= 3; q.shieldR -= 0.15; }
  if (e.onGround === false && !(e.stun > 0)) q.hal = -1.2;
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

let CAPE = null;
function layout(e, q) {
  P.reset();
  const hipY = -36 + q.bob, sx0 = q.stepX, tr = q.lean;
  K.pivotPos('torso', 'a', 'neck', sx0, hipY, tr, 1, 1, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('torso', 'a', 'shN', sx0, hipY, tr, 1, 1, _q); const snx = _q[0], sny = _q[1];
  K.pivotPos('torso', 'a', 'shF', sx0, hipY, tr, 1, 1, _q); const sfx = _q[0], sfy = _q[1];
  const up = K.part('uarm'), fp = K.part('farm'), hp = K.part('halberd');
  // cape (strip-warped in draw), then the far arm with the tower shield braced ahead of the chest (behind the body)
  CAPE = P.place('cape', nx - 5, ny + 3, tr * 0.5, 'deep', 0.62, 1);
  CAPE.fx = drawCape;
  let b = P.bone('uarm', sfx - 1, sfy + 1, dirOf(q.shB), 'deep');
  const fex = b[0], fey = b[1];
  P.place('farm', fex, fey, dirOf(q.shB + q.elB) - fp.ang, 'deep');
  const shx = 12 + sx0 * 0.4 + q.shieldX, shy = -50 + q.bob;
  const sh = P.place('shield', shx, shy, q.shieldR + tr * 0.4, 'base', 0.78, 0.9);
  // back leg (the rerebrace doubles as the cuisse), cuirass, front leg, helm
  b = limb('uarm', sx0 - 2, hipY, dirOf(q.hipB), 15, 'deep', 1.1, 1.2);
  P.bone('shin', b[0], b[1], dirOf(q.hipB + q.knB), 'deep');
  P.place('torso', sx0, hipY, tr);
  b = limb('uarm', sx0 + 2, hipY, dirOf(q.hipF), 15, 'base', 1.1, 1.2);
  P.bone('shin', b[0], b[1], dirOf(q.hipF + q.knF));
  const hr = q.lean * 0.5 + q.head * 0.7;
  P.place('helm', nx + 1, ny + 2, hr);
  // near arm: the gauntlet grips the halberd at grip2 (upper hand); halberd first, gauntlet over the shaft
  const ux = snx + Math.cos(dirOf(q.shF)) * up.len, uy = sny + Math.sin(dirOf(q.shF)) * up.len;
  const ffr = dirOf(q.shF + q.elF) - fp.ang;
  K.pivotPos('farm', 'a', 'grip', ux, uy, ffr, 1, 1, _q);
  const gx = _q[0], gy = _q[1];
  const hr2 = q.hal - hp.ang;                                  // halberd a→b (butt→point) along q.hal
  const hal = P.place('halberd', gx, gy, hr2, 'base', 1, 1, 'grip2');
  P.place('uarm', snx, sny, dirOf(q.shF) - up.ang);
  P.place('farm', ux, uy, ffr);
  K.pivotPos('halberd', 'grip2', 'b', gx, gy, hr2, 1, 1, _q); const tipx = _q[0], tipy = _q[1];
  K.pivotPos('halberd', 'grip2', 'head', gx, gy, hr2, 1, 1, _q); const hx = _q[0], hy = _q[1];
  return { nx, ny, hr, gx, gy, tipx, tipy, hx, hy, snx, sny, hal, sh };
}

let CAPE_T = 0, CAPE_W = false;
const capeOff = (u) => { _cw[0] = -(u * u) * (CAPE_W ? 24 : 8) - Math.sin(CAPE_T * (CAPE_W ? 9 : 2.2) - u * 3) * u * 7 * (CAPE_W ? 1 : 0.35); _cw[1] = 0; return _cw; };
const _cw = [0, 0];
function drawCape(p, alpha) { K.strips(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, K.nStrips(8), 'y', capeOff, alpha, p.vn); }

function die(e, world, rig) {
  e._pcorpse = true;
  claimDeathDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  if (CAPE) CAPE.fx = null;
  P.corpse(world, e, rig, (p) => {
    const heavy = p.name === 'torso' || p.name === 'shield';
    const up = p.name === 'helm' ? 1.3 : p.name === 'halberd' ? 0.4 : heavy ? 0.5 : 1;
    return [kb * 40 + K.frand(-90, 90) * (heavy ? 0.4 : 1), -K.frand(80, 300) * up, K.frand(-7, 7) * (heavy || p.name === 'halberd' ? 0.35 : 1)];
  }, { life: 1.6, fade: 0.55, bounce: 0.2, dust: { n: 8, w: 18, h: 20, col: '#6a4a50' } });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  const t = e.t ?? 0;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layout(e, q); K.end(); die(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(21);
  CAPE_T = t; CAPE_W = e.anim === 'walk';
  const L = layout(e, q);
  if (!o.flash && q.trail) swingTrail(ctx, L.snx, L.sny, q.trail[0], q.trail[1], 80, 24, '#ffd070', q.trail[2] * 0.85);
  // the gilded blade glows faintly (baked colour silhouette under the part, medium/high quality)
  if (!o.flash && K.lod() > 0 && (q.tele > 0 || q.push > 0)) {
    const s = L.hal, gco = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    K.put('halberd', s.pv, s.x, s.y, s.rot, 1.02, 1.02, 0.2 + 0.4 * Math.max(q.tele, q.push), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  P.draw();
  if (!o.flash) {
    K.pivotPos('helm', 'a', 'eye', L.nx + 1, L.ny + 2, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 3 + 4 * q.visor, '#ffd060', 0.6 + 0.4 * q.visor + 0.1 * Math.sin(t * 5));
    if (q.push > 0) {
      // thrust streak: a white-gold wedge running out along the halberd line past the spear point
      K.local();
      const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
      const c = Math.cos(q.hal), s = Math.sin(q.hal);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * q.push * 0.85; ctx.fillStyle = '#fff0c8';
      ctx.beginPath();
      ctx.moveTo(L.tipx - c * 60 - s * 3, L.tipy - s * 60 + c * 3);
      ctx.lineTo(L.tipx + c * 55, L.tipy + s * 55);
      ctx.lineTo(L.tipx - c * 60 + s * 3, L.tipy - s * 60 - c * 3);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
    }
  }
  if (q.tele > 0.4) glint(ctx, e.anim === 'thrust' ? L.tipx : L.hx, e.anim === 'thrust' ? L.tipy : L.hy, 5 + 6 * q.tele, '#ffe8b0', (q.tele - 0.4) / 0.6);
  K.end();
}
