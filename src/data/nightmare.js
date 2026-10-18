// 「악몽의 군주」 악몽 재대결 데이터 — owner: Stage 5 P3 (docs/specs/nightmare.md §2)
//  NM[id] = { id, boss, stage, twist, hpMul, atkMul, spMul, reward: { rarity }, minions?: [적 id…] }
//   id = 'nm_<stageId>' · boss = 그 스테이지 보스방의 보스 · twist = NM_TWISTS 키 (한 번에 정확히 하나)
//   hpMul/atkMul/spMul: 보스 배율 (game/bosses/boss.js — 체력은 이야기 레벨 기준 초반·후반 보정 위에 곱한다, 공격력, 쉼 단축)
//   reward.rarity: 첫 격파 확정 장비의 최저 등급 (그 스테이지가 주는 가장 높은 등급 이상 — 4 전설, 13·20장 5 신화)
//   minions: 비틀기 '하수인' 이 부르는 적 (없으면 그 스테이지 적 목록의 앞쪽)
//  NM_TWISTS[k] = { id, name, desc, tier: 'strong'|'weak', rules?: 월드 규칙(inventory.js·player.js 가 막는다), hazard?: true }
//  레벨 = max(stage.level + 8, 영웅 레벨 − 2) — nmLevel()
//  배율은 첫 값이다: P3b 가 tools/balance.mjs --nm 로 맞춘다 (이야기 대비 타수 1.3–1.9배 · 한 번에 최대 체력 25% 이하)
import { STAGES } from './stages.js';

/** 악몽 색 (배너·후광·결과 줄) */
export const NM_COLOR = '#e0203a';
/**
 * 입구 스위치 (P3b): ui = 성당 「악몽」 탭 · 월드맵 붉은 「악몽」 단추 · 격파 결과 화면(trial_end 보상 줄).
 * 꺼져 있으면 악몽은 startNightmare 로만 들어간다 (P3a 상태). 시험이 켜고 끌 수 있게 객체로 둔다.
 */
export const NM_FLAGS = { ui: true };   // P3b: test_nightmare --browser 통과 뒤 켰다 (2026-10-18)
/** 실패 화면 엘리제의 한마디 (시련 failLine 자리) */
export const NM_FAIL_LINE = '악몽도 결국 꿈이에요. 숨을 고르고, 다시 가요!';
/** 레벨: 이야기 레벨 + 8, 영웅이 더 높으면 영웅 − 2 */
export const NM_LEVEL_UP = 8;
export const NM_LEVEL_UNDER_HERO = 2;
export const NM_LEVEL_MAX = 120;

export const NM_TWISTS = {
  blood_rain: { id: 'blood_rain', name: '피의 비', desc: '하늘에서 핏방울이 떨어진다 · 바닥의 붉은 표식을 피하라', tier: 'strong', hazard: true },
  cursed_floor: { id: 'cursed_floor', name: '저주받은 바닥', desc: '바닥 한쪽이 저주로 물든다 · 붉게 빛나는 곳에서 비켜서라', tier: 'strong', hazard: true },
  doom_clock: { id: 'doom_clock', name: '종말의 시계', desc: '종이 울리면 땅을 타고 충격파가 달려온다 · 뛰어올라 피하라', tier: 'strong', hazard: true },
  brand: { id: 'brand', name: '핏빛 낙인', desc: '발밑에 낙인이 새겨진다 · 굳기 전에 빠져나가라', tier: 'strong', hazard: true },
  minions: { id: 'minions', name: '하수인', desc: '보스가 하수인을 불러낸다', tier: 'strong', hazard: true },
  no_potion: { id: 'no_potion', name: '물약 금지', desc: '회복약·소모품을 쓸 수 없음', tier: 'weak', rules: { noPotion: true } },
  no_sub: { id: 'no_sub', name: '보조 무기 금지', desc: '보조 무기를 쓸 수 없음', tier: 'weak', rules: { noSub: true } },
  dark: { id: 'dark', name: '어둠', desc: '빛이 사라진다 · 예고와 탄만 빛난다', tier: 'weak', dark: 0.86 },
};

