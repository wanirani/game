// 7장 보스: 키메라 호문쿨루스 — 연금술이 낳은 세 머리 괴수 (사자 몸 + 산양 머리 + 뱀 꼬리, 등에 영약 유리관)
// 패턴: 사자 도약(착지 충격) / 산양 주문(산성 플라스크·유도 녹염·낙뢰) / 뱀 꼬리 휩쓸기·독침 / 산성 분사(바닥 웅덩이) / 돌진 / 발톱 연격
// 페이즈: 1 = 뱀 머리 각성(독자적으로 독 발사) · 2 = 광폭화(유리관 파열, 녹색 불길, 모든 머리 동시 행동)
import { ABoss, beginDraw, endDraw, C, rg, lg, glow, ink, rim, sheen, taper, eye, shadow, hash, opt, flames, bolt, PI, OUT, RIM, WARM, groundWave, erupt } from './a_common.js';
import { Hitbox } from '../projectiles.js';
import { rand, clamp, lerp, TAU, angleTo, rgba, ease } from '../../core/math.js';
import { audio } from '../../core/audio.js';

const FUR = '#8e6434', FUR2 = '#c8965a', FURD = '#2e1c0c', MANE = '#2a180e', MANE2 = '#5a3620', GOAT = '#8a8272', SNAKE = '#3a7a3a', SNAKE2 = '#c8d86a', ACID = '#7cff5a', GLASS = '#c8fff0';
const _Q = new Float32Array(40);
const S = 1.04; // 그림 배율

export class Chimera extends ABoss {
  setup() {
    this.crouch = 0; this.gait = 0; this.roar = 0; this.goatUp = 0; this.goatGlow = 0; this.tailA = 0; this.tailCoil = 0; this.snakeOpen = 0; this.claw = 0; this.lean = 0;
    this.snakeCool = 3; this.enraged = false; this.tubesBroken = false; this.fury = 0;
  }
  hurtboxes() { return [{ x: this.x + 18, y: this.y + 20, w: this.w - 36, h: this.h - 22 }]; }
  onIntro() { audio.sfx('boss_roar', { pitch: 0.7 }); this.roar = 1; this.goatUp = 1; }
  moves() {
    const p = this.player, far = p && Math.abs(p.cx - this.cx) > 380, behind = p && Math.sign(p.cx - this.cx) !== this.facing;
    return [['pounce', far ? 3 : 2], ['goat', 2.6], ['tail', behind ? 3 : 1.4], ['acid', 2], ['charge', far ? 2.2 : 1.2], ['swipe', far ? 0.3 : 2.6]];
  }
  idleMove(dt, world, p) {
    const A = this.A, dx = p.cx - this.cx;
    this.facePlayer();
    let v = Math.abs(dx) > 300 ? Math.sign(dx) * 150 * this.sp : Math.abs(dx) < 170 ? -Math.sign(dx) * 110 : 0;
    if ((v < 0 && this.x < A.x0 + 20) || (v > 0 && this.x + this.w > A.x1 - 20)) v = 0;
    this.vx = lerp(this.vx, v, Math.min(1, dt * 4));
    this.relax(dt);
  }
  relax(dt) {
    const k = Math.min(1, dt * 4);
    this.crouch = lerp(this.crouch, 0, k); this.roar = lerp(this.roar, 0, k); this.goatUp = lerp(this.goatUp, 0, k); this.goatGlow = lerp(this.goatGlow, 0, k);
    this.tailCoil = lerp(this.tailCoil, 0, k); this.claw = lerp(this.claw, 0, k); this.lean = lerp(this.lean, 0, k); this.snakeOpen = lerp(this.snakeOpen, 0, k);
  }
  think(dt, world) {
    super.think(dt, world);
    const p = this.player;
    this.gait += dt * (1.5 + Math.abs(this.vx) / 45);
    this.tailA += dt * (1.2 + this.fury);
    this.fury = lerp(this.fury, this.phase / 2, Math.min(1, dt * 2));
    // 뱀 머리 독자 행동 (1페이즈~)
    if (this.phase >= 1 && p && this.state !== 'tail' && this.state !== 'transform' && this.dying <= 0) {
      this.snakeCool -= dt * this.aggro;
      if (this.snakeCool < 0.4) this.snakeOpen = lerp(this.snakeOpen, 1, Math.min(1, dt * 8));
      if (this.snakeCool <= 0) { this.snakeCool = this.phase >= 2 ? 2.2 : 3.2; this.spitVenom(1); }
    }
    if (this.tubesBroken && Math.random() < dt * 14) { const tb = this.W(rand(-40, 30), -150); this.fx.emit('fire', tb.x, tb.y, { speed: 60, angle: -PI / 2, color: ACID, color2: '#e8ffb0' }); }
    else if (Math.random() < dt * 3) { const tb = this.W(rand(-40, 30), -150); this.fx.emit('magic', tb.x, tb.y, { speed: 30, angle: -PI / 2, color: ACID }); }
  }
  W(lx, ly) { return { x: this.cx + this.facing * lx * S, y: this.bottom + ly * S }; }
  snakeHead() { const pts = this.tailPts(); return this.W(pts[22], pts[23]); }
  goatHead() { return this.W(-8 + this.goatUp * 6, -168 - this.goatUp * 16); }
  lionMouth() { return this.W(122, -96 + this.crouch * 20); }
  spitVenom(n) {
    const p = this.player, h = this.snakeHead();
    for (let i = 0; i < n; i++) {
      const a = angleTo(h.x, h.y, p.cx, p.cy - 10) + (i - (n - 1) / 2) * 0.22;
      this.shoot({ x: h.x, y: h.y, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, w: 14, h: 14, render: drawVenom, color: ACID, life: 2.2, light: { r: 40, color: ACID, i: 0.5 }, trail: 'blood', trailOpts: { color: '#6adf4a' }, trailRate: 0.06, attack: { mv: 0.6, element: null, type: 'mag' } });
    }
    audio.sfx('splash', { pitch: 1.6, vol: 0.5 });
    this.snakeOpen = 1.2;
  }
  acidPool(x, life = 4) {
    const w = 110;
    this.world.add(new Hitbox({
      x: x - w / 2, y: this.floorY - 22, w, h: 22, team: 'enemy', owner: this, life, delay: 0, z: 1,
      attack: { owner: this, stats: this.stats, mv: 0.35, type: 'mag', kb: [120, -420], rehit: 0.6, dir: 1, tags: ['projectile'] },
      light: { r: 90, color: ACID, i: 0.6 },
      render: drawAcidPool, tick: (h, w2) => { if (Math.random() < 0.25) w2.fx.emit('magic', h.x + rand(0, h.w), h.y + 14, { speed: 30, angle: -PI / 2, color: ACID }); },
    }));
  }

