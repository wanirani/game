// 해골 주사위 (하이 & 로우) — 뼈 주사위 3개를 굴려 다음 합이 높을지/낮을지/트리플일지 맞힌다.
// 맞힐 때마다 확률 기반 배당이 곱해지고(연승 배율), 언제든 '거두기'로 수령. 트리플 적중 ×30 잭팟.
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { text, FONT } from '../../core/ui.js';
import { clamp, lerp, rand, randi, ease, fmt, TAU } from '../../core/math.js';
import { MiniGame, innBackdrop, feltTable, gPanel, drawBtn, goldText, candle, record, GOLD } from './common.js';
import { Q, dieRestQ, drawDie, glow, rr } from './art.js';

// 3d6 합의 경우의 수 (합 3~18)
const WAYS = [1, 3, 6, 10, 15, 21, 25, 27, 27, 25, 21, 15, 10, 6, 3, 1];
const pHigher = (s) => { let n = 0; for (let k = s + 1; k <= 18; k++) n += WAYS[k - 3]; return n / 216; };
const pLower = (s) => { let n = 0; for (let k = 3; k < s; k++) n += WAYS[k - 3]; return n / 216; };
const EDGE = 0.95;
const multOf = (p) => (p <= 0 ? 0 : clamp(Math.round((EDGE / p) * 100) / 100, 1.02, 99));
const TRIPLE_MULT = 30, MAX_STREAK = 8;

export class DiceScene extends MiniGame {
  constructor(g) { super(g, 'dice'); }
  init() {
    this.dice = [0, 1, 2].map((i) => ({ v: randi(1, 6), q: dieRestQ(randi(1, 6), rand(-0.6, 0.6), 0.5), x: 0, y: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 9, dur: 1, th0: 0, ax: [0, 1, 0], qF: null, bounces: 0, landed: true, hot: 0 }));
    this.layoutDice(true);
    this.cur = 0; this.streak = 0; this.mult = 1; this.guess = null;
    this.history = [];
    this.rollT = 0; this.rolling = false; this.first = false;
    this.verdict = null; this.verdictT = 0; this.sumPop = 0;
    this.multShown = 1;
    this.phase = 'ready';
  }
  layoutDice(snap) {
    const cx = this.vw / 2, cy = 232;
    this.dice.forEach((d, i) => {
      d.x1 = cx + (i - 1) * 108 + rand(-10, 10); d.y1 = cy + rand(-12, 12);
      if (snap) { d.x = d.x1; d.y = d.y1; }
    });
  }
  get notional() { return this.roundFree ? this.bet : this.roundBet; }
  get pot() { return Math.floor(this.notional * this.mult); }

  startRound() {
    if (!this.takeBet()) return;
    this.streak = 0; this.mult = 1; this.multShown = 1; this.guess = null; this.history.length = 0; this.verdict = null;
    this.roll(true);
  }
  onAgain() { this.startRound(); }

  roll(first = false) {
    this.first = first;
    this.phase = 'rolling'; this.rolling = true; this.rollT = 0;
    const vals = this.forceVals ?? [randi(1, 6), randi(1, 6), randi(1, 6)];
    this.forceVals = null;
    const cx = this.vw / 2;
    this.layoutDice(false);
    this.dice.forEach((d, i) => {
      d.v = vals[i];
      d.x0 = cx + 300 + i * 30; d.y0 = 150 + i * 40 + rand(-20, 20);
      d.dur = 1.0 + i * 0.12 + rand(0, 0.1);
      d.t = -i * 0.07;
      d.qF = dieRestQ(d.v, rand(-0.5, 0.5), 0.5);
      d.th0 = rand(9, 14) * (Math.random() < 0.5 ? 1 : -1);
      const a = rand(-0.5, 0.5);
      d.ax = [Math.sin(a) * 0.4, 1, 0.3 + rand(-0.2, 0.2)];
      d.ax2 = [rand(-1, 1), rand(-1, 1), 1];
      d.th2 = rand(-3, 3);
      d.bounces = 0; d.landed = false; d.hot = 0;
    });
    audio.sfx('dice');
  }
  get sum() { return this.dice[0].v + this.dice[1].v + this.dice[2].v; }
  get triple() { return this.dice[0].v === this.dice[1].v && this.dice[1].v === this.dice[2].v; }

