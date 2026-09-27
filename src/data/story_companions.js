// 동료 스토리 스크립트 — owner: CMP-TOWN (companions §13; 이름·id 는 MASTER_PLAN §1.2 기준)
// data/story.js 끝에서 SCRIPTS 에 합쳐진다 (Object.assign(SCRIPTS, COMPANION_SCRIPTS, SCRIPTS_P2)).
// story.js 를 import 하지 않는다 (순환 금지). 형식은 data/story.js 상단 주석과 같다.
//
//  cmp_stable_open    허브 첫 방문 (1장 이상, flags.stable_open 없음) — companionHubEnter 가 재생, 끝에서 stable_open → 그림메인 합류
//                     (허브 훅이 아직 없으면 영혼의 마구간 장면이 들어올 때 대신 재생한다)
//  cmp_bat_arrive     유물 5개 → 녹티스 합류 연출 앞 (companionHubEnter)
//  cmp_slot2          8장 이상 첫 허브 방문 → 수호신 2번 칸 (companionHubEnter)
//  cmp_egg_ready      마구간에 들어왔을 때 부화할 수 있는 알이 있으면 그레타의 첫마디 (StableScene)
//  npc_greta_*        허브에서 그레타에게 말을 걸 때 (resolveNpcScript: _ch<N> → _default · _tip<N> 순환)
//  q_cq_*_start/done  그레타의 의뢰를 받거나 마쳤을 때 (StableScene · 의뢰 게시판)
// 화자: G = 그레타(npc_greta), H = 지금 영웅, N = 내레이션.

const G = 'npc_greta';
const N = (text) => ({ who: 'narrator', text });
const H = (text) => ({ who: 'hero', text });
const S = (text) => ({ who: G, text });
const se = (id) => ({ cmd: 'sfx', id });
const flag = (key, value = true) => ({ cmd: 'flag', key, value });

export const COMPANION_SCRIPTS = {
  // ── 영혼의 마구간 개장 (1장 클리어 뒤 첫 허브 방문) ──
  cmp_stable_open: [
    N('동쪽 성문 밖, 불에 그을린 마구간에 등불이 켜져 있다.'),
    S('거기, 헌터. 잠깐 이리 와 봐.'),
    H({ default: '…누구시죠?', kael: '…누구지?', bran: '무슨 일이오?', lia: '…뭐야?' }),
    S('그레타. 불타 버린 외곽 목장 주인이었지. 이젠 성문 밖 이 낡은 마구간이 전부야.'),
    S('그날 밤 마구간이 통째로 불탔어. 끝까지 버틴 건 이 녀석 하나뿐이었지.'),
    se('neigh'),
    N('어둠 속에서 붉은 갈기를 늘어뜨린 흑마가 콧김을 내뿜는다. 눈동자 속에 꺼지지 않은 불씨가 일렁인다.'),
    S('그림메인. 저 성으로 가는 길이라면 두 다리보다 네 다리가 빠를 거야. 데려가.'),
    S('돌려줄 땐 살아서 돌려줘. 너도, 이 녀석도.'),
    flag('stable_open'),
  ],

  // ── 그레타 (허브 대화) ──
  npc_greta_default: [S('말이든 영혼이든, 먼저 믿어 줘야 너를 믿어. 공물은 그 첫걸음이지.')],
  npc_greta_tip1: [S('공물은 언제 바쳐도 녀석들이 자라. 그래도 마음이 깊어지는 건 스테이지를 한 번 다녀올 때마다 한 번뿐이야.')],
  npc_greta_tip2: [S('보스에게서 얻은 알은 스테이지를 하나 더 다녀오면 깨어나. 그동안은 내가 따뜻하게 품고 있을게.')],
  npc_greta_ch2: [
    S('밴시의 등불에서 요정을 꺼내 줬다며? 그 녀석, 너한테 푹 빠졌던데.'),
    S('묘지 쪽에서 푸른 늑대가 울어. 시간 나면 들러 줘.'),
  ],
  npc_greta_ch4: [S('북쪽 설원에서 늑대 왕의 울음이 들려. 녀석은 강한 자만 태워. 힘을 증명해 봐.')],
  npc_greta_ch5: [S('그 알… 아직 따뜻해. 스테이지 하나만 더 다녀와. 그때쯤이면 깨어날 거야.')],
  npc_greta_ch8: [S('제단을 넓혀 뒀어. 이제 수호신 둘을 함께 모실 수 있을 거야. 둘이 싸우지만 않는다면.')],
  npc_greta_ch11: [S('요즘 녀석들이 밤마다 성 쪽을 보고 울어. 끝이 가까워졌다는 걸 아는 거지.')],
  npc_greta_ch14: [S('하늘이 갈라진 뒤로 녀석들이 잠을 못 자. 균열 너머에서 누가 부르는 것 같대. …데려가 줘. 혼자 두는 것보다 나아.')],

  // ── 그레타의 의뢰 (quests: cq_hati, cq_skoll) ──
  q_cq_hati_start: [S('안개 묘지에서 푸른 늑대 영혼이 울고 있어. 원혼과 도깨비불이 그 녀석을 괴롭히는 거야. 열다섯만 쫓아내 줘.')],
  q_cq_hati_done: [S('들려? 울음이 그쳤어. …봐, 벌써 네 발치에 와 있잖아.')],
  q_cq_skoll_start: [S('늑대 왕 스콜은 약한 주인을 태우지 않아. 늑대 스무 마리를 쓰러뜨리고 돌아와. 굶주린 늑대든, 설원 늑대든, 지옥견이든.')],
  q_cq_skoll_done: [S('서리 냄새가 나… 왔구나. 스콜이 너를 인정했어.')],

  // ── 알 · 녹티스 · 수호신 2번 칸 ──
  cmp_egg_ready: [S('알에 금이 가기 시작했어! 어서 제단으로!')],
  cmp_bat_arrive: [
    se('screech'),
    N('마구간 지붕 위에 거대한 그림자가 거꾸로 매달려 있다.'),
    S('저 박쥐… 유물의 피 냄새를 따라온 거야. 백작의 옛 권속, 녹티스.'),
    S('이상하지. 너한테 고개를 숙이네.'),
  ],
  cmp_slot2: [S('제단을 넓혀 뒀어. 이제 수호신 둘을 함께 모실 수 있어.')],
};
