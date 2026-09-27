// 채색 등록 모듈 — 패키지 ART-BOSS-5 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
export const bosses = {
  b_dracula: () => import('../bosses/b_dracula.js'),   // 드라큘라 백작 (s12) — 1형태 귀족 · 변신 · 2형태 날개 달린 마왕, 채색 박쥐·낙석 그림 포함
  b_chaos: () => import('../bosses/b_chaos.js'),       // 혼돈의 군주 (s13) — 떠다니는 눈(판정 부위)·그림자 보스 5종·바닥 촉수 그림 포함
};
export const enemies = [];
export const companions = {};
export const npcs = {};
