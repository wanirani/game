// 흑묘 여관 미니게임 절차적 아트
//  - 3D 해골 주사위 (쿼터니언 회전 + 정사영, 면마다 아핀 변환으로 눈금을 그림)
//  - 고딕 트럼프 카드 (해골♠ 피♥ 박쥐♣ 십자♦, J 사냥꾼 / Q 흡혈 여왕 / K 해골 왕) + 카드 뒷면
//  - 블러드 슬롯 문양 7종 (스프라이트 캐시, 모션 블러 판 포함)
//  - 금화, 카지노 칩, 리볼버, 여관 게임 문장(엠블럼)
import { TAU, clamp, shade } from '../../core/math.js';
import { FONT } from '../../core/ui.js';

// ───────────────────────── 공통 도우미 ─────────────────────────
export function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
/**
 * 부드러운 가산 광원. 색마다 한 번 구운 방사 그라데이션 스프라이트(64 px)를 늘려 그린다
 * — 결투 먼지·촛불·카드 빛처럼 한 프레임에 수십 번 불려도 그라데이션을 새로 만들지 않는다 (MASTER_PLAN §5.2).
 */
const GLOW_PX = 64, GLOW_MAX = 48;
const GLOW_CACHE = new Map();
function glowSprite(col) {
  let s = GLOW_CACHE.get(col);
  if (s !== undefined) return s;
  s = null;
  try {
    const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(GLOW_PX, GLOW_PX) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: GLOW_PX, height: GLOW_PX }) : null;
    const x = cv?.getContext('2d');
    if (x) {
      const h = GLOW_PX / 2, g = x.createRadialGradient(h, h, 0, h, h, h);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, GLOW_PX, GLOW_PX);
      s = cv;
    }
  } catch { s = null; }
  if (GLOW_CACHE.size >= GLOW_MAX) GLOW_CACHE.delete(GLOW_CACHE.keys().next().value);
  GLOW_CACHE.set(col, s);
  return s;
}
export function glow(c, x, y, r, col, a = 1) {
  if (a <= 0.003 || r <= 0) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha *= clamp(a, 0, 1);
  const spr = glowSprite(col);
  if (spr) { c.imageSmoothingEnabled = true; c.drawImage(spr, x - r, y - r, r * 2, r * 2); }
  else {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  c.restore();
}
/** 좌우 대칭 경로: 오른쪽 절반(축 위 시작점 → 축 위 끝점)을 그리고 왼쪽은 거울상으로 되돌아옴
 *  seg: [x,y] 직선 | [cx,cy,x,y] 2차 | [c1x,c1y,c2x,c2y,x,y] 3차 */
function symPath(c, sx, sy, segs, k = 1) {
  c.moveTo(sx * k, sy * k);
  for (const s of segs) {
    if (s.length === 2) c.lineTo(s[0] * k, s[1] * k);
    else if (s.length === 4) c.quadraticCurveTo(s[0] * k, s[1] * k, s[2] * k, s[3] * k);
    else c.bezierCurveTo(s[0] * k, s[1] * k, s[2] * k, s[3] * k, s[4] * k, s[5] * k);
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const p = i > 0 ? segs[i - 1] : [sx, sy];
    const px = -p[p.length - 2] * k, py = p[p.length - 1] * k;
    if (s.length === 2) c.lineTo(px, py);
    else if (s.length === 4) c.quadraticCurveTo(-s[0] * k, s[1] * k, px, py);
    else c.bezierCurveTo(-s[2] * k, s[3] * k, -s[0] * k, s[1] * k, px, py);
  }
  c.closePath();
}

// ───────────────────────── 문양 경로 (단위 크기 ≈ 1, 중심 원점) ─────────────────────────
const BAT = [[0.045, -0.3], [0.085, -0.13], [0.28, -0.3, 0.62, -0.25], [0.5, -0.06, 0.54, 0.12], [0.44, 0.0, 0.34, 0.1], [0.25, 0.0, 0.15, 0.13], [0.1, 0.3, 0, 0.33]];
const DROP = [[0.1, -0.28, 0.36, -0.04, 0.36, 0.16], [0.36, 0.38, 0.2, 0.5, 0, 0.5]];
const HEART = [[0.1, -0.46, 0.5, -0.44, 0.48, -0.12], [0.46, 0.14, 0.18, 0.3, 0, 0.48]];
const CROSS = [[0.075, -0.43], [0.075, -0.22], [0.28, -0.22], [0.37, -0.15], [0.28, -0.08], [0.075, -0.08], [0.075, 0.4], [0, 0.52]];

export function batPath(c, k = 1) { c.beginPath(); symPath(c, 0, -0.14, BAT, k); }
export function dropPath(c, k = 1) { c.beginPath(); symPath(c, 0, -0.5, DROP, k); }
export function heartPath(c, k = 1) { c.beginPath(); symPath(c, 0, -0.22, HEART, k); }
export function crossPath(c, k = 1) { c.beginPath(); symPath(c, 0, -0.52, CROSS, k); }
/** 해골 (evenodd 로 채우면 눈·코 구멍이 뚫림) */
export function skullPath(c, k = 1) {
  c.beginPath();
  c.moveTo(-0.3 * k, 0.16 * k);
  c.bezierCurveTo(-0.47 * k, 0.02 * k, -0.47 * k, -0.46 * k, 0, -0.47 * k);
  c.bezierCurveTo(0.47 * k, -0.46 * k, 0.47 * k, 0.02 * k, 0.3 * k, 0.16 * k);
  c.lineTo(0.25 * k, 0.25 * k); c.lineTo(0.22 * k, 0.41 * k);
  c.quadraticCurveTo(0, 0.52 * k, -0.22 * k, 0.41 * k);
  c.lineTo(-0.25 * k, 0.25 * k); c.closePath();
  for (const s of [-1, 1]) {
    const ex = 0.165 * s * k, ey = -0.05 * k;
    c.moveTo(ex + 0.12 * k, ey); c.ellipse(ex, ey, 0.12 * k, 0.13 * k, 0, 0, TAU);
  }
  c.moveTo(0, 0.08 * k); c.lineTo(0.055 * k, 0.19 * k); c.lineTo(-0.055 * k, 0.19 * k); c.closePath();
}
export function skullTeeth(c, k, col, lw) {
  c.strokeStyle = col; c.lineWidth = lw;
  c.beginPath();
  c.moveTo(-0.2 * k, 0.3 * k); c.quadraticCurveTo(0, 0.34 * k, 0.2 * k, 0.3 * k);
  for (const x of [-0.12, -0.04, 0.04, 0.12]) { c.moveTo(x * k, 0.29 * k); c.lineTo(x * k, 0.42 * k); }
  c.stroke();
}
/** 초승달: 큰 원(r .46)에서 어긋난 원(중심 .2,-.12 r .4)을 뺀 모양 (교점 각도 미리 계산) */
export function moonPath(c, k = 1) {
  c.beginPath();
  c.arc(0, 0, 0.46 * k, 0.513, 4.689, false);
  c.arc(0.2 * k, -0.12 * k, 0.4 * k, 4.157, 1.045, true);
  c.closePath();
}

// ───────────────────────── 쿼터니언 / 3D 주사위 ─────────────────────────
export const Q = {
  axis(x, y, z, a) { const l = Math.hypot(x, y, z) || 1, s = Math.sin(a / 2) / l; return [Math.cos(a / 2), x * s, y * s, z * s]; },
  mul(a, b) {
    return [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ];
  },
  rot(q, x, y, z, o) {
    const w = q[0], qx = q[1], qy = q[2], qz = q[3];
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    o[0] = x + w * tx + (qy * tz - qz * ty); o[1] = y + w * ty + (qz * tx - qx * tz); o[2] = z + w * tz + (qx * ty - qy * tx);
    return o;
  },
};
// 주사위 면: 값 → [법선, u축, v축]  (u×v = 법선 → 정면에서 볼 때 뒤집히지 않음)
const FACES = [
  null,
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
// 값 v 의 면을 +Z(시청자 방향)로 돌리는 회전
const TO_FRONT = [null, [1, 0, 0, 0], Q.axis(0, 1, 0, -Math.PI / 2), Q.axis(1, 0, 0, Math.PI / 2), Q.axis(1, 0, 0, -Math.PI / 2), Q.axis(0, 1, 0, Math.PI / 2), Q.axis(1, 0, 0, Math.PI)];
/** 결과 값이 위(약간 시청자 쪽)를 향한 최종 자세 */
export function dieRestQ(value, yaw = 0, tilt = 0.5) {
  return Q.mul(Q.axis(1, 0, 0, tilt), Q.mul(Q.axis(0, 0, 1, yaw), TO_FRONT[value]));
}
const PIPS = [null,
  [[0, 0]],
  [[-0.24, -0.24], [0.24, 0.24]],
  [[-0.24, -0.24], [0, 0], [0.24, 0.24]],
  [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]],
  [[-0.24, -0.24], [0.24, -0.24], [0, 0], [-0.24, 0.24], [0.24, 0.24]],
  [[-0.24, -0.26], [0.24, -0.26], [-0.24, 0], [0.24, 0], [-0.24, 0.26], [0.24, 0.26]],
];
const _v = [0, 0, 0], _n = [0, 0, 0], _u = [0, 0, 0], _w = [0, 0, 0];
const _hull = new Float32Array(16);
const LX = -0.45, LY = -0.62, LZ = 0.64; // 광원 방향 (좌상단 앞)
const BONE = ['#6a5a44', '#9a8866', '#c8b894', '#e6dac0', '#faf2e0'];
function boneAt(l) { return BONE[clamp(Math.round(l * 4), 0, 4)]; }

/**
 * 해골 주사위 한 개. (x,y) 화면 중심, s 한 변 길이, q 회전.
 * opt: { glow: 색(결과 강조), hot: 0~1 강조 세기 }
 */
export function drawDie(c, x, y, s, q, opt = {}) {
  // 꼭짓점 투영 → 볼록 껍질(둥근 모서리 실루엣)
  let n = 0;
  for (let i = 0; i < 8; i++) {
    Q.rot(q, i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5, _v);
    _hull[n++] = x + _v[0] * s; _hull[n++] = y + _v[1] * s;
  }
  const hull = convexHull(_hull);
  c.save();
  c.lineJoin = 'round';
  // 외곽 어두운 테두리 + 뼈 몸통
  c.beginPath();
  for (let i = 0; i < hull.length; i += 2) (i ? c.lineTo : c.moveTo).call(c, hull[i], hull[i + 1]);
  c.closePath();
  c.lineWidth = s * 0.2; c.strokeStyle = '#140a08'; c.stroke();
  c.lineWidth = s * 0.13; c.strokeStyle = '#8a7858'; c.stroke();
  c.fillStyle = '#8a7858'; c.fill();
  if (opt.glow && opt.hot > 0) {
    c.globalCompositeOperation = 'lighter';
    c.lineWidth = s * 0.22; c.globalAlpha = 0.35 * opt.hot; c.strokeStyle = opt.glow; c.stroke();
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  // 보이는 면
  for (let v = 1; v <= 6; v++) {
    const F = FACES[v];
    Q.rot(q, F[0][0], F[0][1], F[0][2], _n);
    if (_n[2] <= 0.015) continue;
    Q.rot(q, F[1][0], F[1][1], F[1][2], _u);
    Q.rot(q, F[2][0], F[2][1], F[2][2], _w);
    const lam = clamp(_n[0] * LX + _n[1] * LY + _n[2] * LZ, 0, 1);
    const rim = clamp(-_n[0] * 0.9 - _n[1] * 0.2, 0, 1) * (1 - _n[2]);
    c.save();
    c.transform(_u[0] * s, _u[1] * s, _w[0] * s, _w[1] * s, x + _n[0] * 0.5 * s, y + _n[1] * 0.5 * s);
    // 면
    const base = boneAt(0.25 + lam * 0.75);
    const g = c.createLinearGradient(-0.5, -0.5, 0.5, 0.5);
    g.addColorStop(0, shadeCached(base, 0.18)); g.addColorStop(0.55, base); g.addColorStop(1, shadeCached(base, -0.22));
    rr(c, -0.47, -0.47, 0.94, 0.94, 0.17);
    c.fillStyle = g; c.fill();
    // 뼈 질감: 옅은 결 무늬
    c.globalAlpha = 0.12; c.strokeStyle = '#6a5438'; c.lineWidth = 0.018;
    c.beginPath(); c.moveTo(-0.36, -0.1 + v * 0.03); c.quadraticCurveTo(0, -0.18 + v * 0.02, 0.38, 0.02); c.stroke();
    c.globalAlpha = 1;
    // 눈금
    if (v === 1) {
      c.save(); c.scale(0.62, 0.62); c.translate(0, 0.02);
      skullPath(c, 1);
      c.fillStyle = '#5a0a14'; c.fill('evenodd');
      c.lineWidth = 0.06; c.strokeStyle = '#1a0406'; c.stroke();
      c.fillStyle = '#1a0406';
      for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(0.165 * sx, -0.05, 0.12, 0.13, 0, 0, TAU); c.fill(); }
      if (opt.hot > 0) { glowLocal(c, -0.165, -0.05, 0.14, '#ff3040', opt.hot); glowLocal(c, 0.165, -0.05, 0.14, '#ff3040', opt.hot); }
      c.restore();
    } else {
      for (const p of PIPS[v]) {
        c.fillStyle = '#1c0408';
        c.beginPath(); c.arc(p[0], p[1], 0.095, 0, TAU); c.fill();
        c.fillStyle = '#7a1420';
        c.beginPath(); c.arc(p[0] + 0.012, p[1] + 0.014, 0.068, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,240,220,0.35)';
        c.beginPath(); c.arc(p[0] + 0.03, p[1] + 0.045, 0.03, 0, TAU); c.fill();
      }
    }
    // 역광 (차가운 테두리)
    if (rim > 0.05) {
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = rim * 0.5;
      rr(c, -0.47, -0.47, 0.94, 0.94, 0.17); c.lineWidth = 0.06; c.strokeStyle = '#8ab0ff'; c.stroke();
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    c.restore();
  }
  c.restore();
}
function glowLocal(c, x, y, r, col, a) {
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a * 0.8;
  const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
}
const _shc = new Map();
function shadeCached(col, a) {
  const k = col + a;
  let v = _shc.get(k);
  if (!v) { v = shade(col, a); _shc.set(k, v); }
  return v;
}
// 2D 볼록 껍질 (모노톤 체인, 점 8개) — 매 프레임 할당 없이 재사용 배열 사용
const _P = Array.from({ length: 8 }, () => [0, 0]), _L = [], _U = [], _hullOut = [];
const _cmp = (a, b) => a[0] - b[0] || a[1] - b[1];
const _cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function convexHull(arr) {
  for (let i = 0; i < 8; i++) { _P[i][0] = arr[i * 2]; _P[i][1] = arr[i * 2 + 1]; }
  _P.sort(_cmp);
  _L.length = 0; _U.length = 0;
  for (let i = 0; i < 8; i++) { const p = _P[i]; while (_L.length >= 2 && _cross(_L[_L.length - 2], _L[_L.length - 1], p) <= 0) _L.pop(); _L.push(p); }
  for (let i = 7; i >= 0; i--) { const p = _P[i]; while (_U.length >= 2 && _cross(_U[_U.length - 2], _U[_U.length - 1], p) <= 0) _U.pop(); _U.push(p); }
  _L.pop(); _U.pop();
  _hullOut.length = 0;
  for (let i = 0; i < _L.length; i++) _hullOut.push(_L[i][0], _L[i][1]);
  for (let i = 0; i < _U.length; i++) _hullOut.push(_U[i][0], _U[i][1]);
  return _hullOut;
}

// ───────────────────────── 트럼프 카드 ─────────────────────────
export const SUITS = [
  { id: 'skull', name: '해골', red: false },
  { id: 'blood', name: '피', red: true },
  { id: 'bat', name: '박쥐', red: false },
  { id: 'cross', name: '십자', red: true },
];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const INK = '#1a0c14', RED = '#a8102a';

/** 무늬 한 개 (중심 원점, 크기 k) */
export function suitGlyph(c, suit, k, col) {
  c.fillStyle = col;
  if (suit === 'skull') {
    skullPath(c, k); c.fill('evenodd');
    skullTeeth(c, k, col === INK ? '#f0e6d0' : '#fff', k * 0.04);
  } else if (suit === 'blood') {
    dropPath(c, k); c.fill();
    c.fillStyle = 'rgba(255,220,220,0.45)';
    c.beginPath(); c.ellipse(-0.12 * k, 0.12 * k, 0.06 * k, 0.12 * k, 0.4, 0, TAU); c.fill();
  } else if (suit === 'bat') {
    c.save(); c.scale(1.05, 1.05); batPath(c, k); c.fill(); c.restore();
  } else {
    crossPath(c, k); c.fill();
  }
}

const PIP_LAYOUT = {
  2: [[0, -0.3], [0, 0.3]],
  3: [[0, -0.3], [0, 0], [0, 0.3]],
  4: [[-0.2, -0.3], [0.2, -0.3], [-0.2, 0.3], [0.2, 0.3]],
  5: [[-0.2, -0.3], [0.2, -0.3], [0, 0], [-0.2, 0.3], [0.2, 0.3]],
  6: [[-0.2, -0.3], [0.2, -0.3], [-0.2, 0], [0.2, 0], [-0.2, 0.3], [0.2, 0.3]],
  7: [[-0.2, -0.3], [0.2, -0.3], [0, -0.15], [-0.2, 0], [0.2, 0], [-0.2, 0.3], [0.2, 0.3]],
  8: [[-0.2, -0.3], [0.2, -0.3], [0, -0.15], [-0.2, 0], [0.2, 0], [0, 0.15], [-0.2, 0.3], [0.2, 0.3]],
  9: [[-0.2, -0.32], [0.2, -0.32], [-0.2, -0.11], [0.2, -0.11], [0, 0], [-0.2, 0.11], [0.2, 0.11], [-0.2, 0.32], [0.2, 0.32]],
  10: [[-0.2, -0.32], [0.2, -0.32], [0, -0.21], [-0.2, -0.11], [0.2, -0.11], [-0.2, 0.11], [0.2, 0.11], [0, 0.21], [-0.2, 0.32], [0.2, 0.32]],
};

/**
 * 카드 한 장. (x,y)=중심, w×h. card={rank(0~12), suit(0~3)} | null(뒷면)
 * opt: { back:true, style:'crimson'|'soul', glow:색, hl:0~1, t:시간 }
 */
export function drawCard(c, card, x, y, w, h, opt = {}) {
  c.save();
  c.translate(x, y);
  const r = w * 0.09;
  // 그림자
  c.fillStyle = 'rgba(0,0,0,0.45)';
  rr(c, -w / 2 + w * 0.04, -h / 2 + h * 0.05, w, h, r); c.fill();
  if (opt.glow && opt.hl > 0) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = opt.hl;
    c.shadowColor = opt.glow; c.shadowBlur = w * 0.35;
    rr(c, -w / 2, -h / 2, w, h, r); c.strokeStyle = opt.glow; c.lineWidth = w * 0.05; c.stroke();
    c.restore();
  }
  if (!card || opt.back) drawCardBack(c, w, h, r, opt.style || 'crimson', opt.t ?? 0);
  else drawCardFace(c, card, w, h, r);
  c.restore();
}

function drawCardFace(c, card, w, h, r) {
  const suit = SUITS[card.suit], col = suit.red ? RED : INK;
  // 양피지 바탕
  const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, '#fbf3e0'); g.addColorStop(0.6, '#efe2c4'); g.addColorStop(1, '#d8c6a0');
  rr(c, -w / 2, -h / 2, w, h, r); c.fillStyle = g; c.fill();
  c.lineWidth = Math.max(1, w * 0.018); c.strokeStyle = '#2a1810'; c.stroke();
  // 안쪽 테두리 (금 + 진홍)
  c.strokeStyle = 'rgba(160,110,40,0.75)'; c.lineWidth = Math.max(0.8, w * 0.012);
  rr(c, -w / 2 + w * 0.07, -h / 2 + w * 0.07, w - w * 0.14, h - w * 0.14, r * 0.6); c.stroke();
  const rank = RANKS[card.rank];
  // 모서리 표기
  for (const s of [1, -1]) {
    c.save(); c.rotate(s < 0 ? Math.PI : 0);
    const fx = -w / 2 + w * 0.13, fy = -h / 2 + h * 0.13;
    c.font = `900 ${Math.round(w * (rank === '10' ? 0.18 : 0.22))}px ${FONT.num}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = col; c.fillText(rank, fx, fy);
    c.save(); c.translate(fx, fy + h * 0.115); suitGlyph(c, suit.id, w * 0.11, col); c.restore();
    c.restore();
  }
  // 가운데
  if (card.rank === 0) {
    // 에이스: 금빛 고리 + 큰 무늬
    c.save();
    c.strokeStyle = '#b8903a'; c.lineWidth = w * 0.025;
    c.beginPath(); c.arc(0, 0, w * 0.3, 0, TAU); c.stroke();
    c.lineWidth = w * 0.01;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      c.beginPath(); c.moveTo(Math.cos(a) * w * 0.33, Math.sin(a) * w * 0.33); c.lineTo(Math.cos(a) * w * (i % 2 ? 0.37 : 0.41), Math.sin(a) * w * (i % 2 ? 0.37 : 0.41)); c.stroke();
    }
    suitGlyph(c, suit.id, w * 0.44, col);
    c.restore();
  } else if (card.rank >= 10) {
    drawCourt(c, card.rank, suit, w, h, col);
  } else {
    const L = PIP_LAYOUT[card.rank + 1];
    const k = w * (card.rank >= 7 ? 0.17 : 0.19);
    for (const [px, py] of L) {
      c.save(); c.translate(px * w * 0.92, py * h * 0.82);
      if (py > 0.01) c.rotate(Math.PI);
      suitGlyph(c, suit.id, k, col);
      c.restore();
    }
  }
}

function drawCourt(c, rank, suit, w, h, col) {
  const fw = w * 0.6, fh = h * 0.6;
  // 초상 액자
  const g = c.createLinearGradient(0, -fh / 2, 0, fh / 2);
  g.addColorStop(0, suit.red ? '#5a0a18' : '#241830'); g.addColorStop(1, suit.red ? '#2a0408' : '#0c0810');
  rr(c, -fw / 2, -fh / 2, fw, fh, w * 0.04); c.fillStyle = g; c.fill();
  c.lineWidth = w * 0.025; c.strokeStyle = '#c8a050'; c.stroke();
  c.save();
  rr(c, -fw / 2, -fh / 2, fw, fh, w * 0.04); c.clip();
  const k = fw;
  c.translate(0, fh * 0.12);
  if (rank === 12) {
    // K — 해골 왕
    c.fillStyle = '#e8dcc0'; skullPath(c, k * 0.62); c.fill('evenodd');
    skullTeeth(c, k * 0.62, '#3a2a20', k * 0.02);
    glowLocal(c, -0.1 * k, -0.03 * k, 0.07 * k, '#ff3a3a', 1); glowLocal(c, 0.1 * k, -0.03 * k, 0.07 * k, '#ff3a3a', 1);
    crown(c, 0, -k * 0.3, k * 0.5, '#e8c060');
  } else if (rank === 11) {
    // Q — 흡혈 여왕 (창백한 얼굴, 검은 머리, 붉은 입술)
    c.fillStyle = '#140810';
    c.beginPath(); c.ellipse(0, -k * 0.02, k * 0.34, k * 0.44, 0, 0, TAU); c.fill();
    c.fillStyle = '#f4e4e0';
    c.beginPath(); c.ellipse(0, -k * 0.02, k * 0.2, k * 0.26, 0, 0, TAU); c.fill();
    c.fillStyle = '#140810';
    c.beginPath(); c.moveTo(-k * 0.21, -k * 0.1); c.quadraticCurveTo(0, -k * 0.34, k * 0.21, -k * 0.1); c.quadraticCurveTo(0, -k * 0.22, -k * 0.21, -k * 0.1); c.fill();
    c.strokeStyle = '#2a0a14'; c.lineWidth = k * 0.025;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * k * 0.13, -k * 0.02); c.quadraticCurveTo(s * k * 0.08, k * 0.0, s * k * 0.03, -k * 0.02); c.stroke(); }
    c.fillStyle = '#c0102a';
    c.beginPath(); c.ellipse(0, k * 0.12, k * 0.06, k * 0.025, 0, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.fillRect(-k * 0.03, k * 0.12, k * 0.014, k * 0.035); c.fillRect(k * 0.016, k * 0.12, k * 0.014, k * 0.035);
    crown(c, 0, -k * 0.3, k * 0.34, '#e8c060', true);
    c.fillStyle = suit.red ? '#a8102a' : '#4a2a6a';
    c.beginPath(); c.moveTo(-k * 0.5, k * 0.5); c.quadraticCurveTo(-k * 0.2, k * 0.2, 0, k * 0.28); c.quadraticCurveTo(k * 0.2, k * 0.2, k * 0.5, k * 0.5); c.fill();
  } else {
    // J — 헌터 투구
    const m = c.createLinearGradient(-k * 0.3, 0, k * 0.3, 0);
    m.addColorStop(0, '#5a5e6a'); m.addColorStop(0.45, '#d8dce8'); m.addColorStop(1, '#3a3e48');
    c.fillStyle = m;
    c.beginPath(); c.moveTo(-k * 0.26, k * 0.3); c.lineTo(-k * 0.28, -k * 0.08); c.quadraticCurveTo(-k * 0.26, -k * 0.38, 0, -k * 0.4); c.quadraticCurveTo(k * 0.26, -k * 0.38, k * 0.28, -k * 0.08); c.lineTo(k * 0.26, k * 0.3); c.closePath(); c.fill();
    c.strokeStyle = '#1a1418'; c.lineWidth = k * 0.02; c.stroke();
    c.fillStyle = '#0a0608';
    c.fillRect(-k * 0.2, -k * 0.06, k * 0.4, k * 0.07); c.fillRect(-k * 0.035, -k * 0.06, k * 0.07, k * 0.3);
    glowLocal(c, -k * 0.1, -k * 0.025, k * 0.06, '#ffd070', 0.9); glowLocal(c, k * 0.1, -k * 0.025, k * 0.06, '#ffd070', 0.9);
    c.fillStyle = suit.red ? '#c0102a' : '#6a3a9a';
    c.beginPath(); c.moveTo(0, -k * 0.4); c.quadraticCurveTo(k * 0.18, -k * 0.62, k * 0.34, -k * 0.5); c.quadraticCurveTo(k * 0.16, -k * 0.46, k * 0.04, -k * 0.36); c.fill();
  }
  c.restore();
  // 무늬 작은 표식
  c.save(); c.translate(fw / 2 - w * 0.08, fh / 2 - w * 0.08); suitGlyph(c, suit.id, w * 0.12, suit.red ? '#ffd0d0' : '#e8dcc0'); c.restore();
}

function crown(c, x, y, w, col, tiara = false) {
  const h = w * (tiara ? 0.35 : 0.5);
  const g = c.createLinearGradient(0, y - h, 0, y);
  g.addColorStop(0, '#fff2b0'); g.addColorStop(1, '#8a6a2a');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - w / 2, y);
  const n = tiara ? 3 : 5;
  for (let i = 0; i <= n * 2; i++) {
    const px = x - w / 2 + (w * i) / (n * 2);
    const py = i % 2 === 0 ? y - h * (i === n ? 1.1 : 0.9) : y - h * 0.35;
    c.lineTo(px, py);
  }
  c.lineTo(x + w / 2, y); c.closePath(); c.fill();
  c.strokeStyle = '#3a2408'; c.lineWidth = w * 0.03; c.stroke();
  c.fillStyle = '#c0102a'; c.beginPath(); c.arc(x, y - h * 0.3, w * 0.05, 0, TAU); c.fill();
}

function drawCardBack(c, w, h, r, style, t) {
  const soul = style === 'soul';
  const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  if (soul) { g.addColorStop(0, '#3a2a6a'); g.addColorStop(0.5, '#1c1238'); g.addColorStop(1, '#0a0618'); }
  else { g.addColorStop(0, '#8a1428'); g.addColorStop(0.5, '#5a0816'); g.addColorStop(1, '#2a0208'); }
  rr(c, -w / 2, -h / 2, w, h, r); c.fillStyle = g; c.fill();
  c.lineWidth = Math.max(1, w * 0.02); c.strokeStyle = '#140608'; c.stroke();
  // 격자 무늬
  c.save();
  const ix = -w / 2 + w * 0.1, iy = -h / 2 + w * 0.1, iw = w - w * 0.2, ih = h - w * 0.2;
  rr(c, ix, iy, iw, ih, r * 0.5); c.clip();
  c.strokeStyle = soul ? 'rgba(160,140,255,0.22)' : 'rgba(232,200,114,0.2)'; c.lineWidth = Math.max(0.6, w * 0.01);
  c.beginPath();
  const step = w * 0.14;
  for (let d = -h; d < w + h; d += step) { c.moveTo(ix + d, iy); c.lineTo(ix + d - ih, iy + ih); c.moveTo(ix + d - ih, iy); c.lineTo(ix + d, iy + ih); }
  c.stroke();
  c.restore();
  c.strokeStyle = '#c8a050'; c.lineWidth = Math.max(1, w * 0.022);
  rr(c, ix, iy, iw, ih, r * 0.5); c.stroke();
  // 가운데 문장: 달 위의 검은 고양이
  const mr = w * 0.27;
  const mg = c.createRadialGradient(-mr * 0.3, -mr * 0.3, mr * 0.1, 0, 0, mr);
  if (soul) { mg.addColorStop(0, '#e8f8ff'); mg.addColorStop(0.7, '#8ac8ff'); mg.addColorStop(1, '#3a5aaa'); }
  else { mg.addColorStop(0, '#fff4d0'); mg.addColorStop(0.7, '#e8c060'); mg.addColorStop(1, '#8a5a1a'); }
  c.fillStyle = mg; c.beginPath(); c.arc(0, 0, mr, 0, TAU); c.fill();
  c.lineWidth = w * 0.02; c.strokeStyle = '#2a1408'; c.stroke();
  catHead(c, 0, mr * 0.18, mr * 1.05, soul ? '#8affc8' : '#ffd040');
  if (soul) glow(c, 0, 0, mr * 1.8, '#6a8aff', 0.25 + 0.1 * Math.sin(t * 3));
}

/** 검은 고양이 머리 실루엣 (흑묘 여관 문장) */
export function catHead(c, x, y, s, eye = '#ffd040') {
  c.save(); c.translate(x, y);
  c.fillStyle = '#0a0608';
  c.beginPath();
  c.moveTo(-s * 0.42, s * 0.12);
  c.quadraticCurveTo(-s * 0.46, -s * 0.2, -s * 0.36, -s * 0.3);
  c.lineTo(-s * 0.4, -s * 0.66); c.lineTo(-s * 0.14, -s * 0.42);
  c.quadraticCurveTo(0, -s * 0.47, s * 0.14, -s * 0.42);
  c.lineTo(s * 0.4, -s * 0.66); c.lineTo(s * 0.36, -s * 0.3);
  c.quadraticCurveTo(s * 0.46, -s * 0.2, s * 0.42, s * 0.12);
  c.quadraticCurveTo(0, s * 0.4, -s * 0.42, s * 0.12);
  c.fill();
  c.fillStyle = eye;
  for (const sx of [-1, 1]) {
    c.beginPath(); c.ellipse(sx * s * 0.17, -s * 0.1, s * 0.085, s * 0.065, sx * 0.25, 0, TAU); c.fill();
  }
  c.fillStyle = '#0a0608';
  for (const sx of [-1, 1]) c.fillRect(sx * s * 0.17 - s * 0.012, -s * 0.16, s * 0.024, s * 0.12);
  c.restore();
}

// ───────────────────────── 블러드 슬롯 문양 (스프라이트 캐시) ─────────────────────────
export const SLOT_SYMBOLS = ['skull', 'bat', 'heart', 'cross', 'moon', 'grail', 'seven'];
export const SLOT_NAMES = { skull: '해골', bat: '박쥐', heart: '하트', cross: '십자가', moon: '달', grail: '성배', seven: '피의 7' };
const SPR = new Map();
const SPR_S = 96, SPR_RES = 2;

/** 문양 스프라이트 (정지판 / 모션블러판). 반환 canvas 는 SPR_S*SPR_RES 크기, blur 판은 세로 1.6배 */
export function slotSprite(id, blur = false) {
  const key = id + (blur ? '_b' : '');
  let cv = SPR.get(key);
  if (cv) return cv;
  if (blur) {
    const base = slotSprite(id, false);
    cv = document.createElement('canvas');
    cv.width = base.width; cv.height = Math.round(base.height * 1.6);
    const c = cv.getContext('2d');
    const off = (cv.height - base.height) / 2;
    const N = 9;
    for (let i = 0; i < N; i++) {
      c.globalAlpha = 0.24;
      c.drawImage(base, 0, off + ((i / (N - 1)) - 0.5) * base.height * 0.55);
    }
  } else {
    cv = document.createElement('canvas');
    cv.width = cv.height = SPR_S * SPR_RES;
    const c = cv.getContext('2d');
    c.scale(SPR_RES, SPR_RES);
    c.translate(SPR_S / 2, SPR_S / 2);
    c.lineJoin = 'round'; c.lineCap = 'round';
    paintSymbol(c, id, SPR_S * 0.8);
  }
  SPR.set(key, cv);
  return cv;
}
export const SLOT_SPRITE_SIZE = SPR_S;

function paintSymbol(c, id, k) {
  const ol = '#12060a';
  switch (id) {
    case 'skull': {
      glowLocal(c, 0, 0, k * 0.6, 'rgba(255,60,60,0.5)', 0.5);
      const g = c.createLinearGradient(-k * 0.4, -k * 0.5, k * 0.4, k * 0.5);
      g.addColorStop(0, '#fffaf0'); g.addColorStop(0.45, '#e6d6b4'); g.addColorStop(1, '#8a7452');
      skullPath(c, k); c.fillStyle = g; c.fill('evenodd');
      c.lineWidth = k * 0.045; c.strokeStyle = ol; c.stroke();
      c.fillStyle = '#1a0608';
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(0.165 * s * k, -0.05 * k, 0.12 * k, 0.13 * k, 0, 0, TAU); c.fill(); }
      c.beginPath(); c.moveTo(0, 0.08 * k); c.lineTo(0.055 * k, 0.19 * k); c.lineTo(-0.055 * k, 0.19 * k); c.fill();
      glowLocal(c, -0.165 * k, -0.04 * k, 0.1 * k, '#ff2a2a', 1); glowLocal(c, 0.165 * k, -0.04 * k, 0.1 * k, '#ff2a2a', 1);
      c.fillStyle = '#ffd0a0'; c.beginPath(); c.arc(-0.165 * k, -0.04 * k, 0.022 * k, 0, TAU); c.arc(0.165 * k, -0.04 * k, 0.022 * k, 0, TAU); c.fill();
      skullTeeth(c, k, '#3a2418', k * 0.028);
      // 금 간 자국 + 하이라이트
      c.strokeStyle = 'rgba(60,30,20,0.7)'; c.lineWidth = k * 0.018;
      c.beginPath(); c.moveTo(0.08 * k, -0.45 * k); c.lineTo(0.12 * k, -0.32 * k); c.lineTo(0.06 * k, -0.26 * k); c.lineTo(0.1 * k, -0.18 * k); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(-0.18 * k, -0.33 * k, 0.12 * k, 0.05 * k, -0.5, 0, TAU); c.fill();
      break;
    }
    case 'bat': {
      glowLocal(c, 0, 0, k * 0.62, '#b060ff', 0.45);
      const g = c.createLinearGradient(0, -k * 0.35, 0, k * 0.35);
      g.addColorStop(0, '#4a2a5a'); g.addColorStop(0.5, '#1c0e24'); g.addColorStop(1, '#08040c');
      c.save(); c.scale(1.35, 1.35);
      batPath(c, k); c.fillStyle = g; c.fill();
      c.lineWidth = k * 0.03; c.strokeStyle = ol; c.stroke();
      // 날개 뼈대
      c.strokeStyle = 'rgba(180,140,220,0.4)'; c.lineWidth = k * 0.012;
      c.beginPath();
      for (const s of [-1, 1]) {
        c.moveTo(s * 0.1 * k, -0.08 * k); c.lineTo(s * 0.6 * k, -0.24 * k);
        c.moveTo(s * 0.1 * k, -0.06 * k); c.lineTo(s * 0.5 * k, 0.1 * k);
        c.moveTo(s * 0.1 * k, -0.04 * k); c.lineTo(s * 0.32 * k, 0.1 * k);
      }
      c.stroke();
      // 역광 테두리 (위쪽)
      c.save(); batPath(c, k); c.clip();
      c.globalCompositeOperation = 'lighter';
      c.translate(0, k * 0.03); batPath(c, k); c.lineWidth = k * 0.04; c.strokeStyle = 'rgba(150,170,255,0.45)'; c.stroke();
      c.restore();
      c.restore();
      glowLocal(c, -0.045 * k, -0.12 * k, 0.06 * k, '#ff2030', 1); glowLocal(c, 0.045 * k, -0.12 * k, 0.06 * k, '#ff2030', 1);
      c.fillStyle = '#ffb0a0'; c.beginPath(); c.arc(-0.045 * k, -0.12 * k, 0.018 * k, 0, TAU); c.arc(0.045 * k, -0.12 * k, 0.018 * k, 0, TAU); c.fill();
      break;
    }
    case 'heart': {
      glowLocal(c, 0, 0, k * 0.62, '#ff2a44', 0.55);
      c.save(); c.scale(1.35, 1.35); c.translate(0, -k * 0.02);
      const g = c.createRadialGradient(-k * 0.15, -k * 0.2, k * 0.05, 0, 0, k * 0.6);
      g.addColorStop(0, '#ff8a94'); g.addColorStop(0.35, '#e0203a'); g.addColorStop(0.8, '#7a0616'); g.addColorStop(1, '#3a0208');
      heartPath(c, k); c.fillStyle = g; c.fill();
      c.lineWidth = k * 0.035; c.strokeStyle = ol; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.beginPath(); c.ellipse(-0.22 * k, -0.2 * k, 0.1 * k, 0.05 * k, -0.6, 0, TAU); c.fill();
      c.beginPath(); c.arc(-0.1 * k, -0.28 * k, 0.025 * k, 0, TAU); c.fill();
      // 흘러내리는 피
      c.fillStyle = '#9a0a1e';
      c.beginPath(); c.moveTo(0.12 * k, 0.26 * k); c.quadraticCurveTo(0.14 * k, 0.42 * k, 0.12 * k, 0.46 * k); c.arc(0.12 * k, 0.46 * k, 0.03 * k, 0, Math.PI); c.quadraticCurveTo(0.1 * k, 0.36 * k, 0.07 * k, 0.3 * k); c.fill();
      c.restore();
      break;
    }
    case 'cross': {
      glowLocal(c, 0, 0, k * 0.7, '#fff2b0', 0.8);
      c.save(); c.scale(1.25, 1.25);
      const g = c.createLinearGradient(-k * 0.35, -k * 0.5, k * 0.35, k * 0.5);
      g.addColorStop(0, '#fff8d0'); g.addColorStop(0.35, '#f0c860'); g.addColorStop(0.7, '#b8862a'); g.addColorStop(1, '#6a4a14');
      crossPath(c, k); c.fillStyle = g; c.fill();
      c.lineWidth = k * 0.03; c.strokeStyle = '#2a1804'; c.stroke();
      c.strokeStyle = 'rgba(255,250,220,0.8)'; c.lineWidth = k * 0.012;
      c.beginPath(); c.moveTo(-0.02 * k, -0.4 * k); c.lineTo(-0.02 * k, 0.36 * k); c.moveTo(-0.26 * k, -0.17 * k); c.lineTo(0.26 * k, -0.17 * k); c.stroke();
      c.fillStyle = '#c0102a'; c.beginPath(); c.arc(0, -0.15 * k, 0.06 * k, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,220,220,0.8)'; c.beginPath(); c.arc(-0.018 * k, -0.17 * k, 0.018 * k, 0, TAU); c.fill();
      c.restore();
      break;
    }
    case 'moon': {
      glowLocal(c, 0, 0, k * 0.7, '#9fe8ff', 0.55);
      c.save(); c.scale(1.2, 1.2); c.rotate(-0.35);
      const g = c.createLinearGradient(-k * 0.45, 0, k * 0.2, 0);
      g.addColorStop(0, '#fffbe8'); g.addColorStop(0.5, '#e0dcc8'); g.addColorStop(1, '#8a8aa0');
      moonPath(c, k); c.fillStyle = g; c.fill();
      c.lineWidth = k * 0.03; c.strokeStyle = '#141020'; c.stroke();
      c.fillStyle = 'rgba(120,120,150,0.45)';
      c.beginPath(); c.arc(-0.3 * k, 0.05 * k, 0.05 * k, 0, TAU); c.arc(-0.2 * k, 0.28 * k, 0.035 * k, 0, TAU); c.arc(-0.34 * k, -0.18 * k, 0.03 * k, 0, TAU); c.fill();
      c.restore();
      // 별
      c.fillStyle = '#fff8e0';
      for (const [sx, sy, sr] of [[0.28, -0.26, 0.05], [0.34, 0.1, 0.035]]) star4(c, sx * k, sy * k, sr * k);
      break;
    }
    case 'grail': {
      glowLocal(c, 0, -k * 0.1, k * 0.7, '#fff2b0', 0.6);
      c.save(); c.scale(1.2, 1.2);
      const g = c.createLinearGradient(-k * 0.3, 0, k * 0.3, 0);
      g.addColorStop(0, '#7a5414'); g.addColorStop(0.3, '#f8e090'); g.addColorStop(0.55, '#d8a840'); g.addColorStop(1, '#6a4410');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(-0.3 * k, -0.36 * k); c.lineTo(0.3 * k, -0.36 * k);
      c.bezierCurveTo(0.3 * k, -0.02 * k, 0.14 * k, 0.06 * k, 0.05 * k, 0.1 * k);
      c.lineTo(0.05 * k, 0.28 * k); c.quadraticCurveTo(0.24 * k, 0.32 * k, 0.26 * k, 0.44 * k);
      c.lineTo(-0.26 * k, 0.44 * k); c.quadraticCurveTo(-0.24 * k, 0.32 * k, -0.05 * k, 0.28 * k);
      c.lineTo(-0.05 * k, 0.1 * k);
      c.bezierCurveTo(-0.14 * k, 0.06 * k, -0.3 * k, -0.02 * k, -0.3 * k, -0.36 * k);
      c.closePath(); c.fill();
      c.lineWidth = k * 0.03; c.strokeStyle = '#2a1804'; c.stroke();
      // 포도주
      c.fillStyle = '#8a0418';
      c.beginPath(); c.ellipse(0, -0.36 * k, 0.3 * k, 0.07 * k, 0, 0, TAU); c.fill();
      c.strokeStyle = '#2a1804'; c.stroke();
      c.fillStyle = 'rgba(255,120,140,0.6)'; c.beginPath(); c.ellipse(-0.1 * k, -0.37 * k, 0.1 * k, 0.02 * k, 0, 0, TAU); c.fill();
      // 보석 띠
      c.fillStyle = '#3a8aff'; c.beginPath(); c.arc(0, -0.16 * k, 0.05 * k, 0, TAU); c.fill();
      c.fillStyle = '#c0102a'; c.beginPath(); c.arc(-0.16 * k, -0.2 * k, 0.035 * k, 0, TAU); c.arc(0.16 * k, -0.2 * k, 0.035 * k, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(-0.2 * k, -0.3 * k, 0.04 * k, 0.16 * k);
      c.restore();
      c.fillStyle = '#fffbe0'; star4(c, 0.3 * k, -0.4 * k, 0.07 * k);
      break;
    }
    case 'seven': {
      glowLocal(c, 0, 0, k * 0.75, '#ff1030', 0.9);
      c.save(); c.scale(1.2, 1.2);
      const path = () => {
        c.beginPath();
        c.moveTo(-0.34 * k, -0.44 * k); c.lineTo(0.36 * k, -0.44 * k); c.lineTo(0.36 * k, -0.3 * k);
        c.bezierCurveTo(0.12 * k, -0.08 * k, 0.02 * k, 0.16 * k, 0.0 * k, 0.46 * k);
        c.lineTo(-0.2 * k, 0.46 * k);
        c.bezierCurveTo(-0.16 * k, 0.16 * k, -0.02 * k, -0.08 * k, 0.16 * k, -0.28 * k);
        c.lineTo(-0.2 * k, -0.28 * k); c.lineTo(-0.26 * k, -0.2 * k); c.lineTo(-0.34 * k, -0.2 * k); c.closePath();
      };
      c.save(); c.translate(0.03 * k, 0.04 * k); path(); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fill(); c.restore();
      path();
      c.lineWidth = k * 0.1; c.strokeStyle = '#2a1404'; c.stroke();
      c.lineWidth = k * 0.055; const gg = c.createLinearGradient(0, -0.45 * k, 0, 0.46 * k);
      gg.addColorStop(0, '#fff2b0'); gg.addColorStop(0.5, '#e0a840'); gg.addColorStop(1, '#8a5a14');
      c.strokeStyle = gg; c.stroke();
      const g = c.createLinearGradient(0, -0.44 * k, 0, 0.46 * k);
      g.addColorStop(0, '#ff6a6a'); g.addColorStop(0.35, '#e0102a'); g.addColorStop(1, '#5a0010');
      c.fillStyle = g; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(-0.3 * k, -0.41 * k, 0.6 * k, 0.04 * k);
      // 핏방울
      c.fillStyle = '#c0102a';
      for (const [dx, dl] of [[-0.12, 0.2], [0.24, 0.12]]) {
        const y0 = dx < 0 ? 0.46 : -0.3;
        c.beginPath(); c.moveTo((dx - 0.03) * k, y0 * k); c.quadraticCurveTo(dx * k, (y0 + dl) * k, (dx + 0.03) * k, y0 * k); c.fill();
        c.beginPath(); c.arc(dx * k, (y0 + dl + 0.04) * k, 0.035 * k, 0, TAU); c.fill();
      }
      c.restore();
      break;
    }
  }
}
function star4(c, x, y, r) {
  c.beginPath();
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill();
}
export { star4 };

// ───────────────────────── 금화 / 칩 ─────────────────────────
/**
 * 금화 앞면 스프라이트 (반지름 COIN_R, 1 px 여백; detail = 테두리 선·십자 무늬). 한 번 구워 두고 가로로 눌러 그린다
 * — 잭팟·대승리 코인 분수(최대 160개)가 금화마다 그라데이션을 새로 만들지 않게 (MASTER_PLAN §5.2, R12). 못 만들면 null.
 */
const COIN_R = 32, COIN_P = (COIN_R + 1) / COIN_R;
const COIN_SPR = [undefined, undefined];
function coinSprite(detail) {
  const i = detail ? 1 : 0;
  if (COIN_SPR[i] !== undefined) return COIN_SPR[i];
  let s = null;
  try {
    const S = COIN_R * 2 + 2;
    const cv = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(S, S) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: S, height: S }) : null;
    const x = cv?.getContext('2d');
    if (x) { coinFace(x, COIN_R + 1, COIN_R + 1, COIN_R, COIN_R, detail); s = cv; }
  } catch { s = null; }
  COIN_SPR[i] = s;
  return s;
}
function coinFace(c, x, y, w, r, detail) {
  const g = c.createLinearGradient(x - w, y - r, x + w, y + r);
  g.addColorStop(0, '#fff4c0'); g.addColorStop(0.4, '#f0c850'); g.addColorStop(1, '#9a6a18');
  c.fillStyle = g;
  c.beginPath(); c.ellipse(x, y, w, r, 0, 0, TAU); c.fill();
  if (detail) {
    c.strokeStyle = 'rgba(120,80,20,0.9)'; c.lineWidth = Math.max(0.8, r * 0.1);
    c.beginPath(); c.ellipse(x, y, w * 0.72, r * 0.72, 0, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(120,80,20,0.9)';
    c.fillRect(x - w * 0.09, y - r * 0.42, w * 0.18, r * 0.84);
    c.fillRect(x - w * 0.32, y - r * 0.18, w * 0.64, r * 0.16);
  }
}
/** 회전하는 금화 (spin: 라디안, 폭 = |cos|) */
export function drawCoin(c, x, y, r, spin = 0) {
  const k = Math.cos(spin), w = Math.max(r * 0.12, Math.abs(k) * r);
  const edge = Math.sin(spin) * r * 0.16;
  c.fillStyle = '#6a4410';
  c.beginPath(); c.ellipse(x + edge, y, w, r, 0, 0, TAU); c.fill();
  const spr = coinSprite(w > r * 0.35);
  if (spr) c.drawImage(spr, x - w * COIN_P, y - r * COIN_P, 2 * w * COIN_P, 2 * r * COIN_P);
  else coinFace(c, x, y, w, r, w > r * 0.35);
}

const CHIP_COL = { 0: ['#2a8a7a', '#0c3a34'], 50: ['#e8e0cc', '#8a7a60'], 100: ['#c0142e', '#4a0612'], 500: ['#6a2aa0', '#240a3a'], 1000: ['#e0b040', '#6a4a10'] };
/** 카지노 칩 (value 0 = 무료) */
export function drawChip(c, x, y, r, value, { selected = false, disabled = false, t = 0, label } = {}) {
  const [c1, c2] = CHIP_COL[value] || CHIP_COL[100];
  c.save();
  if (disabled) c.globalAlpha *= 0.38;
  const lift = selected ? -5 - Math.sin(t * 5) * 1.5 : 0;
  // 그림자 + 두께
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.ellipse(x + 2, y + 5, r, r * 0.92, 0, 0, TAU); c.fill();
  c.translate(x, y + lift);
  if (selected) glow(c, 0, 0, r * 2, value === 1000 ? '#ffd060' : '#ff5060', 0.55);
  c.fillStyle = shadeCached(c2, -0.3); c.beginPath(); c.arc(0, 4, r, 0, TAU); c.fill();
  const g = c.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, shadeCached(c1, 0.25)); g.addColorStop(0.7, c1); g.addColorStop(1, c2);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  // 가장자리 무늬
  c.fillStyle = value === 50 ? '#3a2a60' : '#f4ecd8';
  for (let i = 0; i < 8; i++) {
    c.save(); c.rotate((i / 8) * TAU + 0.2);
    rr(c, -r * 0.12, -r * 0.98, r * 0.24, r * 0.22, r * 0.05); c.fill();
    c.restore();
  }
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
  // 안쪽 원
  c.fillStyle = shadeCached(c2, -0.1); c.beginPath(); c.arc(0, 0, r * 0.64, 0, TAU); c.fill();
  c.setLineDash([r * 0.12, r * 0.09]); c.strokeStyle = '#e8c872'; c.lineWidth = 1.4;
  c.beginPath(); c.arc(0, 0, r * 0.58, 0, TAU); c.stroke(); c.setLineDash([]);
  const lb = label ?? (value === 0 ? '무료' : String(value));
  if (lb) { // label '' = 글자 없는 칩 (쌓인 칩의 아래쪽)
    c.font = `900 ${Math.round(r * (lb.length > 3 ? 0.47 : 0.56))}px ${FONT.num}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.strokeText(lb, 0, 1);
    c.fillStyle = value === 50 ? '#fff' : '#fff4d8'; c.fillText(lb, 0, 1);
  }
  if (selected) { c.strokeStyle = '#ffe7a0'; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, r + 3, 0, TAU); c.stroke(); }
  c.restore();
}

