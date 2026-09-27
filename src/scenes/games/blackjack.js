// 악마의 21 — 악마 딜러 '마몬'과 블랙잭. 히트/스탠드/더블, 딜러는 17(소프트 포함)에서 멈춤, 블랙잭 3:2.
// 카드는 슈에서 날아와 뒤집히며, 딜러는 표정(비웃음/광소/분노/경악)과 대사로 반응한다.
// 배치: 딜러·테이블·카드는 설계 좌표(높이 540)에 그려 배율 L.k 로 화면(UI px)에 맞추고, 합계 배지·대사·버튼은 배율 없이 그린다.
// 조작: 히트 = 결정(↑) · 스탠드 = 보조(↓, Y·A 키) · 더블 = 보조 2(→, LT·C 키). 취소(B·Esc)는 '그만두기' 확인 창.
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { text, FONT } from '../../core/ui.js';
import { clamp, lerp, rand, ease, fmt, TAU, pick } from '../../core/math.js';
import { MiniGame, innBackdrop, drawBtn, gPanel, bubble, candle, GOLD } from './common.js';
import { drawCard, drawChip, glow, rr, catHead } from './art.js';

const CW = 76, CH = 106;
const SAY = {
  deal: ['자, 운명을 걸어 보시지.', '영혼… 아니, 금화면 충분하다.', '카드는 거짓말을 하지 않지. 크크.'],
  pbust: ['크크크… 욕심이 과했군.', '22. 지옥의 숫자로군.', '버스트! 금화 잘 받겠다.'],
  dbust: ['크윽! 이럴 수가…', '…카드가 날 배신하다니.'],
  pbj: ['블…블랙잭이라고?!', '이, 인간 주제에…!'],
  dbj: ['딜러 블랙잭. 네 금화는 이제 내 것.', '에이스와 왕관. 완벽하지.'],
  pwin: ['…운이 좋군, 인간.', '흥, 이번만 봐주지.', '다음엔 네 영혼까지 걸어라.'],
  dwin: ['하하하! 지옥의 확률은 내 편이다.', '역시 하우스가 이기는 법.'],
  push: ['흥, 무승부인가.', '비겼군. 다시 붙어 보자.'],
  double: ['배짱 좋군. 딱 한 장이다.', '두 배라… 마음에 드는군.'],
  hit: ['한 장 더? 좋지.', '크크, 계속해 봐.'],
};

