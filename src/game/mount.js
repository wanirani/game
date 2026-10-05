// 탈것 런타임 — owner: CMP-MOUNT (companions §3 전체 · §11.4 riderView · §12.4; world2 §14; MASTER_PLAN §1.2 · §1.7 · §1.14)
//
//  class MountRider                    player.mount (CompanionSystem.sync 가 new MountRider(system, id, MOUNTS[id]) 로 붙인다)
//  class MountGhost extends Entity     잠깐 보이는 탈것 (소환 안개 · 하차 소멸 · 낙마 후 도주 · 필살기 대기)
//  DISMOUNT_SKILLS                     탈것에서 내린 뒤 시전하는 스킬 (skills.js 에서 p.x/p.y/p.hidden 을 쓰거나 p.vy 를 -9xx 이하로 쏘는 것)
//  fits(world|map, x, bottom, w, h)    AABB 가 SOLID/BREAK 타일과 겹치지 않는가 (x = 왼쪽, bottom = 발)
//  findMountSpot(world, p, def|{w,h}, {cx, bottom}?) → {x, y, cx, bottom, dx} | null   발 중앙을 지키며 옆으로 최대 32px 밀어 본다
//
// ── 상태 (companions §3.1) ─────────────────────────────────────────────────────────────────
//  stowed ─R(맞는 자리)→ summoning (0.45초, 무적; 0.25초에 안장에 앉는다 = riding true) → riding
//  riding ─R→ dismounting (0.30초) → stowed (재소환 2초)      riding ─탈것 HP 0→ recall (def.recall × cdMul, MountGhost 가 달아난다)
//  riding ─필살기·각성기→ 'ult' (1.4초 뒤 땅 위·맞는 자리면 자동 재탑승, 대기 없음)   DISMOUNT_SKILLS → 'ult' (1.2초)
//  riding ─구덩이→ recall · 죽음→ stowed(cd 0) · 방 이동에 자리가 없음/강제→ stowed(cd 0) · 깊은 물→ stowed · noMount 보스→ stowed
//  riding 은 '안장에 앉아 있다' 뜻 (summoning 0.25초 뒤부터, dismounting 부터는 false). 몸 교체는 발 중앙을 지킨다.
//
// ── player.js 가 부르는 것 (MASTER_PLAN §1.7; riding 일 때만 부르는 것은 ◇) ─────────────────
//  tick(dt, world, p, inp)            매 업데이트 (소환/하차 입력 'mount' · 돌진 버퍼 · 타이머 · 비행 조작 · 자동 재탑승 · 특수기 진행)
//  ◇profile(p) → {speed, accel, decel, airAccel, airDecel, jump, airJumps, wallJump}   (바람 기믹도 부른다: 부작용 없음)
//  ◇handleJump(world, p, dt) → true   탑승 중 점프는 모두 여기서 (지상·코요테·벽 차기·공중 점프·날갯짓·이륙·급강하·헤엄·발판 내려가기·가변 점프)
//  ◇tryCharge(world, p, ax, ay) · ◇updateCharge(dt, world, p) · ◇trySpecial(world, p) → bool (재사용 대기면 false → 일반 공격)
//  ◇adaptMove(mv) · ◇riderLift() → {dx, dy} · afterPhysics(dt, world, p, vyBefore) · ◇hazard(kind, p, world) → true = 처리함
//  dismount(world, p, reason) · ◇rideStats() · refresh(p) · ◇hurtbox(p) · ◇updateAnim · ◇riderAnim(p) · ◇riderView(p)
//  ◇draw(ctx, world, p, 'back'|'front') · lights(L, p) · ◇ghost(world, p, color) · healFrac(frac) · beforeCast(world, p, id)
//  필드: id · riding · chargeT · invulnT · state · hp · maxHp · cd · cdMax · stamina · staminaMax
// ── CompanionSystem (companions.js, CMP-SYS) 가 부르는 것 ──────────────────────────────────
//  attach(world, p) · detach(world, p) · onRoomLoaded(world, p, roomId) · onRespawn(world, p) · onBossStart(world, p, boss)
//  onBossDefeated(world, p, boss) · incoming(p, dmg, attack, world) → {dmg, mounted, noStagger, cancel} · summon(world, p, {force, instant})
//  knockOff(world, p, reason) · hudInfo() → {state, hp, maxHp, cd, cdMax, riding, stamina, staminaMax}
//  (탈것 경험치·유대는 CompanionSystem 이 준다. 여기서는 주지 않는다.)
//
// ── 그림 (CMP-MOUNT-ART-A/B: src/render/mount_rig.js · mounts.js) ─────────────────────────
//  이 파일은 매 프레임 한 번 RIG.mountPose(m, dt) 를 부르고 (afterPhysics), RIG.seatOf(pose, out) 로 안장점(월드 좌표)을 얻는다.
//  그 다음 player.draw 가 draw(ctx, world, p, layer) → MDRAW.drawMount(ctx, m, world, layer, opts) 를 부른다.
//  m (MountRider · MountGhost · 잔상 스냅숏 모두 같은 모양) 에서 읽을 수 있는 필드:
//   id, def, rig(def.rig), variant, state, anim, animT, t, cx, bottom (발 중앙, 월드), facing(±1), vx, vy, onGround,
//   speedK(|vx| / 기본 속도), gait('idle'|'walk'|'run'|'charge'|'air'|'rear'|'swim'|'fly'), phase(보폭 위상 0..1), skid(bool),
//   pitch(뒷발 축 몸 기울기, 앞들기 = 음수), rearK(0..1 앞들기 정도), duck(0..1), lean, bob, wingK(0..1 날개 펼침), flapT,
//   inWater, gliding, flying, diving, stamina, staminaMax, flashT(>0 = 피격 번쩍임), alpha, awakened(유대 4단계), rank, lv, pose(마지막 포즈)
//  opts = { alpha, tint, scale, noFx, flash }. mountPose 가 null 을 돌려주면 (스텁) 이 파일의 간단한 절차적 그림(drawFallback)으로 그린다.
//
// ── 2부 탈것 레지스트리 (mount_b.js, CMP-MOUNT-B) ───────────────────────────────────────
//  MOUNT_B[id] = {
//    charge?:  { start?(r, world, p, dir) → false 면 거절, tick?(r, world, p, dt), end?(r, world, p, why) }   기본 돌진(데이터 dur·speed·dir8·trail·heal)에 덧붙인다
//    special?: (r, world, p) → bool   또는 { start(r, world, p) → bool }   (↓+공격; true = 시전함 → 재사용 대기는 여기서 건다)
//    passive?: { tick?(r, world, p, dt), hazard?(r, kind, p, world) → true|false|undefined, land?(r, world, p, vyBefore) }
//  }
//  메뉴 미리보기: mountView(id, {anim, facing}) · updateMountView(v, dt, anim) · drawMountView(ctx, v, layer, opts) — v.ride 는 drawHero 의 p.ride
//  도우미 (r = MountRider): r.atk(o) → 공격 객체 · r.strike(world, rect, atk) → 맞힌 수 · r.hit(world, o) → Hitbox · r.startAct(o) · r.showName(world, p, name)
//   r.rect(p, rx, ry, rw, rh) (발 중앙 기준, 앞쪽 facing) · r.power(mv) (특수기 배율 반영) · r.d (mountDerived) · r.world
//  mount_b.js 는 이 파일을 import 해도 되지만 모듈 최상위에서 그 값을 쓰면 안 된다 (순환 import 규칙).
import { Entity } from './entity.js';
import { TILE } from '../core/game.js';
import { T, isSolidType, touchesType, moveBody, GRAVITY } from '../core/physics.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { clamp, lerp, approach, rand, TAU, shade } from '../core/math.js';
import { playerStrike } from './combat.js';
import { Hitbox } from './projectiles.js';
import { drawHero } from '../render/hero.js';
import * as RIG from '../render/mount_rig.js';
import * as MDRAW from '../render/mounts.js';
import * as MB from './mount_b.js';
import * as ACMP from '../core/audio_companions.js';
import { MOUNTS, MOUNT_RULES, CMP_TEXT, DISMOUNT_NOTE, cmpText } from '../data/companions.js';
import { mountDerived, mountRideStats } from './companion_state.js';

const ZERO = Object.freeze({ dx: 0, dy: 0 });
/**
 * 탈것에서 내린 뒤 시전하는 스킬 (companions §3.6.4). skills.js 를 grep 해서 만든 목록:
 *   p.x = / p.y = / p.hidden = → lia_shadow_step (그림자 걸음, 순간이동)   (ULTS.* 는 필살기라 따로 'ult' 로 내린다)
 *   p.vy = -9xx / -1xxx 발사 → bran_warlord_leap (전장 도약, -1050) · isolde_dragon_dive (용추락, 땅에서 -1020)   (ULTS.bran -1150 도 필살기)
 * tools/test_mount.mjs 가 skills.js · skills_p2.js 를 다시 grep 해서 이 목록과 맞는지 확인한다.
 */
export const DISMOUNT_SKILLS = ['bran_warlord_leap', 'lia_shadow_step', 'isolde_dragon_dive'];

const R = () => MOUNT_RULES;          // 데이터는 호출 시점에 읽는다 (순환 import 규칙)
const NUDGE = [0, -8, 8, -16, 16, -24, 24, -32, 32];
const LIQ_HAZ = new Set(['lava', 'poison', 'blood']);
const SUMMON_HOP = -260;
const REMOUNT_GIVEUP = 8;             // 자동 재탑승을 기다리는 최대 시간(초)
const PENDING_T = 0.4;                // 공중·동작 중에 누른 소환을 기억하는 시간
const bufWin = (world, base) => base + Math.min(0.3, world?.frozenRecent ?? 0);
let SEQ = 0;
const WARNED = new Set();
function warnOnce(key, ...a) { if (WARNED.has(key)) return; WARNED.add(key); try { console.warn(...a); } catch { /* 무시 */ } }
const q = (world) => world?.fx?.quality ?? 1;
const nq = (world, n) => Math.max(1, Math.round(n * q(world)));

// ───────────────────────── 자리 판정 (companions §3.2) ─────────────────────────
/** AABB (x = 왼쪽, bottom = 발) 가 SOLID/BREAK 타일과 겹치지 않으면 true. world 대신 map 을 줘도 된다 */
export function fits(world, x, bottom, w, h) {
  const map = world?.map ?? world;
  if (!map?.typeAt || !Number.isFinite(x) || !Number.isFinite(bottom)) return false;
  const y = bottom - h;
  const l = Math.floor(x / TILE), r = Math.floor((x + w - 0.01) / TILE);
  const t = Math.floor(y / TILE), b = Math.floor((bottom - 0.01) / TILE);
  for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) if (isSolidType(map.typeAt(tx, ty))) return false;
  return true;
}
/** 발 중앙(cx, bottom)을 지키며 옆으로 0, ∓8 … ∓32px 밀어 탈것 몸이 들어갈 자리를 찾는다. 없으면 null */
export function findMountSpot(world, p, def, o = {}) {
  const body = def?.body ?? def ?? {};
  const W = body.w ?? 60, H = body.h ?? 90;
  const cx = o.cx ?? p?.cx, bottom = o.bottom ?? p?.bottom;
  if (!Number.isFinite(cx) || !Number.isFinite(bottom)) return null;
  for (const dx of NUDGE) {
    const x = cx + dx - W / 2;
    if (fits(world, x, bottom, W, H)) return { x, y: bottom - H, cx: cx + dx, bottom, dx };
  }
  return null;
}

// ───────────────────────── 탈것 기수 ─────────────────────────
export class MountRider {
  constructor(system, id, def) {
    this.system = system ?? null;
    this.id = id ?? null;
    this.def = def ?? (id && Object.hasOwn(MOUNTS, id) ? MOUNTS[id] : null);
    const d = this.def ?? {};
    this.rig = d.rig ?? 'horse'; this.variant = d.variant ?? null;
    this.world = null; this.state = 'stowed'; this.stT = 0; this.seated = false;
    this.cd = 0; this.cdMax = 0;
    this.chargeT = 0; this.chargeCd = 0; this.chargeDir = { x: 1, y: 0 }; this.chargeKind = null; this.chargeAtk = null;
    this.chargeGhostT = 0; this.chargeTrailX = null; this.chargeHitSum = 0; this.chargeNameT = -99; this._chgPress = -1;
    this.specialCd = 0; this.specialCdMax = 0; this.act = null;
    this.invulnT = 0; this.hazardT = 0; this.flashT = 0; this.hurtT = 0; this.staggerT = 0; this.turnT = 0; this.landT = 0; this.flapT = 0;
    this.hp = 1; this.maxHp = 1; this.d = null; this.lastCryT = -9;
    const fl = d.flight ?? null;
    this.stamina = fl?.type === 'fly' ? fl.stamina : null; this.staminaMax = this.stamina;
    this.flaps = fl?.type === 'glide' ? fl.flaps : 0; this.airJumps = d.move?.airJumps ?? 0;
    this.gliding = false; this.flying = false; this.diving = false; this.inWater = false; this._wet = false; this.splashT = 0;
    this.duck = 0; this.ax = 0; this.lastFacing = 1;
    this.gallopT = 0; this.galloping = false; this.phase = 0; this.lineT = 0; this.skid = false;
    this.anim = 'idle'; this.animT = 0; this.t = 0; this.gait = 'idle';
    this.cx = 0; this.bottom = 0; this.facing = 1; this.vx = 0; this.vy = 0; this.onGround = true; this.speedK = 0;
    this.pitch = 0; this.rearK = 0; this.bob = 0; this.lean = 0; this.wingK = 0; this.alpha = 1;
    this.pose = null; this.fallback = true; this.seatPt = { x: 0, y: 0, lean: 0 };
    this.remountT = 0; this.remountWait = 0; this.pendingT = 0; this.roarT = 0; this.knockFix = null;
    this.ownMaxFall = false; this.summonGhost = null; this.rank = 0; this.lv = 1; this.awakened = false;
    this.rideO = { sx: 0, sy: 0, lean: 0, duck: 0, footY: d.footY ?? 20, legs: d.legs ?? 'straddle', reins: true, gait: 'idle', phase: 0 };
    this._prof = { speed: 0, accel: 0, decel: 0, airAccel: 0, airDecel: 0, jump: 0, airJumps: 0, wallJump: false };
    this._lift = { dx: 0, dy: 0 }; this._hb = { x: 0, y: 0, w: 0, h: 0 }; this._view = null; this._ride = {};
  }
  get riding() { return this.seated; }
  get name() { return this.def?.name ?? ''; }
  get B() { return MB.MOUNT_B?.[this.id] ?? null; }
  get runStore() {
    const run = this.world?.run;
    if (!run) return null;
    if (!run.mount || typeof run.mount !== 'object') run.mount = {};
    const s = run.mount;
    s.hp ??= {}; s.cds ??= {}; s.lastStand ??= false; s.greeted ??= false;
    return s;
  }

  // ───────────── 붙이기 · 떼기 · 능력치 ─────────────
  attach(world, p) {
    this.world = world;
    // 채색 탈것 굽기(130–310 ms)를 첫 소환 전에 시작한다 (첫 소환 안개에서 벡터 → 채색으로 튀지 않게 — R1-REQ-308). 한 번만
    if (!this.preloaded) {
      this.preloaded = true;
      try { const pr = MDRAW.preloadMounts?.([this.id], world?.game ?? undefined); pr?.catch?.(() => {}); } catch { /* 첫 그리기 때 굽는다 */ }
    }
    this.refresh(p);
    const s = this.runStore;
    if (s) {
      const hp = s.hp[this.id];
      this.hp = Number.isFinite(hp) ? clamp(hp, 0, this.maxHp) : this.maxHp;
      const until = s.cds[this.id];
      if (Number.isFinite(until) && until > (world.time ?? 0)) { this.state = 'recall'; this.cd = until - world.time; this.cdMax = Math.max(this.cd, this.d?.recall ?? 0); }
    } else this.hp = this.maxHp;
    this.syncFrom(p);
  }
  detach(world, p) {
    if (this.seated) this.unseat(world ?? this.world, p);
    this.clearGhosts();
    this.store();
  }
  store() {
    const s = this.runStore;
    if (!s) return;
    s.hp[this.id] = this.hp;
    if (this.state === 'recall' && this.cd > 0) s.cds[this.id] = (this.world?.time ?? 0) + this.cd; else delete s.cds[this.id];
  }
  /** Player.refreshStats() 끝에서 불린다: 파생 수치 (체력·속도·공격 위력·재사용 대기) 다시 계산 */
  refresh(p) {
    const st = p?.state ?? this.world?.state;
    let d = null;
    try { d = mountDerived(st, this.id, p?.stats); } catch (e) { warnOnce('derived', '[mount] mountDerived', e); }
    if (!d) return;
    this.d = d; this.rank = d.rank ?? 0; this.lv = d.lv ?? 1; this.awakened = !!d.awakened;
    const old = this.maxHp;
    this.maxHp = Math.max(1, d.maxHp);
    if (old > 1 && this.maxHp > old) this.hp += this.maxHp - old;
    this.hp = clamp(this.hp, 0, this.maxHp);
    this.specialCdMax = d.specialCd ?? this.def?.special?.cd ?? 5;
  }
  /** 탑승 보너스 (유대 2단계 ×1.5) + 서리 포효 공격 속도 */
  rideStats() {
    const st = this.world?.state ?? this.system?.world?.state;
    let s = {};
    try { s = mountRideStats(st, this.id) ?? {}; } catch { s = { ...(this.def?.ride ?? {}) }; }
    if (this.roarT > 0) { const b = this.def?.special?.buff; if (b?.atkSpd) s.atkSpd = (s.atkSpd ?? 0) + b.atkSpd; }
    return s;
  }
  healFrac(frac) {
    const f = Number.isFinite(frac) ? frac : 1;
    if (f <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * f);
  }
  hudInfo() {
    const st = this.state === 'dismounting' ? 'stowed' : this.state;
    return { state: st, hp: this.hp, maxHp: this.maxHp, cd: Math.max(0, this.cd), cdMax: this.cdMax, riding: this.seated,
      stamina: this.stamina, staminaMax: this.staminaMax };
  }

  // ───────────── 방 · 부활 · 보스 ─────────────
  onRoomLoaded(world, p, roomId) {
    this.world = world;
    this.summonGhost = null; this.act = null; this.chargeT = 0; this.chargeAtk = null;
    // 앉기 전에 방이 바뀌면 소환을 새 방에서 이어서 부른다 (누른 입력이 사라지지 않게)
    if (this.state === 'summoning' && !this.seated) { this.state = 'stowed'; this.stT = 0; this.pendingT = PENDING_T; }
    if (this.seated) {
      const spot = findMountSpot(world, p, this.def);
      if (spot) { p.cx = spot.cx; p.bottom = spot.bottom; }
      else {
        this.unseat(world, p);
        this.state = 'stowed'; this.cd = 0;
        this.note(world, DISMOUNT_NOTE.room ?? CMP_TEXT.forced);
        bus.emit('dismounted', { id: this.id, reason: 'room' });
      }
    }
    this.syncFrom(p);
    void roomId;
  }
  onRespawn(world, p) {
    this.world = world;
    if (this.seated) this.unseat(world, p);
    this.state = 'stowed'; this.cd = 0; this.cdMax = 0; this.remountT = 0; this.pendingT = 0; this.act = null; this.chargeT = 0;
    this.hp = this.maxHp; this.roarT = 0;
    this.clearGhosts();
    this.store();
  }
  onBossStart(world, p, boss) {
    const blocked = !!(world?.companions?.mountBlocked || boss?.def?.noMount);
    if (!blocked) return;
    if (this.seated) this.dismount(world, p, 'boss');
    if (this.state === 'ult' || this.state === 'summoning') { this.state = 'stowed'; this.remountT = 0; }
    this.pendingT = 0;
  }
  onBossDefeated(world, p, boss) { void world; void p; void boss; }

