// 2부 적 렌더러 D (s17 폭풍의 공중정원 · s18 악몽의 미궁 · s19 썩어가는 숲 · s20 태초의 공허; world2 §5.1, §5.4). 소유: ENEMY-P2-D-ART
// RENDER_D[renderId] = (ctx, e, world, { flash }) — render/enemies.js 가 합친다. 원점 = 발 중앙, 오른쪽을 보는 기준 (좌우 반전·정예 배율은 호출측).
// 이 파일의 적 그림은 '벡터 대체 그림'이다: 채색 퍼핏(src/render/painted/enemies/<id>.js, 등록 reg/enemy-p2-d-art.js)이 로드되면 그것이 그려지고,
// 에셋이 없거나 로딩 중이거나 채색이 꺼져 있으면(?painted=0 · settings.painted=false) 이 그림이 보인다. 한 적당 60줄 이하 (MASTER_PLAN ENEMY-P2-D-ART).
// 자세 이름(e.anim)은 game/ai_d.js 머리 주석과 재사용 AI(ai_b harpy·voider·chaos, ai.js zombie) 계약을 따른다.
// PROJ_D (투사체, 원점 = 투사체 중심) / ZONE_D (장판·경고, 월드 좌표): ai_d.js 가 그릴 때마다 찾아 쓴다 (없으면 ai_d.js 의 간단한 대체 그림).
// 그리기 코드 규칙: Math.random 금지 (결정적 해시 h1), 매 프레임 그라디언트 생성 금지 (HFX 캐시 스프라이트·단색), 게임 상태를 바꾸지 않는다.
import { TAU, clamp, lerp } from '../core/math.js';
import * as HFX from './hitfx.js';

export const RENDER_D = {};
export const PROJ_D = {};
export const ZONE_D = {};

const PI = Math.PI;
const OUT = '#07040c';
let FL = false;                                   // 피격 섬광: 모든 채움을 흰색으로
const C = (c) => (FL ? '#ffffff' : c);
/** 결정적 잡음 0..1 */
const h1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** 가산 광원 (HFX 캐시 스프라이트) */
function glowAt(ctx, color, x, y, size, a = 1) {
  const img = HFX.glow?.(color);
  if (!img || a <= 0.01 || size <= 0) return;
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalAlpha = ga * Math.min(1, a); ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
}
function fillOut(ctx, fill, lw = 1.6) { ctx.fillStyle = C(fill); ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke(); }
function ell(ctx, x, y, rx, ry, rot, fill, lw) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); fillOut(ctx, fill, lw); }
/** 팔다리 한 마디: (x,y)에서 각도 a(0 = 아래, + = 앞) 길이 L → 끝점 */
const _e = [0, 0];
function limb(ctx, x, y, a, L, w, col) {
  const x1 = x + Math.sin(a) * L, y1 = y + Math.cos(a) * L;
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = w + 2.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = C(col); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x1, y1); ctx.stroke();
  _e[0] = x1; _e[1] = y1; return _e;
}
/** 깃털 날개: 어깨 (x,y), 펼친 방향 ang (라디안, 0 = +x), 길이 L, 깃털 n 개 */
function wing(ctx, x, y, ang, L, n, col, tip, spread = 0.9) {
  for (let i = n - 1; i >= 0; i--) {
    const u = i / (n - 1), a = ang + (u - 0.2) * spread, len = L * (0.55 + 0.45 * Math.sin(PI * (0.25 + 0.6 * u)));
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a - 0.14) * len * 0.6, y + Math.sin(a - 0.14) * len * 0.6, ex, ey);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.1) * len * 0.5, y + Math.sin(a + 0.1) * len * 0.5, x, y);
    fillOut(ctx, i % 2 ? col : tip, 1.1);
  }
}
const flap = (e, f = 12) => Math.sin((e.t ?? 0) * f);
const aimK = (e) => clamp(e.aimK ?? 0, 0, 1);

// ═════════════════════════ s17 폭풍의 공중정원 ═════════════════════════
/** 폭풍 하피 (AI_B.harpy: fly spread shoot aim dive) */
RENDER_D.storm_harpy = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, k = an === 'spread' ? clamp((e.animT ?? 0) / 0.5, 0, 1) : 0;
  const cy = -30 + (an === 'fly' ? flap(e) * 2 : 0);
  const pitch = an === 'dive' ? 0.6 : an === 'aim' ? -0.2 : 0.08;
  let wa = -PI / 2 - 0.6 + flap(e) * 0.7;                  // 날개 각
  if (an === 'spread' || an === 'shoot') wa = lerp(-PI / 2 - 0.4, -PI - 0.1, k) + (an === 'shoot' ? 0.9 : 0);
  if (an === 'aim') wa = -PI / 2 - 1.3;
  if (an === 'dive') wa = PI + 0.35;
  ctx.save(); ctx.translate(0, cy); ctx.rotate(pitch);
  wing(ctx, -4, -6, wa - 0.25, 30, 6, '#3a4658', '#4e5e74');
  // 다리 (발톱)
  for (const s of [-1, 1]) { const b = limb(ctx, s * 3, 8, an === 'dive' || an === 'aim' ? 0.9 : 0.15 + s * 0.1, 11, 3, '#b8a86a'); for (let j = -1; j <= 1; j++) limb(ctx, b[0], b[1], 0.6 + j * 0.5, 5, 1.2, '#1a1418'); }
  ell(ctx, -2, 0, 11, 13, -0.3, '#56647a');               // 몸통
  ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(-26, 14); ctx.lineTo(-24, 4); ctx.closePath(); fillOut(ctx, '#3c4658');   // 꼬리
  ell(ctx, 6, -15, 7, 7, 0, '#9a9c9a');                   // 노파 얼굴
  ctx.beginPath(); ctx.moveTo(11, -16); ctx.lineTo(17, -12); ctx.lineTo(11, -12); ctx.closePath(); fillOut(ctx, '#1a1418', 1);
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(4 - i * 2, -20); ctx.lineTo(-6 - i * 3, -26 + i * 2 + Math.sin(t * 9 + i) * 2); ctx.lineTo(0 - i * 2, -17); fillOut(ctx, '#4a6a9a', 1); }
  if (!FL) { glowAt(ctx, '#9fd8ff', 8, -16, 10, 0.9); ctx.fillStyle = '#e8f8ff'; ctx.fillRect(7, -17, 2, 2); }
  wing(ctx, 2, -6, wa, 36, 7, '#56647a', '#7a90b0');
  if (!FL) {
    const tipx = 2 + Math.cos(wa) * 34, tipy = -6 + Math.sin(wa) * 34;
    glowAt(ctx, '#bfe0ff', tipx, tipy, 18 + 26 * k, 0.5 + 0.5 * k);
    if (k > 0.3) { ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 1.2; ctx.beginPath(); for (let i = 0; i < 4; i++) { const j = h1(i + Math.floor(t * 20)) * 12 - 6; ctx.lineTo(tipx + j, tipy + i * 5 - 8); } ctx.stroke(); }
  }
  ctx.restore();
};

