// 자동 전투 · 대상 고정 HUD 그림 — owner: AUTO-QOL (/tmp/claude-0/s3/auto/auto_design.md · FIXES: auto.md)
//   drawLockMarks(ctx, world)          대상 고정 표적 (world.lockTarget) + 자동 전투가 고른 대상 표시 (world.autoTarget, 고정이 없을 때)
//                                      화면 좌표(HUD 층)에 카메라 변환으로 그린다. 표적은 모듈을 불러올 때 만든 캔버스 하나에
//                                      한 번 굽고(HUD 금 #e8c872 · 피 #d81c34 — 금빛 HUD 테와 같은 ㄱ자 모서리 네 개), 매 프레임 크기만 바꿔 붙인다
//   drawLockPlate(ctx, world, L)       [autofix] 고정 대상 이름판 (가운데 위 빈 칸: 이름 + HP 막대) + 대상이 터치 버튼 밑에 깔리면
//                                      그 버튼 묶음 위에 금빛 화살표 (오른쪽 버튼 묶음이 대상을 가려도 읽힌다). HUD 맨 마지막에 그린다
//   autoPill(ctx, x, y, h, level, size, o) 이름 옆 알약 「전투」(채운 알약) / 「스킬」(테두리만) / 「대기」(흐림) → 그린 폭 (끔이면 0).
//                                      o.compact = 자리가 모자랄 때 둥근 「A」 하나 (hud.js 가 직업명과 나눠 쓴다)
//   autoPillW(ctx, level, size, o)      위 알약의 폭 (그리지 않음)
//   autoLevelOf(world) · autoHoldOf(world)  game.autoHud.level ('off'|'skill'|'battle') · .hold (null|'forward'|'unreach'|'idle')
import { FONT } from '../core/ui.js';
import { touchpad } from '../core/touchpad.js';

const TAU = Math.PI * 2;
const SPR = 128;
let RET = null, retReady = false;
try { if (typeof document !== 'undefined' && document.createElement) { RET = document.createElement('canvas'); RET.width = RET.height = SPR; } } catch { RET = null; }

/**
 * 표적 굽기 (한 번): ㄱ자 모서리 네 개(금 · 검은 윤곽 — HUD 테 모서리와 같은 꼴) + 안쪽 핏빛 고리 + 가운데 점.
 * [autofix] 예전 T자 갈고리는 대상 둘레에 흩어진 「工·H」 글자처럼 읽혔다
 */
function bakeReticle() {
  if (retReady || !RET) return !!RET;
  const g = RET.getContext('2d');
  if (!g) return false;
  const c = SPR / 2, R = SPR * 0.40, L = SPR * 0.15;
  g.clearRect(0, 0, SPR, SPR);
  g.lineCap = 'square'; g.lineJoin = 'miter';
  const corners = () => {
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = c + sx * R, y = c + sy * R;
      g.moveTo(x - sx * L, y); g.lineTo(x, y); g.lineTo(x, y - sy * L);
    }
  };
  const stroke = (w, col, fn) => { g.lineWidth = w; g.strokeStyle = col; g.beginPath(); fn(); g.stroke(); };
  stroke(10, 'rgba(0,0,0,0.78)', corners);
  stroke(5.5, '#e8c872', corners);
  stroke(1.8, '#fff2c0', corners);
  const ring = () => g.arc(c, c, R * 0.42, 0, TAU);
  stroke(6, 'rgba(0,0,0,0.7)', ring);
  stroke(2.6, '#d81c34', ring);
  g.fillStyle = 'rgba(0,0,0,0.7)'; g.beginPath(); g.arc(c, c, 5.5, 0, TAU); g.fill();
  g.fillStyle = '#ff3a4a'; g.beginPath(); g.arc(c, c, 3.4, 0, TAU); g.fill();
  retReady = true;
  return true;
}

