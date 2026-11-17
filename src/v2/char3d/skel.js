// v2 char3d — 뼈대 · 자세 · 클립 · 섞기. 라이브러리 없음. docs/v2/CHAR3D_PILOT.md §4
//
// 핵심 생각: 클립을 "뼈 이름 → 쉬는 자세에서 얼마나 돌았나(캐릭터 공간의 회전 차이)" 로 들고 있는다 (정규 클립).
//   D_b(t) = P_b · L_b(t) · L_b(rest)⁻¹ · P_b⁻¹      (P_b = 부모 뼈의 쉬는 자세 세계 회전)
//   되돌릴 때: L_b = P_b⁻¹ · D_b · P_b · L_b(rest)
// 이렇게 하면 (1) 같은 서비스로 리깅한 다른 캐릭터에도 같은 클립을 그대로 틀 수 있고(뼈의 로컬 축이 달라도 됨),
//   (2) 손으로 쓰는 절차 클립도 "캐릭터의 왼쪽(X)·위(Y)·앞(Z) 축으로 몇 도" 로 쓸 수 있다.
// 축: glTF 기본(오른손) — 캐릭터가 +Z 를 보고 서 있고 +Y 가 위, +X 가 캐릭터의 왼쪽.

// ───────────────────────── 쿼터니언 (x,y,z,w) ─────────────────────────
export const qmul = (a, b, o = [0, 0, 0, 1]) => {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by; o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw; o[3] = aw * bw - ax * bx - ay * by - az * bz; return o;
};
export const qconj = (a, o = [0, 0, 0, 1]) => { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; o[3] = a[3]; return o; };
export const qnorm = (a) => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; a[3] /= l; return a; };
/** 캐릭터 축 오일러(라디안) → 쿼터니언. 적용 순서: Z(앞 축, 옆으로 기울기) → X(왼 축, 앞뒤로 숙이기) → Y(위 축, 비틀기) */
export function qeuler(x, y, z, o = [0, 0, 0, 1]) {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  // q = qy * qx * qz
  const ax = sx * cz, ay = -sx * sz, az = cx * sz, aw = cx * cz;   // qx*qz
  o[0] = cy * ax + sy * az; o[1] = cy * ay + sy * aw; o[2] = cy * az - sy * ax; o[3] = cy * aw - sy * ay; return o;
}
const qrot = (q, v, o = [0, 0, 0]) => {
  const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  o[0] = x + qw * tx + qy * tz - qz * ty; o[1] = y + qw * ty + qz * tx - qx * tz; o[2] = z + qw * tz + qx * ty - qy * tx; return o;
};

