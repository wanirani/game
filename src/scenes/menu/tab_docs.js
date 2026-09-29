// 비전서 탭: 숨겨진 비전서(DOCS) 수집 현황(책 표지 격자) · 커맨드 기술(방향 키캡) · 영구 능력치 · 기록물(LORE) 열람
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp } from '../../core/math.js';
import { input } from '../../core/input.js';
import { drawGlyph } from '../../core/prompts.js';
import { cmdToText } from '../overlays.js';
import * as LoreM from '../../data/lore.js';
import { Tab } from './base.js';
import {
  PAL, frame, heading, divider, selBar, brackets, glow, glowOval, gbutton, pill, para, rr, glyph, ellipsize, measure, keycap, diamond,
  Scroller, scrollbar, clipBegin, clipEnd, vGrad, hGrad, rGrad, fillPathGrad,
} from './common.js';
// 그라디언트 색 멈춤 (common.js 캐시 — 매 프레임 새 그라디언트 0, R1-REQ-341B)
const PILL_ON = [0, '#a0182e', 1, '#4a0614'], PILL_OFF = [0, 'rgba(40,24,36,0.9)', 1, 'rgba(14,8,14,0.9)'];
const TOME = {
  tech: [0, '#07040a', 0.08, '#8a1a2e', 0.5, '#5a0c1c', 1, '#07040a'],
  lore: [0, '#07040a', 0.08, '#2e2a6a', 0.5, '#1c1a44', 1, '#07040a'],
  none: [0, '#07040a', 0.08, '#1e1a20', 0.5, '#141016', 1, '#07040a'],
};
const DOC_HEAD_ON = [0, 'rgba(232,210,160,0.16)', 1, 'rgba(0,0,0,0)'], DOC_HEAD_OFF = [0, 'rgba(120,100,100,0.08)', 1, 'rgba(0,0,0,0)'];
const LORE_ON = [0, '#e2d4ae', 1, '#c0ac80'], LORE_OFF = [0, '#3a3036', 1, '#221c20'], LORE_VIG = [0, 'rgba(0,0,0,0)', 1, 'rgba(70,40,10,0.45)'];
import { fmtStatVal } from './tab_status.js';
import * as D from './access.js';

const CAT_GLYPH = { history: 'book', diary: 'scroll', bestiary: 'bat', letter: 'scroll' };

export class DocsTab extends Tab {
  constructor(m) {
    super(m);
    this.mode = 0; // 0 비전서, 1 기록물
    this.i = 0; this.li = 0; this.sub = 'grid';
    this.sc = new Scroller();
    this.cardRects = []; this.rowRects = []; this.modeRects = []; this.readRect = null;
    this.gridRows = null; // 비전서 격자의 줄 (보이는 순서의 비전서 번호 배열들) — 방향키 이동용
  }
  /** 2부를 아는가 (모르면 2부 비전서·기록은 숨기고 총수도 1부만 — MASTER_PLAN §1.14) */
  get p2() { return D.p2Known(this.state); }
  get docIds() {
    const all = LoreM.DOC_ORDER?.length ? LoreM.DOC_ORDER : Object.keys(D.DOCS());
    const p2 = this.p2;
    return all.filter((id) => D.DOCS()[id] && (p2 || !D.isP2Stage(D.DOCS()[id].stage)));
  }
  get loreIds() {
    const o = LoreM.LORE_ORDER?.length ? LoreM.LORE_ORDER : Object.keys(D.LORE());
    const p2 = this.p2;
    return o.filter((id) => D.LORE()[id] && (p2 || !D.isP2Stage(D.LORE()[id].stage)));
  }
  hasDoc(id) { return (this.state.progress?.docs || []).includes(id); }
  hasLore(id) { return (this.state.progress?.lore || []).includes(id); }
  setMode(k) { if (k === this.mode) return; this.mode = k; this.sub = 'grid'; this.sc.reset(); audio.sfx('menu_move'); }
  read() {
    if (this.mode === 0) {
      const id = this.docIds[this.i];
      if (!id || !this.hasDoc(id)) { audio.sfx('menu_cancel'); this.m.notify('아직 찾지 못한 비전서입니다', PAL.dim); return; }
      if (!this.game.registry.document) return;
      audio.sfx('menu_ok'); this.game.push('document', { docId: id });
    } else {
      const id = this.loreIds[this.li];
      if (!id || !this.hasLore(id)) { audio.sfx('menu_cancel'); this.m.notify('아직 찾지 못한 기록입니다', PAL.dim); return; }
      if (!this.game.registry.document) return;
      audio.sfx('menu_ok'); this.game.push('document', { loreId: id });
    }
  }
  /** 격자에서 줄을 옮긴다 (1부/2부 사이의 표제를 건너 같은 열 근처로) → 성공하면 true */
  gridStep(d) {
    const rows = this.gridRows;
    if (!rows?.length) return false;
    const r = rows.findIndex((row) => row.includes(this.i));
    if (r < 0) return false;
    const nr = r + d;
    if (nr < 0 || nr >= rows.length) return false;
    const c = rows[r].indexOf(this.i);
    this.i = rows[nr][Math.min(c, rows[nr].length - 1)];
    return true;
  }

