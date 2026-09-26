// 11장 보스: 사신 데스 — 거대한 낫을 든 해골 사신. 50%에서 망토가 불타고 거대한 해골 형태로 변한다.
// 1형태: 부메랑 낫 던지기 · 회전 낫 소환 · 순간이동 베기 · 영혼 흡수장 · 저공 돌진 베기
// 2형태: + 낫 폭풍(나선 탄막) · 뼈 창 연쇄 · 쌍낫 교차 투척 / 3페이즈: 저승의 문(거대 유령 낫 휩쓸기)
import { BossB, PI, OUT, R, C, LG, RG, ink, glow, glowE, eye, warnRect, warnFloor, warnLine, warnBang, lineStrike, circleStrike, impact, hash } from './b_common.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, ease, rgba, mix } from '../../core/math.js';

const SOUL = '#7dffb0', SOUL_D = '#1f8a5a', SOUL_L = '#d8ffe8';
const BONE = '#e6dcc2', BONE_D = '#8a7e66', BONE_DD = '#3a3226';
const CLOAK = '#0e0a14', CLOAK_M = '#241c30', CLOAK_L = '#4a3e5a';
const STEEL = '#c8ccd8';

export class Death extends BossB {
  setup() {
    this.facing = -1;
    this.form = 1;               // 1 = 망토, 2 = 거대 해골
    this.scale = 1;
    this.hasScythe = true;
    this.arm = { a: 0.6, s: 0 }; // 낫 자세: a 각도, s 휘두름
    this.armT = { a: 0.6 };
    this.vanish = 0;
    this.burn = 0;               // 변신 중 망토 연소
    this.homeY = this.A.floor - 40;
    this.y = this.homeY - this.h;
    this.dim = 0;                // 화면 어둡게 (저승의 문)
    this.souls = [];             // 궤도 영혼 장식
    for (let i = 0; i < 6; i++) this.souls.push({ a: i / 6 * TAU, r: rand(50, 80), s: rand(0.8, 1.4) });
  }
  setState(s) { super.setState(s); this.slashFx = null; this.dim = Math.max(0, this.dim); }
  onHurt(dmg, attack, world, info) { world.fx.burst('soul', info?.hx ?? this.cx, info?.hy ?? this.cy, 5, { speed: 160 }); }
  onReset() { this.form = 1; this.scale = 1; this.burn = 0; this.vanish = 0; this.dim = 0; this.hasScythe = true; }
  skipTransition() { this.form = this.phase >= 2 ? 2 : 1; this.scale = this.form === 2 ? 1.3 : 1; this.burn = 0; }
  get S() { return this.scale; }
  tickB(dt, world) {
    this.arm.a += (this.armT.a - this.arm.a) * (1 - Math.exp(-12 * dt));
    this.arm.s = Math.max(0, this.arm.s - dt * 3);
    for (const s of this.souls) s.a += dt * s.s;
    if (this.vanish < 0.5 && Math.random() < 0.35) world.fx.emit('soul', this.cx + rand(-30, 30) * this.S, this.bottom - rand(0, 20), { speed: 30, vy: -40, size: rand(2, 3.5) });
    if (this.state !== 'reap') this.dim = Math.max(0, this.dim - dt * 1.5);
  }
  glide(dt, tx, ty, rate = 3) {
    const k = 1 - Math.exp(-rate * dt);
    const x = this.cx + (tx - this.cx) * k, y = this.bottom + (ty - this.bottom) * k;
    this.x = x - this.w / 2; this.y = y - this.h;
  }
  place(x, y) { this.x = x - this.w / 2; this.y = y - this.h; }
  get bob() { return Math.sin(this.t * 1.7) * 7; }
  hitParts() {
    if (this.vanish > 0.5) return [];
    const S = this.S;
    return [{ x: this.cx - 26 * S, y: this.bottom - 140 * S, w: 52 * S, h: 118 * S }];
  }
  contactParts() {
    if (this.vanish > 0.3) return [];
    const S = this.S;
    return [{ x: this.cx - 20 * S, y: this.bottom - 130 * S, w: 40 * S, h: 100 * S }];
  }
  handPos() {
    const S = this.S, f = this.facing;
    return { x: this.cx + f * 26 * S, y: this.bottom - 84 * S };
  }
  viewX(margin = 140) {
    const cam = this.world.camera, A = this.A;
    return [Math.max(A.x0 + margin, cam ? cam.x + margin : A.x0 + margin), Math.min(A.x1 - margin, cam ? cam.x + cam.vw - margin : A.x1 - margin)];
  }

  // ───────────── 상태 ─────────────
  s_intro(dt, world, t) {
    const [v0, v1] = this.viewX(170);
    if (this.at(0.001)) { this.place(clamp(this.cx, v0, v1), this.homeY); this.vanish = 1; }
    this.facePlayer();
    this.vanish = clamp(1 - (t - 0.2) / 0.9, 0, 1);
    if (this.every(0.05, 0, 1.1)) { const a = rand(0, TAU), r = rand(80, 160); world.fx.emit('soul', this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, { vx: -Math.cos(a) * r * 1.6, vy: -Math.sin(a) * r * 1.6, speed: 0, grav: 0, life: 0.6 }); }
    if (this.at(1.0)) { audio.sfx('ghost', { pitch: 0.5 }); audio.sfx('slash_heavy', { pitch: 0.6 }); this.arm.s = 1; world.fx.ring(this.cx, this.cy, { color: SOUL, r0: 10, r1: 180, life: 0.5, width: 5 }); }
    this.armT.a = t > 1 ? -0.4 : 0.6;
    if (t > 1.6) this.setState('idle');
  }
  s_idle(dt, world, t) {
    const p = this.P;
    this.facePlayer();
    this.armT.a = 0.6 + Math.sin(this.t * 1.5) * 0.08;
    const [v0, v1] = this.viewX(150);
    const want = p ? clamp(p.cx - this.facing * 260, v0, v1) : this.cx;
    this.glide(dt, want, this.homeY - (this.form === 2 ? 20 : 0) + this.bob, 1.2);
    if (t < (this.rest ?? this.restTime(0.9))) return;
    this.rest = this.restTime(rand(0.6, 1.1));
    if (!this.hasScythe) return;
    const f2 = this.form === 2, ph = this.phase;
    const a = this.choose([
      ['throw', 3], ['sickles', 2.6], ['blink', 3], ['drain', 1.8], ['dash', 2.2],
      ['storm', f2 ? 2.4 : 0], ['spears', f2 ? 2.6 : 0], ['cross', f2 ? 2.2 : 0], ['reap', ph >= 3 ? 2.5 : 0],
    ]);
    this.setState(a);
  }

