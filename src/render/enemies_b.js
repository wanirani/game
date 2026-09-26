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

// ── 육체 골렘 ──
RENDER_B.flesh_golem = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const skinA = '#b89088', skinB = '#8a6a74', skinC = '#a07060', dark = '#5a3a44';
  const walk = an === 'walk', slam = an === 'slam';
  const wu = e.params?.windup ?? 0.75;
  const ph = t * 5.5;
  let lean = 0.12, bob = 0, armA1 = 0.35, armA2 = 0.5, farA = 0.2, raise = 0, impact = 0;
  if (walk) { bob = Math.abs(Math.sin(ph)) * 2.5; lean = 0.16; armA1 = 0.3 + Math.sin(ph) * 0.35; farA = 0.2 - Math.sin(ph) * 0.35; }
  else if (slam) {
    if (at < wu) { raise = ease.outCubic(k01(at / wu)); lean = lerp(0.12, -0.18, raise); armA1 = lerp(0.35, 2.9, raise); armA2 = lerp(0.5, 0.4, raise); farA = lerp(0.2, 2.7, raise); }
    else { impact = 1 - k01((at - wu) / 0.6); const k = ease.outCubic(k01((at - wu) / 0.08)); lean = lerp(-0.18, 0.42, k) * (0.4 + 0.6 * impact) + 0.12 * (1 - impact); armA1 = lerp(2.9, 1.05, k); armA2 = lerp(0.4, 0.15, k); farA = lerp(2.7, 1.0, k); bob = -4 * k * impact; }
  } else { bob = Math.sin(t * 1.8) * 1.2; armA1 = 0.32 + Math.sin(t * 1.8) * 0.04; }
  const hurt = hurtOf(e);
  if (hurt) lean -= 0.1;
  shadow(ctx, 30, 0.45);
  const shake = slam && at < wu ? Math.sin(t * 50) * raise * 0.8 : 0;
  ctx.save(); ctx.translate(shake, 0);
  // 다리
  const hipY = -36 + bob;
  const leg = (x, p, near) => {
    const s = walk ? Math.sin(ph + p) : 0;
    const fx = x + s * 9, lift = walk ? Math.max(0, -Math.cos(ph + p)) * 5 : 0;
    const kx = (x + fx) / 2 + 4, ky = hipY * 0.45 - lift * 0.6;
    softLimb(ctx, x, hipY, kx, ky, fx, -3 - lift, 9, 7.5, near ? skinB : dk(skinB, -0.25), near);
    ctx.beginPath(); ctx.ellipse(fx + 3, -3 - lift, 10, 4.2, 0, 0, TAU); ink(ctx, C(near ? '#3a2a2a' : '#2a1e20'), 1.6);
    if (!FL && near) { ctx.strokeStyle = '#1a0a10'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(kx - 7, ky - 4); ctx.lineTo(kx + 7, ky - 3); ctx.stroke(); for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(kx + i * 3, ky - 6); ctx.lineTo(kx + i * 3 + 1, ky - 1); ctx.stroke(); } }
  };
  leg(-11, PI, false);
  // 먼 팔
  const shFar = { x: -12, y: -80 + bob };
  const arm = (sx, sy, a1, a2, L1, L2, w1, w2, col, near, big) => {
    const A1 = a1 + lean, A2 = A1 + a2;
    end(sx, sy, A1, L1); const ex = EX, ey = EY; end(ex, ey, A2, L2);
    const hx = EX, hy = EY;
    softLimb(ctx, sx, sy, ex, ey, hx, hy, w1, w2, col, near);
    if (near && !FL) {
      // 쇠띠
      ctx.save(); ctx.translate((ex + hx) / 2, (ey + hy) / 2); ctx.rotate(Math.atan2(hy - ey, hx - ex));
      ctx.fillStyle = '#4a4a54'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.rect(-3, -w2 - 1.5, 5, w2 * 2 + 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9a9aa8'; ctx.fillRect(-2, -w2 - 0.5, 1.2, w2 * 2 + 1);
      ctx.restore();
      // 봉합선
      ctx.strokeStyle = '#2a0a14'; ctx.lineWidth = 0.9;
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      ctx.beginPath(); ctx.moveTo(mx - 5, my - 3); ctx.lineTo(mx + 5, my + 3); ctx.stroke();
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(mx + i * 2.2 - 1.5, my + i * 1.3 + 1.5); ctx.lineTo(mx + i * 2.2 + 1.5, my + i * 1.3 - 1.5); ctx.stroke(); }
    }
    // 주먹
    ctx.beginPath(); ctx.arc(hx, hy, big ? 10 : 6.5, 0, TAU);
    ink(ctx, sph(ctx, 'fgfist' + big, 0, 0, big ? 10 : 6.5, near ? skinC : dk(skinC, -0.2)), 1.8);
    if (!FL && big) { ctx.strokeStyle = dk(skinC, -0.4); ctx.lineWidth = 1; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(hx + 4, hy + i * 3.4, 2.2, -HP, HP); ctx.stroke(); } }
    return [hx, hy];
  };
  arm(shFar.x, shFar.y, farA, armA2, 16, 16, 6.5, 5.5, dk(skinB, -0.2), false, false);
  // 몸통 (굽은 거대한 몸)
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean);
  ctx.beginPath();
  ctx.moveTo(-18, 2);
  ctx.bezierCurveTo(-30, -14, -30, -46, -16, -56);
  ctx.bezierCurveTo(-4, -64, 16, -60, 22, -48);
  ctx.bezierCurveTo(28, -34, 22, -12, 14, -2);
  ctx.bezierCurveTo(6, 6, -10, 7, -18, 2);
  ctx.closePath();
  ink(ctx, sph(ctx, 'fgbody', 4, -30, 34, skinA), 2.4);
  if (!FL) {
    ctx.save(); ctx.clip();
    // 다른 피부 조각들
    ctx.fillStyle = skinB; ctx.beginPath(); ctx.moveTo(-30, -30); ctx.lineTo(-8, -36); ctx.lineTo(-4, -18); ctx.lineTo(-30, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = skinC; ctx.beginPath(); ctx.moveTo(4, -60); ctx.lineTo(24, -52); ctx.lineTo(18, -38); ctx.lineTo(2, -42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(120,70,90,0.55)'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(18, -18); ctx.lineTo(16, 2); ctx.lineTo(-2, 4); ctx.closePath(); ctx.fill();
    // 봉합선
    ctx.strokeStyle = '#2a0a14'; ctx.lineWidth = 1.1;
    const seams = [[-30, -30, -8, -36], [-8, -36, -4, -18], [-4, -18, -30, -10], [4, -60, 2, -42], [2, -42, 18, -38], [0, -14, 18, -18]];
    for (const [a, b, c, d] of seams) {
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
      const L = Math.hypot(c - a, d - b), n = Math.floor(L / 3.4), nx = -(d - b) / L, ny = (c - a) / L;
      for (let i = 1; i < n; i++) { const u = i / n, x = lerp(a, c, u), y = lerp(b, d, u); ctx.beginPath(); ctx.moveTo(x - nx * 2, y - ny * 2); ctx.lineTo(x + nx * 2, y + ny * 2); ctx.stroke(); }
    }
    // 배의 쇠 죔쇠
    ctx.fillStyle = '#3a3a44'; ctx.fillRect(-20, -26, 40, 5);
    ctx.fillStyle = '#8a8a98'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-16 + i * 8, -23.5, 1.2, 0, TAU); ctx.fill(); }
    // 핏줄 + 역광
    ctx.strokeStyle = 'rgba(90,30,60,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(8, -48); ctx.quadraticCurveTo(12, -40, 9, -30); ctx.moveTo(10, -42); ctx.lineTo(15, -38); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = mixCache(skinA, RIM, 0.6, 0); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-19, 0); ctx.bezierCurveTo(-29, -14, -29, -45, -16, -55); ctx.stroke();
  }
  // 등에 박힌 연금 약병
  for (let i = 0; i < 3; i++) {
    const vx = -22 + i * 7, vy = -54 + i * 3, a = -0.6 + i * 0.35;
    ctx.save(); ctx.translate(vx, vy); ctx.rotate(a);
    ctx.beginPath(); ctx.rect(-3, -13, 6, 13); ink(ctx, C('rgba(180,230,200,0.35)'), 1.4);
    if (!FL) {
      const lv = 0.55 + 0.2 * Math.sin(t * 3 + i);
      ctx.fillStyle = '#6aff4a'; ctx.fillRect(-2, -12 * lv, 4, 12 * lv);
      glow(ctx, 0, -5, 9, '#6aff4a', 0.5 + 0.2 * Math.sin(t * 4 + i));
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-2.6, -15, 5.2, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(1, -11, 0.9, 8);
    }
    ctx.restore();
  }
  ctx.restore();
  // 머리 (어깨에 파묻힌 작은 머리)
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const hx = 23 * cl + 50 * sl, hy = hipY + 23 * sl - 50 * cl;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(lean * 0.6); ctx.scale(1.2, 1.2);
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 10, 0, 0, TAU); ink(ctx, sph(ctx, 'fghead', 0, 0, 10, skinC), 1.8);
  // 쇠 턱
  ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(9, 3); ctx.lineTo(10, 9); ctx.lineTo(-2, 10); ctx.closePath();
  ink(ctx, linG(ctx, 'fgjaw', 0, 3, 0, 10, [0, '#9a9aa8', 1, '#3a3a44']), 1.4);
  if (!FL) {
    ctx.fillStyle = '#e8e0c8'; for (let i = 0; i < 4; i++) ctx.fillRect(0 + i * 2.4, 2.2, 1.4, 2);
    ctx.fillStyle = '#c8c8d0'; ctx.beginPath(); ctx.arc(-2, 7, 0.9, 0, TAU); ctx.arc(8, 6, 0.9, 0, TAU); ctx.fill();
    // 꿰맨 한쪽 눈 + 발광 눈
    ctx.strokeStyle = '#2a0a14'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(1, -2); ctx.moveTo(-2, -4.5); ctx.lineTo(-2.4, -0.6); ctx.moveTo(0, -4); ctx.lineTo(-0.4, -0.2); ctx.stroke();
    ctx.fillStyle = '#1a0a0a'; ctx.beginPath(); ctx.ellipse(5, -2.4, 2.8, 2.2, 0, 0, TAU); ctx.fill();
    eyeGlow(ctx, 5.4, -2.4, 1.6, '#8aff4a', slam ? 1.5 : 1);
    // 이마 흉터
    ctx.beginPath(); ctx.moveTo(-6, -6); ctx.quadraticCurveTo(0, -10, 6, -7); ctx.stroke();
  }
  ctx.restore();
  // 목 전극 (스파크)
  const bx1 = hx - 10, by1 = hy + 2;
  ctx.beginPath(); ctx.rect(bx1 - 3, by1 - 2, 7, 4); ink(ctx, C('#7a7a88'), 1.2);
  if (!FL && (Math.sin(t * 13) > 0.6 || slam)) {
    ctx.strokeStyle = '#d0f0ff'; ctx.lineWidth = 1; addOn(ctx);
    ctx.beginPath(); ctx.moveTo(bx1 - 3, by1); ctx.lineTo(bx1 - 7, by1 - 3 + Math.sin(t * 40) * 2); ctx.lineTo(bx1 - 10, by1 + 1); ctx.stroke();
    addOff(ctx);
    glow(ctx, bx1 - 5, by1, 8, '#9fe8ff', 0.6);
  }
  leg(9, 0, true);
  // 가까운 거대 팔
  const shx = 8 * cl + 44 * sl, shy = hipY + 8 * sl - 44 * cl;
  const [fx, fy] = arm(shx, shy, armA1, armA2, 20, 20, 10, 9, skinA, true, true);
  ctx.restore();
  if (slam && !FL) {
    if (at < wu) glint(ctx, fx, fy, 6 + 5 * raise, '#c8ff90', raise > 0.6 ? (raise - 0.6) * 2.5 : 0);
    else if (impact > 0.5) { const k = (impact - 0.5) * 2; glow(ctx, 50, -6, 40, '#c8ffa0', k * 0.4); }
  }
  FL = false;
};

// ── 역병 의사 ──
RENDER_B.plague_doctor = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const coat = '#2c2432', coatD = '#17121c', leather = '#4a3428', mask = '#e8dcc0', hatC = '#1c1620';
  const walk = an === 'walk', thr = an === 'throw', hop = an === 'hop';
  const wu = e.params?.windup ?? 0.5;
  const ph = t * 7;
  let bob = 0, lean = 0.05, sway = 0, armA = 0.25, armB = 0.6, tk = 0;
  if (walk) { bob = Math.abs(Math.sin(ph)) * 1.5; sway = Math.sin(ph) * 2.5; lean = 0.1; }
  if (thr) {
    if (at < wu) { tk = ease.outCubic(k01(at / wu)); armA = lerp(0.25, -2.5, tk); armB = lerp(0.6, -0.6, tk); lean = lerp(0.05, -0.12, tk); }
    else { const k = ease.outCubic(k01((at - wu) / 0.12)); armA = lerp(-2.5, 1.7, k); armB = lerp(-0.6, 0.1, k); lean = lerp(-0.12, 0.18, k); }
  }
  if (hop) { lean = -0.2; bob = -3; sway = -6; }
  if (!walk && !thr && !hop) { bob = Math.sin(t * 2) * 0.6; }
  shadow(ctx, 16);
  // 독기 (코트 자락)
  if (!FL) {
    for (let i = 0; i < 4; i++) {
      const u = (t * 0.5 + i * 0.25) % 1;
      glow(ctx, -10 + i * 7 + Math.sin(t + i) * 3, -4 - u * 20, 8 + u * 6, '#5aa040', 0.25 * (1 - u));
    }
  }
  // 부츠
  const foot = (x, p, near) => {
    const s = walk ? Math.sin(ph + p) : 0;
    const fx = x + s * 6, lift = walk ? Math.max(0, -Math.cos(ph + p)) * 3 : hop ? 5 : 0;
    ctx.beginPath(); ctx.moveTo(fx - 4, -lift); ctx.lineTo(fx - 3, -14 - lift); ctx.lineTo(fx + 3, -14 - lift); ctx.lineTo(fx + 4, -5 - lift); ctx.lineTo(fx + 8, -2 - lift); ctx.lineTo(fx + 8, -lift); ctx.closePath();
    ink(ctx, C(near ? '#241a14' : '#140e0c'), 1.4);
    if (!FL && near) { ctx.strokeStyle = 'rgba(200,170,130,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(fx + 2, -13 - lift); ctx.lineTo(fx + 3, -5 - lift); ctx.stroke(); }
  };
  foot(-4, PI, false);
  ctx.save(); ctx.translate(0, -bob); ctx.rotate(lean);
  // 먼 팔 (지팡이)
  const shY = -62;
  end(-4, shY, 0.15 + (walk ? -Math.sin(ph) * 0.2 : 0), 14); const fex = EX, fey = EY; end(fex, fey, 0.5, 13);
  softLimb(ctx, -4, shY, fex, fey, EX, EY, 3.6, 3, coatD, false);
  const cx0 = EX, cy0 = EY;
  if (!FL) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(cx0 - 2, cy0 - 8); ctx.lineTo(cx0 + 4, bob - 1); ctx.stroke();
    ctx.strokeStyle = '#5a3a24'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.arc(cx0 - 2, cy0 - 8, 2.2, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = C('#1a1418'); ctx.beginPath(); ctx.arc(cx0, cy0, 3, 0, TAU); ctx.fill();
  // 코트 (긴 자락)
  const hem = -12 + (hop ? -4 : 0);
  ctx.beginPath();
  ctx.moveTo(-9, shY);
  ctx.quadraticCurveTo(-14, -40, -17 + sway * 0.4 - (hop ? 6 : 0), hem);
  ctx.lineTo(-10 + sway * 0.6, hem + 3);
  ctx.lineTo(-2 + sway * 0.5, hem - 1);
  ctx.lineTo(6 + sway * 0.6, hem + 3);
  ctx.lineTo(15 + sway * 0.3, hem);
  ctx.quadraticCurveTo(11, -40, 10, shY + 2);
  ctx.quadraticCurveTo(0, shY - 4, -9, shY);
  ctx.closePath();
  ink(ctx, cyl(ctx, 'pdcoat', -16, 14, coat), 2);
  if (!FL) {
    // 가죽 광택 + 앞섶
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(4, shY + 2); ctx.quadraticCurveTo(5, -36, 3 + sway * 0.5, hem); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,180,220,0.14)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(8, shY + 4); ctx.quadraticCurveTo(9, -36, 11 + sway * 0.3, hem + 2); ctx.stroke();
    ctx.fillStyle = '#8a7a50'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(5.5, shY + 6 + i * 6, 0.9, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = mixCache(coat, RIM, 0.6, 0); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-9.5, shY + 1); ctx.quadraticCurveTo(-14.5, -40, -17 + sway * 0.4, hem); ctx.stroke();
  }
  // 가죽 망토 칼라
  ctx.beginPath(); ctx.moveTo(-12, shY + 2); ctx.quadraticCurveTo(-2, shY - 6, 12, shY + 1); ctx.lineTo(10, shY + 12); ctx.quadraticCurveTo(-1, shY + 8, -13, shY + 12); ctx.closePath();
  ink(ctx, vert(ctx, 'pdcape', shY - 6, shY + 12, leather, 0.15, -0.4), 1.6);
  // 벨트 + 약병
  const bY = -38;
  ctx.fillStyle = C('#1a120c'); ctx.fillRect(-12, bY, 25, 4);
  ctx.fillStyle = C('#c8a040'); ctx.fillRect(3, bY - 0.5, 4, 5);
  const vials = [['#7aff5a', -9], ['#c070ff', -3], ['#ffb040', 10]];
  for (let i = 0; i < 3; i++) {
    const [vc, vx] = vials[i];
    const sw = Math.sin(t * 3 + i) * 0.1 + (walk ? Math.sin(ph + i) * 0.2 : 0);
    ctx.save(); ctx.translate(vx, bY + 3); ctx.rotate(sw);
    ctx.beginPath(); ctx.moveTo(-1.4, 0); ctx.lineTo(-1.4, 2); ctx.arc(0, 5.5, 3.4, -PI * 0.62, PI * 1.62); ctx.lineTo(1.4, 0); ctx.closePath();
    ink(ctx, C('rgba(200,230,230,0.5)'), 1.2);
    if (!FL) {
      ctx.fillStyle = vc; ctx.beginPath(); ctx.arc(0, 6, 2.6, 0, PI); ctx.fill(); ctx.fillRect(-2.6, 5, 5.2, 1.2);
      glow(ctx, 0, 6, 7, vc, 0.55);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(0.8, 3.6, 0.8, 2);
    }
    ctx.restore();
  }
  // 머리: 챙 넓은 모자 + 새부리 가면
  ctx.save(); ctx.translate(2, shY - 7); ctx.rotate(thr ? -lean * 0.5 : Math.sin(t * 1.5) * 0.04);
  // 두건
  ctx.beginPath(); ctx.moveTo(-9, 6); ctx.quadraticCurveTo(-10, -6, 0, -7); ctx.quadraticCurveTo(8, -6, 8, 4); ctx.closePath();
  ink(ctx, C(coatD), 1.4);
  // 부리 가면
  ctx.beginPath();
  ctx.moveTo(-2, -4); ctx.quadraticCurveTo(6, -6, 10, -2);
  ctx.quadraticCurveTo(18, 2, 24, 10);
  ctx.quadraticCurveTo(16, 8, 9, 7);
  ctx.quadraticCurveTo(2, 7, -2, 4); ctx.closePath();
  ink(ctx, linG(ctx, 'pdmask', 0, -6, 0, 10, [0, '#fff8e8', 0.5, mask, 1, '#8a7a60']), 1.6);
  if (!FL) {
    ctx.strokeStyle = 'rgba(80,60,40,0.6)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(10, 1); ctx.quadraticCurveTo(16, 4, 23, 9.5); ctx.stroke();
    ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(13, 3.2, 0.7, 0, TAU); ctx.arc(15.5, 4.8, 0.7, 0, TAU); ctx.fill();
    // 고글 렌즈
    ctx.fillStyle = '#6a4a24'; ctx.beginPath(); ctx.arc(5, -1, 3.6, 0, TAU); ctx.fill();
    ctx.fillStyle = radG(ctx, 'pdlens', -0.5, -0.5, 0.3, 0, 0, 2.8, [0, '#e8ffb0', 0.5, '#6adf3a', 1, '#1a4a10']);
    ctx.save(); ctx.translate(5, -1); ctx.beginPath(); ctx.arc(0, 0, 2.7, 0, TAU); ctx.fill(); ctx.restore();
    glow(ctx, 5, -1, 11, '#8aff5a', thr ? 0.9 : 0.55);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(5.8, -2, 0.8, 0, TAU); ctx.fill();
  }
  // 모자
  ctx.beginPath(); ctx.ellipse(1, -6, 16, 3.4, -0.08, 0, TAU); ink(ctx, C(hatC), 1.6);
  ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(-6, -17); ctx.quadraticCurveTo(1, -19, 8, -17); ctx.lineTo(8, -7); ctx.closePath();
  ink(ctx, cyl(ctx, 'pdhat', -7, 8, hatC), 1.6);
  if (!FL) {
    ctx.fillStyle = '#5a2a2a'; ctx.fillRect(-6.5, -10, 14.5, 2.4);
    ctx.strokeStyle = mixCache(hatC, RIM, 0.5, 0); ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(1, -6, 15.5, 3, -0.08, PI * 0.75, PI * 1.2); ctx.stroke();
  }
  ctx.restore();
  // 가까운 팔 (투척)
  end(6, shY + 2, armA, 13); const ex = EX, ey = EY; end(ex, ey, armA + armB, 12);
  const hx = EX, hy = EY;
  softLimb(ctx, 6, shY + 2, ex, ey, hx, hy, 3.8, 3, coat, true);
  ctx.beginPath(); ctx.arc(hx, hy, 3, 0, TAU); ink(ctx, C('#1a1210'), 1.2);
  if (thr && at < wu + 0.06 && !FL) {
    // 손에 든 플라스크
    ctx.save(); ctx.translate(hx, hy - 3); ctx.rotate(t * 2);
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ink(ctx, 'rgba(200,240,210,0.6)', 1.2);
    ctx.fillStyle = '#7aff5a'; ctx.beginPath(); ctx.arc(0, 0.8, 3, 0, PI); ctx.fill();
    ctx.restore();
    glow(ctx, hx, hy - 3, 12, '#8aff5a', 0.7);
    glint(ctx, hx, hy - 3, 4 + 4 * tk, '#d8ffb0', tk > 0.5 ? (tk - 0.5) * 2 : 0);
  }
  ctx.restore();
  foot(4, 0, true);
  FL = false;
};

// ── 산성 증류기 ──
RENDER_B.acid_turret = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const charge = an === 'charge', fire = an === 'fire';
  const ck = charge ? k01(at / (e.params?.charge ?? 0.8)) : 0;
  const fk = fire ? 1 - k01(at / 0.4) : 0;
  const copper = '#b8683a', iron = '#3a3440';
  const shake = charge ? Math.sin(t * 60) * ck * 1.2 : 0;
  const sq = 1 - fk * 0.06;
  shadow(ctx, 24, 0.5);
  ctx.save(); ctx.translate(shake, 0); ctx.scale(1, sq);
  // 받침 화로 (벽돌 + 쇠)
  ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-17, -20); ctx.lineTo(17, -20); ctx.lineTo(20, 0); ctx.closePath();
  ink(ctx, vert(ctx, 'atbase', -20, 0, '#4a3a3a', 0.1, -0.5), 2);
  if (!FL) {
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8;
    for (let r = 0; r < 3; r++) { const y = -18 + r * 6; ctx.beginPath(); ctx.moveTo(-18, y); ctx.lineTo(18, y); ctx.stroke(); for (let c = 0; c < 5; c++) { const x = -16 + c * 8 + (r % 2) * 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 6); ctx.stroke(); } }
    // 불구멍
    ctx.fillStyle = '#1a0806'; ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(4, -10); ctx.quadraticCurveTo(10, -15, 16, -10); ctx.lineTo(16, -2); ctx.closePath(); ctx.fill();
    const fl = 0.7 + 0.3 * Math.sin(t * 17) + ck * 0.6;
    ctx.fillStyle = radG(ctx, 'atfire', 10, -2, 1, 10, -5, 8, [0, '#fff0a0', 0.4, '#ff8a2a', 1, 'rgba(120,20,0,0)']);
    ctx.beginPath(); ctx.moveTo(5, -2); ctx.lineTo(5, -9); ctx.quadraticCurveTo(10, -13 - fl * 2, 15, -9); ctx.lineTo(15, -2); ctx.closePath(); ctx.fill();
    glow(ctx, 10, -6, 16 + ck * 10, '#ff8a2a', 0.5 * fl);
  }
  // 옆 배관 + 밸브
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-14, -30); ctx.lineTo(-20, -30); ctx.lineTo(-20, -16); ctx.stroke();
  ctx.strokeStyle = C('#8a5a30'); ctx.lineWidth = 3; ctx.stroke();
  ctx.save(); ctx.translate(-20, -24); ctx.rotate(t * (charge ? 6 : 0.5));
  ctx.strokeStyle = C('#c83a2a'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.moveTo(-3.2, 0); ctx.lineTo(3.2, 0); ctx.moveTo(0, -3.2); ctx.lineTo(0, 3.2); ctx.stroke();
  ctx.restore();
  // 구리 보일러
  ctx.beginPath(); ctx.ellipse(0, -34, 16, 14, 0, 0, TAU);
  ink(ctx, sph(ctx, 'atboil', 0, -34, 16, copper), 2);
  if (!FL) {
    ctx.strokeStyle = '#6a3418'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, -34, 16, 4, 0, 0, PI); ctx.stroke();
    ctx.fillStyle = '#e8a870'; for (let i = 0; i < 7; i++) { const a = PI * (0.1 + i * 0.13); ctx.beginPath(); ctx.arc(Math.cos(a) * 15, -34 + Math.sin(a) * 4, 0.8, 0, TAU); ctx.fill(); }
    // 압력계
    ctx.fillStyle = '#e8e0c8'; ctx.beginPath(); ctx.arc(9, -38, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1; ctx.stroke();
    const na = -2.4 + (0.6 + Math.sin(t * 2) * 0.1 + ck * 1.8 + fk * 1.2);
    ctx.strokeStyle = '#c81a1a'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(9, -38); ctx.lineTo(9 + Math.cos(na) * 3.2, -38 + Math.sin(na) * 3.2); ctx.stroke();
    ctx.strokeStyle = mixCache(copper, RIM, 0.55, 0); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, -34, 15, 13, 0, PI * 0.72, PI * 1.3); ctx.stroke();
  }
  // 유리 증류 플라스크 (위)
  const gx = 0, gy = -54;
  ctx.beginPath(); ctx.moveTo(-3, -46); ctx.lineTo(-3, -44); ctx.lineTo(3, -44); ctx.lineTo(3, -46); ctx.closePath(); ink(ctx, C('#6a4a2a'), 1.2);
  ctx.beginPath(); ctx.arc(gx, gy, 10, 0, TAU);
  ctx.lineWidth = 1.8; ctx.strokeStyle = C(OUT); ctx.stroke();
  ctx.fillStyle = FL ? WHITE : 'rgba(160,220,200,0.18)'; ctx.fill();
  if (!FL) {
    // 액체 (끓음)
    ctx.save(); ctx.beginPath(); ctx.arc(gx, gy, 9, 0, TAU); ctx.clip();
    const lvl = gy - 1 - ck * 5 + Math.sin(t * 6) * 0.8;
    ctx.fillStyle = linG(ctx, 'atliq', 0, gy - 8, 0, gy + 9, [0, '#d8ff7a', 0.4, '#7aef3a', 1, '#2a7a1a']);
    ctx.beginPath(); ctx.moveTo(-10, lvl);
    for (let i = 0; i <= 10; i++) ctx.lineTo(-10 + i * 2, lvl + Math.sin(t * (8 + ck * 12) + i * 1.3) * (0.8 + ck * 1.8));
    ctx.lineTo(10, gy + 10); ctx.lineTo(-10, gy + 10); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 5; i++) { const u = (t * (0.8 + ck * 2) + h1(i)) % 1; bubble(ctx, gx - 6 + h1(i + 5) * 12, gy + 8 - u * 12, 0.8 + h1(i + 2) * 1.4, 'rgba(230,255,200,0.8)'); }
    ctx.restore();
    glow(ctx, gx, gy, 20 + ck * 14, '#9aff4a', 0.45 + ck * 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(gx, gy, 7.4, -PI * 0.85, -PI * 0.55); ctx.stroke();
  }
  // 목 + 앞으로 굽은 부리관
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 6.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -63); ctx.lineTo(0, -68); ctx.quadraticCurveTo(2, -72, 10, -68); ctx.lineTo(21, -58); ctx.stroke();
  ctx.strokeStyle = C('rgba(170,220,200,0.55)'); ctx.lineWidth = 4; ctx.stroke();
  if (!FL) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1, -64); ctx.lineTo(-1, -68); ctx.quadraticCurveTo(1, -71, 9, -68.5); ctx.stroke(); }
  // 노즐
  ctx.save(); ctx.translate(22, -57); ctx.rotate(0.75);
  ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(3, -2); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ink(ctx, C(copper), 1.4);
  ctx.restore();
  if (!FL) {
    const drip = (t * 1.3) % 1;
    ctx.fillStyle = '#9aff4a'; ctx.beginPath(); ctx.ellipse(25, -52 + drip * 8, 1.2, 1.2 + drip, 0, 0, TAU); ctx.fill();
    if (charge) glint(ctx, 25, -54, 4 + 6 * ck, '#d8ff9a', ck > 0.5 ? (ck - 0.5) * 2 : 0);
    if (fire) { glow(ctx, 26, -54, 26, '#b0ff4a', fk); glow(ctx, 26, -54, 10, '#ffffe0', fk); }
    // 증기
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.7 + i / 3) % 1;
      const a = (0.25 + ck * 0.3) * (1 - u);
      ctx.fillStyle = `rgba(200,230,200,${a * 0.35})`; ctx.beginPath(); ctx.arc(-4 + Math.sin(t + i) * 3 - u * 6, -70 - u * 22, 3 + u * 6, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
  FL = false;
};