  // ───────────── 매 업데이트 (player.update → tickTimers 바로 뒤) ─────────────
  tick(dt, world, p, inp) {
    this.world = world;
    this.t += dt;
    const dec = (k) => { if (this[k] > 0) this[k] = Math.max(0, this[k] - dt); };
    dec('chargeCd'); dec('specialCd'); dec('invulnT'); dec('hazardT'); dec('flashT'); dec('hurtT'); dec('staggerT'); dec('turnT'); dec('landT'); dec('flapT'); dec('pendingT');
    if (this.roarT > 0) { this.roarT -= dt; if (this.roarT <= 0) { this.roarT = 0; p.refreshStats?.(); } }
    if (this.knockFix) { const k = this.knockFix; this.knockFix = null; p.vx = k.vx; p.vy = Math.min(p.vy, k.vy); p.iframes = Math.max(p.iframes ?? 0, k.iframes); }
    // 타지 않은 동안 체력 회복 3%/초
    if (!this.seated && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * R().regen * dt);
    // 상태 기계
    switch (this.state) {
      case 'summoning':
        this.stT += dt;
        if (!this.seated && this.stT >= R().seatT) { if (!this.seat(world, p)) break; }
        if (this.seated && this.stT >= R().summonT) this.state = 'riding';
        break;
      case 'dismounting':
        this.stT += dt;
        if (this.stT >= R().dismountT) this.state = 'stowed';
        break;
      case 'recall':
      case 'stowed':
        if (this.cd > 0) { this.cd = Math.max(0, this.cd - dt); if (this.cd <= 0 && this.state === 'recall') this.state = 'stowed'; }
        break;
      case 'ult': this.tickRemount(dt, world, p); break;
      default: break;
    }
    // 입력 ('mount' · 'dash' 는 buffered 로: 히트스톱 동안 누른 것도 놓치지 않게 — MASTER_PLAN R16)
    this.ax = inp ? input.axisX : 0;
    if (inp && !world.inputLock && !world.cutscene && !p.dead) {
      const win = bufWin(world, 0.25);
      if (input.buffered('mount', win)) { input.consume('mount'); this.toggle(world, p); }
      else if (this.pendingT > 0 && !this.seated && this.state === 'stowed') this.trySummon(world, p, { quietRetry: true, last: this.pendingT <= dt + 1e-6 });
      if (this.seated && input.buffered('dash', bufWin(world, 0.13)) && this._chgPress !== input.pressTime?.dash) {
        if (this.charge(world, p, input.axisX, input.axisY)) { this._chgPress = input.pressTime?.dash; input.consume('dash'); }
      }
    }
    if (!this.seated) { this.releaseMaxFall(p); return; }
    // 특수기 진행
    if (this.act) this.tickAct(dt, world, p);
    this.flightTick(dt, world, p, inp);
    try { this.B?.passive?.tick?.(this, world, p, dt); } catch (e) { warnOnce('Bp' + this.id, '[mount] MOUNT_B passive', e); }
    const s = this.runStore; if (s) s.hp[this.id] = this.hp;
  }

  // ───────────── 소환 · 하차 ─────────────
  toggle(world, p) {
    if (this.seated) { this.dismount(world, p, 'toggle'); return; }
    // 안장에 앉기 전(소환 0.25초)의 두 번째 누름은 무시한다. 취소→재소환을 되풀이하면 소환 무적(0.45초)이 끝없이 이어지고,
    // 빠른 두 번 누름(터치 두 번 탭)에 소환이 취소되어 버린다
    if (this.state === 'summoning') return;
    this.trySummon(world, p);
  }
  refuse(world, text, sfx = true) {
    if (sfx) audio.sfx('menu_cancel', { vol: 0.4 });
    if (text) this.note(world, text);
    return false;
  }
  note(world, text) {
    if (!text) return;
    if (typeof this.system?.note === 'function') this.system.note(text);
    else world?.game?.toast?.(text, '#c8b8a8', 2);
  }
  /** 'mount' 입력·자동 재탑승·디버그: 탈 수 있으면 소환을 시작한다 */
  trySummon(world, p, { force = false, instant = false, auto = false, quietRetry = false, last = false } = {}) {
    this.world = world;
    if (!p || p.dead || this.seated) return false;
    if (!force && (world.cutscene || world.inputLock)) return false;
    if (this.state === 'summoning' || this.state === 'dismounting') { if (!quietRetry) this.pendingT = PENDING_T; return false; }
    if (!force && this.state === 'recall' && this.cd > 0) { this.pendingT = 0; return this.refuse(world, cmpText('recalling', { name: this.name, n: Math.ceil(this.cd) })); }
    if (!force && this.cd > 0) {
      if (this.cd <= PENDING_T) { this.pendingT = Math.max(this.pendingT, this.cd + 0.05); return false; }
      this.pendingT = 0;
      audio.sfx('menu_cancel', { vol: 0.35 });
      world.fx?.text(p.cx, p.y - 20, CMP_TEXT.cooldown, { size: 14, color: '#9d8f80' });
      return false;
    }
    if (!force && (world.companions?.mountBlocked)) { this.pendingT = 0; return this.refuse(world, CMP_TEXT.bossFear); }
    const deep = world.gimmickOf?.('deep');
    if (deep && (deep.inWater || deep.headUnder)) { this.pendingT = 0; return this.refuse(world, CMP_TEXT.underwater); }
    const flyer = !!this.def?.flight;
    const busy = p.hurtT > 0 || (typeof p.moveLocked === 'function' && p.moveLocked()) || (!flyer && !p.onGround && !force);
    if (busy && !force) {
      // 공중·공격 동작·경직 중에 누른 소환은 0.4초 동안 기억했다가 되는 순간 부른다 (끝까지 안 되면 알려 준다)
      if (!quietRetry) this.pendingT = PENDING_T;
      else if (last) { this.pendingT = 0; this.refuse(world, !flyer && !p.onGround ? '땅을 딛고 있어야 탈것을 부를 수 있다' : null); }
      return false;
    }
    const spot = findMountSpot(world, p, this.def);
    if (!spot) { this.pendingT = 0; return this.refuse(world, CMP_TEXT.noSpot); }
    this.pendingT = 0;
    this.state = 'summoning'; this.stT = 0; this.remountT = 0;
    this.invulnT = Math.max(this.invulnT, R().summonT);
    this.facing = p.facing || 1;
    // 소환 연출: 발밑 핏빛 마법진 두 겹 · 문양 입자 · 붉은 안개 속에서 나타나는 탈것 (MountGhost 'summon')
    const fx = world.fx;
    if (fx) {
      fx.ering?.(p.cx, p.bottom - 2, { color: '#ff3a50', r0: 10, r1: 76, ry: 0.28, life: 0.45, width: 4 });
      fx.ering?.(p.cx, p.bottom - 2, { color: '#ff8a9a', r0: 40, r1: 8, ry: 0.28, life: 0.35, width: 3 });
      fx.burst('magic', p.cx, p.bottom - 8, nq(world, 12), { color: '#ff3a50', speed: 140, angle: -Math.PI / 2, spread: 1.6 });
      fx.burst('bloodmist', p.cx - p.facing * 20, p.bottom - 40, nq(world, 6), { speed: 40 });
    }
    audio.sfx('summon', { vol: auto ? 0.6 : 0.9 });
    if (instant) {
      this.stT = R().seatT;
      if (!this.seat(world, p, spot)) return false;
      this.stT = R().summonT; this.state = 'riding';
      return true;
    }
    if (p.onGround && !flyer) { p.vy = SUMMON_HOP; p.onGround = false; p.jumpCut = true; }
    this.summonGhost = world.add?.(new MountGhost(p.cx, p.bottom, 120, 110, { mode: 'summon', rider: this, p, id: this.id, def: this.def, facing: p.facing })) ?? null;
    return true;
  }
  /** 디버그·?ride=1 (CompanionSystem.debug.summon): 재사용 대기·보스 금지를 무시하고 바로 태운다 */
  summon(world, p, { force = true, instant = true } = {}) { return this.trySummon(world, p, { force, instant }); }
  cancelSummon(world, p) {
    if (this.state !== 'summoning' || this.seated) return;
    this.state = 'stowed'; this.stT = 0;
    if (this.summonGhost) { this.summonGhost.mode = 'fade'; this.summonGhost.t = 0; this.summonGhost = null; }
    void world; void p;
  }
  /** 안장에 앉기: 몸을 탈것 크기로 바꾼다 (발 중앙 유지). 자리가 없으면 소환 취소 */
  seat(world, p, spot = null) {
    const sp = spot ?? findMountSpot(world, p, this.def);
    if (!sp) {
      this.state = 'stowed'; this.stT = 0; this.cd = 0;
      if (this.summonGhost) { this.summonGhost.mode = 'fade'; this.summonGhost.t = 0; this.summonGhost = null; }
      this.refuse(world, CMP_TEXT.noSpot);
      return false;
    }
    const W = this.def?.body?.w ?? 60, H = this.def?.body?.h ?? 90;
    p.w = W; p.h = H; p.cx = sp.cx; p.bottom = sp.bottom;
    this.seated = true;
    p.crouch = false; p.dashT = 0; p.wallSlide = 0; p.charging = 0; p.holdT = 0;
    this.airJumps = this.def?.move?.airJumps ?? 0;
    this.flaps = this.def?.flight?.type === 'glide' ? this.def.flight.flaps : 0;
    this.gallopT = 0; this.galloping = false; this.duck = 0; this.chargeT = 0; this.act = null;
    this.lastFacing = p.facing; this.facing = p.facing;
    try { p.refreshStats?.(); } catch (e) { warnOnce('rs', '[mount] refreshStats', e); }
    this.syncFrom(p);
    this.animate(0, world, p);
    if (this.summonGhost) { this.summonGhost.dead = true; this.summonGhost = null; }
    // 안장에 앉는 순간: 가죽 삐걱 + 울음 · 흙먼지 · 짧은 흔들림
    audio.sfx('mount_up', { vol: 0.9 });
    this.cry(world, { vol: 0.75 });
    world.fx?.burst('dust', p.cx, p.bottom, nq(world, 14), { angle: -Math.PI / 2, spread: 2.2, speed: 140 });
    world.camera?.shake?.(2, 0.15);
    const s = this.runStore;
    if (s && !s.greeted) { s.greeted = true; world.game?.toast?.(cmpText('rideFirst', { name: this.name }), this.def?.color ?? '#ffd070', 2.2); }
    bus.emit('mounted', { id: this.id });
    return true;
  }
  /** 몸을 기수 크기로 되돌린다 (발 중앙 유지). 기수가 탈것보다 키가 크면 (브란 88 > 늑대 78) 머리 높이를 맞춰 박히지 않게 한다 */
  unseat(world, p) {
    if (!this.seated) return;
    const cx = p.cx, b = p.bottom, top = p.y;
    const cw = p.ch?.size?.w ?? 30, chh = p.ch?.size?.h ?? 82;
    p.w = cw; p.h = chh; p.cx = cx; p.bottom = b;
    if (!fits(world, p.x, p.bottom, p.w, p.h)) {
      // 기수(최대 88)가 늑대·멧돼지(78·80)보다 크다: 천장 밑 공중에서 내리면 머리가 천장에 박힐 수 있으니 머리 높이를 맞춰 본다
      const sp = findMountSpot(world, p, { w: cw, h: chh }) ?? (chh > b - top ? findMountSpot(world, p, { w: cw, h: chh }, { bottom: top + chh }) : null);
      if (sp) { p.cx = sp.cx; p.bottom = sp.bottom; }
    }
    this.seated = false;
    this.invulnT = 0;   // 탈것 쪽 무적 (돌진·앞들기·영혼 결속 3초) 은 내린 기수에게 남기지 않는다 (낙마 무적은 p.iframes 로 따로 준다)
    this.chargeT = 0; this.chargeAtk = null; this.act = null; this.gliding = false; this.flying = false; this.diving = false;
    this.galloping = false; this.gallopT = 0; this.duck = 0; this.inWater = false;
    this.releaseMaxFall(p);
    try { p.refreshStats?.(); } catch (e) { warnOnce('rs2', '[mount] refreshStats', e); }
    this.store();
  }
  releaseMaxFall(p) { if (this.ownMaxFall) { p.maxFall = undefined; this.ownMaxFall = false; } }
  /**
   * 내리기. reason: 'toggle'|'debug' (0.3초 하차 · 재소환 2초) · 'ult'|'skill' (자동 재탑승) · 'death' · 'fall' (구덩이 → 재소환 대기)
   *  · 'hp' (낙마 → knockOff) · 'deep' · 'forced'|'room' · 'boss' · 'unequip'
   */
  dismount(world, p, reason = 'toggle') {
    world = world ?? this.world;
    this.world = world;
    if (!p) return;
    if (!this.seated) {
      if (this.state === 'summoning') this.cancelSummon(world, p);
      if (reason === 'death' || reason === 'unequip' || reason === 'boss') { if (this.state !== 'recall') { this.state = 'stowed'; if (reason === 'death') this.cd = 0; } this.remountT = 0; this.pendingT = 0; }
      return;
    }
    if (reason === 'hp') { this.knockOff(world, p, 'hp'); return; }
    if (reason === 'fall') { this.knockOff(world, p, 'fall'); return; }
    const f = p.facing || 1;
    const gx = p.cx, gb = p.bottom;
    this.unseat(world, p);
    bus.emit('dismounted', { id: this.id, reason });
    const ghost = (mode, o = {}) => { try { return world.add?.(new MountGhost(gx, gb, 120, 110, { mode, id: this.id, def: this.def, facing: f, ...o })); } catch (e) { warnOnce('ghost', '[mount] ghost', e); return null; } };
    switch (reason) {
      case 'ult': case 'skill': {
        this.state = 'ult'; this.stT = 0; this.cd = 0;
        this.remountT = reason === 'ult' ? R().ultRemount : R().skillRemount; this.remountWait = 0;
        ghost('ult');
        audio.sfx('dismiss', { vol: 0.45 });
        break;
      }
      case 'death': this.state = 'stowed'; this.cd = 0; ghost('dismiss'); break;
      case 'unequip': this.state = 'stowed'; this.cd = 0; ghost('dismiss'); audio.sfx('dismiss', { vol: 0.6 }); break;
      case 'deep': case 'forced': case 'room': case 'boss': {
        this.state = 'stowed'; this.cd = 0;
        ghost('dismiss');
        audio.sfx('dismiss', { vol: 0.8 });
        const t = DISMOUNT_NOTE[reason] ?? CMP_TEXT.forced;
        this.note(world, t.includes('{') ? cmpText(t, { name: this.name }) : t);
        break;
      }
      default: {   // 'toggle' · 'debug'
        this.state = 'dismounting'; this.stT = 0;
        this.cd = R().resummonCd; this.cdMax = this.cd;
        // 기수는 뒤로 훌쩍 뛰어내리고, 탈것은 앞발을 들며 안개로 흩어진다
        p.vy = -380; p.vx = -f * 120; p.onGround = false; p.jumpCut = true;
        ghost('dismiss');
        audio.sfx('dismiss', { vol: 0.9 });
        world.fx?.burst('smoke', gx, gb - 40, nq(world, 8), { speed: 60 });
        break;
      }
    }
  }
  /** 낙마 (탈것 HP 0 · 구덩이 · 디버그): 재소환 대기 + 달아나는 MountGhost. dir = 기수가 날아갈 쪽 (±1, 공격이 미는 쪽; 없으면 뒤로) */
  knockOff(world, p, reason = 'hp', dir = 0) {
    world = world ?? this.world;
    this.world = world;
    if (!p || !this.seated) return false;
    const f = p.facing || 1;
    const gx = p.cx, gb = p.bottom;
    this.unseat(world, p);
    this.state = 'recall';
    this.cd = Math.max(1, this.d?.recall ?? this.def?.recall ?? 20); this.cdMax = this.cd;
    this.remountT = 0; this.pendingT = 0;
    this.hp = 0;   // 쓰러진 탈것은 재소환 대기 동안 초당 3% 씩 회복한다
    this.store();
    try { if (typeof ACMP.playKnockOff === 'function') ACMP.playKnockOff(this.def, { vol: 1 }); else audio.sfx('knock_off'); } catch { /* 무시 */ }
    if (reason !== 'fall') {
      const away = Math.sign(dir) || -f;
      this.knockFix = { vx: away * R().knock.vx, vy: R().knock.vy, iframes: R().knock.iframes };
      p.vx = this.knockFix.vx; p.vy = this.knockFix.vy; p.onGround = false; p.jumpCut = true; p.iframes = Math.max(p.iframes ?? 0, R().knock.iframes);
      try { world.add?.(new MountGhost(gx, gb, 120, 110, { mode: 'knocked', id: this.id, def: this.def, facing: f, dir: f })); } catch (e) { warnOnce('ghost2', '[mount] ghost', e); }
      world.camera?.shake?.(5, 0.22);
      world.fx?.burst('dust', gx, gb, nq(world, 16), { speed: 180 });
    }
    this.note(world, cmpText('knocked', { name: this.name, n: Math.ceil(this.cd) }));
    bus.emit('dismounted', { id: this.id, reason: reason === 'fall' ? 'fall' : 'knocked' });
    return true;
  }
  /** 필살기·각성기·순간이동 스킬 앞 (skills.js castSkill/castUltimate/castTechnique, awaken.js castAwakening) */
  beforeCast(world, p, id) {
    if (id === 'ult') {
      if (this.seated) this.dismount(world, p, 'ult');
      else if (this.state === 'summoning') { this.cancelSummon(world, p); this.state = 'ult'; this.remountT = R().ultRemount; this.remountWait = 0; }
      else if (this.state === 'ult') { this.remountT = Math.max(this.remountT, R().ultRemount); }
      return;
    }
    if (this.seated && DISMOUNT_SKILLS.includes(id)) this.dismount(world, p, 'skill');
  }
  /** 'ult' 상태: 연출(컷신·HUD 숨김·적 정지)이 끝나고 remountT 뒤, 땅 위(비행 탈것은 공중도)·맞는 자리면 다시 태운다 */
  tickRemount(dt, world, p) {
    if (p.dead) { this.state = 'stowed'; return; }
    const calm = !world.cutscene && !world.hudHidden && !world.freezeEnemies && !p.hidden && !world.transitioning;
    if (!calm) return;
    if (this.remountT > 0) { this.remountT -= dt; return; }
    this.remountWait += dt;
    if (this.remountWait > REMOUNT_GIVEUP || world.companions?.mountBlocked) { this.state = 'stowed'; this.cd = 0; return; }
    if (p.move || p.castT > 0 || p.hurtT > 0 || world.inputLock) return;
    if (!this.def?.flight && !p.onGround) return;
    const deep = world.gimmickOf?.('deep');
    if (deep && (deep.inWater || deep.headUnder)) return;
    if (!findMountSpot(world, p, this.def)) return;
    this.state = 'stowed';
    this.trySummon(world, p, { force: true, auto: true });
  }

