// 채색 등록 모듈 — 패키지 EX-BOSS 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies · companions · npcs: 이 패키지에는 없음
// 모음(reg/index.js)에 이 파일의 줄이 아직 없으면 보스 로직(e_argen)의 setup() 이 이 표로 한 번 등록한다
// (registerPainted — 이미 등록돼 있으면 아무것도 하지 않는다). 모음에 줄이 생기면 방 진입 미리 굽기까지 자동으로 된다.
export const bosses = {};
export const enemies = [];
export const companions = {};
export const npcs = {};
