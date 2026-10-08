// 마을 허브 「에슈빌」 — 스테이지 사이에 돌아오는 밤의 마을.
// TOWN_STAGE 는 World 엔진이 그대로 읽는 스테이지 객체(테마 'town', 적 없음).
// BUILDINGS 는 허브 장면이 중경(mid) 레이어에 절차적으로 그리는 건물 파사드 정의 — 문('D') 위치와 정확히 맞물린다.
// TOWN_NPCS 는 마을 NPC 의 배회 범위와 기본 외형(스토리 담당의 NPCS 데이터가 없을 때 대체용).

// 10행 × 96열. 8행 = 바닥 바로 위(마커 줄), 9행 = 흙길('%' → tex2 흙 텍스처). 방 높이(480)가 화면(540)보다 낮아
// 카메라는 바닥에 맞춰 세로 고정 — 위쪽 빈 하늘은 원경(Kling 그림)과 건물 지붕·첨탑이 채운다.
// 동쪽으로 84 → 96열 확장 (companions §2.2): x 4032 서쪽은 그대로, 동쪽 성문 밖에 「영혼의 마구간」(x 4100–4580)과 그레타.
//  문 순서(왼→오): 여관 · 잡화점 · 의뢰 게시판 · 대장간 · 성당 · 동쪽 성문(월드맵) · 영혼의 마구간
//  NPC 순서(왼→오): 카밀라(여관 왼쪽 구석 — npcs.js appear: 6장 신뢰 또는 외전 「시드는 장미」 뒤) · 마르타 · 로크 · 하드윈 · 알베르토 신부 · 엘리제 · 그레타
const W = 96;
const row = (marks = {}) => { const a = Array(W).fill(' '); for (const k in marks) a[+k] = marks[k]; return a.join(''); };
const range = (a, b, ch) => { const o = {}; for (let i = a; i <= b; i++) o[i] = ch; return o; };

export const TOWN_W = W;
export const TOWN_FLOOR_ROW = 9;

const MAP = [
  row(), row(), row(), row(), row(), row(),
  row({ ...range(9, 12, '='), ...range(39, 41, '=') }),   // 6: 여관 발코니 · 대장간 차양
  row(),
  row({ 4: 'N', 7: 'D', 10: 'N', 19: 'D', 22: 'N', 29: 'P', 32: 'D', 41: 'D', 46: 'N', 57: 'D', 61: 'N', 69: 'N', 78: 'D', 89: 'D', 93: 'N' }),
  '%'.repeat(W),
];

export const TOWN_STAGE = {
  id: 'town', chapter: 0, name: '에슈빌', sub: '밤의 마을', theme: 'town',
  bg: 'bg/hub', tex: 'tex/tex_wood', tex2: 'tex/tex_dirt', tileStyle: 'dirt',
  music: 'hub', level: 1, darkness: 0.25, darkColor: '#070512', liquid: 'water',
  boss: null, start: 'town', enemies: [], docs: [], relic: null, unlocks: [], next: null,
  intro: null, outro: null, parTime: 0,
  rooms: {
    town: {
      map: MAP,
      facing: 1,
      doors: ['scene:inn', 'scene:shop', 'scene:questboard', 'scene:smith', 'scene:church', 'scene:worldmap', 'scene:stable'],
      npcs: ['npc_carmilla', 'npc_marta', 'npc_rook', 'npc_hadwin', 'npc_alberto', 'npc_elise', 'npc_greta'],
    },
  },
};

