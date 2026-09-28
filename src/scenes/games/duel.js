// 황혼의 결투 — 해 질 녘 마을 어귀에서 총잡이와 3판 2선승 속사 대결.
// '준비…' 뒤 '발사!' 신호에 반응(공격 버튼/화면 탭). 신호 전 발사 = 반칙패. 상위 결투자는 가짜 신호(발톱! 발자국!)로 유혹.
// 총성 순간 슬로 모션 + 탄도 + 섬광. 결투자 5인(격파 시 다음 상대 해금), 캐릭터는 공용 렌더러(drawHero)로 그림.
// 배치: UI px. 땅(GY) = 화면 아래 − 96, 결투자 배율은 화면 높이에 맞춘다 (this.sc). 상대 고르기는 위쪽 정보 패널 안.
// 발사: 결정·공격·점프·보조(Z·X·A 키, 패드 A·X·Y) 또는 화면 누름. 패드 B·Esc 는 '그만두기' 확인 창 (X 키는 결투 중엔 발사).
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { text, FONT } from '../../core/ui.js';
import { clamp, lerp, rand, ease, fmt, TAU, pick } from '../../core/math.js';
import { CHARACTERS } from '../../data/characters.js';
import { drawHero } from '../../render/hero.js';
import { MiniGame, drawBtn, gPanel, goldText, record, vignetteSoft, GOLD, keyHints } from './common.js';
import { glow, rr } from './art.js';

const GUN = (style, element = null) => ({ type: 'gun', style, level: 0, rarity: 0, element });
export const FOES = [
  {
    id: 'jack', name: '떠돌이 총잡이 잭', title: '제1의 결투자', react: 0.46, mult: 1.8, feint: 0, foul: 0.06,
    taunt: '어이, 풋내기. 손 떨리는 거 다 보인다고.', lose: '크윽… 제법이잖아.', win: '다음엔 좀 더 빨리 뽑아 보라고.',
    look: { build: 'normal', skin: '#d8a880', hair: '#7a5a3a', hairStyle: 'short', eyes: '#6a8aa0', outfit: 'gunslinger', coat: 'long', primary: '#7a5a3a', secondary: '#3a2a1a', trim: '#a08050', pants: '#3a3028', boots: '#2a1a10', headgear: 'wide_hat', headColor: '#5a3a20', beard: 'stubble', scarf: { color: '#3a5a8a' }, weapon: GUN(1) },
  },
  {
    id: 'bones', name: '해골 보안관 본즈', title: '제2의 결투자', react: 0.39, mult: 2.2, feint: 0.25, foul: 0.02,
    taunt: '이 마을의 법은 내 총알이다. 딸깍딸깍.', lose: '뼈…뼈마디가 굳었나…', win: '딸깍! 판결 끝.',
    look: { build: 'slim', skin: '#e8e0cc', hair: '#e8e0cc', hairStyle: 'bald', eyes: '#ff3030', eyeGlow: true, outfit: 'gunslinger', coat: 'long', primary: '#2a2a34', secondary: '#14141a', trim: '#c8a040', pants: '#1a1a20', boots: '#0a0a0e', headgear: 'wide_hat', headColor: '#1a1a1a', scarf: { color: '#8a1a1a' }, weapon: GUN(2) },
  },
  {
    id: 'rosa', name: '핏빛 무법자 로사', title: '제3의 결투자', react: 0.33, mult: 2.6, feint: 0.35, foul: 0,
    taunt: '예쁜 목덜미네. 총알 대신 이빨을 박아 줄까?', lose: '어머… 나보다 빠른 남자는 처음이야.', win: '후후, 피 냄새가 좋네.',
    look: { fem: true, build: 'slim', skin: '#f2d8d0', hair: '#8a1020', hairStyle: 'long', eyes: '#ff4060', eyeGlow: true, outfit: 'gunslinger', coat: 'long', primary: '#5a0a18', secondary: '#1a0a10', trim: '#e8c872', pants: '#1a0a10', boots: '#0a0406', headgear: 'hat', headColor: '#1a0a10', scarf: { color: '#1a1a1a', long: true }, weapon: GUN(3, 'fire') },
  },
  {
    id: 'grey', name: '유령 사수 그레이', title: '제4의 결투자', react: 0.28, mult: 3.2, feint: 0.45, foul: 0,
    taunt: '…이미 죽은 몸이다. 두려울 것도 없지.', lose: '…드디어… 쉴 수 있겠군.', win: '…너도 곧 이쪽으로 오겠지.',
    look: { build: 'normal', skin: '#a8b8c8', hair: '#d0d8e0', hairStyle: 'long', eyes: '#8affe8', eyeGlow: true, outfit: 'gunslinger', coat: 'long', primary: '#3a4a5a', secondary: '#1a2430', trim: '#9ab0c0', pants: '#1a2430', boots: '#0a1018', headgear: 'wide_hat', headColor: '#2a3440', aura: { color: '#8affc8', type: 'ice' }, weapon: GUN(4, 'ice') },
  },
  {
    id: 'samiel', name: '마탄의 사수 자미엘', title: '최후의 결투자', react: 0.235, mult: 4, feint: 0.55, foul: 0,
    taunt: '일곱 번째 마탄은… 네 심장을 노린다.', lose: '마탄이… 빗나가다니…!', win: '영혼 한 조각, 잘 받아 가지.',
    look: { build: 'broad', height: 1.08, skin: '#6a1a2a', hair: '#0a0408', hairStyle: 'spiky', eyes: '#ffcc40', eyeGlow: true, outfit: 'gunslinger', coat: 'long', primary: '#1a0a14', secondary: '#5a0a1a', trim: '#e8c060', pants: '#0a0408', boots: '#050204', headgear: 'horns', cape: { color: '#2a0a14', color2: '#a01020', len: 1.1 }, aura: { color: '#b060ff', type: 'dark' }, weapon: GUN(6, 'dark') },
  },
];
const FEINTS = ['발톱!', '발가락!', '발자국!', '발굽!', '발바닥!'];
const SHOT_MOVE = { id: 'duel_shot', anim: 'shoot', dur: 0.2, hit: [0.03, 0.04] };
const SC = 2.25;

