// 마을 건물 파사드 — 절차적 고딕 목조/석조 건물을 오프스크린에 한 번 굽고(bake), 창문 불빛·간판 흔들림·굴뚝 연기·
// 대장간 불꽃·성당 장미창 같은 움직이는 부분만 매 프레임 덧그린다. 월드 좌표(바닥 y = FLOOR)에서 그린다.
//  drawFacades(ctx, cam, t, info)  : 중경 레이어(타일보다 뒤)에서 호출
//  facadeLights(L, cam, t)         : 창문/가로등/화덕 광원 등록
//  glowSprite(color)               : 부드러운 광채 스프라이트 (다른 장면에서도 재사용)
import { RNG, hashStr, TAU, clamp, rgba, shade, lerp } from '../../core/math.js';
import { text, FONT } from '../../core/ui.js';
import { TILE } from '../../core/game.js';
import { BUILDINGS, TOWN_FLOOR_ROW, TOWN_LAMPS } from '../../data/town.js';

export const FLOOR = TOWN_FLOOR_ROW * TILE;

const P = {
  plaster: '#4a4352', plasterDark: '#2a2530',
  timber: '#26180f', timberHi: '#4d3423', timberLo: '#110905',
  stone: '#35323f', stoneLo: '#1e1b25', mortar: '#0e0b12',
  cstone: '#303242', cstoneLo: '#1c1e2a',
  slate: '#24222f', slateHi: '#3e3c55',
  rim: '#a9c2ff', warm: '#ffb45a', warmHi: '#ffe6a8',
  ol: '#07040a', gold: '#e8c872',
};
const HEIGHT = { wall: 340, inn: 440, shop: 360, board: 210, smith: 420, church: 484, house: 340, gate: 360 };
const PAD = 44;

// ───────────────────────── 공용 광채 스프라이트 ─────────────────────────
const glowCache = new Map();
export function glowSprite(color = '#ffb45a') {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, rgba(color, 0.9)); gr.addColorStop(0.25, rgba(color, 0.45)); gr.addColorStop(0.6, rgba(color, 0.12)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}
export function glow(ctx, x, y, r, color, a = 1) {
  if (a <= 0.01) return;
  ctx.globalAlpha = a;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

// ───────────────────────── 기본 도형 ─────────────────────────
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }
function vgrad(c, y0, y1, a, b) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }
function hgrad(c, x0, x1, a, b) { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, a); g.addColorStop(1, b); return g; }

/** 돌 블록 벽 (마름돌) */
function stones(c, x, y, w, h, rng, base = P.stone, { rowH = [13, 19], bw = [22, 40], mortar = P.mortar } = {}) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = mortar; c.fillRect(x, y, w, h);
  let yy = y, r = 0;
  while (yy < y + h) {
    const bh = rng.range(rowH[0], rowH[1]);
    let xx = x - rng.range(0, 24);
    while (xx < x + w) {
      const bwid = rng.range(bw[0], bw[1]);
      c.fillStyle = shade(base, rng.range(-0.16, 0.08));
      c.fillRect(xx + 1.4, yy + 1.4, bwid - 2.8, bh - 2.8);
      c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(xx + 1.4, yy + 1.4, bwid - 2.8, 1.6);
      c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(xx + 1.4, yy + bh - 3.4, bwid - 2.8, 2);
      if (rng.next() < 0.12) { c.fillStyle = 'rgba(70,90,60,0.25)'; c.fillRect(xx + 2, yy + bh - 6, bwid * rng.range(0.3, 0.8), 4); }
      xx += bwid;
    }
    yy += bh; r++;
  }
  // 아래로 갈수록 어둡게 + 달빛 상단
  c.fillStyle = vgrad(c, y, y + h, 'rgba(160,180,255,0.06)', 'rgba(0,0,0,0.35)'); c.fillRect(x, y, w, h);
  c.restore();
}

/** 회반죽 벽 */
function plaster(c, x, y, w, h, rng, base = P.plaster) {
  c.fillStyle = vgrad(c, y, y + h, shade(base, 0.08), shade(base, -0.28));
  c.fillRect(x, y, w, h);
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  for (let i = 0; i < w * h / 180; i++) {
    c.fillStyle = rng.next() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.035)';
    c.fillRect(x + rng.next() * w, y + rng.next() * h, rng.range(1, 3), rng.range(1, 3));
  }
  // 빗물 얼룩
  for (let i = 0; i < w / 40; i++) {
    const sx = x + rng.next() * w, sh = rng.range(10, h * 0.6);
    c.fillStyle = vgrad(c, y, y + sh, 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0)');
    c.fillRect(sx, y, rng.range(2, 6), sh);
  }
  c.fillStyle = vgrad(c, y + h - 16, y + h, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.3)'); c.fillRect(x, y + h - 16, w, 16);
  c.restore();
}

/** 목재 들보 (수직/수평은 사각형, 사선은 선) */
function post(c, x, y, w, h) {
  c.fillStyle = hgrad(c, x, x + w, P.timberHi, P.timberLo); c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + w - 1, y, 1, h);
}
function rail(c, x, y, w, h) {
  c.fillStyle = vgrad(c, y, y + h, P.timberHi, P.timberLo); c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x, y + h - 1, w, 1);
}
function brace(c, x1, y1, x2, y2, wd = 7) {
  c.lineCap = 'butt';
  c.strokeStyle = P.timber; c.lineWidth = wd; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.strokeStyle = 'rgba(120,85,55,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x1 - 2, y1); c.lineTo(x2 - 2, y2); c.stroke();
}

/** 창문. lit=true 면 따뜻한 불빛, 아니면 달빛 반사. 광원 좌표를 lights 에 기록 */
function windowBox(c, b, x, y, w, h, { lit = true, arch = false, shutters = false, box = false, panes = 2, rng, color = P.warm } = {}) {
  // 온기 번짐 (벽면)
  if (lit) {
    const g = c.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, Math.max(w, h) * 1.3);
    g.addColorStop(0, 'rgba(255,170,90,0.22)'); g.addColorStop(1, 'rgba(255,170,90,0)');
    c.fillStyle = g; c.fillRect(x - w, y - h, w * 3, h * 3);
  }
  const path = () => {
    c.beginPath();
    if (arch) { c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath(); }
    else c.rect(x, y, w, h);
  };
  // 틀
  c.fillStyle = P.timberLo; c.fillRect(x - 5, y + (arch ? w / 2 : -5), w + 10, h + (arch ? -w / 2 + 5 : 10));
  if (arch) { c.beginPath(); c.arc(x + w / 2, y + w / 2, w / 2 + 5, Math.PI, 0); c.fill(); }
  // 유리
  path();
  if (lit) {
    const g = c.createRadialGradient(x + w / 2, y + h * 0.6, 2, x + w / 2, y + h * 0.5, Math.max(w, h) * 0.8);
    g.addColorStop(0, P.warmHi); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.45));
    c.fillStyle = g;
  } else c.fillStyle = vgrad(c, y, y + h, '#2a3350', '#0c0f1c');
  c.fill();
  if (!lit) { // 달빛 반사
    c.save(); path(); c.clip();
    c.fillStyle = 'rgba(169,194,255,0.18)'; poly(c, [x + w * 0.2, y, x + w * 0.45, y, x + w * 0.05, y + h, x - w * 0.2, y + h]); c.fill();
    c.restore();
  } else { // 실내 실루엣 (커튼)
    c.save(); path(); c.clip();
    c.fillStyle = 'rgba(90,20,20,0.45)'; c.fillRect(x, y, w * 0.18, h); c.fillRect(x + w * 0.82, y, w * 0.18, h);
    c.restore();
  }
  // 창살 (납 테두리)
  c.strokeStyle = 'rgba(20,10,6,0.9)'; c.lineWidth = 1;
  c.save(); path(); c.clip();
  for (let yy = y + 7; yy < y + h; yy += 8) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
  c.restore();
  c.fillStyle = P.timber;
  c.fillRect(x + w / 2 - 2, y + (arch ? 2 : 0), 4, h);
  if (panes > 1) c.fillRect(x, y + h * 0.48, w, 4);
  // 창턱
  c.fillStyle = vgrad(c, y + h, y + h + 7, '#6a6470', '#2a2630'); c.fillRect(x - 7, y + h, w + 14, 7);
  c.fillStyle = 'rgba(169,194,255,0.35)'; c.fillRect(x - 7, y + h, w + 14, 1.2);
  // 덧창
  if (shutters) {
    for (const [sx, d] of [[x - 5 - w * 0.42, -1], [x + w + 5, 1]]) {
      c.fillStyle = vgrad(c, y, y + h, '#3a2226', '#1c0e12'); c.fillRect(sx, y - 2, w * 0.42, h + 4);
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1;
      for (let k = 1; k < 3; k++) { c.beginPath(); c.moveTo(sx + (w * 0.42 * k) / 3, y - 2); c.lineTo(sx + (w * 0.42 * k) / 3, y + h + 2); c.stroke(); }
      c.fillStyle = '#1a0c0e'; c.fillRect(sx, y + h * 0.25, w * 0.42, 2); c.fillRect(sx, y + h * 0.7, w * 0.42, 2);
      if (d > 0) { c.fillStyle = 'rgba(169,194,255,0.3)'; c.fillRect(sx + w * 0.42 - 1.5, y - 2, 1.5, h + 4); }
    }
  }
  // 화분 상자
  if (box && rng) {
    c.fillStyle = vgrad(c, y + h + 7, y + h + 19, '#4a2e1c', '#1e120a'); c.fillRect(x - 4, y + h + 7, w + 8, 12);
    for (let i = 0; i < w / 5; i++) {
      c.fillStyle = rng.next() < 0.5 ? '#1e3a22' : '#2a4a2a';
      c.beginPath(); c.arc(x + rng.next() * w, y + h + 6 - rng.next() * 5, rng.range(2.5, 4.5), 0, TAU); c.fill();
    }
    for (let i = 0; i < w / 10; i++) { c.fillStyle = rng.next() < 0.6 ? '#b8243a' : '#e8c872'; c.beginPath(); c.arc(x + rng.next() * w, y + h + 2 - rng.next() * 6, 1.8, 0, TAU); c.fill(); }
  }
  if (lit) b._win.push({ x: x + w / 2, y: y + h / 2, r: Math.max(w, h) * 0.9, c: color });
}

