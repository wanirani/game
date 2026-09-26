// 퀘스트 탭: 진행 중 / 수락 가능 / 완료 목록 · 진행도 · 의뢰인 · 보상 · 안내
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp } from '../../core/math.js';
import { input } from '../../core/input.js';
import { drawIcon } from '../../render/icons.js';
import { Tab } from './base.js';
import {
  PAL, frame, heading, divider, selBar, brackets, glow, glowOval, gauge, pill, para, rr, glyph, ellipsize, measure, Scroller, scrollbar, clipBegin, clipEnd,
} from './common.js';
import * as D from './access.js';

const SECTS = [
  { id: 'active', name: '진행 중' },
  { id: 'avail', name: '수락 가능' },
  { id: 'done', name: '완료' },
];

export class QuestsTab extends Tab {
  constructor(m) {
    super(m);
    this.si = 0; this.i = 0; this.sub = 'list';
    this.sc = new Scroller();
    this.rowRects = []; this.sectRects = [];
    this.rev = -1; this.lists = null;
  }
  onShow() { this.lists = null; }
  build() {
    const st = this.state;
    this.lists = { active: D.activeQuestIds(st), avail: D.availQuestIds(st), done: D.doneQuestIds(st).slice().reverse() };
    if (this.si === 0 && !this.lists.active.length && this.lists.avail.length) this.si = 1;
  }
  get ids() { if (!this.lists) this.build(); return this.lists[SECTS[this.si].id]; }
  setSect(k) { k = (k + SECTS.length) % SECTS.length; if (k === this.si) return; this.si = k; this.i = 0; this.sc.reset(); audio.sfx('menu_move'); }

  update(dt, nav, ges, focused) {
    if (!this.lists) this.build();
    this.sc.update(dt, this.listRect, ges);
    for (let k = 0; k < this.sectRects.length; k++) if (ges.tap(this.sectRects[k])) { this.m.focus = 'content'; this.setSect(k); return; }
    if (!this.sc.dragging) {
      for (let k = 0; k < this.rowRects.length; k++) {
        const r = this.rowRects[k];
        if (!r) continue;
        if (ges.hoverIn(r)) this.i = k;
        if (ges.tap(r)) { this.m.focus = 'content'; this.sub = 'list'; if (this.i !== k) audio.sfx('menu_move'); this.i = k; return; }
      }
    }
    if (!focused) return;
    const n = this.ids.length;
    if (this.sub === 'sect') {
      if (nav.left) this.setSect(this.si - 1);
      if (nav.right) this.setSect(this.si + 1);
      if (nav.down || nav.confirm) { this.sub = 'list'; audio.sfx('menu_move'); }
      if (nav.up || nav.cancel) { this.sub = 'list'; this.m.focusTabs(); }
      return;
    }
    if (nav.left) this.setSect(this.si - 1);
    if (nav.right) this.setSect(this.si + 1);
    if (nav.up) { if (this.i > 0) { this.i--; audio.sfx('menu_move'); } else { this.sub = 'sect'; audio.sfx('menu_move'); } }
    if (nav.down && this.i < n - 1) { this.i++; audio.sfx('menu_move'); }
    if (nav.cancel) this.m.focusTabs();
  }
  hints() { return [['←→', '분류'], ['↑↓', '퀘스트', '퀘스트를 터치하면 자세히 볼 수 있습니다']]; }

