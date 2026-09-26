// 드롭 테이블 (아이템 담당이 장비 드롭을 확장). 반환 형식: [{type, data}] → world.spawnPickup(type, x, y, data)
//  type: 'heart'{value} | 'gold'{amount} | 'food'{heal, icon} | 'item'{item} | 'sub'{id} | 'powerup'{id} | 'oneup' | 'mp'{amount}
import { chance, randi, weightedPick, pick } from '../core/math.js';
import { POWERUPS } from '../data/powerups.js';
import { SUB_ORDER } from '../data/subweapons.js';
import { ITEMS, makeItem } from '../data/items.js';

/** 촛불/촛대 */
export function rollCandleLoot(world, big) {
  const diff = world.diff;
  const r = Math.random();
  const lv = world.stage.level ?? 1;
  if (big) {
    if (r < 0.1) return [{ type: 'sub', data: { id: pick(SUB_ORDER) } }];
    if (r < 0.2) return [{ type: 'powerup', data: { id: rollPowerupId() } }];
    if (r < 0.45) return [{ type: 'heart', data: { value: 5 } }];
    if (r < 0.7) return [{ type: 'gold', data: { amount: randi(10, 30) * lv } }];
    if (r < 0.8 * (diff.healDrop ?? 1)) return [{ type: 'food', data: { heal: 0.25, icon: 'meat' } }];
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
  const luck = world.player?.stats?.luck ?? 0;
  const dropMul = (world.diff.drop ?? 1) * (1 + (world.player?.stats?.dropBonus ?? 0) / 100) * (1 + luck / 200);
  const g = d.gold ?? [1, 5];
  if (chance(0.55)) out.push({ type: 'gold', data: { amount: Math.round(randi(g[0], g[1]) * (1 + (enemy.stats.level - 1) * 0.3) * (world.diff.gold ?? 1)) } });
  if (chance(0.12)) out.push({ type: 'heart', data: { value: 1 } });
  for (const dr of d.drops || []) {
    if (!chance((dr.p ?? 0.1) * dropMul)) continue;
    if (dr.id === 'heart') out.push({ type: 'heart', data: { value: dr.qty ?? 1 } });
    else if (dr.id === 'food') out.push({ type: 'food', data: { heal: 0.2, icon: 'meat' } });
    else if (dr.id === 'mp') out.push({ type: 'mp', data: { amount: 20 } });
    else if (ITEMS[dr.id]) out.push({ type: 'item', data: { item: makeItem(dr.id, { qty: dr.qty ?? 1 }) } });
  }
  if (enemy.elite && chance(0.6)) out.push({ type: 'powerup', data: { id: rollPowerupId() } });
  return out;
}

/** 보물상자 */
export function rollChestLoot(world, contents) {
  if (contents) {
    if (typeof contents === 'string' && ITEMS[contents]) return [{ type: 'item', data: { item: makeItem(contents) } }];
    if (contents.type) return [contents];
  }
  const lv = world.stage.level ?? 1;
  return [{ type: 'gold', data: { amount: randi(40, 90) * lv } }, { type: 'heart', data: { value: 5 } }];
}

/** 보스 */
export function rollBossLoot(world, boss) {
  const out = [{ type: 'gold', data: { amount: 500 * (world.stage.level ?? 1) } }, { type: 'oneup' }];
  for (const id of boss.def?.drops || []) if (ITEMS[id]) out.push({ type: 'item', data: { item: makeItem(id, { rarity: 4 }) } });
  return out;
}
