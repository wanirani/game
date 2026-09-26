// 드롭 테이블. 반환 형식: [{type, data}] → world.spawnPickup(type, x, y, data)
//  type: 'heart'{value} | 'gold'{amount} | 'food'{heal, icon} | 'item'{item} | 'sub'{id} | 'powerup'{id} | 'oneup' | 'mp'{amount}
//  rollCandleLoot(world, big) / rollEnemyLoot(world, enemy) / rollChestLoot(world, contents) / rollBossLoot(world, boss)
//  rollPowerupId() / stoneForLevel(lv) / rollEquipDrop(world, level, opts)
// 장비 드롭: 일반 적 2.5%, 정예 12% (행운·난이도·드롭 보너스 보정), 희귀도는 스테이지 레벨·행운에 비례.
// 2부 규칙 (world2 §6.9):
//  · 보스 drops 의 고유 장비는 1부와 같다 (첫 처치 확정, 재도전 40%). 세계의 심장(worldHeart)은 이미 얻었거나
//    가방·바닥에 있으면 다시 떨어뜨리지 않는다 (중복 없음).
//  · 신화 무기: 니힐 첫 처치 확정 · 이후 50%, 그 밖의 2부 보스 1.5%, 태초의 공허(s20) 정예 0.6%.
//    2부(챕터 ≥ 14 스테이지 또는 2부 보스)는 MYTHIC_WEAPONS_P2(7단계)에서, 1부는 MYTHIC_WEAPONS(6단계)에서 뽑는다.
import { chance, randi, weightedPick, pick } from '../core/math.js';
import { POWERUPS } from '../data/powerups.js';
import { SUB_ORDER } from '../data/subweapons.js';
import { ITEMS, makeItem, rollItem, rollRarity, BOSS_UNIQUES, MYTHIC_WEAPONS, MYTHIC_WEAPONS_P2, isEquipment } from '../data/items.js';

/** 's14' → 14 (스테이지 id 가 아니면 0) */
const chapterOfStage = (id) => { const m = /^s(\d+)$/.exec(String(id ?? '')); return m ? +m[1] : 0; };
/** 2부 드롭 규칙을 쓰는가: 챕터 ≥ 14 스테이지, 또는 2부 보스 (투기장 보스 러시 포함) */
function isPart2(world, boss = null) {
  return (world.stage?.chapter ?? 0) >= 14 || chapterOfStage(boss?.def?.stageId) >= 14;
}
/** 세계의 심장을 이미 가졌거나 가방·바닥에 있는가 (중복 드롭 방지) */
function heartOwned(world, id) {
  const st = world.state;
  if (st?.progress?.hearts?.includes(id)) return true;
  if (st?.inventory?.some?.((i) => i?.baseId === id)) return true;
  return !!world.entities?.some?.((e) => e.kind === 'pickup' && !e.dead && e.data?.item?.baseId === id);
}

function luckOf(world) { return world.player?.stats?.luck ?? 0; }
function dropMulOf(world) {
  const s = world.player?.stats;
  return (world.diff?.drop ?? 1) * (1 + (s?.dropBonus ?? 0) / 100) * (1 + (s?.luck ?? 0) / 200);
}
function stageLv(world) { return world.stage?.level ?? 1; }
/** 레벨에 맞는 강화석 등급 (1~6) */
export function stoneForLevel(lv) { return lv < 6 ? 1 : lv < 14 ? 2 : lv < 24 ? 3 : lv < 34 ? 4 : lv < 42 ? 5 : 6; }
function stoneDrop(lv, qty = 1, up = 0) {
  const t = Math.max(1, Math.min(6, stoneForLevel(lv) - (chance(0.35) ? 1 : 0) + up));
  return { type: 'item', data: { item: makeItem(`m_stone_${t}`, { qty }) } };
}
/** 장비 드롭 (30%는 플레이어 무기 계열로 고정) */
export function rollEquipDrop(world, level, opts = {}) {
  const wt = world.player?.stats?.weaponType;
  const o = { luck: luckOf(world), diff: world.diff, ...opts };
  if (!o.slot && !o.wtype && wt && chance(0.3)) o.wtype = wt;
  return { type: 'item', data: { item: rollItem(level, o) } };
}

