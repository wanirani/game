// 인게임 메뉴 공용 UI 키트
//  - 고딕 패널/장식선/선택 막대/커서 괄호/키캡/문양(탭 아이콘)
//  - 발광 스프라이트 캐시(glow), 줄바꿈 캐시(wrapC/para), 레이어 캐시(Layer)
//  - 입력: Nav(방향키 반복), Gesture(탭·드래그 구분, 마우스 호버), Scroller(드래그·휠·관성 스크롤)
//  - 모달: Popup(행동 선택), Confirm(예/아니오)
//  - 가상 패드 숨김(hidePad, 참조 카운트)
import { input } from '../../core/input.js';
import { text, font, wrap, FONT } from '../../core/ui.js';
import { TAU, clamp, lerp, rgba, ease } from '../../core/math.js';
import { audio } from '../../core/audio.js';

export const PAL = {
  ink: '#07040a', night: '#0e0818', indigo: '#1a1030',
  crimson: '#9a1028', crimsonHi: '#e0304a', blood: '#4a0612',
  gold: '#e8c872', goldHi: '#fff0c4', goldMid: '#c8a050', goldDim: '#7a5a2c',
  bone: '#efe4cf', text: '#e8dcc8', dim: '#9d8f80', faint: '#5e5048',
  good: '#7ee07e', bad: '#ff6464', warn: '#ffb050', mp: '#5aa8ff', hp: '#e8283c',
  rim: '#9ab4ff',
};
export const RARITY_COL = ['#d8d0c0', '#6fe07a', '#5aa8ff', '#c07cff', '#ffa640', '#ff4a5a'];
export const EL = {
  holy: { name: '신성', color: '#fff2b0' }, fire: { name: '화염', color: '#ff7a2a' }, ice: { name: '냉기', color: '#9fe8ff' },
  dark: { name: '암흑', color: '#b060ff' }, thunder: { name: '번개', color: '#bfe0ff' },
  phys: { name: '물리', color: '#d8d0c0' },
};
export const EL_ORDER = ['holy', 'fire', 'ice', 'dark', 'thunder'];

