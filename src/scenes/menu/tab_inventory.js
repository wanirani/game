// 인벤토리 탭: 분류 필터 · 정렬 · 아이템 격자(희귀도 테두리/+강화/수량/E 장착/잠금) · 상세 정보 · 사용/장착/잠금
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp } from '../../core/math.js';
import { input } from '../../core/input.js';
import { drawSlot } from '../../render/icons.js';
import { Tab } from './base.js';
import {
  PAL, RARITY_COL, frame, heading, divider, brackets, glow, gbutton, Scroller, scrollbar, clipBegin, clipEnd, pill, para, rr,
  glyph, Popup, inRect, measure, wrapC,
} from './common.js';
import { fmtStatVal } from './tab_status.js';
import * as D from './access.js';

const FILTERS = [
  { id: 'all', name: '전체', test: () => true },
  { id: 'weapon', name: '무기', test: (b) => b.slot === 'weapon' },
  { id: 'armor', name: '방어구', test: (b) => b.slot === 'head' || b.slot === 'body' || b.slot === 'cloak' },
  { id: 'acc', name: '장신구', test: (b) => b.slot === 'acc' },
  { id: 'consumable', name: '소모품', test: (b) => b.slot === 'consumable' },
  { id: 'material', name: '재료', test: (b) => b.slot === 'material' },
  { id: 'key', name: '중요 물품', test: (b) => b.slot === 'key' },
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
  }
  onShow() { this.rebuild(); }
  rebuild() {
    this.rev = this.m.rev;
    const f = FILTERS[this.fi];
    const out = [];
    for (const inst of this.state.inventory) {
      const b = D.baseOf(inst);
      if (!b || !f.test(b)) continue;
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
      const can = !!this.world?.player;
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
    if (r.ok) { audio.sfx('heal'); this.m.notify(r.msg || `${e.b.name}을(를) 사용했습니다`, PAL.good); this.flash = 1; }
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
    // 포인터
    for (let k = 0; k < this.filterRects.length; k++) if (ges.tap(this.filterRects[k])) { this.m.focus = 'content'; this.sub = 'grid'; this.setFilter(k); return; }
    if (ges.tap(this.sortRect) || (focused && nav.alt)) { this.m.focus = 'content'; this.sort(); return; }
    for (const b of this.btnRects) if (ges.tap(b)) { this.m.focus = 'content'; audio.sfx('menu_ok'); b.act.run(); return; }
    if (!this.sc.dragging) {
      for (let k = 0; k < this.cellRects.length; k++) {
        const r = this.cellRects[k];
        if (!r || !inRect(r.x + r.w / 2, r.y + r.h / 2, this.gridRect)) continue;
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
    if (moved) audio.sfx('menu_move');
    if (nav.confirm && this.sel) this.openActions(this.sel);
    if (nav.alt2 && this.sel && this.sel.b.slot !== 'key') this.lock(this.sel);
    if (nav.cancel) this.m.close();
  }
  hints() {
    if (this.sub === 'filter') return [['←→', '분류'], ['↓', '목록'], ['X', '돌아가기']];
    if (this.sel?.b.slot === 'key') return [['↑↓←→', '고르기'], ['A', SORTS[this.sortMode].name]];
    return [['↑↓←→', '고르기'], ['Z', '행동', '아이템을 한 번 더 터치하면 행동 메뉴'], ['A', SORTS[this.sortMode].name], ['C', '잠금']];
  }

  render(ctx, A) {
    if (this.rev !== this.m.rev) this.rebuild();
    const t = this.t, focused = this.m.focus === 'content';
    const DW = Math.round(clamp(A.w * 0.34, 290, 360));
    const GW = A.w - DW - 12;
    frame(ctx, A.x, A.y, GW, A.h);
    // ── 분류 필터 ──
    this.filterRects.length = 0;
    let fx = A.x + 12;
    const fy = A.y + 10, fh = input.touchMode ? 34 : 30;
    const sw = 70, cnt = `${this.state.inventory.length} / ${D.INV_LIMIT()}`;
    // 폭이 모자라면 분류 버튼의 좌우 여백을 줄여 오른쪽 수량 표시 자리를 남긴다
    const nameW = FILTERS.map((f) => measure(ctx, f.name, 13, 800));
    const room = (A.x + GW - sw - 12) - measure(ctx, cnt, 12, 700) - 18 - fx - 6 * FILTERS.length;
    const pad = clamp(Math.floor((room - nameW.reduce((a, b) => a + b, 0)) / FILTERS.length), 14, 22);
    FILTERS.forEach((f, k) => {
      const w = nameW[k] + pad;
      const r = { x: fx, y: fy, w, h: fh };
      this.filterRects.push(r);
      const on = k === this.fi;
      rr(ctx, r.x, r.y, r.w, r.h, fh / 2);
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      if (on) { g.addColorStop(0, '#a0182e'); g.addColorStop(1, '#4a0614'); } else { g.addColorStop(0, 'rgba(40,24,36,0.9)'); g.addColorStop(1, 'rgba(14,8,14,0.9)'); }
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = on ? PAL.gold : this.m.ges.over(r) ? PAL.goldMid : PAL.goldDim; ctx.lineWidth = 1; ctx.stroke();
      text(ctx, f.name, r.x + r.w / 2, r.y + r.h / 2 + 5, { size: 13, align: 'center', weight: 800, color: on ? PAL.goldHi : PAL.text, ow: 2 });
      if (on && this.sub === 'filter' && focused) brackets(ctx, r.x, r.y, r.w, r.h, t);
      fx += w + 6;
    });
    // 정렬 버튼 + 수량
    this.sortRect = { x: A.x + GW - sw - 12, y: fy, w: sw, h: fh };
    gbutton(ctx, this.sortRect, '정렬', { icon: 'sort', size: 13, hot: this.m.ges.over(this.sortRect), t });
    if (this.m.ges.over(this.sortRect)) text(ctx, SORTS[this.sortMode].name, this.sortRect.x + sw / 2, this.sortRect.y + fh + 14, { size: 11, align: 'center', color: PAL.gold, weight: 700 });
    if (fx < this.sortRect.x - measure(ctx, cnt, 12, 700) - 16) text(ctx, cnt, this.sortRect.x - 10, fy + fh / 2 + 5, { size: 12, align: 'right', weight: 700, family: FONT.num, color: PAL.dim });
    divider(ctx, A.x + 12, fy + fh + 8, GW - 24, { center: false, a: 0.5 });
    // ── 격자 ──
    const GR = { x: A.x + 12, y: fy + fh + 16, w: GW - 24, h: A.h - (fh + 16) - 20 };
    this.gridRect = GR;
    const cell = input.touchMode ? 60 : 56, gap = 6;
    const cols = Math.max(4, Math.floor((GR.w - 8 + gap) / (cell + gap)));
    this.cols = cols; this.cell = cell;
    const ox = GR.x + Math.floor((GR.w - 8 - (cols * (cell + gap) - gap)) / 2);
    const rows = Math.ceil(this.items.length / cols);
    this.sc.setMax(rows * (cell + gap) - gap - GR.h + 8);
    if (this.items.length) { const ry = Math.floor(this.i / cols) * (cell + gap); this.sc.ensure(ry, ry + cell, GR.h, 6); }
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
    this.items.forEach((e, k) => {
      const c = k % cols, r = Math.floor(k / cols);
      const x = ox + c * (cell + gap), y = GR.y + 4 + r * (cell + gap) - this.sc.y;
      const rect = { x, y, w: cell, h: cell };
      this.cellRects[k] = rect;
      if (y > GR.y + GR.h || y + cell < GR.y) return;
      const sel = k === this.i && this.sub === 'grid';
      if (sel) glow(ctx, x + cell / 2, y + cell / 2, cell * 0.9, RARITY_COL[e.inst.rarity ?? 0], 0.3);
      drawSlot(ctx, x, y, cell, e.v, { selected: sel });
      if (e.inst.locked) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 2, y + cell - 17, 15, 15); glyph(ctx, 'lock', x + 9.5, y + cell - 9.5, 10, PAL.gold, 1.4); }
      if (sel && focused) brackets(ctx, x, y, cell, cell, t);
    });
    if (!this.items.length) text(ctx, FILTERS[this.fi].id === 'all' ? '가방이 비어 있습니다' : '이 분류의 아이템이 없습니다', GR.x + GR.w / 2, GR.y + 60, { size: 14, align: 'center', color: PAL.faint });
    clipEnd(ctx, GR, this.sc);
    scrollbar(ctx, GR.x + GR.w - 4, GR.y, GR.h, this.sc, GR.h);

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
    const btnH = 36, footer = y + h - btnH - 40;
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
      if (!a.disabled) this.btnRects.push(r);
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
