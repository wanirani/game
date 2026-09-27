// 명예의 전당(모드별 상위 20) + 아케이드식 이니셜 입력(3글자, ↑↓로 글자 순환)
// 플랫폼 (platform §6.2 · §6.3 · §4.5, MASTER_PLAN §1.16) — owner: PLAT-FRONT-A
//  - 두 장면 모두 uiScale (game.uiW × game.uiH, 최소 720×400). 줄 높이는 화면 높이에 맞춘다
//  - 부문 탭은 목록 줄(≥ 36 CSS px), 뒤로·▲▼·등록 버튼은 ui.taps (owner = 장면), 안내 줄은 지금 기기의 글리프
//  - 'NEW RECORD!' 는 ui.bloodText (금박 피 글씨)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { text, FONT, ListMenu, taps, bloodText, prewarmText } from '../../core/ui.js';
import { drawHints, promptMode } from '../../core/prompts.js';
import { clamp, ease, fmt, TAU } from '../../core/math.js';
import { hudSafe } from '../../render/hud_layout.js';
import { CHARACTERS } from '../../data/characters.js';
import { STAGES } from '../../data/stages.js';
import { getDiff } from '../../data/difficulty.js';
import {
  Ambience, kenBurns, shade, frame, heading, ornament, gbutton, backButton, footer, MODES, MODE_NAME,
  recordHighScore, fmtClock, follow, bossRushBests, linGrad, radGrad, GOLD, BONE, DIM,
} from './common.js';
import { COURSES } from './arcade.js';
import * as ENDING from './ending.js';

const MEDAL = ['#ffe070', '#d8dce8', '#e0a060'];
const ORD = (i) => `${i + 1}${i === 0 ? 'ST' : i === 1 ? 'ND' : i === 2 ? 'RD' : 'TH'}`;
const own = (o, k) => typeof k === 'string' && !!o && Object.hasOwn(o, k);

function detail(h) {
  const d = getDiff(h.diff);
  const stg = own(STAGES, h.stageId) ? STAGES[h.stageId] : null;
  switch (h.mode) {
    case 'bossrush': return `${h.bosses ?? '?'}체 격파${h.time ? ' · ' + fmtClock(h.time) : ''}`;
    case 'survival': return `WAVE ${h.wave ?? '?'}`;
    case 'practice': return stg ? `${stg.chapter}장 ${stg.name}` : '연습';
    default: return h.stageId === 'ending' ? '엔딩 도달' : stg ? `${stg.chapter}장 클리어` : (d?.name ?? '');
  }
}
/** 본 엔딩 수 / 전체 엔딩 수 (ending.js ENDINGS: bad·normal·true + 2부 p2·p2true) */
function endingCount(seen) {
  const E = ENDING.ENDINGS && typeof ENDING.ENDINGS === 'object' ? ENDING.ENDINGS : null;
  const list = Array.isArray(seen) ? [...new Set(seen)] : [];
  if (!E) return { n: list.length, of: Math.max(3, list.length) };
  return { n: list.filter((k) => own(E, k)).length, of: Object.keys(E).length };
}

