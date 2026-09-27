// 플레이어 컨트롤러: 이동(가속/코요테/점프버퍼/이단점프/벽차기/대시), 콤보 공격, 모아베기, 보조무기, 스킬, 필살기, 피격/사망
import { Entity } from './entity.js';
import { input } from '../core/input.js';
import { moveBody, touchesType, T, VerletChain, isSolidType } from '../core/physics.js';
import { TILE } from '../core/game.js';
import { approach, clamp, rand, TAU } from '../core/math.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { CHARACTERS } from '../data/characters.js';
import { MOVESETS } from '../data/movesets.js';
import { SUBWEAPONS } from '../data/subweapons.js';
import { POWERUPS } from '../data/powerups.js';
import { computeStats, composeLook, addStats } from './stats.js';
import { playerStrike } from './combat.js';
import { castSkill, castUltimate, castTechnique, SKILL_IMPL } from './skills.js';
import { SKILLS } from '../data/skills.js';
import { DOCS } from '../data/lore.js';
import { drawHero } from '../render/hero.js';
import { Hitbox } from './projectiles.js';
import { initFeel, updateGait, onJump, onLand, dashFx, squashSpring, chaseJump, takeChaseStall, pivotCommit, resetMoveFeel } from './feel_move.js';   // [hook:feel]
import { SPRINT } from '../data/feel_move.js';
import { handleUltInput } from './awaken.js';   // [hook:awaken]

const COYOTE = 0.1, JUMP_BUF = 0.13, ATK_BUF = 0.16;
const ZERO = Object.freeze({ dx: 0, dy: 0 });   // [hook:cmp] 탑승하지 않을 때의 공격 판정 보정 (riderLift)
const FACE_RING_T = 1;   // [hook:plat] 방향 전환 기록 보관 시간(초) — facingAt(t)
/** 히트스톱으로 멈춰 있던 시간만큼 입력 버퍼를 늘린다 (최대 0.3초; world.frozenRecent 는 WORLD-CAM) */
const bufWin = (world, base) => base + Math.min(0.3, world.frozenRecent ?? 0);   // [hook:feel]

export class Player extends Entity {
  constructor(world, state, hero) {
    const ch = CHARACTERS[hero.charId];
    super(0, 0, ch.size.w, ch.size.h);
    this.kind = 'player';
    this.world = world; this.game = world.game;
    this.state = state; this.hero = hero; this.ch = ch;
    this.z = 10;
    this.buffs = {};
    this.refreshStats();
    const run = world.run;
    this.hp = run.hp ?? this.stats.hp;
    this.mp = run.mp ?? this.stats.mp;
    this.hpGhost = this.hp;
    this.coyote = 0; this.airJumpsLeft = 0; this.jumpHeld = false; this.jumpCut = false;
    this.dashT = 0; this.dashCool = 0; this.airDashUsed = false;
    this.move = null; this.moveT = 0; this.moveHitDone = false; this.chain = 0; this.chainKind = null; this.hitId = 0;
    this.moveHits = 0;
    this.holdT = 0; this.charging = 0;
    this.subCool = 0;
    this.skillCd = {};
    this.iframes = 0; this.hurtT = 0; this.blinkT = 0;
    this.dead = false; this.deathT = 0;
    this.crouch = false;
    this.anim = 'idle'; this.animT = 0;
    this.wallSlide = 0;
    this.landT = 0;
    this.lastHitEnemy = null;
    this.skillPage = 0;
    this.rig = {}; // 렌더러 전용 상태 (망토/머리카락 체인 등)
    this.auraT = 0;
    // 걸음·발소리는 feel_move.js (initFeel: gait, gaitPh, moveFx, moveFxT, sprinting, feel{sq, sqV, accLean}) — 예전 stepT 발소리 타이머는 없앴다
    // ── 확장 훅 필드 (MASTER_PLAN §1.7 #1) ──
    //  mount: MountRider | null (CompanionSystem 이 붙임) · superArmor > 0: 피해는 받되 경직·넉백 없음 (설정한 쪽이 해제)
    //  awakenHoldK: 각성 길게 누르기 진행도 0..1 (awaken.js) · lastDashEnd: 대시가 자연 종료된 this.t (대시 연계 질주)
    this.faceRing = []; this.faceNoted = this.facing; this.faceHoldT = 0;   // [hook:plat] 방향 전환 기록 (facingAt) · 커맨드 기술로 돌아선 뒤 방향 유지 시간
    this.apexY = undefined;   // [hook:feel] 공중 최고점 y (착지 시 낙하 거리 fallPx)
    initFeel?.(this); this.mount = null; this.superArmor = 0; this.awakenHoldK = 0; this.lastDashEnd = -9;   // [hook:feel] [hook:cmp] [hook:awaken]
  }

  // ── 능력치 ──
  refreshStats() {
    this.stats = computeStats(this.state, this.hero);
    if (this.mount?.riding) addStats(this.stats, this.mount.rideStats());   // [hook:cmp] 탑승 보너스
    this.look = composeLook(this.state, this.hero);
    const b = this.buffs;
    if (b.whipup) this.stats.reach = (this.stats.reach ?? 0) + 25;
    this.moveSet = MOVESETS[this.stats.weaponType] || MOVESETS[this.ch.weaponType];
    if (this.hp > this.stats.hp) this.hp = this.stats.hp;
    if (this.mp > this.stats.mp) this.mp = this.stats.mp;
    this.mount?.refresh(this); this.world?.companions?.onStatsChanged?.();   // [hook:cmp]
  }
  get run() { return this.world.run; }
  get invuln() {
    return this.iframes > 0 || this.buffs.invincible > 0 || (this.dashT > 0 && this.dashInvuln) || this.dead || this.world.cutscene
      || this.mount?.invulnT > 0 || this.world?.companions?.shieldT > 0;   // [hook:cmp] 탑승 돌진 무적·수호 결계 (깜빡임 없음)
  }
  get speedMul() { return (1 + (this.stats.moveSpd ?? 0) / 100) * (this.buffs.haste ? 1.4 : 1); }
  get atkSpeedMul() { return (1 + (this.stats.atkSpd ?? 0) / 100) * (this.buffs.haste ? 1.3 : 1); }
  get dmgMul() {
    let m = this.buffs.rage ? 2 : 1;
    // 직업 특성(일부): 광전사 계열 저체력 보너스
    if (this.hero.classId?.startsWith('bran_berserk') || this.hero.classId === 'bran_warlord' || this.hero.classId === 'bran_bloodrage') m *= 1 + 0.4 * (1 - this.hp / this.stats.hp);
    if (this.hero.classId === 'kael_bloodhunter' && this.hp < this.stats.hp * 0.5) m *= 1.3;
    return m;
  }
  hurtbox() {
    if (this.mount?.riding) return this.mount.hurtbox(this);   // [hook:cmp]
    if (this.crouch) return { x: this.x + 3, y: this.y + this.h * 0.4, w: this.w - 6, h: this.h * 0.6 };
    return { x: this.x + 3, y: this.y + 6, w: this.w - 6, h: this.h - 6 };
  }
  maxAirJumps() { return (this.ch.move.airJumps ?? 1) + (this.stats.airJumps ?? 0); }

