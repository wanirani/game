// 캐릭터 렌더 공용 부품
//  - 색 캐시(sh/mx/ra) : 매 프레임 hex 파싱을 피하기 위한 메모이즈
//  - 셰이딩 도형: capsule(원통형 음영 + 역광 림라이트 + 외곽선), ribbon(체인 → 천/머리카락/채찍 띠), smoothClosed(매끈한 외곽)
//  - 무기 7계열(채찍·장검·대검·단검·총·지팡이·창) × 6단계 외형, 강화 발광(+7 발광 / +10 화염·번개 / +13 무지개), 채찍 끈
//  - 날개(박쥐/천사/뼈/악마/까마귀/세라프), 오라 입자, 마법진
// 모든 함수는 G.c(현재 ctx) 에 그린다. G.tint 가 있으면 단색 실루엣(잔상)으로만 그린다.
import { TAU, clamp, lerp, shade, mix, hexToRgb } from '../core/math.js';

export const D = Math.PI / 2;
export const RIM = '#a9c2ff';   // 차가운 역광
export const KEY = '#ffd6a0';   // 따뜻한 주광
export const EL_COL = { holy: '#fff2b0', fire: '#ff7a2a', ice: '#9fe8ff', dark: '#b060ff', thunder: '#bfe0ff', blood: '#ff2a44' };
export const RARITY_COL = ['#d8d0c0', '#6fe07a', '#5aa8ff', '#c07cff', '#ffa640', '#ff4a5a'];

/** 현재 그리기 상태 (drawHero 가 설정) */
export const G = { c: null, tint: null, t: 0, olw: 0.85, fx: true, pass: 0, lowq: false };   // lowq: 저품질 등급 → 장식용 그라디언트 대신 단색
/** 부위 묶음(팔·다리)을 이음매 없이: 1패스 외곽선(두껍게) → 2패스 채우기 */
export function group(fn, a, b, cc) {
  if (G.tint) { fn(a, b, cc); return; }
  G.pass = 1; fn(a, b, cc); G.pass = 2; fn(a, b, cc); G.pass = 0;
}
/** 현재 path 채우기 (외곽선 패스에서는 생략) */
export function fl() { if (G.pass !== 1) G.c.fill(); }

// ───────────────────────── 색 캐시 ─────────────────────────
const CC = new Map();
function memo(k, f) {
  let v = CC.get(k);
  if (v === undefined) { if (CC.size > 8000) CC.clear(); v = f(); CC.set(k, v); }
  return v;
}
// 그라디언트 캐시 (QA-TOOLS #341: 영웅 몸 음영이 프레임마다 새 그라디언트를 만들어 저사양 예산을 넘겼다).
// CanvasGradient 좌표는 채울 때의 사용자 좌표계로 해석되므로 (지역 좌표, 색) 이 같으면 어느 캔버스·변환에서도 다시 쓸 수 있다.
// 좌표는 0.5 단위로 맞춘다(논리 px 0.25 이하 차이 — 눈에 안 보임). 가득 차면 통째로 비운다
const GRC = new Map();
const q2 = (v) => Math.round(v * 2) / 2;
function gradMemo(k, f) {
  let g = GRC.get(k);
  if (g === undefined) {
    // 가득 차면 오래된 1/4 만 비운다 (통째로 비우면 그 프레임에 정지한 부위 그라디언트까지 한꺼번에 다시 만들어 마을에서 22개/프레임 튐)
    if (GRC.size > 600) { let n = 150; for (const key of GRC.keys()) { GRC.delete(key); if (--n <= 0) break; } }
    g = f(); GRC.set(k, g);
  }
  return g;
}
export const isHex = (c) => typeof c === 'string' && c.charCodeAt(0) === 35 && (c.length === 7 || c.length === 4);
/** 밝기 조정 (-1 검정 ~ +1 흰색) */
export function sh(c, a) { return isHex(c) ? memo('s' + c + a, () => shade(c, a)) : c; }
/** 두 색 섞기 */
export function mx(a, b, t) { return isHex(a) && isHex(b) ? memo('m' + a + b + t, () => mix(a, b, t)) : a; }
/** hex + 알파 → rgba (알파는 1/40 단위로 양자화해 캐시) */
export function ra(c, a) {
  a = Math.round(clamp(a, 0, 1) * 40) / 40;
  if (!isHex(c)) return c;
  return memo('a' + c + a, () => { const [r, g, b] = hexToRgb(c); return `rgba(${r},${g},${b},${a})`; });
}
export function lum(c) { return isHex(c) ? memo('l' + c, () => { const [r, g, b] = hexToRgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }) : 0.5; }
/** 외곽선 색: 바탕색을 어둡게 + 남보라 */
export function olc(c) { return isHex(c) ? memo('o' + c, () => mix(shade(c, -0.72), '#07030c', 0.45)) : '#07030c'; }

// ───────────────────────── 기본 도형 ─────────────────────────
export const F = (col) => G.tint || col;

/** 원통형 음영 그라디언트: (x0,y0)=역광 쪽 가장자리, (x1,y1)=반대편 */
export function grad(x0, y0, x1, y1, base, k = 1) {
  if (G.tint) return G.tint;
  if (!isHex(base)) return base;
  x0 = q2(x0); y0 = q2(y0); x1 = q2(x1); y1 = q2(y1);
  if (x0 === x1) x0 = x1 = 0; else if (y0 === y1) y0 = y1 = 0;   // 수직·수평 그라디언트는 다른 축 위치와 무관
  return gradMemo('g' + base + k + ',' + x0 + ',' + y0 + ',' + x1 + ',' + y1, () => gradStops(G.c.createLinearGradient(x0, y0, x1, y1), base, k));
}
function gradStops(g, base, k) {
  const L = lum(base);
  g.addColorStop(0, mx(base, RIM, Math.round((0.3 + (1 - L) * 0.32) * 20) / 20));
  g.addColorStop(0.17, sh(base, -0.2 * k));
  g.addColorStop(0.52, base);
  g.addColorStop(0.8, mx(base, KEY, 0.18));
  g.addColorStop(1, sh(base, -0.42 * k));
  return g;
}
/**
 * 현재 경로를 grad() 와 같은 원통 음영으로 채운다 — 매 프레임 끝점이 움직이는 천(망토·머리카락·스카프 띠)용.
 * 그라디언트는 (색, k)마다 단위 길이 (0,0)→(1,0) 하나만 만들고, 채우는 순간에만 변환으로 (x0,y0)→(x1,y1) 에 맞춘다
 * (경로는 만들 때의 변환으로 이미 고정되므로 모양은 그대로). 천이 움직여도 새 그라디언트 0 (#341)
 */
export function fillGrad(x0, y0, x1, y1, base, k = 1) {
  const c = G.c;
  const dx = x1 - x0, dy = y1 - y0;
  if (G.tint || !isHex(base) || dx * dx + dy * dy < 1e-4) { c.fillStyle = G.tint || base; c.fill(); return; }
  c.fillStyle = gradMemo('u' + base + k, () => gradStops(c.createLinearGradient(0, 0, 1, 0), base, k));
  c.save(); c.transform(dx, dy, -dy, dx, x0, y0); c.fill(); c.restore();
}
export function outline(base, w = G.olw) {
  if (G.tint || G.pass === 2) return;
  const c = G.c;
  c.lineWidth = G.pass === 1 ? w * 2.4 : w; c.strokeStyle = olc(base); c.stroke();
}
export function capsulePath(c, ax, ay, bx, by, r0, r1) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 0.001;
  const ang = Math.atan2(dy, dx);
  const off = Math.acos(clamp((r0 - r1) / d, -1, 1));
  c.beginPath();
  c.arc(ax, ay, r0, ang + off, ang - off + TAU);
  c.arc(bx, by, r1, ang - off, ang + off);
  c.closePath();
}
/** 음영 캡슐 (팔다리 등). k: 음영 강도 */
export function capsule(ax, ay, bx, by, r0, r1, base, k = 1, line = true) {
  const c = G.c;
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 0.001;
  let nx = -dy / d, ny = dx / d;
  if (nx * -0.8 + ny * -0.6 < 0) { nx = -nx; ny = -ny; }
  const cx = (ax + bx) / 2, cy = (ay + by) / 2, r = Math.max(r0, r1);
  capsulePath(c, ax, ay, bx, by, r0, r1);
  // 팔다리는 매 프레임 움직인다 → 단위 그라디언트 + 채울 때 변환 (좌표마다 새 그라디언트를 만들지 않게 — 마을 NPC·벡터 영웅, #341)
  if (G.pass !== 1) fillGrad(cx + nx * r, cy + ny * r, cx - nx * r, cy - ny * r, base, k);
  if (line) outline(base);
}
/** 방향 벡터 기준 음영으로 현재 path 채우기 (nx,ny = 역광 방향) */
export function fillShaded(base, cx, cy, nx, ny, r, k = 1, line = true) {
  fillGrad(cx + nx * r, cy + ny * r, cx - nx * r, cy - ny * r, base, k);
  if (line) outline(base);
}
export function ellipse(x, y, rx, ry, rot = 0) {
  const c = G.c;
  c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}