// ── s07 투사체 / 장판 ──
PROJ_B.flask = (ctx, p) => {
  ctx.rotate(p.rot || 0);
  glow(ctx, 0, 0, 16, '#8aff5a', 0.6);
  ctx.beginPath(); ctx.moveTo(-2, -8); ctx.lineTo(2, -8); ctx.lineTo(2, -4); ctx.arc(0, 2, 5.6, -PI * 0.36, PI * 1.36); ctx.lineTo(-2, -4); ctx.closePath();
  ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); ctx.fillStyle = 'rgba(200,240,220,0.55)'; ctx.fill();
  ctx.fillStyle = '#7aff5a'; ctx.beginPath(); ctx.arc(0, 2.6, 4.4, -0.2, PI + 0.2); ctx.fill();
  ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-2.4, -10, 4.8, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(1.5, -1, 1, 3.5);
};
PROJ_B.acid = (ctx, p) => {
  const a = Math.atan2(p.vy, p.vx);
  ctx.rotate(a);
  glow(ctx, 0, 0, 16, '#9aff4a', 0.7);
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.quadraticCurveTo(6, -5, 0, -5); ctx.quadraticCurveTo(-8, -4, -14, 0); ctx.quadraticCurveTo(-8, 4, 0, 5); ctx.quadraticCurveTo(6, 5, 6, 0);
  ctx.fillStyle = radG(ctx, 'acidp', 2, -1, 0.5, 0, 0, 8, [0, '#f8ffd0', 0.4, '#a8ff4a', 1, '#2a8a1a']); ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(10,40,6,0.9)'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(2, -2, 1.3, 0, TAU); ctx.fill();
};
PROJ_B.fleshwave = (ctx, p) => {
  const d = Math.sign(p.vx) || 1;
  ctx.scale(d, 1);
  const k = p.maxLife ? k01(p.life / p.maxLife) : 1;
  const h = 26 * (0.7 + 0.3 * Math.sin(p.t * 30));
  addOn(ctx);
  const g = radG(ctx, 'fwave', 0, 15, 2, 0, 15, 30, [0, 'rgba(230,255,190,0.9)', 0.5, 'rgba(150,200,90,0.45)', 1, 'rgba(60,80,30,0)']);
  ctx.fillStyle = g; ctx.globalAlpha *= k;
  ctx.beginPath(); ctx.moveTo(-26, 15); ctx.quadraticCurveTo(-10, 15 - h * 0.6, 4, 15 - h); ctx.quadraticCurveTo(10, 15 - h * 0.6, 16, 15); ctx.closePath(); ctx.fill();
  addOff(ctx);
  ctx.fillStyle = '#5a4a3a';
  for (let i = 0; i < 5; i++) { const u = (p.t * 3 + i * 0.2) % 1; ctx.fillRect(-18 + i * 7, 13 - Math.sin(u * PI) * 18, 3, 3); }
};
ZONE_B.poison = (ctx, z) => {
  const fade = z.active ? k01(z.life / 0.5) : z.warnK;
  const cx = z.cx, by = z.bottom, w = z.w / 2, t = z.t;
  ctx.save();
  ctx.globalAlpha = fade;
  const g = ctx.createRadialGradient(cx, by - 4, 2, cx, by - 4, w);
  g.addColorStop(0, 'rgba(170,255,90,0.85)'); g.addColorStop(0.6, 'rgba(70,170,40,0.65)'); g.addColorStop(1, 'rgba(20,60,10,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, by - 3, w, 7, 0, 0, TAU); ctx.fill();
  addOn(ctx);
  for (let i = 0; i < 6; i++) {
    const u = (t * 0.9 + h1(i)) % 1, x = cx + (h1(i + 4) - 0.5) * w * 1.6;
    ctx.fillStyle = `rgba(160,255,110,${0.35 * (1 - u)})`; ctx.beginPath(); ctx.arc(x + Math.sin(t * 2 + i) * 4, by - 6 - u * 34, 4 + u * 9, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 4; i++) { const u = (t * 2 + h1(i + 9)) % 1; ctx.strokeStyle = `rgba(220,255,180,${1 - u})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx + (h1(i + 1) - 0.5) * w * 1.3, by - 4, 1 + u * 3, PI, TAU); ctx.stroke(); }
  addOff(ctx);
  ctx.restore();
};
ZONE_B.acid = (ctx, z) => {
  const fade = z.active ? k01(z.life / 0.4) : z.warnK;
  const cx = z.cx, by = z.bottom, w = z.w / 2, t = z.t;
  ctx.save(); ctx.globalAlpha = fade;
  const g = ctx.createRadialGradient(cx, by - 2, 1, cx, by - 2, w);
  g.addColorStop(0, 'rgba(230,255,120,0.9)'); g.addColorStop(0.6, 'rgba(120,220,40,0.6)'); g.addColorStop(1, 'rgba(30,80,10,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, by - 2, w, 4.5, 0, 0, TAU); ctx.fill();
  addOn(ctx);
  for (let i = 0; i < 3; i++) { const u = (t * 1.6 + h1(i + 3)) % 1; ctx.fillStyle = `rgba(200,255,140,${0.4 * (1 - u)})`; ctx.beginPath(); ctx.arc(cx + (h1(i) - 0.5) * w, by - 4 - u * 16, 2 + u * 4, 0, TAU); ctx.fill(); }
  addOff(ctx);
  ctx.restore();
};

// ═════════════════════════ s08 지하 수로 ═════════════════════════
/** 수면 파문 (로컬 y) */
function ripples(ctx, y, w, t, a = 1, col = '#bfe8ff') {
  if (FL || a <= 0.02) return;
  const ga = ctx.globalAlpha;
  addOn(ctx);
  for (let i = 0; i < 3; i++) {
    const u = (t * 0.9 + i / 3) % 1;
    ctx.globalAlpha = ga * a * (1 - u) * 0.8;
    ctx.strokeStyle = col; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, y, w * (0.3 + u), 2 + u * 3, 0, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = ga; addOff(ctx);
}
// ── 어인 ──
RENDER_B.merman = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const scale = '#3a7a6a', scaleD = '#1e4a44', belly = '#b8d0a0', fin = '#e0503a';
  const H = e.def.size.h;
  if (an === 'lurk' || an === 'rise') {
    // 수면 아래: 볏 지느러미와 눈빛만
    const up = an === 'rise' ? ease.inCubic(k01(at / 0.5)) : 0;
    const sy = -H - 14; // 수면
    const fy = sy + 10 - up * 10 + Math.sin(t * 2) * 1.5;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-8, fy + 8); ctx.quadraticCurveTo(-4, fy - 10 - up * 6, 6, fy - 12 - up * 8); ctx.quadraticCurveTo(4, fy - 2, 10, fy + 8); ctx.closePath();
    ink(ctx, linG(ctx, 'mmfinL', 0, fy - 14, 0, fy + 8, [0, lt(fin, 0.2), 1, dk(fin, -0.4)]), 1.6);
    if (!FL) {
      ctx.strokeStyle = 'rgba(80,10,10,0.6)'; ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-3 + i * 4, fy + 6); ctx.lineTo(-1 + i * 4, fy - 6 - i * 2 - up * 6); ctx.stroke(); }
      eyeGlow(ctx, 5, sy + 16 - up * 6, 1.8, '#ffe040', 0.6 + up * 0.6);
      eyeGlow(ctx, -3, sy + 16 - up * 6, 1.4, '#ffe040', 0.4 + up * 0.4);
    }
    ripples(ctx, sy + 4, 18 + up * 10, t, 0.7 + up * 0.5);
    if (!FL) for (let i = 0; i < 4; i++) { const u = (t * 1.3 + h1(i)) % 1; bubble(ctx, (h1(i + 2) - 0.5) * 20, sy + 30 - u * 26, 1 + h1(i + 5) * 1.5, 'rgba(200,240,255,0.7)'); }
    ctx.restore();
    FL = false; return;
  }
  const walk = an === 'walk', leap = an === 'leap', fall = an === 'fall', spit = an === 'spit';
  const ph = t * 8;
  let bob = 0, lean = 0.18, headA = 0, jaw = 0.15, cheek = 0;
  let a1n = 0.4, a2n = 0.9, a1f = 0.2, a2f = 1.0; // 팔
  let l1n = 0.3, l2n = -0.7, l1f = -0.1, l2f = -0.5; // 다리
  if (walk) { bob = Math.abs(Math.sin(ph)) * 2; lean = 0.28; a1n = 0.3 + Math.sin(ph) * 0.4; a1f = 0.3 - Math.sin(ph) * 0.4; l1n = Math.sin(ph) * 0.5 + 0.1; l1f = -Math.sin(ph) * 0.5 + 0.1; l2n = -0.4 - Math.max(0, Math.cos(ph)) * 0.8; l2f = -0.4 - Math.max(0, -Math.cos(ph)) * 0.8; }
  if (leap) { lean = -0.1; a1n = 2.6; a2n = 0.3; a1f = 2.8; a2f = 0.2; l1n = -0.3; l2n = -0.3; l1f = -0.5; l2f = -0.2; headA = -0.25; jaw = 0.5; }
  if (fall) { lean = 0.2; a1n = 1.8; a2n = 0.5; a1f = 1.4; a2f = 0.6; l1n = 0.6; l2n = -1.2; l1f = 0.3; l2f = -1.0; jaw = 0.4; }
  if (spit) {
    const wu = e.params?.spit ?? 0.5;
    if (at < wu) { cheek = ease.outCubic(k01(at / wu)); lean = lerp(0.18, -0.12, cheek); headA = -0.2 * cheek; a1n = 0.9; a2n = 1.4; }
    else { const k = 1 - k01((at - wu) / 0.4); jaw = 0.2 + 0.8 * k; lean = 0.35 * k; headA = 0.2 * k; a1n = 1.2; a2n = 0.4; }
  }
  if (!walk && !leap && !fall && !spit) { bob = Math.sin(t * 2.4) * 1; jaw = 0.12 + Math.max(0, Math.sin(t * 1.3)) * 0.12; }
  if (hurtOf(e)) { lean = -0.2; headA = -0.3; }
  const air = leap || fall;
  if (!air) shadow(ctx, 16);
  const hipY = -34 + bob;
  const leg = (x, a1, a2, near) => {
    end(x, hipY, a1, 17); const kx = EX, ky = EY; end(kx, ky, a1 + a2, 17);
    let fx = EX, fy = air ? EY : Math.min(EY, 0);
    softLimb(ctx, x, hipY, kx, ky, fx, fy, 4.4, 3.2, near ? scale : scaleD, near);
    // 물갈퀴 발
    ctx.beginPath(); ctx.moveTo(fx - 3, fy - 2); ctx.lineTo(fx + 9, fy - 1); ctx.lineTo(fx + 7, fy + 1); ctx.lineTo(fx + 4, fy); ctx.lineTo(fx + 1, fy + 1.5); ctx.lineTo(fx - 3, fy + 1); ctx.closePath();
    ink(ctx, C(near ? fin : dk(fin, -0.3)), 1.2);
  };
  leg(-4, l1f, l2f, false);
  // 먼 팔
  const shY = hipY - 32;
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY);
  end(-4, shY, a1f, 14); let ex = EX, ey = EY; end(ex, ey, a1f + a2f, 13);
  softLimb(ctx, -4, shY, ex, ey, EX, EY, 3.6, 2.8, scaleD, false);
  claws(ctx, EX, EY, '#c8d0b0', air ? 1 : 0, 4);
  // 등지느러미
  ctx.beginPath(); ctx.moveTo(-9, shY + 2); ctx.quadraticCurveTo(-20, shY + 8 + Math.sin(t * 4) * 2, -14, hipY - 4); ctx.lineTo(-8, hipY - 6); ctx.closePath();
  ink(ctx, linG(ctx, 'mmfinB', -20, 0, -8, 0, [0, lt(fin, 0.2), 1, dk(fin, -0.3)]), 1.4);
  // 몸통
  ctx.beginPath();
  ctx.moveTo(-9, shY); ctx.bezierCurveTo(-12, shY + 12, -10, hipY - 4, -6, hipY + 2);
  ctx.lineTo(6, hipY + 2); ctx.bezierCurveTo(12, hipY - 8, 12, shY + 10, 8, shY - 1); ctx.quadraticCurveTo(0, shY - 5, -9, shY); ctx.closePath();
  ink(ctx, cyl(ctx, 'mmbody', -11, 11, scale), 2);
  if (!FL) {
    // 배 비늘판
    ctx.fillStyle = belly; ctx.beginPath(); ctx.moveTo(3, shY + 4); ctx.bezierCurveTo(9, shY + 10, 9, hipY - 8, 4, hipY); ctx.lineTo(0, hipY); ctx.bezierCurveTo(3, hipY - 10, 3, shY + 12, 1, shY + 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,80,50,0.5)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) { const y = shY + 8 + i * 4.6; ctx.beginPath(); ctx.moveTo(1.5, y); ctx.lineTo(7.5, y + 0.5); ctx.stroke(); }
    // 비늘 무늬
    ctx.strokeStyle = 'rgba(160,230,200,0.3)'; ctx.lineWidth = 0.8;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { const x = -7 + c * 4 + (r % 2) * 2, y = shY + 6 + r * 6; ctx.beginPath(); ctx.arc(x, y, 2, 0.2, PI - 0.2); ctx.stroke(); }
    ctx.strokeStyle = mixCache(scale, RIM, 0.6, 0); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-9.5, shY + 1); ctx.bezierCurveTo(-12.5, shY + 12, -10.5, hipY - 4, -6.5, hipY + 1); ctx.stroke();
  }
  // 머리 (물고기)
  ctx.save(); ctx.translate(3, shY - 6); ctx.rotate(headA);
  // 볏
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.quadraticCurveTo(-10, -18, 0, -20 + Math.sin(t * 5) * 1.5); ctx.quadraticCurveTo(-1, -12, 6, -8); ctx.closePath();
  ink(ctx, linG(ctx, 'mmcrest', 0, -20, 0, -4, [0, lt(fin, 0.25), 1, dk(fin, -0.3)]), 1.4);
  if (!FL) { ctx.strokeStyle = 'rgba(90,10,10,0.6)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(-6, -15); ctx.moveTo(-1, -6); ctx.lineTo(-2, -17); ctx.moveTo(2, -7); ctx.lineTo(1, -16); ctx.stroke(); }
  // 두상
  const J = jaw * 7, ch = cheek * 3;
  ctx.beginPath();
  ctx.moveTo(-7, 4); ctx.quadraticCurveTo(-9, -8, 2, -9); ctx.quadraticCurveTo(12, -8, 15, -1);
  ctx.lineTo(15, 1); ctx.lineTo(4, 2);
  ctx.lineTo(14, 3 + J); ctx.quadraticCurveTo(10 + ch, 8 + J * 0.6 + ch, 1, 8 + ch); ctx.quadraticCurveTo(-6, 8, -7, 4); ctx.closePath();
  ink(ctx, sph(ctx, 'mmhead', 3, -1, 12, scale), 1.8);
  if (!FL) {
    // 입속 + 이빨
    ctx.fillStyle = spit && at > (e.params?.spit ?? 0.5) ? '#ff8a2a' : '#3a0a10';
    ctx.beginPath(); ctx.moveTo(4, 2); ctx.lineTo(15, 1); ctx.lineTo(14, 3 + J); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0ecd8';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(6 + i * 2.2, 1.6); ctx.lineTo(6.8 + i * 2.2, 3.4); ctx.lineTo(7.6 + i * 2.2, 1.5); ctx.fill(); }
    // 아가미
    ctx.strokeStyle = '#8a2a2a'; ctx.lineWidth = 0.9;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-3 + i * 2, 2, 3, -0.8, 0.8); ctx.stroke(); }
    // 부푼 볼
    if (cheek > 0.05) { ctx.fillStyle = `rgba(255,150,80,${cheek * 0.5})`; ctx.beginPath(); ctx.arc(8, 5, 2 + ch, 0, TAU); ctx.fill(); glow(ctx, 9, 4, 8 + ch * 4, '#ff8a2a', cheek * 0.8); }
    // 큰 물고기 눈
    ctx.fillStyle = '#10181a'; ctx.beginPath(); ctx.arc(6, -4, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe040'; ctx.beginPath(); ctx.arc(6.3, -4, 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.arc(6.8, -4, 1.2, 0, TAU); ctx.fill();
    glow(ctx, 6.3, -4, 9, '#ffe040', 0.45);
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(7.3, -5, 0.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = mixCache(scale, RIM, 0.65, 0); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-7, 3); ctx.quadraticCurveTo(-8.5, -7, 1, -8.5); ctx.stroke();
  }
  ctx.restore();
  // 가까운 팔
  end(5, shY + 1, a1n, 14); ex = EX; ey = EY; end(ex, ey, a1n + a2n, 13);
  softLimb(ctx, 5, shY + 1, ex, ey, EX, EY, 4, 3, scale, true);
  if (!FL) { ctx.fillStyle = fin; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 6, ey - 4); ctx.lineTo(ex - 2, ey + 3); ctx.closePath(); ctx.fill(); }
  claws(ctx, EX, EY, '#e8f0d0', air ? 1 : 0, 5);
  ctx.restore();
  leg(4, l1n, l2n, true);
  // 물방울 (뛰어오를 때)
  if (air && !FL) for (let i = 0; i < 5; i++) { const u = (t * 2 + h1(i)) % 1; ctx.fillStyle = `rgba(160,220,255,${0.8 * (1 - u)})`; ctx.beginPath(); ctx.arc((h1(i + 3) - 0.5) * 24, -40 + u * 50, 1.5, 0, TAU); ctx.fill(); }
  if (spit && !FL) { const wu = e.params?.spit ?? 0.5; if (at < wu) glint(ctx, 20, shY - 4, 4 + 5 * cheek, '#ffb060', cheek > 0.5 ? (cheek - 0.5) * 2 : 0); }
  FL = false;
};

// ── 살인 물고기 ──
RENDER_B.killer_fish = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const back = '#2a3a5a', side = '#5a6a8a', bellyC = '#c83a3a';
  const under = an === 'swim' || an === 'ripple';
  let rot = 0, bend = Math.sin(t * 12) * 0.15, jaw = 0.25;
  if (an === 'leap') { rot = Math.atan2(e.vy ?? 0, Math.abs(e.vx ?? 1) + 1); bend = Math.sin(t * 18) * 0.25; jaw = 0.55 + 0.25 * Math.sin(t * 20); }
  ctx.save();
  if (under) {
    ctx.globalAlpha *= 0.55;
    ctx.translate(0, 4);
  }
  ctx.translate(0, -13); ctx.rotate(rot);
  // 꼬리
  ctx.save(); ctx.translate(-12, 0); ctx.rotate(bend);
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-10, -10); ctx.quadraticCurveTo(-6, 0, -10, 10); ctx.closePath();
  ink(ctx, linG(ctx, 'kftail', -10, -10, -10, 10, [0, lt(back, 0.15), 1, dk(bellyC, -0.3)]), 1.4);
  ctx.restore();
  // 몸 (높고 짧은 피라냐 체형)
  ctx.beginPath();
  ctx.moveTo(-13, -2); ctx.bezierCurveTo(-8, -12, 6, -13, 13, -5);
  ctx.lineTo(18, 0); // 주둥이
  ctx.lineTo(11, 2);
  ctx.lineTo(19, 3 + jaw * 7); // 아래턱
  ctx.bezierCurveTo(10, 12, -6, 10, -13, 2); ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'kfbody', 0, -13, 0, 11, [0, back, 0.45, side, 0.7, bellyC, 1, dk(bellyC, -0.4)]), 1.8);
  // 등지느러미 (가시)
  ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-3, -18); ctx.lineTo(0, -11); ctx.lineTo(3, -17); ctx.lineTo(6, -10); ctx.closePath();
  ink(ctx, C(dk(back, -0.2)), 1.2);
  if (!FL) {
    // 비늘 광택
    ctx.strokeStyle = 'rgba(180,200,255,0.25)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-6 + i * 4, -2, 3, -1, 1); ctx.stroke(); }
    // 입 + 이빨
    ctx.fillStyle = '#3a0608'; ctx.beginPath(); ctx.moveTo(11, 2); ctx.lineTo(18, 0.5); ctx.lineTo(19, 3 + jaw * 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f4f0e0';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(12.5 + i * 2, 1.4); ctx.lineTo(13.3 + i * 2, 3.6); ctx.lineTo(14 + i * 2, 1.2); ctx.fill(); }
    for (let i = 0; i < 3; i++) { const y = 3 + jaw * 7; ctx.beginPath(); ctx.moveTo(12 + i * 2.3, y - 0.8 - i * 0.2); ctx.lineTo(12.8 + i * 2.3, y - 3.4); ctx.lineTo(13.6 + i * 2.3, y - 0.6 - i * 0.2); ctx.fill(); }
    // 가슴지느러미
    ctx.fillStyle = 'rgba(220,80,70,0.8)'; ctx.beginPath(); ctx.moveTo(0, 3); ctx.quadraticCurveTo(-4, 8 + Math.sin(t * 14) * 2, -7, 5); ctx.closePath(); ctx.fill();
    // 눈
    ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.arc(8, -4, 2.6, 0, TAU); ctx.fill();
    eyeGlow(ctx, 8.4, -4, 1.4, '#ff3a2a', 1);
    ctx.strokeStyle = mixCache(back, RIM, 0.6, 0); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-12, -3); ctx.bezierCurveTo(-7, -11.5, 5, -12.5, 12, -5.5); ctx.stroke();
  }
  ctx.restore();
  if (under) {
    // 수면을 가르는 등지느러미 + 파문 (수면 = 몸 위쪽)
    ctx.save();
    if (!FL) {
      const fy = -24 + Math.sin(t * 3) * 1;
      ctx.fillStyle = dk(back, -0.1); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-5, fy + 6); ctx.lineTo(-1, fy - 4 - (an === 'ripple' ? 3 : 0)); ctx.lineTo(4, fy + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ripples(ctx, fy + 6, an === 'ripple' ? 22 : 12, t * (an === 'ripple' ? 2 : 1), an === 'ripple' ? 1 : 0.5);
      if (an === 'ripple') glint(ctx, 0, fy - 2, 4 + 4 * Math.sin(t * 30), '#dff4ff', k01(at / 0.3));
    }
    ctx.restore();
  }
  FL = false;
};

// ── 마계 개구리 ──
RENDER_B.frog_demon = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const skin = '#4a5a34', skinD = '#2a341e', bellyC = '#c8b888', wart = '#ff8a2a';
  const swell = an === 'swell', tongue = an === 'tongue', jump = an === 'jump', land = an === 'land';
  let sq = 1, sx = 1, lift = 0, sac = 0.15 + Math.sin(t * 3) * 0.08, mouth = 0, legExt = 0;
  if (swell) { sac = 0.2 + ease.outCubic(k01(at / 0.45)) * 0.9; sq = 0.94; }
  if (tongue) { sac = 0.3; mouth = 1; }
  if (jump) { legExt = 1; sq = 1.08; sx = 0.92; lift = 4; }
  if (land) { const k = 1 - k01(at / 0.3); sq = 1 - 0.2 * k; sx = 1 + 0.18 * k; }
  if (!jump) shadow(ctx, 26, 0.45);
  ctx.save(); ctx.translate(0, -lift); ctx.scale(sx, sq);
  // 뒷다리 (접힌 큰 다리)
  const hind = (near) => {
    const col = near ? skin : skinD;
    ctx.save(); ctx.translate(near ? -10 : -14, -14);
    if (legExt) {
      softLimb(ctx, 0, 0, -10, 10, -22, 14, 6, 3.5, col, near);
      ctx.beginPath(); ctx.ellipse(-24, 14, 5, 2.4, 0.3, 0, TAU); ink(ctx, C(col), 1.2);
    } else {
      ctx.beginPath(); ctx.ellipse(0, 2, 12, 9, -0.3, 0, TAU); ink(ctx, sph(ctx, 'fdthigh' + near, 0, 2, 12, col), 1.6);
      softLimb(ctx, 4, 8, 12, 12, 6, 14, 4, 3, col, near);
      ctx.beginPath(); ctx.moveTo(2, 14); ctx.lineTo(14, 14); ctx.lineTo(16, 12); ctx.lineTo(10, 12); ctx.closePath(); ink(ctx, C(dk(col, -0.2)), 1.2);
    }
    ctx.restore();
  };
  hind(false);
  // 몸통 (부푼 두꺼비)
  ctx.beginPath();
  ctx.moveTo(-24, -10); ctx.bezierCurveTo(-26, -30, -6, -38, 10, -34);
  ctx.bezierCurveTo(22, -32, 28, -22, 26, -12);
  ctx.bezierCurveTo(24, -2, 10, 0, -2, -1);
  ctx.bezierCurveTo(-14, -1, -22, -3, -24, -10); ctx.closePath();
  ink(ctx, sph(ctx, 'fdbody', 4, -20, 28, skin), 2);
  if (!FL) {
    // 배
    ctx.fillStyle = bellyC; ctx.beginPath(); ctx.moveTo(-8, -3); ctx.bezierCurveTo(4, 2, 20, -2, 24, -12); ctx.bezierCurveTo(14, -8, 0, -8, -8, -3); ctx.fill();
    // 발광 사마귀
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const warts = [[-14, -24, 2.4], [-4, -30, 2], [-18, -14, 1.8], [6, -28, 1.6], [-8, -18, 1.4], [14, -26, 1.3]];
    for (const [x, y, r] of warts) {
      ctx.fillStyle = '#3a2a14'; ctx.beginPath(); ctx.arc(x, y, r + 0.8, 0, TAU); ctx.fill();
      ctx.fillStyle = wart; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      glow(ctx, x, y, r * 4, wart, 0.35 + pulse * 0.3);
    }
    // 등 줄무늬
    ctx.strokeStyle = 'rgba(20,30,10,0.5)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-20, -18); ctx.quadraticCurveTo(-8, -32, 8, -33); ctx.stroke();
    ctx.strokeStyle = mixCache(skin, RIM, 0.6, 0); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-24, -11); ctx.bezierCurveTo(-26, -29, -7, -37, 8, -34); ctx.stroke();
  }
  // 목주머니 (팽창)
  if (sac > 0.1) {
    const r = 4 + sac * 9;
    ctx.beginPath(); ctx.ellipse(16, -8 + sac * 2, r * 1.1, r, 0, 0, TAU);
    ink(ctx, FL ? WHITE : radG(ctx, 'fdsac', -2, -3, 1, 0, 0, 12, [0, '#ffd0c0', 0.5, '#e0607a', 1, '#6a1a2a']), 1.4);
    if (!FL && swell) glow(ctx, 16, -8, r * 2.2, '#ff5a7a', sac * 0.6);
  }
  // 머리 윗부분: 튀어나온 눈 + 뿔
  for (const [x, near] of [[8, false], [16, true]]) {
    ctx.beginPath(); ctx.arc(x, -33, 6, 0, TAU); ink(ctx, sph(ctx, 'fdeyeb' + near, x, -33, 6, near ? skin : skinD), 1.6);
    if (!FL) {
      ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.arc(x + 1.5, -33.5, 3.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#100a04'; ctx.beginPath(); ctx.ellipse(x + 2, -33.5, 2.4, swell ? 0.6 : 1.1, 0, 0, TAU); ctx.fill();
      glow(ctx, x + 1.5, -33.5, 10, '#ffc030', near ? 0.55 : 0.3);
      ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(x + 2.6, -35, 0.9, 0, TAU); ctx.fill();
    }
    // 뿔
    ctx.beginPath(); ctx.moveTo(x - 4, -37); ctx.quadraticCurveTo(x - 8, -46, x - 13, -46); ctx.quadraticCurveTo(x - 7, -42, x - 1, -38); ctx.closePath();
    ink(ctx, linG(ctx, 'fdhorn', 0, -46, 0, -37, [0, '#e8dcc0', 1, '#5a4a3a']), 1.2);
  }
  // 입 (넓은 선) + 혀
  if (!FL) {
    ctx.strokeStyle = '#1a1008'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(4, -18 - mouth * 2); ctx.quadraticCurveTo(16, -16, 26, -15); ctx.stroke();
  }
  if (tongue) {
    const L = e.tongue ?? 150;
    const my = -17;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C(OUT); ctx.lineWidth = 7.5;
    ctx.beginPath(); ctx.moveTo(24, my); ctx.quadraticCurveTo(24 + L * 0.5, my - 6, 20 + L, my + 1); ctx.stroke();
    ctx.strokeStyle = C('#e0507a'); ctx.lineWidth = 5; ctx.stroke();
    if (!FL) { ctx.strokeStyle = 'rgba(255,200,210,0.6)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(24, my - 1.5); ctx.quadraticCurveTo(24 + L * 0.5, my - 7.5, 20 + L, my - 0.5); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(20 + L, my + 1, 6, 0, TAU); ink(ctx, FL ? WHITE : radG(ctx, 'fdtip', -2, -2, 1, 0, 0, 6, [0, '#ffc0d0', 1, '#b02a5a']), 1.6);
    if (!FL) { ctx.fillStyle = 'rgba(220,255,200,0.6)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(24 + L * (0.3 + i * 0.25), my + 3 + Math.sin(t * 9 + i) * 1.5, 1, 0, TAU); ctx.fill(); } }
  }
  // 앞다리
  softLimb(ctx, 14, -8, 18, -2, 22, 0, 3.4, 2.6, skin, true);
  ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(27, 0.5); ctx.lineTo(25, -2); ctx.closePath(); ink(ctx, C(skinD), 1.1);
  hind(true);
  ctx.restore();
  if (swell && !FL) glint(ctx, 30, -18, 4 + 5 * Math.sin(t * 25), '#ffb0c0', k01(at / 0.45));
  FL = false;
};

// ── 익사체 ──
RENDER_B.drowned = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const skin = '#7a8e8c', skinD = '#4a5a5c', cloth = '#2a3440', weed = '#2a5a3a';
  const walk = an === 'walk', rise = an === 'rise', spew = an === 'spew';
  const ph = t * 4.5;
  let bob = 0, lean = 0.12, sway = 0, bloat = 0, gush = 0, jaw = 0.3, armN = 0.9, armF = 0.7, headA = 0.25;
  if (walk) { bob = Math.abs(Math.sin(ph)) * 2; lean = 0.2 + Math.sin(ph * 0.5) * 0.05; sway = Math.sin(ph) * 0.08; armN = 1.2 + Math.sin(ph) * 0.2; armF = 1.0 - Math.sin(ph) * 0.2; }
  if (spew) {
    const wu = 0.55;
    if (at < wu) { bloat = ease.outCubic(k01(at / wu)); lean = lerp(0.12, 0.4, bloat); armN = lerp(0.9, 0.2, bloat); armF = lerp(0.7, 0.3, bloat); headA = lerp(0.25, 0.6, bloat); }
    else { gush = at < wu + 0.6 ? 1 : 1 - k01((at - wu - 0.6) / 0.35); bloat = 1 - k01((at - wu) / 0.6); lean = -0.05; headA = -0.2; jaw = 1; armN = 0.6; armF = 0.4; }
  }
  if (!walk && !spew && !rise) { bob = Math.sin(t * 1.4) * 0.8; sway = Math.sin(t * 1.1) * 0.05; }
  // 솟아오름: 아래를 잘라 땅/물에서 올라오는 연출
  const rk = rise ? ease.outCubic(k01((e.stateT ?? at) / (e.params?.riseTime ?? 1.0))) : 1;
  shadow(ctx, 15);
  ctx.save();
  if (rise) { ctx.beginPath(); ctx.rect(-60, -140, 120, 140); ctx.clip(); ctx.translate(0, (1 - rk) * 82); }
  const hipY = -36 + bob;
  // 다리 (부은, 끌림)
  const leg = (x, p, near) => {
    const s = walk ? Math.sin(ph + p) * 0.35 : 0;
    end(x, hipY, s, 18); const kx = EX, ky = EY; end(kx, ky, s * 0.3 - (walk ? Math.max(0, Math.cos(ph + p)) * 0.4 : 0), 18);
    softLimb(ctx, x, hipY, kx, ky, EX, Math.min(EY, -1), 5.5, 4, near ? cloth : dk(cloth, -0.3), near);
    ctx.beginPath(); ctx.ellipse(EX + 2, -2, 5.5, 2.6, 0, 0, TAU); ink(ctx, C(near ? skinD : dk(skinD, -0.3)), 1.2);
  };
  leg(-5, PI, false);
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean + sway); ctx.translate(0, -hipY);
  const shY = hipY - 34;
  // 먼 팔
  end(-5, shY + 2, armF, 16); let ex = EX, ey = EY; end(ex, ey, armF + 0.2, 15);
  softLimb(ctx, -5, shY + 2, ex, ey, EX, EY, 4.2, 3.4, skinD, false);
  // 몸통 (부푼 배)
  const bl = bloat * 5;
  ctx.beginPath();
  ctx.moveTo(-10, shY); ctx.bezierCurveTo(-14, shY + 14, -13 - bl * 0.3, hipY - 6, -8, hipY + 2);
  ctx.lineTo(8, hipY + 2); ctx.bezierCurveTo(16 + bl, hipY - 6, 15 + bl, shY + 14, 9, shY - 1); ctx.quadraticCurveTo(0, shY - 4, -10, shY); ctx.closePath();
  ink(ctx, cyl(ctx, 'drbody', -13, 14, skin), 2);
  if (!FL) {
    // 찢어진 셔츠
    ctx.fillStyle = cloth; ctx.beginPath(); ctx.moveTo(-10, shY); ctx.quadraticCurveTo(0, shY - 4, 9, shY - 1); ctx.lineTo(11, shY + 14); ctx.lineTo(7, shY + 10); ctx.lineTo(4, shY + 17); ctx.lineTo(0, shY + 12); ctx.lineTo(-4, shY + 18); ctx.lineTo(-8, shY + 12); ctx.lineTo(-12, shY + 15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a2028'; ctx.fillRect(-9, hipY - 4, 18, 6);
    // 부은 배 반점 + 핏줄
    ctx.fillStyle = 'rgba(60,90,100,0.45)'; ctx.beginPath(); ctx.arc(6 + bl * 0.5, hipY - 12, 3 + bl * 0.4, 0, TAU); ctx.arc(1, hipY - 18, 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(40,60,80,0.55)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(2, hipY - 22); ctx.quadraticCurveTo(8, hipY - 16, 5, hipY - 8); ctx.moveTo(6, hipY - 17); ctx.lineTo(10 + bl * 0.6, hipY - 14); ctx.stroke();
    // 물방울
    for (let i = 0; i < 3; i++) { const u = (t * 0.8 + i / 3) % 1; ctx.fillStyle = `rgba(150,210,230,${0.8 * (1 - u)})`; ctx.beginPath(); ctx.ellipse(-8 + i * 7, hipY + 2 + u * 30, 1, 1.6, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = mixCache(skin, RIM, 0.6, 0); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-10.5, shY + 1); ctx.bezierCurveTo(-14.5, shY + 14, -13.5, hipY - 6, -8.5, hipY + 1); ctx.stroke();
  }
  // 머리 (늘어진 턱, 흐린 눈, 해초)
  ctx.save(); ctx.translate(3, shY - 7); ctx.rotate(headA);
  ctx.beginPath(); ctx.moveTo(-7, 2); ctx.quadraticCurveTo(-8, -9, 1, -10); ctx.quadraticCurveTo(9, -10, 9, -2); ctx.lineTo(8, 4 + jaw * 3); ctx.quadraticCurveTo(2, 8 + jaw * 4, -4, 6); ctx.closePath();
  ink(ctx, sph(ctx, 'drhead', 1, -3, 10, skin), 1.8);
  if (!FL) {
    ctx.fillStyle = '#1a2228'; ctx.beginPath(); ctx.ellipse(4, 3 + jaw * 2, 3, 1 + jaw * 2.2, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#243038'; ctx.beginPath(); ctx.ellipse(4, -3, 2.6, 2.2, 0, 0, TAU); ctx.ellipse(-1.5, -3.4, 1.8, 1.9, 0, 0, TAU); ctx.fill();
    eyeGlow(ctx, 4.2, -3, 1.4, '#bff4ff', 0.8);
    eyeGlow(ctx, -1.4, -3.4, 1, '#bff4ff', 0.5);
    // 해초 머리칼
    ctx.strokeStyle = weed; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const x = -6 + i * 3, sw = Math.sin(t * 2 + i) * 2;
      ctx.beginPath(); ctx.moveTo(x, -9); ctx.quadraticCurveTo(x - 4 + sw, 0, x - 6 + sw * 1.5, 6 + i % 2 * 4); ctx.stroke();
    }
    ctx.strokeStyle = '#4a8a4a'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-3, -9); ctx.quadraticCurveTo(-7, 0, -9, 6); ctx.stroke();
  }
  ctx.restore();
  // 가까운 팔 (배를 움켜쥠)
  end(6, shY + 3, armN, 16); ex = EX; ey = EY; end(ex, ey, armN + (spew && bloat > 0.3 ? 1.6 : 0.15), 15);
  softLimb(ctx, 6, shY + 3, ex, ey, EX, EY, 4.4, 3.6, skin, true);
  if (!FL) { ctx.strokeStyle = weed; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.quadraticCurveTo(ex - 3, ey + 6, ex - 2 + Math.sin(t * 3) * 2, ey + 12); ctx.stroke(); }
  ctx.fillStyle = C(skinD); ctx.beginPath(); ctx.arc(EX, EY, 3.2, 0, TAU); ctx.fill();
  ctx.restore();
  leg(5, 0, true);
  // 썩은 물 분사
  if (gush > 0.02 && !FL) {
    const mx = 12, my = shY - 2, L = (e.params?.spew ?? 150) * gush;
    addOn(ctx);
    const g = linG(ctx, 'drgush', mx, 0, mx + 150, 0, [0, 'rgba(200,240,230,0.85)', 0.5, 'rgba(120,180,170,0.55)', 1, 'rgba(60,110,100,0)']);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(mx, my - 3);
    for (let i = 0; i <= 8; i++) { const u = i / 8; ctx.lineTo(mx + L * u, my - 3 - u * 14 + Math.sin(t * 30 + i) * 2 * u + u * u * 10); }
    for (let i = 8; i >= 0; i--) { const u = i / 8; ctx.lineTo(mx + L * u, my + 3 + u * 10 + Math.sin(t * 27 + i) * 2 * u + u * u * 16); }
    ctx.closePath(); ctx.fill();
    addOff(ctx);
  }
  ctx.restore();
  if (rise && !FL) { ctx.fillStyle = 'rgba(40,50,60,0.8)'; ctx.beginPath(); ctx.ellipse(0, -1, 20 * rk + 6, 4, 0, 0, TAU); ctx.fill(); ripples(ctx, -2, 20, t, 0.8); }
  if (spew && at < 0.55 && !FL) glint(ctx, 16, shY - 8, 4 + 4 * bloat, '#dff8ff', bloat > 0.5 ? (bloat - 0.5) * 2 : 0);
  FL = false;
};

// ── 물의 정령 ──
RENDER_B.water_spirit = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const cast = an === 'cast', summon = an === 'summon';
  const ck = cast ? k01(at / 0.6) : summon ? k01(at / 0.35) : 0;
  const bob = Math.sin(t * 2.2) * 3;
  const ga = ctx.globalAlpha;
  ctx.save(); ctx.translate(0, bob);
  glow(ctx, 0, -38, 50, '#3aa8ff', 0.3);
  // 흘러내리는 머리칼 (뒤, 물결 리본)
  const hair = (off, len, wid, col, a) => {
    ctx.beginPath();
    ctx.moveTo(-2, -68);
    for (let k = 1; k <= 6; k++) { const u = k / 6; ctx.lineTo(-4 - u * len * 0.55 + off, -66 + u * len + Math.sin(t * 3 - u * 4 + off) * (2 + u * 5)); }
    for (let k = 6; k >= 1; k--) { const u = k / 6; ctx.lineTo(-4 - u * len * 0.55 + off + wid * (1 - u * 0.7), -66 + u * len + Math.sin(t * 3 - u * 4 + off + 0.4) * (2 + u * 5) - wid * 0.2); }
    ctx.lineTo(4, -64); ctx.closePath();
    if (FL) { ctx.fillStyle = WHITE; ctx.fill(); return; }
    ctx.globalAlpha = ga * a; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = ga;
  };
  hair(-3, 46, 7, '#2a7ac0', 0.75);
  hair(0, 40, 6, '#4aa8e8', 0.75);
  // 소용돌이 하체 (나선)
  if (!FL) {
    addOn(ctx);
    for (let i = 0; i < 8; i++) {
      const u = i / 8, y = -24 + u * 22, r = 14 * (1 - u * 0.78);
      const a0 = t * 5 + i * 0.9;
      ctx.strokeStyle = `rgba(${110 + i * 15},${200 + i * 6},255,${0.6 - u * 0.35})`; ctx.lineWidth = 2.6 - u * 1.2;
      ctx.beginPath(); ctx.ellipse(Math.sin(t * 2 + u * 4) * 3 * u, y, r, r * 0.32, 0, a0, a0 + PI * 1.3); ctx.stroke();
    }
    addOff(ctx);
  }
  // 몸 (물 드레스: 가는 허리 → 퍼지는 치맛자락 → 소용돌이)
  ctx.globalAlpha = ga * (FL ? 1 : 0.84);
  ctx.beginPath();
  ctx.moveTo(-6, -56);
  ctx.bezierCurveTo(-11, -52, -9, -44, -5, -40);          // 가슴 뒤
  ctx.bezierCurveTo(-8, -34, -15, -28, -14 + Math.sin(t * 3) * 2, -20);   // 치맛자락 뒤
  ctx.quadraticCurveTo(-6, -16, -2 + Math.sin(t * 4) * 2, -6);
  ctx.quadraticCurveTo(4, -14, 14 + Math.sin(t * 3 + 1) * 2, -20);        // 치맛자락 앞
  ctx.bezierCurveTo(12, -28, 7, -34, 5, -40);
  ctx.bezierCurveTo(9, -44, 9, -52, 5, -56);
  ctx.quadraticCurveTo(0, -59, -6, -56); ctx.closePath();
  ctx.lineWidth = 1.8; ctx.strokeStyle = C('#0a2a4a'); ctx.stroke();
  ctx.fillStyle = FL ? WHITE : linG(ctx, 'wsbody2', -10, -58, 8, -8, [0, '#dffaff', 0.35, '#6ac8f4', 0.75, '#2a7ac0', 1, '#123a70']); ctx.fill();
  ctx.globalAlpha = ga;
  if (!FL) {
    // 물결 무늬 + 림/하이라이트
    addOn(ctx);
    ctx.strokeStyle = 'rgba(200,245,255,0.45)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const y = -34 + i * 5, s = (t * 20 + i * 7) % 10; ctx.beginPath(); ctx.moveTo(-8 - i * 2, y); ctx.quadraticCurveTo(-2, y - 3 + s * 0.2, 7 + i * 2, y + 1); ctx.stroke(); }
    addOff(ctx);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(5.5, -54); ctx.bezierCurveTo(8.5, -50, 8, -44, 5.5, -40); ctx.bezierCurveTo(8, -34, 12, -28, 13, -21); ctx.stroke();
    ctx.strokeStyle = 'rgba(180,200,255,0.65)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-6.5, -55); ctx.bezierCurveTo(-11, -51, -9, -44, -5.5, -40); ctx.bezierCurveTo(-8.5, -34, -14, -28, -14, -21); ctx.stroke();
  }
  // 팔
  const armA = cast ? lerp(0.5, 1.45, ck) : summon ? lerp(0.5, 2.8, ck) : 0.35 + Math.sin(t * 1.8) * 0.15;
  for (const near of [false, true]) {
    const sx = near ? 3 : -4, sy = -52;
    const a = armA + (near ? 0 : -0.3);
    end(sx, sy, a, 11); const ex = EX, ey = EY; end(ex, ey, a + (cast ? -0.3 : 0.35), 10);
    ctx.globalAlpha = ga * 0.88;
    softLimb(ctx, sx, sy, ex, ey, EX, EY, 2.3, 1.5, near ? '#7ad8ff' : '#3a90d0', near);
    ctx.globalAlpha = ga;
    if (near && !FL) {
      // 팔에서 흘러내리는 물
      addOn(ctx); ctx.strokeStyle = 'rgba(160,230,255,0.5)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.quadraticCurveTo(ex - 3, ey + 8, ex - 1 + Math.sin(t * 5) * 2, ey + 14); ctx.stroke(); addOff(ctx);
      if (cast || summon) glow(ctx, EX, EY, 10 + ck * 12, '#8ae8ff', 0.5 + ck * 0.5);
    }
  }
  // 머리
  ctx.globalAlpha = ga * (FL ? 1 : 0.92);
  ctx.beginPath(); ctx.ellipse(1, -64, 6.2, 7.2, 0.1, 0, TAU);
  ink(ctx, FL ? WHITE : radG(ctx, 'wshead', 3, -67, 1, 1, -64, 8, [0, '#effcff', 0.5, '#8ad8ff', 1, '#2a78b8']), 1.6);
  // 앞머리 물결
  ctx.beginPath(); ctx.moveTo(-5, -66); ctx.quadraticCurveTo(0, -74, 7, -68); ctx.quadraticCurveTo(2, -70, -1, -66); ctx.quadraticCurveTo(-3, -62, -6, -60); ctx.closePath();
  ctx.fillStyle = C('#3a98d8'); ctx.fill();
  ctx.globalAlpha = ga;
  if (!FL) {
    eyeGlow(ctx, 4, -64.5, 1.2, '#ffffff', 0.9);
    eyeGlow(ctx, -0.6, -64.8, 0.9, '#ffffff', 0.6);
    ctx.strokeStyle = 'rgba(20,60,100,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(2.5, -61, 1.4, 0.3, PI - 0.3); ctx.stroke();
    // 심장 (빛나는 물방울 핵)
    const pul = 0.7 + 0.3 * Math.sin(t * 4) + ck * 0.4;
    glow(ctx, 1, -46, 16 * pul, '#bff8ff', 0.75);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(1, -51); ctx.quadraticCurveTo(4, -46, 1, -43); ctx.quadraticCurveTo(-2, -46, 1, -51); ctx.fill();
    for (let i = 0; i < 5; i++) { const a = t * 1.5 + i * TAU / 5; bubble(ctx, Math.cos(a) * 20, -40 + Math.sin(a * 1.3) * 18, 1.2 + h1(i) * 1.5, 'rgba(200,240,255,0.7)'); }
    if (cast) {
      const r = 3 + ck * 5;
      glow(ctx, 17, -48, r * 3, '#6ad8ff', ck);
      ctx.fillStyle = 'rgba(200,245,255,0.9)'; ctx.beginPath(); ctx.arc(17, -48, r, 0, TAU); ctx.fill();
      glint(ctx, 17, -48, 4 + 6 * ck, '#e8fbff', ck > 0.6 ? (ck - 0.6) * 2.5 : 0);
    }
    if (summon) glint(ctx, 3, -84, 4 + 6 * ck, '#e8fbff', ck);
  }
  ctx.restore();
  FL = false;
};

// ── s08 투사체 / 장판 ──
PROJ_B.waterorb = (ctx, p) => {
  glow(ctx, 0, 0, 18, '#4ac8ff', 0.7);
  ctx.fillStyle = radG(ctx, 'worb', -2, -2, 0.5, 0, 0, 8, [0, '#ffffff', 0.35, '#9fe8ff', 0.8, '#3a9ae0', 1, 'rgba(20,80,160,0.8)']);
  ctx.beginPath(); ctx.arc(0, 0, 7 + Math.sin(p.t * 20) * 0.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(220,250,255,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 7, -2.4, -1.4); ctx.stroke();
};
ZONE_B.pillar = (ctx, z) => {
  const cx = z.cx, by = z.bottom, t = z.t;
  ctx.save();
  if (!z.active) {
    // 경고: 원을 그리는 물결 + 튀는 물방울
    const k = z.warnK;
    addOn(ctx);
    for (let i = 0; i < 3; i++) {
      const u = (t * 1.6 + i / 3) % 1;
      ctx.strokeStyle = `rgba(150,220,255,${(0.3 + 0.6 * k) * (1 - u)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, by - 2, 10 + u * 26, 3 + u * 4, 0, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = `rgba(120,200,255,${0.25 * k})`; ctx.beginPath(); ctx.ellipse(cx, by - 2, 28, 5, 0, 0, TAU); ctx.fill();
    addOff(ctx);
    ctx.restore(); return;
  }
  const lk = z.liveK, up = ease.outCubic(k01(lk * 5)), fade = k01(z.life / 0.15);
  const H = z.h * up, w = z.w / 2;
  ctx.globalAlpha = fade;
  const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
  g.addColorStop(0, 'rgba(40,120,200,0.2)'); g.addColorStop(0.3, 'rgba(120,210,255,0.85)'); g.addColorStop(0.5, 'rgba(230,250,255,0.95)'); g.addColorStop(0.7, 'rgba(120,210,255,0.85)'); g.addColorStop(1, 'rgba(40,120,200,0.2)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(cx - w * 0.8, by);
  for (let i = 0; i <= 8; i++) { const u = i / 8; ctx.lineTo(cx - w * (0.8 - u * 0.2) + Math.sin(t * 20 + i) * 2, by - H * u); }
  ctx.quadraticCurveTo(cx, by - H - 14, cx + w * 0.6, by - H);
  for (let i = 8; i >= 0; i--) { const u = i / 8; ctx.lineTo(cx + w * (0.8 - u * 0.2) + Math.sin(t * 22 + i) * 2, by - H * u); }
  ctx.closePath(); ctx.fill();
  addOn(ctx);
  ctx.fillStyle = 'rgba(220,250,255,0.8)';
  for (let i = 0; i < 6; i++) { const a = h1(i) * TAU + t * 3; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * w * 0.9, by - H - 4 + Math.sin(a) * 8, 2.4, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(200,240,255,0.5)'; ctx.beginPath(); ctx.ellipse(cx, by - 3, w * 1.4, 6, 0, 0, TAU); ctx.fill();
  addOff(ctx);
  ctx.restore();
};

// ═════════════════════════ s09 시계탑 ═════════════════════════
/** 톱니바퀴: 중심 (x,y), 반경 r, 톱니 n, 회전 rot */
function cog(ctx, x, y, r, n, rot, col, opt) {
  const tooth = opt?.tooth ?? r * 0.22, inner = r - tooth;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = a0 + TAU / n * 0.18, a2 = a0 + TAU / n * 0.42, a3 = a0 + TAU / n * 0.6;
    ctx.lineTo(Math.cos(a0) * inner, Math.sin(a0) * inner);
    ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
    ctx.lineTo(Math.cos(a3) * inner, Math.sin(a3) * inner);
  }
  ctx.closePath();
  ink(ctx, FL ? WHITE : sph(ctx, 'cog' + col + r, 0, 0, r, col), opt?.lw ?? 1.6);
  if (!FL) {
    // 살 + 허브
    const hr = inner * 0.62;
    ctx.fillStyle = dk(col, -0.45);
    ctx.beginPath(); ctx.arc(0, 0, hr, 0, TAU); ctx.fill();
    ctx.fillStyle = col;
    const sp = opt?.spokes ?? 4;
    for (let i = 0; i < sp; i++) { ctx.save(); ctx.rotate(i * TAU / sp); ctx.fillRect(-inner * 0.1, -hr, inner * 0.2, hr * 2); ctx.restore(); }
    ctx.beginPath(); ctx.arc(0, 0, inner * 0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = dk(col, -0.6); ctx.beginPath(); ctx.arc(0, 0, inner * 0.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = lt(col, 0.35); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(0, 0, inner * 0.92, -2.2 - rot, -0.9 - rot); ctx.stroke();
  }
  ctx.restore();
}
const BRASS = '#c8963a', BRASS_D = '#7a5420', IRON = '#4a4a56';

// ── 톱니 골렘 ──
RENDER_B.gear_golem = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const walk = an === 'walk', punch = an === 'punch', thr = an === 'throw';
  const wu = e.params?.windup ?? 0.7;
  const ph = t * 5;
  let bob = 0, lean = 0.06, pk = 0, ext = 0, armN = 0.35, armN2 = 0.6, armF = 0.2, heat = 0.45 + 0.1 * Math.sin(t * 3);
  if (walk) { bob = Math.abs(Math.sin(ph)) * 2.5; armN = 0.3 + Math.sin(ph) * 0.25; armF = 0.2 - Math.sin(ph) * 0.25; }
  if (punch) {
    if (at < wu) { pk = ease.outCubic(k01(at / wu)); armN = lerp(0.35, -0.5, pk); armN2 = lerp(0.6, 2.2, pk); lean = lerp(0.06, -0.12, pk); heat = 0.5 + pk * 0.5; }
    else { const k = ease.outExpo(k01((at - wu) / 0.07)); const back = k01((at - wu - 0.3) / 0.3); ext = k * (1 - back); armN = lerp(-0.5, 1.55, k); armN2 = lerp(2.2, 0.02, k); lean = lerp(-0.12, 0.22, k) * (1 - back); heat = 1 - back * 0.5; }
  }
  let cogOut = false, throwA = 0;
  if (thr) {
    const k = k01(at / 0.55);
    if (at < 0.55) { throwA = ease.inOutCubic(k); armF = lerp(0.2, -2.6, throwA); lean = -0.1 * throwA; cogOut = at > 0.25; }
    else { const k2 = ease.outCubic(k01((at - 0.55) / 0.12)); armF = lerp(-2.6, 1.4, k2); lean = 0.15 * (1 - k01((at - 0.7) / 0.3)); }
  }
  shadow(ctx, 32, 0.5);
  const hipY = -40 + bob;
  const leg = (x, p, near) => {
    const s = walk ? Math.sin(ph + p) : 0;
    const fx = x + s * 8, lift = walk ? Math.max(0, -Math.cos(ph + p)) * 5 : 0;
    const col = near ? BRASS : dk(BRASS, -0.3);
    // 허벅지 + 피스톤
    limb(ctx, x, hipY, (x + fx) / 2 + 2, hipY * 0.45 - lift * 0.5, 8, 7, col);
    limb(ctx, (x + fx) / 2 + 2, hipY * 0.45 - lift * 0.5, fx, -8 - lift, 7, 6, near ? IRON : dk(IRON, -0.3));
    if (!FL && near) { ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 4, hipY + 6); ctx.lineTo(fx - 3, -12 - lift); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(fx - 11, -lift); ctx.lineTo(fx - 9, -9 - lift); ctx.lineTo(fx + 10, -9 - lift); ctx.lineTo(fx + 14, -lift); ctx.closePath();
    ink(ctx, vert(ctx, 'ggfoot' + near, -10, 0, near ? '#5a5a66' : '#3a3a44', 0.2, -0.4), 1.6);
    if (!FL) { ctx.fillStyle = '#d8b050'; ctx.beginPath(); ctx.arc(fx - 6, -5 - lift, 1.1, 0, TAU); ctx.arc(fx + 8, -5 - lift, 1.1, 0, TAU); ctx.fill(); }
  };
  leg(-12, PI, false);
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY);
  const shY = hipY - 46;
  // 먼 팔
  end(-14, shY + 6, armF, 18); let ex = EX, ey = EY; end(ex, ey, armF + 0.4, 16);
  limb(ctx, -14, shY + 6, ex, ey, 7, 6, dk(BRASS, -0.3));
  limb(ctx, ex, ey, EX, EY, 6, 7, dk(IRON, -0.2));
  if (cogOut) cog(ctx, EX, EY, 13, 10, t * 3, '#d8a040');
  // 등 톱니 (회전)
  if (!cogOut) cog(ctx, -18, shY + 16, 16, 12, t * 1.2, '#b8883a');
  cog(ctx, -10, hipY - 6, 9, 8, -t * 2.2, '#9a7030');
  // 굴뚝 + 증기
  ctx.beginPath(); ctx.rect(-14, shY - 16, 7, 16); ink(ctx, cyl(ctx, 'ggchim', -14, -7, IRON), 1.6);
  ctx.beginPath(); ctx.rect(-16, shY - 19, 11, 4); ink(ctx, C('#3a3a44'), 1.4);
  if (!FL) {
    for (let i = 0; i < 4; i++) {
      const u = (t * (0.6 + heat * 0.8) + i / 4) % 1;
      ctx.fillStyle = `rgba(220,220,225,${0.35 * (1 - u) * (0.5 + heat)})`;
      ctx.beginPath(); ctx.arc(-10.5 - u * 10 + Math.sin(t * 2 + i) * 3, shY - 22 - u * 26, 3 + u * 7, 0, TAU); ctx.fill();
    }
  }
  // 몸통 (황동 드럼 가슴)
  ctx.beginPath();
  ctx.moveTo(-20, shY); ctx.quadraticCurveTo(0, shY - 8, 22, shY + 1);
  ctx.quadraticCurveTo(28, shY + 20, 18, hipY + 2);
  ctx.lineTo(-16, hipY + 2); ctx.quadraticCurveTo(-26, shY + 20, -20, shY); ctx.closePath();
  ink(ctx, cyl(ctx, 'ggbody', -24, 26, BRASS), 2.2);
  if (!FL) {
    // 리벳 띠
    ctx.strokeStyle = BRASS_D; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-22, shY + 8); ctx.quadraticCurveTo(2, shY + 3, 25, shY + 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-21, hipY - 6); ctx.quadraticCurveTo(0, hipY - 9, 21, hipY - 6); ctx.stroke();
    ctx.fillStyle = '#f0d080';
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-18 + i * 7, shY + 6.5 - Math.sin(i / 6 * PI) * 2, 1, 0, TAU); ctx.fill(); }
    // 화로 창 (격자)
    const fx = 6, fy = shY + 24;
    ctx.fillStyle = '#1a0a04'; ctx.beginPath(); ctx.arc(fx, fy, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = radG(ctx, 'ggfire', fx, fy + 3, 1, fx, fy, 10, [0, '#fff6c0', 0.35, '#ffb040', 0.75, '#e0501a', 1, '#5a1004']);
    ctx.globalAlpha = 0.55 + heat * 0.45;
    ctx.beginPath(); ctx.arc(fx, fy, 8.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    glow(ctx, fx, fy, 22 + heat * 18, '#ff8a2a', 0.35 + heat * 0.5);
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.6;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(fx + i * 4.5, fy - 9); ctx.lineTo(fx + i * 4.5, fy + 9); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(fx - 9, fy); ctx.lineTo(fx + 9, fy); ctx.stroke();
    ctx.strokeStyle = BRASS_D; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(fx, fy, 10.5, 0, TAU); ctx.stroke();
    // 압력계 + 밸브
    ctx.fillStyle = '#e8e0c8'; ctx.beginPath(); ctx.arc(-9, shY + 18, 4, 0, TAU); ctx.fill(); ctx.strokeStyle = BRASS_D; ctx.lineWidth = 1.2; ctx.stroke();
    const na = -2.2 + heat * 2.4 + Math.sin(t * 9) * 0.1 * heat;
    ctx.strokeStyle = '#c81a1a'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-9, shY + 18); ctx.lineTo(-9 + Math.cos(na) * 3.2, shY + 18 + Math.sin(na) * 3.2); ctx.stroke();
    ctx.strokeStyle = mixCache(BRASS, RIM, 0.55, 0); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-20.5, shY + 1); ctx.quadraticCurveTo(-26, shY + 20, -16.5, hipY + 1); ctx.stroke();
  }
  // 머리 (낮은 돔 투구 + 외눈 슬릿)
  ctx.save(); ctx.translate(6, shY - 6);
  ctx.beginPath(); ctx.moveTo(-10, 4); ctx.quadraticCurveTo(-11, -10, 1, -11); ctx.quadraticCurveTo(12, -10, 12, 4); ctx.closePath();
  ink(ctx, sph(ctx, 'gghead', 1, -3, 12, '#b8883a'), 1.8);
  if (!FL) {
    ctx.fillStyle = '#1a0a04'; ctx.fillRect(-1, -5, 13, 4);
    ctx.fillStyle = heat > 0.8 ? '#fff0a0' : '#ffb040'; ctx.fillRect(1, -4.2, 10, 2.4);
    glow(ctx, 7, -3, 12 + heat * 8, '#ff9a3a', 0.6 + heat * 0.4);
    ctx.fillStyle = '#e8c870'; ctx.beginPath(); ctx.arc(-6, 0, 1.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = BRASS_D; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.quadraticCurveTo(1, -12, 10, -8); ctx.stroke();
  }
  ctx.restore();
  // 가까운 팔 (피스톤 주먹)
  const sx = 12, sy = shY + 7;
  end(sx, sy, armN, 18); ex = EX; ey = EY;
  limb(ctx, sx, sy, ex, ey, 8, 7, BRASS);
  cog(ctx, sx, sy, 7, 8, t * 2, '#d8a848');
  const fa = armN + armN2, L = 14 + ext * 22;
  end(ex, ey, fa, L); const hx = EX, hy = EY;
  // 피스톤 로드
  if (ext > 0.05 && !FL) { ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke(); ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke(); }
  end(ex, ey, fa, 12);
  limb(ctx, ex, ey, EX, EY, 7, 7.5, IRON);
  // 주먹 (쇳덩이)
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-fa + HP);
  ctx.beginPath(); ctx.rect(-6, -8, 13, 16); ink(ctx, cyl(ctx, 'ggfist', -6, 7, '#6a6a78'), 1.8);
  if (!FL) { ctx.fillStyle = '#9a9aa8'; for (let i = 0; i < 3; i++) ctx.fillRect(4, -6 + i * 5, 3, 3); ctx.fillStyle = BRASS; ctx.fillRect(-6, -2, 13, 3); }
  ctx.restore();
  ctx.restore();
  leg(10, 0, true);
  if (punch && !FL) {
    if (at < wu) glint(ctx, 22, shY + 20, 5 + 6 * pk, '#ffd080', pk > 0.5 ? (pk - 0.5) * 2 : 0);
    else if (ext > 0.3) { addOn(ctx); ctx.strokeStyle = 'rgba(255,230,180,0.35)'; ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(hx - 30 - i * 6, hy - 6 + i * 6); ctx.lineTo(hx - 10, hy - 6 + i * 6); ctx.stroke(); } addOff(ctx); }
  }
  FL = false;
};

// ── 하피 ──
RENDER_B.harpy = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const skin = '#d8b8a0', feather = '#7a3a2a', tip = '#2a1418', hair = '#2a1a24', talon = '#c8b070';
  const spread = an === 'spread', shoot = an === 'shoot', aim = an === 'aim', dive = an === 'dive';
  const flap = Math.sin(t * 10);
  let cy = -30 + flap * 2, rot = 0, wing = flap * 0.9, legA = 0.3, span = 30;
  if (spread) { const k = ease.outCubic(k01(at / 0.5)); wing = lerp(flap * 0.9, -0.05 + Math.sin(t * 30) * 0.04, k); span = 30 + 10 * k; }
  if (shoot) { wing = -0.6; span = 30; rot = 0.1; }
  if (aim) { wing = 0.9 + Math.sin(t * 20) * 0.1; legA = 1.3; rot = -0.1; }
  if (dive) { wing = -1.2; rot = 0.6; legA = 1.6; span = 26; }
  ctx.save(); ctx.translate(0, cy); ctx.rotate(rot);
  // 뒤 날개
  ctx.save(); ctx.translate(-2, -12); ctx.scale(-1, 1); ctx.rotate(-0.35); featherWing(ctx, span, wing, dk(feather, -0.3), tip, 7); ctx.restore();
  // 꼬리 깃
  for (let i = -1; i <= 1; i++) {
    ctx.save(); ctx.translate(-6, 6); ctx.rotate(2.5 + i * 0.22 + Math.sin(t * 5 + i) * 0.06);
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(0, 12, 0, 18); ctx.quadraticCurveTo(2, 12, 2, 0); ctx.closePath();
    ink(ctx, linG(ctx, 'hptail', 0, 0, 0, 18, [0, feather, 1, tip]), 1.2);
    ctx.restore();
  }
  // 새 다리 + 발톱
  for (const near of [false, true]) {
    const lx = near ? 3 : -2, ly = 6;
    end(lx, ly, legA + (near ? 0 : -0.2), 9); const kx = EX, ky = EY; end(kx, ky, legA - 1.2 + (near ? 0 : -0.1), 8);
    softLimb(ctx, lx, ly, kx, ky, EX, EY, 2.6, 1.3, near ? talon : dk(talon, -0.3), near);
    claws(ctx, EX, EY, '#f0e8d8', aim || dive ? 1.2 : 0.2, 5);
  }
  // 몸 (깃털 치마 + 인간 상체)
  ctx.beginPath(); ctx.moveTo(-7, -8); ctx.quadraticCurveTo(-10, 4, -4, 10); ctx.lineTo(0, 7); ctx.lineTo(4, 11); ctx.lineTo(7, 5); ctx.quadraticCurveTo(9, -4, 6, -8); ctx.closePath();
  ink(ctx, linG(ctx, 'hpskirt', 0, -8, 0, 11, [0, lt(feather, 0.1), 1, tip]), 1.6);
  ctx.beginPath(); ctx.moveTo(-5, -22); ctx.quadraticCurveTo(-8, -14, -6, -7); ctx.lineTo(6, -7); ctx.quadraticCurveTo(8, -15, 5, -22); ctx.quadraticCurveTo(0, -25, -5, -22); ctx.closePath();
  ink(ctx, cyl(ctx, 'hptorso', -7, 7, skin), 1.6);
  if (!FL) {
    ctx.fillStyle = feather; ctx.beginPath(); ctx.moveTo(-6, -16); ctx.quadraticCurveTo(0, -12, 7, -16); ctx.lineTo(7, -11); ctx.quadraticCurveTo(0, -8, -6.5, -11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tip; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-5 + i * 3.4, -11); ctx.lineTo(-3.5 + i * 3.4, -8.5); ctx.lineTo(-2 + i * 3.4, -11); ctx.fill(); }
  }
  // 머리
  ctx.save(); ctx.translate(1, -28);
  // 헝클어진 머리칼
  ctx.beginPath(); ctx.moveTo(-6, -4);
  for (let i = 0; i < 6; i++) { const a = PI * 0.9 + i * 0.28; ctx.lineTo(Math.cos(a) * 11 - 3 + Math.sin(t * 6 + i) * 1.4, Math.sin(a) * 8 + 2 + i * 1.6); }
  ctx.lineTo(-2, 8); ctx.closePath();
  ink(ctx, C(hair), 1.4);
  ctx.beginPath(); ctx.ellipse(1, 0, 5.4, 6.2, 0.1, 0, TAU); ink(ctx, sph(ctx, 'hphead', 1, 0, 6, skin), 1.5);
  ctx.beginPath(); ctx.moveTo(-5, -3); ctx.quadraticCurveTo(0, -9, 6, -4); ctx.quadraticCurveTo(2, -5, -1, -2); ctx.quadraticCurveTo(-3, 0, -5, 2); ctx.closePath(); ctx.fillStyle = C(hair); ctx.fill();
  if (!FL) {
    eyeGlow(ctx, 3.8, -0.6, 1.1, '#ffd030', spread || aim ? 1.5 : 1);
    ctx.fillStyle = '#5a1a1a'; ctx.beginPath(); ctx.moveTo(2, 3); ctx.quadraticCurveTo(4, 4.5 + (spread ? 1.5 : 0), 5.6, 3); ctx.fill();
    ctx.fillStyle = '#f0e8d8'; ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(3.4, 4.2); ctx.lineTo(3.8, 3); ctx.fill();
  }
  ctx.restore();
  // 앞 날개 (팔)
  ctx.save(); ctx.translate(2, -20); ctx.rotate(-0.45); featherWing(ctx, span * 1.05, wing, feather, tip, 7); ctx.restore();
  ctx.restore();
  if (spread && !FL) { const k = k01(at / 0.5); glint(ctx, 18, cy - 20, 4 + 6 * k, '#ffe0a0', k > 0.5 ? (k - 0.5) * 2 : 0); }
  if (aim && !FL) glint(ctx, 10, cy + 14, 4 + 4 * Math.sin(t * 30), '#fff0c0', k01(at / 0.3));
  FL = false;
};

