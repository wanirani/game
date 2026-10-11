// 인벤토리 탭: 분류 필터 · 정렬 · 아이템 격자(희귀도 테두리/+강화/수량/E 장착/잠금) · 상세 정보 · 사용/장착/잠금
// 터치: 아이템을 길게 누르면(0.45초) 바로 행동 메뉴, 한 번 더 누르기도 그대로. 목록은 끌거나 휠·오른쪽 스틱으로 스크롤 (P-01: 직접 스크롤한 뒤에는
// 방향키·패드로 선택을 옮길 때만 선택을 따라간다). 탭 영역은 ui.taps 등록부 (§6.3: 칸 44 · 분류·단추 44 CSS px 이상)
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp } from '../../core/math.js';
import { input } from '../../core/input.js';
import { drawSlot } from '../../render/icons.js';
import { Tab } from './base.js';
import {
  PAL, RARITY_COL, frame, heading, divider, brackets, glow, gbutton, Scroller, scrollbar, clipBegin, clipEnd, pill, para, rr,
  glyph, Popup, inRect, measure, wrapC, vGrad, fillPathGrad,
} from './common.js';
// 필터 단추 그라디언트 색 멈춤 (common.js 캐시 — 매 프레임 새 그라디언트 0, R1-REQ-341B)
const PILL_ON = [0, '#a0182e', 1, '#4a0614'], PILL_OFF = [0, 'rgba(40,24,36,0.9)', 1, 'rgba(14,8,14,0.9)'];
import { fmtStatVal } from './tab_status.js';
import * as D from './access.js';
import { josa } from '../town/common.js';
// [qol] 가방 표시 ▲/다른 영웅 얼굴 · 비교 표 · 거르기 · NEW · 일괄 처분 (qol_equip §3–§5)
import { bagMarks, disposeCriteria, gearSettings } from '../../game/gear_score.js';
import { disposeCandidates, disposeJunk, salvageYield, freeSlots } from '../../game/inventory.js';
import { compareInfo, drawCompare, drawMark, drawFace, DisposeModal, RARITY_LIMIT_NAMES } from './gear_compare.js';

// 다음에 가방 탭이 열릴 때 「일괄 처분」 창을 바로 연다 (스테이지 입장 경고 토스트의 바로가기 — pickup_compare.requestDispose)
import { takeDisposeRequest } from '../../game/pickup_compare.js';
const MIN_RARITY = [{ r: 0, name: '전체' }, { r: 1, name: '고급 이상' }, { r: 2, name: '희귀 이상' }, { r: 3, name: '영웅 이상' }, { r: 4, name: '전설 이상' }];
/** 가방 처분 미리보기·실행 (가방 탭 · 결과 화면이 같이 쓴다) */
export function disposePreview(state, settings, maxRarity, mode) {
  const crit = disposeCriteria(state, settings, { maxRarity });
  const list = disposeCandidates(state, crit);
  const mats = {};
  if (mode === 'salvage') for (const c of list) { const y = salvageYield(c.inst); if (y) mats[y.baseId] = (mats[y.baseId] ?? 0) + y.qty; }
  return { count: list.length, gold: list.reduce((a, c) => a + c.gold, 0), mats, list };
}

const FILTERS = [
  { id: 'all', name: '전체', test: () => true },
  { id: 'weapon', name: '무기', test: (b) => b.slot === 'weapon' },
  { id: 'armor', name: '방어구', test: (b) => b.slot === 'head' || b.slot === 'body' || b.slot === 'cloak' },
  { id: 'acc', name: '장신구', test: (b) => b.slot === 'acc' },
  { id: 'consumable', name: '소모품', test: (b) => b.slot === 'consumable' },
  { id: 'material', name: '재료', test: (b) => b.slot === 'material' },
  { id: 'key', name: '중요 물품', short: '중요', test: (b) => b.slot === 'key' },
];
const EQUIP_KINDS = new Set(['weapon', 'head', 'body', 'cloak', 'acc']);
const SORTS = [{ id: 'type', name: '종류순' }, { id: 'rarity', name: '희귀도순' }, { id: 'new', name: '최신순' }];

