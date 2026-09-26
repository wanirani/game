// 3장 보스: 둘라한 — 목 없는 흑기사 (유령마 기승)
// 기승 패턴: 창 돌격(경기장 횡단, 점프로 회피) / 불타는 머리 투척(유도) / 앞발 짓밟기(지면 충격파) / 창 찌르기 / (1페이즈~) 지옥불 행렬
// 3페이즈(0.3): 유령마가 불꽃으로 흩어지며 하마 → 도보 패턴: 연속 찌르기 돌진 / 도약 내려찍기 / 유령마 환영 돌격 / 머리 3분열 투척
import { ABoss, beginDraw, endDraw, C, rg, lg, glow, ink, rim, sheen, taper, eye, shadow, hash, opt, PI, OUT, RIM, groundWave, erupt } from './a_common.js';
import { explode } from '../projectiles.js';
import { rand, clamp, lerp, TAU, angleTo, rgba, ease } from '../../core/math.js';
import { audio } from '../../core/audio.js';

const STEEL = '#2a2c36', STEEL2 = '#5a5e70', GOLD = '#c8a048', GHOST = '#cfdcff', GHOST2 = '#7a8cc8', BFIRE = '#8ab8ff', OFIRE = '#ff8a2a';
const _Q = new Float32Array(16);

export class Dullahan extends ABoss {
  setup() {
    this.mounted = true;
    this.gait = 0; this.rear = 0; this.lanceA = -1.0; this.lanceX = 0; this.skullOut = 0; this.skullUp = 0; this.lean = 0; this.fury = 0;
    this.gT = 0; this.capeT = 0; this.horseFade = 0;
  }
  get S() { return this.mounted ? 1.3 : 1.2; }
  hurtboxes() {
    const S = this.S;
    if (this.mounted) return [
      { x: this.cx - 34 * S, y: this.bottom - 180 * S, w: 64 * S, h: 84 * S },   // 기사 몸통 (주 판정)
      { x: this.x + 14, y: this.bottom - 118 * S, w: this.w - 28, h: 54 * S },  // 말 몸통
    ];
    return [{ x: this.x + 10, y: this.y + 4, w: this.w - 20, h: this.h - 6 }];
  }
  /** 플레이어 공격 판정: 기승 중에는 기사+말 몸통 전체 (다리 제외) */
  hurtbox() {
    if (!this.mounted) return this.hurtboxes()[0];
    const S = this.S;
    return { x: this.x + 14, y: this.bottom - 180 * S, w: this.w - 28, h: 116 * S };
  }
  onIntro() { audio.sfx('boss_roar', { pitch: 0.7 }); this.rear = 0.6; this.skullUp = 1; }
  moves() {
    const ph = this.phase;
    if (this.mounted) return [
      ['charge', 3], ['skull', this.skullOut ? 0 : 2.2], ['stomp', 2.2], ['thrust', 1.5], ['hellfire', ph >= 1 ? 2 : 0],
    ];
    return [['lunge', 2.6], ['leap', 2.4], ['phantom', 2], ['skull', this.skullOut ? 0 : 2.2], ['hellfire', 1.5]];
  }
  idleMove(dt, world, p) {
    const A = this.A, dx = p.cx - this.cx, want = this.mounted ? 330 : 190;
    this.facePlayer();
    let v = 0;
    if (Math.abs(dx) > want + 60) v = Math.sign(dx) * (this.mounted ? 150 : 110);
    else if (Math.abs(dx) < want - 80) v = -Math.sign(dx) * (this.mounted ? 120 : 90);
    if ((v < 0 && this.x < A.x0 + 30) || (v > 0 && this.x + this.w > A.x1 - 30)) v = 0;
    this.vx = lerp(this.vx, v, Math.min(1, dt * 4));
    this.relax(dt);
  }
  relax(dt) {
    const k = Math.min(1, dt * 4);
    this.rear = lerp(this.rear, 0, k); this.lanceA = lerp(this.lanceA, this.mounted ? -1.0 : -0.4, k); this.lanceX = lerp(this.lanceX, 0, k);
    this.skullUp = lerp(this.skullUp, this.skullOut ? 0 : 0.5, k); this.lean = lerp(this.lean, 0, k);
  }
  think(dt, world) {
    super.think(dt, world);
    this.gait += dt * (2 + Math.abs(this.vx) / 55);
    this.capeT += dt * (1 + Math.abs(this.vx) / 300);
    this.fury = lerp(this.fury, this.phase / 2, Math.min(1, dt * 2));
    if (this.horseFade > 0) this.horseFade -= dt;
    if (this.mounted && Math.abs(this.vx) > 300 && Math.random() < 0.6) this.fx.emit('dust', this.cx - this.facing * 50, this.floorY - 4, { speed: 60, angle: -PI / 2 - this.facing * 0.8 });
    if (Math.random() < dt * 14) { const n = this.neck(); this.fx.emit('soul', n.x + rand(-5, 5), n.y - 10, { speed: 50, angle: -PI / 2, spread: 0.4, color: BFIRE }); }
  }
  /** 로컬 → 월드 */
  W(lx, ly) { const S = this.S; return { x: this.cx + this.facing * lx * S, y: this.bottom + ly * S }; }
  neck() { return this.mounted ? this.W(8, -170) : this.W(2, -128); }
  skullHand() { return this.mounted ? this.W(-14, -176 - this.skullUp * 20) : this.W(-12, -110 - this.skullUp * 34); }
  lanceTip() { const b = this.mounted ? { x: 34, y: -128 } : { x: 24, y: -88 }; const L = 170 + this.lanceX; return this.W(b.x + Math.cos(this.lanceA) * L, b.y + Math.sin(this.lanceA) * L); }

