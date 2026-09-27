// 장비 탭: 6칸(무기/머리/몸/망토/장신구×2) → 칸 선택 시 장착 가능한 아이템 목록 + 능력치 비교(증감) + 영웅 외형 실시간 미리보기
// 가운데 미리보기는 턴테이블 (hero_view.js): 끌어서·휠·, . 키·오른쪽 스틱으로 돌려 앞·옆·뒷모습의 장비 색·망토·무기를 본다.
// 갑옷·머리·망토·장신구를 끼우면 한 바퀴 돌며 보여 준다 (움직임 줄이기면 시전 동작). 무기를 끼우면 공격 시연.
import { text, FONT, taps } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp } from '../../core/math.js';
import { input } from '../../core/input.js';
import { drawSlot } from '../../render/icons.js';
import { Tab } from './base.js';
import { HeroView, HeroStage, pedestal, accentOf, turntableHints, pxScale } from './hero_view.js';
import {
  PAL, RARITY_COL, frame, heading, divider, selBar, brackets, glow, gbutton, Scroller, scrollbar, clipBegin, clipEnd, ellipsize, pill, inRect,
} from './common.js';
import { fmtStatVal } from './tab_status.js';
import * as D from './access.js';
import { CHARACTERS } from '../../data/characters.js';

const SUMMARY = ['hp', 'mp', 'atk', 'mag', 'def', 'res', 'crit'];
const SLOT_ICON_EMPTY = { weapon: '무기', head: '머리', body: '몸', cloak: '망토', acc1: '장신구', acc2: '장신구' };

/** 아이템 핵심 능력치 요약 "공격력 +12 · 치명타 +3%" */
export function statLine(inst, max = 2) {
  const st = D.statsOf(inst);
  const keys = Object.keys(st).filter((k) => Math.abs(st[k]) >= 0.05).slice(0, max);
  return keys.map((k) => `${D.STAT_INFO[k]?.name ?? k} +${fmtStatVal(k, st[k])}`).join(' · ');
}

export class EquipTab extends Tab {
  constructor(m) {
    super(m);
    this.view = new HeroView({ turntable: true, game: m.game });
    this.stage = new HeroStage();
    this.heroRect = null;
    this.si = 0; this.sub = 'slots'; this.li = 0;
    this.sc = new Scroller();
    this.rev = -1; this.list = []; this.pv = null;
    this.slotRects = []; this.rowRects = []; this.btnRect = null;
    this.flashT = 0; this.flashSlot = null;
  }
  get slots() { return D.EQUIP_SLOTS(); }
  get slot() { return this.slots[this.si]; }
  onShow() { this.rebuild(); this.view.wake(); }
  free() { this.stage.free(); }
  /** 메뉴의 가로 밀기(탭 넘기기)를 무시할 곳: 회전 무대 (platform §5.6) */
  noSwipe(x, y) { return this.view.swipeBlock(x, y); }
  swipeBlock(x, y) { return this.view.swipeBlock(x, y); }
  base() {
    if (this.rev !== this.m.rev || !this.cur) {
      this.rev = this.m.rev;
      this.cur = { stats: D.computeStats(this.state, this.hero), look: D.composeLook(this.state, this.hero) };
      this.pv = null;
      this.rebuild();
    }
    return this.cur;
  }
  /** 선택한 칸의 후보 목록 */
  rebuild() {
    const st = this.state, hero = this.hero, slot = this.slot;
    const want = slot === 'acc1' || slot === 'acc2' ? 'acc' : slot;
    const curUid = hero.equip?.[slot] ?? null;
    const rows = [];
    if (curUid && slot !== 'weapon') rows.push({ unequip: true });
    for (const inst of st.inventory) {
      const b = D.baseOf(inst);
      if (!b || b.slot !== want) continue;
      const chk = D.canEquipOf(st, hero, inst);
      const by = D.equippedBy(st, inst.uid);
      const mine = Object.values(hero.equip || {}).includes(inst.uid);
      const here = inst.uid === curUid;
      rows.push({ inst, b, ok: chk.ok, reason: chk.reason, by: by && by !== hero.charId ? by : null, mine, here });
    }
    rows.sort((a, b) => {
      if (a.unequip) return -1; if (b.unequip) return 1;
      return (b.here - a.here) || (b.ok - a.ok) || ((b.inst.rarity ?? 0) - (a.inst.rarity ?? 0)) || ((b.b.tier ?? 0) - (a.b.tier ?? 0)) || ((b.inst.level ?? 0) - (a.inst.level ?? 0));
    });
    this.list = rows;
    this.li = clamp(this.li, 0, Math.max(0, rows.length - 1));
  }
  /** 후보(uid|null)를 slot 에 끼웠을 때의 능력치·외형 */
  preview(slot, uid) {
    const key = slot + '|' + uid + '|' + this.m.rev;
    if (this.pv?.key === key) return this.pv;
    const hero = this.hero, eq = hero.equip;
    const tmp = { ...eq };
    if (uid) for (const s in tmp) if (tmp[s] === uid) tmp[s] = null;
    tmp[slot] = uid;
    hero.equip = tmp;
    let stats = null, look = null;
    try { stats = D.computeStats(this.state, hero); look = D.composeLook(this.state, hero); } catch (e) { console.warn(e); } finally { hero.equip = eq; }
    this.pv = { key, stats, look };
    return this.pv;
  }
  get hoverRow() { return this.sub === 'list' ? this.list[this.li] : null; }