/** 슬레이트 지붕(측면 처마) 사다리꼴: 아래 폭 [x0,x1], 위 폭 [x0+inset, x1-inset] */
function roofSlab(c, x0, x1, yb, yt, inset, rng, base = P.slate) {
  const pts = [x0, yb, x0 + inset, yt, x1 - inset, yt, x1, yb];
  c.save(); poly(c, pts); c.clip();
  c.fillStyle = vgrad(c, yt, yb, shade(base, 0.12), shade(base, -0.25)); c.fillRect(x0, yt, x1 - x0, yb - yt);
  let r = 0;
  for (let yy = yt; yy < yb + 12; yy += 11, r++) {
    const off = (r % 2) * 9;
    for (let xx = x0 - 20 + off; xx < x1 + 20; xx += 18) {
      c.fillStyle = shade(base, rng.range(-0.18, 0.14));
      c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + 17, yy); c.lineTo(xx + 17, yy + 9); c.quadraticCurveTo(xx + 8.5, yy + 13, xx, yy + 9); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(xx, yy + 9, 17, 2);
    }
  }
  // 달빛 반사 (오른쪽 위)
  c.fillStyle = hgrad(c, x0, x1, 'rgba(169,194,255,0)', 'rgba(169,194,255,0.12)'); c.fillRect(x0, yt, x1 - x0, yb - yt);
  c.restore();
  // 용마루 · 처마
  c.fillStyle = P.timberLo; c.fillRect(x0 + inset - 4, yt - 5, x1 - x0 - inset * 2 + 8, 7);
  c.fillStyle = 'rgba(169,194,255,0.55)'; c.fillRect(x0 + inset - 4, yt - 5, x1 - x0 - inset * 2 + 8, 1.5);
  c.fillStyle = vgrad(c, yb - 4, yb + 4, '#1a1418', '#0a0608'); c.fillRect(x0 - 2, yb - 3, x1 - x0 + 4, 7);
  c.strokeStyle = P.ol; c.lineWidth = 2; poly(c, pts); c.stroke();
}

/** 박공(삼각) 지붕 가장자리: 두 경사면을 따라 두꺼운 슬레이트 띠 */
function gableRoof(c, x0, x1, yb, peakX, peakY, thick, rng, base = P.slate) {
  for (const side of [-1, 1]) {
    const ex = side < 0 ? x0 : x1;
    const dx = peakX - ex, dy = peakY - yb, L = Math.hypot(dx, dy);
    const nx = -dy / L * side * -1, ny = dx / L * side * -1; // 바깥쪽(위) 법선
    const ox = (side < 0 ? -1 : 1) * 16;
    const pts = [ex + ox, yb + 6, peakX, peakY - thick * 0.2, peakX, peakY - thick * 1.1, ex + ox + nx * thick * 0.3, yb + 6 - thick];
    c.save(); poly(c, pts); c.clip();
    c.fillStyle = shade(base, side > 0 ? 0.1 : -0.05); c.fill();
    const ang = Math.atan2(dy, dx);
    c.translate(ex + ox, yb + 6); c.rotate(ang);
    for (let a = 0; a < L + 30; a += 14) {
      for (let k = 0; k < 3; k++) {
        c.fillStyle = shade(base, rng.range(-0.2, 0.15) + (side > 0 ? 0.06 : -0.04));
        c.fillRect(a + (k % 2) * 7, -thick * 1.2 + k * thick * 0.4 * side * -1 + (side > 0 ? thick * 0.8 : 0), 13, thick * 0.38);
      }
    }
    c.restore();
    c.strokeStyle = P.ol; c.lineWidth = 2; poly(c, pts); c.stroke();
    if (side > 0) { c.strokeStyle = 'rgba(169,194,255,0.55)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(peakX + 2, peakY - thick * 1.1 + 1); c.lineTo(ex + ox + nx * thick * 0.3, yb + 7 - thick); c.stroke(); }
  }
  // 박공 장식판 (bargeboard)
  c.strokeStyle = P.timber; c.lineWidth = 5;
  c.beginPath(); c.moveTo(x0 - 14, yb + 4); c.lineTo(peakX, peakY); c.lineTo(x1 + 14, yb + 4); c.stroke();
  c.fillStyle = P.gold; c.beginPath(); c.arc(peakX, peakY + 2, 3.2, 0, TAU); c.fill();
}

function chimney(c, x, yTop, w, yBottom, rng) {
  stones(c, x, yTop, w, yBottom - yTop, rng, '#4a3a3a', { rowH: [8, 11], bw: [12, 18] });
  c.fillStyle = vgrad(c, yTop - 8, yTop, '#5a5058', '#2a2430'); c.fillRect(x - 5, yTop - 8, w + 10, 8);
  c.fillStyle = 'rgba(169,194,255,0.5)'; c.fillRect(x - 5, yTop - 8, w + 10, 1.2);
  c.fillStyle = '#050305'; c.fillRect(x + 4, yTop - 10, w - 8, 3);
  c.strokeStyle = P.ol; c.lineWidth = 2; c.strokeRect(x, yTop - 8, w, yBottom - yTop + 8);
}

/** 문 (월드 좌표: 중앙 cx, 바닥 by). style: 'arch' | 'square' | 'gothic' | 'double' */
function doorway(c, cx, by, w, h, { style = 'arch', wood = '#3a2416', stone = P.stone, rng } = {}) {
  const x = cx - w / 2, y = by - h;
  // 석조 문틀
  c.fillStyle = vgrad(c, y - 14, by, shade(stone, 0.1), shade(stone, -0.3));
  c.beginPath();
  if (style === 'square') c.rect(x - 9, y - 9, w + 18, h + 9);
  else if (style === 'gothic' || style === 'double') { c.moveTo(x - 12, by); c.lineTo(x - 12, y + w * 0.5); c.quadraticCurveTo(x - 12, y - 22, cx, y - 30); c.quadraticCurveTo(x + w + 12, y - 22, x + w + 12, y + w * 0.5); c.lineTo(x + w + 12, by); }
  else { c.moveTo(x - 9, by); c.lineTo(x - 9, y + w / 2); c.arc(cx, y + w / 2, w / 2 + 9, Math.PI, 0); c.lineTo(x + w + 9, by); }
  c.closePath(); c.fill();
  c.strokeStyle = P.ol; c.lineWidth = 2; c.stroke();
  // 문짝
  const path = () => {
    c.beginPath();
    if (style === 'square') c.rect(x, y, w, h);
    else if (style === 'gothic' || style === 'double') { c.moveTo(x, by); c.lineTo(x, y + w * 0.5); c.quadraticCurveTo(x, y - 10, cx, y - 17); c.quadraticCurveTo(x + w, y - 10, x + w, y + w * 0.5); c.lineTo(x + w, by); c.closePath(); }
    else { c.moveTo(x, by); c.lineTo(x, y + w / 2); c.arc(cx, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, by); c.closePath(); }
  };
  c.save(); path(); c.clip();
  const n = Math.max(3, Math.round(w / 11));
  for (let i = 0; i < n; i++) {
    const px = x + (w / n) * i;
    c.fillStyle = hgrad(c, px, px + w / n, shade(wood, 0.12 + (rng ? rng.range(-0.08, 0.08) : 0)), shade(wood, -0.3));
    c.fillRect(px, y - 30, w / n, h + 30);
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(px + w / n - 1, y - 30, 1, h + 30);
  }
  // 쇠 띠
  for (const fy of [0.3, 0.75]) {
    c.fillStyle = '#1a1618'; c.fillRect(x, y + h * fy, w, 5);
    c.fillStyle = 'rgba(200,200,220,0.25)'; c.fillRect(x, y + h * fy, w, 1);
    for (let k = 0; k < n; k++) { c.fillStyle = '#6a6470'; c.beginPath(); c.arc(x + (w / n) * (k + 0.5), y + h * fy + 2.5, 1.3, 0, TAU); c.fill(); }
  }
  if (style === 'double') { c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(cx - 1.5, y - 20, 3, h + 20); }
  c.fillStyle = vgrad(c, by - 30, by, 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)'); c.fillRect(x, by - 30, w, 30);
  c.restore();
  // 문고리
  const hx = style === 'double' ? [cx - 8, cx + 8] : [x + w - 11];
  for (const k of hx) { c.strokeStyle = '#c8a040'; c.lineWidth = 2; c.beginPath(); c.arc(k, y + h * 0.55, 4, 0, TAU); c.stroke(); }
  c.strokeStyle = P.ol; c.lineWidth = 2; path(); c.stroke();
  // 문턱
  c.fillStyle = vgrad(c, by - 4, by + 2, '#6a6470', '#2a2630'); c.fillRect(x - 12, by - 4, w + 24, 6);
}

/** 벽걸이 등불 받침 (불꽃은 실시간) */
function lanternBracket(c, b, x, y, dir = 1) {
  c.strokeStyle = '#141014'; c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - dir * 12, y - 16); c.quadraticCurveTo(x - dir * 2, y - 26, x, y - 20); c.stroke();
  c.fillStyle = '#1a1418'; c.fillRect(x - 6, y - 18, 12, 4); c.fillRect(x - 5, y + 4, 10, 4);
  c.fillStyle = 'rgba(255,190,110,0.85)'; c.fillRect(x - 5, y - 14, 10, 18);
  c.strokeStyle = '#141014'; c.lineWidth = 1.5; c.strokeRect(x - 5, y - 14, 10, 18);
  c.beginPath(); c.moveTo(x, y - 14); c.lineTo(x, y + 4); c.stroke();
  b._lan.push({ x, y: y - 5 });
}