  // ───────────── 이동 프로필 · 점프 · 비행 ─────────────
  baseSpeed(p) { return (this.def?.move?.speed ?? 400) * (this.d?.speedMul ?? 1); }
  profile(p) {
    const P = this._prof, mv = this.def?.move ?? {}, fl = this.def?.flight;
    const air = !p.onGround;
    let sp = (air && mv.airSpeed ? mv.airSpeed : mv.speed ?? 400) * (this.d?.speedMul ?? 1);
    if (this.galloping) sp *= 1 + R().gallopBonus;
    if (this.gliding && fl?.glideSpeed) sp = Math.max(sp, fl.glideSpeed * (this.d?.speedMul ?? 1));
    if (this.inWater && !(air && fl)) sp *= R().swim.speedMul;
    if (p.move) sp *= R().attackMoveMul;
    if (this.act) sp *= this.act.moveMul ?? 1;
    if (this.staggerT > 0) sp = 0;
    const gm = this.world?.gimmick?.speedMul;
    if (Number.isFinite(gm)) sp *= gm;
    P.speed = sp;
    P.accel = mv.accel ?? 2000; P.decel = mv.decel ?? 2200;
    P.airAccel = mv.airAccel ?? 1200; P.airDecel = mv.airDecel ?? Math.min(900, (mv.airAccel ?? 1200) * 0.6);
    P.jump = (mv.jump ?? 800) * (1 + (p.stats?.jumpPow ?? 0) / 100);
    P.airJumps = mv.airJumps ?? 0; P.wallJump = !!mv.wallJump;
    return P;
  }
  /** 탑승 중 점프 입력 전부. 늘 true (영웅 점프 규칙은 돌지 않는다) */
  handleJump(world, p, dt) {
    if (!this.seated) return false;
    const fl = this.def?.flight, prof = this.profile(p);
    if (this.act?.noJump || this.chargeT > 0) return true;
    const onG = p.onGround, down = input.down('down');
    if (input.buffered('jump', bufWin(world, 0.13))) {
      if (onG && down && p.onOneWay?.(world)) { p.dropThrough = true; p.y += 2; input.consume('jump'); }
      else if (this.inWater && !(fl && !onG)) {   // 헤엄: 물속에선 언제든 차오른다
        p.vy = R().swim.jumpVy; p.jumpCut = true; p.onGround = false; input.consume('jump');
        world.fx?.burst('water', p.cx, p.bottom - 20, nq(world, 8), { angle: -Math.PI / 2, spread: 1.2, speed: 160 });
        audio.sfx('splash', { vol: 0.5 });
      } else if (onG || p.coyote > 0) {
        if (fl?.type === 'fly') { p.vy = fl.takeoff ?? -420; this.flying = true; p.jumpCut = true; this.flapT = 0.3; audio.sfx('wing_flap', { vol: 0.8 }); }
        else { p.vy = -prof.jump; p.jumpCut = false; }
        p.coyote = 0; p.onGround = false; input.consume('jump');
        this.jumpFx(world, p, false);
      } else if (prof.wallJump && (p.wallSlide || p.hitWallDir)) {   // 벽 차기 (서리 늑대)
        const dir = -(p.wallSlide || p.hitWallDir);
        p.vx = dir * 460; p.facing = dir; p.vy = -prof.jump * 0.9; p.jumpCut = true;
        this.airJumps = Math.max(this.airJumps, 1);
        input.consume('jump');
        this.setAnim('wall');
        world.fx?.burst('dust', p.cx - dir * (p.w / 2), p.cy, nq(world, 10), { speed: 110 });
        world.fx?.burst('ice', p.cx - dir * (p.w / 2), p.cy, nq(world, 5), { speed: 90 });
        audio.sfx('jump', { vol: 0.8, pitch: 0.85 }); audio.sfx('wolf_bite', { vol: 0.3, pitch: 1.3 });
      } else if (this.airJumps > 0) {
        this.airJumps--;
        p.vy = -prof.jump * 0.9; p.jumpCut = false; input.consume('jump');
        this.jumpFx(world, p, true);
      } else if (fl?.type === 'glide' && this.flaps > 0) {   // 날갯짓
        this.flaps--;
        p.vy = fl.flapVy ?? -620; p.jumpCut = true; input.consume('jump');
        this.flapT = 0.35; this.setAnim('flap');
        audio.sfx('wing_flap', { vol: 0.9 });
        world.fx?.ering?.(p.cx, p.bottom + 6, { color: '#e8dccc', r0: 8, r1: 60, ry: 0.3, life: 0.3, width: 3 });
        world.fx?.burst('dust', p.cx, p.bottom, nq(world, 6), { speed: 120, angle: Math.PI / 2, spread: 1.4 });
      } else if (fl?.type === 'fly') {
        if (down) { this.diving = true; p.vy = fl.dive ?? 700; this.setAnim('dive'); audio.sfx('dash', { vol: 0.5, pitch: 0.8 }); }
        input.consume('jump');
      }
    }
    // 가변 점프 (날갯짓·이륙·헤엄은 끊지 않는다)
    if (!input.down('jump') && p.vy < 0 && !p.jumpCut) { p.vy *= 0.5; p.jumpCut = true; }
    void dt;
    return true;
  }
  jumpFx(world, p, air) {
    const fx = world.fx, c = this.def?.color ?? '#c8e0ff';
    if (air) {
      audio.sfx('double_jump', { vol: 0.9 });
      fx?.ring(p.cx, p.bottom, { color: c, r0: 8, r1: 56, life: 0.3, width: 4 });
      fx?.burst('magic', p.cx, p.bottom, nq(world, 8), { color: c, speed: 110 });
      if (this.def?.airJumpName) fx?.text(p.cx, p.y - 10, this.def.airJumpName, { color: c, size: 14, life: 0.6, vy: -50 });
    } else {
      audio.sfx('jump', { vol: 0.8, pitch: 0.82 });
      this.hoof(world, 0.7);
      fx?.burst('dust', p.cx, p.bottom, nq(world, 8), { angle: -Math.PI / 2, spread: 1.4, speed: 90 });
    }
    this.setAnim('jump');
  }
  /** 비행·활공·헤엄의 수직 조작 (중력 보정 포함). tick 에서 물리 전에 */
  flightTick(dt, world, p, inp) {
    const fl = this.def?.flight, onG = p.onGround;
    let maxFall = null;
    if (this.inWater && !(fl && !onG)) maxFall = R().swim.maxFall;
    const holdJ = !!inp && input.down('jump'), down = !!inp && input.down('down');
    if (fl?.type === 'glide') {
      this.gliding = !onG && holdJ && p.vy > 0 && !(this.chargeT > 0) && !this.act?.noGlide;
      if (this.gliding) maxFall = fl.glideFall ?? 150;
    } else this.gliding = false;
    if (fl?.type === 'fly') {
      if (onG) {
        this.flying = false; this.diving = false;
        if (this.stamina < this.staminaMax) this.stamina = Math.min(this.staminaMax, this.stamina + (fl.regen ?? 1.5) * dt);
      } else if (!(this.chargeT > 0) && !this.act?.noFly) {
        this.flying = true;
        if (this.diving && !down) this.diving = false;
        if (this.diving) { if (p.vy < (fl.dive ?? 700)) p.vy = fl.dive ?? 700; }
        else if (holdJ && this.stamina > 0) {
          p.vy = approach(p.vy, fl.ascend ?? -380, 2400 * dt) - GRAVITY * dt;
          this.stamina = Math.max(0, this.stamina - dt);
          if (this.flapT <= 0) { this.flapT = 0.28; audio.sfx('wing_flap', { vol: 0.35, pitch: 1.15 }); }
        } else maxFall = fl.hoverFall ?? 110;
      }
    }
    if (Number.isFinite(this.act?.vyMax) && !onG) maxFall = Math.min(maxFall ?? Infinity, this.act.vyMax);   // 화염 숨결: 공중에서 천천히 내려온다
    if (maxFall != null) { p.maxFall = maxFall; this.ownMaxFall = true; } else this.releaseMaxFall(p);
  }

  // ───────────── 돌진 (companions §3.6.5) ─────────────
  /** player.js 의 대시 가지 (pressed('dash')). 같은 누름을 tick 이 이미 처리했으면 무시 */
  tryCharge(world, p, ax, ay) {
    if (this._chgPress === input.pressTime?.dash) return false;
    const ok = this.charge(world, p, ax, ay);
    if (ok) { this._chgPress = input.pressTime?.dash; input.consume('dash'); }
    return ok;
  }
  /** 돌진 시작 (입력과 무관하게 부를 수 있다: 테스트·AI) */
  charge(world, p, ax = 0, ay = 0) {
    this.world = world;
    if (!this.seated || !p || p.dead) return false;
    if (world.mode === 'town' || this.chargeT > 0 || this.chargeCd > 0 || this.staggerT > 0 || p.hurtT > 0) return false;
    if (this.act && !this.act.cancelable) return false;
    const def = this.def, c0 = def?.charge;
    if (!c0) return false;
    const fl = def.flight;
    let c = c0, kind = 'ground';
    const dir = this.chargeDir;
    const f = ax > 0 ? 1 : ax < 0 ? -1 : (p.facing || 1);
    if (c0.dir8) {   // 8방향 (녹티스·게일): 입력 방향, 없으면 앞
      let dx = ax, dy = ay;
      if (p.onGround && dy > 0) dy = 0;   // 땅 위에서 ↓ 는 뺀다 — 그 뒤에 방향이 없으면 앞으로 (↓+돌진이 제자리 돌진이 되지 않게)
      if (!dx && !dy) dx = p.facing || 1;
      const n = Math.hypot(dx, dy) || 1;
      dir.x = dx / n; dir.y = dy / n; kind = 'dir8';
    } else if (c0.air && !p.onGround) {   // 와이번 공중: 급강하 (50° 아래)
      c = { ...c0, ...c0.air, dur: c0.air.maxT ?? 0.6, iframes: c0.iframes, kb: c0.air.kb ?? c0.kb, launch: c0.air.launch ?? false };
      const a = (c0.air.angle ?? 50) * Math.PI / 180;
      dir.x = f * Math.cos(a); dir.y = Math.sin(a); kind = 'dive';
    } else { dir.x = f; dir.y = 0; }
    try { if (this.B?.charge?.start?.(this, world, p, dir) === false) return false; } catch (e) { warnOnce('Bc' + this.id, '[mount] MOUNT_B charge', e); }
    if (dir.x) p.facing = dir.x > 0 ? 1 : -1;
    this.chargeKind = kind; this.chargeC = c;
    this.chargeT = c.dur ?? 0.36; this.chargeT0 = this.chargeT;
    this.chargeCd = Math.max(this.chargeT, this.d?.chargeCd ?? c0.cd ?? 0.8);
    this.invulnT = Math.max(this.invulnT, c.iframes ?? 0);
    this.chargeGhostT = 0; this.chargeTrailX = p.cx; this.chargeHitSum = 0; this.chargeLandShock = kind === 'dive' ? c.shock ?? null : null;
    this.chargeAtk = this.atk({
      mv: c.mv ?? 1.1, type: c.type ?? 'phys', element: c.element ?? null, kb: c.kb ?? [360, -220], launch: !!c.launch,
      stun: c.stun ?? R().charge.stun, hitstop: R().charge.hitstop, shake: R().charge.shake, hitId: 'chg' + this.id + (++SEQ),
      tags: ['mount', 'melee', 'charge'], breakWalls: !!c.breakWalls,
    }, p);
    if (kind !== 'ground') p.onGround = false;
    this.act = null; this.gliding = false; this.diving = false;
    p.endMove?.();
    this.setAnim(kind === 'dive' ? 'dive' : 'charge');
    // 연출: 발 구름 · 속도선 · 효과음 (돌진 효과음 + 발굽/날개) · 가벼운 진동
    const fx = world.fx;
    fx?.burst('dust', p.cx, p.bottom, nq(world, 12), { angle: dir.x > 0 ? Math.PI : 0, spread: 0.7, speed: 220 });
    fx?.ring(p.cx, p.cy, { color: def.color ?? '#fff', r0: 12, r1: 70, life: 0.22, width: 4 });
    audio.sfx(c0.sfx ?? 'dash', { vol: 0.8 });
    if (fl) audio.sfx('wing_flap', { vol: 0.7, pitch: 0.9 }); else this.hoof(world, 0.9);
    world.camera?.kick?.(-dir.x * 3, 0);
    input.rumble?.(0.25, 0.45, 90);
    if ((this.world.time ?? 0) - this.chargeNameT > 8) {
      this.chargeNameT = this.world.time ?? 0;
      fx?.text(p.cx, p.y - 24, kind === 'dive' ? (c0.air?.name ?? c0.name) : c0.name, { color: def.color, size: 16, life: 0.7, vy: -60, outline: '#1a0610' });
    }
    return true;
  }
  /** 돌진 중 매 프레임 (player.js 가 수평 조작 대신 부른다) */
  updateCharge(dt, world, p) {
    if (!(this.chargeT > 0) || !this.seated) { this.chargeT = 0; return; }
    const c = this.chargeC ?? this.def.charge, dir = this.chargeDir;
    this.chargeT -= dt;
    p.vx = dir.x * (c.speed ?? 780);
    if (this.chargeKind !== 'ground') p.vy = dir.y * (c.speed ?? 780) - GRAVITY * dt;   // 중력 보정: 물리 뒤 정확히 dir·speed
    // 앞쪽 판정 (companions §3.6.5 frontRect; 8방향은 진행 방향 쪽으로 몸을 감싼다)
    const bw = p.w, bh = p.h;
    let rect;
    if (this.chargeKind === 'ground') rect = p.relRect(bw * 0.1, -bh * 0.9, bw * 0.6 + 30, bh * 0.8);
    else { const w = bw * 0.8 + 30, h = bh * 0.8 + (dir.y ? 20 : 0); rect = { x: p.cx + dir.x * bw * 0.35 - w / 2, y: p.cy + dir.y * bh * 0.3 - h / 2, w, h }; }
    const atk = this.chargeAtk;
    atk.dir = dir.x > 0 ? 1 : dir.x < 0 ? -1 : (p.facing || 1);
    const n = this.strike(world, rect, atk);
    if (n > 0 && c.heal) {   // 흡혈 급습: 준 피해의 heal 배만큼 탈것 회복
      const got = this.sumDamage(world, atk.hitId);
      if (got > 0) { this.chargeHitSum += got; this.healFrac((got * c.heal) / this.maxHp); }
    }
    if (world.game?.debug) world.debugRects?.push(rect);
    // 불씨·망령불 자국 (코슈타 · 이그니스)
    if (c.trail && Math.abs(p.cx - this.chargeTrailX) >= 36) { this.chargeTrailX = p.cx; this.spawnTrail(world, p, c.trail); }
    // 잔상 · 속도선
    this.chargeGhostT -= dt;
    if (this.chargeGhostT <= 0) {
      const qq = q(world);
      this.chargeGhostT = qq >= 0.95 ? R().charge.ghostEvery : 0.08;
      if (qq > 0.55) this.ghost(world, p, this.def.color ?? '#ff6a4a', { riderToo: qq >= 0.95 });
    }
    if (q(world) > 0.55) world.fx?.speedLine(p.cx - dir.x * 50, p.cy + rand(-30, 30), Math.atan2(-dir.y, -dir.x), { len: rand(50, 90), width: 2.5, color: this.def.color ?? '#fff', life: 0.16, speed: 300 });
    try { this.B?.charge?.tick?.(this, world, p, dt); } catch (e) { warnOnce('Bct' + this.id, '[mount] MOUNT_B charge tick', e); }
    if (this.chargeT <= 0) this.endCharge(world, p, 'time');
  }
  endCharge(world, p, why = 'time') {
    if (!(this.chargeT > 0) && why !== 'time') { this.chargeT = 0; return; }
    const kind = this.chargeKind;
    this.chargeT = 0;
    if (kind === 'ground') p.vx *= 0.5;
    else { p.vx *= 0.45; if (kind !== 'dive') p.vy *= 0.3; }
    try { this.B?.charge?.end?.(this, world, p, why); } catch (e) { warnOnce('Bce' + this.id, '[mount] MOUNT_B charge end', e); }
    this.chargeKind = null;
  }
  spawnTrail(world, p, tr) {
    const el = tr.element ?? this.def?.charge?.element ?? null;
    const col = el === 'fire' ? '#ff8a2a' : this.def?.color ?? '#6ad0ff';
    const fire = el === 'fire';
    world.add(new Hitbox({
      x: p.cx - 22, y: p.bottom - 34, w: 44, h: 34, life: tr.life ?? 1.2, z: 5,
      attack: this.atk({ mv: tr.mv ?? 0.35, element: el, type: 'mag', kb: [60, -120], hitstop: 0, shake: 0, stun: 0.1, rehit: tr.rehit ?? 0.25, hitId: 'trl' + this.id + (++SEQ), tags: ['mount', 'trail'] }, p),
      light: { r: 60, color: col, i: 0.45 },
      render: (ctx, h) => drawFlameTrail(ctx, h, col, fire),
    }));
  }

  // ───────────── 특수기 (companions §3.6.6, §3.9) ─────────────
  trySpecial(world, p) {
    this.world = world;
    if (!this.seated || p.dead || world.mode === 'town') return false;
    if (this.specialCd > 0 || this.chargeT > 0 || this.act || p.hurtT > 0) return false;
    const sp = this.def?.special;
    if (!sp) return false;
    if (!p.onGround && !sp.air) return false;
    let ok = false;
    const B = this.B?.special;
    try {
      if (typeof B === 'function') ok = !!B(this, world, p);
      else if (typeof B?.start === 'function') ok = !!B.start(this, world, p);
      else {
        const fn = SPECIALS[sp.kind];
        if (!fn) return false;
        ok = fn(this, world, p, sp) !== false;
      }
    } catch (e) { warnOnce('sp' + this.id, '[mount] special', e); ok = false; }
    if (!ok) return false;
    if (!(this.specialCd > 0)) this.specialCd = this.specialCdMax || sp.cd || 5;
    this.showName(world, p, sp.name);
    world.camera?.punchZoom?.(R().special.punchZoom ?? 1.03, 0.2);
    p.endMove?.();
    return true;
  }
  showName(world, p, name) {
    if (!name) return;
    world.fx?.text(p.cx, p.y - 30, name, { color: this.def?.color ?? '#ffd070', size: 24, life: 1.1, vy: -60, outline: '#1a0610' });
  }
  power(mv) { return (mv ?? 1) * (this.d?.specialMul ?? 1); }
  /** 동작 예약: { name, dur, anim, riderAnim, moveMul, invuln, noJump, noGlide, noFly, vyMax, cancelable, at:[[t, fn]], tick(r,w,p,a,dt), end(r,w,p,a) } */
  startAct(o) {
    const a = { t: 0, dur: 0.3, moveMul: 1, fired: 0, ...o };
    if (a.invuln) this.invulnT = Math.max(this.invulnT, a.invuln);
    this.act = a;
    if (a.anim) this.setAnim(a.anim);
    return a;
  }
  tickAct(dt, world, p) {
    const a = this.act;
    a.t += dt;
    if (a.at) while (a.fired < a.at.length && a.t >= a.at[a.fired][0]) { const fn = a.at[a.fired][1]; a.fired++; try { fn(this, world, p, a); } catch (e) { warnOnce('act' + a.name, '[mount] act', e); } }
    try { a.tick?.(this, world, p, a, dt); } catch (e) { warnOnce('actt' + a.name, '[mount] act tick', e); }
    if (this.act === a && a.t >= a.dur) {
      this.act = null;
      try { a.end?.(this, world, p, a); } catch (e) { warnOnce('acte' + a.name, '[mount] act end', e); }
    }
  }