/** 가산 광원 */
export function glow(x, y, r, col, a = 1) {
  if (G.tint || !G.fx || a <= 0.01) return;
  const c = G.c;
  x = q2(x); y = q2(y); r = Math.max(0.5, q2(r)); a = Math.round(a * 20) / 20;
  const g = gradMemo('w' + col + a + ',' + x + ',' + y + ',' + r, () => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, ra(col, a)); g.addColorStop(0.4, ra(col, a * 0.35)); g.addColorStop(1, ra(col, 0));
    return g;
  });
  const op = c.globalCompositeOperation;
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.globalCompositeOperation = op;
}

// 리본(체인) 스크래치 버퍼
const LX = new Float32Array(96), LY = new Float32Array(96), RX = new Float32Array(96), RY = new Float32Array(96);
export const WS = new Float32Array(96);
/** P(평탄 [x,y]*n) 를 따라 반폭 W[i] 인 띠 경로 */
export function ribbonPath(c, P, n, W, capTip = false) {
  for (let i = 0; i < n; i++) {
    const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1;
    const tx = P[i1 * 2] - P[i0 * 2], ty = P[i1 * 2 + 1] - P[i0 * 2 + 1];
    const d = Math.hypot(tx, ty) || 1, nx = -ty / d, ny = tx / d, w = W[i];
    LX[i] = P[i * 2] + nx * w; LY[i] = P[i * 2 + 1] + ny * w;
    RX[i] = P[i * 2] - nx * w; RY[i] = P[i * 2 + 1] - ny * w;
  }
  c.beginPath();
  c.moveTo(LX[0], LY[0]);
  for (let i = 1; i < n - 1; i++) c.quadraticCurveTo(LX[i], LY[i], (LX[i] + LX[i + 1]) / 2, (LY[i] + LY[i + 1]) / 2);
  c.lineTo(LX[n - 1], LY[n - 1]);
  if (capTip) {
    const e = n - 1, px = P[e * 2], py = P[e * 2 + 1];
    const tx = px - P[(e - 1) * 2], ty = py - P[(e - 1) * 2 + 1], d = Math.hypot(tx, ty) || 1;
    c.quadraticCurveTo(px + (tx / d) * W[e] * 1.6, py + (ty / d) * W[e] * 1.6, RX[e], RY[e]);
  } else c.lineTo(RX[n - 1], RY[n - 1]);
  for (let i = n - 2; i > 0; i--) c.quadraticCurveTo(RX[i], RY[i], (RX[i] + RX[i - 1]) / 2, (RY[i] + RY[i - 1]) / 2);
  c.lineTo(RX[0], RY[0]);
  c.closePath();
}
/** 한쪽 가장자리만 (안감/하이라이트 선) */
export function ribbonEdge(c, P, n, W, side = 1, from = 0) {
  c.beginPath();
  for (let i = from; i < n; i++) {
    const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1;
    const tx = P[i1 * 2] - P[i0 * 2], ty = P[i1 * 2 + 1] - P[i0 * 2 + 1];
    const d = Math.hypot(tx, ty) || 1;
    const x = P[i * 2] - (ty / d) * W[i] * side, y = P[i * 2 + 1] + (tx / d) * W[i] * side;
    if (i === from) c.moveTo(x, y); else c.lineTo(x, y);
  }
}
/** 매끈한 닫힌 외곽 (중점 2차 곡선) — P 평탄 배열 */
export function smoothClosed(c, P, n) {
  c.beginPath();
  const lx = P[(n - 1) * 2], ly = P[(n - 1) * 2 + 1];
  c.moveTo((lx + P[0]) / 2, (ly + P[1]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    c.quadraticCurveTo(P[i * 2], P[i * 2 + 1], (P[i * 2] + P[j * 2]) / 2, (P[i * 2 + 1] + P[j * 2 + 1]) / 2);
  }
  c.closePath();
}
/** 결정적 의사난수 (시드 → 0~1) */
export function h01(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ───────────────────────── 무기 ─────────────────────────
// 무기 로컬 좌표: 손잡이(쥔 곳)=원점, +x 방향이 칼끝/총구/지팡이 머리
const BLADE_LEN = { sword: [48, 50, 52, 52, 54, 57], greatsword: [58, 61, 63, 64, 66, 70], dagger: [15, 18, 16, 15, 17, 19] };
const MUZZLE = [17, 15, 20, 14, 17, 21];
// 창: 자루 뒤끝 SPEAR_BUTT … 손잡이(0) … 물미(소켓) SPEAR_SOCK … 창끝 SPEAR_TIP[단계] (양손으로 쥐면 먼 손은 손잡이 뒤 render/hero.js SPEAR_GAP)
const SPEAR_TIP = [60, 62, 64, 64, 66, 68];
export const SPEAR_BUTT = -34, SPEAR_SOCK = 42;
/** 무기 끝(칼끝·총구·지팡이 머리·창끝)까지 거리 */
export function weaponReach(W) {
  const s = W.style - 1;
  if (W.type === 'sword' || W.type === 'greatsword' || W.type === 'dagger') return BLADE_LEN[W.type][s];
  if (W.type === 'gun') return MUZZLE[s] * 1.3;
  if (W.type === 'staff') return 32;
  if (W.type === 'spear') return SPEAR_TIP[s] ?? 62;
  return 10;
}
export function muzzleY() { return -2; }

function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function fillOl(col, k = 1) { const c = G.c; c.fillStyle = F(col); c.fill(); outline(col, G.olw * k); }
function metalGradY(y0, y1, col) {
  if (G.tint) return G.tint;
  y0 = q2(y0); y1 = q2(y1);
  return gradMemo('m' + col + ',' + y0 + ',' + y1, () => {
    const g = G.c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, sh(col, 0.6)); g.addColorStop(0.42, sh(col, 0.12)); g.addColorStop(0.55, sh(col, -0.22)); g.addColorStop(1, sh(col, -0.5));
    return g;
  });
}
function gem(x, y, r, col) {
  const c = G.c;
  c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.8, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.8, y); c.closePath();
  c.fillStyle = F(col); c.fill();
  if (!G.tint) { c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(x - r * 0.35, y - r * 0.5, r * 0.4, r * 0.35); glow(x, y, r * 4, col, 0.5); }
}

function grip(len, w, col, wrapCol) {
  const c = G.c;
  roundRectPath(c, -len, -w / 2, len, w, w * 0.4);
  c.fillStyle = metalGradY(-w / 2, w / 2, col); c.fill(); outline(col);
  if (!G.tint) {
    c.strokeStyle = ra(wrapCol, 0.7); c.lineWidth = 0.6;
    c.beginPath();
    for (let x = -len + 1.5; x < -0.5; x += 2) { c.moveTo(x, -w / 2); c.lineTo(x + 1.2, w / 2); }
    c.stroke();
  }
}

