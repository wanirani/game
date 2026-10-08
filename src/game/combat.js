// 전투 판정/데미지 계산 (owner: FEEL-IMPACT). 타격 연출은 game/impact.js.
//
// Attack 객체 스키마:
// {
//   owner, team:'player'|'enemy', stats (공격자 스탯, 생략 시 owner.stats),
//   mv: 모션 배율(1.0=기본), type:'phys'|'mag', element:null|'fire'|'ice'|'holy'|'dark'|'thunder',
//   dir: ±1 (넉백 방향), kb:[x,y] 넉백 속도, hitstop: 초 (0 = 경직 없음), shake: px,
//   hitId: 같은 hitId로는 대상당 1회만 타격 (휘두르기 1회 = hitId 1개), rehit: 초 (지속 판정 재타격 간격)
//   crit: 추가 치명타 확률(%), mult: 추가 배율(버프), flat: 고정 피해, tags: ['melee','sub','skill','ult','awaken','projectile','contact','companion','guardian','assist','mount']
//   fx: 'slash'|'blunt'|'pierce'|'magic'|'fire'|'holy'|'ice'|'dark'|'thunder'|'bullet', launch: 띄우기, stun: 경직(초)
//   breakWalls: 부서지는 벽 파괴 가능 여부 (기본 true for player)
//   moveId: 무기 동작 id (player.makeAttack), final: 필살기/각성기 마지막 일격, finisher: 마무리 공격
//   dmgColor: 데미지 숫자 색 (치명타가 아닐 때; 수호신 공격 등)
//   capFn(target, dmg, world) → 이번 타격 최대 피해 (각성기 보스 상한 등, impact.modDamage)
//   otg / gb: 강한 다운 추가타 / 바닥 바운드 동작 (보통은 data/feel_hit.js FEEL_MOVE_OVERRIDES 로 지정)
// }
// 다중 부위 대상: target.hitParts() → [{x,y,w,h, off?, defMul?, defAdd?, armor?, prio?, onHit?(part, dmg, attack, world)}]
//   playerStrike 가 공격 판정과 겹치는 부위 중 가장 가까운(작은) 부위(prio 부위가 겹치면 그것)를 골라 target.hitPart 에 두고,
//   부위 방어 배율(defMul/defAdd)을 target.stats.def/res 에 반영한다. onHit 은 대상의 takeHit 이 부르지 않았다면 여기서 부른다.
import { clamp, overlap } from '../core/math.js';
import { bus } from '../core/events.js';
import { preImpact, modDamage, hitInfo, impact, ELEMENT_COLORS, ELEMENT_NAMES } from './impact.js';
import { perkAttack } from './class_perks.js';   // 직업 특성 onAttack (classes_t3 §3.4; 순환 import — 함수 안에서만 쓴다)

export { ELEMENT_COLORS, ELEMENT_NAMES };

/** 순수 데미지 계산 */
export function computeDamage(src, tgt, attack) {
  const s = src || {};
  const ts = tgt.stats || tgt;
  if (attack.flat) return { dmg: Math.round(attack.flat), crit: false, weak: false, resist: false };
  const power = attack.type === 'mag' ? (s.mag ?? 10) : (s.atk ?? 10);
  let dmg = power * (attack.mv ?? 1) * (attack.mult ?? 1);
  const el = attack.element;
  if (el) dmg *= 1 + (s[el] ?? 0) / 100;
  if (attack.tags?.includes('sub')) dmg *= 1 + (s.subDmg ?? 0) / 100;
  if (attack.tags?.includes('skill')) dmg *= 1 + (s.skillDmg ?? 0) / 100;
  const def = attack.type === 'mag' ? (ts.res ?? 0) : (ts.def ?? 0);
  dmg *= 100 / (100 + Math.max(0, def) * 1.2);
  let weak = false, resist = false;
  if (el && ts.weak?.includes(el)) { dmg *= 1.6; weak = true; }
  if (el && ts.resist?.includes(el)) { dmg *= 0.5; resist = true; }
  if (el && ts.immune?.includes(el)) { dmg = 0; resist = true; }
  // 대상이 플레이어면 속성 저항 %
  // 상한 80% — 100 은 그대로 무효 (성검사 계열 신성 저항 100, classes_t3 §6 C10)
  if (el && ts['res' + el[0].toUpperCase() + el.slice(1)]) { const r = ts['res' + el[0].toUpperCase() + el.slice(1)]; dmg *= 1 - clamp(r, -100, r >= 100 ? 100 : 80) / 100; }
  if (ts.dmgReduce) dmg *= 1 - clamp(ts.dmgReduce, 0, 75) / 100;
  let crit = false;
  const critChance = (s.crit ?? 0) + (attack.crit ?? 0);
  if (Math.random() * 100 < critChance) { crit = true; dmg *= 1.5 + (s.critDmg ?? 0) / 100; }
  dmg *= 0.92 + Math.random() * 0.16;
  return { dmg: Math.max(dmg > 0 ? 1 : 0, Math.round(dmg)), crit, weak, resist };
}