// ───────────────────────── 건물별 그리기 ─────────────────────────
const F = FLOOR;
const PAINT = {
  wall(c, b, rng) {
    // 서쪽 성벽 + 닫힌 성문 + 망루
    stones(c, b.x0 - 40, F - 250, b.x1 - b.x0 + 40, 250, rng, P.stone);
    for (let x = b.x0 - 40; x < b.x1; x += 30) { stones(c, x, F - 272, 18, 22, rng, P.stone); }
    stones(c, b.x1 - 70, F - 320, 70, 70, rng, '#34313d');
    for (let x = b.x1 - 76; x < b.x1; x += 22) stones(c, x, F - 336, 14, 16, rng, '#34313d');
    doorway(c, b.x0 + 40, F, 60, 110, { style: 'square', wood: '#2a1a12', rng });
    c.fillStyle = '#0a0608'; c.fillRect(b.x1 - 44, F - 290, 8, 26);
    c.strokeStyle = P.ol; c.lineWidth = 2; c.strokeRect(b.x0 - 40, F - 250, b.x1 - b.x0 + 40, 250);
    c.fillStyle = 'rgba(169,194,255,0.35)'; c.fillRect(b.x1 - 2, F - 320, 2, 320);
    lanternBracket(c, b, b.x0 + 92, F - 118, -1);
  },

  inn(c, b, rng) {
    const x0 = b.x0, x1 = b.x1, dcx = b.door * TILE + 24;
    const gf = F - 144, top = F - 264;
    // 굴뚝 (지붕 뒤)
    chimney(c, x1 - 110, F - 430, 36, F - 330, rng);
    // 지붕
    roofSlab(c, x0 - 30, x1 + 30, top + 2, F - 376, 70, rng);
    // 지붕창(도머) 2개
    for (const dx of [x0 + 150, x0 + 330]) {
      plaster(c, dx - 30, F - 346, 60, 50, rng);
      windowBox(c, b, dx - 15, F - 336, 30, 32, { lit: dx < x0 + 200, rng });
      gableRoof(c, dx - 34, dx + 34, F - 344, dx, F - 382, 10, rng);
    }
    // 2층 (내닫이) 회반죽 + 목골조
    plaster(c, x0 - 12, top, x1 - x0 + 24, gf - top, rng, '#4b4353');
    const cols = 8;
    for (let i = 0; i <= cols; i++) post(c, x0 - 12 + ((x1 - x0 + 24 - 9) * i) / cols, top, 9, gf - top);
    rail(c, x0 - 12, top, x1 - x0 + 24, 9); rail(c, x0 - 12, top + 58, x1 - x0 + 24, 7);
    for (let i = 0; i < cols; i++) {
      const a = x0 - 12 + ((x1 - x0 + 15) * i) / cols + 9, bb = x0 - 12 + ((x1 - x0 + 15) * (i + 1)) / cols;
      if (i % 2 === 0) { brace(c, a, top + 65, bb, gf - 4); brace(c, bb, top + 65, a, gf - 4); }
      else brace(c, a, top + 9, bb, top + 58);
    }
    // 2층 창문
    const wins = [[x0 + 30, true], [x0 + 150, false], [x0 + 275, true], [x0 + 440, true]];
    for (const [wx, lit] of wins) windowBox(c, b, wx, top + 70, 34, 42, { lit, shutters: true, box: !lit || wx < x0 + 100, rng });
    // 내닫이 들보 + 까치발
    rail(c, x0 - 16, gf - 8, x1 - x0 + 32, 12);
    for (let i = 0; i <= 6; i++) {
      const bx = x0 + ((x1 - x0) * i) / 6;
      c.fillStyle = P.timber; poly(c, [bx - 5, gf + 4, bx + 5, gf + 4, bx + 5, gf + 22, bx - 5, gf + 8]); c.fill();
    }
    // 1층: 벽 + 기단 석재
    plaster(c, x0, gf + 4, x1 - x0, F - 56 - gf - 4, rng, '#423b48');
    post(c, x0, gf + 4, 10, F - gf); post(c, x1 - 10, gf + 4, 10, F - gf);
    stones(c, x0, F - 56, x1 - x0, 56, rng);
    // 1층 큰 창 (선술집)
    windowBox(c, b, x0 + 34, gf + 22, 70, 50, { lit: true, rng, panes: 2 });
    windowBox(c, b, x0 + 128, gf + 22, 70, 50, { lit: true, rng, panes: 2 });
    windowBox(c, b, x1 - 110, gf + 22, 70, 50, { lit: true, rng, panes: 2, color: '#ff9a4a' });
    // 발코니 문 (2층, 발판 뒤)
    // 문
    doorway(c, dcx, F, 58, 100, { style: 'arch', wood: '#3a2014', rng });
    lanternBracket(c, b, dcx - 48, F - 104, -1); lanternBracket(c, b, dcx + 48, F - 104, 1);
    // 발코니 난간 (발판 y = F-144 위)
    const bx0 = 9 * TILE, bx1 = 13 * TILE;
    c.fillStyle = P.timberLo; c.fillRect(bx0, gf - 40, bx1 - bx0, 6);
    for (let x = bx0 + 4; x < bx1; x += 12) { c.fillStyle = hgrad(c, x, x + 5, P.timberHi, P.timberLo); c.fillRect(x, gf - 36, 5, 34); }
    c.fillStyle = 'rgba(169,194,255,0.4)'; c.fillRect(bx0, gf - 40, bx1 - bx0, 1.2);
    // 외곽선 + 우측 역광
    c.strokeStyle = P.ol; c.lineWidth = 2.5; c.strokeRect(x0 - 12, top, x1 - x0 + 24, gf - top); c.strokeRect(x0, gf, x1 - x0, F - gf);
    c.fillStyle = 'rgba(169,194,255,0.35)'; c.fillRect(x1 + 10, top, 2, gf - top);
    b._sign = { hx: x0 + 132, hy: gf + 12, w: 150, h: 50, icon: 'cat', phase: 0.3 };
    b._chim = { x: x1 - 92, y: F - 440 };
  },

  shop(c, b, rng) {
    const x0 = b.x0, x1 = b.x1, dcx = b.door * TILE + 24, mid = (x0 + x1) / 2 + 20;
    const gf = F - 188;
    // 박공 벽
    c.save(); poly(c, [x0, gf, mid, F - 336, x1, gf]); c.clip();
    plaster(c, x0, F - 340, x1 - x0, 160, rng, '#473f50');
    post(c, mid - 5, F - 336, 10, 150);
    brace(c, mid - 5, F - 250, x0 + 60, gf); brace(c, mid + 5, F - 250, x1 - 60, gf);
    rail(c, x0, F - 250, x1 - x0, 7);
    c.restore();
    // 둥근 창
    c.fillStyle = P.timberLo; c.beginPath(); c.arc(mid, F - 282, 25, 0, TAU); c.fill();
    const gg = c.createRadialGradient(mid, F - 282, 2, mid, F - 282, 22); gg.addColorStop(0, P.warmHi); gg.addColorStop(0.6, P.warm); gg.addColorStop(1, '#8a4a1a');
    c.fillStyle = gg; c.beginPath(); c.arc(mid, F - 282, 20, 0, TAU); c.fill();
    c.strokeStyle = P.timber; c.lineWidth = 3; c.beginPath(); c.moveTo(mid - 20, F - 282); c.lineTo(mid + 20, F - 282); c.moveTo(mid, F - 302); c.lineTo(mid, F - 262); c.stroke();
    b._win.push({ x: mid, y: F - 282, r: 30, c: P.warm });
    windowBox(c, b, x0 + 44, F - 238, 30, 36, { lit: false, shutters: true, rng });
    windowBox(c, b, x1 - 74, F - 238, 30, 36, { lit: true, shutters: true, rng });
    gableRoof(c, x0 - 6, x1 + 6, gf + 2, mid, F - 346, 16, rng);
    // 1층
    plaster(c, x0, gf, x1 - x0, F - 40 - gf, rng, '#3e3748');
    post(c, x0, gf, 11, F - gf); post(c, x1 - 11, gf, 11, F - gf); rail(c, x0, gf, x1 - x0, 10);
    stones(c, x0, F - 40, x1 - x0, 40, rng);
    // 진열창 (물약 선반)
    for (const [wx, ww] of [[x0 + 26, 118], [dcx + 50, x1 - dcx - 78]]) {
      windowBox(c, b, wx, F - 150, ww, 82, { lit: true, panes: 1, rng, color: '#ffa850' });
      for (let s = 0; s < 2; s++) {
        const sy = F - 150 + 36 + s * 34;
        c.fillStyle = '#2a1a10'; c.fillRect(wx + 3, sy, ww - 6, 3);
        for (let k = 0; k < ww / 14 - 1; k++) {
          const bx = wx + 10 + k * 14 + rng.range(-2, 2), bh = rng.range(10, 18);
          const col = rng.pick(['#e02a3a', '#3a7aff', '#40d060', '#b060ff', '#ffc040']);
          c.fillStyle = rgba(col, 0.9); c.beginPath(); c.ellipse(bx, sy - bh * 0.35, 4.5, bh * 0.4, 0, 0, TAU); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(bx - 2.5, sy - bh * 0.55, 1.5, 3);
          c.fillStyle = '#2a1a10'; c.fillRect(bx - 1.5, sy - bh * 0.8 - 3, 3, 4);
        }
      }
    }
    doorway(c, dcx, F, 54, 104, { style: 'square', wood: '#2a1a26', rng });
    lanternBracket(c, b, dcx + 40, F - 112, 1);
    // 차양 (줄무늬)
    const ay0 = gf + 14, ay1 = gf + 52;
    for (let i = 0, x = x0 + 8; x < x1 - 8; i++, x += 22) {
      const w = Math.min(22, x1 - 8 - x);
      c.fillStyle = i % 2 ? '#e8dcc0' : '#8a1426';
      poly(c, [x, ay0, x + w, ay0, x + w + 4, ay1, x + 4, ay1]); c.fill();
      c.fillStyle = vgrad(c, ay0, ay1, 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.4)'); poly(c, [x, ay0, x + w, ay0, x + w + 4, ay1, x + 4, ay1]); c.fill();
      c.fillStyle = i % 2 ? '#d8ccb0' : '#7a1020';
      c.beginPath(); c.arc(x + 4 + w / 2, ay1, w / 2, 0, Math.PI); c.fill();
    }
    c.fillStyle = P.timberLo; c.fillRect(x0 + 4, ay0 - 4, x1 - x0 - 8, 5);
    c.strokeStyle = P.ol; c.lineWidth = 2.5; c.strokeRect(x0, gf, x1 - x0, F - gf);
    c.fillStyle = 'rgba(169,194,255,0.35)'; c.fillRect(x1 - 2, gf, 2, F - gf);
    b._sign = { hx: x1 - 40, hy: gf - 6, w: 164, h: 48, icon: 'bag', phase: 1.7, dir: 1 };
  },

  board(c, b, rng) {
    const cx = b.door * TILE + 24, bw = 190, bh = 110, by = F - 46;
    // 기둥
    for (const px of [cx - bw / 2 - 4, cx + bw / 2 - 8]) post(c, px, by - bh - 44, 12, bh + 90);
    // 판
    c.fillStyle = vgrad(c, by - bh, by, '#4a3020', '#24160c'); c.fillRect(cx - bw / 2, by - bh, bw, bh);
    for (let y = by - bh + 12; y < by; y += 13) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(cx - bw / 2, y, bw, 1.5); }
    c.strokeStyle = '#140a06'; c.lineWidth = 4; c.strokeRect(cx - bw / 2, by - bh, bw, bh);
    c.strokeStyle = 'rgba(232,200,114,0.5)'; c.lineWidth = 1; c.strokeRect(cx - bw / 2 + 4, by - bh + 4, bw - 8, bh - 8);
    // 붙은 종이들
    const papers = [[-70, -92, 36, 44, -0.08], [-24, -98, 40, 50, 0.05], [26, -90, 34, 40, -0.04], [62, -96, 30, 38, 0.1], [-58, -40, 44, 30, 0.03], [0, -44, 38, 34, -0.06], [48, -40, 40, 30, 0.07]];
    for (const [px, py, pw, ph, rot] of papers) {
      c.save(); c.translate(cx + px, by + py + ph / 2); c.rotate(rot);
      c.fillStyle = vgrad(c, -ph / 2, ph / 2, '#e8dcbc', '#b8a880'); c.fillRect(-pw / 2, -ph / 2, pw, ph);
      c.fillStyle = 'rgba(60,40,20,0.55)';
      for (let l = 0; l < ph / 7 - 1; l++) c.fillRect(-pw / 2 + 5, -ph / 2 + 8 + l * 6, pw * rng.range(0.4, 0.8), 1.5);
      c.fillStyle = '#8a1426'; c.beginPath(); c.arc(0, -ph / 2 + 3, 2.2, 0, TAU); c.fill();
      c.restore();
    }
    // 작은 지붕
    roofSlab(c, cx - bw / 2 - 26, cx + bw / 2 + 26, by - bh - 30, by - bh - 62, 22, rng);
    lanternBracket(c, b, cx + bw / 2 + 16, by - bh - 4, 1);
    b._label = { x: cx, y: by - bh - 38 };
  },

  smith(c, b, rng) {
    const x0 = b.x0, x1 = b.x1, dcx = b.door * TILE + 24, split = x0 + 300;
    // 굴뚝
    chimney(c, x1 - 90, F - 410, 44, F - 250, rng);
    // 석조 본채
    roofSlab(c, x0 - 24, split + 20, F - 238, F - 316, 50, rng);
    stones(c, x0, F - 240, split - x0, 240, rng, '#3a343e');
    windowBox(c, b, x0 + 36, F - 196, 40, 46, { lit: true, rng, arch: true, color: '#ff8a3a' });
    windowBox(c, b, split - 76, F - 210, 36, 40, { lit: false, arch: true, rng });
    // 차양(발판 위치 F-144)
    const cx0 = 39 * TILE - 6, cx1 = 42 * TILE + 6;
    roofSlab(c, cx0 - 8, cx1 + 8, F - 144 + 10, F - 144 - 12, 6, rng, '#3a2e2a');
    for (const px of [cx0 + 2, cx1 - 8]) { c.fillStyle = P.timber; poly(c, [px, F - 136, px + 6, F - 136, px + 6, F - 110, px, F - 128]); c.fill(); }
    doorway(c, dcx, F, 56, 100, { style: 'arch', wood: '#2e1c12', stone: '#3a343e', rng });
    // 대장간 작업장 (열린 헛간)
    c.fillStyle = vgrad(c, F - 230, F, '#1a0e0a', '#0a0604'); c.fillRect(split, F - 226, x1 - split, 226);
    // 뒷벽 벽돌 + 걸린 무기
    stones(c, split, F - 226, x1 - split, 226, rng, '#2a1c1a', { rowH: [10, 14], bw: [18, 30] });
    c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(split, F - 226, x1 - split, 226);
    const hang = [['sword', split + 34], ['axe', split + 64], ['sword', split + 94], ['spear', split + 122], ['axe', split + 150]];
    for (const [k, hx] of hang) {
      c.strokeStyle = '#3a3440'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(hx, F - 216); c.lineTo(hx, F - 204); c.stroke();
      c.fillStyle = '#8a8e9a';
      if (k === 'sword') { c.fillRect(hx - 2, F - 204, 4, 64); c.fillStyle = '#c8a040'; c.fillRect(hx - 8, F - 196, 16, 3); c.fillStyle = '#3a2418'; c.fillRect(hx - 1.5, F - 204, 3, 8); }
      else if (k === 'axe') { c.fillStyle = '#5a3a24'; c.fillRect(hx - 1.5, F - 204, 3, 58); c.fillStyle = '#9a9aa6'; c.beginPath(); c.moveTo(hx, F - 196); c.quadraticCurveTo(hx + 20, F - 190, hx + 16, F - 170); c.lineTo(hx, F - 176); c.fill(); }
      else { c.fillStyle = '#5a3a24'; c.fillRect(hx - 1.5, F - 204, 3, 80); c.fillStyle = '#9a9aa6'; poly(c, [hx, F - 214, hx + 5, F - 200, hx - 5, F - 200]); c.fill(); }
      c.fillStyle = 'rgba(255,140,60,0.35)'; c.fillRect(hx + 1, F - 204, 1, 50);
    }
    // 화덕 (벽돌)
    const fx = x1 - 70;
    stones(c, fx - 44, F - 96, 88, 96, rng, '#5a3a30', { rowH: [9, 12], bw: [14, 22] });
    c.fillStyle = '#0a0404'; c.beginPath(); c.moveTo(fx - 26, F - 30); c.lineTo(fx - 26, F - 60); c.arc(fx, F - 60, 26, Math.PI, 0); c.lineTo(fx + 26, F - 30); c.closePath(); c.fill();
    c.fillStyle = '#3a2a24'; poly(c, [fx - 50, F - 96, fx + 50, F - 96, fx + 26, F - 150, fx - 26, F - 150]); c.fill();
    c.strokeStyle = P.ol; c.lineWidth = 2; poly(c, [fx - 50, F - 96, fx + 50, F - 96, fx + 26, F - 150, fx - 26, F - 150]); c.stroke();
    // 모루 (나무 그루터기 위)
    const ax = split + 74;
    c.fillStyle = hgrad(c, ax - 16, ax + 16, '#4a3020', '#1e120a'); c.fillRect(ax - 16, F - 34, 32, 34);
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(ax - 12 + i * 8, F - 32); c.lineTo(ax - 13 + i * 8, F); c.stroke(); }
    c.fillStyle = vgrad(c, F - 58, F - 34, '#6a6878', '#1e1c24');
    c.beginPath(); c.moveTo(ax - 40, F - 56); c.quadraticCurveTo(ax - 22, F - 58, ax - 18, F - 60); c.lineTo(ax + 26, F - 60); c.lineTo(ax + 28, F - 50);
    c.lineTo(ax + 12, F - 46); c.quadraticCurveTo(ax + 8, F - 40, ax + 14, F - 34); c.lineTo(ax - 14, F - 34); c.quadraticCurveTo(ax - 8, F - 40, ax - 12, F - 46); c.quadraticCurveTo(ax - 28, F - 48, ax - 40, F - 56); c.closePath(); c.fill();
    c.strokeStyle = P.ol; c.lineWidth = 2; c.stroke();
    c.fillStyle = 'rgba(255,170,90,0.6)'; c.fillRect(ax - 18, F - 60, 44, 1.5);
    c.fillStyle = 'rgba(169,194,255,0.4)'; c.fillRect(ax + 24, F - 58, 1.5, 8);
    // 물통 + 집게
    c.fillStyle = vgrad(c, F - 26, F, '#3a2a1c', '#1a100a'); c.fillRect(ax + 34, F - 26, 30, 26);
    c.fillStyle = 'rgba(80,120,160,0.5)'; c.fillRect(ax + 36, F - 24, 26, 4);
    c.strokeStyle = '#2a2830'; c.lineWidth = 2; c.beginPath(); c.moveTo(ax + 42, F - 40); c.lineTo(ax + 50, F - 22); c.moveTo(ax + 48, F - 40); c.lineTo(ax + 46, F - 22); c.stroke();
    // 헛간 기둥 + 경사 지붕
    for (const px of [split, x1 - 12]) post(c, px, F - 230, 12, 230);
    roofSlab(c, split - 10, x1 + 22, F - 222, F - 262, 8, rng, '#2e2a34');
    stones(c, split - 14, F - 240, 16, 240, rng, '#3a343e');
    c.strokeStyle = P.ol; c.lineWidth = 2.5; c.strokeRect(x0, F - 240, split - x0, 240);
    c.fillStyle = 'rgba(169,194,255,0.35)'; c.fillRect(x1 - 1, F - 222, 2, 222);
    b._sign = { hx: split - 6, hy: F - 190, w: 176, h: 48, icon: 'anvil', phase: 2.6, dir: 1 };
    b._forge = { x: fx, y: F - 44 };
    b._anvil = { x: ax, y: F - 60 };
    b._chim = { x: x1 - 68, y: F - 420, sparks: true };
  },

  church(c, b, rng) {
    const x0 = b.x0, x1 = b.x1, dcx = b.door * TILE + 24;
    const nx0 = dcx - 200, nx1 = dcx + 200, wallTop = F - 262, peak = F - 360;
    const st = P.cstone;
    // 오른쪽 측랑
    stones(c, nx1, F - 190, x1 - nx1, 190, rng, shade(st, -0.08));
    roofSlab(c, nx1 - 4, x1 + 14, F - 188, F - 226, 0, rng, '#22202e');
    for (const wx of [nx1 + 22, nx1 + 58]) windowBox(c, b, wx, F - 150, 20, 64, { lit: true, arch: true, rng, color: '#8a6aff' });
    // 본당 파사드
    stones(c, nx0, wallTop, nx1 - nx0, F - wallTop, rng, st, { rowH: [15, 20], bw: [28, 44] });
    c.save(); poly(c, [nx0, wallTop + 2, dcx, peak, nx1, wallTop + 2]); c.clip();
    stones(c, nx0, peak, nx1 - nx0, wallTop - peak + 4, rng, st, { rowH: [15, 20], bw: [28, 44] });
    c.restore();
    // 박공 테두리
    c.strokeStyle = shade(st, 0.2); c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(nx0 - 12, wallTop + 6); c.lineTo(dcx, peak - 6); c.lineTo(nx1 + 12, wallTop + 6); c.stroke();
    c.strokeStyle = 'rgba(169,194,255,0.5)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(dcx, peak - 10); c.lineTo(nx1 + 14, wallTop + 2); c.stroke();
    // 꼭대기 십자가
    c.fillStyle = P.gold; c.fillRect(dcx - 3, peak - 44, 6, 36); c.fillRect(dcx - 13, peak - 34, 26, 6);
    // 부벽
    for (const bx of [nx0 - 6, nx1 - 18]) {
      stones(c, bx, F - 230, 24, 230, rng, shade(st, 0.06));
      c.fillStyle = shade(st, 0.1); poly(c, [bx, F - 230, bx + 24, F - 230, bx + 12, F - 262]); c.fill();
      c.strokeStyle = P.ol; c.lineWidth = 2; c.strokeRect(bx, F - 230, 24, 230);
    }
    // 장미창 (색유리는 실시간 광채로)
    const rx = dcx, ry = F - 262, rr = 42;
    c.fillStyle = shade(st, 0.18); c.beginPath(); c.arc(rx, ry, rr + 9, 0, TAU); c.fill();
    c.strokeStyle = P.ol; c.lineWidth = 2; c.stroke();
    const cols = ['#c01830', '#2a4aff', '#e8b030', '#1a9a5a', '#8a2ad0', '#e8e0d0'];
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
      c.fillStyle = cols[i % cols.length];
      c.beginPath(); c.moveTo(rx, ry); c.arc(rx, ry, rr, a0, a1); c.closePath(); c.fill();
    }
    c.fillStyle = '#ffe7a0'; c.beginPath(); c.arc(rx, ry, rr * 0.3, 0, TAU); c.fill();
    c.strokeStyle = '#1a1622'; c.lineWidth = 3;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.beginPath(); c.moveTo(rx + Math.cos(a) * rr * 0.3, ry + Math.sin(a) * rr * 0.3); c.lineTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr); c.stroke(); }
    c.beginPath(); c.arc(rx, ry, rr * 0.3, 0, TAU); c.stroke(); c.beginPath(); c.arc(rx, ry, rr * 0.68, 0, TAU); c.stroke(); c.beginPath(); c.arc(rx, ry, rr, 0, TAU); c.stroke();
    b._rose = { x: rx, y: ry, r: rr };
    // 첨두 창
    for (const wx of [nx0 + 40, nx1 - 70]) windowBox(c, b, wx, F - 210, 30, 110, { lit: true, arch: true, rng, color: '#ff9a50' });
    // 명판 자리 + 정문
    c.fillStyle = vgrad(c, F - 196, F - 172, '#3a3848', '#1a1822'); c.fillRect(dcx - 70, F - 198, 140, 26);
    c.strokeStyle = P.gold; c.lineWidth = 1.5; c.strokeRect(dcx - 68, F - 196, 136, 22);
    doorway(c, dcx, F, 76, 128, { style: 'double', wood: '#3a1a14', stone: shade(st, 0.12), rng });
    lanternBracket(c, b, dcx - 64, F - 110, -1); lanternBracket(c, b, dcx + 64, F - 110, 1);
    c.strokeStyle = P.ol; c.lineWidth = 2.5; c.strokeRect(nx0, wallTop, nx1 - nx0, F - wallTop);
    // 종탑 (왼쪽)
    const tx0 = x0 + 12, tx1 = nx0 - 6, tTop = F - 334;
    stones(c, tx0, tTop, tx1 - tx0, F - tTop, rng, shade(st, 0.04), { rowH: [15, 20], bw: [24, 36] });
    // 종루 개구부
    const bcx = (tx0 + tx1) / 2;
    c.fillStyle = '#07050c'; c.beginPath(); c.moveTo(bcx - 26, tTop + 90); c.lineTo(bcx - 26, tTop + 40); c.quadraticCurveTo(bcx - 26, tTop + 14, bcx, tTop + 10); c.quadraticCurveTo(bcx + 26, tTop + 14, bcx + 26, tTop + 40); c.lineTo(bcx + 26, tTop + 90); c.closePath(); c.fill();
    c.strokeStyle = shade(st, 0.25); c.lineWidth = 3; c.stroke();
    b._bell = { x: bcx, y: tTop + 34 };
    windowBox(c, b, bcx - 11, F - 200, 22, 56, { lit: false, arch: true, rng });
    // 첨탑
    const sp0 = tx0 - 8, sp1 = tx1 + 8;
    stones(c, sp0, tTop - 10, sp1 - sp0, 14, rng, shade(st, 0.15));
    c.save(); poly(c, [sp0 + 4, tTop - 10, bcx, F - 472, sp1 - 4, tTop - 10]); c.clip();
    c.fillStyle = hgrad(c, sp0, sp1, '#1a1a2a', '#3a3c58'); c.fillRect(sp0, F - 480, sp1 - sp0, 160);
    for (let y = F - 470; y < tTop; y += 10) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(sp0, y, sp1 - sp0, 1.5); }
    c.restore();
    c.strokeStyle = P.ol; c.lineWidth = 2; poly(c, [sp0 + 4, tTop - 10, bcx, F - 472, sp1 - 4, tTop - 10]); c.stroke();
    c.strokeStyle = 'rgba(169,194,255,0.6)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(bcx + 1, F - 470); c.lineTo(sp1 - 4, tTop - 11); c.stroke();
    c.fillStyle = P.gold; c.fillRect(bcx - 2, F - 484, 4, 16); c.fillRect(bcx - 7, F - 480, 14, 3.5);
    c.strokeStyle = P.ol; c.lineWidth = 2.5; c.strokeRect(tx0, tTop, tx1 - tx0, F - tTop);
    b._plaque = { x: dcx, y: F - 180 };
  },

  house(c, b, rng) {
    const x0 = b.x0 + 20, x1 = b.x1 - 20, mid = (x0 + x1) / 2, gf = F - 150;
    chimney(c, x0 + 40, F - 330, 26, F - 250, rng);
    c.save(); poly(c, [x0, F - 260, mid, F - 322, x1, F - 260]); c.clip();
    plaster(c, x0, F - 330, x1 - x0, 80, rng, '#403a4a'); c.restore();
    plaster(c, x0 - 8, F - 262, x1 - x0 + 16, 112, rng, '#443d4d');
    for (let i = 0; i <= 5; i++) post(c, x0 - 8 + ((x1 - x0 + 7) * i) / 5, F - 262, 8, 112);
    rail(c, x0 - 8, F - 262, x1 - x0 + 16, 7);
    for (let i = 0; i < 5; i++) { const a = x0 - 8 + ((x1 - x0 + 7) * i) / 5 + 8, bb = x0 - 8 + ((x1 - x0 + 7) * (i + 1)) / 5; if (i % 2) brace(c, a, F - 255, bb, gf - 4); else brace(c, bb, F - 255, a, gf - 4); }
    windowBox(c, b, x0 + 46, F - 236, 30, 40, { lit: true, shutters: true, box: true, rng });
    windowBox(c, b, x1 - 76, F - 236, 30, 40, { lit: false, shutters: true, rng });
    gableRoof(c, x0 - 8, x1 + 8, F - 258, mid, F - 334, 14, rng);
    rail(c, x0 - 12, gf - 6, x1 - x0 + 24, 10);
    plaster(c, x0, gf + 4, x1 - x0, F - 34 - gf - 4, rng, '#3a3444');
    stones(c, x0, F - 34, x1 - x0, 34, rng);
    doorway(c, mid + 40, F, 46, 90, { style: 'arch', wood: '#3a2a1a', rng });
    windowBox(c, b, x0 + 30, F - 126, 50, 42, { lit: true, rng, box: true });
    c.strokeStyle = P.ol; c.lineWidth = 2.5; c.strokeRect(x0 - 8, F - 262, x1 - x0 + 16, 112); c.strokeRect(x0, gf, x1 - x0, F - gf);
    c.fillStyle = 'rgba(169,194,255,0.35)'; c.fillRect(x1 + 6, F - 262, 2, 112);
  },

  gate(c, b, rng) {
    const cx = b.door * TILE + 24, ow = 150, oh = 196;
    const lt0 = cx - ow / 2 - 100, lt1 = cx - ow / 2, rt0 = cx + ow / 2, rt1 = cx + ow / 2 + 100;
    // 성벽 몸체 (가운데 아치 위)
    c.save(); c.beginPath(); c.rect(lt1, F - 262, rt0 - lt1, 262);
    c.moveTo(cx - ow / 2, F); c.lineTo(cx - ow / 2, F - oh + ow / 2); c.arc(cx, F - oh + ow / 2, ow / 2, Math.PI, 0, false); c.lineTo(cx + ow / 2, F); c.closePath();
    c.clip('evenodd');
    stones(c, lt1, F - 262, rt0 - lt1, 262, rng, '#363342');
    c.restore();
    for (let x = lt1; x < rt0; x += 28) stones(c, x + 3, F - 282, 18, 22, rng, '#363342');
    // 내리닫이 창살(올려진 상태) 끝
    c.fillStyle = '#16121a';
    for (let x = cx - ow / 2 + 8; x < cx + ow / 2 - 4; x += 14) { c.fillRect(x, F - oh + 6, 4, 24); poly(c, [x - 1, F - oh + 30, x + 5, F - oh + 30, x + 2, F - oh + 40]); c.fill(); }
    c.fillRect(cx - ow / 2 + 4, F - oh + 14, ow - 8, 4);
    // 아치 테두리
    c.strokeStyle = '#4c4858'; c.lineWidth = 10; c.beginPath(); c.moveTo(cx - ow / 2 - 4, F); c.lineTo(cx - ow / 2 - 4, F - oh + ow / 2); c.arc(cx, F - oh + ow / 2, ow / 2 + 4, Math.PI, 0); c.lineTo(cx + ow / 2 + 4, F); c.stroke();
    c.strokeStyle = P.ol; c.lineWidth = 2; c.beginPath(); c.arc(cx, F - oh + ow / 2, ow / 2 + 9, Math.PI, 0); c.stroke();
    // 쐐기돌 + 문장
    c.fillStyle = '#5c586a'; poly(c, [cx - 12, F - oh - 8, cx + 12, F - oh - 8, cx + 9, F - oh + 14, cx - 9, F - oh + 14]); c.fill();
    c.fillStyle = '#8a1426'; c.beginPath(); c.moveTo(cx - 22, F - 250); c.lineTo(cx + 22, F - 250); c.lineTo(cx + 22, F - 222); c.quadraticCurveTo(cx, F - 204, cx - 22, F - 222); c.closePath(); c.fill();
    c.strokeStyle = P.gold; c.lineWidth = 2; c.stroke();
    c.fillStyle = P.gold; c.fillRect(cx - 2, F - 246, 4, 30); c.fillRect(cx - 10, F - 238, 20, 4);
    // 양쪽 탑
    for (const [a, z] of [[lt0, lt1], [rt0, rt1]]) {
      stones(c, a, F - 330, z - a, 330, rng, '#383544', { rowH: [16, 21], bw: [26, 40] });
      for (let x = a - 6; x < z + 6; x += 26) stones(c, x, F - 354, 17, 26, rng, '#383544');
      stones(c, a - 8, F - 334, z - a + 16, 10, rng, '#46424f');
      c.fillStyle = '#07050a'; c.fillRect((a + z) / 2 - 4, F - 280, 8, 34); c.fillRect((a + z) / 2 - 4, F - 190, 8, 30);
      c.strokeStyle = P.ol; c.lineWidth = 2.5; c.strokeRect(a, F - 330, z - a, 330);
      c.fillStyle = 'rgba(169,194,255,0.4)'; c.fillRect(z - 2, F - 354, 2, 354);
    }
    // 오른쪽 성벽 이어짐
    stones(c, rt1, F - 240, b.x1 - rt1 + 40, 240, rng, '#312e3a');
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(rt1, F - 240, b.x1 - rt1 + 40, 240);
    // 횃불 받침
    b._torch = [{ x: lt1 - 22, y: F - 150 }, { x: rt0 + 22, y: F - 150 }];
    for (const t of b._torch) { c.fillStyle = '#1a1418'; c.fillRect(t.x - 3, t.y, 6, 26); poly(c, [t.x - 9, t.y, t.x + 9, t.y, t.x + 5, t.y + 8, t.x - 5, t.y + 8]); c.fill(); }
    // 이정표
    const sx = lt0 - 50;
    post(c, sx - 4, F - 120, 8, 120);
    c.fillStyle = vgrad(c, F - 116, F - 88, '#6a4a2a', '#3a2414'); poly(c, [sx - 40, F - 116, sx + 44, F - 116, sx + 60, F - 102, sx + 44, F - 88, sx - 40, F - 88]); c.fill();
    c.strokeStyle = P.ol; c.lineWidth = 2; c.stroke();
    b._arch = { cx, ow, oh };
    b._post = { x: sx + 8, y: F - 97 };
  },
};

