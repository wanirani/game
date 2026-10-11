// 인벤토리 조작. 공개 API:
//  findItem(state, uid) / addItem(state, inst) / addByBase(state, baseId, qty, opts) / removeItem(state, uid, qty)
//  countItem(state, baseId) / consumeByBase(state, baseId, qty) / equipItem(state, hero, uid, slot?) / unequip(state, hero, slot)
//  isEquipped(state, uid) / canEquip(state, hero, inst) / useItem(state, hero, uid, player) → {ok, msg}
//  sortInventory(state, mode:'type'|'rarity'|'new') / sellItem(state, uid, qty) → 골드 / sellJunk(state, maxRarity|crit, opts) → {count, gold, items}
//  처분 (qol_equip §4): neverDispose(state, it) → 이유|null · disposeCandidates(state, crit) · disposeJunk(state, crit, {mode:'sell'|'salvage', buyback})
//    salvageYield(inst) · 되사기 buybackList / pushBuyback / buybackTick / buyBack(state, i) (state.buyback, 최대 30, 스테이지 3번)
//  toggleLock(state, uid) → locked / buyItem(state, baseId, {rarity, price, qty}) → {ok, msg, item}
//  quickHeal(state, hero, player) → {ok, msg} (전투 중 가장 알맞은 회복약 자동 사용) / freeSlots(state) / usedSlots(state) / canAdd(state, inst)
//  queueLoot(state, inst) / deliverLoot(state) → 넣은 개수 (가방이 가득 차 받지 못한 전리품 보관함 progress.lootQueue)
//  grantItem(state, baseId, qty, opts) → {added, queued} (보상 지급: 못 넣은 몫은 보관함으로) / ownsItem(state, baseId) → 가방(장착 포함)·보관함에 있는가
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

/** 중요 물품(key 칸: 유물·퀘스트 물품·별의 조각·세계의 심장)은 가방 한도에 들지 않고 가득 차도 반드시 들어간다 (유일한 출처를 잃지 않게) */
export const limitFree = (base) => base?.slot === 'key';
/** 한도에 드는 칸 수 (중요 물품 제외) */
export function usedSlots(state) {
  let n = 0;
  for (const i of state?.inventory ?? []) if (!limitFree(ITEMS[i.baseId])) n++;
  return n;
}
export function freeSlots(state) { return INV_LIMIT - usedSlots(state); }
/** inst 를 통째로 받을 수 있는가 (쌓이는 물건은 기존 묶음의 남은 수량 + 빈 칸 수로 계산) */
export function canAdd(state, inst) {
  if (!inst || !state?.inventory) return false;
  const base = ITEMS[inst.baseId];
  if (limitFree(base)) return true;
  const free = freeSlots(state);
  if (!base?.stack) return free > 0;
  let room = Math.max(0, free) * base.stack;
  for (const ex of state.inventory) if (ex.baseId === inst.baseId) room += Math.max(0, base.stack - (ex.qty ?? 1));
  return room >= (inst.qty ?? 1);
}

export function addItem(state, inst, { silent = false } = {}) {
  if (!inst) return null;
  const base = ITEMS[inst.baseId];
  inst.t ??= Date.now() * 1000 + (++_seq % 1000);
  const cap = limitFree(base) ? Infinity : INV_LIMIT;
  if (base?.stack) {
    let left = inst.qty ?? 1, last = null, used = usedSlots(state);
    for (const ex of state.inventory) {
      if (left <= 0) break;
      if (ex.baseId !== inst.baseId || (ex.qty ?? 1) >= base.stack) continue;
      const add = Math.min(left, base.stack - (ex.qty ?? 1));
      ex.qty = (ex.qty ?? 1) + add; left -= add; last = ex;
    }
    // 남은 수량은 새 묶음으로
    while (left > 0 && used < cap) {
      const n = Math.min(left, base.stack);
      const it = last ? makeItem(inst.baseId, { qty: n }) : inst;
      it.qty = n; state.inventory.push(it); left -= n; last = it; used++;
    }
    if (last && !silent) bus.emit('itemPicked', { item: last, qty: inst.qty ?? 1 });
    return last;
  }
  if (usedSlots(state) >= cap) return null;
  state.inventory.push(inst);
  if (!silent) bus.emit('itemPicked', { item: inst, qty: inst.qty ?? 1 });
  return inst;
}

