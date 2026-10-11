// 퍼펫 메시 변형 (애니풍 시범 — docs/specs/anime_motion_sfx.md §2.1). pilot.anime 이고 애니 퍼펫일 때만 hero_puppet.js 가 부른다.
// 판 두 장(위팔·아래팔, 허벅지·정강이)을 뼈마다 딱딱하게 돌리는 대신, 관절 가까이를 두 뼈 변환의 가중 평균(2본 선형 스키닝)으로 휘게 한다.
//  · 부위를 뼈 방향 띠로 나눈다: 관절에서 먼 쪽은 통째로 한 조각(제 뼈 변환 그대로), 관절 쪽 띠 3~4개는 꼭짓점마다 가중치.
//  · 관절 바로 위(뼈 길이의 t=1)는 두 부위 모두 가중치 0.5 → 위아래 부위가 같은 곡선에서 만나 이음매가 없다.
//  · 각 띠는 삼각형 2개 → 삼각형마다 원화→화면 아핀 + 클립 + drawImage (Canvas 2D 텍스처 삼각형). 클립은 0.3px 부풀려 실금 방지.
// 비용: 가까운 팔·다리만 (먼 쪽은 어둡게 뒤에 있어 예전처럼 딱딱한 판) → 영웅 1명당 클립+drawImage 약 44번 (tools/puppet/anime/hero_cost.mjs).
// 저품질(G.lowq)·실루엣 패스에서는 부르지 않는다(딱딱한 판 그대로).
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** 원화 선분 a→b 를 화면 선분 A→B 로 보내는 아핀 (뼈 방향으로만 늘임 k, 0.82~1.22 — hero_puppet.boneXf 와 같은 식) → out[6] = [a,b,c,d,e,f] */
export function boneAffine(a, b, AX, AY, BX, BY, PS, out) {
  const angS = Math.atan2(b[1] - a[1], b[0] - a[0]), lenS = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const angD = Math.atan2(BY - AY, BX - AX), lenD = Math.hypot(BX - AX, BY - AY);
  const k = clamp(lenD / (lenS * PS), 0.82, 1.22);
  // M = T(A) · R(angD) · S(k·PS, PS) · R(−angS) · T(−a)
  const cd = Math.cos(angD), sd = Math.sin(angD), cs = Math.cos(-angS), ss = Math.sin(-angS);
  const sx = k * PS, sy = PS;
  // R(angD)·S = [[cd·sx, −sd·sy],[sd·sx, cd·sy]]
  const m00 = cd * sx, m01 = -sd * sy, m10 = sd * sx, m11 = cd * sy;
  // ·R(−angS)
  const n00 = m00 * cs + m01 * ss, n01 = -m00 * ss + m01 * cs, n10 = m10 * cs + m11 * ss, n11 = -m10 * ss + m11 * cs;
  out[0] = n00; out[1] = n10; out[2] = n01; out[3] = n11;
  out[4] = AX - (n00 * a[0] + n01 * a[1]); out[5] = AY - (n10 * a[0] + n11 * a[1]);
  return out;
}
const MA = new Float64Array(6), MB = new Float64Array(6);
const ap = (M, x, y, o, i) => { o[i] = M[0] * x + M[2] * y + M[4]; o[i + 1] = M[1] * x + M[3] * y + M[5]; };

// 띠 꼭짓점 버퍼 (원화 좌표 S, 화면 좌표 D): 띠 경계 최대 8개 × 좌우 2점
const S = new Float64Array(32), D = new Float64Array(32), TA = new Float64Array(6);
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
export const meshStats = { tris: 0, parts: 0 };

/**
 * 부위 하나를 두 뼈 스키닝으로 그린다.
 * img/rc/pt: 아틀라스 이미지·사각형([x,y,w,h], 아틀라스 px)·부위 배치(원화 x0,y0,w,h)
 * own: 제 뼈 [원화 a, 원화 b, 화면 AX,AY,BX,BY] / other: 이웃 뼈 (같은 형식)
 * joint: 'end' = 관절이 제 뼈의 끝(위팔·허벅지) / 'start' = 관절이 제 뼈의 시작(아래팔·정강이)
 * PS: 원화 px → 논리 px. extra(c): 같은 변환으로 덧그릴 것(손 등) — 제 뼈 변환으로만 그린다
 */
