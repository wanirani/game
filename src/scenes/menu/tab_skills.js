// 스킬 탭: 캐릭터별 스킬 트리(3계열 × 6단, 전직 계열은 5·6단에서 두 갈래) · 상세(현재/다음 레벨) · 습득/강화(SP) · 스킬 슬롯(1·2페이지 S/D) 등록
// 낮은 화면(휴대폰 UI 배율)에서는 트리가 세로로 스크롤된다 (줄 높이 터치 46 · 그 밖 36 이상). 스킬을 길게 누르면 행동 메뉴.
// 습득·강화 뒤에는 m.changed() → player.refreshStats() 로 패시브가 바로 능력치에 반영된다.
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp, rgba, TAU } from '../../core/math.js';
import { input } from '../../core/input.js';
import { drawGlyph, labelOf, bindingOf, promptMode } from '../../core/prompts.js';
import { drawSkillGlyph } from '../../render/hud.js';
import * as SkillD from '../../data/skills.js';
import { Tab } from './base.js';
import {
  PAL, frame, heading, divider, brackets, glow, glowOval, gbutton, pill, para, diamond, glyph, Popup, ellipsize, keycap, rr,
  Scroller, scrollbar, clipBegin, clipEnd,
} from './common.js';
import * as D from './access.js';

/** 슬롯 이름 "Ⅰ · S": 페이지 + 지금 기기의 스킬 버튼 (키보드 S/D · 패드 LB/RB · 터치 S1/S2, 바꾼 키도 따른다) */
function slotLabel(k) {
  let b = '';
  try { b = labelOf(k % 2 ? 'skill2' : 'skill1'); } catch { b = ''; }
  return `${k < 2 ? 'Ⅰ' : 'Ⅱ'} · ${b || (k % 2 ? 'S2' : 'S1')}`;
}
/** 전투 중 스킬 페이지 전환 안내 (지금 기기의 swap 버튼) */
function swapTip() {
  if (input.touchMode) return '전투 중 ⇄ 버튼: 페이지 전환';
  let keys = '';
  try {
    if (promptMode() === 'kb') {
      const ks = bindingOf('swap', 'kb').map((b) => (/^(Key[A-Z]|Digit\d)$/.test(b.code) ? b.code.slice(-1) : null)).filter(Boolean);
      keys = ks.length ? ks.join('·') : labelOf('swap', 'kb');
    } else keys = labelOf('swap');
  } catch { keys = ''; }
  return keys ? `전투 중 ${keys}: 페이지 전환` : '전투 중 스킬 페이지 버튼: 전환';
}

export class SkillsTab extends Tab {
  constructor(m) {
    super(m);
    this.col = 0; this.row = 0; this.sub = 'tree'; this.slotI = 0;
    this.nodeRects = []; this.slotRects = []; this.btnRects = [];
    this.pop = new Map(); // 습득 연출 {id: t}
    this.sc = new Scroller(); this.treeRect = null;
  }
  get tree() { return D.TREE(this.hero.charId); }
  get branches() { return this.tree?.branches ?? []; }
  idAt(c, r) { return this.branches[c]?.skills?.[r] ?? null; }
  get selId() { return this.sub === 'slots' ? this.hero.slots?.[this.slotI] ?? null : this.idAt(this.col, this.row); }
  lv(id) { return this.hero.skills?.[id] ?? 0; }
  check(id) { return D.canLearnOf(this.hero, id); }

