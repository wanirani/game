// 상점 데이터 — 챕터(state.progress.chapter: 마지막으로 클리어한 챕터)에 따라 품목이 늘어난다
//  shopStock(chapter)  → [{ baseId, rarity, price, tag?, note? }]  떠돌이 상인 로크: 물약·에테르·해독제·강화석·주문서·기본 장신구
//  smithStock(chapter) → [{ baseId, rarity, price, tag?, note? }]  대장장이 하드윈: 6계열 무기 + 머리·갑옷·망토
//  chapterTier(chapter) → 판매 장비 최고 단계(1~7; 7단계 = 2부, 챕터 15부터)
//  SHOPKEEPERS: 상점 주인 대사(인사·구매·판매·골드 부족)
//  price 는 개당 가격. rarity > 0 인 장비는 구매 시 추가 옵션이 무작위로 붙는다 (note 로 안내).
import { ITEMS, WTYPES, RARITIES, buyPrice } from './items.js';

export function chapterTier(ch = 0) { return ch <= 1 ? 1 : ch <= 3 ? 2 : ch <= 5 ? 3 : ch <= 8 ? 4 : ch <= 11 ? 5 : ch <= 14 ? 6 : 7; }   // world2 §7.6: 14 → 6, 15+ → 7

// [baseId, 해금 챕터, 가격 배율, 태그]
const ROOK_GOODS = [
  ['c_potion', 0, 1], ['c_hipotion', 3, 1], ['c_ether', 0, 1], ['c_hiether', 6, 1], ['c_elixir', 9, 1.1, '귀한 물건'],
  ['c_antidote', 0, 1], ['c_bread', 0, 1], ['c_meat', 1, 1], ['c_holywater', 2, 1], ['c_rage_tonic', 4, 1], ['c_warp', 0, 1],
  ['m_stone_1', 0, 1.3], ['m_stone_2', 3, 1.3], ['m_stone_3', 6, 1.35, '한정 입고'],
  ['m_scroll_bless', 4, 1.2], ['m_scroll_protect', 5, 1.2, '비쌈'],
  // 2부 (world2 §7.6)
  ['m_stone_4', 14, 1.35], ['m_stone_5', 16, 1.4, '한정 입고'],
];
// [baseId, 해금 챕터] — 기본 장신구
const ROOK_ACC = [
  ['a_ring_1', 0], ['a_amulet_1', 0], ['a_ring_2', 1], ['a_amulet_2', 1],
  ['a_ring_3', 3], ['a_amulet_3', 3], ['a_ring_4', 4], ['a_amulet_4', 4],
  ['a_ring_5', 6], ['a_amulet_5', 6], ['a_ring_6', 7], ['a_amulet_6', 7],
  // 2부 (world2 §7.6)
  ['a_ring_11', 14], ['a_amulet_11', 14], ['a_ring_13', 16], ['a_amulet_13', 16],
];

const rarNote = (r) => (r > 0 ? `${RARITIES[r].name} — 추가 옵션 ${RARITIES[r].affixes}개 무작위` : undefined);

/** 떠돌이 상인 로크의 잡화점 */
export function shopStock(chapter = 0) {
  const out = [];
  for (const [id, ch, mul, tag] of ROOK_GOODS) {
    if (chapter < ch || !ITEMS[id]) continue;
    out.push({ baseId: id, rarity: 0, price: Math.round((ITEMS[id].price * mul) / 5) * 5, tag: tag ?? (chapter - ch <= 0 && ch > 0 ? '신상품' : undefined) });
  }
  const accR = chapter >= 8 ? 2 : chapter >= 4 ? 1 : 0;
  for (const [id, ch] of ROOK_ACC) {
    if (chapter < ch || !ITEMS[id]) continue;
    const r = ch >= chapter - 1 ? accR : Math.max(0, accR - 1);
    out.push({ baseId: id, rarity: r, price: buyPrice(id, r), tag: ch > 0 && ch === chapter ? '신상품' : undefined, note: rarNote(r) });
  }
  return out;
}