  // ── 사자 도약 ──
  s_pounce(dt, world, p) {
    const A = this.A, W = 0.55, n = this.phase >= 2 || this.inferno ? 2 : 1, per = 1.5;
    const i = Math.floor(this.stateT / per), u = this.stateT - i * per;
    if (i >= n) { if (this.stateT > n * per) this.rest(0.9); return; }
    if (this.at(i * per)) { this.facePlayer(); this.vx = 0; this.landed = false; audio.sfx('boss_roar', { pitch: 1.2, vol: 0.5 }); }
    if (u < W) {
      this.crouch = ease.outCubic(u / W); this.vx *= 0.8;
      if (this.at(i * per + 0.25)) { this.tx = clamp(p.cx, A.x0 + this.w / 2 + 10, A.x1 - this.w / 2 - 10); this.warnCircle(this.tx, this.floorY, 120, W - 0.25 + 0.7, { color: '#ffb040' }); }
      return;
    }
    if (this.at(i * per + W)) { this.vy = -980; this.vx = (this.tx - this.cx) / 0.9; this.crouch = 0; this.claw = 1; this.roar = 1; audio.sfx('jump', { pitch: 0.5 }); if (this.phase >= 2) this.spitVenom(3); }
    if (!this.landed) {
      this.claw = 1; this.lean = this.vy < 0 ? -0.2 : 0.25;
      this.strikeRect({ x: this.x, y: this.y, w: this.w, h: this.h }, 1.2, { kb: [460, -420] });
      if (u > W + 0.15 && this.onGround) {
        this.landed = true; this.vx = 0; this.crouch = 0.6;
        this.impact(this.cx + this.facing * 60, this.floorY, 12, 0.05, '#ffd090');
        audio.sfx('hit_heavy', { pitch: 0.6 });
        for (const s of [-1, 1]) groundWave(this, this.cx + s * 70, s, { speed: 440, color: '#ffc070', style: 'dust', mv: 0.8, h: 40 });
      }
    }
  }

  // ── 산양 주문 ──
  s_goat(dt, world, p) {
    const A = this.A, W = 0.65;
    this.vx *= 0.85;
    this.goatUp = lerp(this.goatUp, 1, Math.min(1, dt * 6)); this.goatGlow = lerp(this.goatGlow, 1, Math.min(1, dt * 4));
    if (this.at(0)) {
      this.spell = (this.spellI = ((this.spellI ?? -1) + 1)) % (this.phase >= 1 ? 3 : 2);
      const g = this.goatHead();
      this.warnMark(g.x, g.y - 50, W, { color: ACID });
      audio.sfx('magic', { pitch: 0.6 }); audio.sfx('ghost', { pitch: 1.8, vol: 0.4 });
    }
    if (this.stateT < W) { const g = this.goatHead(); if (Math.random() < 0.8) world.fx.emit('magic', g.x + rand(-30, 30), g.y + rand(-30, 30), { vx: 0, vy: -40, speed: 30, color: ACID }); return; }
    const g = this.goatHead();
    if (this.spell === 0) {
      // 산성 플라스크: 포물선 → 착지 시 웅덩이
      const k = this.every(W, 0.18, 3 + this.phase);
      if (k >= 0) {
        const tx = clamp(p.cx + (k - 1) * 150 + rand(-30, 30), A.x0 + 40, A.x1 - 40), T = 0.85;
        this.warnCircle(tx, this.floorY, 55, T, { color: ACID });
        this.shoot({ x: g.x, y: g.y, vx: (tx - g.x) / T, vy: (this.floorY - 10 - g.y) / T - 0.5 * 2000 * 0.6 * T, w: 16, h: 16, behavior: 'arc', gravity: 0.6, collideWalls: 'land', render: drawAcidFlask, spin: 10, color: ACID, life: 3, attack: { mv: 0.7, type: 'mag' },
          onLand: (pr, w) => { pr.dead = true; w.fx.burst('blood', pr.cx, pr.cy, 10, { color: '#7cff5a', speed: 220 }); audio.sfx('splash', { pitch: 1.4, vol: 0.5 }); this.acidPool(pr.cx); } });
        audio.sfx('whip', { pitch: 1.5, vol: 0.4 });
      }
    } else if (this.spell === 1) {
      // 유도 녹염 3발
      const k = this.every(W, 0.2, 3);
      if (k >= 0) {
        const a = angleTo(g.x, g.y, p.cx, p.cy) + (k - 1) * 0.5;
        this.shoot({ x: g.x, y: g.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, w: 18, h: 18, render: 'fireball', color: '#6aff4a', behavior: 'homing', homingTurn: 1.6, homingDelay: 0.2, life: 3, light: { r: 60, color: ACID, i: 0.7 }, trail: 'fire', trailOpts: { color: '#6aff4a', color2: '#e8ffb0' }, trailRate: 0.04, attack: { mv: 0.75, element: 'fire', type: 'mag' } });
        audio.sfx('fire', { pitch: 1.3, vol: 0.6 });
      }
    } else {
      // 낙뢰 (플레이어 주변)
      const k = this.every(W, 0.3, 3);
      if (k >= 0) {
        const x = clamp(k === 0 ? p.cx : p.cx + (k === 1 ? -1 : 1) * rand(120, 200), A.x0 + 30, A.x1 - 30);
        this.beam({ x0: x, y0: A.floor - 520, x1: x, y1: A.floor, warn: 0.8, active: 0.2, fade: 0.2, width: 54, color: '#c8ff8a', warnColor: '#9aff6a', mv: 1.0, element: 'thunder', drawFn: drawGreenBolt,
          onFire: (b, w) => { audio.sfx('thunderclap', { vol: 0.7 }); w.camera.shake(6, 0.2); w.fx.burst('thunder', x, A.floor - 6, 14, { speed: 380, color: '#d8ffb0' }); } });
      }
    }
    if (this.stateT > W + 1.3) this.rest(1.0);
  }

