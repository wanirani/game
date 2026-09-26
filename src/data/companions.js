// STUB (W0 SKEL) — owner: CMP-DATA
// 동료(탈것 9 · 수호신 11) 순수 데이터 (companions §12.1; id 와 이름은 MASTER_PLAN §1.2 의 mt_/gd_ 체계).
// 계약 export: CMP_MAX_LV, BOND_RANKS, BOND_NAMES, MOUNTS, GUARDIANS, MOUNT_IDS, GUARDIAN_IDS, COMPANION_ORDER,
//  companionDef(id), cexpToNext(lv), guardianShare(lv), trampleRatio(lv), cdMul(lv), STABLE_SHOP, TRIBUTE,
//  COMPANION_QUESTS, STABLE_LINES, DISMOUNT_NOTE
// 스텁: 동료가 하나도 없다 (companionDef 는 null). 공식이 명세에 고정된 상수만 채워 둔다.
export const CMP_MAX_LV = 30;
export const BOND_RANKS = [0, 15, 40, 80, 130, 200];
export const BOND_NAMES = ['', '신뢰', '교감', '공명', '각성', '영혼 결속'];
export const MOUNTS = {};
export const GUARDIANS = {};
export const MOUNT_IDS = [];
export const GUARDIAN_IDS = [];
export const COMPANION_ORDER = [];
export const STABLE_SHOP = [];
export const TRIBUTE = {};
export const COMPANION_QUESTS = { cq_hati: 'gd_spiritwolf', cq_skoll: 'mt_direwolf' };
export const STABLE_LINES = {};
export const DISMOUNT_NOTE = '';

export function companionDef(id) { return null; }
export function cexpToNext(lv) { return Math.floor(40 * Math.pow(lv, 1.6) + 40 * lv); }
export function guardianShare(lv) { return 0; }
export function trampleRatio(lv) { return 0; }
export function cdMul(lv) { return 1; }
