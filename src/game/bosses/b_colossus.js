// 9장 보스: 태엽 거신 — 경기장을 가득 채우는 황동 골렘 (정면을 보고 배경 평면에 선다)
// 패턴: 톱니 주먹 발사(상/하단 레인) · 주먹 내려찍기+충격파 · 증기 분출구 · 회전 톱날 · 시계추 휩쓸기 · 코어 노출(과열) · 자정의 종(3페이즈)
// 판정: 정강이(장갑) / 가슴 시계판 / 노출된 코어(약점) / 박힌 주먹. 몸통 자체는 배경이라 접촉 피해 없음.
import { BossB, PI, OUT, R, C, LG, RG, ink, glow, glowE, eye, warnRect, warnFloor, warnLine, warnBang, lineStrike, impact, hash } from './b_common.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, ease, rgba, mix } from '../../core/math.js';

const BRASS = '#b8863b', BRASS_L = '#f2cf7a', BRASS_D = '#5a3814';
const IRON = '#4a4852', IRON_D = '#17161c', IRON_L = '#9a98a8';
const COPPER = '#a4552e';
const FURN = '#ff7a1a', FURN_L = '#ffd27a';
const EYE = '#ff3a2a';
const L1 = 118, L2 = 124;           // 팔 길이 (상완/전완)

export class Colossus extends BossB {
  setup() {
    const A = this.A;
    // 화면 폭(960)보다 넓은 경기장에서도 늘 보이도록 중앙 부근에 선다
    this.bx = clamp(A.cx + 120, A.x0 + 260, A.x1 - 260);  // 몸 중심 x
    this.crouch = 0; this.crouchT = 0;                 // 무릎 꿇기 0~1
    this.bob = 0; this.walkPh = 0; this.stepLift = [0, 0];
    this.gearA = 0; this.gearSpd = 0.4;
    this.power = 0;                                    // 기동 (눈/용광로 밝기)
    this.heat = 0;                                     // 과열 표시
    this.door = 0; this.doorT = 0;                     // 시계판 문 열림 0~1
    this.clockH = 0; this.clockM = 0;
    this.pend = null;                                  // 시계추 {a, len, k}
    this.look = 0;
    // 팔: 0 = 화면 왼쪽, 1 = 오른쪽. 주먹 위치(월드)와 목표
    this.arms = [0, 1].map((i) => ({ side: i ? 1 : -1, fx: 0, fy: 0, tx: 0, ty: 0, k: 7, glow: 0, fly: false, chain: 0, planted: false, spin: 0 }));
    for (const a of this.arms) { const r = this.restFist(a); a.fx = a.tx = r.x; a.fy = a.ty = r.y; }
    this.parts = {
      shinL: { x: 0, y: 0, w: 60, h: 110, defMul: 2.6, armor: true },
      shinR: { x: 0, y: 0, w: 60, h: 110, defMul: 2.6, armor: true },
      clock: { x: 0, y: 0, w: 120, h: 120, defMul: 1 },
      core: { x: 0, y: 0, w: 110, h: 110, defMul: 0.25, off: true },
      fistL: { x: 0, y: 0, w: 88, h: 88, defMul: 0.9, off: true },
      fistR: { x: 0, y: 0, w: 88, h: 88, defMul: 0.9, off: true },
    };
    this.partList = Object.values(this.parts);
    this.smokeT = 0;
    this.coreCount = 0; this.sinceCore = 0;
    this.saws = 0;
    this.syncBox();
  }
  debugAct(s) { this.power = 1; super.debugAct(s); }
  setState(s) {
    super.setState(s);
    this.laneWarn = null; this.slamWarn = null; this.pend = null; this._pz = false; this._slamZ = false;
    if (this.arms) for (const a of this.arms) { a.fly = false; a.planted = false; a.hitWall = false; }
  }
  /** 걸을 수 있는 범위 (경기장 중앙 ±240) */
  get bxMin() { return Math.max(this.A.x0 + 250, this.A.cx - 240); }
  get bxMax() { return Math.min(this.A.x1 - 250, this.A.cx + 240); }
  skipTransition() { this.power = 1; }

  // ───────────── 좌표 도우미 ─────────────
  get F() { return this.A.floor; }
  /** 몸 기준 좌표 → 월드 (발 중앙 기준, y 위로 음수) */
  wx(lx) { return this.bx + lx; }
  wy(ly) { return this.F + ly + this.crouch * 110 * (ly < -150 ? 1 : ly < -60 ? 0.6 : 0) + this.bob; }
  shoulder(side) { return { x: this.wx(side * 138), y: this.wy(-312) }; }
  restFist(a) { return { x: this.wx(a.side * 170), y: this.wy(-110) + Math.sin(this.t * 1.3 + a.side) * 6 }; }
  syncBox() {
    this.x = this.bx - this.w / 2; this.y = this.F - this.h;
    const P = this.parts, F = this.F;
    for (const s of [-1, 1]) {
      const sh = s < 0 ? P.shinL : P.shinR;
      sh.x = this.wx(s * 88) - 30; sh.y = F - 118 + this.stepLift[s < 0 ? 0 : 1] * -0.5; sh.h = 110;
    }
    const cy = this.wy(-262);
    P.clock.x = this.bx - 60; P.clock.y = cy - 60;
    P.core.x = this.bx - 55; P.core.y = cy - 55; P.core.off = this.door < 0.6;
    P.clock.off = this.door > 0.4;
    for (const a of this.arms) {
      const f = a.side < 0 ? P.fistL : P.fistR;
      f.x = a.fx - 44; f.y = a.fy - 44; f.off = !a.planted;
    }
  }
  hitParts() { return this.partList; }
  hurtboxes() { return []; }

  tickB(dt, world) {
    this.gearA += this.gearSpd * dt * (1 + this.heat * 2);
    this.crouch += (this.crouchT - this.crouch) * (1 - Math.exp(-5 * dt));
    this.door += (this.doorT - this.door) * (1 - Math.exp(-6 * dt));
    this.clockM += dt * (0.8 + this.phase * 0.6); this.clockH += dt * 0.07;
    const p = this.P;
    if (p) this.look += (clamp((p.cx - this.bx) / 400, -1, 1) - this.look) * (1 - Math.exp(-3 * dt));
    for (const a of this.arms) {
      if (a.fly) continue;
      const k = 1 - Math.exp(-a.k * dt);
      a.fx += (a.tx - a.fx) * k; a.fy += (a.ty - a.fy) * k;
      a.glow = Math.max(0, a.glow - dt * 0.8);
    }
    this.syncBox();
    // 굴뚝 연기
    this.smokeT -= dt;
    if (this.smokeT <= 0 && this.power > 0.3) {
      this.smokeT = 0.18 - this.heat * 0.08;
      for (const s of [-1, 1]) world.fx.emit('smoke', this.wx(s * 70) + rand(-4, 4), this.wy(-412), { color: this.heat > 0.3 ? '#5a4a44' : '#3a3640', size: rand(14, 24), vy: -80, speed: 30, alpha: 0.55, layer: 'back' });
      if (this.heat > 0.2) world.fx.emit('ember', this.wx(rand(-100, 100)), this.wy(-250), { speed: 80 });
    }
  }
  /** 팔 기본 자세로 복귀 */
  armsRest(k = 6) { for (const a of this.arms) { if (a.fly || a.planted) continue; const r = this.restFist(a); a.tx = r.x; a.ty = r.y; a.k = k; } }
  armOf(side) { return this.arms[side < 0 ? 0 : 1]; }