  update(dt, nav, ges, focused) {
    this.sc.update(dt, this.mode === 0 ? this.gridRect : this.listRect, ges);
    for (let k = 0; k < this.modeRects.length; k++) if (ges.tap(this.modeRects[k])) { this.m.focus = 'content'; this.setMode(k); return; }
    if (ges.tap(this.readRect)) { this.m.focus = 'content'; this.read(); return; }
    const items = this.mode === 0 ? this.cardRects : this.rowRects;
    if (!this.sc.dragging) {
      for (let k = 0; k < items.length; k++) {
        const r = items[k];
        if (!r || r.thid) continue;
        const cur = this.mode === 0 ? this.i : this.li;
        if (ges.hoverIn(r) && cur !== k) { if (this.mode === 0) this.i = k; else this.li = k; this.sub = 'grid'; }
        if (ges.tap(r)) {
          this.m.focus = 'content'; this.sub = 'grid';
          if (cur === k) this.read();
          else { if (this.mode === 0) this.i = k; else this.li = k; audio.sfx('menu_move'); }
          return;
        }
      }
    }
    if (!focused) return;
    if (this.sub === 'mode') {
      if (nav.left || nav.right) this.setMode(1 - this.mode);
      if (nav.down || nav.confirm) { this.sub = 'grid'; audio.sfx('menu_move'); }
      if (nav.up) { this.sub = 'grid'; this.m.focusTabs(); }
      if (nav.cancel) { this.sub = 'grid'; audio.sfx('menu_cancel'); }
      return;
    }
    if (this.mode === 0) {
      const n = this.docIds.length;
      let mv = false;
      if (nav.left && this.i > 0) { this.i--; mv = true; }
      if (nav.right && this.i < n - 1) { this.i++; mv = true; }
      if (nav.up) { if (this.gridStep(-1)) mv = true; else { this.sub = 'mode'; audio.sfx('menu_move'); } }
      if (nav.down && this.gridStep(1)) mv = true;
      if (mv) audio.sfx('menu_move');
    } else {
      const n = this.loreIds.length;
      if (nav.up) { if (this.li > 0) { this.li--; audio.sfx('menu_move'); } else { this.sub = 'mode'; audio.sfx('menu_move'); } }
      if (nav.down && this.li < n - 1) { this.li++; audio.sfx('menu_move'); }
      if (nav.left || nav.right) this.setMode(0);
    }
    if (nav.confirm) this.read();
    if (nav.cancel) this.m.close();
  }
  hints() { return [['↑↓←→', '고르기'], ['Z', '읽기', '한 번 더 터치하면 읽을 수 있습니다 · 목록은 끌어서 넘기세요']]; }

