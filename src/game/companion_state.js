// STUB (W0 SKEL) — owner: CMP-DATA
// 동료 세이브 상태 도우미 (companions §12.2; node 에서 import 가능, data 와 core/events.js 만 import).
// 스텁: 세이브를 건드리지 않고 "동료 없음" 을 돌려준다 → computeStats/state/menu 는 오늘과 같다.
export function ensureCompanionState(state) { return state?.companions ?? null; }
export function migrateCompanions(state) {}
export function heroLoadout(state, hero) { return { mount: null, guards: [] }; }
export function isOwned(state, id) { return false; }
export function ownedIds(state, kind) { return []; }
export function ownedEntry(state, id) { return null; }
export function unlockCompanion(state, id, opts = {}) { return null; }
export function startLevelFor(state) { return 1; }
export function addCompanionExp(state, id, n) { return 0; }
export function addBond(state, id, pts) { return 0; }
export function bondRankOf(state, id) { return 0; }
export function guardianSlots(state) { return 1; }
export function equipMount(state, hero, id) { return { ok: false, msg: '' }; }
export function equipGuardian(state, hero, slot, id) { return { ok: false, msg: '' }; }
export function companionAuraStats(state, hero) { return {}; }
export function mountRideStats(state, id) { return {}; }
export function mountDerived(state, id, playerStats) { return null; }
export function guardianDerived(state, id, playerStats) { return null; }
export function evaluateUnlocks(state) { return []; }
export function obtainEgg(state, id) { return false; }
export function eggStatus(state) { return []; }
export function hatchEgg(state, id) { return null; }
export function tributeCost(state, id) { return 0; }
export function giveTribute(state, id) { return { ok: false, msg: '' }; }
export function buyCompanion(state, id) { return { ok: false, msg: '' }; }
export function applyCompanionDebug(state, params) {}