  // ───────────── 상태 ─────────────
  s_intro(dt, world, t) {
    this.power = clamp(t / 1.4, 0, 1);
    this.gearSpd = 0.1 + this.power * 0.3;
    this.armsRest(3);
    if (this.at(0.3)) audio.sfx('clock_tick', { vol: 0.8 });
    if (this.at(0.8)) audio.sfx('clock_tick', { vol: 0.9, pitch: 0.8 });
    if (this.at(1.4)) {
      audio.sfx('boss_roar', { pitch: 0.55 }); audio.sfx('bell', { vol: 0.8, pitch: 0.6 });
      impact(world, { shake: 12, time: 0.9 });
      world.fx.ring(this.wx(0), this.wy(-360), { color: EYE, r0: 20, r1: 260, life: 0.7, width: 8 });
      for (const s of [-1, 1]) world.fx.burst('smoke', this.wx(s * 70), this.wy(-410), 10, { color: '#e8e4ee', speed: 120, alpha: 0.6 });
    }
    if (t > 2.2) this.setState('idle');
  }
  s_idle(dt, world, t) {
    const p = this.P;
    this.bob = Math.sin(this.t * 1.6) * 3;
    this.armsRest(5);
    this.crouchT = 0; this.doorT = 0; this.heat = Math.max(0, this.heat - dt * 0.3);
    if (t < (this.rest ?? this.restTime(1.1))) return;
    this.rest = this.restTime(rand(0.8, 1.3));
    const ph = this.phase;
    // 코어 노출: 페이즈 전환 직후 또는 일정 횟수마다
    if (this.coreQueued || this.sinceCore >= (ph >= 2 ? 4 : 5)) { this.coreQueued = false; this.sinceCore = 0; this.setState('core'); return; }
    this.sinceCore++;
    const far = p ? Math.abs(p.cx - this.bx) : 0;
    const a = this.choose([
      ['punch', 3], ['slam', far < 520 ? 3 : 1], ['steam', 2], ['saws', 2.2], ['pendulum', far < 300 ? 3 : 1.4],
      ['walk', far > 330 && (p.cx < this.bx ? this.bx > this.bxMin + 30 : this.bx < this.bxMax - 30) ? 2.5 : 0], ['toll', ph >= 2 ? 2.4 : 0],
    ]);
    this.setState(a);
  }
  // 걷기: 플레이어 쪽으로 2~3걸음 (쿵, 쿵)
  s_walk(dt, world, t) {
    const A = this.A, p = this.P;
    if (this.at(0.001)) { this.walkTo = clamp(p ? p.cx + (p.cx > this.bx ? -140 : 140) : A.cx, this.bxMin, this.bxMax); this.walkDir = Math.sign(this.walkTo - this.bx) || 1; }
    const stepT = this.phase >= 2 ? 0.5 : 0.62;
    const k = t / stepT, i = Math.floor(k), u = k - i;
    const done = Math.abs(this.walkTo - this.bx) < 8 || i >= 3;
    const foot = i % 2;
    if (!done) {
      this.stepLift[foot] = Math.sin(u * PI) * 26;
      this.stepLift[1 - foot] = 0;
      this.bx += this.walkDir * 150 * dt / stepT * (u < 0.85 ? 1 : 0.2);
      this.bx = clamp(this.bx, this.bxMin, this.bxMax);
      this.bob = -Math.sin(u * PI) * 8;
      for (const a of this.arms) { const r = this.restFist(a); a.tx = r.x + Math.sin(u * PI) * 20 * (foot ? 1 : -1) * a.side; a.ty = r.y; }
      if (this.every(stepT, stepT * 0.98)) {
        const fx = this.wx((foot ? 1 : -1) * 88);
        impact(world, { shake: 7, time: 0.25 }); audio.sfx('land', { vol: 1, pitch: 0.5 }); audio.sfx('hit_heavy', { vol: 0.5, pitch: 0.4 });
        world.fx.burst('dust', fx, this.F - 4, 12, { speed: 200, angle: -PI / 2, spread: 1.4 });
        // 발밑 짓밟기 판정
        this.zone({ x: fx - 60, y: this.F - 40, w: 120, h: 40, life: 0.1, mv: 1, kb: [360, -520] });
        if (this.phase >= 1) for (const d of [-1, 1]) this.shockwave(fx + d * 50, d, 34, 420);
      }
    } else { this.stepLift[0] = this.stepLift[1] = 0; this.bob *= 0.8; }
    if (done && t > 0.2) this.setState('idle');
  }

  // 1) 톱니 주먹 발사 (하단 → 점프 / 상단 → 숙이기)
  s_punch(dt, world, t) {
    const p = this.P, A = this.A, F = this.F;
    if (this.at(0.001)) {
      this.pSide = p && p.cx < this.bx ? -1 : 1;
      this.lanes = this.phase >= 1 ? (Math.random() < 0.5 ? ['low', 'high'] : ['high', 'low']) : [Math.random() < 0.55 ? 'low' : 'high'];
      if (this.inferno) this.lanes.push(this.lanes[0] === 'low' ? 'high' : 'low');
      this.pI = -1;
    }
    const per = 1.75;
    const i = Math.floor(t / per), lt = t - i * per;
    if (i >= this.lanes.length) { this.setState('idle'); return; }
    const side = this.pSide;
    // 두 번째 발사는 반대 팔(같은 방향으로 몸을 틀어)
    const arm = this.armOf(i % 2 ? -side : side);
    const lane = this.lanes[i];
    const ly = lane === 'low' ? F - 36 : F - 80;
    const sh = this.shoulder(arm.side);
    if (this.pI !== i) { this.pI = i; arm.fly = false; arm.planted = false; audio.sfx('charge_ready', { vol: 0.5, pitch: 0.5 }); }
    const edge = side > 0 ? A.x1 - 50 : A.x0 + 50;
    if (lt < 0.72) {
      // 당기기 + 조준 (레인 경고)
      arm.tx = sh.x - side * 30 + (arm.side !== side ? side * 120 : 0); arm.ty = ly - 30; arm.k = 8;
      arm.glow = Math.min(1, lt / 0.6);
      this.laneWarn = { y0: ly - (lane === 'low' ? 36 : 34), h: lane === 'low' ? 72 : 60, x0: Math.min(arm.fx, edge), x1: Math.max(arm.fx, edge), k: lt / 0.72 };
      if (this.every(0.08, 0, 0.72)) world.fx.emit('smoke', arm.fx, arm.fy, { color: '#d8d4e0', size: 16, speed: 60, alpha: 0.5 });
    } else if (lt < 0.72 + 0.02) {
      this.laneWarn = null;
      arm.fly = true; arm.fy = ly; arm.vx = side * 1250; arm.chain = 0;
      audio.sfx('shotgun', { vol: 0.8, pitch: 0.6 }); impact(world, { shake: 6, time: 0.2 });
      world.fx.burst('smoke', arm.fx, arm.fy, 12, { color: '#e8e4f0', speed: 160 });
      const hb = { x: 0, y: ly - (lane === 'low' ? 36 : 32), w: 92, h: lane === 'low' ? 72 : 64 };
      this.zone({ x: 0, y: 0, w: 1, h: 1, life: 1.0, mv: 1.25, kb: [480 * side, -380], rects: () => { hb.x = arm.fx - 46; return [hb]; } });
    }
    if (arm.fly) {
      if (lt < 1.2) {
        arm.fx += arm.vx * dt;
        if ((side > 0 && arm.fx >= edge) || (side < 0 && arm.fx <= edge)) {
          arm.fx = edge;
          if (!arm.hitWall) { arm.hitWall = true; impact(world, { shake: 9, time: 0.3 }); audio.sfx('clang'); world.fx.burst('spark', edge + side * 40, arm.fy, 22, { color: '#ffd080', speed: 420 }); world.fx.burst('dust', edge + side * 30, arm.fy, 8, {}); }
        }
      } else {
        // 사슬 감아 복귀
        const r = this.restFist(arm);
        arm.fx += (r.x - arm.fx) * Math.min(1, dt * 7); arm.fy += (r.y - arm.fy) * Math.min(1, dt * 7);
        if (lt > per - 0.1) { arm.fly = false; arm.hitWall = false; }
      }
      if (this.every(0.04)) world.fx.emit('spark', arm.fx - side * 40, arm.fy + rand(-10, 10), { color: '#ffb060', speed: 200, angle: side > 0 ? PI : 0, spread: 0.4 });
    }
    // 다른 팔은 대기
    const other = arm === this.arms[0] ? this.arms[1] : this.arms[0];
    if (!other.fly) { const r = this.restFist(other); other.tx = r.x; other.ty = r.y - 20; }
  }