  // ── 뱀 꼬리: 뒤에 있으면 휩쓸기, 앞에 있으면 독침 연사 ──
  s_tail(dt, world, p) {
    const behind = Math.sign(p.cx - this.cx) !== this.facing;
    this.vx *= 0.85;
    if (this.at(0)) { this.mode = behind ? 'whip' : 'spit'; audio.sfx('splash', { pitch: 0.6, vol: 0.5 }); }
    if (this.mode === 'whip') {
      const W = 0.5;
      const pv = this.W(-80, -100);
      if (this.at(0)) this.warn({ type: 'arc', px: pv.x, py: pv.y, r0: 40, r1: 250, a0: this.facing > 0 ? PI * 0.95 : -PI * 0.05, a1: this.facing > 0 ? PI * 1.6 : PI * 0.6, ccw: this.facing < 0, life: W, color: ACID });
      if (this.stateT < W) { this.tailCoil = lerp(this.tailCoil, 1, Math.min(1, dt * 8)); return; }
      if (this.stateT < W + 0.25) {
        this.tailCoil = lerp(1, -1, (this.stateT - W) / 0.25);
        if (this.at(W)) { audio.sfx('whip_crack', { pitch: 0.6 }); this.shake(5, 0.15); world.fx.slash(pv.x, pv.y, this.facing > 0 ? PI * 1.25 : -PI * 0.25, { len: 220, radius: 220, width: 28, color: ACID, arc: 1.8, life: 0.2 }); }
        const x0 = this.facing > 0 ? pv.x - 250 : pv.x, y0 = pv.y - 200;
        this.strikeRect({ x: x0, y: y0, w: 250, h: this.floorY - y0 }, 1.2, { kb: [420, -460], dir: -this.facing });
        return;
      }
      if (this.stateT > W + 0.8) this.rest(0.8);
    } else {
      const n = this.phase >= 1 ? 3 : 2;
      this.tailCoil = lerp(this.tailCoil, 0.6, Math.min(1, dt * 6));
      if (this.at(0)) { const h = this.snakeHead(); this.warnMark(h.x, h.y - 30, 0.5, { color: ACID }); }
      const k = this.every(0.5, 0.35, n);
      if (k >= 0) this.spitVenom(3);
      if (this.stateT > 0.5 + n * 0.35 + 0.3) this.rest(0.9);
    }
  }

  // ── 산성 분사: 등의 유리관에서 산성액을 흩뿌려 바닥 웅덩이 ──
  s_acid(dt, world, p) {
    const A = this.A, W = 0.7, n = 4 + this.phase;
    this.vx *= 0.8; this.crouch = lerp(this.crouch, 0.3, dt * 5);
    if (this.at(0)) {
      audio.sfx('splash', { pitch: 0.5 }); this.warnMark(this.cx, this.y - 50, W, { color: ACID });
      this.acidX = [];
      for (let i = 0; i < n; i++) this.acidX.push(clamp(i === 0 ? p.cx : rand(A.x0 + 60, A.x1 - 60), A.x0 + 60, A.x1 - 60));
      for (const x of this.acidX) this.warnCircle(x, this.floorY, 55, W + 0.7, { color: ACID });
    }
    if (this.stateT < W) { if (Math.random() < 0.8) { const tb = this.W(rand(-40, 30), -150); world.fx.emit('blood', tb.x, tb.y, { color: '#7cff5a', speed: 80, angle: -PI / 2 }); } return; }
    const k = this.every(W, 0.08, n);
    if (k >= 0) {
      const tb = this.W(-30 + k * 12, -155), tx = this.acidX[k], T = 0.7;
      this.shoot({ x: tb.x, y: tb.y, vx: (tx - tb.x) / T, vy: (this.floorY - 10 - tb.y) / T - 0.5 * 2000 * 0.6 * T, w: 16, h: 16, behavior: 'arc', gravity: 0.6, collideWalls: 'land', render: drawVenom, color: ACID, life: 3, attack: { mv: 0.6, type: 'mag' },
        onLand: (pr, w) => { pr.dead = true; w.fx.burst('blood', pr.cx, pr.cy, 10, { color: '#7cff5a', speed: 200 }); this.acidPool(pr.cx, 4.5); } });
      audio.sfx('splash', { pitch: 1.2, vol: 0.4 });
    }
    if (this.stateT > W + 1.0) this.rest(0.9);
  }

  // ── 돌진 ──
  s_charge(dt, world, p) {
    const A = this.A, W = 0.75;
    if (this.at(0)) {
      this.facePlayer(); this.cdir = this.facing; this.vx = 0;
      this.warn({ type: 'band', x0: A.x0, x1: A.x1, y0: A.floor - 150, y1: A.floor, life: W, color: '#ffb040', dir: this.cdir });
      this.warnMark(this.cx, this.y - 50, W); audio.sfx('boss_roar', { pitch: 0.9 });
    }
    if (this.stateT < W) { this.roar = 1; this.crouch = 0.3; this.vx = -this.cdir * 40; return; }
    this.vx = this.cdir * (820 + this.phase * 80); this.facing = this.cdir; this.roar = 0.6; this.crouch = 0;
    this.strikeRect({ x: this.x + 10, y: this.y + 10, w: this.w - 20, h: this.h - 10 }, 1.2, { kb: [520, -440] });
    if (Math.random() < 0.6) world.fx.emit('dust', this.cx - this.cdir * 80, this.floorY - 4, { speed: 80, angle: -PI / 2 - this.cdir * 0.8 });
    if (this.every(W, 0.05, 60) >= 0) { const s = { x: this.cx, b: this.bottom, f: this.facing, g: this.gait }; this.fx.ghost((ctx, a) => { const kg = this.gait; this.gait = s.g; ctx.save(); ctx.globalAlpha = a * 0.4; ctx.translate(s.x, s.b); ctx.scale(s.f * S, S); this.drawBody(ctx, this.t, true); ctx.restore(); this.gait = kg; }, 0.22, 'back'); }
    const hit = this.cdir > 0 ? this.x + this.w >= A.x1 - 6 : this.x <= A.x0 + 6;
    if (hit || this.stateT > W + 2.2) {
      this.vx = 0; this.impact(this.cx + this.cdir * 100, this.floorY - 60, 12, 0.06, '#ffd090');
      audio.sfx('hit_heavy', { pitch: 0.5 });
      if (this.phase >= 1) for (let i = 0; i < 3; i++) this.acidPool(this.cx - this.cdir * (120 + i * 160), 3.5);
      this.rest(1.0);
    }
  }