// ───────────────────────── 발광 스프라이트 ─────────────────────────
const GLOW = new Map();
function glowSprite(color) {
  let c = GLOW.get(color);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, rgba(color, 1)); r.addColorStop(0.3, rgba(color, 0.5)); r.addColorStop(0.65, rgba(color, 0.14)); r.addColorStop(1, rgba(color, 0));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    GLOW.set(color, c);
  }
  return c;
}
/** 가산 합성 발광 (색은 #hex) */
export function glow(ctx, x, y, r, color, a = 1) {
  if (a <= 0 || r <= 0) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
/** 가로로 긴 타원형 발광 */
export function glowOval(ctx, x, y, rx, ry, color, a = 1) {
  if (a <= 0) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.drawImage(glowSprite(color), x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}

// ───────────────────────── 기본 도형 ─────────────────────────
export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
export function diamond(ctx, x, y, r, color, stroke = null) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
  if (color) { ctx.fillStyle = color; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
export function inRect(px, py, r) { return !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }

/** 장식 구분선 (양끝이 사라지는 금선 + 가운데 마름모) */
export function divider(ctx, x, y, w, { color = PAL.goldMid, center = true, a = 0.85 } = {}) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.5, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.fillRect(x, Math.round(y), w, 1);
  if (center) { diamond(ctx, x + w / 2, Math.round(y) + 0.5, 3.5, color); diamond(ctx, x + w / 2 - 9, Math.round(y) + 0.5, 1.6, color); diamond(ctx, x + w / 2 + 9, Math.round(y) + 0.5, 1.6, color); }
}
/** 왼쪽 정렬 소제목 + 아래 장식선 */
export function heading(ctx, str, x, y, w, { color = PAL.gold, size = 16, sub = null, subColor = PAL.dim } = {}) {
  diamond(ctx, x + 4, y - size * 0.34, 3.2, PAL.crimsonHi);
  text(ctx, str, x + 13, y, { size, weight: 800, family: FONT.title, color, ow: 3 });
  if (sub) { ctx.font = font(size, 800, FONT.title); const tw = ctx.measureText(str).width; text(ctx, sub, x + 22 + tw, y, { size: 12, color: subColor, weight: 600, ow: 2 }); }
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, rgba(PAL.goldMid, 0.8)); g.addColorStop(0.7, rgba(PAL.goldMid, 0.25)); g.addColorStop(1, rgba(PAL.goldMid, 0));
  ctx.fillStyle = g; ctx.fillRect(x, y + 7, w, 1);
}

/** 고딕 패널: 그라디언트 몸체 + 따뜻한 키라이트 + 이중 테두리 + 모서리 장식 */
export function frame(ctx, x, y, w, h, { top = 'rgba(26,14,34,0.94)', bot = 'rgba(8,4,12,0.96)', edge = PAL.goldDim, corners = true, glowC = null, alpha = 1, key = true } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  if (key) {
    // 위쪽 따뜻한 키라이트 + 아래쪽 차가운 반사
    const kg = ctx.createLinearGradient(0, y, 0, y + Math.min(60, h * 0.4));
    kg.addColorStop(0, 'rgba(255,200,140,0.07)'); kg.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = kg; ctx.fillRect(x, y, w, Math.min(60, h * 0.4));
    ctx.fillStyle = 'rgba(140,170,255,0.035)'; ctx.fillRect(x, y + h - 3, w, 3);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  if (glowC) { ctx.shadowColor = glowC; ctx.shadowBlur = 12; }
  ctx.strokeStyle = edge; ctx.lineWidth = 1.25; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(232,200,114,0.09)'; ctx.lineWidth = 1; ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
  if (corners) cornerOrn(ctx, x, y, w, h, PAL.goldMid);
  ctx.restore();
}
function corner1(ctx, cx, cy, sx, sy, L) {
  ctx.beginPath(); ctx.moveTo(cx + sx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * L); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + sx * 5, cy + sy * (L * 0.55)); ctx.quadraticCurveTo(cx + sx * 5, cy + sy * 5, cx + sx * (L * 0.55), cy + sy * 5); ctx.stroke();
  diamond(ctx, cx, cy, 3, ctx.strokeStyle);
}
export function cornerOrn(ctx, x, y, w, h, c = PAL.goldMid, L = 15) {
  ctx.strokeStyle = c; ctx.lineWidth = 1.5;
  corner1(ctx, x + 1, y + 1, 1, 1, L); corner1(ctx, x + w - 1, y + 1, -1, 1, L);
  corner1(ctx, x + 1, y + h - 1, 1, -1, L); corner1(ctx, x + w - 1, y + h - 1, -1, -1, L);
}

/** 목록 선택 막대 (진홍 그라디언트 + 금선 + 발광) */
export function selBar(ctx, x, y, w, h, t, { dim = false } = {}) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  const a = dim ? 0.45 : 1;
  g.addColorStop(0, `rgba(176,26,52,${0.78 * a})`); g.addColorStop(0.55, `rgba(110,14,36,${0.42 * a})`); g.addColorStop(1, 'rgba(60,6,20,0.04)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  const lg = ctx.createLinearGradient(x, 0, x + w, 0);
  lg.addColorStop(0, `rgba(255,220,140,${0.9 * a})`); lg.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = lg; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  if (!dim) {
    glowOval(ctx, x + 18, y + h / 2, 60, h * 0.9, '#ff3050', 0.22 + 0.12 * pulse);
    diamond(ctx, x + 1, y + h / 2, 4.5 + pulse * 1.2, PAL.goldHi);
  }
}
/** 커서 괄호 (격자 칸 선택) */
export function brackets(ctx, x, y, w, h, t, color = PAL.goldHi) {
  const o = 2.5 + Math.sin(t * 6) * 1.5, L = Math.max(6, Math.min(12, w * 0.28));
  const X0 = x - o, Y0 = y - o, X1 = x + w + o, Y1 = y + h + o;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(X0, Y0 + L); ctx.lineTo(X0, Y0); ctx.lineTo(X0 + L, Y0);
    ctx.moveTo(X1 - L, Y0); ctx.lineTo(X1, Y0); ctx.lineTo(X1, Y0 + L);
    ctx.moveTo(X1, Y1 - L); ctx.lineTo(X1, Y1); ctx.lineTo(X1 - L, Y1);
    ctx.moveTo(X0 + L, Y1); ctx.lineTo(X0, Y1); ctx.lineTo(X0, Y1 - L);
  };
  ctx.lineCap = 'square';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 4.5; path(); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 2; path(); ctx.stroke();
  ctx.lineCap = 'butt';
}
/** 작은 키캡. 반환: 너비 */
export function keycap(ctx, label, x, y, { h = 18, color = PAL.bone } = {}) {
  ctx.font = font(11, 800, FONT.body);
  const w = Math.max(h, ctx.measureText(label).width + 10);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#2e2230'); g.addColorStop(1, '#140c16');
  rr(ctx, x, y, w, h, 4); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,200,0.12)'; ctx.fillRect(x + 3, y + 2, w - 6, 1);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
  return w;
}
/** 키 안내 줄: items = [[키, 설명], ...] (키가 배열이면 여러 캡). 반환: 끝 x */
export function hintRow(ctx, items, x, y, { align = 'left', size = 12 } = {}) {
  // 너비 측정 후 정렬
  let total = 0;
  const ws = [];
  for (const [k, d] of items) {
    ctx.font = font(11, 800, FONT.body);
    let kw = 0;
    for (const kk of Array.isArray(k) ? k : [k]) kw += Math.max(18, ctx.measureText(kk).width + 10) + 3;
    ctx.font = font(size, 600, FONT.body);
    const dw = ctx.measureText(d).width;
    ws.push(kw); total += kw + dw + 16;
  }
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  items.forEach(([k, d], i) => {
    for (const kk of Array.isArray(k) ? k : [k]) cx += keycap(ctx, kk, cx, y - 13) + 3;
    ctx.font = font(size, 600, FONT.body);
    text(ctx, d, cx + 2, y, { size, weight: 600, color: PAL.dim, ow: 2 });
    cx += ctx.measureText(d).width + 16;
  });
  return cx;
}
/** 둥근 알약형 배지 */
export function pill(ctx, str, x, y, { color = PAL.gold, bg = 'rgba(40,20,30,0.9)', size = 11, h = 18, align = 'left' } = {}) {
  ctx.font = font(size, 800, FONT.body);
  const w = ctx.measureText(str).width + 14;
  const X = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  rr(ctx, X, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  ctx.strokeStyle = rgba(color.startsWith('#') ? color : '#e8c872', 0.7); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(str, X + w / 2, y + h / 2 + 0.5); ctx.textBaseline = 'alphabetic';
  return w;
}
/** 게이지 (둥근 끝, 광택, 끝 발광) */
export function gauge(ctx, x, y, w, h, ratio, color, { back = 'rgba(0,0,0,0.55)', ghost = null, glowEnd = true } = {}) {
  ratio = clamp(ratio || 0, 0, 1);
  rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = back; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 1; ctx.stroke();
  if (ghost !== null && ghost > ratio) { rr(ctx, x, y, w * clamp(ghost, 0, 1), h, h / 2); ctx.fillStyle = 'rgba(126,224,126,0.45)'; ctx.fill(); }
  if (ratio > 0) {
    const fw = Math.max(h, w * ratio);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, color); g.addColorStop(1, rgba(color, 0.55));
    rr(ctx, x, y, fw, h, h / 2); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + h / 2, y + 1, Math.max(0, fw - h), Math.max(1, h * 0.3));
    if (glowEnd) glow(ctx, x + fw - 1, y + h / 2, h * 2.2, color, 0.5);
  }
  ctx.strokeStyle = 'rgba(200,160,90,0.35)'; ctx.lineWidth = 1; rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, h / 2 + 1.5); ctx.stroke();
}

