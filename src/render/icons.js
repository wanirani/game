// 아이콘 그리기: Blender로 렌더한 assets/icons/<id>.png 를 우선 사용하고, 없으면 절차적 대체 아이콘.
// drawIcon(ctx, iconId, cx, cy, size, itemInstance?)  — 중심 좌표 기준
// itemInstance 가 있으면 희귀도 테두리 광채/강화 수치 오라를 덧그림.
// 절차적 대체 아이콘은 7단계(2부: <type>_7 · head/body/cloak_7 · ring/amulet_7)와 2부 중요 물품
// (wheart_1…6 세계의 심장, star_shard 별의 조각, rift_lantern 균열의 등불, dawnflower 새벽꽃)도 그린다.
import { assets } from '../core/assets.js';
import { TAU } from '../core/math.js';
import { FONT } from '../core/ui.js';

const RARITY_GLOW = ['rgba(0,0,0,0)', '#6fe07a', '#5aa8ff', '#c07cff', '#ffa640', '#ff4a5a'];

export function drawIcon(ctx, id, cx, cy, size = 40, item = null, { glow = true } = {}) {
  const img = id ? assets.get('icons/' + id) : null;   // 아이콘 id 가 없으면 'icons/undefined' 를 요청하지 않는다 (404 콘솔 오류)
  ctx.save();
  if (item && glow) {
    const lv = item.level ?? 0;
    if (lv >= 7) {
      ctx.globalCompositeOperation = 'lighter';
      const now = performance.now(), a = 0.35 + 0.15 * Math.sin(now / 180);
      if (!enhanceAura(ctx, lv, now, cx, cy, size, a)) {   // 캐시 스프라이트를 못 만든 환경에서만 그라디언트
        const col = lv >= 13 ? `hsl(${(now / 8) % 360},90%,60%)` : lv >= 10 ? '#ff7a2a' : '#8ac8ff';
        const g = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.75);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = a;
        ctx.fillStyle = g; ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (img) {
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  } else {
    fallbackIcon(ctx, id, cx, cy, size);
  }
  ctx.restore();
}

/** 아이콘 칸(슬롯) 배경 + 희귀도 테두리 */
export function drawSlot(ctx, x, y, s, item = null, { selected = false, empty = '' } = {}) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,4,10,0.85)';
  ctx.fillRect(x, y, s, s);
  const r = item?.rarity ?? 0;
  ctx.strokeStyle = selected ? '#ffe7a0' : item ? RARITY_GLOW[r] === 'rgba(0,0,0,0)' ? '#6e5530' : RARITY_GLOW[r] : '#3a2a20';
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  if (item) {
    if (r > 0 && !rarityGlow(ctx, r, x, y, s)) {   // 캐시 스프라이트를 못 만든 환경에서만 그라디언트
      const g = ctx.createRadialGradient(x + s / 2, y + s / 2, 2, x + s / 2, y + s / 2, s * 0.7);
      g.addColorStop(0, RARITY_GLOW[r] + '55'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
    }
    drawIcon(ctx, item.icon, x + s / 2, y + s / 2, s * 0.86, item);
    if (item.level > 0) {
      ctx.font = `800 ${Math.round(s * 0.26)}px ${FONT.num}`; ctx.textAlign = 'right';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText('+' + item.level, x + s - 3, y + s * 0.3);
      ctx.fillStyle = item.level >= 10 ? '#ffb040' : '#ffe7a0'; ctx.fillText('+' + item.level, x + s - 3, y + s * 0.3);
    }
    if (item.qty > 1) {
      ctx.font = `700 ${Math.round(s * 0.24)}px ${FONT.num}`; ctx.textAlign = 'right';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(item.qty, x + s - 3, y + s - 4);
      ctx.fillStyle = '#fff'; ctx.fillText(item.qty, x + s - 3, y + s - 4);
    }
    if (item.equipped) {
      ctx.fillStyle = '#e8c872'; ctx.font = `800 ${Math.round(s * 0.22)}px ${FONT.body}`; ctx.textAlign = 'left';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText('E', x + 3, y + s * 0.3); ctx.fillText('E', x + 3, y + s * 0.3);
    }
  } else if (empty) {
    ctx.fillStyle = '#4a3a30'; ctx.font = `500 ${Math.round(s * 0.22)}px ${FONT.body}`; ctx.textAlign = 'center';
    ctx.fillText(empty, x + s / 2, y + s / 2 + 4);
  }
  ctx.restore();
}

// ── 광채 스프라이트 아틀라스 (MASTER_PLAN R12 · §5.2: 가방·장비 칸마다 매 프레임 그라디언트를 두 개씩 만들지 않는다) ──
//  한 장의 캔버스에 칸(64px)을 세로로 굽는다: 희귀도 1~5 광채 · 강화 +7(푸른빛)/+10(주황빛) 오라 · +13 무지갯빛 오라 24색.
//  처음 광채가 필요할 때 한 번만 굽고, 캔버스를 만들 수 없는 환경에서는 null → 호출부가 예전 그라디언트로 그린다.
const G_CELL = 64, G_PITCH = 66, G_HUES = 24;
const G_ROW = { r1: 0, r2: 1, r3: 2, r4: 3, r5: 4, blue: 5, orange: 6 };   // 무지갯빛 h 번째 = 7 + h
let G_ATLAS;   // undefined = 아직 안 구움 · null = 못 굽는 환경
function glowAtlas() {
  if (G_ATLAS !== undefined) return G_ATLAS;
  G_ATLAS = null;
  try {
    if (typeof document === 'undefined') return null;
    const rows = 7 + G_HUES, cv = document.createElement('canvas');
    cv.width = G_CELL; cv.height = rows * G_PITCH;
    const c = cv.getContext('2d');
    if (!c) return null;
    const R = G_CELL / 2;
    const cell = (row, col, r0, alphaHex = '') => {
      const y = row * G_PITCH + R;
      const g = c.createRadialGradient(R, y, r0, R, y, R);
      g.addColorStop(0, col + alphaHex); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, row * G_PITCH, G_CELL, G_CELL);
    };
    // 희귀도 광채: 칸 중심 반지름 2 → 칸 크기×0.7 (drawSlot 의 예전 그라디언트와 같은 비율)
    for (let r = 1; r <= 5; r++) cell(G_ROW['r' + r], RARITY_GLOW[r], R * (2 / 45), '55');
    // 강화 오라: 아이콘 크기×0.1 → ×0.75 (예전 drawIcon 그라디언트와 같은 비율)
    const r0 = R * (0.1 / 0.75);
    cell(G_ROW.blue, '#8ac8ff', r0); cell(G_ROW.orange, '#ff7a2a', r0);
    for (let h = 0; h < G_HUES; h++) {
      c.fillStyle = `hsl(${(h * 360) / G_HUES},90%,60%)`;   // hsl → 캔버스가 계산한 rgb 문자열로 바꿔 쓴다
      cell(7 + h, c.fillStyle, r0);
    }
    G_ATLAS = cv;
  } catch { G_ATLAS = null; }
  return G_ATLAS;
}
/** 희귀도 광채 (칸 크기 s 의 정사각형 안). 아틀라스가 없으면 false */
function rarityGlow(ctx, r, x, y, s) {
  const A = glowAtlas();
  if (!A) return false;
  const half = (G_CELL / 2) * (0.5 / 0.7);   // 칸의 반 변 = 광채 반지름(0.7s)의 0.5/0.7
  ctx.drawImage(A, G_CELL / 2 - half, G_ROW['r' + r] * G_PITCH + G_CELL / 2 - half, half * 2, half * 2, x, y, s, s);
  return true;
}
/** 강화 오라 (+7 푸른빛 · +10 주황빛 · +13 무지갯빛 — 이웃한 두 색을 섞어 매끄럽게 돈다). 아틀라스가 없으면 false */
function enhanceAura(ctx, lv, now, cx, cy, size, a) {
  const A = glowAtlas();
  if (!A) return false;
  const d = size * 0.75, cellAt = (row, al) => {
    if (al <= 0.004) return;
    ctx.globalAlpha = al;
    ctx.drawImage(A, 0, row * G_PITCH, G_CELL, G_CELL, cx - d, cy - d, d * 2, d * 2);
  };
  if (lv >= 13) {
    const u = (((now / 8) % 360) / 360) * G_HUES, h0 = Math.floor(u) % G_HUES, w = u - Math.floor(u);
    cellAt(7 + h0, a * (1 - w)); cellAt(7 + ((h0 + 1) % G_HUES), a * w);
  } else cellAt(lv >= 10 ? G_ROW.orange : G_ROW.blue, a);
  return true;
}

