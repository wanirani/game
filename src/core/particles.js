// 파티클 시스템: 타격 불꽃, 피, 먼지, 불씨, 연기, 마법 입자, 충격파 링, 데미지 숫자 등
// fx.burst('spark', x, y, 12, {color:'#ffd', speed:300})
// fx.text(x, y, '1234', {color:'#fff', size:22, crit:true})
// fx.ring(x, y, {color:'#f44', r0:10, r1:80, life:0.3})
// fx.slash(x, y, angle, {len, color}) 휘두르기 궤적
import { rand, TAU, clamp } from './math.js';
import { TILE } from './game.js';
import { isSolidType } from './physics.js';

const PRESETS = {
  spark:  () => ({ shape: 'spark', life: rand(0.15, 0.35), speed: rand(180, 520), size: rand(2, 3.5), color: '#fff3c0', grav: 600, drag: 0.9, add: true }),
  hit:    () => ({ shape: 'spark', life: rand(0.1, 0.22), speed: rand(300, 700), size: rand(2.5, 4), color: '#ffffff', grav: 0, drag: 0.85, add: true }),
  blood:  () => ({ shape: 'circle', life: rand(0.4, 0.9), speed: rand(80, 320), size: rand(2, 4.5), color: '#9a0d1c', grav: 1300, drag: 0.98, collide: true }),
  dust:   () => ({ shape: 'smoke', life: rand(0.35, 0.7), speed: rand(20, 90), size: rand(6, 12), color: '#8a8074', grav: -40, drag: 0.92, alpha: 0.45 }),
  smoke:  () => ({ shape: 'smoke', life: rand(0.6, 1.3), speed: rand(10, 60), size: rand(10, 22), color: '#3a3440', grav: -60, drag: 0.95, alpha: 0.5 }),
  ember:  () => ({ shape: 'circle', life: rand(0.6, 1.4), speed: rand(30, 120), size: rand(1.2, 2.6), color: '#ff9a3a', grav: -120, drag: 0.97, add: true, flicker: true }),
  fire:   () => ({ shape: 'smoke', life: rand(0.25, 0.55), speed: rand(40, 140), size: rand(8, 16), color: '#ff7a1a', color2: '#ffd070', grav: -260, drag: 0.9, add: true }),
  magic:  () => ({ shape: 'star', life: rand(0.4, 0.8), speed: rand(40, 200), size: rand(2, 4), color: '#b98cff', grav: -40, drag: 0.93, add: true }),
  holy:   () => ({ shape: 'star', life: rand(0.4, 0.9), speed: rand(40, 220), size: rand(2, 4.5), color: '#fff2b0', grav: -80, drag: 0.93, add: true }),
  ice:    () => ({ shape: 'square', life: rand(0.4, 0.8), speed: rand(80, 260), size: rand(2, 4), color: '#bff4ff', grav: 700, drag: 0.96, add: true }),
  dark:   () => ({ shape: 'smoke', life: rand(0.4, 0.9), speed: rand(30, 120), size: rand(6, 14), color: '#5a1a7a', grav: -30, drag: 0.93, add: false, alpha: 0.7 }),
  thunder:() => ({ shape: 'spark', life: rand(0.1, 0.25), speed: rand(300, 800), size: rand(2, 3), color: '#bfe8ff', grav: 0, drag: 0.8, add: true }),
  shard:  () => ({ shape: 'square', life: rand(0.5, 1.1), speed: rand(120, 380), size: rand(3, 6), color: '#7a7470', grav: 1500, drag: 0.99, collide: true }),
  soul:   () => ({ shape: 'circle', life: rand(0.8, 1.5), speed: rand(20, 70), size: rand(2, 4), color: '#8affc8', grav: -90, drag: 0.96, add: true }),
  gold:   () => ({ shape: 'star', life: rand(0.3, 0.6), speed: rand(60, 160), size: rand(2, 3), color: '#ffd84a', grav: -30, drag: 0.9, add: true }),
  water:  () => ({ shape: 'circle', life: rand(0.4, 0.8), speed: rand(100, 300), size: rand(2, 3.5), color: '#7ec8ff', grav: 1400, drag: 0.99, collide: true, alpha: 0.8 }),
};

export class Particles {
  constructor(max = 1400) {
    this.max = max;
    this.list = [];
    this.quality = 1; // 0.4~1: 저사양에서 수 감소
  }
  clear() { this.list.length = 0; }