  doRow(row) {
    if (!row) return;
    const st = this.state, hero = this.hero, slot = this.slot;
    if (row.unequip) {
      D.unequipOf(st, hero, slot);
      audio.sfx('menu_cancel');
      this.m.notify(`${D.SLOT_NAMES()[slot]} 장비를 해제했습니다`, PAL.dim);
    } else {
      if (!row.ok) { audio.sfx('menu_cancel'); this.m.notify(row.reason || '장착할 수 없습니다', PAL.bad); return; }
      if (row.here) { audio.sfx('menu_move'); return; }
      const from = D.equippedBy(st, row.inst.uid);
      D.equipTo(st, hero, row.inst.uid, slot);
      audio.sfx('item');
      const other = from && from !== hero.charId ? CHARACTERS[from]?.name : null;
      this.m.notify(`${D.nameOf(row.inst)} 장착!${other ? ` (${other}에게서 가져옴)` : ''}`, RARITY_COL[row.inst.rarity ?? 0]);
      // 무기 = 공격 시연 · 갑옷·머리·망토·장신구 = 한 바퀴 돌며 보여 주기 (platform §7.2 장비 공개)
      if (slot === 'weapon') this.view.showcase(); else this.view.reveal();
    }
    this.flashT = 1; this.flashSlot = slot;
    this.m.changed();
    this.base();
    this.li = 0; this.sc.target = 0;
    if (!input.touchMode) this.sub = 'slots';
  }
  unequipCurrent() {
    const slot = this.slot;
    if (slot === 'weapon') { audio.sfx('menu_cancel'); this.m.notify('무기는 해제할 수 없습니다', PAL.bad); return; }
    if (!this.hero.equip?.[slot]) return;
    this.doRow({ unequip: true });
  }