// ───────────────────────── 굽기 ─────────────────────────
const baked = new Map();
let bakeScale = 1;
export function setFacadeScale(s) {
  s = clamp(Math.round(s * 4) / 4, 1, 1.5);
  if (s !== bakeScale) { bakeScale = s; baked.clear(); }
}
function getBaked(b) {
  let e = baked.get(b.id);
  if (e) return e;
  const H = HEIGHT[b.kind] ?? 360;
  const x = b.x0 - PAD, y = F - H, w = b.x1 - b.x0 + PAD * 2, h = H + 8;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * bakeScale); cv.height = Math.ceil(h * bakeScale);
  const c = cv.getContext('2d');
  c.scale(bakeScale, bakeScale); c.translate(-x, -y);
  c.lineJoin = 'round';
  b._win = []; b._lan = [];
  try { PAINT[b.kind]?.(c, b, new RNG(hashStr(b.id + ':facade'))); } catch (err) { console.error('[facade]', b.id, err); }
  // 밤 색보정: 칠해진 픽셀만 남청색으로 눌러 원경(Kling 그림)과 톤을 맞춘다. 위쪽은 달빛이 남도록 덜 어둡게.
  c.save();
  c.globalCompositeOperation = 'source-atop';
  const ng = c.createLinearGradient(0, y, 0, y + h);
  ng.addColorStop(0, 'rgba(14,12,34,0.12)'); ng.addColorStop(0.6, 'rgba(12,8,26,0.26)'); ng.addColorStop(1, 'rgba(8,4,14,0.4)');
  c.fillStyle = ng; c.fillRect(x, y, w, h);
  c.restore();
  e = { cv, x, y, w, h };
  baked.set(b.id, e);
  return e;
}
/** 미리 굽기 (장면 진입 시) */
export function prebakeFacades() { for (const b of BUILDINGS) getBaked(b); }

