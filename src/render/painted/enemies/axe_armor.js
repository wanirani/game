// T2 painted mini-puppet (rig reuse): 도끼 갑옷 (axe_armor). The armour-knight rig (cuirass, limbs) with its own horned
// great helm and a glowing double-bitted great axe (1 Kling image); no shield, no cape, like the vector axe armour.
// Driven by AI_A.axeKnight: idle / walk (keeps its distance) · throw: e.high picks the arc — HIGH = axe raised over the
// helm (wind-up, visor flare + blade glint) → released at params.windup (0.55) in a big overhead arc; LOW = the knight
// crouches and drags the axe back at knee height → side-arm release. The painted axe leaves the hand on the release
// frame (the spinning projectile is the AI's PROJ_A.axeSpin) and the hand stays empty while e.axeOut, until it returns.
// hurt · airborne · death (armour pieces clatter, the horned helm rolls).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { bipedPose, swingTrail, glint } from './_biped.js';
import { layoutKnight, drawKnight, dieKnight } from './armor_knight.js';
import { atkPhase } from '../enemy_kit.js';

export const spec = {
  id: 'axe_armor', tier: 'T2', src: 'axe_armor',
  scale: 1.12,       // same cut puppet as the knight (80 px) sized to the 92 px logic rect
  bake: { outline: 0.42, deep: { '*': 0.62 }, deepTint: 'rgb(140,146,176)', glow: { axe: '#ff8a3a' } },
};

const OPT = { weapon: 'axe', shield: false, cape: false };
const TR = [0, 0, 0];
const _q = [0, 0];

/** biped pose (knight numbers) + the vector drawArmor pose:'axe' branch */
function pose(e) {
  const q = bipedPose(e, { stride: 6, pose: 'axe', weaponArm: 'B', restWA: 2.2, legSwing: 0.42, armSwing: 0.3, knee: 0.8, bobAmp: 2.2, walkLean: 0.06 });
  let hold = true;
  q.visor = 0;
  if (e.anim === 'throw') {
    const P = e.params || {};
    const ap = atkPhase(e.animT ?? 0, P.windup ?? 0.55, 0.1);
    const kw = ease.outCubic(ap.w), ks = ease.outCubic(ap.s);
    if (e.high !== false) {
      if (ap.s <= 0) { q.shB = lerp(0.2, 3.6, kw); q.elB = 0.5; q.wA = lerp(2.2, 4.3, kw); q.lean = -0.12 * kw; }
      else { q.shB = lerp(3.6, 1.55, ks); q.elB = 0.1; q.wA = lerp(4.3, 1.6, ks); q.lean = -0.12 + 0.3 * ks; hold = false; }
    } else {
      if (ap.s <= 0) { q.shB = lerp(0.2, -1.3, kw); q.elB = lerp(0.5, 0.3, kw); q.wA = lerp(2.2, -0.2, kw); q.lean = 0.25 * kw; q.hipF = lerp(q.hipF, 0.7, kw); q.knF = lerp(q.knF, -1.0, kw); q.hipB = lerp(q.hipB, -0.5, kw); q.knB = lerp(q.knB, -0.6, kw); q.bob += 7 * kw; }
      else { q.shB = lerp(-1.3, 1.5, ks); q.elB = 0.1; q.wA = lerp(-0.2, 1.6, ks); q.lean = 0.25; q.hipF = 0.7; q.knF = -1.0; q.hipB = -0.5; q.knB = -0.6; q.bob += 7; hold = false; }
    }
    q.trail = null;
    if (ap.s > 0) { q.trail = TR; TR[0] = e.high !== false ? 4.3 : -0.2; TR[1] = q.wA; TR[2] = clamp(1 - ap.after / 0.2, 0, 1) * 0.8; }
    q.tele = ap.s <= 0 ? ap.w : 0;
    q.visor = kw;
    if (q.hurt) q.lean = -0.2;
  } else if (e.axeOut) { hold = false; q.shB = 0.9; q.elB = 0.3; }
  OPT.weapon = hold ? 'axe' : null;
  return q;
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { K.begin(ctx, rig, 0); layoutKnight(e, q, OPT); K.end(); dieKnight(e, world, rig); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(21);
  const L = layoutKnight(e, q, OPT);
  // the axe's rune edges smoulder: additive glow pass of the blade silhouette under the parts (high quality only)
  if (!o.flash && L.hold && K.lod() > 1) {
    const h = L.hold, gco = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    K.put('axe', h.pv, h.x, h.y, h.rot, 1.04, 1.04, 0.25 + 0.35 * q.tele + 0.1 * Math.sin((e.t ?? 0) * 7), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  drawKnight(e);
  if (!o.flash) {
    K.pivotPos('helm', 'a', 'eye', L.nx + 1, L.ny + 2, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 3 + 4 * q.visor, '#ff6020', 0.55 + 0.45 * q.visor + 0.1 * Math.sin((e.t ?? 0) * 5));
    if (q.trail) swingTrail(ctx, L.sfx, L.sfy, q.trail[0], q.trail[1], 15 + 14 + 30, 16, '#ffd0a0', q.trail[2]);
  }
  if (q.tele > 0.4 && L.hold) {
    const h = L.hold;
    K.pivotPos('axe', h.pv, 'tip', h.x, h.y, h.rot, 1, 1, _q);
    glint(ctx, _q[0], _q[1], 5 + 6 * q.tele, '#fff0c8', (q.tele - 0.4) / 0.6);
  }
  K.end();
}