function duelist(look, ch, facing) {
  return { cx: 0, bottom: 0, facing, anim: 'idle', animT: 0, look, ch, rig: {}, t: 0, move: null, moveT: 0, vx: 0, vy: 0, onGround: true, stats: { reach: 0 }, charging: 0, muzzleT: 0, npc: true, kx: 0 };
}

export class DuelScene extends MiniGame {
  constructor(g) { super(g, 'duel'); }
  init() {
    const st = this.st;
    const ch = CHARACTERS[st.charId] ?? Object.values(CHARACTERS)[0];
    const look = { ...(ch?.look ?? {}), weapon: GUN(2) };
    this.me = duelist(look, ch, 1);
    this.foeIdx = clamp(st.innGames.duelRank, 0, FOES.length - 1);
    this.makeFoe();
    this.dust = Array.from({ length: 36 }, () => ({ x: Math.random(), y: rand(0.55, 1), v: rand(0.04, 0.14), s: rand(1, 3), ph: rand(0, TAU) }));
    this.weed = { x: -0.2, t: 0, next: rand(3, 7), r: 0 };
    this.ts = 1; this.slowT = 0;
    this.phase = 'ready';
    this.score = [0, 0]; this.round = 0;
    this.sig = null; this.sigT = 0; this.waitT = 0; this.fireT = 0; this.npcAt = 0; this.feintAt = -1; this.feintShown = false;
    this.fouls = 0; this.times = [];
    this.bullet = null; this.flashes = [];
    this.bars = 0; this.banner = null; this.bannerT = 0; this.talk = null; this.talkT = 9;
    this.phaseT = 0;
  }
  makeFoe() {
    const f = FOES[this.foeIdx];
    this.foe = duelist(f.look, null, -1);
    this.talk = null;
  }
  get F() { return FOES[this.foeIdx]; }
  unlocked(i) { return i <= this.st.innGames.duelRank; }
  canLeave() { return this.phase === 'ready' || this.phase === 'result'; }
  onAgain() {
    this.resetStance();
    // 방금 새 결투자를 해금했다면 바로 그 상대를 고른다
    if (this.pendingNext && this.foeIdx + 1 < FOES.length && this.unlocked(this.foeIdx + 1)) { this.foeIdx++; this.makeFoe(); this.say(this.F.taunt); }
    this.pendingNext = false;
  }
  resetStance() {
    for (const p of [this.me, this.foe]) { p.anim = 'idle'; p.animT = 0; p.move = null; p.kx = 0; p.dead = false; }
  }

