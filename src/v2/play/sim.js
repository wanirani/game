// v2 play — 놀이 규칙 (영웅 · 적 · 탄 · 판정 · 사건). 화면을 모른다: 좌표 x · z · y 와 시간만 다룬다. docs/v2/PLAY_API.md
// 시범판 B 의 sim.js 에서 자랐다. 같은 모양(Sim · hero · enemies · shots · section · reset · teleport · hooks)을 지키고 알맹이를 바꿨다:
//   영웅 = 연타 3 (셋째는 넓게) · 점프 중 내려베기 · 구르기(짧은 무적) · 구른 직후 훑기 · 막기 / 튕겨내기 · 부드러운 락온
//   적   = 종류표(enemies.js)의 자료와 행동. 공격은 예고(windup) → 판정(strike) → 틈(recover), 판정은 보는 방향 기준 상자
//   사건 = hooks 로 내보낸다 (발소리 · 휘두름 · 닿음 · 튕겨냄 · 착지 · 구르기 …). 모든 사건은 hooks.event(name, …) 로도 한 번씩 간다
import { bindWorld, groundAtS, moveXZs, sectionOf, STEP_UP, STEP_DOWN } from './collide.js';
import { TUNE } from './tune.js';
import { MOVES, COMBO } from './moves.js';
import { AI, kindOf, kindId, rnd } from './enemies.js';

export { TUNE };
const sgn = (v) => (v < 0 ? -1 : 1);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = (x, z) => Math.sqrt(x * x + z * z);   // Math.hypot 은 부를 때마다 임시 배열을 만든다 (requests.md core-verify) — 규칙은 틱마다 수십 번 부른다
const RAD = Math.PI / 180;
const NOINP = Object.freeze({ mx: 0, mz: 0 });
/**
 * 객체의 칸 차림을 태어날 때 굳힌다: 숫자 칸은 모두 실수 칸으로, 비어 있는(null) 칸은 무엇이든 담는 칸으로.
 * 엔진(V8)은 칸에 처음으로 다른 종류의 값이 들어갈 때마다 객체의 "모양"을 바꾼다. 영웅 · 적처럼 칸이 백 개쯤인 객체가 놀이 도중에 모양을 수십 번 바꾸면
 * 그 객체를 읽는 모든 코드가 느린 일반 경로로 떨어지고, 그 경로는 실수 칸을 읽을 때마다 16 바이트짜리 숫자 상자를 만든다 (틱마다 수 KB 의 쓰레기 — tools/v2/play_alloc.mjs).
 * 만들자마자 한 번 굳혀 두면 모양이 끝까지 하나라 읽기 · 쓰기가 상자를 만들지 않는다.
 */
function settle(o) {
  for (const k in o) { const v = o[k]; if (typeof v === 'number') { o[k] = 0.5; o[k] = v; } else if (v === null || v === undefined) { o[k] = 1; o[k] = v; } }
  return o;
}
const REFLECT = Object.freeze({ id: 'reflect', kind: 'shot', str: 'H', weapon: 'arrow', kb: [200, 0], hitstop: 0.06, mv: 2, hit: [0, 0] });
const SAFE_OFF = [30, 0, -30, 0, 0, 30, 0, -30];
const TELE = { street: [260, 130], pillar: [640, 60], platform: [760, 190], pit: [1740, 100], corner: [2150, 150], alley: [2190, 380], stairs: [2190, 660], garden: [2190, 1250], yard: [2190, 1600] };   // 시범 구간(시범판 B 와 같은 자리)

