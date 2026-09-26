// 적 엔티티 (일반 몬스터). 보스는 game/bosses/boss.js 의 Boss 를 사용.
// 적 정의(data/enemies.js ENEMIES[id]) 스키마:
// { id, name, lv(기준레벨), hp, atk, def, res, exp, gold:[min,max], score,
//   size:{w,h}, ai:'walker'|..., aiParams:{...}, render:'skeleton'|..., palette:{...},
//   flying:false, gravity:1, speed: px/s, contact: 접촉 피해 배율(0=없음), kbResist:0~1,
//   material:'flesh'|'bone'|'metal'|'ghost'|'stone'|'slime'|'paper'|'ice'|'fire',
//   weak:['holy'], resist:['dark'], immune:[], drops:[{id:'baseId'|'heart'|'gold'|'food'|'mp', p:확률, qty}],
//   sfxDie:'enemy_die', desc:'도감 설명', elite:false(정예 불가시 false) }
import { Entity } from './entity.js';
import { moveBody, isSolidType } from '../core/physics.js';
import { enemyStrike } from './combat.js';
import { ENEMIES } from '../data/enemies.js';
import { AI } from './ai.js';
import { drawEnemy } from '../render/enemies.js';
import { rand, clamp, chance } from '../core/math.js';
import { audio } from '../core/audio.js';
import { TILE } from '../core/game.js';

/** 레벨/난이도에 따른 적 능력치 */
export function enemyStats(def, level, diff, elite = false) {
  const L = Math.max(1, level ?? def.lv ?? 1);
  const k = L - 1;
  const hpMul = (1 + 0.32 * k + 0.018 * k * k) * (diff?.enemyHp ?? 1) * (elite ? 2.4 : 1);
  const atkMul = (1 + 0.16 * k + 0.006 * k * k) * (diff?.enemyAtk ?? 1) * (elite ? 1.5 : 1);
  const defMul = 1 + 0.12 * k;
  const maxHp = Math.round((def.hp ?? 20) * hpMul);
  return {
    maxHp, hp: maxHp,
    atk: Math.round((def.atk ?? 8) * atkMul),
    def: Math.round((def.def ?? 0) * defMul),
    res: Math.round((def.res ?? def.def ?? 0) * defMul),
    weak: def.weak ?? [], resist: def.resist ?? [], immune: def.immune ?? [],
    exp: Math.round((def.exp ?? 5) * (1 + 0.22 * k) * (diff?.exp ?? 1) * (elite ? 3 : 1)),
    gold: def.gold ?? [1, 5], level: L,
    crit: 0, critDmg: 0,
  };
}