/**
 * 대상 타격. 대상은 takeHit(dmg, attack, world, info) 를 구현해야 함.
 * 순서: 중복 판정(hitId) → 직업 특성 → impact.preImpact(강도·카운터·백어택) → computeDamage → impact.modDamage
 *       → takeHit(info) → impact.impact(연출)
 * 반환: info {dmg, crit, weak, resist, killed, cls, counter, back, …} 또는 null(무시됨)
 */
export function hitTarget(world, attack, target, hx, hy) {
  if (target.dead || target.invuln || target.wakeInv > 0) return null;
  // 수호신 공격은 거울 스위치 등 noGuardianHit 대상을 건드리지 않는다 (MASTER_PLAN §1.2: 경직·불꽃·효과음도 없음)
  if (target.noGuardianHit && attack.tags?.includes('guardian')) return null;
  let rehit = false;
  if (attack.hitId) {
    target._hits ??= new Map();
    const last = target._hits.get(attack.hitId);
    if (last !== undefined) {
      if (!attack.rehit || world.time - last < attack.rehit) return null;
      rehit = true;
    }
    target._hits.set(attack.hitId, world.time);
    if (target._hits.size > 64) target._hits.delete(target._hits.keys().next().value);
  }
  const src = attack.stats || attack.owner?.stats;
  // 각성 중 특성 부가 타격(proc)은 그 각성의 보스 30% 상한을 함께 쓴다 — 각성 타격이 부른 proc(world.procCapFn, world.onPlayerHit)
  // 또는 감독이 도는 동안의 proc(world.awProcCap, awaken.js). 상한이 다 차면 1 / 0 ('저항') — requests_f ULT-AWAKEN verify (32.7 %)
  if (attack.proc && !attack.capFn && attack.team === 'player') {
    const cf = world.procCapFn ?? world.awProcCap;
    if (typeof cf === 'function') attack = { ...attack, capFn: cf };
  }
  if (attack.team === 'player' && attack.owner?.kind === 'player') { attack = classPerkAttack(attack, target, world); if (!attack.proc && attack.owner.perks?.onAttack) attack = perkAttack(attack.owner.perks.onAttack, attack.owner, attack, target, world); }
  const pi = preImpact(world, attack, target, rehit);
  attack = pi.attack;
  const res = computeDamage(src, target, attack);
  modDamage(world, pi, res, target);
  const rl = world.rules;   // [hook:plat] 일일 도전 '유리 대포': 주는 피해 × dealt, 영웅이 받는 피해 × taken (docs/specs/online.md §2.5)
  if (rl && res.dmg > 0) { const k = attack.team === 'player' ? rl.dealt ?? 1 : target.kind === 'player' ? rl.taken ?? 1 : 1; if (k !== 1) res.dmg = Math.max(1, Math.round(res.dmg * k)); }   // [hook:plat]
  const info = hitInfo(pi, res, hx, hy, target);
  if (attack.team === 'player' && !pi.prop) target.lastImpact = { cls: pi.cls, crit: res.crit, dmg: res.dmg, hpBefore: target.hp, counter: pi.counter, back: pi.back, t: world.time };
  // 부위 onHit: 대상의 takeHit 이 직접 부르지 않았을 때만 여기서 부른다 (BossB 는 스스로 부름)
  const part = info.part, pOn = typeof part?.onHit === 'function' ? part.onHit : null;
  let partCalled = false;
  if (pOn) part.onHit = function (...a) { partCalled = true; return pOn.apply(this, a); };
  let killed;
  try { killed = target.takeHit(res.dmg, attack, world, info); }
  finally { if (pOn) part.onHit = pOn; }
  if (pOn && !partCalled) pOn.call(part, part, res.dmg, attack, world);
  info.killed = !!killed;
  if (attack.team !== 'player') info.landed = killed !== false;
  impact(world, attack, target, info);
  return info;
}

