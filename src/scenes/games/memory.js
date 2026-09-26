// 영혼의 카드 — 16장(8쌍) 짝 맞추기. 시작 때 잠깐 모든 카드를 보여 준 뒤 뒤집는다.
// 제한 75초. 빨리 끝낼수록 배당↑ (25초 ×4 · 35초 ×3 · 50초 ×2 · 75초 ×1.2). 완벽(25초 이내 또는 10수 이내) → 주문서 확률.
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { text, FONT } from '../../core/ui.js';
import { clamp, lerp, rand, ease, TAU } from '../../core/math.js';
import { drawIcon } from '../../render/icons.js';
import { MiniGame, innBackdrop, feltTable, drawBtn, gPanel, goldText, record, candle, GOLD } from './common.js';
import { drawCard, glow, rr } from './art.js';

const SOULS = [
  { icon: 'relic_1', col: '#ff4a5a' }, { icon: 'relic_2', col: '#ffd060' }, { icon: 'relic_3', col: '#ff9a3a' }, { icon: 'relic_4', col: '#c070ff' },
  { icon: 'gem_crystal', col: '#8ae8ff' }, { icon: 'sub_cross', col: '#fff2b0' }, { icon: 'sub_holywater', col: '#6aa8ff' }, { icon: 'sub_stopwatch', col: '#8affc8' },
];
const LIMIT = 75;
const TIERS = [
  { r: 'S', t: 25, m: 4, c: '#ffe070' }, { r: 'A', t: 35, m: 3, c: '#ffa640' },
  { r: 'B', t: 50, m: 2, c: '#5aa8ff' }, { r: 'C', t: 75, m: 1.2, c: '#7ee07e' },
];
const CW = 76, CH = 100, GAP = 10;

export class MemoryScene extends MiniGame {
  constructor(g) { super(g, 'memory'); }
  init() {
    this.cards = [];
    this.deal(false);
    this.cursor = 0;
    this.open = []; this.closeT = 0;
    this.moves = 0; this.pairs = 0; this.combo = 0; this.bestCombo = 0;
    this.time = 0; this.peekT = 0;
    this.msg = null; this.msgT = 9;
  }
  onAgain() { this.startRound(); }
  get gx() { return this.vw / 2 - (CW * 4 + GAP * 3) / 2; }
  get gy() { return 92; }
  cardXY(i) { const c = i % 4, r = Math.floor(i / 4); return { x: this.gx + c * (CW + GAP) + CW / 2, y: this.gy + r * (CH + GAP) + CH / 2 }; }

  deal(shuffle = true) {
    const ids = [];
    for (let i = 0; i < 8; i++) ids.push(i, i);
    if (shuffle) for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    this.cards = ids.map((s, i) => ({ s, i, up: false, flip: 0, done: false, doneT: 0, shake: 0, fly: shuffle ? 0 : 1, delay: i * 0.035, pop: 0 }));
  }
  startRound() {
    if (!this.takeBet()) return;
    this.deal(true);
    this.open = []; this.moves = 0; this.pairs = 0; this.combo = 0; this.bestCombo = 0; this.time = 0;
    this.phase = 'deal'; this.peekT = 0;
    audio.sfx('card');
  }
  flipCard(i) {
    const c = this.cards[i];
    if (!c || c.up || c.done) return;
    if (this.open.length >= 2) this.closeOpen();
    c.up = true; c.pop = 1;
    audio.sfx('card', { pitch: rand(1, 1.15) });
    this.open.push(i);
    if (this.open.length === 2) {
      this.moves++;
      const [a, b] = this.open.map((k) => this.cards[k]);
      if (a.s === b.s) {
        a.done = b.done = true; a.doneT = b.doneT = 0;
        this.open = [];
        this.pairs++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
        const soul = SOULS[a.s];
        for (const k of [a.i, b.i]) {
          const p = this.cardXY(k);
          this.fx.burst('soul', p.x, p.y, 12, { speed: 90, color: soul.col });
          this.fx.ring(p.x, p.y, { color: soul.col, r0: 10, r1: 70, life: 0.4, width: 4 });
        }
        audio.sfx('holy', { vol: 0.7, pitch: 1 + this.combo * 0.06 });
        if (this.combo >= 2) { const p = this.cardXY(b.i); this.fx.text(p.x, p.y - 40, `${this.combo} 콤보!`, { color: '#ffe070', size: 20, crit: this.combo >= 3 }); }
        if (this.pairs >= 8) this.finish(true);
      } else {
        this.combo = 0;
        this.closeT = 0.7;
        a.shake = b.shake = 1;
        audio.sfx('menu_cancel', { vol: 0.6 });
      }
    }
  }
  closeOpen() {
    for (const k of this.open) this.cards[k].up = false;
    this.open = []; this.closeT = 0;
  }
  finish(win) {
    this.phase = 'done';
    const t = this.time;
    const tier = TIERS.find((x) => t <= x.t);
    if (!win || !tier) {
      for (const c of this.cards) c.up = true;
      this.settle({ win: false, tier: 'lose', title: '시간 초과…', sub: `${this.pairs}/8쌍 · ${this.moves}수`, delay: 0.8 });
      return;
    }
    const perfect = tier.r === 'S' || this.moves <= 10;
    record(this.st, 'memTime', Math.round(t * 10) / 10, 'min');
    record(this.st, 'memMoves', this.moves, 'min');
    const notional = this.roundFree ? this.bet : this.roundBet;
    this.settle({ win: true, payout: notional * tier.m, tier: tier.r === 'S' ? 'big' : 'win', perfect, title: perfect ? `완벽한 기억! ${tier.r}` : `${tier.r} 랭크 클리어!`, sub: `${t.toFixed(1)}초 · ${this.moves}수 · 배당 ×${tier.m}`, delay: 0.9 });
  }

