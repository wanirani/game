// 장비 비교 공용 컴포넌트 (docs/specs/qol_equip.md §3) — owner: QOL
//  장비 탭 · 가방 상세 · 상점 · 대장간(강화 전/후) · 결과 화면이 같은 모양으로 쓴다.
//   compareInfo(state, hero, inst, opts) → gear_score.gearDelta 결과 (같은 장비·같은 영웅 상태면 캐시)
//   summaryText(info) → "종합 +3.2 · 초당 피해 +12%" (한 줄 — ▲▼= 는 drawMark 로 따로)
//   drawMark(ctx, x, y, s, mark) — ▲(초록) ▼(빨강) =(회색) 도형 · drawFace(ctx, cx, cy, d, charId) — 영웅 얼굴 작은 원
//   drawCompare(ctx, r, info, {maxRows}) → 쓴 높이 — "착용 중인 ○○과 비교" 표 (종합 점수 · 능력치 증감 · 초당 피해 어림 · +효과)
//   LoadoutModal — 최적 장착 미리보기 (칸별 바뀌는 것 · 고정 칸 · 총 증감 → 확인) · DisposeModal — 일괄 처분 미리보기
//  모달은 메뉴 모달 규약: update(dt, nav, ges) → 열려 있으면 true, render(ctx, vw, vh), open
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { input } from '../../core/input.js';
import { assets } from '../../core/assets.js';
import { clamp, ease } from '../../core/math.js';
import { faceRect } from '../../render/portrait.js';
import { CHARACTERS } from '../../data/characters.js';
import { ITEMS, itemName, josa, RARITIES } from '../../data/items.js';
import { STAT_INFO, EQUIP_SLOTS, SLOT_NAMES } from '../../game/stats.js';
import { findItem } from '../../game/inventory.js';
import { gearDelta, gearSettings, statsWith, powerOf, scoreBetween, weightsFor } from '../../game/gear_score.js';
import { PAL, RARITY_COL, frame, divider, gbutton, zone, glowOval, ellipsize, measure, wrapC, selBar } from './common.js';

export const MARK_COL = { up: '#7ee07e', down: '#ff7a6a', eq: '#b8a890' };
const fmt1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
/** 점수 글자: +3.2 / −1.0 / ±0 */
export function scoreStr(s) {
  if (s == null) return '';
  if (Math.abs(s) < 0.05) return '±0';
  return `${s > 0 ? '+' : '−'}${fmt1(Math.abs(s))}`;
}
const intStat = (k) => !STAT_INFO[k]?.pct && !['hpRegen', 'mpRegen'].includes(k);
/** 능력치 값 글자 (정수 능력치는 정수, 나머지는 소수 한 자리 + %) */
export function statStr(k, v) {
  const a = Math.abs(v);
  const n = intStat(k) ? String(Math.round(a)) : String(Math.round(a * 10) / 10);
  return n + (STAT_INFO[k]?.pct ? '%' : '');
}
export const statName = (k) => STAT_INFO[k]?.name ?? k;
const kNum = (v) => Math.round(v).toLocaleString('ko-KR');

