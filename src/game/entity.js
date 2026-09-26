// 엔티티 기본 클래스. x,y = AABB 좌상단 (월드 px), w,h = 크기.
// kind: 'player' | 'enemy' | 'boss' | 'projectile' | 'pickup' | 'prop' | 'platform' | 'npc' | 'hitbox' | 'effect'
// 그리기 기준점: 발 중앙 (cx, bottom)
export class Entity {
  constructor(x = 0, y = 0, w = 16, h = 16) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.dead = false;
    this.kind = 'entity';
    this.z = 0;          // 그리기 순서 (큰 값이 앞)
    this.t = 0;          // 생성 후 경과 시간
    this.onGround = false;
    this.world = null;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get bottom() { return this.y + this.h; }
  set cx(v) { this.x = v - this.w / 2; }
  set bottom(v) { this.y = v - this.h; }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  /** 발 중앙 기준 상대 사각형(전방 facing 반영) → 월드 사각형 */
  relRect(rx, ry, rw, rh) {
    const x = this.facing > 0 ? this.cx + rx : this.cx - rx - rw;
    return { x, y: this.bottom + ry, w: rw, h: rh };
  }
  update(dt, world) { this.t += dt; }
  draw(ctx, world) {}
  /** 조명 등록 등 (그리기 전 매 프레임) */
  lights(L) {}
  onRemove(world) {}
}
