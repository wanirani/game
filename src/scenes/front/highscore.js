// 명예의 전당(모드별 상위 20) + 아케이드식 이니셜 입력(3글자, ↑↓로 글자 순환)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, FONT, ListMenu } from '../../core/ui.js';
import { clamp, ease, fmt, rgba, TAU } from '../../core/math.js';
import { CHARACTERS } from '../../data/characters.js';
import { STAGES } from '../../data/stages.js';
import { getDiff } from '../../data/difficulty.js';
import {
  Ambience, kenBurns, shade, frame, heading, ornament, gbutton, backButton, footer, setPad, MODES, MODE_NAME,
  recordHighScore, fmtDate, fmtClock, follow, GOLD, BONE, DIM, CRIMSON,
} from './common.js';

const MEDAL = ['#ffe070', '#d8dce8', '#e0a060'];
const ORD = (i) => `${i + 1}${i === 0 ? 'ST' : i === 1 ? 'ND' : i === 2 ? 'RD' : 'TH'}`;

function detail(h) {
  const d = getDiff(h.diff);
  switch (h.mode) {
    case 'bossrush': return `${h.bosses ?? '?'}체 격파${h.time ? ' · ' + fmtClock(h.time) : ''}`;
    case 'survival': return `WAVE ${h.wave ?? '?'}`;
    case 'practice': return STAGES[h.stageId] ? `${STAGES[h.stageId].chapter}장 ${STAGES[h.stageId].name}` : '연습';
    default: return h.stageId === 'ending' ? '엔딩 도달' : STAGES[h.stageId] ? `${STAGES[h.stageId].chapter}장 클리어` : (d?.name ?? '');
  }
}

