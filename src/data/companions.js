// 동료(탈것 9 · 수호신 11) 순수 데이터 — owner: CMP-DATA (companions §1–4, §9, §12.1; MASTER_PLAN §1.2)
// 순수 데이터 모듈: node 에서 import 가능, DOM 없음. 데이터 모듈(items.js 의 josa)만 import 한다.
//
// id 체계는 MASTER_PLAN §1.2: 탈것 mt_*, 수호신 gd_* (명세의 m_*/g_* 는 LEGACY_IDS 로 옮겨 읽는다).
// 초상화는 EXT-CMP-ART 가 만든 파일 이름 그대로 (portrait 필드). 수치는 명세 Lv 1 기준이며 성장 공식은 아래 함수.
//
// ── 공통 필드 (MOUNTS·GUARDIANS 모든 항목) ─────────────────────────────────────────────
//  id, kind:'mount'|'guardian', part:1|2, chapter(합류 시점 챕터, 정렬용), name, title, color(UI·데미지 숫자 색),
//  role(한 줄 역할), desc(한 줄 소개), portrait('portraits/…', assets.get 키), iconFocus {x,y,s}(초상화 정사각 크롭: 중심 x·w, y·h, 한 변 s·w),
//  obtain { type:'flag'|'boss'|'egg'|'quest'|'shop'|'relics', …, hint(잠긴 칸 안내 문구) }
//    flag   {flag, script?}            progress.flags[flag] 가 참이면 합류 (2부: 'recruit_<id>', 그림메인: 'stable_open')
//    boss   {boss}                     스토리 모드에서 보스 첫 처치 (progress.bosses 에 있으면 소급 합류)
//    egg    {boss, hatchAfter, egg}    보스 첫 처치 → 알 (egg = 알 이름). clears 가 hatchAfter 만큼 늘면 마구간에서 부화
//    quest  {quest}                    그레타의 의뢰 보상 수령
//    shop   {price, chapter, item?}    영혼의 마구간 구입 (chapter = progress.chapter 이상)
//    relics {count, script}            드라큘라의 유물 count 개 (script = 합류 연출 전에 재생할 대사 id)
//  cry { sfx, pitch, extra? }          울음소리 (audio_companions.js 가 등록하는 효과음 이름)
//  palette [..]                        렌더러용 대표 색 (§11.2)
//  join, joinNarr                      합류 연출 대사 (joinNarr=true 면 내레이션으로 표시)
//  chips [3]                           합류 연출의 능력 칩 문구
//  light {color, r, i} | null          lighting.add 값
//
// ── 탈것 전용 ─────────────────────────────────────────────────────────────────────────────
//  rig 'horse'|'boar'|'wolf'|'wyvern'|'bat'|'griffin'|'stag', variant, legs 'straddle'|'kneel', hoof {sfx,pitch,vol}
//  body {w,h}(탑승 중 충돌 AABB, h ≤ 90), seat {x,y}(발 중앙 기준 안장점, 오른쪽을 볼 때), footY(골반→발걸이 깊이)
//  move { speed, airSpeed, accel, decel, airAccel, jump, airJumps, wallJump, gallopAfter }  (Lv 1, §3.4)
//  flight null | {type:'glide', flaps, flapVy, glideFall, glideSpeed} | {type:'fly', stamina, ascend, hoverFall, regen, airSpeed, dive, takeoff}
//  charge { name, desc, dur, speed, mv, type, element, kb, launch, stun, cd, iframes, sfx(§3.6.5 돌진 효과음, 기본 'dash'), invuln?, pass?, superArmor?, breakWalls?,
//           trail? {life, mv, element, rehit}, dir8?, heal?, air? {name, angle, speed, maxT, mv, element, shock{r,mv}} }
//  special { name, desc, kind, cd, air(공중 사용 가능), …kind 별 수치 }   (↓+공격, §3.9)
//  ride {stat: value}, rideDesc          탑승 중 영웅 능력치 보너스 (유대 2단계부터 ×1.5)
//  passive {name, desc}
//  hp, absorb, taken, armor, recall      체력 배율(영웅 최대 HP 기준), 흡수율, 받는 피해 배율, 경직 저항, 재소환 대기(초)
//  hazard {spike, lava, poison, blood}   탑승 중 위험 지형 피해 배율 (0 = 면역)
//  windMul, blightMul                    돌풍·부패 게이지 배율 (world2 §14; 기본 1)
//
// ── 수호신 전용 ───────────────────────────────────────────────────────────────────────────
//  move 'fly'|'ground'|'float', hover(지면형이지만 떠 있음), size {w,h}, front(z 11, 아니면 9), anchor {dx,dy}, speed(최대 속도 px/s),
//  engage(표적 탐색 거리, +4·lv), bias null|'front'|'behind'|'lowhp', perch null|'head'|'shoulder'
//  attack { name, desc, kind, interval, range, mv, type, element, …kind 별 수치 }   (자동 공격, §4.9)
//  skill  { name, desc, cd, line(스킬 외침), …}                                         (guard 버튼 / 자동)
//  assist { name, desc, mv, type, element, stun?, … }                                   (협공)
//  aura { base {stat}, perLv {stat} }                                                   (장착 중 항상, 유대 2단계부터 ×1.5)
//  passive null | {name, desc, …수치}
import { josa } from './items.js';

export const CMP_MAX_LV = 30;
export const BOND_MAX = 200;
export const BOND_RANKS = [0, 15, 40, 80, 130, 200];
export const BOND_NAMES = ['낯선 사이', '신뢰', '교감', '공명', '각성', '영혼 결속'];
/** 유대 단계별 효과 (메뉴 표시용, §2.4) */
export const BOND_PERKS = [
  '',
  '스킬·특수기 위력 +25%',
  '오라·탑승 효과 ×1.5',
  '공명 — 필살기에 함께 나선다 · 협공 대기 1.8초',
  '각성 — 모습이 바뀐다 · 돌진 재사용 -30% · 공격 간격 -15% · 스킬 위력 +50%',
  '영혼 결속 — 수호신 스킬 재사용 -20% · 탈것이 쓰러질 위기를 한 번 버틴다',
];
/** 유대 포인트 획득량 (§2.4) — stage/tribute 는 companion_state·events, boss/kills 는 CompanionSystem 이 쓴다 */
export const BOND_GAIN = { stage: 6, boss: 10, tribute: 8, killsPer: 50, killsCap: 5 };
/** 동료 경험치 규칙 (§2.3) */
export const CMP_EXP = { killShare: 0.4, mountKillShare: 0.4, perTile: 1, tileCap: 300, bossShare: 0.5 };

// ── 성장 공식 (§2.3, §9) ─────────────────────────────────────────────────────────────────
const lvOf = (lv) => (Number.isFinite(lv) ? Math.max(1, Math.min(CMP_MAX_LV, Math.floor(lv))) : 1);
const r4 = (v) => Math.round(v * 10000) / 10000;
/** 다음 레벨까지 필요한 경험치: floor(40·lv^1.6 + 40·lv) → Lv1 80, Lv5 725, Lv10 1 992 … (Lv 30 이 최대) */
export function cexpToNext(lv) { const l = lvOf(lv); return Math.floor(40 * Math.pow(l, 1.6) + 40 * l); }
/** 수호신 위력 = 영웅 max(공격력, 마력) × guardianShare(lv) × (1 + 0.04·유대 단계) */
export function guardianShare(lv) { return r4(0.30 + 0.015 * (lvOf(lv) - 1)); }
/** 탈것 공격 위력 = 영웅 max(공격력, 마력) × trampleRatio(lv) */
export function trampleRatio(lv) { return r4(0.8 + 0.02 * (lvOf(lv) - 1)); }
/** 스킬(수호신 스킬·탈것 특수기)·재소환 대기 배율 */
export function cdMul(lv) { return r4(1 - 0.01 * (lvOf(lv) - 1)); }
/** 탈것 체력 배율 (레벨) */
export function mountHpMul(lv) { return r4(1 + 0.02 * (lvOf(lv) - 1)); }
/** 탈것 속도 배율 (레벨) */
export function mountSpeedMul(lv) { return r4(1 + 0.005 * (lvOf(lv) - 1)); }
/** 유대 포인트 → 단계 0~5 */
export function bondRank(points) {
  const p = Number.isFinite(points) ? points : 0;
  let r = 0;
  for (let i = 1; i < BOND_RANKS.length; i++) if (p >= BOND_RANKS[i]) r = i;
  return r;
}
/** 다음 유대 단계에 필요한 포인트 (최고 단계면 null) */
export function bondNext(points) { const r = bondRank(points); return r >= BOND_RANKS.length - 1 ? null : BOND_RANKS[r + 1]; }

