// 4장 보스: 진홍의 갑주군주 — 피로 달궈진 살아있는 갑옷
// 조립 패턴: 할버드 휩쓸기(하단=점프 / 상단=버티기) / 내려찍기(지면 화염 균열) / 도약 강타(천장 잔해 낙하) / 돌진 찌르기 / (1페이즈~) 업화 기둥
// 3페이즈(0.3): 갑옷이 산산이 분리되어 부유 — 로켓 건틀릿 / 할버드 낙하 회전 / 투구 화염탄 / 재조립 압살 / 업화 기둥
import { ABoss, beginDraw, endDraw, C, rg, lg, glow, ink, rim, sheen, taper, eye, shadow, hash, opt, flames, PI, OUT, RIM, WARM, groundWave, erupt, dropHazard } from './a_common.js';
import { rand, clamp, lerp, TAU, angleTo, rgba, ease } from '../../core/math.js';
import { audio } from '../../core/audio.js';

const RED = '#761019', RED2 = '#b8262e', DARKR = '#1e0308', GOLD = '#c89a48', LAVA = '#ff7a2a', DFIRE = '#ff3a1a';
const _Q = new Float32Array(16);
const S = 1.2; // 그림 배율

export class CrimsonArmor extends ABoss {
  setup() {
    this.split = false;
    this.crouch = 0; this.hA = -1.0; this.hR = 0; this.twist = 0; this.gait = 0; this.heat = 0; this.visor = 0;
    this.pc = { helm: { x: 0, y: 0, a: 0, vx: 0, vy: 0, busy: false }, gF: { x: 0, y: 0, a: 0, vx: 0, vy: 0, busy: false }, gB: { x: 0, y: 0, a: 0, vx: 0, vy: 0, busy: false }, hal: { x: 0, y: 0, a: 0, vx: 0, vy: 0, busy: false, spin: 0 } };
  }
  hurtboxes() {
    if (!this.split) return [{ x: this.x + 12, y: this.y + 20, w: this.w - 24, h: this.h - 20 }];
    const h = this.pc.helm;
    return [{ x: this.x + 6, y: this.y + 6, w: this.w - 12, h: this.h - 30 }, { x: h.x - 22, y: h.y - 26, w: 44, h: 50 }];
  }
  onIntro() { audio.sfx('clang', { pitch: 0.5 }); audio.sfx('boss_roar', { pitch: 0.6 }); this.visor = 1; }
  moves() {
    const ph = this.phase, p = this.player, far = p && Math.abs(p.cx - this.cx) > 420;
    if (!this.split) return [
      ['sweep', far ? 0.8 : 3], ['overhead', 2.2], ['leap', far ? 3 : 1.6], ['thrust', far ? 2.4 : 1.4], ['pillars', ph >= 1 ? 2 : 0],
    ];
    return [['rocket', 3], ['halSpin', 2.4], ['helmFire', 2.2], ['crush', 2], ['pillars', 1.4]];
  }
  idleMove(dt, world, p) {
    const A = this.A;
    this.facePlayer();
    if (this.split) {
      const side = this.cx > p.cx ? 1 : -1;
      this.flyTo(clamp(p.cx + side * 270, A.x0 + 120, A.x1 - 120), A.floor - 210 + Math.sin(this.t * 1.6) * 20, 2, 220, dt);
    } else {
      const dx = p.cx - this.cx;
      let v = Math.abs(dx) > 190 ? Math.sign(dx) * 85 * this.sp : Math.abs(dx) < 110 ? -Math.sign(dx) * 60 : 0;
      this.vx = lerp(this.vx, v, Math.min(1, dt * 3));
    }
    this.relax(dt);
  }
  relax(dt) {
    const k = Math.min(1, dt * 4);
    this.crouch = lerp(this.crouch, 0, k); this.hA = lerp(this.hA, -1.0, k); this.hR = lerp(this.hR, 0, k); this.twist = lerp(this.twist, 0, k);
    this.visor = lerp(this.visor, 0.3 + this.phase * 0.3, k);
  }
  think(dt, world) {
    super.think(dt, world);
    const wasG = Math.floor(this.gait / PI);
    this.gait += dt * Math.abs(this.vx) / 22;
    if (!this.split && this.onGround && Math.floor(this.gait / PI) !== wasG) { audio.sfx('footstep', { pitch: 0.5, vol: 0.9 }); this.shake(2.5, 0.12); this.fx.burst('dust', this.cx + (Math.floor(this.gait / PI) % 2 ? 30 : -26) * this.facing, this.floorY - 4, 3, { speed: 50 }); }
    this.heat = lerp(this.heat, this.phase / 2, Math.min(1, dt * 1.5));
    if (this.split) this.updPieces(dt, world);
    if (Math.random() < dt * (3 + this.phase * 8)) {
      const pt = this.split ? { x: this.cx, y: this.cy + 20 } : { x: this.cx + rand(-30, 30), y: this.bottom - rand(80, 180) };
      this.fx.emit('fire', pt.x, pt.y, { speed: 50, angle: -PI / 2, color: '#ff3a1a', color2: '#ffb060' });
    }
  }
  /** 로컬 → 월드 */
  W(lx, ly) { return { x: this.cx + this.facing * lx * S, y: this.bottom + ly * S }; }
  pose() {
    const cr = this.crouch, H = { x: 0, y: -94 + cr * 30 };
    const T = { x: 4 + this.twist * 8, y: H.y - 44 };
    const dx = Math.cos(this.hA), dy = Math.sin(this.hA);
    const G = { x: T.x + 22 + dx * (26 + this.hR * 0.4) + this.hR * 0.6, y: T.y + 10 + dy * 26 };
    return { H, T, G, dx, dy };
  }
  bladeTip() { const P = this.pose(); return this.W(P.G.x + P.dx * 132, P.G.y + P.dy * 132); }

