// 2부 적 렌더러 C (s14 거울의 성 · s15 영겁의 용광로 · s16 가라앉은 성소; world2 §5.1, §5.4) — owner: ENEMY-P2-C-ART
// RENDER_C[id] = (ctx, e, world, o) — render/enemies.js 가 ENEMY_RENDER 에 합친다. 원점 = 발 중앙, 오른쪽을 보는 기준
// (좌우 반전·정예 배율은 호출측 drawEnemy), o.flash = 피격 흰 섬광, world 는 도감/갤러리에서 null.
// 본 그림은 채색 퍼핏(src/render/painted/enemies/<id>.js, reg/enemy-p2-c-art.js 등록)이고, 이 파일의 벡터 그림은
// 리그가 아직 없을 때(로딩 중·?painted=0·에셋 누락)의 단순한 대체 그림이다 (적마다 60줄 이하, MASTER_PLAN ENEMY-P2-C-ART).
// 애니메이션 이름·추가 필드 = game/ai_c.js 머리 주석 (렌더 계약). 재사용 AI: mirror_knight=swordsman, glass_wraith=wraith,
// reflection=shadow, coral_crab=knight.
// PROJ_C[key](ctx, p, world) 원점 = 투사체 중심 · ZONE_C[key](ctx, z, world) 월드 좌표 — ai_c.js 가 그리는 순간에 찾는다.
// 규칙: 매 프레임 그라디언트/캔버스를 만들지 않는다 (glow 스프라이트 캐시), Math.random 금지 (h1 해시), fx.emit 금지.
import { TAU, clamp, lerp, ease } from '../core/math.js';
import { drawHero } from './hero.js';
import * as CW from './painted/enemies/chain_warden.js';

export const RENDER_C = {};
export const PROJ_C = {};
export const ZONE_C = {};