// ───────────────────────── 문양 (탭·기능 아이콘, 선화) ─────────────────────────
export function glyph(ctx, kind, x, y, s, color = PAL.gold, lw = 1.6) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s / 20, s / 20);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  switch (kind) {
    case 'crest': // 방패 + 십자
      ctx.moveTo(-8, -9); ctx.lineTo(8, -9); ctx.lineTo(8, 0); ctx.quadraticCurveTo(8, 7, 0, 10); ctx.quadraticCurveTo(-8, 7, -8, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.moveTo(-4.5, -2); ctx.lineTo(4.5, -2); ctx.stroke(); break;
    case 'sword':
      ctx.moveTo(-8, 8); ctx.lineTo(6, -6); ctx.lineTo(8, -8); ctx.lineTo(7, -5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-2, 8); ctx.moveTo(-9.5, 9.5); ctx.lineTo(-7, 7); ctx.stroke(); break;
    case 'bag':
      ctx.moveTo(-4, -8); ctx.lineTo(4, -8); ctx.lineTo(2, -5); ctx.quadraticCurveTo(9, -2, 8, 5); ctx.quadraticCurveTo(7, 9, 0, 9); ctx.quadraticCurveTo(-7, 9, -8, 5); ctx.quadraticCurveTo(-9, -2, -2, -5); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(3, -5); ctx.stroke(); break;
    case 'rune':
      ctx.arc(0, 0, 8.5, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(1.6, -1.6); ctx.lineTo(6, 0); ctx.lineTo(1.6, 1.6); ctx.lineTo(0, 6); ctx.lineTo(-1.6, 1.6); ctx.lineTo(-6, 0); ctx.lineTo(-1.6, -1.6); ctx.closePath(); ctx.fill(); break;
    case 'crown':
      ctx.moveTo(-9, 6); ctx.lineTo(-9, -5); ctx.lineTo(-4.5, 0); ctx.lineTo(0, -8); ctx.lineTo(4.5, 0); ctx.lineTo(9, -5); ctx.lineTo(9, 6); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9, 9); ctx.lineTo(9, 9); ctx.stroke(); break;
    case 'scroll':
      ctx.moveTo(-6, -8); ctx.lineTo(8, -8); ctx.quadraticCurveTo(10, -8, 10, -6); ctx.quadraticCurveTo(10, -4, 8, -4); ctx.lineTo(8, 6); ctx.quadraticCurveTo(8, 9, 5, 9); ctx.lineTo(-8, 9);
      ctx.quadraticCurveTo(-10, 9, -10, 7); ctx.quadraticCurveTo(-10, 5, -8, 5); ctx.lineTo(-6, 5); ctx.lineTo(-6, -8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(5, -3); ctx.moveTo(-3, 1); ctx.lineTo(5, 1); ctx.stroke(); break;
    case 'book':
      ctx.moveTo(0, -5); ctx.quadraticCurveTo(-5, -8, -10, -7); ctx.lineTo(-10, 7); ctx.quadraticCurveTo(-5, 6, 0, 9); ctx.quadraticCurveTo(5, 6, 10, 7); ctx.lineTo(10, -7); ctx.quadraticCurveTo(5, -8, 0, -5); ctx.lineTo(0, 9); ctx.stroke(); break;
    case 'bat':
      ctx.moveTo(0, -3); ctx.lineTo(-2, -6); ctx.lineTo(-2.5, -2); ctx.quadraticCurveTo(-6, -7, -11, -4); ctx.quadraticCurveTo(-8, -1, -8, 3); ctx.quadraticCurveTo(-5, 0, -3, 3); ctx.quadraticCurveTo(-1, 2, 0, 6);
      ctx.quadraticCurveTo(1, 2, 3, 3); ctx.quadraticCurveTo(5, 0, 8, 3); ctx.quadraticCurveTo(8, -1, 11, -4); ctx.quadraticCurveTo(6, -7, 2.5, -2); ctx.lineTo(2, -6); ctx.closePath(); ctx.fill(); break;
    case 'hourglass':
      ctx.moveTo(-7, -9); ctx.lineTo(7, -9); ctx.moveTo(-7, 9); ctx.lineTo(7, 9); ctx.moveTo(-5.5, -9); ctx.quadraticCurveTo(-5, -2, 0, 0); ctx.quadraticCurveTo(-5, 2, -5.5, 9);
      ctx.moveTo(5.5, -9); ctx.quadraticCurveTo(5, -2, 0, 0); ctx.quadraticCurveTo(5, 2, 5.5, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-3, 7.5); ctx.lineTo(3, 7.5); ctx.lineTo(0, 4); ctx.closePath(); ctx.fill(); break;
    case 'lock':
      ctx.moveTo(-5, -1); ctx.lineTo(-5, -4); ctx.arc(0, -4, 5, Math.PI, 0); ctx.lineTo(5, -1); ctx.stroke();
      ctx.beginPath(); rr(ctx, -7.5, -1, 15, 11, 2); ctx.fill(); break;
    case 'check':
      ctx.moveTo(-7, 0); ctx.lineTo(-2, 6); ctx.lineTo(8, -6); ctx.stroke(); break;
    case 'cross':
      ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke(); break;
    case 'save':
      ctx.moveTo(0, -9); ctx.lineTo(0, 4); ctx.moveTo(-5, -1); ctx.lineTo(0, 4); ctx.lineTo(5, -1); ctx.moveTo(-9, 4); ctx.lineTo(-9, 9); ctx.lineTo(9, 9); ctx.lineTo(9, 4); ctx.stroke(); break;
    case 'gear':
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); ctx.lineTo(Math.cos(a) * 9.5, Math.sin(a) * 9.5); }
      ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill(); break;
    case 'door':
      ctx.moveTo(-7, 9); ctx.lineTo(-7, -3); ctx.quadraticCurveTo(-7, -9, 0, -9); ctx.quadraticCurveTo(7, -9, 7, -3); ctx.lineTo(7, 9); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(3.5, 2, 1.3, 0, TAU); ctx.fill(); break;
    case 'play':
      ctx.moveTo(-5, -8); ctx.lineTo(8, 0); ctx.lineTo(-5, 8); ctx.closePath(); ctx.fill(); break;
    case 'home':
      ctx.moveTo(-9, 0); ctx.lineTo(0, -8); ctx.lineTo(9, 0); ctx.moveTo(-6, -2); ctx.lineTo(-6, 9); ctx.lineTo(6, 9); ctx.lineTo(6, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, 9); ctx.lineTo(-2, 3); ctx.lineTo(2, 3); ctx.lineTo(2, 9); ctx.stroke(); break;
    case 'skull':
      ctx.arc(0, -2, 8, Math.PI * 0.85, Math.PI * 0.15); ctx.lineTo(4, 9); ctx.lineTo(-4, 9); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-3, -1.5, 2, 0, TAU); ctx.arc(3, -1.5, 2, 0, TAU); ctx.fill(); break;
    case 'star':
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * TAU, r = i % 2 ? 4 : 9; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); break;
    case 'sort':
      ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.moveTo(-8, 0); ctx.lineTo(4, 0); ctx.moveTo(-8, 6); ctx.lineTo(0, 6); ctx.stroke(); break;
    case 'eye':
      ctx.moveTo(-10, 0); ctx.quadraticCurveTo(0, -9, 10, 0); ctx.quadraticCurveTo(0, 9, -10, 0); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill(); break;
    default:
      ctx.arc(0, 0, 6, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────── 글자 배치 ─────────────────────────
const WRAP = new Map();
/** 줄바꿈 결과 캐시 (매 프레임 measureText 반복 방지) */
export function wrapC(ctx, str, w, size, weight = 500, family = FONT.body) {
  str = String(str ?? '');
  const k = size + '|' + weight + '|' + Math.round(w) + '|' + family.length + '|' + str;
  let v = WRAP.get(k);
  if (!v) {
    if (WRAP.size > 600) WRAP.clear();
    v = wrap(ctx, str, w, size, weight, family);
    WRAP.set(k, v);
  }
  return v;
}
/** 문단 출력. 반환: 사용한 높이 */
export function para(ctx, str, x, y, w, { size = 14, lh = 1.5, color = PAL.text, weight = 500, family = FONT.body, max = 99, ow = 2, align = 'left' } = {}) {
  const lines = wrapC(ctx, str, w, size, weight, family);
  const n = Math.min(lines.length, max);
  for (let i = 0; i < n; i++) {
    let s = lines[i];
    if (i === n - 1 && lines.length > n) s = s.replace(/.{0,1}$/, '…');
    text(ctx, s, x, y + i * size * lh, { size, color, weight, family, ow, align });
  }
  return n * size * lh;
}
export function measure(ctx, str, size, weight = 500, family = FONT.body) {
  ctx.font = font(size, weight, family);
  return ctx.measureText(String(str)).width;
}
/** 너비를 넘으면 말줄임 */
export function ellipsize(ctx, str, w, size, weight = 500, family = FONT.body) {
  str = String(str ?? '');
  ctx.font = font(size, weight, family);
  if (ctx.measureText(str).width <= w) return str;
  let k = str.length;
  while (k > 1 && ctx.measureText(str.slice(0, k) + '…').width > w) k--;
  return str.slice(0, k) + '…';
}

// ───────────────────────── 레이어 캐시 ─────────────────────────
/** 정적인 그림을 픽셀 배율에 맞춘 캔버스에 한 번 그려 두고 재사용 */
export class Layer {
  constructor() { this.cv = null; this.key = null; }
  draw(ctx, key, x, y, w, h, scale, fn) {
    const k = key + '|' + w + '|' + h + '|' + scale;
    if (this.key !== k || !this.cv) {
      const pw = Math.max(1, Math.ceil(w * scale)), ph = Math.max(1, Math.ceil(h * scale));
      if (!this.cv) this.cv = document.createElement('canvas');
      if (this.cv.width !== pw || this.cv.height !== ph) { this.cv.width = pw; this.cv.height = ph; }
      const c = this.cv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, pw, ph);
      c.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      try { fn(c); } catch (e) { console.error(e); }
      this.key = k;
    }
    ctx.drawImage(this.cv, 0, 0, this.cv.width, this.cv.height, x, y, this.cv.width / scale, this.cv.height / scale);
  }
  invalidate() { this.key = null; }
  free() { if (this.cv) { this.cv.width = this.cv.height = 1; } this.cv = null; this.key = null; }
}

