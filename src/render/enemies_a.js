// 적 렌더러 A (스테이지 1~6 + 공용): RENDER_A[renderId] = (ctx, e, world, {flash}) => void
// 원점 = 발 중앙, 오른쪽을 보는 기준으로 그린다 (좌우 반전·정예 배율은 호출측 drawEnemy 가 처리).
// 크기는 def.size 기준 (e.w/e.h 는 정예 배율이 곱해져 있으므로 쓰지 않는다).
// 조명 규칙: 뒤(-x)쪽 차가운 림라이트 + 앞/위쪽 따뜻한 키라이트, 어두운 외곽선, 발광 눈.
// 각도 규칙(팔다리): 0 = 아래로 늘어뜨림, +값 = 앞(+x)쪽으로 회전. 끝점 = (x + sin(a)*L, y + cos(a)*L)
import { TAU, clamp, lerp, ease, shade, mix } from '../core/math.js';

export const RENDER_A = {};
/** 적 투사체/장판 전용 그리기 (game/ai_a.js 가 사용) */
export const PROJ_A = {};

const PI = Math.PI, HP = PI / 2;
const OUT = '#0b0610';          // 외곽선
const RIM = '#b4c8ff';          // 차가운 역광
const WARM = '#ffe2b0';         // 따뜻한 키라이트
const WHITE = '#ffffff';

// ───────────────────────── 공용 도우미 ─────────────────────────
let FL = false;                 // 피격 섬광 중이면 전부 흰색
const C = (c) => (FL ? WHITE : c);

// 그라디언트 캐시: 부위 로컬 좌표가 고정일 때만 사용 (키에 기하/색 포함)
const GC = new Map();
function linG(ctx, key, x0, y0, x1, y1, stops) {
  if (FL) return WHITE;
  let g = GC.get(key);
  if (!g) {
    g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    GC.set(key, g);
  }
  return g;
}
function radG(ctx, key, x0, y0, r0, x1, y1, r1, stops) {
  if (FL) return WHITE;
  let g = GC.get(key);
  if (!g) {
    g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    GC.set(key, g);
  }
  return g;
}
/** 원통형 음영: 뒤쪽 림 → 그림자 → 기본 → 앞쪽 하이라이트 (가로) */
function cyl(ctx, key, x0, x1, base, y0 = 0, y1 = 0) {
  if (FL) return WHITE;
  const k = 'c' + key + base + x0 + '_' + x1 + '_' + y0 + '_' + y1;
  let g = GC.get(k);
  if (!g) {
    g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, mix(base, RIM, 0.55));
    g.addColorStop(0.14, shade(base, -0.45));
    g.addColorStop(0.55, base);
    g.addColorStop(0.84, mix(shade(base, 0.22), WARM, 0.15));
    g.addColorStop(1, shade(base, -0.15));
    GC.set(k, g);
  }
  return g;
}
/** 구형 음영: 앞-위 하이라이트 중심의 방사형 */
function sph(ctx, key, cx, cy, r, base) {
  if (FL) return WHITE;
  const k = 's' + key + base + cx + '_' + cy + '_' + r;
  let g = GC.get(k);
  if (!g) {
    g = ctx.createRadialGradient(cx + r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.05);
    g.addColorStop(0, mix(shade(base, 0.35), WARM, 0.2));
    g.addColorStop(0.45, base);
    g.addColorStop(0.85, shade(base, -0.45));
    g.addColorStop(1, mix(shade(base, -0.3), RIM, 0.35));
    GC.set(k, g);
  }
  return g;
}
/** 세로 음영: 위 밝고 아래 어둡게 */
function vert(ctx, key, y0, y1, base, top = 0.2, bot = -0.5) {
  if (FL) return WHITE;
  const k = 'v' + key + base + y0 + '_' + y1;
  let g = GC.get(k);
  if (!g) {
    g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, shade(base, top));
    g.addColorStop(1, shade(base, bot));
    GC.set(k, g);
  }
  return g;
}
/** 현재 경로: 외곽선 → 채우기 */
function ink(ctx, fill, lw = 2) {
  ctx.lineWidth = lw; ctx.strokeStyle = C(OUT); ctx.stroke();
  ctx.fillStyle = fill; ctx.fill();
}
/** 부드러운 발광 (가산 합성) */
function glow(ctx, x, y, r, color, a = 1) {
  if (FL || a <= 0.01 || r <= 0.5) return;
  const rr = Math.round(r);
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
  if (a <= 0.01) return;
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
/** 테이퍼드 캡슐 (팔다리/살덩이) + 림/하이라이트 */
function limb(ctx, x1, y1, x2, y2, w1, w2, base, opt) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.arc(x1, y1, w1, a + HP, a - HP);
  ctx.arc(x2, y2, w2, a - HP, a + HP);
  ctx.closePath();
  ink(ctx, C(base), opt?.lw ?? 2);
  if (FL || opt?.flat) return;
  // 법선: 앞-위를 향하는 쪽이 하이라이트, 반대쪽이 림
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
/** 유기체 팔다리: 두 마디를 이음매 없이 (관절 외곽선 없음) */
function softLimb(ctx, x1, y1, x2, y2, x3, y3, w1, w2, col, near = true) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = C(OUT);
  ctx.lineWidth = w1 * 2 + 2.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.lineWidth = w2 * 2 + 2.4; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
  ctx.strokeStyle = C(col);
  ctx.lineWidth = w1 * 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.lineWidth = w2 * 2; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
  if (FL || !near) return;
  // 앞-위 하이라이트 한 줄
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
const MUDPTS = new Float32Array(24);
const BLOBPTS = new Float32Array(48);
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
/** 뼈 (양 끝 관절 혹) */
function boneSeg(ctx, x1, y1, x2, y2, w, col, knob = 1) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = C(OUT); ctx.lineWidth = w + 2.2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  if (knob) {
    ctx.fillStyle = C(OUT);
    ctx.beginPath(); ctx.arc(x1, y1, w * 0.78 + 1.1, 0, TAU); ctx.arc(x2, y2, w * 0.72 + 1.1, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = C(col); ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  if (knob) {
    ctx.fillStyle = C(col);
    ctx.beginPath(); ctx.arc(x1, y1, w * 0.78, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x2, y2, w * 0.72, 0, TAU); ctx.fill();
  }
  if (FL) return;
  // 림 (뒤쪽 가는 선)
  const a = Math.atan2(y2 - y1, x2 - x1);
  let nx = -Math.sin(a), ny = Math.cos(a);
  if (nx * 0.8 - ny * 0.6 > 0) { nx = -nx; ny = -ny; }
  ctx.strokeStyle = mixCache(col, RIM, 0.7, 0); ctx.lineWidth = Math.max(0.7, w * 0.3);
  ctx.beginPath(); ctx.moveTo(x1 + nx * w * 0.36, y1 + ny * w * 0.36); ctx.lineTo(x2 + nx * w * 0.36, y2 + ny * w * 0.36); ctx.stroke();
}
/** 호 궤적 (무기 휘두르기) — 어깨(px,py) 기준, 각도 규칙은 팔다리와 동일. 앞쪽이 두껍고 꼬리가 가는 초승달 */
function swingTrail(ctx, px, py, a0, a1, R, width, color, alpha) {
  if (alpha <= 0.02 || Math.abs(a1 - a0) < 0.05) return;
  if (Math.abs(a1 - a0) > 2.3) a0 = a1 + Math.sign(a0 - a1) * 2.3;
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
  // 선단의 흰 날
  ctx.globalAlpha = ga * alpha * 0.9;
  ctx.strokeStyle = WHITE; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(px, py, R - 1, t0 + (t1 - t0) * 0.55, t1, t1 < t0); ctx.stroke();
  ctx.globalAlpha = ga;
  ctx.globalCompositeOperation = 'source-over';
}
/** 공격 진행도: 예비동작(wind 0→1) / 휘두르기(swing 0→1) / 이후 시간(after) */
function atkPhase(at, windup, swingDur = 0.1) {
  if (at < windup) return { w: at / windup, s: 0, after: 0 };
  const s = clamp((at - windup) / swingDur, 0, 1);
  return { w: 1, s, after: at - windup };
}
const hurtOf = (e) => (e.flashT > 0 ? 1 : 0) || (e.stun > 0.06 ? 0.7 : 0);
const deathK = (e) => (e.dying > 0 ? 1 - clamp(e.dying / (e.def.dieTime ?? 0.35), 0, 1) : 0);
const osc = (t, f, p = 0) => Math.sin(t * f + p);

// ───────────────────────── 칼/무기 부품 ─────────────────────────
/** 검: 손잡이 원점, 칼날은 +y 방향으로 len (ctx 를 칼 방향으로 회전한 뒤 호출) */
function drawBlade(ctx, len, wdt, steel, opt = {}) {
  // 손잡이
  ctx.fillStyle = C(opt.grip ?? '#3a2418');
  ctx.fillRect(-1.6, -7, 3.2, 8);
  ctx.fillStyle = C(opt.pommel ?? '#b08a3a');
  ctx.beginPath(); ctx.arc(0, -7.5, 2.4, 0, TAU); ctx.fill();
  // 칼날
  ctx.beginPath();
  if (opt.curve) {
    ctx.moveTo(-wdt * 0.5, 2);
    ctx.quadraticCurveTo(-wdt * 0.9 + opt.curve * 0.3, len * 0.55, opt.curve, len);
    ctx.quadraticCurveTo(wdt * 1.4 + opt.curve * 0.5, len * 0.5, wdt * 0.6, 2);
  } else {
    ctx.moveTo(-wdt * 0.5, 2); ctx.lineTo(-wdt * 0.42, len - wdt * 1.6); ctx.lineTo(0, len); ctx.lineTo(wdt * 0.42, len - wdt * 1.6); ctx.lineTo(wdt * 0.5, 2);
  }
  ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'blade' + steel + wdt, -wdt, 0, wdt, 0, [0, lt(steel, 0.5), 0.45, steel, 0.55, dk(steel, -0.35), 1, dk(steel, -0.55)]), 1.8);
  if (!FL) {
    // 피 홈 / 녹
    ctx.strokeStyle = lt(steel, 0.55); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-0.5, 4); ctx.lineTo(-0.5 + (opt.curve ?? 0) * 0.4, len * 0.7); ctx.stroke();
    if (opt.rust) {
      ctx.fillStyle = 'rgba(120,52,20,0.55)';
      ctx.beginPath(); ctx.arc(wdt * 0.2, len * 0.35, 1.6, 0, TAU); ctx.arc(-wdt * 0.1, len * 0.6, 1.2, 0, TAU); ctx.arc(wdt * 0.15, len * 0.78, 1.0, 0, TAU); ctx.fill();
    }
  }
  // 코등이
  ctx.beginPath(); ctx.rect(-(opt.guard ?? 6), 0, (opt.guard ?? 6) * 2, 2.6);
  ink(ctx, C(opt.guardCol ?? '#8a6a2a'), 1.4);
}

// ───────────────────────── 해골 리그 (해골 계열 7종 공용) ─────────────────────────
// o: { H, bone, eye, wpn:'sword'|'club'|'none'|'bow'|'scim'|'staff', cloth, helm:null|'hood'|'horned'|'turban'|'mage',
//      armor:null|'dark', shield:null|{c,t}, cape, robe:null|{c,t}, blood, quiver, pose:'overhead'|'throw'|'bow'|'dual'|'cast' }
function drawSkull(ctx, r, bone, eye, jaw, o) {
  // 두개골 (3/4 측면)
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, -r * 0.1);
  ctx.bezierCurveTo(-r * 1.05, -r * 1.2, r * 0.9, -r * 1.35, r * 1.05, -r * 0.2);
  ctx.lineTo(r * 1.08, r * 0.35);
  ctx.lineTo(r * 0.7, r * 0.55);
  ctx.lineTo(r * 0.2, r * 0.6);
  ctx.bezierCurveTo(-r * 0.5, r * 0.75, -r * 0.95, r * 0.5, -r * 0.95, -r * 0.1);
  ctx.closePath();
  ink(ctx, sph(ctx, 'skull', 0, -r * 0.2, r * 1.1, bone), 2);
  // 턱
  ctx.save();
  ctx.translate(-r * 0.1, r * 0.45);
  ctx.rotate(jaw);
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.1); ctx.lineTo(r * 1.0, -r * 0.05); ctx.lineTo(r * 0.95, r * 0.45); ctx.quadraticCurveTo(r * 0.4, r * 0.62, -r * 0.1, r * 0.35); ctx.closePath();
  ink(ctx, C(dk(bone, -0.12)), 1.8);
  if (!FL) { ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; for (let i = 0; i < 4; i++) { const x = r * (0.25 + i * 0.2); ctx.beginPath(); ctx.moveTo(x, -r * 0.05); ctx.lineTo(x, r * 0.2); ctx.stroke(); } }
  ctx.restore();
  if (FL) return;
  // 윗니
  ctx.strokeStyle = OUT; ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) { const x = r * (0.25 + i * 0.2); ctx.beginPath(); ctx.moveTo(x, r * 0.28); ctx.lineTo(x, r * 0.55); ctx.stroke(); }
  // 광대 그림자
  ctx.fillStyle = 'rgba(40,24,16,0.35)';
  ctx.beginPath(); ctx.ellipse(r * 0.2, r * 0.2, r * 0.35, r * 0.18, 0, 0, TAU); ctx.fill();
  // 눈구멍
  ctx.fillStyle = '#120608';
  ctx.beginPath(); ctx.ellipse(r * 0.42, -r * 0.12, r * 0.3, r * 0.34, 0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.9, -r * 0.12, r * 0.16, r * 0.3, 0.1, 0, TAU); ctx.fill();
  // 코
  ctx.beginPath(); ctx.moveTo(r * 0.82, r * 0.1); ctx.lineTo(r * 0.98, r * 0.34); ctx.lineTo(r * 0.72, r * 0.32); ctx.closePath(); ctx.fill();
  // 금
  if (o?.crack !== false) { ctx.strokeStyle = 'rgba(40,20,10,0.6)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.95); ctx.lineTo(-r * 0.05, -r * 0.6); ctx.lineTo(-r * 0.25, -r * 0.4); ctx.stroke(); }
  // 눈빛
  eyeGlow(ctx, r * 0.45, -r * 0.1, r * 0.13, eye);
  eyeGlow(ctx, r * 0.92, -r * 0.1, r * 0.09, eye, 0.8);
}

function drawRibcage(ctx, bone, T, blood) {
  // T = 몸통 길이. 로컬: 골반(0,0) → 목(0,-T)
  // 척추 (요추)
  for (let i = 0; i < 4; i++) {
    const y = -3 - i * (T * 0.1);
    ctx.fillStyle = C(OUT); ctx.beginPath(); ctx.ellipse(-0.5, y, 2.6, 2.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C(dk(bone, -0.1)); ctx.beginPath(); ctx.ellipse(-0.5, y, 1.7, 1.3, 0, 0, TAU); ctx.fill();
  }
  // 흉곽
  const y0 = -T * 0.38, y1 = -T;
  ctx.beginPath();
  ctx.moveTo(-3, y1 + 1);
  ctx.bezierCurveTo(-7, y1 + 2, -7.5, y0 - 2, -2.5, y0);
  ctx.bezierCurveTo(2, y0 + 2.5, 8.5, y0 + 1, 8.5, y0 - 4);
  ctx.bezierCurveTo(9, y1 + 6, 6, y1, 1, y1 - 0.5);
  ctx.closePath();
  ink(ctx, cyl(ctx, 'rib' + T, -7, 9, bone), 2);
  if (!FL) {
    // 갈비 사이 틈
    ctx.strokeStyle = '#1a0c08'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const y = y1 + 4 + i * ((y0 - y1 - 4) / 4);
      ctx.beginPath(); ctx.moveTo(-4.5 + i * 0.4, y + 0.5); ctx.quadraticCurveTo(2, y + 3.5 + i * 0.3, 7.6 - i * 0.2, y + 1.5 + i * 0.5); ctx.stroke();
    }
    // 흉골
    ctx.strokeStyle = lt(bone, 0.35); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(7, y1 + 3); ctx.lineTo(7.4, y0 - 5); ctx.stroke();
    if (blood) {
      ctx.fillStyle = '#7a0a14';
      ctx.beginPath(); ctx.ellipse(2, y1 + 6, 3, 1.5, 0.2, 0, TAU); ctx.ellipse(5, y0 - 3, 2.2, 1.2, -0.2, 0, TAU); ctx.fill();
    }
  }
}

function drawPelvis(ctx, bone) {
  ctx.beginPath();
  ctx.moveTo(-6, -3); ctx.quadraticCurveTo(-7, 3, -2, 4.5); ctx.lineTo(0, 2); ctx.lineTo(2, 4.5); ctx.quadraticCurveTo(7.5, 3, 6.5, -3); ctx.quadraticCurveTo(0, -1, -6, -3);
  ctx.closePath();
  ink(ctx, cyl(ctx, 'pelvis', -7, 7, bone), 1.8);
}

/** 해골 리그 */
function drawSkel(ctx, e, o) {
  const H = o.H ?? 80, s = H / 80;
  const bone = o.bone ?? '#e6dcc2', boneB = dk(bone, -0.28);
  const t = e.t, at = e.animT, anim = e.anim;
  const P = e.params || {};
  const hurt = hurtOf(e);
  const walking = anim === 'walk';
  const ph = t * (o.stride ?? 9);
  const sw = walking ? Math.sin(ph) : 0, cw = walking ? Math.cos(ph) : 0;
  const br = Math.sin(t * 2.6);
  let bob = walking ? -Math.abs(cw) * 1.8 : br * 0.7;
  let lean = walking ? 0.1 : 0.03;
  let hipF = walking ? sw * 0.55 : 0.14, hipB = walking ? -sw * 0.55 : -0.12;
  let knF = walking ? -Math.max(0, cw) * 0.95 - 0.08 : -0.12, knB = walking ? -Math.max(0, -cw) * 0.95 - 0.08 : -0.05;
  // 팔 (F=앞팔/무기, B=뒤팔)
  let shF = walking ? -sw * 0.45 + 0.35 : 0.35 + br * 0.04, elF = 0.55;
  let shB = walking ? sw * 0.45 + 0.1 : 0.12 - br * 0.04, elB = 0.45;
  let wA = 1.9;            // 무기 각도 (절대)
  let jaw = 0.05 + Math.max(0, Math.sin(t * 7)) * 0.08;
  let trail = null;        // [a0,a1,R,alpha]
  let tele = 0;            // 예비동작 경고 강도
  let stepX = 0;
  const pose = o.pose ?? 'overhead';
  const attacking = anim === 'attack' || anim === 'combo' || anim === 'draw' || anim === 'volley' || anim === 'cast';
  if (attacking) {
    const wu = pose === 'dual' ? 0.3 : P.windup ?? (pose === 'bow' ? P.draw ?? 0.75 : pose === 'cast' ? P.cast ?? 0.8 : 0.4);
    const ap = atkPhase(at, wu, 0.09);
    const kw = ease.outCubic(ap.w), ks = ease.outCubic(ap.s);
    if (pose === 'overhead') {
      if (ap.s <= 0) { shF = lerp(0.35, 3.55, kw); elF = lerp(0.55, 0.65, kw); wA = lerp(1.9, 4.05, kw); lean = lerp(0.03, -0.12, kw); tele = ap.w; }
      else { shF = lerp(3.55, 1.05, ks); elF = lerp(0.65, 0.1, ks); wA = lerp(4.05, 1.3, ks); lean = lerp(-0.12, 0.28, ks); stepX = 4 * ks; trail = [4.05, wA, 0, clamp(1 - ap.after / 0.22, 0, 1)]; }
      hipF = lerp(hipF, 0.45, ap.s); knF = lerp(knF, -0.4, ap.s); hipB = lerp(hipB, -0.35, ap.s);
      jaw = 0.25 * kw;
    } else if (pose === 'throw') {
      if (ap.s <= 0) { shF = lerp(0.35, -2.3, kw); elF = lerp(0.55, -0.9, kw); lean = lerp(0.03, -0.18, kw); tele = ap.w; }
      else { shF = lerp(-2.3, -4.55, ks); elF = lerp(-0.9, 0.2, ks); lean = lerp(-0.18, 0.22, ks); trail = [-2.3, shF, 2, clamp(1 - ap.after / 0.2, 0, 1) * 0.7]; }
      shB = lerp(shB, 1.2, kw) - ks * 0.6; elB = 0.8;
    } else if (pose === 'bow') {
      const aim = e.aimA ?? 0; // 로컬 조준각 (0=정면, -=위)
      const k = ease.outQuad(clamp(at / 0.25, 0, 1));
      shB = lerp(0.3, HP - aim, k); elB = 0; // 활 든 팔 (뒤쪽 팔이 앞으로 뻗음)
      shF = lerp(0.3, HP - aim + 0.35, k); elF = lerp(0.5, -2.3 + ap.w * -0.35, k); // 시위 당기는 팔
      lean = -0.05 + (anim === 'volley' ? -0.1 : 0);
      tele = ap.w > 0.6 ? (ap.w - 0.6) / 0.4 : 0;
      jaw = 0.06;
    } else if (pose === 'dual') {
      // 2연속 베기: 0.3 준비 → 0.36 1타 → 0.55 2타
      const a1 = clamp((at - 0.26) / 0.08, 0, 1), a2 = clamp((at - 0.5) / 0.08, 0, 1);
      const k0 = ease.outCubic(clamp(at / 0.26, 0, 1));
      tele = at < 0.26 ? k0 : 0;
      shF = lerp(lerp(0.35, 3.3, k0), 0.9, ease.outCubic(a1)); elF = lerp(0.6, 0.1, a1);
      shB = lerp(lerp(0.1, -1.2, k0), 3.4, a1 * 0.6); shB = lerp(shB, 1.2, ease.outCubic(a2)); elB = lerp(0.4, 0.1, a2);
      wA = lerp(lerp(1.9, 3.9, k0), 1.2, ease.outCubic(a1));
      lean = 0.05 + a1 * 0.15 + a2 * 0.1 - k0 * 0.1;
      stepX = a1 * 3 + a2 * 3;
      if (a1 > 0 && a2 <= 0) trail = [3.9, wA, 0, clamp(1 - (at - 0.34) / 0.18, 0, 1)];
      if (a2 > 0) trail = [3.2, lerp(3.2, 1.3, ease.outCubic(a2)), 1, clamp(1 - (at - 0.58) / 0.18, 0, 1)];
      jaw = 0.2;
    } else if (pose === 'cast') {
      const k = ease.outCubic(clamp(at / 0.35, 0, 1));
      shF = lerp(0.35, 2.7, k) + Math.sin(t * 20) * 0.03 * ap.w; elF = lerp(0.5, 0.2, k);
      shB = lerp(0.1, 1.7, k); elB = lerp(0.4, 0.7, k);
      lean = -0.1 * k;
      tele = ap.w;
      jaw = 0.1 + 0.25 * Math.abs(Math.sin(t * 14)) * ap.w;
    }
  } else if (o.wpn === 'staff') { shF = 0.45 + br * 0.03; elF = 1.25; }
  if (anim === 'jump') {
    hipF = 0.9; knF = -1.4; hipB = 0.3; knB = -1.2; shF = 2.2; shB = -0.6; lean = 0.1;
  }
  if (hurt) { lean = -0.28; shF += -0.6; shB += -0.5; jaw = 0.35; }
  lean += deathK(e) * 0.6;

  const hipY = -40 * s + bob, thigh = 19.5 * s, shin = 19.5 * s, T = 24 * s;
  const ua = 14.5 * s, fa = 13.5 * s;
  ctx.translate(stepX, 0);
  // 망토 (뒤)
  const nX = Math.sin(lean) * T, nY = hipY - Math.cos(lean) * T;
  if (o.cape) drawCape(ctx, e, nX - 1, nY + 2, 44 * s, o.cape, walking);
  // 화살통
  if (o.quiver && !FL) {
    ctx.save(); ctx.translate(nX - 5, nY + 8); ctx.rotate(-0.5 + lean);
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-1 + i * 2, -3); ctx.lineTo(-1 + i * 2, -9); ctx.stroke(); ctx.fillStyle = '#b02a2a'; ctx.fillRect(-2 + i * 2, -12, 2, 4); }
    ctx.beginPath(); ctx.rect(-4, -3, 8, 18); ink(ctx, cyl(ctx, 'quiv', -4, 4, '#5a3a22'), 1.6);
    ctx.fillStyle = '#b08a3a'; ctx.fillRect(-4, 0, 8, 1.5); ctx.fillRect(-4, 11, 8, 1.5);
    ctx.restore();
  }
  // 뒤팔
  const shX = nX + 0.5, shY = nY + 2;
  drawSkelArm(ctx, shX - 2, shY, shB, elB, ua, fa, boneB, o, false, e, wA, pose, at);
  // 뒤다리
  end(-1.5, hipY, hipB, thigh); let kx = EX, ky = EY;
  end(kx, ky, hipB + knB, shin); let ax = EX, ay = EY;
  boneSeg(ctx, -1.5, hipY, kx, ky, 3.4 * s, boneB);
  boneSeg(ctx, kx, ky, ax, ay, 2.8 * s, boneB);
  drawFoot(ctx, ax, ay, boneB, s);
  // 로브 (다리를 덮음)
  if (o.robe) drawRobe(ctx, e, nX, nY, hipY, o.robe, s, walking);
  // 골반 + 몸통
  ctx.save(); ctx.translate(0, hipY);
  if (!o.robe) drawPelvis(ctx, bone);
  ctx.rotate(lean);
  if (!o.robe) drawRibcage(ctx, bone, T, o.blood);
  if (o.armor) drawBreastplate(ctx, T, o.armor, s);
  ctx.restore();
  // 허리천
  if (o.cloth && !o.robe) drawLoincloth(ctx, 0, hipY, o.cloth, t, walking, s);
  // 앞다리
  if (!o.robe || true) {
    end(1.5, hipY, hipF, thigh); kx = EX; ky = EY;
    end(kx, ky, hipF + knF, shin); ax = EX; ay = EY;
    if (!o.robe) { boneSeg(ctx, 1.5, hipY, kx, ky, 3.6 * s, bone); boneSeg(ctx, kx, ky, ax, ay, 3 * s, bone); }
    drawFoot(ctx, ax, ay, bone, s, o.armor);
    if (o.armor && !o.robe) drawGreave(ctx, kx, ky, ax, ay, o.armor, s);
  }
  // 머리
  const hx = nX + Math.sin(lean) * 8 * s, hy = nY - 7.5 * s;
  if (o.robe) drawRobeFront(ctx, e, nX, nY, hipY, o.robe, s);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(lean * 0.6 + (hurt ? -0.3 : 0) + (anim === 'idle' ? Math.sin(t * 1.3) * 0.04 : 0));
  // 목뼈
  boneSeg(ctx, -1, 7 * s, -1, 3 * s, 2.4 * s, bone, 0);
  drawSkull(ctx, 7.2 * s, bone, o.eye ?? '#ff2a3a', jaw, o);
  if (o.helm) drawHelm(ctx, o.helm, 7.2 * s, t, e);
  ctx.restore();
  if (o.armor) drawPauldron(ctx, shX, shY, o.armor, s);
  // 앞팔 + 무기
  const tr = drawSkelArm(ctx, shX, shY, shF, elF, ua, fa, bone, o, true, e, wA, pose, at);
  if (trail) {
    const R = trail[2] === 1 ? ua + fa + 20 * s : ua + fa + (o.wpn === 'club' ? 22 : 26) * s;
    const tc = o.trailColor ?? (o.blood ? '#ff4a3a' : '#e8f0ff');
    if (trail[2] === 2) swingTrail(ctx, shX, shY, trail[0], trail[1], ua + fa, 8 * s, '#ffe0a0', trail[3]);
    else if (trail[2] === 1) swingTrail(ctx, shX - 2, shY, 3.2, trail[1], R, 12 * s, tc, trail[3]);
    else swingTrail(ctx, shX, shY, trail[0], trail[1], R, 13 * s, tc, trail[3]);
  }
  if (tele > 0.45 && tr) glint(ctx, tr[0], tr[1], 5 + 5 * tele, o.teleColor ?? '#ffe8b0', (tele - 0.45) / 0.55);
  ctx.translate(-stepX, 0);
}

