// 블러드 슬롯 — 3릴 × 3줄, 5개 페이라인(가로 3 + 대각 2). 모션 블러 릴, 버튼마다 릴 하나씩 정지(자동 정지 포함),
// 7/성배 리치 시 3번 릴 '두근두근' 연장, 가운데 줄 피의 7 셋 = 잭팟(화면 섬광 + 코인 분수).
// 배당(판돈 배수, 줄마다 합산): 해골 2 · 박쥐 3 · 하트 6 · 십자가 12 · 달 30 · 성배 80 · 피의 7 100 · 가운데 줄 7 250 (RTP ≈ 92%)
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { text, FONT } from '../../core/ui.js';
import { clamp, lerp, ease, fmt, TAU } from '../../core/math.js';
import { MiniGame, innBackdrop, drawBtn, gPanel, goldText, record, GOLD } from './common.js';
import { SLOT_SYMBOLS, SLOT_NAMES, slotSprite, glow, rr } from './art.js';

const COUNTS = { skull: 8, bat: 5, heart: 4, cross: 3, moon: 2, grail: 1, seven: 1 };
const PAY = { skull: 2, bat: 3, heart: 6, cross: 12, moon: 30, grail: 80, seven: 100 };
const JACKPOT = 250;
// 줄: [릴0 행, 릴1 행, 릴2 행]  (행 0=위, 1=가운데, 2=아래)
const LINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
const LINE_COL = ['#ffd060', '#ff6a8a', '#8ac8ff', '#b0ff8a', '#d08aff'];
const ROW_H = 66;

function makeStrip() {
  const a = [];
  for (const s of SLOT_SYMBOLS) for (let i = 0; i < COUNTS[s]; i++) a.push(s);
  // 같은 문양이 붙지 않게 섞기
  for (let tries = 0; tries < 50; tries++) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    let ok = true;
    for (let i = 0; i < a.length; i++) if (a[i] === a[(i + 1) % a.length] && a[i] !== 'skull') { ok = false; break; }
    if (ok) break;
  }
  return a;
}
const mod = (n, m) => ((n % m) + m) % m;

export class SlotScene extends MiniGame {
  constructor(g) { super(g, 'slot'); }
  init() {
    this.reels = [0, 1, 2].map(() => {
      const strip = makeStrip();
      const p = Math.floor(Math.random() * strip.length);
      return { strip, pos: p, v: 0, state: 'idle', target: p, stopAt: 0, t: 0, from: 0, to: 0, dur: 0.45, bounce: 0 };
    });
    this.spinT = 0; this.lever = 0; this.leverV = 0;
    this.wins = []; this.showT = 9; this.winAmt = 0; this.meter = 0;
    this.msg = '레버를 당겨 행운을 시험해 봐요!'; this.msgCol = '#e8d8b0';
    this.tease = false; this.jackpotT = 9;
    this.recent = [];
    this.spins = 0;
  }
  canLeave() { return this.phase === 'ready' || this.phase === 'result'; }
  onAgain() { this.spin(); }
  get cab() {
    const w = clamp(this.vw * 0.42, 400, 470);
    return { x: this.vw / 2 - w / 2, y: 50, w, h: 360 };
  }
  grid() {
    return this.reels.map((r) => { const p = Math.round(r.pos); return [r.strip[mod(p + 1, r.strip.length)], r.strip[mod(p, r.strip.length)], r.strip[mod(p - 1, r.strip.length)]]; });
  }