export class InventoryTab extends Tab {
  constructor(m) {
    super(m);
    this.fi = 0; this.i = 0; this.sub = 'grid';
    this.sc = new Scroller();
    this.rev = -1; this.items = []; this.cols = 8; this.cell = 56; this.gap = 6;
    this.cellRects = []; this.filterRects = []; this.sortRect = null; this.btnRects = [];
    this.flash = 0; this.sortMode = 0;
    this.minR = 0; this.usable = false; this.footRects = []; this.fi2 = 0;   // [qol] 거르기 · 아래 단추 줄
  }
  onShow() {
    this.rebuild();
    if (takeDisposeRequest()) { this.m.focus = 'content'; this.openDispose(); }
  }
  rebuild() {
    this.rev = this.m.rev;
    const f = FILTERS[this.fi];
    const out = [];
    const hero = this.hero;
    for (const inst of this.state.inventory) {
      const b = D.baseOf(inst);
      if (!b || !f.test(b)) continue;
      // [qol] 거르기: 희귀도 이상 (장비만) · 지금 영웅이 쓸 수 있는 장비만
      if (this.minR > 0 && (!EQUIP_KINDS.has(b.slot) || (inst.rarity ?? 0) < this.minR)) continue;
      if (this.usable && (!EQUIP_KINDS.has(b.slot) || !D.canEquipOf(this.state, hero, inst).ok)) continue;
      const by = D.equippedBy(this.state, inst.uid);
      const v = Object.create(inst);
      if (by) v.equipped = true;
      out.push({ inst, b, v, by });
    }
    this.items = out;
    this.i = clamp(this.i, 0, Math.max(0, out.length - 1));
  }
  get sel() { return this.items[this.i] || null; }
  setFilter(k) {
    k = (k + FILTERS.length) % FILTERS.length;
    if (k === this.fi) return;
    this.fi = k; this.i = 0; this.sc.reset(); this.rebuild(); audio.sfx('menu_move');
  }
  sort() {
    const mode = SORTS[this.sortMode];
    D.sortInv(this.state, mode.id);
    audio.sfx('menu_ok');
    this.m.notify(`${mode.name}으로 정렬했습니다`);
    this.sortMode = (this.sortMode + 1) % SORTS.length;
    this.m.changed(); this.rebuild();
  }
  /** 선택 아이템에 가능한 행동 목록 */
  actions(e) {
    if (!e) return [];
    const { inst, b } = e;
    const st = this.state, hero = this.hero;
    const out = [];
    if (b.slot === 'consumable' && b.use) {
      const can = !!this.m.inStage && !!this.world?.player;
      out.push({ id: 'use', label: '사용하기', disabled: !can, reason: '스테이지 안에서만 사용할 수 있습니다', run: () => this.use(e) });
    }
    if (EQUIP_KINDS.has(b.slot)) {
      const mine = Object.values(hero.equip || {}).includes(inst.uid);
      if (mine) out.push({ id: 'unequip', label: '해제하기', disabled: b.slot === 'weapon', reason: '무기는 해제할 수 없습니다', run: () => this.unequip(e) });
      else {
        const chk = D.canEquipOf(st, hero, inst);
        out.push({ id: 'equip', label: '장착하기', disabled: !chk.ok, reason: chk.reason, run: () => this.equip(e) });
      }
    }
    // 중요 물품은 애초에 팔거나 분해할 수 없으므로 잠금이 의미 없다
    if (b.slot !== 'key') out.push({ id: 'lock', label: inst.locked ? '잠금 해제' : '잠그기', sub: inst.locked ? '판매·분해 가능' : '실수로 팔지 않도록', run: () => this.lock(e) });
    return out;
  }
  use(e) {
    const r = D.useOf(this.state, this.hero, e.inst, this.world);
    if (r.ok) { audio.sfx('heal'); this.m.notify(r.msg || `${josa(e.b.name, '을', '를')} 사용했습니다`, PAL.good); this.flash = 1; }
    else { audio.sfx('menu_cancel'); this.m.notify(r.msg || '사용할 수 없습니다', PAL.bad); }
    this.m.changed(); this.rebuild();
  }
  equip(e) {
    D.equipTo(this.state, this.hero, e.inst.uid);
    audio.sfx('item');
    this.m.notify(`${D.nameOf(e.inst)} 장착!`, RARITY_COL[e.inst.rarity ?? 0]);
    this.flash = 1; this.m.changed(); this.rebuild();
  }
  unequip(e) {
    const eq = this.hero.equip;
    for (const s in eq) if (eq[s] === e.inst.uid) D.unequipOf(this.state, this.hero, s);
    audio.sfx('menu_cancel');
    this.m.notify('장비를 해제했습니다', PAL.dim);
    this.m.changed(); this.rebuild();
  }
  lock(e) {
    const on = D.toggleLockOf(this.state, e.inst);
    audio.sfx(on ? 'clang' : 'menu_move');
    this.m.notify(on ? '아이템을 잠갔습니다 — 판매·분해되지 않습니다' : '잠금을 풀었습니다', PAL.gold);
  }
  /** [qol] 거르기 창: 희귀도 이상 · 쓸 수 있는 것만 */
  openFilter(r) {
    const items = MIN_RARITY.map((m) => ({
      label: m.name, sub: this.minR === m.r ? '✓' : '', color: m.r ? RARITY_COL[m.r] : null,
      run: () => { this.minR = m.r; this.i = 0; this.sc.reset(); this.rebuild(); },
    }));
    items.push({ label: '쓸 수 있는 장비만', sub: this.usable ? '켬' : '끔', run: () => { this.usable = !this.usable; this.i = 0; this.sc.reset(); this.rebuild(); } });
    this.m.openModal(new Popup({ title: '거르기', items, x: r ? r.x : null, y: r ? r.y - 6 * 40 : null, w: 230 }));
  }
  /** [qol] 일괄 처분 미리보기 → 확인 (기준은 설정 「장비」 페이지의 값에서 시작, 판매한 것은 상점 「되사기」에 남는다) */
  openDispose() {
    const gs = gearSettings(this.game?.settings), st = this.state;
    this.m.openModal(new DisposeModal({
      maxRarity: gs.maxRarity, mode: gs.autoDispose === 'salvage' ? 'salvage' : 'sell',
      note: '판매한 장비는 마을 상점 「되사기」에서 다시 살 수 있습니다',
      preview: (mr, mode) => disposePreview(st, this.game?.settings, mr, mode),
      onApply: (mr, mode) => {
        const pv = disposePreview(st, this.game?.settings, mr, mode);
        const res = disposeJunk(st, null, { mode, buyback: mode === 'sell', list: pv.list });
        audio.sfx(mode === 'sell' ? 'coin' : 'clang');
        const nMat = Object.values(res.mats).reduce((a, b) => a + b, 0);
        this.m.notify(mode === 'sell' ? `${res.count}개 판매 · +${res.gold.toLocaleString('ko-KR')} G` : `${res.count}개 분해 · 강화석 ${nMat}개`, PAL.goldHi);
        this.i = 0; this.m.changed(); this.rebuild();
      },
    }));
  }
  openActions(e) {
    const acts = this.actions(e);
    if (!acts.length) return;
    const r = this.cellRects[this.i];
    this.m.openModal(new Popup({ title: D.nameOf(e.inst), items: acts, x: r ? r.x + r.w + 8 : null, y: r ? r.y : null, w: 220 }));
  }