/** 해골 팔 + 들고 있는 것. 반환: 무기 끝 좌표 (경고 반짝임용) */
function drawSkelArm(ctx, sx, sy, sh, el, ua, fa, col, o, front, e, wA, pose, at) {
  end(sx, sy, sh, ua); const ex = EX, ey = EY;
  end(ex, ey, sh + el, fa); const hx = EX, hy = EY;
  const s = (o.H ?? 80) / 80;
  let tip = null;
  // 뒤 손의 방패/활/곡도
  if (!front) {
    if (pose === 'bow') { boneSeg(ctx, sx, sy, ex, ey, 2.8 * s, col); boneSeg(ctx, ex, ey, hx, hy, 2.4 * s, col); drawBow(ctx, hx, hy, sh + el, e, o); return null; }
    if (o.wpn === 'scim') { boneSeg(ctx, sx, sy, ex, ey, 2.8 * s, col); boneSeg(ctx, ex, ey, hx, hy, 2.4 * s, col); ctx.save(); ctx.translate(hx, hy); ctx.rotate(-(sh + el) + 0.3 - HP * 0.2); drawBlade(ctx, 24 * s, 4.5 * s, '#9aa0ac', { curve: 6 * s, guard: 4, guardCol: '#c8a040', grip: '#5a1a1a' }); ctx.restore(); return null; }
  }
  boneSeg(ctx, sx, sy, ex, ey, (front ? 3.2 : 2.8) * s, col);
  boneSeg(ctx, ex, ey, hx, hy, (front ? 2.8 : 2.4) * s, col);
  // 손가락
  if (!FL) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    const fa2 = sh + el;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.sin(fa2 + i * 0.4) * 4 * s, hy + Math.cos(fa2 + i * 0.4) * 4 * s); ctx.stroke(); }
  }
  if (!front) {
    if (o.shield) drawRoundShield(ctx, hx, hy, o.shield, s);
    return null;
  }
  if (o.wpn === 'sword' || o.wpn === 'club' || o.wpn === 'scim') {
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-wA);
    if (o.wpn === 'sword') drawBlade(ctx, (o.bladeLen ?? 30) * s, 5.2 * s, o.steel ?? '#9a9c9e', { rust: o.rust ?? true, guard: 5.5 * s, grip: '#3a2418' });
    else if (o.wpn === 'scim') drawBlade(ctx, 26 * s, 4.8 * s, '#b4bac4', { curve: 7 * s, guard: 4.5, guardCol: '#d8b048', grip: '#5a1a1a', pommel: '#d8b048' });
    else drawCleaver(ctx, s, o);
    ctx.restore();
    const L = (o.wpn === 'club' ? 24 : o.wpn === 'scim' ? 26 : o.bladeLen ?? 30) * s;
    tip = [hx + Math.sin(wA) * L, hy + Math.cos(wA) * L];
  } else if (o.wpn === 'staff') {
    const casting = e.anim === 'cast';
    const a = casting ? lerp(PI - 0.08, PI - 0.75, ease.outCubic(clamp(at / 0.35, 0, 1))) : PI - 0.1 + Math.sin(e.t * 2.6) * 0.03;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-a);
    ctx.beginPath(); ctx.rect(-1.6, -38 * s, 3.2, 78 * s); ink(ctx, cyl(ctx, 'staff', -1.6, 1.6, '#4a2a1a'), 1.6);
    // 머리 장식 (뒤틀린 뿔 + 보석)
    ctx.strokeStyle = C('#c8a040'); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, 38 * s); ctx.quadraticCurveTo(-8 * s, 44 * s, -4 * s, 50 * s); ctx.moveTo(0, 38 * s); ctx.quadraticCurveTo(8 * s, 44 * s, 4 * s, 50 * s); ctx.stroke();
    const gy = 45 * s;
    const pulse = 0.6 + 0.4 * Math.sin(e.t * 5) + (e.anim === 'cast' ? 0.5 : 0);
    glow(ctx, 0, gy, 18 * s * pulse, o.gem ?? '#b060ff', 0.8);
    ctx.fillStyle = C(o.gem ?? '#b060ff'); ctx.beginPath(); ctx.moveTo(0, gy - 4); ctx.lineTo(3, gy); ctx.lineTo(0, gy + 4); ctx.lineTo(-3, gy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = WHITE; ctx.fillRect(-0.8, gy - 2, 1.6, 2);
    ctx.restore();
    tip = [hx + Math.sin(a) * 45 * s, hy + Math.cos(a) * 45 * s];
  } else if (o.wpn === 'bone' || pose === 'throw') {
    // 던질 뼈
    if (e.anim === 'attack' && at < (e.params?.windup ?? 0.42) + 0.02) {
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(-(sh + el) + 0.8);
      boneSeg(ctx, -7 * s, 0, 7 * s, 0, 3 * s, o.bone ?? '#e6dcc2');
      ctx.restore();
      tip = [hx, hy];
    }
  } else if (pose === 'bow') {
    // 시위 당기는 손: 화살
    const bh = e._bowHand;
    if (bh) {
      const aim = e.aimA ?? 0;
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(-aim);
      const nock = e.anim === 'draw' || e.anim === 'volley';
      if (nock) {
        ctx.strokeStyle = C('#6a4a2a'); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(30 * s, 0); ctx.stroke();
        ctx.fillStyle = C('#c8ccd4'); ctx.beginPath(); ctx.moveTo(30 * s, -2.4); ctx.lineTo(36 * s, 0); ctx.lineTo(30 * s, 2.4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C('#b02a2a'); ctx.fillRect(-2, -2.2, 5, 1.4); ctx.fillRect(-2, 0.8, 5, 1.4);
        tip = [hx + Math.cos(aim) * 36 * s, hy + Math.sin(aim) * 36 * s];
      }
      ctx.restore();
      // 시위
      if (!FL) { ctx.strokeStyle = 'rgba(230,220,200,0.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(bh[0], bh[1]); ctx.lineTo(hx, hy); ctx.lineTo(bh[2], bh[3]); ctx.stroke(); }
    }
  }
  return tip;
}

function drawCleaver(ctx, s, o) {
  // 피 묻은 뼈 곤봉/식칼
  ctx.fillStyle = C('#3a2418'); ctx.fillRect(-1.6, -6, 3.2, 10);
  ctx.beginPath(); ctx.moveTo(-3, 3); ctx.lineTo(-5 * s, 24 * s); ctx.quadraticCurveTo(2, 28 * s, 7 * s, 22 * s); ctx.lineTo(4, 3); ctx.closePath();
  ink(ctx, cyl(ctx, 'cleav', -5, 7, '#c9b89a'), 1.8);
  if (!FL) { ctx.fillStyle = '#8a0f18'; ctx.beginPath(); ctx.moveTo(-5 * s, 20 * s); ctx.quadraticCurveTo(2, 28 * s, 7 * s, 20 * s); ctx.lineTo(6 * s, 16 * s); ctx.quadraticCurveTo(1, 22 * s, -4 * s, 16 * s); ctx.closePath(); ctx.fill(); }
}

function drawBow(ctx, hx, hy, armA, e, o) {
  const s = (o.H ?? 80) / 80;
  const aim = e.aimA ?? 0;
  const drawing = e.anim === 'draw' || e.anim === 'volley';
  const bend = drawing ? 0.55 : 0.35;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(drawing ? aim : -0.9);
  const L = 24 * s;
  ctx.lineCap = 'round';
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 4.2;
  ctx.beginPath(); ctx.moveTo(-L * bend * 0.5, -L); ctx.quadraticCurveTo(L * bend, 0, -L * bend * 0.5, L); ctx.stroke();
  ctx.strokeStyle = C('#6a3e1e'); ctx.lineWidth = 2.4; ctx.stroke();
  if (!FL) { ctx.strokeStyle = '#c8903a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-L * bend * 0.4, -L * 0.9); ctx.quadraticCurveTo(L * bend * 0.9, 0, -L * bend * 0.4, L * 0.9); ctx.stroke(); }
  ctx.restore();
  // 활 끝 좌표 (월드 로컬) → 시위 그리기용
  const ca = Math.cos(drawing ? aim : -0.9), sa = Math.sin(drawing ? aim : -0.9);
  const x1 = -L * bend * 0.5, y1 = -L, y2 = L;
  e._bowHand = [hx + x1 * ca - y1 * sa, hy + x1 * sa + y1 * ca, hx + x1 * ca - y2 * sa, hy + x1 * sa + y2 * ca];
  if (!drawing && !FL) { ctx.strokeStyle = 'rgba(230,220,200,0.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(e._bowHand[0], e._bowHand[1]); ctx.lineTo(e._bowHand[2], e._bowHand[3]); ctx.stroke(); }
}

function drawFoot(ctx, x, y, col, s, armor) {
  ctx.beginPath();
  ctx.moveTo(x - 2.5 * s, y - 1.5 * s); ctx.lineTo(x + 6.5 * s, y + 0.5 * s); ctx.lineTo(x + 6 * s, y + 2 * s); ctx.lineTo(x - 3 * s, y + 2 * s); ctx.closePath();
  ink(ctx, C(armor ? '#3a3440' : col), 1.6);
}
function drawLoincloth(ctx, x, y, col, t, walking, s) {
  const sway = Math.sin(t * (walking ? 9 : 2.5)) * (walking ? 3 : 1.2);
  ctx.beginPath();
  ctx.moveTo(x - 6 * s, y - 3);
  ctx.lineTo(x + 7 * s, y - 3);
  ctx.lineTo(x + 6 * s + sway * 0.5, y + 10 * s);
  ctx.lineTo(x + 3 * s + sway, y + 8 * s); ctx.lineTo(x + 1 * s + sway, y + 14 * s); ctx.lineTo(x - 1 * s + sway * 0.8, y + 9 * s);
  ctx.lineTo(x - 4 * s + sway * 0.6, y + 12 * s); ctx.lineTo(x - 6 * s + sway * 0.3, y + 6 * s);
  ctx.closePath();
  ink(ctx, cyl(ctx, 'loin', -6, 7, col, 0, 0), 1.6);
  ctx.fillStyle = C(dk(col, -0.35)); ctx.fillRect(x - 6.5 * s, y - 4, 14 * s, 2.6);
}
function drawCape(ctx, e, x, y, len, col, walking) {
  const t = e.t;
  const fl = Math.sin(t * (walking ? 8 : 2.2)) * (walking ? 5 : 2) + (walking ? -6 : 0) + Math.min(0, -Math.abs(e.vx ?? 0) * 0.03);
  ctx.beginPath();
  ctx.moveTo(x + 3, y - 1);
  ctx.quadraticCurveTo(x - 8 + fl * 0.3, y + len * 0.5, x - 10 + fl, y + len);
  ctx.lineTo(x - 6 + fl, y + len - 4); ctx.lineTo(x - 2 + fl * 0.8, y + len + 1); ctx.lineTo(x + 2 + fl * 0.6, y + len - 5); ctx.lineTo(x + 5 + fl * 0.4, y + len - 1);
  ctx.quadraticCurveTo(x + 4, y + len * 0.5, x + 6, y - 1);
  ctx.closePath();
  ink(ctx, cyl(ctx, 'cape', -14, 8, col, 0, 0), 1.8);
}
function drawRobe(ctx, e, nX, nY, hipY, robe, s, walking) {
  // 로브 뒷자락
  const t = e.t, sw = Math.sin(t * (walking ? 9 : 2)) * (walking ? 3 : 1);
  ctx.beginPath();
  ctx.moveTo(nX - 6 * s, nY + 2);
  ctx.quadraticCurveTo(-14 * s, hipY + 10, -13 * s + sw, -1);
  ctx.lineTo(10 * s + sw, -1);
  ctx.quadraticCurveTo(12 * s, hipY + 6, nX + 8 * s, nY + 2);
  ctx.closePath();
  ink(ctx, cyl(ctx, 'robeB' + s, -14, 12, dk(robe.c, -0.25)), 2);
}
function drawRobeFront(ctx, e, nX, nY, hipY, robe, s) {
  const t = e.t, walking = e.anim === 'walk', sw = Math.sin(t * (walking ? 9 : 2)) * (walking ? 3.5 : 1);
  ctx.beginPath();
  ctx.moveTo(nX - 6 * s, nY);
  ctx.lineTo(nX + 7 * s, nY);
  ctx.quadraticCurveTo(nX + 10 * s, hipY, 11 * s + sw, -3);
  ctx.lineTo(6 * s + sw, -1); ctx.lineTo(3 * s + sw, -4); ctx.lineTo(-1 * s + sw, 0); ctx.lineTo(-5 * s + sw, -3); ctx.lineTo(-10 * s + sw * 0.6, -1);
  ctx.quadraticCurveTo(-9 * s, hipY, nX - 6 * s, nY);
  ctx.closePath();
  ink(ctx, cyl(ctx, 'robeF' + s, -11, 12, robe.c), 2);
  if (!FL) {
    // 금실 장식 + 룬
    ctx.strokeStyle = robe.t; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(nX + 2 * s, nY + 1); ctx.quadraticCurveTo(nX + 4 * s, hipY, 4 * s + sw, -3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9 * s + sw * 0.6, -4); ctx.lineTo(10 * s + sw, -6); ctx.stroke();
    const g = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.fillStyle = `rgba(200,150,255,${0.35 + g * 0.4})`;
    for (let i = 0; i < 3; i++) { const yy = hipY + 6 + i * 9 * s; ctx.fillRect(nX + 5 * s + i, yy, 2, 4); ctx.fillRect(nX + 4 * s + i, yy + 1, 4, 1.2); }
    // 허리끈
    ctx.fillStyle = dk(robe.c, -0.5); ctx.fillRect(-8 * s, hipY - 2, 17 * s, 3);
  }
}
function drawHelm(ctx, kind, r, t, e) {
  if (kind === 'hood' || kind === 'mage') {
    const col = kind === 'mage' ? '#3a1e5a' : '#3a3a2c';
    ctx.beginPath();
    ctx.moveTo(r * 1.25, r * 0.1);
    ctx.bezierCurveTo(r * 1.3, -r * 1.6, -r * 1.2, -r * 1.9, -r * 1.35, -r * 0.2);
    ctx.lineTo(-r * 1.9, r * (kind === 'mage' ? 2.3 : 1.6));
    ctx.lineTo(-r * 0.4, r * 1.2);
    ctx.quadraticCurveTo(-r * 1.0, -r * 0.2, -r * 0.1, -r * 1.05);
    ctx.quadraticCurveTo(r * 0.9, -r * 1.05, r * 1.25, r * 0.1);
    ctx.closePath();
    ink(ctx, cyl(ctx, 'hood' + kind + r, -r * 1.9, r * 1.3, col, 0, 0), 1.8);
    if (kind === 'mage') {
      // 뾰족 두건 끝
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 1.3); ctx.quadraticCurveTo(-r * 1.8, -r * 1.9, -r * 2.6, -r * 1.1 + Math.sin(t * 3) * 1.5); ctx.quadraticCurveTo(-r * 1.6, -r * 1.3, -r * 1.1, -r * 0.6); ctx.closePath();
      ink(ctx, C(dk(col, -0.2)), 1.6);
      if (!FL) { ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(r * 1.2, r * 0.05); ctx.bezierCurveTo(r * 1.2, -r * 1.4, -r * 1.0, -r * 1.7, -r * 1.3, -r * 0.2); ctx.stroke(); }
    }
  } else if (kind === 'horned') {
    // 녹슨 투구 + 뿔
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, r * 0.1); ctx.bezierCurveTo(-r * 1.2, -r * 1.5, r * 1.0, -r * 1.55, r * 1.15, -r * 0.3); ctx.lineTo(r * 1.15, -r * 0.05); ctx.lineTo(-r * 1.1, r * 0.1);
    ctx.closePath();
    ink(ctx, sph(ctx, 'helmH', 0, -r * 0.5, r * 1.3, '#4a4652'), 1.8);
    if (!FL) { ctx.fillStyle = '#7a5a2a'; ctx.fillRect(-r * 1.1, -r * 0.25, r * 2.25, r * 0.22); }
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      const bx = sgn > 0 ? r * 0.55 : -r * 0.6;
      ctx.moveTo(bx - r * 0.25, -r * 1.0); ctx.quadraticCurveTo(bx + sgn * r * 0.4, -r * 2.2, bx + sgn * r * 1.2, -r * 2.4); ctx.quadraticCurveTo(bx + sgn * r * 0.2, -r * 1.7, bx + r * 0.3, -r * 0.95); ctx.closePath();
      ink(ctx, C(sgn > 0 ? '#d8ccb0' : '#9a8e76'), 1.5);
    }
  } else if (kind === 'turban') {
    ctx.beginPath(); ctx.ellipse(-r * 0.1, -r * 0.7, r * 1.25, r * 0.75, -0.1, 0, TAU);
    ink(ctx, sph(ctx, 'turb', -r * 0.1, -r * 0.7, r * 1.25, '#c8b890'), 1.8);
    if (!FL) {
      ctx.strokeStyle = '#8a7a58'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-r * 0.1, -r * 0.8 + i * r * 0.25, r * 1.1, r * 0.35, -0.15, PI * 1.05, PI * 1.95); ctx.stroke(); }
      ctx.fillStyle = '#c02a2a'; ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.95, r * 0.25, 0, TAU); ctx.fill();
      glow(ctx, r * 0.6, -r * 0.95, r * 0.8, '#ff4040', 0.4);
      // 꼬리 천
      ctx.fillStyle = '#b0a078';
      const fl = Math.sin(t * 4) * 2;
      ctx.beginPath(); ctx.moveTo(-r * 1.2, -r * 0.5); ctx.quadraticCurveTo(-r * 2, r * 0.5, -r * 2.2 + fl, r * 1.5); ctx.lineTo(-r * 1.6 + fl, r * 1.4); ctx.quadraticCurveTo(-r * 1.3, r * 0.3, -r * 0.8, -r * 0.2); ctx.closePath(); ctx.fill();
    }
  }
}
function drawBreastplate(ctx, T, kind, s) {
  const col = kind === 'dark' ? '#4a4450' : '#8a92a8';
  ctx.beginPath();
  ctx.moveTo(-6 * s, -T + 1); ctx.lineTo(8 * s, -T + 1); ctx.quadraticCurveTo(11 * s, -T * 0.6, 7 * s, -T * 0.3); ctx.lineTo(-5 * s, -T * 0.3); ctx.quadraticCurveTo(-8 * s, -T * 0.6, -6 * s, -T + 1);
  ctx.closePath();
  ink(ctx, cyl(ctx, 'bp' + kind + T, -8, 11, col), 2);
  if (!FL) {
    ctx.strokeStyle = kind === 'dark' ? '#8a6a2a' : '#c8a040'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-5 * s, -T * 0.3 - 1); ctx.lineTo(7 * s, -T * 0.3 - 1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(5 * s, -T + 3); ctx.quadraticCurveTo(8 * s, -T * 0.65, 5 * s, -T * 0.38); ctx.stroke();
    // 갈비뼈가 보이는 파손
    ctx.fillStyle = '#1a0c10'; ctx.beginPath(); ctx.moveTo(-2, -T * 0.55); ctx.lineTo(2, -T * 0.62); ctx.lineTo(1, -T * 0.45); ctx.closePath(); ctx.fill();
  }
}
function drawPauldron(ctx, x, y, kind, s) {
  const col = kind === 'dark' ? '#4a4450' : '#8a92a8';
  ctx.beginPath(); ctx.ellipse(x, y + 1, 7.5 * s, 5.5 * s, -0.2, PI * 0.95, PI * 2.1); ctx.closePath();
  ink(ctx, sph(ctx, 'pld' + kind + s, 0, 0, 7 * s, col), 1.8);
  if (!FL) {
    ctx.strokeStyle = kind === 'dark' ? '#8a6a2a' : '#c8a040'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y + 1, 7.5 * s, 5.5 * s, -0.2, PI * 1.05, PI * 2.0); ctx.stroke();
    // 가시
    ctx.fillStyle = '#b8b0a0'; ctx.beginPath(); ctx.moveTo(x - 2, y - 4 * s); ctx.lineTo(x - 1, y - 10 * s); ctx.lineTo(x + 2, y - 4.5 * s); ctx.closePath(); ctx.fill();
  }
}
function drawGreave(ctx, kx, ky, ax, ay, kind, s) {
  const col = kind === 'dark' ? '#4a4450' : '#8a92a8';
  limb(ctx, lerp(kx, ax, 0.15), lerp(ky, ay, 0.15), lerp(kx, ax, 0.85), lerp(ky, ay, 0.85), 3.6 * s, 3 * s, col);
  ctx.beginPath(); ctx.arc(kx, ky, 3.6 * s, 0, TAU); ink(ctx, C(lt(col, 0.1)), 1.4);
}
function drawRoundShield(ctx, x, y, sh, s) {
  ctx.beginPath(); ctx.arc(x - 1, y - 2, 9 * s, 0, TAU);
  ink(ctx, sph(ctx, 'rsh' + sh.c + s, 0, 0, 9 * s, sh.c), 2);
  if (!FL) {
    ctx.strokeStyle = sh.t; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x - 1, y - 2, 7 * s, 0, TAU); ctx.stroke();
    ctx.fillStyle = sh.t; ctx.beginPath(); ctx.arc(x - 1, y - 2, 2.2 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x - 2, y - 1); ctx.lineTo(x - 4, y + 4); ctx.stroke();
  }
}

// ───────────────────────── 해골 계열 ─────────────────────────
RENDER_A.skeleton = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 15);
  drawSkel(ctx, e, { H: 80, wpn: 'sword', cloth: '#6a1e24', shield: { c: '#5a3a22', t: '#9a8a6a' }, pose: 'overhead' });
  FL = false;
};
RENDER_A.bone_thrower = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 15);
  drawSkel(ctx, e, { H: 80, wpn: 'bone', cloth: '#3a4a2a', pose: 'throw', bone: '#dcd2b6', eye: '#ffb030', helm: null, teleColor: '#ffd080' });
  // 허리의 뼈 자루
  if (!FL) {
    ctx.save(); ctx.translate(-9, -36);
    ctx.beginPath(); ctx.ellipse(0, 0, 6, 8, 0.2, 0, TAU); ink(ctx, cyl(ctx, 'sack', -6, 6, '#6a5238'), 1.6);
    boneSeg(ctx, -2, -8, 2, -13, 2, '#e6dcc2'); boneSeg(ctx, 2, -7, 6, -12, 2, '#d6ccb2');
    ctx.restore();
  }
  FL = false;
};
RENDER_A.skeleton_archer = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 15);
  drawSkel(ctx, e, { H: 80, wpn: 'none', cloth: '#2e3a2a', pose: 'bow', helm: 'hood', quiver: true, eye: '#ff5a2a', teleColor: '#ffe0a0' });
  FL = false;
};
RENDER_A.bone_scimitar = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 15);
  drawSkel(ctx, e, { H: 80, wpn: 'scim', cloth: '#8a1a1a', pose: 'dual', helm: 'turban', bone: '#e0d0b0', eye: '#ffcc40', stride: 11, trailColor: '#ffe0a0' });
  // 붉은 허리띠 매듭
  if (!FL) {
    const bob = e.anim === 'walk' ? -Math.abs(Math.cos(e.t * 11)) * 1.8 : 0;
    ctx.fillStyle = '#b02020';
    ctx.beginPath(); ctx.moveTo(-6, -44 + bob); ctx.quadraticCurveTo(-12, -36 + bob, -10 + Math.sin(e.t * 6) * 2, -28 + bob); ctx.lineTo(-7, -30 + bob); ctx.quadraticCurveTo(-8, -38 + bob, -3, -43 + bob); ctx.fill();
  }
  FL = false;
};
RENDER_A.skeleton_mage = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 16);
  // 시전 마법진 (발밑)
  if (e.anim === 'cast' && !FL) {
    const k = clamp(e.animT / (e.params?.cast ?? 0.8), 0, 1);
    drawRuneCircle(ctx, 0, -2, 30 * ease.outCubic(k), e.t, '#c07cff', 0.9 * k, true);
  }
  drawSkel(ctx, e, { H: 84, wpn: 'staff', pose: 'cast', helm: 'mage', robe: { c: '#3a1e5a', t: '#c8a040' }, eye: '#d080ff', gem: '#c070ff', bone: '#d8d0bc', teleColor: '#e0b0ff' });
  FL = false;
};
RENDER_A.skeleton_knight = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 18);
  drawSkel(ctx, e, { H: 88, wpn: 'sword', bladeLen: 36, steel: '#8a8c98', rust: false, cloth: '#4a0e18', helm: 'horned', armor: 'dark', cape: '#5a0a18', pose: 'overhead', eye: '#ff3a2a', bone: '#d8ccb0', trailColor: '#ffb0a0' });
  // 연 모양 방패 (앞쪽, 몸을 가림)
  drawKiteShield(ctx, e, 88 / 80, '#3a3040', '#8a6a2a', '#7a0e1a');
  FL = false;
};
RENDER_A.blood_skeleton = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const st = e.state, bone = '#c8544a';
  if (st === 'collapse' || st === 'pile' || st === 'reform') {
    shadow(ctx, 18);
    const T = e.params?.revive ?? 3.2;
    let k = 0; // 0 = 무더기, 1 = 서 있음
    if (st === 'collapse') k = 1 - ease.outCubic(clamp(e.stateT / 0.35, 0, 1));
    else if (st === 'reform') k = ease.inOutCubic(clamp(e.stateT / 0.7, 0, 1));
    const shake = st === 'pile' && e.stateT > T - 0.8 ? Math.sin(e.t * 50) * 1.5 : st === 'reform' ? Math.sin(e.t * 40) * (1 - k) * 2 : 0;
    drawBonePile(ctx, bone, 1 - k, shake, e);
    if (k > 0.02) {
      ctx.save(); ctx.scale(1, Math.max(0.05, k)); ctx.globalAlpha *= clamp(k * 1.5, 0, 1);
      drawSkel(ctx, e, { H: 80, wpn: 'club', pose: 'overhead', bone, eye: '#ffd040', blood: true, cloth: '#3a0a10' });
      ctx.restore();
    }
    if (st === 'pile' || st === 'reform') {
      // 부활 경고: 붉은 맥동
      const pulse = st === 'reform' ? 1 : clamp((e.stateT - (T - 1.2)) / 1.2, 0, 1);
      if (pulse > 0) glow(ctx, 0, -10, 40 + 10 * Math.sin(e.t * 18), '#ff2030', pulse * 0.8);
    }
  } else {
    shadow(ctx, 15);
    drawSkel(ctx, e, { H: 80, wpn: 'club', pose: 'overhead', bone, eye: '#ffd040', blood: true, cloth: '#3a0a10', trailColor: '#ff5a4a', teleColor: '#ff8070' });
    drawBloodDrips(ctx, e);
  }
  FL = false;
};
function drawBloodDrips(ctx, e) {
  if (FL) return;
  ctx.fillStyle = '#b01020';
  for (let i = 0; i < 3; i++) {
    const ph = (e.t * 0.9 + i * 0.37) % 1;
    const x = -3 + i * 4, y0 = -58 + i * 6;
    const y = y0 + ph * ph * 60;
    if (y > -1) continue;
    ctx.globalAlpha *= 1;
    ctx.beginPath(); ctx.ellipse(x, y, 1.1, 1.8 + ph * 1.5, 0, 0, TAU); ctx.fill();
  }
}
function drawBonePile(ctx, bone, spread, shake, e) {
  // 무너진 뼈 무더기 (spread 0→1 로 흩어짐)
  const b2 = dk(bone, -0.25);
  ctx.save(); ctx.translate(shake, 0);
  const A = [[-14, -3, -6, -5], [-4, -2, 10, -6], [2, -8, 16, -3], [-12, -9, 2, -12], [-8, -14, 6, -10], [8, -12, 14, -18]];
  for (let i = 0; i < A.length; i++) {
    const a = A[i], k = spread;
    boneSeg(ctx, a[0] * k, a[1] * k - (1 - k) * i * 6, a[2] * k, a[3] * k - (1 - k) * i * 6, 3, i % 2 ? bone : b2);
  }
  // 두개골
  ctx.save(); ctx.translate(-2 + 6 * spread, -16 * spread - 8 * (1 - spread) - 4); ctx.rotate(0.5 * spread);
  drawSkull(ctx, 6.5, bone, '#ffd040', 0.3, { crack: true });
  ctx.restore();
  ctx.restore();
}
function drawKiteShield(ctx, e, s, col, trim, emblem) {
  const hurt = hurtOf(e);
  const attacking = e.anim === 'attack';
  const P = e.params || {};
  const ap = attacking ? atkPhase(e.animT, P.windup ?? 0.5, 0.09) : null;
  const walking = e.anim === 'walk';
  const bob = walking ? -Math.abs(Math.cos(e.t * 9)) * 1.8 : Math.sin(e.t * 2.6) * 0.7;
  let x = 12 * s, y = -46 * s + bob, rot = 0.05;
  if (ap) { x -= 6 * ap.w - 2 * ap.s; rot = -0.2 * ap.w + 0.25 * ap.s; }
  if (hurt) { x -= 3; rot = -0.3; }
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  // 팔 (방패 뒤)
  ctx.beginPath();
  ctx.moveTo(-8 * s, -18 * s); ctx.lineTo(8 * s, -18 * s); ctx.quadraticCurveTo(9 * s, 6 * s, 0, 22 * s); ctx.quadraticCurveTo(-9 * s, 6 * s, -8 * s, -18 * s);
  ctx.closePath();
  ink(ctx, cyl(ctx, 'kite' + col + s, -9 * s, 9 * s, col, 0, 0), 2.2);
  if (!FL) {
    ctx.strokeStyle = trim; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-6.5 * s, -16.5 * s); ctx.lineTo(6.5 * s, -16.5 * s); ctx.quadraticCurveTo(7.5 * s, 5 * s, 0, 19.5 * s); ctx.quadraticCurveTo(-7.5 * s, 5 * s, -6.5 * s, -16.5 * s); ctx.stroke();
    // 문장: 뒤집힌 십자 / 박쥐
    ctx.fillStyle = emblem;
    ctx.fillRect(-1.2 * s, -10 * s, 2.4 * s, 20 * s); ctx.fillRect(-5 * s, 2 * s, 10 * s, 2.4 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.moveTo(3 * s, -16 * s); ctx.lineTo(6 * s, -16 * s); ctx.quadraticCurveTo(6.5 * s, 0, 2 * s, 14 * s); ctx.quadraticCurveTo(4 * s, 0, 3 * s, -16 * s); ctx.fill();
  }
  ctx.restore();
}
/** 룬 마법진 (바닥 원근 타원) */
function drawRuneCircle(ctx, x, y, r, t, color, a, flat = true) {
  if (r < 2 || a <= 0.02) return;
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a;
  ctx.globalCompositeOperation = 'lighter';
  ctx.save(); ctx.translate(x, y); if (flat) ctx.scale(1, 0.32);
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.stroke();
  ctx.rotate(t * 1.5);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a0 = (i / 6) * TAU, a1 = ((i + 2) / 6) * TAU; ctx.moveTo(Math.cos(a0) * r * 0.78, Math.sin(a0) * r * 0.78); ctx.lineTo(Math.cos(a1) * r * 0.78, Math.sin(a1) * r * 0.78); }
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) { const a0 = (i / 8) * TAU; ctx.fillRect(Math.cos(a0) * r * 0.89 - 1.5, Math.sin(a0) * r * 0.89 - 1.5, 3, 3); }
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = ga;
}