// ───────────────────────── 입력 ─────────────────────────
const DIRS = ['up', 'down', 'left', 'right'];
/** 방향키 반복 + 메뉴 조작 입력 모음 (매 틱 poll) */
export class Nav {
  constructor() { this.rep = { up: 0, down: 0, left: 0, right: 0 }; this.o = {}; }
  poll(dt) {
    const o = this.o;
    for (const a of DIRS) {
      let hit = false;
      if (input.pressed(a)) { hit = true; this.rep[a] = 0.3; }
      else if (input.down(a)) { this.rep[a] -= dt; if (this.rep[a] <= 0) { hit = true; this.rep[a] = 0.075; } }
      o[a] = hit;
    }
    o.confirm = input.pressed('confirm');
    o.cancel = input.pressed('cancel');
    o.menu = input.pressed('menu') && !o.confirm && !o.cancel; // 패드 START
    o.alt = input.pressed('sub');       // A / 패드 Y : 보조 기능 (정렬·해제 등)
    o.alt2 = input.pressed('dash');     // C / 패드 LT
    o.prevTab = input.pressed('skill1'); // S / LB
    o.nextTab = input.pressed('skill2'); // D / RB
    o.swap = input.pressed('swap');     // Q / E
    return o;
  }
  clear() { for (const k in this.o) this.o[k] = false; }
}

