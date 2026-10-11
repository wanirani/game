// 퍼펫 메시 관절 (모든 채색 퍼펫 — heroes.md). hero_puppet.js 가 보통·높음 화질에서 조종 중인 영웅(플레이어)의 가까운 팔·다리에 쓴다.
// 판 두 장(위팔·아래팔, 허벅지·정강이)을 뼈마다 딱딱하게 돌리는 대신, 관절 가까이를 두 뼈 변환 사이로 휘게 한다.
//  · 부위를 뼈 방향 띠로 나눈다: 관절에서 먼 쪽은 통째로 한 조각(제 뼈 변환 그대로), 관절 쪽 띠 4~5개는 꼭짓점마다 가중치.
//  · 띠·가중치는 리그(rig.json)의 관절·부위 크기에서 자동으로 만든다 (meshOverride → 리그마다 한 번, 프레임마다 계산 없음).
//    굽는 구간 폭 = 부위의 관절 쪽 두께 / 뼈 길이 (두꺼운 허벅지는 넓게, 가는 아래팔은 좁게). 리그별 덮어쓰기: rig.opts.mesh 또는 아래 OVR.
//  · 관절 바로 위(뼈 길이의 t=1)는 두 부위 모두 가중치 0.5 → 위아래 부위가 같은 곡선에서 만나 이음매가 없다.
//  · 섞는 법: 위치를 직선으로 섞지(LBS) 않고 관절점을 중심으로 각도·거리를 섞는다 — 공중제비처럼 무릎이 150° 넘게 접혀도
//    안쪽이 한 점으로 꼬집히지(pinch) 않고 바깥은 둥근 무릎이 된다. 회전량은 두 뼈의 상대 각 하나(모든 꼭짓점 같은 방향)라 꼬이지 않는다.
//  · 각 띠는 삼각형 2개 → 삼각형마다 원화→화면 아핀 + 클립 + drawImage (Canvas 2D 텍스처 삼각형). 클립은 0.32px 부풀려 실금 방지.
//  · 관절이 거의 곧으면(상대 각 < 0.1 rad) 딱딱한 판 두 장과 그림이 같으므로 그냥 판으로 (비용 0).
// 저품질(G.lowq)·실루엣 패스·파티 영웅·메뉴에서는 부르지 않는다(딱딱한 판 그대로).
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapPI = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/** 원화 선분 a→b 를 화면 선분 A→B 로 보내는 아핀 (뼈 방향으로만 늘임 k, 0.82~1.22 — hero_puppet.boneXf 와 같은 식) → out[6] = [a,b,c,d,e,f].
 *  반환: 뼈 회전량 (화면 각 − 원화 각) */
export function boneAffine(a, b, AX, AY, BX, BY, PS, out) {
  const angS = Math.atan2(b[1] - a[1], b[0] - a[0]), lenS = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const angD = Math.atan2(BY - AY, BX - AX), lenD = Math.hypot(BX - AX, BY - AY);
  const k = clamp(lenD / (lenS * PS), 0.82, 1.22);
  // M = T(A) · R(angD) · S(k·PS, PS) · R(−angS) · T(−a)
  const cd = Math.cos(angD), sd = Math.sin(angD), cs = Math.cos(-angS), ss = Math.sin(-angS);
  const sx = k * PS, sy = PS;
  const m00 = cd * sx, m01 = -sd * sy, m10 = sd * sx, m11 = cd * sy;
  const n00 = m00 * cs + m01 * ss, n01 = -m00 * ss + m01 * cs, n10 = m10 * cs + m11 * ss, n11 = -m10 * ss + m11 * cs;
  out[0] = n00; out[1] = n10; out[2] = n01; out[3] = n11;
  out[4] = AX - (n00 * a[0] + n01 * a[1]); out[5] = AY - (n10 * a[0] + n11 * a[1]);
  return angD - angS;
}
const MA = new Float64Array(6), MB = new Float64Array(6);

