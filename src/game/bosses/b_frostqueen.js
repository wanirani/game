// 10장 보스: 서리 여왕 이자벨라 — 순간이동하는 얼음 마녀
// 패턴: 빙결 순간이동 · 고드름 비 · 얼음 기둥 연쇄 · 눈보라(밀어내기) · 빙결 광선(동결) · 얼음 거울 분신 · 다이아몬드 더스트(3페이즈)
import { BossB, PI, OUT, R, C, LG, RG, ink, glow, glowE, eye, warnRect, warnFloor, warnLine, warnBang, lineStrike, impact, hash, smoothOpen } from './b_common.js';
import { Entity } from '../entity.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, ease, rgba, mix } from '../../core/math.js';

const ICE = '#9fe8ff', ICE_L = '#e6fbff', ICE_D = '#2c5a8a', ICE_DD = '#12264a';
const SKIN = '#cfe6f4', SKIN_D = '#7fa4c4';
const HAIR = '#eef6ff', HAIR_D = '#8aa6c8';
const GEM = '#5fd0ff';

/** 거울 분신: 한 번 맞으면 깨짐 */
class MirrorClone extends Entity {
  constructor(queen, x, y) {
    super(x - queen.w / 2, y - queen.h, queen.w, queen.h);
    this.kind = 'enemy'; this.queen = queen; this.world = queen.world;
    this.def = { id: 'frost_mirror', name: '얼음 거울', material: 'ice' };
    this.stats = { maxHp: 1, hp: 1, def: 0, res: 0, weak: [], resist: [], immune: [], exp: 0, gold: [0, 0], level: 1 };
    this.hp = 1; this.z = 4; this.facing = -1; this.flashT = 0; this.life = 5; this.fire = rand(0.6, 1.1);
    this.pose = { ...queen.pose }; this.bobPh = rand(0, TAU);
  }
  hurtbox() { return { x: this.x + 10, y: this.y + 20, w: this.w - 20, h: this.h - 30 }; }
  takeHit(dmg, attack, world) { this.shatter(world); return true; }
  shatter(world) {
    if (this.dead) return;
    this.dead = true;
    world.fx.burst('ice', this.cx, this.cy, 26, { speed: 300 });
    world.fx.burst('shard', this.cx, this.cy, 10, { color: ICE_L });
    world.fx.ring(this.cx, this.cy, { color: ICE, r0: 10, r1: 80, life: 0.35, width: 4 });
    audio.sfx('break_wall', { vol: 0.6, pitch: 1.4 });
  }
  update(dt, world) {
    if (world.timeStop > 0) dt *= 0.25;
    this.t += dt; this.life -= dt;
    const q = this.queen;
    if (q.dying > 0 || q.dead || this.life <= 0) { this.shatter(world); return; }
    const p = world.player;
    if (p) this.facing = Math.sign(p.cx - this.cx) || 1;
    this.y += Math.sin(this.t * 2 + this.bobPh) * 12 * dt;
    this.fire -= dt;
    if (this.fire <= 0 && p) {
      this.fire = q.phase >= 2 ? 1.0 : 1.4;
      q.shardFan(world, this.cx + this.facing * 20, this.y + 50, 3, 0.22, 340);
    }
  }
  lights(L) { L.add(this.cx, this.cy, 110, ICE, 0.5); }
  draw(ctx, world) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    this.queen.paintQueen(ctx, this.cx, this.bottom, this.facing, this.t + this.bobPh, this.pose, true);
    ctx.restore();
  }
}

export class FrostQueen extends BossB {
  setup() {
    this.facing = -1;
    this.bobT = 0;
    this.pose = { la: 0.3, le: 0.3, ra: 0.2, re: 0.4, lean: 0, cast: 0 };   // 팔 각도 (0=아래, +앞)
    this.poseT = { ...this.pose };
    this.vanish = 0;                 // 0=보임, 1=사라짐
    this.homeY = this.A.floor - 70;  // 기본 부유 높이 (발끝)
    this.y = this.homeY - this.h;
    this.clones = [];
    this.aura = 1;
    this.frozenT = 0;                // 사망 시 동결
    this.crystals = [];              // 고드름 예고 {x, k}
  }
  setState(s) { super.setState(s); this.beamLine = null; this.windK = 0; this.firedI = -1; }
  setPose(la, le, ra, re, lean = 0) { const P = this.poseT; P.la = la; P.le = le; P.ra = ra; P.re = re; P.lean = lean; }
  tickB(dt, world) {
    const k = 1 - Math.exp(-10 * dt);
    for (const key in this.poseT) this.pose[key] += (this.poseT[key] - this.pose[key]) * k;
    this.pose.cast = Math.max(0, this.pose.cast - dt * 1.5);
    this.clones = this.clones.filter((c) => !c.dead);
    // 발밑 서리 입자
    if (this.vanish < 0.5 && Math.random() < 0.25) world.fx.emit('ice', this.cx + rand(-26, 26), this.bottom - 6, { speed: 30, vy: 20, grav: 60, size: 2, life: 0.7 });
    if (this.vanish < 0.5 && Math.random() < 0.1) world.fx.emit('magic', this.cx + rand(-40, 40), this.cy + rand(-60, 40), { color: ICE_L, speed: 20, size: 2 });
  }
  /** 부드러운 이동 (목표 지점) */
  glide(dt, tx, ty, rate = 3) {
    const k = 1 - Math.exp(-rate * dt);
    const x = this.cx + (tx - this.cx) * k, y = this.bottom + (ty - this.bottom) * k;
    this.x = x - this.w / 2; this.y = y - this.h;
  }
  place(x, y) { this.x = x - this.w / 2; this.y = y - this.h; }
  hitParts() { return this.vanish > 0.5 ? [] : [{ x: this.x + 12, y: this.y + 18, w: this.w - 24, h: this.h - 26 }]; }
  contactParts() { return this.vanish > 0.3 ? [] : [{ x: this.x + 16, y: this.y + 24, w: this.w - 32, h: this.h - 40 }]; }
  get bobY() { return Math.sin(this.t * 1.8) * 6; }
  /** 순간이동 목적지 후보 */
  spot(kind) {
    const A = this.A, p = this.P, F = A.floor;
    const px = p ? p.cx : A.cx;
    const cam = this.world.camera;
    const vx0 = Math.max(A.x0 + 80, cam ? cam.x + 90 : A.x0 + 80), vx1 = Math.min(A.x1 - 80, cam ? cam.x + cam.vw - 90 : A.x1 - 80);
    if (kind === 'high') return { x: clamp(px + (Math.random() < 0.5 ? -1 : 1) * rand(160, 300), vx0, vx1), y: F - rand(200, 250) };
    if (kind === 'side') { const s = px > (vx0 + vx1) / 2 ? -1 : 1; return { x: s < 0 ? vx0 + 20 : vx1 - 20, y: F - 90 }; }
    if (kind === 'center') return { x: clamp((vx0 + vx1) / 2, A.x0 + 200, A.x1 - 200), y: F - 280 };
    return { x: clamp(px + (Math.random() < 0.5 ? -1 : 1) * rand(260, 380), vx0, vx1), y: F - rand(60, 110) };
  }