/** 장검/대검/단검 칼날 */
function blade(W, L, hw, b0, kind) {
  const c = G.c, s = W.style, col = W.blade;
  c.beginPath();
  if (kind === 'great' && s === 4) {
    // 플랑베르주(물결 날)
    const n = 8, e = L * 0.86;
    c.moveTo(b0, -hw);
    for (let i = 1; i <= n; i++) { const x = b0 + ((e - b0) * i) / n; c.quadraticCurveTo(x - (e - b0) / n / 2, -hw * (1 - (i / n) * 0.2) - (i % 2 ? 1.8 : -0.4), x, -hw * (1 - (i / n) * 0.2)); }
    c.lineTo(L, 0);
    for (let i = n; i >= 1; i--) { const x = b0 + ((e - b0) * (i - 1)) / n; c.quadraticCurveTo(x + (e - b0) / n / 2, hw * (1 - (i / n) * 0.2) + (i % 2 ? 1.8 : -0.4), x, hw * (1 - ((i - 1) / n) * 0.2)); }
  } else if (s === 6) {
    // 전설: 비대칭 톱니 등날 + 휘어진 칼끝
    c.moveTo(b0, -hw);
    const n = kind === 'dagger' ? 3 : 6;
    for (let i = 0; i < n; i++) { const x0 = b0 + ((L * 0.78 - b0) * i) / n, x1 = b0 + ((L * 0.78 - b0) * (i + 1)) / n; c.lineTo((x0 + x1) / 2, -hw - 1.6); c.lineTo(x1, -hw * 0.95); }
    c.quadraticCurveTo(L * 0.95, -hw * 0.9, L, hw * 0.2);
    c.quadraticCurveTo(L * 0.8, hw * 1.05, b0, hw);
  } else if (kind === 'dagger' && s === 3) {
    // 쿠크리(앞으로 굽은 날)
    c.moveTo(b0, -hw * 0.8); c.quadraticCurveTo(L * 0.55, -hw * 1.4, L, hw * 0.9); c.quadraticCurveTo(L * 0.6, hw * 1.8, b0, hw);
  } else if (kind === 'dagger' && s === 4) {
    // 쿠나이(잎사귀)
    c.moveTo(b0, -hw * 0.6); c.quadraticCurveTo(L * 0.45, -hw * 1.8, L, 0); c.quadraticCurveTo(L * 0.45, hw * 1.8, b0, hw * 0.6);
  } else if (kind === 'dagger' && s === 5) {
    c.moveTo(b0, -hw); c.quadraticCurveTo(L * 0.6, -hw * 1.3, L, -hw * 0.9); c.quadraticCurveTo(L * 0.7, hw * 0.9, b0, hw);
  } else {
    const shoulder = kind === 'dagger' && s === 1 ? 0.62 : 0.8;
    c.moveTo(b0, -hw); c.lineTo(L * shoulder, -hw * 0.92); c.lineTo(L, 0); c.lineTo(L * (shoulder + 0.02), hw * 0.9); c.lineTo(b0, hw);
  }
  c.closePath();
  if (G.tint) { c.fillStyle = G.tint; c.fill(); return; }
  const hq = q2(hw);
  c.fillStyle = gradMemo('b' + col + ',' + hq, () => {
    const g = c.createLinearGradient(0, -hq, 0, hq);
    g.addColorStop(0, sh(col, 0.62)); g.addColorStop(0.44, sh(col, 0.18)); g.addColorStop(0.52, sh(col, -0.18)); g.addColorStop(1, sh(col, -0.52));
    return g;
  });
  c.fill(); outline(col, G.olw * 0.9);
  // 풀러(홈) / 룬
  if (s === 2 || s === 3 || s === 5 || (kind === 'great' && s !== 4)) {
    c.strokeStyle = ra(sh(col, -0.45), 0.8); c.lineWidth = hw * 0.32;
    c.beginPath(); c.moveTo(b0 + 3, 0); c.lineTo(L * 0.62, 0); c.stroke();
  }
  if (s === 4 || s === 6) {
    const rc = W.glowC || (s === 6 ? '#ff2a44' : '#8ac8ff');
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = ra(rc, 0.85); c.lineWidth = 0.8;
    c.beginPath();
    for (let x = b0 + 4, i = 0; x < L * 0.7; x += 5.5, i++) {
      const y = (i % 2 ? -1 : 1) * hw * 0.25;
      c.moveTo(x, y - hw * 0.25); c.lineTo(x + 1.6, y); c.lineTo(x, y + hw * 0.25);
    }
    c.stroke(); c.restore();
  }
  if (s === 5) { c.strokeStyle = ra('#ffe9a0', 0.9); c.lineWidth = 0.6; c.beginPath(); c.moveTo(b0 + 2, -hw * 0.55); c.lineTo(L * 0.7, -hw * 0.45); c.stroke(); }
  // 날 끝 반짝임
  c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.55;
  c.beginPath(); c.moveTo(b0 + 1, -hw + 0.4); c.lineTo(L * 0.8, -hw * 0.92 + 0.4); c.stroke();
}

function guard(W, hw, kind) {
  const c = G.c, s = W.style, hc = W.hilt;
  const gw = kind === 'great' ? hw + 5 : kind === 'dagger' ? hw + 2 : hw + 3.5;
  c.beginPath();
  if (s === 1) { roundRectPath(c, -1.2, -gw, 2.6, gw * 2, 1); }
  else if (s === 2) { roundRectPath(c, -1, -gw, 2.2, gw * 2, 1); c.moveTo(0.1 + 1.8, -gw); c.arc(0.1, -gw, 1.8, 0, TAU); c.moveTo(0.1 + 1.8, gw); c.arc(0.1, gw, 1.8, 0, TAU); }
  else if (s === 3) { // 휘어진 금빛 가드
    c.moveTo(-1, -1.5); c.quadraticCurveTo(3, -gw * 0.7, 1, -gw - 1.5); c.quadraticCurveTo(-1, -gw * 0.6, -1.8, -1.2);
    c.lineTo(-1.8, 1.2); c.quadraticCurveTo(-1, gw * 0.6, 1, gw + 1.5); c.quadraticCurveTo(3, gw * 0.7, -1, 1.5); c.closePath();
  } else if (s === 4) { // 각진 흑철
    c.moveTo(-1.5, 0); c.lineTo(0.5, -gw - 2); c.lineTo(2.2, -gw * 0.4); c.lineTo(2.2, gw * 0.4); c.lineTo(0.5, gw + 2); c.closePath();
  } else if (s === 5) { // 날개 가드
    c.moveTo(1.5, -1); c.quadraticCurveTo(-2, -gw - 1, -7, -gw - 3); c.quadraticCurveTo(-3, -gw * 0.5, -1.5, -1);
    c.lineTo(-1.5, 1); c.quadraticCurveTo(-3, gw * 0.5, -7, gw + 3); c.quadraticCurveTo(-2, gw + 1, 1.5, 1); c.closePath();
  } else { // 6: 박쥐 날개 가드
    c.moveTo(1.8, -1.4); c.lineTo(-1, -gw - 3); c.lineTo(-2.2, -gw * 0.55); c.lineTo(-4, -gw * 0.7); c.lineTo(-2, -1);
    c.lineTo(-2, 1); c.lineTo(-4, gw * 0.7); c.lineTo(-2.2, gw * 0.55); c.lineTo(-1, gw + 3); c.lineTo(1.8, 1.4); c.closePath();
  }
  c.fillStyle = metalGradY(-gw, gw, hc); c.fill(); outline(hc, G.olw * 0.9);
  if (s >= 3) gem(0.3, 0, kind === 'dagger' ? 1.2 : 1.7, W.gem);
}

function paintSword(W, kind) {
  const c = G.c, s = W.style;
  const L = weaponReach(W);
  const hw = kind === 'great' ? 4.2 + s * 0.28 : kind === 'dagger' ? 1.9 + (s === 4 ? 0.3 : 0) : 2.1 + (s >= 3 ? 0.35 : 0) + (s === 6 ? 0.3 : 0);
  const gl = kind === 'great' ? 15 : kind === 'dagger' ? 6 : 9;
  // 손잡이 + 폼멜
  if (kind === 'dagger' && s === 4) {
    grip(gl, 2, '#2a2830', '#8a1a1a');
    c.beginPath(); c.arc(-gl - 2, 0, 2, 0, TAU); c.lineWidth = 1.1; c.strokeStyle = F(W.hilt); c.stroke();
  } else {
    grip(gl, kind === 'great' ? 3.2 : 2.5, W.grip, '#000000');
    ellipse(-gl - 1.2, 0, kind === 'great' ? 2.8 : 1.9, kind === 'great' ? 2.6 : 1.8);
    c.fillStyle = metalGradY(-2.5, 2.5, W.hilt); c.fill(); outline(W.hilt, 0.7);
    if (s >= 5) gem(-gl - 1.2, 0, 1, W.gem);
  }
  // 리카소(대검)
  if (kind === 'great' && s !== 4) { roundRectPath(c, 0, -hw * 0.75, 7, hw * 1.5, 1); c.fillStyle = metalGradY(-hw, hw, W.blade); c.fill(); outline(W.blade, 0.7); }
  blade(W, L, hw, kind === 'great' ? 5 : 1.5, kind);
  guard(W, hw, kind);
  if (kind === 'great' && s === 2) { // 츠바이핸더 패링 훅
    c.beginPath(); c.moveTo(7, -hw); c.quadraticCurveTo(9, -hw - 4, 11.5, -hw - 3.2); c.lineTo(10, -hw); c.closePath();
    c.moveTo(7, hw); c.quadraticCurveTo(9, hw + 4, 11.5, hw + 3.2); c.lineTo(10, hw); c.closePath();
    c.fillStyle = F(W.hilt); c.fill();
  }
}