// 띠 꼭짓점 버퍼 (원화 좌표 S, 화면 좌표 D): 띠 경계 최대 16개 × 좌우 2점
const S = new Float64Array(64), D = new Float64Array(64), TA = new Float64Array(6);
/** 원화 삼각형 (s0,s1,s2) → 화면 삼각형 (d0,d1,d2) 아핀 */
function triAffine(s, i0, i1, i2, d, out) {
  const x0 = s[i0], y0 = s[i0 + 1], x1 = s[i1], y1 = s[i1 + 1], x2 = s[i2], y2 = s[i2 + 1];
  const u0 = d[i0], v0 = d[i0 + 1], u1 = d[i1], v1 = d[i1 + 1], u2 = d[i2], v2 = d[i2 + 1];
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < 1e-9) return false;
  const a = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / det;
  const c = ((u2 - u0) * (x1 - x0) - (u1 - u0) * (x2 - x0)) / det;
  const b = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det;
  const dd = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det;
  out[0] = a; out[1] = b; out[2] = c; out[3] = dd; out[4] = u0 - a * x0 - c * y0; out[5] = v0 - b * x0 - dd * y0;
  return true;
}
const EXP = 0.32;   // 클립 부풀림 (논리 px)
function clipPoly(c, d, idx) {
  let cx = 0, cy = 0;
  for (const i of idx) { cx += d[i]; cy += d[i + 1]; }
  cx /= idx.length; cy /= idx.length;
  c.beginPath();
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k], dx = d[i] - cx, dy = d[i + 1] - cy, L = Math.hypot(dx, dy) || 1;
    const x = d[i] + (dx / L) * EXP, y = d[i + 1] + (dy / L) * EXP;
    if (k) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.closePath();
  c.clip();
}
const I3 = [0, 0, 0], I4 = [0, 0, 0, 0];
// 이번 그리기의 띠 경계·가중치 (관절 각에 맞춰 나눔 — 깊게 접힐수록 촘촘히: 띠 하나가 0.24 rad 넘게 돌지 않게, 한쪽 1~6개)
const ROWS = new Float64Array(16), WTS = new Float64Array(16);
function planRows(P, dth) {
  const { t0, t1, h, hb } = P, m = clamp(Math.ceil((Math.abs(dth) * 0.5) / 0.24), 1, 6);
  let n = 0;
  const push = (t, w) => { if (t < t0 - 0.03 || t > t1 + 0.03) return; if (n && t <= ROWS[n - 1] + 0.004) return; ROWS[n] = t; WTS[n] = w; n++; };
  if (P.joint === 'end') {
    push(t0 - 0.02, 0);
    for (let i = 0; i <= m; i++) { const t = 1 - h + (h * i) / m; push(t, 0.5 * sstep(1 - h, 1, t)); }
    for (let i = 1; i <= m; i++) { const t = 1 + (hb * i) / m; push(t, 0.5 + 0.5 * sstep(1, 1 + hb, t)); }
    if (t1 + 0.02 > 1 + hb + 0.01) push(t1 + 0.02, 1);
  } else {
    if (t0 - 0.02 < -hb - 0.01) push(t0 - 0.02, 1);
    for (let i = m; i >= 1; i--) { const t = -(hb * i) / m; push(t, 0.5 + 0.5 * sstep(0, -hb, t)); }
    for (let i = 0; i <= m; i++) { const t = (h * i) / m; push(t, 0.5 * (1 - sstep(0, h, t))); }
    push(t1 + 0.02, 0);
  }
  return n;
}
export const meshStats = { tris: 0, parts: 0, rigid: 0 };