  // ───────── 조립 상태 패턴 ─────────
  s_sweep(dt, world, p) {
    const A = this.A, W = 0.72, S = 0.2;
    const combo = this.phase >= 1 || this.inferno ? 2 : 1;
    const per = W + S + 0.45;
    const i = Math.min(combo - 1, Math.floor(this.stateT / per)), u = this.stateT - i * per;
    if (this.stateT >= combo * per) { this.rest(1.0); return; }
    this.vx *= 0.8;
    if (this.at(i * per)) {
      this.facePlayer();
      this.low = i === 0 ? Math.random() < 0.6 : !this.low;
      const x0 = this.cx - this.facing * 40, x1 = this.cx + this.facing * 300;
      const y0 = this.low ? A.floor - 72 : A.floor - 205, y1 = this.low ? A.floor : A.floor - 94;
      this.warn({ type: 'band', x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, life: W, color: this.low ? '#ffa040' : '#ff3a8a', dir: this.facing });
      this.warnMark(this.cx, this.y - 30, W, { color: this.low ? '#ffa040' : '#ff3a8a' });
      audio.sfx('clang', { pitch: 0.6, vol: 0.6 });
    }
    const back = this.low ? 2.75 : -2.75, fwd = this.low ? 0.4 : -0.3;
    if (u < W) {
      const k = ease.outCubic(clamp(u / (W * 0.7), 0, 1));
      this.hA = lerp(-1.0, back, k); this.twist = -0.8 * k; this.crouch = this.low ? 0.5 * k : 0.15 * k;
      if (this.at(i * per + W - 0.15)) { const tp = this.bladeTip(); this.fx.flash(tp.x, tp.y, { color: '#fff', size: 60, life: 0.15 }); }
      return;
    }
    if (u < W + S) {
      const k = ease.inOutQuad((u - W) / S);
      this.hA = lerp(back, fwd, k); this.twist = lerp(-0.8, 0.6, k);
      if (this.at(i * per + W)) {
        audio.sfx('slash_heavy', { pitch: 0.55 }); this.shake(6, 0.2);
        const P = this.pose(), g = this.W(P.G.x, P.G.y);
        this.fx.slash(g.x, g.y, this.facing > 0 ? (this.low ? 0.5 : -0.5) : PI - (this.low ? 0.5 : -0.5), { len: 150, radius: 150, width: 34, color: '#ff5a3a', arc: 2.4, life: 0.22 });
        this.vx = this.facing * 180;
      }
      const x0 = this.cx - this.facing * 40, x1 = this.cx + this.facing * 300;
      const y0 = this.low ? A.floor - 72 : A.floor - 205, y1 = this.low ? A.floor : A.floor - 94;
      this.strikeRect({ x: Math.min(x0, x1), y: y0, w: Math.abs(x1 - x0), h: y1 - y0 }, 1.3, { kb: [480, -380] });
      return;
    }
    this.hA = lerp(this.hA, -1.0, Math.min(1, dt * 3)); this.twist = lerp(this.twist, 0, dt * 4);
  }
  s_overhead(dt, world, p) {
    const A = this.A, W = 0.8;
    this.vx *= 0.8;
    if (this.at(0)) {
      this.facePlayer();
      const x = this.cx + this.facing * 120;
      this.warn({ type: 'band', x0: this.facing > 0 ? x : A.x0, x1: this.facing > 0 ? A.x1 : x, y0: A.floor - 60, y1: A.floor, life: W + 0.1, color: '#ff5a2a', dir: this.facing });
      this.warnMark(this.cx, this.y - 30, W);
      audio.sfx('clang', { pitch: 0.5 });
    }
    if (this.stateT < W) {
      const k = ease.outCubic(clamp(this.stateT / (W * 0.8), 0, 1));
      this.hA = lerp(-1.0, -2.1, k); this.crouch = 0.25 * k; this.twist = -0.4 * k;
      return;
    }
    if (this.stateT < W + 0.1) { this.hA = lerp(-2.1, 0.62, (this.stateT - W) / 0.1); this.twist = 0.5; this.crouch = 0.45; return; }
    if (this.at(W + 0.1)) {
      const tp = this.bladeTip();
      const fy = Math.min(tp.y, this.floorY);
      this.impact(tp.x, this.floorY, 13, 0.06, '#ffb070');
      audio.sfx('hit_heavy', { pitch: 0.5 }); audio.sfx('explode', { pitch: 0.7, vol: 0.6 });
      this.strikeRect({ x: tp.x - 60, y: this.floorY - 120, w: 120, h: 120 }, 1.4);
      groundWave(this, tp.x, this.facing, { speed: 560 + this.phase * 60, color: '#ff5a2a', color2: '#ffe0a0', style: 'fire', mv: 1.0, element: 'fire', h: 56 });
      if (this.phase >= 1) for (let i = 1; i <= 4; i++) erupt(this, tp.x + this.facing * i * 140, { delay: 0.35 + i * 0.1, life: 0.45, w: 56, h: 200, color: DFIRE, style: 'fire', mv: 1.0, element: 'fire' });
      world.fx.burst('shard', tp.x, fy - 6, 12, { color: '#6a5048', speed: 360, angle: -PI / 2, spread: 1 });
    }
    if (this.stateT > W + 0.8) this.rest(1.0);
  }
  s_leap(dt, world, p) {
    const A = this.A, W = 0.55;
    if (this.at(0)) { this.facePlayer(); this.vx = 0; this.landed = false; audio.sfx('clang', { pitch: 0.4 }); }
    if (this.stateT < W) {
      this.crouch = ease.outCubic(this.stateT / W); this.hA = lerp(this.hA, -2.0, Math.min(1, dt * 6));
      if (this.at(0.3)) {
        this.tx = clamp(p.cx, A.x0 + this.w / 2 + 10, A.x1 - this.w / 2 - 10);
        this.warnCircle(this.tx, this.floorY, 110, W - 0.3 + 1.0, { color: '#ff4a2a' });
      }
      return;
    }
    if (this.at(W)) { this.vy = -1250; this.vx = (this.tx - this.cx) / 1.0; this.crouch = 0; audio.sfx('jump', { pitch: 0.4 }); this.shake(5, 0.2); }
    if (!this.landed) {
      this.hA = lerp(this.hA, -2.2, Math.min(1, dt * 5));
      if (this.vy > 0) this.hA = lerp(this.hA, 0.9, Math.min(1, dt * 7));
      if (this.stateT > W + 0.15 && this.onGround) {
        this.landed = true; this.vx = 0; this.landT = this.stateT; this.crouch = 0.8;
        this.impact(this.cx, this.floorY, 17, 0.09, '#ffb070');
        audio.sfx('explode', { pitch: 0.5 }); audio.sfx('hit_heavy', { pitch: 0.4 });
        world.game.flash?.('#ff6a3a', 0.25, 4);
        this.strikeRect({ x: this.cx - 140, y: this.floorY - 110, w: 280, h: 110 }, 1.5);
        for (const s of [-1, 1]) groundWave(this, this.cx + s * 40, s, { speed: 540, color: '#ff5a2a', color2: '#ffe0a0', style: 'fire', mv: 1.0, element: 'fire', h: 50 });
        // 천장 잔해
        const n = 5 + this.phase;
        for (let i = 0; i < n; i++) {
          const x = i === 0 ? p.cx : rand(A.x0 + 40, A.x1 - 40);
          dropHazard(this, x, { delay: 0.75 + i * 0.12, render: drawRock, w: 30, h: 30, speed: 300, gravity: 0.8, spin: rand(-6, 6), mv: 0.8, warnColor: '#ff8a4a', warnW: 50, landFx: 'dust', top: A.floor - 560,
            onLand: (pr, w) => { w.fx.burst('shard', pr.cx, A.floor - 6, 8, { color: '#6a5a50', speed: 240, angle: -PI / 2, spread: 1.2 }); audio.sfx('break_wall', { vol: 0.5, pitch: rand(0.8, 1.2) }); } });
        }
      }
      if (this.stateT > W + 2.5) { this.landed = true; this.landT = this.stateT; }
      return;
    }
    this.crouch = lerp(this.crouch, 0, Math.min(1, dt * 3));
    if (this.stateT - this.landT > 0.8) this.rest(0.9);
  }
  s_thrust(dt, world, p) {
    const W = 0.55;
    if (this.at(0)) {
      this.facePlayer(); this.vx = 0;
      const P = this.pose(), g = this.W(P.G.x, P.G.y + 6);
      this.warnLine(g.x, this.floorY - 120, g.x + this.facing * 420, this.floorY - 120, W, { width: 40, color: '#ff4a3a' });
      audio.sfx('charge_ready', { pitch: 0.7 });
    }
    if (this.stateT < W) { this.hA = lerp(this.hA, 0.05, Math.min(1, dt * 10)); this.hR = lerp(this.hR, -40, Math.min(1, dt * 8)); this.crouch = lerp(this.crouch, 0.3, dt * 6); this.twist = -0.3; return; }
    if (this.at(W)) { this.vx = this.facing * 760; audio.sfx('slash_heavy', { pitch: 0.6 }); audio.sfx('dash', { pitch: 0.5 }); }
    this.hR = lerp(this.hR, 60, Math.min(1, dt * 16)); this.twist = 0.4; this.vx *= 0.94;
    if (this.stateT < W + 0.35) {
      const tp = this.bladeTip();
      this.strikeRect({ x: tp.x - 70, y: this.floorY - 150, w: 140, h: 60 }, 1.3, { kb: [520, -300] });
      this.strikeRect({ x: this.x, y: this.y + 30, w: this.w, h: this.h - 30 }, 1.0);
      if (Math.random() < 0.6) this.fx.emit('spark', tp.x, tp.y, { color: '#ffb060' });
    }
    if (this.stateT > W + 0.85) this.rest(0.9);
  }
  s_pillars(dt, world, p) {
    const A = this.A, n = 6;
    this.vx *= 0.8;
    if (!this.split) { this.hA = lerp(this.hA, PI / 2 - 0.25, Math.min(1, dt * 8)); this.crouch = lerp(this.crouch, 0.35, dt * 5); }
    if (this.at(0)) { this.warnMark(this.cx, this.y - 30, 0.5); audio.sfx('fire', { pitch: 0.5 }); this.facePlayer(); }
    if (this.at(0.3) && !this.split) { this.impact(this.bladeTip().x, this.floorY, 8, 0.03, '#ff8040'); }
    const k = this.every(0.35, 0.14, n);
    if (k >= 0) for (const s of [-1, 1]) {
      const x = this.cx + s * (110 + k * 115);
      if (x > A.x0 + 10 && x < A.x1 - 10) erupt(this, x, { delay: 0.7, life: 0.5, w: 60, h: 240, color: DFIRE, style: 'fire', mv: 1.0, element: 'fire', sfx: k % 2 ? null : 'fire' });
    }
    if (this.split || this.inferno) {
      const j = this.every(0.5, 0.45, 3);
      if (j >= 0) erupt(this, p.cx, { delay: 0.7, life: 0.5, w: 60, h: 240, color: '#ff6a2a', style: 'fire', mv: 1.0, element: 'fire' });
    }
    if (this.stateT > 0.35 + n * 0.14 + 1.1) this.rest(1.0);
  }