// ───────────────────────── 리볼버 ─────────────────────────
export function drawRevolver(c, x, y, s, ang = 0, { metal = '#b8bcc8', trim = '#d8b040', grip = '#5a3018' } = {}) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  c.lineJoin = 'round';
  const m = c.createLinearGradient(0, -0.2, 0, 0.1);
  m.addColorStop(0, shadeCached(metal, 0.4)); m.addColorStop(0.5, metal); m.addColorStop(1, shadeCached(metal, -0.5));
  // 손잡이
  const gg = c.createLinearGradient(-0.3, 0, -0.1, 0.4);
  gg.addColorStop(0, shadeCached(grip, 0.25)); gg.addColorStop(1, shadeCached(grip, -0.4));
  c.fillStyle = gg;
  c.beginPath(); c.moveTo(-0.12, 0.02); c.quadraticCurveTo(-0.16, 0.26, -0.28, 0.4); c.lineTo(-0.42, 0.36); c.quadraticCurveTo(-0.36, 0.2, -0.34, 0.02); c.closePath(); c.fill();
  c.strokeStyle = '#140a06'; c.lineWidth = 0.025; c.stroke();
  // 몸체 + 총열
  c.fillStyle = m;
  c.beginPath(); c.moveTo(-0.36, -0.1); c.lineTo(-0.12, -0.12); c.lineTo(0.6, -0.1); c.lineTo(0.6, -0.02); c.lineTo(0.1, -0.01); c.lineTo(-0.1, 0.06); c.lineTo(-0.36, 0.04); c.closePath(); c.fill(); c.stroke();
  // 실린더
  c.fillStyle = shadeCached(metal, -0.15);
  rr(c, -0.14, -0.16, 0.24, 0.2, 0.05); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.015;
  c.beginPath(); c.moveTo(-0.14, -0.09); c.lineTo(0.1, -0.09); c.moveTo(-0.14, -0.02); c.lineTo(0.1, -0.02); c.stroke();
  // 방아쇠 울 + 공이치기
  c.strokeStyle = trim; c.lineWidth = 0.03;
  c.beginPath(); c.arc(-0.1, 0.08, 0.07, 0, Math.PI); c.stroke();
  c.fillStyle = '#2a2428'; c.beginPath(); c.moveTo(-0.3, -0.1); c.lineTo(-0.38, -0.2); c.lineTo(-0.28, -0.12); c.fill();
  // 금 장식
  c.strokeStyle = trim; c.lineWidth = 0.018;
  c.beginPath(); c.moveTo(0.12, -0.06); c.lineTo(0.56, -0.06); c.stroke();
  c.fillStyle = trim; c.fillRect(0.54, -0.14, 0.04, 0.04);
  c.restore();
}