// ───────────────────────── 리그별 메시 설정 (자동 + 덮어쓰기) ─────────────────────────
// 리그별 덮어쓰기 (키 = 'cid/cls'): { thigh: {h}, shin: {h}, uarm: {h}, farm: {h}, off: true(메시 끔) }. 비어 있으면 모두 자동.
const OVR = {};
// 부위 → [제 뼈 시작 관절, 끝 관절, 이웃 부위와 맞닿는 쪽]
const LIMB = { thigh: ['hip', 'knee', 'end'], shin: ['knee', 'ankle', 'start'], uarm: ['shoulder', 'elbow', 'end'], farm: ['elbow', 'hand', 'start'] };
/** 부위 하나의 띠 배치: 뼈 축 투영 범위(t0..t1, 뼈 길이 비율)·폭(v0..v1, 원화 px)·굽는 구간 h·띠 경계·가중치 */
function partPlan(rig, name, ovr) {
  const pt = rig.parts?.[name], J = rig.joints, L = LIMB[name];
  if (!pt || !J || !L || !J[L[0]] || !J[L[1]]) return null;
  const a = J[L[0]], b = J[L[1]], joint = L[2];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = -uy, ny = ux;
  let t0 = 1e9, t1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (let k = 0; k < 4; k++) {
    const x = pt.x0 + (k & 1 ? pt.w : 0), y = pt.y0 + (k & 2 ? pt.h : 0);
    const t = ((x - a[0]) * ux + (y - a[1]) * uy) / len, v = (x - a[0]) * nx + (y - a[1]) * ny;
    if (t < t0) t0 = t; if (t > t1) t1 = t; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  v0 -= 2; v1 += 2;
  // 굽는 구간 폭(뼈 길이 비율): 관절 쪽 두께(사각형 폭의 0.62 — 사각형은 비스듬한 부위를 넉넉히 감싸므로) / 뼈 길이 × 0.5, 0.15~0.26.
  // 넓으면 허벅지·정강이 전체가 바나나처럼 휘고 무릎이 풍선처럼 부푼다 → 관절 가까이만 휘고 나머지는 곧게
  const thick = (v1 - v0) * 0.62;
  const h = clamp(ovr?.h ?? (thick / len) * 0.5, 0.15, 0.26);
  if (t1 - t0 < 0.05) return null;
  return { joint, t0, t1, v0, v1, ux, uy, nx, ny, len, a, h, hb: h * 0.6 };
}
/** 리그 하나의 메시 설정 (entry 가 리그를 받을 때 한 번). null = 메시 없음 */
export function meshOverride(key, rig) {
  const o = { ...(OVR[key] || {}), ...(rig?.opts?.mesh || {}) };
  if (o.off || !rig?.parts || !rig?.joints) return null;
  const M = {};
  for (const name in LIMB) { const P = partPlan(rig, name, o[name]); if (P) M[name] = P; }
  return M;
}

/**
 * 부위 하나를 두 뼈 사이로 휘게 그린다.
 * img/rc/pt: 아틀라스 이미지·사각형([x,y,w,h], 아틀라스 px)·부위 배치(원화 x0,y0,w,h)
 * plan: meshOverride 의 그 부위 설정 / own: 제 뼈 [원화 a, 원화 b, 화면 AX,AY,BX,BY] / other: 이웃 뼈 (같은 형식)
 * PS: 원화 px → 논리 px. 반환: false = 메시로 그리지 않음 (호출측이 딱딱한 판으로 그린다)
 */
export function drawSkinned(c, img, rc, pt, plan, own, other, PS) {
  if (!plan) return false;
  const rA = boneAffine(own[0], own[1], own[2], own[3], own[4], own[5], PS, MA);
  const rB = boneAffine(other[0], other[1], other[2], other[3], other[4], other[5], PS, MB);
  const dth = wrapPI(rB - rA);                       // 이웃 뼈의 상대 회전 (모든 꼭짓점 공통)
  if (Math.abs(dth) < 0.1) { meshStats.rigid++; return false; }
  const { v0, v1, ux, uy, nx, ny, len, a } = plan;
  const n = planRows(plan, dth);
  if (n < 2) return false;
  const rows = ROWS, W = WTS;
  // 관절의 화면 위치: 'end' = 제 뼈 끝, 'start' = 제 뼈 시작
  const end = plan.joint === 'end';
  const jx = end ? own[4] : own[2], jy = end ? own[5] : own[3];
  for (let r = 0; r < n; r++) {
    const t = rows[r], w = W[r];
    const cw = Math.cos(dth * w), sw = Math.sin(dth * w);
    for (let side = 0; side < 2; side++) {
      const v = side ? v1 : v0, x = a[0] + ux * t * len + nx * v, y = a[1] + uy * t * len + ny * v, i = (r * 2 + side) * 2;
      S[i] = x; S[i + 1] = y;
      // 제 뼈로 옮긴 점 pA, 이웃 뼈로 옮긴 점 pB (관절 기준 벡터)
      const ax = MA[0] * x + MA[2] * y + MA[4] - jx, ay = MA[1] * x + MA[3] * y + MA[5] - jy;
      if (w < 1e-4) { D[i] = jx + ax; D[i + 1] = jy + ay; continue; }
      const bx = MB[0] * x + MB[2] * y + MB[4] - jx, by = MB[1] * x + MB[3] * y + MB[5] - jy;
      if (w > 0.9999) { D[i] = jx + bx; D[i + 1] = jy + by; continue; }
      // 각도·거리 섞기: pA 를 관절 둘레로 w·dth 만큼 돌리고 길이는 |pA|→|pB| 사이 (늘임 k 차이만큼)
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by), k = la > 1e-6 ? (la + (lb - la) * w) / la : 1;
      D[i] = jx + (ax * cw - ay * sw) * k; D[i + 1] = jy + (ax * sw + ay * cw) * k;
    }
  }
  meshStats.parts++;
  for (let r = 0; r < n - 1; r++) {
    const i00 = r * 4, i01 = r * 4 + 2, i10 = r * 4 + 4, i11 = r * 4 + 6;
    // 이 띠의 네 꼭짓점이 모두 가중치 0(제 뼈) 또는 1(이웃 뼈)이면 그 뼈 변환 하나로 (사각형 한 번)
    const r0 = W[r] < 1e-4 && W[r + 1] < 1e-4, r1 = W[r] > 0.9999 && W[r + 1] > 0.9999;
    if (r0 || r1) {
      const M = r0 ? MA : MB;
      c.save();
      I4[0] = i00; I4[1] = i01; I4[2] = i11; I4[3] = i10; clipPoly(c, D, I4);
      c.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
      c.drawImage(img, rc[0], rc[1], rc[2], rc[3], pt.x0, pt.y0, pt.w, pt.h);
      c.restore(); meshStats.tris++;
      continue;
    }
    for (let k = 0; k < 2; k++) {
      if (k) { I3[0] = i01; I3[1] = i11; I3[2] = i10; } else { I3[0] = i00; I3[1] = i01; I3[2] = i10; }
      if (!triAffine(S, I3[0], I3[1], I3[2], D, TA)) continue;
      c.save();
      clipPoly(c, D, I3);
      c.transform(TA[0], TA[1], TA[2], TA[3], TA[4], TA[5]);
      c.drawImage(img, rc[0], rc[1], rc[2], rc[3], pt.x0, pt.y0, pt.w, pt.h);
      c.restore(); meshStats.tris++;
    }
  }
  return true;
}

