// Dialogue of that night (1697): Eshville and the graveyard a hundred years ago. Shape: docs/v2/DATA_FORMAT.md section 3.
// Nobody here may be told what comes after this night — the bell covers such words (GDD 2.4 rule 6).

export const DIALOGS_PAST = {
  // ───────── 20–26 그 밤, 종탑 아래와 마을 ─────────
  'past.wake': [{ pages: [
    ['lotte', '아저씨도 하늘에서 떨어졌어요?'],
    ['kael', '…여기는.'],
    ['lotte', '에슈빌이죠. 저는 로테예요.\n여기 종지기고요.'],
    ['lotte', '여자애는 박쥐들이\n납골 언덕으로 물고 갔어요.'],
    ['kael', '납골 언덕. 어느 쪽이지.'],
    ['lotte', '묘지 맨 안쪽이요. 밤엔 문을 잠가요.\n열쇠는 대장간 아저씨한테 있어요.'],
  ] }],
  'lotte.fell': [
    { if: ['elise_home'], pages: [['lotte', '엘리제한테 전해 줘요.\n내일도 칠 거라고요. 약속!']] },
    { if: ['keepers_promised'], pages: [['lotte', '큰 종 앞에서 건너요.\n줄은 제가 잡고 있을게요.']] },
    { if: ['crossed'], once: true, pages: [
      ['lotte', '어, 아저씨! 사라졌다가 나타났죠?\n있잖아요, 종이 혼자 답했어요.'],
    ] },
    { if: ['crossed'], pages: [['lotte', '납골 언덕은 묘지 맨 안쪽이에요.\n노래가 들리면 귀를 막아요.']] },
    { if: ['key_entrusted', 'has:valkrein_knot'], pages: [['lotte', '큰 종은 저기예요. 그 조각,\n종 앞에서 울려 봐요.']] },
    { if: ['has:valkrein_knot'], pages: [
      ['lotte', '그 매듭, 에드문트 아저씨 솜씨죠?\n있잖아요, 그분 수프는 맛없어요.'],
    ] },
    { pages: [['lotte', '대장간은 큰길에 있어요. 주막 옆이요.\n있잖아요, 큰길은 조심해요!']] },
  ],
  'past.street': [{ pages: [
    ['kael', '(해골이 아니다. 갓 묻힌 주검이군.)'],
  ] }],
  'edmund.appears': [{ pages: [
    ['edmund', '채찍 소리가 나서 나와 봤더니.\n…솜씨가 낯익군, 젊은이.'],
    ['edmund', '안으로 들어와라.\n밤길에 빈속은 못쓴다.'],
  ] }],
  'villager.stall': [
    { once: true, pages: [
      ['stallkeeper', '수확이 코앞인데 역병이라니요….'],
      ['stallkeeper', '밤에는 주검이 일어나 걸어요.\n사냥꾼들이 와서 다행이지만….'],
    ] },
    { pages: [['stallkeeper', '순무라도 가져가요.\n돈은 됐어요….']] },
  ],
  'villager.plague': [
    { once: true, pages: [
      ['farmer', '검은 깃발 보이지?\n저 집은 다 앓아누웠구먼.'],
      ['farmer', '붉은 달이 뜨더니 이 모양이라니까.'],
    ] },
    { pages: [['farmer', '올해 밭은 다 틀렸구먼.']] },
  ],
  'rook.past': [
    { once: true, pages: [
      ['rook', '어서 옵쇼, 나리! 역병 도는 마을에서\n장사하는 놈은 저뿐입죠. 헤헤.'],
    ], then: [['setFlag', 'met_rook_past']] },
    { pages: [['rook', '백 년쯤 묵혀 둘 물건도 있습죠.\n농담입니다요, 헤헤.']] },
  ],

  // ───────── 26–33 주막과 대장간 ─────────
  'table.scene': [{ pages: [
    ['narrator', '작은 주막. 식탁에 수프 세 그릇,\n그리고 빈 의자 하나.'],
    ['edmund', '앉아라. 수프가 식는다.'],
    ['wolfram', '어이 대장, 길에서 또\n사람을 주워 왔네.'],
    ['edmund', '에드문트 발크레인이다.\n달이 지기 전에 성에 오른다.'],
    ['kael', '(…고조할아버지.)'],
    ['kael', '카엘입니다. 저는 백 년 뒤—'],
  ] }],
  // the bell covers the word (a sound step sits between the two sets — heard, not told)
  'table.bell': [{ pages: [
    ['edmund', '…방금 뭐라고 했나?\n종이 울려서.'],
    ['kael', '…아닙니다. 길손입니다.'],
  ] }],
  // second talk at the table: the knot and the blank notice
  'table.knot': [{ pages: [
    ['edmund', '그 손에 쥔 건 뭐지.'],
    ['kael', '종 조각입니다.\n떨어질 때 쥐고 있었습니다.'],
    ['edmund', '채찍 이리 다오. 끝에 묶어 주지.\n발크레인 매듭이다. 안 풀린다.'],
    ['wolfram', '길손이 채찍은 대장이랑 똑같이 쓰네.\n수상한데, 공고라도 붙일까?'],
    ['sign', '사람 찾음. 채찍 쓰는 길손.\n사례금 ( )'],
    ['edmund', '칸은 비워 둬라.\n돌아와서 채우지.', 'smile'],
    ['agnes', '돌아와서, 입니다. 꼭 그리하십시오.'],
  ] }],
  'edmund.tavern': [
    { if: ['bell_hung'], pages: [['edmund', '수프는 아직 따뜻하다, 젊은이.\n너도 식기 전에 돌아와라.', 'smile']] },
    { if: ['crossed'], pages: [['edmund', '아직 있었군, 젊은이.\n수프는 남겨 뒀다.', 'smile']] },
    { if: ['key_entrusted'], pages: [['edmund', '큰 종 앞에서 울려 봐라.\n종은 종끼리 답하지.']] },
    { pages: [['edmund', '열쇠는 하드윈에게 물어라.\n대장간은 바로 옆이다.']] },
  ],
  'smithy.entrust': [{ pages: [
    ['hadwin1', '묘지 문 열쇠? 허, 그건 못 내주오.\n묘지기와 나, 둘만 쥐는 열쇠라오.'],
    ['kael', '하나 더 벼려 주십시오.'],
    ['hadwin1', '벼릴 수야 있소. 헌데 날이 새야\n끝나오. 식히는 데도 한참이오.'],
    ['kael', '(날이 새면 늦는다.\n…백 년이면 넉넉하겠지.)'],
    ['kael', '맡겨 두겠습니다.\n쓸 사람은 백 년 뒤에 옵니다.'],
    ['hadwin1', '허, 농도 잘하시는구려. 좋소, 선불이오.\n쇠로 하겠소, 은으로 하겠소?'],
  ], choice: { options: [
    { label: '은 열쇠', icon: 'key_silver', line: '은은 백 년 뒤에도 그대로다', pages: [['hadwin1', '은이라. 값은 나가도\n녹은 안 스오.']], then: [['setFlag', 'key_order_silver']] },
    { label: '쇠 열쇠', icon: 'key_iron', line: '쇠는 백 년이면 녹슬어 굳는다', pages: [['hadwin1', '쇠가 튼튼하긴 하오.\n녹만 안 슬면 말이오.']], then: [['setFlag', 'key_order_iron']] },
  ] }, then: [['say', 'smithy.slip']] }],
  'smithy.slip': [{ pages: [
    ['hadwin1', '주문서에 이름을 적어야 하오.\n허, 백 년 뒤 이름을 어찌 알겠소.'],
    ['kael', '비워 두십시오.'],
  ] }],
  'hadwin1.smithy': [
    { if: ['crossed'], pages: [['hadwin1', '허, 또 오셨구려. 열쇠는 아직이오.\n식으려면 멀었소.']] },
    { pages: [['hadwin1', '허, 걱정 마시오. 벼려 두겠소.\n백 년이든 이백 년이든.']] },
  ],

  // ───────── 33–36 큰 종 ─────────
  'bell.past.no': [
    { if: ['!has:valkrein_knot'], pages: [
      ['narrator', '큰 종. 금이 없다.'],
      ['lotte', '종은 종지기만 쳐요.\n줄은 제 거예요.'],
    ] },
    { pages: [['kael', '(맡겨 둔 것이 없다.\n대장간이 먼저다.)']] },
  ],
  'bell.first': [{ pages: [
    ['lotte', '그 조각, 우리 종이랑\n소리가 같아요.'],
    ['lotte', '잠깐, 이거요. 빵이에요.\n배고프면 못 싸워요.'],
    ['kael', '…고맙다. 금방 다녀오마.'],
  ] }],

  // ───────── 45–58 그 밤의 묘지 ─────────
  'gate.past': [
    { if: ['past_gate_open'], pages: [['narrator', '묘지 문. 열려 있다.']] },
    { if: ['has:key_silver'], pages: [['narrator', '백 년 뒤의 열쇠가\n백 년 전의 자물쇠를 연다.']],
      then: [['unlockExit', 'to_graveyard', 'eshville_past'], ['setFlag', 'past_gate_open']] },
    { pages: [['kael', '(잠겼다. 열쇠는 대장간에\n있다고 했지.)']] },
  ],
  'keeper.greets': [
    { if: ['saw_ghosts'], pages: [
      ['keeper', '이 밤에 손님이 다 오시네요.\n문은 잠가 뒀는데, 용케 여셨지요.'],
      ['kael', '이름 없는 무덤 둘을 찾습니다.'],
      ['keeper', '오늘 묻은 남매 말씀이지요.\n석수가 역병이 무서워 달아났답니다.'],
      ['keeper', '이름은 제 장부에 있습니다.\n누나 한나, 동생 틸.'],
      ['keeper', '끌은 여기 있습니다. 저는 손이 떨려\n새기지를 못한답니다.'],
    ] },
    // the hero came here before seeing the ghosts tonight: he cannot ask for graves he does not know
    { pages: [
      ['keeper', '이 밤에 손님이 다 오시네요.\n문은 잠가 뒀는데, 용케 여셨지요.'],
      ['keeper', '오늘 묻은 남매의 비석이 비어 있습니다.\n석수가 역병이 무서워 달아났답니다.'],
      ['keeper', '이름은 제 장부에 있습니다.\n누나 한나, 동생 틸.'],
      ['keeper', '끌은 여기 있습니다. 저는 손이 떨려\n새기지를 못한답니다.'],
    ] },
  ],
  'keeper.graveyard': [
    { if: ['!names_known'], pages: [['keeper', '밤길이 어둡지요, 손님.']] },
    { ifAny: ['!carved_a', '!carved_b'], pages: [
      ['keeper', '누나 한나, 동생 틸이지요.\n비석은 안쪽에 나란히 있답니다.'],
    ] },
    { once: true, pages: [
      ['keeper', '고맙습니다, 손님. 이름이 있어야\n누가 찾아와도 찾지요.'],
      ['keeper', '꽃은 제가 놓아 두겠습니다.'],
    ] },
    { if: ['bell_hung'], pages: [['keeper', '길종을 거셨지요? 소리가 곱습니다.\n이제 밤길이 덜 무섭겠지요.']] },
    { pages: [['keeper', '납골당 쪽은 노랫소리가 난답니다.\n귀를 막고 가시지요.']] },
  ],
  'grave.carve.a': [
    { if: ['!names_known'], pages: [['kael', '(무슨 이름을 새길지 모른다.)']] },
    { if: ['!carved_a'], pages: [
      ['narrator', '새 비석에 작은 종 무늬가 있다.\n끌을 대고 이름을 새긴다.'],
    ], then: [['setFlag', 'carved_a'], ['setFlag', 'pending_change'], ['toast', '새겼다 — 한나', 'info'],
      ['if', ['carved_b'], [['prompt', null], ['if', ['has:road_bell'], [['objective', 'hang_bell']], [['objective', 'to_deep']]]]]] },   // (the road bell is not named before Edmund has handed it over)
    { pages: [['sign', '한나. 1697년.']] },
  ],
  'grave.carve.b': [
    { if: ['!names_known'], pages: [['kael', '(무슨 이름을 새길지 모른다.)']] },
    { if: ['!carved_b'], pages: [
      ['narrator', '끌을 대고 이름을 새긴다.'],
    ], then: [['setFlag', 'carved_b'], ['setFlag', 'pending_change'], ['toast', '새겼다 — 틸', 'info'],
      ['if', ['carved_a'], [['prompt', null], ['if', ['has:road_bell'], [['objective', 'hang_bell']], [['objective', 'to_deep']]]]]] },
    { pages: [['sign', '틸. 1697년. 한나의 동생.']] },
  ],

  // ───────── 58–68 묘지 깊은 곳 ─────────
  'door.ossuary.past': [
    { if: ['bell_hung'], pages: [['narrator', '길종이 걸려 있다.\n납골당에서 촛불빛이 샌다.']] },
    { if: ['has:road_bell'], pages: [['kael', '(문 왼쪽에 빈 종대가 서 있다.\n길종은 저기에 건다.)']] },
    { pages: [['narrator', '납골당 앞에서 돌길이 끊긴다.\n건너편에 빈 종대가 서 있다.']] },
  ],
  'grave.edmund': [{ pages: [
    ['edmund', '또 보는군, 젊은이.'],
    ['edmund', '성에 오르기 전에 인사드리러 왔지.\n비석이 셋. 넷째 자리는 내 몫이고.'],
    ['kael', '…….'],
    ['edmund', '그런 얼굴 마라. 발크레인은\n원래 가는 사람이다.', 'smile'],
    ['edmund', '길종이다. 누가 울면 누가 듣고\n달려오라고 거는 종이지.'],
    ['edmund', '건너편 종대가 비었더군. 네가 걸어라.\n고리에 채찍을 걸면 닿는다.'],
  ] }],
  // Elise beside the bell of 1697, after the rescue
  'elise.past': [{ pages: [
    ['elise', '언니 종은 금이 없어요.\n소리가 참 맑아요!', 'joy'],
  ] }],
  'grave.hang': [{ pages: [
    ['edmund', '잘 걸었다. 백 년은 가겠군.', 'smile'],
    ['kael', '돌아오십시오. 수프가 식습니다.'],
    ['edmund', '하, 제법이군. 그래, 식기 전에.', 'smile'],
  ] }],
};
