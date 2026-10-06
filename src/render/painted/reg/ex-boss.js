// 채색 등록 모듈 — 패키지 EX-BOSS · EX2-BOSS · EX3-BOSS · EX4-BOSS · EX5-BOSS 전용 (R15). 이 파일만 고쳐서 등록한다. registry.js 는 고치지 않는다.
// bosses:     { '<bossId>': () => import('../bosses/<bossId>.js') }        (지연 로딩)
// enemies · companions · npcs: 이 패키지에는 없음
// 모음(reg/index.js)에 이 파일의 줄이 아직 없으면 보스 로직(e_argen)의 setup() 이 이 표로 한 번 등록한다
// (registerPainted — 이미 등록돼 있으면 아무것도 하지 않는다). 모음에 줄이 생기면 방 진입 미리 굽기까지 자동으로 된다.
export const bosses = {
  b_argen: () => import('../bosses/b_argen.js'),   // 아르겐 (s21 외전) — 날개 없는 은룡 몸통·벌린 입 머리+턱·목/꼬리 띠(사슬 따라 구부림)·날개 한 장(먼 쪽 deep)·다리·공허 결정 4·핵 보석·정화 틴트 'pure'
  b_nemain: () => import('../bosses/b_nemain.js'),   // 네메인 (s22 외전) — 망토 없는 옆모습 몸통·다리·가면/맨얼굴 머리·팔·부리 단검·펼친 망토(날개 한 장 + 진홍 뒤판 3띠)·까마귀 2프레임·가면 파편
  b_hagen: () => import('../bosses/b_hagen.js'),   // 하겐 (s23 외전) — 사람(모자 머리·외투 몸통·앞자락·뒷자락 2띠 사슬·장화·팔·장총·칼·뿔피리) · 네 발 늑대(몸통·머리 닫힘/벌림·앞/뒷다리 두 마디·꼬리 두 토막) · 외투 조각·털 뭉치 강체
  b_bride: () => import('../bosses/b_bride.js'),   // 엘제베트 (s24 외전) — 귀부인(장미 관 머리·코르셋 몸통·치마 앞판·끌자락·긴 베일·창백한 팔) · 노파(해골 같은 금 간 얼굴 두건 머리·앞 베일·흩날리는 베일·굽은 몸통·넝마 자락 셋·앙상한 팔) · 성배·파편 셋·장미·덩굴 마디(채찍)·꽃잎·베일 조각
  b_charon: () => import('../bosses/b_charon.js'),   // 카론 (s25 외전) — 영구 마차(상자 몸통·마부석 앞판·끌채·살바퀴 한 장 ×4·걸이 등불·지붕 관) · 마부(모자 머리·겹망토 몸통·앞자락·뒷자락·소매 위/아래+뼈 손·바지 허벅지·승마 장화) · 은화·채찍 손잡이·명부·파편 둘 — 말 둘은 로직의 벡터 탈것 리그
};
export const enemies = [];
export const companions = {};
export const npcs = {};
