// 추가 AI 행동 B (스테이지 7~13 적): AI_B[name] = { init, update, onHit?, onDie? }
// 규칙: 모든 공격은 예비동작(애니메이션 + 반짝임/경고 장판)을 거친 뒤 발동. 쿨다운은 e.aggro(난이도 공격성) 배율로 감소.
// 렌더 계약: e.anim / e.animT 로 자세를 고르고, 추가 상태(e.aimA, e.comboI, e.rot 등)는 render/enemies_b.js 가 읽는다.
// 주의: ai.js 와 순환 import — AI 는 함수 안에서만 사용한다. (init 시점엔 e.world 가 아직 없음)
import { AI } from './ai.js';
import { rand, chance, clamp, lerp, angleTo, TAU } from '../core/math.js';
import { audio } from '../core/audio.js';
import { isSolidType, T } from '../core/physics.js';
import { TILE } from '../core/game.js';
import { enemyStrike } from './combat.js';
import { Entity } from './entity.js';
import { PROJ_B, ZONE_B } from '../render/enemies_b.js';

let _zid = 0;
const PI = Math.PI;
/** 전역 고유 타격 ID (같은 ID 로는 대상당 1회만 맞으므로 개체·공격마다 새로 발급) */
const nid = () => 'b' + (++_zid);

// ───────────────────────── 지속 판정 영역 (경고 → 발동) ─────────────────────────
/** 적 전용 장판/기둥/광선. delay 동안은 경고만(피해 없음), 이후 life 동안 판정.
 *  opts: {x,y,w,h, delay, life, attack, render(ctx,z,world), tick(z,world,dt), follow(z,world,dt), light, noHit, hitTest(z,world)→bool, onExpire} */
export class Zone extends Entity {
  constructor(o) {
    super(o.x, o.y, o.w, o.h);
    this.kind = 'hitbox';
    this.team = 'enemy';
    this.delay = 0; this.life = 0.3; this.noHit = false;
    this.renderFn = o.render ?? null;
    this.tickFn = o.tick ?? null;
    this.followFn = o.follow ?? null;
    this.hitTest = o.hitTest ?? null;
    this.onExpire = o.onExpire ?? null;
    this.light = o.light ?? null;
    this.owner = o.owner ?? null;
    this.data = o.data ?? {};
    this.delay = o.delay ?? 0; this.life = o.life ?? 0.3; this.noHit = !!o.noHit;
    this.maxLife = this.life;
    this.attack = { team: 'enemy', hitId: 'zb' + (++_zid), tags: ['magic'], dir: 1, kb: [200, -320], ...(o.attack || {}) };
    this.z = o.z ?? 6;
  }
  get active() { return this.t >= this.delay; }
  /** 0→1 경고 진행도 */
  get warnK() { return this.delay > 0 ? clamp(this.t / this.delay, 0, 1) : 1; }
  /** 발동 후 0→1 */
  get liveK() { return this.t < this.delay ? 0 : clamp((this.t - this.delay) / this.maxLife, 0, 1); }
  update(dt, world) {
    if (world.timeStop > 0) return;
    this.t += dt;
    this.followFn?.(this, world, dt);
    this.tickFn?.(this, world, dt);
    if (this.dead) return;
    if (this.t < this.delay) return;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; this.onExpire?.(this, world); return; }
    if (this.noHit) return;
    const p = world.player;
    if (!p || p.dead) return;
    if (this.hitTest) { if (this.hitTest(this, world)) enemyStrike(world, p.hurtbox(), this.attack); }
    else enemyStrike(world, { x: this.x, y: this.y, w: this.w, h: this.h }, this.attack);
  }
  lights(L) {
    if (!this.light) return;
    const k = this.active ? 1 : 0.35 * this.warnK;
    if (k > 0.02) L.add(this.cx, this.cy, this.light.r ?? 80, this.light.color ?? '#fff', (this.light.i ?? 0.8) * k);
  }
  draw(ctx, world) {
    if (this.renderFn) this.renderFn(ctx, this, world);
    if (world?.game?.debug && this.active) { ctx.strokeStyle = '#f0f'; ctx.strokeRect(this.x, this.y, this.w, this.h); }
  }
}

// ───────────────────────── 공용 도우미 ─────────────────────────
function ensureMag(e) { if (e.stats.mag == null) e.stats.mag = e.stats.atk; }
function atk(e, mv, extra) { ensureMag(e); return { owner: e, stats: e.stats, mv, dir: e.facing, ...extra }; }
function hover(e, tx, ty, accel, dt, maxSp) {
  const dx = tx - e.cx, dy = ty - e.cy, d = Math.hypot(dx, dy) || 1;
  const sp = Math.min(maxSp, d * 3);
  const k = Math.min(1, accel * dt);
  e.vx += (dx / d * sp - e.vx) * k;
  e.vy += (dy / d * sp - e.vy) * k;
}
function seesP(e, p, sight, dy = 170) { return !!p && !p.dead && Math.abs(p.cx - e.cx) < sight && Math.abs(p.cy - e.cy) < dy; }
function faceP(e) { const d = e.dxToPlayer(); if (Math.abs(d) > 3) e.facing = Math.sign(d); }
function canMove(e, dir) {
  if (!e.onGround) return true;
  const f = e.facing; e.facing = dir;
  const ok = e.groundAhead() && !e.wallAhead();
  e.facing = f;
  return ok;
}
/** 지상 추격 (낭떠러지·벽 앞에서 정지) */
function chase(e, dir, sp) {
  e.vx = dir * sp;
  if (e.onGround && !canMove(e, dir)) e.vx = 0;
}
function patrol(e, mul = 0.6) {
  e.vx = e.facing * e.speed * mul;
  if (e.onGround && (!e.groundAhead() || e.wallAhead())) e.facing *= -1;
}
function solidAt(world, x, y) { return isSolidType(world.map.typeAtPx(x, y)); }
/** 아래쪽 첫 지면(고체/발판) 윗면 y */
function groundTop(world, x, y, maxDist = 520) {
  const m = world.map;
  const tx = Math.floor(x / TILE);
  for (let ty = Math.floor(y / TILE), n = 0; n < maxDist / TILE; ty++, n++) {
    const t = m.typeAt(tx, ty);
    if (isSolidType(t) || t === T.ONEWAY) return ty * TILE;
    if (ty >= m.h) return null;
  }
  return null;
}
/** 발 위치 근처의 액체 수면 y (없으면 null) */
function liquidTop(world, x, y, depth = 5) {
  const m = world.map;
  const tx0 = Math.floor(x / TILE);
  for (const tx of [tx0, tx0 - 1, tx0 + 1]) {
    let ty = Math.floor(y / TILE) - 1;
    for (let i = 0; i < depth + 1; i++, ty++) {
      const t = m.typeAt(tx, ty);
      if (t === T.LIQUID) { let top = ty; while (m.typeAt(tx, top - 1) === T.LIQUID) top--; return top * TILE; }
      if (isSolidType(t)) break;
    }
  }
  return null;
}
const isLiquidPx = (world, x, y) => world.map.typeAtPx(x, y) === T.LIQUID;
/** 포물선 투척 수평속도: 초기 vy0(음수), 중력 g(px/s²) 으로 (dx,dy) 에 도달 */
function arcVx(dx, dy, vy0, g, maxVx = 520) {
  const disc = vy0 * vy0 + 2 * g * dy;
  const t = disc > 0 ? (-vy0 + Math.sqrt(disc)) / g : 0.8;
  return clamp(dx / Math.max(0.28, t), -maxVx, maxVx);
}
/** 광선 길이: (x,y) 에서 각도 a 로 벽에 닿을 때까지 */
function rayLen(world, x, y, a, max = 900) {
  const cx = Math.cos(a), cy = Math.sin(a);
  for (let d = 20; d < max; d += 12) if (solidAt(world, x + cx * d, y + cy * d)) return d;
  return max;
}
/** 점-선분 거리 */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
  const u = clamp(((px - x1) * dx + (py - y1) * dy) / L, 0, 1);
  return Math.hypot(px - (x1 + dx * u), py - (y1 + dy * u));
}
function addZone(world, o) { const z = new Zone(o); world.add(z); return z; }
/** 부유형 선회 방향: 목표 지점이 맵 밖이거나 벽 속이면 반대쪽으로 */
function sideFor(e, world, p, keep, dy = -110) {
  const ok = (sd) => { const x = p.cx + sd * keep, y = p.bottom + dy; return x > 30 && x < world.map.pxW - 30 && !solidAt(world, x, y); };
  if (!ok(e.side) && ok(-e.side)) e.side = -e.side;
  return e.side;
}
function puff(world, type, x, y, n, o) { world.fx.burst(type, x, y, n, o); }
/** 공중 투사체 공통 */
function bolt(e, o) {
  ensureMag(e);
  return e.shoot({ life: 3, ...o, attack: { mv: 1, type: 'mag', ...(o.attack || {}) } });
}

export const AI_B = {};

// ═════════════════════════ s07 연금술 연구소 ═════════════════════════
/** 연금 슬라임: 웅크렸다 튀어오름, 큰 개체는 죽을 때 둘로 분열 */
AI_B.slime = {
  init(e) { e.cool = rand(0.4, 1.2); e.setState('idle'); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'squash':
        e.vx *= 0.7; e.setAnim('squash');
        if (e.stateT > (P.hop ?? 0.36)) {
          const dx = p ? p.cx - e.cx : e.facing * 100;
          e.vx = clamp(dx * 1.4, -300, 300) * (P.small ? 1.15 : 1);
          e.vy = -rand(540, 700) * (P.small ? 0.85 : 1);
          e.setState('air'); e.setAnim('jump');
          audio.sfx('jump', { vol: 0.2, pitch: 0.6 });
        }
        return;
      case 'air':
        e.setAnim('jump');
        if (e.onGround && e.stateT > 0.08) {
          e.setState('land'); e.setAnim('land'); e.vx = 0;
          puff(world, 'blood', e.cx, e.bottom - 4, 6, { color: '#7aff5a', angle: -PI / 2, spread: 1.2, speed: 160 });
          audio.sfx('land', { vol: 0.25, pitch: 1.5 });
        }
        return;
      case 'land':
        e.vx *= 0.6;
        if (e.stateT > 0.22) { e.setState('idle'); e.cool = (P.rate ?? 0.9) * rand(0.7, 1.2); }
        return;
      default:
        e.setAnim('idle');
        if (seesP(e, p, P.sight ?? 460) && e.onGround) {
          faceP(e);
          e.vx = e.facing * e.speed * 0.4;
          if (!canMove(e, e.facing)) e.vx = 0;
          if (e.cool <= 0) { e.setState('squash'); e.vx = 0; }
        } else patrol(e, 0.35);
    }
  },
  onDie(e, world) {
    const P = e.params;
    if (P.small || !(P.split > 0)) return;
    for (let i = 0; i < P.split; i++) {
      const k = world.spawnEnemy(e.def.id, e.cx, e.bottom, { params: { small: true, split: 0 }, facing: i ? 1 : -1, elite: false });
      if (!k) continue;
      const s = 0.62, bx = k.cx, by = k.bottom;
      k.scale = s; k.w = k.def.size.w * s; k.h = k.def.size.h * s;
      k.cx = bx; k.bottom = by - 6;
      k.stats.maxHp = k.stats.hp = k.hp = Math.max(1, Math.round(k.stats.maxHp * 0.35));
      k.stats.exp = Math.round(k.stats.exp * 0.3);
      k.vx = (i ? 1 : -1) * rand(140, 220); k.vy = -rand(380, 480);
      k.setState('air'); k.cool = 0.6;
    }
  },
};

/** 호문쿨루스: 불규칙하게 기어오다 몸을 낮추고 덮침 */
AI_B.pouncer = {
  init(e) { e.cool = rand(0.5, 1.2); e.twitch = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'crouch':
        e.vx *= 0.6; e.setAnim('crouch');
        if (e.stateT > (P.crouch ?? 0.38)) {
          const adx = Math.abs(e.dxToPlayer());
          e.vx = e.facing * clamp(adx * 1.9, 220, P.maxVx ?? 460);
          e.vy = -(P.jumpV ?? 620) * (p && p.cy < e.cy - 50 ? 1.2 : 1);
          e.setState('leap'); e.setAnim('leap');
          audio.sfx('bat', { vol: 0.35, pitch: 1.8 });
        }
        return;
      case 'leap':
        e.setAnim('leap');
        if (e.stateT > 0.05) e.strike(-6, -44, 36, 40, 1.2, { hitId: e.hid });
        if (e.onGround && e.stateT > 0.1) { e.setState('land'); e.setAnim('land'); e.vx *= 0.3; }
        return;
      case 'land':
        e.vx *= 0.75;
        if (e.stateT > 0.35) { e.setState('walk'); e.cool = (P.rate ?? 1.1) * rand(0.8, 1.3); }
        return;
    }
    if (seesP(e, p, P.sight ?? 480)) {
      faceP(e);
      const adx = Math.abs(e.dxToPlayer());
      if (adx < 250 && e.cool <= 0 && e.onGround) { e.setState('crouch'); e.hid = nid(); e.vx = 0; return; }
      // 경련하듯 멈칫거리며 전진
      e.twitch -= dt;
      if (e.twitch <= 0) { e.twitch = rand(0.25, 0.7); e.pause = chance(0.28); }
      const sp = e.pause ? 0 : e.speed * (adx < 120 ? 0.35 : 1) * (1 + 0.35 * Math.sin(e.t * 11));
      chase(e, e.facing, sp);
    } else patrol(e, 0.4);
    e.setAnim(Math.abs(e.vx) > 8 ? 'walk' : 'idle');
  },
};

