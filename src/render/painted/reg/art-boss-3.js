// 채색 등록 모듈 — 패키지 ART-BOSS-3 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
export const bosses = {
  b_chimera: () => import('../bosses/b_chimera.js'),     // 키메라 호문쿨루스 (s07)
  b_leviathan: () => import('../bosses/b_leviathan.js'), // 레비아탄 (s08)
  b_colossus: () => import('../bosses/b_colossus.js'),   // 태엽 거신 (s09)
};
export const enemies = [];
export const companions = {};
export const npcs = {};
