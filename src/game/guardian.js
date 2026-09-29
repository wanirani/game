// 수호신 엔티티 · 공격 도우미 · 수호신 AI — owner: CMP-SYS (companions §4.1–4.9, §5; MASTER_PLAN §1.2, §1.14)
//
//  class Guardian extends Entity      kind 'companion' (world.hittables()/enemies() 에 들지 않는다 → 무적, 적이 노리지 않음)
//                                     충돌 없음(영체), z = def.front ? 11 : 9 (플레이어 10). CompanionSystem 이 방마다 다시 넣는다.
//  gAttack(g, o) → 공격 객체          { owner:g, team:'player', stats:g.stats, hitstop:0, shake:0.6, tags:['companion','guardian'],
//                                       breakWalls:false, dmgColor:def.color, … } (hitstop 0 필수: 자동 공격이 게임을 멈추지 않게)
//  gStrike(world, rect, attack) → n   수호신 전용 타격: 적·보스만 (소품·촛불·거울 스위치·포자 주머니 등 noGuardianHit 대상은 건너뜀 —
//                                       타격 불꽃·효과음·경직도 없다). 부위 판정(hitParts)·몸통(hurtboxes/hurtbox)은 combat.playerStrike 와 같다.
//  gHitOne(world, target, attack, x, y) 한 대상만 직접 타격 (번개 연쇄 등)
//  class GHit / GProj / GFx           수호신용 지속 판정 · 투사체 · 연출 개체 (모두 gStrike 로만 때린다)
//  GUARDIAN_AI[id] = { init, think, attack, skill, assist, passive, onEvent, drawWorld }   (1부 여섯: 아리아 하티 핌 가웨인 크론 미네르바)
//  aiFor(id)                          GUARDIAN_AI → GUARDIAN_AI_B(guardian_ai_b.js, CMP-GUARD-AI-B) → 데이터 기반 기본 AI
//  runKind(g, world, target, spec, o) 데이터(def.attack/def.assist)의 kind 로 동작 실행:
//                                       proj burst volley pounce slash bash cone dive blink zap bite swing ring flash
//
// AI 함수 규약 (GUARDIAN_AI_B 도 같다; 없는 함수는 기본 동작):
//  init(g)                            생성 직후
//  think(g, world, dt) → true         이번 프레임 이동·공격을 AI 가 모두 맡았다 (기본 흐름 건너뜀)
//  attack(g, world, target)           자동 공격 시작 (보통 g.begin(...) 으로 동작을 건다). 기본: runKind(def.attack)
//  assist(g, world, target)           협공 (적 옆으로 0.12초 돌진한 뒤 부른다). 기본: runKind(def.assist, {assist:true})
//  skill(g, world, mul, o)            스킬 (mul = 위력 배율: 유대 1단계 1.25 · 4단계 1.5 · 공명 0.6; o = {auto, resonance})
//  passive(g, world, dt)              매 프레임 (오라 외 고유 능력)
//  onEvent(g, world, name, data)      'hit' {target, info, attack} · 'kill' {enemy} · 'hurt' {dmg} · 'idle'
//  drawWorld(g, ctx, world)           몸을 그리기 전에 월드 좌표로 추가 연출 (올빼미의 비밀 윤곽 등)
//
// 그리기: render/guardians.js drawGuardian(ctx, g, world, opts) (CMP-GUARD-ART-A) 가 true 를 돌려주면 그것으로 끝, 아니면 아래의
//  간단한 절차 그림(자리 표시)을 그린다. FX 도우미 fx*(ctx, e, world) 도 true 를 돌려주면 대체 그림을 생략한다.
//  렌더러가 읽는 필드: g.id g.def g.anim g.animT g.facing g.alpha g.t g.hopY() g.d.awakened g.act?.name g.target
import { Entity } from './entity.js';
import { Projectile, PROJ_RENDER } from './projectiles.js';
import { hitTarget } from './combat.js';
import { guardianDerived } from './companion_state.js';
import { GUARDIAN_AI_B } from './guardian_ai_b.js';
import * as GR from '../render/guardians.js';
import { TILE } from '../core/game.js';
import { T } from '../core/physics.js';
import { audio } from '../core/audio.js';
import { TAU, clamp, rand, lerp, overlap, approach } from '../core/math.js';
import { GUARD_RULES, GUARDIANS } from '../data/companions.js';

const FALLBACK_STATS = Object.freeze({ atk: 10, mag: 10, crit: 5, critDmg: 0, skillDmg: 0, subDmg: 0 });
const NOHIT = Object.freeze({ x: -1e9, y: -1e9, w: 0, h: 0 });
const EL_FX = { holy: 'holy', fire: 'fire', ice: 'ice', dark: 'dark', thunder: 'thunder' };
const EL_TRAIL = { holy: 'holy', fire: 'ember', ice: 'ice', dark: 'magic', thunder: 'thunder' };
let SEQ = 0;

const isFoe = (e) => (e.kind === 'enemy' || e.kind === 'boss') && !e.dead && !e.noGuardianHit;
const alive = (e) => !!e && !e.dead && !(e.dying > 0);
const qOf = (world) => world?.fx?.quality ?? 1;
const nq = (world, n) => Math.max(1, Math.round(n * qOf(world)));
/** 같은 자리의 경고는 한 번만 (매 프레임 부르는 AI·그림 함수가 던져도 콘솔을 60번/초 채우지 않게 — 모바일 비용) */
const WARNED = new Set();
function warnOnce(key, ...a) { if (WARNED.has(key)) return; WARNED.add(key); console.warn('[guardian]', key, ...a); }
const drew = (fn, ...a) => { try { return typeof fn === 'function' && fn(...a) === true; } catch (e) { warnOnce('fx ' + (fn?.name || '?'), e); return false; } };

// ───────────────────────── 공격 객체 · 타격 ─────────────────────────
/** 수호신 공격 객체 (companions §4.4). o.target 이 있으면 dir 을 그쪽으로 */
export function gAttack(g, o = {}) {
  const { target, ...rest } = o;
  const dir = (target ? Math.sign(target.cx - g.cx) : 0) || g.facing || 1;
  const el = rest.element ?? null;
  return {
    owner: g, team: 'player', stats: g.stats ?? FALLBACK_STATS, mv: 1, type: 'phys', element: null, dir,
    kb: [...GUARD_RULES.attack.kb], hitstop: GUARD_RULES.attack.hitstop, shake: GUARD_RULES.attack.shake, hitId: 'g' + (++SEQ),
    mult: 1, crit: 0, tags: ['companion', 'guardian'], breakWalls: false, dmgColor: g.def?.color ?? '#bfe6ff',
    ...(el && EL_FX[el] ? { fx: EL_FX[el] } : {}),
    ...rest,
  };
}

/** 겹친 부위 중 판정 중심에 가장 가까운 부위 (combat.js pickPart 와 같은 규칙) */
function pickPart(rect, parts) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  let best = null, bd = Infinity;
  for (const b of parts) {
    if (!b || b.off || !overlap(rect, b)) continue;
    const dx = cx - clamp(cx, b.x, b.x + b.w), dy = cy - clamp(cy, b.y, b.y + b.h);
    const d = dx * dx + dy * dy + b.w * b.h * 1e-6;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
/** 부위 방어 배율 반영 (combat.playerStrike 와 같다) */
function applyPart(e, hb) {
  e.hitPart = hb;
  if (!e.stats) return;
  if (e.baseDef === undefined) { e.baseDef = e.stats.def ?? 0; e.baseRes = e.stats.res ?? e.baseDef; }
  const m = hb.defMul ?? 1;
  e.stats.def = Math.round(e.baseDef * m + (hb.defAdd ?? 0));
  e.stats.res = Math.round((e.baseRes ?? e.baseDef) * m + (hb.defAdd ?? 0));
}

/** 수호신 타격: 사각형과 겹친 적·보스 (noGuardianHit·소품 제외). 맞힌 수 */
export function gStrike(world, rect, attack) {
  if (!world?.enemies) return 0;
  let n = 0;
  for (const e of world.enemies()) {
    if (!isFoe(e) || e === attack.owner) continue;
    let hb;
    if (e.hitParts) { if (e.invuln) continue; hb = pickPart(rect, e.hitParts() || []); }
    else {
      const boxes = e.hurtboxes ? e.hurtboxes() : [e.hurtbox ? e.hurtbox() : e];
      hb = boxes.find((b) => b && !b.off && overlap(rect, b));
    }
    if (!hb) continue;
    if (e.hitParts) applyPart(e, hb);
    const hx = clamp(attack.dir > 0 ? rect.x + rect.w * 0.7 : rect.x + rect.w * 0.3, hb.x, hb.x + hb.w);
    const hy = clamp(rect.y + rect.h / 2, hb.y + 4, hb.y + hb.h - 4);
    if (hitTarget(world, attack, e, hx, hy)) n++;
  }
  return n;
}
/** 한 대상 직접 타격 (사각형 판정 없이). 결과 info | null */
export function gHitOne(world, e, attack, x, y) {
  if (!world || !e || !isFoe(e) || e.invuln) return null;
  if (e.hitParts) { const parts = (e.hitParts() || []).filter((b) => b && !b.off); if (!parts.length) return null; applyPart(e, parts[parts.length - 1]); }
  return hitTarget(world, attack, e, x ?? e.cx, y ?? e.cy);
}

// ───────────────────────── 조준: 몸 사각형이 아니라 실제 피격 판정 (R1-REQ-372) ─────────────────────────
// 보스의 피격 판정은 바닥에서 떠 있을 수 있다 (말 탄 둘라한: 다리 제외 → 바닥 위 83px · 드라큘라 1형태: 상반신만 → 64px).
// 발 기준 근접 판정(높이 40–70px)은 그런 상자에 닿지 않아 가웨인 · 하티가 보스전 내내 허공을 쳤다. 그래서
//  근접 동작(pounce slash bite bash swing blink · 협공 돌진)은 가장 가까운 판정 상자 옆으로 가고, 지면형은 그 높이까지 뛰어올라
//  (최대 REACH_LIFT) 판정을 상자 아래쪽과 겹친 뒤 바닥으로 떨어진다. 비행형 · 투사체 · 범위 · 급강하 · 원뿔은 몸 가운데 대신 그 상자 가운데를 노린다.
const REACH_LIFT = 150;   // 지면형 수호신이 뛰어올라 닿는 최대 높이 (px, 약 3칸)
const okBox = (b) => !!b && !b.off && b.w > 0 && b.h > 0 && Number.isFinite(b.x) && Number.isFinite(b.y);
/** 대상의 피격 판정 상자들 (gStrike 와 같은 순서: hitParts → hurtboxes → hurtbox → 몸) */
function hurtBoxes(T) {
  try {
    const L = T.hitParts ? T.hitParts() : T.hurtboxes ? T.hurtboxes() : [T.hurtbox ? T.hurtbox() : T];
    return Array.isArray(L) ? L : [];
  } catch { return []; }
}
/**
 * 노릴 판정 상자: (x, y) 에서 가장 가까운 것 (꺼진 부위 제외). floorY 를 주면 지면형: 바닥(floorY)에서 높이 bh 판정을 몇 px 올려야
 * 닿는지를 세로 비용으로 본다 (덜 뛰어도 되는 상자 우선). 상자가 없으면(사라짐 · 변신 중) null.
 */
export function aimBox(T, x, y, floorY = null, bh = 0) {
  if (!T) return null;
  let best = null, bc = Infinity;
  for (const b of hurtBoxes(T)) {
    if (!okBox(b)) continue;
    const dx = Math.max(0, b.x - x, x - (b.x + b.w));
    const dy = floorY == null ? Math.max(0, b.y - y, y - (b.y + b.h)) : Math.max(0, floorY - bh - (b.y + b.h), b.y - floorY);
    const c = dx + dy * 1.5;
    if (c < bc) { bc = c; best = b; }
  }
  return best;
}
/** 노릴 점: (x, y) 에서 가장 가까운 판정 상자의 가운데 (상자가 없으면 몸 가운데) */
export function aimPoint(T, x, y) {
  const b = aimBox(T, x, y);
  return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: T.cx, y: T.cy };
}
/**
 * 근접 동작의 자리 {x(발 중앙), y(g.bottom), lift, floor}: 대상의 가장 가까운 판정 상자의 가까운 쪽 가장자리에서 gap 만큼 바깥.
 * 지면형은 대상의 발 높이(T.bottom)에 서되, 상자가 떠 있으면 판정(높이 bh, 발 기준)이 상자 아래쪽과 겹치게 lift 만큼 뛰어오른다.
 * 비행형은 상자 가운데 높이. 상자가 없으면 예전처럼 몸 사각형 기준.
 */