export class Enemy extends Entity {
  constructor(defId, fx, fy, { level, elite = false, facing = -1, diff, params } = {}) {
    const def = ENEMIES[defId] || ENEMIES[Object.keys(ENEMIES)[0]];
    const s = elite ? 1.15 : 1;
    const w = (def.size?.w ?? 32) * s, h = (def.size?.h ?? 48) * s;
    super(fx - w / 2, fy - h, w, h);
    this.kind = 'enemy';
    this.def = def; this.id = def.id;
    this.elite = elite;
    this.scale = s;
    this.stats = enemyStats(def, level, diff, elite);
    this.hp = this.stats.hp;
    this.facing = facing;
    this.noGravity = !!def.flying;
    this.gravity = def.gravity ?? 1;
    this.speed = (def.speed ?? 80) * (diff?.enemySpeed ?? 1);
    this.aggro = diff?.aggro ?? 1;
    this.params = { ...(def.aiParams || {}), ...(params || {}) };
    this.state = 'idle'; this.stateT = 0; this.timer = 0;
    this.anim = 'idle'; this.animT = 0;
    this.flashT = 0; this.stun = 0; this.kbT = 0;
    this.invuln = false;
    this.spawnX = this.x; this.spawnY = this.y;
    this.z = 3;
    this.alpha = 1;
    this.dying = 0;
    this.ai = AI[def.ai] || AI.walker;
    this.ai.init?.(this);
  }
  hurtbox() {
    const hb = this.def.hurtbox;
    if (hb) return this.relRect(hb.x, hb.y, hb.w, hb.h);
    return { x: this.x + 2, y: this.y + 2, w: this.w - 4, h: this.h - 4 };
  }
  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }
  setAnim(a) { if (this.anim !== a) { this.anim = a; this.animT = 0; } }
  get player() { return this.world?.player; }
  distToPlayer() { const p = this.player; return p ? Math.hypot(p.cx - this.cx, p.cy - this.cy) : 1e9; }
  dxToPlayer() { const p = this.player; return p ? p.cx - this.cx : 0; }
  facePlayer() { const d = this.dxToPlayer(); if (d) this.facing = Math.sign(d); }
  /** 발밑 전방에 땅이 있는지 (낭떠러지 회피) */
  groundAhead(dist = 8) {
    const map = this.world.map;
    const x = this.facing > 0 ? this.x + this.w + dist : this.x - dist;
    const t = map.typeAt(Math.floor(x / TILE), Math.floor((this.bottom + 4) / TILE));
    return isSolidType(t) || t === 2;
  }
  wallAhead(dist = 4) {
    const map = this.world.map;
    const x = this.facing > 0 ? this.x + this.w + dist : this.x - dist;
    return isSolidType(map.typeAt(Math.floor(x / TILE), Math.floor((this.bottom - 8) / TILE)));
  }

  /** 근접 공격 판정 (발 중앙 기준 상대 사각형) */
  strike(rx, ry, rw, rh, mv = 1, extra = {}) {
    return enemyStrike(this.world, this.relRect(rx, ry, rw, rh), {
      owner: this, stats: this.stats, mv, dir: this.facing, kb: [260, -260], ...extra,
    });
  }
  /** 투사체 발사 */
  shoot(o) {
    return this.world.spawnProjectile({
      team: 'enemy', owner: this, ...o,
      attack: { stats: this.stats, mv: 1, dir: Math.sign(o.vx ?? this.facing) || this.facing, kb: [220, -200], ...(o.attack || {}) },
    });
  }

  update(dt, world) {
    this.t += dt; this.stateT += dt; this.animT += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.dying > 0) {
      this.dying -= dt;
      if (this.dying <= 0) this.dead = true;
      return;
    }
    if (world.timeStop > 0 && !this.def.ignoreTimeStop) { return; }
    if (this.stun > 0) {
      this.stun -= dt;
      if (!this.noGravity || this.kbT > 0) {
        this.kbT -= dt;
        if (this.noGravity) { this.x += this.vx * dt; this.y += this.vy * dt; this.vx *= 0.9; this.vy *= 0.9; }
        else { moveBody(this, dt, world.map, world.platforms); this.vx *= this.onGround ? 0.82 : 0.98; }
      }
    } else {
      this.ai.update(this, world, dt);
      if (!this.noGravity) moveBody(this, dt, world.map, world.platforms);
      else if (!this.def.phase) {
        // 비행체: 단순 벽 충돌
        const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
        if (!isSolidType(world.map.typeAtPx(nx + this.w / 2, ny + this.h / 2))) { this.x = nx; this.y = ny; }
        else { this.vx *= -0.5; this.vy *= -0.5; }
      } else { this.x += this.vx * dt; this.y += this.vy * dt; }
    }
    // 접촉 피해
    if ((this.def.contact ?? 1) > 0 && !this.harmless) {
      const hb = this.hurtbox();
      enemyStrike(world, hb, { owner: this, stats: this.stats, mv: this.def.contact ?? 1, dir: Math.sign(world.player?.cx - this.cx) || 1, kb: [260, -280], tags: ['contact'] });
    }
    // 낙사
    if (this.y > world.map.pxH + 200) { this.dead = true; }
  }

  takeHit(dmg, attack, world, info) {
    if (this.dying > 0) return false;
    this.hp -= dmg;
    this.flashT = 0.12;
    this.ai.onHit?.(this, world, attack, info);
    const kbRes = this.def.kbResist ?? 0;
    if (kbRes < 1) {
      const kb = attack.kb || [180, -120];
      const m = 1 - kbRes;
      this.vx = (attack.dir || 1) * kb[0] * m;
      if (!this.noGravity) this.vy = Math.min(this.vy, (attack.launch ? kb[1] * 1.4 : kb[1] * 0.6) * m);
      else this.vy = kb[1] * 0.3 * m;
      this.kbT = 0.2;
      this.stun = Math.max(this.stun, (attack.stun ?? 0.22) * m);
    }
    if (this.hp <= 0) { this.die(world, attack); return true; }
    return false;
  }

  die(world, attack) {
    this.hp = 0;
    this.dying = this.def.dieTime ?? 0.35;
    this.invuln = true;
    audio.sfx(this.def.sfxDie || 'enemy_die', { pitch: rand(0.9, 1.1) });
    world.onEnemyKilled(this, attack);
    this.ai.onDie?.(this, world);
    // 클래식 불꽃 소멸 연출
    const fx = world.fx;
    fx.burst('fire', this.cx, this.cy, 10, { speed: 140, jitter: this.w * 0.3 });
    fx.burst('ember', this.cx, this.cy, 12, { speed: 160 });
    if (this.def.material === 'bone') world.spawnBones?.(this);
    else if (this.def.material === 'metal') world.spawnDebris?.(this, '#7a7a88', 6);
    else if (this.def.material === 'stone') world.spawnDebris?.(this, '#77706a', 7);
    else if (this.def.material === 'ghost') fx.burst('soul', this.cx, this.cy, 16, { speed: 120 });
    else fx.burst('blood', this.cx, this.cy, 14, { speed: 260 });
  }

  lights(L) {
    if (this.def.light) L.add(this.cx, this.cy, this.def.light.r ?? 60, this.def.light.color ?? '#ff8040', this.def.light.i ?? 0.7);
    if (this.elite) L.add(this.cx, this.cy, 70, '#ff3050', 0.5);
  }

  draw(ctx, world) {
    ctx.save();
    const a = this.dying > 0 ? clamp(this.dying / (this.def.dieTime ?? 0.35), 0, 1) : 1;
    ctx.globalAlpha = a * this.alpha;
    if (this.elite) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(this.cx, this.cy, 4, this.cx, this.cy, Math.max(this.w, this.h));
      g.addColorStop(0, 'rgba(255,40,70,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(this.cx - this.w * 1.5, this.cy - this.h * 1.5, this.w * 3, this.h * 3);
      ctx.restore();
    }
    drawEnemy(ctx, this, world);
    ctx.restore();
    if (world.game.debug) {
      const hb = this.hurtbox();
      ctx.strokeStyle = '#0ff'; ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
    }
  }
}