function paintGun(W, fire) {
  const c = G.c, s = W.style, col = W.blade, L = MUZZLE[s - 1];
  const wood = s === 5 ? '#e8e0d0' : s === 6 ? '#1a1014' : '#5a3418';
  // 손잡이 (아래-뒤로 기울어짐)
  c.beginPath();
  if (s === 1) { c.moveTo(1, -1.2); c.quadraticCurveTo(-2, 1, -5.5, 6.5); c.lineTo(-2.2, 7.6); c.quadraticCurveTo(0.5, 3, 3.5, 1.2); }
  else { c.moveTo(1.5, -1); c.lineTo(-2.2, 6.4); c.quadraticCurveTo(-1.2, 8, 1.2, 7.4); c.lineTo(3.6, 1.3); }
  c.closePath(); c.fillStyle = grad(-3, 0, 3, 6, wood); c.fill(); outline(wood);
  // 방아쇠울
  if (!G.tint) { c.strokeStyle = sh(col, -0.3); c.lineWidth = 0.7; c.beginPath(); c.arc(3.4, 1.6, 1.6, 0, Math.PI); c.stroke(); }
  // 몸체/실린더/총열
  if (s === 1) {
    roundRectPath(c, -1, -2.8, 6, 3.6, 1); c.fillStyle = metalGradY(-2.8, 0.8, '#6a6470'); c.fill(); outline(col);
    roundRectPath(c, 3, -2.6, L - 3, 2.2, 1); c.fillStyle = metalGradY(-2.6, -0.4, col); c.fill(); outline(col);
    if (!G.tint) { c.fillStyle = '#b08a3a'; c.fillRect(7, -2.8, 1, 2.6); c.fillRect(12, -2.8, 1, 2.6); c.fillRect(L - 1.4, -2.9, 1.4, 2.8); }
    c.beginPath(); c.moveTo(-0.5, -2.6); c.lineTo(-2.4, -4.8); c.lineTo(-1, -5); c.lineTo(0.8, -2.8); fillOl('#4a4450');
  } else if (s === 4) {
    roundRectPath(c, -1.5, -3.6, 6, 5, 1.2); c.fillStyle = metalGradY(-3.6, 1.4, col); c.fill(); outline(col);
    roundRectPath(c, 3, -4.4, L - 3, 2.3, 0.8); c.fillStyle = metalGradY(-4.4, -2.1, col); c.fill(); outline(col);
    roundRectPath(c, 3, -2.1, L - 3, 2.3, 0.8); c.fillStyle = metalGradY(-2.1, 0.2, col); c.fill(); outline(col);
    if (!G.tint) { c.fillStyle = '#0a0808'; c.beginPath(); c.arc(L, -3.25, 0.8, 0, TAU); c.arc(L, -0.95, 0.8, 0, TAU); c.fill(); }
  } else {
    roundRectPath(c, -1.5, -3.4, 7.5, 4.6, 1.2); c.fillStyle = metalGradY(-3.4, 1.2, col); c.fill(); outline(col);
    // 실린더
    roundRectPath(c, 0.5, -3.8, 5, 4.4, 1.6);
    c.fillStyle = metalGradY(-3.8, 0.6, s === 6 ? '#3a2a1a' : sh(col, -0.1)); c.fill(); outline(col);
    if (!G.tint) {
      c.strokeStyle = ra(sh(col, -0.5), 0.8); c.lineWidth = 0.5; c.beginPath(); c.moveTo(2.2, -3.6); c.lineTo(2.2, 0.4); c.moveTo(3.8, -3.6); c.lineTo(3.8, 0.4); c.stroke();
      if (s === 6) { const gc = W.glowC || '#ffb040'; c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = ra(gc, 0.9); c.fillRect(1.5, -3, 3, 0.8); c.fillRect(1.5, -1.2, 3, 0.8); c.restore(); }
    }
    const bw = s === 3 || s === 6 ? 2.4 : 2.2;
    roundRectPath(c, 5.5, -3.2, L - 5.5, bw, 0.6); c.fillStyle = metalGradY(-3.2, -3.2 + bw, col); c.fill(); outline(col);
    if (s === 3 || s === 6) { roundRectPath(c, 6, -3.9, L - 7, 0.9, 0.3); c.fillStyle = F(sh(col, -0.2)); c.fill(); }
    if (s === 6) { c.beginPath(); c.moveTo(6, -0.8); c.lineTo(L + 3, -0.6); c.lineTo(6, 0.8); c.closePath(); c.fillStyle = metalGradY(-0.8, 0.8, '#e8d8a0'); c.fill(); outline('#c8a040', 0.6); }
    // 해머
    c.beginPath(); c.moveTo(-1, -3); c.lineTo(-3, -5); c.lineTo(-1.6, -5.4); c.lineTo(0.4, -3.4); fillOl(sh(col, -0.2), 0.7);
    if (s === 5 && !G.tint) { c.strokeStyle = ra('#e8c872', 0.9); c.lineWidth = 0.45; c.beginPath(); c.moveTo(6, -2.2); c.quadraticCurveTo(9, -3, 12, -2.2); c.moveTo(0, -1); c.quadraticCurveTo(2, 0.5, 5, -1); c.stroke(); }
    if (!G.tint) { c.fillStyle = sh(col, 0.5); c.fillRect(L - 1.2, -4, 1, 0.9); }
  }
  // 총구 화염
  if (fire > 0 && !G.tint) {
    const k = clamp(fire, 0, 1);
    c.save(); c.globalCompositeOperation = 'lighter';
    const mxp = L + 1, myp = -2;
    const r = 7 + 9 * k;
    const g = c.createRadialGradient(mxp, myp, 0, mxp, myp, r * 1.6);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.3, ra('#ffc860', 0.8 * k)); g.addColorStop(1, 'rgba(255,120,30,0)');
    c.fillStyle = g; c.fillRect(mxp - r * 1.6, myp - r * 1.6, r * 3.2, r * 3.2);
    c.fillStyle = ra('#fff4c0', 0.95);
    c.beginPath(); c.moveTo(mxp, myp - 2.4); c.lineTo(mxp + r * 1.9, myp); c.lineTo(mxp, myp + 2.4); c.lineTo(mxp + r * 0.5, myp);
    c.moveTo(mxp + 1, myp); c.lineTo(mxp + r * 0.7, myp - r * 0.8); c.lineTo(mxp + r * 0.45, myp);
    c.moveTo(mxp + 1, myp); c.lineTo(mxp + r * 0.7, myp + r * 0.8); c.lineTo(mxp + r * 0.45, myp);
    c.fill();
    c.restore();
  }
}

function paintStaff(W) {
  const c = G.c, s = W.style, col = W.blade, t = G.t;
  const gc = W.glowC || (s === 3 ? '#8ac8ff' : s === 6 ? '#d0a0ff' : '#fff2b0');
  // 자루
  const shaft = s <= 2 ? col : s === 6 ? '#2a1a3a' : sh(col, -0.1);
  roundRectPath(c, -30, -1, 54, 2, 1);
  c.fillStyle = metalGradY(-1, 1, shaft); c.fill(); outline(shaft, 0.8);
  if (!G.tint) {
    const bc = s >= 4 ? '#e8c872' : '#8a8a94';
    c.fillStyle = bc; c.fillRect(-31, -1.3, 2.2, 2.6); c.fillRect(-2.5, -1.3, 1, 2.6); c.fillRect(2, -1.3, 1, 2.6); c.fillRect(20, -1.5, 3, 3);
  }
  const hx = 24;
  glow(hx + 8, 0, 14 + (W.glowLv || 0) * 4, gc, 0.35 + 0.1 * Math.sin(t * 5));
  if (s === 1) { // 철 십자
    c.beginPath(); c.rect(hx, -1.4, 12, 2.8); c.rect(hx + 5, -5, 2.8, 10); fillOl('#9a9aa4', 0.8);
  } else if (s === 2) { // 로자리오 고리
    c.beginPath(); c.arc(hx + 6, 0, 5, 0, TAU); c.arc(hx + 6, 0, 3.6, 0, TAU, true); fillOl('#c8ccd4', 0.8);
    c.beginPath(); c.rect(hx + 2, -0.8, 8, 1.6); c.rect(hx + 5.2, -3.4, 1.6, 6.8); fillOl('#e8c872', 0.6);
    if (!G.tint) { c.fillStyle = '#c8b090'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(hx - 1 - i * 1.6, 2.5 + i * 1.3 + Math.sin(t * 3 + i) * 0.4, 0.8, 0, TAU); c.fill(); } }
  } else if (s === 3) { // 수정
    c.beginPath(); c.moveTo(hx, -1); c.quadraticCurveTo(hx + 4, -5, hx + 7, -4); c.moveTo(hx, 1); c.quadraticCurveTo(hx + 4, 5, hx + 7, 4);
    if (!G.tint) { c.strokeStyle = '#c8ccd4'; c.lineWidth = 1.2; c.stroke(); }
    c.beginPath(); c.moveTo(hx + 3, 0); c.lineTo(hx + 8, -3.8); c.lineTo(hx + 15, 0); c.lineTo(hx + 8, 3.8); c.closePath();
    c.fillStyle = G.tint || gradMemo('cr' + gc + ',' + q2(hx), () => { const g = c.createLinearGradient(q2(hx) + 3, -3, q2(hx) + 15, 3); g.addColorStop(0, '#e8fbff'); g.addColorStop(0.5, gc); g.addColorStop(1, '#2a5a9a'); return g; });
    c.fill(); outline('#4a8ac8', 0.6);
  } else if (s === 4) { // 성광 원반
    c.beginPath();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r = i % 2 ? 4.2 : 7.5; c.lineTo(hx + 7 + Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); fillOl('#e8c872', 0.7);
    ellipse(hx + 7, 0, 3.2, 3.2); c.fillStyle = F('#fff8e0'); c.fill();
  } else if (s === 5) { // 대천사: 날개 + 보주
    for (const sy of [-1, 1]) {
      c.beginPath(); c.moveTo(hx + 2, 0); c.quadraticCurveTo(hx - 3, sy * 8, hx - 9, sy * 10); c.quadraticCurveTo(hx - 3, sy * 4.5, hx + 1, sy * 3); c.quadraticCurveTo(hx - 2, sy * 5, hx - 6, sy * 6); c.quadraticCurveTo(hx, sy * 2, hx + 2, 0);
      fillOl('#f4f0e8', 0.6);
    }
    ellipse(hx + 7, 0, 4.2, 4.2); c.fillStyle = G.tint || gradMemo('ob' + gc + ',' + q2(hx), () => { const x = q2(hx), g = c.createRadialGradient(x + 6, -1.5, 0.5, x + 7, 0, 4.2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, gc); g.addColorStop(1, '#c8a040'); return g; }); c.fill(); outline('#c8a040', 0.6);
  } else { // 6: 초승달 + 별 + 궤도 고리
    c.beginPath(); c.arc(hx + 7, 0, 7, -2.2, 2.2); c.arc(hx + 9.5, 0, 5.5, 1.9, -1.9, true); c.closePath(); fillOl('#e8c872', 0.7);
    c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 1.5, r = i % 2 ? 1.4 : 3.4; c.lineTo(hx + 8 + Math.cos(a) * r, Math.sin(a) * r); } c.closePath();
    c.fillStyle = F('#fff0ff'); c.fill();
    if (!G.tint) {
      c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = ra(gc, 0.8); c.lineWidth = 0.6;
      ellipse(hx + 8, 0, 9, 3, t * 2); c.stroke(); ellipse(hx + 8, 0, 8, 2.6, -t * 1.6 + 1); c.stroke(); c.restore();
    }
  }
}