export class Sim {
  /**
   * W: 세계 (collide.js 머리말). hooks: 사건을 받는 함수들 — 있는 것만 불린다 (docs/v2/PLAY_API.md §5).
   *   옛 이름: hit(e,dmg,mv,x,y,z,info) kill(e) heroHurt(dmg,pit) shake(px) sfx(name) spark(x,y,z,kind) number(x,y,z,text,color) done()
   *   새 이름: step swing attack parry guard guardUp land roll jump tell enemySwing cast shot lock wake whiff stagger + event(name, …)
   */
  constructor(W, hooks = {}) {
    this.W = W; this.hooks = hooks; this.w = bindWorld(W); this.deaths = 0;
    this.qx = 0.5; this.qz = 0.5; this.qy = 0.5; this.g = 0.5; this.ex = 0.5; this.ez = 0.5; this._sx = 0.5; this._sz = 0.5; this._sv = 0.5; this._tx = 0.5; this._tz = 0.5; this._tr = 0.5; this._hx = 0.5; this._hz = 0.5; this._sc = 0.5;   // 숫자를 주고받는 칸 (인자 · 반환값으로 실수를 넘기면 상자가 생긴다 — collide.js groundAtS)
    this._cg = typeof W.groundAt === 'function'; this._cm = typeof W.moveXZ === 'function'; this._cs = typeof W.sectionAt === 'function'; this._ra = 0.5;
    this.reset();
  }
  /** 땅 높이: this.qx, this.qz 아래 · this.qy 이하에서 가장 높은 걷는 면 → this.g */
  _gq() { if (this._cg) this.g = this.W.groundAt(this.qx, this.qz, this.qy); else groundAtS(this.W, this); }
  /** e 를 (this.qx, this.qz) 만큼 옮긴다 (벽에 막힌다) */
  _mq(e) { if (this._cm) this.W.moveXZ(e, this.qx, this.qz); else moveXZs(this.W, e, this); }
  emit(name, a, b, c, d, e, f, g) {
    const H = this.hooks, fn = H[name]; let r;
    if (fn) r = fn.call(H, a, b, c, d, e, f, g);
    if (H.event) H.event(name, a, b, c, d, e, f, g);
    return r;
  }
  reset() {
    const W = this.W, T = TUNE;
    this.time = 0; this._tick = 0; this.stop = 0; this.done = false; this.kills = 0; this._buf = { attack: false, dash: false, jump: false, lockNext: false, skill: false, bell: false };
    this._src = this._src ?? { e: null, atk: null, shot: null }; this._probe = this._probe ?? { x: 0, z: 0, y: 0, r: 0, h: 0, def: null };
    this.lights = []; this.hookPoints = (W.hookPoints ?? []).map((p, i) => ({ id: p.id ?? 'hook' + i, y: 0, ...p })); this.caller = this.caller ?? 'sera'; this._nid = 0;
    this.hero = {
      x: W.start.x, z: W.start.z, y: W.start.y, vx: 0, vz: 0, vy: 0, r: 14, h: 92, facing: 1, dirX: 1, dirZ: 0, onGround: true, coyote: 0,
      hp: T.heroHp, hpMax: T.heroHp, ifr: 0, hurtT: 0, dead: false, deadT: 0, flash: 0,
      dashT: 0, rollCd: 0, dashCd: 0, dvx: 0, dvz: 0, roll: { t: 0, dur: T.rollT, dx: 1, dz: 0, v0: 0 }, sweepWin: 0, sweepQ: false, dodged: false, heavyHurt: false,
      guard: false, guardT: 0, guardTap: 0, parryT: 0, parryCd: 0, parryOk: 0, blockT: 0,
      move: null, moveT: 0, combo: 0, hitIds: new Set(), assist: null, queued: 0, swung: false, stepDist: 0, airAtk: false, plungeLand: null, plungeEta: 1,
      lock: null, lockT: 0, lockHold: 0, lockX: 0, lockY: 0, lockZ: 0,
      act: null, actT: 0, actDone: false, actP: null, charging: false, charge: 0, chargeFullT: 0, atkHold: 0, whipLv: 1, pullT: 0, pullX: 0, pullZ: 0, whipOn: 0, whipX: 0, whipY: 0, whipZ: 0,
      reso: 0, resoMax: T.resoCells, callCd: 0, callCdMax: T.callCd, bellCd: 0, bellCdMax: T.bellCd, bellCharge: 0, bellDown: false, bellHoldT: 0, bellOk: true, knellId: null, hookId: null, skillMode: 'call', hookFX: 0, hookFY: 0, hookFZ: 0, hookTX: 0, hookTY: 0, hookTZ: 0, hookDur: 0.3,
      gait: 0, gaitMode: 'run', wasMoving: false, pushed: false, pivot: 0, pivotT: 0, pivotA: 0, pivotV: 0, wishX: 1, wishZ: 0, mx: 0, mz: 0, m: 0, ux: 0, uz: 0,
      anim: 'idle', animT: 0, t: 0, cut: false, landT: 0, landV: 0,
      safe: { x: W.start.x, z: W.start.z, y: W.start.y },
    };
    settle(this.hero); settle(this.hero.roll); settle(this.hero.safe); settle(this._probe);
    this.enemies = [];
    for (const s of W.spawns ?? []) this.addEnemy(s);
    this.shots = [];
    this.section = this.w.section(this.hero.x, this.hero.z)?.id ?? this.section ?? 'street';
  }
  /** 적 하나를 더한다 (스테이지 spawns 한 줄과 같은 모양: {kind, x, z, y?, yard?, active?}). 돌려주는 값 = 적 */
  addEnemy(s) {
    const D = kindOf(s.kind), g = this.w.ground(s.x, s.z, (s.y ?? 1e9) + STEP_UP), gy = Number.isFinite(s.y) ? s.y : Number.isFinite(g) ? g : 0, id = this._nid++;
    const e = {
      id, kind: s.kind, kid: kindId(s.kind), def: D, yard: !!s.yard, group: s.group, x: s.x, z: s.z, y: gy, gy, vx: 0, vz: 0, r: D.r, h: D.hpx,
      hp: D.hp, hpMax: D.hp, facing: -1, dirX: -1, dirZ: 0, state: 'idle', stateT: 0, phase: null, tele: 0, atk: null, cd: rnd(0.3, 1.2),
      flashT: 0, stun: 0, stagger: 0, dying: 0, dead: false, pullT: 0, pullX: 0, pullZ: 0, kneel: 0, knelled: false, bphase: 0, poiseHp: 0, poiseMax: 0, name: D.name,
      // (모든 칸을 여기서 한 번에 만든다: 적마다 칸 차림이 같아야 엔진이 숫자를 상자에 담지 않고 읽는다 — 틱마다 쓰레기를 만들지 않는 조건. 새 칸을 더할 때도 여기에)
      buried: false, sight: D.sight, wakeBy: null, staggerSide: 1, staggerK: 0, kneelT: 0, fled: false, fleeT: 0, fleeHold: false, lastAtk: null, sumCd: 3, songCd: 6, pulseT: 0, summoned: false, active: !!s.active, solid: true, alpha: 1, hover: D.hover ?? 0, solidT: 0, revealT: 0,
      anim: 'idle', animT: 0, t: rnd(0, 5), hitDone: false, swung: false, kx: 0, kz: 0, gait: rnd(0, 1), moved: 0,
      side: id % 2 ? 1 : -1, detourT: 0, detX: 0, detZ: 0, stuckT: 0, orb: rnd(0, 6.28), orbW: (id % 2 ? 1 : -1) * rnd(1.1, 1.7), orbR: D.orbit ? rnd(D.orbit[0], D.orbit[1]) : 0,
    };
    e.sight = s.sight ?? D.sight; e.wakeBy = s.wake ?? null;
    if (D.boss) { e.bphase = s.phase ?? 1; e.poiseMax = D.poiseMax ?? 0; }
    { const fx = s.face ? s.face[0] : this.W.start.x - s.x, fz = s.face ? s.face[1] : this.W.start.z - s.z, fl = Math.sqrt(fx * fx + fz * fz);   // 보는 쪽: 지역이 정한 쪽, 없으면 영웅이 들어오는 쪽
      if (fl > 1e-3) { e.dirX = fx / fl; e.dirZ = fz / fl; if (Math.abs(e.dirX) > 0.25) e.facing = e.dirX < 0 ? -1 : 1; } }
    if (D.fade != null) { e.solid = false; e.alpha = D.fade; }
    if (e.active) e.state = 'chase';
    else if ((s.rise ?? D.rise) && !D.fly && !D.floats) e.buried = true;   // 엎드려 누워 있다가 영웅이 다가오면 일어선다 (스테이지 spawns[].rise)
    e.y = e.gy + e.hover;
    settle(e);
    this.enemies.push(e);
    return e;
  }
  /** 잠든 적을 깨운다 (장면의 사건 · 무리 깨우기) */
  wake(e) {
    if (!e || e.dead || e.active) return;
    e.active = true; e.stateT = 0;
    if (e.buried) { e.buried = false; e.state = 'rise'; } else if (e.state === 'idle') e.state = 'chase';   // 누워 있던 것은 먼저 일어선다
    this.emit('wake', e); if (e.def.wakeSound) this.hooks.sound?.(e.def.wakeSound, e);
    const E = this.enemies;   // 곁에 있는 한패(같은 group, 또는 group 이 없으면 220 px 안)는 같이 알아챈다 — 벽 너머는 아니다
    for (let i = 0; i < E.length; i++) {
      const o = E[i]; if (o === e || o.dead || o.active || o.wakeBy === 'trigger' || o.yard !== e.yard) continue;
      const dx = o.x - e.x, dz = o.z - e.z, lim = e.group != null && o.group === e.group ? 420 : 220;
      if (dx * dx + dz * dz < lim * lim && (e.group != null ? o.group === e.group : o.group == null) && this.clearLine(e.x, e.z, o.x, o.z, e.gy + 56)) this.wake(o);
    }
  }
  /** 효과 · 소리 쪽이 정한 경직을 넣는다 (초) */
  hitStop(sec) { this.stop = Math.max(this.stop, sec); }
  /** 숨은 것을 드러낸다 (메아리 · 등불 자리): 반지름 r 안의 유령이 t 초 동안 또렷해져 맞는다 */
  reveal(x, z, r, t = 2.5) { for (const e of this.enemies) if (!e.dead && e.def.fade != null && hyp(e.x - x, e.z - z) < r) e.revealT = Math.max(e.revealT, t); }
  byId(id) { const E = this.enemies; for (let i = 0; i < E.length; i++) if (E[i].id === id) return E[i]; return null; }
  teleport(sec) {
    const s = this.W.sections?.find((q) => q.id === sec), P = this.W.tele?.[sec] ?? TELE[sec] ?? (s ? [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2] : null);
    if (!P) return false;
    const h = this.hero, g = this.w.ground(P[0], P[1]); if (!Number.isFinite(g)) return false;
    h.x = P[0]; h.z = P[1]; h.y = g; h.vx = h.vz = h.vy = 0; h.onGround = true; h.move = null; h.dashT = 0; h.guard = false; h.act = null; h.charging = false; h.safe.x = h.x; h.safe.z = h.z; h.safe.y = h.y;
    this.section = this.w.section(h.x, h.z)?.id ?? this.section;
    return true;
  }
  /** inp: { mx, mz(−1…1; + = 화면 안쪽), jump · attack · dash · lockNext (눌린 프레임), jumpHeld · guard (누르고 있음) } */
  update(dt, inp = NOINP) {
    if (this.stop > 0) {   // 경직 중에 누른 단추는 잃지 않고 기억해 둔다
      this.stop -= dt; const B = this._buf;
      if (inp.attack) B.attack = true; if (inp.dash) B.dash = true; if (inp.jump) B.jump = true; if (inp.lockNext) B.lockNext = true; if (inp.skill) B.skill = true; if (inp.bell) B.bell = true;
      return;
    }
    this.time += dt; this._tick = (this._tick + 1) | 0;
    this._hero(dt, inp);
    if (this.lights.length) this._lights(dt);
    { const E = this.enemies; for (let i = 0; i < E.length; i++) if (!E[i].dead) this._enemy(E[i], dt); }
    this._separate(dt);
    this._shots(dt);
    const sec = this._cs ? this.W.sectionAt(this.hero.x, this.hero.z) : sectionOf(this.W, this.hero);
    if (sec && !this.done) this.section = sec.id;
    if (!this.done) {   // 마당의 적이 모두 쓰러졌는가
      let yard = 0, left = 0; const E = this.enemies;
      for (let i = 0; i < E.length; i++) if (E[i].yard) { yard++; if (!E[i].dead) left++; }
      if (yard && !left) { this.done = true; this.section = 'done'; this.emit('done'); }
    }
  }
  // ───────────────────────── 영웅 ─────────────────────────
  _hero(dt, inp) {
    const h = this.hero, T = TUNE, w = this.w, B = this._buf;
    const pAttack = !!inp.attack || B.attack, pDash = !!inp.dash || B.dash, pJump = !!inp.jump || B.jump, pLock = !!inp.lockNext || B.lockNext, pSkill = !!inp.skill || B.skill, pBell = !!inp.bell || B.bell;
    B.attack = B.dash = B.jump = B.lockNext = B.skill = B.bell = false;
    h.callCd = Math.max(0, h.callCd - dt); h.bellCd = Math.max(0, h.bellCd - dt); h.whipOn = 0;
    h.t += dt; h.ifr = Math.max(0, h.ifr - dt); h.rollCd = Math.max(0, h.rollCd - dt); h.dashCd = h.rollCd; h.flash = Math.max(0, h.flash - dt * 5); h.landT = Math.max(0, h.landT - dt);
    h.parryT = Math.max(0, h.parryT - dt); h.parryCd = Math.max(0, h.parryCd - dt); h.parryOk = Math.max(0, h.parryOk - dt); h.blockT = Math.max(0, h.blockT - dt);
    h.sweepWin = Math.max(0, h.sweepWin - dt); h.guardTap = Math.max(0, h.guardTap - dt);
    if (h.dead) {
      h.deadT += dt; h.vx *= 0.9; h.vz *= 0.9;
      this._fall(h, dt);
      if (h.deadT > T.deadT) { this.deaths++; this.reset(); return; }
      this._anim(h, 'death', dt); return;
    }
    let mx = inp.mx || 0, mz = inp.mz || 0; const m0 = hyp(mx, mz);
    if (m0 > 1) { mx /= m0; mz /= m0; }
    const m = Math.min(1, m0), moving = m > 0.15;
    if (!moving) mx = mz = 0;
    const ux = moving ? mx / m : 0, uz = moving ? mz / m : 0;
    h.mx = mx; h.mz = mz; h.m = m; h.ux = ux; h.uz = uz;   // 이 틱의 스틱 (아래 함수들은 숫자를 인자로 받지 않고 여기서 읽는다 — 실수 인자는 상자를 만든다)
    this._lock(h, pLock, dt);
    let loco = false;
    if (moving) { h.wishX = ux; h.wishZ = uz; }
    if (h.hurtT > 0) {   // 맞아서 밀리는 중: 조작 불가
      h.hurtT -= dt; h.vx *= 1 - Math.min(1, 6 * dt); h.vz *= 1 - Math.min(1, 6 * dt); h.guard = false; h.queued = 0;
    } else if (this._tools(h, dt, inp, pSkill, pBell, pDash, moving)) { /* 도구(모아 휘감기 · 채찍 걸기 · 부름 · 종)가 이 틱의 영웅을 쥔다 */
    } else {
      const mv0 = h.move, pastHit = !mv0 || (mv0.kind === 'plunge' ? h.plungeLand != null : h.moveT >= mv0.hit[1]);
      // 구르기: 스틱을 민 채 dash, 또는 막는 중에 스틱을 민다. 공격은 판정이 끝난 뒤부터 구르기로 끊을 수 있다
      const wantRoll = (pDash && moving) || (h.guard && moving && !!inp.guard);   // 막는 중에 구르려면 단추를 누르고 있어야 한다 (톡 눌러 뗀 뒤 스틱을 밀면 구르지 않고 걷는다)
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
          if (h.pullT > 0) { const q = Math.min(1, dt / h.pullT) / dt; h.vx = (h.pullX - h.x) * q; h.vz = (h.pullZ - h.z) * q; h.pullT -= dt; h.ifr = Math.max(h.ifr, 0.08); }   // 큰 적에게 끌려간다 (휘감기)
          if (mv.kind === 'whip' && t >= mv.hit[0] - 0.05 && t <= mv.hit[1] + 0.1) { h.whipOn = 1; h.whipX = h.x + h.dirX * mv.box.f1; h.whipY = h.y + 60; h.whipZ = h.z + h.dirZ * mv.box.f1; }
        }
        h.moveT += dt;
        if (!h.swung && h.moveT >= mv.hit[0] - 0.085) { h.swung = true; this.emit('swing', h, mv); this.hooks.sfx?.(mv.sfx || 'slash'); }
        if (t >= mv.hit[0] && t <= mv.hit[1] && h.plungeLand == null) this._heroHit(h, mv);
        if (mv.kind === 'plunge') { if (h.plungeLand != null && h.moveT >= h.plungeLand + mv.recover) this._endMove(h); }
        else if (h.moveT >= mv.dur || (moving && h.moveT >= mv.free && h.queued <= 0)) this._endMove(h);
      } else if (h.guard || h.blockT > 0 || h.parryOk > T.parryT - 0.16) {   // 버티는 자세: 제자리에서 멈춘다
        const k = Math.min(1, 14 * dt); h.vx -= h.vx * k; h.vz -= h.vz * k;
      } else { this._locomote(h, moving, dt); loco = true; }
      // 점프 (공격은 끊을 수 있는 시각부터)
      if (pJump && (h.onGround || h.coyote > 0) && h.dashT <= 0 && (!h.move || (h.move.kind !== 'plunge' && h.moveT >= h.move.cancel))) {
        h.vy = T.jumpV; h.onGround = false; h.coyote = 0; h.cut = false; h.move = null; h.combo = 0; h.guard = false; h.guardTap = 0; h.parryOk = 0; h.blockT = 0; h.airAtk = false; inp.jumpUsed = true;   // parryOk · blockT: a jump right after a parry must not keep the parry pose in the air
        this.emit('jump', h); this.hooks.sfx?.('jump'); this.hooks.spark?.(h.x, h.y + 4, h.z, 'dust');
      }
      if (!h.onGround && !inp.jumpHeld && !h.cut && h.vy > T.jumpV * T.jumpCut && !h.move) { h.vy = T.jumpV * T.jumpCut; h.cut = true; }
    }
    if (!loco && h.pivot) h.pivot = 0;
    this.qx = h.vx * dt; this.qz = h.vz * dt; this._mq(h);
    const wasAir = !h.onGround, vy0 = h.vy;
    this._fall(h, dt, h.act === 'hook' ? 0 : h.dashT > 0 ? 0.25 : h.move && h.move.kind === 'plunge' ? h.move.fallG : 1);
    if (wasAir && h.onGround) {
      const heavy = vy0 < -900 || (h.move && h.move.kind === 'plunge');
      h.landT = T.landT; h.landV = -vy0; h.airAtk = false;
      if (h.move && h.move.kind === 'plunge') { h.plungeLand = h.moveT; h.plungeEta = 0; this._plungeImpact(h, h.move); }
      this.hooks.spark?.(h.x, h.y + 3, h.z, 'dust'); this.emit('land', -vy0, heavy, h); this.hooks.sfx?.('land');
    }
    if (h.move && h.move.kind === 'plunge' && !h.onGround) { const g = w.ground(h.x, h.z, h.y + STEP_UP); h.plungeEta = Number.isFinite(g) ? Math.max(0, (h.y - g) / Math.max(200, -h.vy)) : 1; }   // 땅에 닿기까지 남은 초 (칼이 닿는 순간에 맞춰 내려오게)
    // 구덩이
    if (h.y < T.pitY) {
      h.hp -= T.pitDmg; h.x = h.safe.x; h.z = h.safe.z; h.y = h.safe.y; h.vx = h.vz = h.vy = 0; h.onGround = true; h.move = null; h.dashT = 0; h.ifr = 1.2; h.flash = 1;
      this.emit('heroHurt', T.pitDmg, true); this.hooks.number?.(h.x, h.y + 100, h.z, '-' + T.pitDmg, '#ff7060');
      if (h.hp <= 0) this._die(h);
    } else if (h.onGround && h.dashT <= 0) {
      let ok = true;   // 안전한 자리 기억 (가장자리에서 조금 안쪽)
      for (let i = 0; i < 8; i += 2) { this.qx = h.x + SAFE_OFF[i]; this.qz = h.z + SAFE_OFF[i + 1]; this.qy = h.y + STEP_UP; this._gq(); if (!(this.g >= h.y - STEP_DOWN)) { ok = false; break; } }
      if (ok) { h.safe.x = h.x; h.safe.z = h.z; h.safe.y = h.y; }
    }
    // 걸음 주기: 발소리와 달리기 클립이 같이 쓴다
    // 걷기 / 달리기는 스틱을 민 정도로 정한다(속도가 0 을 지나는 반전 · 출발에서 걸음이 걷기 · 서기로 깜박이지 않게). 스틱을 놓으면 멈출 때까지 그 걸음 그대로
    const sp = hyp(h.vx, h.vz), free = !h.move && h.dashT <= 0 && h.hurtT <= 0 && !h.guard && h.blockT <= 0 && !h.act && !h.charging, push = moving && free;
    if (push) h.gaitMode = m * T.runX < T.walkBelow + 20 ? 'walk' : 'run';
    h.pushed = push;   // 이 틱에 스틱으로 걷고 달리는 중인가 (그림이 "방금 놓았다"를 알아 멈춰 서는 동작을 튼다)
    const gsp = push ? Math.max(sp, (h.gaitMode === 'walk' ? 40 : 96)) : sp, walking = h.onGround && free && !h.pivot && (push || sp > 24);   // 스틱을 민 동안은 걸음이 멎지 않는다 (벽에 대고 달려도 다리는 돈다)
    if (walking) {
      const g0 = h.gait, g1 = g0 + (gsp * dt) / (h.gaitMode === 'walk' ? T.strideWalk : T.strideRun);
      const gl = T.stepL?.[h.gaitMode] ?? 0.5;
      if (g1 >= 1) this.emit('step', 'R', sp, h); else if (g0 < gl && g1 >= gl) this.emit('step', 'L', sp, h);
      h.gait = g1 % 1;
    }
    this._anim(h, h.hurtT > 0 ? 'hurt' : h.act ? h.act : h.charging ? 'charge' : h.parryOk > 0 && !h.move && h.dashT <= 0 ? 'parry' : h.blockT > 0 && !h.move && h.dashT <= 0 ? 'block' : h.move ? 'attack' : h.dashT > 0 ? 'roll'
      : !h.onGround ? (h.vy > 0 ? 'jump' : 'fall') : h.guard ? 'guard' : h.landT > 0 && !push ? 'land' : h.pivot ? 'turn' : push || sp > 36 ? h.gaitMode : 'idle', dt);
  }
  // ───────────────────────── 도구: 모아 휘감기 · 솜씨(채찍 걸기 / 부름) · 종(메아리 / 길게) ─────────────────────────
  /**
   * 입력: attackHeld(길게 = 모아 휘감기) · skill(눌림 = 솜씨) · bell(눌림) + bellHeld(누르고 있음 — 장면이 주지 않으면 눌림 = 곧 메아리).
   * 영웅에 적는 값(HUD 가 읽는다): charge(0…1) · reso / resoMax(울림 눈금) · callCd / callCdMax · bellCd / bellCdMax · bellCharge(0…1 길게 누르는 중) ·
   *   skillMode('hook'｜'call') · hookId · bellOk(지금 종을 칠 수 있나) · knellId(조종을 받을 무릎 꿇은 보스 id｜null) · whipOn + whipX/Y/Z(채찍 끝 — 장면이 띠를 그린다)
   * 돌려주는 값 true = 이 틱은 도구가 영웅을 쥔다 (걷기 · 공격 · 막기 건너뜀)
   */
  _tools(h, dt, inp, pSkill, pBell, pDash, moving) {
    const T = TUNE, E = this.enemies, HP = this.hookPoints, ux = h.ux, uz = h.uz;
    let hk = null, hd = T.hookRange * T.hookRange, kn = null;
    for (let i = 0; i < HP.length; i++) { const p = HP[i]; if (p.off) continue; const dx = p.x - h.x, dz = p.z - h.z, d = dx * dx + dz * dz, lx = (p.to ? p.to[0] : p.x) - h.x, lz = (p.to ? p.to[1] : p.z) - h.z; if (d < hd && lx * lx + lz * lz > 1600 && Math.abs((p.y ?? 0) - h.y) < T.hookRise) { hd = d; hk = p; } }   // 이미 그 고리의 내릴 자리에 서 있으면 걸지 않는다
    for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.kneel > 0 && !e.dead && e.state !== 'dead') { const dx = e.x - h.x, dz = e.z - h.z; if (dx * dx + dz * dz < T.knellRange * T.knellRange) kn = e; } }
    h.hookId = hk ? hk.id : null; h.skillMode = hk ? 'hook' : 'call'; h.knellId = kn ? kn.id : null;
    const freeNow = h.onGround && h.dashT <= 0 && (!h.move || (h.move.kind !== 'plunge' && h.moveT >= h.move.hit[1]));
    h.bellOk = freeNow && h.bellCd <= 0 && !h.act && !h.charging;
    h.atkHold = inp.attackHeld ? h.atkHold + dt : 0;
    if (h.act) return this._act(h, dt, inp, kn);
    if (h.charging) {   // 모으는 중: 제자리에서 스틱 쪽으로 돌 수 있다. 놓으면 휘감기, 구르기로 끊을 수 있다
      if (pDash && moving) { h.charging = false; h.charge = 0; this.emit('charge', h, 'cancel', 0); return false; }
      const k = Math.min(1, 14 * dt); h.vx -= h.vx * k; h.vz -= h.vz * k;
      if (moving) { const cr = h.dirX * uz - h.dirZ * ux, ad = Math.atan2(Math.abs(cr), h.dirX * ux + h.dirZ * uz); this._ra = (cr < 0 ? -1 : 1) * Math.min(ad, T.turnRate * dt); this._rotS(h); }
      const c0 = h.charge; h.charge = Math.min(1, h.charge + dt / T.chargeT);
      if (c0 < 1 && h.charge >= 1) this.emit('charge', h, 'full', 1);
      if (h.charge >= 1) h.chargeFullT += dt;
      if (!inp.attackHeld || h.chargeFullT > T.chargeKeep) {
        const lv = h.charge; h.charging = false; h.charge = 0;
        if (lv >= T.chargeMin) { h.whipLv = lv; this.emit('charge', h, 'release', lv); this._startMove(h, MOVES.whip, ux, uz, false); }
        else this.emit('charge', h, 'cancel', lv);
      }
      return true;
    }
    // 종: 짧게 = 메아리, 길게 = 장면의 일(건넘) 또는 조종 — 길게 누르는 동안 영웅은 종 조각을 들고 선다
    if (pBell && h.bellOk && !h.bellDown) { if (inp.bellHeld === undefined) { this._startAct(h, 'echo'); return true; } h.bellDown = true; h.bellHoldT = 0; }
    if (h.bellDown) {
      if (inp.bellHeld) { h.bellHoldT += dt; if (h.bellHoldT >= T.bellTap && freeNow) { h.bellDown = false; this._startAct(h, 'ring'); return true; } }
      else { h.bellDown = false; if (h.bellOk) { this._startAct(h, 'echo'); return true; } }
    }
    // 솜씨: 빛나는 고리가 가까우면 채찍 걸기, 아니면 부름 (울림 한 칸)
    if (pSkill) {
      if (hk && freeNow) {
        const tx = hk.to ? hk.to[0] : hk.x, tz = hk.to ? hk.to[1] : hk.z, g = this.w.ground(tx, tz, (hk.y ?? 0) + 400), d = Math.sqrt((tx - h.x) * (tx - h.x) + (tz - h.z) * (tz - h.z));
        h.hookFX = h.x; h.hookFY = h.y; h.hookFZ = h.z; h.hookTX = tx; h.hookTZ = tz; h.hookTY = Number.isFinite(g) ? g : hk.y ?? h.y; h.hookDur = clamp(d / T.hookSpeed, 0.22, 0.55); h.actP = hk;
        this._face(h, hk.x - h.x, hk.z - h.z); this._startAct(h, 'hook'); this.emit('hook', h, hk, 'throw'); this.hooks.sfx?.('slash'); return true;
      }
      if (!hk && freeNow && h.reso >= 1 && h.callCd <= 0 && this.caller) { h.reso -= 1; h.callCd = h.callCdMax = T.callCd; this._startAct(h, 'call'); this.emit('call', h, this.caller, 'start'); return true; }
      this.emit('deny', h, 'skill', hk ? 'busy' : h.reso < 1 ? 'reso' : h.callCd > 0 ? 'cd' : 'busy');
    }
    // 공격을 길게: 연타의 판정이 끝난 뒤(또는 서서)부터 모으기 시작
    if (inp.attackHeld && h.atkHold >= T.chargeHold && h.onGround && h.dashT <= 0 && !h.guard && h.sweepWin <= 0 && (!h.move || (h.move.kind === 'combo' && h.moveT >= h.move.cancel))) {
      h.move = null; h.combo = 0; h.queued = 0; h.pivot = 0; h.charging = true; h.charge = 0; h.chargeFullT = 0; this.emit('charge', h, 'start', 0); return true;
    }
    return false;
  }
  _startAct(h, kind) { h.act = kind; h.actT = 0; h.actDone = false; h.move = null; h.combo = 0; h.queued = 0; h.guard = false; h.guardTap = 0; h.pivot = 0; h.bellCharge = 0; this.emit('act', h, kind); }
  _act(h, dt, inp, kn) {
    const T = TUNE, t0 = h.actT, t = (h.actT += dt), a = h.act;
    if (a !== 'hook') { const k = Math.min(1, 14 * dt); h.vx -= h.vx * k; h.vz -= h.vz * k; }
    if (a === 'echo') { if (t0 < T.echoAt && t >= T.echoAt) this._echo(h); if (t >= T.echoT) h.act = null; }
    else if (a === 'call') { if (t0 < T.callAt && t >= T.callAt) this._call(h); if (t >= T.callT) h.act = null; }
    else if (a === 'ring') {
      h.bellCharge = Math.min(1, t / T.ringT);
      if (!h.actDone && h.bellCharge >= 1) {   // 다 찼다: 무릎 꿇은 보스가 앞에 있으면 조종, 없으면 장면이 건넘을 정한다 (hooks.ringLong)
        h.actDone = true; h.bellCd = h.bellCdMax = T.bellCd; h.actT = 0;
        this.emit('ringLong', h, kn); this.hooks.sound?.('bell.toll', h); this.hooks.fx?.('holy.bell', h.x, h.y, h.z, h.dirX, h.dirZ, 1.4);
        if (kn) this.knell(kn);
      } else if (!h.actDone && !inp.bellHeld) this._startAct(h, 'echo');   // 다 차기 전에 놓으면 메아리
      else if (h.actDone && h.actT >= 0.5) { h.act = null; h.bellCharge = 0; }
    } else if (a === 'hook') {   // 던지기(hookThrow) → 걸림 → 고리 쪽으로 날아가 내려선다
      h.vx = h.vz = 0; h.whipOn = 1; h.whipX = h.actP.x; h.whipY = (h.actP.y ?? 0) + (h.actP.h ?? 150); h.whipZ = h.actP.z;
      if (t0 < T.hookThrow && t >= T.hookThrow) { this.emit('hook', h, h.actP, 'latch'); this.hooks.sfx?.('jump'); h.onGround = false; h.vy = 0; h.ifr = Math.max(h.ifr, h.hookDur); }
      if (t >= T.hookThrow) {
        const u = Math.min(1, (t - T.hookThrow) / h.hookDur), e = u * u * (3 - 2 * u), d = Math.sqrt((h.hookTX - h.hookFX) * (h.hookTX - h.hookFX) + (h.hookTZ - h.hookFZ) * (h.hookTZ - h.hookFZ));
        h.x = h.hookFX + (h.hookTX - h.hookFX) * e; h.z = h.hookFZ + (h.hookTZ - h.hookFZ) * e; h.y = h.hookFY + (h.hookTY - h.hookFY) * e + Math.min(110, d * 0.3) * 4 * u * (1 - u); h.vy = 0; h.onGround = false;
        if (u >= 1) { h.y = h.hookTY; h.onGround = true; h.act = null; h.landT = T.landT; h.safe.x = h.x; h.safe.z = h.z; h.safe.y = h.y; this.emit('hook', h, h.actP, 'land'); this.emit('land', 400, false, h); this.hooks.sfx?.('land'); this.hooks.spark?.(h.x, h.y + 3, h.z, 'dust'); }
      }
    } else h.act = null;
    return true;
  }
  /** 메아리(짧은 종): 숨은 것을 드러내고, 주문 · 노래를 끊는다. 보스는 종류표의 onBell 이 답한다 */
  _echo(h) {
    const T = TUNE, r = T.echoR, E = this.enemies; h.bellCd = h.bellCdMax = T.bellCd;
    this.reveal(h.x, h.z, r, T.echoReveal);
    for (let i = 0; i < E.length; i++) {
      const e = E[i]; if (e.dead || e.state === 'dead' || !e.active) continue;
      const dx = e.x - h.x, dz = e.z - h.z; if (dx * dx + dz * dz > r * r) continue;
      if (e.def.onBell) e.def.onBell(this, e, 'echo');
      else if (e.state === 'attack' && e.atk && e.atk.kind === 'cast' && e.phase === 'windup') { this._cancelAttack(e, 1.2); e.stun = Math.max(e.stun, 0.45); this.emit('silence', e); }
    }
    this.emit('bell', h, 'echo', r); this.hooks.fx?.('holy.bell', h.x, h.y, h.z, h.dirX, h.dirZ, 1); this.emit('shake', 3);
  }
  /** 부름(세라의 등불): 빛의 동그라미를 놓는다 — 안의 유령은 드러나 굳고, 다른 적은 비틀거린다. 보스는 종류표의 onCall 이 답한다 */
  _call(h) {
    const T = TUNE, le = h.lock != null ? this.byId(h.lock) : null, near = le && (le.x - h.x) * (le.x - h.x) + (le.z - h.z) * (le.z - h.z) < T.callAim * T.callAim;
    const L = { who: this.caller, x: near ? le.x : h.x + h.dirX * 80, z: near ? le.z : h.z + h.dirZ * 80, y: h.y, r: T.callR, t: T.callDur, dur: T.callDur }, E = this.enemies;
    this.lights.push(L);
    for (let i = 0; i < E.length; i++) {
      const e = E[i]; if (e.dead || e.state === 'dead' || !e.active) continue;
      const dx = e.x - L.x, dz = e.z - L.z; if (dx * dx + dz * dz > L.r * L.r) continue;
      if (e.def.onCall) e.def.onCall(this, e, L);
      else if (e.def.fade != null) { e.revealT = Math.max(e.revealT, L.dur); e.stun = Math.max(e.stun, 0.3); if (e.state === 'attack') this._cancelAttack(e, 1); }
      else if (!e.def.poise) this.staggerEnemy(e, 0.9); else e.stun = Math.max(e.stun, 0.35);
    }
    this.emit('call', h, L.who, 'cast', L); this.hooks.fx?.('holy.wave', L.x, L.y, L.z, h.dirX, h.dirZ, 1.2);
  }
  _lights(dt) {
    const Ls = this.lights, E = this.enemies; let n = 0;
    for (let j = 0; j < Ls.length; j++) {
      const L = Ls[j]; L.t -= dt;
      for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.dead || e.def.fade == null || e.state === 'dead') continue; const dx = e.x - L.x, dz = e.z - L.z; if (dx * dx + dz * dz < L.r * L.r) { e.revealT = Math.max(e.revealT, 0.3); e.stun = Math.max(e.stun, 0.12); } }   // 빛 안의 유령은 굳는다
      if (L.t > 0) Ls[n++] = L; else this.emit('call', this.hero, L.who, 'end', L);
    }
    Ls.length = n;
  }
  /** 조종: 무릎 꿇은 보스를 보낸다 (길게 친 종이 다 찼을 때 규칙이 스스로 부른다 — 장면이 직접 불러도 된다) */
  knell(e) {
    if (!e || e.dead || e.state === 'dead' || !(e.kneel > 0)) return false;
    e.hp = 0; e.knelled = true; this.emit('knell', e, this.hero); this.hooks.fx?.('holy.pillar', this.hero.x, this.hero.y, this.hero.z, 1, 0, 1.3, e.x, e.gy, e.z);
    this._kill(e); return true;
  }
  /** 부를 사냥꾼을 정한다 (null = 부를 수 없다). 첫 출시는 'sera'(등불) 하나 */
  setCaller(id) { this.caller = id; }
  /** 울림 눈금을 채운다 (칸 단위) */
  addReso(v) { const h = this.hero, a = Math.floor(h.reso + 1e-6); h.reso = clamp(h.reso + v, 0, h.resoMax); const b = Math.floor(h.reso + 1e-6); if (b !== a) this.emit('reso', h, b); }
  /**
   * 걷고 달리기. 속도는 늘 몸이 보는 쪽(dirX,dirZ)으로만 난다 — 스틱을 꺾어도 옆 · 뒤로 미끄러지지 않는다.
   *   작은 꺾음: 몸이 스틱 쪽으로 돌고(turnRate) 속도가 그 몸을 따라간다 (달리던 채로 굽어 돈다)
   *   큰 꺾음(pivotAt 넘게): 돌아서기 — 멈추며(brake) 제자리에서 돌고(pivotRate, 처음 정한 쪽으로 끝까지), pivotEnd 안으로 들어오면 새 쪽으로 박찬다
   * 밀림 · 막기 뒤에 남은 옆 속도는 sideDamp 로 스러진다. 공중에서는 예전처럼 속도가 스틱을 따르고 몸만 천천히 돈다
   */
  _locomote(h, moving, dt) {
    const T = TUNE, mx = h.mx, mz = h.mz, m = h.m, ux = h.ux, uz = h.uz;
    if (T.legacyTurn) {   // (비교용: 1차의 방식 — 속도는 스틱을 바로 따르고 방향은 그 자리에서 바뀐다. tools/v2/play_view.html?legacy=1)
      const k = Math.min(1, (h.onGround ? 16 : T.airAccel) * dt);
      h.vx += (mx * T.runX - h.vx) * k; h.vz += (mz * T.runZ - h.vz) * k; h.pivot = 0;
      if (moving) this._face(h, mx, mz);
      return;
    }
    if (!h.onGround) {
      const k = Math.min(1, T.airAccel * dt);
      h.vx += (mx * T.runX - h.vx) * k; h.vz += (mz * T.runZ - h.vz) * k; h.pivot = 0;
      if (moving) { const cr = h.dirX * uz - h.dirZ * ux, ad = Math.atan2(Math.abs(cr), h.dirX * ux + h.dirZ * uz); this._ra = (cr < 0 ? -1 : 1) * Math.min(ad, T.turnRate * dt); this._rotS(h); }
      return;
    }
    const nx = h.vx / T.runX, nz = h.vz / T.runZ; let s = nx * h.dirX + nz * h.dirZ, lx = nx - s * h.dirX, lz = nz - s * h.dirZ;   // 몸이 보는 쪽 성분 s (1 = 가장 빠름) + 나머지
    const lk = 1 - Math.min(1, T.sideDamp * dt); lx *= lk; lz *= lk; if (s < 0) s *= lk;
    let want = 0;
    if (moving) {
      const cr = h.dirX * uz - h.dirZ * ux, sg = cr < 0 ? -1 : 1, ad = Math.atan2(Math.abs(cr), h.dirX * ux + h.dirZ * uz);   // 몸과 스틱 사이 각 (0…π) · 도는 쪽
      if (!h.pivot && ad > T.pivotAt * RAD) { h.pivot = sg; h.pivotT = 0; h.pivotA = ad; h.pivotV = Math.sqrt(h.vx * h.vx + h.vz * h.vz); this.emit('pivot', h, ad); }
      if (h.pivot) {
        h.pivotT += dt;
        const rem = sg === h.pivot ? ad : ad > 2.2 ? Math.PI * 2 - ad : 0;   // 처음 정한 쪽으로 남은 각 (스틱이 정반대 근처에서 흔들려도 오락가락하지 않는다)
        if (rem < T.pivotEnd * RAD) { h.pivot = 0; h.gait = 0.86; }          // 박차는 발부터 다시 디딘다
        else { this._ra = h.pivot * Math.min(rem, T.pivotRate * dt); this._rotS(h); }
      }
      if (!h.pivot) {
        this._ra = sg * Math.min(ad, Math.max(ad * (1 - Math.exp(-dt * T.turnEase)), 0.02), T.turnRate * dt); this._rotS(h);
        const keep = T.turnKeep * RAD;
        want = m * (ad <= keep ? 1 : 1 - (1 - T.turnSlow) * Math.min(1, (ad - keep) / (T.pivotAt * RAD - keep)));
      }
    } else h.pivot = 0;
    s += (want - s) * Math.min(1, (h.pivot ? T.brake : T.accel) * dt);
    h.vx = (h.dirX * s + lx) * T.runX; h.vz = (h.dirZ * s + lz) * T.runZ;
  }
  /** 영웅의 보는 방향을 a(rad)만큼 돌린다 (+ = dirZ 쪽으로) */
  _rot(h, a) { this._ra = a; this._rotS(h); }
  _rotS(h) {
    const a = this._ra, c = Math.cos(a), sn = Math.sin(a), x = h.dirX * c - h.dirZ * sn, z = h.dirX * sn + h.dirZ * c, l = Math.sqrt(x * x + z * z) || 1;
    h.dirX = x / l; h.dirZ = z / l;
    if (Math.abs(h.dirX) > 0.25) h.facing = sgn(h.dirX);
  }
  _anim(o, a, dt) { if (o.anim !== a) { o.anim = a; o.animT = 0; } else o.animT += dt; }
  setAnim(o, a, dt) { this._anim(o, a, dt); }
  _fall(o, dt, gk = 1) {
    this.qx = o.x; this.qz = o.z; this.qy = o.y + STEP_UP; this._gq(); const g = this.g;
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
    const d = hyp(dx, dz); if (d < 1e-4) return;
    h.dirX = dx / d; h.dirZ = dz / d;
    if (Math.abs(h.dirX) > 0.25) h.facing = sgn(h.dirX);
  }
  _endMove(h) { h.move = null; h.combo = 0; h.plungeLand = null; }
  _startRoll(h, ux, uz) {
    const T = TUNE;
    { const R = h.roll; R.t = 0; R.dur = T.rollT; R.dx = ux; R.dz = uz; R.v0 = T.rollDist / (T.rollT * 0.675); }   // (한 객체를 다시 쓴다)
    h.dashT = T.rollT; h.rollCd = T.rollCd; h.dvx = ux * h.roll.v0; h.dvz = uz * h.roll.v0 * 0.82; h.ifr = Math.max(h.ifr, T.rollIfr);
    h.move = null; h.combo = 0; h.queued = 0; h.guard = false; h.guardTap = 0; h.parryOk = 0; h.blockT = 0; h.sweepQ = false; h.plungeLand = null;
    this._face(h, ux, uz); if (h.vy < 0) h.vy = 0;
    this.emit('roll', ux, uz, h); this.hooks.sfx?.('dash'); this.hooks.spark?.(h.x, h.y + 6, h.z, 'dust');
  }
  /** 락온: 가까운 적에게 저절로 걸리고(앞쪽을 조금 더 친다), lockNext 로 다음 적. 손으로 바꾼 뒤 4초는 저절로 바뀌지 않는다 */
  _lockOk(e, h, lim) { const dx = e.x - h.x, dz = e.z - h.z; return !e.dead && e.state !== 'dead' && e.active && Math.abs(e.gy - h.y) < 170 && dx * dx + dz * dz < lim * lim; }
  _lockScore(e, h) { const ex = e.x - h.x, ez = e.z - h.z, d = Math.sqrt(ex * ex + ez * ez) || 1; return (this._sc = d * (1.25 - 0.25 * ((ex * h.dirX + ez * h.dirZ) / d))); }   // (틱마다 부르는 쪽은 돌려준 값 대신 this._sc 를 읽는다)
  _lock(h, next, dt) {
    const T = TUNE, E = this.enemies; let cur = h.lock != null ? this.byId(h.lock) : null;
    if (cur && !this._lockOk(cur, h, T.lockKeep)) cur = null;
    if (next) {
      const C = E.filter((e) => this._lockOk(e, h, T.lockKeep)).sort((a, b) => this._lockScore(a, h) - this._lockScore(b, h));
      cur = C.length ? C[(C.indexOf(cur) + 1) % C.length] : null; h.lockHold = 4;
    } else if (cur && h.lockHold > 0) h.lockHold -= dt;
    else {
      let best = null, bs = 1e30;
      for (let i = 0; i < E.length; i++) { const e = E[i]; if (this._lockOk(e, h, T.lockRange)) { this._lockScore(e, h); const sc = this._sc; if (sc < bs) { bs = sc; best = e; } } }
      if (best) { let cs = 1e30; if (cur) { this._lockScore(cur, h); cs = this._sc; } if (!cur || bs < cs * 0.7) cur = best; }
    }
    const id = cur ? cur.id : null;
    if (id !== h.lock) { h.lock = id; h.lockT = 0; this.emit('lock', id, cur); } else h.lockT += dt;
    if (cur) { h.lockX = cur.x; h.lockY = cur.y + cur.h * 0.6; h.lockZ = cur.z; }   // 락온 대상의 자리 (그림이 고개를 돌려 본다 · 장면이 표식을 그린다)
  }
  /** 공격이 향할 적: 락온 대상이 맞는 방향이면 그것, 아니면 방향 안에서 가장 알맞은 적 */
  _aimTarget(h, fx, fz, stick) {
    const T = TUNE, lim = stick ? T.aimCone : 80;
    const fit = (e, cone, far) => {
      if (e.dead || e.state === 'dead' || !e.solid || e.y - h.y > 135 || h.y - e.y > 80) return -1;
      const ex = e.x - h.x, ez = e.z - h.z, d = hyp(ex, ez); if (d > far) return -1; if (d < 1) return 0;
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
      const ex = tgt.x - h.x, ez = tgt.z - h.z, d = hyp(ex, ez);
      if (d > 12) { fx = ex / d; fz = ez / d; }
      const reach = mv.box ? mv.box.f1 : mv.arc ? mv.arc.r : 90;
      sd = clamp(d - tgt.r - reach * 0.62, 0, TUNE.lungeMax);   // 대상이 판정 한가운데 오도록 내딛는다 (붙어 있으면 내딛지 않는다)
    }
    this._face(h, fx, fz);
    h.move = mv; h.moveT = 0; h.combo = mv.n ?? 0; h.hitIds.clear(); h.queued = 0; h.swung = false; h.assist = tgt; h.stepDist = sd; h.sweepWin = 0; h.parryOk = 0; h.blockT = 0; h.plungeLand = null;
    if (mv.kind === 'plunge') { h.airAtk = true; h.vy = Math.min(h.vy, mv.fallV); h.vx *= 0.4; h.vz *= 0.4; h.cut = true; }
    this.emit('attack', h, mv);
  }
  /** 보는 방향 기준 판정: 상자(box) 또는 부채꼴(arc) 안에 (x,z,반지름 r, 높이 y0…y1)이 드는가 */
  /** 같은 판정 — 대상(t: x, z, r, y, h 를 가진 것)을 객체로 받는다 (틱마다 부르는 길: 숫자 인자를 넘기지 않는다) */
  _inShapeO(o, mv, t) {
    const ex = t.x - o.x, ez = t.z - o.z, f = ex * o.dirX + ez * o.dirZ, l = Math.abs(ez * o.dirX - ex * o.dirZ), r = t.r, y0 = t.y, y1 = t.y + t.h;
    if (mv.box) { const b = mv.box; return !(f + r < b.f0 || f - r > b.f1 || l > b.side + r * 0.5 || y0 > o.y + b.y1 || y1 < o.y + b.y0); }
    const a = mv.arc, d = Math.sqrt(ex * ex + ez * ez);
    if (d - r > a.r || y0 > o.y + a.y1 || y1 < o.y + a.y0) return false;
    return d < r + 10 || Math.atan2(l, f) / RAD <= a.deg / 2;
  }
  _inShape(o, mv, x, z, r, y0, y1) {
    const ex = x - o.x, ez = z - o.z, f = ex * o.dirX + ez * o.dirZ, l = Math.abs(ez * o.dirX - ex * o.dirZ);
    if (mv.box) { const b = mv.box; return !(f + r < b.f0 || f - r > b.f1 || l > b.side + r * 0.5 || y0 > o.y + b.y1 || y1 < o.y + b.y0); }
    const a = mv.arc, d = hyp(ex, ez);
    if (d - r > a.r || y0 > o.y + a.y1 || y1 < o.y + a.y0) return false;
    return d < r + 10 || Math.atan2(l, f) / RAD <= a.deg / 2;
  }
  _heroHit(h, mv) {
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dead' || e.buried || h.hitIds.has(e.id)) continue;
      if (!this._inShapeO(h, mv, e)) continue;
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
      if (e.dead || e.state === 'dead' || e.buried || h.hitIds.has(e.id)) continue;
      if (hyp(e.x - cx, e.z - cz) > L.r + e.r || e.y > h.y + L.y1 || e.y + e.h < h.y + L.y0) continue;
      h.hitIds.add(e.id); this._hitEnemy(e, mv, h);
    }
    this.emit('shake', 6);
  }
  /** 적이 맞는다. src = 때린 쪽(영웅 또는 되돌아간 탄 — x,z 를 가진 것) */
  _hitEnemy(e, mv, src) {
    const D = e.def, T = TUNE;
    if (!e.solid) { this.hooks.spark?.(e.x, e.y + e.h * 0.6, e.z, 'wisp'); this.emit('whiff', e, mv); return false; }   // 흐린 유령은 베이지 않는다
    let ax = e.x - src.x, az = e.z - src.z; const ad = hyp(ax, az);
    if (ad > 1) { ax /= ad; az /= ad; } else { ax = src.dirX ?? 1; az = src.dirZ ?? 0; }
    const front = -(ax * e.dirX + az * e.dirZ);   // 1 = 때린 쪽이 적의 정면에 있다
    const byHero = src === this.hero, whip = mv.kind === 'whip' && byHero;
    let dmg = Math.round(T.dmgBase * mv.mv * rnd(0.9, 1.12) * (whip ? 0.7 + 0.6 * src.whipLv : 1)), blocked = false;
    if (D.armorFront && e.stagger <= 0 && front > Math.cos(D.armorFront.arc * RAD)) { blocked = true; dmg = Math.max(1, Math.round(dmg * D.armorFront.k)); }
    const back = front < -0.3;
    if (!blocked && (back || e.stagger > 0)) dmg = Math.round(dmg * 1.3);   // 등 뒤 · 비틀거리는 틈
    if (D.kneelAt != null && e.hp - dmg <= D.kneelAt * D.hp && !e.knelled) dmg = Math.max(0, e.hp - Math.ceil(D.kneelAt * D.hp));   // 조종으로만 보낼 수 있는 것: 체력이 바닥에서 멈춘다 (무릎 꿇음은 행동 함수가 건다)
    e.hp -= dmg; e.flashT = 0.13; if (!e.active) this.wake(e);
    const kill = e.hp <= 0;
    if (D.poiseMax) this.addPoise(e, dmg * (D.poiseHit ?? 0.4) * (whip ? 2.2 : mv.str === 'F' ? 1.5 : 1));
    if (byHero) this.addReso((mv.reso ?? (mv.str === 'F' ? 0.2 : mv.str === 'H' ? 0.16 : mv.str === 'L' ? 0.08 : 0.1)) * (whip ? 0.6 + 0.9 * src.whipLv : 1) * (blocked ? 0.4 : 1));
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
    if (T.ownHitstop) this.stop = Math.max(this.stop, r && typeof r.stop === 'number' ? Math.min(0.3, r.stop) : mv.hitstop * (blocked ? 1.5 : 1.25));   // hooks.hit 이 { stop } 을 돌려주면(feel.hit 의 결과 그대로) 그 경직을 쓴다
    if (kill) this._kill(e);
    else if (whip) {   // 휘감기 (갑주의 앞면이 막아도 채찍은 감긴다): 작은 적은 끌어오고 큰 적에게는 끌려간다
      const small = D.weight < 0.5 && !D.boss && !D.elite;
      if (small) { e.pullT = T.pullT; e.pullX = src.x + src.dirX * (src.r + e.r + 36); e.pullZ = src.z + src.dirZ * (src.r + e.r + 36); e.stun = Math.max(e.stun, 0.6); e.kx = e.kz = 0; if (e.state === 'attack' && !D.poise) this._cancelAttack(e, 0.6); }
      else if (!src.pullT || src.pullT <= 0) { src.pullT = T.pullT; src.pullX = e.x - ax * (e.r + src.r + 44); src.pullZ = e.z - az * (e.r + src.r + 44); }
      this.emit('pull', e, small ? 'in' : 'to', src);
    }
    return true;
  }
  _kill(e) {
    e.state = 'dead'; e.dying = e.def.dieT; e.phase = null; e.atk = null; e.tele = 0; e.stagger = 0; e.stun = 0; e.kx *= 1.4; e.kz *= 1.4; e.solid = true;
    this.emit('kill', e); if (e.def.boss) this.emit('bossDown', e, !!e.knelled);
  }
  _cancelAttack(e, cd = 0.5) { e.state = 'chase'; e.stateT = 0; e.phase = null; e.atk = null; e.tele = 0; e.cd = Math.max(e.cd, cd); }
  /**
   * 영웅이 맞는다. src: { e(때린 적), atk(공격 한 줄), shot(탄) }. 돌려주는 값: false(무적 — 빗나감) | 'parry' | 'guard' | 'hurt'
   * 옛 호출(hurtHero(dmg, dirX, dirZ))도 그대로 된다.
   */
  hurtHero(dmg, dirX, dirZ = 0, src = {}) { this._hx = dirX; this._hz = dirZ; return this._hurt(dmg, src); }
  /** 같은 것 — 때린 방향을 this._hx, this._hz 로 받는다 (규칙 안에서 틱마다 부르는 길) */
  _hurt(dmg, src) {
    const h = this.hero, T = TUNE, atk = src.atk, from = src.shot ?? src.e, dirX = this._hx, dirZ = this._hz;
    if (h.dead) return false;
    if (h.ifr > 0) { if (h.dashT > 0 && !h.dodged) { h.dodged = true; this.emit('dodge', h, src); } return false; }
    h.dodged = false;
    let ax = -dirX, az = -dirZ;   // 영웅에서 때린 쪽으로
    if (from) { const d = hyp(from.x - h.x, from.z - h.z); if (d > 1) { ax = (from.x - h.x) / d; az = (from.z - h.z) / d; } }
    const facingIt = ax * h.dirX + az * h.dirZ > Math.cos(T.guardArc * RAD);
    if (h.guard && facingIt) {
      const px = h.x + ax * 26, py = h.y + 62, pz = h.z + az * 26;
      if (h.parryT > 0 && (!atk || atk.parry !== false)) {   // 튕겨내기
        h.parryOk = T.parryT; h.parryT = 0; h.ifr = Math.max(h.ifr, 0.3); h.blockT = 0; this._face(h, ax, az); this.addReso(T.resoParry);   // 딱 맞춰 튕기면 종 조각이 운다
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
        this.emit('guard', px, py, pz, chip, src); this.hooks.sfx?.('guard'); this.hooks.spark?.(px, py, pz, 'guard');   // 장면은 sfx('guard') 로 막기 소리 · 불꽃을 낸다
        if (h.hp <= 0) this._die(h);
        return 'guard';
      }
      h.guard = false; h.guardTap = 0;   // 막을 수 없는 공격: 그대로 맞는다
    }
    const heavy = !!atk && (atk.str === 'H' || atk.str === 'F' || !!atk.stunHero), kb = (atk?.knock ?? 240);
    h.act = null; h.charging = false; h.charge = 0; h.bellCharge = 0; h.bellDown = false; h.pullT = 0; if (!h.onGround && h.vy === 0) h.vy = -1;
    h.hp -= dmg; h.ifr = T.hurtIfr; h.hurtT = heavy ? T.hurtT * 1.5 : T.hurtT; h.vx = dirX * kb; h.vz = dirZ * kb * 0.67; h.move = null; h.combo = 0; h.dashT = 0; h.guard = false; h.guardTap = 0; h.flash = 1; h.plungeLand = null; h.heavyHurt = heavy;
    if (atk && atk.stunHero) h.hurtT = Math.max(h.hurtT, atk.stunHero);   // 비명에 귀를 막고 굳는다
    this.stop = Math.max(this.stop, 0.07);
    this.emit('heroHurt', dmg, false, src); this.hooks.number?.(h.x, h.y + 100, h.z, '-' + dmg, '#ff7060');
    if (h.hp <= 0) this._die(h);
    return 'hurt';
  }
  _die(h) { h.hp = 0; h.dead = true; h.deadT = 0; h.move = null; h.guard = false; h.dashT = 0; h.act = null; h.charging = false; h.charge = 0; this.emit('heroDie', h); this.hooks.sfx?.('die'); }
  /** 적을 비틀거리게 한다 (튕겨냄 · 종소리). 박쥐처럼 작은 것은 그대로 떨어진다 */
  staggerEnemy(e, t = 1.2, force = false) {
    if (e.dead || e.state === 'dead') return;
    if (e.def.poiseMax && !force) { this.addPoise(e, e.def.poiseParry ?? 35); return; }   // 보스는 한 번에 비틀거리지 않는다 — 눈금이 찬다
    if (e.def.fly) { e.hp = 0; this._kill(e); return; }
    e.stagger = t; e.state = 'stagger'; e.stateT = 0; e.phase = null; e.atk = null; e.tele = 0; e.stun = 0; e.solid = true; e.staggerSide = e.side;
    e.kx = -e.dirX * 120 * (1 - e.def.weight); e.kz = -e.dirZ * 100 * (1 - e.def.weight);
    this.emit('stagger', e, t);
  }
  // ───────────────────────── 보스 ─────────────────────────
  /** 비틀거림 눈금을 채운다. 다 차면 크게 비틀거린다 (e.staggerK 0…1 — HUD 의 boss.stagger) */
  addPoise(e, v) {
    const D = e.def; if (!D.poiseMax || e.dead || e.state === 'dead' || e.stagger > 0 || e.kneel > 0 || e.fled) return;
    e.poiseHp = Math.min(D.poiseMax, e.poiseHp + v); e.staggerK = e.poiseHp / D.poiseMax;
    if (e.poiseHp >= D.poiseMax) { e.poiseHp = 0; this.staggerEnemy(e, D.staggerT ?? 2.4, true); this.emit('bossStagger', e); }
  }
  /** 종(메아리)이 보스에게 닿았다: 비명의 예고 · 배웅가를 끊고 곧 비틀거리게 한다. 그 밖에는 눈금이 조금 찬다 */
  bossBell(e) {
    const a = e.atk;
    if (e.state === 'attack' && a && a.bell && (e.phase === 'windup' || a.pulse)) { this._cancelAttack(e, 1); this.emit('silence', e, a); this.addPoise(e, e.def.poiseMax); }
    else this.addPoise(e, e.def.poiseBell ?? 10);
  }
  /** 달아났던 보스가 돌아온다 (장면이 그 밤에서 몰아낸 뒤 부른다). o.hp 를 주면 그 체력으로 */
  bossReturn(e, o) {
    if (!e || !e.fled || e.dead) return false;
    e.fled = false; e.solid = true; e.cd = 1.0; if (o && o.hp != null) e.hp = o.hp; if (o && o.x != null) { e.x = o.x; e.z = o.z; }
    this.emit('bossReturn', e); return true;
  }
  /** HUD 의 보스 막대가 읽는 값 (한 객체를 다시 쓴다). 보스가 없거나 아직 깨어나지 않았으면 null */
  bossState() {
    const E = this.enemies; let b = null;
    for (let i = 0; i < E.length; i++) if (E[i].def.boss && !E[i].dead && E[i].active) { b = E[i]; break; }
    if (!b) return null;
    const o = (this._boss ??= { id: 0, name: '', hp: 0, hpMax: 1, stagger: 0, phase: 1, kneel: false, fled: false, staggered: false, sub: '' });
    o.id = b.id; o.name = b.def.name; o.hp = Math.max(0, b.hp); o.hpMax = b.hpMax; o.stagger = b.kneel > 0 ? 1 : b.staggerK ?? 0; o.phase = b.bphase; o.kneel = b.kneel > 0; o.fled = !!b.fled; o.staggered = b.stagger > 0; o.sub = b.atk && b.atk.label ? b.atk.label : '';
    return o;
  }
  countKind(kid) { const E = this.enemies; let n = 0; for (let i = 0; i < E.length; i++) if (!E[i].dead && E[i].state !== 'dead' && E[i].kid === kid) n++; return n; }
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
    const dx = h.x - e.x, dz = h.z - e.z, dist = hyp(dx, dz);
    if (!e.active) {
      if (!h.dead && e.wakeBy !== 'trigger' && (!e.yard || this.section === 'yard' || this.section === 'done') && Math.abs(h.y - e.gy) < 130 && this._sees(e, h, dist, D)) this.wake(e);
      if (!e.active) { this._place(e); this._anim(e, e.buried ? 'buried' : 'idle', dt); return; }
    }
    if (e.state === 'rise') {   // 땅에서 일어서는 중 (맞을 수는 있다)
      e.stateT += dt; if (e.stun > 0) e.stun -= dt; e.kx = e.kz = 0;   // 일어서는 동안은 밀리지 않는다
      if (e.stateT >= (D.riseT ?? 1.25)) { e.state = 'chase'; e.stateT = 0; e.cd = Math.max(e.cd, 0.35); }
      this._place(e); this._anim(e, 'rise', dt); return;
    }
    if (e.pullT > 0) { const k = Math.min(1, dt / e.pullT); this._emove(e, (e.pullX - e.x) * k, (e.pullZ - e.z) * k); e.pullT -= dt; e.kx = e.kz = 0; }   // 휘감겨 끌려온다
    if (e.kx || e.kz) {   // 맞고 밀림
      const k = 1 - Math.min(1, 7 * dt); e.kx *= k; e.kz *= k;
      if (Math.abs(e.kx) + Math.abs(e.kz) < 4) e.kx = e.kz = 0; else { this.ex = e.kx * dt; this.ez = e.kz * dt; this._emq(e); }
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
  /**
   * 잠든 적이 영웅을 알아채는가: 앞쪽(±sightArc) 은 sight 거리까지 보고, 등 뒤 · 옆은 near 거리 안에서만 느낀다. 벽(단단한 상자) 너머는 보지 못한다.
   * 지역이 달리 정할 수 있다: spawns[].sight(거리) · spawns[].wake = 'trigger'(사건 · 맞았을 때만 깬다) · spawns[].face([dx,dz] 보는 쪽)
   */
  _sees(e, h, dist, D) {
    const sight = e.buried ? Math.min(e.sight, D.riseAt ?? 230) : e.sight;
    if (dist > sight) return false;
    if (dist > (D.senseNear ?? 150) && !e.buried && (h.x - e.x) * e.dirX + (h.z - e.z) * e.dirZ < dist * Math.cos((D.sightArc ?? 105) * RAD)) return false;
    if (((this._tick + e.id) & 3) !== 0) return false;   // 벽 검사는 네 틱에 한 번
    return this.clearLine(e.x, e.z, h.x, h.z, e.gy + 56);
  }
  /** (x0,z0) → (x1,z1) 사이에 높이 y 를 가리는 단단한 상자가 없는가 */
  clearLine(x0, z0, x1, z1, y) {
    const B = this.W.boxes; if (!B) return true;
    const dx = x1 - x0, dz = z1 - z0;
    for (let i = 0; i < B.length; i++) {
      const b = B[i]; if (!b.solid || b.y1 <= y || b.y0 >= y) continue;
      let t0 = 0, t1 = 1;
      if (dx > -1e-9 && dx < 1e-9) { if (x0 <= b.x0 || x0 >= b.x1) continue; }
      else { let a = (b.x0 - x0) / dx, c = (b.x1 - x0) / dx; if (a > c) { const q = a; a = c; c = q; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 >= t1) continue; }
      if (dz > -1e-9 && dz < 1e-9) { if (z0 <= b.z0 || z0 >= b.z1) continue; }
      else { let a = (b.z0 - z0) / dz, c = (b.z1 - z0) / dz; if (a > c) { const q = a; a = c; c = q; } if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 >= t1) continue; }
      return false;
    }
    return true;
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
    if (D.fly || D.floats) { this.qx = e.x; this.qz = e.z; this.qy = e.gy + 200; this._gq(); const g = this.g; if (g > -1e9) e.gy += (g - e.gy) * 0.2; e.y = e.gy + e.hover; }
    else e.gy = e.y;
    if (Math.abs(e.dirX) > 0.25) e.facing = sgn(e.dirX);
  }
  /** 보는 방향을 (dx,dz) 쪽으로 rate(rad/초)만큼 돌린다 */
  turnTo(e, dx, dz, rate, dt) { this._tx = dx; this._tz = dz; this._tr = rate; this._turnS(e, dt); }
  _turnS(e, dt) {
    const dx = this._tx, dz = this._tz, lim = this._tr * dt; if (dx * dx + dz * dz < 1e-8) return;
    const cur = Math.atan2(e.dirZ, e.dirX); let da = Math.atan2(dz, dx) - cur;
    while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    const a = cur + (da > lim ? lim : da < -lim ? -lim : da);
    e.dirX = Math.cos(a); e.dirZ = Math.sin(a);
  }
  /** 영웅 쪽으로 종류의 빠르기(def.turn)만큼 돈다 — turnTo(e, hero − e, D.turn, dt) 와 같다 (숫자 인자를 넘기지 않는 판) */
  faceHero(e, dt) {
    const h = this.hero, dx = h.x - e.x, dz = h.z - e.z; if (dx * dx + dz * dz < 1e-8) return;
    const cur = Math.atan2(e.dirZ, e.dirX), lim = e.def.turn * dt; let da = Math.atan2(dz, dx) - cur;
    while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    const a = cur + (da > lim ? lim : da < -lim ? -lim : da);
    e.dirX = Math.cos(a); e.dirZ = Math.sin(a);
  }
  /**
   * 영웅을 기준으로 걷는다: f = 영웅 쪽(+1) · 반대쪽(−1), s = 옆(±1 — e.side), k = 종류 빠르기의 몇 배. steer(e, …방향…, D.speed × k, dt, straight) 와 같다
   * (방향 · 빠르기를 숫자 인자로 넘기지 않아 상자가 생기지 않는다; f, s, k 는 상수로 준다)
   */
  steerHero(e, f, s, k, dt, straight) {
    const h = this.hero, dx = h.x - e.x, dz = h.z - e.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    this._sx = (dx / d) * f - (dz / d) * s; this._sz = (dz / d) * f + (dx / d) * s; this._sv = e.def.speed * k;
    return this._steer(e, dt, straight);
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
    if (a.sound) this.hooks.sound?.(a.sound, e);
    if (a.kind === 'cast') this.emit('cast', e, 'charge');
  }
  /** 공격 진행: 예고(따라 돌기) → 판정(내딛기 · 맞히기 · 쏘기) → 틈 */
  runAttack(e, dt) {
    const a = e.atk, t = e.stateT, h = this.hero, w0 = a.windup, s0 = w0 + a.strike, end = s0 + a.recover;
    if (t < w0) {
      e.phase = 'windup'; e.tele = t / w0;
      if (a.track && t < w0 * 0.8) { this._tx = h.x - e.x; this._tz = h.z - e.z; this._tr = a.track; this._turnS(e, dt); }
      if (!e.swung && t >= w0 - 0.12) { e.swung = true; this.emit('enemySwing', e, a); this.hooks.sfx?.(a.kind === 'cast' ? 'cast' : 'swing'); }
    } else if (t < s0) {
      if (e.phase !== 'strike') {
        e.phase = 'strike'; e.tele = 1;
        if (!e.swung) { e.swung = true; this.emit('enemySwing', e, a); this.hooks.sfx?.(a.kind === 'cast' ? 'cast' : 'swing'); }
        if (a.shot) this._shoot(e, a);
        if (a.shake) this.emit('shake', a.shake);
        if (a.fx) this.hooks.fx?.(a.fx, e.x, e.gy, e.z, e.dirX, e.dirZ, 1.2);
        if (a.summon) { const S = a.summon; for (let i = 0; i < S.n; i++) { const an = e.t * 1.7 + (i * 6.2832) / S.n, g = this.addEnemy({ kind: S.kind, x: e.x + Math.cos(an) * S.r, z: e.z + Math.sin(an) * S.r * 0.8, active: true }); g.cd = 1.2 + i * 0.6; g.summoned = true; this.emit('summon', e, g); } }
        e.pulseT = 0;
        if (a.radius && a.radius.fwd) this.hooks.spark?.(e.x + e.dirX * a.radius.fwd, e.gy + 4, e.z + e.dirZ * a.radius.fwd, 'slam');
      }
      if (a.lunge) { this._sx = e.dirX; this._sz = e.dirZ; this._sv = a.lunge / a.strike; this._steer(e, dt, true); }
      if (a.pulse) {   // 이어지는 노래: every 초마다 반지름 안의 영웅을 깎고 울림을 빼앗는다
        e.pulseT -= dt;
        if (e.pulseT <= 0) { e.pulseT += a.pulse.every; this.emit('pulse', e, a); const px = h.x - e.x, pz = h.z - e.z; if (!h.dead && px * px + pz * pz < a.pulse.r * a.pulse.r) { const SR = this._src; SR.e = e; SR.atk = a; SR.shot = null; this._hx = e.dirX; this._hz = e.dirZ; const r = this._hurt(a.dmg, SR); if (r === 'hurt' && a.pulse.reso) this.addReso(-a.pulse.reso); } }
      } else if (!e.hitDone && !a.shot && !a.summon && this._atkHits(e, a, h)) {
        const SR = this._src; SR.e = e; SR.atk = a; SR.shot = null;
        this._hx = e.dirX; this._hz = e.dirZ; const r = this._hurt(a.dmg, SR);
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
      return hyp(h.x - cx, h.z - cz) <= R.r + h.r && h.y <= e.y + R.y1 && h.y + h.h >= e.y + R.y0;
    }
    return this._inShapeO(e, a, h);
  }
  _shoot(e, a) {
    const S = a.shot, h = this.hero, sx = e.x + e.dirX * 22, sz = e.z + e.dirZ * 22, sy = e.y + e.h * S.y;
    let dx = h.x - sx, dz = h.z - sz; const d = Math.sqrt(dx * dx + dz * dz) || 1; dx /= d; dz /= d;
    if (S.fan) { dx = e.dirX; dz = e.dirZ; }   // 부채로 쏘는 것은 예고가 가리킨 쪽(보는 쪽)으로 — 표시와 탄이 어긋나지 않게
    const tt = d / S.speed, vy = clamp((h.y + 48 - sy) / Math.max(0.2, tt), -120, 120), n = S.fan ?? 1;
    this.emit('cast', e, 'release');
    for (let i = 0; i < n; i++) {
      const an = n > 1 ? (i - (n - 1) / 2) * S.spread * RAD : 0, c = Math.cos(an), sn = Math.sin(an);
      const s = { x: sx, y: sy, z: sz, vx: (dx * c - dz * sn) * S.speed, vy, vz: (dx * sn + dz * c) * S.speed, life: S.life, dead: false, t: 0, dmg: a.dmg, kind: S.kind, element: S.element, r: S.r, owner: e.id, friendly: false };
      this.shots.push(settle(s)); this.emit('shot', s, 'spawn');
    }
  }
  /**
   * 적 이동 + 간단한 돌아가기. (wx,wz) = 가고 싶은 방향(단위), speed = px/초. 한쪽이 막히면 옆으로 비켜 간다 —
   * 벽 모서리와 소품 사이에 끼어 영원히 서 있던 문제(requests.md envkit 3)의 답. straight = 돌아가기 없이(물러서기 · 내딛기)
   */
  steer(e, wx, wz, speed, dt, straight = false) { this._sx = wx; this._sz = wz; this._sv = speed; return this._steer(e, dt, straight); }
  _steer(e, dt, straight) {
    const wx = this._sx, wz = this._sz, speed = this._sv; let ux = wx, uz = wz;
    if (e.detourT > 0 && !straight) {
      e.detourT -= dt; ux = e.detX; uz = e.detZ;
      if (e.detourT < 0.3) {   // 바로 가는 길이 뚫렸으면 돌아가기를 그만둔다
        const p = this._probe; p.x = e.x; p.z = e.z; p.y = e.y; p.r = e.r; p.h = e.h; p.def = e.def;
        this.ex = wx * 14; this.ez = wz * 14 * 0.8; this._emq(p);
        if (hyp(p.x - e.x, p.z - e.z) > 10) { e.detourT = 0; ux = wx; uz = wz; }
      }
    }
    const dx = ux * speed * dt, dz = uz * speed * dt * 0.8, x0 = e.x, z0 = e.z;
    this.ex = dx; this.ez = dz; this._emq(e);
    const want = hyp(dx, dz), got = hyp(e.x - x0, e.z - z0);
    e.moved = got / Math.max(dt, 1e-4);
    if (want > 1e-3 && got < want * 0.4) {
      e.stuckT += dt;
      if (!straight && e.stuckT > 0.1) {
        const s0 = e.side > 0 ? 1 : -1, p = this._probe; let bd = -1, bk = 0;   // 두 옆쪽(먼저 e.side 쪽)을 28 px 씩 짚어 보고 더 트인 쪽으로
        for (let k = 0; k < 2; k++) {
          const q = k === 0 ? s0 : -s0, cx = -wz * q, cz = wx * q;
          p.x = e.x; p.z = e.z; p.y = e.y; p.r = e.r; p.h = e.h; p.def = e.def;
          this.ex = cx * 28; this.ez = cz * 28 * 0.8; this._emq(p);
          const d = hyp(p.x - e.x, p.z - e.z);
          if (bd < 0 || d > bd + 4) { bd = d; bk = k; }
        }
        if (bd > 6) { const q = bk === 0 ? s0 : -s0; e.detX = -wz * q * 0.92 + wx * 0.08; e.detZ = wx * q * 0.92 + wz * 0.08; e.detourT = 0.55 + rnd(0, 0.2); e.stuckT = 0; if (bk !== 0) e.side = -e.side; }
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
  _emove(e, dx, dz) { this.ex = dx; this.ez = dz; this._emq(e); }
  /** 같은 것 — 옮길 거리를 this.ex, this.ez 로 받는다 (틱마다 부르는 길은 이쪽: 숫자 상자를 만들지 않는다) */
  _emq(e) {
    const D = e.def, air = D && (D.fly || D.floats); let dx = this.ex, dz = this.ez;
    if (!air) {
      if (dx !== 0) { this.qx = e.x + dx + (dx < 0 ? -14 : 14); this.qz = e.z; this.qy = e.y + STEP_UP; this._gq(); if (!(this.g >= e.y - STEP_DOWN)) dx = 0; }
      if (dz !== 0) { this.qx = e.x; this.qz = e.z + dz + (dz < 0 ? -14 : 14); this.qy = e.y + STEP_UP; this._gq(); if (!(this.g >= e.y - STEP_DOWN)) dz = 0; }
    }
    this.qx = dx; this.qz = dz; this._mq(e);
    if (!air) { this.qx = e.x; this.qz = e.z; this.qy = e.y + STEP_UP; this._gq(); if (this.g > -1e9) e.y = this.g; }
  }
  _separate(dt) {
    const E = this.enemies, h = this.hero;
    for (let i = 0; i < E.length; i++) {
      const a = E[i]; if (a.dead || !a.active || a.state === 'dead') continue;
      for (let j = i + 1; j < E.length; j++) {
        const b = E[j]; if (b.dead || !b.active || b.state === 'dead' || !!a.def.fly !== !!b.def.fly) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz, R = a.r + b.r + 18;
        if (d2 > R * R || d2 < 1e-4) continue;
        const d = Math.sqrt(d2), p = (R - d) * 5 * dt, wa = 1 - a.def.weight * 0.8, wb = 1 - b.def.weight * 0.8;
        this.ex = (-dx / d) * p * wa; this.ez = (-dz / d) * p * wa; this._emq(a); this.ex = (dx / d) * p * wb; this.ez = (dz / d) * p * wb; this._emq(b);
      }
      // 영웅과 겹치지 않게 (구르는 동안은 지나갈 수 있다 — 갑주의 등 뒤로 돌아가는 길)
      if (!h.dead && h.dashT <= 0 && h.onGround && !a.def.fly && a.solid && Math.abs(a.y - h.y) < 40) {
        const dx = h.x - a.x, dz = h.z - a.z, d2 = dx * dx + dz * dz, R = a.r + h.r + 10;   // 몸이 겹쳐 보이지 않을 만큼
        if (d2 < R * R && d2 > 1e-4) { const d = Math.sqrt(d2), p = Math.min(R - d, 240 * dt); this.qx = (dx / d) * p * 0.7; this.qz = (dz / d) * p * 0.7; this._mq(h); this.ex = (-dx / d) * p * 0.3 * (1 - a.def.weight); this.ez = (-dz / d) * p * 0.3 * (1 - a.def.weight); this._emq(a); }
      }
    }
  }
  _shots(dt) {
    const h = this.hero, W = this.W;
    for (let si = 0; si < this.shots.length; si++) {
      const s = this.shots[si];
      if (s.dead) continue;
      s.t += dt; s.life -= dt; s.x += s.vx * dt; s.y += (s.vy ?? 0) * dt; s.z += s.vz * dt;
      if (s.life <= 0) { s.dead = true; continue; }
      if (s.friendly) {   // 튕겨 돌려보낸 탄: 적이 맞는다
        for (const e of this.enemies) {
          if (e.dead || e.state === 'dead' || hyp(s.x - e.x, s.z - e.z) > e.r + s.r || s.y < e.y - 8 || s.y > e.y + e.h + 8) continue;
          s.dead = true; this.hooks.spark?.(s.x, s.y, s.z, 'shot'); this._hitEnemy(e, REFLECT, { x: s.x - s.vx, z: s.z - s.vz }); break;
        }
      } else if (!h.dead && hyp(s.x - h.x, s.z - h.z) < h.r + (s.r ?? 8) - 4 && s.y > h.y - 6 && s.y < h.y + h.h + 4) {
        const d = hyp(s.vx, s.vz) || 1, SR = this._src; SR.shot = s; SR.e = this.byId(s.owner); SR.atk = null; this._hx = s.vx / d; this._hz = s.vz / d; const r = this._hurt(s.dmg, SR);
        if (r === 'parry') {   // 쏜 적에게 되돌려 보낸다
          const o = this.byId(s.owner), sp = d * 1.7; let bx = -s.vx / d, bz = -s.vz / d;
          if (o && !o.dead) { const od = hyp(o.x - s.x, o.z - s.z) || 1; bx = (o.x - s.x) / od; bz = (o.z - s.z) / od; s.vy = (o.y + o.h * 0.6 - s.y) / (od / sp); }
          s.vx = bx * sp; s.vz = bz * sp; s.friendly = true; s.life = 2.5; this.emit('shot', s, 'reflect');
        } else if (r) { s.dead = true; this.hooks.spark?.(s.x, s.y, s.z, 'shot'); this.emit('shot', s, r === 'guard' ? 'block' : 'hit'); continue; }
      }
      if (s.dead) continue;
      for (const b of W.boxes ?? []) {   // 벽 · 계단에 닿으면 사라진다
        if (b.solid && s.x > b.x0 && s.x < b.x1 && s.z > b.z0 && s.z < b.z1 && s.y > b.y0 && s.y < b.y1) { s.dead = true; this.hooks.spark?.(s.x, s.y, s.z, 'shot'); this.emit('shot', s, 'wall'); break; }
      }
    }
    { const S = this.shots; let n = 0; for (let i = 0; i < S.length; i++) if (!S[i].dead) S[n++] = S[i]; S.length = n; }   // 사라진 탄을 그 자리에서 뺀다 (새 배열을 만들지 않는다)
  }
}