// ── 공통 규칙 상수 (§3, §4; 런타임 패키지가 읽는다) ────────────────────────────────────────
export const MOUNT_RULES = {
  summonT: 0.45, seatT: 0.25, dismountT: 0.30, resummonCd: 2, ultRemount: 1.4, skillRemount: 1.2,
  gallopAfter: 0.35, gallopMin: 0.85, gallopBonus: 0.06, turnMin: 0.6, turnT: 0.18,
  attackMoveMul: 0.7, reachBonus: 0.15, riderLiftY: 41,
  charge: { stun: 0.4, hitstop: 0.04, shake: 2, ghostEvery: 0.04 },
  special: { hitstop: 0.08, shake: 6, punchZoom: 1.03 },
  landing: { vy: 700, r: 70, mv: 0.4, kb: [180, -260], hitstop: 0.03, shake: 3 },
  damage: { bossTaken: 1.3, heavyKb: 420, lightIframes: 0.6, heavyIframes: 1.0, heavyHurtT: 0.2, heavyKbMul: 0.5 },
  knock: { vy: -560, vx: 260, iframes: 1.2, stumble: 0.4, flee: 500, fade: 1.2 },
  lastStand: { hp: 1, invuln: 3 },
  hazard: { spike: 0.15, liquid: 0.12, iframes: 0.8, spikeVy: -560 },
  regen: 0.03, swim: { speedMul: 0.6, maxFall: 180, jumpVy: -520 }, duck: { probe: 14, rate: 8, drop: 20 },
  maxBodyH: 90,
};
export const GUARD_RULES = {
  leash: 560, teleport: 620, teleportDy: 420, retarget: 0.35, spring: { k: 40, c: 12.6 },
  secondDx: 34, perchIdle: 3, flinch: 0.3, deadAlpha: 0.3,
  assistCd: 2.5, assistCdRes: 1.8, assist: { hitstop: 0.03, shake: 2 },
  resonanceDelay: 0.9, resonanceMul: 0.6,
  auto: { enemies: 3, r: 300, bossR: 520, fairyHp: 0.4 },
  attack: { hitstop: 0, shake: 0.6, kb: [140, -80] },
  spGainMul: 0.4, styleMul: 0.5,
};

// ── 로스터 ────────────────────────────────────────────────────────────────────────────────
const MOUNT_DEFAULTS = {
  variant: null, legs: 'straddle', flight: null, light: null, windMul: 1, blightMul: 1, joinNarr: true,
};
const mount = (o) => {
  const d = { kind: 'mount', ...MOUNT_DEFAULTS, ...o };
  d.hazard = { spike: 1, lava: 1, poison: 1, blood: 1, ...(o.hazard || {}) };
  d.move = { airSpeed: null, wallJump: false, gallopAfter: MOUNT_RULES.gallopAfter, ...o.move };
  d.charge = { type: 'phys', element: null, kb: [360, -220], launch: false, stun: MOUNT_RULES.charge.stun, iframes: 0, breakWalls: false, sfx: 'dash', ...o.charge };
  d.special = { type: 'phys', element: null, air: false, ...o.special };
  return d;
};
const guardian = (o) => ({
  kind: 'guardian', hover: false, bias: null, perch: null, joinNarr: false, passive: null, ...o,
  attack: { type: 'phys', element: null, ...o.attack },
  assist: { type: 'phys', element: null, ...o.assist },
  aura: { base: {}, perLv: {}, ...o.aura },
});