  // ───────── 페이즈 ─────────
  onPhase(n, world) {
    if (n === 1) {
      this.setState('transform'); this.transformTime = 1.3;
      world.banner = { text: '핏빛 업화', sub: '갑옷의 균열에서 검붉은 불꽃이 새어 나온다', t: 1.8, color: '#ff5a2a' };
    } else {
      this.setState('splitting');
      world.banner = { text: '분리', sub: '진홍의 갑옷이 산산이 흩어져 스스로 공격해 온다', t: 2, color: '#ff3a3a' };
    }
  }
  transformTick(dt, world, p) {
    this.vx = 0; this.crouch = 0.4 + Math.sin(this.stateT * 30) * 0.05; this.hA = -1.6; this.visor = 1.5;
    if (this.at(0.3)) { this.phaseBurst(DFIRE); audio.sfx('boss_roar', { pitch: 0.55 }); audio.sfx('fire', { pitch: 0.6 }); }
    if (Math.random() < 0.9) this.fx.emit('fire', this.cx + rand(-50, 50), this.bottom - rand(40, 200), { speed: 120, angle: -PI / 2, color: '#ff3a1a', color2: '#ffd070' });
  }
  s_splitting(dt, world, p) {
    this.invuln = true; this.vx *= 0.8;
    if (this.stateT < 0.9) { this.crouch = 0.3 + Math.sin(this.stateT * 40) * 0.06; this.visor = 2; if (Math.random() < 0.9) this.fx.emit('fire', this.cx + rand(-50, 50), this.bottom - rand(30, 200), { speed: 160, color: '#ff3a1a', color2: '#ffd070' }); return; }
    if (this.at(0.9)) this.applySplit(true);
    if (this.stateT > 2.0) { this.invuln = false; this.rest(0.4); }
  }
  applySplit(fx) {
    if (this.split) return;
    const P = this.pose(), f = this.facing;
    const helm = this.W(P.T.x + 6, P.T.y - 56), gF = this.W(P.G.x + P.dx * 16, P.G.y + P.dy * 16), gB = this.W(P.G.x - P.dx * 20, P.G.y - P.dy * 20), hal = this.W(P.G.x + P.dx * 30, P.G.y + P.dy * 30);
    const core = this.W(P.T.x, P.T.y);
    Object.assign(this.pc.helm, { x: helm.x, y: helm.y, vx: rand(-60, 60), vy: -520, a: 0 });
    Object.assign(this.pc.gF, { x: gF.x, y: gF.y, vx: f * 420, vy: -300, a: 0 });
    Object.assign(this.pc.gB, { x: gB.x, y: gB.y, vx: -f * 420, vy: -340, a: 0 });
    Object.assign(this.pc.hal, { x: hal.x, y: hal.y, vx: -f * 200, vy: -600, a: this.hA, spin: 8 });
    this.split = true; this.noGravity = true;
    const cx = core.x, cy = core.y;
    this.w = 96; this.h = 118; this.x = cx - this.w / 2; this.y = cy - this.h / 2 + 10; this.vy = -160; this.vx = 0;
    if (fx) {
      this.phaseBurst('#ff4a2a');
      this.impact(cx, this.floorY, 14, 0.08, '#ffb070');
      audio.sfx('explode', { pitch: 0.6 }); audio.sfx('clang', { pitch: 0.4 });
      this.fx.burst('fire', cx, this.floorY - 40, 30, { speed: 300, jitter: 40, color: '#ff3a1a', color2: '#ffd070' });
      this.spawnDebris(this.world, cx, this.floorY - 50, 6);
    }
  }
  phaseApply(n) { if (n >= 2) { this.applySplit(false); this.setState('idle'); this.invuln = false; for (const k in this.pc) { this.pc[k].vx = this.pc[k].vy = 0; } } }