  emit(type, x, y, opts = {}) {
    if (this.list.length >= this.max) this.list.shift();
    const base = PRESETS[type] ? PRESETS[type]() : PRESETS.spark();
    const p = Object.assign(base, opts);
    const ang = opts.angle !== undefined ? opts.angle + rand(-(opts.spread ?? 0.5), opts.spread ?? 0.5) : rand(0, TAU);
    const sp = opts.speed !== undefined ? opts.speed * rand(0.6, 1.1) : base.speed;
    p.x = x; p.y = y;
    p.vx = (opts.vx ?? 0) + Math.cos(ang) * sp;
    p.vy = (opts.vy ?? 0) + Math.sin(ang) * sp;
    p.max = p.life;
    p.rot = rand(0, TAU); p.vr = rand(-8, 8);
    p.layer = opts.layer ?? 'front';
    this.list.push(p);
    return p;
  }
  burst(type, x, y, n, opts = {}) {
    const k = Math.max(1, Math.round(n * this.quality));
    for (let i = 0; i < k; i++) this.emit(type, x + rand(-(opts.jitter ?? 0), opts.jitter ?? 0), y + rand(-(opts.jitter ?? 0), opts.jitter ?? 0), opts);
  }
  ring(x, y, { color = '#fff', r0 = 8, r1 = 70, life = 0.3, width = 4, add = true, layer = 'front' } = {}) {
    this.list.push({ shape: 'ring', x, y, vx: 0, vy: 0, r0, r1, life, max: life, color, width, add, layer, grav: 0, drag: 1 });
  }
  flash(x, y, { color = '#fff', size = 60, life = 0.12 } = {}) {
    this.list.push({ shape: 'flash', x, y, vx: 0, vy: 0, size, life, max: life, color, add: true, layer: 'front', grav: 0, drag: 1 });
  }
  slash(x, y, angle, { len = 90, width = 14, color = '#fff', life = 0.14, arc = 1.4, dir = 1, radius } = {}) {
    this.list.push({ shape: 'slash', x, y, vx: 0, vy: 0, angle, len, width, color, life, max: life, arc, dir, radius: radius ?? len, add: true, layer: 'front', grav: 0, drag: 1 });
  }
  /** 잔상: draw(ctx, alpha) 콜백을 수명 동안 호출 */
  ghost(draw, life = 0.25, layer = 'back') {
    this.list.push({ shape: 'ghost', x: 0, y: 0, vx: 0, vy: 0, draw, life, max: life, layer, grav: 0, drag: 1 });
  }
  text(x, y, str, { color = '#fff', size = 20, crit = false, life = 0.9, vy = -90, outline = '#200008', font } = {}) {
    this.list.push({ shape: 'text', x: x + rand(-8, 8), y, vx: rand(-20, 20), vy, str: String(str), color, size, crit, life, max: life, outline, font, layer: 'top', grav: 160, drag: 0.96 });
  }

  update(dt, map) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy += (p.grav || 0) * dt;
      const d = Math.pow(p.drag ?? 1, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.collide && map) {
        const tt = map.typeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
        if (isSolidType(tt)) { p.y -= p.vy * dt; p.vy *= -0.2; p.vx *= 0.5; p.grav = 0; p.drag = 0.8; }
      }
    }
  }

  draw(ctx, layer = 'front') {
    for (const p of this.list) {
      if (p.layer !== layer) continue;
      const t = 1 - p.life / p.max; // 0→1
      const a = clamp((p.alpha ?? 1) * (p.life / p.max) * 1.4, 0, 1) * (p.flicker ? 0.6 + Math.random() * 0.4 : 1);
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      switch (p.shape) {
        case 'circle': {
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, TAU); ctx.fill();
          break;
        }
        case 'square': {
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
          break;
        }
        case 'spark': {
          ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
          break;
        }
        case 'star': {
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          const s = p.size * (1.2 - t * 0.6);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(0, -s * 2); ctx.lineTo(s * 0.5, -s * 0.5); ctx.lineTo(s * 2, 0); ctx.lineTo(s * 0.5, s * 0.5);
          ctx.lineTo(0, s * 2); ctx.lineTo(-s * 0.5, s * 0.5); ctx.lineTo(-s * 2, 0); ctx.lineTo(-s * 0.5, -s * 0.5);
          ctx.closePath(); ctx.fill(); ctx.restore();
          break;
        }
        case 'smoke': {
          const r = p.size * (0.6 + t * 1.2);
          ctx.globalAlpha = a * 0.8;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, p.color2 && t < 0.4 ? p.color2 : p.color);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
          break;
        }
        case 'ring': {
          const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(t);
          ctx.globalAlpha = (1 - t);
          ctx.strokeStyle = p.color; ctx.lineWidth = p.width * (1 - t) + 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
          break;
        }
        case 'flash': {
          ctx.globalAlpha = 1 - t;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
          g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g; ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          break;
        }
        case 'slash': {
          // 초승달 모양 궤적
          const k = 1 - t;
          ctx.globalAlpha = k;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
          const R = p.radius, half = p.arc / 2;
          const g = ctx.createLinearGradient(-R, 0, R, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, p.color); g.addColorStop(1, '#ffffff');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, R, -half, half, false);
          ctx.arc(p.width * k * 0.8, 0, R - p.width * k, half, -half, true);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
        case 'ghost': {
          ctx.globalCompositeOperation = 'source-over';
          p.draw(ctx, (p.life / p.max) * 0.5);
          break;
        }
        case 'text': {
          const pop = t < 0.12 ? 1 + (0.12 - t) * (p.crit ? 9 : 5) : 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = clamp(p.life / p.max * 2.5, 0, 1);
          const size = p.size * pop;
          ctx.font = p.font || `900 ${size}px "Cinzel", "Noto Sans KR", serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 5; ctx.strokeStyle = p.outline; ctx.strokeText(p.str, p.x, p.y);
          ctx.fillStyle = p.color; ctx.fillText(p.str, p.x, p.y);
          if (p.crit) { ctx.globalAlpha *= 0.5; ctx.fillStyle = '#fff'; ctx.fillText(p.str, p.x, p.y - 1); }
          ctx.textBaseline = 'alphabetic';
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
