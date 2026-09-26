// 전투 판정/데미지 계산/타격 연출
//
// Attack 객체 스키마:
// {
//   owner, team:'player'|'enemy', stats (공격자 스탯, 생략 시 owner.stats),
//   mv: 모션 배율(1.0=기본), type:'phys'|'mag', element:null|'fire'|'ice'|'holy'|'dark'|'thunder',
//   dir: ±1 (넉백 방향), kb:[x,y] 넉백 속도, hitstop: 초, shake: px,
//   hitId: 같은 hitId로는 대상당 1회만 타격 (휘두르기 1회 = hitId 1개), rehit: 초 (지속 판정 재타격 간격)
//   crit: 추가 치명타 확률(%), mult: 추가 배율(버프), flat: 고정 피해, tags: ['melee','sub','skill','ult','projectile','contact']
//   fx: 'slash'|'blunt'|'pierce'|'magic'|'fire'|'holy'|'ice'|'dark'|'thunder'|'bullet', launch: 띄우기, stun: 경직(초)
//   breakWalls: 부서지는 벽 파괴 가능 여부 (기본 true for player)
// }
import { rand, clamp, overlap } from '../core/math.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';

export const ELEMENT_COLORS = {
  fire: '#ff7a2a', ice: '#9fe8ff', holy: '#fff2a0', dark: '#b060ff', thunder: '#bfe0ff', none: '#ffffff',
};
export const ELEMENT_NAMES = { fire: '화염', ice: '냉기', holy: '신성', dark: '암흑', thunder: '번개' };

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
  if (el && ts['res' + el[0].toUpperCase() + el.slice(1)]) dmg *= 1 - clamp(ts['res' + el[0].toUpperCase() + el.slice(1)], -100, 80) / 100;
  if (ts.dmgReduce) dmg *= 1 - clamp(ts.dmgReduce, 0, 75) / 100;
  let crit = false;
  const critChance = (s.crit ?? 0) + (attack.crit ?? 0);
  if (Math.random() * 100 < critChance) { crit = true; dmg *= 1.5 + (s.critDmg ?? 0) / 100; }
  dmg *= rand(0.92, 1.08);
  return { dmg: Math.max(dmg > 0 ? 1 : 0, Math.round(dmg)), crit, weak, resist };
}

/**
 * 대상 타격. 대상은 takeHit(dmg, attack, world, info) 를 구현해야 함.
 * 반환: {dmg, crit, killed} 또는 null(무시됨)
 */