// ── 태엽 병사 ──
RENDER_B.clockwork_soldier = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const red = '#a8202a', blue = '#23305a', white = '#e8e4d8', gold = '#e0b040';
  const walk = an === 'walk', aim = an === 'aim', fire = an === 'fire', wd = an === 'winddown';
  const ph = t * 7;
  let bob = 0, headA = 0, lean = 0, keyRot = t * 2.5;
  if (walk) { bob = Math.abs(Math.sin(ph)) * 1.5; }
  if (wd) { const k = ease.outCubic(k01(at / 0.5)); headA = 0.45 * k + Math.sin(t * 3) * 0.03; lean = 0.18 * k; bob = -3 * k; keyRot = -t * 1.2; }
  if (fire) { lean = -0.08 * (1 - k01(at / 0.25)); }
  shadow(ctx, 14);
  const hipY = -34 + bob;
  // 다리 (행진: 무릎을 높이 드는 뻣뻣한 걸음)
  const leg = (x, p, near) => {
    const s = walk ? Math.sin(ph + p) : 0;
    const up = walk ? Math.max(0, s) : 0;
    const kx = x + up * 8, ky = hipY + 16 - up * 6;
    const fx = x + up * 6 + (walk ? -Math.max(0, -s) * 4 : 0), fy = walk ? -up * 7 : 0;
    const col = near ? blue : dk(blue, -0.3);
    limb(ctx, x, hipY, kx, ky, 4.4, 3.8, col);
    limb(ctx, kx, ky, fx, fy - 6, 3.8, 3.4, col);
    if (!FL && near) { ctx.strokeStyle = red; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 3, hipY + 2); ctx.lineTo(kx + 3, ky); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(fx - 4, fy); ctx.lineTo(fx - 4, fy - 9); ctx.lineTo(fx + 3, fy - 9); ctx.lineTo(fx + 4, fy - 3); ctx.lineTo(fx + 8, fy - 2); ctx.lineTo(fx + 8, fy); ctx.closePath();
    ink(ctx, C(near ? '#141014' : '#0a080a'), 1.3);
    if (!FL) { ctx.fillStyle = '#c8c8d0'; ctx.beginPath(); ctx.arc(kx, ky, 1.2, 0, TAU); ctx.fill(); }
  };
  leg(-3, PI, false);
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY);
  const shY = hipY - 28;
  // 태엽 열쇠 (등)
  ctx.save(); ctx.translate(-11, shY + 12);
  ctx.fillStyle = C('#8a6a2a'); ctx.fillRect(-5, -1.5, 5, 3);
  ctx.scale(Math.cos(keyRot) * 0.9 + (Math.cos(keyRot) >= 0 ? 0.1 : -0.1), 1);
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.bezierCurveTo(-5, -10, -15, -10, -13, -3); ctx.lineTo(-7, 0); ctx.lineTo(-13, 3); ctx.bezierCurveTo(-15, 10, -5, 10, -5, 0); ctx.closePath();
  ink(ctx, linG(ctx, 'cskey', -15, -8, -5, 8, [0, '#fff0a0', 0.5, gold, 1, '#8a6a20']), 1.3);
  ctx.restore();
  // 몸통 (붉은 제복)
  ctx.beginPath(); ctx.moveTo(-9, shY); ctx.lineTo(9, shY); ctx.lineTo(10, hipY + 3); ctx.lineTo(-10, hipY + 3); ctx.closePath();
  ink(ctx, cyl(ctx, 'csbody', -10, 10, red), 1.8);
  if (!FL) {
    // 십자 멜빵 + 금단추 + 허리띠
    ctx.strokeStyle = white; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-8, shY + 1); ctx.lineTo(8, hipY); ctx.moveTo(8, shY + 1); ctx.lineTo(-8, hipY); ctx.stroke();
    ctx.fillStyle = gold; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(3, shY + 5 + i * 5.5, 1.1, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#1a1414'; ctx.fillRect(-10, hipY - 3, 20, 3.5); ctx.fillStyle = gold; ctx.fillRect(-2, hipY - 3.2, 4, 4);
    // 견장
    ctx.fillStyle = gold; ctx.beginPath(); ctx.ellipse(8, shY + 1, 4, 1.8, 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffe890'; ctx.lineWidth = 0.8; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(5 + i * 2, shY + 2); ctx.lineTo(5 + i * 2, shY + 5); ctx.stroke(); }
    ctx.strokeStyle = mixCache(red, RIM, 0.6, 0); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-9.5, shY + 1); ctx.lineTo(-10.5, hipY + 2); ctx.stroke();
  }
  // 머리 (도자기 얼굴 + 높은 샤코 모자)
  ctx.save(); ctx.translate(1, shY - 7); ctx.rotate(headA);
  ctx.fillStyle = C('#8a8a94'); ctx.fillRect(-2, 4, 4, 4);
  ctx.beginPath(); ctx.ellipse(0, 0, 6.4, 7, 0, 0, TAU); ink(ctx, sph(ctx, 'cshead', 0, 0, 7, '#f0e8e0'), 1.5);
  if (!FL) {
    ctx.fillStyle = 'rgba(230,90,100,0.55)'; ctx.beginPath(); ctx.arc(4, 2.5, 1.8, 0, TAU); ctx.fill();
    // 그린 콧수염
    ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.moveTo(2, 3.6); ctx.quadraticCurveTo(5, 2.4, 7, 4.4); ctx.quadraticCurveTo(5, 3.8, 2, 4.8); ctx.fill();
    // 단추 눈 (발광)
    const eyeC = wd ? '#6a3a3a' : aim || fire ? '#ff3030' : '#ff6040';
    ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.arc(3.5, -1, 1.6, 0, TAU); ctx.fill();
    if (!wd) eyeGlow(ctx, 3.6, -1, 0.9, eyeC, aim ? 1.4 : 0.8);
    // 이음새
    ctx.strokeStyle = 'rgba(80,60,60,0.5)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(0, 2, 6.2, 0.5); ctx.stroke();
  }
  // 샤코
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-5, -18); ctx.lineTo(6, -18); ctx.lineTo(7, -4); ctx.closePath();
  ink(ctx, cyl(ctx, 'csshako', -6, 7, '#1a1a24'), 1.5);
  if (!FL) {
    ctx.fillStyle = gold; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(3, -10); ctx.lineTo(0, -6); ctx.lineTo(-3, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = red; ctx.fillRect(-6, -6, 13, 2);
    ctx.fillStyle = '#0a0a10'; ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(10, -3); ctx.lineTo(7, -5); ctx.closePath(); ctx.fill();
  }
  // 깃털 장식
  ctx.beginPath(); ctx.moveTo(-3, -17); ctx.quadraticCurveTo(-6, -27 + Math.sin(t * 3) * 1, 1, -28); ctx.quadraticCurveTo(-1, -22, 0, -17); ctx.closePath();
  ink(ctx, C(white), 1.1);
  ctx.restore();
  // 소총 + 팔
  const mA = aim || fire ? (e.facing >= 0 ? (e.aimA ?? 0) : PI - (e.aimA ?? PI)) : wd ? 1.2 : 0.95;
  const rk = fire ? 1 - k01(at / 0.2) : 0;
  const gx = 4 - rk * 4, gy = shY + 10;
  ctx.save(); ctx.translate(gx, gy); ctx.rotate(aim || fire ? mA : wd ? 0.9 : -1.75 + Math.sin(t * 2) * 0.03);
  // 개머리 + 총신 + 총검
  ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-4, -2); ctx.lineTo(-4, 3); ctx.lineTo(-13, 5); ctx.closePath(); ink(ctx, C('#5a3418'), 1.2);
  ctx.beginPath(); ctx.rect(-4, -2, 24, 3); ink(ctx, linG(ctx, 'csbarrel', 0, -2, 0, 1, [0, '#9a9aa8', 1, '#3a3a44']), 1.2);
  ctx.fillStyle = C(gold); ctx.fillRect(2, -2.4, 2, 3.8); ctx.fillRect(12, -2.4, 1.5, 3.8);
  ctx.beginPath(); ctx.moveTo(20, -1.5); ctx.lineTo(31, -0.6); ctx.lineTo(20, 0.6); ctx.closePath(); ink(ctx, C('#d8dce8'), 1);
  if (fire && !FL) { glow(ctx, 22, -0.5, 20 * rk + 6, '#ffd070', rk); glow(ctx, 22, -0.5, 8, '#ffffff', rk); }
  ctx.restore();
  // 팔 (총을 잡은 팔)
  end(5, shY + 3, aim || fire ? 1.3 : 0.5, 10); const ex = EX, ey = EY;
  limb(ctx, 5, shY + 3, ex, ey, 3.2, 2.8, red);
  ctx.fillStyle = C(white); ctx.beginPath(); ctx.arc(ex, ey + 1, 2.6, 0, TAU); ctx.fill();
  // 조준 레이저
  if (aim && !FL) {
    const la = mA, len = e.aimLen ?? 400, tk = k01(at / (e.params?.aim ?? 0.7));
    const x0 = gx + Math.cos(la) * 30, y0 = gy + Math.sin(la) * 30;
    const blink = tk > 0.7 ? (Math.sin(t * 60) > 0 ? 1 : 0.4) : 0.6;
    glowLine(ctx, x0, y0, x0 + Math.cos(la) * len, y0 + Math.sin(la) * len, 1, '#ff3040', blink * (0.4 + 0.6 * tk));
    if (tk > 0.6) glint(ctx, x0, y0, 5 + 3 * Math.sin(t * 30), '#ff8080', (tk - 0.6) * 2.5);
  }
  ctx.restore();
  leg(3, 0, true);
  if (wd && !FL) { const u = (t * 1.5) % 1; ctx.fillStyle = `rgba(220,220,230,${0.5 * (1 - u)})`; ctx.font = 'bold 9px sans-serif'; ctx.fillText('…', -2, shY - 30 - u * 8 + bob); }
  FL = false;
};