  // ── 발톱 연격 ──
  s_swipe(dt, world, p) {
    const n = 2 + (this.phase >= 2 ? 1 : 0), per = 0.55, W = 0.32;
    const i = Math.floor(this.stateT / per), u = this.stateT - i * per;
    if (i >= n) { this.vx *= 0.8; if (this.stateT > n * per + 0.3) this.rest(0.8); return; }
    if (this.at(i * per)) {
      this.facePlayer();
      const x0 = this.cx + this.facing * 60;
      this.warn({ type: 'band', x0: Math.min(x0, x0 + this.facing * 170), x1: Math.max(x0, x0 + this.facing * 170), y0: this.floorY - 150, y1: this.floorY, life: W, color: '#ff8a3a', dir: this.facing, arrows: false });
    }
    if (u < W) { this.claw = lerp(this.claw, 1, Math.min(1, dt * 10)); this.lean = -0.12; this.roar = 0.5; this.vx *= 0.7; return; }
    if (this.at(i * per + W)) {
      this.vx = this.facing * 280; audio.sfx('slash_heavy', { pitch: 0.8 });
      const c = this.W(110, -80);
      world.fx.slash(c.x, c.y, this.facing > 0 ? (i % 2 ? -0.6 : 0.6) : PI - (i % 2 ? -0.6 : 0.6), { len: 110, radius: 110, width: 22, color: '#ffc080', arc: 1.8, life: 0.18 });
    }
    this.lean = 0.15; this.vx *= 0.9;
    if (u < W + 0.15) { const x0 = this.cx + this.facing * 60; this.strikeRect({ x: Math.min(x0, x0 + this.facing * 170), y: this.floorY - 150, w: 170, h: 150 }, 1.15, { kb: [380, -360] }); }
  }