// ───────────────────────── 뼈 이름 → 정규 이름 ─────────────────────────
/** 'mixamorig:LeftForeArm' · 'L_Forearm' · 'LeftForeArm' … → 'forearmL'. 모르는 이름은 소문자 그대로 */
export function boneKey(name) {
  const n = String(name).replace(/^.*[:|]/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const side = /left|^l(?=[a-z])|l$/.test(n) && !/^(leg|lower)/.test(n) ? (/left/.test(n) ? 'L' : '') : '';
  const S = /left/.test(n) ? 'L' : /right/.test(n) ? 'R' : side;
  const b = n.replace(/left|right/g, '');
  if (/end$|front$|top$/.test(b)) return n;
  if (/hips|pelvis/.test(b)) return 'hips';
  if (/spine/.test(b)) { const k = b.match(/(\d+)$/); const i = k ? Number(k[1]) : 0; return i <= 0 ? 'spine' : i === 1 ? 'spine1' : 'spine2'; }
  if (/chest/.test(b)) return 'spine2';
  if (/neck/.test(b)) return 'neck';
  if (/^head/.test(b)) return 'head';
  if (!S) return n;
  if (/shoulder|clavicle/.test(b)) return 'shoulder' + S;
  if (/forearm|lowerarm/.test(b)) return 'forearm' + S;
  if (/hand/.test(b)) return /thumb|index|middle|ring|pinky|finger/.test(b) ? n : 'hand' + S;
  if (/arm/.test(b)) return 'arm' + S;
  if (/upleg|thigh|upperleg/.test(b)) return 'upleg' + S;
  if (/toe/.test(b)) return 'toe' + S;
  if (/foot/.test(b)) return 'foot' + S;
  if (/leg|calf|shin/.test(b)) return 'leg' + S;
  return n;
}

// ───────────────────────── 뼈대 ─────────────────────────
export class Rig {
  constructor(model) {
    const N = model.nodes.length;
    this.model = model; this.n = N; this.order = model.order;
    this.parent = model.nodes.map((n) => n.parent);
    this.restT = new Float32Array(N * 3); this.restR = new Float32Array(N * 4); this.restS = new Float32Array(N * 3);
    model.nodes.forEach((n, i) => { this.restT.set(n.t, i * 3); this.restR.set(n.r, i * 4); this.restS.set(n.s, i * 3); });
    this.T = new Float32Array(this.restT); this.R = new Float32Array(this.restR);
    this.world = new Float32Array(N * 16);
    this.restWR = new Float32Array(N * 4);     // 쉬는 자세 세계 회전
    this.parWR = new Float32Array(N * 4);      // 부모의 쉬는 자세 세계 회전 (P_b)
    this.restWS = new Float32Array(N);         // 부모까지의 세계 크기 (균등하다고 본다)
    const q = [0, 0, 0, 1];
    for (const i of this.order) {
      const p = this.parent[i];
      const pw = p >= 0 ? this.restWR.subarray(p * 4, p * 4 + 4) : [0, 0, 0, 1];
      this.parWR.set(pw, i * 4);
      qmul(pw, this.restR.subarray(i * 4, i * 4 + 4), q); this.restWR.set(qnorm(q), i * 4);
      this.restWS[i] = (p >= 0 ? this.restWS[p] * this.restS[p * 3] : 1);
    }
    // 정규 이름 → 노드 번호 (스킨에 든 뼈만)
    this.key = new Map(); this.keyOf = new Array(N).fill(null);
    const joints = model.skin ? model.skin.joints : [];
    for (const j of joints) { const k = boneKey(model.nodes[j].name); if (!this.key.has(k)) { this.key.set(k, j); this.keyOf[j] = k; } }
    {   // 척추는 이름의 번호가 서비스마다 거꾸로일 수 있다 (Meshy: Hips → Spine02 → Spine01 → Spine) → 골반에서 가까운 순서로 spine · spine1 · spine2(가슴)
      const chain = []; let cur = this.key.get('hips');
      while (cur != null) { const nx = model.nodes[cur].children.find((c) => /^spine/.test(this.keyOf[c] ?? '')); if (nx == null) break; chain.push(nx); cur = nx; }
      if (chain.length) {
        for (const k of ['spine', 'spine1', 'spine2']) this.key.delete(k);
        const names = chain.length === 1 ? ['spine'] : chain.length === 2 ? ['spine', 'spine2'] : ['spine', 'spine1', 'spine2'];
        chain.slice(0, 3).forEach((j, i) => { this.key.set(names[i], j); this.keyOf[j] = names[i]; });
        for (const j of chain.slice(3)) this.keyOf[j] = null;
      }
    }
    this.nj = joints.length || 1;
    this.jm = new Float32Array(this.nj * 12);  // 뼈 행렬 (3×4 행 우선) — 셰이더 uniform
    this.jw = new Float32Array(this.nj * 16);  // 뼈 세계 행렬 (모델 공간) — 무기 붙이기용
    this.pose(); this.restHipY = this.key.has('hips') ? this.world[this.key.get('hips') * 16 + 13] : 1;
    // 쉬는 자세의 키 (머리 끝 ~ 발)
    let lo = 1e9, hi = -1e9;
    for (const p of model.prims) for (let i = 1; i < p.pos.length; i += 3) { if (p.pos[i] < lo) lo = p.pos[i]; if (p.pos[i] > hi) hi = p.pos[i]; }
    this.minY = lo; this.maxY = hi;
  }
  /** 지금의 T·R(로컬) → 세계 행렬 → 뼈 행렬 */
  pose() {
    const W = this.world, T = this.T, R = this.R, S = this.restS;
    for (const i of this.order) {
      const o = i * 16, x = R[i * 4], y = R[i * 4 + 1], z = R[i * 4 + 2], w = R[i * 4 + 3], sx = S[i * 3], sy = S[i * 3 + 1], sz = S[i * 3 + 2];
      const m0 = (1 - 2 * (y * y + z * z)) * sx, m1 = 2 * (x * y + z * w) * sx, m2 = 2 * (x * z - y * w) * sx;
      const m4 = 2 * (x * y - z * w) * sy, m5 = (1 - 2 * (x * x + z * z)) * sy, m6 = 2 * (y * z + x * w) * sy;
      const m8 = 2 * (x * z + y * w) * sz, m9 = 2 * (y * z - x * w) * sz, m10 = (1 - 2 * (x * x + y * y)) * sz;
      const tx = T[i * 3], ty = T[i * 3 + 1], tz = T[i * 3 + 2], p = this.parent[i];
      if (p < 0) { W[o] = m0; W[o + 1] = m1; W[o + 2] = m2; W[o + 3] = 0; W[o + 4] = m4; W[o + 5] = m5; W[o + 6] = m6; W[o + 7] = 0; W[o + 8] = m8; W[o + 9] = m9; W[o + 10] = m10; W[o + 11] = 0; W[o + 12] = tx; W[o + 13] = ty; W[o + 14] = tz; W[o + 15] = 1; continue; }
      const q = p * 16, a0 = W[q], a1 = W[q + 1], a2 = W[q + 2], a4 = W[q + 4], a5 = W[q + 5], a6 = W[q + 6], a8 = W[q + 8], a9 = W[q + 9], a10 = W[q + 10];
      W[o] = a0 * m0 + a4 * m1 + a8 * m2; W[o + 1] = a1 * m0 + a5 * m1 + a9 * m2; W[o + 2] = a2 * m0 + a6 * m1 + a10 * m2; W[o + 3] = 0;
      W[o + 4] = a0 * m4 + a4 * m5 + a8 * m6; W[o + 5] = a1 * m4 + a5 * m5 + a9 * m6; W[o + 6] = a2 * m4 + a6 * m5 + a10 * m6; W[o + 7] = 0;
      W[o + 8] = a0 * m8 + a4 * m9 + a8 * m10; W[o + 9] = a1 * m8 + a5 * m9 + a9 * m10; W[o + 10] = a2 * m8 + a6 * m9 + a10 * m10; W[o + 11] = 0;
      W[o + 12] = a0 * tx + a4 * ty + a8 * tz + W[q + 12]; W[o + 13] = a1 * tx + a5 * ty + a9 * tz + W[q + 13]; W[o + 14] = a2 * tx + a6 * ty + a10 * tz + W[q + 14]; W[o + 15] = 1;
    }
    const sk = this.model.skin, jm = this.jm, jw = this.jw;
    if (!sk) { jm.fill(0); jm[0] = jm[5] = jm[10] = 1; return; }
    for (let k = 0; k < sk.joints.length; k++) {
      const a = sk.joints[k] * 16, b = k * 16, I = sk.ibm, o = k * 12;
      for (let c = 0; c < 4; c++) {     // jointWorld × inverseBind 의 c 열
        const i0 = I[b + c * 4], i1 = I[b + c * 4 + 1], i2 = I[b + c * 4 + 2], i3 = I[b + c * 4 + 3];
        jm[o + c] = W[a] * i0 + W[a + 4] * i1 + W[a + 8] * i2 + W[a + 12] * i3;
        jm[o + 4 + c] = W[a + 1] * i0 + W[a + 5] * i1 + W[a + 9] * i2 + W[a + 13] * i3;
        jm[o + 8 + c] = W[a + 2] * i0 + W[a + 6] * i1 + W[a + 10] * i2 + W[a + 14] * i3;
      }
      for (let c = 0; c < 16; c++) jw[b + c] = W[a + c];
    }
  }
  /** 뼈(정규 이름)의 세계 행렬 16칸 (모델 공간). 없으면 null */
  boneWorld(key) { const j = this.key.get(key); return j == null ? null : this.world.subarray(j * 16, j * 16 + 16); }
}

// ───────────────────────── 정규 자세 · 클립 ─────────────────────────
/** 정규 자세: 뼈 이름별 회전 차이 + 골반 위치 차이(골반 높이를 1 로 본 비율) */
export class CPose {
  constructor() { this.rot = new Map(); this.root = [0, 0, 0]; }
  clear() { for (const q of this.rot.values()) { q[0] = q[1] = q[2] = 0; q[3] = 1; q.set = false; } this.root[0] = this.root[1] = this.root[2] = 0; return this; }
  q(key) { let q = this.rot.get(key); if (!q) { q = [0, 0, 0, 1]; this.rot.set(key, q); } q.set = true; return q; }
  /** 캐릭터 축 오일러(도)로 뼈를 돌린다: x = 앞으로 숙임(+)/젖힘, y = 왼쪽으로 비틂(+), z = 캐릭터 왼쪽으로 기울임… (부호는 뷰어에서 확인한 값) */
  e(key, x = 0, y = 0, z = 0) { qeuler(x * 0.017453, y * 0.017453, z * 0.017453, this.q(key)); return this; }
}

/** glTF 애니메이션(로컬 회전 키) → 정규 클립. opts: {loop, inPlace(수평 이동 제거), name} */
export function clipFromAnim(rig, anim, opts = {}) {
  const tracks = []; let root = null;
  const q = [0, 0, 0, 1], a = [0, 0, 0, 1], b = [0, 0, 0, 1], v = [0, 0, 0];
  let t0 = Infinity, t1 = 0;
  for (const c of anim.channels) if (c.times.length) { t0 = Math.min(t0, c.times[0]); t1 = Math.max(t1, c.times[c.times.length - 1]); }
  if (!Number.isFinite(t0)) t0 = 0;
  for (const c0 of anim.channels) {
    const key = rig.keyOf[c0.node]; if (!key) continue;
    const c = { ...c0, times: c0.times.map((t) => t - t0) };   // 첫 키를 0초로
    const i = c.node, P = rig.parWR.subarray(i * 4, i * 4 + 4), Lr = rig.restR.subarray(i * 4, i * 4 + 4);
    if (c.path === 'rotation') {
      const out = new Float32Array(c.values.length); let moved = false;
      for (let k = 0; k < c.times.length; k++) {
        qmul(c.values.subarray(k * 4, k * 4 + 4), qconj(Lr, a), q); qmul(P, q, b); qmul(b, qconj(P, a), q); qnorm(q);
        if (k && out[(k - 1) * 4] * q[0] + out[(k - 1) * 4 + 1] * q[1] + out[(k - 1) * 4 + 2] * q[2] + out[(k - 1) * 4 + 3] * q[3] < 0) { q[0] = -q[0]; q[1] = -q[1]; q[2] = -q[2]; q[3] = -q[3]; }
        out.set(q, k * 4); if (Math.abs(q[3]) < 0.99999) moved = true;
      }
      if (moved) tracks.push({ key, times: c.times, rot: out, step: c.step });
    } else if (c.path === 'translation' && key === 'hips') {
      const out = new Float32Array(c.values.length), s = rig.restWS[i] / (rig.restHipY || 1);
      for (let k = 0; k < c.times.length; k++) {
        v[0] = c.values[k * 3] - rig.restT[i * 3]; v[1] = c.values[k * 3 + 1] - rig.restT[i * 3 + 1]; v[2] = c.values[k * 3 + 2] - rig.restT[i * 3 + 2];
        qrot(P, v, v); out[k * 3] = v[0] * s; out[k * 3 + 1] = v[1] * s; out[k * 3 + 2] = v[2] * s;
      }
      const n = c.times.length;
      if (opts.inPlace && n > 1) {   // 수평 이동(직선 성분)을 뺀다: 제자리 달리기
        const x0 = out[0], z0 = out[2], x1 = out[(n - 1) * 3], z1 = out[(n - 1) * 3 + 2], T = c.times[n - 1] - c.times[0] || 1;
        let mx = 0, mz = 0;
        for (let k = 0; k < n; k++) { const u = (c.times[k] - c.times[0]) / T; out[k * 3] -= x0 + (x1 - x0) * u; out[k * 3 + 2] -= z0 + (z1 - z0) * u; mx += out[k * 3]; mz += out[k * 3 + 2]; }
        for (let k = 0; k < n; k++) { out[k * 3] -= mx / n; out[k * 3 + 2] -= mz / n; }
      }
      if (opts.rootRel && n > 0) { const x0 = out[0], z0 = out[2]; for (let k = 0; k < n; k++) { out[k * 3] -= x0; out[k * 3 + 2] -= z0; } }   // 첫 키의 수평 위치를 원점으로
      root = { times: c.times, pos: out, travel: n > 1 ? [c.values[(n - 1) * 3] - c.values[0], c.values[(n - 1) * 3 + 2] - c.values[2]] : [0, 0] };
    }
  }
  return { name: opts.name ?? anim.name, duration: Math.max(0.001, t1 - t0), loop: opts.loop ?? true, tracks, root, source: 'library' };
}

function seek(times, t) { let lo = 0, hi = times.length - 1; if (t <= times[0]) return 0; if (t >= times[hi]) return hi - 1 < 0 ? 0 : hi - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; } return lo; }