  startRound() {
    if (!this.takeBet()) return;
    this.resetStance();
    this.score = [0, 0]; this.round = 0; this.fouls = 0; this.times = [];
    this.phase = 'intro'; this.phaseT = 0;
    this.banner = { a: this.F.title, b: this.F.name }; this.bannerT = 0;
    this.say(this.F.taunt);
    audio.sfx('bell', { vol: 0.7 });
  }
  say(s) { this.talk = s; this.talkT = 0; }
  nextRound() {
    this.round++;
    this.resetStance();
    this.phase = 'standoff'; this.phaseT = 0;
    this.sig = { txt: '준비…', col: '#e8dcc8', real: false }; this.sigT = 0;
    this.waitT = rand(1.6, 4.0);
    this.feintAt = Math.random() < this.F.feint ? rand(0.8, this.waitT - 0.4) : -1;
    this.feintShown = false;
    this.foulAt = Math.random() < this.F.foul ? rand(0.9, this.waitT - 0.2) : -1;
    audio.sfx('ready', { vol: 0.6 });
  }
  fireSignal() {
    this.phase = 'draw'; this.phaseT = 0; this.fireT = 0;
    this.sig = { txt: '발사!', col: '#ff3a4a', real: true }; this.sigT = 0;
    this.npcAt = Math.max(0.17, this.F.react + rand(-0.03, 0.06));
    this.flash('#fff2d0', 0.35);
    audio.sfx('bell'); audio.sfx('go', { vol: 0.8 });
  }
  /** 발사 처리: who = 'me'|'foe', foul = 반칙 여부 */
  shoot(who, foul = false) {
    const shooter = who === 'me' ? this.me : this.foe, target = who === 'me' ? this.foe : this.me;
    this.phase = 'shot'; this.phaseT = 0;
    shooter.move = SHOT_MOVE; shooter.moveT = 0;
    const winner = foul ? (who === 'me' ? 1 : 0) : who === 'me' ? 0 : 1;
    this.roundWinner = winner;
    this.score[winner]++;
    const final = this.score[winner] >= 2;
    this.roundFinal = final;
    // 반칙이면 상대가 벌로 쏜다
    if (foul) {
      this.sig = { txt: who === 'me' ? '반칙! 성급했다!' : '상대의 반칙!', col: who === 'me' ? '#ff7a7a' : '#9af09a', real: false }; this.sigT = 0;
      if (who === 'me') { this.fouls++; }
      const avenger = who === 'me' ? this.foe : this.me, victim = who === 'me' ? this.me : this.foe;
      shooter.move = null;
      avenger.move = SHOT_MOVE; avenger.moveT = 0;
      this.fireBullet(avenger, victim, final);
    } else this.fireBullet(shooter, target, final);
    if (who === 'me' && !foul) {
      this.times.push(this.fireT);
      record(this.st, 'duelReact', this.fireT, 'min');
    }
    this.ts = 0.14; this.slowT = 0.95;
    audio.sfx('gun', { vol: 1 }); audio.sfx('thunderclap', { vol: 0.35 });
    this.shake(8, 0.25);
  }
  fireBullet(from, to, final) {
    const hs = this.sc * (from.look.height ?? 1), ht = this.sc * (to.look.height ?? 1);
    const mx = from.cx + from.facing * 38 * hs, my = from.bottom - 77 * hs;
    const tx = to.cx - to.facing * 4, ty = to.bottom - 58 * ht;
    this.bullet = { x0: mx, y0: my, x1: tx, y1: ty, t: 0, dur: 0.09, target: to, final, hit: false };
    this.flashes.push({ x: mx, y: my, t: 0, f: from.facing });
    this.flash('#fff', 0.5);
  }
  onBulletHit(b) {
    const p = b.target;
    b.hit = true;
    p.anim = b.final ? 'death' : 'hurt'; p.animT = 0; p.dead = b.final;
    this.fx.burst('blood', b.x1, b.y1, 20, { speed: 320, angle: b.x1 > b.x0 ? 0 : Math.PI, spread: 0.7 });
    this.fx.burst('hit', b.x1, b.y1, 12, { speed: 500 });
    this.fx.ring(b.x1, b.y1, { color: '#fff2d0', r0: 6, r1: 70, life: 0.25 });
    audio.sfx('hit_heavy');
  }
  endRound() {
    const f = this.F;
    if (this.score[0] >= 2 || this.score[1] >= 2) {
      const win = this.score[0] >= 2;
      const perfect = win && this.score[1] === 0 && this.fouls === 0;
      this.phase = 'done';
      this.say(win ? f.lose : f.win);
      const avg = this.times.length ? this.times.reduce((a, b) => a + b, 0) / this.times.length : 0;
      let sub = win ? `${f.name} 격파! ${this.score[0]} : ${this.score[1]}` : `${this.score[0]} : ${this.score[1]} — ${f.name}의 승리`;
      if (avg) sub += ` · 평균 ${avg.toFixed(3)}초`;
      this.pendingNext = win;
      if (win && this.foeIdx === this.st.innGames.duelRank && this.foeIdx < FOES.length) {
        this.st.innGames.duelRank = Math.min(FOES.length, this.foeIdx + 1);
        if (this.foeIdx + 1 < FOES.length) this.game.toast(`새 결투자 등장: ${FOES[this.foeIdx + 1].name}`, '#ffb070');
        else this.game.toast('황혼의 결투 — 모든 결투자를 꺾었다!', '#ffe070');
      }
      const notional = this.roundFree ? this.bet : this.roundBet;
      // 첫 결투자(잭)는 사람 손이면 거의 늘 2:0 완승이라, 대승리 등급·주문서 보너스는 두 번째 결투자부터 준다
      const bonus = perfect && this.foeIdx > 0;
      this.settle({ win, payout: win ? notional * f.mult : 0, tier: win ? (bonus || f.mult >= 3 ? 'big' : 'win') : 'lose', perfect: bonus, title: win ? (perfect ? '완벽한 승리!' : '결투 승리!') : '결투 패배…', sub, cy: this.GY - 144, delay: 1.0 });
      return;
    }
    this.nextRound();
  }