function paintWhipHandle(W) {
  const c = G.c, s = W.style;
  const hc = s >= 4 ? '#c8a040' : s >= 2 ? '#a8acb8' : '#6a5a4a';
  roundRectPath(c, -3, -1.3, 12, 2.6, 1.1);
  c.fillStyle = metalGradY(-1.3, 1.3, s >= 5 ? '#3a2a20' : '#2a1a12'); c.fill(); outline('#2a1a12', 0.8);
  if (!G.tint) { c.strokeStyle = ra('#000000', 0.5); c.lineWidth = 0.5; c.beginPath(); for (let x = -2; x < 8; x += 1.8) { c.moveTo(x, -1.3); c.lineTo(x + 1, 1.3); } c.stroke(); }
  roundRectPath(c, 8.5, -1.8, 2.2, 3.6, 0.8); c.fillStyle = metalGradY(-1.8, 1.8, hc); c.fill(); outline(hc, 0.6);
  ellipse(-3.8, 0, 1.9, 1.9); c.fillStyle = metalGradY(-1.9, 1.9, hc); c.fill(); outline(hc, 0.6);
  if (s >= 5) gem(-3.8, 0, 0.9, W.gem);
}

/** 창 (이졸데, 6단계): 자루 + 뒤끝 물미 + 소켓 + 용 갈기 술 + 창날. 손잡이(쥔 곳)=원점, +x 가 창끝 */
const SPEAR_SHAFT = ['#6a4a2a', '#5a3c22', '#3a3a46', '#2a262e', '#e8e4dc', '#1a1424'];
const SPEAR_MANE = ['#c01828', '#6ad0e0', '#6ad0e0', '#c01828', '#ffd870', '#ff3a5a'];
function paintSpear(W) {
  const c = G.c, s = W.style, t = G.t, L = weaponReach(W), x0 = SPEAR_SOCK, B = SPEAR_BUTT;
  const shaft = SPEAR_SHAFT[s - 1] ?? SPEAR_SHAFT[0], mane = s >= 3 && W.glowC ? W.glowC : SPEAR_MANE[s - 1] ?? SPEAR_MANE[0];
  // 자루
  roundRectPath(c, B, -1.15, x0 - B, 2.3, 1.1);
  c.fillStyle = metalGradY(-1.15, 1.15, shaft); c.fill(); outline(shaft, 0.8);
  if (!G.tint) {
    // 두 손이 쥐는 곳의 감개 · 쇠띠
    c.strokeStyle = ra(s === 5 ? '#c8a040' : '#1a1210', 0.75); c.lineWidth = 0.55;
    c.beginPath();
    for (const [a, b] of [[-3, 4], [-19, -10]]) for (let x = a; x < b; x += 1.6) { c.moveTo(x, -1.15); c.lineTo(x + 1, 1.15); }
    c.stroke();
    c.fillStyle = s >= 5 ? '#e8c872' : '#9a9aa4'; c.fillRect(9, -1.4, 1.2, 2.8); c.fillRect(25, -1.4, 1.2, 2.8);
    if (s === 6) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = ra(W.glowC || '#ff3a5a', 0.8); for (let x = -8; x < 36; x += 7) c.fillRect(x, -0.35, 3, 0.7); c.restore(); }
  }
  // 뒤끝 물미
  c.beginPath(); c.moveTo(B + 0.6, -1.5); c.lineTo(B - 3.6, 0); c.lineTo(B + 0.6, 1.5); c.closePath();
  c.fillStyle = metalGradY(-1.5, 1.5, W.hilt); c.fill(); outline(W.hilt, 0.6);
  // 용 갈기: 소켓에서 자루를 따라 뒤로 흩날리는 술 세 가닥 (흔들림은 결정적 — 그리기 코드에 난수 없음)
  for (let i = 0; i < 3; i++) {
    const sw = Math.sin(t * 6.5 + i * 1.3) * 1.2, ex = x0 - 12 - i * 2.6, ey = 3.4 + i * 1.9 + sw;
    c.beginPath(); c.moveTo(x0 - 0.5, -0.6 + i * 0.5);
    c.quadraticCurveTo(x0 - 5, 1.2 + i * 0.6 + sw * 0.4, ex, ey);
    c.quadraticCurveTo(x0 - 5.5, 2.6 + i * 0.8 + sw * 0.3, x0 - 0.5, 1 + i * 0.4);
    c.closePath(); c.fillStyle = F(i === 1 ? sh(mane, 0.25) : mane); c.fill();
  }
  // 소켓
  roundRectPath(c, x0 - 2.2, -2, 5.2, 4, 1);
  c.fillStyle = metalGradY(-2, 2, W.hilt); c.fill(); outline(W.hilt, 0.7);
  if (s >= 3) gem(x0 + 0.4, 0, 1.15, W.gem);
  // 창날
  const b = x0 + 3, col = W.blade;
  const hw = [2.9, 3.0, 2.5, 3.2, 3.0, 3.4][s - 1] ?? 3;
  c.beginPath();
  if (s === 1) {   // 버들잎
    c.moveTo(b, -1.3); c.quadraticCurveTo(b + (L - b) * 0.42, -hw * 1.35, L, 0); c.quadraticCurveTo(b + (L - b) * 0.42, hw * 1.35, b, 1.3);
  } else if (s === 2) {   // 날개 창: 밑동 양쪽 귀
    c.moveTo(b, -1.3); c.lineTo(b + 1.5, -hw - 2.6); c.lineTo(b + 3, -1.6); c.quadraticCurveTo(b + (L - b) * 0.5, -hw * 1.2, L, 0);
    c.quadraticCurveTo(b + (L - b) * 0.5, hw * 1.2, b + 3, 1.6); c.lineTo(b + 1.5, hw + 2.6); c.lineTo(b, 1.3);
  } else if (s === 3) {   // 곧은 용 송곳니
    c.moveTo(b, -hw); c.lineTo(L * 0.86, -hw * 0.8); c.lineTo(L, 0); c.lineTo(L * 0.86, hw * 0.8); c.lineTo(b, hw);
  } else if (s === 4) {   // 파르티잔: 가운데 날 + 휘어진 곁날
    c.moveTo(b, -1.4); c.quadraticCurveTo(b + 2, -hw - 3.5, b - 1, -hw - 5.5); c.quadraticCurveTo(b + 5, -hw - 2.5, b + 6, -1.8);
    c.lineTo(L * 0.82, -hw * 0.7); c.lineTo(L, 0); c.lineTo(L * 0.82, hw * 0.7); c.lineTo(b + 6, 1.8);
    c.quadraticCurveTo(b + 5, hw + 2.5, b - 1, hw + 5.5); c.quadraticCurveTo(b + 2, hw + 3.5, b, 1.4);
  } else if (s === 5) {   // 용익창: 금빛 날개 받침 위의 긴 날
    c.moveTo(b, -1.5); c.quadraticCurveTo(b - 2, -hw - 4, b - 6, -hw - 5); c.quadraticCurveTo(b - 1, -hw - 1.5, b + 3, -hw * 0.9);
    c.quadraticCurveTo(b + (L - b) * 0.6, -hw * 1.05, L, 0); c.quadraticCurveTo(b + (L - b) * 0.6, hw * 1.05, b + 3, hw * 0.9);
    c.quadraticCurveTo(b - 1, hw + 1.5, b - 6, hw + 5); c.quadraticCurveTo(b - 2, hw + 4, b, 1.5);
  } else {   // 6: 톱니 등날의 비대칭 날
    c.moveTo(b, -hw);
    for (let i = 0; i < 4; i++) { const xa = b + ((L * 0.8 - b) * i) / 4, xb = b + ((L * 0.8 - b) * (i + 1)) / 4; c.lineTo((xa + xb) / 2, -hw - 1.8); c.lineTo(xb, -hw * 0.9); }
    c.quadraticCurveTo(L * 0.95, -hw * 0.7, L, hw * 0.15); c.quadraticCurveTo(L * 0.82, hw * 1.1, b, hw);
  }
  c.closePath();
  c.fillStyle = metalGradY(-hw - 2, hw + 2, col); c.fill(); outline(col, G.olw * 0.9);
  if (!G.tint) {
    c.strokeStyle = ra(sh(col, -0.45), 0.8); c.lineWidth = 0.5;   // 가운데 능선
    c.beginPath(); c.moveTo(b + 2, 0); c.lineTo(L - 3, 0); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(b + 3, -hw * 0.55); c.lineTo(L - 4, -0.5); c.stroke();
    if (s >= 5) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = ra(W.glowC || (s === 6 ? '#ff2a44' : '#8ae8ff'), 0.8); c.lineWidth = 0.7; c.beginPath(); for (let x = b + 4, i = 0; x < L - 6; x += 4.5, i++) { const y = (i % 2 ? -1 : 1) * hw * 0.3; c.moveTo(x, y - hw * 0.2); c.lineTo(x + 1.4, y); c.lineTo(x, y + hw * 0.2); } c.stroke(); c.restore(); }
  }
}

