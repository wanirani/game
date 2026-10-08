// 이야기 보강 — owner: STORY-GAPS-B (docs/specs/story_ext.md §5.3 여관의 밤 · §5.4 외전 뒤 마을 반응 · §5.6 동료 합류 한마디)
// SCRIPTS_EXTRA 는 data/story.js 끝의 Object.assign 에서 SCRIPTS 에 합쳐진다. BANTER 는 game/story_director.js 가 읽는다.
// story.js 를 import 하지 않는다 (순환 금지 — story_ex.js · story_trials.js 와 같은 규칙). 도우미(N·H·S…)는 story.js 와 같은 모양으로 여기서 다시 선언한다.
// 줄 형식은 story.js 머리말 참고. 새 명령·조건 없음 (story_ext §1): 분기는 플래그·{char}·라벨뿐. 모두 대화 오버레이(scenes/dialogue.js)로 재생된다.
//
// 담당 스크립트
//   여관의 밤 (§5.3)  inn_<a>_<b> 13개 + inn_all_harvest — 스테이지에서 마을로 돌아올 때 story_director.hubStoryEnter 가 도착마다 하나까지 튼다.
//                      순서·조건은 아래 BANTER 표 (표 순서대로 처음 맞는 것). 플레이 중인 헌터가 pair 에 있으면 건너뛴다 (다른 두 사람의 밤을 엿듣는다).
//                      inn_all_harvest (pair 'all'): 헌터 줄마다 ifChar(id, 'skip_'+id) … L('skip_'+id) — 플레이 중인 헌터의 줄은 빠진다.
//   마을 반응 (§5.4)  npc_hadwin/marta/greta_ex21 · npc_rook/elise/alberto_ex22 · npc_marta/hadwin/elise_ex23 —
//                      story.js pickNpcScript 가 ex_sNN_done 뒤 한 번씩 (새 외전부터) 튼다. 그다음은 평소 대사 순환.
//   동료 합류 (§5.6)  cmp_join_<id> 11개 (합류 장면이 따로 없던 1부 동료; 가웨인·모르스는 헌터마다 대답) —
//                      story_director 가 bus 'companionUnlocked' 를 플래그 cmpq_<id> 로 받아 두었다가 다음 마을 도착에 (여관의 밤보다 먼저) 튼다.
// 플래그  읽기: lia_joined · azel_joined · isolde_joined · elise_rescued · alberto_confessed · p2_done (BANTER) · ending_p2true (RVX)
//         쓰기: 없음 (cmpq_<id> 는 story_director 가 쓰고 지운다; 본 대사는 seenScripts 로만 남는다)

const N = (text, x) => ({ who: 'narrator', text, ...x });
const H = (text, x) => ({ who: 'hero', text, ...x });
const S = (who, text, x) => ({ who, text, ...x });
const L = (label) => ({ label });
const ifChar = (c, label) => ({ if: { char: c }, cmd: 'goto', label });

const A = 'npc_alberto', MA = 'npc_marta', RO = 'npc_rook', HA = 'npc_hadwin', EL = 'npc_elise', G = 'npc_greta';
// 레이븐: 가면(npc_rook) / 진엔딩 뒤 맨얼굴(npc_rook2). 조건부 두 줄 → 한 줄만 나온다 (story_trials.js 와 같은 모양)
const RVX = (text) => [{ if: '!ending_p2true', who: RO, name: '레이븐', text },
                       { if: 'ending_p2true', who: RO, name: '레이븐', portrait: 'portraits/npc_rook2', text }];
/** 1부 동료 화자 — 명패·초상화를 줄마다 지정 (portraits/cmp_g_*) */
const CMPX = (id, name, portrait, text) => ({ who: id, name, portrait, text });
/** 여관의 밤: 헌터 둘이 번갈아 말한다. who = 영웅 id (명패·초상화는 CHARACTERS), side 'left' / 'right' */
const B = (who, text, side = 'right') => ({ who, text, side });
/** inn_all_harvest 한 줄: 플레이 중인 헌터는 건너뛴다. 리아·아젤·이졸데는 합류 플래그가 있을 때만 (BANTER 의 합류 조건과 같은 규칙) */
const JOINED = { lia: 'lia_joined', azel: 'azel_joined', isolde: 'isolde_joined' };
const HV = (id, text, side) => [ifChar(id, 'skip_' + id), { ...(JOINED[id] ? { if: JOINED[id] } : {}), ...B(id, text, side) }, L('skip_' + id)];

