// 타격 손맛 데이터 (owner: FEEL-IMPACT) — feel.md §4.1–4.10, §6.1, §8, MASTER_PLAN §1.14
// 순수 데이터 모듈: import 없음. 읽는 쪽(impact.js, style.js, enemy.js, particles/hitfx, feel_hud, awaken)은
// 값이 없을 때 오늘의 동작으로 돌아가야 한다 (?? 기본값).
//
// 강도 등급(strength class) 7종: L(약) M(중) H(강) F(마무리·차지) U(필살/각성 연타) S(필살 마지막 일격) A(각성 마지막 일격)
// 등급 판정 순서 (impact.strengthClass):
//   1. FEEL_MOVE_OVERRIDES[moveId].cls
//   2. STRENGTH_RULES 를 위에서부터 차례로 검사해 처음 맞는 규칙의 cls
// 시간 단위는 초, 거리 px. '프레임' = 1/60 초.

/** 등급 → 순번 (피격 떨림 폭 2 + 1·index px, 카메라·진동 세기 비교용) */
export const CLASS_INDEX = { L: 0, M: 1, H: 2, F: 3, U: 0, S: 4, A: 5 };

/**
 * 강도 판정 규칙 (위에서부터 첫 일치). 필드:
 *  tag / tagAny   attack.tags 포함 여부
 *  final          attack.final 이 true 이거나, attack.hitstop ≥ finalHitstop (FX-ULTS 이전의 필살 마지막 일격 호환)
 *  finisher       move.finisher 또는 attack.finisher
 *  charge         move id 가 'Charge' 로 끝남 (모아 치기)
 *  launch         attack.launch      dash: id 가 'Dash' 로 끝남     down: id 가 'Down' 으로 끝남
 *  groundPound    move.groundPound 또는 hitId 가 'gp' 로 끝남
 *  hitstopMin     attack.hitstop ≥ 값
 */
export const STRENGTH_RULES = [
  { cls: 'A', tag: 'awaken', final: true, finalHitstop: 0.3 },
  { cls: 'S', tag: 'ult', final: true, finalHitstop: 0.2 },
  { cls: 'U', tagAny: ['ult', 'awaken'] },
  { cls: 'F', finisher: true, charge: true },
  { cls: 'H', launch: true, dash: true, down: true, groundPound: true, hitstopMin: 0.07 },
  { cls: 'M', hitstopMin: 0.045, tagAny: ['skill'] },
  { cls: 'L' },
];

/**
 * 동작별 덮어쓰기 (moveId → { cls?, hitstop?, otg?, gb? })
 *  cls      등급 강제          hitstop  이 동작의 기본 경직(초, 등급 표 대신)
 *  otg      강한 다운 추가타 (피해 ×1.2 + 바닥 바운드 1회, enemy.js)
 *  gb       공중의 경직 상태 적에게 맞히면 바닥 바운드 (enemy.js; kb[1] > 0 인 동작은 자동)
 */
export const FEEL_MOVE_OVERRIDES = {
  whip1: { cls: 'L' },
  gsCharge: { cls: 'F', hitstop: 0.167 },
  whipDown: { cls: 'H', otg: true },
  swDown: { cls: 'H', otg: true, gb: true },
  gsDown: { cls: 'H', otg: true, gb: true },
  dgDown: { cls: 'H', otg: true, gb: true },
  stDown: { cls: 'H', otg: true, gb: true },
  gnDown: { cls: 'H', otg: true },
  whipA2: { gb: true },
  gsA1: { gb: true },
};

/**
 * 경직(히트스톱) 표 — feel §4.1
 *  L/M/H/F/U/S/A  등급 기본값 (초)       gun  총탄 L 등급       cont  같은 hitId 재타격(다단 히트 2타째부터)
 *  hurt  플레이어 피격 3프레임           prop  촛불 등 소품       mod  가산 프레임 (치명타·카운터·처치·정예 처치)
 *  attack.hitstop === 0 을 명시한 공격(수호신 자동 공격, 오라 등)은 0 을 유지한다.
 */
export const HITSTOP = {
  L: 0.050, M: 0.067, H: 0.100, F: 0.133, U: 0.033, S: 0.250, A: 0.400,
  gun: 0.033, cont: 1 / 60, hurt: 0.05, prop: 2 / 60,
  frame: 1 / 60,
  mod: { crit: 2, counter: 2, kill: 3, eliteKill: 6 },
  exempt: ['S', 'A'],          // 누적 상한(HS_CAP) 면제 등급
};
/** 1초 창 안의 누적 정지 시간 상한 (S·A 등급 제외) */
export const HS_CAP = 0.4;
/** HS_CAP 을 재는 창 길이 (초, game.time 기준 — 정지 중에도 흐르는 시계) */
export const HS_WINDOW = 1.0;

