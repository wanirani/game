// 타격 연출 캐시 (owner: FEEL-REACT) — feel.md §4.7, §4.8, §8, §9 WP2
//
// 캐시 스프라이트 (가산 합성용, 각도 0 = +x 방향; impact.js 가 회전·크기를 정해 fx.ghost 로 그린다):
//   glow(color) star(color) cut(color) streak(color) ring(color) → 캔버스 (같은 색은 같은 캔버스)
//   soft(color)       연기·섬광 파티클용 부드러운 원 (particles.js 가 매 프레임 그라디언트를 만들지 않도록)
//   decalSprite(kind, i)  바닥·벽 자국 ('blood' 'goo' 'crack' 'scorch' 'frost')
// 데미지 숫자:
//   digitAtlas(style, color?) → { canvas, g:{ch:[x,y,w,h,adv]}, tag:[x,y,w,h]|null, k, size, h, fontOk }
//     style = DMG_STYLE 키 (normal crit weak resist counter ult total hurt heal). 0–9 , ! + 를 2배 해상도로 굽는다.
//     글꼴(FONT.dmg = BN Dmg)이 늦게 도착하면 ui.fontEpoch 가 바뀔 때 같은 캔버스에 다시 굽는다.
//   dmgLayout(atlas, str) → { q:[[sx,sy,sw,sh,dx]…], w }   (논리 px, 문자열 가운데 기준 dx)
//   textSprite(text, {color, size, outline, skew}) → { canvas, w, h, k }   (판정 문구 'COUNTER' '가드!' … 캐시)
// 파편·자국:
//   materialBurst(fx, mat, x, y, dir, cls, elementColor)   재질별 파편 (한 번에 ≤ BUDGET[q].perHit − 6)
//   stampDecal(world, x, y, dir, mat, opts?)                가장 가까운 벽(θ 방향 60px 안) 또는 바닥에 자국 (방마다 40/24/0개, FIFO)
// 캔버스는 부팅 뒤 한가할 때 미리 굽고(prewarm), 캐시 상한을 넘으면 가장 오래된 캔버스를 다시 쓴다 → 스테이지 도중 새 캔버스 생성 최소화.
import * as UI from '../core/ui.js';
import * as FH from '../data/feel_hit.js';
import { rand, TAU, clamp, hexToRgb } from '../core/math.js';
import { TILE, game } from '../core/game.js';
import { isSolidType } from '../core/physics.js';
import { bus } from '../core/events.js';

/** QA 용 통계 (캔버스 생성 수, 굽기 횟수) */
export const HITFX_STATS = { canvases: 0, bakes: 0, rebakes: 0, prewarmed: false };

// 예비 캔버스 (0×0): 부팅 때와 스테이지·방 진입 때 채워 두고, 처음 보는 색·문구·아틀라스가 싸움 도중에 나오면 여기서 꺼내
// 크기만 준다 → 스테이지 도중 새 캔버스 0 (MASTER_PLAN §5.2, R1-REQ-339R/#216). 안 쓰는 예비는 메모리 0
const SPARE = [];
const SPARE_N = 24;
function fillSpares(n = SPARE_N) {
  if (typeof document === 'undefined' || !document.createElement) return;
  while (SPARE.length < n) { const c = document.createElement('canvas'); c.width = 0; c.height = 0; SPARE.push(c); HITFX_STATS.canvases++; }
}
fillSpares();
let NO_SPARE = false;   // 미리 굽기(prewarm) 중에는 싸움용 예비를 쓰지 않는다 (예비는 싸움 도중 처음 보는 것용) → WARM_SPARE 에서
// 미리 굽기 몫의 0×0 캔버스: 모듈을 평가할 때(스테이지가 생기기 전) 한꺼번에 만들어 두고, 한가할 때 도는 굽기 작업은 크기만 준다
// → 곧장 스테이지로 들어가거나 지연 장면 교체로 스테이지가 먼저 시작돼도 그 뒤 새 캔버스 0 (feel §8, #216/#478). 남은 것은 싸움용 예비로
const WARM_SPARE = [];
const WARM_N = 80;
if (typeof document !== 'undefined' && document.createElement) while (WARM_SPARE.length < WARM_N) { const c = document.createElement('canvas'); c.width = 0; c.height = 0; WARM_SPARE.push(c); HITFX_STATS.canvases++; }
function mkCanvas(w, h) {
  let c = NO_SPARE ? WARM_SPARE.pop() ?? null : SPARE.pop() ?? null;
  if (c) { c.width = w; c.height = h; return c; }
  if (typeof document !== 'undefined' && document.createElement) { c = document.createElement('canvas'); c.width = w; c.height = h; }
  else if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
  if (c) HITFX_STATS.canvases++;
  return c;
}
/** '#rgb' '#rrggbb' 'rgb()' 'rgba()' → 'rgba(r,g,b,a)' (그 밖의 색 이름은 그대로) */
function rgbaOf(color, a) {
  if (typeof color !== 'string') return `rgba(255,255,255,${a})`;
  if (color[0] === '#') { const [r, g, b] = hexToRgb(color); return `rgba(${r},${g},${b},${a})`; }
  const m = /^rgba?\(([^)]+)\)/i.exec(color);
  if (m) { const p = m[1].split(',').map((s) => parseFloat(s)); return `rgba(${p[0] | 0},${p[1] | 0},${p[2] | 0},${a * (p.length > 3 && Number.isFinite(p[3]) ? p[3] : 1)})`; }
  return color;
}
const qualityKey = (fx) => { const q = fx?.quality ?? 1; return q >= 0.95 ? 'high' : q >= 0.7 ? 'medium' : 'low'; };
const BUDGET_DEF = { high: { perHit: 28, decals: 40, dmgNums: 24 }, medium: { perHit: 18, decals: 24, dmgNums: 16 }, low: { perHit: 10, decals: 0, dmgNums: 10 } };
export function budgetOf(fx) { const k = qualityKey(fx); return { ...BUDGET_DEF[k], ...(FH.BUDGET?.[k] ?? {}) }; }