/**
 * 여관의 밤 표 (story_ext §5.3) — 표 순서가 우선순위. story_director 가 첫 번째로 맞는 것 하나를 튼다:
 *   아직 안 봄(seenScripts) · progress.chapter ≥ req.chapterMin · req.flags 가 모두 참 · pair 에 지금 헌터(state.charId)가 없다.
 *   pair 'all' = 모두 모이는 밤 (플레이 중인 헌터의 줄은 대본 안에서 빠진다).
 */
export const BANTER = Object.freeze([
  { id: 'inn_kael_victor', pair: ['kael', 'victor'], req: { chapterMin: 2, flags: [] } },
  { id: 'inn_sera_bran', pair: ['sera', 'bran'], req: { chapterMin: 3, flags: [] } },
  { id: 'inn_sera_lia', pair: ['sera', 'lia'], req: { chapterMin: 4, flags: ['lia_joined', 'elise_rescued'] } },
  { id: 'inn_bran_kael', pair: ['bran', 'kael'], req: { chapterMin: 5, flags: [] } },
  { id: 'inn_lia_azel', pair: ['lia', 'azel'], req: { chapterMin: 6, flags: ['lia_joined', 'azel_joined'] } },
  { id: 'inn_victor_azel', pair: ['victor', 'azel'], req: { chapterMin: 7, flags: ['azel_joined', 'alberto_confessed'] } },
  { id: 'inn_kael_azel', pair: ['kael', 'azel'], req: { chapterMin: 9, flags: ['azel_joined'] } },
  { id: 'inn_sera_azel', pair: ['sera', 'azel'], req: { chapterMin: 11, flags: ['azel_joined'] } },
  { id: 'inn_bran_isolde', pair: ['bran', 'isolde'], req: { chapterMin: 14, flags: ['isolde_joined'] } },
  { id: 'inn_victor_isolde', pair: ['victor', 'isolde'], req: { chapterMin: 15, flags: ['isolde_joined'] } },
  { id: 'inn_lia_isolde', pair: ['lia', 'isolde'], req: { chapterMin: 17, flags: ['lia_joined', 'isolde_joined'] } },
  { id: 'inn_kael_sera', pair: ['kael', 'sera'], req: { chapterMin: 18, flags: [] } },
  { id: 'inn_victor_bran', pair: ['victor', 'bran'], req: { chapterMin: 19, flags: [] } },
  { id: 'inn_all_harvest', pair: 'all', req: { chapterMin: 20, flags: ['p2_done'] } },
].map((e) => Object.freeze({ ...e, pair: Array.isArray(e.pair) ? Object.freeze(e.pair) : e.pair, req: Object.freeze({ ...e.req, flags: Object.freeze(e.req.flags) }) })));