/** 등급별 카메라 반동(px, 공격 방향)과 트라우마 가산 — feel §4.1 */
export const IMPACT_CAM = {
  L: { kick: 3, trauma: 0.10 }, M: { kick: 5, trauma: 0.16 }, H: { kick: 8, trauma: 0.24 }, F: { kick: 12, trauma: 0.34 },
  U: { kick: 2, trauma: 0.05 }, S: { kick: 16, trauma: 0.6 }, A: { kick: 20, trauma: 0.8 },
  hurt: { kick: 6, trauma: 0.28 }, prop: { kick: 2, trauma: 0.04 },
  critMul: 1.3,
};

/** 등급별 타격음 층 ('mat' = 재질 층, MATERIAL[mat].sfx) — feel §4.1 */
export const HIT_SFX = {
  L: ['hit'], M: ['hit', 'mat'], H: ['hit_heavy', 'mat'], F: ['hit_heavy', 'impact_crack'],
  U: [], S: ['ult_impact'], A: ['awaken_boom'], prop: ['hit'],
};

/**
 * 무게 등급 (enemy.js, FEEL-REACT 가 읽음) — feel §4.2
 *  rule    kbResist 범위 [이상, 미만)      kbMul  지상 넉백 배율 ('res' = 1-kbResist, 'res08' = (1-kbResist)·0.8)
 *  kbMin   배율 하한      launchMul  띄우기 배율 (0 = 못 띄움, HEAVY 는 H·F 띄우기만 hopVy 로 살짝)
 *  stun    등급별 경직(초)  jg  공중 콤보 중력 배율 기본값   knockdown  true | false | 'stagger'(비틀 상태에서만)
 *  squash  [sx, sy, 초]    lean  뒤로 젖힘(rad), leanT 지속     tumble  공중 회전(rad/s, h < 50)   humanLean  사람형 공중 젖힘
 */
export const WEIGHT = {
  LIGHT: { rule: [0, 0.25], kbMul: 1, kbMin: 1, launchMul: 1, stun: { L: 0.30, M: 0.34, H: 0.40, F: 0.50 }, jg: 0.62, knockdown: true, squash: [1.12, 0.88, 0.06], lean: 0.22, leanT: 0.12, tumble: 8, humanLean: -0.6 },
  MEDIUM: { rule: [0.25, 0.6], kbMul: 'res', kbMin: 0.45, launchMul: 0.8, stun: { L: 0.24, M: 0.28, H: 0.34, F: 0.44 }, jg: 0.70, knockdown: true, squash: [1.08, 0.92, 0.06], lean: 0.18, leanT: 0.12 },
  HEAVY: { rule: [0.6, 1], kbMul: 'res08', kbMin: 0, launchMul: 0, hopVy: -380, hopCls: ['H', 'F'], stun: { L: 0.10, M: 0.14, H: 0.20, F: 0.30 }, jg: 1.0, knockdown: 'stagger', lean: 0.06, leanT: 0.1, armorFlash: 0.08, armorColor: '#ff9a30' },
  FIXED: { rule: [1, 2], kbMul: 0, kbMin: 0, launchMul: 0, stun: { L: 0, M: 0, H: 0, F: 0 }, jg: 1, knockdown: false },
  BOSS: { kbMul: 0, kbMin: 0, launchMul: 0, stun: { L: 0, M: 0, H: 0, F: 0 }, jg: 1, knockdown: false, vib: 2, armorColor: '#ff9a30' },
  /** 비틀 게이지 (HEAVY 전용): 등급별 가산, 초당 감소, 기준치, 비틀 시간, 이후 면역 */
  stagger: { add: { L: 1, M: 2, H: 3, F: 5, U: 1, S: 5, A: 5 }, decay: 4, at: 12, dur: 0.9, immune: 2, callout: '비틀!' },
  groundFriction: 0.86, airDamp: 0.985, flyDamp: 0.9,
  knockdownMinH: 50,                 // 이보다 작은 적은 쓰러지지 않고 굴러간다
  vib: { base: 2, perClass: 1 },     // 피격 떨림 ±(base + perClass·CLASS_INDEX) px
};