  // 1) 부메랑 낫 던지기
  s_throw(dt, world, t) {
    const p = this.P;
    this.facePlayer();
    this.glide(dt, this.cx, this.homeY + this.bob, 2);
    if (t < 0.5) { this.armT.a = -1.4; if (this.at(0.05)) { audio.sfx('charge_ready', { vol: 0.4, pitch: 0.6 }); this.telegraphFor(0.45); } }   // [hook:feel] 투척 윈드업
    if (this.at(0.5)) {
      this.armT.a = 1.3; this.arm.s = 1; this.hasScythe = false;
      audio.sfx('slash_heavy', { pitch: 0.7 });
      const arc = this.phase >= 1 ? (Math.random() < 0.5 ? -1 : 1) : 0;
      this.throwScythe(world, this.handPos(), this.facing, arc, 1);
    }
    if (t > 0.5 && this.hasScythe) { this.armT.a = 0.6; if (t > 0.9) this.setState('idle'); }
    if (t > 4.5) { this.hasScythe = true; this.setState('idle'); }
  }
  /** 날아가는 낫: arc 0 = 수평, ±1 = 위/아래로 휘는 궤적. returns: 돌아오면 hasScythe 복구 */
  throwScythe(world, from, d, arc, returns = 1, speed = 820, scale = 1) {
    const st = { x: from.x, y: from.y, t: 0, back: false };
    const R0 = 46 * scale;
    this.zone({
      x: st.x - R0, y: st.y - R0, w: R0 * 2, h: R0 * 2, life: 4, mv: 1.1, kb: [380 * d, -420], rehit: 0.5, z: 7,
      tick: (z, w, dt) => {
        st.t += dt;
        const T = 0.75;
        if (!st.back) {
          const u = Math.min(1, st.t / T);
          const sp = speed * (1 - u) + 60;
          st.x += d * sp * dt;
          st.y += arc * Math.sin(u * PI) * 380 * dt;
          if (st.t >= T) st.back = true;
        } else {
          const tx = returns ? this.handPos().x : st.x + d * 400, ty = returns ? this.handPos().y : st.y;
          const a = Math.atan2(ty - st.y, tx - st.x);
          const sp = Math.min(1100, 300 + (st.t - T) * 1400);
          st.x += Math.cos(a) * sp * dt; st.y += Math.sin(a) * sp * dt;
          if (returns && Math.hypot(tx - st.x, ty - st.y) < 30) { z.dur = z.t - z.warn; this.hasScythe = true; this.arm.s = 0.6; audio.sfx('clang', { vol: 0.4, pitch: 0.7 }); }
        }
        z.x = st.x - R0; z.y = st.y - R0;
        z.attack.dir = Math.sign(w.player ? w.player.cx - st.x : d) || d;
        if (Math.random() < 0.5) w.fx.emit('soul', st.x + rand(-20, 20), st.y + rand(-20, 20), { speed: 40, size: 2.5 });
        if (this.every(0.25)) audio.sfx('whip', { vol: 0.35, pitch: 0.6 });
      },
      onEnd: () => { if (returns) this.hasScythe = true; },
      paint: (ctx, z) => {
        ctx.translate(st.x, st.y); ctx.rotate(-d * z.t * 14);
        glow(ctx, 0, 0, 80 * scale, SOUL, 0.35);
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(SOUL, 0.35); ctx.lineWidth = 16 * scale;
        ctx.beginPath(); ctx.arc(0, 0, 52 * scale, 0, TAU * 0.7); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.scale(scale, scale);
        drawScythe(ctx, 0.62, true);
      },
      light: () => {},
    });
  }

