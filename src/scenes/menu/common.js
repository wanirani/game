// 인게임 메뉴 공용 UI 키트 — owner: PLAT-MENU (platform §5.6, §6.2, §6.3, WP-4 · P-01/P-19/P-28)
//  - 고딕 패널/장식선/선택 막대/커서 괄호/키캡/문양(탭 아이콘, 'paw' = 동료 탭)
//  - 발광 스프라이트 캐시(glow), 줄바꿈 캐시(wrapC/para; 글자 크기 하한도 키에), 레이어 캐시(Layer: 글꼴 세대 키 + 픽셀 예산)
//  - 입력
//    · Nav: 방향 반복 + 메뉴 의미 액션 (confirm cancel prevTab nextTab alt alt2 map — input.bindings 기기별, MASTER_PLAN §1.4)
//      Q·E 는 게임에선 둘 다 swap 이지만 메뉴에선 prevTab(Q·S·LB) / nextTab(E·D·RB). o.swap 은 호환용으로만 남긴다.
//    · Gesture: 탭·드래그 구분, 마우스 호버, 길게 누르기(450 ms, 터치), 가로 밀기(swipe), claim()
//      탭 영역은 ui.taps 공용 등록부로: render 에서 ges.zone(r, kind) 로 등록 → update 에서 ges.tap(r)
//      (터치 모드에서는 등록부의 여유 영역(slop)으로 판정; 등록하지 않은 사각형은 예전처럼 안쪽만)
//    · Scroller: 드래그(관성·고무줄) + 휠 + 오른쪽 스틱 Y + 선택 따라가기 (follow/shouldFollow — P-01)
//  - 모달: Popup(행동 선택), Confirm(예/아니오) — 자기 탭 영역을 자기 이름(owner)으로 등록
//  - 가상 패드: 장면 플래그(scene.hidePad)만 쓴다. hidePad() 는 아무것도 하지 않는 옛 이름 (platform §5.1)
import { input } from '../../core/input.js';
import { text, font, wrap, FONT, taps, fontEpoch, textFloor } from '../../core/ui.js';
import { drawHints } from '../../core/prompts.js';
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

// ───────────────────────── 캔버스 풀 ─────────────────────────
// 레이어·스냅샷 캔버스는 풀에서 빌리고 돌려준다 (돌려줄 때 0×0 = 픽셀 메모리 0). 모듈을 불러올 때(부팅 — 장면 조각은
// 스테이지보다 먼저 온다) 미리 만들어 두어, 스테이지 도중 메뉴·마을 창을 처음 열어도 새 캔버스를 만들지 않는다
// (R1-REQ-339B, feel §8 '스테이지 시작 뒤 새 캔버스 0'). 풀이 비면 그때만 만든다.
const CV_POOL = [];
const POOL_WARM = 40, POOL_MAX = 64;
/** 풀에서 캔버스 한 장 (크기는 쓰는 쪽이 정한다) */
export function takeCanvas() { return CV_POOL.pop() || document.createElement('canvas'); }
/** 캔버스를 풀에 돌려준다: 0×0 으로 줄여 픽셀 메모리를 바로 돌려준다 */
export function giveCanvas(cv) {
  if (!cv || typeof cv.getContext !== 'function') return;
  try { cv.width = 0; cv.height = 0; } catch { /* 무시 */ }
  if (CV_POOL.length < POOL_MAX && !CV_POOL.includes(cv)) CV_POOL.push(cv);
}
/** QA: 풀 상태 */
export function canvasPoolStats() { return { free: CV_POOL.length, warm: POOL_WARM, max: POOL_MAX }; }
if (typeof document !== 'undefined') {
  try { for (let i = 0; i < POOL_WARM; i++) { const c = document.createElement('canvas'); c.width = 0; c.height = 0; CV_POOL.push(c); } } catch { /* 문서 없음 */ }
}

// ───────────────────────── 발광 스프라이트 (아틀라스 한 장) ─────────────────────────
/**
 * 색마다 64×64 방사 그라디언트 한 칸을 아틀라스 캔버스 한 장에 둔다 (R1-REQ-339B). 예전에는 색마다 캔버스를 새로 만들어
 * 스테이지·마을에서 처음 보는 색의 발광이 나오면 그 자리에서 캔버스가 생겼다. 아틀라스 캔버스는 모듈을 불러올 때(부팅) 0×0 으로
 * 만들어 두고, 처음 쓸 때 크기를 준다 (쓰기 전에는 메모리 0). 한 줄 4칸, 칸이 모자라면 줄을 두 배로 늘리고(최대 16줄 = 64색,
 * 256×1024 = 1 MB — 캔버스를 새로 만들지 않고 높이만 바꾼 뒤 있던 칸을 다시 칠한다), 그래도 넘치면 가장 오래 안 쓴 칸을 다시 쓴다.
 * 칸의 가장자리는 완전히 투명해서 확대(쌍선형)해도 옆 칸이 번지지 않는다. stops = [위치, 불투명도, …] (색은 칸마다)
 */
