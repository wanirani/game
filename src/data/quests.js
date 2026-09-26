// 퀘스트 데이터 (런타임은 game/quests.js)
// QUESTS[id] = { id, kind:'main'|'side', name, giver:npcId|'board'|null, desc, goal, reward:{gold, exp, items:[{id,qty}]}, req:{chapter, flag?, relics?}, auto? }
//  · goal.type:
//     kill {enemy: id|[ids], count}   killAny {count}          boss {boss, again?}  (again=true: 수락 후 다시 처치해야 함)
//     clear {stage, rank?}            collect {item, count}  (보상 수령 시 재료를 전달 = 소모)
//     docs {count}  relics {count}    enhance {level}        minigame {game?, wins}   combo {count} (25의 배수)
//     gold {amount} (수락 후 주운 금화)  talk {npc}
//  · req.chapter: 이 챕터(= 마지막으로 클리어한 챕터 번호) 이상이면 수락 가능. main 퀘스트는 조건 충족 시 자동 수락, 달성 시 자동 보상(auto).
//  · 퀘스트 대사(선택): story.js 의 q_<id>_start / q_<id>_done

// 챕터별 보상 규모 (스테이지 적 레벨 기준 경험치) — game/stats.js expToNext 와 같은 공식 (순환 import 회피용 사본)
const expToNext = (l) => Math.floor(30 * Math.pow(l, 1.65) + 20 * l);
const LV = [1, 1, 3, 5, 8, 11, 14, 17, 20, 24, 28, 32, 36, 45];
const xp = (ch, k = 0.6) => Math.round(expToNext(LV[ch] ?? 1) * k / 10) * 10;
const it = (id, qty = 1) => ({ id, qty });
const stoneFor = (ch) => `m_stone_${Math.min(6, Math.max(1, Math.ceil(ch / 2)))}`;

const MAIN = [
  ['s01', '불타는 에슈빌', '불길에 휩싸인 마을 외곽을 지나 종탑의 나이트윙을 쓰러뜨려라.'],
  ['s02', '안개 속의 노래', '안개의 묘지에서 울려 퍼지는 밴시 여왕의 노래를 멈춰라.'],
  ['s03', '열린 성문', '스스로 열린 악마성 정문. 목 없는 문지기 둘라한을 쓰러뜨려라.'],
  ['s04', '엘리제 구출', '대회랑 깊은 곳, 진홍의 갑주군주에게서 엘리제를 되찾아라.'],
  ['s05', '뼈의 용', '지하 묘지에 잠든 본 드래곤을 쓰러뜨리고 망자들을 풀어 주어라.'],
  ['s06', '금단의 서가', '끝없는 대도서관에서 살아 있는 마도서 그리모어를 봉인하라.'],
  ['s07', '제0호의 기다림', '연금술 연구소에서 백 년을 기다린 키메라 호문쿨루스를 잠재워라.'],
  ['s08', '검은 물의 주인', '지하 수로를 지배하는 바다뱀 레비아탄을 쓰러뜨려라.'],
  ['s09', '자정을 향하는 바늘', '붉은 달의 시간을 재는 시계탑. 태엽 거신을 멈춰라.'],
  ['s10', '얼음 정원', '구름 위 빙벽의 주인, 서리 여왕 이자벨라를 쓰러뜨려라.'],
  ['s11', '사신의 장부', '피의 예배당에서 백작의 오른팔, 사신 데스를 쓰러뜨려라.'],
  ['s12', '영원한 밤의 끝', '드라큘라의 왕좌에 올라 백작을 쓰러뜨려라.'],
  ['s13', '거꾸로 선 성', '심연의 역성 가장 깊은 곳, 모든 밤의 근원인 혼돈의 군주를 쓰러뜨려라.'],
];

export const QUESTS = {};
MAIN.forEach(([stage, name, desc], i) => {
  const ch = i + 1;
  const id = `main${String(ch).padStart(2, '0')}`;
  const items = [it(stoneFor(ch), 2)];
  if (ch % 3 === 0) items.push(it('m_scroll_bless', 1));
  if (ch === 12 || ch === 13) items.push(it('m_scroll_protect', 2));
  QUESTS[id] = {
    id, kind: 'main', chapter: ch, name, giver: null, desc, auto: true,
    goal: { type: 'clear', stage },
    reward: { gold: 300 + 250 * ch, exp: xp(ch, 0.8), items },
    req: ch === 13 ? { chapter: 12, relics: 5, flag: 'boss_b_dracula' } : { chapter: ch - 1 },
  };
});

const side = (o) => { QUESTS[o.id] = { kind: 'side', ...o }; };

// ── 현상금 게시판 ──
side({ id: 'bd_ghoul', name: '구울 소탕 의뢰', giver: 'board', req: { chapter: 0 },
  desc: '[자경단] 밭에서 시체가 기어 나온다. 구울 12마리를 처치해 줄 용사를 구함.',
  goal: { type: 'kill', enemy: 'zombie', count: 12 }, reward: { gold: 250, exp: xp(1, 1.5), items: [it('c_potion', 2)] } });