  // ── 창 돌격: 반대편 끝으로 물러났다가 경기장을 가로질러 돌진 ──
  s_charge(dt, world, p) {
    const A = this.A;
    if (this.at(0)) { this.cdir = p.cx < this.cx ? -1 : 1; this.cstart = this.cdir < 0 ? A.x1 - this.w / 2 - 20 : A.x0 + this.w / 2 + 20; audio.sfx('boss_roar', { pitch: 1.4, vol: 0.5 }); }
    const W0 = 1.0, W1 = 1.65;
    if (this.stateT < W0) {
      // 뒤로 빠짐
      const d = this.cstart - this.cx;
      this.facing = Math.sign(d) || this.facing;
      this.vx = Math.abs(d) > 20 ? Math.sign(d) * 380 : 0;
      if (Math.abs(d) <= 20) this.facing = this.cdir;
      return;
    }
    if (this.stateT < W1) {
      this.vx = 0; this.facing = this.cdir;
      const k = (this.stateT - W0) / (W1 - W0);
      this.rear = Math.sin(k * PI) * 0.45; this.lanceA = lerp(this.lanceA, -0.05, Math.min(1, dt * 8)); this.lean = lerp(this.lean, 0.25, dt * 6);
      if (this.at(W0)) {
        this.warn({ type: 'band', x0: A.x0, x1: A.x1, y0: A.floor - 165, y1: A.floor, life: W1 - W0 + 0.2, color: '#6aa0ff', dir: this.cdir });
        this.warnMark(this.cx, this.bottom - 230, W1 - W0);
        audio.sfx('warning', { vol: 0.5, pitch: 1.2 });
      }
      if (this.at(W1 - 0.25)) { const tp = this.lanceTip(); this.fx.flash(tp.x, tp.y, { color: '#ffffff', size: 70, life: 0.2 }); audio.sfx('charge_ready', { pitch: 0.8 }); }
      return;
    }
    const sp = (880 + this.phase * 120 + (this.inferno ? 120 : 0)) * (this.mounted ? 1 : 0.7);
    this.vx = this.cdir * sp; this.facing = this.cdir; this.rear = 0; this.lean = 0.25;
    if (this.at(W1)) { audio.sfx('dash', { pitch: 0.6 }); audio.sfx('boss_roar', { pitch: 1.8, vol: 0.4 }); this.shake(5, 0.3); }
    const tp = this.lanceTip();
    this.strikeRect({ x: Math.min(tp.x, this.cx + this.cdir * 40), y: tp.y - 14, w: Math.abs(tp.x - this.cx - this.cdir * 40), h: 28 }, 1.3, { kb: [520, -420] });
    this.strikeRect({ x: this.x + 10, y: this.bottom - 150, w: this.w - 20, h: 150 }, 1.0, { kb: [480, -460] });
    this.gT -= dt;
    if (this.gT <= 0) { this.gT = 0.05; this.afterimage(); }
    if (this.phase >= 1 && this.every(W1, 0.12, 40) >= 0) erupt(this, this.cx - this.cdir * 60, { delay: 0.05, life: 1.1, w: 44, h: 70, color: BFIRE, style: 'soul', burst: 'soul', mv: 0.6, element: 'fire', sfx: null, shake: 0 });
    const hitEdge = this.cdir > 0 ? this.x + this.w >= A.x1 - 6 : this.x <= A.x0 + 6;
    if (hitEdge || this.stateT > W1 + 2.5) {
      this.vx = 0;
      this.impact(this.cx + this.cdir * 80, this.floorY, 9, 0.04, '#9ac0ff');
      audio.sfx('hit_heavy', { pitch: 0.7 });
      this.rest(1.0);
    }
  }
  afterimage() {
    const s = { x: this.cx, b: this.bottom, f: this.facing, gait: this.gait, rear: this.rear, lanceA: this.lanceA, lean: this.lean };
    this.fx.ghost((ctx, a) => {
      const keep = [this.gait, this.rear, this.lanceA, this.lean];
      this.gait = s.gait; this.rear = s.rear; this.lanceA = s.lanceA; this.lean = s.lean;
      ctx.save(); ctx.globalAlpha = a * 0.5; ctx.translate(s.x, s.b); ctx.scale(s.f * this.S, this.S);
      this.drawFigure(ctx, true);
      ctx.restore();
      [this.gait, this.rear, this.lanceA, this.lean] = keep;
    }, 0.25, 'back');
  }

