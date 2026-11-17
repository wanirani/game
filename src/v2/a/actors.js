// 시범판 A — 영웅 · 적 · 탄 · 전투 판정 (docs/v2/proto_a.md §4–§5)
// 몸 = 발 중앙 (x, z) + 높이 y, 발 자리 반폭 (r, rz), 키 h. 이동은 축마다 따로 해 보고 막히면 그 축만 멈춘다(미끄러짐).
// 공격 판정 = v1 movesets 의 상자(x 전방 · y 높이)를 그대로 쓰고, 깊이는 |Δz| ≤ HIT_DZ 인 얇은 판으로 본다.
import { input } from '../../core/input.js';
import { MOVESETS } from '../../data/movesets.js';
import { PIT_Y, WALL, STEP_UP } from './stage.js';
import { makeHeroProxy, drawHeroAt, drawEnemyAt, enemyDef, preloadEnemies } from './art.js';
import { FONT } from '../../core/ui.js';

const G = 2200;
export const HIT_DZ = 28;
const RUN_X = 275, RUN_Z = 228, JUMP_V = 790, DASH_V = 660, DASH_T = 0.2;
const HERO_HP = 100;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sgn = (v) => (v < 0 ? -1 : 1);

/** 한 축씩 움직인다. 반환: 막힌 축 비트 (1 = x, 2 = z) */
function moveBody(st, e, dt, noFall) {
  let hit = 0;
  const up = e.fly ? 0 : (e.onGround ? STEP_UP : 3);
  const ok = (x, z) => {
    const g = st.footGround(x, z, e.r, e.rz);
    if (e.fly) return g < WALL / 2;
    if (g > e.y + up) return false;
    if (noFall && g < e.y - 26) return false;
    return true;
  };
  if (e.vx) { const nx = e.x + e.vx * dt; if (ok(nx, e.z)) e.x = nx; else { hit |= 1; e.vx = 0; } }
  if (e.vz) { const nz = e.z + e.vz * dt; if (ok(e.x, nz)) e.z = nz; else { hit |= 2; e.vz = 0; } }
  const g = st.footGround(e.x, e.z, e.r, e.rz);
  e.ground = g > WALL / 2 ? e.y : g;
  if (e.fly) return hit;
  e.landed = false;
  if (e.onGround) { if (e.ground < e.y - STEP_UP) e.onGround = false; else e.y = e.ground; }
  if (!e.onGround) {
    e.vy -= G * dt; e.y += e.vy * dt;
    if (e.y <= e.ground && e.vy <= 0) { e.landed = e.vy < -200; e.y = e.ground; e.vy = 0; e.onGround = true; }
  }
  return hit;
}

function readStick() {
  let mx = 0, mz = 0;
  const T = input._touchVec;
  if (input.mode === 'touch' && T && T.mag > 0.1) { mx = T.x; mz = -T.y; }
  else if (input.mode === 'pad' && input.stickL.mag > 0.15) { mx = input.stickL.x; mz = -input.stickL.y; }
  else { mx = input.axisX; mz = -input.axisY; }
  const m = Math.hypot(mx, mz);
  if (m > 1) { mx /= m; mz /= m; }
  return [mx, mz, Math.min(1, m)];
}

