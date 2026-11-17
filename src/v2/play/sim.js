// v2 play — 놀이 규칙 (영웅 · 적 · 탄 · 판정 · 사건). 화면을 모른다: 좌표 x · z · y 와 시간만 다룬다. docs/v2/PLAY_API.md
// 시범판 B 의 sim.js 에서 자랐다. 같은 모양(Sim · hero · enemies · shots · section · reset · teleport · hooks)을 지키고 알맹이를 바꿨다:
//   영웅 = 연타 3 (셋째는 넓게) · 점프 중 내려베기 · 구르기(짧은 무적) · 구른 직후 훑기 · 막기 / 튕겨내기 · 부드러운 락온
//   적   = 종류표(enemies.js)의 자료와 행동. 공격은 예고(windup) → 판정(strike) → 틈(recover), 판정은 보는 방향 기준 상자
//   사건 = hooks 로 내보낸다 (발소리 · 휘두름 · 닿음 · 튕겨냄 · 착지 · 구르기 …). 모든 사건은 hooks.event(name, …) 로도 한 번씩 간다
import { bindWorld, STEP_UP, STEP_DOWN } from './collide.js';
import { TUNE } from './tune.js';
import { MOVES, COMBO } from './moves.js';
import { AI, kindOf, kindId, rnd } from './enemies.js';

export { TUNE };
const sgn = (v) => (v < 0 ? -1 : 1);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const RAD = Math.PI / 180;
const NOINP = Object.freeze({ mx: 0, mz: 0 });
const REFLECT = Object.freeze({ id: 'reflect', kind: 'shot', str: 'H', weapon: 'arrow', kb: [200, 0], hitstop: 0.06, mv: 2, hit: [0, 0] });
const TELE = { street: [260, 130], pillar: [640, 60], platform: [760, 190], pit: [1740, 100], corner: [2150, 150], alley: [2190, 380], stairs: [2190, 660], garden: [2190, 1250], yard: [2190, 1600] };   // 시범 구간(시범판 B 와 같은 자리)