  // 2) 주먹 내려찍기 + 충격파
  s_slam(dt, world, t) {
    const p = this.P, F = this.F, A = this.A;
    const n = this.phase >= 1 ? 2 : 1;
    const per = 2.35;
    const i = Math.floor(t / per), lt = t - i * per;
    if (i >= n) { for (const a of this.arms) a.planted = false; this.setState('idle'); return; }
    const side0 = p && p.cx < this.bx ? -1 : 1;
    if (this.at(i * per + 0.001)) { this.slamArm = i % 2 ? -side0 : side0; if (this.slamArm !== side0 && Math.abs((p?.cx ?? 0) - this.bx) > 360) this.slamArm = side0; }
    const arm = this.armOf(this.slamArm ?? side0);
    const reach = 470;
    if (lt < 0.85) {
      if (lt < 0.55 && p) this.slamX = clamp(p.cx, this.bx - reach, this.bx + reach);
      this.slamX = clamp(this.slamX ?? this.bx, A.x0 + 60, A.x1 - 60);
      arm.tx = this.slamX; arm.ty = F - 380; arm.k = 7; arm.planted = false;
      arm.glow = lt / 0.85;
      this.slamWarn = { x: this.slamX, k: lt / 0.85 };
    } else if (lt < 0.97) {
      this.slamWarn = null;
      arm.k = 60; arm.tx = this.slamX; arm.ty = F - 44;
      if (!this._slamZ) {
        this._slamZ = true;
        this.zone({ x: this.slamX - 72, y: F - 130, w: 144, h: 130, life: 0.14, mv: 1.5, kb: [320, -600] });
      }
    } else if (lt < 2.0) {
      this._slamZ = false;
      if (!arm.planted) {
        arm.planted = true; arm.fx = this.slamX; arm.fy = F - 44;
        impact(world, { shake: 16, time: 0.5, stop: 0.05 }); audio.sfx('explode', { pitch: 0.6 }); audio.sfx('hit_heavy', { pitch: 0.5 });
        world.fx.burst('dust', this.slamX, F - 6, 26, { speed: 320, angle: -PI / 2, spread: 1.5 });
        world.fx.burst('spark', this.slamX, F - 10, 20, { color: '#ffd080', speed: 460, angle: -PI / 2, spread: 1.4 });
        world.fx.ring(this.slamX, F - 4, { color: '#ffcf7a', r0: 20, r1: 180, life: 0.4, width: 8 });
        for (const d of [-1, 1]) this.shockwave(this.slamX + d * 60, d, this.phase >= 2 ? 52 : 44, 500);
        if (this.inferno) this.gearShrapnel(world, this.slamX, F - 60, 5);
      }
      arm.tx = this.slamX; arm.ty = F - 44;
    } else {
      arm.planted = false;
      const r = this.restFist(arm); arm.tx = r.x; arm.ty = r.y; arm.k = 5;
    }
    const other = arm === this.arms[0] ? this.arms[1] : this.arms[0];
    if (!other.planted) { const r = this.restFist(other); other.tx = r.x; other.ty = r.y; }
  }
  shockwave(x, d, H, speed) {
    const F = this.F;
    this.zone({
      x: x - 22, y: F - H, w: 44, h: H, life: 1.3, mv: 0.9, kb: [300 * d, -420], z: 7,
      tick(z, w, dt) { z.x += d * speed * dt; if (Math.random() < 0.6) w.fx.emit('dust', z.cx, F - 6, { speed: 80, angle: -PI / 2 - d * 0.5 }); if (Math.random() < 0.4) w.fx.emit('spark', z.cx, F - 4, { color: '#ffc070', speed: 200, angle: -PI / 2 - d * 0.6, spread: 0.4 }); },
      paint: (ctx, z) => {
        const a = Math.min(1, (1 - z.a) * 3);
        ctx.globalAlpha *= a;
        ctx.translate(z.cx, F); ctx.scale(d, 1);
        glowE(ctx, 0, -H * 0.4, 50, H * 0.8, '#ffb050', 0.5);
        ctx.beginPath(); ctx.moveTo(-60, 0); ctx.quadraticCurveTo(-10, -H * 0.3, 6, -H); ctx.quadraticCurveTo(16, -H * 0.5, 22, 0); ctx.closePath();
        const g = ctx.createLinearGradient(0, -H, 0, 0); g.addColorStop(0, 'rgba(255,240,200,0.95)'); g.addColorStop(0.5, 'rgba(255,160,70,0.7)'); g.addColorStop(1, 'rgba(120,60,20,0.3)');
        ctx.fillStyle = g; ctx.fill();
        // 튀는 파편
        ctx.fillStyle = '#6a5a4a';
        for (let i = 0; i < 4; i++) { ctx.fillRect(-10 - i * 12, -H * (0.5 + 0.4 * hash(i + z.t * 10)) , 5, 5); }
      },
      light: (L, z) => L.add(z.cx, F - 20, 90, '#ffa040', 0.5),
    });
  }
  gearShrapnel(world, x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = -PI / 2 + (i - (n - 1) / 2) * 0.35;
      this.shoot({ x, y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 520, w: 18, h: 18, gravity: 0.8, life: 3, spin: 14, render: smallGearRender, attack: { mv: 0.6 } });
    }
  }

  // 3) 증기 분출구 (번갈아 분출 — 항상 안전지대가 있음)
  s_steam(dt, world, t) {
    const A = this.A, F = this.F;
    this.armsRest(4);
    this.heat = Math.min(1, this.heat + dt * 0.4);
    const rounds = this.phase >= 2 || this.inferno ? 3 : 2;
    if (this.at(0.1)) {
      audio.sfx('mist', { vol: 0.8, pitch: 0.7 });
      const gap = 150;
      const xs = [];
      for (let x = A.x0 + 75; x < A.x1 - 40; x += gap) xs.push(x);
      for (let r = 0; r < rounds; r++) xs.forEach((x, k) => { if (k % 2 === r % 2) this.steamVent(x, 0.8 + r * 1.05); });
    }
    if (this.every(0.1, 0.1, 1 + rounds)) for (const s of [-1, 1]) world.fx.emit('smoke', this.wx(s * 150), this.wy(-300), { color: '#e8e4ee', size: 20, speed: 120, angle: -PI / 2 + s * 0.8, alpha: 0.5 });
    if (t > 1.3 + rounds * 1.05) this.setState('idle');
  }
  steamVent(x, warn) {
    const F = this.F, A = this.A;
    const H = Math.min(F - A.top, 360);
    this.zone({
      x: x - 34, y: F - H, w: 68, h: H, warn, life: 0.75, mv: 1, element: 'fire', kb: [220, -600], z: 3,
      onStart: (z, w) => { audio.sfx('mist', { vol: 0.6, pitch: 1.2 }); w.camera.shake(2, 0.2); },
      tick: (z, w) => {
        if (!z.on) { if (z.k > 0.4 && Math.random() < 0.35) w.fx.emit('smoke', x + rand(-10, 10), F - 8, { color: '#d8d4e0', size: 8, speed: 60, angle: -PI / 2, spread: 0.3, alpha: 0.5 }); }
        else if (Math.random() < 0.9) w.fx.emit('smoke', x + rand(-20, 20), F - rand(20, H), { color: '#f0eef4', size: rand(18, 30), speed: 80, vy: -200, alpha: 0.45 });
      },
      paint: (ctx, z) => this.paintVent(ctx, z, x, H),
      light: (L, z) => { if (z.on) { L.add(x, F - 40, 130, '#ff9040', 0.7); L.add(x, F - H * 0.55, 160, '#f0e8f0', 0.45); } },
    });
  }
  paintVent(ctx, z, x, H) {
    const F = this.F, t = this.t;
    // 바닥 격자 (항상)
    ctx.fillStyle = C(IRON_D); ctx.fillRect(x - 30, F - 6, 60, 6);
    ctx.fillStyle = C(BRASS_D); for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * 11 - 2, F - 6, 4, 6);
    glowE(ctx, x, F - 2, 36, 8, '#ff7a1a', 0.3 + 0.5 * z.k);
    if (!z.on) { warnFloor(ctx, x, F, 76, z.k, '#ffb070', t); return; }
    const grow = ease.outCubic(Math.min(1, z.a * 5)), fade = Math.min(1, (1 - z.a) * 3);
    const h = H * grow;
    ctx.globalAlpha *= fade;
    glowE(ctx, x, F - 20, 60, 40, '#ff8a30', 0.6);
    // 뭉게뭉게 증기 기둥
    for (let i = 0; i < 9; i++) {
      const k = i / 8;
      const yy = F - h * k;
      const r = 26 + 18 * k + Math.sin(t * 12 + i * 2) * 5;
      const xx = x + Math.sin(t * 7 + i * 1.7) * 7 * k;
      const g = ctx.createRadialGradient(xx - r * 0.3, yy - r * 0.3, r * 0.1, xx, yy, r);
      g.addColorStop(0, `rgba(255,255,255,${0.85 - k * 0.3})`); g.addColorStop(0.6, `rgba(210,205,220,${0.55 - k * 0.2})`); g.addColorStop(1, 'rgba(160,150,170,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(xx, yy, r, 0, TAU); ctx.fill();
    }
    glowE(ctx, x, F - 12, 30, 20, '#ffe0a0', 0.7);
    // 자체 발광 (어두운 조명 속에서도 보이게)
    glowE(ctx, x, F - h * 0.5, 46, h * 0.55, '#fff4e8', 0.28);
  }

  // 4) 회전 톱날 (어깨 톱니에서 발사 → 바닥 굴러오기)
  s_saws(dt, world, t) {
    const p = this.P;
    const n = (this.phase >= 1 ? 3 : 2) + (this.inferno ? 1 : 0);
    this.gearSpd = t < 0.6 ? 0.4 + t * 8 : 0.4;
    this.armsRest(5);
    for (const a of this.arms) a.ty -= 30;
    if (this.at(0.05)) audio.sfx('clock_tick', { vol: 0.7, pitch: 1.5 });
    for (let i = 0; i < n; i++) {
      if (this.at(0.65 + i * 0.32)) {
        const s = i % 2 ? -1 : 1;
        const sh = this.shoulder(s);
        const tx = p ? p.cx + rand(-60, 60) : this.bx;
        this.launchSaw(world, sh.x, sh.y - 20, Math.sign(tx - sh.x) || s, clamp(Math.abs(tx - sh.x) / 0.9, 150, 520));
      }
    }
    if (t > 0.9 + n * 0.32) { this.gearSpd = 0.4; this.setState('idle'); }
  }
  launchSaw(world, x, y, d, vx) {
    const F = this.F, A = this.A;
    audio.sfx('axe', { pitch: 0.7 });
    world.fx.burst('spark', x, y, 12, { color: '#ffd080', speed: 300 });
    const s = { x, y, vx: vx * d, vy: -620, ground: false, bounces: 0, rot: 0, d };
    const R0 = 26;
    this.zone({
      x: x - R0, y: y - R0, w: R0 * 2, h: R0 * 2, life: 5, mv: 0.9, kb: [300, -420], rehit: 0.6, z: 7,
      tick: (z, w, dt) => {
        if (!s.ground) {
          s.vy += 1800 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
          if (s.y >= F - R0) { s.y = F - R0; s.ground = true; s.vx = s.d * (this.phase >= 2 ? 460 : 380); w.fx.burst('spark', s.x, F - 2, 14, { color: '#ffd080', speed: 300, angle: -PI / 2, spread: 1 }); w.camera.shake(3, 0.1); audio.sfx('clang', { vol: 0.5 }); }
        } else {
          s.x += s.vx * dt;
          if (Math.random() < 0.8) w.fx.emit('spark', s.x - Math.sign(s.vx) * 10, F - 2, { color: '#ffc060', speed: 260, angle: -PI / 2 - Math.sign(s.vx) * 0.9, spread: 0.4 });
          if (s.x < A.x0 + R0 || s.x > A.x1 - R0) {
            s.x = clamp(s.x, A.x0 + R0, A.x1 - R0);
            if (s.bounces++ >= (this.phase >= 2 ? 2 : 1)) { z.dur = z.t - z.warn; w.fx.burst('shard', s.x, s.y, 12, { color: '#b8863b' }); audio.sfx('break_wall', { vol: 0.6 }); }
            else { s.vx = -s.vx; s.vy = -520; s.ground = false; audio.sfx('clang', { vol: 0.6 }); }
          }
        }
        s.rot += (s.vx / R0) * dt;
        z.x = s.x - R0; z.y = s.y - R0;
        z.attack.dir = Math.sign(s.vx) || 1;
      },
      paint: (ctx) => { ctx.translate(s.x, s.y); ctx.rotate(s.rot); drawSaw(ctx, R0, this.t); },
      light: (L) => L.add(s.x, s.y, 70, '#ffb050', 0.4),
    });
  }

  // 5) 시계추 휩쓸기 (바늘 끝 초승달 칼날 — 점프로 넘기)
  s_pendulum(dt, world, t) {
    const F = this.F;
    this.armsRest(5);
    const swings = this.phase >= 2 ? 4 : 3;
    const amp = this.phase >= 1 ? 1.15 : 1.0;
    const period = this.phase >= 2 ? 1.25 : 1.45;
    const T0 = 0.9;
    const pvx = this.bx, pvy = this.wy(-262);
    const len = F - 30 - pvy;
    if (t < T0) {
      const k = t / T0;
      this.pend = { a: -amp * ease.outCubic(k), len: len * ease.outCubic(k), k, warn: true };
      if (this.at(0.05)) { audio.sfx('bell', { vol: 0.9, pitch: 0.7 }); }
    } else {
      const u = (t - T0) / period;
      const a = -amp * Math.cos(u * PI);
      this.pend = { a, len, k: 1, warn: false };
      if (!this._pz) {
        this._pz = true;
        const hb = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
        this.zone({
          x: 0, y: 0, w: 1, h: 1, life: period * swings / 2 + 0.05, mv: 1.3, kb: [420, -520], rehit: 0.5,
          rects: () => {
            const pd = this.pend; if (!pd) return [];
            const bx = pvx + Math.sin(pd.a) * pd.len, by = pvy + Math.cos(pd.a) * pd.len;
            hb[0].x = bx - 62; hb[0].y = by - 18; hb[0].w = 124; hb[0].h = 36;
            hb[1].x = bx - 30; hb[1].y = by - 34; hb[1].w = 60; hb[1].h = 30;
            return hb;
          },
        });
      }
      // 바닥 긁는 불꽃
      const bx = pvx + Math.sin(a) * len, by = pvy + Math.cos(a) * len;
      if (by > F - 50 && Math.random() < 0.8) world.fx.burst('spark', bx, F - 4, 3, { color: '#ffd080', speed: 360, angle: -PI / 2 - Math.sign(Math.sin(u * PI)) * 0.8, spread: 0.5 });
      if (this.every(period / 2, T0)) audio.sfx('slash_heavy', { pitch: 0.5, vol: 0.8 });
      if (u >= swings / 2) { this._pz = false; this.pend = null; this.setState('idle'); }
    }
  }

  // 6) 코어 노출: 무릎 꿇고 가슴 시계판이 열림 (약점) — 불씨가 흩날림
  s_core(dt, world, t) {
    const F = this.F, A = this.A;
    const dur = 4.6;
    this.heat = Math.min(1, this.heat + dt);
    if (this.at(0.05)) { audio.sfx('mist', { vol: 1, pitch: 0.5 }); audio.sfx('warning', { vol: 0.4 }); world.game.toast('과열! 가슴의 코어가 드러났다!', '#ffb050'); }
    if (t < 0.5) { this.crouchT = 0; this.bob = Math.sin(t * 60) * 3; }
    else if (t < dur) {
      this.crouchT = 1; this.doorT = 1;
      if (this.at(0.55)) { impact(world, { shake: 10, time: 0.4 }); audio.sfx('land', { pitch: 0.4 }); world.fx.burst('dust', this.bx, F - 4, 30, { speed: 260, angle: -PI / 2, spread: 1.6 }); }
      for (const a of this.arms) { a.tx = this.wx(a.side * 190); a.ty = F - 40; a.k = 4; }
      if (this.every(this.phase >= 2 ? 0.28 : 0.4, 0.8, dur - 0.4)) {
        const x = this.bx + rand(-60, 60), y = this.wy(-262);
        this.shoot({ x, y, vx: rand(-260, 260), vy: rand(-700, -520), w: 16, h: 16, gravity: 0.7, life: 3, render: emberRender, attack: { mv: 0.55, element: 'fire' }, light: { r: 50, color: FURN, i: 0.5 } });
      }
      if (this.every(0.07, 0.5, dur)) world.fx.emit('smoke', this.bx + rand(-120, 120), this.wy(rand(-340, -180)), { color: '#e8e4ee', size: 16, speed: 90, alpha: 0.45 });
    } else {
      this.crouchT = 0; this.doorT = 0;
      if (this.at(dur + 0.05)) {
        audio.sfx('mist', { vol: 1, pitch: 0.4 }); audio.sfx('boss_roar', { pitch: 0.6 });
        impact(world, { shake: 12, time: 0.5 });
        this.zone({ x: this.bx - 190, y: F - 300, w: 380, h: 300, life: 0.25, mv: 0.8, kb: [600, -500], element: 'fire',
          paint: (ctx, z) => { glowE(ctx, this.bx, F - 150, 260 * (0.6 + z.a), 180, '#fff0e0', 0.6 * (1 - z.a)); } });
        world.fx.burst('smoke', this.bx, this.wy(-250), 40, { color: '#f4f2f8', speed: 420, alpha: 0.6 });
      }
      this.heat = Math.max(0, this.heat - dt * 0.6);
    }
    if (t > dur + 0.8) this.setState('idle');
  }

  // 7) 자정의 종 (3페이즈): 종소리마다 충격파 + 떨어지는 톱니
  s_toll(dt, world, t) {
    const F = this.F, A = this.A, p = this.P;
    this.armsRest(4);
    const n = 3;
    if (this.at(0.05)) world.game.toast('자정의 종이 울린다…', '#ffe0a0');
    for (let i = 0; i < n; i++) {
      const ti = 0.6 + i * 0.95;
      if (this.at(ti)) {
        audio.sfx('bell', { vol: 1, pitch: 0.5 + i * 0.05 });
        impact(world, { shake: 9, time: 0.4, flash: '#ffe0a0', fa: 0.15 });
        world.fx.ring(this.bx, this.wy(-262), { color: '#ffe0a0', r0: 30, r1: 420, life: 0.7, width: 10 });
        for (const d of [-1, 1]) this.shockwave(this.bx + d * 120, d, 40, 520);
        for (let k = 0; k < 3; k++) this.fallingGear(world, clamp((p ? p.cx : A.cx) + rand(-320, 320), A.x0 + 40, A.x1 - 40), 0.75 + k * 0.12);
      }
    }
    if (t > 0.6 + n * 0.95 + 0.8) this.setState('idle');
  }
  fallingGear(world, x, warn) {
    const F = this.F, A = this.A;
    const st = { y: A.top - 40, vy: 0, rot: rand(0, TAU) };
    this.zone({
      x: x - 28, y: F - 60, w: 56, h: 60, warn, life: 2.2, mv: 1.1, kb: [250, -400],
      tick: (z, w, dt) => {
        if (z.t < z.warn) return;
        st.vy += 2400 * dt; st.y += st.vy * dt; st.rot += dt * 6;
        z.y = st.y - 28; z.h = 56;
        if (st.y >= F - 28) { w.fx.burst('spark', x, F - 4, 16, { color: '#ffd080', speed: 300, angle: -PI / 2, spread: 1.3 }); w.fx.burst('shard', x, F - 20, 8, { color: '#b8863b' }); w.camera.shake(4, 0.15); audio.sfx('clang', { vol: 0.5, pitch: 0.8 }); z.dur = z.t - z.warn; }
      },
      paint: (ctx, z) => {
        if (z.t < z.warn) { warnRect(ctx, x - 30, F - 70, 60, 70, z.k, '#ffb050', this.t); ctx.globalAlpha *= 0.5 * z.k; floorShadowE(ctx, x, F, 36); return; }
        ctx.translate(x, st.y); ctx.rotate(st.rot); drawGear(ctx, 28, 10, BRASS, 0);
      },
    });
  }

  // ───────────── 페이즈/사망 ─────────────
  onPhase(n, world) {
    this.coreQueued = true;
    this.gearSpd = 0.6;
    if (n >= 2) world.game.toast('태엽 거신이 폭주한다!', '#ff7050');
  }
  onDeath(world) {
    this.dying = 3.4; this.clearJobs();
    this.pend = null; this.laneWarn = null; this.slamWarn = null;
    for (const a of this.arms) { a.fly = false; a.planted = false; }
    audio.sfx('boss_roar', { pitch: 0.45 });
  }
  dyingTick(dt, world) {
    const d = this.dying;
    this.heat = 1; this.doorT = 1; this.crouchT = d < 2 ? 1.25 : 0.4;
    this.bob = Math.sin(this.t * 40) * 4 + (d < 1.2 ? (1.2 - d) * 120 : 0);
    this.gearSpd = 3;
    this.armsRest(3);
    for (const a of this.arms) a.ty += 60;
    this.tickB(dt, world);
    if (Math.random() < 0.35) {
      const x = this.bx + rand(-150, 150), y = this.wy(rand(-380, -60));
      world.fx.burst('fire', x, y, 8, { speed: 200 });
      world.fx.flash(x, y, { color: FURN, size: 90, life: 0.15 });
      if (Math.random() < 0.3) audio.sfx('explode', { vol: 0.5, pitch: rand(0.7, 1.1) });
    }
    if (Math.random() < 0.25) this.shootDebris(world);
    if (d < 0.5 && !this._boom) { this._boom = true; world.fx.flash(this.bx, this.wy(-250), { color: '#fff0c0', size: 420, life: 0.4 }); world.fx.ring(this.bx, this.wy(-250), { color: FURN_L, r0: 40, r1: 520, life: 0.6, width: 14 }); impact(world, { shake: 20, time: 0.8 }); audio.sfx('explode', { pitch: 0.5 }); }
  }
  shootDebris(world) {
    const x = this.bx + rand(-120, 120), y = this.wy(rand(-340, -120));
    world.fx.emit('shard', x, y, { color: pickCol(), size: rand(5, 10), speed: rand(200, 420), angle: -PI / 2 + rand(-1.2, 1.2) });
  }

  // ───────────── 조명 ─────────────
  lightsB(L) {
    const pw = this.power;
    L.add(this.bx, this.wy(-205), 320, FURN, (0.6 + this.heat * 0.4) * pw);
    L.add(this.bx, this.wy(-300), 300, '#ffe8c0', 0.35 * pw, false);
    L.add(this.bx, this.wy(-362), 120, EYE, 0.7 * pw);
    if (this.door > 0.3) L.add(this.bx, this.wy(-262), 260, FURN_L, this.door);
    for (const a of this.arms) if (a.glow > 0.1) L.add(a.fx, a.fy, 120, FURN, a.glow);
  }

  // ───────────── 그리기 ─────────────
  paintBack(ctx) {
    const F = this.F;
    // 경고 표시 (몸 뒤에 깔리도록)
    if (this.laneWarn) { const w = this.laneWarn; warnRect(ctx, w.x0, w.y0, w.x1 - w.x0, w.h, w.k, '#ff8030', this.t); }
    if (this.slamWarn) { const s = this.slamWarn; warnRect(ctx, s.x - 72, F - 130, 144, 130, s.k, '#ff5030', this.t); }
    if (this.pend?.warn) {
      const pvx = this.bx, pvy = this.wy(-262), amp = this.phase >= 1 ? 1.15 : 1;
      const len = F - 30 - pvy;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ffb050', 0.25 + 0.4 * this.pend.k); ctx.lineWidth = 3; ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.arc(pvx, pvy, len, PI / 2 - amp, PI / 2 + amp); ctx.stroke();
      ctx.restore();
    }
  }
  paintBody(ctx, world, flash) {
    const t = this.t;
    ctx.save();
    // 좌표계: 몸 중심 발 (bx, F)
    ctx.translate(this.bx, this.F);
    const cr = this.crouch;
    const lift = this.bob;
    // 뒤: 굴뚝
    for (const s of [-1, 1]) this.drawChimney(ctx, s * 70, this.ly(-350), s);
    // 다리
    for (const s of [-1, 1]) this.drawLeg(ctx, s, this.stepLift[s < 0 ? 0 : 1]);
    // 골반 기어박스
    this.drawPelvis(ctx, this.ly(-180));
    // 몸통
    this.drawTorso(ctx, this.ly(-262));
    // 어깨 톱니 + 팔
    for (const a of this.arms) this.drawArm(ctx, a);
    // 머리
    this.drawHead(ctx, this.look * 10, this.ly(-362));
    ctx.restore();
    // 시계추 (몸 앞)
    if (this.pend) this.drawPendulum(ctx);
  }
  /** 몸 지역 y (웅크림/흔들림 반영) */
  ly(y) { return this.wy(y) - this.F; }

  drawChimney(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-12, -62); ctx.lineTo(12, -62); ctx.lineTo(14, 0); ctx.closePath();
    ink(ctx, LG(ctx, 'co_chim', -14, 0, 14, 0, [0, IRON_L, 0.2, IRON_D, 0.6, IRON, 1, IRON_D]), 3);
    ctx.beginPath(); ctx.rect(-17, -70, 34, 10); ink(ctx, C(BRASS_D), 2.5);
    glowE(ctx, 0, -64, 14, 6, FURN, 0.5 * this.power);
    ctx.restore();
  }
  drawLeg(ctx, s, lift) {
    const cr = this.crouch;
    const hipX = s * 62, hipY = this.ly(-170);
    const footX = s * (92 + cr * 30), footY = -lift;
    const kneeX = s * (86 + cr * 40), kneeY = lerp(hipY, footY, 0.5) - 8 + cr * 20;
    // 허벅지 (황동)
    limb(ctx, hipX, hipY, kneeX, kneeY, 34, 30, BRASS, 'co_th');
    // 정강이 (철 + 피스톤)
    limb(ctx, kneeX, kneeY, footX, footY - 30, 30, 34, IRON, 'co_sh');
    // 피스톤 봉
    if (!R.fl) {
      ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(kneeX - s * 22, kneeY + 12); ctx.lineTo(footX - s * 24, footY - 40); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(kneeX - s * 21, kneeY + 12); ctx.lineTo(footX - s * 23, footY - 40); ctx.stroke();
    }
    // 무릎 톱니
    ctx.save(); ctx.translate(kneeX, kneeY); ctx.rotate(this.gearA * 2 * s); drawGear(ctx, 26, 10, BRASS, 1); ctx.restore();
    // 발 (장갑 부츠)
    ctx.save(); ctx.translate(footX, footY);
    ctx.beginPath();
    ctx.moveTo(-52, 0); ctx.lineTo(-44, -34); ctx.quadraticCurveTo(0, -46, 44, -34); ctx.lineTo(56, 0); ctx.closePath();
    ink(ctx, LG(ctx, 'co_foot', 0, -46, 0, 0, [0, IRON_L, 0.25, IRON, 1, IRON_D]), 3.5);
    if (!R.fl) {
      ctx.fillStyle = BRASS; ctx.fillRect(-46, -12, 96, 6);
      ctx.fillStyle = BRASS_L; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * 13, -24, 2.2, 0, TAU); ctx.fill(); }
      // 발끝 가시
      ctx.fillStyle = '#c8c4d0';
      for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(k * 30 - 6, 0); ctx.lineTo(k * 30 + s * 4, 10); ctx.lineTo(k * 30 + 6, 0); ctx.fill(); }
    }
    ctx.restore();
  }
  drawPelvis(ctx, y) {
    ctx.save(); ctx.translate(0, y);
    ctx.beginPath(); ctx.moveTo(-92, -22); ctx.lineTo(92, -22); ctx.lineTo(78, 28); ctx.lineTo(-78, 28); ctx.closePath();
    ink(ctx, LG(ctx, 'co_pel', 0, -22, 0, 28, [0, IRON_L, 0.2, IRON, 1, IRON_D]), 3.5);
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * 40, 4); ctx.rotate(-this.gearA * 3 * s); drawGear(ctx, 20, 9, BRASS, 1); ctx.restore(); }
    ctx.save(); ctx.translate(0, 0); ctx.rotate(this.gearA * 4); drawGear(ctx, 14, 8, COPPER, 1); ctx.restore();
    ctx.restore();
  }
  drawTorso(ctx, cy) {
    const t = this.t, fl = R.fl;
    ctx.save(); ctx.translate(0, cy);
    // 흉갑 실루엣
    ctx.beginPath();
    ctx.moveTo(-96, 86); ctx.lineTo(-120, 20); ctx.quadraticCurveTo(-138, -60, -112, -86);
    ctx.lineTo(-40, -100); ctx.quadraticCurveTo(0, -112, 40, -100); ctx.lineTo(112, -86);
    ctx.quadraticCurveTo(138, -60, 120, 20); ctx.lineTo(96, 86); ctx.quadraticCurveTo(0, 104, -96, 86); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'co_torso', -130, 0, 130, 0, [0, mix(BRASS_D, '#a8c0ff', 0.35), 0.12, BRASS_D, 0.45, BRASS, 0.7, mix(BRASS, BRASS_L, 0.35), 0.9, BRASS, 1, BRASS_D]), 4);
    if (!fl) {
      // 위쪽 빛 / 아래쪽 그늘
      ctx.save(); ctx.clip();
      ctx.fillStyle = LG(ctx, 'co_torso_v', 0, -110, 0, 100, [0, 'rgba(255,230,170,0.25)', 0.35, 'rgba(0,0,0,0)', 1, 'rgba(10,5,0,0.55)']);
      ctx.fillRect(-140, -115, 280, 220);
      // 판금 이음새
      ctx.strokeStyle = 'rgba(40,20,4,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (const x of [-80, 80]) { ctx.moveTo(x, -96); ctx.quadraticCurveTo(x * 1.15, 0, x * 0.95, 92); }
      ctx.moveTo(-120, 30); ctx.quadraticCurveTo(0, 44, 120, 30);
      ctx.stroke();
      ctx.fillStyle = BRASS_L;
      for (let i = 0; i < 9; i++) { const yy = -80 + i * 20; ctx.beginPath(); ctx.arc(-86 - Math.sin(i) * 3, yy, 2.2, 0, TAU); ctx.arc(86 + Math.sin(i) * 3, yy, 2.2, 0, TAU); ctx.fill(); }
      ctx.restore();
      // 용광로 창살 (배)
      const hot = 0.6 + 0.4 * Math.sin(t * 9) * 0.5 + this.heat * 0.4;
      ctx.fillStyle = IRON_D; ctx.fillRect(-58, 42, 116, 34);
      for (let i = 0; i < 7; i++) {
        const x = -50 + i * 16;
        ctx.fillStyle = RG(ctx, 'co_furn', 0, 59, 2, 0, 59, 60, [0, FURN_L, 0.5, FURN, 1, '#6a1a04']);
        ctx.fillRect(x, 46, 9, 26);
      }
      glowE(ctx, 0, 59, 90, 40, FURN, 0.5 * hot * this.power);
    }
    // 시계판 / 코어
    this.drawClock(ctx);
    ctx.restore();
  }
  drawClock(ctx) {
    const t = this.t, fl = R.fl, d = this.door;
    // 톱니 테두리
    ctx.save(); ctx.rotate(this.gearA); drawGear(ctx, 76, 28, BRASS, 2); ctx.restore();
    // 코어 (문 뒤)
    if (d > 0.05) {
      ctx.beginPath(); ctx.arc(0, 0, 60, 0, TAU); ctx.fillStyle = C('#1a0802'); ctx.fill();
      if (!fl) {
        const pu = 0.8 + 0.2 * Math.sin(t * 14);
        glow(ctx, 0, 0, 120 * pu, FURN, 0.9 * d);
        const g = ctx.createRadialGradient(-10, -12, 4, 0, 0, 44);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, FURN_L); g.addColorStop(0.75, FURN); g.addColorStop(1, '#7a1a00');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 40 + Math.sin(t * 20) * 2, 0, TAU); ctx.fill();
        // 코어 우리
        ctx.strokeStyle = IRON_D; ctx.lineWidth = 4;
        ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * PI / 4 + t; ctx.moveTo(Math.cos(a) * 46, Math.sin(a) * 46); ctx.lineTo(-Math.cos(a) * 46, -Math.sin(a) * 46); } ctx.stroke();
        glow(ctx, 0, 0, 30, '#ffffff', 0.7 * d, true);
      }
    }
    // 시계판 문 (왼쪽 경첩으로 열림)
    if (d < 0.98) {
      ctx.save();
      ctx.translate(-62, 0); ctx.scale(Math.cos(d * PI * 0.62), 1); ctx.translate(62, 0);
      ctx.beginPath(); ctx.arc(0, 0, 62, 0, TAU);
      ink(ctx, fl ? '#fff' : RG(ctx, 'co_face', -16, -20, 4, 0, 0, 64, [0, '#fff6dc', 0.7, '#e8d8b0', 1, '#9a8458']), 4);
      if (!fl) {
        ctx.strokeStyle = BRASS_D; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 54, 0, TAU); ctx.stroke();
        // 로마 숫자 눈금
        ctx.fillStyle = '#2a1a0a';
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * TAU;
          ctx.save(); ctx.rotate(a); ctx.fillRect(-1.5, -52, 3, i % 3 ? 7 : 12); ctx.restore();
        }
        ctx.font = 'bold 11px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const RN = ['XII', 'III', 'VI', 'IX'];
        for (let i = 0; i < 4; i++) { const a = i / 4 * TAU - PI / 2; ctx.fillText(RN[i], Math.cos(a) * 36, Math.sin(a) * 36); }
        // 시곗바늘 (시계추 사용 중이면 분침 없음)
        ctx.strokeStyle = '#1a0a02'; ctx.lineCap = 'round';
        ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(this.clockH) * 26, -Math.cos(this.clockH) * 26); ctx.stroke();
        if (!this.pend) { ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(this.clockM) * 44, -Math.cos(this.clockM) * 44); ctx.stroke(); }
        ctx.fillStyle = BRASS; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
        // 유리 반사
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath(); ctx.ellipse(-18, -24, 26, 12, -0.6, 0, TAU); ctx.fill();
        if (this.heat > 0.3) { ctx.fillStyle = `rgba(255,90,20,${this.heat * 0.25})`; ctx.beginPath(); ctx.arc(0, 0, 62, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
  }
  drawArm(ctx, a) {
    const s = a.side;
    const shx = s * 138, shy = this.ly(-312);
    // 주먹 (몸 지역 좌표)
    let fx = a.fx - this.bx, fy = a.fy - this.F;
    // 2관절 IK
    let dx = fx - shx, dy = fy - shy, d = Math.hypot(dx, dy);
    const reach = L1 + L2 - 2;
    let wx = fx, wy = fy;
    if (d > reach) { wx = shx + dx / d * reach; wy = shy + dy / d * reach; d = reach; }
    const a0 = Math.atan2(wy - shy, wx - shx);
    const cosE = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const ea = a0 - s * Math.acos(cosE);
    const ex = shx + Math.cos(ea) * L1, ey = shy + Math.sin(ea) * L1;
    // 사슬 (발사 중: 손목 → 주먹)
    if (a.fly || Math.hypot(fx - wx, fy - wy) > 4) {
      ctx.save();
      ctx.strokeStyle = C('#3a3844'); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(fx, fy); ctx.stroke();
      if (!R.fl) {
        ctx.strokeStyle = '#9a98a8'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.lineDashOffset = -this.t * 200;
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(fx, fy); ctx.stroke();
      }
      ctx.restore();
    }
    limb(ctx, shx, shy, ex, ey, 30, 26, BRASS, 'co_ua');
    limb(ctx, ex, ey, wx, wy, 26, 30, IRON, 'co_fa');
    if (!R.fl) {
      ctx.strokeStyle = '#d8dce8'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      const nx = -(wy - ey) / L2, ny = (wx - ex) / L2;
      ctx.beginPath(); ctx.moveTo(ex + nx * 18, ey + ny * 18); ctx.lineTo(wx + nx * 20, wy + ny * 20); ctx.stroke();
    }
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(-this.gearA * 3); drawGear(ctx, 22, 9, BRASS, 1); ctx.restore();
    // 어깨 톱니 + 견갑
    ctx.save(); ctx.translate(shx, shy); ctx.rotate(this.gearA * s * 1.5); drawGear(ctx, 50, 16, BRASS, 2); ctx.restore();
    ctx.save(); ctx.translate(shx, shy - 18);
    ctx.beginPath(); ctx.moveTo(-s * 48, 12); ctx.quadraticCurveTo(-s * 40, -38, s * 18, -44); ctx.quadraticCurveTo(s * 64, -30, s * 70, 10); ctx.quadraticCurveTo(s * 10, -6, -s * 48, 12);
    ink(ctx, LG(ctx, 'co_pau' + s, 0, -44, 0, 12, [0, IRON_L, 0.3, IRON, 1, IRON_D]), 3);
    ctx.fillStyle = C('#d8d4e0');
    for (let k = 0; k < 3; k++) { const bx = s * (0 + k * 22), by = -38 + k * 8; ctx.beginPath(); ctx.moveTo(bx - 6, by + 4); ctx.lineTo(bx + s * 6, by - 26 + k * 6); ctx.lineTo(bx + 6, by + 4); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // 톱니 주먹
    ctx.save(); ctx.translate(fx, fy);
    ctx.rotate(a.fly ? this.t * 14 * s : this.gearA * 2);
    drawGear(ctx, 44, 12, IRON, 3);
    if (!R.fl) {
      ctx.fillStyle = LG(ctx, 'co_knk', -30, 0, 30, 0, [0, '#6a6070', 0.5, '#c8c4d0', 1, '#4a4450']);
      for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.arc(k * 20, -16, 11, 0, TAU); ctx.fill(); }
      if (a.glow > 0.02) { glow(ctx, 0, 0, 90, FURN, a.glow); glow(ctx, 0, 0, 30, '#ffffff', a.glow * 0.8, true); }
    }
    ctx.restore();
  }
  drawHead(ctx, lx, y) {
    const t = this.t, fl = R.fl;
    ctx.save(); ctx.translate(lx, y);
    // 목 톱니
    ctx.save(); ctx.translate(0, 34); ctx.rotate(this.gearA * 2); drawGear(ctx, 24, 10, IRON, 1); ctx.restore();
    // 투구
    ctx.beginPath();
    ctx.moveTo(-36, 30); ctx.lineTo(-40, -8); ctx.quadraticCurveTo(-38, -40, 0, -52); ctx.quadraticCurveTo(38, -40, 40, -8); ctx.lineTo(36, 30); ctx.quadraticCurveTo(0, 42, -36, 30); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'co_helm', -40, 0, 40, 0, [0, mix(IRON_D, '#a8c0ff', 0.4), 0.15, IRON_D, 0.5, IRON, 0.8, IRON_L, 1, IRON_D]), 3.5);
    // 뿔/가시
    ctx.fillStyle = C('#d8d4e0');
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 30, -30); ctx.quadraticCurveTo(s * 56, -60, s * 50, -92); ctx.quadraticCurveTo(s * 42, -58, s * 16, -44); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'co_horn' + s, 0, -90, 0, -30, [0, '#fff', 0.4, '#b8b4c4', 1, '#4a4652']), 2.5);
    }
    ctx.beginPath(); ctx.moveTo(-7, -48); ctx.lineTo(0, -80); ctx.lineTo(7, -48); ctx.closePath(); ink(ctx, C('#c8c4d0'), 2);
    // 황동 테
    ctx.fillStyle = C(BRASS); ctx.fillRect(-38, -12, 76, 7);
    // 면갑 틈 + 눈
    ctx.fillStyle = C('#050306'); ctx.beginPath(); ctx.moveTo(-30, 2); ctx.lineTo(30, 2); ctx.lineTo(24, 12); ctx.lineTo(-24, 12); ctx.closePath(); ctx.fill();
    if (!fl) {
      const pw = this.power, flick = 0.85 + 0.15 * Math.sin(t * 30);
      const ec = this.phase >= 2 ? '#ffffff' : EYE;
      for (const s of [-1, 1]) { glow(ctx, s * 13, 7, 30, EYE, 0.8 * pw * flick); ctx.fillStyle = ec; ctx.globalAlpha = pw; ctx.fillRect(s * 13 - 7, 5, 14, 4); ctx.globalAlpha = 1; }
      // 턱 창살
      ctx.strokeStyle = '#0a080c'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(i * 8, 16); ctx.lineTo(i * 7, 30); } ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,190,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-30, -30); ctx.quadraticCurveTo(0, -48, 26, -34); ctx.stroke();
    }
    ctx.restore();
  }
  drawPendulum(ctx) {
    const pd = this.pend, fl = R.fl;
    const pvx = this.bx, pvy = this.wy(-262);
    ctx.save();
    ctx.translate(pvx, pvy); ctx.rotate(-pd.a);
    const L = pd.len;
    // 막대 (시곗바늘 장식)
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-4, L - 20); ctx.lineTo(4, L - 20); ctx.lineTo(5, 0); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'co_rod', -5, 0, 5, 0, [0, BRASS_D, 0.5, BRASS_L, 1, BRASS_D]), 2.5);
    ctx.beginPath(); ctx.moveTo(0, L * 0.35 - 16); ctx.lineTo(12, L * 0.35); ctx.lineTo(0, L * 0.35 + 16); ctx.lineTo(-12, L * 0.35); ctx.closePath(); ink(ctx, C(BRASS), 2);
    // 초승달 칼날
    ctx.translate(0, L);
    ctx.beginPath();
    ctx.moveTo(-66, -26); ctx.quadraticCurveTo(0, 36, 66, -26); ctx.quadraticCurveTo(0, 6, -66, -26); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'co_blade', 0, -26, 0, 18, [0, '#6a6870', 0.5, '#d8dce8', 1, '#ffffff']), 3);
    if (!fl) {
      const sp = Math.abs(Math.cos((this.st - 0.9) / 1.4 * PI)) * (pd.warn ? 0 : 1);
      ctx.strokeStyle = rgba('#ffb050', 0.4 + 0.5 * sp); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-64, -24); ctx.quadraticCurveTo(0, 36, 64, -24); ctx.stroke();
      glowE(ctx, 0, 8, 80, 26, FURN, 0.3 + sp * 0.4);
      ctx.fillStyle = BRASS; ctx.beginPath(); ctx.arc(0, -16, 10, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 휘두름 잔상
    if (!pd.warn && !fl) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,190,110,0.25)'; ctx.lineWidth = 34;
      const a = PI / 2 - pd.a;
      ctx.beginPath(); ctx.arc(pvx, pvy, pd.len, a - 0.25, a + 0.25); ctx.stroke();
      ctx.restore();
    }
  }
}

