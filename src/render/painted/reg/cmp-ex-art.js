// 채색 등록 모듈 — 8단계 portrait2 (외전 동료 넷의 채색 퍼핏) 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
// 아르겐(비룡) = src/render/mounts_b.js drawB · 모르겐(말) = src/render/mounts.js paintedQuad · 무닌·베스퍼 = render/guardians.js drawGuardian
// (준비 전·실패·?painted=0 이면 각자의 벡터 그림). 원본·자르기: tools/painted/companions/<id>/ (Higgsfield, tools/higgsfield/manifest_portrait2.json)
export const bosses = {};
export const enemies = [];
export const companions = {
  mt_argen: () => import('../companions/mt_argen.js'),
  mt_morgen: () => import('../companions/mt_morgen.js'),
  gd_munin: () => import('../companions/gd_munin.js'),
  gd_vesper: () => import('../companions/gd_vesper.js'),
};
export const npcs = {};
