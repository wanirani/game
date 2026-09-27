// 이동 손맛 데이터 (owner: FEEL-MOVE) — feel.md §3, §9 WP1 · MASTER_PLAN §1.4, §1.9
// 걷기·달리기·질주 표, 영웅별 걸음 성격, 스테이지 지면, 대시 연출, 미끄러짐·방향 전환·착지 수치.
// 순수 데이터: 아무것도 import 하지 않는다 (render/hero_gait.js 와 game/feel_move.js 가 함께 읽는다).
//
// 걸음 위상 p.gaitPh (라디안): 한 걸음 = π. 발이 땅에 닿는 순간 = GAIT.contactPh + kπ.
//   render/hero.js 의 poseRun(달리기 자세)은 가까운 발이 ph ≈ π/2 − 0.45 에서 땅에 닿는다.
//   걷기·질주 자세(hero_gait.js)도 같은 위상 규약을 쓰고, 발소리 이벤트는 그 접지 순간에 울린다
//   (feel M5 판정: (gaitPh − GAIT.contactPh) mod π < 0.2).

/** 걸음새 (feel §3.1, §3.3.2). mul = 기본 속도 B 배율, A = 보폭, lift = 발 들림, bob = 엉덩이 상하(2배 주기), arm = 팔 흔들기(rad), reach = 팔 뻗음 */
export const GAIT = {
  contactPh: Math.PI / 2 - 0.45,   // 접지 위상 (poseRun 과 같은 규약)
  walkMax: 0.55,                   // 아날로그 기울기가 이보다 작으면 걷기 (키보드는 늘 ±1 → 걷기 없음)
  moveMin: 30,                     // 이 속도(px/s) 이하면 멈춰 선 것으로 본다 (예전 'run' 판정과 같다)
  walk:   { mul: 0.5, accel: 2200, decel: 2600, A: 10, lift: 5, bob: 1.0, lean: 0.05, hd: -0.02, arm: 0.45, reach: 0.85, toe: 0.25 },
  run:    { mul: 1, accel: 3200, decel: 3600, A: 15, lift: 12, bob: 2.0, lean: 0.18, hd: -0.12, arm: 1.0, reach: 0.7 },
  sprint: { accel: 2600, decel: 3600, A: 19, lift: 16, bob: 2.6, lean: 0.36, hd: -0.22, arm: 1.25, reach: 0.6,
    ninja: { a1: 2.45, a2: 2.7, r: 0.94, lean: 0.5 } },   // 리아·아젤 '닌자 질주' (두 팔을 뒤로)
  air: { accel: 2200, decel: 900 },
};

/** 걸음 박자 (걸음/초), r = |vx| / B 에 대해 구간 선형 (feel §3.3.1) */
export const CADENCE = { r: [0, 0.5, 1.0, 1.32], steps: [1.6, 2.4, 4.2, 5.0] };

/**
 * 영웅별 걸음 성격 (feel §3.3.2 표). cad 박자 · A 보폭 · bob 상하 · lean 기울기 · vol 발소리 · dust 먼지 · arm 팔 흔들기
 * sprintK 질주 배율 (feel §3.1) · skidDecel 미끄러짐 감속 · ninja 닌자 질주 자세 · sprintKick 질주 발걸음 화면 반동 ·
 * sprintGravel 질주 발걸음 자갈 · sprintMist 질주 두 걸음마다 붉은 안개 · airFx 공중 점프 장식 · dashCol 대시 잔상 첫 색(없으면 필살기 색)
 */
export const PERSONALITY = {
  kael:   { cad: 1.0,  A: 1.0,  bob: 1.0, lean: 1.0, vol: 1.0, dust: 1.0, arm: 1.0, sprintK: 1.32, skidDecel: 1800, airFx: 'holy' },
  sera:   { cad: 1.08, A: 0.85, bob: 0.9, lean: 0.8, vol: 0.8, dust: 0.8, arm: 1.0, sprintK: 1.32, skidDecel: 1800, airFx: 'feather_w' },
  victor: { cad: 1.0,  A: 1.0,  bob: 1.0, lean: 0.9, vol: 1.0, dust: 1.0, arm: 0.8, sprintK: 1.32, skidDecel: 1800, airFx: 'smoke' },
  bran:   { cad: 0.9,  A: 1.1,  bob: 1.3, lean: 1.0, vol: 1.4, dust: 1.5, arm: 1.0, sprintK: 1.25, skidDecel: 1500, airFx: null, sprintKick: 0.8, sprintGravel: 1 },
  lia:    { cad: 1.1,  A: 1.0,  bob: 0.8, lean: 1.1, vol: 0.7, dust: 0.7, arm: 1.0, sprintK: 1.38, skidDecel: 2200, airFx: 'feather', ninja: true },
  azel:   { cad: 1.0,  A: 1.0,  bob: 0.6, lean: 1.0, vol: 0.8, dust: 0.5, arm: 1.0, sprintK: 1.32, skidDecel: 1800, airFx: 'bats', ninja: true, sprintMist: true },
  _default: { cad: 1.0, A: 1.0, bob: 1.0, lean: 1.0, vol: 1.0, dust: 1.0, arm: 1.0, sprintK: 1.32, skidDecel: 1800, airFx: null },
};

