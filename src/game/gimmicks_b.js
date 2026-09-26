// STUB (W0 SKEL) — owner: GIMMICK-KINDS-B
// 기믹 종류 B: heartbeat · blight · voidwall 과 포자 주머니 소품 'y' (world2 §3.5).
//  GIMMICKS_B = { [kind]: 기믹 클래스/팩토리 }   (gimmicks.js 가 GIMMICK_KINDS 와 함께 읽는다)
//  class SporePod extends Entity                 (gimmicks.js 가 다시 export 한다)
// 스텁: 비어 있음. SporePod 는 아무것도 하지 않는 엔티티.
import { Entity } from './entity.js';

export const GIMMICKS_B = {};

export class SporePod extends Entity {
  constructor(x = 0, y = 0) {
    super(x, y, 32, 32);
    this.kind = 'prop';
  }
}