  render(ctx, A) {
    const t = this.t, focused = this.m.focus === 'content';
    const touch = input.touchMode;
    const DW = Math.round(clamp(A.w * 0.36, 280, 400));
    const GW = A.w - DW - 12;
    frame(ctx, A.x, A.y, GW, A.h);
    // 분류
    this.modeRects.length = 0;
    const docs = this.docIds, lores = this.loreIds;
    const nDoc = docs.filter((id) => this.hasDoc(id)).length, nLore = lores.filter((id) => this.hasLore(id)).length;
    const labels = [`비전서 ${nDoc} / ${docs.length}`, `기록물 ${nLore} / ${lores.length}`];
    let mx = A.x + 12;
    const mh = touch ? 38 : 30, mgap = touch ? 16 : 12;
    labels.forEach((lb, k) => {
      const w = Math.max(touch ? 110 : 0, measure(ctx, lb, 13, 800) + 34);
      const r = { x: mx, y: A.y + 12, w, h: mh };
      this.modeRects.push(r);
      const on = k === this.mode;
      rr(ctx, r.x, r.y, r.w, r.h, mh / 2);
      fillPathGrad(ctx, vGrad(ctx, r.h, on ? PILL_ON : PILL_OFF), 0, r.y); ctx.strokeStyle = on ? PAL.gold : PAL.goldDim; ctx.lineWidth = 1; ctx.stroke();
      glyph(ctx, k ? 'scroll' : 'book', r.x + 16, r.y + r.h / 2, 13, on ? PAL.goldHi : PAL.dim, 1.4);
      text(ctx, lb, r.x + 28, r.y + r.h / 2 + 5, { size: 13, weight: 800, color: on ? PAL.goldHi : PAL.text, ow: 2 });
      if (on && this.sub === 'mode' && focused) brackets(ctx, r.x, r.y, r.w, r.h, t);
      mx += w + 10;
    });
    const top = A.y + 12 + mh + mgap;
    if (this.mode === 0) { this.listRect = null; this.drawGrid(ctx, A.x, top, GW, A.y + A.h - top, t, focused); }
    else { this.gridRect = null; this.cardRects.length = 0; this.drawLoreList(ctx, A.x, top, GW, A.y + A.h - top, t, focused); }
    for (const r of this.modeRects) this.m.ges.zone(r, 'primary', { src: 'docs.mode' }); // 스크롤 항목보다 위
    this.drawDetail(ctx, A.x + GW + 12, A.y, DW, A.h);
  }

  /** 비전서 격자: 스크롤 · 1부 / (2부를 알면) 2부 표제로 묶음 · 아래에 누적 효과 */
  drawGrid(ctx, x, y, w, h, t, focused) {
    const ids = this.docIds, touch = input.touchMode;
    const sumH = 40, gap = 8;
    const GR = { x: x + 8, y, w: w - 16, h: h - sumH - 6 };
    this.gridRect = GR;
    const C = GR.w >= 520 ? 5 : GR.w >= 380 ? 4 : 3;
    this.cols = C;
    const cw = (GR.w - 12 - (C - 1) * gap) / C;
    // 줄 나누기: 1부 · 2부 (2부 앞에 표제)
    const DOCS = D.DOCS();
    const p1 = [], p2 = [];
    ids.forEach((id, k) => (D.isP2Stage(DOCS[id]?.stage) ? p2 : p1).push(k));
    const rows = [];
    for (let k = 0; k < p1.length; k += C) rows.push(p1.slice(k, k + C));
    const p2Row = rows.length;
    for (let k = 0; k < p2.length; k += C) rows.push(p2.slice(k, k + C));
    this.gridRows = rows;
    const HB = 30; // 2부 표제 높이
    // 카드 높이: 전부 들어가면 그대로(최대 96), 아니면 터치 60 · 그 밖 56 으로 두고 스크롤
    const fitH = (GR.h - (rows.length - 1) * gap - (p2.length ? HB : 0)) / Math.max(1, rows.length);
    const ch = Math.min(96, Math.max(touch ? 60 : 56, fitH));
    const rowY = rows.map((_, r) => r * (ch + gap) + (p2.length && r >= p2Row ? HB : 0));
    const totalH = rows.length ? rowY[rows.length - 1] + ch : 0;
    this.sc.setMax(totalH - GR.h + 4);
    const sr = rows.findIndex((row) => row.includes(this.i));
    if (sr >= 0 && this.sc.shouldFollow(this.i)) this.sc.ensure(rowY[sr], rowY[sr] + ch, GR.h, 4);
    clipBegin(ctx, GR);
    this.cardRects.length = 0;
    if (p2.length) {
      const hy = GR.y + rowY[p2Row] - HB - this.sc.y + 2;
      if (hy > GR.y - HB && hy < GR.y + GR.h) {
        glowOval(ctx, GR.x + GR.w / 2, hy + 14, GR.w * 0.35, 12, '#8a2aff', 0.2);
        text(ctx, '제2부 · 이계의 비전서', GR.x + GR.w / 2, hy + 19, { size: 13, align: 'center', weight: 800, family: FONT.title, color: '#d8b0ff', ow: 3 });
      }
    }
    rows.forEach((row, r) => {
      row.forEach((k, c) => {
        const id = ids[k];
        const cx = GR.x + 6 + c * (cw + gap), cy = GR.y + rowY[r] - this.sc.y;
        const rect = this.m.ges.zone({ x: cx, y: cy, w: cw, h: ch }, 'primary', { clip: GR, src: 'docs.card' });
        this.cardRects[k] = rect;
        if (cy > GR.y + GR.h || cy + ch < GR.y) return;
        const d = DOCS[id], have = this.hasDoc(id);
        const sel = k === this.i && this.sub === 'grid';
        this.drawTome(ctx, rect, d, have, sel, t);
        if (sel) brackets(ctx, cx, cy, cw, ch, t, focused ? PAL.goldHi : PAL.goldMid);
      });
    });
    clipEnd(ctx, GR, this.sc);
    scrollbar(ctx, GR.x + GR.w - 4, GR.y, GR.h, this.sc, GR.h);
    // 합계
    const sy = y + h - sumH;
    divider(ctx, x + 12, sy, w - 24, { center: false, a: 0.5 });
    const tot = {};
    for (const id of this.state.progress?.docs || []) for (const [k, v] of Object.entries(DOCS[id]?.stats || {})) tot[k] = (tot[k] ?? 0) + v;
    const parts = Object.entries(tot).map(([k, v]) => `${D.STAT_INFO[k]?.name ?? k} +${fmtStatVal(k, v)}`);
    const techs = (this.state.progress?.docs || []).filter((id) => DOCS[id]?.tech).length;
    text(ctx, '누적 효과', x + 16, sy + 26, { size: 12, weight: 800, color: PAL.gold, family: FONT.title });
    text(ctx, ellipsize(ctx, `기술 ${techs}개 습득${parts.length ? '  ·  ' + parts.join(' · ') : ''}`, w - 110, 12, 600), x + 86, sy + 26, { size: 12, weight: 600, color: PAL.text, ow: 2 });
  }