const PI = Math.PI;
const OUT = '#0a0610';
let FL = false;
const C = (c) => (FL ? '#ffffff' : c);
const k01 = (v) => clamp(v, 0, 1);
const h1 = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ───────────────────────── 공용 도우미 ─────────────────────────
const SPR = new Map();
/** 부드러운 빛 스프라이트 (64px, 색마다 한 번 굽는다) */
function spr(color) {
  let c = SPR.get(color);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(0.35, color + '88'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  SPR.set(color, c);
  return c;
}
/** 가산 광원 (color = '#rrggbb') */
function glow(ctx, x, y, r, color, a = 1) {
  if (FL || a <= 0.01 || r <= 0) return;
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * k01(a);
  ctx.drawImage(spr(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
}
/** 외곽선 있는 굵은 선 (팔다리) */
function limb(ctx, x0, y0, x1, y1, w, col) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = w + 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = C(col); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
/** 외곽선 있는 다각형 */
function poly(ctx, pts, col, out = true) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = C(col); ctx.fill();
  if (out) { ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke(); }
}
function ell(ctx, x, y, rx, ry, col, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  ctx.fillStyle = C(col); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3; ctx.stroke();
}
/** 끝점 (각도 0 = 아래, + = 앞) */
const EP = [0, 0];
function end(x, y, a, L) { EP[0] = x + Math.sin(a) * L; EP[1] = y + Math.cos(a) * L; return EP; }
/** 공격 진행: 예비동작 0→1, 휘두름 0→1 */
function phase(at, wu, sw = 0.12) { return at < wu ? [at / wu, 0] : [1, k01((at - wu) / sw)]; }
const hurtK = (e) => (e.flashT > 0 ? 1 : 0);
function shadow(ctx, rx, a = 0.35) { if (FL) return; ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.beginPath(); ctx.ellipse(0, -1, rx, rx * 0.2, 0, 0, TAU); ctx.fill(); }

/** 두 다리 걷기 (발 원점) */
function legs(ctx, e, hipY, len, w, col, stride = 8, col2) {
  const walk = e.anim === 'walk', ph = (e.t ?? 0) * stride, s = walk ? Math.sin(ph) * 0.45 : 0.12;
  let p = end(-2, hipY, -s, len); limb(ctx, -2, hipY, p[0], p[1], w, col2 ?? col);
  p = end(2, hipY, s, len); limb(ctx, 2, hipY, p[0], p[1], w, col);
}

// ═════════════════════════ s14 거울의 성 ═════════════════════════
/** 거울 기사 (swordsman: idle walk slash guard) — 각진 유리 갑주, 금 간 거울 투구, 파편 망토, 유리 검 */
RENDER_C.mirror_knight = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, at = e.animT ?? 0, P = e.params ?? {};
  const bob = e.anim === 'walk' ? -Math.abs(Math.cos(t * 8)) * 2 : Math.sin(t * 2.4) * 0.8;
  shadow(ctx, 20);
  // 파편 망토 (뒤)
  for (let i = 0; i < 7; i++) {
    const x = -14 + i * 2.2, sw = Math.sin(t * 3 + i) * 2 - (e.anim === 'walk' ? 5 : 0);
    poly(ctx, [x, -80 + bob, x - 4 + sw, -40 + i * 3, x + 3 + sw, -44 + i * 3], i % 2 ? '#9fb8d8' : '#c8dcf0', false);
  }
  legs(ctx, e, -42 + bob, 40, 7, '#b8c8dc', 8, '#6a7a96');
  poly(ctx, [-12, -84 + bob, 12, -84 + bob, 15, -60 + bob, 8, -40 + bob, -9, -40 + bob, -14, -62 + bob], '#c8d8ec');
  if (!FL) { ctx.strokeStyle = 'rgba(40,50,90,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -80 + bob); ctx.lineTo(4, -62 + bob); ctx.lineTo(-2, -46 + bob); ctx.moveTo(8, -78 + bob); ctx.lineTo(0, -66 + bob); ctx.stroke(); }
  // 투구 (금 간 거울 면갑)
  poly(ctx, [-8, -86 + bob, 8, -86 + bob, 10, -98 + bob, 2, -110 + bob, -7, -100 + bob], '#dfe8f6');
  poly(ctx, [2, -99 + bob, 10, -98 + bob, 9, -89 + bob, 2, -90 + bob], '#8fb0e0');
  glow(ctx, 6, -94 + bob, 7, '#bfe8ff', 0.8 + 0.2 * Math.sin(t * 4));
  // 검 팔: slash 예비동작 → 휘두름 (첫 타 P.windup, 이후 0.3초)
  let sa = 0.9, ea = 0.5, guard = e.anim === 'guard';
  if (e.anim === 'slash') {
    const wu = e.counter ? 0.25 : (e.comboI ?? 0) === 0 ? (P.windup ?? 0.5) : 0.3;
    const [w, s] = phase(at, wu, 0.1);
    sa = s > 0 ? lerp(3.4, 1.2, ease.outCubic(s)) : lerp(0.9, 3.4, ease.outCubic(w)); ea = s > 0 ? 0.1 : 0.4;
    if (w >= 1 && s > 0 && s < 1 && !FL) { ctx.strokeStyle = 'rgba(200,240,255,0.55)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(4, -78 + bob, 44, -PI * 0.55, PI * 0.25); ctx.stroke(); }
  } else if (guard) { sa = 1.9; ea = 1.2; }
  const sx = 6, sy = -78 + bob;
  let p = end(sx, sy, sa, 16); const ex = p[0], ey = p[1];
  p = end(ex, ey, sa + ea, 14); const hx = p[0], hy = p[1];
  const bladeA = sa + ea + (guard ? 1.4 : 0.9);
  const tip = end(hx, hy, bladeA, 44);
  limb(ctx, hx, hy, tip[0], tip[1], 3.4, '#e8f6ff');
  if (!FL) glow(ctx, tip[0], tip[1], 8, '#cfeaff', 0.5);
  limb(ctx, sx, sy, ex, ey, 7, '#aabcd6'); limb(ctx, ex, ey, hx, hy, 6, '#c8d8ec');
  FL = false;
};

/** 유리 망령 (wraith: float cast vanish) — 깨진 유리판 몸통, 반사된 비명 얼굴, 유리 조각 팔 */
RENDER_C.glass_wraith = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, at = e.animT ?? 0, cast = e.anim === 'cast', van = e.anim === 'vanish';
  const ck = cast ? k01(at / 0.65) : 0, sp = van ? ease.outCubic(k01(at / 0.3)) * 18 : 0;
  const bob = Math.sin(t * 2.2) * 3, y0 = -44 + bob;
  glow(ctx, 0, y0, 36, '#9fd8ff', 0.35 + ck * 0.35);
  // 유리 조각 꼬리 + 몸통 조각 (vanish: 흩어진다)
  for (let i = 0; i < 12; i++) {
    const a = h1(i) * TAU, r = 4 + h1(i + 7) * 14 + sp * (0.6 + h1(i + 3));
    const x = Math.cos(a) * r * 0.7 - (i > 7 ? (i - 7) * 5 : 0), y = y0 + Math.sin(a) * r + (i > 7 ? 16 + (i - 7) * 4 : 0);
    const s = 5 + h1(i + 11) * 6, rot = t * (0.5 + h1(i)) + i;
    const c = Math.cos(rot) * s, sn = Math.sin(rot) * s;
    poly(ctx, [x - c, y - sn, x + sn * 0.6, y - c * 0.6, x + c * 0.8, y + sn * 0.8], i % 3 ? '#cfe6fa' : '#8fb8e6', !FL);
  }
  // 얼굴 (비명)
  ell(ctx, 6, y0 - 16, 7, 9, '#dfefff');
  ell(ctx, 8, y0 - 12, 2.6, 4 + ck * 3 + Math.sin(t * 9) * 0.6, '#10141e');
  if (!FL) { glow(ctx, 5, y0 - 19, 4, '#ffffff', 0.9); glow(ctx, 10, y0 - 19, 4, '#ffffff', 0.9); }
  // 팔: cast 때 앞으로 뻗는다
  const a = lerp(0.8, 1.9, ck) + Math.sin(t * 2) * 0.1;
  const p = end(4, y0 - 6, a, 16), q = end(p[0], p[1], a + 0.3, 14);
  limb(ctx, 4, y0 - 6, p[0], p[1], 3, '#bcdcf6'); limb(ctx, p[0], p[1], q[0], q[1], 2.2, '#e6f4ff');
  if (ck > 0.4) glow(ctx, q[0], q[1], 8 + 10 * ck, '#bfefff', ck);
  FL = false;
};

/** 비친 자 (shadow: 플레이어 동작을 반 박자 늦게 흉내) — 영웅 그림을 은빛 유리처럼 + 금 간 얼굴 */
const REF_LOOK = new WeakMap();
const REF_FALLBACK = { build: 'normal', height: 1.0, hairStyle: 'ponytail', outfit: 'hunter', coat: 'long', weapon: { type: 'whip', style: 3 } };
export function reflectionLook(L) {
  let S = REF_LOOK.get(L);
  if (S) return S;
  S = {
    ...L, skin: '#b8cce0', hair: '#dfeaf6', eyes: '#ffffff', eyeGlow: true,
    primary: '#9fb4cc', secondary: '#6a809c', trim: '#e8f4ff', pants: '#7a8ea8', boots: '#5a6a84',
    armorColor: '#a8bcd4', armorTrim: '#eef6ff', headColor: '#a8bcd4', band: '#cfe8ff',
    cape: L.cape ? { ...L.cape, color: '#8aa0bc', color2: '#cfe0f0' } : null,
    scarf: L.scarf ? { ...L.scarf, color: '#bcd4ec' } : null,
    aura: { color: '#bfe8ff', type: 'holy' }, trailColor: '#bfe8ff',
    weapon: { ...(L.weapon || {}), color: '#dfeeff', glow: true, element: 'ice', rarity: 4 },
  };
  REF_LOOK.set(L, S);
  return S;
}
/** shadow AI 상태 → drawHero 용 플레이어 흉내 객체 (painted/enemies/reflection.js 도 쓴다) */
export function reflectionPose(e, world) {
  const pl = world?.player;
  const ps = e._ps || (e._ps = { cx: 0, bottom: 0, facing: 1, stats: {}, charging: 0, muzzleT: 0 });
  ps.anim = e.heroAnim ?? 'idle'; ps.animT = e.heroAnimT ?? e.animT; ps.move = e.mv ?? null; ps.moveT = e.mvT ?? 0; ps.atkSpeedMul = 1;
  ps.look = reflectionLook(pl?.look || REF_FALLBACK); ps.ch = pl?.ch;
  ps.vx = Math.abs(e.vx ?? 0); ps.vy = e.vy ?? 0; ps.onGround = e.onGround ?? true; ps.rig = e.rig || (e.rig = {}); ps.t = e.t ?? 0;
  ps.dashT = e.dashT ?? 0;
  return ps;
}
/** 금 간 얼굴 · 몸의 균열 (로컬 좌표, 발 원점) */
export function reflectionCracks(ctx, t, a = 1) {
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(10,20,40,0.85)'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(4, -80); ctx.lineTo(8, -72); ctx.lineTo(3, -66); ctx.lineTo(9, -58); ctx.moveTo(8, -72); ctx.lineTo(14, -74); ctx.moveTo(3, -66); ctx.lineTo(-4, -62); ctx.lineTo(-2, -50); ctx.stroke();
  ctx.strokeStyle = 'rgba(235,250,255,0.9)'; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.beginPath(); ctx.moveTo(6, -74); ctx.lineTo(10, -71); ctx.lineTo(6, -67); ctx.closePath(); ctx.fill();   // 텅 빈 속
  ctx.globalAlpha = ga;
  glow(ctx, 8, -73, 5 + Math.sin(t * 6), '#dff4ff', 0.6 * a);
}
RENDER_C.reflection = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, ps = reflectionPose(e, world);
  if (!FL) { ctx.fillStyle = 'rgba(160,210,255,0.22)'; ctx.beginPath(); ctx.ellipse(0, -1, 22, 4, 0, 0, TAU); ctx.fill(); glow(ctx, 0, -42, 44, '#9fd8ff', 0.25); }
  drawHero(ctx, ps, world, FL ? { tint: '#ffffff' } : { alpha: 0.82 });
  if (!FL) reflectionCracks(ctx, t);
  FL = false;
};

/** 샹들리에 마귀 (chandelier: hang shake fall shatter crawl spit) */
RENDER_C.chandelier_fiend = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim, sc = e.scale || 1;
  const hung = an === 'hang' || an === 'shake' || an === 'fall';
  const crawl = !hung && an !== 'shatter', H = 52;
  // 천장 사슬 (매달린 동안만 anchorY 가 있다)
  if (e.anchorY != null && world && !FL) {
    const top = (e.anchorY - e.bottom) / sc;
    ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 3; ctx.setLineDash([5, 3]); ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(0, -H + 4); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.save();
  if (hung) { ctx.translate(0, -H); ctx.rotate(e.sway ?? 0); ctx.translate(0, H); }
  const cy = hung ? -H + 16 : -24 + Math.sin(t * 8) * 1.5;
  // 촛대 팔 6개: 매달림 = 위로 굽은 팔, 기어 다님 = 아래로 뻗은 다리
  for (let i = 0; i < 6; i++) {
    const s = i < 3 ? -1 : 1, k = (i % 3) - 1;
    let a;
    if (hung) a = s * (1.9 + k * 0.35) + Math.sin(t * 2 + i) * 0.04;
    else a = s * (0.55 + k * 0.28) + (crawl && e.anim === 'crawl' ? Math.sin(t * 10 + i * 2.1) * 0.25 : 0);
    const p = end(s * 6, cy, a, 18), q = end(p[0], p[1], a + (hung ? -s * 1.2 : -s * 0.2), 12);
    limb(ctx, s * 6, cy, p[0], p[1], 3, '#b8903a'); limb(ctx, p[0], p[1], q[0], q[1], 2.4, '#d8b050');
    if (hung || an === 'shatter') { ell(ctx, q[0], q[1] - 3, 2, 4, '#c83a2a'); glow(ctx, q[0], q[1] - 9, 7, '#ffc060', 0.8 + 0.2 * Math.sin(t * 12 + i)); }
  }
  // 수정 방울
  if (hung) for (let i = 0; i < 5; i++) { const x = -10 + i * 5; ctx.strokeStyle = C('#e8f4ff'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, cy + 8); ctx.lineTo(x, cy + 16 + (i % 2) * 6); ctx.stroke(); ell(ctx, x, cy + 18 + (i % 2) * 6, 1.8, 3, '#dff0ff'); }
  // 몸통 (황동 구) + 이빨 얼굴
  ell(ctx, 0, cy, 13, 11, '#c8a048');
  ell(ctx, -4, cy - 2, 2.6, 2.6, '#f4e8d0'); ell(ctx, 4, cy - 2, 2.6, 2.6, '#f4e8d0');
  ctx.fillStyle = C('#a01010'); ctx.fillRect(-5, cy - 3, 2, 2); ctx.fillRect(3, cy - 3, 2, 2);
  const open = an === 'spit' ? k01(at / 0.4) : an === 'shake' ? 0.5 + 0.5 * Math.sin(at * 40) : 0.2;
  ell(ctx, 0, cy + 5, 6, 1.5 + open * 3, '#2a0808');
  if (open > 0.5) glow(ctx, 0, cy + 5, 10 * open, '#ff9a40', open);
  ctx.restore();
  if (an === 'shatter' && !FL) { const k = k01(at / 0.5); glow(ctx, 0, -10, 60 * (1 - k * 0.5), '#ffd080', 1 - k); }
  FL = false;
};

// ═════════════════════════ s15 영겁의 용광로 ═════════════════════════
/** 용광로 임프 (forgeimp: fly cast aim dive) */
RENDER_C.forge_imp = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim;
  const dive = an === 'dive', aim = an === 'aim', cast = an === 'cast';
  const flap = Math.sin(t * (dive ? 30 : 16));
  ctx.save();
  ctx.translate(0, -24);
  if (dive) ctx.rotate(clamp(Math.atan2(e.vy ?? 0, Math.abs(e.vx ?? 1)), -1.2, 1.2));
  if (aim) ctx.scale(1 - 0.1 * Math.sin(at * 30), 1);
  glow(ctx, 0, 0, 26, '#ff7a2a', 0.35);
  // 날개 (먼/가까운)
  for (const s of [-1, 1]) {
    const a = dive ? -2.4 : -1.2 + flap * 0.7 * s * 0 - flap * 0.6;
    const p = end(-4, -8, a + (s < 0 ? 0.3 : 0), 18);
    poly(ctx, [-4, -8, p[0], p[1], p[0] + 4, p[1] + 10, -2, 0], s < 0 ? '#2a1410' : '#3a1c14');
  }
  // 꼬리 (끝의 불씨)
  const tl = end(-6, 10, -1.2 + Math.sin(t * 5) * 0.4, 16);
  limb(ctx, -6, 10, tl[0], tl[1], 2, '#1e1210'); glow(ctx, tl[0], tl[1], 6, '#ffa040', 0.9);
  // 몸통 · 머리 · 뿔
  ell(ctx, 0, 2, 8, 11, '#1e1614'); ell(ctx, 3, -12, 7, 6, '#241a16');
  poly(ctx, [0, -17, -4, -25, 2, -18], '#3a2a20'); poly(ctx, [5, -17, 6, -26, 8, -17], '#3a2a20');
  if (!FL) { ctx.strokeStyle = '#ff8a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(2, 4); ctx.lineTo(-1, 9); ctx.moveTo(3, -4); ctx.lineTo(5, 3); ctx.stroke(); }
  glow(ctx, 7, -13, 4, '#ffd040', 1);
  // 팔: cast = 대갈못을 들어 올림
  const ck = cast ? k01(at / 0.55) : 0;
  const ha = lerp(0.6, 2.8, ck);
  const hp = end(3, -4, ha, 12);
  limb(ctx, 3, -4, hp[0], hp[1], 2.4, '#2a1c16');
  if (cast) glow(ctx, hp[0], hp[1], 5 + 6 * ck, '#ffb050', 0.6 + 0.4 * ck);
  if (aim && !FL) glow(ctx, 0, 0, 30, '#ff5a1a', 0.5 + 0.3 * Math.sin(at * 40));
  ctx.restore();
  FL = false;
};

/** 쇳물 골렘 (slag: idle walk windup slam spit) · e.glow 0..1 */
RENDER_C.slag_golem = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim, P = e.params ?? {}, gk = clamp(e.glow ?? 0, 0, 1);
  const bob = an === 'walk' ? -Math.abs(Math.cos(t * 4)) * 3 : Math.sin(t * 1.6);
  shadow(ctx, 34, 0.45);
  legs(ctx, e, -42 + bob, 40, 14, '#3a2418', 4, '#22140e');
  // 팔 각도
  let sh = 0.3, el = 0.3;
  if (an === 'windup') { const k = ease.outCubic(k01(at / (P.windup ?? 0.8))); sh = lerp(0.3, 3.0, k); el = lerp(0.3, 0.6, k); }
  else if (an === 'slam') { const k = ease.outCubic(k01(at / 0.12)); sh = lerp(3.0, 0.9, k); el = lerp(0.6, 0.2, k); }
  else if (an === 'spit') sh = 0.1;
  const arm = (sx, s0, col) => { const p = end(sx, -88 + bob, s0, 26), q = end(p[0], p[1], s0 + el, 24); limb(ctx, sx, -88 + bob, p[0], p[1], 13, col); limb(ctx, p[0], p[1], q[0], q[1], 12, col); ell(ctx, q[0], q[1], 10, 9, '#4a2a1a'); glow(ctx, q[0], q[1], 10, '#ff7a2a', 0.4 + gk * 0.6); };
  arm(-8, sh * 0.95 - 0.1, '#2a1810');
  // 몸통: 식은 껍질 + 쇳물 균열 + 가슴 핵
  poly(ctx, [-26, -96 + bob, 18, -100 + bob, 30, -70 + bob, 22, -40 + bob, -20, -40 + bob, -30, -70 + bob], '#3a2418');
  if (!FL) {
    ctx.strokeStyle = gk > 0.3 ? '#ffd070' : '#ff7a2a'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(-20, -86 + bob); ctx.lineTo(-6, -72 + bob); ctx.lineTo(-14, -56 + bob); ctx.moveTo(10, -92 + bob); ctx.lineTo(4, -74 + bob); ctx.lineTo(16, -58 + bob); ctx.stroke();
  }
  poly(ctx, [-14, -98 + bob, 2, -104 + bob, 8, -94 + bob], '#5a5a60');   // 박힌 철판
  glow(ctx, 2, -70 + bob, 16 + gk * 10, '#ff8a2a', 0.7 + gk * 0.3);
  ell(ctx, 16, -102 + bob, 9, 8, '#2a1a12');
  glow(ctx, 20, -104 + bob, 4, '#fff4c0', 1);
  if (an === 'spit') glow(ctx, 24, -96 + bob, 8 + 8 * k01(at / 0.6), '#ffb040', 1);
  arm(10, sh, '#3a2418');
  FL = false;
};

