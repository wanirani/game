// 장비 강화 (대장장이 하드윈) — +1 ~ +15
//  enhanceInfo(state, inst, {protect, bless}) → { level, next, rate, baseRate, diffBonus, pity, bless, gold, stones:{baseId, qty, have, name},
//     onFail:'keep'|'down'|'destroy', baseFail, destroyChance, maxed, canAfford, reason, equippedBy(장착 중인 영웅 charId|null) }
//  doEnhance(state, uid, {protect, bless}) → { ok, success, destroyed, protected, before, after, rate, msg, sfx, item, replaced? }
//   (장착 중인 무기가 파괴되면 가방의 다른 무기 또는 시작 무기를 자동으로 장착 → replaced = 새 무기 인스턴스)
// 규칙: 목표 단계별 성공률 100·95·90·85·75·65·55·45·35·30·25·20·15·10·6 (%)
//  + 난이도 enhanceBonus(%p) + 축복 주문서 10%p + 실패 누적 보정(실패 1회당 +2%p, 최대 +10%p, 성공 시 초기화)
//  실패 시: 목표 +4 이하 유지 / +5~+9 한 단계 하락 / +10 이상 한 단계 하락 + 20% 확률로 파괴. 보호 주문서는 하락·파괴를 막는다.
//  강화석: +1~3 하급, +4~6 중급, +7~9 상급, +10~12 최상급, +13~14 영웅, +15 전설
import { ITEMS, STAT_LABELS, isEquipment, itemName, josa } from '../data/items.js';
import { getDiff } from '../data/difficulty.js';
import { bus } from '../core/events.js';
import { findItem, countItem, consumeByBase, removeItem, isEquipped, ensureWeapon } from './inventory.js';

export const MAX_ENHANCE = 15;
export const ENHANCE_RATES = [100, 95, 90, 85, 75, 65, 55, 45, 35, 30, 25, 20, 15, 10, 6];
export const DESTROY_CHANCE = 20;
export const BLESS_BONUS = 10;
export const PITY_STEP = 2;
export const PITY_MAX = 10;
const STONE_START = [1, 4, 7, 10, 13, 15];

/** 목표 단계 n 에 필요한 강화석 등급(1~6) */
export function stoneTierFor(n) { return n <= 3 ? 1 : n <= 6 ? 2 : n <= 9 ? 3 : n <= 12 ? 4 : n <= 14 ? 5 : 6; }
/** 실패 시 기본 처리 */
export function failModeFor(n) { return n <= 4 ? 'keep' : n <= 9 ? 'down' : 'destroy'; }

export function enhanceCost(inst, n) {
  const b = ITEMS[inst.baseId];
  const tier = b?.tier ?? 1, r = inst.rarity | 0;
  const st = stoneTierFor(n);
  const qty = n - STONE_START[st - 1] + 1 + (r >= 4 ? 1 : 0) + (b?.unique ? 1 : 0);
  const gold = Math.round(((40 + 30 * tier) * Math.pow(1.26, n - 1) * (1 + r * 0.15)) / 10) * 10;
  return { gold, stones: { baseId: `m_stone_${st}`, qty } };
}

export function enhanceInfo(state, inst, { protect = false, bless = false } = {}) {
  const none = { level: inst?.level ?? 0, next: inst?.level ?? 0, rate: 0, baseRate: 0, diffBonus: 0, pity: 0, bless: 0, gold: 0, stones: null, onFail: 'keep', baseFail: 'keep', destroyChance: 0, canAfford: false };
  if (!inst || !isEquipment(inst)) return { ...none, maxed: true, invalid: true, reason: '강화할 수 없는 아이템입니다.' };
  const L = inst.level | 0;
  if (L >= MAX_ENHANCE) return { ...none, maxed: true, reason: '이미 최고 단계(+15)에 도달했습니다.' };
  const n = L + 1;
  const baseRate = ENHANCE_RATES[n - 1];
  const diffBonus = getDiff(state?.difficulty).enhanceBonus ?? 0;
  const pity = Math.min(PITY_MAX, (inst.failStack | 0) * PITY_STEP);
  const baseFail = failModeFor(n);
  const useProtect = !!protect && baseFail !== 'keep';
  const bl = bless ? BLESS_BONUS : 0;
  const rate = Math.max(1, Math.min(100, baseRate + diffBonus + pity + bl));
  const onFail = useProtect ? 'keep' : baseFail;
  const cost = enhanceCost(inst, n);
  const have = state ? countItem(state, cost.stones.baseId) : 0;
  const protectHave = state ? countItem(state, 'm_scroll_protect') : 0;
  const blessHave = state ? countItem(state, 'm_scroll_bless') : 0;
  let reason = null;
  if ((state?.gold ?? 0) < cost.gold) reason = `골드가 부족합니다. (${cost.gold.toLocaleString('ko-KR')}G 필요)`;
  else if (have < cost.stones.qty) reason = `${josa(ITEMS[cost.stones.baseId].name, '이/가')} 부족합니다. (${have}/${cost.stones.qty})`;
  else if (useProtect && protectHave < 1) reason = '보호 주문서가 없습니다.';
  else if (bless && blessHave < 1) reason = '축복 주문서가 없습니다.';
  return {
    level: L, next: n, rate, baseRate, diffBonus, pity, bless: bl,
    gold: cost.gold, stones: { ...cost.stones, have, name: ITEMS[cost.stones.baseId].name },
    onFail, baseFail, destroyChance: onFail === 'destroy' ? DESTROY_CHANCE : 0,
    protect: useProtect, protectHave, blessHave, maxed: false, canAfford: !reason, reason,
    equippedBy: state ? isEquipped(state, inst.uid) : null,
  };
}

