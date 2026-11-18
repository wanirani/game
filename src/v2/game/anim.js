// v2g anim — the Animator of src/v2/char3d/skel.js with a pose step that allocates nothing.
// char3d's applyPose() makes two typed-array views per bone plus a few small arrays on every call (about 4 KB per
// character per tick: found by tools/v2/game_check.mjs). The maths here is the same, line for line; only the temporaries
// are gone: per-rig views are made once, the scratch quaternions live at module level.
// PoseAnimator has the same public face as Animator (play, update, cur, t, ext, speed ...), so play's driveHero / driveActor use it as is.
import { Animator, qmul, qconj } from '../char3d/skel.js';

// The scene's own copies of char3d's qnorm and sampleClip (B stays frozen). The only change: the length of a quaternion is a plain
// square root. Math.hypot with four arguments makes a temporary array per call in V8 — per bone, per character, per tick that was the
// largest source of per-frame garbage of the whole scene (core-verify heap profile: 13 KB + 6 KB a frame).
const qnorm = (a) => { const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; a[3] /= l; return a; };
function seek(times, t) { let lo = 0, hi = times.length - 1; if (t <= times[0]) return 0; if (t >= times[hi]) return hi - 1 < 0 ? 0 : hi - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; } return lo; }
/** the pose of a clip at t seconds, written into the canonical pose P (same maths as char3d sampleClip) */
export function sampleClip(clip, t, P) {
  P.clear();
  const d = clip.duration || 1;
  t = clip.loop ? ((t % d) + d) % d : Math.max(0, Math.min(d, t));
  if (clip.fn) { clip.fn(t, P, t / d); return P; }
  const TR = clip.tracks;
  for (let i = 0; i < TR.length; i++) {
    const tr = TR[i], n = tr.times.length, k = n > 1 ? seek(tr.times, t) : 0, k1 = Math.min(n - 1, k + 1);
    const u = k1 === k || tr.step ? 0 : Math.max(0, Math.min(1, (t - tr.times[k]) / (tr.times[k1] - tr.times[k] || 1)));
    const r = tr.rot, q = P.q(tr.key), a = k * 4, b = k1 * 4;
    const s = r[a] * r[b] + r[a + 1] * r[b + 1] + r[a + 2] * r[b + 2] + r[a + 3] * r[b + 3] < 0 ? -u : u;
    q[0] = r[a] * (1 - u) + r[b] * s; q[1] = r[a + 1] * (1 - u) + r[b + 1] * s; q[2] = r[a + 2] * (1 - u) + r[b + 2] * s; q[3] = r[a + 3] * (1 - u) + r[b + 3] * s; qnorm(q);
  }
  if (clip.root) {
    const tr = clip.root, n = tr.times.length, k = n > 1 ? seek(tr.times, t) : 0, k1 = Math.min(n - 1, k + 1);
    const u = k1 === k ? 0 : Math.max(0, Math.min(1, (t - tr.times[k]) / (tr.times[k1] - tr.times[k] || 1)));
    for (let c = 0; c < 3; c++) P.root[c] = tr.pos[k * 3 + c] * (1 - u) + tr.pos[k1 * 3 + c] * u;
  }
  return P;
}

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