  // ───────────── 공격 도우미 (MOUNT_B 도 쓴다) ─────────────
  atk(o = {}, p = this.world?.player) {
    return {
      owner: p, team: 'player', stats: this.d?.atkStats ?? p?.stats, mv: 1, type: 'phys', element: null,
      dir: p?.facing || 1, kb: [300, -300], launch: false, hitstop: 0.05, shake: 3, crit: 0, mult: 1,
      breakWalls: false, hitId: 'mnt' + this.id + (++SEQ), tags: ['mount'], ...o,
    };
  }
  strike(world, rect, atk) { try { return playerStrike(world, rect, atk); } catch (e) { warnOnce('strike', '[mount] strike', e); return 0; } }
  hit(world, o) { return world.add(new Hitbox(o)); }
  rect(p, rx, ry, rw, rh) { return p.relRect(rx, ry, rw, rh); }
  /** 이번 프레임에 hitId 공격이 준 피해 합 (녹티스 흡혈). 방금 쓰러진 적도 센다 */
  sumDamage(world, hitId) {
    let s = 0;
    const now = world.time;
    for (const e of world.entities ?? []) { if (e._hits?.get?.(hitId) === now && e.lastImpact?.t === now) s += e.lastImpact.dmg ?? 0; }
    return s;
  }

  // ───────────── 물리 뒤 (착지 충격 · 끼임 · 천장 · 걸음새 · 포즈) ─────────────
  afterPhysics(dt, world, p, vyBefore) {
    this.world = world;
    this._wet = this.inWater; this.inWater = false;   // 이번 프레임 액체 판정은 곧 hazard() 가 다시 켠다
    if (!this.seated) { this.releaseMaxFall(p); return; }
    // 착지
    if (p.landed) this.onLand(world, p, vyBefore);
    if (p.onGround) { this.airJumps = this.def?.move?.airJumps ?? 0; if (this.def?.flight?.type === 'glide') this.flaps = this.def.flight.flaps; }
    // 돌진이 벽에 막힘 (부서지는 벽은 판정이 먼저 부순다)
    if (this.chargeT > 0 && p.hitWall && Math.sign(p.hitWall) === Math.sign(this.chargeDir.x) && this.chargeKind !== 'dive') {
      this.endCharge(world, p, 'wall');
      world.camera?.shake?.(4, 0.15);
      this.staggerT = 0.3; this.hurtT = 0.3;
      world.fx?.burst('shard', p.cx + p.facing * p.w / 2, p.cy, nq(world, 10), { speed: 200, color: '#8a7a6a' });
      audio.sfx('hit_heavy', { vol: 0.6, pitch: 0.7 });
    }
    // 못 넘는 턱 안내 (R1-REQ-369)
    try { this.ledgeHint(dt, world, p); } catch (e) { warnOnce('ledge', '[mount] ledgeHint', e); }
    // 비행 탈것: 위로 나가는 출구가 없는 방에서는 화면 위로 못 나간다
    if (this.def?.flight && !world.room?.exitUp && p.y < 4) { p.y = 4; if (p.vy < 0) p.vy = 0; }
    // 끼임 해소: 스킬 등으로 몸이 벽에 들어가면 옆으로 밀어 보고, 안 되면 내린다
    if (!fits(world, p.x, p.bottom, p.w, p.h)) {
      const sp = findMountSpot(world, p, this.def);
      if (sp) p.cx = sp.cx;
      else { this.dismount(world, p, 'forced'); return; }
    }
    // 낮은 천장: 몸 위 14px 안에 단단한 칸이 있으면 기수가 몸을 숙인다
    const dk = R().duck;
    const probe = this.solidAbove(world, p, dk.probe);
    this.duck = approach(this.duck, probe ? 1 : 0, dk.rate * dt);
    this.animate(dt, world, p);
  }
  /**
   * 못 넘는 턱 안내 (R1-REQ-369): 날지 못하는 탈것으로 턱에 붙어 1.2초 넘게 밀었는데, 그 턱이 탈것 점프(공중 점프 포함)로는 못 넘고
   * 내려서 영웅의 점프(공중 점프 포함)로는 오를 수 있으면 방마다 한 번 '{name}은(는) 이 턱을 넘지 못한다 — 내려서 올라가자'.
   * 바르그(점프 700 ≈ 2.3칸)가 3칸 턱에서 막히는 것이 설계상 약점이라 (data/companions.js mt_boar), 어떻게 지나가는지를 알려 준다.
   */
  ledgeHint(dt, world, p) {
    if (this.def?.flight || this.act || this.chargeT > 0 || this.hintRoom === world.roomId) { this.ledgeT = 0; return; }
    const dir = p.hitWall ? Math.sign(p.hitWall) : 0;
    if (!dir || Math.sign(this.ax) !== dir) { this.ledgeT = Math.max(0, (this.ledgeT ?? 0) - dt * 2); return; }
    this.ledgeT = (this.ledgeT ?? 0) + dt;
    if (this.ledgeT < 1.2 || !p.onGround) return;   // 높이는 땅에 선 채로 잰다 (뛰어오른 중이면 착지까지 기다린다)
    this.ledgeT = 0;
    const map = world.map;
    if (!map?.typeAt) return;
    const tx = Math.floor((dir > 0 ? p.x + p.w + 2 : p.x - 2) / TILE), ty0 = Math.floor((p.bottom - 2) / TILE);
    let n = 0;
    while (n < 7 && isSolidType(map.typeAt(tx, ty0 - n))) n++;
    if (!n || n >= 7) return;                                                            // 벽이 아니거나 너무 높다
    if (isSolidType(map.typeAt(tx, ty0 - n - 1))) return;                               // 턱 위에 설 자리가 없다
    // 부서지는 벽(T.BREAK)은 돌진으로 부수면 된다 (바르그 · 그림메인 · 이그니스 charge.breakWalls) — 내려서 오르라고 하지 않는다
    if (this.def?.charge?.breakWalls) for (let i = 0; i < n; i++) if (map.typeAt(tx, ty0 - i) === T.BREAK) return;
    const h = p.bottom - (ty0 - n + 1) * TILE;                                           // 발에서 턱 윗면까지
    const reachOf = (v, air) => ((v * v) / (2 * GRAVITY)) * (1 + 0.81 * (air ?? 0));    // 공중 점프는 0.9배 속도 → 높이 0.81배
    const prof = this.profile(p), reach = reachOf(prof.jump, prof.airJumps);
    const jv = p.jumpVel?.(), foot = Number.isFinite(jv) ? reachOf(jv, p.maxAirJumps?.() ?? 1) : TILE * 5;   // 내려서 걸어 뛰면 닿는 높이
    if (h <= reach + 4 || h > foot - 4) return;
    this.hintRoom = world.roomId;
    this.note(world, cmpText('ledge', { name: this.name }));
  }
  solidAbove(world, p, d) {
    const map = world.map;
    if (!map) return false;
    const ty = Math.floor((p.y - d) / TILE);
    const l = Math.floor((p.x + 2) / TILE), r = Math.floor((p.x + p.w - 2) / TILE);
    for (let tx = l; tx <= r; tx++) if (isSolidType(map.typeAt(tx, ty))) return true;
    return false;
  }
  onLand(world, p, vyBefore) {
    const L = R().landing;
    this.landT = 0.16; this.flying = false; this.diving = false; this.gliding = false;
    const fx = world.fx;
    if (this.chargeT > 0 && this.chargeKind === 'dive') {   // 급강하 착지 충격파
      const sh = this.chargeLandShock ?? { r: 120, mv: 0.8 };
      this.endCharge(world, p, 'land');
      const r = sh.r ?? 120, el = this.def?.charge?.air?.element ?? 'fire', E = elemFx(el);
      this.strike(world, { x: p.cx - r, y: p.bottom - 70, w: r * 2, h: 76 }, this.atk({ mv: sh.mv ?? 0.8, element: el, kb: [320, -420], launch: true, hitstop: 0.06, shake: 6, tags: ['mount'] }, p));
      fx?.ering?.(p.cx, p.bottom, { color: E.ring, r0: 10, r1: r * 1.2, ry: 0.3, life: 0.4, width: 7 });
      fx?.burst(E.burst, p.cx, p.bottom - 6, nq(world, 18), { angle: -Math.PI / 2, spread: 2.4, speed: 260 });
      world.camera?.shake?.(6, 0.22);
      audio.sfx(E.boom, { vol: 0.7 });
    }
    if (vyBefore > L.vy) {   // 무거운 착지: 흔들림 · 먼지 고리 · 쿵 · 발밑의 적을 튕긴다
      world.camera?.shake?.(L.shake ?? 3, 0.15);
      fx?.ering?.(p.cx, p.bottom, { color: '#c8b8a0', r0: 8, r1: 80, ry: 0.25, life: 0.35, width: 5 });
      fx?.burst('dust', p.cx, p.bottom, nq(world, 14), { angle: -Math.PI / 2, spread: 2.6, speed: 170 });
      audio.sfx('hoof_land', { vol: 0.9 });
      input.rumble?.(0.35, 0.2, 70);
      const r = L.r ?? 70;
      this.strike(world, { x: p.cx - r, y: p.bottom - 44, w: r * 2, h: 48 }, this.atk({ mv: L.mv ?? 0.4, kb: L.kb ?? [180, -260], hitstop: L.hitstop ?? 0.03, shake: 2, hitId: 'land' + this.id + (++SEQ), tags: ['mount'] }, p));
    } else {
      this.hoof(world, 0.55);
    }
    try { this.B?.passive?.land?.(this, world, p, vyBefore); } catch { /* 무시 */ }
    this.setAnim('land');
  }

  // ───────────── 걸음새 · 애니메이션 · 포즈 · 안장 ─────────────
  syncFrom(p) {
    this.cx = p.cx; this.bottom = p.bottom; this.facing = p.facing || 1; this.vx = p.vx; this.vy = p.vy; this.onGround = !!p.onGround;
  }
  setAnim(a) { if (this.anim !== a) { this.anim = a; this.animT = 0; } }
  animate(dt, world, p) {
    this.syncFrom(p);
    this.animT += dt;
    const base = this.baseSpeed(p), sp = Math.abs(p.vx), onG = p.onGround;
    this.speedK = base > 0 ? sp / base : 0;
    // 질주 (§3.4): 방향을 0.35초 누른 채 85% 이상 → 질주 (+6%)
    const gallopOk = onG && this.ax !== 0 && Math.sign(this.ax) === Math.sign(p.vx) && sp >= R().gallopMin * base && !p.move && !this.inWater;
    this.gallopT = gallopOk ? this.gallopT + dt : (this.ax !== 0 && onG && sp > base * 0.5 ? this.gallopT : 0);
    this.galloping = this.gallopT >= (this.def?.move?.gallopAfter ?? R().gallopAfter);
    // 방향 전환 (60% 넘는 속도): 몸을 틀며 기수가 뒤로 젖힌다
    if (p.facing !== this.lastFacing) {
      if (onG && sp > R().turnMin * base) {
        this.turnT = R().turnT;
        world.fx?.burst('dust', p.cx, p.bottom, nq(world, 10), { angle: p.facing > 0 ? 0 : Math.PI, spread: 0.8, speed: 160 });
        audio.sfx('skid', { vol: 0.5, pitch: 0.8 });
      }
      this.lastFacing = p.facing;
    }
    // 미끄러짐: 방향을 놓고 빠르게 달리던 중
    this.skid = onG && this.ax === 0 && sp > base * 0.5 && !(this.chargeT > 0);
    if (this.skid && Math.random() < 0.5 * q(world)) world.fx?.emit('dust', p.cx - p.facing * 10, p.bottom, { speed: 50, size: 7 });
    // 보폭 위상 · 발굽 소리
    const stride = this.galloping || this.chargeT > 0 ? 110 : 70;
    const prev = this.phase;
    if (onG) this.phase = (this.phase + sp * dt / stride) % 1;
    else if (this.inWater) this.phase = (this.phase + dt * 1.6) % 1;
    if (onG && sp > 20) {
      const beats = this.galloping || this.chargeT > 0 ? [0, 0.12, 0.45, 0.55] : [0, 0.25, 0.5, 0.75];
      for (const b of beats) if (crossed(prev, this.phase, b)) {
        this.hoof(world, this.galloping ? 0.5 : 0.28);
        if (this.galloping && Math.random() < 0.6 * q(world)) world.fx?.emit('dust', p.cx - p.facing * rand(10, 30), p.bottom, { speed: 60, size: rand(6, 10), angle: -Math.PI / 2 - p.facing * 0.8, spread: 0.6 });
      }
    }
    // 질주 속도선
    if (this.galloping && q(world) > 0.55) {
      this.lineT -= dt;
      if (this.lineT <= 0) { this.lineT = 0.05; world.fx?.speedLine(p.cx - p.facing * 46, p.bottom - rand(18, 80), p.facing > 0 ? Math.PI : 0, { len: rand(40, 80), width: 2, color: '#f0e8e0', life: 0.16, speed: 420 }); }
    }
    // 헤엄: 물 튀김 0.4초마다
    if (this.inWater || this._wet) {
      this.splashT -= dt;
      if (this.splashT <= 0 && sp > 40) { this.splashT = 0.4; world.fx?.burst('water', p.cx + p.facing * 20, p.bottom - 30, nq(world, 6), { angle: -Math.PI / 2, spread: 1.2, speed: 140 }); }
    }
    // 애니메이션 (우선순위: 동작 > 돌진 > 경직 > 전환 > 공중 > 물 > 착지 > 이동 > 대기)
    const fl = this.def?.flight;
    let a;
    if (this.act?.anim) a = this.act.anim;
    else if (this.chargeT > 0) a = this.chargeKind === 'dive' ? 'dive' : 'charge';
    else if (this.hurtT > 0 || this.staggerT > 0) a = 'hurt';
    else if (this.turnT > 0) a = 'turn';
    else if (!onG) {
      if (this.inWater || this._wet) a = 'swim';
      else if (fl?.type === 'fly') a = this.diving ? 'dive' : (this.flapT > 0 || p.vy < -40) ? 'flap' : 'hover';
      else if (this.gliding) a = 'glide';
      else if (this.flapT > 0 && fl) a = 'flap';
      else if (this.anim === 'wall' && this.animT < 0.25) a = 'wall';
      else a = p.vy < 0 ? 'jump' : 'fall';
    } else if (this.inWater || this._wet) a = 'swim';
    else if (this.landT > 0 && sp < 60) a = 'land';
    else if (sp > 20) a = this.galloping ? 'run' : 'walk';
    else a = 'idle';
    this.setAnim(a);
    this.gait = this.chargeT > 0 ? 'charge' : a === 'rear' || this.act?.name === 'rear' ? 'rear' : (a === 'swim') ? 'swim'
      : (fl && !onG) ? 'fly' : !onG ? 'air' : a === 'run' ? 'run' : a === 'walk' ? 'walk' : 'idle';
    // 몸 기울기 · 들썩임 · 날개 (대체 그림과 안장 계산이 쓴다)
    const rear = this.act?.rearK ?? 0;
    this.rearK = approach(this.rearK, rear, dt * 8);
    const gp = this.phase * TAU;
    this.bob = !onG ? 0 : a === 'run' || a === 'charge' ? Math.sin(gp * 2) * 4.5 : a === 'walk' ? -Math.abs(Math.sin(gp * 2)) * 1.5 : a === 'idle' ? Math.sin(this.t * 2.2) * 0.8 : 0;
    this.pitch = -0.7 * this.rearK + (a === 'run' ? Math.sin(gp) * 0.05 : 0) + (!onG && !fl ? clamp(p.vy / 2000, -0.12, 0.12) : 0) + (a === 'hurt' ? 0.06 : 0);
    this.wingK = !fl ? 0 : onG ? 0.1 : (a === 'glide' ? 1 : a === 'hover' ? 0.8 : a === 'dive' ? 0.3 : 0.9);
    // 포즈 (CMP-MOUNT-ART-A 의 mount_rig; 스텁이면 null → 대체 그림)
    let pose = null;
    try { pose = typeof RIG.mountPose === 'function' ? RIG.mountPose(this, dt) : null; } catch (e) { warnOnce('pose' + this.id, '[mount] mountPose', e); pose = null; }
    this.pose = pose; this.fallback = !pose;
    this.computeSeat(p);
    this.lean = this.riderLean(p, a);
    const ro = this.rideO;
    ro.sx = this.seatPt.x; ro.sy = this.seatPt.y; ro.lean = this.lean + (this.seatPt.lean ?? 0); ro.duck = this.duck;
    ro.footY = this.def?.footY ?? 20; ro.legs = this.def?.legs ?? 'straddle';
    ro.reins = !(p.move || p.throwT > 0 || p.castT > 0); ro.gait = this.gait; ro.phase = this.phase;
    this.alpha = this.state === 'summoning' ? clamp(this.stT / 0.3, 0.2, 1) : 1;
  }
  /** 안장점 (월드): 리그 포즈가 있으면 그 값, 없으면 데이터 안장 + 들썩임 + 앞들기 회전 */
  computeSeat(p) {
    const s = this.seatPt;
    if (this.pose) {
      try { RIG.seatOf(this.pose, s); if (Number.isFinite(s.x) && Number.isFinite(s.y) && (s.x !== 0 || s.y !== 0)) return s; } catch { /* 대체 */ }
    }
    return seatFallback(this, p.facing || 1, p.cx, p.bottom, s);
  }
  riderLean(p, a) {
    let l = 0;
    if (a === 'run') l = 0.12; else if (a === 'walk') l = 0.03;
    if (a === 'turn') l = -0.25;
    if (this.skid) l -= 0.18;
    if (a === 'jump') l -= 0.08; else if (a === 'fall') l += 0.06;
    if (a === 'glide' || a === 'hover') l += 0.05;
    if (a === 'dive') l += 0.25;
    return l;
  }
  updateAnim(dt, world, p) { void dt; void world; void p; }
  riderAnim(p) {
    if (p.hurtT > 0) return 'ride_hurt';
    if (this.chargeT > 0) return 'ride_charge';
    if (this.act?.riderAnim) return this.act.riderAnim;
    if (this.duck > 0.5) return 'ride_duck';
    return 'ride';
  }
  /** drawHero 에 넘기는 기수 모습: 플레이어의 모든 필드 + p.ride (companions §11.4) */
  riderView(p) {
    const v = this._view ??= {};
    Object.assign(v, p);
    v.x = p.x; v.y = p.y; v.w = p.w; v.h = p.h; v.cx = p.cx; v.cy = p.cy; v.bottom = p.bottom;
    v.atkSpeedMul = p.atkSpeedMul; v.rig = p.rig;
    v.ride = this.rideO;
    return v;
  }
  riderLift() {
    const L = this._lift, p = this.world?.player;
    if (!p || !this.seated) return ZERO;
    L.dx = (this.seatPt.x - p.cx) * (p.facing || 1);
    L.dy = this.seatPt.y - p.bottom + (R().riderLiftY ?? 41);
    return L;
  }
  /** 탑승 중 피격 판정 = 탈것 몸 ∪ 기수 몸통 (§3.3) */
  hurtbox(p) {
    const H = this._hb, bh = p.h, duck = this.duck;
    const bx = p.x + 4, by = p.bottom - bh + 6, bw = p.w - 8, bhh = bh - 6;
    const rx = this.seatPt.x - 12, ry = this.seatPt.y - 48 + 20 * duck, rw = 24, rh = 48 - 20 * duck;
    const x0 = Math.min(bx, rx), y0 = Math.min(by, ry), x1 = Math.max(bx + bw, rx + rw), y1 = Math.max(by + bhh, ry + rh);
    H.x = x0; H.y = y0; H.w = x1 - x0; H.h = y1 - y0;
    return H;
  }
  /** 탑승 중 기수 동작: 돌진·체공·반동을 뺀 사본 (canMove) — 탈것이 튕겨 나가지 않게 (§3.6.1) */
  adaptMove(mv) {
    if (!mv || typeof mv !== 'object') return mv;
    let c = ADAPT.get(mv);
    if (!c) {
      c = { ...mv, canMove: true };
      for (const k of ['lunge', 'vx', 'vy', 'pogo', 'groundPound', 'airStall', 'recoil', 'recoilY']) delete c[k];
      ADAPT.set(mv, c);
    }
    return c;
  }

