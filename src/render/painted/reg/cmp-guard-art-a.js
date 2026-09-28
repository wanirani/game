// 채색 등록 모듈 — 패키지 CMP-GUARD-ART-A 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
// 수호신 채색 퍼핏 (kind 'companion'): render/guardians.js drawGuardian 이 레지스트리로 그린다 (준비 전·실패·?painted=0 이면 절차 그림)
export const bosses = {};
export const enemies = [];
export const companions = {
  gd_fairy: () => import('../companions/gd_fairy.js'),
  gd_spiritwolf: () => import('../companions/gd_spiritwolf.js'),
  gd_imp: () => import('../companions/gd_imp.js'),
};
export const npcs = {};
