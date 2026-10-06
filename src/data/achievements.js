// 업적 「사냥의 기록」 데이터 (docs/specs/achievements.md §4 표 그대로 — 문장을 바꾸면 python3 tools/fonts/build_fonts.py --check 를 다시 돌린다).
//  한 줄: { id, cat, name, desc, pts, cond: { m, arg?, n }, reward?, hidden? }
//   - cond: 지표 m(arg) ≥ n 이면 달성 (지표는 src/game/achievements.js metric — §3.3 표)
//   - reward: { gold } · { items: [{ id, qty }] } · { title: 't_…' } · { deco: 'd_…' } (이명·장식은 core/ach_meta.js 표). 없으면 기본 골드 pts × 25
//   - hidden: 달성 전에는 '숨겨진 업적' (모두 secret 분류)
//  데이터 순서 = 표시 순서. 시험: tools/test_achievements.mjs C1 (67개 · 점수 합 1,630 · 보상 참조 · 이명 17 · 장식 5)

export const ACH_CATS = [
  { id: 'story', name: '이야기', glyph: 'book' }, { id: 'combat', name: '전투', glyph: 'sword' }, { id: 'hero', name: '영웅', glyph: 'crown' },
  { id: 'companion', name: '동료', glyph: 'paw' }, { id: 'collect', name: '수집', glyph: 'bag' }, { id: 'arcade', name: '아케이드', glyph: 'star' },
  { id: 'challenge', name: '도전', glyph: 'skull' }, { id: 'secret', name: '숨겨진', glyph: 'eye' },
];   // glyph = scenes/menu/common.js glyph() 이름 (새 모양 없음)

/** 외전을 뺀 1·2부 스무 스테이지 (rankS 의 인자) */
const P12 = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 's13', 's14', 's15', 's16', 's17', 's18', 's19', 's20'];

