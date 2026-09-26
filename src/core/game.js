// 게임 본체: 캔버스/해상도, 고정 타임스텝 루프, 장면(Scene) 스택, 페이드 전환
// 플랫폼 코어 (platform.md §6.1–6.5, P-11/12/13/18/26; feel §4.9; MASTER_PLAN §1.8, §1.10) — owner: PLAT-CORE
//   game.safe {l,r,t,b}     기기 안전 영역 (논리 px; 두 safeArea 모드 모두 기기 인셋 그대로) · game.safeCss (CSS px)
//   game.cssScale           CSS px / 논리 px (캔버스 CSS 높이 / 540) · game.canvasRect {x,y,w,h} 캔버스 CSS 상자
//   game.uiK / uiW / uiH    UI 배율과 그 배율에서의 화면 크기 (scene.uiScale = true 인 장면만 ctx.scale(uiK) 로 그린다)
//   game.tier / quality     실제 품질 등급 'low'|'medium'|'high' (설정 'auto' 는 품질 조절기가 정한다)
//   game.dirty              true 면 다음 rAF 에 틱이 없어도 한 번 그린다 (fpsCap 60 은 틱이 돈 rAF 에서만 그린다)
//   game.syncPad()          가상 패드 표시의 유일한 주인 (touchpad.setVisible)
//   game.flash(color, strength, decay) · game.vignette(color, a, decay) · game.toast(text, color, time)
//   game.pop() 이 마지막 장면이면 타이틀로 (빈 스택 방지)
// 주의 (순환 import): hud_layout.js · touchpad.js 등이 이 파일을 import 한다 → 모듈 최상위에서 import 값에 접근하지 않는다.
import { input } from './input.js';
import { clamp, rgba } from './math.js';
import { font, wrap, FONT, setTextFloor, taps, onFontEpoch } from './ui.js';
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
export const PAD_SCENES = new Set(['stage', 'hub', 'bossrush', 'survival', 'practice', 'ultCutin']);
/** 품질 조절기가 프레임 시간을 재는 장면 (게임플레이만) */
const GOV_SCENES = new Set(['stage', 'hub', 'bossrush', 'survival', 'practice']);
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
const UI_TEXT_FLOOR = 11;               // uiScale 장면을 그리는 동안의 글자 크기 하한
const PAD_HIDE_DELAY = 0.25;            // 입력이 패드·키보드로 바뀐 뒤 가상 패드를 숨기기까지 (초; 터치로 오면 바로 보인다)
const FLASH_CAP = 0.7, FLASH_SOFT = 0.3; // 화면 번쩍임 상한, 1초에 강한 번쩍임이 2번 넘으면 그 뒤의 상한
const ZERO = Object.freeze({ l: 0, r: 0, t: 0, b: 0 });

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
 *                   toastUp: true 면 기준선에서 위로 쌓는다
 *  autoPause()    : 기기를 세로로 돌리거나 탭이 숨겨질 때 호출 (게임플레이 장면이 일시정지 메뉴를 띄움)
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
    this.padShown = false; this._touchAt = -Infinity; this._padErr = false;
    this._ptrK = 1;
    this._tier = 'high';
    // 품질 조절기 상태 (설정 'auto' 일 때만 등급을 바꾼다; 설정값 자체는 쓰지 않는다)
    this.gov = { start: null, tier: null, ema: STEP, slowT: 0, goodT: 0, lastChange: -Infinity, lastRaise: -Infinity, ceil: 2, top: null, toasted: false };
    this._watch = null;
    this._probe = null;
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
  }

  // ─────────────────────────── 화면 배치 (platform §6.1, §6.2, §6.4) ───────────────────────────
  /** 기기 안전 영역 (CSS px): platform.safeInsets() (env() 측정 + APK 브리지) 와 자체 env() 측정 중 큰 값 */
  readInsets() {
    let a = null;
    try { a = safeInsets?.(); } catch { a = null; }
    const b = this.probeEnv();
    const pick = (k) => Math.round(Math.max(0, Number(a?.[k]) || 0, b[k] || 0) * 10) / 10;
    return { l: pick('l'), r: pick('r'), t: pick('t'), b: pick('b') };
  }
  /** CSS env(safe-area-inset-*) 를 숨긴 고정 요소로 잰다 (CSS px) */
  probeEnv() {
    try {
      if (!document.body) return ZERO;
      let d = this._probe;
      if (!d || !d.isConnected) {
        d = document.createElement('div');
        d.setAttribute('aria-hidden', 'true');
        d.style.cssText = 'position:fixed;left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;z-index:-1';
        document.body.appendChild(d);
        this._probe = d;
      }
      const r = d.getBoundingClientRect();
      return { l: Math.max(0, r.left), r: Math.max(0, window.innerWidth - r.right), t: Math.max(0, r.top), b: Math.max(0, window.innerHeight - r.bottom) };
    } catch { return ZERO; }
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
      G.tier = G.start;
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
    taps.cssScale = k; // 탭 최소 크기는 CSS px 로 잰다
    this._ptrK = -1;   // 포인터 변환 다시 맞춤
    for (const sc of this.scenes) sc.resize?.();
    // 세로: 휴대폰(짧은 변 < 600)만 회전 안내 + 자동 일시정지. 태블릿은 세로로도 플레이
    this.portraitAny = H > W;
    this.portrait = this.portraitAny && Math.min(W, H) < 600;
    document.body.classList.toggle('portrait', this.portrait);
    this._watch = this.watchKey();
    this.dirty = true;
  }
  /** 화면 배치에 영향을 주는 설정 (옵션에서 바뀌면 다음 rAF 에 다시 배치) */
  watchKey() {
    const s = this.settings;
    return s ? `${s.quality}|${s.uiScale}|${s.safeArea}` : '';
  }

  /** 맨 위 장면에 자동 일시정지 요청 (세로 회전·백그라운드 전환) */
  autoPause() { try { this.top?.autoPause?.(); } catch (e) { console.error(e); } }

  /**
   * 가상 패드 표시의 유일한 주인 (platform P-18, §5.1). 매 rAF 호출.
   * 보임 = 입력 모드 'touch' (패드·키보드로 바뀌면 0.25초 뒤 숨김) · 세로 잠금 아님 · 맨 위 장면이 showPad 이거나 PAD_SCENES, hidePad 아님.
   * padHideButtons 는 그대로 touchpad 에 넘긴다. 예전 DOM 패드(#touch)가 남아 있으면 input.setPadOff 로도 알린다.
   */
  syncPad() {
    const top = this.top;
    if (this.inputMode === 'touch') this._touchAt = this.realTime;
    const scene = !!top && !top.hidePad && (!!top.showPad || PAD_SCENES.has(top.name)) && !this.portraitLocked;
    const show = scene && this.realTime - this._touchAt < PAD_HIDE_DELAY;
    this.padShown = show;
    try { touchpad.setVisible?.(show, { hideButtons: top?.padHideButtons ?? null }); } catch (e) { if (!this._padErr) { this._padErr = true; console.error(e); } }
    if (typeof document !== 'undefined' && document.getElementById('touch')) input.setPadOff?.(!scene);
  }

  register(name, SceneClass) { this.registry[name] = SceneClass; }

  make(name) {
    const C = this.registry[name];
    if (!C) throw new Error('Unknown scene: ' + name);
    return new C(this);
  }

  get top() { return this.scenes[this.scenes.length - 1]; }

  /** 스택을 비우고 새 장면으로 (페이드 포함) */
  go(name, params = {}, { fade = true, fadeTime = 0.35, color = '#000' } = {}) {
    const doIt = () => {
      while (this.scenes.length) this.scenes.pop().exit();
      const sc = this.make(name);
      sc.name = name;
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
    sc.name = name;
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
      if (this.registry.title) this.go('title');
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
   * 화면 번쩍임 (feel §4.9, 광과민 대책): 세기 × settings.flashFx (0 / 0.5 / 1), 상한 0.7.
   * 최근 1초에 0.3 넘는 번쩍임이 이미 2번 있었으면 그 뒤의 것은 0.3 까지만.
   */
  flash(color = '#fff', strength = 0.8, decay = 4) {
    const k = Number(this.settings?.flashFx ?? 1);
    let a = Math.min(FLASH_CAP, Math.max(0, Number(strength) || 0) * (Number.isFinite(k) ? clamp(k, 0, 1) : 1));
    if (!(a > 0)) return;
    const now = this.realTime, log = this._flashLog;
    while (log.length && now - log[0] > 1) log.shift();
    if (log.length >= 2) a = Math.min(a, FLASH_SOFT);
    if (a > FLASH_SOFT) log.push(now);
    const f = this.flashFx;
    if (a >= f.a) { f.color = color; f.decay = decay; f.a = a; }
  }
  /** 화면 가장자리 비네트 (전체 화면 채우기 대신; 플레이어 피격 '#ff0020', 0.45, 3 등) */
  vignette(color = '#ff0020', a = 0.45, decay = 3) {
    const v = this.vignetteFx;
    const s = clamp(Number(a) || 0, 0, 0.85);
    if (s >= v.a) { v.color = typeof color === 'string' && color[0] === '#' ? color : '#ff0020'; v.decay = decay; v.a = s; }
  }
  toast(text, color = '#f3e2b8', time = 2.4) {
    this.toasts.push({ text: String(text ?? ''), color, t: time, max: time, shown: undefined });
    if (this.toasts.length > 5) this.toasts.shift();
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
      if (this.settings && this.watchKey() !== this._watch) this.resize();
      // 터치 기기를 세로로 돌리면 ('가로 모드로 돌려주세요' 안내가 덮는 동안) 게임 진행을 멈춘다
      const locked = this.portraitLocked;
      if (locked !== this._locked) { this._locked = locked; if (locked) this.autoPause(); else this.dirty = true; }
      this.acc = locked ? 0 : this.acc + dt;
      this.syncPointer();
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.tick(STEP);
        this.acc -= STEP; steps++;
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
    if (!this.top?.deferToasts && this.toasts.length) {
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
      if (ui) { if (this.uiK !== 1) ctx.scale(this.uiK, this.uiK); pf = setTextFloor(UI_TEXT_FLOOR); ps = taps.setSpace(this.uiK); }
      try { this.withUiPointer(sc, () => sc.render(ctx)); } catch (e) { console.error(e); } finally { if (ui) { setTextFloor(pf); taps.setSpace(ps); } }
      ctx.restore();
    }
    // 토스트
    const top = this.top;
    if (this.toasts.length && !top?.hideToasts && !top?.deferToasts && top?.name !== 'menu') {
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
      ctx.fillStyle = '#0f0'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`FPS ${this.fps.toFixed(0)}  ${this.tier}${this.autoQualityOn() ? '(auto)' : ''} ×${this.dpr.toFixed(2)} ui ${this.uiK}  scenes:${this.scenes.map((s) => s.name).join('>')}`, 6, this.viewH - 6);
    }
    if (taps.debug) taps.drawDebug(ctx); // ?debug=taps
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
   *  - world 가 있는 게임플레이 장면(스테이지·마을·아케이드)이 맨 위이고 toastX/toastY 를 정하지 않았으면 hudLayout().toast(i) 줄:
   *    15 px, 가운데 빈 칸 폭에서 ≤ 2줄로 줄바꿈 (2줄 토스트는 두 줄 칸을 쓴다), 보이는 줄 수까지 (보통 3, 위쪽 보스 바가 있으면 1)
   *  - 그 밖: 장면의 toastX/toastY/toastUp (없으면 가운데 위 y=92), 17 px. uiScale 장면은 UI 좌표로
   */
  drawToasts(ctx, top) {
    if (top?.world && top.toastX === undefined && top.toastY === undefined && !top.uiScale) {
      const L = hudLayout(top.world, this.viewW, this.viewH);
      if (L?.toastRows >= 1) { this.drawHudToasts(ctx, L); return; }
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
    this.toasts.forEach((t, i) => {
      t.shown = true;
      const a = Math.min(1, t.t * 3, (t.max - t.t) * 6);
      if (a <= 0) return;
      ctx.globalAlpha = a;
      const y = y0 + i * dy;
      const text = this.fitLine(ctx, t, maxX - minX - 36, 17);
      const w = t._tw + 36;
      const x = clamp(x0, minX + w / 2, maxX - w / 2); // 줄이 한쪽으로 치우쳐도 화면 밖으로 잘리지 않게
      ctx.fillStyle = 'rgba(10,4,12,0.78)';
      ctx.fillRect(x - w / 2, y - 20, w, 28);
      ctx.strokeStyle = 'rgba(200,160,90,0.6)';
      ctx.strokeRect(x - w / 2 + 0.5, y - 19.5, w - 1, 27);
      ctx.fillStyle = t.color;
      ctx.fillText(text, x, y);
    });
  }
  /** 한 줄 토스트 문자열 (너무 길면 … 로 자른다). t._tw = 그린 폭. 폭이 같으면 다시 재지 않는다 */
  fitLine(ctx, t, maxW, size) {
    const key = `1|${size}|${Math.round(maxW)}`;
    if (t._fk !== key) {
      t._fk = key;
      t._line = ellipsize(ctx, t.text, maxW);
      t._tw = ctx.measureText(t._line).width;
    }
    return t._line;
  }
  drawHudToasts(ctx, L) {
    const rows = L.toastRows;
    const size = 15;
    ctx.textAlign = 'center';
    ctx.font = font(size, 700, FONT.body);
    let r = 0;
    for (const t of this.toasts) {
      if (r >= rows) { t.shown = false; continue; }
      const r0 = L.toast(r);
      if (r0.hidden || r0.w < 80) { t.shown = false; r = rows; continue; }
      // 2줄이면 다음 줄 칸도 쓴다: 두 칸이 겹치는 가로 범위 안에서. 줄이 하나뿐인 배치(위쪽 보스 바)면 한 줄로 줄인다
      const r1 = r + 1 < rows ? L.toast(r + 1) : null;
      const pair = !!r1 && !r1.hidden && r1.w >= 80;
      const lft = pair ? Math.max(r0.l, r1.l) : r0.l, rgt = pair ? Math.min(r0.r, r1.r) : r0.r;
      const lines = this.wrapToast(ctx, t, rgt - lft - 24, size, rows >= 2 ? 2 : 1);
      if (lines.length > 1 && !pair) { t.shown = false; r = rows; continue; } // 두 줄 칸이 날 때까지 기다린다 (시간도 멈춤)
      const useL = lines.length > 1 ? lft : r0.l, useR = lines.length > 1 ? rgt : r0.r;
      const cx = (useL + useR) / 2;
      const w = Math.min(useR - useL, t._tw + 24);
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
  /** HUD 토스트 줄바꿈 (≤ maxLines 줄, 넘치면 마지막 줄 … ). t._tw = 가장 긴 줄 폭. 같은 폭이면 다시 재지 않는다 */
  wrapToast(ctx, t, maxW, size, maxLines) {
    const key = `${maxLines}|${size}|${Math.round(maxW)}`;
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
    t._tw = Math.max(...lines.map((s) => ctx.measureText(s).width));
    return lines;
  }
}

/** str 이 maxW 를 넘으면 뒤를 잘라 … 를 붙인다 (force: 이미 잘린 문장 — 맞아도 … 를 붙일지 판단하지 않고 폭만 맞춘다) */
function ellipsize(ctx, str, maxW, force = false) {
  if (ctx.measureText(str).width <= maxW) return str;
  let lo = 0, hi = str.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(str.slice(0, mid).trimEnd() + '…').width <= maxW) lo = mid; else hi = mid - 1;
  }
  return force || lo < str.length ? str.slice(0, lo).trimEnd() + '…' : str;
}

export const game = new Game();
