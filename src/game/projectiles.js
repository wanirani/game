// 투사체 & 지속 판정(히트박스)
// world.spawnProjectile({x,y,vx,vy,w,h, team, attack, life, behavior, render, ...})
// behavior: 'straight' | 'arc'(중력) | 'boomerang' | 'homing' | 'orbit' | 'pool'(바닥 장판) | 'bounce' | 'wave' | 'fall' | 'beam' | 'static'
// render : PROJ_RENDER 키 또는 함수(ctx, p)
import { Entity } from './entity.js';
import { playerStrike, enemyStrike } from './combat.js';
import { moveBody, isSolidType } from '../core/physics.js';
import { TILE } from '../core/game.js';
import { TAU, rand, clamp, angleTo, shade } from '../core/math.js';
import { audio } from '../core/audio.js';

let _pid = 0;

export class Projectile extends Entity {
  constructor(o) {
    super(o.x - (o.w ?? 12) / 2, o.y - (o.h ?? 12) / 2, o.w ?? 12, o.h ?? 12);
    this.kind = 'projectile';
    Object.assign(this, {
      team: 'player', life: 2, behavior: 'straight', pierce: 1, gravity: 0, collideWalls: true,
      render: 'orb', color: '#fff', spin: 0, rot: 0, trail: null, trailRate: 0.02, light: null, scale: 1,
      homingTurn: 6, speed: Math.hypot(o.vx ?? 0, o.vy ?? 0), onHit: null, onExpire: null, onWall: null,
    }, o);
    this.x = o.x - this.w / 2; this.y = o.y - this.h / 2;
    this.vx = o.vx ?? 0; this.vy = o.vy ?? 0;
    this.maxLife = this.life;
    this.attack = { team: this.team, tags: ['projectile'], dir: Math.sign(this.vx) || 1, ...(o.attack || {}) };
    // 관통 투사체도 같은 대상은 투사체당 1회만 타격 (attack.hitId 가 undefined 로 덮여 와도 고유 ID 부여, rehit 지정 시 그 간격마다)
    this.attack.hitId ??= 'p' + (++_pid);
    if (!this.attack.owner) this.attack.owner = o.owner;
    this.hits = 0;
    this.z = 5;
    this.trailT = 0;
    this.ox = o.x; this.oy = o.y;
    this.returnTo = o.returnTo ?? null; // boomerang 복귀 대상
  }