export function autoLevelOf(world) { return world?.game?.autoHud?.level ?? 'off'; }
export function autoHoldOf(world) { const h = world?.game?.autoHud; return h && h.level !== 'off' && h.on ? h.hold ?? null : null; }

/** 엔티티 화면 사각형 (논리 px) — 보스는 피격 상자 묶음. o 에 써서 돌려준다 */
const SB = { x: 0, y: 0, w: 0, h: 0 };
function screenBox(world, e, o = SB) {
  const cam = world.camera, z = cam?.zoom ?? 1;
  let x0 = e.x, x1 = e.x + e.w, y0 = e.y, y1 = e.y + e.h;
  try {
    // [playb] 공격 판정과 같은 상자 (hitParts → hurtboxes, 꺼진 부위 제외) — 거상처럼 hurtboxes() 가 빈 여러 부위 보스는 hitParts 를 감싼다
    const hb = e.hitParts ? e.hitParts() : e.hurtboxes?.();
    const live = (hb ?? []).filter((r) => r && !r.off && r.w > 0 && r.h > 0);
    if (live.length) { x0 = Infinity; x1 = -Infinity; y0 = Infinity; y1 = -Infinity; for (const r of live) { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h); } }
  } catch { /* 모양이 다르면 몸 상자 */ }
  if (!(x1 > x0)) { x0 = e.x; x1 = e.x + e.w; y0 = e.y; y1 = e.y + e.h; }
  const ox = (cam?.x ?? 0) + (cam?.shakeX ?? 0), oy = (cam?.y ?? 0) + (cam?.shakeY ?? 0);
  o.x = (x0 - ox) * z; o.y = (y0 - oy) * z; o.w = (x1 - x0) * z; o.h = (y1 - y0) * z;
  return o;
}