export function drawSkinned(c, img, rc, pt, own, other, joint, PS) {
  boneAffine(own[0], own[1], own[2], own[3], own[4], own[5], PS, MA);
  boneAffine(other[0], other[1], other[2], other[3], other[4], other[5], PS, MB);
  const a = own[0], b = own[1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux;
  // 부위 사각형의 뼈 축 투영 범위
  let t0 = 1e9, t1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (let k = 0; k < 4; k++) {
    const x = pt.x0 + (k & 1 ? pt.w : 0), y = pt.y0 + (k & 2 ? pt.h : 0);
    const t = ((x - a[0]) * ux + (y - a[1]) * uy) / L, v = (x - a[0]) * nx + (y - a[1]) * ny;
    if (t < t0) t0 = t; if (t > t1) t1 = t; if (v < v0) v0 = v; if (v > v1) v1 = v;
  }
  v0 -= 2; v1 += 2;
  // 띠 경계 (뼈 길이 비율). 관절 쪽에만 촘촘히
  // 관절에서 먼 첫/끝 조각은 가중치 0 → 딱딱한 한 조각 (부위당 클립 11번). 띠를 4개로 줄이면 공중제비처럼 무릎이 깊게
  // 접힐 때 바깥 모서리가 들쭉날쭉해져(review.mjs 관절 틈 2→4칸) 5개를 둔다
  const B = joint === 'end' ? [t0 - 0.02, 0.58, 0.76, 0.9, 1.0, 1.12, t1 + 0.02] : [t0 - 0.02, -0.12, 0.0, 0.1, 0.24, 0.44, t1 + 0.02];
  const rows = [];
  for (const t of B) if (t >= t0 - 0.03 && t <= t1 + 0.03 && (!rows.length || t > rows[rows.length - 1] + 0.01)) rows.push(t);
  if (rows.length < 2) return false;
  // 가중치: 이웃 뼈 쪽 비율 w (관절 t=1 또는 s=0 에서 0.5)
  const wOf = joint === 'end'
    ? (t) => (t <= 1 ? 0.5 * sstep(0.58, 1, t) : 0.5 + 0.5 * sstep(1, 1.28, t))
    : (t) => (t >= 0 ? 0.5 * (1 - sstep(0, 0.44, t)) : 0.5 + 0.5 * sstep(0, -0.28, t));
  const n = rows.length;
  for (let r = 0; r < n; r++) {
    const t = rows[r], w = wOf(t);
    for (let side = 0; side < 2; side++) {
      const v = side ? v1 : v0, x = a[0] + ux * t * L + nx * v, y = a[1] + uy * t * L + ny * v, i = (r * 2 + side) * 2;
      S[i] = x; S[i + 1] = y;
      ap(MA, x, y, D, i); const ax = D[i], ay = D[i + 1];
      ap(MB, x, y, D, i);
      D[i] = ax + (D[i] - ax) * w; D[i + 1] = ay + (D[i + 1] - ay) * w;
    }
  }
  meshStats.parts++;
  for (let r = 0; r < n - 1; r++) {
    const i00 = r * 4, i01 = r * 4 + 2, i10 = r * 4 + 4, i11 = r * 4 + 6;
    // 이 띠의 네 꼭짓점이 모두 가중치 0 이면 제 뼈 변환 하나로 (사각형 한 번)
    const rigid = wOf(rows[r]) < 1e-4 && wOf(rows[r + 1]) < 1e-4;
    if (rigid) {
      c.save();
      I4[0] = i00; I4[1] = i01; I4[2] = i11; I4[3] = i10; clipPoly(c, D, I4);
      c.transform(MA[0], MA[1], MA[2], MA[3], MA[4], MA[5]);
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
/** 엔티티별 1차원 스프링: 목표 x 를 따라가되 넘쳐 흔들림 (k 강성, z 감쇠). dt 초. 반환 = 현재 값 */
export function spring(ent, key, target, dt, k = 120, z = 9) {
  if (!ent || typeof ent !== 'object') return target;
  let m = SPR.get(ent);
  if (!m) SPR.set(ent, (m = {}));
  let s = m[key];
  if (!s) s = m[key] = { x: target, v: 0 };
  const h = clamp(dt || 0, 0, 0.05);
  if (h > 0) { s.v += (k * (target - s.x) - z * s.v) * h; s.x += s.v * h; }
  if (!Number.isFinite(s.x)) { s.x = target; s.v = 0; }
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