  learn(id) {
    const sk = D.SKILLS()[id];
    if (!sk) return;
    const before = this.lv(id);
    const r = D.learnOf(this.state, this.hero, id);
    if (r.ok) {
      audio.sfx(before === 0 ? 'powerup' : 'levelup');
      this.pop.set(id, 1);
      this.m.notify(before === 0 ? `「${sk.name}」 습득!` : `「${sk.name}」 Lv ${before + 1}`, sk.color && sk.color.startsWith('#') ? sk.color : PAL.goldHi);
      this.m.changed();
    } else { audio.sfx('menu_cancel'); this.m.notify(r.reason || '배울 수 없습니다', PAL.bad); }
  }
  assign(slot, id) {
    const f = SkillD.equipSkill;
    let ok = false;
    if (typeof f === 'function') ok = f(this.hero, slot, id);
    else { this.hero.slots ??= [null, null, null, null]; const j = id ? this.hero.slots.indexOf(id) : -1; if (j >= 0) this.hero.slots[j] = this.hero.slots[slot]; this.hero.slots[slot] = id; ok = true; }
    if (ok) { audio.sfx(id ? 'item' : 'menu_cancel'); if (id) this.m.notify(`${slotLabel(slot)} 슬롯에 「${D.SKILLS()[id]?.name}」 등록`, PAL.goldHi); this.m.changed(); }
    else audio.sfx('menu_cancel');
  }
  /** 노드에서 확인 → 행동 팝업 */
  nodeMenu(id) {
    const sk = D.SKILLS()[id];
    if (!sk) return;
    const lv = this.lv(id), chk = this.check(id);
    const items = [];
    const cost = sk.spCost ?? 1;
    if (lv < (sk.maxLv ?? 5)) items.push({ label: lv ? '레벨 올리기' : '배우기', sub: `SP ${cost}`, disabled: !chk.ok, reason: chk.reason, run: () => this.learn(id) });
    if (D.isActive(sk) && lv > 0) items.push({ label: '슬롯에 등록', sub: this.hero.slots?.includes(id) ? slotLabel(this.hero.slots.indexOf(id)) : '', run: () => this.slotMenu(id) });
    if (!items.length) { audio.sfx('menu_cancel'); this.m.notify('최고 레벨입니다', PAL.dim); return; }
    const r = this.nodeRects.find((n) => n.id === id);
    this.m.openModal(new Popup({ title: sk.name, items, x: r ? r.x + r.w + 6 : null, y: r ? r.y - 10 : null, w: 210 }));
  }
  slotMenu(id) {
    const items = [0, 1, 2, 3].map((k) => {
      const cur = this.hero.slots?.[k];
      return { label: slotLabel(k), sub: cur ? D.SKILLS()[cur]?.name ?? '' : '비어 있음', run: () => this.assign(k, id) };
    });
    this.m.openModal(new Popup({ title: '등록할 슬롯', items, w: 250 }));
  }
  /** 슬롯에서 확인 → 넣을 스킬 선택 */
  pickForSlot(k) {
    const acts = Object.keys(this.hero.skills || {}).filter((id) => D.isActive(D.SKILLS()[id]) && this.lv(id) > 0);
    const items = acts.map((id) => ({ label: D.SKILLS()[id].name, sub: `Lv ${this.lv(id)}`, run: () => this.assign(k, id) }));
    if (this.hero.slots?.[k]) items.push({ label: '비우기', color: PAL.dim, run: () => this.assign(k, null) });
    if (!items.length) { audio.sfx('menu_cancel'); this.m.notify('배운 액티브 스킬이 없습니다', PAL.dim); return; }
    this.m.openModal(new Popup({ title: `${slotLabel(k)} 슬롯`, items, w: 250 }));
  }