// 건물 파사드 (px, 월드 좌표). door: 문 타일 x. kind 로 그리기 방식 결정
export const BUILDINGS = [
  { id: 'wall_w', kind: 'wall', x0: 0, x1: 132 },
  { id: 'inn', kind: 'inn', x0: 150, x1: 660, door: 7, scene: 'inn', name: '흑묘 여관', eng: 'THE BLACK CAT', desc: '마르타의 여관 · 미니게임', stories: 2 },
  { id: 'shop', kind: 'shop', x0: 760, x1: 1200, door: 19, scene: 'shop', name: '로크의 잡화점', eng: 'ROOK\'S CURIOS', desc: '물약 · 장비 · 매입' },
  { id: 'board', kind: 'board', x0: 1440, x1: 1680, door: 32, scene: 'questboard', name: '의뢰 게시판', eng: 'NOTICE BOARD', desc: '마을 사람들의 부탁' },
  { id: 'smith', kind: 'smith', x0: 1790, x1: 2330, door: 41, scene: 'smith', name: '하드윈의 대장간', eng: 'HADWIN FORGE', desc: '장비 강화 · 무기 제작' },
  { id: 'church', kind: 'church', x0: 2430, x1: 3060, door: 57, scene: 'church', name: '성 루미나 성당', eng: 'ST. LUMINA', desc: '전직 · 스킬 초기화 · 저장' },
  { id: 'house', kind: 'house', x0: 3130, x1: 3500, name: '엘리제의 집' },
  { id: 'gate', kind: 'gate', x0: 3560, x1: 4032, door: 78, scene: 'worldmap', name: '성으로 가는 길', eng: 'TO THE CASTLE', desc: '월드맵 · 스테이지 선택' },
  // 동쪽 성문 밖 (companions §2.2): 탈것 마구간 + 수호신 제단. 1장 전에는 불에 그을린 빈 마구간 (장면이 '닫힘' 모드)
  { id: 'stable', kind: 'stable', x0: 4100, x1: 4580, door: 89, scene: 'stable', name: '영혼의 마구간', eng: 'STABLE OF SOULS', desc: '탈것 · 수호신 · 공물' },
];

// 마을 소품 (Blender 렌더 props/*). 바닥에 발을 둔 좌표(fx = 중앙 x)
export const TOWN_PROPS = [
  { id: 'prop_barrel', fx: 600, w: 64, h: 64 }, { id: 'prop_barrel', fx: 640, w: 56, h: 56 },
  { id: 'prop_crate', fx: 1150, w: 64, h: 64 }, { id: 'prop_crate', fx: 1160, w: 48, h: 48, dy: -58 },
  { id: 'deco_village_well', fx: 1360, w: 150, h: 150 },
  { id: 'deco_village_haybale', fx: 2380, w: 96, h: 72 },
  // 수레는 엘리제 집과 성문 사이 골목에 (엘리제가 서는 집 앞·문 뒤를 가리지 않게)
  { id: 'deco_village_cart', fx: 3508, w: 190, h: 118 },
  { id: 'deco_village_fence', fx: 3250, w: 180, h: 68 },
  // 영혼의 마구간: 제단 옆 건초 더미 · 마구간 앞 울타리 (companions §2.2)
  { id: 'deco_village_haybale', fx: 4530, w: 96, h: 72 },
  { id: 'deco_village_fence', fx: 4180, w: 180, h: 68 },
];

// 가로등 (광원 + 그림) x 좌표
export const TOWN_LAMPS = [720, 1260, 1740, 2380, 3100, 4066];

// 그레타 (영혼의 마구간지기) 기본 외형 — data/npcs.js 의 npc_greta.look 과 같은 값 (허브는 NPCS 쪽을 우선한다)
export const GRETA_LOOK = {
  build: 'broad', height: 1.0, skin: '#d8a888', hair: '#c8b8a0', hairStyle: 'braid', eyes: '#5a9ab0', outfit: 'villager',
  primary: '#4a3624', secondary: '#2a3a2e', trim: '#b89a60', pants: '#3a2a1a', boots: '#2a1a10', headgear: 'wide_hat', headColor: '#2a2018',
  scarf: { color: '#7a2a1a' }, fem: true,
};