// ── 보관함: 가방이 가득 차 받지 못한 전리품 (progress.lootQueue — 세이브에 그대로 남는다) ──
//  상자 내용물·보스 확정 드롭·스테이지 끝 자동 회수처럼 다시 얻을 수 없는 물건을 버리지 않고 모아 두었다가,
//  가방에 자리가 나면 deliverLoot 가 순서대로 넣는다 (world.update 가 1초마다, 마을에서도 부른다).
export const LOOT_QUEUE_MAX = 200;
export function lootQueue(state) {
  const pr = state?.progress;
  if (!pr) return [];
  if (!Array.isArray(pr.lootQueue)) pr.lootQueue = [];
  return pr.lootQueue;
}
/** 보관함에 넣기. 넘치면 가장 흔한(희귀도 낮고 고유·중요 물품이 아닌) 가장 오래된 것부터 밀어낸다 */
export function queueLoot(state, inst) {
  if (!inst || !state?.progress) return false;
  const q = lootQueue(state);
  q.push(inst);
  while (q.length > LOOT_QUEUE_MAX) {
    let k = -1;
    for (let i = 0; i < q.length; i++) {
      const b = ITEMS[q[i]?.baseId];
      if (!b || limitFree(b) || b.unique) continue;
      if (k < 0 || (q[i].rarity ?? 0) < (q[k].rarity ?? 0)) k = i;
    }
    q.splice(k < 0 ? 0 : k, 1);
  }
  return true;
}
/** 보관함 → 가방 (자리가 나는 만큼). 반환: 넣은 개수 */
export function deliverLoot(state) {
  const q = state?.progress?.lootQueue;
  if (!Array.isArray(q) || !q.length) return 0;
  let n = 0;
  for (let i = 0; i < q.length;) {
    if (!ITEMS[q[i]?.baseId]) { q.splice(i, 1); continue; }
    if (!canAdd(state, q[i])) { i++; continue; }
    addItem(state, q[i]);
    q.splice(i, 1); n++;
  }
  return n;
}

/** 보상 지급: addByBase + 가방이 가득 차 못 넣은 몫은 보관함으로 → { added, queued } (대사 give · 의뢰 보상) */
export function grantItem(state, baseId, qty = 1, opts = {}) {
  const b = ITEMS[baseId];
  if (!b || !state?.inventory) return { added: 0, queued: 0 };
  const before = countItem(state, baseId);
  addByBase(state, baseId, qty, opts);
  const added = countItem(state, baseId) - before, queued = Math.max(0, qty - added);
  if (queued > 0) {
    if (b.stack) queueLoot(state, makeItem(baseId, { ...opts, qty: queued }));
    else for (let k = 0; k < queued; k++) queueLoot(state, makeItem(baseId, opts));
  }
  return { added, queued };
}

/** 이 베이스의 물건을 들고 있는가: 가방(장착한 것도 가방에 있다) + 보관함(progress.lootQueue). 대사 give 의 once (docs/specs/ex_s23.md §3) */
export function ownsItem(state, baseId) {
  if (!baseId) return false;
  const has = (arr) => Array.isArray(arr) && arr.some((i) => i?.baseId === baseId);
  return has(state?.inventory) || has(state?.progress?.lootQueue);
}