export class GlowAtlas {
  constructor(stops) {
    this.stops = stops; this.cols = 4; this.rowsMax = 16; this.rows = 0;
    this.map = new Map(); this.slot = []; this.use = 0; this.cv = null;
    if (typeof document !== 'undefined') {
      try { this.cv = document.createElement('canvas'); this.cv.width = 0; this.cv.height = 0; } catch { this.cv = null; }
    }
  }
  paint(i, color) {
    const g = this.cv.getContext('2d');
    const x = (i % this.cols) * 64, y = Math.floor(i / this.cols) * 64;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(x, y, 64, 64);
    const r = g.createRadialGradient(x + 32, y + 32, 0, x + 32, y + 32, 32);
    const s = this.stops;
    for (let k = 0; k < s.length; k += 2) r.addColorStop(s[k], rgba(color, s[k + 1]));
    g.fillStyle = r; g.fillRect(x, y, 64, 64);
  }
  /** 색의 칸 번호 (없으면 칠한다). 아틀라스가 없으면 -1 */
  index(color) {
    const e = this.map.get(color);
    if (e) { e.u = ++this.use; return e.i; }
    if (!this.cv) return -1;
    let i = this.slot.length;
    if (i >= this.cols * this.rows) {
      if (this.rows < this.rowsMax) {
        this.rows = this.rows ? Math.min(this.rowsMax, this.rows * 2) : 1;
        // 크기를 바꾸면 비워진다 → 있던 칸을 다시 칠한다
        this.cv.width = 64 * this.cols; this.cv.height = 64 * this.rows;
        for (let k = 0; k < this.slot.length; k++) this.paint(k, this.slot[k]);
      } else {
        let best = 0, bu = Infinity;
        for (let k = 0; k < this.slot.length; k++) { const u = this.map.get(this.slot[k])?.u ?? 0; if (u < bu) { bu = u; best = k; } }
        this.map.delete(this.slot[best]); i = best;
      }
    }
    this.slot[i] = color;
    this.map.set(color, { i, u: ++this.use });
    this.paint(i, color);
    return i;
  }
  /** 색 color 의 발광을 (dx, dy, dw, dh) 에 그린다 (합성·알파는 호출측) */
  draw(ctx, color, dx, dy, dw, dh) {
    const i = this.index(color);
    if (i < 0) return;
    ctx.drawImage(this.cv, (i % this.cols) * 64, Math.floor(i / this.cols) * 64, 64, 64, dx, dy, dw, dh);
  }
  stats() { return { colors: this.map.size, rows: this.rows, bytes: this.cv ? this.cv.width * this.cv.height * 4 : 0 }; }
}
const GLOWS = new GlowAtlas([0, 1, 0.3, 0.5, 0.65, 0.14, 1, 0]);
/** QA: 발광 아틀라스 상태 */
export function glowStats() { return GLOWS.stats(); }
/** 가산 합성 발광 (색은 #hex) */
export function glow(ctx, x, y, r, color, a = 1) {
  if (a <= 0 || r <= 0) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha, sq = ctx.imageSmoothingQuality;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.imageSmoothingQuality = 'low'; // 부드러운 방사 그라디언트 확대: 쌍선형이면 충분 ('high' 는 소프트웨어 래스터에서 10배 느리다 — P-11)
  GLOWS.draw(ctx, color, x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga; ctx.imageSmoothingQuality = sq;
}
/** 가로로 긴 타원형 발광 */
export function glowOval(ctx, x, y, rx, ry, color, a = 1) {
  if (a <= 0) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha, sq = ctx.imageSmoothingQuality;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.imageSmoothingQuality = 'low';
  GLOWS.draw(ctx, color, x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga; ctx.imageSmoothingQuality = sq;
}

// ───────────────────────── 그라디언트 캐시 (R1-REQ-341B, feel §8 그라디언트 예산) ─────────────────────────
// 메뉴·마을 창은 매 프레임 같은 패널·버튼·선택 막대를 그린다. 그라디언트를 원점 기준(0 → 길이)으로 한 번 만들어 두고
// ctx.translate 로 제자리에 옮겨 채운다 → 스크롤로 움직이는 줄도 새 그라디언트 없이 (예전: gbutton 하나가 프레임마다 1개).
const GRADS = new Map();
const GRADS_MAX = 400;
function keepGrad(key, g) {
  if (GRADS.size >= GRADS_MAX) GRADS.delete(GRADS.keys().next().value);
  GRADS.set(key, g);
  return g;
}
/** 세로 그라디언트 (0,0)→(0,h). stops = [위치, 색, 위치, 색, …] (키에 들어가므로 같은 배열·문자열을 쓰면 싸다) */
export function vGrad(ctx, h, stops) {
  const key = 'v' + h + '|' + stops.join(',');
  const g = GRADS.get(key);
  if (g) return g;
  const n = ctx.createLinearGradient(0, 0, 0, h);
  for (let i = 0; i < stops.length; i += 2) n.addColorStop(stops[i], stops[i + 1]);
  return keepGrad(key, n);
}
/** 가로 그라디언트 (0,0)→(w,0) */
export function hGrad(ctx, w, stops) {
  const key = 'h' + w + '|' + stops.join(',');
  const g = GRADS.get(key);
  if (g) return g;
  const n = ctx.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i < stops.length; i += 2) n.addColorStop(stops[i], stops[i + 1]);
  return keepGrad(key, n);
}
/** 원형 그라디언트: 중심 (0,0) 기준, 안쪽 원 (ox,oy,r0) → 바깥 원 (0,0,r1) */
export function rGrad(ctx, ox, oy, r0, r1, stops) {
  const key = 'r' + ox + ',' + oy + ',' + r0 + ',' + r1 + '|' + stops.join(',');
  const g = GRADS.get(key);
  if (g) return g;
  const n = ctx.createRadialGradient(ox, oy, r0, 0, 0, r1);
  for (let i = 0; i < stops.length; i += 2) n.addColorStop(stops[i], stops[i + 1]);
  return keepGrad(key, n);
}
/** 원점 기준 그라디언트 g 로 (x,y,w,h) 사각형을 채운다 */
export function fillGradRect(ctx, g, x, y, w, h) {
  ctx.translate(x, y); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.translate(-x, -y);
}
/**
 * 원점 기준 그라디언트 g 로 지금 경로를 채운다. 경로는 만들 때의 변환으로 이미 고정돼 있고, 그라디언트는 채우는 순간의
 * 변환으로 해석된다 → 채우는 동안만 (x,y) 로 옮기면 경로는 그대로, 칠만 제자리에 온다
 */
export function fillPathGrad(ctx, g, x, y) {
  ctx.fillStyle = g; ctx.translate(x, y); ctx.fill(); ctx.translate(-x, -y);
}
// 자주 쓰는 색 멈춤 (같은 배열 = 같은 캐시 키)
const FRAME_KEY = [0, 'rgba(255,200,140,0.07)', 1, 'rgba(255,200,140,0)'];
const SEL_ON = [[0, 'rgba(176,26,52,0.78)', 0.55, 'rgba(110,14,36,0.42)', 1, 'rgba(60,6,20,0.04)'], [0, 'rgba(255,220,140,0.9)', 1, 'rgba(255,220,140,0)']];
const SEL_DIM = [[0, `rgba(176,26,52,${0.78 * 0.45})`, 0.55, `rgba(110,14,36,${0.42 * 0.45})`, 1, 'rgba(60,6,20,0.04)'], [0, `rgba(255,220,140,${0.9 * 0.45})`, 1, 'rgba(255,220,140,0)']];
const KEYCAP = [0, '#2e2230', 1, '#140c16'];
const SCROLL_BAR = [0, PAL.goldMid, 1, PAL.goldDim];
const BTN_OFF = [0, 'rgba(34,26,34,0.9)', 1, 'rgba(14,10,14,0.92)'];
const BTN_HOT = [0, rgba('#b0182e', 0.95), 1, 'rgba(50,4,14,0.95)'];
const BTN_ON = [0, 'rgba(46,24,40,0.92)', 1, 'rgba(14,6,14,0.94)'];

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
  fillGradRect(ctx, hGrad(ctx, w, [0, rgba(color, 0), 0.5, rgba(color, a), 1, rgba(color, 0)]), x, Math.round(y), w, 1);
  if (center) { diamond(ctx, x + w / 2, Math.round(y) + 0.5, 3.5, color); diamond(ctx, x + w / 2 - 9, Math.round(y) + 0.5, 1.6, color); diamond(ctx, x + w / 2 + 9, Math.round(y) + 0.5, 1.6, color); }
}
/** 왼쪽 정렬 소제목 + 아래 장식선 */
export function heading(ctx, str, x, y, w, { color = PAL.gold, size = 16, sub = null, subColor = PAL.dim } = {}) {
  diamond(ctx, x + 4, y - size * 0.34, 3.2, PAL.crimsonHi);
  text(ctx, str, x + 13, y, { size, weight: 800, family: FONT.title, color, ow: 3 });
  if (sub) { ctx.font = font(size, 800, FONT.title); const tw = ctx.measureText(str).width; text(ctx, sub, x + 22 + tw, y, { size: 12, color: subColor, weight: 600, ow: 2 }); }
  fillGradRect(ctx, hGrad(ctx, w, HEAD_LINE), x, y + 7, w, 1);
}
const HEAD_LINE = [0, rgba(PAL.goldMid, 0.8), 0.7, rgba(PAL.goldMid, 0.25), 1, rgba(PAL.goldMid, 0)];