export class HighscoreScene extends Scene {
  enter({ mode = 'all', highlight = null, back = 'title' } = {}) {
    setPad(false);
    this.back = back; this.highlight = highlight;
    this.tabs = new ListMenu(MODES.length, { cols: MODES.length, index: Math.max(0, MODES.findIndex((m) => m.id === mode)) });
    this.amb = new Ambience({ embers: 60, motes: 20, bats: 5, lightning: false, emberColor: '#ffd070' });
    this.tabK = 0;
    this.page = 0;
    if (!this.game.registry.arcade && back === 'arcade') this.back = 'title';
    audio.music(this.game.state && !this.game.state.arcade ? 'hub' : 'title');
  }
  exit() { setPad(true); }
  onResume() { setPad(false); }
  list() {
    const id = MODES[this.tabs.index].id;
    const all = [...(this.game.meta?.highScores ?? [])].sort((a, b) => b.score - a.score);
    return (id === 'all' ? all : all.filter((h) => (h.mode || 'story') === id)).slice(0, 20);
  }
  update(dt) {
    const g = this.game;
    this.amb.update(dt, g.viewW, g.viewH);
    this.tabK = follow(this.tabK, this.tabs.index, dt, 14);
    if (this.backTapped) { this.backTapped = false; this.leave(); return; }
    const r = this.tabs.update(dt);
    if (this.tabs.moved) { audio.sfx('menu_move'); this.changedT = this.t; }
    if (r === 'cancel' || (r === 'confirm' && !input.pointer.tapped)) this.leave();
  }
  leave() {
    audio.sfx('menu_cancel');
    const g = this.game;
    if (this.back === 'arcade') g.go('arcade', {});
    else if (this.back === 'hub' && g.registry.hub && g.state) g.go('hub', {});
    else g.go('title', { menu: true, index: 3 });
  }
  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    kenBurns(ctx, assets.get('bg/s11_chapel'), vw, vh, t, { z0: 1.05, z1: 1.12, period: 60 });
    ctx.fillStyle = 'rgba(8,2,8,0.72)'; ctx.fillRect(0, 0, vw, vh);
    shade(ctx, vw, vh, { top: 0.5, bottom: 0.7, vig: 0.85 });
    this.amb.draw(ctx, vw, vh, 'front', t);
    const ap = ease.outCubic(clamp(this.t / 0.5, 0, 1));
    heading(ctx, vw / 2, 44, 'HALL OF FAME', '명예의 전당', { size: 32, alpha: ap });
    // 탭
    const n = MODES.length, tw = Math.min(150, (vw - 80) / n), tx0 = vw / 2 - (tw * n) / 2, ty = 96;
    this.tabs.clearHits();
    MODES.forEach((m, i) => {
      const r = { x: tx0 + i * tw, y: ty, w: tw - 6, h: 44 };
      this.tabs.hit(i, r);
      const cur = i === this.tabs.index;
      ctx.fillStyle = cur ? 'rgba(140,20,40,0.85)' : 'rgba(20,8,20,0.7)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = cur ? GOLD : 'rgba(200,160,90,0.35)'; ctx.lineWidth = cur ? 2 : 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      text(ctx, m.name, r.x + r.w / 2, r.y + 21, { size: 15, align: 'center', weight: 800, color: cur ? '#fff4dc' : '#b8a898', ow: 2 });
      text(ctx, m.eng, r.x + r.w / 2, r.y + 36, { size: 9, align: 'center', weight: 800, family: FONT.num, color: cur ? GOLD : '#6a5e58', ow: 2 });
    });
    // 목록
    const L = this.list();
    const colW = Math.min(440, (vw - 60) / 2), cx0 = vw / 2 - colW - 6, rowH = 31, y0 = 156;
    const ck = ease.outCubic(clamp((this.t - (this.changedT ?? 0)) / 0.35, 0, 1));
    if (!L.length) {
      text(ctx, '아직 이 부문의 기록이 없습니다', vw / 2, 290, { size: 18, align: 'center', weight: 800, family: FONT.title, color: BONE, ow: 3 });
      text(ctx, '첫 번째 전설의 주인공이 되어 보세요!', vw / 2, 318, { size: 14, align: 'center', color: DIM, ow: 2 });
    }
    for (let i = 0; i < 20; i++) {
      const col = i < 10 ? 0 : 1, row = i % 10;
      const x = cx0 + col * (colW + 12), y = y0 + row * rowH;
      const h = L[i];
      const k = clamp(ck * 2.2 - i * 0.05, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.25 + 0.75 * k; ctx.translate((1 - k) * 30, 0);
      const hl = h && this.highlight && h.date === this.highlight;
      const bg = ctx.createLinearGradient(x, 0, x + colW, 0);
      bg.addColorStop(0, hl ? `rgba(200,150,40,${0.35 + 0.2 * Math.sin(t * 6)})` : i < 3 && h ? 'rgba(120,20,40,0.55)' : 'rgba(16,6,16,0.6)');
      bg.addColorStop(1, 'rgba(16,6,16,0.15)');
      ctx.fillStyle = bg; ctx.fillRect(x, y, colW, rowH - 4);
      if (i < 3 && h) { ctx.fillStyle = MEDAL[i]; ctx.fillRect(x, y, 3, rowH - 4); }
      text(ctx, ORD(i), x + 12, y + 19, { size: 13, weight: 900, family: FONT.num, color: i < 3 && h ? MEDAL[i] : '#8a7a70', ow: 2 });
      if (h) {
        const ch = CHARACTERS[h.charId];
        const img = assets.get(ch?.portrait);
        const px = x + 62, py = y + (rowH - 4) / 2;
        ctx.save(); ctx.beginPath(); ctx.arc(px, py, 11, 0, TAU); ctx.clip();
        if (img) { const s = 34 / img.width; ctx.drawImage(img, px - 17, py - 10, 34, img.height * s); } else { ctx.fillStyle = '#3a2a2a'; ctx.fill(); }
        ctx.restore();
        ctx.strokeStyle = 'rgba(232,200,114,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, 11.5, 0, TAU); ctx.stroke();
        const name = h.name || ch?.name?.split(' ')[0] || '???';
        text(ctx, name, x + 80, y + 19, { size: h.name ? 15 : 13, weight: 900, family: h.name ? FONT.num : FONT.body, color: hl ? '#fff' : '#f0e4d0', ow: 2 });
        text(ctx, `${this.tabs.index === 0 ? (MODE_NAME[h.mode || 'story'] ?? '') + ' · ' : ''}${detail(h)}`, x + 150, y + 18, { size: 11, weight: 600, color: DIM, ow: 2, maxWidth: colW - 270 });
        text(ctx, fmt(h.score), x + colW - 10, y + 19, { size: 16, align: 'right', weight: 900, family: FONT.num, color: i === 0 ? '#ffe070' : '#fff', ow: 2 });
      } else text(ctx, '- - -', x + 80, y + 19, { size: 13, weight: 700, family: FONT.num, color: '#4a4040', ow: 0 });
      ctx.restore();
    }
    // 부가 기록
    const m = g.meta;
    const extra = [];
    if (m.bossRushBest) extra.push(`보스 러시 최단 ${fmtClock(m.bossRushBest.time ?? 0)}`);
    if (m.survivalBest) extra.push(`서바이벌 최고 WAVE ${m.survivalBest}`);
    if (m.endingsSeen?.length) extra.push(`엔딩 ${m.endingsSeen.length}/3`);
    if (extra.length) text(ctx, extra.join('   ·   '), vw / 2, y0 + 10 * rowH + 16, { size: 13, align: 'center', weight: 700, color: '#d8c0a0', ow: 2 });
    if (backButton(ctx)) this.backTapped = true;
    footer(ctx, vw, vh, '←→ 부문 전환   X 돌아가기', '부문 탭을 터치하세요');
  }
}

