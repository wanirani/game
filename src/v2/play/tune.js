// v2 play — 조율값 한 곳. 단위: 거리 = 논리 px (1 m = UNIT 58), 시간 = 초, 속도 = px/초. docs/v2/PLAY_API.md §4
export const UNIT = 58;

export const TUNE = {
  // ── 영웅: 이동 ──
  runX: 275, runZ: 208,            // 가장 빠른 속도 (좌우 · 앞뒤 — 비스듬한 카메라에서는 깊이가 줄어 보여 앞뒤를 덜 준다)
  accel: 20, airAccel: 9,          // 속도가 목표를 따라가는 빠르기 (1/초)
  // 돌기: 속도는 늘 몸이 보는 쪽으로만 난다 (옆 · 뒤로 미끄러지지 않는다). 작은 꺾음은 달리던 채로 돌고, 크게 꺾으면 멈춰 서서 돌아선 뒤 박찬다
  turnRate: 14.8, turnEase: 30,    // 몸이 도는 가장 빠른 빠르기(rad/초 — 장면의 TURN_RUN 15 를 넘기지 않는다) · 작은 각을 따라붙는 빠르기(1/초)
  turnKeep: 40, turnSlow: 0.5,     // 이 각(도) 안으로 꺾을 때는 속도를 그대로 · pivotAt 에 가까울수록 이 비율까지 줄인다
  pivotAt: 100, pivotEnd: 45,      // 스틱이 몸과 이 각(도) 넘게 벌어지면 돌아서기(멈춤 → 제자리 돌기) · 이 각 안으로 들어오면 박차고 나간다
  pivotRate: 14.8, brake: 18,      // 돌아서는 빠르기(rad/초; 180° = 0.21초) · 돌아설 때 멈추는 빠르기(1/초)
  sideDamp: 24,                    // 몸이 보는 쪽이 아닌 속도(밀림 · 막기 뒤)가 스러지는 빠르기(1/초)
  walkBelow: 120,                  // 이 속도 아래는 걷기 걸음
  stepL: { run: 0.54, walk: 0.46 }, // 걸음 주기에서 왼발이 닿는 때 (오른발 = 0; 달리기 · 걷기 클립의 발 사건 자리)
  strideRun: 222, strideWalk: 74,  // 한 걸음 주기에 나아가는 거리 (달리기 클립 0.8초 · 걷기 클립 1.17초의 실제 보폭 — 발이 미끄러지지 않게)
  jumpV: 720, gravity: 2300, jumpCut: 0.42, coyote: 0.09,
  landT: 0.12,
  stopSkidAbove: 130,              // 이 속도보다 빨리 달리다 스틱을 놓으면 미끄러져 서는 동작을 튼다 (그림만; 크게 두면 꺼진다)
  runBank: 1.1,                    // 달리며 돌 때 도는 쪽으로 기우는 정도 (도 ÷ (rad/초); 최대 11°. 0 = 끔)
  runLeanFix: 12,                  // 달리기 클립의 숙임을 이만큼(도) 세운다 (motion.js — 그림만 바뀐다)
  // ── 영웅: 구르기 (옛 대시 자리. 입력 이름은 그대로 dash) ──
  rollT: 0.46, rollDist: 150, rollIfr: 0.3, rollCd: 0.62, rollSweep: 0.26,   // 시간 · 거리 · 무적 · 다시 구르기까지 · 구른 뒤 훑기를 받아 주는 시간
  dashV: 650, dashT: 0.46, dashCd: 0.62, dashIfr: 0.3,                       // (옛 이름. 읽는 코드가 있을까 봐 남긴다)
  // ── 영웅: 막기 · 튕겨내기 ──
  parryWin: 0.2,                   // 막기 시작 뒤 이 시간 안에 공격이 닿으면 튕겨내기
  parryT: 0.42, blockT: 0.24,      // 튕겨낸 뒤 · 막은 뒤 자세 시간
  guardTap: 0.3,                   // dash 만 눌렀을 때(스틱 없음) 막기를 유지하는 최소 시간
  guardArc: 100,                   // 앞쪽 ±도 안에서 온 공격만 막는다
  guardPush: 130,                  // 막았을 때 밀리는 속도
  // ── 영웅: 공격 ──
  dmgBase: 11,
  hitZ: 28, assistZ: 64,           // (옛 이름) 판정 옆 폭 · 조준 보정 폭
  lockRange: 380, lockKeep: 470,   // 락온이 걸리는 거리 · 풀리는 거리
  lockAim: 230,                    // 스틱 없이 공격하면 이 거리 안의 락온 대상 쪽으로 돈다
  aimCone: 55,                     // 스틱을 민 채 공격하면 그 방향 ±도 안의 적으로 보정
  lungeMax: 52,                    // 공격이 대상에게 닿도록 내딛는 최대 거리 (다리가 한 걸음으로 옮길 수 있는 만큼 — motion.js 가 그동안 다리를 달리기 걸음으로 덮는다)
  queueT: 0.25,                    // 먼저 누른 공격을 기억하는 시간
  // ── 영웅: 도구 (GDD §7) ──
  chargeHold: 0.3, chargeT: 0.55, chargeMin: 0.35, chargeKeep: 0.6,   // 공격을 이만큼 누르고 있으면 모으기 시작 · 다 모으는 시간 · 이보다 덜 모으면 그냥 푼다 · 다 모은 채 버티는 시간(지나면 저절로 나간다)
  pullT: 0.2,                      // 휘감기에 끌려오고 · 끌려가는 시간
  resoCells: 3, resoParry: 0.5,    // 울림 눈금 칸 수 · 튕겨낼 때 차는 양 (타격: L 0.08 · M 0.1 · H 0.16 · F 0.2 · 휘감기 0.18–0.45)
  hookRange: 330, hookRise: 280, hookThrow: 0.16, hookSpeed: 760,      // 채찍 걸기: 고리가 이 거리 안 · 이 높이 차 안이면 · 던지는 시간 · 날아가는 빠르기
  callCd: 6, callAt: 0.32, callT: 0.7, callR: 190, callDur: 5, callAim: 260,   // 부름(세라의 등불): 쉼 · 빛이 놓이는 때 · 동작 길이 · 빛의 반지름 · 머무는 시간 · 락온 대상이 이 거리 안이면 그 발밑에
  bellTap: 0.3, bellCd: 2.2, echoAt: 0.2, echoT: 0.52, echoR: 260, echoReveal: 3.5,   // 종: 이보다 짧게 누르면 메아리 · 쉼 · 울리는 때 · 동작 길이 · 닿는 반지름 · 드러나 있는 시간
  ringT: 0.8, knellRange: 200,     // 길게: bellTap 뒤 이만큼 더 누르면 다 찬다(= hooks.ringLong) · 무릎 꿇은 보스가 이 거리 안이면 조종
  // ── 영웅: 몸 ──
  heroHp: 100, hurtIfr: 0.95, hurtT: 0.26, pitDmg: 8, pitY: -170, deadT: 2.1,
  ownHitstop: true,                // 맞혔을 때 규칙이 스스로 멈춘다 (hooks.hit 이 { stop } 을 돌려주면 그 값을 쓴다)
};