/** 고딕 패널: 그라디언트 몸체 + 따뜻한 키라이트 + 이중 테두리 + 모서리 장식 */
export function frame(ctx, x, y, w, h, { top = 'rgba(26,14,34,0.94)', bot = 'rgba(8,4,12,0.96)', edge = PAL.goldDim, corners = true, glowC = null, alpha = 1, key = true } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  // 그라디언트는 원점 기준 캐시 (R1-REQ-341B): 매 프레임 그리는 패널도 새 그라디언트를 만들지 않는다
  fillGradRect(ctx, vGrad(ctx, h, [0, top, 1, bot]), x, y, w, h);
  if (key) {
    // 위쪽 따뜻한 키라이트 + 아래쪽 차가운 반사
    const kh = Math.min(60, h * 0.4);
    fillGradRect(ctx, vGrad(ctx, kh, FRAME_KEY), x, y, w, kh);
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
  const S = dim ? SEL_DIM : SEL_ON;
  fillGradRect(ctx, hGrad(ctx, w, S[0]), x, y, w, h);
  const lg = hGrad(ctx, w, S[1]);
  fillGradRect(ctx, lg, x, y, w, 1); fillGradRect(ctx, lg, x, y + h - 1, w, 1);
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
  rr(ctx, x, y, w, h, 4); fillPathGrad(ctx, vGrad(ctx, h, KEYCAP), 0, y);
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,200,0.12)'; ctx.fillRect(x + 3, y + 2, w - 6, 1);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';
  return w;
}
/**
 * 키 안내 줄: items = [[키/액션(배열 가능), 설명, 터치 문구?], ...]. 반환: 끝 x
 * 지금 기기의 글리프로 그린다 (prompts.drawHints: 예전 키 글자 'Z'·'X'·'Q'·'↑↓' 는 legacyKey 로 액션이 되어
 * 키보드 = 키캡, 패드 = ✕○□△/A·B·X·Y/LB·RB …). drawHints 가 실패하면 예전 키캡 줄로 그린다.
 */