function handValue(cards) {
  let v = 0, aces = 0;
  for (const c of cards) { const r = c.rank; if (r === 0) { aces++; v += 11; } else v += Math.min(10, r + 1); }
  while (v > 21 && aces) { v -= 10; aces--; }
  return { v, soft: aces > 0 };
}
function newDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d.push({ rank: r, suit: s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

export class BlackjackScene extends MiniGame {
  constructor(g) { super(g, 'blackjack'); }
  init() {
    this.titleLeft = true;
    this.deck = newDeck();
    this.player = []; this.dealer = [];

    this.queue = []; this.qT = 0;
    this.mood = 'idle'; this.moodT = 0; this.talk = null; this.talkT = 0;
    this.blinkT = 2; this.dealFlick = 0;
    this.doubled = false;
    this.outcome = null;
    this.phase = 'ready';
  }
  onAgain() { this.startRound(); }
  get shoe() { return { x: this.vw / 2 + 262, y: 192 }; }
  say(kind) { this.talk = pick(SAY[kind]); this.talkT = 0; }
  setMood(m) { this.mood = m; this.moodT = 0; }

  startRound() {
    if (!this.takeBet()) return;
    if (this.deck.length < 20) this.deck = newDeck();
    this.player = []; this.dealer = []; this.queue = [];
    this.doubled = false; this.outcome = null;
    this.phase = 'dealing';
    this.setMood('idle'); this.say('deal');
    const T = this.forceDeal;
    this.forceDeal = null;
    const draw = (i) => (T ? T[i] : this.deck.pop());
    this.push('p', draw(0), true); this.push('d', draw(1), true); this.push('p', draw(2), true); this.push('d', draw(3), false);
    this.queue.push({ fn: () => this.afterDeal(), wait: 0.35 });
  }
  /** 카드 한 장 배분을 큐에 넣음 */
  push(who, card, up, wait = 0.24) {
    this.queue.push({ fn: () => this.deal(who, card, up), wait });
  }
  deal(who, card, up) {
    const hand = who === 'p' ? this.player : this.dealer;
    const c = { ...card, up, flip: up ? 1 : 0, fly: 0, who, idx: hand.length, rot0: rand(-0.6, -0.2) };
    hand.push(c);
    audio.sfx('card', { pitch: rand(0.95, 1.1) });
    this.dealFlick = 1;
  }
  cardPos(c) {
    const hand = c.who === 'p' ? this.player : this.dealer;
    const n = hand.length, sp = c.who === 'p' ? 58 : 52;
    const cx = this.vw / 2 + (c.idx - (n - 1) / 2) * sp;
    return { x: cx, y: c.who === 'p' ? 402 : 280, s: c.who === 'p' ? 1.06 : 0.96 };
  }
  afterDeal() {
    const p = handValue(this.player), up = this.dealer[0];
    const upTen = up.rank === 0 || up.rank >= 9;
    const dBJ = handValue(this.dealer).v === 21;
    if (upTen && dBJ) { this.reveal(); this.queue.push({ fn: () => this.finish(), wait: 0.6 }); return; }
    if (p.v === 21) { this.reveal(); this.queue.push({ fn: () => this.finish(), wait: 0.5 }); return; }
    this.phase = 'play';
  }
  reveal() {
    const hole = this.dealer[1];
    if (hole && !hole.up) { hole.up = true; audio.sfx('card', { pitch: 0.8 }); }
  }
  hit() {
    if (this.phase !== 'play') return;
    this.phase = 'busy';
    if (Math.random() < 0.3) this.say('hit');
    this.push('p', this.deck.pop(), true, 0.05);
    this.queue.push({ fn: () => this.afterHit(), wait: 0.35 });
  }
  afterHit() {
    const p = handValue(this.player);
    if (p.v > 21) { this.reveal(); this.queue.push({ fn: () => this.finish(), wait: 0.6 }); return; }
    if (this.doubled || p.v === 21) { this.stand(); return; }
    this.phase = 'play';
  }
  stand() {
    if (this.phase !== 'play' && this.phase !== 'busy') return;
    this.phase = 'dealer';
    this.queue.push({ fn: () => this.reveal(), wait: 0.25 });
    this.queue.push({ fn: () => this.dealerStep(), wait: 0.55 });
  }
  dealerStep() {
    const d = handValue(this.dealer);
    if (d.v < 17) {
      this.push('d', this.deck.pop(), true, 0.05);
      this.queue.push({ fn: () => this.dealerStep(), wait: 0.6 });
    } else this.queue.push({ fn: () => this.finish(), wait: 0.3 });
  }
  double() {
    if (this.phase !== 'play' || this.player.length !== 2) return;
    if (!this.takeExtra(this.roundBet || this.bet)) return;
    this.doubled = true;
    this.say('double'); this.setMood('grin');
    const D = this.P(this.vw / 2 - 230, 380);
    this.fx.text(D.x, D.y, '더블!', { color: '#ffd060', size: 24, crit: true });
    this.hit();
  }
  finish() {
    const p = handValue(this.player), d = handValue(this.dealer);
    const pBJ = p.v === 21 && this.player.length === 2 && !this.doubled;
    const dBJ = d.v === 21 && this.dealer.length === 2;
    const stake = this.roundBet;
    let res;
    if (p.v > 21) res = ['lose', 0, '버스트…', `${p.v} — 21을 넘었어요`, 'pbust', 'grin'];
    else if (pBJ && !dBJ) res = ['bj', stake * 2.5, '블랙잭!', '에이스와 그림 카드! 3:2 배당', 'pbj', 'shock'];
    else if (dBJ && !pBJ) res = ['lose', 0, '딜러 블랙잭…', '마몬의 에이스가 웃고 있어요', 'dbj', 'grin'];
    else if (d.v > 21) res = ['win', stake * 2, '딜러 버스트!', `딜러 ${d.v} — 당신의 승리`, 'dbust', 'angry'];
    else if (p.v > d.v) res = ['win', stake * 2, '승리!', `${p.v} 대 ${d.v}`, 'pwin', 'angry'];
    else if (p.v < d.v) res = ['lose', 0, '패배…', `${p.v} 대 ${d.v}`, 'dwin', 'grin'];
    else res = ['push', stake, '무승부', `${p.v} 대 ${d.v} — 판돈 반환`, 'push', 'idle'];
    const [kind, payout, title, sub, talk, mood] = res;
    this.say(talk); this.setMood(mood);
    this.outcome = kind;
    this.phase = 'done';
    const win = kind === 'win' || kind === 'bj';
    const b = this.st.innGames.best;
    if (win) b.bjWins = (b.bjWins ?? 0) + 1;
    if (kind === 'bj') b.bjBlackjacks = (b.bjBlackjacks ?? 0) + 1;
    if (win) { this.fx.burst('holy', this.vw / 2, this.P(0, 402).y, 26, { speed: 260 }); }
    if (kind === 'lose' && p.v > 21) this.shake(6, 0.3);
    this.settle({ win, payout, tier: kind === 'bj' ? 'big' : kind === 'push' ? 'push' : win ? 'win' : 'lose', title, sub: sub + (this.doubled ? ' · 더블' : ''), cy: this.P(0, 402).y, delay: 0.9 });
  }

  animate(dt) {
    this.moodT += dt; this.talkT += dt; this.dealFlick = Math.max(0, this.dealFlick - dt * 4);
    this.blinkT -= dt; if (this.blinkT < -0.14) this.blinkT = rand(2, 4.5);
    for (const h of [this.player, this.dealer]) for (const c of h) {
      c.fly = Math.min(1, c.fly + dt / 0.3);
      c.flip = c.up ? Math.min(1, c.flip + dt / 0.22) : Math.max(0, c.flip - dt / 0.22);
    }
  }
  step(dt, tap) {
    if (this.queue.length) {
      this.qT += dt;
      const q = this.queue[0];
      if (this.qT >= q.wait) { this.qT = 0; this.queue.shift(); q.fn(); }
    }
    if (this.phase === 'ready') {
      if (tap === 'deal' || input.pressed('confirm')) this.startRound();
      return;
    }
    if (this.phase === 'play') {
      // 메뉴 의미 입력만 (패드 B·X 키는 '그만두기'): 히트 = 결정/↑ · 스탠드 = 보조/↓ · 더블 = 보조 2/→
      if (tap === 'hit' || input.pressed('confirm') || input.pressed('up')) this.hit();
      else if (tap === 'stand' || input.pressed('alt') || input.pressed('down')) this.stand();
      else if (tap === 'double' || input.pressed('alt2') || input.pressed('right')) this.double();
    }
  }

  // ── 배치 (UI px) ──
  /** 딜러·테이블·카드 배율 k (설계 높이 540 → 아래 버튼 줄 위까지), 버튼 높이 */
  lay() {
    const W = this.vw, H = this.vh, bh = this.bh(54);
    const k = clamp((H - 8 - bh - 14) / 466, 0.62, 1);
    return { W, H, bh, k };
  }
  get L() { return this._L ?? (this._L = this.lay()); }
  /** 테이블 설계 좌표 → 화면 좌표 (가운데 x 기준 배율 k, 위쪽 기준) */
  P(x, y) { const k = this.L.k, cx = this.vw / 2; return { x: cx + (x - cx) * k, y: y * k }; }

  // ── 그리기 ──
  draw(ctx) {
    const vw = this.vw, vh = this.vh, t = this.clock;
    const L = this._L = this.lay(), k = L.k;
    innBackdrop(ctx, vw, vh, t, 0.72, 0.4);
    // 딜러·테이블·카드: 설계 좌표 (가운데 x 기준 배율 k)
    ctx.save();
    ctx.translate(vw / 2, 0); ctx.scale(k, k); ctx.translate(-vw / 2, 0);
    // 딜러 뒤 붉은 기운
    glow(ctx, vw / 2, 130, 220, '#a0102a', 0.35 + 0.08 * Math.sin(t * 2));
    if (this.mood === 'angry') glow(ctx, vw / 2, 120, 180, '#ff4a1a', 0.3 * clamp(1 - this.moodT / 2, 0, 1));
    drawDealer(ctx, vw / 2, 214, t, this.mood, this.moodT, this.blinkT < 0, this.dealFlick);
    this.drawTable(ctx);
    drawDealerHands(ctx, vw / 2, 214, t, this.dealFlick);
    // 카드
    const sh = this.shoe;
    for (let kk = 0; kk < 2; kk++) for (const c of kk ? this.player : this.dealer) {
      const P = this.cardPos(c);
      const e = ease.outCubic(c.fly);
      const x = lerp(sh.x, P.x, e), y = lerp(sh.y, P.y, e) - Math.sin(e * Math.PI) * 40;
      const rot = lerp(c.rot0, 0, e);
      const fk = c.flip; // 0 뒷면 → 1 앞면
      const sx = Math.abs(Math.cos(fk * Math.PI));
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(Math.max(0.04, sx) * P.s * lerp(0.7, 1, e), P.s * lerp(0.7, 1, e));
      const hl = this.phase === 'done' && c.who === 'p' && (this.outcome === 'win' || this.outcome === 'bj') ? 0.6 + 0.3 * Math.sin(t * 6) : 0;
      drawCard(ctx, fk >= 0.5 ? c : null, 0, 0, CW, CH, { back: fk < 0.5, glow: '#ffd060', hl, t });
      ctx.restore();
    }
    ctx.restore();
    // 합계 배지·대사 (배율 없이 — 좁은 화면에서도 글자가 작아지지 않게)
    this.drawTotals(ctx);
    if (this.talk && this.talkT < 3.2) {
      const a = clamp(this.talkT / 0.15, 0, 1) * clamp((3.2 - this.talkT) / 0.3, 0, 1);
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = `700 14px ${FONT.body}`;
      const w = Math.min(vw / 2 - 40, Math.max(150, ctx.measureText(this.talk).width + 28)), bx = vw / 2 + 78 * k, by = 72;
      bubble(ctx, bx, by, w, 34, 'left', bx - 16, by + 40);
      text(ctx, this.talk, bx + 14, by + 22, { size: 14, weight: 700, color: '#2a0a10', ow: 0, maxWidth: w - 24 });
      text(ctx, '마몬', bx + 10, by - 4, { size: 11, weight: 800, color: '#ff8a8a', ow: 3 });
      ctx.restore();
    }
    if (this.phase === 'ready') this.drawReadyUI(ctx);
    else this.drawPlayUI(ctx);
  }
  drawTable(ctx) {
    const vw = this.vw, vh = this.vh, t = this.clock, cx = vw / 2, k = this.L.k;
    // 배율 공간에서 화면 전체를 덮는 범위
    const xL = cx - vw / (2 * k), wD = vw / k, hD = vh / k;
    const top = 206;
    // 펠트
    const g = ctx.createRadialGradient(cx, 380, 40, cx, 400, wD * 0.7);
    g.addColorStop(0, '#7a0e22'); g.addColorStop(0.6, '#4a0614'); g.addColorStop(1, '#1a0206');
    ctx.fillStyle = g; ctx.fillRect(xL, top, wD, hD - top);
    ctx.save(); ctx.globalAlpha = 0.05; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = xL - hD; i < xL + wD; i += 9) { ctx.moveTo(i, top); ctx.lineTo(i + (hD - top), hD); }
    ctx.stroke(); ctx.restore();
    // 인쇄 문구
    ctx.save(); ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(232,200,114,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, 150, 330, 190, 0, 0.35, Math.PI - 0.35); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, 150, 346, 206, 0, 0.35, Math.PI - 0.35); ctx.stroke();
    text(ctx, '블랙잭 3 : 2 지급', cx + 290, 404, { size: 15, align: 'center', weight: 800, family: FONT.title, color: '#e8c872', ow: 0 });
    text(ctx, '딜러는 17에서 멈춘다', cx + 290, 426, { size: 13, align: 'center', weight: 700, family: FONT.title, color: '#e8c872', ow: 0 });
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.1; catHead(ctx, cx, 480, 90, '#e8c872'); ctx.restore();
    // 딜러 쪽 난간(패딩)
    const rg = ctx.createLinearGradient(0, top - 14, 0, top + 12);
    rg.addColorStop(0, '#6a3a1e'); rg.addColorStop(0.5, '#2a1208'); rg.addColorStop(1, '#0a0402');
    ctx.fillStyle = rg; ctx.fillRect(xL, top - 12, wD, 22);
    ctx.fillStyle = 'rgba(232,200,114,0.55)'; ctx.fillRect(xL, top + 9, wD, 1.5);
    ctx.fillStyle = 'rgba(255,220,180,0.15)'; ctx.fillRect(xL, top - 11, wD, 3);
    // 슈
    const s = this.shoe;
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, -40, -18, 88, 50, 6); ctx.fill();
    const sg = ctx.createLinearGradient(0, -24, 0, 26);
    sg.addColorStop(0, '#3a1a24'); sg.addColorStop(1, '#10060a');
    ctx.fillStyle = sg; rr(ctx, -44, -24, 88, 48, 6); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.rotate(-0.12); drawCard(ctx, null, -6, -12, 44, 30, { back: true });
    ctx.restore();
    candle(ctx, cx - 300, top + 2, 34, t, 1);
    candle(ctx, cx + 330, top + 2, 28, t, 3);
    // 판돈 원 + 칩
    const bx = cx - 250, by = 420;
    ctx.strokeStyle = 'rgba(232,200,114,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(bx, by, 52, 34, 0, 0, TAU); ctx.stroke();
    text(ctx, '판돈', bx, by + 52, { size: 13, align: 'center', weight: 700, color: 'rgba(232,200,114,0.7)', ow: 0 });
    if (this.phase !== 'ready' || this.result) {
      const amt = this.roundFree ? 0 : this.roundBet;
      const stacks = this.doubled ? 2 : 1;
      for (let kk = 0; kk < stacks; kk++) for (let i = 0; i < 4; i++) drawChip(ctx, bx - 16 + kk * 34, by + 6 - i * 5, 17, amt === 0 ? 0 : this.bet, { t });
    }
  }
  drawTotals(ctx) {
    const vw = this.vw;
    const badge = (hand, yD, isDealer) => {
      if (!hand.length) return;
      const shown = hand.filter((c) => c.flip >= 0.5 && c.fly >= 1);
      if (!shown.length) return;
      const hv = handValue(shown);
      const all = isDealer ? hand.every((c) => c.up) : true;
      let lb = hv.soft && hv.v < 21 ? `${hv.v - 10} / ${hv.v}` : String(hv.v);
      let col = '#efe4cf';
      if (hv.v > 21) { lb = `${hv.v} 버스트`; col = '#ff6a6a'; }
      else if (hv.v === 21 && hand.length === 2 && all) { lb = '블랙잭!'; col = '#ffe070'; }
      const n = hand.length, sp = isDealer ? 52 : 58;
      // 설계 좌표(카드 오른쪽 끝 + 34) → 화면
      const P = this.P(vw / 2 + ((n - 1) / 2) * sp + CW * 0.5 + 34, yD);
      const x = P.x, y = P.y;
      ctx.font = `900 18px ${FONT.num}`;
      const w = Math.max(54, ctx.measureText(lb).width + 26);
      gPanel(ctx, x - 10, y - 18, w, 34, { a: 0.9, r: 17, orn: false, edge: col === '#efe4cf' ? '#8a6a34' : col });
      text(ctx, lb, x - 10 + w / 2, y + 6, { size: 17, align: 'center', weight: 900, family: FONT.num, color: col, ow: 3 });
      text(ctx, isDealer ? '마몬' : '당신', x - 10 + w / 2, y - 22, { size: 11, align: 'center', weight: 800, color: '#b8a080', ow: 2 });
    };
    badge(this.dealer, 280, true);
    badge(this.player, 402, false);
  }
  drawReadyUI(ctx) {
    const vw = this.vw, L = this.L;
    // 테이블의 '판돈' 원(왼쪽)과 인쇄 문구(오른쪽)를 가리지 않도록 칩·버튼이 들어갈 폭만 쓴다
    const n = this.betOptions().length, big = input.touchMode || this.tapMin > 44;
    const chipGap = Math.max(46 + (big ? 20 : 12), big ? this.tapMin : 0);
    const bh = this.bh(52);
    const pw = Math.max(356, n * chipGap + 28), ph = Math.max(136, 83 + bh + 6);
    const px = vw / 2 - pw / 2, py = L.H - 8 - ph;
    gPanel(ctx, px, py, pw, ph, { a: 0.82, r: 14 });
    this.drawBetBar(ctx, vw / 2, py + 42, { r: 23, maxW: pw - 20 });
    const r = this.hits.rect('deal', vw / 2 - 100, py + 78, 200, bh);
    const can = this.free || this.st.gold >= this.bet;
    this.hits.add('deal', r, !can);
    drawBtn(ctx, r, '카드 받기!', { tone: 'crimson', size: 19, hot: this.hits.over(r), pressed: this.hits.pressed(r), key: 'confirm', disabled: !can, pulse: can, t: this.clock });
  }
  drawPlayUI(ctx) {
    const vw = this.vw, L = this.L, play = this.phase === 'play';
    const canDouble = play && this.player.length === 2 && (this.roundFree || this.st.gold >= this.roundBet);
    const gap = 14, bh = L.bh, bw = Math.min(168, (vw - 32 - gap * 2) / 3), y = L.H - 8 - bh;
    const x0 = vw / 2 - (bw * 3 + gap * 2) / 2;
    const defs = [['hit', '히트', '한 장 더', 'crimson', 'confirm', !play], ['stand', '스탠드', '여기서 멈춤', 'blue', 'alt', !play], ['double', '더블', this.roundFree ? '판돈 2배 (무료)' : `+${fmt(this.roundBet)} G · 1장`, 'gold', 'alt2', !canDouble]];
    defs.forEach(([id, lb, sub, tone, key, dis], i) => {
      const r = this.hits.rect(id, x0 + i * (bw + gap), y, bw, bh);
      this.hits.add(id, r, dis);
      drawBtn(ctx, r, lb, { tone, size: 19, sub, key, disabled: dis, hot: !dis && this.hits.over(r), pressed: this.hits.pressed(r) });
    });
  }
}

