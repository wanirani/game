// 업적 메달 — 절차적 벡터 그림 (docs/specs/achievements.md §7.5) — owner: ACH-UI
//  drawMedal(ctx, x, y, r, { cat, pts, got, hidden, isNew, t })  (x, y) = 원 중심, r = 반지름
//   리본 꼬리 둘(분류 색) → 바깥 고리(점수 색: 10 청동 · 20 은 · 30 금 · 50 핏빛 · 100 백금 + 발광 맥동)
//   → 어두운 안쪽 원 → 분류 문양(menu/common.js glyph, 점수 색)
//   미달성: 고리·문양이 잿빛 + 오른쪽 아래 작은 자물쇠 · 숨긴 미달성: 문양 대신 '?' · NEW: 오른쪽 위 붉은 마름모
//  호·선 몇 개뿐 (한 개 ≤ 0.05 ms). 캐시 캔버스·그라디언트를 만들지 않는다 (발광은 menu/common.js glow 아틀라스)
import { text, FONT } from '../../core/ui.js';
import { TAU } from '../../core/math.js';
import { glyph, glow, diamond } from '../menu/common.js';

/** 점수 → 고리 색 (§1: 10 청동 · 20 은 · 30 금 · 50 핏빛 · 100 백금) */
export function ptsColor(pts) {
  const p = Number(pts) || 0;
  return p >= 100 ? '#fff2b0' : p >= 50 ? '#ff5a6a' : p >= 30 ? '#e8c872' : p >= 20 ? '#c8ccd8' : '#b07a4a';
}
/** 분류 색 (리본 꼬리·분류 칸 강조) */
export const CAT_COL = {
  story: '#c8344a', combat: '#d8682a', hero: '#d8b048', companion: '#58b070',
  collect: '#4a90e0', arcade: '#a868e8', challenge: '#e83a52', secret: '#7a6aa0',
};
/** 분류 문양 (data/achievements.js ACH_CATS 의 glyph 와 같다 — 데이터가 없을 때의 대체) */
export const CAT_GLYPH = { story: 'book', combat: 'sword', hero: 'crown', companion: 'paw', collect: 'bag', arcade: 'star', challenge: 'skull', secret: 'eye' };

const DIM_RING = '#4a3e44', DIM_GLYPH = '#5a4e54', DIM_TAIL = '#2e2228';
const INNER = '#160a12', INNER_DIM = '#120a0e';

/** 리본 꼬리 하나 (s = -1 왼쪽, +1 오른쪽). 끝이 V 자로 파였다 */
function tail(ctx, x, y, r, s, color) {
  ctx.beginPath();
  ctx.moveTo(x + s * r * 0.12, y + r * 0.35);
  ctx.lineTo(x + s * r * 0.62, y + r * 0.3);
  ctx.lineTo(x + s * r * 0.74, y + r * 1.32);
  ctx.lineTo(x + s * r * 0.5, y + r * 1.12);
  ctx.lineTo(x + s * r * 0.3, y + r * 1.36);
  ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1; ctx.stroke();
}

/**
 * 메달 하나. glyphName 을 주면 그 문양(없으면 분류의 기본 문양). 그리기 상태(채움·선·알파)는 끝나면 돌려놓는다
 */
export function drawMedal(ctx, x, y, r, { cat = 'story', pts = 10, got = false, hidden = false, isNew = false, t = 0, glyphName = null } = {}) {
  if (!(r > 0)) return;
  const ring = got ? ptsColor(pts) : DIM_RING;
  ctx.save();
  // 리본 꼬리 (분류 색, 미달성은 어둡게)
  const tc = got ? CAT_COL[cat] ?? '#8a6a5a' : DIM_TAIL;
  tail(ctx, x, y, r, -1, tc);
  tail(ctx, x, y, r, 1, tc);
  // 100점: 백금 발광 맥동
  if (got && pts >= 100) glow(ctx, x, y, r * 2.1, '#fff2b0', 0.3 + 0.18 * Math.sin(t * 3));
  // 바깥 고리
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = ring; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = Math.max(1, r * 0.06); ctx.stroke();
  // 고리 윗면 반사 (왼쪽 위 호)
  ctx.beginPath(); ctx.arc(x, y, r * 0.89, Math.PI * 1.05, Math.PI * 1.6);
  ctx.strokeStyle = got ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.08)'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke();
  // 50점 이상: 고리 위의 작은 장식 마름모 여섯
  if (got && pts >= 50) {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 6;
      diamond(ctx, x + Math.cos(a) * r * 0.89, y + Math.sin(a) * r * 0.89, Math.max(1.2, r * 0.07), 'rgba(40,6,14,0.75)');
    }
  }
  // 안쪽 원
  ctx.beginPath(); ctx.arc(x, y, r * 0.76, 0, TAU);
  ctx.fillStyle = got ? INNER : INNER_DIM; ctx.fill();
  ctx.strokeStyle = got ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(1, r * 0.05); ctx.stroke();
  // 문양 또는 '?'
  if (hidden && !got) {
    text(ctx, '?', x, y + r * 0.36, { size: Math.max(10, Math.round(r * 1.02)), align: 'center', weight: 900, family: FONT.title, color: DIM_GLYPH, ow: 0 });
  } else {
    glyph(ctx, glyphName || CAT_GLYPH[cat] || 'star', x, y, r * 1.02, got ? ring : DIM_GLYPH, got ? 1.8 : 1.5);
  }
  // 미달성: 오른쪽 아래 작은 자물쇠
  if (!got) {
    const lx = x + r * 0.66, ly = y + r * 0.66, lr = Math.max(4, r * 0.34);
    ctx.beginPath(); ctx.arc(lx, ly, lr, 0, TAU);
    ctx.fillStyle = '#0c060a'; ctx.fill();
    ctx.strokeStyle = DIM_RING; ctx.lineWidth = 1; ctx.stroke();
    glyph(ctx, 'lock', lx, ly + lr * 0.08, lr * 1.25, '#8a7a80', 1.4);
  }
  // NEW: 오른쪽 위 붉은 마름모
  if (isNew) diamond(ctx, x + r * 0.74, y - r * 0.74, Math.max(3, r * 0.24), '#ff3050', '#ffd0d8');
  ctx.restore();
}
