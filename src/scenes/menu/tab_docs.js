// 비전서 탭: 숨겨진 비전서(DOCS) 수집 현황(책 표지 격자) · 커맨드 기술(방향 키캡) · 영구 능력치 · 기록물(LORE) 열람
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp, rgba } from '../../core/math.js';
import { input } from '../../core/input.js';
import { cmdToText } from '../overlays.js';
import * as LoreM from '../../data/lore.js';
import { Tab } from './base.js';
import {
  PAL, frame, heading, divider, selBar, brackets, glow, glowOval, gbutton, pill, para, rr, glyph, ellipsize, measure, keycap, diamond,
  Scroller, scrollbar, clipBegin, clipEnd,
} from './common.js';
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
  }
  get docIds() { return LoreM.DOC_ORDER?.length ? LoreM.DOC_ORDER : Object.keys(D.DOCS()); }
  get loreIds() { const o = LoreM.LORE_ORDER?.length ? LoreM.LORE_ORDER : Object.keys(D.LORE()); return o.filter((id) => D.LORE()[id]); }
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

  update(dt, nav, ges, focused) {
    for (let k = 0; k < this.modeRects.length; k++) if (ges.tap(this.modeRects[k])) { this.m.focus = 'content'; this.setMode(k); return; }
    if (ges.tap(this.readRect)) { this.m.focus = 'content'; this.read(); return; }
    if (this.mode === 0) {
      for (let k = 0; k < this.cardRects.length; k++) {
        const r = this.cardRects[k];
        if (ges.hoverIn(r)) { this.i = k; this.sub = 'grid'; }
        if (ges.tap(r)) { this.m.focus = 'content'; this.sub = 'grid'; if (this.i === k) this.read(); else { this.i = k; audio.sfx('menu_move'); } return; }
      }
    } else {
      this.sc.update(dt, this.listRect, ges);
      if (!this.sc.dragging) for (let k = 0; k < this.rowRects.length; k++) {
        const r = this.rowRects[k];
        if (!r) continue;
        if (ges.hoverIn(r)) { this.li = k; this.sub = 'grid'; }
        if (ges.tap(r)) { this.m.focus = 'content'; this.sub = 'grid'; if (this.li === k) this.read(); else { this.li = k; audio.sfx('menu_move'); } return; }
      }
    }
    if (!focused) return;
    if (this.sub === 'mode') {
      if (nav.left || nav.right) this.setMode(1 - this.mode);
      if (nav.down || nav.confirm) { this.sub = 'grid'; audio.sfx('menu_move'); }
      if (nav.up || nav.cancel) { this.sub = 'grid'; this.m.focusTabs(); }
      return;
    }
    if (this.mode === 0) {
      const n = this.docIds.length, C = this.cols || 5;
      let mv = false;
      if (nav.left && this.i > 0) { this.i--; mv = true; }
      if (nav.right && this.i < n - 1) { this.i++; mv = true; }
      if (nav.up) { if (this.i - C >= 0) { this.i -= C; mv = true; } else { this.sub = 'mode'; audio.sfx('menu_move'); } }
      if (nav.down && this.i + C < n) { this.i += C; mv = true; }
      if (mv) audio.sfx('menu_move');
    } else {
      const n = this.loreIds.length;
      if (nav.up) { if (this.li > 0) { this.li--; audio.sfx('menu_move'); } else { this.sub = 'mode'; audio.sfx('menu_move'); } }
      if (nav.down && this.li < n - 1) { this.li++; audio.sfx('menu_move'); }
      if (nav.left || nav.right) this.setMode(0);
    }
    if (nav.confirm) this.read();
    if (nav.cancel) this.m.focusTabs();
  }
  hints() { return [['↑↓←→', '고르기'], ['Z', '읽기', '한 번 더 터치하면 읽을 수 있습니다']]; }

  render(ctx, A) {
    const t = this.t, focused = this.m.focus === 'content';
    const DW = Math.round(clamp(A.w * 0.36, 300, 400));
    const GW = A.w - DW - 12;
    frame(ctx, A.x, A.y, GW, A.h);
    // 분류
    this.modeRects.length = 0;
    const docs = this.docIds, lores = this.loreIds;
    const nDoc = docs.filter((id) => this.hasDoc(id)).length, nLore = lores.filter((id) => this.hasLore(id)).length;
    const labels = [`비전서 ${nDoc} / ${docs.length}`, `기록물 ${nLore} / ${lores.length}`];
    let mx = A.x + 12;
    const mh = input.touchMode ? 34 : 30;
    labels.forEach((lb, k) => {
      const w = measure(ctx, lb, 13, 800) + 34;
      const r = { x: mx, y: A.y + 12, w, h: mh };
      this.modeRects.push(r);
      const on = k === this.mode;
      rr(ctx, r.x, r.y, r.w, r.h, mh / 2);
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      if (on) { g.addColorStop(0, '#a0182e'); g.addColorStop(1, '#4a0614'); } else { g.addColorStop(0, 'rgba(40,24,36,0.9)'); g.addColorStop(1, 'rgba(14,8,14,0.9)'); }
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = on ? PAL.gold : PAL.goldDim; ctx.lineWidth = 1; ctx.stroke();
      glyph(ctx, k ? 'scroll' : 'book', r.x + 16, r.y + r.h / 2, 13, on ? PAL.goldHi : PAL.dim, 1.4);
      text(ctx, lb, r.x + 28, r.y + r.h / 2 + 5, { size: 13, weight: 800, color: on ? PAL.goldHi : PAL.text, ow: 2 });
      if (on && this.sub === 'mode' && focused) brackets(ctx, r.x, r.y, r.w, r.h, t);
      mx += w + 8;
    });
    const top = A.y + 12 + mh + 12;
    if (this.mode === 0) this.drawGrid(ctx, A.x, top, GW, A.y + A.h - top, t, focused);
    else this.drawLoreList(ctx, A.x, top, GW, A.y + A.h - top, t, focused);
    this.drawDetail(ctx, A.x + GW + 12, A.y, DW, A.h);
  }

  drawGrid(ctx, x, y, w, h, t, focused) {
    const ids = this.docIds, C = 5;
    this.cols = C;
    const sumH = 44;
    const rows = Math.ceil(ids.length / C) || 1;
    const gap = 8, cw = (w - 24 - (C - 1) * gap) / C, ch = Math.min(96, (h - sumH - 12 - (rows - 1) * gap) / rows);
    this.cardRects.length = 0;
    const DOCS = D.DOCS();
    ids.forEach((id, k) => {
      const c = k % C, r = Math.floor(k / C);
      const cx = x + 12 + c * (cw + gap), cy = y + r * (ch + gap);
      const rect = { x: cx, y: cy, w: cw, h: ch };
      this.cardRects.push(rect);
      const d = DOCS[id], have = this.hasDoc(id);
      const sel = k === this.i && this.sub === 'grid';
      this.drawTome(ctx, rect, d, have, sel, t);
      if (sel) brackets(ctx, cx, cy, cw, ch, t, focused ? PAL.goldHi : PAL.goldMid);
    });
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
    const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
    g.addColorStop(0, '#07040a'); g.addColorStop(0.08, hi); g.addColorStop(0.5, base); g.addColorStop(1, '#07040a');
    rr(ctx, r.x, r.y, r.w, r.h, 4); ctx.fillStyle = g; ctx.fill();
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
    const st = D.STAGES()[d?.stage];
    if (st?.chapter) text(ctx, `${st.chapter}장`, r.x + 16, r.y + 15, { size: 10, weight: 800, color: have ? PAL.dim : PAL.faint, ow: 2 });
  }

  drawLoreList(ctx, x, y, w, h, t, focused) {
    const ids = this.loreIds, RH = 44;
    const LR = { x: x + 8, y, w: w - 16, h: h - 10 };
    this.listRect = LR;
    this.sc.setMax(ids.length * RH - LR.h);
    if (ids.length) this.sc.ensure(this.li * RH, this.li * RH + RH, LR.h);
    clipBegin(ctx, LR);
    this.rowRects.length = 0;
    const L = D.LORE(), cats = LoreM.LORE_CATS || {};
    ids.forEach((id, k) => {
      const ry = LR.y + k * RH - this.sc.y;
      const r = { x: LR.x, y: ry, w: LR.w - 8, h: RH - 3 };
      this.rowRects[k] = r;
      if (ry > LR.y + LR.h || ry + RH < LR.y) return;
      const e = L[id], have = this.hasLore(id), sel = k === this.li && this.sub === 'grid';
      if (sel) selBar(ctx, r.x, r.y, r.w, r.h, t, { dim: !focused });
      else if (k % 2 === 0) { ctx.fillStyle = 'rgba(255,230,200,0.025)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      glyph(ctx, CAT_GLYPH[e.cat] ?? 'scroll', r.x + 22, r.y + r.h / 2, 16, have ? PAL.goldMid : '#3e3238', 1.5);
      text(ctx, have ? ellipsize(ctx, e.name, r.w - 190, 14, 800) : '???', r.x + 42, r.y + r.h / 2 + 5, { size: 14, weight: 800, color: have ? (sel ? PAL.goldHi : PAL.bone) : PAL.faint, ow: 3 });
      text(ctx, D.stageLabel(e.stage), r.x + r.w - 10, r.y + r.h / 2 + 4, { size: 11, align: 'right', weight: 600, color: PAL.dim, ow: 2 });
      if (have && cats[e.cat]) pill(ctx, cats[e.cat], r.x + r.w - 10 - measure(ctx, D.stageLabel(e.stage), 11, 600) - 8, r.y + r.h / 2 - 8, { align: 'right', size: 10, h: 16, color: PAL.gold });
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
    const hg = ctx.createLinearGradient(0, y + 10, 0, y + 84);
    hg.addColorStop(0, have ? 'rgba(232,210,160,0.16)' : 'rgba(120,100,100,0.08)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg; ctx.fillRect(x + 8, y + 8, w - 16, 76);
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
      const keys = cmdToText(tech.cmd).split(' ').filter(Boolean);
      let kx = x + 20;
      keys.forEach((kk, i) => {
        const big = kk.length === 1;
        const kw = keycap(ctx, kk, kx, cy, { h: 26, color: big ? PAL.goldHi : '#ffd0a0' });
        kx += kw + (i < keys.length - 1 ? 16 : 0);
        if (i < keys.length - 1) text(ctx, '+', kx - 9, cy + 18, { size: 12, align: 'center', color: PAL.dim, ow: 0 });
      });
      cy += 44;
      cy += para(ctx, tech.desc ?? '', x + 20, cy, w - 40, { size: 13, color: PAL.bone, weight: 600, max: 2 });
      if (tech.mp) { text(ctx, `소모 MP ${tech.mp}`, x + 20, cy + 4, { size: 12, weight: 700, color: '#8ac8ff' }); cy += 18; }
      text(ctx, '→ 는 바라보는 방향 기준입니다', x + 20, cy + 6, { size: 11, color: PAL.faint });
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
    const btnH = 34;
    divider(ctx, x + 14, cy + 8, w - 28, { center: false, a: 0.35 });
    const maxL = Math.max(1, Math.floor((y + h - btnH - 24 - (cy + 30)) / 19));
    para(ctx, d.text ?? '', x + 20, cy + 30, w - 40, { size: 12, color: '#c8b898', max: maxL, family: FONT.title, weight: 700 });
    this.readRect = { x: x + w / 2 - 70, y: y + h - btnH - 12, w: 140, h: btnH };
    gbutton(ctx, this.readRect, '전문 읽기', { icon: 'book', size: 13, t, hot: this.m.ges.over(this.readRect) });
  }

  drawLoreDetail(ctx, x, y, w, h) {
    const id = this.loreIds[this.li], e = D.LORE()[id];
    if (!e) { text(ctx, '기록물 정보가 없습니다', x + w / 2, y + h / 2, { size: 14, align: 'center', color: PAL.faint }); return; }
    const have = this.hasLore(id), t = this.t;
    const cats = LoreM.LORE_CATS || {};
    // 양피지
    const px = x + 14, py = y + 14, pw = w - 28, ph = h - 70;
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, have ? '#e2d4ae' : '#3a3036'); g.addColorStop(1, have ? '#c0ac80' : '#221c20');
    rr(ctx, px, py, pw, ph, 3); ctx.fillStyle = g; ctx.fill();
    const vg = ctx.createRadialGradient(px + pw / 2, py + ph / 2, ph * 0.2, px + pw / 2, py + ph / 2, pw * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(70,40,10,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(px, py, pw, ph);
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
    this.readRect = { x: x + w / 2 - 70, y: y + h - 46, w: 140, h: 34 };
    gbutton(ctx, this.readRect, '크게 읽기', { icon: 'book', size: 13, t, hot: this.m.ges.over(this.readRect) });
    void rgba;
  }
}
