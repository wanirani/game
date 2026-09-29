// 추가 AI 행동 A (적 담당 A가 확장): AI_A[name] = { init, update, onHit?, onDie? }
// 모든 공격은 예비동작(애니메이션 + 반짝임)을 거친 뒤 발동한다. 쿨다운은 e.aggro(난이도 공격성)로 나눈다.
// 주의: ai.js 와 순환 import — AI 는 함수 안에서만 사용한다.
import { AI } from './ai.js';
import { rand, randi, chance, clamp, lerp, angleTo, wrapAngle, ease, TAU } from '../core/math.js';
import { audio } from '../core/audio.js';
import { isSolidType } from '../core/physics.js';
import { TILE } from '../core/game.js';
import { enemyStrike } from './combat.js';
import { Hitbox } from './projectiles.js';
import { ENEMY_VEC } from '../render/enemies.js';

let _hid = 0;

// 벡터 그림(render/enemies_a.js)은 늦게 받는다 (R1-REQ-229: 첫 화면 번들에서 뺀다). 그리는 순간에 ENEMY_VEC.a 에서 찾고,
// 아직 없으면 그 프레임은 그리지 않는다. 대리 함수는 키마다 하나 (투사체마다 새 함수를 만들지 않게)
const _PA = Object.create(null);
const PA = (k) => _PA[k] ??= (ctx, p, w) => ENEMY_VEC.a?.PROJ_A?.[k]?.(ctx, p, w);
const drawFlamePillar = (ctx, h, w) => ENEMY_VEC.a?.drawFlamePillar?.(ctx, h, w);
const drawPhantomGhost = (ctx, x, y, a, al) => ENEMY_VEC.a?.drawPhantomGhost?.(ctx, x, y, a, al);

// ───────────────────────── 공용 도우미 ─────────────────────────
/** 적 스탯엔 mag 가 없으므로 마법 공격 전에 atk 로 채움 */
function ensureMag(e) { if (e.stats.mag == null) e.stats.mag = e.stats.atk; }
/** 비행: 목표점으로 부드럽게 가속 */
function hover(e, tx, ty, accel, dt, maxSp) {
  const dx = tx - e.cx, dy = ty - e.cy, d = Math.hypot(dx, dy) || 1;
  const sp = Math.min(maxSp, d * 3);
  const k = Math.min(1, accel * dt);
  e.vx += (dx / d * sp - e.vx) * k;
  e.vy += (dy / d * sp - e.vy) * k;
}
function solidAt(world, x, y) { return isSolidType(world.map.typeAtPx(x, y)); }
/** dir 방향으로 이동 가능? (낭떠러지/벽 검사, 뒷걸음질 포함) */
function canMove(e, dir) {
  if (!e.onGround) return true;
  const f = e.facing; e.facing = dir;
  const ok = e.groundAhead() && !e.wallAhead();
  e.facing = f;
  return ok;
}
/** 아래로 첫 지면 y */
function groundBelow(world, x, y, maxDist = 480) {
  for (let yy = y; yy < y + maxDist; yy += TILE / 3) {
    const t = world.map.typeAtPx(x, yy);
    if (isSolidType(t) || t === 2) return Math.floor(yy / TILE) * TILE;
  }
  return null;
}
function patrol(e, mul = 0.6) {
  e.vx = e.facing * e.speed * mul;
  if (e.onGround && (!e.groundAhead() || e.wallAhead())) e.facing *= -1;
}

export const AI_A = {};

// ───────────────────────── 황금 박쥐: 도망 다니는 보너스 ─────────────────────────
AI_A.fleer = {
  init(e) { e.life = e.params.life ?? 7.5; e.harmless = true; e.jx = 0; e.jy = 0; e.jt = 0; e.setState('flee'); e.homeY = e.y; e.twinkle = 0; },
  update(e, world, dt) {
    const p = e.player;
    e.setAnim('fly');
    // 가짜 벽 너머 숨은 방(s02 r3)에 둔 황금 박쥐: 벽이 드러나기 전에는 멈춰 기다린다 (먼저 깨어 달아나 버리지 않게)
    if (e.state !== 'escape' && world.inUnrevealedFake?.(e)) { e.vx = 0; e.vy = 0; return; }
    e.twinkle -= dt;
    if (e.twinkle <= 0) { e.twinkle = 0.07; world.fx.emit('gold', e.cx + rand(-8, 8), e.cy + rand(-6, 6), { speed: 30 }); }
    if (e.state === 'escape') {
      // 천장도 무시하고 하늘로 사라짐
      e.y -= 360 * dt; e.vx = 0; e.vy = 0; e.invuln = true;
      if (e.stateT > 0.9) e.dead = true;
      return;
    }
    e.life -= dt;
    if (e.life <= 0) {
      e.setState('escape'); e.life = 0;
      audio.sfx('bat', { pitch: 1.6, vol: 0.6 });
      world.fx.text(e.cx, e.y - 10, '놓쳤다…', { color: '#ffe070', size: 16 });
      return;
    }
    e.jt -= dt;
    if (e.jt <= 0) { e.jt = rand(0.22, 0.5); e.jx = rand(-1, 1); e.jy = rand(-1, 1); }
    let ax = e.jx * 0.6, ay = e.jy * 0.9;
    if (p) {
      const dx = e.cx - p.cx, dy = e.cy - p.cy, d = Math.hypot(dx, dy) || 1;
      const scare = clamp(1 - d / (e.params.wake ?? 420), 0, 1);
      ax += dx / d * scare * 2.4; ay += dy / d * scare * 1.1;
    }
    ay += clamp((e.homeY - e.y) / 120, -1.2, 1.2);
    e.vx += (ax * e.speed - e.vx) * Math.min(1, 4 * dt);
    e.vy += (ay * e.speed - e.vy) * Math.min(1, 4 * dt);
    if (Math.abs(e.vx) > 5) e.facing = Math.sign(e.vx);
  },
  onDie(e, world) {
    const lv = e.stats.level ?? 1;
    for (let i = 0; i < 12; i++) world.spawnPickup('gold', e.cx, e.cy, { amount: randi(4, 10) * lv, vx: rand(-260, 260), vy: rand(-640, -300) });
    world.fx.burst('gold', e.cx, e.cy, 30, { speed: 260 });
    world.fx.ring(e.cx, e.cy, { color: '#ffd84a', r0: 8, r1: 90, life: 0.4, width: 6 });
    world.fx.text(e.cx, e.y - 24, 'BONUS!', { color: '#ffe070', size: 28, crit: true });
    audio.sfx('coin', { pitch: 1.2 });
  },
};

