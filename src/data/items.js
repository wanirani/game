// [임시 최소 구현] 아이템 담당 에이전트가 전면 확장한다. 아래 export API는 반드시 유지:
//  ITEMS: { [baseId]: base }  base = { id, name, slot:'weapon'|'head'|'body'|'cloak'|'acc'|'consumable'|'material'|'key',
//     wtype?, tier(1~6), icon, lvReq, stats:{}, visual:{}, element?, price, stack?, use?, desc }
//  RARITIES, makeItem(baseId, {rarity, level, affixes}) → inst, itemStats(inst) → {stat:value}
//  itemName(inst), sellPrice(inst)
import { uid } from '../core/math.js';

export const RARITIES = [
  { name: '일반', color: '#d8d0c0', mult: 1.0, affixes: 0 },
  { name: '고급', color: '#6fe07a', mult: 1.12, affixes: 1 },
  { name: '희귀', color: '#5aa8ff', mult: 1.25, affixes: 2 },
  { name: '영웅', color: '#c07cff', mult: 1.42, affixes: 3 },
  { name: '전설', color: '#ffa640', mult: 1.65, affixes: 4 },
  { name: '신화', color: '#ff4a5a', mult: 2.0, affixes: 5 },
];

export const ITEMS = {
  w_whip_1: { id: 'w_whip_1', name: '가죽 채찍', slot: 'weapon', wtype: 'whip', tier: 1, icon: 'whip_1', lvReq: 1, stats: { atk: 8 }, visual: { style: 1, color: '#6a4424' }, price: 120 },
  w_staff_1: { id: 'w_staff_1', name: '떡갈나무 지팡이', slot: 'weapon', wtype: 'staff', tier: 1, icon: 'staff_1', lvReq: 1, stats: { atk: 4, mag: 8 }, visual: { style: 1, color: '#7a5a3a' }, price: 120 },
  w_gun_1: { id: 'w_gun_1', name: '부싯돌 권총', slot: 'weapon', wtype: 'gun', tier: 1, icon: 'gun_1', lvReq: 1, stats: { atk: 7 }, visual: { style: 1, color: '#5a5058' }, price: 120 },
  w_greatsword_1: { id: 'w_greatsword_1', name: '철 대검', slot: 'weapon', wtype: 'greatsword', tier: 1, icon: 'greatsword_1', lvReq: 1, stats: { atk: 11 }, visual: { style: 1, color: '#9a9aa0' }, price: 120 },
  w_dagger_1: { id: 'w_dagger_1', name: '사냥 단검', slot: 'weapon', wtype: 'dagger', tier: 1, icon: 'dagger_1', lvReq: 1, stats: { atk: 6, crit: 3 }, visual: { style: 1, color: '#c8ccd8' }, price: 120 },
  w_sword_1: { id: 'w_sword_1', name: '철 장검', slot: 'weapon', wtype: 'sword', tier: 1, icon: 'sword_1', lvReq: 1, stats: { atk: 9 }, visual: { style: 1, color: '#c8ccd8' }, price: 120 },
  a_body_1: { id: 'a_body_1', name: '여행자 튜닉', slot: 'body', tier: 1, icon: 'body_1', lvReq: 1, stats: { def: 3 }, visual: {}, price: 80 },
  a_body_2: { id: 'a_body_2', name: '가죽 갑옷', slot: 'body', tier: 1, icon: 'body_2', lvReq: 1, stats: { def: 5 }, visual: { armor: 'leather', color: '#5a3a24' }, price: 150 },
  a_body_3: { id: 'a_body_3', name: '사슬 갑옷', slot: 'body', tier: 2, icon: 'body_3', lvReq: 1, stats: { def: 8, hp: 10 }, visual: { armor: 'chain', color: '#8a8e9a' }, price: 300 },
  c_potion: { id: 'c_potion', name: '회복 물약', slot: 'consumable', icon: 'potion_hp', stack: 99, use: { heal: 0.35 }, price: 60, desc: 'HP를 35% 회복한다.' },
};

export function makeItem(baseId, { rarity = 0, level = 0, affixes = [] } = {}) {
  const b = ITEMS[baseId];
  if (!b) return null;
  return { uid: uid('i'), baseId, slot: b.slot, icon: b.icon, rarity, level, affixes, qty: 1 };
}

export function itemStats(inst) {
  const b = ITEMS[inst.baseId];
  if (!b?.stats) return {};
  const r = RARITIES[inst.rarity ?? 0];
  const out = {};
  for (const k in b.stats) out[k] = b.stats[k] * r.mult * (1 + 0.1 * (inst.level ?? 0));
  for (const a of inst.affixes || []) out[a.stat] = (out[a.stat] ?? 0) + a.value;
  return out;
}

export function itemName(inst) {
  const b = ITEMS[inst.baseId];
  return (inst.level ? `+${inst.level} ` : '') + (b?.name ?? '???');
}
export function sellPrice(inst) { return Math.floor((ITEMS[inst.baseId]?.price ?? 10) * 0.3); }
