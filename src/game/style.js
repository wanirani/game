// STUB (W0 SKEL) — owner: FEEL-IMPACT
// 스타일 미터 (DNF식 랭크). 계약 (feel.md §4.10, §9 WP2): world.style = new Style(world)
//  pts, rank(0=없음), best, last6[]; onHit(info, attack, target), onEvent(name, data), onKill(e, attack),
//  onHurt(dmg), update(dt). 랭크 상승은 FEEL-HUD 의 알림 대기열로 전달한다.
// 스텁: 점수를 쌓지 않는다 (hud.js 의 기존 콤보 표시가 그대로 쓰인다).
export class Style {
  constructor(world) {
    this.world = world;
    this.pts = 0;
    this.rank = 0;
    this.best = 0;
    this.last6 = [];
  }
  onHit(info, attack, target) {}
  onEvent(name, data) {}
  onKill(e, attack) {}
  onHurt(dmg) {}
  update(dt) {}
}