/** 클립의 t 초 자세를 정규 자세 P 에 쓴다 */
export function sampleClip(clip, t, P) {
  P.clear();
  const d = clip.duration || 1;
  t = clip.loop ? ((t % d) + d) % d : Math.max(0, Math.min(d, t));
  if (clip.fn) { clip.fn(t, P, t / d); return P; }
  for (const tr of clip.tracks) {
    const n = tr.times.length, k = n > 1 ? seek(tr.times, t) : 0, k1 = Math.min(n - 1, k + 1);
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

/** 정규 자세 둘을 섞어 뼈대에 적용 (w = B 의 비율). B 가 없으면 A 만 */
export function applyPose(rig, A, B = null, w = 0) {
  const R = rig.R, T = rig.T, q = [0, 0, 0, 1], a = [0, 0, 0, 1], b = [0, 0, 0, 1], ID = [0, 0, 0, 1];
  R.set(rig.restR); T.set(rig.restT);
  for (const [key, j] of rig.key) {
    const qa = A.rot.get(key), qb = B ? B.rot.get(key) : null;
    const ha = qa && qa.set, hb = qb && qb.set;
    if (!ha && !hb) continue;
    let d = ha ? qa : ID;
    if (B) {
      const e = hb ? qb : ID, s = d[0] * e[0] + d[1] * e[1] + d[2] * e[2] + d[3] * e[3] < 0 ? -w : w;
      q[0] = d[0] * (1 - w) + e[0] * s; q[1] = d[1] * (1 - w) + e[1] * s; q[2] = d[2] * (1 - w) + e[2] * s; q[3] = d[3] * (1 - w) + e[3] * s; d = qnorm(q);
    }
    const P = rig.parWR.subarray(j * 4, j * 4 + 4);
    qmul(qconj(P, a), d, b); qmul(b, P, a); qmul(a, rig.restR.subarray(j * 4, j * 4 + 4), b); qnorm(b);
    R.set(b, j * 4);
  }
  const h = rig.key.get('hips');
  if (h != null) {
    const rx = B ? A.root[0] * (1 - w) + B.root[0] * w : A.root[0], ry = B ? A.root[1] * (1 - w) + B.root[1] * w : A.root[1], rz = B ? A.root[2] * (1 - w) + B.root[2] * w : A.root[2];
    const k = rig.restHipY / (rig.restWS[h] || 1), v = qrot(qconj(rig.parWR.subarray(h * 4, h * 4 + 4), a), [rx * k, ry * k, rz * k]);
    T[h * 3] += v[0]; T[h * 3 + 1] += v[1]; T[h * 3 + 2] += v[2];
  }
  rig.pose();
}

/** 정규 자세 둘을 섞어 정규 자세로 (w = B 의 비율). applyPose 와 같은 규칙: 한쪽에만 있는 뼈는 "안 돌림"과 섞는다 */
export function mixPose(A, B, w, out) {
  out.clear();
  const ID = [0, 0, 0, 1];
  for (const P of [A, B]) for (const key of P.rot.keys()) {
    const qa = A.rot.get(key), qb = B.rot.get(key), ha = qa && qa.set, hb = qb && qb.set;
    if ((!ha && !hb) || (out.rot.get(key) && out.rot.get(key).set)) continue;
    const d = ha ? qa : ID, e = hb ? qb : ID, s = d[0] * e[0] + d[1] * e[1] + d[2] * e[2] + d[3] * e[3] < 0 ? -w : w, o = out.q(key);
    o[0] = d[0] * (1 - w) + e[0] * s; o[1] = d[1] * (1 - w) + e[1] * s; o[2] = d[2] * (1 - w) + e[2] * s; o[3] = d[3] * (1 - w) + e[3] * s; qnorm(o);
  }
  for (let c = 0; c < 3; c++) out.root[c] = A.root[c] * (1 - w) + B.root[c] * w;
  return out;
}

/**
 * 클립 재생기: 지금 클립 + 직전 클립을 짧게 섞는다 (cross-fade).
 * 섞는 도중에 클립이 또 바뀌면 그 순간 보이던(섞인) 자세를 굳혀 거기서부터 섞는다 — 직전 클립의 순수 자세로 튀지 않게 (pilotreview 검수에서 고침:
 * 달리다 멈추자마자 다시 달리거나, 맞은 뒤 밀리다 서면 머리가 한 틱에 0.4 m 튀었다).
 */
export class Animator {
  constructor(rig, clips) { this.rig = rig; this.clips = clips; this.cur = null; this.t = 0; this.prev = null; this.pt = 0; this.fade = 0; this.fadeT = 0; this.A = new CPose(); this.B = new CPose(); this.S = new CPose(); this.S2 = new CPose(); this.snap = false; this.w = 1; this.speed = 1; }
  /** name 클립으로 바꾼다. opts: {fade(초), restart, time(밖에서 정한 시각 — 주면 스스로 흐르지 않는다), speed} */
  play(name, opts = {}) {
    const c = this.clips[name]; if (!c) return false;
    if (c !== this.cur || opts.restart) {
      const fade = opts.fade ?? 0.12;
      if (this.cur && fade > 0) {
        if (this.prev || this.snap) { mixPose(this.snap ? this.S : this.B, this.A, this.w, this.S2); const t = this.S; this.S = this.S2; this.S2 = t; this.snap = true; this.prev = null; }
        else { this.prev = this.cur; this.pt = this.t; }
        this.fade = fade; this.fadeT = 0;
      } else { this.prev = null; this.snap = false; }
      this.cur = c; this.t = 0;
    }
    this.speed = opts.speed ?? 1; this.ext = opts.time != null;
    if (this.ext) this.t = opts.time;
    return true;
  }
  update(dt) {
    if (!this.cur) return;
    if (!this.ext) this.t += dt * this.speed;
    if (this.prev || this.snap) { this.fadeT += dt; if (this.fadeT >= this.fade) { this.prev = null; this.snap = false; } }
    sampleClip(this.cur, this.t, this.A);
    if (this.prev || this.snap) {
      if (this.prev) sampleClip(this.prev, this.pt, this.B);
      const u = this.fadeT / this.fade; this.w = u * u * (3 - 2 * u);
      applyPose(this.rig, this.snap ? this.S : this.B, this.A, this.w);
    } else { this.w = 1; applyPose(this.rig, this.A); }
  }
}