/** 질풍 창기사 (AI_D.galeknight: fly aim dash slash) */
RENDER_D.gale_knight = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, K = aimK(e);
  const dash = an === 'dash', lean = dash ? 0.35 : an === 'aim' ? 0.18 * K : 0.08;
  ctx.save(); ctx.translate(0, Math.sin(t * 2.1) * 2); ctx.rotate(lean);
  // 망토 (뒤로 흩날림)
  ctx.beginPath(); ctx.moveTo(-6, -70); ctx.quadraticCurveTo(-26 - (dash ? 20 : 8), -44 + Math.sin(t * 6) * 4, -30 - (dash ? 26 : 6), -14 + Math.sin(t * 5) * 5);
  ctx.lineTo(-14, -20); ctx.closePath(); fillOut(ctx, '#7aa8d8');
  const wf = dash ? -2.6 : -2.1 + Math.sin(t * (an === 'fly' ? 5 : 2)) * 0.35;
  wing(ctx, -8, -66, wf - 0.2, 34, 6, '#c8c0b0', '#e8e0d0');
  // 다리 (늘어뜨림)
  for (const s of [-1, 1]) { const b = limb(ctx, s * 4, -40, dash ? -0.8 : 0.1 + s * 0.12, 20, 7, '#d8d0c0'); limb(ctx, b[0], b[1], dash ? -0.6 : 0.05, 18, 6, '#c8b070'); }
  ctx.beginPath(); ctx.moveTo(-10, -72); ctx.lineTo(10, -72); ctx.lineTo(12, -44); ctx.lineTo(-11, -40); ctx.closePath(); fillOut(ctx, '#ece6d6');   // 흉갑
  ctx.fillStyle = C('#c8a040'); ctx.fillRect(-10, -46, 22, 4);
  ctx.beginPath(); ctx.moveTo(-7, -72); ctx.lineTo(0, -98); ctx.lineTo(8, -72); ctx.closePath(); fillOut(ctx, '#f0ead8');                            // 뾰족 투구
  if (!FL) { ctx.fillStyle = '#bff4ff'; ctx.fillRect(2, -84, 6, 2); ctx.fillRect(4, -84, 2, 7); glowAt(ctx, '#9fe8ff', 5, -82, 16, 0.9); }
  wing(ctx, -2, -68, wf + 0.15, 40, 7, '#e8e0d0', '#f8f4e8');
  // 창: 떠 있을 땐 비스듬히, 겨눔·돌진 때 수평 (겨눔 동안 뒤로 당긴다)
  let la = an === 'fly' ? 0.45 : 0, lx = an === 'aim' ? -10 * K : dash ? 8 : 0;
  if (an === 'slash') la = lerp(-1.4, 1.2, clamp((K - 0.8) / 0.2, 0, 1)) - (K < 0.8 ? 0.2 * K : 0);
  ctx.save(); ctx.translate(6 + lx, -56); ctx.rotate(la);
  ctx.strokeStyle = OUT; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(54, 0); ctx.stroke();
  ctx.strokeStyle = C('#d8b050'); ctx.lineWidth = 2.4; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(54, -4); ctx.lineTo(70, 0); ctx.lineTo(54, 4); ctx.closePath(); fillOut(ctx, '#e8f0f8', 1.2);
  if (!FL && (an === 'aim' && K > 0.6)) glowAt(ctx, '#ffffff', 70, 0, 26 * K, K);
  ctx.restore();
  ell(ctx, 8, -58, 5, 4, 0, '#c8b070', 1.2);              // 건틀릿
  if (dash && !FL) { ctx.strokeStyle = 'rgba(220,244,255,0.55)'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { const y = -80 + i * 16; ctx.beginPath(); ctx.moveTo(-40 - i * 6, y); ctx.lineTo(-14, y); ctx.stroke(); } }
  ctx.restore();
};

/** 뇌조 (AI_D.roc: fly call screech swoop) */
RENDER_D.thunder_roc = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, K = aimK(e);
  const beat = an === 'fly' ? Math.sin(t * 4.2) : 0;
  let wa = -PI / 2 - 0.5 + beat * 0.6;
  if (an === 'call') wa = -PI / 2 - 0.2 - 0.5 * K;
  if (an === 'screech') wa = -PI - 0.2 + Math.sin(t * 30) * 0.05;
  if (an === 'swoop') wa = PI - 0.3;
  const cy = -38 + beat * 3;
  ctx.save(); ctx.translate(0, cy); ctx.rotate(an === 'swoop' ? 0.35 : 0);
  wing(ctx, -12, -8, wa - 0.3, 62, 8, '#1c1c28', '#2a2a3a', 1.0);
  ctx.beginPath(); ctx.moveTo(-26, 2); ctx.lineTo(-62, 10 + Math.sin(t * 3) * 3); ctx.lineTo(-58, -4); ctx.lineTo(-30, -8); ctx.closePath(); fillOut(ctx, '#23232e');   // 꼬리
  for (const s of [-1, 1]) { const b = limb(ctx, s * 6, 12, an === 'swoop' ? 0.9 : 0.2, 14, 5, '#141218'); for (let j = -1; j <= 1; j++) limb(ctx, b[0], b[1], 0.7 + j * 0.45, 8, 2, '#0c0a10'); }
  ell(ctx, -6, 0, 30, 18, -0.1, '#2a2a3a');
  // 해골 머리 (screech: 부리 벌림)
  const op = an === 'screech' ? 0.5 + 0.2 * Math.sin(t * 25) : an === 'call' ? 0.2 * K : 0.05;
  ctx.save(); ctx.translate(24, -12);
  ell(ctx, 0, 0, 12, 9, 0, '#e8e0cc');
  ctx.beginPath(); ctx.moveTo(8, -3); ctx.quadraticCurveTo(26, -2, 30, 6); ctx.lineTo(10, 2); ctx.closePath(); fillOut(ctx, '#d8ceb4', 1.2);
  ctx.save(); ctx.rotate(op); ctx.beginPath(); ctx.moveTo(8, 3); ctx.lineTo(24, 8); ctx.lineTo(8, 7); ctx.closePath(); fillOut(ctx, '#c8bea4', 1.2); ctx.restore();
  ctx.fillStyle = C('#0a0a10'); ctx.beginPath(); ctx.arc(2, -2, 3.4, 0, TAU); ctx.fill();
  if (!FL) glowAt(ctx, '#9fd8ff', 2, -2, 16 + 10 * K, 0.9);
  ctx.restore();
  wing(ctx, -2, -10, wa, 72, 9, '#2a2a3a', '#3a3a4e', 1.0);
  if (!FL) {                                              // 번개 혈관
    const g = 0.35 + 0.65 * Math.max(K, an === 'screech' ? 0.6 : 0.2 + 0.2 * Math.sin(t * 7));
    ctx.strokeStyle = `rgba(190,230,255,${g})`; ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); let x = -2, y = -10; for (let s = 1; s <= 5; s++) { const r = s * 13, a = wa - 0.35 + i * 0.35 + (h1(i * 7 + s + Math.floor(t * 12)) - 0.5) * 0.2; x = -2 + Math.cos(a) * r; y = -10 + Math.sin(a) * r; ctx.lineTo(x, y); } ctx.stroke(); if (an === 'call') glowAt(ctx, '#bfe0ff', x, y, 24 * K, K); }
  }
  ctx.restore();
};