export const SCRIPTS_EXTRA = {
  // ═══════════════════════════ 여관의 밤 (§5.3) ═══════════════════════════
  inn_kael_victor: [ N('흑묘 여관의 밤. 구석 자리에서 낯익은 두 목소리가 들려온다.'),
    B('victor', '발크레인 나리, 이번 일 보수는 얼마 받기로 했어?', 'left'),
    B('kael', '받지 않는다. 백 년 전의 약속이다. 누구와의 약속인지는… 나도 잘 모르지만.'),
    B('victor', '모르는 약속으로 목숨을 건다고? …하긴, 나도 액수 칸 빈 공고 보고 왔으니 할 말 없군.', 'left'),
    B('kael', '살아서 돌아가면 한 잔 사지. 그게 내 보수다.'),
    B('victor', '좋아. 외상 장부에 적어 둔다, 카엘.', 'left') ],
  inn_sera_bran: [ N('촛불 하나를 사이에 두고, 수녀와 기사가 마주 앉아 있었다.'),
    B('sera', '브란 씨, 매일 밤 누구를 위해 기도하세요?', 'left'),
    B('bran', '…형제들이오. 이름을 하나씩 부르다 보면 날이 새오.'),
    B('sera', '그럼 오늘은 제가 반을 맡을게요. 이름 알려 주세요.', 'left'),
    B('bran', '로렌, 마커스…. 고맙소, 수녀님. 오늘은 조금 일찍 잘 수 있겠구려.') ],
  inn_sera_lia: [ N('엘리제가 잠든 뒤, 여관 계단참.'),
    B('sera', '리아, 엘리제가 내일 머리 땋아 달래요. 언니가 해 주면 좋겠대요.', 'left'),
    B('lia', '…나 그런 거 못 해. 칼 손질밖에.'),
    B('sera', '칼 손질처럼 하면 돼요. 세 갈래로 나누고, 엇갈려서, 단단하게.', 'left'),
    B('lia', '…해 볼게. 대신 못생기게 나와도 웃지 마.') ],
  inn_bran_kael: [ N('여관 뒷마당. 두 사람이 나란히 무기를 손질하고 있었다.'),
    B('bran', '카엘 공, 그대 가문은 몇 대째 백작과 싸웠소?', 'left'),
    B('kael', '이번이 다섯 번째 붉은 달이다. 비석은 넷이지.'),
    B('bran', '우리 기사단도 그만큼 무너졌을지 모르겠구려. 백 년마다.', 'left'),
    B('kael', '그럼 이번엔 둘 다 무너지지 말자. 비석은 지겹다.') ],
  inn_lia_azel: [ N('여관 지붕 위. 달빛 아래 두 그림자가 등을 맞대고 앉아 있었다.'),
    B('azel', '결사 명단 두 번째 줄이 나라고 했지. 첫 줄은 누구냐.', 'left'),
    B('lia', '…네 아버지.'),
    B('azel', '그렇다면 순서는 지키는 게 좋겠군. 아버지가 먼저다.', 'left'),
    B('lia', '걱정 마. 네 줄은 아직 보류야. …계속 보류일 수도 있고.'),
    B('azel', '그 말, 기억해 두지.', 'left') ],
  inn_victor_azel: [ N('불 꺼진 여관 홀. 빈 술잔 두 개가 탁자 위에 놓여 있었다.'),
    B('victor', '신부님이 백 년을 살았대. 너도 백 년 넘게 살았다며? 늙은이 모임이군.', 'left'),
    B('azel', '나는 늙지 않았을 뿐이다. 그는 늙지 못했던 거고.'),
    B('victor', '…차이가 뭔데.', 'left'),
    B('azel', '그는 매일 밤 종을 쳤다. 나는 매일 밤 귀를 막았다.'),
    B('victor', '…술이나 마셔. 오늘은 내가 산다. 왜인지는 나도 모르겠지만.', 'left') ],
  inn_kael_azel: [ N('벽난로 앞. 카엘이 채찍을 감다 말고 고개를 들었다.'),
    B('kael', '아젤. 백 년 전 고조할아버지와 싸웠다고 했지. 어떤 사람이었나.', 'left'),
    B('azel', '채찍 소리가 컸다. 그리고 웃었지. 아버지의 왕좌 앞에서 웃은 인간은 그자뿐이었다.'),
    B('kael', '…웃었다고?', 'left'),
    B('azel', '"종이 울렸으니 와야지." 그렇게 말하고 웃었다. 무슨 뜻인지는 모른다.'),
    B('kael', '…종이 울렸으니. 기억해 두겠다.', 'left') ],
  inn_sera_azel: [ N('예배당 같은 고요가 여관 창가에 내려앉아 있었다.'),
    B('sera', '아젤, 피가 마시고 싶을 때는 어떻게 참아요?', 'left'),
    B('azel', '기도는 안 한다. …어머니의 일기를 외운다.'),
    B('sera', '그것도 기도예요. 주님이 들으셨다면 분명 아멘 하셨을 거예요.', 'left'),
    B('azel', '…수녀가 그렇게 말해 주니, 오늘 밤은 조금 덜 목마르군.') ],
  inn_bran_isolde: [ N('마구간 옆 울타리. 기사 둘이 나란히 기대어 하늘의 금을 올려다보았다.'),
    B('bran', '이졸데 공, 하늘의 기사단은 어떤 서약을 했소?', 'left'),
    B('isolde', '"용이 날 수 있는 하늘을 지킨다." 그게 전부다. 짧아서 잊을 수가 없지.'),
    B('bran', '우리 것은 "새벽을 가져간다"였소. …둘 다 지키지 못했구려.', 'left'),
    B('isolde', '아직 끝나지 않았다. 마지막 기사가 둘이나 남았으니까.'),
    B('bran', '하하! 그렇구려. 마지막 기사가 둘이면, 그건 기사단이오.', 'left') ],
  inn_victor_isolde: [ N('여관 마당. 빅터가 이졸데의 창끝을 흘끔흘끔 쳐다보고 있었다.'),
    B('victor', '용 한 마리 키우는 데 얼마나 들어? 사료값 말이야.', 'left'),
    B('isolde', '아르겐은 번개를 먹는다. 공짜다.'),
    B('victor', '…세상에서 제일 부러운 탈것이군.', 'left'),
    B('isolde', '대신 성질이 나쁘다. 마음에 안 드는 자는 태우지 않는다.'),
    B('victor', '그럼 난 걸어 다니지 뭐. 그것도 공짜니까.', 'left') ],
  inn_lia_isolde: [ N('지붕 위, 바람이 센 밤. 이졸데가 나지막이 노래를 흥얼거렸다.'),
    B('isolde', '리아, 기사단의 옛 노래를 아나? 떠난 막내 까마귀 이야기다.', 'left'),
    B('lia', '…들어 본 적 없어. 불러 봐.'),
    B('isolde', '"막내는 땅 아래를 보러 갔네. 하늘은 오래오래 기다렸네."', 'left'),
    B('lia', '…그 막내, 땅 아래서 둥지 하나 지었어. 나 같은 애들 키우려고. 엉망이었지만.'),
    B('isolde', '그럼 노래에 한 줄 더하지. "막내는 땅 아래서도 둥지를 지었네."', 'left') ],
  inn_kael_sera: [ N('미궁에서 돌아온 밤. 여관의 불이 늦게까지 꺼지지 않았다.'),
    B('kael', '미궁에서 무엇을 봤나, 수녀.', 'left'),
    B('sera', '…등 뒤에서 아이가 우는데 돌아보지 못하는 꿈이요. 카엘 씨는요?'),
    B('kael', '벽에서 떨어지지 않는 채찍.', 'left'),
    B('sera', '둘 다 놓지 못하는 꿈이네요.'),
    B('kael', '그래. 그러니 놓지 말자. 아이도, 채찍도.', 'left') ],
  inn_victor_bran: [ N('저녁 종이 울렸다. 소리가 조금 고르지 않았다.'),
    B('victor', '영감님이 요즘 종을 못 친다며. 엘리제가 친대.', 'left'),
    B('bran', '그 작은 팔로 매일 치는 거요. 소리가 고르진 않지만… 멀리 가오.'),
    B('victor', '…다음엔 내가 대신 쳐 줄까. 돈 안 받고.', 'left'),
    B('bran', '빅터 공, 요즘 공짜가 너무 많구려.'),
    B('victor', '그러게. 이 마을 물이 이상해.', 'left') ],
  inn_all_harvest: [   // pair 'all' — 헌터 줄마다 HV: 플레이 중인 헌터는 건너뛰고, 리아·아젤·이졸데는 합류 플래그가 있을 때만
    N('수확제가 다시 열린 밤. 흑묘 여관의 긴 탁자에 헌터들이 처음으로 한자리에 모였다.'),
    S(MA, '세상에, 다 모이니까 여관이 좁네! 오늘은 무용담 하나에 한 잔씩이야!'),
    ...HV('kael', '종소리가 들리면 다들 여기로 오는군.'),
    ...HV('sera', '엘리제가 매일 쳐 주니까요. 우리 모두를 부르는 소리예요.', 'left'),
    ...HV('victor', '그 꼬마가 세상을 붙들고 있었다며? 외상값이 제일 많이 밀린 상대가 꼬마였군.'),
    ...HV('bran', '새벽을 가져간다는 서약, 오늘은 잔에 담아 가져왔소.', 'left'),
    ...HV('lia', '…시끄러워. 그래도 오늘은 봐줄게.'),
    ...HV('azel', '햇빛 아래 모인 사냥꾼들이라. 백 년 전엔 상상도 못 했군.', 'left'),
    ...HV('isolde', '하늘의 흉터도 종소리가 닿는 곳까지는 조용하다. 좋은 마을이다.'),
    N('그날 밤 종탑의 종은 평소보다 오래 울렸다. 아주 먼 곳에서, 무언가가 메아리처럼 그 소리에 답했다.') ],

  // ═══════════════════════════ 외전 뒤 마을 반응 (§5.4) — pickNpcScript 가 새 외전부터 한 번씩 ═══════════════════════════
  npc_hadwin_ex21: [S(HA, '이졸데가 용 비늘을 하나 가져왔다. …두들겨도 안 휜다. 이런 쇠는 처음이다.'), S(HA, '창끝에 덧대 주겠다. 용이 허락한다면.')],
  npc_marta_ex21:  [S(MA, '마구간에 용이 산다며? 그레타가 건초 대신 번개를 먹인다고 투덜대더라. 호호!'), N('(백작님이 마구간 쪽 하늘을 노려보며 꼬리를 바짝 세웠다.)')],
  npc_greta_ex21:  [S(G, '은빛 용이 마구간 지붕에서 자. 지붕이 남아날지 모르겠어. …그래도 잠버릇은 착해.')],
  npc_rook_ex22:   [...RVX('결사는 문을 닫았다. 둥지의 칼들은 이제 다들 제 이름으로 산다.'), ...RVX('…헤헤, 덕분에 외상 장부에 이름이 늘었습죠. 이름이 생기니까 다들 외상을 하더군요.')],
  npc_elise_ex22:  [S(EL, '리아 언니가 언덕에 비석 세운대요. 저도 이름 새기는 거 도와드렸어요. 글씨 제일 반듯하대요!'), S(EL, '비석이 다 서면, 언니 엄마도 종소리 들으러 마을에 오실까요?')],
  npc_alberto_ex22:[S(A, '까마귀 결사 명부에서 내 이름도 지웠다더군. 허허… 백 년 만에 홀가분하구먼.')],
  npc_marta_ex23:  [S(MA, '게시판에 또 빈칸 공고가 붙었어. 맡을 사냥꾼 칸엔 매번 빅터 이름이야. …요즘 그 양반 웃는 얼굴이 좀 쓸쓸해.'), S(MA, '그래서 공고 옆에 적어 놨지. "보수 — 흑묘 여관 스튜 평생 무료." 호호!')],
  npc_hadwin_ex23: [S(HA, '하겐의 은 무기. 손잡이 가죽까지 손수 감았더군. …좋은 장인이었다.'), S(HA, '은은 무르다. 그런데 그 늙은이 은은 안 무르더군. 마음을 넣어 두들긴 거다.')],
  npc_elise_ex23:  [S(EL, '빅터 아저씨가 은탄 한 알을 모자 옆에 두고 왔대요. 그건 기도 같은 거죠? 저도 그 할아버지 위해 종 쳤어요.')],

  // ═══════════════════════════ 동료 합류 한마디 (§5.6) — 1순위 가웨인 · 모르스, 나머지는 두 줄 ═══════════════════════════
  cmp_join_gd_knight: [
    CMPX('gd_knight', '가웨인', 'portraits/cmp_g_knight', '(안개 속에서 망령 기사가 투구를 벗고 한쪽 무릎을 꿇는다.)'),
    CMPX('gd_knight', '가웨인', 'portraits/cmp_g_knight', '…가레스 단장님의 부관, 가웨인. 주군을 지키지 못한 칼이오. 이제 그대를 지키겠소.'),
    H({ bran: '가웨인 경…! 남아 계셨구려. 이번엔 함께 새벽까지 갑시다.', kael: '고맙다, 가웨인. 등을 맡기지.', sera: '고마워요, 가웨인 경. 함께 가요.',
        victor: '망령 기사 호위라. 보수는 안 받지? 좋아, 같이 가자.', lia: '…주군 지키는 칼이면 믿을 만하지. 따라와.',
        azel: '주군을 잃은 기사라. 나와 처지가 비슷하군. 가자.', isolde: '기사의 예를 받겠다. 함께 가자, 가웨인 경.', default: '고마워, 가웨인. 함께 가자.' }) ],
  cmp_join_gd_reaper: [
    CMPX('gd_reaper', '모르스', 'portraits/cmp_g_reaper', '(꼬마 사신이 제 키의 두 배나 되는 낫을 끌고 와 장부를 내민다. 첫 장이 비어 있다.)'),
    CMPX('gd_reaper', '모르스', 'portraits/cmp_g_reaper', '…장부지기 모르스. 주인이 없어졌어. 이제 뭘 적어?'),
    H({ bran: '그 장부에 무엇을 적을지는… 언젠가 내가 정하겠소.', lia: '아무것도 적지 마. 그게 제일 좋은 장부야.',
        kael: '적을 건 내가 정하지 않는다. 우선 따라와라.', sera: '살아 있는 사람 이름부터 적어 볼까요? 따라오렴.',
        victor: '외상 장부로 쓰면 딱이겠군. 따라와.', azel: '죽음의 장부라. 내 이름은 거기 없겠지. 따라와라.',
        isolde: '빈 장부라면 좋은 일만 적어라. 함께 가자.', default: '아무것도 안 적어도 돼. 따라와.' }) ],
  cmp_join_mt_boar:       [N('(바르그가 콧김을 뿜으며 엄니로 땅을 판다. 태워 주겠다는 뜻인 모양이다.)'), H('잘 부탁해, 바르그. 벽은 네가 맡아.')],
  cmp_join_mt_skelsteed:  [N('(머리 없는 기사를 태웠던 해골마가 푸른 불꽃 눈으로 이쪽을 본다. 새 주인을 고르는 눈이다.)'), H('주인은 머리를 잃었어도 너는 길을 잃지 않았구나. 가자, 코슈타.')],
  cmp_join_mt_wyvern:     [N('(갓 깨어난 진홍 비룡이 불씨 섞인 하품을 하고 손가락을 깨문다. 아프지 않다.)'), H('연구소의 알에서 태어났구나. 이번엔 실험체가 아니라 동료다, 스칼렛.')],
  cmp_join_gd_fairy:      [N('(밴시의 등불에서 풀려난 작은 요정이 머리카락에 매달려 반짝인다.)'), H('등불에서 나와서 다행이다, 아리아. 어둠 속 길은 네가 비춰 줘.')],
  cmp_join_gd_spiritwolf: [N('(별빛이 흐르는 푸른 늑대가 발치에 와서 앉는다. 묘지에서 울던 그 늑대다.)'), H('이제 울지 않아도 돼, 하티.')],
  cmp_join_gd_imp:        [N('(소악마가 계약서에 해골 지팡이로 서명하고, 금화 한 닢을 슬쩍 챙긴다.)'), H('…그 금화는 계약금으로 치지. 잘 부탁한다, 핌.')],
  cmp_join_gd_whelp:      [N('(새끼 본 드래곤이 갈비뼈 속 보랏빛 불을 깜박이며 발목에 몸을 감는다.)'), H('뼈만 남은 용의 아이라. 크론, 이번엔 살아서 자라라.')],
  cmp_join_gd_owl:        [N('(금서의 사슬에서 풀려난 올빼미가 어깨에 앉아 고개를 한 바퀴 돌린다.)'), H('사슬은 끝났다, 미네르바. 이제 보고 싶은 책만 봐.')],
  cmp_join_gd_clock:      [N('(금 간 도자기 얼굴의 태엽 인형 틱톡이 등의 열쇠를 돌리며 꾸벅 인사한다. 째깍, 째깍.)'), H('오토가 남긴 인형인가…. 시간을 벌어 준 사람의 것이라면, 이번엔 내가 지키지.')],
};