// ───────────────────────── 실시간 오버레이 ─────────────────────────
function flicker(t, k) { return 0.82 + Math.sin(t * 7.3 + k * 1.7) * 0.07 + Math.sin(t * 13.1 + k * 3.3) * 0.05; }

function drawFlame(ctx, x, y, s, t, k = 0) {
  const f = 1 + Math.sin(t * 21 + k) * 0.12 + Math.sin(t * 34 + k * 2) * 0.06;
  ctx.fillStyle = '#ff7a2a'; ctx.beginPath(); ctx.ellipse(x, y - 6 * s * f, 4.5 * s, 10 * s * f, Math.sin(t * 3 + k) * 0.08, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffe6a8'; ctx.beginPath(); ctx.ellipse(x, y - 4 * s * f, 2.2 * s, 5.5 * s * f, 0, 0, TAU); ctx.fill();
}

const ICON = {
  cat(c, x, y, s, t) {
    // 초승달 위에 앉은 검은 고양이 (꼬리 흔들림)
    c.fillStyle = P.gold;
    c.beginPath(); c.arc(x, y, 15 * s, 0.6, TAU - 0.6); c.arc(x + 6 * s, y - 2 * s, 12 * s, TAU - 0.9, 0.9, true); c.closePath(); c.fill();
    c.fillStyle = '#0a060c';
    c.beginPath(); c.ellipse(x - 1 * s, y - 2 * s, 7 * s, 9 * s, 0, 0, TAU); c.fill();
    c.beginPath(); c.arc(x - 1 * s, y - 13 * s, 5.5 * s, 0, TAU); c.fill();
    poly(c, [x - 6 * s, y - 16 * s, x - 5 * s, y - 23 * s, x - 1 * s, y - 17 * s]); c.fill();
    poly(c, [x + 4 * s, y - 16 * s, x + 3 * s, y - 23 * s, x - 1 * s, y - 17 * s]); c.fill();
    c.strokeStyle = '#0a060c'; c.lineWidth = 2.4 * s; c.lineCap = 'round';
    const sw = Math.sin(t * 2.2) * 5 * s;
    c.beginPath(); c.moveTo(x + 5 * s, y + 4 * s); c.quadraticCurveTo(x + 16 * s, y + 4 * s, x + 14 * s + sw * 0.4, y - 8 * s + sw * 0.3); c.stroke();
    c.fillStyle = '#ffe070'; c.fillRect(x - 4 * s, y - 14 * s, 1.6 * s, 1.6 * s); c.fillRect(x + 0.5 * s, y - 14 * s, 1.6 * s, 1.6 * s);
  },
  bag(c, x, y, s) {
    c.fillStyle = P.gold;
    c.beginPath(); c.moveTo(x - 6 * s, y - 12 * s); c.lineTo(x + 6 * s, y - 12 * s); c.lineTo(x + 3 * s, y - 7 * s);
    c.quadraticCurveTo(x + 15 * s, y - 2 * s, x + 12 * s, y + 9 * s); c.quadraticCurveTo(x, y + 14 * s, x - 12 * s, y + 9 * s); c.quadraticCurveTo(x - 15 * s, y - 2 * s, x - 3 * s, y - 7 * s); c.closePath(); c.fill();
    c.fillStyle = '#2a1408'; c.fillRect(x - 5 * s, y - 8.5 * s, 10 * s, 2 * s);
    c.font = `900 ${Math.round(11 * s)}px ${FONT.num}`; c.textAlign = 'center'; c.fillText('G', x, y + 6 * s);
  },
  anvil(c, x, y, s, t) {
    c.fillStyle = P.gold;
    c.beginPath(); c.moveTo(x - 14 * s, y - 5 * s); c.lineTo(x + 8 * s, y - 5 * s); c.quadraticCurveTo(x + 16 * s, y - 4 * s, x + 17 * s, y - 1 * s); c.lineTo(x + 5 * s, y + 2 * s);
    c.lineTo(x + 5 * s, y + 6 * s); c.lineTo(x + 10 * s, y + 10 * s); c.lineTo(x - 10 * s, y + 10 * s); c.lineTo(x - 5 * s, y + 6 * s); c.lineTo(x - 5 * s, y + 2 * s); c.lineTo(x - 14 * s, y); c.closePath(); c.fill();
    c.save(); c.translate(x + 2 * s, y - 10 * s); c.rotate(-0.7 + Math.max(0, Math.sin(t * 3)) * 0.4);
    c.fillRect(-1.5 * s, -2 * s, 3 * s, 14 * s); c.fillRect(-6 * s, -6 * s, 12 * s, 6 * s); c.restore();
  },
};

function drawSign(ctx, b, t) {
  const s = b._sign;
  if (!s) return;
  const dir = s.dir ?? -1;
  // 쇠 받침대
  ctx.strokeStyle = '#141014'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const armL = s.w * 0.5 + 16;
  ctx.beginPath(); ctx.moveTo(s.hx, s.hy); ctx.lineTo(s.hx + dir * armL, s.hy); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.hx, s.hy + 16); ctx.quadraticCurveTo(s.hx + dir * 10, s.hy + 2, s.hx + dir * armL * 0.6, s.hy); ctx.stroke();
  const px = s.hx + dir * (armL - s.w / 2 - 6);
  const ang = Math.sin(t * 1.4 + s.phase) * 0.05 + Math.sin(t * 0.63 + s.phase * 2) * 0.03;
  ctx.save(); ctx.translate(px, s.hy); ctx.rotate(ang);
  // 사슬
  ctx.strokeStyle = '#3a3440'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-s.w / 2 + 12, 0); ctx.lineTo(-s.w / 2 + 12, 10); ctx.moveTo(s.w / 2 - 12, 0); ctx.lineTo(s.w / 2 - 12, 10); ctx.stroke();
  // 판 (어두운 나무 + 금테)
  const y0 = 10, h = s.h;
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, '#4a2c1a'); g.addColorStop(1, '#1e100a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-s.w / 2, y0 + 6); ctx.quadraticCurveTo(-s.w / 2, y0, -s.w / 2 + 6, y0); ctx.lineTo(s.w / 2 - 6, y0); ctx.quadraticCurveTo(s.w / 2, y0, s.w / 2, y0 + 6);
  ctx.lineTo(s.w / 2, y0 + h - 6); ctx.quadraticCurveTo(s.w / 2, y0 + h, s.w / 2 - 6, y0 + h); ctx.lineTo(-s.w / 2 + 6, y0 + h); ctx.quadraticCurveTo(-s.w / 2, y0 + h, -s.w / 2, y0 + h - 6); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#07040a'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(232,200,114,0.75)'; ctx.lineWidth = 1.2; ctx.strokeRect(-s.w / 2 + 4, y0 + 4, s.w - 8, h - 8);
  ctx.fillStyle = 'rgba(169,194,255,0.3)'; ctx.fillRect(-s.w / 2 + 6, y0 + 1, s.w - 12, 1.2);
  ICON[s.icon]?.(ctx, -s.w / 2 + 22, y0 + h / 2 + 2, 0.95, t);
  text(ctx, b.name, (-s.w / 2 + 40 + s.w / 2 - 8) / 2, y0 + h / 2 + 7, { size: 16, weight: 800, family: FONT.title, color: '#f3d690', align: 'center', ow: 3, outline: 'rgba(10,4,2,0.95)' });
  ctx.restore();
}