// ── 굴러오는 톱니 ──
RENDER_B.cog_wheel = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const R = e.def.size.h / 2, rot = e.rot ?? t;
  const fast = Math.abs(e.vx ?? 0) > 180, wind = an === 'wind';
  shadow(ctx, R * 0.8, 0.45);
  ctx.save(); ctx.translate(0, -R);
  // 잔상 (빠를 때)
  if (fast && !FL) {
    const d = Math.sign(e.vx) * (e.facing || 1);
    addOn(ctx);
    for (let i = 1; i <= 3; i++) { ctx.strokeStyle = `rgba(255,200,120,${0.2 / i})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-d * i * 5, 0, R - 2, -PI * 0.8, PI * 0.8); ctx.stroke(); }
    addOff(ctx);
  }
  const heat = wind ? k01(at / 0.45) : fast ? 0.7 : 0.35;
  glow(ctx, 0, 0, R * 1.6, '#ff9a3a', 0.15 + heat * 0.35);
  // 톱날 가시
  ctx.save(); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    ctx.moveTo(Math.cos(a - 0.12) * (R - 4), Math.sin(a - 0.12) * (R - 4));
    ctx.lineTo(Math.cos(a + 0.1) * (R + 3), Math.sin(a + 0.1) * (R + 3));
    ctx.lineTo(Math.cos(a + 0.2) * (R - 4), Math.sin(a + 0.2) * (R - 4));
  }
  ctx.fillStyle = C('#d8dce8'); ctx.strokeStyle = C(OUT); ctx.lineWidth = 1.4; ctx.fill(); ctx.stroke();
  ctx.restore();
  cog(ctx, 0, 0, R - 2, 10, rot, BRASS, { spokes: 5, lw: 2 });
  // 중심의 눈 (회전하지 않음)
  ctx.beginPath(); ctx.arc(0, 0, R * 0.34, 0, TAU); ink(ctx, C('#2a1a10'), 1.6);
  if (!FL) {
    ctx.fillStyle = radG(ctx, 'cweye', 1, -1, 0.5, 0, 0, R * 0.3, [0, '#fff0a0', 0.5, '#ff7a2a', 1, '#5a1004']);
    ctx.beginPath(); ctx.arc(0, 0, R * 0.28, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a0604'; ctx.beginPath(); ctx.ellipse(1.5, 0, 1.4, R * 0.2, 0, 0, TAU); ctx.fill();
    glow(ctx, 0, 0, R * 0.9, '#ff8a2a', 0.4 + heat * 0.4);
    ctx.strokeStyle = 'rgba(180,200,255,0.5)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, R + 1, PI * 0.7, PI * 1.3); ctx.stroke();
  }
  ctx.restore();
  if (wind && !FL) glint(ctx, R * 0.7, -R * 1.6, 4 + 5 * heat, '#ffd080', heat);
  FL = false;
};

// ── s09 투사체 ──
PROJ_B.cog = (ctx, p) => {
  const pf = FL; FL = false;
  glow(ctx, 0, 0, 20, '#ffb040', 0.3);
  cog(ctx, 0, 0, 14, 10, p.rot || 0, '#d8a040', { spokes: 4 });
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fillStyle = '#ff9a3a'; ctx.fill();
  FL = pf;
};
PROJ_B.feather = (ctx, p) => {
  const a = Math.atan2(p.vy, p.vx);
  ctx.rotate(a);
  addOn(ctx); ctx.strokeStyle = 'rgba(255,200,160,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-8, 0); ctx.stroke(); addOff(ctx);
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.quadraticCurveTo(2, -5, -10, -2); ctx.lineTo(-8, 0); ctx.lineTo(-10, 2); ctx.quadraticCurveTo(2, 5, 12, 0); ctx.closePath();
  ctx.fillStyle = linG(ctx, 'pfeather', -10, 0, 12, 0, [0, '#2a1418', 0.5, '#7a3a2a', 1, '#e8c8a0']); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = '#f0e0c0'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(11, 0); ctx.stroke();
};

// ═════════════════════════ s10 얼어붙은 첨탑 ═════════════════════════
/** 얼음 결정 다각형 (점 배열 [x,y,...]) — 반투명 면 + 흰 모서리 */
function crystal(ctx, pts, key, base = '#8ad8f8', lw = 1.6) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
  for (let i = 0; i < pts.length; i += 2) { minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]); }
  ink(ctx, linG(ctx, 'cr' + key + base, maxX, minY, minX, maxY, [0, '#f4feff', 0.3, lt(base, 0.25), 0.7, base, 1, dk(base, -0.5)]), lw);
  if (FL) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.stroke();
}
const ICE = '#7ac8ec', ICE_D = '#2a6a9a';

// ── 얼음 골렘 ──
RENDER_B.ice_golem = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const walk = an === 'walk', slam = an === 'slam';
  const wu = e.params?.windup ?? 0.8;
  const ph = t * 5;
  let bob = 0, lean = 0.05, armN = 0.3, armF = 0.2, raise = 0, impact = 0, core = 0.5 + 0.15 * Math.sin(t * 2.5);
  if (walk) { bob = Math.abs(Math.sin(ph)) * 2.5; armN = 0.25 + Math.sin(ph) * 0.3; armF = 0.2 - Math.sin(ph) * 0.3; }
  if (slam) {
    if (at < wu) { raise = ease.outCubic(k01(at / wu)); armN = lerp(0.3, 3.0, raise); armF = lerp(0.2, 2.8, raise); lean = lerp(0.05, -0.15, raise); core = 0.6 + raise * 0.4; }
    else { impact = 1 - k01((at - wu) / 0.7); const k = ease.outCubic(k01((at - wu) / 0.08)); armN = lerp(3.0, 1.25, k); armF = lerp(2.8, 1.1, k); lean = lerp(-0.15, 0.35, k) * (0.4 + 0.6 * impact); bob = -5 * k * impact; core = 1; }
  }
  shadow(ctx, 32, 0.45);
  glow(ctx, 0, -50, 60, '#6ad0ff', 0.18);
  const shake = slam && at < wu ? Math.sin(t * 55) * raise * 0.8 : 0;
  ctx.save(); ctx.translate(shake, 0);
  const hipY = -38 + bob;
  const leg = (x, p, near) => {
    const s = walk ? Math.sin(ph + p) : 0;
    const fx = x + s * 9, lift = walk ? Math.max(0, -Math.cos(ph + p)) * 5 : 0;
    const base = near ? ICE : dk(ICE, -0.25);
    crystal(ctx, [x - 8, hipY, x + 8, hipY - 2, (x + fx) / 2 + 9, hipY * 0.5 - lift, (x + fx) / 2 - 7, hipY * 0.5 - lift + 2], 'igth' + near, base);
    crystal(ctx, [(x + fx) / 2 - 7, hipY * 0.5 - lift + 1, (x + fx) / 2 + 9, hipY * 0.5 - lift - 1, fx + 12, -lift, fx - 9, -lift], 'igsh' + near, base);
  };
  leg(-12, PI, false);
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY);
  const shY = hipY - 46;
  const arm = (sx, sy, a, near) => {
    const base = near ? ICE : dk(ICE, -0.25);
    end(sx, sy, a, 20); const ex = EX, ey = EY; end(ex, ey, a + 0.25, 20); const hx = EX, hy = EY;
    const ang = Math.atan2(ey - sy, ex - sx), n1x = -Math.sin(ang) * 8, n1y = Math.cos(ang) * 8;
    crystal(ctx, [sx + n1x, sy + n1y, sx - n1x, sy - n1y, ex - n1x * 0.8, ey - n1y * 0.8, ex + n1x * 0.8, ey + n1y * 0.8], 'igua' + near, base);
    const ang2 = Math.atan2(hy - ey, hx - ex), n2x = -Math.sin(ang2) * 7, n2y = Math.cos(ang2) * 7;
    crystal(ctx, [ex + n2x, ey + n2y, ex - n2x, ey - n2y, hx - n2x * 1.3, hy - n2y * 1.3, hx + n2x * 1.3, hy + n2y * 1.3], 'igfa' + near, base);
    // 결정 주먹 (여러 가시)
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang2 - HP);
    crystal(ctx, [-11, -2, 11, -2, 13, 10, 5, 18, -6, 17, -13, 9], 'igfist' + near, base, 1.8);
    crystal(ctx, [-4, 12, 4, 12, 0, 24], 'igspk' + near, lt(base, 0.2), 1.2);
    crystal(ctx, [6, 8, 13, 5, 17, 16], 'igspk2' + near, lt(base, 0.2), 1.2);
    ctx.restore();
    return [hx, hy];
  };
  arm(-14, shY + 6, armF, false);
  // 몸통 (큰 결정 덩어리)
  crystal(ctx, [-22, shY + 2, 0, shY - 10, 24, shY + 2, 20, hipY + 4, -18, hipY + 4], 'igbody', ICE, 2.2);
  if (!FL) {
    // 면 분할선 + 균열
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, shY - 10); ctx.lineTo(2, shY + 22); ctx.lineTo(-18, hipY + 4); ctx.moveTo(2, shY + 22); ctx.lineTo(20, hipY + 4); ctx.moveTo(2, shY + 22); ctx.lineTo(24, shY + 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,70,120,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-14, shY + 8); ctx.lineTo(-8, shY + 16); ctx.lineTo(-12, shY + 26); ctx.moveTo(12, hipY - 6); ctx.lineTo(16, hipY - 14); ctx.stroke();
    // 푸른 핵
    const cx = 3, cy = shY + 20;
    glow(ctx, cx, cy, 26 + core * 14, '#4ac8ff', 0.45 + core * 0.4);
    ctx.fillStyle = radG(ctx, 'igcore', cx - 1, cy - 1, 0.5, cx, cy, 7, [0, '#ffffff', 0.4, '#bff4ff', 1, '#2a8ad8']);
    ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 8); ctx.lineTo(cx - 6, cy); ctx.closePath(); ctx.fill();
  }
  // 어깨 가시 결정
  crystal(ctx, [-20, shY + 4, -26, shY - 14, -14, shY - 2], 'igsp1', lt(ICE, 0.15), 1.4);
  crystal(ctx, [-12, shY - 2, -14, shY - 22, -4, shY - 6], 'igsp2', lt(ICE, 0.15), 1.4);
  crystal(ctx, [14, shY - 2, 22, shY - 18, 22, shY + 2], 'igsp3', lt(ICE, 0.15), 1.4);
  // 머리 (결정 왕관)
  ctx.save(); ctx.translate(8, shY - 6);
  crystal(ctx, [-9, 4, -8, -8, 0, -12, 10, -8, 11, 4, 2, 8], 'ighead', ICE, 1.8);
  crystal(ctx, [-6, -7, -8, -20, -1, -10], 'igcr1', '#bff0ff', 1.2);
  crystal(ctx, [-1, -10, 2, -24, 5, -9], 'igcr2', '#bff0ff', 1.2);
  crystal(ctx, [5, -9, 12, -19, 10, -6], 'igcr3', '#bff0ff', 1.2);
  if (!FL) {
    ctx.fillStyle = '#0a2a4a'; ctx.beginPath(); ctx.moveTo(1, -3); ctx.lineTo(10, -4); ctx.lineTo(9, -1); ctx.lineTo(2, 0); ctx.closePath(); ctx.fill();
    eyeGlow(ctx, 7.5, -2.3, 1.5, '#e8fbff', slam ? 1.5 : 1);
    eyeGlow(ctx, 3, -1.8, 1.1, '#e8fbff', 0.7);
  }
  ctx.restore();
  const [hx, hy] = arm(12, shY + 6, armN, true);
  ctx.restore();
  leg(10, 0, true);
  // 냉기 안개
  if (!FL) for (let i = 0; i < 4; i++) { const u = (t * 0.4 + i / 4) % 1; ctx.fillStyle = `rgba(200,240,255,${0.18 * (1 - u)})`; ctx.beginPath(); ctx.arc(-20 + i * 13 + Math.sin(t + i) * 4, -4 - u * 18, 6 + u * 8, 0, TAU); ctx.fill(); }
  if (slam && !FL) {
    if (at < wu) glint(ctx, hx, hy, 6 + 6 * raise, '#e8fbff', raise > 0.6 ? (raise - 0.6) * 2.5 : 0);
    else if (impact > 0.5) glow(ctx, 44, -6, 44, '#bff4ff', (impact - 0.5));
  }
  ctx.restore();
  FL = false;
};

// ── 서리 망령 ──
RENDER_B.frost_wraith = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const robe = '#8ab0c8', robeD = '#3a5a78';
  const cast = an === 'cast', vanish = an === 'vanish';
  const ck = cast ? k01(at / 0.65) : 0;
  const bob = Math.sin(t * 2) * 3;
  ctx.save(); ctx.translate(0, bob);
  glow(ctx, 0, -42, 44, '#8ad8ff', 0.22 + ck * 0.3);
  // 찢어진 로브 (아래로 안개처럼)
  ctx.beginPath();
  ctx.moveTo(-8, -56);
  ctx.bezierCurveTo(-16, -46, -16, -26, -18, -12);
  for (let i = 0; i < 6; i++) { const x = -18 + i * 6.6, w = Math.sin(t * 4 + i * 1.7) * 3; ctx.lineTo(x + 3.3 + w, -2 - (i % 2) * 7 + Math.sin(t * 3 + i) * 2); ctx.lineTo(x + 6.6, -12 + (i % 2) * 3); }
  ctx.bezierCurveTo(14, -26, 12, -46, 8, -56);
  ctx.quadraticCurveTo(0, -60, -8, -56); ctx.closePath();
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (FL ? 1 : 0.9);
  ink(ctx, FL ? WHITE : linG(ctx, 'fwrobe', 0, -60, 0, 0, [0, lt(robe, 0.2), 0.6, robe, 1, 'rgba(58,90,120,0.1)']), 1.6);
  ctx.globalAlpha = ga;
  if (!FL) {
    ctx.strokeStyle = 'rgba(30,50,80,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-6 + i * 5, -50); ctx.quadraticCurveTo(-8 + i * 6, -30, -10 + i * 7 + Math.sin(t * 3 + i) * 2, -10); ctx.stroke(); }
    // 서리 무늬
    ctx.strokeStyle = 'rgba(230,250,255,0.6)'; ctx.lineWidth = 0.7;
    for (let i = 0; i < 3; i++) { const x = -8 + i * 7, y = -26 + i * 4; ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x, y - 2.5); ctx.lineTo(x, y + 2.5); ctx.moveTo(x - 1.8, y - 1.8); ctx.lineTo(x + 1.8, y + 1.8); ctx.moveTo(x + 1.8, y - 1.8); ctx.lineTo(x - 1.8, y + 1.8); ctx.stroke(); }
    ctx.strokeStyle = mixCache(robe, RIM, 0.5, 0); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-8.5, -55); ctx.bezierCurveTo(-16.5, -46, -16.5, -26, -18, -13); ctx.stroke();
  }
  // 두건 + 얼굴 공허
  ctx.save(); ctx.translate(2, -60);
  ctx.beginPath(); ctx.moveTo(-10, 6); ctx.quadraticCurveTo(-13, -10, 0, -13); ctx.quadraticCurveTo(12, -12, 12, 2); ctx.lineTo(9, 8); ctx.quadraticCurveTo(0, 4, -10, 6); ctx.closePath();
  ink(ctx, sph(ctx, 'fwhood', 0, -3, 12, robeD), 1.6);
  ctx.fillStyle = C('#040810'); ctx.beginPath(); ctx.ellipse(4, 0, 6, 6.6, 0.1, 0, TAU); ctx.fill();
  if (!FL) {
    eyeGlow(ctx, 6.2, -0.8, 1.4, '#bff4ff', 1 + ck);
    eyeGlow(ctx, 1.8, -1.2, 1.1, '#bff4ff', 0.8 + ck);
  }
  // 서리 왕관
  for (let i = 0; i < 5; i++) {
    const x = -7 + i * 4, h = 6 + (i === 2 ? 6 : i % 2 ? 3 : 1) + ck * 3;
    crystal(ctx, [x - 1.8, -10 + Math.abs(i - 2) * 0.8, x, -10 - h + Math.abs(i - 2) * 0.8, x + 1.8, -10 + Math.abs(i - 2) * 0.8], 'fwcr' + i, '#bff0ff', 1);
  }
  if (!FL) glow(ctx, 1, -16, 12 + ck * 14, '#e8fbff', 0.35 + ck * 0.6);
  ctx.restore();
  // 뼈 손 (고드름 손톱)
  const armA = cast ? lerp(0.6, 2.0, ease.outCubic(ck)) : 0.7 + Math.sin(t * 1.6) * 0.2;
  for (const near of [false, true]) {
    const sx = near ? 5 : -6, sy = -50;
    const a = armA + (near ? 0 : -0.4);
    end(sx, sy, a, 13); const ex = EX, ey = EY; end(ex, ey, a + 0.3, 11);
    softLimb(ctx, sx, sy, ex, ey, EX, EY, 3.4, 2.4, near ? robe : robeD, near);
    ctx.fillStyle = C('#d8e8f0'); ctx.beginPath(); ctx.arc(EX, EY, 2.4, 0, TAU); ctx.fill();
    if (!FL && near) {
      ctx.fillStyle = '#e8fbff'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(EX + 1, EY + i * 1.5); ctx.lineTo(EX + 8, EY + 3 + i * 3); ctx.lineTo(EX + 1.5, EY + 1.2 + i * 1.5); ctx.fill(); }
      if (cast) { glow(ctx, EX + 4, EY, 10 + ck * 10, '#9fe8ff', ck); glint(ctx, EX + 5, EY, 3 + 5 * ck, '#e8fbff', ck > 0.5 ? (ck - 0.5) * 2 : 0); }
    }
  }
  // 흩날리는 눈송이
  if (!FL) for (let i = 0; i < 6; i++) { const u = (t * 0.5 + h1(i)) % 1; ctx.fillStyle = `rgba(230,250,255,${0.8 * (1 - u)})`; ctx.fillRect(-18 + h1(i + 3) * 36 + Math.sin(t * 2 + i) * 4, -10 - u * 60, 1.6, 1.6); }
  if (vanish && !FL) { const k = k01(at / 0.3); for (let i = 0; i < 8; i++) { ctx.fillStyle = `rgba(220,245,255,${0.7 * (1 - k)})`; ctx.fillRect((h1(i) - 0.5) * 40 * (1 + k), -40 + (h1(i + 9) - 0.5) * 50 - k * 10, 2, 2); } }
  ctx.restore();
  FL = false;
};

// ── 사족 짐승 공용 (설원 늑대 / 지옥견) ──
// K: {fur, furD, belly, eye, glowEye, mane:'frost'|'fire', drool}
function drawCanine(ctx, e, K) {
  const t = e.t, an = e.anim, at = e.animT;
  const walk = an === 'walk', charge = an === 'charge', wind = an === 'wind', leap = an === 'leap', breath = an === 'breath';
  const ph = t * (charge ? 16 : walk ? 9 : 0);
  let bodyY = -26, lean = 0, headY = 0, headA = 0, stretch = 1, shake = 0, jaw = 1.5 + Math.max(0, Math.sin(t * 2)) * 1;
  if (wind) { bodyY = -19; lean = 0.12; headY = 5; headA = 0.15; shake = Math.sin(t * 60) * 0.8; jaw = 4; }
  if (charge) { stretch = 1.12; bodyY = -25 + Math.sin(ph) * 2.5; lean = Math.sin(ph) * 0.06; jaw = 5 + Math.sin(t * 20); }
  if (walk) bodyY = -26 - Math.abs(Math.sin(ph)) * 1.5;
  if (leap) { stretch = 1.15; lean = -0.35; bodyY = -30; jaw = 7; headA = -0.2; }
  if (breath) { const k = k01(at / (e.params?.breath ?? 0.5)); headA = lerp(-0.35, 0.1, k > 0.99 ? 1 : 0) + (k < 1 ? -0.3 * k : 0); jaw = k < 1 ? 2 + k * 2 : 8; lean = k < 1 ? -0.1 * k : 0.05; }
  if (hurtOf(e)) { lean = -0.15; headA = -0.3; }
  if (!leap) shadow(ctx, 30); else shadow(ctx, 18, 0.2);
  ctx.save(); ctx.translate(shake, 0);
  const legs = (isNear) => {
    for (const [x, off] of [[15, 0], [-18, PI]]) {
      const near = isNear;
      const p = ph + off + (near ? 0 : PI * (charge ? 0.25 : 1));
      let a1, a2;
      if (charge) { a1 = Math.sin(p) * 0.9; a2 = -Math.max(0, Math.cos(p)) * 1.2; }
      else if (walk) { a1 = Math.sin(p) * 0.45; a2 = -Math.max(0, Math.cos(p)) * 0.7; }
      else if (wind) { a1 = x > 0 ? 0.6 : -0.5; a2 = x > 0 ? -1.2 : 1.3; }
      else if (leap) { a1 = x > 0 ? 1.6 : -1.3; a2 = x > 0 ? -0.4 : 0.3; }
      else { a1 = (near ? 0.05 : -0.05); a2 = 0; }
      const hind = x < 0;
      const hy = bodyY + (hind ? -1 : 2);
      end(x * stretch, hy, a1 + (hind ? 0.35 : 0), hind ? 12 : 11); const kx = EX, ky = EY;
      end(kx, ky, a1 + a2 + (hind ? -0.55 : 0), 13); const fx = EX, fy = leap ? EY : Math.min(EY, 0);
      const col = near ? K.fur : K.furD;
      softLimb(ctx, x * stretch, hy, kx, ky, fx, fy, hind ? 5.4 : 4, hind ? 2.4 : 2.4, col, near);
      ctx.beginPath(); ctx.ellipse(fx + 2, fy - 1, 3.4, 1.8, 0, 0, TAU); ink(ctx, C(dk(col, -0.25)), 1.2);
      if (!FL && K.mane === 'fire' && near) glow(ctx, fx + 1, fy - 1, 6, '#ff6a1a', 0.5);
    }
  };
  legs(false);
  ctx.save(); ctx.translate(0, bodyY); ctx.rotate(lean);
  // 꼬리
  const tw = Math.sin(t * (charge ? 12 : 3)) * (charge ? 0.1 : 0.2);
  ctx.save(); ctx.translate(-23 * stretch, -3); ctx.rotate(charge || leap ? -0.2 + tw : 0.7 + tw + (wind ? -0.6 : 0));
  ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(-11, -5, -20, 2); ctx.lineTo(-15, 3); ctx.lineTo(-18, 7); ctx.quadraticCurveTo(-8, 5, 0, 4); ctx.closePath();
  ink(ctx, cyl(ctx, 'cntail' + K.fur, -18, 0, K.fur, 0, 0), 1.6);
  if (!FL && K.mane === 'fire') { glow(ctx, -18, 2, 12, '#ff7a1a', 0.6 + 0.2 * Math.sin(t * 12)); }
  ctx.restore();
  // 몸통
  ctx.beginPath();
  ctx.moveTo(-23 * stretch, -4);
  ctx.bezierCurveTo(-21 * stretch, -13, -4, -11, 8 * stretch, -13);
  ctx.bezierCurveTo(19 * stretch, -14, 23 * stretch, -4, 19 * stretch, 5);
  ctx.bezierCurveTo(15 * stretch, 11, 6, 10, 0, 4);
  ctx.bezierCurveTo(-6, 2, -12, 6, -19 * stretch, 5);
  ctx.closePath();
  ink(ctx, vert(ctx, 'cnbody' + K.fur, -14, 10, K.fur, 0.18, -0.35), 2);
  if (!FL) {
    // 갈기
    ctx.fillStyle = K.furD;
    ctx.beginPath(); ctx.moveTo(-14, -9);
    const spike = wind ? 6 : charge ? 2 : 3;
    for (let i = 0; i < 8; i++) { const x = -14 + i * 4.3 * stretch; ctx.lineTo(x + 2, -12 - spike - (i % 2) * 2 + Math.sin(t * 20 + i) * (wind ? 1 : 0)); ctx.lineTo(x + 4, -11); }
    ctx.lineTo(19, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = K.belly; ctx.beginPath(); ctx.moveTo(4, 5); ctx.quadraticCurveTo(12, 10, 18, 4); ctx.lineTo(16, 2); ctx.quadraticCurveTo(10, 6, 4, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 7; i++) { const x = -18 + i * 5; ctx.beginPath(); ctx.moveTo(x, -8 + (i % 2)); ctx.lineTo(x - 3, -4 + (i % 2)); ctx.stroke(); }
    ctx.strokeStyle = mixCache(K.fur, RIM, 0.6, 0); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-22 * stretch, -5); ctx.bezierCurveTo(-20 * stretch, -12.5, -4, -11, 6, -13.5); ctx.stroke();
    K.extraBody?.(ctx, t, stretch, charge || leap);
  }
  // 머리
  ctx.save(); ctx.translate(20 * stretch, -8 + headY); ctx.rotate(headA + (charge ? 0.15 : 0));
  ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-2, -11); ctx.lineTo(4, -6); ctx.lineTo(3, 6); ctx.lineTo(-6, 8); ctx.closePath(); ink(ctx, C(K.fur), 1.6);
  ctx.beginPath();
  ctx.moveTo(-2, -7); ctx.quadraticCurveTo(4, -10, 8, -6); ctx.lineTo(18, -3); ctx.quadraticCurveTo(20, -1, 18, 1);
  ctx.lineTo(9, 2); ctx.lineTo(16, 2 + jaw); ctx.lineTo(8, 5 + jaw * 0.4); ctx.quadraticCurveTo(0, 6, -3, 2); ctx.closePath();
  ink(ctx, sph(ctx, 'cnhead' + K.fur, 4, -2, 11, K.fur), 1.8);
  if (!FL) {
    ctx.fillStyle = K.mouth ?? '#3a0a10'; ctx.beginPath(); ctx.moveTo(9, 1.5); ctx.lineTo(17.5, 1); ctx.lineTo(16, 2 + jaw); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0e8d8';
    ctx.beginPath(); ctx.moveTo(15, 1); ctx.lineTo(15.8, 3.4); ctx.lineTo(16.6, 1); ctx.moveTo(11, 1.3); ctx.lineTo(11.7, 3.2); ctx.lineTo(12.4, 1.3); ctx.moveTo(13, 2 + jaw * 0.8); ctx.lineTo(13.6, jaw * 0.8 - 0.4); ctx.lineTo(14.2, 2 + jaw * 0.85); ctx.fill();
    ctx.fillStyle = '#0a0608'; ctx.beginPath(); ctx.arc(18.5, -2.2, 1.3, 0, TAU); ctx.fill();
    if (wind || charge) { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.8; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(9 + i * 2, -5 + i * 0.4); ctx.lineTo(10 + i * 2, -3.5 + i * 0.4); ctx.stroke(); } }
    K.extraHead?.(ctx, t, jaw, wind || charge || breath);
  }
  const earA = charge || wind ? -0.9 : -0.3;
  ctx.save(); ctx.translate(1, -7); ctx.rotate(earA);
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-1, -9); ctx.lineTo(3, 0); ctx.closePath(); ink(ctx, C(K.fur), 1.4);
  ctx.restore();
  if (!FL) eyeGlow(ctx, 8, -4, 1.4, K.eye, wind || charge ? 1.6 : 1);
  ctx.restore();
  ctx.restore();
  legs(true);
  ctx.restore();
  if (charge && !FL) {
    addOn(ctx); ctx.strokeStyle = K.speed ?? 'rgba(220,240,255,0.3)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { const y = -34 + i * 7, x0 = -32 - ((t * 400 + i * 37) % 30); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - 18, y); ctx.stroke(); }
    addOff(ctx);
  }
  if (wind && !FL) glint(ctx, 29, -18 + headY, 6 + 4 * Math.sin(t * 30), K.eye, k01(e.animT / 0.4));
}

RENDER_B.snow_wolf = (ctx, e, world, o) => {
  FL = !!o?.flash;
  drawCanine(ctx, e, {
    fur: '#d8e4ec', furD: '#8a9cb0', belly: '#f4f8ff', eye: '#6ad8ff', mane: 'frost', speed: 'rgba(200,240,255,0.35)',
    extraBody(c, t, st) {
      // 털 끝의 고드름
      c.fillStyle = 'rgba(200,240,255,0.9)';
      for (let i = 0; i < 5; i++) { const x = -16 + i * 6 * st; c.beginPath(); c.moveTo(x, 4); c.lineTo(x + 1, 8 + (i % 2) * 2); c.lineTo(x + 2, 4); c.fill(); }
    },
    extraHead(c, t, jaw, angry) {
      // 서리 입김
      for (let i = 0; i < 2; i++) { const u = (t * 0.9 + i * 0.5) % 1; glow(c, 21 + u * 12, 2 + jaw * 0.5 - u * 5, 4 + u * 7, '#dff6ff', (angry ? 0.5 : 0.25) * (1 - u)); }
    },
  });
  FL = false;
};

// ── 갑주 기사 공용 (얼어붙은 기사 / 죽음의 기사 / 근위 갑옷) ──
// K: {steel, trim, cape, eye, blade, bladeGlow, weapon:'greatsword'|'halberd', crest, frost, soul, H}
function drawKnight(ctx, e, K, pose) {
  const t = e.t, an = e.anim;
  const walk = an === 'walk';
  const ph = t * 6;
  const H = K.H ?? 92;
  const sc = H / 92;
  let bob = 0, lean = pose.lean ?? 0;
  if (walk) bob = Math.abs(Math.sin(ph)) * 2;
  else if (an === 'idle') bob = Math.sin(t * 1.8) * 0.8;
  shadow(ctx, 20 * sc + 4);
  ctx.save(); ctx.scale(sc, sc);
  const hipY = -40 + bob;
  const steel = K.steel, steelD = dk(steel, -0.35);
  const leg = (x, p, near) => {
    const s = walk ? Math.sin(ph + p) : pose.legSpread ? (near ? 0.35 : -0.3) : 0;
    const col = near ? steel : steelD;
    end(x, hipY, s * 0.5, 19); const kx = EX, ky = EY; end(kx, ky, s * 0.2 - (walk ? Math.max(0, Math.cos(ph + p)) * 0.5 : 0), 19);
    const fx = EX, fy = Math.min(EY, -1);
    limb(ctx, x, hipY, kx, ky, 5.6, 4.6, col);
    limb(ctx, kx, ky, fx, fy - 2, 4.8, 4, col);
    ctx.beginPath(); ctx.arc(kx, ky, 4, 0, TAU); ink(ctx, sph(ctx, 'knk' + steel + near, 0, 0, 4, col), 1.2);
    ctx.beginPath(); ctx.moveTo(fx - 5, fy + 1); ctx.lineTo(fx - 4, fy - 6); ctx.lineTo(fx + 5, fy - 6); ctx.lineTo(fx + 10, fy + 1); ctx.closePath();
    ink(ctx, C(near ? dk(steel, -0.15) : dk(steel, -0.45)), 1.4);
    if (!FL && K.frost && near) { ctx.fillStyle = 'rgba(220,245,255,0.8)'; ctx.beginPath(); ctx.moveTo(kx - 3, ky - 2); ctx.lineTo(kx - 6, ky - 7); ctx.lineTo(kx, ky - 3); ctx.fill(); }
  };
  leg(-6, PI, false);
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY);
  const shY = hipY - 32;
  // 망토
  if (K.cape) {
    const flutter = K.frost ? 0 : Math.sin(t * 3) * 2;
    ctx.beginPath(); ctx.moveTo(-9, shY + 1);
    ctx.quadraticCurveTo(-18 - (walk ? 4 : 0), shY + 30, -20 + flutter, hipY + 26 + bob * 0.2);
    for (let i = 0; i < 4; i++) ctx.lineTo(-17 + i * 4 + flutter * 0.5, hipY + 30 - (i % 2) * 5);
    ctx.lineTo(-4, hipY + 20); ctx.quadraticCurveTo(-6, shY + 16, 2, shY); ctx.closePath();
    ink(ctx, vert(ctx, 'kncape' + K.cape, shY, hipY + 30, K.cape, 0.1, -0.45), 1.6);
    if (!FL && K.frost) { ctx.strokeStyle = 'rgba(220,245,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-10, shY + 6); ctx.lineTo(-18, hipY + 24); ctx.stroke(); }
  }
  // 먼 팔
  const fa = pose.farArm ?? 0.3;
  end(-7, shY + 4, fa, 15); let ex = EX, ey = EY; end(ex, ey, fa + (pose.farArm2 ?? 0.3), 14);
  limb(ctx, -7, shY + 4, ex, ey, 4.6, 4, steelD);
  limb(ctx, ex, ey, EX, EY, 4, 3.6, steelD);
  const farHand = [EX, EY];
  K.farItem?.(ctx, EX, EY, t, pose);
  // 흉갑
  ctx.beginPath();
  ctx.moveTo(-11, shY); ctx.quadraticCurveTo(0, shY - 4, 12, shY + 1);
  ctx.quadraticCurveTo(14, shY + 16, 9, hipY - 2); ctx.lineTo(10, hipY + 6); ctx.lineTo(-10, hipY + 6); ctx.lineTo(-9, hipY - 2);
  ctx.quadraticCurveTo(-14, shY + 16, -11, shY); ctx.closePath();
  ink(ctx, cyl(ctx, 'knbody' + steel, -13, 14, steel), 2);
  if (!FL) {
    ctx.strokeStyle = K.trim; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(1, shY - 1); ctx.lineTo(2, hipY - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, hipY - 2); ctx.lineTo(9, hipY - 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-9, hipY + 1 + i * 2); ctx.lineTo(9, hipY + 1 + i * 2); ctx.stroke(); }
    ctx.strokeStyle = mixCache(steel, RIM, 0.6, 0); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-11.5, shY + 1); ctx.quadraticCurveTo(-14.5, shY + 16, -9.5, hipY - 2); ctx.stroke();
    K.chest?.(ctx, t, shY, hipY);
  }
  // 투구
  ctx.save(); ctx.translate(2, shY - 7);
  ctx.beginPath(); ctx.moveTo(-8, 5); ctx.quadraticCurveTo(-9, -9, 1, -10); ctx.quadraticCurveTo(10, -9, 10, 2); ctx.lineTo(8, 7); ctx.lineTo(-6, 7); ctx.closePath();
  ink(ctx, sph(ctx, 'knhelm' + steel, 1, -2, 10, steel), 1.8);
  if (!FL) {
    ctx.fillStyle = '#05040a'; ctx.fillRect(1, -3, 9, 3.2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; for (let i = 0; i < 3; i++) ctx.fillRect(4 + i * 2, 1.5, 1, 3.5);
    eyeGlow(ctx, 7, -1.4, 1.3, K.eye, 1.2);
    if (K.soul) {
      // 투구 틈새에서 넘실대는 혼불
      addOn(ctx);
      for (let i = 0; i < 3; i++) { const u = (t * 1.6 + i / 3) % 1; ctx.fillStyle = `rgba(100,255,160,${0.5 * (1 - u)})`; ctx.beginPath(); ctx.arc(5 + Math.sin(t * 5 + i) * 2 - u * 6, -2 - u * 14, 2.5 + u * 3, 0, TAU); ctx.fill(); }
      addOff(ctx);
    }
    ctx.strokeStyle = K.trim; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-7, -4); ctx.quadraticCurveTo(1, -9, 9, -4); ctx.stroke();
    K.helm?.(ctx, t);
  }
  ctx.restore();
  // 어깨 갑주
  ctx.beginPath(); ctx.ellipse(-1, shY + 3, 9, 6, -0.2, PI, TAU); ctx.lineTo(8, shY + 5); ctx.closePath();
  ink(ctx, sph(ctx, 'knpaul' + steel, 0, shY, 9, steel), 1.6);
  if (!FL) K.shoulder?.(ctx, t, shY);
  // 무기 + 가까운 팔
  const na = pose.arm ?? 0.5, na2 = pose.arm2 ?? 0.5;
  end(6, shY + 4, na, 15); ex = EX; ey = EY; end(ex, ey, na + na2, 13);
  const hx = EX, hy = EY;
  const wA = pose.blade ?? na + na2;   // 무기 방향 (각도 규칙)
  if (pose.trail) swingTrail(ctx, 6, shY + 4, pose.trail[0], pose.trail[1], K.reach ?? 74, 20, K.bladeGlow ?? '#e8f0ff', (pose.trail[2] ?? 1) * 0.65);
  // 두 손 잡기: 먼 손도 손잡이로
  K.drawWeapon(ctx, hx, hy, wA, t, pose);
  limb(ctx, 6, shY + 4, ex, ey, 4.8, 4.2, steel);
  limb(ctx, ex, ey, hx, hy, 4.2, 3.8, steel);
  ctx.beginPath(); ctx.arc(hx, hy, 3.6, 0, TAU); ink(ctx, C(dk(steel, -0.2)), 1.3);
  ctx.restore();
  leg(6, 0, true);
  ctx.restore();
  return { farHand };
}
/** 검 (손 위치 hx,hy, 각도 a — 각도 규칙: 0=아래) */
function greatsword(ctx, hx, hy, a, L, W, blade, glowC, t, opt = {}) {
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-a);
  // 손잡이 (반대 방향)
  ctx.fillStyle = C('#2a1a14'); ctx.fillRect(-1.6, -9, 3.2, 10);
  ctx.fillStyle = C(opt.pommel ?? '#8a8a98'); ctx.beginPath(); ctx.arc(0, -10, 2.4, 0, TAU); ctx.fill();
  // 날
  ctx.beginPath(); ctx.moveTo(-W * 0.5, 3); ctx.lineTo(-W * 0.45, L - W * 1.5); ctx.lineTo(0, L); ctx.lineTo(W * 0.45, L - W * 1.5); ctx.lineTo(W * 0.5, 3); ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'gs' + blade + W + L, -W, 0, W, 0, [0, lt(blade, 0.55), 0.45, blade, 0.55, dk(blade, -0.35), 1, dk(blade, -0.55)]), 1.8);
  if (!FL) {
    if (glowC) { addOn(ctx); ctx.globalAlpha *= 0.6 + 0.2 * Math.sin(t * 6); ctx.strokeStyle = glowC; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, L - 4); ctx.stroke(); ctx.globalAlpha /= 0.6 + 0.2 * Math.sin(t * 6); addOff(ctx); glow(ctx, 0, L * 0.5, L * 0.5, glowC, 0.3); }
    opt.deco?.(ctx, L, W, t);
  }
  ctx.beginPath(); ctx.rect(-(opt.guard ?? 7), 0, (opt.guard ?? 7) * 2, 3); ink(ctx, C(opt.guardCol ?? '#6a6a78'), 1.3);
  ctx.restore();
}
/** 검사형 공격 자세 (AI swordsman: comboI, stateT) */
function slashPose(e, P) {
  const an = e.anim;
  const pose = { arm: 0.45, arm2: 0.35, farArm: 0.35, farArm2: 0.4, lean: 0 };
  if (an === 'guard') { pose.arm = 1.1; pose.arm2 = 0.3; pose.blade = PI; pose.lean = -0.08; pose.farArm = 1.2; pose.farArm2 = 0.2; return pose; }
  if (an === 'walk') { pose.arm = 0.55 + Math.sin(e.t * 6) * 0.1; pose.blade = 1.9; pose.farArm = 0.3 - Math.sin(e.t * 6) * 0.25; return pose; }
  if (an !== 'slash') { pose.arm = 0.4; pose.arm2 = 0.3; pose.blade = 1.95 + Math.sin(e.t * 1.8) * 0.03; return pose; }
  const combo = P.combo ?? 2, ci = e.comboI ?? 0, last = ci >= combo - 1;
  const wu = e.counter ? 0.25 : ci === 0 ? (P.windup ?? 0.55) : 0.3;
  const st = e.stateT ?? e.animT;
  let from, to;
  if (last) { from = 3.6; to = 1.0; } else if (ci === 0) { from = -0.6; to = 1.9; } else { from = 1.1; to = 3.2; }
  if (st < wu) {
    const k = ease.outCubic(k01(st / wu));
    const a = lerp(1.9, from, k);
    pose.arm = a * 0.75; pose.arm2 = a * 0.25; pose.blade = a + (last ? 0.3 : 0); pose.lean = last ? -0.12 * k : -0.05 * k; pose.wind = k;
  } else {
    const k = ease.outExpo(k01((st - wu) / 0.1));
    const a = lerp(from, to, k);
    pose.arm = a * 0.75; pose.arm2 = a * 0.25; pose.blade = a; pose.lean = last ? 0.25 * k : 0.12 * k; pose.legSpread = true;
    const fade = 1 - k01((st - wu - 0.1) / 0.2);
    if (fade > 0) pose.trail = [from, a, fade];
  }
  pose.farArm = pose.arm * 0.8; pose.farArm2 = pose.arm2;
  return pose;
}

// ── 얼어붙은 기사 ──
RENDER_B.frozen_knight = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const P = e.params ?? {};
  const pose = slashPose(e, P);
  const K = {
    H: 92, steel: '#6a7a90', trim: '#bfe8ff', cape: '#3a5a7a', eye: '#bff4ff', bladeGlow: '#9fe8ff', frost: true,
    shoulder(c, t, shY) { c.fillStyle = 'rgba(220,245,255,0.9)'; c.strokeStyle = OUT; c.lineWidth = 1; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-6 + i * 5, shY - 1); c.lineTo(-7 + i * 5, shY - 8 - (i % 2) * 4); c.lineTo(-3 + i * 5, shY - 1); c.closePath(); c.fill(); c.stroke(); } },
    helm(c, t) { c.fillStyle = 'rgba(220,245,255,0.9)'; c.beginPath(); c.moveTo(-6, -7); c.lineTo(-9, -16); c.lineTo(-2, -9); c.lineTo(1, -18); c.lineTo(4, -9); c.closePath(); c.fill(); c.strokeStyle = 'rgba(40,80,120,0.8)'; c.lineWidth = 0.8; c.stroke(); },
    chest(c, t, shY, hipY) { c.fillStyle = 'rgba(200,240,255,0.45)'; c.beginPath(); c.moveTo(-10, shY + 6); c.lineTo(-3, shY + 3); c.lineTo(-6, shY + 16); c.closePath(); c.fill(); c.beginPath(); c.moveTo(6, hipY - 10); c.lineTo(11, hipY - 16); c.lineTo(10, hipY - 4); c.closePath(); c.fill(); },
    drawWeapon(c, hx, hy, a, t) {
      greatsword(c, hx, hy, a, 50, 8, '#a8e0f8', '#bff4ff', t, { guardCol: '#bfe8ff', guard: 8, deco(cc, L) { cc.fillStyle = 'rgba(240,252,255,0.9)'; for (let i = 0; i < 3; i++) { cc.beginPath(); cc.moveTo(3.5, 10 + i * 12); cc.lineTo(8, 14 + i * 12); cc.lineTo(3.5, 16 + i * 12); cc.fill(); } } });
    },
  };
  drawKnight(ctx, e, K, pose);
  if (pose.wind && !FL) glint(ctx, 10, -86, 5 + 6 * pose.wind, '#e8fbff', pose.wind > 0.5 ? (pose.wind - 0.5) * 2 : 0);
  if (!FL) for (let i = 0; i < 3; i++) { const u = (e.t * 0.4 + i / 3) % 1; ctx.fillStyle = `rgba(210,240,255,${0.16 * (1 - u)})`; ctx.beginPath(); ctx.arc(-10 + i * 10, -4 - u * 14, 5 + u * 6, 0, TAU); ctx.fill(); }
  FL = false;
};

// ── 얼음 박쥐 ──
RENDER_B.ice_bat = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const body = '#6ab8e0', mem = '#9ad8f4', bone = '#e8fbff';
  const hang = an === 'hang', shiver = an === 'shiver';
  const flap = hang ? -1 : Math.sin(t * (shiver ? 30 : 14));
  const sh = shiver ? Math.sin(t * 70) * 1.2 : 0;
  ctx.save(); ctx.translate(sh, -12);
  if (hang) { ctx.translate(0, -2); ctx.scale(1, -1); }
  glow(ctx, 0, 0, 22, '#9fe8ff', 0.3 + (shiver ? 0.3 : 0));
  // 날개
  const lift = hang ? -1.2 : flap * 0.9;
  ctx.save(); ctx.translate(-3, -2); ctx.scale(-1, 1); ctx.rotate(-0.2); batWing(ctx, 18, lift, dk(mem, -0.2), bone, 0.6); ctx.restore();
  // 몸
  ctx.beginPath(); ctx.ellipse(0, 1, 6.5, 7.5, 0, 0, TAU);
  ink(ctx, sph(ctx, 'ibody', 0, 1, 7.5, body), 1.6);
  if (!FL) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(0, 1); ctx.lineTo(3, -3); ctx.moveTo(0, 1); ctx.lineTo(0, 6); ctx.stroke();
  }
  // 머리 + 귀(결정)
  crystal(ctx, [-4, -6, -6, -15, -1, -8], 'ibear1', '#bff0ff', 1.1);
  crystal(ctx, [1, -8, 4, -16, 5, -6], 'ibear2', '#bff0ff', 1.1);
  ctx.beginPath(); ctx.ellipse(2, -5, 5.2, 4.6, 0, 0, TAU); ink(ctx, sph(ctx, 'ibhead', 2, -5, 5, body), 1.4);
  if (!FL) {
    eyeGlow(ctx, 4.2, -5.6, 1, '#ffffff', 1.2);
    eyeGlow(ctx, 0.8, -5.8, 0.8, '#ffffff', 0.8);
    ctx.fillStyle = '#f0fbff'; ctx.beginPath(); ctx.moveTo(3, -2.6); ctx.lineTo(3.6, 0.6); ctx.lineTo(4.2, -2.6); ctx.moveTo(5, -2.8); ctx.lineTo(5.5, -0.2); ctx.lineTo(6, -2.8); ctx.fill();
  }
  ctx.save(); ctx.translate(3, -2); ctx.rotate(-0.1); batWing(ctx, 20, lift, mem, bone, 0.6); ctx.restore();
  // 매달린 고드름 (몸 아래)
  if (!FL && !hang) { ctx.fillStyle = 'rgba(220,245,255,0.9)'; ctx.beginPath(); ctx.moveTo(-2, 7); ctx.lineTo(0, 13 + (shiver ? 3 : 0)); ctx.lineTo(2, 7); ctx.fill(); }
  ctx.restore();
  if (shiver && !FL) glint(ctx, 0, 4, 3 + 4 * k01(at / 0.38), '#e8fbff', k01(at / 0.38));
  FL = false;
};

// ── s10 투사체 / 장판 ──
PROJ_B.frostshard = (ctx, p) => {
  const a = Math.atan2(p.vy, p.vx);
  ctx.rotate(a);
  glow(ctx, 0, 0, 16, '#9fe8ff', 0.6);
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(0, -4.5); ctx.lineTo(-10, -1.5); ctx.lineTo(-12, 0); ctx.lineTo(-10, 1.5); ctx.lineTo(0, 4.5); ctx.closePath();
  ctx.fillStyle = linG(ctx, 'pfs', -12, 0, 12, 0, [0, 'rgba(90,180,230,0.6)', 0.6, '#bff4ff', 1, '#ffffff']); ctx.fill();
  ctx.strokeStyle = 'rgba(20,60,110,0.9)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(11, 0); ctx.stroke();
};
PROJ_B.icewave = (ctx, p) => {
  const d = Math.sign(p.vx) || 1;
  ctx.scale(d, 1);
  const H = p.h, k = p.maxLife ? k01(p.life / 0.3) : 1;
  ctx.globalAlpha *= k;
  glow(ctx, 0, H * 0.2, H * 0.9, '#6ad0ff', 0.45);
  // 지면을 달리는 얼음 결정 무리
  for (let i = 0; i < 4; i++) {
    const x = -i * 9, h = H * (0.9 - i * 0.18) * (0.9 + 0.1 * Math.sin(p.t * 20 + i));
    ctx.beginPath(); ctx.moveTo(x - 6, H / 2); ctx.lineTo(x - 2, H / 2 - h); ctx.lineTo(x + 6, H / 2); ctx.closePath();
    ctx.fillStyle = linG(ctx, 'piw' + i, 0, H / 2 - h, 0, H / 2, [0, '#ffffff', 0.4, '#bff4ff', 1, 'rgba(60,140,210,0.6)']); ctx.fill();
    ctx.strokeStyle = 'rgba(20,70,120,0.8)'; ctx.lineWidth = 1; ctx.stroke();
  }
  addOn(ctx); ctx.fillStyle = 'rgba(200,245,255,0.5)'; ctx.beginPath(); ctx.ellipse(-8, H / 2 - 2, 20, 4, 0, 0, TAU); ctx.fill(); addOff(ctx);
};
PROJ_B.icicle = (ctx, p) => {
  glow(ctx, 0, 0, 14, '#9fe8ff', 0.4);
  ctx.beginPath(); ctx.moveTo(-5, -11); ctx.lineTo(5, -11); ctx.lineTo(1.5, 4); ctx.lineTo(0, 12); ctx.lineTo(-1.5, 4); ctx.closePath();
  ctx.fillStyle = linG(ctx, 'picl', -5, 0, 5, 0, [0, '#ffffff', 0.5, '#bff4ff', 1, '#4a9ad0']); ctx.fill();
  ctx.strokeStyle = 'rgba(20,60,110,0.9)'; ctx.lineWidth = 1; ctx.stroke();
};
ZONE_B.icespike = (ctx, z) => {
  const cx = z.cx, by = z.bottom, t = z.t, seed = z.data?.seed ?? 0;
  ctx.save();
  if (!z.active) {
    const k = z.warnK;
    // 경고: 바닥에 번지는 서리 균열
    addOn(ctx);
    ctx.strokeStyle = `rgba(190,240,255,${0.3 + 0.6 * k})`; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = PI + (i / 4) * PI, r = 8 + 16 * k; ctx.moveTo(cx, by - 1); ctx.lineTo(cx + Math.cos(a) * r, by - 1 + Math.sin(a) * r * 0.25); }
    ctx.stroke();
    ctx.fillStyle = `rgba(160,230,255,${0.3 * k})`; ctx.beginPath(); ctx.ellipse(cx, by - 1, 20 * k + 4, 4, 0, 0, TAU); ctx.fill();
    addOff(ctx);
    ctx.restore(); return;
  }
  const up = ease.outBack(k01(z.liveK * 4)), fade = k01(z.life / 0.12);
  ctx.globalAlpha = fade;
  const H = z.h * up;
  glow(ctx, cx, by - H * 0.5, H * 0.6, '#6ad0ff', 0.4);
  const spikes = [[0, 1, 9], [-10, 0.6, 6], [10, 0.7, 6], [-5, 0.8, 5], [6, 0.5, 5]];
  for (const [dx, hk, w] of spikes) {
    const h = H * hk * (0.9 + 0.2 * h1(seed + dx));
    ctx.beginPath(); ctx.moveTo(cx + dx - w, by); ctx.lineTo(cx + dx + (h1(seed + dx + 3) - 0.5) * 4, by - h); ctx.lineTo(cx + dx + w, by); ctx.closePath();
    const g = ctx.createLinearGradient(cx + dx - w, 0, cx + dx + w, 0);
    g.addColorStop(0, 'rgba(90,170,230,0.85)'); g.addColorStop(0.45, '#e8fbff'); g.addColorStop(0.55, '#9ad8f4'); g.addColorStop(1, 'rgba(40,100,170,0.9)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(10,40,80,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
  }
  ctx.restore();
};

// ═════════════════════════ s11 피의 예배당 ═════════════════════════
/** 흘러내리는 긴 머리칼 (머리 원점 기준, 뒤쪽으로) */
function longHair(ctx, len, wid, col, t, wind = 1, key = '') {
  ctx.beginPath();
  ctx.moveTo(-6, -6);
  const N = 6;
  for (let k = 1; k <= N; k++) { const u = k / N; ctx.lineTo(-7 - u * wid * wind * 0.8 + Math.sin(t * 3 - u * 3) * u * 3, -4 + u * len); }
  for (let k = N; k >= 1; k--) { const u = k / N; ctx.lineTo(-7 - u * wid * wind * 0.8 + wid * (1 - u * 0.6) + Math.sin(t * 3 - u * 3 + 0.5) * u * 3, -4 + u * len); }
  ctx.lineTo(4, -4); ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'lh' + col + len + key, 0, -6, 0, len, [0, lt(col, 0.15), 0.6, col, 1, dk(col, -0.4)]), 1.4);
}
/** 여성 얼굴 (원점=머리 중심, 오른쪽 보기) */
function femFace(ctx, skin, eye, t, opt = {}) {
  ctx.beginPath();
  ctx.moveTo(-5, -6); ctx.quadraticCurveTo(0, -9.5, 5, -6); ctx.quadraticCurveTo(7.4, -2, 6.6, 2);
  ctx.quadraticCurveTo(6, 5.6, 2.6, 7); ctx.quadraticCurveTo(-3, 7.6, -5.2, 3); ctx.quadraticCurveTo(-6.6, -2, -5, -6); ctx.closePath();
  ink(ctx, sph(ctx, 'ff' + skin, 1, -1, 8, skin), 1.4);
  if (FL) return;
  if (opt.blind) {
    ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.moveTo(-6, -3.2); ctx.lineTo(7, -3.6); ctx.lineTo(7, -0.4); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a8101e'; ctx.beginPath(); ctx.arc(4.4, -1.8, 1.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#a8101e'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(4.4, -0.4); ctx.quadraticCurveTo(4.8, 2, 4.2, 4.4 + Math.sin(t * 1.5) * 0.4); ctx.stroke();
  } else {
    ctx.fillStyle = '#1a0a14'; ctx.beginPath(); ctx.ellipse(3.8, -1.6, 1.8, 1.1, -0.1, 0, TAU); ctx.fill();
    eyeGlow(ctx, 4.1, -1.6, 0.95, eye, opt.eyeK ?? 1);
    ctx.strokeStyle = '#1a0a14'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(1.8, -3.8); ctx.lineTo(6, -3.6); ctx.stroke();
  }
  ctx.fillStyle = opt.lips ?? '#8a1a2a'; ctx.beginPath(); ctx.ellipse(4.6, 3.8, 1.4, opt.mouth ? 1.4 : 0.6, 0, 0, TAU); ctx.fill();
  if (opt.fangs) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(4, 3.8); ctx.lineTo(4.3, 5.4); ctx.lineTo(4.7, 3.8); ctx.fill(); }
  ctx.strokeStyle = mixCache(skin, RIM, 0.6, 0); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, 3); ctx.quadraticCurveTo(-6.4, -2, -4.8, -6); ctx.stroke();
}

// ── 서큐버스 ──
RENDER_B.succubus = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const skin = '#e8b8c4', suit = '#2a0c24', trim = '#c8203a', hair = '#6a1a5a', wingC = '#4a1030';
  const kiss = an === 'kiss', fold = an === 'fold', dive = an === 'dive';
  const flap = Math.sin(t * 5);
  let rot = Math.sin(t * 1.3) * 0.05, wingL = flap * 0.5 + 0.2, span = 34, bob = Math.sin(t * 2.4) * 3, kk = 0;
  if (kiss) kk = k01(at / 0.55);
  if (fold) { const k = ease.outCubic(k01(at / 0.38)); wingL = lerp(wingL, 1.3, k); span = lerp(34, 22, k); rot = 0.25 * k; }
  if (dive) { wingL = 1.4; span = 22; rot = 0.7; }
  ctx.save(); ctx.translate(0, -44 + bob); ctx.rotate(rot);
  glow(ctx, 0, -6, 40, '#ff3a7a', 0.18 + kk * 0.2);
  // 뒤 날개
  ctx.save(); ctx.translate(-4, -18); ctx.scale(-1, 1); ctx.rotate(-0.5); batWing(ctx, span, wingL, dk(wingC, -0.2), '#2a0a1a', 0.55); ctx.restore();
  // 꼬리 (하트 끝)
  const tw = Math.sin(t * 2.5);
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 3.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4, 6); ctx.bezierCurveTo(-16, 14, -22 + tw * 3, 26, -14 + tw * 5, 34); ctx.stroke();
  ctx.strokeStyle = C(suit); ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); ctx.translate(-14 + tw * 5, 35); ctx.rotate(0.3 + tw * 0.2);
  ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-6, 0, -4, -5, 0, -2); ctx.bezierCurveTo(4, -5, 6, 0, 0, 5); ctx.closePath(); ink(ctx, C(trim), 1.2);
  ctx.restore();
  // 뒤 다리 (접힌)
  softLimb(ctx, -2, 8, -8, 22, -3, 34, 4, 3, dk(suit, -0.2), false);
  // 먼 팔
  end(-3, -16, dive ? 2.2 : 0.4, 12); let ex = EX, ey = EY; end(ex, ey, dive ? 2.4 : 0.9, 11);
  softLimb(ctx, -3, -16, ex, ey, EX, EY, 2.6, 2, dk(skin, -0.25), false);
  // 머리칼 (뒤)
  ctx.save(); ctx.translate(1, -30); longHair(ctx, 34, 12, hair, t, 1, 'sc'); ctx.restore();
  // 몸통 (바디수트 + 코르셋)
  ctx.beginPath();
  ctx.moveTo(-5, -20); ctx.quadraticCurveTo(-7, -10, -4, -3); ctx.quadraticCurveTo(-7, 3, -5, 9);
  ctx.lineTo(5, 9); ctx.quadraticCurveTo(6, 2, 4, -3); ctx.quadraticCurveTo(8, -12, 5, -20); ctx.quadraticCurveTo(0, -23, -5, -20); ctx.closePath();
  ink(ctx, cyl(ctx, 'scbody', -7, 7, suit), 1.6);
  if (!FL) {
    ctx.fillStyle = skin; ctx.beginPath(); ctx.moveTo(-4, -20); ctx.quadraticCurveTo(0, -23, 4.5, -20); ctx.lineTo(3.5, -16); ctx.quadraticCurveTo(0, -18, -3.5, -16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = trim; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-4, -15); ctx.quadraticCurveTo(0, -13, 5, -15.5); ctx.moveTo(-4, -3); ctx.lineTo(4, -3); ctx.stroke();
    ctx.lineWidth = 0.7; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-0.5, -13 + i * 2.6); ctx.lineTo(2.5, -11.6 + i * 2.6); ctx.moveTo(2.5, -13 + i * 2.6); ctx.lineTo(-0.5, -11.6 + i * 2.6); ctx.stroke(); }
    ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(1, -3, 1.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = mixCache(suit, RIM, 0.55, 0); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-5.5, -19); ctx.quadraticCurveTo(-7.5, -10, -4.5, -3); ctx.stroke();
  }
  // 머리
  ctx.save(); ctx.translate(1, -30); ctx.rotate(kiss ? -0.1 * kk : 0);
  // 뿔
  for (const [x, c] of [[-2, dk('#3a2030', -0.1)], [3, '#4a2a3a']]) {
    ctx.beginPath(); ctx.moveTo(x - 2, -6); ctx.bezierCurveTo(x - 4, -14, x - 10, -15, x - 12, -11); ctx.bezierCurveTo(x - 8, -12, x - 4, -10, x + 1, -6); ctx.closePath();
    ink(ctx, linG(ctx, 'schorn' + x, x, -6, x - 12, -12, [0, c, 1, '#c8a0b0']), 1.2);
  }
  femFace(ctx, skin, '#ff5a9a', t, { lips: '#c81a4a', mouth: kiss && kk > 0.7, eyeK: 1.2 });
  // 앞머리
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.quadraticCurveTo(-2, -12, 6, -7); ctx.quadraticCurveTo(2, -7, 0, -4); ctx.quadraticCurveTo(-2, 0, -5, 3); ctx.closePath();
  ctx.fillStyle = C(hair); ctx.fill();
  ctx.restore();
  // 가까운 다리 (무릎 올림, 부츠)
  const kneeA = dive ? -0.6 : 0.9 + Math.sin(t * 1.6) * 0.1;
  end(2, 8, kneeA, 13); const kx = EX, ky = EY; end(kx, ky, kneeA - (dive ? 0.2 : 1.9), 13);
  softLimb(ctx, 2, 8, kx, ky, EX, EY, 4.2, 3.2, suit, true);
  if (!FL) { ctx.strokeStyle = trim; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(kx - 3, ky + 1); ctx.lineTo(kx + 3, ky - 1); ctx.stroke(); }
  // 가까운 팔 (입맞춤)
  let a1 = 0.5 + Math.sin(t * 1.8) * 0.1, a2 = 1.0;
  if (kiss) { if (kk < 0.7) { a1 = lerp(0.5, 2.3, ease.outCubic(kk / 0.7)); a2 = lerp(1.0, 2.2, kk / 0.7); } else { const k = (kk - 0.7) / 0.3; a1 = lerp(2.3, 1.7, k); a2 = lerp(2.2, 0.1, k); } }
  if (fold || dive) { a1 = 1.6; a2 = 0.3; }
  end(4, -17, a1, 11); ex = EX; ey = EY; end(ex, ey, a1 + a2, 10);
  softLimb(ctx, 4, -17, ex, ey, EX, EY, 2.6, 2, skin, true);
  if (!FL) { ctx.fillStyle = suit; ctx.beginPath(); ctx.arc(EX, EY, 2.2, 0, TAU); ctx.fill(); }
  claws(ctx, EX, EY, '#e8c0d0', fold || dive ? 1 : 0, 3.5);
  if (kiss && !FL) {
    glow(ctx, EX + 3, EY, 10 + kk * 10, '#ff4a8a', kk);
    if (kk > 0.6) glint(ctx, EX + 4, EY, 4 + 5 * kk, '#ffc0d8', (kk - 0.6) * 2.5);
  }
  // 앞 날개
  ctx.save(); ctx.translate(2, -18); ctx.rotate(-0.4); batWing(ctx, span * 1.05, wingL, wingC, '#2a0a1a', 0.55); ctx.restore();
  ctx.restore();
  if (fold && !FL) glint(ctx, 14, -34 + bob, 5 + 4 * Math.sin(t * 30), '#ff8ab0', k01(at / 0.3));
  FL = false;
};

// ── 피의 사제 ──
RENDER_B.blood_priest = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const robe = '#6a0c18', robeD = '#2a0610', gold = '#d8a840', skin = '#c8b0a8', white = '#e8dcc8';
  const walk = an === 'walk', cast = an === 'cast', ch = an === 'channel';
  const ck = cast ? k01(at / ((e.params?.cast ?? 0.8) * 0.5)) : ch ? k01(at / 0.3) : 0;
  const ph = t * 5;
  const sway = walk ? Math.sin(ph) * 2 : Math.sin(t * 1.5) * 0.6;
  shadow(ctx, 16);
  // 발밑 핏빛 마법진
  if ((cast || ch) && !FL) {
    ctx.save(); ctx.scale(1, 0.28);
    addOn(ctx);
    ctx.strokeStyle = `rgba(255,40,70,${0.7 * ck})`; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, -4, 30, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -4, 22, 0, TAU); ctx.stroke();
    for (let i = 0; i < 5; i++) { const a = t * 1.5 + i * TAU / 5, b = a + TAU * 2 / 5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 22, -4 + Math.sin(a) * 22); ctx.lineTo(Math.cos(b) * 22, -4 + Math.sin(b) * 22); ctx.stroke(); }
    addOff(ctx);
    ctx.restore();
    glow(ctx, 0, -4, 36, '#ff2a44', 0.35 * ck);
  }
  // 신발
  for (const [x, near] of [[-4, false], [4, true]]) { const s = walk ? Math.sin(ph + (near ? 0 : PI)) * 4 : 0; ctx.beginPath(); ctx.ellipse(x + s + 2, -2, 5, 2.4, 0, 0, TAU); ink(ctx, C(near ? '#1a0a0e' : '#0e060a'), 1.2); }
  const shY = -62;
  // 먼 팔 (성배 없는 손 — 묵주)
  let fa = 0.3, fa2 = 0.5;
  if (ch) { fa = 1.5; fa2 = 0.1; }
  end(-6, shY + 3, fa, 15); let ex = EX, ey = EY; end(ex, ey, fa + fa2, 13);
  softLimb(ctx, -6, shY + 3, ex, ey, EX, EY, 4, 3, robeD, false);
  ctx.fillStyle = C(skin); ctx.beginPath(); ctx.arc(EX, EY, 2.4, 0, TAU); ctx.fill();
  if (!FL) { ctx.strokeStyle = gold; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(EX, EY); ctx.quadraticCurveTo(EX - 2, EY + 8, EX + 1, EY + 12); ctx.stroke(); ctx.fillStyle = gold; ctx.fillRect(EX - 0.6, EY + 11, 1.2, 5); ctx.fillRect(EX - 2, EY + 14, 4, 1.2); }
  // 제의 (긴 로브)
  ctx.beginPath();
  ctx.moveTo(-9, shY);
  ctx.quadraticCurveTo(-14, -30, -15 + sway * 0.5, -3);
  ctx.quadraticCurveTo(0, 0, 14 + sway * 0.5, -3);
  ctx.quadraticCurveTo(13, -30, 9, shY + 1);
  ctx.quadraticCurveTo(0, shY - 4, -9, shY); ctx.closePath();
  ink(ctx, cyl(ctx, 'bprobe', -15, 14, robe), 2);
  if (!FL) {
    // 영대 (금실)
    ctx.fillStyle = robeD; ctx.beginPath(); ctx.moveTo(-1, shY + 1); ctx.lineTo(5, shY + 1); ctx.lineTo(6 + sway * 0.3, -6); ctx.lineTo(-2 + sway * 0.3, -6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = gold; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = gold;
    for (let i = 0; i < 3; i++) { const y = shY + 12 + i * 14; ctx.fillRect(1.6, y - 3, 1.2, 6); ctx.fillRect(0.2, y + 1, 4, 1.2); }
    // 핏물 젖은 자락
    ctx.fillStyle = 'rgba(140,0,20,0.7)'; ctx.beginPath(); ctx.moveTo(-15 + sway * 0.5, -3); ctx.quadraticCurveTo(0, 0, 14 + sway * 0.5, -3); ctx.lineTo(13, -9); ctx.quadraticCurveTo(0, -5, -14, -9); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 3; i++) { const u = (t * 0.6 + i / 3) % 1; ctx.fillStyle = `rgba(200,10,30,${0.9 * (1 - u)})`; ctx.beginPath(); ctx.ellipse(-8 + i * 8, -3 + u * 4, 1, 1.4, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = mixCache(robe, RIM, 0.55, 0); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-9.5, shY + 1); ctx.quadraticCurveTo(-14.5, -30, -15, -4); ctx.stroke();
  }
  // 망토 깃
  ctx.beginPath(); ctx.moveTo(-11, shY + 2); ctx.quadraticCurveTo(0, shY - 6, 11, shY + 2); ctx.lineTo(8, shY + 11); ctx.quadraticCurveTo(0, shY + 8, -9, shY + 11); ctx.closePath();
  ink(ctx, vert(ctx, 'bpcape', shY - 5, shY + 11, white, 0.1, -0.35), 1.4);
  if (!FL) { ctx.strokeStyle = gold; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-9, shY + 10); ctx.quadraticCurveTo(0, shY + 7, 8, shY + 10); ctx.stroke(); }
  // 머리 + 주교관
  ctx.save(); ctx.translate(2, shY - 8); ctx.rotate(cast ? -0.25 * ck : 0.05);
  ctx.beginPath(); ctx.moveTo(-5, -5); ctx.quadraticCurveTo(1, -8, 6, -4); ctx.quadraticCurveTo(7, 2, 5, 6); ctx.quadraticCurveTo(1, 8, -3, 6); ctx.quadraticCurveTo(-6, 0, -5, -5); ctx.closePath();
  ink(ctx, sph(ctx, 'bphead', 1, 0, 7, skin), 1.4);
  if (!FL) {
    ctx.fillStyle = 'rgba(90,40,50,0.5)'; ctx.beginPath(); ctx.ellipse(3, 1.5, 3, 1.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a0608'; ctx.beginPath(); ctx.ellipse(3.5, -1.4, 1.6, 1.1, 0, 0, TAU); ctx.fill();
    eyeGlow(ctx, 3.8, -1.4, 0.9, '#ff2a3a', 1 + ck);
    ctx.strokeStyle = '#4a1a1a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(2, 3.6); ctx.lineTo(6, 3.4); ctx.stroke();
    ctx.strokeStyle = '#a8101e'; ctx.beginPath(); ctx.moveTo(5.5, 3.6); ctx.lineTo(5.6, 6); ctx.stroke();
  }
  // 주교관 (높은 모자)
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-5, -14); ctx.quadraticCurveTo(0, -24, 1, -25); ctx.quadraticCurveTo(3, -24, 7, -14); ctx.lineTo(7, -4); ctx.closePath();
  ink(ctx, cyl(ctx, 'bpmitre', -6, 7, robe), 1.5);
  if (!FL) {
    ctx.strokeStyle = gold; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(7, -5); ctx.moveTo(1, -24); ctx.lineTo(1, -5); ctx.stroke();
    // 핏방울 문장
    ctx.fillStyle = '#ff2a3a'; ctx.beginPath(); ctx.moveTo(1, -18); ctx.quadraticCurveTo(4, -13, 1, -11); ctx.quadraticCurveTo(-2, -13, 1, -18); ctx.fill();
    glow(ctx, 1, -14, 8, '#ff2a3a', 0.6);
  }
  ctx.restore();
  // 가까운 팔 + 성배
  let na = 0.6, na2 = 1.1;
  if (cast) { const k = ease.outCubic(ck); na = lerp(0.6, 2.8, k); na2 = lerp(1.1, 0.2, k); }
  if (ch) { na = 1.6; na2 = 0.1; }
  end(6, shY + 3, na, 15); ex = EX; ey = EY; end(ex, ey, na + na2, 13);
  softLimb(ctx, 6, shY + 3, ex, ey, EX, EY, 4, 3, robe, true);
  ctx.fillStyle = C(skin); ctx.beginPath(); ctx.arc(EX, EY, 2.4, 0, TAU); ctx.fill();
  // 성배
  ctx.save(); ctx.translate(EX, EY - 2);
  ctx.beginPath(); ctx.moveTo(-5, -7); ctx.quadraticCurveTo(-5, -1, 0, 0); ctx.quadraticCurveTo(5, -1, 5, -7); ctx.closePath();
  ink(ctx, linG(ctx, 'bpcup', -5, 0, 5, 0, [0, '#8a6a20', 0.5, '#ffe080', 1, '#8a6a20']), 1.3);
  ctx.beginPath(); ctx.rect(-0.8, 0, 1.6, 4); ctx.rect(-3, 4, 6, 1.4); ink(ctx, C(gold), 1);
  if (!FL) {
    ctx.fillStyle = '#c80a20'; ctx.beginPath(); ctx.ellipse(0, -7, 5, 1.5, 0, 0, TAU); ctx.fill();
    glow(ctx, 0, -8, 12 + ck * 14, '#ff2a44', 0.5 + ck * 0.5);
    // 넘쳐 흐르는 피
    const u = (t * 0.8) % 1;
    ctx.fillStyle = '#c80a20'; ctx.beginPath(); ctx.ellipse(4.6, -5 + u * 10, 0.9, 1.3, 0, 0, TAU); ctx.fill();
    if (cast) glint(ctx, 0, -10, 4 + 6 * ck, '#ffb0b8', ck > 0.5 ? (ck - 0.5) * 2 : 0);
  }
  ctx.restore();
  FL = false;
};

// ── 뼈 천사 ──
/** 뼈 날개: 뼈대 + 찢어진 깃털 */
function boneWing(ctx, span, lift, bone, feather, t) {
  ctx.save(); ctx.rotate(-lift);
  const S = span;
  // 깃털 (찢어진 흰 깃)
  for (let i = 0; i < 7; i++) {
    const u = i / 6, x = S * (0.25 + u * 0.72), y = -S * 0.12 + u * S * 0.05;
    const L = S * (0.55 - u * 0.25) * (0.85 + 0.15 * h1(i * 3));
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.35 + u * 0.5 + Math.sin(t * 3 + i) * 0.04);
    ctx.beginPath(); ctx.moveTo(-2.4, 0); ctx.quadraticCurveTo(-3, L * 0.6, -0.5, L); ctx.lineTo(0.6, L * 0.8); ctx.lineTo(1.4, L * 0.92); ctx.quadraticCurveTo(3, L * 0.5, 2.4, 0); ctx.closePath();
    ink(ctx, FL ? WHITE : linG(ctx, 'bwf' + L.toFixed(0), 0, 0, 0, L, [0, feather, 0.7, dk(feather, -0.2), 1, 'rgba(120,110,100,0.6)']), 1);
    ctx.restore();
  }
  // 뼈대
  const pts = [0, 0, S * 0.45, -S * 0.22, S * 1.0, -S * 0.08];
  ctx.lineCap = 'round';
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 4.6;
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); ctx.lineTo(pts[2], pts[3]); ctx.lineTo(pts[4], pts[5]); ctx.stroke();
  ctx.strokeStyle = C(bone); ctx.lineWidth = 2.6; ctx.stroke();
  ctx.fillStyle = C(bone); ctx.beginPath(); ctx.arc(pts[2], pts[3], 2.6, 0, TAU); ctx.fill();
  if (!FL) { ctx.strokeStyle = mixCache(bone, RIM, 0.5, 0); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(1, -1.4); ctx.lineTo(pts[2], pts[3] - 1.4); ctx.lineTo(pts[4], pts[5] - 1.2); ctx.stroke(); }
  ctx.restore();
}
RENDER_B.bone_angel = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const bone = '#e8dcc0', rag = '#d8d0c0', gold = '#ffd86a';
  const raise = an === 'raise', aim = an === 'aim', dive = an === 'dive';
  const flap = Math.sin(t * 3.5);
  let lift = flap * 0.4 + 0.1, rot = 0, bob = Math.sin(t * 1.8) * 3, rk = 0;
  const localAim = (e.aimA !== undefined) ? (e.facing >= 0 ? e.aimA : PI - e.aimA) : 0.6;
  if (raise) { rk = ease.outCubic(k01(at / 0.55)); lift = lerp(lift, 1.0, rk); }
  if (aim) { lift = 0.7 + Math.sin(t * 20) * 0.05; rot = localAim * 0.4; }
  if (dive) { lift = -0.8; rot = localAim * 0.8; }
  ctx.save(); ctx.translate(0, -46 + bob); ctx.rotate(rot);
  glow(ctx, 0, -10, 42, '#fff2b0', 0.15 + rk * 0.3);
  // 뒤 날개
  ctx.save(); ctx.translate(-4, -16); ctx.scale(-1, 1); ctx.rotate(-0.25); boneWing(ctx, 34, lift, dk(bone, -0.2), dk(rag, -0.2), t); ctx.restore();
  // 누더기 (하체)
  ctx.beginPath(); ctx.moveTo(-6, -2);
  for (let i = 0; i < 6; i++) { const x = -8 + i * 3.4, sw = Math.sin(t * 3 + i) * 2; ctx.lineTo(x + 1.7 + sw, 26 + (i % 2) * 8 + Math.sin(t * 2 + i) * 2); ctx.lineTo(x + 3.4, 18 + (i % 3) * 3); }
  ctx.lineTo(8, -2); ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'barag', 0, -2, 0, 34, [0, rag, 0.7, dk(rag, -0.3), 1, 'rgba(120,110,100,0.3)']), 1.4);
  // 척추 + 갈비
  if (!FL) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-1, -26); ctx.quadraticCurveTo(-3, -12, -1, 0); ctx.stroke();
    ctx.strokeStyle = bone; ctx.lineWidth = 2.4; ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const y = -23 + i * 4.6, w = 9 - i * 1.2;
    ctx.beginPath(); ctx.moveTo(-1.5, y); ctx.quadraticCurveTo(w, y - 2, w - 1, y + 3); ctx.quadraticCurveTo(w - 3, y + 1, -1.5, y + 1.6); ctx.closePath();
    ink(ctx, C(i % 2 ? dk(bone, -0.1) : bone), 1.1);
  }
  ctx.beginPath(); ctx.ellipse(0, -1, 6, 3, 0, 0, TAU); ink(ctx, C(bone), 1.2);
  // 해골 머리 + 부서진 후광
  ctx.save(); ctx.translate(2, -33);
  if (!FL) {
    const fl = 0.6 + 0.4 * Math.sin(t * 7) * Math.sin(t * 3.1);
    ctx.save(); ctx.translate(-1, -11); ctx.scale(1, 0.34);
    addOn(ctx);
    ctx.strokeStyle = `rgba(255,220,120,${0.55 + 0.4 * fl})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0.3, PI * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 11, PI * 1.0, PI * 1.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 11, PI * 1.82, PI * 2.1); ctx.stroke();
    addOff(ctx);
    ctx.restore();
    glow(ctx, -1, -11, 16, gold, 0.3 * fl + rk * 0.3);
  }
  ctx.beginPath(); ctx.moveTo(-6, 2); ctx.bezierCurveTo(-7, -9, 7, -10, 8, -2); ctx.lineTo(8, 2); ctx.lineTo(5, 4); ctx.lineTo(5, 7); ctx.lineTo(-1, 7); ctx.lineTo(-2, 4); ctx.quadraticCurveTo(-6, 4, -6, 2); ctx.closePath();
  ink(ctx, sph(ctx, 'baskull', 1, -2, 8, bone), 1.5);
  if (!FL) {
    ctx.fillStyle = '#1a0e08'; ctx.beginPath(); ctx.ellipse(4, -1.5, 2.2, 2.4, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-0.8, -1.8, 1.5, 2, 0, 0, TAU); ctx.fill();
    eyeGlow(ctx, 4.2, -1.3, 1.1, gold, 1 + rk);
    eyeGlow(ctx, -0.6, -1.6, 0.8, gold, 0.7 + rk);
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(0, 4.5, 5, 0.8);
    ctx.strokeStyle = '#6a5a40'; ctx.lineWidth = 0.6; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0.5 + i * 1.3, 4); ctx.lineTo(0.5 + i * 1.3, 6.6); ctx.stroke(); }
  }
  ctx.restore();
  // 뼈 창 + 팔
  const la = aim || dive ? localAim + HP : raise ? 2.6 : 1.9 + Math.sin(t * 1.8) * 0.05;  // 창 방향 (각도 규칙)
  const armA = aim || dive ? 1.3 : raise ? 2.4 : 0.9;
  end(3, -24, armA, 11); const ex = EX, ey = EY; end(ex, ey, armA + 0.3, 10); const hx = EX, hy = EY;
  // 창
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-la);
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, 30); ctx.stroke();
  ctx.strokeStyle = C(bone); ctx.lineWidth = 2.2; ctx.stroke();
  if (!FL) { ctx.fillStyle = dk(bone, -0.15); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(0, -14 + i * 10, 1.8, 0, TAU); ctx.fill(); } }
  ctx.beginPath(); ctx.moveTo(-4, 28); ctx.lineTo(0, 46); ctx.lineTo(4, 28); ctx.lineTo(0, 31); ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'baspear', -4, 0, 4, 0, [0, '#fff8e0', 0.5, bone, 1, '#8a7a60']), 1.3);
  if (!FL && (aim || dive)) { glow(ctx, 0, 40, 14, gold, 0.6); if (aim) glint(ctx, 0, 44, 4 + 4 * Math.sin(t * 30), '#fff4c0', k01(at / 0.4)); }
  ctx.restore();
  limb(ctx, 3, -24, ex, ey, 2, 1.8, bone, { flat: false });
  limb(ctx, ex, ey, hx, hy, 1.8, 1.6, bone);
  // 앞 날개
  ctx.save(); ctx.translate(1, -18); ctx.rotate(-0.2); boneWing(ctx, 36, lift, bone, rag, t); ctx.restore();
  ctx.restore();
  if (raise && !FL) glint(ctx, 0, -86 + bob, 5 + 6 * rk, '#fff4c0', rk > 0.5 ? (rk - 0.5) * 2 : 0);
  FL = false;
};

