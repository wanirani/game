// STUB (W0 SKEL) — owner: CMP-MOUNT
// 탈것 런타임 (companions §3, §12.1; MASTER_PLAN §1.7 player.js 훅, §1.14):
//  class MountRider (player.mount)   class MountGhost extends Entity   DISMOUNT_SKILLS   fits(world, x, bottom, w, h)   findMountSpot(world, p, def)
// 스텁: 탈것이 붙지 않는다 (player.mount 는 null 그대로). 누군가 MountRider 를 만들더라도 riding=false 이고
// player.js 훅이 부르는 메서드는 모두 오늘의 동작을 돌려준다.
import { Entity } from './entity.js';

const ZERO = Object.freeze({ dx: 0, dy: 0 });

export const DISMOUNT_SKILLS = [];

export class MountRider {
  constructor(system, id, def) {
    this.system = system ?? null;
    this.id = id ?? null;
    this.def = def ?? null;
    this.state = 'stowed';
    this.riding = false;
    this.chargeT = 0;
    this.invulnT = 0;
  }
  tick(dt, world, p, inp) {}
  profile(p) { return null; }
  handleJump(world, p, dt) { return false; }
  tryCharge(world, p, ax, ay) { return false; }
  updateCharge(dt, world, p) {}
  trySpecial(world, p) { return false; }
  adaptMove(mv) { return mv; }
  riderLift() { return ZERO; }
  afterPhysics(dt, world, p, vyBefore) {}
  hazard(kind, p, world) { return false; }
  incoming(p, dmg, attack) { return null; }
  dismount(world, p, reason) {}
  beforeCast(world, p, id) {}
  rideStats() { return {}; }
  refresh(p) {}
  hurtbox(p) { return p.rect(); }
  updateAnim(dt, world, p) {}
  riderAnim(p) { return 'idle'; }
  riderView(p) { return p; }
  draw(ctx, world, p, layer) {}
  lights(L, p) {}
  ghost(world, p, color) {}
  healFrac(frac) {}
}

export class MountGhost extends Entity {
  constructor(x = 0, y = 0, w = 60, h = 60) {
    super(x, y, w, h);
    this.kind = 'effect';
  }
}

export function fits(world, x, bottom, w, h) { return false; }
export function findMountSpot(world, p, def) { return null; }