// 1부 (s01–s13) · 2부 (s14–s20) · 외전 (s21–s25) 기본 배율
const P1 = { hpMul: 1.6, atkMul: 1.1, spMul: 1.15 };
const P2 = { hpMul: 1.5, atkMul: 1.05, spMul: 1.12 };
const row = (stage, boss, twist, base, o = {}) => ({ id: `nm_${stage}`, boss, stage, twist, ...base, reward: { rarity: 4 }, ...o });

/**
 * 25 악몽 (스테이지 순서). hpMul 은 P3b 의 tools/balance.mjs --nm 로 맞춘 값 (2026-10-18, 카엘 · 보통/어려움 · 일곱 영웅 가운데값):
 *  권장 레벨(이야기 + 10) 영웅의 보스 타수 ÷ 이야기 보스 타수가 1.3–1.9 (가운데 ≈ 1.57) 안에 들게.
 *  이야기 레벨이 영웅의 직업 단계(10·25 레벨)를 막 넘기는 장(s01–s03 · s07–s08 · s11–s12)은 권장 레벨 영웅이 훨씬 세서 배율이 크게 달라진다.
 */
const ROWS = [
  row('s01', 'b_nightwing', 'blood_rain', P1, { hpMul: 1.25 }),
  row('s02', 'b_banshee', 'minions', P1, { hpMul: 1.7, minions: ['skeleton', 'zombie', 'ghost'] }),
  row('s03', 'b_dullahan', 'no_potion', P1, { hpMul: 1.35 }),
  row('s04', 'b_crimson', 'brand', P1, { hpMul: 1.3, atkMul: 1.05 }),   // 갑주군주는 이야기에서도 초반 보스 가운데 가장 아프게 친다 (1타 ≤ 25% 를 지키려고 공격 배율만 2부 값)
  row('s05', 'b_bonedragon', 'cursed_floor', P1, { hpMul: 1.4 }),
  row('s06', 'b_grimoire', 'no_sub', P1, { hpMul: 1.75 }),
  row('s07', 'b_chimera', 'cursed_floor', P1, { hpMul: 2.0 }),
  row('s08', 'b_leviathan', 'dark', P1, { hpMul: 1.95 }),
  row('s09', 'b_colossus', 'doom_clock', P1, { hpMul: 1.45 }),
  row('s10', 'b_frostqueen', 'no_potion', P1, { hpMul: 1.52 }),   // 보통(이야기 Lv 28)과 어려움(Lv 30, 25 레벨 전직 뒤)의 이야기 싸움 길이가 크게 달라 띠 가운데로
  row('s11', 'b_death', 'brand', P1, { hpMul: 1.85 }),
  row('s12', 'b_dracula', 'blood_rain', P1, { hpMul: 1.95 }),
  row('s13', 'b_chaos', 'dark', P1, { hpMul: 1.75, reward: { rarity: 5 } }),
  row('s14', 'b_narkissa', 'cursed_floor', P2, { hpMul: 1.5 }),
  row('s15', 'b_moloch', 'blood_rain', P2, { hpMul: 1.4 }),
  row('s16', 'b_dagon', 'minions', P2, { hpMul: 1.3, minions: ['merman', 'sunken_priest', 'abyss_angler'] }),
  row('s17', 'b_ziz', 'brand', P2, { hpMul: 1.3 }),
  row('s18', 'b_mara', 'doom_clock', P2, { hpMul: 1.3 }),
  row('s19', 'b_behemoth', 'minions', P2, { hpMul: 1.3, minions: ['fungal_husk', 'frog_demon', 'slime'] }),
  row('s20', 'b_nihil', 'cursed_floor', P2, { hpMul: 1.35, reward: { rarity: 5 } }),
  row('s21', 'b_argen', 'blood_rain', P2, { hpMul: 1.25 }),
  row('s22', 'b_nemain', 'brand', P2, { hpMul: 1.3 }),
  row('s23', 'b_hagen', 'minions', P2, { hpMul: 1.3, minions: ['wolf', 'snow_wolf', 'frozen_knight'] }),
  row('s24', 'b_bride', 'cursed_floor', P2, { hpMul: 1.35 }),
  row('s25', 'b_charon', 'doom_clock', P2, { hpMul: 1.3 }),
];
export const NM = Object.freeze(Object.fromEntries(ROWS.map((r) => [r.id, Object.freeze(r)])));
export const NM_IDS = Object.freeze(ROWS.map((r) => r.id));