  /**
   * 단일 이동 프로필 (MASTER_PLAN §1.7 #5, companions §12.3 #4, world2 §3.3 #6) — 이동·점프 수치의 유일한 출처.
   * gait: FEEL-MOVE updateGait() 의 반환값, null 이면 오늘의 수치 그대로.
   *   { mul?: B 배율 (걷기 0.5 · 달리기 1 · 질주 k), accel?, decel?, airAccel?, airDecel? } — 모두 선택
   * 탑승 중에는 mount.profile(this) 가 통째로 대신한다 (null 이면 일반 프로필).
   * 반환 { speed, accel, decel, airAccel, airDecel, jump, airJumps, wallJump }
   */
  moveProfile(gait = null) {
    if (this.mount?.riding) { const mp = this.mount.profile(this); if (mp) return mp; }   // [hook:cmp]
    const B = this.ch.move.speed * this.speedMul;
    return {
      speed: B * (gait?.mul ?? 1) * (this.world?.gimmick?.speedMul ?? 1),   // [hook:feel] [hook:gimmick]
      accel: gait?.accel ?? 3200, decel: gait?.decel ?? 3600,
      airAccel: gait?.airAccel ?? 2200, airDecel: gait?.airDecel ?? 900,
      jump: this.jumpVel(), airJumps: this.maxAirJumps(), wallJump: !!this.ch.move.wallJump,
    };
  }

  // ── 방향 전환 기록 (MASTER_PLAN §1.21) ──
  /** 이번 스텝의 facing 변화를 input.time 기준으로 기록 (1초 보관) */
  noteFacing() {
    const f = this.facing, ring = this.faceRing;
    if (f !== this.faceNoted) {
      ring.push({ t: input.time, prev: this.faceNoted, f });
      this.faceNoted = f;
    }
    while (ring.length && (input.time - ring[0].t > FACE_RING_T || ring.length > 64)) ring.shift();
  }
  /**
   * t (input.time 기준) 에 읽힌 입력을 받았을 때 영웅이 바라보던 방향 (±1).
   * 같은 스텝에서 그 입력 때문에 돌아선 것은 포함하지 않는다 (돌아서기 "전" 방향) — input.command 의 f/b 판정용.
   */
  facingAt(t) {
    const ring = this.faceRing;
    let f = this.faceNoted ?? this.facing;
    for (let i = ring.length - 1; i >= 0; i--) {
      if (ring[i].t < t) return ring[i].f;
      f = ring[i].prev;
    }
    return f;
  }

  // ── 메인 업데이트 ──
  update(dt, world) {
    this.t += dt; this.animT += dt;
    if (this.dead) { this.updateDeath(dt, world); return; }
    const inp = world.cutscene || world.inputLock ? null : input;
    this.tickTimers(dt, world);
    this.mount?.tick(dt, world, this, inp);   // [hook:cmp] 소환/하차 입력, 타이머, 자동 재탑승
    const onGround = this.onGround;
    if (onGround) { this.coyote = COYOTE; this.airJumpsLeft = this.maxAirJumps(); this.airDashUsed = false; }
    else this.coyote -= dt;

    // 피격 경직
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      this.physics(dt, world);
      this.setAnim(this.mount?.riding ? 'ride_hurt' : 'hurt');   // [hook:cmp] 탑승 중 강타: 안장에 앉은 채 움찔 (companions §11.4)
      this.noteFacing?.();   // [hook:plat]
      return;
    }

    const ax = inp ? input.axisX : 0;
    const down = inp && input.down('down');
    const up = inp && input.down('up');
    this.crouch = !this.mount?.riding && onGround && down && !this.move && this.dashT <= 0;   // [hook:cmp] 탑승 중엔 웅크리기 없음

