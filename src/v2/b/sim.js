// 시범판 B — 놀이 규칙 (영웅 · 적 · 탄 · 판정). 화면 방식과 무관하다: 좌표 x·z·y 만 다룬다. docs/v2/proto_b.md §5–6
import { groundAt, moveXZ, sectionAt, STEP_UP, STEP_DOWN } from './world.js';
import { SWORD } from './chars.js';

export const TUNE = {
  runX: 275, runZ: 208, accel: 16, airAccel: 9,
  jumpV: 720, gravity: 2300, jumpCut: 0.42, coyote: 0.09,
  dashV: 650, dashT: 0.19, dashCd: 0.42, dashIfr: 0.2,
  hitZ: 28, assistZ: 64, heroHp: 100, hurtIfr: 0.95, pitDmg: 8, pitY: -170,
  melee: { hp: 34, speedX: 96, speedZ: 74, range: 78, alignZ: 15, windup: 0.42, atkTime: 0.82, dmg: 10, sight: 440, reach: 88, reachZ: 30 },
  ranged: { hp: 26, speedX: 70, speedZ: 58, near: 190, far: 350, cast: 0.8, rate: 2.6, dmg: 9, sight: 540, shot: 215 },
};
const rnd = (a, b) => a + Math.random() * (b - a);
const sgn = (v) => (v < 0 ? -1 : 1);

