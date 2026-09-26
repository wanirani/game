// STUB (W0 SKEL) — owner: CMP-SYS
// 동료 런타임 (companions §12.1, §12.4; MASTER_PLAN §1.7 world.js 훅).
//  class CompanionSystem (world.companions)   class CompanionDirector extends Entity
//  companionHubEnter(game, hub)   companionHubNote(state) → 게시판 문구 | null
// 스텁: 모든 메서드가 아무것도 하지 않는다 (incoming → null, shieldT 0, hudInfo → null, airDrainMul 1).
import { Entity } from './entity.js';

export class CompanionSystem {
  constructor(world) {
    this.world = world;
    this.active = false;
    this.shieldT = 0;
    this.airDrainMul = 1;
    this.hudRects = [];
    this.debug = { summon() {}, dismount() {}, knock() {}, skill(i) {}, setLevel(id, lv) {} };
  }
  onRoomLoaded(roomId) {}
  sync() {}
  update(dt) {}
  onHit(target, info, attack) {}
  onKill(enemy, exp) {}
  onBossStart(boss) {}
  onBossDefeated(boss) {}
  onRespawn() {}
  onStatsChanged() {}
  incoming(p, dmg, attack) { return null; }
  tryGuardianSkill(auto = false) { return false; }
  hudInfo() { return null; }
}

/** 보이지 않는 감독 엔티티 (실제 구현에서 엔티티 루프 안에서 CompanionSystem.update 를 부른다) */
export class CompanionDirector extends Entity {
  constructor(system) {
    super(0, 0, 1, 1);
    this.kind = 'director';
    this.z = -99;
    this.system = system;
  }
}

export function companionHubEnter(game, hub) {}
export function companionHubNote(state) { return null; }