// ───────────────────────── 흡혈 박쥐: 천장에 매달림(없으면 제자리 날갯짓) → 떨어지며 급강하 → 사인파 비행 ─────────────────────────
AI_A.vbat = {
  init(e) { e.phase = rand(0, TAU); e.placed = false; e.setState('hang'); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!e.placed) {
      // 배치 보정: 위쪽 4타일 안에 천장이 있으면 그 밑에 매달리고, 없으면 공중에서 날갯짓하며 대기
      e.placed = true;
      let ceil = null;
      for (let yy = e.y; yy > e.y - TILE * 4; yy -= TILE / 4) if (solidAt(world, e.cx, yy)) { ceil = (Math.floor(yy / TILE) + 1) * TILE; break; }
      if (ceil != null && P.hang !== false) { e.y = ceil + 2; e.setState('hang'); }
      else { if (solidAt(world, e.cx, e.bottom + 4)) e.y -= 60; e.setState('hover'); }
      e.baseY = e.y; e.hx = e.cx;
    }
    if (!p) return;
    const dx = p.cx - e.cx, adx = Math.abs(dx);
    const wake = (P.wake ?? 260);
    switch (e.state) {
      case 'hang':
        e.vx = 0; e.vy = 0; e.setAnim('hang');
        if (adx < wake && p.bottom > e.y - 20 && p.y - e.bottom < 420) { e.setState('drop'); e.facing = Math.sign(dx) || 1; audio.sfx('bat', { vol: 0.5 }); }
        return;
      case 'hover':
        e.setAnim('fly');
        e.phase += dt * 3;
        e.vx = (e.hx + Math.sin(e.phase * 0.5) * 16 - e.cx) * 2; e.vy = (e.baseY + Math.sin(e.phase) * 8 - e.y) * 3;
        e.facing = Math.sign(dx) || e.facing;
        if (adx < wake && Math.abs(p.cy - e.cy) < 300) { e.setState('drop'); audio.sfx('bat', { vol: 0.5 }); }
        return;
      case 'drop':
        // 예비동작: 날개를 펴며 살짝 떨어짐 (0.28초)
        e.setAnim('fly'); e.facing = Math.sign(dx) || e.facing;
        e.vx *= 0.8; e.vy = 90 * (1 - e.stateT / 0.28);
        if (e.stateT > 0.28 / Math.sqrt(e.aggro)) {
          const a = angleTo(e.cx, e.cy, p.cx, p.cy - 12), sp = e.speed * 2.3;
          e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp; e.setState('dive');
        }
        return;
      case 'dive':
        e.setAnim('fly');
        if (e.stateT > 0.5 || (e.vy > 0 && e.cy > p.cy + 10) || solidAt(world, e.cx, e.bottom + 4)) { e.setState('fly'); e.baseY = Math.min(e.y, p.y + 10); e.facing = Math.sign(e.vx) || e.facing; }
        return;
    }
    // 사인파 비행 (지나쳐 멀어지면 되돌아옴)
    e.setAnim('fly');
    e.phase += dt * (P.freq ?? 5);
    e.vx = e.facing * e.speed * 1.4;
    e.vy = Math.cos(e.phase) * (P.amp ?? 150) + (e.baseY - e.y) * 0.8;
    if (e.stateT > 1.1 && Math.sign(dx) !== e.facing && adx > 220) { e.facing *= -1; e.setState('fly'); }
    else if (e.stateT > 0.3 && solidAt(world, e.cx + e.facing * (e.w / 2 + 6), e.cy)) { e.facing *= -1; e.setState('fly'); }
  },
};

// ───────────────────────── 시체 까마귀: 앉아 있다가 울고 급강하 ─────────────────────────
AI_A.diver = {
  init(e) { e.setState(e.params.perch === false ? 'hover' : 'perch'); e.cool = rand(0.6, 1.4); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx;
    switch (e.state) {
      case 'perch':
        e.vx = 0; e.vy = 0; e.setAnim('perch');
        if (Math.abs(dx) < (P.wake ?? 330) && Math.abs(p.cy - e.cy) < 280) { e.facing = Math.sign(dx) || 1; e.setState('alert'); audio.sfx('bat', { pitch: 0.55, vol: 0.6 }); }
        return;
      case 'alert':
        e.setAnim('alert'); e.vx *= 0.85; e.vy *= 0.85;
        e.facing = Math.sign(dx) || e.facing;
        if (e.stateT > (P.alert ?? 0.45) / Math.sqrt(e.aggro)) {
          const a = angleTo(e.cx, e.cy, p.cx, p.cy - 10), sp = P.diveSpeed ?? 500;
          e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
          e.setState('dive');
        }
        return;
      case 'dive':
        e.setAnim('dive');
        e.vx *= 1 + dt * 0.6; e.vy *= 1 + dt * 0.6;
        if (e.stateT > 0.85 || solidAt(world, e.cx, e.bottom + 6) || (e.vy > 0 && e.cy > p.cy + 70)) e.setState('climb');
        return;
      case 'climb':
        e.setAnim('fly');
        e.vy += (-260 - e.vy) * Math.min(1, 5 * dt); e.vx *= 0.97;
        if (e.stateT > 0.6) { e.setState('hover'); e.cool = rand(1.3, 2.3); }
        return;
      default: {
        e.setAnim('fly');
        const side = Math.sign(e.cx - p.cx) || 1;
        hover(e, p.cx + side * 170, p.cy - 150 + Math.sin(e.t * 2) * 20, 3, dt, e.speed * 1.4);
        e.facing = Math.sign(dx) || e.facing;
        e.cool -= dt * e.aggro;
        if (e.cool <= 0) { e.setState('alert'); audio.sfx('bat', { pitch: 0.55, vol: 0.6 }); }
      }
    }
  },
};

// ───────────────────────── 도깨비불: 거리 유지 + 부풀어 오른 뒤 3갈래 혼불 ─────────────────────────
AI_A.wisp = {
  init(e) { e.cool = rand(1.2, 2.2); e.phase = rand(0, TAU); e.side = chance(0.5) ? 1 : -1; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    e.phase += dt * 2;
    if (e.state === 'charge') {
      e.setAnim('charge'); e.vx *= 0.9; e.vy *= 0.9;
      if (e.stateT >= (P.chargeT ?? 0.55)) {
        const n = P.count ?? 3, base = angleTo(e.cx, e.cy, p.cx, p.cy);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.28;
          e.shoot({ x: e.cx, y: e.cy, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, w: 12, h: 12, render: PA('soulfire'), life: 3.2, light: { r: 50, color: '#40ffc0', i: 0.7 }, attack: { mv: 0.8, type: 'mag', element: 'fire' } });
        }
        audio.sfx('fire', { vol: 0.4, pitch: 1.4 });
        world.fx.burst('magic', e.cx, e.cy, 8, { color: '#80ffd8' });
        e.setState('drift'); e.cool = P.rate ?? 2.6;
      }
      return;
    }
    e.setAnim('fly');
    if (Math.abs(p.cx - e.cx) < 60) e.side = Math.sign(e.cx - p.cx) || e.side;
    const keep = P.keep ?? 190;
    hover(e, p.cx + e.side * keep + Math.cos(e.phase) * 40, p.cy - 70 + Math.sin(e.phase * 1.3) * 40, 2, dt, e.speed);
    e.facing = Math.sign(p.cx - e.cx) || e.facing;
    e.cool -= dt * e.aggro;
    if (e.cool <= 0 && e.distToPlayer() < 480) { e.setState('charge'); audio.sfx('magic', { vol: 0.3, pitch: 1.6 }); }
  },
};