  // ── 불타는 머리 투척 (유도) ──
  s_skull(dt, world, p) {
    const W = 0.7, n = this.mounted ? (this.phase >= 1 ? 2 : 1) : 3;
    this.vx *= 0.85; this.facePlayer();
    if (this.at(0)) { this.warnMark(this.cx, this.bottom - (this.mounted ? 240 : 190), W); audio.sfx('fire', { pitch: 0.6 }); }
    if (this.stateT < W) {
      this.skullUp = lerp(this.skullUp, 1.2, Math.min(1, dt * 6));
      const h = this.skullHand();
      if (Math.random() < 0.8) this.fx.emit('fire', h.x + rand(-8, 8), h.y - 8, { speed: 60, angle: -PI / 2 });
      return;
    }
    if (this.at(W)) {
      const h = this.skullHand();
      const a = angleTo(h.x, h.y, p.cx, p.cy - 20);
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.5;
        this.skullOut++;
        this.shoot({
          x: h.x, y: h.y, vx: Math.cos(aa) * 300, vy: Math.sin(aa) * 300, w: 26, h: 26, render: drawFlameSkull, color: OFIRE,
          behavior: 'homing', homingTurn: n > 1 ? 1.3 : 1.9, homingDelay: 0.25, life: 3.4, collideWalls: false, trail: 'fire', trailRate: 0.03,
          light: { r: 90, color: OFIRE, i: 0.9 }, attack: { mv: 1.0, element: 'fire', type: 'mag', kb: [320, -360] },
          onExpire: (pr, w) => {
            this.skullOut = Math.max(0, this.skullOut - 1);
            if (this.dying > 0 || this.dead) return;
            explode(w, pr.cx, pr.cy, { r: 46, team: 'enemy', color: OFIRE, attack: { owner: this, stats: this.stats, mv: 0.7, element: 'fire', type: 'mag' }, sfx: 'fire' });
            if (!this.skullOut) { const hh = this.skullHand(); w.fx.burst('fire', hh.x, hh.y, 12, { speed: 120 }); }
          },
        });
      }
      audio.sfx('fire'); audio.sfx('whip', { pitch: 0.6 });
      this.skullUp = 0;
    }
    if (this.stateT > W + 0.6) this.rest(0.9);
  }

  // ── 앞발 짓밟기: 뒷발로 서서 앞발을 내리찍는다 ──
  s_stomp(dt, world, p) {
    const W = 0.75, n = this.phase >= 1 || this.inferno ? 2 : 1;
    this.vx *= 0.8; this.facePlayer();
    if (this.at(0)) { this.warnMark(this.cx, this.bottom - 240, W); audio.sfx('boss_roar', { pitch: 1.6, vol: 0.7 }); }
    for (let i = 0; i < n; i++) {
      const t0 = i * 1.05;
      const u = this.stateT - t0;
      if (u >= 0 && u < W) {
        this.rear = ease.outCubic(clamp(u / (W * 0.8), 0, 1));
        if (u > W * 0.3) { const f = this.W(60, 0); if (this.every(t0 + 0.2, 0.1, 5) >= 0) this.warn({ type: 'circle', px: f.x, py: this.floorY, r: 70, life: W - (u), color: '#6aa0ff' }); }
      }
      if (u >= W && u < W + 0.12) this.rear = lerp(this.rear, -0.12, Math.min(1, dt * 30));
      if (this.at(t0 + W)) {
        const f = this.W(70, 0);
        this.impact(f.x, this.floorY, 13, 0.06, '#9ac0ff');
        audio.sfx('hit_heavy', { pitch: 0.5 }); audio.sfx('explode', { pitch: 0.7, vol: 0.6 });
        this.strikeRect({ x: f.x - 70, y: this.floorY - 70, w: 140, h: 70 }, 1.2);
        const sp = 480 + this.phase * 50;
        groundWave(this, f.x - 20, -1, { speed: sp, color: BFIRE, color2: '#e8f0ff', style: 'soul', mv: 0.9, element: 'dark' });
        groundWave(this, f.x + 20, 1, { speed: sp, color: BFIRE, color2: '#e8f0ff', style: 'soul', mv: 0.9, element: 'dark' });
      }
    }
    if (this.stateT > (n - 1) * 1.05 + W + 0.25) this.rear = lerp(this.rear, 0, Math.min(1, dt * 6));
    if (this.stateT > (n - 1) * 1.05 + W + 0.7) this.rest(1.0);
  }

  // ── 창 찌르기 (근접) ──
  s_thrust(dt, world, p) {
    const W = 0.5;
    this.facePlayer();
    if (this.at(0)) {
      this.vx = 0;
      const b = this.W(34, -128);
      this.warnLine(b.x, b.y, b.x + this.facing * 330, b.y, W, { width: 34, color: '#ff4a5a' });
      audio.sfx('charge_ready', { pitch: 1.2, vol: 0.5 });
    }
    if (this.stateT < W) {
      this.lanceA = lerp(this.lanceA, 0, Math.min(1, dt * 10)); this.lanceX = lerp(this.lanceX, -50, Math.min(1, dt * 8)); this.lean = lerp(this.lean, -0.1, dt * 6);
      if (this.at(W - 0.15)) { const tp = this.lanceTip(); this.fx.flash(tp.x, tp.y, { color: '#fff', size: 60, life: 0.15 }); }
      return;
    }
    if (this.at(W)) { audio.sfx('slash_heavy', { pitch: 0.7 }); this.vx = this.facing * 420; this.shake(4, 0.15); }
    this.lanceX = lerp(this.lanceX, 130, Math.min(1, dt * 20)); this.lean = 0.2;
    this.vx *= 0.9;
    if (this.stateT < W + 0.25) {
      const tp = this.lanceTip(), b = this.W(34, -128);
      this.strikeRect({ x: Math.min(tp.x, b.x), y: tp.y - 16, w: Math.abs(tp.x - b.x), h: 32 }, 1.2, { kb: [460, -300] });
    }
    if (this.stateT > W + 0.7) this.rest(0.8);
  }

  // ── 지옥불 행렬: 창을 치켜들면 푸른 지옥불 기둥이 줄지어 솟는다 ──
  s_hellfire(dt, world, p) {
    const A = this.A, n = 7;
    this.vx *= 0.8; this.facePlayer();
    this.lanceA = lerp(this.lanceA, -1.45, Math.min(1, dt * 6)); this.skullUp = lerp(this.skullUp, 1, dt * 5);
    if (this.at(0)) { this.warnMark(this.cx, this.bottom - (this.mounted ? 240 : 190), 0.6); audio.sfx('fire', { pitch: 0.5 }); this.hdir = this.facing; }
    const k = this.every(0.35, 0.13, n);
    if (k >= 0) {
      const x = this.cx + this.hdir * (120 + k * 130);
      if (x > A.x0 + 10 && x < A.x1 - 10) erupt(this, x, { delay: 0.7, life: 0.5, w: 64, h: 230, color: BFIRE, style: 'soul', burst: 'soul', mv: 1.0, element: 'fire', fxColor: BFIRE });
    }
    if (this.phase >= 2 || this.inferno) {
      const j = this.every(0.6, 0.35, 3);
      if (j >= 0) erupt(this, p.cx, { delay: 0.75, life: 0.5, w: 64, h: 230, color: OFIRE, style: 'fire', burst: 'fire', mv: 1.0, element: 'fire' });
    }
    if (this.stateT > 0.35 + n * 0.13 + 1.0) this.rest(1.0);
  }

  // ── (도보) 연속 찌르기 돌진 ──
  s_lunge(dt, world, p) {
    const n = 2 + (this.phase >= 2 ? 1 : 0) + (this.inferno ? 1 : 0), per = 0.62, W = 0.32;
    const i = Math.floor(this.stateT / per), u = this.stateT - i * per;
    if (i >= n) { this.vx *= 0.8; if (this.stateT > n * per + 0.4) this.rest(0.9); return; }
    if (u < W) {
      this.facePlayer(); this.vx *= 0.7;
      this.lanceA = lerp(this.lanceA, -0.05, Math.min(1, dt * 12)); this.lanceX = lerp(this.lanceX, -40, Math.min(1, dt * 10));
      if (this.at(i * per)) { const b = this.W(24, -88); this.warnLine(b.x, b.y, b.x + this.facing * 320, b.y, W, { width: 30, color: '#ff4a5a' }); audio.sfx('charge_ready', { pitch: 1.4, vol: 0.4 }); }
      return;
    }
    if (this.at(i * per + W)) { this.vx = this.facing * 620; audio.sfx('slash_heavy', { pitch: 0.8 }); this.afterimage(); }
    this.lanceX = lerp(this.lanceX, 120, Math.min(1, dt * 20)); this.vx *= 0.93;
    if (u < W + 0.22) {
      const tp = this.lanceTip(), b = this.W(24, -88);
      this.strikeRect({ x: Math.min(tp.x, b.x), y: tp.y - 16, w: Math.abs(tp.x - b.x), h: 32 }, 1.1, { kb: [420, -300] });
    }
  }

  // ── (도보) 도약 내려찍기 ──
  s_leap(dt, world, p) {
    const A = this.A, W = 0.45;
    if (this.at(0)) { this.facePlayer(); this.vx = 0; audio.sfx('jump', { pitch: 0.6 }); this.leapLanded = false; }
    if (this.stateT < W) { this.lanceA = lerp(this.lanceA, -1.3, Math.min(1, dt * 8)); return; }
    if (this.at(W)) {
      this.tx = clamp(p.cx, A.x0 + 60, A.x1 - 60);
      this.vy = -1150; this.vx = (this.tx - this.cx) / 0.95;
      this.warnCircle(this.tx, this.floorY, 80, 0.95, { color: '#ff4a5a' });
      this.warn({ type: 'column', cx0: this.tx, cw: 100, y0: this.floorY - 320, y1: this.floorY, life: 0.95, color: '#ff4a5a' });
    }
    if (!this.leapLanded) {
      this.lanceA = lerp(this.lanceA, PI / 2, Math.min(1, dt * 5));
      if (this.stateT > W + 0.1 && this.onGround) {
        this.leapLanded = true; this.vx = 0;
        this.impact(this.cx, this.floorY, 14, 0.07, '#9ac0ff');
        audio.sfx('hit_heavy', { pitch: 0.5 }); audio.sfx('explode', { pitch: 0.8, vol: 0.7 });
        this.strikeRect({ x: this.cx - 80, y: this.floorY - 90, w: 160, h: 90 }, 1.3);
        for (const s of [-1, 1]) groundWave(this, this.cx + s * 20, s, { speed: 520, color: BFIRE, color2: '#e8f0ff', style: 'soul', mv: 0.9, element: 'dark' });
        if (this.phase >= 2) for (const s of [-1, 1]) erupt(this, this.cx + s * 150, { delay: 0.25, life: 0.45, w: 56, h: 200, color: BFIRE, style: 'soul', burst: 'soul', mv: 1, element: 'fire', fxColor: BFIRE });
        this.landT = this.stateT;
      }
      if (this.stateT > W + 2.5) this.leapLanded = true, this.landT = this.stateT;
      return;
    }
    if (this.stateT - this.landT > 0.6) this.rest(0.8);
  }

  // ── (도보) 유령마 환영 돌격 ──
  s_phantom(dt, world, p) {
    const A = this.A, W = 1.0;
    this.vx *= 0.8; this.facePlayer();
    this.lanceA = lerp(this.lanceA, -1.4, Math.min(1, dt * 6));
    if (this.at(0)) {
      this.pdir = p.cx > A.mid ? 1 : -1;
      this.warn({ type: 'band', x0: A.x0, x1: A.x1, y0: A.floor - 120, y1: A.floor, life: W, color: '#6aa0ff', dir: this.pdir });
      this.warnMark(this.cx, this.bottom - 190, W);
      audio.sfx('boss_roar', { pitch: 1.9, vol: 0.5 });
    }
    if (this.at(W)) {
      const x = this.pdir > 0 ? A.x0 - 60 : A.x1 + 60;
      const n = this.inferno ? 2 : 1;
      for (let i = 0; i < n; i++) {
        this.shoot({ x: x - this.pdir * i * 260, y: A.floor - 60, vx: this.pdir * 760, vy: 0, w: 150, h: 110, render: (ctx, pr) => this.drawPhantomHorse(ctx, pr), color: BFIRE, life: 3.2, collideWalls: false, pierce: 99, light: { r: 160, color: BFIRE, i: 0.8 }, trail: 'soul', trailRate: 0.02, attack: { mv: 1.1, element: 'dark', type: 'mag', kb: [500, -500] } });
      }
      audio.sfx('dash', { pitch: 0.5 });
    }
    if (this.stateT > W + 1.2) this.rest(0.9);
  }

  // ── 페이즈 ──
  onPhase(n, world) {
    if (n === 1) {
      this.setState('transform'); this.transformTime = 1.3;
      world.banner = { text: '지옥의 기수', sub: '유령마의 발굽에 푸른 지옥불이 번진다', t: 1.8, color: BFIRE };
    } else {
      this.setState('dismount'); this.skullOut = 0;
      world.banner = { text: '하마', sub: '유령마가 쓰러지고, 흑기사가 땅을 딛는다', t: 2, color: '#ff8a4a' };
    }
  }
  transformTick(dt, world, p) {
    this.vx *= 0.8; this.rear = Math.min(1, this.stateT * 2) * (0.8 + Math.sin(this.stateT * 12) * 0.1); this.lanceA = -1.3; this.skullUp = 1.2;
    if (this.at(0.3)) { this.phaseBurst(BFIRE); audio.sfx('boss_roar', { pitch: 0.8 }); }
    if (Math.random() < 0.8) { const f = this.W(rand(-60, 60), 0); this.fx.emit('soul', f.x, f.y - 4, { speed: 120, angle: -PI / 2, spread: 0.5, color: BFIRE }); }
  }
  s_dismount(dt, world, p) {
    this.invuln = true; this.vx *= 0.85;
    if (this.stateT < 0.9) { this.rear = ease.outCubic(Math.min(1, this.stateT / 0.5)); this.lanceA = -1.4; return; }
    if (this.at(0.9)) {
      // 말 소멸 + 기사 착지
      this.phaseBurst('#9ac0ff');
      audio.sfx('explode', { pitch: 0.6 }); audio.sfx('boss_roar', { pitch: 0.6 });
      this.fx.burst('soul', this.cx, this.bottom - 80, 50, { speed: 320, color: BFIRE, jitter: 60 });
      this.horseFade = 1.2; this.fadeX = this.cx; this.fadeB = this.bottom; this.fadeF = this.facing;
      this.applyDismount();
      this.y -= 90; this.vy = -200;
    }
    if (this.stateT > 1.1 && this.onGround && !this.didAct) { this.didAct = true; this.impact(this.cx, this.floorY, 10, 0.05, '#9ac0ff'); }
    if (this.stateT > 2.0) { this.invuln = false; this.rest(0.4); }
  }
  applyDismount() {
    const cx = this.cx, b = this.bottom;
    this.mounted = false; this.w = 76; this.h = 150; this.cx = cx; this.bottom = b; this.rear = 0;
  }
  /** 갤러리/테스트용: 페이즈 구조 변화를 즉시 적용 */
  phaseApply(n) { if (n >= 2 && this.mounted) { this.applyDismount(); this.setState('idle'); this.invuln = false; } }
  deathStart() { audio.sfx('boss_roar', { pitch: 0.5 }); }
  deathTick(dt) { this.vx = 0; this.rear = this.mounted ? 0.5 + Math.sin(this.deathT * 20) * 0.05 : 0; this.lean = Math.sin(this.deathT * 25) * 0.06; }
  debrisPiece(i) { return { size: 12, draw: i % 4 === 0 ? drawSkullBit : drawArmorShard }; }
  extraLights(L) {
    const n = this.neck(); L.add(n.x, n.y - 10, 80, BFIRE, 0.9);
    if (!this.skullOut) { const h = this.skullHand(); L.add(h.x, h.y, 90, OFIRE, 0.9); }
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx, world) {
    beginDraw(this);
    const X = this.cx, B = this.bottom;
    shadow(ctx, X, this.floorY - 2, this.mounted ? 150 : 60, 16, 0.55);
    // 사라지는 유령마 (하마 연출)
    if (this.horseFade > 0) {
      ctx.save(); ctx.globalAlpha *= clamp(this.horseFade / 1.2, 0, 1) * 0.8;
      ctx.translate(this.fadeX, this.fadeB - (1.2 - this.horseFade) * 60); ctx.scale(this.fadeF * 1.3, 1.3);
      this.drawHorse(ctx, this.t, 1, true);
      ctx.restore();
    }
    ctx.save();
    const jx = this.flashT > 0 ? rand(-2, 2) : 0;
    ctx.translate(X + jx, B); ctx.scale(this.facing * this.S, this.S);
    this.drawFigure(ctx, false);
    ctx.restore();
    endDraw();
  }
  drawFigure(ctx, ghost) {
    const t = this.t;
    if (!ghost) glow(ctx, 0, this.mounted ? -110 : -80, this.mounted ? 200 : 130, '#1a2a5a', 0.55);
    if (this.mounted) {
      ctx.save();
      // 뒷발 기준으로 몸을 일으킴
      ctx.translate(-46, 0); ctx.rotate(-this.rear * 0.55); ctx.translate(46, 0);
      this.drawHorse(ctx, t, 0, ghost);
      this.drawRider(ctx, t, ghost, 4, -112);
      ctx.restore();
    } else {
      this.drawKnightOnFoot(ctx, t, ghost);
    }
  }

  // 유령마
  drawHorse(ctx, t, fade, ghost) {
    const g = this.gait, run = clamp(Math.abs(this.vx) / 600, 0, 1), rear = this.rear;
    const bob = Math.sin(g * 2) * (1 + run * 3);
    const body = ghost ? '#6a8ad0' : null;
    // 꼬리 (불꽃)
    this.flameTongues(ctx, -66, -100 + bob, PI + 0.5 + run * 0.4, 5, 60 + run * 30, t, BFIRE, 10);
    // 먼 쪽 다리
    this.leg(ctx, 34, -74 + bob, g + PI * 0.5, 1, true, body);
    this.leg(ctx, -50, -78 + bob, g + PI * 1.5, -1, true, body);
    // 몸통
    ctx.beginPath();
    ctx.moveTo(-70, -96 + bob);
    ctx.quadraticCurveTo(-72, -118 + bob, -46, -118 + bob);
    ctx.quadraticCurveTo(-4, -112 + bob, 30, -114 + bob);
    ctx.quadraticCurveTo(62, -116 + bob, 66, -90 + bob);
    ctx.quadraticCurveTo(66, -66 + bob, 40, -64 + bob);
    ctx.quadraticCurveTo(0, -56 + bob, -44, -64 + bob);
    ctx.quadraticCurveTo(-72, -70 + bob, -70, -96 + bob);
    ctx.closePath();
    const hf = body ?? lg(ctx, 'dhorse', 0, -120, 0, -56, [0, C('#f4f8ff'), 0.4, C(GHOST), 0.8, C(GHOST2), 1, C('#2a3460')]);
    ctx.globalAlpha *= 0.94;
    ink(ctx, hf, 2.6, '#070a18');
    ctx.globalAlpha /= 0.94;
    if (!ghost) {
      rim(ctx, 0, 0, '#a8c8ff', 4, 0.6, -122, -90);
      // 갈비뼈 음영 (유령마)
      ctx.strokeStyle = C('rgba(40,50,100,0.35)'); ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const x = -20 + i * 12; ctx.moveTo(x, -104 + bob); ctx.quadraticCurveTo(x + 4, -84 + bob, x - 2, -66 + bob); }
      ctx.stroke();
      // 마구: 가슴띠 + 안장
      ctx.strokeStyle = C('#1a1418'); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(58, -104 + bob); ctx.quadraticCurveTo(62, -80 + bob, 44, -68 + bob); ctx.stroke();
      ctx.fillStyle = C(GOLD); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(60 - i * 3, -98 + i * 12 + bob, 2.2, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-26, -114 + bob); ctx.quadraticCurveTo(4, -124 + bob, 30, -114 + bob); ctx.lineTo(26, -92 + bob); ctx.quadraticCurveTo(0, -86 + bob, -22, -94 + bob); ctx.closePath();
      ink(ctx, lg(ctx, 'dsaddle', 0, -124, 0, -88, [0, C('#7a1a24'), 1, C('#2a060c')]), 2);
      ctx.strokeStyle = C(GOLD); ctx.lineWidth = 1.5; ctx.stroke();
      // 안장 천
      ctx.beginPath(); ctx.moveTo(-24, -96 + bob); ctx.lineTo(24, -94 + bob); ctx.lineTo(20, -74 + bob); ctx.lineTo(0, -68 + bob); ctx.lineTo(-20, -76 + bob); ctx.closePath();
      ink(ctx, C('#1c1020'), 1.5);
      ctx.strokeStyle = C(GOLD); ctx.lineWidth = 1; ctx.stroke();
    }
    // 가까운 쪽 다리
    this.leg(ctx, 40, -74 + bob, g, 1, false, body, rear);
    this.leg(ctx, -44, -78 + bob, g + PI, -1, false, body);
    // 목 + 갈기 + 머리
    const nb = -rear * 0.2;
    ctx.save(); ctx.translate(44, -104 + bob); ctx.rotate(nb + Math.sin(g * 2) * 0.04 * run);
    this.flameTongues(ctx, -8, -8, -PI / 2 - 1.2 - run * 0.3, 6, 34 + run * 10, t, BFIRE, 7, 50);
    ctx.beginPath();
    ctx.moveTo(-14, -6); ctx.quadraticCurveTo(0, -40, 26, -52); ctx.lineTo(44, -44); ctx.quadraticCurveTo(30, -20, 22, 20); ctx.quadraticCurveTo(4, 18, -14, -6); ctx.closePath();
    ink(ctx, body ?? lg(ctx, 'dneck', -10, -50, 30, 10, [0, C('#f0f6ff'), 0.6, C(GHOST), 1, C(GHOST2)]), 2.4, '#070a18');
    // 머리 (길쭉한 해골 같은 말머리)
    ctx.beginPath();
    ctx.moveTo(22, -58); ctx.quadraticCurveTo(40, -66, 50, -54); ctx.lineTo(76, -30); ctx.quadraticCurveTo(82, -20, 72, -16); ctx.lineTo(56, -18); ctx.quadraticCurveTo(38, -26, 24, -38); ctx.closePath();
    ink(ctx, body ?? lg(ctx, 'dhead', 30, -64, 60, -16, [0, C('#ffffff'), 0.5, C(GHOST), 1, C('#5a6aa8')]), 2.4, '#070a18');
    if (!ghost) {
      rim(ctx, 20, 60, '#c0d8ff', 3, 0.5, -64, -20);
      // 귀
      ctx.beginPath(); ctx.moveTo(28, -56); ctx.lineTo(30, -72); ctx.lineTo(38, -60); ctx.closePath(); ink(ctx, C(GHOST2), 1.5, '#070a18');
      // 굴레
      ctx.strokeStyle = C('#1a1418'); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(40, -58); ctx.lineTo(60, -22); ctx.moveTo(34, -44); ctx.lineTo(70, -30); ctx.stroke();
      ctx.fillStyle = C(GOLD); ctx.beginPath(); ctx.arc(52, -38, 2.5, 0, TAU); ctx.fill();
      // 눈 + 콧구멍
      ctx.fillStyle = C('#0a1030'); ctx.beginPath(); ctx.ellipse(42, -48, 5, 3.5, 0.6, 0, TAU); ctx.fill();
      eye(ctx, 43, -48, 2.2, BFIRE, 1);
      ctx.fillStyle = C('#0a1030'); ctx.beginPath(); ctx.ellipse(74, -22, 2.5, 2, 0.4, 0, TAU); ctx.fill();
      if (Math.sin(t * 3) > 0.7) glow(ctx, 80, -18, 20, BFIRE, 0.4);
    }
    ctx.restore();
  }
  leg(ctx, hx, hy, ph, back, far, body, rear = 0) {
    const run = clamp(Math.abs(this.vx) / 600, 0, 1), walk = clamp(Math.abs(this.vx) / 150, 0, 1);
    const amp = 0.18 * walk + 0.4 * run;
    let a1 = Math.sin(ph) * amp * (back > 0 ? 1 : 0.9), a2 = back > 0 ? -Math.max(0, Math.cos(ph)) * (0.3 + run * 0.9) * walk : Math.max(0, -Math.cos(ph)) * (0.3 + run * 0.7) * walk;
    if (back > 0 && rear > 0) { a1 += rear * (far ? 1.1 : 1.4); a2 -= rear * 1.6; }
    const kx = hx + Math.sin(a1) * 32, ky = hy + Math.cos(a1) * 32;
    const fx = kx + Math.sin(a1 + a2) * 36, fy = ky + Math.cos(a1 + a2) * 36;
    _Q[0] = hx; _Q[1] = hy; _Q[2] = kx; _Q[3] = ky; _Q[4] = fx; _Q[5] = fy;
    taper(ctx, _Q, 3, far ? 20 : 24, 8, (u) => (u < 0.5 ? lerp(far ? 20 : 24, 10, u * 2) : lerp(10, 8, (u - 0.5) * 2)));
    ink(ctx, body ?? (far ? C('#5a68a0') : lg(ctx, null, hx - 10, hy, hx + 10, hy, [0, C('#8a9ad8'), 0.5, C(GHOST), 1, C('#f4f8ff')])), 2.2, '#070a18');
    if (!body) { ctx.beginPath(); ctx.arc(kx, ky, far ? 5 : 6, 0, TAU); ctx.fillStyle = C(far ? '#4a5890' : '#aab8e8'); ctx.fill(); }
    // 불타는 발굽
    const ha = a1 + a2;
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(-ha);
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(6, -2); ctx.lineTo(7, 7); ctx.lineTo(-7, 7); ctx.closePath();
    ink(ctx, C('#1a1c2a'), 1.5, '#070a18');
    ctx.restore();
    if (!body) glow(ctx, fx, fy + 4, 20, BFIRE, far ? 0.4 : 0.7);
  }
  /** 불꽃 혀 (가산): 원점 x,y 에서 각도 a 방향 */
  flameTongues(ctx, x, y, a, n, L, t, color, w0 = 8, seed = 0) {
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const aa = a + (i - (n - 1) / 2) * 0.22, len = L * (0.6 + hash(i + seed) * 0.5) * (0.9 + 0.1 * Math.sin(t * 9 + i));
      let px = x, py = y;
      _Q[0] = px; _Q[1] = py;
      for (let j = 1; j < 5; j++) {
        const w = Math.sin(t * 7 + i * 1.7 + j) * 0.25 * j / 4;
        px += Math.cos(aa + w) * len / 4; py += Math.sin(aa + w) * len / 4 - j * 1.5;
        _Q[j * 2] = px; _Q[j * 2 + 1] = py;
      }
      taper(ctx, _Q, 5, w0, 0.5);
      ctx.fillStyle = rgba(color, 0.4); ctx.fill();
    }
    glow(ctx, x, y, L * 0.6, color, 0.35);
    ctx.globalCompositeOperation = op;
  }
  /** 기사 상체 (엉덩이 hx,hy 기준) */
  drawRider(ctx, t, ghost, hx, hy) {
    const lean = this.lean, lA = this.lanceA;
    // 망토
    const cw = Math.sin(this.capeT * 3);
    ctx.beginPath();
    ctx.moveTo(hx - 4, hy - 46);
    ctx.quadraticCurveTo(hx - 40, hy - 40 + cw * 4, hx - 70 - cw * 8, hy - 8);
    for (let i = 0; i < 5; i++) ctx.lineTo(hx - 70 + i * 12 - cw * 6, hy + 4 + (i % 2) * 14 + Math.sin(this.capeT * 5 + i) * 4);
    ctx.quadraticCurveTo(hx - 10, hy - 10, hx + 6, hy - 40);
    ctx.closePath();
    ink(ctx, ghost ? '#2a3a70' : lg(ctx, 'dcape', hx - 60, hy - 40, hx - 20, hy + 20, [0, C('#5a0e1a'), 1, C('#14040a')]), 2);
    if (!ghost) rim(ctx, hx - 80, hx - 30, RIM, 3, 0.4);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(lean * 0.5);
    // 먼 쪽 팔 (머리 든 팔)
    const su = this.skullUp;
    const sx = -8, sy = -44, ex = -20, ey = -62 - su * 8, wx = -16, wy = -66 - su * 22;
    _Q[0] = sx; _Q[1] = sy; _Q[2] = ex; _Q[3] = ey; _Q[4] = wx; _Q[5] = wy;
    taper(ctx, _Q, 3, 14, 10); ink(ctx, ghost ? '#2a3a70' : C('#1c1e28'), 2);
    if (!this.skullOut && !ghost) drawSkullAt(ctx, wx + 2, wy - 12, t, 1);
    // 다리 (허벅지 → 등자)
    _Q[0] = 2; _Q[1] = 0; _Q[2] = 22; _Q[3] = 14; _Q[4] = 16; _Q[5] = 42;
    taper(ctx, _Q, 3, 18, 11);
    ink(ctx, ghost ? '#2a3a70' : lg(ctx, 'dleg', 0, 0, 30, 40, [0, C(STEEL2), 1, C(STEEL)]), 2.2);
    ctx.beginPath(); ctx.moveTo(8, 38); ctx.lineTo(28, 40); ctx.lineTo(26, 48); ctx.lineTo(8, 46); ctx.closePath(); ink(ctx, C('#14141c'), 1.5);
    // 몸통 갑옷
    this.torso(ctx, t, ghost, 0, 0, 1);
    // 가까운 팔 + 창
    this.lanceArm(ctx, ghost, 14, -40, 30, -16, lA);
    ctx.restore();
  }
  torso(ctx, t, ghost, x, y, s) {
    // 흉갑
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 2); ctx.lineTo(x - 20, y - 34); ctx.quadraticCurveTo(x - 18, y - 50, x - 2, y - 54); ctx.lineTo(x + 16, y - 52);
    ctx.quadraticCurveTo(x + 26, y - 40, x + 22, y - 20); ctx.lineTo(x + 16, y - 2); ctx.closePath();
    ink(ctx, ghost ? '#2a3a70' : lg(ctx, 'dchest', x - 20, 0, x + 24, 0, [0, C('#3a4260'), 0.2, C('#15161e'), 0.6, C(STEEL), 0.85, C('#6a6e84'), 1, C('#20222c')]), 2.5);
    if (ghost) return;
    rim(ctx, x - 26, x, RIM, 3, 0.6);
    ctx.strokeStyle = C(GOLD); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x - 14, y - 44); ctx.quadraticCurveTo(x + 2, y - 36, x + 18, y - 44); ctx.moveTo(x + 2, y - 50); ctx.lineTo(x + 2, y - 10); ctx.stroke();
    // 허리 비늘 갑옷
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 17 + i, y - 8 + i * 5); ctx.lineTo(x + 18 - i, y - 8 + i * 5); ctx.lineTo(x + 16 - i, y - 2 + i * 5); ctx.lineTo(x - 15 + i, y - 2 + i * 5); ctx.closePath(); ink(ctx, C(i % 2 ? '#2a2c38' : '#3a3e50'), 1.2); }
    // 목 받침 + 푸른 혼불
    ctx.beginPath(); ctx.ellipse(x + 2, y - 56, 11, 5, 0, 0, TAU); ink(ctx, C('#20222e'), 2);
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const fl = Math.sin(t * 11 + i * 2), h = 26 + i * 4 + fl * 5 + this.fury * 12;
      ctx.beginPath(); ctx.moveTo(x - 8 + i * 5, y - 56);
      ctx.quadraticCurveTo(x - 10 + i * 5 + fl * 4, y - 56 - h * 0.6, x - 2 + i * 3 + fl * 3, y - 56 - h);
      ctx.quadraticCurveTo(x + 2 + i * 4, y - 56 - h * 0.5, x - 2 + i * 5, y - 56);
      ctx.fillStyle = rgba(i % 2 ? '#bfe0ff' : BFIRE, 0.45); ctx.fill();
    }
    glow(ctx, x + 2, y - 66, 34 + this.fury * 14, BFIRE, 0.7);
    ctx.globalCompositeOperation = op;
    // 가시 어깨갑옷 (양쪽)
    for (const sd of [-1, 1]) {
      const px = x + (sd > 0 ? 18 : -14), py = y - 48;
      ctx.beginPath(); ctx.ellipse(px, py, 13, 9, sd * 0.3, 0, TAU);
      ink(ctx, lg(ctx, 'dpaul' + sd, px - 10, py - 10, px + 10, py + 10, [0, C('#6a6e84'), 0.5, C(STEEL), 1, C('#0c0c12')]), 2);
      for (let k = 0; k < 3; k++) {
        const a = -PI / 2 + sd * (0.2 + k * 0.45);
        ctx.beginPath(); ctx.moveTo(px + Math.cos(a - 0.2) * 9, py + Math.sin(a - 0.2) * 7); ctx.lineTo(px + Math.cos(a) * (20 - k * 3), py + Math.sin(a) * (18 - k * 3)); ctx.lineTo(px + Math.cos(a + 0.2) * 9, py + Math.sin(a + 0.2) * 7); ctx.closePath();
        ink(ctx, C('#8a8ea0'), 1.2);
      }
    }
  }
  lanceArm(ctx, ghost, sx, sy, hx, hy, lA) {
    // 창
    const L = 170 + this.lanceX;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(lA);
    ctx.fillStyle = C('#1a1418'); ctx.fillRect(-30, -3, L + 30, 6);
    ctx.strokeStyle = C(OUT); ctx.lineWidth = 1.5; ctx.strokeRect(-30, -3, L + 30, 6);
    ctx.fillStyle = C('#5a4a3a'); ctx.fillRect(-30, -1, L + 30, 1.5);
    // 원뿔 손잡이 보호대
    ctx.beginPath(); ctx.moveTo(6, -12); ctx.lineTo(34, -4); ctx.lineTo(34, 4); ctx.lineTo(6, 12); ctx.closePath();
    ink(ctx, ghost ? '#2a3a70' : lg(ctx, 'dvamp', 0, -12, 0, 12, [0, C('#8a8ea0'), 0.5, C(STEEL), 1, C('#0c0c12')]), 1.6);
    // 창날
    ctx.beginPath(); ctx.moveTo(L, -6); ctx.lineTo(L + 34, 0); ctx.lineTo(L, 6); ctx.closePath();
    ink(ctx, ghost ? '#6a8ad0' : lg(ctx, 'dtip', L, -6, L, 6, [0, C('#ffffff'), 0.5, C('#b8c0d8'), 1, C('#4a4e60')]), 1.6);
    if (!ghost && this.phase >= 1) glow(ctx, L + 16, 0, 30, BFIRE, 0.5);
    ctx.restore();
    // 팔
    _Q[0] = sx; _Q[1] = sy; _Q[2] = (sx + hx) / 2 + 4; _Q[3] = (sy + hy) / 2 + 8; _Q[4] = hx; _Q[5] = hy;
    taper(ctx, _Q, 3, 15, 11);
    ink(ctx, ghost ? '#2a3a70' : lg(ctx, 'darm', sx, sy, hx, hy, [0, C('#5a5e70'), 1, C('#1c1e28')]), 2);
    ctx.beginPath(); ctx.arc(hx, hy, 7, 0, TAU); ink(ctx, C('#2a2c38'), 1.5);
  }
  drawKnightOnFoot(ctx, t, ghost) {
    const g = this.gait, walk = clamp(Math.abs(this.vx) / 110, 0, 1), air = !this.onGround;
    // 망토
    const cw = Math.sin(this.capeT * 3);
    ctx.beginPath();
    ctx.moveTo(-6, -126);
    ctx.quadraticCurveTo(-30, -110, -44 - cw * 6, -40);
    for (let i = 0; i < 5; i++) ctx.lineTo(-44 + i * 10 - cw * 4, -14 + (i % 2) * 12 + Math.sin(this.capeT * 5 + i) * 4);
    ctx.quadraticCurveTo(-8, -60, 8, -120);
    ctx.closePath();
    ink(ctx, ghost ? '#2a3a70' : lg(ctx, 'dcape2', -40, -120, -10, 0, [0, C('#5a0e1a'), 1, C('#14040a')]), 2);
    // 다리
    for (const s of [-1, 1]) {
      const a = air ? (s > 0 ? 0.5 : -0.3) : Math.sin(g + (s > 0 ? 0 : PI)) * 0.45 * walk;
      const hx = s * 7, hy = -76, kx = hx + Math.sin(a) * 36, ky = hy + Math.cos(a) * 36;
      const b = air ? -0.9 : -Math.max(0, Math.sin(g + (s > 0 ? 0 : PI) + 1)) * 0.6 * walk;
      const fx = kx + Math.sin(a + b) * 38, fy = ky + Math.cos(a + b) * 38;
      _Q[0] = hx; _Q[1] = hy; _Q[2] = kx; _Q[3] = ky; _Q[4] = fx; _Q[5] = fy;
      taper(ctx, _Q, 3, s > 0 ? 17 : 15, 11);
      ink(ctx, ghost ? '#2a3a70' : lg(ctx, 'dfleg' + s, -10, -80, 10, 0, [0, C(s > 0 ? STEEL2 : '#2a2c36'), 1, C('#14141c')]), 2.2);
      ctx.beginPath(); ctx.moveTo(fx - 8, fy - 2); ctx.lineTo(fx + 14, fy - 2); ctx.lineTo(fx + 12, fy + 4); ctx.lineTo(fx - 8, fy + 4); ctx.closePath(); ink(ctx, C('#101018'), 1.5);
      ctx.beginPath(); ctx.arc(kx, ky, 6, 0, TAU); ink(ctx, C('#4a4e60'), 1.2);
    }
    ctx.save(); ctx.translate(0, -74); ctx.rotate(this.lean * 0.4);
    const su = this.skullUp;
    const sx = -8, sy = -44, ex = -18, ey = -28 - su * 18, wx = -14, wy = -36 - su * 34;
    _Q[0] = sx; _Q[1] = sy; _Q[2] = ex; _Q[3] = ey; _Q[4] = wx; _Q[5] = wy;
    taper(ctx, _Q, 3, 14, 10); ink(ctx, ghost ? '#2a3a70' : C('#1c1e28'), 2);
    if (!this.skullOut && !ghost) drawSkullAt(ctx, wx + 2, wy - 12, t, 1);
    this.torso(ctx, t, ghost, 0, 0, 1);
    this.lanceArm(ctx, ghost, 14, -40, 26, -14, this.lanceA);
    ctx.restore();
  }
  drawPhantomHorse(ctx, pr) {
    const keep = [this.gait, this.vx, this.rear];
    this.gait = pr.t * 16; this.vx = pr.vx; this.rear = 0;
    ctx.save();
    ctx.translate(0, pr.h / 2);
    ctx.scale((Math.sign(pr.vx) || 1) * 1.15, 1.15);
    ctx.globalAlpha *= 0.75;
    glow(ctx, 0, -60, 150, BFIRE, 0.5);
    this.drawHorse(ctx, pr.t, 0, true);
    ctx.restore();
    [this.gait, this.vx, this.rear] = keep;
  }
}