// ───────────────────────── 여관 게임 문장 ─────────────────────────
const EMB_Q = { a: null, b: null };
/** 여관 메뉴용 게임 문장 (중심 cx,cy, 크기 s ≈ 폭) */
export function drawEmblem(c, id, cx, cy, s, t = 0, hot = 0) {
  c.save(); c.translate(cx, cy);
  switch (id) {
    case 'dice': {
      EMB_Q.a ??= dieRestQ(6, 0.5, 0.55); EMB_Q.b ??= dieRestQ(1, -0.3, 0.5);
      const bob = Math.sin(t * 2) * s * 0.02;
      glow(c, 0, s * 0.05, s * 0.6, '#ff3040', 0.25 + hot * 0.25);
      drawDie(c, -s * 0.18, s * 0.08 + bob, s * 0.34, EMB_Q.a);
      drawDie(c, s * 0.19, -s * 0.06 - bob, s * 0.34, EMB_Q.b, { glow: '#ff3040', hot: 0.5 + hot * 0.5 });
      break;
    }
    case 'blackjack': {
      glow(c, 0, 0, s * 0.6, '#ff2040', 0.2 + hot * 0.25);
      c.save(); c.rotate(-0.22); drawCard(c, { rank: 0, suit: 0 }, -s * 0.12, s * 0.02, s * 0.42, s * 0.6); c.restore();
      c.save(); c.rotate(0.18); drawCard(c, { rank: 12, suit: 1 }, s * 0.14, -s * 0.02, s * 0.42, s * 0.6); c.restore();
      break;
    }
    case 'slot': {
      const sp = slotSprite('seven');
      glow(c, 0, 0, s * 0.62, '#ff1030', 0.3 + hot * 0.3 + Math.sin(t * 4) * 0.08);
      const d = s * 0.8;
      c.drawImage(sp, -d / 2, -d / 2, d, d);
      c.fillStyle = '#fff2b0';
      for (let i = 0; i < 3; i++) {
        const a = t * 1.5 + i * 2.1;
        const tw = 0.5 + 0.5 * Math.sin(t * 5 + i);
        star4(c, Math.cos(a) * s * 0.36, Math.sin(a) * s * 0.3, s * 0.035 * (0.5 + tw));
      }
      break;
    }
    case 'duel': {
      const sr = s * 0.34;
      const g = c.createRadialGradient(0, 0, sr * 0.2, 0, 0, sr);
      g.addColorStop(0, '#ffe0a0'); g.addColorStop(0.6, '#ff7a2a'); g.addColorStop(1, '#a01020');
      glow(c, 0, 0, s * 0.62, '#ff6a2a', 0.35 + hot * 0.3);
      c.fillStyle = g; c.beginPath(); c.arc(0, -s * 0.02, sr, 0, TAU); c.fill();
      c.fillStyle = 'rgba(60,10,20,0.5)';
      for (let i = 0; i < 3; i++) c.fillRect(-sr, -s * 0.02 + sr * (0.2 + i * 0.25), sr * 2, sr * 0.07);
      drawRevolver(c, -s * 0.02, s * 0.04, s * 0.62, -0.5);
      c.save(); c.scale(-1, 1); drawRevolver(c, -s * 0.02, s * 0.04, s * 0.62, -0.5); c.restore();
      break;
    }
    case 'memory': {
      glow(c, 0, 0, s * 0.6, '#8ab0ff', 0.3 + hot * 0.3);
      c.save(); c.rotate(-0.16); drawCard(c, null, -s * 0.14, s * 0.02, s * 0.4, s * 0.56, { back: true, style: 'soul', t }); c.restore();
      c.save(); c.rotate(0.14);
      drawCard(c, null, s * 0.14, -s * 0.02, s * 0.4, s * 0.56, { back: true, style: 'soul', t: t + 1 });
      c.restore();
      // 떠오르는 영혼 불꽃
      for (let i = 0; i < 4; i++) {
        const u = (t * 0.6 + i / 4) % 1;
        glow(c, Math.sin(u * 9 + i) * s * 0.15, s * 0.1 - u * s * 0.5, s * 0.08 * (1 - u), '#8affc8', 0.8 * (1 - u));
      }
      break;
    }
  }
  c.restore();
}