  update(dt, nav, ges, focused) {
    this.base();
    this.view.control(dt, ges);     // 턴테이블 (포커스와 무관)
    this.view.update(dt);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt * 2.5);
    this.sc.update(dt, this.listRect, ges);
    // 포인터
    for (let i = 0; i < this.slotRects.length; i++) {
      const r = this.slotRects[i];
      if (ges.hoverIn(r) && this.sub === 'slots' && this.si !== i) { this.si = i; this.rebuild(); }
      if (ges.tap(r)) {
        this.m.focus = 'content';
        if (this.si !== i) { this.si = i; this.li = 0; this.sc.reset(); this.rebuild(); audio.sfx('menu_move'); }
        this.sub = 'list';
        return;
      }
    }
    if (!this.sc.dragging) {
      for (let i = 0; i < this.rowRects.length; i++) {
        const r = this.rowRects[i];
        if (!r || !inRect(r.x, r.y + r.h / 2, this.listRect)) continue;
        if (ges.hoverIn(r) && this.sub === 'list') this.li = i;
        if (ges.tap(r)) {
          this.m.focus = 'content';
          if (this.sub === 'list' && this.li === i) this.doRow(this.list[i]);
          else { this.sub = 'list'; this.li = i; audio.sfx('menu_move'); }
          return;
        }
      }
    }
    if (this.btnRect && ges.tap(this.btnRect)) { this.m.focus = 'content'; this.doRow(this.list[this.li]); return; }
    if (!focused) return;
    if (this.sub === 'slots') {
      const n = this.slots.length;
      if (nav.up) { if (this.si === 0) { this.m.focusTabs(); return; } this.si--; this.li = 0; this.sc.reset(); this.rebuild(); audio.sfx('menu_move'); }
      if (nav.down && this.si < n - 1) { this.si++; this.li = 0; this.sc.reset(); this.rebuild(); audio.sfx('menu_move'); }
      if (nav.right || nav.confirm) { if (this.list.length) { this.sub = 'list'; this.li = 0; audio.sfx('menu_ok'); } else { audio.sfx('menu_cancel'); this.m.notify('교체할 수 있는 장비가 없습니다', PAL.dim); } }
      if (nav.alt) this.unequipCurrent();
      if (nav.cancel) this.m.close();
    } else {
      const n = this.list.length;
      if (nav.up && this.li > 0) { this.li--; audio.sfx('menu_move'); }
      if (nav.down && this.li < n - 1) { this.li++; audio.sfx('menu_move'); }
      if (nav.confirm) this.doRow(this.list[this.li]);
      if (nav.alt) this.unequipCurrent();
      if (nav.left || nav.cancel) { this.sub = 'slots'; audio.sfx('menu_cancel'); }
    }
  }
  hints(focused) {
    if (this.sub === 'list') return [['↑↓', '고르기'], ['Z', '장착', '한 번 더 터치하면 장착'], [['←', 'X'], '장비 칸'], ...turntableHints()];
    return [['↑↓', '장비 칸'], ['Z', '교체', '장비 칸을 터치해 교체할 장비를 고르세요'], ['A', '해제'], ...turntableHints()];
  }

  render(ctx, A) {
    const cur = this.base();
    const t = this.t, hero = this.hero, st = this.state;
    const focused = this.m.focus === 'content';
    const LW = Math.round(clamp(A.w * 0.31, 260, 330)), MW = Math.round(clamp(A.w * 0.235, 200, 270));
    const RX = A.x + LW + MW + 24, RW = A.w - LW - MW - 24;
    const hr = this.hoverRow;
    const pv = hr ? this.preview(this.slot, hr.unequip ? null : hr.inst.uid) : null;
    const look = pv?.look || cur.look;
    this.view.set(look, D.CHARACTERS()[hero.charId]);

    // ── 왼쪽: 장비 칸 ──
    frame(ctx, A.x, A.y, LW, A.h);
    heading(ctx, '장착 장비', A.x + 16, A.y + 26, LW - 32, { sub: D.CHARACTERS()[hero.charId]?.name?.split(' ')[0] });
    this.slotRects.length = 0;
    const rowH = Math.min(62, (A.h - 50) / 6);
    this.slots.forEach((slot, i) => {
      const y = A.y + 42 + i * rowH, x = A.x + 10, w = LW - 20;
      const r = { x, y, w, h: rowH - 4 };
      this.slotRects.push(r);
      const sel = i === this.si;
      if (sel) selBar(ctx, x, y, w, r.h, t, { dim: !focused || this.sub === 'list' });
      const inst = D.findItem(st, hero.equip?.[slot]);
      const s = r.h - 8;
      drawSlot(ctx, x + 12, y + 4, s, inst, { selected: sel, empty: SLOT_ICON_EMPTY[slot] });
      if (this.flashT > 0 && this.flashSlot === slot) glow(ctx, x + 12 + s / 2, y + 4 + s / 2, s * 1.2, '#ffe0a0', this.flashT);
      if (sel && focused && this.sub === 'slots') brackets(ctx, x + 12, y + 4, s, s, t);
      const tx = x + 22 + s;
      text(ctx, D.SLOT_NAMES()[slot], tx, y + 16, { size: 11, weight: 700, color: sel ? PAL.gold : PAL.dim, ow: 2 });
      if (inst) {
        text(ctx, ellipsize(ctx, D.nameOf(inst), w - (tx - x) - 8, 15, 800), tx, y + 35, { size: 15, weight: 800, color: RARITY_COL[inst.rarity ?? 0], ow: 3 });
        text(ctx, ellipsize(ctx, statLine(inst), w - (tx - x) - 8, 11, 600), tx, y + 51, { size: 11, weight: 600, color: PAL.text, ow: 2 });
      } else text(ctx, '— 비어 있음 —', tx, y + 36, { size: 13, weight: 600, color: PAL.faint, ow: 2 });
    });

    // ── 가운데: 영웅 미리보기 + 요약 ──
    const MX = A.x + LW + 12;
    frame(ctx, MX, A.y, MW, A.h);
    const sh = Math.round(A.h * 0.52);
    const accent = accentOf(look);
    this.stage.draw(ctx, MX + 8, A.y + 8, MW - 16, sh, t, this.game.scale, accent);
    const scale = clamp((sh - 46) / 92, 1.5, 2.1);
    pedestal(ctx, MX + MW / 2, A.y + 8 + sh - 22, scale * 0.58, t, accent);
    this.view.draw(ctx, MX + MW / 2, A.y + 8 + sh - 22, scale);
    ctx.strokeStyle = 'rgba(200,160,90,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(MX + 8.5, A.y + 8.5, MW - 17, sh - 1);
    if (pv) pill(ctx, '미리보기', MX + MW / 2, A.y + 16, { align: 'center', color: PAL.goldHi, bg: 'rgba(110,14,34,0.92)', size: 11, h: 18 });
    let y = A.y + sh + 32;
    heading(ctx, '주요 능력치', MX + 14, y, MW - 28, { size: 14 });
    y += 8;
    const rowS = Math.min(20, (A.y + A.h - 10 - y) / SUMMARY.length);
    const ns = pv?.stats || cur.stats;
    for (const k of SUMMARY) {
      const a = cur.stats[k] ?? 0, b = ns[k] ?? 0, d = b - a;
      text(ctx, D.STAT_INFO[k]?.name ?? k, MX + 18, y + 15, { size: 12, weight: 600, color: PAL.text, ow: 2 });
      const col = Math.abs(d) < 0.05 ? PAL.bone : d > 0 ? PAL.good : PAL.bad;
      text(ctx, fmtStatVal(k, b), MX + MW - 18, y + 15, { size: 13, align: 'right', weight: 800, family: FONT.num, color: col, ow: 3 });
      if (Math.abs(d) >= 0.05) text(ctx, `${d > 0 ? '▲' : '▼'} ${d > 0 ? '+' : '-'}${fmtStatVal(k, Math.abs(d))}`, MX + MW - 18 - 48, y + 14, { size: 10, align: 'right', weight: 700, color: col, ow: 2 });
      y += rowS;
    }

    // ── 오른쪽: 후보 목록 + 비교 ──
    frame(ctx, RX, A.y, RW, A.h);
    const slotName = D.SLOT_NAMES()[this.slot];
    heading(ctx, `${slotName} 교체`, RX + 16, A.y + 26, RW - 32, { sub: `${this.list.filter((r) => !r.unequip).length}개` });
    const cmpH = 150;
    const LR = { x: RX + 8, y: A.y + 40, w: RW - 16, h: A.h - 40 - cmpH - 8 };
    this.listRect = LR;
    const RH = input_rowH();
    this.sc.setMax(this.list.length * RH - LR.h);
    if (this.sub === 'list') this.sc.ensure(this.li * RH, this.li * RH + RH, LR.h);
    clipBegin(ctx, LR);
    this.rowRects.length = 0;
    if (!this.list.length) text(ctx, '이 칸에 맞는 장비를 가지고 있지 않습니다', LR.x + LR.w / 2, LR.y + 40, { size: 13, align: 'center', color: PAL.faint });
    this.list.forEach((row, i) => {
      const ry = LR.y + i * RH - this.sc.y;
      const r = { x: LR.x, y: ry, w: LR.w - 8, h: RH - 3 };
      this.rowRects[i] = r;
      if (ry > LR.y + LR.h || ry + RH < LR.y) return;
      const sel = this.sub === 'list' && i === this.li;
      if (sel) selBar(ctx, r.x, r.y, r.w, r.h, t, { dim: !focused });
      else if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,230,200,0.025)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      if (row.unequip) {
        text(ctx, '장착 해제', r.x + 58, r.y + r.h / 2 + 5, { size: 15, weight: 800, color: sel ? PAL.goldHi : PAL.bone });
        ctx.strokeStyle = PAL.goldDim; ctx.lineWidth = 1.5; ctx.strokeRect(r.x + 10.5, r.y + 4.5, r.h - 9, r.h - 9);
        text(ctx, '✕', r.x + 10 + (r.h - 8) / 2, r.y + r.h / 2 + 5, { size: 14, align: 'center', color: PAL.dim, ow: 0 });
        return;
      }
      const s = r.h - 8;
      drawSlot(ctx, r.x + 10, r.y + 4, s, row.inst, { selected: sel });
      if (sel && focused) brackets(ctx, r.x + 10, r.y + 4, s, s, t);
      const tx = r.x + 20 + s;
      const nm = ellipsize(ctx, D.nameOf(row.inst), r.w - (tx - r.x) - 70, 14, 800);
      text(ctx, nm, tx, r.y + 19, { size: 14, weight: 800, color: row.ok ? RARITY_COL[row.inst.rarity ?? 0] : '#8a6a6a', ow: 3 });
      text(ctx, ellipsize(ctx, row.ok ? statLine(row.inst) : row.reason, r.w - (tx - r.x) - 12, 11, 600), tx, r.y + 36, { size: 11, weight: 600, color: row.ok ? PAL.text : PAL.bad, ow: 2 });
      if (row.here) pill(ctx, '장착 중', r.x + r.w - 8, r.y + 7, { align: 'right', color: PAL.goldHi, bg: 'rgba(110,14,34,0.92)', size: 10, h: 16 });
      else if (row.mine) pill(ctx, '다른 칸', r.x + r.w - 8, r.y + 7, { align: 'right', color: PAL.dim, size: 10, h: 16 });
      else if (row.by) pill(ctx, `${D.CHARACTERS()[row.by]?.name?.split(' ')[0] ?? row.by} 장착`, r.x + r.w - 8, r.y + 7, { align: 'right', color: PAL.dim, size: 10, h: 16 });
    });
    clipEnd(ctx, LR, this.sc);
    scrollbar(ctx, LR.x + LR.w - 5, LR.y + 2, LR.h - 4, this.sc, LR.h);
    // 비교
    const cy = A.y + A.h - cmpH;
    divider(ctx, RX + 16, cy, RW - 32);
    this.btnRect = null;
    if (!hr) {
      text(ctx, this.list.length ? '장비를 고르면 능력치 변화를 비교합니다' : '상점이나 보물상자에서 장비를 구해 보세요', RX + RW / 2, cy + 44, { size: 13, align: 'center', color: PAL.dim });
      return;
    }
    const diffs = [];
    for (const k in D.STAT_INFO) {
      const a = cur.stats[k] ?? 0, b = pv.stats?.[k] ?? 0;
      if (Math.abs(b - a) >= 0.05) diffs.push([k, b - a]);
    }
    text(ctx, '능력치 변화', RX + 18, cy + 22, { size: 13, weight: 800, color: PAL.gold, family: FONT.title });
    if (!diffs.length) text(ctx, hr.here ? '현재 장착 중인 장비입니다' : '변화 없음', RX + 18, cy + 46, { size: 13, color: PAL.dim });
    const cw = (RW - 36) / 2;
    diffs.slice(0, canDoN(hr) ? 6 : 8).forEach(([k, d], i) => {
      const x = RX + 18 + (i % 2) * cw, yy = cy + 44 + Math.floor(i / 2) * 19;
      const col = d > 0 ? PAL.good : PAL.bad;
      text(ctx, D.STAT_INFO[k]?.name ?? k, x, yy, { size: 12, weight: 600, color: PAL.text, ow: 2 });
      text(ctx, `${d > 0 ? '+' : '-'}${fmtStatVal(k, Math.abs(d))}`, x + cw - 14, yy, { size: 13, align: 'right', weight: 800, family: FONT.num, color: col, ow: 3 });
    });
    const canDo = hr.unequip || (hr.ok && !hr.here);
    if (canDo) {
      const bw = 124, bh = 30;
      this.btnRect = { x: RX + RW - bw - 14, y: cy + cmpH - bh - 12, w: bw, h: bh };
      gbutton(ctx, this.btnRect, hr.unequip ? '해제하기' : '장착하기', { hot: true, t, size: 13 });
    }
  }
}
const input_rowH = () => 50;
const canDoN = (hr) => hr && (hr.unequip || (hr.ok && !hr.here));
