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
const pct = (p) => (p < 0.01 ? (p * 100).toFixed(1) : Math.round(p * 100));

export class DiceScene extends MiniGame {
  constructor(g) { super(g, 'dice'); this._dopt = { glow: '#ffd060', hot: 0 }; }
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
    this._dcx = cx;
    this.dice.forEach((d, i) => {
      d.x1 = cx + (i - 1) * 108 + rand(-10, 10); d.y1 = cy + rand(-12, 12);
      if (snap) { d.x = d.x1; d.y = d.y1; }
    });
  }
  get notional() { return this.roundFree ? this.bet : this.roundBet; }
  get pot() { return Math.floor(this.notional * this.mult); }

  startRound() {
    // 판 정보는 판돈 차감 전에 비운다 — 금화가 모자라 시작하지 못해도 지난 판의 연승·배당·기록이 남지 않게
    this.streak = 0; this.mult = 1; this.multShown = 1; this.guess = null; this.history.length = 0; this.verdict = null; this.cur = 0;
    if (!this.takeBet()) return;
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
    this.settle({ win: true, payout, tier: mult >= 5 ? 'big' : 'win', title: mult >= 5 ? '대박 수확!' : '거두기 성공!', sub: `${this.streak}연승 · 배당 ×${mult.toFixed(2)}`, cy: this.stageY(232), delay: 0.3 });
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
        this.settle({ win: true, payout: this.pot, tier: 'jackpot', title: '트리플 잭팟!!', sub: `${this.dice[0].v} · ${this.dice[1].v} · ${this.dice[2].v} — 배당 ×${this.mult.toFixed(1)}`, cy: this.stageY(232), delay: 0.9 });
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
    this.fx.burst('gold', this.vw / 2, this.stageY(232), 14 + this.streak * 3, { speed: 240 });
    this.fx.text(this.vw / 2, this.stageY(190), `${this.streak}연승!`, { color: '#ffe070', size: 26, crit: this.streak >= 3 });
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
    this.fx.burst('blood', this.vw / 2, this.stageY(232), 18, { speed: 260 });
    this.settle({ win: false, tier: 'lose', title: '빗나감…', sub: this.streak ? `${this.streak}연승에서 멈췄어요 (배당 ×${this.mult.toFixed(2)})` : msg, cy: this.stageY(232), delay: 0.8 });
  }

  animate(dt) {
    this.verdictT += dt;
    this.sumPop = Math.max(0, this.sumPop - dt * 3);
    this.multShown += (this.mult - this.multShown) * Math.min(1, dt * 6);
    const keep = (this.phase === 'done' || this.phase === 'result') && this.triple && this.guess === 'triple';
    for (const d of this.dice) d.hot = keep ? d.hot : Math.max(0, d.hot - dt * 0.8);
  }
  step(dt, tap) {
    if (this.phase === 'ready') {
      if (tap === 'roll' || input.pressed('confirm')) this.startRound();
      return;
    }
    if (this.phase === 'rolling') { this.stepRoll(dt); return; }
    if (this.phase === 'guess') {
      // 메뉴 의미 입력만: ← 낮게 · → 높게 · ↑ 트리플 · ↓ / 보조(Y·A 키) 거두기 (패드 B 는 '그만두기')
      if (tap === 'lo' || input.pressed('left')) this.choose('lo');
      else if (tap === 'hi' || input.pressed('right')) this.choose('hi');
      else if (tap === 'triple' || input.pressed('up')) this.choose('triple');
      else if (tap === 'cash' || input.pressed('down') || input.pressed('alt')) this.cashOut();
    }
  }
  quitNote() {
    return this.phase === 'guess' && this.streak > 0 ? `먼저 '거두기'로 ${fmt(this.pot)} G를 챙길 수 있어요.` : null;
  }

  // ── 배치 (UI px) ──
  /** 화면 배치: 아래 조작 줄 · 가운데 쟁반(주사위, 배율 k) + 합계 · 양옆 연승/기록 패널 */
  lay() {
    const W = this.vw, H = this.vh;
    const bh = this.bh(58);
    const ctrlH = Math.max(96, bh + 34), ctrlTop = H - 8 - ctrlH;
    const top = 62, bot = ctrlTop - 8;
    const trayH = clamp(bot - top - 88, 96, 200), k = trayH / 200;
    const blockH = trayH + 26 + 60;
    const trayTop = top + 14 + Math.max(0, (bot - top - 14 - blockH) / 2);
    const sideW = clamp(Math.round(W * 0.2), 150, 188);
    const sideY = 96, sideH = Math.min(240, bot - sideY);
    const tw = Math.min(540 * k, W - 2 * (sideW + 16 + 26));
    return { W, H, bh, ctrlTop, ctrlH, top, bot, k, trayTop, trayH, trayCy: trayTop + trayH / 2, tw, sumY: trayTop + trayH + 26 + 30, sideW, sideY: sideY + Math.max(0, (bot - sideY - sideH) / 2), sideH };
  }
  get L() { return this._L ?? (this._L = this.lay()); }
  /** 화면 크기가 바뀌면 (창 크기·회전·UI 배율) 쟁반 가운데(vw/2)가 옮겨 가므로 주사위 좌표도 같이 옮긴다 */
  resize() {
    this._L = null;
    if (!this.dice || this._dcx === undefined) return;
    const dx = this.vw / 2 - this._dcx;
    if (!dx) return;
    for (const d of this.dice) { d.x += dx; d.x0 += dx; d.x1 += dx; }
    this._dcx += dx;
  }
  /** 쟁반 설계 좌표(가운데 x = vw/2, 쟁반 가운데 y = 224) → 화면 좌표 */
  P(x, y) { const L = this.L, cx = this.vw / 2; return { x: cx + (x - cx) * L.k, y: L.trayCy + (y - 224) * L.k }; }
  stageY(y) { const L = this.L; return L.trayCy + (y - 224) * L.k; }
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
      if (b > d.bounces && u < 0.98) { d.bounces = b; audio.sfx('dice', { vol: 0.6 * (1 - u), pitch: 1 + rand(-0.1, 0.2) }); const P = this.P(d.x, d.y1 + 26); this.fx.burst('dust', P.x, P.y, 3, { speed: 40 }); }
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
    const L = this._L = this.lay();
    innBackdrop(ctx, vw, vh, t, 0.66);
    // 트레이 (설계 좌표: 쟁반 y 124~324, 가운데 224 → 배율 L.k 로 화면에 맞춘다)
    ctx.save();
    ctx.translate(vw / 2, L.trayCy); ctx.scale(L.k, L.k); ctx.translate(-vw / 2, -224);
    const tw = L.tw / L.k, tx = vw / 2 - tw / 2, ty = 124, th = 200;
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
    const order = this._order ??= this.dice.slice();
    order.sort((a, b) => a.y - b.y);
    for (const d of order) { this._dopt.hot = d.hot; drawDie(ctx, d.x, d.y, 62, d.q, this._dopt); }
    if (this.phase === 'done' && this.triple && this.guess === 'triple') for (const d of this.dice) glow(ctx, d.x, d.y, 70, '#ffd060', 0.25 + 0.1 * Math.sin(t * 8));
    ctx.restore();
    this.drawSum(ctx, vw / 2, L.sumY);
    if (L.sideH >= 110) {
      this.drawStreak(ctx, 16, L.sideY, L.sideW, L.sideH);
      this.drawHistory(ctx, vw - 16 - L.sideW, L.sideY, L.sideW, L.sideH);
    }
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
    const t = this.clock, c = h < 190; // 좁은 화면: 줄 간격을 줄이고 꼬리말은 뺀다
    const Y = c ? { title: 24, num: 62, numS: 38, gauge: 72, mult: 100, pot: 126 } : { title: 30, num: 90, numS: 50, gauge: 108, mult: 142, pot: 172 };
    text(ctx, '연승', x + w / 2, y + Y.title, { size: 14, align: 'center', weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    const s = this.streak;
    if (s > 0) {
      for (let i = 0; i < Math.min(8, 3 + s * 2); i++) {
        const u = (t * 1.3 + i / 7) % 1;
        glow(ctx, x + w / 2 + Math.sin(i * 2.3 + t * 3) * 22 * (1 - u), y + Y.num + 2 - u * 44, 16 * (1 - u) + 4, s >= 4 ? '#ffb040' : '#ff5a2a', 0.5 * (1 - u));
      }
    }
    goldText(ctx, String(s), x + w / 2, y + Y.num, Y.numS, { family: FONT.num, weight: 900, glowCol: s ? '#ff7a2a' : null });
    // 배당 게이지
    for (let i = 0; i < MAX_STREAK; i++) {
      const bx = x + 18 + i * ((w - 36) / MAX_STREAK);
      ctx.fillStyle = i < s ? (i >= 5 ? '#ffd060' : '#ff6a3a') : 'rgba(255,255,255,0.1)';
      rr(ctx, bx, y + Y.gauge, (w - 36) / MAX_STREAK - 3, 8, 3); ctx.fill();
    }
    text(ctx, '현재 배당', x + 14, y + Y.mult, { size: 12, weight: 700, color: '#b8a080', ow: 2 });
    text(ctx, `×${this.multShown.toFixed(2)}`, x + w - 14, y + Y.mult + 1, { size: 18, align: 'right', weight: 900, family: FONT.num, color: '#ffe7a0', ow: 3 });
    text(ctx, this.roundFree ? '거둘 금액(무료)' : '거둘 금액', x + 14, y + Y.pot, { size: 12, weight: 700, color: '#b8a080', ow: 2 });
    const pot = this.phase === 'ready' ? 0 : this.streak ? this.pot : 0;
    text(ctx, `${fmt(pot)} G`, x + w - 14, y + Y.pot + 2, { size: 18, align: 'right', weight: 900, family: FONT.num, color: pot ? '#9af09a' : '#7a6a5a', ow: 3 });
    if (h >= Y.pot + 34) text(ctx, `최대 ${MAX_STREAK}연승`, x + w / 2, y + h - 12, { size: 11, align: 'center', weight: 600, color: '#7a6a5a', ow: 2 });
  }
  drawHistory(ctx, x, y, w, h) {
    gPanel(ctx, x, y, w, h, { a: 0.82 });
    const c = h < 190, top = c ? 40 : 50;
    text(ctx, '굴림 기록', x + w / 2, y + (c ? 24 : 30), { size: 14, align: 'center', weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    const n = clamp(Math.floor((h - top - 8) / 26), 1, 6);
    const H = this.history.slice(-n);
    if (!H.length) text(ctx, '아직 없음', x + w / 2, y + h / 2 + 10, { size: 13, align: 'center', weight: 600, color: '#7a6a5a', ow: 2 });
    H.forEach((e, i) => {
      const yy = y + top + i * 26;
      const last = i === H.length - 1;
      ctx.fillStyle = last ? 'rgba(232,200,114,0.14)' : 'rgba(0,0,0,0.25)';
      rr(ctx, x + 14, yy, w - 28, 22, 6); ctx.fill();
      text(ctx, String(e.s), x + 40, yy + 17, { size: 16, align: 'center', weight: 900, family: FONT.num, color: '#efe4cf', ow: 2 });
      const tag = e.r > 0 ? '적중' : e.r < 0 ? '실패' : '—';
      text(ctx, tag, x + w - 26, yy + 16, { size: 12, align: 'right', weight: 800, color: e.r > 0 ? '#9af09a' : e.r < 0 ? '#ff7a7a' : '#9d8f80', ow: 2 });
    });
  }
  /** 판돈 칩 + '굴리기' 버튼 한 줄 (아래 조작 줄) */
  drawReadyUI(ctx) {
    const vw = this.vw, L = this.L;
    const bw = 200;
    const chipsW = Math.min(this.betBarW(23), vw - 64 - bw - 24);
    const pw = chipsW + bw + 48, px = vw / 2 - pw / 2, py = L.ctrlTop, ph = L.ctrlH;
    gPanel(ctx, px, py, pw, ph, { a: 0.8, r: 14 });
    const cy = py + ph / 2 + 8;
    this.drawBetBar(ctx, px + 16 + chipsW / 2, cy, { r: 23, maxW: chipsW });
    const bh = Math.min(this.bh(52), ph - 16);
    const r = this.hits.rect('roll', px + pw - bw - 16, py + (ph - bh) / 2, bw, bh);
    const can = this.free || this.st.gold >= this.bet;
    this.hits.add('roll', r, !can);
    drawBtn(ctx, r, '주사위 굴리기!', { tone: 'crimson', size: 19, hot: this.hits.over(r), pressed: this.hits.pressed(r), key: 'confirm', disabled: !can, pulse: can, t: this.clock });
  }
  /** 낮게 · 트리플 · 높게 · 거두기 — 한 줄 (아래 조작 줄) */
  drawGuessUI(ctx) {
    const vw = this.vw, L = this.L, g = this.phase === 'guess';
    const s = this.cur;
    const ph = pHigher(s), pl = pLower(s);
    const gap = 12, bh = L.bh;
    const bw = Math.min(190, (vw - 32 - gap * 3) / 4);
    const x0 = vw / 2 - (bw * 4 + gap * 3) / 2, y = L.H - 8 - bh;
    const canCash = g && this.streak > 0;
    const defs = [
      ['lo', '▼ 낮게', !g ? '' : pl > 0 ? `×${multOf(pl).toFixed(2)} · ${pct(pl)}%` : '불가', 'blue', 'left', !g || pl <= 0],
      ['triple', '★ 트리플', `×${TRIPLE_MULT} · 3%`, 'gold', 'up', !g],
      ['hi', '▲ 높게', !g ? '' : ph > 0 ? `×${multOf(ph).toFixed(2)} · ${pct(ph)}%` : '불가', 'crimson', 'right', !g || ph <= 0],
      ['cash', '거두기', canCash ? `${fmt(this.pot)} G` : this.streak ? '' : '1승부터', 'teal', 'down', !canCash],
    ];
    defs.forEach(([id, lb, sub, tone, key, dis], i) => {
      const r = this.hits.rect(id, x0 + i * (bw + gap), y, bw, bh);
      this.hits.add(id, r, dis);
      drawBtn(ctx, r, lb, { tone, size: 18, sub, key, hot: !dis && this.hits.over(r), pressed: this.hits.pressed(r), disabled: dis, pulse: id === 'cash' && canCash && this.streak >= 3, t: this.clock });
    });
    if (g) text(ctx, `다음 합이 ${s}보다 높을까, 낮을까?`, vw / 2, y - 10, { size: 13, align: 'center', weight: 700, color: '#e8d8b0', ow: 3 });
  }
}