// ───────────── 도형 도우미 ─────────────
/** 원통형 팔다리 (지역 그라디언트 캐시) */
function limb(ctx, x0, y0, x1, y1, r0, r1, col, key) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  ctx.beginPath();
  ctx.moveTo(0, -r0); ctx.lineTo(L, -r1); ctx.arc(L, 0, r1, -PI / 2, PI / 2); ctx.lineTo(0, r0); ctx.arc(0, 0, r0, PI / 2, -PI / 2);
  ctx.closePath();
  const rr = Math.max(r0, r1);
  const g = R.fl ? '#fff' : LG(ctx, key + col + rr, 0, -rr, 0, rr, [0, mix(col, '#fff4d8', 0.45), 0.25, col, 0.7, mix(col, '#000', 0.45), 0.92, mix(col, '#9fb8ff', 0.3), 1, mix(col, '#000', 0.6)]);
  ink(ctx, g, 3);
  if (!R.fl) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); for (const k of [0.3, 0.7]) { ctx.moveTo(L * k, -lerp(r0, r1, k)); ctx.lineTo(L * k, lerp(r0, r1, k)); } ctx.stroke();
  }
  ctx.restore();
}
/** 톱니바퀴: r 반지름, n 톱니 수, style 0 단순/1 살/2 큰 테/3 주먹 */
function drawGear(ctx, r, n, col, style = 1) {
  const fl = R.fl;
  ctx.beginPath();
  const tooth = r * 0.16, inner = r - tooth;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU, a1 = (i + 0.5) / n * TAU;
    const w = PI / n * 0.45;
    ctx.lineTo(Math.cos(a0 - w) * inner, Math.sin(a0 - w) * inner);
    ctx.lineTo(Math.cos(a0 - w * 0.6) * r, Math.sin(a0 - w * 0.6) * r);
    ctx.lineTo(Math.cos(a0 + w * 0.6) * r, Math.sin(a0 + w * 0.6) * r);
    ctx.lineTo(Math.cos(a0 + w) * inner, Math.sin(a0 + w) * inner);
    ctx.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
  }
  ctx.closePath();
  ink(ctx, fl ? '#fff' : RG(ctx, 'gear' + col + r, -r * 0.35, -r * 0.4, r * 0.05, 0, 0, r, [0, mix(col, '#fff6dc', 0.5), 0.5, col, 0.9, mix(col, '#000', 0.5), 1, mix(col, '#9fb8ff', 0.35)]), Math.max(2, r * 0.06));
  if (fl) return;
  if (style === 1 || style === 3) {
    ctx.fillStyle = mix(col, '#000', 0.55);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill();
    if (style === 1) for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.14, 0, TAU); ctx.fill(); }
    ctx.fillStyle = mix(col, '#fff', 0.3); ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, TAU); ctx.fill();
  } else if (style === 2) {
    ctx.strokeStyle = mix(col, '#000', 0.5); ctx.lineWidth = r * 0.08;
    ctx.beginPath(); ctx.arc(0, 0, inner * 0.82, 0, TAU); ctx.stroke();
    ctx.fillStyle = mix(col, '#fff', 0.3);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * inner * 0.9, Math.sin(a) * inner * 0.9, r * 0.035 + 1, 0, TAU); ctx.fill(); }
  }
}
function drawSaw(ctx, r, t) {
  glow(ctx, 0, 0, r * 2.2, '#ff9a40', 0.35);
  drawGear(ctx, r, 14, '#8a8894', 0);
  ctx.fillStyle = '#2a2830'; ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, TAU); ctx.fill();
  ctx.fillStyle = BRASS; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,120,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, TAU); ctx.stroke();
}
function smallGearRender(ctx, p) { ctx.rotate(p.rot); drawGear(ctx, 11, 8, BRASS, 1); }
function emberRender(ctx, p) {
  glow(ctx, 0, 0, 26, FURN, 0.8);
  ctx.fillStyle = '#fff2c0'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
}
function floorShadowE(ctx, x, F, r) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(x, F - 2, r, r * 0.22, 0, 0, TAU); ctx.fill();
}
const DEBRIS = [BRASS, IRON, COPPER, '#8a8894'];
const pickCol = () => DEBRIS[Math.floor(Math.random() * DEBRIS.length)];