// ───────────────────────── 무덤지기: 삽 내려찍기(충격파) / 흙덩이 투척 ─────────────────────────
AI_A.digger = {
  init(e) { e.cool = rand(0.6, 1.2); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx, adx = Math.abs(dx);
    if (e.state === 'slam') {
      e.vx *= 0.8; e.setAnim('slam');
      const wu = P.slamWind ?? 0.7;
      if (e.stateT >= wu && !e.didHit) {
        e.didHit = true;
        e.strike(8, -118, 114, 118, 1.8, { kb: [380, -420] });
        const gx = e.cx + e.facing * 72;
        world.camera.shake(7, 0.3);
        world.fx.burst('dust', gx, e.bottom - 4, 14, { speed: 160 });
        world.fx.burst('shard', gx, e.bottom - 6, 8, { color: '#5a4230' });
        world.fx.ring(gx, e.bottom - 2, { color: '#ffcf90', r0: 6, r1: 60, life: 0.3, width: 4 });
        audio.sfx('hit_heavy', { pitch: 0.7 }); audio.sfx('break_wall', { vol: 0.5, pitch: 0.8 });
        // 땅을 타고 달리는 충격파
        e.shoot({ x: gx, y: e.bottom - 14, vx: e.facing * 340, vy: 0, w: 26, h: 28, render: PA('dirtwave'), life: 0.9, attack: { mv: 1.1, kb: [260, -380] } });
      }
      if (e.stateT > (P.slamTime ?? 1.4)) { e.setState('walk'); e.cool = P.rate ?? 1.6; }
      return;
    }
    if (e.state === 'fling') {
      e.vx *= 0.8; e.setAnim('fling');
      const wu = P.flingWind ?? 0.5;
      if (e.stateT >= wu && !e.didHit) {
        e.didHit = true;
        for (let i = 0; i < 3; i++) {
          const vx = clamp(dx * 1.1, -420, 420) * (0.7 + i * 0.25);
          e.shoot({ x: e.cx + e.facing * 30, y: e.y + 30, vx, vy: -560 - i * 90, w: 16, h: 16, behavior: 'arc', gravity: 0.9, render: PA('clod'), spin: 8 * e.facing, life: 3, collideWalls: false, attack: { mv: 0.9 } });
        }
        world.fx.burst('dust', e.cx + e.facing * 20, e.bottom - 4, 8, {});
        audio.sfx('axe', { vol: 0.5, pitch: 0.6 });
      }
      if (e.stateT > (P.flingTime ?? 1.05)) { e.setState('walk'); e.cool = P.rate ?? 1.6; }
      return;
    }
    e.cool -= dt * e.aggro;
    const sees = adx < (P.sight ?? 460) && Math.abs(p.cy - e.cy) < 180;
    if (sees) {
      e.facing = Math.sign(dx) || e.facing;
      if (e.cool <= 0 && e.onGround) {
        if (adx < (P.melee ?? 118)) { e.setState('slam'); e.didHit = false; e.vx = 0; audio.sfx('boss_roar', { vol: 0.25, pitch: 1.5 }); return; }
        if (adx > 170 && chance(0.6)) { e.setState('fling'); e.didHit = false; e.vx = 0; return; }
      }
      e.vx = canMove(e, e.facing) ? e.facing * e.speed * (adx > 140 ? 1.2 : 0.8) : 0;
    } else patrol(e, 0.6);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

// ───────────────────────── 진흙 인간: 솟아오름 / 가라앉아 이동 / 주먹 / 진흙 투척 ─────────────────────────
AI_A.mud = {
  init(e) { e.setState('rise'); e.harmless = true; e.cool = rand(0.8, 1.6); e.sinkCool = rand(3.5, 5.5); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx, adx = Math.abs(dx);
    switch (e.state) {
      case 'rise':
        e.vx = 0; e.setAnim('rise'); e.harmless = true; e.invuln = false;
        if (e.stateT > 0.9) { e.setState('walk'); e.harmless = false; e.facePlayer(); }
        return;
      case 'sink':
        e.vx = 0; e.setAnim('sink'); e.harmless = true;
        if (e.stateT > 0.6) { e.setState('under'); e.invuln = true; }
        return;
      case 'under':
        e.setAnim('under'); e.harmless = true; e.invuln = true;
        e.facing = Math.sign(dx) || e.facing;
        e.vx = canMove(e, e.facing) ? e.facing * 170 : 0;
        if (Math.random() < dt * 10) world.fx.emit('dust', e.cx + rand(-14, 14), e.bottom - 2, { color: '#5a4230', speed: 30 });
        if ((adx < 36 && e.stateT > 0.4) || e.stateT > 1.4) { e.vx = 0; e.setState('rise'); e.sinkCool = rand(4, 6); audio.sfx('splash', { vol: 0.5, pitch: 0.7 }); }
        return;
      case 'punch':
        e.vx *= 0.8; e.setAnim('punch');
        if (e.stateT >= (P.punchWind ?? 0.5) && !e.didHit) {
          e.didHit = true;
          e.strike(6, -64, 62, 42, 1.3, { kb: [320, -240] });
          audio.sfx('hit', { pitch: 0.6 });
          world.fx.burst('dust', e.cx + e.facing * 40, e.cy - 10, 5, { color: '#5a4230' });
        }
        if (e.stateT > 0.95) { e.setState('walk'); e.cool = rand(1.2, 2); }
        return;
      case 'throw':
        e.vx *= 0.8; e.setAnim('throw');
        if (e.stateT >= (P.throwWind ?? 0.55) && !e.didHit) {
          e.didHit = true;
          e.shoot({ x: e.cx + e.facing * 8, y: e.y + 6, vx: clamp(dx * 1.25, -440, 440), vy: -600, w: 16, h: 16, behavior: 'arc', gravity: 0.9, render: PA('mud'), spin: 6, life: 3, collideWalls: false, attack: { mv: 1.0 },
            onExpire: (pr, w) => w.fx.burst('dust', pr.cx, pr.cy, 6, { color: '#5a4230' }) });
          audio.sfx('splash', { vol: 0.5 });
        }
        if (e.stateT > 1.0) { e.setState('walk'); e.cool = rand(1.4, 2.2); }
        return;
    }
    e.cool -= dt * e.aggro; e.sinkCool -= dt * e.aggro;
    e.facing = Math.sign(dx) || e.facing;
    const sees = adx < (P.sight ?? 440) && Math.abs(p.cy - e.cy) < 200;
    if (sees && e.onGround) {
      if (e.cool <= 0 && adx < 72) { e.setState('punch'); e.didHit = false; return; }
      if (e.cool <= 0 && adx > 150 && adx < 420 && chance(0.5)) { e.setState('throw'); e.didHit = false; return; }
      if (e.sinkCool <= 0 && adx > 180) { e.setState('sink'); audio.sfx('splash', { vol: 0.5, pitch: 0.6 }); return; }
    }
    e.vx = canMove(e, e.facing) ? e.facing * e.speed * (sees ? 1 : 0.5) : 0;
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
  onHit(e, world, attack, info) { world.fx.burst('blood', info?.hx ?? e.cx, info?.hy ?? e.cy, 6, { color: '#4a3424' }); },
};

// ───────────────────────── 도끼 갑옷: 높게/낮게 던져 되돌아오는 도끼 ─────────────────────────
AI_A.axeKnight = {
  init(e) { e.cool = rand(0.8, 1.6); e.axeOut = false; e.high = true; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx, adx = Math.abs(dx);
    if (e.state === 'throw') {
      e.vx = 0; e.setAnim('throw');
      const wu = P.windup ?? 0.55;
      if (e.stateT >= wu && !e.thrown) {
        e.thrown = true; e.axeOut = true;
        const dir = e.facing, owner = e;
        const y = e.high ? e.bottom - 70 : e.bottom - 20;
        const x0 = e.cx + dir * 24, D = clamp(adx + 70, 200, P.range ?? 540), T = 0.75;
        e.shoot({
          x: x0, y, vx: dir * 400, vy: 0, w: 28, h: 28, behavior: 'beam', collideWalls: false, pierce: 99, render: PA('axeSpin'), spin: 18 * dir, life: 3.2,
          attack: { mv: 1.2, kb: [300, -260], rehit: 0.6 },
          follow: (pr) => {
            const t = pr.t;
            let x;
            if (t < T) x = x0 + dir * D * ease.outQuad(t / T);
            else {
              const k = Math.min(1, (t - T) / T);
              const hx = owner.dead ? x0 : owner.cx + dir * 20;
              x = lerp(x0 + dir * D, hx, ease.inQuad(k));
              if (k >= 1) { pr.dead = true; owner.axeOut = false; }
            }
            pr.x = x - pr.w / 2; pr.y = y - pr.h / 2;
            pr.attack.dir = t < T ? dir : -dir;
          },
          onExpire: () => { owner.axeOut = false; },
        });
        audio.sfx('axe', { vol: 0.6 });
      }
      if (e.stateT > wu + 0.45) { e.setState('walk'); e.cool = P.rate ?? 2.2; }
      return;
    }
    e.cool -= dt * e.aggro;
    e.facing = Math.sign(dx) || e.facing;
    if (!e.axeOut && e.cool <= 0 && adx < (P.range ?? 540) && Math.abs(p.cy - e.cy) < 160 && e.onGround) {
      e.setState('throw'); e.thrown = false; e.high = chance(0.5);
      return;
    }
    const keep = P.keep ?? 270;
    let mv = 0;
    if (adx < keep * 0.6) mv = -e.facing; else if (adx > keep * 1.3 && adx < 700) mv = e.facing;
    e.vx = mv && canMove(e, mv) ? mv * e.speed : 0;
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

// ───────────────────────── 가고일: 석상 → 각성 → 비행하며 화염 3연발 / 급강하 ─────────────────────────
AI_A.gargoyle = {
  init(e) { e.setState('statue'); e.harmless = true; e.cool = rand(1, 1.8); e.side = 1; },
  wake(e) { if (e.state !== 'statue') return; e.setState('wake'); audio.sfx('boss_roar', { vol: 0.3, pitch: 1.8 }); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx, adx = Math.abs(dx);
    switch (e.state) {
      case 'statue':
        e.vx = 0; e.vy = 0; e.setAnim('statue'); e.harmless = true;
        if (adx < (P.wake ?? 240) && Math.abs(p.cy - e.cy) < 220) { e.facing = Math.sign(dx) || e.facing; AI_A.gargoyle.wake(e); }
        return;
      case 'wake':
        e.vx = 0; e.vy = 0; e.setAnim('wake');
        if (Math.random() < dt * 20) world.fx.emit('dust', e.cx + rand(-20, 20), e.cy + rand(-10, 20), { color: '#8a8480' });
        if (e.stateT > 0.7) {
          e.setState('fly'); e.harmless = false; e.side = Math.sign(e.cx - p.cx) || 1; e.vy = -220;
          world.fx.burst('shard', e.cx, e.cy, 12, { color: '#8a8480' });
          audio.sfx('break_wall', { vol: 0.5, pitch: 1.2 });
        }
        return;
      case 'breath': {
        e.setAnim('breath'); e.vx *= 0.9; e.vy *= 0.9; e.facing = Math.sign(dx) || e.facing;
        const wu = P.breathWind ?? 0.6;
        if (e.stateT >= wu && !e.fired) {
          e.fired = true;
          const mx = e.cx + e.facing * 22, my = e.cy - 10;
          const base = angleTo(mx, my, p.cx, p.cy);
          for (let i = -1; i <= 1; i++) {
            const a = base + i * 0.22;
            e.shoot({ x: mx, y: my, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, w: 16, h: 16, render: 'fireball', color: '#ff7a2a', life: 3, light: { r: 60, color: '#ff7a2a' }, trail: 'ember', attack: { mv: 1.0, element: 'fire' } });
          }
          audio.sfx('fire', { vol: 0.6 });
          world.fx.burst('fire', mx, my, 8, {});
        }
        if (e.stateT > wu + 0.4) { e.setState('fly'); e.cool = P.rate ?? 2.6; }
        return;
      }
      case 'swoop':
        e.setAnim('swoop');
        if (e.stateT < 0.35) { e.vx *= 0.85; e.vy += (-80 - e.vy) * 0.1; e.facing = Math.sign(dx) || e.facing; e.tx = p.cx; e.ty = p.cy; }
        else if (!e.fired) { e.fired = true; const a = angleTo(e.cx, e.cy, e.tx, e.ty); e.vx = Math.cos(a) * 480; e.vy = Math.sin(a) * 480; audio.sfx('dash', { vol: 0.5, pitch: 0.8 }); }
        else e.setAnim('dive');
        if (e.stateT > 0.95 || (e.fired && solidAt(world, e.cx, e.bottom + 4))) { e.setState('fly'); e.cool = P.rate ?? 2.6; }
        return;
    }
    e.setAnim('fly');
    if (adx > 60 && Math.random() < dt * 0.3) e.side = Math.sign(e.cx - p.cx) || e.side;
    hover(e, p.cx + e.side * 180, p.cy - 130 + Math.sin(e.t * 2) * 20, 2.5, dt, e.speed * 1.3);
    e.facing = Math.sign(dx) || e.facing;
    e.cool -= dt * e.aggro;
    if (e.cool <= 0 && e.distToPlayer() < 520) { e.fired = false; e.setState(adx < 320 && chance(0.35) ? 'swoop' : 'breath'); }
  },
  onHit(e) { if (e.state === 'statue') AI_A.gargoyle.wake(e); },
};

// ───────────────────────── 해골 궁수: 조준 추적 후 고정 → 발사 / 화살비 ─────────────────────────
AI_A.archer = {
  init(e) { e.cool = rand(0.8, 1.8); e.aimA = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx, adx = Math.abs(dx);
    if (e.state === 'draw' || e.state === 'volley') {
      e.vx = 0; e.setAnim(e.state);
      const T = P.draw ?? 0.75;
      const sx = e.cx + e.facing * 12, sy = e.bottom - 58;
      if (e.state === 'draw') {
        if (e.stateT < T * 0.7) e.aimA = clamp(Math.atan2(p.cy - sy, Math.abs(p.cx - sx)), -0.6, 0.6);
      } else e.aimA = -0.85;
      if (e.stateT >= T && !e.fired) {
        e.fired = true;
        if (e.state === 'draw') {
          const sp = P.arrowSpeed ?? 560;
          e.shoot({ x: sx, y: sy, vx: Math.cos(e.aimA) * sp * e.facing, vy: Math.sin(e.aimA) * sp, w: 22, h: 8, render: PA('arrow'), life: 2.5, attack: { mv: 1.1, kb: [200, -150] } });
        } else {
          const g = 2000 * 0.6;
          for (let i = 0; i < 3; i++) {
            const tx = p.cx + (i - 1) * 64 + rand(-12, 12), T2 = 1.0 + i * 0.08;
            const vx = (tx - sx) / T2, vy = (p.bottom - 20 - sy - 0.5 * g * T2 * T2) / T2;
            e.shoot({ x: sx, y: sy, vx, vy, w: 20, h: 8, behavior: 'arc', gravity: 0.6, render: PA('arrow'), life: 3, attack: { mv: 0.9, kb: [120, -100] } });
          }
        }
        audio.sfx('dagger', { vol: 0.5, pitch: 0.8 });
      }
      if (e.stateT > T + 0.35) { e.setState('walk'); e.cool = P.rate ?? 2.3; }
      return;
    }
    e.cool -= dt * e.aggro;
    e.facing = Math.sign(dx) || e.facing;
    if (e.cool <= 0 && adx < (P.range ?? 580) && Math.abs(p.cy - e.cy) < 240 && e.onGround) {
      e.fired = false; e.setState(adx > 220 && chance(0.3) ? 'volley' : 'draw');
      audio.sfx('charge_ready', { vol: 0.25, pitch: 1.4 });
      return;
    }
    const keep = P.keep ?? 300;
    let mv = 0;
    if (adx < keep * 0.55) mv = -e.facing; else if (adx > keep * 1.5 && adx < 700) mv = e.facing;
    e.vx = mv && canMove(e, mv) ? mv * e.speed : 0;
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

// ───────────────────────── 피의 해골: 쓰러지면 뼈 무더기 → 부활 (무더기 파괴/신성으로 소멸) ─────────────────────────
AI_A.reviver = {
  init(e) { AI.walker.init(e); e.revives = 0; },
  update(e, world, dt) {
    const P = e.params;
    if (e.state === 'collapse') { e.vx *= 0.8; e.setAnim('collapse'); if (e.stateT > 0.35) e.setState('pile'); return; }
    if (e.state === 'pile') {
      e.vx *= 0.8; e.setAnim('pile');
      const T = P.revive ?? 3.2;
      if (e.stateT > T - 1.0 && Math.random() < dt * 12) world.fx.emit('blood', e.cx + rand(-12, 12), e.bottom - 6, { speed: 60, angle: -Math.PI / 2, spread: 0.6 });
      if (e.stateT > T) { e.setState('reform'); audio.sfx('dark', { vol: 0.4 }); }
      return;
    }
    if (e.state === 'reform') {
      e.vx = 0; e.setAnim('reform');
      if (e.stateT > 0.7) {
        e.setState('walk'); e.harmless = false; e.hp = e.stats.maxHp; e.facePlayer();
        world.fx.burst('blood', e.cx, e.cy, 10, {});
        world.fx.ring(e.cx, e.cy, { color: '#ff3040', r0: 6, r1: 50, life: 0.3 });
      }
      return;
    }
    AI.walker.update(e, world, dt);
  },
  onHit(e, world, attack) {
    if (e.state === 'pile' || e.state === 'collapse' || e.state === 'reform') {
      e.hp = Math.min(e.hp, 0); // 무더기를 부수면 완전히 소멸
      world.fx.text(e.cx, e.y - 10, '분쇄!', { color: '#ffb0a0', size: 18 });
      return;
    }
    // 신성 속성이나 화면 전체 소멸(초대형 피해)이면 부활하지 못함
    if (e.hp <= 0 && e.hp > -Math.max(5000, e.stats.maxHp * 20) && attack.element !== 'holy' && !e.params.noRevive) {
      e.hp = 1;
      e.setState('collapse'); e.harmless = true; e.revives++;
      audio.sfx('break_wall', { vol: 0.5, pitch: 1.3 });
      world.fx.burst('shard', e.cx, e.cy, 10, { color: '#c8544a' });
      if (e.revives === 1) world.fx.text(e.cx, e.y - 16, '뼈를 부숴라!', { color: '#ffb0a0', size: 16 });
    }
  },
};

// ───────────────────────── 유령 검: 주위를 돌다 조준(떨림) → 일직선 돌진 ─────────────────────────
AI_A.phantom = {
  init(e) { e.swordA = Math.PI / 2; e.cool = rand(1, 2); e.orbit = rand(0, TAU); e.dashN = 0; e.ghostT = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const turnTo = (target, rate) => { const d = wrapAngle(target - e.swordA); e.swordA += clamp(d, -rate * dt, rate * dt); };
    if (e.state === 'aim') {
      e.setAnim('aim'); e.vx *= 0.85; e.vy *= 0.85;
      const aT = P.aimT ?? 0.55;
      if (e.stateT < aT * 0.75 || e.lockA == null) e.lockA = angleTo(e.cx, e.cy, p.cx, p.cy - 8);
      turnTo(e.lockA, 12);
      if (e.stateT >= aT) {
        const sp = P.dashSpeed ?? 640;
        e.vx = Math.cos(e.lockA) * sp; e.vy = Math.sin(e.lockA) * sp; e.swordA = e.lockA;
        e.setState('dash'); e.dashN++;
        audio.sfx('slash_heavy', { vol: 0.5, pitch: 1.3 });
      }
      return;
    }
    if (e.state === 'dash') {
      e.setAnim('dash');
      enemyStrike(world, e.hurtbox(), { owner: e, stats: e.stats, mv: 1.4, dir: Math.sign(e.vx) || 1, kb: [320, -240], hitId: 'phd' + e.dashN + '_' + e.spawnX });
      e.ghostT -= dt;
      if (e.ghostT <= 0) { e.ghostT = 0.04; const x = e.cx, y = e.bottom - 30, a = e.swordA; world.fx.ghost((ctx, al) => drawPhantomGhost(ctx, x, y, a, al), 0.22); }
      if (e.stateT > (P.dashT ?? 0.55)) e.setState('recover');
      return;
    }
    if (e.state === 'recover') {
      e.setAnim('fly'); e.vx *= 0.9; e.vy *= 0.9;
      turnTo(Math.PI / 2, 4);
      if (e.stateT > 0.5) { e.setState('fly'); e.cool = P.rate ?? 2.2; e.lockA = null; }
      return;
    }
    e.setAnim('fly');
    e.orbit += dt * 0.9;
    hover(e, p.cx + Math.cos(e.orbit) * 170, p.cy - 50 + Math.sin(e.orbit) * 60, 2, dt, e.speed * 1.5);
    turnTo(Math.PI / 2 + Math.sin(e.t * 2) * 0.15, 5);
    e.facing = Math.sign(p.cx - e.cx) || e.facing;
    e.cool -= dt * e.aggro;
    if (e.cool <= 0 && e.distToPlayer() < 460) { e.setState('aim'); e.lockA = null; audio.sfx('charge_ready', { vol: 0.4 }); }
  },
};

// ───────────────────────── 하급 악마: 호버링 + 암흑탄(3갈래/유도 교대) + 발톱 급강하 ─────────────────────────
AI_A.imp = {
  init(e) { e.cool = rand(1, 2); e.side = chance(0.5) ? 1 : -1; e.casts = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx;
    switch (e.state) {
      case 'cast': {
        e.setAnim('cast'); e.vx *= 0.9; e.vy *= 0.9; e.facing = Math.sign(dx) || e.facing;
        const wu = P.castWind ?? 0.65;
        if (e.stateT >= wu && !e.fired) {
          e.fired = true; e.casts++;
          const ox = e.cx + e.facing * 6, oy = e.y + 6;
          const base = angleTo(ox, oy, p.cx, p.cy);
          const light = { r: 50, color: '#b060ff', i: 0.7 };
          if (e.casts % 2) {
            for (let i = -1; i <= 1; i++) { const a = base + i * 0.3; e.shoot({ x: ox, y: oy, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, w: 14, h: 14, render: PA('darkorb'), life: 3, light, attack: { mv: 0.9, type: 'mag', element: 'dark' } }); }
          } else {
            e.shoot({ x: ox, y: oy, vx: Math.cos(base) * 190, vy: Math.sin(base) * 190, w: 20, h: 20, behavior: 'homing', homingTurn: 1.8, render: PA('darkorb'), life: 3.2, light, attack: { mv: 1.3, type: 'mag', element: 'dark' } });
          }
          audio.sfx('dark', { vol: 0.5 });
        }
        if (e.stateT > wu + 0.35) { e.setState('fly'); e.cool = P.rate ?? 2.4; }
        return;
      }
      case 'swoop':
        e.setAnim('swoop'); e.vx *= 0.88; e.vy *= 0.88; e.facing = Math.sign(dx) || e.facing;
        if (e.stateT < 0.3) { e.tx = p.cx; e.ty = p.cy; }
        if (e.stateT >= 0.4) { const a = angleTo(e.cx, e.cy, e.tx, e.ty); e.vx = Math.cos(a) * 460; e.vy = Math.sin(a) * 460; e.setState('dive'); audio.sfx('dash', { vol: 0.5 }); }
        return;
      case 'dive':
        e.setAnim('dive');
        e.strike(-4, -e.h, e.w * 0.8, e.h, 1.25, { kb: [300, -260] });
        if (e.stateT > 0.55 || solidAt(world, e.cx, e.bottom + 4)) { e.setState('fly'); e.cool = P.rate ?? 2.4; e.vy = -200; }
        return;
    }
    e.setAnim('fly');
    if (Math.random() < dt * 0.25) e.side *= -1;
    hover(e, p.cx + e.side * 200, p.cy - 110 + Math.sin(e.t * 1.7) * 25, 2.2, dt, e.speed * 1.3);
    e.facing = Math.sign(dx) || e.facing;
    e.cool -= dt * e.aggro;
    if (e.cool <= 0 && e.distToPlayer() < 520) { e.fired = false; e.setState(Math.abs(dx) < 280 && chance(0.4) ? 'swoop' : 'cast'); }
  },
};

// ───────────────────────── 창병 갑옷: 높은/낮은 찌르기 (숙이거나 뛰어서 회피) ─────────────────────────
AI_A.lancer = {
  init(e) { e.cool = rand(0.6, 1.4); e.high = true; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx, adx = Math.abs(dx);
    if (e.state === 'thrust') {
      e.setAnim('thrust');
      const wu = P.windup ?? 0.55;
      if (e.stateT < wu) e.vx = e.stateT < 0.2 && canMove(e, -e.facing) ? -e.facing * 25 : 0;
      else if (e.stateT < wu + 0.15) e.vx = canMove(e, e.facing) ? e.facing * 300 : 0;
      else e.vx *= 0.8;
      if (e.stateT >= wu + 0.04 && !e.didHit) {
        e.didHit = true;
        e.strike(0, e.high ? -82 : -36, 134, 22, 1.5, { kb: [340, -200] });
        audio.sfx('slash', { pitch: 1.3 });
      }
      if (e.stateT > (P.atkTime ?? 1.0)) { e.setState('walk'); e.cool = P.rate ?? 1.5; }
      return;
    }
    e.cool -= dt * e.aggro;
    const sees = adx < (P.sight ?? 420) && Math.abs(p.cy - e.cy) < 140;
    if (sees) {
      e.facing = Math.sign(dx) || e.facing;
      if (e.cool <= 0 && adx < 150 && e.onGround) { e.setState('thrust'); e.didHit = false; e.high = chance(0.5); e.vx = 0; return; }
      const want = adx > 115 ? e.facing : adx < 70 ? -e.facing : 0;
      e.vx = want && canMove(e, want) ? want * e.speed : 0;
    } else patrol(e, 0.6);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

// ───────────────────────── 저주 인형: 꼭두각시 도약, 세 번째 착지마다 바늘 3발 ─────────────────────────
AI_A.puppet = {
  init(e) { e.cool = rand(0.5, 1.2); e.hops = 0; e.wasAir = false; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx;
    if (e.state === 'throw') {
      e.vx *= 0.7; e.setAnim('throw'); e.facing = Math.sign(dx) || e.facing;
      const wu = P.throwWind ?? 0.45;
      if (e.stateT >= wu && !e.fired) {
        e.fired = true;
        const ox = e.cx + e.facing * 10, oy = e.cy - 10;
        const base = angleTo(ox, oy, p.cx, p.cy);
        for (let i = -1; i <= 1; i++) { const a = base + i * 0.2; e.shoot({ x: ox, y: oy, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, w: 14, h: 6, render: PA('needle'), life: 2, attack: { mv: 0.8, kb: [120, -80] } }); }
        audio.sfx('dagger', { vol: 0.5, pitch: 1.5 });
      }
      if (e.stateT > wu + 0.4) { e.setState('hop'); e.cool = rand(0.3, 0.6); }
      return;
    }
    if (e.onGround) {
      if (e.wasAir) {
        e.wasAir = false;
        world.fx.burst('dust', e.cx, e.bottom, 4, {});
        if (++e.hops % 3 === 0 && e.distToPlayer() < 460) { e.fired = false; e.setState('throw'); audio.sfx('ghost', { vol: 0.25, pitch: 1.8 }); return; }
      }
      e.vx *= 0.7;
      e.cool -= dt * e.aggro;
      e.setAnim(e.cool > 0 && e.cool < 0.18 ? 'crouch' : 'idle');
      if (e.cool <= 0) {
        if (e.distToPlayer() < (P.sight ?? 480)) {
          e.facing = Math.sign(dx) || e.facing;
          e.vx = clamp(dx * 1.3, -300, 300); e.vy = -rand(620, 760);
          audio.sfx('jump', { vol: 0.25, pitch: 1.6 });
        }
        e.cool = rand(0.5, 1.0);
      }
    } else { e.wasAir = true; e.setAnim('jump'); }
  },
  onHit(e, world, attack, info) { world.fx.burst('shard', info?.hx ?? e.cx, info?.hy ?? e.cy, 5, { color: '#f4efe6' }); },
};

// ───────────────────────── 해골 기둥: 아가리가 달아오른 뒤 위·아래 두개골이 차례로 화염탄 ─────────────────────────
AI_A.pillar = {
  init(e) { e.cool = rand(1, 2); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    e.vx = 0;
    if (!p) return;
    const fire = (i) => {
      const y = e.bottom - (i ? 62 : 84) + 3;
      e.shoot({ x: e.cx + e.facing * 16, y, vx: e.facing * 250, vy: 0, w: 16, h: 16, render: 'fireball', color: '#ff7a2a', life: 3.2, light: { r: 60, color: '#ff7a2a' }, trail: 'ember', attack: { mv: 1.0, element: 'fire' } });
      world.fx.burst('fire', e.cx + e.facing * 16, y, 5, {});
      audio.sfx('fire', { vol: 0.45, pitch: i ? 0.9 : 1.1 });
    };
    if (e.state === 'charge') {
      const T = P.chargeT ?? 0.6;
      e.setAnim(e.stateT >= T ? 'fire' : 'charge');
      if (e.stateT >= T && !e.fired) { e.fired = true; fire(0); }
      if (e.stateT >= T + 0.25 && !e.fired2) { e.fired2 = true; fire(1); }
      if (e.stateT > T + 0.55) { e.setState('idle'); e.cool = P.rate ?? 2.5; }
      return;
    }
    e.setAnim('idle');
    e.facing = Math.sign(p.cx - e.cx) || e.facing;
    e.cool -= dt * e.aggro;
    if (e.cool <= 0 && e.distToPlayer() < (P.range ?? 580) && Math.abs(p.cy - e.cy) < 200) { e.setState('charge'); e.fired = e.fired2 = false; audio.sfx('fire', { vol: 0.3, pitch: 0.6 }); }
  },
};

// ───────────────────────── 곡도 해골: 2연속 베기 + 공격을 보면 뒤로 도약 ─────────────────────────
AI_A.scimitar = {
  init(e) { e.cool = rand(0.5, 1.2); e.evade = 0; },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx, adx = Math.abs(dx);
    e.evade -= dt;
    if (e.state === 'combo') {
      e.setAnim('combo');
      const t = e.stateT;
      e.vx *= 0.85;
      if (t >= 0.3 && !e.hit1) { e.hit1 = true; e.vx = canMove(e, e.facing) ? e.facing * 180 : 0; e.strike(0, -76, 72, 58, 1.0, { kb: [160, -120] }); audio.sfx('slash', { pitch: 1.2 }); }
      if (t >= 0.54 && !e.hit2) { e.hit2 = true; e.vx = canMove(e, e.facing) ? e.facing * 200 : 0; e.strike(0, -76, 76, 58, 1.2, { kb: [320, -240] }); audio.sfx('slash', { pitch: 1.0 }); }
      if (t > 0.95) { e.setState('walk'); e.cool = rand(1.0, 1.6); }
      return;
    }
    if (e.state === 'hop') {
      e.setAnim('jump');
      if (e.onGround && e.stateT > 0.1) e.setState('walk');
      return;
    }
    e.cool -= dt * e.aggro;
    const sees = adx < (P.sight ?? 420) && Math.abs(p.cy - e.cy) < 140;
    if (sees) {
      e.facing = Math.sign(dx) || e.facing;
      if (p.move && adx < 120 && e.evade <= 0 && e.onGround) {
        e.evade = chance(0.5) ? 2.2 : 0.6;
        if (e.evade > 1 && canMove(e, -e.facing)) { e.vx = -e.facing * 260; e.vy = -460; e.setState('hop'); audio.sfx('jump', { vol: 0.3 }); return; }
      }
      if (e.cool <= 0 && adx < 84 && e.onGround) { e.setState('combo'); e.hit1 = e.hit2 = false; e.vx = 0; return; }
      const want = adx > 60 ? e.facing : 0;
      e.vx = want && canMove(e, want) ? want * e.speed * 1.35 : 0;
    } else patrol(e, 0.6);
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

// ───────────────────────── 마도서 악령: 펄럭이며 종이 칼날 3장 / 세 번째마다 물기 돌진 ─────────────────────────
AI_A.bookfiend = {
  init(e) { e.cool = rand(1, 2); e.side = chance(0.5) ? 1 : -1; e.n = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx;
    if (e.state === 'cast') {
      e.setAnim('cast'); e.vx *= 0.9; e.vy *= 0.9; e.facing = Math.sign(dx) || e.facing;
      const T = P.castT ?? 0.55;
      if (e.stateT >= T && !e.fired) {
        e.fired = true;
        const base = angleTo(e.cx, e.cy, p.cx, p.cy);
        for (let i = -1; i <= 1; i++) { const a = base + i * 0.25; e.shoot({ x: e.cx, y: e.cy, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, w: 14, h: 14, render: PA('page'), spin: 14, life: 2.6, light: { r: 40, color: '#ffcf60', i: 0.5 }, attack: { mv: 0.85, type: 'mag' } }); }
        audio.sfx('magic', { vol: 0.4, pitch: 1.3 });
        world.fx.burst('shard', e.cx, e.cy, 6, { color: '#efe4c8', grav: 200 });
      }
      if (e.stateT > T + 0.35) { e.setState('fly'); e.cool = P.rate ?? 2.3; }
      return;
    }
    if (e.state === 'bite') {
      e.setAnim('bite');
      if (e.stateT < 0.3) { e.vx *= 0.8; e.vy *= 0.8; e.tx = p.cx; e.ty = p.cy; }
      else if (!e.fired) { e.fired = true; const a = angleTo(e.cx, e.cy, e.tx, e.ty); e.vx = Math.cos(a) * 420; e.vy = Math.sin(a) * 420; audio.sfx('dash', { vol: 0.4, pitch: 1.4 }); }
      if (e.stateT > 0.85) { e.setState('fly'); e.cool = P.rate ?? 2.3; }
      return;
    }
    e.setAnim('fly');
    if (Math.random() < dt * 0.2) e.side *= -1;
    hover(e, p.cx + e.side * 160 + Math.sin(e.t * 1.7) * 60, p.cy - 90 + Math.sin(e.t * 2.3) * 40, 2.5, dt, e.speed * 1.4);
    e.facing = Math.sign(dx) || e.facing;
    e.cool -= dt * e.aggro;
    if (e.cool <= 0 && e.distToPlayer() < 500) { e.fired = false; e.n++; e.setState(e.n % 3 === 0 ? 'bite' : 'cast'); }
  },
};

// ───────────────────────── 벼룩 사내: 웅크림(신호) → 불규칙 도약 ─────────────────────────
AI_A.flea = {
  init(e) { e.cool = rand(0.3, 1.0); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (e.onGround) {
      e.vx *= 0.6;
      e.cool -= dt * e.aggro;
      e.setAnim(e.cool < 0.14 ? 'crouch' : 'idle');
      if (e.cool <= 0) {
        const near = p && e.distToPlayer() < (P.sight ?? 520);
        if (near && chance(0.7)) {
          e.facePlayer();
          const dx = e.dxToPlayer();
          e.vx = clamp(dx * 1.8, -(P.maxVx ?? 430), P.maxVx ?? 430); e.vy = -rand(540, 780);
        } else { e.vx = rand(-220, 220); e.vy = -rand(280, 420); if (e.vx) e.facing = Math.sign(e.vx); }
        e.cool = rand(0.3, 0.75);
        audio.sfx('jump', { vol: 0.2, pitch: 1.8 });
      }
    } else e.setAnim('jump');
  },
};

// ───────────────────────── 해골 마법사: 불기둥(발밑 마법진) / 얼음 파편 3발 교대 ─────────────────────────
AI_A.caster = {
  init(e) { e.cool = rand(1, 2); e.spell = randi(0, 1); ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx, adx = Math.abs(dx);
    if (e.state === 'cast') {
      e.vx = 0; e.setAnim('cast'); e.facing = Math.sign(dx) || e.facing;
      const T = P.cast ?? 0.8;
      if (e.spell === 0 && e.stateT >= T * 0.35 && !e.marked) {
        e.marked = true;
        const gx = p.cx, gy = p.onGround ? p.bottom : (groundBelow(world, p.cx, p.bottom) ?? p.bottom);
        world.add(new Hitbox({
          x: gx - 26, y: gy - 150, w: 52, h: 150, team: 'enemy', delay: 0.85, life: 0.5, render: drawFlamePillar, light: { r: 90, color: '#ff7a2a', i: 0.8 },
          attack: { owner: e, stats: e.stats, mv: 1.4, type: 'mag', element: 'fire', dir: e.facing, kb: [120, -560], hitId: 'fp' + (++_hid), tags: ['magic'] },
          tick: (h, w) => {
            if (h.erupted) return;
            h.erupted = true;
            w.camera.shake(5, 0.25);
            w.fx.burst('fire', gx, gy - 10, 16, { speed: 220, angle: -Math.PI / 2, spread: 0.5 });
            audio.sfx('fire', { vol: 0.6, pitch: 0.8 });
          },
        }));
        audio.sfx('magic', { vol: 0.4, pitch: 0.7 });
      }
      if (e.stateT >= T && !e.fired) {
        e.fired = true;
        if (e.spell === 1) {
          const ox = e.cx + e.facing * 16, oy = e.y + 18;
          const base = angleTo(ox, oy, p.cx, p.cy);
          for (let i = -1; i <= 1; i++) { const a = base + i * 0.18; e.shoot({ x: ox, y: oy, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, w: 14, h: 10, render: 'shard', color: '#bff4ff', life: 2.4, light: { r: 50, color: '#9fe8ff' }, attack: { mv: 0.9, type: 'mag', element: 'ice' } }); }
          audio.sfx('ice', { vol: 0.5 });
        }
      }
      if (e.stateT > T + 0.4) { e.setState('walk'); e.spell = 1 - e.spell; e.cool = P.rate ?? 2.8; }
      return;
    }
    e.cool -= dt * e.aggro;
    e.facing = Math.sign(dx) || e.facing;
    if (e.cool <= 0 && adx < (P.range ?? 540) && Math.abs(p.cy - e.cy) < 260) { e.setState('cast'); e.fired = e.marked = false; return; }
    const keep = P.keep ?? 260;
    let mv = 0;
    if (adx < keep * 0.6) mv = -e.facing; else if (adx > keep * 1.4 && adx < 600) mv = e.facing;
    e.vx = mv && canMove(e, mv) ? mv * e.speed : 0;
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

// ───────────────────────── 학자 유령: 출현 → 주문(문자 고리/추적 문자) → 소멸 → 순간이동 ─────────────────────────
AI_A.teleporter = {
  init(e) { e.setState('appear'); e.harmless = true; e.casts = 0; ensureMag(e); },
  update(e, world, dt) {
    const p = e.player, P = e.params;
    if (!p) return;
    const dx = p.cx - e.cx;
    e.facing = Math.sign(dx) || e.facing;
    switch (e.state) {
      case 'appear':
        e.setAnim('appear'); e.vx = 0; e.vy = 0; e.invuln = false;
        if (e.stateT > 0.45) { e.setState('float'); e.harmless = false; }
        return;
      case 'float':
        e.setAnim('float');
        hover(e, p.cx - Math.sign(dx) * 150, p.cy - 60, 1.5, dt, e.speed);
        if (e.stateT > 0.9 / e.aggro) { e.setState('cast'); e.fired = false; audio.sfx('ghost', { vol: 0.4 }); }
        return;
      case 'cast': {
        e.setAnim('cast'); e.vx *= 0.9; e.vy *= 0.9;
        const T = P.castT ?? 0.7;
        if (e.stateT >= T && !e.fired) {
          e.fired = true; e.casts++;
          const light = { r: 40, color: '#a0b8ff', i: 0.5 };
          if (e.casts % 2) {
            for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; e.shoot({ x: e.cx, y: e.cy - 6, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, w: 14, h: 14, render: PA('glyph'), color: '#a0b8ff', life: 2.6, light, attack: { mv: 0.8, type: 'mag', element: 'dark' } }); }
          } else {
            const base = angleTo(e.cx, e.cy, p.cx, p.cy);
            for (let i = 0; i < 3; i++) { const a = base + (i - 1) * 0.5; e.shoot({ x: e.cx, y: e.cy - 6, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, w: 14, h: 14, behavior: 'homing', homingTurn: 2.2, homingDelay: 0.3, render: PA('glyph'), color: '#c8a0ff', life: 2.6, light, attack: { mv: 0.8, type: 'mag', element: 'dark' } }); }
          }
          audio.sfx('dark', { vol: 0.5 });
        }
        if (e.stateT > T + 0.5) { e.setState('vanish'); audio.sfx('mist', { vol: 0.4 }); }
        return;
      }
      case 'vanish':
        e.setAnim('vanish'); e.vx *= 0.9; e.vy *= 0.9;
        if (e.stateT > 0.45) { e.setState('hidden'); e.invuln = true; e.harmless = true; }
        return;
      case 'hidden':
        e.setAnim('hidden'); e.vx = 0; e.vy = 0;
        if (e.stateT > 0.7) {
          const side = chance(0.5) ? 1 : -1;
          e.x = p.cx + side * rand(130, 210) - e.w / 2;
          e.y = p.cy - rand(30, 90) - e.h / 2;
          e.setState('appear');
          world.fx.burst('soul', e.cx, e.cy, 10, {});
          audio.sfx('mist', { vol: 0.3, pitch: 1.3 });
        }
        return;
    }
  },
};

// ───────────────────────── 엑토플라즘: 느린 추적 + 움츠렸다 돌진, 죽으면 둘로 분열 ─────────────────────────
AI_A.ecto = {
  init(e) {
    e.gen = e.params.gen ?? 0;
    if (e.gen > 0) {
      const k = 0.62, cx = e.cx, b = e.bottom;
      e.w *= k; e.h *= k; e.cx = cx; e.bottom = b;
      e.scale = (e.scale || 1) * k;
      e.stats.maxHp = e.stats.hp = e.hp = Math.max(1, Math.round(e.stats.maxHp * 0.4));
      e.stats.exp = Math.round(e.stats.exp * 0.35);
      e.speed *= 1.3;
    }
    e.cool = rand(1, 2); e.phase = rand(0, TAU);
  },
  update(e, world, dt) {
    const p = e.player;
    if (!p) return;
    e.phase += dt * 2;
    if (e.state === 'squash') {
      e.setAnim('squash'); e.vx *= 0.85; e.vy *= 0.85;
      if (e.stateT > 0.35) {
        const a = angleTo(e.cx, e.cy, p.cx, p.cy);
        e.vx = Math.cos(a) * e.speed * 5; e.vy = Math.sin(a) * e.speed * 5;
        e.setState('lunge'); audio.sfx('splash', { vol: 0.3, pitch: 1.5 });
      }
      return;
    }
    if (e.state === 'lunge') { e.setAnim('lunge'); e.vx *= 0.97; e.vy *= 0.97; if (e.stateT > 0.5) { e.setState('fly'); e.cool = rand(1.4, 2.2); } return; }
    e.setAnim('fly');
    hover(e, p.cx, p.cy - 10 + Math.sin(e.phase) * 20, 1.2, dt, e.speed);
    e.facing = Math.sign(p.cx - e.cx) || e.facing;
    e.cool -= dt * e.aggro;
    if (e.cool <= 0 && e.distToPlayer() < 300) e.setState('squash');
  },
  onDie(e, world) {
    if (e.gen >= 1) return;
    for (const s of [-1, 1]) {
      const k = world.spawnEnemy('ectoplasm', e.cx + s * 12, e.bottom, { params: { gen: 1 }, elite: false, facing: s });
      if (k) { k.vx = s * 200; k.vy = -150; }
    }
    world.fx.burst('soul', e.cx, e.cy, 14, { color: '#8affb0' });
    audio.sfx('splash', { vol: 0.5, pitch: 1.2 });
  },
};
