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
  if (a <= 0.01 || r <= 0.5) return;
  const rr = Math.round(r);
  const g = FL ? 'rgba(255,255,255,0.6)' : radG(ctx, 'gl' + color + rr, 0, 0, 0, 0, 0, rr, [0, color, 0.35, color + '66', 1, color + '00']);
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
