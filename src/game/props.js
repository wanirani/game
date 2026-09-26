// 스테이지 오브젝트: 촛불/촛대(부수면 드롭), 보물상자, 세이브 관, 여신상, 문, 이동/붕괴 발판, 보스 트리거, 스토리 트리거, NPC, 장식 램프
import { Entity } from './entity.js';
import { TAU, rand, chance, clamp, ease } from '../core/math.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { input } from '../core/input.js';
import { TILE } from '../core/game.js';
import { text } from '../core/ui.js';

function drawFlame(ctx, x, y, s = 1, t = 0, color = '#ff9a3a') {
  const f = 1 + Math.sin(t * 23 + x) * 0.12 + Math.sin(t * 37) * 0.06;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y - 5 * s, 0, x, y - 5 * s, 22 * s);
  g.addColorStop(0, 'rgba(255,200,120,0.55)'); g.addColorStop(1, 'rgba(255,100,20,0)');
  ctx.fillStyle = g; ctx.fillRect(x - 24 * s, y - 30 * s, 48 * s, 48 * s);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y - 6 * s * f, 4 * s, 9 * s * f, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff6d0';
  ctx.beginPath(); ctx.ellipse(x, y - 4 * s * f, 2 * s, 5 * s * f, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
export { drawFlame };

/** 부서지는 광원 (촛불 'C' / 촛대 'T'). 공격받으면 부서지며 아이템 드롭 */
export class Candle extends Entity {
  constructor(tx, ty, big = false, stage) {
    const w = big ? 30 : 18, h = big ? 64 : 36;
    super(tx * TILE + TILE / 2 - w / 2, (ty + 1) * TILE - h, w, h);
    this.kind = 'prop'; this.big = big; this.hp = 1;
    this.stage = stage;
    this.z = 1;
    this.hanging = false;
    this.stats = { def: 0, res: 0 };
  }
  hurtbox() { return this.rect(); }
  takeHit(dmg, attack, world) {
    if (this.dead) return false;
    this.dead = true;
    audio.sfx('candle');
    world.fx.burst('ember', this.cx, this.y + 8, 14, { speed: 120 });
    world.fx.burst('spark', this.cx, this.y + 8, 6, { color: '#ffc070' });
    world.dropFromCandle(this.cx, this.y + 10, this.big);
    return true;
  }
  lights(L) { L.add(this.cx, this.y + 4, this.big ? 170 : 115, '#ffb060', this.big ? 1 : 0.8); }
  draw(ctx, world) {
    const img = assets.get(this.big ? 'props/prop_candelabra' : 'props/prop_candle');
    if (img) {
      const h = this.big ? 96 : 54, w = h * (img.width / img.height);
      ctx.drawImage(img, this.cx - w / 2, this.bottom - h, w, h);
      if (this.big) { drawFlame(ctx, this.cx, this.bottom - h * 0.86, 0.8, world.time); }
      else drawFlame(ctx, this.cx, this.bottom - h * 0.9, 0.7, world.time);
      return;
    }
    // 절차적 촛대
    ctx.fillStyle = '#3a2a1a';
    if (this.big) {
      ctx.fillRect(this.cx - 2, this.y + 16, 4, this.h - 16);
      ctx.fillRect(this.cx - 12, this.bottom - 4, 24, 4);
      ctx.strokeStyle = '#5a4a30'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(this.cx - 14, this.y + 14); ctx.quadraticCurveTo(this.cx, this.y + 30, this.cx + 14, this.y + 14); ctx.stroke();
      for (const dx of [-14, 0, 14]) {
        ctx.fillStyle = '#e8dcc0'; ctx.fillRect(this.cx + dx - 2.5, this.y + 4 + (dx ? 2 : -4), 5, 10);
        drawFlame(ctx, this.cx + dx, this.y + 4 + (dx ? 2 : -4), 0.7, world.time + dx);
      }
    } else {
      ctx.fillRect(this.cx - 5, this.bottom - 4, 10, 4);
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(this.cx - 3, this.y + 12, 6, this.h - 16);
      drawFlame(ctx, this.cx, this.y + 12, 0.8, world.time);
    }
  }
}

/** 보물상자 '$' — 열면 내용물 (room.chests[order] 또는 스테이지 레벨 기반 무작위) */
export class Chest extends Entity {
  constructor(tx, ty, contents = null) {
    super(tx * TILE + 4, (ty + 1) * TILE - 36, 40, 36);
    this.kind = 'prop'; this.open = false; this.contents = contents; this.z = 1;
    this.stats = { def: 0, res: 0 };
  }
  hurtbox() { return this.rect(); }
  takeHit(dmg, attack, world) { this.openChest(world); return false; }
  update(dt, world) {
    this.t += dt;
    const p = world.player;
    // 범위 46: 가장 넓은 캐릭터(폭 36)가 1칸 벽 틈 속 상자에 붙어 섰을 때(중심 거리 42)도 열 수 있게
    this.near = !this.open && !!p && Math.abs(p.cx - this.cx) < 46 && Math.abs(p.bottom - this.bottom) < 20;
    if (this.near && input.pressed('up')) this.openChest(world);
  }
  openChest(world) {
    if (this.open) return;
    this.open = true;
    audio.sfx('chest');
    world.fx.burst('gold', this.cx, this.y, 24, { speed: 200 });
    world.fx.flash(this.cx, this.y, { color: '#ffe080', size: 80 });
    world.openChest(this);
  }
  lights(L) { if (!this.open) L.add(this.cx, this.cy, 60, '#ffd070', 0.5); }
  draw(ctx, world) {
    const img = assets.get(this.open ? 'props/prop_chest_open' : 'props/prop_chest_closed');
    if (img) ctx.drawImage(img, this.cx - 30, this.bottom - 56, 60, 60);
    else {
      ctx.fillStyle = '#5a3418'; ctx.fillRect(this.x, this.y + 10, this.w, this.h - 10);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(this.x, this.y + 18, this.w, 4); ctx.fillRect(this.cx - 4, this.y + 14, 8, 10);
      if (!this.open) { ctx.fillStyle = '#6a4020'; ctx.beginPath(); ctx.ellipse(this.cx, this.y + 12, this.w / 2, 10, 0, Math.PI, 0); ctx.fill(); }
      else { ctx.fillStyle = '#2a1408'; ctx.fillRect(this.x + 3, this.y + 6, this.w - 6, 8); }
    }
    // 열기 안내 (스프라이트 유무와 관계없이)
    if (this.near) text(ctx, '▲', this.cx, this.bottom - (img ? 64 : this.h + 8), { size: 14, align: 'center', color: '#ffe7a0' });
  }
}

/** 세이브 포인트 'S' (붉은 관). 위 방향키로 저장 + 완전 회복 */
export class SavePoint extends Entity {
  constructor(tx, ty) {
    super(tx * TILE, (ty + 1) * TILE - 80, 48, 80);
    this.kind = 'prop'; this.z = 0;
  }
  update(dt, world) {
    this.t += dt;
    const p = world.player;
    this.near = p && Math.abs(p.cx - this.cx) < 40 && Math.abs(p.bottom - this.bottom) < 30;
    if (this.near && input.pressed('up')) world.useSavePoint(this);
  }
  lights(L) { L.add(this.cx, this.cy, 120, '#ff3040', 0.7); }
  draw(ctx, world) {
    const img = assets.get('props/prop_coffin');
    if (img) ctx.drawImage(img, this.cx - 32, this.bottom - 96, 64, 96);
    else {
      ctx.fillStyle = '#3a0a12';
      ctx.beginPath(); ctx.moveTo(this.cx - 12, this.y); ctx.lineTo(this.cx + 12, this.y); ctx.lineTo(this.cx + 20, this.y + 24); ctx.lineTo(this.cx + 14, this.bottom); ctx.lineTo(this.cx - 14, this.bottom); ctx.lineTo(this.cx - 20, this.y + 24); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#c8a040'; ctx.fillRect(this.cx - 2, this.y + 16, 4, 30); ctx.fillRect(this.cx - 9, this.y + 24, 18, 4);
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,40,60,${0.15 + 0.1 * Math.sin(world.time * 3)})`;
    ctx.beginPath(); ctx.ellipse(this.cx, this.bottom, 40, 8, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (this.near) text(ctx, '▲ 저장', this.cx, this.y - 10, { size: 14, align: 'center', color: '#ffb0b0', weight: 700 });
  }
}

/** 여신상 'G' — 한 번 완전 회복 */
export class Statue extends Entity {
  constructor(tx, ty) { super(tx * TILE - 8, (ty + 1) * TILE - 110, 64, 110); this.kind = 'prop'; this.used = false; this.z = 0; }
  update(dt, world) {
    this.t += dt;
    const p = world.player;
    if (!this.used && p && Math.abs(p.cx - this.cx) < 50 && Math.abs(p.bottom - this.bottom) < 30) {
      this.used = true;
      world.gimmick?.cleanse?.(100);   // [hook:gimmick] 부패(blight) 먼저 정화 → 회복 반감 없이 완전 회복
      world.healPlayer(1, true);
      audio.sfx('heal');
      world.fx.burst('holy', p.cx, p.cy, 30, { speed: 160 });
      world.game.toast('여신상의 가호 — 체력과 마력이 모두 회복되었다');
    }
  }
  lights(L) { L.add(this.cx, this.y + 30, 150, this.used ? '#8090a0' : '#fff2c0', this.used ? 0.4 : 0.9); }
  draw(ctx, world) {
    const img = assets.get('props/prop_statue');
    if (img) { ctx.drawImage(img, this.cx - 45, this.bottom - 180, 90, 180); }
    else {
      ctx.fillStyle = '#b8b0a8';
      ctx.fillRect(this.cx - 24, this.bottom - 16, 48, 16);
      ctx.beginPath(); ctx.moveTo(this.cx - 14, this.bottom - 16); ctx.lineTo(this.cx - 18, this.y + 30); ctx.lineTo(this.cx + 18, this.y + 30); ctx.lineTo(this.cx + 14, this.bottom - 16); ctx.fill();
      ctx.beginPath(); ctx.arc(this.cx, this.y + 20, 11, 0, TAU); ctx.fill();
    }
    if (!this.used) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,240,180,${0.2 + 0.1 * Math.sin(world.time * 2)})`;
      ctx.beginPath(); ctx.arc(this.cx, this.y + 20, 26, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
}

/** 피 손자국 스프라이트 (문 표식 'blood', 한 번만 그림) */
let _bloodHand = null, _bloodGlow = null;
function bloodHandSprite() {
  if (_bloodHand) return _bloodHand;
  const c = document.createElement('canvas');
  c.width = 44; c.height = 52;
  const g = c.getContext('2d');
  g.translate(22, 30); g.rotate(-0.14);
  const paint = (col, k) => {
    g.fillStyle = col;
    g.beginPath(); g.ellipse(0, 4, 10 * k, 11 * k, 0, 0, TAU); g.fill();                         // 손바닥
    for (const [x, y, len, a] of [[-7, -5, 13, -0.2], [-2.5, -7, 16, -0.05], [2.5, -7, 15, 0.06], [7, -5, 12, 0.2]]) {   // 네 손가락
      g.save(); g.translate(x * k, y * k); g.rotate(a);
      g.beginPath(); g.ellipse(0, -len * k / 2, 2.4 * k, len * k / 2 + 1, 0, 0, TAU); g.fill(); g.restore();
    }
    g.save(); g.translate(-10 * k, 5 * k); g.rotate(-0.95);                                          // 엄지
    g.beginPath(); g.ellipse(0, -5 * k, 2.6 * k, 6.5 * k, 0, 0, TAU); g.fill(); g.restore();
  };
  paint('#4a040c', 1.08);
  paint('#7a0a16', 1);
  // 번진 자국과 젖은 광택
  g.fillStyle = 'rgba(120,8,20,0.55)';
  g.beginPath(); g.ellipse(3, 14, 6, 3, 0.3, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,120,130,0.35)';
  g.beginPath(); g.ellipse(-3, 0, 3, 1.4, -0.5, 0, TAU); g.fill();
  _bloodHand = c;
  return c;
}
function bloodGlowSprite() {
  if (_bloodGlow) return _bloodGlow;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,40,60,0.25)'); gr.addColorStop(1, 'rgba(255,40,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _bloodGlow = c;
  return c;
}

/** 문 'D' — ▲ 로 다음 방. target: room id. mark: 'blood' 이면 문짝에 피 손자국 (world2 §3.8, room.doorMarks) */
export class Door extends Entity {
  constructor(tx, ty, target) { super(tx * TILE, (ty + 1) * TILE - 96, 48, 96); this.kind = 'prop'; this.target = target; this.z = 0; this.openT = 0; this.mark = null; }
  lights(L) { if (this.mark === 'blood') L.add(this.cx, this.bottom - 58, 80, '#ff2840', 0.35); }
  /** 피 손자국 + 흘러내리는 핏방울 3줄 + 옅은 붉은 빛 */
  drawBloodMark(ctx, t) {
    const hx = this.cx - 2, hy = this.bottom - 58;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gs = 70 + Math.sin(t * 2.2) * 4;
    ctx.drawImage(bloodGlowSprite(), hx - gs / 2, hy - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bloodHandSprite(), hx - 22, hy - 30, 44, 52);
    ctx.strokeStyle = '#6a0812'; ctx.fillStyle = '#7a0a16'; ctx.lineCap = 'round'; ctx.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      const dx = hx - 6 + i * 6.5 + (i === 1 ? 1 : 0), y0 = hy + 12 + (i === 1 ? 3 : 0);
      const ph = (t * 0.33 + i * 0.37) % 1;
      const len = 4 + 16 * ease.inQuad(Math.min(1, ph / 0.8));
      ctx.beginPath(); ctx.moveTo(dx, y0); ctx.lineTo(dx, y0 + len); ctx.stroke();
      ctx.beginPath(); ctx.arc(dx, y0 + len, 1.8, 0, TAU); ctx.fill();
      if (ph > 0.8) {   // 떨어지는 방울
        const f = (ph - 0.8) / 0.2;
        ctx.globalAlpha = 1 - f;
        ctx.beginPath(); ctx.arc(dx, y0 + len + 3 + f * 18, 1.6, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
  update(dt, world) {
    this.t += dt;
    const p = world.player;
    this.near = p && p.cx > this.x && p.cx < this.x + this.w && Math.abs(p.bottom - this.bottom) < 20;
    if (this.near && this.target && input.pressed('up') && !world.transitioning) {
      audio.sfx('door');
      world.enterDoor ? world.enterDoor(this.target) : world.gotoRoom(this.target);
    }
  }
  draw(ctx, world) {
    const img = assets.get('props/prop_door');
    if (img) { ctx.drawImage(img, this.cx - 34, this.bottom - 102, 68, 102); }
    else {
      ctx.fillStyle = '#2a1608';
      ctx.beginPath(); ctx.moveTo(this.x, this.bottom); ctx.lineTo(this.x, this.y + 24); ctx.arc(this.cx, this.y + 24, 24, Math.PI, 0); ctx.lineTo(this.x + this.w, this.bottom); ctx.fill();
      ctx.strokeStyle = '#5a5058'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#6a6070'; ctx.fillRect(this.x + 4, this.y + 40, this.w - 8, 4); ctx.fillRect(this.x + 4, this.y + 70, this.w - 8, 4);
    }
    if (this.mark === 'blood') this.drawBloodMark(ctx, world.time ?? this.t);
    if (this.near) text(ctx, '▲', this.cx, this.y - 6, { size: 16, align: 'center', color: '#ffe7a0' });
  }
}

/** 이동 발판 'M'(좌우) / 'V'(상하) */
export class MovingPlatform extends Entity {
  constructor(tx, ty, vertical = false, range = 4, speed = 70) {
    super(tx * TILE, ty * TILE, TILE * 2, 14);
    this.kind = 'platform'; this.vertical = vertical;
    this.ox = this.x; this.oy = this.y; this.range = range * TILE; this.speed = speed;
    this.dir = 1; this.z = 1;
  }
  update(dt, world) {
    this.t += dt;
    const px = this.x, py = this.y;
    if (this.vertical) {
      this.y += this.dir * this.speed * dt;
      if (this.y > this.oy + this.range || this.y < this.oy) this.dir *= -1;
      this.y = clamp(this.y, this.oy, this.oy + this.range);
    } else {
      this.x += this.dir * this.speed * dt;
      if (this.x > this.ox + this.range || this.x < this.ox) this.dir *= -1;
      this.x = clamp(this.x, this.ox, this.ox + this.range);
    }
    this.vx = (this.x - px) / dt; this.vy = (this.y - py) / dt;
  }
  draw(ctx, world) { world.drawPlatform?.(ctx, this); }
}

/** 붕괴 발판 'F' — 밟으면 흔들리다 떨어지고 잠시 후 복구 */
export class CrumblePlatform extends Entity {
  constructor(tx, ty) { super(tx * TILE, ty * TILE, TILE, 14); this.kind = 'platform'; this.ox = this.x; this.oy = this.y; this.state = 'idle'; this.st = 0; this.z = 1; }
  onStand() { if (this.state === 'idle') { this.state = 'shake'; this.st = 0; } }
  update(dt, world) {
    this.st += dt;
    this.vx = 0; this.vy = 0;
    if (this.state === 'shake') { this.x = this.ox + rand(-1.5, 1.5); if (this.st > 0.45) { this.state = 'fall'; this.st = 0; audio.sfx('break_wall', { vol: 0.4 }); } }
    else if (this.state === 'fall') { this.fallV = (this.fallV ?? 0) + 1800 * dt; this.y += this.fallV * dt; if (this.st > 1.2) { this.state = 'gone'; this.st = 0; this.y = -9999; } }
    else if (this.state === 'gone') { if (this.st > 2.5) { this.state = 'idle'; this.x = this.ox; this.y = this.oy; this.fallV = 0; } }
  }
  get solidOnly() { return this.state === 'fall' || this.state === 'gone'; }
  draw(ctx, world) { if (this.state !== 'gone') world.drawPlatform?.(ctx, this, true); }
}

/** 장식 광원 'L' */
export class Lamp extends Entity {
  constructor(tx, ty) { super(tx * TILE + 16, ty * TILE + 8, 16, 24); this.kind = 'decor'; this.z = -1; }
  lights(L) { L.add(this.cx, this.cy, 140, '#ffb060', 0.85); }
  draw(ctx, world) {
    const img = assets.get('props/prop_torch');
    if (img) { ctx.drawImage(img, this.cx - 24, this.cy - 30, 48, 64); drawFlame(ctx, this.cx, this.cy - 16, 0.8, world.time + this.x); return; }
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(this.cx - 3, this.cy, 6, 14);
    drawFlame(ctx, this.cx, this.cy + 2, 0.9, world.time + this.x);
  }
}

/** 스토리 트리거 '!' — 지나가면 대사 재생 (한 번) */
export class StoryTrigger extends Entity {
  constructor(tx, ty, scriptId, flagKey) { super(tx * TILE, 0, TILE, 99999); this.kind = 'trigger'; this.scriptId = scriptId; this.flagKey = flagKey; }
  update(dt, world) {
    const p = world.player;
    if (!p || this.dead) return;
    if (p.cx > this.x && p.cx < this.x + this.w) {
      this.dead = true;
      world.playScript(this.scriptId, this.flagKey);
    }
  }
}

/** NPC 'N' — ▲ 로 대화 */
export class NPC extends Entity {
  constructor(tx, ty, npcId, def) {
    super(tx * TILE, (ty + 1) * TILE - 84, 40, 84);
    this.kind = 'npc'; this.npcId = npcId; this.def = def || {}; this.z = 2; this.facing = -1;
  }
  update(dt, world) {
    this.t += dt;
    const p = world.player;
    this.near = p && Math.abs(p.cx - this.cx) < 60 && Math.abs(p.bottom - this.bottom) < 30;
    if (p) this.facing = Math.sign(p.cx - this.cx) || this.facing;
    if (this.near && input.pressed('up')) world.talkTo(this);
  }
  lights(L) { L.add(this.cx, this.cy, 90, '#ffd9a0', 0.5); }
  draw(ctx, world) {
    world.drawNPC?.(ctx, this);
    if (this.near && !world.cutscene) text(ctx, '▲ 대화', this.cx, this.y - 12, { size: 13, align: 'center', color: '#ffe7a0', weight: 700 });
  }
}