// ───────────────────────── 영웅 ─────────────────────────
export class Hero {
  constructor(play) {
    this.play = play; this.kind = 2;
    this.x = 0; this.z = 0; this.y = 0; this.vx = 0; this.vz = 0; this.vy = 0;
    this.r = 13; this.rz = 7; this.h = 82; this.w = 30;
    this.facing = 1; this.onGround = true; this.ground = 0; this.landed = false;
    this.hp = HERO_HP; this.maxHp = HERO_HP; this.ghostHp = HERO_HP;
    this.state = 'free'; this.st = 0; this.inv = 0; this.dashCd = 0; this.airJumps = 1; this.coyote = 0;
    this.combo = 0; this.comboT = 0; this.mv = null; this.mvT = 0; this.hitSet = new Map(); this.kbx = 0;
    this.anim = 'idle'; this.animT = 0; this.t = 0; this.speed = 0; this.drawY = 0;
    this.safe = { x: 0, z: 0 }; this.safeT = 0;
    const W = MOVESETS.whip;
    this.moves = [W.ground[0], W.ground[1], W.ground[3]];      // 3연타: 내려치기 → 올려치기 → 회전 마무리
    this.airMove = W.air[0];
    this.proxy = makeHeroProxy('kael');
    this.key = 0; this.tie = 0;
  }
  place(x, z) {
    const st = this.play.stage;
    this.x = x; this.z = z; this.vx = this.vz = this.vy = 0;
    const g = st.footGround(x, z, this.r, this.rz);
    this.y = this.drawY = this.ground = g > WALL / 2 || g <= PIT_Y ? 0 : g; this.onGround = true;
    this.state = 'free'; this.mv = null; this.safe.x = x; this.safe.z = z;
  }
  setAnim(a) { if (this.anim !== a) { this.anim = a; this.animT = 0; } }
  update(dt) {
    const P = this.play, st = P.stage;
    this.t += dt; this.animT += dt; this.st += dt;
    if (this.inv > 0) this.inv -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.comboT > 0) this.comboT -= dt; else if (this.state !== 'attack') this.combo = 0;
    this.ghostHp += (this.hp - this.ghostHp) * Math.min(1, dt * 3);
    const [mx, mz, mag] = readStick();
    if (this.state === 'dead') {
      this.vx *= 0.9; this.vz *= 0.9; moveBody(st, this, dt, true);
      if (this.st > 1.5) P.respawn();
      this._post(dt); return;
    }
    if (this.state === 'hurt') {
      this.vx *= 0.9; this.vz *= 0.9;
      if (this.st > 0.3) this.state = 'free';
    } else if (this.state === 'dash') {
      if (this.st >= DASH_T) { this.state = 'free'; this.vx *= 0.35; this.vz *= 0.35; }
    } else if (this.state === 'attack') {
      const mv = this.mv; this.mvT += dt;
      const fr = this.onGround ? 0.82 : 0.96;
      this.vx *= fr; this.vz = mz * 80;
      if (this.mvT >= mv.hit[0] && this.mvT <= mv.hit[1]) P.heroStrike(this, mv);
      const canCancel = this.mvT >= mv.cancel;
      if (canCancel && input.buffered('attack', 0.22) && this.onGround && this.combo < this.moves.length - 1) { input.consume('attack'); this.startAttack(this.combo + 1, mx); }
      else if (canCancel && (input.buffered('dash', 0.1) || input.buffered('jump', 0.1))) this._free();
      else if (this.mvT >= mv.dur || (this.mvT >= mv.dur * 0.86 && mag > 0.5)) this._free();
    }
    if (this.state === 'free') {
      const air = !this.onGround;
      const k = Math.min(1, dt * (air ? 7 : 16));
      this.vx += (mx * RUN_X - this.vx) * k; this.vz += (mz * RUN_Z - this.vz) * k;
      if (Math.abs(mx) > 0.18) this.facing = sgn(mx);
      if (this.onGround) { this.coyote = 0.1; this.airJumps = 1; } else this.coyote -= dt;
      if (input.buffered('jump', 0.12)) {
        if (this.coyote > 0) { input.consume('jump'); this.vy = JUMP_V; this.onGround = false; this.coyote = 0; P.sfx('jump'); P.dust(this.x, this.y, this.z, 5); }
        else if (this.airJumps > 0) { input.consume('jump'); this.airJumps--; this.vy = JUMP_V * 0.88; P.sfx('jump', 1.15); P.ring(this.x, this.y, this.z); }
      }
      if (input.buffered('attack', 0.14)) { input.consume('attack'); this.startAttack(this.onGround ? (this.comboT > 0 && this.combo < this.moves.length - 1 ? this.combo + 1 : 0) : -1, mx); }
      else if (input.buffered('dash', 0.12) && this.dashCd <= 0) {
        input.consume('dash');
        let dx = mx, dz = mz; if (mag < 0.25) { dx = this.facing; dz = 0; }
        const m = Math.hypot(dx, dz) || 1;
        this.vx = dx / m * DASH_V; this.vz = dz / m * DASH_V * 0.8; this.vy = Math.max(this.vy, 0);
        if (Math.abs(dx) > 0.2) this.facing = sgn(dx);
        this.state = 'dash'; this.st = 0; this.dashCd = 0.45; this.inv = Math.max(this.inv, DASH_T + 0.05); this.setAnim('dash'); this.animT = 0;
        P.sfx('dash'); P.dust(this.x, this.y, this.z, 6);
      }
    }
    const vyHold = this.state === 'dash';
    if (vyHold) this.vy = Math.max(this.vy, -60);
    moveBody(st, this, dt, false);
    if (this.landed) { P.sfx('land'); P.dust(this.x, this.y, this.z, 4); }
    // 구덩이
    if (this.y < -110 && st.pitAt(this.x, this.z)) P.pitFall();
    else if (this.onGround && !st.pitAt(this.x, this.z)) { this.safeT += dt; if (this.safeT > 0.2 && this.state !== 'hurt') { this.safeT = 0; this.safe.x = this.x; this.safe.z = this.z; } }
    this._post(dt);
  }
  _free() { this.state = 'free'; this.mv = null; this.comboT = 0.32; }
  startAttack(i, mx) {
    if (Math.abs(mx) > 0.25) this.facing = sgn(mx);
    this.mv = i < 0 ? this.airMove : this.moves[i];
    this.combo = Math.max(0, i); this.mvT = 0; this.state = 'attack'; this.st = 0; this.hitSet.clear(); this.comboT = 1;
    if (this.onGround) this.vx = this.facing * (60 + (this.mv.lunge || 0));
    else if (this.mv.airStall) this.vy = Math.max(this.vy, 120);
    this.play.sfx(this.mv.sfx || 'whip');
  }
  takeHit(dmg, fromX, fromZ) {
    if (this.inv > 0 || this.state === 'dead') return false;
    const P = this.play;
    this.hp = Math.max(0, this.hp - dmg);
    const dx = this.x - fromX, dz = this.z - fromZ, m = Math.hypot(dx, dz) || 1;
    this.vx = dx / m * 300; this.vz = dz / m * 200; this.kbx = this.vx; this.mv = null;
    P.sfx('hurt'); P.shake(0.5); P.hitstop = Math.max(P.hitstop, 0.07); P.vignette();
    P.number(this.x, this.y + 96, this.z, dmg, '#ff6a5a');
    input.rumble?.(0.6, 0.4, 120);
    if (this.hp <= 0) { this.state = 'dead'; this.st = 0; this.setAnim('death'); this.animT = 0; this.inv = 9; return true; }
    this.state = 'hurt'; this.st = 0; this.inv = 0.9; this.setAnim('hurt'); this.animT = 0;
    return true;
  }
  _post(dt) {
    this.speed = Math.hypot(this.vx, this.vz);
    if (this.state === 'free') {
      if (!this.onGround) this.setAnim(this.vy > 0 ? 'jump' : 'fall');
      else if (this.speed > 40) this.setAnim('run');
      else this.setAnim('idle');
    }
    // 계단에서 그림이 톡톡 튀지 않게: 땅 위에서는 그리는 높이를 부드럽게 따라간다
    if (this.onGround) this.drawY += (this.y - this.drawY) * Math.min(1, dt * 24); else this.drawY = this.y;
  }
  draw(ctx, cam, R) {
    const st = this.play.stage;
    const s = cam.s(this.z), X = cam.px(this.x, s);
    let gnd = st.topAt(this.x, this.z, true); if (gnd > this.y + 20) gnd = this.ground;
    R.shadow(ctx, cam, this.x, this.z, Math.min(gnd, this.drawY), Math.max(0, this.drawY - gnd), 30);
    const pit = this.y < -2 ? st.pitAt(this.x, this.z) : null;
    if (pit) {   // 구덩이에 빠지는 중: 앞쪽 테두리 아래는 가려진다
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cam.W, cam.py(0, pit.z0, cam.s(pit.z0))); ctx.clip();
    }
    this._h.facing = this.facing; this._h.anim = this.anim; this._h.animT = this.animT; this._h.mv = this.state === 'attack' ? this.mv : null; this._h.mvT = this.mvT;
    this._h.speed = this.speed; this._h.vy = this.vy; this._h.onGround = this.onGround; this._h.t = this.t; this._h.kbx = this.kbx;
    this._h.blink = this.inv > 0 && this.state !== 'dash' && this.state !== 'dead' && Math.floor(this.t * 14) % 2 === 0;
    drawHeroAt(ctx, this.proxy, this._h, X, cam.py(this.drawY, this.z, s), s);
    if (pit) ctx.restore();
  }
  _h = {};
}

