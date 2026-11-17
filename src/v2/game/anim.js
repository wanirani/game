// v2g anim — the Animator of src/v2/char3d/skel.js with a pose step that allocates nothing.
// char3d's applyPose() makes two typed-array views per bone plus a few small arrays on every call (about 4 KB per
// character per tick: found by tools/v2/game_check.mjs). The maths here is the same, line for line; only the temporaries
// are gone: per-rig views are made once, the scratch quaternions live at module level.
// PoseAnimator has the same public face as Animator (play, update, cur, t, ext, speed ...), so play's driveHero / driveActor use it as is.
import { Animator, sampleClip, qmul, qconj, qnorm } from '../char3d/skel.js';

const Q = [0, 0, 0, 1], A4 = [0, 0, 0, 1], B4 = [0, 0, 0, 1], ID = [0, 0, 0, 1], V3 = [0, 0, 0], O3 = [0, 0, 0];
const qrot = (q, v, o) => {
  const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  o[0] = x + qw * tx + qy * tz - qz * ty; o[1] = y + qw * ty + qz * tx - qx * tz; o[2] = z + qw * tz + qx * ty - qy * tx; return o;
};
/** per-rig lists made once: keyed bones with their parent-world and rest-rotation views (the buffers are never replaced) */
function bonesOf(rig) {
  let L = rig._g2;
  if (!L) {
    L = rig._g2 = { key: [], j: [], P: [], R0: [], hips: -1, hipsP: null };
    for (const [key, j] of rig.key) { L.key.push(key); L.j.push(j); L.P.push(rig.parWR.subarray(j * 4, j * 4 + 4)); L.R0.push(rig.restR.subarray(j * 4, j * 4 + 4)); }
    const h = rig.key.get('hips');
    if (h != null) { L.hips = h; L.hipsP = rig.parWR.subarray(h * 4, h * 4 + 4); }
  }
  return L;
}
/** same result as char3d applyPose(rig, A, B, w) */
export function applyPoseNA(rig, A, B, w) {
  const R = rig.R, T = rig.T, L = bonesOf(rig), K = L.key, J = L.j, n = K.length;
  R.set(rig.restR); T.set(rig.restT);
  for (let i = 0; i < n; i++) {
    const key = K[i], qa = A.rot.get(key), qb = B ? B.rot.get(key) : undefined;
    const ha = qa && qa.set, hb = qb && qb.set;
    if (!ha && !hb) continue;
    let d = ha ? qa : ID;
    if (B) {
      const e = hb ? qb : ID, s = d[0] * e[0] + d[1] * e[1] + d[2] * e[2] + d[3] * e[3] < 0 ? -w : w;
      Q[0] = d[0] * (1 - w) + e[0] * s; Q[1] = d[1] * (1 - w) + e[1] * s; Q[2] = d[2] * (1 - w) + e[2] * s; Q[3] = d[3] * (1 - w) + e[3] * s; d = qnorm(Q);
    }
    const P = L.P[i], j4 = J[i] * 4;
    qmul(qconj(P, A4), d, B4); qmul(B4, P, A4); qmul(A4, L.R0[i], B4); qnorm(B4);
    R[j4] = B4[0]; R[j4 + 1] = B4[1]; R[j4 + 2] = B4[2]; R[j4 + 3] = B4[3];
  }
  const h = L.hips;
  if (h >= 0) {
    const rx = B ? A.root[0] * (1 - w) + B.root[0] * w : A.root[0], ry = B ? A.root[1] * (1 - w) + B.root[1] * w : A.root[1], rz = B ? A.root[2] * (1 - w) + B.root[2] * w : A.root[2];
    const k = rig.restHipY / (rig.restWS[h] || 1);
    V3[0] = rx * k; V3[1] = ry * k; V3[2] = rz * k;
    const v = qrot(qconj(L.hipsP, A4), V3, O3);
    T[h * 3] += v[0]; T[h * 3 + 1] += v[1]; T[h * 3 + 2] += v[2];
  }
  rig.pose();
}

export class PoseAnimator extends Animator {
  /** as Animator.update, with the allocation-free pose step */
  update(dt) {
    if (!this.cur) return;
    if (!this.ext) this.t += dt * this.speed;
    if (this.prev || this.snap) { this.fadeT += dt; if (this.fadeT >= this.fade) { this.prev = null; this.snap = false; } }
    sampleClip(this.cur, this.t, this.A);
    if (this.prev || this.snap) {
      if (this.prev) sampleClip(this.prev, this.pt, this.B);
      const u = this.fadeT / this.fade; this.w = u * u * (3 - 2 * u);
      applyPoseNA(this.rig, this.snap ? this.S : this.B, this.A, this.w);
    } else { this.w = 1; applyPoseNA(this.rig, this.A, null, 0); }
  }
}