/** 사슬 간수 (chainhook: idle walk aim throw reel smash sweep) — 갈고리 사슬은 ZONE_C.hook */
RENDER_C.chain_warden = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim;
  const bob = an === 'walk' ? -Math.abs(Math.cos(t * 7)) * 2 : Math.sin(t * 2) * 0.7;
  shadow(ctx, 20);
  legs(ctx, e, -40 + bob, 38, 8, '#4a3a30', 7, '#2a201a');
  poly(ctx, [-12, -80 + bob, 12, -80 + bob, 14, -42 + bob, -12, -42 + bob], '#8a8a90');
  poly(ctx, [-8, -60 + bob, 12, -60 + bob, 14, -18 + bob, -6, -18 + bob], '#5a3a24');   // 가죽 앞치마
  // 머리: 철창 가면 + 뿔
  ell(ctx, 4, -88 + bob, 8, 8, '#3a3a40');
  poly(ctx, [-2, -93 + bob, -10, -106 + bob, -4, -94 + bob], '#141014'); poly(ctx, [6, -94 + bob, 10, -108 + bob, 10, -94 + bob], '#141014');
  if (!FL) { ctx.strokeStyle = '#1a1a1e'; ctx.lineWidth = 1.2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(2 + i * 3, -95 + bob); ctx.lineTo(2 + i * 3, -81 + bob); ctx.stroke(); } }
  glow(ctx, 9, -89 + bob, 4, '#ff3020', 0.9);
  // 사슬 팔
  let sa = 0.5, ea = 0.4;
  if (an === 'aim') { sa = -0.8 + Math.sin(at * 20) * 0.2; ea = 1.6; }
  else if (an === 'throw') { sa = 1.6; ea = 0; }
  else if (an === 'reel') { sa = 1.2; ea = 0.9; }
  else if (an === 'smash') { const [w, s] = phase(at, e.smashWu ?? 0.2); sa = s > 0 ? lerp(0.2, 3.2, ease.outCubic(s)) : lerp(0.6, 0.2, w); ea = s > 0 ? 0.2 : 1.4; }
  else if (an === 'sweep') { const [w, s] = phase(at, e.params?.sweepWindup ?? 0.6, 0.15); sa = s > 0 ? lerp(-1.2, 1.5, s) : lerp(0.5, -1.2, w); ea = 0.2; }
  const sx = 6, sy = -76 + bob, p = end(sx, sy, sa, 18), q = end(p[0], p[1], sa + ea, 16);
  limb(ctx, sx, sy, p[0], p[1], 7, '#8a8a90'); limb(ctx, p[0], p[1], q[0], q[1], 6, '#6a6a70');
  if (!FL) { ctx.strokeStyle = '#3a3430'; ctx.lineWidth = 3; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]); }
  if (an === 'sweep' && at > (e.params?.sweepWindup ?? 0.6) && !FL) { ctx.strokeStyle = 'rgba(200,190,170,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.quadraticCurveTo(60, -4, 150, -8); ctx.stroke(); }
  FL = false;
};