  // ───────────── 상태 ─────────────
  s_intro(dt, world, t) {
    this.setPose(0.2, 0.2, 2.4, 0.5);
    if (this.at(0.2)) { audio.sfx('ice', { pitch: 0.7 }); world.fx.burst('ice', this.cx, this.cy, 30, { speed: 260 }); }
    this.glide(dt, this.cx, this.homeY + this.bobY, 2);
    if (t > 1.0) this.setState('idle');
  }
  s_idle(dt, world, t) {
    this.facePlayer();
    this.setPose(0.35 + Math.sin(this.t * 1.3) * 0.08, 0.5, 0.25, 0.6, 0);
    this.glide(dt, this.cx, (this.hoverY ?? this.homeY) + this.bobY, 3);
    if (t < (this.rest ?? this.restTime(0.9))) return;
    this.rest = this.restTime(rand(0.6, 1.1));
    const ph = this.phase;
    const a = this.choose([
      ['icicles', 3], ['pillars', 3], ['beam', 3], ['blizzard', 2], ['mirror', ph >= 1 ? 2.6 : 0.8], ['dust', ph >= 2 ? 2.6 : 0], ['warp', 1.5],
    ]);
    this.setState(a);
  }
  /** 공용 순간이동: out → (목적지 서리 안개) → in, 이후 next 상태 */
  s_warp(dt, world, t) {
    const T1 = 0.28, T2 = 0.62;
    if (this.at(0.001)) {
      this.warpTo = this.spot(this.warpKind || (Math.random() < 0.5 ? 'high' : 'low'));
      this.warpKind = null;
      audio.sfx('ice', { vol: 0.8, pitch: 1.5 });
      const gx = this.cx, gy = this.bottom, f = this.facing, pz = { ...this.pose }, tt = this.t;
      world.fx.ghost((ctx, a) => { ctx.save(); ctx.globalAlpha = a * 0.6; this.paintQueen(ctx, gx, gy, f, tt, pz, true); ctx.restore(); }, 0.35);
    }
    if (t < T1) { this.vanish = t / T1; this.invuln = this.vanish > 0.6; }
    else if (t < T2) {
      this.vanish = 1; this.invuln = true;
      if (this.at(T1 + 0.001)) { world.fx.burst('ice', this.cx, this.cy, 24, { speed: 280 }); world.fx.burst('shard', this.cx, this.cy, 8, { color: ICE_L }); }
      const w = this.warpTo;
      if (this.every(0.04, T1, T2)) world.fx.emit('smoke', w.x + rand(-30, 30), w.y - rand(20, 120), { color: '#d8f4ff', size: 16, speed: 30, alpha: 0.5 });
    } else {
      if (this.at(T2 + 0.001) || this.vanish === 1 && t >= T2) {
        const w = this.warpTo; this.place(w.x, w.y); this.hoverY = w.y; this.facePlayer();
        world.fx.burst('ice', this.cx, this.cy, 20, { speed: 200 }); world.fx.ring(this.cx, this.cy, { color: ICE_L, r0: 10, r1: 90, life: 0.35, width: 4 });
        audio.sfx('ice', { vol: 0.6, pitch: 1.2 });
      }
      this.vanish = Math.max(0, 1 - (t - T2) / 0.2); this.invuln = this.vanish > 0.6;
      if (t > T2 + 0.25) { this.vanish = 0; this.invuln = false; this.setState(this.afterWarp || 'idle'); this.afterWarp = null; }
    }
  }
  warpThen(next, kind) { this.afterWarp = next; this.warpKind = kind; this.setState('warp'); }

