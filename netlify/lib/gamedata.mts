// 온라인 기록 검사·일일 도전에 쓰는 게임 데이터 id 사본.
// 함수 배포 묶음(dist/deploy)에는 netlify/ 만 들어가므로 src/data 를 import 하지 않고 여기에 복사한다.
// src/data 와 같아야 한다 — tools/online/test_online.mjs 가 확인 (캐릭터 id 는 config.mts CHARACTER_IDS).

/** 직업 id → [캐릭터 id, 단계(0 기본·1 상급·2 최상급)] (src/data/classes.js CLASSES) */
export const CLASS_INFO: Readonly<Record<string, readonly [string, number]>> = {
  kael_hunter: ['kael', 0], kael_crusader: ['kael', 1], kael_templar: ['kael', 2], kael_inquisitor: ['kael', 2],
  kael_stalker: ['kael', 1], kael_bloodhunter: ['kael', 2], kael_nightraven: ['kael', 2],
  sera_exorcist: ['sera', 0], sera_priestess: ['sera', 1], sera_saint: ['sera', 2], sera_oracle: ['sera', 2],
  sera_elementalist: ['sera', 1], sera_archmage: ['sera', 2], sera_stormcaller: ['sera', 2],
  victor_gunslinger: ['victor', 0], victor_deadeye: ['victor', 1], victor_phantom: ['victor', 2], victor_executioner: ['victor', 2],
  victor_desperado: ['victor', 1], victor_hellfire: ['victor', 2], victor_gunlord: ['victor', 2],
  bran_knight: ['bran', 0], bran_paladin: ['bran', 1], bran_guardian: ['bran', 2], bran_crusader: ['bran', 2],
  bran_berserker: ['bran', 1], bran_warlord: ['bran', 2], bran_bloodrage: ['bran', 2],
  lia_assassin: ['lia', 0], lia_ninja: ['lia', 1], lia_shadowmaster: ['lia', 2], lia_kunoichi: ['lia', 2],
  lia_dancer: ['lia', 1], lia_bladedancer: ['lia', 2], lia_reaper: ['lia', 2],
  azel_dhampir: ['azel', 0], azel_vampire: ['azel', 1], azel_nosferatu: ['azel', 2], azel_bloodking: ['azel', 2],
  azel_holyblade: ['azel', 1], azel_dawnbringer: ['azel', 2], azel_seraph: ['azel', 2],
  isolde_lancer: ['isolde', 0], isolde_dragoon: ['isolde', 1], isolde_stormlord: ['isolde', 2], isolde_wyrmknight: ['isolde', 2],
  isolde_valkyrie: ['isolde', 1], isolde_einherjar: ['isolde', 2], isolde_spearsaint: ['isolde', 2],
};

/** 난이도 id (src/data/difficulty.js DIFFICULTIES 순서) */
export const DIFFICULTY_IDS: readonly string[] = ['easy', 'normal', 'hard', 'nightmare', 'inferno'];

/** 스테이지 id → 권장 레벨 (src/data/stages.js STAGE_ORDER, STAGES[id].level). s14~s20 은 2부, s21 은 외전 (2부 엔딩 뒤) */
export const STAGE_LEVELS: Readonly<Record<string, number>> = {
  s01: 1, s02: 3, s03: 5, s04: 8, s05: 11, s06: 14, s07: 17, s08: 20, s09: 24, s10: 28,
  s11: 32, s12: 36, s13: 45, s14: 46, s15: 50, s16: 53, s17: 56, s18: 60, s19: 64, s20: 68,
  s21: 70,
};
/** 모든 스테이지 (연습 보드 practice:<id> 가 받는 id) */
export const STAGE_IDS: readonly string[] = Object.keys(STAGE_LEVELS);
/** 2부 스테이지 (src/data/stages.js STAGE_ORDER_P2 — 끝의 s21 은 외전) */
export const P2_STAGES: readonly string[] = ['s14', 's15', 's16', 's17', 's18', 's19', 's20', 's21'];
/** 외전 스테이지 (src/data/stages.js SIDE_STAGES — STAGES[id].side) */
export const SIDE_STAGES: readonly string[] = ['s21'];
/**
 * 일일 도전이 고르는 스테이지 = 외전을 뺀 1·2부 (s01~s20). 외전은 2부 엔딩 뒤에 열리는 이야기라 매일 도전으로 내밀지 않고,
 * 목록 길이가 그대로라 이미 정해진 날짜의 도전(스테이지·헌터·규칙)도 외전이 들어오기 전과 같다 (그날의 순위표가 배포 도중 바뀌지 않는다)
 */
export const DAILY_STAGE_IDS: readonly string[] = STAGE_IDS.filter((id) => !SIDE_STAGES.includes(id));

/** 보스 러시 코스 수 (src/scenes/front/arcade.js COURSES — 보드 ID 의 <course> 는 그 인덱스; 5·6 = 외전 아르겐이 든 코스) */
export const COURSE_COUNT = 7;

/** 헌터 등급 (src/scenes/front/arcade.js LEVEL_PRESETS 의 lv·tier·p2) */
export const LEVEL_PRESETS: readonly { lv: number; tier: number; p2?: boolean }[] = [
  { lv: 10, tier: 0 }, { lv: 25, tier: 1 }, { lv: 40, tier: 2 }, { lv: 60, tier: 2 }, { lv: 68, tier: 2, p2: true },
];

/**
 * 무한의 탑 층 규칙 (src/data/tower.js TOWER_RULES 와 같아야 한다 — tools/online/test_online.mjs 가 대조).
 * 기록 검사(online.mts): 걸린 시간 ≥ 돌파한 층 × minFloorSec 초, 점수 ≤ (돌파한 층 + 1) × maxScorePerFloor
 */
export const TOWER_RULES: Readonly<{ bossEvery: number; restEvery: number; minFloorSec: number; maxScorePerFloor: number }> = {
  bossEvery: 5, restEvery: 10, minFloorSec: 3, maxScorePerFloor: 5000000,   // minFloorSec = 층마다 건너뛸 수 없는 연출 시간 (src/data/tower.js)
};