export const ACHIEVEMENTS = [
  // ── 이야기 (11) ──
  { id: 'st_s01', cat: 'story', name: '첫 사냥', desc: '1장 「불타는 마을」을 클리어한다', pts: 10, cond: { m: 'cleared', arg: ['s01'], n: 1 }, reward: { items: [{ id: 'c_potion', qty: 3 }] } },
  { id: 'st_s02', cat: 'story', name: '까마귀와 함께', desc: '2장 「안개의 묘지」를 클리어해 리아를 동료로 맞는다', pts: 10, cond: { m: 'cleared', arg: ['s02'], n: 1 }, reward: { gold: 300 } },
  { id: 'st_dracula', cat: 'story', name: '백작의 몰락', desc: '드라큘라 백작을 쓰러뜨린다', pts: 20, cond: { m: 'boss', arg: 'b_dracula', n: 1 } },
  { id: 'st_end1', cat: 'story', name: '백 년의 새벽', desc: '1부의 엔딩을 본다', pts: 20, cond: { m: 'ending', arg: ['normal', 'true'], n: 1 }, reward: { title: 't_dawn' } },
  { id: 'st_true1', cat: 'story', name: '영원한 새벽', desc: '1부의 트루 엔딩을 본다', pts: 30, cond: { m: 'ending', arg: ['true'], n: 1 }, reward: { deco: 'd_gold' } },
  { id: 'st_s14', cat: 'story', name: '균열 너머', desc: '14장 「거울의 성」을 클리어해 이졸데를 동료로 맞는다', pts: 10, cond: { m: 'cleared', arg: ['s14'], n: 1 }, reward: { gold: 1000 } },
  { id: 'st_end2', cat: 'story', name: '파수꾼의 밤', desc: '2부의 엔딩을 본다', pts: 30, cond: { m: 'ending', arg: ['p2', 'p2true'], n: 1 }, reward: { title: 't_warden' } },
  { id: 'st_true2', cat: 'story', name: '새벽의 별', desc: '2부의 진엔딩을 본다', pts: 50, cond: { m: 'ending', arg: ['p2true'], n: 1 }, reward: { deco: 'd_violet' } },
  { id: 'st_s21', cat: 'story', name: '은빛 귀환', desc: '외전 「하늘 정원의 둥지」를 클리어한다', pts: 20, cond: { m: 'cleared', arg: ['s21'], n: 1 }, reward: { deco: 'd_silver' } },
  { id: 'st_s22', cat: 'story', name: '이름을 부르는 밤', desc: '외전 「이름 없는 언덕」을 클리어한다', pts: 20, cond: { m: 'cleared', arg: ['s22'], n: 1 }, reward: { deco: 'd_crow' } },
  { id: 'st_endings', cat: 'story', name: '다섯 개의 결말', desc: '엔딩 다섯 개를 모두 본다', pts: 50, cond: { m: 'ending', arg: ['bad', 'normal', 'true', 'p2', 'p2true'], n: 5 }, reward: { title: 't_chronicler' } },

  // ── 전투 (7) ──
  { id: 'cb_kill_1k', cat: 'combat', name: '사냥꾼의 일상', desc: '적 1,000마리를 쓰러뜨린다', pts: 10, cond: { m: 'kills', n: 1000 }, reward: { items: [{ id: 'm_stone_2', qty: 2 }] } },
  { id: 'cb_kill_10k', cat: 'combat', name: '피의 수확', desc: '적 10,000마리를 쓰러뜨린다', pts: 30, cond: { m: 'kills', n: 10000 }, reward: { title: 't_reaper' } },
  { id: 'cb_combo_100', cat: 'combat', name: '백 연격', desc: '콤보 100 HIT를 잇는다', pts: 20, cond: { m: 'combo', n: 100 } },
  { id: 'cb_combo_300', cat: 'combat', name: '끝나지 않는 연격', desc: '콤보 300 HIT를 잇는다', pts: 50, cond: { m: 'combo', n: 300 } },
  { id: 'cb_style_s', cat: 'combat', name: '잔혹하다', desc: '스타일 랭크 S에 오른다', pts: 10, cond: { m: 'style', n: 5 } },
  { id: 'cb_style_sss', cat: 'combat', name: '피의 야상곡', desc: '스타일 랭크 SSS에 오른다', pts: 30, cond: { m: 'style', n: 7 }, reward: { title: 't_nocturne' } },
  { id: 'cb_nodmg', cat: 'combat', name: '흠집 하나 없이', desc: '보스를 피해 없이 쓰러뜨린다', pts: 20, cond: { m: 'nodmg', n: 1 } },

  // ── 영웅 (7) ──
  { id: 'hr_class1', cat: 'hero', name: '첫 전직', desc: '영웅 하나를 1차 전직시킨다', pts: 10, cond: { m: 'tier', n: 1 }, reward: { items: [{ id: 'c_hipotion', qty: 2 }] } },
  { id: 'hr_class2_all', cat: 'hero', name: '일곱 개의 정점', desc: '일곱 영웅을 모두 2차 전직시킨다', pts: 50, cond: { m: 'tier2all', n: 7 }, reward: { title: 't_apex' } },
  { id: 'hr_seven', cat: 'hero', name: '일곱 사냥꾼', desc: '일곱 영웅을 모두 동료로 맞는다', pts: 20, cond: { m: 'heroes', n: 7 } },
  { id: 'hr_lv80', cat: 'hero', name: '전설의 경지', desc: '영웅 하나가 레벨 80에 오른다', pts: 30, cond: { m: 'level', n: 80 } },
  { id: 'hr_awaken', cat: 'hero', name: '첫 각성', desc: '각성기를 처음 발동한다', pts: 10, cond: { m: 'awaken', n: 1 } },
  { id: 'hr_awaken_all', cat: 'hero', name: '일곱 개의 각성', desc: '일곱 영웅의 각성기를 모두 발동한다', pts: 30, cond: { m: 'awaken', n: 7 }, reward: { title: 't_awakened' } },
  { id: 'hr_true_awaken', cat: 'hero', name: '진 각성', desc: '2차 전직한 영웅으로 진 각성을 발동한다', pts: 20, cond: { m: 'awaken2', n: 1 } },

  // ── 동료 (7) ──
  { id: 'cp_first', cat: 'companion', name: '첫 동료', desc: '탈것이나 수호신을 처음 얻는다', pts: 10, cond: { m: 'cmpAny', n: 1 }, reward: { gold: 1000 } },
  { id: 'cp_ride', cat: 'companion', name: '첫 기승', desc: '탈것에 처음 올라탄다', pts: 10, cond: { m: 'ride', n: 1 } },
  { id: 'cp_egg', cat: 'companion', name: '알을 깨고 나온 날개', desc: '알을 부화시켜 동료로 맞는다', pts: 10, cond: { m: 'egg', n: 1 } },
  { id: 'cp_mounts', cat: 'companion', name: '마구간의 주인', desc: '탈것 10마리를 모두 얻는다', pts: 30, cond: { m: 'mounts', n: 10 }, reward: { title: 't_stable' } },
  { id: 'cp_guards', cat: 'companion', name: '열두 수호신', desc: '수호신 12체를 모두 얻는다', pts: 30, cond: { m: 'guards', n: 12 }, reward: { title: 't_guardian' } },
  { id: 'cp_bond', cat: 'companion', name: '영혼 결속', desc: '동료 하나와 유대 최고 단계 「영혼 결속」에 이른다', pts: 30, cond: { m: 'bond', n: 5 } },
  { id: 'cp_lv30', cat: 'companion', name: '함께 걸어온 길', desc: '동료 하나를 최고 레벨 30까지 키운다', pts: 20, cond: { m: 'cmpLv', n: 30 } },

  // ── 수집 (9) ──
  { id: 'cl_relics', cat: 'collect', name: '다섯 개의 유물', desc: '드라큘라의 유물 다섯 개를 모두 모은다', pts: 20, cond: { m: 'relics', n: 5 } },
  { id: 'cl_otherworld', cat: 'collect', name: '이계의 보물', desc: '세계의 심장과 별의 조각을 여섯 개씩 모두 모은다', pts: 30, cond: { m: 'otherworld', n: 6 } },
  { id: 'cl_docs10', cat: 'collect', name: '비전서 수집가', desc: '비전서 10권을 찾는다', pts: 10, cond: { m: 'docs', n: 10 }, reward: { items: [{ id: 'c_ether', qty: 3 }] } },
  { id: 'cl_docs_all', cat: 'collect', name: '금서의 주인', desc: '비전서 27권을 모두 찾는다', pts: 30, cond: { m: 'docs', n: 27 }, reward: { title: 't_scholar' } },
  { id: 'cl_beast30', cat: 'collect', name: '괴물 학자', desc: '도감에 적 30종을 기록한다', pts: 10, cond: { m: 'bestiary', n: 30 } },
  { id: 'cl_beast80', cat: 'collect', name: '괴물 박사', desc: '도감에 적 80종을 기록한다', pts: 30, cond: { m: 'bestiary', n: 80 } },
  { id: 'cl_secret20', cat: 'collect', name: '비밀 탐색가', desc: '숨겨진 비밀 20곳을 찾는다', pts: 20, cond: { m: 'secrets', n: 20 }, reward: { items: [{ id: 'c_elixir', qty: 1 }] } },
  { id: 'cl_enhance10', cat: 'collect', name: '장인의 걸작', desc: '장비 하나를 +10까지 강화한다', pts: 20, cond: { m: 'enhance', n: 10 } },
  { id: 'cl_quest30', cat: 'collect', name: '마을의 해결사', desc: '퀘스트 30개를 완료한다', pts: 20, cond: { m: 'quests', n: 30 }, reward: { items: [{ id: 'm_stone_3', qty: 1 }] } },

  // ── 아케이드 (10 — 아케이드 모드와 여관 놀이) ──
  { id: 'ar_rush', cat: 'arcade', name: '첫 결착', desc: '보스 러시 코스 하나를 완주한다', pts: 10, cond: { m: 'rush', arg: 'any', n: 1 }, reward: { items: [{ id: 'm_stone_3', qty: 1 }] } },
  { id: 'ar_rush22', cat: 'arcade', name: '스물두 번의 결착', desc: '보스 러시 「전 보스 22연전」을 완주한다', pts: 50, cond: { m: 'rush', arg: [8], n: 1 }, reward: { title: 't_rush' } },
  { id: 'ar_surv10', cat: 'arcade', name: '살아남은 자', desc: '서바이벌에서 웨이브 10에 이른다', pts: 10, cond: { m: 'survival', n: 10 } },
  { id: 'ar_tower10', cat: 'arcade', name: '탑의 문지기', desc: '무한의 탑 10층을 돌파한다', pts: 10, cond: { m: 'tower', n: 10 } },
  { id: 'ar_tower50', cat: 'arcade', name: '구름 위의 층', desc: '무한의 탑 50층을 돌파한다', pts: 30, cond: { m: 'tower', n: 50 }, reward: { title: 't_tower' } },
  { id: 'ar_daily', cat: 'arcade', name: '오늘의 사냥', desc: '오늘의 도전을 클리어한다', pts: 10, cond: { m: 'daily', n: 1 } },
  { id: 'ar_daily7', cat: 'arcade', name: '이레의 사냥', desc: '서로 다른 날 오늘의 도전을 7번 클리어한다', pts: 30, cond: { m: 'daily', n: 7 } },
  { id: 'mg_win', cat: 'arcade', name: '여관의 손님', desc: '여관 놀이에서 처음 이긴다', pts: 10, cond: { m: 'mgWins', n: 1 }, reward: { gold: 500 } },
  { id: 'mg_jackpot', cat: 'arcade', name: '잭팟', desc: '여관 놀이에서 잭팟을 터뜨린다', pts: 20, cond: { m: 'jackpot', n: 1 }, reward: { title: 't_lucky' } },
  { id: 'mg_duel', cat: 'arcade', name: '마탄의 사수를 넘어', desc: '황혼의 결투에서 다섯 결투자를 모두 이긴다', pts: 30, cond: { m: 'duel', n: 5 } },   // n = duel.js FOES.length (C1)

  // ── 도전 (9) ──
  { id: 'ch_rank_s', cat: 'challenge', name: '완벽한 사냥', desc: '스테이지 하나를 S 랭크로 클리어한다', pts: 10, cond: { m: 'rankS', arg: P12, n: 1 }, reward: { items: [{ id: 'c_holywater', qty: 1 }] } },
  { id: 'ch_rank_s_all', cat: 'challenge', name: '핏빛 완벽주의', desc: '1·2부 스무 스테이지를 모두 S 랭크로 클리어한다', pts: 50, cond: { m: 'rankS', arg: P12, n: 20 }, reward: { title: 't_perfect' } },
  { id: 'ch_nodmg_stage', cat: 'challenge', name: '무결', desc: '스테이지를 피해 없이 클리어한다', pts: 30, cond: { m: 'nodmgStage', n: 1 } },
  { id: 'ch_speed', cat: 'challenge', name: '질주하는 밤', desc: '스테이지를 기준 시간의 절반 안에 클리어한다', pts: 20, cond: { m: 'speed', n: 1 } },
  { id: 'ch_hard_p1', cat: 'challenge', name: '베테랑의 증명', desc: '베테랑 이상 난이도로 1부 엔딩을 본다', pts: 30, cond: { m: 'diffEnding', arg: { diffs: ['hard', 'nightmare', 'inferno'], part: 1 }, n: 1 } },
  { id: 'ch_nightmare_p2', cat: 'challenge', name: '악몽을 걷는 자', desc: '악몽 이상 난이도로 2부 엔딩을 본다', pts: 50, cond: { m: 'diffEnding', arg: { diffs: ['nightmare', 'inferno'], part: 2 }, n: 1 }, reward: { title: 't_nightmare' } },
  { id: 'ch_nodmg5', cat: 'challenge', name: '다섯 번의 무결', desc: '보스를 피해 없이 다섯 번 쓰러뜨린다', pts: 30, cond: { m: 'nodmg', n: 5 } },
  { id: 'ch_rush_perfect', cat: 'challenge', name: '무결점 러시', desc: '보스 러시 코스 하나를 모든 보스 무피해로 완주한다', pts: 50, cond: { m: 'rushPerfect', n: 1 } },
  { id: 'ch_all', cat: 'challenge', name: '블러드 녹턴', desc: '다른 업적을 모두 달성한다', pts: 100, cond: { m: 'all', n: 66 }, reward: { title: 't_legend', deco: 'd_moon' } },

  // ── 숨겨진 (7, 모두 hidden) ──
  { id: 'sc_konami', cat: 'secret', hidden: true, name: '옛 주문', desc: '타이틀 화면에서 비밀 코드를 입력한다', pts: 10, cond: { m: 'konami', n: 1 } },
  { id: 'sc_bad', cat: 'secret', hidden: true, name: '끝나지 않는 밤', desc: '배드 엔딩을 본다', pts: 10, cond: { m: 'ending', arg: ['bad'], n: 1 } },
  { id: 'sc_lia', cat: 'secret', hidden: true, name: '딱 한 번 부른 이름', desc: '리아로 네메인과 결착한다', pts: 20, cond: { m: 'heroBoss', arg: { boss: 'b_nemain', char: 'lia' }, n: 1 } },
  { id: 'sc_isolde', cat: 'secret', hidden: true, name: '다시 하늘로', desc: '이졸데로 아르겐을 정화한다', pts: 20, cond: { m: 'heroBoss', arg: { boss: 'b_argen', char: 'isolde' }, n: 1 } },
  { id: 'sc_count', cat: 'secret', hidden: true, name: '백작의 굴욕', desc: '드라큘라 백작을 피해 없이 쓰러뜨린다', pts: 30, cond: { m: 'nodmg', arg: 'b_dracula', n: 1 }, reward: { title: 't_count' } },
  { id: 'sc_die100', cat: 'secret', hidden: true, name: '불굴', desc: '백 번 쓰러지고도 다시 일어선다', pts: 10, cond: { m: 'deaths', n: 100 } },
  { id: 'sc_cat', cat: 'secret', hidden: true, name: '까망이의 선물', desc: '흑묘 여관의 까망이에게 선물을 받는다', pts: 10, cond: { m: 'cat', n: 1 } },
];

/** 숨긴 업적이 달성 전에 보이는 모습 (§4.8) */
export const ACH_HIDDEN = { name: '숨겨진 업적', desc: '아직 알 수 없는 업적입니다' };