let hintErr = false;
export function hintRow(ctx, items, x, y, { align = 'left', size = 12, color = PAL.dim } = {}) {
  try { return drawHints(ctx, items, x, y, { align, size, color }); } catch (e) { if (!hintErr) { hintErr = true; console.error('[menu] hints', e); } }
  return keyRow(ctx, items, x, y, { align, size });
}
/** 예전 키캡 안내 줄 (글자 그대로) */
function keyRow(ctx, items, x, y, { align = 'left', size = 12 } = {}) {
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
    rr(ctx, x, y, fw, h, h / 2); fillPathGrad(ctx, vGrad(ctx, h, [0, color, 1, rgba(color, 0.55)]), 0, y);
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
    case 'paw': // 동료 탭: 발바닥 볼록살 하나 + 발가락 넷 (companions §7.2)
      ctx.moveTo(0, 0.5);
      ctx.bezierCurveTo(4.5, 0.5, 7.5, 5, 6.2, 7.8); ctx.bezierCurveTo(5.2, 9.8, 2.6, 9.4, 0, 8.6);
      ctx.bezierCurveTo(-2.6, 9.4, -5.2, 9.8, -6.2, 7.8); ctx.bezierCurveTo(-7.5, 5, -4.5, 0.5, 0, 0.5); ctx.closePath(); ctx.fill();
      for (const [tx, ty, rx, ry, rot] of [[-7.4, -2.4, 2.2, 2.9, -0.45], [-2.7, -6.6, 2.3, 3.1, -0.12], [2.7, -6.6, 2.3, 3.1, 0.12], [7.4, -2.4, 2.2, 2.9, 0.45]]) {
        ctx.beginPath(); ctx.ellipse(tx, ty, rx, ry, rot, 0, TAU); ctx.fill();
      }
      break;
    case 'chevronL': // 탭 화살표 (터치)
      ctx.moveTo(4, -8); ctx.lineTo(-4, 0); ctx.lineTo(4, 8); ctx.stroke(); break;
    case 'chevronR':
      ctx.moveTo(-4, -8); ctx.lineTo(4, 0); ctx.lineTo(-4, 8); ctx.stroke(); break;
    case 'chevronD': // 아래에 더 있음 (스크롤 칸 아래 끝)
      ctx.moveTo(-8, -4); ctx.lineTo(0, 4); ctx.lineTo(8, -4); ctx.stroke(); break;
    default:
      ctx.arc(0, 0, 6, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────── 글자 배치 ─────────────────────────
const WRAP = new Map();
/** 줄바꿈 결과 캐시 (매 프레임 measureText 반복 방지). 글자 크기 하한(uiScale 장면)과 글꼴 세대도 키에 넣는다 */
export function wrapC(ctx, str, w, size, weight = 500, family = FONT.body) {
  str = String(str ?? '');
  const k = size + '|' + weight + '|' + Math.round(w) + '|' + family.length + '|' + textFloor() + '|' + fontEpoch + '|' + str;
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
/**
 * 캔버스 메모리 절약 모드: 실제 품질 등급(game.tier, 설정 'auto' 포함)이 'high' 가 아니면 — 휴대폰·태블릿의 기본 — 큰 정적 레이어를
 * 줄여 굽거나(메뉴 배경: 반 해상도) 굽지 않고 매 프레임 그린다(탭의 판 틀: 그라디언트는 캐시). MASTER_PLAN §5.2 메모리:
 * phone1 에서 메뉴를 연 채 살아 있는 캔버스 ≤ 20 MB (R1-REQ-342). 'high'(데스크톱)는 예전처럼 장치 픽셀 1:1 레이어 (P-11)
 */
export function leanMem(game = input.game) {
  const t = game?.tier ?? game?.quality;
  return !!t && t !== 'high';
}
/** ctx 의 지금 변환 배율 (논리 px → 캔버스 px) */
export function ctxScale(ctx) {
  try { const m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; } catch { return 1; }
}
/**
 * 레이어 배율을 픽셀 예산 안으로 (platform §6.4, P-11): 레이어 한 장의 픽셀 수가 그리는 캔버스의 백킹 픽셀 수
 * (= 품질 등급의 예산으로 이미 잘린 크기)를 넘지 않게 하고, 4배를 넘지 않는다. 키가 흔들리지 않게 1/64 단위로 내린다.
 */
export function budgetScale(ctx, w, h, scale) {
  let s = scale > 0 ? scale : ctxScale(ctx);
  const cv = ctx?.canvas;
  const maxPx = Math.max(2.5e5, (cv?.width || 0) * (cv?.height || 0));
  if (w > 0 && h > 0) s = Math.min(s, Math.sqrt(maxPx / (w * h)));
  s = Math.min(4, Math.max(0.25, s));
  return Math.floor(s * 64) / 64;
}
/**
 * 정적인 그림을 픽셀 배율에 맞춘 캔버스에 한 번 그려 두고 재사용.
 * scale 을 주지 않으면(null) ctx 의 지금 변환에서 잰다 (uiScale 장면이면 uiK 까지 포함).
 * 키에 ui.fontEpoch 가 들어 있어 웹 글꼴이 늦게 도착하면 다시 굽는다 (P-28). 배율은 픽셀 예산으로 자른다 (P-11).
 * 변환이 축 정렬(회전·기울임 없음)이고 장치 배율 그대로 예산 안이면, 장치 배율로 구워 단위 변환 · 정수 장치 위치로
 * 복사한다 (필터 없는 1:1 복사 — fhd2x 에서 확대 복사보다 몇 배 싸다). 아니면 예산 배율로 구워 'medium' 으로 복사.
 */
export class Layer {
  constructor() { this.cv = null; this.key = null; }
  /** copyQ: 배율 경로로 붙일 때의 필터 (기본 'medium'; 흐린 배경을 반 해상도로 구웠으면 'low' 쌍선형이면 충분) */
  draw(ctx, key, x, y, w, h, scale, fn, copyQ = 'medium') {
    let m = null;
    if (!(scale > 0)) { try { m = ctx.getTransform(); } catch { m = null; } }
    const cv0 = ctx?.canvas, maxPx = Math.max(2.5e5, (cv0?.width || 0) * (cv0?.height || 0));
    const exact = !!m && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && m.a > 0 && m.a <= 4 && Math.abs(m.a - m.d) < 1e-6
      && Math.round(w * m.a) * Math.round(h * m.a) <= maxPx * 1.02; // 화면 크기 레이어 = 백킹 크기 (소수 오차로 1 px 넘는 것 허용)
    scale = exact ? m.a : budgetScale(ctx, w, h, scale);
    const k = key + '|' + w + '|' + h + '|' + scale + '|' + (exact ? 1 : 0) + '|' + fontEpoch;
    if (this.key !== k || !this.cv) {
      const pw = Math.max(1, Math.ceil(w * scale)), ph = Math.max(1, Math.ceil(h * scale));
      if (!this.cv) this.cv = takeCanvas(); // 풀에서 (스테이지 도중 새 캔버스 0 — R1-REQ-339B)
      if (this.cv.width !== pw || this.cv.height !== ph) { this.cv.width = pw; this.cv.height = ph; }
      const c = this.cv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, pw, ph);
      c.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      try { fn(c); } catch (e) { console.error(e); }
      this.key = k;
    }
    if (exact) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // 자르기 영역·globalAlpha 는 그대로 (반올림으로 최대 0.5 장치 px 비킨다)
      ctx.drawImage(this.cv, Math.round(m.a * x + m.e), Math.round(m.d * y + m.f));
      ctx.restore();
      return;
    }
    // 거의 1:1 복사(배율을 1/64 로 내림)라 'medium' 이면 충분하다. 'high' 는 1:1 이 아닌 전체 화면 복사가 10배 느리다 (P-11)
    const sq = ctx.imageSmoothingQuality;
    if (sq === 'high' || copyQ === 'low') ctx.imageSmoothingQuality = copyQ === 'low' ? 'low' : 'medium';
    ctx.drawImage(this.cv, 0, 0, this.cv.width, this.cv.height, x, y, this.cv.width / scale, this.cv.height / scale);
    ctx.imageSmoothingQuality = sq;
  }
  invalidate() { this.key = null; }
  /** 캔버스를 풀에 돌려준다 (픽셀 메모리 0). 다음 draw 에서 풀에서 다시 빌려 굽는다 */
  free() { giveCanvas(this.cv); this.cv = null; this.key = null; }
  release() { this.free(); }
  /** 지금 차지한 픽셀 메모리 (바이트) */
  get bytes() { return this.cv ? this.cv.width * this.cv.height * 4 : 0; }
}

// ───────────────────────── 입력 ─────────────────────────
const DIRS = ['up', 'down', 'left', 'right'];
const nowS = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
/**
 * 메뉴 탐색 입력 세대. Nav 가 방향 입력을 한 번 낼 때마다 +1 → Scroller 가 "키·패드로 선택이 바뀌었다" 를 안다 (P-01).
 * 포인터 호버·탭·드래그·휠로 바뀐 선택은 따라가지 않는다.
 */
export const NAV = { epoch: 0 };

/**
 * 방향 반복 + 메뉴 의미 입력 모음 (매 틱 poll). 의미 액션은 input.bindings 의 기기별 바인딩에서 읽는다 (MASTER_PLAN §1.4):
 * 패드 B 는 게임에서 대시지만 메뉴에선 취소만, LT 는 스킬 페이지가 아니라 alt2. Q·E 는 prevTab / nextTab 로 구분된다.
 */
export class Nav {
  constructor() { this.rep = { up: 0, down: 0, left: 0, right: 0 }; this.o = {}; }
  poll(dt) {
    const o = this.o;
    let any = false;
    for (const a of DIRS) {
      let hit = false;
      if (input.pressed(a)) { hit = true; this.rep[a] = 0.3; }
      else if (input.down(a)) { this.rep[a] -= dt; if (this.rep[a] <= 0) { hit = true; this.rep[a] = 0.075; } }
      o[a] = hit;
      if (hit) any = true;
    }
    o.confirm = input.pressed('confirm');
    o.cancel = input.pressed('cancel');
    o.menu = input.pressed('menu') && !o.confirm && !o.cancel; // 패드 START (키보드 Enter·Esc 는 결정·취소로 온다)
    o.map = input.pressed('map');         // 빠른 메뉴 (Tab·M·I / 패드 SELECT): 메뉴를 닫는다
    o.alt = input.pressed('alt');         // A / 패드 Y : 보조 기능 (정렬·슬롯 등록 등)
    o.alt2 = input.pressed('alt2');       // C / 패드 LT : 보조 기능 2 (잠금 등)
    o.prevTab = input.pressed('prevTab'); // Q·S / LB
    o.nextTab = input.pressed('nextTab'); // E·D / RB
    o.swap = input.pressed('swap');       // 호환용 — 탭 전환에는 쓰지 않는다
    if (any) NAV.epoch++;
    return o;
  }
  clear() { for (const k in this.o) this.o[k] = false; }
}

// ── 포인터 이벤트 기록 (창 단위, 한 번만 설치) ──
// 누른 곳·뗀 곳·시각과 최근 이동 표본. 스텝이 밀려 한 스텝에 누름과 뗌이 함께 보여도
// 밀기(swipe)·길게 누르기·튕기기 속도를 실제 손가락 움직임대로 잰다.
const PTR = { id: null, down: null, up: null, moves: [], seq: 0, installed: false };
/** 이벤트가 만들어진 시각 (초, performance.now 와 같은 시계) — 처리가 밀려도 손가락 시각 그대로 */
const evT = (e) => (e.timeStamp > 0 ? e.timeStamp / 1000 : nowS());
function installPtr() {
  if (PTR.installed || typeof window === 'undefined') return;
  PTR.installed = true;
  const opt = { capture: true, passive: true };
  window.addEventListener('pointerdown', (e) => {
    const cv = input.game?.canvas;
    if (!cv || e.target !== cv) return;
    if (PTR.down && !PTR.up && PTR.id !== e.pointerId) return; // 두 번째 손가락은 무시
    PTR.id = e.pointerId; PTR.seq++;
    PTR.down = { cx: e.clientX, cy: e.clientY, t: evT(e), max: 0, type: e.pointerType || 'mouse' };
    PTR.up = null; PTR.moves.length = 0;
  }, opt);
  window.addEventListener('pointermove', (e) => {
    const d = PTR.down;
    if (!d || PTR.up || e.pointerId !== PTR.id) return;
    // 한 프레임에 합쳐진 이동(coalesced)도 하나씩 표본으로 — 빠른 밀기의 속도를 실제 손가락대로 잰다
    let list = null;
    try { list = e.getCoalescedEvents?.(); } catch { list = null; }
    if (!list || !list.length) list = [e];
    for (const c of list) {
      const m = Math.hypot(c.clientX - d.cx, c.clientY - d.cy);
      if (m > d.max) d.max = m;
      PTR.moves.push({ cx: c.clientX, cy: c.clientY, t: c.timeStamp > 0 ? c.timeStamp / 1000 : evT(e) });
    }
    while (PTR.moves.length > 24) PTR.moves.shift();
  }, opt);
  const end = (e, cancel) => {
    if (!PTR.down || PTR.up || e.pointerId !== PTR.id) return;
    PTR.up = { cx: e.clientX, cy: e.clientY, t: evT(e), cancel };
  };
  window.addEventListener('pointerup', (e) => end(e, false), opt);
  window.addEventListener('pointercancel', (e) => end(e, true), opt);
}
/** CSS px(창 좌표) → 맨 위 장면의 좌표 (논리 px, uiScale 장면이면 UI px) + f = UI px 1 당 CSS px */
function cssToUi(cx, cy) {
  const g = input.game, cv = g?.canvas;
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  const k = g.top?.uiScale ? g.uiK || 1 : 1;
  const lw = (r.width || 1) / (g.viewW || 960), lh = (r.height || 1) / (g.viewH || 540);
  return { x: (cx - r.left) / lw / k, y: (cy - r.top) / lh / k, f: lh * k };
}
/**
 * 가로 최고 속도 (UI px/초): 0.04초 이상 떨어진 두 표본 사이의 가장 빠른 구간.
 * 느린 기기·밀린 이벤트에서도 "재빨리 민" 구간을 잡는다 (전체 평균만 쓰면 시작 전 머뭇거림이 속도를 깎는다).
 */
function peakVx(d, up, f) {
  const pts = [d, ...PTR.moves, up];
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dt = pts[j].t - pts[i].t;
      if (dt < 0.04) continue;
      const v = Math.abs(pts[j].cx - pts[i].cx) / dt / f;
      if (v > best) best = v;
    }
  }
  return best;
}
/** 휴대폰 진동 (설정 '진동' 이 켜져 있을 때만) */
export function buzz(ms = 10) {
  try { if (input.game?.settings?.vibration !== false && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms); } catch { /* 무시 */ }
}