// ───────────────────────── 보조 움직임 (스프링) ─────────────────────────
const SPR = new WeakMap();
/**
 * 엔티티별 1차원 스프링: 목표 x 를 따라가되 넘쳐 흔들림 (k 강성, z 감쇠). dt 초 (0 = 멈춤·히트스톱·같은 프레임 두 번째 그리기 → 그대로).
 * lo/hi: 값 범위 (넘으면 그 끝에 붙이고 속도를 버림 — 순간이동·방향 전환·공중제비에서도 터지지 않게). 반환 = 현재 값
 */
export function spring(ent, key, target, dt, k = 120, z = 9, lo = -1e9, hi = 1e9) {
  if (!ent || typeof ent !== 'object') return target;
  let m = SPR.get(ent);
  if (!m) SPR.set(ent, (m = {}));
  let s = m[key];
  if (!s) s = m[key] = { x: target, v: 0 };
  const h = clamp(dt || 0, 0, 0.034);
  if (h > 0) { s.v += (k * (target - s.x) - z * s.v) * h; s.x += s.v * h; }
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) { s.x = target; s.v = 0; }
  if (s.x < lo) { s.x = lo; s.v = 0; } else if (s.x > hi) { s.x = hi; s.v = 0; }
  return s.x;
}
/** 엔티티별 임의 상태 묶음 (스미어·착지 등) */
const ST = new WeakMap();
export function stateOf(ent) {
  if (!ent || typeof ent !== 'object') return null;
  let s = ST.get(ent);
  if (!s) ST.set(ent, (s = {}));
  return s;
}
