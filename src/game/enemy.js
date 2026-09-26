// 적 엔티티 (일반 몬스터). 보스는 game/bosses/boss.js 의 Boss 를 사용.
// 적 정의(data/enemies.js ENEMIES[id]) 스키마:
// { id, name, lv(기준레벨), hp, atk, def, res, exp, gold:[min,max], score,
//   size:{w,h}, ai:'walker'|..., aiParams:{...}, render:'skeleton'|..., palette:{...},
//   flying:false, gravity:1, speed: px/s, contact: 접촉 피해 배율(0=없음), kbResist:0~1,
//   material:'flesh'|'bone'|'metal'|'ghost'|'stone'|'slime'|'paper'|'ice'|'fire',
//   weak:['holy'], resist:['dark'], immune:[], drops:[{id:'baseId'|'heart'|'gold'|'food'|'mp', p:확률, qty}],
//   sfxDie:'enemy_die', desc:'도감 설명', elite:false(정예 불가시 false),
//   fixed:true(밀리지 않음), noKnockdown:true(쓰러지지 않음), ignoreFreeze:true(각성 정지 무시) }
//
// ── 피격 반응 (owner: FEEL-REACT, feel.md §4.2–4.5; 수치는 data/feel_hit.js WEIGHT·JUGGLE·DOWN·BOUNCE) ──
//  wclass   무게 등급 'LIGHT'|'MEDIUM'|'HEAVY'|'FIXED' (생성 때 kbResist 로 결정; 비틀 중인 HEAVY 는 MEDIUM 처럼 반응)
//  jn       공중 콤보 타수 (공중 경직 중 맞을 때마다 +1, 착지·회복 때 0). 14 이상이면 '가드!' (띄우기 없음, 중력 1.3)
//  down     다운 남은 시간 (누워 있음, AI 정지). 다운 중 타격 = 다운 추가타(OTG): 피해 ×0.8(impact), 살짝 튀어오름
//  otg      이번 다운에서 받은 추가타 수 (2 이상이면 곧바로 기상)
//  wakeInv  기상 무적 남은 시간 (깜빡임; combat.hitTarget 이 타격을 무시)
//  stagger  비틀 게이지 (HEAVY 전용, 12 이상이면 0.9초 비틀 + 2초 면역), staggerT 비틀 남은 시간
//  wbArmed  벽 바운드 대기 시간 (F·H 등급 |kb.x| ≥ 320), gbArmed 바닥 바운드 내리꽂는 중
//  hsShake  히트스톱 떨림 (impact 가 설정, 월드 정지 동안 ±(2 + 등급) px 좌우로 떨며 그림)
//  react    그림 반응 상태 { sq, sqT, sx, sy, lean, leanT, leanA, spin, airLean, lie, armor, dir }
//  camXf    반응 변형을 적용하기 직전의 캔버스 변형 (채색 렌더러의 월드 좌표 파티클용; 반응이 없으면 null)
// world.freezeEnemies (각성 연출) 동안 AI·접촉 피해를 건너뛴다 (피격 반응 물리는 계속).
import { Entity } from './entity.js';
import { moveBody, isSolidType } from '../core/physics.js';
import { enemyStrike } from './combat.js';
import { ENEMIES } from '../data/enemies.js';
import { AI } from './ai.js';
import { drawEnemy } from '../render/enemies.js';
import { rand, clamp, chance } from '../core/math.js';
import { audio } from '../core/audio.js';
import { TILE } from '../core/game.js';
import * as FH from '../data/feel_hit.js';
import * as IM from './impact.js';
import * as HFX from '../render/hitfx.js';

