// STUB (W0 SKEL) — owner: GIMMICK-ENGINE
// 스테이지 기믹 엔진 (world2 §3.1–3.3). world.js·player.js·장면을 import 하지 않는다 (world 인스턴스를 받는다).
//  createGimmick(world, room) → GimmickSet | null   (world.gimmick)
//  GIMMICK_KINDS = ['mirror','magma','deep','wind','heartbeat','blight','voidwall']
//  class MirrorSwitch extends Entity   맵 문자 'Q'
//  SporePod (gimmicks_b.js 에서 다시 export) 맵 문자 'y'
// 스텁: 기믹이 없다 (createGimmick 은 null) → 모든 호출부는 world.gimmick?.… 로 오늘처럼 동작한다.
import { Entity } from './entity.js';
export { SporePod } from './gimmicks_b.js';

export const GIMMICK_KINDS = ['mirror', 'magma', 'deep', 'wind', 'heartbeat', 'blight', 'voidwall'];

export function createGimmick(world, room) { return null; }

export class MirrorSwitch extends Entity {
  constructor(x = 0, y = 0) {
    super(x, y, 32, 48);
    this.kind = 'prop';
  }
}