    // ── 대시 ── (탑승 중에는 탈것 돌진이 대신한다)
    if (this.mount?.riding) {   // [hook:cmp]
      this.dashT = 0;
      if (inp && input.pressed('dash')) this.mount.tryCharge(world, this, ax, input.axisY);   // [hook:cmp]
      if (this.mount.chargeT > 0) this.mount.updateCharge(dt, world, this);   // [hook:cmp]
    } else if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.facing * this.dashSpeed;
      this.vy = this.dashAir ? 0 : this.vy;
      dashFx?.(this, world, 'step');   // [hook:feel] 잔상(0.035초, 품질별 상한)·속도선은 feel_move.js
      if (this.dashT <= 0) { this.vx *= 0.5; this.lastDashEnd = this.t; dashFx?.(this, world, 'end'); }   // [hook:feel]
    } else if (inp && input.pressed('dash') && this.dashCool <= 0 && (onGround || !this.airDashUsed) && !this.moveLocked()) {
      this.startDash(ax, world);
    }

    // ── 공격 입력 ──
    if (inp) this.handleAttackInput(dt, world, { ax, up, down });

    // ── 이동 ──
    const gait = updateGait?.(this, world, dt, inp) ?? null;   // [hook:feel] 걷기·달리기·질주 (탑승 중 null)
    const prof = this.moveProfile(gait);   // [hook:feel] [hook:cmp] [hook:gimmick]
    const moving = this.move && !this.move.canMove;
    if (this.dashT <= 0 && !(this.mount?.chargeT > 0)) {   // [hook:cmp] 돌진 중에는 돌진이 vx 를 쥔다
      const maxSp = prof.speed;
      if (!moving && !this.crouch) {
        if (ax !== 0) {
          const acc = onGround ? prof.accel : prof.airAccel;
          this.vx = approach(this.vx, ax * maxSp, acc * dt);
          if (!this.move && !(this.faceHoldT > 0) && !gait?.holdFace) this.facing = ax;   // [hook:plat] [hook:feel] 커맨드 기술로 돌아선 직후엔 뒤로 누른 방향으로 바로 되돌지 않는다 · 방향 전환(pivot)은 절반 지나서 돈다
        } else {
          this.vx = approach(this.vx, 0, (onGround ? prof.decel : prof.airDecel) * dt);
        }
      } else {
        // 공격 중: 전진(lunge) 감속
        this.vx = approach(this.vx, 0, (onGround ? 2600 : 500) * dt);
      }
    }
    this.noteFacing?.();   // [hook:plat] 방향 전환 기록 → facingAt(t)

    // ── 점프 ──
    if (inp) this.handleJump(dt, world, { down, ax, wallJump: prof.wallJump });   // [hook:cmp] 벽차기 여부도 이동 프로필 (탑승 중엔 탈것)

    // 공중 공격 체공
    this.gravity = 1;
    const stall = this.move ? Math.max(this.move.airStall ?? 0, this.moveStall ?? 0) : 0;   // [hook:feel] 추격 점프 뒤 첫 공중 공격은 체공 0.5
    if (stall && !onGround && this.moveT < this.move.dur * stall && this.vy > -50) {
      this.gravity = 0.25; if (this.vy > 120) this.vy = 120;
    }
    if (this.dashT > 0 && this.dashAir) this.gravity = 0;
    // 벽 미끄러짐 (벽차기 가능 캐릭터)
    this.wallSlide = 0;
    if (prof.wallJump && !onGround && this.hitWallDir && ax === this.hitWallDir && this.vy > 0) {   // [hook:cmp] 탑승 중엔 탈것 프로필
      this.wallSlide = this.hitWallDir;
      if (this.vy > 160) this.vy = 160;
    }

    this.physics(dt, world);
    this.updateMove(dt, world);
    this.updateAnim(dt, world, ax);
  }

  moveLocked() { return this.move && this.moveT < (this.move.cancel ?? this.move.dur) / this.atkSpeedMul; }

  tickTimers(dt, world) {
    const s = this.stats;
    if (this.dashCool > 0) this.dashCool -= dt;
    if (this.subCool > 0) this.subCool -= dt;
    if (this.iframes > 0) this.iframes -= dt;
    if (this.faceHoldT > 0) this.faceHoldT -= dt;   // [hook:plat]
    for (const k in this.skillCd) if (this.skillCd[k] > 0) this.skillCd[k] -= dt * (1 + (s.cdr ?? 0) / 100);
    // 버프 시간
    for (const k in this.buffs) {
      if (this.buffs[k] > 0 && this.buffs[k] < 9000) {
        this.buffs[k] -= dt;
        if (this.buffs[k] <= 0) { delete this.buffs[k]; this.game.toast(`${POWERUPS[k]?.name ?? k} 효과 종료`, '#9d8f80', 1.4); }
      }
    }
    // 재생
    if (this.hp < s.hp && s.hpRegen > 0 && !world.gimmick?.noRegen) this.hp = Math.min(s.hp, this.hp + s.hpRegen * dt);   // [hook:gimmick] 역병 상태: 재생 없음
    if (this.mp < s.mp) this.mp = Math.min(s.mp, this.mp + (s.mpRegen ?? 1) * dt);
    this.hpGhost = this.hpGhost > this.hp ? Math.max(this.hp, this.hpGhost - s.hp * 0.6 * dt) : this.hp;
    // 성광의 오라
    if (this.buffs.holyaura) {
      this.auraT -= dt;
      if (this.auraT <= 0) {
        this.auraT = 0.35;
        playerStrike(world, { x: this.cx - 110, y: this.cy - 110, w: 220, h: 220 }, { owner: this, stats: this.stats, team: 'player', mv: 0.35, type: 'mag', element: 'holy', hitId: 'aura' + Math.floor(this.t * 3), kb: [60, -40], hitstop: 0, shake: 0, tags: ['skill'] });
      }
    }
  }

  physics(dt, world) {
    world.gimmick?.prePhysics?.(this, dt);   // [hook:gimmick]
    const vxBefore = this.vx, vyBefore = this.vy;
    if (!(Math.abs(this.y - (this.physY ?? this.y)) <= 64)) this.apexY = this.y;   // [hook:feel] 방 이동·낙사 복귀·순간이동 뒤엔 예전 최고점을 버린다 (fallPx)
    moveBody(this, dt, world.map, world.platforms);
    this.physY = this.y;   // [hook:feel]
    this.hitWallDir = this.hitWall;
    this.mount?.afterPhysics(dt, world, this, vyBefore);   // [hook:cmp] 착지 충격, 끼임 해소, 천장 제한
    if (!this.onGround && !(this.apexY <= this.y)) this.apexY = this.y;   // [hook:feel] 공중 최고점
    if (this.landed) {
      this.landT = 0.12;
      this.landSlam = !!(this.move && (this.move.groundPound || this.move.id?.endsWith('Down') || this.move.anim === 'plunge' || this.move.anim === 'dive_kick'));   // [hook:feel] 내려찍기 착지는 무거운 착지 연출 없음
      world.fx.burst('dust', this.cx, this.bottom, 6, { angle: -Math.PI / 2, spread: 1.4, speed: 80 });
      audio.sfx('land', { vol: 0.4 });
      if (this.move?.groundPound) this.groundPound(world, this.move.groundPound);
      if (this.move && (this.move.id?.endsWith('Down') || this.move.anim === 'plunge' || this.move.anim === 'dive_kick')) { this.endMove(); }
      if (!this.mount?.riding) onLand?.(this, world, vyBefore, Math.max(0, this.y - (this.apexY ?? this.y)));   // [hook:feel] [hook:cmp] 탑승 중엔 탈것이 처리
    }
    if (this.onGround) this.apexY = this.y;   // [hook:feel]
    this.dropThrough = false;
    // 가시
    if (touchesType(this, world.map, T.SPIKE, 6) && !this.invuln) {
      if (!(this.mount?.riding && this.mount.hazard('spike', this, world))) {   // [hook:cmp]
        this.takeHit(Math.ceil(this.stats.hp * 0.12), { team: 'enemy', dir: -this.facing, kb: [200, -520], flat: 1 }, world, {});
      }
    }
    // 액체
    const inLiquid = touchesType(this, world.map, T.LIQUID, 10);
    if (inLiquid) {
      const liq = world.liquid ?? world.stage.liquid ?? 'water';   // [hook:gimmick] 방마다 다른 액체 (room.liquid)
      if (!this.inLiquid) { world.fx.burst('water', this.cx, this.bottom - 10, 12); audio.sfx('splash'); }
      if (liq === 'deep') {   // [hook:gimmick] 깊은 물: 수영은 gimmicks.js 가 처리 (물 감속 없음)
        if (this.mount?.riding) this.mount.hazard('deep', this, world);   // [hook:cmp] 탈것은 깊은 물에서 하차
      } else if (liq === 'lava' || liq === 'poison' || liq === 'blood') {
        if (!this.invuln && !(this.mount?.riding && this.mount.hazard(liq, this, world))) this.takeHit(Math.ceil(this.stats.hp * 0.1), { team: 'enemy', dir: -this.facing, kb: [0, -720], flat: 1, element: liq === 'lava' ? 'fire' : null }, world, {});   // [hook:cmp]
      } else if (!(this.mount?.riding && this.mount.hazard(liq, this, world))) {   // [hook:cmp] 헤엄치는 탈것은 스스로 처리
        this.vx *= 0.9; if (this.vy > 180) this.vy = 180;
      }
    }
    this.inLiquid = inLiquid;
    world.gimmick?.postPhysics?.(this, dt); squashSpring?.(this, dt);   // [hook:gimmick] [hook:feel]
    // 낙사 복귀 지점: 양발 바깥쪽까지 단단한 땅을 딛고 선 마지막 위치 (발판·가장자리·가시·액체 제외)
    if (this.onGround && !this.platform && !inLiquid && !this.dead) {
      const m = world.map, gy = Math.floor((this.bottom + 2) / TILE);
      if (isSolidType(m.typeAt(Math.floor((this.x - 10) / TILE), gy)) && isSolidType(m.typeAt(Math.floor((this.x + this.w + 10) / TILE), gy)) && !touchesType(this, m, T.SPIKE, 0)) {
        const s = (this.safeSpot ??= {});
        s.roomId = world.roomId; s.x = this.x; s.y = this.y;
      }
    }
    // 낙사
    if (this.y > world.map.pxH + 60) world.onPlayerFell(this);
  }

  startDash(ax, world) {
    this.lastDashT = this.t;
    if (ax) this.facing = ax;
    const type = this.ch.move.dash;
    this.dashT = type === 'blink' ? 0.14 : type === 'mist' ? 0.24 : 0.2;
    this.dashSpeed = (this.ch.move.dashSpeed ?? 650) * (type === 'blink' ? 1.3 : 1) * (this.buffs.haste ? 1.2 : 1);
    this.dashAir = !this.onGround;
    if (this.dashAir) this.airDashUsed = true;
    this.dashCool = 0.34;
    this.dashInvuln = type !== 'dash' || true;
    if (this.move && this.moveT > (this.move.cancel ?? 0) * 0.6) this.endMove();
    audio.sfx(type === 'mist' ? 'mist' : 'dash', { vol: 0.6 });
    world.fx.burst('dust', this.cx, this.bottom, 8, { angle: this.facing > 0 ? Math.PI : 0, spread: 0.6, speed: 160 });
    if (type === 'mist') world.fx.burst('dark', this.cx, this.cy, 12, { speed: 100, color: '#8a0a1e' });
    if (type === 'blink') { world.fx.burst('holy', this.cx, this.cy, 12, { speed: 120 }); }
    dashFx?.(this, world, 'start');   // [hook:feel]
  }

  handleJump(dt, world, { down, ax, wallJump = this.ch.move.wallJump }) {
    if (this.mount?.riding && this.mount.handleJump(world, this, dt)) return;   // [hook:cmp] 탈것 점프·비행·활공
    if (world.gimmick?.onJumpInput?.(this)) return;   // [hook:gimmick] 깊은 물: 헤엄치기
    const onGround = this.onGround;
    if (input.buffered('jump', bufWin(world, JUMP_BUF))) {   // [hook:feel] 히트스톱 보정
      if (onGround && down && this.onOneWay(world)) {
        this.dropThrough = true; this.y += 2; input.consume('jump');
      } else if (onGround || this.coyote > 0) {
        if (!chaseJump?.(this, world)) this.doJump(world, false);   // [hook:feel] 띄우기 적중 0.35초 안이면 추격 점프 '추격!'
        input.consume('jump');
      } else if (this.wallSlide || (wallJump && this.hitWallDir && !onGround)) {   // [hook:cmp] moveProfile().wallJump
        const dir = -(this.wallSlide || this.hitWallDir);
        this.vx = dir * 420; this.facing = dir;
        this.vy = -this.jumpVel() * 0.92; this.jumpCut = true;
        this.airJumpsLeft = Math.max(this.airJumpsLeft, 1);
        audio.sfx('jump'); input.consume('jump');
        world.fx.burst('dust', this.cx - dir * 14, this.cy, 8, { speed: 90 });
        onJump?.(this, world, 'wall');   // [hook:feel] air: false | true | 'wall'
      } else if (this.airJumpsLeft > 0) {
        this.airJumpsLeft--;
        this.doJump(world, true); input.consume('jump');
      }
    }
    // 가변 점프
    if (!input.down('jump') && this.vy < 0 && !this.jumpCut && !this.move?.vy) {
      this.vy *= 0.5; this.jumpCut = true;
    }
  }
  jumpVel() { return this.ch.move.jump * (1 + (this.stats.jumpPow ?? 0) / 100); }
  doJump(world, air) {
    this.vy = -this.jumpVel() * (air ? 0.9 : 1);
    this.coyote = 0; this.jumpCut = false;
    this.onGround = false;
    this.flipT = air ? 0.35 : 0;
    if (air) {
      audio.sfx('double_jump');
      world.fx.ring(this.cx, this.bottom, { color: '#c8e0ff', r0: 6, r1: 40, life: 0.25, width: 3 });
      world.fx.burst('magic', this.cx, this.bottom, 6, { color: '#c8e0ff', speed: 90 });
    } else {
      audio.sfx('jump');
      world.fx.burst('dust', this.cx, this.bottom, 5, { angle: -Math.PI / 2, spread: 1.2, speed: 70 });
    }
    onJump?.(this, world, air);   // [hook:feel]
  }
  onOneWay(world) {
    const map = world.map;
    const ty = Math.floor((this.bottom + 2) / 48);
    const l = Math.floor(this.x / 48), r = Math.floor((this.x + this.w - 1) / 48);
    for (let tx = l; tx <= r; tx++) { const t = map.typeAt(tx, ty); if (t !== T.ONEWAY && t !== T.EMPTY) return false; }
    return true;
  }

  // ── 공격 ──
  handleAttackInput(dt, world, { ax, up, down }) {
    // 필살기 · 각성기 (길게 누르기 판정은 awaken.js)
    if (handleUltInput(this, world)) return;   // [hook:awaken]
    // 스킬
    for (const [k, i] of [['skill1', 0], ['skill2', 1]]) {
      if (input.pressed(k)) this.trySkill(world, this.hero.slots?.[this.skillPage * 2 + i]);
    }
    if (input.pressed('swap')) { this.skillPage = 1 - this.skillPage; audio.sfx('menu_move'); }
    // 보조무기
    if (input.pressed('sub')) this.useSub(world);
    // 모아베기
    if (input.down('attack')) this.holdT += dt; else {
      if (this.charging >= 0.55 && !this.move) { this.startMove(world, this.moveSet.charge, 'charge'); this.charging = 0; this.holdT = 0; return; }
      this.holdT = 0; this.charging = 0;
    }
    if (this.holdT > 0.28 && !this.move) {
      const before = this.charging;
      this.charging += dt;
      if (before < 0.55 && this.charging >= 0.55) { audio.sfx('charge_ready'); world.fx.ring(this.cx, this.cy, { color: '#fff', r0: 50, r1: 8, life: 0.25 }); }
      if (Math.random() < 0.5) world.fx.emit('magic', this.cx + rand(-30, 30), this.cy + rand(-30, 30), { speed: 40, color: this.charging >= 0.55 ? '#fff2b0' : '#8ac8ff' });
    }
    if (!input.buffered('attack', bufWin(world, ATK_BUF))) return;   // [hook:feel] 히트스톱 보정
    // 비전서 커맨드 기술 — f/b 는 커맨드 첫 방향을 넣던 순간의 방향 기준 (MASTER_PLAN §1.21)
    // faceFn: 새 input.command(seq, facingAt, within) → {ok, facing} 에는 함수로, 구 버전(숫자 facing) 에는 valueOf 로 현재 방향을 준다
    const faceFn = (this._faceFn ??= Object.assign((t) => this.facingAt(t), { valueOf: () => this.facing }));   // [hook:plat]
    for (const d of this.state.progress?.docs || []) {
      const tech = DOCS[d]?.tech;
      if (!tech?.cmd) continue;
      if (this.sprinting && tech.cmd[0] === 'f' && tech.cmd[1] === 'f' && input.time - (this.fm?.sprintAt ?? -9) > SPRINT.cmdWindow) continue;   // [hook:feel] →→ 뒤 0.25초가 지나면 질주 공격이 먼저 (MASTER_PLAN §1.4)
      const r = input.command(tech.cmd, faceFn, tech.window ?? 0.6);   // [hook:plat]
      if (r === true || r?.ok) {   // [hook:plat]
        input.consume('attack');
        const f0 = this.facing;
        if (r.facing === 1 || r.facing === -1) this.facing = r.facing;   // [hook:plat] 커맨드를 시작한 쪽으로 돌아서서 시전
        if (castTechnique(this, world, tech)) { if (this.facing !== f0) this.faceHoldT = 0.2; return; }   // [hook:plat] 같은 스텝의 이동 처리가 (아직 뒤로 누른) 방향으로 되돌리지 않게
        this.facing = f0;
      }
    }
    if (this.mount?.riding && down && this.mount.trySpecial(world, this)) { input.consume('attack'); return; }   // [hook:cmp] 탑승 특수기 (↓+공격)
    const ms = this.moveSet;
    if (this.move) {
      // 콤보 연결
      const t = this.moveT * this.atkSpeedMul;
      if (t >= (this.move.cancel ?? this.move.dur) && this.chainKind && ms[this.chainKind]?.[this.chain + 1] && !this.move.finisher) {
        input.consume('attack');
        this.chain++;
        this.startMove(world, ms[this.chainKind][this.chain], this.chainKind);
      }
      return;
    }
    input.consume('attack');
    if ((this.dashT > 0 || (this.sprinting && this.onGround)) && ms.dash && !this.mount?.riding) { this.dashT = 0; this.startMove(world, ms.dash, 'dash'); return; }   // [hook:feel] [hook:cmp] 질주 공격 = 대시 공격 (땅 위에서만: 질주 점프 중엔 공중 공격·내려찍기)
    if (!this.onGround) {
      if (down && ms.down && !this.mount?.riding) { this.startMove(world, ms.down, 'down'); return; }   // [hook:cmp]
      if (up && ms.up && !this.usedAirUp) { this.usedAirUp = true; this.startMove(world, ms.up, 'up'); return; }
      const idx = this.lastAirChain !== undefined && this.t - this.lastAirT < 0.5 ? Math.min(this.lastAirChain + 1, ms.air.length - 1) : 0;
      this.chain = idx; this.startMove(world, ms.air[idx], 'air'); return;
    }
    this.usedAirUp = false;
    if (up && ms.up) { this.startMove(world, ms.up, 'up'); return; }
    if (down && ms.crouch && !this.mount?.riding) { this.startMove(world, ms.crouch, 'crouch'); return; }   // [hook:cmp]
    this.chain = 0;
    this.startMove(world, ms.ground[0], 'ground');
  }

  startMove(world, mv, kind) {
    if (!mv) return;
    if (this.mount?.riding) mv = this.mount.adaptMove(mv);   // [hook:cmp] 탑승 중: 돌진·체공·반동 제거, canMove
    else { pivotCommit?.(this); if (this.onGround) this.sprinting = false; }   // [hook:feel] 방향 전환 중이면 새 방향으로 치고, 지상 공격은 질주를 끝낸다
    this.moveStall = takeChaseStall?.(this) ?? 0;   // [hook:feel]
    this.move = mv; this.moveT = 0; this.moveHitDone = false; this.moveHits = 0;
    this.chainKind = kind === 'ground' || kind === 'air' ? kind : null;
    if (kind === 'air') { this.lastAirChain = this.chain; this.lastAirT = this.t; }
    this.hitId++;
    this.curHitId = 'pl' + this.hitId;
    if (mv.lunge) this.vx = this.facing * mv.lunge * (this.onGround ? 1 : 0.6);
    if (mv.vy) { this.vy = mv.vy; this.jumpCut = true; }
    if (mv.vx) this.vx = this.facing * mv.vx;
    this.setAnim(mv.anim);
    if (mv.finisher) { world.camera.punchZoom(1.05, 0.2); }
    this.shotsFired = 0;
  }
  endMove() { this.move = null; this.moveT = 0; }

  updateMove(dt, world) {
    const mv = this.move;
    if (!mv) return;
    const spd = this.atkSpeedMul;
    this.moveT += dt;
    const t = this.moveT * spd;
    const [h0, h1] = mv.hit;
    // 휘두르는 소리/궤적 (판정 시작 시 1회)
    if (t >= h0 && !this.moveHitDone) {
      this.moveHitDone = true;
      audio.sfx(mv.sfx ?? 'slash', { pitch: rand(0.95, 1.05) });
      this.spawnMoveFx(world, mv);
      if (mv.proj) this.fireMoveProjectiles(world, mv);
      if (mv.recoil) this.vx = -this.facing * mv.recoil;
      if (mv.recoilY) this.vy = mv.recoilY;
      if (mv.pillar) this.spawnPillar(world, mv);
      if (mv.nova) this.spawnNova(world, mv);
      if (this.buffs.gunmode) this.gunmodeShot(world);
      this.classOnSwing(world, mv);
    }
    // 연사 (dash shot 등)
    if (mv.multiShot && t >= h0 && t <= h1 && mv.proj) {
      const every = (h1 - h0) / mv.multiShot;
      const want = Math.min(mv.multiShot, Math.floor((t - h0) / every) + 1);
      while (this.shotsFired < want) { this.fireMoveProjectiles(world, mv); }
    }
    // 근접 판정
    if (mv.box && t >= h0 && t <= h1) {
      const reach = 1 + (this.stats.reach ?? 0) / 100;
      const b = mv.box;
      const riding = !!this.mount?.riding, L = riding ? this.mount.riderLift() : ZERO;   // [hook:cmp] 안장 높이만큼 판정 이동
      const w = b.w * (b.x >= 0 ? reach : 1) * (riding ? 1.15 : 1), x = b.x;   // [hook:cmp] 탑승 사거리 +15%
      const rect = this.relRect(x + L.dx, b.y + L.dy, w, b.h);   // [hook:cmp]
      const atk = this.makeAttack(mv);
      if (mv.rehit) atk.hitId = this.curHitId + ':' + Math.floor((t - h0) / mv.rehit);
      const n = playerStrike(world, rect, atk);
      if (n > 0) {
        this.moveHits += n;
        if (mv.pogo) { this.vy = -mv.pogo; this.airJumpsLeft = Math.max(this.airJumpsLeft, 1); this.airDashUsed = false; if (!mv.rehit) this.endMove(); return; }
      }
      if (world.game.debug) world.debugRects.push(rect);
    }
    if (t >= mv.dur) this.endMove();
  }

  makeAttack(mv, extra = {}) {
    const el = mv.element ?? this.stats.element ?? (this.buffs.whipup ? 'fire' : null);
    return {
      owner: this, team: 'player', stats: this.stats, mv: mv.mv ?? 1, type: mv.type ?? 'phys', element: el,
      dir: this.facing, kb: mv.kb ?? [160, -60], hitstop: mv.hitstop ?? 0.05, shake: mv.shake ?? 2,
      hitId: this.curHitId, launch: !!mv.launch, stun: mv.stun, mult: this.dmgMul, tags: ['melee'], crit: 0,
      moveId: mv.id,   // [hook:feel] 타격감 판정 (impact.js)
      ...extra,
    };
  }

  fireMoveProjectiles(world, mv) {
    const P = mv.proj;
    this.shotsFired++;
    const n = P.count ?? 1;
    const base = P.angle !== undefined ? (this.facing > 0 ? P.angle : Math.PI - P.angle) : (this.facing > 0 ? 0 : Math.PI);
    const L = this.mount?.riding ? this.mount.riderLift() : ZERO;   // [hook:cmp]
    const ox = this.cx + this.facing * ((P.offX ?? 30) + L.dx), oy = this.bottom + (P.offY ?? -60) + L.dy;   // [hook:cmp]
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * (P.spread ?? 0) + (n > 1 ? rand(-0.03, 0.03) : 0);
      world.spawnProjectile({
        x: ox, y: oy, vx: Math.cos(a) * P.speed, vy: Math.sin(a) * P.speed, w: P.w ?? 14, h: P.h ?? 8,
        render: P.render ?? 'bullet', color: P.color ?? '#fff0b0', life: P.life ?? 0.6, pierce: P.pierce ?? 1, scale: P.scale ?? 1,
        behavior: P.homing ? 'homing' : P.behavior ?? 'straight', speed: P.speed, homingTurn: 5, trail: P.trail ?? null,
        owner: this, light: P.render === 'bullet' ? null : { r: 70, color: P.color ?? '#fff', i: 0.7 },
        attack: this.makeAttack(mv, { mv: (P.mv ?? mv.mv ?? 1), tags: ['projectile'], hitId: undefined }),
      });
    }
    if (mv.fx === 'shot') {
      world.fx.flash(ox, oy, { color: '#ffd070', size: 46, life: 0.08 });
      world.fx.burst('spark', ox, oy, 4, { angle: base, spread: 0.4, color: '#ffe0a0' });
      world.fx.burst('smoke', ox, oy, 2, { speed: 30 });
      world.lighting.add(ox, oy, 120, '#ffc060', 1);
      this.muzzleT = 0.06;
      world.camera.shake(1.5, 0.05);
    }
  }

  spawnMoveFx(world, mv) {
    const fx = world.fx;
    if (mv.slash) {
      const s = mv.slash;
      const reach = 1 + (this.stats.reach ?? 0) / 100;
      const ang = this.facing > 0 ? s.angle ?? 0 : Math.PI - (s.angle ?? 0);
      const col = s.color ?? (this.stats.element ? { fire: '#ffb070', ice: '#c0f0ff', holy: '#fff2b0', dark: '#d0a0ff', thunder: '#d0ecff' }[this.stats.element] : '#e8f0ff');
      const L = this.mount?.riding ? this.mount.riderLift() : ZERO;   // [hook:cmp]
      fx.slash(this.cx + this.facing * (10 + L.dx), this.bottom - 58 + L.dy, ang, { radius: s.r * reach, arc: s.arc, width: s.width, color: col, life: mv.finisher ? 0.2 : 0.13 });   // [hook:cmp]
    }
    if (mv.fx === 'heavy') { world.camera.shake(2, 0.1); }
  }

  spawnPillar(world, mv) {
    const x = this.cx + this.facing * 45;
    world.add(new Hitbox({ x: x - 35, y: this.bottom - 260, w: 70, h: 260, life: 0.36, attack: this.makeAttack(mv, { rehit: mv.rehit ?? 0.1, hitId: this.curHitId }),
      light: { r: 160, color: '#fff2b0', i: 1 },
      render(ctx, hb, w) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const k = Math.min(1, hb.t * 8) * Math.min(1, hb.life * 6);
        const g = ctx.createLinearGradient(hb.x, 0, hb.x + hb.w, 0);
        g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(0.5, `rgba(255,250,220,${0.85 * k})`); g.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = g; ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
        ctx.restore();
      } }));
    world.fx.burst('holy', x, this.bottom - 20, 20, { angle: -Math.PI / 2, spread: 0.3, speed: 420 });
  }
  spawnNova(world, mv) {
    world.fx.ring(this.cx, this.cy, { color: '#fff2b0', r0: 20, r1: 180, life: 0.5, width: 10 });
    world.fx.burst('holy', this.cx, this.cy, 40, { speed: 380 });
    world.game.flash('#fff8e0', 0.35, 4);
  }
  groundPound(world, r) {
    world.fx.ring(this.cx, this.bottom, { color: '#ffd8a0', r0: 10, r1: r * 1.6, life: 0.35, width: 8 });
    world.fx.burst('shard', this.cx, this.bottom - 4, 16, { angle: -Math.PI / 2, spread: 1.2, speed: 360, color: '#8a7a6a' });
    world.fx.burst('dust', this.cx, this.bottom, 14, { speed: 200 });
    world.camera.shake(10, 0.3);
    audio.sfx('explode', { vol: 0.7 });
    playerStrike(world, { x: this.cx - r, y: this.bottom - 60, w: r * 2, h: 64 }, this.makeAttack(this.move || { mv: 1.5 }, { mv: (this.move?.mv ?? 1.5) * 0.8, hitId: this.curHitId + 'gp', kb: [340, -520], launch: true }));
  }
  gunmodeShot(world) {
    for (const dy of [-8, 8]) {
      world.spawnProjectile({ x: this.cx + this.facing * 30, y: this.cy - 10 + dy, vx: this.facing * 1600, vy: dy * 6, w: 16, h: 8, render: 'bullet', life: 0.5, owner: this,
        attack: this.makeAttack({ mv: 0.5 }, { tags: ['projectile'], hitId: undefined }) });
    }
    audio.sfx('gun', { vol: 0.5, pitch: 1.2 });
  }
  /** 직업별 휘두르기 부가 효과 (간단 구현; 스킬 담당이 확장) */
  classOnSwing(world, mv) {
    const c = this.hero.classId;
    if ((c === 'azel_dawnbringer' || c === 'bran_crusader') && mv.finisher) {
      world.spawnProjectile({ x: this.cx + this.facing * 40, y: this.bottom - 60, vx: this.facing * 900, vy: 0, w: 50, h: 80, render: 'wave', color: '#fff2b0', life: 0.5, pierce: 99, owner: this,
        attack: this.makeAttack(mv, { mv: 1.2, element: 'holy', tags: ['skill'], hitId: undefined }) });
    }
    SKILL_IMPL.__onSwing?.(this, world, mv);
  }

  // ── 보조무기 ──
  useSub(world) {
    const id = this.run.sub;
    const sw = SUBWEAPONS[id];
    if (!sw || this.subCool > 0) return;
    const free = id === 'pistol' && this.hero.charId === 'victor';
    if (!free && this.run.hearts < sw.cost) { audio.sfx('menu_cancel', { vol: 0.4 }); return; }
    if (!free) this.run.hearts -= sw.cost;
    this.subCool = sw.cd / this.atkSpeedMul;
    const n = this.buffs.triple ? 3 : this.buffs.double ? 2 : 1;
    sw.fire(this, world, n);
    this.setAnim('throw');
    this.throwT = 0.2;
  }

  // ── 스킬 ──
  trySkill(world, skillId) {
    if (!skillId) { this.game.toast('스킬 슬롯이 비어 있습니다 — 메뉴 > 스킬에서 장착', '#9d8f80', 1.6); return; }
    const sk = SKILLS[skillId];
    const lv = this.hero.skills?.[skillId] ?? 0;
    if (!sk || !lv) return;
    if ((this.skillCd[skillId] ?? 0) > 0) { audio.sfx('menu_cancel', { vol: 0.3 }); return; }
    const cost = sk.cost ?? 10;
    if (this.mp < cost) { this.game.toast('MP가 부족하다', '#5aa8ff', 1); audio.sfx('menu_cancel', { vol: 0.3 }); return; }
    if (castSkill(this, world, skillId, lv)) {
      this.mp -= cost;
      this.skillCd[skillId] = sk.cd ?? 3;
      this.setAnim('cast');
      this.castT = 0.3;
    }
  }

  // ── 피격 ──
  takeHit(dmg, attack, world, info) {
    if (this.invuln) return false;
    // 환영 회피 (카게로우)
    if (this.hero.classId === 'lia_kunoichi' && Math.random() < 0.25) {
      this.iframes = 0.5; world.fx.text(this.cx, this.y - 10, '회피!', { color: '#ffb0c0', size: 18 });
      this.ghostTrail(world, '#ff7a9a'); return false;
    }
    const mr = world.companions?.incoming?.(this, dmg, attack) ?? null;   // [hook:cmp] 수호 방벽·탈것이 먼저 받는다
    if (mr?.cancel) return false;   // [hook:cmp]
    if (mr && Number.isFinite(mr.dmg)) dmg = Math.max(0, mr.dmg);   // [hook:cmp] (dmg 가 빠진 응답은 원래 피해 그대로 — HP 가 NaN 이 되지 않게)
    const armored = this.superArmor > 0 || !!(mr?.mounted && mr.noStagger);   // [hook:awaken] [hook:cmp] 슈퍼아머: 경직·넉백 없음
    const heavyMounted = !!(mr?.mounted && !mr.noStagger);   // [hook:cmp] 탑승 중 강타: 짧은 경직, 넉백 절반
    this.hp -= dmg;
    if (armored) {
      this.iframes = 0.6;   // [hook:awaken] [hook:cmp]
    } else {
      this.iframes = heavyMounted ? 1.0 : 1.1;
      this.hurtT = heavyMounted ? 0.2 : 0.28;
      this.endMove(); this.dashT = 0; this.charging = 0; this.holdT = 0;
      resetMoveFeel?.(this, world);   // [hook:feel] 경직: 질주·미끄러짐 끝
      const dir = attack.dir || (Math.sign(this.cx - (attack.owner?.cx ?? this.cx)) || -this.facing);
      const kb = attack.kb || [240, -360];
      const km = heavyMounted ? 0.5 : 1;   // [hook:cmp]
      this.vx = dir * Math.max(180, Math.abs(kb[0])) * km;
      this.vy = Math.min(-280, kb[1]) * km;
      this.onGround = false;
    }
    audio.sfx('hurt');
    world.onPlayerHurt(dmg);
    bus.emit('playerHurt', { amount: dmg });
    if (this.hp <= 0) {
      // 성녀: 치명상 1회 무효
      if (this.hero.classId === 'sera_saint' && !this.run.saintUsed) {
        this.run.saintUsed = true; this.hp = Math.ceil(this.stats.hp * 0.3); this.iframes = 2;
        world.game.flash('#fff8d0', 0.8); world.game.toast('성녀의 기적 — 죽음을 거부했다!', '#fff2b0');
        return true;
      }
      this.hp = 0; this.die(world);
    }
    return true;
  }
  heal(amount, showText = true) {
    if (amount > 0) amount *= this.world?.gimmick?.healMul?.() ?? 1;   // [hook:gimmick] 역병: 회복량 감소
    const before = this.hp;
    this.hp = Math.min(this.stats.hp, this.hp + amount);
    const got = Math.round(this.hp - before);
    if (got > 0 && showText) this.world.fx.text(this.cx, this.y - 10, '+' + got, { color: '#7ee07e', size: 20 });
    return got;
  }
  die(world) {
    this.mount?.dismount(world, this, 'death');   // [hook:cmp]
    resetMoveFeel?.(this, world);   // [hook:feel]
    this.dead = true; this.deathT = 0;
    this.vx = -this.facing * 200; this.vy = -500;
    audio.sfx('death');
    world.game.flash('#ff0020', 0.5, 2);
    world.camera.shake(8, 0.4);
    world.slowmo = 0.8;
    bus.emit('playerDied', {});
  }
  updateDeath(dt, world) {
    this.deathT += dt;
    this.setAnim('death');
    moveBody(this, dt, world.map, world.platforms);
    this.vx *= 0.95;
    if (this.deathT > 2.0 && !this.deathHandled) { this.deathHandled = true; world.onPlayerDeath(); }
  }

  // ── 애니메이션 ──
  setAnim(a) { if (this.anim !== a) { this.anim = a; this.animT = 0; } }
  updateAnim(dt, world, ax) {
    if (this.flipT > 0) this.flipT -= dt;
    if (this.landT > 0) this.landT -= dt;
    if (this.throwT > 0) this.throwT -= dt;
    if (this.castT > 0) this.castT -= dt;
    if (this.muzzleT > 0) this.muzzleT -= dt;
    if (this.mount?.riding) {   // [hook:cmp] 탑승: 탈것 애니메이션 + 기수 자세 (공격·투척·시전 중엔 그 자세 유지)
      this.mount.updateAnim(dt, world, this);   // [hook:cmp]
      if (!this.move && !(this.throwT > 0) && !(this.castT > 0)) this.setAnim(this.mount.riderAnim(this));   // [hook:cmp]
      return;
    }
    // 이동 손맛 우선순위 (FEEL-MOVE): move > throw > cast > dash > air > land_heavy > skid > pivot > crouch > charge > run_start > walk/run/sprint > land > idle
    // 발소리는 걸음 위상(p.gaitPh)의 발 접지 순간에 feel_move.js 가 낸다 (예전 stepT 타이머 블록은 없앴다)
    if (this.move) { this.setAnim(this.move.anim); return; }
    if (this.throwT > 0) { this.setAnim('throw'); return; }
    if (this.castT > 0) { this.setAnim('cast'); return; }
    if (this.dashT > 0) { this.setAnim('dash'); return; }
    if (!this.onGround) {
      if (this.wallSlide) this.setAnim('wall');
      else if (this.flipT > 0) this.setAnim('flip');
      else this.setAnim(this.vy < 0 ? 'jump' : 'fall');
      return;
    }
    const mfx = this.moveFx;   // [hook:feel]
    if (mfx === 'land_heavy' || mfx === 'skid' || mfx === 'pivot') { this.setAnim(mfx); return; }   // [hook:feel]
    if (this.crouch) { this.setAnim('crouch'); return; }
    if (this.charging > 0.1) { this.setAnim('charge'); return; }
    if (mfx === 'run_start') { this.setAnim('run_start'); return; }   // [hook:feel]
    if (Math.abs(this.vx) > 30) { this.setAnim(this.gait === 'sprint' ? 'sprint' : this.gait === 'walk' ? 'walk' : 'run'); return; }   // [hook:feel]
    this.setAnim(this.landT > 0 ? 'land' : 'idle');
  }

  ghostTrail(world, color = '#8ac8ff', life = 0.22) {
    if (this.mount?.riding) return this.mount.ghost(world, this, color);   // [hook:cmp] 기수+탈것 잔상
    const snap = this.snapshot();
    world.fx.ghost((ctx, a) => drawHero(ctx, snap, world, { alpha: a, tint: color }), life);   // [hook:feel] 대시 잔상 수명 (feel_move DASH_FX.ghostLife)
  }
  snapshot() {
    const rv = this.mount?.riding ? this.mount.riderView?.(this)?.ride : null;   // [hook:cmp] 탑승 중 스킬 잔상은 안장에 앉은 기수로
    return {
      x: this.x, y: this.y, w: this.w, h: this.h, cx: this.cx, bottom: this.bottom, facing: this.facing,
      anim: this.anim, animT: this.animT, move: this.move, moveT: this.moveT, look: this.look, ch: this.ch,
      vx: this.vx, vy: this.vy, onGround: this.onGround, rig: null, t: this.t, stats: this.stats, snapshot: true,
      gaitPh: this.gaitPh, gait: this.gait, feel: this.feel ? { sq: this.feel.sq } : null,   // [hook:feel] 걸음 위상·찌그러짐
      ride: rv ? { ...rv } : null,   // [hook:cmp]
    };
  }

  lights(L) {
    this.mount?.lights(L, this);   // [hook:cmp]
    L.add(this.cx, this.cy - 10, 320, '#ffe0c0', 0.85, false);
    const aura = this.look?.aura;
    if (aura) L.add(this.cx, this.cy, 110, aura.color, 0.5);
    if (this.buffs.holyaura) L.add(this.cx, this.cy, 180, '#fff2b0', 0.8);
    if (this.buffs.rage) L.add(this.cx, this.cy, 100, '#ff3020', 0.6);
    if ((this.stats.weaponLevel ?? 0) >= 10) L.add(this.cx + this.facing * 30, this.cy - 10, 80, '#ff8a3a', 0.5);
  }

  draw(ctx, world) {
    if (this.iframes > 0 && !this.dead && Math.floor(this.iframes * 20) % 2 === 0) return;
    if (this.mount?.riding) {   // [hook:cmp] 탈것 뒤층 → 기수 → 탈것 앞층
      this.mount.draw(ctx, world, this, 'back');   // [hook:cmp]
      drawHero(ctx, this.mount.riderView(this), world, {});   // [hook:cmp]
      this.mount.draw(ctx, world, this, 'front');   // [hook:cmp]
    } else drawHero(ctx, this, world, {});
    if (this.buffs.invincible) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `hsla(${(world.time * 400) % 360},90%,65%,0.8)`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(this.cx, this.cy, this.w, this.h * 0.65, 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (this.buffs.holyaura) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,240,180,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, 100 + Math.sin(world.time * 6) * 6, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }
}
