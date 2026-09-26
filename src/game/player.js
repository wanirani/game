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
import { computeStats, composeLook } from './stats.js';
import { playerStrike } from './combat.js';
import { castSkill, castUltimate, castTechnique, SKILL_IMPL } from './skills.js';
import { SKILLS } from '../data/skills.js';
import { DOCS } from '../data/lore.js';
import { drawHero } from '../render/hero.js';
import { Hitbox } from './projectiles.js';

const COYOTE = 0.1, JUMP_BUF = 0.13, ATK_BUF = 0.16;

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
    this.stepT = 0;
  }

  // ── 능력치 ──
  refreshStats() {
    this.stats = computeStats(this.state, this.hero);
    this.look = composeLook(this.state, this.hero);
    const b = this.buffs;
    if (b.whipup) this.stats.reach = (this.stats.reach ?? 0) + 25;
    this.moveSet = MOVESETS[this.stats.weaponType] || MOVESETS[this.ch.weaponType];
    if (this.hp > this.stats.hp) this.hp = this.stats.hp;
    if (this.mp > this.stats.mp) this.mp = this.stats.mp;
  }
  get run() { return this.world.run; }
  get invuln() {
    return this.iframes > 0 || this.buffs.invincible > 0 || (this.dashT > 0 && this.dashInvuln) || this.dead || this.world.cutscene;
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
    if (this.crouch) return { x: this.x + 3, y: this.y + this.h * 0.4, w: this.w - 6, h: this.h * 0.6 };
    return { x: this.x + 3, y: this.y + 6, w: this.w - 6, h: this.h - 6 };
  }
  maxAirJumps() { return (this.ch.move.airJumps ?? 1) + (this.stats.airJumps ?? 0); }

  // ── 메인 업데이트 ──
  update(dt, world) {
    this.t += dt; this.animT += dt;
    if (this.dead) { this.updateDeath(dt, world); return; }
    const inp = world.cutscene || world.inputLock ? null : input;
    this.tickTimers(dt, world);
    const onGround = this.onGround;
    if (onGround) { this.coyote = COYOTE; this.airJumpsLeft = this.maxAirJumps(); this.airDashUsed = false; }
    else this.coyote -= dt;

    // 피격 경직
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      this.physics(dt, world);
      this.setAnim('hurt');
      return;
    }

    const ax = inp ? input.axisX : 0;
    const down = inp && input.down('down');
    const up = inp && input.down('up');
    this.crouch = onGround && down && !this.move && this.dashT <= 0;

    // ── 대시 ──
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.facing * this.dashSpeed;
      this.vy = this.dashAir ? 0 : this.vy;
      if (Math.floor(this.t * 40) % 2 === 0) this.ghostTrail(world, this.ch.move.dash === 'mist' ? '#b0103a' : '#8ac8ff');
      if (this.dashT <= 0) { this.vx *= 0.5; }
    } else if (inp && input.pressed('dash') && this.dashCool <= 0 && (onGround || !this.airDashUsed) && !this.moveLocked()) {
      this.startDash(ax, world);
    }

    // ── 공격 입력 ──
    if (inp) this.handleAttackInput(dt, world, { ax, up, down });

    // ── 이동 ──
    const moving = this.move && !this.move.canMove;
    if (this.dashT <= 0) {
      const maxSp = this.ch.move.speed * this.speedMul;
      if (!moving && !this.crouch) {
        if (ax !== 0) {
          const acc = onGround ? 3200 : 2200;
          this.vx = approach(this.vx, ax * maxSp, acc * dt);
          if (!this.move) this.facing = ax;
        } else {
          this.vx = approach(this.vx, 0, (onGround ? 3600 : 900) * dt);
        }
      } else {
        // 공격 중: 전진(lunge) 감속
        this.vx = approach(this.vx, 0, (onGround ? 2600 : 500) * dt);
      }
    }

    // ── 점프 ──
    if (inp) this.handleJump(dt, world, { down, ax });

    // 공중 공격 체공
    this.gravity = 1;
    if (this.move?.airStall && !onGround && this.moveT < this.move.dur * this.move.airStall && this.vy > -50) {
      this.gravity = 0.25; if (this.vy > 120) this.vy = 120;
    }
    if (this.dashT > 0 && this.dashAir) this.gravity = 0;
    // 벽 미끄러짐 (벽차기 가능 캐릭터)
    this.wallSlide = 0;
    if (this.ch.move.wallJump && !onGround && this.hitWallDir && ax === this.hitWallDir && this.vy > 0) {
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
    for (const k in this.skillCd) if (this.skillCd[k] > 0) this.skillCd[k] -= dt * (1 + (s.cdr ?? 0) / 100);
    // 버프 시간
    for (const k in this.buffs) {
      if (this.buffs[k] > 0 && this.buffs[k] < 9000) {
        this.buffs[k] -= dt;
        if (this.buffs[k] <= 0) { delete this.buffs[k]; this.game.toast(`${POWERUPS[k]?.name ?? k} 효과 종료`, '#9d8f80', 1.4); }
      }
    }
    // 재생
    if (this.hp < s.hp && s.hpRegen > 0) this.hp = Math.min(s.hp, this.hp + s.hpRegen * dt);
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
    const vxBefore = this.vx;
    moveBody(this, dt, world.map, world.platforms);
    this.hitWallDir = this.hitWall;
    if (this.landed) {
      this.landT = 0.12;
      world.fx.burst('dust', this.cx, this.bottom, 6, { angle: -Math.PI / 2, spread: 1.4, speed: 80 });
      audio.sfx('land', { vol: 0.4 });
      if (this.move?.groundPound) this.groundPound(world, this.move.groundPound);
      if (this.move && (this.move.id?.endsWith('Down') || this.move.anim === 'plunge' || this.move.anim === 'dive_kick')) { this.endMove(); }
    }
    this.dropThrough = false;
    // 가시
    if (touchesType(this, world.map, T.SPIKE, 6) && !this.invuln) {
      this.takeHit(Math.ceil(this.stats.hp * 0.12), { team: 'enemy', dir: -this.facing, kb: [200, -520], flat: 1 }, world, {});
    }
    // 액체
    const inLiquid = touchesType(this, world.map, T.LIQUID, 10);
    if (inLiquid) {
      const liq = world.stage.liquid ?? 'water';
      if (!this.inLiquid) { world.fx.burst('water', this.cx, this.bottom - 10, 12); audio.sfx('splash'); }
      if (liq === 'lava' || liq === 'poison' || liq === 'blood') {
        if (!this.invuln) this.takeHit(Math.ceil(this.stats.hp * 0.1), { team: 'enemy', dir: -this.facing, kb: [0, -720], flat: 1, element: liq === 'lava' ? 'fire' : null }, world, {});
      } else {
        this.vx *= 0.9; if (this.vy > 180) this.vy = 180;
      }
    }
    this.inLiquid = inLiquid;
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
  }

  handleJump(dt, world, { down, ax }) {
    const onGround = this.onGround;
    if (input.buffered('jump', JUMP_BUF)) {
      if (onGround && down && this.onOneWay(world)) {
        this.dropThrough = true; this.y += 2; input.consume('jump');
      } else if (onGround || this.coyote > 0) {
        this.doJump(world, false); input.consume('jump');
      } else if (this.wallSlide || (this.ch.move.wallJump && this.hitWallDir && !onGround)) {
        const dir = -(this.wallSlide || this.hitWallDir);
        this.vx = dir * 420; this.facing = dir;
        this.vy = -this.jumpVel() * 0.92; this.jumpCut = true;
        this.airJumpsLeft = Math.max(this.airJumpsLeft, 1);
        audio.sfx('jump'); input.consume('jump');
        world.fx.burst('dust', this.cx - dir * 14, this.cy, 8, { speed: 90 });
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
    // 필살기
    if (input.pressed('ult') && this.run.sp >= 100) { castUltimate(this, world); return; }
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
    if (!input.buffered('attack', ATK_BUF)) return;
    // 비전서 커맨드 기술
    for (const d of this.state.progress?.docs || []) {
      const tech = DOCS[d]?.tech;
      if (tech?.cmd && input.command(tech.cmd, this.facing, tech.window ?? 0.6)) {
        input.consume('attack');
        if (castTechnique(this, world, tech)) return;
      }
    }
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
    if (this.dashT > 0 && ms.dash) { this.dashT = 0; this.startMove(world, ms.dash, 'dash'); return; }
    if (!this.onGround) {
      if (down && ms.down) { this.startMove(world, ms.down, 'down'); return; }
      if (up && ms.up && !this.usedAirUp) { this.usedAirUp = true; this.startMove(world, ms.up, 'up'); return; }
      const idx = this.lastAirChain !== undefined && this.t - this.lastAirT < 0.5 ? Math.min(this.lastAirChain + 1, ms.air.length - 1) : 0;
      this.chain = idx; this.startMove(world, ms.air[idx], 'air'); return;
    }
    this.usedAirUp = false;
    if (up && ms.up) { this.startMove(world, ms.up, 'up'); return; }
    if (down && ms.crouch) { this.startMove(world, ms.crouch, 'crouch'); return; }
    this.chain = 0;
    this.startMove(world, ms.ground[0], 'ground');
  }

  startMove(world, mv, kind) {
    if (!mv) return;
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
      const w = b.w * (b.x >= 0 ? reach : 1), x = b.x;
      const rect = this.relRect(x, b.y, w, b.h);
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
      hitId: this.curHitId, launch: !!mv.launch, stun: mv.stun, mult: this.dmgMul, tags: ['melee'], crit: 0, ...extra,
    };
  }

  fireMoveProjectiles(world, mv) {
    const P = mv.proj;
    this.shotsFired++;
    const n = P.count ?? 1;
    const base = P.angle !== undefined ? (this.facing > 0 ? P.angle : Math.PI - P.angle) : (this.facing > 0 ? 0 : Math.PI);
    const ox = this.cx + this.facing * (P.offX ?? 30), oy = this.bottom + (P.offY ?? -60);
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
      fx.slash(this.cx + this.facing * 10, this.bottom - 58, ang, { radius: s.r * reach, arc: s.arc, width: s.width, color: col, life: mv.finisher ? 0.2 : 0.13 });
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
    this.hp -= dmg;
    this.iframes = 1.1;
    this.hurtT = 0.28;
    this.endMove(); this.dashT = 0; this.charging = 0; this.holdT = 0;
    const dir = attack.dir || (Math.sign(this.cx - (attack.owner?.cx ?? this.cx)) || -this.facing);
    const kb = attack.kb || [240, -360];
    this.vx = dir * Math.max(180, Math.abs(kb[0]));
    this.vy = Math.min(-280, kb[1]);
    this.onGround = false;
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
    const before = this.hp;
    this.hp = Math.min(this.stats.hp, this.hp + amount);
    const got = Math.round(this.hp - before);
    if (got > 0 && showText) this.world.fx.text(this.cx, this.y - 10, '+' + got, { color: '#7ee07e', size: 20 });
    return got;
  }
  die(world) {
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
    if (this.crouch) { this.setAnim('crouch'); return; }
    if (this.charging > 0.1) { this.setAnim('charge'); return; }
    if (Math.abs(this.vx) > 30) {
      this.setAnim('run');
      this.stepT -= dt * Math.abs(this.vx) / 250;
      if (this.stepT <= 0) { this.stepT = 0.32; audio.sfx('footstep', { vol: 0.18, pitch: rand(0.9, 1.1) }); if (Math.random() < 0.5) world.fx.emit('dust', this.cx - this.facing * 8, this.bottom, { speed: 30, size: 5 }); }
      return;
    }
    this.setAnim(this.landT > 0 ? 'land' : 'idle');
  }

  ghostTrail(world, color = '#8ac8ff') {
    const snap = this.snapshot();
    world.fx.ghost((ctx, a) => drawHero(ctx, snap, world, { alpha: a, tint: color }), 0.22);
  }
  snapshot() {
    return {
      x: this.x, y: this.y, w: this.w, h: this.h, cx: this.cx, bottom: this.bottom, facing: this.facing,
      anim: this.anim, animT: this.animT, move: this.move, moveT: this.moveT, look: this.look, ch: this.ch,
      vx: this.vx, vy: this.vy, onGround: this.onGround, rig: null, t: this.t, stats: this.stats, snapshot: true,
    };
  }

  lights(L) {
    L.add(this.cx, this.cy - 10, 320, '#ffe0c0', 0.85, false);
    const aura = this.look?.aura;
    if (aura) L.add(this.cx, this.cy, 110, aura.color, 0.5);
    if (this.buffs.holyaura) L.add(this.cx, this.cy, 180, '#fff2b0', 0.8);
    if (this.buffs.rage) L.add(this.cx, this.cy, 100, '#ff3020', 0.6);
    if ((this.stats.weaponLevel ?? 0) >= 10) L.add(this.cx + this.facing * 30, this.cy - 10, 80, '#ff8a3a', 0.5);
  }

  draw(ctx, world) {
    if (this.iframes > 0 && !this.dead && Math.floor(this.iframes * 20) % 2 === 0) return;
    drawHero(ctx, this, world, {});
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