  render(ctx, A) {
    if (!this.lists) this.build();
    const t = this.t, focused = this.m.focus === 'content';
    const LW = Math.round(clamp(A.w * 0.42, 330, 460));
    frame(ctx, A.x, A.y, LW, A.h);
    // 분류
    this.sectRects.length = 0;
    const sw = (LW - 24 - 12) / 3, sh = input.touchMode ? 36 : 32;
    SECTS.forEach((s, k) => {
      const r = { x: A.x + 12 + k * (sw + 6), y: A.y + 12, w: sw, h: sh };
      this.sectRects.push(r);
      const on = k === this.si;
      rr(ctx, r.x, r.y, r.w, r.h, 5);
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      if (on) { g.addColorStop(0, '#a0182e'); g.addColorStop(1, '#4a0614'); } else { g.addColorStop(0, 'rgba(40,24,36,0.9)'); g.addColorStop(1, 'rgba(14,8,14,0.9)'); }
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = on ? PAL.gold : PAL.goldDim; ctx.lineWidth = 1; ctx.stroke();
      const cnt = this.lists[s.id].length;
      text(ctx, `${s.name} ${cnt}`, r.x + r.w / 2, r.y + r.h / 2 + 5, { size: 13, align: 'center', weight: 800, color: on ? PAL.goldHi : PAL.text, ow: 2 });
      if (s.id === 'active' && this.lists.active.some((id) => D.questProg(this.state, id).done)) glow(ctx, r.x + r.w - 10, r.y + 8, 8, '#60ff90', 0.6 + 0.3 * Math.sin(t * 5));
      if (on && this.sub === 'sect' && focused) brackets(ctx, r.x, r.y, r.w, r.h, t);
    });
    // 목록
    const LR = { x: A.x + 8, y: A.y + 12 + sh + 10, w: LW - 16, h: A.h - sh - 32 };
    this.listRect = LR;
    const ids = this.ids, RH = 62;
    this.i = clamp(this.i, 0, Math.max(0, ids.length - 1));
    this.sc.setMax(ids.length * RH - LR.h);
    if (ids.length) this.sc.ensure(this.i * RH, this.i * RH + RH, LR.h);
    clipBegin(ctx, LR);
    this.rowRects.length = 0;
    const Q = D.QUESTS();
    ids.forEach((id, k) => {
      const q = Q[id];
      const y = LR.y + k * RH - this.sc.y;
      const r = { x: LR.x, y, w: LR.w - 8, h: RH - 4 };
      this.rowRects[k] = r;
      if (y > LR.y + LR.h || y + RH < LR.y) return;
      const sel = k === this.i;
      if (sel) selBar(ctx, r.x, r.y, r.w, r.h, t, { dim: !focused || this.sub !== 'list' });
      else if (k % 2 === 0) { ctx.fillStyle = 'rgba(255,230,200,0.025)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      const main = q?.kind === 'main';
      glyph(ctx, main ? 'crown' : 'scroll', r.x + 24, r.y + 22, 17, main ? '#ffd070' : PAL.goldMid, 1.6);
      const sect = SECTS[this.si].id;
      const pr = D.questProg(this.state, id);
      const nameC = sect === 'done' ? PAL.dim : sel ? PAL.goldHi : PAL.bone;
      text(ctx, ellipsize(ctx, q?.name ?? id, r.w - 150, 15, 800), r.x + 44, r.y + 24, { size: 15, weight: 800, color: nameC, ow: 3 });
      if (sect === 'active') {
        const ready = pr.done;
        const txt = D.questText(this.state, id);
        text(ctx, ellipsize(ctx, txt, r.w - 60, 12, 600), r.x + 44, r.y + 43, { size: 12, weight: 600, color: ready ? PAL.good : PAL.text, ow: 2 });
        gauge(ctx, r.x + 44, r.y + 49, r.w - 60, 4, pr.need ? pr.cur / pr.need : 0, ready ? '#60e080' : '#e8c872', { glowEnd: false });
        if (ready) { glowOval(ctx, r.x + r.w - 44, r.y + 18, 44, 14, '#40ff80', 0.2 + 0.12 * Math.sin(t * 5)); pill(ctx, '완료 가능', r.x + r.w - 8, r.y + 8, { align: 'right', size: 10, h: 17, color: '#9affb0', bg: 'rgba(20,70,40,0.9)' }); }
      } else if (sect === 'avail') {
        text(ctx, `의뢰인: ${D.npcName(q?.giver) || '—'}`, r.x + 44, r.y + 44, { size: 12, weight: 600, color: PAL.dim, ow: 2 });
      } else {
        glyph(ctx, 'check', r.x + r.w - 20, r.y + 22, 14, PAL.good, 2);
        text(ctx, D.questReward(id), r.x + 44, r.y + 44, { size: 11, weight: 600, color: PAL.faint, ow: 2, maxWidth: r.w - 60 });
      }
      if (main && sect !== 'done' && !(sect === 'active' && pr.done)) pill(ctx, '메인', r.x + r.w - 8, r.y + 8, { align: 'right', size: 10, h: 17, color: '#ffd070', bg: 'rgba(90,40,10,0.9)' });
    });
    if (!ids.length) {
      const msg = ['진행 중인 퀘스트가 없습니다', '지금 받을 수 있는 퀘스트가 없습니다', '아직 완료한 퀘스트가 없습니다'][this.si];
      text(ctx, msg, LR.x + LR.w / 2, LR.y + 50, { size: 14, align: 'center', color: PAL.faint });
      if (this.si !== 2) text(ctx, '마을 사람들과 의뢰 게시판을 확인해 보세요', LR.x + LR.w / 2, LR.y + 74, { size: 12, align: 'center', color: PAL.faint });
    }
    clipEnd(ctx, LR, this.sc);
    scrollbar(ctx, LR.x + LR.w - 4, LR.y, LR.h, this.sc, LR.h);
    // 상세
    this.drawDetail(ctx, A.x + LW + 12, A.y, A.w - LW - 12, A.h, ids[this.i]);
  }

  drawDetail(ctx, x, y, w, h, id) {
    frame(ctx, x, y, w, h);
    const q = id ? D.QUESTS()[id] : null, t = this.t;
    if (!q) {
      glyph(ctx, 'scroll', x + w / 2, y + h / 2 - 30, 40, PAL.goldDim, 1.5);
      text(ctx, '퀘스트를 고르면 내용이 표시됩니다', x + w / 2, y + h / 2 + 20, { size: 14, align: 'center', color: PAL.faint });
      return;
    }
    const sect = SECTS[this.si].id;
    const main = q.kind === 'main';
    // 머리
    glowOval(ctx, x + w / 2, y + 30, w * 0.5, 40, main ? '#ff9a30' : '#a01830', 0.18);
    let px = x + 18;
    px += pill(ctx, main ? '메인 퀘스트' : '서브 퀘스트', px, y + 16, { color: main ? '#ffd070' : PAL.gold, size: 11, h: 19, bg: main ? 'rgba(90,40,10,0.92)' : 'rgba(50,20,30,0.92)' }) + 8;
    const giver = D.npcName(q.giver);
    if (giver) text(ctx, `의뢰인 · ${giver}`, px, y + 30, { size: 12, weight: 700, color: PAL.dim });
    text(ctx, q.name ?? id, x + 18, y + 64, { size: 21, weight: 800, family: FONT.title, color: PAL.bone, ow: 4, maxWidth: w - 36 });
    divider(ctx, x + 14, y + 78, w - 28);
    let cy = y + 104;
    cy += para(ctx, q.desc ?? '', x + 20, cy, w - 40, { size: 14, color: PAL.text, lh: 1.6, max: 5 }) + 10;
    // 목표
    heading(ctx, '목표', x + 18, cy + 6, w - 36, { size: 14 });
    cy += 30;
    const pr = D.questProg(this.state, id);
    const ptxt = sect === 'done' ? '달성 완료' : D.questText(this.state, id) || '—';
    text(ctx, ptxt, x + 24, cy, { size: 14, weight: 700, color: pr.done || sect === 'done' ? PAL.good : PAL.bone });
    if (sect !== 'avail') {
      const ratio = sect === 'done' ? 1 : pr.need ? pr.cur / pr.need : 0;
      gauge(ctx, x + 24, cy + 10, w - 48, 8, ratio, pr.done || sect === 'done' ? '#60e080' : '#e8c872');
      text(ctx, `${Math.round(ratio * 100)}%`, x + w - 24, cy, { size: 12, align: 'right', weight: 800, family: FONT.num, color: PAL.dim });
      cy += 18;
    }
    cy += 30;
    // 보상
    heading(ctx, '보상', x + 18, cy, w - 36, { size: 14 });
    cy += 14;
    const rw = q.reward || {};
    let rx = x + 24;
    const chip = (icon, label, col = PAL.bone) => {
      const tw = measure(ctx, label, 13, 700) + 40;
      if (rx + tw > x + w - 16) { rx = x + 24; cy += 34; }
      rr(ctx, rx, cy, tw, 28, 5); ctx.fillStyle = 'rgba(20,10,16,0.9)'; ctx.fill(); ctx.strokeStyle = PAL.goldDim; ctx.lineWidth = 1; ctx.stroke();
      if (icon) drawIcon(ctx, icon, rx + 15, cy + 14, 20); else text(ctx, 'EXP', rx + 15, cy + 18, { size: 9, align: 'center', weight: 900, family: FONT.num, color: '#9ae0ff', ow: 2 });
      text(ctx, label, rx + 30, cy + 19, { size: 13, weight: 700, color: col, ow: 2 });
      rx += tw + 6;
    };
    if (rw.gold) chip('coin', `${rw.gold.toLocaleString('ko-KR')} G`, '#ffd870');
    if (rw.exp) chip(null, `${rw.exp.toLocaleString('ko-KR')}`, '#9ae0ff');
    for (const it of rw.items || []) { const b = D.ITEMS()[it.id]; chip(b?.icon ?? 'doc', `${b?.name ?? it.id} ×${it.qty ?? 1}`); }
    if (!rw.gold && !rw.exp && !(rw.items || []).length) { const rt = D.questReward(id); if (rt) text(ctx, rt, x + 24, cy + 18, { size: 13, color: PAL.bone }); }
    // 안내
    const hintTxt = sect === 'done' ? '완료한 퀘스트입니다.'
      : sect === 'avail' ? (q.giver === 'board' ? '마을의 의뢰 게시판에서 수락할 수 있습니다.' : `마을에서 ${giver || '의뢰인'}에게 말을 걸어 수락하세요.`)
      : pr.done ? (q.auto || main ? '목표를 달성했습니다! 보상은 자동으로 지급됩니다.' : `목표 달성! ${giver || '의뢰인'}에게 돌아가 보상을 받으세요.`)
      : '목표를 향해 나아가세요.';
    const hy = y + h - 26;
    divider(ctx, x + 14, hy - 16, w - 28, { center: false, a: 0.4 });
    if (sect === 'active' && pr.done) glowOval(ctx, x + w / 2, hy - 4, w * 0.45, 16, '#40ff80', 0.15 + 0.08 * Math.sin(t * 4));
    text(ctx, hintTxt, x + w / 2, hy, { size: 13, align: 'center', weight: 700, color: sect === 'active' && pr.done ? PAL.good : PAL.dim, maxWidth: w - 30 });
  }
}