  /** 발사 입력: 공격/점프/확인 키 또는 화면 누름(손을 뗄 때가 아니라 누르는 순간) */
  /** 결투 중에는 X 키(공격 = 취소)도 발사다 → '그만두기' 창을 열지 않는다 (패드 B·Esc 는 연다) */
  backBlocked() {
    const fight = this.phase === 'intro' || this.phase === 'standoff' || this.phase === 'draw' || this.phase === 'shot';
    return fight && (input.pressed('attack') || input.pressed('jump') || input.pressed('confirm') || input.pressed('sub'));
  }
  /** 결투자 배율 (화면 높이에 맞춤) · 땅 높이 */
  get sc() { return SC * clamp((this.vh - 100) / 440, 0.7, 1); }
  get GY() { return this.vh - 96; }
  pressedFire() {
    const p = input.pointer;
    if (p.justDown && !(p.x < 130 && p.y < 60)) return true;
    return input.pressed('attack') || input.pressed('jump') || input.pressed('confirm') || input.pressed('sub');
  }

  animate(dt) {
    const rdt = dt;
    // 슬로 모션
    if (this.slowT > 0) { this.slowT -= rdt; if (this.slowT <= 0) this.ts = 1; else this.ts = lerp(this.ts, 0.14, 0.2); }
    const gdt = dt * this.ts;
    this.phaseT += rdt; this.sigT += rdt; this.bannerT += rdt; this.talkT += rdt;
    for (const p of [this.me, this.foe]) {
      p.t += gdt; p.animT += gdt;
      if (p.move) p.moveT = Math.min(p.moveT + gdt, 0.14);
      if (p.anim === 'hurt' || p.anim === 'death') p.kx += (p.dead ? 60 : 30) * gdt * -p.facing * Math.max(0, 1 - p.animT * 2);
    }
    for (const f of this.flashes) f.t += gdt;
    this.flashes = this.flashes.filter((f) => f.t < 0.25);
    if (this.bullet) {
      const b = this.bullet;
      b.t += gdt;
      if (!b.hit && b.t >= b.dur) this.onBulletHit(b);
      if (b.t > b.dur + 0.3) this.bullet = null;
    }
    // 먼지·회전초
    for (const d of this.dust) { d.x += d.v * rdt * this.ts * 0.6; d.ph += rdt; if (d.x > 1.05) { d.x = -0.05; d.y = rand(0.55, 1); } }
    const w = this.weed;
    w.next -= rdt;
    if (w.next <= 0 && w.x < -0.1) { w.x = -0.15; w.next = rand(6, 12); }
    if (w.x > -0.18 && w.x < 1.2) { w.x += 0.09 * rdt * this.ts; w.r += 3.2 * rdt * this.ts; w.t += rdt * this.ts; }
    // 레터박스
    const cine = this.phase === 'standoff' || this.phase === 'draw' || this.phase === 'shot';
    this.bars += ((cine ? 1 : 0) - this.bars) * Math.min(1, rdt * 5);
  }
  step(dt, tap) {
    const rdt = dt;
    if (this.phase === 'ready') {
      if (tap && tap.startsWith('foe:')) {
        const i = +tap.slice(4);
        if (this.unlocked(i)) { if (i !== this.foeIdx) { this.foeIdx = i; this.makeFoe(); audio.sfx('menu_move'); this.say(this.F.taunt); } }
        else { this.game.toast('앞의 결투자를 먼저 꺾어야 해요.', '#e8c872'); audio.sfx('menu_cancel'); }
      }
      if (input.pressed('up')) this.cycleFoe(-1);
      if (input.pressed('down')) this.cycleFoe(1);
      if (tap === 'duel' || input.pressed('confirm')) this.startRound();
      return;
    }
    if (this.phase === 'intro') {
      if (this.phaseT > 2.0 || (this.phaseT > 0.6 && this.pressedFire())) this.nextRound();
      return;
    }
    if (this.phase === 'standoff') {
      if (this.pressedFire()) { this.shoot('me', true); return; }
      if (this.foulAt > 0 && this.phaseT >= this.foulAt) { this.shoot('foe', true); return; }
      if (this.feintAt > 0 && !this.feintShown && this.phaseT >= this.feintAt) {
        this.feintShown = true;
        this.sig = { txt: pick(FEINTS), col: '#e8dcc8', real: false, feint: true }; this.sigT = 0;
        audio.sfx('clang', { vol: 0.6 });
      }
      if (this.phaseT >= this.waitT) this.fireSignal();
      return;
    }
    if (this.phase === 'draw') {
      this.fireT += rdt;
      if (this.pressedFire()) { this.shoot('me'); return; }
      if (this.fireT >= this.npcAt) { this.shoot('foe'); return; }
      return;
    }
    if (this.phase === 'shot') {
      if (this.phaseT > 1.9 && !this.bullet) this.endRound();
    }
  }
  cycleFoe(d) {
    let i = this.foeIdx + d;
    if (i < 0 || i >= FOES.length) return;
    if (!this.unlocked(i)) { audio.sfx('menu_cancel'); return; }
    this.foeIdx = i; this.makeFoe(); audio.sfx('menu_move'); this.say(this.F.taunt);
  }