// ───────────────────────── 갑주 리그 (방패 갑옷/도끼 갑옷/창병) ─────────────────────────
// o: { H, steel, trim, glowEye, pose:'overhead'|'axe'|'thrust', helm:'great'|'horned'|'plume', tabard, cape }
function drawArmor(ctx, e, o) {
  const H = o.H ?? 88, s = H / 88;
  const steel = o.steel ?? '#7c86a0', trim = o.trim ?? '#c8a040', joint = '#221e2a';
  const steelB = dk(steel, -0.3);
  const t = e.t, at = e.animT, anim = e.anim, P = e.params || {};
  const hurt = hurtOf(e);
  const walking = anim === 'walk';
  const ph = t * (o.stride ?? 6.5);
  const sw = walking ? Math.sin(ph) : 0, cw = walking ? Math.cos(ph) : 0;
  const br = Math.sin(t * 2);
  let bob = walking ? -Math.abs(cw) * 2.2 : br * 0.5;
  let lean = walking ? 0.06 : 0.02;
  let hipF = walking ? sw * 0.42 : 0.18, hipB = walking ? -sw * 0.42 : -0.16;
  let knF = walking ? -Math.max(0, cw) * 0.8 - 0.05 : -0.1, knB = walking ? -Math.max(0, -cw) * 0.8 - 0.05 : -0.05;
  let shF = walking ? -sw * 0.3 + 0.3 : 0.3, elF = 0.6;
  let shB = walking ? sw * 0.3 + 0.2 : 0.2, elB = 0.5;
  let wA = 2.2, trail = null, tele = 0, stepX = 0, visorFlare = 0;
  let hold = true; // 손에 무기
  if (o.pose === 'overhead' && anim === 'attack') {
    const ap = atkPhase(at, P.windup ?? 0.6, 0.1);
    const kw = ease.outCubic(ap.w), ks = ease.outCubic(ap.s);
    if (ap.s <= 0) { shB = lerp(0.2, 3.5, kw); elB = lerp(0.5, 0.7, kw); wA = lerp(2.2, 4.1, kw); lean = lerp(0.02, -0.1, kw); tele = ap.w; }
    else { shB = lerp(3.5, 1.0, ks); elB = lerp(0.7, 0.15, ks); wA = lerp(4.1, 1.35, ks); lean = lerp(-0.1, 0.25, ks); stepX = 5 * ks; trail = [4.1, wA, clamp(1 - ap.after / 0.25, 0, 1)]; }
    hipF = lerp(hipF, 0.5, ap.s); knF = lerp(knF, -0.45, ap.s); hipB = lerp(hipB, -0.3, ap.s);
    visorFlare = kw;
  } else if (o.pose === 'axe') {
    if (anim === 'throw') {
      const ap = atkPhase(at, P.windup ?? 0.55, 0.1);
      const kw = ease.outCubic(ap.w), ks = ease.outCubic(ap.s);
      const high = !!e.high;
      if (high) {
        if (ap.s <= 0) { shB = lerp(0.2, 3.6, kw); elB = lerp(0.5, 0.5, kw); wA = lerp(2.2, 4.3, kw); lean = -0.12 * kw; }
        else { shB = lerp(3.6, 1.55, ks); elB = 0.1; wA = lerp(4.3, 1.6, ks); lean = -0.12 + 0.3 * ks; hold = false; }
      } else {
        if (ap.s <= 0) { shB = lerp(0.2, -1.3, kw); elB = lerp(0.5, 0.3, kw); wA = lerp(2.2, -0.2, kw); lean = 0.25 * kw; hipF = lerp(hipF, 0.7, kw); knF = lerp(knF, -1.0, kw); hipB = lerp(hipB, -0.5, kw); knB = lerp(knB, -0.6, kw); bob += 7 * kw; }
        else { shB = lerp(-1.3, 1.5, ks); elB = 0.1; wA = lerp(-0.2, 1.6, ks); lean = 0.25; hipF = 0.7; knF = -1.0; hipB = -0.5; knB = -0.6; bob += 7; hold = false; }
      }
      if (ap.s > 0) trail = [high ? 4.3 : -0.2, wA, clamp(1 - ap.after / 0.2, 0, 1) * 0.8];
      tele = ap.w;
      visorFlare = kw;
    }
    if (e.axeOut && anim !== 'throw') { hold = false; shB = 0.9; elB = 0.3; }
  } else if (o.pose === 'thrust') {
    if (anim === 'thrust') {
      const ap = atkPhase(at, P.windup ?? 0.55, 0.08);
      const kw = ease.outCubic(ap.w), ks = ease.outBack(ap.s);
      const high = e.high !== false;
      const aim = high ? 0.12 : -0.35; // + = 위로
      if (ap.s <= 0) { shB = lerp(0.3, 0.9, kw); elB = lerp(0.6, 1.2, kw); shF = lerp(0.3, 0.8, kw); elF = lerp(0.6, 1.0, kw); lean = lerp(0.02, -0.15, kw); stepX = -5 * kw; }
      else { shB = lerp(0.9, 1.45, ks); elB = lerp(1.2, 0.1, ks); shF = lerp(0.8, 1.3, ks); elF = lerp(1.0, 0.3, ks); lean = lerp(-0.15, 0.2, ks); stepX = lerp(-5, 10, ks); hipF = 0.6; knF = -0.3; hipB = -0.45; }
      if (!high) { bob += 8 * kw; hipF = lerp(hipF, 0.9, kw); knF = lerp(knF, -1.3, kw); hipB = lerp(hipB, -0.6, kw); knB = lerp(knB, -0.9, kw); }
      wA = HP - aim; // 창 방향 (수평 기준)
      tele = ap.w;
      visorFlare = kw;
      e._spearPush = ap.s > 0 ? 1 : 0;
    } else { wA = PI - 0.25; e._spearPush = 0; }
  }
  if (hurt) { lean = -0.2; }
  lean += deathK(e) * 0.5;

  const hipY = -42 * s + bob, thigh = 20 * s, shin = 20 * s, T = 27 * s, ua = 15 * s, fa = 14 * s;
  ctx.translate(stepX, 0);
  const nX = Math.sin(lean) * T, nY = hipY - Math.cos(lean) * T;
  if (o.cape) drawCape(ctx, e, nX - 4, nY + 3, 52 * s, o.cape, walking);
  // 뒤팔 (무기 팔 — 몸 뒤쪽)
  const shX = nX - 3 * s, shY = nY + 3 * s;
  end(shX, shY, shB, ua); const bex = EX, bey = EY;
  end(bex, bey, shB + elB, fa); const bhx = EX, bhy = EY;
  const armBehind = o.pose !== 'thrust';
  // 뒤다리
  end(-2, hipY, hipB, thigh); let kx = EX, ky = EY; end(kx, ky, hipB + knB, shin); let ax = EX, ay = EY;
  limb(ctx, -2, hipY, kx, ky, 5 * s, 4.2 * s, steelB);
  limb(ctx, kx, ky, ax, ay, 4.4 * s, 3.8 * s, steelB);
  armorFoot(ctx, ax, ay, steelB, s);
  if (armBehind) drawArmorArm(ctx, shX, shY, bex, bey, bhx, bhy, steelB, trim, s);
  // 몸통
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean);
  // 허리 사슬
  ctx.beginPath(); ctx.rect(-8 * s, -8 * s, 16 * s, 10 * s); ink(ctx, C(joint), 1.6);
  if (!FL) { ctx.fillStyle = '#4a4656'; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) ctx.fillRect(-7 * s + i * 4 * s, -6 * s + j * 4 * s, 2.4, 2.4); }
  // 흉갑
  ctx.beginPath();
  ctx.moveTo(-9 * s, -T); ctx.lineTo(9 * s, -T);
  ctx.bezierCurveTo(14 * s, -T * 0.72, 12 * s, -T * 0.32, 8 * s, -T * 0.22);
  ctx.lineTo(-8 * s, -T * 0.22);
  ctx.bezierCurveTo(-11 * s, -T * 0.4, -12 * s, -T * 0.8, -9 * s, -T);
  ctx.closePath();
  ink(ctx, cyl(ctx, 'arm_bp' + s, -12 * s, 14 * s, steel), 2.2);
  if (!FL) {
    ctx.strokeStyle = trim; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8 * s, -T * 0.25); ctx.lineTo(8 * s, -T * 0.25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3 * s, -T + 1); ctx.quadraticCurveTo(6 * s, -T * 0.6, 3 * s, -T * 0.28); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(8 * s, -T + 3); ctx.quadraticCurveTo(12 * s, -T * 0.62, 8 * s, -T * 0.34); ctx.stroke();
  }
  // 타바드 (천)
  if (o.tabard) {
    const fl = Math.sin(t * (walking ? 7 : 2)) * (walking ? 2.5 : 1);
    ctx.beginPath(); ctx.moveTo(-3 * s, -T * 0.6); ctx.lineTo(8 * s, -T * 0.6); ctx.lineTo(9 * s + fl, 12 * s); ctx.lineTo(4 * s + fl, 9 * s); ctx.lineTo(-1 * s + fl, 12 * s); ctx.closePath();
    ink(ctx, cyl(ctx, 'tab' + o.tabard + s, -3 * s, 9 * s, o.tabard), 1.6);
    if (!FL) { ctx.fillStyle = trim; ctx.fillRect(2 * s, -T * 0.45, 2 * s, 12 * s); ctx.fillRect(-0.5 * s, -T * 0.38, 7 * s, 2 * s); }
  }
  ctx.restore();
  // 허벅지 갑주 (태싯)
  for (let i = 0; i < 2; i++) {
    const x0 = -8 * s + i * 9 * s, sway = walking ? Math.sin(ph + i) * 1.5 : 0;
    ctx.beginPath(); ctx.moveTo(x0, hipY - 2); ctx.lineTo(x0 + 9 * s, hipY - 2); ctx.lineTo(x0 + 9.5 * s + sway, hipY + 9 * s); ctx.lineTo(x0 - 0.5 * s + sway, hipY + 8 * s); ctx.closePath();
    ink(ctx, cyl(ctx, 'tas' + s + i, x0, x0 + 10 * s, i ? steel : steelB), 1.6);
  }
  // 앞다리
  end(2, hipY, hipF, thigh); kx = EX; ky = EY; end(kx, ky, hipF + knF, shin); ax = EX; ay = EY;
  limb(ctx, 2, hipY, kx, ky, 5.2 * s, 4.4 * s, steel);
  limb(ctx, kx, ky, ax, ay, 4.6 * s, 4 * s, steel);
  ctx.beginPath(); ctx.arc(kx, ky, 4.4 * s, 0, TAU); ink(ctx, sph(ctx, 'knee' + s, 0, 0, 4 * s, steel), 1.4);
  if (!FL) { ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(kx + 1, ky, 1.4, 0, TAU); ctx.fill(); }
  armorFoot(ctx, ax, ay, steel, s);
  // 투구
  const hx = nX + Math.sin(lean) * 8 * s + 1, hy = nY - 8 * s;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(lean * 0.5 + (hurt ? -0.2 : 0));
  drawGreatHelm(ctx, 9 * s, steel, trim, o.helm, e, visorFlare, o.eye ?? '#ff3020');
  ctx.restore();
  // 견갑
  drawBigPauldron(ctx, nX + 1 * s, nY + 2 * s, steel, trim, s, o.helm === 'horned');
  // 앞팔
  const fx = nX + 3 * s, fy = nY + 3 * s;
  end(fx, fy, shF, ua); const fex = EX, fey = EY;
  end(fex, fey, shF + elF, fa); const fhx = EX, fhy = EY;
  let tip = null;
  if (o.pose === 'thrust') {
    // 창: 양손으로 잡음 (앞손 기준)
    const thr = anim === 'thrust';
    const ang = thr ? -(HP - wA) : -1.25 + Math.sin(t * 2) * 0.02;
    ctx.save(); ctx.translate(fhx, fhy); ctx.rotate(ang);
    drawSpear(ctx, s, trim, t);
    ctx.restore();
    tip = [fhx + Math.cos(ang) * 78 * s, fhy + Math.sin(ang) * 78 * s];
    drawArmorArm(ctx, shX, shY, bex, bey, bhx, bhy, steelB, trim, s);
    drawArmorArm(ctx, fx, fy, fex, fey, fhx, fhy, steel, trim, s);
    if (thr && e._spearPush) {
      // 찌르기 잔상
      const ga = ctx.globalAlpha; ctx.globalAlpha = ga * clamp(1 - (at - (P.windup ?? 0.55)) / 0.25, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffe8c0';
      ctx.save(); ctx.translate(fhx, fhy); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(20 * s, -3); ctx.lineTo(100 * s, 0); ctx.lineTo(20 * s, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ga;
    }
  } else {
    // 뒤팔 무기 (검/도끼) — 뒤팔 위에 무기, 앞팔은 방패
    if (hold) {
      ctx.save(); ctx.translate(bhx, bhy); ctx.rotate(-wA);
      if (o.pose === 'axe') drawGreatAxe(ctx, s, trim); else drawBlade(ctx, 38 * s, 6.5 * s, '#b8c0d0', { guard: 7 * s, grip: '#2a1a14', guardCol: trim, pommel: trim });
      ctx.restore();
      const L = (o.pose === 'axe' ? 34 : 38) * s;
      tip = [bhx + Math.sin(wA) * L, bhy + Math.cos(wA) * L];
    }
    if (o.pose === 'axe') drawArmorArm(ctx, fx, fy, fex, fey, fhx, fhy, steel, trim, s);
  }
  if (trail) swingTrail(ctx, shX, shY, trail[0], trail[1], ua + fa + (o.pose === 'axe' ? 30 : 36) * s, 16 * s, o.pose === 'axe' ? '#ffd0a0' : '#dfe8ff', trail[2]);
  if (tele > 0.4 && tip) glint(ctx, tip[0], tip[1], 5 + 6 * tele, '#fff0c8', (tele - 0.4) / 0.6);
  ctx.translate(-stepX, 0);
  return { fx, fy, s };
}
function drawArmorArm(ctx, sx, sy, ex, ey, hx, hy, col, trim, s) {
  limb(ctx, sx, sy, ex, ey, 4.6 * s, 4 * s, col);
  limb(ctx, ex, ey, hx, hy, 4.4 * s, 4.2 * s, col);
  ctx.beginPath(); ctx.arc(ex, ey, 3.6 * s, 0, TAU); ink(ctx, C(dk(col, -0.15)), 1.2);
  // 건틀릿
  ctx.beginPath(); ctx.arc(hx, hy, 4 * s, 0, TAU); ink(ctx, sph(ctx, 'gaunt' + col + s, 0, 0, 4 * s, col), 1.4);
  if (!FL) { ctx.strokeStyle = trim; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(hx, hy, 4 * s, -0.5, 1.2); ctx.stroke(); }
}
function armorFoot(ctx, x, y, col, s) {
  ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 3 * s); ctx.lineTo(x + 3 * s, y - 3.5 * s); ctx.quadraticCurveTo(x + 9 * s, y - 1 * s, x + 9 * s, y + 1.5 * s); ctx.lineTo(x - 4.5 * s, y + 1.5 * s); ctx.closePath();
  ink(ctx, cyl(ctx, 'afoot' + col + s, -4 * s, 9 * s, col), 1.6);
}
function drawGreatHelm(ctx, r, steel, trim, kind, e, flare, eye) {
  // 투구 본체
  ctx.beginPath();
  ctx.moveTo(-r * 1.0, r * 1.0);
  ctx.lineTo(-r * 1.05, -r * 0.4);
  ctx.bezierCurveTo(-r * 1.0, -r * 1.35, r * 0.9, -r * 1.4, r * 1.05, -r * 0.4);
  ctx.lineTo(r * 1.15, r * 0.5); ctx.lineTo(r * 0.8, r * 1.1); ctx.closePath();
  ink(ctx, sph(ctx, 'ghelm' + steel + r, 0, -r * 0.2, r * 1.2, steel), 2);
  if (!FL) {
    ctx.strokeStyle = trim; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 1.2); ctx.quadraticCurveTo(r * 0.55, 0, r * 0.4, r * 1.0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-r * 1.02, r * 0.6); ctx.lineTo(r * 1.1, r * 0.55); ctx.stroke();
    // 숨구멍
    ctx.fillStyle = '#0c0810'; for (let i = 0; i < 3; i++) ctx.fillRect(r * 0.7, r * 0.1 + i * r * 0.2, r * 0.3, r * 0.08);
  }
  // 바이저 슬릿 + 안광
  ctx.fillStyle = C('#07040a');
  ctx.beginPath(); ctx.moveTo(-r * 0.1, -r * 0.35); ctx.lineTo(r * 1.12, -r * 0.4); ctx.lineTo(r * 1.1, -r * 0.18); ctx.lineTo(-r * 0.1, -r * 0.15); ctx.closePath(); ctx.fill();
  if (!FL) {
    const a = 0.7 + 0.3 * Math.sin(e.t * 6) + flare * 0.8;
    glow(ctx, r * 0.8, -r * 0.27, r * (0.9 + flare * 1.2), eye, 0.45 * a);
    ctx.fillStyle = eye; ctx.fillRect(r * 0.35, -r * 0.33, r * 0.5, r * 0.12);
    ctx.fillStyle = '#ffd0b0'; ctx.fillRect(r * 0.5, -r * 0.31, r * 0.2, r * 0.07);
  }
  if (kind === 'plume') {
    const fl = Math.sin(e.t * 5) * 2;
    ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 1.2); ctx.quadraticCurveTo(-r * 1.2, -r * 2.2, -r * 2.6 + fl, -r * 1.2); ctx.quadraticCurveTo(-r * 1.8 + fl, -r * 0.9, -r * 2.2 + fl, -r * 0.2); ctx.quadraticCurveTo(-r * 1.0, -r * 0.8, -r * 0.6, -r * 1.0); ctx.closePath();
    ink(ctx, cyl(ctx, 'plume' + r, -r * 2.6, 0, '#a01828'), 1.6);
  } else if (kind === 'horned') {
    // 황소 뿔 (앞쪽 뿔은 앞으로, 뒤쪽 뿔은 뒤로 휘어짐)
    for (const sg of [-1, 1]) {
      const bx = sg > 0 ? r * 0.55 : -r * 0.55;
      ctx.beginPath();
      ctx.moveTo(bx - r * 0.35, -r * 0.75);
      ctx.bezierCurveTo(bx + sg * r * 1.2, -r * 0.9, bx + sg * r * 1.6, -r * 1.6, bx + sg * r * 1.25, -r * 2.3);
      ctx.bezierCurveTo(bx + sg * r * 1.05, -r * 1.7, bx + sg * r * 0.6, -r * 1.3, bx + r * 0.3, -r * 1.15);
      ctx.closePath();
      ink(ctx, linG(ctx, 'horn' + sg + r, bx, -r, bx + sg * r * 1.5, -r * 2.2, [0, '#3a3028', 0.6, '#9a8a70', 1, '#f0e6d0']), 1.6);
    }
  } else {
    // 볏
    ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 1.0); ctx.quadraticCurveTo(0, -r * 1.75, r * 0.7, -r * 1.05); ctx.lineTo(r * 0.5, -r * 0.95); ctx.quadraticCurveTo(0, -r * 1.4, -r * 0.6, -r * 0.9); ctx.closePath();
    ink(ctx, C(trim), 1.4);
  }
}
function drawBigPauldron(ctx, x, y, steel, trim, s, spiky) {
  for (let i = 2; i >= 0; i--) {
    ctx.beginPath(); ctx.ellipse(x - i * 0.8 * s, y + i * 3.2 * s, (10 - i) * s, (6.5 - i) * s, -0.15, PI * 0.9, PI * 2.12); ctx.closePath();
    ink(ctx, sph(ctx, 'bpld' + steel + s + i, 0, 0, 9 * s, i ? dk(steel, -0.1) : steel), 1.6);
  }
  if (!FL) {
    ctx.strokeStyle = trim; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x, y, 10 * s, 6.5 * s, -0.15, PI * 1.0, PI * 2.05); ctx.stroke();
    ctx.fillStyle = trim; ctx.beginPath(); ctx.arc(x + 4 * s, y - 3 * s, 1.3, 0, TAU); ctx.fill();
    if (spiky) { ctx.fillStyle = '#d0c8b8'; for (let i = 0; i < 3; i++) { const px = x - 5 * s + i * 4 * s; ctx.beginPath(); ctx.moveTo(px - 1.5, y - 4.5 * s); ctx.lineTo(px - 0.5, y - 11 * s + i); ctx.lineTo(px + 1.5, y - 5 * s); ctx.fill(); } }
  }
}
function drawGreatAxe(ctx, s, trim) {
  ctx.beginPath(); ctx.rect(-1.8, -10 * s, 3.6, 46 * s); ink(ctx, cyl(ctx, 'axeh', -2, 2, '#4a2a18'), 1.6);
  if (!FL) { ctx.fillStyle = trim; ctx.fillRect(-2.2, 6 * s, 4.4, 2); ctx.fillRect(-2.2, 20 * s, 4.4, 2); }
  // 양날
  for (const sg of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sg * 1.5, 26 * s); ctx.quadraticCurveTo(sg * 10 * s, 20 * s, sg * 16 * s, 22 * s);
    ctx.quadraticCurveTo(sg * 19 * s, 31 * s, sg * 16 * s, 40 * s);
    ctx.quadraticCurveTo(sg * 10 * s, 41 * s, sg * 1.5, 36 * s); ctx.closePath();
    ink(ctx, linG(ctx, 'axeb' + sg + s, 0, 0, sg * 18 * s, 0, [0, '#5a5e6a', 0.6, '#a8b0c0', 0.92, '#eef2ff', 1, '#8a90a0']), 1.8);
  }
  ctx.beginPath(); ctx.moveTo(0, 36 * s); ctx.lineTo(3, 44 * s); ctx.lineTo(-3, 44 * s); ctx.closePath(); ink(ctx, C('#8a90a0'), 1.2);
}
function drawSpear(ctx, s, trim, t) {
  // 창대 (+x 방향), 원점=뒤손
  ctx.beginPath(); ctx.rect(-26 * s, -1.6, 88 * s, 3.2); ink(ctx, linG(ctx, 'shaft' + s, 0, -2, 0, 2, [0, '#8a5a30', 1, '#3a2010']), 1.4);
  if (!FL) { ctx.fillStyle = trim; ctx.fillRect(10 * s, -2, 3, 4); ctx.fillRect(34 * s, -2, 3, 4); }
  // 창날 + 도끼날 (할버드)
  ctx.beginPath(); ctx.moveTo(62 * s, -3); ctx.lineTo(78 * s, 0); ctx.lineTo(62 * s, 3); ctx.closePath();
  ink(ctx, linG(ctx, 'sph' + s, 0, -3, 0, 3, [0, '#eef2ff', 0.5, '#aab2c4', 1, '#5a5e6a']), 1.4);
  ctx.beginPath(); ctx.moveTo(56 * s, -2); ctx.quadraticCurveTo(58 * s, -12 * s, 64 * s, -13 * s); ctx.quadraticCurveTo(62 * s, -6 * s, 62 * s, -2); ctx.closePath();
  ink(ctx, C('#9aa2b4'), 1.2);
  ctx.beginPath(); ctx.moveTo(57 * s, 2); ctx.lineTo(55 * s, 7 * s); ctx.lineTo(60 * s, 2); ctx.closePath(); ink(ctx, C('#9aa2b4'), 1);
  // 술
  if (!FL) { ctx.fillStyle = '#a01828'; ctx.beginPath(); ctx.moveTo(55 * s, 2); ctx.quadraticCurveTo(52 * s, 8 * s, 50 * s + Math.sin(t * 5) * 2, 12 * s); ctx.lineTo(54 * s, 10 * s); ctx.lineTo(57 * s, 2); ctx.fill(); }
  return null;
}
function drawTowerShield(ctx, e, s) {
  const P = e.params || {};
  const hurt = hurtOf(e);
  const walking = e.anim === 'walk';
  const bob = walking ? -Math.abs(Math.cos(e.t * 6.5)) * 2.2 : Math.sin(e.t * 2) * 0.5;
  let x = 13 * s, y = -48 * s + bob, rot = 0;
  if (e.anim === 'attack') { const ap = atkPhase(e.animT, P.windup ?? 0.6, 0.1); x -= 4 * ap.w - 6 * ap.s; rot = -0.12 * ap.w + 0.1 * ap.s; }
  if (hurt) { x -= 3; rot -= 0.15; }
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const w = 11 * s, h = 26 * s;
  ctx.beginPath();
  ctx.moveTo(-w, -h); ctx.quadraticCurveTo(0, -h - 5 * s, w, -h); ctx.lineTo(w, h * 0.55); ctx.quadraticCurveTo(w * 0.8, h * 0.95, 0, h * 1.12); ctx.quadraticCurveTo(-w * 0.8, h * 0.95, -w, h * 0.55); ctx.closePath();
  ink(ctx, cyl(ctx, 'tower' + s, -w, w, '#5a1420'), 2.4);
  if (!FL) {
    // 금테 + 철판 가장자리
    ctx.strokeStyle = '#8a92a8'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-w + 1.5, -h + 1); ctx.quadraticCurveTo(0, -h - 3.5 * s, w - 1.5, -h + 1); ctx.lineTo(w - 1.5, h * 0.55); ctx.quadraticCurveTo(w * 0.78, h * 0.92, 0, h * 1.08); ctx.quadraticCurveTo(-w * 0.78, h * 0.92, -w + 1.5, h * 0.55); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 1; ctx.stroke();
    // 문장: 박쥐 날개 + 십자
    ctx.fillStyle = '#c8a040';
    ctx.fillRect(-1.3 * s, -h * 0.65, 2.6 * s, h * 1.25); ctx.fillRect(-w * 0.55, -h * 0.25, w * 1.1, 2.6 * s);
    ctx.fillStyle = '#e8c872';
    ctx.beginPath(); ctx.moveTo(0, h * 0.25); ctx.quadraticCurveTo(-w * 0.5, h * 0.05, -w * 0.75, h * 0.35); ctx.quadraticCurveTo(-w * 0.45, h * 0.3, 0, h * 0.5); ctx.quadraticCurveTo(w * 0.45, h * 0.3, w * 0.75, h * 0.35); ctx.quadraticCurveTo(w * 0.5, h * 0.05, 0, h * 0.25); ctx.fill();
    // 리벳 + 광택
    ctx.fillStyle = '#dcd4c0'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-w + 3, -h + 5 + i * h * 0.5, 1.1, 0, TAU); ctx.arc(w - 3, -h + 5 + i * h * 0.5, 1.1, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.moveTo(w * 0.35, -h + 2); ctx.lineTo(w * 0.75, -h + 2); ctx.lineTo(w * 0.75, h * 0.5); ctx.lineTo(w * 0.35, h * 0.7); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

RENDER_A.armor_knight = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 20);
  drawArmor(ctx, e, { H: 88, pose: 'overhead', helm: 'great', steel: '#7c86a0', cape: '#4a0e1a' });
  drawTowerShield(ctx, e, 1);
  FL = false;
};
RENDER_A.axe_armor = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 22);
  drawArmor(ctx, e, { H: 92, pose: 'axe', helm: 'horned', steel: '#6a6e7c', trim: '#b89040', stride: 6, eye: '#ff6020' });
  FL = false;
};
RENDER_A.spear_guard = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 19);
  drawArmor(ctx, e, { H: 90, pose: 'thrust', helm: 'plume', steel: '#8a90a4', tabard: '#7a1020', stride: 7 });
  FL = false;
};