  spin() {
    if (this.phase !== 'ready') return;
    if (!this.takeBet()) return;
    this.phase = 'spin';
    this.spinT = 0; this.wins = []; this.showT = 9; this.winAmt = 0; this.tease = false;
    this.leverV = 1;
    this.spins++;
    this.msg = '돌아간다…!'; this.msgCol = '#e8d8b0';
    const forced = this.forceStops; this.forceStops = null;
    this.reels.forEach((r, i) => {
      r.state = 'spin'; r.v = 0; r.t = 0;
      r.result = forced ? forced[i] : Math.floor(Math.random() * r.strip.length);
      r.stopAt = 0.95 + i * 0.42;
    });
    audio.sfx('slot_spin');
    audio.sfx('coin_insert', { vol: 0.6 });
  }
  /** 릴 하나 정지 명령 */
  stopReel(i) {
    const r = this.reels[i];
    if (r.state !== 'spin' || r.t < 0.25) return false;
    if (i === 2 && this.tease && r.t < r.stopAt - 0.05) return false; // 두근두근 연출 중엔 수동 정지 불가
    const len = r.strip.length;
    let to = Math.floor(r.pos) + 2;
    to += mod(r.result - to, len);
    if (to - r.pos < 2) to += len;
    r.state = 'stop'; r.from = r.pos; r.to = to; r.t2 = 0; r.dur = clamp((to - r.pos) / 22, 0.28, 0.5);
    return true;
  }
  stopNext() {
    for (let i = 0; i < 3; i++) if (this.reels[i].state === 'spin') { if (this.stopReel(i)) return; else return; }
  }
  onReelLanded(i) {
    audio.sfx('clang', { vol: 0.45, pitch: 1.3 + i * 0.1 });
    this.shake(1.5, 0.08);
    const c = this.cab, x = this.reelX(i) + this.reelW / 2;
    this.fx.burst('spark', x, c.y + 84 + ROW_H * 1.5, 5, { speed: 180 });
    // 리치 판정 (두 릴이 멈춘 뒤)
    if (i === 1 || (this.reels[0].state === 'idle' && this.reels[1].state === 'idle' && this.reels[2].state === 'spin')) {
      if (this.reels[2].state === 'spin' && !this.tease && this.reach()) {
        this.tease = true;
        this.reels[2].stopAt = Math.max(this.reels[2].t + 1.6, this.reels[2].stopAt + 1.2);
        this.msg = '두근두근…!'; this.msgCol = '#ff8a8a';
        audio.sfx('warning', { vol: 0.5 });
      }
    }
    if (this.reels.every((r) => r.state === 'idle')) this.evaluate();
  }
  /** 첫 두 릴로 7/성배 리치가 걸렸는지 */
  reach() {
    const g = this.grid();
    return LINES.some((L) => { const a = g[0][L[0]], b = g[1][L[1]]; return a === b && (a === 'seven' || a === 'grail' || a === 'moon'); });
  }
  evaluate() {
    const g = this.grid();
    const wins = [];
    let mult = 0, jackpot = false;
    LINES.forEach((L, li) => {
      const a = g[0][L[0]], b = g[1][L[1]], c = g[2][L[2]];
      if (a === b && b === c) {
        const m = a === 'seven' && li === 0 ? JACKPOT : PAY[a];
        if (a === 'seven' && li === 0) jackpot = true;
        wins.push({ li, sym: a, m });
        mult += m;
      }
    });
    this.wins = wins; this.showT = 0;
    const notional = this.roundFree ? this.bet : this.roundBet;
    const pay = Math.round(notional * mult);
    this.winAmt = this.roundFree ? 0 : pay; this.meter = 0;
    this.tease = false;
    this.phase = 'ready';
    const top = wins.reduce((a, w) => (w.m > a.m ? w : a), { m: 0 });
    if (wins.length) {
      this.recent.unshift({ sym: top.sym, amt: this.roundFree ? 0 : pay, m: mult });
      if (this.recent.length > 5) this.recent.pop();
      const tier = jackpot ? 'jackpot' : mult >= 20 ? 'big' : 'win';
      this.msg = jackpot ? '잭팟!!! 피의 7이 모였다!' : `${wins.length > 1 ? `${wins.length}줄 ` : ''}당첨! ${SLOT_NAMES[top.sym]} ×${mult}${this.roundFree ? ' (무료 판)' : ''}`;
      this.msgCol = jackpot ? '#ffe070' : '#9af09a';
      const b = this.st.innGames.best;
      if (!this.roundFree) record(this.st, 'slotBest', pay);
      if (jackpot) b.slotJackpots = (b.slotJackpots ?? 0) + 1;
      const c = this.cab;
      this.settle({ win: true, payout: pay, tier, popup: tier !== 'win', title: jackpot ? '잭팟!!!' : '대박 당첨!', sub: `${SLOT_NAMES[top.sym]} ${wins.length > 1 ? `외 ${wins.length - 1}줄` : ''} · 배당 ×${mult}`, cx: this.vw / 2, cy: c.y + 84 + ROW_H * 1.5, delay: jackpot ? 1.6 : 1.0 });
      if (jackpot) { this.jackpotT = 0; this.coins.burst(this.vw / 2, c.y + 40, 60, { up: 1100, spread: 1.6 }); }
    } else {
      this.msg = this.spins % 4 === 0 ? '아깝다! 한 번만 더?' : '꽝… 다음 기회에!'; this.msgCol = '#b8a080';
      this.settle({ win: false, tier: 'lose', popup: false, quiet: true });
    }
  }