/** 대형 강타형 (육체 골렘 / 얼음 골렘): 느린 추격 → 두 팔 내려찍기 + 지면 충격파/얼음 가시 */
AI_B.brute = {
  init(e) { e.cool = rand(0.8, 1.6); e.facing = chance(0.5) ? 1 : -1; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    if (e.state === 'slam') {
      e.vx *= 0.7; e.setAnim('slam');
      const wu = P.windup ?? 0.75;
      if (e.stateT > wu && !e.did) {
        e.did = true;
        const reach = P.melee ?? 110;
        e.strike(0, -80, reach + 14, 80, 1.9, { kb: [420, -520], hitstop: 0.1 });
        const gx = e.cx + e.facing * (reach * 0.7), gy = e.bottom;
        world.camera.shake(9, 0.3);
        audio.sfx('hit_heavy', { pitch: 0.6 }); audio.sfx('explode', { vol: 0.5, pitch: 0.7 });
        world.fx.ring(gx, gy - 4, { color: P.wave === 'spikes' ? '#bff4ff' : '#c8ffa0', r0: 8, r1: 90, life: 0.3, width: 6 });
        puff(world, 'dust', gx, gy - 6, 12, { speed: 200 });
        puff(world, P.wave === 'spikes' ? 'ice' : 'shard', gx, gy - 6, 10, { angle: -PI / 2, spread: 1.2, speed: 380, color: P.wave === 'spikes' ? '#bff4ff' : '#6a5a4a' });
        if (P.wave === 'spikes') {
          for (let i = 0; i < 6; i++) {
            const x = e.cx + e.facing * (reach * 0.8 + i * 50);
            const top = groundTop(world, x, e.bottom - 30, 120);
            if (top == null || Math.abs(top - e.bottom) > 50) break;
            addZone(world, { x: x - 18, y: top - 92, w: 36, h: 92, delay: 0.18 + i * 0.09, life: 0.42, owner: e, render: ZONE_B.icespike, light: { r: 70, color: '#9fe8ff', i: 0.6 }, data: { seed: rand(0, 99) },
              attack: atk(e, 1.35, { element: 'ice', type: 'mag', kb: [140, -600], hitId: e.hid }) });
          }
          ensureMag(e);
        } else {
          for (const d of [1, -1]) {
            const pr = e.shoot({ x: gx, y: gy - 16, vx: d * e.facing * 420, vy: 0, w: 34, h: 30, render: PROJ_B.fleshwave, color: '#b8ff90', life: 0.9, collideWalls: true,
              attack: { mv: 1.1, kb: [200, -420] } });
            pr.fadeOut = true;
          }
        }
      }
      if (e.stateT > wu + 0.75) { e.setState('walk'); e.cool = (P.rate ?? 1.7) * rand(0.85, 1.2); }
      return;
    }
    const adx = Math.abs(e.dxToPlayer());
    if (seesP(e, p, P.sight ?? 440, 180)) {
      faceP(e);
      if (e.onGround && e.cool <= 0 && (adx < (P.melee ?? 110) || (adx < 330 && e.cool < -1.2))) {
        e.setState('slam'); e.did = false; e.hid = nid(); e.vx = 0;
        audio.sfx('boss_roar', { vol: 0.25, pitch: 1.5 });
        return;
      }
      chase(e, e.facing, adx < 70 ? 0 : e.speed * (P.chaseMul ?? 1.1));
    } else patrol(e, 0.5);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
    if (e.anim === 'walk' && e.onGround) {
      e.stepT = (e.stepT ?? 0) - dt;
      if (e.stepT <= 0) { e.stepT = 0.55; world.camera.shake(1.5, 0.08); puff(world, 'dust', e.cx, e.bottom - 2, 2, { speed: 40 }); }
    }
  },
};

/** 역병 의사: 거리 유지, 플라스크 포물선 투척 → 독 웅덩이. 가까우면 연막 백스텝 */
AI_B.plague = {
  init(e) { e.cool = rand(0.8, 1.6); e.hopCool = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro; e.hopCool -= dt;
    const dx = e.dxToPlayer(), adx = Math.abs(dx);
    if (e.state === 'throw') {
      e.vx = 0; e.setAnim('throw');
      if (e.stateT > (P.windup ?? 0.5) && !e.thrown) {
        e.thrown = true;
        const sx = e.cx + e.facing * 8, sy = e.bottom - 70;
        const vy0 = -rand(560, 640), g = 2000 * 0.9;
        const vx = arcVx(p.cx - sx, p.bottom - 10 - sy, vy0, g, 480);
        e.shoot({ x: sx, y: sy, vx, vy: vy0, w: 16, h: 16, behavior: 'arc', gravity: 0.9, collideWalls: 'land', render: PROJ_B.flask, spin: 12 * e.facing, life: 3,
          attack: { mv: 0.8, type: 'mag' },
          onLand: (pr, w) => { pr.dead = true; poisonPool(w, e, pr.cx, pr.bottom); },
          onExpire: (pr, w, byHit) => { if (byHit) puff(w, 'blood', pr.cx, pr.cy, 8, { color: '#8aff5a' }); } });
        audio.sfx('dagger', { vol: 0.4, pitch: 0.8 });
      }
      if (e.stateT > (P.windup ?? 0.5) + 0.45) { e.setState('idle'); e.cool = (P.rate ?? 2.2) * rand(0.85, 1.2); }
      return;
    }
    if (e.state === 'hop') {
      e.setAnim('hop');
      if (e.onGround && e.stateT > 0.12) { e.setState('idle'); e.cool = Math.min(e.cool, 0.35); }
      return;
    }
    faceP(e);
    if (adx < 120 && e.hopCool <= 0 && e.onGround && canMove(e, -e.facing)) {
      e.setState('hop'); e.hopCool = 2.4;
      e.vx = -e.facing * 280; e.vy = -430;
      puff(world, 'smoke', e.cx, e.bottom - 30, 10, { color: '#5a7a4a', speed: 80 });
      audio.sfx('mist', { vol: 0.4 });
      return;
    }
    if (adx < (P.range ?? 520) && e.cool <= 0 && Math.abs(p.cy - e.cy) < 260) { e.setState('throw'); e.thrown = false; return; }
    const keep = P.keep ?? 250;
    if (adx < keep * 0.7) chase(e, -e.facing, e.speed);
    else if (adx > keep * 1.4 && adx < 600) chase(e, e.facing, e.speed);
    else e.vx = 0;
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};
function poisonPool(world, e, x, y) {
  const top = groundTop(world, x, y - 10, 100) ?? y;
  audio.sfx('break_wall', { vol: 0.3, pitch: 1.8 });
  puff(world, 'blood', x, top - 6, 10, { color: '#8aff5a', angle: -PI / 2, spread: 1.3, speed: 220 });
  puff(world, 'smoke', x, top - 10, 5, { color: '#4a8a3a', speed: 40 });
  addZone(world, { x: x - 52, y: top - 26, w: 104, h: 26, delay: 0.05, life: 2.4, owner: e, render: ZONE_B.poison, light: { r: 70, color: '#8aff5a', i: 0.45 },
    attack: atk(e, 0.55, { type: 'mag', rehit: 0.6, kb: [80, -260], hitId: 'pp' + (++_zid) }) });
}

/** 산성 증류기: 고정 포탑. 끓어오름(예비동작) → 산성 방울 3발 포물선 → 산성 웅덩이 */
AI_B.distiller = {
  init(e) { e.cool = rand(1, 2); ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.vx = 0;
    if (!p) return;
    e.cool -= dt * e.aggro;
    if (e.state === 'charge') {
      e.setAnim('charge');
      if (e.stateT > (P.charge ?? 0.8)) {
        e.setState('fire'); e.setAnim('fire');
        const n = P.count ?? 3;
        const sx = e.cx + e.facing * 6, sy = e.bottom - e.def.size.h + 6;
        for (let i = 0; i < n; i++) {
          const vy0 = -rand(600, 700), g = 2000 * 0.85;
          const k = 0.75 + i * 0.25;
          const vx = arcVx((p.cx - sx) * k, p.bottom - sy, vy0, g, 460);
          e.shoot({ x: sx, y: sy, vx, vy: vy0, w: 14, h: 14, behavior: 'arc', gravity: 0.85, collideWalls: 'land', render: PROJ_B.acid, life: 3,
            attack: { mv: 0.85, type: 'mag' },
            onLand: (pr, w) => { pr.dead = true; acidPuddle(w, e, pr.cx, pr.bottom); } });
        }
        puff(world, 'blood', sx, sy, 12, { color: '#b0ff4a', angle: -PI / 2, spread: 0.8, speed: 260 });
        puff(world, 'smoke', sx, sy, 6, { color: '#5a8a3a', speed: 60 });
        audio.sfx('splash', { vol: 0.5, pitch: 1.3 });
      }
      return;
    }
    if (e.state === 'fire') { if (e.stateT > 0.5) { e.setState('idle'); e.cool = (P.rate ?? 2.6) * rand(0.9, 1.15); } return; }
    faceP(e);
    e.setAnim('idle');
    if (e.cool <= 0 && e.distToPlayer() < (P.range ?? 600)) { e.setState('charge'); audio.sfx('charge_ready', { vol: 0.25, pitch: 0.6 }); }
  },
};
function acidPuddle(world, e, x, y) {
  const top = groundTop(world, x, y - 10, 100) ?? y;
  puff(world, 'blood', x, top - 4, 6, { color: '#b0ff4a', angle: -PI / 2, spread: 1.2, speed: 180 });
  addZone(world, { x: x - 30, y: top - 18, w: 60, h: 18, delay: 0.02, life: 1.6, owner: e, render: ZONE_B.acid,
    attack: atk(e, 0.5, { type: 'mag', rehit: 0.6, kb: [60, -240], hitId: 'ap' + (++_zid) }) });
}

// ═════════════════════════ s08 지하 수로 ═════════════════════════
/** 어인: 물속에 잠복 → 뛰어오름 → 지상에서 뺨을 부풀려 불덩이. 물이 없으면 지상형 */
AI_B.merman = {
  init(e) { e.cool = rand(0.8, 1.8); e.water = null; e.inited = false; },
  sink(e, top) {
    e.water = top; e.setState('lurk'); e.setAnim('lurk');
    e.noGravity = true; e.invuln = true; e.harmless = true; e.vx = 0; e.vy = 0;
    e.y = top + 14; e.cool = rand(0.8, 1.6); e.poolX = e.cx; e.landT = 0;
  },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!e.inited) {
      e.inited = true;
      const top = liquidTop(world, e.cx, e.bottom);
      if (top != null) this.sink(e, top); else e.setState('walk');
    }
    e.cool -= dt * e.aggro;
    const dx = e.dxToPlayer(), adx = Math.abs(dx);
    switch (e.state) {
      case 'lurk': {
        e.setAnim('lurk'); e.vy = 0;
        e.y = e.water + 14 + Math.sin(e.t * 2) * 2;
        if (p) {
          // 수면 아래를 따라 이동 (액체 칸 안에서만)
          const want = clamp(dx, -1, 1) * e.speed * 0.8;
          const nx = e.cx + Math.sign(want) * 20;
          e.vx = isLiquidPx(world, nx, e.water + 10) || isLiquidPx(world, nx, e.water + 58) ? want : 0;
          e.x += e.vx * dt;
          if (adx < (P.sight ?? 420) && e.cool <= 0 && Math.abs(p.bottom - e.water) < 300) { e.setState('rise'); audio.sfx('splash', { vol: 0.3, pitch: 1.4 }); }
        }
        return;
      }
      case 'rise':
        e.setAnim('rise'); e.vx = 0; e.y = e.water + 14 - e.stateT * 10;
        if (Math.random() < 0.35) world.fx.emit('water', e.cx + rand(-14, 14), e.water + 4, { angle: -PI / 2, spread: 0.4, speed: 160 });
        if (e.stateT > 0.5) {
          faceP(e);
          e.noGravity = false; e.invuln = false; e.harmless = false;
          e.vy = -rand(980, 1080); e.vx = e.leapVx = (Math.sign(dx) || e.facing) * clamp(Math.abs(dx) * 0.9, 150, 260);
          e.setState('leap'); e.setAnim('leap');
          puff(world, 'water', e.cx, e.water + 2, 24, { angle: -PI / 2, spread: 0.7, speed: 420 });
          world.fx.ring(e.cx, e.water + 6, { color: '#8ad0ff', r0: 6, r1: 60, life: 0.35, width: 4 });
          audio.sfx('splash', { vol: 0.8 });
        }
        return;
      case 'leap':
        e.setAnim(e.vy < 0 ? 'leap' : 'fall');
        if (!e.onGround) e.vx = e.leapVx ?? e.vx; // 물 밑 바닥에 걸려 수평 속도를 잃지 않도록
        if (e.vy > 0 && isLiquidPx(world, e.cx, e.bottom - 6)) {
          const top = liquidTop(world, e.cx, e.bottom - 6);
          if (top != null) { puff(world, 'water', e.cx, top + 2, 14, { angle: -PI / 2, spread: 0.8, speed: 300 }); audio.sfx('splash', { vol: 0.5 }); this.sink(e, top); return; }
        }
        if (e.onGround && e.stateT > 0.1) { e.setState('walk'); e.cool = Math.max(e.cool, 0.5); puff(world, 'water', e.cx, e.bottom - 10, 6, {}); }
        return;
      case 'spit': {
        e.vx = 0; e.setAnim('spit');
        const wu = P.spit ?? 0.5;
        if (e.stateT > wu && !e.did) {
          e.did = true;
          const my = e.bottom - 66;
          bolt(e, { x: e.cx + e.facing * 16, y: my, vx: e.facing * 330, vy: 0, w: 16, h: 16, render: 'fireball', color: '#ff7a2a', trail: 'ember', light: { r: 60, color: '#ff8a3a' },
            attack: { mv: 1.1, element: 'fire' } });
          audio.sfx('fire', { vol: 0.5 });
        }
        if (e.stateT > wu + 0.4) { e.setState('walk'); e.cool = (P.rate ?? 2.2) * rand(0.8, 1.2); }
        return;
      }
    }
    // 지상
    if (isLiquidPx(world, e.cx, e.bottom - 8)) { const top = liquidTop(world, e.cx, e.bottom - 8); if (top != null) { this.sink(e, top); return; } }
    e.landT = (e.landT ?? 0) + dt;
    if (e.landT > 7 && e.poolX !== undefined && e.onGround) {
      // 오래 뭍에 있으면 물로 돌아간다
      e.facing = Math.sign(e.poolX - e.cx) || e.facing;
      e.vx = e.facing * e.speed * 1.2;
      if (e.wallAhead() && e.onGround) e.vy = -560;
    } else if (seesP(e, p, P.sight ?? 420, 140)) {
      faceP(e);
      if (e.cool <= 0 && e.onGround) { e.setState('spit'); e.did = false; return; }
      chase(e, e.facing, adx > 140 ? e.speed : 0);
    } else patrol(e, 0.5);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

/** 살인 물고기: 수면 아래 추적 → 파문(예비동작) → 포물선 도약 */
AI_B.fishleap = {
  init(e) { e.cool = rand(0.3, 1.2); e.inited = false; e.noGravity = true; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!e.inited) {
      e.inited = true;
      const top = liquidTop(world, e.cx, e.bottom);
      e.baseY = top ?? e.bottom;
      // 수조 좌우 범위 (수면 줄의 액체 칸)
      if (top != null) {
        const ty = Math.floor((top + 4) / TILE);
        let l = Math.floor(e.cx / TILE), r = l;
        while (l > 0 && world.map.typeAt(l - 1, ty) === T.LIQUID) l--;
        while (r < world.map.w - 1 && world.map.typeAt(r + 1, ty) === T.LIQUID) r++;
        e.poolL = l * TILE + 8; e.poolR = (r + 1) * TILE - 8;
      } else { e.poolL = e.cx - 160; e.poolR = e.cx + 160; }
      e.y = e.baseY + 6; e.setState('under');
      e.invuln = true; e.harmless = true;
    }
    e.cool -= dt * e.aggro;
    const dx = e.dxToPlayer();
    switch (e.state) {
      case 'under':
        e.setAnim('swim'); e.vy = 0; e.y = e.baseY + 6 + Math.sin(e.t * 3) * 2;
        e.vx += (clamp(dx, -1, 1) * e.speed * 0.7 - e.vx) * Math.min(1, 2 * dt);
        if ((e.cx < e.poolL && e.vx < 0) || (e.cx > e.poolR && e.vx > 0)) e.vx = 0;
        if (Math.abs(e.vx) > 5) e.facing = Math.sign(e.vx);
        if (e.cool <= 0 && p && Math.abs(dx) < 440 && Math.abs(p.bottom - e.baseY) < 320) { e.setState('ripple'); e.vx *= 0.3; }
        return;
      case 'ripple':
        e.setAnim('ripple'); e.vx *= 0.9; e.vy = 0;
        if (Math.random() < 0.3) world.fx.emit('water', e.cx + rand(-10, 10), e.baseY + 2, { angle: -PI / 2, spread: 0.5, speed: 120 });
        if (e.stateT > 0.35) {
          // 정점이 플레이어 위치에 오도록 겨누되, 착수 지점은 수조 안으로 제한
          e.vy = -(P.jumpV ?? 820) * rand(0.88, 1.05);
          const air = -2 * e.vy / 2000;
          const tx = p ? p.cx + (p.vx ?? 0) * 0.25 : e.cx;
          const land = clamp(e.cx + (tx - e.cx) * 2, e.poolL, e.poolR);
          e.vx = clamp((land - e.cx) / air, -340, 340);
          e.invuln = false; e.harmless = false;
          e.setState('leap');
          puff(world, 'water', e.cx, e.baseY + 2, 14, { angle: -PI / 2, spread: 0.6, speed: 340 });
          audio.sfx('splash', { vol: 0.45, pitch: 1.3 });
        }
        return;
      case 'leap':
        e.setAnim('leap');
        e.vy += 2000 * dt;
        if (Math.abs(e.vx) > 5) e.facing = Math.sign(e.vx);
        if (e.vy > 0 && e.y > e.baseY + 2) {
          e.setState('under'); e.invuln = true; e.harmless = true; e.vy = 0; e.vx *= 0.3;
          e.cool = (P.wait ?? 0.9) * rand(0.8, 1.4);
          puff(world, 'water', e.cx, e.baseY + 2, 12, { angle: -PI / 2, spread: 0.7, speed: 260 });
          audio.sfx('splash', { vol: 0.35, pitch: 1.5 });
        }
        return;
    }
  },
};

