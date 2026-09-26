// 인벤토리 조작. 공개 API:
//  findItem(state, uid) / addItem(state, inst) / addByBase(state, baseId, qty, opts) / removeItem(state, uid, qty)
//  countItem(state, baseId) / consumeByBase(state, baseId, qty) / equipItem(state, hero, uid, slot?) / unequip(state, hero, slot)
//  isEquipped(state, uid) / canEquip(state, hero, inst) / useItem(state, hero, uid, player) → {ok, msg}
//  sortInventory(state, mode:'type'|'rarity'|'new') / sellItem(state, uid, qty) → 골드 / sellJunk(state, maxRarity) → {count, gold}
//  toggleLock(state, uid) → locked / buyItem(state, baseId, {rarity, price, qty}) → {ok, msg, item}
//  quickHeal(state, hero, player) → {ok, msg} (전투 중 가장 알맞은 회복약 자동 사용) / freeSlots(state)
//  equippedByOther(state, hero, uid) → charId|null / ensureWeapon(state, hero) → 새로 낀 무기|null
// 아이템 인스턴스: { uid, baseId, slot, icon, rarity(0~5), level(강화 0~15), affixes:[{stat,value,id}], qty, locked, t }
import { ITEMS, makeItem, isEquipment, buyPrice, sellPrice, itemName, itemStats } from '../data/items.js';
import { bus } from '../core/events.js';
import { audio } from '../core/audio.js';
import { CHARACTERS } from '../data/characters.js';

export const INV_LIMIT = 300;
let _seq = 0;

export function findItem(state, uid) {
  if (!uid || !state?.inventory) return null;
  return state.inventory.find((i) => i.uid === uid) || null;
}

export function freeSlots(state) { return INV_LIMIT - (state?.inventory?.length ?? 0); }

export function addItem(state, inst, { silent = false } = {}) {
  if (!inst) return null;
  const base = ITEMS[inst.baseId];
  inst.t ??= Date.now() * 1000 + (++_seq % 1000);
  if (base?.stack) {
    let left = inst.qty ?? 1, last = null;
    for (const ex of state.inventory) {
      if (left <= 0) break;
      if (ex.baseId !== inst.baseId || (ex.qty ?? 1) >= base.stack) continue;
      const add = Math.min(left, base.stack - (ex.qty ?? 1));
      ex.qty = (ex.qty ?? 1) + add; left -= add; last = ex;
    }
    // 남은 수량은 새 묶음으로
    while (left > 0 && state.inventory.length < INV_LIMIT) {
      const n = Math.min(left, base.stack);
      const it = last ? makeItem(inst.baseId, { qty: n }) : inst;
      it.qty = n; state.inventory.push(it); left -= n; last = it;
    }
    if (last && !silent) bus.emit('itemPicked', { item: last, qty: inst.qty ?? 1 });
    return last;
  }
  if (state.inventory.length >= INV_LIMIT) return null;
  state.inventory.push(inst);
  if (!silent) bus.emit('itemPicked', { item: inst, qty: inst.qty ?? 1 });
  return inst;
}

export function addByBase(state, baseId, qty = 1, opts = {}) {
  const inst = makeItem(baseId, opts);
  if (!inst) return null;
  if (ITEMS[baseId]?.stack) { inst.qty = qty; return addItem(state, inst); }
  let last = null;
  for (let i = 0; i < qty; i++) last = addItem(state, i === 0 ? inst : makeItem(baseId, opts)) || last;
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
  let n = 0;
  for (const i of state?.inventory || []) if (i.baseId === baseId) n += i.qty ?? 1;
  return n;
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
  const base = ITEMS[inst?.baseId];
  if (!base) return { ok: false, reason: '알 수 없는 아이템' };
  if (!isEquipment(base)) return { ok: false, reason: '장비가 아님' };
  if (base.slot === 'weapon') {
    const ch = CHARACTERS[hero.charId];
    const types = ch?.weaponTypes ?? [ch?.weaponType];
    if (!types.includes(base.wtype)) return { ok: false, reason: '이 캐릭터가 다룰 수 없는 무기 계열' };
  }
  if (base.chars && !base.chars.includes(hero.charId)) return { ok: false, reason: '이 캐릭터는 장착할 수 없다' };
  if ((base.lvReq ?? 1) > hero.level) return { ok: false, reason: `레벨 ${base.lvReq} 필요` };
  return { ok: true };
}