  update(dt, world) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.expire(world); return; }
    const b = this.behavior;
    if (b === 'arc' || b === 'bounce' || b === 'fall') {
      this.vy += 2000 * (this.gravity || 1) * dt;
    } else if (this.gravity) {
      this.vy += 2000 * this.gravity * dt;
    }
    if (b === 'boomerang') {
      const back = this.t > (this.turnTime ?? 0.45);
      if (back && this.returnTo && !this.returnTo.dead) {
        const a = angleTo(this.cx, this.cy, this.returnTo.cx, this.returnTo.cy);
        const sp = Math.max(500, this.speed);
        this.vx += (Math.cos(a) * sp - this.vx) * Math.min(1, 5 * dt);
        this.vy += (Math.sin(a) * sp - this.vy) * Math.min(1, 5 * dt);
        if (Math.hypot(this.cx - this.returnTo.cx, this.cy - this.returnTo.cy) < 30 && this.t > 0.6) { this.dead = true; return; }
      } else {
        this.vx -= Math.sign(this.vx0 ?? this.vx) * (this.speed * 2.2) * dt;
      }
      this.vx0 ??= this.vx;
    } else if (b === 'homing') {
      const tgt = this.team === 'player' ? world.nearestEnemy(this.cx, this.cy, 600) : world.player;
      if (tgt && this.t > (this.homingDelay ?? 0.1)) {
        const want = angleTo(this.cx, this.cy, tgt.cx, tgt.cy);
        let cur = Math.atan2(this.vy, this.vx);
        let d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        cur += clamp(d, -this.homingTurn * dt, this.homingTurn * dt);
        this.vx = Math.cos(cur) * this.speed; this.vy = Math.sin(cur) * this.speed;
      }
    } else if (b === 'orbit') {
      const o = this.owner;
      if (o && !o.dead) {
        this.orbitA = (this.orbitA ?? 0) + (this.orbitSpeed ?? 5) * dt;
        const r = (this.orbitR ?? 70) * Math.min(1, this.t * 4);
        this.x = o.cx + Math.cos(this.orbitA) * r - this.w / 2;
        this.y = o.cy + Math.sin(this.orbitA) * r - this.h / 2;
      }
    } else if (b === 'wave') {
      this.waveA = (this.waveA ?? 0) + (this.waveFreq ?? 8) * dt;
      this.vy = Math.cos(this.waveA) * (this.waveAmp ?? 200);
    }
    // 이동 & 벽 충돌
    if (b === 'orbit' || b === 'static' || b === 'beam') {
      // 위치는 외부/owner가 지정
      if (b === 'beam' && this.follow) { this.follow(this, world); }
    } else if (b === 'bounce' || b === 'pool' || b === 'fall' || (b === 'arc' && this.collideWalls === 'land')) {
      const vyBefore = this.vy;
      this.noGravity = true;
      moveBody(this, dt, world.map, null);
      if (b === 'bounce' && this.onGround) { this.vy = -Math.abs(vyBefore) * (this.bounciness ?? 0.7); this.onGround = false; if (Math.abs(this.vy) < 80) this.vy = -300; }
      if (b === 'bounce' && this.hitWall) this.vx = -this.vx;
      if ((b === 'pool' || b === 'fall' || b === 'arc') && this.onGround && !this.landedOnce) {
        this.landedOnce = true;
        this.onLand?.(this, world);
      }
    } else {
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.collideWalls && isSolidType(world.map.typeAtPx(this.cx, this.cy))) {
        if (this.onWall) this.onWall(this, world);
        else { this.hitWallFx(world); this.dead = true; return; }
      }
    }
    this.rot += this.spin * dt;
    // 트레일
    if (this.trail) {
      this.trailT -= dt;
      if (this.trailT <= 0) { this.trailT = this.trailRate; world.fx.emit(this.trail, this.cx, this.cy, { speed: 20, ...(this.trailOpts || {}) }); }
    }
    // 타격
    const r = this.hitRect ? this.hitRect(this) : this.rect();
    if (this.team === 'player') {
      this.attack.dir = Math.sign(this.vx) || this.attack.dir || 1;
      const n = playerStrike(world, r, this.attack);
      if (n > 0) {
        this.hits += n;
        this.onHit?.(this, world);
        if (this.hits >= this.pierce) { this.expire(world, true); }
      }
    } else {
      if (enemyStrike(world, r, this.attack)) {
        this.hits++;
        this.onHit?.(this, world);
        if (this.hits >= this.pierce) this.expire(world, true);
      } else if (this.reflectable && world.player?.reflectRect) {
        // 반사 가능 투사체 (플레이어 공격 판정에 닿으면 반사)
      }
    }
  }
  hitWallFx(world) {
    world.fx.burst('spark', this.cx, this.cy, 5, { color: this.color });
  }
  expire(world, byHit = false) {
    if (this.dead) return;
    this.dead = true;
    this.onExpire?.(this, world, byHit);
  }
  lights(L) {
    if (this.light) L.add(this.cx, this.cy, this.light.r ?? 80, this.light.color ?? this.color, this.light.i ?? 0.8);
  }
  draw(ctx, world) {
    const fn = typeof this.render === 'function' ? this.render : PROJ_RENDER[this.render] || PROJ_RENDER.orb;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    const fade = this.fadeOut ? clamp(this.life / 0.25, 0, 1) : 1;
    ctx.globalAlpha = fade;
    fn(ctx, this, world);
    ctx.restore();
  }
}