// ───────────────────────── 적 ─────────────────────────
const KIND = {
  skeleton: { hp: 34, speed: 92, w: 30, h: 80, fly: false, dmg: 11 },
  bat: { hp: 16, speed: 120, w: 34, h: 26, fly: true, dmg: 8 },
};
export class Enemy {
  constructor(play, sp) {
    const K = KIND[sp.kind];
    this.play = play; this.kindId = sp.kind; this.K = K; this.sp = sp; this.kind = 2;
    this.def = enemyDef(sp.kind); this.params = { ...(this.def?.aiParams || {}), windup: 0.5 };
    this.w = K.w; this.h = K.h; this.r = 12; this.rz = 6; this.fly = K.fly; this.group = sp.group;
    this.cx = 0; this.bottom = 0; this.scale = 1; this.aggro = 1; this.stateT = 0;
    this.key = 0; this.tie = 0;
    this.reset();
  }
  reset() {
    const sp = this.sp, st = this.play.stage;
    this.x = sp.x; this.z = sp.z; this.vx = this.vz = this.vy = 0;
    const g = st.footGround(sp.x, sp.z, this.r, this.rz);
    this.ground = g > WALL / 2 || g <= PIT_Y ? 0 : g;
    this.baseY = sp.y || 0; this.y = this.fly ? Math.max(0, this.ground) + this.baseY : this.ground; this.onGround = !this.fly;
    this.hp = this.K.hp; this.maxHp = this.K.hp; this.facing = -1; this.state = 'idle'; this.st = 0; this.anim = 'idle'; this.animT = 0;
    this.t = Math.random() * 3; this.flashT = 0; this.stun = 0; this.dying = 0; this.dieK = 0; this.dead = false; this.awake = false;
    this.cd = 0.6 + Math.random() * 0.8; this.struck = false; this.kbDir = 1; this.orbit = Math.random() < 0.5 ? -1 : 1; this.hpShow = 0;
  }
  setState(s, anim) { this.state = s; this.st = 0; this.stateT = 0; if (anim && this.anim !== anim) { this.anim = anim; this.animT = 0; } }
  takeHit(dmg, kbx, kbz, hero) {
    if (this.dead) return;
    const P = this.play;
    this.hp -= dmg; this.flashT = 0.12; this.stun = 0.32; this.awake = true; this.hpShow = 2.2;
    this.vx = kbx; this.vz = kbz; this.kbDir = sgn(kbx);
    if (this.hp <= 0) {
      this.dead = true; this.dying = 0.5; this.setState('dead', 'hurt'); this.vx *= 1.4;
      P.sfx(this.kindId === 'bat' ? 'bat' : 'hit_heavy'); P.burst(this.x, this.y + this.h * 0.5, this.z, 14, this.kindId === 'bat' ? '#ff5a4a' : '#e8e0c8');
      P.kills++;
    } else this.setState('hurt', 'hurt');
    void hero;
  }
  update(dt) {
    const P = this.play, st = P.stage, hero = P.hero;
    this.t += dt; this.animT += dt; this.st += dt; this.stateT += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.stun > 0) this.stun -= dt;
    if (this.hpShow > 0) this.hpShow -= dt;
    if (this.dead) {
      this.dying -= dt; this.dieK = clamp(1 - this.dying / 0.5, 0, 1);
      this.vx *= 0.9; this.vz *= 0.9; if (this.fly) this.y = Math.max(this.ground, this.y - 260 * dt);
      moveBody(st, this, dt, true);
      return this.dying > 0;
    }
    const dx = hero.x - this.x, dz = hero.z - this.z, dist = Math.hypot(dx, dz * 1.3);
    if (!this.awake) {
      const sameGroup = this.group === 'yard' ? P.section === 'yard' : dist < 430 && Math.abs(hero.y - this.ground) < 150;
      if (sameGroup && hero.state !== 'dead') { this.awake = true; this.setState('chase', this.fly ? 'fly' : 'walk'); }
      else { if (this.fly) this.y = this.ground + this.baseY + Math.sin(this.t * 3) * 6; moveBody(st, this, dt, true); return true; }
    }
    if (this.state === 'hurt') {
      this.vx *= 0.86; this.vz *= 0.86;
      if (this.st > 0.3) this.setState('chase', this.fly ? 'fly' : 'walk');
    } else if (this.fly) this._bat(dt, dx, dz, dist);
    else this._melee(dt, dx, dz, dist);
    if (this.fly) this.y += ((this.ground > PIT_Y + 1 ? this.ground : 0) + this.baseY + Math.sin(this.t * 3.1) * 7 - this.y) * Math.min(1, dt * 4);
    moveBody(st, this, dt, true);
    return true;
  }
  _melee(dt, dx, dz, dist) {
    const P = this.play, hero = P.hero;
    if (this.cd > 0) this.cd -= dt;
    if (this.state === 'attack') {
      this.vx *= 0.8; this.vz *= 0.8;
      const wu = this.params.windup;
      if (!this.struck && this.st >= wu) {
        this.struck = true; P.sfx('slash', 0.8);
        const fx = (hero.x - this.x) * this.facing;
        if (fx > -14 && fx < 96 && Math.abs(hero.z - this.z) <= HIT_DZ && hero.y < this.y + 74 && hero.y + hero.h > this.y) hero.takeHit(this.K.dmg, this.x, this.z);
      }
      if (this.st >= wu + 0.5) { this.cd = 0.5 + Math.random() * 0.5; this.setState('chase', 'walk'); }
      return;
    }
    if (hero.state === 'dead') { this.vx *= 0.8; this.vz *= 0.8; this.anim = 'idle'; return; }
    // 영웅 옆(가까운 쪽) 62 px 자리로 가서 깊이를 맞춘다
    const side = dx > 0 ? -1 : 1;
    const tx = hero.x + side * 62, tz = hero.z;
    const ex = tx - this.x, ez = tz - this.z;
    if (Math.abs(dx) > 8) this.facing = sgn(dx);
    const inRange = Math.abs(dx) < 86 && Math.abs(dx) > 26 && Math.abs(dz) < 13 && Math.abs(hero.y - this.y) < 60;
    if (inRange && this.cd <= 0) { this.struck = false; this.setState('attack', 'attack'); this.animT = 0; return; }
    const sp = this.K.speed, m = Math.hypot(ex, ez);
    let vx = 0, vz = 0;
    if (m > 6) { vx = ex / m * sp; vz = ez / m * sp * 0.8; }
    // 서로 겹치지 않게 살짝 민다
    for (const o of P.enemies) { if (o === this || o.dead || o.fly) continue; const ox = this.x - o.x, oz = this.z - o.z, d = Math.hypot(ox, oz * 1.6); if (d < 40 && d > 0.01) { vx += ox / d * 60; vz += oz / d * 50; } }
    this.vx += (vx - this.vx) * Math.min(1, dt * 8); this.vz += (vz - this.vz) * Math.min(1, dt * 8);
    const moving = Math.hypot(this.vx, this.vz) > 14;
    if (this.anim !== (moving ? 'walk' : 'idle')) { this.anim = moving ? 'walk' : 'idle'; this.animT = 0; }
    void dist;
  }
  _bat(dt, dx, dz, dist) {
    const P = this.play, hero = P.hero;
    if (Math.abs(dx) > 8) this.facing = sgn(dx);
    if (this.cd > 0) this.cd -= dt;
    if (this.state === 'aim') {
      this.vx *= 0.85; this.vz *= 0.85;
      if (this.st >= 0.5) { P.shoot(this, hero); this.cd = 2.1 + Math.random() * 0.8; this.setState('chase', 'fly'); }
      return;
    }
    if (hero.state === 'dead') { this.vx *= 0.9; this.vz *= 0.9; return; }
    // 거리 230–300 을 지키며 옆으로 돈다
    const want = 255, m = Math.hypot(dx, dz) || 1;
    let vx = 0, vz = 0;
    const err = m - want;
    if (Math.abs(err) > 30) { vx = dx / m * sgn(err) * this.K.speed; vz = dz / m * sgn(err) * this.K.speed * 0.8; }
    vx += -dz / m * 46 * this.orbit; vz += dx / m * 40 * this.orbit;
    if (Math.random() < dt * 0.25) this.orbit = -this.orbit;
    this.vx += (vx - this.vx) * Math.min(1, dt * 3); this.vz += (vz - this.vz) * Math.min(1, dt * 3);
    if (this.cd <= 0 && dist < 520) { this.setState('aim', 'fly'); this.state = 'aim'; }
    this.anim = 'fly';
  }
  draw(ctx, cam, R) {
    const st = this.play.stage;
    const s = cam.s(this.z), X = cam.px(this.x, s), Y = cam.py(this.y, this.z, s);
    if (X < -120 || X > cam.W + 120) return;
    if (this.fly) { const g = st.topAt(this.x, this.z, true); R.shadow(ctx, cam, this.x, this.z, g > this.y ? this.ground : g, Math.max(0, this.y - g), 22); }
    else if (this.dead) R.shadow(ctx, cam, this.x, this.z, this.ground, 0, 20 * (1 - this.dieK));
    // 예고: 근접 = 발밑 붉은 부채꼴(깊이 띠), 원거리 = 입가의 불빛
    if (this.state === 'attack' && !this.struck) {
      const k = clamp(this.st / this.params.windup, 0, 1);
      const x0 = cam.px(this.x + this.facing * 4, s), x1 = cam.px(this.x + this.facing * 96, s);
      const sa = cam.s(this.z - HIT_DZ), sb = cam.s(this.z + HIT_DZ);
      const ya = cam.py(this.ground, this.z - HIT_DZ, sa), yb = cam.py(this.ground, this.z + HIT_DZ, sb);
      ctx.fillStyle = `rgba(255,60,40,${0.12 + 0.3 * k})`;
      ctx.beginPath(); ctx.moveTo(x0, ya); ctx.lineTo(x1, ya); ctx.lineTo(x1, yb); ctx.lineTo(x0, yb); ctx.closePath(); ctx.fill();
    }
    this.state0 = this.state; if (this.fly) this.state = this.state0 === 'aim' ? 'hover' : 'fly';
    drawEnemyAt(ctx, this, X, Y, s);
    this.state = this.state0;
    if (this.state === 'aim') R.glow(ctx, X + this.facing * 10 * s, Y - 14 * s, (10 + 26 * clamp(this.st / 0.5, 0, 1)) * s, '#ff4a3a', 0.9);
    if (this.hpShow > 0 && !this.dead) {
      const w = 44 * s, hY = Y - (this.h + 16) * s;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(X - w / 2 - 1, hY - 1, w + 2, 5 * s + 2);
      ctx.fillStyle = '#d83a3a'; ctx.fillRect(X - w / 2, hY, w * clamp(this.hp / this.maxHp, 0, 1), 5 * s);
    }
  }
}