  choose(g) {
    if (this.phase !== 'guess') return;
    if (g === 'hi' && pHigher(this.cur) <= 0) return;
    if (g === 'lo' && pLower(this.cur) <= 0) return;
    this.guess = g;
    audio.sfx('menu_ok');
    this.roll(false);
  }
  cashOut() {
    if (this.phase !== 'guess' || this.streak < 1) return;
    const payout = this.pot;
    const mult = this.mult;
    this.phase = 'done';
    record(this.st, 'diceStreak', this.streak); record(this.st, 'diceMult', Math.round(mult * 10) / 10);
    this.settle({ win: true, payout, tier: mult >= 5 ? 'big' : 'win', title: mult >= 5 ? '대박 수확!' : '거두기 성공!', sub: `${this.streak}연승 · 배당 ×${mult.toFixed(2)}`, cy: 232, delay: 0.3 });
  }

  resolve() {
    const s = this.sum, prev = this.cur;
    this.sumPop = 1;
    if (this.first) {
      this.cur = s; this.history.push({ s, r: 0 });
      this.phase = 'guess';
      this.verdict = { txt: this.triple ? '시작부터 트리플!' : '첫 굴림', col: '#e8dcc8' }; this.verdictT = 0;
      return;
    }
    const g = this.guess;
    if (g === 'triple') {
      if (this.triple) {
        this.mult *= TRIPLE_MULT; this.streak++;
        this.history.push({ s, r: 1 });
        this.dice.forEach((d) => (d.hot = 1));
        this.verdict = { txt: '트리플 적중!!', col: '#ffe070' }; this.verdictT = 0;
        this.phase = 'done';
        record(this.st, 'diceStreak', this.streak); record(this.st, 'diceMult', Math.round(this.mult * 10) / 10);
        this.settle({ win: true, payout: this.pot, tier: 'jackpot', title: '트리플 잭팟!!', sub: `${this.dice[0].v} · ${this.dice[1].v} · ${this.dice[2].v} — 배당 ×${this.mult.toFixed(1)}`, cy: 232, delay: 0.9 });
      } else this.bust(s, '트리플이 아니네요…');
      return;
    }
    if (s === prev) {
      this.history.push({ s, r: 0 });
      this.verdict = { txt: '같은 합 — 무승부!', col: '#e8dcc8' }; this.verdictT = 0;
      this.phase = 'guess';
      audio.sfx('menu_move');
      return;
    }
    const ok = (g === 'hi' && s > prev) || (g === 'lo' && s < prev);
    if (!ok) { this.bust(s, g === 'hi' ? '낮았어요…' : '높았어요…'); return; }
    const m = multOf(g === 'hi' ? pHigher(prev) : pLower(prev));
    this.mult *= m; this.streak++;
    this.cur = s; this.history.push({ s, r: 1 });
    this.verdict = { txt: `적중! ×${m.toFixed(2)}`, col: '#9af09a' }; this.verdictT = 0;
    audio.sfx('combo', { pitch: 1 + this.streak * 0.08 });
    this.fx.burst('gold', this.vw / 2, 232, 14 + this.streak * 3, { speed: 240 });
    this.fx.text(this.vw / 2, 190, `${this.streak}연승!`, { color: '#ffe070', size: 26, crit: this.streak >= 3 });
    if (this.triple) this.dice.forEach((d) => (d.hot = 0.6));
    if (this.streak >= MAX_STREAK) { this.phase = 'guess'; this.cashOut(); return; }
    this.phase = 'guess';
  }
  bust(s, msg) {
    this.history.push({ s, r: -1 });
    this.cur = s;
    this.verdict = { txt: msg, col: '#ff7a7a' }; this.verdictT = 0;
    this.phase = 'done';
    this.shake(6, 0.3);
    this.fx.burst('blood', this.vw / 2, 232, 18, { speed: 260 });
    this.settle({ win: false, tier: 'lose', title: '빗나감…', sub: this.streak ? `${this.streak}연승에서 멈췄어요 (배당 ×${this.mult.toFixed(2)})` : msg, cy: 232, delay: 0.8 });
  }