/** 투사체 그리기 (원점 = 투사체 중심) */
export const PROJ_RENDER = {
  orb(ctx, p) {
    const r = Math.max(p.w, p.h) * 0.6 * p.scale;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, TAU); ctx.fill();
  },
  bullet(ctx, p) {
    const a = Math.atan2(p.vy, p.vx);
    ctx.rotate(a);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(-40, 0, 6, 0);
    g.addColorStop(0, 'rgba(255,200,80,0)'); g.addColorStop(1, p.color || '#fff0b0');
    ctx.fillStyle = g; ctx.fillRect(-40, -2, 46, 4);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(4, 0, 3, 0, TAU); ctx.fill();
  },
  knife(ctx, p) {
    ctx.scale(Math.sign(p.vx) || 1, 1);
    ctx.fillStyle = '#d8dce8'; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-2, -4); ctx.lineTo(-2, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-12, -2.5, 10, 5);
    ctx.fillStyle = '#c0a060'; ctx.fillRect(-3, -6, 3, 12);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-30, -1, 28, 2);
  },
  axe(ctx, p) {
    ctx.rotate(p.rot);
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-2.5, -16, 5, 32);
    ctx.fillStyle = '#c8ccd8';
    ctx.beginPath(); ctx.moveTo(2, -14); ctx.quadraticCurveTo(20, -18, 18, 0); ctx.quadraticCurveTo(20, 14, 2, 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2, -14); ctx.quadraticCurveTo(-14, -12, -12, -2); ctx.lineTo(-2, -4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(18, -8); ctx.quadraticCurveTo(21, 0, 17, 8); ctx.stroke();
  },
  cross(ctx, p) {
    ctx.rotate(p.rot);
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = '#ffe080'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#ffd84a';
    ctx.fillRect(-4, -16, 8, 32); ctx.fillRect(-16, -4, 32, 8);
    ctx.fillStyle = '#fff8d0'; ctx.fillRect(-1.5, -14, 3, 28); ctx.fillRect(-14, -1.5, 28, 3);
    ctx.shadowBlur = 0;
  },
  flask(ctx, p) {
    ctx.rotate(p.rot);
    ctx.fillStyle = 'rgba(160,210,255,0.9)'; ctx.beginPath(); ctx.arc(0, 3, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = '#dde'; ctx.fillRect(-2.5, -8, 5, 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(-1, 0, 2, 6); ctx.fillRect(-3, 2, 6, 2);
  },
  flame(ctx, p, world) {
    const k = 0.7 + Math.sin(p.t * 30 + p.x) * 0.15;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const h = p.h * (0.9 + i * 0.25) * k;
      const g = ctx.createRadialGradient(0, p.h / 2 - h * 0.3, 0, 0, p.h / 2 - h * 0.3, h * 0.8);
      g.addColorStop(0, i === 0 ? '#ffffff' : p.color2 || '#ffe070'); g.addColorStop(0.4, p.color || '#ff7a1a'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(rand(-2, 2), p.h / 2 - h * 0.35, p.w * 0.55, h * 0.55, 0, 0, TAU); ctx.fill();
    }
  },
  bone(ctx, p) {
    ctx.rotate(p.rot);
    ctx.fillStyle = '#efe6d0';
    ctx.fillRect(-10, -2, 20, 4);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(10 * s, -2.5, 3, 0, TAU); ctx.arc(10 * s, 2.5, 3, 0, TAU); ctx.fill(); }
  },
  fireball(ctx, p) {
    ctx.globalCompositeOperation = 'lighter';
    const r = p.w * 0.7 * p.scale;
    const a = Math.atan2(p.vy, p.vx);
    ctx.rotate(a);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    g.addColorStop(0, '#fff6c0'); g.addColorStop(0.35, p.color || '#ff8a2a'); g.addColorStop(1, 'rgba(120,20,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(-r * 0.5, 0, r * 2.2, r * 1.2, 0, 0, TAU); ctx.fill();
  },
  bolt(ctx, p) { // 마법탄 (길쭉한 빛)
    const a = Math.atan2(p.vy, p.vx);
    ctx.rotate(a);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(-36, 0, 10, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, p.color);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-12, 0, 26, 6 * p.scale, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, 0, 4 * p.scale, 0, TAU); ctx.fill();
  },
  shard(ctx, p) { // 얼음 조각
    const a = Math.atan2(p.vy, p.vx);
    ctx.rotate(a);
    ctx.fillStyle = p.color || '#bff4ff';
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -5); ctx.lineTo(-10, 0); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  },
  book(ctx, p) {
    ctx.rotate(Math.sin(p.t * 6) * 0.2);
    ctx.fillStyle = '#5a1a2a'; ctx.fillRect(-10, -12, 20, 24);
    ctx.fillStyle = '#e8c872'; ctx.fillRect(-2, -8, 4, 16); ctx.fillRect(-6, -4, 12, 4);
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,240,180,0.25)'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill();
  },
  wave(ctx, p) { // 검기/충격파
    const d = Math.sign(p.vx) || 1;
    ctx.scale(d, 1);
    ctx.globalCompositeOperation = 'lighter';
    const h = p.h * 0.6;
    const g = ctx.createLinearGradient(-p.w, 0, p.w * 0.5, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, p.color);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(p.w * 0.5, 0); ctx.quadraticCurveTo(-p.w * 0.2, -h * 1.6, -p.w, -h); ctx.quadraticCurveTo(-p.w * 0.1, 0, -p.w, h); ctx.quadraticCurveTo(-p.w * 0.2, h * 1.6, p.w * 0.5, 0); ctx.fill();
  },
  none() {},
};

