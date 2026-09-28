// 채색 등록 모듈 — 패키지 CMP-MOUNT-ART-A 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
// 탈것 그리기는 src/render/mounts.js (drawMount → 채색 리그가 준비되면 paintedQuad, 아니면 벡터).
export const bosses = {};
export const enemies = [];
export const companions = {
  mt_warhorse: () => import('../companions/mt_warhorse.js'),
  mt_boar: () => import('../companions/mt_boar.js'),
  mt_skelsteed: () => import('../companions/mt_skelsteed.js'),
  mt_ignis: () => import('../companions/mt_ignis.js'),
};
export const npcs = {};
