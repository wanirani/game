// 채색 등록 모듈 — 패키지 ART-BOSS-8 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / reg/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (이 패키지에는 없음)
// companions: { '<companionId>': () => import('../companions/<id>.js') } · npcs: { '<npcId>': () => import('../npcs/<id>.js') }
// 모음(reg/index.js)에 이 파일의 줄이 아직 없으면 보스 로직(d_nihil)의 setup() 이 이 표로 한 번 등록한다
// (registerPainted — 이미 등록돼 있으면 아무것도 하지 않는다). 모음에 줄이 생기면 방 진입 미리 굽기까지 자동으로 된다.
export const bosses = {
  b_nihil: () => import('../bosses/b_nihil.js'),   // 니힐 (s20, 2부 최종) — 별밤 두건 수의·도자기 가면(얼굴 7장 번짐·웃음·반쪽·조각)·거대한 두 손(마디 14·손바닥 눈)·메아리 4·아가리(이빨 띠·강착원반)·검은 태양(코로나 2겹·세로 눈)
};
export const enemies = [];
export const companions = {};
export const npcs = {};