  // ───────────── 피해 (§3.7) ─────────────
  incoming(p, dmg, attack, world) {
    world = world ?? this.world;
    if (!this.seated || !Number.isFinite(dmg)) return null;
    const def = this.def ?? {}, DM = R().damage;
    const taken = (def.taken ?? 1) * (attack?.owner?.kind === 'boss' ? DM.bossTaken : 1);
    const absorb = def.absorb ?? 0.7;
    const toMount = Math.round(dmg * absorb * taken), toRider = Math.round(dmg * (1 - absorb));
    this.hp -= toMount;
    this.flashT = 0.14;
    const heavy = toMount >= (def.armor ?? 0.1) * this.maxHp || Math.abs(attack?.kb?.[0] ?? 0) >= DM.heavyKb;
    const armored = this.chargeT > 0 && !!(this.chargeC ?? def.charge)?.superArmor;
    if (world && (world.time ?? 0) - this.lastCryT > 0.35) { this.lastCryT = world.time ?? 0; this.cry(world, { vol: 0.45, pitch: 1.25 }); }
    if (toMount > 0 && world?.fx) world.fx.text(p.cx - p.facing * 18, p.y + 20, String(toMount), { color: '#e8a040', size: 14, life: 0.6, vy: -50 });
    if (this.hp <= 0) {
      const s = this.runStore;
      if (this.d?.lastStand && s && !s.lastStand) {   // 영혼 결속: 스테이지마다 한 번 버틴다
        s.lastStand = true;
        this.hp = R().lastStand.hp ?? 1; this.invulnT = Math.max(this.invulnT, R().lastStand.invuln ?? 3);
        world?.fx?.text(p.cx, p.y - 40, cmpText('lastStand', { name: this.name }), { color: '#ffd070', size: 20, life: 1.4, vy: -40, outline: '#1a0610' });
        world?.fx?.ring(p.cx, p.cy, { color: '#ffd070', r0: 20, r1: 110, life: 0.5, width: 6 });
        return { dmg: toRider, mounted: true, noStagger: true, cancel: false };
      }
      this.hp = 0;
      // 기수는 공격이 미는 쪽으로 날아간다 (Player.takeHit 의 넉백 방향과 같은 규칙: 뒤에서 맞으면 앞으로)
      const away = attack?.dir || Math.sign(p.cx - (attack?.owner?.cx ?? p.cx)) || -(p.facing || 1);
      this.knockOff(world, p, 'hp', away);
      return { dmg: toRider, mounted: false, noStagger: false, cancel: false };
    }
    if (heavy && !armored) { this.hurtT = 0.25; if (this.chargeT > 0) this.endCharge(world, p, 'hit'); this.act = this.act?.cancelable === false ? this.act : null; }
    return { dmg: toRider, mounted: true, noStagger: armored || !heavy, cancel: false };
  }
  /** 위험 지형 (§3.7). true = 처리함 (영웅 자신의 피해는 건너뛴다) */
  hazard(kind, p, world) {
    world = world ?? this.world;
    if (!this.seated) return false;
    try { const r = this.B?.passive?.hazard?.(this, kind, p, world); if (r === true || r === false) return r; } catch { /* 기본 규칙 */ }
    const def = this.def ?? {}, H = R().hazard, fl = def.flight;
    if (kind === 'deep') { this.dismount(world, p, 'deep'); return true; }
    if (kind === 'spike') {
      const mul = def.hazard?.spike ?? 1;
      if (mul <= 0) return true;
      if (this.hazardT > 0) return true;
      this.hazardT = H.iframes ?? 0.8;
      p.vy = H.spikeVy ?? -560; p.onGround = false; p.jumpCut = true;   // 튕김은 점프 키를 놓아도 반으로 잘리지 않는다
      this.hurtMount(world, p, this.maxHp * (H.spike ?? 0.15) * mul, 'spike');
      return true;
    }
    if (LIQ_HAZ.has(kind)) {
      if (fl && !p.onGround) return true;   // 공중의 비행 탈것은 닿지 않는다
      const mul = def.hazard?.[kind] ?? 1;
      if (mul <= 0) return true;
      if (this.hazardT > 0) return true;
      this.hazardT = H.iframes ?? 0.8;
      if (kind === 'lava') { p.vy = -620; p.onGround = false; p.jumpCut = true; }
      this.hurtMount(world, p, this.maxHp * (H.liquid ?? 0.12) * mul, kind);
      return true;
    }
    // 물 (그 밖의 액체): 헤엄 규칙 (§3.5). 공중의 비행 탈것은 영향 없음
    if (fl && !p.onGround && !this._wet) return true;
    this.inWater = true;
    return true;
  }
  hurtMount(world, p, amount, why) {
    const n = Math.max(1, Math.round(amount));
    this.hp -= n; this.flashT = 0.14;
    world?.fx?.text(p.cx, p.bottom - 20, String(n), { color: '#e8a040', size: 14, life: 0.6, vy: -50 });
    world?.fx?.burst(why === 'lava' ? 'fire' : why === 'spike' || why === 'blood' ? 'blood' : 'goo', p.cx, p.bottom - 8, nq(world, 8), { speed: 140, angle: -Math.PI / 2, spread: 1.4 });
    this.cry(world, { vol: 0.45, pitch: 1.25 });
    if (this.hp <= 0) {
      const s = this.runStore;
      if (this.d?.lastStand && s && !s.lastStand) { s.lastStand = true; this.hp = 1; this.invulnT = Math.max(this.invulnT, 3); world?.fx?.text(p.cx, p.y - 40, cmpText('lastStand', { name: this.name }), { color: '#ffd070', size: 20, life: 1.4, vy: -40, outline: '#1a0610' }); }
      else { this.hp = 0; this.knockOff(world, p, 'hp'); }
    }
  }
  cry(world, o = {}) {
    try { if (typeof ACMP.playCry === 'function') ACMP.playCry(this.def, o); else audio.sfx(this.def?.cry?.sfx ?? 'neigh', o); } catch { /* 소리 없음 */ }
    void world;
  }
  hoof(world, vol = 0.4) {
    const h = this.def?.hoof ?? { sfx: 'gallop', pitch: 1, vol: 1 };
    audio.sfx(h.sfx ?? 'gallop', { vol: vol * (h.vol ?? 1), pitch: (h.pitch ?? 1) * rand(0.94, 1.06) });
    void world;
  }

  // ───────────── 그리기 ─────────────
  draw(ctx, world, p, layer) {
    if (!this.seated) return;
    const o = this._drawO ??= { alpha: 1, tint: null, scale: 1, noFx: false, flash: false };
    o.alpha = this.alpha; o.flash = this.flashT > 0; o.tint = null; o.noFx = q(world) < 0.6;
    drawMountAny(ctx, this, world, layer, o);
  }
  lights(L, p) {
    if (!this.seated) return;
    const lt = this.def?.light;
    if (lt) L.add(p.cx, p.bottom - 50, lt.r ?? 70, lt.color ?? '#fff', lt.i ?? 0.5);
  }
  /** 기수+탈것 잔상 (player.ghostTrail 이 탑승 중 여기로 온다; 돌진 잔상도) */
  ghost(world, p, color = '#8ac8ff', { riderToo = true } = {}) {
    if (!this.seated || q(world) < 0.55 || !world.fx?.ghost) return;
    const ms = snapMount(this);
    const rs = riderToo ? snapRider(this, p) : null;
    world.fx.ghost((ctx, a) => {
      drawMountAny(ctx, ms, world, 'back', { alpha: a, tint: color, noFx: true });
      if (rs) drawHero(ctx, rs, world, { alpha: a, tint: color });
    }, 0.22);
  }
  clearGhosts() { if (this.summonGhost) { this.summonGhost.dead = true; this.summonGhost = null; } }
}
const ADAPT = new WeakMap();
function crossed(a, b, x) { return a <= b ? (x > a && x <= b) : (x > a || x <= b); }

/**
 * 숨결·급강하 충격파의 속성별 색·입자·소리 (스칼렛 mt_wyvern = 화염, 외전 아르겐 mt_argen = 번개; 데이터의 element 로 고른다).
 * breath = drawBreath 의 세 겹 색 (바깥 → 안쪽), loop/gap/vol = 숨결 중 반복 효과음, emit = 숨결 입자, ring/burst/boom = 급강하 착지
 */
const ELEM_FX = {
  fire: { breath: ['#ff4a1a', '#ff9a3a', '#ffe0a0'], light: '#ff8a3a', loop: 'fire_breath', gap: 0.2, vol: 0.7, emit: 'fire', ring: '#ff8a3a', burst: 'fire', boom: 'explode' },
  thunder: { breath: ['#4aa8ff', '#9fe8ff', '#f4fbff'], light: '#bfe8ff', loop: 'thunder', gap: 0.32, vol: 0.4, emit: 'thunder', ring: '#bfe8ff', burst: 'thunder', boom: 'thunder' },
};
const elemFx = (el) => ELEM_FX[el] ?? ELEM_FX.fire;

// ───────────────────────── 특수기 여섯 (1부) ─────────────────────────
const SPECIALS = {
  /** 그림메인 「앞발 강타」: 앞발을 치켜들고 (0.3초 무적) 내리찍어 좌우 넓게 띄운다 */
  stomp(r, world, p, sp) {
    r.startAct({ name: 'rear', dur: sp.rear ?? 0.3, anim: 'rear', riderAnim: 'ride_rear', moveMul: 0, rearK: 1, invuln: sp.invuln ?? 0.3, noJump: true,
      end(rr, w, pp) {
        const b = sp.box ?? { x: -180, y: -64, w: 360, h: 64 };
        rr.strike(w, { x: pp.cx + b.x, y: pp.bottom + b.y, w: b.w, h: b.h }, rr.atk({ mv: rr.power(sp.mv ?? 1.6), launch: !!sp.launch, kb: sp.kb ?? [360, -520], hitstop: sp.hitstop ?? 0.08, shake: sp.shake ?? 8, tags: ['mount', 'special'], breakWalls: true }, pp));
        stompFx(w, pp, '#c8b8a0', sp.shake ?? 8);
        rr.startAct({ name: 'stomp', dur: 0.22, anim: 'special', riderAnim: 'ride', moveMul: 0.2, rearK: 0 });
      } });
    r.cry(world, { vol: 0.9 });
    world.fx?.burst('smoke', p.cx + p.facing * 40, p.bottom - 70, nq(world, 3), { speed: 30, color: '#6a6a6a' });
  },
  /** 바르그 「땅 파헤치기」: 땅을 파서 바위 세 덩이를 흩뿌린다 */
  rocks(r, world, p, sp) {
    r.startAct({ name: 'dig', dur: 0.26, anim: 'dig', riderAnim: 'ride', moveMul: 0.3,
      end(rr, w, pp) {
        const f = pp.facing || 1;
        for (const rk of sp.rocks ?? [{ vx: 360, vy: -520 }, { vx: 460, vy: -450 }, { vx: 560, vy: -380 }]) {
          w.spawnProjectile({
            x: pp.cx + f * 34, y: pp.bottom - 20, vx: f * rk.vx, vy: rk.vy, w: 22, h: 22, behavior: 'arc', collideWalls: 'land', life: 2.2, pierce: 3,
            render: drawRock, color: '#8a7a6a', spin: f * 9, owner: pp,
            attack: rr.atk({ mv: rr.power(sp.mv ?? 0.9), kb: [260, -280], hitstop: 0.05, shake: 3, hitId: undefined, tags: ['mount', 'special', 'projectile'] }, pp),
            onLand(pr, ww) { rockBurst(rr, ww, pp, pr, sp); pr.dead = true; },
            onExpire(pr, ww, byHit) { if (!byHit) return; rockBurst(rr, ww, pp, pr, sp); },
          });
        }
        w.fx?.burst('gravel', pp.cx + f * 30, pp.bottom - 6, nq(w, 14), { angle: -Math.PI / 2 - f * 0.5, spread: 0.8, speed: 300 });
        w.fx?.burst('dust', pp.cx + f * 30, pp.bottom, nq(w, 10), { speed: 120 });
        w.camera?.shake?.(3, 0.15);
        audio.sfx('break_wall', { vol: 0.6, pitch: 1.2 });
      } });
    r.cry(world, { vol: 0.9 });
  },
  /** 코슈타 「저승 사슬」: 앞쪽 세 곳에서 사슬 기둥이 차례로 솟는다 */
  chains(r, world, p, sp) {
    const at = sp.at ?? [70, 150, 230], f = p.facing || 1, x0 = p.cx, b0 = p.bottom;
    const fire = (i) => (rr, w) => {
      const x = x0 + f * at[i], hw = sp.w ?? 44, hh = sp.h ?? 160;
      const g = groundAt(w, x, b0);
      rr.hit(w, {
        x: x - hw / 2, y: g - hh, w: hw, h: hh, life: sp.life ?? 0.5, z: 7,
        attack: rr.atk({ mv: rr.power(sp.mv ?? 0.8), type: 'mag', element: sp.element ?? 'dark', stun: sp.stun ?? 1.2, kb: [80, -380], launch: true, hitstop: 0.06, shake: 3, tags: ['mount', 'special'] }, w.player),
        light: { r: 110, color: '#6ad0ff', i: 0.7 },
        render: drawChainPillar,
      });
      w.fx?.burst('soul', x, g - 10, nq(w, 10), { angle: -Math.PI / 2, spread: 0.5, speed: 260, color: '#8ae8ff' });
      w.fx?.burst('gravel', x, g - 4, nq(w, 6), { angle: -Math.PI / 2, spread: 1.2, speed: 200 });
      audio.sfx('dark', { vol: 0.55, pitch: 0.8 + i * 0.08 });
    };
    const st = sp.stagger ?? 0.08;
    r.startAct({ name: 'chains', dur: st * 2 + 0.2, anim: 'special', riderAnim: 'ride_rear', moveMul: 0.4, at: [[0, fire(0)], [st, fire(1)], [st * 2, fire(2)]] });
    world.camera?.shake?.(R().special.shake ?? 6, 0.22);
    r.cry(world, { vol: 0.8 });
  },
  /** 스콜 「서리 포효」: 주위를 얼리고 5초 동안 공격 속도 +15% */
  roar(r, world, p, sp) {
    const rad = sp.r ?? 260;
    r.strike(world, { x: p.cx - rad, y: p.cy - rad, w: rad * 2, h: rad * 2 }, r.atk({ mv: r.power(sp.mv ?? 0.8), type: 'mag', element: sp.element ?? 'ice', stun: sp.stun ?? 1.0, kb: [240, -200], hitstop: R().special.hitstop ?? 0.08, shake: 6, tags: ['mount', 'special'] }, p));
    const fx = world.fx;
    fx?.ring(p.cx, p.cy, { color: '#bff4ff', r0: 30, r1: rad, life: 0.45, width: 10 });
    fx?.ring(p.cx, p.cy, { color: '#ffffff', r0: 10, r1: rad * 0.7, life: 0.3, width: 4 });
    fx?.burst('ice', p.cx, p.cy, nq(world, 26), { speed: 380 });
    fx?.flash(p.cx, p.cy, { color: '#bff4ff', size: rad, life: 0.14 });
    world.camera?.shake?.(R().special.shake ?? 6, 0.25);
    audio.sfx('wolf_howl', { vol: 1 }); audio.sfx('ice', { vol: 0.6 });
    const b = sp.buff;
    if (b?.dur) { r.roarT = b.dur; p.refreshStats?.(); fx?.text(p.cx, p.y - 58, `공격 속도 +${b.atkSpd}%`, { color: '#8ae8ff', size: 15, life: 1.2, vy: -40 }); }
    r.startAct({ name: 'howl', dur: 0.5, anim: 'howl', riderAnim: 'ride_rear', moveMul: 0.4 });
  },
  /** 스칼렛 「화염 숨결」 · 아르겐 「은빛 번개 숨결」: 1초 동안 입 앞으로 숨결 (공중 가능, 낙하 제한). 색·입자·소리는 속성(sp.element)대로 */
  breath(r, world, p, sp) {
    const bw = sp.box?.w ?? 220, bh = sp.box?.h ?? 80, dur = sp.dur ?? 1.0, E = elemFx(sp.element ?? 'fire');
    const atk = r.atk({ mv: r.power(sp.mv ?? 0.35), type: sp.type ?? 'mag', element: sp.element ?? 'fire', rehit: sp.rehit ?? 0.12, kb: [120, -60], hitstop: 0.02, shake: 1, stun: sp.stun ?? 0.12, tags: ['mount', 'special'] }, p);
    let act = null;
    const hb = r.hit(world, {
      x: p.cx, y: p.bottom - 90, w: bw, h: bh, life: dur, z: 12, attack: atk,
      follow(h) {   // 입을 따라간다. 숨결이 끊기면 (하차·강타·방 이동) 곧바로 꺼진다
        const pp = world.player, f = pp?.facing || 1;
        if (!pp || !r.seated || (act && r.act !== act)) { h.life = 0; return; }
        const mx = pp.cx + f * 40, my = pp.bottom - 78; h.x = f > 0 ? mx : mx - bw; h.y = my - bh / 2; h.data = f;
      },
      light: { r: 150, color: E.light, i: 0.8 },
      cols: E.breath,
      render: drawBreath,
    });
    hb.t0 = world.time;
    let sfxT = 0;
    act = r.startAct({ name: 'breath', dur, anim: 'breath', riderAnim: 'ride', moveMul: 0.5, vyMax: sp.vyMax ?? 60, noGlide: true, noFly: true,
      tick(rr, w, pp, a, dt) {
        sfxT -= dt;
        if (sfxT <= 0) { sfxT = E.gap; audio.sfx(E.loop, { vol: E.vol }); }
        if (Math.random() < 0.7 * q(w)) { const f = pp.facing || 1; w.fx?.emit(E.emit, pp.cx + f * rand(50, bw), pp.bottom - 78 + rand(-25, 25), { angle: f > 0 ? 0 : Math.PI, spread: 0.3, speed: rand(200, 360) }); }
      },
      end() { hb.life = Math.min(hb.life, 0.01); } });
    r.cry(world, { vol: 0.7 });
  },
  /** 녹티스 「초음파」: 앞쪽을 오래 경직시키고 4초 동안 5칸 안의 비밀을 드러낸다 */
  sonar(r, world, p, sp) {
    const bw = sp.box?.w ?? 360, bh = sp.box?.h ?? 160, f = p.facing || 1;
    r.strike(world, p.relRect(10, -p.h * 0.5 - bh / 2, bw, bh), r.atk({ mv: r.power(sp.mv ?? 0.6), type: sp.type ?? 'mag', element: sp.element ?? 'dark', stun: sp.stun ?? 1.2, kb: [200, -120], hitstop: R().special.hitstop ?? 0.08, shake: 4, tags: ['mount', 'special'] }, p));
    for (let i = 0; i < 3; i++) world.fx?.ering?.(p.cx + f * (40 + i * 70), p.cy - 10, { color: '#ff6a7a', r0: 10 + i * 10, r1: 90 + i * 30, ry: 1.4, life: 0.35 + i * 0.08, width: 3 });
    audio.sfx('screech', { vol: 1 });
    world.camera?.shake?.(R().special.shake ?? 6, 0.2);
    const rv = sp.reveal;
    if (rv) world.add(new SecretSight(p, rv.tiles ?? 5, rv.dur ?? 4));
    r.startAct({ name: 'screech', dur: 0.4, anim: 'screech', riderAnim: 'ride', moveMul: 0.6 });
  },
};
function rockBurst(r, world, p, pr, sp) {
  if (pr._burst) return;
  pr._burst = true;
  const b = sp.burst ?? { r: 30, mv: 0.5 };
  r.strike(world, { x: pr.cx - b.r, y: pr.cy - b.r, w: b.r * 2, h: b.r * 2 }, r.atk({ mv: r.power(b.mv ?? 0.5), kb: [200, -260], hitstop: 0.03, shake: 2, tags: ['mount', 'special'] }, p));
  world.fx?.burst('gravel', pr.cx, pr.cy, nq(world, 10), { speed: 240 });
  world.fx?.burst('dust', pr.cx, pr.cy, nq(world, 5), { speed: 80 });
  audio.sfx('hit_stone', { vol: 0.5 });
}
function stompFx(world, p, col, shake) {
  const fx = world.fx;
  fx?.ering?.(p.cx, p.bottom, { color: col, r0: 10, r1: 200, ry: 0.22, life: 0.45, width: 8 });
  fx?.burst('shard', p.cx, p.bottom - 4, nq(world, 18), { angle: -Math.PI / 2, spread: 1.3, speed: 380, color: '#8a7a6a' });
  fx?.burst('dust', p.cx, p.bottom, nq(world, 18), { speed: 220 });
  world.camera?.shake?.(shake, 0.3);
  audio.sfx('hoof_land', { vol: 1.1 }); audio.sfx('explode', { vol: 0.5, pitch: 0.8 });
  input.rumble?.(0.6, 0.4, 140);
}
/** x 열에서 from 부근의 바닥 y (없으면 from) */
function groundAt(world, x, from) {
  const m = world.map;
  if (!m?.groundBelow) return from;
  const tx = Math.floor(x / TILE), ty = Math.max(0, Math.floor((from - TILE) / TILE));
  const g = m.groundBelow(tx, ty);
  return g != null && g - from < TILE * 3 ? g : from;
}