// ── 죽음의 기사 ──
RENDER_B.death_knight = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const P = e.params ?? {};
  const pose = slashPose(e, P);
  const t = e.t;
  const K = {
    H: 96, steel: '#2c2a36', trim: '#8a9a6a', cape: '#1a1220', eye: '#7affa8', bladeGlow: '#6aff9a', soul: true, reach: 78,
    helm(c, tt) {
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-2 + s * 3, -7); c.bezierCurveTo(-4 + s * 5, -14, -10 + s * 2, -17, -12 + s, -22); c.bezierCurveTo(-7 + s * 2, -15, -2 + s * 4, -11, 2 + s * 3, -7); c.closePath(); c.fillStyle = s > 0 ? '#4a4652' : '#2a2632'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke(); }
    },
    shoulder(c, tt, shY) {
      c.fillStyle = '#3a3644'; c.strokeStyle = OUT; c.lineWidth = 1;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-6 + i * 5, shY - 2); c.lineTo(-5 + i * 5, shY - 9 - (i % 2) * 3); c.lineTo(-2 + i * 5, shY - 2); c.closePath(); c.fill(); c.stroke(); }
      addOn(c);
      for (let i = 0; i < 3; i++) { const u = (tt * 1.4 + i / 3) % 1; c.fillStyle = `rgba(90,255,150,${0.35 * (1 - u)})`; c.beginPath(); c.arc(-2 + Math.sin(tt * 4 + i) * 3, shY - 4 - u * 16, 2 + u * 3, 0, TAU); c.fill(); }
      addOff(c);
    },
    chest(c, tt, shY, hipY) {
      // 해골 문장
      const y = shY + 12;
      c.fillStyle = '#b8c0a0'; c.beginPath(); c.arc(1, y, 3.4, 0, TAU); c.fill(); c.fillRect(-1, y + 2, 4, 2.4);
      c.fillStyle = '#1a1a20'; c.beginPath(); c.arc(0, y, 0.9, 0, TAU); c.arc(2.4, y, 0.9, 0, TAU); c.fill();
      glow(c, 1, y, 8, '#6aff9a', 0.4 + 0.2 * Math.sin(tt * 3));
    },
    drawWeapon(c, hx, hy, a, tt) {
      greatsword(c, hx, hy, a, 54, 9, '#3a3a48', '#6aff9a', tt, { guardCol: '#5a5a68', guard: 9, pommel: '#6aff9a', deco(cc, L) { cc.fillStyle = '#8affb8'; for (let i = 0; i < 4; i++) { cc.fillRect(-0.6, 10 + i * 10, 1.2, 4); cc.fillRect(-2, 11.4 + i * 10, 4, 1.2); } } });
    },
  };
  drawKnight(ctx, e, K, pose);
  if (pose.wind && !FL) glint(ctx, 8, -90, 5 + 6 * pose.wind, '#b0ffd0', pose.wind > 0.5 ? (pose.wind - 0.5) * 2 : 0);
  FL = false;
};