function meleeSpot(g, T, dir, gap, bh) {
  const fy = T.bottom;
  const b = aimBox(T, g.cx, g.fly ? g.cy : fy - bh / 2, g.fly ? null : fy, bh);
  if (!b) return { x: T.cx - dir * (T.w / 2 + gap), y: g.fly ? T.cy + g.h / 2 : fy, lift: 0, floor: fy };
  const x = (dir > 0 ? b.x : b.x + b.w) - dir * gap;
  if (g.fly) return { x, y: b.y + b.h / 2 + g.h / 2, lift: 0, floor: fy };
  const lift = clamp(fy - bh - (b.y + b.h - Math.min(bh, b.h) * 0.6), 0, REACH_LIFT);
  return { x, y: fy - lift, lift, floor: fy };
}
/** 동작 하나 동안: 처음 고른 자리를 대상이 움직인 만큼 옮긴다 (프레임마다 상자를 다시 골라 자리가 튀지 않게). a.aim 에 기억 */
function trackSpot(g, a, T, dir, gap, bh) {
  if (!a.aim) { const S = meleeSpot(g, T, dir, gap, bh); a.aim = { dx: S.x - T.cx, dy: S.y - T.bottom, lift: S.lift }; }
  return { x: T.cx + a.aim.dx, y: T.bottom + a.aim.dy, lift: a.aim.lift, floor: T.bottom };
}
/** 노릴 점을 대상 기준 오프셋으로 한 번 기억해 둔다 (급강하 등: 대상이 움직이면 따라간다) */
function trackPoint(g, a, T) {
  if (!a.aimP) { const P = aimPoint(T, g.cx, g.cy); a.aimP = { dx: P.x - T.cx, dy: P.y - T.cy }; }
  return { x: T.cx + a.aimP.dx, y: T.cy + a.aimP.dy };
}

