// 게임플레이 장면: World 구동 + HUD + 일시정지 진입
//  map(빠른 메뉴: Tab·I·M / 패드 SELECT / 터치 '가방') → 메뉴의 인벤토리 탭 (platform §3, P-07)
//  토스트는 game.js 가 hudLayout().toast(i) 줄에 그린다 (MASTER_PLAN §1.8; STAGE CLEAR 배너는 hudLayout 의 알림 칸)
import { Scene } from '../core/game.js';
import { World } from '../game/world.js';
import { drawHUD } from '../render/hud.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import * as PUPPET from '../render/hero_puppet.js';
import * as HERO from '../render/hero.js';   // [hook:plat] heroScaleFor (MOTION, 있을 때만)
import * as TRIAL from '../game/trial.js';   // 시련 「메아리」 (classes_t3 §9.3–§9.4)
import { chapterLabel, stageTitle } from '../data/stages.js';   // [ux-fix #1] 첫 배너의 장 표시 · 제목 (1부 외전 s26 = 「외전 Ⅰ」 · 「파라켈의 지하 공방」)
import '../game/autoplay.js';   // [auto] 자동 전투 · 대상 고정 (불러오면 input 가상 입력원을 설치한다 — AUTO-QOL)

/**
 * [ux-fix #1] 스테이지 첫 배너 (world.js 가 'CHAPTER {chapter} · {sub}' 로 만든다): 장 표시를 data/stages.js chapterLabel 로,
 * 큰 글자를 stageTitle(온전한 이름)로 바꾼다 — sideLabel·fullName 이 있는 스테이지(지금은 s26)만 달라지고 나머지는 그대로다.
 * world.js 가 처음부터 chapterLabel/stageTitle 로 만들면 (text 가 이미 제목이라) 아무것도 하지 않는다.
 */
function fixStageBanner(w) {
  const b = w?.banner, st = w?.stage;
  if (!b || !st || (!st.sideLabel && !st.fullName) || b.text !== st.name) return;
  b.text = stageTitle(st);
  if (typeof b.sub === 'string') b.sub = b.sub.replace(`CHAPTER ${st.chapter ?? ''}`, chapterLabel(st, 'en'));
}

export class StageScene extends Scene {
  enter({ stageId = 's01', roomId = null, mode = 'story', trial = null } = {}) {
    // 시련 (mode 'trial', trial = 시련 id): 본래 스테이지 복사본 + 규칙·난이도·적 레벨 덮어쓰기로 보스방을 만들고 월드를 덮어쓴다 (game/trial.js)
    const prep = mode === 'trial' ? TRIAL.prepareTrial(this.game, trial) : null;
    if (mode === 'trial' && !prep) {   // 모르는 시련: 기록이 남지 않는 연습 월드로 띄우고 곧장 성당으로
      console.error('[stage] unknown trial', trial);
      this.world = new World(this.game, stageId, { roomId, mode: 'practice' });
      setTimeout(() => { if (this.game.top === this) TRIAL.leaveTrial(this.game, trial, 'blocked'); }, 0);
    } else this.world = prep ? new World(this.game, prep.stage, prep.opts) : new World(this.game, stageId, { roomId, mode });
    if (!prep) fixStageBanner(this.world);   // [ux-fix #1]
    if (prep) TRIAL.attachTrial(this, this.world, prep.T);
    this.game.world = this.world;
    this.stageId = stageId;
    this.viewHooks();
    // 영웅 채색 퍼펫을 입장 페이드 동안 받아 둔다 (첫 프레임에 벡터 → 퍼펫으로 바뀌어 보이지 않게)
    const h = this.world.player?.hero;
    try { if (h?.charId && PUPPET.puppetEnabled?.() !== false) PUPPET.preloadPuppet?.(h.charId, h.classId); } catch (e) { console.error(e); }   // [hook:plat]
  }
  exit() { this._pauseWanted = false; if (this.game.world === this.world) this.game.world = null; this.game.setSurround?.(null); }
  resize() { this.world?.camera.setView(this.game.viewW, this.game.viewH); this.viewHooks(); }
  /**
   * 세로 확장 시야 (hud_mobile §2): 캔버스 둘레 바탕을 스테이지 여백 색으로, 영웅 크기는 화면에 맞게 (MOTION heroScaleFor 가 있을 때만).
   */
  viewHooks() {
    const g = this.game, st = this.world?.stage;
    try { g.setSurround?.(st?.padTop ? { top: st.padTop.color, bottom: st.padBottom?.color } : null); } catch (e) { console.error(e); }
    try { if (typeof HERO.heroScaleFor === 'function') { const k = HERO.heroScaleFor(g.viewW, g.viewH); if (Number.isFinite(k)) g.heroScale = k; } } catch (e) { console.error(e); }   // [hook:plat]
  }
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