// NPC 배회 설정 + 기본 외형 (render/hero.js look 스키마)
export const TOWN_NPCS = {
  npc_marta: {
    name: '마르타', title: '흑묘 여관 주인', portrait: 'portraits/npc_marta', range: 70, speed: 38, idle: [2.5, 5],
    look: { build: 'broad', skin: '#f0d0b8', hair: '#b04a1a', hairStyle: 'braid', outfit: 'innkeeper', primary: '#4a3a44', secondary: '#2a1a24', trim: '#efe4cf', pants: '#2a1a24', boots: '#1a1014', height: 0.95, fem: true },
  },
  npc_rook: {
    name: '로크', title: '떠돌이 상인', portrait: 'portraits/npc_rook', range: 90, speed: 44, idle: [2, 4],
    look: { build: 'normal', skin: '#c8a888', hair: '#1a1418', hairStyle: 'short', outfit: 'merchant', primary: '#1e1a22', secondary: '#4a3a2a', trim: '#c8a040', pants: '#1a1618', boots: '#141012', headgear: 'hood', headColor: '#141016', scarf: { color: '#3a2a1a' }, eyes: '#ffc040', eyeGlow: true, height: 1.0 },
  },
  npc_hadwin: {
    name: '하드윈', title: '대장장이', portrait: 'portraits/npc_hadwin', range: 0, speed: 0, idle: [3, 6],
    look: { build: 'huge', skin: '#c89070', hair: '#8a8078', hairStyle: 'bald', outfit: 'smith', primary: '#5a4a3a', secondary: '#4a2a18', trim: '#8a7a6a', pants: '#2a2420', boots: '#1a1410', beard: 'full', height: 1.04 },
  },
  npc_alberto: {
    name: '알베르토 신부', title: '성 루미나 성당', portrait: 'portraits/npc_alberto', range: 110, speed: 30, idle: [3, 6],
    look: { build: 'normal', skin: '#e0c0a0', hair: '#d8d4d0', hairStyle: 'short', outfit: 'priest', primary: '#16121a', secondary: '#3a2a4a', trim: '#e8c872', pants: '#16121a', boots: '#100c10', beard: 'full', height: 0.98 },
  },
  npc_elise: {
    name: '엘리제', title: '마을 소녀', portrait: 'portraits/npc_elise', range: 70, speed: 55, idle: [1.2, 3],
    look: { build: 'slim', skin: '#f8e0d0', hair: '#e8c070', hairStyle: 'braid', outfit: 'girl', primary: '#e8e0d0', secondary: '#8a6a4a', trim: '#c83a4a', pants: '#f0e8e0', boots: '#3a2418', height: 0.8 },
  },
  npc_greta: {
    name: '그레타', title: '영혼의 마구간지기', portrait: 'portraits/npc_greta', range: 80, speed: 36, idle: [2.5, 5], look: GRETA_LOOK,
  },
  // 카밀라: 여관 왼쪽 구석(4열, 문에서 3칸 — 문·마르타의 대화 범위와 겹치지 않게)에서 천천히 서성인다. 외형·대사는 data/npcs.js · story.js (POLISH-4, ex_s24.md §10)
  npc_carmilla: {
    name: '카밀라', title: '흡혈귀 귀부인', portrait: 'portraits/npc_carmilla', range: 36, speed: 24, idle: [3, 6],
  },
};

/** 엘리제가 마을에 나타나는지 (4장 이후 또는 구출 플래그) */
export function eliseInTown(state) {
  const p = state?.progress;
  if (!p) return false;
  const f = p.flags || {};
  return (p.chapter ?? 0) >= 4 || !!(f.elise_rescued || f.elise_saved || f.eliseRescued);
}

// NPC 에게 대사 스크립트가 없을 때의 기본 대사 (스토리 담당 스크립트가 우선)
export const TOWN_TALK = {
  npc_marta: [{ who: 'npc_marta', text: '어서 와요, 사냥꾼 양반! 따끈한 스튜도 있고, 심심하면 주사위 한판도 좋지. 흑묘 여관은 밤새 문을 열어 둔다오.' }],
  npc_rook: [{ who: 'npc_rook', text: '헤헤, 물약·부적·잡동사니 다 있습죠. 금화만 있으시면 이 로크가 뭐든 구해 드립니다요.' }],
  npc_hadwin: [{ who: 'npc_hadwin', text: '흠. 무기는 사냥꾼의 목숨줄이다. 강화석을 가져오면 이 망치로 제대로 두들겨 주마.' }],
  npc_alberto: [{ who: 'npc_alberto', text: '빛이 그대와 함께하기를. 새로운 길을 찾고 있다면 성당으로 오게. 주님의 권능이 그대를 이끌 걸세.' }],
  npc_elise: [{ who: 'npc_elise', text: '구해 줘서 고마워요! 이제 무섭지 않아요… 그래도 성에는 꼭 조심해서 다녀오세요!' }],
  npc_greta: [{ who: 'npc_greta', text: '말이든 영혼이든, 먼저 믿어 줘야 너를 믿어. 공물은 그 첫걸음이지.' }],
};

