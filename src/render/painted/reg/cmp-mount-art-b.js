// 채색 등록 모듈 — 패키지 CMP-MOUNT-ART-B 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
export const bosses = {};
export const enemies = [];
// 탈것 그리기는 src/render/mounts_b.js (MOUNT_DRAW_B → 채색 리그가 준비되면 퍼핏, 아니면 벡터).
export const companions = {
  mt_direwolf: () => import('../companions/mt_direwolf.js'),
  mt_wyvern: () => import('../companions/mt_wyvern.js'),
  mt_giantbat: () => import('../companions/mt_giantbat.js'),
  mt_gale: () => import('../companions/mt_gale.js'),
};
export const npcs = {};
