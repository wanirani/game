// T2 painted mini-puppet (rig reuse): 해골 궁수 (skeleton_archer). The skeleton rig + a hooded skull (single-part Kling
// image), a painted longbow held in the back hand (its string is masked out of the art and drawn procedurally so it can
// be pulled) and a quiver on the back. Driven by AI_A.archer:
// idle / walk (keeps its distance) · draw (0.25 s raise → the string hand pulls back to the cheek while the aim tracks
// the player, arrow nocked, telegraph glint on the arrowhead in the last 40 % → loose at params.draw) · volley (same,
// aimed steeply up) · hurt · airborne · death (bones + bow collapse).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { bipedPose, glint, HP } from './_biped.js';
import { layoutSkel, drawSkel, dieSkel } from './skeleton.js';
import { atkPhase } from '../enemy_kit.js';

export const spec = {
  id: 'skeleton_archer', tier: 'T2', src: 'skeleton_archer',
  bake: { outline: 0.42, deep: { '*': 0.66 }, deepTint: 'rgb(150,150,176)', outlineParts: { bow: 0.8 } },
};

const OPT = { weapon: 'bow', shield: false, head: 'hood', quiver: true, bowRot: 0, bowSx: 1 };
const _q = [0, 0], _r = [0, 0];

/** biped pose + the vector 'bow' branch (drawSkel pose:'bow') */
function pose(e) {
  const q = bipedPose(e, { stride: 9, pose: 'bow' });
  const anim = e.anim, drawing = anim === 'draw' || anim === 'volley';
  const aim = e.aimA ?? (anim === 'volley' ? -0.85 : 0);
  q.drawing = drawing; q.aim = aim; q.k = 0; q.loosed = false;
  if (drawing) {
    const T = e.params?.draw ?? 0.75, at = e.animT ?? 0;
    const ap = atkPhase(at, T, 0.09);
    const k = ease.outQuad(clamp(at / 0.25, 0, 1));
    q.shB = lerp(0.3, HP - aim, k); q.elB = 0;                                     // bow arm reaches forward along the aim
    q.shF = lerp(0.3, HP - aim + 0.35, k); q.elF = lerp(0.5, -2.3 + ap.w * -0.35, k);   // string hand pulls back to the cheek
    q.lean = -0.05 + (anim === 'volley' ? -0.1 : 0);
    q.tele = ap.w > 0.6 && ap.s <= 0 ? (ap.w - 0.6) / 0.4 : 0;
    q.jaw = 0.06; q.k = k; q.loosed = ap.s > 0;
    if (q.hurt) { q.lean = -0.28; q.shF -= 0.6; q.shB -= 0.5; }
  }
  // bow: vector canvas rotation (drawing ? aim : -0.9) with the bow along its local y → world dir of the bow's up axis
  OPT.bowRot = (drawing ? aim : -0.9) - HP;
  OPT.bowSx = drawing ? 1 + 0.22 * q.k * (q.loosed ? 0.3 : 1) : 1;
  return q;
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  if (e.dying > 0) {
    if (!e._pcorpse && world) { K.begin(ctx, rig, 0); layoutSkel(e, q, OPT); K.end(); dieSkel(e, world, rig); }
    if (world) return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(15);
  const L = layoutSkel(e, q, OPT);
  drawSkel();
  // bow string (+ nocked arrow) in local space
  const bw = L.bow;
  if (bw) {
    K.pivotPos('bow', 'grip', 'top', bw.x, bw.y, bw.rot, bw.sx, bw.sy, _q);
    K.pivotPos('bow', 'grip', 'bot', bw.x, bw.y, bw.rot, bw.sx, bw.sy, _r);
    K.local();
    const nock = q.drawing && !q.loosed;
    ctx.lineCap = 'round';
    ctx.strokeStyle = o.flash ? '#ffffff' : 'rgba(226,214,190,0.9)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(_q[0], _q[1]);
    if (nock) ctx.lineTo(L.gx, L.gy);
    ctx.lineTo(_r[0], _r[1]); ctx.stroke();
    if (nock) {
      const c = Math.cos(q.aim), s = Math.sin(q.aim), hx = L.gx, hy = L.gy, A = 34;
      ctx.strokeStyle = o.flash ? '#ffffff' : '#6a4a2a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(hx - c * 2, hy - s * 2); ctx.lineTo(hx + c * (A - 5), hy + s * (A - 5)); ctx.stroke();
      if (!o.flash) {
        ctx.fillStyle = '#c8ccd4';
        ctx.beginPath(); ctx.moveTo(hx + c * A, hy + s * A); ctx.lineTo(hx + c * (A - 6) - s * 2.4, hy + s * (A - 6) + c * 2.4); ctx.lineTo(hx + c * (A - 6) + s * 2.4, hy + s * (A - 6) - c * 2.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b02a2a';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + c * 5 - s * 2.4, hy + s * 5 + c * 2.4); ctx.lineTo(hx + c * 5, hy + s * 5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + c * 5 + s * 2.4, hy + s * 5 - c * 2.4); ctx.lineTo(hx + c * 5, hy + s * 5); ctx.closePath(); ctx.fill();
      }
      if (q.tele > 0) glint(ctx, hx + c * A, hy + s * A, 4 + 5 * q.tele, '#ffe0a0', q.tele);
    }
  }
  if (!o.flash) {
    K.pivotPos('hood', 'a', 'eye', L.nx, L.ny, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.4 + 2 * q.tele, '#ff5a2a', 0.55 + 0.2 * Math.sin((e.t ?? 0) * 6) + q.tele * 0.3);
    K.pivotPos('hood', 'a', 'eye2', L.nx, L.ny, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 1.8 + 1.5 * q.tele, '#ff5a2a', 0.4 + q.tele * 0.3);
  }
  K.end();
}
