// 적 렌더러 B (스테이지 7~13): RENDER_B[renderId] = (ctx, e, world, {flash}) => void
// 원점 = 발 중앙, 오른쪽을 보는 기준으로 그린다 (좌우 반전·정예 배율은 호출측 drawEnemy 가 처리).
// 크기는 def.size 기준 (e.w/e.h 는 정예 배율이 곱해져 있으므로 쓰지 않는다).
// 조명 규칙: 뒤(-x)쪽 차가운 림라이트 + 앞/위쪽 따뜻한 키라이트, 어두운 외곽선, 발광 눈/코어.
// 각도 규칙(팔다리): 0 = 아래로 늘어뜨림, +값 = 앞(+x)쪽으로 회전. 끝점 = (x + sin(a)*L, y + cos(a)*L)
// PROJ_B: 적 B 투사체 그리기(원점=투사체 중심), ZONE_B: 장판/기둥/광선 그리기(월드 좌표) — game/ai_b.js 가 사용
import { TAU, clamp, lerp, ease, shade, mix } from '../core/math.js';
import { drawHero } from './hero.js';

export const RENDER_B = {};
export const PROJ_B = {};
export const ZONE_B = {};

const PI = Math.PI, HP = PI / 2;
const OUT = '#0a0510';          // 외곽선
const RIM = '#b4c8ff';          // 차가운 역광
const WARM = '#ffe2b0';         // 따뜻한 키라이트
const WHITE = '#ffffff';

// ───────────────────────── 공용 도우미 ─────────────────────────
let FL = false;                 // 피격 섬광 중이면 전부 흰색
const C = (c) => (FL ? WHITE : c);

