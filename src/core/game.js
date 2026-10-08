// 게임 본체: 캔버스/해상도, 고정 타임스텝 루프, 장면(Scene) 스택, 페이드 전환
// 플랫폼 코어 (platform.md §6.1–6.5, P-11/12/13/18/26; feel §4.9; MASTER_PLAN §1.8, §1.10) — owner: PLAT-CORE
//   game.safe {l,r,t,b}     기기 안전 영역 (논리 px; 두 safeArea 모드 모두 기기 인셋 그대로) · game.safeCss (CSS px)
//   game.cssScale           CSS px / 논리 px (캔버스 CSS 높이 / 540) · game.canvasRect {x,y,w,h} 캔버스 CSS 상자
//   game.uiK / uiW / uiH    UI 배율과 그 배율에서의 화면 크기 (scene.uiScale = true 인 장면만 ctx.scale(uiK) 로 그린다)
//   game.tier / quality     실제 품질 등급 'low'|'medium'|'high' (설정 'auto' 는 품질 조절기가 정한다.
//                           조절 결과는 settings.autoTier 로 남겨 다음 실행이 그 등급에서 시작한다 — game.onSettingsAuto(settings) 로 저장,
//                           settings.quality 는 'auto' 그대로 둔다)
//   game.dirty              true 면 다음 rAF 에 틱이 없어도 한 번 그린다 (fpsCap 60 은 틱이 돈 rAF 에서만 그린다)
//   game.syncPad()          가상 패드 표시의 유일한 주인 (touchpad.setVisible)
//   game.flash(color, strength, decay) · game.flashCapped(strength, record = true) → 정책을 적용한 세기 (직접 그리는 번쩍임용)
//   game.vignette(color, a, decay) · game.toast(text, color, time)
//   game.saveFailed({kind, key, slot})  저장 실패 경고 (main.js 가 saves.onFail 로 잇는다, PS-01): 경고 토스트를 띄우고, 같은 처리 안에서
//                           뒤따르는 '저장 완료'·'여정을 기록했다' 토스트는 거짓 성공 안내이므로 지우거나(회복 안내만 남김) 버린다
//   game.pop() 이 마지막 장면이면 타이틀로 (빈 스택 방지)
//   game.lazyScenes(loader) · game.whenScenes() · game.scenesReady · game.retryScenes()   첫 화면 밖 장면을 나중에 받는다 (R1-REQ-229):
//                           그동안 go/push 한 미등록 장면은 '불러오는 중' 자리 장면(name 'loading')이 지키다가 도착하면 제자리 교체
//   game.enableFeelStats()  feel §8 계측 (?feelstats · ?debug 면 init 에서 켠다) → 그린 프레임마다 window.__feelStats
// 주의 (순환 import): hud_layout.js · touchpad.js 등이 이 파일을 import 한다 → 모듈 최상위에서 import 값에 접근하지 않는다.
import { input } from './input.js';
import { clamp, rgba } from './math.js';
import { font, wrap, FONT, setTextFloor, taps, onFontEpoch, fontEpoch } from './ui.js';
import * as UI from './ui.js';
import { touchpad } from './touchpad.js';
import { safeInsets } from './platform.js';
import { hudLayout, hudSafe } from '../render/hud_layout.js';
import * as SAVE from './save.js';

export const VIEW_H = 540;       // 논리 해상도 높이 (고정)
export const MIN_VIEW_W = 960;   // 16:9
export const MAX_VIEW_W = 1280;  // 초광폭 휴대폰 대응
export const TILE = 48;          // 타일 한 칸 (논리 px)
export const STEP = 1 / 60;
// 가상 패드를 보여 주는 게임플레이 장면 (그 외 장면이 맨 위에 있으면 패드를 숨긴다)
// 장면이 this.hidePad = true / this.showPad = true 로 직접 지정할 수도 있다
export const PAD_SCENES = new Set(['stage', 'hub', 'bossrush', 'survival', 'practice', 'tower', 'ultCutin']);   // [hook:plat] tower = 무한의 탑
/** 품질 조절기가 프레임 시간을 재는 장면 (게임플레이만). 토스트도 이 장면들이 그리는 HUD 위에서만 hudLayout 줄을 쓴다 */
const GOV_SCENES = new Set(['stage', 'hub', 'bossrush', 'survival', 'practice', 'tower']);
/** 품질 등급별 DPR 상한·백킹 픽셀 예산·이미지 보간 (platform §6.4, MASTER_PLAN §5.2) */
export const QUALITY_TIERS = Object.freeze({
  low: Object.freeze({ cap: 1, budget: 1.0e6, smooth: 'low' }),
  medium: Object.freeze({ cap: 1.5, budget: 1.6e6, smooth: 'medium' }),
  high: Object.freeze({ cap: 2, budget: 3.7e6, smooth: 'high' }),
});
const TIER_ORDER = ['low', 'medium', 'high'];
const TIER_NAME = { low: '낮음', medium: '보통', high: '높음' };
/** 품질 조절기 (platform §6.4): 프레임 간격 EMA 가 22 ms 넘게 5초 → 한 단계 내림, 14 ms 미만 20초 → 시작 등급까지 한 단계 올림, 변경 간격 ≥ 10초 */
const GOV = { tau: 0.2, slowMs: 22, slowT: 5, fastMs: 14, fastT: 20, gap: 10, vsyncMs: 17.5, vsyncMax: 21, failWindow: 30 };
const UI_MIN_W = 720, UI_MIN_H = 400;   // uiScale 장면이 넘치지 않고 배치되어야 하는 최소 UI 크기 (platform §6.2)
const UI_TEXT_FLOOR = 11;               // uiScale 장면을 그리는 동안의 글자 크기 하한 (UI px, 설정 '글자 크기' 보통)
/**
 * 설정 '글자 크기'(textSize, benchmark #7) → uiScale 장면의 글자 하한. UI 크기(uiScale·uiK)와 따로 움직인다.
 *  k   : 기본 하한 11 UI px 에 곱하는 값 (데스크톱·태블릿처럼 화면이 넉넉하면 이쪽이 이긴다)
 *  css : 실제 화면에서 보장할 최소 글자 크기 (CSS px) — 휴대폰은 uiK·cssScale 이 작아 이쪽이 이긴다
 *        (phone2 740×360: 보통 9.2 → 크게 12 → 아주 크게 13.5 CSS px. 예전 '글자·UI 크기 150%' 는 UI_MIN_H 때문에 135% 에서 멈춰 9.9)
 * 하한은 ui.font() 를 거치는 글자(text·wrap·paragraph·button·measure)에만 걸린다. 큰 글자는 그대로라 위계가 남는다.
 */
export const TEXT_SIZES = Object.freeze({
  normal: Object.freeze({ k: 1, css: 0 }),
  large: Object.freeze({ k: 1.15, css: 12 }),
  xlarge: Object.freeze({ k: 1.3, css: 13.5 }),
});
const PAD_HIDE_DELAY = 0.25;            // 입력이 패드·키보드로 바뀐 뒤 가상 패드를 숨기기까지 (초; 터치로 오면 바로 보인다)
const FLASH_CAP = 0.7, FLASH_SOFT = 0.3; // 화면 번쩍임 상한, 1초에 강한 번쩍임이 2번 넘으면 그 뒤의 상한
const ZERO = Object.freeze({ l: 0, r: 0, t: 0, b: 0 });
// 저장 실패 경고 (PS-01). 성공 안내 걸러 내기: 월드 세이브 포인트 '저장 완료 — 체력과 마력이…' 는 머리말만 떼고,
// 마을·교회의 '…여정을 기록했다' · '저장 공간에 접근할 수 없어…' 는 경고와 겹치므로 버린다
const SAVE_FAIL_QUOTA = '저장 공간이 부족해 저장하지 못했습니다';
const SAVE_FAIL_BLOCKED = '저장 공간에 접근할 수 없어 저장하지 못했습니다';
const SAVE_FAIL_HINT = '게임을 닫기 전에 계정 저장이나 저장 코드로 백업하세요';
const SAVE_WARN = new Set([SAVE_FAIL_QUOTA, SAVE_FAIL_BLOCKED, SAVE_FAIL_HINT]);
const SAVE_OK_HEAD = /^저장 완료\s*(?:[—–-]\s*)?/;
const SAVE_OK_DROP = /^(?:저장 완료\s*$|저장 공간에 접근할 수 없어|(?:슬롯 \d+에 )?여정을 기록했다)/;

