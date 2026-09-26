// STUB (W0 SKEL) — owner: FEEL-MOVE
// 이동 손맛 로직 (player.js 가 호출). 계약 (feel.md §9 WP1, MASTER_PLAN §1.7):
//  initFeel(p)                          생성자 끝에서 1회
//  updateGait(p, world, dt, inp) → gait|null   null = 오늘의 이동 수치 그대로 (탑승 중에도 null)
//  onJump(p, world, air)                점프/벽차기 직후
//  onLand(p, world, vyBefore, fallPx)   착지 (탑승 중에는 호출하지 않음)
//  dashFx(p, world, phase)              대시 시작/진행/끝 연출
//  squashSpring(p, dt)                  찌그러짐 스프링
// 스텁: 모두 아무것도 하지 않는다 (오늘의 동작 유지).
export function initFeel(p) {}
export function updateGait(p, world, dt, inp) { return null; }
export function onJump(p, world, air) {}
export function onLand(p, world, vyBefore, fallPx) {}
export function dashFx(p, world, phase) {}
export function squashSpring(p, dt) {}