/** 직업(클래스) 특성: 공격 시점·대상에 따라 피해 배율/치명타 보정 (data/classes.js perk 설명과 대응) */
function classPerkAttack(attack, target, world) {
  const p = attack.owner, cls = p.hero?.classId ?? '', chain = cls;
  let mult = attack.mult ?? 1, crit = attack.crit ?? 0;
  const ts = target.stats || {};
  const hpRatio = (target.hp ?? 1) / (ts.maxHp ?? target.hp ?? 1);
  // 처형인: 체력 25% 이하 적에게 +60%
  if (cls === 'victor_executioner' && hpRatio < 0.25) mult *= 1.6;
  // 팬텀: 대시 후 1초간(대시 0.25초 포함 1.2초) 피해 2배
  if (cls === 'victor_phantom' && p.lastDashT !== undefined && p.t - p.lastDashT < 1.2) mult *= 2;
  // 나이트 레이븐: 공중 공격 +30%
  if (cls === 'kael_nightraven' && !p.onGround) mult *= 1.3;
  // 워로드: 콤보 10마다 +5% (최대 +50%)
  if (cls === 'bran_warlord') mult *= 1 + Math.min(0.5, Math.floor((world.combo?.n ?? 0) / 10) * 0.05);
  // 암살자 계열: 등 뒤 공격 치명타 확정
  if (chain.startsWith('lia_') && target.facing !== undefined && Math.sign(target.facing) === Math.sign(attack.dir || 0) && target.kind !== 'boss') crit += 100;
  // 퇴마사 계열: 언데드 추가 피해
  if (chain.startsWith('sera_') && (target.def?.material === 'bone' || target.def?.material === 'ghost')) mult *= 1.15;
  if (mult === (attack.mult ?? 1) && crit === (attack.crit ?? 0)) return attack;
  return { ...attack, mult, crit };
}

/** 플레이어 공격 판정 사각형으로 모든 적/부서지는 오브젝트 타격. 반환: 맞힌 수 */
export function playerStrike(world, rect, attack) {
  let n = 0;
  for (const e of world.hittables()) {
    if (e.dead || e === attack.owner) continue;
    // 피격 판정: hitParts()(부위별 방어 배율·약점) > hurtboxes()(여러 몸통) > hurtbox()
    let boxes;
    if (e.hitParts) { if (e.invuln) continue; boxes = e.hitParts() || []; }
    else boxes = e.hurtboxes ? e.hurtboxes() : [e.hurtbox ? e.hurtbox() : e];
    const hb = e.hitParts ? pickPart(rect, boxes) : boxes.find((b) => b && !b.off && overlap(rect, b));
    if (!hb) continue;
    if (e.hitParts) {
      // 맞은 부위 기록 → takeHit 에서 부위 효과(약점 파괴·갑옷 반응) 적용, 부위 방어 배율 반영
      e.hitPart = hb;
      if (e.stats) {
        if (e.baseDef === undefined) { e.baseDef = e.stats.def ?? 0; e.baseRes = e.stats.res ?? e.baseDef; }
        const m = hb.defMul ?? 1;
        e.stats.def = Math.round(e.baseDef * m + (hb.defAdd ?? 0));
        e.stats.res = Math.round((e.baseRes ?? e.baseDef) * m + (hb.defAdd ?? 0));
      }
    }
    const hx = clamp(attack.dir > 0 ? rect.x + rect.w * 0.7 : rect.x + rect.w * 0.3, hb.x, hb.x + hb.w);
    const hy = clamp(rect.y + rect.h / 2, hb.y + 4, hb.y + hb.h - 4);
    if (hitTarget(world, attack, e, hx, hy)) n++;
  }
  if (attack.breakWalls !== false) world.breakTilesIn(rect, attack);
  return n;
}

/** 겹친 부위 중 공격 판정 중심에 가장 가까운 부위 (중심을 포함하는 부위가 여럿이면 더 작은 부위 = 머리·눈 같은 약점 우선).
 *  prio 부위는 겹치기만 하면 그것 (큰 부위 사이에 낀 작은 과녁 — 카론 혼불 등불, POLISH-5) */
function pickPart(rect, parts) {
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  let best = null, bd = Infinity;
  for (const b of parts) {
    if (!b || b.off || !overlap(rect, b)) continue;
    if (b.prio) return b;
    const dx = cx - clamp(cx, b.x, b.x + b.w), dy = cy - clamp(cy, b.y, b.y + b.h);
    const d = dx * dx + dy * dy + b.w * b.h * 1e-6;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/** 적 → 플레이어 공격 판정 */
export function enemyStrike(world, rect, attack) {
  const p = world.player;
  if (!p || p.dead) return false;
  if (!overlap(rect, p.hurtbox())) return false;
  return !!hitTarget(world, { team: 'enemy', ...attack }, p, p.cx, p.cy);
}

export function emitKill(world, enemy) {
  bus.emit('enemyKilled', { enemy, def: enemy.def, x: enemy.cx, y: enemy.cy, byPlayer: true });
}
