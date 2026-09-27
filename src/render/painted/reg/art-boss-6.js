// 채색 등록 모듈 — 패키지 ART-BOSS-6 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js / enemies/index.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies:    [{ mod: <import * as x from '../enemies/<id>.js'>, ids?: ['<render id>', ...] }]  (적 렌더러 모듈, 에셋은 지연 로딩)
// companions: { '<companionId>': () => import('../companions/<id>.js') }
// npcs:       { '<npcId>': () => import('../npcs/<id>.js') }
// 모음(reg/index.js)에 이 파일의 줄이 아직 없으면 보스 로직(c_narkissa · c_moloch · c_dagon)의 setup() 이 이 표로 한 번 등록한다
// (registerPainted — 이미 등록돼 있으면 아무것도 하지 않는다). 모음에 줄이 생기면 방 진입 미리 굽기까지 자동으로 된다.
export const bosses = {
  b_narkissa: () => import('../bosses/b_narkissa.js'),   // 나르키사 (s14) — 유리 거인 여제: 가면/눈 가득한 얼굴·거울 조각 드레스·거미 다리·칼날 팔, 분신·벽거울·낙하 거울 그림 포함
  b_moloch: () => import('../bosses/b_moloch.js'),       // 몰록 (s15) — 청동 황소 우상: 화로 창살·영혼 얼굴·망치/집게·굴뚝·사슬, 뿔 부러짐·용암 잠김
  b_dagon: () => import('../bosses/b_dagon.js'),         // 다곤 (s16) — 아귀 머리 사제왕: 경첩 턱·왕관 미끼·산호 목장·뱀장어 촉수·파이프 오르간·순례자
};
export const enemies = [];
export const companions = {};
export const npcs = {};
