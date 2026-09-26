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
// ── END ──