  // 1) 고드름 비: 천장에 맺혔다가 차례로 낙하
  s_icicles(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    if (this.at(0.001) && this.bottom > F - 150) { this.warpThen('icicles', 'high'); return; }
    this.facePlayer();
    this.setPose(2.8, 0.2, 2.6, 0.3, -0.05);
    this.glide(dt, this.cx, (this.hoverY ?? this.homeY) - 10 + this.bobY, 3);
    if (this.at(0.25)) {
      audio.sfx('magic', { pitch: 1.4 }); world.fx.ring(this.cx, this.y + 10, { color: ICE, r0: 10, r1: 70, life: 0.4, width: 3 });
      const n = this.phase >= 1 ? 10 : 8;
      const px = p ? p.cx : A.cx;
      const gap = 88;
      const start = px - (n - 1) / 2 * gap + rand(-30, 30);
      const order = []; for (let i = 0; i < n; i++) order.push(i);
      // 플레이어 쪽부터 번갈아 떨어짐
      order.sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2));
      order.forEach((i, k) => { const x = clamp(start + i * gap, A.x0 + 30, A.x1 - 30); this.icicle(world, x, 0.7 + k * 0.09 + (i % 2) * 0.05); });
      if (this.phase >= 2 || this.inferno) order.forEach((i, k) => this.icicle(world, clamp(start + i * gap + gap / 2, A.x0 + 30, A.x1 - 30), 1.8 + k * 0.07));
    }
    if (t > (this.phase >= 2 || this.inferno ? 3.0 : 2.1)) this.setState('idle');
  }
  icicle(world, x, warn) {
    const A = this.A, F = A.floor;
    const top = Math.max(A.top, F - 520);
    const st = { y: top + 34, vy: 0, len: rand(46, 64) };
    this.zone({
      x: x - 12, y: top, w: 24, h: 50, warn, life: 2, mv: 0.9, element: 'ice', kb: [160, -300], z: 5,
      tick: (z, w, dt) => {
        if (z.t < z.warn) return;
        st.vy += 2600 * dt; st.y += st.vy * dt;
        z.y = st.y - st.len * 0.6; z.h = st.len * 0.9;
        if (st.y >= F) {
          w.fx.burst('ice', x, F - 6, 12, { speed: 240, angle: -PI / 2, spread: 1.2 });
          w.fx.burst('shard', x, F - 6, 5, { color: ICE_L, size: 3 });
          audio.sfx('break_wall', { vol: 0.35, pitch: rand(1.4, 1.8) });
          z.dur = z.t - z.warn;
          if (this.inferno) this.shardFan(w, x, F - 12, 2, 1.2, 260, -PI / 2);
        }
      },
      paint: (ctx, z) => {
        const k = z.k;
        if (z.t < z.warn) {
          // 천장에서 자라는 고드름 + 낙하선
          warnLine(ctx, x, top + 20, x, F, k * 0.6, ICE, 1);
          ctx.translate(x, top); ctx.scale(0.4 + 0.6 * k, 0.4 + 0.6 * k);
          drawIcicle(ctx, st.len, this.t + x);
          return;
        }
        ctx.translate(x, st.y - st.len); drawIcicle(ctx, st.len, this.t + x);
        glowE(ctx, 0, -20, 10, 40, ICE, 0.4);
      },
    });
  }

  // 2) 얼음 기둥 연쇄 (바닥을 타고 플레이어 쪽으로)
  s_pillars(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    if (this.at(0.001) && this.bottom < F - 150) { this.warpThen('pillars', 'low'); return; }
    this.facePlayer();
    this.setPose(1.1, -0.4, 1.3, -0.5, 0.15);
    this.glide(dt, this.cx, (this.hoverY ?? this.homeY) + this.bobY, 3);
    if (this.at(0.35)) {
      audio.sfx('ice', { pitch: 0.6 }); impact(world, { shake: 4, time: 0.3 });
      const dirs = this.phase >= 1 ? [this.facing, -this.facing] : [this.facing];
      for (const d of dirs) {
        const n = 9;
        for (let i = 0; i < n; i++) {
          const x = this.cx + d * (70 + i * 74);
          if (x < A.x0 + 20 || x > A.x1 - 20) break;
          this.pillar(x, 0.45 + i * 0.1, d === this.facing ? 150 : 120);
        }
      }
      if (this.inferno) for (let i = 0; i < 6; i++) this.pillar(clamp((p ? p.cx : A.cx) + (i - 2.5) * 110, A.x0 + 30, A.x1 - 30), 1.6 + i * 0.05, 110);
    }
    if (t > (this.inferno ? 2.8 : 2.2)) this.setState('idle');
  }
  pillar(x, warn, H) {
    const F = this.A.floor;
    this.zone({
      x: x - 26, y: F - H, w: 52, h: H, warn, life: 0.55, mv: 1.05, element: 'ice', kb: [200, -560], z: 5,
      onStart: (z, w) => { w.fx.burst('ice', x, F - 10, 10, { speed: 280, angle: -PI / 2, spread: 0.7 }); audio.sfx('ice', { vol: 0.4, pitch: rand(1.2, 1.6) }); w.camera.shake(2, 0.1); },
      onEnd: (z, w) => { w.fx.burst('shard', x, F - H * 0.5, 6, { color: ICE_L }); w.fx.burst('ice', x, F - H * 0.5, 8, { speed: 160 }); },
      paint: (ctx, z) => {
        if (z.t < z.warn) { warnFloor(ctx, x, F, 64, z.k, ICE, this.t); return; }
        const grow = ease.outBack(Math.min(1, z.a * 5)), fade = z.a > 0.8 ? (1 - z.a) * 5 : 1;
        ctx.globalAlpha *= fade;
        ctx.translate(x, F);
        drawCrystal(ctx, 30, H * grow, hash(x));
      },
      light: (L, z) => { if (z.on) L.add(x, F - H * 0.5, 90, ICE, 0.5); },
    });
  }

  // 3) 빙결 광선: 조준 → 굵은 광선 (맞으면 잠시 얼어붙음)
  s_beam(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    const shots = this.phase >= 1 ? 2 : 1;
    const per = 1.45;
    const i = Math.floor(t / per), lt = t - i * per;
    if (i >= shots) { this.beamLine = null; this.setState('idle'); return; }
    this.facePlayer();
    this.setPose(1.55, 0.05, 0.5, 0.8, 0.1);
    this.glide(dt, this.cx, (this.hoverY ?? this.homeY) + this.bobY, 3);
    const hx = this.cx + this.facing * 44, hy = this.y + 52;
    if (lt < 0.8) {
      this.pose.cast = Math.max(this.pose.cast, lt / 0.8);
      if (lt < 0.6 && p) { this.beamAim = Math.atan2(p.cy - hy, p.cx - hx); }
      if (this.every(0.03, i * per, i * per + 0.8)) { const a = rand(0, TAU), r = rand(30, 60); world.fx.emit('ice', hx + Math.cos(a) * r, hy + Math.sin(a) * r, { vx: -Math.cos(a) * r * 5, vy: -Math.sin(a) * r * 5, speed: 0, grav: 0, life: 0.2 }); }
      const L = this.beamLen(hx, hy, this.beamAim);
      this.beamLine = { x0: hx, y0: hy, x1: hx + Math.cos(this.beamAim) * L, y1: hy + Math.sin(this.beamAim) * L, warn: lt / 0.8, locked: lt >= 0.6 };
      if (this.at(i * per + 0.05)) audio.sfx('charge_ready', { vol: 0.5, pitch: 1.3 });
    } else {
      if (this.firedI !== i) {
        this.firedI = i;
        const L = this.beamLen(hx, hy, this.beamAim);
        const line = { x0: hx, y0: hy, x1: hx + Math.cos(this.beamAim) * L, y1: hy + Math.sin(this.beamAim) * L, th: 30 };
        this.beamLine = { ...line, fire: true };
        audio.sfx('ice', { vol: 1, pitch: 0.5 }); audio.sfx('thunderclap', { vol: 0.3, pitch: 2 });
        impact(world, { shake: 6, time: 0.4 });
        this.zone({ x: 0, y: 0, w: 1, h: 1, life: 0.55, mv: 1.2, element: 'ice', kb: [260, -200], line, z: 7,
          onHitP: (z, w) => this.freezePlayer(w),
          tick: (z, w) => { if (Math.random() < 0.6) w.fx.burst('ice', line.x1, line.y1, 3, { speed: 260 }); },
          paint: (ctx, z) => this.paintBeam(ctx, line, z.a),
          light: (L2) => { L2.add(line.x1, line.y1, 130, ICE, 0.8); L2.add((line.x0 + line.x1) / 2, (line.y0 + line.y1) / 2, 180, ICE, 0.6); },
        });
      }
      this.pose.cast = 1;
      if (lt > 1.35) this.beamLine = null;
    }
  }
  beamLen(x, y, a) {
    const A = this.A, c = Math.cos(a), s = Math.sin(a);
    let L = 1600;
    if (s > 0.02) L = Math.min(L, (A.floor - y) / s);
    if (s < -0.02) L = Math.min(L, (A.top - y) / s);
    if (c > 0.02) L = Math.min(L, (A.x1 - x) / c);
    if (c < -0.02) L = Math.min(L, (A.x0 - x) / c);
    return Math.max(40, L);
  }
  freezePlayer(world) {
    const p = world.player;
    p.hurtT = Math.max(p.hurtT ?? 0, 0.75); p.vx = 0;
    world.fx.burst('ice', p.cx, p.cy, 20, { speed: 200 });
    world.fx.text(p.cx, p.y - 20, '동결!', { color: ICE, size: 20 });
    audio.sfx('ice', { pitch: 0.8 });
    const t0 = world.time;
    world.fx.ghost((ctx, a) => {
      const x = p.cx, y = p.bottom;
      ctx.save(); ctx.globalAlpha = Math.min(1, a * 2) * 0.75;
      ctx.translate(x, y);
      ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-30, -48); ctx.lineTo(-14, -78); ctx.lineTo(10, -84); ctx.lineTo(28, -60); ctx.lineTo(26, 0); ctx.closePath();
      ctx.fillStyle = 'rgba(170,230,255,0.45)'; ctx.fill(); ctx.strokeStyle = 'rgba(230,250,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(-18, -20); ctx.lineTo(-8, -60); ctx.moveTo(10, -10); ctx.lineTo(18, -44); ctx.stroke();
      ctx.restore();
    }, 0.75, 'front');
  }
  paintBeam(ctx, l, a) {
    const t = this.t;
    const fade = Math.min(1, a * 10, (1 - a) * 5);
    const dx = l.x1 - l.x0, dy = l.y1 - l.y0, L = Math.hypot(dx, dy);
    ctx.save();
    ctx.translate(l.x0, l.y0); ctx.rotate(Math.atan2(dy, dx));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3 * fade; ctx.fillStyle = '#3a8ad8'; ctx.fillRect(0, -26, L, 52);
    ctx.globalAlpha = 0.6 * fade; ctx.fillStyle = ICE; ctx.fillRect(0, -14, L, 28);
    ctx.globalAlpha = 0.95 * fade; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -5, L, 10);
    // 결정 파편 링
    ctx.globalAlpha = 0.8 * fade; ctx.strokeStyle = ICE_L; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = (t * 600) % 70; x < L; x += 70) { ctx.moveTo(x, -20); ctx.lineTo(x + 10, 0); ctx.lineTo(x, 20); }
    ctx.stroke();
    ctx.restore();
    glow(ctx, l.x0, l.y0, 50, ICE, fade);
    glow(ctx, l.x1, l.y1, 80, ICE_L, fade);
  }

  // 4) 눈보라: 한쪽 끝으로 밀어내고 벽에는 얼음 가시, 바람에 실린 파편
  s_blizzard(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    if (this.at(0.001)) { this.warpThen('blizzard2', 'side'); }
  }
  s_blizzard2(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    const d = this.cx < A.cx ? 1 : -1;           // 바람 방향
    this.facing = d;
    this.setPose(1.9, -0.1, 1.9, -0.1, -0.1);
    this.glide(dt, this.cx, (this.hoverY ?? this.homeY) + this.bobY, 3);
    const dur = this.phase >= 2 ? 3.8 : 3.2;
    if (this.at(0.05)) { audio.sfx('mist', { vol: 1, pitch: 0.6 }); world.game.toast('눈보라가 몰아친다!', ICE); }
    const wallX = d > 0 ? A.x1 : A.x0;
    if (this.at(0.3)) {
      // 반대쪽 벽 얼음 가시
      this.zone({ x: d > 0 ? wallX - 56 : wallX, y: F - 220, w: 56, h: 220, warn: 0.6, life: dur - 0.3, mv: 1.1, element: 'ice', kb: [-d * 420, -360], z: 5,
        paint: (ctx, z) => this.paintWallSpikes(ctx, wallX, -d, F, z) });
    }
    const on = t > 0.6 && t < dur;
    this.windK = on ? Math.min(1, (t - 0.6) * 2, (dur - t) * 2) : 0;
    if (on && p && !p.dead) {
      const push = (this.phase >= 1 ? 175 : 150) * this.windK * (p.onGround ? 1 : 1.25);
      p.x += d * push * dt;
      p.x = clamp(p.x, A.x0, A.x1 - p.w);
    }
    if (on && this.every(0.02)) {
      const x = d > 0 ? A.x0 + rand(0, 80) : A.x1 - rand(0, 80);
      world.fx.emit('ice', x, rand(A.top + 20, F - 10), { vx: d * rand(500, 800), vy: rand(-40, 60), speed: 0, grav: 0, drag: 1, life: rand(1.2, 2), size: rand(1.5, 3), color: '#f4fbff' });
    }
    if (on && this.every(this.phase >= 1 ? 0.42 : 0.6, 0.8, dur - 0.3)) {
      const y = F - (Math.random() < 0.5 ? rand(20, 40) : rand(80, 120));
      const x = d > 0 ? A.x0 + 10 : A.x1 - 10;
      this.shoot({ x, y, vx: d * 520, vy: 0, w: 26, h: 12, life: 3.5, render: shardRender, attack: { mv: 0.7, element: 'ice', kb: [d * 200, -200] }, collideWalls: false, light: { r: 50, color: ICE, i: 0.4 } });
    }
    if (t > dur + 0.3) { this.windK = 0; this.setState('idle'); }
  }
  paintWallSpikes(ctx, wx, d, F, z) {
    const k = z.t < z.warn ? z.k : 1;
    if (z.t < z.warn) warnRect(ctx, d > 0 ? wx : wx - 56, F - 220, 56, 220, z.k, ICE, this.t);
    const g = ease.outBack(Math.min(1, (z.t - z.warn) * 4));
    if (z.t < z.warn) return;
    ctx.save(); ctx.translate(wx, F);
    for (let i = 0; i < 7; i++) {
      const y = -16 - i * 30, len = (40 + hash(i) * 26) * g;
      ctx.save(); ctx.translate(0, y); ctx.rotate(d > 0 ? 0 : PI); ctx.rotate(-PI / 2 + (hash(i + 3) - 0.5) * 0.4);
      drawCrystal(ctx, 14, len, hash(i));
      ctx.restore();
    }
    ctx.restore();
  }

  // 5) 얼음 거울 분신
  s_mirror(dt, world, t) {
    const A = this.A, F = A.floor;
    this.facePlayer();
    this.setPose(2.2, 0.6, 2.2, 0.6, 0);
    if (this.at(0.25)) {
      audio.sfx('magic', { pitch: 1.6 }); audio.sfx('ice', { pitch: 1.2 });
      const n = this.phase >= 2 || this.inferno ? 3 : 2;
      const spots = [];
      for (let i = 0; i < n + 1; i++) { let s, tries = 0; do { s = this.spot(i % 2 ? 'high' : 'low'); tries++; } while (tries < 8 && spots.some((q) => Math.abs(q.x - s.x) < 150)); spots.push(s); }
      // 본체도 새 위치로 (분신들 사이 어딘가)
      const me = spots.pop();
      world.fx.burst('ice', this.cx, this.cy, 24, { speed: 260 });
      this.place(me.x, me.y); this.hoverY = me.y;
      for (const s of spots) {
        const c = new MirrorClone(this, s.x, s.y);
        c.pose = { ...this.pose };
        world.add(c); this.clones.push(c);
        world.fx.burst('ice', s.x, s.y - 60, 20, { speed: 220 });
      }
      world.fx.burst('ice', this.cx, this.cy, 20, { speed: 200 });
    }
    if (t > 0.25) {
      this.glide(dt, this.cx, (this.hoverY ?? this.homeY) + this.bobY, 3);
      this.setPose(0.4, 0.5, 0.3, 0.6);
      if (this.every(1.3, 0.9, 4.2)) this.shardFan(world, this.cx + this.facing * 20, this.y + 50, 3, 0.22, 340);
    }
    if (t > 4.5 || (t > 0.5 && this.clones.length === 0)) { for (const c of this.clones) c.shatter(world); this.clones.length = 0; this.setState('idle'); }
  }
  shardFan(world, x, y, n, spread, speed, base) {
    const p = world.player;
    const a0 = base ?? (p ? Math.atan2(p.cy - y, p.cx - x) : 0);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i - (n - 1) / 2) * spread;
      this.shoot({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, w: 20, h: 10, life: 3, render: shardRender, attack: { mv: 0.7, element: 'ice' }, light: { r: 40, color: ICE, i: 0.4 } });
    }
    audio.sfx('ice', { vol: 0.4, pitch: 1.8 });
  }
  onHurt() {
    // 본체가 맞으면 분신이 흔들림
    if (this.clones.length && this.state === 'mirror') for (const c of this.clones) c.life = Math.min(c.life, 0.6);
  }

  // 6) 다이아몬드 더스트 (3페이즈): 중앙 상공에서 회전 탄막
  s_dust(dt, world, t) {
    const A = this.A, F = A.floor;
    if (this.at(0.001) && Math.abs(this.bottom - (F - 280)) > 40) { this.warpThen('dust', 'center'); return; }
    this.setPose(1.6 + Math.sin(t * 6) * 0.2, 0.2, 1.6 + Math.cos(t * 6) * 0.2, 0.2, 0);
    this.glide(dt, this.cx, (this.hoverY ?? this.homeY) + this.bobY, 3);
    const dur = 3.4;
    if (this.at(0.1)) { audio.sfx('magic', { pitch: 0.8 }); world.game.toast('다이아몬드 더스트!', ICE_L); }
    if (this.every(0.14, 0.5, dur)) {
      const arms = this.inferno ? 5 : 4;
      const base = t * 1.9;
      for (let i = 0; i < arms; i++) {
        const a = base + i / arms * TAU;
        this.shoot({ x: this.cx, y: this.cy, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, w: 14, h: 14, life: 4, render: diamondRender, attack: { mv: 0.55, element: 'ice' }, collideWalls: true });
      }
      if (this.every(0.7, 0.5, dur)) audio.sfx('ice', { vol: 0.3, pitch: 2 });
    }
    if (t > dur + 0.4) this.setState('idle');
  }

  // ───────────── 페이즈/사망 ─────────────
  onPhase(n, world) {
    world.fx.burst('ice', this.cx, this.cy, 50, { speed: 380 });
    world.fx.ring(this.cx, this.cy, { color: ICE_L, r0: 20, r1: 260, life: 0.6, width: 8 });
    if (n === 1) world.game.toast('이자벨라: "얼음 거울이 너를 비추리라."', ICE_L);
    if (n >= 2) world.game.toast('이자벨라: "영원한 겨울을 보아라!"', ICE_L);
  }
  onDeath(world) {
    this.dying = 3.2; this.clearJobs(); this.vanish = 0; this.beamLine = null; this.windK = 0;
    for (const c of this.clones) c.shatter(world);
    audio.sfx('ice', { pitch: 0.5 });
  }
  dyingTick(dt, world) {
    const d = this.dying;
    this.frozenT = clamp((3.2 - d) / 1.4, 0, 1);
    if (d > 1.8) { this.setPose(2.6, 0.3, 2.4, 0.2, -0.15); this.x += Math.sin(this.t * 50) * 0.6; }
    if (Math.random() < 0.3) world.fx.emit('ice', this.cx + rand(-30, 30), this.cy + rand(-60, 60), { speed: 100 });
    if (d < 0.9 && !this._shat) {
      this._shat = true;
      world.fx.burst('ice', this.cx, this.cy, 60, { speed: 420 });
      world.fx.burst('shard', this.cx, this.cy, 30, { color: ICE_L, size: 5 });
      world.fx.ring(this.cx, this.cy, { color: ICE_L, r0: 20, r1: 320, life: 0.7, width: 10 });
      world.fx.flash(this.cx, this.cy, { color: '#e8fbff', size: 300, life: 0.3 });
      impact(world, { shake: 12, time: 0.5 });
      audio.sfx('break_wall', { pitch: 1.2 }); audio.sfx('ice', { pitch: 0.6 });
      this.vanish = 1;
    }
    this.tickB(dt, world);
  }

  // ───────────── 조명 ─────────────
  lightsB(L) {
    if (this.vanish > 0.8) return;
    L.add(this.cx, this.cy - 10, 230, ICE, 0.75);
    L.add(this.cx, this.y + 8, 90, ICE_L, 0.6);
    if (this.pose.cast > 0.2) L.add(this.cx + this.facing * 44, this.y + 52, 120, ICE, this.pose.cast);
  }

  // ───────────── 그리기 ─────────────
  paintBack(ctx) {
    // 눈보라 화면 덮개 (월드 좌표로 화면 전체)
    if (this.windK > 0.01 && !R.fl) {
      const cam = this.world.camera, t = this.t, d = this.facing;
      ctx.save();
      ctx.globalAlpha = this.windK * 0.5;
      ctx.fillStyle = 'rgba(200,230,255,0.12)'; ctx.fillRect(cam.x - 20, cam.y - 20, cam.vw + 40, cam.vh + 40);
      ctx.strokeStyle = 'rgba(240,250,255,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 40; i++) {
        const y = cam.y + hash(i) * cam.vh;
        const x = cam.x + ((hash(i + 7) * cam.vw + d * t * (600 + hash(i + 3) * 400)) % cam.vw + cam.vw) % cam.vw;
        ctx.moveTo(x, y); ctx.lineTo(x - d * (30 + hash(i + 1) * 40), y - 3);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (this.beamLine && !this.beamLine.fire && !R.fl) {
      const b = this.beamLine;
      warnLine(ctx, b.x0, b.y0, b.x1, b.y1, b.warn, b.locked ? '#ffffff' : ICE, 1.5);
    }
  }
  paintBody(ctx) {
    if (this.vanish >= 1) return;
    ctx.save();
    ctx.globalAlpha *= 1 - this.vanish;
    this.paintQueen(ctx, this.cx, this.bottom, this.facing, this.t, this.pose, false, this.frozenT);
    ctx.restore();
  }
  /** 여왕 그리기: (x,y) = 치맛자락 아래 중심, f = 방향 */
  paintQueen(ctx, x, y, f, t, P, mirror = false, frozen = 0) {
    const fl = R.fl;
    const lv = this.phase >= 2 && !mirror;
    ctx.save();
    ctx.translate(x, y); ctx.scale(f, 1);
    ctx.rotate(P.lean * 0.3);
    if (mirror && !fl) { glowE(ctx, 0, -70, 60, 90, ICE, 0.35); }
    // 발밑 서리 안개
    if (!fl) { glowE(ctx, 0, -4, 60, 18, ICE, 0.5); glowE(ctx, 0, -2, 36, 8, '#ffffff', 0.4); }
    // 뒤 망토 (흐르는 얼음 베일)
    const w1 = Math.sin(t * 2.2) * 8, w2 = Math.sin(t * 1.7 + 1) * 10;
    ctx.beginPath();
    ctx.moveTo(-6, -104);
    ctx.bezierCurveTo(-40, -90 + w1, -60, -40, -78 + w2, 0 + w1 * 0.5);
    ctx.quadraticCurveTo(-60, 8, -44, -4 + w2 * 0.4);
    ctx.quadraticCurveTo(-30, -50, 4, -96);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'fq_cape' + lv, 0, -104, -60, 0, [0, lv ? 'rgba(90,150,230,0.9)' : 'rgba(150,215,245,0.85)', 1, 'rgba(40,90,160,0.35)']), 2);
    // 뒷머리 (긴 은발)
    this.hair(ctx, t, true);
    // 뒤팔
    this.arm(ctx, -1, P.ra, P.re, t, P.cast * 0.3);
    // 드레스 치마 (종 모양 + 물결 밑단)
    ctx.beginPath();
    ctx.moveTo(-10, -72);
    ctx.bezierCurveTo(-22, -50, -34, -20, -40 + w2 * 0.3, -2);
    for (let i = 0; i <= 8; i++) { const k = i / 8; ctx.lineTo(lerp(-40, 42, k) + Math.sin(t * 3 + i) * 2, -2 + Math.sin(t * 4 + i * 1.3) * 4 + (i % 2) * 5); }
    ctx.bezierCurveTo(34, -20, 20, -50, 10, -72);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'fq_skirt' + lv, 0, -72, 0, 4, [0, ICE_L, 0.4, lv ? '#8ab8e8' : '#b8e4f8', 0.8, lv ? '#2a4a90' : '#5a90c8', 1, 'rgba(60,110,180,0.4)']), 2.5);
    if (!fl) {
      // 치마 서리 무늬 + 림
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const bx = -26 + i * 13; ctx.moveTo(bx * 0.4, -66); ctx.quadraticCurveTo(bx, -30, bx * 1.2 + Math.sin(i) * 4, 0); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(80,140,220,0.35)'; ctx.beginPath(); ctx.moveTo(-46, 4); ctx.bezierCurveTo(-34, -24, -26, -50, -12, -72); ctx.lineTo(-20, -72); ctx.bezierCurveTo(-30, -44, -38, -20, -46, 4); ctx.fill();
      ctx.restore();
      for (let i = 0; i < 6; i++) { const k = (t * 0.7 + i * 0.37) % 1; const sx = lerp(-30, 30, hash(i)), sy = lerp(-60, -6, hash(i + 9)); glint(ctx, sx, sy, 3 + 3 * Math.sin(k * PI), Math.sin(k * PI)); }
      if (lv) { ctx.strokeStyle = rgba(GEM, 0.6 + 0.3 * Math.sin(t * 5)); ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i < 4; i++) { const bx = -24 + i * 16; ctx.moveTo(bx, -8); ctx.lineTo(bx + 4, -20); ctx.lineTo(bx, -30); } ctx.stroke(); }
    }
    // 몸통 (코르셋)
    ctx.beginPath();
    ctx.moveTo(-11, -72); ctx.quadraticCurveTo(-14, -88, -13, -100); ctx.quadraticCurveTo(0, -104, 13, -100); ctx.quadraticCurveTo(14, -88, 11, -72); ctx.quadraticCurveTo(0, -68, -11, -72);
    ink(ctx, fl ? '#fff' : LG(ctx, 'fq_bod' + lv, -13, 0, 13, 0, [0, '#6aa0d0', 0.4, ICE_L, 1, '#9ccbe8']), 2);
    if (!fl) {
      ctx.strokeStyle = '#d8f4ff'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(-4, -76 - i * 5); ctx.lineTo(4, -79 - i * 5); } ctx.stroke();
      glow(ctx, 0, -95, 10, GEM, 0.9); ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.moveTo(0, -99); ctx.lineTo(3, -95); ctx.lineTo(0, -91); ctx.lineTo(-3, -95); ctx.closePath(); ctx.fill();
    }
    // 어깨 서리 장식 (칼라)
    ctx.beginPath();
    ctx.moveTo(-15, -100); ctx.lineTo(-24, -112); ctx.lineTo(-12, -106); ctx.lineTo(-8, -120); ctx.lineTo(0, -106); ctx.lineTo(8, -120); ctx.lineTo(12, -106); ctx.lineTo(24, -112); ctx.lineTo(15, -100); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'fq_col', 0, -120, 0, -100, [0, '#ffffff', 1, ICE]), 1.5);
    // 머리
    this.head(ctx, t, P, lv);
    // 앞머리 흐름
    this.hair(ctx, t, false);
    // 앞팔
    this.arm(ctx, 1, P.la, P.le, t, P.cast);
    // 동결(사망) 덮개
    if (frozen > 0 && !fl) {
      ctx.globalAlpha *= frozen * 0.8;
      ctx.beginPath(); ctx.moveTo(-44, 4); ctx.lineTo(-36, -80); ctx.lineTo(-20, -150); ctx.lineTo(18, -156); ctx.lineTo(40, -90); ctx.lineTo(46, 4); ctx.closePath();
      ctx.fillStyle = 'rgba(190,240,255,0.55)'; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const sx = lerp(-30, 30, hash(i)), sy = lerp(-140, -10, hash(i + 4)); ctx.moveTo(sx, sy); ctx.lineTo(sx + (hash(i + 2) - 0.5) * 40 * frozen, sy + 20 * frozen); }
      ctx.stroke();
    }
    ctx.restore();
  }
  head(ctx, t, P, lv) {
    const fl = R.fl;
    ctx.save(); ctx.translate(2, -122);
    // 목
    ctx.fillStyle = C(SKIN_D); ctx.fillRect(-3, 4, 6, 10);
    // 얼굴
    ctx.beginPath();
    ctx.moveTo(-8, -6); ctx.quadraticCurveTo(-8, -15, 1, -15); ctx.quadraticCurveTo(10, -14, 10, -4); ctx.quadraticCurveTo(10, 4, 7, 8); ctx.quadraticCurveTo(3, 12, -1, 11); ctx.quadraticCurveTo(-7, 8, -8, -6);
    ink(ctx, fl ? '#fff' : LG(ctx, 'fq_face', -8, 0, 10, 0, [0, SKIN_D, 0.5, SKIN, 1, '#f4fbff']), 1.8);
    if (!fl) {
      // 눈 (빛나는 얼음빛)
      eye(ctx, 5, -4, 1.6, lv ? '#ffffff' : ICE, 1);
      ctx.strokeStyle = '#1a2a4a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, -7); ctx.quadraticCurveTo(6, -8.5, 9, -6.5); ctx.stroke();
      ctx.fillStyle = '#2a3a78'; ctx.beginPath(); ctx.ellipse(6, 5, 2.4, 1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(4, -10, 4, 2, -0.3, 0, TAU); ctx.fill();
    }
    // 고드름 왕관
    const cr = lv ? 1.25 : 1;
    const spikes = [[-9, 10], [-5, 16], [0, 26 * cr], [5, 18], [9, 11]];
    for (const [sx, h] of spikes) {
      ctx.beginPath(); ctx.moveTo(sx - 3, -13); ctx.lineTo(sx, -13 - h); ctx.lineTo(sx + 3, -13); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'fq_cr' + h, 0, -13 - h, 0, -13, [0, '#ffffff', 0.6, ICE, 1, '#4a8ac8']), 1.2);
    }
    if (!fl) { glow(ctx, 0, -28, 26 * cr, ICE, 0.55); glow(ctx, 0, -36 * cr, 6, '#ffffff', 0.9, true); }
    ctx.fillStyle = C('#dff6ff'); ctx.fillRect(-10, -15, 21, 3);
    ctx.restore();
  }
  hair(ctx, t, back) {
    const fl = R.fl;
    ctx.save(); ctx.translate(2, -128);
    if (back) {
      // 등 뒤로 흘러내리는 긴 머리
      for (let i = 0; i < 4; i++) {
        const w = Math.sin(t * 2 + i) * 6;
        ctx.beginPath();
        ctx.moveTo(-6 + i * 2, -6);
        ctx.bezierCurveTo(-24 - i * 3, 10 + w, -22 - i * 4, 50, -30 - i * 5 + w, 78 + i * 6);
        ctx.quadraticCurveTo(-18 - i * 3, 60, -8 + i, 0);
        ctx.closePath();
        ink(ctx, fl ? '#fff' : LG(ctx, 'fq_hair' + i, 0, -6, 0, 80, [0, HAIR, 0.6, '#c8daf0', 1, 'rgba(140,170,210,0.6)']), 1.2);
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(-9, -8); ctx.quadraticCurveTo(-2, -18, 9, -10); ctx.quadraticCurveTo(2, -12, -4, -6); ctx.quadraticCurveTo(-10, 6, -12, 20 + Math.sin(t * 2) * 3); ctx.quadraticCurveTo(-14, 4, -9, -8);
      ink(ctx, fl ? '#fff' : LG(ctx, 'fq_hairF', 0, -18, 0, 20, [0, '#ffffff', 1, HAIR_D]), 1.2);
      if (!fl) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, -12); ctx.quadraticCurveTo(0, -15, 6, -12); ctx.stroke(); }
    }
    ctx.restore();
  }
  /** 팔: side +1 앞 / -1 뒤, a 어깨각(0=아래,+앞), e 팔꿈치 */
  arm(ctx, side, a, e, t, cast) {
    const fl = R.fl;
    const sx = side > 0 ? 9 : -7, sy = -100;
    const L1 = 20, L2 = 19;
    const ex = sx + Math.sin(a) * L1, ey = sy + Math.cos(a) * L1;
    const ha = a + e;
    const hx = ex + Math.sin(ha) * L2, hy = ey + Math.cos(ha) * L2;
    const col = side > 0 ? SKIN : SKIN_D;
    ctx.lineCap = 'round';
    // 팔 (가느다란 창백한 팔)
    ctx.strokeStyle = C(OUT); ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = C(col); ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    // 늘어진 소매 (종 모양 얼음 레이스)
    const sw = Math.sin(t * 2.4 + side) * 4;
    ctx.beginPath();
    ctx.moveTo(ex - Math.cos(a) * 4, ey + Math.sin(a) * 4);
    ctx.quadraticCurveTo(ex + Math.sin(ha) * 8 - 10 + sw, ey + 26, ex - 14 + sw, ey + 38);
    ctx.quadraticCurveTo(ex - 4, ey + 28, ex + Math.sin(ha) * 12, ey + Math.cos(ha) * 12);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'fq_slv' + side, 0, ey - 4, 0, ey + 38, [0, side > 0 ? 'rgba(220,245,255,0.95)' : 'rgba(150,200,235,0.9)', 1, 'rgba(90,150,210,0.4)']), 1.2);
    // 손 + 시전 빛
    ctx.fillStyle = C(col); ctx.beginPath(); ctx.arc(hx, hy, 3, 0, TAU); ctx.fill();
    if (!fl && (cast > 0.05 || side > 0)) {
      glow(ctx, hx, hy, 12 + cast * 30, ICE, 0.35 + cast * 0.6);
      if (cast > 0.3) { ctx.save(); ctx.translate(hx, hy); ctx.rotate(t * 3); ctx.strokeStyle = rgba(ICE_L, cast); ctx.lineWidth = 1.2; ctx.beginPath(); for (let i = 0; i < 6; i++) { const aa = i / 6 * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(aa) * 12 * cast, Math.sin(aa) * 12 * cast); } ctx.stroke(); ctx.restore(); }
    }
  }
}