// ───────────────────────── 인간형 리그 (구울/빙의 주민/미라/무덤지기) ─────────────────────────
function drawHead(ctx, r, skin, o, e) {
  // 두상 (측면)
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, r * 0.1);
  ctx.bezierCurveTo(-r * 1.0, -r * 1.25, r * 0.95, -r * 1.3, r * 1.0, -r * 0.2);
  ctx.lineTo(r * 1.12, r * 0.15);
  ctx.lineTo(r * 0.95, r * 0.35);
  ctx.quadraticCurveTo(r * 0.9, r * 0.95, r * 0.35, r * 1.0);
  ctx.quadraticCurveTo(-r * 0.6, r * 0.9, -r * 0.9, r * 0.1);
  ctx.closePath();
  ink(ctx, sph(ctx, 'head' + skin + r, 0, -r * 0.1, r * 1.1, skin), 2);
  if (FL) return;
  // 눈두덩 그림자 + 눈
  ctx.fillStyle = 'rgba(10,4,8,0.75)';
  ctx.beginPath(); ctx.ellipse(r * 0.55, -r * 0.2, r * 0.36, r * 0.24, 0.1, 0, TAU); ctx.fill();
  if (o.mouth !== false) {
    ctx.fillStyle = '#1a0608';
    ctx.beginPath(); ctx.moveTo(r * 0.45, r * 0.55); ctx.quadraticCurveTo(r * 0.8, r * (0.55 + (o.jaw ?? 0.1)), r * 1.0, r * 0.5); ctx.quadraticCurveTo(r * 0.8, r * 0.7 + r * (o.jaw ?? 0.1) * 2, r * 0.45, r * 0.55); ctx.fill();
  }
  eyeGlow(ctx, r * 0.62, -r * 0.2, r * 0.13, o.eye ?? '#ffcc40', o.eyeA ?? 1);
}
function drawShovel(ctx, s) {
  // 손 원점, +y 방향으로 자루
  ctx.beginPath(); ctx.rect(-1.8, -8 * s, 3.6, 50 * s); ink(ctx, cyl(ctx, 'shovH', -2, 2, '#6a4a2a'), 1.6);
  ctx.beginPath(); ctx.moveTo(-5, -8 * s); ctx.lineTo(5, -8 * s); ctx.lineTo(4, -12 * s); ctx.lineTo(-4, -12 * s); ctx.closePath(); ink(ctx, C('#4a3020'), 1.2);
  ctx.beginPath(); ctx.moveTo(-8 * s, 40 * s); ctx.lineTo(8 * s, 40 * s); ctx.lineTo(9 * s, 54 * s); ctx.quadraticCurveTo(0, 62 * s, -9 * s, 54 * s); ctx.closePath();
  ink(ctx, linG(ctx, 'shovB' + s, -9 * s, 0, 9 * s, 0, [0, '#5a5048', 0.5, '#8a8078', 0.85, '#c8c0b0', 1, '#6a6058']), 1.8);
  if (!FL) { ctx.fillStyle = 'rgba(70,40,20,0.8)'; ctx.beginPath(); ctx.moveTo(-8 * s, 52 * s); ctx.quadraticCurveTo(0, 60 * s, 8 * s, 52 * s); ctx.lineTo(8.6 * s, 55 * s); ctx.quadraticCurveTo(0, 62 * s, -8.6 * s, 55 * s); ctx.fill(); }
}
function drawLantern(ctx, x, y, t, s) {
  const sw = Math.sin(t * 3) * 0.2;
  ctx.save(); ctx.translate(x, y); ctx.rotate(sw);
  ctx.strokeStyle = C('#2a2020'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -6 * s); ctx.lineTo(0, 0); ctx.stroke();
  glow(ctx, 0, 7 * s, 26 * s * (0.9 + 0.1 * Math.sin(t * 13)), '#ffb050', 0.85);
  ctx.beginPath(); ctx.rect(-4 * s, 0, 8 * s, 12 * s); ink(ctx, C(FL ? WHITE : 'rgba(255,200,110,0.9)'), 1.6);
  if (!FL) {
    ctx.fillStyle = '#fff4c0'; ctx.beginPath(); ctx.ellipse(0, 7 * s, 1.6 * s, 3 * s, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.4; ctx.strokeRect(-4 * s, 0, 8 * s, 12 * s);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 12 * s); ctx.stroke();
    ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.moveTo(-5 * s, 0); ctx.lineTo(0, -4 * s); ctx.lineTo(5 * s, 0); ctx.fill(); ctx.fillRect(-5 * s, 12 * s, 10 * s, 2);
  }
  ctx.restore();
}
/** 땅에서 솟아오르기 (clip + 흙더미) */
function riseClip(ctx, k, H, w, t) {
  ctx.save();
  ctx.beginPath(); ctx.rect(-w * 3, -H * 2, w * 6, H * 2); ctx.clip();
  ctx.translate(Math.sin(t * 40) * (1 - k) * 1.5, H * (1 - k));
}
function dirtMound(ctx, w, k, col = '#3a2a1e') {
  if (k <= 0.01) return;
  ctx.beginPath(); ctx.ellipse(0, 0, w * (0.8 + 0.4 * k), 6 * k + 2, 0, PI, TAU);
  ink(ctx, C(col), 1.6);
  if (!FL) {
    ctx.fillStyle = lt(col, 0.2);
    for (let i = 0; i < 5; i++) { const x = (i - 2) * w * 0.35, y = -3 * k - (i % 2) * 2 * k; ctx.fillRect(x, y, 2.5, 2); }
  }
}

function drawHumanoid(ctx, e, o) {
  const H = o.H ?? 78, s = H / 78;
  const t = e.t, at = e.animT, anim = e.anim, P = e.params || {};
  const hurt = hurtOf(e);
  const walking = anim === 'walk';
  const ph = t * (o.stride ?? 6);
  const sw = walking ? Math.sin(ph) : 0, cw = walking ? Math.cos(ph) : 0;
  const br = Math.sin(t * 2.1);
  let bob = walking ? -Math.abs(cw) * 2 : br * 0.8;
  let lean = (o.hunch ?? 0.15) + (walking ? 0.05 : 0);
  let hipF = walking ? sw * 0.45 : 0.14, hipB = walking ? -sw * (o.drag ? 0.25 : 0.45) : -0.1;
  let knF = walking ? -Math.max(0, cw) * 0.85 - 0.1 : -0.15, knB = walking ? -Math.max(0, -cw) * (o.drag ? 0.2 : 0.85) - 0.1 : -0.08;
  let shF = o.reach ? 1.25 + br * 0.08 + sw * 0.15 : (walking ? -sw * 0.4 + 0.3 : 0.25), elF = o.reach ? 0.25 : 0.4;
  let shB = o.reach ? 1.05 - br * 0.06 - sw * 0.15 : (walking ? sw * 0.4 + 0.15 : 0.1), elB = o.reach ? 0.3 : 0.35;
  let headTilt = o.reach ? 0.15 + Math.sin(t * 1.7) * 0.1 : Math.sin(t * 1.3) * 0.05;
  let tele = 0, trail = null, stepX = 0, jaw = 0.1 + Math.max(0, Math.sin(t * 3)) * 0.15;
  let wA = 0;
  const pose = o.pose;
  if (anim === 'attack' && pose === 'fork') {
    const ap = atkPhase(at, P.windup ?? 0.55, 0.08);
    const kw = ease.outCubic(ap.w), ks = ease.outBack(ap.s);
    shF = ap.s <= 0 ? lerp(0.3, 0.1, kw) : lerp(0.1, 1.2, ks); elF = ap.s <= 0 ? lerp(0.4, 1.45, kw) : lerp(1.45, 0.35, ks);
    shB = ap.s <= 0 ? lerp(0.1, -0.35, kw) : lerp(-0.35, 0.7, ks); elB = ap.s <= 0 ? lerp(0.35, 1.85, kw) : lerp(1.85, 0.9, ks);
    lean = ap.s <= 0 ? lerp(lean, -0.12, kw) : lerp(-0.12, 0.3, ks);
    stepX = ap.s <= 0 ? -4 * kw : lerp(-4, 8, ks);
    tele = ap.w; jaw = 0.4 * kw;
  } else if (anim === 'attack' && pose === 'lash') {
    const ap = atkPhase(at, P.windup ?? 0.62, 0.12);
    const kw = ease.outCubic(ap.w), ks = ease.outCubic(ap.s);
    shF = ap.s <= 0 ? lerp(1.2, 3.3, kw) : lerp(3.3, 1.5, ks); elF = ap.s <= 0 ? lerp(0.2, 0.9, kw) : lerp(0.9, 0.0, ks);
    lean = ap.s <= 0 ? lerp(lean, 0.0, kw) : lerp(0, 0.3, ks);
    tele = ap.w; e._lash = ap.s > 0 ? clamp(1 - ap.after / 0.45, 0, 1) : 0;
  } else if ((anim === 'slam' || anim === 'fling') && pose === 'shovel') {
    const wu = anim === 'slam' ? (P.slamWind ?? 0.7) : (P.flingWind ?? 0.5);
    const ap = atkPhase(at, wu, 0.1);
    const kw = ease.outCubic(ap.w), ks = ease.outCubic(ap.s);
    if (anim === 'slam') {
      shB = ap.s <= 0 ? lerp(0.2, 3.5, kw) : lerp(3.5, 1.15, ks); elB = ap.s <= 0 ? lerp(0.4, 0.4, kw) : lerp(0.4, 0.1, ks);
      shF = ap.s <= 0 ? lerp(0.3, 3.2, kw) : lerp(3.2, 1.05, ks); elF = ap.s <= 0 ? 0.5 : lerp(0.5, 0.2, ks);
      wA = ap.s <= 0 ? lerp(2.3, 3.9, kw) : lerp(3.9, 1.35, ks);
      lean = ap.s <= 0 ? lerp(0.25, -0.15, kw) : lerp(-0.15, 0.55, ks);
      if (ap.s > 0) trail = [3.9, wA, clamp(1 - ap.after / 0.3, 0, 1)];
      stepX = ap.s * 6;
    } else {
      shB = ap.s <= 0 ? lerp(0.2, -0.9, kw) : lerp(-0.9, 2.4, ks); elB = 0.3;
      shF = ap.s <= 0 ? lerp(0.3, -0.6, kw) : lerp(-0.6, 2.1, ks); elF = 0.3;
      wA = ap.s <= 0 ? lerp(2.3, 0.4, kw) : lerp(0.4, 3.0, ks);
      lean = ap.s <= 0 ? lerp(0.25, 0.5, kw) : lerp(0.5, -0.1, ks);
      bob += ap.s <= 0 ? 6 * kw : 6 * (1 - ks);
      if (ap.s > 0) trail = [0.4, wA, clamp(1 - ap.after / 0.25, 0, 1) * 0.7];
    }
    tele = ap.w;
  } else if (pose === 'shovel') { wA = 0.22 + br * 0.02 + (walking ? sw * 0.08 : 0); shB = 0.55; elB = -0.1; shF = 0.6; elF = 0.1; }
  if (hurt) { lean -= 0.3; headTilt = -0.3; jaw = 0.4; }
  lean += deathK(e) * 0.5;

  const hipY = -H * 0.47 + bob, thigh = H * 0.24, shin = H * 0.24, T = H * 0.31, ua = H * 0.19, fa = H * 0.18;
  const skin = o.skin, cloth = o.cloth, pants = o.pants ?? dk(cloth, -0.3);
  const lw = o.limbW ?? 3.4;
  ctx.translate(stepX, 0);
  const nX = Math.sin(lean) * T, nY = hipY - Math.cos(lean) * T;
  if (o.coatBack) {
    // 긴 외투 뒷자락
    const fl = Math.sin(t * (walking ? 6 : 2)) * (walking ? 3 : 1);
    ctx.beginPath(); ctx.moveTo(nX - 9 * s, nY + 3); ctx.quadraticCurveTo(-16 * s, hipY, -15 * s + fl, -6 * s); ctx.lineTo(-10 * s + fl, -4 * s); ctx.lineTo(-6 * s + fl, -8 * s); ctx.lineTo(4 * s, hipY + 4); ctx.closePath();
    ink(ctx, cyl(ctx, 'coatB' + o.coatBack + s, -16 * s, 4 * s, dk(o.coatBack, -0.25)), 2);
  }
  // 뒤팔
  const shX = nX - 1.5 * s, shY = nY + 3 * s;
  end(shX, shY, shB, ua); const bex = EX, bey = EY; end(bex, bey, shB + elB, fa); const bhx = EX, bhy = EY;
  limb(ctx, shX, shY, bex, bey, lw * 1.05 * s, lw * 0.9 * s, o.sleeve ? dk(o.sleeve, -0.3) : dk(skin, -0.3));
  limb(ctx, bex, bey, bhx, bhy, lw * 0.9 * s, lw * 0.75 * s, dk(skin, -0.3));
  if (o.bandage && !FL) bandageBands(ctx, shX, shY, bhx, bhy, dk(skin, -0.45));
  // 뒤다리
  end(-1.5, hipY, hipB, thigh); let kx = EX, ky = EY; end(kx, ky, hipB + knB, shin); let ax = EX, ay = EY;
  limb(ctx, -1.5, hipY, kx, ky, lw * 1.3 * s, lw * 1.05 * s, dk(pants, -0.3));
  limb(ctx, kx, ky, ax, ay, lw * 1.05 * s, lw * 0.85 * s, o.bareLegs ? dk(skin, -0.3) : dk(pants, -0.3));
  if (o.bandage && !FL) bandageBands(ctx, -1.5, hipY, ax, ay, dk(skin, -0.45));
  humanFoot(ctx, ax, ay, o.boot ?? '#2a1e18', s, true);
  // 몸통
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean);
  ctx.beginPath();
  const bw = (o.bulk ?? 1) * s;
  ctx.moveTo(-7 * bw, 2); ctx.lineTo(-8.5 * bw, -T * 0.55); ctx.quadraticCurveTo(-9 * bw, -T - 1, -2 * bw, -T - 1);
  ctx.lineTo(6 * bw, -T - 1); ctx.quadraticCurveTo(10.5 * bw, -T * 0.8, 9 * bw, -T * 0.4); ctx.lineTo(8 * bw, 2);
  if (o.ragged) { ctx.lineTo(5 * bw, 5); ctx.lineTo(2 * bw, 1); ctx.lineTo(-1 * bw, 6); ctx.lineTo(-4 * bw, 2); }
  ctx.closePath();
  ink(ctx, cyl(ctx, 'torso' + cloth + T + bw, -9 * bw, 10.5 * bw, cloth), 2);
  if (!FL) o.torsoDetail?.(ctx, T, bw, e);
  ctx.restore();
  // 앞다리
  end(1.5, hipY, hipF, thigh); kx = EX; ky = EY; end(kx, ky, hipF + knF, shin); ax = EX; ay = EY;
  limb(ctx, 1.5, hipY, kx, ky, lw * 1.35 * s, lw * 1.1 * s, pants);
  limb(ctx, kx, ky, ax, ay, lw * 1.1 * s, lw * 0.9 * s, o.bareLegs ? skin : pants);
  if (o.bandage && !FL) bandageBands(ctx, 1.5, hipY, ax, ay, dk(skin, -0.25));
  humanFoot(ctx, ax, ay, o.boot ?? '#2a1e18', s, false);
  if (o.coatFront) {
    const fl = Math.sin(t * (walking ? 6 : 2) + 1) * (walking ? 2.5 : 0.8);
    ctx.beginPath(); ctx.moveTo(nX + 2 * s, nY + 4); ctx.quadraticCurveTo(nX + 12 * s, hipY, 11 * s + fl, -8 * s); ctx.lineTo(4 * s + fl, -6 * s); ctx.quadraticCurveTo(2 * s, hipY + 4, nX - 2 * s, nY + 6); ctx.closePath();
    ink(ctx, cyl(ctx, 'coatF' + o.coatFront + s, -2 * s, 12 * s, o.coatFront), 1.8);
    if (!FL) { ctx.fillStyle = '#c8a040'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(nX + 5 * s + i * 1.5 * s, nY + 10 * s + i * 8 * s, 1.2, 0, TAU); ctx.fill(); } }
  }
  if (o.lantern) drawLantern(ctx, 8 * s, hipY + 2, t, s);
  // 머리
  const hr = (o.headR ?? 7.5) * s;
  const hx = nX + Math.sin(lean) * hr * 1.1, hy = nY - hr * 1.05;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(headTilt + lean * 0.3);
  limb(ctx, -1, hr * 1.1, 0, hr * 0.4, 2.6 * s, 2.4 * s, dk(skin, -0.2), { flat: true });
  drawHead(ctx, hr, skin, { eye: o.eye, jaw, mouth: o.mouth, eyeA: o.eyeA }, e);
  o.headDetail?.(ctx, hr, e);
  ctx.restore();
  // 앞팔 + 무기
  const fx = nX + 2 * s, fy = nY + 3 * s;
  end(fx, fy, shF, ua); const fex = EX, fey = EY; end(fex, fey, shF + elF, fa); const fhx = EX, fhy = EY;
  let tip = null;
  if (pose === 'fork') {
    // 쇠스랑: 평소엔 비스듬히 들고, 공격 시 수평으로 찌름
    const atk = anim === 'attack';
    const ang = atk ? 0.02 : -0.55 + Math.sin(t * 2.1) * 0.03 + (walking ? Math.sin(ph) * 0.06 : 0);
    const gx = atk ? fhx - 22 * s : fhx - Math.cos(ang) * 16 * s, gy = atk ? fhy : fhy - Math.sin(ang) * 16 * s;
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang);
    ctx.beginPath(); ctx.rect(-14 * s, -1.4, 62 * s, 2.8); ink(ctx, linG(ctx, 'fork' + s, 0, -2, 0, 2, [0, '#9a7040', 1, '#4a3018']), 1.3);
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.strokeStyle = C(OUT); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(46 * s, i * 4 * s); ctx.lineTo(62 * s, i * 4.5 * s); ctx.stroke();
      ctx.strokeStyle = C('#9aa0a8'); ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.strokeStyle = C('#9aa0a8'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(46 * s, -4 * s); ctx.lineTo(46 * s, 4 * s); ctx.stroke();
    ctx.restore();
    tip = [gx + Math.cos(ang) * 62 * s, gy + Math.sin(ang) * 62 * s];
    if (anim === 'attack' && at > (P.windup ?? 0.55)) {
      const k = clamp(1 - (at - (P.windup ?? 0.55)) / 0.22, 0, 1);
      const ga = ctx.globalAlpha; ctx.globalAlpha = ga * k * 0.7; ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#e0c0ff';
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang); ctx.beginPath(); ctx.moveTo(30 * s, -6); ctx.lineTo(96 * s, 0); ctx.lineTo(30 * s, 6); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ga;
    }
  } else if (pose === 'shovel') {
    ctx.save(); ctx.translate(bhx, bhy); ctx.rotate(-wA);
    drawShovel(ctx, s);
    ctx.restore();
    tip = [bhx + Math.sin(wA) * 56 * s, bhy + Math.cos(wA) * 56 * s];
    if (trail) swingTrail(ctx, shX, shY, trail[0], trail[1], ua + fa + 50 * s, 14 * s, '#ffcf90', trail[2] * 0.85);
  }
  limb(ctx, fx, fy, fex, fey, lw * 1.1 * s, lw * 0.95 * s, o.sleeve ?? skin);
  limb(ctx, fex, fey, fhx, fhy, lw * 0.95 * s, lw * 0.8 * s, skin);
  if (o.bandage && !FL) bandageBands(ctx, fx, fy, fhx, fhy, dk(skin, -0.25));
  // 손 (갈퀴 손가락)
  if (!FL) {
    ctx.strokeStyle = o.nail ?? dk(skin, -0.2); ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    const fa2 = shF + elF;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(fhx, fhy); ctx.lineTo(fhx + Math.sin(fa2 + i * 0.35) * 5 * s, fhy + Math.cos(fa2 + i * 0.35) * 5 * s); ctx.stroke(); }
  }
  if (pose === 'lash' && e._lash > 0) drawBandageLash(ctx, fhx, fhy, e, s);
  if (tele > 0.4 && tip) glint(ctx, tip[0], tip[1], 5 + 5 * tele, o.teleColor ?? '#ffe8c0', (tele - 0.4) / 0.6);
  if (tele > 0.4 && pose === 'lash') glint(ctx, fhx, fhy, 6 + 5 * tele, '#ffe8c0', (tele - 0.4) / 0.6);
  ctx.translate(-stepX, 0);
  return { nX, nY, hipY, fhx, fhy };
}
function humanFoot(ctx, x, y, col, s, back) {
  ctx.beginPath(); ctx.moveTo(x - 3 * s, y - 3 * s); ctx.lineTo(x + 3 * s, y - 3 * s); ctx.quadraticCurveTo(x + 8 * s, y - 1 * s, x + 8 * s, y + 1.5 * s); ctx.lineTo(x - 3.5 * s, y + 1.5 * s); ctx.closePath();
  ink(ctx, C(back ? dk(col, -0.3) : col), 1.5);
}
function bandageBands(ctx, x1, y1, x2, y2, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 0.9;
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * 3.5, ny = dx / L * 3.5;
  for (let i = 1; i < 6; i++) { const k = i / 6; const x = x1 + dx * k, y = y1 + dy * k; ctx.beginPath(); ctx.moveTo(x - nx, y - ny + 1.5); ctx.lineTo(x + nx, y + ny - 1.5); ctx.stroke(); }
}
function drawBandageLash(ctx, hx, hy, e, s) {
  // 붕대 채찍: 앞으로 뻗는 물결
  const k = e._lash;
  const len = 118 * s * ease.outCubic(Math.min(1, (1 - k) * 3 + 0.2)) * (0.4 + 0.6 * k);
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? C('#d8ccae') : C(OUT); ctx.lineWidth = pass ? 3.2 : 5.4;
    ctx.beginPath(); ctx.moveTo(hx, hy);
    for (let i = 1; i <= 10; i++) { const u = i / 10; ctx.lineTo(hx + len * u, hy + Math.sin(u * 9 - e.t * 30) * 4 * u + u * 6); }
    ctx.stroke();
  }
  if (!FL) {
    ctx.strokeStyle = '#8a7a58'; ctx.lineWidth = 0.8;
    for (let i = 1; i < 10; i++) { const u = i / 10, x = hx + len * u, y = hy + Math.sin(u * 9 - e.t * 30) * 4 * u + u * 6; ctx.beginPath(); ctx.moveTo(x - 1, y - 1.6); ctx.lineTo(x + 1, y + 1.6); ctx.stroke(); }
  }
}

RENDER_A.zombie = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const rising = e.state === 'rise';
  const k = rising ? ease.outCubic(clamp(e.stateT / (e.params?.riseTime ?? 0.9), 0, 1)) : 1;
  if (!rising) shadow(ctx, 15);
  if (rising) riseClip(ctx, k, 78, 16, e.t);
  drawHumanoid(ctx, e, {
    H: 78, skin: '#7e9478', cloth: '#4a3a4a', pants: '#3a3028', sleeve: '#4a3a4a', reach: true, drag: true, hunch: 0.28, ragged: true, eye: '#ffd040',
    boot: '#2a2420', nail: '#d8d0a0',
    torsoDetail: (c, T, bw) => {
      // 찢어진 셔츠 사이 드러난 갈비
      c.fillStyle = '#5a6a52'; c.beginPath(); c.moveTo(2 * bw, -T * 0.75); c.lineTo(7 * bw, -T * 0.7); c.lineTo(6 * bw, -T * 0.35); c.lineTo(1 * bw, -T * 0.45); c.closePath(); c.fill();
      c.strokeStyle = '#2a3226'; c.lineWidth = 0.9; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(2.5 * bw, -T * 0.68 + i * 4); c.lineTo(6 * bw, -T * 0.64 + i * 4); c.stroke(); }
      c.fillStyle = '#6a0a14'; c.beginPath(); c.arc(-3 * bw, -T * 0.5, 2, 0, TAU); c.fill();
    },
    headDetail: (c, r) => {
      if (FL) return;
      // 헝클어진 머리칼 + 상처
      c.strokeStyle = '#2a2a22'; c.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-r * 0.6 + i * r * 0.3, -r * 0.95); c.quadraticCurveTo(-r * 0.9 + i * r * 0.2, -r * 0.3, -r * 1.1 + i * r * 0.15, r * 0.3 + (i % 2) * 2); c.stroke(); }
      c.strokeStyle = '#5a0a10'; c.lineWidth = 1; c.beginPath(); c.moveTo(r * 0.1, -r * 0.8); c.lineTo(r * 0.4, -r * 0.5); c.stroke();
    },
  });
  if (rising) { ctx.restore(); dirtMound(ctx, 18, 1 - k * 0.6); }
  FL = false;
};
RENDER_A.possessed = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 15);
  // 빙의 오라 (보라 연기)
  if (!FL) {
    for (let i = 0; i < 3; i++) {
      const ph = (e.t * 0.6 + i / 3) % 1;
      glow(ctx, Math.sin(e.t * 2 + i * 2) * 6, -40 - ph * 40, 14 + ph * 8, '#8a3aff', 0.35 * (1 - ph));
    }
  }
  drawHumanoid(ctx, e, {
    H: 80, skin: '#b8a090', cloth: '#6a5a3a', pants: '#3a3428', sleeve: '#7a6a48', pose: 'fork', hunch: 0.1, eye: '#c060ff', boot: '#3a2a1e', teleColor: '#e0b0ff',
    torsoDetail: (c, T, bw) => {
      // 멜빵 + 헝겊 조끼
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-2 * bw, -T); c.lineTo(3 * bw, 0); c.stroke();
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-8 * bw, -T * 0.2, 17 * bw, 3);
    },
    headDetail: (c, r, e2) => {
      // 밀짚모자
      c.beginPath(); c.ellipse(0, -r * 0.75, r * 1.9, r * 0.38, -0.08, 0, TAU); ink(c, C('#b89a58'), 1.6);
      c.beginPath(); c.moveTo(-r * 0.9, -r * 0.8); c.quadraticCurveTo(-r * 0.8, -r * 1.7, 0, -r * 1.7); c.quadraticCurveTo(r * 0.9, -r * 1.65, r * 0.85, -r * 0.8); c.closePath();
      ink(c, sph(c, 'straw' + r, 0, -r * 1.2, r, '#c8aa68'), 1.6);
      if (!FL) { c.fillStyle = '#6a2a2a'; c.fillRect(-r * 0.88, -r * 1.05, r * 1.75, r * 0.22); c.fillStyle = 'rgba(20,10,20,0.6)'; c.beginPath(); c.ellipse(r * 0.4, -r * 0.35, r * 0.9, r * 0.3, 0, 0, TAU); c.fill(); }
      eyeGlow(c, r * 0.62, -r * 0.2, r * 0.15, '#c060ff');
    },
  });
  FL = false;
};
RENDER_A.mummy = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 16);
  const res = drawHumanoid(ctx, e, {
    H: 84, skin: '#c8b890', cloth: '#b8a67e', pants: '#b0a078', sleeve: '#c0ae84', bareLegs: true, bandage: true, pose: 'lash', hunch: 0.12, reach: e.anim !== 'attack',
    eye: '#40ffb0', mouth: false, boot: '#9a8a68', nail: '#4a3a28', drag: true, limbW: 3.6,
    torsoDetail: (c, T, bw) => {
      c.strokeStyle = '#7a6a4a'; c.lineWidth = 1;
      for (let i = 0; i < 7; i++) { const y = -T + 3 + i * T / 7; c.beginPath(); c.moveTo(-8 * bw, y + 2); c.lineTo(9 * bw, y - 1.5); c.stroke(); }
      c.fillStyle = 'rgba(40,20,10,0.45)'; c.beginPath(); c.moveTo(1 * bw, -T * 0.6); c.lineTo(5 * bw, -T * 0.55); c.lineTo(3 * bw, -T * 0.4); c.fill();
      // 황금 풍뎅이 부적
      c.fillStyle = '#d8b040'; c.beginPath(); c.ellipse(4 * bw, -T * 0.7, 2.4, 2, 0, 0, TAU); c.fill();
      glow(c, 4 * bw, -T * 0.7, 8, '#40ffb0', 0.4);
    },
    headDetail: (c, r, e2) => {
      if (FL) return;
      c.strokeStyle = '#7a6a4a'; c.lineWidth = 1;
      for (let i = 0; i < 5; i++) { const y = -r * 0.9 + i * r * 0.42; c.beginPath(); c.moveTo(-r * 0.9, y + 1.5); c.lineTo(r * 1.0, y - 1.5); c.stroke(); }
      // 풀린 붕대 꼬리
      const fl = Math.sin(e2.t * 3.5) * 3;
      c.fillStyle = '#c0ae84'; c.beginPath(); c.moveTo(-r * 0.8, -r * 0.3); c.quadraticCurveTo(-r * 2, r * 0.3 + fl, -r * 2.6, r * 1.6 + fl); c.lineTo(-r * 2.2, r * 1.7 + fl); c.quadraticCurveTo(-r * 1.6, r * 0.4, -r * 0.7, r * 0.1); c.fill();
      c.fillStyle = '#0a0806'; c.beginPath(); c.ellipse(r * 0.55, -r * 0.2, r * 0.3, r * 0.14, 0, 0, TAU); c.fill();
      eyeGlow(c, r * 0.6, -r * 0.2, r * 0.13, '#40ffb0');
    },
  });
  // 늘어진 붕대 조각들
  if (!FL && res) {
    const fl = Math.sin(e.t * 3) * 2;
    ctx.fillStyle = '#b8a67e';
    ctx.beginPath(); ctx.moveTo(res.fhx - 2, res.fhy); ctx.quadraticCurveTo(res.fhx - 3 + fl, res.fhy + 10, res.fhx - 6 + fl, res.fhy + 18); ctx.lineTo(res.fhx - 3 + fl, res.fhy + 18); ctx.quadraticCurveTo(res.fhx + fl, res.fhy + 9, res.fhx + 1, res.fhy); ctx.fill();
  }
  FL = false;
};
RENDER_A.gravedigger = (ctx, e, world, o) => {
  FL = !!o?.flash;
  shadow(ctx, 26);
  drawHumanoid(ctx, e, {
    H: 96, skin: '#a89a8a', cloth: '#3a3430', pants: '#2a2622', sleeve: '#4a4038', coatBack: '#3a3430', coatFront: '#4a4038', pose: 'shovel',
    hunch: 0.32, bulk: 1.45, headR: 8, eye: '#ffb040', lantern: true, limbW: 4.6, boot: '#1e1814', stride: 5, teleColor: '#ffd8a0',
    torsoDetail: (c, T, bw) => {
      // 등의 혹 + 멜빵 + 누빈 자국
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(-5 * bw, -T * 0.8, 5 * bw, 6, 0.3, 0, TAU); c.fill();
      c.strokeStyle = '#2a1a10'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-6 * bw, -T); c.lineTo(6 * bw, -T * 0.1); c.stroke();
      c.strokeStyle = '#6a5a4a'; c.lineWidth = 0.8; c.setLineDash?.([2, 2]); c.beginPath(); c.moveTo(-8 * bw, -T * 0.45); c.lineTo(9 * bw, -T * 0.5); c.stroke(); c.setLineDash?.([]);
    },
    headDetail: (c, r, e2) => {
      // 챙 넓은 모자 + 꿰맨 입
      c.beginPath(); c.ellipse(0.5, -r * 0.62, r * 2.1, r * 0.42, -0.12, 0, TAU); ink(c, C('#26201c'), 1.8);
      c.beginPath(); c.moveTo(-r * 0.95, -r * 0.7); c.lineTo(-r * 0.8, -r * 1.75); c.quadraticCurveTo(0, -r * 2.0, r * 0.85, -r * 1.7); c.lineTo(r * 0.95, -r * 0.75); c.closePath();
      ink(c, cyl(c, 'dighat' + r, -r, r, '#2e2824'), 1.8);
      if (!FL) {
        c.fillStyle = '#5a1a1a'; c.fillRect(-r * 0.9, -r * 1.0, r * 1.85, r * 0.25);
        c.fillStyle = 'rgba(10,6,4,0.55)'; c.beginPath(); c.ellipse(r * 0.4, -r * 0.3, r, r * 0.35, 0, 0, TAU); c.fill();
        c.strokeStyle = '#2a0a0a'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(r * 0.3, r * 0.55); c.lineTo(r * 0.95, r * 0.5); c.stroke();
        for (let i = 0; i < 4; i++) { const x = r * (0.35 + i * 0.17); c.beginPath(); c.moveTo(x, r * 0.42); c.lineTo(x + 1, r * 0.66); c.stroke(); }
        // 덥수룩한 수염
        c.fillStyle = '#6a6258'; c.beginPath(); c.moveTo(r * 0.1, r * 0.6); c.quadraticCurveTo(r * 0.5, r * 1.6, r * 1.0, r * 0.7); c.lineTo(r * 0.9, r * 0.5); c.fill();
      }
      eyeGlow(c, r * 0.62, -r * 0.22, r * 0.16, '#ffb040');
    },
  });
  FL = false;
};