// 그라디언트 캐시: 부위 로컬 좌표가 고정일 때만 사용 (키에 기하/색 포함)
const GC = new Map();
function grad(key, make) {
  let g = GC.get(key);
  if (!g) { g = make(); GC.set(key, g); if (GC.size > 1500) GC.clear(); }
  return g;
}
function linG(ctx, key, x0, y0, x1, y1, stops) {
  if (FL) return WHITE;
  return grad('L' + key, () => { const g = ctx.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]); return g; });
}
function radG(ctx, key, x0, y0, r0, x1, y1, r1, stops) {
  if (FL) return WHITE;
  return grad('R' + key, () => { const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]); return g; });
}
/** 원통형 음영: 뒤쪽 림 → 그림자 → 기본 → 앞쪽 하이라이트 (가로) */
function cyl(ctx, key, x0, x1, base, y0 = 0, y1 = 0) {
  if (FL) return WHITE;
  return grad('c' + key + base + x0 + '_' + x1 + '_' + y0 + '_' + y1, () => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, mix(base, RIM, 0.55));
    g.addColorStop(0.14, shade(base, -0.45));
    g.addColorStop(0.55, base);
    g.addColorStop(0.84, mix(shade(base, 0.22), WARM, 0.15));
    g.addColorStop(1, shade(base, -0.15));
    return g;
  });
}
/** 구형 음영: 앞-위 하이라이트 중심의 방사형 */
function sph(ctx, key, cx, cy, r, base) {
  if (FL) return WHITE;
  return grad('s' + key + base + cx + '_' + cy + '_' + r, () => {
    const g = ctx.createRadialGradient(cx + r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.05);
    g.addColorStop(0, mix(shade(base, 0.35), WARM, 0.2));
    g.addColorStop(0.45, base);
    g.addColorStop(0.85, shade(base, -0.45));
    g.addColorStop(1, mix(shade(base, -0.3), RIM, 0.35));
    return g;
  });
}
/** 세로 음영: 위 밝고 아래 어둡게 */
function vert(ctx, key, y0, y1, base, top = 0.2, bot = -0.5) {
  if (FL) return WHITE;
  return grad('v' + key + base + y0 + '_' + y1 + top + bot, () => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, shade(base, top));
    g.addColorStop(1, shade(base, bot));
    return g;
  });
}
/** 현재 경로: 외곽선 → 채우기 */
function ink(ctx, fill, lw = 2) {
  ctx.lineWidth = lw; ctx.strokeStyle = C(OUT); ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
}
/** 부드러운 발광 (가산 합성) */
function glow(ctx, x, y, r, color, a = 1) {
  if (FL || a <= 0.01 || r <= 0.5) return;
  const rr = Math.max(1, Math.round(r));
  const g = radG(ctx, 'gl' + color + rr, 0, 0, 0, 0, 0, rr, [0, color, 0.35, color + '66', 1, color + '00']);
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.translate(x, y);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill();
  ctx.translate(-x, -y);
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
}
/** 발광 눈 */
function eyeGlow(ctx, x, y, r, color, a = 1) {
  glow(ctx, x, y, r * 4.2, color, 0.75 * a);
  ctx.fillStyle = C(color);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = WHITE;
  ctx.beginPath(); ctx.arc(x + r * 0.2, y - r * 0.15, r * 0.45, 0, TAU); ctx.fill();
}
/** 반짝임 (예비동작 경고) */
function glint(ctx, x, y, s, color = '#fff6d8', a = 1) {
  if (FL || a <= 0.01) return;
  glow(ctx, x, y, s * 2.2, color, a * 0.8);
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.16, y - s * 0.16); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.16, y + s * 0.16);
  ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.16, y + s * 0.16); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.16, y - s * 0.16);
  ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = ga;
}
/** 발밑 그림자 */
function shadow(ctx, rx, a = 0.38) {
  if (FL) return;
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath(); ctx.ellipse(0, 0, rx, Math.max(2.5, rx * 0.16), 0, 0, TAU); ctx.fill();
}
/** 끝점 계산 (임시 전역에 기록 — 할당 없음) */
let EX = 0, EY = 0;
function end(x, y, a, L) { EX = x + Math.sin(a) * L; EY = y + Math.cos(a) * L; }
// 색 혼합 캐시 (문자열 연산 반복 방지)
const MC = new Map();
function mixCache(a, b, t, sh = 0) {
  const k = a + b + t + sh;
  let v = MC.get(k);
  if (!v) { v = mix(sh ? shade(a, sh) : a, b, t); MC.set(k, v); }
  return v;
}
const dk = (c, amt = -0.3) => mixCache(c, '#000000', -amt, 0);
const lt = (c, amt = 0.3) => mixCache(c, '#ffffff', amt, 0);
/** 테이퍼드 캡슐 (팔다리/살덩이) + 림/하이라이트 */
function limb(ctx, x1, y1, x2, y2, w1, w2, base, opt) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.arc(x1, y1, w1, a + HP, a - HP);
  ctx.arc(x2, y2, w2, a - HP, a + HP);
  ctx.closePath();
  ink(ctx, C(base), opt?.lw ?? 2);
  if (FL || opt?.flat) return;
  let nx = -Math.sin(a), ny = Math.cos(a);
  if (nx * 0.8 - ny * 0.6 < 0) { nx = -nx; ny = -ny; }
  const wm = (w1 + w2) * 0.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = opt?.hi ?? mixCache(base, WARM, 0.35, 0.25);
  ctx.lineWidth = Math.max(0.8, wm * 0.45);
  ctx.beginPath(); ctx.moveTo(x1 + nx * w1 * 0.45, y1 + ny * w1 * 0.45); ctx.lineTo(x2 + nx * w2 * 0.45, y2 + ny * w2 * 0.45); ctx.stroke();
  ctx.strokeStyle = opt?.rim ?? mixCache(base, RIM, 0.6, 0);
  ctx.lineWidth = Math.max(0.7, wm * 0.28);
  ctx.beginPath(); ctx.moveTo(x1 - nx * w1 * 0.72, y1 - ny * w1 * 0.72); ctx.lineTo(x2 - nx * w2 * 0.72, y2 - ny * w2 * 0.72); ctx.stroke();
}
/** 유기체 팔다리: 두 마디를 이음매 없이 */
function softLimb(ctx, x1, y1, x2, y2, x3, y3, w1, w2, col, near = true) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = C(OUT);
  ctx.lineWidth = w1 * 2 + 2.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.lineWidth = w2 * 2 + 2.4; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
  ctx.strokeStyle = C(col);
  ctx.lineWidth = w1 * 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.lineWidth = w2 * 2; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
  if (FL || !near) return;
  const a = Math.atan2(y2 - y1, x2 - x1);
  let nx = -Math.sin(a), ny = Math.cos(a);
  if (nx * 0.8 - ny * 0.6 < 0) { nx = -nx; ny = -ny; }
  ctx.strokeStyle = mixCache(col, WARM, 0.14, 0.1); ctx.lineWidth = Math.max(0.8, w1 * 0.42);
  ctx.beginPath(); ctx.moveTo(x1 + nx * w1 * 0.45, y1 + ny * w1 * 0.45); ctx.lineTo(x2 + nx * w2 * 0.45, y2 + ny * w2 * 0.45); ctx.stroke();
  ctx.strokeStyle = mixCache(col, RIM, 0.32, 0); ctx.lineWidth = Math.max(0.6, w1 * 0.26);
  ctx.beginPath(); ctx.moveTo(x1 - nx * w1 * 0.7, y1 - ny * w1 * 0.7); ctx.lineTo(x2 - nx * w2 * 0.7, y2 - ny * w2 * 0.7); ctx.stroke();
}
/** 점들을 지나는 부드러운 닫힌 곡선 (중점 이차곡선) */
function smoothClosed(ctx, P, n) {
  ctx.beginPath();
  ctx.moveTo((P[0] + P[2 * (n - 1)]) / 2, (P[1] + P[2 * (n - 1) + 1]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ctx.quadraticCurveTo(P[2 * i], P[2 * i + 1], (P[2 * i] + P[2 * j]) / 2, (P[2 * i + 1] + P[2 * j + 1]) / 2);
  }
  ctx.closePath();
}
const PTS = new Float32Array(64);
/** 흔들리는 덩어리 윤곽 (PTS 에 기록): 중심 (cx,cy), 반경 rx/ry, n 점, 흔들림 amp */
function blobPts(cx, cy, rx, ry, n, t, amp, seed = 0, flatBottom = false) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - HP;
    let r = 1 + Math.sin(t * 3.1 + i * 2.3 + seed) * amp + Math.sin(t * 5.3 + i * 1.7 + seed * 2) * amp * 0.5;
    let y = cy + Math.sin(a) * ry * r;
    if (flatBottom && y > cy) y = Math.min(y, cy + ry * 0.92);
    PTS[i * 2] = cx + Math.cos(a) * rx * r; PTS[i * 2 + 1] = y;
  }
  return n;
}
/** 호 궤적 (무기 휘두르기) — 어깨(px,py) 기준, 각도 규칙은 팔다리와 동일 */
function swingTrail(ctx, px, py, a0, a1, R, width, color, alpha) {
  if (FL || alpha <= 0.02 || Math.abs(a1 - a0) < 0.05) return;
  if (Math.abs(a1 - a0) > 2.4) a0 = a1 + Math.sign(a0 - a1) * 2.4;
  const t0 = HP - a0, t1 = HP - a1, N = 12;
  const ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  for (let pass = 0; pass < 2; pass++) {
    const from = pass === 0 ? 0 : 0.45;
    ctx.globalAlpha = ga * alpha * (pass === 0 ? 0.35 : 0.55);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const k = from + (1 - from) * (i / N), th = t0 + (t1 - t0) * k; ctx.lineTo(px + Math.cos(th) * R, py + Math.sin(th) * R); }
    for (let i = N; i >= 0; i--) { const k = from + (1 - from) * (i / N), th = t0 + (t1 - t0) * k, r = R - width * (0.1 + 0.9 * k * k); ctx.lineTo(px + Math.cos(th) * r, py + Math.sin(th) * r); }
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = ga * alpha * 0.9;
  ctx.strokeStyle = WHITE; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(px, py, R - 1, t0 + (t1 - t0) * 0.55, t1, t1 < t0); ctx.stroke();
  ctx.globalAlpha = ga;
  ctx.globalCompositeOperation = 'source-over';
}
const hurtOf = (e) => (e.flashT > 0 ? 1 : 0) || (e.stun > 0.06 ? 0.7 : 0);
const osc = (t, f, p = 0) => Math.sin(t * f + p);
const k01 = (v) => clamp(v, 0, 1);
/** 가산 합성 블록 시작/끝 */
function addOn(ctx) { ctx.globalCompositeOperation = 'lighter'; }
function addOff(ctx) { ctx.globalCompositeOperation = 'source-over'; }
/** 발광 선 */
function glowLine(ctx, x1, y1, x2, y2, w, color, a = 1) {
  if (FL) return;
  const ga = ctx.globalAlpha;
  addOn(ctx); ctx.lineCap = 'round';
  ctx.globalAlpha = ga * a * 0.35; ctx.strokeStyle = color; ctx.lineWidth = w * 3;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.globalAlpha = ga * a; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.globalAlpha = ga; addOff(ctx);
}
/** 발톱 3개 */
function claws(ctx, x, y, col, open = 0, len = 4, dir = 1) {
  if (FL) return;
  ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + dir * (len * 0.7 + open * 2), y + 1 + i * (2 + open * 2), x + dir * (len + open * 3), y + 3 + i * (2 + open * 2)); ctx.stroke(); }
}
/** 박쥐형 막 날개. 로컬: 어깨 원점, +x 바깥쪽. span=길이, lift=-1(아래)~1(위) */
function batWing(ctx, span, lift, mem, bone, rimA = 0.5) {
  const a = -lift * 0.95;
  ctx.save(); ctx.rotate(a);
  ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(lift * 1.2)));
  const S = span;
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(S * 0.42, -S * 0.2);
  ctx.lineTo(S * 1.0, -S * 0.12);
  ctx.quadraticCurveTo(S * 0.82, S * 0.02, S * 0.9, S * 0.2);
  ctx.quadraticCurveTo(S * 0.66, S * 0.18, S * 0.66, S * 0.38);
  ctx.quadraticCurveTo(S * 0.46, S * 0.28, S * 0.36, S * 0.44);
  ctx.quadraticCurveTo(S * 0.2, S * 0.26, 0, S * 0.24);
  ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'bw' + mem + S, 0, -S * 0.2, 0, S * 0.45, [0, lt(mem, 0.14), 0.5, mem, 1, dk(mem, -0.5)]), 1.6);
  if (!FL) {
    ctx.strokeStyle = bone; ctx.lineWidth = Math.max(1, S * 0.045); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(S * 0.42, -S * 0.2); ctx.lineTo(S * 1.0, -S * 0.12);
    ctx.moveTo(S * 0.42, -S * 0.2); ctx.lineTo(S * 0.9, S * 0.2);
    ctx.moveTo(S * 0.42, -S * 0.2); ctx.lineTo(S * 0.66, S * 0.38);
    ctx.moveTo(S * 0.42, -S * 0.2); ctx.lineTo(S * 0.36, S * 0.44);
    ctx.stroke();
    ctx.strokeStyle = mixCache(mem, RIM, rimA, 0); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(2, -3); ctx.lineTo(S * 0.42, -S * 0.21 - 1); ctx.lineTo(S * 0.98, -S * 0.13 - 1); ctx.stroke();
    ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.moveTo(S * 0.42, -S * 0.2); ctx.lineTo(S * 0.4, -S * 0.2 - 4); ctx.lineTo(S * 0.46, -S * 0.2); ctx.fill();
  }
  ctx.restore();
}
/** 깃털 날개. 로컬: 어깨 원점, +x 바깥쪽 */
function featherWing(ctx, span, lift, col, tip, n = 7) {
  ctx.save(); ctx.rotate(-lift * 1.0);
  ctx.scale(1, 0.5 + 0.5 * Math.abs(Math.cos(lift)));
  const S = span;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.quadraticCurveTo(S * 0.5, -S * 0.3, S * 1.0, -S * 0.12);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    ctx.lineTo(S * (0.98 - u * 0.8), S * (0.0 + u * 0.1));
    ctx.lineTo(S * (0.9 - u * 0.8), S * (0.2 + u * 0.12));
  }
  ctx.lineTo(0, S * 0.2);
  ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'fw' + col + tip + S, 0, -S * 0.3, 0, S * 0.35, [0, lt(col, 0.22), 0.55, col, 1, tip]), 1.6);
  if (!FL) {
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 1; i < n; i++) { const u = i / n; ctx.moveTo(S * (0.95 - u * 0.8) * 0.5, S * 0.05); ctx.lineTo(S * (0.94 - u * 0.8), S * (0.16 + u * 0.12)); }
    ctx.stroke();
    ctx.strokeStyle = mixCache(col, RIM, 0.6, 0); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(2, -4.5); ctx.quadraticCurveTo(S * 0.5, -S * 0.31, S * 0.98, -S * 0.13); ctx.stroke();
  }
  ctx.restore();
}
/** 거품 (투명 원 + 하이라이트) */
function bubble(ctx, x, y, r, col) {
  if (FL) return;
  ctx.strokeStyle = col; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.35, Math.max(0.5, r * 0.3), 0, TAU); ctx.fill();
}
/** 해시 난수 (결정적) */
const h1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ═════════════════════════ s07 연금술 연구소 ═════════════════════════
// ── 연금 슬라임 ──
RENDER_B.slime = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  let sx = 1, sy = 1, lift = 0;
  if (an === 'squash') { const k = ease.outCubic(k01(at / 0.3)); sx = 1 + 0.28 * k; sy = 1 - 0.32 * k; }
  else if (an === 'jump') { const v = clamp((e.vy ?? 0) / 700, -1, 1); sx = 1 - 0.16 * Math.abs(v); sy = 1 + 0.24 * Math.abs(v); lift = 2; }
  else if (an === 'land') { const k = 1 - k01(at / 0.22); sx = 1 + 0.35 * k * (1 + Math.sin(at * 40) * 0.2); sy = 1 - 0.3 * k; }
  else { sx = 1 + Math.sin(t * 4) * 0.05; sy = 1 - Math.sin(t * 4) * 0.05; }
  const hurt = hurtOf(e);
  const rx = 19 * sx, ry = 14 * sy, cy = -ry - lift;
  if (an !== 'jump') shadow(ctx, rx * 1.05, 0.45);
  else shadow(ctx, 12, 0.25);
  // 바깥 발광
  glow(ctx, 0, cy, 34, '#6aff3a', 0.28);
  // 몸 (반투명 젤)
  const n = blobPts(0, cy, rx, ry, 12, t, hurt ? 0.08 : 0.035, 1.3, an !== 'jump');
  smoothClosed(ctx, PTS, n);
  ctx.lineWidth = 2.2; ctx.strokeStyle = C('#0a2408'); ctx.stroke();
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (FL ? 1 : 0.9);
  ctx.fillStyle = FL ? WHITE : radG(ctx, 'slimeb', 5, -20, 2, 0, -14, 24, [0, '#d8ff9a', 0.3, '#7ae04a', 0.75, '#2c8a24', 1, '#0e3a10']);
  ctx.fill();
  ctx.globalAlpha = ga;
  if (!FL) {
    ctx.save(); smoothClosed(ctx, PTS, n); ctx.clip();
    // 녹은 뼈 (안에 떠 있는 두개골)
    const bx = -7 + Math.sin(t * 0.8) * 2, by = cy + 4 + Math.cos(t * 0.9) * 1.5;
    ctx.globalAlpha = ga * 0.45; ctx.fillStyle = '#e8f0c0';
    ctx.beginPath(); ctx.arc(bx, by, 4.2, 0, TAU); ctx.fill(); ctx.fillRect(bx - 2.2, by + 2, 4.4, 3);
    ctx.fillStyle = '#1a4a12'; ctx.beginPath(); ctx.arc(bx - 1.5, by - 0.3, 1.1, 0, TAU); ctx.arc(bx + 1.6, by - 0.3, 1.1, 0, TAU); ctx.fill();
    ctx.globalAlpha = ga;
    // 떠오르는 거품
    for (let i = 0; i < 6; i++) {
      const u = (t * (0.35 + h1(i) * 0.3) + h1(i + 7)) % 1;
      bubble(ctx, (h1(i + 3) - 0.5) * rx * 1.4, cy + ry * 0.8 - u * ry * 1.8, 0.8 + h1(i + 11) * 1.8, 'rgba(220,255,180,0.7)');
    }
    // 아래쪽 어두운 침전
    ctx.fillStyle = 'rgba(8,40,10,0.45)'; ctx.beginPath(); ctx.ellipse(0, cy + ry * 0.95, rx, ry * 0.45, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // 연금 핵 (세로 동공의 눈)
    const ex = 6 + Math.sin(t * 1.3) * 1.5, ey = cy - 2 + Math.cos(t * 1.1);
    const pulse = an === 'squash' ? 1 : 0.65 + 0.2 * Math.sin(t * 5);
    glow(ctx, ex, ey, 14, '#e8ff5a', pulse * 0.7);
    ctx.fillStyle = radG(ctx, 'slimecore', -1, -1, 0.5, 0, 0, 5, [0, '#ffffe0', 0.5, '#f0ff60', 1, '#8ab020']);
    ctx.save(); ctx.translate(ex, ey); ctx.beginPath(); ctx.arc(0, 0, 4.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a2a04'; ctx.beginPath(); ctx.ellipse(0.6, 0, 1.1, 3.4 * (an === 'squash' ? 0.5 : 1), 0, 0, TAU); ctx.fill();
    ctx.restore();
    // 림 + 스페큘러
    ctx.save(); smoothClosed(ctx, PTS, n); ctx.clip();
    ctx.strokeStyle = 'rgba(180,200,255,0.55)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(1.5, cy + 1, rx, ry, 0, PI * 0.72, PI * 1.28); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,240,0.85)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(2, cy - 1, rx * 0.7, ry * 0.62, 0, -PI * 0.62, -PI * 0.3); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(rx * 0.55, cy - ry * 0.45, 1.5, 0, TAU); ctx.fill();
    // 바닥 점액
    if (an !== 'jump') {
      ctx.fillStyle = 'rgba(90,200,60,0.55)';
      ctx.beginPath(); ctx.ellipse(0, -1, rx * 1.1, 2.4, 0, 0, TAU); ctx.fill();
      const d = (t * 0.7) % 1;
      ctx.fillStyle = '#6ad83a'; ctx.beginPath(); ctx.ellipse(-rx * 0.6, -1 + d * 1.5, 1.4, 1.4 + d * 1.2, 0, 0, TAU); ctx.fill();
    }
  }
  FL = false;
};

// ── 호문쿨루스 ──
RENDER_B.homunculus = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const skin = '#c8a8a4', skinD = '#8a6a70', vein = '#6a3a5a';
  const walk = an === 'walk', crouch = an === 'crouch', leap = an === 'leap', land = an === 'land';
  const ph = t * 14;
  // 자세 변수: 몸통 중심, 기울기, 머리 위치
  let bx = 0, by = -26, lean = 0.5, hx = 9, hy = -40, reach = 0, sq = 1;
  if (walk) { by = -22 + Math.abs(Math.sin(ph)) * 2; lean = 0.95; hx = 14; hy = -30 + Math.sin(ph * 2) * 1; }
  if (crouch) { const k = ease.outCubic(k01(at / 0.3)); by = lerp(-24, -14, k); lean = lerp(0.6, 1.2, k); hx = lerp(9, 16, k); hy = lerp(-38, -22, k); sq = 1 - 0.1 * k; }
  if (leap) { by = -30; lean = 1.35; hx = 20; hy = -36; reach = 1; }
  if (land) { const k = 1 - k01(at / 0.35); by = -18 + (1 - k) * -6; lean = 0.9; hx = 13; hy = -26 - (1 - k) * 8; }
  if (!walk && !crouch && !leap && !land) { by = -25 + Math.sin(t * 3) * 0.8; hy = -40 + Math.sin(t * 3 + 0.5) * 1; hx = 8 + Math.sin(t * 1.3) * 1; }
  shadow(ctx, 14);
  // 탯줄 관 (등에서 끌림)
  if (!FL) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.lineCap = 'round';
    const tx = bx - 8, ty = by - 2, sw = Math.sin(t * 4) * 3;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.bezierCurveTo(tx - 10, ty + 4 + sw, tx - 16, -6 - sw, tx - 24, -3); ctx.stroke();
    ctx.strokeStyle = '#8a4a5a'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,210,0.4)'; ctx.lineWidth = 0.8; ctx.stroke();
    // 깨진 플라스크 조각
    ctx.fillStyle = 'rgba(180,230,210,0.5)'; ctx.strokeStyle = 'rgba(220,255,240,0.8)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(tx - 27, -1); ctx.lineTo(tx - 22, -7); ctx.lineTo(tx - 19, -2); ctx.lineTo(tx - 22, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // 다리 (뒤)
  const legs = (near) => {
    const px = bx - 5 + (near ? 2 : -1), py = by + 5;
    let a1, a2;
    if (walk) { const p = ph + (near ? 0 : PI); a1 = Math.sin(p) * 0.7 - 0.2; a2 = -0.9 - Math.max(0, Math.cos(p)) * 0.6; }
    else if (leap) { a1 = near ? -0.9 : -0.6; a2 = 0.3; }
    else if (crouch) { a1 = 0.9; a2 = -2.2; }
    else { a1 = near ? 0.55 : 0.35; a2 = -1.5; }
    end(px, py, a1, 11); const kx = EX, ky = EY; end(kx, ky, a1 + a2, 11);
    const fx = EX, fy = Math.min(EY, 0);
    softLimb(ctx, px, py, kx, ky, fx, fy, 3.2, 2, near ? skin : skinD, near);
    if (!FL) { ctx.fillStyle = C(near ? skinD : dk(skinD, -0.2)); ctx.beginPath(); ctx.ellipse(fx + 2, fy - 1, 3.4, 1.5, 0, 0, TAU); ctx.fill(); }
  };
  const arms = (near) => {
    const sx = bx + Math.sin(lean) * 10 + (near ? 1 : -2), sy = by - Math.cos(lean) * 10 + 2;
    let a1, a2;
    if (walk) { const p = ph + (near ? PI : 0); a1 = 0.6 + Math.sin(p) * 0.6; a2 = 0.3; }
    else if (leap) { a1 = 1.9 + (near ? 0 : 0.2); a2 = 0.1; }
    else if (crouch) { a1 = 0.5; a2 = 0.6; }
    else { a1 = 0.3 + (near ? 0.1 : 0); a2 = 0.5 + Math.sin(t * 2 + (near ? 0 : 1)) * 0.1; }
    end(sx, sy, a1, 10); const ex = EX, ey = EY; end(ex, ey, a1 + a2, 10);
    let hx2 = EX, hy2 = EY;
    if (!leap && !walk) hy2 = Math.min(hy2, -1);
    if (walk) hy2 = Math.min(hy2, -1);
    softLimb(ctx, sx, sy, ex, ey, hx2, hy2, 2.4, 1.8, near ? skin : skinD, near);
    claws(ctx, hx2, hy2, near ? '#f0e8e0' : '#a09090', reach, 4);
  };
  legs(false); arms(false);
  // 몸통 (굽은 등, 앙상한 갈비)
  ctx.save(); ctx.translate(bx, by); ctx.rotate(lean); ctx.scale(1, sq);
  ctx.beginPath();
  ctx.moveTo(-6, 7); ctx.bezierCurveTo(-9, 0, -8, -12, -2, -15); ctx.bezierCurveTo(5, -16, 8, -9, 7, -2); ctx.bezierCurveTo(6, 4, 3, 8, -6, 7); ctx.closePath();
  ink(ctx, sph(ctx, 'homb', 0, -5, 12, skin), 1.8);
  if (!FL) {
    // 척추 돌기
    ctx.fillStyle = skinD;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-7.2 + i * 0.3, 3 - i * 3.4, 1.2, 0, TAU); ctx.fill(); }
    // 갈비
    ctx.strokeStyle = 'rgba(90,50,70,0.5)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(1, -8 + i * 3.2); ctx.quadraticCurveTo(5, -7 + i * 3.2, 6, -4 + i * 3.4); ctx.stroke(); }
    // 봉합 자국
    ctx.strokeStyle = '#3a1a2a'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-2, -13); ctx.lineTo(-1, 4); ctx.stroke();
    for (let i = 0; i < 5; i++) { const y = -11 + i * 3.4; ctx.beginPath(); ctx.moveTo(-3, y); ctx.lineTo(0.2, y + 1); ctx.stroke(); }
    // 핏줄
    ctx.strokeStyle = 'rgba(106,58,90,0.6)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-5, -8); ctx.quadraticCurveTo(-3, -4, -5, 0); ctx.stroke();
    // 림
    ctx.strokeStyle = mixCache(skin, RIM, 0.6, 0); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-6.5, 6); ctx.bezierCurveTo(-9.5, 0, -8.5, -11, -3, -14.5); ctx.stroke();
  }
  ctx.restore();
  // 머리 (큰 두상 + 큰 눈)
  ctx.save(); ctx.translate(bx + hx, hy); ctx.rotate(leap ? 0.3 : crouch ? 0.2 : Math.sin(t * 1.7) * 0.08);
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 9.5, 0, 0, TAU);
  ink(ctx, sph(ctx, 'homh', 0, 0, 10, skin), 1.8);
  // 턱 (가늘게 튀어나옴)
  ctx.beginPath(); ctx.moveTo(2, 5); ctx.quadraticCurveTo(8, 9, 11, 5); ctx.quadraticCurveTo(10, 2, 6, 3); ctx.closePath(); ink(ctx, C(skin), 1.2);
  if (!FL) {
    // 이마 핏줄 + 두개 봉합
    ctx.strokeStyle = vein; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-6, -6); ctx.quadraticCurveTo(-2, -9, 1, -8); ctx.moveTo(-3, -8); ctx.lineTo(-2, -4); ctx.stroke();
    ctx.strokeStyle = '#3a1a2a'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(-1, 0, 8.4, -2.4, -1.2); ctx.stroke();
    // 눈구멍 + 큰 발광 눈
    ctx.fillStyle = '#1a0a14'; ctx.beginPath(); ctx.ellipse(5.4, -1, 3.6, 3.2, 0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-0.6, -1.4, 2.4, 2.6, 0, 0, TAU); ctx.fill();
    const eb = crouch ? 1.5 : 1;
    eyeGlow(ctx, 5.8, -1, 2.1, '#ffe040', eb);
    eyeGlow(ctx, -0.2, -1.4, 1.5, '#ffe040', eb * 0.7);
    // 입 (이빨)
    ctx.fillStyle = '#2a0a14'; ctx.beginPath(); ctx.moveTo(4, 5); ctx.quadraticCurveTo(8, 7.5, 10.5, 5); ctx.lineTo(9, 4.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0e8d0'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(5.5 + i * 1.7, 5); ctx.lineTo(6.1 + i * 1.7, 6.4); ctx.lineTo(6.7 + i * 1.7, 5.1); ctx.fill(); }
    ctx.strokeStyle = mixCache(skin, RIM, 0.65, 0); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 0, 9.2, PI * 0.7, PI * 1.35); ctx.stroke();
  }
  ctx.restore();
  legs(true); arms(true);
  if (crouch && !FL) glint(ctx, bx + hx + 8, hy - 2, 5 + 4 * Math.sin(t * 30), '#ffe060', k01(at / 0.3));
  FL = false;
};
// ── END ──