// ───────────────────────── 반응 수치 (feel_hit.js 가 비어 있을 때의 기본값 = feel §4.2–4.5) ─────────────────────────
const W_DEF = {
  LIGHT: { rule: [0, 0.25], kbMul: 1, kbMin: 1, launchMul: 1, stun: { L: 0.30, M: 0.34, H: 0.40, F: 0.50 }, jg: 0.62, knockdown: true, squash: [1.12, 0.88, 0.06], lean: 0.22, leanT: 0.12, tumble: 8, humanLean: -0.6 },
  MEDIUM: { rule: [0.25, 0.6], kbMul: 'res', kbMin: 0.45, launchMul: 0.8, stun: { L: 0.24, M: 0.28, H: 0.34, F: 0.44 }, jg: 0.70, knockdown: true, squash: [1.08, 0.92, 0.06], lean: 0.18, leanT: 0.12 },
  HEAVY: { rule: [0.6, 1], kbMul: 'res08', kbMin: 0, launchMul: 0, hopVy: -380, hopCls: ['H', 'F'], stun: { L: 0.10, M: 0.14, H: 0.20, F: 0.30 }, jg: 1.0, knockdown: 'stagger', lean: 0.06, leanT: 0.1, armorFlash: 0.08, armorColor: '#ff9a30' },
  FIXED: { rule: [1, 2], kbMul: 0, kbMin: 0, launchMul: 0, stun: { L: 0, M: 0, H: 0, F: 0 }, jg: 1, knockdown: false },
  stagger: { add: { L: 1, M: 2, H: 3, F: 5, U: 1, S: 5, A: 5 }, decay: 4, at: 12, dur: 0.9, immune: 2, callout: '비틀!' },
  groundFriction: 0.86, airDamp: 0.985, flyDamp: 0.9, knockdownMinH: 50, vib: { base: 2, perClass: 1 },
};
const J_DEF = { launchK: 1.25, launchMax: 1000, gravStep: 0.05, gravCap: 1.15, pop: { L: 260, M: 320, H: 380 }, popDecay: 0.05, airStunMin: 0.18, airStunStep: 0.02, limit: 14, guardGrav: 1.3, guardCallout: '가드!' };
const D_DEF = { light: 0.6, medium: 0.45, rotK: 0.9, dust: 6, otgPop: -160, otgWake: 2, wakeInv: 0.30, wakeDust: 4, callout: '다운 추가타' };
const B_DEF = {
  wall: { armKb: 320, armT: 0.5, minVx: 380, vxK: 0.45, vy: -380, stunAdd: 0.35, dust: 8, gravel: 6, kick: 6, callout: '벽 바운드!', sfx: 'wall_bounce' },
  ground: { slamVy: 900, bounceVy: -520, stunAdd: 0.3, dust: 10, decalT: 0.8, kick: [0, 7], callout: '바닥 바운드!', sfx: 'ground_bounce' },
};
let TB = null;
/** 표를 한 번만 합친다 (모듈 최상단에서 가져온 값을 건드리지 않도록 첫 사용 때) */
function tables() {
  if (TB) return TB;
  const fw = FH.WEIGHT ?? {}, merge = (d, s) => ({ ...d, ...(s && typeof s === 'object' ? s : {}) });
  const W = { ...W_DEF };
  for (const k of ['LIGHT', 'MEDIUM', 'HEAVY', 'FIXED', 'stagger']) W[k] = merge(W_DEF[k], fw[k]);
  for (const k of ['groundFriction', 'airDamp', 'flyDamp', 'knockdownMinH']) if (typeof fw[k] === 'number') W[k] = fw[k];
  W.vib = merge(W_DEF.vib, fw.vib);
  const J = merge(J_DEF, FH.JUGGLE);
  J.pop = merge(J_DEF.pop, FH.JUGGLE?.pop);
  TB = {
    W, J, D: merge(D_DEF, FH.DOWN),
    BW: merge(B_DEF.wall, FH.BOUNCE?.wall), BG: merge(B_DEF.ground, FH.BOUNCE?.ground),
    CI: FH.CLASS_INDEX ?? { L: 0, M: 1, H: 2, F: 3, U: 0, S: 4, A: 5 },
  };
  return TB;
}
/** 적 정의 → 무게 등급 (feel §4.2) */
export function weightClassOf(def) {
  const W = tables().W;
  const r = def?.fixed ? 1 : (def?.kbResist ?? 0);
  if (r >= (W.FIXED.rule?.[0] ?? 1)) return 'FIXED';
  if (r >= (W.HEAVY.rule?.[0] ?? 0.6)) return 'HEAVY';
  if (r >= (W.MEDIUM.rule?.[0] ?? 0.25)) return 'MEDIUM';
  return 'LIGHT';
}
const damp = (k, dt) => Math.pow(k, dt * 60);
let _vibRT = NaN, _vibN = 0;
/**
 * 그린 프레임마다 번갈아 바뀌는 0/1 (히트스톱 떨림). game.frame 은 60Hz 틱 수라 30fps 로 그리면(틱 2번에 1번 그림)
 * 늘 같은 짝수·홀수 → 떨리지 않고 한쪽으로 밀려 보인다. rAF 마다 바뀌는 game.realTime 으로 뒤집는다.
 */
function vibParity(g) {
  const rt = g?.realTime;
  if (typeof rt !== 'number') return (g?.frame ?? 0) & 1;
  if (rt !== _vibRT) { _vibRT = rt; _vibN ^= 1; }
  return _vibN;
}
function sfxIf(name, o) { if (audio.has ? audio.has(name) : true) audio.sfx(name, o); }
function callout(world, x, y, text, color) {
  if (typeof IM.callout === 'function') IM.callout(world, x, y, text, { color });
  else if (world?.game?.settings?.showDamage !== false) world?.fx?.callout?.(x, y, text, { color });
}

/** 레벨/난이도에 따른 적 능력치 */
export function enemyStats(def, level, diff, elite = false) {
  const L = Math.max(1, level ?? def.lv ?? 1);
  const k = L - 1;
  // 체력은 플레이어 기대 공격력 성장(≈선형)에 맞춰 증가 + 후반으로 갈수록 타수 소폭 증가 (tools/balance.mjs 로 검증)
  const hpMul = (1 + 0.354 * k) * (1 + 0.008 * k) * (diff?.enemyHp ?? 1) * (elite ? 2.4 : 1);
  const atkMul = (1 + 0.17 * k + 0.009 * k * k) * (diff?.enemyAtk ?? 1) * (elite ? 1.5 : 1);
  const defMul = 1 + 0.07 * k;
  const maxHp = Math.round((def.hp ?? 20) * hpMul);
  return {
    maxHp, hp: maxHp,
    atk: Math.round((def.atk ?? 8) * atkMul),
    def: Math.round((def.def ?? 0) * defMul),
    res: Math.round((def.res ?? def.def ?? 0) * defMul),
    weak: def.weak ?? [], resist: def.resist ?? [], immune: def.immune ?? [],
    exp: Math.round((def.exp ?? 5) * (1 + 0.22 * k) * (diff?.exp ?? 1) * (elite ? 3 : 1)),
    gold: def.gold ?? [1, 5], level: L,
    crit: 0, critDmg: 0,
  };
}