  // ───────── 분리 상태 ─────────
  updPieces(dt, world) {
    const f = this.facing, t = this.t, c = this.pc;
    const tgt = (pc, x, y, a, k = 5) => {
      if (pc.busy) return;
      pc.vx += ((x - pc.x) * k - pc.vx) * Math.min(1, dt * 4); pc.vy += ((y - pc.y) * k - pc.vy) * Math.min(1, dt * 4);
      pc.a = lerp(pc.a, a, Math.min(1, dt * 5));
    };
    tgt(c.helm, this.cx + f * 8, this.cy - 88 + Math.sin(t * 2.2) * 6, 0);
    tgt(c.gF, this.cx + f * 92, this.cy + 6 + Math.sin(t * 2.6 + 1) * 10, 0);
    tgt(c.gB, this.cx - f * 84, this.cy + 18 + Math.sin(t * 2.4 + 2) * 10, 0);
    if (!c.hal.busy) { c.hal.spin = lerp(c.hal.spin, 0.8, Math.min(1, dt * 2)); }
    tgt(c.hal, this.cx - f * 40, this.cy - 30 + Math.sin(t * 1.8) * 8, c.hal.a + c.hal.spin * dt * 0, 4);
    if (!c.hal.busy) c.hal.a += c.hal.spin * dt;
    for (const k in c) { const pc = c[k]; if (!pc.fixed) { pc.x += pc.vx * dt; pc.y += pc.vy * dt; } }
  }
  s_rocket(dt, world, p) {
    const A = this.A, n = this.inferno ? 3 : 2, per = 1.05, c = this.pc;
    this.vx *= 0.9; this.vy *= 0.9; this.facePlayer();
    const i = Math.floor(this.stateT / per), u = this.stateT - i * per;
    if (i >= n) { if (this.stateT > n * per + 0.3) this.rest(0.9); return; }
    const g = i % 2 ? c.gB : c.gF;
    if (this.at(i * per)) { g.busy = true; g.fixed = false; audio.sfx('clang', { pitch: 1.2, vol: 0.6 }); }
    if (u < 0.55) {
      const hx = this.cx + (i % 2 ? -1 : 1) * this.facing * 70, hy = this.cy - 10;
      g.x = lerp(g.x, hx, Math.min(1, dt * 8)); g.y = lerp(g.y, hy, Math.min(1, dt * 8)); g.vx = 0; g.vy = 0;
      const a = angleTo(g.x, g.y, p.cx, p.cy);
      g.a = lerp(g.a, this.facing > 0 ? a : PI - a, Math.min(1, dt * 10));
      if (this.at(i * per + 0.05)) { this.aimA = a; this.warnLine(g.x, g.y, g.x + Math.cos(a) * 1100, g.y + Math.sin(a) * 1100, 0.5, { width: 44, color: '#ff4a2a', follow: (tg) => { tg.x0 = g.x; tg.y0 = g.y; const aa = angleTo(g.x, g.y, p.cx, p.cy); if (this.stateT < i * per + 0.4) this.aimA = aa; tg.x1 = g.x + Math.cos(this.aimA) * 1100; tg.y1 = g.y + Math.sin(this.aimA) * 1100; } }); }
      if (Math.random() < 0.5) world.fx.emit('fire', g.x - Math.cos(this.aimA ?? 0) * 20, g.y - Math.sin(this.aimA ?? 0) * 20, { speed: 60, color: '#ff5a1a', color2: '#ffd070' });
      return;
    }
    if (this.at(i * per + 0.55)) { g.vx = Math.cos(this.aimA) * 1000; g.vy = Math.sin(this.aimA) * 1000; audio.sfx('dash', { pitch: 0.8 }); audio.sfx('fire', { pitch: 1.4, vol: 0.5 }); }
    if (!g.fixed) {
      this.strikeRect({ x: g.x - 24, y: g.y - 24, w: 48, h: 48 }, 1.15, { kb: [420, -360] });
      if (Math.random() < 0.8) world.fx.emit('fire', g.x, g.y, { speed: 40, color: '#ff5a1a', color2: '#ffd070' });
      if (g.y > this.floorY - 22 || g.x < A.x0 + 10 || g.x > A.x1 - 10) {
        g.fixed = true; g.vx = 0; g.vy = 0; g.y = Math.min(g.y, this.floorY - 22);
        this.impact(g.x, Math.min(g.y + 20, this.floorY), 7, 0.03, '#ffb070');
        audio.sfx('hit_heavy', { pitch: 0.8, vol: 0.7 });
      }
    }
    if (u > per - 0.12) { g.busy = false; g.fixed = false; }
  }
  s_halSpin(dt, world, p) {
    const A = this.A, h = this.pc.hal;
    this.vx *= 0.9; this.vy *= 0.9; this.facePlayer();
    if (this.at(0)) { h.busy = true; audio.sfx('whip', { pitch: 0.4 }); }
    if (this.stateT < 0.7) {
      h.x = lerp(h.x, this.cx, Math.min(1, dt * 6)); h.y = lerp(h.y, this.A.floor - 420, Math.min(1, dt * 5)); h.vx = h.vy = 0;
      h.spin = lerp(h.spin, 22, Math.min(1, dt * 4)); h.a += h.spin * dt;
      if (this.at(0.25)) { this.tx = clamp(p.cx, A.x0 + 60, A.x1 - 60); this.warn({ type: 'column', cx0: this.tx, cw: 170, y0: A.floor - 360, y1: A.floor, life: 0.65, color: '#ff4a2a', follow: (tg) => { if (this.stateT < 0.45) { this.tx = clamp(p.cx, A.x0 + 60, A.x1 - 60); tg.cx0 = this.tx; } } }); }
      return;
    }
    if (this.stateT < 0.95) {
      const k = ease.inQuad((this.stateT - 0.7) / 0.25);
      h.x = lerp(this.cx, this.tx, k); h.y = lerp(this.A.floor - 420, this.A.floor - 70, k); h.a += 26 * dt;
      this.strikeRect({ x: h.x - 75, y: h.y - 75, w: 150, h: 150 }, 1.25);
      return;
    }
    if (this.at(0.95)) {
      this.impact(h.x, this.floorY, 12, 0.05, '#ffb070'); audio.sfx('hit_heavy', { pitch: 0.6 });
      for (const s of [-1, 1]) groundWave(this, h.x + s * 30, s, { speed: 500, color: '#ff5a2a', color2: '#ffe0a0', style: 'fire', mv: 0.9, element: 'fire' });
      h.a = PI / 2; h.spin = 0;
    }
    if (this.stateT < 1.45) { h.a = lerp(h.a, PI / 2 + 0.15, Math.min(1, dt * 10)); this.strikeRect({ x: h.x - 20, y: h.y - 80, w: 40, h: 150 }, 0.9); return; }
    h.busy = false; h.spin = 3;
    if (this.stateT > 1.8) this.rest(0.8);
  }
  s_helmFire(dt, world, p) {
    const h = this.pc.helm, n = this.phase >= 2 ? 7 : 5, vol = this.inferno ? 2 : 1;
    this.vx *= 0.9; this.vy *= 0.9; this.facePlayer();
    if (this.at(0)) { h.busy = true; audio.sfx('fire', { pitch: 0.5 }); this.warnMark(h.x, h.y - 40, 0.6); }
    const hx = this.cx + this.facing * 70, hy = this.cy - 40;
    h.x = lerp(h.x, hx, Math.min(1, dt * 6)); h.y = lerp(h.y, hy, Math.min(1, dt * 6)); h.vx = h.vy = 0;
    this.visor = lerp(this.visor, 2.2, Math.min(1, dt * 4));
    if (this.stateT < 0.6) { const a = angleTo(h.x, h.y, p.cx, p.cy); h.a = lerp(h.a, this.facing > 0 ? a * 0.5 : -(PI - a) * 0.5, dt * 6); if (Math.random() < 0.7) world.fx.emit('fire', h.x + this.facing * 20, h.y, { speed: 30, color: '#ff4a1a', color2: '#ffe080' }); return; }
    const k = this.every(0.6, 0.5, vol);
    if (k >= 0) {
      const a = angleTo(h.x, h.y, p.cx, p.cy);
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.16;
        this.shoot({ x: h.x + this.facing * 16, y: h.y, vx: Math.cos(aa) * 420, vy: Math.sin(aa) * 420, w: 18, h: 18, render: 'fireball', color: '#ff5a1a', life: 2.2, light: { r: 60, color: '#ff6a2a', i: 0.7 }, trail: 'fire', trailRate: 0.05, attack: { mv: 0.8, element: 'fire', type: 'mag' } });
      }
      audio.sfx('fire'); this.shake(4, 0.15);
      h.x -= this.facing * 14;
    }
    if (this.stateT > 0.6 + vol * 0.5 + 0.4) { h.busy = false; this.rest(0.9); }
  }
  s_crush(dt, world, p) {
    const A = this.A, TR = 0.9;
    if (this.at(0)) { audio.sfx('clang', { pitch: 0.4 }); this.landed = false; this.warn({ type: 'column', cx0: this.cx, cw: 150, y0: A.floor - 360, y1: A.floor, life: TR + 0.25, color: '#ff3a2a', follow: (tg) => { if (this.stateT < TR) tg.cx0 = this.cx; } }); }
    if (this.stateT < TR) {
      this.flyTo(clamp(p.cx, A.x0 + 70, A.x1 - 70), A.floor - 330, 6, 600, dt);
      for (const k in this.pc) { const pc = this.pc[k]; pc.busy = true; pc.x = lerp(pc.x, this.cx + (k === 'gF' ? 50 : k === 'gB' ? -50 : 0) * this.facing, dt * 6); pc.y = lerp(pc.y, this.cy + (k === 'helm' ? -70 : k === 'hal' ? -20 : 30), dt * 6); pc.vx = pc.vy = 0; }
      this.pc.hal.a = lerp(this.pc.hal.a, -PI / 2, dt * 5);
      return;
    }
    if (this.stateT < TR + 0.25) { this.vx = 0; this.vy = -60; return; }
    if (!this.landed) {
      if (this.at(TR + 0.25)) { this.vy = 1500; audio.sfx('dash', { pitch: 0.5 }); }
      this.vx = 0;
      for (const k in this.pc) { const pc = this.pc[k]; pc.x = lerp(pc.x, this.cx + (k === 'gF' ? 50 : k === 'gB' ? -50 : 0) * this.facing, 0.5); pc.y = this.cy + (k === 'helm' ? -70 : k === 'hal' ? -20 : 30); }
      this.strikeRect({ x: this.x - 20, y: this.y, w: this.w + 40, h: this.h + 40 }, 1.4);
      if (this.bottom + 40 >= this.floorY) {
        this.y = this.floorY - 40 - this.h; this.vy = 0; this.landed = true; this.landT = this.stateT;
        this.impact(this.cx, this.floorY, 17, 0.09, '#ffb070');
        world.game.flash?.('#ff6a3a', 0.25, 4);
        audio.sfx('explode', { pitch: 0.5 }); audio.sfx('hit_heavy', { pitch: 0.4 });
        for (const s of [-1, 1]) groundWave(this, this.cx + s * 40, s, { speed: 560, color: '#ff5a2a', color2: '#ffe0a0', style: 'fire', mv: 1.0, element: 'fire', h: 52 });
        for (let i = 0; i < 4; i++) dropHazard(this, rand(A.x0 + 40, A.x1 - 40), { delay: 0.7 + i * 0.12, render: drawRock, w: 30, h: 30, speed: 300, gravity: 0.8, spin: rand(-6, 6), mv: 0.8, warnColor: '#ff8a4a', warnW: 50, top: A.floor - 560 });
      }
      if (this.stateT > TR + 2.5) { this.landed = true; this.landT = this.stateT; }
      return;
    }
    if (this.stateT - this.landT > 0.7) { for (const k in this.pc) this.pc[k].busy = false; this.vy = -300; this.rest(0.9); }
  }

  deathStart(world) {
    for (const k in this.pc) this.pc[k].busy = true;
    audio.sfx('boss_roar', { pitch: 0.45 });
  }
  deathTick(dt) {
    this.vx = 0; this.vy = this.split ? 30 : this.vy;
    if (this.split) for (const k in this.pc) { const pc = this.pc[k]; pc.vy += 900 * dt; pc.y = Math.min(this.floorY - 16, pc.y + pc.vy * dt); pc.x += pc.vx * dt; pc.a += dt * 3; }
    this.visor = 2.5;
  }
  debrisPiece(i) { return { size: 12, draw: i % 3 === 0 ? drawGoldShard : drawRedShard }; }
  deathPoint() { return { x: this.cx + rand(-this.w * 0.6, this.w * 0.6), y: this.bottom - rand(20, this.split ? this.h : 200) }; }
  extraLights(L) {
    const P = this.pose();
    if (this.split) { L.add(this.cx, this.cy, 120, DFIRE, 1); L.add(this.pc.helm.x, this.pc.helm.y, 70, LAVA, 0.8); }
    else { const h = this.W(P.T.x + 8, P.T.y - 56); L.add(h.x, h.y, 60 + this.visor * 20, LAVA, 0.8); L.add(this.cx, this.bottom - 130, 90 + this.heat * 60, DFIRE, 0.5 + this.heat * 0.4); }
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx, world) {
    beginDraw(this);
    const X = this.cx, B = this.bottom, t = this.t;
    if (!this.split) {
      shadow(ctx, X, this.floorY - 2, 90, 14, 0.6);
      ctx.save();
      const jx = this.flashT > 0 ? rand(-2, 2) : 0;
      ctx.translate(X + jx, B); ctx.scale(this.facing * S, S);
      this.drawAssembled(ctx, t);
      ctx.restore();
    } else {
      const alt = clamp((this.floorY - this.bottom) / 300, 0, 1);
      shadow(ctx, X, this.floorY - 2, 80 * (1 - alt * 0.4), 12, 0.5 * (1 - alt * 0.5));
      const c = this.pc, f = this.facing;
      // 할버드 (뒤)
      this.piece(ctx, c.hal, () => drawHalberd(ctx, t, this.heat, true));
      this.piece(ctx, c.gB, () => drawGauntlet(ctx, t, this.heat, 0.8));
      // 코어
      ctx.save();
      ctx.translate(X + (this.flashT > 0 ? rand(-2, 2) : 0), this.cy); ctx.scale(f * S, S);
      glow(ctx, 0, 0, 170, '#5a0a08', 0.6);
      flames(ctx, 0, 30, PI / 2, 7, 90 + Math.sin(t * 4) * 10, t, DFIRE, 18, 3, '#ffb040', 0.5);
      drawPauldron(ctx, -40, -26, -1, t, this.heat);
      drawChest(ctx, t, this.heat, true);
      drawPauldron(ctx, 46, -24, 1, t, this.heat);
      ctx.restore();
      this.piece(ctx, c.helm, () => drawHelm(ctx, t, this.visor, this.heat));
      this.piece(ctx, c.gF, () => drawGauntlet(ctx, t, this.heat, 1));
    }
    endDraw();
  }
  piece(ctx, pc, fn) {
    ctx.save(); ctx.translate(pc.x, pc.y); ctx.scale(this.facing * S, S); ctx.rotate(pc.a);
    glow(ctx, 0, 0, 50, DFIRE, 0.3 + this.heat * 0.2);
    fn();
    ctx.restore();
  }
  drawAssembled(ctx, t) {
    const P = this.pose(), { H, T, G, dx, dy } = P, heat = this.heat, walk = clamp(Math.abs(this.vx) / 90, 0, 1);
    if (heat > 0.02) glow(ctx, 0, -120, 200, DFIRE, 0.08 * heat + 0.04 * Math.sin(t * 6) * heat);
    if (this.state === 'transform' || this.state === 'splitting') glow(ctx, 0, -130, 240, '#ff5a2a', 0.4 + 0.2 * Math.sin(t * 30));
    const g0 = this.gait;
    // 뒷다리
    this.legD(ctx, H.x - 16, H.y + 4, -30 + Math.sin(g0 + PI) * 16 * walk, -Math.max(0, Math.cos(g0 + PI)) * 10 * walk, true);
    // 뒤 어깨·팔
    const SB = { x: T.x - 40, y: T.y - 26 }, SF = { x: T.x + 46, y: T.y - 24 };
    const BH = { x: G.x - dx * 22, y: G.y - dy * 22 }, FH = { x: G.x + dx * 18, y: G.y + dy * 18 };
    drawPauldron(ctx, SB.x, SB.y, -1, t, heat);
    this.armD(ctx, SB, BH, true);
    ctx.save(); ctx.translate(BH.x, BH.y); ctx.rotate(this.hA); drawGauntlet(ctx, t, heat, 0.8); ctx.restore();
    // 허리 비늘 + 앞다리
    this.legD(ctx, H.x + 18, H.y + 4, 34 + Math.sin(g0) * 16 * walk, -Math.max(0, Math.cos(g0)) * 10 * walk, false);
    drawFaulds(ctx, H.x, H.y, t, heat);
    // 몸통 + 투구
    ctx.save(); ctx.translate(T.x, T.y); ctx.scale(1.12, 1.08); drawChest(ctx, t, heat, false); ctx.restore();
    ctx.save(); ctx.translate(T.x + 8, T.y - 56 + Math.sin(t * 2) * 1); ctx.rotate(this.twist * 0.08); drawHelm(ctx, t, this.visor, heat); ctx.restore();
    // 할버드
    ctx.save(); ctx.translate(G.x, G.y); ctx.rotate(this.hA); drawHalberd(ctx, t, heat, false); ctx.restore();
    // 앞 팔 + 어깨
    this.armD(ctx, SF, FH, false);
    ctx.save(); ctx.translate(FH.x, FH.y); ctx.rotate(this.hA); drawGauntlet(ctx, t, heat, 1); ctx.restore();
    drawPauldron(ctx, SF.x, SF.y, 1, t, heat);
    // 관절 불꽃
    if (heat > 0.05) {
      flames(ctx, T.x + 6, T.y - 40, -PI / 2, 4, 26 + heat * 20, t, DFIRE, 8, 1, '#ffb040', 0.35 * heat + 0.1);
      flames(ctx, SF.x, SF.y - 8, -PI / 2, 3, 20 + heat * 16, t, DFIRE, 6, 5, '#ffb040', 0.3 * heat);
    }
  }
  legD(ctx, hx, hy, fx, lift, far) {
    const cr = this.crouch;
    const fy = -6 - lift;
    const kx = (hx + fx) / 2 + (fx > hx ? 14 : -10) + cr * (fx > hx ? 14 : -10), ky = (hy + fy) / 2 - 4 - cr * 6;
    _Q[0] = hx; _Q[1] = hy; _Q[2] = kx; _Q[3] = ky; _Q[4] = fx; _Q[5] = fy;
    taper(ctx, _Q, 3, far ? 36 : 40, 24);
    ink(ctx, lg(ctx, 'crleg' + far, hx - 20, 0, hx + 20, 0, [0, C(far ? '#3a0a10' : '#5a1018'), 0.35, C(far ? '#5a0e16' : RED), 0.8, C(far ? '#7a2028' : RED2), 1, C(DARKR)]), 3);
    if (!far) rim(ctx, hx - 30, hx, RIM, 3, 0.45);
    // 무릎 가시
    ctx.beginPath(); ctx.arc(kx, ky, 11, 0, TAU); ink(ctx, rg(ctx, 'crknee', kx + 3, ky - 3, 1, kx, ky, 12, [0, C('#e05048'), 1, C(DARKR)]), 2);
    ctx.beginPath(); ctx.moveTo(kx + 6, ky - 6); ctx.lineTo(kx + 20, ky - 4); ctx.lineTo(kx + 8, ky + 4); ctx.closePath(); ink(ctx, C('#2a0a0e'), 1.5);
    // 발 (사바톤)
    ctx.beginPath(); ctx.moveTo(fx - 16, fy + 6); ctx.lineTo(fx - 12, fy - 10); ctx.lineTo(fx + 14, fy - 8); ctx.lineTo(fx + 30, fy + 6); ctx.closePath();
    ink(ctx, lg(ctx, 'crfoot', 0, fy - 10, 0, fy + 6, [0, C(RED2), 1, C(DARKR)]), 2.5);
    ctx.strokeStyle = C(GOLD); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx - 10, fy - 6); ctx.lineTo(fx + 16, fy - 4); ctx.stroke();
  }
  armD(ctx, S, Hn, far) {
    const ex = (S.x + Hn.x) / 2 + (far ? -8 : 6), ey = (S.y + Hn.y) / 2 + 14;
    _Q[0] = S.x; _Q[1] = S.y; _Q[2] = ex; _Q[3] = ey; _Q[4] = Hn.x; _Q[5] = Hn.y;
    taper(ctx, _Q, 3, far ? 26 : 30, 18);
    ink(ctx, C(far ? '#4a0c14' : RED), 2.5);
    ctx.beginPath(); ctx.arc(ex, ey, far ? 8 : 10, 0, TAU); ink(ctx, C(far ? '#3a0a10' : '#b02a32'), 2);
    if (this.heat > 0.1) glow(ctx, ex, ey, 18, LAVA, this.heat * 0.5);
  }
}