/** 포인터 제스처: 탭 vs 드래그 구분, 마우스 호버 이동 감지 */
export class Gesture {
  constructor() { this.g = null; this.tapOK = false; this.hover = false; this.lx = -1; this.ly = -1; this.wheel = 0; this._wheel = 0; }
  update() {
    const p = input.pointer;
    if (p.justDown) this.g = { x: p.x, y: p.y, moved: false };
    if (this.g && p.down && !this.g.moved && Math.hypot(p.x - this.g.x, p.y - this.g.y) > 10) this.g.moved = true;
    this.tapOK = p.tapped && !(this.g && this.g.moved);
    this.hover = !input.touchMode && !p.down && p.active && (p.x !== this.lx || p.y !== this.ly);
    this.lx = p.x; this.ly = p.y;
    this.wheel = this._wheel; this._wheel = 0;
  }
  get moved() { return !!this.g?.moved; }
  tap(r) { const p = input.pointer; return this.tapOK && inRect(p.x, p.y, r); }
  hoverIn(r) { const p = input.pointer; return this.hover && inRect(p.x, p.y, r); }
  over(r) { const p = input.pointer; return p.active && !input.touchMode && inRect(p.x, p.y, r); }
  downIn(r) { const p = input.pointer; return p.down && inRect(p.x, p.y, r); }
  addWheel(dy) { this._wheel += dy; }
}