/** 마계 개구리: 목주머니 팽창(예비동작) → 긴 혀 채찍 / 무거운 도약 */
AI_B.frog = {
  init(e) { e.cool = rand(0.6, 1.4); e.tongue = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    const L = P.tongue ?? 170;
    switch (e.state) {
      case 'swell':
        e.vx = 0; e.setAnim('swell');
        if (e.stateT > 0.45) { e.setState('tongue'); e.setAnim('tongue'); audio.sfx('whip', { vol: 0.5, pitch: 0.6 }); e.hid = nid(); }
        return;
      case 'tongue': {
        e.vx = 0; e.setAnim('tongue');
        const u = e.stateT;
        e.tongue = u < 0.12 ? (u / 0.12) * L : u < 0.28 ? L : Math.max(0, L * (1 - (u - 0.28) / 0.16));
        if (e.tongue > 20) e.strike(20, -34, e.tongue, 16, 1.25, { hitId: e.hid, kb: [-200, -200] });
        if (u > 0.46) { e.tongue = 0; e.setState('idle'); e.cool = (P.rate ?? 1.4) * rand(0.9, 1.2); }
        return;
      }
      case 'air':
        e.setAnim('jump');
        if (e.onGround && e.stateT > 0.1) {
          e.setState('land'); e.setAnim('land'); e.vx = 0;
          world.camera.shake(3, 0.12);
          puff(world, 'dust', e.cx, e.bottom - 2, 6, { speed: 120 });
          audio.sfx('land', { vol: 0.5, pitch: 0.6 });
        }
        return;
      case 'land':
        e.vx *= 0.6; if (e.stateT > 0.3) e.setState('idle');
        return;
    }
    e.setAnim('idle'); e.vx *= 0.8;
    if (!e.onGround) return;
    if (seesP(e, p, P.sight ?? 480, 200) && e.cool <= 0) {
      faceP(e);
      const adx = Math.abs(e.dxToPlayer());
      if (adx < L + 30 && Math.abs(p.cy - (e.bottom - 30)) < 50) { e.setState('swell'); audio.sfx('bat', { vol: 0.3, pitch: 0.4 }); return; }
      e.vx = clamp(e.dxToPlayer() * 1.3, -330, 330);
      e.vy = -rand(620, 760);
      e.setState('air'); e.cool = (P.rate ?? 1.4) * 0.6;
      audio.sfx('jump', { vol: 0.3, pitch: 0.5 });
    }
  },
};

