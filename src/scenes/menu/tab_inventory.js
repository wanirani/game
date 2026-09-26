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
  { id: 'key', name: '열쇠', test: (b) => b.slot === 'key' },
];
const EQUIP_KINDS = new Set(['weapon', 'head', 'body', 'cloak', 'acc']);

export class InventoryTab extends Tab {
  constructor(m) {
    super(m);
    this.fi = 0; this.i = 0; this.sub = 'grid';
    this.sc = new Scroller();
    this.rev = -1; this.items = []; this.cols = 8; this.cell = 56; this.gap = 6;
    this.cellRects = []; this.filterRects = []; this.sortRect = null; this.btnRects = [];
    this.flash = 0;
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
    D.sortInv(this.state);
    audio.sfx('menu_ok');
    this.m.notify('아이템을 정렬했습니다');
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
    out.push({ id: 'lock', label: inst.locked ? '잠금 해제' : '잠그기', sub: inst.locked ? '판매·분해 가능' : '실수로 팔지 않도록', run: () => this.lock(e) });
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
    e.inst.locked = !e.inst.locked;
    audio.sfx(e.inst.locked ? 'clang' : 'menu_move');
    this.m.notify(e.inst.locked ? '아이템을 잠갔습니다' : '잠금을 풀었습니다', PAL.gold);
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
      if (nav.up || nav.cancel) { this.sub = 'grid'; this.m.focusTabs(); }
      return;
    }
    let moved = false;
    if (nav.left && this.i > 0) { this.i--; moved = true; }
    if (nav.right && this.i < n - 1) { this.i++; moved = true; }
    if (nav.up) { if (this.i - C >= 0) { this.i -= C; moved = true; } else { this.sub = 'filter'; audio.sfx('menu_move'); } }
    if (nav.down && this.i + C < n) { this.i += C; moved = true; } else if (nav.down && Math.floor(this.i / C) < Math.floor((n - 1) / C)) { this.i = n - 1; moved = true; }
    if (moved) audio.sfx('menu_move');
    if (nav.confirm && this.sel) this.openActions(this.sel);
    if (nav.alt2 && this.sel) this.lock(this.sel);
    if (nav.cancel) this.m.focusTabs();
  }
  hints() {
    if (this.sub === 'filter') return [['←→', '분류'], ['↓', '목록']];
    return [['↑↓←→', '고르기'], ['Z', '행동', '아이템을 한 번 더 터치하면 행동 메뉴'], ['A', '정렬'], ['C', '잠금']];
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
    FILTERS.forEach((f, k) => {
      const w = measure(ctx, f.name, 13, 800) + 22;
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
    const sw = 70;
    this.sortRect = { x: A.x + GW - sw - 12, y: fy, w: sw, h: fh };
    gbutton(ctx, this.sortRect, '정렬', { icon: 'sort', size: 13, hot: this.m.ges.over(this.sortRect), t });
    const cnt = `${this.state.inventory.length} / ${D.INV_LIMIT()}`;
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
    // 머리: 큰 아이콘 + 이름
    const s = 76;
    glow(ctx, x + 18 + s / 2, y + 18 + s / 2, s * 0.95, rc, 0.28 + 0.08 * Math.sin(t * 3) + this.flash * 0.5);
    drawSlot(ctx, x + 18, y + 18, s, e.v);
    const tx = x + 30 + s, tw = w - (tx - x) - 14;
    const nameLines = wrapC(ctx, D.nameOf(inst), tw, 17, 800, FONT.title).slice(0, 2);
    nameLines.forEach((l, k) => text(ctx, l, tx, y + 38 + k * 21, { size: 17, weight: 800, family: FONT.title, color: rc, ow: 3 }));
    let py = y + 38 + nameLines.length * 21 - 6;
    const kind = b.slot === 'weapon' ? `무기 · ${D.WTYPE_NAME[b.wtype] ?? ''}` : D.SLOT_KIND[b.slot] ?? '';
    let px = tx;
    if (EQUIP_KINDS.has(b.slot)) px += pill(ctx, D.rarityName(inst.rarity ?? 0), px, py, { color: rc, size: 11, h: 18 }) + 6;
    text(ctx, kind, px, py + 13, { size: 12, weight: 700, color: PAL.dim });
    if (b.tier && EQUIP_KINDS.has(b.slot)) text(ctx, `${b.tier}등급`, x + w - 14, y + 22, { size: 11, align: 'right', weight: 700, family: FONT.num, color: PAL.dim });
    // 요구/장착
    let cy = y + 18 + s + 18;
    divider(ctx, x + 14, cy, w - 28);
    cy += 22;
    const hero = this.hero;
    if (EQUIP_KINDS.has(b.slot)) {
      const lvOk = (b.lvReq ?? 1) <= hero.level;
      text(ctx, `요구 레벨 ${b.lvReq ?? 1}`, x + 18, cy, { size: 12, weight: 700, color: lvOk ? PAL.text : PAL.bad });
      if (e.by) text(ctx, `${D.CHARACTERS()[e.by]?.name?.split(' ')[0] ?? ''} 장착 중`, x + w - 16, cy, { size: 12, align: 'right', weight: 800, color: PAL.gold });
      else if (b.slot === 'weapon' && b.wtype && !(D.CHARACTERS()[hero.charId]?.weaponTypes ?? []).includes(b.wtype)) text(ctx, '다룰 수 없는 무기', x + w - 16, cy, { size: 12, align: 'right', weight: 700, color: PAL.bad });
      cy += 10;
      // 능력치
      const st = D.statsOf(inst);
      const keys = Object.keys(st).filter((k) => Math.abs(st[k]) >= 0.05);
      const affix = new Set((inst.affixes || []).map((a) => a.stat));
      keys.forEach((k) => {
        cy += 19;
        text(ctx, D.STAT_INFO[k]?.name ?? k, x + 22, cy, { size: 13, weight: 600, color: affix.has(k) ? '#9ac8ff' : PAL.text, ow: 2 });
        text(ctx, `+${fmtStatVal(k, st[k])}`, x + w - 18, cy, { size: 14, align: 'right', weight: 800, family: FONT.num, color: PAL.bone, ow: 3 });
      });
      if (b.element) { cy += 19; text(ctx, '속성', x + 22, cy, { size: 13, weight: 600, color: PAL.text }); text(ctx, ({ holy: '신성', fire: '화염', ice: '냉기', dark: '암흑', thunder: '번개' })[b.element] ?? b.element, x + w - 18, cy, { size: 13, align: 'right', weight: 800, color: '#ffd9a0' }); }
      if ((inst.affixes || []).length) { cy += 16; text(ctx, `추가 옵션 ${inst.affixes.length}개 (파란색)`, x + 22, cy, { size: 11, color: '#7aa8e8', weight: 600 }); }
      cy += 10;
    } else if (inst.qty > 1 || b.stack) {
      text(ctx, `보유 수량 ${inst.qty ?? 1}${b.stack ? ` / ${b.stack}` : ''}`, x + 18, cy, { size: 12, weight: 700, color: PAL.text });
      cy += 6;
    }
    // 설명
    const lines = D.descLines(inst);
    const btnH = 36, footer = y + h - btnH - 50;
    cy += 18;
    for (const l of lines) {
      if (cy > footer - 14) break;
      cy += para(ctx, l.text, x + 18, cy, w - 36, { size: 13, color: l.color || '#d8ccb8', lh: 1.5, max: Math.max(1, Math.floor((footer - cy) / 19)) });
    }
    // 바닥: 판매가 + 버튼
    const sell = D.sellOf(inst);
    text(ctx, inst.locked ? '잠김 · 판매 불가' : `판매가 ${sell.toLocaleString('ko-KR')} G`, x + 18, y + h - btnH - 24, { size: 12, weight: 700, color: inst.locked ? PAL.gold : PAL.dim });
    const acts = this.actions(e);
    const bw = (w - 28 - (acts.length - 1) * 6) / Math.max(1, acts.length);
    acts.forEach((a, k) => {
      const r = { x: x + 14 + k * (bw + 6), y: y + h - btnH - 12, w: bw, h: btnH, act: a };
      if (!a.disabled) this.btnRects.push(r);
      const label = a.id === 'lock' ? (inst.locked ? '잠금 해제' : '잠금') : a.label.replace('하기', '');
      gbutton(ctx, r, label, { hot: k === 0 && !a.disabled, disabled: a.disabled, size: 13, t, icon: a.id === 'lock' ? 'lock' : null });
    });
  }
}