side({ id: 'bd_wolves', name: '굶주린 늑대 떼', giver: 'board', req: { chapter: 0 },
  desc: '[양치기 조합] 붉은 달이 뜬 뒤로 늑대들이 미쳐 날뛴다. 늑대 8마리 처치 바람.',
  goal: { type: 'kill', enemy: ['wolf', 'snow_wolf'], count: 8 }, reward: { gold: 300, exp: xp(1, 2), items: [it('m_stone_1', 3)] } });
side({ id: 'bd_nightwing', name: '나이트윙 재토벌', giver: 'board', req: { chapter: 1 },
  desc: '[성당] 종탑에 다시 박쥐가 모인다는 제보. 「불타는 마을」에서 나이트윙을 한 번 더 쓰러뜨려 주게.',
  goal: { type: 'boss', boss: 'b_nightwing', again: true }, reward: { gold: 800, exp: xp(3, 1), items: [it('m_stone_2', 2)] } });
side({ id: 'bd_combo50', name: '연격의 증명', giver: 'board', req: { chapter: 2 },
  desc: '[흑묘 여관 내기판] 50연속 콤보를 이어 가는 헌터를 봤다는 사람이 없다. 증명해 보라!',
  goal: { type: 'combo', count: 50 }, reward: { gold: 600, exp: xp(3, 1), items: [it('m_scroll_bless', 1)] } });
side({ id: 'bd_gate_a', name: '정문 돌파 시험', giver: 'board', req: { chapter: 3 },
  desc: '[까마귀 결사 모집 공고] 「악마성 정문」을 A 랭크 이상으로 돌파한 자, 실력을 인정한다.',
  goal: { type: 'clear', stage: 's03', rank: 'A' }, reward: { gold: 1500, exp: xp(4, 1), items: [it('m_stone_3', 3)] } });
side({ id: 'bd_armor', name: '움직이는 갑옷 사냥', giver: 'board', req: { chapter: 4 },
  desc: '[대장간] 빈 갑옷이 걸어 다닌다고? 좋은 쇳덩이다. 갑옷 기사·도끼 갑옷·창병 갑옷 20기를 부숴라.',
  goal: { type: 'kill', enemy: ['armor_knight', 'axe_armor', 'spear_guard', 'royal_guard'], count: 20 }, reward: { gold: 1600, exp: xp(5, 1), items: [it('m_stone_3', 2)] } });
side({ id: 'bd_slayer', name: '백귀야행', giver: 'board', req: { chapter: 5 },
  desc: '[성당] 성에서 쏟아지는 마물의 수를 줄여야 하네. 종류를 가리지 말고 400마리를 처치하게.',
  goal: { type: 'killAny', count: 400 }, reward: { gold: 3000, exp: xp(8, 1.2), items: [it('m_scroll_protect', 2)] } });
side({ id: 'bd_combo100', name: '백연격의 전설', giver: 'board', req: { chapter: 8 },
  desc: '[흑묘 여관 내기판] 100연속 콤보. 성공하면 여관 벽에 이름을 새겨 준다! (진짜로)',
  goal: { type: 'combo', count: 100 }, reward: { gold: 5000, exp: xp(10, 1), items: [it('m_stone_5', 2)] } });

// ── 마르타 (흑묘 여관) ──
side({ id: 'mt_herbs', name: '약초 수프', giver: 'npc_marta', req: { chapter: 1 },
  desc: '피난민들에게 따뜻한 수프를 끓여 주고 싶대. 성 근처에서 약초 5묶음을 구해 오자.',
  goal: { type: 'collect', item: 'm_herb', count: 5 }, reward: { gold: 300, exp: xp(2, 1), items: [it('c_potion', 3)] } });
side({ id: 'mt_gambler', name: '여관의 승부사', giver: 'npc_marta', req: { chapter: 2 },
  desc: '여관 손님들이 도박판에서 한 번도 못 이겨 풀이 죽었대. 미니게임에서 3번 이겨 분위기를 띄워 주자.',
  goal: { type: 'minigame', wins: 3 }, reward: { gold: 800, exp: xp(3, 0.8), items: [it('m_scroll_bless', 1)] } });
side({ id: 'mt_feathers', name: '백작님의 장난감', giver: 'npc_marta', req: { chapter: 5 },
  desc: '고양이 "백작님"이 까마귀 깃털 장난감에 푹 빠졌다. 깃털 8개를 모아다 주자.',
  goal: { type: 'collect', item: 'm_feather', count: 8 }, reward: { gold: 1200, exp: xp(6, 1), items: [it('m_stone_3', 2), it('c_potion', 3)] } });

// ── 로크 (떠돌이 상인) ──
side({ id: 'rk_bones', name: '뼈다귀 수집가', giver: 'npc_rook', req: { chapter: 1 },
  desc: '로크가 해골 병사의 뼈 조각 10개를 사겠다고 한다. 어디에 쓰는지는… 묻지 않는 게 좋겠다.',
  goal: { type: 'collect', item: 'm_bone', count: 10 }, reward: { gold: 500, exp: xp(2, 1), items: [it('m_stone_1', 2)] } });