/** 녹티스 초음파: 몇 초 동안 주변의 부서지는 벽·가짜 벽 테두리를 보여 준다 (미네르바의 눈과 같은 표시) */
class SecretSight extends Entity {
  constructor(p, tiles, dur) {
    super(p.cx - tiles * TILE, p.cy - tiles * TILE, tiles * TILE * 2, tiles * TILE * 2);
    this.kind = 'effect'; this.z = 8; this.life = dur; this.maxLife = dur; this.list = null; this.tiles = tiles; this.src = p;
  }
  update(dt, world) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.list) return;
    const m = world.map, p = this.src, R0 = this.tiles, ptx = Math.floor(p.cx / TILE), pty = Math.floor(p.cy / TILE), out = [];
    for (let ty = pty - R0; ty <= pty + R0; ty++) for (let tx = ptx - R0; tx <= ptx + R0; tx++) {
      if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
      const t = m.typeAt(tx, ty);
      if (t === T.BREAK || (t === T.FAKE && !m.revealed?.has?.(m.idx(tx, ty)))) out.push(tx, ty);
    }
    this.list = out;
    if (out.length) audio.sfx('secret', { vol: 0.5 });
  }
  draw(ctx, world) {
    const L = this.list;
    if (!L || !L.length) return;
    const k = Math.min(1, this.life / 0.5, this.t / 0.2);
    ctx.save();
    ctx.globalAlpha = (0.35 + 0.25 * Math.sin(world.time * 6)) * k;
    ctx.strokeStyle = '#ff8a9a'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < L.length; i += 2) ctx.rect(L[i] * TILE + 2, L[i + 1] * TILE + 2, TILE - 4, TILE - 4);
    ctx.stroke();
    ctx.restore();
  }
}

// ───────────────────────── 잠깐 보이는 탈것 (MountGhost) ─────────────────────────
/**
 * mode: 'summon' (붉은 안개에서 나타남, 기수를 따라감) · 'dismiss' (앞발 들고 안개로 흩어짐) · 'knocked' (비틀 0.4초 → 500px/s 로 달아나며 1.2초 동안 흐려짐)
 *       'ult' (30% 투명도로 뒤쪽 화면 밖으로 물러남) · 'fade' (그 자리에서 사라짐)
 */
export class MountGhost extends Entity {
  constructor(x = 0, y = 0, w = 120, h = 110, o = {}) {
    super(x - w / 2, y - h, w, h);
    this.kind = 'effect'; this.z = o.z ?? 9;
    this.mode = o.mode ?? 'fade';
    this.rider = o.rider ?? null; this.p = o.p ?? null;
    this.id = o.id ?? null; this.def = o.def ?? (this.id && Object.hasOwn(MOUNTS, this.id) ? MOUNTS[this.id] : null);
    this.rig = this.def?.rig ?? 'horse'; this.variant = this.def?.variant ?? null;
    this.facing = o.facing ?? 1; this.dir = o.dir ?? this.facing;
    this.anim = this.mode === 'summon' ? 'summon' : this.mode === 'dismiss' ? 'dismiss' : this.mode === 'knocked' ? 'knocked' : 'run';
    this.animT = 0; this.phase = 0; this.gait = 'idle'; this.speedK = 0; this.skid = false;
    this.alpha = this.mode === 'summon' ? 0 : 1; this.scale = 1; this.pitch = 0; this.rearK = 0; this.bob = 0; this.duck = 0; this.lean = 0;
    this.wingK = this.def?.flight ? 0.6 : 0; this.flapT = 0; this.flashT = 0; this.inWater = false; this.gliding = false; this.flying = false; this.diving = false;
    this.stamina = null; this.staminaMax = null; this.awakened = false; this.rank = 0; this.lv = 1; this.state = this.mode;
    this.pose = null; this.fallback = true; this.onGround = true; this.vx = 0; this.vy = 0;
    this.feetY = y; this.fell = false;
  }
  update(dt, world) {
    const m = this.mode;
    if (m === 'view') return;   // 메뉴 미리보기: updateMountView 가 움직인다
    this.t += dt; this.animT += dt;
    if (m === 'summon') {
      const r = this.rider, p = this.p;
      if (!r || !p || r.seated || r.state !== 'summoning' || this.t > 0.6) { this.dead = true; return; }
      this.facing = p.facing || 1;
      this.cx = p.cx - this.facing * lerp(26, 0, clamp(this.t / 0.25, 0, 1));
      this.bottom = r.def?.flight && !p.onGround ? p.bottom + lerp(-60, 0, clamp(this.t / 0.25, 0, 1)) : Math.max(p.bottom, this.bottom);
      this.alpha = clamp(this.t / 0.3, 0, 1); this.scale = 0.9 + 0.1 * this.alpha;
      if (Math.random() < 0.5 * q(world)) world.fx?.emit('bloodmist', this.cx + rand(-40, 40), this.bottom - rand(10, 70), { speed: 30 });
    } else if (m === 'dismiss') {
      this.rearK = clamp(this.t / 0.18, 0, 1) * 0.7; this.pitch = -0.5 * this.rearK;
      this.alpha = clamp(1 - this.t / 0.42, 0, 1);
      if (Math.random() < 0.6 * q(world)) world.fx?.emit(Math.random() < 0.5 ? 'smoke' : 'dark', this.cx + rand(-40, 40), this.bottom - rand(20, 80), { speed: 40 });
      if (this.t > 0.42) this.dead = true;
    } else if (m === 'knocked') {
      if (this.t < 0.4) {
        this.anim = 'knocked'; this.pitch = 0.18 * Math.sin(this.t * 24) * (1 - this.t / 0.4) + 0.12; this.vx = 0;
        if (!this.fell && world.map) {   // 공중에서 쓰러졌으면 바닥까지 떨어진다
          this.vy = (this.vy || 0);
          const body = { x: this.cx - 20, y: this.bottom - 40, w: 40, h: 40, vx: 0, vy: this.vy, onGround: false };
          moveBody(body, dt, world.map, null);
          this.vy = body.vy; this.bottom = body.y + body.h; if (body.onGround) this.fell = true;
        }
      } else {
        this.anim = 'flee'; this.pitch = 0; this.facing = this.dir; this.vx = this.dir * (R().knock.flee ?? 500);
        this.cx += this.vx * dt;
        this.alpha = clamp(1 - (this.t - 0.4) / (R().knock.fade ?? 1.2), 0, 1);
        if (this.alpha <= 0) this.dead = true;
      }
    } else if (m === 'ult') {
      this.anim = 'run'; this.facing = -this.dir; this.vx = this.facing * 420; this.cx += this.vx * dt;
      this.alpha = 0.3 * clamp(1 - this.t / 0.9, 0, 1);
      if (this.t > 0.9) this.dead = true;
    } else {
      this.alpha = clamp(1 - this.t / 0.3, 0, 1);
      if (this.t > 0.3) this.dead = true;
    }
    this.speedK = Math.abs(this.vx) / 400; this.gait = Math.abs(this.vx) > 20 ? 'run' : 'idle';
    this.phase = (this.phase + Math.abs(this.vx) * dt / 110) % 1;
    this.bob = this.gait === 'run' ? Math.sin(this.phase * TAU * 2) * 4 : 0;
    let pose = null;
    try { pose = typeof RIG.mountPose === 'function' ? RIG.mountPose(this, dt) : null; } catch { pose = null; }
    this.pose = pose; this.fallback = !pose;
  }
  draw(ctx, world) {
    if (this.alpha <= 0.01) return;
    const o = { alpha: this.alpha, tint: this.mode === 'ult' ? '#ff6a7a' : null, scale: this.scale, noFx: q(world) < 0.6, flash: false };
    ctx.save();
    if (this.mode === 'summon' || this.mode === 'dismiss') { ctx.shadowColor = '#ff2040'; ctx.shadowBlur = q(world) >= 0.95 ? 14 : 0; }
    drawMountAny(ctx, this, world, 'back', o);
    drawMountAny(ctx, this, world, 'front', o);
    ctx.restore();
  }
}

// ───────────────────────── 메뉴 미리보기 (CMP-UI 「동료」 탭 · companions §7.2, §11.4 5번) ─────────────────────────
/**
 * 탈것 모습 하나 (월드 밖). 원점 = 발 중앙 (0, 0) → 그리는 쪽이 ctx 를 옮기고 확대한다.
 *   const v = mountView('mt_warhorse');   매 프레임: updateMountView(v, dt, 'run');
 *   drawMountView(ctx, v, 'back'); drawHero(ctx, { ...heroView, cx: 0, bottom: 0, ride: v.ride, rig: myRig }, null, {}); drawMountView(ctx, v, 'front');
 * anim: 'idle' | 'walk' | 'run' | 'special' | 'charge' | 'jump' | 'fall' | 'glide' | 'hover' | … (탈것 애니메이션 이름)
 * v.ride 는 drawHero 의 p.ride 계약 그대로 (sx, sy 는 이 원점 기준). 알 수 없는 id 면 null
 */
export function mountView(id, { anim = 'idle', facing = 1 } = {}) {
  const def = id && Object.hasOwn(MOUNTS, id) ? MOUNTS[id] : null;
  if (!def) return null;
  const v = new MountGhost(0, 0, 120, 110, { mode: 'view', id, def, facing });
  v.anim = anim; v.alpha = 1; v.onGround = true; v.state = 'view';
  v.ride = { sx: 0, sy: 0, lean: 0, duck: 0, footY: def.footY ?? 20, legs: def.legs ?? 'straddle', reins: true, gait: 'idle', phase: 0 };
  v.seatPt = { x: 0, y: 0, lean: 0 };
  updateMountView(v, 0);
  return v;
}
const VIEW_AIR = new Set(['jump', 'fall', 'glide', 'hover', 'flap', 'dive']);
export function updateMountView(v, dt = 1 / 60, anim = null) {
  if (!v) return v;
  if (anim && anim !== v.anim) { v.anim = anim; v.animT = 0; }
  v.t += dt; v.animT += dt;
  const a = v.anim, run = a === 'run' || a === 'charge', sp = run ? 420 : a === 'walk' ? 200 : 0;
  v.vx = sp * v.facing; v.vy = a === 'fall' ? 300 : a === 'jump' ? -300 : 0; v.speedK = sp / 400;
  v.onGround = !VIEW_AIR.has(a);
  v.gait = run ? 'run' : a === 'walk' ? 'walk' : v.onGround ? 'idle' : v.def?.flight ? 'fly' : 'air';
  v.phase = (v.phase + sp * dt / (run ? 110 : 70)) % 1;
  v.rearK = a === 'special' || a === 'rear' ? clamp(Math.sin(Math.min(1, v.animT / 0.6) * Math.PI) * 1.2, 0, 1) : 0;
  v.pitch = -0.7 * v.rearK;
  v.bob = run ? Math.sin(v.phase * TAU * 2) * 4.5 : a === 'walk' ? -Math.abs(Math.sin(v.phase * TAU * 2)) * 1.5 : a === 'idle' ? Math.sin(v.t * 2.2) * 0.8 : 0;
  v.wingK = !v.def?.flight ? 0 : v.onGround ? 0.1 : a === 'glide' ? 1 : 0.85;
  let pose = null;
  try { pose = typeof RIG.mountPose === 'function' ? RIG.mountPose(v, dt) : null; } catch { pose = null; }
  v.pose = pose; v.fallback = !pose;
  const s = v.seatPt;
  let ok = false;
  if (pose) { try { RIG.seatOf(pose, s); ok = Number.isFinite(s.x) && Number.isFinite(s.y) && (s.x !== 0 || s.y !== 0); } catch { ok = false; } }
  if (!ok) seatFallback(v, v.facing, v.cx, v.bottom, s);
  const r = v.ride;
  r.sx = s.x; r.sy = s.y; r.lean = (s.lean ?? 0) + (run ? 0.12 : 0) + (a === 'rear' || a === 'special' ? -0.25 : 0); r.gait = v.gait; r.phase = v.phase;
  return v;
}
export function drawMountView(ctx, v, layer = 'back', o = {}) {
  if (!v) return;
  drawMountAny(ctx, v, null, layer, { alpha: 1, tint: null, scale: 1, noFx: false, flash: false, ...o });
}
/** 데이터 안장 + 들썩임 + 앞들기 회전 (리그가 없을 때) */
function seatFallback(m, facing, cx, bottom, out) {
  const f = facing < 0 ? -1 : 1, d = m.def?.seat ?? { x: -4, y: -56 };
  let lx = d.x, ly = d.y + (m.bob ?? 0);
  const a = m.pitch ?? 0;
  if (Math.abs(a) > 0.001) {
    const px = FB_SHAPE[m.rig]?.hipX ?? -24, c = Math.cos(a), sn = Math.sin(a);
    const dx = lx - px, dy = ly;
    lx = px + dx * c - dy * sn; ly = dx * sn + dy * c;
  }
  out.x = cx + f * lx; out.y = bottom + ly; out.lean = 0;
  return out;
}

// ───────────────────────── 그림: 리그가 있으면 mounts.js, 없으면 대체 그림 ─────────────────────────
function drawMountAny(ctx, m, world, layer, o) {
  if (m.pose && !m.fallback && typeof MDRAW.drawMount === 'function') {
    try { MDRAW.drawMount(ctx, m, world, layer, o); return; } catch (e) { warnOnce('draw' + m.id, '[mount] drawMount', e); }
  }
  drawFallback(ctx, m, layer, o);
}
function snapMount(m) {
  let pose = m.pose;
  if (pose && typeof structuredClone === 'function') { try { pose = structuredClone(pose); } catch { /* 참조 그대로 */ } }
  return {
    id: m.id, def: m.def, rig: m.rig, variant: m.variant, state: m.state, anim: m.anim, animT: m.animT, t: m.t, cx: m.cx, bottom: m.bottom,
    facing: m.facing, vx: m.vx, vy: m.vy, onGround: m.onGround, speedK: m.speedK, gait: m.gait, phase: m.phase, skid: m.skid, pitch: m.pitch,
    rearK: m.rearK, duck: m.duck, lean: m.lean, bob: m.bob, wingK: m.wingK, flapT: m.flapT, inWater: m.inWater, gliding: m.gliding, flying: m.flying,
    diving: m.diving, stamina: m.stamina, staminaMax: m.staminaMax, flashT: 0, alpha: 1, awakened: m.awakened, rank: m.rank, lv: m.lv, pose, fallback: m.fallback, scale: 1,
  };
}
function snapRider(m, p) {
  const v = Object.assign({}, m.riderView(p));
  v.ride = { ...m.rideO }; v.rig = null; v.snapshot = true;
  return v;
}