/** 공중 콤보 — feel §4.3 */
export const JUGGLE = {
  launchK: 1.25, launchMax: 1000,       // 띄우기 vy = -min(launchMax, |kb[1]|·launchK)·launchMul
  gravStep: 0.05, gravCap: 1.15,        // 중력 = jg + gravStep·jn (상한)
  pop: { L: 260, M: 320, H: 380 }, popDecay: 0.05,   // 공중 추가타 vy = min(vy, -pop·(1 - popDecay·jn)); F 는 자체 kb
  airStunMin: 0.18, airStunStep: 0.02,  // 공중 경직 = max(airStunMin, 표 - airStunStep·jn)
  limit: 14, guardGrav: 1.3, guardCallout: '가드!',
  floatVy: -60, floatMax: 6,            // 플레이어 공중 타격 부양 (체공 1회당 6번)
  chaseWindow: 0.35, chaseVyK: 1.05, chaseLead: 40, chaseAirStall: 0.5, chaseCallout: '추격!',
};

/** 다운 · 다운 추가타(OTG) · 기상 — feel §4.4 */
export const DOWN = {
  light: 0.6, medium: 0.45,             // 다운 시간
  rotK: 0.9, dropK: 0.5, dust: 6,       // 눕는 그림: -facing·π/2·rotK 회전, 0.5·h 내림
  otgMul: 0.8, otgStrongMul: 1.2, otgPop: -160, otgWake: 2,
  wakeInv: 0.30, wakeDust: 4,
  callout: '다운 추가타',
};

/** 벽 바운드 · 바닥 바운드 — feel §4.5 */
export const BOUNCE = {
  wall: { armKb: 320, armT: 0.5, minVx: 380, vxK: 0.45, vy: -380, stunAdd: 0.35, dust: 8, gravel: 6, kick: 6, callout: '벽 바운드!', sfx: 'wall_bounce' },
  ground: { slamVy: 900, bounceVy: -520, stunAdd: 0.3, dust: 10, decalT: 0.8, kick: [0, 7], callout: '바닥 바운드!', sfx: 'ground_bounce' },
};

/**
 * 카운터 · 백어택 — feel §4.6
 *  카운터: 대상이 공격 동작 중(states 중 하나이고 didHit 전, stateT < maxStateT) 이거나 e.telegraph / boss.telegraph
 */
export const COUNTER = {
  mul: 1.25, frames: 2, stunAdd: 0.1, color: '#aef0ff', callout: 'COUNTER', sfx: 'counter',
  states: ['attack', 'slash', 'thrust', 'slam', 'punch', 'claw', 'swing', 'sweep', 'fling', 'aim', 'cast', 'throw', 'charge',
    'windup', 'wind', 'gather', 'spit', 'tongue', 'kiss', 'scream', 'spew', 'shoot', 'fire', 'dive', 'lunge', 'bite', 'stab'],
  maxStateT: 1.2,
};
export const BACK = { crit: 15, callout: 'BACK ATTACK', color: '#ffc890', sfx: 'back_attack' };

/** 필드 위 판정 문구 (영어 문구는 DNF 관례, 나머지는 한국어) — feel §4.10 */
export const CALLOUT = { size: 15, life: 0.6, skew: -0.21, vy: -70, color: '#ffe8c0', outline: '#1a0610', small: 12 };

/**
 * 재질별 타격 파편 — feel §4.7 (hitfx.materialBurst 가 읽음; impact.js 는 hitfx 가 없을 때 같은 표로 대체 연출)
 *  sfx     재질 타격음 층 (M·H 등급)      decal  자국 확률 (heavy: H·F 등급 확률)
 *  n       파편 수 (high 품질 L/M/H/F)     preset 기존 파티클 종류(대체 연출용)
 */
export const MATERIAL = {
  flesh: { sfx: 'hit_flesh', decal: 0.3, decalHeavy: 1, color: '#9a0d1c', mist: '#5a0610', preset: 'blood', n: [8, 10, 12, 14], speed: [180, 420], cone: 0.5 },
  bone: { sfx: 'hit_bone', decal: 0, color: '#e8dcc0', preset: 'shard', n: [5, 6, 7, 8], dust: 1, crack: true },
  metal: { sfx: 'hit_stone', clang: true, decal: 0, color: '#ffd080', color2: '#fff3c0', preset: 'spark', n: [10, 11, 12, 14], speed: [300, 700], grav: 900 },
  ghost: { sfx: 'hit_ghost', decal: 0, color: '#8affc8', preset: 'soul', n: [6, 6, 6, 6], ring: [6, 46] },
  stone: { sfx: 'hit_stone', decal: 0, color: '#8a8480', preset: 'shard', n: [6, 6, 6, 6], dust: 2 },
  slime: { sfx: 'hit_flesh', decal: 0.5, decalHeavy: 1, color: '#6adf4a', preset: 'blood', n: [6, 6, 6, 6] },
  paper: { sfx: 'hit_flesh', decal: 0, color: '#e8e0c8', preset: 'shard', n: [6, 6, 6, 6], grav: 200 },
  ice: { sfx: 'hit_stone', decal: 0, color: '#bff4ff', mist: '#bff4ff', preset: 'ice', n: [8, 8, 8, 8] },
  fire: { sfx: 'hit_flesh', decal: 0, color: '#ff9a3a', preset: 'ember', n: [6, 6, 6, 6], puff: 'fire' },
  prop: { sfx: null, decal: 0, color: '#ffc070', preset: 'spark', n: [4, 4, 4, 4] },
};

