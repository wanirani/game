// Dialogue of tonight (1797): Eshville and the Graveyard of Mist. Shape: docs/v2/DATA_FORMAT.md section 3.
// A page is [who, text, mood?]; at most two lines of 30 characters. First matching variant wins.

export const DIALOGS_NOW = {
  // ───────── 0–5 마을 외곽 ─────────
  'open.moon': [{ pages: [
    ['narrator', '1797년. 발라키르 산기슭, 에슈빌.\n백 년 만에 달이 붉게 떴다.'],
    ['kael', '(붉은 달에 종이 울리면 간다.\n까닭은 아버지도 모르셨다.)'],
  ] }],
  'open.bell': [{ pages: [
    ['kael', '(종소리. 누가 아직 치고 있군.)'],
  ] }],

  // ───────── 5–12 큰길과 광장 ─────────
  'street.knock': [{ pages: [
    ['trapped', '거기 누구 없어요?\n문이 안 열려요!'],
  ] }],
  'trapped.freed': [
    { if: ['!fell'], once: true, pages: [
      ['trapped', '고마워요! 불이 번지는데\n문이 뒤틀려서….'],
      ['trapped', '성당에 종 치는 아이가 있어요.\n혼자예요. 어서 가 보세요!'],
    ] },
    { if: ['elise_home'], pages: [['trapped', '종소리가 달라졌어요.\n이제 숨이 좀 쉬어져요.']] },
    { if: ['!fell'], pages: [['trapped', '저는 괜찮아요. 어서 성당으로요!']] },
    { pages: [['trapped', '종 치던 아이는요?\n무사해야 할 텐데….']] },
  ],
  'marta.inn.now': [
    { if: ['!fell'], once: true, pages: [
      ['marta', '사냥꾼 양반이야? 하하!\n딱 맞춰 왔네.'],
      ['marta', '우리 조카 엘리제가 성당에 있어.\n종 줄을 안 놓겠대. 좀 봐 줘.'],
    ] },
    { if: ['!fell'], pages: [['marta', '성당은 광장 너머야. 부탁해!']] },
    { if: ['!elise_home'], once: true, pages: [
      ['marta', '엘리제가 안 보여!\n종탑에 같이 있었다며?'],
      ['kael', '데려오겠습니다. 약속했습니다.'],
      ['marta', '…믿을게. 저녁상은 세 벌\n차려 둘 거야.'],
    ] },
    { if: ['!elise_home'], pages: [['marta', '수프는 식어도 다시 데우면 돼.\n꼭 데려와.']] },
    { pages: [['marta', '하하! 수프 더 있어.\n한 그릇 더 해!']] },
  ],
  'sera.square.first': [{ pages: [
    ['sera', '이분 상처는 제가 볼게요.\n사냥꾼님은 성당으로 가세요.'],
    ['sera', '그 채찍, 발크레인 가문이시죠?\n종 치는 아이를 부탁드려요.'],
    ['kael', '그러겠습니다.'],
  ] }],
  'sera.square.now': [
    { if: ['!fell'], pages: [['sera', '붕대가 모자라네요. 그래도 괜찮아요.\n빛이 함께하기를.']] },
    { if: ['!elise_home'], once: true, pages: [
      ['sera', '종에 금이 갔다고 들었어요.\n엘리제는요?'],
      ['kael', '납골 언덕으로 끌려갔습니다.\n찾으러 갑니다.'],
      ['sera', '이분을 옮기고 따라갈게요.\n등불이 쓸모 있을 거예요.', 'resolve'],
    ], then: [['setFlag', 'sera_follows']] },
    { if: ['!elise_home', 'sera_follows'], pages: [['sera', '먼저 가세요. 곧 따라갈게요.']] },
    { pages: [['sera', '종소리가 수녀원까지 닿았을 거예요.\n다음은 제가 나설 차례네요.', 'resolve']] },
  ],
  'wounded.square': [
    { once: true, pages: [
      ['wounded', '뼈다귀들이… 우물에서 올라왔습니다.'],
      ['wounded', '수녀님이 아니었으면 죽었습니다.'],
    ] },
    { pages: [['wounded', '…살아 있습니다. 덕분입니다.']] },
  ],
  'rook.now': [
    { if: ['!fell'], once: true, pages: [
      ['rook', '어서 옵쇼, 나리! 불난 마을에서\n장사하는 놈은 저뿐입죠. 헤헤.'],
    ] },
    { if: ['met_rook_past'], once: true, pages: [
      ['rook', '나리, 어디서 뵌 적이 있습죠?\n아주 오래전에…. 헤헤.'],
      ['kael', '(…같은 가면이다.)'],
    ] },
    { pages: [['rook', '필요한 게 있으면 말씀만 하십쇼.\n헤헤.']] },
  ],
  'rook.shop': [{ pages: [
    ['rook', '짐을 아직 못 풀었습죠.\n다음에 들러 주십쇼. 헤헤.'],
  ] }],
  'sign.well': [
    { if: ['era:past'], pages: [['sign', '역병. 물은 끓여서 마실 것.']] },
    { pages: [['narrator', '우물. 두레박 줄이 타서 끊겼다.']] },
  ],
  'door.inn': [
    // Edmund comes to the door only when the street is safe (actor `when: street_clear`): say so at the door
    { if: ['era:past', '!street_clear'], pages: [
      ['narrator', '작은 주막. 안에서 문을 걸어 잠갔다.'],
      ['kael', '(큰길의 주검부터 쓰러뜨려야 열겠군.)'],
    ] },
    { if: ['era:past'], pages: [['narrator', '작은 주막. 문틈으로\n수프 냄새가 샌다.']] },
    { if: ['elise_home'], pages: [['narrator', '흑묘 여관. 안에서 웃음소리가 샌다.']] },
    { pages: [['narrator', '흑묘 여관. 안에서 문을 걸어 잠갔다.']] },
  ],

  // ───────── 12–15 성당 ─────────
  'church.meet': [{ pages: [
    ['alberto', '종소리를 듣고 왔나.\n…그 채찍, 발크레인이로군.'],
    ['kael', '카엘 발크레인입니다.\n종은 누가 칩니까.'],
    ['elise', '저요! 엘리제예요.\n제가 에슈빌의 종지기예요!'],
    ['elise', '종탑에 박쥐가 잔뜩이에요.\n그래도 줄은 제가 잡아야 해요!'],
    ['kael', '줄은 네가 잡아라.\n너는 내가 지키마.'],
    ['elise', '정말요? 그럼 약속!', 'joy'],
    ['kael', '…약속.'],
  ] }],
  'alberto.church': [
    { if: ['!promise'], pages: [['alberto', '어서 오게. 종이 자네를 불렀네.']] },
    { if: ['!fell'], once: true, pages: [
      ['alberto', '아이는 벌써 종탑으로 올라갔네.\n문은 성당 옆에 있다네.'],
      ['alberto', '종이 멎으면 마을도 멎는다네.\n저 아이를 부탁하네.'],
    ] },
    { if: ['!fell'], pages: [['alberto', '두려워 말게. 촛불은 작아도,\n밤을 이긴 적이 여러 번 있다네.']] },
    { if: ['!got_key'], pages: [['alberto', '대장간에는 들렀나?\n하드윈이 기다린다네.']] },
    { if: ['!elise_home'], pages: [['alberto', '연대기의 빈칸은 자네 몫일세.\n촛불을 잊지 말게.']] },
    { pages: [['alberto', '허허. 종소리가 맑아졌군.\n자네 덕일세.']] },
  ],
  'elise.promise': [
    { if: ['!promise'], pages: [['elise', '종은 제가 지켜요!']] },
    { if: ['elise_home'], once: true, pages: [
      ['elise', '아저씨! 로테 언니가 종으로\n답했어요. 들었어요?', 'joy'],
    ] },
    { pages: [
      ['elise', '종 편지 왔어요! 로테 언니가 그러는데,\n수녀원 가는 다리가 그 밤엔 성했대요.'],
    ] },
  ],
  'bell.now.before': [{ pages: [
    ['narrator', '큰 종. 박쥐 떼가\n종탑 위를 맴돈다.'],
  ] }],

  // ───────── 33–36 오늘 밤으로 ─────────
  'return.first': [{ pages: [
    ['alberto', '자네, 방금 어디서 나왔나.\n종이 혼자 울더군.'],
    ['kael', '백 년 전입니다. 엘리제도\n거기 있습니다. 데려오겠습니다.'],
    ['alberto', '백 년 전이라…. 믿네.\n종이 그리 울었으니.'],
    ['alberto', '이 연대기에는 빈칸이 많다네.\n자네가 채워 주게.'],
    ['alberto', '대장간에 가 보게. 하드윈이\n아까부터 서랍을 뒤지고 있다네.'],
  ] }],
  'hadwin.smithy.now': [
    { if: ['!fell'], pages: [['hadwin', '…불부터 끄시오.\n벼릴 건 그다음이오.']] },
    { if: ['key_entrusted', '!got_key', 'key_order_silver'], pages: [
      ['hadwin', '…당신이오? 채찍 든 길손이.'],
      ['hadwin', '할아버지 때부터 내려온 건데,\n이름 칸이 비어 있소. 선불이랍디다.'],
      ['narrator', '서랍에서 낡은 은 열쇠와\n누렇게 바랜 주문서가 나온다.'],
      ['kael', '이름 칸에는 카엘이라고\n적어 주십시오.'],
      ['hadwin', '…적었소. 백 년 만에 닫는 장부요.'],
    ], then: [['give', 'key_silver'], ['give', 'order_slip'], ['setFlag', 'got_key'], ['chronicle', 'graveyard_key'], ['objective', 'open_gate']] },
    { if: ['key_entrusted', '!got_key', 'key_order_iron'], pages: [
      ['hadwin', '…당신이오? 채찍 든 길손이.'],
      ['hadwin', '할아버지 때부터 내려온 건데,\n이름 칸이 비어 있소. 선불이랍디다.'],
      ['narrator', '서랍에서 붉게 녹슨 쇳덩이가 나온다.\n열쇠였던 것이다.'],
      ['hadwin', '…쇠는 백 년을 못 버티오.\n헌데 밑에 하나가 더 있소.'],
      ['sign', '혹시 몰라 은으로 하나 더 벼려 둠.\n값은 받았음. — 하드윈'],
      ['kael', '이름 칸에는 카엘이라고\n적어 주십시오.'],
      ['hadwin', '…적었소. 백 년 만에 닫는 장부요.'],
    ], then: [['give', 'key_rust'], ['give', 'key_silver'], ['give', 'order_slip'], ['setFlag', 'got_key'], ['chronicle', 'graveyard_key'], ['objective', 'open_gate']] },
    { pages: [['hadwin', '…그 채찍, 손잡이가 닳았소.\n다음에 맡기시오.']] },
  ],

  // ───────── 36–45 묘지 가는 길 ─────────
  'gate.now': [
    { if: ['gate_open'], pages: [['narrator', '묘지 문. 열려 있다.']] },
    { if: ['has:key_silver'], pages: [['narrator', '은 열쇠를 돌린다.\n백 년 묵은 자물쇠가 열린다.']],
      then: [['unlockExit', 'to_graveyard', 'eshville_now'], ['setFlag', 'gate_open'], ['objective', 'find_ossuary']] },
    { if: ['fell'], pages: [['kael', '(잠겼다. 열쇠는 대장간에\n맡겨 두었지.)']] },
    { pages: [['kael', '(묘지 문. 잠겨 있다.)']] },
  ],
  'elite.gate': [{ pages: [
    ['kael', '(빈 갑옷이 걷는다.\n앞은 단단하겠군.)'],
  ] }],
  'echo.hint': [{ pages: [
    ['kael', '(우는 소리. …보이지 않는다.)'],
  ] }],

  // ───────── 45–58 안개의 묘지 ─────────
  'grave.now.a': [
    { if: ['!carved_a'], pages: [
      ['ghost_hanna', '…이름…. 제 이름이… 없어요….'],
      ['narrator', '비석에는 번호뿐이다. 유령이\n납골당 가는 샛길에 서 있다.'],
      ['kael', '(이름을 새길 수 있는 건 그 밤이다.)'],
    ], then: [['if', ['!saw_ghosts'], [['setFlag', 'saw_ghosts'], ['objective', 'to_past_graves']]]] },   // (the objective is set by whichever of the two graves and the door speaks first - once)
    { once: true, pages: [
      ['sign', '한나. 1697년.'],
      ['narrator', '이끼 낀 비석 앞에\n마른 꽃 한 송이가 놓여 있다.'],
      ['hanna', '한나…. 맞아요, 제 이름이에요.\n고마워요, 길손.'],
    ], then: [['setFlag', 'saw_names'], ['if', ['carved_b'], [['chronicle', 'nameless_graves']]]] },
    { pages: [['sign', '한나. 1697년.']] },
  ],
  'grave.now.b': [
    { if: ['!carved_b'], pages: [
      ['ghost_til', '…누나…? 누나 어딨어….'],
      ['kael', '(번호뿐인 비석이 하나 더.)'],
    ], then: [['if', ['!saw_ghosts'], [['setFlag', 'saw_ghosts'], ['objective', 'to_past_graves']]]] },
    { once: true, pages: [
      ['sign', '틸. 1697년. 한나의 동생.'],
      ['til', '나 틸이야! 누나, 나 틸이래!'],
      ['hanna', '응, 틸. 길손 가는 것만 보고 가자.'],
    ], then: [['setFlag', 'saw_names'], ['if', ['carved_a'], [['chronicle', 'nameless_graves']]]] },
    { pages: [['sign', '틸. 1697년. 한나의 동생.']] },
  ],
  'stones': [
    { if: ['era:past'], once: true, pages: [
      ['narrator', '발크레인의 비석 셋.\n넷째 자리에는 풀만 자라 있다.'],
      ['kael', '(비어 있다. …아직은.)'],
    ] },
    { if: ['era:past'], pages: [['narrator', '발크레인의 비석 셋.']] },
    { once: true, pages: [
      ['narrator', '발크레인의 비석 넷.\n붉은 달마다 하나씩 늘었다.'],
      ['sign', '에드문트 발크레인.\n1697년, 넷째 붉은 달.'],
      ['narrator', '그 아래 한 줄이 끌로 깎여 있다.'],
      ['kael', '고조할아버지. 다녀가겠습니다.\n…이 줄은 누가 깎았습니까.'],
    ], then: [['setFlag', 'saw_stones']] },
    { if: ['bell_hung'], once: true, pages: [
      ['sign', '에드문트 발크레인.\n1697년, 넷째 붉은 달.'],
      ['kael', '(식기 전에, 라고 하셨지.)'],
    ] },
    { if: ['met_edmund', '!bell_hung'], once: true, pages: [
      ['sign', '에드문트 발크레인.\n1697년, 넷째 붉은 달.'],
      ['kael', '(수프가 식는다고 하셨지.)'],
    ] },
    { pages: [['sign', '에드문트 발크레인.\n1697년, 넷째 붉은 달.']] },
  ],
  'door.ossuary.now': [
    { once: true, ifAny: ['!carved_a', '!carved_b'], pages: [
      ['narrator', '이름 없는 유령 둘이\n문 앞을 막아선다.'],
      ['kael', '(베어도 다시 선다.\n…이름을 찾는 거군.)'],
    ], then: [['if', ['!saw_ghosts'], [['setFlag', 'saw_ghosts'], ['objective', 'to_past_graves']]]] },
    // said once (at the threshold or at the door's prompt, whichever comes first): after that one short line, and nothing is set again
    { ifAny: ['!carved_a', '!carved_b'], pages: [
      ['kael', '(유령 둘이 문 앞을 지킨다.\n그 밤에서 이름을 찾아 준다.)'],
    ] },
    { if: ['!bell_hung'], pages: [
      ['narrator', '유령은 비켜선다. 하지만\n문 앞 돌길이 끊겨 있다.'],
      ['kael', '(건너편 종대가 비어 있다.\n그 밤이라면 걸 수 있겠군.)'],
    ], then: [['if', ['has:road_bell'], [['objective', 'hang_bell']], [['objective', 'to_post']]]] },   // (the road bell is named only once Edmund has handed it over)
    { if: ['!ossuary_open'], pages: [
      ['hanna', '안에서 배웅하는 노래가 들려요.\n따라 부르면 안 돼요.'],
      ['kael', '고맙다. 조심하마.'],
    ], then: [['unlockExit', 'to_ossuary', 'graveyard_now'], ['setFlag', 'ossuary_open'], ['objective', 'enter_ossuary']] },
    { pages: [['narrator', '배웅의 납골당. 문이 열려 있다.']] },
  ],

  // ───────── 다시 일어설 때 ─────────
  'retry.line': [
    { if: ['era:past', '!elise_found'], pages: [['lotte', '아저씨! 종 쳤어요, 들려요?\n일어나요!']] },
    { if: ['elise_found'], pages: [['elise', '아저씨, 제가 종 칠게요.\n다시 가요!']] },
    { if: ['fell'], pages: [['alberto', '종은 내가 치고 있네.\n천천히, 다시 가게.']] },
    { if: ['!promise'], pages: [['kael', '(종소리가 멎지 않았다. 다시 간다.)']] },
    { pages: [['alberto', '촛불은 다시 켜면 되네.\n일어서게.']] },
  ],
  'retry.again': [
    { if: ['era:past', '!elise_found'], pages: [['lotte', '있잖아요, 서두르지 마요.\n밤은 길어요.']] },
    { if: ['elise_found'], pages: [['elise', '괜찮아요. 종은 안 멎어요!']] },
    { if: ['!promise'], pages: [['kael', '(서두르지 마라. 밤은 길다.)']] },
    { pages: [['alberto', '허허, 서두를 것 없네.\n밤은 아직 길다네.']] },
  ],
  'retry.boss': [
    { if: ['sera_lamp'], pages: [['sera', '사냥꾼님, 노래를 듣지 마세요!\n조종부터 울려요!', 'resolve']] },
    { pages: [['kael', '(노래를 듣지 마라. 조종부터다.)']] },
  ],
};