/**
 * Scene 기본 클래스. 모든 장면은 이를 상속한다.
 *  enter(params)  : 장면 시작
 *  exit()         : 장면 종료
 *  update(dt)     : 스택 최상단 장면만 호출 (overlay가 아니면)
 *  render(ctx)    : 스택 아래→위 순서로 모두 호출 (단, 아래 장면이 opaque면 그 아래는 생략)
 *  opaque         : true면 아래 장면을 그리지 않음
 *  updateBelow    : true면 이 장면이 떠 있어도 아래 장면 update 계속 (예: 토스트)
 *  hidePad/showPad: 모바일 가상 패드 강제 숨김/표시 (미지정 시 PAD_SCENES 기준)
 *  padHideButtons : 패드는 보이되 숨길 버튼 (true 또는 버튼 id 배열; touchpad.setVisible 에 그대로 전달 — 마을의 전투 버튼 등)
 *  uiScale        : true 면 ctx.scale(game.uiK) 안에서 그린다 → game.uiW × game.uiH 로 배치, 포인터도 UI 좌표, 글자 크기 하한 11
 *  hideToasts     : 토스트 숨김 / deferToasts: 숨기고 시간도 멈춤(장면을 벗어난 뒤 표시)
 *  toastY/toastX  : 토스트 줄 기준 위치 (기본: 화면 가운데 위 y=92; world 가 있는 게임플레이 장면은 hudLayout().toast(i) 줄)
 *                   toastUp: true 면 기준선에서 위로 쌓는다 · toastW: 상자 최대 폭 (≤ 2줄 줄바꿈, 중심은 toastX ± toastW/2 안)
 *  autoPause()  : 기기를 세로로 돌리거나 탭이 숨겨질 때 호출 (게임플레이 장면이 일시정지 메뉴를 띄움)
 */
export class Scene {
  constructor(game) { this.game = game; this.opaque = true; this.updateBelow = false; this.t = 0; }
  enter(params) {}
  exit() {}
  update(dt) {}
  render(ctx) {}
  resize() {}
}

class Game {
  constructor() {
    this.canvas = null; this.ctx = null;
    this.viewW = MIN_VIEW_W; this.viewH = VIEW_H;
    this.scale = 1; this.dpr = 1;
    this.cssScale = 1; this.canvasRect = { x: 0, y: 0, w: MIN_VIEW_W, h: VIEW_H };
    this.safe = { ...ZERO }; this.safeCss = { ...ZERO };
    this.uiK = 1; this.uiW = MIN_VIEW_W; this.uiH = VIEW_H;
    this.dirty = true;
    this.started = false;
    this.scenes = [];
    this.registry = {};
    this.time = 0; this.frame = 0; this.realTime = 0;
    this.acc = 0; this.last = 0;
    this.fade = { a: 0, dir: 0, speed: 3, color: '#000', pending: null };
    this.flashFx = { a: 0, color: '#fff', decay: 4 };
    this.vignetteFx = { a: 0, color: '#ff0020', decay: 3 };
    this._flashLog = [];
    this.input = input;
    this.audio = null; this.assets = null; this.saves = null;
    this.state = null;      // 현재 세이브 데이터 (진행 상황)
    this.settings = null;   // 설정 (볼륨, 품질, 진동 등)
    this.meta = null;       // 슬롯과 무관한 전역 해금/기록
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;
    this.paused = false;
    this.portrait = false;      // 세로 화면이라 '가로로 돌려주세요' 안내가 필요한가 (휴대폰: 짧은 변 < 600)
    this.portraitAny = false;   // 화면이 세로인가 (태블릿은 세로로도 플레이: 캔버스 위, 패드는 아래 띠)
    this._locked = false; this._pageHidden = false;
    this.toasts = [];
    this.debug = false;
    this.padShown = false; this._touchAt = -Infinity; this._padErr = false; this._padOpts = { hideButtons: null };
    this._ptrK = 1;
    this._tier = 'high';
    // 품질 조절기 상태 (설정 'auto' 일 때만 등급을 바꾼다; 설정값 자체는 쓰지 않는다)
    this.gov = { start: null, tier: null, ema: STEP, slowT: 0, goodT: 0, lastChange: -Infinity, lastRaise: -Infinity, ceil: 2, top: null, toasted: false };
    this._watch = { q: undefined, u: undefined, a: undefined, t: undefined };
    this.textFloor = UI_TEXT_FLOOR; // uiScale 장면의 글자 하한 (UI px) — resize() 가 설정 '글자 크기' 로 다시 잰다
    this._insErr = false;
    // 지연 장면 (P-09 첫 화면 분리, R1-REQ-229): lazyScenes(loader) 가 끝나기 전에는 false. 도구는 이 값이 true 가 될 때까지 기다린다
    this.scenesReady = true;
    this._lazy = null;
    this.feelStats = null;  // ?feelstats · ?debug: 그린 프레임마다 window.__feelStats (feel §8)
  }