// ───────────────────────── 진흙 인간 ─────────────────────────
RENDER_A.mud_man = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const st = e.state, t = e.t, at = e.animT;
  const mud = '#5a4230', mudD = '#3a2a1e', mudL = '#8a6a48';
  // 땅 속: 거품 웅덩이만
  if (st === 'under') {
    drawMudPuddle(ctx, t, 1);
    FL = false; return;
  }
  let k = 1;
  if (st === 'rise') k = ease.outCubic(clamp(e.stateT / 0.9, 0, 1));
  else if (st === 'sink') k = 1 - ease.inCubic(clamp(e.stateT / 0.6, 0, 1));
  const partial = k < 0.999;
  drawMudPuddle(ctx, t, partial ? 1 : 0.55);
  if (partial) riseClip(ctx, clamp(k, 0, 1.2), 80, 22, t);
  const walking = e.anim === 'walk';
  const ph = t * 5.5, sw = walking ? Math.sin(ph) : 0;
  const hurt = hurtOf(e);
  let lean = 0.12 + (hurt ? -0.25 : 0), bob = walking ? -Math.abs(Math.cos(ph)) * 2 : Math.sin(t * 2) * 1.2;
  let armF = 0.5 + sw * 0.3, armB = 0.3 - sw * 0.3, tele = 0, reachF = 1;
  if (e.anim === 'punch') {
    const ap = atkPhase(at, e.params?.punchWind ?? 0.5, 0.08);
    armF = ap.s <= 0 ? lerp(0.5, -1.2, ease.outCubic(ap.w)) : lerp(-1.2, 1.7, ease.outBack(ap.s));
    reachF = ap.s > 0 ? 1 + 0.6 * ease.outCubic(ap.s) * clamp(1 - ap.after / 0.3, 0, 1) : 1;
    lean = ap.s <= 0 ? lerp(0.12, -0.1, ap.w) : 0.3;
    tele = ap.w;
  } else if (e.anim === 'throw') {
    const ap = atkPhase(at, e.params?.throwWind ?? 0.55, 0.1);
    armF = ap.s <= 0 ? lerp(0.5, -2.5, ease.outCubic(ap.w)) : lerp(-2.5, -4.6, ease.outCubic(ap.s));
    lean = ap.s <= 0 ? -0.15 * ap.w : 0.25;
    tele = ap.w;
  }
  ctx.save(); ctx.translate(0, bob);
  // 흐르는 몸통 (울퉁불퉁 녹아내리는 실루엣)
  const wob = (i) => Math.sin(t * 3 + i * 1.7) * 1.6;
  ctx.save(); ctx.rotate(lean * 0.5);
  // 뒤팔
  mudArm(ctx, -6, -54, armB, 1, mudD, t, 0);
  const B = MUDPTS;
  B[0] = 17 + wob(0); B[1] = 0; B[2] = 19 + wob(1); B[3] = -15; B[4] = 14 + wob(2); B[5] = -30; B[6] = 19 + wob(3); B[7] = -47;
  B[8] = 13; B[9] = -60 + wob(4); B[10] = 0; B[11] = -64; B[12] = -12; B[13] = -61 + wob(5); B[14] = -20 + wob(6); B[15] = -48;
  B[16] = -15 + wob(7); B[17] = -31; B[18] = -19 + wob(8); B[19] = -15; B[20] = -18; B[21] = 0; B[22] = 0; B[23] = 2;
  smoothClosed(ctx, B, 12);
  ink(ctx, cyl(ctx, 'mudb2', -20, 20, mud), 2.2);
  if (!FL) {
    // 박힌 돌, 뼈, 광택
    ctx.fillStyle = '#6a6058'; ctx.beginPath(); ctx.ellipse(-6, -30, 3, 2.2, 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d8ccb0'; ctx.save(); ctx.translate(7, -20); ctx.rotate(0.6); ctx.fillRect(-5, -1, 10, 2); ctx.beginPath(); ctx.arc(-5, 0, 1.6, 0, TAU); ctx.arc(5, 0, 1.6, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = mudD; ctx.beginPath(); ctx.ellipse(3, -44, 7, 3, 0.1, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,220,170,0.28)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(11, -62); ctx.quadraticCurveTo(15, -40, 12, -14); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // 흘러내리는 방울
    ctx.fillStyle = mud;
    for (let i = 0; i < 3; i++) { const p = (t * 0.7 + i * 0.33) % 1; const x = -10 + i * 9, y = -50 + p * 50; ctx.beginPath(); ctx.ellipse(x + wob(i), y, 2, 2.5 + p * 2, 0, 0, TAU); ctx.fill(); }
  }
  // 머리 혹 + 눈구멍
  ctx.beginPath(); ctx.ellipse(5, -66, 10.5, 9 + Math.sin(t * 2.5), 0.15, 0, TAU);
  ink(ctx, sph(ctx, 'mudh', 5, -66, 10.5, mud), 2);
  if (!FL) { ctx.fillStyle = mud; ctx.beginPath(); ctx.ellipse(-2, -60, 9, 5, -0.3, 0, TAU); ctx.fill(); }
  if (!FL) {
    ctx.fillStyle = '#120a06';
    ctx.beginPath(); ctx.ellipse(7, -70, 2.8, 3.4, 0, 0, TAU); ctx.ellipse(12.5, -70, 1.8, 3, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -62, 4, 2 + Math.abs(Math.sin(t * 2)) * 1.5, 0, 0, TAU); ctx.fill();
    eyeGlow(ctx, 7.2, -70, 1.4, '#ff8a2a'); eyeGlow(ctx, 12.6, -70, 1, '#ff8a2a', 0.8);
  }
  ctx.restore();
  // 앞팔
  const fx = 6, fy = -54;
  mudArm(ctx, fx, fy, armF, reachF, mud, t, 1);
  if (e.anim === 'throw' && at < (e.params?.throwWind ?? 0.55) + 0.02) {
    end(fx, fy, armF, 30); glow(ctx, EX, EY, 10, '#8a6a48', 0.3);
    ctx.beginPath(); ctx.arc(EX, EY, 6, 0, TAU); ink(ctx, sph(ctx, 'mudball', 0, 0, 6, mudL), 1.6);
  }
  if (tele > 0.45) { end(fx, fy, armF, 30 * reachF); glint(ctx, EX, EY, 5 + 5 * tele, '#ffd8a0', (tele - 0.45) / 0.55); }
  ctx.restore();
  if (partial) ctx.restore();
  FL = false;
};
function mudArm(ctx, x, y, a, reach, col, t, i) {
  const L = 30 * reach;
  end(x, y, a, L * 0.5); const mx = EX + Math.sin(t * 3 + i) * 1.5, my = EY;
  end(x, y, a, L); const hx = EX, hy = EY;
  softLimb(ctx, x, y, mx, my, hx, hy, 5.8, 5.2, col, i === 1);
  ctx.beginPath(); ctx.ellipse(hx, hy, 6.5, 5.5, a, 0, TAU); ink(ctx, sph(ctx, 'mudhand' + col, 0, 0, 6, col), 1.8);
  // 뭉툭한 손 + 흘러내림
  if (!FL) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(hx, hy + 4 + Math.sin(t * 4 + i) * 1.5, 2, 3.5, 0, 0, TAU); ctx.fill(); }
}
function drawMudPuddle(ctx, t, a) {
  if (FL) return;
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a;
  ctx.fillStyle = '#2a1e14';
  ctx.beginPath(); ctx.ellipse(0, -1, 24, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a3624';
  ctx.beginPath(); ctx.ellipse(0, -2, 18, 3.2, 0, 0, TAU); ctx.fill();
  // 부글부글 거품 (경고)
  for (let i = 0; i < 4; i++) {
    const p = (t * 1.6 + i * 0.27) % 1;
    const x = -12 + i * 8 + Math.sin(i * 3.1) * 3, r = 1.2 + p * 2.6;
    ctx.strokeStyle = `rgba(160,120,80,${0.8 * (1 - p)})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, -3 - p * 3, r, PI, TAU); ctx.stroke();
  }
  ctx.globalAlpha = ga;
}

// ───────────────────────── 날개 부품 ─────────────────────────
/** 박쥐형 막 날개. 로컬: 어깨 원점, +x 바깥쪽. span=길이, lift=-1(아래)~1(위) */
function batWing(ctx, span, lift, col, mem, bone) {
  const a = -lift * 0.95;
  ctx.save(); ctx.rotate(a);
  ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(lift * 1.2)));
  const S = span;
  // 막
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(S * 0.42, -S * 0.2);         // 손목
  ctx.lineTo(S * 1.0, -S * 0.12);         // 첫째 손가락 끝
  ctx.quadraticCurveTo(S * 0.82, S * 0.02, S * 0.9, S * 0.2);
  ctx.quadraticCurveTo(S * 0.66, S * 0.18, S * 0.66, S * 0.38);
  ctx.quadraticCurveTo(S * 0.46, S * 0.28, S * 0.36, S * 0.44);
  ctx.quadraticCurveTo(S * 0.2, S * 0.26, 0, S * 0.24);
  ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'wing' + mem + S, 0, -S * 0.2, 0, S * 0.45, [0, lt(mem, 0.12), 0.5, mem, 1, dk(mem, -0.45)]), 1.8);
  if (!FL) {
    // 뼈대
    ctx.strokeStyle = bone; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(S * 0.42, -S * 0.2); ctx.lineTo(S * 1.0, -S * 0.12);
    ctx.moveTo(S * 0.42, -S * 0.2); ctx.lineTo(S * 0.9, S * 0.2);
    ctx.moveTo(S * 0.42, -S * 0.2); ctx.lineTo(S * 0.66, S * 0.38);
    ctx.moveTo(S * 0.42, -S * 0.2); ctx.lineTo(S * 0.36, S * 0.44);
    ctx.stroke();
    // 림
    ctx.strokeStyle = mixCache(mem, RIM, 0.5, 0); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(2, -3); ctx.lineTo(S * 0.42, -S * 0.21 - 1); ctx.lineTo(S * 0.98, -S * 0.13 - 1); ctx.stroke();
    // 발톱
    ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.moveTo(S * 0.42, -S * 0.2); ctx.lineTo(S * 0.4, -S * 0.2 - 4); ctx.lineTo(S * 0.46, -S * 0.2); ctx.fill();
  }
  ctx.restore();
}
/** 깃털 날개 (까마귀). 로컬: 어깨 원점, +x 바깥쪽 */
function featherWing(ctx, span, lift, col, sheen) {
  ctx.save(); ctx.rotate(-lift * 1.0);
  ctx.scale(1, 0.5 + 0.5 * Math.abs(Math.cos(lift)));
  const S = span;
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.quadraticCurveTo(S * 0.5, -S * 0.28, S * 1.0, -S * 0.1);
  // 칼깃 (톱니)
  for (let i = 0; i < 6; i++) {
    const u = 1 - i / 6;
    ctx.lineTo(S * (0.92 - i * 0.14), S * (0.02 + i * 0.045));
    ctx.lineTo(S * (0.88 - i * 0.14) * u + S * 0.1, S * (0.16 + i * 0.02));
  }
  ctx.lineTo(0, S * 0.18);
  ctx.closePath();
  ink(ctx, FL ? WHITE : linG(ctx, 'fw' + col + S, 0, -S * 0.25, 0, S * 0.3, [0, lt(col, 0.18), 0.6, col, 1, dk(col, -0.5)]), 1.8);
  if (!FL) {
    ctx.strokeStyle = sheen; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(S * 0.1, -S * 0.04); ctx.quadraticCurveTo(S * 0.5, -S * 0.2, S * 0.9, -S * 0.08); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(S * 0.2 * i, -S * 0.1 + i); ctx.lineTo(S * 0.2 * i - 3, S * 0.12); ctx.stroke(); }
  }
  ctx.restore();
}

// ───────────────────────── 박쥐 / 황금 박쥐 ─────────────────────────
function drawBat(ctx, e, pal) {
  const t = e.t, hang = e.anim === 'hang';
  const cy = -11;
  if (hang) {
    // 거꾸로 매달림: 날개로 몸을 감쌈
    ctx.save(); ctx.translate(0, cy - 4); ctx.rotate(Math.sin(t * 1.8) * 0.08);
    ctx.fillStyle = C(OUT); ctx.fillRect(-3, -11, 2, 4); ctx.fillRect(1, -11, 2, 4);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.bezierCurveTo(10, -8, 10, 10, 0, 13); ctx.bezierCurveTo(-10, 10, -10, -8, 0, -9); ctx.closePath();
    ink(ctx, cyl(ctx, 'bath' + pal.mem, -9, 9, pal.mem), 2);
    if (!FL) { ctx.strokeStyle = pal.bone; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2, -8); ctx.quadraticCurveTo(-7, 2, -1, 12); ctx.moveTo(2, -8); ctx.quadraticCurveTo(7, 2, 1, 12); ctx.stroke(); }
    // 머리 (아래)
    ctx.beginPath(); ctx.arc(0, 12, 5, 0, TAU); ink(ctx, sph(ctx, 'bathead' + pal.fur, 0, 0, 5, pal.fur), 1.6);
    ctx.beginPath(); ctx.moveTo(-4, 14); ctx.lineTo(-5, 21); ctx.lineTo(-1, 16); ctx.moveTo(4, 14); ctx.lineTo(5, 21); ctx.lineTo(1, 16); ink(ctx, C(pal.fur), 1.2);
    if (!FL) { eyeGlow(ctx, -1.8, 11, 1, pal.eye); eyeGlow(ctx, 1.8, 11, 1, pal.eye); }
    ctx.restore();
    return;
  }
  const fl = Math.sin(t * (pal.flap ?? 19));
  const dive = e.state === 'dive';
  ctx.save(); ctx.translate(0, cy + fl * 1.5);
  if (dive) ctx.rotate(0.25);
  // 뒤 날개
  ctx.save(); ctx.translate(-2, -2); ctx.scale(-1, 1); batWing(ctx, 21, dive ? 0.9 : fl, pal.fur, dk(pal.mem, -0.25), pal.bone); ctx.restore();
  // 몸통
  ctx.beginPath(); ctx.ellipse(0, 1, 5.5, 7, 0.15, 0, TAU);
  ink(ctx, sph(ctx, 'batb' + pal.fur, 0, 1, 7, pal.fur), 1.8);
  if (!FL) { ctx.fillStyle = lt(pal.fur, 0.2); ctx.beginPath(); ctx.ellipse(2, 3, 2.5, 4.5, 0.2, 0, TAU); ctx.fill(); }
  // 다리
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-2, 7); ctx.lineTo(-4, 11); ctx.moveTo(1, 7); ctx.lineTo(0, 11); ctx.stroke();
  // 머리
  ctx.save(); ctx.translate(4, -6);
  ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(-4, -11); ctx.lineTo(0, -4); ctx.closePath(); ink(ctx, C(dk(pal.fur, -0.2)), 1.4);
  ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(4, -12); ctx.lineTo(4.5, -3); ctx.closePath(); ink(ctx, C(pal.fur), 1.4);
  if (!FL) { ctx.fillStyle = pal.ear; ctx.beginPath(); ctx.moveTo(2, -5); ctx.lineTo(3.8, -10); ctx.lineTo(3.8, -4.5); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(1, 0, 5, 4.4, 0, 0, TAU); ink(ctx, sph(ctx, 'bathd' + pal.fur, 1, 0, 5, pal.fur), 1.6);
  ctx.beginPath(); ctx.ellipse(5, 1, 2.4, 1.8, 0, 0, TAU); ink(ctx, C(lt(pal.fur, 0.15)), 1.2);
  if (!FL) {
    ctx.fillStyle = '#1a0608'; ctx.beginPath(); ctx.moveTo(3, 2.5); ctx.lineTo(7, 2.5); ctx.lineTo(5.5, 4.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(4, 2.5); ctx.lineTo(4.6, 5); ctx.lineTo(5.1, 2.5); ctx.moveTo(5.8, 2.5); ctx.lineTo(6.3, 4.6); ctx.lineTo(6.8, 2.5); ctx.fill();
    eyeGlow(ctx, 2.8, -1, 1.2, pal.eye); eyeGlow(ctx, 5.2, -1.2, 0.9, pal.eye, 0.8);
  }
  ctx.restore();
  // 앞 날개
  ctx.save(); ctx.translate(2, -2); batWing(ctx, 22, dive ? 0.9 : fl, pal.fur, pal.mem, pal.bone); ctx.restore();
  ctx.restore();
}
RENDER_A.bat = (ctx, e, world, o) => {
  FL = !!o?.flash;
  drawBat(ctx, e, { fur: '#3a2a3a', mem: '#4a1a2e', bone: '#8a5a6a', ear: '#8a3a4a', eye: '#ff2a3a' });
  FL = false;
};
RENDER_A.golden_bat = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const blink = (e.life ?? 9) < 2 ? (Math.sin(e.t * 40) > 0 ? 0.35 : 1) : 1;
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * blink;
  glow(ctx, 0, -11, 34, '#ffd84a', 0.55 + 0.2 * Math.sin(e.t * 8));
  drawBat(ctx, e, { fur: '#c89a2a', mem: '#e8b83a', bone: '#fff0b0', ear: '#ffe080', eye: '#ffffff', flap: 24 });
  // 반짝이
  if (!FL) for (let i = 0; i < 4; i++) {
    const p = (e.t * 1.3 + i * 0.25) % 1;
    const a = i * 1.7 + e.t;
    glint(ctx, Math.cos(a) * (12 + p * 10), -11 + Math.sin(a * 1.3) * (8 + p * 6), 3 + 3 * Math.sin(p * PI), '#fff6c0', Math.sin(p * PI));
  }
  ctx.globalAlpha = ga;
  FL = false;
};

// ───────────────────────── 시체 까마귀 ─────────────────────────
RENDER_A.crow = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim;
  const col = '#1c1c2a', sheen = '#5a5a9a', beak = '#3a3430';
  const perch = an === 'perch' || an === 'idle', alert = an === 'alert', dive = an === 'dive';
  let rot = 0, cy = -13, flap = Math.sin(t * 14), wingUp = 0;
  if (perch) { cy = -12; rot = -0.35; }
  if (alert) { cy = -12; rot = -0.2 - 0.1 * Math.sin(e.animT * 30); }
  if (dive) { const a = Math.atan2(e.vy ?? 200, Math.abs(e.vx ?? 200) + 1); rot = clamp(a, -0.6, 1.3); }
  if (perch) shadow(ctx, 10, 0.3);
  ctx.save(); ctx.translate(0, cy); ctx.rotate(rot);
  // 뒤 날개
  if (!perch) { ctx.save(); ctx.translate(-2, -3); ctx.scale(-0.9, 1); featherWing(ctx, 22, dive ? -1.3 : alert ? 1.0 : flap, dk(col, -0.2), sheen); ctx.restore(); }
  // 꼬리
  ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(-17, perch ? 7 : 1); ctx.lineTo(-15, perch ? 10 : 4); ctx.lineTo(-18, perch ? 12 : 6); ctx.lineTo(-5, 3); ctx.closePath();
  ink(ctx, C(dk(col, -0.1)), 1.6);
  // 몸
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.bezierCurveTo(-6, -8, 6, -8, 9, -3); ctx.bezierCurveTo(10, 3, 2, 7, -5, 5); ctx.closePath();
  ink(ctx, sph(ctx, 'crowb', 1, -1, 9, col), 1.8);
  if (!FL) { ctx.strokeStyle = sheen; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, -4); ctx.quadraticCurveTo(2, -7, 8, -4); ctx.stroke(); }
  // 다리
  if (perch || alert) { ctx.strokeStyle = C('#5a4a3a'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(1, 12); ctx.lineTo(4, 12.5); ctx.moveTo(-3, 5); ctx.lineTo(-3, 12); ctx.lineTo(0, 12.5); ctx.stroke(); }
  else { ctx.strokeStyle = C('#5a4a3a'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-2, 5); ctx.lineTo(-6, 8); ctx.moveTo(0, 5); ctx.lineTo(-4, 9); ctx.stroke(); }
  // 머리
  ctx.save(); ctx.translate(9, -6); ctx.rotate(perch ? Math.sin(t * 3) * 0.15 + 0.3 : alert ? -0.2 : 0);
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ink(ctx, sph(ctx, 'crowh', 0, 0, 5, col), 1.6);
  // 헝클어진 깃
  if (!FL) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-6, -6); ctx.lineTo(-2, -4); ctx.lineTo(-2, -8); ctx.lineTo(1, -4.5); ctx.fill(); }
  // 부리 (경고 시 벌림)
  const open = alert ? 0.35 : 0.05;
  ctx.beginPath(); ctx.moveTo(3, -2); ctx.lineTo(12, 0 - open * 4); ctx.lineTo(4, 1); ctx.closePath(); ink(ctx, C(beak), 1.3);
  ctx.beginPath(); ctx.moveTo(3.5, 1); ctx.lineTo(10, 1 + open * 8); ctx.lineTo(3, 2.5); ctx.closePath(); ink(ctx, C(dk(beak, -0.2)), 1.2);
  if (!FL) eyeGlow(ctx, 1.8, -1.2, 1.2, '#ff2020', alert ? 1.6 : 1);
  ctx.restore();
  // 앞 날개
  if (perch) {
    ctx.beginPath(); ctx.moveTo(-6, -3); ctx.quadraticCurveTo(2, -6, 6, -2); ctx.quadraticCurveTo(0, 6, -12, 5); ctx.closePath();
    ink(ctx, cyl(ctx, 'crowfw', -12, 6, dk(col, -0.05)), 1.6);
  } else { ctx.save(); ctx.translate(1, -3); featherWing(ctx, 24, dive ? -1.3 : alert ? 1.0 : flap, col, sheen); ctx.restore(); }
  ctx.restore();
  if (alert && !FL) glint(ctx, 10, cy - 9, 7, '#ff6060', 0.5 + 0.5 * Math.sin(e.animT * 25));
  FL = false;
};

// ───────────────────────── 굶주린 늑대 ─────────────────────────
RENDER_A.wolf = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim;
  const fur = '#4e4a58', furD = '#2e2a36', belly = '#8a8494';
  const hurt = hurtOf(e);
  const walk = an === 'walk', charge = an === 'charge', wind = an === 'wind';
  const ph = t * (charge ? 16 : walk ? 9 : 0);
  let bodyY = -24, lean = 0, headY = 0, headA = 0, stretch = 1, shake = 0;
  if (wind) { bodyY = -18; lean = 0.12; headY = 5; headA = 0.15; shake = Math.sin(t * 60) * 0.8; }
  if (charge) { stretch = 1.12; bodyY = -23 + Math.sin(ph) * 2.5; lean = Math.sin(ph) * 0.06; }
  if (walk) bodyY = -24 - Math.abs(Math.sin(ph)) * 1.5;
  if (hurt) { lean = -0.15; headA = -0.3; }
  shadow(ctx, 28);
  ctx.save(); ctx.translate(shake, 0);
  // 다리 위치 (어깨 x=13, 엉덩이 x=-17)
  const legs = (front, back) => {
    const sets = [[13, 0, front], [-17, PI, back]];
    for (const [x, off, isNear] of sets) {
      for (let k = 0; k < 2; k++) {
        const near = k === 1;
        if (near !== isNear) continue;
        const p = ph + off + (near ? 0 : PI * (charge ? 0.25 : 1));
        let a1, a2;
        if (charge) { a1 = Math.sin(p) * 0.9; a2 = -Math.max(0, Math.cos(p)) * 1.2; }
        else if (walk) { a1 = Math.sin(p) * 0.45; a2 = -Math.max(0, Math.cos(p)) * 0.7; }
        else if (wind) { a1 = x > 0 ? 0.6 : -0.5; a2 = x > 0 ? -1.2 : 1.3; }
        else { a1 = (near ? 0.05 : -0.05); a2 = 0; }
        const hind = x < 0;
        const hy = bodyY + (hind ? -1 : 2);
        const L1 = hind ? 11 : 10, L2 = hind ? 12 : 12;
        end(x * stretch, hy, a1 + (hind ? 0.35 : 0), L1); const kx = EX, ky = EY;
        end(kx, ky, a1 + a2 + (hind ? -0.55 : 0), L2); let fx = EX, fy = Math.min(EY, 0);
        const col = near ? fur : furD;
        softLimb(ctx, x * stretch, hy, kx, ky, fx, fy, hind ? 5 : 3.8, hind ? 2.2 : 2.3, col, near);
        ctx.beginPath(); ctx.ellipse(fx + 2, fy - 1, 3.2, 1.7, 0, 0, TAU); ink(ctx, C(dk(col, -0.2)), 1.2);
      }
    }
  };
  legs(false, false);
  ctx.save(); ctx.translate(0, bodyY); ctx.rotate(lean);
  // 꼬리
  const tw = Math.sin(t * (charge ? 12 : 3)) * (charge ? 0.1 : 0.2);
  ctx.save(); ctx.translate(-22 * stretch, -3); ctx.rotate(charge ? -0.2 + tw : 0.7 + tw + (wind ? -0.6 : 0));
  ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(-10, -4, -18, 2); ctx.lineTo(-14, 3); ctx.lineTo(-16, 6); ctx.quadraticCurveTo(-8, 5, 0, 4); ctx.closePath();
  ink(ctx, cyl(ctx, 'wtail', -18, 0, fur, 0, 0), 1.6);
  ctx.restore();
  // 몸통 (가슴 깊고 허리 가는)
  ctx.beginPath();
  ctx.moveTo(-22 * stretch, -4);
  ctx.bezierCurveTo(-20 * stretch, -12, -4, -10, 8 * stretch, -12);
  ctx.bezierCurveTo(18 * stretch, -13, 22 * stretch, -4, 18 * stretch, 5);
  ctx.bezierCurveTo(14 * stretch, 11, 6, 10, 0, 4);
  ctx.bezierCurveTo(-6, 2, -12, 6, -18 * stretch, 5);
  ctx.closePath();
  ink(ctx, vert(ctx, 'wbody', -13, 10, fur, 0.15, -0.35), 2);
  if (!FL) {
    // 곤두선 갈기
    ctx.fillStyle = furD;
    ctx.beginPath(); ctx.moveTo(-14, -9);
    const spike = wind ? 6 : charge ? 2 : 3;
    for (let i = 0; i < 8; i++) { const x = -14 + i * 4.2 * stretch; ctx.lineTo(x + 2, -11 - spike - (i % 2) * 2 + Math.sin(t * 20 + i) * (wind ? 1 : 0)); ctx.lineTo(x + 4, -10.5); }
    ctx.lineTo(18, -10); ctx.closePath(); ctx.fill();
    // 드러난 갈비
    ctx.strokeStyle = 'rgba(20,16,26,0.32)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0 + i * 4, -5); ctx.quadraticCurveTo(2.5 + i * 4, -1, 1 + i * 4, 3); ctx.stroke(); }
    // 털 결 (뭉친 털 뭉치)
    ctx.strokeStyle = 'rgba(160,150,180,0.35)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 7; i++) { const x = -18 + i * 5; ctx.beginPath(); ctx.moveTo(x, -8 + (i % 2)); ctx.lineTo(x - 3, -4 + (i % 2)); ctx.stroke(); }
    // 배 아래 털 술
    ctx.fillStyle = furD; ctx.beginPath(); ctx.moveTo(-16, 4);
    for (let i = 0; i < 6; i++) { const x = -16 + i * 3.4; ctx.lineTo(x + 1.7, 8 + (i % 2) * 1.5); ctx.lineTo(x + 3.4, 4.5); }
    ctx.closePath(); ctx.fill();
    // 배 털 + 림
    ctx.fillStyle = belly; ctx.beginPath(); ctx.moveTo(4, 5); ctx.quadraticCurveTo(12, 10, 17, 4); ctx.lineTo(15, 2); ctx.quadraticCurveTo(10, 6, 4, 3); ctx.fill();
    ctx.strokeStyle = mixCache(fur, RIM, 0.6, 0); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-21 * stretch, -5); ctx.bezierCurveTo(-19 * stretch, -12, -4, -10.5, 6, -12.5); ctx.stroke();
    // 흉터
    ctx.strokeStyle = '#6a2a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-6, 0); ctx.moveTo(-8, -7); ctx.lineTo(-4, -1); ctx.stroke();
  }
  // 머리
  ctx.save(); ctx.translate(19 * stretch, -8 + headY); ctx.rotate(headA + (charge ? 0.15 : 0));
  // 목 갈기
  ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-2, -10); ctx.lineTo(4, -6); ctx.lineTo(3, 6); ctx.lineTo(-6, 8); ctx.closePath(); ink(ctx, C(fur), 1.6);
  // 두개 + 주둥이
  ctx.beginPath();
  ctx.moveTo(-2, -7); ctx.quadraticCurveTo(4, -10, 8, -6); ctx.lineTo(18, -3); ctx.quadraticCurveTo(20, -1, 18, 1);
  const jaw = wind ? 4 : charge ? 5 + Math.sin(t * 20) : 1.5 + Math.max(0, Math.sin(t * 2)) * 1;
  ctx.lineTo(9, 2); ctx.lineTo(16, 2 + jaw); ctx.lineTo(8, 5 + jaw * 0.4); ctx.quadraticCurveTo(0, 6, -3, 2); ctx.closePath();
  ink(ctx, sph(ctx, 'whead', 4, -2, 11, fur), 1.8);
  if (!FL) {
    // 입속 + 이빨
    ctx.fillStyle = '#3a0a10'; ctx.beginPath(); ctx.moveTo(9, 1.5); ctx.lineTo(17.5, 1); ctx.lineTo(16, 2 + jaw); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0e8d8';
    ctx.beginPath(); ctx.moveTo(15, 1); ctx.lineTo(15.8, 3.2); ctx.lineTo(16.6, 1); ctx.moveTo(11, 1.3); ctx.lineTo(11.7, 3); ctx.lineTo(12.4, 1.3); ctx.moveTo(13, 2 + jaw * 0.8); ctx.lineTo(13.6, jaw * 0.8 - 0.3); ctx.lineTo(14.2, 2 + jaw * 0.85); ctx.fill();
    ctx.fillStyle = '#0a0608'; ctx.beginPath(); ctx.arc(18.5, -2.2, 1.3, 0, TAU); ctx.fill();
    // 콧등 주름 (으르렁)
    if (wind || charge) { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.8; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(9 + i * 2, -5 + i * 0.4); ctx.lineTo(10 + i * 2, -3.5 + i * 0.4); ctx.stroke(); } }
    // 침
    if (wind) { ctx.strokeStyle = 'rgba(200,220,230,0.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(13, 2 + jaw); ctx.lineTo(13, 6 + jaw + Math.sin(t * 5) * 1.5); ctx.stroke(); }
  }
  // 귀
  const earA = charge || wind ? -0.9 : -0.3;
  ctx.save(); ctx.translate(1, -7); ctx.rotate(earA);
  ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-1, -9); ctx.lineTo(3, 0); ctx.closePath(); ink(ctx, C(fur), 1.4);
  ctx.restore();
  eyeGlow(ctx, 8, -4, 1.3, wind || charge ? '#ff4020' : '#ffc030', wind ? 1.5 : 1);
  ctx.restore();
  ctx.restore();
  legs(true, true);
  ctx.restore();
  // 돌진 속도선
  if (charge && !FL) {
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(220,210,255,0.25)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { const y = -32 + i * 7, x0 = -30 - ((t * 400 + i * 37) % 30); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - 18, y); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (wind && !FL) glint(ctx, 27, -16 + headY, 6 + 4 * Math.sin(t * 30), '#ff8040', clamp(e.animT / 0.4, 0, 1));
  FL = false;
};

// ───────────────────────── 가고일 ─────────────────────────
RENDER_A.gargoyle = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const stone = '#6e6a72', stoneD = '#3e3a44', crack = '#ff8a2a';
  const statue = an === 'statue' || an === 'idle', wake = an === 'wake', breath = an === 'breath', swoop = an === 'swoop' || an === 'dive';
  const flying = !statue && !wake;
  let cy = -26, rot = 0, wingL = 0, shake = 0, crackA = 0, eyeA = 0.15, mouth = 0.1;
  const flap = Math.sin(t * 9);
  if (statue) { cy = -22; wingL = -1.2; }
  if (wake) { cy = -22 - ease.inCubic(clamp(at / 0.7, 0, 1)) * 6; shake = Math.sin(t * 55) * 1.6 * (1 - at); crackA = clamp(at / 0.7, 0, 1); eyeA = crackA; wingL = lerp(-1.2, 0.6, crackA); mouth = 0.4 * crackA; }
  if (flying) { wingL = swoop ? -0.9 : flap * 0.9; cy = -28 + flap * 2; crackA = 0.35 + 0.15 * Math.sin(t * 4); eyeA = 1; }
  if (breath) { const k = clamp(at / (e.params?.breathWind ?? 0.6), 0, 1); mouth = 0.2 + 0.6 * ease.outCubic(k); crackA = 0.5 + 0.5 * k; rot = -0.1 * k; wingL = flap * 0.5 + 0.3; }
  if (swoop) { rot = 0.35; }
  if (statue || wake) shadow(ctx, 24);
  ctx.save(); ctx.translate(shake, cy); ctx.rotate(rot);
  // 뒤 날개
  ctx.save(); ctx.translate(-6, -10); ctx.scale(-1, 1); ctx.rotate(-0.4); batWing(ctx, 30, wingL, stone, stoneD, '#8a8690'); ctx.restore();
  // 꼬리
  const tw = Math.sin(t * 2.5) * 0.3;
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-10, 10); ctx.quadraticCurveTo(-24, 14 + tw * 10, -28, 4 + tw * 12); ctx.stroke();
  ctx.strokeStyle = C(stoneD); ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-28, 4 + tw * 12); ctx.lineTo(-34, 0 + tw * 12); ctx.lineTo(-29, 9 + tw * 12); ctx.closePath(); ink(ctx, C(stoneD), 1.4);
  // 뒷다리 (웅크림)
  const legA = flying ? 0.5 + Math.sin(t * 4) * 0.1 : -0.9;
  end(-6, 8, legA, 12); const kx = EX, ky = EY; end(kx, ky, flying ? 0.2 : 1.9, 11);
  softLimb(ctx, -6, 8, kx, ky, EX, EY, 5.5, 3, stoneD);
  claw(ctx, EX, EY, stoneD, 0);
  // 몸통
  ctx.beginPath();
  ctx.moveTo(-12, 10); ctx.bezierCurveTo(-16, -4, -8, -16, 4, -15); ctx.bezierCurveTo(14, -14, 15, -2, 10, 10); ctx.quadraticCurveTo(0, 16, -12, 10); ctx.closePath();
  ink(ctx, sph(ctx, 'gargb', 0, -2, 16, stone), 2);
  if (!FL) {
    // 돌 결 + 균열
    ctx.strokeStyle = 'rgba(20,16,24,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(-2, -4); ctx.lineTo(-5, 3); ctx.moveTo(4, -12); ctx.lineTo(6, -5); ctx.lineTo(3, 2); ctx.lineTo(7, 8); ctx.stroke();
    if (crackA > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,140,50,${crackA})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(-2, -4); ctx.lineTo(-5, 3); ctx.moveTo(4, -12); ctx.lineTo(6, -5); ctx.lineTo(3, 2); ctx.lineTo(7, 8); ctx.stroke();
      glow(ctx, 0, -2, 14, crack, crackA * 0.35);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 이끼
    ctx.fillStyle = 'rgba(70,100,50,0.6)'; ctx.beginPath(); ctx.ellipse(-8, -8, 4, 2, 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = mixCache(stone, RIM, 0.6, 0); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-13, 8); ctx.bezierCurveTo(-16, -3, -9, -15, 2, -15.5); ctx.stroke();
  }
  // 머리
  ctx.save(); ctx.translate(10, -14); ctx.rotate(breath ? -0.1 : statue ? 0.15 : 0);
  // 뒤로 휜 뿔 (양 뿔처럼 굵게)
  for (const sg of [-1, 1]) {
    const bx = sg > 0 ? 1 : -3, c = sg > 0 ? '#a8a4ac' : stoneD;
    ctx.beginPath();
    ctx.moveTo(bx - 3, -6); ctx.bezierCurveTo(bx - 8, -12, bx - 16, -11, bx - 18, -5 + (sg > 0 ? 0 : -2));
    ctx.bezierCurveTo(bx - 15, -8, bx - 9, -8, bx + 2, -5); ctx.closePath();
    ink(ctx, linG(ctx, 'ghorn' + sg, bx, -6, bx - 18, -6, [0, dk(c, -0.2), 1, lt(c, 0.25)]), 1.4);
  }
  // 뾰족 귀
  ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(-11, -1); ctx.lineTo(-3, 1); ctx.closePath(); ink(ctx, C(stoneD), 1.2);
  // 두상: 길쭉한 주둥이 + 튀어나온 눈두덩
  ctx.beginPath();
  ctx.moveTo(-7, 3); ctx.quadraticCurveTo(-8, -8, 0, -8);
  ctx.lineTo(6, -7); ctx.quadraticCurveTo(9, -7, 10, -4);
  ctx.lineTo(16, -1); ctx.quadraticCurveTo(17, 1, 15, 2);
  const mo = mouth * 7;
  ctx.lineTo(9, 2); ctx.lineTo(14, 3 + mo); ctx.lineTo(6, 7 + mo * 0.5); ctx.quadraticCurveTo(-4, 8, -7, 3); ctx.closePath();
  ink(ctx, sph(ctx, 'gargh2', 3, -2, 11, stone), 1.8);
  if (!FL) {
    ctx.fillStyle = dk(stone, -0.45); ctx.beginPath(); ctx.moveTo(1, -7); ctx.quadraticCurveTo(6, -9, 10, -4.5); ctx.lineTo(8, -3.6); ctx.quadraticCurveTo(5, -6, 1, -5); ctx.fill();
    ctx.fillStyle = '#1a0a06'; ctx.beginPath(); ctx.arc(15.2, -0.6, 0.8, 0, TAU); ctx.fill();
  }
  if (!FL) {
    ctx.fillStyle = '#1a0a06'; ctx.beginPath(); ctx.moveTo(8, 2); ctx.lineTo(15, 2); ctx.lineTo(14, 3 + mo); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8d0c0'; ctx.beginPath(); ctx.moveTo(12.5, 2); ctx.lineTo(13.1, 4.5); ctx.lineTo(13.8, 2); ctx.moveTo(9.5, 2); ctx.lineTo(10.1, 4.2); ctx.lineTo(10.8, 2); ctx.moveTo(11, 3 + mo * 0.9); ctx.lineTo(11.6, 1 + mo * 0.9); ctx.lineTo(12.2, 3 + mo * 0.95); ctx.fill();
    if (mouth > 0.3) { glow(ctx, 13, 3 + mo * 0.5, 6 + mouth * 14, '#ff8a2a', mouth); glow(ctx, 13, 3 + mo * 0.5, 4 + mouth * 5, '#fff0a0', mouth * 0.8); }
    ctx.fillStyle = '#0a0608'; ctx.beginPath(); ctx.ellipse(5.5, -3.4, 2.4, 1.5, -0.25, 0, TAU); ctx.fill();
    eyeGlow(ctx, 6, -3.4, 1.2, '#ff7020', eyeA);
  }
  ctx.restore();
  // 앞팔
  const armA = swoop ? 2.0 : flying ? 0.6 + Math.sin(t * 5) * 0.15 : breath ? 0.9 : -0.3;
  end(6, -6, armA, 10); const ex = EX, ey = EY; end(ex, ey, armA + (flying ? 0.6 : 1.4), 10);
  softLimb(ctx, 6, -6, ex, ey, EX, EY, 4, 2.8, stone);
  claw(ctx, EX, EY, stone, swoop ? 1 : 0);
  // 앞 날개
  ctx.save(); ctx.translate(-3, -11); ctx.rotate(-0.5); batWing(ctx, 32, wingL, stone, lt(stoneD, 0.1), '#9a96a0'); ctx.restore();
  ctx.restore();
  if (breath && !FL) { const k = clamp(at / (e.params?.breathWind ?? 0.6), 0, 1); glint(ctx, 24, cy - 12, 5 + 7 * k, '#ffb060', k > 0.5 ? (k - 0.5) * 2 : 0); }
  if (swoop && !FL) glint(ctx, 18, cy + 2, 7, '#ffd0a0', clamp(1 - at / 0.3, 0, 1));
  FL = false;
};
function claw(ctx, x, y, col, open) {
  if (FL) return;
  ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 3 + open * 2, y + 1 + i * (2 + open * 2), x + 4 + open * 3, y + 3 + i * (2 + open * 2)); ctx.stroke(); }
}

// ───────────────────────── 하급 악마 ─────────────────────────
RENDER_A.lesser_demon = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const skin = '#a02a2a', skinD = '#5a1016', horn = '#e8dcc0', mem = '#3a0a18';
  const cast = an === 'cast', swoop = an === 'swoop', dive = an === 'dive';
  const flap = Math.sin(t * 10);
  let cy = -40 + flap * 2.5, rot = 0;
  if (dive) rot = 0.45; if (swoop) rot = -0.1;
  const hurt = hurtOf(e);
  if (hurt) rot -= 0.25;
  ctx.save(); ctx.translate(0, cy); ctx.rotate(rot);
  // 뒤 날개
  ctx.save(); ctx.translate(-6, -12); ctx.scale(-1, 1); ctx.rotate(-0.5); batWing(ctx, 28, dive ? -1 : swoop ? 1.2 : flap, skinD, dk(mem, -0.2), '#6a2030'); ctx.restore();
  // 꼬리 (화살촉)
  const tw = Math.sin(t * 3);
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4, 10); ctx.bezierCurveTo(-14, 18, -18 + tw * 3, 26, -10 + tw * 5, 32); ctx.stroke();
  ctx.strokeStyle = C(skinD); ctx.lineWidth = 2.2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-10 + tw * 5, 32); ctx.lineTo(-15 + tw * 5, 34); ctx.lineTo(-7 + tw * 5, 39); ctx.lineTo(-5 + tw * 5, 31); ctx.closePath(); ink(ctx, C(skinD), 1.3);
  // 뒷다리 (염소 다리)
  const dang = Math.sin(t * 4) * 0.15;
  const goatLeg = (x, near) => {
    const c = near ? skinD : dk(skinD, -0.3);
    end(x, 12, 0.6 + dang, 11); const kx = EX, ky = EY; end(kx, ky, -0.5 + dang, 10); const hx = EX, hy = EY; end(hx, hy, 0.4, 7);
    const px = EX, py = EY;
    softLimb(ctx, x, 12, kx, ky, hx, hy, 4.6, 2.4, c, near);
    softLimb(ctx, hx, hy, (hx + px) / 2, (hy + py) / 2, px, py, 2, 1.8, c, false);
    ctx.fillStyle = C('#1a0a08'); ctx.beginPath(); ctx.ellipse(px + 1, py + 1, 2.6, 1.8, 0.3, 0, TAU); ctx.fill();
  };
  goatLeg(-4, false);
  // 몸통 (근육질)
  ctx.beginPath();
  ctx.moveTo(-8, 12); ctx.bezierCurveTo(-11, 0, -10, -14, 0, -15); ctx.bezierCurveTo(10, -15, 12, -4, 7, 4); ctx.quadraticCurveTo(4, 12, -8, 12); ctx.closePath();
  ink(ctx, sph(ctx, 'demb', 1, -3, 15, skin), 2);
  if (!FL) {
    ctx.strokeStyle = 'rgba(40,0,6,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(1, -12); ctx.quadraticCurveTo(4, -6, 1, -2); ctx.moveTo(-3, -1); ctx.lineTo(4, -1); ctx.moveTo(-3, 3); ctx.lineTo(4, 3); ctx.stroke();
    ctx.strokeStyle = mixCache(skin, RIM, 0.5, 0); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-9, 10); ctx.bezierCurveTo(-11, 0, -10, -13, -1, -15); ctx.stroke();
    // 문신 룬
    ctx.strokeStyle = 'rgba(255,160,60,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-4, -9); ctx.lineTo(-2, -6); ctx.stroke();
  }
  goatLeg(2, true);
  // 뒤팔
  const castK = cast ? ease.outCubic(clamp(at / (e.params?.castWind ?? 0.65), 0, 1)) : 0;
  const armB = cast ? lerp(0.4, 2.9, castK) : swoop || dive ? 1.8 : 0.4 + Math.sin(t * 3) * 0.1;
  end(-3, -11, armB, 9); const bex = EX, bey = EY; end(bex, bey, armB + 0.5, 9); const bhx = EX, bhy = EY;
  softLimb(ctx, -3, -11, bex, bey, bhx, bhy, 3, 2.2, skinD, false);
  // 머리
  ctx.save(); ctx.translate(3, -19); ctx.rotate(dive ? 0.2 : 0);
  ctx.beginPath(); ctx.moveTo(-5, 3); ctx.quadraticCurveTo(-6, -6, 1, -7); ctx.quadraticCurveTo(7, -7, 8, -1); ctx.lineTo(9, 2); ctx.quadraticCurveTo(6, 7, 1, 6); ctx.quadraticCurveTo(-4, 6, -5, 3); ctx.closePath();
  ink(ctx, sph(ctx, 'demh', 1, -1, 8, skin), 1.8);
  // 뿔 (휘어짐)
  for (const sg of [-1, 1]) {
    ctx.beginPath(); const bx = sg > 0 ? 2 : -2;
    ctx.moveTo(bx - 1.5, -6); ctx.bezierCurveTo(bx - 2 + sg * 2, -13, bx - 8, -15, bx - 11, -11); ctx.bezierCurveTo(bx - 7, -12, bx - 3 + sg, -10, bx + 2, -5.5); ctx.closePath();
    ink(ctx, linG(ctx, 'demhorn' + sg, bx, -6, bx - 10, -13, [0, '#6a5a48', 1, horn]), 1.3);
  }
  // 뾰족 귀
  ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(-10, -5); ctx.lineTo(-3, 1); ctx.closePath(); ink(ctx, C(skinD), 1.2);
  if (!FL) {
    ctx.fillStyle = '#1a0406'; ctx.beginPath(); ctx.moveTo(3, 3); ctx.quadraticCurveTo(6, 5 + (cast ? 1.5 : 0), 8.5, 2.5); ctx.lineTo(8, 4); ctx.quadraticCurveTo(6, 6.5 + (cast ? 2 : 0), 3, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(4.5, 3.6); ctx.lineTo(5, 5.4); ctx.lineTo(5.5, 3.8); ctx.moveTo(7, 3.3); ctx.lineTo(7.4, 5); ctx.lineTo(7.8, 3.2); ctx.fill();
    eyeGlow(ctx, 4.5, -2, 1.3, '#ffe040'); eyeGlow(ctx, 7.5, -2.2, 0.9, '#ffe040', 0.8);
  }
  ctx.restore();
  // 앞팔 + 암흑 구체
  const armF = cast ? lerp(0.5, 2.6, castK) : swoop || dive ? 1.9 : 0.5 + Math.sin(t * 3 + 1) * 0.1;
  end(5, -11, armF, 9.5); const fex = EX, fey = EY; end(fex, fey, armF + (cast ? -0.3 : 0.4), 9); const fhx = EX, fhy = EY;
  softLimb(ctx, 5, -11, fex, fey, fhx, fhy, 3.4, 2.5, skin);
  claw(ctx, fhx, fhy, skin, swoop || dive ? 1 : 0);
  if (cast) {
    const r = 3 + castK * 8;
    const ox = (fhx + bhx) / 2 + 2, oy = Math.min(fhy, bhy) - r - 2;
    glow(ctx, ox, oy, r * 3.2, '#b060ff', 0.8);
    ctx.fillStyle = C('#2a0840'); ctx.beginPath(); ctx.arc(ox, oy, r, 0, TAU); ctx.fill();
    if (!FL) {
      ctx.strokeStyle = '#d8a0ff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(ox, oy, r, t * 8, t * 8 + 4); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#e8c0ff'; ctx.beginPath(); ctx.arc(ox - r * 0.3, oy - r * 0.3, r * 0.3, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    }
    if (castK > 0.6) glint(ctx, ox, oy, 6 + 8 * castK, '#e0b0ff', (castK - 0.6) / 0.4);
  }
  // 앞 날개
  ctx.save(); ctx.translate(-2, -13); ctx.rotate(-0.55); batWing(ctx, 30, dive ? -1 : swoop ? 1.2 : flap, skin, mem, '#8a3040'); ctx.restore();
  ctx.restore();
  if (swoop && !FL) glint(ctx, 14, cy - 4, 8, '#ffb0a0', clamp(at / 0.35, 0, 1));
  FL = false;
};

// ───────────────────────── 메두사 머리 ─────────────────────────
RENDER_A.medusa_head = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t;
  const skin = '#78a878', skinD = '#2e4a36', snake = '#4a8a3a', snakeB = '#c8d860';
  ctx.save(); ctx.translate(-1, -16); ctx.rotate(Math.sin(t * 3.2) * 0.14);
  glow(ctx, 0, 0, 30, '#40ff90', 0.18);
  // 뱀 머리카락 (두피에서 부채꼴로)
  for (let i = 0; i < 8; i++) {
    const A = -0.55 - i * 0.36;
    const ph = t * 8 + i * 1.7;
    let x = Math.cos(A) * 8, y = Math.sin(A) * 8 - 1, ang = A + Math.sin(ph) * 0.3;
    const back = i % 2 === 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const N = 6, L = 2.6;
    // 경로를 두 번 (외곽선 → 몸)
    for (let pass = 0; pass < 2; pass++) {
      let px = x, py = y, pa = ang;
      ctx.beginPath(); ctx.moveTo(px, py);
      for (let k = 1; k <= N; k++) { pa += Math.sin(ph - k * 1.0) * 0.42; px += Math.cos(pa) * L; py += Math.sin(pa) * L; ctx.lineTo(px, py); }
      ctx.strokeStyle = pass ? C(back ? dk(snake, -0.3) : snake) : C(OUT);
      ctx.lineWidth = pass ? 2.6 : 4.6; ctx.stroke();
      if (pass && !FL) { ctx.strokeStyle = snakeB; ctx.lineWidth = 0.9; ctx.setLineDash?.([1.2, 2.2]); ctx.stroke(); ctx.setLineDash?.([]); }
      if (pass) {
        // 뱀 머리 + 혀
        ctx.beginPath(); ctx.ellipse(px, py, 3, 2, pa, 0, TAU); ink(ctx, C(back ? dk(snake, -0.2) : lt(snake, 0.12)), 1.2);
        if (!FL) {
          ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(px + Math.cos(pa - 0.6) * 1.4, py + Math.sin(pa - 0.6) * 1.4, 0.7, 0, TAU); ctx.fill();
          if (Math.sin(ph * 1.3) > 0.5) { ctx.strokeStyle = '#ff4060'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(px + Math.cos(pa) * 2.6, py + Math.sin(pa) * 2.6); ctx.lineTo(px + Math.cos(pa) * 5.5, py + Math.sin(pa) * 5.5); ctx.stroke(); }
        }
      }
    }
  }
  // 목 절단부 (너덜너덜)
  ctx.beginPath(); ctx.moveTo(-6, 7); ctx.lineTo(4, 9); ctx.lineTo(3, 13); ctx.lineTo(1, 11); ctx.lineTo(-1, 14); ctx.lineTo(-3, 11); ctx.lineTo(-6, 13); ctx.closePath();
  ink(ctx, C(skinD), 1.4);
  // 얼굴 (측면, 여성)
  ctx.beginPath();
  ctx.moveTo(-9, -1);
  ctx.bezierCurveTo(-9, -9, -3, -12, 3, -11);
  ctx.quadraticCurveTo(8, -9.5, 8.5, -6);
  ctx.quadraticCurveTo(9, -4, 10, -2.5); ctx.lineTo(12, 0.8); ctx.lineTo(10.2, 1.8);
  ctx.quadraticCurveTo(11.4, 2.6, 10.8, 3.4);
  const m = 1 + Math.abs(Math.sin(t * 4)) * 2.2;
  ctx.lineTo(9.2, 4.2); ctx.lineTo(10.5, 5 + m * 0.6);
  ctx.quadraticCurveTo(10, 8 + m * 0.5, 7, 9);
  ctx.quadraticCurveTo(1, 10.5, -4, 8);
  ctx.quadraticCurveTo(-9, 5, -9, -1); ctx.closePath();
  ink(ctx, sph(ctx, 'medh2', 2, -1, 12, skin), 2);
  if (!FL) {
    // 입 (쉿 소리) + 송곳니
    ctx.fillStyle = '#2a0608'; ctx.beginPath(); ctx.moveTo(8.6, 4); ctx.lineTo(10.8, 3.6); ctx.lineTo(10.5, 4.6 + m * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(9.8, 3.7); ctx.lineTo(10.1, 5.6); ctx.lineTo(10.5, 3.7); ctx.fill();
    // 광대/비늘
    ctx.fillStyle = 'rgba(20,60,30,0.4)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-5 + i * 1.9, 3 + (i % 2) * 1.6, 1.1, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,220,0.18)'; ctx.beginPath(); ctx.ellipse(5, 1, 3, 1.6, 0.3, 0, TAU); ctx.fill();
    // 눈 (황금 뱀눈, 석화의 빛)
    ctx.fillStyle = '#140804'; ctx.beginPath(); ctx.moveTo(3, -3.6); ctx.quadraticCurveTo(5.8, -6, 8.4, -3.8); ctx.quadraticCurveTo(5.8, -2.2, 3, -3.6); ctx.fill();
    glow(ctx, 6, -3.8, 10, '#ffd040', 0.75);
    ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.ellipse(6, -3.8, 1.8, 1.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#140804'; ctx.fillRect(5.6, -4.9, 0.8, 2.2);
    ctx.strokeStyle = '#1a2a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2.6, -6); ctx.quadraticCurveTo(6, -8, 8.8, -6); ctx.stroke();
    ctx.strokeStyle = mixCache(skin, RIM, 0.6, 0); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-8.8, 1); ctx.bezierCurveTo(-9, -8, -3, -11.5, 2, -11); ctx.stroke();
  }
  ctx.restore();
  FL = false;
};
RENDER_A.none = () => {};

// ───────────────────────── 원혼 ─────────────────────────
RENDER_A.ghost = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t;
  const pale = '#b8d4ff', mid = '#5a78b0', deep = '#1a2240';
  const bob = Math.sin(t * 2.4) * 3;
  const fade = 0.62 + 0.25 * Math.sin(t * 1.7);
  const ga = ctx.globalAlpha;
  ctx.save(); ctx.translate(0, -30 + bob);
  glow(ctx, 0, -4, 40, '#6a9aff', 0.35 * fade);
  ctx.globalAlpha = ga * (FL ? 1 : fade);
  // 수의 (꼬리가 뒤로 흩날림)
  const w1 = Math.sin(t * 4) * 3, w2 = Math.sin(t * 4 + 1.5) * 4;
  ctx.beginPath();
  ctx.moveTo(-4, -22);
  ctx.bezierCurveTo(8, -26, 14, -14, 12, -2);
  ctx.bezierCurveTo(11, 8, 6, 14, 2 + w1, 20);
  ctx.quadraticCurveTo(-4, 16, -8 + w2, 26);
  ctx.quadraticCurveTo(-12, 16, -18 + w1, 22);
  ctx.quadraticCurveTo(-16, 8, -24 + w2, 12);
  ctx.bezierCurveTo(-18, 0, -16, -18, -4, -22);
  ctx.closePath();
  ctx.lineWidth = 2; ctx.strokeStyle = C('#0a0c1a'); ctx.stroke();
  ctx.fillStyle = FL ? WHITE : linG(ctx, 'ghostb', 0, -22, 0, 26, [0, pale, 0.45, mid, 1, 'rgba(26,34,64,0)']);
  ctx.fill();
  if (!FL) {
    // 옷자락 주름 + 림
    ctx.strokeStyle = 'rgba(20,30,70,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(4, -8); ctx.quadraticCurveTo(2, 6, -2 + w1, 16); ctx.moveTo(-6, -6); ctx.quadraticCurveTo(-10, 6, -12 + w2, 16); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(200,230,255,0.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-15, -12); ctx.bezierCurveTo(-14, -18, -9, -22, -3, -22); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  // 두건 속 얼굴
  ctx.beginPath(); ctx.ellipse(4, -13, 6.5, 7.5, 0.15, 0, TAU);
  ctx.fillStyle = C(deep); ctx.fill();
  if (!FL) {
    // 해골 얼굴 윤곽
    ctx.fillStyle = 'rgba(200,220,255,0.25)'; ctx.beginPath(); ctx.ellipse(6, -13, 4, 5, 0.1, 0, TAU); ctx.fill();
    eyeGlow(ctx, 5, -15, 1.5, '#7affff'); eyeGlow(ctx, 9, -15.2, 1.1, '#7affff', 0.8);
    // 울부짖는 입
    const m = 2 + Math.abs(Math.sin(t * 3)) * 2.5;
    ctx.fillStyle = '#05060e'; ctx.beginPath(); ctx.ellipse(7.5, -9, 1.8, m * 0.8, 0, 0, TAU); ctx.fill();
  }
  // 앙상한 손 (앞으로 뻗음)
  const reach = Math.sin(t * 2.2) * 3;
  for (let k = 0; k < 2; k++) {
    const y0 = -6 + k * 5, x0 = 6 - k * 3;
    const hx = 17 + reach - k * 3, hy = y0 + 2 + k;
    ctx.strokeStyle = C('#0a0c1a'); ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + 6, y0 - 2, hx, hy); ctx.stroke();
    ctx.strokeStyle = C(k ? mid : pale); ctx.lineWidth = 2.2; ctx.stroke();
    if (!FL) {
      ctx.strokeStyle = k ? mid : '#e8f0ff'; ctx.lineWidth = 1;
      for (let f = -1; f <= 1; f++) { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + 3, hy + f * 1.5, hx + 5, hy + 2 + f * 2); ctx.stroke(); }
    }
  }
  ctx.restore();
  ctx.globalAlpha = ga;
  FL = false;
};

// ───────────────────────── 도깨비불 ─────────────────────────
RENDER_A.wisp = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, charge = e.anim === 'charge';
  const k = charge ? clamp(e.animT / (e.params?.chargeT ?? 0.55), 0, 1) : 0;
  const sc = 1 + k * 0.45 + Math.sin(t * 9) * 0.05;
  const vx = e.vx ?? 0;
  ctx.save(); ctx.translate(0, -12); ctx.scale(sc, sc);
  const ga = ctx.globalAlpha;
  glow(ctx, 0, 0, 30 + k * 16, '#40ffc0', 0.55 + k * 0.4);
  ctx.globalCompositeOperation = FL ? 'source-over' : 'lighter';
  // 불꽃 혀 (뒤·위로 끌림)
  const lean = -0.5 - clamp(Math.abs(vx) / 200, 0, 0.6);
  for (let i = 0; i < 3; i++) {
    const fl = Math.sin(t * 14 + i * 2.1) * 2;
    const h = 14 - i * 3 + fl;
    ctx.fillStyle = FL ? WHITE : ['rgba(60,220,190,0.55)', 'rgba(120,255,220,0.6)', 'rgba(230,255,250,0.85)'][i];
    ctx.beginPath();
    const r = 8 - i * 2.2;
    ctx.moveTo(-r, 1);
    ctx.quadraticCurveTo(-r * 1.1 + Math.sin(lean) * h * 0.4, -h * 0.5, Math.sin(lean) * h + fl * 0.5, -h - 2);
    ctx.quadraticCurveTo(r * 0.9, -h * 0.4, r, 1);
    ctx.arc(0, 1, r, 0, PI);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  if (!FL) {
    // 희미한 얼굴 (해골)
    ctx.fillStyle = 'rgba(0,40,40,0.55)';
    ctx.beginPath(); ctx.ellipse(1.5, -1, 1.3, 1.8, 0, 0, TAU); ctx.ellipse(4.5, -1, 1.1, 1.6, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3, 3, 1.4, 0.9 + k, 0, 0, TAU); ctx.fill();
  }
  // 떠다니는 불티
  if (!FL) for (let i = 0; i < 3; i++) {
    const p = (t * 1.2 + i / 3) % 1;
    glow(ctx, -6 - p * 10 + Math.sin(t * 5 + i) * 2, -p * 12 + 4, 3, '#80ffd8', 1 - p);
  }
  ctx.globalAlpha = ga;
  ctx.restore();
  if (charge && !FL) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(120,255,220,${0.6 * k})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -12, 26 - k * 14, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    if (k > 0.6) glint(ctx, 0, -12, 8 + 6 * k, '#c0fff0', (k - 0.6) / 0.4);
  }
  FL = false;
};

// ───────────────────────── 유령 검 ─────────────────────────
function drawPhantomBlade(ctx, L, t, ghost) {
  // 원점 = 코등이, +x = 칼끝 방향
  const W = 5;
  if (!ghost) {
    // 손잡이 + 눈 보석 폼멜
    ctx.beginPath(); ctx.rect(-14, -2, 14, 4); ink(ctx, linG(ctx, 'phgrip', 0, -2, 0, 2, [0, '#6a3a8a', 1, '#2a1034']), 1.4);
    ctx.beginPath(); ctx.arc(-16, 0, 3.6, 0, TAU); ink(ctx, C('#c8a040'), 1.4);
    if (!FL) { glow(ctx, -16, 0, 8, '#ff3050', 0.7); ctx.fillStyle = '#ff3050'; ctx.beginPath(); ctx.arc(-16, 0, 1.8, 0, TAU); ctx.fill(); ctx.fillStyle = '#000'; ctx.fillRect(-16.4, -1.4, 0.8, 2.8); }
    // 박쥐 날개 코등이
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(-3, -9, 2, -14); ctx.quadraticCurveTo(2, -8, 5, -6); ctx.lineTo(3, -2); ctx.lineTo(3, 2); ctx.lineTo(5, 6); ctx.quadraticCurveTo(2, 8, 2, 14); ctx.quadraticCurveTo(-3, 9, 0, 2); ctx.closePath();
    ink(ctx, linG(ctx, 'phguard', 0, -14, 0, 14, [0, '#f0d890', 0.5, '#b08a30', 1, '#6a4a10']), 1.4);
  }
  // 칼날
  ctx.beginPath(); ctx.moveTo(3, -W); ctx.lineTo(L - 10, -W * 0.8); ctx.lineTo(L, 0); ctx.lineTo(L - 10, W * 0.8); ctx.lineTo(3, W); ctx.closePath();
  if (ghost) { ctx.fill(); return; }
  ink(ctx, linG(ctx, 'phblade' + L, 0, -W, 0, W, [0, '#f4f6ff', 0.45, '#b0b8d0', 0.55, '#6a7090', 1, '#3a3a58']), 1.8);
  if (!FL) {
    // 룬 홈 (보라 발광)
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(190,120,255,${0.5 + 0.4 * pulse})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(L - 14, 0); ctx.stroke();
    ctx.fillStyle = `rgba(230,200,255,${0.6 + 0.3 * pulse})`;
    for (let i = 0; i < 4; i++) { const x = 12 + i * (L - 30) / 3; ctx.fillRect(x - 1, -2.2, 2, 1.2); ctx.fillRect(x - 0.6, -2.6, 1.2, 2); }
    ctx.globalCompositeOperation = 'source-over';
  }
}
RENDER_A.phantom_sword = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim;
  const wa = e.swordA ?? HP;
  const la = (e.facing ?? 1) > 0 ? wa : PI - wa; // 로컬 각 (월드 → 오른쪽 기준)
  const aim = an === 'aim', dash = an === 'dash';
  const tremble = aim ? Math.sin(t * 70) * 1.3 : 0;
  ctx.save(); ctx.translate(tremble, -30 + (dash ? 0 : Math.sin(t * 2.5) * 3));
  // 영혼 오라
  glow(ctx, 0, 0, 38, '#9a50ff', 0.45 + (aim ? 0.3 : 0));
  // 주위를 도는 혼령
  if (!FL) for (let i = 0; i < 3; i++) {
    const a = t * 2.2 + i * TAU / 3;
    const x = Math.cos(a) * 18, y = Math.sin(a) * 9;
    glow(ctx, x, y, 7, '#c890ff', 0.8);
    ctx.fillStyle = 'rgba(240,220,255,0.9)'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
  }
  ctx.rotate(la);
  ctx.translate(-22, 0);
  // 잔상
  if (dash && !FL) {
    const ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i <= 3; i++) { ctx.globalAlpha = ga * (0.35 - i * 0.09); ctx.fillStyle = '#a060ff'; ctx.save(); ctx.translate(-i * 14, 0); drawPhantomBlade(ctx, 56, t, true); ctx.restore(); }
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = 'source-over';
  }
  drawPhantomBlade(ctx, 56, t, false);
  // 영혼의 손 (자루를 쥔 반투명 손)
  if (!FL) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(170,120,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-8, 0, 6, 4.5, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-10, -3); ctx.quadraticCurveTo(-22, -10 + Math.sin(t * 3) * 3, -30, -4 + Math.sin(t * 4) * 4); ctx.quadraticCurveTo(-22, 2, -10, 3); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (aim) glint(ctx, 56, 0, 6 + 8 * clamp(e.animT / 0.5, 0, 1), '#f0d8ff', clamp(e.animT / 0.35, 0, 1));
  ctx.restore();
  FL = false;
};
/** 유령 검 잔상 (world.fx.ghost 용, 월드 좌표) */
export function drawPhantomGhost(ctx, x, y, ang, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.translate(-22, 0);
  ctx.globalAlpha *= a; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#9a5aff';
  drawPhantomBlade(ctx, 56, 0, true);
  ctx.restore();
}

// ───────────────────────── 저주 인형 ─────────────────────────
RENDER_A.puppet_maiden = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const por = '#f4ece4', porD = '#b8aca4', dress = '#1e1024', dressR = '#8a1030', hair = '#e8c878', frill = '#f0e8e0';
  const crouch = an === 'crouch', jump = an === 'jump', thr = an === 'throw';
  // 끊기는 인형 움직임 (프레임을 계단식으로)
  const tq = Math.floor(t * 8) / 8;
  let squash = crouch ? 0.8 : 1, headTilt = Math.sin(tq * 2.3) * 0.25, armA = 0.2 + Math.sin(tq * 3) * 0.15, legSpread = 0;
  let bodyY = 0;
  if (jump) { armA = 2.2 + Math.sin(t * 6) * 0.2; legSpread = 0.5; headTilt = -0.2; }
  if (thr) { const k = ease.outCubic(clamp(at / (e.params?.throwWind ?? 0.45), 0, 1)); armA = lerp(0.2, 1.9, k); headTilt = 0.4 * Math.sin(t * 20) * k; }
  const hurt = hurtOf(e);
  if (hurt) headTilt = -0.6;
  if (!jump) shadow(ctx, 12);
  // 조종 실 (위로)
  if (!FL) {
    ctx.strokeStyle = 'rgba(230,230,255,0.35)'; ctx.lineWidth = 0.7;
    const sy = -220;
    ctx.beginPath(); ctx.moveTo(0, -56 * squash); ctx.lineTo(Math.sin(t) * 6, sy);
    ctx.moveTo(-9, -36 * squash); ctx.lineTo(-14 + Math.sin(t * 1.3) * 5, sy);
    ctx.moveTo(10, -36 * squash); ctx.lineTo(16 + Math.sin(t * 1.1) * 5, sy); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const gy = -60 - ((t * 60) % 120); ctx.fillRect(Math.sin(t) * 6 * (gy / sy) - 0.5, gy, 1, 3);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.save(); ctx.translate(0, bodyY); ctx.scale(1, squash);
  // 다리 (구체관절)
  const leg = (x, a, near) => {
    const c = near ? por : porD;
    end(x, -20, a, 10); const kx = EX, ky = EY; end(kx, ky, a * 0.4, 10);
    softLimb(ctx, x, -20, kx, ky, EX, EY, 2.2, 1.8, c, near);
    ctx.beginPath(); ctx.arc(kx, ky, 2.2, 0, TAU); ink(ctx, C(c), 1);
    ctx.beginPath(); ctx.ellipse(EX + 1.5, EY - 0.5, 3, 1.8, 0, 0, TAU); ink(ctx, C('#1a0a10'), 1.2);
  };
  leg(-3, -0.15 - legSpread, false);
  leg(3, 0.15 + legSpread, true);
  // 치마 (프릴)
  const sw = Math.sin(t * 3) * 1.5 + (jump ? -3 : 0);
  ctx.beginPath(); ctx.moveTo(-6, -40); ctx.lineTo(6, -40);
  ctx.quadraticCurveTo(14, -30, 15 + sw * 0.3, -19); ctx.lineTo(-15 + sw, -19); ctx.quadraticCurveTo(-13, -30, -6, -40); ctx.closePath();
  ink(ctx, cyl(ctx, 'pskirt', -15, 15, dress), 1.8);
  if (!FL) {
    ctx.fillStyle = frill;
    ctx.beginPath(); ctx.moveTo(-15 + sw, -19);
    for (let i = 0; i <= 10; i++) { const x = -15 + sw + i * (30 - sw * 0.7) / 10; ctx.lineTo(x, -19 + (i % 2 ? 3 : 0.5)); }
    ctx.lineTo(15 + sw * 0.3, -21); ctx.lineTo(-15 + sw, -21); ctx.fill();
    ctx.fillStyle = dressR; ctx.beginPath(); ctx.moveTo(-2, -39); ctx.lineTo(3, -39); ctx.lineTo(6, -22); ctx.lineTo(-4, -22); ctx.closePath(); ctx.fill();
  }
  // 몸통 (코르셋)
  ctx.beginPath(); ctx.moveTo(-5, -50); ctx.lineTo(6, -50); ctx.lineTo(5, -39); ctx.lineTo(-5, -39); ctx.closePath();
  ink(ctx, cyl(ctx, 'pcors', -5, 6, dress), 1.6);
  if (!FL) { ctx.fillStyle = frill; ctx.beginPath(); ctx.moveTo(-5, -50); ctx.lineTo(6, -50); ctx.lineTo(4, -47); ctx.lineTo(0, -45); ctx.lineTo(-4, -47); ctx.fill(); ctx.fillStyle = dressR; ctx.beginPath(); ctx.arc(0.5, -48, 1.5, 0, TAU); ctx.fill(); }
  // 팔
  const arm = (x, a, near) => {
    const c = near ? por : porD;
    end(x, -48, a, 8); const ex = EX, ey = EY; end(ex, ey, a + 0.4, 8);
    softLimb(ctx, x, -48, ex, ey, EX, EY, 2, 1.6, c, near);
    ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, TAU); ink(ctx, C(c), 1);
    // 손에 든 바늘
    if (thr && near && !FL) {
      ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(EX, EY); ctx.lineTo(EX + Math.cos(i * 0.4 - 0.3) * 9, EY + Math.sin(i * 0.4 - 0.3) * 9); ctx.stroke(); }
      const k = clamp(at / (e.params?.throwWind ?? 0.45), 0, 1);
      if (k > 0.5) glint(ctx, EX + 8, EY - 2, 5 + 4 * k, '#ffffff', (k - 0.5) * 2);
    }
  };
  arm(-4, -armA * 0.8, false);
  // 머리 (큰 도자기 얼굴 + 곱슬 금발)
  ctx.save(); ctx.translate(1, -58); ctx.rotate(headTilt);
  ctx.beginPath(); ctx.moveTo(-9, 2); ctx.quadraticCurveTo(-12, 12, -8, 16 + Math.sin(t * 2) * 1); ctx.lineTo(-5, 4); ctx.closePath(); ink(ctx, C(dk(hair, -0.2)), 1.4);
  ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, TAU); ink(ctx, sph(ctx, 'phead', 0, 0, 8.5, por), 1.8);
  // 앞머리 + 컬
  ctx.beginPath(); ctx.moveTo(-9, 1); ctx.bezierCurveTo(-10, -10, 6, -12, 9, -3); ctx.quadraticCurveTo(4, -6, 1, -4); ctx.quadraticCurveTo(-3, -1, -9, 1); ctx.closePath();
  ink(ctx, sph(ctx, 'phair', -1, -5, 9, hair), 1.4);
  for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(-7 + i * 2, 6 + i * 4, 2.2, 3.2, 0.3, 0, TAU); ink(ctx, C(hair), 1.2); }
  // 리본
  ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(-9, -12); ctx.lineTo(-8, -5); ctx.closePath(); ctx.moveTo(-3, -8); ctx.lineTo(2, -13); ctx.lineTo(3, -7); ctx.closePath(); ink(ctx, C(dressR), 1.2);
  if (!FL) {
    // 금 간 도자기 + 유리눈
    ctx.strokeStyle = '#6a5a5a'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(4, 0); ctx.lineTo(6, 3); ctx.lineTo(4.5, 6); ctx.stroke();
    ctx.fillStyle = '#e8a0a0'; ctx.globalAlpha *= 0.6; ctx.beginPath(); ctx.arc(5.5, 3.5, 1.8, 0, TAU); ctx.fill(); ctx.globalAlpha /= 0.6;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(3.5, -0.5, 2.2, 2.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a6ab0'; ctx.beginPath(); ctx.arc(4.2, -0.3, 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(4.4, -0.3, 0.7, 0, TAU); ctx.fill();
    eyeGlow(ctx, 7.6, -0.4, 1, '#ff2030', 1);
    ctx.strokeStyle = '#2a0a10'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(4, 5.5); ctx.quadraticCurveTo(6, 6.8 + (thr ? 1.2 : 0), 7.6, 5); ctx.stroke();
    ctx.strokeStyle = '#6a5a5a'; ctx.beginPath(); ctx.moveTo(4.5, 5.8); ctx.lineTo(4.5, 8.5); ctx.moveTo(7.2, 5.5); ctx.lineTo(7.2, 8); ctx.stroke();
  }
  ctx.restore();
  arm(5, armA, true);
  ctx.restore();
  FL = false;
};

// ───────────────────────── 해골 기둥 ─────────────────────────
function dragonSkull(ctx, r, bone, glowK, open, t) {
  // 용 두개골 (측면), 원점 = 두개 중심
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, r * 0.2);
  ctx.bezierCurveTo(-r * 1.2, -r * 1.1, r * 0.4, -r * 1.2, r * 0.9, -r * 0.5);
  ctx.lineTo(r * 2.0, -r * 0.3); ctx.quadraticCurveTo(r * 2.25, -r * 0.05, r * 2.0, r * 0.15);
  ctx.lineTo(r * 0.8, r * 0.2);
  ctx.lineTo(r * 1.9, r * (0.35 + open)); ctx.quadraticCurveTo(r * 1.2, r * (0.8 + open * 0.8), r * 0.2, r * 0.8);
  ctx.quadraticCurveTo(-r * 0.8, r * 0.9, -r * 1.1, r * 0.2); ctx.closePath();
  ink(ctx, sph(ctx, 'dsk' + bone + r, 0, -r * 0.2, r * 1.4, bone), 1.8);
  // 뿔
  ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.8); ctx.quadraticCurveTo(-r * 1.4, -r * 1.5, -r * 2.1, -r * 1.2); ctx.quadraticCurveTo(-r * 1.2, -r * 1.0, -r * 0.9, -r * 0.4); ctx.closePath();
  ink(ctx, C(dk(bone, -0.2)), 1.3);
  if (FL) return;
  // 입 속 불빛
  ctx.fillStyle = '#1a0604'; ctx.beginPath(); ctx.moveTo(r * 0.8, r * 0.2); ctx.lineTo(r * 2.0, r * 0.18); ctx.lineTo(r * 1.9, r * (0.35 + open)); ctx.closePath(); ctx.fill();
  if (glowK > 0.02) {
    glow(ctx, r * 1.6, r * 0.3, r * (1.2 + glowK * 2.2), '#ff7a2a', glowK);
    glow(ctx, r * 1.5, r * 0.3, r * (0.5 + glowK), '#fff0a0', glowK);
  }
  ctx.fillStyle = '#f4ecd8';
  for (let i = 0; i < 4; i++) { const x = r * (0.95 + i * 0.26); ctx.beginPath(); ctx.moveTo(x, r * 0.18); ctx.lineTo(x + r * 0.08, r * 0.42); ctx.lineTo(x + r * 0.16, r * 0.18); ctx.fill(); }
  ctx.fillStyle = '#0c0606'; ctx.beginPath(); ctx.ellipse(r * 0.1, -r * 0.35, r * 0.38, r * 0.3, -0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 1.8, -r * 0.2, r * 0.12, r * 0.08, 0, 0, TAU); ctx.fill();
  eyeGlow(ctx, r * 0.15, -r * 0.35, r * 0.12, '#ff5a20', 0.6 + glowK * 0.6);
}
RENDER_A.bone_pillar = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const bone = '#ddd0b2';
  const charge = an === 'charge', fire = an === 'fire';
  const wind = e.params?.chargeT ?? 0.6;
  const k = charge ? clamp(at / wind, 0, 1) : fire ? clamp(1 - at / 0.3, 0, 1) : 0.15 + 0.1 * Math.sin(t * 3);
  shadow(ctx, 20);
  // 뼈 무더기 받침
  const pile = [[-16, -3, -4, -8], [-2, -2, 14, -7], [-10, -9, 8, -12], [4, -4, 17, -1]];
  for (const p of pile) boneSeg(ctx, p[0], p[1], p[2], p[3], 3.2, dk(bone, -0.15));
  // 척추 기둥
  for (let i = 0; i < 9; i++) {
    const y = -12 - i * 9;
    ctx.beginPath(); ctx.ellipse(-2, y, 7 - (i % 2), 4, 0, 0, TAU); ink(ctx, cyl(ctx, 'vert' + (i % 2), -9, 5, dk(bone, -0.1)), 1.6);
    if (!FL) { ctx.fillStyle = dk(bone, -0.4); ctx.fillRect(-9, y - 0.6, 14, 1.2); }
  }
  // 두개골 3개 (위일수록 큼)
  const skulls = [[-40, 7.5, 0.3], [-62, 8.5, 1.1], [-84, 9.5, 2.0]];
  for (const [y, r, ph] of skulls) {
    const shake = charge ? Math.sin(t * 50 + ph) * 1.2 * k : 0;
    const open = (charge ? 0.25 * k : fire ? 0.45 * k : 0.05) + Math.sin(t * 2 + ph) * 0.02;
    ctx.save(); ctx.translate(-4 + shake, y); ctx.rotate(Math.sin(t * 1.5 + ph) * 0.05);
    dragonSkull(ctx, r, bone, k, open, t);
    ctx.restore();
  }
  if (charge && k > 0.55 && !FL) { glint(ctx, 16, -80, 5 + 6 * k, '#ffc080', (k - 0.55) / 0.45); glint(ctx, 14, -58, 4 + 5 * k, '#ffc080', (k - 0.55) / 0.45); }
  FL = false;
};

// ───────────────────────── 시체 벌레 ─────────────────────────
RENDER_A.corpse_worm = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const flesh = '#e6c6a0', fleshD = '#8a6a50', pink = '#c07a80';
  const walking = an === 'walk';
  const atk = an === 'attack';
  const P = e.params || {};
  const ap = atk ? atkPhase(at, P.windup ?? 0.45, 0.1) : null;
  const rear = ap ? (ap.s <= 0 ? ease.outCubic(ap.w) : 1 - ease.inCubic(ap.s)) : 0;
  const lunge = ap && ap.s > 0 ? ease.outBack(ap.s) * clamp(1 - ap.after / 0.35, 0, 1) : 0;
  shadow(ctx, 26, 0.3);
  const N = 8;
  // 꼬리 → 머리 순서로 마디 (뒤에서 앞으로 그리기)
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1); // 0=꼬리, 1=머리
    const r = 4 + u * 5.5;
    const wave = walking ? Math.sin(t * 8 - u * 6) : Math.sin(t * 2 - u * 4) * 0.3;
    let x = -26 + u * 44 + (walking ? wave * 1.5 : 0) + lunge * 10 * u * u;
    let y = -r - Math.max(0, wave) * 2.2;
    // 몸을 치켜세움
    const lift = rear * Math.max(0, u - 0.45) / 0.55;
    y -= lift * lift * 22; x -= lift * 6 - lunge * u * 6;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.05, r, lift * -0.8, 0, TAU);
    ink(ctx, sph(ctx, 'worm' + i, 0, 0, r, i % 2 ? flesh : dk(flesh, -0.08)), 1.6);
    if (!FL) {
      ctx.strokeStyle = 'rgba(90,50,40,0.5)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.ellipse(x - r * 0.3, y, r * 0.5, r * 0.95, lift * -0.8, -HP, HP); ctx.stroke();
      // 작은 다리털
      ctx.strokeStyle = fleshD; ctx.beginPath(); ctx.moveTo(x, y + r * 0.9); ctx.lineTo(x - 1.5 + Math.sin(t * 12 + i) * 1.5, y + r + 2); ctx.stroke();
    }
    if (i === N - 1) {
      // 머리: 갈고리 이빨 입
      const open = 0.25 + rear * 0.8 + (walking ? Math.abs(Math.sin(t * 5)) * 0.2 : 0);
      ctx.save(); ctx.translate(x + r * 0.7, y); ctx.rotate(-lift * 0.9);
      ctx.beginPath(); ctx.ellipse(2, 0, 4, 3 + open * 3, 0, 0, TAU); ink(ctx, C('#3a0a10'), 1.4);
      if (!FL) {
        ctx.fillStyle = '#f0e0c0';
        for (let j = 0; j < 5; j++) { const a = -1.2 + j * 0.6; ctx.beginPath(); ctx.moveTo(2 + Math.cos(a) * 4, Math.sin(a) * (3 + open * 3)); ctx.lineTo(2 + Math.cos(a) * 1.5, Math.sin(a) * (1 + open)); ctx.lineTo(2 + Math.cos(a + 0.25) * 4, Math.sin(a + 0.25) * (3 + open * 3)); ctx.fill(); }
        ctx.fillStyle = pink; ctx.beginPath(); ctx.arc(1, 0, 1.2, 0, TAU); ctx.fill();
        eyeGlow(ctx, -3, -r * 0.55, 1, '#ff3040', 0.9);
      }
      ctx.restore();
      if (ap && ap.s <= 0 && ap.w > 0.5) glint(ctx, x + r + 4, y, 5 + 5 * ap.w, '#ffd0d0', (ap.w - 0.5) * 2);
    }
  }
  // 점액
  if (!FL) { ctx.fillStyle = 'rgba(200,210,150,0.35)'; ctx.beginPath(); ctx.ellipse(-8, -0.5, 22, 1.5, 0, 0, TAU); ctx.fill(); }
  FL = false;
};

// ───────────────────────── 마도서 악령 ─────────────────────────
RENDER_A.book_fiend = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const cover = '#7a1628', coverD = '#400a16', gold = '#e0b850', page = '#f2e6c8';
  const cast = an === 'cast', bite = an === 'bite';
  const k = cast ? clamp(at / (e.params?.castT ?? 0.55), 0, 1) : 0;
  // 펼침 정도 (날갯짓): c=1 완전히 펼침, 작을수록 접힘(원근 단축)
  const ph = t * (bite ? 18 : 9);
  const c1 = bite ? 0.3 + Math.abs(Math.sin(ph)) * 0.6 : 0.55 + Math.sin(ph) * 0.4 + k * 0.3;
  const c2 = bite ? c1 : 0.55 + Math.sin(ph + 0.4) * 0.4 + k * 0.3;
  const lift1 = Math.cos(ph) * 5, lift2 = Math.cos(ph + 0.4) * 5;
  ctx.save(); ctx.translate(0, -15 + Math.sin(t * 3) * 2); ctx.rotate(Math.sin(t * 2.2) * 0.08 + (bite ? 0.25 : 0) + (cast ? Math.sin(t * 40) * 0.04 * k : 0));
  if (cast) { glow(ctx, 0, 0, 30 + k * 12, '#ffcf60', 0.45 * k); drawRuneCircle(ctx, 0, 0, 20 + k * 6, t * 2, '#ffd070', 0.8 * k, false); }
  glow(ctx, 0, 0, 22, '#ff5060', 0.22);
  const W = 17, H = 12;
  // 표지 한 쪽 (sg: -1 왼쪽/뒤, +1 오른쪽/앞)
  const coverSide = (sg, cc, lift) => {
    const x = sg * W * cc;
    ctx.beginPath(); ctx.moveTo(0, -H); ctx.lineTo(x, -H - lift * sg * 0.4 - 2); ctx.lineTo(x, H - lift * sg * 0.4 + 2); ctx.lineTo(0, H); ctx.closePath();
    ink(ctx, FL ? WHITE : (sg > 0 ? cover : coverD), 1.8);
    if (!FL) {
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.moveTo(x, -H - lift * sg * 0.4 - 2); ctx.lineTo(x - sg * 4 * cc, -H - lift * sg * 0.4 - 2); ctx.lineTo(x, -H - lift * sg * 0.4 + 3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, H - lift * sg * 0.4 + 2); ctx.lineTo(x - sg * 4 * cc, H - lift * sg * 0.4 + 2); ctx.lineTo(x, H - lift * sg * 0.4 - 3); ctx.fill();
    }
  };
  const pagesSide = (sg, cc, lift) => {
    for (let i = 0; i < 3; i++) {
      const pc = cc * (0.92 - i * 0.12) + Math.sin(t * 13 + i * 2 + sg) * 0.05;
      const x = sg * (W - 1.5) * pc;
      ctx.beginPath(); ctx.moveTo(0, -H + 1.5); ctx.quadraticCurveTo(x * 0.5, -H - lift * sg * 0.2 - 1, x, -H - lift * sg * 0.35); ctx.lineTo(x, H - lift * sg * 0.35); ctx.quadraticCurveTo(x * 0.5, H + 1, 0, H - 1.5); ctx.closePath();
      ink(ctx, C(i % 2 ? page : dk(page, -0.1)), 1);
    }
    if (!FL && cc > 0.35) {
      ctx.fillStyle = 'rgba(70,30,20,0.5)';
      for (let l = 0; l < 5; l++) { const y = -H + 5 + l * 4; ctx.fillRect(sg > 0 ? 3 : -3 - (W - 7) * cc, y, (W - 8) * cc, 0.9); }
      if (cast) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,210,120,${0.6 * k})`; for (let l = 0; l < 5; l++) { const y = -H + 5 + l * 4; ctx.fillRect(sg > 0 ? 3 : -3 - (W - 7) * cc, y, (W - 8) * cc * (0.5 + 0.5 * Math.sin(t * 10 + l)), 1.2); } ctx.globalCompositeOperation = 'source-over'; }
    }
    // 물기: 페이지 가장자리 이빨
    if (bite && !FL) {
      ctx.fillStyle = '#fff8e8'; const x = sg * (W - 1.5) * cc * 0.92;
      for (let i = 0; i < 4; i++) { const y = -H + 3 + i * 6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sg * 4, y + 2); ctx.lineTo(x, y + 4); ctx.fill(); }
    }
  };
  coverSide(-1, c1, lift1);
  pagesSide(-1, c1, lift1);
  coverSide(1, c2, lift2);
  pagesSide(1, c2, lift2);
  // 책등 + 가운데 눈
  ctx.beginPath(); ctx.rect(-1.5, -H - 1, 3, H * 2 + 2); ink(ctx, C(coverD), 1.2);
  ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 3.4, 0, 0, TAU); ink(ctx, C('#fff4e0'), 1.3);
  if (!FL) {
    const look = Math.sin(t * 1.3) * 1.2;
    glow(ctx, look, 0, 10, '#ff3040', 0.6 + k * 0.4);
    ctx.fillStyle = '#c01830'; ctx.beginPath(); ctx.arc(0.8 + look, 0, 2.3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillRect(0.4 + look, -1.8, 0.9, 3.6);
    ctx.fillStyle = '#fff'; ctx.fillRect(1.6 + look, -1.4, 0.8, 0.8);
  }
  ctx.restore();
  // 떠다니는 글자
  if (!FL) {
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = cast ? '#ffe090' : 'rgba(255,200,140,0.5)';
    for (let i = 0; i < 3; i++) { const p = (t * 0.8 + i / 3) % 1; const x = -10 + i * 10 + Math.sin(t * 3 + i) * 3, y = -20 - p * 18; ctx.fillRect(x, y, 2, 3); ctx.fillRect(x - 1, y + 1, 4, 1); }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (k > 0.55) glint(ctx, 12, -15, 5 + 6 * k, '#fff0c0', (k - 0.55) / 0.45);
  FL = false;
};

// ───────────────────────── 벼룩 사내 ─────────────────────────
RENDER_A.flea_man = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim;
  const skin = '#c8a890', cloak = '#3a3048', cloakD = '#221a2e';
  const crouch = an === 'crouch', jump = an === 'jump' || !e.onGround && an !== 'idle' && an !== 'crouch';
  const sq = crouch ? 0.72 : 1;
  const hurt = hurtOf(e);
  if (!jump) shadow(ctx, 9);
  ctx.save(); ctx.scale(crouch ? 1.12 : 1, sq);
  const bounce = !jump && !crouch ? Math.abs(Math.sin(t * 9)) * 1.5 : 0;
  ctx.translate(0, -bounce);
  // 다리 (개구리처럼 접힘)
  const legA = jump ? 1.3 : 0.9, legB = jump ? -0.4 : -2.1;
  for (let k = 0; k < 2; k++) {
    const near = k === 1, x = near ? 2 : -3;
    end(x, -9, legA - (near ? 0 : 0.3), 7); const kx = EX, ky = EY; end(kx, ky, legA + legB, 8);
    softLimb(ctx, x, -9, kx, ky, EX, EY, 2.4, 1.6, near ? skin : dk(skin, -0.3), near);
    ctx.beginPath(); ctx.ellipse(EX + 2, EY, 3, 1.5, 0, 0, TAU); ink(ctx, C('#2a1e18'), 1);
  }
  // 누더기 망토 몸통 (웅크림)
  const fl = jump ? -4 + Math.sin(t * 20) * 2 : Math.sin(t * 4) * 1;
  ctx.beginPath();
  ctx.moveTo(-8, -8); ctx.quadraticCurveTo(-10, -20, -2, -24); ctx.quadraticCurveTo(7, -25, 8, -16); ctx.lineTo(7, -8);
  ctx.lineTo(4, -5); ctx.lineTo(1, -8); ctx.lineTo(-3, -4 + fl * 0.3); ctx.lineTo(-6, -7); ctx.lineTo(-11 + fl, -3); ctx.closePath();
  ink(ctx, cyl(ctx, 'fleac', -11, 8, cloak), 1.6);
  // 큰 머리
  ctx.save(); ctx.translate(4, -25); ctx.rotate(jump ? 0.3 : Math.sin(t * 5) * 0.12 + (hurt ? -0.4 : 0));
  ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, TAU); ink(ctx, sph(ctx, 'fleah', 0, 0, 6.5, skin), 1.6);
  // 두건
  ctx.beginPath(); ctx.moveTo(-7, 3); ctx.bezierCurveTo(-8, -8, 3, -10, 6, -5); ctx.quadraticCurveTo(0, -5, -3, 0); ctx.closePath(); ink(ctx, C(cloakD), 1.3);
  if (!FL) {
    // 튀어나온 눈 + 쭉 찢어진 웃음
    ctx.fillStyle = '#fff8e0'; ctx.beginPath(); ctx.arc(3.2, -1, 2.3, 0, TAU); ctx.arc(6, -1.5, 1.7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a0a04'; ctx.beginPath(); ctx.arc(3.8, -0.8, 0.9, 0, TAU); ctx.arc(6.3, -1.3, 0.7, 0, TAU); ctx.fill();
    glow(ctx, 4, -1, 6, '#ffe060', 0.5);
    ctx.fillStyle = '#2a0608'; ctx.beginPath(); ctx.moveTo(0, 2.5); ctx.quadraticCurveTo(4, 6.5, 7.2, 2); ctx.quadraticCurveTo(4, 4, 0, 2.5); ctx.fill();
    ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) ctx.fillRect(2 + i * 1.6, 3.2 - i * 0.1, 0.9, 1.1);
    // 커다란 귀
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(-2, 1, 1.6, 2.8, -0.3, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // 팔 + 작은 칼
  const armA = jump ? 2.4 : crouch ? 1.4 : 1.0 + Math.sin(t * 6) * 0.2;
  end(4, -18, armA, 6); const ex = EX, ey = EY; end(ex, ey, armA - 0.6, 6);
  softLimb(ctx, 4, -18, ex, ey, EX, EY, 1.8, 1.4, skin);
  ctx.save(); ctx.translate(EX, EY); ctx.rotate(-(armA - 0.6) + (jump ? 0.5 : 1.2));
  ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(1, 0); ctx.lineTo(1.5, 8); ctx.quadraticCurveTo(-2, 10, -3, 6); ctx.closePath(); ink(ctx, C('#b8bcc8'), 1.2);
  ctx.restore();
  ctx.restore();
  if (crouch && !FL) glint(ctx, 8, -18, 5, '#ffe080', 0.7);
  FL = false;
};

// ───────────────────────── 학자 유령 ─────────────────────────
RENDER_A.scholar_ghost = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const robe = '#6a78b8', robeL = '#c8d4ff', skin = '#d8e4ff', beard = '#f0f4ff';
  const cast = an === 'cast';
  const k = cast ? clamp(at / (e.params?.castT ?? 0.7), 0, 1) : 0;
  let a = 0.8;
  if (an === 'appear') a = clamp(at / 0.45, 0, 1) * 0.8;
  if (an === 'vanish') a = (1 - clamp(at / 0.45, 0, 1)) * 0.8;
  if (an === 'hidden') a = 0;
  if (a <= 0.01 && !FL) { FL = false; return; }
  const dist = an === 'appear' || an === 'vanish' ? (1 - a / 0.8) : 0;
  const ga = ctx.globalAlpha;
  ctx.save(); ctx.translate(0, -36 + Math.sin(t * 2) * 3);
  if (dist > 0) ctx.scale(1 - dist * 0.5, 1 + dist * 0.6);
  glow(ctx, 0, 0, 44, '#8aa0ff', 0.35 * a);
  ctx.globalAlpha = ga * (FL ? 1 : a + 0.15);
  // 로브 (아래로 연기처럼 흩어짐)
  const w1 = Math.sin(t * 3) * 3, w2 = Math.sin(t * 3 + 2) * 3;
  ctx.beginPath();
  ctx.moveTo(-6, -18); ctx.quadraticCurveTo(8, -20, 11, -8);
  ctx.quadraticCurveTo(14, 8, 8 + w1, 22); ctx.quadraticCurveTo(3, 18, 0 + w2, 30); ctx.quadraticCurveTo(-5, 20, -10 + w1, 26);
  ctx.quadraticCurveTo(-14, 12, -20 + w2, 16); ctx.quadraticCurveTo(-14, -2, -12, -10); ctx.quadraticCurveTo(-10, -17, -6, -18); ctx.closePath();
  ctx.lineWidth = 2; ctx.strokeStyle = C('#0a0c1c'); ctx.stroke();
  ctx.fillStyle = FL ? WHITE : linG(ctx, 'schrobe', 0, -18, 0, 30, [0, robeL, 0.35, robe, 1, 'rgba(40,50,100,0)']); ctx.fill();
  if (!FL) {
    ctx.strokeStyle = '#e8d890'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(4, -17); ctx.quadraticCurveTo(7, 0, 4 + w1 * 0.5, 16); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,30,70,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(-8, 6, -8 + w2, 18); ctx.stroke();
  }
  // 뒤팔 (책 든 손)
  const bookA = cast ? -0.2 - k * 0.3 : 0.1;
  // 머리
  ctx.save(); ctx.translate(2, -24);
  ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 7.5, 0.1, 0, TAU); ink(ctx, sph(ctx, 'schh', 0, 0, 7, skin), 1.6);
  // 긴 수염
  ctx.beginPath(); ctx.moveTo(-1, 3); ctx.quadraticCurveTo(7, 3, 7, 6); ctx.quadraticCurveTo(5, 16 + Math.sin(t * 2) * 2, 0 + Math.sin(t * 2.5) * 2, 22); ctx.quadraticCurveTo(-2, 12, -1, 3); ctx.closePath();
  ink(ctx, cyl(ctx, 'schb', -2, 7, beard), 1.3);
  // 학사모
  ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(8, -7); ctx.lineTo(7, -3); ctx.lineTo(-7, -2); ctx.closePath(); ink(ctx, C('#2a2a4a'), 1.3);
  ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(4, -12); ctx.lineTo(14, -8); ctx.lineTo(0, -4); ctx.closePath(); ink(ctx, C('#3a3a5a'), 1.3);
  if (!FL) {
    ctx.strokeStyle = '#e8c860'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(-8, -6); ctx.lineTo(-9 + Math.sin(t * 3), 1); ctx.stroke();
    // 안경 (반짝)
    ctx.strokeStyle = '#c8b060'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(3.5, -0.5, 2, 0, TAU); ctx.moveTo(5.5, -0.5); ctx.lineTo(7, -1); ctx.stroke();
    eyeGlow(ctx, 3.8, -0.5, 1.1, '#a0c0ff');
    glint(ctx, 2.5, -1.6, 3, '#ffffff', 0.4 + 0.4 * Math.sin(t * 4));
    ctx.fillStyle = '#0a0c20'; ctx.beginPath(); ctx.ellipse(5.2, 3, 1.3, 1 + k, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // 책
  ctx.save(); ctx.translate(12, -6); ctx.rotate(bookA);
  const open = 0.3 + k * 0.7 + Math.sin(t * 3) * 0.05;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7 * open, -6); ctx.lineTo(-7 * open, 4); ctx.lineTo(0, 7); ctx.closePath(); ink(ctx, C('#f0e4c4'), 1.2);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, -5 * open); ctx.lineTo(8, 5); ctx.lineTo(0, 7); ctx.closePath(); ink(ctx, C('#e8dcbc'), 1.2);
  if (!FL && cast) { glow(ctx, 2, 0, 16 + k * 10, '#a0b8ff', 0.8 * k); }
  ctx.restore();
  // 앞팔 (주문 손)
  const hA = cast ? lerp(0.6, 2.4, ease.outCubic(k)) : 0.6 + Math.sin(t * 1.8) * 0.1;
  end(6, -14, hA, 9); const ex = EX, ey = EY; end(ex, ey, hA + 0.3, 8);
  ctx.strokeStyle = C('#0a0c1c'); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(6, -14); ctx.lineTo(ex, ey); ctx.lineTo(EX, EY); ctx.stroke();
  ctx.strokeStyle = C(robeL); ctx.lineWidth = 3; ctx.stroke();
  if (cast && !FL) {
    drawRuneCircle(ctx, EX + 4, EY - 4, 8 + k * 10, t * 3, '#b0c0ff', k, false);
    if (k > 0.55) glint(ctx, EX + 4, EY - 4, 5 + 7 * k, '#e0e8ff', (k - 0.55) / 0.45);
  }
  ctx.restore();
  ctx.globalAlpha = ga;
  FL = false;
};