/**
 * 스테이지별 지면 → 발소리 'step_<지면>' (feel §3.4, MASTER_PLAN §1.9). 모르는 스테이지는 'stone'.
 * { liquid: 'water', dry: 'stone' } = 플레이어가 액체 속이거나 방에 액체 칸이 있으면 water, 아니면 dry.
 * 방(room.surface)이나 스테이지(stage.surface)에 surface 가 있으면 그것이 먼저다.
 */
export const SURFACE = {
  s01: 'dirt', s02: 'dirt', s03: 'stone', s04: 'stone', s05: 'bone', s06: 'wood', s07: 'metal',
  s08: { liquid: 'water', dry: 'stone' },
  s09: 'metal', s10: 'snow', s11: 'stone', s12: 'stone', s13: 'flesh',
  // Part 2 (다른 세계)
  s14: 'metal',   // 거울 궁전: 유리 바닥 (금속성 울림)
  s15: 'metal',   // 대장간 지옥
  s16: { liquid: 'water', dry: 'stone' },
  s17: 'stone', s18: 'flesh', s19: 'dirt', s20: 'stone',
  hub: 'dirt',
  _default: 'stone',
};
export const SURFACES = ['stone', 'dirt', 'wood', 'metal', 'snow', 'water', 'bone', 'flesh'];

/** 걸음새별 발소리·먼지 (feel §3.4) */
export const STEP = {
  walk:   { vol: 0.12, pitch: 0.06, dust: 0, dustP: 0 },
  run:    { vol: 0.18, pitch: 0.08, dust: 1, dustP: 0.4 },
  sprint: { vol: 0.24, pitch: 0.08, dust: 2, dustP: 1, pebble: 1, water: 4 },
  dustOpts: { size: 5, speed: 30 },
  pebble: { size: 2, color: '#7a7068' },
};

/** 질주 (feel §3.1, §3.5, §3.7; MASTER_PLAN §1.4) */
export const SPRINT = {
  tapWindow: 0.24,       // 첫 누름을 뗀 뒤 이 시간 안에 같은 방향을 다시 누르면 질주
  tapMax: 0.3,           // 첫 누름이 이보다 길면 '톡' 이 아니다 (달리다 잠깐 뗐다 다시 누른 것은 질주가 아님)
  landGrace: 0.2,        // 공중에서 두 번 톡 → 이 시간 안에 착지하면 질주로 시작
  chainWindow: 0.1,      // 지상 대시가 끝나고 이 시간 안에 같은 방향을 누르고 있으면 질주 (대시 연계)
  autoAfter: 0.35,       // 설정 autoSprint: 이만큼 계속 달리면 질주
  touchHint: true,       // 터치 스틱 바깥 고리(input.sprintHint) → 질주
  rampAccel: 2600,       // B 에서 k·B 로 올라가는 가속
  decayT: 0.35,          // 질주가 끝난 속도가 B 로 줄어드는 시간 (공중에서 놓았다가 다시 누르고 착지)
  arenaMinTiles: 16,     // 이보다 좁은 보스 경기장에서는 질주 없음
  cmdWindow: 0.25,       // →→ 뒤 이 시간 안의 공격만 수룡참(→→+공격) 후보, 그 뒤는 늘 질주 공격 (MASTER_PLAN §1.4)
  airLean: 0.08,         // 공중 질주 기울기 덧셈
  // 카메라 (feel §3.7): 질주 룩어헤드 추가, 0.4초 뒤 줌 0.96, 끝나면 1.0 으로
  lookBoost: 50, zoom: 0.96, zoomAfter: 0.4,
  // 화면 가장자리 속도선 (feel §3.5): 0.4초 이상 질주 → 0.1초마다 2줄, 알파 0.22, low 품질에선 끔
  edgeAfter: 0.4, edgeEvery: 0.1, edgeN: 2, edgeAlpha: 0.22,
};