  animate(dt) {
    this.showT += dt; this.jackpotT += dt;
    this.meter = Math.min(this.winAmt, this.meter + Math.max(this.winAmt * dt * 1.2, 40 * dt));
    // 레버
    this.lever += (this.leverV - this.lever) * Math.min(1, dt * 18);
    if (this.lever > 0.95) this.leverV = 0;
  }
  step(dt, tap) {
    if (this.phase === 'spin') {
      this.spinT += dt;
      this.reels.forEach((r, i) => {
        if (r.state === 'spin') {
          r.t += dt;
          r.v = Math.min(24, r.v + dt * 90);
          r.pos += r.v * dt;
          if (r.t >= r.stopAt) this.stopReel(i);
        } else if (r.state === 'stop') {
          r.t2 += dt;
          const u = clamp(r.t2 / r.dur, 0, 1);
          const k = 1 - Math.pow(1 - u, 3);
          const over = Math.sin(u * Math.PI) * 0.18 * (1 - u);
          r.pos = lerp(r.from, r.to, k) + over;
          r.v = (r.to - r.from) / r.dur * (1 - u);
          if (u >= 1) { r.pos = r.to; r.v = 0; r.state = 'idle'; this.onReelLanded(i); }
        }
      });
      if (tap === 'spin' || tap === 'lever' || input.pressed('confirm')) this.stopNext();
      for (let i = 0; i < 3; i++) if (tap === 'stop' + i) this.stopReel(i);
      return;
    }
    if (this.phase === 'ready') {
      if (tap === 'spin' || tap === 'lever' || input.pressed('confirm')) this.spin();
    }
  }

  get reelW() { return (this.cab.w - 80) / 3; }
  reelX(i) { const c = this.cab; return c.x + 40 + i * this.reelW; }

