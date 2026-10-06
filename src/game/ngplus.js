// 회차 플레이 「피의 윤회」 (NEW GAME+) — 규칙·세이브·세기 (docs/specs/ngplus.md §8)
// 순수 모듈: DOM 없음, node 에서 import 가능. 뼈대 — 모든 export 가 중립 동작 (NG-CORE 가 채운다)

// §3.2 세기 표 — 규칙 숫자의 원본은 이것 하나
export const NG_RULES = {
  cap: 3,                                         // 세기는 4회차(n = 3)에서 멈춘다
  comp: { hp: 2.5, atk: 1.0, ref: 46 },           // 1부 초반 보정 comp(L, A) = 1 + A × max(0, ref − L) / 45
  limits: { enemyHp: 4.0, enemyAtk: 3.0, bossHp: 3.6, aggro: 1.8, elite: 0.35, level: 99 },
  cycles: {
    1: { base: 70, k: 0.32, hp: 1.10, atk: 1.10, bossHp: 1.10, aggro: 1.0, elite: 0.03, drop: 1.1 },
    2: { base: 78, k: 0.30, hp: 1.35, atk: 1.35, bossHp: 1.30, aggro: 1.1, elite: 0.06, drop: 1.2 },
    3: { base: 82, k: 0.26, hp: 1.60, atk: 1.65, bossHp: 1.50, aggro: 1.2, elite: 0.09, drop: 1.3 },
  },
};

// §5.1 저장 상한
export const NG_LIMITS = { nMax: 9, histMax: 10, pastBytes: 24 * 1024 };

/** 지난 회차 수 (0..9). 아케이드·없음·손상 → 0 */
export function ngOf(state) { return 0; }

/** 회차 표기 — n ≥ 1 이면 `${n + 1}회차`, 아니면 '' */
export function ngLabel(n) { return Number.isInteger(n) && n >= 1 ? `${Math.min(NG_LIMITS.nMax, n) + 1}회차` : ''; }

/** §1 여는 조건 */
export function canStartNg(state) { return false; }

/** §2.2 회차 넘기기 — 원본을 바꾸지 않는다 (깊은 사본) */
export function startNgPlus(state, { slot, now = Date.now() } = {}) { return JSON.parse(JSON.stringify(state)); }

/** §5.2 이관 — ng 가 없으면 아무것도 하지 않는다 */
export function normalizeNg(state) {}

/** §3.1 회차 적 레벨 E (n = 0 이면 stage.level) */
export function ngStageLevel(stage, n) { return stage?.level ?? 1; }

/** §3.1 스토리 스테이지 월드 세기 → { stage, diff, bossPatterns } | null (n = 0 이면 null) */
export function ngWorld(stage, diff, n) { return null; }

/** §4.3 회차의 마을 — 회차가 있으면 max(chapter, 20) */
export function serviceChapter(state) { return state?.progress?.chapter || 0; }

/** §6 지난 회차 가상 세이브 | null */
export function pastState(state) { return null; }

/** ?ng=N 디버그 (시험용) */
export function applyNgDebug(state, params) {}
