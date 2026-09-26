// STUB (W0 SKEL) — owner: FEEL-MOVE
// 걸음 포즈 순수 함수 (render/hero.js 훅이 호출). 계약 (feel.md §3.3.2, §3.3.3; MASTER_PLAN §1.7 drawHero 2·5단계):
//  gaitPose(P, K, anim, p, at)   'walk'|'sprint'|'run_start'|'skid'|'pivot'|'land_heavy' 포즈를 P 에 기록
//  applyFeelOverlay(P, p)        찌그러짐·가속 기울기·질주 기울기 (p.feel 없거나 p.ride 면 아무것도 안 함)
//  GAIT_ANIMS                    { [anim]: 유지 시간 등 } — holdFor() 에 쓰이는 표
// 스텁: 포즈를 건드리지 않는다.
export const GAIT_ANIMS = {};
export function gaitPose(P, K, anim, p, at) {}
export function applyFeelOverlay(P, p) {}