export function addByBase(state, baseId, qty = 1, opts = {}, add = {}) {
  const inst = makeItem(baseId, opts);
  if (!inst) return null;
  if (ITEMS[baseId]?.stack) { inst.qty = qty; return addItem(state, inst, add); }
  let last = null;
  for (let i = 0; i < qty; i++) last = addItem(state, i === 0 ? inst : makeItem(baseId, opts), add) || last;
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
  if (w.rules?.noPotion && !u.warp) return { ok: false, msg: `${w.rules?.label ?? '오늘의 도전 규칙'}: 물약을 쓸 수 없다.` };   // [hook:plat] docs/specs/online.md §2.5
  const s = player.stats;
  const parts = [];
  if (u.warp) {
    // 시련 월드: 귀환하면 leaveTrial(성당 복귀·기록·저장)을 건너뛴다 → 주문서를 쓰지 않고 안내만 (requests_f TRIALS-ENGINE-VERIFY)
    if (w.trial || w.mode === 'trial') return { ok: false, msg: '시련의 결계가 귀환을 가로막는다 — 일시정지의 「시련 포기」로 돌아갈 수 있다', trial: true };
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
const WT_ORDER = { whip: 0, sword: 1, greatsword: 2, dagger: 3, gun: 4, staff: 5, spear: 6 };
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

/**
 * 잡동사니 일괄 판매 (예전 호출 sellJunk(state, maxRarity) 그대로: 강화한 장비는 남긴다).
 * 두 번째 인자로 처분 기준 객체를 줄 수도 있다 — disposeJunk 와 같은 기준 (qol_equip §4). 반환 { count, gold, items, mats }
 */
export function sellJunk(state, maxRarity = 1, opts = {}) {
  const crit = typeof maxRarity === 'object' && maxRarity ? maxRarity : { ...opts, maxRarity };
  return disposeJunk(state, crit, { mode: 'sell', buyback: !!opts.buyback || !!crit.buyback });
}

// ───────────────────────────── 처분 (qol_equip §4) ─────────────────────────────
/** 다시 얻을 수 없거나 이야기에 쓰이는 장비 (한 벌 신화 · 고유(보스 확정 드롭 — 보관함도 밀어내지 않는 것) · 퀘스트 · 유물).
 *  [verify] 고유를 넣은 까닭: 2026-09-26 전 세이브의 고유 장비는 인스턴스 희귀도가 0 일 수 있어, 「고유·한 벌」 예외를 끄면 처분 후보가 됐다 */
export function irreplaceable(b) { return !!(b && (b.set || b.unique || b.quest || b.relic || b.worldHeart || b.starShard || b.slot === 'key')); }
/**
 * 어떤 기준으로도 처분하지 않는 이유 (없으면 null): 장비가 아님 · 중요 물품 · 다시 얻을 수 없는 보상 · 잠김 · 장착 중
 * (보관함 progress.lootQueue 의 물건은 가방에 없으므로 애초에 후보가 아니다)
 */
export function neverDispose(state, it) {
  const b = ITEMS[it?.baseId];
  if (!b) return '알 수 없는 아이템';
  if (b.slot === 'key') return '중요 물품';
  if (!isEquipment(b)) return '장비가 아님';
  if (irreplaceable(b)) return '다시 얻을 수 없는 장비';
  if (it.locked) return '잠김';
  if (isEquipped(state, it.uid)) return '장착 중';
  return null;
}
/**
 * 처분 후보 목록 → [{ inst, gold }] (판매가 기준). crit:
 *  maxRarity 0..2 (영웅 이상은 받지 않는다) · keep: { enhanced, better, other, special } (true = 그런 장비는 남긴다, 기본 모두 true)
 *  better(inst) → 'self' | 'other' | null  (지금 영웅 / 다른 영웅에게 더 좋은가 — game/gear_score.js 가 만든다; 없으면 그 예외는 보지 않는다)
 */
export function disposeCandidates(state, crit = {}) {
  const maxR = Math.max(0, Math.min(2, crit.maxRarity | 0));
  const keep = { enhanced: true, better: true, other: true, special: true, ...(crit.keep || {}) };
  const out = [];
  for (const it of state?.inventory || []) {
    if (neverDispose(state, it)) continue;
    const b = ITEMS[it.baseId];
    if ((it.rarity ?? 0) > maxR) continue;
    if (keep.enhanced && (it.level ?? 0) > 0) continue;
    if (keep.special && (b.unique || b.mythic || b.effect)) continue;
    if ((keep.better || keep.other) && typeof crit.better === 'function') {
      let who = null;
      try { who = crit.better(it); } catch (e) { console.warn(e); who = 'self'; }   // 판정 실패 = 남긴다
      if (keep.better && who === 'self') continue;
      if (keep.other && who === 'other') continue;
    }
    out.push({ inst: it, gold: sellPrice(it) * (it.qty ?? 1) });
  }
  return out;
}
const STONE_OF_TIER = [1, 1, 2, 3, 4, 5, 6];
/** 분해하면 나오는 강화석 { baseId, qty } (단계 → 강화석 등급, 희귀도 + 1 개) */
export function salvageYield(inst) {
  const b = ITEMS[inst?.baseId];
  if (!b || !isEquipment(b)) return null;
  const st = STONE_OF_TIER[Math.max(0, Math.min(6, (b.tier ?? 1) - 1))];
  return { baseId: `m_stone_${st}`, qty: 1 + Math.max(0, Math.min(2, inst.rarity | 0)) };
}
/**
 * 처분 실행. how: { mode: 'sell'|'salvage', buyback: true(판 것을 되사기 목록에) , list: 미리 고른 후보(없으면 crit 로 고른다) }
 * 반환 { count, gold, mats: {baseId: qty}, items: [{ baseId, name, rarity, level, gold }] }
 */
export function disposeJunk(state, crit = {}, { mode = 'sell', buyback = false, list = null } = {}) {
  const res = { count: 0, gold: 0, mats: {}, items: [], mode };
  const cands = list ?? disposeCandidates(state, crit);
  for (const c of cands) {
    const it = c.inst ?? c;
    if (!findItem(state, it.uid) || neverDispose(state, it)) continue;   // 미리보기 뒤 바뀐 것 (잠금·장착)은 건너뛴다
    const name = itemName(it);
    if (mode === 'salvage') {
      const y = salvageYield(it);
      removeItem(state, it.uid, it.qty ?? 1);
      if (y) { addByBase(state, y.baseId, y.qty, {}, { silent: true }); res.mats[y.baseId] = (res.mats[y.baseId] ?? 0) + y.qty; }
      res.items.push({ baseId: it.baseId, name, rarity: it.rarity ?? 0, level: it.level ?? 0, gold: 0, mats: y });
    } else {
      const g = sellItem(state, it.uid, it.qty ?? 1);
      if (!g) continue;
      res.gold += g;
      if (buyback) pushBuyback(state, it, g);
      res.items.push({ baseId: it.baseId, name, rarity: it.rarity ?? 0, level: it.level ?? 0, gold: g });
    }
    res.count++;
  }
  return res;
}

// ── 되사기 (state.buyback: 최근 처분 30개, 판 값 그대로 · 스테이지를 3번 마치면 사라진다) ──
export const BUYBACK_MAX = 30, BUYBACK_STAGES = 3;
/** 되사기 목록 (옛 세이브는 없다 → 빈 배열; 알 수 없는 항목은 버린다) */
export function buybackList(state) {
  if (!state) return [];
  if (!Array.isArray(state.buyback)) state.buyback = [];
  state.buyback = state.buyback.filter((e) => e && typeof e === 'object' && e.item && ITEMS[e.item.baseId] && Number.isFinite(e.price));
  return state.buyback;
}
export function pushBuyback(state, inst, price) {
  const list = buybackList(state);
  const item = JSON.parse(JSON.stringify(inst));
  delete item.locked;
  list.unshift({ item, price: Math.max(0, Math.round(price)), left: BUYBACK_STAGES, t: Date.now() });
  while (list.length > BUYBACK_MAX) list.pop();
}
/** 스테이지를 마칠 때마다 (results.js) — 3번 지나면 사라진다. 반환: 사라진 수 */
export function buybackTick(state) {
  const list = buybackList(state);
  let gone = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].left = (Number.isFinite(list[i].left) ? list[i].left : BUYBACK_STAGES) - 1;
    if (list[i].left <= 0) { list.splice(i, 1); gone++; }
  }
  return gone;
}
/** 되사기 → {ok, msg, item} */
export function buyBack(state, index) {
  const list = buybackList(state);
  const e = list[index];
  if (!e) return { ok: false, msg: '되살 물건이 없다.' };
  if ((state.gold ?? 0) < e.price) return { ok: false, msg: '골드가 부족하다.' };
  if (!canAdd(state, e.item)) return { ok: false, msg: '가방이 가득 찼다.' };
  const item = addItem(state, { ...e.item, t: undefined }, { silent: true });
  if (!item) return { ok: false, msg: '가방이 가득 찼다.' };
  state.gold -= e.price;
  list.splice(index, 1);
  bus.emit('itemBought', { baseId: item.baseId, qty: 1, gold: e.price, item, buyback: true });
  return { ok: true, msg: `${itemName(item)} 되사기 (-${e.price.toLocaleString('ko-KR')}G)`, item };
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