// ───────────────────────── 엑토플라즘 ─────────────────────────
RENDER_A.ectoplasm = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const squash = an === 'squash' ? clamp(at / 0.35, 0, 1) : 0;
  const lunge = an === 'lunge' ? 1 : 0;
  const sx = 1 + squash * 0.25 - lunge * 0.1, sy = 1 - squash * 0.25 + lunge * 0.05;
  const ga = ctx.globalAlpha;
  ctx.save(); ctx.translate(0, -20 + Math.sin(t * 2.6) * 2);
  glow(ctx, 0, 0, 34, '#50ff90', 0.35);
  ctx.scale(sx, sy);
  const B = BLOBPTS, N = 16;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    let r = 17 + Math.sin(t * 3 + i * 1.9) * 1.8 + Math.sin(t * 5 + i * 0.7) * 1.2;
    if (lunge && Math.cos(a) > 0.3) r += 5 * Math.cos(a);
    if (Math.sin(a) > 0.6) r += 3 + Math.sin(t * 4 + i) * 2; // 아래쪽 흘러내림
    B[i * 2] = Math.cos(a) * r; B[i * 2 + 1] = Math.sin(a) * r * 0.92;
  }
  smoothClosed(ctx, B, N);
  ctx.lineWidth = 2; ctx.strokeStyle = C('#04140a'); ctx.stroke();
  ctx.globalAlpha = ga * (FL ? 1 : 0.8);
  ctx.fillStyle = FL ? WHITE : radG(ctx, 'ectob', 4, -6, 1, 0, 0, 22, [0, '#e0ffe8', 0.35, '#70e8a0', 0.8, '#1e7a4a', 1, '#0e3a24']);
  ctx.fill();
  ctx.globalAlpha = ga;
  if (!FL) {
    // 안에서 떠오르는 얼굴들
    ctx.save(); smoothClosed(ctx, B, N); ctx.clip();
    for (let i = 0; i < 3; i++) {
      const a = t * 0.7 + i * 2.1;
      const fx = Math.cos(a) * 7, fy = Math.sin(a * 1.3) * 6;
      const fa = 0.35 + 0.25 * Math.sin(t * 2 + i);
      ctx.fillStyle = `rgba(4,30,16,${fa})`;
      ctx.beginPath(); ctx.ellipse(fx - 2, fy - 2, 1.4, 2, 0, 0, TAU); ctx.ellipse(fx + 2, fy - 2, 1.4, 2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(fx, fy + 2.5, 1.6, 2.4 + Math.sin(t * 3 + i), 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 광택 + 방울
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(220,255,230,0.5)'; ctx.beginPath(); ctx.ellipse(5, -9, 5, 2.5, -0.4, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    eyeGlow(ctx, 6, -2, 1.6, '#e0ff60'); eyeGlow(ctx, 11, -2.5, 1.2, '#e0ff60', 0.8);
    ctx.fillStyle = 'rgba(80,220,140,0.7)';
    for (let i = 0; i < 3; i++) { const p = (t * 0.9 + i / 3) % 1; ctx.beginPath(); ctx.ellipse(-8 + i * 8, 18 + p * 12, 1.4, 2 + p, 0, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
  if (an === 'squash' && squash > 0.5 && !FL) glint(ctx, 16, -20, 6 + 5 * squash, '#c0ffd0', (squash - 0.5) * 2);
  FL = false;
};

// ───────────────────────── 미믹 ─────────────────────────
RENDER_A.mimic = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t, an = e.anim, at = e.animT;
  const wood = '#6a3e1e', woodD = '#3a2010', iron = '#4a4650', gold = '#d8b048';
  const closed = an === 'closed';
  const jump = an === 'jump';
  let lid = 0;
  if (closed) lid = Math.max(0, Math.sin(t * 1.3)) * 0.06; // 숨쉬기 (미세한 틈)
  else if (an === 'open') lid = ease.outBack(clamp(at / 0.3, 0, 1)) * 1.05;
  else lid = 0.55 + Math.abs(Math.sin(t * (jump ? 14 : 7))) * 0.5; // 딱딱 씹기
  const hop = !closed && !jump ? Math.abs(Math.sin(t * 7)) * 1.5 : 0;
  shadow(ctx, 24);
  ctx.save(); ctx.translate(0, -hop);
  // 다리 (사냥 중)
  if (!closed) {
    for (let i = 0; i < 4; i++) {
      const x = -15 + i * 10, near = i % 2 === 0;
      const a = jump ? 0.9 * (i < 2 ? -1 : 1) : Math.sin(t * 14 + i * 1.6) * 0.4;
      end(x, -6, a, 6); const kx = EX, ky = EY; end(kx, ky, a * 0.3 + (i < 2 ? -0.3 : 0.3), 6);
      softLimb(ctx, x, -6, kx, ky, EX, jump ? EY : Math.min(EY, hop), 2, 1.4, near ? '#5a2a3a' : '#3a1a24', near);
    }
  }
  // 상자 몸통
  ctx.beginPath(); ctx.rect(-22, -24, 44, 22); ink(ctx, vert(ctx, 'mimb', -24, -2, wood, 0.12, -0.35), 2);
  if (!FL) {
    ctx.strokeStyle = woodD; ctx.lineWidth = 1; for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-22, -24 + i * 7.3); ctx.lineTo(22, -24 + i * 7.3); ctx.stroke(); }
    ctx.fillStyle = iron; ctx.fillRect(-15, -24, 4, 22); ctx.fillRect(11, -24, 4, 22);
    ctx.fillStyle = gold; for (const [x, y] of [[-22, -24], [18, -24], [-22, -6], [18, -6]]) ctx.fillRect(x, y, 4, 4);
    ctx.fillStyle = '#c8c0b0'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-13, -20 + i * 7, 0.9, 0, TAU); ctx.arc(13, -20 + i * 7, 0.9, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = mixCache(wood, RIM, 0.5, 0); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-21.5, -3); ctx.lineTo(-21.5, -23.5); ctx.stroke();
  }
  // 입 안 (뚜껑이 열리면)
  if (lid > 0.08) {
    ctx.fillStyle = C('#2a040a'); ctx.beginPath(); ctx.ellipse(0, -24, 20, 4 + lid * 8, 0, PI, TAU); ctx.fill();
    if (!FL) {
      glow(ctx, 2, -28, 16 * lid, '#ff3040', 0.6);
      // 아래 이빨
      ctx.fillStyle = '#f4ecd8';
      for (let i = 0; i < 8; i++) { const x = -19 + i * 5.2; ctx.beginPath(); ctx.moveTo(x, -24); ctx.lineTo(x + 2.6, -29 - (i % 2) * 1.5); ctx.lineTo(x + 5.2, -24); ctx.fill(); }
      // 혀
      const tw = Math.sin(t * 6) * 3;
      ctx.fillStyle = '#c03050'; ctx.strokeStyle = '#3a0612'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(4, -25); ctx.quadraticCurveTo(24, -26 + tw, 26, -16 + tw); ctx.quadraticCurveTo(28, -10 + tw, 23, -12 + tw); ctx.quadraticCurveTo(20, -20, 2, -22); ctx.closePath(); ctx.fill(); ctx.stroke();
      // 안쪽의 눈
      eyeGlow(ctx, -6, -30 - lid * 2, 2.2, '#ffd040', lid);
    }
  }
  // 뚜껑 (뒤쪽 경첩 기준 회전)
  ctx.save(); ctx.translate(-22, -24); ctx.rotate(-lid);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -6); ctx.quadraticCurveTo(22, -16, 44, -6); ctx.lineTo(44, 0); ctx.closePath();
  ink(ctx, vert(ctx, 'miml', -14, 0, lt(wood, 0.05), 0.22, -0.25), 2);
  if (!FL) {
    ctx.fillStyle = iron; ctx.fillRect(7, -11, 4, 11); ctx.fillRect(33, -11, 4, 11);
    ctx.fillStyle = gold; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(26, 0); ctx.lineTo(26, 4); ctx.lineTo(18, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1008'; ctx.beginPath(); ctx.arc(22, 2, 1.2, 0, TAU); ctx.fill();
    // 윗 이빨
    if (lid > 0.08) { ctx.fillStyle = '#f4ecd8'; for (let i = 0; i < 8; i++) { const x = 3 + i * 5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 2.5, 4.5 + (i % 2) * 1.5); ctx.lineTo(x + 5, 0); ctx.fill(); } }
    ctx.strokeStyle = 'rgba(255,230,180,0.4)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(4, -8); ctx.quadraticCurveTo(22, -15, 40, -8); ctx.stroke();
  }
  ctx.restore();
  // 위장 중: 틈새로 새는 눈빛 (눈치 빠른 헌터를 위한 힌트)
  if (closed && !FL && Math.sin(t * 0.7) > 0.85) glint(ctx, 4, -25, 4, '#ff5050', (Math.sin(t * 0.7) - 0.85) / 0.15);
  ctx.restore();
  FL = false;
};