side({ id: 'rk_ecto', name: '병에 담긴 원혼', giver: 'npc_rook', req: { chapter: 2 },
  desc: '유령이 남긴 엑토플라즘 8병. 수도의 귀족들 사이에서 "영혼 향수"로 팔린단다.',
  goal: { type: 'collect', item: 'm_ectoplasm', count: 8 }, reward: { gold: 900, exp: xp(4, 1), items: [it('m_stone_2', 2)] } });
side({ id: 'rk_goldrush', name: '금화 비', giver: 'npc_rook', req: { chapter: 5 },
  desc: '"성 안엔 금화가 굴러다닙죠." 스테이지에서 금화를 6,000 G 주워 로크에게 실력을 보여 주자.',
  goal: { type: 'gold', amount: 6000 }, reward: { gold: 2000, exp: xp(7, 1), items: [it('m_stone_4', 2), it('m_scroll_protect', 1)] } });

// ── 하드윈 (대장간) ──
side({ id: 'hd_plus5', name: '담금질의 기초', giver: 'npc_hadwin', req: { chapter: 1 },
  desc: '"강화 +5. 그게 헌터의 기본이다." 장비 하나를 +5까지 강화해 하드윈에게 보여 주자.',
  goal: { type: 'enhance', level: 5 }, reward: { gold: 400, exp: xp(2, 1), items: [it('m_stone_2', 3)] } });
side({ id: 'hd_iron', name: '쇳덩이 조달', giver: 'npc_hadwin', req: { chapter: 3 },
  desc: '갑옷 괴물들이 떨어뜨리는 철 조각 10개. 하드윈이 좋은 강화석을 만들어 주기로 했다.',
  goal: { type: 'collect', item: 'm_iron', count: 10 }, reward: { gold: 800, exp: xp(4, 1), items: [it('m_stone_3', 3)] } });
side({ id: 'hd_plus10', name: '명공의 경지', giver: 'npc_hadwin', req: { chapter: 7 },
  desc: '"+10. 거기서부터가 진짜다." 장비 하나를 +10까지 강화하라. 보호의 주문서를 잊지 말 것.',
  goal: { type: 'enhance', level: 10 }, reward: { gold: 3000, exp: xp(9, 1), items: [it('m_scroll_bless', 2), it('m_stone_5', 2)] } });

// ── 알베르토 신부 (성당) ──
side({ id: 'ab_docs', name: '잃어버린 비전서', giver: 'npc_alberto', req: { chapter: 2 },
  desc: '옛 헌터들이 성 곳곳에 숨긴 비전서를 4권 찾아내게. 금이 간 벽을 의심하게.',
  goal: { type: 'docs', count: 4 }, reward: { gold: 800, exp: xp(3, 1.2), items: [it('m_scroll_bless', 1)] } });
side({ id: 'ab_souls', name: '방황하는 영혼', giver: 'npc_alberto', req: { chapter: 5 },
  desc: '성에 붙잡힌 영혼의 조각 6개를 모아 오게. 성당에서 제대로 보내 주겠네.',
  goal: { type: 'collect', item: 'm_soul', count: 6 }, reward: { gold: 1500, exp: xp(6, 1.2), items: [it('m_scroll_protect', 1), it('m_stone_3', 2)] } });
side({ id: 'ab_relics', name: '유물의 부름', giver: 'npc_alberto', req: { chapter: 7 },
  desc: '드라큘라의 유물을 3개 이상 모으게. 숨겨진 방, 무너지는 벽 너머를 살피게.',
  goal: { type: 'relics', count: 3 }, reward: { gold: 2500, exp: xp(8, 1.2), items: [it('m_stone_4', 3)] } });

// ── 엘리제 ──
side({ id: 'el_letter', name: '엘리제의 편지', giver: 'npc_elise', req: { chapter: 4, flag: 'elise_rescued' },
  desc: '엘리제가 알베르토 신부님께 쓴 감사 편지를 대신 전해 달라고 부탁했다.',
  goal: { type: 'talk', npc: 'npc_alberto' }, reward: { gold: 300, exp: xp(5, 0.6), items: [it('c_potion', 2)] } });

// ── 카밀라 ──
side({ id: 'cm_brides', name: '배신한 자매들', giver: 'npc_carmilla', req: { chapter: 11, flag: 'carmilla_trust1' },
  desc: '카밀라의 부탁. 왕좌를 지키는 흡혈 신부 10명을 처치해 달라. "자매들과는 오래된 악연이 있거든."',
  goal: { type: 'kill', enemy: 'vampire_bride', count: 10 }, reward: { gold: 6000, exp: xp(12, 1), items: [it('m_stone_6', 2)] } });

export const QUEST_ORDER = Object.keys(QUESTS);