  step(dt, tap) {
    this.verdictT += dt;
    this.sumPop = Math.max(0, this.sumPop - dt * 3);
    this.multShown += (this.mult - this.multShown) * Math.min(1, dt * 6);
    for (const d of this.dice) d.hot = Math.max(this.phase === 'done' && this.triple ? d.hot : 0, d.hot - dt * 0.8);
    if (this.phase === 'ready') {
      if (tap === 'roll' || input.pressed('confirm') || input.pressed('attack')) this.startRound();
      return;
    }
    if (this.phase === 'rolling') { this.stepRoll(dt); return; }
    if (this.phase === 'guess') {
      if (tap === 'lo' || input.pressed('left')) this.choose('lo');
      else if (tap === 'hi' || input.pressed('right')) this.choose('hi');
      else if (tap === 'triple' || input.pressed('up')) this.choose('triple');
      else if (tap === 'cash' || input.pressed('down') || input.pressed('dash')) this.cashOut();
    }
  }
  stepRoll(dt) {
    this.rollT += dt;
    let all = true;
    for (const d of this.dice) {
      d.t += dt;
      const u = clamp(d.t / d.dur, 0, 1);
      if (d.t < 0) { all = false; continue; }
      // 위치: 감속 이동 + 감쇠 바운스
      const e = ease.outCubic(u);
      d.x = lerp(d.x0, d.x1, e);
      const bounceN = 3.2;
      const hgt = 90 * Math.pow(1 - u, 1.6) * Math.abs(Math.sin(u * Math.PI * bounceN));
      d.y = lerp(d.y0, d.y1, Math.min(1, u * 1.6)) - hgt;
      d.h = hgt;
      const b = Math.floor(u * bounceN);
      if (b > d.bounces && u < 0.98) { d.bounces = b; audio.sfx('dice', { vol: 0.6 * (1 - u), pitch: 1 + rand(-0.1, 0.2) }); this.fx.burst('dust', d.x, d.y1 + 26, 3, { speed: 40 }); }
      // 회전: 최종 자세에 굴러 들어가며 수렴
      const th = d.th0 * Math.pow(1 - u, 2.2), th2 = d.th2 * Math.pow(1 - u, 2);
      d.q = Q.mul(Q.axis(d.ax[0], d.ax[1], d.ax[2], th), Q.mul(Q.axis(d.ax2[0], d.ax2[1], d.ax2[2], th2), d.qF));
      if (u < 1) all = false;
      else if (!d.landed) { d.landed = true; d.h = 0; this.shake(1.5, 0.08); }
    }
    if (all && this.rollT > 0.2) { this.rolling = false; this.resolve(); }
  }