export const MOUNTS = {
  // ─ 1부 (§1.1, §3.4, §3.9) ─
  mt_warhorse: mount({
    id: 'mt_warhorse', part: 1, chapter: 1, name: '그림메인', title: '흑철 군마', color: '#ff6a4a',
    role: '균형형 — 묵직한 돌진과 앞발 강타',
    desc: '붉은 갈기를 휘날리는 흑철의 군마. 불타는 마구간에서 끝까지 살아남았다.',
    portrait: 'portraits/cmp_m_warhorse', iconFocus: { x: 0.64, y: 0.31, s: 0.46 },
    obtain: { type: 'flag', flag: 'stable_open', script: 'cmp_stable_open', hint: '1장을 클리어한 뒤 마을 동쪽 성문 밖 「영혼의 마구간」을 찾아가면 합류' },
    cry: { sfx: 'neigh', pitch: 1 }, hoof: { sfx: 'gallop', pitch: 1, vol: 1 },
    rig: 'horse', palette: ['#141018', '#2a2a3a', '#8a1020', '#c8a040', '#ff6a2a'],
    body: { w: 60, h: 90 }, seat: { x: -4, y: -56 }, footY: 26,
    move: { speed: 400, accel: 1500, decel: 2000, airAccel: 1200, jump: 820, airJumps: 0 },
    charge: { name: '돌진', desc: '잠시 무적이 되어 앞으로 내달리며 적을 들이받아 띄운다. 부서지는 벽도 뚫는다.',
      dur: 0.36, speed: 780, mv: 1.1, kb: [420, -260], launch: true, cd: 0.7, iframes: 0.2, breakWalls: true },
    special: { name: '앞발 강타', desc: '앞발을 치켜들었다가 내리찍어 좌우 넓은 범위의 적을 크게 띄운다.', kind: 'stomp', cd: 4,
      rear: 0.3, invuln: 0.3, box: { x: -180, y: -64, w: 360, h: 64 }, mv: 1.6, launch: true, kb: [360, -520], hitstop: 0.08, shake: 8 },
    ride: { dmgReduce: 5 }, rideDesc: '받는 피해 5% 감소',
    passive: { name: '흑철 마갑', desc: '가벼운 공격에는 흔들리지 않는다.' },
    hp: 0.90, absorb: 0.70, taken: 1.00, armor: 0.10, recall: 20,
    join: '불타는 마구간에서 끝까지 버틴 검은 군마. 그 눈에는 아직 꺼지지 않은 불씨가 일렁인다.',
    chips: ['돌진', '앞발 강타', '받는 피해 -5%'],
  }),
  mt_boar: mount({
    id: 'mt_boar', part: 1, chapter: 2, name: '바르그', title: '철엄니 멧돼지', color: '#e0904a',
    role: '돌파형 — 멈추지 않는 돌격과 벽 부수기',
    desc: '강철을 씌운 엄니로 무엇이든 들이받는 거대한 전투 멧돼지.',
    portrait: 'portraits/cmp_m_boar', iconFocus: { x: 0.62, y: 0.35, s: 0.55 },
    obtain: { type: 'shop', price: 6000, chapter: 2, hint: '영혼의 마구간에서 6,000 G에 구입 (2장 클리어 후)' },
    cry: { sfx: 'boar_grunt', pitch: 1 }, hoof: { sfx: 'gallop', pitch: 1.3, vol: 0.5 },
    rig: 'boar', palette: ['#3a2618', '#5a3a24', '#8a8e9a', '#c8ccd8', '#ff4a2a'],
    body: { w: 64, h: 80 }, seat: { x: -6, y: -48 }, footY: 20,
    // 점프 700 은 일부러 낮다 (돌파형의 약점): 지금 중력(2200)으로 약 2.3칸 — 3칸 턱(≈796 필요)은 못 넘어 바르그로는 108방 중 64방만
    // 내리지 않고 지난다 (그림메인 93 · 나머지 103–104; tools/scan_mount_fit.mjs). 그런 턱에 막히면 mount.js ledgeHint 가 방마다 한 번
    // '바르그는 이 턱을 넘지 못한다 — 내려서 올라가자' 를 띄운다 (R 로 내려 뛰어오른 뒤 다시 R). 리드 결정 R1-REQ-369: 700 유지.
    move: { speed: 350, accel: 2600, decel: 2600, airAccel: 1100, jump: 700, airJumps: 0 },
    charge: { name: '철엄니 돌격', desc: '어떤 공격에도 멈추지 않고 돌격해 적을 크게 밀어낸다. 부서지는 벽도 뚫는다.',
      dur: 0.5, speed: 820, mv: 1.4, kb: [520, -200], cd: 1.0, iframes: 0.15, superArmor: true, breakWalls: true },
    special: { name: '땅 파헤치기', desc: '땅을 파헤쳐 바위 세 덩이를 앞쪽으로 흩뿌린다. 바위는 떨어진 자리에서 부서진다.', kind: 'rocks', cd: 5,
      rocks: [{ vx: 360, vy: -520 }, { vx: 460, vy: -450 }, { vx: 560, vy: -380 }], mv: 0.9, burst: { r: 30, mv: 0.5 } },
    ride: { dmgReduce: 8 }, rideDesc: '받는 피해 8% 감소',
    passive: { name: '강철 가죽', desc: '가벼운 공격에 흔들리지 않고, 가시 함정 피해가 절반이 된다.' },
    hp: 1.30, absorb: 0.80, taken: 0.85, armor: 0.16, recall: 16,
    hazard: { spike: 0.5 },
    join: '무엇이든 들이받아 부수는 강철 엄니의 멧돼지. 고집은 세지만 한 번 따르면 끝까지 따른다.',
    chips: ['철엄니 돌격', '땅 파헤치기', '받는 피해 -8%'],
  }),
  mt_skelsteed: mount({
    id: 'mt_skelsteed', part: 1, chapter: 3, name: '코슈타', title: '망령 해골마', color: '#6ad0ff',
    role: '돌파형 — 적을 꿰뚫는 망령 질주, 위험 지대 면역',
    desc: '갈비뼈 속에 푸른 영혼불이 타오르는 해골 군마. 머리 없는 기사의 옛 애마.',
    portrait: 'portraits/cmp_m_skelsteed', iconFocus: { x: 0.44, y: 0.27, s: 0.4 },
    obtain: { type: 'boss', boss: 'b_dullahan', hint: '3장 보스 「둘라한」을 처치하면 합류' },
    cry: { sfx: 'neigh', pitch: 0.8, extra: 'bone_rattle' }, hoof: { sfx: 'gallop', pitch: 1, vol: 1 },
    rig: 'horse', variant: 'skeleton', palette: ['#d8d0bc', '#8a8478', '#1a1418', '#6ad0ff', '#e0f8ff'],
    light: { color: '#6ad0ff', r: 70, i: 0.4 },
    body: { w: 58, h: 88 }, seat: { x: -4, y: -54 }, footY: 26,
    move: { speed: 420, accel: 2000, decel: 2200, airAccel: 1300, jump: 800, airJumps: 1 },
    airJumpName: '유령 도약',
    charge: { name: '망령 질주', desc: '완전 무적 상태로 적을 뚫고 지나가며 푸른 망령불 자국을 남긴다.',
      dur: 0.3, speed: 900, mv: 0.9, element: 'dark', kb: [300, -200], cd: 0.8, iframes: 0.3, invuln: true, pass: true,
      trail: { life: 1.2, mv: 0.35, element: 'dark', rehit: 0.25 } },
    special: { name: '저승 사슬', desc: '앞쪽 세 곳에서 저승의 사슬 기둥이 솟아 적을 오래 묶어 둔다.', kind: 'chains', cd: 6, element: 'dark',
      at: [70, 150, 230], stagger: 0.08, w: 44, h: 160, life: 0.5, mv: 0.8, stun: 1.2 },
    ride: { dark: 15 }, rideDesc: '암흑 피해 +15%',
    passive: { name: '망자의 발굽', desc: '가시·독·피 웅덩이에 다치지 않고 용암 피해는 절반이 된다. 공중에서 한 번 더 도약한다.' },
    hp: 0.80, absorb: 0.70, taken: 1.00, armor: 0.10, recall: 18,
    hazard: { spike: 0, poison: 0, blood: 0, lava: 0.5 },
    join: '머리 없는 기사를 태우던 망령마. 이제 새 주인을 저승 끝까지라도 태우려 한다.',
    chips: ['망령 질주', '저승 사슬', '위험 지형 면역'],
  }),
  mt_direwolf: mount({
    id: 'mt_direwolf', part: 1, chapter: 4, name: '스콜', title: '서리 늑대', color: '#8ae8ff',
    role: '기동형 — 가장 빠른 발, 벽 차기와 2단 점프',
    desc: '달을 쫓는 늑대 왕의 피를 이은 거대한 서리 늑대.',
    portrait: 'portraits/cmp_m_direwolf', iconFocus: { x: 0.68, y: 0.27, s: 0.4 },
    obtain: { type: 'quest', quest: 'cq_skoll', hint: '그레타의 의뢰 「늑대 왕의 시험」' },
    cry: { sfx: 'wolf_howl', pitch: 1 }, hoof: { sfx: 'footstep', pitch: 0.8, vol: 0.8 },
    rig: 'wolf', legs: 'kneel', palette: ['#c8d8e8', '#6a7a8a', '#2a3440', '#8ae8ff', '#ffffff'],
    body: { w: 56, h: 78 }, seat: { x: -2, y: -44 }, footY: 16,
    move: { speed: 480, accel: 3400, decel: 3000, airAccel: 2000, jump: 880, airJumps: 1, wallJump: true },
    charge: { name: '송곳니 돌진', desc: '순식간에 달려들어 물어뜯고 적을 얼려 잠시 경직시킨다.',
      dur: 0.26, speed: 860, mv: 1.2, element: 'ice', kb: [320, -200], stun: 0.5, cd: 0.6, iframes: 0.15 },
    special: { name: '서리 포효', desc: '주위의 적을 얼리는 포효를 내지르고, 5초 동안 공격 속도를 15% 높인다.', kind: 'roar', cd: 7, element: 'ice',
      r: 260, mv: 0.8, stun: 1.0, buff: { atkSpd: 15, dur: 5 } },
    ride: { crit: 8, ice: 15 }, rideDesc: '치명타 확률 +8% · 냉기 피해 +15%',
    passive: { name: '늑대의 발놀림', desc: '벽을 차고 오르고, 공중에서 한 번 더 뛴다.' },
    hp: 0.70, absorb: 0.60, taken: 1.10, armor: 0.06, recall: 14,
    join: '달을 쫓는 늑대의 피를 이은 서리 늑대. 약한 자는 결코 태우지 않는다.',
    chips: ['송곳니 돌진', '서리 포효', '벽 차기 · 2단 점프'],
  }),
  mt_wyvern: mount({
    id: 'mt_wyvern', part: 1, chapter: 7, name: '스칼렛', title: '진홍 와이번', color: '#ff4a5a',
    role: '공중전 — 활공, 급강하, 화염 숨결',
    desc: '연구소의 알에서 태어난 어린 진홍 비룡. 목구멍에 늘 불씨를 머금고 있다.',
    portrait: 'portraits/cmp_m_wyvern', iconFocus: { x: 0.52, y: 0.25, s: 0.36 },
    obtain: { type: 'egg', boss: 'b_chimera', hatchAfter: 2, egg: '진홍 비룡의 알', hint: '7장 보스 「키메라 호문쿨루스」가 남긴 알을 부화시키면 합류' },
    cry: { sfx: 'roar_small', pitch: 1 }, hoof: { sfx: 'footstep', pitch: 0.8, vol: 0.8 },
    rig: 'wyvern', palette: ['#a01828', '#5a0a14', '#ff8a3a', '#ffd070', '#2a1418'],
    light: { color: '#ff7a2a', r: 60, i: 0.35 },
    body: { w: 66, h: 90 }, seat: { x: -10, y: -58 }, footY: 24,
    move: { speed: 330, accel: 2000, decel: 2000, airAccel: 1600, jump: 760, airJumps: 0 },
    flight: { type: 'glide', flaps: 3, flapVy: -620, glideFall: 150, glideSpeed: 400 },
    charge: { name: '날개 돌진', desc: '땅에서는 날개를 펴고 돌진하고, 공중에서는 비스듬히 내리꽂혀 착지 충격파를 일으킨다.',
      dur: 0.3, speed: 700, mv: 1.0, element: 'fire', kb: [360, -240], cd: 1.0, iframes: 0.2,
      air: { name: '급강하', angle: 50, speed: 900, maxT: 0.6, mv: 1.5, element: 'fire', shock: { r: 120, mv: 0.8 } } },
    special: { name: '화염 숨결', desc: '1초 동안 앞쪽으로 불길을 뿜는다. 공중에서도 쓸 수 있다.', kind: 'breath', cd: 6, element: 'fire', type: 'mag', air: true,
      dur: 1.0, box: { w: 220, h: 80 }, rehit: 0.12, mv: 0.35, vyMax: 60 },
    ride: { fire: 20, resFire: 30 }, rideDesc: '화염 피해 +20% · 화염 저항 +30%',
    passive: { name: '비룡의 날개', desc: '날갯짓 세 번과 활공으로 멀리 날아가고, 용암에 다치지 않는다.' },
    hp: 1.00, absorb: 0.70, taken: 1.00, armor: 0.12, recall: 22,
    hazard: { lava: 0 },
    join: '연구소의 알에서 태어난 진홍의 비룡. 태어나 처음 본 당신을 어미로 여긴다.',
    chips: ['날개 돌진 · 급강하', '화염 숨결', '활공'],
  }),
  mt_giantbat: mount({
    id: 'mt_giantbat', part: 1, chapter: 11, name: '녹티스', title: '거대 박쥐', color: '#ff3a4a',
    role: '비행형 — 자유 비행, 여덟 방향 흡혈 급습',
    desc: '핏줄이 비치는 날개를 가진 거대한 흡혈 박쥐. 백작의 옛 권속이다.',
    portrait: 'portraits/cmp_m_giantbat', iconFocus: { x: 0.52, y: 0.42, s: 0.38 },
    obtain: { type: 'relics', count: 5, script: 'cmp_bat_arrive', hint: '드라큘라의 유물 5개를 모으면…' },
    cry: { sfx: 'screech', pitch: 1 }, hoof: { sfx: 'footstep', pitch: 0.8, vol: 0.7 },
    rig: 'bat', palette: ['#141016', '#3a1a24', '#8a1426', '#ff2a3a', '#c8c8d0'],
    light: { color: '#ff2a3a', r: 50, i: 0.3 },
    body: { w: 70, h: 84 }, seat: { x: -4, y: -52 }, footY: 22,
    move: { speed: 300, airSpeed: 400, accel: 1800, decel: 2000, airAccel: 2600, jump: 700, airJumps: 0 },
    flight: { type: 'fly', stamina: 3.0, ascend: -380, hoverFall: 110, regen: 1.5, airSpeed: 400, dive: 700, takeoff: -420 },
    charge: { name: '흡혈 급습', desc: '여덟 방향 어디로든 급습하고, 준 피해의 20%만큼 녹티스의 체력을 회복한다.',
      dur: 0.32, speed: 880, mv: 1.1, element: 'dark', kb: [300, -200], cd: 0.8, iframes: 0.2, dir8: true, heal: 0.2 },
    special: { name: '초음파', desc: '앞쪽으로 초음파를 쏘아 적을 오래 경직시키고, 4초 동안 주변의 비밀을 드러낸다.', kind: 'sonar', cd: 8, element: 'dark', type: 'mag', air: true,
      box: { w: 360, h: 160 }, mv: 0.6, stun: 1.2, reveal: { tiles: 5, dur: 4 } },
    ride: { lifesteal: 3 }, rideDesc: '흡혈 +3%',
    passive: { name: '밤의 날개', desc: '기력이 남아 있는 동안 자유롭게 날아오른다.' },
    hp: 0.75, absorb: 0.60, taken: 1.15, armor: 0.06, recall: 24,
    join: '유물의 피 냄새를 따라 날아든 백작의 옛 권속. 이상하게도 당신에게 고개를 숙인다.',
    chips: ['흡혈 급습', '초음파', '자유 비행'],
  }),
  // ─ 2부 (world2 §14; 수치 MASTER_PLAN §1.2) ─
  mt_ignis: mount({
    id: 'mt_ignis', part: 2, chapter: 15, name: '이그니스', title: '화염 군마', color: '#ff8a2a',
    role: '돌격형 — 불꽃 돌진과 업화의 발굽',
    desc: '용광로의 사슬에서 풀려난 불꽃의 군마. 갈기마다 꺼지지 않는 불길이 인다.',
    portrait: 'portraits/cmp_mt_ignis', iconFocus: { x: 0.3, y: 0.33, s: 0.42 },
    obtain: { type: 'flag', flag: 'recruit_mt_ignis', hint: '15장 「영겁의 용광로」에서 만날 수 있다' },
    cry: { sfx: 'neigh', pitch: 0.9, extra: 'fire' }, hoof: { sfx: 'gallop', pitch: 0.95, vol: 1 },
    rig: 'horse', variant: 'fire', palette: ['#1a0e0a', '#3a1a10', '#ff6a1a', '#ffc040', '#fff0b0'],
    light: { color: '#ff8a2a', r: 110, i: 0.55 },
    body: { w: 60, h: 90 }, seat: { x: -4, y: -56 }, footY: 26,
    move: { speed: 430, accel: 1700, decel: 2100, airAccel: 1300, jump: 820, airJumps: 0 },
    charge: { name: '화염 돌진', desc: '불꽃을 두르고 내달려 적을 띄우고, 지나간 자리에 1초 동안 타오르는 불씨를 남긴다.',
      dur: 0.38, speed: 820, mv: 1.3, element: 'fire', kb: [440, -280], launch: true, cd: 0.8, iframes: 0.2, breakWalls: true,
      trail: { life: 1.0, mv: 0.3, element: 'fire', rehit: 0.25 } },
    special: { name: '업화 발굽', desc: '앞발을 치켜들었다가 내리찍어 양옆으로 불기둥 세 줄기를 차례로 솟구치게 한다.', kind: 'hooves', cd: 5, element: 'fire',
      rear: 0.3, invuln: 0.3, stomp: { box: { x: -100, y: -60, w: 200, h: 60 }, mv: 1.0, kb: [300, -420], launch: true },
      pillars: { at: [70, 140, 210], both: true, stagger: 0.08, w: 44, h: 150, life: 0.5, mv: 0.9 }, hitstop: 0.08, shake: 7 },
    ride: { fire: 20, resFire: 20 }, rideDesc: '화염 피해 +20% · 화염 저항 +20%',
    passive: { name: '용광로의 피', desc: '용암에 닿았을 때 받는 피해가 절반이 되고, 발굽 자국마다 불씨가 남는다.' },
    hp: 0.95, absorb: 0.70, taken: 1.00, armor: 0.12, recall: 18,
    hazard: { lava: 0.5 },
    join: '몰록의 용광로에서 사슬을 끊고 풀려난 화염 군마. 이제 당신을 태우고 어디든 불길처럼 달려간다.',
    chips: ['화염 돌진', '업화 발굽', '용암 피해 절반'],
  }),
  mt_gale: mount({
    id: 'mt_gale', part: 2, chapter: 17, name: '게일', title: '폭풍 그리핀', color: '#9fd0ff',
    role: '공중 기동형 — 여덟 방향 돌격과 뇌명 급강하',
    desc: '지즈의 마지막 번개를 맞고 단숨에 자라난 그리핀. 날개깃마다 전기가 흐른다.',
    portrait: 'portraits/cmp_mt_gale', iconFocus: { x: 0.76, y: 0.56, s: 0.3 },
    obtain: { type: 'flag', flag: 'recruit_mt_gale', hint: '17장 「폭풍의 공중정원」에서 만날 수 있다' },
    cry: { sfx: 'griffin_cry', pitch: 1 }, hoof: { sfx: 'footstep', pitch: 0.8, vol: 0.8 },
    rig: 'griffin', palette: ['#d8d0c0', '#6a5a4a', '#3a4a6a', '#9fd0ff', '#ffe880'],
    light: { color: '#bfe0ff', r: 70, i: 0.35 },
    body: { w: 64, h: 86 }, seat: { x: -6, y: -54 }, footY: 22,
    move: { speed: 400, airSpeed: 440, accel: 2200, decel: 2200, airAccel: 2000, jump: 840, airJumps: 1 },
    flight: { type: 'glide', flaps: 2, flapVy: -600, glideFall: 140, glideSpeed: 440 },
    charge: { name: '질풍 돌격', desc: '여덟 방향 어디로든 번개처럼 돌격해 적을 잠시 감전시킨다.',
      dur: 0.30, speed: 880, mv: 1.1, element: 'thunder', kb: [320, -220], stun: 0.3, cd: 0.8, iframes: 0.2, dir8: true },
    special: { name: '뇌명 급강하', desc: '번개를 두르고 내리꽂혀 충격파와 번개 기둥을 일으킨다. 땅에서는 먼저 높이 도약한다.', kind: 'thunderdive', cd: 6,
      element: 'thunder', type: 'mag', air: true, leapVy: -700, diveSpeed: 900,
      shock: { r: 140, mv: 1.3 }, columns: { at: [120, 240], both: true, w: 40, h: 220, life: 0.4, mv: 0.8 }, hitstop: 0.08, shake: 7 },
    ride: { thunder: 15, jumpPow: 8 }, rideDesc: '번개 피해 +15% · 점프력 +8%',
    passive: { name: '폭풍의 깃', desc: '공중에서 한 번 더 뛰고 활공하며, 돌풍에 밀리는 힘이 절반이 된다.' },
    hp: 0.80, absorb: 0.65, taken: 1.05, armor: 0.08, recall: 20,
    windMul: 0.5,
    join: '폭풍 속에서 태어난 그리핀이 당신 곁에 날개를 접었다. 이제 어떤 바람도 두렵지 않다.',
    chips: ['질풍 돌격', '뇌명 급강하', '돌풍 저항'],
  }),
  mt_silva: mount({
    id: 'mt_silva', part: 2, chapter: 19, name: '실바', title: '백록 신령', color: '#e8f0c8',
    role: '정화형 — 뿔 돌격과 정화의 울음',
    desc: '썩어 가는 숲을 지켜 온 흰 사슴의 신령. 뿔 사이에 맑은 빛을 품고 있다.',
    portrait: 'portraits/cmp_mt_silva', iconFocus: { x: 0.47, y: 0.44, s: 0.34 },
    obtain: { type: 'flag', flag: 'recruit_mt_silva', hint: '19장 「썩어가는 숲」에서 만날 수 있다' },
    cry: { sfx: 'stag_call', pitch: 1 }, hoof: { sfx: 'gallop', pitch: 1.15, vol: 0.8 },
    rig: 'stag', palette: ['#f0f0e8', '#b8b8a8', '#6a8a5a', '#e8f0c8', '#fff8d0'],
    light: { color: '#fff8d0', r: 90, i: 0.45 },
    body: { w: 58, h: 88 }, seat: { x: -4, y: -54 }, footY: 24,
    move: { speed: 440, accel: 2000, decel: 2200, airAccel: 1500, jump: 900, airJumps: 1 },
    airJumpName: '신령의 도약',
    charge: { name: '뿔 돌격', desc: '신성한 뿔로 들이받아 적을 띄우고 경직시킨다.',
      dur: 0.32, speed: 840, mv: 1.2, element: 'holy', kb: [360, -320], launch: true, stun: 0.6, cd: 0.7, iframes: 0.2 },
    special: { name: '정화의 울음', desc: '맑은 울음으로 주위의 적을 경직시키고 부패를 씻어 내며, 탄 사람의 체력을 5% 회복한다.', kind: 'purify', cd: 8,
      element: 'holy', type: 'mag', r: 240, mv: 0.9, stun: 0.8, cleanse: 40, heal: 0.05 },
    ride: { holy: 15, hpRegen: 1 }, rideDesc: '신성 피해 +15% · HP 재생 +1/초',
    passive: { name: '숲의 가호', desc: '부패 게이지가 쌓이는 속도가 절반이 되고, 독 웅덩이에 다치지 않는다.' },
    hp: 0.85, absorb: 0.65, taken: 1.00, armor: 0.10, recall: 16,
    hazard: { poison: 0 }, blightMul: 0.5,
    join: '부패에서 풀려난 흰 사슴의 신령이 고개를 숙였다. 뿔 사이의 빛이 다시 또렷하게 빛난다.',
    chips: ['뿔 돌격', '정화의 울음', '부패 저항'],
  }),
};