const MOVE_PX = 10;          // 탭 ↔ 끌기 경계 (UI px)
const LONG_PRESS = 0.45;     // 길게 누르기 (초, 터치·펜) — platform §5.6
const SWIPE_DIST = 70, SWIPE_SPEED = 400, SWIPE_TAN = Math.tan(Math.PI / 6); // 탭 밀기: ≥ 70 px, 수평에서 30° 안, ≥ 400 px/s
const FLING_WIN = 0.1;       // 손을 뗄 때 속도를 재는 구간 (초). 그동안 멈춰 있었으면 속도 0
const LEGACY_ID = Object.freeze({ legacy: true });
const same = (z, r) => Math.abs(z.x - r.x) < 0.5 && Math.abs(z.y - r.y) < 0.5 && Math.abs(z.w - r.w) < 0.5 && Math.abs(z.h - r.h) < 0.5;
const regFresh = () => taps.n > 0 && (typeof performance !== 'undefined' ? performance.now() : Date.now()) - taps.sealedAt <= taps.maxAge;

/**
 * 탭 영역 등록 (render 에서; 그린 순서 = 아래 → 위). ui.taps 공용 등록부에 올리고, 사각형에 주인을 적어 둔다.
 *   kind: 'primary' 주 버튼 44 · 'list' 목록 줄 36 · 'icon' 아이콘·화살표 44×44 · 'dense' 촘촘한 정보 줄 28 (CSS px, §6.3)
 *   opts.clip: 스크롤 목록의 보이는 영역. 절반(minVis) 넘게 보이는 항목만 (온전한 크기로) 등록하고, 나머지는 가려진 것으로
 *              표시해 탭되지 않게 한다. 스크롤 항목은 고정 단추보다 먼저 등록할 것 (나중에 등록한 영역이 위 = 우선).
 *   opts.slop, opts.src, opts.disabled: ui.taps.add 로 그대로
 * 반환: r
 */
