// 아이콘 그리기: Blender로 렌더한 assets/icons/<id>.png 를 우선 사용하고, 없으면 절차적 대체 아이콘.
// drawIcon(ctx, iconId, cx, cy, size, itemInstance?)  — 중심 좌표 기준
// itemInstance 가 있으면 희귀도 테두리 광채/강화 수치 오라를 덧그림.
import { assets } from '../core/assets.js';
import { TAU } from '../core/math.js';

const RARITY_GLOW = ['rgba(0,0,0,0)', '#6fe07a', '#5aa8ff', '#c07cff', '#ffa640', '#ff4a5a'];

export function drawIcon(ctx, id, cx, cy, size = 40, item = null, { glow = true } = {}) {
  const img = assets.get('icons/' + id);
  ctx.save();
  if (item && glow) {
    const lv = item.level ?? 0;
    if (lv >= 7) {
      ctx.globalCompositeOperation = 'lighter';
      const col = lv >= 13 ? `hsl(${(performance.now() / 8) % 360},90%,60%)` : lv >= 10 ? '#ff7a2a' : '#8ac8ff';
      const g = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.75);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(performance.now() / 180);
      ctx.fillStyle = g; ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
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
    if (r > 0) {
      const g = ctx.createRadialGradient(x + s / 2, y + s / 2, 2, x + s / 2, y + s / 2, s * 0.7);
      g.addColorStop(0, RARITY_GLOW[r] + '55'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
    }
    drawIcon(ctx, item.icon, x + s / 2, y + s / 2, s * 0.86, item);
    if (item.level > 0) {
      ctx.font = `800 ${Math.round(s * 0.26)}px "Cinzel", sans-serif`; ctx.textAlign = 'right';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText('+' + item.level, x + s - 3, y + s * 0.3);
      ctx.fillStyle = item.level >= 10 ? '#ffb040' : '#ffe7a0'; ctx.fillText('+' + item.level, x + s - 3, y + s * 0.3);
    }
    if (item.qty > 1) {
      ctx.font = `700 ${Math.round(s * 0.24)}px "Noto Sans KR", sans-serif`; ctx.textAlign = 'right';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(item.qty, x + s - 3, y + s - 4);
      ctx.fillStyle = '#fff'; ctx.fillText(item.qty, x + s - 3, y + s - 4);
    }
    if (item.equipped) {
      ctx.fillStyle = '#e8c872'; ctx.font = `800 ${Math.round(s * 0.22)}px "Noto Sans KR"`; ctx.textAlign = 'left';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText('E', x + 3, y + s * 0.3); ctx.fillText('E', x + 3, y + s * 0.3);
    }
  } else if (empty) {
    ctx.fillStyle = '#4a3a30'; ctx.font = `500 ${Math.round(s * 0.22)}px "Noto Sans KR"`; ctx.textAlign = 'center';
    ctx.fillText(empty, x + s / 2, y + s / 2 + 4);
  }
  ctx.restore();
}

// ── 절차적 대체 아이콘 ──
function fallbackIcon(ctx, id, cx, cy, s) {
  const k = s / 40;
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  const tier = parseInt(id.split('_').pop(), 10) || 1;
  const metal = ['#9a9aa0', '#c8ccd8', '#e8ecf4', '#8ab8ff', '#ffd84a', '#c040ff'][tier - 1] || '#ccc';
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
      ctx.fillStyle = ['#6a4a2a', '#2a4a8a', '#8a1a2a', '#1a1018', '#e8e0d0', '#3a1a3a'][tier - 1];
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.lineTo(8, -14); ctx.lineTo(16, 16); ctx.lineTo(-16, 16); ctx.closePath(); ctx.fill();
      break;
    case 'ring':
      ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 4, 10, 0, TAU); ctx.stroke();
      ctx.fillStyle = ['#aaa', '#ff3040', '#3a7aff', '#30d060', '#eee', '#ff0030'][tier - 1]; ctx.beginPath(); ctx.arc(0, -7, 5, 0, TAU); ctx.fill();
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
      ctx.fillStyle = '#e8c040'; ctx.font = '800 14px serif'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 9);
      break;
    case 'powerup': {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
      g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ffb040'); g.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
      break;
    }
    case 'oneup':
      ctx.fillStyle = '#ffd84a'; ctx.font = '900 14px "Cinzel", serif'; ctx.textAlign = 'center';
      ctx.fillText('1UP', 0, 5);
      break;
    case 'key':
      ctx.strokeStyle = '#c0a060'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-8, 0, 6, 0, TAU); ctx.moveTo(-2, 0); ctx.lineTo(14, 0); ctx.lineTo(14, 6); ctx.stroke();
      break;
    case 'relic':
      ctx.fillStyle = '#a01020'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 2; ctx.stroke();
      break;
    default:
      ctx.fillStyle = '#888'; ctx.fillRect(-10, -10, 20, 20);
  }
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