// ── 대체 그림 (CMP-MOUNT-ART 가 오기 전 · 그림이 실패할 때). 원점 = 발 중앙, 오른쪽을 본다. back = 먼 다리·몸·가까운 다리·목·머리, front = 등자 끈·고삐·가까운 날개 ──
const FB_SHAPE = {
  horse: { kind: 'quad', bodyX: -2, bodyY: -48, rx: 36, ry: 15, shX: 21, hipX: -25, jointY: -44, l1: 21, l2: 23, lw: [13, 8], neckX: 24, neckY: -56, headX: 42, headY: -84, headA: 0.55, headL: 29, neckW: 21, head: 'horse', tail: 'hair', mane: 'hair', stride: [30, 54], lift: [9, 17] },
  stag: { kind: 'quad', bodyX: -2, bodyY: -48, rx: 33, ry: 13, shX: 19, hipX: -23, jointY: -43, l1: 22, l2: 23, lw: [11, 6], neckX: 22, neckY: -55, headX: 39, headY: -82, headA: 0.5, headL: 24, neckW: 17, head: 'stag', tail: 'short', mane: 'fur', stride: [30, 56], lift: [10, 18] },
  boar: { kind: 'quad', bodyX: -2, bodyY: -38, rx: 37, ry: 18, shX: 19, hipX: -23, jointY: -30, l1: 15, l2: 16, lw: [15, 10], neckX: 27, neckY: -42, headX: 42, headY: -40, headA: 1.25, headL: 26, neckW: 26, head: 'boar', tail: 'curl', mane: 'bristle', stride: [22, 40], lift: [6, 11] },
  wolf: { kind: 'quad', bodyX: 0, bodyY: -39, rx: 33, ry: 12, shX: 20, hipX: -22, jointY: -35, l1: 18, l2: 19, lw: [12, 7], neckX: 23, neckY: -44, headX: 37, headY: -60, headA: 0.9, headL: 25, neckW: 19, head: 'wolf', tail: 'bush', mane: 'fur', stride: [28, 60], lift: [8, 17] },
  griffin: { kind: 'quad', bodyX: -2, bodyY: -42, rx: 32, ry: 13, shX: 19, hipX: -22, jointY: -38, l1: 19, l2: 20, lw: [12, 7], neckX: 22, neckY: -48, headX: 34, headY: -66, headA: 0.8, headL: 20, neckW: 18, head: 'eagle', tail: 'tuft', mane: 'feather', wings: true, stride: [28, 56], lift: [8, 16] },
  wyvern: { kind: 'biped', bodyX: -4, bodyY: -52, rx: 30, ry: 16, hipX: -12, jointY: -44, l1: 21, l2: 23, lw: [13, 8], neckX: 18, neckY: -60, headX: 42, headY: -88, headA: 0.4, headL: 26, neckW: 14, head: 'wyrm', tail: 'spade', wings: true, stride: [26, 46], lift: [8, 14] },
  bat: { kind: 'bat', bodyX: 0, bodyY: -44, rx: 28, ry: 20, hipX: -12, jointY: -30, l1: 13, l2: 15, lw: [9, 6], neckX: 18, neckY: -50, headX: 30, headY: -58, headA: 0.2, headL: 16, head: 'bat', tail: 'none', wings: true, stride: [24, 40], lift: [6, 10] },
};
const FB_COL = {
  mt_warhorse: { coat: '#2e2c40', dark: '#15121c', hi: '#5c6488', mane: '#b01a30', cloth: '#8a1020', trim: '#c8a040', eye: '#ff6a2a', metal: '#707684', hoof: '#3a3a44' },
  mt_boar: { coat: '#5a3a24', dark: '#2e1e12', hi: '#80583a', mane: '#241810', cloth: '#5a3020', trim: '#8a8e9a', eye: '#ff4a2a', metal: '#c8ccd8', hoof: '#1a120c' },
  mt_skelsteed: { coat: '#d8d0bc', dark: '#8a8478', hi: '#f4eee0', mane: '#6ad0ff', cloth: '#1a1418', trim: '#6ad0ff', eye: '#8ae8ff', metal: '#4a4a56', hoof: '#6a6458', bones: true, flame: '#6ad0ff' },
  mt_direwolf: { coat: '#c8d8e8', dark: '#6a7a8a', hi: '#f4faff', mane: '#8aa0b4', cloth: '#3a2a20', trim: '#e8e0d0', eye: '#8ae8ff', metal: '#9aa6b0', hoof: '#4a5460' },
  mt_wyvern: { coat: '#a01828', dark: '#5a0a14', hi: '#d8404a', mane: '#2a1418', cloth: '#3a1a10', trim: '#ffd070', eye: '#ffd070', metal: '#ff8a3a', hoof: '#2a1418', belly: '#ff9a4a', wing: '#7a1020' },
  mt_argen: { coat: '#c8d2de', dark: '#6a7688', hi: '#f4f8ff', mane: '#2a3450', cloth: '#2a3450', trim: '#6ad0e0', eye: '#8af0ff', metal: '#9fe8ff', hoof: '#1a2030', belly: '#a8e8f0', wing: '#9aa8bc' },
  mt_giantbat: { coat: '#2a1e24', dark: '#141016', hi: '#4a3440', mane: '#3a1a24', cloth: '#c8c8d0', trim: '#c8c8d0', eye: '#ff2a3a', metal: '#c8c8d0', hoof: '#141016', wing: '#4a1422' },
  mt_ignis: { coat: '#2a140c', dark: '#150a06', hi: '#6a2e14', mane: '#ff8a2a', cloth: '#6a1a0a', trim: '#ffc040', eye: '#fff0b0', metal: '#3a2a20', hoof: '#1a0e0a', flame: '#ff8a2a' },
  mt_gale: { coat: '#c8b898', dark: '#6a5a4a', hi: '#efe4cc', mane: '#f4f0e8', cloth: '#3a4a6a', trim: '#ffe880', eye: '#9fd0ff', metal: '#d8c890', hoof: '#4a4038', wing: '#d8d0c0' },
  mt_silva: { coat: '#eeeee4', dark: '#a8a898', hi: '#ffffff', mane: '#e8f0c8', cloth: '#6a8a5a', trim: '#fff8d0', eye: '#fff8d0', metal: '#d8c890', hoof: '#8a8474' },
};
const DEF_COL = FB_COL.mt_warhorse;
const OUT = '#0a0608';
const GAITS = {
  walk: { off: [0, 0.25, 0.5, 0.75], duty: 0.65 },     // 먼 뒷발 · 먼 앞발 · 가까운 뒷발 · 가까운 앞발
  run: { off: [0, 0.55, 0.12, 0.45], duty: 0.35 },
  trot: { off: [0, 0.5, 0.5, 0], duty: 0.5 },
  bound: { off: [0, 0.5, 0.08, 0.58], duty: 0.35 },
};
function footOf(ph, duty, stride, lift) {
  ph = ((ph % 1) + 1) % 1;
  if (ph < duty) return { x: stride * (0.5 - ph / duty), y: 0 };
  const k = (ph - duty) / (1 - duty);
  return { x: stride * (-0.5 + k), y: -lift * Math.sin(k * Math.PI) };
}
function ik(ax, ay, fx, fy, l1, l2, bend) {
  const dx = fx - ax, dy = fy - ay;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01) || 0.01;
  const a = Math.atan2(dy, dx), c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const k = a + bend * Math.acos(c);
  return { x: ax + Math.cos(k) * l1, y: ay + Math.sin(k) * l1 };
}
function drawFallback(ctx, m, layer, o = {}) {
  const S = FB_SHAPE[m.rig] ?? FB_SHAPE.horse;
  const C0 = FB_COL[m.id] ?? DEF_COL;
  const tint = o.tint ?? null;
  const flash = !tint && (o.flash || (m.flashT > 0));
  const col = (c) => tint ?? (flash ? lighter(c) : c);   // 피격 번쩍임: 모든 색을 밝게
  const alpha = clamp((o.alpha ?? 1) * (m.alpha ?? 1), 0, 1);
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(m.cx, m.bottom);
  let sx = m.facing < 0 ? -1 : 1;
  if (m.anim === 'turn') sx *= 0.45 + 0.55 * clamp(m.animT / 0.18, 0, 1);
  const sc = (o.scale ?? 1) * (m.scale ?? 1);
  ctx.scale(sx * sc, sc);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const P = fbParts(m, S);
  if (layer === 'front') { drawFront(ctx, m, S, C0, col, P); ctx.restore(); return; }
  if (S.kind === 'quad') drawQuad(ctx, m, S, C0, col, P, o);
  else if (S.kind === 'biped') drawWyrm(ctx, m, S, C0, col, P, o);
  else drawBat(ctx, m, S, C0, col, P, o);
  ctx.restore();
}
/** 포즈 계산 (대체 그림 전용): 몸 중심 · 기울기 · 네 발 */
function fbParts(m, S) {
  const bob = m.bob ?? 0, pitch = m.pitch ?? 0;
  const px = S.hipX, c = Math.cos(pitch), s = Math.sin(pitch);
  const rot = (x, y) => { const dx = x - px, dy = y; return { x: px + dx * c - dy * s, y: dx * s + dy * c + bob }; };
  const a = m.anim, gait = a === 'run' || a === 'charge' || a === 'flee' ? 'run' : a === 'walk' ? 'walk' : null;
  const G = gait === 'run' ? (S.head === 'boar' ? GAITS.trot : S.head === 'wolf' ? GAITS.bound : GAITS.run) : GAITS.walk;
  const stride = gait === 'run' ? S.stride[1] : S.stride[0], lift = gait === 'run' ? S.lift[1] : S.lift[0];
  const ph = m.phase ?? 0, t = m.t ?? 0;
  const feet = [];
  for (let i = 0; i < 4; i++) {
    const fore = i === 1 || i === 3;
    const jx = fore ? S.shX ?? 18 : S.hipX;
    let f;
    if (gait) f = footOf(ph + G.off[i], G.duty, stride, lift);
    else if (a === 'jump' || a === 'flap' || a === 'glide' || a === 'hover' || a === 'dive' || a === 'wall') f = { x: fore ? 12 : -10, y: fore ? -18 : -12 };
    else if (a === 'fall') f = { x: fore ? 8 : -6, y: -4 };
    else if (a === 'swim') { const k = (ph + i * 0.25) * TAU; f = { x: Math.cos(k) * 10, y: -10 + Math.sin(k) * 7 }; }
    else if (a === 'knocked' || a === 'hurt') f = { x: fore ? 6 + i : -6 - i, y: 0 };
    else if (a === 'land') f = { x: fore ? 4 : -4, y: 0 };
    else f = { x: (fore ? 1 : -1) * (i < 2 ? 2 : 0) + Math.sin(t * 1.3 + i) * 0.4, y: 0 };
    let fx = jx + f.x, fy = f.y;
    if (fore && (m.rearK ?? 0) > 0.05) { const j = rot(jx, S.jointY); fx = j.x + 10 + Math.sin(t * 18 + i) * 4; fy = j.y + 18; }   // 앞들기: 앞발 허우적
    feet.push({ x: fx, y: fy, fore, near: i >= 2 });
  }
  return { rot, pitch, bob, feet, gait };
}
function leg(ctx, m, S, P, i, color, dark, hoofCol, bones) {
  const ft = P.feet[i], fore = ft.fore;
  const j = P.rot(fore ? S.shX ?? 18 : S.hipX, S.jointY);
  const kn = ik(j.x, j.y, ft.x, ft.y - 4, S.l1, S.l2, fore ? -1 : 1);
  const [w1, w2] = bones ? [7, 5] : S.lw ?? [10, 7];
  // 허벅지(굵게) → 정강이(가늘게): 윤곽선을 먼저 굵게, 그 위에 색
  ctx.strokeStyle = OUT;
  ctx.lineWidth = w1 + 2.5; ctx.beginPath(); ctx.moveTo(j.x, j.y); ctx.lineTo(kn.x, kn.y); ctx.stroke();
  ctx.lineWidth = w2 + 2.5; ctx.beginPath(); ctx.moveTo(kn.x, kn.y); ctx.lineTo(ft.x, ft.y - 4); ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w1; ctx.beginPath(); ctx.moveTo(j.x, j.y); ctx.lineTo(kn.x, kn.y); ctx.stroke();
  ctx.lineWidth = w2; ctx.beginPath(); ctx.moveTo(kn.x, kn.y); ctx.lineTo(ft.x, ft.y - 4); ctx.stroke();
  if (bones) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(kn.x, kn.y, 4.5, 0, TAU); ctx.fill(); }
  // 발굽 · 발
  ctx.fillStyle = hoofCol; ctx.strokeStyle = OUT; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(ft.x + 1.5, ft.y - 2.5, S.head === 'wolf' ? 5 : 4.5, 3, 0, 0, TAU); ctx.fill(); ctx.stroke();
}
function drawQuad(ctx, m, S, C0, col, P, o) {
  const bones = !!C0.bones, flame = C0.flame;
  const t = m.t ?? 0, rot = P.rot;
  // 꼬리 (몸 뒤)
  const tb = rot(S.bodyX - S.rx + 3, S.bodyY - S.ry * 0.5);
  const sway = Math.sin(t * 3) * 3 - (m.speedK ?? 0) * 10;
  if (S.tail === 'hair' || S.tail === 'bush' || S.tail === 'tuft') {
    const len = S.tail === 'hair' ? 34 : S.tail === 'bush' ? 30 : 22;
    ctx.strokeStyle = col(flame ?? (S.tail === 'bush' ? C0.coat : C0.mane)); ctx.lineWidth = S.tail === 'bush' ? 11 : 7;
    ctx.beginPath(); ctx.moveTo(tb.x, tb.y); ctx.quadraticCurveTo(tb.x - len * 0.6, tb.y - 4 + sway * 0.3, tb.x - len * 0.8, tb.y + len * 0.7 + sway); ctx.stroke();
    if (flame && !o.noFx) glowDot(ctx, tb.x - len * 0.7, tb.y + len * 0.4 + sway, 14, flame, 0.35);
  } else if (S.tail === 'curl') {
    ctx.strokeStyle = col(C0.dark); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(tb.x - 5, tb.y + 2, 4, 0, TAU * 0.8); ctx.stroke();
  } else if (S.tail === 'short') {
    ctx.fillStyle = col(C0.hi); ctx.beginPath(); ctx.ellipse(tb.x - 3, tb.y + 3, 5, 7, 0.4, 0, TAU); ctx.fill();
  }
  // 먼 다리 두 개 (어둡게)
  leg(ctx, m, S, P, 0, col(C0.dark), C0.dark, col(C0.hoof), bones);
  leg(ctx, m, S, P, 1, col(C0.dark), C0.dark, col(C0.hoof), bones);
  // 먼 날개 (그리핀)
  if (S.wings) drawWing(ctx, m, S, C0, col, P, false);
  // 몸통
  const b = rot(S.bodyX, S.bodyY);
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(P.pitch);
  ctx.fillStyle = col(C0.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.beginPath();
  const rx = S.rx, ry = S.ry;
  ctx.moveTo(rx, -2);
  ctx.quadraticCurveTo(rx - 4, -ry - 4, rx - 14, -ry - 2);              // 가슴 → 어깨 (기갑)
  ctx.quadraticCurveTo(0, -ry + 3, -rx + 10, -ry - 1);                 // 등
  ctx.quadraticCurveTo(-rx - 4, -ry + 2, -rx, 2);                      // 엉덩이
  ctx.quadraticCurveTo(-rx + 4, ry + 1, -rx + 14, ry);                 // 뒷다리 위
  ctx.quadraticCurveTo(0, ry + 3, rx - 10, ry - 1);                    // 배
  ctx.quadraticCurveTo(rx + 2, ry - 2, rx, -2);                        // 가슴 아래
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (!o.tint) {
    ctx.strokeStyle = C0.hi; ctx.globalAlpha *= 0.55; ctx.lineWidth = 2;   // 윗선 윤기
    ctx.beginPath(); ctx.moveTo(rx - 14, -ry - 1); ctx.quadraticCurveTo(0, -ry + 4, -rx + 10, -ry); ctx.stroke();
    ctx.globalAlpha /= 0.55;
    if (bones) {   // 갈비뼈 + 영혼불
      if (!o.noFx) glowDot(ctx, 2, 0, 20, C0.flame, 0.5);
      ctx.strokeStyle = C0.dark; ctx.lineWidth = 2;
      for (let k = -2; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 6, -ry + 3); ctx.quadraticCurveTo(k * 6 + 4, 0, k * 6, ry - 3); ctx.stroke(); }
    }
    if (S.mane === 'bristle') {   // 멧돼지 등 갈기
      ctx.strokeStyle = C0.mane; ctx.lineWidth = 2;
      for (let k = 0; k < 9; k++) { const x = rx - 12 - k * 6; ctx.beginPath(); ctx.moveTo(x, -ry); ctx.lineTo(x - 3, -ry - 7 - (k % 2) * 2); ctx.stroke(); }
    }
    if (S.mane === 'fur') {   // 늑대 목털
      ctx.fillStyle = C0.hi; ctx.beginPath(); ctx.ellipse(rx - 8, -2, 10, ry + 1, -0.3, 0, TAU); ctx.fill();
    }
  }
  // 안장 천 · 안장
  ctx.fillStyle = col(C0.cloth); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-10, -ry - 1); ctx.lineTo(12, -ry - 2); ctx.lineTo(10, 4); ctx.lineTo(-12, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (!o.tint) { ctx.strokeStyle = C0.trim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(10, 3); ctx.lineTo(-12, 4); ctx.stroke(); }
  ctx.fillStyle = col(bones ? '#1a1418' : '#2a1a12');
  ctx.beginPath(); ctx.ellipse(0, -ry - 2, 11, 4, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
  // 가까운 다리 두 개
  leg(ctx, m, S, P, 2, col(C0.coat), C0.dark, col(C0.hoof), bones);
  leg(ctx, m, S, P, 3, col(C0.coat), C0.dark, col(C0.hoof), bones);
  if (S.wings && wingsFolded(m)) drawWing(ctx, m, S, C0, col, P, true);
  // 목 · 머리
  const nb = rot(S.neckX, S.neckY), hd = rot(S.headX, S.headY + (m.anim === 'run' ? Math.sin((m.phase ?? 0) * TAU * 2) * 2 : 0));
  ctx.strokeStyle = OUT; ctx.lineWidth = (S.neckW ?? 17) + 3;
  ctx.beginPath(); ctx.moveTo(nb.x, nb.y); ctx.lineTo(hd.x, hd.y); ctx.stroke();
  ctx.strokeStyle = col(C0.coat); ctx.lineWidth -= 3;
  ctx.beginPath(); ctx.moveTo(nb.x, nb.y); ctx.lineTo(hd.x, hd.y); ctx.stroke();
  // 갈기 (목을 따라)
  if (S.mane === 'hair') {
    const mc = col(flame ?? C0.mane);
    ctx.strokeStyle = mc; ctx.lineWidth = 3;
    for (let k = 0; k < 6; k++) {
      const u = k / 5, x = lerp(nb.x - 4, hd.x - 6, u), y = lerp(nb.y - 6, hd.y - 8, u);
      const w = Math.sin(t * 5 + k) * 2 - (m.speedK ?? 0) * 8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 6, y + 2, x - 10 + w, y + 10); ctx.stroke();
    }
    if (flame && !o.noFx) glowDot(ctx, (nb.x + hd.x) / 2 - 6, (nb.y + hd.y) / 2 - 4, 18, flame, 0.4);
  }
  drawHead(ctx, m, S, C0, col, hd, o);
  // 그리핀·신령: 가까운 날개는 front 층
}
function drawHead(ctx, m, S, C0, col, hd, o) {
  const a = (S.headA ?? 0.5) + (m.anim === 'rear' ? -0.4 : 0) + (m.anim === 'howl' || m.anim === 'screech' ? -0.5 : 0);
  ctx.save(); ctx.translate(hd.x, hd.y); ctx.rotate(a);
  const L = S.headL, bones = !!C0.bones;
  ctx.fillStyle = col(C0.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  if (S.head === 'horse' || S.head === 'stag') {
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(L * 0.6, -9, L, -4); ctx.quadraticCurveTo(L + 3, 2, L - 2, 6); ctx.quadraticCurveTo(L * 0.4, 7, -4, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-3, -16); ctx.lineTo(4, -9); ctx.closePath(); ctx.fill(); ctx.stroke();   // 귀
    if (!o.tint && m.id === 'mt_warhorse') {   // 쇠 면갑 + 뿔
      ctx.fillStyle = C0.metal; ctx.beginPath(); ctx.moveTo(4, -8); ctx.lineTo(L - 4, -6); ctx.lineTo(L - 6, 1); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d8d8e0'; ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(12, -17); ctx.lineTo(14, -7); ctx.closePath(); ctx.fill();
    }
    if (S.head === 'stag') {   // 뿔
      ctx.strokeStyle = col(C0.metal); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(-4, -26); ctx.lineTo(-12, -34); ctx.moveTo(-4, -26); ctx.lineTo(4, -36); ctx.moveTo(-1, -18); ctx.lineTo(8, -24); ctx.stroke();
      if (!o.noFx && !o.tint) glowDot(ctx, -2, -24, 16, C0.eye, 0.35);
    }
    if (bones && !o.tint) { ctx.fillStyle = '#1a1418'; ctx.beginPath(); ctx.arc(L - 4, 0, 2, 0, TAU); ctx.fill(); }
  } else if (S.head === 'boar') {
    ctx.beginPath(); ctx.ellipse(L * 0.45, 0, L * 0.6, 11, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col('#3a2a1e'); ctx.beginPath(); ctx.ellipse(L + 1, 2, 4, 6, 0, 0, TAU); ctx.fill(); ctx.stroke();   // 코
    if (!o.tint) {   // 강철 엄니
      ctx.strokeStyle = C0.metal; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(L - 4, 6); ctx.quadraticCurveTo(L + 6, 8, L + 8, -4); ctx.stroke();
    }
    ctx.fillStyle = col(C0.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-2, -17); ctx.lineTo(7, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (S.head === 'wolf') {
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(L * 0.5, -10, L, -1); ctx.lineTo(L - 3, 4); ctx.quadraticCurveTo(L * 0.4, 8, -4, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -7); ctx.lineTo(-2, -20); ctx.lineTo(6, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col(OUT); ctx.beginPath(); ctx.arc(L, -1, 2.2, 0, TAU); ctx.fill();
    if (m.anim === 'charge' || m.anim === 'special') { ctx.strokeStyle = col('#fff'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L - 8, 4); ctx.lineTo(L - 6, 8); ctx.moveTo(L - 4, 4); ctx.lineTo(L - 2, 8); ctx.stroke(); }
  } else if (S.head === 'eagle') {
    ctx.beginPath(); ctx.ellipse(4, -2, 10, 9, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col(C0.trim); ctx.beginPath(); ctx.moveTo(12, -5); ctx.quadraticCurveTo(L + 6, -4, L + 2, 6); ctx.lineTo(12, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // 눈 (빛)
  if (!o.tint) {
    const ex = S.head === 'boar' ? L * 0.5 : S.head === 'eagle' ? 6 : L * 0.35, ey = S.head === 'boar' ? -4 : -3;
    if (!o.noFx) glowDot(ctx, ex, ey, 8, C0.eye, 0.55);
    ctx.fillStyle = C0.eye; ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawWing(ctx, m, S, C0, col, P, near) {
  if (wingsFolded(m)) {   // 접은 날개: 어깨에서 엉덩이 쪽으로 몸에 붙인다
    const sh = P.rot((S.shX ?? 12) - 4, S.bodyY - (S.ry ?? 12) + 4), hp = P.rot(S.bodyX - S.rx * 0.8, S.bodyY - (S.ry ?? 12) * 0.2);
    ctx.fillStyle = col(near ? (C0.wing ?? C0.coat) : darker(C0.wing ?? C0.coat)); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x - 6, sh.y - 12); ctx.quadraticCurveTo(hp.x + 4, sh.y - 14, hp.x - 6, hp.y - 2);
    ctx.lineTo(hp.x + 4, hp.y + 8); ctx.quadraticCurveTo((sh.x + hp.x) / 2, hp.y + 6, sh.x, sh.y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = col(C0.dark); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sh.x - 6, sh.y - 12); ctx.lineTo(hp.x + 2, hp.y + 4); ctx.stroke();
    return;
  }
  const k = m.wingK ?? 0, t = m.t ?? 0;
  const flap = m.anim === 'flap' ? Math.sin((m.animT ?? 0) * TAU / 0.4) : m.anim === 'hover' ? Math.sin(t * TAU / 0.28) * 0.6 : 0;
  const sh = P.rot(S.kind === 'bat' ? 2 : (S.shX ?? 16) - 6, S.bodyY - (S.ry ?? 12) + 2);
  const spread = lerp(0.15, 1, k);
  const up = -0.3 - 0.9 * flap * spread - (near ? 0 : 0.15);
  const len = (S.kind === 'bat' ? 70 : S.kind === 'biped' ? 64 : 50) * spread + 18;
  const wx = sh.x - Math.cos(up) * len * 0.35, wy = sh.y + Math.sin(up) * len;
  const tipA = { x: wx - len * 0.7, y: wy + len * 0.25 }, tipB = { x: wx - len * 0.45, y: wy + len * 0.55 }, tipC = { x: sh.x - len * 0.55, y: sh.y + 14 };
  ctx.fillStyle = col(near ? (C0.wing ?? C0.coat) : darker(C0.wing ?? C0.coat));
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
  ctx.globalAlpha *= near ? 1 : 0.9;
  ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(wx, wy); ctx.lineTo(tipA.x, tipA.y); ctx.quadraticCurveTo(wx - len * 0.45, wy + len * 0.35, tipB.x, tipB.y);
  ctx.quadraticCurveTo(sh.x - len * 0.4, sh.y + len * 0.2, tipC.x, tipC.y); ctx.lineTo(sh.x - 6, sh.y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = col(C0.dark); ctx.lineWidth = 1.2;   // 날개뼈
  ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(tipB.x, tipB.y); ctx.moveTo(wx, wy); ctx.lineTo(tipC.x, tipC.y); ctx.stroke();
  ctx.globalAlpha /= near ? 1 : 0.9;
}
function drawWyrm(ctx, m, S, C0, col, P, o) {
  const t = m.t ?? 0, rot = P.rot;
  drawWing(ctx, m, S, C0, col, P, false);
  // 꼬리
  const tb = rot(S.bodyX - S.rx + 4, S.bodyY + 2);
  const sw = Math.sin(t * 2.5) * 5;
  ctx.strokeStyle = OUT; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(tb.x, tb.y); ctx.quadraticCurveTo(tb.x - 22, tb.y + 14 + sw, tb.x - 40, tb.y + 26 - sw); ctx.stroke();
  ctx.strokeStyle = col(C0.coat); ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(tb.x, tb.y); ctx.quadraticCurveTo(tb.x - 22, tb.y + 14 + sw, tb.x - 40, tb.y + 26 - sw); ctx.stroke();
  ctx.fillStyle = col(C0.dark); ctx.beginPath(); ctx.moveTo(tb.x - 38, tb.y + 20 - sw); ctx.lineTo(tb.x - 52, tb.y + 30 - sw); ctx.lineTo(tb.x - 37, tb.y + 33 - sw); ctx.closePath(); ctx.fill();
  // 먼 다리
  legBiped(ctx, m, S, P, 0, col(C0.dark), col(C0.hoof));
  // 몸
  const b = rot(S.bodyX, S.bodyY);
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(P.pitch - 0.12);
  ctx.fillStyle = col(C0.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, S.rx, S.ry, 0, 0, TAU); ctx.fill(); ctx.stroke();
  if (!o.tint) {
    ctx.fillStyle = C0.belly ?? C0.hi; ctx.beginPath(); ctx.ellipse(4, 5, S.rx * 0.75, S.ry * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C0.dark; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(-12 + k * 7, -S.ry + 1); ctx.lineTo(-9 + k * 7, -S.ry - 6); ctx.lineTo(-6 + k * 7, -S.ry + 1); ctx.fill(); }
  }
  ctx.fillStyle = col(C0.cloth); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(-2, -S.ry, 11, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
  legBiped(ctx, m, S, P, 1, col(C0.coat), col(C0.hoof));
  if (wingsFolded(m)) drawWing(ctx, m, S, C0, col, P, true);
  // 목 · 머리 (숨결 때 입에 불빛)
  const nb = rot(S.neckX, S.neckY), hd = rot(S.headX, S.headY);
  ctx.strokeStyle = OUT; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(nb.x, nb.y); ctx.quadraticCurveTo(nb.x + 16, nb.y - 20, hd.x, hd.y); ctx.stroke();
  ctx.strokeStyle = col(C0.coat); ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(nb.x, nb.y); ctx.quadraticCurveTo(nb.x + 16, nb.y - 20, hd.x, hd.y); ctx.stroke();
  ctx.save(); ctx.translate(hd.x, hd.y); ctx.rotate(S.headA + (m.anim === 'breath' ? 0.3 : 0));
  ctx.fillStyle = col(C0.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-6, -7); ctx.quadraticCurveTo(S.headL * 0.6, -8, S.headL, -1); ctx.lineTo(S.headL - 2, 4); ctx.quadraticCurveTo(S.headL * 0.4, 7, -6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = col(C0.dark); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-12, -16); ctx.stroke();   // 뿔
  if (!o.tint) {
    if (!o.noFx) glowDot(ctx, S.headL * 0.35, -3, 8, C0.eye, 0.6);
    if (m.anim === 'breath' && !o.noFx) glowDot(ctx, S.headL + 4, 2, 22, '#ff8a3a', 0.8);
  }
  ctx.restore();
}
function legBiped(ctx, m, S, P, i, color, hoof) {
  const a = m.anim, t = m.t ?? 0, ph = (m.phase ?? 0) + i * 0.5;
  const hip = P.rot(S.hipX + (i ? 4 : 0), S.jointY);
  let fx, fy;
  if (a === 'run' || a === 'walk' || a === 'charge' || a === 'flee') { const f = footOf(ph, 0.5, a === 'walk' ? S.stride[0] : S.stride[1], a === 'walk' ? S.lift[0] : S.lift[1]); fx = S.hipX + f.x + 4; fy = f.y; }
  else if (m.onGround === false || a === 'glide' || a === 'flap' || a === 'dive' || a === 'hover') { fx = S.hipX - 6 + i * 4; fy = -12; }
  else { fx = S.hipX + (i ? 8 : -2) + Math.sin(t + i) * 0.4; fy = 0; }
  const kn = ik(hip.x, hip.y, fx, fy - 4, S.l1, S.l2, 1);
  ctx.strokeStyle = OUT; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(kn.x, kn.y); ctx.lineTo(fx, fy - 4); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(kn.x, kn.y); ctx.lineTo(fx, fy - 4); ctx.stroke();
  ctx.fillStyle = hoof; ctx.beginPath(); ctx.ellipse(fx + 3, fy - 2, 7, 3, 0, 0, TAU); ctx.fill();
}
function drawBat(ctx, m, S, C0, col, P, o) {
  const rot = P.rot, t = m.t ?? 0;
  drawWing(ctx, m, S, C0, col, P, false);
  legBiped(ctx, m, S, P, 0, col(C0.dark), col(C0.hoof));
  const b = rot(S.bodyX, S.bodyY);
  ctx.fillStyle = col(C0.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(b.x, b.y, S.rx, S.ry, P.pitch, 0, TAU); ctx.fill(); ctx.stroke();
  if (!o.tint) { ctx.fillStyle = C0.hi; ctx.beginPath(); ctx.ellipse(b.x + 4, b.y + 4, S.rx * 0.6, S.ry * 0.5, 0, 0, TAU); ctx.fill(); }
  ctx.fillStyle = col(C0.cloth); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;   // 은 안장
  ctx.beginPath(); ctx.ellipse(b.x - 2, b.y - S.ry + 2, 11, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
  legBiped(ctx, m, S, P, 1, col(C0.coat), col(C0.hoof));
  if (wingsFolded(m)) drawWing(ctx, m, S, C0, col, P, true);
  const hd = rot(S.headX, S.headY + Math.sin(t * 3) * 1);
  ctx.fillStyle = col(C0.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(hd.x, hd.y, 11, 9, 0, 0, TAU); ctx.fill(); ctx.stroke();
  for (const e of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hd.x - 2 + e * 3, hd.y - 6); ctx.lineTo(hd.x - 4 + e * 7, hd.y - 26); ctx.lineTo(hd.x + 4 + e * 3, hd.y - 7); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  if (!o.tint) {
    if (!o.noFx) glowDot(ctx, hd.x + 5, hd.y - 2, 8, C0.eye, 0.6);
    ctx.fillStyle = C0.eye; ctx.beginPath(); ctx.arc(hd.x + 5, hd.y - 2, 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f0f0f0'; ctx.beginPath(); ctx.moveTo(hd.x + 8, hd.y + 5); ctx.lineTo(hd.x + 9, hd.y + 10); ctx.lineTo(hd.x + 10, hd.y + 5); ctx.fill();
  }
}
/** front 층: 가까운 날개 · 등자 끈 · 고삐 (기수의 가까운 다리 위로 겹친다) */
function drawFront(ctx, m, S, C0, col, P) {
  if (S.wings && !wingsFolded(m)) drawWing(ctx, m, S, C0, col, P, true);
  const b = P.rot(S.bodyX, S.bodyY);
  const sy = b.y - (S.ry ?? 12);
  ctx.strokeStyle = col('#2a1a12'); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-2, sy); ctx.lineTo(-1, sy + (S.ry ?? 12) + 8); ctx.stroke();   // 배띠
  if (S.kind === 'quad' && S.head !== 'boar') {   // 고삐: 입에서 기수 손 쪽으로
    const hd = P.rot(S.headX, S.headY);
    ctx.strokeStyle = col('#3a2418'); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hd.x + 8, hd.y + 4); ctx.quadraticCurveTo(hd.x - 8, hd.y + 16, 8, sy - 18); ctx.stroke();
  }
}
const DARK = new Map(), LIGHT = new Map();
/** 피격 번쩍임 색 (한 번 계산해 둔다) */
function lighter(c) { if (typeof c !== 'string' || c[0] !== '#') return c; let v = LIGHT.get(c); if (!v) { v = shade(c, 0.6); LIGHT.set(c, v); } return v; }
const AIR_WING = new Set(['flap', 'glide', 'hover', 'dive', 'takeoff', 'jump', 'fall', 'charge']);
/** 날개를 접고 있는가 (땅 위 · 날갯짓이 아닐 때) */
const wingsFolded = (m) => m.onGround !== false && !AIR_WING.has(m.anim);
/** 먼 쪽 날개 색 (한 번 계산해 둔다) */
function darker(c) { let v = DARK.get(c); if (!v) { v = shade(c, -0.25); DARK.set(c, v); } return v; }
/** 빛 방울 (가산 합성, 작은 원 두 겹 — 그라디언트를 만들지 않는다) */
function glowDot(ctx, x, y, r, color, a) {
  const g = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  ctx.globalAlpha = g * a * 0.35; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalAlpha = g * a * 0.6; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill();
  ctx.globalAlpha = g; ctx.globalCompositeOperation = 'source-over';
}

// ── 특수기·자국 그림 (Hitbox/Projectile render) ──
function drawFlameTrail(ctx, h, col, fire) {
  const k = clamp(h.life / (h.maxLife || 1), 0, 1), t = h.t;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const x = h.x + 8 + i * 14, fl = Math.sin(t * 14 + i * 2) * 4;
    ctx.globalAlpha = 0.5 * k;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - 7, h.y + h.h); ctx.quadraticCurveTo(x - 6, h.y + h.h * 0.4, x + fl * 0.5, h.y + h.h * (0.1 + 0.3 * (1 - k))); ctx.quadraticCurveTo(x + 6, h.y + h.h * 0.4, x + 7, h.y + h.h); ctx.fill();
    ctx.globalAlpha = 0.6 * k; ctx.fillStyle = fire ? '#fff0b0' : '#e0f8ff';
    ctx.beginPath(); ctx.ellipse(x, h.y + h.h - 6, 3, 6, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawChainPillar(ctx, h) {
  const k = Math.min(1, h.t / 0.08), fade = Math.min(1, h.life / 0.15);
  const top = h.y + h.h * (1 - k);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#1a3a5a'; ctx.globalAlpha = 0.35 * fade; ctx.fillRect(h.x, top, h.w, h.y + h.h - top);
  ctx.globalAlpha = fade;
  ctx.strokeStyle = '#8ae8ff'; ctx.lineWidth = 3;
  const cx = h.x + h.w / 2;
  for (let y = h.y + h.h; y > top; y -= 16) { ctx.beginPath(); ctx.ellipse(cx + ((y / 16) % 2 ? -3 : 3), y - 8, 5, 8, 0, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = '#e0f8ff'; ctx.beginPath(); ctx.moveTo(cx - 8, top + 6); ctx.lineTo(cx, top - 10); ctx.lineTo(cx + 8, top + 6); ctx.fill();
  ctx.restore();
}
function drawBreath(ctx, h) {
  const f = h.data ?? 1, k = Math.min(1, h.t / 0.1) * Math.min(1, h.life / 0.15), t = h.t, cols = h.cols ?? ELEM_FX.fire.breath;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const x0 = f > 0 ? h.x : h.x + h.w, y0 = h.y + h.h / 2;
  for (let i = 0; i < 3; i++) {
    const L = h.w * (0.6 + 0.4 * ((t * 3 + i * 0.33) % 1)), sp = h.h * 0.5 * (0.5 + 0.5 * (L / h.w));
    ctx.globalAlpha = 0.35 * k;
    ctx.fillStyle = cols[i];
    ctx.beginPath(); ctx.moveTo(x0, y0 - 6); ctx.quadraticCurveTo(x0 + f * L * 0.5, y0 - sp, x0 + f * L, y0 + Math.sin(t * 20 + i) * 6); ctx.quadraticCurveTo(x0 + f * L * 0.5, y0 + sp, x0, y0 + 6); ctx.fill();
  }
  ctx.restore();
}
function drawRock(ctx, pr) {
  ctx.rotate(pr.rot ?? 0);
  ctx.fillStyle = '#6a5a4a'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-4, -10); ctx.lineTo(7, -8); ctx.lineTo(11, 2); ctx.lineTo(4, 10); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9a8a74'; ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(4, -6); ctx.lineTo(1, -1); ctx.closePath(); ctx.fill();
}