// ───────────── 도형 ─────────────
function glint(ctx, x, y, s, a) {
  if (a <= 0.02) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.25); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.25); ctx.closePath(); ctx.fill();
  ctx.restore();
}
/** 고드름 (원점=뿌리, 아래로 len) */
function drawIcicle(ctx, len, t) {
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-4, len * 0.55); ctx.lineTo(0, len); ctx.lineTo(4, len * 0.6); ctx.lineTo(9, 0); ctx.closePath();
  ctx.fillStyle = 'rgba(190,240,255,0.9)'; ctx.fill();
  ctx.strokeStyle = 'rgba(20,50,90,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(-1, len * 0.7); ctx.lineTo(-1, 2); ctx.closePath(); ctx.fill();
}
/** 얼음 결정 기둥 (원점=바닥, 위로 H) */
function drawCrystal(ctx, w, H, seed) {
  if (H < 2) return;
  const off = (seed - 0.5) * 8;
  ctx.beginPath();
  ctx.moveTo(-w * 0.55, 0); ctx.lineTo(-w * 0.5 + off * 0.3, -H * 0.72); ctx.lineTo(off, -H); ctx.lineTo(w * 0.5 + off * 0.3, -H * 0.7); ctx.lineTo(w * 0.55, 0); ctx.closePath();
  const g = ctx.createLinearGradient(-w * 0.5, 0, w * 0.5, 0);
  g.addColorStop(0, 'rgba(120,190,240,0.92)'); g.addColorStop(0.45, 'rgba(235,252,255,0.96)'); g.addColorStop(0.55, 'rgba(170,225,250,0.95)'); g.addColorStop(1, 'rgba(60,120,190,0.92)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(16,40,80,0.9)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(off * 0.5, -H * 0.95); ctx.lineTo(0, -H * 0.1); ctx.stroke();
  // 곁가지 결정
  ctx.save(); ctx.translate(-w * 0.45, -H * 0.3); ctx.rotate(-0.5);
  ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, -H * 0.3); ctx.lineTo(5, 0); ctx.closePath(); ctx.fillStyle = 'rgba(200,240,255,0.9)'; ctx.fill(); ctx.stroke();
  ctx.restore();
  glowE(ctx, 0, -H * 0.5, w * 1.2, H * 0.6, '#9fe8ff', 0.35);
}
function shardRender(ctx, p) {
  const a = Math.atan2(p.vy, p.vx);
  ctx.rotate(a);
  glowE(ctx, -6, 0, 22, 10, ICE, 0.6);
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-4, -5); ctx.lineTo(-12, 0); ctx.lineTo(-4, 5); ctx.closePath();
  ctx.fillStyle = 'rgba(210,245,255,0.95)'; ctx.fill(); ctx.strokeStyle = 'rgba(20,60,110,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
}
function diamondRender(ctx, p) {
  ctx.rotate(p.t * 6);
  glow(ctx, 0, 0, 18, ICE, 0.7);
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 0); ctx.lineTo(0, 8); ctx.lineTo(-6, 0); ctx.closePath();
  ctx.fillStyle = '#f0fcff'; ctx.fill(); ctx.strokeStyle = '#3a7ac0'; ctx.lineWidth = 1.2; ctx.stroke();
}
