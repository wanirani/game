// 장비 탭: 6칸(무기/머리/몸/망토/장신구×2) → 칸 선택 시 장착 가능한 아이템 목록 + 능력치 비교(증감) + 영웅 외형 실시간 미리보기
// 가운데 미리보기는 턴테이블 (hero_view.js): 끌어서·휠·, . 키·오른쪽 스틱으로 돌려 앞·옆·뒷모습의 장비 색·망토·무기를 본다.
// 갑옷·머리·망토·장신구를 끼우면 한 바퀴 돌며 보여 준다 (움직임 줄이기면 시전 동작). 무기를 끼우면 공격 시연.
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp } from '../../core/math.js';
import { input } from '../../core/input.js';
import { drawSlot } from '../../render/icons.js';
import { assets } from '../../core/assets.js';
import { Tab } from './base.js';
import { HeroView, HeroStage, PixLayer, PixCache, pedestal, accentOf, turntableHints, pxScale } from './hero_view.js';
import {
  PAL, RARITY_COL, frame, heading, divider, selBar, brackets, glow, gbutton, Scroller, scrollbar, clipBegin, clipEnd, ellipsize, pill, inRect, measure, Popup,
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
    this.txt = new PixCache(28);    // 줄·덩어리별 글자 캐시 (외곽선 글자는 매 프레임 그리기에 너무 비싸다 — P-11)
    this.bg = new PixLayer();       // 세 판의 틀(그라디언트)·제목 — 한 장으로 구워 매 프레임 1:1 복사
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
  /** 탭을 떠날 때: 끌기·누름·회전을 끝낸다 (돌아왔을 때 옛 끌기가 관성으로 튀지 않게) */
  onHide() { this.view.sleep(); }
  free() { this.stage.free(); this.txt.free(); this.bg.free(); }
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
  /** 길게 누르기(터치 450 ms, platform §5.6) → 그 장비의 행동 메뉴: 장착·해제·잠금 */
  openActions(row, r) {
    if (!row) return;
    const acts = [];
    if (row.unequip) acts.push({ id: 'unequip', label: '장착 해제', run: () => this.doRow(row) });
    else {
      if (row.here) acts.push({ id: 'unequip', label: '해제하기', disabled: this.slot === 'weapon', reason: '무기는 해제할 수 없습니다', run: () => this.unequipCurrent() });
      else acts.push({ id: 'equip', label: '장착하기', disabled: !row.ok, reason: row.reason, run: () => this.doRow(row) });
      acts.push({
        id: 'lock', label: row.inst.locked ? '잠금 풀기' : '잠그기', run: () => {
          const on = D.toggleLockOf(this.state, row.inst);
          audio.sfx(on ? 'clang' : 'menu_move');
          this.m.notify(on ? '아이템을 잠갔습니다 — 판매·분해되지 않습니다' : '잠금을 풀었습니다', PAL.gold);
        },
      });
    }
    const x = r ? Math.max(8, r.x - 232) : null;
    this.m.openModal(new Popup({ title: row.unequip ? D.SLOT_NAMES()[this.slot] : D.nameOf(row.inst), items: acts, x, y: r ? r.y : null, w: 220 }));
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
    // 길게 누르기 → 장비 행동 메뉴 (§5.6)
    if (ges.longPress && ges.held) {
      for (let i = 0; i < this.rowRects.length; i++) {
        const r = this.rowRects[i];
        if (!r || !inRect(r.x, r.y + r.h / 2, this.listRect) || !ges.held(r)) continue;
        this.m.focus = 'content'; this.sub = 'list'; this.li = i;
        this.openActions(this.list[i], r);
        return;
      }
    }
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
  /** 포커스와 무관하게 늘 되는 조작 (탭 막대에 포커스가 있을 때 메뉴 하단 막대가 덧붙인다 — 턴테이블) */
  idleHints() { return turntableHints(this.view); }
  hints(focused) {
    if (this.sub === 'list') return [['↑↓', '고르기'], ['Z', '장착', '한 번 더 터치하면 장착'], [['←', 'X'], '장비 칸'], ...turntableHints(this.view)];
    return [['↑↓', '장비 칸'], ['Z', '교체', '장비 칸을 터치해 교체할 장비를 고르세요'], ['A', '해제'], ...turntableHints(this.view)];
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

    // 터치: 칸 사이 틈을 줄여 한 칸을 36 CSS px 이상으로 (platform §6.3 목록 줄)
    const touch = !!input.touchMode;
    const top = touch ? 36 : 42, gapS = touch ? 2 : 4;
    const MX = A.x + LW + 12;
    // ── 세 판의 틀 + 제목 (정적: 영웅·장비 칸·후보 수가 바뀔 때만 다시 굽는다) ──
    const slotName = D.SLOT_NAMES()[this.slot];
    const nCand = this.list.filter((r) => !r.unequip).length;
    this.bg.draw(ctx, `${hero.charId}|${this.slot}|${nCand}|${touch ? 1 : 0}|${LW}|${MW}`, A.x - 3, A.y - 3, A.w + 6, A.h + 6, (c) => {
      frame(c, A.x, A.y, LW, A.h);
      heading(c, '장착 장비', A.x + 16, A.y + (touch ? 24 : 26), LW - 32, { sub: D.CHARACTERS()[hero.charId]?.name?.split(' ')[0] });
      frame(c, MX, A.y, MW, A.h);
      frame(c, RX, A.y, RW, A.h);
      heading(c, `${slotName} 교체`, RX + 16, A.y + 26, RW - 32, { sub: `${nCand}개` });
    });
    // ── 왼쪽: 장비 칸 ──
    this.slotRects.length = 0;
    const rowH = Math.min(62, (A.h - top - 8) / 6);
    this.slots.forEach((slot, i) => {
      const y = A.y + top + i * rowH, x = A.x + 10, w = LW - 20;
      const r = { x, y, w, h: rowH - gapS };
      this.slotRects.push(r);
      this.m.ges?.zone?.(r, 'list', { src: 'equip.slot' });
      const sel = i === this.si;
      if (sel) selBar(ctx, x, y, w, r.h, t, { dim: !focused || this.sub === 'list' });
      const inst = D.findItem(st, hero.equip?.[slot]);
      const s = r.h - 8;
      const tx = x + 22 + s;
      // 낮은 칸(작은 화면)은 능력치 줄을 빼고 두 줄로
      const tall = r.h >= 54;
      // 아이콘 칸 + 글자는 캐시 (선택 막대는 아래, 반짝임·괄호는 위에서 매 프레임). +7 이상 강화 오라는 움직이므로 아이콘만 매 프레임
      const live = slotLive(inst);
      if (live) drawSlot(ctx, x + 12, y + 4, s, inst, { selected: sel, empty: SLOT_ICON_EMPTY[slot] });
      const x0 = live ? tx - 4 : x + 8;
      this.txt.draw(ctx, 'slot' + i, `${this.m.rev}|${hero.charId}|${slot}|${inst?.uid ?? '-'}|${inst?.level ?? 0}|${sel ? 1 : 0}|${live ? 1 : 0}|${iconReady(inst)}`, x0, y, x + w - x0, r.h, (c) => {
        if (!live) drawSlot(c, x + 12, y + 4, s, inst, { selected: sel, empty: SLOT_ICON_EMPTY[slot] });
        text(c, D.SLOT_NAMES()[slot], tx, y + (tall ? 16 : Math.round(r.h * 0.36)), { size: 11, weight: 700, color: sel ? PAL.gold : PAL.dim, ow: 2 });
        if (inst) {
          const ns = tall ? 15 : 14;
          text(c, ellipsize(c, D.nameOf(inst), w - (tx - x) - 8, ns, 800), tx, y + (tall ? 35 : Math.round(r.h * 0.8)), { size: ns, weight: 800, color: RARITY_COL[inst.rarity ?? 0], ow: 3 });
          if (tall) text(c, ellipsize(c, statLine(inst), w - (tx - x) - 8, 11, 600), tx, y + 51, { size: 11, weight: 600, color: PAL.text, ow: 2 });
        } else text(c, '— 비어 있음 —', tx, y + (tall ? 36 : Math.round(r.h * 0.8)), { size: 13, weight: 600, color: PAL.faint, ow: 2 });
      });
      if (this.flashT > 0 && this.flashSlot === slot) glow(ctx, x + 12 + s / 2, y + 4 + s / 2, s * 1.2, '#ffe0a0', this.flashT);
      if (sel && focused && this.sub === 'slots') brackets(ctx, x + 12, y + 4, s, s, t);
    });

    // ── 가운데: 영웅 미리보기 + 요약 ──
    // 턴테이블 무대: 끌어서·휠·, . 키·오른쪽 스틱으로 돌려 장비의 앞·옆·뒷모습을 본다 (hero_view.js)
    const sh = Math.round(clamp(A.h * 0.52, 128, 260));
    const accent = accentOf(look);
    this.stage.draw(ctx, MX + 8, A.y + 8, MW - 16, sh, t, pxScale(ctx), accent);
    const foot = Math.round(clamp(sh * 0.1, 14, 22));
    const scale = clamp((sh - foot - 24) / 96, 0.95, 2.1);
    this.heroRect = { x: MX + 8, y: A.y + 8, w: MW - 16, h: sh };
    this.view.stage(this.heroRect);
    pedestal(ctx, MX + MW / 2, A.y + 8 + sh - foot, scale * 0.58, t, accent, this.view.yaw);
    this.view.draw(ctx, MX + MW / 2, A.y + 8 + sh - foot, scale);
    this.view.drawDeck(ctx, t, { label: !pv }); // 후보 미리보기 중에는 위쪽에 '미리보기' 표시가 대신 들어간다
    ctx.strokeStyle = 'rgba(200,160,90,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(MX + 8.5, A.y + 8.5, MW - 17, sh - 1);
    if (pv) pill(ctx, '미리보기', MX + MW / 2, A.y + 14, { align: 'center', color: PAL.goldHi, bg: 'rgba(110,14,34,0.92)', size: 11, h: 18 });
    const ns = pv?.stats || cur.stats;
    // 주요 능력치 (글자 캐시: 값이 바뀔 때만 다시 굽는다)
    const sumKey = SUMMARY.map((k) => `${cur.stats[k] ?? 0}:${ns[k] ?? 0}`).join(',');
    const sy0 = A.y + sh + 10;
    this.txt.draw(ctx, 'sum', sumKey, MX + 4, sy0, MW - 8, A.y + A.h - 4 - sy0, (c) => {
      let y = A.y + sh + 32;
      heading(c, '주요 능력치', MX + 14, y, MW - 28, { size: 14 });
      y += 8;
      // 낮은 화면: 2열 (증감은 색으로만)
      const room = A.y + A.h - 8 - y, two = room / SUMMARY.length < 15;
      const perCol = two ? Math.ceil(SUMMARY.length / 2) : SUMMARY.length;
      const rowS = Math.min(20, room / perCol);
      const colW = two ? (MW - 28) / 2 : MW - 28;
      SUMMARY.forEach((k, i) => {
        const a = cur.stats[k] ?? 0, b = ns[k] ?? 0, d = b - a;
        const cx0 = MX + 14 + (two ? Math.floor(i / perCol) * colW : 0), ry = y + (two ? i % perCol : i) * rowS;
        const by = ry + Math.min(15, rowS * 0.5 + 5);
        const col = Math.abs(d) < 0.05 ? PAL.bone : d > 0 ? PAL.good : PAL.bad;
        const val = fmtStatVal(k, b);
        const vw = measure(c, val, 13, 800, FONT.num);
        text(c, ellipsize(c, D.STAT_INFO[k]?.name ?? k, colW - vw - 14, 12, 600), cx0 + 4, by, { size: 12, weight: 600, color: PAL.text, ow: 2 });
        text(c, val, cx0 + colW - 4, by, { size: 13, align: 'right', weight: 800, family: FONT.num, color: col, ow: 3 });
        if (!two && Math.abs(d) >= 0.05) text(c, `${d > 0 ? '▲' : '▼'} ${d > 0 ? '+' : '-'}${fmtStatVal(k, Math.abs(d))}`, cx0 + colW - 4 - 48, by - 1, { size: 10, align: 'right', weight: 700, color: col, ow: 2 });
      });
    });

    // ── 오른쪽: 후보 목록 + 비교 ──
    const cmpH = 150;
    const LR = { x: RX + 8, y: A.y + 40, w: RW - 16, h: A.h - 40 - cmpH - 8 };
    this.listRect = LR;
    const RH = input_rowH();
    this.sc.setMax(this.list.length * RH - LR.h);
    // P-01: 키·패드로 고른 줄만 따라간다 (끌거나 휠로 스크롤한 위치는 유지)
    if (this.sub === 'list' && (typeof this.sc.shouldFollow !== 'function' || this.sc.shouldFollow(this.li))) this.sc.ensure(this.li * RH, this.li * RH + RH, LR.h);
    clipBegin(ctx, LR);
    this.rowRects.length = 0;
    if (!this.list.length) text(ctx, '이 칸에 맞는 장비를 가지고 있지 않습니다', LR.x + LR.w / 2, LR.y + 40, { size: 13, align: 'center', color: PAL.faint });
    this.list.forEach((row, i) => {
      const ry = LR.y + i * RH - this.sc.y;
      const r = { x: LR.x, y: ry, w: LR.w - 8, h: RH - 3 };
      this.rowRects[i] = r;
      this.m.ges?.zone?.(r, 'list', { clip: LR, src: 'equip.row' });
      if (ry > LR.y + LR.h || ry + RH < LR.y) return;
      const sel = this.sub === 'list' && i === this.li;
      if (sel) selBar(ctx, r.x, r.y, r.w, r.h, t, { dim: !focused });
      else if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,230,200,0.025)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      // 줄 글자는 캐시 (id = 목록 위치, key = 그 줄의 아이템·선택 상태) — 아이콘(강화 오라)·선택 막대·괄호는 매 프레임
      const rkey = `${this.m.rev}|${hero.charId}|${this.slot}|${row.unequip ? 'U' : row.inst.uid}|${sel ? 1 : 0}`;
      if (row.unequip) {
        this.txt.draw(ctx, 'row' + i, rkey, r.x, Math.round(r.y), r.w, r.h, (c) => {
          const y0 = Math.round(r.y);
          text(c, '장착 해제', r.x + 58, y0 + r.h / 2 + 5, { size: 15, weight: 800, color: sel ? PAL.goldHi : PAL.bone });
          c.strokeStyle = PAL.goldDim; c.lineWidth = 1.5; c.strokeRect(r.x + 10.5, y0 + 4.5, r.h - 9, r.h - 9);
          text(c, '✕', r.x + 10 + (r.h - 8) / 2, y0 + r.h / 2 + 5, { size: 14, align: 'center', color: PAL.dim, ow: 0 });
        });
        return;
      }
      const s = r.h - 8;
      const tx = r.x + 20 + s;
      const live = slotLive(row.inst);
      if (live) drawSlot(ctx, r.x + 10, r.y + 4, s, row.inst, { selected: sel });
      const x0 = live ? tx - 4 : r.x + 6;
      // 굽는 영역은 줄의 정수 y 에 맞춘다 (스크롤 중 y 가 소수여도 같은 캐시를 쓰고, 복사는 어차피 장치 픽셀에 맞춰진다)
      this.txt.draw(ctx, 'row' + i, `${rkey}|${live ? 1 : 0}|${iconReady(row.inst)}`, x0, Math.round(r.y), r.x + r.w - x0, r.h, (c) => {
        const y0 = Math.round(r.y);
        if (!live) drawSlot(c, r.x + 10, y0 + 4, s, row.inst, { selected: sel });
        const nm = ellipsize(c, D.nameOf(row.inst), r.w - (tx - r.x) - 70, 14, 800);
        text(c, nm, tx, y0 + 19, { size: 14, weight: 800, color: row.ok ? RARITY_COL[row.inst.rarity ?? 0] : '#8a6a6a', ow: 3 });
        text(c, ellipsize(c, row.ok ? statLine(row.inst) : row.reason, r.w - (tx - r.x) - 12, 11, 600), tx, y0 + 36, { size: 11, weight: 600, color: row.ok ? PAL.text : PAL.bad, ow: 2 });
        if (row.here) pill(c, '장착 중', r.x + r.w - 8, y0 + 7, { align: 'right', color: PAL.goldHi, bg: 'rgba(110,14,34,0.92)', size: 10, h: 16 });
        else if (row.mine) pill(c, '다른 칸', r.x + r.w - 8, y0 + 7, { align: 'right', color: PAL.dim, size: 10, h: 16 });
        else if (row.by) pill(c, `${D.CHARACTERS()[row.by]?.name?.split(' ')[0] ?? row.by} 장착`, r.x + r.w - 8, y0 + 7, { align: 'right', color: PAL.dim, size: 10, h: 16 });
      });
      if (sel && focused) brackets(ctx, r.x + 10, r.y + 4, s, s, t);
    });
    clipEnd(ctx, LR, this.sc);
    scrollbar(ctx, LR.x + LR.w - 5, LR.y + 2, LR.h - 4, this.sc, LR.h);
    // 비교 (글자는 캐시: 고른 줄이 바뀔 때만 다시 굽는다)
    const cy = A.y + A.h - cmpH;
    this.btnRect = null;
    const ckey = `${this.m.rev}|${hero.charId}|${this.slot}|${hr ? (hr.unequip ? 'U' : hr.inst.uid) : '-'}|${this.list.length ? 1 : 0}`;
    this.txt.draw(ctx, 'cmp', ckey, RX + 4, cy - 6, RW - 8, cmpH + 2, (c) => {
      divider(c, RX + 16, cy, RW - 32);
      if (!hr) {
        text(c, this.list.length ? '장비를 고르면 능력치 변화를 비교합니다' : '상점이나 보물상자에서 장비를 구해 보세요', RX + RW / 2, cy + 44, { size: 13, align: 'center', color: PAL.dim });
        return;
      }
      const diffs = [];
      for (const k in D.STAT_INFO) {
        const a = cur.stats[k] ?? 0, b = pv?.stats?.[k] ?? 0;
        if (Math.abs(b - a) >= 0.05) diffs.push([k, b - a]);
      }
      text(c, '능력치 변화', RX + 18, cy + 22, { size: 13, weight: 800, color: PAL.gold, family: FONT.title });
      if (!diffs.length) text(c, hr.here ? '현재 장착 중인 장비입니다' : '변화 없음', RX + 18, cy + 46, { size: 13, color: PAL.dim });
      const cw = (RW - 36) / 2;
      diffs.slice(0, canDoN(hr) ? 6 : 8).forEach(([k, d], i) => {
        const x = RX + 18 + (i % 2) * cw, yy = cy + 44 + Math.floor(i / 2) * 19;
        const col = d > 0 ? PAL.good : PAL.bad;
        text(c, D.STAT_INFO[k]?.name ?? k, x, yy, { size: 12, weight: 600, color: PAL.text, ow: 2 });
        text(c, `${d > 0 ? '+' : '-'}${fmtStatVal(k, Math.abs(d))}`, x + cw - 14, yy, { size: 13, align: 'right', weight: 800, family: FONT.num, color: col, ow: 3 });
      });
    });
    this.txt.sweep();
    if (!hr) return;
    const canDo = hr.unequip || (hr.ok && !hr.here);
    if (canDo) {
      const bw = 124, bh = 30;
      const br = { x: RX + RW - bw - 14, y: cy + cmpH - bh - 12, w: bw, h: bh };
      // 주 버튼: 공용 탭 등록부에 'primary' 로 (터치 여유 영역이 44 CSS px 까지 넓힌다 — §6.3)
      this.btnRect = typeof this.m.ges?.zone === 'function' ? this.m.ges.zone(br, 'primary', { src: 'equip.do' }) : br;
      gbutton(ctx, br, hr.unequip ? '해제하기' : '장착하기', { hot: true, t, size: 13 });
    }
  }
}
const input_rowH = () => 50;
/** 아이콘 칸을 매 프레임 그려야 하는가: +7 이상 강화 오라는 시간에 따라 움직인다 (render/icons.js drawIcon) */
const slotLive = (inst) => (inst?.level ?? 0) >= 7;
/** 아이콘 그림이 준비됐는가 (준비 전에는 대체 아이콘으로 구워지므로 준비되면 다시 굽는다) */
const iconReady = (inst) => (!inst?.icon || assets.has('icons/' + inst.icon) ? 1 : 0);
const canDoN = (hr) => hr && (hr.unequip || (hr.ok && !hr.here));