/** 세로 스크롤: 드래그(관성·고무줄) + 마우스 휠 + 선택 항목 따라가기 */
export class Scroller {
  constructor() { this.y = 0; this.target = 0; this.max = 0; this.vel = 0; this.drag = null; }
  setMax(m) { this.max = Math.max(0, m); if (!this.drag) { this.target = clamp(this.target, 0, this.max); } }
  reset() { this.y = this.target = 0; this.vel = 0; this.drag = null; }
  update(dt, rect, ges) {
    const p = input.pointer;
    if (p.justDown && inRect(p.x, p.y, rect)) { this.drag = { y0: p.y, s0: this.y, last: p.y, v: 0 }; this.vel = 0; }
    if (this.drag) {
      if (p.down) {
        if (ges.moved) {
          let ny = this.drag.s0 - (p.y - this.drag.y0);
          if (ny < 0) ny *= 0.4; else if (ny > this.max) ny = this.max + (ny - this.max) * 0.4;
          this.drag.v = lerp(this.drag.v, (this.drag.last - p.y) / Math.max(dt, 1 / 120), 0.5);
          this.drag.last = p.y;
          this.y = this.target = ny;
        }
      } else {
        if (ges.moved) this.vel = clamp(this.drag.v, -2600, 2600);
        this.drag = null;
      }
      return;
    }
    if (ges.wheel && inRect(p.x, p.y, rect)) { this.target = clamp(this.target + ges.wheel, 0, this.max); this.vel = 0; }
    if (Math.abs(this.vel) > 8) { this.target += this.vel * dt; this.vel *= Math.pow(0.03, dt); if (this.target < 0 || this.target > this.max) this.vel *= 0.5; }
    else this.vel = 0;
    this.target = clamp(this.target, 0, this.max);
    this.y = lerp(this.y, this.target, 1 - Math.pow(0.0004, dt));
    if (Math.abs(this.y - this.target) < 0.3) this.y = this.target;
  }
  /** [top,bottom] 구간이 보이도록 목표 조정 */
  ensure(top, bottom, viewH, pad = 6) {
    if (top - pad < this.target) this.target = top - pad;
    else if (bottom + pad > this.target + viewH) this.target = bottom + pad - viewH;
    this.target = clamp(this.target, 0, this.max);
  }
  get dragging() { return !!this.drag; }
}
/** 스크롤 막대 */
export function scrollbar(ctx, x, y, h, sc, viewH) {
  if (sc.max <= 0) return;
  const total = sc.max + viewH;
  const th = Math.max(24, h * viewH / total);
  const ty = y + (h - th) * clamp(sc.y / sc.max, 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, 4, h);
  const g = ctx.createLinearGradient(0, ty, 0, ty + th);
  g.addColorStop(0, PAL.goldMid); g.addColorStop(1, PAL.goldDim);
  ctx.fillStyle = g; ctx.fillRect(x, ty, 4, th);
}

/** 스크롤 영역 클립 + 위아래 페이드 */
export function clipBegin(ctx, r) { ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); }
export function clipEnd(ctx, r, sc, fadeC = 'rgba(8,4,12,0.95)') {
  ctx.restore();
  if (!sc) return;
  if (sc.y > 1) { const g = ctx.createLinearGradient(0, r.y, 0, r.y + 18); g.addColorStop(0, fadeC); g.addColorStop(1, 'rgba(8,4,12,0)'); ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, 18); }
  if (sc.y < sc.max - 1) { const g = ctx.createLinearGradient(0, r.y + r.h - 18, 0, r.y + r.h); g.addColorStop(0, 'rgba(8,4,12,0)'); g.addColorStop(1, fadeC); ctx.fillStyle = g; ctx.fillRect(r.x, r.y + r.h - 18, r.w, 18); }
}

// ───────────────────────── 버튼 ─────────────────────────
/** 고딕 버튼 (그리기만; 탭 판정은 호출측 ges.tap) */
export function gbutton(ctx, r, label, { hot = false, disabled = false, size = 15, icon = null, t = 0, color = null, sub = null, accent = PAL.crimson } = {}) {
  ctx.save();
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  if (disabled) { g.addColorStop(0, 'rgba(34,26,34,0.9)'); g.addColorStop(1, 'rgba(14,10,14,0.92)'); }
  else if (hot) { g.addColorStop(0, rgba(accent === PAL.crimson ? '#b0182e' : accent, 0.95)); g.addColorStop(1, 'rgba(50,4,14,0.95)'); }
  else { g.addColorStop(0, 'rgba(46,24,40,0.92)'); g.addColorStop(1, 'rgba(14,6,14,0.94)'); }
  rr(ctx, r.x, r.y, r.w, r.h, 4); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 3; ctx.stroke();
  rr(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 4);
  ctx.strokeStyle = disabled ? '#3e3238' : hot ? PAL.gold : PAL.goldDim; ctx.lineWidth = hot ? 1.6 : 1.2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,230,190,0.10)'; ctx.fillRect(r.x + 4, r.y + 2, r.w - 8, 1);
  if (hot && !disabled) glowOval(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.55, r.h * 0.9, '#ff4060', 0.18 + 0.08 * Math.sin(t * 5));
  const col = disabled ? '#6a5e60' : color || (hot ? PAL.goldHi : PAL.bone);
  let tx = r.x + r.w / 2;
  if (icon) {
    ctx.font = font(size, 800, FONT.body);
    const tw = ctx.measureText(label).width;
    const ix = tx - (tw + 22) / 2 + 8;
    glyph(ctx, icon, ix, r.y + r.h / 2 - (sub ? 6 : 0), size * 1.05, col, 1.6);
    tx = ix + 14 + tw / 2;
  }
  text(ctx, label, tx, r.y + r.h / 2 + size * 0.36 - (sub ? 6 : 0), { size, align: 'center', weight: 800, color: col, ow: 3 });
  if (sub) text(ctx, sub, r.x + r.w / 2, r.y + r.h / 2 + 13, { size: 11, align: 'center', color: disabled ? '#5a5050' : PAL.dim, weight: 600, ow: 2 });
  ctx.restore();
}