export const GUARDIANS = {
  // ─ 1부 (§1.2, §4.9) ─
  gd_fairy: guardian({
    id: 'gd_fairy', part: 1, chapter: 2, name: '아리아', title: '빛의 요정', color: '#ffe070',
    role: '치유·보호형 — 회복과 무적 결계',
    desc: '밴시의 등불에 갇혀 있던 작은 빛의 요정. 잠자리 날개 두 쌍으로 날아다닌다.',
    portrait: 'portraits/cmp_g_fairy', iconFocus: { x: 0.45, y: 0.28, s: 0.38 },
    obtain: { type: 'boss', boss: 'b_banshee', hint: '2장 보스 「밴시 여왕」을 처치하면 합류' },
    cry: { sfx: 'fairy_chime', pitch: 1 }, palette: ['#ffe070', '#f8d8a0', '#7ac860', '#bfe8ff', '#ffffff'],
    move: 'fly', size: { w: 16, h: 20 }, front: true, anchor: { dx: 34, dy: -96 }, speed: 1000, engage: 320, bias: 'front', perch: 'head',
    attack: { name: '빛의 바늘', desc: '적을 쫓아가는 빛의 바늘을 쏜다.', kind: 'proj', proj: 'orb', homing: true, speed: 700,
      mv: 0.9, type: 'mag', element: 'holy', interval: 1.4, range: 320 },   // mv 0.5→0.9 · 협공 0.8→1.0: 지원형이어도 몫 [6%, 30%] 안 (companions §9 B1 — R1-REQ-367)
    skill: { name: '요정의 가호', desc: '최대 HP의 25%를 회복하고 2초 동안 황금 결계로 모든 피해를 막는다.', cd: 35, heal: 0.25, shield: 2.0,
      line: '빛이여, 이 사람을 지켜 줘!' },
    assist: { name: '빛의 파동', desc: '적 주위에 빛의 파동을 일으킨다.', kind: 'ring', r: 60, mv: 1.0, type: 'mag', element: 'holy' },
    aura: { base: { hpRegen: 0.8, resHoly: 10 }, perLv: { hpRegen: 0.04 } },
    passive: { name: '치유의 맥동', desc: 'HP가 85% 미만이면 8초마다 최대 HP의 4%를 회복시킨다.', every: 8, below: 0.85, heal: 0.04, healPerLv: 0.001 },
    light: { color: '#fff2b0', r: 110, i: 0.7 },
    join: '밴시의 등불에서 꺼내 줘서 고마워! 이제 내가 널 지켜 줄게!',
    chips: ['요정의 가호', '치유의 맥동', 'HP 재생'],
  }),
  gd_spiritwolf: guardian({
    id: 'gd_spiritwolf', part: 1, chapter: 2, name: '하티', title: '영혼 늑대', color: '#7ee0ff',
    role: '근접 측면형 — 등 뒤를 지키는 늑대',
    desc: '안개 묘지를 떠돌던 푸른 늑대의 영혼. 몸 안에 별빛이 흐른다.',
    portrait: 'portraits/cmp_g_spiritwolf', iconFocus: { x: 0.44, y: 0.28, s: 0.34 },
    obtain: { type: 'quest', quest: 'cq_hati', hint: '그레타의 의뢰 「묘지의 푸른 울음」' },
    cry: { sfx: 'wolf_howl', pitch: 1.3 }, palette: ['#7ee0ff', '#3a8ab0', '#0e2a3a', '#e8fbff', '#ffffff'],
    move: 'ground', size: { w: 50, h: 36 }, front: false, anchor: { dx: 60, dy: 0 }, speed: 1100, engage: 380, bias: 'behind',
    attack: { name: '덮치기', desc: '가까운 적에게 뛰어들어 두 번 물어뜯는다. 등 뒤의 적을 먼저 노린다.', kind: 'pounce',
      leap: 380, leapT: 0.25, bites: 2, gap: 0.12, box: { w: 50, h: 40 }, mv: 0.7, element: 'ice', interval: 1.0, range: 380 },
    skill: { name: '늑대 무리', desc: '유령 늑대 세 마리가 뒤에서 달려 나가 앞을 휩쓴다.', cd: 26, count: 3, dist: 900, stagger: 0.1,
      mv: 1.2, element: 'ice', pierce: 99, line: '아우우우—' },
    assist: { name: '측면 물기', desc: '적의 옆구리를 물어 잠시 경직시킨다.', kind: 'bite', mv: 1.0, element: 'ice', stun: 0.4 },
    aura: { base: { moveSpd: 6, crit: 3 }, perLv: { moveSpd: 0.1, crit: 0.05 } },
    passive: { name: '늑대의 울음', desc: '25연타를 이을 때마다 우렁차게 울부짖는다.', combo: 25 },
    light: { color: '#7ee0ff', r: 80, i: 0.5 },
    join: '무덤가를 헤매던 푸른 늑대의 영혼이 당신의 발치에 몸을 누였다.', joinNarr: true,
    chips: ['늑대 무리', '측면 물기', '이동 속도 · 치명타'],
  }),
  gd_imp: guardian({
    id: 'gd_imp', part: 1, chapter: 3, name: '핌', title: '소악마 마법사', color: '#ff8a3a',
    role: '원거리 화력형 — 화염구와 운석 비',
    desc: '해골 지팡이를 든 장난꾸러기 소악마. 금화 냄새라면 사족을 못 쓴다.',
    portrait: 'portraits/cmp_g_imp', iconFocus: { x: 0.5, y: 0.33, s: 0.5 },
    obtain: { type: 'shop', price: 7500, chapter: 3, item: '소악마 계약서', hint: '영혼의 마구간에서 「소악마 계약서」를 7,500 G에 구입 (3장 클리어 후)' },
    cry: { sfx: 'imp_cackle', pitch: 1 }, palette: ['#8a2a5a', '#c04a6a', '#2a1020', '#ff7a2a', '#ffd070'],
    move: 'fly', size: { w: 26, h: 28 }, front: false, anchor: { dx: 40, dy: -110 }, speed: 850, engage: 360,
    attack: { name: '화염구', desc: '맞으면 터지는 화염구를 던진다.', kind: 'proj', proj: 'fireball', speed: 520,
      mv: 0.8, type: 'mag', element: 'fire', explode: { r: 40, mv: 0.4 }, interval: 1.2, range: 360 },
    skill: { name: '지옥불 소나기', desc: '2초 동안 앞쪽에 운석 열두 개를 쏟아붓는다.', cd: 28, count: 12, dur: 2, width: 520,
      mv: 0.9, type: 'mag', element: 'fire', explode: { r: 50 }, line: '키히힛! 전부 바삭하게 구워 주지!' },
    assist: { name: '삼연 화염구', desc: '작은 화염구 세 개를 연달아 던진다.', kind: 'volley', count: 3, mv: 0.5, type: 'mag', element: 'fire' },
    aura: { base: { skillDmg: 6, fire: 10 }, perLv: { skillDmg: 0.2 } },
    passive: { name: '키히힛', desc: '적을 열 마리 쓰러뜨릴 때마다 신이 나서 웃음을 터뜨린다.', kills: 10, text: '키히힛!' },
    light: { color: '#ff7a2a', r: 90, i: 0.6 },
    join: '계약 성립! 영혼은… 에이, 농담이야, 농담. 금화면 충분해!',
    chips: ['지옥불 소나기', '삼연 화염구', '스킬 피해 · 화염 피해'],
  }),
  gd_knight: guardian({
    id: 'gd_knight', part: 1, chapter: 4, name: '가웨인', title: '망령 기사', color: '#8ac8ff',
    role: '방어형 — 탄을 막아 내는 방패',
    desc: '타락한 주군을 끝까지 지켰던 기사의 망령. 하반신은 안개로 흩어져 있다.',
    portrait: 'portraits/cmp_g_knight', iconFocus: { x: 0.47, y: 0.22, s: 0.3 },
    obtain: { type: 'boss', boss: 'b_crimson', hint: '4장 보스 「진홍의 갑주군주」를 처치하면 합류' },
    cry: { sfx: 'knight_guard', pitch: 1 }, palette: ['#8ac8ff', '#3a5a8a', '#101828', '#e8f4ff', '#c8a040'],
    move: 'ground', hover: true, size: { w: 34, h: 72 }, front: false, anchor: { dx: 46, dy: 0 }, speed: 900, engage: 300,
    attack: { name: '망령 검격', desc: '적에게 미끄러지듯 다가가 두 번 벤다.', kind: 'slash', glide: 300, glideSpeed: 600,
      hits: 2, gap: 0.18, box: { w: 80, h: 70 }, mv: 0.9, interval: 1.3, range: 300 },
    skill: { name: '수호의 방패진', desc: '4초 동안 앞에 영혼의 방패벽을 세워 적의 탄을 부수고, 받는 피해를 30% 줄인다.', cd: 30,
      dur: 4, ahead: 96, dmgMul: 0.7, line: '이 방패가 부서지기 전엔, 누구도 지나가지 못한다!' },
    assist: { name: '방패 강타', desc: '방패로 후려쳐 적을 경직시킨다.', kind: 'bash', mv: 1.0, stun: 0.6 },
    aura: { base: { dmgReduce: 4 }, perLv: { dmgReduce: 0.1 } },
    passive: { name: '수호의 맹세', desc: '4초마다 가까이 날아드는 적의 탄 하나를 막아 낸다.', every: 4, r: 70 },
    light: { color: '#8ac8ff', r: 90, i: 0.5 },
    join: '주군은 타락했으나 내 맹세는 아직 살아 있다. 그대를 새 주군으로 모시겠다.',
    chips: ['수호의 방패진', '탄 막기', '받는 피해 감소'],
  }),
  gd_whelp: guardian({
    id: 'gd_whelp', part: 1, chapter: 5, name: '크론', title: '새끼 본 드래곤', color: '#c080ff',
    role: '광역형 — 뼈불 숨결과 뼈 폭풍',
    desc: '본 드래곤의 알에서 깨어난 작은 뼈의 용. 갈비뼈 속에 보랏빛 영혼불이 탄다.',
    portrait: 'portraits/cmp_g_whelp', iconFocus: { x: 0.5, y: 0.35, s: 0.62 },
    obtain: { type: 'egg', boss: 'b_bonedragon', hatchAfter: 2, egg: '본 드래곤의 알', hint: '5장 보스 「본 드래곤」이 남긴 알을 부화시키면 합류' },
    cry: { sfx: 'roar_small', pitch: 1.6, extra: 'bone_rattle' }, palette: ['#e8e0d0', '#9a9080', '#2a2030', '#b060ff', '#f0d8ff'],
    move: 'fly', size: { w: 36, h: 30 }, front: false, anchor: { dx: 44, dy: -100 }, speed: 850, engage: 300,
    attack: { name: '뼈불 숨결', desc: '앞쪽으로 보랏빛 뼈불을 내뿜어 여러 적을 한꺼번에 태운다.', kind: 'cone',
      box: { w: 160, h: 60 }, dur: 0.5, rehit: 0.1, mv: 0.22, type: 'mag', element: 'dark', interval: 1.8, range: 200 },
    skill: { name: '뼈 폭풍', desc: '5초 동안 뼛조각 여섯 개가 주위를 돌며 닿는 적을 벤다.', cd: 32, count: 6, r: 90, dur: 5,
      mv: 0.5, element: 'dark', rehit: 0.3, pierce: 99, line: '크르르… 캬아악!' },
    assist: { name: '뼈 뱉기', desc: '적을 꿰뚫는 뼈를 뱉는다.', kind: 'proj', proj: 'bone', pierce: 3, mv: 0.9, element: 'dark' },
    aura: { base: { critDmg: 10, resDark: 10 }, perLv: { critDmg: 0.3 } },
    passive: { name: '장난꾸러기', desc: '한가할 때면 주인의 귀를 잘근잘근 깨문다.' },
    light: { color: '#b060ff', r: 80, i: 0.5 },
    join: '알을 깨고 나온 작은 뼈의 용이 당신의 손가락을 깨물었다. …애정 표현인 것 같다.', joinNarr: true,
    chips: ['뼈 폭풍', '뼈불 숨결', '치명타 피해 · 암흑 저항'],
  }),
  gd_owl: guardian({
    id: 'gd_owl', part: 1, chapter: 6, name: '미네르바', title: '성스러운 올빼미', color: '#ffe7a0',
    role: '탐색형 — 숨겨진 벽을 꿰뚫어 보는 눈',
    desc: '금서의 사슬에 묶여 있던 성스러운 올빼미. 머리 뒤에 가느다란 후광이 떠 있다.',
    portrait: 'portraits/cmp_g_owl', iconFocus: { x: 0.48, y: 0.26, s: 0.38 },
    obtain: { type: 'boss', boss: 'b_grimoire', hint: '6장 보스 「그리모어」를 처치하면 합류' },
    cry: { sfx: 'owl_hoot', pitch: 1 }, palette: ['#f8f0e0', '#c8a870', '#6a5030', '#ffe7a0', '#fff8d8'],
    move: 'fly', size: { w: 24, h: 24 }, front: true, anchor: { dx: 30, dy: -120 }, speed: 1000, engage: 360, perch: 'shoulder',
    attack: { name: '발톱 급강하', desc: '위에서 내리꽂혀 발톱으로 할퀸다.', kind: 'dive', swoop: 0.3, box: { w: 40, h: 40 },
      mv: 1.0, element: 'holy', interval: 1.6, range: 360 },
    skill: { name: '성광의 눈', desc: '앞으로 긴 성광을 쏘아 적을 태우고 오래 경직시킨다.', cd: 30, len: 700, dur: 0.6, rehit: 0.1,
      mv: 0.5, type: 'mag', element: 'holy', stun: 1.0, line: '어둠 속에 숨은 것은 나의 눈을 피할 수 없다.' },
    assist: { name: '급강하', desc: '적에게 곧장 내리꽂힌다.', kind: 'dive', mv: 1.0, element: 'holy' },
    aura: { base: { luck: 8, dropBonus: 10 }, perLv: { luck: 0.2, dropBonus: 0.2 } },
    passive: { name: '비밀의 눈', desc: '가까운 부서지는 벽과 가짜 벽을 금빛 윤곽으로 보여 준다.', tiles: 7 },
    light: { color: '#ffe7a0', r: 70, i: 0.5 },
    join: '금서의 사슬이 풀렸군요. 지혜를 구하는 이여, 제 눈을 빌려 드리지요.',
    chips: ['성광의 눈', '비밀의 눈', '행운 · 아이템 드롭'],
  }),
  gd_clock: guardian({
    id: 'gd_clock', part: 1, chapter: 9, name: '틱톡', title: '태엽 인형', color: '#ffd070',
    role: '시간 조작형 — 톱니 사격과 시간 정지',
    desc: '금이 간 도자기 얼굴의 태엽 인형. 등의 태엽 열쇠가 쉬지 않고 돈다.',
    portrait: 'portraits/cmp_g_clock', iconFocus: { x: 0.39, y: 0.25, s: 0.44 },
    obtain: { type: 'boss', boss: 'b_colossus', hint: '9장 보스 「태엽 거신」을 처치하면 합류' },
    cry: { sfx: 'gear_whir', pitch: 1 }, palette: ['#f4ece0', '#c8a060', '#5a3a28', '#ffd070', '#8a2a3a'],
    move: 'fly', size: { w: 26, h: 32 }, front: false, anchor: { dx: 38, dy: -104 }, speed: 850, engage: 400,
    attack: { name: '톱니 연사', desc: '톱니 탄 세 발을 빠르게 쏜다.', kind: 'burst', proj: 'bullet', count: 3, gap: 0.08, speed: 900,
      mv: 0.45, interval: 1.5, range: 400 },
    skill: { name: '정지된 초침', desc: '약 2초 동안 시간을 멈춘다.', cd: 45, time: 2.0, timePerLv: 0.02, timeMax: 2.6,
      line: '째깍, 째깍… 시간이여, 멈춰라.' },
    assist: { name: '톱니 드릴', desc: '적을 꿰뚫는 톱니를 날린다.', kind: 'proj', proj: 'bullet', pierce: 3, mv: 1.0 },
    aura: { base: { atkSpd: 5, cdr: 5 }, perLv: { atkSpd: 0.1, cdr: 0.1 } },
    passive: null,
    light: { color: '#ffd070', r: 60, i: 0.4 },
    join: '태엽이 다시 감겼어요. 주인님의 시간을 지켜 드릴게요. 째깍.',
    chips: ['정지된 초침', '톱니 연사', '공격 속도 · 재사용 대기 감소'],
  }),
  gd_reaper: guardian({
    id: 'gd_reaper', part: 1, chapter: 11, name: '모르스', title: '꼬마 사신', color: '#7aff9a',
    role: '처형형 — 약한 적을 단숨에 거둔다',
    desc: '사신 데스의 장부를 물려받은 꼬마 사신. 제 키의 두 배나 되는 낫을 끌고 다닌다.',
    portrait: 'portraits/cmp_g_reaper', iconFocus: { x: 0.52, y: 0.36, s: 0.36 },
    obtain: { type: 'boss', boss: 'b_death', hint: '11장 보스 「사신 데스」를 처치하면 합류' },
    cry: { sfx: 'scythe', pitch: 1 }, palette: ['#141018', '#2a2430', '#e8e0d0', '#7aff9a', '#c8ffd8'],
    move: 'float', size: { w: 28, h: 40 }, front: false, anchor: { dx: 42, dy: -60 }, speed: 950, engage: 340, bias: 'lowhp',
    attack: { name: '사신의 낫', desc: '약한 적의 뒤로 순간이동해 큰 낫을 휘두른다.', kind: 'blink', blink: 0.1, box: { w: 90, h: 70 },
      mv: 1.1, element: 'dark', interval: 1.5, range: 340 },
    skill: { name: '영혼 수확', desc: '화면 전체를 낫으로 쓸어 모든 적을 베고, 벤 적 하나마다 최대 HP의 2%를 회복시킨다 (최대 20%).', cd: 40,
      mv: 2.5, element: 'dark', heal: 0.02, healMax: 0.2, line: '네 이름도… 장부에 적혀 있어.' },
    assist: { name: '영혼 베기', desc: '적을 베고, 체력이 20% 이하인 일반 적은 그 자리에서 거둔다.', kind: 'slash', mv: 1.2, element: 'dark', execute: 0.2 },
    aura: { base: { lifesteal: 2, dark: 10 }, perLv: { lifesteal: 0.03 } },
    passive: { name: '처형', desc: '체력이 12% 미만인 일반 적을 즉시 거둔다 (3초마다).', below: 0.12, icd: 3, text: '처형' },
    light: { color: '#7aff9a', r: 80, i: 0.6 },
    join: '스승님은 쓰러졌어. 이제 장부는 내가 들고 다닐게. …너, 오래 살 것 같진 않은데. 재밌겠다.',
    chips: ['영혼 수확', '처형', '흡혈 · 암흑 피해'],
  }),
  // ─ 2부 (world2 §14; 수치 MASTER_PLAN §1.2) ─
  gd_mirra: guardian({
    id: 'gd_mirra', part: 2, chapter: 14, name: '미라', title: '거울 요정', color: '#dff4ff',
    role: '반사형 — 적의 탄을 되돌려 보낸다',
    desc: '여제 나르키사가 버린 진짜 얼굴. 은빛 거울 조각을 두르고 떠다니는 작은 소녀다.',
    portrait: 'portraits/cmp_gd_mirra', iconFocus: { x: 0.52, y: 0.28, s: 0.38 },
    obtain: { type: 'flag', flag: 'recruit_gd_mirra', hint: '14장 「거울의 성」에서 만날 수 있다' },
    cry: { sfx: 'mirror_chime', pitch: 1 }, palette: ['#f0f8ff', '#b8d0e8', '#5a6a8a', '#dff4ff', '#ffffff'],
    move: 'fly', size: { w: 20, h: 30 }, front: true, anchor: { dx: 32, dy: -100 }, speed: 950, engage: 320,
    attack: { name: '거울 파편', desc: '적을 쫓아가는 거울 파편을 날린다.', kind: 'proj', proj: 'shard', homing: true, speed: 680,
      mv: 0.55, type: 'mag', element: 'ice', interval: 1.3, range: 320 },
    skill: { name: '만화경 난반사', desc: '거울 파편 여덟 개를 주위에 띄웠다가 적들에게 한꺼번에 쏘아 보낸다.', cd: 30, count: 8, orbit: 1.0,
      mv: 0.9, type: 'mag', element: 'ice', pierce: 1, line: '거울아, 거울아 — 저 괴물의 진짜 얼굴을 보여 줘!' },
    assist: { name: '반사 일격', desc: '거울빛으로 적을 벤다.', kind: 'flash', mv: 1.0, type: 'mag', element: 'ice' },
    aura: { base: { crit: 4, resIce: 10 }, perLv: { crit: 0.1 } },
    passive: { name: '되비추기', desc: '5초마다 가까이 날아든 적의 탄 하나를 쏜 적에게 되돌려 보낸다.', every: 5, r: 80, mv: 1.0 },
    light: { color: '#dff4ff', r: 90, i: 0.5 },
    join: '이제부터 당신의 뒤를 비출게요. 뒤에서 오는 건 제가 먼저 볼게요.',
    chips: ['만화경 난반사', '탄 되비추기', '치명타 · 냉기 저항'],
  }),
  gd_lumen: guardian({
    id: 'gd_lumen', part: 2, chapter: 16, name: '루멘', title: '등불 해파리', color: '#6fe8ff',
    role: '빛·지원형 — 어둠을 밝히고 숨을 이어 준다',
    desc: '가라앉은 성소의 어둠 속에서 홀로 빛나던 해파리. 촉수 끝에 번개가 흐른다.',
    portrait: 'portraits/cmp_gd_lumen', iconFocus: { x: 0.6, y: 0.26, s: 0.6 },
    obtain: { type: 'flag', flag: 'recruit_gd_lumen', hint: '16장 「가라앉은 성소」에서 만날 수 있다' },
    cry: { sfx: 'jelly_zap', pitch: 1 }, palette: ['#6fe8ff', '#2a8ab8', '#0a1a3a', '#e0fbff', '#ff9ae8'],
    move: 'fly', size: { w: 24, h: 28 }, front: true, anchor: { dx: 36, dy: -104 }, speed: 800, engage: 280,
    attack: { name: '전기 촉수', desc: '촉수로 전기를 흘려 적을 지지고, 옆의 적에게도 번개가 튄다.', kind: 'zap', chain: 1, chainMul: 0.7,
      mv: 0.5, type: 'mag', element: 'thunder', interval: 1.4, range: 280 },
    skill: { name: '심해의 등불', desc: '눈부신 빛으로 화면 안의 일반 적을 1.5초 동안 기절시키고, 깊은 물속이라면 숨을 가득 채운다.', cd: 32,
      stun: 1.5, mv: 1.2, type: 'mag', element: 'thunder', air: 100, line: '(삐릿— 삐리리릿!)' },
    assist: { name: '방전', desc: '전기를 터뜨려 적을 잠시 감전시킨다.', kind: 'zap', mv: 0.9, type: 'mag', element: 'thunder', stun: 0.3 },
    aura: { base: { mpRegen: 1, resThunder: 10 }, perLv: { mpRegen: 0.03 } },
    passive: { name: '심해의 빛', desc: '주위를 넓게 밝히고, 깊은 물속에서 숨이 줄어드는 속도를 절반으로 늦춘다.', lightR: 220, airDrainMul: 0.5 },
    light: { color: '#6fe8ff', r: 120, i: 0.6 },
    join: '빛나는 해파리가 등불 곁에 둥실 떠올랐다. 이제 어둠 속에서도 길을 밝혀 줄 것이다.', joinNarr: true,
    chips: ['심해의 등불', '물속 숨 유지', 'MP 재생 · 번개 저항'],
  }),
  gd_momo: guardian({
    id: 'gd_momo', part: 2, chapter: 18, name: '모모', title: '꿈먹는 맥', color: '#d080ff',
    role: '흡수형 — 적의 탄과 악몽을 먹어 치운다',
    desc: '악몽을 먹고 사는 작은 맥의 정령. 배가 부르면 기분 좋게 트림을 한다.',
    portrait: 'portraits/cmp_gd_momo', iconFocus: { x: 0.38, y: 0.41, s: 0.5 },
    obtain: { type: 'flag', flag: 'recruit_gd_momo', hint: '18장 「악몽의 미궁」에서 만날 수 있다' },
    cry: { sfx: 'momo_gulp', pitch: 1 }, palette: ['#5a4a8a', '#8a7ac0', '#2a2040', '#c060ff', '#f0e0ff'],
    move: 'float', size: { w: 30, h: 24 }, front: false, anchor: { dx: 44, dy: -70 }, speed: 800, engage: 300,
    attack: { name: '꿈 삼키기', desc: '긴 코를 뻗어 적을 덥석 문다.', kind: 'bite', box: { w: 50, h: 40 },
      mv: 0.8, element: 'dark', interval: 1.3, range: 300 },
    skill: { name: '악몽 포식', desc: '화면의 적 탄을 모두 삼키고 일반 적을 끌어당긴 뒤, 주인의 최대 HP를 10% 회복시킨다.', cd: 36,
      pull: 200, pullT: 1.0, heal: 0.10, line: '(우물우물… 꺼억!)' },
    assist: { name: '코 휘두르기', desc: '긴 코로 적을 후려친다.', kind: 'swing', mv: 1.0, element: 'dark' },
    aura: { base: { hpRegen: 0.5, resDark: 10 }, perLv: { hpRegen: 0.03 } },
    passive: { name: '한입에 꿀꺽', desc: '6초마다 가까이 날아든 적의 탄 하나를 먹어 치운다.', every: 6, r: 120, text: '꺼억' },
    light: { color: '#c060ff', r: 70, i: 0.4 },
    join: '꿈먹는 맥이 당신의 그림자 속으로 쏙 들어왔다. 악몽은 이제 이 녀석의 간식이다.', joinNarr: true,
    chips: ['악몽 포식', '탄 먹기', 'HP 재생 · 암흑 저항'],
  }),
};