  /** 실제 품질 등급 'low'|'medium'|'high' (설정 'auto' 는 품질 조절기 결과) */
  get tier() { return this._tier; }
  get quality() { return this._tier; }
  /** 가상 패드 입력 모드 ('kb'|'pad'|'touch'; 입력 모듈이 mode 를 모르면 touchMode 로 판단) */
  get inputMode() { return input.mode ?? (input.touchMode ? 'touch' : 'kb'); }
  /** 휴대폰을 세로로 들어 게임을 멈춘 상태 (회전 안내가 덮고 있다) */
  get portraitLocked() { return this.portrait && (this.inputMode === 'touch' || !!input.touchMode); }
  /** 맨 위가 게임플레이 장면인가 (화면 꺼짐 방지·커서 숨김 등 platform.js 용) */
  get inGameplay() { const t = this.top; return !!t && PAD_SCENES.has(t.name); }

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    input.init(this);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    window.addEventListener('bn-insets', () => this.resize()); // APK 가 안전 영역을 알려 줄 때 (platform.md §9.4)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.autoPause(); this.audio?.suspend(); } else { this.audio?.resume(); this.last = performance.now(); this.dirty = true; }
    });
    window.addEventListener('pagehide', () => { this._pageHidden = true; });
    window.addEventListener('pageshow', () => { this._pageHidden = false; this.last = performance.now(); this.dirty = true; });
    // 글꼴이 늦게 도착하면 한 번 다시 그린다 (fpsCap 그리기 건너뛰기 중에도 새 글꼴이 보이게)
    onFontEpoch(() => { this.dirty = true; });
    try { const q = new URLSearchParams(location.search); if (q.has('feelstats') || q.has('debug')) this.enableFeelStats(); } catch { /* 주소 없음 */ }
  }

  // ─────────────────────────── feel §8 계측 (R1-REQ-329) ───────────────────────────
  /**
   * ?feelstats · ?debug 일 때만 켠다 (그 밖에는 아무것도 세지 않는다). 그린 프레임마다 window.__feelStats 를 고쳐 쓴다:
   *   particles  보이는 게임플레이 장면의 world.fx.list 길이 · dmgNums 살아 있는 데미지 숫자 · ghosts 살아 있는 잔상(fx.ghost)
   *   gradients  지난 프레임 이후 create*Gradient 호출 수 · heroDraws 이번 프레임 drawHero 전체 그리기 수
   *   sfxStarts  최근 100 ms(게임 시간) 안에 시작한 효과음 수 (audio.stats.starts)
   * heroDraws 는 render/hero.js 가 globalThis.__feelCounters.heroDraws 를 올리면 그 값, 아니면 추정치(주인공 1 + 잔상 수,
   * heroDrawsEstimated: true). 다른 모듈도 __feelCounters 에 자기 카운터를 올릴 수 있다 (있을 때만: globalThis.__feelCounters?.x++)
   */
  enableFeelStats() {
    if (this.feelStats) return this.feelStats;
    const S = { particles: 0, dmgNums: 0, ghosts: 0, gradients: 0, heroDraws: 0, sfxStarts: 0, heroDrawsEstimated: true, frame: 0, t: 0 };
    const C = { gradients: 0, heroDraws: 0, heroHooked: false };
    try {
      const protos = [globalThis.CanvasRenderingContext2D?.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype].filter(Boolean);
      for (const P of protos) {
        for (const m of ['createLinearGradient', 'createRadialGradient', 'createConicGradient']) {
          const f = P[m];
          if (typeof f !== 'function' || f.__feelCount) continue;
          const w = function (...a) { C.gradients++; return f.apply(this, a); };
          w.__feelCount = true;
          P[m] = w;
        }
      }
    } catch (e) { console.warn('[feelStats] gradient counter', e); }
    globalThis.__feelCounters = C;
    this._sfxHist = [];
    this.feelStats = S;
    try { window.__feelStats = S; } catch { /* 창 없음 */ }
    return S;
  }
  /** render() 끝에서 한 번 (계측이 켜졌을 때만) */
  publishFeelStats() {
    const S = this.feelStats, C = globalThis.__feelCounters;
    if (!S || !C) return;
    const w = this.hudScene()?.world ?? this.top?.world ?? null;
    const L = Array.isArray(w?.fx?.list) ? w.fx.list : null;
    let ghosts = 0, dmg = 0;
    if (L) for (const p of L) { if (p.shape === 'ghost') ghosts++; else if (p.shape === 'dmg') dmg++; }
    S.particles = L ? L.length : 0;
    S.dmgNums = dmg;
    S.ghosts = ghosts;
    S.gradients = C.gradients; C.gradients = 0;
    if (C.heroDraws > 0) C.heroHooked = true;
    S.heroDrawsEstimated = !C.heroHooked;
    S.heroDraws = C.heroHooked ? C.heroDraws : (w?.player ? 1 : 0) + ghosts;
    C.heroDraws = 0;
    // 효과음: 누적 시작 수를 (게임 시간, 누적) 표본으로 남겨 100 ms 창의 차이를 잰다 (걸음 단위 시험에서도 맞게 게임 시간 기준)
    const H = this._sfxHist, now = this.time, st = Number(this.audio?.stats?.starts) || 0;
    H.push(now, st);
    while (H.length >= 4 && now - H[2] >= 0.1) H.splice(0, 2);
    S.sfxStarts = Math.max(0, st - H[1]);
    S.frame = this.frame; S.t = now;
  }

  // ─────────────────────────── 지연 장면 (P-09, R1-REQ-229) ───────────────────────────
  /**
   * 첫 화면(타이틀) 밖의 장면을 나중에 받는다: loader(game) → Promise (그 안에서 game.register(…) 들을 부른다).
   * 끝나기 전에 등록되지 않은 장면으로 go/push 하면 '불러오는 중' 자리 장면이 대신 서고, 도착하면 제자리에서 진짜 장면으로 바뀐다
   * (go 로 온 자리는 화면 전체, push 로 온 자리는 아래 장면 위에 반투명). 실패하면 두 번 더 시도하고, 그래도 안 되면 자리 장면이
   * 실패 안내와 다시 시도(확인·탭)를 보여 준다. 반환: Promise<boolean> (game.whenScenes() 와 같다). 진행 중에는 game.scenesReady = false.
   * { defer: true } 면 game.loadScenes() 를 부르거나 등록되지 않은 장면으로 처음 go/push 할 때 받기 시작한다 (첫 화면을 먼저 그리려고)
   */
  lazyScenes(loader, { defer = false } = {}) {
    if (typeof loader !== 'function') return Promise.resolve(true);
    this.scenesReady = false;
    const L = this._lazy = { loader, tries: 0, err: null, done: false, started: false, p: null, resolve: null };
    L.p = new Promise((r) => { L.resolve = r; });
    if (!defer) this.loadScenes();
    return L.p;
  }
  /** defer 로 미뤄 둔 지연 장면을 지금 받기 시작한다 (이미 시작했으면 그대로). 등록되지 않은 장면으로 go/push 해도 바로 시작한다 */
  loadScenes() {
    const L = this._lazy;
    if (L && !L.started) { L.started = true; const done = L.resolve; this._loadLazy().then((ok) => done(ok)); }
    return this.whenScenes();
  }
  _loadLazy() {
    const L = this._lazy;
    L.err = null;
    const attempt = () => Promise.resolve().then(() => L.loader(this)).then(() => {
      L.done = true; L.err = null;
      this.scenesReady = true; this.dirty = true;
      for (const sc of [...this.scenes]) if (sc.pendingFor) this._swapPending(sc);
      return true;
    }, (e) => {
      L.tries++;
      if (L.tries < 3) { console.warn('[game] 장면 불러오기 재시도', L.tries, e?.message ?? e); return new Promise((r) => setTimeout(r, 500 * L.tries)).then(attempt); }
      L.err = e; this.dirty = true;
      console.error('[game] 장면을 불러오지 못했습니다', e);
      return false;
    });
    return attempt();
  }
  /** 지연 장면이 모두 등록되면 true 로 풀리는 Promise (지연 장면이 없으면 바로 true) */
  whenScenes() { return this._lazy?.p ?? Promise.resolve(true); }
  /** 지연 장면을 기다리는 중이거나 실패한 상태 (등록되지 않은 이름이 아직 '모름'이 아니다) */
  get scenesPending() { return !!this._lazy && !this._lazy.done; }
  /**
   * 실패한 지연 장면 다시 받기 (자리 장면의 '다시 시도'): 한 번 더 받아 보고, 그래도 안 되면 페이지를 다시 읽는다.
   * Chromium(안드로이드 WebView 포함)은 받기에 실패한 동적 import 를 모듈 맵에 기억해 같은 페이지에서는 다시 요청하지 않으므로
   * 페이지 안 재시도만으로는 살아나지 않는다. 지연 장면이 오기 전에는 타이틀뿐이라 다시 읽어도 잃을 진행이 없다. { reload: false } 면 읽지 않는다
   */
  retryScenes({ reload = true } = {}) {
    const L = this._lazy;
    if (!L || L.done || !L.err) return L?.p ?? Promise.resolve(true);
    L.tries = 2; // 한 번만 (기억된 실패는 곧바로 돌아온다)
    L.p = this._loadLazy().then((ok) => {
      if (!ok && reload) { try { location.reload(); } catch { /* 창 없음 */ } }
      return ok;
    });
    return L.p;
  }
  /** 자리 장면을 진짜 장면으로 제자리 교체 (없는 이름이면 닫는다) */
  _swapPending(ph) {
    const i = this.scenes.indexOf(ph);
    if (i < 0) return;
    const name = ph.pendingFor, C = this.registry[name];
    if (!C) {
      console.error('Unknown scene: ' + name);
      if (i > 0) { this.scenes.splice(i, 1); ph.exit?.(); } else if (this.registry.title) this.go('title', {}, { fade: false });
      this.dirty = true;
      return;
    }
    const sc = new C(this);
    sc.name = name;
    ph.exit?.();
    this.scenes[i] = sc;
    sc.enter(ph.params ?? {});
    input.flush();
    if (i === 0) this.assets?.sceneChange?.();
    this.dirty = true;
  }

  // ─────────────────────────── 화면 배치 (platform §6.1, §6.2, §6.4) ───────────────────────────
  /** 기기 안전 영역 (CSS px): platform.safeInsets() (env(safe-area-inset-*) 측정 ⊕ APK 브리지 window.__BN_INSETS) */
  readInsets() {
    let a = null;
    try { a = safeInsets?.(); } catch (e) { a = null; if (!this._insErr) { this._insErr = true; console.error(e); } }
    const pick = (k) => Math.round(Math.max(0, Number(a?.[k]) || 0) * 10) / 10;
    return { l: pick('l'), r: pick('r'), t: pick('t'), b: pick('b') };
  }
  /** 터치 기기인가 (태블릿 띠 배치용; 주 입력이 마우스인 터치 노트북은 제외) */
  touchDevice() {
    try { if (SAVE.isTouchDevice?.()) return true; } catch { /* 무시 */ }
    return this.inputMode === 'touch';
  }
  /** 설정 'auto' 인가 (설정이 아직 없으면 'auto' 로 본다) */
  autoQualityOn() {
    const q = this.settings?.quality;
    return !(q === 'low' || q === 'medium' || q === 'high');
  }
  /** 지금 쓸 품질 등급 */
  resolveTier() {
    const q = this.settings?.quality;
    if (q === 'low' || q === 'medium' || q === 'high') return q;
    const G = this.gov;
    if (!G.start) {
      let s = 'high';
      try { s = SAVE.autoQualityTier?.() ?? 'high'; } catch { s = 'high'; }
      G.start = TIER_ORDER.includes(s) ? s : 'high';
      // 지난 실행에서 조절기가 낮춘 등급이 있으면 거기서 시작 (시작 등급보다 높게는 시작하지 않는다; 잘 돌면 다시 올린다)
      const h = this.settings?.autoTier;
      G.tier = TIER_ORDER.includes(h) && TIER_ORDER.indexOf(h) < TIER_ORDER.indexOf(G.start) ? h : G.start;
    }
    return G.tier;
  }

  resize() {
    const cv = this.canvas;
    if (!cv) return;
    const W = Math.max(1, window.innerWidth || 1), H = Math.max(1, window.innerHeight || 1);
    // 안전 영역: 'fit'(기본) 이면 캔버스를 안전 사각형 안에 맞추고, 'full' 이면 화면 전체 (HUD 가 game.safe 만큼 비킨다)
    const ins = this.readInsets();
    const fit = this.settings?.safeArea !== 'full';
    const ax = fit ? ins.l : 0, ay = fit ? ins.t : 0;
    const aw = Math.max(1, fit ? W - ins.l - ins.r : W), ah = Math.max(1, fit ? H - ins.t - ins.b : H);
    this.viewW = Math.round(clamp((VIEW_H * aw) / ah, MIN_VIEW_W, MAX_VIEW_W));
    this.viewH = VIEW_H;
    const s = Math.min(aw / this.viewW, ah / VIEW_H);
    const cssW = Math.max(1, Math.floor(this.viewW * s)), cssH = Math.max(1, Math.floor(VIEW_H * s));
    // 태블릿 띠 (platform §5.2): 남는 세로가 120 CSS px 이상이면 캔버스를 위에 붙이고 남는 띠는 모두 아래(가상 패드 자리)로
    const spare = ah - cssH;
    const band = spare >= 120 && this.touchDevice();
    const x = Math.round(ax + (aw - cssW) / 2), y = Math.round(band ? ay : ay + spare / 2);
    const st = cv.style;
    st.position = 'absolute'; st.left = x + 'px'; st.top = y + 'px';
    st.width = cssW + 'px'; st.height = cssH + 'px';
    this.canvasRect = { x, y, w: cssW, h: cssH };
    this.cssScale = cssH / VIEW_H;
    this.safeCss = ins;
    const k = this.cssScale;
    this.safe = { l: ins.l / k, r: ins.r / k, t: ins.t / k, b: ins.b / k };
    // 품질 등급 → DPR = min(기기 DPR, 등급 상한, √(픽셀 예산 / CSS 면적))  (fhd2x high: 3.7 MP, 8.3 MP 가 아니다)
    const tier = this.resolveTier();
    this._tier = tier;
    const T = QUALITY_TIERS[tier];
    const dpr = Math.max(0.25, Math.min(window.devicePixelRatio || 1, T.cap, Math.sqrt(T.budget / (cssW * cssH))));
    this.dpr = dpr;
    cv.width = Math.max(1, Math.floor(cssW * dpr));
    cv.height = Math.max(1, Math.floor(cssH * dpr));
    this.scale = (cssW * dpr) / this.viewW;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = T.smooth;
    // UI 배율 (platform §6.2): 자동 = clamp(10 / (12·cssScale), 1, 1.35), 설정값은 절대 배율. 최소 UI 크기 720×400 을 지킨다
    const us = this.settings?.uiScale, un = Number(us);
    let uk = us == null || us === 'auto' || !(un > 0) ? clamp(10 / (12 * k), 1, 1.35) : clamp(un, 1, 1.5);
    uk = Math.max(1, Math.min(uk, VIEW_H / UI_MIN_H, this.viewW / UI_MIN_W));
    this.uiK = Math.round(uk * 1000) / 1000;
    this.uiW = this.viewW / this.uiK;
    this.uiH = VIEW_H / this.uiK;
    // 글자 하한 (benchmark #7): max(11·k, 목표 CSS px ÷ (uiK·cssScale)), 0.5 UI px 단위로 올림 (하한이 목표 아래로 내려가지 않게)
    const ts = TEXT_SIZES[this.settings?.textSize] ?? TEXT_SIZES.normal;
    const tf = Math.max(UI_TEXT_FLOOR * ts.k, ts.css > 0 ? ts.css / (this.uiK * k) : 0);
    const floor0 = this.textFloor;
    this.textFloor = Math.ceil(tf * 2 - 1e-6) / 2;
    if (this._sized && floor0 !== this.textFloor) bumpTextCaches();
    this._sized = true;
    taps.cssScale = k; // 탭 최소 크기는 CSS px 로 잰다
    this._ptrK = -1;   // 포인터 변환 다시 맞춤
    for (const sc of this.scenes) sc.resize?.();
    // 세로: 휴대폰(짧은 변 < 600)만 회전 안내 + 자동 일시정지. 태블릿은 세로로도 플레이
    this.portraitAny = H > W;
    this.portrait = this.portraitAny && Math.min(W, H) < 600;
    const bc = document.body.classList;
    bc.toggle('portrait', this.portrait);
    bc.toggle('portrait-play', this.portraitAny && !this.portrait); // 태블릿 세로 플레이: 회전 안내 없음 (style.css)
    const s0 = this.settings, w = this._watch;
    w.q = s0?.quality; w.u = s0?.uiScale; w.a = s0?.safeArea; w.t = s0?.textSize;
    this.dirty = true;
  }
  /** 화면 배치에 영향을 주는 설정이 바뀌었나 (옵션에서 바꾸면 다음 rAF 에 다시 배치) */
  layoutSettingsChanged() {
    const s = this.settings, w = this._watch;
    return !!s && (s.quality !== w.q || s.uiScale !== w.u || s.safeArea !== w.a || s.textSize !== w.t);
  }

  /** 맨 위 장면에 자동 일시정지 요청 (세로 회전·백그라운드 전환) */
  autoPause() { try { this.top?.autoPause?.(); } catch (e) { console.error(e); } }

  /**
   * 가상 패드 표시의 유일한 주인 (platform P-18, §5.1). 매 rAF 호출.
   * 보임 = 입력 모드 'touch' (패드·키보드로 바뀌면 0.25초 뒤 숨김) · 세로 잠금 아님 · 맨 위 장면이 showPad 이거나 PAD_SCENES, hidePad 아님
   *        · 그 장면의 world.hudHidden 아님 (각성 연출).
   * padHideButtons 는 그대로 touchpad 에 넘긴다.
   * 캔버스 패드(input.pad = touchpad.initTouchPad 결과)가 없어 예전 DOM 패드(#touch)를 쓰는 동안에만 input.setPadOff 로도 알린다
   * (캔버스 패드가 있을 때 setPadOff 를 부르면 input 이 패드 표시를 한 번 더 정해 두 주인이 된다).
   */
  syncPad() {
    const top = this.top;
    if (this.inputMode === 'touch') this._touchAt = this.realTime;
    // world.hudHidden: 각성 컷인·감독 연출 동안 HUD 와 함께 패드도 숨긴다 (입력이 잠긴 연출 화면을 버튼이 가리지 않게)   [hook:awaken]
    const scene = !!top && !top.hidePad && (!!top.showPad || PAD_SCENES.has(top.name)) && !this.portraitLocked && !top.world?.hudHidden;
    const show = scene && this.realTime - this._touchAt < PAD_HIDE_DELAY;
    this.padShown = show;
    const o = this._padOpts;
    o.hideButtons = top?.padHideButtons ?? null;
    try { touchpad.setVisible?.(show, o); } catch (e) { if (!this._padErr) { this._padErr = true; console.error(e); } }
    if (!input.pad && typeof document !== 'undefined' && document.getElementById('touch')) input.setPadOff?.(!show);
  }

  register(name, SceneClass) { this.registry[name] = SceneClass; }

  make(name) {
    const C = this.registry[name];
    if (!C) {
      if (this.scenesPending) { this.loadScenes(); return new PendingScene(this, name); } // 지연 장면이 아직 오는 중 (R1-REQ-229)
      throw new Error('Unknown scene: ' + name);
    }
    return new C(this);
  }

  get top() { return this.scenes[this.scenes.length - 1]; }

  /** 스택을 비우고 새 장면으로 (페이드 포함) */
  go(name, params = {}, { fade = true, fadeTime = 0.35, color = '#000' } = {}) {
    const doIt = () => {
      // 없는 장면 이름이면 스택을 비우기 전에 멈춘다 (빈 스택 = 검은 화면, P-26). 스택이 이미 비었으면 타이틀로
      if (!this.registry[name] && !this.scenesPending) {
        console.error('Unknown scene: ' + name);
        if (this.scenes.length || !this.registry.title) return;
        name = 'title'; params = {};
      }
      while (this.scenes.length) this.scenes.pop().exit();
      const sc = this.make(name);
      sc.name = sc.pendingFor ? 'loading' : name;
      this.scenes.push(sc);
      sc.enter(params);
      input.flush();
      this.assets?.sceneChange?.();
      this.dirty = true;
    };
    if (!fade) { doIt(); return; }
    this.fadeOut(doIt, fadeTime, color);
  }
  /** 위에 장면을 쌓는다 (일시정지 메뉴, 대화창 등) */
  push(name, params = {}) {
    const sc = this.make(name);
    sc.name = sc.pendingFor ? 'loading' : name;
    this.scenes.push(sc);
    sc.enter(params);
    input.flush();
    this.dirty = true;
    return sc;
  }
  /** 맨 위 장면을 닫는다. 마지막 장면이면 스택을 비우지 않고 타이틀로 간다 (P-26: ?scene=worldmap → 취소) */
  pop(result) {
    if (this.scenes.length <= 1) {
      if (this.fade.dir > 0 && this.fade.pending) return this.top; // 이미 다른 장면으로 가는 중
      if (this.registry.title && this.top?.name !== 'title') this.go('title');
      return this.top;
    }
    const sc = this.scenes.pop();
    sc?.exit();
    input.flush();
    const under = this.top;
    under?.onResume?.(result, sc);
    this.dirty = true;
    return sc;
  }

  fadeOut(cb, time = 0.35, color = '#000') {
    this.fade.dir = 1; this.fade.speed = 1 / Math.max(0.01, time); this.fade.color = color; this.fade.pending = cb;
  }
  /**
   * 번쩍임 세기 정책만 적용해 돌려준다 — 그리기는 부른 쪽이 한다 (암전 채우기에 섞는 각성 컷인의 퇴장 섬광처럼 game.flash 의
   * 전체 화면 패스를 쓰지 않는 번쩍임; game._flashLog 를 직접 만지지 않는다). game.flash 와 같은 규칙:
   * 세기 × settings.flashFx (0 / 0.5 / 1), 상한 0.7, 최근 1초에 0.3 넘는 번쩍임이 이미 2번 있었으면 0.3 까지.
   * record (기본 true): 0.3 을 넘는 번쩍임을 기록에 남긴다 (그 뒤의 flash·flashCapped 가 센다). false 면 미리 보기만 한다.
   * → 실제로 쓸 세기 0‥0.7 (0 = 번쩍이지 않는다)
   */
  flashCapped(strength = 0.8, record = true) {
    const k = Number(this.settings?.flashFx ?? 1);
    let a = Math.min(FLASH_CAP, Math.max(0, Number(strength) || 0) * (Number.isFinite(k) ? clamp(k, 0, 1) : 1));
    if (!(a > 0)) return 0;
    const now = this.realTime, log = this._flashLog;
    while (log.length && now - log[0] > 1) log.shift();
    if (log.length >= 2) a = Math.min(a, FLASH_SOFT);
    if (record && a > FLASH_SOFT) log.push(now);
    return a;
  }
  /**
   * 화면 번쩍임 (feel §4.9, 광과민 대책): 세기 × settings.flashFx (0 / 0.5 / 1), 상한 0.7.
   * 최근 1초에 0.3 넘는 번쩍임이 이미 2번 있었으면 그 뒤의 것은 0.3 까지만 (flashCapped).
   */
  flash(color = '#fff', strength = 0.8, decay = 4) {
    const a = this.flashCapped(strength);
    if (!(a > 0)) return;
    const f = this.flashFx;
    if (a >= f.a) { f.color = color; f.decay = fadeRate(decay, 4); f.a = a; }
  }
  /** 화면 가장자리 비네트 (전체 화면 채우기 대신; 플레이어 피격 '#ff0020', 0.45, 3 등). 세기 × settings.flashFx (번쩍임과 같은 설정) */
  vignette(color = '#ff0020', a = 0.45, decay = 3) {
    const v = this.vignetteFx;
    const k = Number(this.settings?.flashFx ?? 1);
    const s = clamp((Number(a) || 0) * (Number.isFinite(k) ? clamp(k, 0, 1) : 1), 0, 0.85);
    if (!(s > 0)) return;
    if (s >= v.a) { v.color = typeof color === 'string' && color[0] === '#' ? color : '#ff0020'; v.decay = fadeRate(decay, 3); v.a = s; }
  }
  toast(text, color = '#f3e2b8', time = 2.4) {
    let s = String(text ?? '');
    // 방금(같은 처리 안에서) 저장에 실패했다: 뒤따르는 성공 안내는 거짓이므로 '저장 완료 — ' 머리말을 떼거나 버린다 (경고는 이미 떴다)
    if (this._saveFailNow && !SAVE_WARN.has(s)) {
      if (SAVE_OK_DROP.test(s)) return;
      s = s.replace(SAVE_OK_HEAD, '');
    }
    if (!s.trim()) return; // 빈 알림은 빈 상자만 남기고 줄을 차지하므로 버린다
    const tm = Number(time) > 0 ? Number(time) : 2.4;
    const same = this.toasts.find((t) => t.text === s && SAVE_WARN.has(s));
    if (same) { same.t = Math.max(same.t, tm); return; } // 같은 저장 경고는 한 줄만 (시간만 늘린다)
    this.toasts.push({ text: s, color, t: tm, max: tm, shown: undefined });
    if (this.toasts.length > 5) this.toasts.shift();
  }
  /**
   * 저장 실패 경고 (saves.onFail → main.js). 세이브 슬롯 실패는 매번, 설정·메타 실패는 실행마다 한 번만 알린다.
   * 새 기록은 이번 실행 동안 메모리에 남아 이어하기·클라우드 올리기에는 쓰이지만, 게임을 닫으면 사라진다
   */
  saveFailed(f) {
    const slot = Number.isInteger(f?.slot);
    if (!slot && this._saveFailWarned) return;
    this._saveFailWarned = true;
    const head = f?.kind === 'quota' ? SAVE_FAIL_QUOTA : SAVE_FAIL_BLOCKED;
    this.toast(head, '#ff8a8a', 5);
    this.toast(SAVE_FAIL_HINT, '#f3c9a8', 5);
    this.dirty = true;
    // 같은 처리(동기 호출) 안에서 뒤따르는 '저장 완료' 토스트를 걸러 낸다 → 다음 마이크로태스크에서 푼다
    this._saveFailNow = true;
    Promise.resolve().then(() => { this._saveFailNow = false; });
  }
  /**
   * 토스트를 숨기고 시간도 멈출 때인가: scene.deferToasts (필살·각성 컷인, 동료 합류, 스토리 — 장면이 직접 켠다) · 보이는 게임플레이 장면이
   * HUD 를 숨긴 동안 (world.hudHidden: 각성 연출 — HUD 가 통째로 사라진 화면에 토스트만 뜨지 않게)
   */
  toastsDeferred(sc) {
    if (!sc) return false;
    if (sc.deferToasts) return true;
    return !!this.hudScene()?.world?.hudHidden;
  }
  /** 지금 화면에 HUD 가 보이는 게임플레이 장면 (맨 위이거나, 그 위에 반투명 장면만 있을 때) | null */
  hudScene() {
    const S = this.scenes;
    let i = S.length - 1;
    while (i > 0 && !S[i].opaque) i--;
    const sc = S[i];
    return sc && GOV_SCENES.has(sc.name) ? sc : null;
  }

  // ─────────────────────────── 루프 ───────────────────────────
  start() {
    this.started = true;
    this.last = performance.now();
    const loop = (ts) => {
      requestAnimationFrame(loop);
      let dt = (ts - this.last) / 1000;
      this.last = ts;
      if (!(dt >= 0)) dt = 0;
      if (dt > 0.25) dt = 0.25;
      if (this._pageHidden) return; // pagehide 뒤 (bfcache 등): 아무것도 하지 않는다
      this.realTime += dt;
      this._fpsAcc += dt; this._fpsN++;
      if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
      input.pollFrame?.();  // 게임패드는 rAF 마다 한 번 읽는다
      if (this.layoutSettingsChanged()) this.resize();
      // 터치 기기를 세로로 돌리면 ('가로 모드로 돌려주세요' 안내가 덮는 동안) 게임 진행을 멈춘다
      const locked = this.portraitLocked;
      if (locked !== this._locked) { this._locked = locked; if (locked) this.autoPause(); else this.dirty = true; }
      this.acc = locked ? 0 : this.acc + dt;
      this.syncPointer();
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.tick(STEP);
        this.acc -= STEP; steps++;
        this.syncPointer(); // 스텝 중에 uiScale 장면이 쌓이거나 닫혔으면 다음 스텝부터 맞는 좌표로
      }
      if (steps === 5) this.acc = 0;
      this.govern(dt);
      this.syncPointer();
      // fpsCap 60: 이번 rAF 에 틱이 돌았거나 dirty 일 때만 그린다 (120 Hz 화면에서 같은 그림을 두 번 그리지 않는다). 0 = 매 rAF
      if (steps > 0 || this.dirty || this.settings?.fpsCap === 0) {
        this.dirty = false;
        input.beginRender();
        this.render();
        input.endRender();
      }
      this.syncPad();
    };
    requestAnimationFrame(loop);
  }

  /** 맨 위 장면이 uiScale 이면 포인터를 UI 좌표로 (input.setPointerTransform; 바뀔 때만 호출) */
  syncPointer() {
    if (typeof input.setPointerTransform !== 'function') return;
    const k = this.top?.uiScale ? this.uiK : 1;
    if (k === this._ptrK) return;
    this._ptrK = k;
    input.setPointerTransform(k === 1 ? null : (x, y) => (x && typeof x === 'object' ? { x: x.x / k, y: x.y / k } : { x: x / k, y: y / k }));
  }
  /** input.setPointerTransform 이 없을 때의 대체: 맨 위 uiScale 장면의 update/render 동안만 포인터를 UI 좌표로 바꿔 둔다 */
  withUiPointer(sc, fn) {
    if (!sc.uiScale || sc !== this.top || this.uiK === 1 || typeof input.setPointerTransform === 'function') return fn();
    const p = input.pointer, x = p.x, y = p.y, k = this.uiK;
    p.x = x / k; p.y = y / k;
    try { return fn(); } finally { p.x = x; p.y = y; }
  }

  /**
   * 품질 조절기 (platform §6.4, P-13): 설정 'auto' + 게임플레이 장면 + 모든 기기. 매 rAF (dt = 프레임 간격).
   * 느림(EMA > 22 ms) 5초 → 한 단계 내림 (세션 첫 내림에만 안내), 빠름 20초 → 시작 등급까지 한 단계 올림, 변경 간격 ≥ 10초.
   * 빠름 = EMA < 14 ms, 또는 60 Hz 화면에서 프레임을 하나도 놓치지 않음 (EMA < 17.5 ms 이고 모든 간격 ≤ 21 ms).
   * 올린 뒤 30초 안에 다시 내려가면 이번 세션에는 그 등급 위로 올리지 않는다 (오르내림 반복 방지). 설정값은 바꾸지 않는다.
   */
  govern(dt) {
    const G = this.gov;
    if (dt > 0) G.ema += (dt - G.ema) * (1 - Math.exp(-dt / GOV.tau));
    const top = this.top;
    if (top !== G.top) { G.top = top; G.slowT = 0; G.goodT = 0; }
    const eligible = this.autoQualityOn() && !!top && GOV_SCENES.has(top.name) && !document.hidden && this.fade.dir === 0 && !this._locked;
    if (!eligible || !(dt > 0)) { if (!eligible) { G.slowT = 0; G.goodT = 0; } return; }
    const ms = G.ema * 1000;
    G.slowT = ms > GOV.slowMs ? G.slowT + dt : 0;
    const good = ms < GOV.fastMs || (ms < GOV.vsyncMs && dt * 1000 <= GOV.vsyncMax);
    G.goodT = good ? G.goodT + dt : 0;
    if (this.realTime - G.lastChange < GOV.gap) return;
    this.resolveTier();
    const i = TIER_ORDER.indexOf(G.tier), si = TIER_ORDER.indexOf(G.start);
    if (G.slowT >= GOV.slowT && i > 0) this.setAutoTier(TIER_ORDER[i - 1], -1);
    else if (G.goodT >= GOV.fastT && i < si && i < G.ceil) this.setAutoTier(TIER_ORDER[i + 1], 1);
  }
  setAutoTier(tier, dir) {
    const G = this.gov;
    if (dir < 0 && this.realTime - G.lastRaise < GOV.failWindow) G.ceil = TIER_ORDER.indexOf(tier);
    if (dir > 0) G.lastRaise = this.realTime;
    G.tier = tier; G.lastChange = this.realTime; G.slowT = 0; G.goodT = 0;
    this.resize();
    // 결과를 다음 실행에도 유지: settings.autoTier (시작 등급으로 돌아오면 지운다). settings.quality 는 'auto' 그대로
    const st = this.settings;
    if (st && typeof st === 'object') {
      const hint = tier === G.start ? undefined : tier;
      if (st.autoTier !== hint) {
        if (hint) st.autoTier = hint; else delete st.autoTier;
        try { this.onSettingsAuto?.(st); } catch (e) { console.error(e); }
      }
    }
    if (dir < 0 && !G.toasted) {
      G.toasted = true;
      this.toast(`화면이 버벅여 그래픽 품질을 '${TIER_NAME[tier]}'으로 낮췄습니다`, '#b8c4d8');
    }
  }

  tick(dt) {
    input.update(dt);
    this.time += dt; this.frame++;
    // 페이드
    const f = this.fade;
    if (f.dir !== 0) {
      f.a += f.dir * f.speed * dt;
      if (f.dir > 0 && f.a >= 1) {
        f.a = 1; f.dir = -1;
        const cb = f.pending; f.pending = null;
        cb?.();
      } else if (f.dir < 0 && f.a <= 0) { f.a = 0; f.dir = 0; }
    }
    this.flashFx.a = Math.max(0, this.flashFx.a - this.flashFx.decay * dt);
    this.vignetteFx.a = Math.max(0, this.vignetteFx.a - this.vignetteFx.decay * dt);
    // 토스트 시간: 보이지 못하고 줄을 기다리는 것(shown === false)은 멈춰 둔다
    if (this.toasts.length && !this.toastsDeferred(this.top)) {
      for (const t of this.toasts) if (t.shown !== false) t.t -= dt;
      this.toasts = this.toasts.filter((t) => t.t > 0);
    }
    // 장면 업데이트: 최상단 + updateBelow 체인
    const n = this.scenes.length;
    if (!n) return;
    if (f.dir > 0) return; // 페이드아웃 중에는 입력 정지
    let i = n - 1;
    const toUpdate = [this.scenes[i]];
    while (i > 0 && this.scenes[i].updateBelow) { i--; toUpdate.unshift(this.scenes[i]); }
    for (const sc of toUpdate) { sc.t += dt; this.withUiPointer(sc, () => sc.update(dt)); }
    this.audio?.update?.(dt);
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    // 가장 아래 opaque 장면부터 그림 (uiScale 장면은 ctx.scale(uiK) + 글자 크기 하한 + 탭 영역 좌표 배율)
    let start = this.scenes.length - 1;
    while (start > 0 && !this.scenes[start].opaque) start--;
    for (let i = Math.max(0, start); i < this.scenes.length; i++) {
      const sc = this.scenes[i];
      const ui = !!sc.uiScale;
      ctx.save();
      let pf = 0, ps = 1;
      if (ui) { if (this.uiK !== 1) ctx.scale(this.uiK, this.uiK); pf = setTextFloor(this.textFloor); ps = taps.setSpace(this.uiK); }
      try { this.withUiPointer(sc, () => sc.render(ctx)); } catch (e) { console.error(e); globalThis.__bnReportError?.(e, 'render'); } finally { if (ui) { setTextFloor(pf); taps.setSpace(ps); } }
      ctx.restore();
    }
    // 토스트
    const top = this.top;
    if (this.toasts.length && !top?.hideToasts && !this.toastsDeferred(top) && top?.name !== 'menu') {
      ctx.save();
      try { this.drawToasts(ctx, top); } catch (e) { console.error(e); }
      ctx.restore();
    }
    // 플래시 → 비네트 → 페이드
    if (this.flashFx.a > 0) {
      ctx.globalAlpha = Math.min(1, this.flashFx.a);
      ctx.fillStyle = this.flashFx.color;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.globalAlpha = 1;
    }
    if (this.vignetteFx.a > 0.003) this.drawVignette(ctx);
    if (this.fade.a > 0) {
      ctx.globalAlpha = Math.min(1, this.fade.a);
      ctx.fillStyle = this.fade.color;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.globalAlpha = 1;
    }
    if (this.debug) {
      ctx.fillStyle = '#0f0'; ctx.font = font(12, 400, FONT.body); ctx.textAlign = 'left';
      ctx.fillText(`FPS ${this.fps.toFixed(0)}  ${this.tier}${this.autoQualityOn() ? '(auto)' : ''} ×${this.dpr.toFixed(2)} ui ${this.uiK}  scenes:${this.scenes.map((s) => s.name).join('>')}`, 6, this.viewH - 6);
    }
    if (taps.debug) taps.drawDebug(ctx); // ?debug=taps
    if (this.feelStats) this.publishFeelStats();
  }

  /** 가장자리 비네트: 가운데는 투명, 모서리로 갈수록 진하게 (타원) */
  drawVignette(ctx) {
    const v = this.vignetteFx, vw = this.viewW, vh = this.viewH;
    const key = v.color + '|' + vh;
    if (this._vgKey !== key) {
      const g = ctx.createRadialGradient(0, 0, vh * 0.25, 0, 0, vh * 0.72);
      g.addColorStop(0, rgba(v.color, 0));
      g.addColorStop(0.45, rgba(v.color, 0.25));
      g.addColorStop(1, rgba(v.color, 1));
      this._vgGrad = g; this._vgKey = key;
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, v.a);
    ctx.translate(vw / 2, vh / 2);
    ctx.scale(vw / vh, 1);
    ctx.fillStyle = this._vgGrad;
    ctx.fillRect(-vh / 2 - 2, -vh / 2 - 2, vh + 4, vh + 4);
    ctx.restore();
  }

  /**
   * 토스트 (MASTER_PLAN §1.8, §1.10):
   *  - 화면에 보이는 것이 게임플레이 장면(스테이지·마을·아케이드)의 HUD 이면 — 그 장면이 맨 위이거나, 그 위에 반투명 장면(대화 등)만
   *    있으면 — 그리고 맨 위 장면이 toastX/toastY 를 정하지 않았으면 hudLayout().toast(i) 줄:
   *    15 px, 가운데 빈 칸 폭에서 ≤ 2줄로 줄바꿈 (2줄 토스트는 두 줄 칸을 쓴다), 보이는 줄 수까지 (보통 3, 위쪽 보스 바가 있으면 1)
   *  - 그 밖(월드맵·동료 화면·일시정지처럼 화면 전체를 덮는 장면 등): 장면의 toastX/toastY/toastUp (없으면 가운데 위 y=92), 17 px.
   *    uiScale 장면은 UI 좌표로
   */
  drawToasts(ctx, top) {
    const base = this.hudScene();
    if (base?.world && top.toastX === undefined && top.toastY === undefined && !top.uiScale) {
      const L = hudLayout(base.world, this.viewW, this.viewH);
      const r0 = L?.toastRows >= 1 ? L.toast(0) : null;
      if (r0 && !r0.hidden && r0.w >= 80) { this.drawHudToasts(ctx, L); return; }
    }
    const ui = !!top?.uiScale;
    const k = ui ? this.uiK : 1;
    if (ui && k !== 1) ctx.scale(k, k);
    const vw = this.viewW / k;
    const S = hudSafe(this);
    const y0 = top?.toastY ?? 92 + (S.t || 0) / k, x0 = top?.toastX ?? vw / 2, dy = top?.toastUp ? -30 : 30;
    const minX = 6 + (S.l || 0) / k, maxX = vw - 6 - (S.r || 0) / k;
    ctx.textAlign = 'center';
    ctx.font = font(17, 700, FONT.body);
    // [hook:plat] scene.toastW (장면 좌표 최대 폭): 그 폭 안에서 ≤ 2줄로 줄바꿈하고 상자 중심을 toastX ± toastW/2 안에 둔다 (마을 가게 초상 칸 등)
    const tw = Number(top?.toastW) >= 80 ? Number(top.toastW) : 0;
    if (tw) {
      const lh = 22, lo = Math.max(minX, x0 - tw / 2), hi = Math.min(maxX, x0 + tw / 2);
      const bw = Math.max(80, Math.min(tw, hi - lo));   // 화면 가장자리에 잘린 칸이면 그 폭으로 줄바꿈 (글자가 상자 밖으로 나가지 않게)
      let yb = y0, prevH = 0;
      this.toasts.forEach((t, i) => {
        t.shown = true;
        const lines = this.wrapToast(ctx, t, bw - 36, 17, 2);
        const h = 28 + (lines.length - 1) * lh;
        if (i > 0) yb = dy > 0 ? yb + prevH + 2 : yb - h - 2;
        prevH = h;
        const a = Math.min(1, t.t * 3, (t.max - t.t) * 6);
        if (a <= 0) return;
        ctx.globalAlpha = a;
        const w = Math.min(bw, t._ww + 36);
        const x = clamp(x0, lo + w / 2, hi - w / 2);
        ctx.fillStyle = 'rgba(10,4,12,0.78)';
        ctx.fillRect(x - w / 2, yb - 20, w, h);
        ctx.strokeStyle = 'rgba(200,160,90,0.6)';
        ctx.strokeRect(x - w / 2 + 0.5, yb - 19.5, w - 1, h - 1);
        ctx.fillStyle = t.color;
        for (let j = 0; j < lines.length; j++) ctx.fillText(lines[j], x, yb + j * lh);
      });
      return;
    }
    this.toasts.forEach((t, i) => {
      t.shown = true;
      const a = Math.min(1, t.t * 3, (t.max - t.t) * 6);
      if (a <= 0) return;
      ctx.globalAlpha = a;
      const y = y0 + i * dy;
      const text = this.fitLine(ctx, t, maxX - minX - 36, 17);
      const w = t._fw + 36;
      const x = clamp(x0, minX + w / 2, maxX - w / 2); // 줄이 한쪽으로 치우쳐도 화면 밖으로 잘리지 않게
      ctx.fillStyle = 'rgba(10,4,12,0.78)';
      ctx.fillRect(x - w / 2, y - 20, w, 28);
      ctx.strokeStyle = 'rgba(200,160,90,0.6)';
      ctx.strokeRect(x - w / 2 + 0.5, y - 19.5, w - 1, 27);
      ctx.fillStyle = t.color;
      ctx.fillText(text, x, y);
    });
  }
  /** 한 줄 토스트 문자열 (너무 길면 … 로 자른다). t._fw = 그린 폭. 폭·글꼴 세대가 같으면 다시 재지 않는다 */
  fitLine(ctx, t, maxW, size) {
    const key = `${size}|${Math.round(maxW)}|${fontEpoch}`;
    if (t._fk !== key) {
      t._fk = key;
      t._line = ellipsize(ctx, t.text, maxW);
      t._fw = ctx.measureText(t._line).width;
    }
    return t._line;
  }
  /**
   * 스테이지·마을 토스트: hudLayout().toast(i) 줄. 한 줄에 들어가면 한 줄, 아니면 아래 줄 칸까지 두 줄 (두 칸이 겹치는 가로 범위 안).
   * 아래 줄 칸이 아직 앞 토스트 차지면 그 토스트가 사라질 때까지 기다린다 (보이지 않는 동안 시간도 멈춤).
   * 줄이 하나뿐인 배치(위쪽 보스 바)나 아래 칸이 너무 좁은 배치에서는 한 줄로 줄인다 (… ).
   */
  drawHudToasts(ctx, L) {
    const rows = L.toastRows;
    const size = 15, pad = 24;
    ctx.textAlign = 'center';
    ctx.font = font(size, 700, FONT.body);
    let r = 0;
    for (const t of this.toasts) {
      if (r >= rows) { t.shown = false; continue; }
      const r0 = L.toast(r);
      if (r0.hidden || r0.w < 80) { t.shown = false; r = rows; continue; }
      const r1 = r + 1 < rows ? L.toast(r + 1) : null;
      const pair = !!r1 && !r1.hidden && r1.w >= 80;
      let lft = r0.l, rgt = r0.r, lines;
      if (rows < 2 || this.toastWidth(ctx, t, size) <= r0.w - pad) lines = this.wrapToast(ctx, t, r0.w - pad, size, 1);
      else if (pair) { lft = Math.max(r0.l, r1.l); rgt = Math.min(r0.r, r1.r); lines = this.wrapToast(ctx, t, rgt - lft - pad, size, 2); }
      else if (r > 0 && r + 1 >= rows) { t.shown = false; r = rows; continue; } // 두 줄 칸이 날 때까지 기다린다
      else lines = this.wrapToast(ctx, t, r0.w - pad, size, 1);
      const cx = (lft + rgt) / 2;
      const w = Math.min(rgt - lft, t._ww + pad);
      t.shown = true;
      const a = Math.min(1, t.t * 3, (t.max - t.t) * 6);
      if (a > 0) {
        ctx.globalAlpha = a;
        const top = r0.top + 2, h = lines.length * r0.h - 4;
        ctx.fillStyle = 'rgba(10,4,12,0.8)';
        ctx.fillRect(cx - w / 2, top, w, h);
        ctx.strokeStyle = 'rgba(200,160,90,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - w / 2 + 0.5, top + 0.5, w - 1, h - 1);
        ctx.fillStyle = t.color;
        for (let j = 0; j < lines.length; j++) ctx.fillText(lines[j], cx, r0.y + j * r0.h);
      }
      r += lines.length;
    }
  }
  /** 토스트 전체 문자열 한 줄 폭 (지금 ctx.font; 크기·글꼴 세대별로 한 번만 잰다) */
  toastWidth(ctx, t, size) {
    const key = `${size}|${fontEpoch}`;
    if (t._mk !== key) { t._mk = key; t._mw = ctx.measureText(t.text.replace(/\n/g, ' ')).width; }
    return t._mw;
  }
  /** HUD 토스트 줄바꿈 (≤ maxLines 줄, 넘치면 마지막 줄 … ). t._ww = 가장 긴 줄 폭. 같은 폭·글꼴 세대면 다시 재지 않는다 */
  wrapToast(ctx, t, maxW, size, maxLines) {
    const key = `${maxLines}|${size}|${Math.round(maxW)}|${fontEpoch}`;
    if (t._wk === key) return t._lines;
    const fnt = ctx.font;
    let lines = wrap(ctx, t.text, Math.max(20, maxW), size, 700, FONT.body).filter((s) => s.length);
    ctx.font = fnt;
    if (!lines.length) lines = [''];
    if (lines.length > maxLines) {
      const head = lines.slice(0, maxLines - 1);
      const rest = lines.slice(maxLines - 1).join(' ');
      lines = [...head, ellipsize(ctx, rest, maxW)];
    }
    t._wk = key; t._lines = lines;
    t._ww = Math.max(...lines.map((s) => ctx.measureText(s).width));
    return lines;
  }
}