// ───────────────────────── 모달: 행동 선택 팝업 ─────────────────────────
/**
 * new Popup({ title, items:[{label, sub?, color?, disabled?, reason?, run()}], x, y, w, onClose })
 * update(dt, nav, ges) → 계속 열려 있으면 true
 */
export class Popup {
  constructor({ title = '', items = [], x = null, y = null, w = 240, onClose = null, anchor = 'left' } = {}) {
    this.title = title; this.items = items; this.x = x; this.y = y; this.w = w; this.onClose = onClose; this.anchor = anchor;
    this.i = Math.max(0, items.findIndex((it) => !it.disabled));
    this.t = 0; this.open = true; this.rects = []; this.box = null; this.closing = 0;
  }
  close(result) { if (!this.open) return; this.open = false; this.onClose?.(result); }
  update(dt, nav, ges) {
    this.t += dt;
    if (!this.open) return false;
    const n = this.items.length;
    if (nav.up) { this.i = (this.i - 1 + n) % n; audio.sfx('menu_move'); }
    if (nav.down) { this.i = (this.i + 1) % n; audio.sfx('menu_move'); }
    for (let k = 0; k < this.rects.length; k++) {
      if (ges.hoverIn(this.rects[k]) && this.i !== k) this.i = k;
      if (ges.tap(this.rects[k])) { this.i = k; this.run(k); return this.open; }
    }
    if (ges.tapOK && this.box && !inRect(input.pointer.x, input.pointer.y, this.box)) { audio.sfx('menu_cancel'); this.close(null); return false; }
    if (nav.confirm) { this.run(this.i); return this.open; }
    if (nav.cancel || nav.menu) { audio.sfx('menu_cancel'); this.close(null); return false; }
    return true;
  }
  run(k) {
    const it = this.items[k];
    if (!it) return;
    if (it.disabled) { audio.sfx('menu_cancel'); if (it.reason) this.flash = { k, t: 1.2, msg: it.reason }; return; }
    audio.sfx('menu_ok');
    this.close(it);
    it.run?.();
  }
  render(ctx, vw, vh) {
    const k = ease.outBack(clamp(this.t / 0.16, 0, 1));
    const rowH = input.touchMode ? 44 : 36;
    const head = this.title ? 34 : 8;
    const w = this.w, h = head + this.items.length * rowH + 10;
    let x = this.x ?? (vw - w) / 2, y = this.y ?? (vh - h) / 2;
    if (this.anchor === 'right') x -= w;
    x = clamp(x, 10, vw - w - 10); y = clamp(y, 70, vh - h - 34);
    this.box = { x, y, w, h };
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.4 * clamp(this.t / 0.12, 0, 1)})`; ctx.fillRect(0, 0, vw, vh);
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-(x + w / 2), -(y + h / 2));
    ctx.globalAlpha = clamp(this.t / 0.1, 0, 1);
    glowOval(ctx, x + w / 2, y + h / 2, w * 0.8, h * 0.8, '#6a0a20', 0.35);
    frame(ctx, x, y, w, h, { top: 'rgba(34,16,36,0.98)', bot: 'rgba(10,4,12,0.98)', edge: PAL.goldMid });
    if (this.title) {
      text(ctx, this.title, x + w / 2, y + 23, { size: 14, align: 'center', weight: 800, family: FONT.title, color: PAL.gold, maxWidth: w - 20 });
      divider(ctx, x + 14, y + 31, w - 28);
    }
    this.rects.length = 0;
    this.items.forEach((it, i) => {
      const r = { x: x + 8, y: y + head + i * rowH, w: w - 16, h: rowH - 4 };
      this.rects.push(r);
      if (i === this.i) selBar(ctx, r.x, r.y, r.w, r.h, this.t);
      const col = it.disabled ? '#6a5e60' : it.color || (i === this.i ? PAL.goldHi : PAL.bone);
      text(ctx, it.label, r.x + 16, r.y + r.h / 2 + 5, { size: 15, weight: 700, color: col, ow: 3 });
      if (it.sub) text(ctx, it.sub, r.x + r.w - 8, r.y + r.h / 2 + 4, { size: 11, align: 'right', color: it.disabled ? '#8a5050' : PAL.dim, weight: 600, ow: 2 });
    });
    if (this.flash && this.flash.t > 0) {
      this.flash.t -= 1 / 60;
      const r = this.rects[this.flash.k];
      if (r) text(ctx, this.flash.msg, x + w / 2, y + h + 18, { size: 13, align: 'center', color: PAL.bad, weight: 700 });
    }
    ctx.restore();
  }
}

/** 확인 창: new Confirm({ title, text, yes, no, onYes, onNo, danger }) */
export class Confirm {
  constructor({ title = '확인', text: msg = '', yes = '예', no = '아니오', onYes = null, onNo = null, danger = false, single = false } = {}) {
    this.title = title; this.msg = msg; this.yes = yes; this.no = no; this.onYes = onYes; this.onNo = onNo; this.danger = danger; this.single = single;
    this.i = danger || single ? (single ? 0 : 1) : 0; this.t = 0; this.open = true; this.rects = []; this.box = null;
  }
  close(ok) {
    if (!this.open) return;
    this.open = false;
    audio.sfx(ok ? 'menu_ok' : 'menu_cancel');
    if (ok) this.onYes?.(); else this.onNo?.();
  }
  update(dt, nav, ges) {
    this.t += dt;
    if (!this.open) return false;
    if (!this.single && (nav.left || nav.right || nav.up || nav.down)) { this.i = 1 - this.i; audio.sfx('menu_move'); }
    for (let k = 0; k < this.rects.length; k++) {
      if (ges.hoverIn(this.rects[k])) this.i = k;
      if (ges.tap(this.rects[k])) { this.close(this.single || k === 0); return false; }
    }
    if (nav.confirm) { this.close(this.single || this.i === 0); return false; }
    if (nav.cancel || nav.menu) { this.close(false); return false; }
    return true;
  }
  render(ctx, vw, vh) {
    const k = ease.outBack(clamp(this.t / 0.18, 0, 1));
    const w = Math.min(460, vw - 60);
    const lines = wrapC(ctx, this.msg, w - 60, 15, 500, FONT.body);
    const h = 110 + lines.length * 23 + 20;
    const x = (vw - w) / 2, y = (vh - h) / 2;
    this.box = { x, y, w, h };
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.55 * clamp(this.t / 0.12, 0, 1)})`; ctx.fillRect(0, 0, vw, vh);
    ctx.translate(vw / 2, vh / 2); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); ctx.translate(-vw / 2, -vh / 2);
    ctx.globalAlpha = clamp(this.t / 0.1, 0, 1);
    glowOval(ctx, vw / 2, vh / 2, w * 0.75, h * 0.8, this.danger ? '#8a0a1e' : '#4a2a10', 0.45);
    frame(ctx, x, y, w, h, { top: 'rgba(36,16,34,0.98)', bot: 'rgba(10,4,12,0.98)', edge: PAL.goldMid, glowC: this.danger ? '#a01020' : null });
    text(ctx, this.title, vw / 2, y + 34, { size: 19, align: 'center', weight: 800, family: FONT.title, color: this.danger ? '#ff8a8a' : PAL.gold });
    divider(ctx, x + 40, y + 46, w - 80);
    lines.forEach((l, i) => text(ctx, l, vw / 2, y + 74 + i * 23, { size: 15, align: 'center', color: PAL.text, weight: 500 }));
    const bw = this.single ? 150 : 130, bh = input.touchMode ? 44 : 38, by = y + h - bh - 16;
    this.rects.length = 0;
    const labels = this.single ? [this.yes] : [this.yes, this.no];
    labels.forEach((lb, i) => {
      const bx = this.single ? vw / 2 - bw / 2 : vw / 2 + (i === 0 ? -bw - 10 : 10);
      const r = { x: bx, y: by, w: bw, h: bh };
      this.rects.push(r);
      gbutton(ctx, r, lb, { hot: this.i === i, t: this.t, size: 15 });
    });
    ctx.restore();
  }
}