  update(dt, nav, ges, focused) {
    for (const [k, v] of this.pop) { const nv = v - dt * 1.6; if (nv <= 0) this.pop.delete(k); else this.pop.set(k, nv); }
    if (!this.tree) { if (focused && nav.up) this.m.focusTabs(); else if (focused && nav.cancel) this.m.close(); return; }
    this.sc.update(dt, this.treeRect, ges);
    // 길게 누르기 → 그 스킬의 행동 메뉴 (§5.6)
    if (ges.longPress) {
      for (const n of this.nodeRects) if (ges.held(n)) { this.m.focus = 'content'; this.sub = 'tree'; this.col = n.c; this.row = n.r; this.nodeMenu(n.id); return; }
    }
    // 포인터
    for (const n of this.nodeRects) {
      if (n.thid || this.sc.dragging) continue;
      if (ges.hoverIn(n) && (this.sub !== 'tree' || this.col !== n.c || this.row !== n.r)) { this.sub = 'tree'; this.col = n.c; this.row = n.r; }
      if (ges.tap(n)) {
        this.m.focus = 'content';
        if (this.sub === 'tree' && this.col === n.c && this.row === n.r) this.nodeMenu(n.id);
        else { this.sub = 'tree'; this.col = n.c; this.row = n.r; audio.sfx('menu_move'); }
        return;
      }
    }
    for (const s of this.slotRects) {
      if (ges.tap(s)) { this.m.focus = 'content'; this.sub = 'slots'; this.slotI = s.k; this.pickForSlot(s.k); return; }
    }
    for (const b of this.btnRects) if (ges.tap(b)) { this.m.focus = 'content'; b.run(); return; }
    if (!focused) return;
    const B = this.branches;
    if (this.sub === 'slots') {
      if (nav.left && this.slotI > 0) { this.slotI--; audio.sfx('menu_move'); }
      if (nav.right && this.slotI < 3) { this.slotI++; audio.sfx('menu_move'); }
      if (nav.up) { this.sub = 'tree'; audio.sfx('menu_move'); }
      if (nav.confirm) this.pickForSlot(this.slotI);
      if (nav.cancel) { this.sub = 'tree'; audio.sfx('menu_cancel'); }
      return;
    }
    const n = B[this.col]?.skills?.length ?? 0;
    if (nav.up) { if (this.row === 0) { this.m.focusTabs(); return; } this.row--; audio.sfx('menu_move'); }
    if (nav.down) { if (this.row < n - 1) { this.row++; audio.sfx('menu_move'); } else { this.sub = 'slots'; this.slotI = 0; audio.sfx('menu_move'); } }
    if (nav.left && this.col > 0) { this.col--; this.row = Math.min(this.row, (B[this.col]?.skills?.length ?? 1) - 1); audio.sfx('menu_move'); }
    if (nav.right && this.col < B.length - 1) { this.col++; this.row = Math.min(this.row, (B[this.col]?.skills?.length ?? 1) - 1); audio.sfx('menu_move'); }
    const id = this.idAt(this.col, this.row);
    if (nav.confirm && id) this.nodeMenu(id);
    if (nav.alt && id && D.isActive(D.SKILLS()[id]) && this.lv(id) > 0) this.slotMenu(id);
    if (nav.cancel) this.m.close();
  }
  hints() {
    if (this.sub === 'slots') return [['←→', '슬롯'], ['Z', '스킬 넣기', '슬롯을 터치해 스킬을 넣으세요'], ['X', '트리로']];
    return [['↑↓←→', '스킬'], ['Z', '배우기·강화', '스킬을 길게 누르거나 한 번 더 터치하면 배우기·등록'], ['A', '슬롯 등록']];
  }

