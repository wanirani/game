// 채색 등록 모듈 — 패키지 CMP-GUARD-ART-B 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
export const bosses = {};
export const enemies = [];
// 수호신 채색 퍼핏 (kind 'companion'): render/guardians.js drawGuardian 이 레지스트리로 그린다 (준비 전·실패·?painted=0 이면 guardians_b.js 절차 그림)
export const companions = {
  gd_clock: () => import('../companions/gd_clock.js'),
  gd_reaper: () => import('../companions/gd_reaper.js'),
};
export const npcs = {};