  // ── 그리기 ──
  draw(ctx) {
    const vw = this.vw, vh = this.vh, t = this.clock;
    innBackdrop(ctx, vw, vh, t, 0.66);
    // 트레이
    const tw = Math.min(540, vw - 420), tx = vw / 2 - tw / 2, ty = 124, th = 200;
    feltTable(ctx, tx, ty, tw, th, { felt: '#34184a', felt2: '#0e0618', r: 44 });
    ctx.save(); rr(ctx, tx, ty, tw, th, 44); ctx.clip();
    text(ctx, '해골 주사위', vw / 2, ty + th - 18, { size: 26, align: 'center', weight: 800, family: FONT.title, color: 'rgba(232,200,114,0.12)', ow: 0 });
    ctx.restore();
    candle(ctx, tx - 26, ty + th + 6, 30, t, 1);
    candle(ctx, tx + tw + 26, ty + th + 6, 36, t, 2);
    // 그림자 → 주사위 (y순)
    for (const d of this.dice) {
      const hh = d.h ?? 0;
      ctx.fillStyle = `rgba(0,0,0,${0.45 - Math.min(0.3, hh / 300)})`;
      ctx.beginPath(); ctx.ellipse(d.x + 6 + hh * 0.2, d.y + hh + 30, 34 - hh * 0.08, 10, 0, 0, TAU); ctx.fill();
    }
    const order = [...this.dice].sort((a, b) => a.y - b.y);
    for (const d of order) drawDie(ctx, d.x, d.y, 62, d.q, { glow: '#ffd060', hot: d.hot });
    if (this.phase === 'done' && this.triple && this.guess === 'triple') for (const d of this.dice) glow(ctx, d.x, d.y, 70, '#ffd060', 0.25 + 0.1 * Math.sin(t * 8));
    this.drawSum(ctx, vw / 2, ty + th + 40);
    this.drawStreak(ctx, 16, 118, 188, 212);
    this.drawHistory(ctx, vw - 204, 118, 188, 212);
    if (this.phase === 'ready') this.drawReadyUI(ctx);
    else this.drawGuessUI(ctx);
  }
  drawSum(ctx, cx, y) {
    const rolling = this.phase === 'rolling';
    const s = rolling ? (this.first ? '?' : this.cur) : this.phase === 'ready' ? '—' : this.dice.every((d) => d.landed) ? this.sum : '?';
    const k = 1 + this.sumPop * 0.35;
    gPanel(ctx, cx - 92, y - 30, 184, 52, { a: 0.85, r: 26, orn: false });
    text(ctx, rolling && !this.first ? '기준' : '합계', cx - 58, y + 3, { size: 13, align: 'center', weight: 800, color: '#b8a080', ow: 2 });
    ctx.save(); ctx.translate(cx + 16, y + 12); ctx.scale(k, k);
    goldText(ctx, String(s), 0, 0, 38, { family: FONT.num, weight: 900, glowCol: this.sumPop > 0 ? '#ffd060' : null });
    ctx.restore();
    if (this.verdict && this.phase !== 'ready') {
      const a = clamp(1 - (this.verdictT - 1.6) / 0.4, 0, 1) * clamp(this.verdictT / 0.1, 0, 1);
      if (a > 0) {
        ctx.globalAlpha = a;
        const kk = ease.outBack(clamp(this.verdictT / 0.25, 0, 1));
        ctx.save(); ctx.translate(cx, y - 48); ctx.scale(kk, kk);
        text(ctx, this.verdict.txt, 0, 0, { size: 22, align: 'center', weight: 900, color: this.verdict.col, ow: 5 });
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }
  drawStreak(ctx, x, y, w, h) {
    gPanel(ctx, x, y, w, h, { a: 0.82 });
    const t = this.clock;
    text(ctx, '연승', x + w / 2, y + 30, { size: 14, align: 'center', weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    const s = this.streak;
    if (s > 0) {
      for (let i = 0; i < Math.min(8, 3 + s * 2); i++) {
        const u = (t * 1.3 + i / 7) % 1;
        glow(ctx, x + w / 2 + Math.sin(i * 2.3 + t * 3) * 22 * (1 - u), y + 92 - u * 44, 16 * (1 - u) + 4, s >= 4 ? '#ffb040' : '#ff5a2a', 0.5 * (1 - u));
      }
    }
    goldText(ctx, String(s), x + w / 2, y + 90, 50, { family: FONT.num, weight: 900, glowCol: s ? '#ff7a2a' : null });
    // 배당 게이지
    for (let i = 0; i < MAX_STREAK; i++) {
      const bx = x + 18 + i * ((w - 36) / MAX_STREAK);
      ctx.fillStyle = i < s ? (i >= 5 ? '#ffd060' : '#ff6a3a') : 'rgba(255,255,255,0.1)';
      rr(ctx, bx, y + 108, (w - 36) / MAX_STREAK - 3, 8, 3); ctx.fill();
    }
    text(ctx, '현재 배당', x + 16, y + 142, { size: 12, weight: 700, color: '#b8a080', ow: 2 });
    text(ctx, `×${this.multShown.toFixed(2)}`, x + w - 16, y + 143, { size: 18, align: 'right', weight: 900, family: FONT.num, color: '#ffe7a0', ow: 3 });
    text(ctx, this.roundFree ? '거둘 금액(무료)' : '거둘 금액', x + 16, y + 172, { size: 12, weight: 700, color: '#b8a080', ow: 2 });
    const pot = this.phase === 'ready' ? 0 : this.streak ? this.pot : 0;
    text(ctx, `${fmt(pot)} G`, x + w - 16, y + 174, { size: 18, align: 'right', weight: 900, family: FONT.num, color: pot ? '#9af09a' : '#7a6a5a', ow: 3 });
    text(ctx, `최대 ${MAX_STREAK}연승`, x + w / 2, y + h - 12, { size: 11, align: 'center', weight: 600, color: '#7a6a5a', ow: 2 });
  }
  drawHistory(ctx, x, y, w, h) {
    gPanel(ctx, x, y, w, h, { a: 0.82 });
    text(ctx, '굴림 기록', x + w / 2, y + 30, { size: 14, align: 'center', weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    const H = this.history.slice(-6);
    if (!H.length) text(ctx, '아직 없음', x + w / 2, y + 110, { size: 13, align: 'center', weight: 600, color: '#7a6a5a', ow: 2 });
    H.forEach((e, i) => {
      const yy = y + 50 + i * 26;
      const last = i === H.length - 1;
      ctx.fillStyle = last ? 'rgba(232,200,114,0.14)' : 'rgba(0,0,0,0.25)';
      rr(ctx, x + 14, yy, w - 28, 22, 6); ctx.fill();
      text(ctx, String(e.s), x + 40, yy + 17, { size: 16, align: 'center', weight: 900, family: FONT.num, color: '#efe4cf', ow: 2 });
      const tag = e.r > 0 ? '적중' : e.r < 0 ? '실패' : '—';
      text(ctx, tag, x + w - 26, yy + 16, { size: 12, align: 'right', weight: 800, color: e.r > 0 ? '#9af09a' : e.r < 0 ? '#ff7a7a' : '#9d8f80', ow: 2 });
    });
  }
  drawReadyUI(ctx) {
    const vw = this.vw;
    gPanel(ctx, vw / 2 - 260, 392, 520, 138, { a: 0.8, r: 14 });
    this.drawBetBar(ctx, vw / 2, 434, { r: 23 });
    const r = this.hits.rect('roll', vw / 2 - 110, 468, 220, 52);
    const can = this.free || this.st.gold >= this.bet;
    this.hits.add('roll', r, !can);
    drawBtn(ctx, r, '주사위 굴리기!', { tone: 'crimson', size: 19, hot: this.hits.over(r), pressed: this.hits.pressed(r), key: 'Z', disabled: !can, pulse: can, t: this.clock });
  }
  drawGuessUI(ctx) {
    const vw = this.vw, g = this.phase === 'guess';
    const s = this.cur;
    const ph = pHigher(s), pl = pLower(s);
    const bw = Math.min(200, (vw - 120) / 3), bh = 58, gap = 14, y = 406;
    const x0 = vw / 2 - (bw * 3 + gap * 2) / 2;
    const defs = [
      ['lo', '▼ 낮게', !g ? '' : pl > 0 ? `×${multOf(pl).toFixed(2)} · ${Math.round(pl * 100)}%` : '불가', 'blue', '←', pl <= 0],
      ['triple', '★ 트리플', `×${TRIPLE_MULT} · 3%`, 'gold', '↑', false],
      ['hi', '▲ 높게', !g ? '' : ph > 0 ? `×${multOf(ph).toFixed(2)} · ${Math.round(ph * 100)}%` : '불가', 'crimson', '→', ph <= 0],
    ];
    defs.forEach(([id, lb, sub, tone, key, dis], i) => {
      const r = this.hits.rect(id, x0 + i * (bw + gap), y, bw, bh);
      const disabled = !g || dis;
      this.hits.add(id, r, disabled);
      drawBtn(ctx, r, lb, { tone, size: 19, sub, key, hot: g && this.hits.over(r), pressed: this.hits.pressed(r), disabled, pulse: g && this.guess === id && false });
    });
    const canCash = g && this.streak > 0;
    const cr = this.hits.rect('cash', vw / 2 - 150, 476, 300, 50);
    this.hits.add('cash', cr, !canCash);
    drawBtn(ctx, cr, canCash ? `거두기  ${fmt(this.pot)} G` : '거두기', { tone: 'teal', size: 18, key: '↓', hot: canCash && this.hits.over(cr), pressed: this.hits.pressed(cr), disabled: !canCash, pulse: canCash && this.streak >= 3, t: this.clock });
    if (g && !input.touchMode) text(ctx, `다음 합이 ${s}보다 높을까, 낮을까?`, vw / 2, 397, { size: 13, align: 'center', weight: 700, color: '#e8d8b0', ow: 3 });
  }
}