export function equipItem(state, hero, uid, slotHint = null) {
  const inst = findItem(state, uid);
  if (!inst) return false;
  const base = ITEMS[inst.baseId];
  if (!isEquipment(base)) return false;
  let slot = base.slot;
  if (slot === 'acc') slot = slotHint === 'acc1' || slotHint === 'acc2' ? slotHint : !hero.equip.acc1 ? 'acc1' : !hero.equip.acc2 ? 'acc2' : 'acc1';
  // 다른 영웅(또는 다른 장신구 칸)에 끼워져 있으면 해제
  for (const h of Object.values(state.heroes)) for (const s in h.equip) if (h.equip[s] === uid) h.equip[s] = null;
  hero.equip[slot] = uid;
  return slot;
}

export function unequip(state, hero, slot) { hero.equip[slot] = null; }

/** 다른 영웅이 이 장비를 끼고 있으면 그 영웅의 charId (자기 자신이면 null) — 장착 전 확인·안내용 */
export function equippedByOther(state, hero, uid) {
  const who = isEquipped(state, uid);
  return who && who !== hero?.charId ? who : null;
}

/**
 * 무기 칸이 비었거나 사라진 아이템을 가리키면 쓸 수 있는 무기를 다시 끼운다
 * (강화 파괴·손상된 세이브 대비 — '무기는 해제할 수 없다' 불변식 유지).
 * 가방에 쓸 만한 무기가 없으면 시작 무기를 새로 지급한다. 반환: 새로 장착한 아이템 | null
 */
export function ensureWeapon(state, hero) {
  if (!state || !hero) return null;
  hero.equip ??= { weapon: null, head: null, body: null, cloak: null, acc1: null, acc2: null };
  if (hero.equip.weapon && findItem(state, hero.equip.weapon)) return null;
  hero.equip.weapon = null;
  const power = (it) => { const st = itemStats(it); return (st.atk ?? 0) + (st.mag ?? 0); };
  let best = null, bestP = -1;
  for (const it of state.inventory || []) {
    if (ITEMS[it.baseId]?.slot !== 'weapon' || isEquipped(state, it.uid) || !canEquip(state, hero, it).ok) continue;
    const pw = power(it);
    if (pw > bestP) { best = it; bestP = pw; }
  }
  if (!best) {
    const sw = CHARACTERS[hero.charId]?.startWeapon;
    best = sw ? addItem(state, makeItem(sw), { silent: true }) : null;
  }
  if (best) hero.equip.weapon = best.uid;
  return best;
}

// ───────────────────────────── 사용 ─────────────────────────────
const STATUS_KEYS = ['poison', 'curse', 'slow', 'freeze', 'stone', 'bleed', 'burn'];
function hasStatus(p) {
  return STATUS_KEYS.some((k) => p.buffs?.[k] || p.status?.[k] || p[k + 'T'] > 0);
}
function clearStatus(p) {
  let had = false;
  for (const k of STATUS_KEYS) {
    if (p.buffs?.[k]) { delete p.buffs[k]; had = true; }
    if (p.status?.[k]) { p.status[k] = 0; had = true; }
    const tk = k + 'T';
    if (p[tk] > 0) { p[tk] = 0; had = true; }
  }
  return had;
}
/** 마을(허브) 월드인지 — 허브 World 는 mode 'town' 이며 스테이지 id 는 'town' */
function isTownWorld(w) {
  return !!w && (w.mode === 'town' || w.stage?.town || w.stage?.theme === 'town' || w.stage?.id === 'town' || w.stage?.id === 'hub');
}

/**
 * 소모품 사용. player 가 있으면(스테이지 안) 즉시 효과 적용, 없으면 마을/메뉴 → 사용하지 않고 안내만.
 * 반환 {ok, msg, warp?}
 */