// ───────────────────────── 탄 ─────────────────────────
class Shot {
  constructor(play, from, hero) {
    this.play = play; this.kind = 2; this.key = 0; this.tie = 0;
    this.x = from.x + from.facing * 10; this.z = from.z; this.y = from.y + 12;
    const tx = hero.x + hero.vx * 0.25, tz = hero.z + hero.vz * 0.25;
    const dx = tx - this.x, dz = tz - this.z, m = Math.hypot(dx, dz) || 1, sp = 250;
    this.vx = dx / m * sp; this.vz = dz / m * sp;
    this.ty = hero.y + 44; this.life = Math.min(2.4, m / sp + 0.9); this.t = 0; this.vyK = (this.ty - this.y) / Math.max(0.3, m / sp);
    this.dead = false;
  }
  update(dt) {
    const P = this.play, hero = P.hero, st = P.stage;
    this.t += dt; this.x += this.vx * dt; this.z += this.vz * dt;
    if (this.t < this.life - 0.9) this.y += this.vyK * dt;
    const g = st.topAt(this.x, this.z, true);
    if (this.t > this.life || g > this.y + 4 && g < WALL * 2) { P.burst(this.x, this.y, this.z, 6, '#ff6a4a'); return false; }
    if (Math.abs(hero.x - this.x) < 20 && Math.abs(hero.z - this.z) < 20 && this.y > hero.y - 6 && this.y < hero.y + hero.h + 6) {
      if (hero.takeHit(8, this.x - this.vx * 0.1, this.z - this.vz * 0.1)) P.burst(this.x, this.y, this.z, 8, '#ff6a4a');
      if (hero.inv > 0 && hero.state !== 'dash') return false;
    }
    return true;
  }
  draw(ctx, cam, R) {
    const st = this.play.stage, s = cam.s(this.z), X = cam.px(this.x, s), Y = cam.py(this.y, this.z, s);
    const g = st.topAt(this.x, this.z, true);
    if (g < WALL / 2) R.shadow(ctx, cam, this.x, this.z, g, Math.max(0, this.y - g), 14);
    R.glow(ctx, X, Y, 26 * s, '#ff5a3a', 0.9);
    ctx.fillStyle = '#ffe0b0'; ctx.beginPath(); ctx.arc(X, Y, 5.5 * s, 0, 6.283); ctx.fill();
  }
}

