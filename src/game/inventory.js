// 인벤토리 조작 (아이템 담당이 확장). 공개 API:
//  findItem(state, uid) / addItem(state, inst) / addByBase(state, baseId, qty, opts) / removeItem(state, uid, qty)
//  countItem(state, baseId) / consumeByBase(state, baseId, qty) / equipItem(state, hero, uid) / unequip(state, hero, slot)
//  isEquipped(state, uid) / useItem(state, hero, uid, ctx)
// 아이템 인스턴스: { uid, baseId, slot, icon, rarity(0~5), level(강화 0~15), affixes:[{stat,value,id}], qty, locked }
import { ITEMS, makeItem } from '../data/items.js';
import { bus } from '../core/events.js';
import { CHARACTERS } from '../data/characters.js';

export const INV_LIMIT = 300;

export function findItem(state, uid) {
  if (!uid || !state?.inventory) return null;
  return state.inventory.find((i) => i.uid === uid) || null;
}

export function addItem(state, inst) {
  const base = ITEMS[inst.baseId];
  if (base?.stack) {
    const ex = state.inventory.find((i) => i.baseId === inst.baseId);
    if (ex) { ex.qty = Math.min(base.stack, (ex.qty ?? 1) + (inst.qty ?? 1)); bus.emit('itemPicked', { item: ex, qty: inst.qty ?? 1 }); return ex; }
  }
  if (state.inventory.length >= INV_LIMIT) return null;
  state.inventory.push(inst);
  bus.emit('itemPicked', { item: inst, qty: inst.qty ?? 1 });
  return inst;
}

export function addByBase(state, baseId, qty = 1, opts = {}) {
  const inst = makeItem(baseId, opts);
  if (!inst) return null;
  if (ITEMS[baseId]?.stack) { inst.qty = qty; return addItem(state, inst); }
  let last = null;
  for (let i = 0; i < qty; i++) last = addItem(state, i === 0 ? inst : makeItem(baseId, opts));
  return last;
}

export function removeItem(state, uid, qty = 1) {
  const i = state.inventory.findIndex((x) => x.uid === uid);
  if (i < 0) return false;
  const it = state.inventory[i];
  if ((it.qty ?? 1) > qty) { it.qty -= qty; return true; }
  state.inventory.splice(i, 1);
  for (const h of Object.values(state.heroes || {})) for (const s in h.equip) if (h.equip[s] === uid) h.equip[s] = null;
  return true;
}

export function countItem(state, baseId) {
  return state.inventory.filter((i) => i.baseId === baseId).reduce((a, i) => a + (i.qty ?? 1), 0);
}

export function consumeByBase(state, baseId, qty = 1) {
  if (countItem(state, baseId) < qty) return false;
  let left = qty;
  for (const it of [...state.inventory]) {
    if (it.baseId !== baseId || left <= 0) continue;
    const take = Math.min(left, it.qty ?? 1);
    removeItem(state, it.uid, take);
    left -= take;
  }
  return true;
}

export function isEquipped(state, uid) {
  for (const h of Object.values(state.heroes || {})) for (const s in h.equip) if (h.equip[s] === uid) return h.charId;
  return null;
}

/** 장착 가능 여부: {ok, reason} */
export function canEquip(state, hero, inst) {
  const base = ITEMS[inst.baseId];
  if (!base) return { ok: false, reason: '알 수 없는 아이템' };
  if (!['weapon', 'head', 'body', 'cloak', 'acc'].includes(base.slot)) return { ok: false, reason: '장비가 아님' };
  if (base.slot === 'weapon') {
    const ch = CHARACTERS[hero.charId];
    const types = ch?.weaponTypes ?? [ch?.weaponType];
    if (!types.includes(base.wtype)) return { ok: false, reason: '이 캐릭터가 다룰 수 없는 무기 계열' };
  }
  if ((base.lvReq ?? 1) > hero.level) return { ok: false, reason: `레벨 ${base.lvReq} 필요` };
  return { ok: true };
}

export function equipItem(state, hero, uid) {
  const inst = findItem(state, uid);
  if (!inst) return false;
  const base = ITEMS[inst.baseId];
  let slot = base.slot;
  if (slot === 'acc') slot = !hero.equip.acc1 ? 'acc1' : !hero.equip.acc2 ? 'acc2' : 'acc1';
  // 다른 영웅이 끼고 있으면 해제
  for (const h of Object.values(state.heroes)) for (const s in h.equip) if (h.equip[s] === uid) h.equip[s] = null;
  hero.equip[slot] = uid;
  return slot;
}

export function unequip(state, hero, slot) { hero.equip[slot] = null; }