/** 촛불/촛대 */
export function rollCandleLoot(world, big) {
  const diff = world.diff;
  const r = Math.random();
  const lv = stageLv(world);
  if (big) {
    if (r < 0.1) return [{ type: 'sub', data: { id: pick(SUB_ORDER) } }];
    if (r < 0.2) return [{ type: 'powerup', data: { id: rollPowerupId() } }];
    if (r < 0.45) return [{ type: 'heart', data: { value: 5 } }];
    if (r < 0.7) return [{ type: 'gold', data: { amount: randi(10, 30) * lv } }];
    if (r < 0.8 * (diff.healDrop ?? 1)) return [{ type: 'food', data: { heal: 0.25, icon: 'meat' } }];
    if (r < 0.83) return [stoneDrop(lv)];
    return [{ type: 'heart', data: { value: 1 } }, { type: 'heart', data: { value: 1 } }];
  }
  if (r < 0.5) return [{ type: 'heart', data: { value: 1 } }];
  if (r < 0.62) return [{ type: 'heart', data: { value: 5 } }];
  if (r < 0.8) return [{ type: 'gold', data: { amount: randi(3, 12) * lv } }];
  if (r < 0.86) return [{ type: 'mp', data: { amount: 15 } }];
  if (r < 0.9) return [{ type: 'sub', data: { id: pick(SUB_ORDER) } }];
  if (r < 0.93) return [{ type: 'powerup', data: { id: rollPowerupId() } }];
  return [{ type: 'heart', data: { value: 1 } }];
}

export function rollPowerupId() {
  return weightedPick(Object.values(POWERUPS)).id;
}

/** 일반 적 처치 */
export function rollEnemyLoot(world, enemy) {
  const out = [];
  const d = enemy.def;
  const dropMul = dropMulOf(world);
  const lv = enemy.stats?.level ?? stageLv(world);
  const g = d.gold ?? [1, 5];
  if (chance(0.55)) out.push({ type: 'gold', data: { amount: Math.round(randi(g[0], g[1]) * (1 + (lv - 1) * 0.3) * (world.diff.gold ?? 1)) } });
  if (chance(0.12)) out.push({ type: 'heart', data: { value: 1 } });
  for (const dr of d.drops || []) {
    if (!chance((dr.p ?? 0.1) * dropMul)) continue;
    if (dr.id === 'heart') out.push({ type: 'heart', data: { value: dr.qty ?? 1 } });
    else if (dr.id === 'food') out.push({ type: 'food', data: { heal: 0.2, icon: 'meat' } });
    else if (dr.id === 'mp') out.push({ type: 'mp', data: { amount: 20 } });
    else if (ITEMS[dr.id]) {
      const b = ITEMS[dr.id];
      if (isEquipment(b) && !b.unique) out.push({ type: 'item', data: { item: rollItem(lv, { luck: luckOf(world), diff: world.diff, slot: b.slot, wtype: b.wtype, tier: b.tier }) } });
      else out.push({ type: 'item', data: { item: makeItem(dr.id, { qty: dr.qty ?? 1 }) } });
    }
  }
  // 장비
  if (chance((enemy.elite ? 0.12 : 0.025) * dropMul)) out.push(rollEquipDrop(world, lv, { minRarity: enemy.elite ? 1 : 0, boost: enemy.elite ? 0.25 : 0 }));
  // 강화석
  if (chance((enemy.elite ? 0.3 : 0.03) * dropMul)) out.push(stoneDrop(lv, enemy.elite ? randi(1, 2) : 1));
  // 황금 박쥐: 고유 반지 (희귀)
  if (d.id === 'golden_bat' && chance(0.06 * dropMul)) out.push({ type: 'item', data: { item: makeItem('u_goldbat') } });
  // 심연의 역성 정예: 신화 무기 (극히 희귀) · 태초의 공허 정예: 2부 신화 무기 0.6%
  if (enemy.elite && world.stage?.id === 's13' && chance(0.004 * dropMul)) out.push(mythicDrop(world));
  if (enemy.elite && world.stage?.id === 's20' && chance(0.006 * dropMul)) out.push(mythicDrop(world, true));
  if (enemy.elite && chance(0.6)) out.push({ type: 'powerup', data: { id: rollPowerupId() } });
  return out;
}

/** 신화 무기 (70%는 플레이어 무기 계열). p2 = 2부 목록(7단계) 사용 — 기본: 스테이지 챕터 ≥ 14 */
function mythicDrop(world, p2 = isPart2(world)) {
  const table = p2 && Object.keys(MYTHIC_WEAPONS_P2).length ? MYTHIC_WEAPONS_P2 : MYTHIC_WEAPONS;
  const wt = world.player?.stats?.weaponType;
  const id = (chance(0.7) && table[wt]) || pick(Object.values(table));
  return { type: 'item', data: { item: makeItem(id) } };
}