// ───────────────────────── 머리/파편 ─────────────────────────
function drawSkullAt(ctx, x, y, t, k) {
  ctx.save(); ctx.translate(x, y);
  // 불꽃
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, -6, 34, OFIRE, 0.8);
  for (let i = 0; i < 5; i++) {
    const fl = Math.sin(t * 12 + i * 1.9), h = 16 + (i % 2 ? 8 : 0) + fl * 4;
    ctx.beginPath(); ctx.moveTo(-9 + i * 4.5, -4);
    ctx.quadraticCurveTo(-10 + i * 4.5 + fl * 3, -4 - h * 0.6, -6 + i * 3.5 + fl * 2, -4 - h);
    ctx.quadraticCurveTo(-3 + i * 4, -4 - h * 0.4, -5 + i * 4.5, -2);
    ctx.fillStyle = i % 2 ? 'rgba(255,220,120,0.7)' : 'rgba(255,110,30,0.65)'; ctx.fill();
  }
  ctx.globalCompositeOperation = op;
  // 두개골
  ctx.beginPath(); ctx.arc(0, 0, 9, PI * 0.9, PI * 2.1); ctx.lineTo(7, 7); ctx.lineTo(-7, 7); ctx.closePath();
  ctx.fillStyle = C('#efe4cc'); ctx.strokeStyle = C('#1a0e06'); ctx.lineWidth = 2; ctx.stroke(); ctx.fill();
  ctx.fillStyle = C('#d8c8a8'); ctx.fillRect(-5, 6, 10, 4);
  ctx.fillStyle = C('#1a0806');
  ctx.beginPath(); ctx.ellipse(-3.5, 0, 2.6, 3, 0, 0, TAU); ctx.ellipse(4, 0, 2.6, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffb040'; ctx.beginPath(); ctx.arc(-3.5, 0.5, 1.2, 0, TAU); ctx.arc(4, 0.5, 1.2, 0, TAU); ctx.fill();
  ctx.fillStyle = C('#1a0806'); for (let i = -2; i <= 2; i++) ctx.fillRect(i * 2 - 0.5, 6, 1, 4);
  ctx.restore();
}
function drawFlameSkull(ctx, p) {
  const a = Math.atan2(p.vy, p.vx);
  ctx.save(); ctx.rotate(a + PI / 2); ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 10, 40, OFIRE, 0.6);
  for (let i = 0; i < 4; i++) {
    const fl = Math.sin(p.t * 20 + i);
    ctx.fillStyle = i % 2 ? 'rgba(255,200,90,0.5)' : 'rgba(255,90,20,0.55)';
    ctx.beginPath(); ctx.moveTo(-10 + i * 6, 0); ctx.quadraticCurveTo(-8 + i * 5 + fl * 4, 18, -2 + i * 2, 30 + fl * 4); ctx.quadraticCurveTo(i * 4, 14, -6 + i * 6, 0); ctx.fill();
  }
  ctx.restore();
  ctx.scale(1.3, 1.3);
  drawSkullAt(ctx, 0, 0, p.t, 1);
}
function drawSkullBit(ctx) { ctx.fillStyle = '#efe4cc'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a0806'; ctx.fillRect(-3, -1, 2, 2); ctx.fillRect(1, -1, 2, 2); }
function drawArmorShard(ctx) {
  ctx.fillStyle = '#2a2c36'; ctx.strokeStyle = '#8a8ea0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(6, -6); ctx.lineTo(8, 4); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
}