  render(ctx, A) {
    const t = this.t, hero = this.hero, focused = this.m.focus === 'content';
    const DW = Math.round(clamp(A.w * 0.32, 280, 350));
    const TW = A.w - DW - 12;
    frame(ctx, A.x, A.y, TW, A.h);
    this.nodeRects.length = 0; this.slotRects.length = 0;
    const B = this.branches;
    if (!B.length) {
      text(ctx, '스킬 정보를 불러오는 중입니다', A.x + TW / 2, A.y + A.h / 2, { size: 15, align: 'center', color: PAL.dim });
      frame(ctx, A.x + TW + 12, A.y, DW, A.h);
      return;
    }
    // 계열 기둥 (줄이 최소 높이보다 작아지면 트리를 세로로 스크롤)
    const touch = input.touchMode;
    const slotH = touch ? 64 : 70;
    const top = A.y + 58, bot = A.y + A.h - slotH - 8;
    const cw = (TW - 20) / B.length;
    const maxN = Math.max(1, ...B.map((br) => br.skills?.length ?? 0));
    const rowH = Math.max(touch ? 46 : 36, Math.min(64, (bot - top) / maxN));
    const TR = { x: A.x + 6, y: top - 2, w: TW - 12, h: bot - top + 2 };
    this.treeRect = TR;
    this.sc.setMax(maxN * rowH - (bot - top));
    if (this.sub === 'tree' && this.sc.shouldFollow(this.col + '|' + this.row)) this.sc.ensure(this.row * rowH, this.row * rowH + rowH, bot - top, 2);
    const sy = this.sc.y;
    B.forEach((br, c) => {
      const x0 = A.x + 10 + c * cw;
      const bc = br.color && br.color.startsWith('#') ? br.color : PAL.gold;
      // 기둥 배경
      const g = ctx.createLinearGradient(0, top - 46, 0, bot);
      g.addColorStop(0, rgba(bc, 0.07)); g.addColorStop(1, rgba(bc, 0));
      ctx.fillStyle = g; ctx.fillRect(x0 + 4, top - 46, cw - 8, bot - top + 46);
      if (c > 0) { ctx.fillStyle = 'rgba(200,160,90,0.14)'; ctx.fillRect(x0, top - 40, 1, bot - top + 34); }
      text(ctx, ellipsize(ctx, br.name ?? br.id, cw - 24, 15, 800, FONT.title), x0 + 14, top - 30, { size: 15, weight: 800, family: FONT.title, color: bc, ow: 3 });
      const gateName = br.kind === 'class' && br.gate ? `${D.CLASSES()[br.gate[0]]?.name ?? ''} 계열 전용` : '공용 기술';
      text(ctx, ellipsize(ctx, gateName, cw - 24, 11, 700), x0 + 14, top - 14, { size: 11, weight: 700, color: PAL.dim, ow: 2 });
      const ids = br.skills || [];
      const fork = br.kind === 'class' && ids.length === 6;
      const R = clamp(rowH * 0.36, 14, 20);
      const pos = ids.map((id, r) => ({ x: x0 + 14 + R + (fork && r >= 4 ? 16 : 0), y: top + rowH * r + rowH / 2 - sy }));
      clipBegin(ctx, TR);
      // 연결선
      ids.forEach((id, r) => {
        const sk = D.SKILLS()[id];
        for (const rq of sk?.req || []) {
          const pr = ids.indexOf(Array.isArray(rq) ? rq[0] : rq);
          if (pr < 0) continue;
          const a = pos[pr], b = pos[r];
          const lit = this.lv(ids[pr]) > 0;
          ctx.strokeStyle = lit ? rgba(bc, 0.9) : 'rgba(90,70,60,0.6)';
          ctx.lineWidth = lit ? 2.5 : 2;
          ctx.beginPath();
          if (a.x === b.x) { ctx.moveTo(a.x, a.y + R); ctx.lineTo(b.x, b.y - R); }
          else { ctx.moveTo(a.x, a.y + R); ctx.lineTo(a.x, b.y); ctx.lineTo(b.x - R, b.y); }
          ctx.stroke();
          if (lit) { const my = (a.y + b.y) / 2; glow(ctx, a.x, my, 9, bc, 0.35 + 0.2 * Math.sin(t * 3 + r)); }
        }
      });
      // 노드
      ids.forEach((id, r) => {
        const sk = D.SKILLS()[id];
        if (!sk) return;
        const { x, y } = pos[r];
        const lv = this.lv(id), max = sk.maxLv ?? 5;
        const chk = lv < max ? this.check(id) : { ok: false };
        const sel = this.sub === 'tree' && this.col === c && this.row === r;
        const rect = this.m.ges.zone({ x: x0 + 4, y: top + rowH * r - sy + 1, w: cw - 8, h: rowH - 2, id, c, r }, 'list', { clip: TR, src: 'skills.node' });
        this.nodeRects.push(rect);
        this.drawNode(ctx, sk, x, y, R, lv, chk.ok, sel, focused, t, bc);
        // 이름 + 레벨. 좁은 계열 기둥(최소 UI 폭 720)에서는 슬롯 배지를 아이콘 아래에 달고, '액티브'는 자리가 있을 때만 (옆 기둥을 덮지 않게)
        const slotted = !!hero.slots?.includes(id), narrow = cw < 170;
        const nx = x + R + 9, right = x0 + cw - 6;
        const nw = right - nx - (slotted && !narrow ? 50 : 0); // 슬롯 배지 자리를 비운다
        text(ctx, ellipsize(ctx, sk.name, nw, 13, 800), nx, y - 1, { size: 13, weight: 800, color: sel ? PAL.goldHi : lv ? PAL.bone : chk.ok ? PAL.text : PAL.faint, ow: 3 });
        // 레벨 눈금
        const step = clamp((right - nx - 6) / max, 6, 10);
        for (let k = 0; k < max; k++) diamond(ctx, nx + 4 + k * step, y + 11, step < 9 ? 3 : 3.4, k < lv ? bc : 'rgba(90,70,60,0.8)');
        if (D.isActive(sk) && nx + max * step + 34 <= right) text(ctx, '액티브', nx + max * step + 6, y + 15, { size: 10, weight: 700, color: lv ? '#ffb070' : PAL.faint, ow: 2 });
        if (slotted) {
          const lb = slotLabel(hero.slots.indexOf(id));
          if (narrow) pill(ctx, lb, x, y + R - 3, { align: 'center', size: 9, h: 13, color: PAL.goldHi, bg: 'rgba(90,10,30,0.92)' });
          else pill(ctx, lb, x0 + cw - 10, y - 14, { align: 'right', size: 9, h: 14, color: PAL.goldHi, bg: 'rgba(90,10,30,0.9)' });
        }
      });
      clipEnd(ctx, TR, null);
    });
    if (this.sc.max > 0) { ctx.save(); clipEnd(ctx, TR, this.sc); scrollbar(ctx, TR.x + TR.w - 3, TR.y, TR.h, this.sc, TR.h); } // 위아래 페이드 + 스크롤 막대
    // 스킬 슬롯 막대
    this.drawSlots(ctx, A.x + 10, A.y + A.h - slotH - 4, TW - 20, slotH, t, focused);
    // 상세
    this.drawDetail(ctx, A.x + TW + 12, A.y, DW, A.h);
  }