/** 강화 시도: 비용을 치르고 성공/실패/파괴를 판정한다 */
export function doEnhance(state, uid, { protect = false, bless = false } = {}) {
  const inst = findItem(state, uid);
  if (!inst) return { ok: false, msg: '아이템을 찾을 수 없습니다.' };
  const info = enhanceInfo(state, inst, { protect, bless });
  if (info.maxed || info.invalid) return { ok: false, msg: info.reason, info };
  if (!info.canAfford) return { ok: false, msg: info.reason, info };
  // 비용 지불
  state.gold -= info.gold;
  consumeByBase(state, info.stones.baseId, info.stones.qty);
  if (info.protect) consumeByBase(state, 'm_scroll_protect', 1);
  if (bless) consumeByBase(state, 'm_scroll_bless', 1);
  state.stats ??= {};
  const before = inst.level | 0;
  const success = Math.random() * 100 < info.rate;
  let destroyed = false, prot = false, replaced = null, msg, sfx;
  if (success) {
    inst.level = before + 1;
    inst.failStack = 0;
    state.stats.enhanceOk = (state.stats.enhanceOk ?? 0) + 1;
    state.stats.maxEnhance = Math.max(state.stats.maxEnhance ?? 0, inst.level);
    msg = inst.level >= 15 ? `극한 강화 달성! ${itemName(inst)}` : inst.level === 10 ? `+10 돌파! ${itemName(inst)}` : `강화 성공! ${itemName(inst)}`;
    sfx = 'enhance_success';
  } else {
    inst.failStack = (inst.failStack | 0) + 1;
    state.stats.enhanceFail = (state.stats.enhanceFail ?? 0) + 1;
    sfx = 'enhance_fail';
    if (info.onFail === 'keep') {
      prot = info.protect;
      msg = prot ? '강화 실패… 보호 주문서가 장비를 지켜 냈습니다.' : '강화 실패… 다행히 단계는 유지되었습니다.';
    } else if (info.onFail === 'destroy' && Math.random() * 100 < info.destroyChance) {
      destroyed = true;
      msg = `${josa(itemName(inst), '이/가')} 강화의 불길을 견디지 못하고 산산조각 났습니다…`;
      sfx = 'enhance_destroy';
      state.stats.enhanceDestroy = (state.stats.enhanceDestroy ?? 0) + 1;
      // 장착 중이던 무기라면 무기 칸이 비지 않도록 예비 무기를 끼운다
      const wearers = ITEMS[inst.baseId]?.slot === 'weapon' ? Object.values(state.heroes || {}).filter((h) => h.equip?.weapon === uid) : [];
      removeItem(state, uid, 1);
      for (const h of wearers) {
        const w = ensureWeapon(state, h);
        if (w) { replaced = w; msg += ` 예비 무기로 ${josa(itemName(w), '을/를')} 장착했습니다.`; }
      }
    } else {
      inst.level = Math.max(0, before - 1);
      msg = `강화 실패… +${before} → +${inst.level} 단계가 하락했습니다.`;
    }
  }
  bus.emit('enhance', { item: inst, success, destroyed, level: inst.level, before });
  return { ok: true, success, destroyed, protected: prot, before, after: destroyed ? -1 : inst.level, rate: info.rate, msg, sfx, item: inst, replaced, info };
}

/** 다음 단계 능력치 미리보기용: 현재/다음 단계 itemStats 차이를 계산하는 도우미 */
export function enhancePreview(inst, itemStatsFn) {
  if (!inst || (inst.level | 0) >= MAX_ENHANCE) return [];
  const cur = itemStatsFn(inst, { noAffix: true });
  const nxt = itemStatsFn({ ...inst, level: (inst.level | 0) + 1 }, { noAffix: true });
  const out = [];
  for (const k in nxt) {
    const d = Math.round(((nxt[k] ?? 0) - (cur[k] ?? 0)) * 10) / 10;
    if (d) out.push({ stat: k, name: STAT_LABELS[k]?.[0] ?? k, from: cur[k] ?? 0, to: nxt[k], diff: d });
  }
  return out;
}