  animate(dt) {
    this.msgT += dt;
    for (const c of this.cards) {
      c.flip = c.up ? Math.min(1, c.flip + dt / 0.16) : Math.max(0, c.flip - dt / 0.16);
      c.shake = Math.max(0, c.shake - dt * 2.2);
      c.pop = Math.max(0, c.pop - dt * 4);
      if (c.done) c.doneT += dt;
    }
  }
  step(dt, tap) {
    if (this.phase === 'ready') {
      if (tap === 'start' || input.pressed('confirm')) this.startRound();
      return;
    }
    if (this.phase === 'deal') {
      this.peekT += dt;
      for (const c of this.cards) if (this.peekT > c.delay) c.fly = Math.min(1, c.fly + dt / 0.35);
      if (this.peekT > 0.9 && !this.peeked) { this.peeked = true; for (const c of this.cards) c.up = true; this.msg = '기억하세요!'; this.msgT = 0; audio.sfx('magic'); }
      if (this.peekT > 2.5) {
        this.peeked = false;
        for (const c of this.cards) c.up = false;
        this.phase = 'play'; this.msg = '시작!'; this.msgT = 0;
        audio.sfx('go', { vol: 0.7 });
      }
      return;
    }
    if (this.phase === 'play') {
      this.time += dt;
      if (this.closeT > 0) { this.closeT -= dt; if (this.closeT <= 0) this.closeOpen(); }
      if (this.time >= LIMIT) { this.time = LIMIT; this.finish(false); return; }
      if (tap && tap.startsWith('card:')) { const i = +tap.slice(5); this.cursor = i; this.flipCard(i); }
      const mv = (d) => { this.cursor = (this.cursor + d + 16) % 16; audio.sfx('menu_move', { vol: 0.4 }); };
      if (input.pressed('left')) mv(-1);
      if (input.pressed('right')) mv(1);
      if (input.pressed('up')) mv(-4);
      if (input.pressed('down')) mv(4);
      if (input.pressed('confirm') || input.pressed('attack')) { this.keyUsed = true; this.flipCard(this.cursor); }
      const left = LIMIT - this.time;
      if (left < 10 && Math.floor(left) !== Math.floor(left + dt)) audio.sfx('clock_tick', { vol: 0.6 });
    }
  }