// ───────────────────────── 수호신용 개체 ─────────────────────────
/** 지속 판정 (Hitbox 와 비슷하지만 gStrike 로만 때린다). render(ctx, e, world) 는 월드 좌표 */
export class GHit extends Entity {
  constructor(o) {
    super(o.x, o.y, o.w, o.h);
    this.kind = 'hitbox'; this.team = 'player';
    this.life = o.life ?? 0.1; this.maxLife = this.life; this.delay = o.delay ?? 0;
    this.attack = o.attack; this.follow = o.follow ?? null; this.tick = o.tick ?? null; this.render = o.render ?? null;
    this.onExpire = o.onExpire ?? null; this.light = o.light ?? null; this.noHit = !!o.noHit; this.data = o.data ?? {};
    this.owner = o.owner ?? o.attack?.owner ?? null;
    this.z = o.z ?? 8;
  }
  update(dt, world) {
    this.t += dt;
    this.follow?.(this, world, dt);
    if (this.t < this.delay) return;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; this.onExpire?.(this, world); return; }
    if (!this.noHit && this.attack) gStrike(world, this.rect(), this.attack);
    this.tick?.(this, world, dt);
  }
  lights(L) { if (this.light && this.t >= this.delay) L.add(this.cx, this.cy, this.light.r ?? 80, this.light.color ?? '#fff', this.light.i ?? 0.6); }
  draw(ctx, world) { if (this.render && this.t >= this.delay) { ctx.save(); try { this.render(ctx, this, world); } finally { ctx.restore(); } } }
}
/** 연출 전용 개체 (판정 없음) */
export class GFx extends GHit {
  constructor(o) { super({ ...o, noHit: true }); this.kind = 'effect'; }
}
/** 가장 가까운 수호신 표적 (noGuardianHit·무적 제외) */
function nearestFoe(world, x, y, maxD) {
  let best = null, bd = maxD;
  for (const e of world.enemies()) {
    if (e.invuln || e.noGuardianHit) continue;
    const d = Math.hypot(e.cx - x, e.cy - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
/**
 * 수호신 투사체: Projectile 의 이동·벽·꼬리를 그대로 쓰고, 타격은 gStrike 로만 (소품을 치지 않게).
 * team 은 'guardian' (적 팀 분기의 enemyStrike 는 빈 사각형이라 곧바로 끝난다 — 투사체마다 hittables 를 두 번 훑지 않게).
 * 공격 객체의 team 은 'player' 그대로. 유도(homing)는 여기서 한다 (기본 유도는 team 이 player 일 때만 적을 쫓는다).
 */
export class GProj extends Projectile {
  constructor(o) {
    const homing = o.behavior === 'homing';
    super({ ...o, team: 'guardian', behavior: homing ? 'straight' : (o.behavior ?? 'straight') });
    this.gHoming = homing;
    this.hitRect = () => NOHIT;
    this.gRect = o.gRect ?? null;
  }
  update(dt, world) {
    if (this.gHoming && this.t > (this.homingDelay ?? 0.1) && this.life > dt) {
      const tgt = nearestFoe(world, this.cx, this.cy, 600);
      if (tgt) {
        const P = aimPoint(tgt, this.cx, this.cy);   // 몸 가운데가 아니라 가장 가까운 피격 판정 (떠 있는 보스 판정 — R1-REQ-372)
        const want = Math.atan2(P.y - this.cy, P.x - this.cx);
        let cur = Math.atan2(this.vy, this.vx);
        const d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur)), tn = (this.homingTurn ?? 6) * dt;
        cur += clamp(d, -tn, tn);
        this.vx = Math.cos(cur) * this.speed; this.vy = Math.sin(cur) * this.speed;
      }
    }
    super.update(dt, world);
    if (this.dead) return;
    const r = this.gRect ? this.gRect(this) : this.rect();
    this.attack.dir = Math.sign(this.vx) || this.attack.dir || 1;
    const n = gStrike(world, r, this.attack);
    if (n > 0) {
      this.hits += n;
      this.onHit?.(this, world);
      if (this.hits >= this.pierce) this.expire(world, true);
    }
  }
}

// ───────────────────────── 작은 연출 도우미 ─────────────────────────
/** 작은 폭발 (projectiles.explode 대신: 흔들림 8·경직 0.08 없이) */
export function gBlast(g, world, x, y, r, atkO = {}, color) {
  const col = color ?? g.def?.color ?? '#ff9a3a';
  world.add(new GHit({ x: x - r, y: y - r, w: r * 2, h: r * 2, life: 0.1, attack: gAttack(g, { kb: [260, -260], ...atkO }) }));
  world.fx?.flash(x, y, { color: col, size: r * 2, life: 0.14 });
  world.fx?.ring(x, y, { color: col, r0: r * 0.2, r1: r * 1.15, life: 0.26, width: 5 });
  world.fx?.burst(atkO.element === 'fire' ? 'fire' : EL_FX[atkO.element] ?? 'magic', x, y, nq(world, 8), { speed: 200 });
  audio.sfx('explode', { vol: 0.28, pitch: rand(1.2, 1.4) });
}
function lightning(world, pts, color, life = 0.16) {
  world.add(new GFx({ x: Math.min(...pts.map((p) => p[0])) - 10, y: Math.min(...pts.map((p) => p[1])) - 10, w: 20, h: 20, life, z: 12,
    data: { pts: pts.map(([x, y], i) => [x, y, i]), color }, render: drawBolt }));
}

/** (x, y) 가 벽 속이면 아래로 내려 빈 칸의 y (운석이 천장 속에서 생기지 않게) */
function openY(world, x, y) {
  const m = world.map;
  if (!m) return y;
  let yy = y;
  for (let i = 0; i < 10 && m.isSolidPx?.(x, yy); i++) yy = (Math.floor(yy / TILE) + 1) * TILE + 12;
  return yy;
}

// ───────────────────────── Guardian ─────────────────────────
export class Guardian extends Entity {
  constructor(system, id, slot = 0) {
    const def = GUARDIANS[id];
    super(0, 0, def?.size?.w ?? 24, def?.size?.h ?? 24);
    this.kind = 'companion';
    this.id = id; this.def = def; this.system = system; this.slot = slot;
    this.z = def?.front ? 11 : 9;
    this.seed = rand(0, TAU);
    this.anim = 'appear'; this.animT = 0;
    this.act = null; this.target = null; this.retargetT = 0;
    this.atkT = rand(0.4, 0.9); this.assistCd = 0; this.skillCd = 0; this.skillCdMax = def?.skill?.cd ?? 30;
    this.flinchT = 0; this.alpha = 0; this.hopT = 0; this.perched = false; this.emoteT = rand(6, 10); this.passiveT = 0;
    this.d = null; this.stats = FALLBACK_STATS; this.interval = def?.attack?.interval ?? 1.4;
    this.mem = {};   // AI 전용 상태
    this.ai = aiFor(id);
    try { this.ai?.init?.(this); } catch (e) { console.warn('[guardian] init', id, e); }
    this.refresh();
    prewarmGlow(def);   // 자리 표시 그림의 빛 스프라이트를 미리 (전투 중 새 캔버스를 만들지 않게 — MASTER_PLAN §5.2)
    try { GR.prewarmFx?.(id); } catch { /* 연출 스프라이트는 첫 사용 때 */ }   // 운석 · 뼛조각 연출 (R1-REQ-237)
  }
  get player() { return this.system?.world?.player ?? null; }
  get state() { return this.system?.world?.state ?? null; }
  get fly() { return this.def?.move !== 'ground'; }
  /** 파생 수치 다시 계산 (영웅 능력치·동료 레벨·유대가 바뀔 때) */
  refresh() {
    try {
      const p = this.player;
      this.d = guardianDerived(this.state, this.id, p?.stats ?? null);
    } catch (e) { this.d = null; }
    this.stats = this.d?.stats ?? FALLBACK_STATS;
    this.interval = this.d?.interval ?? this.def?.attack?.interval ?? 1.4;
    this.skillCdMax = this.d?.skillCd ?? this.def?.skill?.cd ?? 30;
  }
  skillReady() { return this.skillCd <= 0; }
  setAnim(a) { if (this.anim !== a) { this.anim = a; this.animT = 0; } }
  /** 보이는 깡충 높이 (지면형: 플레이어가 점프하면 살짝 뛴다) */
  hopY() { return this.hopT > 0 ? -Math.sin((this.hopT / 0.35) * Math.PI) * 16 : 0; }
  /** 공격 객체 (spec = def.attack/assist/skill 조각, o = {assist, skill, mul}) */
  atk(spec = {}, o = {}, target = null) {
    const assist = !!o.assist, skill = !!o.skill;
    const tags = assist ? ['companion', 'guardian', 'assist'] : ['companion', 'guardian'];
    if (o.proj) tags.push('projectile');
    return gAttack(this, {
      target, mv: (spec.mv ?? 1) * (o.mul ?? 1), type: spec.type ?? 'phys', element: spec.element ?? null,
      stun: spec.stun, kb: spec.kb ? [...spec.kb] : assist ? [220, -160] : [...GUARD_RULES.attack.kb],
      hitstop: assist ? GUARD_RULES.assist.hitstop : skill ? (o.hitstop ?? 0.04) : 0,
      shake: assist ? GUARD_RULES.assist.shake : skill ? (o.shake ?? 3) : GUARD_RULES.attack.shake,
      rehit: spec.rehit, tags, ...(o.extra || {}),
    });
  }
  /** 동작 시작. o: {anim, pos(위치를 동작이 직접 정함), goal{x,y}, tgt, step(g,w,dt,a), end(g,w,a)} */
  begin(name, dur, o = {}) {
    this.act = { name, t: 0, dur, hit: 0, ...o };
    const an = o.anim ?? name;
    // 같은 이름의 동작이 이어져도 새 동작은 처음부터 그린다 (협공 문 뒤 곧바로 자동 공격 등: 준비 · 타격 틀을 건너뛰지 않게 — R1-REQ-350).
    // 협공은 예외: 0.12초 돌진('assist') 다음의 협공 동작이 그 시계를 이어 쓴다
    if (an === this.anim && name !== 'assist') this.animT = 0;
    else this.setAnim(an);
    return this.act;
  }
  /** 사각형: 몸 앞쪽 (지면형은 발 기준, 비행형은 몸 가운데 기준) */
  frontRect(bw, bh, ahead = 0) {
    const x = this.facing > 0 ? this.cx - 8 + ahead : this.cx + 8 - ahead - bw;
    const y = this.fly ? this.cy - bh / 2 : this.bottom - bh;
    return { x, y, w: bw, h: bh };
  }
  /** 사각형 타격 + 디버그 표시 */
  strike(world, rect, attack) {
    const n = gStrike(world, rect, attack);
    if (world.game?.debug) world.debugRects?.push(rect);
    return n;
  }
  /** 임계 감쇠 스프링으로 (tx, ty)(발 중앙) 로 이동 (§4.2) */
  springTo(tx, ty, dt, maxV) {
    const { k, c } = GUARD_RULES.spring;
    this.vx += ((tx - this.cx) * k - this.vx * c) * dt;
    this.vy += ((ty - this.bottom) * k - this.vy * c) * dt;
    const sp = Math.hypot(this.vx, this.vy), mx = maxV ?? this.def?.speed ?? 900;
    if (sp > mx) { this.vx *= mx / sp; this.vy *= mx / sp; }
    this.x += this.vx * dt; this.y += this.vy * dt;
  }
  /** 따라다닐 기준점 (§4.2). 두 번째 수호신은 dx + 34, 흔들림 위상이 다르다 */
  anchor(p) {
    const S = this.system, a = this.def?.anchor ?? { dx: 40, dy: -100 };
    const dx = a.dx + (this.slot > 0 ? GUARD_RULES.secondDx : 0);
    let x = p.cx - (p.facing || 1) * dx, y;
    if (this.fly) y = p.bottom + a.dy + Math.sin(this.t * 2.2 + this.seed + this.slot * 1.7) * 4;
    else y = (S?.groundY ?? p.bottom) + (this.def?.hover ? -4 + Math.sin(this.t * 2.6 + this.seed) * 2 : 0);
    // 앉기 (올빼미 어깨·요정 머리 위): 플레이어가 3초 가만히 서 있고 싸움이 없을 때
    if (this.perched) {
      const riding = !!p.mount?.riding;
      // 영웅은 판정보다 약 1.14배 크게 그려진다 (render/hero.js HERO_DRAW_SCALE): 요정은 그려진 머리 위, 올빼미는 뒤쪽 어깨 (얼굴을 가리지 않게)
      if (this.def.perch === 'head') { x = p.cx - (p.facing || 1) * 2; y = riding ? p.y + 2 : p.bottom - p.h * 1.12; }
      else { x = p.cx - (p.facing || 1) * 16; y = riding ? p.y + 10 : p.bottom - p.h * 0.78; }
    }
    return { x, y };
  }
  /** 순간이동 (거리 초과·방 이동 뒤): 사라지는 연기 → 기준점에서 나타남 */
  teleport(world, p, silent = false) {
    const col = this.def?.color ?? '#fff';
    if (!silent && this.alpha > 0.2) world.fx?.burst('magic', this.cx, this.cy, nq(world, 8), { speed: 120, color: col });
    const A = this.anchor(p);
    this.cx = A.x; this.bottom = A.y; this.vx = 0; this.vy = 0;
    this.alpha = 0; this.act = null; this.target = null;
    this.setAnim('appear');
    if (!silent) { world.fx?.burst('magic', this.cx, this.cy, nq(world, 12), { speed: 160, color: col }); audio.sfx('summon', { vol: 0.3 }); }
  }
  /** 방 이동·부활 뒤: 기준점에 조용히 나타난다 */
  place(world, p) { this.teleport(world, p, true); world?.fx?.burst('magic', this.cx, this.cy, nq(world, 6), { speed: 90, color: this.def?.color }); }
  /** 플레이어가 맞았다: 0.3초 움찔 (공격 멈춤) */
  flinch() { this.flinchT = GUARD_RULES.flinch; if (this.act && this.act.name !== 'skill') this.act = null; this.setAnim('hurt'); }

  // ── 표적 (§4.3) ──
  pickTarget(world, p) {
    const def = this.def, eng = this.d?.engage ?? def.engage ?? 320;
    let best = null, bs = Infinity;
    for (const e of world.enemies()) {
      if (e.invuln || e.harmless || e.noGuardianHit) continue;
      const d = Math.hypot(e.cx - p.cx, e.cy - p.cy);
      if (d > eng || Math.abs(e.cy - p.cy) >= 300) continue;
      const behind = Math.sign(e.cx - p.cx) === -(p.facing || 1);
      const mx = e.stats?.maxHp || e.hp || 1;
      const s = d + (behind ? (def.bias === 'behind' ? -100 : 120) : 0) - (e.kind === 'boss' ? 80 : 0) - (e === this.target ? 60 : 0)
        + (def.bias === 'lowhp' ? 200 * clamp((e.hp ?? mx) / mx, 0, 1) : 0);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }

  // ── 협공 (§4.6): 적 옆으로 0.12초 돌진 → 협공 동작 ──
  startAssist(world, tgt) {
    if (!alive(tgt)) return false;
    const side = Math.sign(this.cx - tgt.cx) || -(this.facing || 1);
    // 가장 가까운 피격 판정 옆으로 (몸 사각형 가운데는 떠 있는 보스 판정 밖일 수 있다 — R1-REQ-372). 지면형의 높이는 협공 동작이 맞춘다
    const b = aimBox(tgt, this.cx, this.cy);
    const px = b ? (side > 0 ? b.x + b.w : b.x) + side * (this.w / 2 + 8) : tgt.cx + side * (tgt.w / 2 + this.w / 2 + 8);
    const py = this.fly ? (b ? b.y + b.h / 2 : tgt.cy) + this.h / 2 : tgt.bottom;
    const sx = this.cx, sy = this.bottom;
    this.assistCd = this.d?.assistCd ?? GUARD_RULES.assistCd;
    this.act = null; this.target = tgt; this.perched = false;
    const col = this.def.color;
    const ang = Math.atan2(py - sy, px - sx);
    world.fx?.speedLine?.(sx, sy - this.h / 2, ang, { len: 70, width: 4, color: col, life: 0.16, speed: 900 });
    audio.sfx('assist', { vol: 0.8 });
    this.begin('assist', 0.12, {
      pos: true, tgt,
      step(g, w, dt, a) { const k = Math.min(1, a.t / 0.12); g.cx = lerp(sx, px, k); g.bottom = lerp(sy, py, k); g.facing = -side; },
      end(g, w, a) {
        if (!alive(a.tgt)) return;
        g.facing = -side;
        const fn = g.ai?.assist;
        if (fn) fn(g, w, a.tgt); else runKind(g, w, a.tgt, g.def.assist, { assist: true });
      },
    });
    return true;
  }

  // ── 매 프레임 ──
  update(dt, world) {
    this.t += dt; this.animT += dt;
    const S = this.system, p = world.player;
    if (!p || !this.def) return;
    if (this.skillCd > 0) this.skillCd = Math.max(0, this.skillCd - dt);
    if (this.assistCd > 0) this.assistCd -= dt;
    if (this.atkT > 0) this.atkT -= dt;
    if (this.flinchT > 0) this.flinchT -= dt;
    if (this.hopT > 0) this.hopT -= dt;
    // 플레이어 사망: 흐려져 시체 위로 모인다 (§4.1)
    if (p.dead) {
      this.act = null; this.target = null; this.perched = false;
      this.alpha = approach(this.alpha, GUARD_RULES.deadAlpha, dt * 3);
      this.springTo(p.cx + (this.slot ? 26 : -26), p.y - 30, dt, 300);
      this.setAnim('idle');
      return;
    }
    this.alpha = approach(this.alpha, 1, dt / 0.25);
    const calm = S?.calm?.() ?? false;
    // 표적 (0.35초마다 또는 표적이 죽으면 즉시)
    if (calm) { if (this.target) this.target = null; }
    else {
      this.retargetT -= dt;
      if (!alive(this.target) || this.target.invuln) this.retargetT = Math.min(this.retargetT, 0);
      if (this.retargetT <= 0) { this.retargetT = GUARD_RULES.retarget; this.target = this.pickTarget(world, p); }
      if (this.target && Math.hypot(this.target.cx - p.cx, this.target.cy - p.cy) > GUARD_RULES.leash) this.target = null;
    }
    if (this.target) { this.perched = false; if (this.act?.name === 'emote') this.act = null; }   // 싸움이 시작되면 장난을 곧바로 멈춘다
    // 고유 능력
    try { this.ai?.passive?.(this, world, dt); } catch (e) { warnOnce('passive ' + this.id, e); }
    // AI 가 전부 맡는 프레임
    let handled = false;
    try { handled = !!this.ai?.think?.(this, world, dt); } catch (e) { warnOnce('think ' + this.id, e); }
    if (!handled) this.defaultThink(world, p, dt, calm);
    // 순간이동 (§4.2): 기준점에서 620px 넘게 또는 세로 420px 넘게 떨어짐
    const A = this.anchor(p);
    if (Math.hypot(this.cx - A.x, this.bottom - A.y) > GUARD_RULES.teleport || Math.abs(this.bottom - A.y) > GUARD_RULES.teleportDy) {
      if (!this.act || !this.act.pos) this.teleport(world, p);
    }
  }
  defaultThink(world, p, dt, calm) {
    const S = this.system;
    // 진행 중인 동작
    if (this.act) {
      const a = this.act;
      a.t += dt;
      try { a.step?.(this, world, dt, a); } catch (e) { warnOnce(`act ${this.id} ${a.name}`, e); a.done = true; }
      if (!a.pos) {
        // 동작의 목표점 (없으면 기준점을 계속 따라간다)
        const G = a.goal ?? this.anchor(p);
        this.springTo(G.x, G.y, dt, a.speed);
      }
      if (a.done || a.t >= a.dur) {
        this.act = null;
        try { a.end?.(this, world, a); } catch (e) { warnOnce(`act end ${this.id} ${a.name}`, e); }
      }
      return;
    }
    // 자동 공격
    const tgt = this.target;
    if (!calm && tgt && this.atkT <= 0 && this.flinchT <= 0) {
      const range = this.def.attack?.range ?? 320;
      const d = Math.hypot(tgt.cx - this.cx, tgt.cy - this.cy);
      if (d <= range + 40) {
        this.facing = Math.sign(tgt.cx - this.cx) || this.facing;
        this.atkT = this.interval;
        try {
          if (this.ai?.attack) this.ai.attack(this, world, tgt);
          else runKind(this, world, tgt, this.def.attack, {});
        } catch (e) { warnOnce('attack ' + this.id, e); this.act = null; }
        return;
      }
    }
    // 이동: 표적이 있으면 표적 쪽으로 거리를 두고 (사거리의 60%), 없으면 기준점
    let G = this.anchor(p);
    if (tgt && !calm) {
      const keep = Math.min(200, (this.def.attack?.range ?? 300) * 0.6);
      const side = Math.sign(this.cx - tgt.cx) || -(p.facing || 1);
      const gx = tgt.cx + side * keep, gy = this.fly ? Math.min(tgt.cy - 40, p.bottom + (this.def.anchor?.dy ?? -100) * 0.6) : (S?.groundY ?? p.bottom);
      // 플레이어 곁을 크게 벗어나지 않게 (기준점과 표적 자리의 중간 쯤)
      G = { x: lerp(G.x, gx, 0.7), y: lerp(G.y, gy, 0.6) };
    }
    this.springTo(G.x, G.y, dt);
    if (Math.abs(this.vx) > 30) this.facing = Math.sign(this.vx);
    if (tgt) this.facing = Math.sign(tgt.cx - this.cx) || this.facing;
    else if (Math.abs(this.vx) < 20) this.facing = p.facing || this.facing;
    // 앉기 · 장난 (싸움이 없을 때)
    const idle = (S?.idleT ?? 0);
    if (!tgt && this.def.perch && idle >= GUARD_RULES.perchIdle) this.perched = true;
    else if (tgt || idle < 0.1) this.perched = false;
    if (!tgt) {
      this.emoteT -= dt;
      if (this.emoteT <= 0 && idle > 1) {
        this.emoteT = rand(6, 10);
        try { this.ai?.onEvent?.(this, world, 'idle', {}); } catch (e) { /* 무시 */ }
        if (!this.act) this.begin('emote', 1.0, { pos: false });
      }
    }
    // 애니메이션
    if (this.flinchT > 0) this.setAnim('hurt');
    else if (this.anim === 'appear' && this.alpha < 0.98) { /* 나타나는 중 */ }
    else if (this.perched && Math.hypot(this.vx, this.vy) < 40) this.setAnim('perch');
    else if (Math.abs(this.vx) > 60 || Math.abs(this.vy) > 90) this.setAnim(this.def.move === 'ground' && !this.def.hover ? 'run' : 'move');
    else this.setAnim('idle');
  }

  lights(L) {
    const li = this.def?.light;
    if (li && this.alpha > 0.05) L.add(this.cx, this.cy, li.r ?? 80, li.color ?? this.def.color, (li.i ?? 0.5) * this.alpha);
    const pr = this.def?.passive?.lightR, p = this.player;
    if (pr && p && !p.dead) L.add(p.cx, p.cy, pr, li?.color ?? this.def.color, 0.35, false);
  }
  draw(ctx, world) {
    if (this.alpha <= 0.02) return;
    if (this.ai?.drawWorld) { ctx.save(); try { this.ai.drawWorld(this, ctx, world); } catch (e) { /* 연출 실패는 무시 */ } ctx.restore(); }
    ctx.save();
    ctx.globalAlpha *= clamp(this.alpha, 0, 1);
    let done = false;
    try { done = GR.drawGuardian?.(ctx, this, world, { alpha: this.alpha, hop: this.hopY(), awakened: !!this.d?.awakened }) === true; }
    catch (e) { done = false; }
    ctx.restore();
    if (!done) { ctx.save(); ctx.globalAlpha *= clamp(this.alpha, 0, 1); drawPlaceholder(ctx, this, world); ctx.restore(); }
  }
}

// ───────────────────────── 동작 종류 (데이터 kind) ─────────────────────────
/** 투사체 한 발 */
function shoot(g, world, tgt, s, o, i, n) {
  const x = g.cx + (g.facing || 1) * 8, y = g.cy;
  const ok = alive(tgt);
  const P = ok ? aimPoint(tgt, x, y) : null;   // 가장 가까운 피격 판정 가운데 (R1-REQ-372)
  const tx = P ? P.x : x + (g.facing || 1) * 240, ty = P ? P.y : y;
  const ang = Math.atan2(ty - y, tx - x) + (n > 1 ? (i - (n - 1) / 2) * (s.spread ?? 0.1) : 0);
  const sp = s.speed ?? 640;
  const el = s.element ?? null, col = g.def.color;
  const pr = new GProj({
    x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: s.pw ?? 14, h: s.ph ?? 14,
    render: g.ai?.projRender ?? s.proj ?? 'orb', color: col, life: ((s.range ?? 360) + 120) / sp, pierce: s.pierce ?? 1,   // AI 가 자동 공격 탄 그림을 줄 수 있다 (미라 거울 파편 — R1-REQ-328)
    behavior: s.homing ? 'homing' : 'straight', homingTurn: 7, homingDelay: 0.05,
    trail: EL_TRAIL[el] ?? null, trailRate: 0.06 / qOf(world), light: { r: 50, color: col, i: 0.45 }, scale: s.scale ?? 1,
    owner: g, attack: g.atk(s, { ...o, proj: true }, tgt),
  });
  if (s.explode) {
    const blast = (p, w) => gBlast(g, w, p.cx, p.cy, s.explode.r ?? 40, { mv: (s.explode.mv ?? 0.4) * (o.mul ?? 1), element: el, type: s.type ?? 'mag', hitstop: o.assist ? 0.03 : 0, shake: o.assist ? 2 : 0.6, tags: ['companion', 'guardian'] });
    pr.onExpire = (p, w, byHit) => { if (byHit) blast(p, w); };
    pr.onWall = (p, w) => { blast(p, w); p.dead = true; };
  }
  world.add(pr);
  return pr;
}
function kindProj(g, world, tgt, s, o) {
  const n = s.count ?? (o.assist && s.kind === 'volley' ? 3 : 1), gap = s.gap ?? 0.08;
  return g.begin(o.assist ? 'assist' : 'attack', 0.16 + gap * (n - 1) + 0.14, {
    tgt, goal: { x: g.cx, y: g.bottom },
    step(g, w, dt, a) {
      if (alive(a.tgt)) g.facing = Math.sign(a.tgt.cx - g.cx) || g.facing;
      while (a.hit < n && a.t >= 0.08 + a.hit * gap) { shoot(g, w, a.tgt, s, o, a.hit, n); a.hit++; }
    },
  });
}
function kindPounce(g, world, tgt, s, o) {
  const dir = Math.sign(tgt.cx - g.cx) || g.facing || 1;
  const sx = g.cx, sy = g.bottom;
  const leapT = o.assist ? 0.12 : (s.leapT ?? 0.25), bites = o.assist ? 1 : (s.bites ?? 2), gap = s.gap ?? 0.12;
  const bw = s.box?.w ?? 50, bh = s.box?.h ?? 40;
  const biteEnd = leapT + gap * bites;
  return g.begin('pounce', biteEnd + 0.14, {
    pos: true, tgt,
    step(g, w, dt, a) {
      const T = a.tgt, ok = alive(T);
      // 가장 가까운 피격 판정 옆 (떠 있으면 그 높이로 뛰어올라 문다 — R1-REQ-372). 대상이 쓰러지면 마지막 자리
      if (ok) a.spot = trackSpot(g, a, T, dir, 8, bh);
      const S = a.spot ?? { x: sx + dir * 117, y: sy, lift: 0, floor: sy };
      const ex = S.x, ey = S.y;
      g.facing = dir;
      if (a.t < leapT) {
        const k = a.t / leapT;
        g.cx = lerp(sx, ex, k); g.bottom = lerp(sy, ey, k) - Math.sin(k * Math.PI) * 60;
      } else {
        g.cx = ex; g.bottom = ey;
        if (a.hit < bites) g.setAnim('attack');
        while (a.hit < bites && a.t >= leapT + a.hit * gap) {
          a.hit++;
          g.strike(w, g.frontRect(bw, bh, 4), g.atk(s, o, T));
          audio.sfx('wolf_bite', { vol: 0.5, pitch: rand(0.95, 1.15) });
        }
        // 뛰어올라 물었으면 바닥으로 떨어진다
        if (S.lift > 0 && a.t > biteEnd) { const k = clamp((a.t - biteEnd) / 0.14, 0, 1); g.bottom = lerp(ey, S.floor, k * k); }
      }
    },
  });
}
function kindSlash(g, world, tgt, s, o) {
  const hits = o.assist ? 1 : (s.hits ?? 2), gap = s.gap ?? 0.18, sp = s.glideSpeed ?? 600;
  const bw = s.box?.w ?? (o.assist ? 64 : 80), bh = s.box?.h ?? 70;
  return g.begin(o.assist ? 'assist' : 'attack', 0.55 + gap * hits + 0.2, {
    pos: true, tgt,
    step(g, w, dt, a) {
      const T = a.tgt, ok = alive(T);
      if (a.go === undefined) {
        if (!ok) { a.done = true; return; }
        a.dir ??= Math.sign(T.cx - g.cx) || g.facing || 1;
        const dir = a.dir;
        // 가장 가까운 피격 판정 옆으로 미끄러진다 (떠 있으면 그 높이까지 떠올라 벤다 — R1-REQ-372)
        const S = trackSpot(g, a, T, dir, bw * 0.35, bh);
        const ex = S.x, ey = S.y;
        const dx = ex - g.cx, dy = ey - g.bottom, d = Math.hypot(dx, dy), st = sp * dt;
        g.facing = dir;
        if (d <= st + 2 || a.t > 0.5) { if (d <= st + 2) { g.cx = ex; g.bottom = ey; } a.go = a.t; a.floor = S.floor; a.lifted = g.bottom < S.floor - 4; g.setAnim('attack'); }
        else { g.cx += dx / d * st; g.bottom += dy / d * st; }
        return;
      }
      // 떠올라 벴으면 마지막 베기 뒤 바닥 쪽으로 내려온다 (지면형)
      if (a.lifted && !g.fly && a.hit >= hits && a.t >= a.go + 0.06 + gap * (hits - 1) + 0.08) g.bottom = Math.min(a.floor, g.bottom + 900 * dt);
      while (a.hit < hits && a.t >= a.go + 0.06 + a.hit * gap) {
        a.hit++;
        const r = g.frontRect(bw, bh, 0);
        g.strike(w, r, g.atk(s, o, T));
        w.fx?.slash(r.x + r.w / 2, r.y + r.h / 2, a.hit % 2 ? -0.5 : 0.5, { len: bw * 0.8, width: 10, color: g.def.color, life: 0.14, dir: g.facing });
        audio.sfx('slash', { vol: 0.45, pitch: rand(1.05, 1.2) });
      }
      if (a.t >= a.go + 0.06 + gap * hits + 0.1) a.done = true;
    },
  });
}
function kindCone(g, world, tgt, s, o) {
  const dur = s.dur ?? 0.5, bw = s.box?.w ?? 160, bh = s.box?.h ?? 60;
  const dir = Math.sign(tgt.cx - g.cx) || g.facing || 1;
  const P = aimPoint(tgt, g.cx, g.cy);   // 가장 가까운 피격 판정 가운데를 향해 뿜는다 (R1-REQ-372)
  const hold = { x: P.x - dir * Math.min(110, bw * 0.6), y: (g.fly ? P.y + g.h / 2 - 6 : tgt.bottom) };
  const act = g.begin(o.assist ? 'assist' : 'attack', dur + 0.2, { tgt, goal: hold, speed: 700 });
  const atk = g.atk(s, o, tgt);
  atk.rehit = s.rehit ?? 0.1;
  world.add(new GHit({
    x: g.cx, y: g.cy - bh / 2, w: bw, h: bh, life: dur, delay: 0.1, attack: atk, owner: g, z: 12,
    data: { color: g.def.color, el: s.element },
    follow(h) { if (g.dead) { h.dead = true; return; } h.x = g.facing > 0 ? g.cx + 6 : g.cx - 6 - bw; h.y = g.cy - bh / 2 + 4; h.data.f = g.facing; },
    render: (ctx, h, w) => { if (!drew(GR.fxBreath, ctx, h, w)) drawCone(ctx, h, w); },
    light: { r: 90, color: g.def.color, i: 0.5 },
  }));
  audio.sfx('fire_breath', { vol: 0.6, pitch: s.element === 'dark' ? 0.8 : 1 });
  return act;
}
function kindDive(g, world, tgt, s, o) {
  const sw = s.swoop ?? 0.3, up = 0.14;
  const bw = s.box?.w ?? 40, bh = s.box?.h ?? 40;
  const sx = g.cx, sy = g.bottom;
  const dir = Math.sign(tgt.cx - g.cx) || g.facing || 1;
  return g.begin(o.assist ? 'assist' : 'attack', up + sw + 0.18, {
    pos: true, tgt,
    step(g, w, dt, a) {
      const T = a.tgt, ok = alive(T);
      if (ok) a.pt = trackPoint(g, a, T);   // 가장 가까운 피격 판정 가운데로 내리꽂힌다 (R1-REQ-372)
      const tx = a.pt ? a.pt.x : sx + dir * 100, ty = a.pt ? a.pt.y + g.h / 2 : sy + 60;
      g.facing = dir;
      if (a.t < up) { const k = a.t / up; g.cx = lerp(sx, tx - dir * 40, k); g.bottom = lerp(sy, ty - 90, k); g.setAnim('move'); }
      else if (a.t < up + sw) {
        const k = (a.t - up) / sw, e = k * k;
        g.cx = lerp(tx - dir * 40, tx, e); g.bottom = lerp(ty - 90, ty, e); g.setAnim('attack');
        if (!a.hit && k >= 0.75) {
          a.hit = 1;
          const r = { x: g.cx - bw / 2, y: g.cy - bh / 2 + 6, w: bw, h: bh };
          g.strike(w, r, g.atk(s, o, T));
          w.fx?.slash(g.cx, g.cy, dir > 0 ? 0.9 : Math.PI - 0.9, { len: 46, width: 8, color: g.def.color, life: 0.12, dir });
        }
      } else { g.vy = -220; g.bottom -= 220 * dt; }
    },
  });
}
function kindBlink(g, world, tgt, s, o) {
  const bl = s.blink ?? 0.1, bw = s.box?.w ?? 90, bh = s.box?.h ?? 70;
  const col = g.def.color;
  return g.begin(o.assist ? 'assist' : 'blink', bl + 0.4, {
    pos: true, tgt,
    step(g, w, dt, a) {
      const T = a.tgt, ok = alive(T);
      if (!a.moved && a.t >= bl) {
        a.moved = true;
        if (!ok) { a.done = true; return; }
        w.fx?.burst('dark', g.cx, g.cy, nq(w, 6), { speed: 80 });
        const p = w.player, side = Math.sign(T.cx - (p?.cx ?? g.cx)) || 1;
        // 주인 반대편, 가장 가까운 피격 판정 바로 옆 (지면형은 떠 있는 판정 높이까지 — R1-REQ-372)
        const S = meleeSpot(g, T, -side, 14, bh);
        g.cx = S.x; g.bottom = S.y; g.facing = -side;
        w.fx?.burst('magic', g.cx, g.cy, nq(w, 6), { speed: 90, color: col });
        g.setAnim('attack');
      }
      if (a.moved && !a.hit && a.t >= bl + 0.1) {
        a.hit = 1;
        g.strike(w, g.frontRect(bw, bh, -10), g.atk(s, o, T));
        w.fx?.slash(g.cx + g.facing * 30, g.cy, g.facing > 0 ? 0.2 : Math.PI - 0.2, { len: bw, width: 14, color: col, life: 0.18, dir: g.facing, arc: 2.2 });
        audio.sfx('scythe', { vol: 0.5 });
      }
    },
  });
}
function kindZap(g, world, tgt, s, o) {
  const act = g.begin(o.assist ? 'assist' : 'attack', 0.3, { tgt, goal: { x: g.cx, y: g.bottom } });
  const col = g.def.color;
  const hit1 = gHitOne(world, tgt, g.atk(s, o, tgt));
  const pts = [[g.cx, g.cy], [tgt.cx, tgt.cy]];
  const chain = s.chain ?? 0;
  if (hit1 && chain > 0) {
    let from = tgt;
    for (let c = 0; c < chain; c++) {
      let nb = null, nd = 170;
      for (const e of world.enemies()) {
        if (e === tgt || e === from || !isFoe(e) || e.invuln) continue;
        const d = Math.hypot(e.cx - from.cx, e.cy - from.cy);
        if (d < nd) { nd = d; nb = e; }
      }
      if (!nb) break;
      gHitOne(world, nb, g.atk({ ...s, mv: (s.mv ?? 0.5) * (s.chainMul ?? 0.7) }, o, nb));
      pts.push([nb.cx, nb.cy]); from = nb;
    }
  }
  lightning(world, pts, col);
  audio.sfx('jelly_zap', { vol: 0.45 });
  return act;
}
function kindMelee(boxW, boxH, sfx) {
  return (g, world, tgt, s, o) => {
    const bw = s.box?.w ?? boxW, bh = s.box?.h ?? boxH;
    const sx = g.cx, sy = g.bottom;
    const dir = Math.sign(tgt.cx - g.cx) || g.facing || 1;
    return g.begin(o.assist ? 'assist' : 'attack', 0.34, {
      pos: true, tgt,
      step(g, w, dt, a) {
        const T = a.tgt, ok = alive(T);
        // 가장 가까운 피격 판정 옆 (떠 있으면 지면형은 뛰어올라 친다 — R1-REQ-372). 대상이 쓰러지면 마지막 자리
        if (ok) a.spot = trackSpot(g, a, T, dir, bw * 0.3, bh);
        const S = a.spot ?? { x: sx + dir * 60 - dir * (15 + bw * 0.3), y: sy, lift: 0, floor: sy };
        g.facing = dir;
        const k = Math.min(1, a.t / 0.12);
        g.cx = lerp(sx, S.x, k); g.bottom = lerp(sy, S.y, k) - (S.lift > 0 ? Math.sin(k * Math.PI) * 18 : 0);
        if (!a.hit && a.t >= 0.14) {
          a.hit = 1; g.setAnim('attack');
          g.strike(w, g.frontRect(bw, bh, 0), g.atk(s, o, T));
          if (sfx) audio.sfx(sfx, { vol: 0.45, pitch: rand(0.95, 1.1) });
        }
        // 뛰어올라 쳤으면 바닥으로 떨어진다
        if (S.lift > 0 && a.t > 0.2) { const kk = clamp((a.t - 0.2) / 0.14, 0, 1); g.bottom = lerp(S.y, S.floor, kk * kk); }
      },
    });
  };
}
function kindArea(r0, flash) {
  return (g, world, tgt, s, o) => {
    const P = aimPoint(tgt, g.cx, g.cy);   // 가장 가까운 피격 판정 가운데 (R1-REQ-372)
    const r = s.r ?? r0, x = P.x, y = P.y, col = g.def.color;
    world.add(new GHit({ x: x - r, y: y - r, w: r * 2, h: r * 2, life: 0.1, attack: g.atk(s, o, tgt), owner: g }));
    world.fx?.ring(x, y, { color: col, r0: r * 0.3, r1: r * 1.2, life: 0.3, width: 6 });
    if (flash) world.fx?.flash(x, y, { color: col, size: r * 2.4, life: 0.14 });
    world.fx?.burst(EL_FX[s.element] ?? 'magic', x, y, nq(world, 8), { speed: 180, color: col });
    return g.begin(o.assist ? 'assist' : 'attack', 0.25, { tgt, goal: { x: g.cx, y: g.bottom } });
  };
}
export const KINDS = {
  proj: kindProj, burst: kindProj, volley: kindProj,
  pounce: kindPounce, slash: kindSlash, cone: kindCone, dive: kindDive, blink: kindBlink, zap: kindZap,
  bite: kindMelee(50, 40, 'wolf_bite'), bash: kindMelee(60, 64, 'knight_guard'), swing: kindMelee(72, 50, 'slash'),
  ring: kindArea(60, false), flash: kindArea(44, true),
};
/** 데이터 조각(def.attack / def.assist)의 kind 로 동작 실행. o = {assist, mul} */
export function runKind(g, world, tgt, spec, o = {}) {
  if (!alive(tgt) || !spec) return null;
  const fn = KINDS[spec.kind] ?? kindProj;
  return fn(g, world, tgt, spec, o);
}

// ───────────────────────── 1부 수호신 AI (아리아 … 미네르바) ─────────────────────────
function skillPose(g, dur = 0.6) { if (!g.act || g.act.name !== 'skill') g.begin('skill', dur, { goal: { x: g.cx, y: g.bottom - 6 } }); }

/** 아리아: 회복 25% + 2초 무적 결계 · 8초마다 약한 회복 */
const FAIRY = {
  skill(g, world, mul, o) {
    const p = world.player, S = g.system, sk = g.def.skill;
    skillPose(g, 0.7);
    p.heal(p.stats.hp * (sk.heal ?? 0.25) * mul, true);
    const dur = (sk.shield ?? 2) * Math.min(1, mul);
    S.shieldT = Math.max(S.shieldT, dur);
    const keep = (e) => (S.keepFx ? S.keepFx(e) : e);   // 방을 옮겨도 결계가 보이게 (shieldT 는 남는다)
    keep(world.add(new GFx({
      x: p.x, y: p.y, w: p.w, h: p.h, life: dur, z: 12, owner: g, data: { color: g.def.color },
      follow(e) { if (p.dead) { e.dead = true; return; } e.x = p.x; e.y = p.y; e.w = p.w; e.h = p.h; },
      render: (ctx, e, w) => { if (!drew(GR.fxFairyDome, ctx, e, w)) drawDome(ctx, e, w); },
      light: { r: 140, color: '#fff2b0', i: 0.6 },
    })));
    world.fx?.burst('holy', p.cx, p.cy, nq(world, 24), { speed: 220 });
    world.fx?.ring(p.cx, p.cy, { color: '#ffe070', r0: 10, r1: 90, life: 0.4, width: 6 });
  },
  passive(g, world, dt) {
    const P = g.def.passive, p = world.player;
    if (!P || !p || p.dead || world.mode === 'town') return;
    g.passiveT += dt;
    if (g.passiveT < (P.every ?? 8)) return;
    if (p.hp >= p.stats.hp * (P.below ?? 0.85)) { g.passiveT = (P.every ?? 8) - 0.5; return; }
    g.passiveT = 0;
    const lv = g.d?.lv ?? 1;
    const got = p.heal(p.stats.hp * ((P.heal ?? 0.04) + (P.healPerLv ?? 0.001) * (lv - 1)), true);
    if (got > 0) {
      for (let i = 0; i < nq(world, 10); i++) {
        const a = i * 0.9, r = 12 + i * 3;
        world.fx?.emit('holy', p.cx + Math.cos(a) * r, p.bottom - 10 - i * 6, { speed: 30 });
      }
      audio.sfx('fairy_chime', { vol: 0.35, pitch: 1.2 });
    }
  },
};
/** 하티: 유령 늑대 셋이 뒤에서 달려 나감 · 25연타마다 울부짖음 */
const WOLF = {
  skill(g, world, mul, o) {
    const p = world.player, S = g.system, sk = g.def.skill, f = p.facing || 1;
    skillPose(g, 0.5);
    g.setAnim('howl');
    const n = sk.count ?? 3, sp = 1500, life = (sk.dist ?? 900) / sp;
    for (let i = 0; i < n; i++) {
      S.later(i * (sk.stagger ?? 0.1), () => {
        if (!world.player) return;
        const y = p.bottom - 26 - (i % 2) * 18;
        world.add(new GProj({
          x: p.cx - f * 140, y, vx: f * sp, vy: 0, w: 64, h: 36, life, pierce: sk.pierce ?? 99, collideWalls: false,
          color: g.def.color, owner: g, render: (ctx, pr, w) => { if (!drew(GR.fxPhantomWolf, ctx, pr, w)) drawPhantomWolf(ctx, pr, w); },
          light: { r: 70, color: g.def.color, i: 0.5 }, trail: 'ice', trailRate: 0.05 / qOf(world),
          attack: g.atk({ mv: sk.mv ?? 1.2, element: sk.element ?? 'ice', kb: [380, -260] }, { skill: true, mul, hitstop: 0.03, proj: true }),
        }));
      });
    }
    audio.sfx('wolf_howl', { vol: 0.8, pitch: 1.3 });
  },
  onEvent(g, world, name, d) {
    if (name !== 'hit') return;
    const n = world.combo?.n ?? 0, c = g.def.passive?.combo ?? 25;
    if (n > 0 && n % c === 0 && g.mem.howlAt !== n) {
      g.mem.howlAt = n;
      g.setAnim('howl');
      world.fx?.ring(g.cx, g.cy, { color: g.def.color, r0: 10, r1: 70, life: 0.4, width: 4 });
      audio.sfx('wolf_howl', { vol: 0.5, pitch: 1.3 });
    }
  },
};
/** 핌: 운석 열두 개 · 10마리마다 키히힛 */
const IMP = {
  skill(g, world, mul, o) {
    const p = world.player, S = g.system, sk = g.def.skill, f = p.facing || 1;
    skillPose(g, 0.7);
    const n = sk.count ?? 12, dur = sk.dur ?? 2, wid = sk.width ?? 520;
    const top = Math.max((world.camera?.y ?? p.y - 300) - 30, p.y - 420);
    for (let i = 0; i < n; i++) {
      S.later((i / n) * dur, () => {
        const x = p.cx + f * (40 + ((i * 7) % n) / n * wid + rand(-20, 20));
        const m = new GProj({
          x, y: openY(world, x, top), vx: f * 90, vy: 380, w: 22, h: 22, behavior: 'fall', gravity: 0.35, life: 2.4, pierce: 1,
          render: drawMeteor, color: '#ff7a2a', scale: 1.4, owner: g, trail: 'fire', trailRate: 0.04 / qOf(world),   // 운석 줄기 그림 (R1-REQ-237)
          light: { r: 80, color: '#ff7a2a', i: 0.6 },
          attack: g.atk({ mv: (sk.mv ?? 0.9) * 0.5, type: 'mag', element: 'fire' }, { skill: true, mul, hitstop: 0, proj: true }),
        });
        const boom = (pr, w) => gBlast(g, w, pr.cx, pr.cy, sk.explode?.r ?? 50, { mv: (sk.mv ?? 0.9) * mul, type: 'mag', element: 'fire', hitstop: 0.02, shake: 1.5, tags: ['companion', 'guardian'] }, '#ff8a3a');
        m.onLand = (pr, w) => { if (!pr.dead) { boom(pr, w); pr.dead = true; } };
        m.onExpire = (pr, w, byHit) => { if (byHit) boom(pr, w); };
        world.add(m);
      });
    }
    audio.sfx('imp_cackle', { vol: 0.7 });
  },
  onEvent(g, world, name) {
    if (name !== 'kill') return;
    g.mem.kills = (g.mem.kills ?? 0) + 1;
    if (g.mem.kills % (g.def.passive?.kills ?? 10) === 0) {
      world.fx?.text(g.cx, g.y - 8, g.def.passive?.text ?? '키히힛!', { color: g.def.color, size: 13, life: 0.9, vy: -50 });
      audio.sfx('imp_cackle', { vol: 0.5, pitch: 1.1 });
      g.setAnim('emote');
    }
  },
};
/** 적 탄을 막을 수 있는가 (광선·막을 수 없는 탄·80px 넘는 탄 제외) */
export function blockable(e) {
  return e.kind === 'projectile' && e.team === 'enemy' && !e.dead && e.behavior !== 'beam' && !e.unblockable && e.w <= 80 && e.h <= 80;
}
const noop = () => {};
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const MUTED = new WeakMap();
/** world.fx 대리 객체: 함수 호출(연출)은 모두 무시, 값(quality 등)은 그대로 읽힌다 */
function mutedFx(fx) {
  if (!fx || typeof fx !== 'object') return fx;
  let m = MUTED.get(fx);
  if (!m) { m = new Proxy(fx, { get: (t, k) => (typeof t[k] === 'function' ? noop : t[k]) }); MUTED.set(fx, m); }
  return m;
}
/**
 * 적 탄을 거둘 때 (가웨인 막기 · 방패벽, 미라 되비추기, 모모 먹기): 탄의 onExpire 를 '조용히' 부르고 콜백을 모두 지운다.
 * 쏜 적이 onExpire 로 제 탄 수를 세는 장부(뒤라한의 불꽃 해골 skullOut 등)는 풀려야 한다 — 안 그러면 그 적은 그 공격을 다시 쓰지 못한다
 * (R1-REQ-173). 대신 그 안에서 생기는 개체(폭발 판정 · 분열 탄 · 소환)는 월드에 넣지 않고, 연출 · 효과음 · 화면 흔들림도 막는다.
 * guardian_ai_b.js 도 이 함수를 쓴다.
 */
export function quietExpire(world, q) {
  const fn = q.onExpire;
  q.onExpire = null; q.onHit = null; q.onWall = null; q.onLand = null;
  if (typeof fn !== 'function' || !world) return;
  const cam = world.camera;
  const had = { add: own(world, 'add'), shake: !!cam && own(cam, 'shake'), sfx: own(audio, 'sfx') };
  const prev = { add: world.add, fx: world.fx, shake: cam?.shake, sfx: audio.sfx };
  world.add = (e) => { if (e && typeof e === 'object') { e.dead = true; e.world = world; } return e; };
  world.fx = mutedFx(prev.fx);
  if (cam) cam.shake = noop;
  audio.sfx = noop;
  try { fn(q, world, false); } catch (e) { warnOnce('onExpire', e); }
  finally {
    if (had.add) world.add = prev.add; else delete world.add;
    world.fx = prev.fx;
    if (cam) { if (had.shake) cam.shake = prev.shake; else delete cam.shake; }
    if (had.sfx) audio.sfx = prev.sfx; else delete audio.sfx;
  }
}
function breakProj(world, e, color = '#bfe6ff') {
  e.dead = true;
  quietExpire(world, e);   // 쏜 적의 탄 장부(onExpire)는 풀되 터지지 않게 (R1-REQ-173: 뒤라한 불꽃 해골이 막힌 뒤 다시 나오게)
  world.fx?.burst('spark', e.cx, e.cy, nq(world, 8), { speed: 260, color });
  world.fx?.flash(e.cx, e.cy, { color, size: 40, life: 0.1 });
}
/** 가웨인: 방패벽 4초 (적 탄 파괴 + 받는 피해 ×0.7) · 4초마다 가까운 탄 하나 막기 */
const KNIGHT = {
  skill(g, world, mul, o) {
    const p = world.player, S = g.system, sk = g.def.skill;
    skillPose(g, 0.6);
    g.setAnim('guard');
    const dur = clamp((sk.dur ?? 4) * mul, 2, 6);
    S.wallT = Math.max(S.wallT, dur); S.wallMul = sk.dmgMul ?? 0.7;
    const ahead = sk.ahead ?? 96, H = 120, W = 22;
    const keep = (e) => (S.keepFx ? S.keepFx(e) : e);   // 방을 옮겨도 방패벽이 남아 탄을 막게 (wallT 는 남는다)
    keep(world.add(new GFx({
      x: p.cx, y: p.bottom - H, w: W, h: H, life: dur, z: 12, owner: g, data: { color: g.def.color },
      follow(e) { if (p.dead) { e.dead = true; return; } const f = p.facing || 1; e.x = p.cx + f * ahead - W / 2; e.y = p.bottom - H; e.data.f = f; },
      tick(e, w) {
        for (const q of w.entities) {
          if (!blockable(q) || !overlap(q, e)) continue;
          breakProj(w, q, '#bfe6ff');
          audio.sfx('knight_guard', { vol: 0.35, pitch: rand(1.1, 1.3) });
        }
      },
      render: (ctx, e, w) => { if (!drew(GR.fxShieldWall, ctx, e, w)) drawWall(ctx, e, w); },
      light: { r: 110, color: '#8ac8ff', i: 0.5 },
    })));
    world.fx?.ring(p.cx + (p.facing || 1) * ahead, p.bottom - 60, { color: '#8ac8ff', r0: 10, r1: 80, life: 0.3, width: 5 });
    audio.sfx('knight_guard', { vol: 0.8 });
  },
  passive(g, world, dt) {
    const P = g.def.passive;
    if (!P || world.mode === 'town') return;
    g.passiveT += dt;
    if (g.passiveT < (P.every ?? 4)) return;
    const r = P.r ?? 70;
    for (const q of world.entities) {
      if (!blockable(q) || Math.hypot(q.cx - g.cx, q.cy - g.cy) > r) continue;
      breakProj(world, q, '#e8f4ff');
      audio.sfx('clang', { vol: 0.5 }); audio.sfx('knight_guard', { vol: 0.3 });
      g.setAnim('guard'); g.passiveT = 0;
      return;
    }
  },
};
/** 크론: 뼛조각 여섯 개 궤도 5초 · 한가하면 귀를 깨문다 */
const WHELP = {
  skill(g, world, mul, o) {
    const p = world.player, sk = g.def.skill;
    skillPose(g, 0.6);
    const n = sk.count ?? 6, dur = (sk.dur ?? 5) * (o.resonance ? 0.6 : 1);
    for (let i = 0; i < n; i++) {
      const pr = new GProj({
        x: p.cx, y: p.cy, vx: 0, vy: 0, w: 18, h: 18, behavior: 'orbit', owner: p, orbitR: sk.r ?? 90, orbitSpeed: 5, orbitA: (i / n) * TAU,
        life: dur, pierce: sk.pierce ?? 99, collideWalls: false, render: drawBoneShard, spin: 14, color: '#e8e0d0', fadeOut: true,   // 뼛조각 그림 (R1-REQ-237)
        light: i % 2 ? null : { r: 50, color: '#b060ff', i: 0.4 },
        attack: g.atk({ mv: sk.mv ?? 0.5, element: sk.element ?? 'dark', rehit: sk.rehit ?? 0.3 }, { skill: true, mul, hitstop: 0, proj: true }),
      });
      pr.attack.owner = g;
      world.add(pr);
    }
    world.fx?.burst('dark', p.cx, p.cy, nq(world, 12), { speed: 160 });
    audio.sfx('roar_small', { vol: 0.7, pitch: 1.6 }); audio.sfx('bone_rattle', { vol: 0.6 });
  },
  onEvent(g, world, name) {
    if (name !== 'idle') return;
    const p = world.player;
    if (!p) return;
    const ear = () => ({ x: p.cx - (p.facing || 1) * 4, y: p.y + 18 });   // 귀 (플레이어가 움직여도 따라간다)
    g.begin('emote', 1.2, { goal: ear(), step(gg, w, dt, a) { a.goal = ear(); } });
  },
};
/** 미네르바: 700px 성광 · 비밀의 눈 (부서지는 벽·가짜 벽 윤곽) */
const OWL = {
  skill(g, world, mul, o) {
    const sk = g.def.skill, p = world.player;
    const tgt = g.target && alive(g.target) ? g.target : world.nearestEnemy?.(g.cx, g.cy, 700);
    const f = tgt ? (Math.sign(tgt.cx - g.cx) || p.facing || 1) : (p.facing || 1);
    g.facing = f;
    const len = sk.len ?? 700, H = 40, dur = sk.dur ?? 0.6;
    const hold = { x: g.cx, y: tgt ? clamp(tgt.cy + g.h / 2 + 10, g.bottom - 80, g.bottom + 80) : g.bottom };
    g.begin('skill', dur + 0.2, { goal: hold, speed: 500 });
    const atk = g.atk({ mv: sk.mv ?? 0.5, type: sk.type ?? 'mag', element: sk.element ?? 'holy', stun: sk.stun ?? 1, rehit: sk.rehit ?? 0.1, kb: [120, -40] }, { skill: true, mul, hitstop: 0 });
    world.add(new GHit({
      x: g.cx, y: g.cy - H / 2, w: len, h: H, life: dur, delay: 0.08, attack: atk, owner: g, z: 12, data: { f, color: g.def.color },
      follow(h) { if (g.dead) { h.dead = true; return; } h.x = f > 0 ? g.cx + 6 : g.cx - 6 - len; h.y = g.cy - H / 2; },
      render: (ctx, h, w) => { if (!drew(GR.fxHolyBeam, ctx, h, w)) drawBeam(ctx, h, w); },
      light: { r: 160, color: '#fff2a0', i: 0.7 },
    }));
    world.camera?.shake?.(3, 0.2);
    audio.sfx('owl_hoot', { vol: 0.6, pitch: 0.9 }); audio.sfx('holy', { vol: 0.5 });
  },
  passive(g, world, dt) {
    const P = g.def.passive, p = world.player, m = world.map;
    if (!P || !p || !m) return;
    g.mem.scanT = (g.mem.scanT ?? 0) - dt;
    if (g.mem.scanT > 0) return;
    g.mem.scanT = 0.25;
    const R = P.tiles ?? 7, ptx = Math.floor(p.cx / TILE), pty = Math.floor(p.cy / TILE);
    if (g.mem.map !== m) { g.mem.map = m; g.mem.seen = new Set(); }
    const out = [];
    let fresh = false;
    for (let ty = pty - R; ty <= pty + R; ty++) {
      for (let tx = ptx - R; tx <= ptx + R; tx++) {
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
        const t = m.typeAt(tx, ty), idx = m.idx(tx, ty);
        if (t === T.BREAK || (t === T.FAKE && !m.revealed.has(idx))) {
          out.push(tx, ty);
          if (!g.mem.seen.has(idx)) { g.mem.seen.add(idx); fresh = true; }
        }
      }
    }
    g.mem.secrets = out;
    if (fresh && world.mode !== 'town' && (g.mem.hootT ?? -9) < world.time - 1.5) {
      g.mem.hootT = world.time;
      audio.sfx('owl_hoot', { vol: 0.5 });
      g.setAnim('emote');
    }
  },
  drawWorld(g, ctx, world) {
    const L = g.mem.secrets;
    if (!L || !L.length) return;
    if (drew(GR.fxSecretOutline, ctx, g, world)) return;
    const a = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(world.time * 4));
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ffd870'; ctx.lineWidth = 2;
    ctx.shadowColor = '#ffd870'; ctx.shadowBlur = world.fx?.quality >= 0.95 ? 8 : 0;
    ctx.beginPath();
    for (let i = 0; i < L.length; i += 2) ctx.rect(L[i] * TILE + 2, L[i + 1] * TILE + 2, TILE - 4, TILE - 4);
    ctx.stroke();
  },
};

/** 1부 수호신 여섯 (나머지 다섯은 guardian_ai_b.js — CMP-GUARD-AI-B). attack/assist 가 없으면 데이터 kind 로 */
export const GUARDIAN_AI = { gd_fairy: FAIRY, gd_spiritwolf: WOLF, gd_imp: IMP, gd_knight: KNIGHT, gd_whelp: WHELP, gd_owl: OWL };

/** 아직 AI 가 없는 수호신의 기본 스킬: 주위를 휩쓰는 영혼 파동 (데이터 skill.mv·element 사용) */
const GENERIC = {
  skill(g, world, mul) {
    const p = world.player, sk = g.def.skill, r = 170, col = g.def.color;
    skillPose(g, 0.5);
    const el = sk.element ?? g.def.attack?.element ?? null;
    world.add(new GHit({ x: p.cx - r, y: p.cy - r, w: r * 2, h: r * 2, life: 0.12, owner: g,
      attack: g.atk({ mv: Math.min(2, sk.mv ?? 1.4), type: sk.type ?? g.def.attack?.type ?? 'mag', element: el, stun: sk.stun ?? 0.5, kb: [300, -260] }, { skill: true, mul, hitstop: 0.04 }) }));
    world.fx?.ring(p.cx, p.cy, { color: col, r0: 20, r1: r * 1.1, life: 0.4, width: 8 });
    world.fx?.flash(p.cx, p.cy, { color: col, size: r * 1.6, life: 0.16 });
    world.fx?.burst(EL_FX[el] ?? 'magic', p.cx, p.cy, nq(world, 18), { speed: 260, color: col });
    // 데이터가 숨(air)을 채운다면 깊은 물 기믹의 숨을 채운다 (루멘 「심해의 등불」: world2 §14, GIMMICK-ENGINE 요청)
    if (Number.isFinite(sk.air)) { const deep = world.gimmickOf?.('deep'); if (deep && Number.isFinite(deep.air)) deep.air = Math.max(deep.air, sk.air); }
  },
};
/** id → AI (GUARDIAN_AI → GUARDIAN_AI_B → 기본). 순환 import 때문에 호출 시점에 찾는다 */
export function aiFor(id) {
  const a = GUARDIAN_AI[id] ?? GUARDIAN_AI_B?.[id] ?? null;
  if (!a) return GENERIC;
  return a.skill ? a : { ...a, skill: GENERIC.skill };
}

// ───────────────────────── 대체 그림 (CMP-GUARD-ART-A 가 오기 전) ─────────────────────────
const GLOW = new Map();
/** 색별 둥근 빛 스프라이트 (한 번 만들어 재사용) */
function glowSprite(color) {
  let c = GLOW.get(color);
  if (c) return c;
  if (typeof document === 'undefined') return null;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(0.35, color + '88'); gr.addColorStop(1, color + '00');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  GLOW.set(color, c);
  return c;
}
/** 이 수호신의 자리 표시 그림이 쓰는 빛 스프라이트를 미리 만든다 (몸 색 · palette[3] · 눈 흰색 · 아리아 손끝) */
function prewarmGlow(def) {
  if (!def) return;
  try { for (const c of new Set([def.color, def.palette?.[3], '#ffffff', def.id === 'gd_fairy' ? '#fff2b0' : null])) if (typeof c === 'string') glowSprite(c); }
  catch { /* 문서가 없는 환경 */ }
}
let GLOW_HI = true;   // 이번 그림이 높음 품질인가 (중간·낮음이면 번짐 스프라이트 생략: 수호신 빛은 lights() 가 이미 더한다 — R12)
function glowAt(ctx, x, y, r, color, a = 0.6, force = false) {
  if (!GLOW_HI && !force) return;
  const s = glowSprite(color);
  if (!s) return;
  const o = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * a;
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = o; ctx.globalAlpha = ga;
}
function eyes(ctx, x, y, gap, r, color) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.arc(x - gap, y, r * 0.85, 0, TAU); ctx.fill();
  glowAt(ctx, x - gap / 2, y, r * 5, color, 0.35);
}
/** 간단한 절차 그림: 발 중앙 기준, 오른쪽을 보는 모습을 facing 으로 뒤집는다 */
export function drawPlaceholder(ctx, g, world) {
  const d = g.def, pal = d.palette ?? [d.color, d.color, '#101018', '#ffffff', '#ffffff'];
  const w = d.size.w, h = d.size.h, t = g.t, f = g.facing >= 0 ? 1 : -1;
  ctx.translate(g.cx, g.bottom + g.hopY());
  ctx.scale(f, 1);
  if (g.anim === 'hurt') ctx.translate(Math.sin(t * 70) * 1.5, 0);
  const atk = g.anim === 'attack' || g.anim === 'assist' || g.anim === 'pounce' || g.anim === 'blink';
  const cast = g.anim === 'skill' || g.anim === 'howl' || g.anim === 'guard';
  GLOW_HI = qOf(world) >= 0.95;
  glowAt(ctx, 0, -h * 0.5, Math.max(w, h) * (cast ? 1.4 : 0.85), d.color, cast ? 0.8 : 0.4, cast);   // 스킬 자세의 번짐은 품질과 상관없이 (짧다)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const id = g.id;
  if (id === 'gd_spiritwolf') {
    const run = Math.abs(g.vx) > 60 || g.anim === 'pounce';
    const ph = t * (run ? 16 : 3);
    ctx.globalAlpha *= 0.85;
    ctx.strokeStyle = pal[1]; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {           // 다리
      const lx = (i < 2 ? w * 0.22 : -w * 0.22) + (i % 2 ? 3 : -3), sw = run ? Math.sin(ph + i * 1.6) * 7 : 0;
      ctx.beginPath(); ctx.moveTo(lx, -h * 0.4); ctx.lineTo(lx + sw, -1); ctx.stroke();
    }
    ctx.fillStyle = pal[0];
    ctx.beginPath(); ctx.ellipse(0, -h * 0.52, w * 0.36, h * 0.24, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.36, -h * 0.66 + (g.anim === 'howl' ? -4 : 0), h * 0.2, h * 0.17, g.anim === 'howl' ? -0.6 : 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * 0.46, -h * 0.66); ctx.lineTo(w * 0.62, -h * 0.58); ctx.lineTo(w * 0.44, -h * 0.54); ctx.fill();   // 주둥이
    ctx.beginPath(); ctx.moveTo(w * 0.28, -h * 0.78); ctx.lineTo(w * 0.33, -h * 0.98); ctx.lineTo(w * 0.4, -h * 0.8); ctx.fill();    // 귀
    ctx.strokeStyle = pal[3]; ctx.lineWidth = 4; ctx.globalAlpha *= 0.7;
    ctx.beginPath(); ctx.moveTo(-w * 0.34, -h * 0.58); ctx.quadraticCurveTo(-w * 0.55, -h * 0.8 + Math.sin(t * 6) * 5, -w * 0.62, -h * 0.55); ctx.stroke();  // 꼬리
    eyes(ctx, w * 0.42, -h * 0.7, 5, 1.6, '#ffffff');
    return;
  }
  if (id === 'gd_knight') {
    const bob = Math.sin(t * 2.6 + g.seed) * 1.5;
    ctx.translate(0, bob);
    const mist = ctx.createLinearGradient(0, -h * 0.45, 0, 0);
    mist.addColorStop(0, pal[0] + 'aa'); mist.addColorStop(1, pal[0] + '00');
    ctx.fillStyle = mist;
    ctx.beginPath(); ctx.moveTo(-w * 0.34, -h * 0.45); ctx.lineTo(w * 0.34, -h * 0.45); ctx.lineTo(w * 0.14, 0); ctx.lineTo(-w * 0.2, 0); ctx.fill();
    ctx.fillStyle = pal[1]; ctx.strokeStyle = pal[3]; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-w * 0.4, -h * 0.82); ctx.lineTo(w * 0.4, -h * 0.82); ctx.lineTo(w * 0.32, -h * 0.42); ctx.lineTo(-w * 0.32, -h * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal[0];
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-w * 0.24, -h * 1.0, w * 0.48, h * 0.2, 4); else ctx.rect(-w * 0.24, -h * 1.0, w * 0.48, h * 0.2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-w * 0.05, -h * 0.93, w * 0.28, 2.2);    // 투구 틈
    const sa = atk ? -1.2 + Math.min(1, g.animT / 0.12) * 2.2 : -0.35;             // 검
    ctx.save(); ctx.translate(w * 0.28, -h * 0.62); ctx.rotate(sa);
    ctx.strokeStyle = pal[3]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h * 0.55); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = pal[1]; ctx.strokeStyle = pal[4]; ctx.lineWidth = 2;            // 방패
    ctx.beginPath(); ctx.ellipse(g.anim === 'guard' ? w * 0.42 : -w * 0.2, -h * 0.6, w * 0.22, h * 0.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
    return;
  }
  // 날아다니는·떠 있는 수호신
  const bob = g.perched ? 0 : Math.sin(t * 3 + g.seed) * 2;
  const cy = -h * 0.5 + bob;
  const flap = Math.sin(t * (d.move === 'fly' ? 22 : 4)) * (g.perched ? 0.15 : 1);
  const wingy = (lx, ly, rx, ry, col, a) => {
    ctx.fillStyle = col; ctx.globalAlpha *= a;
    ctx.beginPath(); ctx.ellipse(-lx, cy - ly, rx, ry * (0.6 + 0.4 * Math.abs(flap)), -0.6 - flap * 0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-lx * 0.4, cy - ly * 0.9, rx * 0.9, ry * (0.6 + 0.4 * Math.abs(flap)), -0.9 - flap * 0.5, 0, TAU); ctx.fill();
    ctx.globalAlpha /= a;
  };
  if (id === 'gd_fairy' || id === 'gd_owl' || id === 'gd_mirra') wingy(w * 0.25, h * 0.2, w * 0.55, h * 0.26, pal[3], 0.55);
  else if (id === 'gd_imp' || id === 'gd_whelp') {
    ctx.fillStyle = id === 'gd_imp' ? pal[2] : pal[1]; ctx.globalAlpha *= 0.85;
    ctx.beginPath(); ctx.moveTo(-2, cy - h * 0.1); ctx.lineTo(-w * 0.7, cy - h * 0.45 - flap * 6); ctx.lineTo(-w * 0.45, cy - h * 0.05); ctx.lineTo(-w * 0.6, cy + h * 0.1 - flap * 3); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= 0.85;
  } else if (id === 'gd_clock') {
    ctx.strokeStyle = pal[1]; ctx.lineWidth = 3;
    ctx.save(); ctx.translate(-w * 0.3, cy); ctx.rotate(t * 3);
    for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(0, h * 0.18); ctx.lineTo(0, h * 0.26); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, h * 0.18, 0, TAU); ctx.stroke(); ctx.restore();
  } else if (id === 'gd_lumen') {
    ctx.strokeStyle = pal[0]; ctx.lineWidth = 2; ctx.globalAlpha *= 0.8;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 3, cy + h * 0.1); ctx.quadraticCurveTo(i * 5 + Math.sin(t * 5 + i) * 5, cy + h * 0.35, i * 4, cy + h * 0.55); ctx.stroke(); }
    ctx.globalAlpha /= 0.8;
  }
  // 몸 뒤쪽 윤곽 (꼬리 · 거울 조각)
  if (id === 'gd_imp' || id === 'gd_whelp') {
    ctx.strokeStyle = pal[1]; ctx.lineWidth = id === 'gd_imp' ? 1.6 : 3;
    const sw = Math.sin(t * 4 + g.seed) * 3;
    ctx.beginPath(); ctx.moveTo(-w * 0.2, cy + h * 0.2); ctx.quadraticCurveTo(-w * 0.55, cy + h * 0.45 + sw, -w * 0.62, cy + h * 0.1 + sw); ctx.stroke();
    if (id === 'gd_imp') { ctx.fillStyle = pal[2]; ctx.beginPath(); ctx.moveTo(-w * 0.62, cy + h * 0.02 + sw); ctx.lineTo(-w * 0.72, cy + h * 0.16 + sw); ctx.lineTo(-w * 0.52, cy + h * 0.14 + sw); ctx.fill(); }
  }
  // 몸통 (하이라이트는 작게: 안구처럼 보이지 않게)
  const gr = ctx.createRadialGradient(-w * 0.12, cy - h * 0.2, 0.5, 0, cy, Math.max(w, h) * 0.55);
  gr.addColorStop(0, pal[4] ?? '#fff'); gr.addColorStop(0.2, pal[0]); gr.addColorStop(1, pal[1]);
  ctx.fillStyle = gr;
  ctx.beginPath();
  if (id === 'gd_momo') ctx.ellipse(0, cy + h * 0.05, w * 0.48, h * 0.4, 0, 0, TAU);
  else if (id === 'gd_reaper') { ctx.moveTo(0, cy - h * 0.5); ctx.quadraticCurveTo(w * 0.5, cy - h * 0.3, w * 0.35, cy + h * 0.45); ctx.lineTo(-w * 0.4, cy + h * 0.45); ctx.quadraticCurveTo(-w * 0.5, cy - h * 0.3, 0, cy - h * 0.5); }
  else ctx.ellipse(0, cy, w * 0.34, h * 0.4, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = id === 'gd_reaper' ? pal[3] : 'rgba(10,6,8,0.75)'; ctx.lineWidth = 1.4; ctx.stroke();
  // 특징
  if (id === 'gd_imp') { ctx.fillStyle = pal[2]; ctx.beginPath(); ctx.moveTo(-w * 0.2, cy - h * 0.34); ctx.lineTo(-w * 0.26, cy - h * 0.6); ctx.lineTo(-w * 0.06, cy - h * 0.38); ctx.moveTo(w * 0.12, cy - h * 0.36); ctx.lineTo(w * 0.16, cy - h * 0.62); ctx.lineTo(w * 0.28, cy - h * 0.3); ctx.fill(); }
  if (id === 'gd_owl') {
    ctx.fillStyle = pal[1];   // 귀깃 · 부리
    ctx.beginPath(); ctx.moveTo(-w * 0.26, cy - h * 0.3); ctx.lineTo(-w * 0.32, cy - h * 0.62); ctx.lineTo(-w * 0.08, cy - h * 0.36); ctx.moveTo(w * 0.1, cy - h * 0.36); ctx.lineTo(w * 0.3, cy - h * 0.62); ctx.lineTo(w * 0.28, cy - h * 0.3); ctx.fill();
    ctx.fillStyle = pal[2]; ctx.beginPath(); ctx.moveTo(w * 0.02, cy - h * 0.06); ctx.lineTo(w * 0.1, cy + h * 0.1); ctx.lineTo(w * 0.18, cy - h * 0.06); ctx.fill();
    for (const ex of [-w * 0.1, w * 0.26]) { ctx.fillStyle = pal[3]; ctx.beginPath(); ctx.arc(ex, cy - h * 0.14, w * 0.13, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a1008'; ctx.beginPath(); ctx.arc(ex + w * 0.02, cy - h * 0.14, w * 0.06, 0, TAU); ctx.fill(); }
    glowAt(ctx, w * 0.08, cy - h * 0.14, h * 0.5, pal[3], 0.3);
    return;
  }
  if (id === 'gd_whelp') {
    ctx.fillStyle = pal[0]; ctx.strokeStyle = pal[2]; ctx.lineWidth = 1.2;   // 해골 주둥이 · 뿔
    ctx.beginPath(); ctx.ellipse(w * 0.38, cy - h * 0.16, w * 0.2, h * 0.16, -0.15, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal[1]; ctx.beginPath(); ctx.moveTo(w * 0.24, cy - h * 0.3); ctx.lineTo(w * 0.1, cy - h * 0.62); ctx.lineTo(w * 0.34, cy - h * 0.34); ctx.fill();
    glowAt(ctx, 0, cy + h * 0.05, h * 0.35, pal[3], 0.7);
    eyes(ctx, w * 0.44, cy - h * 0.2, w * 0.12, Math.max(1.2, h * 0.05), pal[3]);
    return;
  }
  if (id === 'gd_mirra') {   // 둘레를 도는 거울 조각 셋
    ctx.fillStyle = pal[3]; ctx.strokeStyle = pal[2]; ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      const a = t * 2.4 + i * TAU / 3, sx = Math.cos(a) * w * 0.8, sy = cy + Math.sin(a) * h * 0.35;
      ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 3, sy); ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 3, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  if (id === 'gd_momo') { ctx.fillStyle = pal[1]; ctx.beginPath(); ctx.ellipse(-w * 0.12, cy - h * 0.34, w * 0.1, h * 0.14, -0.4, 0, TAU); ctx.fill(); }
  if (id === 'gd_momo') { ctx.strokeStyle = pal[1]; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(w * 0.4, cy); ctx.quadraticCurveTo(w * 0.7, cy + (atk ? -6 : 6), w * (atk ? 0.95 : 0.6), cy + (atk ? -2 : h * 0.4)); ctx.stroke(); }
  if (id === 'gd_reaper') {
    ctx.strokeStyle = pal[2]; ctx.lineWidth = 2;
    const sa = atk ? -1 + Math.min(1, g.animT / 0.1) * 2.4 : -0.3;
    ctx.save(); ctx.translate(-w * 0.2, cy); ctx.rotate(sa);
    ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(0, -h * 0.6); ctx.quadraticCurveTo(w * 0.8, -h * 0.75, w * 0.9, -h * 0.35); ctx.stroke(); ctx.restore();
  }
  if (id === 'gd_fairy' && (atk || cast)) { ctx.fillStyle = '#ffffff'; glowAt(ctx, w * 0.5, cy - h * 0.2, 8, '#fff2b0', 0.9); }
  const ey = id === 'gd_momo' ? cy - h * 0.12 : cy - h * 0.12;
  eyes(ctx, w * 0.2, ey, w * 0.22, Math.max(1.2, h * 0.05), d.color);
}

// ── 스킬·동작 연출 대체 그림 (월드 좌표; 투사체는 중심 기준) ──
function drawDome(ctx, e, world) {
  const k = clamp(e.life / Math.max(0.01, e.maxLife), 0, 1), fade = Math.min(1, e.life / 0.3);
  const r = Math.max(e.w, e.h) * 0.75 + 10, x = e.cx, y = e.cy;
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createRadialGradient(x, y, r * 0.5, x, y, r);
  gr.addColorStop(0, 'rgba(255,240,170,0)'); gr.addColorStop(0.85, `rgba(255,224,112,${0.22 * fade})`); gr.addColorStop(1, `rgba(255,248,210,${0.5 * fade})`);
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(255,236,150,${0.7 * fade})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r - 2 + Math.sin((world?.time ?? 0) * 8) * 2, 0, TAU); ctx.stroke();
  void k;
}
function drawWall(ctx, e, world) {
  const fade = Math.min(1, e.life / 0.3, e.t / 0.15), x = e.x, y = e.y, w = e.w, h = e.h;
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, 'rgba(138,200,255,0)'); gr.addColorStop(0.5, `rgba(170,220,255,${0.55 * fade})`); gr.addColorStop(1, 'rgba(138,200,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(x - 8, y, w + 16, h);
  ctx.strokeStyle = `rgba(232,244,255,${0.8 * fade})`; ctx.lineWidth = 2;
  ctx.strokeRect(x, y + 4, w, h - 8);
  ctx.beginPath(); ctx.moveTo(x + w / 2, y + 22); ctx.lineTo(x + w / 2, y + 70); ctx.moveTo(x + 3, y + 38); ctx.lineTo(x + w - 3, y + 38); ctx.stroke();
}
function drawBeam(ctx, h, world) {
  const fade = Math.min(1, h.life / 0.2, (h.t - h.delay) / 0.06 + 0.2);
  const y = h.cy, t = world?.time ?? 0;
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
  gr.addColorStop(0, 'rgba(255,242,160,0)'); gr.addColorStop(0.5, `rgba(255,250,220,${0.95 * fade})`); gr.addColorStop(1, 'rgba(255,242,160,0)');
  ctx.fillStyle = gr; ctx.fillRect(h.x, h.y - 6 + Math.sin(t * 40) * 1.5, h.w, h.h + 12);
  ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`; ctx.fillRect(h.x, y - 3, h.w, 6);
}
function drawCone(ctx, h, world) {
  const f = h.data?.f ?? 1, x0 = f > 0 ? h.x : h.x + h.w, len = h.w, fade = Math.min(1, h.life / 0.15);
  const col = h.data?.color ?? '#b060ff';
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createLinearGradient(x0, 0, x0 + f * len, 0);
  gr.addColorStop(0, col + 'ee'); gr.addColorStop(0.6, col + '88'); gr.addColorStop(1, col + '00');
  ctx.fillStyle = gr; ctx.globalAlpha *= fade;
  const t = world?.time ?? 0;
  ctx.beginPath(); ctx.moveTo(x0, h.cy - 4);
  ctx.quadraticCurveTo(x0 + f * len * 0.5, h.y - 6 + Math.sin(t * 30) * 4, x0 + f * len, h.y);
  ctx.lineTo(x0 + f * len, h.y + h.h);
  ctx.quadraticCurveTo(x0 + f * len * 0.5, h.y + h.h + 6 + Math.cos(t * 27) * 4, x0, h.cy + 4);
  ctx.fill();
}
/** 핌 운석 · 크론 뼛조각: 수호신 연출 도우미(render/guardians.js)가 그리면 그것, 아니면 기본 투사체 그림 (원점 = 투사체 중심) */
function drawMeteor(ctx, pr, w) { if (!drew(GR.fxMeteor, ctx, pr, w)) PROJ_RENDER.fireball(ctx, pr, w); }
function drawBoneShard(ctx, pr, w) { if (!drew(GR.fxBoneShard, ctx, pr, w)) PROJ_RENDER.bone(ctx, pr, w); }
function drawPhantomWolf(ctx, pr) {
  const f = Math.sign(pr.vx) || 1, a = Math.min(1, pr.life / 0.15);
  ctx.scale(f, 1);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.8 * a;
  const gr = ctx.createLinearGradient(-60, 0, 30, 0);
  gr.addColorStop(0, 'rgba(126,224,255,0)'); gr.addColorStop(1, 'rgba(190,240,255,0.9)');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.ellipse(-8, 0, 34, 12, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(26, -8, 11, 8, -0.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(22, -14); ctx.lineTo(25, -24); ctx.lineTo(30, -14); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(30, -10, 1.8, 0, TAU); ctx.fill();
}
function drawBolt(ctx, e) {
  const P = e.data.pts, a = Math.min(1, e.life / 0.1);
  ctx.globalCompositeOperation = 'lighter';
  for (const [wd, col] of [[5, e.data.color], [1.8, '#ffffff']]) {
    ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.globalAlpha = 0.85 * a;
    ctx.beginPath();
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1];
      ctx.moveTo(x0, y0);
      for (let s = 1; s <= 5; s++) {
        const k = s / 5, j = s < 5 ? Math.sin((e.t * 90) + s * 2.3 + i) * 7 : 0;
        ctx.lineTo(lerp(x0, x1, k) + j, lerp(y0, y1, k) - j);
      }
    }
    ctx.stroke();
  }
}