/** 익사체: 물/땅에서 솟아남 → 느린 추격 → 배를 움켜쥐고 썩은 물 분사 */
AI_B.drowned = {
  init(e) { e.setState('rise'); e.harmless = true; e.cool = rand(0.6, 1.4); ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (e.state === 'rise') {
      e.setAnim('rise'); e.vx = 0;
      if (Math.random() < 0.25) world.fx.emit('water', e.cx + rand(-12, 12), e.bottom - 4, { angle: -PI / 2, spread: 0.5, speed: 140 });
      if (e.stateT > (P.riseTime ?? 1.0)) { e.setState('walk'); e.harmless = false; faceP(e); }
      return;
    }
    e.cool -= dt * e.aggro;
    if (e.state === 'spew') {
      e.vx = 0; e.setAnim('spew');
      const wu = 0.55, len = P.spew ?? 150;
      if (e.stateT > wu && e.stateT < wu + 0.6) {
        if (!e.did) { e.did = true; audio.sfx('splash', { vol: 0.7, pitch: 0.6 }); e.hid = nid(); }
        const mx = e.cx + e.facing * 12, my = e.bottom - 66;
        for (let i = 0; i < 2; i++) world.fx.emit('water', mx, my, { angle: e.facing > 0 ? 0.25 : PI - 0.25, spread: 0.18, speed: rand(380, 520), color: i ? '#6a8a6a' : '#8ab0a0' });
        e.strike(10, -76, len, 40, 0.5, { type: 'mag', rehit: 0.3, hitId: e.hid, kb: [260, -160] });
      }
      if (e.stateT > wu + 0.95) { e.setState('walk'); e.cool = (P.rate ?? 2) * rand(0.9, 1.3); }
      return;
    }
    const adx = Math.abs(e.dxToPlayer());
    if (seesP(e, p, P.sight ?? 420, 140)) {
      faceP(e);
      if (adx < (P.spew ?? 150) + 10 && e.cool <= 0 && e.onGround) { e.setState('spew'); e.did = false; return; }
      chase(e, e.facing, adx < 50 ? 0 : e.speed * 1.2);
      if (e.onGround && e.wallAhead() && adx > 50) { e.vy = -620; e.vx = e.facing * e.speed * 1.5; }
    } else patrol(e, 0.5);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

/** 물의 정령: 거리 유지 부유 → 물방울 3연 (파형) / 발밑 물기둥 */
AI_B.spirit = {
  init(e) { e.cool = rand(1, 2); e.side = chance(0.5) ? 1 : -1; e.pick = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    const keep = P.keep ?? 230;
    if (Math.abs(p.cx - e.cx) > keep * 2.2) e.side = Math.sign(e.cx - p.cx) || 1;
    sideFor(e, world, p, keep);
    const tx = p.cx + e.side * keep, ty = p.bottom - 110 + Math.sin(e.t * 1.7) * 18;
    faceP(e);
    if (e.state === 'cast') {
      e.vx *= 0.9; e.vy *= 0.9; e.setAnim('cast');
      if (e.stateT > 0.6 && !e.did) {
        e.did = true;
        for (let i = 0; i < 3; i++) {
          const pr = bolt(e, { x: e.cx + e.facing * 16, y: e.cy - 6, vx: e.facing * 250, vy: 0, w: 16, h: 16, render: PROJ_B.waterorb, behavior: 'wave', life: 3.2,
            light: { r: 50, color: '#6ad8ff', i: 0.6 }, attack: { mv: 0.85 } });
          pr.waveAmp = 150; pr.waveFreq = 6; pr.waveA = i * (TAU / 3);
        }
        audio.sfx('splash', { vol: 0.5, pitch: 1.4 }); audio.sfx('magic', { vol: 0.3 });
      }
      if (e.stateT > 1.0) { e.setState('float'); e.cool = (P.rate ?? 2.4) * rand(0.9, 1.2); }
      return;
    }
    if (e.state === 'summon') {
      e.vx *= 0.9; e.vy *= 0.9; e.setAnim('summon');
      if (e.stateT > 0.35 && !e.did) {
        e.did = true;
        const x = p.cx, top = groundTop(world, x, p.bottom - 20, 200) ?? p.bottom;
        addZone(world, { x: x - 26, y: top - 190, w: 52, h: 190, delay: 0.75, life: 0.45, owner: e, render: ZONE_B.pillar, light: { r: 90, color: '#6ad8ff', i: 0.7 },
          attack: atk(e, 1.3, { type: 'mag', kb: [120, -720], hitId: 'wp' + (++_zid) }), data: { seed: rand(0, 50) } });
        audio.sfx('splash', { vol: 0.35, pitch: 0.8 });
      }
      if (e.stateT > 0.8) { e.setState('float'); e.cool = (P.rate ?? 2.4) * rand(0.9, 1.2); }
      return;
    }
    hover(e, tx, ty, 2.2, dt, e.speed * 1.6);
    e.setAnim('float');
    if (e.cool <= 0 && e.distToPlayer() < 520) {
      e.pick = (e.pick + 1) % 3;
      e.setState(e.pick === 2 ? 'summon' : 'cast'); e.did = false;
      audio.sfx('magic', { vol: 0.25, pitch: 1.6 });
    }
  },
};

// ═════════════════════════ s09 시계탑 ═════════════════════════
/** 톱니 골렘: 피스톤 주먹(근접) / 등의 톱니를 뽑아 굴리기(원거리) */
AI_B.geargolem = {
  init(e) { e.cool = rand(0.8, 1.5); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    if (e.state === 'punch') {
      e.vx = 0; e.setAnim('punch');
      const wu = P.windup ?? 0.7;
      if (Math.random() < 0.3 && e.stateT < wu) world.fx.emit('smoke', e.cx - e.facing * 18, e.bottom - 104, { color: '#c8c0b8', speed: 40, angle: -PI / 2, spread: 0.4 });
      if (e.stateT > wu && !e.did) {
        e.did = true;
        e.vx = e.facing * 160;
        e.strike(10, -78, (P.melee ?? 118) + 14, 40, 2.0, { kb: [520, -360], hitstop: 0.1 });
        world.camera.shake(6, 0.2);
        const hx = e.cx + e.facing * ((P.melee ?? 118) + 10);
        puff(world, 'spark', hx, e.bottom - 58, 14, { color: '#ffd080', angle: e.facing > 0 ? 0 : PI, spread: 0.9 });
        puff(world, 'smoke', e.cx - e.facing * 20, e.bottom - 70, 8, { color: '#d8d0c8', speed: 120 });
        audio.sfx('clang', { pitch: 0.6 }); audio.sfx('hit_heavy', { vol: 0.5, pitch: 0.7 });
      }
      if (e.stateT > wu + 0.6) { e.setState('walk'); e.cool = (P.rate ?? 1.9) * rand(0.85, 1.2); }
      return;
    }
    if (e.state === 'throw') {
      e.vx = 0; e.setAnim('throw');
      if (e.stateT > 0.55 && !e.did) {
        e.did = true;
        const sx = e.cx + e.facing * 30, sy = e.bottom - 30;
        e.shoot({ x: sx, y: sy, vx: e.facing * 300, vy: -200, w: 30, h: 30, render: PROJ_B.cog, behavior: 'beam', life: 3.4, collideWalls: false, color: '#d8a040',
          attack: { mv: 1.2, kb: [320, -380] }, rolling: true, follow: rollCog });
        audio.sfx('clang', { vol: 0.5, pitch: 1.3 });
      }
      if (e.stateT > 1.0) { e.setState('walk'); e.cool = (P.rate ?? 1.9) * rand(1, 1.3); }
      return;
    }
    const adx = Math.abs(e.dxToPlayer());
    if (seesP(e, p, P.sight ?? 480, 180)) {
      faceP(e);
      if (e.onGround && e.cool <= 0) {
        if (adx < (P.melee ?? 118)) { e.setState('punch'); e.did = false; audio.sfx('charge_ready', { vol: 0.3, pitch: 0.5 }); return; }
        if (adx > 190 && Math.abs(p.bottom - e.bottom) < 40) { e.setState('throw'); e.did = false; return; }
      }
      chase(e, e.facing, adx < 80 ? 0 : e.speed);
    } else patrol(e, 0.5);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
    if (e.anim === 'walk') { e.stepT = (e.stepT ?? 0) - dt; if (e.stepT <= 0) { e.stepT = 0.6; world.camera.shake(1.5, 0.08); audio.sfx('clock_tick', { vol: 0.25, pitch: 0.6 }); } }
  },
};
/** 굴러가는 톱니 투사체 이동 (behavior 'beam' + follow 로 직접 물리 처리) */
function rollCog(pr, world) {
  const dt = 1 / 60;
  pr.vy += 2000 * dt;
  let nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;
  const r = pr.w / 2;
  if (solidAt(world, nx + r + Math.sign(pr.vx) * r, pr.y + r)) { pr.vx = -pr.vx * 0.9; nx = pr.x; world.fx.burst('spark', pr.cx + Math.sign(-pr.vx) * r, pr.cy, 6, { color: '#ffd080' }); }
  const t = world.map.typeAtPx(nx + r, ny + pr.h);
  if (pr.vy > 0 && (isSolidType(t) || t === T.ONEWAY)) {
    ny = Math.floor((ny + pr.h) / TILE) * TILE - pr.h;
    pr.vy = pr.vy > 400 ? -pr.vy * 0.3 : 0;
    if (Math.random() < 0.3) world.fx.emit('spark', pr.cx, pr.bottom, { color: '#ffd080', angle: -PI / 2 - Math.sign(pr.vx) * 0.8, spread: 0.4 });
  }
  pr.x = nx; pr.y = ny;
  pr.rot += pr.vx / r * dt;
}

/** 하피: 상공 선회 → 날개 펼침(예비동작) → 깃털 부채탄 / 발톱 급강하 */
AI_B.harpy = {
  init(e) { e.cool = rand(1, 1.8); e.side = chance(0.5) ? 1 : -1; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    const dx = p.cx - e.cx;
    switch (e.state) {
      case 'spread':
        e.vx *= 0.9; e.vy *= 0.9; e.setAnim('spread'); faceP(e);
        if (e.stateT > 0.5) {
          const n = P.count ?? 5, base = angleTo(e.cx, e.cy, p.cx, p.cy - 10);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.16;
            e.shoot({ x: e.cx + e.facing * 10, y: e.cy, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, w: 14, h: 10, render: PROJ_B.feather, life: 2.4, attack: { mv: 0.75 } });
          }
          audio.sfx('dagger', { vol: 0.5, pitch: 1.5 });
          e.setState('shoot');
        }
        return;
      case 'shoot':
        e.setAnim('shoot'); e.vy -= 60 * dt;
        if (e.stateT > 0.35) { e.setState('fly'); e.cool = (P.rate ?? 2.2) * rand(0.9, 1.2); }
        return;
      case 'aim':
        e.setAnim('aim'); e.vx *= 0.85; e.vy *= 0.85; faceP(e);
        if (e.stateT > 0.4) {
          const a = angleTo(e.cx, e.cy, p.cx, p.cy - 6);
          e.vx = Math.cos(a) * 560; e.vy = Math.sin(a) * 560;
          e.setState('dive'); audio.sfx('dash', { vol: 0.4, pitch: 1.3 });
        }
        return;
      case 'dive':
        e.setAnim('dive');
        e.strike(-10, -40, 44, 40, 1.3, { hitId: e.hid });
        if (e.stateT > 0.6 || (e.vy > 0 && solidAt(world, e.cx, e.bottom + 8))) { e.setState('climb'); }
        return;
      case 'climb':
        e.setAnim('fly'); e.vy += (-280 - e.vy) * Math.min(1, 4 * dt); e.vx *= 0.97;
        if (e.stateT > 0.6) { e.setState('fly'); e.cool = (P.rate ?? 2.2) * rand(0.8, 1.1); }
        return;
    }
    e.setAnim('fly');
    if (Math.abs(dx) > 360) e.side = -Math.sign(dx) || 1;
    sideFor(e, world, p, 170);
    hover(e, p.cx + e.side * 170, p.cy - 150 + Math.sin(e.t * 2.2) * 24, 2.4, dt, e.speed * 1.3);
    faceP(e);
    if (e.cool <= 0 && e.distToPlayer() < 480) {
      if (Math.abs(dx) < 220 && chance(0.5)) { e.setState('aim'); e.hid = nid(); audio.sfx('bat', { vol: 0.5, pitch: 0.7 }); }
      else { e.setState('spread'); audio.sfx('bat', { vol: 0.4, pitch: 1.2 }); }
    }
  },
};

/** 태엽 병사: 행진 → 조준선(예비동작) → 사격. 탄창(clip)만큼 쏘면 태엽이 풀려 정지 */
AI_B.rifleman = {
  init(e) { e.cool = rand(0.6, 1.4); e.shots = 0; e.aimA = 0; e.aimLen = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    const mx = e.cx + e.facing * 20, my = e.bottom - 50;
    switch (e.state) {
      case 'aim': {
        e.vx = 0; e.setAnim('aim');
        const T0 = P.aim ?? 0.7;
        if (e.stateT < T0 * 0.7) {
          const want = angleTo(mx, my, p.cx, p.cy - 6);
          const cur = e.aimA, d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
          e.aimA = cur + clamp(d, -3 * dt, 3 * dt);
          // 전방 반원으로 제한
          if (e.facing > 0) e.aimA = clamp(e.aimA, -1.1, 1.1);
          else { let a = e.aimA; if (a > -PI + 1.1 && a < 0) a = -PI + 1.1; if (a < PI - 1.1 && a >= 0) a = PI - 1.1; e.aimA = a; }
        }
        e.aimLen = rayLen(world, mx, my, e.aimA, 900);
        if (e.stateT > T0) {
          e.shoot({ x: mx + Math.cos(e.aimA) * 18, y: my + Math.sin(e.aimA) * 18, vx: Math.cos(e.aimA) * 760, vy: Math.sin(e.aimA) * 760, w: 10, h: 10, render: 'bullet', color: '#ffe0a0', life: 1.4,
            attack: { mv: 1.15, kb: [240, -160], fx: 'bullet' } });
          world.fx.flash(mx + Math.cos(e.aimA) * 22, my + Math.sin(e.aimA) * 22, { color: '#ffd070', size: 40, life: 0.08 });
          puff(world, 'smoke', mx + Math.cos(e.aimA) * 22, my, 3, { speed: 40 });
          world.lighting.add(mx, my, 110, '#ffc060', 1);
          audio.sfx('gun', { vol: 0.55, pitch: 0.9 });
          e.shots++;
          e.setState('fire');
        }
        return;
      }
      case 'fire':
        e.vx = 0; e.setAnim('fire');
        if (e.stateT > 0.3) {
          if (e.shots >= (P.clip ?? 3)) { e.setState('winddown'); audio.sfx('clock_tick', { vol: 0.5, pitch: 0.5 }); }
          else { e.setState('walk'); e.cool = (P.rate ?? 1.2) * rand(0.85, 1.15); }
        }
        return;
      case 'winddown':
        e.vx = 0; e.setAnim('winddown');
        if (e.stateT > (P.rewind ?? 1.8)) { e.shots = 0; e.setState('walk'); e.cool = 0.6; audio.sfx('clock_tick', { vol: 0.5, pitch: 1.4 }); }
        return;
    }
    const dx = e.dxToPlayer(), adx = Math.abs(dx);
    if (seesP(e, p, P.range ?? 620, 220)) {
      faceP(e);
      if (e.cool <= 0 && e.onGround) { e.setState('aim'); e.aimA = e.facing > 0 ? 0 : PI; audio.sfx('clock_tick', { vol: 0.35, pitch: 1.8 }); return; }
      const keep = P.keep ?? 300;
      if (adx < keep * 0.6) chase(e, -e.facing, e.speed * 0.8);
      else if (adx > keep * 1.3) chase(e, e.facing, e.speed);
      else e.vx = 0;
    } else patrol(e, 0.6);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

/** 굴러오는 톱니: 발견 시 제자리 회전(예비동작) → 가속 돌진, 벽에서 튕김, 지나치면 되돌아옴 */
AI_B.roller = {
  init(e) { e.rot = 0; e.setState('roam'); e.spin = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    const r = e.def.size.h / 2;
    const max = P.maxSpeed ?? 360, acc = P.accel ?? 420;
    if (e.state === 'wind') {
      e.vx *= 0.85; e.setAnim('wind');
      e.spin = lerp(e.spin, e.facing * 22, Math.min(1, 3 * dt));
      e.rot += e.spin * dt;
      if (Math.random() < 0.5) world.fx.emit('spark', e.cx - e.facing * r * 0.8, e.bottom - 2, { color: '#ffd080', angle: -PI / 2 - e.facing * 0.9, spread: 0.4, speed: 260 });
      if (e.stateT > (P.windup ?? 0.45)) { e.setState('roll'); e.vx = e.facing * max * 0.55; audio.sfx('dash', { vol: 0.5, pitch: 0.7 }); }
      return;
    }
    if (e.state === 'roll') {
      e.setAnim('roll');
      if (p) {
        const dx = p.cx - e.cx;
        const want = Math.abs(dx) > 150 ? Math.sign(dx) : Math.sign(e.vx) || e.facing;
        e.vx = clamp(e.vx + want * acc * dt, -max * (1 + e.stateT * 0.05), max * (1 + e.stateT * 0.05));
      }
      if (e.hitWall) {
        e.vx = -e.hitWall * Math.max(160, Math.abs(e.prevVx ?? 200) * 0.7);
        if (e.onGround) e.vy = -300;
        world.camera.shake(4, 0.12);
        puff(world, 'spark', e.cx + e.hitWall * r, e.cy, 12, { color: '#ffd080' });
        audio.sfx('clang', { vol: 0.5, pitch: 1.2 });
      }
      e.prevVx = e.vx;
      if (Math.abs(e.vx) > 5) e.facing = Math.sign(e.vx);
      e.rot += e.vx / r * dt;
      if (e.onGround && Math.abs(e.vx) > 200 && Math.random() < 0.25) world.fx.emit('spark', e.cx - Math.sign(e.vx) * r * 0.6, e.bottom - 1, { color: '#ffc060', angle: -PI / 2 - Math.sign(e.vx) * 1.1, spread: 0.4, speed: 200 });
      if (!seesP(e, p, (P.sight ?? 600) * 1.3, 260)) { e.setState('roam'); }
      return;
    }
    e.setAnim('roll');
    e.vx = lerp(e.vx, e.facing * e.speed * 0.5, Math.min(1, 2 * dt));
    if (e.onGround && (!e.groundAhead() || e.wallAhead())) e.facing *= -1;
    e.rot += e.vx / r * dt;
    if (seesP(e, p, P.sight ?? 600, 140)) { faceP(e); e.setState('wind'); e.spin = e.vx / r; audio.sfx('clock_tick', { vol: 0.4, pitch: 2 }); }
  },
};

// ═════════════════════════ s10 얼어붙은 첨탑 ═════════════════════════
/** 서리 망령: 부유 → 서리 왕관 발광 → 얼음 파편 부채 / 눈안개 순간이동 */
AI_B.wraith = {
  init(e) { e.cool = rand(1, 2); e.side = chance(0.5) ? 1 : -1; e.blinks = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    faceP(e);
    if (e.state === 'cast') {
      e.vx *= 0.9; e.vy *= 0.9; e.setAnim('cast');
      if (e.stateT > 0.65 && !e.did) {
        e.did = true;
        const n = P.count ?? 5, base = angleTo(e.cx, e.cy, p.cx, p.cy - 8);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.2;
          bolt(e, { x: e.cx + e.facing * 12, y: e.cy - 8, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, w: 12, h: 12, render: PROJ_B.frostshard, life: 2.5, trail: 'ice', trailRate: 0.06,
            attack: { mv: 0.8, element: 'ice' } });
        }
        audio.sfx('ice', { vol: 0.6 });
      }
      if (e.stateT > 1.0) { e.setState('float'); e.cool = (P.rate ?? 2.3) * rand(0.9, 1.2); }
      return;
    }
    if (e.state === 'vanish') {
      e.setAnim('vanish'); e.vx = 0; e.vy = 0; e.alpha = 1 - clamp(e.stateT / 0.3, 0, 1); e.invuln = e.stateT > 0.15;
      if (e.stateT > 0.35) {
        const side = -Math.sign(p.facing || 1);
        e.cx = p.cx + side * rand(150, 220); e.y = p.bottom - 150 - e.h * 0.2;
        puff(world, 'ice', e.cx, e.cy, 14, { speed: 120 });
        e.setState('appear');
      }
      return;
    }
    if (e.state === 'appear') {
      e.setAnim('float'); e.alpha = clamp(e.stateT / 0.3, 0, 1);
      if (e.stateT > 0.3) { e.alpha = 1; e.invuln = false; e.setState('cast'); e.did = false; }
      return;
    }
    const keep = P.keep ?? 240;
    if (Math.abs(p.cx - e.cx) > keep * 2) e.side = Math.sign(e.cx - p.cx) || 1;
    sideFor(e, world, p, keep);
    hover(e, p.cx + e.side * keep, p.bottom - 120 + Math.sin(e.t * 1.5) * 20, 1.8, dt, e.speed * 1.5);
    e.setAnim('float');
    if (e.cool <= 0 && e.distToPlayer() < 560) {
      if ((e.blinks++ % 3) === 2) { e.setState('vanish'); audio.sfx('mist', { vol: 0.5 }); puff(world, 'ice', e.cx, e.cy, 12, { speed: 100 }); }
      else { e.setState('cast'); e.did = false; audio.sfx('magic', { vol: 0.3, pitch: 1.4 }); }
    }
  },
};

/** 설원 늑대: 돌진형 + 위쪽 먹잇감에게 도약 물기 */
AI_B.snowwolf = {
  init(e) { e.cool = 0; e.leapCool = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.leapCool -= dt * e.aggro;
    if (e.state === 'crouch') {
      e.vx = 0; e.setAnim('wind');
      if (e.stateT > 0.32) {
        const dx = p ? p.cx - e.cx : e.facing * 100;
        e.vx = clamp(dx * 1.5, -420, 420); e.vy = -820;
        e.setState('leap'); e.hid = nid(); audio.sfx('dash', { vol: 0.4, pitch: 1.2 });
      }
      return;
    }
    if (e.state === 'leap') {
      e.setAnim('leap');
      e.strike(0, -42, 40, 40, 1.3, { hitId: e.hid });
      if (e.onGround && e.stateT > 0.1) { e.setState('rest'); e.vx = 0; puff(world, 'ice', e.cx, e.bottom - 4, 8, { angle: -PI / 2, spread: 1.2, speed: 160 }); }
      return;
    }
    if (e.state === 'charge' && Math.random() < 0.4) world.fx.emit('ice', e.cx - e.facing * 20, e.bottom - 4, { angle: -PI / 2 - e.facing * 0.8, spread: 0.5, speed: 140 });
    if (p && e.onGround && e.leapCool <= 0 && e.state !== 'charge' && e.state !== 'wind' && p.bottom < e.bottom - 60 && Math.abs(p.cx - e.cx) < 220 && Math.abs(p.bottom - e.bottom) < 260) {
      faceP(e); e.setState('crouch'); e.leapCool = 2.2; return;
    }
    AI.charger.update(e, world, dt);
  },
};

/** 검사형 (얼어붙은 기사 / 죽음의 기사): 연속 베기 → 마지막 일격은 지면을 달리는 파동. 정면 가드 후 반격 */
AI_B.swordsman = {
  init(e) { e.cool = rand(0.6, 1.4); e.comboI = 0; e.guardT = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    if (e.guardT > 0) {
      e.guardT -= dt; e.vx *= 0.8; e.setAnim('guard');
      if (e.guardT <= 0) { e.setState('slash'); e.comboI = (P.combo ?? 2) - 1; e.did = false; e.counter = true; }
      return;
    }
    if (e.state === 'slash') {
      e.setAnim('slash');
      const last = e.comboI >= (P.combo ?? 2) - 1;
      const wu = e.counter ? 0.25 : e.comboI === 0 ? (P.windup ?? 0.55) : 0.3;
      e.vx *= 0.8;
      if (e.stateT > wu && !e.did) {
        e.did = true;
        e.vx = e.facing * (last ? 90 : 200);
        if (last) {
          e.strike(-10, -110, 120, 110, 1.9, { kb: [380, -480], hitstop: 0.09, hitId: 'sk' + (++_zid) });
          world.camera.shake(6, 0.2);
          const soul = P.wave === 'soul';
          const pr = bolt(e, { x: e.cx + e.facing * 50, y: e.bottom - 26, vx: e.facing * 420, vy: 0, w: 34, h: 50, render: soul ? PROJ_B.soulwave : PROJ_B.icewave, life: 1.3,
            light: { r: 70, color: soul ? '#6aff9a' : '#9fe8ff', i: 0.7 }, attack: { mv: 1.2, element: soul ? 'dark' : 'ice', kb: [260, -420] }, trail: soul ? 'soul' : 'ice', trailRate: 0.04 });
          pr.fadeOut = true;
          puff(world, soul ? 'soul' : 'ice', e.cx + e.facing * 60, e.bottom - 10, 14, { speed: 200 });
          audio.sfx('slash_heavy', { pitch: 0.7 }); audio.sfx(soul ? 'dark' : 'ice', { vol: 0.5 });
        } else {
          e.strike(-4, -86, 100, 64, 1.35, { hitId: 'sk' + (++_zid) });
          audio.sfx('slash', { pitch: 0.8 });
        }
      }
      if (e.stateT > wu + (last ? 0.6 : 0.2)) {
        if (!last) { e.comboI++; e.stateT = 0; e.animT = 0; e.did = false; faceP(e); }
        else { e.setState('walk'); e.comboI = 0; e.counter = false; e.cool = (P.rate ?? 1.5) * rand(0.9, 1.25); }
      }
      return;
    }
    const adx = Math.abs(e.dxToPlayer());
    if (seesP(e, p, P.sight ?? 440, 160)) {
      faceP(e);
      if (e.onGround && e.cool <= 0 && (adx < 104 || (adx > 200 && adx < 420 && e.cool < -1.5))) {
        e.setState('slash'); e.did = false;
        e.comboI = adx < 104 ? 0 : (P.combo ?? 2) - 1; // 원거리면 마지막 일격(파동)만
        return;
      }
      chase(e, e.facing, adx < 60 ? 0 : e.speed * (P.chaseMul ?? 1.1));
      if (P.jumps && e.onGround && e.wallAhead() && e.vx === 0) e.vy = -640;
    } else patrol(e, 0.5);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
  onHit(e, world, attack) {
    const P = e.params;
    if (!P.guard || e.state === 'slash' || e.guardT > 0) return;
    if (Math.sign(attack.dir) === -e.facing && attack.type !== 'mag' && chance(0.45)) {
      e.guardT = 0.4; e.stun = 0; e.vx = 0;
      world.fx.burst('spark', e.cx + e.facing * e.w * 0.5, e.cy - 10, 10, { color: P.wave === 'soul' ? '#a0ffc0' : '#d0f4ff' });
      audio.sfx('clang', { vol: 0.7 });
    }
  },
};

/** 얼음 박쥐: 박쥐 비행 + 머리 위에서 떨며 고드름 낙하 */
AI_B.icebat = {
  init(e) { AI.bat.init(e); e.cool = rand(0.5, 1.5); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    if (e.state === 'shiver') {
      e.vx *= 0.8; e.vy *= 0.8; e.setAnim('shiver');
      if (e.stateT > 0.38) {
        e.shoot({ x: e.cx, y: e.bottom + 4, vx: 0, vy: 60, w: 10, h: 22, behavior: 'fall', gravity: 0.55, render: PROJ_B.icicle, life: 2.5,
          attack: { mv: 1.0, element: 'ice', kb: [120, -200] },
          onLand: (pr, w) => { pr.dead = true; w.fx.burst('ice', pr.cx, pr.bottom - 4, 10, { angle: -PI / 2, spread: 1.3, speed: 180 }); audio.sfx('ice', { vol: 0.3, pitch: 1.6 }); } });
        audio.sfx('ice', { vol: 0.3, pitch: 1.3 });
        e.setState('fly'); e.baseY = e.y; e.cool = (P.rate ?? 1.8) * rand(0.9, 1.3);
      }
      return;
    }
    AI.bat.update(e, world, dt);
    if (e.state === 'fly' && p && e.cool <= 0 && Math.abs(p.cx - e.cx) < 50 && p.cy > e.cy + 60 && p.cy - e.cy < 360) { e.setState('shiver'); }
  },
};

// ═════════════════════════ s11 피의 예배당 ═════════════════════════
/** 서큐버스: 선회 → 입맞춤(예비동작) → 유도 하트 3발 / 날개 접고 급강하 / 연속 피격 시 순간이동 */
AI_B.succubus = {
  init(e) { e.cool = rand(1, 1.8); e.side = chance(0.5) ? 1 : -1; e.hitN = 0; e.hitT = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro; e.hitT -= dt;
    if (e.hitT <= 0) e.hitN = 0;
    switch (e.state) {
      case 'kiss':
        faceP(e); e.vx *= 0.9; e.vy *= 0.9; e.setAnim('kiss');
        if (e.stateT > 0.55 && !e.did) {
          e.did = true;
          for (let i = 0; i < 3; i++) {
            const a = (e.facing > 0 ? 0 : PI) + (i - 1) * 0.5 - 0.2;
            bolt(e, { x: e.cx + e.facing * 14, y: e.bottom - 64, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, w: 16, h: 16, render: PROJ_B.heart, behavior: 'homing', homingTurn: 1.6, homingDelay: 0.25 + i * 0.1, life: 3.4, speed: 210,
              light: { r: 45, color: '#ff4a8a', i: 0.6 }, attack: { mv: 0.8, element: 'dark', stun: 0.5 } });
          }
          audio.sfx('magic', { vol: 0.4, pitch: 1.7 });
        }
        if (e.stateT > 0.95) { e.setState('fly'); e.cool = (P.rate ?? 2.2) * rand(0.9, 1.2); }
        return;
      case 'fold':
        faceP(e); e.vx *= 0.85; e.vy *= 0.85; e.setAnim('fold');
        if (e.stateT > 0.38) { const a = angleTo(e.cx, e.cy, p.cx, p.cy); e.vx = Math.cos(a) * 540; e.vy = Math.sin(a) * 540; e.setState('dive'); e.did = false; audio.sfx('dash', { vol: 0.4, pitch: 1.4 }); }
        return;
      case 'dive':
        e.setAnim('dive');
        e.strike(-10, -70, 40, 60, 1.3, { hitId: e.hid });
        if (e.stateT > 0.5 || (e.vy > 0 && solidAt(world, e.cx, e.bottom + 6))) e.setState('climb');
        return;
      case 'climb':
        e.setAnim('fly'); e.vy += (-240 - e.vy) * Math.min(1, 4 * dt); e.vx *= 0.96;
        if (e.stateT > 0.55) { e.setState('fly'); e.cool = (P.rate ?? 2.2) * rand(0.7, 1); }
        return;
      case 'vanish':
        e.setAnim('fly'); e.vx = 0; e.vy = 0; e.alpha = 1 - clamp(e.stateT / 0.25, 0, 1); e.invuln = true;
        if (e.stateT > 0.3) {
          e.side = -e.side; e.cx = p.cx + e.side * (P.keep ?? 210); e.y = p.bottom - 180;
          puff(world, 'magic', e.cx, e.cy, 14, { color: '#ff6aa0' });
          e.setState('appear');
        }
        return;
      case 'appear':
        e.setAnim('fly'); e.alpha = clamp(e.stateT / 0.25, 0, 1);
        if (e.stateT > 0.25) { e.alpha = 1; e.invuln = false; e.setState('kiss'); e.did = false; }
        return;
    }
    const keep = P.keep ?? 210;
    if (Math.abs(p.cx - e.cx) > keep * 2.2) e.side = Math.sign(e.cx - p.cx) || 1;
    sideFor(e, world, p, keep);
    hover(e, p.cx + e.side * keep, p.bottom - 130 + Math.sin(e.t * 2.4) * 22, 2.2, dt, e.speed * 1.4);
    faceP(e); e.setAnim('fly');
    if (e.cool <= 0 && e.distToPlayer() < 520) {
      if (Math.abs(p.cx - e.cx) < 260 && chance(0.4)) { e.setState('fold'); e.hid = nid(); }
      else { e.setState('kiss'); e.did = false; audio.sfx('bat', { vol: 0.25, pitch: 1.9 }); }
    }
  },
  onHit(e, world) {
    e.hitN++; e.hitT = 1.2;
    if (e.hitN >= 3 && e.state !== 'vanish' && e.state !== 'appear') { e.hitN = 0; e.setState('vanish'); audio.sfx('mist', { vol: 0.5 }); puff(world, 'magic', e.cx, e.cy, 16, { color: '#ff6aa0' }); }
  },
};

/** 피의 사제: 거리 유지 → 성배를 치켜듦 → 바닥에서 피의 창 3개 / 다친 아군을 피로 치유 */
AI_B.priest = {
  init(e) { e.cool = rand(1, 2); e.healCool = rand(2, 4); ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro; e.healCool -= dt;
    const adx = Math.abs(e.dxToPlayer());
    if (e.state === 'cast') {
      e.vx = 0; e.setAnim('cast');
      if (e.stateT > 0.25 && !e.did) {
        e.did = true;
        const n = 3;
        for (let i = 0; i < n; i++) {
          const x = p.cx + (i - 1) * 78 + (p.vx ?? 0) * 0.15;
          const top = groundTop(world, x, p.bottom - 30, 220);
          if (top == null) continue;
          addZone(world, { x: x - 16, y: top - 120, w: 32, h: 120, delay: 0.75 + i * 0.12, life: 0.4, owner: e, render: ZONE_B.bloodspear, light: { r: 70, color: '#ff2a44', i: 0.7 }, data: { seed: rand(0, 50) },
            attack: atk(e, 1.3, { type: 'mag', element: 'dark', kb: [100, -650], hitId: 'bs' + (++_zid) }),
            tick: (z, w) => { if (z.active && !z.data.burst) { z.data.burst = true; w.fx.burst('blood', z.cx, z.bottom - 6, 10, { angle: -PI / 2, spread: 0.5, speed: 380, color: '#d0142a' }); audio.sfx('slash', { vol: 0.35, pitch: 0.6 }); } } });
        }
        audio.sfx('dark', { vol: 0.5, pitch: 0.8 });
      }
      if (e.stateT > (P.cast ?? 0.8) + 0.3) { e.setState('idle'); e.cool = (P.rate ?? 2.6) * rand(0.9, 1.2); }
      return;
    }
    if (e.state === 'channel') {
      e.vx = 0; e.setAnim('channel');
      const tg = e.healTarget;
      if (tg && !tg.dead && Math.random() < 0.6) world.fx.emit('blood', lerp(e.cx, tg.cx, Math.random()), lerp(e.bottom - 80, tg.cy, Math.random()), { color: '#ff3a5a', speed: 30, grav: 0 });
      if (e.stateT > 0.8) {
        if (tg && !tg.dead && !(tg.dying > 0)) {
          const heal = Math.round(tg.stats.maxHp * 0.25);
          tg.hp = Math.min(tg.stats.maxHp, tg.hp + heal);
          world.fx.text(tg.cx, tg.y - 10, '+' + heal, { color: '#ff6a8a', size: 18 });
          world.fx.burst('blood', tg.cx, tg.cy, 14, { color: '#ff3a5a', speed: 120 });
          world.fx.ring(tg.cx, tg.cy, { color: '#ff2a44', r0: 8, r1: 50, life: 0.35, width: 4 });
          audio.sfx('heal', { vol: 0.4, pitch: 0.7 });
        }
        e.healTarget = null; e.setState('idle'); e.healCool = 5; e.cool = Math.max(e.cool, 0.8);
      }
      return;
    }
    faceP(e);
    // 다친 아군 치유
    if (e.healCool <= 0) {
      let best = null;
      for (const o of world.enemies()) {
        if (o === e || o.kind !== 'enemy' || o.hp >= o.stats.maxHp * 0.7) continue;
        if (Math.hypot(o.cx - e.cx, o.cy - e.cy) < 320) { best = o; break; }
      }
      if (!best && e.hp < e.stats.maxHp * 0.5) best = e;
      if (best) { e.healTarget = best; e.setState('channel'); audio.sfx('dark', { vol: 0.3, pitch: 1.4 }); return; }
      e.healCool = 1;
    }
    if (adx < (P.range ?? 560) && e.cool <= 0 && Math.abs(p.cy - e.cy) < 240) { e.setState('cast'); e.did = false; return; }
    const keep = P.keep ?? 260;
    if (adx < keep * 0.7) chase(e, -e.facing, e.speed);
    else if (adx > keep * 1.4 && adx < 620) chase(e, e.facing, e.speed);
    else e.vx = 0;
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

/** 뼈 천사: 상공 부유 → 날개를 치켜듦 → 뼈 깃털 비 / 창 겨눔 → 직선 강하 */
AI_B.angel = {
  init(e) { e.cool = rand(1, 2); e.side = chance(0.5) ? 1 : -1; e.pick = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'raise':
        e.vx *= 0.9; e.vy *= 0.9; e.setAnim('raise'); faceP(e);
        if (e.stateT > 0.55 && !e.did) {
          e.did = true;
          for (let i = 0; i < 7; i++) {
            const a = PI / 2 + (i - 3) * 0.2 + rand(-0.04, 0.04);
            e.shoot({ x: e.cx + (i - 3) * 6, y: e.cy + 6, vx: Math.cos(a) * 330 + (p.cx - e.cx) * 0.4, vy: Math.sin(a) * 330, w: 10, h: 18, render: PROJ_B.bonefeather, life: 2.2, attack: { mv: 0.75 } });
          }
          audio.sfx('dagger', { vol: 0.5, pitch: 0.8 });
        }
        if (e.stateT > 0.9) { e.setState('fly'); e.cool = (P.rate ?? 2.4) * rand(0.9, 1.2); }
        return;
      case 'aim':
        e.vx *= 0.85; e.vy *= 0.85; e.setAnim('aim'); faceP(e);
        e.aimA = angleTo(e.cx, e.cy, p.cx, p.cy);
        if (e.stateT > 0.5) { e.vx = Math.cos(e.aimA) * 620; e.vy = Math.sin(e.aimA) * 620; e.setState('dive'); audio.sfx('dash', { vol: 0.5, pitch: 0.8 }); }
        return;
      case 'dive':
        e.setAnim('dive');
        e.strike(-10, -60, 60, 50, 1.45, { hitId: e.hid, kb: [360, -300] });
        if (Math.random() < 0.5) world.fx.emit('holy', e.cx, e.cy, { speed: 30, color: '#e8dcc0' });
        if (e.stateT > 0.55 || (e.vy > 0 && solidAt(world, e.cx, e.bottom + 6))) {
          if (solidAt(world, e.cx, e.bottom + 6)) { world.camera.shake(5, 0.15); puff(world, 'dust', e.cx, e.bottom, 8, { speed: 140 }); }
          e.setState('climb');
        }
        return;
      case 'climb':
        e.setAnim('fly'); e.vy += (-300 - e.vy) * Math.min(1, 4 * dt); e.vx *= 0.96;
        if (e.stateT > 0.7) { e.setState('fly'); e.cool = (P.rate ?? 2.4) * rand(0.8, 1.1); }
        return;
    }
    if (Math.abs(p.cx - e.cx) > 320) e.side = Math.sign(e.cx - p.cx) || 1;
    sideFor(e, world, p, 120);
    hover(e, p.cx + e.side * 120, p.cy - 200 + Math.sin(e.t * 1.6) * 20, 1.8, dt, e.speed * 1.4);
    faceP(e); e.setAnim('fly');
    if (e.cool <= 0 && e.distToPlayer() < 520) {
      e.pick++;
      if (e.pick % 2 === 0) { e.setState('aim'); e.hid = nid(); audio.sfx('holy', { vol: 0.3, pitch: 0.6 }); }
      else { e.setState('raise'); e.did = false; audio.sfx('bat', { vol: 0.3, pitch: 0.5 }); }
    }
  },
};

/** 저주받은 수녀: 지면 위를 미끄러지듯 부유 → 거꾸로 된 기도 → 역십자 6개가 공전하다 차례로 발사 */
AI_B.nun = {
  init(e) { e.cool = rand(1.2, 2); e.crosses = []; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    const gy = groundTop(world, e.cx, e.bottom - 20, 300);
    const ty = (gy ?? e.bottom) - e.h - 10 + Math.sin(e.t * 2) * 5;
    if (e.state === 'pray') {
      e.vx *= 0.9; e.vy += ((ty - e.y) * 3 - e.vy) * Math.min(1, 4 * dt); e.setAnim('pray'); faceP(e);
      const pr = P.pray ?? 0.9;
      if (e.stateT > 0.3 && !e.did) {
        e.did = true;
        const n = P.count ?? 6;
        e.crosses = [];
        for (let i = 0; i < n; i++) {
          const c = bolt(e, { x: e.cx, y: e.cy, vx: 0, vy: 0, w: 16, h: 20, render: PROJ_B.cross, behavior: 'orbit', orbitR: 62, orbitSpeed: 3.2, life: 6, collideWalls: false,
            light: { r: 40, color: '#b060ff', i: 0.5 }, attack: { mv: 0.85, element: 'dark' } });
          c.orbitA = i * TAU / n;
          e.crosses.push(c);
        }
        audio.sfx('bell', { vol: 0.4, pitch: 0.6 });
      }
      if (e.stateT > pr + 0.3) {
        // 공전 중인 십자가를 순서대로 발사
        const k = Math.floor((e.stateT - pr - 0.3) / 0.12);
        for (let i = 0; i < Math.min(k + 1, e.crosses.length); i++) {
          const c = e.crosses[i];
          if (c.dead || c.behavior !== 'orbit') continue;
          const a = angleTo(c.cx, c.cy, p.cx, p.cy);
          c.behavior = 'straight'; c.vx = Math.cos(a) * 380; c.vy = Math.sin(a) * 380; c.life = 2.2; c.collideWalls = true;
          audio.sfx('dagger', { vol: 0.3, pitch: 0.7 + i * 0.1 });
        }
        if (e.crosses.every((c) => c.dead || c.behavior !== 'orbit')) { e.crosses = []; e.setState('float'); e.cool = (P.rate ?? 2.8) * rand(0.9, 1.2); }
      }
      return;
    }
    const keep = P.keep ?? 240, dx = e.cx - p.cx;
    const tx = p.cx + (Math.sign(dx) || 1) * keep;
    e.vx += (clamp((tx - e.cx) * 2, -e.speed, e.speed) - e.vx) * Math.min(1, 3 * dt);
    e.vy += ((ty - e.y) * 3 - e.vy) * Math.min(1, 4 * dt);
    if (Math.abs(e.vx) > 4 && !canMove(e, Math.sign(e.vx))) e.vx = 0;
    faceP(e); e.setAnim('float');
    if (e.cool <= 0 && e.distToPlayer() < 520) { e.setState('pray'); e.did = false; audio.sfx('dark', { vol: 0.3, pitch: 0.6 }); }
  },
  onDie(e) { for (const c of e.crosses || []) if (c.behavior === 'orbit') c.dead = true; },
};

// ═════════════════════════ s12 드라큘라의 왕좌 ═════════════════════════
/** 흡혈 신부: 떠다님 → 비명(박쥐 산개) / 붉은 안개가 되어 관통 돌진 후 할퀴기 */
AI_B.bride = {
  init(e) { e.cool = rand(1, 1.8); e.side = chance(0.5) ? 1 : -1; e.pick = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'scream':
        e.vx *= 0.9; e.vy *= 0.9; e.setAnim('scream'); faceP(e);
        if (e.stateT > 0.6 && !e.did) {
          e.did = true;
          for (let i = 0; i < 4; i++) {
            const a = (e.facing > 0 ? 0 : PI) + (i - 1.5) * 0.45;
            bolt(e, { x: e.cx + e.facing * 10, y: e.bottom - 66, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, w: 18, h: 12, render: PROJ_B.bat, behavior: 'homing', homingTurn: 2.0, homingDelay: 0.35, life: 3, speed: 280,
              attack: { mv: 0.8, element: 'dark' } });
          }
          world.fx.ring(e.cx, e.bottom - 66, { color: '#ff3a5a', r0: 10, r1: 110, life: 0.35, width: 5 });
          audio.sfx('ghost', { vol: 0.6, pitch: 1.3 }); audio.sfx('bat', { vol: 0.5 });
        }
        if (e.stateT > 1.0) { e.setState('float'); e.cool = (P.rate ?? 2) * rand(0.9, 1.2); }
        return;
      case 'gather':
        e.vx *= 0.85; e.vy *= 0.85; e.setAnim('gather'); faceP(e);
        if (e.stateT > 0.45) {
          const a = angleTo(e.cx, e.cy, p.cx, p.cy - 10);
          e.vx = Math.cos(a) * 620; e.vy = Math.sin(a) * 620;
          e.setState('mist'); e.invuln = true; e.alpha = 0.5;
          audio.sfx('mist', { vol: 0.6 });
        }
        return;
      case 'mist':
        e.setAnim('mist');
        if (Math.random() < 0.8) world.fx.emit('smoke', e.cx + rand(-12, 12), e.cy + rand(-20, 20), { color: '#8a0a24', speed: 30 });
        e.strike(-16, -80, 50, 80, 0.9, { hitId: e.hid, element: 'dark' });
        e.vx *= 0.985; e.vy *= 0.97;
        if (e.stateT > 0.55) { e.invuln = false; e.alpha = 1; faceP(e); e.setState('claw'); e.did = false; e.vx *= 0.2; e.vy *= 0.2; }
        return;
      case 'claw':
        e.setAnim('claw'); e.vx *= 0.85; e.vy *= 0.85;
        if (e.stateT > 0.28 && !e.did) { e.did = true; e.strike(0, -80, 70, 60, 1.3, { hitId: nid() }); audio.sfx('slash', { pitch: 1.3 }); }
        if (e.stateT > 0.6) { e.setState('float'); e.cool = (P.rate ?? 2) * rand(0.9, 1.2); }
        return;
    }
    const keep = P.keep ?? 200;
    if (Math.abs(p.cx - e.cx) > keep * 2.3) e.side = Math.sign(e.cx - p.cx) || 1;
    sideFor(e, world, p, keep);
    hover(e, p.cx + e.side * keep, p.bottom - 100 + Math.sin(e.t * 1.4) * 16, 1.6, dt, e.speed * 1.4);
    faceP(e); e.setAnim('float');
    if (e.cool <= 0 && e.distToPlayer() < 480) {
      e.pick++;
      if (e.pick % 2) { e.setState('gather'); e.hid = nid(); audio.sfx('ghost', { vol: 0.3, pitch: 0.7 }); }
      else { e.setState('scream'); e.did = false; }
    }
  },
};

/** 마족 영주: 불타는 대검 휘두르기 / 화염구 3발 / 지옥불 기둥 3개 */
AI_B.demonlord = {
  init(e) { e.cool = rand(0.8, 1.6); e.pick = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    const st = e.state;
    if (st === 'swing') {
      e.setAnim('swing'); e.vx *= 0.8;
      const wu = P.windup ?? 0.6;
      if (e.stateT > wu && !e.did) {
        e.did = true; e.vx = e.facing * 180;
        e.strike(-30, -130, (P.melee ?? 124) + 30, 130, 2.0, { kb: [460, -520], hitstop: 0.1, element: 'fire', hitId: 'dl' + (++_zid) });
        world.camera.shake(7, 0.22);
        puff(world, 'fire', e.cx + e.facing * 70, e.bottom - 60, 14, { speed: 220 });
        audio.sfx('slash_heavy', { pitch: 0.6 }); audio.sfx('fire', { vol: 0.5 });
      }
      if (e.stateT > wu + 0.55) { e.setState('walk'); e.cool = (P.rate ?? 1.7) * rand(0.9, 1.2); }
      return;
    }
    if (st === 'fireball') {
      e.setAnim('fireball'); e.vx = 0;
      if (e.stateT > 0.55 && !e.did) {
        e.did = true;
        const base = p ? angleTo(e.cx, e.bottom - 80, p.cx, p.cy) : (e.facing > 0 ? 0 : PI);
        for (let i = 0; i < 3; i++) {
          const a = base + (i - 1) * 0.22;
          bolt(e, { x: e.cx + e.facing * 30, y: e.bottom - 84, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, w: 20, h: 20, render: 'fireball', color: '#ff5a1a', trail: 'fire', trailRate: 0.04, light: { r: 70, color: '#ff7a2a' },
            attack: { mv: 1.0, element: 'fire' } });
        }
        audio.sfx('fire', { vol: 0.6, pitch: 0.8 });
      }
      if (e.stateT > 1.0) { e.setState('walk'); e.cool = (P.rate ?? 1.7) * rand(0.9, 1.2); }
      return;
    }
    if (st === 'hellfire') {
      e.setAnim('hellfire'); e.vx = 0;
      if (e.stateT > 0.5 && !e.did && p) {
        e.did = true;
        for (let i = 0; i < 3; i++) {
          const x = p.cx + (i - 1) * 96;
          const top = groundTop(world, x, p.bottom - 30, 240);
          if (top == null) continue;
          addZone(world, { x: x - 26, y: top - 170, w: 52, h: 170, delay: 0.7 + Math.abs(i - 1) * 0.18, life: 0.5, owner: e, render: ZONE_B.hellfire, light: { r: 110, color: '#ff6a1a', i: 0.9 }, data: { seed: rand(0, 50) },
            attack: atk(e, 1.4, { type: 'mag', element: 'fire', kb: [120, -700], hitId: 'hf' + (++_zid) }),
            tick: (z, w) => { if (z.active && !z.data.b) { z.data.b = true; w.fx.burst('fire', z.cx, z.bottom - 10, 12, { angle: -PI / 2, spread: 0.4, speed: 420 }); w.camera.shake(3, 0.1); audio.sfx('fire', { vol: 0.4 }); } } });
        }
        audio.sfx('boss_roar', { vol: 0.35, pitch: 0.8 });
      }
      if (e.stateT > 1.2) { e.setState('walk'); e.cool = (P.rate ?? 1.7) * rand(1, 1.3); }
      return;
    }
    const adx = Math.abs(e.dxToPlayer());
    if (seesP(e, p, P.sight ?? 520, 200)) {
      faceP(e);
      if (e.onGround && e.cool <= 0) {
        if (adx < (P.melee ?? 124)) { e.setState('swing'); e.did = false; audio.sfx('boss_roar', { vol: 0.2, pitch: 1.3 }); return; }
        e.pick++;
        e.setState(e.pick % 2 ? 'fireball' : 'hellfire'); e.did = false; return;
      }
      chase(e, e.facing, adx < 90 ? 0 : e.speed);
    } else patrol(e, 0.5);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
    if (e.anim === 'walk') { e.stepT = (e.stepT ?? 0) - dt; if (e.stepT <= 0) { e.stepT = 0.5; world.camera.shake(1.5, 0.08); } }
  },
};

/** 박쥐 떼: 플레이어 주위를 선회 → 모여듦(예비동작) → 검은 물결로 관통 돌진 */
AI_B.swarm = {
  init(e) { e.cool = rand(1, 2); e.orbA = rand(0, TAU); e.orbDir = chance(0.5) ? 1 : -1; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    if (e.state === 'gather') {
      e.vx *= 0.88; e.vy *= 0.88; e.setAnim('gather'); faceP(e);
      if (e.stateT > 0.5) {
        const a = angleTo(e.cx, e.cy, p.cx, p.cy - 10);
        e.vx = Math.cos(a) * 470; e.vy = Math.sin(a) * 470;
        e.setState('charge'); e.hid = nid();
        audio.sfx('bat', { vol: 0.8, pitch: 0.8 });
      }
      return;
    }
    if (e.state === 'charge') {
      e.setAnim('charge');
      e.strike(-e.w * 0.4, -e.h, e.w * 0.8, e.h, 1.2, { hitId: e.hid });
      if (Math.abs(e.vx) > 5) e.facing = Math.sign(e.vx);
      if (e.stateT > 0.85) { e.setState('circle'); e.cool = (P.rate ?? 2) * rand(0.9, 1.2); e.orbA = angleTo(p.cx, p.cy, e.cx, e.cy); }
      return;
    }
    e.setAnim('fly');
    e.orbA += e.orbDir * dt * 1.4;
    hover(e, p.cx + Math.cos(e.orbA) * 190, p.cy - 40 + Math.sin(e.orbA) * 100, 2.5, dt, e.speed * 1.8);
    if (Math.abs(e.vx) > 10) e.facing = Math.sign(e.vx);
    if (e.cool <= 0 && e.distToPlayer() < 360) { e.setState('gather'); audio.sfx('bat', { vol: 0.5, pitch: 1.5 }); }
  },
  onHit(e, world) { world.fx.burst('dark', e.cx, e.cy, 4, { speed: 80 }); },
};

/** 근위 갑옷: 미늘창 크게 휩쓸기(근거리) / 상단·하단 찌르기(중거리). 정면 방패 */
AI_B.halberdier = {
  init(e) { e.cool = rand(0.6, 1.4); e.high = true; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    if (e.state === 'sweep') {
      e.setAnim('sweep'); e.vx *= 0.8;
      if (e.stateT > 0.62 && !e.did) {
        e.did = true; e.vx = e.facing * 120;
        e.strike(-30, -100, 170, 96, 1.8, { kb: [420, -420], hitstop: 0.08, hitId: 'rg' + (++_zid) });
        world.camera.shake(5, 0.18);
        audio.sfx('slash_heavy', { pitch: 0.8 });
      }
      if (e.stateT > 1.15) { e.setState('walk'); e.cool = (P.rate ?? 1.4) * rand(0.9, 1.2); }
      return;
    }
    if (e.state === 'thrust') {
      e.setAnim('thrust'); e.vx *= 0.8;
      if (e.stateT > 0.52 && !e.did) {
        e.did = true; e.vx = e.facing * 260;
        const y = e.high ? -82 : -34;
        e.strike(10, y - 12, 200, 24, 1.6, { kb: [360, -240], hitId: 'rt' + (++_zid) });
        puff(world, 'spark', e.cx + e.facing * 190, e.bottom + y, 5, { color: '#ffe0a0', angle: e.facing > 0 ? 0 : PI, spread: 0.3 });
        audio.sfx('slash', { pitch: 1.2 });
      }
      if (e.stateT > 1.0) { e.setState('walk'); e.cool = (P.rate ?? 1.4) * rand(0.9, 1.2); }
      return;
    }
    const adx = Math.abs(e.dxToPlayer());
    if (seesP(e, p, P.sight ?? 460, 170)) {
      faceP(e);
      if (e.onGround && e.cool <= 0) {
        if (adx < 125) { e.setState('sweep'); e.did = false; return; }
        if (adx < 205) { e.setState('thrust'); e.did = false; e.high = !e.high; return; }
      }
      chase(e, e.facing, adx < 100 ? 0 : e.speed);
    } else patrol(e, 0.45);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
  onHit(e, world, attack) {
    if (e.params.shield && Math.sign(attack.dir) === -e.facing && attack.type !== 'mag' && e.state !== 'sweep' && e.state !== 'thrust') {
      world.fx.burst('spark', e.cx + e.facing * e.w * 0.5, e.cy - 6, 8, { color: '#ffe0a0' });
      audio.sfx('clang', { vol: 0.6 });
    }
  },
};

// ═════════════════════════ s13 심연의 역성 ═════════════════════════
/** 혼돈의 권속: 꿈틀대며 전진 → 부풀어 오름 → 혼돈의 알 5발 산개 / 도약 덮치기 */
AI_B.chaos = {
  init(e) { e.cool = rand(0.8, 1.6); e.pick = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.cool -= dt * e.aggro;
    if (e.state === 'swell') {
      e.vx *= 0.7; e.setAnim('swell');
      if (e.stateT > 0.6) {
        for (let i = 0; i < 5; i++) {
          const vy0 = -rand(520, 700), a = (i - 2) * 0.35;
          bolt(e, { x: e.cx, y: e.bottom - 36, vx: e.facing * (130 + i * 60) * Math.cos(a) + (i - 2) * 30, vy: vy0, w: 14, h: 14, behavior: 'arc', gravity: 0.8, collideWalls: 'land', render: PROJ_B.chaosorb, life: 3,
            light: { r: 40, color: '#d040ff', i: 0.5 }, attack: { mv: 0.8, element: 'dark' },
            onLand: (pr, w) => { pr.dead = true; w.fx.burst('dark', pr.cx, pr.bottom - 4, 6, { speed: 90 }); w.fx.burst('magic', pr.cx, pr.bottom - 4, 5, { color: '#d040ff' }); } });
        }
        audio.sfx('dark', { vol: 0.6 }); world.fx.burst('dark', e.cx, e.cy, 10, { speed: 150 });
        e.setState('idle'); e.cool = (P.rate ?? 1.8) * rand(0.9, 1.2);
      }
      return;
    }
    if (e.state === 'leap') {
      e.setAnim('leap');
      e.strike(-20, -44, 44, 44, 1.2, { hitId: e.hid });
      if (e.onGround && e.stateT > 0.1) { e.setState('idle'); e.cool = (P.rate ?? 1.8) * 0.7; puff(world, 'dark', e.cx, e.bottom - 6, 8, { speed: 120 }); audio.sfx('land', { vol: 0.4, pitch: 0.5 }); }
      return;
    }
    if (seesP(e, p, P.sight ?? 520, 200)) {
      faceP(e);
      const adx = Math.abs(e.dxToPlayer());
      if (e.cool <= 0 && e.onGround) {
        e.pick++;
        if (adx < 220 && e.pick % 2) { e.vx = clamp(e.dxToPlayer() * 1.7, -380, 380); e.vy = -600; e.setState('leap'); e.hid = nid(); audio.sfx('jump', { vol: 0.3, pitch: 0.5 }); return; }
        e.setState('swell'); audio.sfx('dark', { vol: 0.3, pitch: 1.5 }); return;
      }
      chase(e, e.facing, e.speed * (0.6 + 0.6 * Math.max(0, Math.sin(e.t * 5))));
    } else patrol(e, 0.4);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

/** 지옥견: 돌진(불타는 발자국) + 근거리 화염 브레스 */
AI_B.hound = {
  init(e) { e.cool = 0; e.breathCool = rand(1, 2); e.trailT = 0; e.trailId = 'ht' + (++_zid); ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.breathCool -= dt * e.aggro;
    if (e.state === 'breath') {
      e.vx = 0; e.setAnim('breath');
      const wu = P.breath ?? 0.5;
      if (e.stateT > wu && e.stateT < wu + 0.7) {
        if (!e.did) { e.did = true; e.hid = nid(); audio.sfx('fire', { vol: 0.7, pitch: 0.7 }); }
        const mx = e.cx + e.facing * 36, my = e.bottom - 30;
        for (let i = 0; i < 2; i++) world.fx.emit('fire', mx, my, { angle: e.facing > 0 ? 0.05 : PI - 0.05, spread: 0.22, speed: rand(380, 520), grav: -120 });
        e.strike(26, -48, 150, 36, 0.55, { type: 'mag', element: 'fire', rehit: 0.25, hitId: e.hid, kb: [220, -200] });
      }
      if (e.stateT > wu + 0.95) { e.setState('walk'); e.breathCool = rand(2.2, 3.2); e.cool = 0.6; }
      return;
    }
    if (e.state === 'charge' && e.onGround) {
      e.trailT -= dt;
      if (e.trailT <= 0) {
        e.trailT = 0.1;
        addZone(world, { x: e.cx - 14, y: e.bottom - 20, w: 28, h: 20, delay: 0.12, life: 1.1, owner: e, render: ZONE_B.flametrail, noHit: false, data: { seed: rand(0, 50) },
          attack: atk(e, 0.4, { type: 'mag', element: 'fire', rehit: 0.5, kb: [80, -300], hitId: e.trailId }) });
      }
    }
    if (p && e.onGround && e.breathCool <= 0 && e.state !== 'charge' && e.state !== 'wind' && Math.abs(e.dxToPlayer()) < 190 && Math.abs(p.cy - e.cy) < 70) {
      faceP(e); e.setState('breath'); e.did = false; audio.sfx('boss_roar', { vol: 0.2, pitch: 1.8 }); return;
    }
    AI.charger.update(e, world, dt);
  },
};

/** 심연의 눈: 공중 포탑. 조준선이 플레이어를 추적(예비동작) → 잠금·깜빡임 → 쓸어내리는 광선 */
AI_B.eyebeam = {
  init(e) { e.cool = rand(1.2, 2); e.lookA = PI / 2; e.beamA = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    if (e.homeX === undefined) { e.homeX = e.cx; e.homeY = e.cy; }
    e.cool -= dt * e.aggro;
    // 제자리 부유
    hover(e, e.homeX + Math.sin(e.t * 0.7) * 16, e.homeY + Math.sin(e.t * 1.3) * 10, 2, dt, 60);
    const ex = e.cx, ey = e.cy;
    const want = angleTo(ex, ey, p.cx, p.cy - 10);
    const turn = (a, target, rate) => a + clamp(Math.atan2(Math.sin(target - a), Math.cos(target - a)), -rate * dt, rate * dt);
    e.lookA = turn(e.lookA, want, e.state === 'fire' ? 0 : 5);
    if (e.state === 'aim') {
      e.setAnim('aim');
      const T0 = P.aim ?? 1.1;
      if (e.stateT < T0 - 0.3) e.beamA = turn(e.beamA, want, 2.2);
      e.lookA = e.beamA;
      if (e.stateT > T0) {
        e.setState('fire'); e.hid = nid();
        const d = Math.atan2(Math.sin(want - e.beamA), Math.cos(want - e.beamA));
        e.sweepDir = d >= 0 ? 1 : -1;
        world.camera.shake(6, 0.25); audio.sfx('thunder', { vol: 0.6, pitch: 0.6 }); audio.sfx('dark', { vol: 0.6, pitch: 0.5 });
      }
      return;
    }
    if (e.state === 'fire') {
      e.setAnim('fire');
      e.beamA += e.sweepDir * (P.sweep ?? 0.55) / (P.fire ?? 0.9) * dt;
      e.lookA = e.beamA;
      if (e.stateT > (P.fire ?? 0.9)) { e.setState('recover'); }
      return;
    }
    if (e.state === 'recover') { e.setAnim('recover'); if (e.stateT > 0.7) { e.setState('idle'); e.cool = (P.rate ?? 2.4) * rand(0.9, 1.2); } return; }
    e.setAnim('idle');
    e.facing = Math.cos(e.lookA) >= 0 ? 1 : -1;
    if (e.cool <= 0 && e.distToPlayer() < (P.range ?? 720)) {
      e.setState('aim'); e.beamA = e.lookA;
      audio.sfx('charge_ready', { vol: 0.4, pitch: 0.5 });
      // 조준선 + 광선 (눈을 따라다니는 판정)
      ensureMag(e);
      const eye = e;
      addZone(world, { x: ex, y: ey, w: 1, h: 1, delay: (P.aim ?? 1.1), life: (P.fire ?? 0.9), owner: e, render: ZONE_B.beam, z: 7,
        attack: atk(e, 0.7, { type: 'mag', element: 'dark', rehit: 0.22, kb: [240, -300], hitId: 'eb' + (++_zid) }),
        follow: (z) => {
          if (eye.dead || eye.dying > 0 || (eye.state !== 'aim' && eye.state !== 'fire')) { z.dead = true; return; }
          const r = eye.def.size.w * 0.34;
          z.data.x0 = eye.cx + Math.cos(eye.beamA) * r; z.data.y0 = eye.cy + Math.sin(eye.beamA) * r;
          z.data.len = rayLen(world, z.data.x0, z.data.y0, eye.beamA, 1000);
          z.data.a = eye.beamA; z.data.aimK = eye.state === 'aim' ? clamp(eye.stateT / (P.aim ?? 1.1), 0, 1) : 1;
          const x1 = z.data.x0 + Math.cos(z.data.a) * z.data.len, y1 = z.data.y0 + Math.sin(z.data.a) * z.data.len;
          z.x = Math.min(z.data.x0, x1); z.y = Math.min(z.data.y0, y1); z.w = Math.abs(x1 - z.data.x0) + 1; z.h = Math.abs(y1 - z.data.y0) + 1;
          z.data.x1 = x1; z.data.y1 = y1;
          z.attack.dir = Math.cos(z.data.a) >= 0 ? 1 : -1;
          if (z.active && Math.random() < 0.5) world.fx.emit('spark', x1, y1, { color: '#ff8a6a', speed: 260 });
        },
        hitTest: (z, w) => {
          const hb = w.player.hurtbox();
          return segDist(hb.x + hb.w / 2, hb.y + hb.h / 2, z.data.x0, z.data.y0, z.data.x1, z.data.y1) < 16 + Math.min(hb.w, hb.h) * 0.5;
        },
        light: { r: 110, color: '#ff3a4a', i: 0.9 }, data: {} });
    }
  },
};

/** 그림자 헌터: 플레이어의 입력(공격·점프·대시)을 한 박자 늦게 따라 하는 거울 그림자 */
AI_B.shadow = {
  init(e) { e.uid = ++_zid; e.rig = {}; e.q = []; e.mv = null; e.mvT = 0; e.heroAnim = 'idle'; e.heroAnimT = 0; e.lastHitId = null; e.dashT = 0; e.idleT = 0; e.pWasGround = true; e.pDash = 0; e.hitN = 0; e.hitT = 0; },
  queue(e, type, data) { if (e.q.length < 12) e.q.push({ at: e.t + (e.params.delay ?? 0.28) / Math.sqrt(e.aggro), type, data }); },
  startMove(e, world, mv) {
    if (!mv) return;
    e.mv = mv; e.mvT = 0; e.mvDone = false; e.mvN = (e.mvN ?? 0) + 1;
    faceP(e);
    if (mv.lunge) e.vx = e.facing * mv.lunge * 0.9;
    if (mv.vx) e.vx = e.facing * mv.vx;
    if (mv.vy && !e.onGround) e.vy = mv.vy;
  },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.hitT -= dt; if (e.hitT <= 0) e.hitN = 0;
    // ── 플레이어 관찰 → 행동 예약 ──
    if (p.curHitId && p.curHitId !== e.lastHitId && p.move) { e.lastHitId = p.curHitId; this.queue(e, 'move', p.move); }
    if (!p.onGround && e.pWasGround && p.vy < -200) this.queue(e, 'jump', p.vy);
    if (p.dashT > 0 && e.pDash <= 0) this.queue(e, 'dash', null);
    e.pWasGround = p.onGround; e.pDash = p.dashT;
    // ── 예약 실행 ──
    while (e.q.length && e.q[0].at <= e.t) {
      const a = e.q.shift();
      if (a.type === 'move' && !e.mv) this.startMove(e, world, a.data);
      else if (a.type === 'jump' && e.onGround && !e.mv) { e.vy = Math.max(-900, a.data * 0.95); audio.sfx('jump', { vol: 0.3, pitch: 0.7 }); }
      else if (a.type === 'dash' && !e.mv) { faceP(e); e.dashT = 0.2; e.vx = e.facing * 620; puff(world, 'dark', e.cx, e.cy, 8, { speed: 60 }); audio.sfx('dash', { vol: 0.4, pitch: 0.7 }); }
    }
    // ── 이동 ──
    const dx = e.dxToPlayer(), adx = Math.abs(dx);
    if (e.dashT > 0) {
      e.dashT -= dt;
      if (Math.random() < 0.6) world.fx.emit('dark', e.cx - e.facing * 10, e.cy + rand(-20, 20), { speed: 20 });
    } else if (e.mv) {
      e.vx *= e.onGround ? 0.86 : 0.98;
    } else if (seesP(e, p, P.sight ?? 700, 300)) {
      faceP(e);
      const keep = P.keep ?? 120;
      const want = adx > keep + 30 ? e.facing : adx < keep - 50 ? -e.facing : 0;
      const tv = want * e.speed;
      e.vx += (tv - e.vx) * Math.min(1, 10 * dt);
      if (want && e.onGround && !canMove(e, want)) {
        if (e.wallAhead() && want === e.facing) e.vy = -760; else e.vx = 0;
      }
      // 플레이어가 멀리서 가만히 있으면 직접 파고듦
      e.idleT = Math.abs(p.vx) < 20 && !p.move ? e.idleT + dt : 0;
      if (e.idleT > 1.4 * (1 / e.aggro) && adx < 420 && e.onGround && p.moveSet?.ground?.[0]) {
        e.idleT = 0; e.dashT = 0.18; e.vx = e.facing * 640;
        this.queue(e, 'move', p.moveSet.ground[0]);
        e.q[e.q.length - 1].at = e.t + 0.16;
      }
    } else e.vx *= 0.8;
    // ── 공격 판정 (플레이어 동작 데이터를 그대로 사용) ──
    if (e.mv) {
      const mv = e.mv;
      e.mvT += dt;
      const t = e.mvT, h = mv.hit || [0, 0];
      if (t >= h[0] && !e.mvDone) {
        e.mvDone = true;
        audio.sfx(mv.sfx ?? 'slash', { vol: 0.5, pitch: 0.75 });
        if (mv.slash) {
          const s = mv.slash, ang = e.facing > 0 ? s.angle ?? 0 : PI - (s.angle ?? 0);
          world.fx.slash(e.cx + e.facing * 10, e.bottom - 58, ang, { radius: s.r, arc: s.arc, width: s.width, color: '#b060ff', life: 0.14 });
        }
        if (mv.proj) {
          const pr = mv.proj, base = pr.angle !== undefined ? (e.facing > 0 ? pr.angle : PI - pr.angle) : (e.facing > 0 ? 0 : PI);
          ensureMag(e);
          bolt(e, { x: e.cx + e.facing * (pr.offX ?? 30), y: e.bottom + (pr.offY ?? -60), vx: Math.cos(base) * Math.min(700, pr.speed ?? 500), vy: Math.sin(base) * Math.min(700, pr.speed ?? 500), w: 14, h: 10, render: PROJ_B.darkbolt, life: Math.min(1.2, pr.life ?? 0.8),
            light: { r: 50, color: '#b060ff', i: 0.6 }, attack: { mv: 0.9, element: 'dark' } });
        }
      }
      if (mv.box && t >= h[0] && t <= h[1]) {
        const b = mv.box;
        e.strike(b.x, b.y, b.w, b.h, (mv.mv ?? 1) * 0.9, { kb: mv.kb ? [mv.kb[0] * 1.4, mv.kb[1] - 120] : [300, -260], hitId: 'shd' + e.uid + '_' + e.mvN, element: 'dark' });
      }
      if (t >= (mv.dur ?? 0.4)) e.mv = null;
    }
    // ── 애니메이션 (hero 렌더러용) ──
    let an = 'idle';
    if (e.mv) an = e.mv.anim;
    else if (e.dashT > 0) an = 'dash';
    else if (!e.onGround) an = e.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(e.vx) > 30) an = 'run';
    if (an !== e.heroAnim) { e.heroAnim = an; e.heroAnimT = 0; } else e.heroAnimT += dt;
    e.setAnim(an === 'idle' || an === 'run' ? an : 'act');
  },
  onHit(e, world) {
    e.hitN++; e.hitT = 1;
    // 연속으로 맞으면 그림자 속으로 물러난다
    if (e.hitN >= 4 && e.dashT <= 0) {
      e.hitN = 0; e.mv = null; e.q.length = 0;
      e.facing = Math.sign(e.dxToPlayer()) || e.facing;
      e.dashT = 0.22; e.vx = -e.facing * 700; e.vy = -300; e.stun = 0;
      puff(world, 'dark', e.cx, e.cy, 16, { speed: 140 });
      audio.sfx('mist', { vol: 0.5, pitch: 0.7 });
    }
  },
};

/** 공허의 악마: 부유 → 유도 공허구 / 끌어당기는 균열 / 공간 도약 후 할퀴기 */
AI_B.voider = {
  init(e) { e.cool = rand(1, 2); e.side = chance(0.5) ? 1 : -1; e.pick = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.cool -= dt * e.aggro;
    switch (e.state) {
      case 'cast':
        e.vx *= 0.9; e.vy *= 0.9; e.setAnim('cast'); faceP(e);
        if (e.stateT > 0.6 && !e.did) {
          e.did = true;
          for (let i = 0; i < 2; i++) {
            const a = (e.facing > 0 ? 0 : PI) + (i ? -0.7 : 0.7);
            bolt(e, { x: e.cx + e.facing * 20, y: e.cy - 10, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, w: 20, h: 20, render: PROJ_B.voidorb, behavior: 'homing', homingTurn: 2.2, homingDelay: 0.3, life: 3.6, speed: 250,
              light: { r: 60, color: '#b060ff', i: 0.6 }, attack: { mv: 1.0, element: 'dark' } });
          }
          audio.sfx('dark', { vol: 0.6 });
        }
        if (e.stateT > 1.0) { e.setState('float'); e.cool = (P.rate ?? 2.3) * rand(0.9, 1.2); }
        return;
      case 'rift':
        e.vx *= 0.9; e.vy *= 0.9; e.setAnim('rift'); faceP(e);
        if (e.stateT > 0.5 && !e.did) {
          e.did = true;
          const rx = p.cx + (Math.sign(p.cx - e.cx) || 1) * 110, ry = p.bottom - 60;
          addZone(world, { x: rx - 22, y: ry - 34, w: 44, h: 68, delay: 0.6, life: 2.2, owner: e, render: ZONE_B.rift, light: { r: 90, color: '#b060ff', i: 0.7 }, data: {},
            attack: atk(e, 0.9, { type: 'mag', element: 'dark', rehit: 0.45, kb: [100, -200], hitId: 'vr' + (++_zid) }),
            tick: (z, w, dtt) => {
              if (!z.active) return;
              const pl = w.player; if (!pl || pl.dead) return;
              const d = z.cx - pl.cx, ad = Math.abs(d);
              if (ad < 280 && Math.abs(z.cy - pl.cy) < 160) pl.x += Math.sign(d) * Math.min(ad, 150 * (1 - ad / 320) * dtt);
              if (Math.random() < 0.5) { const a = rand(0, TAU), r = rand(60, 110); w.fx.emit('magic', z.cx + Math.cos(a) * r, z.cy + Math.sin(a) * r, { vx: -Math.cos(a) * 180, vy: -Math.sin(a) * 180, speed: 0, color: '#b060ff', grav: 0 }); }
            } });
          audio.sfx('dark', { vol: 0.5, pitch: 0.5 });
        }
        if (e.stateT > 0.9) { e.setState('float'); e.cool = (P.rate ?? 2.3) * rand(1, 1.3); }
        return;
      case 'blink':
        e.setAnim('blink'); e.vx = 0; e.vy = 0; e.alpha = 1 - clamp(e.stateT / 0.3, 0, 1); e.invuln = e.stateT > 0.15;
        if (e.stateT > 0.35) {
          const side = -(Math.sign(p.facing) || 1);
          e.cx = p.cx + side * 90; e.bottom = p.bottom - 10;
          e.facing = -side;
          puff(world, 'dark', e.cx, e.cy, 18, { speed: 160 });
          world.fx.ring(e.cx, e.cy, { color: '#b060ff', r0: 60, r1: 6, life: 0.3, width: 4 });
          e.setState('claw'); e.did = false; e.alpha = 1; e.invuln = false;
          audio.sfx('mist', { vol: 0.5, pitch: 0.6 });
        }
        return;
      case 'claw':
        e.setAnim('claw'); e.vx *= 0.8; e.vy *= 0.8;
        if (e.stateT > 0.42 && !e.did) { e.did = true; e.strike(-6, -90, 86, 76, 1.5, { element: 'dark', hitId: 'vc' + (++_zid), kb: [380, -360] }); audio.sfx('slash_heavy', { pitch: 1.2 }); world.camera.shake(4, 0.12); }
        if (e.stateT > 0.85) { e.setState('float'); e.cool = (P.rate ?? 2.3) * rand(0.9, 1.2); }
        return;
    }
    const keep = P.keep ?? 260;
    if (Math.abs(p.cx - e.cx) > keep * 2.2) e.side = Math.sign(e.cx - p.cx) || 1;
    sideFor(e, world, p, keep);
    hover(e, p.cx + e.side * keep, p.bottom - 90 + Math.sin(e.t * 1.2) * 18, 1.6, dt, e.speed * 1.5);
    faceP(e); e.setAnim('float');
    if (e.cool <= 0 && e.distToPlayer() < 560) {
      e.pick = (e.pick + 1) % 3;
      if (e.pick === 0) { e.setState('blink'); audio.sfx('dark', { vol: 0.3, pitch: 1.6 }); }
      else if (e.pick === 1) { e.setState('cast'); e.did = false; }
      else { e.setState('rift'); e.did = false; }
    }
  },
};