/** 옛 명세 id (m_warhorse, g_fairy …) → 현재 id */
export const LEGACY_IDS = {
  m_warhorse: 'mt_warhorse', m_boar: 'mt_boar', m_skelsteed: 'mt_skelsteed', m_direwolf: 'mt_direwolf', m_wyvern: 'mt_wyvern', m_giantbat: 'mt_giantbat',
  g_fairy: 'gd_fairy', g_spiritwolf: 'gd_spiritwolf', g_imp: 'gd_imp', g_knight: 'gd_knight', g_whelp: 'gd_whelp', g_owl: 'gd_owl', g_clock: 'gd_clock', g_reaper: 'gd_reaper',
};

export const MOUNT_IDS = Object.keys(MOUNTS);
export const GUARDIAN_IDS = Object.keys(GUARDIANS);
/** 메뉴 목록 순서: 탈것(합류 순) → 수호신(합류 순) */
export const COMPANION_ORDER = [...MOUNT_IDS, ...GUARDIAN_IDS];
/** 해금 판정 순서: 합류 챕터 순 (같은 챕터면 COMPANION_ORDER 순) — 자동 장착이 먼저 만난 동료를 고르도록 */
export const UNLOCK_ORDER = COMPANION_ORDER.map((id, i) => [id, i])
  .sort((a, b) => (companionDef(a[0]).chapter - companionDef(b[0]).chapter) || (a[1] - b[1])).map((x) => x[0]);