/** 'nm_s01' 같은 악몽 id 인가 (표에 있는 것만) */
export const isNightmareId = (id) => typeof id === 'string' && Object.hasOwn(NM, id);
export const nmEntry = (id) => (isNightmareId(id) ? NM[id] : null);
export const nmTwist = (e) => (e && Object.hasOwn(NM_TWISTS, e.twist) ? NM_TWISTS[e.twist] : null);
/** 보스 id → 악몽 행 (없으면 null) */
export function nmOfBoss(bossId) { return ROWS.find((r) => r.boss === bossId) ?? null; }
/** 악몽 레벨 = max(이야기 레벨 + 8, 영웅 레벨 − 2), 1–120 */
export function nmLevel(e, heroLv = 1) {
  const base = STAGES[e?.stage]?.level ?? 1;
  const hl = Number.isFinite(heroLv) ? Math.floor(heroLv) : 1;
  return Math.max(1, Math.min(NM_LEVEL_MAX, Math.max(base + NM_LEVEL_UP, hl - NM_LEVEL_UNDER_HERO)));
}
/** 권장 레벨 (이 레벨부터 악몽 레벨이 영웅을 따라 오른다) */
export const nmRecLevel = (e) => (STAGES[e?.stage]?.level ?? 1) + NM_LEVEL_UP + NM_LEVEL_UNDER_HERO;

// ── [NM-TUNE] 넘친 레벨의 보스 체력 (p3_verify MAJOR-2 · 오케스트레이터 결정 k = 0.7, 2026-10-18) ──
//  악몽 레벨은 영웅을 따라 오르지만(영웅 − 2) boss.js 의 초반·후반 보정은 이야기 레벨에 묶여 있어, 체력은 레벨 곡선을 그대로 타고
//  영웅 화력은 이야기 기준으로만 늘어 Lv 99 영웅의 싸움이 이야기의 2–4배로 길어졌다. 후반 보정을 (악몽 레벨 − 8) 쪽으로 k 만큼 옮긴다:
//   체력 × (late(max(이야기, 악몽 − 8)) ÷ late(이야기))^k — 권장 레벨(악몽 = 이야기 + 8)에서는 정확히 1 (권장 레벨 표는 그대로)
/** 넘친 레벨 체력 완화 지수 */
export const NM_OVERLEVEL_K = 0.7;
/** 후반(Lv 25~) 보스 체력 완화 — game/bosses/boss.js 의 late 와 같은 식 */
export const nmLateEase = (L) => 1 / (1 + Math.max(0, (Number.isFinite(L) ? L : 1) - 24) * 0.035);
/** 넘친 레벨 체력 배율 (≤ 1): baseLevel = 이야기 레벨, level = 악몽 레벨 (월드 레벨) */
export function nmOverLevelHp(baseLevel, level) {
  const b = Number.isFinite(baseLevel) ? baseLevel : 1, l = Number.isFinite(level) ? level : b;
  const f = nmLateEase(Math.max(b, l - NM_LEVEL_UP)) / nmLateEase(b);
  return f >= 1 ? 1 : Math.pow(f, NM_OVERLEVEL_K);
}