// ───────────────────────── 색별 스프라이트 캐시 ─────────────────────────
/** 종류마다 고정 크기 캔버스 + LRU (상한을 넘으면 가장 오래된 캔버스를 비워서 다시 쓴다) */
class SpriteCache {
  constructor(w, h, cap, bake) { this.w = w; this.h = h; this.cap = cap; this.bake = bake; this.map = new Map(); this.win = 0; this.nb = 0; }
  get(color, force = false) {
    const key = color || '#ffffff';
    const m = this.map;
    let c = m.get(key);
    if (c) { if (m.size > 8) { m.delete(key); m.set(key, c); } return c; }
    // 굽기 속도 상한: 색이 제각각인 효과가 캐시를 계속 밀어내며 매 프레임 굽지 않게 (0.2초에 8장; 넘으면 null → 호출부 대체 경로)
    // force = 미리 굽기 (prewarm 이 한 번에 여러 색을 구울 때는 상한을 쓰지 않는다)
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (now - this.win > 200) { this.win = now; this.nb = 0; }
    if (++this.nb > 8 && !force) return null;
    if (m.size >= this.cap) { const k0 = m.keys().next().value; c = m.get(k0); m.delete(k0); }
    else c = mkCanvas(this.w, this.h);
    if (!c) return null;
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    ctx.save();
    try { this.bake(ctx, key, this.w, this.h); } catch (e) { console.warn('[hitfx] bake', e); }
    ctx.restore();
    HITFX_STATS.bakes++;
    m.set(key, c);
    return c;
  }
}