export function zone(r, kind = 'list', owner = null, { clip = null, minVis = 0.5, slop, src = 'menu', disabled = false } = {}) {
  if (!r) return r;
  r.tzo = owner; r.thid = false;
  if (clip) {
    const vw = Math.min(r.x + r.w, clip.x + clip.w) - Math.max(r.x, clip.x);
    const vh = Math.min(r.y + r.h, clip.y + clip.h) - Math.max(r.y, clip.y);
    if (vw <= 0 || vh <= 0 || (vw * vh) / Math.max(1, r.w * r.h) < minVis) { r.thid = true; return r; }
  }
  const o = { kind, owner, src, disabled };
  if (slop !== undefined) o.slop = slop;
  taps.add(r, r, o);
  return r;
}

/**
 * 포인터 제스처: 탭 vs 끌기 구분, 마우스 호버, 길게 누르기, 가로 밀기, claim.
 *  - update() 를 매 틱 한 번 (장면의 update 첫머리).
 *  - zone(r, kind, opts) : render 에서 탭 영역 등록 (주인 = 이 Gesture). tap(r) 은 등록부 판정 (터치 여유 포함)
 *  - tap(r)              : 이번 틱의 탭이 r 에 떨어졌나. 등록하지 않은 사각형은 안쪽만 (다음 그리기에서 'list' 로 올려 여유를 받는다)
 *  - longPress {x, y}    : 이번 틱에 길게 누르기(450 ms, 터치)가 걸렸다 — held(r) 로 확인해 받아 주면 그 뒤의 뗌은 탭이 아니다
 *                          (아무도 받지 않은 길게 누르기는 뗄 때 보통 탭으로 친다)
 *  - swipe {dir, x, y}   : 이번 틱에 가로 밀기가 끝났다 (dir +1 = 왼쪽으로 밀기 = 다음 탭)
 *  - claim()             : 지금 누르고 있는 손가락은 다른 조작(회전대 끌기 등)이 가져간다 → 탭·밀기·길게 누르기 없음
 *  - releaseVel()        : 뗄 때 속도 {vx, vy} (UI px/초)
 */
export class Gesture {
  constructor() {
    this.g = null; this.tapOK = false; this.hover = false; this.lx = -1; this.ly = -1; this.wheel = 0; this._wheel = 0;
    this.justDown = false; this.released = false; this.longPress = null; this.swipe = null;
    this._hits = new Map(); this._legacy = new Map(); this._seq = -1;
    installPtr();
  }
  update() {
    const p = input.pointer;
    const now = nowS();
    this.longPress = null; this.swipe = null; this.released = false; this._hits.clear();
    this.tick = (this.tick || 0) + 1; // Scroller 가 "지난 틱에도 불렸나"(다른 탭·모달 뒤에 있었나)를 안다
    this.justDown = !!p.justDown;
    if (p.justDown) {
      const d = PTR.down && PTR.seq !== this._seq && !PTR.down.used ? PTR.down : null;
      const q = d ? cssToUi(d.cx, d.cy) : null;
      if (d) { d.used = true; this._seq = PTR.seq; }
      // t = 손가락이 닿은 시각(이벤트), tp = 이 장면이 누름을 처음 본 시각(처리). 메인 스레드가 밀려 이벤트가 늦게 오면
      // 이벤트 시각으로는 이미 오래 누른 것처럼 보이므로, 누르는 동안의 길게 누르기는 처리 시각으로 잰다
      this.g = { x: q ? q.x : p.x, y: q ? q.y : p.y, t: d ? d.t : now, tp: now, moved: false, lp: false, lpUsed: false, claimed: false, done: false, touch: d ? d.type !== 'mouse' : !!input.touchMode, ptr: d };
    }
    const g = this.g;
    if (g && !g.done) {
      const f = g.ptr ? cssToUi(0, 0)?.f || 1 : 1;
      if (!g.moved && ((g.ptr && g.ptr.max / f > MOVE_PX) || ((p.down || p.tapped) && Math.hypot(p.x - g.x, p.y - g.y) > MOVE_PX))) g.moved = true;
      if (p.down && g.touch && !g.moved && !g.lp && !g.claimed && now - g.tp >= LONG_PRESS) { g.lp = true; this.longPress = { x: g.x, y: g.y }; buzz(10); }
      if (p.tapped) {
        g.done = true; this.released = true;
        const up = g.ptr && PTR.down === g.ptr && PTR.up ? PTR.up : null;
        const dur = Math.max(1 / 120, (up ? up.t : now) - g.t);
        // 스텝이 밀려 누르는 동안 길게 누르기를 못 봤으면 뗄 때 판정 (0.45초 넘게 제자리).
        // 손가락 시간(이벤트)과 처리 시간 중 짧은 쪽: 멈춘 화면 뒤에 한꺼번에 온 짧은 탭을 길게 누르기로 보지 않는다
        const held = Math.min(dur, now - g.tp);
        if (g.touch && !g.moved && !g.lp && !g.claimed && held >= LONG_PRESS && !up?.cancel) { g.lp = true; this.longPress = { x: g.x, y: g.y }; buzz(10); }
        if (g.touch && g.moved && !g.lp && !g.claimed && !up?.cancel) {
          const e = up ? cssToUi(up.cx, up.cy) : { x: p.x, y: p.y };
          const dx = e.x - g.x, dy = e.y - g.y, ax = Math.abs(dx);
          const speed = Math.max(ax / dur, up && g.ptr ? peakVx(g.ptr, up, cssToUi(0, 0)?.f || 1) : 0);
          if (ax >= SWIPE_DIST && Math.abs(dy) <= ax * SWIPE_TAN && speed >= SWIPE_SPEED) this.swipe = { dir: dx < 0 ? 1 : -1, x: g.x, y: g.y, dx, dy };
        }
      }
    }
    // 길게 누르기를 받아 준 곳(held)이 없었으면 뗄 때 보통 탭으로 (탭 막대·닫기 단추를 천천히 눌러도 된다)
    this.tapOK = !!p.tapped && !(g && (g.moved || (g.lp && g.lpUsed) || g.claimed));
    this.hover = !input.touchMode && !p.down && p.active && (p.x !== this.lx || p.y !== this.ly);
    this.lx = p.x; this.ly = p.y;
    this.wheel = this._wheel; this._wheel = 0;
  }
  get moved() { return !!this.g?.moved; }
  /** 지금 누르고 있는 손가락을 다른 조작이 가져간다 (탭·밀기·길게 누르기 없음) */
  claim() { if (this.g && !this.g.done) this.g.claimed = true; }
  get claimed() { return !!this.g?.claimed; }
  /** 탭 영역 등록 (render 에서). 주인 = 이 Gesture. 반환: r */
  zone(r, kind = 'list', opts = {}) { return zone(r, kind, opts.owner ?? this, opts); }
  /** 등록부 판정 결과 (주인별, 틱마다 한 번): undefined = 등록부가 비었거나 오래됨, null = 아무 영역도 아님 */
  hitOf(owner) {
    if (this._hits.has(owner)) return this._hits.get(owner);
    let z;
    if (regFresh()) { const p = input.pointer; z = taps.at(p.x, p.y, owner) ?? null; }
    this._hits.set(owner, z);
    return z;
  }
  tap(r) {
    if (!r) return false;
    const p = input.pointer;
    if (r.tzo !== undefined) { // zone() 으로 등록한 영역: 등록부 판정 (터치 여유, 위에 그린 것 우선)
      if (!this.tapOK || r.thid) return false;
      const z = this.hitOf(r.tzo);
      return z === undefined ? inRect(p.x, p.y, r) : !!z && z.id === r;
    }
    // 등록하지 않은 사각형: 다음 그리기(flush)에서 'list' 로 올려 여유 영역·?debug=taps·QA 감사에 보이게 한다
    this._legacy.set(r.x + ',' + r.y + ',' + r.w + ',' + r.h, r);
    taps.note(r, 'list', 'Gesture');
    if (!this.tapOK) return false;
    if (inRect(p.x, p.y, r)) return true;
    if (!input.touchMode) return false;
    const z = this.hitOf(this);
    return !!z && z.id === LEGACY_ID && same(z, r);
  }
  /** render 끝에서 한 번: 지난 update 들에서 tap() 으로 본, 등록하지 않은 사각형을 등록부에 올린다 */
  flush() {
    for (const r of this._legacy.values()) taps.add(LEGACY_ID, r, { kind: 'list', owner: this, src: 'Gesture' });
    this._legacy.clear();
  }
  /** 이번 틱에 길게 누르기가 r 안에서 걸렸나 */
  held(r) {
    const l = this.longPress;
    const hit = !!l && !!r && !r.thid && inRect(l.x, l.y, r);
    if (hit && this.g) { this.g.lpUsed = true; this.tapOK = false; } // 받아 준 길게 누르기 → 그 손가락을 뗄 때는 탭이 아니다
    return hit;
  }
  /** 뗄 때 속도 {vx, vy} (UI px/초). 뗄 무렵 0.1초 동안 움직임이 없었으면 0 */
  releaseVel() {
    const g = this.g, d = g?.ptr, up = PTR.up;
    if (!d || PTR.down !== d || !up) return { vx: 0, vy: 0 };
    const M = PTR.moves;
    let i = M.length - 1;
    if (i < 0 || up.t - M[i].t > FLING_WIN) return { vx: 0, vy: 0 };
    while (i > 0 && up.t - M[i - 1].t <= FLING_WIN) i--;
    const a = M[Math.max(0, i - 1)];
    const dt = Math.max(1 / 60, up.t - a.t);
    const f = cssToUi(0, 0)?.f || 1;
    return { vx: (up.cx - a.cx) / dt / f, vy: (up.cy - a.cy) / dt / f };
  }
  hoverIn(r) { const p = input.pointer; return this.hover && inRect(p.x, p.y, r); }
  over(r) { const p = input.pointer; return p.active && !input.touchMode && inRect(p.x, p.y, r); }
  downIn(r) { const p = input.pointer; return p.down && inRect(p.x, p.y, r); }
  addWheel(dy) { this._wheel += dy; }
}

