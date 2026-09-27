// 채색 등록 모듈 — 패키지 ART-ENEMY-2 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
//
// ART-ENEMY-2 (s04–s06, 15종). 벡터 렌더러(enemies_a.js)는 그대로 남아 에셋이 없거나 로딩 중일 때 대신 그린다.
import * as blood_skeleton from '../enemies/blood_skeleton.js';

export const bosses = {};
export const enemies = [
  { mod: blood_skeleton },
];
export const companions = {};
export const npcs = {};