/** 미끄러짐 · 방향 전환 · 달리기 시작 (feel §3.2) */
export const SKID = {
  runMin: 0.9,           // 달리기에서 방향을 놓을 때 |vx| ≥ 0.9·B 면 미끄러짐
  runT: 0.16, sprintT: 0.22,
  decel: 1800,           // 영웅별 값은 PERSONALITY.skidDecel
  edgeProbe: 6,          // 가장자리 보호: 앞쪽 6px 아래에 발판이 없으면 멈춤
  puffEvery: 0.03,       // 앞발 먼지 간격
  sparkSurfaces: ['metal', 'stone'],
  pivotMin: 0.7,         // 반대 방향 입력 시 |vx| ≥ 0.7·B 면 방향 전환 동작
  pivotT: 0.10, pivotAccel: 5000,
  pivotDust: 6,
  runStartT: 0.08, runStartDust: 3, runStartVol: 0.12,
  rollSkidT: 0.1,        // 빅터 구르기 끝의 짧은 미끄러짐 (모습만; 대시 거리는 그대로)
};

/** 착지 (feel §3.2, §3.6) */
export const LAND = {
  heavyVy: 900, heavyFall: 192,      // 이 속도 이상 또는 최고점에서 4칸 넘게 떨어지면 무거운 착지
  heavyT: 0.18, normalT: 0.12,
  heavyInPlace: 0.5,                 // |vx| 가 이보다 빠르게(B 배율) 달리며 방향을 누른 채 착지하면 다리는 계속 달린다 (소리·충격만)
  ring: { w: 90, h: 14, color: '#d8c8b0' }, gravel: 8, kick: 5, rumble: [0.4, 0.2, 100],
  takeoffRing: { r0: 8, r1: 34, color: 'rgba(216,200,176,0.7)' },
  momentum: 0.35,                    // 착지 뒤 질주 속도가 B 로 줄어드는 시간
};

/** 찌그러짐·늘어남 스프링과 충격값 (feel §3.6), 가속 기울기 (§3.3.2) */
export const SQUASH = {
  omega: 30, zeta: 0.35,
  takeoff: 1.14, airJump: 1.10, wall: 1.08, land: 0.84, heavy: 0.72,
  fallStretch: 0.06, fallRef: 980,
  wallLean: 0.3, leanDecay: 6,
  accLeanDiv: 9000, accLeanMin: -0.12, accLeanMax: 0.2, accLeanTau: 0.08,
};

/**
 * 대시 연출 (feel §3.5). type: dash(카엘·브란·리아) · blink(세라) · roll(빅터) · mist(아젤)
 * ghostEvery 잔상 간격, ghosts 'trail' | 'ends'(시작·끝 두 장) | 0, lineEvery 속도선 간격, lines 한 번에 몇 줄
 */
export const DASH_FX = {
  ghostEvery: 0.035, ghostLife: 0.2, ghostCap: { high: 6, medium: 5, low: 3 },
  lineLen: [60, 140], lineLife: 0.12, lineSpeed: 260, lineY: 40, lineW: 2, lineAlpha: 0.5,
  dash:  { ring: { r0: 10, r1: 60, ry: 0.35, life: 0.18, color: 'rgba(255,255,255,0.8)' }, dust: 2, ghosts: 'trail', lineEvery: 0.03, lines: 2, lineColor: '#ffffff', lookBoost: 60, kick: 3, endDust: 4 },
  blink: { flash: 70, ring: { r0: 8, r1: 56, ry: 1, life: 0.2, color: 'rgba(255,242,176,0.9)' }, ghosts: 'ends', lines: 0, endSparkle: 6 },
  roll:  { dust: 12, ring: { r0: 10, r1: 50, ry: 0.28, life: 0.22, color: 'rgba(216,200,176,0.8)' }, ghosts: 0, trailEvery: 0.03, lineEvery: 0.06, lines: 1, lineColor: '#fff4e0', endSkid: true },
  mist:  { bats: 2, ghosts: 'trail', ghostEvery: 0.08, ghostTint: '#b0103a', lineEvery: 0.03, lines: 1, lineColor: '#ff3050', endMist: 6 },
};

/** 추격 점프 '추격!' (feel §4.3; 값은 data/feel_hit.js JUGGLE 가 있으면 그쪽) */
export const CHASE = { window: 0.35, vyK: 1.05, lead: 40, airStall: 0.5, maxVxK: 1.4, callout: '추격!', color: '#ffe070' };