function smoke(ctx, x, y, t, n = 7, col = '120,110,130', sparks = false) {
  for (let i = 0; i < n; i++) {
    const p = (t * 0.22 + i / n) % 1;
    const r = 6 + p * 26;
    ctx.fillStyle = `rgba(${col},${(1 - p) * 0.22 * Math.min(1, p * 6)})`;
    ctx.beginPath(); ctx.arc(x + Math.sin(p * 4 + i) * 8 + p * 46, y - p * 150, r, 0, TAU); ctx.fill();
  }
  if (sparks) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const p = (t * 0.7 + i * 0.137) % 1;
      ctx.fillStyle = `rgba(255,${150 + (i * 23) % 90},60,${(1 - p) * 0.9})`;
      ctx.fillRect(x + Math.sin(i * 7.7 + p * 5) * 12 + p * 30, y - p * 120, 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** 여관 앞 술통 위의 검은 고양이 「백작님」 (꼬리 흔들기 · 눈 깜빡임 · 귀 쫑긋) */
function drawCat(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y);
  const tail = Math.sin(t * 1.7) * 0.5 + Math.sin(t * 0.6) * 0.3;
  ctx.fillStyle = '#07050a'; ctx.strokeStyle = '#07050a'; ctx.lineCap = 'round';
  // 꼬리
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(8, -4); ctx.bezierCurveTo(20, -2, 22 + tail * 6, -14, 16 + tail * 10, -24 + Math.abs(tail) * 3); ctx.stroke();
  // 몸 · 가슴
  ctx.beginPath(); ctx.ellipse(2, -9, 10, 9, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-5, -14, 6, 9, -0.3, 0, TAU); ctx.fill();
  // 머리
  ctx.beginPath(); ctx.arc(-8, -25, 6.5, 0, TAU); ctx.fill();
  const tw = Math.max(0, Math.sin(t * 0.9 + 1) - 0.92) * 20;
  poly(ctx, [-14, -27, -13, -36 + tw, -9, -29]); ctx.fill();
  poly(ctx, [-6, -29, -3, -36, -2, -27]); ctx.fill();
  // 역광 테두리
  ctx.strokeStyle = 'rgba(169,194,255,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(-8, -25, 6.5, -1.9, -0.3); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(2, -9, 10, 9, 0, -1.6, -0.2); ctx.stroke();
  // 눈 (가끔 깜빡)
  const blink = (t % 4.3) < 0.13;
  if (!blink) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, -10.5, -26, 6, '#ffd84a', 0.6);
    ctx.fillStyle = '#ffe070'; ctx.fillRect(-12.2, -27, 2.2, 1.8); ctx.fillRect(-8.6, -27, 2.2, 1.8);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/** 붉은 달 앞을 스쳐 가는 박쥐 떼 (월드 좌표, 느린 패럴랙스) */
function drawBats(ctx, cam, t) {
  ctx.fillStyle = 'rgba(8,2,6,0.9)';
  for (let i = 0; i < 5; i++) {
    const period = 22 + i * 3.7;
    const u = ((t + i * 7.3) % period) / period;
    const x = cam.x + cam.vw * (1.15 - u * 1.4) + Math.sin(i * 4.1) * 60;
    const y = 40 + i * 16 + Math.sin(t * 1.3 + i) * 14 + u * 30;
    const f = Math.sin(t * 16 + i * 2) * 5, s = 0.8 + (i % 3) * 0.2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 9 * s, y - f * s); ctx.lineTo(x - 4 * s, y + 2 * s); ctx.lineTo(x, y + 4 * s); ctx.lineTo(x + 4 * s, y + 2 * s); ctx.lineTo(x + 9 * s, y - f * s); ctx.closePath(); ctx.fill();
  }
}