/** 강화/희귀도 발광: 칼날 따라 + 불꽃/번개 + 무지개 (무기 로컬 좌표, 길이 L) */
/** +13 무지개 발광: 무기 길이를 따라 흐르는 색상환 그라디언트 */
export function prism(x0, y0, x1, y1, t, l = 70) {
  const g = G.c.createLinearGradient(x0, y0, x1, y1), h = (t * 160) % 360;
  for (let i = 0; i <= 4; i++) g.addColorStop(i / 4, `hsl(${(h + i * 80) % 360},100%,${l}%)`);
  return g;
}
/** 강화 발광: wm = 무기 계열별 폭 배율 (단검·총은 작게) */
function weaponAura(W, L, base, wm = 1) {
  const lv = W.glowLv || 0;
  if (!lv || G.tint || !G.fx) return;
  const c = G.c, t = G.t;
  let col = W.glowC || '#ffd070';
  if (lv >= 3) col = prism(base, 0, L, 0, t);
  c.save(); c.globalCompositeOperation = 'lighter';
  const pulse = 0.65 + 0.35 * Math.sin(t * 7);
  c.lineCap = 'round';
  // 바깥 번짐 → 안쪽 심지 (두 겹)
  c.strokeStyle = lv >= 3 ? col : ra(col, 0.2 * pulse); c.lineWidth = (4.5 + lv * 1.3) * wm;
  if (lv >= 3) c.globalAlpha = 0.22 * pulse;
  c.beginPath(); c.moveTo(base, 0); c.lineTo(L, 0); c.stroke();
  c.globalAlpha = 1;
  c.strokeStyle = lv >= 3 ? col : ra(col, 0.3 * pulse); c.lineWidth = (2.2 + lv * 0.5) * wm;
  if (lv >= 3) c.globalAlpha = 0.35;
  c.beginPath(); c.moveTo(base, 0); c.lineTo(L, 0); c.stroke();
  c.globalAlpha = 1;
  if (lv >= 2) {
    if (W.element === 'thunder' || W.element === 'ice' || W.element === 'holy') {
      // 번개 줄기
      c.strokeStyle = ra(W.element === 'ice' ? '#dff8ff' : '#e8f4ff', 0.9); c.lineWidth = 0.7;
      c.beginPath();
      const seed = Math.floor(t * 18);
      for (let k = 0; k < 2; k++) {
        let x = base + h01(seed + k * 7) * (L - base) * 0.2, y = 0;
        c.moveTo(x, y);
        for (let i = 0; i < 5; i++) { x += (L - base) * 0.16; y = (h01(seed * 3 + i + k * 11) - 0.5) * 9 * Math.max(0.5, wm); c.lineTo(x, y); }
      }
      c.stroke();
    } else {
      // 불꽃 혀
      const fc = W.element === 'dark' ? '#b060ff' : W.element === 'blood' ? '#ff2a44' : '#ff8a2a';
      for (let i = 0; i < 6; i++) {
        const u = (i + 0.5) / 6, x = base + (L - base) * u;
        const ph = (t * 3 + i * 0.37) % 1;
        const hgt = (5 + 5 * h01(i + 3)) * (1 - ph) * Math.max(0.5, wm);
        c.fillStyle = ra(fc, 0.55 * (1 - ph));
        c.beginPath(); c.moveTo(x - 2, -1); c.quadraticCurveTo(x - 1, -hgt * 0.6, x + 1.5 - ph * 3, -hgt); c.quadraticCurveTo(x + 1, -hgt * 0.5, x + 2.2, -1); c.fill();
      }
    }
  }
  if (lv >= 3) {
    for (let i = 0; i < 3; i++) {
      const u = ((t * 0.9 + i / 3) % 1), x = base + (L - base) * u, s = 1.8 * Math.sin(u * Math.PI) * Math.max(0.6, wm);
      c.fillStyle = `hsla(${(t * 300 + i * 120) % 360},100%,80%,0.9)`;
      c.beginPath(); c.moveTo(x, -s * 2); c.lineTo(x + s * 0.5, 0); c.lineTo(x, s * 2); c.lineTo(x - s * 0.5, 0); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x - s * 2, 0); c.lineTo(x, s * 0.5); c.lineTo(x + s * 2, 0); c.lineTo(x, -s * 0.5); c.closePath(); c.fill();
    }
  }
  c.restore();
}

/**
 * 손에 든 무기 그리기 (x,y 손 위치, ang 방향)
 * opt: { fire(총구화염 0~1), flipY(역수), which }
 */
export function drawWeapon(W, x, y, ang, opt) {
  const c = G.c;
  c.save();
  c.translate(x, y); c.rotate(ang);
  if (opt && opt.flipY) c.scale(1, -1);
  const type = W.type;
  if (type === 'sword') { paintSword(W, 'sword'); weaponAura(W, weaponReach(W), 3, 0.9); }
  else if (type === 'greatsword') { paintSword(W, 'great'); weaponAura(W, weaponReach(W), 6, 1.1); }
  else if (type === 'dagger') { paintSword(W, 'dagger'); weaponAura(W, weaponReach(W), 2, 0.55); }
  else if (type === 'gun') { c.scale(1.3, 1.3); paintGun(W, opt?.fire ?? 0); weaponAura(W, MUZZLE[W.style - 1], 1, 0.42); }
  else if (type === 'staff') { paintStaff(W); weaponAura(W, 36, 20, 0.9); }
  else if (type === 'spear') { paintSpear(W); weaponAura(W, weaponReach(W), SPEAR_SOCK - 8, 0.75); }
  else if (type === 'whip') paintWhipHandle(W);
  c.restore();
}