export class Sim {
  /** hooks: {hit(e,dmg,mv,x,y,z), kill(e), heroHurt(dmg), shake(px), sfx(name), spark(x,y,z,kind), number(x,y,z,text,color), done()} */
  constructor(W, hooks = {}) { this.W = W; this.hooks = hooks; this.reset(); }
  reset() {
    const W = this.W;
    this.time = 0; this.stop = 0; this.done = false; this.kills = 0; this.deaths = this.deaths ?? 0;
    this.hero = {
      x: W.start.x, z: W.start.z, y: W.start.y, vx: 0, vz: 0, vy: 0, r: 14, h: 80, facing: 1, dirX: 1, dirZ: 0, onGround: true, coyote: 0,
      hp: TUNE.heroHp, ifr: 0, hurtT: 0, dead: false, deadT: 0, dashT: 0, dashCd: 0, dvx: 0, dvz: 0,
      move: null, moveT: 0, combo: 0, hitIds: null, assist: null, anim: 'idle', animT: 0, t: 0, cut: false, landT: 0,
      safe: { x: W.start.x, z: W.start.z, y: W.start.y }, flash: 0,
    };
    this.enemies = W.spawns.map((s, i) => ({
      id: i, kind: s.kind, yard: !!s.yard, x: s.x, z: s.z, y: s.y, vx: 0, vz: 0, r: 15, h: s.kind === 'melee' ? 80 : 84,
      hp: TUNE[s.kind].hp, hpMax: TUNE[s.kind].hp, facing: -1, state: 'idle', stateT: 0, cd: rnd(0.3, 1.2), flashT: 0, stun: 0, dying: 0, dead: false,
      active: false, anim: 'idle', animT: 0, t: rnd(0, 5), hitDone: false, kx: 0, kz: 0,
    }));
    this.shots = [];
    this.section = sectionAt(W, this.hero.x, this.hero.z)?.id ?? 'street';
  }
  teleport(sec) {
    const P = { street: [260, 130], pillar: [640, 60], platform: [760, 190], pit: [1740, 100], corner: [2150, 150], alley: [2190, 380], stairs: [2190, 660], garden: [2190, 1250], yard: [2190, 1600] }[sec];
    if (!P) return false;
    const h = this.hero; h.x = P[0]; h.z = P[1]; h.y = groundAt(this.W, h.x, h.z); h.vx = h.vz = h.vy = 0; h.onGround = true; h.move = null; h.safe = { x: h.x, z: h.z, y: h.y };
    this.section = sectionAt(this.W, h.x, h.z)?.id ?? this.section;
    return true;
  }
  /** inp: {mx, mz (-1..1; mz + = 화면 안쪽), jump(눌림), jumpHeld, attack(눌림), dash(눌림)} */
  update(dt, inp) {
    if (this.stop > 0) { this.stop -= dt; return; }
    this.time += dt;
    this._hero(dt, inp);
    for (const e of this.enemies) if (!e.dead) this._enemy(e, dt);
    this._separate(dt);
    this._shots(dt);
    const sec = sectionAt(this.W, this.hero.x, this.hero.z);
    if (sec && !this.done) this.section = sec.id;
    if (!this.done && this.enemies.every((e) => !e.yard || e.dead)) { this.done = true; this.section = 'done'; this.hooks.done?.(); }
  }
  // ───────────────────────── 영웅 ─────────────────────────
  _hero(dt, inp) {
    const h = this.hero, W = this.W, T = TUNE;
    h.t += dt; h.ifr = Math.max(0, h.ifr - dt); h.dashCd = Math.max(0, h.dashCd - dt); h.flash = Math.max(0, h.flash - dt * 5); h.landT = Math.max(0, h.landT - dt);
    if (h.dead) {
      h.deadT += dt; h.vx *= 0.9; h.vz *= 0.9;
      this._fall(h, dt);
      if (h.deadT > 1.7) { this.deaths++; this.reset(); }
      this._anim(h, 'death', dt); return;
    }
    let mx = inp.mx, mz = inp.mz; const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    const moving = m > 0.15;
    if (h.hurtT > 0) {   // 맞아서 밀리는 중: 조작 불가
      h.hurtT -= dt; h.vx *= 1 - Math.min(1, 6 * dt); h.vz *= 1 - Math.min(1, 6 * dt);
    } else {
      // 대시
      if (inp.dash && h.dashCd <= 0) {
        const dx = moving ? mx / m : h.dirX, dz = moving ? mz / m : h.dirZ;
        h.dashT = T.dashT; h.dashCd = T.dashCd; h.dvx = dx * T.dashV; h.dvz = dz * T.dashV * 0.82; h.ifr = Math.max(h.ifr, T.dashIfr);
        h.move = null; this._face(h, dx, dz); if (h.vy < 0) h.vy = 0;
        this.hooks.sfx?.('dash'); this.hooks.spark?.(h.x, h.y + 6, h.z, 'dust');
      }
      // 공격 (3연타; 공중은 한 번)
      if (inp.attack && h.dashT <= 0) {
        if (!h.move) this._startMove(h, h.onGround ? SWORD.ground[0] : SWORD.air[0], 0, mx, mz);
        else if (h.moveT >= h.move.cancel && h.onGround && h.combo < 2) this._startMove(h, SWORD.ground[h.combo + 1], h.combo + 1, mx, mz);
        else h.queued = 0.18;
      } else if (h.queued > 0) {
        h.queued -= dt;
        if (h.move && h.moveT >= h.move.cancel && h.onGround && h.combo < 2) { this._startMove(h, SWORD.ground[h.combo + 1], h.combo + 1, mx, mz); h.queued = 0; }
      }
      if (h.dashT > 0) {
        h.dashT -= dt; h.vx = h.dvx; h.vz = h.dvz;
        if (h.dashT <= 0) { h.vx *= 0.45; h.vz *= 0.45; }
      } else if (h.move) {
        const mv = h.move, t = h.moveT;
        const lunge = h.onGround ? (mv.lunge ?? 0) * 0.5 * Math.max(0, 1 - t / 0.12) : 0;
        const k = Math.min(1, 12 * dt);
        h.vx += ((h.onGround ? h.dirX * lunge + mx * 40 : mx * T.runX * 0.6) - h.vx) * k;
        h.vz += ((h.onGround ? h.dirZ * lunge * 0.8 + mz * 30 : mz * T.runZ * 0.6) - h.vz) * k;
        h.moveT += dt;
        if (t >= mv.hit[0] && t <= mv.hit[1]) this._heroHit(h, mv);
        if (h.moveT >= mv.dur) { h.move = null; h.combo = 0; }
      } else {
        const k = Math.min(1, (h.onGround ? T.accel : T.airAccel) * dt);
        h.vx += (mx * T.runX - h.vx) * k; h.vz += (mz * T.runZ - h.vz) * k;
        if (moving) this._face(h, mx, mz);
      }
      // 점프 (공격은 회수 구간부터 끊을 수 있다)
      if (inp.jump && (h.onGround || h.coyote > 0) && h.dashT <= 0 && (!h.move || h.moveT >= h.move.cancel)) {
        h.vy = T.jumpV; h.onGround = false; h.coyote = 0; h.cut = false; h.move = null; h.combo = 0; inp.jumpUsed = true;
        this.hooks.sfx?.('jump'); this.hooks.spark?.(h.x, h.y + 4, h.z, 'dust');
      }
      if (!h.onGround && !inp.jumpHeld && !h.cut && h.vy > T.jumpV * T.jumpCut) { h.vy = T.jumpV * T.jumpCut; h.cut = true; }
    }
    moveXZ(W, h, h.vx * dt, h.vz * dt);
    const wasAir = !h.onGround;
    this._fall(h, dt, h.dashT > 0 ? 0 : 1);
    if (wasAir && h.onGround) { h.landT = 0.1; if (h.move && !SWORD.ground.includes(h.move)) h.move = null; this.hooks.spark?.(h.x, h.y + 3, h.z, 'dust'); this.hooks.sfx?.('land'); }
    // 구덩이
    if (h.y < T.pitY) {
      h.hp -= T.pitDmg; h.x = h.safe.x; h.z = h.safe.z; h.y = h.safe.y; h.vx = h.vz = h.vy = 0; h.onGround = true; h.move = null; h.ifr = 1.2; h.flash = 1;
      this.hooks.heroHurt?.(T.pitDmg, true); this.hooks.number?.(h.x, h.y + 100, h.z, '-' + T.pitDmg, '#ff7060');
      if (h.hp <= 0) this._die(h);
    } else if (h.onGround && h.dashT <= 0) {
      // 안전한 자리 기억 (가장자리에서 조금 안쪽)
      let ok = true;
      for (const [ox, oz] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) { const g = groundAt(W, h.x + ox, h.z + oz, h.y + STEP_UP); if (!(g >= h.y - STEP_DOWN)) { ok = false; break; } }
      if (ok) { h.safe.x = h.x; h.safe.z = h.z; h.safe.y = h.y; }
    }
    const sp = Math.hypot(h.vx, h.vz);
    this._anim(h, h.hurtT > 0 ? 'hurt' : h.move ? 'attack' : h.dashT > 0 ? 'dash' : !h.onGround ? (h.vy > 0 ? 'jump' : 'fall') : h.landT > 0 ? 'land' : sp > 36 ? 'run' : 'idle', dt);
  }
  _anim(o, a, dt) { if (o.anim !== a) { o.anim = a; o.animT = 0; } else o.animT += dt; }
  _fall(o, dt, gk = 1) {
    const W = this.W, g = groundAt(W, o.x, o.z, o.y + STEP_UP);
    if (o.onGround) {
      if (g >= o.y - STEP_DOWN) o.y = g; else { o.onGround = false; o.coyote = TUNE.coyote; o.vy = 0; }
    } else {
      o.coyote = Math.max(0, (o.coyote ?? 0) - dt);
      o.vy -= TUNE.gravity * gk * dt; if (o.vy < -1500) o.vy = -1500;
      o.y += o.vy * dt;
      if (o.vy <= 0 && o.y <= g) { o.y = g; o.vy = 0; o.onGround = true; }
    }
  }
  /** 보는 방향(360°)을 정한다. 좌우 값 facing 은 옛 코드(카메라 앞보기 · 납작한 영웅)용으로 함께 맞춘다 */
  _face(h, dx, dz) {
    const d = Math.hypot(dx, dz); if (d < 1e-4) return;
    h.dirX = dx / d; h.dirZ = dz / d;
    if (Math.abs(h.dirX) > 0.25) h.facing = sgn(h.dirX);
  }
  _startMove(h, mv, combo, mx, mz = 0) {
    if (Math.hypot(mx, mz) > 0.2) this._face(h, mx, mz);   // 스틱을 민 쪽으로 벤다 (위 · 아래 = 화면 안쪽 · 바깥쪽도)
    h.move = mv; h.moveT = 0; h.combo = combo; h.hitIds = new Set(); h.queued = 0;
    if (!h.onGround && mv.airStall) h.vy *= mv.airStall;
    // 보는 쪽에서 조금 비껴 선 적을 찾아 그쪽으로 몸을 돌린다 (조준 보정: 앞 170, 옆 assistZ 안)
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dead') continue;
      const ex = e.x - h.x, ez = e.z - h.z, f = ex * h.dirX + ez * h.dirZ, l = Math.abs(ez * h.dirX - ex * h.dirZ);
      if (f < -20 || f > 170 || l > TUNE.assistZ || Math.abs(e.y - h.y) > 70) continue;
      const d = f + l * 2; if (d < bd) { bd = d; best = e; }
    }
    h.assist = best;
    if (best && Math.hypot(best.x - h.x, best.z - h.z) > 12) this._face(h, best.x - h.x, best.z - h.z);
    this.hooks.sfx?.(mv.sfx || 'slash');
  }
  _heroHit(h, mv) {
    // 때리는 상자는 영웅이 보는 방향 기준이다: 앞으로 b.x … b.x+b.w, 옆으로 ±hitZ, 높이 b.y … b.y+b.h
    const b = mv.box, f0 = b.x, f1 = b.x + b.w, y0 = h.y - (b.y + b.h), y1 = h.y - b.y, dx = h.dirX, dz = h.dirZ;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dead' || h.hitIds.has(e.id)) continue;
      const ex = e.x - h.x, ez = e.z - h.z, f = ex * dx + ez * dz, l = Math.abs(ez * dx - ex * dz);
      if (f + e.r < f0 || f - e.r > f1 || l > TUNE.hitZ + e.r * 0.5 || e.y > y1 || e.y + e.h < y0) continue;
      h.hitIds.add(e.id);
      const dmg = Math.round(11 * mv.mv * rnd(0.9, 1.12));
      e.hp -= dmg; e.flashT = 0.13; e.stun = 0.3; e.kx = dx * mv.kb[0] * 1.1; e.kz = dz * mv.kb[0] * 0.9; e.active = true;
      if (e.state === 'attack' || e.state === 'cast') { e.state = 'chase'; e.cd = Math.max(e.cd, 0.5); }
      this.stop = Math.max(this.stop, mv.hitstop * 1.25);
      this.hooks.hit?.(e, dmg, mv, e.x - dx * 8, e.y + Math.min(e.h, y1 - e.y) * 0.62, e.z - dz * 8);
      if (e.hp <= 0) { e.dead = false; e.state = 'dead'; e.dying = 0.55; e.kx *= 1.4; e.kz *= 1.4; this.hooks.kill?.(e); }
    }
    for (const s of this.shots) {   // 탄도 벨 수 있다
      if (s.dead) continue;
      const sx = s.x - h.x, sz = s.z - h.z, f = sx * dx + sz * dz, l = Math.abs(sz * dx - sx * dz);
      if (f < f0 - 8 || f > f1 + 8 || l > TUNE.hitZ + 8 || s.y < y0 - 10 || s.y > y1 + 10) continue;
      s.dead = true; this.hooks.spark?.(s.x, s.y, s.z, 'shot'); this.hooks.sfx?.('parry');
    }
  }
  hurtHero(dmg, dirX, dirZ = 0) {
    const h = this.hero;
    if (h.ifr > 0 || h.dead) return false;
    h.hp -= dmg; h.ifr = TUNE.hurtIfr; h.hurtT = 0.24; h.vx = dirX * 240; h.vz = dirZ * 160; h.move = null; h.combo = 0; h.dashT = 0; h.flash = 1;
    this.stop = Math.max(this.stop, 0.07);
    this.hooks.heroHurt?.(dmg, false); this.hooks.number?.(h.x, h.y + 100, h.z, '-' + dmg, '#ff7060');
    if (h.hp <= 0) this._die(h);
    return true;
  }
  _die(h) { h.hp = 0; h.dead = true; h.deadT = 0; h.move = null; this.hooks.sfx?.('die'); }
  // ───────────────────────── 적 ─────────────────────────
  _enemy(e, dt) {
    const h = this.hero, W = this.W, T = TUNE[e.kind];
    e.t += dt; e.flashT = Math.max(0, e.flashT - dt); e.cd -= dt;
    if (e.state === 'dead') {   // 쓰러지는 중: 밀려나며 사라진다
      e.dying -= dt; e.kx *= 1 - Math.min(1, 5 * dt); e.kz *= 1 - Math.min(1, 5 * dt);
      this._emove(e, e.kx * dt, e.kz * dt);
      if (e.dying <= 0) { e.dead = true; this.kills++; }
      this._anim(e, 'hurt', dt); return;
    }
    const dx = h.x - e.x, dz = h.z - e.z, dist = Math.hypot(dx, dz);
    if (!e.active) {
      if (dist < T.sight && !h.dead && (!e.yard || this.section === 'yard' || this.section === 'done') && Math.abs(h.y - e.y) < 130) { e.active = true; e.state = 'chase'; }
      this._anim(e, 'idle', dt); return;
    }
    if (e.stun > 0) {   // 맞아서 밀림
      e.stun -= dt; e.kx *= 1 - Math.min(1, 7 * dt); e.kz *= 1 - Math.min(1, 7 * dt);
      this._emove(e, e.kx * dt, e.kz * dt);
      this._anim(e, 'hurt', dt); return;
    }
    if (h.dead) { this._anim(e, 'idle', dt); return; }
    e.stateT += dt;
    if (e.kind === 'melee') {
      if (e.state === 'attack') {
        if (!e.hitDone && e.stateT >= T.windup) {
          e.hitDone = true; this.hooks.sfx?.('swing');
          const fx = (h.x - e.x) * e.facing;
          if (fx > -12 && fx < T.reach && Math.abs(dz) <= T.reachZ && h.y - e.y < 70 && e.y - h.y < 60) this.hurtHero(T.dmg, e.facing, Math.sign(dz) * 0.3);
        }
        if (e.stateT >= T.atkTime) { e.state = 'chase'; e.stateT = 0; e.cd = rnd(0.6, 1.1); }
        this._anim(e, 'attack', dt); return;
      }
      const side = sgn(e.x - h.x), tx = h.x + side * 60, tz = h.z;
      const ex = tx - e.x, ez = tz - e.z, d = Math.hypot(ex, ez);
      e.facing = sgn(dx);
      if (Math.abs(dx) < T.range && Math.abs(dz) < T.alignZ && e.cd <= 0 && Math.abs(h.y - e.y) < 60) {
        e.state = 'attack'; e.stateT = 0; e.hitDone = false; this._anim(e, 'attack', dt); e.animT = 0; return;
      }
      if (d > 6) { this._emove(e, (ex / d) * Math.min(T.speedX, Math.abs(ex) / dt) * dt, (ez / d) * Math.min(T.speedZ, Math.abs(ez) / dt + 20) * dt); this._anim(e, 'walk', dt); } else this._anim(e, 'idle', dt);
    } else {
      e.facing = sgn(dx);
      if (e.state === 'cast') {
        if (e.stateT >= T.cast) {
          const d = dist || 1, sy = e.y + 50;
          this.shots.push({ x: e.x + e.facing * 20, y: sy, z: e.z, vx: (dx / d) * T.shot, vz: (dz / d) * T.shot, life: 4, dead: false, t: 0, dmg: T.dmg });
          e.state = 'chase'; e.stateT = 0; e.cd = T.rate + rnd(-0.4, 0.6); this.hooks.sfx?.('cast');
        }
        this._anim(e, 'cast', dt); return;
      }
      if (e.cd <= 0 && dist < T.sight + 60) { e.state = 'cast'; e.stateT = 0; this._anim(e, 'cast', dt); e.animT = 0; return; }
      let mvx = 0, mvz = 0;
      if (dist < T.near) { mvx = -dx / dist; mvz = -dz / dist; } else if (dist > T.far) { mvx = dx / dist; mvz = dz / dist; }
      if (mvx || mvz) { this._emove(e, mvx * T.speedX * dt, mvz * T.speedZ * dt); this._anim(e, 'walk', dt); } else this._anim(e, 'idle', dt);
    }
  }
  /** 적 이동: 벽 + 낭떠러지로는 가지 않는다 */
  _emove(e, dx, dz) {
    const W = this.W;
    if (dx) { const g = groundAt(W, e.x + dx + sgn(dx) * 14, e.z, e.y + STEP_UP); if (!(g >= e.y - STEP_DOWN)) dx = 0; }
    if (dz) { const g = groundAt(W, e.x, e.z + dz + sgn(dz) * 14, e.y + STEP_UP); if (!(g >= e.y - STEP_DOWN)) dz = 0; }
    moveXZ(W, e, dx, dz);
    const g = groundAt(W, e.x, e.z, e.y + STEP_UP);
    if (Number.isFinite(g)) e.y = g;
  }
  _separate(dt) {
    const E = this.enemies;
    for (let i = 0; i < E.length; i++) {
      const a = E[i]; if (a.dead || !a.active || a.state === 'dead') continue;
      for (let j = i + 1; j < E.length; j++) {
        const b = E[j]; if (b.dead || !b.active || b.state === 'dead') continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 > 38 * 38 || d2 < 1e-4) continue;
        const d = Math.sqrt(d2), p = (38 - d) * 3 * dt;
        this._emove(a, (-dx / d) * p, (-dz / d) * p); this._emove(b, (dx / d) * p, (dz / d) * p);
      }
    }
  }
  _shots(dt) {
    const h = this.hero, W = this.W;
    for (const s of this.shots) {
      if (s.dead) continue;
      s.t += dt; s.life -= dt; s.x += s.vx * dt; s.z += s.vz * dt;
      if (s.life <= 0) { s.dead = true; continue; }
      if (!h.dead && Math.hypot(s.x - h.x, s.z - h.z) < 21 && s.y > h.y - 6 && s.y < h.y + h.h + 4) {
        if (this.hurtHero(s.dmg, sgn(s.vx), Math.sign(s.vz) * 0.4)) { s.dead = true; this.hooks.spark?.(s.x, s.y, s.z, 'shot'); continue; }
      }
      for (const b of W.boxes) {   // 벽·계단에 닿으면 사라진다
        if (b.solid && s.x > b.x0 && s.x < b.x1 && s.z > b.z0 && s.z < b.z1 && s.y > b.y0 && s.y < b.y1) { s.dead = true; this.hooks.spark?.(s.x, s.y, s.z, 'shot'); break; }
      }
    }
    if (this.shots.length > 24 || this.shots.some((s) => s.dead)) this.shots = this.shots.filter((s) => !s.dead);
  }
}