  update(dt, nav, ges, focused) {
    if (this.rev !== this.m.rev) this.rebuild();
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.5);
    this.sc.update(dt, this.gridRect, ges);
    // 길게 누르기 → 그 아이템의 행동 메뉴 (§5.6)
    if (ges.longPress) {
      for (let k = 0; k < this.cellRects.length; k++) {
        if (!ges.held(this.cellRects[k])) continue;
        this.m.focus = 'content'; this.sub = 'grid'; this.i = k;
        this.openActions(this.sel);
        return;
      }
    }
    // 포인터
    for (let k = 0; k < this.filterRects.length; k++) if (ges.tap(this.filterRects[k])) { this.m.focus = 'content'; this.sub = 'grid'; this.setFilter(k); return; }
    if (ges.tap(this.sortRect) || (focused && nav.alt)) { this.m.focus = 'content'; this.sort(); return; }
    for (const b of this.btnRects) if (ges.tap(b)) { this.m.focus = 'content'; audio.sfx('menu_ok'); b.act.run(); return; }
    // [qol] 아래 단추 줄 (거르기 · 일괄 처분) · 키보드 R = 일괄 처분
    for (let k = 0; k < this.footRects.length; k++) if (ges.tap(this.footRects[k])) { this.m.focus = 'content'; audio.sfx('menu_ok'); this.footAct(k); return; }
    if (input.pressed('mount') && input.mode !== 'pad') { this.openDispose(); return; }
    if (this.sel?.inst?.isNew && this.sub === 'grid') delete this.sel.inst.isNew;   // NEW 표시: 한 번 고르면 사라진다
    if (!this.sc.dragging) {
      for (let k = 0; k < this.cellRects.length; k++) {
        const r = this.cellRects[k];
        if (!r || r.thid) continue;
        if (ges.hoverIn(r) && this.sub === 'grid') this.i = k;
        if (ges.tap(r)) {
          this.m.focus = 'content'; this.sub = 'grid';
          if (this.i === k) this.openActions(this.sel);
          else { this.i = k; audio.sfx('menu_move'); }
          return;
        }
      }
    }
    if (!focused) return;
    const n = this.items.length, C = this.cols;
    if (this.sub === 'foot') {
      if (nav.left || nav.right) { this.fi2 = 1 - this.fi2; audio.sfx('menu_move'); }
      if (nav.confirm) { audio.sfx('menu_ok'); this.footAct(this.fi2); }
      if (nav.up || nav.cancel) { this.sub = 'grid'; audio.sfx('menu_move'); }
      return;
    }
    if (this.sub === 'filter') {
      if (nav.left) this.setFilter(this.fi - 1);
      if (nav.right) this.setFilter(this.fi + 1);
      if (nav.down || nav.confirm) { this.sub = 'grid'; audio.sfx('menu_move'); }
      if (nav.up) { this.sub = 'grid'; this.m.focusTabs(); }
      if (nav.cancel) { this.sub = 'grid'; audio.sfx('menu_cancel'); }
      return;
    }
    let moved = false;
    if (nav.left && this.i > 0) { this.i--; moved = true; }
    if (nav.right && this.i < n - 1) { this.i++; moved = true; }
    if (nav.up) { if (this.i - C >= 0) { this.i -= C; moved = true; } else { this.sub = 'filter'; audio.sfx('menu_move'); } }
    if (nav.down && this.i + C < n) { this.i += C; moved = true; } else if (nav.down && Math.floor(this.i / C) < Math.floor((n - 1) / C)) { this.i = n - 1; moved = true; }
    else if (nav.down) { this.sub = 'foot'; audio.sfx('menu_move'); return; }   // [qol] 맨 아래 줄에서 ↓ → 거르기 · 일괄 처분
    if (moved) audio.sfx('menu_move');
    if (nav.confirm && this.sel) this.openActions(this.sel);
    if (nav.alt2 && this.sel && this.sel.b.slot !== 'key') this.lock(this.sel);
    if (nav.cancel) this.m.close();
  }
  footAct(k) { if (k === 0) this.openFilter(this.footRects[0]); else this.openDispose(); }
  hints() {
    if (this.sub === 'foot') return [['←→', '고르기'], ['Z', '열기'], ['↑', '목록']];
    if (this.sub === 'filter') return [['←→', '분류'], ['↓', '목록'], ['X', '돌아가기']];
    if (this.sel?.b.slot === 'key') return [['↑↓←→', '고르기'], ['A', SORTS[this.sortMode].name]];
    return [['↑↓←→', '고르기'], ['Z', '행동', '아이템을 길게 누르거나 한 번 더 터치하면 행동 메뉴'], ['A', SORTS[this.sortMode].name], ['C', '잠금'], ...(input.mode === 'pad' ? [] : [['R', '일괄 처분']])];
  }

  render(ctx, A) {
    if (this.rev !== this.m.rev) this.rebuild();
    const t = this.t, focused = this.m.focus === 'content';
    const DW = Math.round(clamp(A.w * 0.34, A.w < 760 ? 250 : 290, 360)); // 좁은 UI(720)에서는 상세 칸을 줄여 격자·분류 자리를 남긴다
    const GW = A.w - DW - 12;
    frame(ctx, A.x, A.y, GW, A.h);
    // ── 분류 필터 ──
    const touch = input.touchMode;
    this.filterRects.length = 0;
    let fx = A.x + 12;
    const fy = A.y + 10, fh = touch ? 36 : 30;
    const sw = touch ? 72 : 70, cnt = `${D.usedSlots(this.state)} / ${D.INV_LIMIT()}`;
    // 폭이 모자라면 분류 버튼의 좌우 여백을 줄여 오른쪽 수량 표시 자리를 남긴다. 터치는 버튼마다 48 px 이상 (§6.3 여유 포함 44 CSS px)
    const fgap = 6, avail = (A.x + GW - sw - 12) - fx - fgap;
    let fsize = 13, names = FILTERS.map((f) => f.name);
    let nameW = names.map((n) => measure(ctx, n, fsize, 800));
    const fit = (minW, pad) => nameW.reduce((a, w) => a + Math.max(minW, w + pad), 0) + fgap * (FILTERS.length - 1);
    let minW = touch ? 48 : 0, pad = clamp(Math.floor((avail - measure(ctx, cnt, 12, 700) - 18 - fgap * FILTERS.length - nameW.reduce((a, b) => a + b, 0)) / FILTERS.length), 14, 22);
    if (fit(minW, pad) > avail) { // 좁은 화면 (UI 배율을 크게 한 16:9 등): 줄임 이름 · 작은 글자
      names = FILTERS.map((f) => f.short ?? f.name); fsize = 12; nameW = names.map((n) => measure(ctx, n, fsize, 800)); pad = 12;
      if (fit(minW, pad) > avail) { minW = 0; pad = Math.max(4, Math.floor((avail - fgap * (FILTERS.length - 1) - nameW.reduce((a, b) => a + b, 0)) / FILTERS.length)); }
    }
    FILTERS.forEach((f, k) => {
      const w = Math.max(minW, nameW[k] + pad);
      const r = { x: fx, y: fy, w, h: fh };
      this.filterRects.push(r);
      const on = k === this.fi;
      rr(ctx, r.x, r.y, r.w, r.h, fh / 2);
      fillPathGrad(ctx, vGrad(ctx, r.h, on ? PILL_ON : PILL_OFF), 0, r.y);
      ctx.strokeStyle = on ? PAL.gold : this.m.ges.over(r) ? PAL.goldMid : PAL.goldDim; ctx.lineWidth = 1; ctx.stroke();
      text(ctx, names[k], r.x + r.w / 2, r.y + r.h / 2 + 5, { size: fsize, align: 'center', weight: 800, color: on ? PAL.goldHi : PAL.text, ow: 2 });
      if (on && this.sub === 'filter' && focused) brackets(ctx, r.x, r.y, r.w, r.h, t);
      fx += w + fgap;
    });
    // 정렬 버튼 + 수량
    this.sortRect = { x: A.x + GW - sw - 12, y: fy, w: sw, h: fh };
    gbutton(ctx, this.sortRect, '정렬', { icon: 'sort', size: 13, hot: this.m.ges.over(this.sortRect), t });
    if (this.m.ges.over(this.sortRect)) text(ctx, SORTS[this.sortMode].name, this.sortRect.x + sw / 2, this.sortRect.y + fh + 14, { size: 11, align: 'center', color: PAL.gold, weight: 700 });
    const cntUp = fx < this.sortRect.x - measure(ctx, cnt, 12, 700) - 16;
    if (cntUp) text(ctx, cnt, this.sortRect.x - 10, fy + fh / 2 + 5, { size: 12, align: 'right', weight: 700, family: FONT.num, color: PAL.dim });
    divider(ctx, A.x + 12, fy + fh + 8, GW - 24, { center: false, a: 0.5 });
    // ── 격자 ──
    const footH = touch ? 48 : 32;   // [qol] 아래 단추 줄 (가방 칸 수 · 거르기 · 일괄 처분)
    const GR = { x: A.x + 12, y: fy + fh + 16, w: GW - 24, h: A.h - (fh + 16) - 20 - footH - 6 };
    this.gridRect = GR;
    const cell = touch ? 60 : 56, gap = 6;
    const cols = Math.max(4, Math.floor((GR.w - 8 + gap) / (cell + gap)));
    this.cols = cols; this.cell = cell;
    const ox = GR.x + Math.floor((GR.w - 8 - (cols * (cell + gap) - gap)) / 2);
    const rows = Math.ceil(this.items.length / cols);
    this.sc.setMax(rows * (cell + gap) - gap - GR.h + 8);
    // 선택 따라가기: 방향키·패드로 선택을 옮긴 프레임에만 (끌기·휠로 옮긴 자리는 그대로 — P-01)
    if (this.items.length && this.sc.shouldFollow(this.i + '|' + this.fi)) { const ry = Math.floor(this.i / cols) * (cell + gap); this.sc.ensure(ry, ry + cell, GR.h, 6); }
    clipBegin(ctx, GR);
    this.cellRects.length = 0;
    // 빈 칸 격자 (배경)
    const visRows = Math.ceil(GR.h / (cell + gap)) + 1;
    const r0 = Math.floor(this.sc.y / (cell + gap));
    for (let r = r0; r < r0 + visRows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = ox + c * (cell + gap), y = GR.y + 4 + r * (cell + gap) - this.sc.y;
        const k = r * cols + c;
        if (k < this.items.length) continue;
        ctx.fillStyle = 'rgba(6,3,8,0.6)'; ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = 'rgba(110,85,48,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      }
    }
    const marks = bagMarks(this.state, this.hero?.charId, { budgetMs: 3, mode: gearSettings(this.game?.settings).weights });
    this.items.forEach((e, k) => {
      const c = k % cols, r = Math.floor(k / cols);
      const x = ox + c * (cell + gap), y = GR.y + 4 + r * (cell + gap) - this.sc.y;
      const rect = this.m.ges.zone({ x, y, w: cell, h: cell }, 'icon', { clip: GR, src: 'inv.cell' });
      this.cellRects[k] = rect;
      if (y > GR.y + GR.h || y + cell < GR.y) return;
      const sel = k === this.i && this.sub === 'grid';
      if (sel) glow(ctx, x + cell / 2, y + cell / 2, cell * 0.9, RARITY_COL[e.inst.rarity ?? 0], 0.3);
      drawSlot(ctx, x, y, cell, e.v, { selected: sel });
      // [qol] ▲ 지금 영웅에게 더 좋음 · 다른 영웅 얼굴 = 그 영웅에게 더 좋음 · NEW
      const mk = marks.get(e.inst.uid);
      if (mk?.mark === 'up') drawMark(ctx, x + cell - 9, y + 9, 11, 'up');
      else if (mk?.other) drawFace(ctx, x + cell - 10, y + 10, 16, mk.other);
      // NEW: 칸 왼쪽 위 붉은 점 (업적 화면의 새 항목 점과 같은 말 — 칸마다 작은 글자를 늘어놓지 않게)
      if (e.inst.isNew) { ctx.fillStyle = '#ff3050'; ctx.strokeStyle = '#fff0e0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + 8, y + 8, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      if (e.inst.locked) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 2, y + cell - 17, 15, 15); glyph(ctx, 'lock', x + 9.5, y + cell - 9.5, 10, PAL.gold, 1.4); }
      if (sel && focused) brackets(ctx, x, y, cell, cell, t);
    });
    if (!this.items.length) text(ctx, this.minR || this.usable ? '거르기에 맞는 아이템이 없습니다' : FILTERS[this.fi].id === 'all' ? '가방이 비어 있습니다' : '이 분류의 아이템이 없습니다', GR.x + GR.w / 2, GR.y + 60, { size: 14, align: 'center', color: PAL.faint });
    clipEnd(ctx, GR, this.sc);
    scrollbar(ctx, GR.x + GR.w - 4, GR.y, GR.h, this.sc, GR.h);
    // 분류·정렬 단추는 격자 칸보다 위에 등록 (스크롤로 반쯤 가려진 칸이 단추를 가로채지 않게)
    for (const r of this.filterRects) this.m.ges.zone(r, 'primary', { src: 'inv.filter' });
    this.m.ges.zone(this.sortRect, 'primary', { src: 'inv.sort' });
    // [qol] 아래 줄: 가방 칸 수(남은 칸 5 이하면 경고색) · 거르기 · 일괄 처분
    {
      const fy2 = GR.y + GR.h + 6, free = freeSlots(this.state);
      const low = free <= 5;
      // 칸 수는 위 줄에 이미 있으면 되풀이하지 않는다 (남은 칸이 적을 때만 경고와 함께)
      const cw0 = cntUp && !low ? 0 : measure(ctx, `가방 ${cnt}`, 13, 700, FONT.num) + 10;
      if (cw0) text(ctx, `가방 ${cnt}`, A.x + 16, fy2 + footH / 2 + 5, { size: 13, weight: 700, family: FONT.num, color: low ? PAL.bad : PAL.dim });
      if (low) text(ctx, free <= 0 ? '가득 찼습니다' : `남은 칸 ${free}`, A.x + 16 + cw0, fy2 + footH / 2 + 5, { size: 13, weight: 800, color: PAL.bad });
      const fl = this.minR || this.usable ? `거르기 · ${[this.minR ? MIN_RARITY[this.minR].name : '', this.usable ? '쓸 수 있는 것' : ''].filter(Boolean).join(' · ')}` : '거르기';
      const bw2 = 120, bw1 = Math.min(220, Math.max(88, measure(ctx, fl, 13, 800) + 28));
      const r2 = { x: A.x + GW - 12 - bw2, y: fy2, w: bw2, h: footH }, r1 = { x: r2.x - 8 - bw1, y: fy2, w: bw1, h: footH };
      this.footRects = [this.m.ges.zone(r1, 'primary', { src: 'inv.filter2' }), this.m.ges.zone(r2, 'primary', { src: 'inv.dispose' })];
      gbutton(ctx, r1, fl, { size: 13, hot: this.sub === 'foot' && this.fi2 === 0 && focused, t, color: this.minR || this.usable ? PAL.goldHi : null });
      gbutton(ctx, r2, '일괄 처분', { size: 13, hot: (this.sub === 'foot' && this.fi2 === 1 && focused) || low, t });
      if (this.sub === 'foot' && focused) { const rr2 = this.footRects[this.fi2]; brackets(ctx, rr2.x, rr2.y, rr2.w, rr2.h, t); }
    }

    // ── 상세 ──
    this.drawDetail(ctx, A.x + GW + 12, A.y, DW, A.h);
  }

  drawDetail(ctx, x, y, w, h) {
    frame(ctx, x, y, w, h);
    this.btnRects.length = 0;
    const e = this.sel, t = this.t;
    if (!e) { text(ctx, '아이템을 고르세요', x + w / 2, y + h / 2, { size: 14, align: 'center', color: PAL.faint }); return; }
    const { inst, b } = e;
    const rc = RARITY_COL[inst.rarity ?? 0];
    const equipKind = EQUIP_KINDS.has(b.slot);
    const rich = D.richDesc(inst);
    // 머리: 큰 아이콘 + 이름 + 분류
    const s = 76;
    glow(ctx, x + 18 + s / 2, y + 18 + s / 2, s * 0.95, rc, 0.28 + 0.08 * Math.sin(t * 3) + this.flash * 0.5);
    drawSlot(ctx, x + 18, y + 18, s, e.v);
    if (inst.locked) { ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x + 20, y + s - 2, 18, 18); glyph(ctx, 'lock', x + 29, y + s + 7, 12, PAL.gold, 1.4); }
    const tx = x + 30 + s, tw = w - (tx - x) - 14;
    const nameLines = wrapC(ctx, D.nameOf(inst), tw, 17, 800, FONT.title).slice(0, 2);
    nameLines.forEach((l, k) => text(ctx, l, tx, y + 38 + k * 21, { size: 17, weight: 800, family: FONT.title, color: rc, ow: 3 }));
    let py = y + 38 + nameLines.length * 21 - 6;
    let body = rich;
    if (rich && rich.length) {
      text(ctx, rich[0].text, tx, py + 12, { size: 12, weight: 700, color: rich[0].color || PAL.dim, ow: 2, maxWidth: tw });
      body = rich.slice(1);
    } else {
      const kind = b.slot === 'weapon' ? `무기 · ${D.WTYPE_NAME[b.wtype] ?? ''}` : D.SLOT_KIND[b.slot] ?? '';
      let px = tx;
      if (equipKind) px += pill(ctx, D.rarityName(inst.rarity ?? 0), px, py, { color: rc, size: 11, h: 18 }) + 6;
      text(ctx, kind, px, py + 13, { size: 12, weight: 700, color: PAL.dim });
    }
    if ((inst.qty ?? 1) > 1) text(ctx, `× ${inst.qty}`, x + w - 16, y + 24, { size: 14, align: 'right', weight: 800, family: FONT.num, color: PAL.bone });
    let cy = y + 18 + s + 16;
    divider(ctx, x + 14, cy, w - 28);
    cy += 8;
    // 장착 상태 / 경고
    const hero = this.hero;
    const warn = [];
    if (e.by) warn.push({ text: `${D.CHARACTERS()[e.by]?.name ?? ''} 장착 중`, color: PAL.gold });
    if (equipKind && !e.by) { const chk = D.canEquipOf(this.state, hero, inst); if (!chk.ok) warn.push({ text: chk.reason, color: PAL.bad }); }
    for (const wl of warn) { cy += 18; text(ctx, wl.text, x + 18, cy, { size: 12, weight: 800, color: wl.color }); }
    // 본문
    const btnH = input.touchMode ? 44 : 36, footer = y + h - btnH - 40;
    // [qol] 착용 중 장비와 비교 (장비 탭과 같은 표 — 지금 영웅 기준)
    if (equipKind && footer - cy > 130) {
      const ci = compareInfo(this.state, hero, inst);
      if (ci && !ci.here) {   // 지금 영웅이 입고 있는 장비는 위 '장착 중' 줄로 충분
        cy += 6;
        const used = drawCompare(ctx, { x: x + 18, y: cy, w: w - 36, h: Math.min(124, footer - cy - 40) }, ci, { maxRows: 2, size: 13 });
        cy += used + 4;
        divider(ctx, x + 18, cy, w - 36, { center: false, a: 0.35 });
      }
    }
    cy += 8;
    const lines = body ?? this.fallbackLines(inst, b);
    let flavorDone = false;
    for (const l of lines) {
      if (cy > footer - 16) break;
      if (l.flavor && !flavorDone) { cy += 4; divider(ctx, x + 18, cy, w - 36, { center: false, a: 0.35 }); cy += 8; flavorDone = true; }
      const size = l.flavor ? 12 : 13;
      const maxL = Math.max(1, Math.floor((footer - cy) / (size * 1.5)));
      cy += 14 + para(ctx, l.text, x + 18, cy + 12, w - 36, { size, color: l.color || (l.flavor ? '#b8a88a' : PAL.text), lh: 1.5, max: maxL, weight: l.flavor ? 500 : 600 }) - size * 1.5 + 4;
    }
    // 바닥: 판매가 + 버튼
    const sell = D.sellOf(inst);
    const sellTxt = b.slot === 'key' ? '판매 불가' : inst.locked ? '잠김 · 판매·분해 불가' : `판매가 ${sell.toLocaleString('ko-KR')} G`;
    text(ctx, sellTxt, x + 18, y + h - btnH - 20, { size: 12, weight: 700, color: inst.locked ? PAL.gold : PAL.dim });
    const acts = this.actions(e);
    const bw = (w - 28 - (acts.length - 1) * 6) / Math.max(1, acts.length);
    acts.forEach((a, k) => {
      const r = { x: x + 14 + k * (bw + 6), y: y + h - btnH - 12, w: bw, h: btnH, act: a };
      if (!a.disabled) this.btnRects.push(this.m.ges.zone(r, 'primary', { src: 'inv.act' }));
      const label = a.id === 'lock' ? (inst.locked ? '잠금 해제' : '잠금') : a.label.replace('하기', '');
      gbutton(ctx, r, label, { hot: k === 0 && !a.disabled && acts.length > 1, disabled: a.disabled, size: 13, t, icon: a.id === 'lock' ? 'lock' : null });
    });
  }
  /** items.js 설명 함수가 없을 때의 대체 설명 */
  fallbackLines(inst, b) {
    const out = [];
    if (EQUIP_KINDS.has(b.slot)) {
      out.push({ text: `요구 레벨 ${b.lvReq ?? 1}`, color: PAL.dim });
      const st = D.statsOf(inst);
      for (const k in st) if (Math.abs(st[k]) >= 0.05) out.push({ text: `${D.STAT_INFO[k]?.name ?? k} +${fmtStatVal(k, st[k])}`, color: PAL.bone });
    }
    for (const l of D.descLines(inst)) out.push({ ...l, flavor: true });
    return out;
  }
}