/** 무기 계열(동작 fx) → 타격 스프라이트 종류와 크기 (L/M/H/F px) — feel §4.7 (1) */
export const HIT_SPRITE = {
  cut: { size: [70, 90, 110, 140], life: 0.12 },
  streak: { size: [90, 110, 130, 160], life: 0.12 },
  star: { size: [50, 70, 90, 120], life: 0.12, ring: true },
  bullet: { size: [26, 32, 40, 60], life: 0.10 },
  glow: { size: [40, 55, 70, 90], life: 0.14 },
  byFx: { whip: 'cut', slash: 'cut', thrust: 'streak', pierce: 'streak', heavy: 'star', blunt: 'star', shot: 'bullet', bullet: 'bullet', magic: 'glow', fire: 'glow', ice: 'glow', holy: 'glow', dark: 'glow', thunder: 'glow' },
  byWeapon: { whip: 'whip', sword: 'slash', dagger: 'slash', greatsword: 'heavy', gun: 'shot', staff: 'magic' },
};

/**
 * 데미지 숫자 스타일 — feel §4.8 (fx.dmg 가 읽음)
 *  size px · color · grad [위, 아래] · outline · pop 튀어나오는 배율 · jitter px · tag 위쪽 작은 글씨 · prefix 앞 글씨
 *  rise px · hold 초 · fall true = 아래로 떨어짐
 */
export const DMG_STYLE = {
  normal: { size: 20, color: '#ffffff', outline: '#200008', pop: 1.35, rise: 40, hold: 0.6 },
  crit: { size: 30, color: '#ffd24a', grad: ['#fff2a0', '#ffb020'], outline: '#3a1000', pop: 1.8, jitter: 2, jitterT: 0.1, tag: 'CRITICAL', tagSize: 11, star: true, rise: 40, hold: 0.6 },
  weak: { size: 22, color: '#ff8a4a', outline: '#200008', pop: 1.35, tag: '약점', tagSize: 10, rise: 40, hold: 0.6 },
  resist: { size: 16, color: '#9a9aa8', outline: '#200008', pop: 1.2, tag: '저항', tagSize: 10, rise: 34, hold: 0.5 },
  counter: { size: 24, color: '#aef0ff', outline: '#06202a', pop: 1.6, rise: 40, hold: 0.6 },
  ult: { size: 26, color: '#ffe070', outline: '#8a0010', pop: 1.4, rise: 30, hold: 0.5, stack: true },
  total: { size: 34, color: '#ffd24a', grad: ['#fff2a0', '#ffb020'], outline: '#8a0010', pop: 1.9, prefix: '합계', prefixSize: 10, rise: 20, hold: 0.9 },
  hurt: { size: 22, color: '#ff4050', outline: '#200008', pop: 1.3, fall: true, jitter: 2, hold: 0.6 },
  heal: { size: 20, color: '#7ee07e', outline: '#06200a', pop: 1.3, prefix: '+', rise: 40, hold: 0.6 },
  /** DNF 숫자 기둥: 0.5초 안에 이어진 숫자는 16px 위로 (8칸 뒤 다시 아래), 3타 이상이면 마지막 타격 0.35초 뒤 합계 */
  column: { gap: 0.5, step: 16, height: 8, totalAfter: 3, totalDelay: 0.35 },
};

/**
 * 스타일 미터 — feel §4.10 (style.js, feel_hud.js 가 읽음)
 *  ranks[i] (i+1 = style.rank): r 글자 · min 기준 점수 · word 알림 문구 · sub 한국어 부제 · c 색
 */