// ───────────────────────── 악마 딜러 '마몬' ─────────────────────────
/** cx 중심, base 난간 높이(y). mood: idle|grin|angry|shock */
function drawDealer(c, cx, base, t, mood, mt, blink, flick) {
  c.save();
  c.translate(cx, base);
  const breathe = Math.sin(t * 1.6) * 1.5;
  const laugh = mood === 'grin' ? Math.abs(Math.sin(mt * 12)) * 3 * clamp(1 - mt / 1.6, 0, 1) : 0;
  const shake = mood === 'angry' ? Math.sin(mt * 40) * 2 * clamp(1 - mt / 0.6, 0, 1) : 0;
  c.lineJoin = 'round'; c.lineCap = 'round';
  // ── 몸통 (연미복) ──
  c.save(); c.translate(0, breathe * 0.5);
  const coat = c.createLinearGradient(-120, -80, 120, 0);
  coat.addColorStop(0, '#2a1830'); coat.addColorStop(0.5, '#140a16'); coat.addColorStop(1, '#07030a');
  c.fillStyle = coat;
  c.beginPath();
  c.moveTo(-126, 0); c.quadraticCurveTo(-124, -54, -92, -68); c.quadraticCurveTo(-50, -84, -18, -80);
  c.lineTo(18, -80); c.quadraticCurveTo(50, -84, 92, -68); c.quadraticCurveTo(124, -54, 126, 0); c.closePath(); c.fill();
  c.strokeStyle = '#040206'; c.lineWidth = 2.5; c.stroke();
  // 어깨 역광
  c.strokeStyle = 'rgba(150,140,255,0.45)'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-120, -30); c.quadraticCurveTo(-116, -58, -90, -68); c.quadraticCurveTo(-56, -80, -24, -79); c.stroke();
  c.strokeStyle = 'rgba(255,170,120,0.35)';
  c.beginPath(); c.moveTo(120, -30); c.quadraticCurveTo(116, -58, 90, -68); c.stroke();
  // 셔츠 V + 라펠
  c.fillStyle = '#c8bcb0';
  c.beginPath(); c.moveTo(-24, -80); c.lineTo(24, -80); c.lineTo(0, 0); c.closePath(); c.fill();
  const lap = c.createLinearGradient(-40, -80, 0, 0);
  lap.addColorStop(0, '#8a1428'); lap.addColorStop(1, '#3a0610');
  c.fillStyle = lap;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 24, -80); c.lineTo(s * 46, -76); c.lineTo(s * 22, -34); c.lineTo(s * 8, 0); c.lineTo(s * 2, -2); c.closePath(); c.fill(); }
  // 조끼 + 금 사슬
  c.fillStyle = '#2a0a14';
  c.beginPath(); c.moveTo(-12, -46); c.lineTo(12, -46); c.lineTo(6, 0); c.lineTo(-6, 0); c.closePath(); c.fill();
  c.strokeStyle = '#e8c060'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(-10, -22); c.quadraticCurveTo(-30, -10, -44, -20); c.stroke();
  c.fillStyle = '#e8c060'; c.beginPath(); c.arc(-46, -20, 3, 0, TAU); c.fill();
  // 나비넥타이
  c.fillStyle = '#b0102a';
  c.beginPath(); c.moveTo(0, -74); c.lineTo(-16, -82); c.lineTo(-16, -66); c.closePath(); c.moveTo(0, -74); c.lineTo(16, -82); c.lineTo(16, -66); c.closePath(); c.fill();
  c.fillStyle = '#e03050'; c.beginPath(); c.arc(0, -74, 3.5, 0, TAU); c.fill();
  c.restore();
  // ── 머리 ──
  c.save();
  c.translate(shake, -laugh + breathe);
  // 목
  c.fillStyle = '#4a0a1a'; c.fillRect(-13, -92, 26, 18);
  // 뿔 (뒤)
  for (const s of [-1, 1]) {
    c.save(); c.scale(s, 1);
    const hg = c.createLinearGradient(18, -140, 76, -196);
    hg.addColorStop(0, '#e8dcc0'); hg.addColorStop(0.5, '#9a8468'); hg.addColorStop(1, '#1a0e0a');
    c.fillStyle = hg;
    c.beginPath();
    c.moveTo(14, -140);
    c.bezierCurveTo(30, -170, 58, -184, 70, -206);
    c.bezierCurveTo(74, -190, 62, -168, 50, -160);
    c.bezierCurveTo(44, -150, 34, -138, 30, -128);
    c.closePath(); c.fill();
    c.strokeStyle = '#140806'; c.lineWidth = 1.8; c.stroke();
    c.strokeStyle = 'rgba(40,20,10,0.5)'; c.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) { const k = i / 5; c.beginPath(); c.moveTo(20 + k * 38, -142 - k * 40); c.lineTo(32 + k * 30, -134 - k * 38); c.stroke(); }
    if (mood === 'angry') { c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(255,80,30,${0.5 * clamp(1 - mt / 2, 0, 1)})`; c.lineWidth = 3; c.beginPath(); c.moveTo(14, -140); c.bezierCurveTo(30, -170, 58, -184, 70, -206); c.stroke(); c.globalCompositeOperation = 'source-over'; }
    c.restore();
  }
  // 귀
  for (const s of [-1, 1]) {
    c.fillStyle = '#6a1424';
    c.beginPath(); c.moveTo(s * 27, -122); c.quadraticCurveTo(s * 50, -136, s * 56, -148); c.quadraticCurveTo(s * 44, -118, s * 28, -104); c.closePath(); c.fill();
    c.strokeStyle = '#1a0408'; c.lineWidth = 1.4; c.stroke();
  }
  // 얼굴
  const fg = c.createRadialGradient(-10, -126, 6, 0, -112, 46);
  fg.addColorStop(0, '#b8384a'); fg.addColorStop(0.55, '#7a1428'); fg.addColorStop(1, '#2a0410');
  c.fillStyle = fg;
  c.beginPath();
  c.moveTo(0, -154);
  c.bezierCurveTo(26, -154, 32, -132, 30, -114);
  c.bezierCurveTo(28, -96, 16, -80, 0, -72);
  c.bezierCurveTo(-16, -80, -28, -96, -30, -114);
  c.bezierCurveTo(-32, -132, -26, -154, 0, -154);
  c.fill();
  c.strokeStyle = '#140208'; c.lineWidth = 2; c.stroke();
  // 광대 그늘 + 역광
  c.fillStyle = 'rgba(30,0,10,0.35)';
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 26, -108); c.quadraticCurveTo(s * 14, -100, s * 18, -88); c.quadraticCurveTo(s * 26, -98, s * 26, -108); c.fill(); }
  c.strokeStyle = 'rgba(160,150,255,0.5)'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(-30, -126); c.bezierCurveTo(-30, -100, -18, -84, -4, -74); c.stroke();
  // 머리카락 (올백 + 뾰족한 이마선)
  c.fillStyle = '#0a0408';
  c.beginPath();
  c.moveTo(-31, -118); c.bezierCurveTo(-34, -150, -14, -166, 4, -164);
  c.bezierCurveTo(24, -164, 36, -148, 31, -118);
  c.quadraticCurveTo(26, -138, 12, -142); c.lineTo(0, -128); c.lineTo(-12, -142);
  c.quadraticCurveTo(-26, -138, -31, -118); c.fill();
  c.strokeStyle = 'rgba(140,120,200,0.35)'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-20, -150); c.quadraticCurveTo(-4, -160, 16, -154); c.stroke();
  // 눈썹
  const browUp = mood === 'shock' ? -5 : mood === 'angry' ? 3 : 0;
  c.strokeStyle = '#0a0206'; c.lineWidth = 3.2;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 24, -126 + browUp - (mood === 'angry' ? 0 : 2)); c.lineTo(s * 5, -120 + browUp + (mood === 'angry' ? 4 : 0)); c.stroke(); }
  // 눈
  const eo = blink ? 0.12 : mood === 'shock' ? 1.35 : mood === 'angry' ? 0.6 : 1;
  for (const s of [-1, 1]) {
    const ex = s * 13, ey = -113;
    c.fillStyle = '#0a0204';
    c.beginPath(); c.ellipse(ex, ey, 8.5, 4.6 * eo + 0.5, s * -0.18, 0, TAU); c.fill();
    if (!blink) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const eg = c.createRadialGradient(ex, ey, 0, ex, ey, 18);
      eg.addColorStop(0, mood === 'angry' ? 'rgba(255,90,30,0.9)' : 'rgba(255,200,60,0.8)'); eg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = eg; c.fillRect(ex - 18, ey - 18, 36, 36);
      c.restore();
      c.fillStyle = mood === 'angry' ? '#ff6a2a' : '#ffd040';
      c.beginPath(); c.ellipse(ex, ey, 6, 3.8 * eo, s * -0.18, 0, TAU); c.fill();
      c.fillStyle = '#0a0204'; c.fillRect(ex - 0.9, ey - 3.6 * eo, 1.8, 7.2 * eo);
    }
  }
  // 코
  c.strokeStyle = 'rgba(20,0,6,0.6)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(-2, -108); c.quadraticCurveTo(-5, -96, 0, -95); c.stroke();
  // 입
  c.save();
  const my = -86;
  if (mood === 'shock') {
    c.fillStyle = '#1a0206'; c.beginPath(); c.ellipse(0, my, 6, 8, 0, 0, TAU); c.fill();
  } else if (mood === 'angry') {
    c.fillStyle = '#1a0206'; c.beginPath(); c.moveTo(-14, my - 1); c.lineTo(14, my - 1); c.lineTo(12, my + 5); c.lineTo(-12, my + 5); c.closePath(); c.fill();
    c.fillStyle = '#f0e8d8'; c.fillRect(-12, my - 1, 24, 3); c.fillRect(-12, my + 3, 24, 2);
    c.strokeStyle = '#1a0206'; c.lineWidth = 1; for (let i = -8; i <= 8; i += 4) { c.beginPath(); c.moveTo(i, my - 1); c.lineTo(i, my + 5); c.stroke(); }
  } else {
    const wide = mood === 'grin' ? 1 : 0;
    const w = 13 + wide * 8, drop = 5 + wide * 6;
    c.fillStyle = '#1a0206';
    c.beginPath(); c.moveTo(-w, my - 3 - wide * 2); c.quadraticCurveTo(0, my + drop + 4, w + 2, my - 6 - wide * 2); c.quadraticCurveTo(0, my + 1, -w, my - 3 - wide * 2); c.fill();
    // 이빨
    c.fillStyle = '#f4ece0';
    const n = 6 + wide * 2;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n, x = lerp(-w + 2, w, k), y0 = my - 2 + Math.sin(k * Math.PI) * (wide ? 2.5 : 1.2) - (k > 0.5 ? (k - 0.5) * 4 : 0);
      const fang = i === 1 || i === n - 2;
      c.beginPath(); c.moveTo(x - 1.6, y0); c.lineTo(x + 1.6, y0); c.lineTo(x, y0 + (fang ? 6 : 2.6)); c.closePath(); c.fill();
    }
  }
  c.restore();
  // 염소수염
  c.fillStyle = '#0a0408';
  c.beginPath(); c.moveTo(-6, -76); c.quadraticCurveTo(0, -60, 2, -56); c.quadraticCurveTo(4, -64, 6, -76); c.closePath(); c.fill();
  c.restore();
  c.restore();
}
/** 난간 위에 올린 두 손 (테이블 난간보다 나중에 그림) */
function drawDealerHands(c, cx, base, t, flick) {
  c.save();
  c.translate(cx, base);
  for (const s of [-1, 1]) {
    const tap = s < 0 ? Math.max(0, Math.sin(t * 5)) * 2 : flick * -8;
    c.save(); c.translate(s * 92 + (s > 0 ? flick * 10 : 0), -6 + tap);
    const hg = c.createLinearGradient(-20, -14, 20, 10);
    hg.addColorStop(0, '#9a2a3a'); hg.addColorStop(1, '#3a0612');
    // 소매
    c.fillStyle = '#140a16'; rr(c, -24, -28, 48, 18, 6); c.fill();
    c.fillStyle = '#c8bcb0'; c.fillRect(-20, -12, 40, 4);
    c.fillStyle = hg;
    c.beginPath(); c.ellipse(0, -2, 20, 10, 0, 0, TAU); c.fill();
    c.strokeStyle = '#1a0408'; c.lineWidth = 1.5; c.stroke();
    // 손가락 + 발톱
    for (let i = 0; i < 4; i++) {
      const fx = -14 + i * 9.5;
      c.fillStyle = '#7a1a2a';
      c.beginPath(); c.ellipse(fx, 7, 3.6, 7, 0, 0, TAU); c.fill();
      c.fillStyle = '#0a0406';
      c.beginPath(); c.moveTo(fx - 2.5, 12); c.lineTo(fx + 2.5, 12); c.lineTo(fx + 0.5, 21); c.closePath(); c.fill();
    }
    c.restore();
  }
  c.restore();
}