// ───────────────────────── 부품 그리기 (원점 = 부품 중심, 오른쪽 기준) ─────────────────────────
function lavaCracks(ctx, heat, t, pts) {
  const a = 0.25 + heat * 0.45 + Math.sin(t * 5) * 0.08;
  if (a <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(LAVA, 0.3 * a); ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 6) { ctx.moveTo(pts[i], pts[i + 1]); ctx.lineTo(pts[i + 2], pts[i + 3]); ctx.lineTo(pts[i + 4], pts[i + 5]); }
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffb060', 0.85 * a); ctx.lineWidth = 1.3; ctx.stroke();
  ctx.restore();
}
function drawHelm(ctx, t, visor, heat) {
  // 뿔 (뒤)
  ctx.beginPath(); ctx.moveTo(-12, -22); ctx.quadraticCurveTo(-34, -30, -44, -66); ctx.quadraticCurveTo(-28, -40, -4, -30); ctx.closePath();
  ink(ctx, lg(ctx, 'crhornb', -40, -60, -10, -24, [0, C('#c8b098'), 0.3, C('#5a3a30'), 1, C('#1a0a0a')]), 2);
  // 투구 본체
  ctx.beginPath();
  ctx.moveTo(-20, 22); ctx.lineTo(-23, -6); ctx.quadraticCurveTo(-22, -30, 0, -33); ctx.quadraticCurveTo(20, -32, 23, -10);
  ctx.lineTo(29, 6); ctx.lineTo(17, 24); ctx.lineTo(-8, 27); ctx.closePath();
  ink(ctx, lg(ctx, 'crhelm', -24, 0, 28, 0, [0, C('#4a0a12'), 0.25, C(DARKR), 0.55, C(RED), 0.85, C('#e0484a'), 1, C('#5a0e14')]), 3);
  rim(ctx, -28, -4, RIM, 3, 0.55);
  sheen(ctx, 8, -30, 20, 0, WARM, 0.18);
  // 볏 가시
  ctx.beginPath();
  for (let i = 0; i < 4; i++) { const x = -14 + i * 9; ctx.moveTo(x - 4, -30 + Math.abs(i - 1.5)); ctx.lineTo(x + 2, -44 + Math.abs(i - 1.5) * 3); ctx.lineTo(x + 5, -30 + Math.abs(i - 1.5)); }
  ctx.fillStyle = C('#2a0a0e'); ctx.fill(); ctx.strokeStyle = C(OUT); ctx.lineWidth = 1.2; ctx.stroke();
  // 금장 테
  ctx.strokeStyle = C(GOLD); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-21, -2); ctx.quadraticCurveTo(4, -8, 26, 2); ctx.stroke();
  // 면갑 틈 (발광)
  ctx.fillStyle = C('#0a0204');
  ctx.beginPath(); ctx.moveTo(2, -10); ctx.lineTo(27, -6); ctx.lineTo(27, -1); ctx.lineTo(3, -4); ctx.closePath(); ctx.fill();
  const vk = clamp(visor, 0, 2.5);
  glow(ctx, 16, -6, 26 + vk * 12, LAVA, 0.6 + vk * 0.2);
  ctx.fillStyle = vk > 1.2 ? '#fff0c0' : '#ffb050';
  ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(25, -5); ctx.lineTo(25, -3); ctx.lineTo(6, -5); ctx.closePath(); ctx.fill();
  // 숨구멍
  ctx.fillStyle = C('#0a0204'); for (let i = 0; i < 3; i++) ctx.fillRect(14 + i * 4, 8, 2, 7);
  // 뿔 (앞)
  ctx.beginPath(); ctx.moveTo(8, -26); ctx.quadraticCurveTo(28, -34, 30, -70); ctx.quadraticCurveTo(20, -42, 0, -32); ctx.closePath();
  ink(ctx, lg(ctx, 'crhornf', 28, -66, 4, -28, [0, C('#e8d0b8'), 0.3, C('#6a4638'), 1, C('#1a0a0a')]), 2);
  lavaCracks(ctx, heat, t, [-16, -20, -10, -10, -14, 4]);
}
function drawChest(ctx, t, heat, core) {
  ctx.beginPath();
  ctx.moveTo(-40, -36); ctx.quadraticCurveTo(-4, -46, 44, -34); ctx.quadraticCurveTo(52, -6, 36, 22);
  ctx.quadraticCurveTo(28, 40, 4, 44); ctx.quadraticCurveTo(-22, 40, -30, 22); ctx.quadraticCurveTo(-46, -6, -40, -36); ctx.closePath();
  ink(ctx, lg(ctx, 'crchest', -46, 0, 52, 0, [0, C('#2a040a'), 0.2, C(DARKR), 0.5, C(RED), 0.78, C('#c83a3a'), 0.9, C(RED), 1, C('#2a040a')]), 3.5);
  rim(ctx, -52, -10, RIM, 4, 0.55);
  sheen(ctx, 22, -40, 30, 10, WARM, 0.22);
  // 가운데 능선 + 금장
  ctx.strokeStyle = C('#2a0408'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(6, -40); ctx.quadraticCurveTo(10, 0, 5, 42); ctx.stroke();
  ctx.strokeStyle = C(GOLD); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-36, -30); ctx.quadraticCurveTo(-2, -38, 42, -28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-26, 20); ctx.quadraticCurveTo(4, 34, 34, 20); ctx.stroke();
  // 복부 판갑 줄
  ctx.strokeStyle = C('rgba(20,0,4,0.6)'); ctx.lineWidth = 2;
  ctx.beginPath(); for (let i = 0; i < 2; i++) { const y = 2 + i * 10; ctx.moveTo(-30 + i * 3, y); ctx.quadraticCurveTo(4, y + 8, 38 - i * 3, y); } ctx.stroke();
  // 심장부 균열 / 코어
  const k = core ? 1 : heat;
  if (k > 0.05) {
    glow(ctx, 6, -10, 40 + k * 30, DFIRE, 0.6 * k + 0.2 * Math.sin(t * 8) * k);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba('#ffcf80', 0.8 * k);
    ctx.beginPath(); ctx.moveTo(6, -24); ctx.lineTo(14, -10); ctx.lineTo(8, 4); ctx.lineTo(0, -8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  lavaCracks(ctx, heat, t, [-30, -20, -20, -6, -26, 10, 30, -24, 22, -10, 30, 6, -8, 24, 2, 32, 16, 26]);
}
function drawPauldron(ctx, x, y, s, t, heat) {
  ctx.save(); ctx.translate(x, y);
  // 가시
  for (let i = 0; i < 3; i++) {
    const a = -PI / 2 + s * (0.1 + i * 0.5);
    ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.25) * 14, Math.sin(a - 0.25) * 11); ctx.lineTo(Math.cos(a) * (38 - i * 6), Math.sin(a) * (34 - i * 6)); ctx.lineTo(Math.cos(a + 0.25) * 14, Math.sin(a + 0.25) * 11); ctx.closePath();
    ink(ctx, lg(ctx, 'crspk' + i + s, 0, 0, Math.cos(a) * 36, Math.sin(a) * 32, [0, C('#3a0a10'), 1, C('#c8b0a0')]), 1.5);
  }
  ctx.beginPath(); ctx.ellipse(0, 0, 29, 20, s * 0.25, 0, TAU);
  ink(ctx, rg(ctx, 'crpaul' + s, s * 6, -6, 2, 0, 0, 26, [0, C('#f06058'), 0.4, C(RED), 1, C(DARKR)]), 3);
  if (s < 0) rim(ctx, -28, 0, RIM, 3, 0.4);
  ctx.strokeStyle = C(GOLD); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 3, 19, 11, s * 0.25, 0.2, PI - 0.2); ctx.stroke();
  lavaCracks(ctx, heat, t, [-12, -4, -4, 2, -8, 8]);
  ctx.restore();
}
function drawGauntlet(ctx, t, heat, k) {
  ctx.beginPath(); ctx.moveTo(-16, -11); ctx.lineTo(8, -13); ctx.quadraticCurveTo(20, -10, 20, 0); ctx.quadraticCurveTo(20, 11, 8, 13); ctx.lineTo(-16, 11); ctx.closePath();
  ink(ctx, lg(ctx, 'crgaunt' + k, 0, -13, 0, 13, [0, C(k < 1 ? '#7a2028' : '#e8504c'), 0.5, C(k < 1 ? '#4a0c14' : RED), 1, C(DARKR)]), 2.5);
  ctx.strokeStyle = C(GOLD); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(-14, 8); ctx.stroke();
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(12, -8 + i * 6); ctx.lineTo(22, -6 + i * 6); ctx.lineTo(13, -4 + i * 6); ctx.closePath(); ink(ctx, C('#c8b0a0'), 1); }
  if (heat > 0.1) glow(ctx, -16, 0, 16, LAVA, heat * 0.6);
}
function drawHalberd(ctx, t, heat, loose) {
  // 자루
  ctx.fillStyle = C('#1a0c0c'); ctx.strokeStyle = C(OUT); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.rect(-86, -4, 206, 8); ctx.stroke(); ctx.fill();
  ctx.fillStyle = C('#4a2a22'); ctx.fillRect(-86, -3, 206, 2);
  ctx.fillStyle = C(GOLD); for (const x of [-60, -20, 60]) ctx.fillRect(x, -5, 6, 10);
  // 물미
  ctx.beginPath(); ctx.moveTo(-86, -5); ctx.lineTo(-100, 0); ctx.lineTo(-86, 5); ctx.closePath(); ink(ctx, C('#8a8a98'), 1.5);
  // 도끼날
  ctx.beginPath();
  ctx.moveTo(96, -4); ctx.lineTo(96, 4);
  ctx.quadraticCurveTo(82, 22, 84, 50); ctx.quadraticCurveTo(108, 44, 126, 52); ctx.quadraticCurveTo(122, 24, 124, 4);
  ctx.lineTo(124, -4); ctx.closePath();
  ink(ctx, lg(ctx, 'crblade', 84, 0, 126, 50, [0, C('#3a3a48'), 0.4, C('#9a9aac'), 0.8, C('#f0f0ff'), 1, C('#ff8060')]), 2.5);
  // 날 끝 핏빛 광택
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ff4a3a', 0.5 + heat * 0.4); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(86, 50); ctx.quadraticCurveTo(108, 43, 124, 50); ctx.stroke();
  ctx.restore();
  // 뒤 갈고리
  ctx.beginPath(); ctx.moveTo(100, -4); ctx.quadraticCurveTo(104, -20, 92, -30); ctx.quadraticCurveTo(110, -24, 114, -4); ctx.closePath();
  ink(ctx, lg(ctx, 'crhook', 100, -30, 110, -4, [0, C('#e0e0f0'), 1, C('#4a4a58')]), 2);
  // 창끝
  ctx.beginPath(); ctx.moveTo(120, -6); ctx.lineTo(158, 0); ctx.lineTo(120, 6); ctx.closePath();
  ink(ctx, lg(ctx, 'crspike', 120, -6, 120, 6, [0, C('#ffffff'), 0.5, C('#a8a8b8'), 1, C('#3a3a48')]), 2);
  ctx.fillStyle = C(RED2); ctx.beginPath(); ctx.arc(104, 0, 5, 0, TAU); ctx.fill();
  if (heat > 0.2 || loose) glow(ctx, 108, 20, 44, DFIRE, 0.25 + heat * 0.3);
}
function drawFaulds(ctx, x, y, t, heat) {
  for (let i = 0; i < 4; i++) {
    const px = x - 30 + i * 18, sw = Math.sin(t * 2 + i) * 1.5;
    ctx.beginPath(); ctx.moveTo(px - 10, y - 6); ctx.lineTo(px + 12, y - 6); ctx.lineTo(px + 11 + sw, y + 22); ctx.lineTo(px - 8 + sw, y + 24); ctx.closePath();
    ink(ctx, lg(ctx, 'crfauld' + i, 0, y - 6, 0, y + 24, [0, C(i === 3 ? '#c83a3e' : RED), 1, C(DARKR)]), 2);
    ctx.strokeStyle = C(GOLD); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px - 7 + sw, y + 20); ctx.lineTo(px + 10 + sw, y + 19); ctx.stroke();
  }
  // 허리띠
  ctx.beginPath(); ctx.rect(x - 34, y - 12, 72, 10); ink(ctx, lg(ctx, 'crbelt', 0, y - 12, 0, y - 2, [0, C('#4a2a1a'), 1, C('#1a0a06')]), 2);
  ctx.beginPath(); ctx.arc(x + 4, y - 7, 7, 0, TAU); ink(ctx, rg(ctx, 'crbuckle', x + 6, y - 9, 1, x + 4, y - 7, 8, [0, C('#ffe8a0'), 1, C(GOLD)]), 1.5);
  if (heat > 0.1) glow(ctx, x, y + 6, 40, LAVA, heat * 0.35);
}
function drawRock(ctx, p) {
  ctx.rotate(p.rot);
  ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-4, -15); ctx.lineTo(12, -10); ctx.lineTo(15, 6); ctx.lineTo(2, 14); ctx.lineTo(-13, 9); ctx.closePath();
  ctx.fillStyle = '#5a4a44'; ctx.strokeStyle = '#140c0a'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#8a7a70'; ctx.beginPath(); ctx.moveTo(-4, -13); ctx.lineTo(10, -9); ctx.lineTo(2, -2); ctx.closePath(); ctx.fill();
}
function drawRedShard(ctx) { ctx.fillStyle = '#8e1622'; ctx.strokeStyle = '#e0484a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-8, -3); ctx.lineTo(6, -7); ctx.lineTo(8, 5); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); }
function drawGoldShard(ctx) { ctx.fillStyle = '#c89a48'; ctx.beginPath(); ctx.moveTo(-5, -2); ctx.lineTo(5, -4); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill(); }