export class HighscoreScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }
  enter({ mode = 'all', highlight = null, back = 'title' } = {}) {
    this.back = back; this.highlight = highlight;
    this.tabs = new ListMenu(MODES.length, { cols: MODES.length, index: Math.max(0, MODES.findIndex((m) => m.id === mode)) });
    const q = this.game.tier === 'low' ? 0.5 : 1;
    this.amb = new Ambience({ embers: Math.round(60 * q), motes: Math.round(20 * q), bats: 5, lightning: false, emberColor: '#ffd070' });
    this.tabK = 0;
    this.page = 0;
    if (!this.game.registry.arcade && back === 'arcade') this.back = 'title';
    audio.music(this.game.state && !this.game.state.arcade ? 'hub' : 'title');
  }
  list() {
    const id = MODES[this.tabs.index].id;
    const all = [...(this.game.meta?.highScores ?? [])].sort((a, b) => b.score - a.score);
    return (id === 'all' ? all : all.filter((h) => (h.mode || 'story') === id)).slice(0, 20);
  }
  update(dt) {
    const g = this.game;
    this.amb.update(dt, g.uiW || g.viewW, g.uiH || g.viewH);
    this.tabK = follow(this.tabK, this.tabs.index, dt, 14);
    if (taps.hit(this) === 'back') { this.leave(); return; }
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
  /** 배치 (UI 좌표): 제목 · 탭 · 순위 두 열 · 부가 기록 · 안내 줄 */
  layout() {
    const g = this.game, k = g.uiK || 1, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const per = Math.max(0.2, (g.cssScale || 1) * k);
    const S = hudSafe(g);
    const sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    const compact = H < 500;
    const headY = st + (compact ? 38 : 44), headSize = compact ? 28 : 32;
    const tabH = clamp(Math.ceil(38 / per), 44, 48);
    const ty = compact ? headY + headSize * 0.72 + 30 : st + 96;
    const y0 = ty + tabH + (compact ? 10 : 16);
    const rowH = clamp(Math.floor((H - sb - 58 - y0) / 10), 24, 31);
    return { W, H, sl, sr, st, sb, compact, headY, headSize, tabH, ty, y0, rowH };
  }
  render(ctx) {
    const g = this.game, t = g.time;
    const L = this.layout(), W = L.W, H = L.H;
    kenBurns(ctx, assets.get('bg/s11_chapel'), W, H, t, { z0: 1.05, z1: 1.12, period: 60 });
    ctx.fillStyle = 'rgba(8,2,8,0.72)'; ctx.fillRect(0, 0, W, H);
    shade(ctx, W, H, { top: 0.5, bottom: 0.7, vig: 0.85 });
    this.amb.draw(ctx, W, H, 'front', t);
    const ap = ease.outCubic(clamp(this.t / 0.5, 0, 1));
    heading(ctx, W / 2, L.headY, 'HALL OF FAME', '명예의 전당', { size: L.headSize, alpha: ap });
    // 탭
    const n = MODES.length, tw = Math.min(150, (W - L.sl - L.sr - 80) / n), tx0 = W / 2 - (tw * n) / 2, ty = L.ty;
    this.tabs.clearHits();
    MODES.forEach((m, i) => {
      const r = { x: tx0 + i * tw, y: ty, w: tw - 6, h: L.tabH };
      this.tabs.hit(i, r);
      const cur = i === this.tabs.index;
      ctx.fillStyle = cur ? 'rgba(140,20,40,0.85)' : 'rgba(20,8,20,0.7)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = cur ? GOLD : 'rgba(200,160,90,0.35)'; ctx.lineWidth = cur ? 2 : 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      text(ctx, m.name, r.x + r.w / 2, r.y + r.h / 2 - 1, { size: 15, align: 'center', weight: 800, color: cur ? '#fff4dc' : '#b8a898', ow: 2, maxWidth: r.w - 8 });
      text(ctx, m.eng, r.x + r.w / 2, r.y + r.h / 2 + 14, { size: 11, align: 'center', weight: 800, family: FONT.num, color: cur ? GOLD : '#6a5e58', ow: 2, maxWidth: r.w - 8 });
    });
    // 목록
    const list = this.list();
    const colW = Math.min(440, (W - L.sl - L.sr - 60) / 2), cx0 = W / 2 - colW - 6, rowH = L.rowH, y0 = L.y0;
    const ck = ease.outCubic(clamp((this.t - (this.changedT ?? 0)) / 0.35, 0, 1));
    if (!list.length) {
      // 기록이 없으면 빈 순위 칸을 그리지 않고 안내 패널만 (글자가 순위 칸 위에 겹치지 않게)
      const pw = Math.min(460, W - 80), ph = 112, px = W / 2 - pw / 2, py = y0 + 5 * rowH - ph / 2 - 8;
      ctx.save(); ctx.globalAlpha = ck;
      frame(ctx, px, py, pw, ph, { glow: 0.4, fill0: 'rgba(22,8,20,0.9)' });
      text(ctx, '아직 이 부문의 기록이 없습니다', W / 2, py + 48, { size: 18, align: 'center', weight: 800, family: FONT.title, color: BONE, ow: 3 });
      text(ctx, '첫 번째 전설의 주인공이 되어 보세요!', W / 2, py + 78, { size: 14, align: 'center', color: DIM, ow: 2 });
      ctx.restore();
    }
    const tb = (rowH - 4) / 2 + 5; // 줄 안 글자 기준선
    const CW = Math.max(1, Math.round(colW));
    for (let i = 0; i < (list.length ? 20 : 0); i++) {
      const col = i < 10 ? 0 : 1, row = i % 10;
      const x = cx0 + col * (colW + 12), y = y0 + row * rowH;
      const h = list[i];
      const k = clamp(ck * 2.2 - i * 0.05, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.25 + 0.75 * k; ctx.translate((1 - k) * 30, 0);
      const hl = h && this.highlight && h.date === this.highlight;
      // 줄 바탕: 폭마다 한 번 만든 그라데이션 3종 (강조 줄은 금빛을 한 겹 더 맥동)
      ctx.save();
      ctx.translate(x, 0);
      const kind = i < 3 && h ? 'top' : 'row';
      ctx.fillStyle = linGrad(ctx, `hsRow|${kind}|${CW}`, 0, 0, CW, 0, [[0, kind === 'top' ? 'rgba(120,20,40,0.55)' : 'rgba(16,6,16,0.6)'], [1, 'rgba(16,6,16,0.15)']]);
      ctx.fillRect(0, y, colW, rowH - 4);
      if (hl) {
        ctx.globalAlpha *= 0.55 + 0.35 * Math.sin(t * 6);
        ctx.fillStyle = linGrad(ctx, `hsRow|hl|${CW}`, 0, 0, CW, 0, [[0, 'rgba(220,170,50,0.75)'], [1, 'rgba(220,170,50,0)']]);
        ctx.fillRect(0, y, colW, rowH - 4);
      }
      ctx.restore();
      if (i < 3 && h) { ctx.fillStyle = MEDAL[i]; ctx.fillRect(x, y, 3, rowH - 4); }
      text(ctx, ORD(i), x + 12, y + tb, { size: 13, weight: 900, family: FONT.num, color: i < 3 && h ? MEDAL[i] : '#8a7a70', ow: 2 });
      if (h) {
        const ch = own(CHARACTERS, h.charId) ? CHARACTERS[h.charId] : null;
        const img = ch?.portrait ? assets.get(ch.portrait) : null;
        const pr = Math.min(11, (rowH - 6) / 2);
        const px = x + 62, py = y + (rowH - 4) / 2;
        ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.clip();
        if (img) { const s = 34 / img.width; ctx.drawImage(img, px - 17, py - 10, 34, img.height * s); } else { ctx.fillStyle = '#3a2a2a'; ctx.fill(); }
        ctx.restore();
        ctx.strokeStyle = 'rgba(232,200,114,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, pr + 0.5, 0, TAU); ctx.stroke();
        const name = h.name || ch?.name?.split(' ')[0] || '???';
        text(ctx, name, x + 80, y + tb, { size: h.name ? 15 : 13, weight: 900, family: h.name ? FONT.num : FONT.body, color: hl ? '#fff' : '#f0e4d0', ow: 2, maxWidth: 66 });
        text(ctx, `${this.tabs.index === 0 ? (MODE_NAME[h.mode || 'story'] ?? '') + ' · ' : ''}${detail(h)}`, x + 150, y + tb - 1, { size: 12, weight: 600, color: DIM, ow: 2, maxWidth: colW - 270 });
        text(ctx, fmt(h.score), x + colW - 10, y + tb, { size: 16, align: 'right', weight: 900, family: FONT.num, color: i === 0 ? '#ffe070' : '#fff', ow: 2 });
      } else text(ctx, '- - -', x + 80, y + tb, { size: 13, weight: 700, family: FONT.num, color: '#4a4040', ow: 0 });
      ctx.restore();
    }
    // 부가 기록
    const m = g.meta ?? {};
    const extra = [];
    const brb = bossRushBests(m), brc = COURSES.map((c, i) => (brb[i] ? `${c.name} ${fmtClock(brb[i].time ?? 0)}` : null)).filter(Boolean);
    if (brc.length) extra.push(`보스 러시 최단  ${brc.join(' · ')}`);
    if (m.survivalBest) extra.push(`서바이벌 최고 WAVE ${m.survivalBest}`);
    const ec = endingCount(m.endingsSeen);
    if (ec.n) extra.push(`엔딩 ${ec.n}/${ec.of}`);
    if (extra.length) text(ctx, extra.join('   ·   '), W / 2, y0 + 10 * rowH + 14, { size: 13, align: 'center', weight: 700, color: '#d8c0a0', ow: 2, maxWidth: W - 40 });
    backButton(ctx, 14 + L.sl, 12 + L.st, '뒤로', this);
    footer(ctx, W, H, '←→ 부문 전환   X 돌아가기', '부문 탭을 터치하세요');
  }
}

// ───────────────────────────── 이니셜 입력 ─────────────────────────────
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-!?* ';
const NEW_RECORD = 'NEW RECORD!';
const NR_OPTS = { size: 46, style: 'gold', drips: 0 };

/** push('initials', { score, mode, entry, onDone(rank, name) }) */
export class InitialsScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; }
  enter({ score = 0, mode = 'story', entry = {}, onDone = null } = {}) {
    this.score = score; this.mode = mode; this.entry = entry; this.onDone = onDone;
    const last = String(this.game.meta?.lastInitials || 'AAA').toUpperCase().padEnd(3, 'A').slice(0, 3);
    this.letters = [...last].map((c) => Math.max(0, CHARS.indexOf(c)));
    this.cur = 0; this.bump = [0, 0, 0, 0];
    this.typedKey = null;
    input.textCapture = (k) => this.onType(k);
    // 예상 순위
    const list = (this.game.meta?.highScores ?? []).filter((h) => (h.mode || 'story') === mode);
    this.rank = list.filter((h) => h.score >= score).length;
    audio.sfx('extra_life');
    // 피 글씨는 처음 그릴 때 굽는다 → 미리 (지금 화면 배율로)
    try {
      const ctx = this.game.ctx, k = (this.game.scale || 1) * (this.game.uiK || 1);
      if (ctx) { ctx.save(); ctx.setTransform(k, 0, 0, k, 0, 0); prewarmText(ctx, NEW_RECORD, NR_OPTS); ctx.restore(); }
    } catch { /* 그릴 때 굽는다 */ }
  }
  exit() { input.textCapture = null; }
  /**
   * 키보드 문자 입력. Z·X·Space 처럼 결정/취소에 묶인 키는 글자가 아니라 조작(다음/이전)으로 처리한다.
   * textCapture 는 keydown 처리 도중(키 상태 반영 전)에 불리므로, 키 상태가 반영된 뒤(마이크로태스크)에 판별한다.
   * 실제 반영은 update 에서 (같은 키의 다른 액션 입력은 flush 로 무시)
   */
  onType(k) {
    const i = CHARS.indexOf(String(k).toUpperCase());
    if (i < 0) return;
    queueMicrotask(() => {
      const key = input.sources?.key ?? {};
      if (key.confirm || key.cancel) return;
      if (this.cur <= 2 && !this.done) this.typedKey = i;
    });
  }
  applyTyped() {
    const i = this.typedKey;
    this.typedKey = null;
    if (i === null || this.cur > 2) return false;
    this.letters[this.cur] = i; this.bump[this.cur] = 1;
    this.cur = Math.min(3, this.cur + 1);
    audio.sfx('type');
    return true;
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
    if (this.applyTyped()) { input.flush(); return; }
    // 터치 (▲▼·글자 칸·등록: ui.taps, 여유 영역으로 44 CSS px)
    const tap = taps.hit(this);
    if (tap) {
      const [act, i] = String(tap).split(':');
      const n = Number(i) || 0;
      if (act === 'up') { this.cur = n; this.cycle(1); }
      else if (act === 'down') { this.cur = n; this.cycle(-1); }
      else if (act === 'sel') { this.cur = n; audio.sfx('menu_move'); }
      else if (act === 'ok') this.finish();
      return;
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
    const g = this.game, t = g.time, uk = g.uiK || 1;
    const W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const S = hudSafe(g), sb = (S.b || 0) / uk, st = (S.t || 0) / uk;
    const k = ease.outCubic(clamp(this.t / 0.3, 0, 1));
    ctx.fillStyle = `rgba(4,0,6,${0.93 * k})`; ctx.fillRect(0, 0, W, H);
    // 방사형 광선
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.07 * k;
    ctx.translate(W / 2, H * 0.45);
    for (let i = 0; i < 16; i++) { ctx.rotate(TAU / 16); ctx.fillStyle = i % 2 ? '#ffd070' : '#b3122e'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, -60); ctx.lineTo(W, 60); ctx.fill(); }
    ctx.restore();
    // 세로 배치: 높이가 모자라면 위쪽 줄 간격을 줄인다 (휴대폰 432~470 UI px)
    const c = H < 500;
    const Y = c
      ? { title: st + 58, rank: st + 88, score: st + 124, orn: st + 140, box: st + 196 }
      : { title: st + 76, rank: st + 108, score: st + 150, orn: st + 168, box: st + 238 };
    ctx.save(); ctx.globalAlpha = k;
    // NEW RECORD — 금박 피 글씨 (뒤쪽 금빛 후광이 맥동)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * (0.25 + 0.15 * Math.sin(t * 6));
    ctx.translate(W / 2, Y.title - 16); ctx.scale(2.6, 0.7);
    ctx.fillStyle = radGrad(ctx, 'nrGlow', 0, 0, 2, 100, [[0, 'rgba(255,190,80,0.9)'], [1, 'rgba(255,120,40,0)']]);
    ctx.fillRect(-100, -100, 200, 200);
    ctx.restore();
    bloodText(ctx, NEW_RECORD, W / 2, Y.title, { ...NR_OPTS, t: this.t, maxWidth: W - 60 });
    text(ctx, `${MODE_NAME[this.mode] ?? ''} 부문 ${this.rank + 1}위 — 명예의 전당에 이름을 새기세요`, W / 2, Y.rank, { size: 16, align: 'center', weight: 800, color: '#f0e0c8', ow: 3, maxWidth: W - 40 });
    text(ctx, fmt(this.score), W / 2, Y.score, { size: 34, align: 'center', weight: 900, family: FONT.num, color: '#fff', ow: 4 });
    ornament(ctx, W / 2, Y.orn, 360);
    // 글자 칸
    const bw = 84, bh = c ? 96 : 104, gap = 22, x0 = W / 2 - (bw * 3 + gap * 2 + 110 + gap) / 2, y = Y.box;
    for (let i = 0; i < 3; i++) {
      const x = x0 + i * (bw + gap), cur = this.cur === i;
      const s = 1 + this.bump[i] * 0.15;
      frame(ctx, x, y, bw, bh, { accent: cur ? GOLD : '#6a5030', glow: cur ? 0.9 : 0, corners: cur });
      ctx.save(); ctx.translate(x + bw / 2, y + bh / 2 + 24); ctx.scale(s, s);
      text(ctx, CHARS[this.letters[i]] === ' ' ? '_' : CHARS[this.letters[i]], 0, 0, { size: 64, align: 'center', weight: 900, family: FONT.num, color: cur ? '#fff6dc' : '#c8b8a8', ow: 5 });
      ctx.restore();
      const up = { x, y: y - 54, w: bw, h: 50 }, dn = { x, y: y + bh + 4, w: bw, h: 50 };
      text(ctx, '▲', x + bw / 2, up.y + 34, { size: 22, align: 'center', color: cur ? GOLD : 'rgba(232,200,114,0.35)', ow: 2 });
      text(ctx, '▼', x + bw / 2, dn.y + 32, { size: 22, align: 'center', color: cur ? GOLD : 'rgba(232,200,114,0.35)', ow: 2 });
      taps.add(`up:${i}`, up, { owner: this, kind: 'icon', src: 'initials.up' });
      taps.add(`down:${i}`, dn, { owner: this, kind: 'icon', src: 'initials.down' });
      taps.add(`sel:${i}`, { x, y, w: bw, h: bh }, { owner: this, kind: 'primary', src: 'initials.box', slop: 0 });
    }
    const er = { x: x0 + 3 * (bw + gap), y: y + (bh - 48) / 2, w: 110, h: 48 };
    gbutton(ctx, er, '등록', { selected: this.cur === 3, size: 18, icon: '✔', owner: this, id: 'ok', src: 'initials.ok' });
    const hy = Math.min(H - 16 - sb, y + bh + 76);
    if (promptMode() === 'touch') text(ctx, '▲▼ 로 글자를 바꾸고 「등록」을 누르세요', W / 2, hy, { size: 13, align: 'center', color: '#b8aa98', ow: 2 });
    else {
      const items = [['dpadV', '글자 변경'], ['dpadH', '칸 이동'], ['confirm', '다음·등록'], ['cancel', '이전']];
      drawHints(ctx, promptMode() === 'kb' ? [...items, [null, '(키보드로 직접 입력 가능)']] : items, W / 2, hy, { align: 'center', size: 13, color: '#b8aa98' });
    }
    ctx.restore();
  }
}