/** 불풀무 (bellows: idle inhale blow) · e.inflate 0..1 */
RENDER_C.bellows = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, inf = clamp(e.inflate ?? 0.3, 0, 1);
  const bagH = 10 + inf * 22, y1 = -14, y0 = y1 - bagH;
  shadow(ctx, 26);
  for (const x of [-18, -6, 8, 18]) limb(ctx, x, -12, x + 2, -2, 5, '#3a3a40');
  poly(ctx, [-30, y1, 26, y1 + 2, 26, y1 - 4, -30, y1 - 6], '#5a3a22');           // 아래 판
  // 가죽 주머니 (주름)
  ell(ctx, -4, (y0 + y1) / 2, 26, bagH / 2 + 3, '#7a4a30');
  if (!FL) { ctx.strokeStyle = 'rgba(30,14,8,0.7)'; ctx.lineWidth = 1.2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-4 - i * 5, (y0 + y1) / 2, 4, bagH / 2, 0, -PI / 2, PI / 2); ctx.stroke(); } }
  poly(ctx, [-30, y0 - 4, 26, y0 - 2, 26, y0 + 2, -30, y0], '#6a4428');           // 위 판
  limb(ctx, -30, y0 - 2, -40, y0 - 8, 4, '#4a3020');
  // 노즐 + 우상 얼굴
  limb(ctx, 24, (y0 + y1) / 2, 40, (y0 + y1) / 2 - 2, 6, '#4a4a50');
  ell(ctx, 44, (y0 + y1) / 2 - 2, 7, 8, '#b8903a');
  const blow = an === 'blow', ink = an === 'inhale';
  ell(ctx, 47, (y0 + y1) / 2, 3 + (blow ? 2 : 0), 3 + (blow ? 2 : 0), '#2a0a04');
  glow(ctx, 48, (y0 + y1) / 2, blow ? 20 : ink ? 10 : 6, '#ff7a2a', blow ? 1 : 0.6 + 0.2 * Math.sin(t * 6));
  if (ink && !FL) for (let i = 0; i < 4; i++) { const u = ((t * 1.8 + i / 4) % 1); ctx.strokeStyle = `rgba(220,200,170,${0.5 * u})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(48, (y0 + y1) / 2, 12 + (1 - u) * 50, -0.5, 0.5); ctx.stroke(); }
  FL = false;
};

// ═════════════════════════ s16 가라앉은 성소 ═════════════════════════
/** 심해 아귀 (swimmer: swim bite leap flop) · e.lure 0..1 · e.inWater */
RENDER_C.abyss_angler = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, an = e.anim, lure = clamp(e.lure ?? 0, 0, 1);
  const bite = an === 'bite' || an === 'leap', flop = an === 'flop';
  const jaw = bite ? 0.7 + 0.2 * Math.sin(t * 20) : 0.15 + 0.05 * Math.sin(t * 3);
  ctx.save(); ctx.translate(0, -22);
  if (an === 'leap') ctx.rotate(clamp((e.vy ?? 0) * 0.001, -0.8, 0.8));
  if (flop) ctx.rotate(Math.sin(t * 14) * 0.25);
  const wv = Math.sin(t * (an === 'swim' ? 6 : 10));
  // 꼬리
  poly(ctx, [-24, 0, -40, -10 + wv * 6, -44, 10 + wv * 6], '#a89880');
  // 몸통 (반투명 피부 + 뼈)
  ell(ctx, -4, 0, 24, 15, '#c8bca8');
  if (!FL) { ctx.strokeStyle = 'rgba(90,70,60,0.55)'; ctx.lineWidth = 1; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-14 + i * 5, 2, 8, -1.2, 1.2); ctx.stroke(); } }
  // 아래턱 (경첩 = 뒤쪽)
  ctx.save(); ctx.translate(4, 6); ctx.rotate(jaw * 0.9);
  poly(ctx, [0, 0, 26, -2, 22, 8, 2, 8], '#b8a890');
  if (!FL) { ctx.fillStyle = '#f0f0e0'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(6 + i * 4, -1); ctx.lineTo(8 + i * 4, -8); ctx.lineTo(9 + i * 4, -1); ctx.fill(); } }
  ctx.restore();
  ell(ctx, 12, -6, 2.4, 2.4, '#e8f0f0');
  // 초롱불 줄기 + 빛
  const lx = 30 + Math.sin(t * 2) * 3, ly = -26 + Math.cos(t * 2.4) * 3;
  if (!FL) { ctx.strokeStyle = '#8a7a68'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(8, -12); ctx.quadraticCurveTo(22, -34, lx, ly); ctx.stroke(); }
  ell(ctx, lx, ly, 3.5, 3.5, '#dffcff');
  glow(ctx, lx, ly, 14 + lure * 16, '#aef8ff', 0.8 + lure * 0.2);
  ctx.restore();
  FL = false;
};

/** 수몰 사제 (tidecaller: idle walk cast bless) */
RENDER_C.sunken_priest = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim, P = e.params ?? {};
  const bob = an === 'walk' ? -Math.abs(Math.cos(t * 6)) * 1.5 : Math.sin(t * 1.8);
  const ck = an === 'cast' ? k01(at / (P.windup ?? 0.7)) : an === 'bless' ? k01(at / 0.6) : 0;
  shadow(ctx, 16);
  // 산호 지팡이 (먼 손)
  limb(ctx, -8, -2, -6, -86 + bob, 2.6, '#e8c8c0'); ell(ctx, -6, -88 + bob, 3.6, 3.6, '#f4fcff'); glow(ctx, -6, -88 + bob, 10 + ck * 10, '#8ae8ff', 0.6 + ck * 0.4);
  // 로브 (밑단이 흔들림)
  const sw = Math.sin(t * 2.2) * 2;
  poly(ctx, [-8, -72 + bob, 10, -72 + bob, 15 + sw, 0, -14 + sw, 0], '#1e5a58');
  if (!FL) { ctx.strokeStyle = '#b8903a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-14 + sw, -2); ctx.lineTo(15 + sw, -2); ctx.stroke(); }
  poly(ctx, [-6, -74 + bob, 4, -74 + bob, 2, -30 + bob, -4, -30 + bob], '#3a6a2a');      // 해초 영대
  // 머리 + 따개비 주교관
  ell(ctx, 3, -78 + bob, 7, 7, '#9ab0a0');
  poly(ctx, [-3, -82 + bob, 9, -82 + bob, 6, -100 + bob, 2, -104 + bob, -1, -100 + bob], '#c8c0a8');
  ell(ctx, 6, -80 + bob, 1.8, 1.8, '#f0f4f0');
  ell(ctx, 8, -75 + bob, 2.2, 1.5 + ck * 2, '#2a1a1a');
  // 가까운 팔: 주문 때 앞으로 든다
  const a = lerp(0.3, 2.2, ck) + Math.sin(t * 2) * 0.05;
  const p = end(4, -68 + bob, a, 14), q = end(p[0], p[1], a + 0.3, 12);
  limb(ctx, 4, -68 + bob, p[0], p[1], 6, '#1e5a58'); limb(ctx, p[0], p[1], q[0], q[1], 4, '#9ab0a0');
  if (ck > 0.1) glow(ctx, q[0], q[1], 8 + 12 * ck, an === 'bless' ? '#7fe8d0' : '#8ad8ff', ck);
  FL = false;
};

/** 산호 게 (knight: idle walk attack) — 거대한 집게 (P.windup 에 내리찍기) */
RENDER_C.coral_crab = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim, P = e.params ?? {};
  const walk = an === 'walk', bob = walk ? Math.sin(t * 12) * 1.2 : Math.sin(t * 2) * 0.6;
  shadow(ctx, 34, 0.4);
  // 다리 4쌍 (옆걸음)
  for (let i = 0; i < 4; i++) {
    const x = -20 + i * 11, ph = t * 12 + i * 1.6, lift = walk ? Math.max(0, Math.sin(ph)) * 4 : 0;
    const kx = x + (i < 2 ? -8 : 8), ky = -26 + bob;
    limb(ctx, x, -18 + bob, kx, ky - lift, 3.2, '#8a2a20'); limb(ctx, kx, ky - lift, kx + (i < 2 ? -3 : 5), -1 - lift * 0.3, 2.6, '#6a1a14');
  }
  // 등딱지 + 산호 + 작은 사당
  ell(ctx, 0, -24 + bob, 30, 13, '#a83a2a');
  for (let i = 0; i < 4; i++) { const x = -18 + i * 9; limb(ctx, x, -32 + bob, x + (i % 2 ? 3 : -3), -44 + bob - (i % 2) * 5, 3, i % 2 ? '#ff8a6a' : '#ffb0a0'); }
  poly(ctx, [-4, -34 + bob, 8, -34 + bob, 8, -44 + bob, 2, -50 + bob, -4, -44 + bob], '#8a8878');
  glow(ctx, 2, -40 + bob, 6, '#ffe0a0', 0.7 + 0.2 * Math.sin(t * 3));
  // 눈자루
  limb(ctx, 20, -30 + bob, 24, -40 + bob, 1.6, '#a83a2a'); ell(ctx, 24, -41 + bob, 2.2, 2.2, '#101010');
  // 거대한 집게: 예비동작에 들어 올림 → P.windup 에 내리찍음
  let a = 1.2, open = 0.2;
  if (an === 'attack') { const [w, s] = phase(at, P.windup ?? 0.55, 0.1); a = s > 0 ? lerp(2.8, 1.1, ease.outCubic(s)) : lerp(1.2, 2.8, ease.outCubic(w)); open = s > 0 ? lerp(0.9, 0, s) : w * 0.9; }
  const p = end(20, -20 + bob, a, 16);
  limb(ctx, 20, -20 + bob, p[0], p[1], 7, '#b8402c');
  ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(PI / 2 - a);
  ell(ctx, 12, 0, 14, 9, '#c84a34');
  poly(ctx, [20, -4, 40, -8 - open * 8, 36, 0], '#d85a40');
  poly(ctx, [20, 4, 38, 6 + open * 6, 34, 10], '#b8402c');
  ctx.restore();
  FL = false;
};

/** 세이렌 (siren: float sing dive vanish appear) */
RENDER_C.siren = (ctx, e, world, o) => {
  FL = !!o?.flash;
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim;
  const sing = an === 'sing', dive = an === 'dive';
  const sk = sing ? k01(at / 0.8) : 0, bob = Math.sin(t * 1.6) * 3;
  ctx.save(); ctx.translate(0, -44 + bob);
  if (dive) ctx.rotate(clamp(Math.atan2(e.vy ?? 0, Math.abs(e.vx ?? 1)) * 0.6, -0.9, 0.9) + 0.2);
  glow(ctx, 0, -6, 30, '#6ad8ff', 0.25 + sk * 0.3);
  // 꼬리 (헤엄치는 물결)
  let x = -2, y = 8, a = 0.2;
  for (let i = 0; i < 5; i++) { a += Math.sin(t * 4 - i * 0.8) * 0.25 - 0.08; const p = end(x, y, a, 7); limb(ctx, x, y, p[0], p[1], 9 - i * 1.4, i % 2 ? '#3a8a90' : '#4aa0a8'); x = p[0]; y = p[1]; }
  poly(ctx, [x, y, x - 12, y + 10 + Math.sin(t * 4) * 4, x + 6, y + 12], '#6ac0c8');
  // 몸통 + 아가미 선
  ell(ctx, 0, -8, 8, 16, '#9ab8c8');
  if (!FL) { ctx.strokeStyle = '#8ffcff'; ctx.lineWidth = 1; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-3, -14 + i * 4); ctx.lineTo(4, -12 + i * 4); ctx.stroke(); } }
  // 머리 + 지느러미 머리칼 + 찢어진 입
  for (let i = 0; i < 4; i++) { const ha = -2.6 - i * 0.15 + Math.sin(t * 3 + i) * 0.15; const p = end(0, -30, ha, 16 + i * 3); poly(ctx, [-2, -32, p[0], p[1], p[0] + 4, p[1] + 5, 2, -28], '#5ac8d8', false); }
  ell(ctx, 3, -30, 7, 8, '#a8c4d4');
  ell(ctx, 6, -32, 2.2, 2.6, '#060606');
  ell(ctx, 6, -25, 5, 1 + sk * 4, '#1a0a14');
  // 팔
  const aa = dive ? 1.9 : sing ? 2.4 : 0.6 + Math.sin(t * 2) * 0.2;
  const p = end(2, -18, aa, 12), q = end(p[0], p[1], aa + 0.4, 11);
  limb(ctx, 2, -18, p[0], p[1], 3, '#9ab8c8'); limb(ctx, p[0], p[1], q[0], q[1], 2.4, '#a8c4d4');
  if (sing && !FL) for (let i = 0; i < 3; i++) { const u = (t * 1.5 + i / 3) % 1; ctx.strokeStyle = `rgba(160,240,255,${0.7 * (1 - u)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(8, -25, 6 + u * 26, -0.7, 0.7); ctx.stroke(); }
  ctx.restore();
  FL = false;
};

// ═════════════════════════ 투사체 (원점 = 투사체 중심) ═════════════════════════
/** 달군 대갈못 (용광로 임프) */
PROJ_C.rivet = (ctx, p) => {
  glow(ctx, 0, 0, 16, '#ff8a3a', 0.8);
  ctx.save(); ctx.rotate(p.rot || 0);
  ctx.fillStyle = '#5a2a14'; ctx.fillRect(-7, -3, 13, 6);
  ctx.fillStyle = '#ff9a40'; ctx.fillRect(-6, -2, 11, 4);
  ctx.fillStyle = '#fff2c0'; ctx.fillRect(-2, -1, 6, 2);
  ctx.fillStyle = '#ffb050'; ctx.beginPath(); ctx.arc(-7, 0, 4.2, 0, TAU); ctx.fill();
  ctx.restore();
};
/** 샹들리에 불씨 */
PROJ_C.flamebit = (ctx, p) => {
  const f = 1 + Math.sin((p.t ?? 0) * 30) * 0.12;
  glow(ctx, 0, 0, 18, '#ff9a40', 0.8);
  ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.ellipse(0, 1, 5 * f, 7 * f, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffe8a0'; ctx.beginPath(); ctx.ellipse(0, 2, 2.4, 3.6, 0, 0, TAU); ctx.fill();
};
/** 뱉은 촛불 (수평 비행: 녹은 촛농 꼬리 + 불꽃) */
PROJ_C.candle = (ctx, p) => {
  const d = Math.sign(p.vx || 1), t = p.t ?? 0;
  ctx.save(); ctx.scale(d, 1);
  glow(ctx, 0, 0, 22, '#ffb050', 0.8);
  ctx.fillStyle = 'rgba(255,150,60,0.55)'; ctx.beginPath(); ctx.moveTo(4, -5); ctx.quadraticCurveTo(-14, -3 + Math.sin(t * 30) * 2, -24, 0); ctx.quadraticCurveTo(-14, 3, 4, 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8342a'; ctx.fillRect(-4, -3, 8, 6);
  ctx.fillStyle = '#ffe0a0'; ctx.beginPath(); ctx.ellipse(6, 0, 5, 3.4, 0, 0, TAU); ctx.fill();
  ctx.restore();
};
/** 녹은 쇳덩이 (쇳물 골렘) */
PROJ_C.glob = (ctx, p) => {
  const r = (p.w ?? 18) * 0.5, t = p.t ?? 0;
  glow(ctx, 0, 0, r * 2.4, '#ff6a1a', 0.7);
  ctx.fillStyle = '#2a0e06'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.arc(-1, -1, r * 0.8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd070'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.36, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1a0804';
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + t * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, r * 0.22, 0, TAU); ctx.fill(); }
};
/** 커다란 유도 물방울 (수몰 사제) */
PROJ_C.bubble = (ctx, p) => {
  const t = p.t ?? 0, r = (p.w ?? 44) * 0.5 * (1 + Math.sin(t * 9) * 0.05);
  glow(ctx, 0, 0, r * 1.7, '#78d2ff', 0.45);
  ctx.fillStyle = 'rgba(110,190,240,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, r * (1 + Math.sin(t * 7) * 0.04), r * (1 - Math.sin(t * 7) * 0.04), 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(200,245,255,0.85)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, r * 0.7, -PI * 0.85, -PI * 0.55); ctx.stroke();
  // 속에 갇힌 작은 물고기 뼈
  ctx.strokeStyle = 'rgba(230,240,230,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(6, 2); for (let i = -1; i <= 1; i++) { ctx.moveTo(i * 3, -1); ctx.lineTo(i * 3, 5); } ctx.stroke();
};

// ═════════════════════════ 장판 (월드 좌표) ═════════════════════════
/** 경고선: 점선이 짙어지다가 끝무렵 깜빡인다. data {x0,y0,x1,y1,color} */
ZONE_C.warnline = (ctx, z) => {
  const d = z.data; if (d?.x0 == null) return;
  const k = k01(z.liveK), blink = k > 0.7 ? (Math.sin(z.t * 50) > 0 ? 1 : 0.4) : 1, col = d.color ?? '#ff3c46';
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.3 + 0.6 * k) * blink;
  ctx.strokeStyle = col; ctx.lineWidth = 1 + 2.5 * k;
  ctx.setLineDash([10, 6]); ctx.lineDashOffset = -z.t * 80;
  ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.25 * blink; ctx.lineWidth = 6 * k; ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke();
  ctx.globalAlpha = blink; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(d.x1, d.y1, 3 + 5 * k, 0, TAU); ctx.fill();
  ctx.restore();
};
/** 바닥 경고: 발밑 띠가 차오른다 (data.color) */
ZONE_C.floorwarn = (ctx, z) => {
  const k = k01(z.liveK), blink = k > 0.7 ? (Math.sin(z.t * 46) > 0 ? 1 : 0.5) : 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (0.18 + 0.35 * k) * blink;
  ctx.fillStyle = z.data?.color ?? '#ff3040';
  const h = Math.max(4, z.h * (0.25 + 0.75 * k));
  ctx.fillRect(z.x, z.y + z.h - h, z.w, h);
  ctx.globalAlpha = (0.5 + 0.5 * k) * blink; ctx.fillRect(z.x, z.y + z.h - 3, z.w, 3);
  for (let i = 0; i < 3; i++) { const u = (z.t * 1.6 + i / 3) % 1; ctx.globalAlpha = 0.35 * (1 - u) * blink; ctx.fillRect(z.x, z.y + z.h - 3 - u * h, z.w, 1.5); }
  ctx.restore();
};
/** 쇳물 웅덩이 (슬래그 골렘) */
ZONE_C.magma = (ctx, z) => {
  const fade = z.active ? k01(z.life / 0.5) : z.warnK, cx = z.cx, by = z.y + z.h, w = z.w / 2, t = z.t + (z.data?.seed ?? 0);
  ctx.save(); ctx.globalAlpha = fade;
  ctx.fillStyle = '#3a0c02'; ctx.beginPath(); ctx.ellipse(cx, by - 4, w + 3, 7.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#c8320a'; ctx.beginPath(); ctx.ellipse(cx, by - 5, w * 0.9, 5.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.ellipse(cx + Math.sin(t * 1.3) * w * 0.15, by - 5.5, w * 0.62, 3.6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd070'; ctx.beginPath(); ctx.ellipse(cx + Math.sin(t * 2) * w * 0.2, by - 6, w * 0.3, 1.8, 0, 0, TAU); ctx.fill();
  glow(ctx, cx, by - 8, w * 1.4, '#ff6a1a', 0.55);
  for (let i = 0; i < 3; i++) {
    const u = (t * 1.1 + i / 3) % 1, x = cx + (h1(i + Math.floor(t * 1.1 + i / 3) * 3) - 0.5) * w * 1.4;
    ctx.strokeStyle = `rgba(255,210,120,${0.85 * (1 - u)})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, by - 6 - u * 7, 1.5 + u * 3, PI, TAU); ctx.stroke();
  }
  ctx.restore();
};
/** 대갈못이 떨어진 자리의 불 */
ZONE_C.burn = (ctx, z) => {
  const fade = k01(z.life / 0.4), cx = z.cx, by = z.y + z.h, t = z.t;
  ctx.save(); ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(30,10,4,0.6)'; ctx.beginPath(); ctx.ellipse(cx, by - 1, 18, 3, 0, 0, TAU); ctx.fill();
  glow(ctx, cx, by - 6, 28, '#ff7a2a', 0.55);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const h = 8 + 6 * Math.sin(t * 17 + i * 2.1), x = cx - 12 + i * 8;
    ctx.fillStyle = i % 2 ? '#ffd070' : '#ff7a2a';
    ctx.beginPath(); ctx.moveTo(x - 4, by); ctx.quadraticCurveTo(x - 2, by - h * 0.6, x + Math.sin(t * 11 + i) * 2, by - h); ctx.quadraticCurveTo(x + 3, by - h * 0.5, x + 4, by); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
};
/** 갈고리 사슬: 간수 손(d.hx,d.hy) → 갈고리. 채색 리그가 있으면 그림 사슬 고리·갈고리 (painted/enemies/chain_warden.js) */
ZONE_C.hook = (ctx, z, world) => {
  const d = z.data; if (d?.hx == null) return;
  if (CW.drawHookZone?.(ctx, z, world)) return;
  const x = z.cx, y = z.cy, dir = d.dir || 1;
  ctx.save();
  ctx.strokeStyle = '#1a1614'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(d.hx, d.hy); ctx.lineTo(x, y); ctx.stroke();
  ctx.strokeStyle = '#8a8078'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -d.dist * 0.5;
  ctx.beginPath(); ctx.moveTo(d.hx, d.hy); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
  ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.strokeStyle = '#1a1614'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(2, 0, 9, -PI * 0.5, PI * 0.75); ctx.stroke();
  ctx.strokeStyle = d.hooked ? '#ff6a4a' : '#c8c0b4'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(2, 0, 9, -PI * 0.5, PI * 0.75); ctx.stroke();
  ctx.fillStyle = '#c8c0b4'; ctx.beginPath(); ctx.moveTo(-5, 6); ctx.lineTo(-11, 2); ctx.lineTo(-4, 1); ctx.fill();
  ctx.restore();
};
/** 풀무의 부채꼴 불길 (data {dir,len,L,H,mx,my}) */
ZONE_C.flamecone = (ctx, z) => {
  const d = z.data; if (!d || d.len <= 1) return;
  const fade = k01(z.life / 0.2), dir = d.dir, L = d.len, hh = 14 + (d.H / 2 - 14) * (L / d.L), t = z.t;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade;
  ctx.translate(d.mx, d.my); ctx.scale(dir, 1);
  const wob = Math.sin(t * 30) * 4;
  ctx.fillStyle = 'rgba(200,50,10,0.35)';
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.quadraticCurveTo(L * 0.6, -hh - 6 - wob, L + 8, -hh * 0.8); ctx.lineTo(L + 8, hh * 0.8); ctx.quadraticCurveTo(L * 0.6, hh + 6 + wob, 0, 16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,110,30,0.45)';
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(L * 0.6, -hh + wob, L, -hh * 0.6); ctx.lineTo(L, hh * 0.6); ctx.quadraticCurveTo(L * 0.6, hh - wob, 0, 12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,190,80,0.55)';
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(L * 0.5, -hh * 0.5, L * 0.85, 0); ctx.quadraticCurveTo(L * 0.5, hh * 0.5, 0, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,245,200,0.6)'; ctx.beginPath(); ctx.ellipse(L * 0.18, 0, L * 0.2, 5, 0, 0, TAU); ctx.fill();
  // 불꽃 혀 (결정적 해시로 흔들림)
  for (let i = 0; i < 6; i++) { const u = ((t * 2.2 + h1(i)) % 1), x = u * L, s = 4 + u * hh * 0.5; ctx.fillStyle = `rgba(255,200,90,${0.5 * (1 - u)})`; ctx.beginPath(); ctx.arc(x, (h1(i + 5) - 0.5) * hh * u * 1.4, s, 0, TAU); ctx.fill(); }
  glow(ctx, L * 0.45, 0, hh * 1.7, '#ff7a2a', 0.45);
  ctx.restore();
};
/** 물기둥 (수몰 사제): delay = 경고 (ZONE_B.pillar 와 같은 모양, 성소의 청록빛) */
ZONE_C.geyser = (ctx, z) => {
  const cx = z.cx, by = z.y + z.h, t = z.t;
  ctx.save();
  if (!z.active) {
    const k = z.warnK;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) { const u = (t * 1.6 + i / 3) % 1; ctx.strokeStyle = `rgba(120,230,220,${(0.3 + 0.6 * k) * (1 - u)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, by - 2, 10 + u * 26, 3 + u * 4, 0, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = `rgba(90,210,200,${0.25 * k})`; ctx.beginPath(); ctx.ellipse(cx, by - 2, 28, 5, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) { const u = (t * 2.4 + i / 4) % 1; ctx.fillStyle = `rgba(200,255,250,${0.7 * k * (1 - u)})`; ctx.beginPath(); ctx.arc(cx + (h1(i) - 0.5) * 40, by - 4 - u * 22 * k, 1.8, 0, TAU); ctx.fill(); }
    ctx.restore(); return;
  }
  const up = ease.outCubic(k01(z.liveK * 5)), fade = k01(z.life / 0.15), H = z.h * up, w = z.w / 2;
  ctx.globalAlpha = fade;
  ctx.fillStyle = 'rgba(40,140,150,0.55)';
  ctx.beginPath(); ctx.moveTo(cx - w, by);
  for (let i = 0; i <= 8; i++) { const u = i / 8; ctx.lineTo(cx - w * (0.95 - u * 0.25) + Math.sin(t * 20 + i) * 2.5, by - H * u); }
  ctx.quadraticCurveTo(cx, by - H - 16, cx + w * 0.7, by - H);
  for (let i = 8; i >= 0; i--) { const u = i / 8; ctx.lineTo(cx + w * (0.95 - u * 0.25) + Math.sin(t * 22 + i) * 2.5, by - H * u); }
  ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(160,240,245,0.55)'; ctx.fillRect(cx - w * 0.35, by - H, w * 0.7, H);
  ctx.fillStyle = 'rgba(240,255,255,0.6)'; ctx.fillRect(cx - w * 0.12, by - H, w * 0.24, H);
  for (let i = 0; i < 6; i++) { const a = h1(i) * TAU + t * 3; ctx.fillStyle = 'rgba(220,255,250,0.8)'; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * w * 0.9, by - H - 4 + Math.sin(a) * 8, 2.4, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(200,250,245,0.5)'; ctx.beginPath(); ctx.ellipse(cx, by - 3, w * 1.4, 6, 0, 0, TAU); ctx.fill();
  glow(ctx, cx, by - H * 0.5, w * 2, '#7fe8e0', 0.35);
  ctx.restore();
};
/** 세이렌의 노래 파문 (data {cx,cy,r,gapA,gap,th}): 틈 양 끝에 밝은 매듭 → 틈이 잘 보인다 */
ZONE_C.songring = (ctx, z) => {
  const d = z.data; if (!d) return;
  const fade = k01(z.life / 0.25), a0 = d.gapA + d.gap / 2, a1 = d.gapA - d.gap / 2 + TAU;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(90,190,255,0.28)'; ctx.lineWidth = d.th + 6; ctx.beginPath(); ctx.arc(d.cx, d.cy, d.r, a0, a1); ctx.stroke();
  ctx.strokeStyle = 'rgba(140,225,255,0.45)'; ctx.lineWidth = d.th * 0.6; ctx.beginPath(); ctx.arc(d.cx, d.cy, d.r, a0, a1); ctx.stroke();
  ctx.strokeStyle = 'rgba(235,252,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(d.cx, d.cy, d.r, a0, a1); ctx.stroke();
  // 음표 물결 (고리를 따라 흐르는 밝은 점)
  for (let i = 0; i < 10; i++) { const a = a0 + ((i / 10 + z.t * 0.3) % 1) * (a1 - a0); ctx.fillStyle = 'rgba(220,250,255,0.8)'; ctx.beginPath(); ctx.arc(d.cx + Math.cos(a) * d.r, d.cy + Math.sin(a) * d.r, 2.2, 0, TAU); ctx.fill(); }
  for (const a of [a0, a1]) glow(ctx, d.cx + Math.cos(a) * d.r, d.cy + Math.sin(a) * d.r, 10, '#dff8ff', 0.9);
  ctx.restore();
};
