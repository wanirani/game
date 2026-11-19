// Dialogue of the bell tower, the Ossuary of Farewell, the banshee queen and the ending.

export const DIALOGS_DUNGEON = {
  // ───────── 15–20 종탑 ─────────
  'tower.door': [{ pages: [
    ['kael', '(종탑 문. 종소리는 저 위에서 난다.)'],
  ] }],
  'tower.enter': [{ pages: [
    ['elise', '아저씨, 위예요! 여기예요!'],
  ] }],
  'tower.top': [{ pages: [
    ['elise', '박쥐가 종을 자꾸 들이받아요!\n줄을 놓으면 종이 멎어요!'],
    ['kael', '줄만 잡고 있어라.\n박쥐는 내가 맡는다.'],
  ] }],
  'tower.crack': [
    // in the tower the camera shows it (shots bell_crack, fall): two spoken lines only
    { if: ['area:belltower_now'], pages: [
      ['elise', '종이…! 아저씨, 소리가 이상해요!'],
      ['kael', '엘리제, 손!'],
    ] },
    // while the tower is not built the scene is told (bridge)
    { pages: [
      ['narrator', '박쥐 떼가 한 덩어리로\n종을 들이받는다.'],
      ['elise', '종이…! 아저씨, 소리가 이상해요!'],
      ['narrator', '금 사이로 종소리가 샌다.\n발밑이 꺼진다.'],
      ['kael', '엘리제, 손!'],
      ['narrator', '산 위로 은빛 별똥 하나가 떨어진다.'],
    ] },
  ],

  // ───────── 68–82 납골당 앞 절반 ─────────
  'oss.enter': [{ pages: [
    ['kael', '(노랫소리. 안쪽이다.)'],
  ] }],
  'oss.coffins': [{ pages: [
    ['narrator', '복도가 관으로 막혀 있다.\n백 년 치다.'],
    ['kael', '(그 밤에는 비어 있었겠지.)'],
  ] }],
  'oss.past.first': [{ pages: [
    ['kael', '(같은 방이다. 백 년 전의.)'],
  ] }],
  'oss.wedge': [
    { if: ['wedge_stone'], pages: [['narrator', '석상이 틈에 서 있다.']] },
    { pages: [
      ['narrator', '바닥이 갈라진 틈 앞에\n작은 종 무늬가 있다.'],
      ['kael', '(무엇을 밀어 둘까.)'],
    ], choice: { options: [
      { label: '석상', icon: 'statue', line: '돌은 백 년 뒤에도 그대로다', pages: [['narrator', '석상을 틈에 밀어 둔다.']],
        then: [['setFlag', 'wedge_stone'], ['clearFlag', 'wedge_wood'], ['setFlag', 'pending_change']] },
      { label: '나무 상자', icon: 'crate', line: '나무는 백 년이면 삭아 없어진다', pages: [['narrator', '나무 상자를 틈에 밀어 둔다.']],
        then: [['setFlag', 'wedge_wood'], ['setFlag', 'pending_change']] },
    ] } },
  ],
  'oss.gap': [
    { if: ['wedge_stone'], once: true, pages: [['narrator', '석상이 백 년째 틈에 서 있다.\n딛고 건넌다.']] },
    { if: ['wedge_stone'], pages: [['narrator', '석상이 틈에 서 있다.']] },
    { if: ['wedge_wood'], pages: [
      ['narrator', '틈에는 나무 부스러기뿐이다.'],
      ['kael', '(나무는 백 년을 못 버틴다. 돌이다.)'],
    ] },
    { pages: [
      ['narrator', '바닥이 갈라져 있다.\n디딜 것이 없다.'],
      ['kael', '(그 밤에 뭔가 밀어 둘 수 있겠군.)'],
    ] },
  ],

  // ───────── 82–100 납골당 뒤 절반 ─────────
  'sera.ossuary': [
    { once: true, pages: [
      ['sera', '사냥꾼님! 다친 분을 옮기고\n샛길로 먼저 와 있었어요.'],
      ['sera', '등불대는 제가 맡을게요.\n빛 안에서는 유령이 굳어요.', 'resolve'],
      ['kael', '부탁합니다.'],
    ], then: [['setFlag', 'sera_lamp'], ['prompt', 'call']] },
    { pages: [['sera', '부르면 달려갈게요.\n빛이 함께하기를.']] },
  ],
  'oss.riddle': [
    { if: ['riddle_done'], pages: [['sign', '곡하는 이 프리다.\n떠나는 이를 노래로 배웅했다.']] },
    { pages: [
      ['narrator', '석관 셋. 글씨가 닳아\n읽을 수 없다.'],
      ['kael', '(그 밤에는 읽을 수 있었겠지.)'],
    ], then: [['setFlag', 'at_riddle'], ['prompt', 'echo']] },
  ],
  'oss.riddle.echo': [{ pages: [
    ['narrator', '메아리 창에 그 밤의\n석관이 비친다.'],
    ['sign', '곡하는 이 프리다.\n떠나는 이를 노래로 배웅했다.'],
    ['kael', '(배웅하던 사람. 노래의 주인이군.)'],
    ['narrator', '그 밤의 석관 곁에 작은 종 넷이\n놓여 있다. 조종이다.'],
  ] }],
  // the knells are picked up that night (what is left in the past must come from the past — GDD 2.4 rule 3)
  'oss.knell.take': [{ pages: [
    ['narrator', '석관 곁의 조종 넷을 챙긴다.'],
  ] }],
  'oss.knells.done': [{ pages: [
    ['kael', '(넷 다 걸었다.\n백 년 뒤에 울릴 종이다.)'],
  ] }],

  // ───────── 100–104 보스 방 앞 ─────────
  'oss.rest': [{ pages: [
    ['narrator', '문틈으로 노랫소리가 샌다.'],
    ['narrator', '로테가 준 빵을 먹는다.\n딱딱하고, 조금 달다.'],
  ] }],

  // ───────── 104–114 밴시 여왕 ─────────
  'boss.intro': [{ pages: [
    ['banshee_queen', '…또 발크레인이구나.'],
    ['banshee_queen', '붉은 달마다 하나씩 이 묘지에\n묻혔지. 나는 노래로 배웅했단다.'],
    ['banshee_queen', '백 년마다 또 하나가 온다.\n그래서 노래가 끝나지 않는구나.'],
    ['kael', '아이는 어디 있지.'],
    ['banshee_queen', '…잠들었다. 내 노래 안에서는\n아무도 떠나지 않는단다.'],
    ['kael', '그건 배웅이 아니다. 붙드는 거지.'],
  ] }],
  'boss.flee': [{ pages: [
    ['banshee_queen', '…그 밤이 좋았단다. 넷째 발크레인이\n아직 살아 있던 밤.'],
  ] }],
  // the bell of the last hall in 1697, before the queen has fled through it (interact event bell.sealed)
  'bell.sealed': [{ pages: [
    ['kael', '(종이 답하지 않는다. 저쪽 방은\n노래로 가득 차 있다.)'],
    ['kael', '(석관의 방 종으로 돌아가\n문으로 들어간다.)'],
  ] }],
  // tonight's bell of the last hall while the queen is in her first act (event bell.held): she holds it, nobody leaves that way
  'bell.held': [{ pages: [
    ['kael', '(종이 답하지 않는다.\n여왕의 노래가 종을 붙들고 있다.)'],
  ] }],
  'boss.past': [{ pages: [
    ['narrator', '그 밤의 예배실. 제단 아래\n엘리제가 잠들어 있다.'],
    ['kael', '엘리제! 조금만 기다려라.'],
  ] }],
  'boss.driven': [{ pages: [
    ['banshee_queen', '…이 밤은 건드리지 마라!'],
  ] }],
  'boss.sent': [{ pages: [
    ['banshee_queen', '…이번 발크레인은 배웅이 아니라\n마중이구나.'],
    ['banshee_queen', '…잘 가라는 말, 나도\n듣고 싶었단다.'],
    ['kael', '잘 가십시오.\n이번 배웅은 제가 합니다.'],
  ] }],
  'lia.warn': [{ pages: [
    ['lia', '발크레인.\n그 늙은 신부를 조심해.'],
    ['kael', '누구냐.'],
    ['narrator', '대답은 없다. 까마귀 깃털 하나가\n발치에 떨어진다.'],
  ] }],
  // the sleeping girl under the altar of 1697 (her talk key, and the spot beside her): she wakes only when the queen has been sent
  'elise.asleep': [
    { if: ['queen_sent', '!elise_found'], pages: [
      ['elise', '…아저씨? 저 꿈꿨어요. 누가 자꾸\n가지 말라고 노래했어요.'],
      ['kael', '끝났다. 약속했잖아.\n집에 가자, 엘리제.'],
      ['elise', '네! …근데 여기 종소리가 달라요.\n금 간 소리가 안 나요.', 'joy'],
    ], then: [['setFlag', 'elise_found'], ['objective', 'to_lotte'], ['gotoArea', 'eshville_past', 'keepers']] },   // (spawn `keepers`: left of the bell, out of the two keepers' picture)
    { pages: [['kael', '(깊이 잠들었다.\n노래가 아직 붙들고 있다.)']] },
  ],

  // ───────── 114–118 그 밤의 종탑 ─────────
  'keepers.found': [{ pages: [
    ['lotte', '찾았네요! 그 애예요?'],
  ] }],
  'keepers.promise': [{ pages: [
    ['elise', '엘리제예요! 언니가\n여기 종지기예요?'],
    ['lotte', '응, 로테야. …너, 손에\n종 줄 자국이 있네.'],
    ['lotte', '있잖아, 내가 치면 네가 답해.\n약속!'],
    ['elise', '약속!', 'joy'],
    ['lotte', '아저씨도요. 길을 모르겠으면\n종으로 물어요. 종으로 답할게요.'],
  ] }],
  // at the bell, just before the last crossing home
  'ending.bread': [{ pages: [
    ['lotte', '참, 빵은 맛있었어요?'],
    ['kael', '…달았다.'],
    ['lotte', '거짓말. 그거 딱딱하기만 한데.'],
  ] }],

  // ───────── 118–120 오늘 밤의 에슈빌 ─────────
  'ending.bell': [{ pages: [
    ['narrator', '그 밤에서 로테가 종을 친다.\n오늘 밤, 엘리제가 답한다.'],
  ] }],
  'ending.town': [{ pages: [
    ['marta', '엘리제! 이 녀석,\n어디 갔다 이제 와!'],
    ['elise', '이모! 저 백 년 전에 다녀왔어요!\n로테 언니도 만났어요!', 'joy'],
    ['marta', '하하, 그래그래. 수프 식겠다, 가자.\n저녁상은 세 벌이야. 사냥꾼 양반도 와!'],   // (she has come up to the bell: nobody is told to sit down here - she scolds, she feeds, she is glad; "세 벌" is her own promise at the inn)
    ['alberto', '…로테? 방금 로테라고 했나.'],
    ['alberto', '…아닐세. 오래된 이름이라서.'],
  ] }],
  // the narrator's last line, over the inn's lit window (camera inn_window): the hook for what comes after this chapter
  'ending.feather': [{ pages: [
    ['narrator', '여관 창가에도 까마귀 깃털 하나가\n놓여 있다.'],
  ] }],
};
