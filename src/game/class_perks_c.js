// 직업 특성 내용 C — 리아·아젤 (PERKS-C) (docs/specs/classes_t3.md §3.1). 지금은 빈 표 (HOOKS 스텁) — 2차 물결의 담당이 같은 export 이름으로 채운다.
//  PERKS_C   { '<CLASSES id | ASCENSIONS id | char:<영웅>>': { only?, N?, <훅>… } }   (§3.2, 훅 이름은 class_perks.js HOOK_NAMES)
//  ACTIVES_C { 'asc_<영웅>_<낱말>': (p, w, lv) => true|false }                          (비전 액티브, skills.js castSkill 대체 경로)
//  MARKS_C   { '<표식 키>': (ctx, e, n, k, t) => {…} }                                 (PerkLayer 가 그린다; k = 남은 시간 비율)
// 규칙 (§3.5 · §3.6): ./class_perks.js 와 데이터 모듈만 import 한다 (skills.js · player.js · world.js 금지).
// 모듈 최상단에서 가져온 바인딩(K·도우미)을 읽지 않는다 — 훅 본문 안에서만. 최상단에서 bus·game·document 를 건드리지 않는다.
export const PERKS_C = {};
export const ACTIVES_C = {};
export const MARKS_C = {};