// ── 저주받은 수녀 ──
RENDER_B.cursed_nun = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const habit = '#16121c', habitL = '#2a2432', coif = '#e8e4dc', skin = '#d8ccc8', hairC = '#1a1418';
  const pray = an === 'pray';
  const pk = pray ? k01(at / 0.3) : 0, rel = pray ? k01((at - (e.params?.pray ?? 0.9)) / 0.3) : 0;
  const bob = Math.sin(t * 2) * 2;
  ctx.save(); ctx.translate(0, bob);
  // 발밑 저주의 안개
  if (!FL) for (let i = 0; i < 4; i++) { const u = (t * 0.5 + i / 4) % 1; glow(ctx, -8 + i * 5 + Math.sin(t + i) * 3, -4 - u * 12, 8 + u * 6, '#6a2a9a', 0.35 * (1 - u)); }
  glow(ctx, 0, -40, 40, '#b060ff', 0.12 + pk * 0.25);
  // 수녀복 (긴 자락, 아래로 흐려짐)
  ctx.beginPath();
  ctx.moveTo(-7, -60);
  ctx.quadraticCurveTo(-13, -34, -14 + Math.sin(t * 2) * 1.5, -6);
  for (let i = 0; i < 5; i++) { const x = -14 + i * 6.6; ctx.lineTo(x + 3.3 + Math.sin(t * 3 + i) * 1.5, 0 + (i % 2) * 3); ctx.lineTo(x + 6.6, -6 + (i % 2) * 2); }
  ctx.quadraticCurveTo(12, -34, 8, -60);
  ctx.quadraticCurveTo(0, -63, -7, -60); ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'nunrobe', 0, -62, 0, 2, [0, habitL, 0.7, habit, 1, 'rgba(22,18,28,0.35)']), 1.8);
  if (!FL) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-5 + i * 5, -54); ctx.quadraticCurveTo(-6 + i * 5.5, -30, -8 + i * 6.5, -4); ctx.stroke(); }
    ctx.strokeStyle = mixCache(habitL, RIM, 0.5, 0); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-7.5, -59); ctx.quadraticCurveTo(-13.5, -34, -14, -7); ctx.stroke();
  }
  // 흰 옷깃
  ctx.beginPath(); ctx.moveTo(-8, -58); ctx.quadraticCurveTo(0, -62, 9, -58); ctx.lineTo(7, -50); ctx.quadraticCurveTo(0, -48, -6, -50); ctx.closePath();
  ink(ctx, vert(ctx, 'nuncol', -62, -48, coif, 0.1, -0.3), 1.4);
  // 머리 (베일 + 코이프 + 눈가리개)
  ctx.save(); ctx.translate(2, -68); ctx.rotate(pray ? (rel > 0 ? -0.45 * rel : 0.3 * pk) : 0.08 + Math.sin(t * 0.9) * 0.05);
  // 뒤 베일
  ctx.beginPath(); ctx.moveTo(-5, -9); ctx.quadraticCurveTo(-14, -6, -16 + Math.sin(t * 2) * 1.5, 18); ctx.lineTo(-6, 16); ctx.quadraticCurveTo(-3, 4, 4, -2); ctx.closePath();
  ink(ctx, vert(ctx, 'nunveil', -9, 18, habitL, 0.1, -0.4), 1.4);
  // 흘러내린 머리칼
  if (!FL) { ctx.strokeStyle = hairC; ctx.lineWidth = 1.2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-3 + i * 2, 4); ctx.quadraticCurveTo(-4 + i * 2 + Math.sin(t * 2 + i), 12, -5 + i * 2.5, 20 + i * 2); ctx.stroke(); } }
  femFace(ctx, skin, '#b060ff', t, { blind: true, lips: '#4a1a3a' });
  // 코이프 (흰 두건 테)
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.quadraticCurveTo(-6, -11, 1, -11); ctx.quadraticCurveTo(8, -11, 8, -5); ctx.lineTo(6, -5.5); ctx.quadraticCurveTo(1, -9, -4, -4); ctx.closePath();
  ink(ctx, C(coif), 1.2);
  ctx.beginPath(); ctx.moveTo(-7, -5); ctx.quadraticCurveTo(-7, -13, 1, -13); ctx.quadraticCurveTo(9, -13, 9, -6); ctx.lineTo(8, -6); ctx.quadraticCurveTo(7, -11, 1, -11); ctx.quadraticCurveTo(-5, -11, -6, -4); ctx.closePath();
  ink(ctx, C(habit), 1.2);
  ctx.restore();
  // 기도하는 두 손 (뒤집힌 묵주 십자가)
  const ha = pray ? (rel > 0 ? lerp(1.4, 2.6, rel) : lerp(0.9, 1.4, pk)) : 0.9 + Math.sin(t * 1.2) * 0.05;
  for (const near of [false, true]) {
    const sx = near ? 5 : -5, sy = -56;
    end(sx, sy, ha - (near ? 0 : 0.25), 11); const ex = EX, ey = EY; end(ex, ey, ha + (rel > 0 ? 0.2 : 1.2), 9);
    softLimb(ctx, sx, sy, ex, ey, EX, EY, 3.2, 2.6, near ? habitL : habit, near);
    ctx.fillStyle = C(skin); ctx.beginPath(); ctx.arc(EX, EY, 2.2, 0, TAU); ctx.fill();
    if (near && !FL) {
      // 묵주 + 거꾸로 된 십자가
      ctx.strokeStyle = '#8a7a8a'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(EX, EY); ctx.quadraticCurveTo(EX - 2, EY + 6, EX, EY + 9); ctx.stroke();
      ctx.fillStyle = '#c8b0d8'; ctx.fillRect(EX - 0.7, EY + 9, 1.4, 7); ctx.fillRect(EX - 2.4, EY + 12.6, 4.8, 1.3);
      glow(ctx, EX, EY + 12, 8 + pk * 8, '#b060ff', 0.4 + pk * 0.5);
    }
  }
  ctx.restore();
  if (pray && !FL && rel <= 0) glint(ctx, 8, -54 + bob, 4 + 5 * pk, '#e0b0ff', pk);
  FL = false;
};