/** 표적 · 자동 대상 표시 */
export function drawLockMarks(ctx, world) {
  if (!world || world.hudHidden) return;
  const lk = world.lockTarget, at = world.autoTarget;
  const t = world.rt ?? world.time ?? 0, still = world.game?.settings?.reduceMotion === true;
  if (lk && !lk.dead && !lk.hidden && bakeReticle()) {
    const b = screenBox(world, lk), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    // 모서리가 대상 몸을 감싸게 (작은 적도 54 px 아래로는 줄이지 않는다), 살짝 숨 쉬듯 (줄이기 동작이면 멈춤)
    const s = Math.max(54, Math.min(170, Math.max(b.w, b.h) * 1.15)) * (1 + (still ? 0 : 0.05 * Math.sin(t * 5)));
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(RET, cx - s / 2, cy - s / 2, s, s);
    ctx.restore();
    // 대상 위 작은 역삼각형 (멀리서도 어느 적인지)
    ctx.save();
    const ty = b.y - 10 - (still ? 0 : 3 * Math.abs(Math.sin(t * 4)));
    chevron(ctx, cx, ty, 9);
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
/** 금빛 역삼각형 (꼭짓점 (cx, y+1), 반폭 s) */
function chevron(ctx, cx, y, s) {
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.beginPath(); ctx.moveTo(cx - s, y - s - 2); ctx.lineTo(cx + s, y - s - 2); ctx.lineTo(cx, y + 1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8c872'; ctx.beginPath(); ctx.moveTo(cx - s + 3, y - s); ctx.lineTo(cx + s - 3, y - s); ctx.lineTo(cx, y - 1); ctx.closePath(); ctx.fill();
}

/**
 * [autofix] 고정 대상 이름판 + 버튼 밑 화살표. 폴드 오른쪽 버튼 묶음(보조·고정·필살·스킬)이 앞쪽 250–450 px 땅 위를 덮어
 * 고정한 적과 표적이 버튼 밑에 깔리던 문제 (리뷰 lock_1.png) — 이름판은 가운데 위 기믹 게이지 줄의 빈 줄에,
 * 대상이 버튼 사각형 밑이면 그 사각형 바로 위에 아래를 가리키는 금빛 화살표 + 작은 HP 막대
 */
export function drawLockPlate(ctx, world, L) {
  const lk = world?.lockTarget;
  if (!lk || lk.dead || lk.hidden || world.hudHidden || !L) return;
  const F = Math.max(12, L.textMin || 12);
  const hpF = lk.maxHp > 0 ? Math.max(0, Math.min(1, lk.hp / lk.maxHp)) : lk.def?.hp > 0 ? Math.max(0, Math.min(1, lk.hp / lk.def.hp)) : null;
  // 이름판: 보스 체력바가 이미 보이고 대상이 그 보스면 생략 (같은 정보)
  const bossSame = L.bossShown && world.boss === lk;
  if (!bossSame) {
    const used = Math.max(0, Math.min(2, Number.isFinite(world.gimmick?.meterRows) ? world.gimmick.meterRows : 0));
    let r = L.meter?.(used);
    if (L.bossShown && L.bossBar) r = { x: L.bossBar.x, y: L.bossBar.y + L.bossBar.h + 4, w: L.bossBar.w, h: 16 };
    if (r && r.w > 60) {
      const name = lk.def?.name ?? lk.name ?? '';
      ctx.save();
      ctx.font = `700 ${F}px ${FONT.body}`;
      const nw = Math.min(ctx.measureText(name).width, 200);
      const bw = Math.max(70, Math.min(150, r.w * 0.4));
      const h = Math.round(F + 8), w = Math.round(22 + nw + 10 + bw + 10);
      const x = Math.round(r.x + r.w / 2 - w / 2), y = Math.round(r.y);
      // 판: 어두운 바탕 + 금빛 테 (HUD 판과 같은 빛깔)
      ctx.fillStyle = 'rgba(8,3,8,0.78)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(232,200,114,0.85)'; ctx.lineWidth = 1.2; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      // 작은 ㄱ자 표적 아이콘
      const ix = x + 11, iy = y + h / 2, q = 5.5;
      ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 2; ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(ix + sx * q - sx * 3.5, iy + sy * q); ctx.lineTo(ix + sx * q, iy + sy * q); ctx.lineTo(ix + sx * q, iy + sy * q - sy * 3.5); }
      ctx.stroke();
      ctx.fillStyle = '#ff3a4a'; ctx.beginPath(); ctx.arc(ix, iy, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f3e2b8'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(name, x + 22, iy + 0.5, nw);
      const bx = x + 22 + nw + 10, by = iy - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 10);
      if (hpF != null) { ctx.fillStyle = '#d81c34'; ctx.fillRect(bx, by, bw * hpF, 8); }
      ctx.restore();
    }
  }
  // 버튼 밑 화살표: 대상 화면 중심이 터치 버튼 사각형 안이면 그 위에
  let rects = null;
  try { rects = touchpad.occupiedRects?.() ?? null; } catch { rects = null; }
  if (!rects?.length) return;
  const b = screenBox(world, lk), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let top = Infinity;
  for (const q of rects) {
    if (cx > q.x - 6 && cx < q.x + q.w + 6 && cy > q.y - 6 && cy < q.y + q.h + 6) top = Math.min(top, q.y);
  }
  if (top === Infinity) return;
  // 그 열에서 위로 이어진 버튼까지 올라간다 (스킬 원호처럼 위아래로 붙은 버튼 묶음)
  for (let k = 0; k < 4; k++) {
    let moved = false;
    for (const q of rects) if (cx > q.x - 6 && cx < q.x + q.w + 6 && q.y < top && q.y + q.h > top - 16) { top = q.y; moved = true; }
    if (!moved) break;
  }
  const t = world.rt ?? world.time ?? 0, still = world.game?.settings?.reduceMotion === true;
  const ay = top - 6 - (still ? 0 : 3 * Math.abs(Math.sin(t * 4)));
  ctx.save();
  chevron(ctx, cx, ay, 11);
  if (hpF != null) {
    const w = 46, x = cx - w / 2, y = ay - 26;
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - 1, y - 1, w + 2, 7);
    ctx.fillStyle = '#d81c34'; ctx.fillRect(x, y, w * hpF, 5);
  }
  ctx.restore();
}

const PILL_TXT = { battle: '전투', skill: '스킬' };
/** 알약 폭 (그리지 않음) */
export function autoPillW(ctx, level, size = 11, o = {}) {
  const off = !level || level === 'off';
  if (off && !o.showOff) return 0;
  const fs = Math.max(11, Math.round(size));
  if (o.compact && !off) return Math.round(fs * 1.5);
  ctx.save(); ctx.font = off ? `800 ${fs}px ${FONT.num}` : `800 ${fs}px ${FONT.body}`;
  const w = Math.ceil(ctx.measureText(off ? 'AUTO' : o.hold ? '대기' : PILL_TXT[level] ?? 'AUTO').width) + 12;
  ctx.restore();
  return w;
}
/**
 * [autofix] 휴대폰 두 줄 배치: AUTO 버튼 대신 이 알약이 누르는 자리 (touchpad.autoInHud) — 꺼져 있어도 흐린 테 「AUTO」를 보인다.
 * blocked(기록 모드) 면 더 흐리게 (누르면 이유 토스트)
 */
function offPill(ctx, x, y, h, size, blocked) {
  const fs = Math.max(11, Math.round(size));
  ctx.save();
  ctx.font = `800 ${fs}px ${FONT.num}`;
  const w = Math.ceil(ctx.measureText('AUTO').width) + 12, r = h / 2;
  ctx.globalAlpha = blocked ? 0.5 : 1;
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
  ctx.fillStyle = 'rgba(14,8,12,0.82)'; ctx.fill();
  ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(232,200,114,0.7)'; ctx.stroke();
  ctx.fillStyle = 'rgba(243,226,184,0.8)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('AUTO', x + w / 2, y + h / 2 + 0.5);
  ctx.restore();
  return w;
}
/**
 * 이름 옆 AUTO 알약 → 폭 (끔이면 0). size = 글자 크기 (≥ 11). o: {compact, hold}
 * [autofix] 「AUTO」 한 가지 글자 + 색만 다르던 것을 단계 글자 「전투」(채운 알약) · 「스킬」(테두리만) · 「대기」(흐림)로 — 색만으로 가르지 않는다
 */
export function autoPill(ctx, x, y, h, level, size = 11, o = {}) {
  if (!level || level === 'off') return o.showOff ? offPill(ctx, x, y, h, size, !!o.blocked) : 0;
  const fs = Math.max(11, Math.round(size)), hold = !!o.hold, battle = level === 'battle';
  const str = o.compact ? 'A' : hold ? '대기' : PILL_TXT[level] ?? 'AUTO';
  ctx.save();
  ctx.font = `800 ${fs}px ${o.compact ? FONT.num : FONT.body}`;
  const w = o.compact ? Math.max(h, Math.round(fs * 1.5)) : Math.ceil(ctx.measureText(str).width) + 12;
  const r = h / 2;
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
  if (hold) { ctx.fillStyle = 'rgba(30,26,30,0.9)'; ctx.fill(); ctx.setLineDash([3, 2]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(200,184,160,0.8)'; ctx.stroke(); ctx.setLineDash([]); }
  else if (battle) { ctx.fillStyle = 'rgba(150,52,10,0.96)'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = '#ffd08a'; ctx.stroke(); }
  else { ctx.fillStyle = 'rgba(8,16,28,0.82)'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#9fd8ff'; ctx.stroke(); }
  ctx.fillStyle = hold ? '#c8b8a0' : battle ? '#fff0d8' : '#cfeeff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(str, x + w / 2, y + h / 2 + 0.5);
  ctx.restore();
  return w;
}