// ── 절차적 대체 아이콘 ──
function fallbackIcon(ctx, id, cx, cy, s) {
  id = typeof id === 'string' ? id : String(id ?? '');   // 옛 세이브의 아이콘 없는 아이템도 회색 칸으로 그린다
  const k = s / 40;
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  const tier = parseInt(id.split('_').pop(), 10) || 1;
  const metal = ['#9a9aa0', '#c8ccd8', '#e8ecf4', '#8ab8ff', '#ffd84a', '#c040ff', '#dff4ff'][tier - 1] || '#ccc';   // 7 = 2부 (world2 §7.1)
  const pre = id.split('_')[0];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (pre) {
    case 'whip':
      ctx.strokeStyle = '#6a4424'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-14, 14); ctx.bezierCurveTo(10, 10, -12, -6, 14, -14); ctx.stroke();
      ctx.strokeStyle = metal; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-16, 16); ctx.lineTo(-10, 10); ctx.stroke();
      break;
    case 'sword': case 'greatsword': case 'dagger': {
      const L = pre === 'greatsword' ? 34 : pre === 'dagger' ? 20 : 28, W = pre === 'greatsword' ? 7 : 4;
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = metal; ctx.fillRect(-W / 2, -L / 2 - 4, W, L);
      ctx.fillStyle = '#e8c872'; ctx.fillRect(-9, L / 2 - 6, 18, 4);
      ctx.fillStyle = '#4a2a1a'; ctx.fillRect(-2, L / 2 - 2, 4, 9);
      break;
    }
    case 'gun':
      ctx.fillStyle = '#3a3038'; ctx.fillRect(-14, -6, 26, 7);
      ctx.fillStyle = metal; ctx.fillRect(-14, -6, 26, 3);
      ctx.fillStyle = '#6a4424'; ctx.save(); ctx.translate(-8, 0); ctx.rotate(0.4); ctx.fillRect(-3, 0, 7, 14); ctx.restore();
      break;
    case 'staff':
      ctx.strokeStyle = '#7a5a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-14, 16); ctx.lineTo(10, -10); ctx.stroke();
      ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(12, -12, 6, 0, TAU); ctx.fill();
      break;
    case 'body':
      ctx.fillStyle = metal; ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(14, -12); ctx.lineTo(11, 16); ctx.lineTo(-11, 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-2, -12, 4, 28);
      break;
    case 'head':
      ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(0, 2, 13, Math.PI, 0); ctx.lineTo(13, 10); ctx.lineTo(-13, 10); ctx.closePath(); ctx.fill();
      break;
    case 'cloak':
      ctx.fillStyle = ['#6a4a2a', '#2a4a8a', '#8a1a2a', '#1a1018', '#e8e0d0', '#3a1a3a', '#1a1030'][tier - 1] || '#3a1a3a';
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, -14); ctx.lineTo(16, 16); ctx.lineTo(-16, 16); ctx.closePath(); ctx.fill();
      break;
    case 'ring':
      ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 4, 10, 0, TAU); ctx.stroke();
      ctx.fillStyle = ['#aaa', '#ff3040', '#3a7aff', '#30d060', '#eee', '#ff0030', '#b060ff'][tier - 1] || '#aaa'; ctx.beginPath(); ctx.arc(0, -7, 5, 0, TAU); ctx.fill();
      break;
    case 'amulet':
      ctx.strokeStyle = '#c0a060'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -8, 12, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(0, 8, 8, 0, TAU); ctx.fill();
      break;
    case 'potion': case 'elixir': case 'antidote': {
      const col = { potion_hp: '#e02030', potion_mp: '#3070ff', potion_full: '#ffc030', elixir: '#ff60ff', antidote: '#40d060' }[id] || '#e02030';
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 5, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ddd'; ctx.fillRect(-4, -14, 8, 9);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-4, 1, 3, 0, TAU); ctx.fill();
      break;
    }
    case 'meat': case 'bread':
      ctx.fillStyle = '#a0502a'; ctx.beginPath(); ctx.ellipse(2, 0, 14, 10, -0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#efe6d0'; ctx.fillRect(-16, 6, 10, 4);
      break;
    case 'stone': case 'gem': {
      const col = ['#aaa', '#40d060', '#3a8aff', '#b060ff', '#ffd040', '#ff3040'][tier - 1] || '#8af';
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(11, -2); ctx.lineTo(6, 13); ctx.lineTo(-6, 13); ctx.lineTo(-11, -2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(4, -2); ctx.lineTo(-4, -2); ctx.fill();
      break;
    }
    case 'scroll': case 'doc':
      ctx.fillStyle = '#e8dcb8'; ctx.fillRect(-12, -10, 24, 20);
      ctx.fillStyle = '#c8b890'; ctx.fillRect(-14, -12, 4, 24); ctx.fillRect(10, -12, 4, 24);
      ctx.fillStyle = id === 'scroll_bless' ? '#e8c040' : id === 'scroll_protect' ? '#3a6aff' : '#b01020';
      ctx.beginPath(); ctx.arc(0, 4, 4, 0, TAU); ctx.fill();
      break;
    case 'sub': drawSubFallback(ctx, id.slice(4)); break;
    case 'coin': ctx.fillStyle = '#e8b030'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill(); break;
    case 'moneybag':
      ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.arc(0, 4, 13, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8c040'; ctx.font = `800 14px ${FONT.num}`; ctx.textAlign = 'center'; ctx.fillText('$', 0, 9);
      break;
    case 'powerup': {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
      g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ffb040'); g.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
      break;
    }
    case 'oneup':
      ctx.fillStyle = '#ffd84a'; ctx.font = `900 14px ${FONT.numDeco}`; ctx.textAlign = 'center';
      ctx.fillText('1UP', 0, 5);
      break;
    case 'key':
      ctx.strokeStyle = '#c0a060'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-8, 0, 6, 0, TAU); ctx.moveTo(-2, 0); ctx.lineTo(14, 0); ctx.lineTo(14, 6); ctx.stroke();
      break;
    case 'relic':
      ctx.fillStyle = '#a01020'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 2; ctx.stroke();
      break;
    case 'bone':   // 해골 파편 (m_bone)
      ctx.rotate(-0.6); ctx.fillStyle = '#e8e0cc';
      ctx.fillRect(-11, -2.5, 22, 5);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 12, sy * 3.5, 4, 0, TAU); ctx.fill(); }
      break;
    // ── 2부 중요 물품 (world2 §7.4) ──
    case 'wheart': {   // 세계의 심장: 세계마다 색이 다른 고동치는 보석 심장
      const col = HEART_COL[tier - 1] || '#ff8a9a';
      glowDot(ctx, 0, 2, 20, col, 0.55);
      ctx.fillStyle = col; heartPath(ctx, 13); ctx.fill();
      ctx.strokeStyle = 'rgba(20,8,16,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-5, -3, 3.5, 5, -0.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(2, 4); ctx.lineTo(0, 12); ctx.stroke();
      break;
    }
    case 'star':   // 별의 조각: 네 갈래로 빛나는 작은 별
      glowDot(ctx, 0, 0, 20, '#fff2b0', 0.6);
      ctx.fillStyle = '#fff2b0'; starPath(ctx, 15, 4.5); ctx.fill();
      ctx.fillStyle = '#ffffff'; starPath(ctx, 8, 2.2); ctx.fill();
      break;
    case 'rift':   // 균열의 등불: 낡은 쇠 등불 속 검은 불꽃
      ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -15, 4, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#4a4034'; ctx.fillRect(-9, -12, 18, 4); ctx.fillRect(-9, 12, 18, 4);
      ctx.fillStyle = 'rgba(120,90,160,0.35)'; ctx.fillRect(-7, -8, 14, 20);
      glowDot(ctx, 0, 3, 11, '#b060ff', 0.6);
      ctx.fillStyle = '#0a0610'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(6, 3, 3, 9); ctx.lineTo(-3, 9); ctx.quadraticCurveTo(-6, 3, 0, -6); ctx.fill();
      ctx.strokeStyle = '#c090ff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = '#6a5a40'; ctx.lineWidth = 1.5; ctx.strokeRect(-7, -8, 14, 20);
      break;
    case 'dawnflower':   // 새벽꽃: 새벽빛을 머금은 꽃
      ctx.strokeStyle = '#4a8a3a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(-3, 12, 1, 17); ctx.stroke();
      ctx.fillStyle = '#5aa04a'; ctx.beginPath(); ctx.ellipse(-5, 12, 5, 2.4, 0.5, 0, TAU); ctx.fill();
      glowDot(ctx, 0, -4, 18, '#ffd070', 0.5);
      for (let i = 0; i < 6; i++) {
        ctx.save(); ctx.translate(0, -4); ctx.rotate(i / 6 * TAU);
        ctx.fillStyle = i % 2 ? '#ffe8b8' : '#fff4e0'; ctx.beginPath(); ctx.ellipse(0, -7, 4, 7, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#ffb040'; ctx.beginPath(); ctx.arc(0, -4, 3.5, 0, TAU); ctx.fill();
      break;
    default:
      ctx.fillStyle = '#888'; ctx.fillRect(-10, -10, 20, 20);
  }
  // 7단계(2부) 장비: 무지갯빛 균열 한 줄 (영웅 렌더러의 visual.rift 와 같은 느낌)
  if (tier === 7 && RIFT_KINDS.has(pre)) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(190,120,255,0.85)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.lineTo(-3, -2); ctx.lineTo(-6, 3); ctx.lineTo(2, 9); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,240,255,0.7)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-8, -9); ctx.lineTo(-2, -2); ctx.lineTo(-5, 3); ctx.lineTo(3, 9); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