// ───────────────────────────── 이니셜 입력 ─────────────────────────────
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-!?* ';

/** push('initials', { score, mode, entry, onDone(rank, name) }) */
export class InitialsScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ score = 0, mode = 'story', entry = {}, onDone = null } = {}) {
    setPad(false);
    this.score = score; this.mode = mode; this.entry = entry; this.onDone = onDone;
    const last = (this.game.meta?.lastInitials || 'AAA').toUpperCase().padEnd(3, 'A').slice(0, 3);
    this.letters = [...last].map((c) => Math.max(0, CHARS.indexOf(c)));
    this.cur = 0; this.bump = [0, 0, 0, 0];
    this.typed = false;
    input.textCapture = (k) => this.onType(k);
    // 예상 순위
    const list = (this.game.meta?.highScores ?? []).filter((h) => (h.mode || 'story') === mode);
    this.rank = list.filter((h) => h.score >= score).length;
    audio.sfx('extra_life');
    this.hits = [];
  }
  exit() { input.textCapture = null; setPad(true); }
  onType(k) {
    const c = k.toUpperCase();
    const i = CHARS.indexOf(c);
    if (i < 0 || this.cur > 2) return;
    this.letters[this.cur] = i; this.bump[this.cur] = 1;
    this.cur = Math.min(3, this.cur + 1);
    this.typed = true;
    audio.sfx('type');
  }
  cycle(d) {
    if (this.cur > 2) return;
    this.letters[this.cur] = (this.letters[this.cur] + d + CHARS.length) % CHARS.length;
    this.bump[this.cur] = 1;
    audio.sfx('menu_move');
  }
  finish() {
    if (this.done) return;
    this.done = true;
    const name = this.letters.map((i) => CHARS[i]).join('').trim() || '???';
    const g = this.game;
    g.meta.lastInitials = name;
    const rank = recordHighScore(g, { ...this.entry, score: this.score, mode: this.mode, name });
    audio.sfx('enhance_success');
    g.flash('#ffe070', 0.5, 3);
    g.toast(`명예의 전당 ${rank + 1}위에 「${name}」 등록!`, '#ffe070', 3);
    input.textCapture = null;
    g.pop();
    this.onDone?.(rank, name);
  }
  update(dt) {
    for (let i = 0; i < 4; i++) this.bump[i] = Math.max(0, this.bump[i] - dt * 5);
    if (this.typed) { this.typed = false; input.flush(); return; }
    // 터치
    for (const h of this.hits) {
      const p = input.pointer;
      if (p.tapped && p.x >= h.r.x && p.x <= h.r.x + h.r.w && p.y >= h.r.y && p.y <= h.r.y + h.r.h) {
        if (h.act === 'up') { this.cur = h.i; this.cycle(1); }
        else if (h.act === 'down') { this.cur = h.i; this.cycle(-1); }
        else if (h.act === 'sel') { this.cur = h.i; audio.sfx('menu_move'); }
        else if (h.act === 'ok') this.finish();
        return;
      }
    }
    if (input.pressed('up')) this.cycle(1);
    else if (input.pressed('down')) this.cycle(-1);
    else if (input.pressed('right')) { this.cur = Math.min(3, this.cur + 1); audio.sfx('menu_move'); }
    else if (input.pressed('left')) { this.cur = Math.max(0, this.cur - 1); audio.sfx('menu_move'); }
    else if (input.pressed('confirm') || input.pressed('menu')) {
      if (this.cur >= 3 || input.pressed('menu')) this.finish();
      else { this.cur++; audio.sfx('menu_ok'); }
    } else if (input.pressed('cancel')) { if (this.cur > 0) { this.cur--; audio.sfx('menu_cancel'); } }
    // 자동 반복 (길게 누르기)
    for (const [a, d] of [['up', 1], ['down', -1]]) {
      if (input.down(a)) { this.hold = (this.hold ?? 0) + dt; if (this.hold > 0.35) { this.hold = 0.28; this.cycle(d); } }
    }
    if (!input.down('up') && !input.down('down')) this.hold = 0;
  }
  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    const k = ease.outCubic(clamp(this.t / 0.3, 0, 1));
    ctx.fillStyle = `rgba(4,0,6,${0.84 * k})`; ctx.fillRect(0, 0, vw, vh);
    // 방사형 광선
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.12 * k;
    ctx.translate(vw / 2, vh * 0.45);
    for (let i = 0; i < 16; i++) { ctx.rotate(TAU / 16); ctx.fillStyle = i % 2 ? '#ffd070' : '#b3122e'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(vw, -60); ctx.lineTo(vw, 60); ctx.fill(); }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = k;
    const blink = 0.7 + 0.3 * Math.sin(t * 6);
    ctx.shadowColor = '#ffb040'; ctx.shadowBlur = 22;
    text(ctx, 'NEW RECORD!', vw / 2, 76, { size: 46, align: 'center', weight: 900, family: FONT.logo, color: `rgba(255,232,150,${blink})`, ow: 6 });
    ctx.shadowBlur = 0;
    text(ctx, `${MODE_NAME[this.mode] ?? ''} 부문 ${this.rank + 1}위 — 명예의 전당에 이름을 새기세요`, vw / 2, 108, { size: 16, align: 'center', weight: 800, color: '#f0e0c8', ow: 3 });
    text(ctx, fmt(this.score), vw / 2, 150, { size: 34, align: 'center', weight: 900, family: FONT.num, color: '#fff', ow: 4 });
    ornament(ctx, vw / 2, 168, 360);
    // 글자 칸
    this.hits = [];
    const bw = 84, bh = 104, gap = 22, x0 = vw / 2 - (bw * 3 + gap * 2 + 110 + gap) / 2, y = 238;
    for (let i = 0; i < 3; i++) {
      const x = x0 + i * (bw + gap), cur = this.cur === i;
      const s = 1 + this.bump[i] * 0.15;
      frame(ctx, x, y, bw, bh, { accent: cur ? GOLD : '#6a5030', glow: cur ? 0.9 : 0, corners: cur });
      ctx.save(); ctx.translate(x + bw / 2, y + bh / 2 + 24); ctx.scale(s, s);
      text(ctx, CHARS[this.letters[i]] === ' ' ? '_' : CHARS[this.letters[i]], 0, 0, { size: 64, align: 'center', weight: 900, family: FONT.num, color: cur ? '#fff6dc' : '#c8b8a8', ow: 5 });
      ctx.restore();
      const up = { x, y: y - 50, w: bw, h: 46 }, dn = { x, y: y + bh + 4, w: bw, h: 46 };
      text(ctx, '▲', x + bw / 2, up.y + 32, { size: 22, align: 'center', color: cur ? GOLD : 'rgba(232,200,114,0.35)', ow: 2 });
      text(ctx, '▼', x + bw / 2, dn.y + 30, { size: 22, align: 'center', color: cur ? GOLD : 'rgba(232,200,114,0.35)', ow: 2 });
      this.hits.push({ r: up, act: 'up', i }, { r: dn, act: 'down', i }, { r: { x, y, w: bw, h: bh }, act: 'sel', i });
    }
    const er = { x: x0 + 3 * (bw + gap), y: y + 28, w: 110, h: 48 };
    if (gbutton(ctx, er, '등록', { selected: this.cur === 3, size: 18, icon: '✔' })) { /* 탭은 hits 로 처리 */ }
    this.hits.push({ r: er, act: 'ok', i: 3 });
    text(ctx, input.touchMode ? '▲▼ 로 글자를 바꾸고 「등록」을 누르세요' : '↑↓ 글자 변경   ←→ 칸 이동   Z 다음/등록   X 이전   (키보드로 직접 입력 가능)', vw / 2, vh - 30, { size: 13, align: 'center', color: '#b8aa98', ow: 2 });
    ctx.restore();
  }
}