  // 2) 회전 낫 소환 (원형 배치 → 순차 유도 발사)
  s_sickles(dt, world, t) {
    this.facePlayer();
    this.armT.a = -1.2;
    this.glide(dt, this.cx, this.homeY - 30 + this.bob, 2);
    const n = (this.form === 2 ? 8 : 5) + (this.inferno ? 2 : 0);
    if (this.at(0.1)) { audio.sfx('dark', { pitch: 1.2 }); this.sickleSet = []; this.telegraphFor(0.8); }   // [hook:feel] 발사 전 윈드업
    for (let i = 0; i < n; i++) {
      if (this.at(0.15 + i * 0.07)) {
        const a = -PI / 2 + (i - (n - 1) / 2) * (PI * 1.3 / n);
        const s = { a, r: 90 * this.S, born: this.st, fired: false };
        this.sickleSet.push(s);
        world.fx.burst('soul', this.cx + Math.cos(a) * s.r, this.cy + Math.sin(a) * s.r, 6, { speed: 80 });
      }
    }
    // 대기 중 원형 궤도 표시 → 발사
    for (let i = 0; i < (this.sickleSet?.length ?? 0); i++) {
      const s = this.sickleSet[i];
      if (!s.fired && t > 0.9 + i * 0.14) {
        s.fired = true;
        const x = this.cx + Math.cos(s.a) * s.r, y = this.cy + Math.sin(s.a) * s.r;
        const p = this.P, aa = p ? Math.atan2(p.cy - y, p.cx - x) : s.a;
        this.shoot({ x, y, vx: Math.cos(aa) * 330, vy: Math.sin(aa) * 330, w: 26, h: 26, life: 3.2, behavior: 'homing', homingTurn: this.phase >= 2 ? 2.4 : 1.7, homingDelay: 0.05, render: sickleRender, spin: 16, attack: { mv: 0.75, kb: [240, -300] }, light: { r: 60, color: SOUL, i: 0.5 } });
        audio.sfx('whip', { vol: 0.4, pitch: 1.5 });
      }
    }
    if (t > 1.2 + n * 0.14) this.setState('idle');
  }
  paintSickleRing(ctx) {
    if (this.state !== 'sickles' || !this.sickleSet) return;
    for (const s of this.sickleSet) {
      if (s.fired) continue;
      const x = this.cx + Math.cos(s.a) * s.r, y = this.cy + Math.sin(s.a) * s.r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.t * 16);
      const k = Math.min(1, (this.st - s.born) * 5);
      ctx.scale(k, k);
      sickleRender(ctx, { rot: 0 });
      ctx.restore();
    }
  }

  // 3) 순간이동 베기 (플레이어 등 뒤에 나타나 크게 벤다)
  s_blink(dt, world, t) {
    const p = this.P, F = this.A.floor;
    const n = this.phase >= 2 ? 3 : this.phase >= 1 ? 2 : 1;
    const per = 1.25;
    const i = Math.floor(t / per), lt = t - i * per;
    if (i >= n) { this.vanish = 0; this.invuln = false; this.setState('idle'); return; }
    if (lt < 0.25) {
      this.vanish = Math.min(1, lt / 0.2); this.invuln = this.vanish > 0.6;
      if (lt < dt * 1.5) { audio.sfx('ghost', { pitch: 0.8 }); world.fx.burst('dark', this.cx, this.cy, 14, { speed: 120 }); world.fx.burst('soul', this.cx, this.cy, 10, { speed: 160 }); }
    } else if (lt < 0.62) {
      this.vanish = 1; this.invuln = true;
      if (!this.blinkTo || this.blinkI !== i) {
        this.blinkI = i;
        const [v0, v1] = this.viewX(60);
        const side = p ? (p.facing > 0 ? -1 : 1) : 1;                  // 등 뒤
        let x = p ? p.cx + side * 118 : this.cx;
        if (x < v0 || x > v1) x = p ? p.cx - side * 118 : this.cx;
        this.blinkTo = { x: clamp(x, this.A.x0 + 60, this.A.x1 - 60), y: F - 8 };
      }
      if (this.every(0.05, i * per + 0.25, i * per + 0.62)) world.fx.emit('soul', this.blinkTo.x + rand(-20, 20), this.blinkTo.y - rand(20, 120), { speed: 50, size: 3 });
    } else {
      if (this.vanish > 0.9 && this.blinkTo) {
        this.place(this.blinkTo.x, this.blinkTo.y);
        this.facePlayer();
        this.armT.a = -1.5; this.arm.a = -1.5;
        this.telegraphFor(0.16);   // [hook:feel] 등 뒤 출현 → 베기 윈드업
      }
      this.vanish = Math.max(0, this.vanish - dt * 8); this.invuln = this.vanish > 0.6;
      if (lt > 0.78 && lt < 0.78 + dt * 1.5) {
        this.armT.a = 1.6; this.arm.s = 1;
        const d = this.facing, S = this.S;
        audio.sfx('slash_heavy', { pitch: 0.55 }); impact(world, { shake: 6, time: 0.2 });
        this.zone({ x: d > 0 ? this.cx - 20 : this.cx - 200 * S, y: this.bottom - 160 * S, w: 220 * S, h: 160 * S, life: 0.16, mv: 1.35, kb: [420 * d, -460] });
        this.slashFx = { x: this.cx, y: this.bottom - 80 * S, d, t: 0 };
        world.fx.slash(this.cx + d * 60 * S, this.bottom - 80 * S, d > 0 ? 0.2 : PI - 0.2, { len: 170 * S, width: 26, color: SOUL, life: 0.22, arc: 2.2, dir: d });
      }
      if (lt > 1.0) this.blinkTo = null;
    }
  }

  // 4) 영혼 흡수장: 플레이어를 끌어당기는 소용돌이
  s_drain(dt, world, t) {
    const p = this.P, F = this.A.floor;
    this.facePlayer();
    this.armT.a = -2.2;
    this.glide(dt, this.cx, this.homeY - 60 + this.bob, 2);
    const dur = this.phase >= 2 ? 3.6 : 3.0;
    if (this.at(0.1)) {
      audio.sfx('dark', { pitch: 0.6 }); world.game.toast('영혼이 빨려 들어간다…', SOUL);
      const cx = clamp(p ? p.cx + (p.cx > this.cx ? 60 : -60) : this.cx, this.A.x0 + 120, this.A.x1 - 120);
      const st = { x: cx };
      this.zone({
        x: cx - 190, y: F - 200, w: 380, h: 200, warn: 0.6, life: dur, mv: 0.6, element: 'dark', kb: [100, -260], rehit: 0.8, z: 2,
        circle: { x: cx, y: F - 30, r: 46 },
        tick: (z, w, dt2) => {
          const pl = w.player;
          if (z.on && pl && !pl.dead) {
            const dx = cx - pl.cx, ad = Math.abs(dx);
            if (ad < 190 && ad > 8) {
              const pull = (this.phase >= 2 ? 170 : 135) * (1 - ad / 260);
              pl.x += Math.sign(dx) * pull * dt2;
            }
          }
          if (z.on && Math.random() < 0.7) {
            const a = rand(0, TAU), r = rand(80, 190);
            w.fx.emit('soul', cx + Math.cos(a) * r, F - 20 + Math.sin(a) * r * 0.25, { vx: -Math.cos(a) * r * 1.4, vy: -Math.sin(a) * 20 - 40, speed: 0, grav: 0, life: 0.6, size: 2.5 });
          }
          if (z.on && Math.random() < 0.3) w.fx.emit('soul', cx + rand(-20, 20), F - 30, { vx: (this.cx - cx) * 1.2, vy: (this.cy - F) * 1.2, speed: 0, grav: 0, life: 0.8, size: 3 });
        },
        paint: (ctx, z) => this.paintVortex(ctx, cx, F, z),
        light: (L, z) => { if (z.on) L.add(cx, F - 40, 220, SOUL, 0.7); },
      });
    }
    if (t > dur + 0.8) this.setState('idle');
  }
  paintVortex(ctx, cx, F, z) {
    const t = this.t;
    if (z.t < z.warn) { warnFloor(ctx, cx, F, 300, z.k, SOUL, t); return; }
    const fade = Math.min(1, z.a * 6, (1 - z.a) * 6);
    ctx.globalAlpha *= fade;
    ctx.save();
    ctx.translate(cx, F - 14); ctx.scale(1, 0.26);
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 190);
    g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.35, 'rgba(20,60,40,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 190, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = rgba(SOUL, 0.5 - i * 0.1); ctx.lineWidth = 6 - i;
      ctx.beginPath(); ctx.arc(0, 0, 40 + i * 40, t * (3 - i * 0.4) + i, t * (3 - i * 0.4) + i + PI * 1.2); ctx.stroke();
    }
    ctx.restore();
    glowE(ctx, cx, F - 30, 50, 70, SOUL, 0.6);
    glow(ctx, cx, F - 30, 22, SOUL_L, 0.8, true);
  }

  // 5) 저공 돌진 베기 (점프로 회피)
  s_dash(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    const n = this.form === 2 ? 2 : 1;
    const per = 1.6;
    const i = Math.floor(t / per), lt = t - i * per;
    if (i >= n) { this.setState('idle'); return; }
    const [v0, v1] = this.viewX(90);
    if (lt < dt * 1.5 || this.dashI !== i) {
      this.dashI = i;
      const side = p && p.cx < (v0 + v1) / 2 ? 1 : -1;
      this.dashFrom = side > 0 ? v1 : v0; this.dashTo = side > 0 ? v0 : v1;
      this.dashTo = clamp(this.dashTo - side * 20, A.x0 + 60, A.x1 - 60);
    }
    const d = Math.sign(this.dashTo - this.dashFrom) || -1;
    if (lt < 0.7) {
      this.facing = d;
      this.glide(dt, this.dashFrom, F - 6, 7);
      this.armT.a = 2.1;
      this.dashWarn = { x0: Math.min(this.dashFrom, this.dashTo) - 40, x1: Math.max(this.dashFrom, this.dashTo) + 40, k: lt / 0.7 };
      if (lt < dt * 1.5) { audio.sfx('warning', { vol: 0.35, pitch: 1.4 }); this.telegraphFor(0.7); }   // [hook:feel] 돌진 윈드업
    } else if (lt < 1.2) {
      this.dashWarn = null;
      const u = ease.inOutQuad((lt - 0.7) / 0.5);
      this.place(lerp(this.dashFrom, this.dashTo, u), F - 6);
      this.armT.a = 2.2;
      if (lt < 0.7 + dt * 1.5) {
        audio.sfx('dash', { pitch: 0.6 }); audio.sfx('slash_heavy', { pitch: 0.8 });
        const hb = { x: 0, y: F - 58, w: 150, h: 58 };
        this.zone({ x: 0, y: 0, w: 1, h: 1, life: 0.5, mv: 1.25, kb: [360 * d, -520], rects: () => { hb.x = this.cx - 75 + d * 40; return [hb]; } });
      }
      if (Math.random() < 0.8) world.fx.emit('spark', this.cx + d * 70, F - 4, { color: SOUL, speed: 260, angle: PI + (d > 0 ? 0 : PI) - 0.4 * d, spread: 0.4 });
      const S = this.S, gx = this.cx, gy = this.bottom, f = this.facing, arm = { ...this.arm }, tt = this.t, form = this.form;
      if (this.every(0.05)) world.fx.ghost((ctx, a) => { ctx.save(); ctx.globalAlpha = a * 0.4; this.paintReaper(ctx, gx, gy, f, tt, arm, form, S, true); ctx.restore(); }, 0.25);
    } else { this.armT.a = 0.6; }
  }

  // 6) (2형태) 낫 폭풍: 궤도 낫이 나선으로 퍼짐
  s_storm(dt, world, t) {
    this.facePlayer();
    this.armT.a = -2.4;
    this.glide(dt, clamp(this.cx, ...this.viewX(200)), this.homeY - 110 + this.bob, 2);
    const dur = 3.0;
    if (this.at(0.1)) { audio.sfx('dark', { pitch: 0.9 }); impact(world, { shake: 5, time: 0.4 }); this.telegraphFor(0.4); }   // [hook:feel] 낫 폭풍 윈드업
    if (this.every(this.inferno ? 0.16 : 0.2, 0.5, dur)) {
      const k = 3;
      for (let i = 0; i < k; i++) {
        const a = this.st * 2.2 + i / k * TAU;
        this.shoot({ x: this.cx + Math.cos(a) * 40, y: this.cy + Math.sin(a) * 40, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, w: 22, h: 22, life: 3.5, render: sickleRender, spin: 14, attack: { mv: 0.6 }, collideWalls: true });
      }
    }
    if (this.every(0.5, 0.5, dur)) audio.sfx('whip', { vol: 0.3, pitch: 1.3 });
    if (t > dur + 0.4) this.setState('idle');
  }
  // 7) (2형태) 뼈 창 연쇄
  s_spears(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    this.facePlayer();
    this.armT.a = 1.9;
    this.glide(dt, this.cx, this.homeY - 20 + this.bob, 2);
    if (this.at(0.3)) {
      audio.sfx('boss_roar', { vol: 0.5, pitch: 1.3 }); impact(world, { shake: 6, time: 0.3 });
      const px = p ? p.cx : A.cx;
      // 두 줄: 플레이어 쪽으로 몰려오는 연쇄 + 되돌아오는 연쇄 (틈새 교차)
      for (const [dir, off, delay] of [[1, 0, 0], [-1, 36, 0.9]]) {
        const start = dir > 0 ? A.x0 + 30 : A.x1 - 30;
        for (let k = 0; k < 20; k++) {
          const x = start + dir * (k * 72 + off);
          if (x < A.x0 + 10 || x > A.x1 - 10) break;
          this.boneSpear(x, 0.5 + delay + Math.abs(x - start) / 900);
        }
      }
    }
    if (t > 3.2) this.setState('idle');
  }
  boneSpear(x, warn) {
    const F = this.A.floor, H = 130;
    this.zone({
      x: x - 16, y: F - H, w: 32, h: H, warn, life: 0.45, mv: 1, kb: [200, -600], z: 5,
      onStart: (z, w) => { w.fx.burst('shard', x, F - 6, 4, { color: BONE, size: 3 }); audio.sfx('break_wall', { vol: 0.25, pitch: rand(1.6, 2) }); },
      paint: (ctx, z) => {
        if (z.t < z.warn) { warnFloor(ctx, x, F, 44, z.k, SOUL, this.t); return; }
        const g = ease.outBack(Math.min(1, z.a * 6)), fade = z.a > 0.75 ? (1 - z.a) * 4 : 1;
        ctx.globalAlpha *= fade;
        ctx.translate(x, F);
        drawBoneSpike(ctx, H * g);
      },
    });
  }
  // 8) (2형태) 쌍낫 교차 투척
  s_cross(dt, world, t) {
    this.facePlayer();
    this.glide(dt, this.cx, this.homeY + this.bob, 2);
    this.armT.a = t < 0.55 ? -1.6 : 1.4;
    if (this.at(0.001)) this.telegraphFor(0.55);   // [hook:feel] 쌍낫 투척 윈드업
    if (this.at(0.55)) {
      this.hasScythe = false; this.arm.s = 1;
      audio.sfx('slash_heavy', { pitch: 0.6 });
      const h = this.handPos();
      this.throwScythe(world, h, this.facing, -1, 1, 860);
      this.throwScythe(world, h, this.facing, 1, 0, 700, 0.8);
    }
    if (t > 0.55 && this.hasScythe && t > 1.2) this.setState('idle');
    if (t > 4.5) { this.hasScythe = true; this.setState('idle'); }
  }
  // 9) (3페이즈) 저승의 문: 거대한 유령 낫이 경기장을 두 번 휩쓴다 (하단 → 점프 / 상단 → 땅에 붙기)
  s_reap(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    this.facePlayer();
    this.armT.a = -2.6;
    this.glide(dt, clamp(this.cx, ...this.viewX(200)), this.homeY - 140 + this.bob, 2);
    this.dim = Math.min(0.55, this.dim + dt);
    if (this.at(0.05)) { audio.sfx('bell', { pitch: 0.4 }); world.game.toast('저승의 문이 열린다…', SOUL); }
    const sweeps = [['low', 0.9], ['high', 2.7]];
    if (this.inferno) sweeps.push(['low', 4.3]);
    for (const [lane, t0] of sweeps) {
      if (this.at(t0 - 0.85)) {
        const d = p && p.cx > A.cx ? -1 : 1;
        this.reapWarn = { lane, d, k: 0, t0 };
        audio.sfx('warning', { vol: 0.5 });
        this.telegraphFor(0.85);   // [hook:feel] 휩쓸기 예고 동안 카운터 창
      }
      if (this.at(t0)) { this.bigReap(world, this.reapWarn?.d ?? 1, lane); this.reapWarn = null; }
    }
    if (this.reapWarn) this.reapWarn.k = clamp(1 - (this.reapWarn.t0 - t) / 0.85, 0, 1);
    const end = sweeps[sweeps.length - 1][1] + 1.3;
    if (t > end) { this.reapWarn = null; this.setState('idle'); }
  }
  bigReap(world, d, lane) {
    const A = this.A, F = A.floor;
    const y0 = lane === 'low' ? F - 62 : F - 175, h = lane === 'low' ? 62 : 100;
    const x0 = d > 0 ? A.x0 - 200 : A.x1 + 200;
    const st = { x: x0 };
    audio.sfx('slash_heavy', { pitch: 0.4 }); audio.sfx('ghost', { pitch: 0.4 });
    impact(world, { shake: 10, time: 0.6 });
    const hb = { x: 0, y: y0, w: 140, h };
    this.zone({
      x: 0, y: 0, w: 1, h: 1, life: (A.w + 400) / 1500, mv: 1.6, kb: [520 * d, -420], z: 8,
      rects: () => { hb.x = st.x - 70; return [hb]; },
      tick: (z, w, dt) => { st.x += d * 1500 * dt; if (Math.random() < 0.9) w.fx.emit('soul', st.x - d * rand(0, 200), y0 + rand(0, h), { speed: 40, size: 3 }); },
      paint: (ctx, z) => {
        ctx.save();
        ctx.translate(st.x, y0 + h / 2); ctx.scale(d, 1);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(-500, 0, 60, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(90,255,170,0.35)'); g.addColorStop(1, 'rgba(220,255,235,0.9)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(60, 0); ctx.quadraticCurveTo(-60, -h * 0.9, -500, -h * 0.4); ctx.quadraticCurveTo(-120, -h * 0.1, -500, h * 0.35); ctx.quadraticCurveTo(-60, h * 0.8, 60, 0); ctx.fill();
        glowE(ctx, 0, 0, 90, h * 0.9, SOUL, 0.6);
        ctx.restore();
      },
      light: () => {},
    });
  }

  // ───────────── 변신 (50%) ─────────────
  onPhase(n, world) {
    if (n === 2 && this.form === 1) { this.clearJobs(); this.setState('transform'); }
    else if (n === 1) world.game.toast('데스: "제법이구나… 허나 죽음은 피할 수 없다."', SOUL_L);
    else if (n >= 3) world.game.toast('데스: "저승의 문을 열겠다!"', SOUL_L);
  }
  s_transform(dt, world, t) {
    const dur = 2.6;
    this.invuln = true; this.harmless = true; this.hasScythe = true; this.vanish = 0;
    this.armT.a = -2.4;
    this.glide(dt, clamp(this.cx, ...this.viewX(200)), this.homeY - 60, 2);
    this.burn = clamp(t / 1.4, 0, 1);
    if (this.at(0.05)) { audio.sfx('boss_roar', { pitch: 0.6 }); world.game.toast('데스가 진정한 모습을 드러낸다!', SOUL); impact(world, { shake: 8, time: 1.4 }); }
    if (Math.random() < 0.8) world.fx.burst('soul', this.cx + rand(-40, 40), this.cy + rand(-60, 60), 2, { speed: 200 });
    if (Math.random() < 0.5) world.fx.emit('fire', this.cx + rand(-40, 40), this.cy + rand(-70, 50), { color: SOUL, color2: SOUL_L, speed: 80 });
    if (t > 1.4) this.scale = lerp(1, 1.3, ease.outBack(clamp((t - 1.4) / 0.6, 0, 1)));
    if (this.at(1.4)) {
      this.form = 2;
      world.game.flash(SOUL_L, 0.7, 3); impact(world, { shake: 16, time: 0.8 });
      world.fx.ring(this.cx, this.cy, { color: SOUL, r0: 20, r1: 360, life: 0.7, width: 12 });
      world.fx.burst('soul', this.cx, this.cy, 60, { speed: 420 });
      audio.sfx('thunderclap', { pitch: 0.6 }); audio.sfx('boss_roar', { pitch: 0.45 });
      this.lightning(0.8);
    }
    if (t > dur) { this.invuln = false; this.harmless = false; this.burn = 0; this.setState('idle'); }
  }

  // ───────────── 사망 ─────────────
  onDeath(world) {
    this.dying = 3.2; this.clearJobs(); this.vanish = 0; this.dim = 0;
    audio.sfx('ghost', { pitch: 0.4 });
    world.game.toast('데스: "나를 쓰러뜨려도… 백작은…"', SOUL_L);
  }
  dyingTick(dt, world) {
    const d = this.dying;
    this.armT.a = -2.6 + Math.sin(this.t * 20) * 0.2;
    this.x += Math.sin(this.t * 60) * 0.8;
    this.tickB(dt, world);
    if (Math.random() < 0.6) world.fx.burst('soul', this.cx + rand(-40, 40) * this.S, this.cy + rand(-70, 70) * this.S, 2, { speed: 180 });
    if (d < 1.0 && !this._boom) {
      this._boom = true;
      world.fx.burst('soul', this.cx, this.cy, 80, { speed: 460 });
      world.fx.ring(this.cx, this.cy, { color: SOUL, r0: 20, r1: 420, life: 0.8, width: 12 });
      world.fx.flash(this.cx, this.cy, { color: SOUL_L, size: 360, life: 0.35 });
      world.spawnBones?.(this); world.spawnBones?.(this);
      impact(world, { shake: 14, time: 0.6 });
      audio.sfx('break_wall', { pitch: 0.5 }); audio.sfx('ghost', { pitch: 0.3 });
      this.vanish = 1;
    }
  }

  // ───────────── 조명 ─────────────
  lightsB(L) {
    if (this.vanish > 0.8) return;
    const S = this.S;
    L.add(this.cx, this.bottom - 118 * S, 150 * S, SOUL, 0.8);
    L.add(this.cx, this.bottom - 40, 180 * S, SOUL, 0.45);
    if (this.form === 2) L.add(this.cx, this.bottom - 86 * S, 160, SOUL, 0.7);
  }

  // ───────────── 그리기 ─────────────
  paintBack(ctx) {
    const F = this.A.floor;
    if (this.dim > 0.01 && !R.fl) {
      const cam = this.world.camera;
      ctx.save(); ctx.fillStyle = `rgba(2,10,6,${this.dim})`; ctx.fillRect(cam.x - 20, cam.y - 20, cam.vw + 40, cam.vh + 40); ctx.restore();
    }
    if (this.dashWarn && this.state === 'dash') warnRect(ctx, this.dashWarn.x0, F - 58, this.dashWarn.x1 - this.dashWarn.x0, 58, this.dashWarn.k, SOUL, this.t);
    if (this.reapWarn) {
      const w = this.reapWarn, A = this.A;
      const y0 = w.lane === 'low' ? F - 62 : F - 175, h = w.lane === 'low' ? 62 : 100;
      warnRect(ctx, A.x0, y0, A.w, h, w.k, SOUL, this.t);
      const cam = this.world.camera;
      warnBang(ctx, w.d > 0 ? Math.max(A.x0, cam.x) + 50 : Math.min(A.x1, cam.x + cam.vw) - 50, y0 - 40, 22, 0.6 + 0.4 * Math.sin(this.t * 18));
    }
    // 순간이동 예고 잔상
    if (this.state === 'blink' && this.blinkTo && this.vanish > 0.9 && !R.fl) {
      const k = clamp((this.st % 1.25 - 0.25) / 0.37, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.18 + 0.3 * k;
      this.paintReaper(ctx, this.blinkTo.x, this.blinkTo.y, this.P && this.P.cx < this.blinkTo.x ? -1 : 1, this.t, { a: -1.5, s: 0 }, this.form, this.S, true);
      ctx.restore();
      glint4(ctx, this.blinkTo.x, this.blinkTo.y - 120 * this.S, 16 * k + 4, k);
    }
  }
  paintBody(ctx) {
    if (this.vanish >= 1) return;
    ctx.save();
    ctx.globalAlpha *= 1 - this.vanish;
    this.paintReaper(ctx, this.cx, this.bottom, this.facing, this.t, this.arm, this.form, this.S, false);
    ctx.restore();
  }
  paintFront(ctx) {
    if (R.fl) return;
    this.paintSickleRing(ctx);
  }
  /** 사신 그리기: (x,y) = 망토 밑단/발 아래 중심 */
  paintReaper(ctx, x, y, f, t, arm, form, S, ghost) {
    const fl = R.fl;
    ctx.save();
    ctx.translate(x, y); ctx.scale(f * S, S);
    if (!fl && !ghost) { glowE(ctx, 0, -10, 70, 20, SOUL, 0.35); }
    if (form === 1) this.drawCloaked(ctx, t, arm, ghost);
    else this.drawSkeletal(ctx, t, arm, ghost);
    ctx.restore();
  }
  drawCloaked(ctx, t, arm, ghost) {
    const fl = R.fl, burn = this.burn;
    // 뒤: 찢어진 망토 자락
    const w1 = Math.sin(t * 2.1) * 8, w2 = Math.sin(t * 1.6 + 1) * 10;
    ctx.beginPath();
    ctx.moveTo(-6, -128);
    ctx.bezierCurveTo(-34, -118, -44, -70, -52 + w2 * 0.5, -30);
    for (let i = 0; i < 7; i++) { const k = i / 6; ctx.lineTo(lerp(-52, 40, k) + Math.sin(t * 3 + i * 1.7) * 3, (i % 2 ? -14 : 4) + Math.sin(t * 4 + i) * 5 + w1 * (i % 3 === 0 ? 0.5 : 0)); }
    ctx.bezierCurveTo(38, -60, 30, -110, 12, -130);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dt_cloak', -50, 0, 40, 0, [0, mix(CLOAK_M, '#8a9ac8', 0.35), 0.12, CLOAK, 0.55, CLOAK_M, 0.85, CLOAK, 1, '#050308']), 3);
    if (!fl) {
      // 주름 + 초록 밑빛
      ctx.strokeStyle = 'rgba(90,80,120,0.45)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const bx = -26 + i * 16; ctx.moveTo(bx * 0.4, -110); ctx.quadraticCurveTo(bx + Math.sin(t * 2 + i) * 3, -60, bx * 1.2, -10); } ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.fillStyle = LG(ctx, 'dt_under', 0, -60, 0, 6, [0, 'rgba(0,0,0,0)', 1, 'rgba(60,255,160,0.28)']); ctx.fillRect(-60, -60, 110, 70);
      if (burn > 0) { ctx.fillStyle = rgba(SOUL, burn * 0.5); ctx.fillRect(-60, -140 * burn, 110, 150); }
      ctx.restore();
    }
    // 뒤팔 소매
    ctx.beginPath(); ctx.moveTo(-14, -112); ctx.quadraticCurveTo(-30, -90, -26, -66); ctx.lineTo(-12, -70); ctx.quadraticCurveTo(-14, -90, -4, -104); ctx.closePath();
    ink(ctx, C(CLOAK_M), 2);
    // 낫 (몸 앞/뒤: 들고 있을 때)
    if (this.hasScythe || ghost) this.drawHeldScythe(ctx, arm, t);
    // 두건 + 해골
    ctx.save(); ctx.translate(4, -124);
    ctx.beginPath();
    ctx.moveTo(-16, 10); ctx.bezierCurveTo(-20, -8, -12, -26, 4, -30); ctx.quadraticCurveTo(12, -28, 20, -18); ctx.quadraticCurveTo(24, -6, 20, 10); ctx.quadraticCurveTo(4, 16, -16, 10);
    ink(ctx, fl ? '#fff' : LG(ctx, 'dt_hood', -18, 0, 22, 0, [0, '#4a4060', 0.2, CLOAK, 0.7, CLOAK_M, 1, '#07050a']), 2.5);
    ctx.beginPath(); ctx.moveTo(-4, 8); ctx.quadraticCurveTo(-6, -12, 8, -18); ctx.quadraticCurveTo(20, -12, 18, 6); ctx.quadraticCurveTo(8, 12, -4, 8);
    ctx.fillStyle = C('#020103'); ctx.fill();
    drawSkull(ctx, 8, -4, 1, t, fl, this.jawOpen());
    ctx.restore();
    // 앞팔 (소매 + 뼈 손)
    const ha = arm.a;
    ctx.save(); ctx.translate(10, -108); ctx.rotate(-ha * 0.35);
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(0, 22, 18, 30); ctx.lineTo(24, 18); ctx.quadraticCurveTo(10, 10, 6, -4); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dt_slv', 0, -4, 0, 30, [0, CLOAK_M, 1, CLOAK]), 2);
    ctx.restore();
    // 발밑 영혼 불꽃
    if (!fl) for (let i = 0; i < 5; i++) { const k = (t * 1.2 + i * 0.2) % 1; glow(ctx, lerp(-40, 36, hash(i)), -k * 40, 10 * (1 - k), SOUL, 0.6 * (1 - k)); }
  }
  drawSkeletal(ctx, t, arm, ghost) {
    const fl = R.fl;
    // ── 뼈 날개 (좌우로 펼침, 찢어진 어둠의 막) ──
    for (const s of [-1, 1]) this.boneWing(ctx, s, t, fl);
    // ── 하반신: 어둠 + 영혼 불꽃 꼬리 ──
    const sw = Math.sin(t * 2.2) * 8;
    ctx.beginPath();
    ctx.moveTo(-22, -70); ctx.quadraticCurveTo(-30, -36, -14 + sw, -2);
    for (let i = 0; i < 5; i++) ctx.lineTo(-10 + i * 6 + Math.sin(t * 5 + i) * 3 + sw * (1 - i / 5), (i % 2 ? -10 : 4) + Math.sin(t * 4 + i) * 3);
    ctx.quadraticCurveTo(30, -36, 22, -70); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dt2_tail', 0, -70, 0, 4, [0, '#0c0812', 0.6, 'rgba(18,40,30,0.92)', 1, 'rgba(60,200,130,0.4)']), 2.5);
    if (!fl) for (let i = 0; i < 5; i++) { const k = (t * 1.3 + i * 0.2) % 1; glow(ctx, lerp(-16, 16, hash(i)) + sw * 0.5, -k * 50, 10 * (1 - k), SOUL, 0.7 * (1 - k)); }
    // ── 척추 + 골반 ──
    ctx.strokeStyle = C(OUT); ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -66); ctx.quadraticCurveTo(-5, -88, 0, -116); ctx.stroke();
    ctx.strokeStyle = C(BONE); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, -66); ctx.quadraticCurveTo(-5, -88, 0, -116); ctx.stroke();
    if (!fl) { ctx.fillStyle = BONE_D; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-2.5 + (i % 2), -70 - i * 6.5, 3, 0, TAU); ctx.fill(); } }
    ctx.beginPath(); ctx.moveTo(-18, -64); ctx.quadraticCurveTo(0, -78, 18, -64); ctx.quadraticCurveTo(12, -52, 0, -57); ctx.quadraticCurveTo(-12, -52, -18, -64);
    ink(ctx, fl ? '#fff' : LG(ctx, 'dt2_pel', 0, -78, 0, -52, [0, '#fffaf0', 1, BONE_D]), 2);
    // ── 갈비뼈 + 영혼 심장 ──
    if (!fl) { const pu = 0.7 + 0.3 * Math.sin(t * 6); glow(ctx, 2, -96, 30 * pu, SOUL, 0.8); glow(ctx, 2, -96, 8, SOUL_L, 1, true); }
    ctx.lineCap = 'round';
    for (const [col, lw] of [[OUT, 5], [BONE, 3]]) {
      ctx.strokeStyle = C(col); ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const y = -112 + i * 7.5, w = 21 - i * 1.8;
        ctx.moveTo(0, y); ctx.bezierCurveTo(-w, y - 3, -w - 3, y + 8, -w * 0.45, y + 12);
        ctx.moveTo(0, y); ctx.bezierCurveTo(w, y - 3, w + 3, y + 8, w * 0.45, y + 12);
      }
      ctx.stroke();
    }
    // ── 어깨 망토 조각 (타다 남은 어둠) ──
    ctx.beginPath(); ctx.moveTo(-30, -114); ctx.quadraticCurveTo(0, -130, 30, -114); ctx.lineTo(26, -96);
    for (let i = 0; i < 6; i++) ctx.lineTo(22 - i * 10, -98 + (i % 2) * 12 + Math.sin(t * 3 + i) * 2);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dt2_mant', -30, 0, 30, 0, [0, '#3a3050', 0.2, CLOAK, 0.8, CLOAK_M, 1, '#050308']), 2);
    if (!fl) { ctx.strokeStyle = rgba(SOUL, 0.75); ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 0; i < 6; i++) { ctx.moveTo(22 - i * 10, -98 + (i % 2) * 12); ctx.lineTo(22 - (i + 1) * 10, -98 + ((i + 1) % 2) * 12); } ctx.stroke(); }
    // 어깨 뼈 견갑 (가시)
    for (const s2 of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s2 * 16, -120); ctx.quadraticCurveTo(s2 * 30, -132, s2 * 36, -148); ctx.quadraticCurveTo(s2 * 26, -128, s2 * 28, -112); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'dt2_sp' + s2, 0, -148, 0, -112, [0, '#fffaf0', 1, BONE_D]), 1.8);
    }
    // ── 뒤팔 ──
    boneArm(ctx, -18, -112, -30, -88, -22, -66, fl);
    // ── 낫 ──
    if (this.hasScythe || ghost) this.drawHeldScythe(ctx, arm, t, 1.15);
    // ── 해골 (뿔 + 영혼불 왕관) ──
    ctx.save(); ctx.translate(3, -132);
    if (!fl) { for (let i = 0; i < 6; i++) { const k = (t * 1.5 + i * 0.17) % 1; glowE(ctx, (i - 2.5) * 5, -18 - k * 30, 7 * (1 - k) + 2, 11 * (1 - k) + 3, SOUL, 0.8 * (1 - k)); } }
    for (const s2 of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s2 * 7, -13); ctx.bezierCurveTo(s2 * 26, -16, s2 * 40, -24, s2 * 46, -46); ctx.quadraticCurveTo(s2 * 30, -30, s2 * 4, -19); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'dt2_horn' + s2, 0, -58, 0, -14, [0, '#140e0a', 0.5, BONE_D, 1, BONE]), 2);
    }
    drawSkull(ctx, 2, -2, 1.45, t, fl, this.jawOpen());
    ctx.restore();
    // ── 앞팔 ──
    const hp = this.scytheGrip(arm);
    boneArm(ctx, 16, -112, 28, -92, hp.x, hp.y, fl);
  }
  boneWing(ctx, s, t, fl) {
    const flap = Math.sin(t * 2.3) * 0.1;
    ctx.save();
    ctx.translate(s * 12, -116); ctx.scale(s, 1); ctx.rotate(-flap);
    // 관절 위치
    const wx = 44, wy = -40;
    const tips = [[112, -58], [120, -12], [100, 30], [66, 52]];
    // 막
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(wx, wy);
    for (let i = 0; i < tips.length; i++) {
      const [tx, ty] = tips[i];
      ctx.lineTo(tx, ty);
      const nx = i + 1 < tips.length ? tips[i + 1] : [10, 30];
      const mx = (tx + nx[0]) / 2, my = (ty + nx[1]) / 2;
      const ix = lerp(mx, wx, 0.35), iy = lerp(my, wy, 0.35);
      ctx.quadraticCurveTo(ix, iy, nx[0], nx[1]);
    }
    ctx.closePath();
    if (!fl) {
      ctx.fillStyle = LG(ctx, 'dt2_memb', 0, -60, 0, 60, [0, 'rgba(26,14,34,0.88)', 0.7, 'rgba(14,30,24,0.8)', 1, 'rgba(40,160,100,0.45)']);
      ctx.fill();
      ctx.strokeStyle = rgba(SOUL, 0.55); ctx.lineWidth = 1.2; ctx.stroke();
      // 찢어진 구멍
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(84, -10, 6, 3, 0.4, 0, TAU); ctx.ellipse(70, 22, 4, 2.5, -0.3, 0, TAU); ctx.fill();
    } else { ctx.fillStyle = '#fff'; ctx.fill(); }
    // 뼈대
    ctx.lineCap = 'round';
    for (const [col, lw] of [[OUT, 6], [BONE, 3.6]]) {
      ctx.strokeStyle = C(col); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(wx, wy);
      for (const [tx, ty] of tips) { ctx.moveTo(wx, wy); ctx.lineTo(tx, ty); }
      ctx.stroke();
    }
    ctx.fillStyle = C(BONE); ctx.beginPath(); ctx.arc(wx, wy, 4.5, 0, TAU); ctx.fill();
    // 끝 발톱
    ctx.fillStyle = C('#1a140e');
    ctx.beginPath(); ctx.moveTo(wx - 2, wy - 3); ctx.lineTo(wx + 4, wy - 16); ctx.lineTo(wx + 5, wy - 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  jawOpen() { return this.state === 'transform' || this.state === 'reap' || this.dying > 0 ? 0.6 + 0.4 * Math.sin(this.t * 20) : (this.arm.s > 0.3 ? 0.5 : 0.1); }
  scytheGrip(arm) { const a = arm.a; return { x: 20 + Math.sin(a) * 6, y: -84 + Math.cos(a) * 4 }; }
  drawHeldScythe(ctx, arm, t, sc = 1) {
    const g = this.scytheGrip(arm);
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(-0.25 + arm.a * 0.55 + arm.s * 0.6);
    ctx.scale(sc, sc);
    drawScythe(ctx, 1, false, t);
    ctx.restore();
    // 휘두름 잔광
    if (arm.s > 0.2 && !R.fl) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(SOUL, arm.s * 0.5); ctx.lineWidth = 18;
      ctx.beginPath(); ctx.arc(g.x, g.y, 120, -1.2, -1.2 + arm.s * 2); ctx.stroke();
      ctx.restore();
    }
  }
}