// ───────────────────────── 판 전체 ─────────────────────────
export class Play {
  constructor(game, stage) {
    this.game = game; this.stage = stage;
    this.hero = new Hero(this);
    this.enemies = []; this.shots = []; this.parts = []; this.nums = [];
    this.hitstop = 0; this.trauma = 0; this.kills = 0; this.section = 'street'; this.done = false; this.doneT = 0; this.time = 0; this.vig = 0;
    this.actors = [];
    preloadEnemies(['skeleton', 'bat']);
    this.restart();
  }
  restart() {
    this.enemies = this.stage.spawns.map((sp) => new Enemy(this, sp));
    this.shots.length = 0; this.parts.length = 0; this.nums.length = 0;
    this.hero.hp = this.hero.ghostHp = HERO_HP; this.hero.inv = 0; this.hero.setAnim('idle');
    this.hero.place(this.stage.start.x, this.stage.start.z);
    this.done = false; this.doneT = 0; this.kills = 0; this.hitstop = 0; this.section = this.stage.sectionAt(this.hero.x, this.hero.z).id;
  }
  /** 쓰러짐 → 지금 구간의 들어가는 점에서 다시 (쓰러뜨린 적은 그대로, 남은 적은 제자리로) */
  respawn() {
    const sec = this.stage.sections.find((s) => s.id === (this.section === 'done' ? 'yard' : this.section)) || this.stage.sections[0];
    for (const e of this.enemies) if (!e.dead) e.reset();
    this.shots.length = 0;
    this.hero.hp = HERO_HP; this.hero.inv = 1.2; this.hero.setAnim('idle');
    this.hero.place(sec.tx, sec.tz);
  }
  pitFall() {
    const h = this.hero;
    h.hp = Math.max(1, h.hp - 8); h.inv = 1.2; this.sfx('hurt'); this.shake(0.4); this.vignette();
    this.number(h.safe.x, 90, h.safe.z, 8, '#ff6a5a');
    h.place(h.safe.x, h.safe.z);
  }
  teleport(id) {
    const sec = this.stage.sections.find((s) => s.id === id);
    if (!sec) return false;
    this.hero.place(sec.tx, sec.tz); this.hero.inv = 0.5;
    return true;
  }
  sfx(name, pitch) { try { this.game.audio?.sfx(name, pitch ? { pitch } : undefined); } catch { /* 소리 없음 */ } }
  shake(t) { this.trauma = Math.min(1, this.trauma + t); }
  vignette() { this.vig = 1; }
  heroStrike(hero, mv) {
    const f = hero.facing, b = mv.box;
    const xa = hero.x + (f > 0 ? b.x : -(b.x + b.w)), xb = xa + b.w;
    const lo = hero.y - (b.y + b.h) - 18, hi = hero.y - b.y + 18;
    let any = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const last = hero.hitSet.get(e);
      if (last !== undefined && !(mv.rehit && hero.mvT - last >= mv.rehit)) continue;
      if (Math.abs(e.z - hero.z) > HIT_DZ + 4) continue;
      if (e.x + e.w / 2 < xa || e.x - e.w / 2 > xb) continue;
      if (e.y > hi || e.y + e.h < lo) continue;
      hero.hitSet.set(e, hero.mvT);
      const dmg = Math.round(12 * mv.mv * (0.92 + Math.random() * 0.16));
      const dir = mv.finisher ? sgn(e.x - hero.x) : f;
      e.takeHit(dmg, dir * mv.kb[0] * 1.15, sgn(e.z - hero.z) * 40, hero);
      this.number(e.x, e.y + e.h + 14, e.z, dmg, mv.finisher ? '#ffd24a' : '#ffffff', mv.finisher);
      this.burst(e.x - dir * 6, e.y + e.h * 0.55, e.z - 2, mv.finisher ? 10 : 6, '#fff0c0');
      this.slashFx(e.x, e.y + e.h * 0.55, e.z, dir);
      any = true;
      if (e.dead) { this.shake(0.35); this.hitstop = Math.max(this.hitstop, 0.09); }
    }
    if (any) {
      this.hitstop = Math.max(this.hitstop, (mv.hitstop || 0.045) * 1.25); this.shake(0.12 + (mv.shake || 2) * 0.045);
      this.sfx(mv.finisher ? 'hit_heavy' : 'hit'); input.rumble?.(0.4, 0.2, 60);
    }
  }
  shoot(from, hero) { this.shots.push(new Shot(this, from, hero)); this.sfx('whip', 1.6); }
  // 이펙트
  burst(x, y, z, n, color) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 80 + Math.random() * 220; this.parts.push({ x, y, z, vx: Math.cos(a) * sp, vy: 60 + Math.random() * 260, vz: Math.sin(a) * sp * 0.4, life: 0.25 + Math.random() * 0.3, max: 0.55, color, size: 2 + Math.random() * 3, g: 900 }); }
  }
  dust(x, y, z, n) {
    for (let i = 0; i < n; i++) this.parts.push({ x: x + (Math.random() - 0.5) * 20, y: y + 2, z: z - 1, vx: (Math.random() - 0.5) * 120, vy: 20 + Math.random() * 60, vz: (Math.random() - 0.5) * 40, life: 0.3 + Math.random() * 0.25, max: 0.55, color: '#9a94a8', size: 4 + Math.random() * 4, g: -40, soft: true });
  }
  ring(x, y, z) { this.parts.push({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.28, max: 0.28, color: '#cfe0ff', size: 8, g: 0, ring: true }); }
  slashFx(x, y, z, dir) { this.parts.push({ x, y, z, vx: 0, vy: 0, vz: 0, life: 0.14, max: 0.14, color: '#ffffff', size: 46, g: 0, slash: dir, rot: (Math.random() - 0.5) * 1.2 }); }
  number(x, y, z, v, color, big) { this.nums.push({ x: x + (Math.random() - 0.5) * 16, y, z, v: String(v), color, life: 0.8, big: !!big }); }

  update(dt) {
    this.time += dt;
    if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - dt * 2.2);
    if (this.vig > 0) this.vig = Math.max(0, this.vig - dt * 2.5);
    const fxDt = this.hitstop > 0 ? dt * 0.3 : dt;
    for (let i = this.parts.length - 1; i >= 0; i--) { const p = this.parts[i]; p.life -= fxDt; if (p.life <= 0) { this.parts.splice(i, 1); continue; } p.vy -= p.g * fxDt; p.x += p.vx * fxDt; p.y += p.vy * fxDt; p.z += p.vz * fxDt; }
    for (let i = this.nums.length - 1; i >= 0; i--) { const n = this.nums[i]; n.life -= dt; n.y += 46 * dt; if (n.life <= 0) this.nums.splice(i, 1); }
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    this.hero.update(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) if (!this.enemies[i].update(dt)) this.enemies.splice(i, 1);
    for (let i = this.shots.length - 1; i >= 0; i--) if (!this.shots[i].update(dt)) this.shots.splice(i, 1);
    const sec = this.stage.sectionAt(this.hero.x, this.hero.z).id;
    if (!this.done) {
      this.section = sec;
      let yard = 0; for (const e of this.enemies) if (e.group === 'yard' && !e.dead) yard++;
      if (yard === 0 && !this.enemies.some((e) => e.group === 'yard')) { this.done = true; this.doneT = 0; this.section = 'done'; this.sfx('coin'); }
    } else this.doneT += dt;
  }
  /** 깊이 정렬에 낄 것들 */
  list() {
    const L = this.actors; L.length = 0;
    L.push(this.hero);
    for (const e of this.enemies) L.push(e);
    for (const s of this.shots) L.push(s);
    return L;
  }
  /** 맨 위 이펙트 (깊이 정렬 없이 화면 위에) */
  drawFx(ctx, cam, R) {
    for (const p of this.parts) {
      const s = cam.s(p.z); if (s <= 0 || p.z < cam.zNear) continue;
      const X = cam.px(p.x, s), Y = cam.py(p.y, p.z, s), k = p.life / p.max;
      if (p.ring) { ctx.strokeStyle = `rgba(200,220,255,${k})`; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.ellipse(X, Y, (10 + (1 - k) * 34) * s, (4 + (1 - k) * 12) * s, 0, 0, 6.283); ctx.stroke(); }
      else if (p.slash) {
        ctx.save(); ctx.translate(X, Y); ctx.rotate(p.rot); ctx.scale(p.slash * s, s); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
        ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.quadraticCurveTo(0, -9, p.size, 0); ctx.quadraticCurveTo(0, 5, -p.size, 0); ctx.fill();
        ctx.restore();
      } else if (p.soft) { ctx.globalAlpha = k * 0.4; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(X, Y, p.size * s * (1.6 - k * 0.6), 0, 6.283); ctx.fill(); ctx.globalAlpha = 1; }
      else { ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.color; ctx.fillRect(X - p.size * s / 2, Y - p.size * s / 2, p.size * s, p.size * s); ctx.globalAlpha = 1; }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (const n of this.nums) {
      const s = cam.s(n.z); if (n.z < cam.zNear) continue;
      const X = cam.px(n.x, s), Y = cam.py(n.y, n.z, s), k = clamp(n.life / 0.25, 0, 1), pop = 1 + Math.max(0, n.life - 0.68) * 5;
      const size = Math.round((n.big ? 30 : 22) * Math.max(0.7, s) * pop);
      ctx.globalAlpha = k; ctx.font = `800 ${size}px ${FONT.dmg || FONT.num}`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(n.v, X, Y); ctx.fillStyle = n.color; ctx.fillText(n.v, X, Y);
      ctx.globalAlpha = 1;
    }
    void R;
  }
}