export function useItem(state, hero, uid, player = null) {
  if (player && typeof player.heal !== 'function' && player.player) player = player.player; // ctx 객체 호환
  const it = findItem(state, uid);
  if (!it) return { ok: false, msg: '아이템을 찾을 수 없다.' };
  const b = ITEMS[it.baseId];
  if (!b?.use) return { ok: false, msg: isEquipment(b) ? '장비는 장착해서 사용한다.' : '사용할 수 없는 물건이다.' };
  const u = b.use;
  const w = player?.world;
  // 스테이지 밖(메뉴) 또는 마을 허브: 아이템을 소모하지 않고 안내만
  if (!player || !w || isTownWorld(w)) {
    if (u.warp) return { ok: false, msg: w ? '이미 마을에 있다.' : '이미 안전한 곳에 있다.' };
    if (u.buff) return { ok: false, msg: '전투 중에만 사용할 수 있다.' };
    return { ok: false, msg: '마을에서는 휴식으로 기력이 가득 차 있다. 전투 중에 사용하자.' };
  }
  if (player.dead) return { ok: false, msg: '지금은 사용할 수 없다.' };
  const s = player.stats;
  const parts = [];
  if (u.warp) {
    if (w.bossActive && !w.cleared) return { ok: false, msg: '보스의 결계가 귀환을 가로막는다!' };
  } else if (!u.buff) {
    const needHp = u.heal && player.hp < s.hp - 0.5;
    const needMp = u.mp && player.mp < s.mp - 0.5;
    const needCure = u.cure && hasStatus(player);
    if (!needHp && !needMp && !needCure) {
      const full = u.heal && u.mp ? 'HP와 MP가 이미 가득 찼다.' : u.mp ? 'MP가 이미 가득 찼다.' : 'HP가 이미 가득 찼다.';
      return { ok: false, msg: u.cure ? (u.heal || u.mp ? `상태 이상이 없고 ${full}` : '상태 이상이 없다.') : full };
    }
  }
  if (u.heal) { const got = player.heal(s.hp * u.heal); if (got > 0) parts.push(`HP +${got}`); }
  if (u.mp) {
    const before = player.mp;
    player.mp = Math.min(s.mp, player.mp + s.mp * u.mp);
    const got = Math.round(player.mp - before);
    if (got > 0) { parts.push(`MP +${got}`); w.fx?.text?.(player.cx, player.y - 28, '+' + got, { color: '#8ac8ff', size: 18 }); }
  }
  if (u.cure && clearStatus(player)) parts.push('상태 이상 해제');
  if (u.buff) {
    w.applyPowerup?.(u.buff.id);
    player.buffs[u.buff.id] = u.buff.time;
    player.refreshStats?.();
    parts.push(`${u.buff.time}초 강화`);
  }
  removeItem(state, uid, 1);
  bus.emit('itemUsed', { item: it, baseId: it.baseId });
  // 연출
  if (!u.buff) {
    const col = u.mp && !u.heal ? '#8ac8ff' : u.heal >= 1 ? '#ffe070' : '#7ee07e';
    w.fx?.burst?.('holy', player.cx, player.cy, u.heal >= 1 ? 30 : 14, { color: col, speed: 160 });
    w.fx?.ring?.(player.cx, player.cy, { color: col, r0: 8, r1: 70, life: 0.4, width: 4 });
    audio.sfx('heal');
  }
  if (u.warp) {
    audio.sfx('mist');
    w.game?.flash?.('#ffffff', 0.8, 2);
    w.syncRun?.(); w.syncToState?.();
    const g = w.game;
    const dest = g?.registry?.hub ? 'hub' : g?.registry?.worldmap ? 'worldmap' : 'title';
    g?.go?.(dest);
    return { ok: true, msg: `${b.name} — 마을로 귀환한다.`, warp: true };
  }
  return { ok: true, msg: `${b.name} 사용${parts.length ? ' — ' + parts.join(', ') : ''}` };
}

/** 전투 중 단축 회복: 잃은 HP에 맞는 가장 저렴한 회복약을 고른다 */
export function quickHeal(state, hero, player) {
  if (!player?.stats) return { ok: false, msg: '지금은 사용할 수 없다.' };
  const lost = 1 - player.hp / player.stats.hp;
  if (lost <= 0.01) return { ok: false, msg: 'HP가 이미 가득 찼다.' };
  const order = lost > 0.55 ? ['c_hipotion', 'c_potion', 'c_meat', 'c_elixir', 'c_bread'] : ['c_potion', 'c_meat', 'c_bread', 'c_hipotion', 'c_elixir'];
  for (const id of order) {
    const it = state.inventory.find((i) => i.baseId === id);
    if (it) return useItem(state, hero, it.uid, player);
  }
  return { ok: false, msg: '회복약이 없다!' };
}