// 상점 주인 대사 (상황별 무작위)
export const SHOP_LINES = {
  rook: {
    hello: ['어서 옵쇼, 나리! 오늘 밤도 물건은 넉넉합죠. 헤헤.', '살아 돌아오셨군요! 좋은 손님은 오래 사셔야 합죠.', '금화 소리가 들리는 것 같습니다요… 천천히 둘러보십쇼.'],
    buy: ['탁월한 선택이십니다요!', '거래 성립입죠! 헤헤.', '이 녀석이 나리 목숨을 구할 겁니다요.'],
    sell: ['흠, 값은 쳐 드립죠.', '이런 물건도 쓸모가 있습죠.', '좋습니다요, 사 드립죠.'],
    poor: ['아이고, 금화가 모자라십니다요. 외상은 안 됩죠.', '헤헤, 주머니 사정이 딱하십니다요.'],
    bye: ['또 들러 주십쇼. 꼭 살아서 오셔야 합니다요!'],
  },
  hadwin: {
    hello: ['왔나. 무기 좀 보자.', '불은 늘 지펴 두었다. 뭘 두들겨 줄까?', '강철은 거짓말을 안 하지.'],
    ok: ['좋아, 제대로 먹혔군!', '크하하! 훌륭한 물건이 됐다!', '이게 바로 하드윈의 솜씨다.'],
    fail: ['쯧, 쇠가 버티질 못했군.', '다음엔 된다. 망치는 배신하지 않아.'],
    destroy: ['…미안하다. 산산조각이 났어.', '이런… 쇳물이 되어 버렸군.'],
    poor: ['재료가 부족하다. 강화석을 더 모아 와.', '금화도 재료도 모자라.'],
    buy: ['잘 골랐다. 날은 내가 세워 뒀지.', '그 녀석, 오래 쓸 거다.'],
  },
  alberto: {
    hello: ['어서 오게, 젊은이. 오늘 밤도 무사하구먼.', '성당의 문은 언제나 열려 있다네.', '빛이 그대의 길을 비추기를.'],
    cls: ['새로운 힘이 깃들었군. 그 힘을 올바르게 쓰게.', '주님께서 그대의 각오를 받아들이셨네.'],
    reset: ['마음을 비우고 다시 시작하게. 길은 여러 갈래라네.'],
    save: ['그대의 여정을 기록해 두었네.'],
    bless: ['그대에게 축복을.', '두려워 말게. 빛은 어둠보다 오래 남는다네.'],
    // 초월·시련 (classes_t3 §8.1 · story_ext §5.4) — 1부 성당지기는 여기까지 닿지 않지만 짝을 맞춰 둔다
    asc: ['새 길을 찾았구먼. 그 길도 결국 사람을 지키는 길이어야 하네.'],
    trial: ['다녀오게. 종소리를 잊지 말고.'],
    trialDone: ['돌아왔구먼. 얼굴을 보니 답을 찾았나 보이.'],
    // 「기본 최상급으로」 (초월·비전을 내려놓음) · 시련을 넘지 못하고 돌아옴 (「성당으로」·「시련 포기」 — requests_f UI-CORE)
    base: ['본래의 길로 돌아왔구먼. 어느 길이든 그대가 걷는 길일세.'],
    trialBack: ['돌아왔구먼. 시련은 도망가지 않는다네. 숨을 고르고 다시 가게.'],
  },
  // 2부 성당지기 엘리제 (flags.p2_started — 신부님은 안쪽 방에 누워 계신다, story_ext §5.4)
  elise: {
    hello: ['어서 오세요! 신부님은 안쪽 방에서 쉬고 계세요. 조용히요!', '오늘도 종 쳤어요. 헌터님도 들으셨어요?', '성당 문은 제가 지켜요. 신부님 대신이에요!'],
    cls: ['우와, 새 힘이 느껴져요! 신부님께 자랑해도 돼요?', '신부님이 그러셨어요. 힘은 지키는 데 쓰는 거래요.'],
    reset: ['다 잊어도 괜찮대요. 길은 여러 갈래래요. 신부님 말씀이에요!'],
    save: ['여정 기록, 제가 또박또박 적어 둘게요!'],
    bless: ['헌터님께 축복을! …제 축복도 효과 있어요. 매일 연습했거든요.', '무서워하지 마세요. 종소리 닿는 데까지는 제가 기도할게요.'],
    asc: ['메아리 너머에서 돌아오셨군요… 눈빛이 달라졌어요.', '새 길을 걸으시는 거예요? 종 칠 때 그 이름도 불러 드릴게요!'],
    trial: ['종 줄 꼭 붙잡고 있을게요. 길 잃지 마세요!', '메아리 속은 추워요. 따뜻하게 하고 가세요!'],
    trialDone: ['돌아오셨다! 뭘 가지고 나오셨어요? …아, 마음이죠. 알아요.'],
    base: ['원래 모습으로 돌아오셨네요! 다른 길은 언제든 다시 고를 수 있어요.'],
    trialBack: ['괜찮아요, 종은 내일도 울려요. 숨 고르고 다시 가 봐요!', '다치진 않으셨어요? 메아리는 기다려 줄 거예요.'],
  },
};
