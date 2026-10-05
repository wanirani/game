// 채색 등록 모듈 — 패키지 EX-BOSS · EX2-BOSS 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies · companions · npcs: 이 패키지에는 없음
// 모음(reg/index.js)에 이 파일의 줄이 아직 없으면 보스 로직(e_argen)의 setup() 이 이 표로 한 번 등록한다
// (registerPainted — 이미 등록돼 있으면 아무것도 하지 않는다). 모음에 줄이 생기면 방 진입 미리 굽기까지 자동으로 된다.
export const bosses = {
  b_argen: () => import('../bosses/b_argen.js'),   // 아르겐 (s21 외전) — 날개 없는 은룡 몸통·벌린 입 머리+턱·목/꼬리 띠(사슬 따라 구부림)·날개 한 장(먼 쪽 deep)·다리·공허 결정 4·핵 보석·정화 틴트 'pure'
  b_nemain: () => import('../bosses/b_nemain.js'),   // 네메인 (s22 외전) — 망토 없는 옆모습 몸통·다리·가면/맨얼굴 머리·팔·부리 단검·펼친 망토(날개 한 장 + 진홍 뒤판 3띠)·까마귀 2프레임·가면 파편
};
export const enemies = [];
export const companions = {};
export const npcs = {};