// ───────────────────────── 적 투사체 (PROJ_A) — 원점 = 투사체 중심 ─────────────────────────
PROJ_A.arrow = (ctx, p) => {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(-34, 0, -8, 0); g.addColorStop(0, 'rgba(255,200,150,0)'); g.addColorStop(1, 'rgba(255,220,180,0.35)');
  ctx.fillStyle = g; ctx.fillRect(-34, -1, 26, 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = OUT; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(10, 0); ctx.stroke();
  ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = '#d8dce8'; ctx.strokeStyle = OUT; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(8, -3.4); ctx.lineTo(9.5, 0); ctx.lineTo(8, 3.4); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#b02a2a'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-14, -4); ctx.lineTo(-11, 0); ctx.lineTo(-14, 4); ctx.closePath(); ctx.fill();
};
PROJ_A.page = (ctx, p) => {
  ctx.rotate(p.rot);
  const s = 1 + Math.sin(p.t * 20) * 0.1;
  ctx.scale(s, 1 / s);
  glow(ctx, 0, 0, 16, '#ffcf60', 0.5);
  ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(7, -8); ctx.lineTo(6, 9); ctx.lineTo(-8, 8); ctx.closePath();
  ctx.fillStyle = '#f2e6c8'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke(); ctx.fill();
  ctx.fillStyle = 'rgba(80,40,20,0.6)'; for (let i = 0; i < 4; i++) ctx.fillRect(-5, -5 + i * 3.5, 9 - (i % 2) * 3, 0.9);
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,200,90,0.9)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-7, -9); ctx.lineTo(7, -8); ctx.lineTo(6, 9); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
};
PROJ_A.needle = (ctx, p) => {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(220,230,255,0.25)'; ctx.fillRect(-22, -0.8, 18, 1.6);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(9, 0); ctx.stroke();
  ctx.strokeStyle = '#e8ecf8'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = '#b01830'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(-7, 0, 1.6, 0, TAU); ctx.stroke();
  glint(ctx, 9, 0, 3.5, '#ffffff', 0.6 + 0.4 * Math.sin(p.t * 30));
};
PROJ_A.mud = (ctx, p) => {
  ctx.rotate(p.rot * 0.3);
  const w = Math.sin(p.t * 18) * 0.12;
  ctx.scale(1 + w, 1 - w);
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 7, 0, 0, TAU);
  ctx.fillStyle = '#5a4230'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#8a6a48'; ctx.beginPath(); ctx.ellipse(2, -2.5, 3.5, 2, -0.4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a2a1e'; ctx.beginPath(); ctx.arc(-3, 3, 2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a4230'; ctx.beginPath(); ctx.ellipse(-7, 3, 2, 3, 0.5, 0, TAU); ctx.fill();
};
PROJ_A.clod = (ctx, p) => {
  ctx.rotate(p.rot);
  ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(-2, -8); ctx.lineTo(6, -6); ctx.lineTo(8, 1); ctx.lineTo(3, 7); ctx.lineTo(-6, 6); ctx.closePath();
  ctx.fillStyle = '#4a3624'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#7a7070'; ctx.beginPath(); ctx.moveTo(-1, -6); ctx.lineTo(5, -5); ctx.lineTo(5, 0); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6a8a3a'; ctx.fillRect(-6, -5, 3, 1.5);
  ctx.fillStyle = '#e0d4b8'; ctx.fillRect(-4, 2, 5, 1.6);
};
PROJ_A.dirtwave = (ctx, p) => {
  // 바닥을 따라 달리는 흙 분출 (중심 기준, 바닥 = +h/2)
  const d = Math.sign(p.vx) || 1;
  ctx.scale(d, 1);
  const H = p.h, base = H / 2;
  const fade = clamp(p.life / 0.2, 0, 1);
  ctx.globalAlpha *= fade;
  for (let i = 0; i < 4; i++) {
    const x = -i * 9, h = (H * 1.1 - i * 6) * (0.8 + 0.2 * Math.sin(p.t * 30 + i));
    ctx.beginPath(); ctx.moveTo(x - 7, base); ctx.lineTo(x - 4, base - h * 0.6); ctx.lineTo(x - 1, base - h); ctx.lineTo(x + 2, base - h * 0.7); ctx.lineTo(x + 6, base);
    ctx.closePath();
    ctx.fillStyle = i ? '#3a2a1e' : '#5a4230'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke(); ctx.fill();
  }
  ctx.fillStyle = '#8a7a6a';
  for (let i = 0; i < 5; i++) { const x = Math.sin(i * 3.1 + p.t * 9) * 8, y = base - H * 0.6 - ((p.t * 90 + i * 13) % 26); ctx.fillRect(x, y, 2.4, 2.4); }
  glow(ctx, 2, base - 6, 16, '#ffb060', 0.25);
};
PROJ_A.glyph = (ctx, p) => {
  const c = p.color || '#a0b8ff';
  glow(ctx, 0, 0, 18, c, 0.8);
  ctx.rotate(p.t * 3);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = c; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(0, 4); ctx.lineTo(3, -4); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
};
PROJ_A.soulfire = (ctx, p) => {
  const a = Math.atan2(p.vy, p.vx);
  glow(ctx, 0, 0, 18, '#40ffc0', 0.8);
  ctx.rotate(a);
  ctx.globalCompositeOperation = 'lighter';
  const f = Math.sin(p.t * 30) * 1.5;
  ctx.fillStyle = 'rgba(80,255,200,0.6)'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.quadraticCurveTo(0, -6, -14 + f, 0); ctx.quadraticCurveTo(0, 6, 6, 0); ctx.fill();
  ctx.fillStyle = 'rgba(230,255,250,0.95)'; ctx.beginPath(); ctx.arc(2, 0, 3.2, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
};
PROJ_A.darkorb = (ctx, p) => {
  const r = Math.max(p.w, p.h) * 0.5;
  glow(ctx, 0, 0, r * 3, '#b060ff', 0.8);
  ctx.fillStyle = '#1a0628'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#d8a0ff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, r, p.t * 9, p.t * 9 + 3.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.6, -p.t * 12, -p.t * 12 + 2.5); ctx.stroke();
  ctx.fillStyle = '#f0d8ff'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.25, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
};
PROJ_A.axeSpin = (ctx, p) => {
  // 회전하는 양날 도끼 (적 도끼 갑옷)
  ctx.rotate(p.rot);
  glow(ctx, 0, 0, 22, '#ffd8a0', 0.25);
  ctx.save(); ctx.translate(0, -18); drawGreatAxe(ctx, 0.85, '#b89040'); ctx.restore();
  // 회전 잔상
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(230,235,255,0.35)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 18, -0.8, 0.8); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 18, PI - 0.8, PI + 0.8); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
};

