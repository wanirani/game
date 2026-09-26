// 적 AI 행동 레지스트리. AI[name] = { init(e), update(e, world, dt), onHit?(e,world,attack,info), onDie?(e,world) }
// e.params 로 세부 조정 (data/enemies.js 의 aiParams).
// e.aggro: 난이도 공격성 배율 (쿨다운을 나눔)
import { rand, chance, clamp, angleTo } from '../core/math.js';
import { lineOfSight } from '../core/physics.js';
import { audio } from '../core/audio.js';

export const AI = {};

/** 걷기/순찰 + 근접 추격 + 선택적 공격 */
AI.walker = {
  init(e) { e.facing = chance(0.5) ? 1 : -1; e.cool = rand(0.5, 1.5); },
  update(e, world, dt) {
    const p = e.player;
    const P = e.params;
    const sight = P.sight ?? 360;
    const dx = e.dxToPlayer(), adx = Math.abs(dx);
    const sees = p && adx < sight && Math.abs(p.cy - e.cy) < 140;
    e.cool -= dt * e.aggro;
    if (e.state === 'attack') {
      e.vx *= 0.8;
      if (e.stateT > (P.windup ?? 0.35) && !e.didHit) {
        e.didHit = true;
        e.strike(P.reachX ?? 10, -(P.reachY ?? e.h * 0.8), P.reach ?? 56, P.reachH ?? e.h * 0.6, P.atkMv ?? 1.2);
        audio.sfx(P.atkSfx ?? 'slash', { vol: 0.5 });
      }
      if (e.stateT > (P.atkTime ?? 0.7)) { e.setState('walk'); e.cool = rand(1.0, 2.0); }
      e.setAnim('attack');
      return;
    }
    if (sees && P.chase !== false) {
      e.facing = Math.sign(dx) || e.facing;
      if (P.attack !== false && adx < (P.atkRange ?? 70) && e.cool <= 0 && e.onGround) {
        e.setState('attack'); e.didHit = false; e.vx = 0; return;
      }
      const sp = e.speed * (P.chaseMul ?? 1.3);
      e.vx = e.facing * sp;
      if (!e.groundAhead() || e.wallAhead()) {
        if (P.jumps && e.onGround && e.wallAhead()) e.vy = -(P.jumpV ?? 620);
        else e.vx = 0;
      }
    } else {
      e.vx = e.facing * e.speed;
      if (e.onGround && (!e.groundAhead() || e.wallAhead())) e.facing *= -1;
      if (P.patrol && Math.abs(e.x - e.spawnX) > P.patrol) { e.facing = Math.sign(e.spawnX - e.x) || 1; }
    }
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

/** 박쥐: 매달려 있다가 접근 시 급강하 후 사인파 비행 */
AI.bat = {
  init(e) { e.setState(e.params.hang === false ? 'fly' : 'hang'); e.baseY = e.y; e.phase = rand(0, 6); },
  update(e, world, dt) {
    const p = e.player;
    if (e.state === 'hang') {
      e.vx = 0; e.vy = 0; e.setAnim('hang');
      if (p && Math.abs(e.dxToPlayer()) < (e.params.wake ?? 260) && p.y > e.y - 40) { e.setState('dive'); e.facePlayer(); audio.sfx('bat', { vol: 0.5 }); }
      return;
    }
    e.setAnim('fly');
    if (e.state === 'dive') {
      const a = angleTo(e.cx, e.cy, p.cx, p.cy - 10);
      e.vx = Math.cos(a) * e.speed * 2.2; e.vy = Math.sin(a) * e.speed * 2.2;
      if (e.stateT > 0.5) { e.setState('fly'); e.baseY = e.y; }
      return;
    }
    e.phase += dt * (e.params.freq ?? 5);
    e.vx = e.facing * e.speed * 1.4;
    e.vy = Math.cos(e.phase) * (e.params.amp ?? 150);
    if (p && e.stateT > 1.2 && Math.sign(e.dxToPlayer()) !== e.facing && Math.abs(e.dxToPlayer()) > 200) { e.facing *= -1; e.setState('fly'); }
  },
};

/** 부유체: 플레이어 쪽으로 떠다니며 접근 (유령, 눈알 등). params.phase=true 면 벽 통과 */
AI.floater = {
  init(e) { e.phase = rand(0, 6); },
  update(e, world, dt) {
    const p = e.player;
    e.phase += dt * 3;
    if (!p) return;
    const sight = e.params.sight ?? 500;
    if (e.distToPlayer() > sight) { e.vx *= 0.95; e.vy = Math.sin(e.phase) * 30; return; }
    const a = angleTo(e.cx, e.cy, p.cx, p.cy - 20);
    const sp = e.speed;
    e.vx += (Math.cos(a) * sp - e.vx) * Math.min(1, 1.5 * dt);
    e.vy += (Math.sin(a) * sp + Math.sin(e.phase) * 40 - e.vy) * Math.min(1, 1.5 * dt);
    e.facing = Math.sign(e.vx) || e.facing;
    e.setAnim('fly');
    const P = e.params;
    if (P.shoot) {
      e.cool = (e.cool ?? rand(1, 2)) - dt * e.aggro;
      if (e.cool <= 0 && e.distToPlayer() < (P.range ?? 420)) {
        e.cool = P.rate ?? 2.2;
        const aa = angleTo(e.cx, e.cy, p.cx, p.cy);
        const s = P.projSpeed ?? 260;
        e.shoot({ x: e.cx, y: e.cy, vx: Math.cos(aa) * s, vy: Math.sin(aa) * s, w: 14, h: 14, render: P.proj ?? 'orb', color: P.projColor ?? '#b060ff', life: 3, light: { r: 50, color: P.projColor ?? '#b060ff' }, attack: { mv: P.projMv ?? 0.8, type: 'mag', element: P.element ?? null } });
        audio.sfx(P.shootSfx ?? 'magic', { vol: 0.4 });
      }
    }
  },
};

/** 메두사 머리형: 화면을 가로지르는 사인파 비행 (벽 무시) */
AI.wave = {
  init(e) { e.phase = rand(0, 6); e.baseY = e.y; e.noGravity = true; },
  update(e, world, dt) {
    e.phase += dt * (e.params.freq ?? 4);
    e.vx = e.facing * e.speed;
    e.y = e.baseY + Math.sin(e.phase) * (e.params.amp ?? 70);
    e.vy = 0;
    e.setAnim('fly');
    const cam = world.camera;
    if (e.x < cam.x - 300 || e.x > cam.x + cam.vw + 300) e.dead = true;
  },
};

/** 투척형: 거리를 유지하며 포물선 투사체 (해골 뼈던지기, 도끼 갑옷 등) */
AI.thrower = {
  init(e) { e.cool = rand(0.8, 2); },
  update(e, world, dt) {
    const p = e.player;
    const P = e.params;
    if (!p) return;
    const dx = e.dxToPlayer(), adx = Math.abs(dx);
    e.facePlayer();
    e.cool -= dt * e.aggro;
    const keep = P.keep ?? 220;
    if (e.state === 'throw') {
      e.vx = 0;
      if (e.stateT > (P.windup ?? 0.3) && !e.thrown) {
        e.thrown = true;
        const n = P.count ?? 1;
        for (let i = 0; i < n; i++) {
          const vx = clamp(dx * (P.aim ?? 1.3), -(P.maxVx ?? 420), P.maxVx ?? 420) * rand(0.85, 1.1) + i * 40 * e.facing;
          e.shoot({ x: e.cx + e.facing * 10, y: e.y + 10, vx, vy: -(P.vy ?? 620) - i * 60, w: 16, h: 16, behavior: 'arc', gravity: P.gravity ?? 0.9, collideWalls: false, render: P.proj ?? 'bone', spin: 14 * e.facing, life: 3, attack: { mv: P.projMv ?? 0.9 } });
        }
        audio.sfx(P.throwSfx ?? 'dagger', { vol: 0.4 });
      }
      if (e.stateT > (P.recover ?? 0.7)) { e.setState('idle'); e.cool = P.rate ?? rand(1.6, 2.6); }
      e.setAnim('attack');
      return;
    }
    if (adx < (P.range ?? 480) && e.cool <= 0 && Math.abs(p.cy - e.cy) < 260) { e.setState('throw'); e.thrown = false; return; }
    // 거리 유지
    if (adx < keep * 0.7) e.vx = -Math.sign(dx) * e.speed;
    else if (adx > keep * 1.4 && adx < (P.range ?? 480)) e.vx = Math.sign(dx) * e.speed;
    else e.vx = 0;
    if (e.onGround && (!e.groundAhead() && Math.sign(e.vx) === e.facing)) e.vx = 0;
    e.setAnim(Math.abs(e.vx) > 5 ? 'walk' : 'idle');
  },
};

/** 사격형: 제자리/이동하며 직선 투사체 (포탑, 마법사, 머맨 불덩이) */
AI.shooter = {
  init(e) { e.cool = rand(0.8, 2); },
  update(e, world, dt) {
    const p = e.player; const P = e.params;
    if (!p) return;
    e.facePlayer();
    e.cool -= dt * e.aggro;
    if (P.move) { e.vx = Math.sin(e.t * 1.2) * e.speed; }
    else e.vx = 0;
    if (e.cool <= 0 && e.distToPlayer() < (P.range ?? 520) && (!P.needSight || lineOfSight(world.map, e.cx, e.cy, p.cx, p.cy))) {
      e.cool = P.rate ?? 2.5;
      e.setAnim('attack'); e.animT = 0;
      const n = P.count ?? 1;
      const base = P.aimed ? angleTo(e.cx, e.cy, p.cx, p.cy) : (e.facing > 0 ? 0 : Math.PI);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * (P.spread ?? 0.25);
        const s = P.projSpeed ?? 320;
        e.shoot({ x: e.cx + e.facing * e.w * 0.4, y: e.y + e.h * (P.muzzleY ?? 0.35), vx: Math.cos(a) * s, vy: Math.sin(a) * s, w: 14, h: 14, render: P.proj ?? 'fireball', color: P.projColor ?? '#ff8a2a', life: 3, light: { r: 60, color: P.projColor ?? '#ff8a2a' }, attack: { mv: P.projMv ?? 1, type: P.magic ? 'mag' : 'phys', element: P.element ?? null } });
      }
      audio.sfx(P.shootSfx ?? 'fire', { vol: 0.45 });
    } else if (e.animT > 0.4) e.setAnim('idle');
  },
};

/** 도약형: 플레이어를 향해 뛰어오름 (벼룩남, 개구리, 늑대인간) */
AI.jumper = {
  init(e) { e.cool = rand(0.3, 1.2); },
  update(e, world, dt) {
    const P = e.params;
    if (e.onGround) {
      e.vx *= 0.7;
      e.cool -= dt * e.aggro;
      if (e.cool <= 0 && e.distToPlayer() < (P.sight ?? 520)) {
        e.facePlayer();
        const dx = e.dxToPlayer();
        e.vx = clamp(dx * 1.6, -(P.maxVx ?? 380), P.maxVx ?? 380);
        e.vy = -(P.jumpV ?? rand(560, 820));
        e.cool = P.rate ?? rand(0.4, 1.0);
        audio.sfx('jump', { vol: 0.25, pitch: 1.4 });
      }
      e.setAnim('idle');
    } else e.setAnim('jump');
  },
};

/** 돌진형: 발견 시 예비동작 후 고속 돌진 (멧돼지, 늑대, 기사 돌격) */
AI.charger = {
  init(e) { e.cool = 0; },
  update(e, world, dt) {
    const P = e.params; const p = e.player;
    e.cool -= dt * e.aggro;
    if (e.state === 'wind') {
      e.vx = 0; e.setAnim('wind');
      if (e.stateT > (P.windup ?? 0.5)) { e.setState('charge'); audio.sfx(P.sfx ?? 'dash', { vol: 0.5 }); }
      return;
    }
    if (e.state === 'charge') {
      e.vx = e.facing * e.speed * (P.chargeMul ?? 4);
      e.setAnim('charge');
      if (e.stateT > (P.chargeTime ?? 0.9) || e.hitWall || !e.groundAhead(20)) {
        if (e.hitWall) world.camera.shake(4, 0.15);
        e.setState('rest'); e.vx = 0;
      }
      return;
    }
    if (e.state === 'rest') { e.vx = 0; e.setAnim('idle'); if (e.stateT > (P.rest ?? 0.9)) { e.setState('walk'); e.cool = P.rate ?? 1.2; } return; }
    AI.walker.update(e, world, dt);
    if (p && e.cool <= 0 && Math.abs(e.dxToPlayer()) < (P.sight ?? 420) && Math.abs(p.cy - e.cy) < 80) { e.facePlayer(); e.setState('wind'); }
  },
};

/** 좀비: 땅에서 솟아올라 느리게 추적 */
AI.zombie = {
  init(e) { e.setState('rise'); e.alpha = 1; e.riseY = e.y; e.harmless = true; },
  update(e, world, dt) {
    if (e.state === 'rise') {
      e.setAnim('rise'); e.vx = 0;
      if (e.stateT > (e.params.riseTime ?? 0.8)) { e.setState('walk'); e.harmless = false; e.facePlayer(); }
      return;
    }
    AI.walker.update(e, world, dt);
  },
};

/** 고정 포탑/식물/석상: 움직이지 않고 주기적으로 공격 */
AI.turret = {
  init(e) { e.cool = rand(1, 2); },
  update(e, world, dt) { e.vx = 0; AI.shooter.update(e, world, dt); },
};

/** 갑옷 기사: 느린 전진 + 방패 방어 + 큰 휘두르기 */
AI.knight = {
  init(e) { e.cool = rand(0.5, 1.5); },
  update(e, world, dt) {
    const P = e.params;
    P.atkRange ??= 90; P.windup ??= 0.5; P.atkTime ??= 1.0; P.reach ??= 90; P.atkMv ??= 1.6; P.chaseMul ??= 1.0;
    AI.walker.update(e, world, dt);
  },
  onHit(e, world, attack, info) {
    // 정면 방패: 정면 물리 공격 피해 경감 (연출)
    if (e.params.shield && Math.sign(attack.dir) === -e.facing && attack.type !== 'mag' && e.state !== 'attack') {
      world.fx.burst('spark', e.cx + e.facing * e.w * 0.5, e.cy, 8, { color: '#ffe0a0' });
      audio.sfx('clang', { vol: 0.6 });
    }
  },
};

/** 스포너: 보이지 않는 생성기. params: {spawn:'medusa_head', rate:3, max:3, from:'edges'|'here'} */
AI.spawner = {
  init(e) { e.invuln = true; e.harmless = true; e.cool = e.params.delay ?? 1; e.kids = []; e.hidden = true; },
  update(e, world, dt) {
    e.vx = 0; e.vy = 0;
    e.kids = e.kids.filter((k) => !k.dead);
    const P = e.params;
    const cam = world.camera;
    const near = e.cx > cam.x - 200 && e.cx < cam.x + cam.vw + 200;
    if (!near) return;
    e.cool -= dt * e.aggro;
    if (e.cool <= 0 && e.kids.length < (P.max ?? 3)) {
      e.cool = P.rate ?? 3;
      let x = e.cx, y = e.bottom;
      let facing = -1;
      if ((P.from ?? 'edges') === 'edges') {
        const p = world.player;
        const left = chance(0.5);
        x = left ? cam.x - 20 : cam.x + cam.vw + 20;
        facing = left ? 1 : -1;
        y = (p ? p.cy : e.cy) + rand(-60, 30);
      }
      const k = world.spawnEnemy(P.spawn ?? 'medusa_head', x, y, { facing });
      if (k) e.kids.push(k);
    }
  },
};

/** 미믹: 보물상자로 위장, 접근하면 덮침 */
AI.mimic = {
  init(e) { e.setState('disguise'); e.harmless = true; },
  update(e, world, dt) {
    if (e.state === 'disguise') {
      e.vx = 0; e.setAnim('closed');
      if (e.distToPlayer() < 110) { e.setState('wake'); e.harmless = false; audio.sfx('chest', { pitch: 0.6 }); }
      return;
    }
    if (e.state === 'wake') { e.setAnim('open'); if (e.stateT > 0.35) e.setState('hunt'); return; }
    AI.jumper.update(e, world, dt);
  },
};

// 확장 행동 병합 (적 담당 에이전트 파일. C/D = 2부 14~16장 / 17~20장)
import { AI_A } from './ai_a.js';
import { AI_B } from './ai_b.js';
import { AI_C } from './ai_c.js';   // [hook:p2]
import { AI_D } from './ai_d.js';   // [hook:p2]
Object.assign(AI, AI_A, AI_B, AI_C, AI_D);   // [hook:p2]