/** 대장장이 하드윈의 무기·방어구 */
export function smithStock(chapter = 0) {
  const T = chapterTier(chapter);
  const topR = chapter >= 16 ? 3 : chapter >= 9 ? 2 : chapter >= 4 ? 1 : 0;
  const out = [];
  const push = (id, r, tag) => { if (ITEMS[id]) out.push({ baseId: id, rarity: r, price: buyPrice(id, r), tag, note: rarNote(r) }); };
  for (const wt of WTYPES) {
    // 이전 단계 상위형 (저렴한 선택지) + 현재 단계 2종
    if (T > 1) push(`w_${wt}_${(T - 1) * 2}`, 0);
    push(`w_${wt}_${T * 2 - 1}`, 0, T > 1 ? '신작' : undefined);
    push(`w_${wt}_${T * 2}`, topR, topR ? '명품' : undefined);
  }
  for (const slot of ['head', 'body', 'cloak']) {
    const pre = slot === 'body' ? 'a_body_' : `a_${slot}_`;
    if (T > 1) push(`${pre}${(T - 1) * 2}`, 0);
    push(`${pre}${T * 2 - 1}`, 0, T > 1 ? '신작' : undefined);
    push(`${pre}${T * 2}`, topR, topR ? '명품' : undefined);
  }
  return out;
}

export const SHOPKEEPERS = {
  npc_rook: {
    // 말투: 굽실거리는 떠돌이 상인 (-입죠 / -습니다요 / -십쇼, 헤헤) — story.js 대사와 통일
    name: '로크', title: '떠돌이 상인',
    hello: ['어서 옵쇼, 헌터 나리! 악마성 코앞에서 장사하는 놈은 이 로크뿐입죠. 헤헤.', '살아 돌아오셨군요! 역시 단골 나리는 다르십니다요. 뭐가 필요하십쇼?', '물약은 넉넉히 챙기십쇼. 저 성 안엔 약방이 없으니까요. 헤헤.'],
    buy: ['탁월한 안목이십니다요!', '거래 성립입죠! 또 들러 주십쇼.', '이걸로 한 놈 더 잡으실 수 있을 겁니다요. 헤헤.'],
    sell: ['흠, 이 정도면 쳐 드립죠.', '괜찮은 물건이군요. 받아 두겠습니다요.', '성에서 주워 오신 겁죠? 좋습니다, 사 드립죠.'],
    poor: ['아이고 나리, 외상은 안 됩니다요.', '금화가 모자라십니다요. 박쥐라도 몇 마리 더 잡아 오십쇼. 헤헤.'],
    full: ['가방이 터지겠습니다요! 좀 정리하고 오십쇼.'],
  },
  npc_hadwin: {
    name: '하드윈', title: '대장장이',
    hello: ['…왔나. 쇠는 거짓말을 안 하지. 골라 봐.', '칼날이 무뎌졌으면 가져와. 불은 늘 지펴 두었다.', '흡혈귀 놈들 뼈는 단단하다. 좋은 무기가 필요할 거다.'],
    buy: ['잘 골랐다. 제대로 휘둘러라.', '내 손을 거친 물건이다. 쉽게 부러지진 않을 거야.'],
    sell: ['녹여서 다시 쓰지.', '쓸 만한 쇠로군.'],
    poor: ['금화가 부족하다. 대장간은 자선 사업이 아니야.'],
    full: ['짐이 너무 많군. 정리부터 해라.'],
    enhanceOk: ['좋아, 쇠가 불을 받아들였다!', '훌륭하군. 칼날이 노래를 하는구나.', '크하하! 이게 바로 장인의 솜씨다!'],
    enhanceFail: ['…쇠가 불을 거부했다. 다시 해 보지.', '쯧, 불순물이 섞였나. 운이 없었군.', '실패도 담금질의 일부다. 포기하지 마라.'],
    enhanceBreak: ['…미안하다. 이번엔 쇠가 버티지 못했어.', '산산조각이… 불이 너무 뜨거웠나.'],
    enhanceMax: ['이건… 내 평생 최고의 작품이다. 더 손댈 곳이 없어.'],
  },
};