function bakeGlow(ctx, col, w, h) {
  const R = w / 2, g = ctx.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.14, rgbaOf(col, 0.95));
  g.addColorStop(0.45, rgbaOf(col, 0.3));
  g.addColorStop(1, rgbaOf(col, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function starPath(ctx, cx, cy, n, r0, r1, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU, r = i & 1 ? r1 : r0;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}
function bakeStar(ctx, col, w, h) {
  const R = w / 2;
  // 은은한 후광
  const g = ctx.createRadialGradient(R, R, 0, R, R, R * 0.55);
  g.addColorStop(0, rgbaOf(col, 0.55)); g.addColorStop(1, rgbaOf(col, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // 8갈래 별: 긴 4갈래 + 짧은 대각 4갈래 (색 테두리 → 흰 심)
  ctx.shadowColor = col; ctx.shadowBlur = 8;
  ctx.fillStyle = rgbaOf(col, 0.95);
  starPath(ctx, R, R, 4, R * 0.94, R * 0.1, -Math.PI / 2); ctx.fill();
  starPath(ctx, R, R, 4, R * 0.52, R * 0.08, -Math.PI / 4); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  starPath(ctx, R, R, 4, R * 0.72, R * 0.045, -Math.PI / 2); ctx.fill();
  starPath(ctx, R, R, 4, R * 0.34, R * 0.04, -Math.PI / 4); ctx.fill();
  ctx.beginPath(); ctx.arc(R, R, R * 0.09, 0, TAU); ctx.fill();
}
function lens(ctx, x0, x1, cy, hh, lead = 0.72) {
  const L = x1 - x0;
  ctx.beginPath();
  ctx.moveTo(x0, cy);
  ctx.bezierCurveTo(x0 + L * 0.35, cy - hh * 0.5, x0 + L * lead, cy - hh * 1.35, x1, cy);
  ctx.bezierCurveTo(x0 + L * lead, cy + hh * 1.35, x0 + L * 0.35, cy + hh * 0.5, x0, cy);
  ctx.closePath();
}
function bakeCut(ctx, col, w, h) {
  const cy = h / 2;
  ctx.shadowColor = col; ctx.shadowBlur = 10;
  ctx.fillStyle = rgbaOf(col, 0.9);
  lens(ctx, 6, w - 6, cy, h * 0.2);
  ctx.fill();
  ctx.shadowBlur = 4; ctx.shadowColor = '#ffffff';
  ctx.fillStyle = '#ffffff';
  lens(ctx, 18, w - 12, cy, h * 0.075, 0.78);
  ctx.fill();
}
function bakeStreak(ctx, col, w, h) {
  const cy = h / 2, hx = w - 22;
  const g = ctx.createLinearGradient(4, 0, hx, 0);
  g.addColorStop(0, rgbaOf(col, 0)); g.addColorStop(0.55, rgbaOf(col, 0.75)); g.addColorStop(1, '#ffffff');
  ctx.shadowColor = col; ctx.shadowBlur = 6;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(4, cy); ctx.lineTo(hx, cy - 3.5); ctx.lineTo(hx + 8, cy); ctx.lineTo(hx, cy + 3.5); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff';
  starPath(ctx, hx, cy, 4, 12, 1.8, 0); ctx.fill();
}
function bakeRing(ctx, col, w, h) {
  const R = w / 2;
  ctx.shadowColor = col; ctx.shadowBlur = 9;
  ctx.strokeStyle = rgbaOf(col, 0.85); ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(R, R, R * 0.78, 0, TAU); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(R, R, R * 0.78, 0, TAU); ctx.stroke();
}
function bakeSoft(ctx, col, w) {
  // particles.js 의 옛 그라디언트(색 → rgba(0,0,0,0))와 같은 모양
  const R = w / 2, g = ctx.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
}

const C_GLOW = new SpriteCache(96, 96, 24, bakeGlow);
const C_STAR = new SpriteCache(128, 128, 24, bakeStar);
const C_CUT = new SpriteCache(256, 64, 20, bakeCut);
const C_STREAK = new SpriteCache(256, 32, 16, bakeStreak);
const C_RING = new SpriteCache(128, 128, 16, bakeRing);
const C_SOFT = new SpriteCache(64, 64, 40, (ctx, col, w) => bakeSoft(ctx, col, w));

export function glow(color) { return C_GLOW.get(color); }
export function star(color) { return C_STAR.get(color); }
export function cut(color) { return C_CUT.get(color); }
export function streak(color) { return C_STREAK.get(color); }
export function ring(color) { return C_RING.get(color); }
/** 부드러운 원 (연기·섬광 파티클). 색 문자열 그대로 키로 쓴다 */
export function soft(color) { return C_SOFT.get(color); }

// ───────────────────────── 자국 스프라이트 ─────────────────────────
const DECAL_KIND = {
  blood: { w: 72, h: 22, n: 3, c: ['#4a0610', '#7a0a18', '#9a0d1c'] },
  goo: { w: 64, h: 20, n: 2, c: ['#2a6a1a', '#4aa832', '#6adf4a'] },
  crack: { w: 110, h: 26, n: 2, c: ['#0c0806', '#2a2018', '#8a7a68'] },
  scorch: { w: 60, h: 20, n: 1, c: ['#0a0808', '#241c18', '#3a302a'] },
  frost: { w: 64, h: 20, n: 1, c: ['#6aa8c8', '#9fdcff', '#e8fbff'] },
};
const DECALS = new Map();
function bakeDecal(ctx, kind, i, w, h) {
  const K = DECAL_KIND[kind], cy = h / 2, seed = i * 7.31 + 1;
  const rr = (k) => { const s = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  if (kind === 'crack') {
    // 방사형 균열: 가운데 움푹 + 지그재그 금
    ctx.fillStyle = rgbaOf(K.c[1], 0.7);
    ctx.beginPath(); ctx.ellipse(w / 2, cy, w * 0.16, h * 0.28, 0, 0, TAU); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + rr(k) * 0.6;
      let x = w / 2, y = cy;
      ctx.strokeStyle = K.c[0]; ctx.lineWidth = 2.2 - k * 0.12;
      ctx.beginPath(); ctx.moveTo(x, y);
      const len = w * (0.22 + rr(k + 11) * 0.26);
      for (let s = 1; s <= 4; s++) {
        x = w / 2 + Math.cos(a) * len * (s / 4) + (rr(k * 5 + s) - 0.5) * 6;
        y = cy + Math.sin(a) * len * (s / 4) * (h / w) * 1.6 + (rr(k * 3 + s) - 0.5) * 3;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = rgbaOf(K.c[2], 0.5); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(w / 2, cy - 1, w * 0.17, h * 0.3, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    return;
  }
  // 타원 무리: 큰 웅덩이 + 작은 방울 + 튄 자국
  ctx.fillStyle = rgbaOf(K.c[0], 0.85);
  ctx.beginPath(); ctx.ellipse(w / 2, cy, w * 0.3, h * 0.3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = rgbaOf(K.c[1], 0.9);
  for (let k = 0; k < 6; k++) {
    const x = w * (0.22 + rr(k) * 0.56), y = cy + (rr(k + 20) - 0.5) * h * 0.35;
    ctx.beginPath(); ctx.ellipse(x, y, w * (0.05 + rr(k + 40) * 0.1), h * (0.12 + rr(k + 60) * 0.16), 0, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = rgbaOf(K.c[2], 0.85);
  for (let k = 0; k < 7; k++) {
    const side = rr(k + 80) < 0.5 ? -1 : 1;
    const x = w / 2 + side * w * (0.28 + rr(k + 90) * 0.2), y = cy + (rr(k + 100) - 0.5) * h * 0.6;
    ctx.beginPath(); ctx.ellipse(x, y, 1.2 + rr(k + 110) * 2.4, 1 + rr(k + 120) * 1.6, 0, 0, TAU); ctx.fill();
  }
  if (kind === 'blood' || kind === 'goo') {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.ellipse(w * 0.45, cy - h * 0.1, w * 0.12, h * 0.08, 0, 0, TAU); ctx.fill();
  }
}
/** 자국 스프라이트 (kind, 변형 번호) */
export function decalSprite(kind, i = 0) {
  const K = DECAL_KIND[kind] ?? DECAL_KIND.scorch;
  kind = DECAL_KIND[kind] ? kind : 'scorch';
  i = ((i | 0) % K.n + K.n) % K.n;
  const key = kind + i;
  let c = DECALS.get(key);
  if (c) return c;
  c = mkCanvas(K.w, K.h);
  if (!c) return null;
  const ctx = c.getContext('2d');
  try { bakeDecal(ctx, kind, i, K.w, K.h); } catch (e) { console.warn('[hitfx] decal', e); }
  HITFX_STATS.bakes++;
  DECALS.set(key, c);
  return c;
}

// ───────────────────────── 데미지 숫자 아틀라스 ─────────────────────────
const DMG_DEF = {
  normal: { size: 20, color: '#ffffff', outline: '#200008' },
  crit: { size: 30, color: '#ffd24a', grad: ['#fff2a0', '#ffb020'], outline: '#3a1000', tag: 'CRITICAL', tagSize: 11 },
  weak: { size: 22, color: '#ff8a4a', outline: '#200008', tag: '약점', tagSize: 10 },
  resist: { size: 16, color: '#9a9aa8', outline: '#200008', tag: '저항', tagSize: 10 },
  counter: { size: 24, color: '#aef0ff', outline: '#06202a' },
  ult: { size: 26, color: '#ffe070', outline: '#8a0010' },
  total: { size: 34, color: '#ffd24a', grad: ['#fff2a0', '#ffb020'], outline: '#8a0010', prefix: '합계', prefixSize: 10 },
  hurt: { size: 22, color: '#ff4050', outline: '#200008' },
  heal: { size: 20, color: '#7ee07e', outline: '#06200a', prefix: '+' },
};
/** 스타일 키 → 표 항목 (feel_hit.DMG_STYLE 우선, 없으면 기본값) */
export function dmgStyle(key) { return FH.DMG_STYLE?.[key] ?? DMG_DEF[key] ?? FH.DMG_STYLE?.normal ?? DMG_DEF.normal; }
const GLYPHS = '0123456789,!+';
const ATLAS_K = 2;              // 2배 해상도로 굽는다
const ATLAS_CAP = 28;           // (스타일, 색) 조합 상한 → 넘으면 가장 오래된 아틀라스 캔버스를 다시 쓴다
const ATLAS = new Map();
function dmgFont() { return UI.FONT?.dmg ?? UI.FONT?.num ?? 'sans-serif'; }
function epochNow() { return UI.fontEpoch ?? 0; }
function dmgFontReady() {
  try {
    if (typeof UI.faceReady === 'function') return !!UI.faceReady('BN Dmg');
    return typeof document !== 'undefined' && document.fonts.check('400 20px "BN Dmg"', '0');
  } catch { return false; }
}
function bakeAtlas(A) {
  const st = A.st, K = ATLAS_K, size = (st.size ?? 20) * K;
  const tagText = st.tag ?? (st.prefix && st.prefix.length > 1 ? st.prefix : null);
  const tagSize = (st.tagSize ?? st.prefixSize ?? 10) * K;
  const lw = Math.max(3, size * 0.2);     // 외곽선 굵기 (굽는 px)
  const pad = Math.ceil(lw / 2 + 2);
  const font = `400 ${size}px ${dmgFont()}`, tfont = `700 ${tagSize}px ${dmgFont()}`;
  let c = A.canvas ?? mkCanvas(8, 8);
  if (!c) return A;
  let ctx = c.getContext('2d');
  ctx.font = font;
  const adv = {};
  let W = 0;
  for (const ch of GLYPHS) { adv[ch] = Math.ceil(ctx.measureText(ch).width); W += adv[ch] + pad * 2; }
  const cellH = Math.ceil(size * 1.22) + pad * 2;
  let tagW = 0, tagH = 0;
  if (tagText) { ctx.font = tfont; tagW = Math.ceil(ctx.measureText(tagText).width) + pad * 2; tagH = Math.ceil(tagSize * 1.3) + pad * 2; }
  const CW = Math.max(W, tagW) + 2, CH = cellH + tagH + 2;
  if (c.width !== CW || c.height !== CH) { c.width = CW; c.height = CH; ctx = c.getContext('2d'); }
  else ctx.clearRect(0, 0, CW, CH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
  ctx.font = font;
  const color = A.color ?? st.color ?? '#ffffff';
  let fill = color;
  if (!A.color && Array.isArray(st.grad) && st.grad.length >= 2) {
    const gr = ctx.createLinearGradient(0, pad + size * 0.1, 0, pad + size * 1.1);
    gr.addColorStop(0, st.grad[0]); gr.addColorStop(1, st.grad[1]);
    fill = gr;
  }
  const g = {};
  let x = 1;
  const my = 1 + cellH / 2;
  for (const ch of GLYPHS) {
    const cw = adv[ch] + pad * 2;
    ctx.lineWidth = lw; ctx.strokeStyle = st.outline ?? '#200008';
    ctx.strokeText(ch, x + pad, my);
    ctx.fillStyle = fill; ctx.fillText(ch, x + pad, my);
    g[ch] = [x, 1, cw, cellH, adv[ch]];
    x += cw;
  }
  let tag = null;
  if (tagText) {
    ctx.font = tfont;
    const ty = 1 + cellH + tagH / 2;
    ctx.lineWidth = Math.max(2, tagSize * 0.26); ctx.strokeStyle = st.outline ?? '#200008';
    ctx.strokeText(tagText, 1 + pad, ty);
    ctx.fillStyle = A.color ?? (Array.isArray(st.grad) ? st.grad[0] : color);
    ctx.fillText(tagText, 1 + pad, ty);
    tag = [1, 1 + cellH, tagW, tagH];
  }
  A.canvas = c; A.g = g; A.tag = tag; A.k = K; A.pad = pad; A.size = st.size ?? 20; A.h = cellH;
  A.epoch = epochNow(); A.fontOk = dmgFontReady();
  HITFX_STATS.bakes++;
  return A;
}
/**
 * 데미지 숫자 아틀라스. style = DMG_STYLE 키, color = 숫자 색 덮어쓰기 (null = 스타일 색).
 * 글꼴 세대(ui.fontEpoch)가 바뀌었고 BN Dmg 없이 구운 아틀라스면 같은 캔버스에 다시 굽는다.
 */
export function digitAtlas(style = 'normal', color = null) {
  const key = color ? `${style}|${color}` : style;
  let A = ATLAS.get(key);
  if (A) {
    if (A.epoch !== epochNow()) {
      if (!A.fontOk || A.fontStr !== dmgFont()) { A.fontStr = dmgFont(); bakeAtlas(A); HITFX_STATS.rebakes++; }
      else A.epoch = epochNow();
    }
    if (A.color && ATLAS.size >= ATLAS_CAP - 4) { ATLAS.delete(key); ATLAS.set(key, A); }   // 상한 가까이: 최근에 쓴 색은 뒤로 (LRU)
    return A.canvas ? A : null;
  }
  let reuse = null;
  if (ATLAS.size >= ATLAS_CAP) {
    // 스타일 기본색 아틀라스는 남기고, 가장 오래 안 쓴 색 덮어쓰기 아틀라스의 캔버스를 다시 쓴다.
    // 밀려난 아틀라스는 캔버스를 놓는다 → 아직 떠 있는 그 숫자는 (다른 글자로 뒤섞여 보이지 않고) 그리지 않는다
    let old = null, k0 = null;
    for (const [k, a] of ATLAS) if (a.color) { old = a; k0 = k; break; }
    if (!old) { k0 = ATLAS.keys().next().value; old = ATLAS.get(k0); }
    ATLAS.delete(k0);
    reuse = old.canvas; old.canvas = null;
  }
  A = { style, color, st: dmgStyle(style), canvas: reuse, fontStr: dmgFont() };
  bakeAtlas(A);
  if (!A.canvas) return null;
  ATLAS.set(key, A);
  return A;
}
/** 숫자 문자열 배치: q = [[sx, sy, sw, sh, dx]…] (논리 px, dx 는 문자열 가운데 기준 칸 왼쪽), w = 전체 폭 */
export function dmgLayout(A, str) {
  const k = A.k, pad = A.pad / k, q = [];
  let w = 0;
  for (const ch of str) { const gl = A.g[ch]; if (gl) w += gl[4] / k; }
  let x = -w / 2;
  for (const ch of str) {
    const gl = A.g[ch];
    if (!gl) continue;
    q.push([gl[0], gl[1], gl[2], gl[3], x - pad]);
    x += gl[4] / k;
  }
  return { q, w };
}
/** 숫자 → '12,345' (천 단위 쉼표) */
export function fmtDmg(v) {
  const n = Math.max(0, Math.round(Number(v) || 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ───────────────────────── 판정 문구 스프라이트 ─────────────────────────
const TXT = new Map();
const TXT_CAP = 48;
function bakeText(T) {
  const K = ATLAS_K, size = T.size * K, lw = Math.max(3, size * 0.24), pad = Math.ceil(lw / 2 + 3);
  const skew = T.skew ?? 0;
  const font = `400 ${size}px ${dmgFont()}`;
  let c = T.canvas ?? mkCanvas(8, 8);
  if (!c) return T;
  let ctx = c.getContext('2d');
  ctx.font = font;
  const tw = Math.ceil(ctx.measureText(T.text).width);
  const H = Math.ceil(size * 1.3) + pad * 2, W = tw + pad * 2 + Math.ceil(Math.abs(skew) * H) + 2;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; ctx = c.getContext('2d'); }
  else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); }
  // 기울임: 글자 윗부분이 앞으로 (x' = x + skew·(y - 기준선))
  const base = H / 2;
  ctx.setTransform(1, 0, skew, 1, -skew * base + Math.abs(skew) * H * 0.5, 0);
  ctx.font = font; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  ctx.lineWidth = lw; ctx.strokeStyle = T.outline ?? '#1a0610';
  ctx.strokeText(T.text, pad, base);
  ctx.fillStyle = T.color ?? '#ffe8c0'; ctx.fillText(T.text, pad, base);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  T.canvas = c; T.w = W / K; T.h = H / K; T.k = K;
  T.epoch = epochNow(); T.fontOk = dmgFontReady();
  HITFX_STATS.bakes++;
  return T;
}
/** 판정 문구 스프라이트 (같은 문구·색·크기는 캐시). 반환 { canvas, w, h } (논리 px) */
export function textSprite(text, o = {}) {
  const size = o.size ?? FH.CALLOUT?.size ?? 15, color = o.color ?? FH.CALLOUT?.color ?? '#ffe8c0';
  const outline = o.outline ?? FH.CALLOUT?.outline ?? '#1a0610', skew = o.skew ?? FH.CALLOUT?.skew ?? -0.21;
  const key = `${text}|${color}|${size}|${outline}|${skew}`;
  let T = TXT.get(key);
  if (T) {
    if (T.epoch !== epochNow() && !T.fontOk) { bakeText(T); HITFX_STATS.rebakes++; }
    else T.epoch = epochNow();
    return T.canvas ? T : null;
  }
  let reuse = null;
  if (TXT.size >= TXT_CAP) { const k0 = TXT.keys().next().value, old = TXT.get(k0); reuse = old.canvas; old.canvas = null; TXT.delete(k0); }   // 밀려난 문구는 캔버스를 놓는다 (떠 있던 것은 그리지 않음)
  T = { text: String(text), color, size, outline, skew, canvas: reuse };
  bakeText(T);
  if (!T.canvas) return null;
  TXT.set(key, T);
  return T;
}

// ───────────────────────── 재질 파편 ─────────────────────────
const CLS_I = { L: 0, M: 1, H: 2, F: 3, U: 0, S: 3, A: 3 };
/**
 * 재질별 파편 (feel §4.7 (2)). 개수는 high 기준 표 × 품질 비율, 합계 ≤ BUDGET[q].perHit − 6 (impact 가 속성 강조 6개를 더한다).
 * dir: 공격 방향 ±1, cls: 'L'|'M'|'H'|'F', color: 속성 색 (섬광 색에 섞는다) | null. 반환: 방출한 파티클 수
 */
export function materialBurst(fx, mat, x, y, dir = 1, cls = 'M', color = null) {
  if (!fx?.emit) return 0;
  const B = budgetOf(fx), qk = B.perHit / 28, cap = Math.max(2, B.perHit - 6);
  const ci = CLS_I[cls] ?? 1, heavy = ci >= 2;
  const M = FH.MATERIAL?.[mat] ?? {};
  const th = dir < 0 ? Math.PI : 0;
  const up = dir < 0 ? 0.35 : -0.35;   // 위쪽으로 살짝 들린 원뿔
  let n = 0;
  const put = (type, k, opts) => {
    const m = Math.min(Math.max(0, Math.round(k)), cap - n);
    for (let i = 0; i < m; i++) fx.emit(type, x, y, opts);
    n += m;
  };
  const cnt = (arr, def) => (Array.isArray(arr) ? arr[Math.min(3, ci)] ?? def : def) * qk;
  switch (mat) {
    case 'flesh': {
      put('blood', cnt(M.n, [8, 10, 12, 14][ci]), { angle: th + up, spread: M.cone ?? 0.5, speed: rand(M.speed?.[0] ?? 180, M.speed?.[1] ?? 420) });
      put('bloodmist', heavy ? 2 : 1, { color: M.mist ?? '#5a0610', vx: dir * 40 });
      break;
    }
    case 'bone': {
      put('shard', cnt(M.n, [5, 6, 7, 8][ci]), { color: M.color ?? '#e8dcc0', size: rand(2.5, 4), angle: th + up, spread: 0.9, speed: 300 });
      put('dust', 1, { speed: 40 });
      if (n < cap && fx.sprite) { fx.sprite(cut('#ffffff'), x, y, { size: 34 + ci * 8, angle: rand(-1.2, 1.2), life: 0.12, s0: 0.6, s1: 1 }); n++; }
      break;
    }
    case 'metal': {
      const k = cnt(M.n, [10, 11, 12, 14][ci]);
      put('spark', Math.ceil(k / 2), { color: M.color ?? '#ffd080', speed: 520, grav: M.grav ?? 900, angle: th + up, spread: 1.1 });
      put('spark', Math.floor(k / 2), { color: M.color2 ?? '#fff3c0', speed: 420, grav: M.grav ?? 900, angle: th + up, spread: 1.3 });
      if (n < cap) { fx.flash(x, y, { color: color ?? '#ffffff', size: 30 + ci * 6, life: 0.08 }); n++; }
      break;
    }
    case 'ghost': {
      put('ecto', cnt(M.n, 6), { angle: th - Math.PI / 2 * 0.3, spread: 1.4, speed: 90 });
      if (n < cap) { fx.ring(x, y, { color: M.color ?? '#8affc8', r0: M.ring?.[0] ?? 6, r1: M.ring?.[1] ?? 46, life: 0.3, width: 2 }); n++; }
      break;
    }
    case 'stone': {
      put('gravel', cnt(M.n, 6), { color: M.color ?? '#8a8480', angle: th + up, spread: 1, speed: 320 });
      put('dust', qk > 0.5 ? 2 : 1, { speed: 60 });
      break;
    }
    case 'slime': put('goo', cnt(M.n, 6), { color: M.color ?? '#6adf4a', angle: th + up, spread: 0.9 }); break;
    case 'paper': put('paper', cnt(M.n, 6), { color: M.color ?? '#e8e0c8', angle: th + up, spread: 1.2 }); break;
    case 'ice': {
      put('ice', cnt(M.n, 8), { angle: th + up, spread: 1, speed: 260 });
      put('bloodmist', 1, { color: M.mist ?? '#bff4ff', alpha: 0.3, add: true });
      break;
    }
    case 'fire': {
      put('ember', cnt(M.n, 6), { angle: th + up, spread: 1.2, speed: 160 });
      put('fire', 1, { speed: 50 });
      break;
    }
    case 'feather': put('feather', cnt(M.n, 6), { angle: th + up, spread: 1.4 }); break;
    default: put('spark', 4 * qk, { color: M.color ?? '#ffc070', angle: th, spread: 1 }); break;
  }
  // 무거운 타격: 속성 색 섬광 한 겹 (예산 안에서)
  if (color && heavy && n < cap && mat !== 'metal') { fx.flash(x, y, { color, size: 26 + ci * 6, life: 0.08 }); n++; }
  return n;
}

// ───────────────────────── 자국 (decal) ─────────────────────────
const MAT_DECAL = { flesh: 'blood', slime: 'goo', ice: 'frost', fire: 'scorch', crack: 'crack', blood: 'blood', goo: 'goo', scorch: 'scorch', frost: 'frost' };
function solidAt(map, px, py) {
  if (!map?.typeAt) return false;
  return isSolidType(map.typeAt(Math.floor(px / TILE), Math.floor(py / TILE)));
}
function floorAt(map, px, py) {
  const t = map.typeAt(Math.floor(px / TILE), Math.floor(py / TILE));
  return isSolidType(t) || t === 2;   // 2 = 발판 (위에서만 밟는 칸)
}
/**
 * 가장 가까운 면에 자국을 찍는다: θ(dir) 방향 60px 안의 벽 → 없으면 아래 바닥(140px 안).
 * mat: 재질(flesh slime ice fire) 또는 자국 종류('crack' 'blood' 'goo' 'scorch' 'frost').
 * opts: { life (기본 18초), fade (마지막 3초), floor: true = 바닥만, scale }
 * 방마다 상한 BUDGET[q].decals (40 / 24 / 0), 넘으면 가장 오래된 것부터 지운다. 반환: 자국 | null
 */
export function stampDecal(world, x, y, dir = 1, mat = 'flesh', opts = {}) {
  const fx = world?.fx, map = world?.map;
  if (!fx?.addDecal || !map) return null;
  const cap = budgetOf(fx).decals ?? 40;
  if (!(cap > 0)) return null;
  const kind = MAT_DECAL[mat] ?? 'scorch';
  const K = DECAL_KIND[kind];
  const img = decalSprite(kind, (Math.random() * 8) | 0);
  if (!img) return null;
  const sc = (opts.scale ?? 1) * rand(0.8, 1.15);
  const d = { img, x, y, rot: 0, w: K.w * sc, h: K.h * sc, life: opts.life ?? 18, fade: opts.fade ?? 3, flip: Math.random() < 0.5 };
  d.max = d.life;
  const sd = dir < 0 ? -1 : 1;
  let placed = false;
  if (!opts.floor) {
    // 벽: 공격 방향으로 4px 씩 60px 까지
    for (let s = 4; s <= 60; s += 4) {
      const px = x + sd * s;
      if (solidAt(map, px, y)) {
        const tx = Math.floor(px / TILE);
        d.x = sd > 0 ? tx * TILE : (tx + 1) * TILE;
        d.y = y + rand(-8, 8);
        d.rot = sd > 0 ? -Math.PI / 2 : Math.PI / 2;
        d.atx = tx; d.aty = Math.floor(y / TILE);   // 붙은 칸 (부서지면 자국도 지운다: particles.update)
        placed = true;
        break;
      }
    }
  }
  if (!placed) {
    const fx0 = x + sd * rand(6, 34);
    if (solidAt(map, fx0, y)) return null;   // 공중에 박힌 지점 (벽 속)
    for (let s = 0; s <= 140; s += 4) {
      const py = y + s;
      if (floorAt(map, fx0, py)) {
        d.x = fx0; d.y = Math.floor(py / TILE) * TILE + 1; d.rot = 0;
        d.atx = Math.floor(fx0 / TILE); d.aty = Math.floor(py / TILE);
        placed = true;
        break;
      }
    }
  }
  if (!placed) return null;
  return fx.addDecal(d, cap);
}

// ───────────────────────── 미리 굽기 ─────────────────────────
const WARM_COLORS = ['#ffffff', '#ff7a2a', '#9fe8ff', '#fff2a0', '#b060ff', '#bfe0ff'];   // 흰색 + 속성 색 (impact ELEMENT_COLORS)
/** enemy.js 판정 문구 색 — prewarm 이 같은 (문구, 색, 크기) 키로 미리 굽도록 한곳에 둔다 */
export const REACT_CALLOUT = { guard: '#ffffff', stagger: '#ffb050', otg: '#ffd0a0', bounce: '#ffe070' };
/** 실제로 쓰는 판정 문구 [문구, 색, 크기] (impact.callout: COUNTER·BACK ATTACK, enemy.js: 가드·비틀·다운 추가타·바운드) */
function warmCallouts() {
  const CO = FH.CALLOUT ?? {}, big = CO.size ?? 15, small = CO.small ?? 12, R = REACT_CALLOUT;
  return [
    [FH.COUNTER?.callout ?? 'COUNTER', FH.COUNTER?.color ?? '#aef0ff', big],
    [FH.BACK?.callout ?? 'BACK ATTACK', FH.BACK?.color ?? '#ffc890', small],
    [FH.JUGGLE?.guardCallout ?? '가드!', R.guard, big],
    [FH.WEIGHT?.stagger?.callout ?? '비틀!', R.stagger, big],
    [FH.DOWN?.callout ?? '다운 추가타', R.otg, big],
    [FH.BOUNCE?.wall?.callout ?? '벽 바운드!', R.bounce, big],
    [FH.BOUNCE?.ground?.callout ?? '바닥 바운드!', R.bounce, big],
  ];
}
/**
 * 흔히 쓰는 스프라이트·아틀라스·문구를 한가할 때 굽는다 (스테이지 도중 캔버스 생성·첫 타격 끊김 방지, feel §8).
 * 한가한 틈마다 남은 시간만큼(시간 초과로 불리면 4ms 까지) 여러 작업을 몰아서 → 바쁜 화면에서도 1~2초 안에 끝난다.
 */
export function prewarm() {
  if (HITFX_STATS.prewarmed || typeof document === 'undefined') return;
  HITFX_STATS.prewarmed = true;
  const jobs = [];
  for (const c of WARM_COLORS) jobs.push(() => { C_CUT.get(c, true); C_GLOW.get(c, true); }, () => { C_STAR.get(c, true); C_STREAK.get(c, true); C_RING.get(c, true); });
  jobs.push(() => { for (const c of ['#aef0ff', '#ffe080', '#fff0b0']) C_STAR.get(c, true); for (const c of ['#ff9a30', '#ffb050']) C_GLOW.get(c, true); C_SOFT.get('rgba(255,40,70,0.35)', true); });
  for (const s of ['normal', 'crit', 'weak', 'resist', 'counter', 'ult', 'total', 'hurt', 'heal']) jobs.push(() => digitAtlas(s));
  // 연기·섬광 파티클 색 (particles 프리셋 + 속성 색 섬광)
  jobs.push(() => { for (const c of ['#8a8074', '#3a3440', '#ff7a1a', '#ffd070', '#5a1a7a', '#5a0610', '#bff4ff', '#fff', '#ffffff', '#ff2040']) C_SOFT.get(c, true); });
  jobs.push(() => { for (const c of WARM_COLORS) C_SOFT.get(c, true); });
  jobs.push(() => { for (const k of Object.keys(DECAL_KIND)) for (let i = 0; i < DECAL_KIND[k].n; i++) decalSprite(k, i); });
  jobs.push(() => { for (const [t, color, size] of warmCallouts()) textSprite(t, { size, color }); });
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 400 }) : (f) => setTimeout(f, 16);
  const step = (dl) => {
    const t0 = now();
    do {
      const j = jobs.shift();
      if (!j) break;
      NO_SPARE = true;
      try { j(); } catch (e) { console.warn('[hitfx] prewarm', e); } finally { NO_SPARE = false; }
    } while (jobs.length && (dl && !dl.didTimeout && typeof dl.timeRemaining === 'function' ? dl.timeRemaining() > 2 : now() - t0 < 4));
    if (jobs.length) idle(step);
    else while (WARM_SPARE.length) SPARE.push(WARM_SPARE.pop());   // 남은 0×0 은 싸움용 예비로
  };
  idle(step);
}
// 부팅 뒤(글꼴 도착 후) 조금 있다가 미리 굽는다. 모듈 최상단에서는 가져온 값을 건드리지 않는다 (순환 import 규칙)
if (typeof window !== 'undefined' && typeof setTimeout === 'function') {
  // 스테이지·방에 들어설 때(로딩 중) 예비 캔버스를 다시 채우고, 부팅 뒤 미리 굽기가 아직이면 바로 시작한다
  // (보스 방으로 곧장 들어가도 첫 타격에 캔버스를 만들지 않게 — #216)
  setTimeout(() => {
    try {
      const onEnter = () => { fillSpares(); if (!HITFX_STATS.prewarmed) prewarm(); };
      bus.on('stageEntered', onEnter); bus.on('roomEntered', () => fillSpares());
      // 지연 장면 교체(R1-REQ-229 두 단계 부팅)로 stageEntered 가 이 구독보다 먼저 지나갔으면 지금 (요청 #478 의 hitfx 몫):
      // world.prewarmHitFx 가 예비를 다 쓴 채로 남아 스테이지 첫 1초의 미리 굽기(각성 감독·필살기)가 새 캔버스를 만들었다
      if (game?.world?.player) onEnter();
    } catch (e) { console.warn('[hitfx] bus', e); }
  }, 0);
  setTimeout(() => {
    const go = () => setTimeout(prewarm, 300);
    try { const p = UI.loadFace?.('BN Dmg'); if (p?.then) p.then(go, go); else go(); } catch { go(); }
  }, 900);
}

/** 테스트·도구용 */
export const HITFX_DEBUG = { ATLAS, TXT, DECALS, caches: { C_GLOW, C_STAR, C_CUT, C_STREAK, C_RING, C_SOFT }, qualityKey, clamp };
