// Screen text that is not dialogue: tutorial prompts, banners, area names of places not built yet, system lines.
// Shape: docs/v2/DATA_FORMAT.md sections 4 (prompt step) and 7.

export const TEXT = {
  // night labels (the HUD shows them in the corner; banner kind 'night')
  night: { now: '1797 · 오늘 밤', past: '1697 · 그 밤', changed: '오늘 밤이 달라졌다' },

  // chapter strips: banner('area', title, sub)
  chapters: {
    prologue: { title: '서막 — 금 간 종', sub: '붉은 달이 뜨는 밤' },
    ch1: { title: '1장 — 백 년 전의 식탁', sub: '그 밤의 사람들' },
    ch2: { title: '2장 — 안개의 묘지', sub: '열쇠와 이름과 길종' },
    ch3: { title: '3장 — 배웅하는 노래', sub: '배웅의 납골당' },
    end: { title: '달이 한 칸 기울었다', sub: '종소리가 한 겹 더 멀리 닿는다' },
  },

  // place names and one-line subtitles. Built areas already carry `name` (WORLD); the subtitle is ours.
  areas: {
    eshville_now: { name: '에슈빌', sub: '불타는 마을' },
    eshville_past: { name: '에슈빌', sub: '수확을 앞둔 마을' },
    graveyard_now: { name: '안개의 묘지', sub: '안개와 유령' },
    graveyard_past: { name: '안개의 묘지', sub: '묘지기가 사는 묘지' },
    belltower_now: { name: '종탑', sub: '박쥐 떼가 종을 노린다' },
    belltower_past: { name: '종탑', sub: '금 없는 종' },
    ossuary_now: { name: '배웅의 납골당', sub: '백 년 치 관이 쌓인 굴' },
    ossuary_past: { name: '배웅의 납골당', sub: '촛불 켠 예배실' },
  },
  // section labels for the areas WORLD has not built yet (ids are the ones STORY expects — DATA_FORMAT section 12)
  sections: {
    belltower: { stairs: '종탑 계단', top: '종 아래' },
    ossuary: {
      entry: '납골당 어귀', coffins: '관의 복도', wedge: '틈의 방', arena: '곡하는 방',
      lamp: '등불대의 방', riddle: '석관의 방', posts: '종대의 회랑', rest: '문 앞', boss: '맨 안',
    },
  },

  // boss and elite name plates (HudState.boss)
  boss: {
    banshee_queen: { name: '밴시 여왕', sub: '배웅하는 노래' },
    gravekeeper_armor: { name: '무덤지기 갑주', sub: '문을 지키는 빈 갑옷' },
  },

  // death and retry (banner kind 'dead'); the spoken retry lines are DIALOGS['retry.*']
  death: { title: '촛불이 꺼졌다', sub: '종이 울린다. 다시 일어선다', retry: '화면을 누르면 촛불 앞에서 다시 일어선다' },

  // system lines: {name} / {title} are filled by the runner
  system: {
    got: '얻었다 — {name}',
    chronicle: '연대기 — {title}',
    entrusted: '맡겼다 — 묘지 문 열쇠',
    carved: '새겼다 — {name}',
    hung: '걸었다 — 길종',
    dull: '종이 둔하게 울린다',
    notBuilt: '아직 갈 수 없다',
  },

  // tutorial prompts: prompt step → api.prompt({action, label}) + the tip as a small notice.
  // action = an input action of the touch pad (UI_API section 3) or null (no pill, tip only). Button names as on the screen.
  prompts: {
    move: { action: null, label: '이동', tip: '화면 왼쪽을 누른 채 밀면 움직인다' },
    attack: { action: 'attack', label: '공격', tip: '「공격」 — 채찍. 세 번 이으면 넓게 친다' },
    lock: { action: 'lock', label: '다음 적', tip: '가까운 적은 저절로 겨눈다. 「다음 적」으로 바꾼다' },
    roll: { action: 'dash', label: '구르기', tip: '밀면서 「구르기」 — 구르는 동안은 맞지 않는다' },
    guard: { action: 'dash', label: '막기', tip: '서서 「구르기」를 누르고 있으면 막는다' },
    coil: { action: 'attack', label: '휘감기', tip: '「공격」을 길게 — 휘감아 당긴다' },
    jump: { action: 'jump', label: '점프', tip: '「점프」 — 턱은 저절로 잡고 오른다' },
    rest: { action: 'confirm', label: '쉰다', tip: '촛불 앞에서 쉬면 촛불이 모두 다시 켜진다' },
    mark: { action: null, label: '종 무늬', tip: '종 무늬가 있는 것은 그 밤에 바꿀 수 있다' },
    entrust: { action: 'confirm', label: '맡긴다', tip: '그 밤에 맡긴 것은 오늘 밤에 남는다' },
    cross: { action: 'ult', label: '건넘', tip: '종 앞에서 「종」을 길게 — 다른 밤으로 건넌다' },
    wide: { action: 'attack', label: '공격', tip: '셋째 공격은 넓다. 떼를 한 번에 친다' },
    parry: { action: 'dash', label: '튕겨내기', tip: '서서, 맞는 순간 「구르기」 — 튕겨낸다' },
    echo: { action: 'ult', label: '메아리', tip: '「종」을 짧게 — 메아리가 숨은 것을 드러낸다' },
    carve: { action: 'confirm', label: '새긴다', tip: '종 무늬가 있는 비석에 이름을 새긴다' },
    hook: { action: 'skill1', label: '채찍 걸기', tip: '빛나는 고리 가까이에서 「솜씨」 — 채찍 걸기' },
    roomcross: { action: 'ult', label: '건넘', tip: '방 안의 종 앞에서도 건널 수 있다' },
    aging: { action: null, label: '묵는 표', tip: '돌과 은은 남는다. 쇠는 녹슬고 나무는 삭는다' },
    call: { action: 'skill1', label: '세라', tip: '등불대 가까이에서 「솜씨」 — 세라를 부른다' },
    knellpost: { action: 'attack', label: '공격', tip: '조종을 채찍으로 치면 노래가 깨진다' },
    chase: { action: 'ult', label: '건넘', tip: '싸움터 한가운데 종에서 쫓아 건넌다' },
    chaseback: { action: 'ult', label: '건넘', tip: '같은 종에서 오늘 밤으로 돌아간다' },
    knell: { action: 'ult', label: '조종', tip: '무릎 꿇은 여왕 앞에서 「종」을 길게 — 조종' },
    letter: { action: 'confirm', label: '종 편지', tip: '큰 종 앞에서 엘리제에게 종 편지를 청한다' },
  },

  // the "what keeps for a hundred years" card (shown only where the player chooses what to leave)
  aging: [
    { what: '돌 · 은', after: '그대로 남는다' },
    { what: '쇠', after: '녹슬어 그 자리에서 굳는다' },
    { what: '나무 · 밧줄 · 천', after: '삭아 없어진다' },
  ],

  // camera shots named by the `camera` step (what the game should show; all in the game view, no video)
  shots: {
    moon_bell: 'slow rise from the burning roofs to the red moon and the church bell tower (cut 1)',
    bell_crack: 'close on the bell as the bats hit it; a bright crack runs across (cut 2)',
    fall: 'the floor gives way; hero and Elise fall into the light of the crack; a silver shooting star over the mountains (cut 2)',
    wake_past: 'low angle at the foot of the tower in warm candle light, Lotte looking down at the hero (cut 3)',
    table: 'the tavern table: three bowls, one empty chair, Edmund facing the hero (cut 4)',
    knot: 'close on the whip end as the bell shard is tied on (cut 4)',
    years: 'the hundred years in three seconds: same camera, the dressing of the twin area fades over (cut 5, reused)',
    banshee_song: 'the queen rises behind the four bell posts; the song is visible as rings in the mist (cut 6)',
    two_keepers: 'Lotte and Elise on either side of the bell rope (cut 7)',
    ring_widen: 'pull up to the valley map: the bell-sound circle grows one ring; the convent and the sluice appear (cut 8)',
  },

  // music ids used by the `music` step (areas carry their own id: village_burning · village_past · graveyard_mist)
  music: {
    quiet: 'no music, wind and the bell only',
    table_warm: 'v1 inn theme, soft (the tavern table)',
    ossuary_now: 'v1 stage theme for the ossuary tonight',
    ossuary_past: 'v1 village / chapel theme for the ossuary that night',
    boss_banshee: 'v1 boss theme (one track for the banshee queen)',
    dawn_bell: 'v1 ending bell motif, short',
  },
};
