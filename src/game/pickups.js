// 줍는 아이템: 하트(서브웨폰 탄), 골드, 음식(회복), 장비/재료 아이템, 비전서, 서브웨폰, 파워업, 1UP, MP 구슬
// world.spawnPickup(type, x, y, data)  type: 'heart'|'gold'|'food'|'item'|'doc'|'sub'|'powerup'|'oneup'|'mp'
import { Entity } from './entity.js';
import { moveBody } from '../core/physics.js';
import { TAU, rand, clamp } from '../core/math.js';
import { assets } from '../core/assets.js';
import { COLORS } from '../core/ui.js';
import { drawIcon } from '../render/icons.js';

export class Pickup extends Entity {
  constructor(type, x, y, data = {}) {
    const size = type === 'item' || type === 'doc' || type === 'sub' || type === 'powerup' ? 26 : type === 'heart' && data.value > 1 ? 22 : 16;
    super(x - size / 2, y - size / 2, size, size);
    this.kind = 'pickup';
    this.type = type;
    this.data = data;
    this.vx = data.vx ?? rand(-90, 90);
    this.vy = data.vy ?? rand(-420, -260);
    this.gravity = type === 'heart' && !data.value ? 0.25 : 1;
    this.maxFall = type === 'heart' && !(data.value > 1) ? 120 : 900;
    this.life = ['heart', 'gold', 'mp'].includes(type) ? 9 : type === 'food' ? 20 : Infinity;
    this.z = 4;
    this.magnet = false;
    this.bob = rand(0, TAU);
    this.delay = data.delay ?? 0.35; // 생성 직후 줍기 방지
  }
  update(dt, world) {
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const p = world.player;
    const mag = p && (p.buffs?.magnet || (p.stats?.magnet ?? 0) > 0);
    if (p && this.t > this.delay && (this.magnet || (mag && Math.hypot(p.cx - this.cx, p.cy - this.cy) < 320))) {
      this.magnet = true;
      const dx = p.cx - this.cx, dy = p.cy - this.cy, d = Math.hypot(dx, dy) || 1;
      const sp = 700;
      this.vx += (dx / d * sp - this.vx) * Math.min(1, 10 * dt);
      this.vy += (dy / d * sp - this.vy) * Math.min(1, 10 * dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
    } else {
      // 작은 하트는 나풀나풀 떨어짐 (클래식)
      if (this.type === 'heart' && !(this.data.value > 1) && !this.onGround) this.vx = Math.sin(this.t * 5) * 70;
      moveBody(this, dt, world.map);
      if (this.onGround) this.vx *= 0.8;
      if (this.y > world.map.pxH + 100) { this.dead = true; return; }
    }
    if (p && !p.dead && this.t > this.delay) {
      const r = p.rect();
      if (this.x < r.x + r.w + 6 && this.x + this.w > r.x - 6 && this.y < r.y + r.h && this.y + this.h > r.y) {
        world.collect(this);
      }
    }
  }
  lights(L) {
    if (this.type === 'item') {
      const col = COLORS.rarity[this.data.item?.rarity ?? 0];
      L.add(this.cx, this.cy, 70, col, 0.7);
    } else if (this.type === 'doc' || this.type === 'powerup' || this.type === 'oneup') L.add(this.cx, this.cy, 90, '#ffe7a0', 0.9);
  }
  draw(ctx, world) {
    if (this.life < 2.5 && Math.floor(this.life * 10) % 2 === 0) return;
    const x = this.cx, y = this.cy + Math.sin(this.t * 4 + this.bob) * (this.onGround ? 2 : 0);
    ctx.save();
    ctx.translate(x, y);
    switch (this.type) {
      case 'heart': drawHeart(ctx, this.data.value > 1 ? 11 : 7, this.t); break;
      case 'gold': drawCoin(ctx, this.data.amount ?? 1, this.t); break;
      case 'mp': {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
        g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#5aa8ff'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
        break;
      }
      case 'food': drawIcon(ctx, this.data.icon || 'meat', 0, 0, 34); break;
      case 'item': {
        const it = this.data.item;
        const col = COLORS.rarity[it?.rarity ?? 0];
        // 희귀도 빛기둥
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, -90, 0, 14);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
        ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.t * 5);
        ctx.fillStyle = g; ctx.fillRect(-7, -90, 14, 104);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        drawIcon(ctx, it?.icon ?? 'coin', 0, 0, 34, it);
        break;
      }
      case 'doc': {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,230,150,${0.3 + 0.2 * Math.sin(this.t * 6)})`;
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        drawIcon(ctx, 'doc', 0, 0, 36);
        break;
      }
      case 'sub': drawIcon(ctx, 'sub_' + this.data.id, 0, 0, 34); break;
      case 'powerup': {
        ctx.rotate(Math.sin(this.t * 3) * 0.2);
        drawIcon(ctx, 'powerup', 0, 0, 34);
        break;
      }
      case 'oneup': drawIcon(ctx, 'oneup', 0, 0, 34); break;
      default: ctx.fillStyle = '#fff'; ctx.fillRect(-6, -6, 12, 12);
    }
    ctx.restore();
  }
}

export function drawHeart(ctx, r, t = 0) {
  const s = 1 + Math.sin(t * 8) * 0.06;
  ctx.scale(s, s);
  ctx.shadowColor = '#ff2040'; ctx.shadowBlur = 10;
  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#ff6a7a'); g.addColorStop(1, '#a00820');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.9);
  ctx.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.2, 0, -r * 0.45);
  ctx.bezierCurveTo(r * 0.7, -r * 1.2, r * 1.4, -r * 0.1, 0, r * 0.9);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.35, r * 0.22, r * 0.14, -0.6, 0, TAU); ctx.fill();
}

export function drawCoin(ctx, amount, t) {
  if (amount >= 100) { drawIcon(ctx, 'moneybag', 0, -2, 30); return; }
  const w = Math.abs(Math.cos(t * 6)) * 8 + 1;
  const r = amount >= 25 ? 9 : 7;
  ctx.fillStyle = amount >= 25 ? '#ffe070' : '#e8b030';
  ctx.beginPath(); ctx.ellipse(0, 0, w * (r / 8), r, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8a5a10'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-w * 0.3, -r * 0.6, Math.max(1, w * 0.25), r * 0.8);
}
