// 아케이드 실전 장면: 보스 러시 / 서바이벌 / 스테이지 연습 + 아케이드 일시정지 + 결과 정산
// (무한의 탑은 arcade_tower.js 가 ArcadeRunScene 을 이어받는다 — 일시정지 옆 칸 drawPauseSide, 결과의 난이도별 최고 층 meta.towerBest)
// World 를 직접 만들고 인스턴스 메서드(onBossDefeated/onPlayerDeath/addScore/finishStage)를 덮어써서 모드 규칙을 적용한다.
// owner: PLAT-FRONT-B (world2 §11, MASTER_PLAN §1.14·§1.16)
//  - ?scene=bossrush|survival|practice 로 바로 열어도 동작한다 (임시 세이브가 없으면 만든다; ?char= ?diff= ?preset= ?course= ?stage=)
//  - 서바이벌: 적은 STAGE_ORDER_P1 에서 (2부를 알면 STAGE_ORDER 전체), def.noArena 인 적(천장·깊은 물·바람이 필요한 적)은
//    절대 나오지 않는다. 정예는 def.elite === false 인 적에겐 붙이지 않는다. 베테랑 이상 난이도는 가시 구덩이(arena 'pit') 방.
//    적은 가시 없는 바닥 기둥의 양 끝에서 나온다. 웨이브마다 채색 적 리그를 미리 굽고, 풀에서 빠진 종류는 놓는다 (휴대폰 메모리).
//  - 보스 러시: 다음 라운드 보스의 채색 리그를 대기 시간에 미리 굽는다 (preloadPainted). 2부 보스는 클래스가 준비된 것만 (arcade.js).
//  - 보스 클래스는 늦게 받기 입구(game/bosses/lazy.js)로 만든다 (R1-REQ-229): 코스 시작 때 첫 보스부터 차례로, 서바이벌은 보스 웨이브를
//    정할 때 미리 받는다. 아직 오지 않았으면 createBoss 가 대역(PendingBoss)을 돌려주고, 등장 연출 동안 진짜 보스로 바뀐다.
//  - 결과·랭크 글자는 피 글씨(bloodText). 일시정지·결과는 uiScale 장면 (탭 대상 ≥ 44 CSS px, 기기별 글리프 안내)
//  - 게임플레이 위 모드 표시는 hudLayout 의 기믹 게이지 줄에 둔다 (터치: 가운데 위 시스템 버튼 아래)
//  - 온라인 (docs/specs/online.md §4): 시작할 때 로그인 중이면 ONLINE.startRun(보드) 를 기다리지 않고 부른다. 정산 화면이 제출하고
//    '제출 중… / N위 (전체 M명) / 새 최고 기록!' 또는 오프라인·로그인 안내를 표의 '온라인 순위' 줄에 보여 준다 (기기 기록은 그대로).
//    순위에 오르는 판: 보스 러시·연습·일일은 클리어, 서바이벌은 늘. 연습·일일은 영웅을 10Hz 로 기록해 고스트를 함께 올린다
//    (game/ghost.js). 시작 때 고른 고스트(cfg.ghost: 1위·내 최고)는 반투명 실루엣으로 같은 경과 시간(run.time)에 그린다.
//  - 일일 도전(cfg.daily): 규칙의 난이도 배율·월드 규칙·시드는 임시 세이브(state.arcade)로 World 가 만들 때 읽는다 (arcade.js
//    buildArcadeState → game/world.js). 이 장면은 '어둠' 규칙의 시야 가림(화면 비네트, 그라데이션은 한 번 구운 그림)만 그린다
import { Scene, TILE } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { bus } from '../../core/events.js';
import { text, FONT, ListMenu, taps, bloodText, prewarmText } from '../../core/ui.js';
import { drawHints, promptMode } from '../../core/prompts.js';
import { clamp, ease, rgba, fmt, rand, randi, pick, chance } from '../../core/math.js';
import { isSolidType, T } from '../../core/physics.js';
import { World } from '../../game/world.js';
import { createBoss, loadBoss, preloadBosses } from '../../game/bosses/lazy.js';
import { drawHUD } from '../../render/hud.js';
import { hudLayout } from '../../render/hud_layout.js';
import { preloadPainted } from '../../render/painted/registry.js';
import { preloadPaintedEnemies, paintedEnemiesOn } from '../../render/enemies.js';
import { PAINTED_ENEMIES } from '../../render/painted/enemies/index.js';
import { releaseRigs } from '../../render/painted/enemy_kit.js';
import { STAGES, STAGE_ORDER, STAGE_ORDER_P1 } from '../../data/stages.js';
import { BOSSES } from '../../data/bosses.js';
import { ENEMIES } from '../../data/enemies.js';
import { POWERUPS } from '../../data/powerups.js';
import { CHARACTERS } from '../../data/characters.js';
import { DIFFICULTIES, getDiff } from '../../data/difficulty.js';
import {
  ARCADE_MODES, LEVEL_PRESETS, COURSES, courseBosses, endArcade, arenaBosses, p2Known, sanitizeCfg, practiceStages, buildArcadeState,
} from './arcade.js';
import { frame, menuItem, fmtClock, portraitIn, qualifies, heading, kenBurns, shade, bossRushBests, towerBests, DIM, puppet } from './common.js';
import * as ONLINE from '../../core/online.js';
import { GhostRecorder, GhostPlayer, decodeGhost } from '../../game/ghost.js';

// 서바이벌에 소환하지 않는 적: 생성기·위장·보너스 적 + 물이 있어야 싸울 수 있는 적(투기장엔 물이 없음). def.noArena 도 제외
const NO_SPAWN = new Set(['medusa_spawner', 'mimic', 'golden_bat', 'killer_fish']);
/** 가시 구덩이 방을 쓰는 난이도인가 (베테랑 이상). 모듈 최상위에서 import 값을 읽지 않도록 함수로 둔다 */
const isHardDiff = (id) => { const h = DIFFICULTIES.findIndex((d) => d.id === 'hard'); return h >= 0 && DIFFICULTIES.findIndex((d) => d.id === id) >= h; };

/** 기둥 tx 에서 위→아래로 첫 바닥 윗면 y (없으면 맵 아래 - 2칸). 무한의 탑(arcade_tower.js)도 쓴다 */
export function groundY(map, tx) {
  tx = clamp(tx, 0, map.w - 1);
  // 1순위: 화면 아래쪽 절반의 단단한 바닥, 2순위: 단방향 발판
  for (const ok of [(t) => isSolidType(t), (t) => t === T.ONEWAY]) {
    for (let ty = Math.floor(map.h * 0.45); ty < map.h; ty++) {
      const t = map.typeAt(tx, ty), above = map.typeAt(tx, ty - 1);
      if (ok(t) && !isSolidType(above) && above !== T.SPIKE) return ty * TILE;
    }
  }
  return (map.h - 2) * TILE;
}
/** 단단한 바닥이 있고 양옆 두 칸 안에 가시가 없는 기둥들 (가시 구덩이 방에서 소환·부활·보상 위치) */
export function safeColumns(map) {
  const out = [];
  for (let tx = 2; tx < map.w - 2; tx++) {
    const ty = Math.round(groundY(map, tx) / TILE);
    if (!isSolidType(map.typeAt(tx, ty))) continue;
    let spike = false;
    for (let dx = -2; dx <= 2 && !spike; dx++) if (map.typeAt(tx + dx, ty - 1) === T.SPIKE || map.typeAt(tx + dx, ty) === T.SPIKE) spike = true;
    if (!spike) out.push(tx);
  }
  return out.length ? out : null;
}

// ── 일일 도전 '어둠' 규칙: 영웅 둘레만 보이는 시야 (구멍 그림은 한 번만 굽는다 — 프레임마다 그라데이션을 만들지 않는다) ──
const DARK_A = 0.93, DARK_C = `rgba(2,0,6,${DARK_A})`;
let darkSpr = null;
function darkSprite() {
  if (darkSpr) return darkSpr;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 128 * 0.32, 128, 128, 128);
  g.addColorStop(0, 'rgba(2,0,6,0)'); g.addColorStop(0.55, 'rgba(2,0,6,0.55)'); g.addColorStop(1, DARK_C);
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  return (darkSpr = c);
}
/** 화면 좌표: 영웅 가슴 둘레 반지름 R(줌 반영) 바깥을 어둡게 */
function drawDark(ctx, w, vw, vh) {
  const p = w.player, cam = w.camera;
  if (!p || !cam) return;
  const s = cam.toScreen(p.cx, p.cy), R = 250 * (cam.zoom || 1);
  const x0 = s.x - R, y0 = s.y - R, x1 = s.x + R, y1 = s.y + R;
  const t = clamp(y0, 0, vh), b = clamp(y1, 0, vh), l = clamp(x0, 0, vw), r = clamp(x1, 0, vw);
  ctx.save();
  ctx.fillStyle = DARK_C;
  if (t > 0) ctx.fillRect(0, 0, vw, t);
  if (b < vh) ctx.fillRect(0, b, vw, vh - b);
  if (b > t && l > 0) ctx.fillRect(0, t, l, b - t);
  if (b > t && r < vw) ctx.fillRect(r, t, vw - r, b - t);
  ctx.drawImage(darkSprite(), x0, y0, 2 * R, 2 * R);
  ctx.restore();
}