export class Sim {
  /**
   * W: 세계 (collide.js 머리말). hooks: 사건을 받는 함수들 — 있는 것만 불린다 (docs/v2/PLAY_API.md §5).
   *   옛 이름: hit(e,dmg,mv,x,y,z,info) kill(e) heroHurt(dmg,pit) shake(px) sfx(name) spark(x,y,z,kind) number(x,y,z,text,color) done()
   *   새 이름: step swing attack parry guard guardUp land roll jump tell enemySwing cast shot lock wake whiff stagger + event(name, …)
   */
  constructor(W, hooks = {}) { this.W = W; this.hooks = hooks; this.w = bindWorld(W); this.deaths = 0; this.reset(); }
  emit(name, a, b, c, d, e, f, g) {
    const H = this.hooks, fn = H[name]; let r;
    if (fn) r = fn.call(H, a, b, c, d, e, f, g);
    if (H.event) H.event(name, a, b, c, d, e, f, g);
    return r;
  }
  reset() {
    const W = this.W, T = TUNE;
    this.time = 0; this.stop = 0; this.done = false; this.kills = 0; this._buf = { attack: false, dash: false, jump: false, lockNext: false }; this._nid = 0;
    this.hero = {
      x: W.start.x, z: W.start.z, y: W.start.y, vx: 0, vz: 0, vy: 0, r: 14, h: 92, facing: 1, dirX: 1, dirZ: 0, onGround: true, coyote: 0,
      hp: T.heroHp, hpMax: T.heroHp, ifr: 0, hurtT: 0, dead: false, deadT: 0, flash: 0,
      dashT: 0, rollCd: 0, dashCd: 0, dvx: 0, dvz: 0, roll: null, sweepWin: 0, sweepQ: false,
      guard: false, guardT: 0, guardTap: 0, parryT: 0, parryCd: 0, parryOk: 0, blockT: 0,
      move: null, moveT: 0, combo: 0, hitIds: null, assist: null, queued: 0, swung: false, stepDist: 0, airAtk: false, plungeLand: null,
      lock: null, lockT: 0, lockHold: 0,
      gait: 0, gaitMode: 'run', wasMoving: false,
      anim: 'idle', animT: 0, t: 0, cut: false, landT: 0, landV: 0,
      safe: { x: W.start.x, z: W.start.z, y: W.start.y },
    };
    this.enemies = [];
    for (const s of W.spawns ?? []) this.addEnemy(s);
    this.shots = [];
    this.section = this.w.section(this.hero.x, this.hero.z)?.id ?? this.section ?? 'street';
  }
  /** 적 하나를 더한다 (스테이지 spawns 한 줄과 같은 모양: {kind, x, z, y?, yard?, active?}). 돌려주는 값 = 적 */
  addEnemy(s) {
    const D = kindOf(s.kind), g = this.w.ground(s.x, s.z, (s.y ?? 1e9) + STEP_UP), gy = Number.isFinite(s.y) ? s.y : Number.isFinite(g) ? g : 0, id = this._nid++;
    const e = {
      id, kind: s.kind, kid: kindId(s.kind), def: D, yard: !!s.yard, x: s.x, z: s.z, y: gy, gy, vx: 0, vz: 0, r: D.r, h: D.hpx,
      hp: D.hp, hpMax: D.hp, facing: -1, dirX: -1, dirZ: 0, state: 'idle', stateT: 0, phase: null, tele: 0, atk: null, cd: rnd(0.3, 1.2),
      flashT: 0, stun: 0, stagger: 0, dying: 0, dead: false, active: !!s.active, solid: true, alpha: 1, hover: D.hover ?? 0, solidT: 0, revealT: 0,
      anim: 'idle', animT: 0, t: rnd(0, 5), hitDone: false, swung: false, kx: 0, kz: 0, gait: rnd(0, 1), moved: 0,
      side: id % 2 ? 1 : -1, detourT: 0, detX: 0, detZ: 0, stuckT: 0, orb: rnd(0, 6.28), orbW: (id % 2 ? 1 : -1) * rnd(1.1, 1.7), orbR: D.orbit ? rnd(D.orbit[0], D.orbit[1]) : 0,
    };
    if (D.fade != null) { e.solid = false; e.alpha = D.fade; }
    if (e.active) e.state = 'chase';
    e.y = e.gy + e.hover;
    this.enemies.push(e);
    return e;
  }
  /** 효과 · 소리 쪽이 정한 경직을 넣는다 (초) */
  hitStop(sec) { this.stop = Math.max(this.stop, sec); }
  /** 숨은 것을 드러낸다 (메아리 · 등불 자리): 반지름 r 안의 유령이 t 초 동안 또렷해져 맞는다 */
  reveal(x, z, r, t = 2.5) { for (const e of this.enemies) if (!e.dead && e.def.fade != null && Math.hypot(e.x - x, e.z - z) < r) e.revealT = Math.max(e.revealT, t); }
  byId(id) { for (const e of this.enemies) if (e.id === id) return e; return null; }
  teleport(sec) {
    const s = this.W.sections?.find((q) => q.id === sec), P = this.W.tele?.[sec] ?? TELE[sec] ?? (s ? [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2] : null);
    if (!P) return false;
    const h = this.hero, g = this.w.ground(P[0], P[1]); if (!Number.isFinite(g)) return false;
    h.x = P[0]; h.z = P[1]; h.y = g; h.vx = h.vz = h.vy = 0; h.onGround = true; h.move = null; h.dashT = 0; h.guard = false; h.safe = { x: h.x, z: h.z, y: h.y };
    this.section = this.w.section(h.x, h.z)?.id ?? this.section;
    return true;
  }
  /** inp: { mx, mz(−1…1; + = 화면 안쪽), jump · attack · dash · lockNext (눌린 프레임), jumpHeld · guard (누르고 있음) } */
  update(dt, inp = NOINP) {
    if (this.stop > 0) {   // 경직 중에 누른 단추는 잃지 않고 기억해 둔다
      this.stop -= dt; const B = this._buf;
      if (inp.attack) B.attack = true; if (inp.dash) B.dash = true; if (inp.jump) B.jump = true; if (inp.lockNext) B.lockNext = true;
      return;
    }
    this.time += dt;
    this._hero(dt, inp);
    for (const e of this.enemies) if (!e.dead) this._enemy(e, dt);
    this._separate(dt);
    this._shots(dt);
    const sec = this.w.section(this.hero.x, this.hero.z);
    if (sec && !this.done) this.section = sec.id;
    if (!this.done && this.enemies.some((e) => e.yard) && this.enemies.every((e) => !e.yard || e.dead)) { this.done = true; this.section = 'done'; this.emit('done'); }
  }
  // ───────────────────────── 영웅 ─────────────────────────
  _hero(dt, inp) {
    const h = this.hero, T = TUNE, w = this.w, B = this._buf;
    const pAttack = !!inp.attack || B.attack, pDash = !!inp.dash || B.dash, pJump = !!inp.jump || B.jump, pLock = !!inp.lockNext || B.lockNext;
    B.attack = B.dash = B.jump = B.lockNext = false;
    h.t += dt; h.ifr = Math.max(0, h.ifr - dt); h.rollCd = Math.max(0, h.rollCd - dt); h.dashCd = h.rollCd; h.flash = Math.max(0, h.flash - dt * 5); h.landT = Math.max(0, h.landT - dt);
    h.parryT = Math.max(0, h.parryT - dt); h.parryCd = Math.max(0, h.parryCd - dt); h.parryOk = Math.max(0, h.parryOk - dt); h.blockT = Math.max(0, h.blockT - dt);
    h.sweepWin = Math.max(0, h.sweepWin - dt); h.guardTap = Math.max(0, h.guardTap - dt);
    if (h.dead) {
      h.deadT += dt; h.vx *= 0.9; h.vz *= 0.9;
      this._fall(h, dt);
      if (h.deadT > T.deadT) { this.deaths++; this.reset(); return; }
      this._anim(h, 'death', dt); return;
    }
    let mx = inp.mx || 0, mz = inp.mz || 0; const m0 = Math.hypot(mx, mz);
    if (m0 > 1) { mx /= m0; mz /= m0; }
    const m = Math.min(1, m0), moving = m > 0.15;
    if (!moving) mx = mz = 0;
    const ux = moving ? mx / m : 0, uz = moving ? mz / m : 0;
    this._lock(h, pLock, dt);
    if (h.hurtT > 0) {   // 맞아서 밀리는 중: 조작 불가
      h.hurtT -= dt; h.vx *= 1 - Math.min(1, 6 * dt); h.vz *= 1 - Math.min(1, 6 * dt); h.guard = false; h.queued = 0;
    } else {
      const mv0 = h.move, pastHit = !mv0 || (mv0.kind === 'plunge' ? h.plungeLand != null : h.moveT >= mv0.hit[1]);
      // 구르기: 스틱을 민 채 dash, 또는 막는 중에 스틱을 민다. 공격은 판정이 끝난 뒤부터 구르기로 끊을 수 있다
      const wantRoll = (pDash && moving) || (h.guard && moving && (inp.guard || h.guardTap > 0));
      if (wantRoll && h.rollCd <= 0 && h.dashT <= 0 && pastHit) this._startRoll(h, ux, uz);
      else if (pDash && !moving && h.onGround) h.guardTap = T.guardTap;   // 제자리에서 누름 = 막기 (짧게 누르면 튕겨내기 시도)
      // 막기
      const gHeld = !!inp.guard || h.guardTap > 0;
      const canGuard = gHeld && !moving && h.onGround && h.dashT <= 0 && (!h.move || (h.move.kind !== 'plunge' && h.moveT >= h.move.hit[1]));
      if (canGuard && !h.guard) {
        h.guard = true; h.guardT = 0; h.move = null; h.combo = 0; h.queued = 0;
        if (h.parryCd <= 0) { h.parryT = T.parryWin; h.parryCd = 0.5; }
        const le = h.lock != null ? this.byId(h.lock) : null; if (le) this._face(h, le.x - h.x, le.z - h.z);
        this.emit('guardUp', h);
      } else if (!canGuard && h.guard) h.guard = false;
      if (h.guard) h.guardT += dt;
      // 공격: 연타 3 · 공중 내려베기 · 구른 직후 훑기
      const chain = h.move && h.move.kind === 'combo' && h.moveT >= h.move.cancel && h.onGround && h.move.n < 2;
      if (pAttack) {
        if (h.dashT > 0) h.sweepQ = true;
        else if (!h.move) { h.guard = false; h.guardTap = 0; this._startMove(h, !h.onGround ? (h.airAtk ? null : MOVES.plunge) : h.sweepWin > 0 ? MOVES.sweep : COMBO[0], ux, uz, moving); }
        else if (chain) this._startMove(h, COMBO[h.move.n + 1], ux, uz, moving);
        else h.queued = T.queueT;
      } else if (h.queued > 0) {
        h.queued -= dt;
        if (chain) this._startMove(h, COMBO[h.move.n + 1], ux, uz, moving);
      }
      if (h.dashT > 0) {   // 구르는 중: 정해진 방향으로, 처음이 빠르고 끝이 느리게
        const R = h.roll; R.t += dt; h.dashT -= dt;
        const u = clamp(R.t / R.dur, 0, 1), v = R.v0 * (1 - 0.65 * u);
        h.vx = R.dx * v; h.vz = R.dz * v * 0.82;
        if (h.dashT <= 0) {
          h.dashT = 0; h.sweepWin = T.rollSweep;
          if (h.sweepQ && h.onGround) { h.sweepQ = false; this._startMove(h, MOVES.sweep, ux, uz, moving); }
          h.sweepQ = false;
        }
      } else if (h.move) {
        const mv = h.move, t = h.moveT;
        if (mv.kind === 'plunge') {
          const k = Math.min(1, 8 * dt);
          h.vx += (h.dirX * (h.onGround ? 0 : 70) - h.vx) * k; h.vz += (h.dirZ * (h.onGround ? 0 : 56) - h.vz) * k;
        } else {
          const st = mv.step, sv = st && t >= st[0] && t < st[1] ? h.stepDist / (st[1] - st[0]) : 0;
          h.vx = h.dirX * sv; h.vz = h.dirZ * sv * 0.85;
        }
        h.moveT += dt;
        if (!h.swung && h.moveT >= mv.hit[0] - 0.085) { h.swung = true; this.emit('swing', h, mv); this.hooks.sfx?.(mv.sfx || 'slash'); }
        if (t >= mv.hit[0] && t <= mv.hit[1] && h.plungeLand == null) this._heroHit(h, mv);
        if (mv.kind === 'plunge') { if (h.plungeLand != null && h.moveT >= h.plungeLand + mv.recover) this._endMove(h); }
        else if (h.moveT >= mv.dur || (moving && h.moveT >= mv.free && h.queued <= 0)) this._endMove(h);
      } else if (h.guard || h.blockT > 0 || h.parryOk > T.parryT - 0.16) {   // 버티는 자세: 제자리에서 멈춘다
        const k = Math.min(1, 14 * dt); h.vx -= h.vx * k; h.vz -= h.vz * k;
      } else {
        const k = Math.min(1, (h.onGround ? T.accel : T.airAccel) * dt);
        h.vx += (mx * T.runX - h.vx) * k; h.vz += (mz * T.runZ - h.vz) * k;
        if (moving) this._face(h, mx, mz);
      }
      // 점프 (공격은 끊을 수 있는 시각부터)
      if (pJump && (h.onGround || h.coyote > 0) && h.dashT <= 0 && (!h.move || (h.move.kind !== 'plunge' && h.moveT >= h.move.cancel))) {
        h.vy = T.jumpV; h.onGround = false; h.coyote = 0; h.cut = false; h.move = null; h.combo = 0; h.guard = false; h.guardTap = 0; h.airAtk = false; inp.jumpUsed = true;
        this.emit('jump', h); this.hooks.sfx?.('jump'); this.hooks.spark?.(h.x, h.y + 4, h.z, 'dust');
      }
      if (!h.onGround && !inp.jumpHeld && !h.cut && h.vy > T.jumpV * T.jumpCut && !h.move) { h.vy = T.jumpV * T.jumpCut; h.cut = true; }
    }
    w.move(h, h.vx * dt, h.vz * dt);
    const wasAir = !h.onGround, vy0 = h.vy;
    this._fall(h, dt, h.dashT > 0 ? 0.25 : h.move && h.move.kind === 'plunge' ? h.move.fallG : 1);
    if (wasAir && h.onGround) {
      const heavy = vy0 < -900 || (h.move && h.move.kind === 'plunge');
      h.landT = T.landT; h.landV = -vy0; h.airAtk = false;
      if (h.move && h.move.kind === 'plunge') { h.plungeLand = h.moveT; this._plungeImpact(h, h.move); }
      this.hooks.spark?.(h.x, h.y + 3, h.z, 'dust'); this.emit('land', -vy0, heavy, h); this.hooks.sfx?.('land');
    }
    // 구덩이
    if (h.y < T.pitY) {
      h.hp -= T.pitDmg; h.x = h.safe.x; h.z = h.safe.z; h.y = h.safe.y; h.vx = h.vz = h.vy = 0; h.onGround = true; h.move = null; h.dashT = 0; h.ifr = 1.2; h.flash = 1;
      this.emit('heroHurt', T.pitDmg, true); this.hooks.number?.(h.x, h.y + 100, h.z, '-' + T.pitDmg, '#ff7060');
      if (h.hp <= 0) this._die(h);
    } else if (h.onGround && h.dashT <= 0) {
      let ok = true;   // 안전한 자리 기억 (가장자리에서 조금 안쪽)
      for (const [ox, oz] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) { const g = w.ground(h.x + ox, h.z + oz, h.y + STEP_UP); if (!(g >= h.y - STEP_DOWN)) { ok = false; break; } }
      if (ok) { h.safe.x = h.x; h.safe.z = h.z; h.safe.y = h.y; }
    }
    // 걸음 주기: 발소리와 달리기 클립이 같이 쓴다
    const sp = Math.hypot(h.vx, h.vz), walking = h.onGround && sp > 24 && !h.move && h.dashT <= 0 && h.hurtT <= 0;
    h.gaitMode = sp < T.walkBelow - (h.gaitMode === 'walk' ? -12 : 12) ? 'walk' : 'run';
    if (walking) {
      const g0 = h.gait, g1 = g0 + (sp * dt) / (h.gaitMode === 'walk' ? T.strideWalk : T.strideRun);
      if (g1 >= 1) this.emit('step', 'R', sp, h); else if (g0 < 0.5 && g1 >= 0.5) this.emit('step', 'L', sp, h);
      h.gait = g1 % 1;
    }
    this._anim(h, h.hurtT > 0 ? 'hurt' : h.parryOk > 0 && !h.move && h.dashT <= 0 ? 'parry' : h.blockT > 0 && !h.move && h.dashT <= 0 ? 'block' : h.move ? 'attack' : h.dashT > 0 ? 'roll'
      : !h.onGround ? (h.vy > 0 ? 'jump' : 'fall') : h.guard ? 'guard' : h.landT > 0 ? 'land' : sp > 36 ? h.gaitMode : 'idle', dt);
  }
  _anim(o, a, dt) { if (o.anim !== a) { o.anim = a; o.animT = 0; } else o.animT += dt; }
  setAnim(o, a, dt) { this._anim(o, a, dt); }
  _fall(o, dt, gk = 1) {
    const g = this.w.ground(o.x, o.z, o.y + STEP_UP);
    if (o.onGround) {
      if (g >= o.y - STEP_DOWN) o.y = g; else { o.onGround = false; o.coyote = TUNE.coyote; o.vy = 0; }
    } else {
      o.coyote = Math.max(0, (o.coyote ?? 0) - dt);
      o.vy -= TUNE.gravity * gk * dt; if (o.vy < -1500) o.vy = -1500;
      o.y += o.vy * dt;
      if (o.vy <= 0 && o.y <= g) { o.y = g; o.vy = 0; o.onGround = true; }
    }
  }
  /** 보는 방향(360°)을 정한다. 좌우 값 facing 은 옛 코드용으로 함께 맞춘다 */
  _face(h, dx, dz) {
    const d = Math.hypot(dx, dz); if (d < 1e-4) return;
    h.dirX = dx / d; h.dirZ = dz / d;
    if (Math.abs(h.dirX) > 0.25) h.facing = sgn(h.dirX);
  }
  _endMove(h) { h.move = null; h.combo = 0; h.plungeLand = null; }
  _startRoll(h, ux, uz) {
    const T = TUNE;
    h.roll = { t: 0, dur: T.rollT, dx: ux, dz: uz, v0: T.rollDist / (T.rollT * 0.675) };
    h.dashT = T.rollT; h.rollCd = T.rollCd; h.dvx = ux * h.roll.v0; h.dvz = uz * h.roll.v0 * 0.82; h.ifr = Math.max(h.ifr, T.rollIfr);
    h.move = null; h.combo = 0; h.queued = 0; h.guard = false; h.guardTap = 0; h.parryOk = 0; h.blockT = 0; h.sweepQ = false; h.plungeLand = null;
    this._face(h, ux, uz); if (h.vy < 0) h.vy = 0;
    this.emit('roll', ux, uz, h); this.hooks.sfx?.('dash'); this.hooks.spark?.(h.x, h.y + 6, h.z, 'dust');
  }
  /** 락온: 가까운 적에게 저절로 걸리고(앞쪽을 조금 더 친다), lockNext 로 다음 적. 손으로 바꾼 뒤 4초는 저절로 바뀌지 않는다 */
  _lock(h, next, dt) {
    const T = TUNE; let cur = h.lock != null ? this.byId(h.lock) : null;
    const ok = (e, lim) => !e.dead && e.state !== 'dead' && e.active && Math.abs(e.gy - h.y) < 170 && Math.hypot(e.x - h.x, e.z - h.z) < lim;
    const score = (e) => { const ex = e.x - h.x, ez = e.z - h.z, d = Math.hypot(ex, ez) || 1; return d * (1.25 - 0.25 * ((ex * h.dirX + ez * h.dirZ) / d)); };
    if (cur && !ok(cur, T.lockKeep)) cur = null;
    if (next) {
      const C = this.enemies.filter((e) => ok(e, T.lockKeep)).sort((a, b) => score(a) - score(b));
      cur = C.length ? C[(C.indexOf(cur) + 1) % C.length] : null; h.lockHold = 4;
    } else if (cur && h.lockHold > 0) h.lockHold -= dt;
    else {
      let best = null, bs = 1e9;
      for (const e of this.enemies) if (ok(e, T.lockRange)) { const s = score(e); if (s < bs) { bs = s; best = e; } }
      if (best && (!cur || bs < score(cur) * 0.7)) cur = best;
    }
    const id = cur ? cur.id : null;
    if (id !== h.lock) { h.lock = id; h.lockT = 0; this.emit('lock', id, cur); } else h.lockT += dt;
  }
  /** 공격이 향할 적: 락온 대상이 맞는 방향이면 그것, 아니면 방향 안에서 가장 알맞은 적 */
  _aimTarget(h, fx, fz, stick) {
    const T = TUNE, lim = stick ? T.aimCone : 80;
    const fit = (e, cone, far) => {
      if (e.dead || e.state === 'dead' || !e.solid || e.y - h.y > 135 || h.y - e.y > 80) return -1;
      const ex = e.x - h.x, ez = e.z - h.z, d = Math.hypot(ex, ez); if (d > far) return -1; if (d < 1) return 0;
      const a = Math.acos(clamp((ex * fx + ez * fz) / d, -1, 1)) / RAD;
      return a > cone ? -1 : d + a * 1.5;
    };
    const le = h.lock != null ? this.byId(h.lock) : null;
    if (le && fit(le, stick ? 75 : 180, T.lockAim) >= 0) return le;
    let best = null, bs = 1e9;
    for (const e of this.enemies) { const s = fit(e, lim, 190); if (s >= 0 && s < bs) { bs = s; best = e; } }
    return best;
  }
  _startMove(h, mv, ux, uz, stick) {
    if (!mv) return;
    let fx = h.dirX, fz = h.dirZ;
    if (stick) { fx = ux; fz = uz; }   // 스틱을 민 쪽으로 벤다 (위 · 아래 = 화면 안쪽 · 바깥쪽도)
    const tgt = this._aimTarget(h, fx, fz, stick);
    let sd = mv.step ? mv.step[2] : 0;
    if (tgt) {
      const ex = tgt.x - h.x, ez = tgt.z - h.z, d = Math.hypot(ex, ez);
      if (d > 12) { fx = ex / d; fz = ez / d; }
      const reach = mv.box ? mv.box.f1 : mv.arc ? mv.arc.r : 90;
      sd = clamp(d - tgt.r - reach * 0.62, 0, TUNE.lungeMax);   // 대상이 판정 한가운데 오도록 내딛는다 (붙어 있으면 내딛지 않는다)
    }
    this._face(h, fx, fz);
    h.move = mv; h.moveT = 0; h.combo = mv.n ?? 0; h.hitIds = new Set(); h.queued = 0; h.swung = false; h.assist = tgt; h.stepDist = sd; h.sweepWin = 0; h.parryOk = 0; h.blockT = 0; h.plungeLand = null;
    if (mv.kind === 'plunge') { h.airAtk = true; h.vy = Math.min(h.vy, mv.fallV); h.vx *= 0.4; h.vz *= 0.4; h.cut = true; }
    this.emit('attack', h, mv);
  }
  /** 보는 방향 기준 판정: 상자(box) 또는 부채꼴(arc) 안에 (x,z,반지름 r, 높이 y0…y1)이 드는가 */
  _inShape(o, mv, x, z, r, y0, y1) {
    const ex = x - o.x, ez = z - o.z, f = ex * o.dirX + ez * o.dirZ, l = Math.abs(ez * o.dirX - ex * o.dirZ);
    if (mv.box) { const b = mv.box; return !(f + r < b.f0 || f - r > b.f1 || l > b.side + r * 0.5 || y0 > o.y + b.y1 || y1 < o.y + b.y0); }
    const a = mv.arc, d = Math.hypot(ex, ez);
    if (d - r > a.r || y0 > o.y + a.y1 || y1 < o.y + a.y0) return false;
    return d < r + 10 || Math.atan2(l, f) / RAD <= a.deg / 2;
  }
  _heroHit(h, mv) {
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dead' || h.hitIds.has(e.id)) continue;
      if (!this._inShape(h, mv, e.x, e.z, e.r, e.y, e.y + e.h)) continue;
      h.hitIds.add(e.id);
      this._hitEnemy(e, mv, h);
    }
    for (const s of this.shots) {   // 탄도 벨 수 있다
      if (s.dead || s.friendly) continue;
      if (!this._inShape(h, mv, s.x, s.z, 10, s.y - 12, s.y + 12)) continue;
      s.dead = true; this.hooks.spark?.(s.x, s.y, s.z, 'shot'); this.emit('shot', s, 'cut'); this.hooks.sfx?.('parry');
    }
  }
  _plungeImpact(h, mv) {
    const L = mv.land, cx = h.x + h.dirX * L.fwd, cz = h.z + h.dirZ * L.fwd;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dead' || h.hitIds.has(e.id)) continue;
      if (Math.hypot(e.x - cx, e.z - cz) > L.r + e.r || e.y > h.y + L.y1 || e.y + e.h < h.y + L.y0) continue;
      h.hitIds.add(e.id); this._hitEnemy(e, mv, h);
    }
    this.emit('shake', 6);
  }
  /** 적이 맞는다. src = 때린 쪽(영웅 또는 되돌아간 탄 — x,z 를 가진 것) */
  _hitEnemy(e, mv, src) {
    const D = e.def, T = TUNE;
    if (!e.solid) { this.hooks.spark?.(e.x, e.y + e.h * 0.6, e.z, 'wisp'); this.emit('whiff', e, mv); return false; }   // 흐린 유령은 베이지 않는다
    let ax = e.x - src.x, az = e.z - src.z; const ad = Math.hypot(ax, az);
    if (ad > 1) { ax /= ad; az /= ad; } else { ax = src.dirX ?? 1; az = src.dirZ ?? 0; }
    const front = -(ax * e.dirX + az * e.dirZ);   // 1 = 때린 쪽이 적의 정면에 있다
    let dmg = Math.round(T.dmgBase * mv.mv * rnd(0.9, 1.12)), blocked = false;
    if (D.armorFront && e.stagger <= 0 && front > Math.cos(D.armorFront.arc * RAD)) { blocked = true; dmg = Math.max(1, Math.round(dmg * D.armorFront.k)); }
    const back = front < -0.3;
    if (!blocked && (back || e.stagger > 0)) dmg = Math.round(dmg * 1.3);   // 등 뒤 · 비틀거리는 틈
    e.hp -= dmg; e.flashT = 0.13; e.active = true; if (e.state === 'idle') e.state = 'chase';
    const kill = e.hp <= 0;
    if (!blocked || kill) {
      const kb = mv.kb[0] * (1 - D.weight);
      e.kx = ax * kb * 1.1; e.kz = az * kb * 0.9;
      const armored = D.poise && e.state === 'attack' && e.stagger <= 0;   // 큰 적은 공격 도중에 움찔하지 않는다
      if (!armored && D.stun > 0) { e.stun = Math.max(e.stun, D.stun * (mv.str === 'F' ? 1.5 : 1)); if (e.state === 'attack') this._cancelAttack(e, 0.5); }
    } else if (src === this.hero && src.move) {   // 갑주 앞면에 튕긴다: 영웅이 조금 밀린다
      src.vx = -src.dirX * 110; src.vz = -src.dirZ * 90; src.stepDist = 0;
    }
    const info = { strength: mv.str, weapon: mv.weapon, material: D.material, blocked, back, kill, dirX: ax, dirZ: az, elite: !!D.elite, boss: !!D.boss };
    const hx = e.x - ax * 8, hy = e.y + Math.min(e.h * 0.62, 70), hz = e.z - az * 8;
    const r = this.emit('hit', e, dmg, mv, hx, hy, hz, info);
    if (T.ownHitstop) this.stop = Math.max(this.stop, typeof r === 'number' ? r : mv.hitstop * (blocked ? 1.5 : 1.25));
    if (kill) this._kill(e);
    return true;
  }
  _kill(e) {
    e.state = 'dead'; e.dying = e.def.dieT; e.phase = null; e.atk = null; e.tele = 0; e.stagger = 0; e.stun = 0; e.kx *= 1.4; e.kz *= 1.4; e.solid = true;
    this.emit('kill', e);
  }
  _cancelAttack(e, cd = 0.5) { e.state = 'chase'; e.stateT = 0; e.phase = null; e.atk = null; e.tele = 0; e.cd = Math.max(e.cd, cd); }
  /**
   * 영웅이 맞는다. src: { e(때린 적), atk(공격 한 줄), shot(탄) }. 돌려주는 값: false(무적 — 빗나감) | 'parry' | 'guard' | 'hurt'
   * 옛 호출(hurtHero(dmg, dirX, dirZ))도 그대로 된다.
   */
  hurtHero(dmg, dirX, dirZ = 0, src = {}) {
    const h = this.hero, T = TUNE, atk = src.atk, from = src.shot ?? src.e;
    if (h.dead) return false;
    if (h.ifr > 0) { if (h.dashT > 0 && !h.dodged) { h.dodged = true; this.emit('dodge', h, src); } return false; }
    h.dodged = false;
    let ax = -dirX, az = -dirZ;   // 영웅에서 때린 쪽으로
    if (from) { const d = Math.hypot(from.x - h.x, from.z - h.z); if (d > 1) { ax = (from.x - h.x) / d; az = (from.z - h.z) / d; } }
    const facingIt = ax * h.dirX + az * h.dirZ > Math.cos(T.guardArc * RAD);
    if (h.guard && facingIt) {
      const px = h.x + ax * 26, py = h.y + 62, pz = h.z + az * 26;
      if (h.parryT > 0 && (!atk || atk.parry !== false)) {   // 튕겨내기
        h.parryOk = T.parryT; h.parryT = 0; h.ifr = Math.max(h.ifr, 0.3); h.blockT = 0; this._face(h, ax, az);
        if (src.e && !src.shot) this.staggerEnemy(src.e, atk?.staggerT ?? 1.2);
        this.stop = Math.max(this.stop, 0.1);
        this.emit('parry', px, py, pz, src); this.hooks.sfx?.('parry'); this.hooks.spark?.(px, py, pz, 'parry');
        return 'parry';
      }
      if (!atk || atk.guard !== 'break') {   // 막기
        const chip = atk && atk.guard === 'chip' ? Math.round(dmg * (atk.chip ?? 0.3)) : 0;
        h.blockT = T.blockT; h.vx = -ax * T.guardPush * (chip ? 1.8 : 1); h.vz = -az * T.guardPush * 0.8 * (chip ? 1.8 : 1);
        if (chip) { h.hp -= chip; h.flash = 0.6; this.hooks.number?.(h.x, h.y + 100, h.z, '-' + chip, '#ffb060'); }
        this.stop = Math.max(this.stop, 0.05);
        this.emit('guard', px, py, pz, chip, src); this.hooks.sfx?.('guard'); this.hooks.spark?.(px, py, pz, 'guard');
        if (h.hp <= 0) this._die(h);
        return 'guard';
      }
      h.guard = false; h.guardTap = 0;   // 막을 수 없는 공격: 그대로 맞는다
    }
    const heavy = !!atk && (atk.str === 'H' || atk.str === 'F'), kb = (atk?.knock ?? 240);
    h.hp -= dmg; h.ifr = T.hurtIfr; h.hurtT = heavy ? T.hurtT * 1.5 : T.hurtT; h.vx = dirX * kb; h.vz = dirZ * kb * 0.67; h.move = null; h.combo = 0; h.dashT = 0; h.guard = false; h.guardTap = 0; h.flash = 1; h.plungeLand = null; h.heavyHurt = heavy;
    this.stop = Math.max(this.stop, 0.07);
    this.emit('heroHurt', dmg, false, src); this.hooks.number?.(h.x, h.y + 100, h.z, '-' + dmg, '#ff7060');
    if (h.hp <= 0) this._die(h);
    return 'hurt';
  }
  _die(h) { h.hp = 0; h.dead = true; h.deadT = 0; h.move = null; h.guard = false; h.dashT = 0; this.emit('heroDie', h); this.hooks.sfx?.('die'); }
  /** 적을 비틀거리게 한다 (튕겨냄 · 종소리). 박쥐처럼 작은 것은 그대로 떨어진다 */
  staggerEnemy(e, t = 1.2) {
    if (e.dead || e.state === 'dead') return;
    if (e.def.fly) { e.hp = 0; this._kill(e); return; }
    e.stagger = t; e.state = 'stagger'; e.stateT = 0; e.phase = null; e.atk = null; e.tele = 0; e.stun = 0; e.solid = true; e.staggerSide = e.side;
    e.kx = -e.dirX * 120 * (1 - e.def.weight); e.kz = -e.dirZ * 100 * (1 - e.def.weight);
    this.emit('stagger', e, t);
  }
  // ───────────────────────── 적 ─────────────────────────
  _enemy(e, dt) {
    const h = this.hero, D = e.def;
    e.t += dt; e.flashT = Math.max(0, e.flashT - dt); e.cd -= dt; e.revealT = Math.max(0, e.revealT - dt); e.moved = 0;
    if (e.state === 'dead') {   // 쓰러지는 중: 밀려나며 눕는다
      e.dying -= dt; e.kx *= 1 - Math.min(1, 5 * dt); e.kz *= 1 - Math.min(1, 5 * dt);
      this._emove(e, e.kx * dt, e.kz * dt);
      if (D.fly) e.hover = Math.max(0, e.hover - 320 * dt);
      if (D.fade != null) e.alpha = Math.max(0, e.alpha - dt / D.dieT);
      this._place(e);
      if (e.dying <= 0) { e.dead = true; this.kills++; }
      this._anim(e, 'death', dt); return;
    }
    const dx = h.x - e.x, dz = h.z - e.z, dist = Math.hypot(dx, dz);
    if (!e.active) {
      if (dist < D.sight && !h.dead && (!e.yard || this.section === 'yard' || this.section === 'done') && Math.abs(h.y - e.gy) < 130) { e.active = true; e.state = 'chase'; e.stateT = 0; this.emit('wake', e); }
      this._place(e); this._anim(e, 'idle', dt); return;
    }
    if (e.kx || e.kz) {   // 맞고 밀림
      const k = 1 - Math.min(1, 7 * dt); e.kx *= k; e.kz *= k;
      if (Math.abs(e.kx) + Math.abs(e.kz) < 4) e.kx = e.kz = 0; else this._emove(e, e.kx * dt, e.kz * dt);
    }
    if (e.stagger > 0) {   // 튕겨져 비틀거림: 이 동안은 어디서 쳐도 다 들어간다
      e.stagger -= dt; e.solid = true;
      if (e.stagger <= 0) { e.stagger = 0; e.state = 'chase'; e.stateT = 0; e.cd = Math.max(e.cd, 0.5); }
      this._fade(e, D, dt); this._place(e); this._anim(e, 'stagger', dt); return;
    }
    if (e.stun > 0) { e.stun -= dt; this._fade(e, D, dt); this._place(e); this._anim(e, 'hurt', dt); return; }
    if (h.dead) { if (e.state === 'attack') this._cancelAttack(e, 1); this._fade(e, D, dt); this._place(e); this._anim(e, 'idle', dt); return; }
    e.stateT += dt;
    (AI[D.ai] ?? AI.melee)(this, e, dt, D);
    this._fade(e, D, dt);
    this._place(e);
  }
  _fade(e, D, dt) {
    if (D.fade == null) return;
    e.solidT = Math.max(0, e.solidT - (e.state === 'attack' ? 0 : dt));
    e.solid = e.solidT > 0 || e.revealT > 0 || e.stagger > 0;
    const to = e.solid ? 1 : e.state === 'attack' && e.atk ? 0.3 + 0.7 * clamp(e.stateT / (e.atk.windup * 0.45), 0, 1) : D.fade;
    e.alpha += (to - e.alpha) * Math.min(1, 7 * dt);
  }
  _place(e) {
    const D = e.def;
    if (D.fly || D.float) { const g = this.w.ground(e.x, e.z, e.gy + 200); if (Number.isFinite(g)) e.gy += (g - e.gy) * 0.2; e.y = e.gy + e.hover; }
    else e.gy = e.y;
    if (Math.abs(e.dirX) > 0.25) e.facing = sgn(e.dirX);
  }
  /** 보는 방향을 (dx,dz) 쪽으로 rate(rad/초)만큼 돌린다 */
  turnTo(e, dx, dz, rate, dt) {
    const d = Math.hypot(dx, dz); if (d < 1e-4) return;
    const cur = Math.atan2(e.dirZ, e.dirX); let da = Math.atan2(dz, dx) - cur;
    while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    const a = cur + clamp(da, -rate * dt, rate * dt);
    e.dirX = Math.cos(a); e.dirZ = Math.sin(a);
  }
  /** 한 번에 덤비는 수를 묶는다: 같은 부류(걷는 것 / 나는 것)에서 공격 중인 적이 max 보다 적을 때만 */
  mayAttack(e, max = 2) {
    if (e.def.elite || e.def.boss) return true;
    let n = 0;
    for (const o of this.enemies) if (o !== e && !o.dead && o.state === 'attack' && o.atk && o.atk.kind !== 'cast' && !!o.def.fly === !!e.def.fly) n++;
    return n < max;
  }
  startAttack(e, a) {
    e.state = 'attack'; e.stateT = 0; e.atk = a; e.phase = 'windup'; e.tele = 0; e.hitDone = false; e.swung = false;
    this._anim(e, a.kind === 'cast' ? 'cast' : 'attack', 0); e.animT = 0;
    this.emit('tell', e, a);
    if (a.kind === 'cast') this.emit('cast', e, 'charge');
  }
  /** 공격 진행: 예고(따라 돌기) → 판정(내딛기 · 맞히기 · 쏘기) → 틈 */
  runAttack(e, dt) {
    const a = e.atk, t = e.stateT, h = this.hero, w0 = a.windup, s0 = w0 + a.strike, end = s0 + a.recover;
    if (t < w0) {
      e.phase = 'windup'; e.tele = t / w0;
      if (a.track && t < w0 * 0.8) this.turnTo(e, h.x - e.x, h.z - e.z, a.track, dt);
      if (!e.swung && t >= w0 - 0.12) { e.swung = true; this.emit('enemySwing', e, a); this.hooks.sfx?.(a.kind === 'cast' ? 'cast' : 'swing'); }
    } else if (t < s0) {
      if (e.phase !== 'strike') {
        e.phase = 'strike'; e.tele = 1;
        if (!e.swung) { e.swung = true; this.emit('enemySwing', e, a); this.hooks.sfx?.(a.kind === 'cast' ? 'cast' : 'swing'); }
        if (a.shot) this._shoot(e, a);
        if (a.shake) this.emit('shake', a.shake);
        if (a.radius && a.radius.fwd) this.hooks.spark?.(e.x + e.dirX * a.radius.fwd, e.gy + 4, e.z + e.dirZ * a.radius.fwd, 'slam');
      }
      if (a.lunge) this.steer(e, e.dirX, e.dirZ, a.lunge / a.strike, dt, true);
      if (!e.hitDone && !a.shot && this._atkHits(e, a, h)) {
        const r = this.hurtHero(a.dmg, e.dirX, e.dirZ, { e, atk: a });
        if (r) e.hitDone = true;
        if (r === 'parry') return;   // 비틀거림으로 넘어갔다
      }
    } else if (t < end) { e.phase = 'recover'; e.tele = 0; }
    else { this._cancelAttack(e, rnd(a.cd[0], a.cd[1])); this._anim(e, 'idle', dt); return; }
    this._anim(e, a.kind === 'cast' ? 'cast' : 'attack', dt);
  }
  _atkHits(e, a, h) {
    if (h.dead) return false;
    if (a.radius) {
      const R = a.radius, cx = e.x + e.dirX * R.fwd, cz = e.z + e.dirZ * R.fwd;
      return Math.hypot(h.x - cx, h.z - cz) <= R.r + h.r && h.y <= e.y + R.y1 && h.y + h.h >= e.y + R.y0;
    }
    return this._inShape(e, a, h.x, h.z, h.r, h.y, h.y + h.h);
  }
  _shoot(e, a) {
    const S = a.shot, h = this.hero, sx = e.x + e.dirX * 22, sz = e.z + e.dirZ * 22, sy = e.y + e.h * S.y;
    let dx = h.x - sx, dz = h.z - sz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const tt = d / S.speed, vy = clamp((h.y + 48 - sy) / Math.max(0.2, tt), -120, 120);
    const s = { x: sx, y: sy, z: sz, vx: dx * S.speed, vy, vz: dz * S.speed, life: S.life, dead: false, t: 0, dmg: a.dmg, kind: S.kind, element: S.element, r: S.r, owner: e.id, friendly: false };
    this.shots.push(s);
    this.emit('cast', e, 'release'); this.emit('shot', s, 'spawn');
  }
  /**
   * 적 이동 + 간단한 돌아가기. (wx,wz) = 가고 싶은 방향(단위), speed = px/초. 한쪽이 막히면 옆으로 비켜 간다 —
   * 벽 모서리와 소품 사이에 끼어 영원히 서 있던 문제(requests.md envkit 3)의 답. straight = 돌아가기 없이(물러서기 · 내딛기)
   */
  steer(e, wx, wz, speed, dt, straight = false) {
    let ux = wx, uz = wz;
    if (e.detourT > 0 && !straight) {
      e.detourT -= dt; ux = e.detX; uz = e.detZ;
      if (e.detourT < 0.3) {   // 바로 가는 길이 뚫렸으면 돌아가기를 그만둔다
        const p = { x: e.x, z: e.z, y: e.y, r: e.r, h: e.h, def: e.def };
        this._emove(p, wx * 14, wz * 14 * 0.8);
        if (Math.hypot(p.x - e.x, p.z - e.z) > 10) { e.detourT = 0; ux = wx; uz = wz; }
      }
    }
    const dx = ux * speed * dt, dz = uz * speed * dt * 0.8, x0 = e.x, z0 = e.z;
    this._emove(e, dx, dz);
    const want = Math.hypot(dx, dz), got = Math.hypot(e.x - x0, e.z - z0);
    e.moved = got / Math.max(dt, 1e-4);
    if (want > 1e-3 && got < want * 0.4) {
      e.stuckT += dt;
      if (!straight && e.stuckT > 0.1) {
        const C = e.side > 0 ? [[-wz, wx], [wz, -wx]] : [[wz, -wx], [-wz, wx]]; let best = null;
        for (const [cx, cz] of C) {
          const p = { x: e.x, z: e.z, y: e.y, r: e.r, h: e.h, def: e.def };
          this._emove(p, cx * 28, cz * 28 * 0.8);
          const d = Math.hypot(p.x - e.x, p.z - e.z);
          if (!best || d > best.d + 4) best = { d, cx, cz };
        }
        if (best && best.d > 6) { e.detX = best.cx * 0.92 + wx * 0.08; e.detZ = best.cz * 0.92 + wz * 0.08; e.detourT = 0.55 + rnd(0, 0.2); e.stuckT = 0; if (best.cx !== C[0][0] || best.cz !== C[0][1]) e.side = -e.side; }
        else { e.side = -e.side; e.stuckT = 0; }
      }
    } else e.stuckT = 0;
    const st = e.def.stride;
    if (st && got > 0) {
      const g0 = e.gait, g1 = g0 + got / st;
      if (e.def.steps) { if (g1 >= 1) this.emit('step', 'R', e.moved, e); else if (g0 < 0.5 && g1 >= 0.5) this.emit('step', 'L', e.moved, e); }
      e.gait = g1 % 1;
    }
    return got;
  }
  /** 적 이동: 벽 + (걷는 적은) 낭떠러지로는 가지 않는다 */
  _emove(e, dx, dz) {
    const w = this.w, D = e.def, air = D && (D.fly || D.float);
    if (!air) {
      if (dx) { const g = w.ground(e.x + dx + sgn(dx) * 14, e.z, e.y + STEP_UP); if (!(g >= e.y - STEP_DOWN)) dx = 0; }
      if (dz) { const g = w.ground(e.x, e.z + dz + sgn(dz) * 14, e.y + STEP_UP); if (!(g >= e.y - STEP_DOWN)) dz = 0; }
    }
    w.move(e, dx, dz);
    if (!air) { const g = w.ground(e.x, e.z, e.y + STEP_UP); if (Number.isFinite(g)) e.y = g; }
  }
  _separate(dt) {
    const E = this.enemies, h = this.hero;
    for (let i = 0; i < E.length; i++) {
      const a = E[i]; if (a.dead || !a.active || a.state === 'dead') continue;
      for (let j = i + 1; j < E.length; j++) {
        const b = E[j]; if (b.dead || !b.active || b.state === 'dead' || !!a.def.fly !== !!b.def.fly) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, R = a.r + b.r + 8;
        if (d2 > R * R || d2 < 1e-4) continue;
        const d = Math.sqrt(d2), p = (R - d) * 3 * dt, wa = 1 - a.def.weight * 0.8, wb = 1 - b.def.weight * 0.8;
        this._emove(a, (-dx / d) * p * wa, (-dz / d) * p * wa); this._emove(b, (dx / d) * p * wb, (dz / d) * p * wb);
      }
      // 영웅과 겹치지 않게 (구르는 동안은 지나갈 수 있다 — 갑주의 등 뒤로 돌아가는 길)
      if (!h.dead && h.dashT <= 0 && h.onGround && !a.def.fly && a.solid && Math.abs(a.y - h.y) < 40) {
        const dx = h.x - a.x, dz = h.z - a.z, d2 = dx * dx + dz * dz, R = a.r + h.r;
        if (d2 < R * R && d2 > 1e-4) { const d = Math.sqrt(d2), p = Math.min(R - d, 240 * dt); this.w.move(h, (dx / d) * p * 0.7, (dz / d) * p * 0.7); this._emove(a, (-dx / d) * p * 0.3 * (1 - a.def.weight), (-dz / d) * p * 0.3 * (1 - a.def.weight)); }
      }
    }
  }
  _shots(dt) {
    const h = this.hero, W = this.W;
    for (const s of this.shots) {
      if (s.dead) continue;
      s.t += dt; s.life -= dt; s.x += s.vx * dt; s.y += (s.vy ?? 0) * dt; s.z += s.vz * dt;
      if (s.life <= 0) { s.dead = true; continue; }
      if (s.friendly) {   // 튕겨 돌려보낸 탄: 적이 맞는다
        for (const e of this.enemies) {
          if (e.dead || e.state === 'dead' || Math.hypot(s.x - e.x, s.z - e.z) > e.r + s.r || s.y < e.y - 8 || s.y > e.y + e.h + 8) continue;
          s.dead = true; this.hooks.spark?.(s.x, s.y, s.z, 'shot'); this._hitEnemy(e, REFLECT, { x: s.x - s.vx, z: s.z - s.vz }); break;
        }
      } else if (!h.dead && Math.hypot(s.x - h.x, s.z - h.z) < h.r + (s.r ?? 8) - 4 && s.y > h.y - 6 && s.y < h.y + h.h + 4) {
        const d = Math.hypot(s.vx, s.vz) || 1, r = this.hurtHero(s.dmg, s.vx / d, s.vz / d, { shot: s, e: this.byId(s.owner) });
        if (r === 'parry') {   // 쏜 적에게 되돌려 보낸다
          const o = this.byId(s.owner), sp = d * 1.7; let bx = -s.vx / d, bz = -s.vz / d;
          if (o && !o.dead) { const od = Math.hypot(o.x - s.x, o.z - s.z) || 1; bx = (o.x - s.x) / od; bz = (o.z - s.z) / od; s.vy = (o.y + o.h * 0.6 - s.y) / (od / sp); }
          s.vx = bx * sp; s.vz = bz * sp; s.friendly = true; s.life = 2.5; this.emit('shot', s, 'reflect');
        } else if (r) { s.dead = true; this.hooks.spark?.(s.x, s.y, s.z, 'shot'); this.emit('shot', s, r === 'guard' ? 'block' : 'hit'); continue; }
      }
      if (s.dead) continue;
      for (const b of W.boxes ?? []) {   // 벽 · 계단에 닿으면 사라진다
        if (b.solid && s.x > b.x0 && s.x < b.x1 && s.z > b.z0 && s.z < b.z1 && s.y > b.y0 && s.y < b.y1) { s.dead = true; this.hooks.spark?.(s.x, s.y, s.z, 'shot'); this.emit('shot', s, 'wall'); break; }
      }
    }
    if (this.shots.length > 24 || this.shots.some((s) => s.dead)) this.shots = this.shots.filter((s) => !s.dead);
  }
}
