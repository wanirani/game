// 자동 전투 · 대상 고정 HUD 그림 — owner: AUTO-QOL (/tmp/claude-0/s3/auto/auto_design.md)
//   drawLockMarks(ctx, world)          대상 고정 표적 고리 (world.lockTarget) + 자동 전투가 고른 대상 표시 (world.autoTarget, 고정이 없을 때)
//                                      화면 좌표(HUD 층)에 카메라 변환으로 그린다. 표적 고리는 모듈을 불러올 때 만든 캔버스 하나에
//                                      한 번 굽고(HUD 색 #e8c872 금 · #d81c34 피), 매 프레임 회전·크기만 바꿔 붙인다 (스테이지 도중 새 캔버스 0)
//   autoPill(ctx, x, y, h, level, size) 이름 옆 작은 알약 'AUTO' (단계 색) → 그린 폭 (끔이면 0)
//   autoLevelOf(world)                  game.autoHud.level ('off'|'skill'|'battle')
import { FONT } from '../core/ui.js';

const TAU = Math.PI * 2;
const SPR = 128;
let RET = null, retReady = false;
try { if (typeof document !== 'undefined' && document.createElement) { RET = document.createElement('canvas'); RET.width = RET.height = SPR; } } catch { RET = null; }

/** 표적 고리 굽기 (한 번): 바깥 금 고리 + 네 갈고리 + 안쪽 핏빛 고리 · 검은 윤곽 */
function bakeReticle() {
  if (retReady || !RET) return !!RET;
  const g = RET.getContext('2d');
  if (!g) return false;
  const c = SPR / 2, R = SPR * 0.36;
  g.clearRect(0, 0, SPR, SPR);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const stroke = (w, col, fn) => { g.lineWidth = w; g.strokeStyle = col; g.beginPath(); fn(); g.stroke(); };
  const brackets = () => {
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a);
      const r0 = R * 1.08, r1 = R * 1.36;
      g.moveTo(c + ca * r0, c + sa * r0); g.lineTo(c + ca * r1, c + sa * r1);
      const t = R * 0.22, px = -sa, py = ca;
      g.moveTo(c + ca * r1 - px * t, c + sa * r1 - py * t); g.lineTo(c + ca * r1 + px * t, c + sa * r1 + py * t);
    }
  };
  const ringArcs = (rr) => { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.22; g.moveTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr); g.arc(c, c, rr, a, a + Math.PI / 2 - 0.44); } };
  // 윤곽 (어두운 바탕 위·밝은 바탕 위 모두 읽히게)
  stroke(9, 'rgba(0,0,0,0.75)', brackets); stroke(8, 'rgba(0,0,0,0.75)', () => ringArcs(R));
  stroke(4.5, '#e8c872', brackets); stroke(4, '#e8c872', () => ringArcs(R));
  stroke(1.6, '#fff2c0', () => ringArcs(R));
  stroke(6, 'rgba(0,0,0,0.7)', () => g.arc(c, c, R * 0.52, 0, TAU));
  stroke(3, '#d81c34', () => g.arc(c, c, R * 0.52, 0, TAU));
  g.fillStyle = 'rgba(0,0,0,0.7)'; g.beginPath(); g.arc(c, c, 6, 0, TAU); g.fill();
  g.fillStyle = '#ff3a4a'; g.beginPath(); g.arc(c, c, 3.6, 0, TAU); g.fill();
  retReady = true;
  return true;
}

export function autoLevelOf(world) { return world?.game?.autoHud?.level ?? 'off'; }

/** 엔티티 화면 사각형 (논리 px) — 보스는 피격 상자 묶음 */
function screenBox(world, e) {
  const cam = world.camera, z = cam?.zoom ?? 1;
  let x0 = e.x, x1 = e.x + e.w, y0 = e.y, y1 = e.y + e.h;
  try {
    const hb = e.hurtboxes?.();
    if (hb?.length) { x0 = Infinity; x1 = -Infinity; y0 = Infinity; y1 = -Infinity; for (const r of hb) { if (!r || !(r.w > 0)) continue; x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h); } }
  } catch { /* 모양이 다르면 몸 상자 */ }
  if (!(x1 > x0)) { x0 = e.x; x1 = e.x + e.w; y0 = e.y; y1 = e.y + e.h; }
  const ox = (cam?.x ?? 0) + (cam?.shakeX ?? 0), oy = (cam?.y ?? 0) + (cam?.shakeY ?? 0);
  return { x: (x0 - ox) * z, y: (y0 - oy) * z, w: (x1 - x0) * z, h: (y1 - y0) * z };
}

/** 표적 고리 · 자동 대상 표시 */
export function drawLockMarks(ctx, world) {
  if (!world || world.hudHidden) return;
  const lk = world.lockTarget, at = world.autoTarget;
  const t = world.rt ?? world.time ?? 0, still = world.game?.settings?.reduceMotion === true;
  if (lk && !lk.dead && !lk.hidden && bakeReticle()) {
    const b = screenBox(world, lk), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const s = Math.max(54, Math.min(150, Math.max(b.w, b.h) * 0.95)) * (1 + (still ? 0 : 0.04 * Math.sin(t * 5)));
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.translate(cx, cy);
    if (!still) ctx.rotate((t * 0.9) % TAU);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(RET, -s / 2, -s / 2, s, s);
    ctx.restore();
    // 대상 위 작은 역삼각형 (멀리서도 어느 적인지)
    ctx.save();
    const ty = b.y - 10 - (still ? 0 : 3 * Math.abs(Math.sin(t * 4)));
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); ctx.moveTo(cx - 9, ty - 11); ctx.lineTo(cx + 9, ty - 11); ctx.lineTo(cx, ty + 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8c872'; ctx.beginPath(); ctx.moveTo(cx - 6, ty - 9); ctx.lineTo(cx + 6, ty - 9); ctx.lineTo(cx, ty - 1); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (at && !at.dead && !at.hidden && autoLevelOf(world) !== 'off') {
    // 자동 전투 대상: 발밑 옅은 점선 반원 (고정 표적보다 훨씬 약하게)
    const b = screenBox(world, at), cx = b.x + b.w / 2, fy = b.y + b.h;
    const r = Math.max(18, Math.min(70, b.w * 0.6));
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff2c0';
    ctx.setLineDash([5, 5]); ctx.lineDashOffset = still ? 0 : -(t * 20) % 10;
    ctx.beginPath(); ctx.ellipse(cx, fy - 2, r, r * 0.28, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

/** 이름 옆 'AUTO' 알약 → 폭 (끔이면 0). size = 글자 크기 (≥ 11) */
export function autoPill(ctx, x, y, h, level, size = 11) {
  if (!level || level === 'off') return 0;
  const fs = Math.max(11, Math.round(size)), str = 'AUTO';
  ctx.save();
  ctx.font = `800 ${fs}px ${FONT.num}`;
  const w = Math.ceil(ctx.measureText(str).width) + 10;
  const r = h / 2;
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
  ctx.fillStyle = level === 'battle' ? 'rgba(120,40,8,0.95)' : 'rgba(10,40,70,0.95)'; ctx.fill();
  ctx.lineWidth = 1.2; ctx.strokeStyle = level === 'battle' ? '#ffb070' : '#9fd8ff'; ctx.stroke();
  ctx.fillStyle = level === 'battle' ? '#ffe0c0' : '#e0f4ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(str, x + w / 2, y + h / 2 + 0.5);
  ctx.restore();
  return w;
}