/** 채찍 끈: P 평탄 점 배열(n개, 손잡이 끝 → 채찍 끝) */
export function drawLash(W, P, n, extend = 1) {
  const c = G.c, s = W.style, col = W.blade;
  if (n < 2) return;
  // 발광(강화)
  if ((W.glowLv || s >= 5) && !G.tint && G.fx) {
    const gc = W.glowLv >= 3 ? prism(P[0], P[1], P[(n - 1) * 2], P[(n - 1) * 2 + 1], G.t) : (W.glowC || (s === 6 ? '#ff2a44' : '#fff2b0'));
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    c.globalAlpha = 0.22 + 0.08 * (W.glowLv || 0);
    c.strokeStyle = gc; c.lineWidth = 5 + (W.glowLv || 0) * 1.5;
    c.beginPath(); c.moveTo(P[0], P[1]); for (let i = 1; i < n; i++) c.lineTo(P[i * 2], P[i * 2 + 1]); c.stroke();
    c.restore();
  }
  if (s <= 2 || G.tint) {
    // 가죽 끈: 가늘어지는 띠
    for (let i = 0; i < n; i++) WS[i] = lerp(s === 2 ? 1.7 : 1.5, 0.45, Math.pow(i / (n - 1), 0.85)) * extend;
    ribbonPath(c, P, n, WS, true);
    if (!G.tint) { c.lineWidth = 1.2; c.strokeStyle = olc(col); c.stroke(); }
    c.fillStyle = F(col); c.fill();
    if (!G.tint) {
      // 윗면 광택
      c.strokeStyle = ra(sh(col, 0.55), 0.85); c.lineWidth = 0.55;
      c.beginPath(); c.moveTo(P[0], P[1] - WS[0] * 0.4); for (let i = 1; i < n - 1; i++) c.lineTo(P[i * 2], P[i * 2 + 1] - WS[i] * 0.45); c.stroke();
      // 꼬임 무늬
      c.strokeStyle = ra(sh(col, 0.35), 0.8); c.lineWidth = 0.5;
      c.beginPath();
      for (let i = 1; i < n - 2; i += 1) {
        const x = P[i * 2], y = P[i * 2 + 1], x2 = P[i * 2 + 2], y2 = P[i * 2 + 3];
        c.moveTo(x, y - WS[i] * 0.5); c.lineTo((x + x2) / 2, (y + y2) / 2 + WS[i] * 0.4);
      }
      c.stroke();
      if (s === 2) { const e = (n - 1) * 2; ellipse(P[e], P[e + 1], 1.2, 1.2); c.fillStyle = '#c8ccd4'; c.fill(); }
    }
    return;
  }
  // 사슬 채찍: 고리 연결
  const metal = s === 5 ? '#e8c872' : s === 6 ? '#8a0a1e' : col;
  c.lineCap = 'round';
  c.strokeStyle = olc(metal); c.lineWidth = 1.8;
  c.beginPath(); c.moveTo(P[0], P[1]); for (let i = 1; i < n; i++) c.lineTo(P[i * 2], P[i * 2 + 1]); c.stroke();
  let acc = 0, k = 0;
  for (let i = 1; i < n; i++) {
    const x0 = P[i * 2 - 2], y0 = P[i * 2 - 1], x1 = P[i * 2], y1 = P[i * 2 + 1];
    const seg = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.atan2(y1 - y0, x1 - x0);
    while (acc <= seg) {
      const u = seg > 0 ? acc / seg : 0, lx = x0 + (x1 - x0) * u, ly = y0 + (y1 - y0) * u;
      const big = k % 2 === 0;
      const sz = lerp(1, 0.75, i / n) * extend;
      ellipse(lx, ly, 2.3 * sz, (big ? 1.25 : 0.55) * sz, a);
      c.fillStyle = big ? sh(metal, 0.15) : sh(metal, -0.25); c.fill();
      if (big) { c.lineWidth = 0.45; c.strokeStyle = olc(metal); c.stroke(); }
      if (s === 6 && k % 3 === 0) { // 가시
        c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + Math.cos(a - 1.2) * 3, ly + Math.sin(a - 1.2) * 3); c.lineTo(lx + Math.cos(a) * 1.2, ly + Math.sin(a) * 1.2);
        c.fillStyle = '#e8d8c8'; c.fill();
      }
      acc += 3.6; k++;
    }
    acc -= seg;
  }
  // 끝 장식
  const e = (n - 1) * 2, ex = P[e], ey = P[e + 1];
  const ta = Math.atan2(ey - P[e - 1], ex - P[e - 2]);
  if (s === 4) { // 모닝스타
    c.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + G.t * 6, r = i % 2 ? 3 : 5.2; c.lineTo(ex + Math.cos(ta) * 2 + Math.cos(a) * r, ey + Math.sin(ta) * 2 + Math.sin(a) * r); }
    c.closePath();
    c.fillStyle = metalGradY(ey - 5, ey + 5, '#c8ccd4'); c.fill(); outline('#8a8e9a', 0.6);
  } else if (s === 5) { // 성십자
    c.save(); c.translate(ex, ey); c.rotate(ta);
    c.beginPath(); c.rect(0, -0.9, 7, 1.8); c.rect(1.6, -3, 1.8, 6); c.fillStyle = '#fff4c8'; c.fill(); outline('#c8a040', 0.5);
    c.restore(); glow(ex, ey, 10, '#fff2b0', 0.6);
  } else if (s === 6) {
    c.save(); c.translate(ex, ey); c.rotate(ta);
    c.beginPath(); c.moveTo(-1, -2.6); c.lineTo(7, 0); c.lineTo(-1, 2.6); c.closePath(); c.fillStyle = '#c0142a'; c.fill(); outline('#c0142a', 0.5);
    c.restore(); glow(ex, ey, 9, '#ff2a44', 0.6);
  } else {
    c.save(); c.translate(ex, ey); c.rotate(ta);
    c.beginPath(); c.moveTo(-1, -1.8); c.lineTo(4.5, 0); c.lineTo(-1, 1.8); c.closePath(); c.fillStyle = '#c8ccd4'; c.fill();
    c.restore();
  }
}

/** 허리에 감아 둔 채찍 (대기 중) — 원점=허리 옆 */
export function drawWhipCoil(W, x, y, sway) {
  const c = G.c, s = W.style;
  const col = s <= 2 ? W.blade : s === 5 ? '#e8c872' : s === 6 ? '#8a0a1e' : W.blade;
  c.save(); c.translate(x, y); c.rotate(sway * 0.3);
  for (let i = 0; i < 3; i++) {
    ellipse(0.5 + i * 0.5, 6 + i * 0.8, 5.4 - i * 0.5, 3.8 - i * 0.3, 0.25);
    c.lineWidth = s <= 2 ? 1.5 : 1.9; c.strokeStyle = F(i === 1 ? sh(col, 0.15) : col); c.stroke();
  }
  if (!G.tint && s >= 3) { c.setLineDash([1.2, 1.2]); c.lineWidth = 0.6; c.strokeStyle = sh(col, 0.5); ellipse(1, 6.8, 4.9, 3.5, 0.25); c.stroke(); c.setLineDash([]); }
  // 손잡이 (비스듬히 꽂힘)
  c.translate(3, 2); c.rotate(-1.9);
  paintWhipHandle(W);
  c.restore();
}

// ───────────────────────── 날개 ─────────────────────────
const WING_COL = {
  bat: ['#1a0e1c', '#5a1a2e', '#2a1a24'], demon: ['#2a0808', '#b01020', '#3a1010'],
  angel: ['#ffffff', '#e8e0d0', '#fff2b0'], crow: ['#14121c', '#2a2a44', '#6a6aff'],
  bone: ['#e8e0cc', '#8a8070', '#6affb0'], seraph: ['#ffffff', '#e8e0f0', '#fff2b0'],
};
/**
 * 날개 1장. 원점=등 부착점, 로컬 +x = 몸 뒤쪽 바깥, -y = 위.
 * spread 0(접힘)~1(활짝), far: 뒤쪽 날개(어둡게)
 */
export function drawWing(type, spread, flap, far, dark) {
  const c = G.c, t = G.t;
  let cols = WING_COL[type] || WING_COL.bat;
  if (type === 'seraph' && far) cols = ['#241832', '#4a2a6a', '#b060ff'];
  const [c0, c1, gc] = cols;
  c.save();
  c.rotate(-0.35 - spread * 0.5 + flap);
  c.scale(0.62 + spread * 0.42, 0.8 + spread * 0.2);
  const k = far ? -0.3 : 0;
  if (type === 'bat' || type === 'demon') {
    const big = type === 'demon' ? 1.15 : 1;
    c.scale(big, big);
    const wx = 15, wy = -19;
    const tips = [[43, -24], [48, -6], [40, 10], [24, 17]];
    // 막
    c.beginPath(); c.moveTo(0, 0); c.lineTo(wx, wy);
    c.lineTo(tips[0][0], tips[0][1]);
    for (let i = 1; i < tips.length; i++) {
      const [px, py] = tips[i - 1], [qx, qy] = tips[i];
      c.quadraticCurveTo((px + qx) / 2 - (px + qx - 2 * wx) * 0.18, (py + qy) / 2 - (py + qy - 2 * wy) * 0.18, qx, qy);
    }
    c.quadraticCurveTo(12, 14, 2, 10);
    c.closePath();
    if (G.tint) { c.fillStyle = G.tint; c.fill(); }
    else {
      // 막 음영 그라디언트는 좌표가 고정 → (색, 명암)별 1개 (프레임마다 새로 만들지 않음, #341)
      c.fillStyle = gradMemo('wm' + c0 + c1 + k, () => {
        const g = c.createLinearGradient(0, -20, 40, 20);
        g.addColorStop(0, sh(c1, k)); g.addColorStop(0.55, sh(c0, k + 0.05)); g.addColorStop(1, sh(c0, k - 0.2));
        return g;
      });
      c.fill(); outline(c0, 0.8);
      // 뼈대
      c.strokeStyle = sh(c1, 0.25 + k); c.lineWidth = 1.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(wx, wy);
      for (const [x, y] of tips) { c.moveTo(wx, wy); c.lineTo(x, y); }
      c.stroke();
      if (type === 'demon') { c.fillStyle = '#e8d8c8'; c.beginPath(); c.moveTo(wx - 1, wy); c.lineTo(wx + 1, wy - 5); c.lineTo(wx + 2.5, wy + 0.5); c.fill(); }
    }
  } else if (type === 'bone') {
    const wx = 15, wy = -19;
    c.lineCap = 'round';
    const tips = [[42, -22], [46, -6], [38, 9], [24, 16]];
    if (!G.tint) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = ra(gc, 0.18); c.lineWidth = 6; c.beginPath(); c.moveTo(0, 0); c.lineTo(wx, wy); for (const [x, y] of tips) { c.moveTo(wx, wy); c.lineTo(x, y); } c.stroke(); c.restore(); }
    c.strokeStyle = F(sh(c0, k)); c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(wx, wy); for (const [x, y] of tips) { c.moveTo(wx, wy); c.lineTo(x, y); } c.stroke();
    // 너덜한 뼈 깃
    c.lineWidth = 1.2;
    c.beginPath();
    for (let i = 0; i < 7; i++) { const u = i / 6, x = lerp(4, 36, u), y = lerp(-5, -18, u) + u * u * 10; c.moveTo(x, y); c.lineTo(x + 3 + u * 3, y + 12 - u * 2); }
    c.stroke();
    if (!G.tint) for (const [x, y] of tips) { c.fillStyle = sh(c0, 0.2); c.beginPath(); c.arc(x, y, 1.3, 0, TAU); c.fill(); }
  } else {
    // 깃털 날개: 천사 / 까마귀 / 세라프
    const crow = type === 'crow' || (type === 'seraph' && far);
    const rows = [[34, 0.0, sh(c1, k - 0.12)], [24, 0.5, sh(c1, k)], [13, 1.0, sh(c0, k)]];
    for (const [flen, row, col] of rows) {
      const N = 10;
      for (let i = N - 1; i >= 0; i--) {
        const u = i / (N - 1);
        // 앞전(날개 윗선) 베지어: (0,0) → (18,-24) → (46,-12)
        const bx = 2 * (1 - u) * u * 18 + u * u * 46, by = 2 * (1 - u) * u * -26 + u * u * -12;
        const a = lerp(1.75, 0.32, Math.pow(u, 0.9)) + Math.sin(t * 2 + i) * 0.03;
        const len = flen * lerp(0.62, 1.05, u) * (row === 1 ? 0.75 : 1);
        const w = row === 1 ? 2.2 : 3.1;
        const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len;
        const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
        c.beginPath();
        c.moveTo(bx, by);
        c.quadraticCurveTo(bx + (tx - bx) * 0.5 + nx, by + (ty - by) * 0.5 + ny, tx, ty);
        if (crow) c.lineTo(tx - Math.cos(a) * 3 + nx * 0.4, ty - Math.sin(a) * 3 + ny * 0.4);
        c.quadraticCurveTo(bx + (tx - bx) * 0.5 - nx, by + (ty - by) * 0.5 - ny, bx, by);
        c.fillStyle = F(col); c.fill();
        if (!G.tint) { c.lineWidth = 0.45; c.strokeStyle = crow ? ra('#000000', 0.7) : ra(sh(c1, -0.45), 0.7); c.stroke(); }
      }
    }
    // 윗선 두께
    c.beginPath(); c.moveTo(-1, 2); c.quadraticCurveTo(18, -28, 46, -12); c.quadraticCurveTo(20, -20, 2, 5);
    c.fillStyle = F(sh(c0, k + 0.05)); c.fill();
    if (!G.tint && crow) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = ra(gc, 0.35); c.lineWidth = 0.8; c.beginPath(); c.moveTo(4, -6); c.quadraticCurveTo(20, -22, 44, -12); c.stroke(); c.restore(); }
  }
  c.restore();
  if (!G.tint && !far && (type === 'angel' || type === 'seraph')) glow(14, -14, 30, gc, 0.18);
  if (!G.tint && (type === 'bone')) glow(14, -10, 26, gc, 0.12);
  if (!G.tint && type === 'demon') glow(18, -6, 22, '#ff2a1a', 0.12);
  void dark;
}