// ───────────── 도형 ─────────────
/** 해골 (cx, cy 중심, s 배율) */
function drawSkull(ctx, cx, cy, s, t, fl, jaw = 0.1) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  // 두개골
  ctx.beginPath();
  ctx.moveTo(-9, 2); ctx.bezierCurveTo(-11, -10, -4, -15, 3, -14); ctx.bezierCurveTo(10, -13, 13, -6, 12, 2);
  ctx.quadraticCurveTo(11, 6, 8, 7); ctx.lineTo(-5, 7); ctx.quadraticCurveTo(-9, 6, -9, 2);
  ink(ctx, fl ? '#fff' : LG(ctx, 'dt_skull', -10, 0, 12, 0, [0, BONE_D, 0.45, BONE, 1, '#fffaf0']), 1.6);
  // 턱
  ctx.save(); ctx.translate(0, 6 + jaw * 3);
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(9, 0); ctx.quadraticCurveTo(9, 6, 4, 7); ctx.lineTo(-2, 6); ctx.closePath();
  ink(ctx, C(BONE), 1.3);
  if (!fl) { ctx.fillStyle = '#1a140c'; for (let i = 0; i < 4; i++) ctx.fillRect(-1 + i * 2.5, 0, 1, 3); }
  ctx.restore();
  if (!fl) {
    // 눈구멍 + 영혼불
    // 눈구멍 (분노한 사선) + 눈썹뼈
    ctx.fillStyle = '#050305';
    ctx.beginPath(); ctx.moveTo(2.5, -4.2); ctx.lineTo(9.8, -6.8); ctx.quadraticCurveTo(10, 0.5, 6.2, 0.8); ctx.quadraticCurveTo(2.6, 0.6, 2.5, -4.2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5.2, -6.8); ctx.lineTo(0.8, -4.6); ctx.quadraticCurveTo(1, 0.2, -2, 0.5); ctx.quadraticCurveTo(-5, 0, -5.2, -6.8); ctx.fill();
    ctx.strokeStyle = 'rgba(60,50,36,0.85)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-6, -8.6); ctx.lineTo(1.6, -5.6); ctx.lineTo(10.6, -8.8); ctx.stroke();
    const fk = 0.8 + 0.2 * Math.sin(t * 13);
    glow(ctx, 6, -2.5, 12 * fk, SOUL, 0.9); glow(ctx, -2, -2.5, 8 * fk, SOUL, 0.7);
    ctx.fillStyle = SOUL_L; ctx.beginPath(); ctx.arc(6.3, -2.5, 1.3, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-2, -2.5, 0.9, 0, TAU); ctx.fill();
    // 코 구멍
    ctx.fillStyle = '#1a140c'; ctx.beginPath(); ctx.moveTo(9.5, 1); ctx.lineTo(11, 4); ctx.lineTo(8.5, 4); ctx.closePath(); ctx.fill();
    // 윗니
    ctx.fillStyle = '#fffaf0'; for (let i = 0; i < 4; i++) ctx.fillRect(-1 + i * 2.5, 5.5, 1.8, 2.5);
    // 금 간 자국
    ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(2, -9); ctx.lineTo(0, -7); ctx.stroke();
  }
  ctx.restore();
}
/** 낫: 원점 = 손잡이 쥐는 곳, 자루는 아래(+y)/위(-y)로, 날은 위쪽 끝에서 앞으로 휨 */
function drawScythe(ctx, k = 1, spinning = false, t = 0) {
  const fl = R.fl;
  const top = -120 * k, bot = 70 * k;
  // 자루
  ctx.beginPath(); ctx.moveTo(-3, bot); ctx.lineTo(-3, top); ctx.lineTo(3, top); ctx.lineTo(3, bot); ctx.closePath();
  ink(ctx, fl ? '#fff' : LG(ctx, 'dt_shaft', -3, 0, 3, 0, [0, '#1a1418', 0.5, '#4a3a42', 1, '#140e12']), 2);
  if (!fl) { ctx.fillStyle = BONE; ctx.fillRect(-4, bot - 8, 8, 6); ctx.fillRect(-4, -20 * k, 8, 5); }
  // 날 (거대한 초승달)
  ctx.save(); ctx.translate(0, top);
  ctx.beginPath();
  ctx.moveTo(-2, -6);
  ctx.bezierCurveTo(40 * k, -34 * k, 104 * k, -14 * k, 128 * k, 34 * k);
  ctx.bezierCurveTo(96 * k, 4 * k, 44 * k, -2 * k, 2, 10);
  ctx.closePath();
  ink(ctx, fl ? '#fff' : LG(ctx, 'dt_blade' + k, 0, -30 * k, 0, 20 * k, [0, '#ffffff', 0.35, STEEL, 0.75, '#5a5e70', 1, '#2a2c38']), 2.5);
  if (!fl) {
    ctx.strokeStyle = rgba(SOUL, 0.85); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(2, 10); ctx.bezierCurveTo(44 * k, -2 * k, 96 * k, 4 * k, 126 * k, 32 * k); ctx.stroke();
    glowE(ctx, 70 * k, 6 * k, 60 * k, 16 * k, SOUL, 0.35);
    // 결합부 해골 장식
    ctx.fillStyle = BONE; ctx.beginPath(); ctx.arc(0, 2, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#050305'; ctx.fillRect(-4, 0, 3, 3); ctx.fillRect(1, 0, 3, 3);
    glow(ctx, 0, 1, 10, SOUL, 0.6);
  }
  ctx.restore();
}
function boneArm(ctx, x0, y0, x1, y1, x2, y2, fl) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = C(OUT); ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = C(BONE); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.fillStyle = C(BONE);
  for (const [x, y] of [[x0, y0], [x1, y1]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill(); }
  // 손가락
  ctx.strokeStyle = C(BONE); ctx.lineWidth = 2;
  ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(x2, y2); ctx.lineTo(x2 + 6 + i, y2 + 4 + i * 3); } ctx.stroke();
}
function drawBoneSpike(ctx, H) {
  if (H < 2) return;
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(-8, -H * 0.5, 0, -H); ctx.quadraticCurveTo(8, -H * 0.5, 12, 0); ctx.closePath();
  const g = ctx.createLinearGradient(-12, 0, 12, 0); g.addColorStop(0, BONE_D); g.addColorStop(0.5, '#fffaf0'); g.addColorStop(1, BONE_D);
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(60,40,20,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); for (let i = 1; i < 4; i++) { const y = -H * i / 4; ctx.moveTo(-8 * (1 - i / 4), y); ctx.lineTo(8 * (1 - i / 4), y); } ctx.stroke();
  glowE(ctx, 0, -6, 20, 10, SOUL, 0.5);
}
function sickleRender(ctx, p) {
  ctx.rotate(p.rot || 0);
  glow(ctx, 0, 0, 30, SOUL, 0.5);
  ctx.beginPath(); ctx.arc(0, 0, 14, -0.3, PI * 1.25); ctx.arc(4, -2, 10, PI * 1.25, -0.3, true); ctx.closePath();
  ctx.fillStyle = '#dfe4ee'; ctx.fill(); ctx.strokeStyle = '#1a2a20'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.strokeStyle = SOUL; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 14, -0.3, PI * 1.25); ctx.stroke();
  ctx.fillStyle = '#3a2a30'; ctx.fillRect(-2, -2, 4, 12);
}
function glint4(ctx, x, y, s, a) {
  if (a <= 0.02) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= a;
  ctx.fillStyle = SOUL_L;
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.18, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.18, y); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.18); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.18); ctx.closePath(); ctx.fill();
  ctx.restore();
  glow(ctx, x, y, s * 1.5, SOUL, a * 0.6);
}