  // ── 그리기 ──
  draw(ctx) {
    const vw = this.vw, vh = this.vh, t = this.clock;
    innBackdrop(ctx, vw, vh, t, 0.7);
    const gw = CW * 4 + GAP * 3, gh = CH * 4 + GAP * 3;
    feltTable(ctx, this.gx - 14, this.gy - 12, gw + 28, gh + 24, { felt: '#1a2440', felt2: '#070a16', r: 18 });
    candle(ctx, this.gx - 44, this.gy + gh + 4, 34, t, 1);
    candle(ctx, this.gx + gw + 44, this.gy + gh + 4, 30, t, 2);
    const cx = vw / 2, cy = this.gy + gh / 2;
    this.cards.forEach((c, i) => {
      const P = this.cardXY(i);
      const e = ease.outBack(clamp(c.fly, 0, 1));
      let x = lerp(cx, P.x, e), y = lerp(cy, P.y, e);
      if (c.shake > 0) x += Math.sin(c.shake * 40) * 5 * c.shake;
      const sx = Math.abs(Math.cos(c.flip * Math.PI));
      const face = c.flip >= 0.5;
      const sc = 1 + c.pop * 0.08 + (c.done ? 0.04 * Math.max(0, 1 - c.doneT * 2) : 0);
      const cur = this.phase === 'play' && i === this.cursor && (this.keyUsed || !input.touchMode);
      const hit = this.hits.rect('card:' + i, P.x - CW / 2, P.y - CH / 2, CW, CH);
      this.hits.add('card:' + i, hit, this.phase !== 'play');
      const hov = this.phase === 'play' && this.hits.over(hit) && !c.up && !c.done;
      ctx.save();
      ctx.translate(x, y - (hov ? 4 : 0)); ctx.scale(Math.max(0.04, sx) * sc, sc);
      if (face) this.drawFace(ctx, c, t);
      else drawCard(ctx, null, 0, 0, CW, CH, { back: true, style: 'soul', t: t + i * 0.3, glow: '#ffe7a0', hl: cur ? 0.9 : hov ? 0.5 : 0 });
      ctx.restore();
      if (cur) { ctx.strokeStyle = '#ffe7a0'; ctx.lineWidth = 2.5; rr(ctx, P.x - CW / 2 - 4, P.y - CH / 2 - 4, CW + 8, CH + 8, 10); ctx.stroke(); }
    });
    this.drawLeft(ctx);
    this.drawRight(ctx);
    if (this.msg && this.msgT < 1.2) {
      const k = ease.outBack(clamp(this.msgT / 0.25, 0, 1)) * clamp((1.2 - this.msgT) / 0.3, 0, 1);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k);
      goldText(ctx, this.msg, 0, 16, 48, { glowCol: '#6a8aff' });
      ctx.restore();
    }
    if (this.phase === 'ready') this.drawReadyUI(ctx);
  }
  drawFace(ctx, c, t) {
    const soul = SOULS[c.s], w = CW, h = CH;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; rr(ctx, -w / 2 + 3, -h / 2 + 5, w, h, 8); ctx.fill();
    if (c.done) { ctx.save(); ctx.shadowColor = soul.col; ctx.shadowBlur = 14; rr(ctx, -w / 2, -h / 2, w, h, 8); ctx.fillStyle = soul.col; ctx.fill(); ctx.restore(); }
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#2a2044'); g.addColorStop(1, '#0c0818');
    rr(ctx, -w / 2, -h / 2, w, h, 8); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = c.done ? soul.col : '#c8a050'; ctx.stroke();
    rr(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 5); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(232,200,114,0.3)'; ctx.stroke();
    // 영혼의 빛 + 유물
    glow(ctx, 0, -2, 46, soul.col, 0.45 + 0.15 * Math.sin(t * 3 + c.i));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = soul.col; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, -2, 27, 0, TAU); ctx.stroke();
    ctx.restore();
    drawIcon(ctx, soul.icon, 0, -2, 50);
    // 모서리 룬
    ctx.fillStyle = soul.col; ctx.globalAlpha = 0.7;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(sx * (w / 2 - 11), sy * (h / 2 - 11), 2.5, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (c.done) { ctx.globalAlpha = 0.25 * Math.max(0, 1 - c.doneT); ctx.fillStyle = '#fff'; rr(ctx, -w / 2, -h / 2, w, h, 8); ctx.fill(); ctx.globalAlpha = 1; }
  }
  drawLeft(ctx) {
    const pw = clamp(this.gx - 70, 150, 230), x = this.gx - 40 - pw, y = 100, h = 300;
    if (x < 8) return;
    gPanel(ctx, x, y, pw, h, { a: 0.84 });
    const cx = x + pw / 2, t = this.clock;
    const left = this.phase === 'play' || this.phase === 'done' || this.phase === 'result' ? Math.max(0, LIMIT - this.time) : LIMIT;
    const k = left / LIMIT;
    const col = k > 0.5 ? '#7ee07e' : k > 0.2 ? '#ffd060' : '#ff5a5a';
    const rcy = y + 84;
    ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(cx, rcy, 50, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, rcy, 50, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
    ctx.lineCap = 'butt';
    if (k < 0.2 && this.phase === 'play') glow(ctx, cx, rcy, 80, '#ff3040', 0.3 + 0.2 * Math.sin(t * 10));
    goldText(ctx, left.toFixed(left < 10 ? 1 : 0), cx, rcy + 12, 34, { family: FONT.num, weight: 900 });
    text(ctx, '남은 시간', cx, rcy - 22, { size: 11, align: 'center', weight: 700, color: '#b8a080', ow: 2 });
    const rows = [['경과', `${this.time.toFixed(1)}초`], ['시도', `${this.moves}수`], ['찾은 짝', `${this.pairs} / 8`], ['콤보', `${this.combo}`]];
    rows.forEach(([a, b], i) => {
      const yy = y + 168 + i * 30;
      text(ctx, a, x + 18, yy, { size: 13, weight: 700, color: '#b8a080', ow: 2 });
      text(ctx, b, x + pw - 18, yy, { size: 16, align: 'right', weight: 900, family: FONT.num, color: '#efe4cf', ow: 2 });
    });
  }
  drawRight(ctx) {
    const gw = CW * 4 + GAP * 3;
    const x = this.gx + gw + 40, pw = clamp(this.vw - x - 16, 150, 230), y = 100, h = 300;
    if (x + pw > this.vw - 4) return;
    gPanel(ctx, x, y, pw, h, { a: 0.84 });
    text(ctx, '보상 등급', x + pw / 2, y + 28, { size: 15, align: 'center', weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    const cur = this.phase === 'play' ? TIERS.find((q) => this.time <= q.t) : null;
    TIERS.forEach((q, i) => {
      const yy = y + 50 + i * 44;
      const on = cur === q;
      ctx.fillStyle = on ? 'rgba(232,200,114,0.16)' : 'rgba(0,0,0,0.25)'; rr(ctx, x + 12, yy, pw - 24, 38, 7); ctx.fill();
      if (on) { ctx.strokeStyle = q.c; ctx.lineWidth = 1.5; ctx.stroke(); }
      text(ctx, q.r, x + 32, yy + 28, { size: 24, align: 'center', weight: 900, family: FONT.logo, color: q.c, ow: 3 });
      text(ctx, `${q.t}초 이내`, x + 54, yy + 24, { size: 12.5, weight: 700, color: '#e8dcc8', ow: 2 });
      text(ctx, `×${q.m}`, x + pw - 22, yy + 25, { size: 16, align: 'right', weight: 900, family: FONT.num, color: '#ffe7a0', ow: 2 });
    });
    const b = this.st.innGames.best;
    text(ctx, b.memTime ? `최단 ${b.memTime}초 · 최소 ${b.memMoves}수` : '완벽(S 또는 10수 이내) 시 주문서 확률', x + pw / 2, y + h - 18, { size: 11, align: 'center', weight: 700, color: '#9ad0ff', ow: 2, maxWidth: pw - 16 });
  }
  drawReadyUI(ctx) {
    const vw = this.vw, gh = CH * 4 + GAP * 3;
    const w = 440, h = 150, x = vw / 2 - w / 2, y = this.gy + gh / 2 - h / 2 + 20;
    gPanel(ctx, x, y, w, h, { a: 0.92, glowCol: 'rgba(90,120,255,0.4)' });
    text(ctx, '짝을 모두 찾으면 승리! 시작할 때 잠깐 카드를 보여 줘요.', vw / 2, y + 26, { size: 12.5, align: 'center', weight: 700, color: '#c8d0ff', ow: 2 });
    this.drawBetBar(ctx, vw / 2, y + 72, { r: 21, label: false });
    const r = this.hits.rect('start', vw / 2 - 100, y + h - 50, 200, 42);
    const can = this.free || this.st.gold >= this.bet;
    this.hits.add('start', r, !can);
    drawBtn(ctx, r, '영혼 불러내기!', { tone: 'purple', size: 17, key: 'Z', disabled: !can, hot: this.hits.over(r), pressed: this.hits.pressed(r), pulse: can, t: this.clock });
  }
}