/**
 * 보물상자. contents:
 *  아이템 id 문자열 → 해당 아이템 (일반 장비 베이스면 희귀도 추첨, 최소 고급) / 'equip' | 'rare' | 'epic' → 무작위 장비
 *  {type, data} → 그대로 / 배열 → 각각 / 없음 → 기본 상자 (골드 + 장비 70% + 강화석 + 하트)
 */
export function rollChestLoot(world, contents) {
  const lv = stageLv(world);
  const luck = luckOf(world);
  if (Array.isArray(contents)) return contents.flatMap((c) => rollChestLoot(world, c));
  if (contents) {
    if (typeof contents === 'string') {
      if (contents === 'equip') return [rollEquipDrop(world, lv, { minRarity: 1, boost: 0.3 })];
      if (contents === 'rare') return [rollEquipDrop(world, lv + 3, { minRarity: 2, boost: 0.5 })];
      if (contents === 'epic') return [rollEquipDrop(world, lv + 5, { minRarity: 3, boost: 0.8 })];
      if (contents === 'mythic') return [mythicDrop(world)];
      if (contents.startsWith('gold:')) return [{ type: 'gold', data: { amount: +contents.slice(5) || 100 } }];
      const b = ITEMS[contents];
      if (b) {
        if (isEquipment(b) && !b.unique) return [{ type: 'item', data: { item: makeItem(contents, { rarity: Math.max(1, rollRarityLite(lv, luck, world)) }) } }];
        return [{ type: 'item', data: { item: makeItem(contents) } }];
      }
    } else if (contents.type) return [contents];
  }
  const out = [{ type: 'gold', data: { amount: randi(40, 90) * lv } }];
  if (chance(0.7)) out.push(rollEquipDrop(world, lv + 1, { minRarity: 1, boost: 0.3 }));
  if (chance(0.6)) out.push(stoneDrop(lv, randi(1, 3)));
  if (chance(0.08)) out.push({ type: 'item', data: { item: makeItem(chance(0.5) ? 'm_scroll_bless' : 'c_hipotion') } });
  out.push({ type: 'heart', data: { value: 5 } });
  return out;
}
function rollRarityLite(lv, luck, world) {
  return rollRarity(lv, { luck, diff: world.diff, boost: 0.3 });
}

/** 보스: 골드 + 1UP + 고유 장비(첫 처치 확정, 재도전 40%) + 세계의 심장(중복 없음) + 무작위 전설 + 강화석 + 신화 무기(혼돈의 군주·니힐) */
export function rollBossLoot(world, boss) {
  const lv = Math.max(stageLv(world), boss.stats?.level ?? 0);
  const id = boss.def?.id;
  const st = world.state;
  const out = [{ type: 'gold', data: { amount: 500 * stageLv(world) } }, { type: 'oneup' }];
  const flags = st?.progress?.flags;
  const first = !flags?.['loot_' + id];
  if (flags && id) flags['loot_' + id] = true;
  // 고유 장비: 보스 데이터의 drops 우선, 없으면 기본 매핑
  const ids = (boss.def?.drops?.length ? boss.def.drops : BOSS_UNIQUES[id] || []).filter((x) => ITEMS[x]);
  for (const uid of ids) {
    const b = ITEMS[uid];
    if (b.worldHeart) { if (!heartOwned(world, uid)) out.push({ type: 'item', data: { item: makeItem(uid) } }); continue; }
    if (b.unique ? first || chance(0.4) : true) out.push({ type: 'item', data: { item: makeItem(uid, { rarity: b.unique ? b.rarity : 4 }) } });
  }
  // 무작위 전설 장비 (재도전 시에도 확정, 영웅 이상)
  out.push(rollEquipDrop(world, lv + 2, { minRarity: first ? 4 : 3, boost: 1 }));
  // 강화석 묶음
  out.push(stoneDrop(lv, randi(2, 4), 1));
  if (chance(0.35)) out.push({ type: 'item', data: { item: makeItem(chance(0.4) ? 'm_scroll_protect' : 'm_scroll_bless') } });
  out.push({ type: 'item', data: { item: makeItem('c_hipotion', { qty: 2 }) } });
  // 신화 무기: 혼돈의 군주·니힐 50%(첫 처치 확정), 그 밖의 보스 1% (2부 보스 1.5%)
  const p2 = isPart2(world, boss);
  const finalBoss = id === 'b_chaos' || id === 'b_nihil';
  if (finalBoss ? first || chance(0.5) : chance((p2 ? 0.015 : 0.01) * dropMulOf(world))) out.push(mythicDrop(world, id === 'b_nihil' || p2));
  return out;
}