/** id 정규화: 현재 id 는 그대로, 옛 id 는 새 id 로, 모르는 값은 null */
export function normCompanionId(id) {
  if (typeof id !== 'string') return null;
  if (Object.hasOwn(MOUNTS, id) || Object.hasOwn(GUARDIANS, id)) return id;
  return Object.hasOwn(LEGACY_IDS, id) ? LEGACY_IDS[id] : null;
}
/** 동료 정의 (탈것 또는 수호신). 모르는 id 는 null */
export function companionDef(id) {
  if (typeof id !== 'string') return null;
  if (Object.hasOwn(MOUNTS, id)) return MOUNTS[id];
  if (Object.hasOwn(GUARDIANS, id)) return GUARDIANS[id];
  const n = Object.hasOwn(LEGACY_IDS, id) ? LEGACY_IDS[id] : null;
  return n ? (MOUNTS[n] ?? GUARDIANS[n]) : null;
}
export const isMountId = (id) => typeof id === 'string' && Object.hasOwn(MOUNTS, id);
export const isGuardianId = (id) => typeof id === 'string' && Object.hasOwn(GUARDIANS, id);
/** 'mount' | 'guardian' | null */
export function companionKind(id) { return companionDef(id)?.kind ?? null; }
/** 표시 이름 (모르면 '???') */
export function companionName(id) { return companionDef(id)?.name ?? '???'; }