  drawTome(ctx, r, d, have, sel, t) {
    const tech = !!d?.tech;
    const base = have ? (tech ? '#5a0c1c' : '#1c1a44') : '#141016';
    const hi = have ? (tech ? '#8a1a2e' : '#2e2a6a') : '#1e1a20';
    if (have && sel) glowOval(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.7, r.h * 0.7, tech ? '#ff3050' : '#6a6aff', 0.3);
    // 책등 + 표지
    rr(ctx, r.x, r.y, r.w, r.h, 4); fillPathGrad(ctx, hGrad(ctx, r.w, TOME[have ? (tech ? 'tech' : 'lore') : 'none']), r.x, 0); // 캐시 (hi·base 와 같은 색)
    ctx.strokeStyle = have ? '#8a6a30' : '#2e2428'; ctx.lineWidth = 1.2; ctx.stroke();
    // 책등 줄
    ctx.fillStyle = have ? 'rgba(232,200,114,0.5)' : 'rgba(80,60,60,0.4)';
    ctx.fillRect(r.x + 7, r.y + 3, 1.5, r.h - 6); ctx.fillRect(r.x + 11, r.y + 3, 1, r.h - 6);
    // 모서리 금장
    if (have) {
      ctx.fillStyle = '#c8a050';
      for (const [cx, cy, sx, sy] of [[r.x + r.w - 2, r.y + 2, -1, 1], [r.x + r.w - 2, r.y + r.h - 2, -1, -1]]) {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sx * 10, cy); ctx.lineTo(cx, cy + sy * 10); ctx.closePath(); ctx.fill();
      }
    }
    const cx = r.x + r.w / 2 + 5, cy = r.y + r.h * 0.4;
    if (have) {
      glow(ctx, cx, cy, 20, tech ? '#ffb070' : '#a0a8ff', 0.35 + 0.1 * Math.sin(t * 2 + r.x));
      ctx.strokeStyle = PAL.gold; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.stroke();
      glyph(ctx, tech ? 'rune' : 'star', cx, cy, 15, PAL.goldHi, 1.4);
      const nm = (d?.name ?? '').replace(/^비전서:\s*/, '');
      text(ctx, ellipsize(ctx, nm, r.w - 18, 12, 800), cx, r.y + r.h - 12, { size: 12, align: 'center', weight: 800, color: PAL.goldHi, ow: 3 });
    } else {
      text(ctx, '?', cx, cy + 9, { size: 26, align: 'center', weight: 900, family: FONT.num, color: '#3e3238', ow: 0 });
      text(ctx, '???', cx, r.y + r.h - 12, { size: 12, align: 'center', weight: 800, color: '#5a4a50', ow: 2 });
    }
    const ch = D.stageChapter(d?.stage);
    if (ch) text(ctx, `${ch}장`, r.x + 16, r.y + 15, { size: 10, weight: 800, color: have ? PAL.dim : PAL.faint, ow: 2 });
  }

  /** 기록물 목록: 1부 / (2부를 알면) 2부 표제 · 끌기 스크롤 · 터치 줄 48 */
  drawLoreList(ctx, x, y, w, h, t, focused) {
    const ids = this.loreIds, RH = input.touchMode ? 48 : 44, HB = 30;
    const LR = { x: x + 8, y, w: w - 16, h: h - 10 };
    this.listRect = LR;
    const L = D.LORE(), cats = LoreM.LORE_CATS || {};
    const firstP2 = ids.findIndex((id) => D.isP2Stage(L[id]?.stage));
    const rowY = (k) => k * RH + (firstP2 >= 0 && k >= firstP2 ? HB : 0);
    this.sc.setMax((ids.length ? rowY(ids.length - 1) + RH : 0) - LR.h);
    if (ids.length && this.sc.shouldFollow(this.li)) this.sc.ensure(rowY(this.li), rowY(this.li) + RH, LR.h);
    clipBegin(ctx, LR);
    this.rowRects.length = 0;
    if (firstP2 >= 0) {
      const hy = LR.y + rowY(firstP2) - HB - this.sc.y;
      if (hy > LR.y - HB && hy < LR.y + LR.h) {
        glowOval(ctx, LR.x + LR.w / 2, hy + 15, LR.w * 0.35, 12, '#8a2aff', 0.2);
        text(ctx, '제2부 · 이계의 기록', LR.x + LR.w / 2, hy + 20, { size: 13, align: 'center', weight: 800, family: FONT.title, color: '#d8b0ff', ow: 3 });
      }
    }
    ids.forEach((id, k) => {
      const ry = LR.y + rowY(k) - this.sc.y;
      const r = this.m.ges.zone({ x: LR.x, y: ry, w: LR.w - 8, h: RH - 3 }, 'list', { clip: LR, src: 'docs.lore' });
      this.rowRects[k] = r;
      if (ry > LR.y + LR.h || ry + RH < LR.y) return;
      const e = L[id], have = this.hasLore(id), sel = k === this.li && this.sub === 'grid';
      if (sel) selBar(ctx, r.x, r.y, r.w, r.h, t, { dim: !focused });
      else if (k % 2 === 0) { ctx.fillStyle = 'rgba(255,230,200,0.025)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      glyph(ctx, CAT_GLYPH[e.cat] ?? 'scroll', r.x + 22, r.y + r.h / 2, 16, have ? PAL.goldMid : '#3e3238', 1.5);
      const sl = D.stageLabel(e.stage);
      text(ctx, have ? ellipsize(ctx, e.name, r.w - 190, 14, 800) : '???', r.x + 42, r.y + r.h / 2 + 5, { size: 14, weight: 800, color: have ? (sel ? PAL.goldHi : PAL.bone) : PAL.faint, ow: 3 });
      text(ctx, sl, r.x + r.w - 10, r.y + r.h / 2 + 4, { size: 11, align: 'right', weight: 600, color: PAL.dim, ow: 2 });
      if (have && cats[e.cat]) pill(ctx, cats[e.cat], r.x + r.w - 10 - measure(ctx, sl, 11, 600) - 8, r.y + r.h / 2 - 8, { align: 'right', size: 10, h: 16, color: PAL.gold });
    });
    if (!ids.length) text(ctx, '기록물 정보가 없습니다', LR.x + LR.w / 2, LR.y + 50, { size: 14, align: 'center', color: PAL.faint });
    clipEnd(ctx, LR, this.sc);
    scrollbar(ctx, LR.x + LR.w - 4, LR.y, LR.h, this.sc, LR.h);
  }

  drawDetail(ctx, x, y, w, h) {
    frame(ctx, x, y, w, h);
    this.readRect = null;
    const t = this.t;
    if (this.mode === 1) return this.drawLoreDetail(ctx, x, y, w, h);
    const id = this.docIds[this.i], d = D.DOCS()[id];
    if (!d) { text(ctx, '비전서 정보가 없습니다', x + w / 2, y + h / 2, { size: 14, align: 'center', color: PAL.faint }); return; }
    const have = this.hasDoc(id);
    const tech = d.tech;
    // 양피지 머리
    ctx.translate(0, y + 10); ctx.fillStyle = vGrad(ctx, 74, have ? DOC_HEAD_ON : DOC_HEAD_OFF); // 캐시 (y+10 → y+84)
    ctx.fillRect(x + 8, -2, w - 16, 76); ctx.translate(0, -(y + 10));
    text(ctx, have ? '— 비 전 서 —' : '— 미 발 견 —', x + w / 2, y + 30, { size: 12, align: 'center', weight: 700, family: FONT.title, color: have ? '#c89a60' : PAL.faint });
    text(ctx, have ? d.name : '???', x + w / 2, y + 58, { size: 20, align: 'center', weight: 800, family: FONT.title, color: have ? PAL.bone : PAL.faint, ow: 4, maxWidth: w - 30 });
    divider(ctx, x + 30, y + 72, w - 60);
    let cy = y + 96;
    text(ctx, D.stageLabel(d.stage), x + w / 2, cy, { size: 12, align: 'center', weight: 700, color: PAL.dim });
    cy += 14;
    if (!have) {
      glyph(ctx, 'eye', x + w / 2, cy + 40, 30, '#4a3a40', 1.6);
      text(ctx, '단서', x + 20, cy + 90, { size: 12, weight: 800, color: PAL.gold });
      para(ctx, d.hint ?? '어딘가의 부서지는 벽 너머에 숨겨져 있다.', x + 20, cy + 112, w - 40, { size: 13, color: PAL.text, max: 3 });
      text(ctx, '숨겨진 벽을 부수면 찾을 수 있습니다', x + w / 2, y + h - 22, { size: 12, align: 'center', color: PAL.faint });
      return;
    }
    // 기술 / 능력치
    if (tech) {
      cy += 12;
      text(ctx, `커맨드 기술 · ${tech.name}`, x + 20, cy + 8, { size: 14, weight: 800, color: '#ffb070' });
      cy += 22;
      // 방향은 화살표 키캡, 버튼(공격 등)은 지금 기기의 글리프 (키보드 X · 패드 □/X · 터치 버튼)
      const cmd = Array.isArray(tech.cmd) ? tech.cmd : [];
      let kx = x + 20;
      cmd.forEach((c, i) => {
        let kw = 0;
        if (typeof c === 'string' && c.startsWith('btn:')) kw = drawGlyph(ctx, c.slice(4), kx, cy, 26);
        if (!kw) { const kk = cmdToText([c]); kw = keycap(ctx, kk, kx, cy, { h: 26, color: kk.length === 1 ? PAL.goldHi : '#ffd0a0' }); }
        kx += kw + (i < cmd.length - 1 ? 16 : 0);
        if (i < cmd.length - 1) text(ctx, '+', kx - 9, cy + 18, { size: 12, align: 'center', color: PAL.dim, ow: 0 });
      });
      cy += 44;
      cy += para(ctx, tech.desc ?? '', x + 20, cy, w - 40, { size: 13, color: PAL.bone, weight: 600, max: 2 });
      if (tech.mp) { text(ctx, `소모 MP ${tech.mp}`, x + 20, cy + 4, { size: 12, weight: 700, color: '#8ac8ff' }); cy += 18; }
      text(ctx, '→ 는 캐릭터가 바라보는 방향입니다', x + 20, cy + 6, { size: 11, color: PAL.faint });
      cy += 18;
    }
    if (d.stats) {
      cy += 10;
      text(ctx, '영구 능력치 상승', x + 20, cy + 8, { size: 14, weight: 800, color: '#9ac8ff' });
      cy += 14;
      for (const [k, v] of Object.entries(d.stats)) {
        cy += 20;
        diamond(ctx, x + 26, cy - 4, 3, '#9ac8ff');
        text(ctx, D.STAT_INFO[k]?.name ?? k, x + 36, cy, { size: 13, weight: 600, color: PAL.text });
        text(ctx, `+${fmtStatVal(k, v)}`, x + w - 22, cy, { size: 14, align: 'right', weight: 800, family: FONT.num, color: PAL.good });
      }
      cy += 8;
    }
    // 본문
    const btnH = input.touchMode ? 44 : 34;
    divider(ctx, x + 14, cy + 8, w - 28, { center: false, a: 0.35 });
    const maxL = Math.floor((y + h - btnH - 24 - (cy + 30)) / 18) + 1;
    if (maxL > 0) para(ctx, d.text ?? '', x + 20, cy + 30, w - 40, { size: 12, color: '#c8b898', max: maxL, family: FONT.title, weight: 700 });
    this.readRect = this.m.ges.zone({ x: x + w / 2 - 75, y: y + h - btnH - 12, w: 150, h: btnH }, 'primary', { src: 'docs.read' });
    gbutton(ctx, this.readRect, '전문 읽기', { icon: 'book', size: 13, t, hot: this.m.ges.over(this.readRect) });
  }

  drawLoreDetail(ctx, x, y, w, h) {
    const id = this.loreIds[this.li], e = D.LORE()[id];
    if (!e) { text(ctx, '기록물 정보가 없습니다', x + w / 2, y + h / 2, { size: 14, align: 'center', color: PAL.faint }); return; }
    const have = this.hasLore(id), t = this.t;
    const cats = LoreM.LORE_CATS || {};
    // 양피지
    const px = x + 14, py = y + 14, pw = w - 28, ph = h - (input.touchMode ? 44 : 34) - 36;
    // 그라디언트는 원점 기준 캐시 (R1-REQ-341B: 예전에는 매 프레임 2개)
    rr(ctx, px, py, pw, ph, 3); fillPathGrad(ctx, vGrad(ctx, ph, have ? LORE_ON : LORE_OFF), 0, py);
    const vcx = px + pw / 2, vcy = py + ph / 2;
    ctx.translate(vcx, vcy); ctx.fillStyle = rGrad(ctx, 0, 0, ph * 0.2, pw * 0.8, LORE_VIG); ctx.fillRect(px - vcx, py - vcy, pw, ph); ctx.translate(-vcx, -vcy);
    ctx.strokeStyle = have ? '#6a4a2a' : '#2a2226'; ctx.lineWidth = 2; ctx.strokeRect(px + 6, py + 6, pw - 12, ph - 12);
    if (!have) {
      text(ctx, '???', x + w / 2, py + 60, { size: 22, align: 'center', weight: 800, family: FONT.title, color: '#6a5a60', outline: null });
      text(ctx, `${D.stageLabel(e.stage)}에서 찾을 수 있다`, x + w / 2, py + 92, { size: 13, align: 'center', color: '#8a7a80', outline: null });
      if (e.hint) text(ctx, e.hint, x + w / 2, py + 114, { size: 12, align: 'center', color: '#6a5a60', outline: null });
      return;
    }
    text(ctx, `— ${cats[e.cat] ?? '기 록'} —`, x + w / 2, py + 34, { size: 12, align: 'center', weight: 700, family: FONT.title, color: '#6a3a1a', outline: null });
    text(ctx, e.name, x + w / 2, py + 62, { size: 19, align: 'center', weight: 800, family: FONT.title, color: '#3a1a0a', outline: null, maxWidth: pw - 30 });
    ctx.fillStyle = '#8a2a1a'; ctx.fillRect(x + w / 2 - 60, py + 72, 120, 2);
    const lines = Math.max(1, Math.floor((ph - 110) / 21));
    para(ctx, e.text ?? '', px + 20, py + 100, pw - 40, { size: 13, lh: 1.6, color: '#2a1a0a', family: FONT.title, weight: 700, ow: 0, max: lines });
    const bh = input.touchMode ? 44 : 34;
    this.readRect = this.m.ges.zone({ x: x + w / 2 - 75, y: y + h - bh - 12, w: 150, h: bh }, 'primary', { src: 'docs.read' });
    gbutton(ctx, this.readRect, '크게 읽기', { icon: 'book', size: 13, t, hot: this.m.ges.over(this.readRect) });
  }
}