// ── s11 투사체 / 장판 ──
PROJ_B.heart = (ctx, p) => {
  const s = 1 + Math.sin(p.t * 14) * 0.12;
  glow(ctx, 0, 0, 20, '#ff3a7a', 0.7);
  ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 7); ctx.bezierCurveTo(-9, 0, -7, -8, 0, -4); ctx.bezierCurveTo(7, -8, 9, 0, 0, 7); ctx.closePath();
  ctx.fillStyle = radG(ctx, 'pheart', -2, -3, 0.5, 0, 0, 9, [0, '#ffe0ea', 0.4, '#ff4a8a', 1, '#a0103a']); ctx.fill();
  ctx.strokeStyle = 'rgba(80,0,20,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(-3, -3, 1.6, 1, -0.6, 0, TAU); ctx.fill();
};
PROJ_B.bonefeather = (ctx, p) => {
  const a = Math.atan2(p.vy, p.vx);
  ctx.rotate(a);
  addOn(ctx); ctx.strokeStyle = 'rgba(255,240,200,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-8, 0); ctx.stroke(); addOff(ctx);
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.quadraticCurveTo(0, -5, -10, -2.5); ctx.lineTo(-8, 0); ctx.lineTo(-10, 2.5); ctx.quadraticCurveTo(0, 5, 12, 0); ctx.closePath();
  ctx.fillStyle = linG(ctx, 'pbf', -10, 0, 12, 0, [0, '#8a7a60', 0.5, '#e8dcc0', 1, '#ffffff']); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
  glow(ctx, 8, 0, 8, '#fff2b0', 0.4);
};
PROJ_B.cross = (ctx, p) => {
  ctx.rotate(PI + Math.sin(p.t * 4) * 0.15 + (p.behavior === 'orbit' ? 0 : p.t * 6));
  glow(ctx, 0, 0, 18, '#b060ff', 0.7);
  ctx.beginPath(); ctx.rect(-2, -10, 4, 20); ctx.rect(-6.5, -5, 13, 3.6);
  ctx.fillStyle = linG(ctx, 'pcross', -6, -10, 6, 10, [0, '#f0d8ff', 0.5, '#b070e8', 1, '#4a1a7a']); ctx.fill();
  ctx.strokeStyle = 'rgba(30,0,50,0.9)'; ctx.lineWidth = 1; ctx.stroke();
};
PROJ_B.soulwave = (ctx, p) => {
  const d = Math.sign(p.vx) || 1;
  ctx.scale(d, 1);
  const H = p.h, k = p.maxLife ? k01(p.life / 0.3) : 1, t = p.t;
  ctx.globalAlpha *= k;
  addOn(ctx);
  for (let i = 0; i < 3; i++) {
    const h = H * (1 - i * 0.22) * (0.9 + 0.1 * Math.sin(t * 25 + i)), x = -i * 10;
    const g = linG(ctx, 'psw' + i, 0, H / 2 - h, 0, H / 2, [0, 'rgba(200,255,220,0)', 0.3, 'rgba(120,255,170,0.8)', 1, 'rgba(20,120,60,0.3)']);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - 10, H / 2); ctx.quadraticCurveTo(x - 8, H / 2 - h * 0.6, x + Math.sin(t * 18 + i) * 3, H / 2 - h); ctx.quadraticCurveTo(x + 6, H / 2 - h * 0.5, x + 10, H / 2); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(220,255,230,0.9)'; ctx.beginPath(); ctx.ellipse(2, H / 2 - H * 0.35, 3, 7, 0, 0, TAU); ctx.fill();
  addOff(ctx);
};
ZONE_B.bloodspear = (ctx, z) => {
  const cx = z.cx, by = z.bottom, t = z.t;
  ctx.save();
  if (!z.active) {
    const k = z.warnK;
    ctx.fillStyle = `rgba(120,0,16,${0.5 + 0.4 * k})`; ctx.beginPath(); ctx.ellipse(cx, by - 1, 8 + 14 * k, 3 + 1.5 * k, 0, 0, TAU); ctx.fill();
    addOn(ctx);
    ctx.strokeStyle = `rgba(255,50,70,${0.3 + 0.6 * k})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(cx, by - 1, 10 + 14 * k, 3.5 + 1.5 * k, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) { const u = (t * 2 + i / 3) % 1; ctx.fillStyle = `rgba(255,60,80,${0.6 * (1 - u) * k})`; ctx.beginPath(); ctx.arc(cx + (h1(i) - 0.5) * 20, by - 2 - u * 10, 1.5, 0, TAU); ctx.fill(); }
    addOff(ctx);
    ctx.restore(); return;
  }
  const up = ease.outBack(k01(z.liveK * 5)), fade = k01(z.life / 0.12);
  const H = z.h * up;
  ctx.globalAlpha = fade;
  glow(ctx, cx, by - H * 0.5, H * 0.55, '#ff1a3a', 0.45);
  ctx.beginPath(); ctx.moveTo(cx - 9, by); ctx.quadraticCurveTo(cx - 5, by - H * 0.5, cx - 1, by - H + 6); ctx.lineTo(cx, by - H); ctx.lineTo(cx + 1.5, by - H + 6); ctx.quadraticCurveTo(cx + 5, by - H * 0.5, cx + 9, by); ctx.closePath();
  const g = ctx.createLinearGradient(cx - 9, 0, cx + 9, 0);
  g.addColorStop(0, '#5a0010'); g.addColorStop(0.45, '#ff4a5a'); g.addColorStop(0.6, '#c80a24'); g.addColorStop(1, '#4a0010');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#1a0004'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = '#8a0a1a'; ctx.beginPath(); ctx.ellipse(cx, by - 2, 16, 4, 0, 0, TAU); ctx.fill();
  ctx.restore();
};

// ═════════════════════════ s12 드라큘라의 왕좌 ═════════════════════════
// ── 흡혈 신부 ──
RENDER_B.vampire_bride = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const skin = '#ece4ea', dress = '#e8e4ec', veil = '#f4f0f8', hair = '#141018', blood = '#b0101e';
  const scream = an === 'scream', gather = an === 'gather', mist = an === 'mist', claw = an === 'claw';
  const sk = scream ? k01(at / 0.6) : 0, gk = gather ? k01(at / 0.45) : 0;
  const bob = Math.sin(t * 1.4) * 4;
  const ga = ctx.globalAlpha;
  ctx.save(); ctx.translate(gather ? Math.sin(t * 50) * gk : 0, bob);
  glow(ctx, 0, -44, 40, '#ff2a4a', 0.12 + sk * 0.3 + gk * 0.3);
  if (mist) {
    // 붉은 안개 형체
    if (!FL) {
      addOn(ctx);
      for (let i = 0; i < 9; i++) {
        const u = h1(i), y = -76 + i * 8, w = 10 + Math.sin(i * 0.9) * 4;
        ctx.fillStyle = `rgba(200,20,50,${0.22 + 0.1 * Math.sin(t * 8 + i)})`;
        ctx.beginPath(); ctx.ellipse(-6 - i * 1.5 + Math.sin(t * 6 + i) * 3, y, w + u * 6, 6, 0, 0, TAU); ctx.fill();
      }
      addOff(ctx);
      eyeGlow(ctx, 5, -68, 1.3, '#ff3a4a', 1.4);
      eyeGlow(ctx, 1, -68.5, 1, '#ff3a4a', 1);
    }
    ctx.restore(); FL = false; return;
  }
  // 뒤로 끌리는 면사포
  const vw = gather ? 1.4 : scream ? 1.2 : 1;
  ctx.beginPath(); ctx.moveTo(-2, -80);
  for (let k = 1; k <= 7; k++) { const u = k / 7; ctx.lineTo(-6 - u * 30 * vw + Math.sin(t * 2.2 - u * 3) * u * 5, -78 + u * 64 + Math.sin(t * 3 - u * 4) * 3 * u); }
  for (let k = 7; k >= 1; k--) { const u = k / 7; ctx.lineTo(-6 - u * 30 * vw + 14 * (1 - u * 0.4) + Math.sin(t * 2.2 - u * 3 + 0.4) * u * 5 + (k % 2) * 3, -76 + u * 64 + Math.sin(t * 3 - u * 4 + 0.4) * 3 * u); }
  ctx.closePath();
  ctx.globalAlpha = ga * (FL ? 1 : 0.55);
  ink(ctx, C(veil), 1.2);
  ctx.globalAlpha = ga;
  // 뒤 머리칼
  ctx.save(); ctx.translate(2, -74); longHair(ctx, 36, 10, hair, t, 1.1, 'vb'); ctx.restore();
  // 드레스 (찢어진 자락이 떠다님)
  ctx.beginPath();
  ctx.moveTo(-6, -64);
  ctx.quadraticCurveTo(-8, -54, -5, -46);
  ctx.quadraticCurveTo(-15, -30, -17 + Math.sin(t * 2) * 2, -12);
  for (let i = 0; i < 6; i++) { const x = -17 + i * 6.4; ctx.lineTo(x + 3.2 + Math.sin(t * 3 + i) * 2, -2 + (i % 2) * 7 + Math.sin(t * 2.4 + i) * 2); ctx.lineTo(x + 6.4, -10 + (i % 3) * 3); }
  ctx.quadraticCurveTo(12, -30, 5, -46);
  ctx.quadraticCurveTo(8, -54, 6, -64);
  ctx.quadraticCurveTo(0, -67, -6, -64); ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'vbdress', 0, -66, 0, 0, [0, '#ffffff', 0.4, dress, 0.85, '#9a90a8', 1, 'rgba(120,110,140,0.4)']), 1.6);
  if (!FL) {
    // 주름 + 핏자국 + 레이스
    ctx.strokeStyle = 'rgba(90,80,110,0.45)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-3 + i * 3, -44); ctx.quadraticCurveTo(-7 + i * 6, -26, -12 + i * 9 + Math.sin(t * 2 + i) * 2, -6); ctx.stroke(); }
    ctx.fillStyle = blood; ctx.beginPath(); ctx.ellipse(2, -56, 3, 2, 0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1, -55); ctx.quadraticCurveTo(2, -48, 0.5, -42); ctx.lineTo(2, -42); ctx.quadraticCurveTo(3, -49, 3.5, -55); ctx.fill();
    ctx.strokeStyle = '#c8c0d0'; ctx.lineWidth = 0.8;
    ctx.beginPath(); for (let i = 0; i < 6; i++) ctx.arc(-5 + i * 2, -46, 1, 0, PI); ctx.stroke();
    ctx.strokeStyle = mixCache(dress, RIM, 0.5, 0); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-5.5, -46); ctx.quadraticCurveTo(-15, -30, -17, -13); ctx.stroke();
  }
  // 팔
  const armOf = (near) => {
    if (scream) return near ? [lerp(0.6, 2.2, sk), -0.3] : [lerp(0.4, 2.5, sk), -0.2];
    if (gather) return near ? [0.3, 2.4] : [0.6, 2.2];
    if (claw) { const k = ease.outExpo(k01((at - 0.2) / 0.1)); return near ? [lerp(2.6, 1.2, k), lerp(0.2, 0.3, k)] : [0.5, 0.8]; }
    return near ? [0.5 + Math.sin(t * 1.3) * 0.1, 0.7] : [0.3, 0.9];
  };
  for (const near of [false, true]) {
    const sx = near ? 4 : -4, sy = -62;
    const [a1, a2] = armOf(near);
    end(sx, sy, a1, 12); const ex = EX, ey = EY; end(ex, ey, a1 + a2, 11);
    softLimb(ctx, sx, sy, ex, ey, EX, EY, 2.4, 1.8, near ? skin : dk(skin, -0.25), near);
    claws(ctx, EX, EY, '#f0e8f0', claw || scream ? 1.2 : 0.3, 5);
    if (!near && !FL && !scream && !gather) {
      // 시든 검은 장미 부케
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i === 1 ? '#3a0a14' : '#1a0a10'; ctx.beginPath(); ctx.arc(EX - 2 + i * 2.4, EY + 1 - (i % 2) * 2, 2.2, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = '#2a3a1a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(EX, EY + 2); ctx.lineTo(EX - 1, EY + 9); ctx.stroke();
    }
    if (near && claw && !FL) { const k = k01((at - 0.2) / 0.25); if (k > 0 && k < 1) swingTrail(ctx, sx, sy, 2.8, lerp(2.8, 1.1, ease.outExpo(k)), 26, 10, '#ff4a6a', 1 - k); }
  }
  // 머리
  ctx.save(); ctx.translate(2, -72); ctx.rotate(scream ? -0.35 * sk : gather ? 0.2 : Math.sin(t * 0.8) * 0.05);
  femFace(ctx, skin, '#ff2a3a', t, { lips: '#7a0a18', mouth: scream && sk > 0.4, fangs: true, eyeK: 1.3 + sk });
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.quadraticCurveTo(-2, -12, 6, -7); ctx.quadraticCurveTo(1, -7, -1, -4); ctx.quadraticCurveTo(-3, 1, -6, 5); ctx.closePath();
  ctx.fillStyle = C(hair); ctx.fill();
  if (!FL) {
    // 입가의 피
    ctx.strokeStyle = blood; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(5.4, 4.4); ctx.quadraticCurveTo(5.8, 6, 5.2, 7.4); ctx.stroke();
    // 면사포 머리 장식 (은관)
    ctx.strokeStyle = '#d8d0e0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, -3, 8, PI * 1.05, PI * 1.7); ctx.stroke();
    ctx.fillStyle = '#ff2a4a'; ctx.beginPath(); ctx.arc(-3, -10.5, 1.2, 0, TAU); ctx.fill();
    if (scream && sk > 0.5) { addOn(ctx); ctx.strokeStyle = `rgba(255,60,90,${(sk - 0.5) * 1.6})`; ctx.lineWidth = 1.5; for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(8, 4, i * 5 + (t * 40) % 5, -0.6, 0.6); ctx.stroke(); } addOff(ctx); }
  }
  ctx.restore();
  ctx.restore();
  if (gather && !FL) glint(ctx, 6, -60 + bob, 4 + 6 * gk, '#ff8aa0', gk > 0.4 ? (gk - 0.4) * 1.7 : 0);
  FL = false;
};

// ── 마족 영주 ──
RENDER_B.demon_lord = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const skin = '#4a2228', skinD = '#241014', armor = '#24202c', gold = '#d8aa48', crack = '#ff7a2a', capeC = '#1e0a14';
  const walk = an === 'walk', swing = an === 'swing', fb = an === 'fireball', hf = an === 'hellfire';
  const wu = e.params?.windup ?? 0.6;
  const ph = t * 5;
  let bob = 0, lean = 0.04, blade = 2.0, armA = 0.6, armA2 = 0.5, farA = 0.3, farA2 = 0.4, wind = 0, trail = null, heat = 0.5 + 0.2 * Math.sin(t * 3);
  if (walk) { bob = Math.abs(Math.sin(ph)) * 2.5; farA = 0.3 - Math.sin(ph) * 0.3; }
  if (swing) {
    if (at < wu) { wind = ease.outCubic(k01(at / wu)); blade = lerp(2.0, 3.8, wind); armA = lerp(0.6, 2.9, wind); armA2 = lerp(0.5, 0.5, wind); lean = -0.12 * wind; }
    else { const k = ease.outExpo(k01((at - wu) / 0.1)); blade = lerp(3.8, 0.8, k); armA = lerp(2.9, 1.0, k); armA2 = 0.3; lean = 0.3 * k; const f = 1 - k01((at - wu - 0.1) / 0.25); if (f > 0) trail = [3.8, blade, f]; }
    heat = 0.8;
  }
  if (fb) { const k = ease.outCubic(k01(at / 0.55)); farA = lerp(0.3, 1.5, k); farA2 = lerp(0.4, 0.1, k); wind = at < 0.55 ? k : 0; heat = 0.6 + k * 0.4; }
  if (hf) { const k = ease.outCubic(k01(at / 0.5)); farA = lerp(0.3, 3.0, k); farA2 = lerp(0.4, -0.2, k); wind = at < 0.5 ? k : 0; heat = 0.6 + k * 0.4; }
  if (hurtOf(e)) lean -= 0.1;
  shadow(ctx, 30, 0.5);
  const hipY = -44 + bob;
  // 역관절 다리 + 발굽
  const leg = (x, p, near) => {
    const s = walk ? Math.sin(ph + p) : 0;
    const col = near ? skin : skinD;
    end(x, hipY, 0.4 + s * 0.4, 18); const kx = EX, ky = EY;
    end(kx, ky, -0.5 + s * 0.2, 16); const ax = EX, ay = EY;
    const fx = ax + 2, fy = walk ? -Math.max(0, -Math.cos(ph + p)) * 5 : 0;
    softLimb(ctx, x, hipY, kx, ky, ax, ay, 7.5, 5.5, col, near);
    softLimb(ctx, ax, ay, ax + 1, (ay + fy) / 2, fx, fy - 3, 4.5, 3.5, col, near);
    ctx.beginPath(); ctx.moveTo(fx - 5, fy); ctx.lineTo(fx - 3, fy - 6); ctx.lineTo(fx + 5, fy - 6); ctx.lineTo(fx + 7, fy); ctx.closePath(); ink(ctx, C('#1a1014'), 1.4);
    // 무릎 갑주
    ctx.beginPath(); ctx.moveTo(kx - 5, ky - 4); ctx.lineTo(kx + 7, ky - 2); ctx.lineTo(kx + 3, ky + 6); ctx.closePath(); ink(ctx, C(near ? armor : dk(armor, -0.3)), 1.3);
  };
  leg(-10, PI, false);
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY);
  const shY = hipY - 40;
  // 접힌 날개 (뒤)
  ctx.save(); ctx.translate(-12, shY + 6); ctx.scale(-1, 1); ctx.rotate(-1.0 + Math.sin(t * 1.2) * 0.05); batWing(ctx, 40, 0.6, '#3a0a14', '#1a0608', 0.5); ctx.restore();
  // 망토
  ctx.beginPath(); ctx.moveTo(-14, shY + 2);
  ctx.quadraticCurveTo(-26, shY + 36, -26 + Math.sin(t * 2) * 2, hipY + 38);
  for (let i = 0; i < 5; i++) ctx.lineTo(-22 + i * 5 + Math.sin(t * 2 + i) * 1.5, hipY + 42 - (i % 2) * 6);
  ctx.lineTo(-4, hipY + 30); ctx.quadraticCurveTo(-6, shY + 20, 4, shY); ctx.closePath();
  ink(ctx, vert(ctx, 'dlcape', shY, hipY + 42, capeC, 0.1, -0.5), 1.8);
  if (!FL) { ctx.strokeStyle = gold; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-26, hipY + 36); ctx.lineTo(-4, hipY + 30); ctx.stroke(); }
  // 먼 팔 (마법 손)
  end(-10, shY + 6, farA, 18); let ex = EX, ey = EY; end(ex, ey, farA + farA2, 16);
  softLimb(ctx, -10, shY + 6, ex, ey, EX, EY, 6, 5, skinD, false);
  claws(ctx, EX, EY, '#e8d0b0', fb || hf ? 1 : 0.3, 5);
  if ((fb || hf) && !FL) { glow(ctx, EX + 3, EY, 12 + wind * 16, '#ff7a2a', 0.5 + wind * 0.5); glow(ctx, EX + 3, EY, 6 + wind * 5, '#fff0a0', wind); if (wind > 0.5) glint(ctx, EX + 4, EY, 4 + 6 * wind, '#ffd080', (wind - 0.5) * 2); }
  // 몸통 (근육 + 흉갑)
  ctx.beginPath();
  ctx.moveTo(-16, shY); ctx.quadraticCurveTo(0, shY - 8, 18, shY + 1);
  ctx.quadraticCurveTo(20, shY + 20, 12, hipY - 2); ctx.lineTo(12, hipY + 8); ctx.lineTo(-12, hipY + 8); ctx.lineTo(-12, hipY - 2);
  ctx.quadraticCurveTo(-20, shY + 18, -16, shY); ctx.closePath();
  ink(ctx, cyl(ctx, 'dlbody', -19, 20, skin), 2.2);
  if (!FL) {
    // 용암 균열
    addOn(ctx);
    ctx.strokeStyle = `rgba(255,${120 + heat * 80},40,${0.5 + heat * 0.4})`; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-8, shY + 6); ctx.lineTo(-4, shY + 14); ctx.lineTo(-9, shY + 22); ctx.moveTo(-4, shY + 14); ctx.lineTo(2, shY + 18); ctx.moveTo(8, shY + 24); ctx.lineTo(4, shY + 30); ctx.lineTo(8, hipY - 4); ctx.stroke();
    addOff(ctx);
    glow(ctx, 0, shY + 18, 22, crack, 0.2 + heat * 0.25);
    // 흉갑판 + 금 테
    ctx.fillStyle = armor; ctx.beginPath(); ctx.moveTo(-2, shY + 2); ctx.lineTo(16, shY + 3); ctx.quadraticCurveTo(17, shY + 18, 11, shY + 26); ctx.lineTo(-1, shY + 24); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = gold; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.moveTo(7, shY + 9); ctx.lineTo(10, shY + 14); ctx.lineTo(7, shY + 19); ctx.lineTo(4, shY + 14); ctx.closePath(); ctx.fill();
    glow(ctx, 7, shY + 14, 8, '#ff7a2a', 0.8);
    // 허리 갑주
    ctx.fillStyle = armor; ctx.fillRect(-12, hipY - 3, 24, 11); ctx.strokeStyle = gold; ctx.strokeRect(-12, hipY - 3, 24, 11);
    ctx.strokeStyle = mixCache(skin, RIM, 0.55, 0); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-16.5, shY + 1); ctx.quadraticCurveTo(-20.5, shY + 18, -12.5, hipY - 2); ctx.stroke();
  }
  // 머리 (숫양 뿔)
  ctx.save(); ctx.translate(6, shY - 8);
  ctx.beginPath(); ctx.moveTo(-7, 6); ctx.quadraticCurveTo(-9, -8, 1, -9); ctx.quadraticCurveTo(10, -8, 10, 0); ctx.lineTo(9, 7); ctx.quadraticCurveTo(2, 10, -7, 6); ctx.closePath();
  ink(ctx, sph(ctx, 'dlhead', 1, -1, 10, skin), 1.8);
  for (const [x, c, s] of [[-5, '#3a2a24', 0.85], [0, '#5a4434', 1]]) {
    ctx.save(); ctx.translate(x, -6); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.bezierCurveTo(-8, -12, -20, -10, -18, 2); ctx.bezierCurveTo(-16, 8, -10, 6, -10, 2); ctx.bezierCurveTo(-12, -4, -6, -6, 3, -1); ctx.closePath();
    ink(ctx, linG(ctx, 'dlhorn' + x, -18, -10, 0, 0, [0, '#e8d8c0', 0.5, c, 1, '#1a1010']), 1.4);
    if (!FL) { ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.8; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-9, -2, 4 + i * 1.8, -2.6, -0.6); ctx.stroke(); } }
    ctx.restore();
  }
  if (!FL) {
    ctx.fillStyle = '#1a0404'; ctx.beginPath(); ctx.moveTo(1, -3); ctx.lineTo(10, -3); ctx.lineTo(9, 0); ctx.lineTo(2, 0); ctx.closePath(); ctx.fill();
    eyeGlow(ctx, 7, -1.5, 1.5, '#ffb030', 1.2 + wind);
    eyeGlow(ctx, 2.8, -1.6, 1.1, '#ffb030', 0.8 + wind);
    ctx.fillStyle = '#1a0404'; ctx.beginPath(); ctx.moveTo(3, 4); ctx.lineTo(10, 3); ctx.lineTo(9, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0e0c0'; ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(4.6, 6.4); ctx.lineTo(5.2, 4); ctx.moveTo(8, 3.6); ctx.lineTo(8.5, 5.8); ctx.lineTo(9, 3.6); ctx.fill();
  }
  ctx.restore();
  // 견갑 (가시)
  ctx.beginPath(); ctx.ellipse(2, shY + 3, 11, 7, -0.15, PI, TAU); ctx.lineTo(13, shY + 5); ctx.closePath();
  ink(ctx, sph(ctx, 'dlpaul', 2, shY, 11, armor), 1.6);
  if (!FL) { ctx.fillStyle = '#3a3440'; ctx.strokeStyle = OUT; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-6 + i * 6, shY - 3); ctx.lineTo(-7 + i * 6, shY - 12 - (i === 1 ? 4 : 0)); ctx.lineTo(-2 + i * 6, shY - 3); ctx.closePath(); ctx.fill(); ctx.stroke(); } ctx.strokeStyle = gold; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(2, shY + 3, 10, 6, -0.15, PI * 1.05, PI * 1.95); ctx.stroke(); }
  // 불타는 대검 + 가까운 팔
  end(10, shY + 6, armA, 17); ex = EX; ey = EY; end(ex, ey, armA + armA2, 15); const hx = EX, hy = EY;
  if (trail) swingTrail(ctx, 10, shY + 6, trail[0], trail[1], 84, 26, '#ff7a2a', trail[2] * 0.8);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-blade);
  ctx.fillStyle = C('#1a1010'); ctx.fillRect(-2, -12, 4, 13);
  ctx.beginPath(); ctx.moveTo(-5, 3);
  for (let i = 0; i < 5; i++) { ctx.lineTo(-5.5 - (i % 2) * 2.5, 10 + i * 10); }
  ctx.lineTo(0, 64); ctx.lineTo(5.5, 50);
  for (let i = 4; i >= 0; i--) { ctx.lineTo(5 + (i % 2) * 2.5, 10 + i * 10); }
  ctx.lineTo(5, 3); ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'dlblade', -6, 0, 6, 0, [0, '#5a1a10', 0.45, '#2a1418', 0.55, '#1a0c10', 1, '#4a1008']), 1.8);
  if (!FL) {
    addOn(ctx);
    ctx.strokeStyle = `rgba(255,150,50,${0.6 + heat * 0.3})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 58); ctx.stroke();
    for (let i = 0; i < 5; i++) { const u = (t * 2 + i / 5) % 1; ctx.fillStyle = `rgba(255,${140 + i * 20},40,${0.55 * (1 - u)})`; ctx.beginPath(); ctx.arc(Math.sin(t * 7 + i) * 3 - u * 6, 12 + i * 10 - u * 8, 3 + u * 3, 0, TAU); ctx.fill(); }
    addOff(ctx);
    glow(ctx, 0, 34, 34, '#ff5a1a', 0.3 + heat * 0.2);
  }
  ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, 5, 10, 0); ctx.lineTo(8, 4); ctx.lineTo(-8, 4); ctx.closePath(); ink(ctx, C(gold), 1.3);
  ctx.restore();
  softLimb(ctx, 10, shY + 6, ex, ey, hx, hy, 6.5, 5.5, skin, true);
  ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, TAU); ink(ctx, C(skinD), 1.3);
  ctx.restore();
  leg(10, 0, true);
  if (swing && at < wu && !FL) glint(ctx, 0, -120, 6 + 6 * wind, '#ffd080', wind > 0.5 ? (wind - 0.5) * 2 : 0);
  FL = false;
};

// ── 박쥐 떼 ──
const SWARM_N = 16;
RENDER_B.bat_swarm = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const maxHp = e.stats?.maxHp ?? e.hp ?? 1;
  const n = Math.max(3, Math.min(SWARM_N, Math.ceil((e.params?.count ?? 14) * clamp((e.hp ?? maxHp) / maxHp, 0, 1))));
  const gather = an === 'gather', charge = an === 'charge';
  const gk = gather ? ease.outCubic(k01(at / 0.5)) : 0;
  const cy = -e.def.size.h / 2;
  glow(ctx, 0, cy, 44, '#8a0a2a', 0.25 + gk * 0.3);
  if (!FL) { ctx.fillStyle = 'rgba(10,0,8,0.35)'; ctx.beginPath(); ctx.ellipse(0, cy, 26 * (1 - gk * 0.4), 16 * (1 - gk * 0.4), 0, 0, TAU); ctx.fill(); }
  for (let i = 0; i < n; i++) {
    const s = h1(i * 7.3), s2 = h1(i * 3.1 + 2);
    const sp = 1.6 + s * 1.8, a = t * sp * (i % 2 ? 1 : -1) + s2 * TAU;
    let rx = 34 * (0.4 + s * 0.6), ry = 21 * (0.4 + s2 * 0.6);
    if (gather) { rx *= 1 - gk * 0.6; ry *= 1 - gk * 0.6; }
    let x = Math.cos(a) * rx, y = cy + Math.sin(a * 1.3) * ry;
    if (charge) { x = (s - 0.5) * 70 - ((t * 8 + s * 5) % 1) * 6; y = cy + (s2 - 0.5) * 26 + Math.sin(t * 10 + i) * 3; }
    const flap = Math.sin(t * (18 + s * 8) + i);
    const sc = 0.85 + s2 * 0.4;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    if (charge || Math.cos(a) * (i % 2 ? 1 : -1) < 0 && !gather) ctx.scale(charge ? 1 : -1, 1);
    // 날개
    ctx.fillStyle = C(i % 3 ? '#4a1a34' : '#5a2240'); ctx.strokeStyle = C(OUT); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-2, -1); ctx.quadraticCurveTo(-8, -6 - flap * 6, -14, -2 - flap * 7); ctx.lineTo(-11, 0 - flap * 3); ctx.lineTo(-8, 2 - flap * 2); ctx.lineTo(-5, 1); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2, -1); ctx.quadraticCurveTo(8, -6 - flap * 6, 14, -2 - flap * 7); ctx.lineTo(11, 0 - flap * 3); ctx.lineTo(8, 2 - flap * 2); ctx.lineTo(5, 1); ctx.closePath(); ctx.stroke(); ctx.fill();
    if (!FL) { ctx.strokeStyle = 'rgba(190,160,255,0.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-3, -1.5); ctx.quadraticCurveTo(-8, -6.5 - flap * 6, -13.5, -2.5 - flap * 7); ctx.moveTo(3, -1.5); ctx.quadraticCurveTo(8, -6.5 - flap * 6, 13.5, -2.5 - flap * 7); ctx.stroke(); }
    // 몸
    ctx.fillStyle = C('#1a0c14'); ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 4, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2.4, -3); ctx.lineTo(-2, -6.5); ctx.lineTo(-0.6, -3.6); ctx.moveTo(2.4, -3); ctx.lineTo(2, -6.5); ctx.lineTo(0.6, -3.6); ctx.fill();
    if (!FL) {
      ctx.strokeStyle = 'rgba(170,180,255,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(0, 0, 3.6, PI * 0.8, PI * 1.4); ctx.stroke();
      ctx.fillStyle = gather ? '#ffe0e0' : '#ff2a3a'; ctx.beginPath(); ctx.arc(1.3, -1, 0.9, 0, TAU); ctx.arc(-0.9, -1, 0.7, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  if (gather && !FL) { glow(ctx, 0, cy, 20, '#ff3a5a', gk * 0.6); glint(ctx, 10, cy - 4, 4 + 6 * gk, '#ff9aa8', gk > 0.5 ? (gk - 0.5) * 2 : 0); }
  if (charge && !FL) { addOn(ctx); ctx.strokeStyle = 'rgba(255,80,110,0.25)'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const y = cy - 14 + i * 9, x0 = -36 - ((t * 400 + i * 37) % 30); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - 20, y); ctx.stroke(); } addOff(ctx); }
  FL = false;
};

// ── 근위 갑옷 ──
function halberd(ctx, hx, hy, a, t, gold) {
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-a);
  // 자루 (손 뒤로 22, 앞으로 50)
  ctx.lineCap = 'butt';
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, 54); ctx.stroke();
  ctx.strokeStyle = C('#4a2a1a'); ctx.lineWidth = 2.6; ctx.stroke();
  if (!FL) { ctx.strokeStyle = gold; ctx.lineWidth = 2.8; for (const y of [-20, 10, 40]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(0, y + 2.5); ctx.stroke(); } }
  // 도끼날 + 창끝 + 갈고리
  ctx.beginPath(); ctx.moveTo(-1.5, 44); ctx.quadraticCurveTo(-14, 42, -16, 52); ctx.quadraticCurveTo(-14, 60, -1.5, 58); ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'rgaxe', -16, 0, 0, 0, [0, '#ffffff', 0.3, '#c8ccd8', 1, '#5a5a68']), 1.4);
  ctx.beginPath(); ctx.moveTo(1.5, 46); ctx.lineTo(9, 50); ctx.lineTo(1.5, 53); ctx.closePath(); ink(ctx, C('#9a9aa8'), 1.2);
  ctx.beginPath(); ctx.moveTo(-2.4, 57); ctx.lineTo(0, 74); ctx.lineTo(2.4, 57); ctx.closePath(); ink(ctx, FL ? WHITE : linG(ctx, 'rgtip', -2, 0, 2, 0, [0, '#ffffff', 1, '#7a7a88']), 1.2);
  if (!FL) { ctx.fillStyle = '#a8101e'; ctx.beginPath(); ctx.moveTo(-1.5, 40); ctx.quadraticCurveTo(-6 + Math.sin(t * 4) * 1.5, 34, -4, 28); ctx.quadraticCurveTo(0, 34, 1.5, 40); ctx.fill(); }
  ctx.restore();
}
RENDER_B.royal_guard = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const gold = '#e0b040';
  const pose = { arm: 0.9, arm2: 0.3, farArm: 0.5, farArm2: 0.6, lean: 0, blade: 2.9 };
  if (an === 'idle') { pose.blade = PI + 0.05; pose.arm = 0.7; pose.arm2 = 0.9; }
  if (an === 'walk') { pose.blade = PI + 0.1 + Math.sin(t * 6) * 0.05; pose.arm = 0.7; pose.arm2 = 0.9; }
  let wind = 0;
  if (an === 'sweep') {
    const wu = 0.62;
    if (at < wu) { wind = ease.outCubic(k01(at / wu)); pose.blade = lerp(2.9, 3.9, wind); pose.arm = lerp(0.9, 2.6, wind); pose.arm2 = 0.3; pose.lean = -0.1 * wind; }
    else { const k = ease.outExpo(k01((at - wu) / 0.12)); pose.blade = lerp(3.9, 0.9, k); pose.arm = lerp(2.6, 1.1, k); pose.arm2 = 0.3; pose.lean = 0.2 * k; pose.legSpread = true; const f = 1 - k01((at - wu - 0.12) / 0.25); if (f > 0) pose.trail = [3.9, pose.blade, f]; }
  }
  if (an === 'thrust') {
    const wu = 0.52, hi = e.high !== false;
    const tgt = hi ? 1.42 : 1.9;
    if (at < wu) { wind = ease.outCubic(k01(at / wu)); pose.blade = lerp(2.4, tgt, wind); pose.arm = lerp(0.9, 0.1, wind); pose.arm2 = lerp(0.3, 1.2, wind); pose.lean = -0.08 * wind; }
    else { const k = ease.outExpo(k01((at - wu) / 0.08)); const back = k01((at - wu - 0.3) / 0.2); pose.blade = tgt; pose.arm = lerp(0.1, 1.45, k * (1 - back)); pose.arm2 = lerp(1.2, 0.1, k * (1 - back)); pose.lean = 0.18 * k * (1 - back); pose.legSpread = true; }
  }
  pose.farArm = 1.0; pose.farArm2 = 0.6;
  const K = {
    H: 98, steel: '#6a1822', trim: gold, cape: '#1a1a3a', eye: '#ffd060', bladeGlow: '#ffe0a0', reach: 92,
    helm(c, tt) {
      // 높은 붉은 깃털 장식
      c.fillStyle = '#c81a2a'; c.strokeStyle = OUT; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-1, -9); c.quadraticCurveTo(-4, -20, -14 + Math.sin(tt * 3) * 1.5, -22); c.quadraticCurveTo(-10, -16, -12 + Math.sin(tt * 3 + 1), -8); c.quadraticCurveTo(-6, -10, 2, -8); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = gold; c.fillRect(-2, -11, 4, 3);
    },
    chest(c, tt, shY) { c.fillStyle = gold; c.beginPath(); c.moveTo(2, shY + 6); c.lineTo(6, shY + 11); c.lineTo(2, shY + 16); c.lineTo(-2, shY + 11); c.closePath(); c.fill(); c.fillStyle = '#ff3a4a'; c.beginPath(); c.arc(2, shY + 11, 1.4, 0, TAU); c.fill(); },
    shoulder(c, tt, shY) { c.strokeStyle = gold; c.lineWidth = 1.4; c.beginPath(); c.ellipse(-1, shY + 3, 8, 5, -0.2, PI * 1.05, PI * 1.95); c.stroke(); },
    farItem(c, x, y, tt) {
      // 탑 방패 (먼 팔)
      c.save(); c.translate(x + 2, y - 10);
      c.beginPath(); c.moveTo(-9, -16); c.lineTo(9, -16); c.lineTo(9, 10); c.quadraticCurveTo(0, 22, -9, 10); c.closePath();
      ink(c, cyl(c, 'rgshield', -9, 9, '#6a1018'), 1.8);
      if (!FL) { c.strokeStyle = gold; c.lineWidth = 1.6; c.stroke(); c.fillStyle = gold; c.fillRect(-1, -12, 2, 20); c.fillRect(-6, -6, 12, 2); c.fillStyle = '#ffd860'; c.beginPath(); c.arc(0, -5, 2.2, 0, TAU); c.fill(); }
      c.restore();
    },
    drawWeapon(c, hx, hy, a, tt) { halberd(c, hx, hy, a, tt, gold); },
  };
  drawKnight(ctx, e, K, pose);
  if (wind > 0.5 && !FL) glint(ctx, an === 'thrust' ? 70 : -4, an === 'thrust' ? (e.high !== false ? -86 : -40) : -118, 5 + 6 * wind, '#ffe0a0', (wind - 0.5) * 2);
  FL = false;
};