/** 아케이드 실전 장면의 바탕 (무한의 탑 TowerScene 이 이어받는다 — front/arcade_tower.js) */
export class ArcadeRunScene extends Scene {
  get modeId() { return 'bossrush'; }
  enter({ cfg = null } = {}) {
    const g = this.game;
    if (!cfg || !g.state?.arcade) cfg = this.directStart(cfg);
    this.cfg = cfg;
    this.P = LEVEL_PRESETS[cfg.preset ?? 1] ?? LEVEL_PRESETS[1];
    this.diff = getDiff(cfg.diff);
    this.p2 = p2Known(g);
    this.phase = 'ready'; this.phaseT = 0;
    this.clock = 0; this.done = false;
    this.world = this.makeWorld();
    g.world = this.world;
    this.patch();
    this.setup?.();
    this.onlineStart();
  }
  /** 온라인: 런 시작(로그인 중일 때만, 기다리지 않음) · 연습/일일은 고스트 기록 + 고른 고스트 받기 */
  onlineStart() {
    this.ghost = null; this.rec = null;
    try {
      this.board = ONLINE.boardOf(this.cfg);
      this.orun = ONLINE.startRun(this.board);
      if (this.cfg.kind !== 'practice' || !this.board) return;
      this.rec = new GhostRecorder(10);
      const choice = this.cfg.ghost;
      if (choice !== 'top' && choice !== 'mine') return;
      ONLINE.pickGhost(this.board, choice).then((r) => {
        if (this.game.world !== this.world || this.done) return;
        if (!r.ok) { if (r.message) this.game.toast(r.message, '#9fd8ff', 2.4); return; }
        const T = decodeGhost(r.data);
        if (!T) { this.game.toast('고스트를 읽지 못했어요', '#9fd8ff', 2.4); return; }
        const hero = CHARACTERS[r.hero] ? r.hero : this.cfg.charId;
        let pup = null;
        try { pup = puppet(hero, r.cls || null); } catch { try { pup = puppet(hero); } catch { pup = null; } }
        const label = r.src === 'top' ? `1위 ${r.nick ?? ''}`.trim() : '내 최고';
        this.ghost = new GhostPlayer(T, pup, label);
        this.game.toast(`고스트: ${label} (${ONLINE.fmtMs(r.time)})`, '#9fd8ff', 2.4);
      }).catch(() => {});
    } catch (e) { console.warn('[arcade] online', e); }
  }
  /** 아케이드 메뉴를 거치지 않고 열렸다 (?scene=survival 등): 저장된 설정 + 주소 매개변수로 임시 세이브를 만든다 */
  directStart(cfg) {
    const g = this.game;
    let q = null;
    try { q = new URLSearchParams(location.search); } catch { q = null; }
    const saved = g.meta?.arcadeCfg, ok = saved && typeof saved === 'object' && !Array.isArray(saved);
    const want = { ...(ok ? saved : {}), ...(cfg ?? {}), kind: this.modeId };
    const num = (k) => { const v = q?.get(k); return v != null && v !== '' && Number.isFinite(+v) ? +v : undefined; };
    if (num('preset') !== undefined) want.preset = num('preset');
    if (num('course') !== undefined) want.course = num('course');
    if (num('seed') !== undefined) want.seed = num('seed') >>> 0;   // 무한의 탑: 시드 고정 (시험·재현)
    if (q?.get('diff')) want.diff = q.get('diff');
    if (q?.get('stage')) want.stageId = q.get('stage');
    const c = sanitizeCfg(want, p2Known(g), this.modeId === 'practice' && !q?.get('stage') ? practiceStages(g) : null);
    let charId = q?.get('char') || cfg?.charId || g.state?.charId || 'kael';
    if (!CHARACTERS[charId]) charId = 'kael';
    if (!g.state?.arcade) g._arcadePrev = g.state ?? null;
    g.state = buildArcadeState(c, charId);
    return { ...c, charId };
  }
  exit() { this._pauseWanted = false; if (this.game.world === this.world) this.game.world = null; }
  resize() { this.world?.camera.setView(this.game.viewW, this.game.viewH); }
  onResume() { this.world?.player?.refreshStats(); }
  makeArenaWorld(level, roomId = null) {
    const stage = { ...STAGES.arena, level, intro: null, outro: null, boss: null };
    const w = new World(this.game, stage, { mode: this.cfg.kind, roomId });
    const m = w.map;
    // 투기장 전체를 경기장으로 고정 (방 출구·보스 트리거 무시)
    w.arena = { x0: 0, x1: m.pxW, cam: { x: 0, y: 0, w: m.pxW, h: m.pxH } };
    w.arenaX = undefined;
    w.banner = null;
    this.safeCols = safeColumns(m);
    return w;
  }
  /** 안전한 바닥 기둥 범위 안으로 x 를 당긴다 (가시 구덩이) */
  safeX(x) {
    const c = this.safeCols, m = this.world.map;
    if (!c) return clamp(x, TILE * 2, m.pxW - TILE * 2);
    return clamp(x, (c[0] + 0.5) * TILE, (c[c.length - 1] + 0.5) * TILE);
  }
  patch() {
    const w = this.world, self = this;
    w.onPlayerDeath = () => self.onDeath();
    const origHurt = w.onPlayerHurt.bind(w);
    w.onPlayerHurt = (dmg) => { origHurt(dmg); self.onHurt?.(dmg); };
  }
  onDeath() {
    const w = this.world, st = this.game.state;
    // 연습: 보스를 쓰러뜨린 뒤 쓰러졌으면 목숨을 쓰지 않고 일으켜 세운다 (클리어 연출 → finishStage 로 이어진다)
    if (w.cleared && typeof w.reviveAfterClear === 'function') { w.reviveAfterClear(); return; }
    w.run.lives--;
    st.stats.deaths = (st.stats.deaths ?? 0) + 1;
    if (w.run.lives > 0) this.game.fadeOut(() => this.respawnHere(), 0.4);
    else this.finish(false);
  }
  respawnHere() {
    const w = this.world, p = w.player;
    if (!w.entities.includes(p)) w.add(p);
    p.dead = false; p.deathHandled = false; p.deathT = 0;
    p.buffs = {}; p.refreshStats();
    p.hp = p.stats.hp; p.mp = p.stats.mp;
    const cx = this.safeX(p.cx);
    p.x = cx - p.w / 2; p.y = groundY(w.map, Math.floor(cx / TILE)) - p.h - 120; p.vx = 0; p.vy = 0;
    p.iframes = 3;
    w.combo.n = 0;
    w.banner = { text: 'READY?', sub: `남은 목숨 ${w.run.lives}`, t: 1.6, color: '#ffe7a0' };
  }
  canPause() { const w = this.world; return !!w && !this.done && !w.player.dead && !w.cutscene && !w.transitioning; }
  /**
   * 기기를 세로로 돌리거나 탭이 백그라운드로 가거나 패드가 끊기면 일시정지 메뉴 (StageScene.autoPause 와 같음, core/game.js 가 호출).
   * 지금 열 수 없으면 (필살기·각성 연출 world.cutscene, 페이드 중) 기억해 두었다가 열 수 있게 된 첫 update 에서 연다 (platform §4.1)
   */
  autoPause() {
    const g = this.game, w = this.world;
    if (g.top === this && g.fade.dir <= 0 && this.canPause()) { this._pauseWanted = false; g.push('arcadePause', { run: this }); return; }
    if (w?.player && !this.done && !w.player.dead) this._pauseWanted = true;
  }
  update(dt) {
    const w = this.world;
    if (!w) return;
    const st = this.game.state;
    if (st?.stats) st.stats.playTime = (st.stats.playTime ?? 0) + dt;
    if (this._pauseWanted) {   // 연출 중에 들어온 자동 일시정지 요청 (R1-REQ-215)
      if (this.done || w.player?.dead) this._pauseWanted = false;
      else if (this.game.fade.dir <= 0 && this.canPause()) { this._pauseWanted = false; this.game.push('arcadePause', { run: this }); return; }
    }
    if (input.pressed('menu') && this.canPause()) { audio.sfx('menu_ok'); this.game.push('arcadePause', { run: this }); return; }
    this.phaseT += dt;
    this.tick?.(dt);
    w.update(dt);
    if (this.rec && !this.done) this.rec.sample(w.run.time, w.player, w.roomId);   // 고스트 기록 (10Hz)
    // 안전장치: 월드가 죽은 플레이어를 목록에서 빼 버리는 경우에도 사망 연출·처리를 이어간다
    const p = w.player;
    if (p?.dead && !p.deathHandled && !w.entities.includes(p)) p.updateDeath?.(dt, w);
  }
  render(ctx) {
    const w = this.world, vw = this.game.viewW, vh = this.game.viewH;
    if (!w) return;
    w.render(ctx);
    if (this.ghost) { ctx.save(); w.camera.apply(ctx); this.ghost.draw(ctx, w, w.run.time); ctx.restore(); }
    if (w.rules?.dark) drawDark(ctx, w, vw, vh);
    drawHUD(ctx, w, vw, vh);
    this.overlay?.(ctx, vw, vh);
    if (this.ghost && !this.paused) this.ghost.marker(ctx, w, w.run.time, vw, vh, this.tagTop(vw, vh) + 60);
  }
  /** 모드 종료 → 결과 정산 */
  finish(cleared, reason = null) {
    if (this.done) return;
    this.done = true;
    const w = this.world;
    if (w.combo.n > 0) w.endCombo();
    w.syncRun();
    const res = this.results(cleared, reason);
    res.online = this.onlinePayload(cleared, res);
    bus.emit('arcadeFinished', { kind: this.cfg.kind, cleared, reason, score: res.score, time: res.time, extra: res.extra ?? null, charId: this.cfg.charId, diff: this.cfg.diff, stageId: res.stageId });   // [hook:plat] 익명 통계 (core/telemetry.js)
    audio.stopMusic(0.5);
    this.game.go('arcadeResults', { ...res, kind: this.cfg.kind, cfg: this.cfg, charId: this.cfg.charId, cleared, reason }, { fadeTime: cleared ? 0.9 : 0.6 });
  }
  /**
   * 정산 화면이 올릴 것: { h(런 손잡이), board, result, ghost, submit(순위에 오르는 판인가) }
   * 보스 러시·연습·일일은 클리어한 판만 (시간 순위), 서바이벌은 웨이브가 있으면
   */
  onlinePayload(cleared, res) {
    try {
      const st = this.game.state, w = this.world, kind = this.cfg.kind;
      const hero = st?.heroes?.[this.cfg.charId];
      const submit = !!this.board && (kind === 'survival' ? (res.extra?.wave ?? 0) >= 1 : kind === 'tower' ? (res.extra?.floor ?? 0) >= 1 : !!cleared);
      const result = {
        time: Math.round((kind === 'practice' ? w.run.time : this.clock) * 1000), score: res.score ?? 0,
        hero: this.cfg.charId, cls: hero?.classId ?? '', level: hero?.level ?? this.P.lv, deaths: st?.stats?.deaths ?? 0,
      };
      if (kind === 'survival') result.wave = res.extra?.wave ?? 0;
      if (kind === 'tower') result.floor = res.extra?.floor ?? 0;   // 돌파한 층 (§1 tower:<diff>)
      if (res.rank) result.rank = res.rank;
      const ghost = submit && this.rec ? this.rec.encode() : null;
      return { h: this.orun ?? null, board: this.board, result, ghost, submit, daily: !!this.cfg.daily };
    } catch (e) { console.warn('[arcade] online payload', e); return null; }
  }
  /** 모드 표시의 위쪽 끝 (논리 px): 데스크톱은 화면 위, 터치는 가운데 위 시스템 버튼(Ⅱ·가방) 아래의 기믹 게이지 줄 */
  tagTop(vw, vh) {
    try {
      const L = hudLayout(this.world, vw, vh);
      const m = L?.meter?.(0);
      if (L?.touch && m && Number.isFinite(m.y)) return Math.round(m.y - 6);
    } catch { /* 배치 모듈 교체 중 */ }
    return 4;
  }
  /** 모드 이름 오버레이 (위 가운데) */
  modeTag(ctx, vw, top, main, sub, color) {
    const x = vw / 2;
    ctx.save();
    if (this._tagW !== vw) { // 가로 그라데이션은 화면 폭이 같으면 다시 만들지 않는다
      const g = ctx.createLinearGradient(x - 170, 0, x + 170, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(8,2,10,0.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      this._tagG = g; this._tagW = vw;
    }
    ctx.fillStyle = this._tagG; ctx.fillRect(x - 170, top, 340, 56);
    text(ctx, main, x, top + 24, { size: 17, align: 'center', weight: 900, family: FONT.logo, color, ow: 4 });
    if (sub) text(ctx, sub, x, top + 46, { size: 16, align: 'center', weight: 800, family: FONT.num, color: '#fff', ow: 3 });
    ctx.restore();
  }
  /** 큰 중앙 문구 (라운드/웨이브) */
  bigCall(ctx, vw, vh, main, sub, color, k) {
    if (k <= 0) return;
    const a = clamp(Math.min(k * 4, (1 - k) * 4), 0, 1);
    const s = 1 + (1 - ease.outBack(clamp(k * 3, 0, 1))) * 0.6;
    ctx.save();
    ctx.globalAlpha = a;
    const y = vh * 0.4;
    if (this._callW !== vw) {
      const g = ctx.createLinearGradient(0, 0, vw, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      this._callG = g; this._callW = vw;
    }
    ctx.fillStyle = this._callG; ctx.fillRect(0, y - 58, vw, 100);
    ctx.fillStyle = rgba(color, 0.8); ctx.fillRect(vw * 0.2, y - 58, vw * 0.6, 1.5); ctx.fillRect(vw * 0.2, y + 41, vw * 0.6, 1.5);
    ctx.translate(vw / 2, y); ctx.scale(s, s);
    ctx.shadowColor = color; ctx.shadowBlur = 20;
    text(ctx, main, 0, 8, { size: 50, align: 'center', weight: 900, family: FONT.logo, color: '#fff6e0', ow: 6, maxWidth: vw - 40 });
    ctx.shadowBlur = 0;
    if (sub) text(ctx, sub, 0, 34, { size: 16, align: 'center', weight: 800, color, ow: 3 });
    ctx.restore();
  }
}

// ───────────────────────────── 보스 러시 ─────────────────────────────
export class BossRushScene extends ArcadeRunScene {
  get modeId() { return 'bossrush'; }
  makeWorld() { return this.makeArenaWorld(this.P.lv); }
  setup() {
    this.queue = courseBosses(this.cfg.course ?? 0);
    this.round = 0; this.roundT = 0; this.roundDmg = 0; this.log = [];
    this.warmed = new Set();
    audio.music('arena');
    this.call = { main: 'BOSS RUSH', sub: `${COURSES[this.cfg.course ?? 0]?.name ?? ''} · ${this.queue.length}연전`, color: '#ff4a5a', t: 0 };
    this.warm(this.queue[0]);
    // 보스 클래스 모듈: 첫 보스를 먼저 받고(등장까지 2.3초), 나머지 코스는 그 뒤에 한꺼번에 (느린 망에서 첫 보스와 다투지 않게)
    try {
      const [first, ...rest] = this.queue;
      Promise.resolve(loadBoss(first)).catch(() => null).then(() => preloadBosses(rest)).catch(() => null);
    } catch { /* 늦게 받기 입구 교체 중: createBoss 가 받는다 */ }
  }
  /** 보스의 채색 리그를 미리 굽는다 (라운드 사이 대기 시간 뒤에서 끝난다; 채색 렌더러가 없으면 아무것도 안 함) */
  warm(id) {
    if (!id || this.warmed.has(id)) return;
    this.warmed.add(id);
    try { preloadPainted(id, this.game)?.catch?.(() => {}); } catch { /* 채색 레지스트리 없음 */ }
  }
  onHurt(d) { this.roundDmg += d; }
  tick(dt) {
    const w = this.world;
    if (this.call) { this.call.t += dt / 2.2; if (this.call.t >= 1) this.call = null; }
    if (this.phase === 'fight') { this.clock += dt; this.roundT += dt; }
    if (this.phase === 'ready' && this.phaseT > 0.4) this.warm(this.queue[this.round]);
    if (this.phase === 'ready' && this.phaseT > 2.3) this.spawnBoss();
    if (this.phase === 'clear' && this.phaseT > 3.4 && (!w.boss || w.boss.dead)) {
      this.round++;
      if (this.round >= this.queue.length) { this.phase = 'complete'; this.phaseT = 0; audio.music('victory'); w.banner = { text: 'ALL CLEAR!', sub: '모든 군주를 쓰러뜨렸다!', t: 3, color: '#ffe070', big: true }; }
      else { this.nextRound(); }
    }
    if (this.phase === 'complete' && this.phaseT > 3.2) this.finish(true);
  }
  nextRound() {
    const w = this.world, p = w.player;
    w.boss = null; w.bossActive = false;
    // 라운드 사이 회복
    p.heal(p.stats.hp * 0.35);
    p.mp = Math.min(p.stats.mp, p.mp + p.stats.mp * 0.5);
    w.run.hearts = Math.min(99, w.run.hearts + 10);
    audio.sfx('heal');
    w.fx.burst('holy', p.cx, p.cy, 24, { speed: 180, color: '#8aff9a' });
    w.fx.ring(p.cx, p.cy, { color: '#8aff9a', r0: 10, r1: 90, life: 0.5, width: 5 });
    this.phase = 'ready'; this.phaseT = 0;
    const id = this.queue[this.round];
    this.call = { main: `ROUND ${this.round + 1}`, sub: BOSSES[id]?.name ?? '???', color: '#ff4a5a', t: 0 };
    audio.sfx('ready');
  }
  spawnBoss() {
    const w = this.world, m = w.map, g = this.game;
    const id = this.queue[this.round];
    const def = BOSSES[id];
    const sl = STAGES[def?.stageId]?.level ?? (10 + this.round * 3);
    w.stage.level = Math.round(clamp(sl, this.P.lv - 8, this.P.lv + 2));
    const p = w.player;
    const bx = p.cx < m.pxW / 2 ? m.pxW * 0.74 : m.pxW * 0.26;
    const by = groundY(m, Math.floor(bx / TILE));
    const boss = createBoss(w, id, bx, by);
    w.boss = boss; w.add(boss); w.bossActive = true;
    this.phase = 'intro'; this.phaseT = 0; this.roundT = 0; this.roundDmg = 0;
    w.cutscene = true;
    audio.stopMusic(0.4);
    g.push('bossIntro', { bossId: id, world: w, onDone: () => { w.cutscene = false; this.phase = 'fight'; this.phaseT = 0; audio.music(boss.def?.music ?? 'boss'); } });
    // 보스 격파 처리 (라운드 진행)
    w.onBossDefeated = (b) => this.onBossDown(b);
  }
  onBossDown(boss) {
    if (this.phase !== 'fight' && this.phase !== 'intro') return;
    const w = this.world, g = this.game;
    this.phase = 'clear'; this.phaseT = 0;
    w.bossActive = false;
    w.slowmo = 1.3;
    g.flash('#ffffff', 0.9, 1.6);
    w.camera.shake(14, 1.0);
    audio.stopMusic(0.3); audio.sfx('boss_die');
    const rt = this.roundT;
    const base = boss.def?.score ?? 20000;
    const timeBonus = Math.max(0, Math.round((150 - rt) * 200));
    const perfect = this.roundDmg <= 0 ? 30000 : 0;
    w.addScore(base + timeBonus + perfect);
    this.log.push({ id: boss.def?.id, name: boss.def?.name ?? '', time: rt, perfect: !!perfect });
    const st = this.game.state;
    st.stats.bossKills = (st.stats.bossKills ?? 0) + 1;
    w.fx.burst('fire', boss.cx, boss.cy, 30, { speed: 260, jitter: 60 });
    w.fx.ring(boss.cx, boss.cy, { color: '#ffd070', r0: 20, r1: 220, life: 0.7, width: 8 });
    w.banner = { text: perfect ? 'PERFECT!' : 'ROUND CLEAR', sub: `${boss.def?.name ?? ''} 격파 · ${fmtClock(rt)}  +${fmt((base + timeBonus + perfect) * (w.diff.scoreMult ?? 1))}`, t: 3, color: perfect ? '#ffe070' : '#ffd0a0', big: true };
  }
  results(cleared) {
    const w = this.world;
    return {
      title: cleared ? 'BOSS RUSH COMPLETE' : 'GAME OVER',
      score: w.run.score, time: this.clock,
      rows: [
        ['격파한 보스', `${this.log.length} / ${this.queue.length}`],
        ['총 전투 시간', fmtClock(this.clock)],
        ['무피해 격파', `${this.log.filter((l) => l.perfect).length}회`],
        ['최대 콤보', `${Math.max(w.combo.best, w.combo.max)} HITS`],
      ],
      log: this.log, stageId: 'arena', extra: { bosses: this.log.length, total: this.queue.length },
    };
  }
  overlay(ctx, vw, vh) {
    const top = this.tagTop(vw, vh);
    this.modeTag(ctx, vw, top, `ROUND ${Math.min(this.round + 1, this.queue.length)} / ${this.queue.length}`, fmtClock(this.clock), '#ff6a7a');
    if (this.call && !this.paused) this.bigCall(ctx, vw, vh, this.call.main, this.call.sub, this.call.color, this.call.t);
    // 다음 보스 미리보기 (대기 중). 데스크톱은 오른쪽 가운데, 터치는 오른쪽이 패드 묶음이라 왼쪽 HUD 아래(y 176~300)에 작게
    if (this.phase === 'ready' && this.round < this.queue.length && !this.paused) {
      const id = this.queue[this.round], img = assets.get(BOSSES[id]?.portrait ?? `portraits/${id}`);
      const k = ease.outCubic(clamp(this.phaseT / 0.5, 0, 1)) * clamp((2.3 - this.phaseT) / 0.3, 0, 1);
      if (img && k > 0) {
        let touch = false;
        try { touch = !!hudLayout(this.world, vw, vh)?.touch; } catch { /* 무시 */ }
        const r = touch ? { x: 14 - 110 * (1 - k), y: 176, w: 93, h: 124 } : { x: vw - 170 * k, y: vh * 0.5 - 110, w: 150, h: 200 };
        ctx.save(); ctx.globalAlpha = k;
        portraitIn(ctx, img, r, { fy: 0.15, fadeBottom: 0.4 });
        ctx.strokeStyle = '#ff4a5a'; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        text(ctx, 'NEXT', r.x + 8, r.y + 20, { size: 13, weight: 900, family: FONT.logo, color: '#ff8a9a', ow: 3 });
        ctx.restore();
      }
    }
  }
}

// ───────────────────────────── 서바이벌 ─────────────────────────────
export class SurvivalScene extends ArcadeRunScene {
  get modeId() { return 'survival'; }
  makeWorld() {
    // 베테랑 이상은 양 끝이 가시 바닥인 '가시 구덩이' 방 (arena.pit)
    this.hard = isHardDiff(this.cfg.diff) && !!STAGES.arena?.rooms?.pit;
    return this.makeArenaWorld(Math.max(1, Math.round(this.P.lv * 0.6)), this.hard ? 'pit' : null);
  }
  setup() {
    const w = this.world;
    this.wave = 0; this.mult = 1; this.queue = []; this.spawnT = 0; this.bossesUsed = 0;
    this.kills0 = 0;
    const c = this.safeCols;
    this.edgeL = c ? c.slice(0, 4) : null; this.edgeR = c ? c.slice(-4) : null;
    this.bossIds = arenaBosses(this.p2);
    // 첫 보스 웨이브(5)의 보스 클래스를 한가할 때 미리 받는다 (다음 보스는 보스 웨이브를 정할 때)
    if (this.bossIds.length) { try { loadBoss(this.bossIds[0])?.catch?.(() => null); } catch { /* createBoss 가 받는다 */ } }
    const orig = w.addScore.bind(w);
    w.addScore = (n) => orig(n * this.mult);
    audio.music('arena');
    this.call = { main: 'SURVIVAL', sub: this.hard ? '가시 구덩이 — 양 끝의 가시를 조심하라' : '끝없는 마물의 물결에서 살아남아라', color: '#ffa640', t: 0 };
    this.phase = 'intro0'; this.phaseT = 0;
    w.onBossDefeated = (b) => this.onBossDown(b);
  }
  onHurt() {
    if (this.mult > 1) { this.mult = Math.max(1, +(this.mult - 0.25).toFixed(2)); this.multFlash = 0.6; }
  }
  /** 이번 웨이브에 나올 수 있는 적: 1부 스테이지 순서(2부를 알면 전체)의 두 단계, 투기장에서 싸울 수 없는 적 제외 */
  pool() {
    const order = this.p2 ? STAGE_ORDER : STAGE_ORDER_P1;
    const tier = clamp(Math.floor((this.wave - 1) / 2), 0, order.length - 1);
    const ok = (id) => !!ENEMIES[id] && !NO_SPAWN.has(id) && !ENEMIES[id].noArena;
    const ids = new Set();
    for (let i = Math.max(0, tier - 1); i <= tier; i++) for (const id of STAGES[order[i]]?.enemies ?? []) if (ok(id)) ids.add(id);
    let list = [...ids];
    if (!list.length) list = Object.keys(ENEMIES).filter(ok);
    return list;
  }
  /** 이번 풀의 채색 적 리그를 미리 굽고, 풀에서 빠진 종류의 리그는 놓는다 (긴 서바이벌에서도 스테이지 하나 분량) */
  warmPool(pool) {
    try {
      if (!paintedEnemiesOn(this.game)) return;
      const keep = new Set();
      const add = (id) => {
        const d = ENEMIES[id];
        const m = PAINTED_ENEMIES[d?.render ?? id];
        if (m?.spec?.src) keep.add(m.spec.src);
        const sp = d?.aiParams?.spawn, ms = sp && PAINTED_ENEMIES[ENEMIES[sp]?.render ?? sp];
        if (ms?.spec?.src) keep.add(ms.spec.src);
      };
      for (const id of pool) add(id);
      for (const e of this.world.entities) if (e.kind === 'enemy' && e.def) add(e.def.id);
      releaseRigs([...keep]);
      preloadPaintedEnemies(pool);
    } catch { /* 채색 적 모듈 교체 중 → 벡터 그림 */ }
  }
  startWave() {
    this.wave++;
    const n = Math.min(40, 4 + this.wave * 2);
    const pool = this.pool();
    const eliteP = Math.min(0.5, (this.diff.elite ?? 0) + this.wave * 0.015);
    this.queue = [];
    for (let i = 0; i < n; i++) {
      const id = pick(pool);
      this.queue.push({ id, elite: chance(eliteP) && ENEMIES[id]?.elite !== false });
    }
    this.warmPool(pool);
    this.bossWave = this.wave % 5 === 0;
    if (this.bossWave) {
      const ids = this.bossIds;
      this.bossId = ids.length ? ids[this.bossesUsed % ids.length] : null;
      this.bossesUsed++;
      if (this.bossId) { try { preloadPainted(this.bossId, this.game)?.catch?.(() => {}); } catch { /* 무시 */ } }
      if (this.bossId) { try { loadBoss(this.bossId)?.catch?.(() => null); } catch { /* createBoss 가 받는다 */ } }   // 보스 클래스 (등장 2.3초 전)
    }
    this.spawnT = 0.6;
    this.phase = 'wave'; this.phaseT = 0;
    this.call = { main: this.bossWave ? `BOSS WAVE ${this.wave}` : `WAVE ${this.wave}`, sub: this.bossWave ? '거대한 기운이 다가온다…' : `적 ${n}마리 · 점수 배율 ×${this.mult.toFixed(2)}`, color: this.bossWave ? '#ff4a5a' : '#ffa640', t: 0 };
    audio.sfx(this.bossWave ? 'warning' : 'ready');
    this.bossSpawnT = this.bossWave && this.bossId ? 2.3 : 0;
  }
  level() { return Math.max(1, Math.round(this.P.lv * 0.6 + this.wave * 1.4)); }
  spawnOne(spec) {
    const w = this.world, m = w.map, p = w.player;
    const def = ENEMIES[spec.id];
    const side = p.cx < m.pxW / 2 ? (chance(0.7) ? 1 : -1) : (chance(0.7) ? -1 : 1);
    const edge = side > 0 ? this.edgeR : this.edgeL;
    const tx = edge ? pick(edge) : side > 0 ? m.w - 3 - randi(0, 3) : 2 + randi(0, 3);
    const fx = tx * TILE + TILE / 2;
    let fy = groundY(m, tx);
    if (def?.flying) fy -= rand(140, 260);
    const e = w.spawnEnemy(spec.id, fx, fy, { level: this.level(), elite: spec.elite, facing: -side });
    w.fx.burst('dark', fx, fy - 30, 14, { speed: 120 });
    w.fx.ring(fx, fy - 30, { color: spec.elite ? '#ffd070' : '#b060ff', r0: 6, r1: 60, life: 0.4, width: 4 });
    audio.sfx('mist', { vol: 0.4 });
    return e;
  }
  spawnWaveBoss() {
    if (this.done || this.phase !== 'wave' || !this.bossId) return;
    const w = this.world, m = w.map, p = w.player;
    w.stage.level = this.level();
    const bx = this.safeX(p.cx < m.pxW / 2 ? m.pxW * 0.75 : m.pxW * 0.25);
    const boss = createBoss(w, this.bossId, bx, groundY(m, Math.floor(bx / TILE)));
    w.boss = boss; w.add(boss); w.bossActive = true;
    w.cutscene = true;
    this.game.push('bossIntro', { bossId: this.bossId, world: w, onDone: () => { w.cutscene = false; audio.music(boss.def?.music ?? 'boss'); } });
  }
  onBossDown(boss) {
    const w = this.world;
    w.bossActive = false;
    w.slowmo = 1.1; this.game.flash('#fff', 0.8, 2); w.camera.shake(12, 0.8);
    audio.sfx('boss_die');
    w.addScore((boss.def?.score ?? 20000));
    w.banner = { text: 'BOSS DOWN!', sub: `${boss.def?.name ?? ''} 격파`, t: 2.4, color: '#ffe070', big: true };
    this.musicT = 2.5;
  }
  tick(dt) {
    const w = this.world;
    if (this.call) { this.call.t += dt / 2.2; if (this.call.t >= 1) this.call = null; }
    if (this.multFlash > 0) this.multFlash -= dt;
    if (this.bossSpawnT > 0) { this.bossSpawnT -= dt; if (this.bossSpawnT <= 0) this.spawnWaveBoss(); }
    if (this.musicT > 0) { this.musicT -= dt; if (this.musicT <= 0 && !this.done) audio.music('arena'); }
    if (this.phase !== 'intro0') this.clock += dt;
    if (this.phase === 'intro0' && this.phaseT > 2.4) this.startWave();
    if (this.phase === 'wave') {
      const cap = Math.min(14, 7 + Math.floor(this.wave / 3));
      this.spawnT -= dt;
      if (this.queue.length && this.spawnT <= 0 && w.enemies().length < cap && !w.cutscene) {
        this.spawnOne(this.queue.shift());
        this.spawnT = Math.max(0.25, 0.9 - this.wave * 0.03);
      }
      // 방금 소환한 적까지 포함해 센다 (소환 전 값을 쓰면 마지막 적이 나오는 틱에 곧바로 클리어됨)
      const alive = w.enemies().length;
      const bossPending = this.bossSpawnT > 0;
      if (!this.queue.length && alive === 0 && !bossPending && this.phaseT > 1.5) this.waveClear();
    }
    if (this.phase === 'clear' && this.phaseT > 3.2) this.startWave();
  }
  waveClear() {
    const w = this.world, p = w.player, m = w.map;
    this.phase = 'clear'; this.phaseT = 0;
    const bonus = this.wave * 1000;
    const s0 = w.run.score;
    w.addScore(bonus); // 현재 배율·난이도 배율 적용
    const gained = w.run.score - s0;
    this.mult = +(this.mult + 0.25).toFixed(2);
    audio.sfx('win');
    w.banner = { text: 'WAVE CLEAR', sub: `보너스 +${fmt(gained)} · 배율 ×${this.mult.toFixed(2)}`, t: 2.6, color: '#ffd070', big: true };
    p.heal(p.stats.hp * 0.15);
    w.run.hearts = Math.min(99, w.run.hearts + 5);
    // 보상 드롭 (가시 위에 떨어지지 않게 안전한 바닥 범위 안)
    const cx = this.safeX(clamp(p.cx + (p.cx < m.pxW / 2 ? 160 : -160), TILE * 3, m.pxW - TILE * 3));
    const at = (x) => groundY(m, Math.floor(this.safeX(x) / TILE)) - 160;
    const ids = Object.keys(POWERUPS).filter((id) => id !== 'rosary');
    w.spawnPickup('powerup', cx, at(cx), { id: pick(ids), vx: 0, vy: -200 });
    if (this.wave % 3 === 0) w.spawnPickup('food', this.safeX(cx - 60), at(cx - 60), { heal: 0.4, icon: 'meat', vx: 0, vy: -200 });
    if (this.wave % 10 === 0) w.spawnPickup('oneup', this.safeX(cx + 60), at(cx + 60), { vx: 0, vy: -200 });
  }
  results() {
    const w = this.world;
    return {
      title: 'GAME OVER', score: w.run.score, time: this.clock,
      rows: [
        ['도달 웨이브', `WAVE ${this.wave}`],
        ['생존 시간', fmtClock(this.clock)],
        ['처치 수', `${w.run.kills}`],
        ['최종 배율', `×${this.mult.toFixed(2)}`],
        ['최대 콤보', `${Math.max(w.combo.best, w.combo.max)} HITS`],
      ],
      stageId: 'arena', extra: { wave: this.wave, hard: !!this.hard },
    };
  }
  overlay(ctx, vw, vh) {
    const k = this.multFlash > 0 ? this.multFlash / 0.6 : 0;
    const top = this.tagTop(vw, vh);
    this.modeTag(ctx, vw, top, this.wave ? `WAVE ${this.wave}` : 'SURVIVAL', fmtClock(this.clock), '#ffb060');
    // 배율
    const x = vw / 2 + 120, y = top + 30;
    text(ctx, `×${this.mult.toFixed(2)}`, x, y + 6, { size: 20, align: 'left', weight: 900, family: FONT.num, color: k > 0 ? '#ff6060' : this.mult >= 3 ? '#ffe070' : '#ffd0a0', ow: 4 });
    text(ctx, 'MULTI', x, y - 14, { size: 11, weight: 800, family: FONT.num, color: DIM, ow: 2 });
    if (this.phase === 'wave') {
      const left = this.queue.length + this.world.enemies().length;
      text(ctx, `남은 적 ${left}`, vw / 2, top + 76, { size: 14, align: 'center', weight: 800, color: '#e8d8c0', ow: 3 });
    }
    if (this.call && !this.paused) this.bigCall(ctx, vw, vh, this.call.main, this.call.sub, this.call.color, this.call.t);
  }
}

// ───────────────────────────── 스테이지 연습 ─────────────────────────────
export class PracticeScene extends ArcadeRunScene {
  get modeId() { return 'practice'; }
  makeWorld() {
    const w = new World(this.game, this.cfg.stageId ?? 's01', { mode: 'practice' });
    return w;
  }
  setup() {
    const w = this.world;
    w.finishStage = () => this.finish(true);
    w.banner = null;
    const dl = this.cfg.daily;
    if (dl) {
      const mods = (dl.mods ?? []).map((m) => ONLINE.modName(m));
      this.call = { main: 'DAILY CHALLENGE', sub: mods.length ? `규칙: ${mods.join(' · ')}` : `제${w.stage.chapter}장 ${w.stage.name}`, color: '#7ee0c0', t: 0 };
    } else this.call = { main: 'STAGE PRACTICE', sub: `제${w.stage.chapter}장 ${w.stage.name}`, color: '#5aa8ff', t: 0 };
    this.phase = 'play';
  }
  tick(dt) { if (this.call) { this.call.t += dt / 2.4; if (this.call.t >= 1) this.call = null; } }
  /** 스테이지 연습의 부활은 월드 규칙대로 (체크포인트 · 보스 초기화 · 기믹 onRespawn) — 투기장처럼 제자리에서 일으키면
   *  2부 스테이지의 용암·깊은 물·공허 벽 위에서 되살아날 수 있다 */
  respawnHere() {
    const w = this.world, p = w.player;
    if (typeof w.respawn !== 'function' || !w.run?.checkpoint) { super.respawnHere(); return; }
    if (!w.entities.includes(p)) w.add(p);
    p.deathT = 0;
    w.respawn();
  }
  results(cleared) {
    const w = this.world, run = w.run, stage = w.stage;
    let bonus = 0, rank = 'D';
    if (cleared) {
      const par = stage.parTime ?? 300;
      const timeBonus = Math.max(0, Math.round((par * 1.5 - run.time) * 100));
      const noDmg = run.damageTaken === 0 ? 50000 : 0;
      bonus = Math.round((timeBonus + w.combo.best * 200 + run.kills * 50 + run.secrets * 3000 + run.lives * 5000 + noDmg) * (w.diff.scoreMult ?? 1));
      let pts = 40 + clamp((par - run.time) / par, -0.5, 0.6) * 40 + clamp(w.combo.best / 60, 0, 1) * 20;
      pts += run.damageTaken === 0 ? 20 : clamp(1 - run.damageTaken / (w.player.stats.hp * 3), 0, 1) * 12;
      rank = pts >= 90 ? 'S' : pts >= 75 ? 'A' : pts >= 55 ? 'B' : pts >= 35 ? 'C' : 'D';
    }
    return {
      title: cleared ? 'STAGE CLEAR' : 'GAME OVER', score: run.score + bonus, time: run.time, rank: cleared ? rank : null,
      rows: [
        ['스테이지', `제${stage.chapter}장 ${stage.name}`],
        ['클리어 시간', cleared ? fmtClock(run.time) : '-'],
        ['처치 수', `${run.kills}`],
        ['최대 콤보', `${Math.max(w.combo.best, w.combo.max)} HITS`],
        ['비밀 발견', `${run.secrets}`],
        ['클리어 보너스', cleared ? `+${fmt(bonus)}` : '-'],
      ],
      stageId: stage.id,
    };
  }
  overlay(ctx, vw, vh) {
    // 'PRACTICE' 꼬리표: 기믹 게이지 줄 오른쪽 (게이지·토스트·터치 시스템 버튼과 겹치지 않는 가운데 위)
    let y = 26;
    try { const m = hudLayout(this.world, vw, vh)?.meter?.(0); if (m && Number.isFinite(m.y)) y = m.y + 13; } catch { /* 무시 */ }
    text(ctx, this.cfg.daily ? 'DAILY' : 'PRACTICE', vw / 2 + 108, y, { size: 13, align: 'left', weight: 900, family: FONT.logo, color: this.cfg.daily ? '#7ee0c0' : '#8ac8ff', ow: 3 });
    if (this.call && !this.paused) this.bigCall(ctx, vw, vh, this.call.main, this.call.sub, this.call.color, this.call.t);
  }
}

// ───────────────────────────── 일시정지 ─────────────────────────────
export class ArcadePauseScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; }
  enter({ run = null } = {}) {
    // 진행 중인 아케이드 장면 없이 열렸다 (?scene=arcadePause 등): 부팅이 멈추지 않게 아케이드 메뉴로 보낸다
    if (!run?.world || !run.cfg) { this.run = null; this.game.go('arcade', {}, { fade: false }); return; }
    this.run = run;
    run.paused = true; // 뒤 장면의 라운드 호출·NEXT 초상화 등 큰 연출을 숨김
    this.items = [
      ['계속하기', 'RESUME', () => this.game.pop()],
      ['설정', 'OPTIONS', () => this.game.push('options', {})],
      ['리타이어 (결과 보기)', 'RETIRE', () => this.game.push('frontConfirm', { title: '리타이어', message: '도전을 포기하고 지금까지의 기록으로 정산할까요?', yes: '리타이어', danger: true, onYes: () => { this.game.pop(); run.finish(false, 'retire'); } })],
      ['아케이드 메뉴로', 'EXIT', () => this.game.push('frontConfirm', { title: '나가기', message: '기록을 남기지 않고 아케이드 메뉴로 돌아갈까요?', yes: '나가기', danger: true, onYes: () => { run.done = true; endArcade(this.game); this.game.go('arcade', {}); } })],
    ];
    this.menu = new ListMenu(this.items.length);
    audio.duck?.(0.4, 0.3);
  }
  exit() { if (this.run) this.run.paused = false; }
  pick(i) { this.menu.index = i; audio.sfx('menu_ok'); this.items[i][2](); }
  update(dt) {
    if (!this.run) return;
    const tap = taps.hit(this);
    if (typeof tap === 'string' && tap.startsWith('item:')) { this.pick(+tap.slice(5)); return; }
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'confirm') this.pick(this.menu.index);
    else if (r === 'cancel' || input.pressed('menu')) { audio.sfx('menu_cancel'); this.game.pop(); }
  }
  render(ctx) {
    if (!this.run) return;
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const k = ease.outCubic(clamp(this.t / 0.2, 0, 1));
    ctx.fillStyle = `rgba(4,0,8,${0.74 * k})`; ctx.fillRect(0, 0, W, H);
    const M = ARCADE_MODES[this.run.cfg.kind];
    const small = H < 480, iw = 340, ih = 54, n = this.items.length;
    let gap = small ? 8 : 10, hy = small ? 64 : 104, y0 = hy + (small ? 56 : 72);
    // 최소 UI 높이(400, platform §6.2)에서 점수 줄이 아래 안내 줄과 겹치면 제목을 올리고 간격을 줄인다 (항목 높이 54 = 44 CSS px 유지)
    const over = y0 + n * (ih + gap) + 20 - (H - 36);
    if (over > 0) { gap = 6; hy = Math.max(50, hy - over); y0 = hy + 54; }
    ctx.save(); ctx.globalAlpha = k;
    heading(ctx, W / 2, hy, 'PAUSE', M?.name, { size: small ? 34 : 42 });
    this.items.forEach(([l, s], i) => {
      const r = { x: W / 2 - iw / 2, y: y0 + i * (ih + gap), w: iw, h: ih };
      menuItem(ctx, r, l, { selected: this.menu.index === i, sub: s, size: 19 });
      taps.add(`item:${i}`, r, { owner: this, kind: 'primary', src: 'arcadePause.item' });
    });
    // 모드별 옆 칸 (무한의 탑: 받은 축복) — 메뉴 열 오른쪽
    this.run.drawPauseSide?.(ctx, { x: W / 2 + iw / 2 + 18, y: y0, w: W / 2 - iw / 2 - 30, h: n * (ih + gap) - gap });
    const w2 = this.run.world;
    const sy = y0 + n * (ih + gap) + 20;
    text(ctx, `SCORE ${fmt(w2.run.score)}   ·   ${fmtClock(this.run.clock || w2.run.time)}`, W / 2, sy, { size: 14, align: 'center', weight: 800, family: FONT.num, color: '#d8c8b0', ow: 3 });
    const items = promptMode() === 'touch' ? [[null, '', '항목을 눌러 고르세요']] : [['dpadV', '선택'], ['confirm', '결정'], ['cancel', '계속하기']];
    drawHints(ctx, items, W / 2, H - 14, { align: 'center', size: 13, color: '#b8aa98' });
    ctx.restore();
  }
}