  // ── 그리기 ──
  draw(ctx) {
    const vw = this.vw, vh = this.vh, t = this.clock;
    innBackdrop(ctx, vw, vh, t, 0.74, 0.5);
    const c = this.cab;
    glow(ctx, vw / 2, c.y + c.h / 2, c.w * 0.9, '#a0102a', 0.3 + (this.jackpotT < 3 ? 0.3 * Math.abs(Math.sin(t * 12)) : 0));
    this.drawCabinet(ctx, c, t);
    this.drawReels(ctx, c, t);
    this.drawLever(ctx, c.x + c.w + 4, c.y + 150, t);
    this.drawPayTable(ctx, 16, 96, c.x - 30, 300);
    this.drawSide(ctx, c.x + c.w + 44, 96, vw - 16 - (c.x + c.w + 44), 300);
    this.drawBottom(ctx);
    if (this.jackpotT < 2.6) {
      const k = ease.outBack(clamp(this.jackpotT / 0.4, 0, 1)) * clamp((2.6 - this.jackpotT) / 0.4, 0, 1);
      ctx.save(); ctx.translate(vw / 2, 250); ctx.scale(k, k); ctx.rotate(Math.sin(t * 8) * 0.04);
      goldText(ctx, 'JACKPOT!!', 0, 0, 78, { family: FONT.logo, weight: 900, glowCol: '#ff2040', top: '#ffffff', mid: '#ffe070', bot: '#ff6a2a', ow: 8 });
      ctx.restore();
    }
  }
  drawCabinet(ctx, c, t) {
    // 몸체
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; rr(ctx, c.x + 6, c.y + 14, c.w, c.h, 26); ctx.fill();
    const bg = ctx.createLinearGradient(c.x, 0, c.x + c.w, 0);
    bg.addColorStop(0, '#2a0810'); bg.addColorStop(0.5, '#5a0e1e'); bg.addColorStop(1, '#1a0408');
    rr(ctx, c.x, c.y + 40, c.w, c.h - 40, 22); ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#0a0204'; ctx.stroke();
    rr(ctx, c.x + 7, c.y + 47, c.w - 14, c.h - 54, 17); ctx.lineWidth = 2; ctx.strokeStyle = GOLD; ctx.stroke();
    // 역광 테두리
    ctx.strokeStyle = 'rgba(150,160,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c.x + 2, c.y + c.h - 30); ctx.lineTo(c.x + 2, c.y + 60); ctx.stroke();
    // 꼭대기: 박쥐 날개 + 붉은 달 + 간판
    const cx = c.x + c.w / 2;
    ctx.save(); ctx.translate(cx, c.y + 40);
    for (const s of [-1, 1]) {
      ctx.save(); ctx.scale(s, 1);
      const wg = ctx.createLinearGradient(0, -40, 150, 20);
      wg.addColorStop(0, '#3a1a3a'); wg.addColorStop(1, '#0a040c');
      ctx.fillStyle = wg;
      ctx.beginPath(); ctx.moveTo(40, -6);
      ctx.quadraticCurveTo(110, -64, c.w * 0.56, -40);
      ctx.quadraticCurveTo(c.w * 0.5, -20, c.w * 0.52, 4);
      ctx.quadraticCurveTo(c.w * 0.44, -10, c.w * 0.38, 6);
      ctx.quadraticCurveTo(c.w * 0.3, -8, c.w * 0.24, 8);
      ctx.quadraticCurveTo(c.w * 0.16, -4, 40, 10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#050206'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(180,150,255,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(40, -6); ctx.quadraticCurveTo(110, -64, c.w * 0.56, -40); ctx.stroke();
      ctx.restore();
    }
    const mg = ctx.createRadialGradient(-10, -34, 4, 0, -24, 42);
    mg.addColorStop(0, '#ff8a6a'); mg.addColorStop(0.6, '#c0102a'); mg.addColorStop(1, '#4a0010');
    glow(ctx, 0, -24, 90, '#ff2040', 0.45);
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(0, -24, 40, 0, TAU); ctx.fill();
    ctx.restore();
    // 간판
    const mx = c.x + 30, my = c.y + 30, mw = c.w - 60, mh = 50;
    rr(ctx, mx, my, mw, mh, 12);
    const pg = ctx.createLinearGradient(0, my, 0, my + mh);
    pg.addColorStop(0, '#1a0608'); pg.addColorStop(1, '#3a0a12');
    ctx.fillStyle = pg; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = GOLD; ctx.stroke();
    // 전구
    const n = 22, hot = this.showT < 2 && this.wins.length || this.jackpotT < 3;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const per = 2 * (mw + mh);
      let d = u * per, bx, by;
      if (d < mw) { bx = mx + d; by = my; } else if ((d -= mw) < mh) { bx = mx + mw; by = my + d; } else if ((d -= mh) < mw) { bx = mx + mw - d; by = my + mh; } else { d -= mw; bx = mx; by = my + mh - d; }
      const on = hot ? Math.floor(t * 12) % 2 === 0 : (i + Math.floor(t * 7)) % 3 === 0;
      ctx.fillStyle = on ? '#fff2b0' : '#5a3a1a';
      ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, TAU); ctx.fill();
      if (on) glow(ctx, bx, by, 10, '#ffc060', 0.6);
    }
    goldText(ctx, 'BLOOD SLOT', cx, my + 36, 30, { family: FONT.logo, weight: 900, glowCol: '#ff2040', top: '#ffffff', mid: '#ff5a6a', bot: '#8a0a1a', ow: 5 });
    ctx.restore();
  }
  drawReels(ctx, c, t) {
    const rw = this.reelW, ry = c.y + 84, rh = ROW_H * 3;
    const gx = c.x + 34, gw = c.w - 68;
    // 창틀
    ctx.fillStyle = '#0a0204'; rr(ctx, gx - 6, ry - 8, gw + 12, rh + 16, 12); ctx.fill();
    const fg = ctx.createLinearGradient(0, ry - 8, 0, ry + rh + 8);
    fg.addColorStop(0, '#fff2b0'); fg.addColorStop(0.5, '#b8862a'); fg.addColorStop(1, '#5a3a0a');
    ctx.lineWidth = 4; ctx.strokeStyle = fg; rr(ctx, gx - 6, ry - 8, gw + 12, rh + 16, 12); ctx.stroke();
    const S = 62, R = rh * 0.62;
    for (let i = 0; i < 3; i++) {
      const r = this.reels[i], x = this.reelX(i);
      ctx.save();
      rr(ctx, x + 3, ry, rw - 6, rh, 6); ctx.clip();
      const dg = ctx.createLinearGradient(0, ry, 0, ry + rh);
      dg.addColorStop(0, '#6a5a48'); dg.addColorStop(0.2, '#e8dcc4'); dg.addColorStop(0.5, '#faf4e6'); dg.addColorStop(0.8, '#e8dcc4'); dg.addColorStop(1, '#6a5a48');
      ctx.fillStyle = dg; ctx.fillRect(x, ry, rw, rh);
      const blur = Math.abs(r.v) > 9;
      const base = Math.floor(r.pos), frac = r.pos - base;
      const len = r.strip.length;
      for (let k = -2; k <= 2; k++) {
        const idx = base - k; // 아래로 흐름: 위쪽에 더 큰 인덱스
        const yy = (k + frac) * ROW_H; // 가운데 행 기준 오프셋
        const ang = yy / R;
        if (Math.abs(ang) > 1.45) continue;
        const cy = ry + rh / 2 + Math.sin(ang) * R;
        const sy = Math.cos(ang);
        const sym = r.strip[mod(idx, len)];
        const win = this.isWinCell(i, k, frac);
        const pulse = win ? 1 + 0.08 * Math.sin(this.showT * 10) : 1;
        if (win) glow(ctx, x + rw / 2, cy, 44, '#ffd060', 0.45);
        const spr = slotSprite(sym, blur);
        const dw = S * pulse, dh = (blur ? S * 1.6 : S) * sy * pulse;
        ctx.globalAlpha = 0.35 + 0.65 * sy;
        ctx.drawImage(spr, x + rw / 2 - dw / 2, cy - dh / 2, dw, dh);
        ctx.globalAlpha = 1;
      }
      // 원통 음영
      const sg = ctx.createLinearGradient(0, ry, 0, ry + rh);
      sg.addColorStop(0, 'rgba(10,2,6,0.75)'); sg.addColorStop(0.22, 'rgba(10,2,6,0)'); sg.addColorStop(0.78, 'rgba(10,2,6,0)'); sg.addColorStop(1, 'rgba(10,2,6,0.75)');
      ctx.fillStyle = sg; ctx.fillRect(x, ry, rw, rh);
      if (this.tease && i === 2 && r.state === 'spin') { ctx.fillStyle = `rgba(255,40,60,${0.12 + 0.1 * Math.sin(t * 16)})`; ctx.fillRect(x, ry, rw, rh); }
      ctx.restore();
      if (this.tease && i === 2 && r.state === 'spin') {
        ctx.save(); ctx.shadowColor = '#ff2040'; ctx.shadowBlur = 20; ctx.strokeStyle = '#ff5a6a'; ctx.lineWidth = 3;
        rr(ctx, x + 3, ry, rw - 6, rh, 6); ctx.stroke(); ctx.restore();
      }
      // 릴 구분선
      if (i > 0) { ctx.fillStyle = '#2a1408'; ctx.fillRect(x - 2, ry, 4, rh); ctx.fillStyle = 'rgba(232,200,114,0.6)'; ctx.fillRect(x - 0.5, ry, 1, rh); }
    }
    // 유리 반사
    ctx.save(); rr(ctx, gx, ry, gw, rh, 8); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createLinearGradient(gx, ry, gx + gw * 0.6, ry + rh);
    gl.addColorStop(0, 'rgba(255,255,255,0.14)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.02)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(gx, ry, gw, rh);
    ctx.restore();
    // 페이라인 표시 (옆 보석 번호 + 당첨 줄 빛)
    const rowY = (row) => ry + rh / 2 + (row - 1) * ROW_H;
    const lx = c.x + 18, rx = c.x + c.w - 18;
    const GEM = [[rowY(1), rowY(1)], [rowY(0), rowY(0)], [rowY(2), rowY(2)], [ry + 12, ry + rh - 12], [ry + rh - 12, ry + 12]];
    for (let li = 0; li < 5; li++) {
      const L = LINES[li];
      const won = this.wins.some((w) => w.li === li);
      const [gl, gr] = GEM[li];
      for (const [px, py] of [[lx, gl], [rx, gr]]) {
        if (won) glow(ctx, px, py, 18, LINE_COL[li], 0.6);
        ctx.fillStyle = won ? LINE_COL[li] : '#3a1a14';
        ctx.beginPath(); ctx.arc(px, py, 8, 0, TAU); ctx.fill();
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1.2; ctx.stroke();
        text(ctx, String(li + 1), px, py + 4, { size: 10, align: 'center', weight: 900, family: FONT.num, color: won ? '#1a0a06' : '#c8a060', ow: 0 });
      }
      if (won && this.phase !== 'spin') {
        const a = 0.55 + 0.45 * Math.sin(this.showT * 9);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
        ctx.strokeStyle = LINE_COL[li]; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.shadowColor = LINE_COL[li]; ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(lx + 8, gl);
        for (let i = 0; i < 3; i++) ctx.lineTo(this.reelX(i) + rw / 2, rowY(L[i]));
        ctx.lineTo(rx - 8, gr);
        ctx.stroke(); ctx.restore();
      }
    }
    // 릴 정지 버튼
    const by = ry + rh + 10;
    for (let i = 0; i < 3; i++) {
      const r = this.reels[i], x = this.reelX(i) + rw / 2;
      const active = r.state === 'spin';
      // 탭 영역은 버튼과 그 위의 릴 전체 (버튼 그림은 작아도 손가락으로 쉽게 멈출 수 있게)
      const br = this.hits.rect('stop' + i, this.reelX(i) + 2, ry, rw - 4, by + 30 - ry);
      this.hits.add('stop' + i, br, !active);
      ctx.save();
      const pr = this.hits.pressed(br) && active;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, x - 32, by + 3, 64, 26, 13); ctx.fill();
      const bgc = ctx.createLinearGradient(0, by, 0, by + 26);
      bgc.addColorStop(0, active ? '#ff4a5a' : '#4a2a2a'); bgc.addColorStop(1, active ? '#8a0a1a' : '#2a1414');
      ctx.fillStyle = bgc; rr(ctx, x - 32, by + (pr ? 2 : 0), 64, 26, 13); ctx.fill();
      ctx.strokeStyle = active ? '#ffe7a0' : '#6a5030'; ctx.lineWidth = 1.5; ctx.stroke();
      if (active) glow(ctx, x, by + 13, 30, '#ff4050', 0.35 + 0.2 * Math.sin(t * 10 + i));
      text(ctx, '정지', x, by + 18 + (pr ? 2 : 0), { size: 13, align: 'center', weight: 900, color: active ? '#fff' : '#8a7060', ow: 2 });
      ctx.restore();
    }
    // 당첨 표시기
    const my = by + 32, mw = c.w - 90;
    ctx.fillStyle = '#050102'; rr(ctx, c.x + 45, my, mw, 28, 8); ctx.fill();
    ctx.strokeStyle = '#6a4a24'; ctx.lineWidth = 1.5; ctx.stroke();
    if (this.winAmt > 0 && this.phase !== 'spin') {
      text(ctx, `WIN  ${fmt(this.meter)} G`, c.x + c.w / 2, my + 21, { size: 18, align: 'center', weight: 900, family: FONT.num, color: '#ffe070', ow: 3 });
    } else text(ctx, this.msg, c.x + c.w / 2, my + 19, { size: 13.5, align: 'center', weight: 800, color: this.msgCol, ow: 2 });
  }
  isWinCell(reel, k, frac) {
    if (!this.wins.length || this.phase === 'spin' || frac > 0.01) return false;
    const row = k + 1; // k=-1 위(0), 0 가운데(1), 1 아래(2)
    return this.wins.some((w) => LINES[w.li][reel] === row);
  }
  drawLever(ctx, x, y, t) {
    const a = this.lever; // 0 위 → 1 아래
    ctx.save();
    ctx.fillStyle = '#2a1408'; rr(ctx, x - 4, y - 14, 18, 60, 6); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
    const len = 96, ang = lerp(-1.35, 0.45, a);
    const ex = x + 8 + Math.cos(ang) * len * 0.25, ey = y + 16 + Math.sin(ang) * len;
    const hr = this.hits.rect('lever', x - 10, y - 110, 50, 170);
    this.hits.add('lever', hr, this.phase !== 'ready' && this.phase !== 'spin');
    ctx.strokeStyle = '#c8ccd8'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 5, y + 16); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 4, y + 14); ctx.lineTo(ex - 1, ey); ctx.stroke();
    const bg = ctx.createRadialGradient(ex - 5, ey - 5, 2, ex, ey, 15);
    bg.addColorStop(0, '#ff9a9a'); bg.addColorStop(0.5, '#d0102a'); bg.addColorStop(1, '#4a0010');
    glow(ctx, ex, ey, 34, '#ff2040', this.phase === 'ready' ? 0.35 + 0.2 * Math.sin(t * 4) : 0.2);
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(ex, ey, 14, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#1a0206'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  drawPayTable(ctx, x, y, w, h) {
    if (w < 150) return;
    gPanel(ctx, x, y, w, h, { a: 0.84 });
    text(ctx, '배당표', x + w / 2, y + 26, { size: 15, align: 'center', weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    text(ctx, '한 줄에 같은 문양 셋', x + w / 2, y + 43, { size: 10.5, align: 'center', weight: 600, color: '#9d8f80', ow: 2 });
    const order = ['seven', 'grail', 'moon', 'cross', 'heart', 'bat', 'skull'];
    const rowH = (h - 64) / order.length;
    order.forEach((s, i) => {
      const yy = y + 56 + i * rowH;
      const spr = slotSprite(s);
      const hit = this.wins.some((wn) => wn.sym === s) && this.showT < 3;
      if (hit) { ctx.fillStyle = 'rgba(255,208,96,0.16)'; rr(ctx, x + 8, yy, w - 16, rowH - 2, 6); ctx.fill(); }
      for (let k = 0; k < 3; k++) ctx.drawImage(spr, x + 12 + k * 21, yy + rowH / 2 - 13, 26, 26);
      const m = s === 'seven' ? `×${PAY[s]}` : `×${PAY[s]}`;
      text(ctx, m, x + w - 14, yy + rowH / 2 + 6, { size: 16, align: 'right', weight: 900, family: FONT.num, color: s === 'seven' ? '#ff6a7a' : '#ffe7a0', ow: 3 });
      if (s === 'seven') text(ctx, `가운데 ×${JACKPOT}`, x + w - 14, yy + rowH / 2 + 18, { size: 9.5, align: 'right', weight: 800, color: '#ffe070', ow: 2 });
    });
  }
  drawSide(ctx, x, y, w, h) {
    if (w < 140) return;
    gPanel(ctx, x, y, w, h, { a: 0.84 });
    text(ctx, '최근 당첨', x + w / 2, y + 26, { size: 15, align: 'center', weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    if (!this.recent.length) text(ctx, '아직 없음', x + w / 2, y + 80, { size: 13, align: 'center', weight: 600, color: '#7a6a5a', ow: 2 });
    this.recent.forEach((r, i) => {
      const yy = y + 44 + i * 34;
      ctx.fillStyle = i === 0 ? 'rgba(232,200,114,0.14)' : 'rgba(0,0,0,0.25)'; rr(ctx, x + 10, yy, w - 20, 30, 6); ctx.fill();
      ctx.drawImage(slotSprite(r.sym), x + 14, yy + 2, 26, 26);
      text(ctx, `×${r.m}`, x + 46, yy + 20, { size: 13, weight: 900, family: FONT.num, color: '#e8dcc8', ow: 2 });
      text(ctx, r.amt ? `+${fmt(r.amt)}` : '무료', x + w - 16, yy + 20, { size: 13, align: 'right', weight: 900, family: FONT.num, color: '#9af09a', ow: 2 });
    });
    const b = this.st.innGames.best;
    text(ctx, `최고 당첨 ${fmt(b.slotBest ?? 0)} G`, x + w / 2, y + h - 34, { size: 12, align: 'center', weight: 700, color: '#9ad0ff', ow: 2 });
    text(ctx, `잭팟 ${b.slotJackpots ?? 0}회 · 스핀 ${this.spins}`, x + w / 2, y + h - 14, { size: 11.5, align: 'center', weight: 700, color: '#9d8f80', ow: 2 });
  }
  drawBottom(ctx) {
    const vw = this.vw, spinning = this.phase === 'spin';
    const y = 420;
    const bw = 190;
    const pw = Math.min(vw - 32, 700), px = vw / 2 - pw / 2;
    gPanel(ctx, px, y, pw, 110, { a: 0.82, r: 14 });
    const chipsW = pw - bw - 40;
    ctx.save();
    if (spinning) ctx.globalAlpha = 0.45;
    this.drawBetBar(ctx, px + 20 + chipsW / 2, y + 62, { r: 23 });
    ctx.restore();
    const r = this.hits.rect('spin', px + pw - bw - 16, y + 24, bw, 62);
    const can = spinning || this.free || this.st.gold >= this.bet;
    this.hits.add('spin', r, !can);
    const allStopping = spinning && this.reels.every((rl) => rl.state !== 'spin');
    drawBtn(ctx, r, spinning ? '정지!' : '스핀!', { tone: spinning ? 'gold' : 'crimson', size: 24, sub: spinning ? '릴을 하나씩 멈춰요' : this.free ? '무료 한 판' : `${fmt(this.bet)} G`, key: 'Z', disabled: !can || allStopping, hot: this.hits.over(r), pressed: this.hits.pressed(r), pulse: !spinning && can, t: this.clock });
  }
}