  // ── 그리기 ──
  draw(ctx) {
    const vw = this.vw, vh = this.vh, t = this.clock;
    const GY = this.GY, sc = this.sc;
    this.drawSky(ctx, vw, vh, t, GY);
    // 결투자
    const gap = clamp(vw * 0.3, 200, 300);
    this.me.cx = vw / 2 - gap + this.me.kx; this.me.bottom = GY;
    this.foe.cx = vw / 2 + gap + this.foe.kx; this.foe.bottom = GY;
    for (const p of [this.me, this.foe]) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(p.cx, GY + 2, 46, 9, 0, 0, TAU); ctx.fill();
      // 긴 그림자 (석양 반대쪽)
      ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.moveTo(p.cx - 16, GY); ctx.lineTo(p.cx + 16, GY); ctx.lineTo(p.cx + (p.cx < vw / 2 ? -150 : 150) + 20, GY + 60); ctx.lineTo(p.cx + (p.cx < vw / 2 ? -150 : 150) - 20, GY + 60); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (const p of [this.me, this.foe]) {
      // 역광 테두리 느낌: 뒤에 따뜻한 광원
      glow(ctx, p.cx, p.bottom - 90, 120, '#ff7a2a', 0.18);
      try { drawHero(ctx, p, null, { scale: sc }); } catch (e) { if (!this._heroErr) { this._heroErr = true; console.warn('[duel] drawHero', e); } }
    }
    // 총구 섬광
    for (const f of this.flashes) {
      const k = 1 - f.t / 0.25;
      glow(ctx, f.x, f.y, 70 * k + 20, '#fff2b0', k);
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.f, 1); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
      ctx.fillStyle = '#ffe070';
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(46 * k + 10, 0); ctx.lineTo(0, 8); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 탄도
    if (this.bullet) {
      const b = this.bullet, u = clamp(b.t / b.dur, 0, 1);
      const hx = lerp(b.x0, b.x1, u), hy = lerp(b.y0, b.y1, u);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const tailU = Math.max(0, u - 0.35);
      const g = ctx.createLinearGradient(lerp(b.x0, b.x1, tailU), 0, hx, 0);
      g.addColorStop(0, 'rgba(255,200,120,0)'); g.addColorStop(1, 'rgba(255,240,200,0.95)');
      ctx.strokeStyle = g; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lerp(b.x0, b.x1, tailU), lerp(b.y0, b.y1, tailU)); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.restore();
      if (!b.hit) glow(ctx, hx, hy, 18, '#fff2b0', 1);
    }
    // 먼지
    for (const d of this.dust) glow(ctx, d.x * vw, d.y * vh + Math.sin(d.ph) * 4, d.s * 3, '#e8b080', 0.18);
    this.drawWeed(ctx, vw, GY);
    vignetteSoft(ctx, vw, vh, 0.6);
    // 슬로 모션 색감
    if (this.ts < 0.9) { ctx.fillStyle = `rgba(40,10,20,${0.25 * (1 - this.ts)})`; ctx.fillRect(0, 0, vw, vh); }
    // 레터박스
    if (this.bars > 0.01) {
      const bh = 54 * this.bars;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, bh); ctx.fillRect(0, vh - bh, vw, bh);
    }
    this.drawScore(ctx, vw);
    this.drawSignal(ctx, vw, vh);
    this.drawBanner(ctx, vw);
    if (this.phase === 'ready') this.drawReadyUI(ctx);
    else if (this.phase === 'standoff' || this.phase === 'draw') {
      if (input.touchMode) text(ctx, "'발사!'가 뜨면 화면을 터치!", vw / 2, vh - 20, { size: 13, align: 'center', weight: 700, color: '#c8b490', ow: 3 });
      else keyHints(ctx, [[['confirm', 'attack'], "'발사!'가 뜨면 발사 (화면 클릭도 돼요)"]], vw / 2, vh - 20, { align: 'center', size: 13 });
    }
    this.drawTalk(ctx);
  }
  drawSky(ctx, vw, vh, t, GY) {
    const img = assets.get('bg/hub');
    if (img) {
      const s = Math.max(vw / img.width, vh / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, (vw - dw) / 2, (vh - dh) * 0.55, dw, dh);
    } else { ctx.fillStyle = '#1a0810'; ctx.fillRect(0, 0, vw, vh); }
    // 황혼 색조
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, 'rgba(30,10,50,0.55)'); g.addColorStop(0.45, 'rgba(120,30,40,0.35)'); g.addColorStop(0.7, 'rgba(255,110,40,0.25)'); g.addColorStop(1, 'rgba(20,6,6,0.7)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    // 지는 해
    const sx = vw / 2, sy = GY - 70, sr = 92;
    glow(ctx, sx, sy, 360, '#ff6a2a', 0.45);
    glow(ctx, sx, sy, 180, '#ffb060', 0.5);
    const sg = ctx.createRadialGradient(sx, sy - 20, 10, sx, sy, sr);
    sg.addColorStop(0, '#fff0c0'); sg.addColorStop(0.5, '#ffb050'); sg.addColorStop(1, '#e0402a');
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, vw, GY - 18); ctx.clip();
    ctx.globalAlpha = 0.92; ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#8a1a2a';
    for (let i = 0; i < 4; i++) ctx.fillRect(sx - sr, sy + 10 + i * 18, sr * 2, 4 + i * 1.5);
    ctx.restore();
    // 먼 언덕 실루엣
    ctx.fillStyle = '#1a0810';
    ctx.beginPath(); ctx.moveTo(0, GY - 18);
    for (let x = 0; x <= vw; x += 40) ctx.lineTo(x, GY - 26 - Math.sin(x * 0.013) * 10 - Math.sin(x * 0.041 + 1) * 5);
    ctx.lineTo(vw, GY); ctx.lineTo(0, GY); ctx.closePath(); ctx.fill();
    // 묘비·십자가 실루엣
    ctx.fillStyle = '#12060a';
    for (const [fx, h] of [[0.08, 34], [0.14, 22], [0.88, 30], [0.93, 40], [0.62, 18]]) {
      const x = fx * vw;
      ctx.fillRect(x - 3, GY - 18 - h, 6, h); ctx.fillRect(x - 11, GY - 18 - h + 9, 22, 5);
    }
    // 땅
    const gg = ctx.createLinearGradient(0, GY - 20, 0, vh);
    gg.addColorStop(0, '#3a1a14'); gg.addColorStop(0.25, '#241008'); gg.addColorStop(1, '#0a0404');
    ctx.fillStyle = gg; ctx.fillRect(0, GY - 20, vw, vh - GY + 20);
    ctx.fillStyle = 'rgba(255,140,60,0.22)'; ctx.fillRect(0, GY - 20, vw, 2);
    ctx.save(); ctx.globalAlpha = 0.14; ctx.strokeStyle = '#e8a070'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) { const y = GY - 8 + i * 8; ctx.moveTo(0, y); ctx.lineTo(vw, y + (i % 2 ? 3 : -2)); }
    ctx.stroke(); ctx.restore();
  }
  drawWeed(ctx, vw, GY) {
    const w = this.weed;
    if (w.x < -0.18 || w.x > 1.2) return;
    const x = w.x * vw, y = GY - 18 - Math.abs(Math.sin(w.t * 3.2)) * 16;
    ctx.save(); ctx.translate(x, y); ctx.rotate(w.r);
    ctx.strokeStyle = '#6a4424'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 18 - i, 14 - i * 0.6, i * 0.9, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  drawScore(ctx, vw) {
    if (this.phase === 'ready') return;
    const y = 100;
    for (let side = 0; side < 2; side++) {
      const cx = side === 0 ? vw / 2 - 80 : vw / 2 + 80;
      for (let i = 0; i < 2; i++) {
        const x = cx + (side === 0 ? -i * 26 : i * 26), on = this.score[side] > i;
        ctx.fillStyle = on ? (side === 0 ? '#ffd060' : '#ff4a5a') : 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
        ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.stroke();
        if (on) glow(ctx, x, y, 20, side === 0 ? '#ffd060' : '#ff4a5a', 0.5);
      }
    }
    text(ctx, `ROUND ${Math.max(1, this.round)}`, vw / 2, y + 5, { size: 14, align: 'center', weight: 900, family: FONT.num, color: '#e8dcc8', ow: 3 });
    text(ctx, '당신', vw / 2 - 150, y + 5, { size: 12, align: 'right', weight: 800, color: '#ffe7a0', ow: 3 });
    text(ctx, this.F.name.split(' ').pop(), vw / 2 + 150, y + 5, { size: 12, weight: 800, color: '#ff9a9a', ow: 3 });
  }
  drawSignal(ctx, vw, vh) {
    const s = this.sig;
    if (!s || this.phase === 'ready' || this.phase === 'intro' || this.phase === 'done' || this.phase === 'result') return;
    if (s.feint && this.sigT > 0.7) { return; }
    const k = ease.outBack(clamp(this.sigT / 0.18, 0, 1));
    const cy = vh * 0.36;
    ctx.save(); ctx.translate(vw / 2, cy);
    if (s.real) {
      const pulse = 1 + 0.06 * Math.sin(this.sigT * 30);
      ctx.scale(k * 1.25 * pulse, k * 1.25 * pulse);
      glow(ctx, 0, -20, 180, '#ff2040', 0.5);
      goldText(ctx, s.txt, 0, 18, 72, { family: FONT.title, weight: 800, glowCol: '#ff2040', top: '#ffffff', mid: '#ff4a5a', bot: '#8a0a1a', ow: 7 });
    } else {
      ctx.scale(k, k);
      const breathe = s.txt === '준비…' ? 0.75 + 0.25 * Math.sin(this.sigT * 3) : 1;
      ctx.globalAlpha = breathe;
      text(ctx, s.txt, 0, 14, { size: s.txt === '준비…' ? 44 : 50, align: 'center', weight: 900, family: FONT.title, color: s.col, ow: 6 });
    }
    ctx.restore();
    if (this.phase === 'shot' && this.times.length && this.roundWinner === 0 && !this.sig.txt.includes('반칙')) {
      text(ctx, `${this.times[this.times.length - 1].toFixed(3)}초!`, vw / 2, cy + 58, { size: 22, align: 'center', weight: 900, family: FONT.num, color: '#9af09a', ow: 4 });
    }
  }
  drawBanner(ctx, vw) {
    if (this.phase !== 'intro') return;
    const k = ease.outCubic(clamp(this.bannerT / 0.35, 0, 1)) * clamp((2.0 - this.bannerT) / 0.3, 0, 1);
    const y = Math.round(this.vh * 0.315);
    ctx.save(); ctx.globalAlpha = k;
    const g = ctx.createLinearGradient(0, 0, vw, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(10,2,6,0.85)'); g.addColorStop(0.7, 'rgba(10,2,6,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 44, vw, 78);
    ctx.fillStyle = 'rgba(232,200,114,0.6)'; ctx.fillRect(vw * 0.2, y - 44, vw * 0.6, 1.5); ctx.fillRect(vw * 0.2, y + 33, vw * 0.6, 1.5);
    text(ctx, this.banner?.a ?? '', vw / 2 + (1 - k) * 60, y - 16, { size: 14, align: 'center', weight: 800, color: '#ff9a6a', ow: 3 });
    goldText(ctx, this.banner?.b ?? '', vw / 2 - (1 - k) * 60, y + 20, 34, { glowCol: '#ff4a2a' });
    ctx.restore();
  }
  drawTalk(ctx) {
    if (!this.talk || this.talkT > 3.6) return;
    const a = clamp(this.talkT / 0.2, 0, 1) * clamp((3.6 - this.talkT) / 0.4, 0, 1);
    const p = this.foe;
    ctx.save(); ctx.globalAlpha = a;
    ctx.font = `700 14px ${FONT.body}`;
    const w = Math.min(340, ctx.measureText(this.talk).width + 28);
    const x = Math.min(this.vw - w - 12, p.cx - w / 2), y = Math.max(64, p.bottom - 82 * this.sc - 44);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(ctx, x + 2, y + 3, w, 32, 10); ctx.fill();
    ctx.fillStyle = '#f4e8d0'; rr(ctx, x, y, w, 32, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(p.cx - 8, y + 31); ctx.lineTo(p.cx, y + 42); ctx.lineTo(p.cx + 8, y + 31); ctx.fill();
    ctx.strokeStyle = '#6a4a24'; ctx.lineWidth = 1.5; rr(ctx, x, y, w, 32, 10); ctx.stroke();
    text(ctx, this.talk, x + 14, y + 21, { size: 14, weight: 700, color: '#2a1008', ow: 0, maxWidth: w - 24 });
    ctx.restore();
  }
  drawReadyUI(ctx) {
    const vw = this.vw, vh = this.vh, f = this.F, t = this.clock;
    const big = input.touchMode || this.tapMin > 44;
    // 위: 상대 정보 + 결투자 고르기 (5칸)
    const n = FOES.length, fs = 50, fg = big ? 14 : 8, rowW = n * (fs + fg) - fg;
    const iw = Math.max(330, rowW + 40), ix = vw / 2 - iw / 2, iy = 62, ih = 158;
    gPanel(ctx, ix, iy, iw, ih, { a: 0.82 });
    text(ctx, f.title, vw / 2, iy + 22, { size: 12, align: 'center', weight: 800, color: '#ff9a6a', ow: 2 });
    goldText(ctx, f.name, vw / 2, iy + 48, 22, { glowCol: '#ff5a2a', maxWidth: iw - 24 });
    const stars = clamp(Math.round((0.5 - f.react) / 0.055) + 1, 1, 5);
    text(ctx, `속사 ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}   배당 ×${f.mult}${f.feint ? '   가짜 신호 주의' : ''}`, vw / 2, iy + 68, { size: 12, align: 'center', weight: 700, color: '#e8d8b0', ow: 2, maxWidth: iw - 20 });
    const rx0 = vw / 2 - rowW / 2, ry = iy + 80;
    // 초상은 칸마다 작은 캔버스에 (고정된 서 있는 자세로) 구워 두고, 30 프레임에 한 칸씩만 다시 굽는다 (늦게 도착한 그림 반영용).
    // drawHero 는 한 번에 그라데이션 수십 개라 5칸을 매 프레임 그리면 결투자 둘과 합쳐 drawHero 7번 — MASTER_PLAN §5.2 medium 6 / low 3 초과
    this._thumbTick = (this._thumbTick ?? -1) + 1;
    this._thumbTurn = this._thumbTick % 30 === 0 ? Math.floor(this._thumbTick / 30) % n : -1;
    for (let i = 0; i < n; i++) {
      const fx = rx0 + i * (fs + fg), fy = ry;
      // 탭 영역: 칸 사이를 넓혀 손가락 크기(약 44 CSS px) 이상 (그림은 그대로)
      const r = big ? this.hits.rect('foe:' + i, fx - fg / 2, fy - 4, fs + fg, fs + 24) : this.hits.rect('foe:' + i, fx, fy, fs, fs + 18);
      this.hits.add('foe:' + i, r, false, 'icon');
      const sel = i === this.foeIdx, un = this.unlocked(i);
      ctx.save();
      rr(ctx, fx, fy, fs, fs, 8);
      ctx.fillStyle = un ? '#2a1418' : '#0e080a'; ctx.fill();
      ctx.lineWidth = sel ? 2.5 : 1.2; ctx.strokeStyle = sel ? '#ffe7a0' : '#6a5030'; ctx.stroke();
      ctx.clip();
      if (un) {
        const th = this.miniThumb(ctx, i, fs, t);
        if (th) ctx.drawImage(th, fx, fy, fs, fs);
        else {
          const p = this.miniDuelist(i); p.cx = fx + fs / 2; p.bottom = fy + fs + 58; p.t = t; p.rig = null;
          try { drawHero(ctx, p, null, { scale: 0.95 }); } catch { /* 무시 */ }
        }
      } else {
        text(ctx, '?', fx + fs / 2, fy + fs / 2 + 10, { size: 28, align: 'center', weight: 900, family: FONT.num, color: '#4a3a30', ow: 0 });
      }
      ctx.restore();
      text(ctx, un ? `×${FOES[i].mult}` : '잠김', fx + fs / 2, fy + fs + 14, { size: 11, align: 'center', weight: 800, color: un ? (sel ? '#ffe7a0' : '#c8b490') : '#6a5a4a', ow: 2 });
    }
    // 아래: 판돈 + 결투 신청
    const btnW = 150, bh = this.bh(58);
    const chipsW = Math.min(this.betBarW(21), vw - 64 - btnW - 24);
    const pw = chipsW + btnW + 48, ph = 88, px = vw / 2 - pw / 2, py = vh - 8 - ph;
    gPanel(ctx, px, py, pw, ph, { a: 0.85, r: 14 });
    this.drawBetBar(ctx, px + 16 + chipsW / 2, py + 52, { r: 21, label: true, maxW: chipsW });
    const br = this.hits.rect('duel', px + pw - btnW - 16, py + (ph - bh) / 2, btnW, bh);
    const can = this.free || this.st.gold >= this.bet;
    this.hits.add('duel', br, !can);
    drawBtn(ctx, br, '결투 신청!', { tone: 'crimson', size: 19, sub: this.free ? '무료 한 판' : `${fmt(this.bet)} G`, key: 'confirm', disabled: !can, hot: this.hits.over(br), pressed: this.hits.pressed(br), pulse: can, t });
    keyHints(ctx, [['dpadV', '상대 선택']], px + pw - 14, py - 9, { align: 'right', size: 12 });
  }
  miniDuelist(i) { return (this.mini ??= FOES.map((F) => duelist(F.look, null, 1)))[i]; }
  /**
   * 결투자 i 의 초상 캔버스 (fs × fs UI px, 지금 화면 배율의 기기 픽셀). 처음 한 번 + 차례(_thumbTurn)가 올 때만 drawHero 로 다시 굽는다
   * → 자세는 t = 0 으로 고정 (다시 구워도 같은 그림), 늦게 도착한 영웅 그림은 몇 초 안에 반영된다. 캔버스를 못 만들면 null (직접 그린다)
   */
  miniThumb(ctx, i, fs, t) {
    let k = 1;
    try { const m = ctx.getTransform(); k = Math.hypot(m.a, m.b) || 1; } catch { k = 1; }
    k = clamp(k, 0.5, 4);
    const px = Math.max(8, Math.ceil(fs * k));
    const T = this._thumbs ??= [];
    let e = T[i];
    if (!e || e.px !== px) {
      let cv = null;
      try { if (typeof document !== 'undefined') cv = Object.assign(document.createElement('canvas'), { width: px, height: px }); } catch { cv = null; }
      const x = cv?.getContext('2d');
      if (!x) return null;
      e = T[i] = { cv, x, px, drawn: false };
    }
    if (!e.drawn || this._thumbTurn === i) {
      const x = e.x, s = px / fs;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, px, px);
      x.setTransform(s, 0, 0, s, 0, 0);
      const p = this.miniDuelist(i); p.cx = fs / 2; p.bottom = fs + 58; p.t = 0; p.animT = 0; p.rig = null;
      try { drawHero(x, p, null, { scale: 0.95 }); } catch { /* 무시 */ }
      e.drawn = true;
    }
    return e.cv;
  }
}
