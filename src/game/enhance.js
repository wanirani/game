// [임시] 강화 — 아이템 담당이 구현. 공개 API:
//  enhanceInfo(state, inst) → { rate(0~100), gold, stones:{baseId, qty}, onFail:'keep'|'down'|'destroy', destroyChance, maxed }
//  doEnhance(state, uid, { protect, bless }) → { success, destroyed, before, after, rate }
export const MAX_ENHANCE = 15;
export function enhanceInfo(state, inst) { return { rate: 100, gold: 100, stones: null, onFail: 'keep', destroyChance: 0, maxed: (inst.level ?? 0) >= MAX_ENHANCE }; }
export function doEnhance(state, uid) { return { success: false, destroyed: false, before: 0, after: 0, rate: 0 }; }