const SCROLL_EASE = 1e-6; // 목표까지 남은 비율 (초당): 휠·스틱·따라가기가 0.25초 안에 거의 붙는다
/**
 * 세로 스크롤: 드래그(관성·고무줄) + 마우스 휠 + 오른쪽 스틱 Y + 선택 따라가기.
 * P-01: 사용자가 직접 스크롤하면(드래그·휠·관성·스틱) userScrolled = true → 다음 탐색 입력(Nav 방향)까지 ensure() 를 무시한다.
 *   탭은 이렇게 부른다:  if (this.sc.shouldFollow(this.i)) this.sc.ensure(top, bottom, viewH)
 *   shouldFollow(key) 는 키·패드 탐색으로 선택이 바뀐 프레임(또는 follow() 요청)에만 참이다.
 * 움직임은 실제 경과 시간으로 (스텝이 밀려도 휠이 제때 붙는다; 스텝만 돌리는 시험에서는 dt).
 */
export class Scroller {
  constructor() {
    this.y = 0; this.target = 0; this.max = 0; this.vel = 0; this.drag = null;
    this.userScrolled = false;
    this.fKey = undefined; this.fPending = false; this.navSeen = NAV.epoch; this.navNew = false; this._rt = 0;
  }
  setMax(m) { this.max = Math.max(0, m); if (!this.drag) { this.target = clamp(this.target, 0, this.max); } }
  reset() { this.y = this.target = 0; this.vel = 0; this.drag = null; this.userScrolled = false; this.fPending = false; }
  /** 탐색 입력으로 선택을 바꿨다 → 다음 shouldFollow() 는 참 (직접 스크롤 상태도 푼다) */
  follow(key) { this.fPending = true; this.userScrolled = false; if (key !== undefined) this.fKey = key; }
  /** 이번 그리기에서 선택(key)을 따라가야 하나: 탐색 입력으로 선택이 바뀐 프레임이거나 follow() 요청이 있을 때만 */
  shouldFollow(key) {
    const changed = key !== this.fKey;
    this.fKey = key;
    const nav = this.navNew;
    this.navNew = false;
    if (this.fPending) { this.fPending = false; return true; }
    return nav && changed;
  }
  update(dt, rect, ges) {
    const p = input.pointer;
    // 이 목록이 지난 틱에 불리지 않았다 = 다른 탭·모달 뒤에 있었다. 그동안 다른 곳에서 누른 방향 입력은 이 목록의 탐색이 아니다
    // (패드로 목록을 스크롤한 뒤 다른 탭에서 D-pad 를 쓰고 돌아와도 목록이 선택 자리로 튀지 않게 — P-01)
    const gt = ges?.tick;
    const away = gt !== undefined && this._gt !== undefined && gt - this._gt > 1;
    if (gt !== undefined) this._gt = gt;
    // 탐색 입력이 들어왔다 → 직접 스크롤 상태를 풀고, 선택이 안 바뀌었어도 선택을 다시 보여 준다
    if (NAV.epoch !== this.navSeen) {
      this.navSeen = NAV.epoch;
      if (!away) {
        this.navNew = true;
        if (this.userScrolled) { this.userScrolled = false; this.fPending = true; }
      }
    }
    const now = nowS();
    const gap = this._rt ? now - this._rt : 0;
    this._rt = now;
    // 0.3초 넘게 불리지 않았다(다른 탭·모달 뒤에서 돌아옴) → 이어서 dt 로 (스틱·관성이 한 번에 튀지 않게)
    const rdt = gap > 0.3 ? dt : Math.min(0.25, Math.max(0, gap));
    // 한 rAF 에 틱이 여럿 돌면(30fps 기기 = 2틱) 틱마다 dt 로 이미 실제 시간과 같다 → dt.
    // game 은 한 rAF 에 최대 5틱만 돌리고 남은 시간을 버리므로, 그보다 긴 정지 뒤 첫 틱에만 버려질 몫을 더한다
    // (이전: max(dt, 실제 간격) → 같은 rAF 의 둘째 틱이 dt 를 한 번 더 세어 스틱·관성 스크롤이 1.5배 빨랐다)
    const edt = rdt > 5 * dt ? rdt - 4 * dt : dt;
    const g = ges?.g;
    // 이 목록이 못 본 사이에 끝난 손가락(가로 밀기로 탭을 떠났다 돌아옴 등)의 끌기는 버린다 → 돌아와도 목록이 튀지 않는다
    if (this.drag && (!g || this.drag.g !== g || (g.done && !ges.released))) this.drag = null;
    if (ges?.justDown && g && rect && inRect(g.x, g.y, rect)) { this.drag = { y0: g.y, s0: this.y, g, axis: null }; this.vel = 0; }
    if (this.drag) {
      // 처음 움직인 방향으로 축을 정한다: 가로로 먼저 움직이면(탭 넘기기 밀기 등) 목록은 세로로 끌지 않는다
      if (!this.drag.axis && ges?.moved) this.drag.axis = Math.abs(p.x - g.x) > Math.abs(p.y - g.y) * 1.2 ? 'x' : 'y';
      if (ges?.moved && !ges.claimed && this.drag.axis === 'y') {
        let ny = this.drag.s0 - (p.y - this.drag.y0);
        if (ny < 0) ny *= 0.4; else if (ny > this.max) ny = this.max + (ny - this.max) * 0.4;
        this.y = this.target = ny;
        this.userScrolled = true;
      }
      if (p.down) return;
      if (ges?.moved && !ges.claimed && this.drag.axis === 'y') this.vel = clamp(-(ges.releaseVel?.().vy ?? 0), -2600, 2600);
      this.drag = null;
    }
    if (ges?.wheel && rect && inRect(p.x, p.y, rect)) { this.target = clamp(this.target + ges.wheel, 0, this.max); this.vel = 0; this.userScrolled = true; }
    // 오른쪽 스틱 Y (패드): 기울기² × 초당 900 px
    const sy = input.mode === 'pad' ? input.stickR?.y ?? 0 : 0;
    if (Math.abs(sy) > 0.08 && this.max > 0) { this.target = clamp(this.target + Math.sign(sy) * sy * sy * 900 * edt, 0, this.max); this.vel = 0; this.userScrolled = true; }
    if (Math.abs(this.vel) > 8) { this.target += this.vel * edt; this.vel *= Math.pow(0.03, edt); if (this.target < 0 || this.target > this.max) this.vel *= 0.5; }
    else this.vel = 0;
    this.target = clamp(this.target, 0, this.max);
    this.y = lerp(this.y, this.target, 1 - Math.pow(SCROLL_EASE, edt));
    if (Math.abs(this.y - this.target) < 0.3) this.y = this.target;
  }
  /** [top,bottom] 구간이 보이도록 목표 조정. 사용자가 직접 스크롤한 뒤에는 (다음 탐색 입력까지) 아무것도 하지 않는다 */
  ensure(top, bottom, viewH, pad = 6) {
    if (this.userScrolled || this.drag) return;
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
  fillGradRect(ctx, vGrad(ctx, th, SCROLL_BAR), x, ty, 4, th);
}

/** 스크롤 영역 클립 + 위아래 페이드 */
export function clipBegin(ctx, r) { ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip(); }
export function clipEnd(ctx, r, sc, fadeC = 'rgba(8,4,12,0.95)') {
  ctx.restore();
  if (!sc) return;
  if (sc.y > 1) fillGradRect(ctx, vGrad(ctx, 18, [0, fadeC, 1, 'rgba(8,4,12,0)']), r.x, r.y, r.w, 18);
  if (sc.y < sc.max - 1) fillGradRect(ctx, vGrad(ctx, 18, [0, 'rgba(8,4,12,0)', 1, fadeC]), r.x, r.y + r.h - 18, r.w, 18);
}
/** 아래에 더 있음 표시: 칸 아래 끝 가운데 작은 꺾쇠 (업적 칩 줄의 좌우 꺾쇠와 같은 빛깔·굵기). 끝까지 내리면 사라진다 */
export function moreBelow(ctx, cx, bottom, y, max) {
  if (y < max - 1) glyph(ctx, 'chevronD', cx, bottom - 6, 12, 'rgba(232,200,114,0.7)', 2);
}

// ───────────────────────── 버튼 ─────────────────────────
/** 고딕 버튼 (그리기만; 탭 판정은 호출측 ges.tap) */
export function gbutton(ctx, r, label, { hot = false, disabled = false, size = 15, icon = null, t = 0, color = null, sub = null, accent = PAL.crimson } = {}) {
  ctx.save();
  // 몸체 그라디언트는 높이·상태별 캐시 (R1-REQ-341B: 예전에는 단추 하나가 프레임마다 새 그라디언트 1개 — 허브 34/프레임의 한 몫)
  const stops = disabled ? BTN_OFF : hot ? (accent === PAL.crimson ? BTN_HOT : [0, rgba(accent, 0.95), 1, 'rgba(50,4,14,0.95)']) : BTN_ON;
  rr(ctx, r.x, r.y, r.w, r.h, 4); fillPathGrad(ctx, vGrad(ctx, r.h, stops), 0, r.y);
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
 * update(dt, nav, ges) → 계속 열려 있으면 true. 줄은 자기 이름(owner = 팝업)으로 ui.taps 에 등록 ('list', 터치 48 px 줄)
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
    const rowH = input.touchMode ? 48 : 36;
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
      this.rects.push(zone(r, 'list', this, { src: 'menu.popup' }));
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
      this.rects.push(zone(r, 'primary', this, { src: 'menu.confirm' }));
      gbutton(ctx, r, lb, { hot: this.i === i, t: this.t, size: 15 });
    });
    ctx.restore();
  }
}

// ───────────────────────── 가상 패드 숨김 (옛 이름) ─────────────────────────
/**
 * 옛 호출부 호환용: 아무것도 하지 않는다. 가상 패드 표시는 game.syncPad 가 장면 플래그로만 정한다 (platform §5.1, P-18):
 * 패드를 숨길 장면은 this.hidePad = true (메뉴 장면은 생성자에서 켠다).
 */
export function hidePad(on) { /* no-op: scene.hidePad */ }

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