// ── s12 투사체 / 장판 ──
PROJ_B.bat = (ctx, p) => {
  const d = Math.sign(p.vx) || 1;
  ctx.scale(d, 1);
  const flap = Math.sin(p.t * 26);
  glow(ctx, 0, 0, 14, '#ff2a4a', 0.35);
  ctx.fillStyle = '#2a0a18';
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(-8, -5 - flap * 5, -13, -1 - flap * 6); ctx.lineTo(-9, 1); ctx.lineTo(-5, 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.quadraticCurveTo(6, -5 - flap * 5, 11, -1 - flap * 6); ctx.lineTo(8, 1); ctx.lineTo(4, 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#140610'; ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 3.8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff3a4a'; ctx.beginPath(); ctx.arc(1.6, -0.8, 0.9, 0, TAU); ctx.fill();
};
ZONE_B.hellfire = (ctx, z) => {
  const cx = z.cx, by = z.bottom, t = z.t;
  ctx.save();
  if (!z.active) {
    const k = z.warnK;
    addOn(ctx);
    ctx.fillStyle = `rgba(255,90,20,${0.2 + 0.35 * k})`; ctx.beginPath(); ctx.ellipse(cx, by - 1, 10 + 18 * k, 4 + 2 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,180,80,${0.4 + 0.5 * k})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = PI + i / 5 * PI; ctx.moveTo(cx, by - 1); ctx.lineTo(cx + Math.cos(a) * (8 + 20 * k), by - 1 + Math.sin(a) * 3); } ctx.stroke();
    for (let i = 0; i < 3; i++) { const u = (t * 2 + i / 3) % 1; ctx.fillStyle = `rgba(255,150,60,${0.7 * (1 - u) * k})`; ctx.beginPath(); ctx.arc(cx + (h1(i + 2) - 0.5) * 24, by - 3 - u * 16, 1.6, 0, TAU); ctx.fill(); }
    addOff(ctx);
    ctx.restore(); return;
  }
  const up = ease.outCubic(k01(z.liveK * 5)), fade = k01(z.life / 0.15);
  const H = z.h * up, w = z.w / 2;
  ctx.globalAlpha = fade;
  addOn(ctx);
  for (let i = 0; i < 4; i++) {
    const hh = H * (1 - i * 0.18), ww = w * (1 - i * 0.2);
    const g = ctx.createLinearGradient(0, by - hh, 0, by);
    g.addColorStop(0, 'rgba(255,80,20,0)'); g.addColorStop(0.3, i === 3 ? 'rgba(255,250,200,0.9)' : 'rgba(255,120,30,0.6)'); g.addColorStop(1, i === 3 ? 'rgba(255,240,160,1)' : 'rgba(255,60,10,0.8)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(cx - ww, by);
    ctx.quadraticCurveTo(cx - ww * 0.8 + Math.sin(t * 20 + i) * 4, by - hh * 0.5, cx + Math.sin(t * 13 + i * 2) * 5, by - hh);
    ctx.quadraticCurveTo(cx + ww * 0.8 + Math.sin(t * 17 + i) * 4, by - hh * 0.5, cx + ww, by); ctx.closePath(); ctx.fill();
  }
  addOff(ctx);
  ctx.restore();
};

// ═════════════════════════ s13 심연의 역성 ═════════════════════════
// ── 혼돈의 권속 ──
RENDER_B.chaos_spawn = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const flesh = '#3a1a4a', fleshL = '#7a3a8a';
  const walk = an === 'walk', swell = an === 'swell', leap = an === 'leap';
  const sk = swell ? ease.outCubic(k01(at / 0.6)) : 0;
  let sx = 1 + Math.sin(t * 5) * 0.05, sy = 1 - Math.sin(t * 5) * 0.05;
  if (walk) { sx = 1 + Math.sin(t * 10) * 0.1; sy = 1 - Math.sin(t * 10) * 0.08; }
  if (swell) { sx = 1 + sk * 0.25 + Math.sin(t * 40) * 0.02 * sk; sy = 1 + sk * 0.3; }
  if (leap) { sx = 0.85; sy = 1.2; }
  const rx = 22 * sx, ry = 18 * sy, cy = -ry - (leap ? 4 : 0);
  if (!leap) shadow(ctx, rx, 0.45);
  glow(ctx, 0, cy, 44, '#b030ff', 0.18 + sk * 0.4);
  // 촉수 (뒤)
  const tent = (i, near) => {
    const a0 = -PI * 0.1 - i * 0.55 + (near ? 0.25 : 0), bx = Math.cos(a0) * rx * 0.8, by = cy + Math.sin(a0) * ry * 0.6;
    const w = Math.sin(t * 4 + i * 1.7), L = 16 + h1(i) * 10;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C(OUT); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.cos(a0) * L * 0.6 + w * 6, by + Math.sin(a0) * L * 0.6 - 4, bx + Math.cos(a0 + w * 0.5) * L, by + Math.sin(a0 + w * 0.5) * L); ctx.stroke();
    ctx.strokeStyle = C(near ? fleshL : flesh); ctx.lineWidth = 3; ctx.stroke();
  };
  for (let i = 0; i < 4; i++) tent(i, false);
  // 몸 (끓는 살덩이)
  const n = blobPts(0, cy, rx, ry, 14, t, 0.07 + sk * 0.05, 4.2, !leap);
  smoothClosed(ctx, PTS, n);
  ink(ctx, FL ? WHITE : radG(ctx, 'chsb', 6, -26, 2, 0, -18, 26, [0, '#9a4aaa', 0.4, '#5a2a6a', 0.8, flesh, 1, '#140818']), 2);
  if (!FL) {
    ctx.save(); smoothClosed(ctx, PTS, n); ctx.clip();
    // 맥동하는 핏줄
    addOn(ctx);
    ctx.strokeStyle = `rgba(255,60,180,${0.25 + sk * 0.5})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-18, cy + 6); ctx.quadraticCurveTo(-6, cy - 4, 2, cy + 8); ctx.moveTo(-4, cy - 14); ctx.quadraticCurveTo(4, cy - 6, 14, cy - 12); ctx.stroke();
    addOff(ctx);
    // 입들 (열렸다 닫힘)
    const mouths = [[-6, cy + 7, 7, 0], [12, cy + 2, 5, 1.7]];
    for (const [mx, my, mw, ph] of mouths) {
      const op = Math.max(0, Math.sin(t * 3 + ph)) * 4 + sk * 3;
      ctx.fillStyle = '#1a0408'; ctx.beginPath(); ctx.ellipse(mx, my, mw, 0.8 + op * 0.6, 0, 0, TAU); ctx.fill();
      if (op > 1) { ctx.fillStyle = '#e8e0d0'; for (let i = 0; i < 4; i++) { const x = mx - mw * 0.7 + i * mw * 0.47; ctx.beginPath(); ctx.moveTo(x - 0.8, my - op * 0.5); ctx.lineTo(x, my); ctx.lineTo(x + 0.8, my - op * 0.5); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 0.8, my + op * 0.5); ctx.lineTo(x, my); ctx.lineTo(x + 0.8, my + op * 0.5); ctx.fill(); } }
    }
    ctx.strokeStyle = 'rgba(170,190,255,0.5)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(1.5, cy + 1, rx, ry, 0, PI * 0.7, PI * 1.3); ctx.stroke();
    ctx.restore();
    // 눈들 (크기 제각각, 깜빡임)
    const eyes = [[6, cy - 8, 4.4, 0], [-8, cy - 6, 3, 1.3], [14, cy - 12, 2.4, 2.1], [-14, cy + 2, 2.2, 3.3], [0, cy - 14, 2, 4.1], [18, cy - 2, 1.8, 5.2]];
    for (const [ex, ey, r, ph] of eyes) {
      const bl = Math.sin(t * 0.9 + ph * 2.3) > 0.93 ? 0.15 : 1;
      ctx.fillStyle = '#f0e0d0'; ctx.beginPath(); ctx.ellipse(ex, ey, r, r * bl, 0, 0, TAU); ctx.fill();
      if (bl > 0.5) {
        const lx = Math.cos(t * 0.7 + ph) * r * 0.3 + r * 0.2, ly = Math.sin(t * 0.9 + ph) * r * 0.2;
        ctx.fillStyle = r > 3 ? '#ff2a3a' : '#ffc030'; ctx.beginPath(); ctx.arc(ex + lx, ey + ly, r * 0.55, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0a0004'; ctx.beginPath(); ctx.ellipse(ex + lx, ey + ly, r * 0.18, r * 0.45, 0, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(ex, ey, r, r * bl, 0, 0, TAU); ctx.stroke();
    }
    glow(ctx, 6, cy - 8, 12, '#ff2a4a', 0.4 + sk * 0.5);
  }
  for (let i = 0; i < 3; i++) tent(i + 4, true);
  if (swell && !FL) glint(ctx, 0, cy - ry - 4, 5 + 6 * sk, '#e0a0ff', sk > 0.5 ? (sk - 0.5) * 2 : 0);
  FL = false;
};

// ── 지옥견 ──
RENDER_B.hellhound = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  drawCanine(ctx, e, {
    fur: '#2e1c1c', furD: '#160c0c', belly: '#4a2a1c', eye: '#ffc030', mane: 'fire', mouth: '#ff6a1a', speed: 'rgba(255,140,60,0.35)',
    extraBody(c, tt, st, fast) {
      // 용암 균열 + 불꽃 갈기
      addOn(c);
      c.strokeStyle = 'rgba(255,120,30,0.8)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(-14, -4); c.lineTo(-9, 0); c.lineTo(-12, 4); c.moveTo(0, -6); c.lineTo(4, -1); c.lineTo(2, 3); c.moveTo(10, -8); c.lineTo(13, -3); c.stroke();
      for (let i = 0; i < 7; i++) {
        const x = -14 + i * 4.8 * st, u = (tt * 3 + i * 0.37) % 1, h = 7 + h1(i) * 6 + (fast ? 4 : 0);
        c.fillStyle = `rgba(255,${100 + i * 15},30,${0.75 * (1 - u)})`;
        c.beginPath(); c.moveTo(x - 3, -10); c.quadraticCurveTo(x - 2 - (fast ? 5 : 1) * u, -10 - h * 0.6, x - (fast ? 6 : 2) * u + Math.sin(tt * 10 + i) * 1.5, -10 - h * (0.7 + 0.3 * (1 - u))); c.quadraticCurveTo(x + 1, -12 - h * 0.4, x + 3, -10); c.closePath(); c.fill();
      }
      addOff(c);
      glow(c, 0, -10, 22, '#ff6a1a', 0.35);
    },
    extraHead(c, tt, jaw, angry) {
      glow(c, 14, 2 + jaw * 0.5, 8 + jaw, '#ff8a2a', 0.5 + (angry ? 0.3 : 0));
      // 쇳물 침
      const u = (tt * 1.2) % 1;
      c.fillStyle = `rgba(255,170,60,${1 - u})`; c.beginPath(); c.ellipse(12, 3 + jaw + u * 8, 0.9, 1.3 + u, 0, 0, TAU); c.fill();
      // 이마 뿔
      c.fillStyle = '#1a0e0e'; c.strokeStyle = OUT; c.lineWidth = 0.9; c.beginPath(); c.moveTo(4, -7); c.quadraticCurveTo(2, -14, -4, -16); c.quadraticCurveTo(1, -12, 1, -6.5); c.closePath(); c.fill(); c.stroke();
    },
  });
  if (an === 'breath' && !FL) {
    const k = k01(at / (e.params?.breath ?? 0.5));
    if (k < 1) glint(ctx, 38, -28, 5 + 5 * k, '#ffd080', k);
    else { glow(ctx, 40, -26, 30, '#ff7a2a', 0.8); glow(ctx, 40, -26, 12, '#fff0a0', 0.8); }
  }
  FL = false;
};

// ── 심연의 눈 ──
RENDER_B.abyss_eye = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const R = e.def.size.w * 0.34, cy = -e.def.size.h / 2;
  const aim = an === 'aim', fire = an === 'fire', rec = an === 'recover';
  const ak = aim ? k01((e.stateT ?? at) / (e.params?.aim ?? 1.1)) : 0;
  const la = (e.facing >= 0 ? (e.lookA ?? 0.4) : PI - (e.lookA ?? 0.4));
  glow(ctx, 0, cy, R * 3, '#ff2a3a', 0.2 + ak * 0.3 + (fire ? 0.5 : 0));
  // 촉수 (뒤·아래)
  for (let i = 0; i < 8; i++) {
    const a0 = PI * 0.25 + (i / 7) * PI * 1.1 + PI * 0.15, bx = Math.cos(a0) * R * 0.85, by = cy + Math.sin(a0) * R * 0.85;
    const w = Math.sin(t * 2.4 + i * 1.3), L = R * (0.9 + h1(i) * 0.7);
    const ex = bx + Math.cos(a0 + w * 0.4) * L, ey = by + Math.sin(a0 + w * 0.4) * L + 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = C(OUT); ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.cos(a0) * L * 0.5 + w * 8, by + Math.sin(a0) * L * 0.5, ex, ey); ctx.stroke();
    ctx.strokeStyle = C(i % 2 ? '#4a1a3a' : '#5a2244'); ctx.lineWidth = 4; ctx.stroke();
    if (!FL) { ctx.strokeStyle = 'rgba(180,160,255,0.35)'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#ff4a5a'; ctx.beginPath(); ctx.arc(ex, ey, 1.2, 0, TAU); ctx.fill(); }
  }
  // 살 주머니 (눈꺼풀 뒤)
  ctx.beginPath(); ctx.ellipse(-2, cy, R * 1.12, R * 1.08, 0, 0, TAU);
  ink(ctx, sph(ctx, 'aeflesh', -2, cy, Math.round(R * 1.1), '#4a1a3a'), 2.2);
  // 안구
  const open = rec ? 0.45 : fire ? 1.05 : aim ? 0.9 + ak * 0.15 : (Math.sin(t * 0.8) > 0.97 ? 0.1 : 0.85);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0, cy, R, R * open, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = FL ? WHITE : radG(ctx, 'aesclera', R * 0.3, cy - R * 0.3, 1, 0, cy, R, [0, '#fff4f0', 0.6, '#f0c8c0', 1, '#a86070']);
  ctx.fillRect(-R, cy - R, R * 2, R * 2);
  if (!FL) {
    // 핏줄
    ctx.strokeStyle = 'rgba(180,20,40,0.7)'; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU + 0.3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.quadraticCurveTo(Math.cos(a + 0.3) * R * 0.7, cy + Math.sin(a + 0.3) * R * 0.7, Math.cos(a + 0.1) * R * 0.5, cy + Math.sin(a + 0.1) * R * 0.5); ctx.stroke();
    }
    // 홍채 + 동공 (시선)
    const px = Math.cos(la) * R * 0.42, py = cy + Math.sin(la) * R * 0.42;
    const ir = R * 0.5;
    ctx.fillStyle = radG(ctx, 'aeiris', 0, 0, ir * 0.2, 0, 0, ir, [0, '#ffe060', 0.35, '#ff5a1a', 0.8, '#a00a1a', 1, '#3a0008']);
    ctx.save(); ctx.translate(px, py); ctx.beginPath(); ctx.arc(0, 0, ir, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(40,0,0,0.5)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * ir * 0.35, Math.sin(a) * ir * 0.35); ctx.lineTo(Math.cos(a) * ir * 0.9, Math.sin(a) * ir * 0.9); ctx.stroke(); }
    const pw = aim ? lerp(0.35, 0.12, ak) : fire ? 0.5 : 0.3;
    ctx.fillStyle = '#050002'; ctx.beginPath(); ctx.ellipse(0, 0, ir * pw, ir * 0.8, la * 0.2, 0, TAU); ctx.fill();
    if (fire || ak > 0.6) { glow(ctx, 0, 0, ir * 2, '#ff3040', fire ? 1 : (ak - 0.6) * 2.5); glow(ctx, 0, 0, ir * 0.8, '#ffffff', fire ? 0.9 : (ak - 0.6) * 1.5); }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(ir * 0.35, -ir * 0.4, ir * 0.22, ir * 0.14, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
    // 윤곽 그림자 (구형감)
    ctx.fillStyle = radG(ctx, 'aeshade', R * 0.2, cy - R * 0.2, R * 0.6, 0, cy, R, [0, 'rgba(0,0,0,0)', 1, 'rgba(60,0,20,0.55)']);
    ctx.fillRect(-R, cy - R, R * 2, R * 2);
  }
  ctx.restore();
  // 눈꺼풀
  ctx.beginPath(); ctx.ellipse(0, cy, R + 1, R * open + 1, 0, 0, TAU);
  ctx.lineWidth = 3; ctx.strokeStyle = C('#2a0a1a'); ctx.stroke();
  if (!FL) {
    ctx.strokeStyle = '#8a3a5a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, cy, R + 1, R * open + 1, 0, PI * 1.1, PI * 1.9); ctx.stroke();
    ctx.strokeStyle = 'rgba(180,200,255,0.55)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(-2, cy, R * 1.12, R * 1.08, 0, PI * 0.7, PI * 1.25); ctx.stroke();
    if (aim && ak > 0.7) glint(ctx, Math.cos(la) * R * 0.9, cy + Math.sin(la) * R * 0.9, 6 + 6 * Math.sin(t * 40), '#ff9090', (ak - 0.7) * 3.3);
  }
  FL = false;
};

// ── 그림자 헌터 (주인공의 어두운 거울상) ──
const SHADOW_LOOK = new WeakMap();
const SHADOW_FALLBACK = { build: 'normal', height: 1.0, hairStyle: 'ponytail', outfit: 'hunter', coat: 'long', weapon: { type: 'whip', style: 3 } };
function shadowLook(L) {
  let S = SHADOW_LOOK.get(L);
  if (S) return S;
  S = {
    ...L, skin: '#2e2640', hair: '#0c0814', eyes: '#ff2a4a', eyeGlow: true,
    primary: '#16121e', secondary: '#3a0a30', trim: '#8a4ad8', pants: '#0e0a14', boots: '#08060c',
    armorColor: '#1c1826', armorTrim: '#9a4ae8', headColor: '#16121e', band: '#6a1a8a',
    cape: L.cape ? { ...L.cape, color: '#120e1a', color2: '#3a0a3a' } : null,
    scarf: L.scarf ? { ...L.scarf, color: '#4a0a4a' } : null,
    aura: { color: '#b060ff', type: 'dark' }, trailColor: '#b060ff',
    weapon: { ...(L.weapon || {}), color: '#2a2236', glow: true, element: 'dark', rarity: 4 },
  };
  SHADOW_LOOK.set(L, S);
  return S;
}
RENDER_B.shadow_hunter = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t;
  const pl = world?.player;
  const look = shadowLook(pl?.look || SHADOW_FALLBACK);
  const ps = e._ps || (e._ps = { cx: 0, bottom: 0, facing: 1, stats: {}, charging: 0, muzzleT: 0 });
  ps.anim = e.heroAnim ?? 'idle'; ps.animT = e.heroAnimT ?? e.animT; ps.move = e.mv ?? null; ps.moveT = e.mvT ?? 0; ps.atkSpeedMul = 1;
  ps.look = look; ps.ch = pl?.ch; ps.vx = Math.abs(e.vx ?? 0); ps.vy = e.vy ?? 0; ps.onGround = e.onGround ?? true; ps.rig = e.rig || (e.rig = {}); ps.t = t;
  ps.dashT = e.dashT ?? 0;
  // 발밑 그림자 웅덩이 + 피어오르는 암흑
  if (!FL) {
    ctx.fillStyle = 'rgba(20,0,30,0.6)'; ctx.beginPath(); ctx.ellipse(0, -1, 24, 5, 0, 0, TAU); ctx.fill();
    glow(ctx, 0, -40, 50, '#8a2aff', 0.22);
    for (let i = 0; i < 5; i++) { const u = (t * 0.7 + i / 5) % 1; ctx.fillStyle = `rgba(40,10,60,${0.45 * (1 - u)})`; ctx.beginPath(); ctx.arc(-10 + i * 5 + Math.sin(t * 2 + i) * 4, -6 - u * 70, 5 + u * 7, 0, TAU); ctx.fill(); }
  }
  if (FL) drawHero(ctx, ps, world, { tint: '#ffffff' });
  else drawHero(ctx, ps, world, {});
  FL = false;
};

// ── 공허의 악마 ──
RENDER_B.void_demon = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const cast = an === 'cast', rift = an === 'rift', claw = an === 'claw', blink = an === 'blink';
  const ck = cast ? k01(at / 0.6) : rift ? k01(at / 0.5) : claw ? k01(at / 0.42) : 0;
  const bob = Math.sin(t * 1.2) * 3;
  ctx.save(); ctx.translate(0, bob);
  glow(ctx, 0, -54, 56, '#8a3aff', 0.25 + ck * 0.25);
  // 등 뒤 검은 고리 (사건의 지평선)
  if (!FL) {
    ctx.save(); ctx.translate(-4, -80); ctx.rotate(t * 0.3);
    addOn(ctx);
    ctx.strokeStyle = 'rgba(180,90,255,0.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 20, 20, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,255,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 20, 0.2, 1.6); ctx.stroke();
    addOff(ctx);
    ctx.fillStyle = '#050008'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // 몸 경로 (상체 → 꼬리처럼 흩어지는 하체)
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-10, -76);
    ctx.quadraticCurveTo(-20, -70, -16, -56);
    ctx.quadraticCurveTo(-10, -44, -12, -34);
    ctx.quadraticCurveTo(-14 + Math.sin(t * 2) * 3, -18, -6 + Math.sin(t * 3) * 4, -2);
    ctx.quadraticCurveTo(0, -14, 4 + Math.sin(t * 2.4) * 3, -6);
    ctx.quadraticCurveTo(8, -20, 10, -34);
    ctx.quadraticCurveTo(12, -46, 16, -58);
    ctx.quadraticCurveTo(18, -72, 8, -78);
    ctx.quadraticCurveTo(-1, -81, -10, -76); ctx.closePath();
  };
  // 먼 팔
  const armPose = (near) => {
    if (cast) return near ? [lerp(0.5, 1.5, ck), 0.2] : [lerp(0.4, 1.3, ck), 0.3];
    if (rift) return near ? [lerp(0.5, 2.2, ck), -0.4] : [lerp(0.4, 0.4, ck), 1.4];
    if (claw) { const k = at < 0.42 ? 0 : ease.outExpo(k01((at - 0.42) / 0.1)); return near ? [lerp(2.9, 1.2, k), lerp(0.1, 0.4, k)] : [0.6, 0.6]; }
    return near ? [0.5 + Math.sin(t * 1.4) * 0.1, 0.6] : [0.3, 0.7];
  };
  const drawArm = (near) => {
    const sx = near ? 10 : -12, sy = -70;
    const [a1, a2] = armPose(near);
    end(sx, sy, a1, 18); const ex = EX, ey = EY; end(ex, ey, a1 + a2, 16);
    const hx0 = EX, hy0 = EY;
    softLimb(ctx, sx, sy, ex, ey, hx0, hy0, 4.2, 3, near ? '#1a1030' : '#0e0818', near);
    // 긴 손가락
    if (!FL) {
      ctx.strokeStyle = near ? '#c8a0ff' : '#6a4a9a'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      const fa = a1 + a2;
      for (let i = -1; i <= 1; i++) { end(hx0, hy0, fa + i * 0.3, 9); ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(EX, EY); ctx.stroke(); }
    }
    return [hx0, hy0];
  };
  drawArm(false);
  body();
  ctx.lineWidth = 2.2; ctx.strokeStyle = C('#1a0830'); ctx.stroke();
  ctx.fillStyle = FL ? WHITE : linG(ctx, 'vdbody', 0, -80, 0, 0, [0, '#1c0c34', 0.5, '#0a0418', 1, 'rgba(10,4,24,0.2)']); ctx.fill();
  if (!FL) {
    // 몸 속 별하늘
    ctx.save(); body(); ctx.clip();
    addOn(ctx);
    const neb = radG(ctx, 'vdneb', 0, 0, 2, 0, 0, 30, [0, 'rgba(200,80,255,0.45)', 0.5, 'rgba(80,40,200,0.2)', 1, 'rgba(0,0,0,0)']);
    ctx.save(); ctx.translate(Math.sin(t * 0.4) * 4, -46 + Math.cos(t * 0.3) * 6); ctx.scale(1, 1.4); ctx.fillStyle = neb; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.fill(); ctx.restore();
    for (let i = 0; i < 22; i++) {
      const x = (h1(i) - 0.5) * 34, y = -78 + h1(i + 40) * 74;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + h1(i + 3) * 3) + i));
      ctx.fillStyle = `rgba(${220 + (i % 3) * 10},${200 + (i % 2) * 40},255,${tw})`;
      const r = 0.5 + h1(i + 20) * 1.1;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    addOff(ctx);
    ctx.restore();
    // 보랏빛 윤곽 림
    addOn(ctx); ctx.strokeStyle = 'rgba(170,110,255,0.7)'; ctx.lineWidth = 1.4; body(); ctx.stroke(); addOff(ctx);
  }
  // 머리: 뿔 왕관 + 흰 눈
  ctx.save(); ctx.translate(2, -84);
  for (const [x, h, a] of [[-7, 16, -0.5], [-2, 20, -0.2], [4, 18, 0.15], [9, 12, 0.5]]) {
    ctx.save(); ctx.translate(x, 0); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(-2.4, 2); ctx.quadraticCurveTo(-1, -h * 0.6, 0, -h); ctx.quadraticCurveTo(1.5, -h * 0.5, 2.4, 2); ctx.closePath();
    ink(ctx, C('#0c0616'), 1.2);
    if (!FL) { ctx.strokeStyle = 'rgba(190,130,255,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1.8, 0); ctx.quadraticCurveTo(-0.8, -h * 0.6, 0, -h + 1); ctx.stroke(); }
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(1, 2, 8, 9, 0, 0, TAU); ink(ctx, C('#0c0618'), 1.6);
  if (!FL) {
    eyeGlow(ctx, 4.5, 1, 1.8, '#f0e0ff', 1.2 + ck);
    eyeGlow(ctx, -0.8, 0.6, 1.3, '#f0e0ff', 0.9 + ck);
    ctx.strokeStyle = 'rgba(200,150,255,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(1, 5.5); ctx.quadraticCurveTo(4, 7 + ck * 2, 7, 5.2); ctx.stroke();
  }
  ctx.restore();
  const [hx, hy] = drawArm(true);
  if (!FL) {
    if (cast) { const r = 3 + ck * 7; glow(ctx, hx + 6, hy, r * 3, '#b060ff', ck); ctx.fillStyle = '#050008'; ctx.beginPath(); ctx.arc(hx + 6, hy, r, 0, TAU); ctx.fill(); addOn(ctx); ctx.strokeStyle = `rgba(210,150,255,${ck})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(hx + 6, hy, r * 1.5, r * 0.5, t * 2, 0, TAU); ctx.stroke(); addOff(ctx); if (ck > 0.6) glint(ctx, hx + 6, hy, 4 + 6 * ck, '#e8c8ff', (ck - 0.6) * 2.5); }
    if (rift) { glow(ctx, hx, hy, 16 + ck * 10, '#b060ff', ck); glint(ctx, hx, hy, 4 + 5 * ck, '#e8c8ff', ck); }
    if (claw && at >= 0.42) { const k = k01((at - 0.42) / 0.25); if (k < 1) swingTrail(ctx, 10, -70, 2.9, lerp(2.9, 1.2, ease.outExpo(k01((at - 0.42) / 0.1))), 40, 14, '#b060ff', 1 - k); }
    if (claw && at < 0.42) glint(ctx, hx, hy - 4, 5 + 6 * ck, '#e8c8ff', ck > 0.5 ? (ck - 0.5) * 2 : 0);
  }
  ctx.restore();
  FL = false;
};

// ── s13 투사체 / 장판 ──
PROJ_B.chaosorb = (ctx, p) => {
  glow(ctx, 0, 0, 16, '#d040ff', 0.6);
  ctx.fillStyle = radG(ctx, 'pcho', -2, -2, 0.5, 0, 0, 7, [0, '#f0a0ff', 0.5, '#8a2aaa', 1, '#2a0a3a']);
  ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#ffe0e0'; ctx.beginPath(); ctx.ellipse(1, -0.5, 3, 2.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff2a3a'; ctx.beginPath(); ctx.arc(1.6, -0.5, 1.4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#000'; ctx.fillRect(1.3, -1.6, 0.6, 2.2);
};
PROJ_B.voidorb = (ctx, p) => {
  const t = p.t;
  glow(ctx, 0, 0, 24, '#8a3aff', 0.7);
  ctx.fillStyle = '#040006'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
  addOn(ctx);
  ctx.strokeStyle = 'rgba(210,150,255,0.9)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(0, 0, 11, 4, t * 3, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 8, t * 6, t * 6 + 2); ctx.stroke();
  addOff(ctx);
};
PROJ_B.darkbolt = (ctx, p) => {
  const a = Math.atan2(p.vy, p.vx);
  ctx.rotate(a);
  addOn(ctx);
  ctx.fillStyle = linG(ctx, 'pdb', -34, 0, 8, 0, [0, 'rgba(90,20,160,0)', 1, 'rgba(190,110,255,0.9)']);
  ctx.beginPath(); ctx.ellipse(-12, 0, 24, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f0e0ff'; ctx.beginPath(); ctx.arc(6, 0, 3.4, 0, TAU); ctx.fill();
  addOff(ctx);
};
ZONE_B.flametrail = (ctx, z) => {
  const cx = z.cx, by = z.bottom, t = z.t;
  const fade = z.active ? k01(z.life / 0.4) : z.warnK;
  ctx.save(); ctx.globalAlpha = fade;
  addOn(ctx);
  for (let i = 0; i < 3; i++) {
    const h = 10 + 6 * Math.sin(t * 18 + i * 2 + (z.data?.seed ?? 0)), x = cx - 8 + i * 8;
    ctx.fillStyle = i === 1 ? 'rgba(255,220,120,0.8)' : 'rgba(255,110,30,0.7)';
    ctx.beginPath(); ctx.moveTo(x - 5, by); ctx.quadraticCurveTo(x - 3, by - h * 0.6, x + Math.sin(t * 12 + i) * 2, by - h); ctx.quadraticCurveTo(x + 3, by - h * 0.5, x + 5, by); ctx.closePath(); ctx.fill();
  }
  addOff(ctx);
  ctx.restore();
};
ZONE_B.rift = (ctx, z) => {
  const cx = z.cx, cy = z.cy, t = z.t;
  const k = z.active ? ease.outBack(k01(z.liveK * 6)) * k01(z.life / 0.3) : z.warnK * 0.35;
  ctx.save();
  glow(ctx, cx, cy, 60 * (0.4 + k), '#8a3aff', 0.5 * (0.3 + k));
  const H = z.h * (0.5 + 0.7 * k), W = 5 + 12 * k;
  ctx.beginPath(); ctx.moveTo(cx, cy - H / 2);
  for (let i = 1; i < 6; i++) { const u = i / 6; ctx.lineTo(cx + W * Math.sin(u * PI) * (1 + (i % 2) * 0.3) + Math.sin(t * 20 + i) * 1.5, cy - H / 2 + u * H); }
  ctx.lineTo(cx, cy + H / 2);
  for (let i = 5; i >= 1; i--) { const u = i / 6; ctx.lineTo(cx - W * Math.sin(u * PI) * (1 + ((i + 1) % 2) * 0.3) + Math.sin(t * 17 + i) * 1.5, cy - H / 2 + u * H); }
  ctx.closePath();
  ctx.fillStyle = '#030006'; ctx.fill();
  addOn(ctx);
  ctx.strokeStyle = `rgba(210,150,255,${0.5 + 0.5 * k})`; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.6 * k})`; ctx.lineWidth = 0.8; ctx.stroke();
  // 빨려드는 입자 고리
  for (let i = 0; i < 10; i++) { const a = h1(i) * TAU - t * 3, r = (1 - ((t * 1.2 + h1(i + 5)) % 1)) * 50 * (0.4 + k); ctx.fillStyle = `rgba(200,150,255,${0.6 * k})`; ctx.fillRect(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r * 1.2 - 1, 2, 2); }
  addOff(ctx);
  ctx.restore();
};
ZONE_B.beam = (ctx, z) => {
  const d = z.data; if (d?.x0 === undefined) return;
  const t = z.t;
  ctx.save();
  if (!z.active) {
    // 조준선: 가는 선이 점점 짙어지고, 잠금 직전 깜빡임
    const k = d.aimK ?? z.warnK;
    const blink = k > 0.75 ? (Math.sin(t * 60) > 0 ? 1 : 0.35) : 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,40,60,${(0.25 + 0.6 * k) * blink})`; ctx.lineWidth = 1 + k * 1.5; ctx.setLineDash([10, 6]); ctx.lineDashOffset = -t * 60;
    ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,80,90,${0.5 * k * blink})`; ctx.beginPath(); ctx.arc(d.x1, d.y1, 4 + 8 * k, 0, TAU); ctx.fill();
    ctx.restore(); return;
  }
  const lk = z.liveK, fade = k01(z.life / 0.12), grow = ease.outCubic(k01(lk * 8));
  const w = (14 + Math.sin(t * 50) * 2) * grow * fade + 1;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,30,60,0.35)'; ctx.lineWidth = w * 3; ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,60,80,0.8)'; ctx.lineWidth = w * 1.6; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,200,0.95)'; ctx.lineWidth = w * 0.55; ctx.stroke();
  ctx.fillStyle = 'rgba(255,200,180,0.8)'; ctx.beginPath(); ctx.arc(d.x1, d.y1, w * 1.4, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,120,120,0.6)'; ctx.beginPath(); ctx.arc(d.x0, d.y0, w * 1.8, 0, TAU); ctx.fill();
  ctx.restore();
};
// ── END ──