// ───────────────────────────── 정렬 · 판매 · 잠금 · 구매 ─────────────────────────────
const SLOT_ORDER = { weapon: 0, head: 1, body: 2, cloak: 3, acc: 4, consumable: 5, material: 6, key: 7 };
const WT_ORDER = { whip: 0, sword: 1, greatsword: 2, dagger: 3, gun: 4, staff: 5 };
function sortKey(state, it) {
  const b = ITEMS[it.baseId] || {};
  return { eq: isEquipped(state, it.uid) ? 0 : 1, slot: SLOT_ORDER[b.slot] ?? 9, wt: WT_ORDER[b.wtype] ?? 0, tier: b.tier ?? 0, r: it.rarity ?? 0, lv: it.level ?? 0, t: it.t ?? 0, name: b.name ?? '' };
}
/** 정렬: 'type'(부위→단계) | 'rarity'(희귀도→강화) | 'new'(최근 획득) — 장착 중인 장비는 항상 앞 */
export function sortInventory(state, mode = 'type') {
  const keys = new Map(state.inventory.map((it) => [it, sortKey(state, it)]));
  const cmp = {
    type: (a, b) => a.slot - b.slot || a.wt - b.wt || b.tier - a.tier || b.r - a.r || b.lv - a.lv || a.name.localeCompare(b.name, 'ko'),
    rarity: (a, b) => b.r - a.r || b.lv - a.lv || a.slot - b.slot || b.tier - a.tier || a.name.localeCompare(b.name, 'ko'),
    new: (a, b) => b.t - a.t,
  }[mode] || ((a, b) => 0);
  state.inventory.sort((x, y) => { const a = keys.get(x), b = keys.get(y); return a.eq - b.eq || cmp(a, b); });
  return state.inventory;
}

/** 판매 가능 여부 {ok, reason} */
export function canSell(state, it) {
  const b = ITEMS[it?.baseId];
  if (!b) return { ok: false, reason: '알 수 없는 아이템' };
  if (b.slot === 'key') return { ok: false, reason: '중요 물품은 팔 수 없다.' };
  if (it.locked) return { ok: false, reason: '잠긴 아이템이다.' };
  if (isEquipped(state, it.uid)) return { ok: false, reason: '장착 중인 장비는 팔 수 없다.' };
  return { ok: true };
}

/** 판매 → 받은 골드 (실패 시 0) */
export function sellItem(state, uid, qty = 1) {
  const it = findItem(state, uid);
  if (!it || !canSell(state, it).ok) return 0;
  const n = Math.max(1, Math.min(qty | 0 || 1, it.qty ?? 1));
  const gold = sellPrice(it) * n;
  removeItem(state, uid, n);
  state.gold += gold;
  bus.emit('itemSold', { baseId: it.baseId, qty: n, gold });
  return gold;
}

/** 잡동사니 일괄 판매: 잠기지 않고 장착하지 않은 장비 중 희귀도 maxRarity 이하 */
export function sellJunk(state, maxRarity = 1) {
  let gold = 0, count = 0;
  for (const it of [...state.inventory]) {
    if (!isEquipment(it) || (it.rarity ?? 0) > maxRarity || (it.level ?? 0) > 0 || !canSell(state, it).ok) continue;
    gold += sellItem(state, it.uid, 1); count++;
  }
  return { count, gold };
}

export function toggleLock(state, uid) {
  const it = findItem(state, uid);
  if (!it) return false;
  it.locked = !it.locked;
  return it.locked;
}

/** 구매: 골드 차감 후 인벤토리에 추가 */
export function buyItem(state, baseId, { rarity = 0, price = null, qty = 1, level = 0 } = {}) {
  const b = ITEMS[baseId];
  if (!b) return { ok: false, msg: '존재하지 않는 상품이다.' };
  qty = Math.max(1, qty | 0);
  const unit = price ?? buyPrice(baseId, rarity);
  const total = unit * qty;
  if (state.gold < total) return { ok: false, msg: '골드가 부족하다.' };
  const need = b.stack ? 1 : qty;
  if (freeSlots(state) < need && !(b.stack && state.inventory.some((i) => i.baseId === baseId && (i.qty ?? 1) + qty <= b.stack))) return { ok: false, msg: '가방이 가득 찼다.' };
  let item;
  if (b.stack) item = addItem(state, makeItem(baseId, { qty }), { silent: true });
  else for (let i = 0; i < qty; i++) item = addItem(state, makeItem(baseId, { rarity, level }), { silent: true }) || item;
  if (!item) return { ok: false, msg: '가방이 가득 찼다.' };
  state.gold -= total;
  bus.emit('itemBought', { baseId, qty, gold: total, item });
  return { ok: true, msg: `${itemName(item, { noLevel: true })}${qty > 1 ? ' ×' + qty : ''} 구입 (-${total.toLocaleString('ko-KR')}G)`, item };
}
