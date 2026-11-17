// v2 play — 조율값 한 곳. 단위: 거리 = 논리 px (1 m = UNIT 58), 시간 = 초, 속도 = px/초. docs/v2/PLAY_API.md §4
export const UNIT = 58;

export const TUNE = {
  // ── 영웅: 이동 ──
  runX: 275, runZ: 208,            // 가장 빠른 속도 (좌우 · 앞뒤 — 비스듬한 카메라에서는 깊이가 줄어 보여 앞뒤를 덜 준다)
  accel: 16, airAccel: 9,          // 속도가 목표를 따라가는 빠르기 (1/초)
  walkBelow: 120,                  // 이 속도 아래는 걷기 걸음
  stepL: { run: 0.54, walk: 0.46 }, // 걸음 주기에서 왼발이 닿는 때 (오른발 = 0; 달리기 · 걷기 클립의 발 사건 자리)
  strideRun: 222, strideWalk: 80,  // 한 걸음 주기에 나아가는 거리 (달리기 클립 0.8초 · 걷기 클립 1.17초의 실제 보폭 — 발이 미끄러지지 않게)
  jumpV: 720, gravity: 2300, jumpCut: 0.42, coyote: 0.09,
  landT: 0.12,
  stopSkidAbove: 190,              // 이 속도보다 빨리 달리다 스틱을 놓으면 미끄러져 서는 동작을 튼다 (그림만; 크게 두면 꺼진다)
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
  lungeMax: 78,                    // 공격이 대상에게 닿도록 내딛는 최대 거리
  queueT: 0.25,                    // 먼저 누른 공격을 기억하는 시간
  // ── 영웅: 몸 ──
  heroHp: 100, hurtIfr: 0.95, hurtT: 0.26, pitDmg: 8, pitY: -170, deadT: 2.1,
  ownHitstop: true,                // 맞혔을 때 규칙이 스스로 멈춘다 (hooks.hit 이 { stop } 을 돌려주면 그 값을 쓴다)
};