/**
 * 지연 장면이 아직 오지 않았을 때 그 자리를 지키는 장면 (R1-REQ-229). game.make() 가 만들고 이름은 'loading'.
 * 장면이 도착하면 game._swapPending 이 제자리에서 진짜 장면으로 바꾼다 (enter 에 같은 params). go 로 온 자리는 화면 전체를 덮고,
 * push 로 온 자리는 아래 장면 위에 반투명하게 뜬다. 취소: push 자리는 닫고, 바닥 자리는 타이틀로. 실패하면 확인·탭으로 다시 시도.
 */
class PendingScene extends Scene {
  constructor(game, name) {
    super(game);
    this.pendingFor = name; this.params = {};
    this.uiScale = true; this.hidePad = true; this.hideToasts = true;
  }
  enter(params) {
    this.params = params ?? {};
    this.opaque = this.game.scenes.indexOf(this) <= 0;
  }
  update() {
    const g = this.game;
    if (g.registry[this.pendingFor] || !g.scenesPending) { g._swapPending(this); return; }
    if (g._lazy?.err && (input.pressed('confirm') || input.pointer.tapped)) { g.retryScenes(); return; }
    if (input.pressed('cancel')) {
      if (g.scenes.indexOf(this) > 0) g.pop();
      else if (g.registry.title) g.go('title', {}, { fade: false });
    }
  }
  render(ctx) {
    const g = this.game, W = g.uiW, H = g.uiH;
    ctx.fillStyle = this.opaque ? '#07030a' : 'rgba(7,3,10,0.6)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, err = !!g._lazy?.err;
    if (!err) { // 도는 핏빛 고리 (그라데이션 없음)
      const a = (this.t * 5) % (Math.PI * 2);
      ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(120,20,30,0.45)';
      ctx.beginPath(); ctx.arc(cx, cy - 18, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#d8323c';
      ctx.beginPath(); ctx.arc(cx, cy - 18, 16, a, a + 1.9); ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = err ? '#ff9a90' : '#e8d8c0';
    ctx.font = font(18, 700, FONT.body);
    ctx.fillText(err ? '불러오기에 실패했습니다' : '불러오는 중…', cx, cy + 24);
    if (err) {
      ctx.fillStyle = '#a89880';
      ctx.font = font(14, 500, FONT.body);
      ctx.fillText('화면을 누르거나 확인 버튼을 누르면 다시 시도합니다', cx, cy + 50);
    }
  }
}

/** 번쩍임·비네트가 초당 줄어드는 양: 0·음수·NaN·null(대본 데이터 등)이면 화면이 덮인 채 남으므로 기본값, 너무 느리면 0.25/초까지 */
function fadeRate(d, dflt) {
  const n = Number(d);
  return d != null && Number.isFinite(n) && n > 0 ? Math.max(0.25, n) : dflt;
}

/**
 * 글자 하한이 바뀌었다(설정 '글자 크기'·화면 크기): 글자를 구워 둔 캐시(메뉴 Layer·PixLayer·피 글씨·줄바꿈 등)를 모두 다시 굽게 한다.
 * 늦게 도착한 웹 글꼴과 같은 길 — ui.fontEpoch 가 오르면 캐시 키가 바뀐다. ui.js 가 bumpFontEpoch 를 내보내면 그것을, 아니면
 * 그 함수가 듣는 document.fonts 'loadingdone' 을 보낸다 (글꼴 목록이 없는 이벤트 = 피 글씨 캐시 전체를 비운다)
 */
function bumpTextCaches() {
  try {
    if (typeof UI.bumpFontEpoch === 'function') UI.bumpFontEpoch();
    else document.fonts?.dispatchEvent?.(new Event('loadingdone'));
  } catch { /* 문서 없음(노드 도구) */ }
}

/** str 이 maxW 를 넘으면 뒤를 잘라 … 를 붙인다 (지금 ctx.font 로 잰다) */
function ellipsize(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str;
  let lo = 0, hi = str.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(str.slice(0, mid).trimEnd() + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return str.slice(0, lo).trimEnd() + '…';
}

export const game = new Game();
