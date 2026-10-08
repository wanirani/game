// 시련 「메아리」 14개 (영웅마다 Ⅰ·Ⅱ) — docs/specs/story_ext.md §2 그대로, 엔진 규칙은 docs/specs/classes_t3.md §2.2 · §9
// T = { id, charId, n: 1|2, name, desc, stage, boss, room: 'boss', reqLevel, level, recLv, mods, diffOver, bossPatterns,
//       reqFlag?, reqText?, pre, win, preAgain, winAgain, bg, music, failLine, unlock: 't3'|'hidden' }
//  · stage 의 boss 방에서 그 스테이지 본래 보스와 싸운다 (boss = STAGES[stage].boss, 확인용)
//  · mods ⊂ core/online.js DAILY_MODS ('dark' 은 쓰지 않는다), diffOver 는 그 위에 덮는 난이도 값
//  · level = 시련 월드의 적 레벨 (stage.level 덮어쓰기), recLv = 권장 레벨 (성당 확인 창)
//  · pre/win = data/story_trials.js 대본 id, 다시 도전하면 preAgain/winAgain
//  · reqFlag 는 첫 통과 전에만 확인 (지난 회차 포함 — ascensions.js flagEver), reqText 는 그때의 잠김 문구
// 순수 데이터 (import 없음)
const T = {};
const COMMON = { 1: { reqLevel: 70, level: 74, recLv: 72, unlock: 't3' }, 2: { reqLevel: 75, level: 80, recLv: 78, unlock: 'hidden' } };
function trial(charId, n, o) {
  const id = `tr_${charId}_${n}`;
  T[id] = {
    id, charId, n, room: 'boss', ...COMMON[n], mods: [], diffOver: null, bossPatterns: true,
    pre: `${id}_pre`, win: `${id}_win`, preAgain: 'tr_again_pre', winAgain: 'tr_again_win', ...o,
  };
}

// ── 카엘 ──
trial('kael', 1, { name: '시련 Ⅰ · 묘비의 빈 줄', desc: '발크레인 비석마다 깎여 나간 마지막 한 줄', stage: 's02', boss: 'b_banshee',
  mods: ['no_sub'], diffOver: { bossHp: 1.3 }, bossPatterns: true,
  bg: 's02_graveyard', music: 'story', failLine: '비석은 기다려 줄 거예요. 다시 가요, 카엘 님!' });
trial('kael', 2, { name: '시련 Ⅱ · 첫 번째 봉인', desc: '사백 년 전, 종탑 아래서 맺은 첫 약속', stage: 's01', boss: 'b_nightwing',
  mods: ['no_potion', 'haste'], diffOver: { bossHp: 1.3 }, bossPatterns: true,
  bg: 's01_village', music: 'church', failLine: '종은 계속 칠게요. 오실 때까지요. 약속!' });
// ── 세라 ──
trial('sera', 1, { name: '시련 Ⅰ · 얼어붙은 기도', desc: '얼음 속에서 멈춘 선배 수녀들의 기도', stage: 's10', boss: 'b_frostqueen',
  mods: [], diffOver: null, bossPatterns: false,
  bg: 's10_spire', music: 'church', failLine: '수녀님, 기도는 아직 안 끝났어요. 한 번 더요!' });
trial('sera', 2, { name: '시련 Ⅱ · 침묵의 대답', desc: '빛이 닿지 않는 바다 밑, 침묵의 설교', stage: 's16', boss: 'b_dagon',
  mods: ['no_potion'], diffOver: { bossHp: 1.15 }, bossPatterns: true,
  bg: 's16_sunken', music: 'church', failLine: '바다 밑은 어두워도 종소리는 닿아요. 다시 가요.' });
// ── 빅터 ──
trial('victor', 1, { name: '시련 Ⅰ · 멈춘 시계의 총잡이', desc: '1697년, 시계를 멈추러 간 총잡이', stage: 's09', boss: 'b_colossus',
  mods: ['haste'], diffOver: null, bossPatterns: true,
  reqFlag: 'ex_s23_done', reqText: '외전 「빈칸의 현상금」을 먼저 보아야 한다',
  bg: 's09_clocktower', music: 'story', failLine: '시계는 다시 돌아요. 이번엔 먼저 쏘세요!' });