// ───────────────────────── 오라 / 마법진 ─────────────────────────
/** 몸 주변 오라 입자 (원점=발 중앙, 로컬 좌표). k: 강도 */
export function drawAuraMotes(type, col, k, n = 8, h = 80) {
  if (G.tint || !G.fx) return;
  const c = G.c, t = G.t;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const seed = i * 1.618;
    const period = type === 'ice' ? 2.6 : type === 'fire' ? 1.1 : type === 'thunder' ? 0.45 : 1.8;
    const ph = (t / period + h01(seed)) % 1;
    const side = (h01(seed + 4) - 0.5) * 2;
    let x = side * (16 + 10 * h01(seed + 2)), y;
    const fade = Math.sin(ph * Math.PI) * k;
    if (type === 'ice') { y = -h * (1 - ph) - 5; x += Math.sin(t * 2 + i) * 4; }
    else if (type === 'blood') { y = -10 - ph * h * 0.9; x += Math.sin(t * 3 + i * 2) * 3; }
    else { y = -6 - ph * h; x += Math.sin(t * 2.5 + i * 1.3) * (type === 'dark' ? 6 : 3); }
    if (type === 'fire') {
      const r = 1.6 * (1 - ph) + 0.6;
      c.fillStyle = ra(ph < 0.4 ? '#ffe0a0' : col, 0.85 * fade);
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    } else if (type === 'holy') {
      const s = 1.8 * fade + 0.4;
      c.fillStyle = ra(col, 0.95 * fade);
      c.beginPath(); c.moveTo(x, y - s * 2); c.lineTo(x + s * 0.45, y); c.lineTo(x, y + s * 2); c.lineTo(x - s * 0.45, y); c.closePath();
      c.moveTo(x - s * 2, y); c.lineTo(x, y + s * 0.45); c.lineTo(x + s * 2, y); c.lineTo(x, y - s * 0.45); c.closePath(); c.fill();
    } else if (type === 'dark') {
      // 원형 그라디언트는 색마다 단위 반경 1개만 만들고 변환(크기)·globalAlpha(세기)로 그린다
      // (#341: 입자 8개가 매 프레임 새 그라디언트 8개를 만들어 저사양 예산 6/프레임을 혼자 넘겼다)
      const r = 3 + 5 * ph, a = Math.min(1, 0.42 * fade);
      if (a > 0.004) {
        const ga = c.globalAlpha;
        c.fillStyle = gradMemo('am' + col, () => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, ra(col, 1)); g.addColorStop(1, ra(col, 0)); return g; });
        c.translate(x, y); c.scale(r, r); c.globalAlpha = ga * a;
        c.fillRect(-1, -1, 2, 2);
        c.globalAlpha = ga; c.scale(1 / r, 1 / r); c.translate(-x, -y);
      }
    } else if (type === 'ice') {
      const s = 1.5 + h01(seed + 9);
      c.strokeStyle = ra(col, 0.9 * fade); c.lineWidth = 0.6;
      c.beginPath();
      for (let j = 0; j < 3; j++) { const a = (j / 3) * Math.PI + t; c.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s); c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); }
      c.stroke();
    } else if (type === 'blood') {
      c.fillStyle = ra(col, 0.75 * fade);
      c.beginPath(); c.ellipse(x, y, 1.1, 1.8, 0, 0, TAU); c.fill();
    } else if (type === 'thunder') {
      if (h01(Math.floor(t * 12) + i * 3) > 0.55) {
        c.strokeStyle = ra(col, 0.95 * k); c.lineWidth = 0.7;
        c.beginPath(); let xx = x, yy = -20 - h01(i + Math.floor(t * 12)) * h * 0.7; c.moveTo(xx, yy);
        for (let j = 0; j < 4; j++) { xx += (h01(i * 5 + j + Math.floor(t * 20)) - 0.5) * 8; yy += 4; c.lineTo(xx, yy); }
        c.stroke();
      }
    }
  }
  c.restore();
}

/** 바닥 마법진 (원점 기준, r 반경, 원근 납작) */
export function drawMagicCircle(x, y, r, col, k, flat = 0.3, spin = 1) {
  if (G.tint || !G.fx || k <= 0.01) return;
  const c = G.c, t = G.t;
  c.save(); c.globalCompositeOperation = 'lighter';
  c.translate(x, y); c.scale(1, flat);
  // 바닥 빛: 색마다 단위 반경 그라디언트 1개(세기는 globalAlpha) — 시전 중 매 프레임 새 그라디언트를 만들지 않게 (#341)
  c.save(); c.scale(r * 1.2, r * 1.2); c.globalAlpha *= Math.min(1, 0.3 * k);
  c.fillStyle = gradMemo('mc' + col, () => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, ra(col, 1)); g.addColorStop(0.7, ra(col, 0.4)); g.addColorStop(1, ra(col, 0)); return g; });
  c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill(); c.restore();
  c.strokeStyle = ra(col, 0.9 * k); c.lineWidth = 1.4 / Math.max(flat, 0.3);
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
  c.lineWidth = 0.8 / Math.max(flat, 0.3);
  c.beginPath(); c.arc(0, 0, r * 0.82, 0, TAU); c.stroke();
  c.rotate(t * spin);
  c.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; c.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); const b = a + (2 / 6) * TAU; c.lineTo(Math.cos(b) * r * 0.82, Math.sin(b) * r * 0.82); }
  c.stroke();
  // 룬 눈금
  c.fillStyle = ra(sh(col, 0.4), k);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; c.save(); c.rotate(a); c.fillRect(r * 0.86, -0.8, r * 0.1, i % 2 ? 1.2 : 2.2); c.restore(); }
  c.restore();
}

/** 광륜 */
export function drawHalo(x, y, r, col, k = 1) {
  const c = G.c;
  if (G.tint) return;
  glow(x, y, r * 2.4, col, 0.3 * k);
  c.save(); c.globalCompositeOperation = 'lighter';
  c.lineWidth = 1.6; c.strokeStyle = ra(col, 0.95 * k);
  c.beginPath(); c.ellipse(x, y, r, r * 0.3, -0.12, 0, TAU); c.stroke();
  c.lineWidth = 0.6; c.strokeStyle = ra('#ffffff', 0.9 * k);
  c.beginPath(); c.ellipse(x, y, r, r * 0.3, -0.12, Math.PI * 0.1, Math.PI * 0.9); c.stroke();
  c.restore();
}