/** 지속 판정 영역 (스킬 장판, 폭발 등) */
export class Hitbox extends Entity {
  constructor(o) {
    super(o.x, o.y, o.w, o.h);
    this.kind = 'hitbox';
    Object.assign(this, { team: 'player', life: 0.1, delay: 0 }, o); // 주의: draw 를 인스턴스 속성으로 덮으면 draw() 메서드가 가려져 렌더 오류
    this.attack = { team: this.team, tags: ['skill'], dir: 1, ...(o.attack || {}) };
    this.attack.hitId ??= 'h' + (++_pid);
    this.maxLife = this.life;
    this.z = 6;
  }
  update(dt, world) {
    this.t += dt;
    if (this.follow) this.follow(this, world);
    if (this.t < this.delay) return;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; this.onExpire?.(this, world); return; }
    if (this.team === 'player') playerStrike(world, this.rect(), this.attack);
    else enemyStrike(world, this.rect(), this.attack);
    this.tick?.(this, world, dt);
  }
  lights(L) { if (this.light) L.add(this.cx, this.cy, this.light.r, this.light.color, this.light.i ?? 1); }
  draw(ctx, world) {
    if (this.render) this.render(ctx, this, world);
    if (world.game.debug) { ctx.strokeStyle = '#f0f'; ctx.strokeRect(this.x, this.y, this.w, this.h); }
  }
}

export function explode(world, x, y, { r = 60, team = 'player', attack = {}, color = '#ff9a3a', sfx = 'explode' } = {}) {
  world.add(new Hitbox({ x: x - r, y: y - r, w: r * 2, h: r * 2, team, life: 0.12, attack: { mv: 1.5, kb: [300, -300], hitstop: 0.08, shake: 8, ...attack } }));
  world.fx.flash(x, y, { color, size: r * 2.2, life: 0.18 });
  world.fx.ring(x, y, { color, r0: r * 0.2, r1: r * 1.3, life: 0.3, width: 8 });
  world.fx.burst('fire', x, y, 18, { speed: 260 });
  world.fx.burst('smoke', x, y, 10, { speed: 90 });
  world.camera.shake(8, 0.3);
  audio.sfx(sfx);
}