// ───────────────────────────── 결과 정산 ─────────────────────────────
const RANK_STYLE = { S: ['#ffe070', 'gold'], A: ['#ffa640', 'blood'], B: ['#5aa8ff', 'bone'], C: ['#7ee07e', 'bone'], D: ['#a0a0a0', 'bone'] };
const RANK_W = 170, RANK_GAP = 20; // 랭크 도장 칸 폭, 표와의 간격 (UI px)
export class ArcadeResultsScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }
  enter(p) {
    this.res = p;
    const g = this.game, m = g.meta;
    this.shown = 0; this.rowT = 0; this.scoreShown = 0; this.doneT = 0; this.left = false;
    this.final = Math.max(0, Math.floor(p.score ?? 0));
    this.date = Date.now();
    // 최고 기록 갱신
    let best = false;
    if (p.kind === 'bossrush' && p.cleared) {
      // 코스마다 보스 수가 달라 시간을 비교할 수 없으므로 코스별로 따로 보관
      const bests = bossRushBests(m), course = p.cfg?.course ?? 0, b = bests[course];
      if (!b || p.time < (b.time ?? 1e9)) { bests[course] = { time: p.time, score: this.final, charId: p.charId, course, date: this.date }; best = true; }
    }
    if (p.kind === 'survival' && (p.extra?.wave ?? 0) > (m.survivalBest ?? 0)) { m.survivalBest = p.extra.wave; best = true; }
    if (p.kind === 'tower' && (p.extra?.floor ?? 0) > 0) {
      // 무한의 탑: 난이도별 최고 (돌파한 층 ↑ → 시간 ↓)
      const tb = towerBests(m), d = p.cfg?.diff ?? 'normal', b = tb[d], fl = p.extra.floor;
      if (!b || fl > (b.floor ?? 0) || (fl === b.floor && p.time < (b.time ?? 1e9))) { tb[d] = { floor: fl, time: p.time, score: this.final, charId: p.charId, blessings: p.extra.blessings ?? [], date: this.date }; best = true; }
    }
    this.newBest = best;
    saves.saveMeta(m);
    this.qual = qualifies(g, p.kind, this.final);
    audio.music(p.cleared ? 'victory' : 'gameover');
    endArcade(g);
    this.onlineSubmit(p.online);
    this.prewarm();
  }
  /**
   * 온라인 제출 (기다리지 않는다). this.onl = { state: 'sending'|'ok'|'queued'|'guest'|'login'|'offline'|'unavailable'|'error', … }
   * 표에 '온라인 순위' 줄을 더한다 (순위에 오르는 판이 아니거나 이 환경에서 못 쓰면 줄 없음). 내 최고 고스트는 기기에도 남긴다
   */
  onlineSubmit(o) {
    this.onl = null;
    if (!o?.submit || !o.board) return;
    try {
      if (o.ghost && o.result?.time > 0) ONLINE.saveLocalGhost(o.board, o.result.time, o.ghost, o.result.hero, o.result.cls);
      const st = o.h?.state;
      if (st === 'unavailable' || st === 'none' || !st) return;
      this.onl = { state: st === 'guest' ? 'guest' : 'sending' };
      this.res.rows = [...(this.res.rows ?? []), ['온라인 순위', () => this.onlineText()]];
      if (st === 'guest') return;
      ONLINE.finishRun(o.h, o.result, o.ghost).then((r) => {
        this.onl = r;
        if (r.state === 'ok' && r.best && this.game.top === this) audio.sfx('levelup');
      }).catch(() => { this.onl = { state: 'error' }; });
    } catch (e) { console.warn('[arcade] online submit', e); this.onl = null; }
  }
  /** '온라인 순위' 줄 글 → [글, 색, 길게(가운데 한 줄)] */
  onlineText() {
    const o = this.onl;
    if (!o) return ['-'];
    switch (o.state) {
      case 'sending': return ['제출 중…', DIM];
      case 'ok': {
        const rk = o.rank ? `${o.rank}위${o.total ? ` (전체 ${o.total}명)` : ''}` : o.total ? `100위 밖 (전체 ${o.total}명)` : '순위 밖';
        return o.best ? [`★ 새 최고 기록! ${rk}`, '#ffe070'] : [`${rk} · 내 최고 기록이 더 좋아요`, '#cfe8ff'];
      }
      case 'queued': return ['오프라인 — 연결되면 자동으로 올려요', '#ffb070', true];
      case 'guest': return ['로그인하면 순위에 오를 수 있어요', '#9fd8ff', true];
      case 'login': return ['로그인이 만료되어 올리지 못했어요. 다시 로그인해 주세요', '#ffb070', true];
      case 'offline': return ['시작할 때 연결되지 않아 이번 기록은 순위에 올리지 못했어요', '#ffb070', true];
      default: return [o.message ?? '순위에 올리지 못했어요', '#ff9a8a', true];
    }
  }
  /** 피 글씨 비트맵을 미리 굽는다 (첫 프레임·랭크 도장 프레임이 끊기지 않게). 실패해도 그릴 때 굽는다 */
  prewarm() {
    const g = this.game, ctx = g.ctx, r = this.res;
    if (!ctx?.setTransform) return;
    const L = this.layout(), k = (g.scale || 1) * (g.uiK || 1);
    ctx.save();
    try {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      prewarmText(ctx, r.title ?? 'RESULT', this.titleOpts(L));
      if (r.rank) prewarmText(ctx, r.rank, this.rankOpts(L));
    } catch { /* 글꼴·캔버스 준비 전 */ } finally { ctx.restore(); }
  }
  titleOpts(L) { return this.res.cleared ? { size: L.titleSize, style: 'gold' } : { size: L.titleSize, style: 'blood', drips: 0.4 }; }
  rankOpts(L) { return { size: L.rankSize, style: RANK_STYLE[this.res.rank]?.[1] ?? 'bone', drips: 0.6 }; }
  update(dt) {
    this.rowT += dt;
    const rows = this.res.rows ?? [];
    if (this.shown < rows.length && this.rowT > 0.3) { this.rowT = 0; this.shown++; audio.sfx('coin'); }
    if (this.shown >= rows.length) {
      this.scoreShown = Math.min(this.final, this.scoreShown + Math.max(1, this.final * dt * 1.2));
      if (!this.doneT && this.scoreShown >= this.final) { this.doneT = this.t || 1e-3; audio.sfx(this.qual ? 'levelup' : 'menu_ok'); }
    }
    const skip = input.pressed('confirm') || input.pressed('attack') || input.pointer.tapped;
    if (!skip) return;
    if (!this.doneT) { this.shown = rows.length; this.scoreShown = this.final; this.doneT = this.t || 1e-3; return; }
    if (this.t - this.doneT < 0.4 || this.left) return;
    this.left = true;
    const g = this.game, r = this.res;
    const entry = { score: this.final, mode: r.kind, charId: r.charId, diff: r.cfg?.diff, stageId: r.stageId, date: this.date, wave: r.extra?.wave, bosses: r.extra?.bosses, floor: r.extra?.floor, time: r.time };
    if (this.qual) g.push('initials', { score: this.final, mode: r.kind, entry, onDone: () => g.go('highscore', { mode: r.kind, highlight: this.date, back: 'arcade', board: r.online?.submit ? r.online.board : null }) });
    else g.go('arcade', { cfg: r.cfg?.daily ? { kind: 'daily', ghost: r.cfg.ghost } : r.cfg });
  }
  /** 배치 (UI px). 최소 720×400 에서도 표·랭크·안내가 겹치지 않는다 */
  layout() {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const n = Math.max(1, (this.res.rows ?? []).length), rank = !!this.res.rank;
    const small = H < 480;
    const titleSize = small ? 38 : 44, titleY = small ? 52 : 66;
    const subY = titleY + (small ? 28 : 34);
    const w = Math.round(clamp(W - 48 - (rank ? RANK_W + RANK_GAP : 0), 360, 560));
    const x = Math.round((W - (w + (rank ? RANK_W + RANK_GAP : 0))) / 2);
    const y = subY + 16;
    const rowStep = clamp((H - y - 150) / n, 24, 36);
    const ph = 34 + n * rowStep + 44;
    return {
      W, H, small, titleSize, titleY, subY, x, y, w, ph, rowStep, rowY0: y + 36,
      scoreY: y + 36 + n * rowStep + 18, rankX: x + w + RANK_GAP + RANK_W / 2, rankY: y + ph / 2 + 24, rankSize: small ? 96 : 110,
      msgY: Math.min(y + ph + 28, H - 40), hintY: H - 14,
    };
  }
  render(ctx) {
    const g = this.game, t = g.time, r = this.res;
    const L = this.layout(), { W, H, x, y, w } = L;
    const M = (r.cfg?.daily ? ARCADE_MODES.daily : ARCADE_MODES[r.kind]) ?? ARCADE_MODES.bossrush;
    kenBurns(ctx, assets.get(r.kind === 'practice' ? (STAGES[r.stageId]?.bg ?? 'bg/s_arena') : r.kind === 'tower' ? ARCADE_MODES.tower.art : 'bg/s_arena'), W, H, t, { z0: 1.05, z1: 1.1 });
    ctx.fillStyle = 'rgba(6,2,10,0.74)'; ctx.fillRect(0, 0, W, H);
    shade(ctx, W, H, { top: 0.5, bottom: 0.6, vig: 0.8 });
    // 제목 (피 글씨: 성공 = 금박, 실패 = 피)
    const k = ease.outBack(clamp(this.t / 0.5, 0, 1));
    ctx.save();
    ctx.translate(W / 2, L.titleY); ctx.scale(Math.max(0.01, k), Math.max(0.01, k));
    bloodText(ctx, r.title ?? 'RESULT', 0, 0, { ...this.titleOpts(L), t: this.t, maxWidth: W - 40 });
    ctx.restore();
    text(ctx, `${M.name} · ${CHARACTERS[r.charId]?.name ?? ''} · ${getDiff(r.cfg?.diff).name}`, W / 2, L.subY, { size: 15, align: 'center', weight: 700, color: '#e8d8c0', ow: 3, maxWidth: W - 40 });
    const rows = r.rows ?? [];
    frame(ctx, x, y, w, L.ph, { accent: M.color, glow: 0.6 });
    rows.slice(0, this.shown).forEach(([a, b], i) => {
      const yy = Math.round(L.rowY0 + i * L.rowStep);
      if (typeof b === 'function') {
        // 온라인 순위 줄: 값이 바뀐다 (제출 중 → 순위). 긴 안내는 줄 전체 폭으로
        const [v, col, wide] = b();
        if (wide) text(ctx, v, x + w / 2, yy, { size: 15, align: 'center', weight: 800, color: col ?? '#fff', ow: 2, maxWidth: w - 40 });
        else {
          text(ctx, a, x + 26, yy, { size: 16, color: '#e8dcc8', ow: 2 });
          text(ctx, v, x + w - 26, yy, { size: 16, align: 'right', weight: 800, color: col ?? '#fff', ow: 2, maxWidth: w * 0.62 });
        }
      } else {
        text(ctx, a, x + 26, yy, { size: 16, color: '#e8dcc8', ow: 2 });
        text(ctx, b, x + w - 26, yy, { size: 16, align: 'right', weight: 800, family: FONT.num, color: '#fff', ow: 2, maxWidth: w * 0.55 });
      }
      ctx.fillStyle = 'rgba(232,200,114,0.12)'; ctx.fillRect(x + 22, yy + 10, w - 44, 1);
    });
    text(ctx, 'SCORE', x + 26, L.scoreY, { size: 18, weight: 900, family: FONT.num, color: DIM, ow: 2 });
    text(ctx, fmt(this.scoreShown), x + w - 26, L.scoreY + 4, { size: 32, align: 'right', weight: 900, family: FONT.num, color: '#fff', ow: 4 });
    // 랭크 도장 (연습 모드)
    if (r.rank && this.doneT) {
      const rt = this.t - this.doneT;
      const kk = ease.outBack(clamp(rt / 0.4, 0, 1));
      const [col] = RANK_STYLE[r.rank] ?? RANK_STYLE.D;
      ctx.save();
      ctx.translate(L.rankX, L.rankY);
      if (this._glowKey !== `${L.rankSize}|${r.rank}`) { // 원점 기준 그라데이션: 크기·랭크가 같으면 다시 만들지 않는다
        const gl = ctx.createRadialGradient(0, -L.rankSize * 0.3, 4, 0, -L.rankSize * 0.3, L.rankSize * 0.85);
        gl.addColorStop(0, col + '88'); gl.addColorStop(1, col + '00');
        this._glow = gl; this._glowKey = `${L.rankSize}|${r.rank}`;
      }
      ctx.globalAlpha = clamp(rt / 0.3, 0, 1);
      ctx.fillStyle = this._glow; ctx.fillRect(-L.rankSize, -L.rankSize * 1.2, L.rankSize * 2, L.rankSize * 1.8);
      ctx.globalAlpha = 1;
      text(ctx, 'RANK', 0, -L.rankSize * 0.72, { size: 16, align: 'center', weight: 800, family: FONT.num, color: '#e8d8c0' });
      ctx.scale(Math.max(0.01, kk), Math.max(0.01, kk)); ctx.rotate(-0.15);
      bloodText(ctx, r.rank, 0, L.rankSize * 0.26, { ...this.rankOpts(L), t: rt });
      ctx.restore();
    }
    if (this.doneT) {
      const a = 0.6 + 0.4 * Math.sin(t * 5);
      const cx = x + w / 2;
      if (this.newBest) text(ctx, '★ 최고 기록 갱신! ★', cx, L.msgY, { size: 18, align: 'center', weight: 900, color: `rgba(255,224,112,${a})`, ow: 3 });
      else if (this.qual) text(ctx, '명예의 전당 순위권 진입!', cx, L.msgY, { size: 17, align: 'center', weight: 900, color: `rgba(255,224,112,${a})`, ow: 3 });
      if (promptMode() === 'touch') text(ctx, '화면을 터치하세요', W / 2, L.hintY, { size: 14, align: 'center', color: DIM, ow: 2 });
      else drawHints(ctx, [['confirm', '계속']], W / 2, L.hintY, { align: 'center', size: 14, color: DIM });
    }
  }
}