export function hitTarget(world, attack, target, hx, hy) {
  if (target.dead || target.invuln) return null;
  if (attack.hitId) {
    target._hits ??= new Map();
    const last = target._hits.get(attack.hitId);
    if (last !== undefined) {
      if (!attack.rehit || world.time - last < attack.rehit) return null;
    }
    target._hits.set(attack.hitId, world.time);
    if (target._hits.size > 64) target._hits.delete(target._hits.keys().next().value);
  }
  const src = attack.stats || attack.owner?.stats;
  if (attack.team === 'player' && attack.owner?.kind === 'player') attack = classPerkAttack(attack, target, world);
  const res = computeDamage(src, target, attack);
  const info = { ...res, hx, hy };
  const killed = target.takeHit(res.dmg, attack, world, info);
  info.killed = !!killed;

  // ── 연출 ──
  const px = hx ?? target.cx, py = hy ?? target.cy;
  const col = ELEMENT_COLORS[attack.element || 'none'];
  const heavy = (attack.hitstop ?? 0) >= 0.08 || res.crit;
  if (attack.team === 'player') {
    world.hitstop = Math.max(world.hitstop, (attack.hitstop ?? 0.05) * (res.crit ? 1.4 : 1) * (killed ? 1.3 : 1));
    world.camera.shake((attack.shake ?? 3) * (res.crit ? 1.6 : 1) * (world.game.settings?.screenShake ?? 1), heavy ? 0.22 : 0.12);
    world.onPlayerHit?.(target, info, attack);
    const mat = target.def?.material ?? 'flesh';
    const fx = world.fx;
    fx.flash(px, py, { color: col, size: heavy ? 70 : 44, life: 0.1 });
    fx.burst('hit', px, py, heavy ? 10 : 6, { color: col, angle: attack.dir > 0 ? 0 : Math.PI, spread: 1.1 });
    if (mat === 'flesh') fx.burst('blood', px, py, heavy ? 10 : 5, { angle: attack.dir > 0 ? -0.4 : Math.PI + 0.4, spread: 0.9 });
    else if (mat === 'bone') fx.burst('shard', px, py, 5, { color: '#e8dcc0', size: 3 });
    else if (mat === 'metal') fx.burst('spark', px, py, 10, { color: '#ffd080' });
    else if (mat === 'ghost') fx.burst('soul', px, py, 6);
    else if (mat === 'stone') fx.burst('shard', px, py, 6, { color: '#8a8480' });
    else if (mat === 'slime') fx.burst('blood', px, py, 6, { color: '#6adf4a' });
    else if (mat === 'paper') fx.burst('shard', px, py, 6, { color: '#e8e0c8', grav: 200 });
    else if (mat === 'ice') fx.burst('ice', px, py, 8);
    else if (mat === 'fire') fx.burst('fire', px, py, 6);
    if (attack.element && attack.element !== 'none') {
      const pt = { fire: 'fire', ice: 'ice', holy: 'holy', dark: 'dark', thunder: 'thunder' }[attack.element];
      if (pt) fx.burst(pt, px, py, 6);
    }
    if (res.crit) fx.ring(px, py, { color: '#ffe080', r0: 6, r1: 60, life: 0.25, width: 5 });
    if (world.game.settings?.showDamage !== false) {
      const color = res.crit ? '#ffd24a' : res.weak ? '#ff8a4a' : res.resist ? '#9a9aa8' : '#ffffff';
      fx.text(px, py - 20, res.crit ? `${res.dmg}!` : res.dmg, { color, size: res.crit ? 28 : 20, crit: res.crit });
    }
    audio.sfx(res.crit ? 'crit' : heavy ? 'hit_heavy' : 'hit', { vol: 0.9, pitch: rand(0.92, 1.08) });
  } else {
    world.camera.shake(5 * (world.game.settings?.screenShake ?? 1), 0.2);
    world.fx.burst('blood', px, py, 8, {});
    if (world.game.settings?.showDamage !== false) world.fx.text(px, py - 30, res.dmg, { color: '#ff5050', size: 22 });
  }
  return info;
}

/** 직업(클래스) 특성: 공격 시점·대상에 따라 피해 배율/치명타 보정 (data/classes.js perk 설명과 대응) */
function classPerkAttack(attack, target, world) {
  const p = attack.owner, cls = p.hero?.classId ?? '', chain = cls;
  let mult = attack.mult ?? 1, crit = attack.crit ?? 0;
  const ts = target.stats || {};
  const hpRatio = (target.hp ?? 1) / (ts.maxHp ?? target.hp ?? 1);
  if (cls === 'victor_executioner' && hpRatio < 0.25) mult *= 1.6;
  if (cls === 'victor_phantom' && p.lastDashT !== undefined && p.t - p.lastDashT < 1.2) mult *= 2;
  if (cls === 'kael_nightraven' && !p.onGround) mult *= 1.3;
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
    // 여러 피격 판정(보스 머리·몸통 등)을 모두 검사
    const boxes = e.hurtboxes ? e.hurtboxes() : [e.hurtbox ? e.hurtbox() : e];
    const hb = boxes.find((b) => b && overlap(rect, b));
    if (!hb) continue;
    const hx = clamp(attack.dir > 0 ? rect.x + rect.w * 0.7 : rect.x + rect.w * 0.3, hb.x, hb.x + hb.w);
    const hy = clamp(rect.y + rect.h / 2, hb.y + 4, hb.y + hb.h - 4);
    if (hitTarget(world, attack, e, hx, hy)) n++;
  }
  if (attack.breakWalls !== false) world.breakTilesIn(rect, attack);
  return n;
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