  drawNode(ctx, sk, x, y, R, lv, can, sel, focused, t, bc) {
    const pop = this.pop.get(sk.id) ?? 0;
    if (lv > 0) glow(ctx, x, y, R * 2.2, bc, 0.25 + pop * 0.8);
    else if (can) glow(ctx, x, y, R * 2, '#ffd070', 0.12 + 0.12 * (0.5 + 0.5 * Math.sin(t * 5)));
    // 받침 원
    ctx.beginPath(); ctx.arc(x, y, R + 3, 0, TAU);
    ctx.fillStyle = '#0a060c'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = lv > 0 ? PAL.gold : can ? '#c89a50' : '#3a2e2a'; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.clip();
    ctx.globalAlpha *= lv > 0 ? 1 : can ? 0.62 : 0.28;
    try { drawSkillGlyph(ctx, sk, x, y, R * 2.1); } catch (e) { /* 무시 */ }
    ctx.restore();
    if (!lv && !can) glyph(ctx, 'lock', x + R * 0.62, y + R * 0.62, 10, '#8a7a6a', 1.3);
    if (!lv && can) { ctx.beginPath(); ctx.arc(x + R * 0.72, y - R * 0.72, 6.5, 0, TAU); ctx.fillStyle = '#b0182e'; ctx.fill(); ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1; ctx.stroke(); text(ctx, '+', x + R * 0.72, y - R * 0.72 + 4, { size: 11, align: 'center', weight: 900, color: '#fff', ow: 0 }); }
    if (pop > 0) { ctx.strokeStyle = rgba('#ffe7a0', pop); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, R + 4 + (1 - pop) * 16, 0, TAU); ctx.stroke(); }
    if (sel) brackets(ctx, x - R - 3, y - R - 3, R * 2 + 6, R * 2 + 6, t, focused ? PAL.goldHi : PAL.goldMid);
  }

  drawSlots(ctx, x, y, w, h, t, focused) {
    const hero = this.hero;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y, w, h);
    divider(ctx, x, y, w, { a: 0.6 });
    const sp = hero.sp ?? 0;
    if (sp > 0) glowOval(ctx, x + 40, y + 26, 44, 18, '#ffb040', 0.22 + 0.1 * Math.sin(t * 4));
    text(ctx, '스킬 포인트', x + 10, y + 22, { size: 12, weight: 700, color: PAL.dim });
    text(ctx, String(sp), x + 132, y + 26, { size: 24, align: 'right', weight: 900, family: FONT.num, color: sp ? PAL.goldHi : PAL.faint, ow: 4 });
    const ult = D.CHARACTERS()[hero.charId]?.ult;
    if (ult) text(ctx, ellipsize(ctx, `필살기 · ${ult.name}`, 132, 11, 700), x + 10, y + 50, { size: 11, weight: 700, color: ult.color ?? PAL.goldHi });
    if (h >= 66) text(ctx, ellipsize(ctx, swapTip(), 140, 11, 600), x + 10, y + 64, { size: 10, weight: 600, color: PAL.faint, ow: 2 });
    const sx0 = x + 158, sw = (w - 166) / 4;
    const nameW = sw - 58; // 아이콘 오른쪽 이름 칸. 좁은 UI(720)에서는 이름·레벨을 빼고 아이콘만 (옆 칸을 덮지 않게 — 이름은 오른쪽 상세에)
    for (let k = 0; k < 4; k++) {
      const id = hero.slots?.[k] ?? null, sk = id ? D.SKILLS()[id] : null;
      const cx = sx0 + k * sw + 26, cy = y + h / 2 + 2;
      const r = { x: sx0 + k * sw, y: y + 6, w: sw - 6, h: h - 10, k };
      this.slotRects.push(this.m.ges.zone(r, 'primary', { src: 'skills.slot' }));
      const sel = this.sub === 'slots' && this.slotI === k;
      if (k === 2) { ctx.fillStyle = 'rgba(200,160,90,0.25)'; ctx.fillRect(r.x - 4, y + 10, 1, h - 20); }
      rr(ctx, cx - 21, cy - 21, 42, 42, 6);
      ctx.fillStyle = '#0c070e'; ctx.fill();
      ctx.strokeStyle = sel ? PAL.goldHi : sk ? PAL.goldMid : '#3a2e2a'; ctx.lineWidth = sel ? 2 : 1.5; ctx.stroke();
      if (sk) { ctx.save(); rr(ctx, cx - 19, cy - 19, 38, 38, 5); ctx.clip(); try { drawSkillGlyph(ctx, sk, cx, cy, 40); } catch (e) { /* 무시 */ } ctx.restore(); }
      // 슬롯 버튼: 지금 기기의 글리프 (키보드 S/D · 패드 LB/RB · 터치 S1/S2)
      if (!drawGlyph(ctx, k % 2 ? 'skill2' : 'skill1', cx - 27, cy + 8, 16)) keycap(ctx, k % 2 ? 'S2' : 'S1', cx - 27, cy + 8, { h: 16 });
      text(ctx, k < 2 ? 'Ⅰ' : 'Ⅱ', cx + 18, cy - 12, { size: 11, weight: 900, family: FONT.num, color: PAL.gold });
      if (nameW >= 30) {
        text(ctx, ellipsize(ctx, sk ? sk.name : '비어 있음', nameW, 12, 700), cx + 26, cy + 4, { size: 12, weight: 700, color: sk ? PAL.bone : PAL.faint, ow: 2 });
        if (sk) text(ctx, `Lv ${this.lv(id)}`, cx + 26, cy + 19, { size: 10, weight: 700, family: FONT.num, color: PAL.dim });
      }
      if (sel) brackets(ctx, cx - 22, cy - 22, 44, 44, t, focused ? PAL.goldHi : PAL.goldMid);
    }
  }

  drawDetail(ctx, x, y, w, h) {
    frame(ctx, x, y, w, h);
    this.btnRects.length = 0;
    const id = this.selId, sk = id ? D.SKILLS()[id] : null, t = this.t;
    if (!sk) { text(ctx, this.sub === 'slots' ? '비어 있는 슬롯입니다' : '스킬을 고르세요', x + w / 2, y + h / 2, { size: 14, align: 'center', color: PAL.faint }); return; }
    const lv = this.lv(id), max = sk.maxLv ?? 5;
    const bc = sk.color && sk.color.startsWith('#') ? sk.color : PAL.gold;
    // 머리
    glow(ctx, x + 50, y + 52, 50, bc, 0.3 + 0.08 * Math.sin(t * 3));
    ctx.beginPath(); ctx.arc(x + 50, y + 52, 30, 0, TAU); ctx.fillStyle = '#0a060c'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x + 50, y + 52, 28, 0, TAU); ctx.clip(); ctx.globalAlpha *= lv ? 1 : 0.55;
    try { drawSkillGlyph(ctx, sk, x + 50, y + 52, 60); } catch (e) { /* 무시 */ }
    ctx.restore();
    ctx.strokeStyle = PAL.gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 50, y + 52, 30, 0, TAU); ctx.stroke();
    const tx = x + 94;
    text(ctx, ellipsize(ctx, sk.name, w - 104, 18, 800, FONT.title), tx, y + 42, { size: 18, weight: 800, family: FONT.title, color: PAL.bone, ow: 3 });
    let px = tx;
    px += pill(ctx, D.isActive(sk) ? '액티브' : '패시브', px, y + 52, { color: D.isActive(sk) ? '#ffb070' : '#9ac8ff', size: 11, h: 18 }) + 6;
    text(ctx, `Lv ${lv} / ${max}`, px, y + 66, { size: 13, weight: 800, family: FONT.num, color: lv ? PAL.goldHi : PAL.dim });
    let cy = y + 96;
    if (D.isActive(sk)) { text(ctx, `MP ${sk.cost ?? 0}  ·  재사용 ${sk.cd ?? 0}초`, x + 18, cy, { size: 12, weight: 700, color: '#8ac8ff' }); cy += 8; }
    divider(ctx, x + 14, cy + 4, w - 28);
    cy += 26;
    // 현재 / 다음
    const btnH = input.touchMode ? 44 : 38, foot = y + h - btnH - 18;
    const reqs = D.reqsOf(this.hero, sk);
    const needLv = (sk.reqLevel ?? 1) + lv * 2;
    const reqList = [{ text: `캐릭터 레벨 ${needLv}`, ok: this.hero.level >= needLv }, ...reqs.filter((r) => !r.text.startsWith('캐릭터 레벨')), { text: `스킬 포인트 ${sk.spCost ?? 1}`, ok: (this.hero.sp ?? 0) >= (sk.spCost ?? 1) }];
    const reqH = lv < max ? 24 + reqList.length * 18 : 0;
    const txtBottom = foot - reqH - 6;
    const sec = (title, str, col) => {
      if (cy > txtBottom - 20) return;
      text(ctx, title, x + 18, cy, { size: 12, weight: 800, color: col });
      cy += 18;
      cy += para(ctx, str, x + 18, cy, w - 36, { size: 13, color: PAL.text, lh: 1.5, max: Math.max(1, Math.floor((txtBottom - cy) / 19.5)) }) + 8;
    };
    if (lv > 0) sec(`현재 효과 · Lv ${lv}`, D.skillDescOf(id, lv), PAL.gold);
    if (lv < max) sec(lv ? `다음 레벨 · Lv ${lv + 1}` : '습득 시 효과 · Lv 1', D.skillDescOf(id, lv + 1), lv ? PAL.good : '#ffb070');
    else sec('최고 레벨 달성', '더 이상 올릴 수 없습니다.', PAL.goldHi);
    // 조건
    if (lv < max) {
      let ry = foot - reqH + 12;
      text(ctx, '필요 조건', x + 18, ry, { size: 12, weight: 800, color: PAL.dim });
      for (const r of reqList) {
        ry += 18;
        glyph(ctx, r.ok ? 'check' : 'cross', x + 26, ry - 4, 11, r.ok ? PAL.good : PAL.bad, 2);
        text(ctx, r.text, x + 38, ry, { size: 12, weight: 600, color: r.ok ? PAL.text : '#e89090' });
      }
    }
    // 버튼
    const chk = lv < max ? this.check(id) : { ok: false, reason: '최고 레벨' };
    const acts = [];
    if (lv < max) acts.push({ label: lv ? '레벨 업' : '배우기', sub: null, disabled: !chk.ok, run: () => this.learn(id) });
    if (D.isActive(sk) && lv > 0) acts.push({ label: '슬롯 등록', run: () => this.slotMenu(id) });
    const bw = (w - 28 - (acts.length - 1) * 8) / Math.max(1, acts.length);
    acts.forEach((a, k) => {
      const r = { x: x + 14 + k * (bw + 8), y: y + h - btnH - 12, w: bw, h: btnH, run: a.run };
      if (!a.disabled) this.btnRects.push(this.m.ges.zone(r, 'primary', { src: 'skills.act' }));
      gbutton(ctx, r, a.label, { hot: k === 0 && !a.disabled, disabled: a.disabled, size: 14, t, sub: k === 0 && lv < max ? `SP ${sk.spCost ?? 1}` : null });
    });
  }
}
