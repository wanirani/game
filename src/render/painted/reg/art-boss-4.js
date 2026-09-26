// 채색 등록 모듈 — 패키지 ART-BOSS-4 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
export const bosses = {
  b_frostqueen: () => import('../bosses/b_frostqueen.js'),   // 서리 여왕 이자벨라 (s10) — 거울 분신·위험 지대 그림 포함
};
export const enemies = [];
export const companions = {};
export const npcs = {};