// ── 마구간 (§2.2, §7.3) ─────────────────────────────────────────────────────────────────
/** 구입 목록. chapter = progress.chapter 가 이 값 이상이면 입고 */
export const STABLE_SHOP = [
  { id: 'mt_boar', price: 6000, chapter: 2, label: '바르그', desc: '철엄니 멧돼지 — 탈것', lockNote: '2장 클리어 후 입고' },
  { id: 'gd_imp', price: 7500, chapter: 3, label: '소악마 계약서', desc: '소악마 마법사 핌과의 계약 — 수호신', lockNote: '3장 클리어 후 입고' },
];
/** 공물: 가격 = base + perLv·lv G, 경험치 = floor(cexpToNext(lv)·expFrac), 유대 +bond (스테이지 클리어 주기마다 1번) */
export const TRIBUTE = { base: 100, perLv: 30, expFrac: 0.3, bond: 8, noBondNote: '유대는 다음 스테이지를 다녀온 뒤에 더 깊어진다' };
/** 그레타의 의뢰 → 합류하는 동료 */
export const COMPANION_QUESTS = Object.fromEntries(COMPANION_ORDER
  .filter((id) => companionDef(id).obtain.type === 'quest').map((id) => [companionDef(id).obtain.quest, id]));
/** 그레타 대사 (§7.3, 원문 그대로) */
export const STABLE_LINES = {
  hello: ['왔구나. 녀석들이 네 냄새를 기억하고 있었어.', '말이든 영혼이든, 먼저 믿어 줘야 너를 믿어.', '오늘 밤도 살아서 왔네. 다행이야.'],
  tribute: ['봐, 꼬리가 흔들리잖아.', '좋아하는 것 같네. 표정만 봐도 알아.'],
  buy: ['잘 부탁해. 이 녀석, 겉보기보다 순해.', '계약서는 로크한테서 받은 거야. 수상하긴 해도… 진짜야.'],
  poor: ['금화가 모자라. 짐승도 영혼도 공짜로는 안 움직여.'],
  egg: ['알에 금이 가기 시작했어! 어서!', '아직 따뜻해. 조금만 더 기다려.'],
  bye: ['살아서 돌아와. 너도, 녀석들도.'],
  closed: ['불에 그을린 빈 마구간이다. 곧 누군가 이곳을 찾아올 것만 같다.'],
};
/** 알 상태 문구 (§7.3) */
export const EGG_TEXT = { waiting: '따뜻하다… (스테이지 1개 더 클리어)', waitingN: '따뜻하다… (스테이지 {n}개 더 클리어)', ready: '금이 가기 시작했다!' };