const LIVE = {
  inn(ctx, b, t) { smoke(ctx, b._chim.x, b._chim.y, t); drawCat(ctx, 604, F - 58, t); },
  smith(ctx, b, t) {
    smoke(ctx, b._chim.x, b._chim.y, t + 3, 8, '90,80,90', true);
    // 화덕 불꽃
    const f = b._forge, k = 0.8 + Math.sin(t * 9) * 0.1 + Math.sin(t * 23) * 0.06;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, f.x, f.y - 14, 120 * k, '#ff6a1a', 0.55);
    glow(ctx, f.x, f.y - 10, 44, '#ffd070', 0.8 * k);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(255,${120 + i * 25},40,0.8)`; const fx = f.x - 16 + i * 8; ctx.beginPath(); ctx.ellipse(fx, f.y - 14 - Math.abs(Math.sin(t * 8 + i)) * 8, 4, 10 + Math.sin(t * 11 + i * 2) * 3, 0, 0, TAU); ctx.fill(); }
    glow(ctx, b._anvil.x, b._anvil.y, 70, '#ff8a3a', 0.25 * k);
    ctx.globalCompositeOperation = 'source-over';
  },
  church(ctx, b, t) {
    const r = b._rose;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, r.x, r.y, r.r * 2.2, '#b080ff', 0.32 + Math.sin(t * 1.2) * 0.05);
    glow(ctx, r.x, r.y, r.r * 0.9, '#ffe7a0', 0.35);
    ctx.globalCompositeOperation = 'source-over';
    // 종 (살짝 흔들림)
    const bl = b._bell, a = Math.sin(t * 1.1) * 0.06;
    ctx.save(); ctx.translate(bl.x, bl.y - 16); ctx.rotate(a);
    ctx.fillStyle = '#b8903a'; ctx.beginPath(); ctx.moveTo(-5, 4); ctx.quadraticCurveTo(-7, 20, -16, 34); ctx.lineTo(16, 34); ctx.quadraticCurveTo(7, 20, 5, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,160,0.5)'; ctx.fillRect(-4, 8, 2, 22);
    ctx.fillStyle = '#6a4a1a'; ctx.fillRect(-16, 32, 32, 3);
    ctx.restore();
    text(ctx, b.name, b._plaque.x, b._plaque.y, { size: 15, weight: 800, family: FONT.title, color: '#f3d690', align: 'center', ow: 3 });
  },
  board(ctx, b, t, info) {
    text(ctx, b.name, b._label.x, b._label.y, { size: 16, weight: 800, family: FONT.title, color: '#f3d690', align: 'center', ow: 3 });
    const n = info?.boardClaim ? 2 : info?.boardNew ? 1 : 0;
    if (n) {
      const cx = b.door * TILE + 24, y = F - 238 - Math.abs(Math.sin(t * 4)) * 10;
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, y, 30, n === 2 ? '#ffd84a' : '#ff6a4a', 0.7); ctx.globalCompositeOperation = 'source-over';
      text(ctx, n === 2 ? '★' : '!', cx, y + 9, { size: 26, weight: 900, family: FONT.num, color: n === 2 ? '#ffe070' : '#ff8a6a', align: 'center', ow: 4 });
    }
  },
  gate(ctx, b, t) {
    for (let i = 0; i < b._torch.length; i++) {
      const tc = b._torch[i];
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, tc.x, tc.y - 10, 60, '#ff8a3a', 0.6 * flicker(t, i + 9));
      drawFlame(ctx, tc.x, tc.y + 2, 1.5, t, i * 3);
      ctx.globalCompositeOperation = 'source-over';
    }
    text(ctx, '성으로 가는 길 ▶', b._post.x, b._post.y + 5, { size: 13, weight: 800, family: FONT.title, color: '#f3d690', align: 'center', ow: 3 });
    // 아치 너머 안개
    const a = b._arch;
    const g = ctx.createLinearGradient(0, F - a.oh, 0, F);
    g.addColorStop(0, 'rgba(120,40,60,0)'); g.addColorStop(1, `rgba(150,60,80,${0.16 + Math.sin(t * 0.8) * 0.04})`);
    ctx.fillStyle = g; ctx.fillRect(a.cx - a.ow / 2, F - a.oh, a.ow, a.oh);
  },
};

function drawLamp(ctx, x, t, k) {
  const top = F - 170;
  ctx.fillStyle = '#141016';
  ctx.fillRect(x - 4, top + 20, 8, 150); ctx.fillRect(x - 10, F - 12, 20, 12); ctx.fillRect(x - 7, F - 30, 14, 6);
  ctx.fillStyle = 'rgba(169,194,255,0.35)'; ctx.fillRect(x + 3, top + 20, 1.2, 150);
  ctx.strokeStyle = '#141016'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, top + 26); ctx.quadraticCurveTo(x + 12, top + 10, x + 22, top + 14); ctx.stroke();
  // 등
  const lx = x + 22, ly = top + 24;
  ctx.fillStyle = '#141016'; poly(ctx, [lx - 10, ly - 8, lx + 10, ly - 8, lx + 6, ly - 14, lx - 6, ly - 14]); ctx.fill();
  ctx.fillStyle = `rgba(255,200,120,${0.85 * flicker(t, k)})`; ctx.fillRect(lx - 7, ly - 8, 14, 18);
  ctx.strokeStyle = '#141016'; ctx.lineWidth = 1.5; ctx.strokeRect(lx - 7, ly - 8, 14, 18);
  ctx.fillStyle = '#141016'; ctx.fillRect(lx - 9, ly + 10, 18, 3);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, lx, ly, 70, '#ffb45a', 0.5 * flicker(t, k));
  ctx.globalCompositeOperation = 'source-over';
}

/** 중경 레이어에서 호출: 굽힌 파사드 + 움직이는 장식 */
export function drawFacades(ctx, cam, t, info) {
  const L = cam.x - 60, R = cam.x + cam.vw + 60;
  drawBats(ctx, cam, t);
  for (const b of BUILDINGS) {
    const e = getBaked(b);
    if (e.x + e.w < L || e.x > R) continue;
    ctx.drawImage(e.cv, e.x, e.y, e.w, e.h);
    // 창문 광채 (가산 합성)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < b._win.length; i++) { const w = b._win[i]; glow(ctx, w.x, w.y, w.r * 1.2, w.c, 0.28 * flicker(t, i + b.x0)); }
    for (let i = 0; i < b._lan.length; i++) { const l = b._lan[i]; glow(ctx, l.x, l.y, 44, '#ffb45a', 0.55 * flicker(t, i * 5 + b.x0)); }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < b._lan.length; i++) { const l = b._lan[i]; drawFlame(ctx, l.x, l.y + 6, 0.6, t, i + b.x0); }
    LIVE[b.kind]?.(ctx, b, t, info);
    drawSign(ctx, b, t);
  }
  for (let i = 0; i < TOWN_LAMPS.length; i++) {
    const x = TOWN_LAMPS[i];
    if (x < L - 40 || x > R + 40) continue;
    drawLamp(ctx, x, t, i);
  }
}

/** 광원 등록 (화면 근처만) */
export function facadeLights(Lg, cam, t) {
  const L = cam.x - 200, R = cam.x + cam.vw + 200;
  for (const b of BUILDINGS) {
    if (b.x1 < L || b.x0 > R || !b._win) continue;
    for (const w of b._win) Lg.add(w.x, w.y, w.r * 2.4, '#ffb060', 0.55);
    for (const l of b._lan) Lg.add(l.x, l.y, 110, '#ffb060', 0.8);
    if (b._forge) Lg.add(b._forge.x, b._forge.y - 20, 260, '#ff7a2a', 1);
    if (b._rose) Lg.add(b._rose.x, b._rose.y, 150, '#c8a0ff', 0.7);
    if (b._torch) for (const tc of b._torch) Lg.add(tc.x, tc.y - 10, 170, '#ff9a4a', 0.9);
  }
  for (const x of TOWN_LAMPS) if (x > L && x < R) Lg.add(x + 22, F - 146, 190, '#ffb45a', 0.9);
}

/** 대장간 모루 위치 (허브에서 망치질 불꽃용) */
export function anvilPos() { const b = BUILDINGS.find((k) => k.kind === 'smith'); if (b && !b._anvil) getBaked(b); return b?._anvil ?? null; }
