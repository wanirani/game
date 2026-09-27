// 채색 등록 모듈 — 패키지 ART-BOSS-7 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
// 모음(reg/index.js)에 이 파일의 줄이 아직 없으면 보스 로직(c_ziz · d_mara · d_behemoth)의 setup() 이 이 표로 한 번 등록한다
// (registerPainted — 이미 등록돼 있으면 아무것도 하지 않는다). 모음에 줄이 생기면 방 진입 미리 굽기까지 자동으로 된다.
export const bosses = {
  b_ziz: () => import('../bosses/b_ziz.js'),             // 지즈 (s17) — 폭풍 거신조: 해골 부리·3조각 날개·날개 눈 12·뜯긴 가슴 갈비/구전 코어·폭풍구름
  b_mara: () => import('../bosses/b_mara.js'),           // 마라 (s18) — 요람의 노파: 도자기 가면·실 머리·4팔·요람, 꿈 형태(8다리 짐승+아기 머리)
  b_behemoth: () => import('../bosses/b_behemoth.js'),   // 베헤모스 (s19) — 썩은 숲 짐승: 해골 머리·등의 숲·포자 주머니·무릎 상처·버섯 여왕
};
export const enemies = [];
export const companions = {};
export const npcs = {};