export class Enemy extends Entity {
  constructor(defId, fx, fy, { level, elite = false, facing = -1, diff, params } = {}) {
    const def = ENEMIES[defId] || ENEMIES[Object.keys(ENEMIES)[0]];
    const s = elite ? 1.15 : 1;
    const w = (def.size?.w ?? 32) * s, h = (def.size?.h ?? 48) * s;
    super(fx - w / 2, fy - h, w, h);
    this.kind = 'enemy';
    this.def = def; this.id = def.id;
    this.elite = elite;
    this.scale = s;
    this.stats = enemyStats(def, level, diff, elite);
    this.hp = this.stats.hp;
    this.facing = facing;
    this.noGravity = !!def.flying;
    this.gravity = def.gravity ?? 1;
    this.baseGravity = this.gravity;
    this.speed = (def.speed ?? 80) * (diff?.enemySpeed ?? 1);
    this.aggro = diff?.aggro ?? 1;
    this.params = { ...(def.aiParams || {}), ...(params || {}) };
    this.state = 'idle'; this.stateT = 0; this.timer = 0;
    this.anim = 'idle'; this.animT = 0;
    this.flashT = 0; this.stun = 0; this.kbT = 0;
    this.invuln = false;
    this.spawnX = this.x; this.spawnY = this.y;
    this.z = 3;
    this.alpha = 1;
    this.dying = 0;
    // 피격 반응 (feel §4.2–4.5)
    this.wclass = weightClassOf(def);
    this.jn = 0; this.down = 0; this.otg = 0; this.wakeInv = 0;
    this.stagger = 0; this.staggerT = 0; this.staggerImm = 0;
    this.wbArmed = 0; this.gbArmed = false; this.hsShake = 0; this.hsCls = 0;
    this.jugg = false; this.juggT = 0; this.guardFall = false;
    this.wbUsed = false; this.gbUsed = false; this.otgGbUsed = false; this.otgCalled = false;
    this.react = { sq: 0, sqT: 0.06, sx: 1, sy: 1, lean: 0, leanT: 0.12, leanA: 0, spin: 0, airLean: 0, lie: 0, armor: 0, dir: 1 };
    this.camXf = null;
    this.ai = AI[def.ai] || AI.walker;
    this.ai.init?.(this);
  }
  hurtbox() {
    const hb = this.def.hurtbox;
    if (hb) return this.relRect(hb.x, hb.y, hb.w, hb.h);
    return { x: this.x + 2, y: this.y + 2, w: this.w - 4, h: this.h - 4 };
  }
  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; } }
  setAnim(a) { if (this.anim !== a) { this.anim = a; this.animT = 0; } }
  get player() { return this.world?.player; }
  distToPlayer() { const p = this.player; return p ? Math.hypot(p.cx - this.cx, p.cy - this.cy) : 1e9; }
  dxToPlayer() { const p = this.player; return p ? p.cx - this.cx : 0; }
  facePlayer() { const d = this.dxToPlayer(); if (d) this.facing = Math.sign(d); }
  /** 발밑 전방에 땅이 있는지 (낭떠러지 회피) */
  groundAhead(dist = 8) {
    const map = this.world.map;
    const x = this.facing > 0 ? this.x + this.w + dist : this.x - dist;
    const t = map.typeAt(Math.floor(x / TILE), Math.floor((this.bottom + 4) / TILE));
    return isSolidType(t) || t === 2;
  }
  wallAhead(dist = 4) {
    const map = this.world.map;
    const x = this.facing > 0 ? this.x + this.w + dist : this.x - dist;
    return isSolidType(map.typeAt(Math.floor(x / TILE), Math.floor((this.bottom - 8) / TILE)));
  }

  /** 근접 공격 판정 (발 중앙 기준 상대 사각형) */
  strike(rx, ry, rw, rh, mv = 1, extra = {}) {
    return enemyStrike(this.world, this.relRect(rx, ry, rw, rh), {
      owner: this, stats: this.stats, mv, dir: this.facing, kb: [260, -260], ...extra,
    });
  }
  /** 투사체 발사 */
  shoot(o) {
    return this.world.spawnProjectile({
      team: 'enemy', owner: this, ...o,
      attack: { stats: this.stats, mv: 1, dir: Math.sign(o.vx ?? this.facing) || this.facing, kb: [220, -200], ...(o.attack || {}) },
    });
  }

  // ───────────────────────── 반응 상태 ─────────────────────────
  /** 지금 반응에 쓰는 무게 등급 (비틀 중인 HEAVY 는 MEDIUM) */
  effClass() { return this.staggerT > 0 && this.wclass === 'HEAVY' ? 'MEDIUM' : this.wclass; }
  /** 쓰러질 수 있는가 (feel §4.4 안전 규칙: FIXED·보스·비행·noKnockdown·작은 적 제외) */
  canKnockdown() {
    if (this.noGravity || this.def.noKnockdown || this.def.fixed) return false;
    const T = tables();
    if (this.h < (T.W.knockdownMinH ?? 50)) return false;
    const kd = T.W[this.effClass()]?.knockdown;
    return kd === true || (kd === 'stagger' && this.staggerT > 0);
  }
  /** 공중에 떠서 반응 중인가 (공중 콤보) */
  get juggling() { return this.jugg && !this.onGround && !this.noGravity; }
  /** 콤보 반응 끝 (회복·기상): 공중 콤보·바운드 기록 초기화 */
  endReaction() {
    this.jn = 0; this.otg = 0; this.jugg = false; this.juggT = 0; this.guardFall = false;
    this.wbUsed = false; this.gbUsed = false; this.otgGbUsed = false; this.otgCalled = false;
    this.gbArmed = false; this.wbArmed = 0;
    this.gravity = this.baseGravity;
    if (this.staggerT > 0) this.endStagger();
  }
  endStagger() { this.staggerT = 0; this.staggerImm = tables().W.stagger.immune ?? 2; }
  tickReact(dt) {
    const R = this.react, T = tables();
    if (R.sq > 0) R.sq -= dt;
    if (R.lean > 0) R.lean -= dt;
    if (R.armor > 0) R.armor -= dt;
    if (this.hsShake > 0) this.hsShake -= dt;
    // 누운 정도: 쓰러질 때 0.1초 만에, 일어날 때 기상 무적 시간 동안 천천히
    const lieT = this.down > 0 ? 1 : this.wakeInv > 0 ? clamp(this.wakeInv / (T.D.wakeInv || 0.3), 0, 1) : 0;
    R.lie += clamp(lieT - R.lie, -dt / 0.12, dt / 0.1);
    if (R.lie < 0.001) R.lie = 0;
    // 공중 회전(작은 적) / 사람형 젖힘
    const W = T.W[this.wclass] ?? {};
    const small = this.h < (T.W.knockdownMinH ?? 50);
    const tumbling = (this.juggling || (this.noGravity && this.stun > 0 && this.kbT > 0)) && small && (this.wclass === 'LIGHT' || this.wclass === 'MEDIUM');
    if (tumbling) R.spin += R.dir * (W.tumble ?? T.W.LIGHT.tumble ?? 8) * dt;
    else if (R.spin) { R.spin = Math.atan2(Math.sin(R.spin), Math.cos(R.spin)) * damp(0.8, dt); if (Math.abs(R.spin) < 0.01) R.spin = 0; }
    const lean = this.juggling && !small && !this.guardFall ? (this.wclass === 'LIGHT' ? (W.humanLean ?? -0.6) : this.wclass === 'MEDIUM' ? (T.W.LIGHT.humanLean ?? -0.6) * 0.75 : 0) * this.facing : 0;
    R.airLean += (lean - R.airLean) * Math.min(1, dt * 14);
    if (Math.abs(R.airLean) < 0.002) R.airLean = 0;
  }

  update(dt, world) {
    this.t += dt; this.stateT += dt; this.animT += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.dying > 0) {
      this.dying -= dt;
      // 처치 타격의 넉백: 쓰러지는 동안 미끄러지고, 공중에서 죽으면 떨어진다
      if (!this.noGravity && (this.vx || this.vy || !this.onGround) && world.map) {
        this.gravity = this.baseGravity;
        moveBody(this, dt, world.map, world.platforms);
        this.vx *= damp(this.onGround ? 0.8 : 0.985, dt);
      }
      if (this.dying <= 0) this.dead = true;
      return;
    }
    // 잠복: 플레이어와 멀리 떨어진 적은 깨어나기 전까지 대기 (넓은 방의 비행형이 시작부터 한꺼번에 몰려오지 않도록)
    if (!this.awake) {
      const p = world.player;
      if (p && (Math.abs(p.cx - this.cx) > (this.def.wakeX ?? 900) || Math.abs(p.cy - this.cy) > (this.def.wakeY ?? 620))) return;
      this.awake = true;
    }
    if (world.timeStop > 0 && !this.def.ignoreTimeStop) { return; }
    const T = tables();
    this.tickReact(dt);
    if (this.wbArmed > 0) this.wbArmed -= dt;
    // 비틀 게이지 (HEAVY)
    if (this.stagger > 0) this.stagger = Math.max(0, this.stagger - (T.W.stagger.decay ?? 4) * dt);
    // 비틀 중 띄워졌거나 쓰러졌으면 착지·기상할 때까지 비틀 유지 (MEDIUM 처럼 다운까지 이어지게)
    if (this.staggerT > 0) { if (!this.juggling && !(this.down > 0)) { this.staggerT -= dt; if (this.staggerT <= 0) this.endStagger(); } }
    else if (this.staggerImm > 0) this.staggerImm -= dt;
    const frozen = !!world.freezeEnemies && !this.def.ignoreFreeze;   // 각성 연출: AI 정지 (피격 반응은 계속)
    let ai = false;
    if (this.down > 0) {
      // 다운: 누워 있음 (AI 정지). 다운 추가타로 튀어올랐다가 다시 떨어져도 계속 누워 있다
      this.down -= dt;
      this.reactBody(dt, world, false);
      if (this.down <= 0) this.wakeUp(world);
    } else if (this.wakeInv > 0) {
      // 기상 중 (무적, AI 정지)
      this.wakeInv -= dt;
      this.reactBody(dt, world, false);
      if (this.wakeInv <= 0) { this.wakeInv = 0; this.stun = 0; this.endReaction(); }
    } else if (this.stun > 0) {
      this.stun -= dt;
      if (this.noGravity) {
        if (this.kbT > 0) {
          this.kbT -= dt;
          // 비행형 넉백 (0.9/스텝 감쇠). 벽을 통과하지 않는 비행형은 벽에서 멈춘다
          const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
          if (!this.def.phase && world.map && isSolidType(world.map.typeAtPx(nx + this.w / 2, ny + this.h / 2))) { this.vx *= -0.3; this.vy *= -0.3; }
          else { this.x = nx; this.y = ny; }
          const d = damp(T.W.flyDamp ?? 0.9, dt); this.vx *= d; this.vy *= d;
        }
      } else {
        this.reactBody(dt, world, true);
        // 공중 콤보 중에는 떨어져 착지할 때까지 경직이 풀리지 않는다 (5초 안전장치)
        if (this.juggling) { this.juggT += dt; if (this.juggT < 5) this.stun = Math.max(this.stun, 0.02); }
      }
      if (this.stun <= 0 && this.down <= 0) {
        this.stun = 0;
        if (this.onGround || this.noGravity) this.endReaction();
        else { this.gravity = this.baseGravity; this.jugg = false; this.jn = 0; }
      }
    } else if (frozen) {
      // 각성 정지: AI 없이 중력과 마찰만
      if (!this.noGravity && world.map) { moveBody(this, dt, world.map, world.platforms); this.vx *= damp(T.W.groundFriction ?? 0.86, dt); }
    } else {
      ai = true;
      if (this.gravity !== this.baseGravity) this.gravity = this.baseGravity;
      this.ai.update(this, world, dt);
      if (!this.noGravity) moveBody(this, dt, world.map, world.platforms);
      else if (!this.def.phase) {
        // 비행체: 단순 벽 충돌
        const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
        if (!isSolidType(world.map.typeAtPx(nx + this.w / 2, ny + this.h / 2))) { this.x = nx; this.y = ny; }
        else { this.vx *= -0.5; this.vy *= -0.5; }
      } else { this.x += this.vx * dt; this.y += this.vy * dt; }
    }
    // 접촉 피해 (누움·기상·공중 콤보·각성 정지 중에는 없음)
    if ((this.def.contact ?? 1) > 0 && !this.harmless && !frozen && this.down <= 0 && this.wakeInv <= 0 && !(this.jugg && this.stun > 0) && (ai || this.stun > 0)) {
      const hb = this.hurtbox();
      enemyStrike(world, hb, { owner: this, stats: this.stats, mv: this.def.contact ?? 1, dir: Math.sign(world.player?.cx - this.cx) || 1, kb: [260, -280], tags: ['contact'] });
    }
    // 낙사
    if (this.y > world.map.pxH + 200) { this.dead = true; }
  }

  /** 반응 중 몸 물리: 공중 콤보 중력, 마찰, 벽 바운드, 착지(다운·바닥 바운드) */
  reactBody(dt, world, stunned) {
    if (this.noGravity || !world.map) return;
    const T = tables(), J = T.J, W = T.W;
    if (this.guardFall) this.gravity = this.baseGravity * (J.guardGrav ?? 1.3);
    else if (this.jugg && (!this.onGround || this.vy < 0)) {
      const jg = W[this.effClass()]?.jg ?? 1;
      this.gravity = this.baseGravity * Math.min(J.gravCap ?? 1.15, jg + (J.gravStep ?? 0.05) * this.jn);
    } else this.gravity = this.baseGravity;
    const vxBefore = this.vx, vyBefore = this.vy, wasAir = !this.onGround;
    moveBody(this, dt, world.map, world.platforms);
    // 벽 바운드 (feel §4.5): 경직 중 벽에 |vx| ≥ 380 으로 부딪힘
    if (stunned && this.hitWall && this.wbArmed > 0 && !this.wbUsed && Math.abs(vxBefore) >= (T.BW.minVx ?? 380)) this.wallBounce(world, vxBefore);
    this.vx *= damp(this.onGround ? (W.groundFriction ?? 0.86) : (W.airDamp ?? 0.985), dt);
    if (this.onGround && wasAir) this.onReactLand(world, vyBefore);
  }

  /** 반응 중 착지: 바닥 바운드 → 튀어오름, 공중 콤보 → 다운, 그 밖에는 짧은 경직 */
  onReactLand(world, vyBefore) {
    const T = tables();
    if (this.down > 0) {
      // 다운 추가타로 튀었다가 다시 떨어짐
      if (vyBefore > 120) world.fx?.burst('dust', this.cx, this.bottom, 2, { speed: 40 });
      return;
    }
    if (this.gbArmed) { this.groundBounce(world); return; }
    if (!this.jugg) return;
    if (this.canKnockdown()) { this.knockdown(world); return; }
    // 쓰러지지 않는 적(작은 적·HEAVY): 굴러 떨어진 뒤 짧게 경직
    this.jugg = false; this.jn = 0; this.juggT = 0; this.guardFall = false;
    this.gravity = this.baseGravity;
    this.stun = Math.max(0.12, Math.min(this.stun, 0.25));
    world.fx?.burst('dust', this.cx, this.bottom, 3, { speed: 60 });
  }

  knockdown(world) {
    const T = tables(), D = T.D;
    const wc = this.effClass();
    this.down = wc === 'LIGHT' ? (D.light ?? 0.6) : (D.medium ?? 0.45);
    this.stun = 0; this.vy = 0; this.vx *= 0.35;
    this.jugg = false; this.jn = 0; this.juggT = 0; this.guardFall = false;
    this.otg = 0; this.otgCalled = false; this.wbUsed = false; this.gbUsed = false; this.gbArmed = false; this.wbArmed = 0;
    this.gravity = this.baseGravity;
    const fx = world.fx;
    if (fx) fx.burst('dust', this.cx, this.bottom - 2, D.dust ?? 6, { speed: 90, jitter: this.h * 0.3 });
    sfxIf('down_hit', { vol: 0.45, pitch: rand(0.9, 1.05) });
  }

  wakeUp(world) {
    const D = tables().D;
    this.down = 0;
    this.wakeInv = D.wakeInv ?? 0.3;
    this.stun = 0; this.vx = 0;
    world.fx?.burst('dust', this.cx, this.bottom - 2, D.wakeDust ?? 4, { speed: 60, jitter: this.h * 0.25 });
  }

  wallBounce(world, vxBefore) {
    const T = tables(), B = T.BW;
    this.vx = -vxBefore * (B.vxK ?? 0.45);
    this.vy = B.vy ?? -380;
    this.stun += B.stunAdd ?? 0.35;
    this.wbUsed = true; this.wbArmed = 0; this.jugg = true; this.juggT = 0;
    const s = vxBefore > 0 ? 1 : -1;
    const wx = s > 0 ? this.x + this.w : this.x, wy = this.cy;
    const fx = world.fx;
    if (fx) {
      if (fx.ering) fx.ering(wx, wy, { color: '#ffe8b0', r0: 6, r1: 54, ry: 0.36, angle: Math.PI / 2, life: 0.32, width: 5 });
      else fx.ring(wx, wy, { color: '#ffe8b0', r0: 6, r1: 50, life: 0.3, width: 5 });
      fx.burst('dust', wx, wy, B.dust ?? 8, { speed: 120, angle: s > 0 ? Math.PI : 0, spread: 1.2 });
      fx.burst('gravel', wx, wy, B.gravel ?? 6, { angle: s > 0 ? Math.PI : 0, spread: 1, speed: 260 });
    }
    const k = B.kick ?? 6;
    world.camera?.kick?.(-s * k, 0);
    sfxIf(B.sfx ?? 'wall_bounce', { vol: 0.85 });
    callout(world, this.cx, this.y - 14, B.callout ?? '벽 바운드!', HFX.REACT_CALLOUT?.bounce ?? '#ffe070');
    this.styleEvent(world, 'wallBounce');
  }

  groundBounce(world) {
    const T = tables(), B = T.BG;
    this.gbArmed = false;
    this.vy = B.bounceVy ?? -520;
    this.stun = Math.max(this.stun, 0.1) + (B.stunAdd ?? 0.3);
    this.jugg = true; this.juggT = 0; this.down = 0;
    const fx = world.fx, x = this.cx, y = this.bottom;
    if (fx) {
      if (fx.ering) fx.ering(x, y - 2, { color: '#ffe8b0', r0: 8, r1: 70, ry: 0.28, life: 0.34, width: 5 });
      else fx.ring(x, y - 2, { color: '#ffe8b0', r0: 8, r1: 60, life: 0.3, width: 5 });
      fx.burst('dust', x, y - 2, B.dust ?? 10, { speed: 140, angle: -Math.PI / 2, spread: 1.4, jitter: this.w * 0.4 });
    }
    HFX.stampDecal?.(world, x, y - 6, 1, 'crack', { floor: true, life: B.decalT ?? 0.8, fade: 0.4, scale: 1.1 });
    const kk = Array.isArray(B.kick) ? B.kick : [0, 7];
    world.camera?.kick?.(kk[0], kk[1]);
    sfxIf(B.sfx ?? 'ground_bounce', { vol: 0.85 });
    callout(world, this.cx, this.y - 14, B.callout ?? '바닥 바운드!', HFX.REACT_CALLOUT?.bounce ?? '#ffe070');
    this.styleEvent(world, 'groundBounce');
  }

  /** 스타일 사건 (벽·바닥 바운드는 Style 이 각성 게이지 +3 도 더한다; Style 이 없으면 world.addAw) */
  styleEvent(world, name) {
    const noAw = !!this._lastNoAw;
    if (world.style?.onEvent) world.style.onEvent(name, { target: this, companion: noAw });
    else if (!noAw && (name === 'wallBounce' || name === 'groundBounce')) world.addAw?.('bounce');
  }

  startStagger(world) {
    const S = tables().W.stagger;
    this.staggerT = S.dur ?? 0.9;
    this.stagger = 0;
    this.stun = Math.max(this.stun, this.staggerT);
    this.flashT = Math.max(this.flashT, 0.16);
    world.fx?.burst('spark', this.cx, this.cy, 8, { color: '#ffb050', speed: 260 });
    sfxIf('impact_crack', { vol: 0.5, pitch: 1.2 });
    callout(world, this.cx, this.y - 14, S.callout ?? '비틀!', HFX.REACT_CALLOUT?.stagger ?? '#ffb050');
    world.style?.onEvent?.('stagger', { target: this });
  }

  /** 피격 반응: 무게 등급별 넉백·띄우기·경직, 공중 콤보, 다운 추가타, 바운드 준비, 비틀 게이지, 그림 반응 */
  applyReaction(attack, world, info) {
    const T = tables(), W = T.W, J = T.J, D = T.D;
    const R = this.react;
    const tags = attack.tags || [];
    const cls0 = info.cls && info.cls !== 'hurt' ? info.cls : (IM.strengthClass?.(attack) ?? 'M');
    const cls = cls0 === 'U' ? 'L' : cls0 === 'S' || cls0 === 'A' ? 'F' : (cls0 in (W.LIGHT.stun ?? {}) ? cls0 : 'M');
    const dir = attack.dir > 0 ? 1 : attack.dir < 0 ? -1 : (this.cx >= (attack.owner?.cx ?? this.cx) ? 1 : -1);
    this._lastNoAw = tags.includes('ult') || tags.includes('awaken') || tags.includes('companion');
    R.dir = dir;
    const kbRes = this.def.kbResist ?? 0;
    // 고정형: 떨림만 (hsShake)
    if (this.wclass === 'FIXED' || kbRes >= 1) return;
    // 비틀 게이지 (HEAVY)
    if (this.wclass === 'HEAVY' && this.staggerT <= 0 && this.staggerImm <= 0 && !info.cont) {
      this.stagger += W.stagger.add?.[cls0] ?? W.stagger.add?.[cls] ?? 1;
      if (this.stagger >= (W.stagger.at ?? 12)) this.startStagger(world);
    }
    const wc = this.effClass(), Wc = W[wc] ?? W.MEDIUM;
    const kb = attack.kb || [180, -120];
    const kbMul = Wc.kbMul === 'res' ? Math.max(Wc.kbMin ?? 0.45, 1 - kbRes) : Wc.kbMul === 'res08' ? Math.max(Wc.kbMin ?? 0, (1 - kbRes) * 0.8) : (typeof Wc.kbMul === 'number' ? Wc.kbMul : 1);
    const stunTab = Wc.stun?.[cls] ?? 0.3;
    const explicit = (attack.stun ?? 0) * (1 - kbRes);
    const stunAdd = info.stunAdd ?? 0;
    // 그림: 뒤로 젖힘 + 찌그러짐
    R.lean = Wc.leanT ?? 0.12; R.leanT = R.lean; R.leanA = dir * (Wc.lean ?? 0.1);
    if (Wc.squash) { R.sq = Wc.squash[2] ?? 0.06; R.sqT = R.sq; R.sx = Wc.squash[0]; R.sy = Wc.squash[1]; }
    // 슈퍼아머: 비틀지 않은 HEAVY 가 자기 공격 동작 중에 맞으면 넉백·경직 없이 주황 테두리 번쩍
    if (wc === 'HEAVY' && (info.counter || IM.isCounterState?.(this))) {
      R.armor = Wc.armorFlash ?? 0.08;
      return;
    }
    // AI 가 막았다 (방패 막기: onHit 에서 guardT 를 켬) → 넉백·경직 없음
    if (this._guarded) return;
    if (this.noGravity) {
      this.vx = dir * kb[0] * kbMul;
      this.vy = kb[1] * 0.3 * kbMul;
      this.kbT = 0.2;
      this.stun = Math.max(this.stun, stunTab, explicit) + stunAdd;
      return;
    }
    // 다운 추가타 (OTG)
    if (this.down > 0) {
      this.otg++;
      if (!this.otgCalled) { this.otgCalled = true; callout(world, this.cx, this.y - 10, D.callout ?? '다운 추가타', HFX.REACT_CALLOUT?.otg ?? '#ffd0a0'); }
      if (info.otgStrong && !this.otgGbUsed) {
        // 강한 다운 추가타: 바닥 바운드 (콤보당 1번)
        this.otgGbUsed = true; this.gbUsed = true;
        this.otg = 0; this.vx = dir * kb[0] * kbMul * 0.3;
        this.groundBounce(world);
        return;
      }
      if (this.otg >= (D.otgWake ?? 2)) { this.wakeUp(world); return; }
      this.vy = Math.min(this.vy, D.otgPop ?? -160);
      this.vx = dir * Math.min(Math.abs(kb[0]), 200) * kbMul * 0.4;
      this.down = Math.max(this.down, 0.3);
      return;
    }
    const launchMul = Wc.launchMul ?? 1;
    const air = !this.onGround;
    if (attack.launch && !info.cont) {
      // 띄우기
      if (launchMul > 0) {
        this.vy = -Math.min(J.launchMax ?? 1000, Math.abs(kb[1]) * (J.launchK ?? 1.25)) * launchMul;
        this.jugg = true; this.juggT = 0;
        if (air) this.jn++;
      } else if (wc === 'HEAVY' && (Wc.hopCls ?? ['H', 'F']).includes(cls)) this.vy = Math.min(this.vy, Wc.hopVy ?? -380);
      this.vx = dir * kb[0] * kbMul;
      this.stun = Math.max(this.stun, stunTab, explicit) + stunAdd;
    } else if (air && launchMul > 0) {
      // 공중 콤보
      this.jugg = true;
      const jn0 = this.jn;   // 이번 타격 전까지의 공중 타수 (한계 14 → 15번째 공중 타격부터 '가드!', feel §10 C5)
      this.jn++;
      if (info.gb && !this.gbUsed) {
        // 바닥 바운드: 내리꽂기 → 착지 때 튀어오름
        this.gbUsed = true; this.gbArmed = true;
        this.vy = T.BG.slamVy ?? 900;
        this.vx = dir * kb[0] * kbMul * 0.4;
      } else if (this.guardFall || jn0 >= (J.limit ?? 14)) {
        // 가드 (띄우기 한계): 더 뜨지 않고 빨리 떨어진다
        if (!this.guardFall) {
          this.guardFall = true;
          this.flashT = Math.max(this.flashT, 0.14);
          world.fx?.flash(this.cx, this.cy, { color: '#ffffff', size: 40, life: 0.1 });
          callout(world, this.cx, this.y - 14, J.guardCallout ?? '가드!', HFX.REACT_CALLOUT?.guard ?? '#ffffff');
        }
        this.vx = dir * kb[0] * kbMul * 0.5;
      } else {
        const pop = cls === 'F' ? (kb[1] < 0 ? Math.min(J.launchMax ?? 1000, Math.abs(kb[1]) * (J.launchK ?? 1.25)) * launchMul : 0) : (J.pop?.[cls] ?? 260) * Math.max(0.2, 1 - (J.popDecay ?? 0.05) * this.jn);
        if (pop > 0) this.vy = Math.min(this.vy, -pop);
        this.vx = dir * kb[0] * kbMul;
      }
      const airStun = Math.max(J.airStunMin ?? 0.18, stunTab - (J.airStunStep ?? 0.02) * this.jn);
      this.stun = Math.max(this.stun, airStun, explicit) + stunAdd;
    } else {
      // 지상 (또는 띄울 수 없는 무거운 적의 공중)
      this.vx = dir * kb[0] * kbMul;
      if (kb[1] < 0) this.vy = Math.min(this.vy, kb[1] * 0.6 * kbMul);
      this.stun = Math.max(this.stun, stunTab, explicit) + stunAdd;
    }
    this.kbT = 0.2;
    // 벽 바운드 준비: F·H 등급 |kb.x| ≥ 320
    if ((cls0 === 'F' || cls0 === 'H' || cls0 === 'S' || cls0 === 'A') && Math.abs(kb[0]) >= (T.BW.armKb ?? 320) && !this.wbUsed) this.wbArmed = T.BW.armT ?? 0.5;
  }

  takeHit(dmg, attack, world, info) {
    if (this.dying > 0) return false;
    if (this.wakeInv > 0) return false;   // 기상 무적 (combat.hitTarget 이 먼저 거른다)
    info = info || {};
    attack = attack || {};
    this.hp -= dmg;
    this.flashT = 0.12;
    const g0 = this.guardT ?? 0;
    this.ai.onHit?.(this, world, attack, info);
    this._guarded = (this.guardT ?? 0) > 0 && (this.guardT ?? 0) !== g0;
    try { this.applyReaction(attack, world, info); } catch (e) { console.error('[enemy] reaction', e); }
    this._guarded = false;
    if (this.hp <= 0) { this.die(world, attack); return true; }
    return false;
  }

  die(world, attack) {
    this.hp = 0;
    this.dying = this.def.dieTime ?? 0.35;
    this.invuln = true;
    this.down = 0; this.wakeInv = 0;
    audio.sfx(this.def.sfxDie || 'enemy_die', { pitch: rand(0.9, 1.1) });
    world.onEnemyKilled(this, attack);
    this.ai.onDie?.(this, world);
    // 클래식 불꽃 소멸 연출
    const fx = world.fx;
    fx.burst('fire', this.cx, this.cy, 10, { speed: 140, jitter: this.w * 0.3 });
    fx.burst('ember', this.cx, this.cy, 12, { speed: 160 });
    if (this.def.material === 'bone') world.spawnBones?.(this);
    else if (this.def.material === 'metal') world.spawnDebris?.(this, '#7a7a88', 6);
    else if (this.def.material === 'stone') world.spawnDebris?.(this, '#77706a', 7);
    else if (this.def.material === 'ghost') fx.burst('soul', this.cx, this.cy, 16, { speed: 120 });
    else fx.burst('blood', this.cx, this.cy, 14, { speed: 260 });
  }

  lights(L) {
    if (this.def.light) L.add(this.cx, this.cy, this.def.light.r ?? 60, this.def.light.color ?? '#ff8040', this.def.light.i ?? 0.7);
    if (this.elite) L.add(this.cx, this.cy, 70, '#ff3050', 0.5);
  }

  /**
   * 피격 반응 변형 (feel §4.2): drawEnemy 전에 (cx, bottom) 기준으로 적용 → 벡터·채색 렌더러 모두에 적용된다.
   * 순서: 히트스톱 떨림 → 누움(몸 가운데 기준 회전, 바닥까지 내림) → 뒤로 젖힘(발 기준) → 공중 회전·젖힘(몸 가운데) → 찌그러짐(발 기준)
   */
  applyReactTransform(ctx, world) {
    const R = this.react, T = tables();
    const cx = this.cx, by = this.bottom, cy = by - this.h / 2;
    let any = false;
    if (this.hsShake > 0 && (world.hitstop ?? 0) > 0) {
      const V = T.W.vib ?? { base: 2, perClass: 1 };
      const amp = (V.base ?? 2) + (V.perClass ?? 1) * (this.hsCls ?? 0);
      if (!any) { this.camXf = ctx.getTransform(); any = true; }
      ctx.translate(vibParity(world.game) ? amp : -amp, 0);
    }
    if (R.lie > 0.001) {
      if (!any) { this.camXf = ctx.getTransform(); any = true; }
      const k = R.lie, ty = cy + (by - this.w * 0.42 - cy) * k;
      ctx.translate(cx, ty);
      ctx.rotate(-this.facing * (Math.PI / 2) * (T.D.rotK ?? 0.9) * k);
      ctx.translate(-cx, -cy);
    }
    let footRot = 0;
    if (R.lean > 0 && R.leanT > 0) { const u = R.lean / R.leanT; footRot += R.leanA * u * (2 - u); }   // 곧바로 젖혔다가 부드럽게 돌아온다
    if (footRot) {
      if (!any) { this.camXf = ctx.getTransform(); any = true; }
      ctx.translate(cx, by); ctx.rotate(footRot); ctx.translate(-cx, -by);
    }
    const midRot = R.spin + R.airLean;
    if (midRot) {
      if (!any) { this.camXf = ctx.getTransform(); any = true; }
      ctx.translate(cx, cy); ctx.rotate(midRot); ctx.translate(-cx, -cy);
    }
    if (R.sq > 0 && R.sqT > 0) {
      const u = R.sq / R.sqT;
      const sx = 1 + (R.sx - 1) * u, sy = 1 + (R.sy - 1) * u;
      if (!any) { this.camXf = ctx.getTransform(); any = true; }
      ctx.translate(cx, by); ctx.scale(sx, sy); ctx.translate(-cx, -by);
    }
    if (!any) this.camXf = null;
    return any;
  }

  draw(ctx, world) {
    ctx.save();
    const a = this.dying > 0 ? clamp(this.dying / (this.def.dieTime ?? 0.35), 0, 1) : 1;
    ctx.globalAlpha = a * this.alpha;
    if (this.elite) {
      // 정예 붉은 후광 (캐시 스프라이트: 매 프레임 그라디언트를 만들지 않는다)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const R = Math.max(this.w, this.h), img = HFX.soft?.('rgba(255,40,70,0.35)');
      if (img) ctx.drawImage(img, this.cx - R, this.cy - R, R * 2, R * 2);
      else {
        const g = ctx.createRadialGradient(this.cx, this.cy, 4, this.cx, this.cy, R);
        g.addColorStop(0, 'rgba(255,40,70,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(this.cx - this.w * 1.5, this.cy - this.h * 1.5, this.w * 3, this.h * 3);
      }
      ctx.restore();
    }
    this.applyReactTransform(ctx, world);
    // 기상 무적: 깜빡임
    if (this.wakeInv > 0 && ((world.game?.frame ?? 0) >> 2) & 1) ctx.globalAlpha *= 0.45;
    drawEnemy(ctx, this, world);
    // 슈퍼아머 번쩍 (주황) · 기상 무적 테두리 (흰빛)
    const R = this.react;
    if ((R.armor > 0 || this.wakeInv > 0 || this.staggerT > 0) && HFX.glow) {
      const col = R.armor > 0 ? (tables().W.HEAVY.armorColor ?? '#ff9a30') : this.staggerT > 0 ? '#ffb050' : '#ffffff';
      const img = HFX.glow(col);
      if (img) {
        const s = Math.max(this.w, this.h) * 1.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = R.armor > 0 ? 0.75 : this.staggerT > 0 ? 0.18 + 0.12 * Math.sin(this.t * 30) : 0.28;
        ctx.drawImage(img, this.cx - s / 2, this.cy - s / 2, s, s);
      }
    }
    ctx.restore();
    if (world.game.debug) {
      const hb = this.hurtbox();
      ctx.strokeStyle = '#0ff'; ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
    }
  }
}