export const STYLE = {
  ranks: [
    { r: 'D', min: 100, word: 'GOOD', sub: '좋아', c: '#a0a0a0' },
    { r: 'C', min: 250, word: 'NICE', sub: '멋지다', c: '#7ee07e' },
    { r: 'B', min: 500, word: 'GREAT!', sub: '훌륭하다', c: '#5aa8ff' },
    { r: 'A', min: 850, word: 'EXCELLENT!', sub: '굉장하다', c: '#c07cff' },
    { r: 'S', min: 1300, word: 'SAVAGE!!', sub: '잔혹하다', c: '#ffa640' },
    { r: 'SS', min: 1900, word: 'INSANE!!', sub: '광란', c: '#ff5a4a' },
    { r: 'SSS', min: 2700, word: 'BLOOD NOCTURNE!!!', sub: '피의 야상곡', c: '#ffe070', c2: '#ff3040' },
  ],
  max: 3200,
  base: 10,
  weight: { L: 1, M: 1.5, H: 2, F: 3, U: 0.2, S: 0, A: 0 },
  variety: { window: 6, fresh: 1.5, stale: 0.4, staleN: 3 },
  air: 1.3, otg: 1.2, companion: 0.5,
  events: { launch: 30, wallBounce: 40, groundBounce: 40, bounce: 40, counter: 25, back: 10, kill: 50, multiKill: 60, chase: 20, crit: 10, stagger: 30 },
  eventDedupe: 0.15,                    // 같은 대상·같은 사건은 0.15초 안에 한 번만
  multiKillWindow: 0.5,
  decayDelay: 1.2, decay: 30, decayIdle: 120,   // 콤보가 끊긴 뒤에는 빠르게 식는다
  announce: { hold: 0.7, fade: 0.25, gap: 0.8, queue: 2 },
  milestones: [10, 25, 50, 100, 150, 200, 300],
  comboBonus: 500,                      // 콤보 종료 보너스 = rank² × 500 (world.endCombo)
};

/**
 * 각성 게이지 획득량 — feel §6.1 (world.js 와 style.js 가 사용)
 *  모든 획득 × (1 + ultGain/ultGainDiv). zeroTags 태그가 붙은 타격은 0. 전직(tier) minTier 미만은 게이지 없음.
 */
export const AW_GAIN = {
  hit: 0.5, crit: 1.0, kill: 2, eliteKill: 8,
  launch: 3, bounce: 3, counter: 3, rankUp: 1,
  bossIntro: 25, phase: 15, rage: 6, rageFrac: 0.10,
  ultGainDiv: 200, zeroTags: ['ult', 'awaken', 'companion'], minTier: 1, max: 100,
};

/** 진동 (strong, weak, ms) — feel §4.1, §4.12. 휴대폰 진동은 haptics.js 가 H 이상에만 */
export const RUMBLE = {
  L: [0, 0.25, 40], M: [0.1, 0.4, 60], H: [0.35, 0.6, 90], F: [0.6, 0.8, 140], S: [1.0, 1.0, 300], A: [1.0, 1.0, 450],
  crit: [0, 0.45, 60],
  landHeavy: [0.4, 0.2, 100], hurt: [0.5, 0.5, 120], awaken: [0.6, 0.9, 400],
  vibrate: { H: 15, F: 15, S: 60, A: 60, awaken: [40, 30, 80] },
};

/** 성능 예산 — feel §8, MASTER_PLAN §5.2 (품질별) */
export const BUDGET = {
  high: { fxMax: 1400, perHit: 28, ultPeak: 600, awakenPeak: 700, dmgNums: 24, ghosts: 8, decals: 40, fullPasses: 3, gradients: 16, heroDraws: 10, sfxPer100ms: 10 },
  medium: { fxMax: 900, perHit: 18, ultPeak: 400, awakenPeak: 450, dmgNums: 16, ghosts: 5, decals: 24, fullPasses: 2, gradients: 10, heroDraws: 6, sfxPer100ms: 8 },
  low: { fxMax: 500, perHit: 10, ultPeak: 220, awakenPeak: 250, dmgNums: 10, ghosts: 3, decals: 0, fullPasses: 1, gradients: 6, heroDraws: 3, sfxPer100ms: 6 },
  hitVoices: 6,                          // 살아 있는 hit* 효과음이 이보다 많으면 재질 층 생략
};

/**
 * 동작 배율 보정 (moveId → 피해 배율). 채찍(카엘)의 1타 피해가 같은 레벨·티어의 검(아젤)보다
 * 약 55%에 머물러(tools/.qa_feel-impact 측정) 채찍 동작 전체를 끌어올린다. 사거리 우위(150 vs 96 px)는 남겨 둔다.
 */
export const MV_SCALE = {
  whip1: 1.3, whip2: 1.3, whip3: 1.35, whip4: 1.5,
  whipA1: 1.3, whipA2: 1.3, whipLow: 1.3,
  whipUp: 1.2, whipDash: 1.2, whipDown: 1.2, whipCharge: 1.25,
};