trial('victor', 2, { name: '시련 Ⅱ · 현상금 — 평생', desc: '꿈속의 공고, 액수 칸에 적힌 "괴물"', stage: 's23', boss: 'b_hagen',
  mods: ['glass'], diffOver: { bossHp: 1.15 }, bossPatterns: true,
  bg: 's10_spire', music: 'sad', failLine: '수업은 아직 안 끝났대요. 다시 가요, 아저씨!' });
// ── 브란 ──
trial('bran', 1, { name: '시련 Ⅰ · 무릎 꿇은 단장', desc: '형제들을 위해 무릎 꿇은 단장', stage: 's04', boss: 'b_crimson',
  mods: ['no_sub'], diffOver: { bossHp: 1.3 }, bossPatterns: true,
  bg: 's04_hall', music: 'story', failLine: '단장님은 기다리고 계실 거예요. 다시 가요!' });
trial('bran', 2, { name: '시련 Ⅱ · 사신의 장부', desc: '십 년 일찍 온 사신, 장부의 한 줄', stage: 's11', boss: 'b_death',
  mods: ['no_potion'], diffOver: { bossHp: 1.25 }, bossPatterns: true,
  bg: 's11_chapel', music: 'church', failLine: '장부는 아직 안 덮였어요. 한 번 더요, 아저씨!' });
// ── 리아 ──
trial('lia', 1, { name: '시련 Ⅰ · 열세 번 인형', desc: '촛불 없는 방, 끝나지 않은 가르침', stage: 's22', boss: 'b_nemain',
  mods: ['glass'], diffOver: null, bossPatterns: false,
  reqFlag: 'ex_s22_done', reqText: '외전 「이름 없는 언덕」을 먼저 보아야 한다',
  bg: 's02_graveyard', music: 'story', failLine: '열세 번은 언니가 아니에요. 다시 가요, 언니!' });
trial('lia', 2, { name: '시련 Ⅱ · 기록에 없는 사람', desc: '빙벽 속 까마귀 문신, 기록에 없는 사람', stage: 's10', boss: 'b_frostqueen',
  mods: ['no_potion', 'no_sub'], diffOver: { bossHp: 1.15 }, bossPatterns: true,
  bg: 's10_spire', music: 'sad', failLine: '그분, 아직 집에 가는 길이래요. 데리러 가요!' });
// ── 아젤 ──
trial('azel', 1, { name: '시련 Ⅰ · 자장가', desc: '잊어버린 어머니의 자장가', stage: 's18', boss: 'b_mara',
  mods: [], diffOver: null, bossPatterns: false,
  bg: 's18_nightmare', music: 'story', failLine: '자장가는 끝나지 않았어요. 한 번 더 들어요.' });
trial('azel', 2, { name: '시련 Ⅱ · 아멜리아의 요람', desc: '왕좌 곁 아이 방, 백 년 전 그 밤', stage: 's12', boss: 'b_dracula',
  mods: ['no_potion'], diffOver: { bossHp: 1.25 }, bossPatterns: true,
  bg: 's12_throne', music: 'sad', failLine: '아버님 대답, 아직 못 들으셨잖아요. 다시요!' });
// ── 이졸데 ──
trial('isolde', 1, { name: '시련 Ⅰ · 거울이 가져간 밤', desc: '거울이 품고 간 기사단의 마지막 밤', stage: 's14', boss: 'b_narkissa',
  mods: [], diffOver: null, bossPatterns: false,
  bg: 's14_mirror', music: 'story', failLine: '거울은 그 밤을 아직 쥐고 있어요. 다시 가요!' });
trial('isolde', 2, { name: '시련 Ⅱ · 기사단이 무너진 밤', desc: '하늘이 무너진 밤, 단장의 마지막 명령', stage: 's17', boss: 'b_ziz',
  mods: ['no_potion', 'haste'], diffOver: { bossHp: 1.15 }, bossPatterns: true,
  reqFlag: 'ex_s21_done', reqText: '외전 「하늘 정원의 둥지」를 먼저 보아야 한다',
  bg: 's17_sky', music: 'church', failLine: '폭풍은 지나가요. 언니 창은 안 부러져요!' });

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}
export const TRIALS = deepFreeze(T);
/** 표 순서 (영웅 순 × Ⅰ·Ⅱ) */
export const TRIAL_IDS = Object.freeze(Object.keys(T));
/** 그 영웅의 [Ⅰ, Ⅱ] (없으면 []) */
export function trialsOf(charId) { return TRIAL_IDS.map((id) => T[id]).filter((x) => x.charId === charId).sort((a, b) => a.n - b.n); }