// ───────────────────────── 가상 패드 숨김 (참조 카운트) ─────────────────────────
let padHide = 0;
export function hidePad(on) {
  padHide = Math.max(0, padHide + (on ? 1 : -1));
  const el = typeof document !== 'undefined' ? document.getElementById('touch') : null;
  if (el) el.style.visibility = padHide > 0 ? 'hidden' : '';
}

// ───────────────────────── 떠다니는 불티 (배경 장식) ─────────────────────────
export class Embers {
  constructor(n = 26) {
    this.p = [];
    for (let i = 0; i < n; i++) this.p.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), v: 0.02 + Math.random() * 0.05, ph: Math.random() * TAU, c: i % 5 === 0 ? '#ffb060' : i % 3 ? '#ff3050' : '#e8c872' });
  }
  update(dt) {
    for (const e of this.p) {
      e.y -= e.v * dt; e.ph += dt;
      if (e.y < -0.05) { e.y = 1.05; e.x = Math.random(); }
    }
  }
  render(ctx, w, h, a = 1) {
    for (const e of this.p) {
      const x = (e.x + Math.sin(e.ph * 0.7) * 0.012) * w, y = e.y * h;
      const tw = 0.5 + 0.5 * Math.sin(e.ph * 3);
      glow(ctx, x, y, 6 + e.s * 5, e.c, (0.18 + 0.25 * tw) * a);
    }
  }
}

/** 수치 표기 (정수 또는 소수 한 자리) */
export function num(v) {
  if (v === undefined || v === null || Number.isNaN(v)) return '0';
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toLocaleString('ko-KR');
  if (a % 1 !== 0 && a < 20) return (Math.round(v * 10) / 10).toString();
  return Math.round(v).toString();
}