/** 불기둥 장판 (Hitbox.render 용 — 월드 좌표). delay 동안은 바닥 마법진 경고 */
export function drawFlamePillar(ctx, h) {
  const cx = h.x + h.w / 2, by = h.y + h.h;
  if (h.t < h.delay) {
    const k = clamp(h.t / h.delay, 0, 1);
    drawRuneCircle(ctx, cx, by - 2, h.w * 0.7, h.t * 2, '#ff5a2a', 0.5 + 0.5 * k, true);
    glow(ctx, cx, by - 4, h.w * (0.6 + k * 0.6), '#ff5a2a', 0.3 + 0.5 * k);
    if (k > 0.6) {
      const ga = ctx.globalAlpha; ctx.globalAlpha = ga * (k - 0.6) * 2.5 * (0.6 + 0.4 * Math.sin(h.t * 40));
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,120,60,0.25)'; ctx.fillRect(cx - h.w * 0.3, h.y, h.w * 0.6, h.h);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ga;
    }
    return;
  }
  const u = h.t - h.delay, L = h.maxLife;
  const k = clamp(1 - u / L, 0, 1), rise = ease.outCubic(clamp(u / 0.12, 0, 1));
  const top = by - h.h * rise;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const w = h.w * (0.55 - i * 0.14) * (0.8 + 0.2 * Math.sin(u * 40 + i));
    const g = ctx.createLinearGradient(0, by, 0, top);
    g.addColorStop(0, i === 2 ? 'rgba(255,255,220,0.95)' : 'rgba(255,140,40,0.85)');
    g.addColorStop(0.7, i === 2 ? 'rgba(255,220,120,0.7)' : 'rgba(255,70,20,0.6)');
    g.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.globalAlpha = k;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(cx - w, by); ctx.quadraticCurveTo(cx - w * 0.8 + Math.sin(u * 30) * 3, (by + top) / 2, cx + Math.sin(u * 25 + i) * 4, top); ctx.quadraticCurveTo(cx + w * 0.8, (by + top) / 2, cx + w, by); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
