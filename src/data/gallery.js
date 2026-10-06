// 회랑 「GALLERY」 목록 (계약: docs/specs/gallery.md §4) — 순수 데이터, import 없음. 엔진 game/gallery.js · 장면 scenes/front/gallery.js 가 읽는다.
// 데이터 순서 = 표시 순서. 그림 이름·힌트 문장의 원본은 이 파일이다 (바꾸면 §6 글리프 검사 + python3 tools/fonts/build_fonts.py --check).
//  need = 열림 증거 토큰 배열 — 하나라도 참이면 열림 (문법 §3.3, 판정 game/gallery.js evalNeed):
//    always (늘 — 저장하지 않음) · start (서막 대본 또는 아무 장 클리어) · s:<대본> (seenScripts) · c:<장> | c:* (클리어, ng.past 포함)
//    b:<보스> (쓰러뜨림) · boss:<보스> (= s:<보스>_pre · b:<보스> · 그 보스의 장 클리어) · e:<엔딩> (meta.endingsSeen 또는 슬롯 깃발 ending_<엔딩>)
//    f:<깃발> (슬롯 깃발 참) · aw:<영웅> (meta.ach.prog.aw_<영웅> ≥ 1 또는 그 영웅 직업 단계 ≥ 1) · die (죽은 적이 있다) · arena (서바이벌·무한의 탑 기록)
//  p2: true = 제2부 항목 — 2부를 모르는 계정에는 목록·수·NEW 에서 뺀다 (§3.5: 숨기기 전 그림 20 · 음악 33 · 극장 5)
// 외전·새 CG·새 곡이 생기면 여기에 한 줄 — tools/test_gallery.mjs G1 이 assets/cg · assets/lo/cg · TRACKS · 음악 index.json 과 집합으로 대조해 실패시킨다.

/** 그림 칸 (part) — 칸 머리 문장 */
export const GAL_PARTS = Object.freeze([
  { id: 1, name: '제1부 「드라큘라의 성」' },
  { id: 2, name: '제2부 「균열의 순례」', p2: true },
  { id: 'aw', name: '각성' },
]);

const cg = (id, name, at, need, x) => ({ id, key: 'cg/' + id, name, at, need, part: 1, ...x });
const p2 = (id, name, at, need) => cg(id, name, at, need, { part: 2, p2: true });
// 각성 컷인: name = CHARACTERS[hero].name · sub = '각성 — ' + AWAKEN[hero].name (기존 문장, G1 이 대조)
const aw = (hero, name, awName, x) => cg('cutin_' + hero, name, '각성', ['aw:' + hero], { part: 'aw', hero, sub: '각성 — ' + awName, ...x });