// ── 문구 (§7.5 원문; {name}이(가)/을(를)/와(과) 는 cmpText 가 받침에 맞게 고른다) ──────────────
export const CMP_TEXT = {
  rideFirst: '{name}에 올라탔다!',
  noSpot: '여기서는 탈것을 부를 수 없다',
  forced: '공간이 좁아 탈것을 돌려보냈다',
  noMount: '장착한 탈것이 없다 — 메뉴 › 동료',
  noGuard: '장착한 수호신이 없다 — 메뉴 › 동료',
  recalling: '{name}이(가) 아직 돌아오지 않았다 ({n}초)',
  knocked: '{name}이(가) 쓰러졌다! (재소환 {n}초)',
  bossFear: '이 싸움에는 탈것이 겁을 먹었다',
  bossRetreat: '{name}이(가) 겁에 질려 물러섰다',
  underwater: '물속에서는 탈것을 부를 수 없다',
  deep: '깊은 물에서는 탈것에서 내려 헤엄쳐야 한다',
  ledge: '{name}은(는) 이 턱을 넘지 못한다 — 내려서 올라가자',   // 날지 못하는 탈것이 못 넘는 턱에 막혔을 때 (방마다 한 번 — mount.js ledgeHint)
  townOnly: '마을에서는 싸울 수 없다',
  cooldown: '쿨타임',
  assist: '협공!',
  execute: '처형',
  levelUp: 'Lv UP!',
  lastStand: '버텨라, {name}!',
  joined: '새 동료 합류 — 「{name}」! 마을로 돌아가면 만날 수 있다',
  joinedTown: '새 동료 합류 — 「{name}」!',
  egg: '「{egg}」을(를) 손에 넣었다 — 영혼의 마구간에 맡기자',
  eggReady: '「{egg}」에 금이 가기 시작했다 — 영혼의 마구간으로 가 보자',
  bond: '「{name}」와(과)의 유대가 깊어졌다 — {rank}',
  slot2: '수호신 슬롯이 하나 더 열렸다!',
  slot2Locked: '8장 클리어 시 개방',
  equipped: '{name}을(를) 장착했다',
  unequipped: '{name}을(를) 해제했다',
  notOwned: '아직 함께하지 않는 동료다',
  owned: '이미 함께하고 있다',
  poor: '금화가 모자라다',
  tributeDone: '{name}은(는) 더 이상 공물이 필요 없다',
  empty: '아직 동료가 없습니다',
  emptySub: '1장을 클리어하면 마을 동쪽 성문 밖 「영혼의 마구간」이 열립니다',
};
/** 탈것이 내려간 이유별 안내 (없는 이유는 안내 없음). MountRider.dismount(reason) 이 토스트로 쓴다 */
export const DISMOUNT_NOTE = {
  forced: CMP_TEXT.forced,
  room: CMP_TEXT.forced,
  deep: CMP_TEXT.deep,
  boss: CMP_TEXT.bossRetreat,
};

const JOSA = { '이(가)': '이/가', '을(를)': '을/를', '은(는)': '은/는', '과(와)': '과/와', '와(과)': '과/와', '으로(로)': '으로/로' };
/**
 * 문구 채우기: cmpText('knocked', { name: '그림메인', n: 18 }) → '그림메인이 쓰러졌다! (재소환 18초)'
 *  {키} 바로 뒤(닫는 괄호 」』) 뒤 포함)의 이(가)·을(를)·와(과)·은(는)·으로(로) 를 받침에 맞게 고른다. key 가 CMP_TEXT 에 없으면 key 자체를 틀로 쓴다.
 */
export function cmpText(key, vars = {}) {
  const t = Object.hasOwn(CMP_TEXT, key) ? CMP_TEXT[key] : String(key ?? '');
  return t.replace(/\{(\w+)\}([」』)]*)(이\(가\)|을\(를\)|은\(는\)|과\(와\)|와\(과\)|으로\(로\))?/g, (m, k, close, j) => {
    const v = String(vars?.[k] ?? '');
    if (!j) return v + close;
    return v + close + josa(v, JOSA[j]).slice(v.length);
  });
}