/** 뇌운 해파리 (AI_D.jelly: drift charge shock) */
RENDER_D.cloud_jelly = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, K = an === 'charge' ? aimK(e) : an === 'shock' ? 1 : 0;
  const pulse = Math.sin(t * 3), sw = 1 + pulse * 0.05 + K * 0.12, sh = 1 - pulse * 0.05 + K * 0.08;
  const by = -38;
  // 촉수 (구름 가닥 + 번개)
  for (let i = 0; i < 6; i++) {
    const x0 = -14 + i * 5.6, sp = an === 'shock' ? (i - 2.5) * 5 : 0;
    ctx.strokeStyle = C('rgba(200,210,225,0.85)'); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x0, by + 8);
    for (let s = 1; s <= 5; s++) ctx.lineTo(x0 + sp * s * 0.4 + Math.sin(t * 2.4 + i + s * 0.8) * 3, by + 8 + s * 6.5);
    ctx.stroke();
    if (!FL && (K > 0 || i % 2 === 0)) { ctx.strokeStyle = `rgba(210,240,255,${0.35 + 0.6 * K})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, by + 10); for (let s = 1; s <= 4; s++) ctx.lineTo(x0 + sp * s * 0.4 + (h1(i * 5 + s + Math.floor(t * 18)) - 0.5) * 6, by + 10 + s * 7); ctx.stroke(); }
  }
  // 종 (겹친 구름 덩이)
  ctx.save(); ctx.translate(0, by); ctx.scale(sw, sh);
  const puffs = [[-12, 2, 10], [12, 2, 10], [-6, -6, 12], [7, -7, 12], [0, -12, 11], [0, 4, 12]];
  for (const [x, y, r] of puffs) ell(ctx, x, y, r, r * 0.9, 0, x < 0 ? '#9aa6b8' : '#c8d0dc', 1.2);
  if (!FL) {
    glowAt(ctx, '#9fd8ff', 0, -2, 40 + 30 * K, 0.35 + 0.5 * K + (h1(Math.floor(t * 14)) > 0.8 ? 0.3 : 0));
    ctx.fillStyle = '#e8ffff'; ctx.fillRect(3, 2, 2.4, 2.4); ctx.fillRect(9, 2, 2.4, 2.4); glowAt(ctx, '#7affff', 7, 3, 14, 0.8);
  }
  ctx.restore();
};

// ═════════════════════════ s18 악몽의 미궁 ═════════════════════════
/** 악몽 인형사 (AI_D.puppeteer: float summon throw) — 손가락에서 인형(e.puppets)까지 실 */
RENDER_D.puppeteer = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, K = aimK(e), bob = Math.sin(t * 1.6) * 2;
  ctx.save(); ctx.translate(0, bob);
  // 연미복 (다리 대신 너덜너덜한 자락)
  ctx.beginPath(); ctx.moveTo(-9, -66); ctx.lineTo(10, -66); ctx.lineTo(12, -30);
  for (let i = 0; i <= 5; i++) ctx.lineTo(12 - i * 5, -4 + (i % 2 ? -8 : 0) + Math.sin(t * 3 + i) * 2);
  ctx.lineTo(-16, -30); ctx.closePath(); fillOut(ctx, '#2a1a30');
  ctx.fillStyle = C('#5a2a6a'); ctx.fillRect(-2, -64, 3, 26);
  // 팔 (summon: 들어 올림, throw: 앞으로 뿌림)
  let a1 = 1.4 + Math.sin(t * 2) * 0.1, a2 = 1.9;
  if (an === 'summon') { a1 = lerp(1.4, 2.7, K); a2 = a1 + 0.3; }
  if (an === 'throw') { a1 = K < 0.8 ? lerp(1.4, 2.6, K / 0.8) : lerp(2.6, 1.1, (K - 0.8) / 0.2); a2 = a1 + 0.4; }
  const tips = [];
  for (const [sx, a, dk] of [[-4, a1 - 0.25, '#1a1020'], [4, a1, '#241828']]) {
    const b = limb(ctx, sx, -60, a, 16, 4, dk), bx = b[0], by = b[1];
    const c = limb(ctx, bx, by, a2 - (a1 - a), 14, 3.4, dk);
    const hx = c[0], hy = c[1];
    for (let f = 0; f < 4; f++) { const q = limb(ctx, hx, hy, a2 + (f - 1.5) * 0.28, 11, 1.2, '#c8c0c8'); tips.push(q[0], q[1]); }
  }
  // 머리: 반쪽 도자기 가면 + 실크햇
  ell(ctx, 2, -72, 7, 8, 0, '#b8b0b8');
  ctx.beginPath(); ctx.moveTo(-4, -80); ctx.lineTo(9, -80); ctx.lineTo(9, -71); ctx.lineTo(-4, -73); ctx.closePath(); fillOut(ctx, '#f4f0ec', 1.1);
  ctx.fillStyle = C('#0a0510'); ctx.fillRect(4, -78, 3, 3);
  if (!FL) glowAt(ctx, '#c060ff', 5, -76, 14, 0.8);
  ctx.fillStyle = C('#101014'); ctx.fillRect(-7, -78, 16, 2.4); ctx.beginPath(); ctx.rect(-4, -96, 10, 18); fillOut(ctx, '#141418', 1.2);
  ctx.fillStyle = C('#6a2a8a'); ctx.fillRect(-4, -83, 10, 2);
  // 실: 손가락 → 인형 (월드 좌표를 로컬로)
  if (!FL) {
    ctx.strokeStyle = 'rgba(230,220,255,0.55)'; ctx.lineWidth = 0.8; ctx.beginPath();
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    const L = e.puppets ?? [];
    if (L.length) for (let i = 0; i < L.length; i++) { const k = L[i], tx = (k.cx - e.cx) * f / sc, ty = (k.y - e.bottom) / sc - bob; for (let j = 0; j < 3; j++) { ctx.moveTo(tips[(i * 8 + j * 2) % tips.length], tips[(i * 8 + j * 2 + 1) % tips.length]); ctx.lineTo(tx + (j - 1) * 5, ty + 4); } }
    else for (let j = 0; j < tips.length; j += 2) { ctx.moveTo(tips[j], tips[j + 1]); ctx.lineTo(tips[j] + Math.sin(t * 2 + j) * 3, tips[j + 1] + 26 + (an === 'summon' ? 20 * K : 0)); }
    ctx.stroke();
  }
  ctx.restore();
};

/** 얼굴 없는 자 (AI_D.stalker: idle freeze creep grab appear) */
RENDER_D.faceless = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, K = aimK(e);
  const walk = an === 'creep', ph = t * 5.5, sw = walk ? Math.sin(ph) : 0;
  const tilt = an === 'freeze' || e.watched ? 0.35 : 0.04 * Math.sin(t * 0.7);
  const hip = -50;
  // 뒷다리·앞다리 (긴 보폭)
  for (const s of [-1, 1]) { const b = limb(ctx, s * 2, hip, s * sw * 0.55 + (walk ? 0 : s * 0.05), 25, 5, s < 0 ? '#08080c' : '#121218'); const c = limb(ctx, b[0], b[1], s * sw * 0.55 - Math.max(0, -s * Math.cos(ph)) * 0.6 * (walk ? 1 : 0), 24, 4.4, s < 0 ? '#08080c' : '#121218'); ctx.fillStyle = C('#020204'); ctx.fillRect(c[0] - 2, c[1] - 2, 9, 3); }
  ctx.beginPath(); ctx.moveTo(-8, -88); ctx.lineTo(8, -88); ctx.lineTo(7, -48); ctx.lineTo(-7, -48); ctx.closePath(); fillOut(ctx, '#141418');   // 양복
  ctx.beginPath(); ctx.moveTo(-1, -88); ctx.lineTo(4, -88); ctx.lineTo(1, -66); ctx.closePath(); ctx.fillStyle = C('#e8e8e8'); ctx.fill();
  ctx.fillStyle = C('#050505'); ctx.fillRect(0.4, -86, 1.6, 18);
  // 긴 팔 (grab: 앞으로 뻗음)
  const ga = an === 'grab' ? lerp(0.2, 1.75, K) : walk ? -sw * 0.25 : 0.08;
  for (const s of [-1, 1]) { const b = limb(ctx, s * 3, -86, ga + s * 0.06, 22, 4.4, s < 0 ? '#08080c' : '#141418'); const c = limb(ctx, b[0], b[1], ga + (an === 'grab' ? -0.1 : 0.05), 22, 3.6, s < 0 ? '#08080c' : '#141418'); for (let f = 0; f < 3; f++) limb(ctx, c[0], c[1], ga + (f - 1) * 0.2, 9, 1.1, '#b8b8c0'); }
  // 매끈한 얼굴
  ctx.save(); ctx.translate(1, -90); ctx.rotate(tilt);
  ctx.fillStyle = C('#a8a8b0'); ctx.fillRect(-2, -6, 4, 6);
  ell(ctx, 1, -13, 6.5, 8.5, 0, '#c8c8d0');
  if (!FL) { ctx.fillStyle = 'rgba(60,50,70,0.35)'; ctx.beginPath(); ctx.ellipse(4, -14, 2, 1.2, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(4, -9, 1.6, 0.8, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
  if (an === 'appear' && !FL) { ctx.strokeStyle = 'rgba(20,10,30,0.6)'; ctx.lineWidth = 2; for (let i = 0; i < 5; i++) { const y = -104 + h1(i + Math.floor(t * 20)) * 100; ctx.beginPath(); ctx.moveTo(-14, y); ctx.lineTo(14, y + 2); ctx.stroke(); } }
};

/** 꿈 삼키는 자 (AI_B.voider: float cast rift blink claw) */
RENDER_D.dream_eater = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const open = an === 'cast' || an === 'claw' || an === 'rift' ? clamp(at / 0.4, 0, 1) : 0;
  const bob = Math.sin(t * 1.2) * 3;
  ctx.save(); ctx.translate(0, -44 + bob);
  if (!FL) glowAt(ctx, '#a040ff', 0, 0, 90, 0.35);
  for (let i = 0; i < 4; i++) limb(ctx, -16 + i * 10, 16, Math.sin(t * 3 + i) * 0.3, 8, 3.4, '#2a1438');   // 작은 다리
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-26, -6 + i * 5); ctx.quadraticCurveTo(-40, -10 + i * 6 + Math.sin(t * 2 + i) * 4, -48 - i * 3, -4 + i * 7); ctx.strokeStyle = C('rgba(120,60,170,0.6)'); ctx.lineWidth = 3; ctx.stroke(); }
  ell(ctx, -4, 0, 28, 20, 0, '#3a1a5a');
  if (!FL) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 9; i++) ctx.fillRect(-26 + h1(i) * 44, -14 + h1(i + 9) * 26, 1.2, 1.2); }
  // 옆구리의 감긴 눈 (공격 중 뜬다)
  for (let i = 0; i < 6; i++) {
    const x = -20 + (i % 3) * 13, y = -8 + Math.floor(i / 3) * 12;
    if (open > 0.3) { ell(ctx, x, y, 3.4, 2.4 * open, 0, '#f0e8ff', 1); ctx.fillStyle = C('#8a20c0'); ctx.beginPath(); ctx.arc(x + 1, y, 1.4, 0, TAU); ctx.fill(); }
    else { ctx.strokeStyle = C('#d0b0f0'); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y - 1, 3, 0.3, PI - 0.3); ctx.stroke(); }
  }
  // 머리 + 코 (rift: 앞으로 찌름, claw: 휘두름)
  ell(ctx, 24, -6, 12, 10, 0.2, '#4a2268');
  ctx.beginPath(); ctx.moveTo(18, -14); ctx.lineTo(14, -22); ctx.lineTo(22, -15); fillOut(ctx, '#3a1a52', 1.1);
  let ta = an === 'rift' ? lerp(0.6, -0.1, open) : an === 'claw' ? lerp(-0.8, 1.2, clamp((at - 0.3) / 0.15, 0, 1)) : 0.9 + Math.sin(t * 1.8) * 0.2;
  ctx.beginPath(); let x = 32, y = -4; ctx.moveTo(x, y);
  for (let s = 1; s <= 5; s++) { const a = ta + s * 0.18 * (an === 'rift' ? 0.2 : 1); x += Math.cos(a) * 5.5; y += Math.sin(a) * 5.5; ctx.lineTo(x, y); }
  ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = C('#5a2a7a'); ctx.lineWidth = 4.6; ctx.stroke();
  ell(ctx, x, y, 3.2, 3.2, 0, '#2a0a3a', 1.2);
  if (!FL) glowAt(ctx, '#e080ff', x, y, 12 + 16 * open, 0.6 + 0.4 * open);
  ctx.restore();
};

// ═════════════════════════ s19 썩어가는 숲 ═════════════════════════
/** 썩은 나무거인 (AI_D.treant: idle walk plant swing) */
RENDER_D.rot_treant = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, K = aimK(e), walk = an === 'walk', ph = t * 3.2;
  const spore = e.sporeAt != null ? clamp(1 - ((e.t ?? 0) - e.sporeAt) / 0.8, 0, 1) : 0;
  for (const s of [-1, 1]) { const sw = walk ? Math.sin(ph) * s * 0.35 : 0; limb(ctx, s * 10, -34, sw + s * 0.12, 20, 12, s < 0 ? '#2a2014' : '#3a2c1a'); const b = _e; ctx.beginPath(); ctx.ellipse(b[0] + 5, b[1] + 10, 13, 5, 0, 0, TAU); fillOut(ctx, '#2e2416'); }
  // 줄기 (앞으로 굽음)
  ctx.beginPath(); ctx.moveTo(-18, -30); ctx.quadraticCurveTo(-22, -80, -8, -112); ctx.lineTo(10, -118); ctx.quadraticCurveTo(24, -80, 16, -30); ctx.closePath(); fillOut(ctx, '#3e3020');
  for (let i = 0; i < 5; i++) { ctx.strokeStyle = C('#1e160c'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-12 + i * 6, -36); ctx.quadraticCurveTo(-14 + i * 6, -70, -6 + i * 4, -104); ctx.stroke(); }
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-4 + i * 4, -114); ctx.lineTo(-18 + i * 12, -134 + (i % 2) * 6); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = C('#3a2a18'); ctx.lineWidth = 1.6; ctx.stroke(); }
  for (const [x, y, r] of [[-14, -60, 8], [-10, -86, 7], [12, -50, 6]]) { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, -0.2, PI, TAU); fillOut(ctx, '#e8dcc0', 1.1); }   // 선반 버섯
  for (const [x, y] of [[4, -44], [-4, -70], [8, -96]]) { ell(ctx, x, y, 4.4 + spore * 2, 4.4 + spore * 2, 0, '#9ac83a', 1); if (!FL) glowAt(ctx, '#c8ff6a', x, y, 18 + 30 * spore, 0.6 + 0.4 * spore); }
  // 해골 옹이 얼굴
  ell(ctx, 8, -92, 9, 10, 0, '#2a1e10', 1.2);
  if (!FL) { for (const x of [5, 12]) { ctx.fillStyle = '#0a0602'; ctx.beginPath(); ctx.arc(x, -95, 2.6, 0, TAU); ctx.fill(); glowAt(ctx, '#c8ff6a', x, -95, 12, 0.9); } ctx.fillStyle = '#0a0602'; ctx.fillRect(6, -88, 7, 5); }
  // 가지 팔 (plant: 들었다 땅에 꽂음, swing: 앞으로 휩쓸기)
  let a = 0.3 + (walk ? Math.sin(ph) * 0.15 : 0);
  if (an === 'plant') a = K < 0.75 ? lerp(0.3, 3.0, K / 0.75) : lerp(3.0, 0.5, (K - 0.75) / 0.25);
  if (an === 'swing') a = K < 0.85 ? lerp(0.3, 2.6, K / 0.85) : lerp(2.6, 0.9, (K - 0.85) / 0.15);
  for (const s of [-1, 1]) { const b = limb(ctx, s * 6 + 4, -98, a + s * 0.1, 26, 6, s < 0 ? '#2a2014' : '#4a3a24'); const bx = b[0], by = b[1]; const c = limb(ctx, bx, by, a + 0.3, 24, 4.4, s < 0 ? '#2a2014' : '#4a3a24'); for (let f = 0; f < 3; f++) limb(ctx, c[0], c[1], a + 0.3 + (f - 1) * 0.35, 8, 1.6, '#1a120a'); }
};

/** 역병 나방 (AI_D.moth: fly dust) */
RENDER_D.plague_moth = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, K = an === 'dust' ? aimK(e) : 0;
  const f = Math.sin(t * (an === 'dust' ? 34 : 22)), cy = -20;
  for (const [s, dk] of [[-1, '#6a5a3a'], [1, '#a8946a']]) {
    ctx.save(); ctx.translate(-2, cy - 4); ctx.scale(1, s < 0 ? 0.8 : 1);
    const ang = -PI / 2 - 0.2 + f * 0.7 + (s < 0 ? -0.2 : 0.1);
    ctx.rotate(ang + PI / 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-18, -18, -6, -30); ctx.quadraticCurveTo(12, -34, 16, -14); ctx.closePath(); fillOut(ctx, dk, 1.2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-16, -4, -14, -12); ctx.quadraticCurveTo(-6, -12, 0, 0); fillOut(ctx, s < 0 ? '#4a3e2a' : '#e8dcc0', 1);
    if (s > 0) { ell(ctx, 2, -20, 5.5, 5.5, 0, '#c8ff6a', 1); ctx.fillStyle = C('#101008'); ctx.beginPath(); ctx.arc(2, -20, 2.6, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  ell(ctx, -4, cy, 13, 6, 0.1, '#8a7040');                // 털 몸통
  for (let i = 0; i < 3; i++) limb(ctx, -6 + i * 5, cy + 4, 0.2 + i * 0.1, 8, 1.2, '#3a2a18');
  ell(ctx, 10, cy - 2, 5, 5, 0, '#5a4424', 1.2);
  ctx.fillStyle = C('#0a0806'); ctx.beginPath(); ctx.arc(12, cy - 3, 2.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = C('#6a5030'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(12, cy - 6); ctx.quadraticCurveTo(20, cy - 18, 26, cy - 14); ctx.moveTo(11, cy - 6); ctx.quadraticCurveTo(14, cy - 20, 20, cy - 20); ctx.stroke();
  if (!FL) for (let i = 0; i < 6 + 10 * K; i++) { const u = (t * (0.6 + K) + h1(i)) % 1; ctx.fillStyle = `rgba(200,255,106,${(1 - u) * 0.8})`; ctx.fillRect(-10 + h1(i * 3) * 24 + Math.sin(t * 3 + i) * 3, cy + 4 + u * (20 + 30 * K), 1.6, 1.6); }
  if (!FL) glowAt(ctx, '#c8ff6a', 0, cy + 6, 26 + 30 * K, 0.35 + 0.4 * K);
};

/** 균사 망자 (AI_D.husk = 좀비: rise walk idle attack) */
RENDER_D.fungal_husk = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const rise = an === 'rise' ? clamp(at / (e.params?.riseTime ?? 0.9), 0, 1) : 1;
  ctx.save();
  if (rise < 1) { ctx.beginPath(); ctx.rect(-40, -120, 80, 120); ctx.clip(); ctx.translate(0, (1 - rise) * 84); }
  const walk = an === 'walk', ph = t * 6, sw = walk ? Math.sin(ph) : 0;
  for (const s of [-1, 1]) { const b = limb(ctx, s * 2, -40, s * sw * 0.45 + 0.1, 19, 6, s < 0 ? '#3a3424' : '#5a5038'); limb(ctx, b[0], b[1], s * sw * 0.45 - 0.05, 19, 5, s < 0 ? '#4a4a3a' : '#7a7a60'); }
  ctx.beginPath(); ctx.moveTo(-9, -70); ctx.lineTo(10, -68); ctx.lineTo(9, -38); ctx.lineTo(-9, -38); ctx.closePath(); fillOut(ctx, '#5a4a30');
  // 팔 (attack: 앞으로 할퀴기)
  const wu = e.params?.windup ?? 0.35, aa = an === 'attack' ? (at < wu ? lerp(1.4, 2.4, at / wu) : lerp(2.4, 0.9, clamp((at - wu) / 0.12, 0, 1))) : 1.45 + Math.sin(t * 2) * 0.08;
  for (const s of [-1, 1]) { const b = limb(ctx, s * 2 + 4, -66, aa + s * 0.1, 16, 4.4, s < 0 ? '#4a4a3a' : '#7a7a62'); limb(ctx, b[0], b[1], aa + 0.1, 15, 3.6, s < 0 ? '#4a4a3a' : '#8a8a70'); }
  // 머리 + 버섯 갓
  ell(ctx, 6, -76, 6.5, 7, 0, '#7a806a');
  ctx.fillStyle = C('#e8e8d8'); ctx.beginPath(); ctx.arc(9, -78, 1.8, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-10, -80); ctx.quadraticCurveTo(4, -106, 20, -82); ctx.quadraticCurveTo(5, -86, -10, -80); fillOut(ctx, '#e0cc98');
  if (!FL) { ctx.strokeStyle = '#c8ff6a'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let i = 0; i < 6; i++) { ctx.moveTo(-6 + i * 4.4, -82); ctx.lineTo(-4 + i * 3.6, -84.5); } ctx.stroke(); glowAt(ctx, '#c8ff6a', 5, -82, 24, 0.5); }
  ctx.restore();
  if (rise < 1 && !FL) { ctx.fillStyle = '#2a2014'; for (let i = 0; i < 5; i++) ctx.fillRect(-14 + i * 6 + h1(i) * 3, -3 - h1(i + 4) * 4 * (1 - rise), 3, 3); }
};

// ═════════════════════════ s20 태초의 공허 ═════════════════════════
/** 공허의 전령 (AI_D.herald: float aim fire raise blink) */
RENDER_D.void_herald = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, K = aimK(e), bob = Math.sin(t * 1.3) * 2;
  ctx.save(); ctx.translate(0, bob);
  // 무지갯빛 후광
  if (!FL) { const cols = ['#ff4a8a', '#ffd84a', '#4affa0', '#6a8aff'], ga = ctx.globalAlpha; ctx.lineWidth = 1.6; ctx.globalAlpha = ga * 0.7; for (let i = 0; i < 4; i++) { ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.ellipse(-4, -88, 13 + i * 1.6, 15 + i * 1.6, 0.2, t + i, t + i + PI * 1.3); ctx.stroke(); } ctx.globalAlpha = ga; }
  // 로브 (자락은 연기로 흩어짐)
  ctx.beginPath(); ctx.moveTo(-6, -92); ctx.quadraticCurveTo(14, -90, 12, -60);
  for (let i = 0; i <= 6; i++) ctx.lineTo(14 - i * 5, -8 + Math.sin(t * 2.4 + i * 1.3) * 4 + (i % 2) * 5);
  ctx.quadraticCurveTo(-18, -60, -6, -92); fillOut(ctx, '#0c0a12');
  ctx.beginPath(); ctx.moveTo(4, -80); ctx.lineTo(10, -60); ctx.lineTo(6, -14); ctx.lineTo(-2, -20); ctx.closePath(); ctx.fillStyle = C('#1a0e30'); ctx.fill();
  if (!FL) { const ga = ctx.globalAlpha; ctx.fillStyle = '#ffffff'; for (let i = 0; i < 12; i++) { const y = -76 + h1(i) * 58, x = h1(i + 5) * 8 + (y + 76) * 0.06; ctx.globalAlpha = ga * (0.5 + 0.5 * Math.sin(t * 3 + i)); ctx.fillRect(x, y, 1.3, 1.3); } ctx.globalAlpha = ga; }
  // 두건 + 별 눈
  ctx.beginPath(); ctx.moveTo(-8, -84); ctx.quadraticCurveTo(-4, -104, 8, -96); ctx.quadraticCurveTo(12, -86, 8, -80); ctx.closePath(); fillOut(ctx, '#141020');
  if (!FL) { glowAt(ctx, '#ffffff', 6, -89, 8, 1); ctx.fillStyle = '#fff'; ctx.fillRect(5, -90, 2, 2); }
  // 소매 + 빛의 손 (aim: 광선 각도로 뻗음, raise: 두 팔 들어 올림)
  const f = e.facing < 0 ? -1 : 1;
  let a = 1.0 + Math.sin(t * 1.5) * 0.1;
  if (an === 'aim' || an === 'fire') { const aa = e.aimA ?? 0, lx = Math.cos(aa) * f, ly = Math.sin(aa); a = Math.atan2(lx, ly); }
  if (an === 'raise') a = lerp(1.0, 2.9, K);
  for (const s of [-1, 1]) {
    const b = limb(ctx, s * 3, -78, a + s * 0.12 - (s < 0 && an !== 'raise' ? 0.4 : 0), 22, 7, s < 0 ? '#08060c' : '#16121e');
    if (!FL) { const hot = an === 'aim' ? K : an === 'fire' ? 1 : an === 'raise' ? K : 0.3; glowAt(ctx, '#ffffff', b[0], b[1], 14 + 18 * hot, 0.7 + 0.3 * hot); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b[0], b[1], 2.6, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
};

/** 무의 파편 (AI_B.chaos: idle walk swell leap) — 검은 결정 무리, 가장자리 무지갯빛 */
RENDER_D.nihil_spawn = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const sw = an === 'swell' ? clamp(at / 0.6, 0, 1) : 0, leap = an === 'leap';
  const pulse = 1 + sw * 0.28 + Math.sin(t * (4 + sw * 20)) * (0.03 + sw * 0.05);
  const hov = -24 - Math.sin(t * 2.2) * 3 - (an === 'walk' ? Math.abs(Math.sin(t * 5)) * 4 : 0);
  ctx.save(); ctx.translate(0, hov); ctx.scale(leap ? 0.85 : pulse, leap ? 1.2 : pulse); ctx.rotate(leap ? 0.3 : Math.sin(t * 0.8) * 0.08);
  if (!FL) glowAt(ctx, '#e8e0ff', 0, 0, 40 + 50 * sw, 0.25 + 0.5 * sw);
  const cols = ['#ff5a8a', '#ffe05a', '#5affb0', '#5a9aff', '#c86aff'];
  for (let i = 0; i < 9; i++) {
    const a = i * TAU / 9 + 0.3, L = 13 + h1(i) * 11, w = 4 + h1(i + 3) * 3;
    const cx = Math.cos(a), sy = Math.sin(a), nx = -sy, ny = cx;
    ctx.beginPath(); ctx.moveTo(nx * w, ny * w); ctx.lineTo(cx * L, sy * L); ctx.lineTo(-nx * w, -ny * w); ctx.closePath();
    fillOut(ctx, i % 2 ? '#141020' : '#0a0810', 1.2);
    if (!FL) { ctx.strokeStyle = cols[i % 5]; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(nx * w * 0.8, ny * w * 0.8); ctx.lineTo(cx * L, sy * L); ctx.stroke(); }
  }
  ell(ctx, 0, 0, 8, 8, 0, '#08060c', 1.4);
  if (!FL) { glowAt(ctx, '#ffffff', 0, 0, 16 + 16 * sw, 0.9); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(1.5, -0.5, 2 + sw * 1.4, 0, TAU); ctx.fill(); }
  ctx.restore();
  if (!FL) for (let i = 0; i < 3; i++) { const a = t * (1.2 + i * 0.3) + i * 2.1, r = 26 + 6 * Math.sin(t + i); ctx.save(); ctx.translate(Math.cos(a) * r, hov + Math.sin(a) * r * 0.5); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(2, 0); ctx.lineTo(0, 4); ctx.lineTo(-2, 0); ctx.closePath(); fillOut(ctx, '#100c18', 0.8); ctx.restore(); }
};

// ═════════════════════════ 투사체 (원점 = 투사체 중심) ═════════════════════════
/** 바람의 초승달 (60×90, 진행 방향으로 회전, 관통) */
PROJ_D.gale_crescent = (ctx, p) => {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  const R = (p.h || 90) * 0.5, fade = p.maxLife ? clamp(p.life / 0.25, 0, 1) : 1, t = p.t ?? 0;
  ctx.globalAlpha *= fade;
  glowAt(ctx, '#bfe8ff', -4, 0, R * 2.8, 0.5);
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    const s = 1 - k * 0.16;
    ctx.beginPath(); ctx.arc(-R * 0.55 - k * 7, 0, R * s, -1.15, 1.15); ctx.arc(-R * 0.9 - k * 7, 0, R * s * 0.84, 1.05, -1.05, true); ctx.closePath();
    ctx.fillStyle = k ? `rgba(150,210,255,${0.35 - k * 0.1})` : 'rgba(236,250,255,0.92)'; ctx.fill();
  }
  ctx.strokeStyle = 'rgba(210,240,255,0.55)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) { const y = (i - 1.5) * R * 0.34, ph = (t * 5 + i * 0.27) % 1; ctx.beginPath(); ctx.moveTo(-R * 0.7 - ph * 34, y); ctx.lineTo(-R * 1.7 - ph * 34, y * 1.2); ctx.stroke(); }
  ctx.globalCompositeOperation = 'source-over';
};
/** 저주 바늘 (은빛 바늘 + 실 꼬리) */
PROJ_D.puppet_needle = (ctx, p) => {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  ctx.strokeStyle = 'rgba(230,220,255,0.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-18, Math.sin((p.t ?? 0) * 30) * 3, -28, 0); ctx.stroke();
  ctx.fillStyle = '#e8e4f0'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-8, -1.4); ctx.lineTo(-8, 1.4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#6a3a8a'; ctx.lineWidth = 1; ctx.strokeRect(-9, -1.6, 3, 3.2);
  glowAt(ctx, '#c060ff', 0, 0, 16, 0.5);
};
/** 죽어 가는 별 (곧장 떨어짐, 무지갯빛 꼬리) */
PROJ_D.void_star = (ctx, p) => {
  const t = p.t ?? 0;
  ctx.globalCompositeOperation = 'lighter';
  const cols = ['rgba(255,90,140,0.5)', 'rgba(90,255,170,0.5)', 'rgba(120,150,255,0.5)'];
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) { ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.moveTo((i - 1) * 3, -4); ctx.lineTo((i - 1) * 5 + Math.sin(t * 20 + i) * 1.5, -52); ctx.stroke(); }
  glowAt(ctx, '#d8c8ff', 0, 0, 60, 0.9);
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(t * 7);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * PI / 4, r = i & 1 ? 3 : 10; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
};

// ═════════════════════════ 장판·경고 (월드 좌표) ═════════════════════════
/** 창 돌진 경고선 (z.data {x0, y, len, dir, k}) */
ZONE_D.lance_warn = (ctx, z) => {
  const d = z.data, k = d.k ?? 0, x1 = d.x0 + d.dir * d.len;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(150,215,255,${0.05 + 0.12 * k})`; ctx.fillRect(Math.min(d.x0, x1), d.y - 16, d.len, 32);
  const blink = k > 0.7 && ((z.t * 18) | 0) % 2 === 0;
  ctx.strokeStyle = blink ? 'rgba(255,255,255,0.95)' : `rgba(200,240,255,${0.3 + 0.5 * k})`; ctx.lineWidth = 2 + 2.5 * k;
  ctx.setLineDash([16, 10]); ctx.lineDashOffset = -z.t * 160 * d.dir;
  ctx.beginPath(); ctx.moveTo(d.x0, d.y); ctx.lineTo(x1, d.y); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < 3; i++) { const u = ((z.t * 1.6 + i / 3) % 1), x = d.x0 + d.dir * d.len * u; ctx.beginPath(); ctx.moveTo(x, d.y); ctx.lineTo(x - d.dir * 10, d.y - 7); ctx.moveTo(x, d.y); ctx.lineTo(x - d.dir * 10, d.y + 7); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x1, d.y); ctx.lineTo(x1 - d.dir * 14, d.y - 9); ctx.moveTo(x1, d.y); ctx.lineTo(x1 - d.dir * 14, d.y + 9); ctx.stroke();
  ctx.restore();
};
/** 벼락 기둥 (경고: live false + k / 발동: live true, 폭 50) */
ZONE_D.roc_bolt = (ctx, z) => {
  const d = z.data, x = d.x, top = d.top, bot = d.bottom;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (!d.live) {
    const k = d.k ?? 0;
    ctx.fillStyle = `rgba(170,210,255,${0.05 + 0.15 * k})`; ctx.fillRect(x - 25, top, 50, bot - top);
    glowAt(ctx, '#bfe0ff', x, bot - 4, 60 + 40 * k, 0.25 + 0.5 * k);
    ctx.strokeStyle = `rgba(210,235,255,${0.3 + 0.6 * k})`; ctx.lineWidth = 1.5 + k;
    ctx.setLineDash([6, 8]); ctx.lineDashOffset = z.t * 60;
    ctx.beginPath(); ctx.moveTo(x - 25, top); ctx.lineTo(x - 25, bot); ctx.moveTo(x + 25, top); ctx.lineTo(x + 25, bot); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.ellipse(x, bot - 2, 26 - 10 * k, 6 - 2 * k, 0, 0, TAU); ctx.stroke();
    if (k > 0.6) { ctx.strokeStyle = `rgba(255,255,255,${(k - 0.6) * 2})`; ctx.lineWidth = 1; ctx.beginPath(); let px = x; ctx.moveTo(px, top); for (let y = top + 20; y < Math.min(bot, top + 140); y += 20) { px = x + (h1(y + Math.floor(z.t * 20)) - 0.5) * 16; ctx.lineTo(px, y); } ctx.stroke(); }
    ctx.restore(); return;
  }
  ctx.globalAlpha *= clamp(z.life / 0.15, 0, 1);
  ctx.fillStyle = 'rgba(190,225,255,0.28)'; ctx.fillRect(x - 25, top, 50, bot - top);
  const f = Math.floor(z.t * 30), seg = 24, n = Math.max(2, Math.ceil((bot - top) / seg));
  for (let pass = 0; pass < 3; pass++) {
    ctx.strokeStyle = pass === 2 ? '#ffffff' : pass ? 'rgba(170,215,255,0.9)' : 'rgba(110,160,255,0.55)'; ctx.lineWidth = [14, 6, 2.6][pass];
    ctx.beginPath(); ctx.moveTo(x, top);
    for (let i = 1; i <= n; i++) ctx.lineTo(x + (i === n ? 0 : (h1(i * 3.1 + f * 7 + d.seed) - 0.5) * 30), Math.min(bot, top + i * seg));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200,230,255,0.7)'; ctx.lineWidth = 1.2;       // 곁가지
  for (let b = 0; b < 3; b++) { const y0 = top + (bot - top) * (0.25 + b * 0.22), s = h1(b + f) > 0.5 ? 1 : -1; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + s * 14, y0 + 10); ctx.lineTo(x + s * 22, y0 + 26); ctx.stroke(); }
  glowAt(ctx, '#bfe0ff', x, bot - 6, 100, 0.85);
  ctx.restore();
};
/** 해파리 방전 (경고 원 / 발동 원 / 죽을 때 작은 방전) */
ZONE_D.jelly_shock = (ctx, z) => {
  const d = z.data, r = d.r ?? 120;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (d.warn || (d.mini && !z.active)) {
    const k = d.warn ? (d.k ?? 0) : z.warnK;
    ctx.fillStyle = `rgba(160,200,255,${0.03 + 0.08 * k})`; ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(210,235,255,${0.2 + 0.6 * k})`; ctx.lineWidth = 1.5 + 1.5 * k;
    ctx.setLineDash([10, 8]); ctx.lineDashOffset = z.t * 40; ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(230,245,255,${0.2 + 0.5 * k})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(d.x, d.y, r * (1 - k) + 6, 0, TAU); ctx.stroke();
    ctx.restore(); return;
  }
  const u = z.liveK, fade = 1 - u;
  ctx.globalAlpha *= fade;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(d.x, d.y, r * (0.85 + 0.15 * u), 0, TAU); ctx.stroke();
  const f = Math.floor(z.t * 30);
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? '#ffffff' : 'rgba(150,200,255,0.8)'; ctx.lineWidth = pass ? 1.2 : 3.5;
    for (let i = 0; i < 9; i++) { const a = i * TAU / 9 + h1(i + f) * 0.4; ctx.beginPath(); ctx.moveTo(d.x, d.y); for (let s = 1; s <= 4; s++) { const rr = r * s / 4, j = (h1(i * 9 + s + f * 3) - 0.5) * 0.35; ctx.lineTo(d.x + Math.cos(a + j) * rr, d.y + Math.sin(a + j) * rr); } ctx.stroke(); }
  }
  glowAt(ctx, '#bfe0ff', d.x, d.y, r * 1.7, 0.7 * fade);
  ctx.restore();
};
/** 뿌리 가시 (경고: !z.active + z.warnK / 솟음: z.liveK) */
ZONE_D.root_spike = (ctx, z) => {
  const d = z.data, x = d.x, by = d.top;
  ctx.save();
  if (!z.active) {
    const k = z.warnK;
    ctx.fillStyle = `rgba(190,255,120,${0.04 + 0.08 * k})`; ctx.fillRect(x - 35, by - z.h, 70, z.h);
    glowAt(ctx, '#9ad040', x, by - 4, 70 + 40 * k, 0.3 + 0.45 * k);
    ctx.fillStyle = `rgba(20,12,6,${0.5 + 0.4 * k})`; ctx.beginPath(); ctx.ellipse(x, by - 1, 24 + 12 * k, 4 + 2 * k, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(210,255,150,${0.35 + 0.55 * k})`; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = h1(i + d.seed) * 30 - 15; ctx.moveTo(x + a, by - 1); ctx.lineTo(x + a * 1.6 + (i - 2) * 6, by - 1 - 6 * k); }
    ctx.stroke();
    ctx.fillStyle = '#4a3522';
    for (let i = -1; i <= 1; i++) { const bx = x + i * 16, hh = (4 + 12 * k) * (i === 0 ? 1 : 0.7) * (0.8 + 0.2 * Math.sin(z.t * 30 + i)); ctx.beginPath(); ctx.moveTo(bx - 5, by); ctx.lineTo(bx, by - hh); ctx.lineTo(bx + 5, by); ctx.closePath(); ctx.fill(); }
    ctx.restore(); return;
  }
  const u = z.liveK, rise = u < 0.25 ? 1 - Math.pow(1 - u / 0.25, 3) : u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1, H = z.h * rise;
  for (let i = -2; i <= 2; i++) {
    const bx = x + i * 12, hh = H * [0.5, 0.78, 1, 0.72, 0.46][i + 2], lean = i * 0.22 + (h1(i + d.seed) - 0.5) * 0.2, tx = bx + lean * hh * 0.5;
    ctx.beginPath(); ctx.moveTo(bx - 8, by);
    ctx.quadraticCurveTo(bx - 4 + lean * hh * 0.3, by - hh * 0.6, tx, by - hh);
    ctx.quadraticCurveTo(bx + 4 + lean * hh * 0.3, by - hh * 0.5, bx + 8, by); ctx.closePath();
    ctx.fillStyle = i % 2 ? '#3a2818' : '#4a3522'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1a0f08'; ctx.stroke();
    ctx.strokeStyle = 'rgba(220,210,170,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx - 3, by - 4); ctx.lineTo(tx - 1, by - hh + 6); ctx.stroke();
    if (i === 0 || i === 2) { ctx.fillStyle = '#c8ff6a'; ctx.beginPath(); ctx.arc(bx + lean * hh * 0.25, by - hh * 0.5, 2.4, 0, TAU); ctx.fill(); glowAt(ctx, '#c8ff6a', bx + lean * hh * 0.25, by - hh * 0.5, 14, 0.7); }
  }
  ctx.fillStyle = 'rgba(40,28,14,0.8)'; for (let i = 0; i < 6; i++) ctx.fillRect(x - 30 + h1(i + d.seed) * 60, by - 4 - h1(i * 3) * 6 * rise, 4, 3);
  ctx.restore();
};
/** 포자 구름 (부패 기믹이 없는 방의 독 Zone) */
ZONE_D.spore_cloud = (ctx, z) => {
  const d = z.data, t = z.t;
  const fade = !z.active ? z.warnK : clamp(z.life / 1, 0, 1);
  if (fade <= 0.01) return;
  const img = HFX.soft?.('rgba(150,200,70,0.55)'), img2 = HFX.soft?.('rgba(120,90,160,0.35)');
  ctx.save(); ctx.globalAlpha *= fade;
  for (let i = 0; i < 7; i++) {
    const u = h1(i + d.seed), v = h1(i * 2.3 + d.seed);
    const cx = z.x + z.w * (0.18 + 0.64 * u) + Math.sin(t * 0.8 + i) * 8, cy = z.y + z.h * (0.25 + 0.5 * v) + Math.cos(t * 0.6 + i * 1.7) * 6;
    const s = Math.min(z.w, z.h) * (0.8 + 0.4 * h1(i + 7)), im = i % 3 === 2 ? img2 : img;
    if (im) ctx.drawImage(im, cx - s / 2, cy - s / 2, s, s);
    else { ctx.fillStyle = 'rgba(150,200,70,0.25)'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.35, 0, TAU); ctx.fill(); }
  }
  ctx.fillStyle = 'rgba(220,255,150,0.65)';
  for (let i = 0; i < 12; i++) { const ph = (t * 0.3 + h1(i + 3)) % 1; ctx.fillRect(z.x + z.w * h1(i * 5 + d.seed) + Math.sin(t + i) * 4, z.y + z.h * (1 - ph), 2, 2); }
  ctx.restore();
};
/** 균사 망자가 쓰러질 때 부풀어 오름 (z.data {x, y}, z.warnK) */
ZONE_D.spore_swell = (ctx, z) => {
  const d = z.data, k = z.warnK;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(200,255,120,${0.3 + 0.5 * k})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(d.x, d.y - 20, 16 + 40 * k, 10 + 24 * k, 0, 0, TAU); ctx.stroke();
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + z.t * 2, r = (14 + 36 * k); ctx.fillStyle = `rgba(210,255,130,${0.5 * k})`; ctx.fillRect(d.x + Math.cos(a) * r - 1, d.y - 20 + Math.sin(a) * r * 0.6 - 1, 2.4, 2.4); }
  glowAt(ctx, '#9ad040', d.x, d.y - 24, 60 + 70 * k, 0.55);
  ctx.restore();
};
/** 무지갯빛 광선 (조준선: fire 없음 + k/lock, 발사: fire true) */
ZONE_D.prism_beam = (ctx, z) => {
  const d = z.data;
  if (d.x1 == null) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  if (!d.fire) {
    const k = d.k ?? 0, blink = d.lock && ((z.t * 16) | 0) % 2 === 0;
    if (d.lock) { ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(190,150,255,0.2)'; ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke(); }
    ctx.strokeStyle = blink ? 'rgba(255,255,255,0.95)' : `rgba(230,220,255,${0.3 + 0.5 * k})`; ctx.lineWidth = d.lock ? 3 : 2;
    ctx.setLineDash(d.lock ? [] : [12, 8]); ctx.lineDashOffset = -z.t * 90;
    ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke(); ctx.setLineDash([]);
    glowAt(ctx, '#ffffff', d.x0, d.y0, 20 + 30 * k, 0.4 + 0.5 * k);
    ctx.restore(); return;
  }
  ctx.globalAlpha *= clamp(z.life / 0.15, 0, 1);
  const nx = -Math.sin(d.a), ny = Math.cos(d.a);
  const cols = ['rgba(255,58,106,0.55)', 'rgba(255,210,70,0.45)', 'rgba(58,255,154,0.55)', 'rgba(106,138,255,0.55)'];
  ctx.lineWidth = 6;
  for (let i = 0; i < 4; i++) { const w = (i - 1.5) * 4 + Math.sin(z.t * 40 + i) * 1.5; ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.moveTo(d.x0 + nx * w, d.y0 + ny * w); ctx.lineTo(d.x1 + nx * w, d.y1 + ny * w); ctx.stroke(); }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke();
  glowAt(ctx, '#e8e0ff', d.x1, d.y1, 80, 0.9); glowAt(ctx, '#ffffff', d.x0, d.y0, 56, 0.85);
  ctx.restore();
};
/** 별이 떨어질 자리 (바닥 원, z.warnK) */
ZONE_D.star_mark = (ctx, z) => {
  const d = z.data, k = z.warnK;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const r = 22 - 10 * k;
  ctx.strokeStyle = `rgba(240,230,255,${0.35 + 0.55 * k})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(d.x, d.y - 2, r, r * 0.3, 0, 0, TAU); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const a = z.t * 3 + i * PI / 2; ctx.moveTo(d.x + Math.cos(a) * (r + 3), d.y - 2 + Math.sin(a) * (r + 3) * 0.3); ctx.lineTo(d.x + Math.cos(a) * (r + 9), d.y - 2 + Math.sin(a) * (r + 9) * 0.3); }
  ctx.stroke();
  ctx.fillStyle = `rgba(230,220,255,${0.08 + 0.2 * k})`; ctx.fillRect(d.x - 1.5, d.y - 120 * k, 3, 120 * k);
  glowAt(ctx, '#e8e0ff', d.x, d.y - 3, 30 + 20 * k, 0.3 + 0.5 * k);
  ctx.restore();
};
/** 인형 소환진 (z.data {x, y, k, fx, fy = 인형사 손}) */
ZONE_D.summon_mark = (ctx, z) => {
  const d = z.data, k = d.k ?? 0;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const R = 14 + 26 * k;
  ctx.strokeStyle = `rgba(200,120,255,${0.3 + 0.5 * k})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(d.x, d.y - 2, R, R * 0.28, 0, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = z.t * 1.5 + i * TAU / 6, b = a + TAU / 3; ctx.moveTo(d.x + Math.cos(a) * R, d.y - 2 + Math.sin(a) * R * 0.28); ctx.lineTo(d.x + Math.cos(b) * R, d.y - 2 + Math.sin(b) * R * 0.28); }
  ctx.stroke();
  if (d.fx != null) {
    ctx.strokeStyle = `rgba(235,220,255,${0.15 + 0.4 * k})`; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = -1; i <= 1; i++) { ctx.moveTo(d.fx + i * 5, d.fy); ctx.quadraticCurveTo((d.fx + d.x) / 2 + i * 8, Math.max(d.fy, d.y - 60 * k) + 10, d.x + i * 10, d.y - 60 * k); }
    ctx.stroke();
  }
  glowAt(ctx, '#c060ff', d.x, d.y - 10, 50 + 40 * k, 0.5 * k);
  ctx.restore();
};
