// STUB (W0 SKEL) — owner: CMP-MOUNT-ART-A
// 탈것 공용 리그 (companions §11.1, 순수 수학, ctx 없음):
//  mountPose(m, dt) → pose (갱신마다 1회; 그리기·안장·피격 판정이 재사용)   seatOf(pose, out) → {x, y, lean}
// 스텁: 포즈 없음 (null), 안장 = 원점.
export function mountPose(m, dt) { return null; }
export function seatOf(pose, out = { x: 0, y: 0, lean: 0 }) {
  out.x = pose?.seat?.x ?? 0;
  out.y = pose?.seat?.y ?? 0;
  out.lean = pose?.seat?.lean ?? 0;
  return out;
}