  // ── 페이즈 ──
  onPhase(n, world) {
    this.setState('transform'); this.transformTime = 1.5;
    world.banner = n === 1
      ? { text: '뱀의 각성', sub: '꼬리의 뱀이 눈을 뜨고 독니를 드러낸다', t: 1.8, color: ACID }
      : { text: '광폭화', sub: '유리관이 깨지며 영약이 온몸을 태운다', t: 2, color: '#b8ff5a' };
  }
  transformTick(dt, world, p) {
    this.vx = 0; this.roar = 1; this.goatUp = 1; this.goatGlow = 1; this.snakeOpen = 1; this.crouch = 0.3 + Math.sin(this.stateT * 30) * 0.05;
    if (this.at(0.35)) {
      this.phaseBurst(ACID);
      audio.sfx('boss_roar', { pitch: 0.6 });
      if (this.phase >= 2) { this.tubesBroken = true; this.enraged = true; audio.sfx('break_wall', { pitch: 1.4 }); for (let i = 0; i < 3; i++) { const tb = this.W(-30 + i * 30, -150); world.fx.burst('ice', tb.x, tb.y, 10, { color: GLASS, speed: 260 }); world.fx.burst('blood', tb.x, tb.y, 10, { color: '#7cff5a', speed: 260 }); } }
    }
    if (Math.random() < 0.8) world.fx.emit('fire', this.cx + rand(-80, 80), this.bottom - rand(20, 150), { speed: 120, angle: -PI / 2, color: ACID, color2: '#e8ffb0' });
  }
  phaseApply(n) { if (n >= 2) { this.tubesBroken = true; this.enraged = true; } }
  deathStart() { audio.sfx('boss_roar', { pitch: 0.5 }); }
  deathTick(dt) { this.vx = 0; this.roar = 1; this.goatUp = 1; this.crouch = Math.min(1, this.deathT * 0.6); this.snakeOpen = 1; }
  debrisPiece(i) { return { size: 12, draw: i % 3 === 0 ? drawGlassBit : i % 3 === 1 ? drawScaleBit : drawFurBit }; }
  extraLights(L) {
    const g = this.goatHead(); L.add(g.x, g.y, 60 + this.goatGlow * 60, ACID, 0.8);
    const tb = this.W(0, -150); L.add(tb.x, tb.y, 110 + this.fury * 50, ACID, 0.6);
    const m = this.lionMouth(); L.add(m.x - this.facing * 20, m.y - 20, 60, '#ffb040', 0.5);
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx, world) {
    beginDraw(this);
    const X = this.cx, B = this.bottom, t = this.t;
    shadow(ctx, X, this.floorY - 2, 140, 16, 0.6);
    ctx.save();
    const jx = this.flashT > 0 ? rand(-2, 2) : 0;
    ctx.translate(X + jx, B); ctx.scale(this.facing * S, S);
    if (this.enraged) glow(ctx, 0, -90, 220, ACID, 0.12 + 0.06 * Math.sin(t * 8));
    glow(ctx, 0, -90, 200, '#1a2a0a', 0.6);
    this.drawBody(ctx, t, false);
    ctx.restore();
    endDraw();
  }
  tailPts() {
    // 엉덩이(-84,-100)에서 뒤로 뻗는 S자 뱀 (12점)
    // 엉덩이에서 뒤·위로 치솟아 앞으로 휘는 전갈형 곡선 (coil>0: 뒤로 감아쥠, coil<0: 휘둘러 내림)
    const P = _Q, coil = this.tailCoil;
    let x = -86, y = -104, a = PI + 0.75 - coil * 0.6;
    for (let i = 0; i < 12; i++) {
      P[i * 2] = x; P[i * 2 + 1] = y;
      const w = Math.sin(this.tailA * 2 + i * 0.8) * (0.2 - i * 0.01);
      a += w * 0.4 + 0.2 * (1 - Math.max(0, -coil)) + coil * 0.06;
      const L = 15.5;
      x += Math.cos(a) * L; y += Math.sin(a) * L;
    }
    return P;
  }
  drawBody(ctx, t, ghost) {
    const g = this.gait, walk = clamp(Math.abs(this.vx) / 150, 0, 1), run = clamp(Math.abs(this.vx) / 600, 0, 1), cr = this.crouch;
    const air = !this.onGround && !ghost;
    const bob = Math.sin(g * 2) * (1 + run * 4) + cr * 18;
    const body = ghost ? '#6a8a3a' : null;
    ctx.save(); ctx.rotate(this.lean * 0.3);
    // 뱀 꼬리 (뒤)
    this.drawTail(ctx, t, ghost);
    // 먼 쪽 다리
    this.legL(ctx, -52, -84 + bob, g + PI * 0.5, false, true, air, body);
    this.legL(ctx, 48, -84 + bob, g + PI * 1.5, true, true, air, body);
    // 몸통 (사자)
    ctx.beginPath();
    ctx.moveTo(-100, -96 + bob);
    ctx.quadraticCurveTo(-104, -128 + bob, -64, -132 + bob);
    ctx.quadraticCurveTo(-10, -124 + bob, 34, -138 + bob);
    ctx.quadraticCurveTo(84, -148 + bob, 92, -108 + bob);
    ctx.quadraticCurveTo(96, -70 + bob, 64, -62 + bob);
    ctx.quadraticCurveTo(0, -56 + bob, -56, -62 + bob);
    ctx.quadraticCurveTo(-98, -66 + bob, -100, -96 + bob);
    ctx.closePath();
    ink(ctx, body ?? lg(ctx, 'chbody', 0, -146, 0, -52, [0, C(FUR2), 0.35, C(FUR), 0.8, C('#7a5a32'), 1, C(FURD)]), 3);
    if (!ghost) {
      rim(ctx, 0, 0, RIM, 4, 0.5, -146, -110);
      sheen(ctx, 60, -140, 40, -80, WARM, 0.18);
      // 어깨·허벅지 근육 덩어리
      ctx.save(); ctx.clip();
      ctx.fillStyle = rg(ctx, 'chsh', 58, -118, 2, 52, -100, 40, [0, 'rgba(255,220,160,0.35)', 1, 'rgba(255,220,160,0)']);
      ctx.beginPath(); ctx.arc(52, -100 + bob, 40, 0, TAU); ctx.fill();
      ctx.fillStyle = rg(ctx, 'chhip', -52, -112, 2, -58, -96, 40, [0, 'rgba(255,220,160,0.25)', 1, 'rgba(255,220,160,0)']);
      ctx.beginPath(); ctx.arc(-58, -96 + bob, 40, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(20,10,0,0.35)';
      ctx.beginPath(); ctx.ellipse(0, -60 + bob, 70, 14, 0, 0, TAU); ctx.fill();
      ctx.restore();
      // 근육 · 봉합 자국
      ctx.strokeStyle = C('rgba(60,36,16,0.6)'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(40, -128 + bob); ctx.quadraticCurveTo(52, -100 + bob, 44, -70 + bob); ctx.moveTo(-50, -124 + bob); ctx.quadraticCurveTo(-60, -96 + bob, -48, -68 + bob); ctx.stroke();
      ctx.strokeStyle = C('#2a1008'); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-10, -130 + bob); ctx.quadraticCurveTo(0, -96 + bob, -8, -62 + bob); ctx.stroke();
      for (let i = 0; i < 6; i++) { const y = -124 + i * 11 + bob, x = -6 + Math.sin(i) * 2; ctx.beginPath(); ctx.moveTo(x - 5, y - 2); ctx.lineTo(x + 5, y + 2); ctx.stroke(); }
      // 등의 뱀 비늘 (합성 부위)
      ctx.fillStyle = C('#2e5a2e');
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(-70 + i * 9, -118 + bob + Math.abs(i - 2) * 2, 6, 4, 0.3, 0, TAU); ctx.fill(); }
      // 유리관
      this.tubes(ctx, t, bob);
    }
    // 산양 머리 (등에서 솟은 목)
    this.drawGoat(ctx, t, bob, ghost);
    // 가까운 쪽 다리
    this.legL(ctx, -44, -80 + bob, g + PI * 1.5, false, false, air, body);
    this.legL(ctx, 56, -80 + bob, g + PI * 0.5, true, false, air, body);
    // 사자 머리 + 갈기
    this.drawLion(ctx, t, bob, ghost);
    ctx.restore();
  }
  legL(ctx, hx, hy, ph, front, far, air, body) {
    const walk = clamp(Math.abs(this.vx) / 150, 0, 1), cr = this.crouch;
    let a1 = Math.sin(ph) * (0.22 * walk + 0.25 * clamp(Math.abs(this.vx) / 600, 0, 1));
    let b = front ? -Math.max(0, Math.cos(ph)) * 0.6 * walk : Math.max(0, -Math.cos(ph)) * 0.5 * walk;
    if (air) { a1 = front ? 0.9 : -0.9; b = front ? -0.6 : 0.6; }
    if (front && this.claw > 0.2 && !air) { a1 += this.claw * 0.5; b -= this.claw * 0.3; }
    const L1 = 40 - cr * 10, L2 = 44;
    const kx = hx + Math.sin(a1) * L1, ky = hy + Math.cos(a1) * L1;
    const back = front ? 0 : 0.5;
    const fx = kx + Math.sin(a1 + b - back) * L2 * (front ? 1 : 0.6), fy = ky + Math.cos(a1 + b - back) * L2 * (front ? 1 : 0.6);
    const px = front ? fx : fx - 10, py = front ? fy : Math.min(-4, fy + 26);
    _Q[26] = hx; _Q[27] = hy; _Q[28] = kx; _Q[29] = ky; _Q[30] = fx; _Q[31] = fy; _Q[32] = px; _Q[33] = py;
    const pts = _Q.subarray(26, 34);
    taper(ctx, pts, front ? 3 : 4, far ? 30 : 36, 13);
    ink(ctx, body ?? (far ? C('#6a4a26') : lg(ctx, 'chleg' + front, hx - 18, 0, hx + 18, 0, [0, C('#7a5a32'), 0.5, C(FUR), 1, C(FUR2)])), 2.5);
    // 발 + 발톱
    ctx.beginPath(); ctx.ellipse(px + 6, py - 6, 15, 9, 0, 0, TAU); ink(ctx, body ?? C(far ? '#5a3e22' : FUR), 2);
    ctx.fillStyle = C('#f4ecd8');
    const cl = front ? 4 + this.claw * 6 : 3;
    for (let i = 0; i < 3; i++) { const x = px + 12 + i * 3, y = py - 8 + i * 4; ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.quadraticCurveTo(x + cl + 2, y, x + cl, y + 5); ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill(); }
  }
  tubes(ctx, t, bob) {
    for (let i = 0; i < 3; i++) {
      const x = -34 + i * 26, y = -140 + bob + Math.abs(i - 1) * 4, a = -0.25 + i * 0.25, h = 40 - Math.abs(i - 1) * 6;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      // 금속 받침
      ctx.beginPath(); ctx.rect(-10, -4, 20, 8); ink(ctx, lg(ctx, 'chclamp', 0, -4, 0, 4, [0, C('#c8a060'), 1, C('#4a3418')]), 1.5);
      if (!this.tubesBroken) {
        // 유리관
        ctx.beginPath(); ctx.rect(-7, -h, 14, h - 2);
        ctx.fillStyle = rgba('#0a2a14', 0.6); ctx.fill();
        // 액체
        const lv = h * (0.55 + Math.sin(t * 2 + i) * 0.08);
        ctx.fillStyle = C(ACID); ctx.fillRect(-6, -lv, 12, lv - 3);
        glow(ctx, 0, -lv / 2, 26, ACID, 0.6 + this.fury * 0.3);
        // 기포
        ctx.fillStyle = 'rgba(230,255,220,0.8)';
        for (let j = 0; j < 3; j++) { const by = -((t * 30 + j * 13 + i * 7) % lv); ctx.beginPath(); ctx.arc(Math.sin(t * 3 + j) * 3, by - 3, 1.4, 0, TAU); ctx.fill(); }
        // 유리 광택 + 외곽
        ctx.strokeStyle = C('#0a1a10'); ctx.lineWidth = 2; ctx.strokeRect(-7, -h, 14, h - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-5, -h + 2, 2.5, h - 8);
        ctx.beginPath(); ctx.rect(-8, -h - 5, 16, 6); ink(ctx, C('#8a7040'), 1.5);
      } else {
        // 깨진 관 + 녹색 불길
        ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(-7, -h * 0.5); ctx.lineTo(-3, -h * 0.35); ctx.lineTo(0, -h * 0.6); ctx.lineTo(4, -h * 0.4); ctx.lineTo(7, -h * 0.55); ctx.lineTo(7, -2); ctx.closePath();
        ctx.fillStyle = rgba('#0a2a14', 0.6); ctx.fill(); ctx.strokeStyle = C('#0a1a10'); ctx.lineWidth = 2; ctx.stroke();
        flames(ctx, 0, -h * 0.4, -PI / 2, 3, 30, t, ACID, 8, i, '#e8ffb0', 0.5);
      }
      ctx.restore();
    }
  }
  drawGoat(ctx, t, bob, ghost) {
    const up = this.goatUp, gx = -4 + up * 8, gy = -170 - up * 14 + bob * 0.5;
    // 목 (털 난 가는 목)
    const nq = _Q.subarray(34, 40);
    nq[0] = -22; nq[1] = -126 + bob; nq[2] = -18 + up * 2; nq[3] = (gy - 126 + bob) / 2 + 4; nq[4] = gx - 6; nq[5] = gy + 8;
    taper(ctx, nq, 3, 22, 13);
    ink(ctx, ghost ? '#6a8a3a' : lg(ctx, 'chgneck', -30, 0, 0, 0, [0, C('#6a6456'), 0.6, C('#9a927e'), 1, C('#b8b09a')]), 2.2);
    if (!ghost) { ctx.strokeStyle = C('rgba(40,36,28,0.5)'); ctx.lineWidth = 1.2; ctx.beginPath(); for (let i = 0; i < 4; i++) { const y = -130 + bob - i * 10; ctx.moveTo(-26 + i, y); ctx.lineTo(-18 + i, y - 4); } ctx.stroke(); }
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(-0.25 - up * 0.2); ctx.scale(1.15, 1.15);
    // 뿔 (굵은 나선형 숫양 뿔)
    for (const k of [0.85, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const u = i / 16, a = -PI * 0.35 - u * PI * 1.55, r = 20 * k * (1 - u * 0.55);
        const x = -12 * k + Math.cos(a) * r - u * 4, y = -8 + Math.sin(a) * r * 0.9;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = C(OUT); ctx.lineWidth = 11 * k; ctx.stroke();
      ctx.strokeStyle = ghost ? '#6a8a3a' : C(k < 1 ? '#6a5c44' : '#a8987a'); ctx.lineWidth = 8 * k; ctx.stroke();
      if (!ghost) { ctx.strokeStyle = C('rgba(40,30,15,0.7)'); ctx.lineWidth = 8 * k; ctx.setLineDash([1.5, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = C('rgba(255,245,220,0.4)'); ctx.lineWidth = 2; ctx.stroke(); }
    }
    // 머리
    ctx.beginPath(); ctx.moveTo(-10, -12); ctx.quadraticCurveTo(6, -18, 14, -8); ctx.lineTo(30, 6); ctx.quadraticCurveTo(32, 14, 22, 14); ctx.lineTo(4, 12); ctx.quadraticCurveTo(-12, 8, -10, -12); ctx.closePath();
    ink(ctx, ghost ? '#6a8a3a' : lg(ctx, 'chgoat', 0, -18, 0, 14, [0, C('#c8c0ac'), 0.6, C(GOAT), 1, C('#4a4438')]), 2.4);
    if (!ghost) {
      rim(ctx, -16, 4, RIM, 3, 0.5);
      // 수염
      ctx.beginPath(); ctx.moveTo(16, 12); ctx.lineTo(14, 30 + Math.sin(t * 3) * 2); ctx.lineTo(22, 13); ctx.closePath(); ink(ctx, C('#6a6456'), 1.2);
      // 눈 (가로 동공)
      ctx.fillStyle = C('#1a1a10'); ctx.beginPath(); ctx.ellipse(6, -4, 5, 4, 0, 0, TAU); ctx.fill();
      eye(ctx, 6, -4, 2.6 + this.goatGlow * 1.2, ACID, 0.8 + this.goatGlow * 0.6, '#f0ffe0');
      ctx.fillStyle = '#0a0a04'; ctx.fillRect(4, -4.6, 5, 1.4);
      // 귀
      ctx.beginPath(); ctx.moveTo(-6, -8); ctx.quadraticCurveTo(-16, 0, -22, 4); ctx.quadraticCurveTo(-12, 4, -4, -2); ctx.closePath(); ink(ctx, C('#7a7262'), 1.5);
      if (this.goatGlow > 0.05) { glow(ctx, 10, -10, 50, ACID, this.goatGlow * 0.6); this.goatRune(ctx, t); }
    }
    ctx.restore();
  }
  goatRune(ctx, t) {
    ctx.save(); ctx.translate(10, -40); ctx.rotate(t * 1.5);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= this.goatGlow;
    ctx.strokeStyle = rgba(ACID, 0.8); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 5; i++) { const a = (i * 2 / 5) * TAU - PI / 2; ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18); } ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
  drawTail(ctx, t, ghost) {
    const P = this.tailPts();
    taper(ctx, P, 12, 30, 11);
    ink(ctx, ghost ? '#6a8a3a' : lg(ctx, 'chsnake', -84, -130, -84, -40, [0, C('#5a9a4a'), 0.5, C(SNAKE), 1, C('#1a3a1a')]), 2.5);
    if (!ghost) {
      // 비늘 무늬 + 배 줄
      ctx.save(); ctx.clip();
      ctx.strokeStyle = C('rgba(10,30,10,0.5)'); ctx.lineWidth = 1.2;
      for (let i = 1; i < 11; i++) { const x = P[i * 2], y = P[i * 2 + 1]; ctx.beginPath(); ctx.arc(x, y, 6, 0.3, PI - 0.3); ctx.stroke(); }
      ctx.strokeStyle = C(SNAKE2); ctx.lineWidth = 4; ctx.globalAlpha *= 0.6;
      ctx.beginPath(); ctx.moveTo(P[0], P[1] + 8); for (let i = 1; i < 11; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1] + 7 - i * 0.3); ctx.stroke();
      ctx.restore();
    }
    // 뱀 머리
    const hx = P[22], hy = P[23], a = Math.atan2(P[23] - P[21], P[22] - P[20]);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a); if (Math.cos(a) < 0) ctx.scale(1, -1);
    const op = clamp(this.snakeOpen, 0, 1.2);
    ctx.save(); ctx.rotate(op * 0.35);
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(24, 2); ctx.quadraticCurveTo(26, 8, 18, 9); ctx.lineTo(-4, 8); ctx.closePath();
    ink(ctx, ghost ? '#6a8a3a' : C('#2e5a2e'), 2);
    ctx.restore();
    ctx.save(); ctx.rotate(-op * 0.35);
    ctx.beginPath(); ctx.moveTo(-8, -10); ctx.quadraticCurveTo(6, -16, 22, -6); ctx.quadraticCurveTo(30, -1, 24, 2); ctx.lineTo(-6, 4); ctx.quadraticCurveTo(-12, -2, -8, -10); ctx.closePath();
    ink(ctx, ghost ? '#6a8a3a' : lg(ctx, 'chshead', 0, -16, 0, 4, [0, C('#6aaa5a'), 1, C('#1a3a1a')]), 2.2);
    if (!ghost) {
      eye(ctx, 8, -6, 2.2, '#ffe040', 0.9 + this.fury * 0.4, '#fff8c0');
      ctx.fillStyle = '#0a0a02'; ctx.fillRect(7.4, -8, 1.2, 4);
      if (op > 0.2) { ctx.fillStyle = C('#f8f4e0'); ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(20, 10); ctx.lineTo(22, 2); ctx.closePath(); ctx.fill(); glow(ctx, 24, 2, 20, ACID, op * 0.6); }
    }
    ctx.restore();
    ctx.restore();
  }
  drawLion(ctx, t, bob, ghost) {
    const cr = this.crouch, hx = 96, hy = -112 + bob * 0.8 + cr * 12, r = this.roar;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-r * 0.12 + cr * 0.1);
    // 갈기 (뒤)
    for (let L = 0; L < 2; L++) {
      ctx.beginPath();
      const N = 26;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU, back = Math.max(0, -Math.cos(a));
        const rr = (L ? 40 : 52) + (i % 2 ? 10 + hash(i + L * 7) * 14 : 0) + back * (L ? 10 : 22) + Math.sin(t * 3 + i * 1.3) * 3 + (this.enraged ? 6 : 0);
        const x = -10 + Math.cos(a) * rr * 0.92 - back * 6, y = Math.sin(a) * rr * 0.95 + (Math.sin(a) > 0 ? 6 : 0);
        i ? ctx.quadraticCurveTo(-10 + Math.cos(a - 0.12) * rr * 0.8, Math.sin(a - 0.12) * rr * 0.8, x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ink(ctx, ghost ? '#6a8a3a' : rg(ctx, 'chmane' + L + (this.enraged ? 1 : 0), 4, -6, 6, -8, 0, 60, [0, C(L ? '#7a4c2a' : MANE2), 0.6, C(MANE), 1, C(this.enraged ? '#0e1a08' : '#120804')]), L ? 1.5 : 2.5);
      if (!ghost && !L) rim(ctx, -70, -10, RIM, 3, 0.35);
    }
    // 얼굴
    ctx.beginPath();
    ctx.moveTo(-14, -26); ctx.quadraticCurveTo(10, -32, 28, -16); ctx.quadraticCurveTo(40, -4, 38, 8);
    ctx.quadraticCurveTo(30, 14, 18, 12); ctx.quadraticCurveTo(0, 26, -16, 14); ctx.quadraticCurveTo(-24, -6, -14, -26); ctx.closePath();
    ink(ctx, ghost ? '#6a8a3a' : rg(ctx, 'chface', 14, -14, 2, 8, 0, 36, [0, C(FUR2), 0.6, C(FUR), 1, C('#6a4826')]), 2.5);
    if (!ghost) {
      // 주둥이 + 코
      ctx.beginPath(); ctx.ellipse(28, 4, 12, 9, 0.2, 0, TAU); ink(ctx, C('#e0c498'), 1.6);
      ctx.beginPath(); ctx.moveTo(32, -6); ctx.lineTo(42, -2); ctx.lineTo(36, 4); ctx.closePath(); ink(ctx, C('#3a2018'), 1.2);
      // 입 (포효)
      const mo = 2 + r * 14;
      ctx.save(); ctx.translate(26, 12); ctx.rotate(r * 0.3);
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(0, mo, 16, 2); ctx.lineTo(14, -2); ctx.closePath();
      ink(ctx, C('#3a0a0a'), 1.6);
      if (r > 0.2) { ctx.fillStyle = C('#f8f0dc'); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-6, 8 * r); ctx.lineTo(-4, 0); ctx.moveTo(8, 1); ctx.lineTo(10, 9 * r); ctx.lineTo(12, 1); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = C('#f8f0dc'); ctx.beginPath(); ctx.moveTo(18, 12); ctx.lineTo(20, 20 + r * 4); ctx.lineTo(22, 12); ctx.closePath(); ctx.fill();
      // 눈 (분노)
      ctx.fillStyle = C('#1a0a04'); ctx.beginPath(); ctx.ellipse(16, -12, 7, 4.5, -0.2, 0, TAU); ctx.fill();
      eye(ctx, 17, -12, 3 + this.fury, this.enraged ? ACID : '#ffc040', 0.9, '#fff8e0');
      ctx.strokeStyle = C('#1a0a04'); ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(6, -20); ctx.lineTo(26, -16); ctx.stroke();
      // 귀
      ctx.beginPath(); ctx.moveTo(-6, -30); ctx.quadraticCurveTo(-2, -44, 8, -34); ctx.closePath(); ink(ctx, C(FUR), 1.6);
      // 봉합 자국
      ctx.strokeStyle = C('#2a1008'); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-10, -18); ctx.lineTo(4, 6); ctx.stroke();
      for (let i = 0; i < 4; i++) { const u = i / 3; ctx.beginPath(); ctx.moveTo(-10 + u * 14 - 3, -18 + u * 24 + 1); ctx.lineTo(-10 + u * 14 + 3, -18 + u * 24 - 1); ctx.stroke(); }
    }
    ctx.restore();
  }
}

