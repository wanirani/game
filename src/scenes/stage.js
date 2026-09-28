// 게임플레이 장면: World 구동 + HUD + 일시정지 진입
//  map(빠른 메뉴: Tab·I·M / 패드 SELECT / 터치 '가방') → 메뉴의 인벤토리 탭 (platform §3, P-07)
//  토스트는 game.js 가 hudLayout().toast(i) 줄에 그린다 (MASTER_PLAN §1.8; STAGE CLEAR 배너는 hudLayout 의 알림 칸)
import { Scene } from '../core/game.js';
import { World } from '../game/world.js';
import { drawHUD } from '../render/hud.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import * as PUPPET from '../render/hero_puppet.js';

export class StageScene extends Scene {
  enter({ stageId = 's01', roomId = null, mode = 'story' } = {}) {
    this.world = new World(this.game, stageId, { roomId, mode });
    this.game.world = this.world;
    this.stageId = stageId;
    // 영웅 채색 퍼펫을 입장 페이드 동안 받아 둔다 (첫 프레임에 벡터 → 퍼펫으로 바뀌어 보이지 않게)
    const h = this.world.player?.hero;
    try { if (h?.charId && PUPPET.puppetEnabled?.() !== false) PUPPET.preloadPuppet?.(h.charId, h.classId); } catch (e) { console.error(e); }   // [hook:plat]
  }
  exit() { this._pauseWanted = false; if (this.game.world === this.world) this.game.world = null; }
  resize() { this.world?.camera.setView(this.game.viewW, this.game.viewH); }
  onResume() { this.world.player?.refreshStats(); }
  canPause() { const w = this.world; return !!w?.player && !w.cleared && !w.player.dead && !w.cutscene; }
  /**
   * 기기를 세로로 돌리거나 탭이 백그라운드로 가거나 패드가 끊기면 일시정지 메뉴를 띄운다 (core/game.js).
   * 지금 열 수 없으면 (필살기·각성 연출 world.cutscene, 페이드 중) 기억해 두었다가 열 수 있게 된 첫 update 에서 연다 (platform §4.1).
   */
  autoPause() {
    const g = this.game, w = this.world;
    if (g.top === this && g.fade.dir <= 0 && this.canPause()) { this._pauseWanted = false; g.push('pause', { world: w }); return; }
    if (w?.player && !w.cleared && !w.player.dead) this._pauseWanted = true;   // [hook:plat]
  }
  update(dt) {
    const w = this.world;
    this.game.state.stats.playTime = (this.game.state.stats.playTime ?? 0) + dt;
    if (this._pauseWanted) {   // [hook:plat] 연출 중에 들어온 자동 일시정지 요청
      if (w.cleared || w.player?.dead) this._pauseWanted = false;
      else if (this.game.fade.dir <= 0 && this.canPause()) { this._pauseWanted = false; this.game.push('pause', { world: w }); return; }
    }
    if (input.pressed('menu') && this.canPause()) {
      audio.sfx('menu_ok');
      this.game.push('pause', { world: w });
      return;
    }
    if (input.pressed('map') && this.canPause() && this.game.registry.menu) {   // [hook:plat] 빠른 메뉴 → 인벤토리
      audio.sfx('menu_ok');
      this.game.push('menu', { world: w, tab: 'inventory' });
      return;
    }
    w.update(dt);
  }
  render(ctx) {
    const w = this.world;
    w.render(ctx);
    drawHUD(ctx, w, this.game.viewW, this.game.viewH);
  }
}