const HEART_COL = ['#dff4ff', '#ff7a2a', '#3ad0c8', '#bfe0ff', '#c060ff', '#9ad040'];   // data/items.js k_heart_n.color 와 같은 순서
const RIFT_KINDS = new Set(['whip', 'sword', 'greatsword', 'dagger', 'gun', 'staff', 'head', 'body', 'cloak', 'ring', 'amulet']);
function glowDot(ctx, x, y, r, col, a) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha *= a; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
function heartPath(ctx, r) {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.95);
  ctx.bezierCurveTo(-r * 1.25, 0, -r * 0.95, -r * 0.95, 0, -r * 0.35);
  ctx.bezierCurveTo(r * 0.95, -r * 0.95, r * 1.25, 0, 0, r * 0.95);
  ctx.closePath();
}
function starPath(ctx, R, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const t = -Math.PI / 2 + i * Math.PI / 4, rr = i % 2 ? r : R;
    i ? ctx.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : ctx.moveTo(Math.cos(t) * rr, Math.sin(t) * rr);
  }
  ctx.closePath();
}

function drawSubFallback(ctx, sub) {
  switch (sub) {
    case 'dagger': ctx.rotate(-0.6); ctx.fillStyle = '#dde'; ctx.fillRect(-2, -14, 4, 20); ctx.fillStyle = '#6a4424'; ctx.fillRect(-2, 6, 4, 8); break;
    case 'axe': ctx.fillStyle = '#6a4424'; ctx.fillRect(-2, -14, 4, 28); ctx.fillStyle = '#ccd'; ctx.beginPath(); ctx.arc(4, -8, 9, -1.4, 1.4); ctx.fill(); break;
    case 'holywater': ctx.fillStyle = '#8ac8ff'; ctx.beginPath(); ctx.arc(0, 4, 10, 0, TAU); ctx.fill(); ctx.fillStyle = '#ddd'; ctx.fillRect(-3, -12, 6, 8); break;
    case 'cross': ctx.fillStyle = '#ffd84a'; ctx.fillRect(-3, -14, 6, 28); ctx.fillRect(-12, -6, 24, 6); break;
    case 'stopwatch': ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 2, 11, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -5); ctx.moveTo(0, 2); ctx.lineTo(5, 2); ctx.stroke(); break;
    case 'pistol': ctx.fillStyle = '#444'; ctx.fillRect(-12, -5, 24, 6); ctx.fillStyle = '#6a4424'; ctx.fillRect(-12, 0, 7, 12); break;
    case 'bible': ctx.fillStyle = '#5a1a2a'; ctx.fillRect(-10, -13, 20, 26); ctx.fillStyle = '#e8c872'; ctx.fillRect(-2, -9, 4, 16); ctx.fillRect(-6, -5, 12, 4); break;
    case 'bomb': ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 3, 11, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(8, -10, 3, 0, TAU); ctx.fill(); break;
    default: ctx.fillStyle = '#aaa'; ctx.fillRect(-8, -8, 16, 16);
  }
}