// ── 캐시: 같은 영웅 상태 · 같은 장비면 다시 계산하지 않는다 (상세 칸은 매 프레임 그린다) ──
const CACHE = new Map();
function equipSig(state, hero) {
  let s = `${hero.charId}:${hero.level}:${hero.classId}:${hero.asc ?? ''}:${Object.keys(hero.skills || {}).length}:${(state.progress?.docs || []).length}|`;
  for (const k of EQUIP_SLOTS) { const it = findItem(state, hero.equip?.[k]); s += (it ? `${it.uid}+${it.level | 0}` : '-') + ','; }
  return s;
}
/** gearDelta + 캐시 (opts.mode 없으면 설정의 점수 기준) */
export function compareInfo(state, hero, inst, opts = {}) {
  if (!state || !hero || !inst) return null;
  const mode = opts.mode ?? gearSettings().weights;
  const key = `${equipSig(state, hero)}|${inst.uid ?? inst.baseId}|${inst.baseId}|${inst.level | 0}|${inst.rarity | 0}|${mode}|${opts.slot ?? ''}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  let info = null;
  try { info = gearDelta(state, hero, inst, { ...opts, mode }); } catch (e) { console.warn('[gear_compare]', e); }
  if (CACHE.size > 64) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, info);
  return info;
}
/**
 * 대장간 강화 전/후: 이 장비를 끼고 있는 영웅(없으면 지금 영웅)에게 +1 강화가 주는 변화.
 * 끼고 있으면 { worn: true, score, dpsPct } (강화 전 → 후), 아니면 { worn: false, before, after } (지금 장비와 비교한 종합 점수 전 → 후)
 */
export function enhanceDelta(state, hero, inst, wearerId = null) {
  if (!state || !inst) return null;
  const h = (wearerId && state.heroes?.[wearerId]) || hero;
  if (!h) return null;
  const mode = gearSettings().weights;
  const key = `enh|${equipSig(state, h)}|${inst.uid}|${inst.level | 0}|${mode}`;
  if (CACHE.has(key)) return CACHE.get(key);
  let out = null;
  const L = inst.level | 0;
  try {
    if (wearerId) {
      const s0 = statsWith(state, h, { ...h.equip });
      inst.level = L + 1;
      const s1 = statsWith(state, h, { ...h.equip });
      inst.level = L;
      const w = weightsFor(h, mode), p0 = powerOf(s0, h), p1 = powerOf(s1, h);
      out = { worn: true, score: scoreBetween(p0, p1, h, w), dpsPct: (p1.off / p0.off - 1) * 100 };
    } else {
      const a = gearDelta(state, h, inst, { mode });
      inst.level = L + 1;
      const b = gearDelta(state, h, inst, { mode });
      inst.level = L;
      out = a.comparable ? { worn: false, before: a.score, after: b.score, mark: b.mark } : null;
    }
  } catch (e) { console.warn('[gear_compare]', e); out = null; } finally { inst.level = L; }
  if (CACHE.size > 64) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, out);
  return out;
}
/** 한 줄 요약 */
export function summaryText(info) {
  if (!info) return '';
  if (!info.comparable) return info.reason || '비교할 수 없는 장비';
  if (info.here) return '지금 장착 중';
  // 표시(▲▼=)는 그리는 쪽이 모양(drawMark)으로 붙인다 — 글자에는 되풀이하지 않는다
  const parts = [`종합 ${scoreStr(info.score)}`];
  if (info.dps && Math.abs(info.dps.pct) >= 0.5) parts.push(`초당 피해 ${info.dps.pct > 0 ? '+' : '−'}${Math.round(Math.abs(info.dps.pct))}%`);
  if (info.effect) parts.push('+효과');
  return parts.join(' · ');
}

/** ▲ ▼ = 도형 (글꼴에 기대지 않는다). (x, y) = 가운데 */
export function drawMark(ctx, x, y, s, mark) {
  if (!mark) return;
  ctx.save();
  ctx.fillStyle = MARK_COL[mark] ?? PAL.dim;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = Math.max(1.5, s * 0.16); ctx.lineJoin = 'round';
  ctx.beginPath();
  if (mark === 'up') { ctx.moveTo(x, y - s * 0.5); ctx.lineTo(x + s * 0.5, y + s * 0.4); ctx.lineTo(x - s * 0.5, y + s * 0.4); }
  else if (mark === 'down') { ctx.moveTo(x, y + s * 0.5); ctx.lineTo(x + s * 0.5, y - s * 0.4); ctx.lineTo(x - s * 0.5, y - s * 0.4); }
  else { ctx.rect(x - s * 0.45, y - s * 0.32, s * 0.9, s * 0.22); ctx.rect(x - s * 0.45, y + s * 0.1, s * 0.9, s * 0.22); }
  ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}
/** 영웅 얼굴 작은 원 (초상이 아직 없으면 이름 첫 글자) */
export function drawFace(ctx, cx, cy, d, charId) {
  const ch = CHARACTERS[charId];
  if (!ch) return;
  const img = assets.get(ch.portrait);
  const fr = img ? faceRect(img, ch.portrait, 1.5) : null;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.closePath();
  ctx.fillStyle = '#1a0c14'; ctx.fill();
  if (fr) { ctx.save(); ctx.clip(); ctx.drawImage(img, fr.sx, fr.sy, fr.sw, fr.sh, cx - d / 2, cy - d / 2, d, d); ctx.restore(); }
  else text(ctx, ch.name?.[0] ?? '?', cx, cy + d * 0.18, { size: Math.max(9, Math.round(d * 0.55)), align: 'center', weight: 800, color: PAL.bone, ow: 0 });
  ctx.lineWidth = Math.max(1, d * 0.09); ctx.strokeStyle = MARK_COL.up;
  ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/**
 * 비교 표. r = {x, y, w, h}. info = compareInfo(...).
 * 머리: "착용 중인 ○○과 비교" (빈 칸이면 "빈 칸에 장착") + 오른쪽 종합 점수 · 줄: 능력치 증감 2열 · 끝: 초당 피해 어림 · +효과/잃는 효과
 * opts: { maxRows (능력치 줄 수, 2열이면 줄당 2개), size, head: false(머리 생략), hint: 비교할 수 없을 때 보탤 말 }
 */
export function drawCompare(ctx, r, info, { maxRows = 4, size = 12, head = true } = {}) {
  let y = r.y;
  const lh = Math.max(size + 6, 18);
  if (!info) return 0;
  if (!info.comparable) {
    text(ctx, ellipsize(ctx, info.reason || '비교할 수 없는 장비입니다', r.w, size + 1, 700), r.x, y + size + 2, { size: size + 1, weight: 700, color: PAL.dim, ow: 2 });
    return lh + 4;
  }
  if (head) {
    const badge = info.here ? '장착 중' : `종합 ${scoreStr(info.score)}`;
    const bw = measure(ctx, badge, size + 2, 800, FONT.num) + (info.here ? 8 : 26);
    const vs = info.here ? '지금 장착 중인 장비입니다' : info.vs ? `착용 중인 ${josa(itemName(info.vs), '과/와')} 비교` : '빈 칸에 장착';
    text(ctx, ellipsize(ctx, vs, r.w - bw - 10, size, 700), r.x, y + size + 2, { size, weight: 700, color: info.vs ? RARITY_COL[info.vs.rarity ?? 0] : PAL.dim, ow: 2 });
    if (!info.here) drawMark(ctx, r.x + r.w - bw + 8, y + size * 0.7 + 2, size, info.mark);
    text(ctx, badge, r.x + r.w, y + size + 3, { size: size + 2, align: 'right', weight: 800, family: FONT.num, color: info.here ? PAL.dim : MARK_COL[info.mark] ?? PAL.bone, ow: 3 });
    y += lh + 2;
  }
  if (info.here) return y - r.y;
  const rows = info.rows || [];
  const cw = r.w / 2;
  const n = Math.min(rows.length, maxRows * 2);
  if (!rows.length) { text(ctx, '능력치 변화 없음', r.x, y + size, { size, color: PAL.dim, ow: 2 }); y += lh; }
  for (let i = 0; i < n; i++) {
    const rw = rows[i], x = r.x + (i % 2) * cw, yy = y + Math.floor(i / 2) * lh + size;
    const col = rw.d > 0 ? PAL.good : PAL.bad;
    const val = `${rw.d > 0 ? '+' : '−'}${statStr(rw.k, rw.d)}`;
    const vw = measure(ctx, val, size + 1, 800, FONT.num);
    text(ctx, ellipsize(ctx, statName(rw.k), cw - vw - 18, size, 600), x, yy, { size, weight: 600, color: PAL.text, ow: 2 });
    text(ctx, val, x + cw - 10, yy, { size: size + 1, align: 'right', weight: 800, family: FONT.num, color: col, ow: 3 });
  }
  if (rows.length) y += Math.ceil(n / 2) * lh;
  if (rows.length > n) { text(ctx, `외 ${rows.length - n}개`, r.x + r.w, y - lh + size, { size: size - 1, align: 'right', color: PAL.faint, ow: 2 }); }
  if (info.dps && y + lh <= r.y + r.h + 2) {
    const d = info.dps, pc = d.pct;
    const s = `초당 피해 어림 ${kNum(d.from)} → ${kNum(d.to)}`;
    text(ctx, ellipsize(ctx, s, r.w - 60, size, 600), r.x, y + size, { size, weight: 600, color: PAL.bone, ow: 2 });
    if (Math.abs(pc) >= 0.05) text(ctx, `${pc > 0 ? '+' : '−'}${Math.round(Math.abs(pc) * 10) / 10}%`, r.x + r.w, y + size, { size: size + 1, align: 'right', weight: 800, family: FONT.num, color: pc > 0 ? PAL.good : PAL.bad, ow: 3 });
    y += lh;
  }
  const notes = [];
  if (info.effect) notes.push(['+효과 — 고유 효과는 점수에 들지 않습니다', '#ffb040']);
  if (info.loseEffect) notes.push(['바꾸면 착용 중 장비의 고유 효과가 사라집니다', '#ff9a7a']);
  if (!info.lvOk) notes.push(['레벨이 모자라 아직 장착할 수 없습니다', PAL.bad]);
  for (const [t, c] of notes) {
    if (y + lh > r.y + r.h + 2) break;
    text(ctx, ellipsize(ctx, t, r.w, size - 1, 700), r.x, y + size, { size: size - 1, weight: 700, color: c, ow: 2 });
    y += lh - 2;
  }
  return y - r.y;
}

// ───────────────────────── 모달 공통 ─────────────────────────
class ModalBase {
  constructor() { this.t = 0; this.open = true; this.i = 0; this.rects = []; this.box = null; }
  close(ok) {
    if (!this.open) return;
    this.open = false;
    audio.sfx(ok ? 'menu_ok' : 'menu_cancel');
    this.onClose?.(ok);
  }
  /** 단추 [확인, 취소] 판정 — 반환: true(확인) · false(취소) · null(아직) */
  buttons(nav, ges, n) {
    if (n > 1 && (nav.left || nav.right)) { this.i = (this.i + 1) % n; audio.sfx('menu_move'); }
    for (let k = 0; k < this.rects.length; k++) {
      if (ges.hoverIn?.(this.rects[k])) this.i = k;
      if (ges.tap(this.rects[k])) return this.rects[k].ok;
    }
    if (nav.confirm) return this.rects[this.i]?.ok ?? true;
    if (nav.cancel || nav.menu) return false;
    return null;
  }
  shell(ctx, vw, vh, w, h, title) {
    const k = ease.outBack(clamp(this.t / 0.18, 0, 1));
    const x = Math.round((vw - w) / 2), y = Math.round(clamp((vh - h) / 2, 8, Math.max(8, vh - h - 8)));
    this.box = { x, y, w, h };
    ctx.fillStyle = `rgba(0,0,0,${0.55 * clamp(this.t / 0.12, 0, 1)})`; ctx.fillRect(0, 0, vw, vh);
    ctx.translate(vw / 2, y + h / 2); ctx.scale(0.86 + 0.14 * k, 0.86 + 0.14 * k); ctx.translate(-vw / 2, -(y + h / 2));
    ctx.globalAlpha = clamp(this.t / 0.1, 0, 1);
    glowOval(ctx, vw / 2, y + h / 2, w * 0.75, h * 0.8, '#4a2a10', 0.45);
    frame(ctx, x, y, w, h, { top: 'rgba(36,16,34,0.98)', bot: 'rgba(10,4,12,0.98)', edge: PAL.goldMid });
    text(ctx, title, vw / 2, y + 30, { size: 18, align: 'center', weight: 800, family: FONT.title, color: PAL.gold, maxWidth: w - 30 });
    divider(ctx, x + 30, y + 42, w - 60);
    return { x, y };
  }
  drawButtons(ctx, x, y, w, h, labels) {
    const bh = input.touchMode ? 44 : 36, bw = Math.min(170, (w - 50) / labels.length);
    const by = y + h - bh - 14;
    this.rects.length = 0;
    labels.forEach(([lb, ok], i) => {
      const bx = x + w / 2 + (labels.length === 1 ? -bw / 2 : i === 0 ? -bw - 8 : 8);
      const r = { x: bx, y: by, w: bw, h: bh, ok };
      this.rects.push(zone(r, 'primary', this, { src: 'gear.modal' }));
      gbutton(ctx, r, lb, { hot: this.i === i, t: this.t, size: 15 });
    });
    return by;
  }
}

const SLOT_LABEL = (s) => SLOT_NAMES[s] ?? s;
const nameOfUid = (state, uid) => { const it = findItem(state, uid); return it ? itemName(it) : '비어 있음'; };
const colOfUid = (state, uid) => { const it = findItem(state, uid); return it ? RARITY_COL[it.rarity ?? 0] : PAL.faint; };
const FIX_WHY = { locked: '잠긴 장비라 바꾸지 않습니다', special: '고유·신화 장비라 바꾸지 않습니다' };   // 「둡」 은 부분 글꼴에 없다 (qafix)

/**
 * 최적 장착 미리보기. plans = bestLoadout 결과 1개(장비 탭) 또는 planAll().plans(파티 화면).
 * onApply() 는 확인했을 때만. 바뀌는 것이 없으면 안내 + 확인 단추 하나
 */
export class LoadoutModal extends ModalBase {
  constructor({ state, plans, title = '최적 장착', onApply = null, onClose = null }) {
    super();
    this.state = state; this.plans = plans.filter(Boolean); this.title = title; this.onApply = onApply; this.onClose = onClose;
    this.multi = this.plans.length > 1;
    this.nChanges = this.plans.reduce((a, p) => a + p.changes.length, 0);
    this.total = this.plans.reduce((a, p) => a + p.total, 0);
    this.i = 0;
  }
  update(dt, nav, ges) {
    this.t += dt;
    if (!this.open) return false;
    const r = this.buttons(nav, ges, this.nChanges ? 2 : 1);
    if (r === null) return true;
    if (r && this.nChanges) { this.open = false; audio.sfx('item'); this.onApply?.(); this.onClose?.(true); return false; }
    this.close(false);
    return false;
  }
  lines() {
    const st = this.state, out = [];
    if (this.multi) {
      for (const p of this.plans) {
        const nm = CHARACTERS[p.heroId]?.name?.split(' ')[0] ?? p.heroId;
        out.push({ kind: 'hero', label: nm, sub: p.changes.length ? `${p.changes.length}칸 교체` : '그대로', score: p.changes.length ? p.total : null });
      }
      return out;
    }
    const p = this.plans[0];
    if (!p) return out;
    for (const c of p.changes) out.push({ kind: 'slot', slot: c.slot, from: c.from, to: c.to, score: c.score });
    for (const f of p.fixed) out.push({ kind: 'fixed', slot: f.slot, why: f.why });
    return out;
  }
  render(ctx, vw, vh) {
    ctx.save();
    const L = this.lines();
    const rowH = input.touchMode ? 34 : 28;
    const w = Math.min(560, vw - 30);
    const maxRows = Math.max(2, Math.floor((vh - 190) / rowH));
    const rows = L.slice(0, maxRows);
    const h = 60 + Math.max(1, rows.length) * rowH + 64 + (input.touchMode ? 58 : 50);
    const { x, y } = this.shell(ctx, vw, vh, w, h, this.title);
    let yy = y + 56;
    if (!this.nChanges) {
      text(ctx, '지금 장비가 가장 좋습니다', vw / 2, yy + 22, { size: 15, align: 'center', weight: 700, color: PAL.bone });
      yy += rowH + 6;
    }
    for (const l of rows) {
      if (l.kind === 'fixed' && !this.nChanges && !rows.some((q) => q.kind === 'slot')) { /* 고정 칸 안내만 */ }
      const cy = yy + rowH / 2 + 5;
      if (l.kind === 'hero') {
        text(ctx, l.label, x + 24, cy, { size: 14, weight: 800, color: PAL.goldHi, ow: 2 });
        text(ctx, l.sub, x + 120, cy, { size: 13, weight: 600, color: l.score != null ? PAL.text : PAL.dim, ow: 2 });
      } else if (l.kind === 'slot') {
        const lab = SLOT_LABEL(l.slot);
        text(ctx, lab, x + 20, cy, { size: 12, weight: 700, color: PAL.dim, ow: 2 });
        const nx = x + 84, room = w - 84 - 80;
        const a = nameOfUid(this.state, l.from), b = nameOfUid(this.state, l.to);
        const half = (room - 26) / 2;
        text(ctx, ellipsize(ctx, a, half, 13, 600), nx, cy, { size: 13, weight: 600, color: colOfUid(this.state, l.from), ow: 2 });
        text(ctx, '→', nx + half + 4, cy, { size: 13, weight: 800, color: PAL.gold, ow: 2 });
        text(ctx, ellipsize(ctx, b, half, 13, 800), nx + half + 24, cy, { size: 13, weight: 800, color: colOfUid(this.state, l.to), ow: 2 });
      } else {
        text(ctx, SLOT_LABEL(l.slot), x + 20, cy, { size: 12, weight: 700, color: PAL.faint, ow: 2 });
        text(ctx, ellipsize(ctx, `${nameOfUid(this.state, this.plans[0].before[l.slot])} — ${FIX_WHY[l.why] ?? '바꾸지 않습니다'}`, w - 104, 12, 600), x + 84, cy, { size: 12, weight: 600, color: PAL.faint, ow: 2 });
      }
      if (l.score != null) {
        drawMark(ctx, x + w - 70, cy - 5, 11, l.score > 0.05 ? 'up' : l.score < -0.05 ? 'down' : 'eq');
        text(ctx, scoreStr(l.score), x + w - 20, cy, { size: 14, align: 'right', weight: 800, family: FONT.num, color: l.score > 0.05 ? PAL.good : l.score < -0.05 ? PAL.bad : PAL.dim, ow: 3 });
      }
      yy += rowH;
    }
    if (L.length > rows.length) { text(ctx, `외 ${L.length - rows.length}줄`, x + w - 20, yy + 12, { size: 11, align: 'right', color: PAL.faint }); }
    // 총 증감
    divider(ctx, x + 20, yy + 8, w - 40, { center: false, a: 0.5 });
    if (this.nChanges) {
      const p0 = this.plans[0];
      text(ctx, '종합', x + 24, yy + 34, { size: 14, weight: 800, color: PAL.gold, ow: 2 });
      text(ctx, `${scoreStr(this.total)}`, x + 84, yy + 34, { size: 17, weight: 900, family: FONT.num, color: this.total >= 0 ? PAL.good : PAL.bad, ow: 3 });
      if (!this.multi && p0?.dps) {
        const s = `초당 피해 ${kNum(p0.dps.from)} → ${kNum(p0.dps.to)}  ·  생존력 ${p0.ehp.pct >= 0 ? '+' : '−'}${Math.round(Math.abs(p0.ehp.pct))}%`;
        text(ctx, ellipsize(ctx, s, w - 190, 12, 600), x + w - 20, yy + 33, { size: 12, align: 'right', weight: 600, color: PAL.bone, ow: 2 });
      } else if (this.multi) text(ctx, '지금 영웅이 먼저 고릅니다', x + w - 20, yy + 33, { size: 12, align: 'right', weight: 600, color: PAL.dim, ow: 2 });
    } else text(ctx, '바꿀 장비가 없습니다', x + 24, yy + 34, { size: 13, weight: 600, color: PAL.dim, ow: 2 });
    this.drawButtons(ctx, x, y, w, h, this.nChanges ? [['장착하기', true], ['취소', false]] : [['확인', false]]);
    ctx.restore();
  }
}

export const RARITY_LIMIT_NAMES = ['일반 이하', '고급 이하', '희귀 이하'];
/**
 * 일괄 처분 미리보기: 기준(희귀도 이하) · 방식(판매/분해)을 고르고 개수·골드를 본 뒤 확인.
 * preview(maxRarity, mode) → { count, gold, mats } (호출한 쪽이 inventory.disposeCandidates 로 계산), onApply(maxRarity, mode)
 */
export class DisposeModal extends ModalBase {
  constructor({ maxRarity = 0, mode = 'sell', preview, onApply, onClose = null, note = '' }) {
    super();
    this.maxRarity = clamp(maxRarity | 0, 0, 2); this.mode = mode === 'salvage' ? 'salvage' : 'sell';
    this.preview = preview; this.onApply = onApply; this.onClose = onClose; this.note = note;
    this.row = 0; this.res = null; this.dirty = true;
    this.optRects = [];
  }
  calc() { if (this.dirty) { this.res = this.preview?.(this.maxRarity, this.mode) ?? { count: 0, gold: 0 }; this.dirty = false; } return this.res; }
  update(dt, nav, ges) {
    this.t += dt;
    if (!this.open) return false;
    for (const o of this.optRects) if (ges.tap(o)) { this.set(o.key, o.v); return true; }
    if (nav.up || nav.down) { this.row = (this.row + (nav.up ? 2 : 1)) % 3; audio.sfx('menu_move'); return true; }
    if (this.row < 2 && (nav.left || nav.right)) {
      const d = nav.left ? -1 : 1;
      if (this.row === 0) this.set('r', clamp(this.maxRarity + d, 0, 2)); else this.set('m', this.mode === 'sell' ? 'salvage' : 'sell');
      return true;
    }
    const r = this.buttons(this.row === 2 ? nav : { ...nav, left: false, right: false }, ges, 2);
    if (r === null) return true;
    if (r) {
      if (this.calc().count > 0) { this.open = false; audio.sfx('menu_ok'); this.onApply?.(this.maxRarity, this.mode); this.onClose?.(true); return false; }
      audio.sfx('menu_cancel'); return true;
    }
    this.close(false);
    return false;
  }
  set(key, v) {
    if (key === 'r' && v !== this.maxRarity) { this.maxRarity = v; this.dirty = true; audio.sfx('menu_move'); }
    if (key === 'm' && v !== this.mode) { this.mode = v; this.dirty = true; audio.sfx('menu_move'); }
  }
  render(ctx, vw, vh) {
    ctx.save();
    const res = this.calc();
    const w = Math.min(520, vw - 30), oh = input.touchMode ? 40 : 34;
    const h = 56 + oh * 2 + 24 + 64 + (this.note ? 20 : 0) + (input.touchMode ? 58 : 50);
    const { x, y } = this.shell(ctx, vw, vh, w, h, '일괄 처분');
    this.optRects.length = 0;
    const opt = (row, label, list, cur, key) => {
      const yy = y + 54 + row * (oh + 6);
      if (this.row === row) selBar(ctx, x + 12, yy, w - 24, oh, this.t);
      text(ctx, label, x + 24, yy + oh / 2 + 5, { size: 13, weight: 700, color: PAL.dim, ow: 2 });
      const bw = Math.min(96, (w - 130) / list.length - 6);
      list.forEach(([v, lb], i) => {
        const r = { x: x + 120 + i * (bw + 6), y: yy + 3, w: bw, h: oh - 6, key, v };
        this.optRects.push(zone(r, 'primary', this, { src: 'gear.dispose.opt' }));
        gbutton(ctx, r, lb, { hot: v === cur, size: 13, t: this.t });
      });
    };
    opt(0, '처분 기준', RARITY_LIMIT_NAMES.map((n, i) => [i, n]), this.maxRarity, 'r');
    opt(1, '방식', [['sell', '판매'], ['salvage', '분해']], this.mode, 'm');
    let yy = y + 54 + 2 * (oh + 6) + 18;
    const what = this.mode === 'salvage'
      ? `${res.count}개 분해 · 강화석 ${Object.values(res.mats || {}).reduce((a, b) => a + b, 0)}개`
      : `${res.count}개 판매 · +${kNum(res.gold)} G`;
    text(ctx, res.count ? what : '처분할 장비가 없습니다', vw / 2, yy + 8, { size: 17, align: 'center', weight: 800, color: res.count ? PAL.goldHi : PAL.dim, ow: 3 });
    yy += 26;
    text(ctx, '잠금·장착 중·고유·강화한 장비와 지금 영웅·다른 영웅에게 더 좋은 장비는 남깁니다', vw / 2, yy + 6, { size: 11, align: 'center', color: PAL.dim, maxWidth: w - 30 });
    if (this.note) text(ctx, this.note, vw / 2, yy + 24, { size: 11, align: 'center', color: PAL.faint, maxWidth: w - 30 });
    if (this.row !== 2) this.i = 0;
    this.drawButtons(ctx, x, y, w, h, [[this.mode === 'salvage' ? '분해하기' : '판매하기', true], ['취소', false]]);
    ctx.restore();
  }
}