/** 그림 34장 (§4.1) = assets/cg/*.webp (모두 assets/lo/cg 변형 있음). key = assets 키 */
export const GAL_CG = Object.freeze([
  // ── 제1부 「드라큘라의 성」 (14)
  cg('cg_prologue_moon', '핏빛 달', '서막', ['start']),
  cg('cg_prologue_attack', '불타는 마을', '서막', ['start']),
  cg('cg_alberto_church', '신부의 성물', '서막', ['start']),
  cg('cg_elise_taken', '사라진 엘리제', '1장', ['s:s01_outro', 'c:s01']),
  cg('cg_castle_gate', '악마성 정문', '3장', ['s:s03_intro', 'c:s03']),
  cg('cg_elise_rescued', '엘리제 구출', '4장', ['s:s04_outro', 'c:s04']),
  cg('cg_carmilla_library', '도서관의 귀부인', '6장', ['s:s06_outro', 'c:s06']),
  cg('cg_death_appears', '사신의 등장', '11장', ['boss:b_death']),
  cg('cg_dracula_throne', '왕좌의 백작', '12장', ['boss:b_dracula']),
  cg('cg_dracula_transform', '진정한 밤의 모습', '12장', ['s:b_dracula_transform', 'b:b_dracula', 'c:s12']),   // 2페이즈 대사 — 처치 전에 반드시 지난다
  cg('cg_castle_collapse', '무너지는 성', '12장', ['s:s12_outro', 'c:s12', 'e:normal']),
  cg('cg_abyss_gate', '심연의 문', '13장', ['s:s13_intro', 'f:abyss_open', 'c:s13']),   // s12 아웃트로의 유물 갈래 = abyss_open
  cg('cg_true_ending', '영원한 새벽', '엔딩', ['s:s13_outro', 'c:s13', 'e:true']),
  cg('cg_bad_ending', '끝나지 않는 밤', '엔딩', ['e:bad', 's:ending_bad']),
  // ── 제2부 「균열의 순례」 (13)
  p2('cg_rift_sky', '하늘의 균열', '제2부 서막', ['s:p2_prologue', 'f:p2_started', 'c:s14']),
  p2('cg_rook_reveal', '로크의 정체', '제2부 서막', ['s:p2_prologue', 'f:p2_started', 'c:s14']),
  p2('cg_rift_gate', '균열문', '14장', ['s:s14_intro', 'c:s14']),
  p2('cg_mirror_empress', '거울의 여제', '14장', ['boss:b_narkissa']),
  p2('cg_forge_idol', '용광로의 우상', '15장', ['boss:b_moloch']),
  p2('cg_sunken_cathedral', '가라앉은 성소', '16장', ['boss:b_dagon']),
  p2('cg_ziz_storm', '폭풍의 거신조', '17장', ['boss:b_ziz']),
  p2('cg_mara_cradle', '악몽의 요람', '18장', ['boss:b_mara']),
  p2('cg_behemoth_rot', '썩어가는 짐승', '19장', ['boss:b_behemoth']),
  p2('cg_void_descent', '공허로의 하강', '20장', ['s:s20_intro', 'c:s20']),
  p2('cg_nihil', '니힐', '20장', ['boss:b_nihil']),
  p2('cg_p2_ending', '파수꾼의 밤', '엔딩', ['e:p2', 's:ending_p2']),
  p2('cg_p2_true', '새벽의 별', '엔딩', ['e:p2true', 's:ending_p2true']),
  // ── 각성 (7) — 영웅 순서 = CHAR_ORDER
  aw('kael', '카엘 발크레인', '비질리아 — 여명의 처형식'),
  aw('sera', '세라피나 룩스', '천상의 문 — 세라핌 레퀴엠'),
  aw('victor', '빅터 그림', '실버 레퀴엠 — 여섯 발의 장송곡'),
  aw('bran', '브란 아이언하트', '철심 해방 — 기사단의 진혼가'),
  aw('lia', '리아 크로우', '흑우 — 까마귀의 장례'),
  aw('azel', '아젤 드 녹트', '크림슨 이클립스 — 진조 해방'),
  // 14장 아웃트로가 이 그림을 CG 로 빌려 쓴다
  aw('isolde', '이졸데 드라켄', '천룡 귀환 — 하늘 기사단의 마지막 비행', { p2: true, need: ['aw:isolde', 's:s14_outro', 'c:s14'] }),
]);

/** 음악실 칸 (sec) — 칸 머리 문장 */
export const GAL_MUSIC_SECS = Object.freeze([
  { id: 'story', name: '이야기와 마을' },
  { id: 'p1', name: '제1부' },
  { id: 'p2', name: '제2부', p2: true },
  { id: 'boss', name: '보스' },
  { id: 'inter', name: '막간' },
]);

const mu = (id, sec, need, x) => ({ id, sec, need, ...x });
const ch = (n, sec, x) => { const sid = 's' + String(n).padStart(2, '0'); return mu(sid, sec, ['s:' + sid + '_intro', 'c:' + sid], x); };   // 인트로가 그 곡을 튼다
const bosses = (...ids) => ids.map((b) => 'boss:' + b);
const START = ['start'];   // 마을·여관 놀이는 서막 직후부터 열려 있다
const P2_START = ['s:p2_prologue', 'f:p2_started', 'c:s14'];