// ───────────────────────── 투사체/장판 ─────────────────────────
function drawVenom(ctx, p) {
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, 22, '#7cff5a', 0.6);
  ctx.globalCompositeOperation = 'source-over';
  const a = Math.atan2(p.vy, p.vx); ctx.rotate(a);
  ctx.fillStyle = '#5adf3a'; ctx.strokeStyle = '#0a2a08'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.quadraticCurveTo(0, -7, -12, 0); ctx.quadraticCurveTo(0, 7, 8, 0); ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#e8ffd0'; ctx.beginPath(); ctx.arc(2, -1.5, 2, 0, TAU); ctx.fill();
}
function drawAcidFlask(ctx, p) {
  ctx.rotate(p.rot);
  glow(ctx, 0, 2, 22, '#7cff5a', 0.5);
  ctx.fillStyle = 'rgba(200,255,220,0.5)'; ctx.strokeStyle = '#0a1a10'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 3, 8, 0, TAU); ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#7cff5a'; ctx.beginPath(); ctx.arc(0, 4, 6, 0, PI); ctx.fill();
  ctx.fillStyle = '#c8b090'; ctx.fillRect(-2.5, -9, 5, 6); ctx.strokeRect(-2.5, -9, 5, 6);
}
function drawAcidPool(ctx, h, world) {
  const k = clamp(h.life / 0.5, 0, 1) * clamp(h.t * 5, 0, 1), cx = h.x + h.w / 2, y = h.y + h.h;
  ctx.save();
  ctx.globalAlpha *= k;
  ctx.fillStyle = 'rgba(40,120,20,0.55)';
  ctx.beginPath(); ctx.ellipse(cx, y - 4, h.w / 2, 9, 0, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, y - 4, 2, cx, y - 4, h.w / 2);
  g.addColorStop(0, 'rgba(160,255,120,0.55)'); g.addColorStop(1, 'rgba(60,200,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, y - 4, h.w / 2, 10, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(220,255,200,0.8)';
  for (let i = 0; i < 4; i++) { const bx = cx + Math.sin(h.t * 2 + i * 2.1) * h.w * 0.35, br = 2 + ((h.t * 3 + i) % 1) * 3; ctx.beginPath(); ctx.arc(bx, y - 6, br, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawGreenBolt(ctx, b, k) {
  const seed = Math.floor(b.t * 30);
  ctx.globalAlpha *= k;
  bolt(ctx, b.x0 + rand(-6, 6), b.y0, b.x1, b.y1, '#c8ff8a', 5, seed, 26);
  bolt(ctx, b.x0 + rand(-20, 20), b.y0, b.x1 + rand(-30, 30), b.y1, '#7cff5a', 2, seed + 5, 34);
  glow(ctx, b.x1, b.y1 - 10, 90, '#c8ff8a', k);
}
function drawGlassBit(ctx) { ctx.fillStyle = 'rgba(200,255,240,0.7)'; ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(6, -2); ctx.lineTo(-2, 6); ctx.closePath(); ctx.fill(); }
function drawScaleBit(ctx) { ctx.fillStyle = '#3a7a3a'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0, 0, TAU); ctx.fill(); }
function drawFurBit(ctx) { ctx.fillStyle = '#a8804a'; ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(-2, -5); ctx.lineTo(1, 2); ctx.lineTo(5, -6); ctx.lineTo(7, 3); ctx.closePath(); ctx.fill(); }