/** 음악 44곡 (§4.2) = data/music.js TRACKS 키 = assets/audio/music/index.json 곡. 이름은 TRACKS[id].name 그대로 (화면이 읽는다), 번호는 보이는 목록의 순서 */
export const GAL_MUSIC = Object.freeze([
  // ── 이야기와 마을
  mu('title', 'story', ['always']),
  mu('prologue', 'story', START),
  mu('story', 'story', ['c:*', 's:s01_outro']),
  mu('sad', 'story', ['s:s07_outro', 'c:s07', 'e:bad', 'c:s23']),
  mu('hub', 'story', START),
  mu('inn', 'story', START),
  mu('shop', 'story', START),
  mu('smith', 'story', START),
  mu('church', 'story', START),
  mu('worldmap', 'story', START),
  mu('worldmap2', 'story', P2_START, { p2: true }),
  mu('minigame', 'story', START),
  // ── 제1부 (s01–s13)
  ...Array.from({ length: 13 }, (_, i) => ch(i + 1, 'p1')),
  // ── 제2부 (s14–s20 — 외전 s21–s25 는 s17·s02·s10·s11·s01 곡을 다시 쓴다)
  ...Array.from({ length: 7 }, (_, i) => ch(i + 14, 'p2', { p2: true })),
  // ── 보스 (모든 보스가 BOSSES[id].music 의 줄에 있다 — G1)
  mu('boss', 'boss', bosses('b_nightwing', 'b_banshee', 'b_crimson', 'b_grimoire', 'b_charon')),
  mu('boss2', 'boss', bosses('b_dullahan', 'b_bonedragon', 'b_chimera', 'b_leviathan', 'b_colossus', 'b_frostqueen', 'b_death', 'b_hagen')),
  mu('dracula', 'boss', bosses('b_dracula', 'b_bride')),
  mu('chaos', 'boss', bosses('b_chaos')),
  mu('boss3', 'boss', bosses('b_narkissa', 'b_dagon', 'b_mara', 'b_nemain'), { p2: true }),
  mu('boss4', 'boss', bosses('b_moloch', 'b_ziz', 'b_behemoth', 'b_argen'), { p2: true }),
  mu('nihil', 'boss', bosses('b_nihil'), { p2: true }),
  mu('arena', 'boss', ['arena']),   // 서바이벌·무한의 탑에서만 나온다
  // ── 막간
  mu('victory', 'inter', ['c:*']),
  mu('gameover', 'inter', ['die']),
  mu('ending', 'inter', ['e:normal', 'e:true', 'e:p2', 'e:p2true']),
  mu('credits', 'inter', ['always']),   // 크레딧은 타이틀에서 늘 볼 수 있었다
]);

// 엔딩 줄: name·sub·title·bg·music 은 scenes/front/ending.js ENDINGS[k] 의 기존 문장·값 그대로 (G1 이 대조)
const end = (k, no, eng, kor, bg, music, x) => ({
  id: 'end_' + k, name: 'ENDING ' + no, sub: `「${kor}」`, kind: 'ending', ending: k, script: 'ending_' + k, bg, music,
  title: { eng, kor }, credits: k, need: ['e:' + k], ...x,
});

/**
 * 극장 8줄 (§4.3) — 저장하지 않는다 (서막은 증거, 엔딩은 meta.endingsSeen 에서 매번 읽는다).
 *  kind 'script': go('story', { script, bg, music, replay:true, then:'gallery' }) · 'ending': story(제목 카드 title) → 크레딧 {kind: credits} → 회랑
 *  · 'credits': go('credits', { kind: null, back:'gallery' })
 */
export const GAL_THEATER = Object.freeze([
  { id: 'prologue', name: '서막', sub: 'PROLOGUE', kind: 'script', script: 'prologue', bg: 'cg/cg_prologue_moon', music: 'prologue', need: ['start'] },
  { id: 'p2_prologue', name: '제2부 서막', sub: 'PART Ⅱ', kind: 'script', script: 'p2_prologue', bg: 'cg/cg_rift_sky', music: null, need: P2_START, p2: true },
  end('bad', 'Ⅰ', 'BAD ENDING', '끝나지 않는 밤', 'cg/cg_bad_ending', 'sad'),
  end('normal', 'Ⅱ', 'NORMAL ENDING', '백 년의 새벽', 'bg/ending', 'ending'),
  end('true', 'Ⅲ', 'TRUE ENDING', '영원한 새벽', 'bg/ending', 'ending'),
  end('p2', 'Ⅳ', 'PART Ⅱ ENDING', '파수꾼의 밤', 'cg/cg_p2_ending', 'ending', { p2: true }),
  end('p2true', 'Ⅴ', 'TRUE FINALE', '새벽의 별', 'cg/cg_p2_true', 'ending', { p2: true }),
  { id: 'credits', name: '크레딧', sub: 'CREDITS', kind: 'credits', credits: null, need: ['always'] },
]);
