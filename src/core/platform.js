// 플랫폼 셸 — owner: PLAT-BOOT (platform.md §6.1 안전 영역, §6.6 전체 화면·방향·화면 꺼짐 방지·커서, §6.7, §9.3 서비스 워커;
// P-21 · P-22 · P-23 · P-27 · P-30; MASTER_PLAN §1.10, §1.20)
//
// ── 계약 (W0 스텁에 있던 네 가지는 이름 그대로 import 해도 된다) ──
//  safeInsets() → {l,r,t,b}  안전 영역 여백. 단위는 CSS px (window.innerWidth 와 같은 단위, 기기 px 아님).
//                            env(safe-area-inset-*) 측정값과 안드로이드 앱 브리지 window.__BN_INSETS 의 칸별 최댓값.
//                            게임 논리 px 로 바꾸는 것(÷ cssScale)은 game.js 몫이다. 창 크기가 바뀌면 다음 호출 때 다시 잰다 (값은 복사본)
//  initPlatform(game)         main.js 가 game.init 뒤에 한 번 부른다. game.platform = 이 파일의 API 묶음
//  onUpdateReady(cb) → off()  새 버전(대기 중인 서비스 워커)이 준비되면 cb({ apply }) — 이미 준비돼 있으면 곧바로(비동기) 한 번 부른다
//  isStandalone() → bool      설치된 앱으로 실행 중 (PWA standalone/fullscreen, iOS 홈 화면, 안드로이드 APK)
// ── 새 내보내기 (R6: 다른 패키지는 import * as platform … platform.x?.() 로 부른다) ──
//  onInsetsChange(cb) → off()          안전 영역이 바뀔 때 cb({l,r,t,b}) (회전, 앱 브리지 'bn-insets')
//  safeRect() → {x,y,w,h,insets}       settings.safeArea('fit' | 'full')에 맞춰 캔버스가 들어갈 CSS px 사각형 (full = 창 전체)
//  isApp() / isIOS() / isAndroid() / isAndroidWeb()   (isAndroidWeb: 안드로이드 브라우저, 앱·설치 PWA 아님 → 'APK 받기' 안내용)
//  fullscreenAvailable() → bool         ⛶ 를 보여 줄지 (전체 화면 API 가 있고, APK·설치 앱·아이폰이 아님)
//  isFullscreen() / toggleFullscreen() / enterFullscreen() / exitFullscreen()   (enter/toggle 은 사용자 입력 처리 중에 불러야 한다)
//  applyUpdate()                        대기 중인 새 버전 적용 (SKIP_WAITING 보내고 새로고침). updateReady() → bool
//  audioHint() → bool, AUDIO_HINT_TEXT  컨트롤러만 쓰는 중인데 소리가 아직 잠겨 있다 (타이틀 안내, P-23)
//  a2hsHint() → bool, dismissA2hs(), A2HS_TEXT   아이폰 사파리 '홈 화면에 추가' 안내 카드 (한 번 닫으면 meta.a2hsSeen)
//  requestPersist() → Promise<bool>     저장공간 영구 보존 요청 (첫 슬롯 저장 뒤 자동으로 한 번)
//  registerServiceWorker()              initPlatform 이 페이지 load 뒤 자동 호출 (https 또는 localhost, ?nosw·APK·아티팩트 제외)
// ── 장면 플래그 (선택) ──
//  scene.keepAwake = true | false   화면 꺼짐 방지를 장면이 직접 정한다 (없으면 WAKE_SCENES 기준)
//  scene.hideCursor = true | false  2초 동안 마우스를 안 움직이면 커서를 숨길지 (없으면 CURSOR_SCENES 기준)
// ── game 쪽에서 쓰는 것 ──  game.top(.name), game.settings(keepAwake, fullscreenAuto, safeArea), game.meta, game.saves,
//  game.input(.mode | .touchMode), game.audio(.ctx), game.canvas, game.toast(), game.resize(), game.dirty (다시 그려야 할 때 true 로 둔다)
import { bus } from './events.js';

const W = typeof window !== 'undefined' ? window : null;
const D = typeof document !== 'undefined' ? document : null;
const NAV = typeof navigator !== 'undefined' ? navigator : null;
const UA = NAV?.userAgent || '';
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const AUDIO_HINT_TEXT = '소리를 켜려면 화면을 클릭하거나 아무 키나 누르세요';
export const A2HS_TEXT = '홈 화면에 추가하면 전체 화면으로 즐길 수 있어요 (공유 → 홈 화면에 추가)';
export const UPDATE_READY_TEXT = '새 버전이 준비되었습니다';
const UPDATE_LATER_TEXT = '새 버전은 타이틀 화면에서 적용됩니다';
const STORAGE_TIP_TEXT = '브라우저 저장공간은 지워질 수 있어요. 계정 저장(클라우드)이나 저장 코드로 백업하세요';

// 게임플레이·게임 진행 중 장면: 화면 꺼짐 방지 (타이틀·결과 화면에서는 풀어 준다, §6.6)
const PAD_SCENES = ['stage', 'hub', 'bossrush', 'survival', 'practice', 'ultCutin'];
const WAKE_SCENES = new Set([
  ...PAD_SCENES, 'awakenCutin', 'bossIntro', 'dialogue', 'document', 'gameover', 'pause', 'menu', 'arcadePause', 'companionJoin',
  'story', 'worldmap', 'inn', 'shop', 'smith', 'church', 'questboard', 'party', 'stable',
  'minigame_dice', 'minigame_blackjack', 'minigame_slot', 'minigame_duel', 'minigame_memory',
]);
// 마우스를 안 쓰는 장면: 2초 뒤 커서 숨김 (P-30)
const CURSOR_SCENES = new Set([...PAD_SCENES, 'awakenCutin', 'bossIntro']);
const CURSOR_IDLE_MS = 2000;
const TICK_MS = 500;
const SW_UPDATE_EVERY = 30 * 60 * 1000;

let G = null;
let inited = false;
const call = (fn, ...a) => { try { return fn?.(...a); } catch (e) { console.error(e); return undefined; } };

// ───────────────────────── 기기·실행 환경 ─────────────────────────
/** 안드로이드 앱(APK) 안에서 실행 중 (android/app/src/main/assets/app/head_inject.html 이 __BN_APP 을 넣는다) */
export function isApp() { return !!W?.__BN_APP; }
export function isIOS() {
  return /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && (NAV?.maxTouchPoints ?? 0) > 1);
}
export function isAndroid() { return /Android/i.test(UA); }
const mq = (q) => { try { return !!W?.matchMedia?.(q).matches; } catch { return false; } };
/** 설치된 앱으로 실행 중 (브라우저 전체 화면 API 로 들어간 전체 화면은 아니다) */
export function isStandalone() {
  if (!W) return false;
  if (isApp() || NAV?.standalone === true) return true;
  if (mq('(display-mode: standalone)') || mq('(display-mode: minimal-ui)')) return true;
  // 크롬은 전체 화면 API 로 들어가도 display-mode: fullscreen 이 맞으므로 그 경우는 뺀다
  return mq('(display-mode: fullscreen)') && !fsElement();
}
/** 안드로이드 브라우저 (APK 안내 '안드로이드 앱(APK) 받기' 를 보여 줄 곳) */
export function isAndroidWeb() { return isAndroid() && !isStandalone(); }

// ───────────────────────── 안전 영역 (§6.1) ─────────────────────────
const ZERO = Object.freeze({ l: 0, r: 0, t: 0, b: 0 });
let probe = null;
let insets = ZERO, insetsKey = '0,0,0,0', insetsDirty = true, sizeAt = '';
const insetFns = new Set();
const clampInset = (v) => { const n = +v; return Number.isFinite(n) && n > 0 ? Math.min(n, 400) : 0; };
const sizeKey = () => (W ? `${W.innerWidth}x${W.innerHeight}:${W.screen?.orientation?.type || ''}` : '');

/** env(safe-area-inset-*) 를 숨은 요소의 padding 으로 잰다 (getComputedStyle 이 px 로 풀어 준다) */
function envInsets() {
  if (!D?.body || typeof getComputedStyle === 'undefined') return ZERO;
  if (!probe || !probe.isConnected) {
    probe = D.createElement('div');
    probe.id = 'bn-safe-probe';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;'
      + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    D.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return { l: clampInset(parseFloat(cs.paddingLeft)), r: clampInset(parseFloat(cs.paddingRight)), t: clampInset(parseFloat(cs.paddingTop)), b: clampInset(parseFloat(cs.paddingBottom)) };
}
/** 앱 브리지 값 (APK: WindowInsets → CSS px, platform §9.4) */
function bridgeInsets() {
  const b = W?.__BN_INSETS;
  if (!b || typeof b !== 'object') return ZERO;
  return { l: clampInset(b.l), r: clampInset(b.r), t: clampInset(b.t), b: clampInset(b.b) };
}
/** 다시 재고, 바뀌었으면 true */
function measureInsets() {
  const e = envInsets(), a = bridgeInsets();
  const r2 = (v) => Math.round(v * 100) / 100;
  const n = { l: r2(Math.max(e.l, a.l)), r: r2(Math.max(e.r, a.r)), t: r2(Math.max(e.t, a.t)), b: r2(Math.max(e.b, a.b)) };
  insetsDirty = false; sizeAt = sizeKey();
  const key = `${n.l},${n.r},${n.t},${n.b}`;
  if (key === insetsKey) return false;
  insetsKey = key; insets = Object.freeze(n);
  writeInsetVars();
  return true;
}
/** DOM 오버레이(회전 안내, 계정 입력 칸 등)가 쓸 수 있게 :root 에 --bn-safe-l/r/t/b 를 적는다 */
function writeInsetVars() {
  const st = D?.documentElement?.style;
  if (!st) return;
  st.setProperty('--bn-safe-l', insets.l + 'px'); st.setProperty('--bn-safe-r', insets.r + 'px');
  st.setProperty('--bn-safe-t', insets.t + 'px'); st.setProperty('--bn-safe-b', insets.b + 'px');
}
export function safeInsets() {
  if (!W) return { ...ZERO };
  if (insetsDirty || sizeKey() !== sizeAt) measureInsets();
  return { l: insets.l, r: insets.r, t: insets.t, b: insets.b };
}
export function onInsetsChange(cb) { insetFns.add(cb); return () => insetFns.delete(cb); }
/** settings.safeArea 에 맞춘, 캔버스가 들어갈 CSS px 사각형 */
export function safeRect() {
  const iw = W?.innerWidth ?? 0, ih = W?.innerHeight ?? 0;
  const i = G?.settings?.safeArea === 'full' ? { ...ZERO } : safeInsets();
  return { x: i.l, y: i.t, w: Math.max(1, iw - i.l - i.r), h: Math.max(1, ih - i.t - i.b), insets: i };
}
/** 안전 영역이 창 크기 변화 없이 바뀌었을 수 있을 때 (앱 브리지, 회전 직후) */
function recheckInsets(forceResize = false) {
  const changed = measureInsets();
  if (!changed && !forceResize) return;
  if (G) { G.dirty = true; call(() => G.resize?.()); }
  if (changed) for (const fn of [...insetFns]) call(fn, safeInsets());
}

// ───────────────────────── 전체 화면·방향 (§6.6, P-21) ─────────────────────────
function fsElement() { return D ? (D.fullscreenElement || D.webkitFullscreenElement || null) : null; }
function fsApi() {
  if (!D?.documentElement) return false;
  const el = D.documentElement;
  return !!(D.fullscreenEnabled || D.webkitFullscreenEnabled) && typeof (el.requestFullscreen || el.webkitRequestFullscreen) === 'function';
}
export function isFullscreen() { return !!fsElement(); }
/** ⛶ 를 보여 줄지: 전체 화면 API 가 있고 APK·설치된 앱이 아니다 (아이폰 사파리는 API 가 없어 false) */
export function fullscreenAvailable() { return fsApi() && !isApp() && !isStandalone(); }
function lockLandscape() {
  // 방향 고정은 전체 화면에서만 되고, 지원하지 않는 기기(데스크톱·iOS)는 거부된 Promise 를 돌려준다 → 조용히 무시
  if (!isTouchLike()) return;
  try { W.screen?.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* 무시 */ }
}
/** 전체 화면 켜기. 사용자 입력(탭·클릭·키) 처리 중에만 된다. 반환: 켜졌으면 true */
export function enterFullscreen() {
  if (!fsApi() || isFullscreen()) return Promise.resolve(isFullscreen());
  const el = D.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  let p;
  try { p = req.call(el, { navigationUI: 'hide' }); } catch { return Promise.resolve(false); }
  return Promise.resolve(p).then(() => { lockLandscape(); return true; }, () => false);
}
export function exitFullscreen() {
  if (!isFullscreen()) return Promise.resolve(true);
  try {
    const ex = D.exitFullscreen || D.webkitExitFullscreen;
    return Promise.resolve(ex?.call(D)).then(() => true, () => false);
  } catch { return Promise.resolve(false); }
}
export function toggleFullscreen() { return isFullscreen() ? exitFullscreen() : enterFullscreen(); }
function isTouchLike() {
  const m = G?.input?.mode;
  if (m) return m === 'touch';
  return !!G?.input?.touchMode || mq('(pointer: coarse)');
}
/** 첫 탭에 전체 화면 (settings.fullscreenAuto; 안드로이드 웹, 타이틀 화면에서 한 번) */
let fsAutoTried = false;
function onFirstTap(e) {
  if (fsAutoTried || !G || (e.pointerType && e.pointerType === 'mouse')) return;
  if (G.top?.name !== 'title') return;
  fsAutoTried = true;
  if (G.settings?.fullscreenAuto === false || !isAndroid() || !fullscreenAvailable() || isFullscreen()) return;
  enterFullscreen();
}
function syncFsButton() {
  D?.documentElement?.classList.toggle('bn-nofs', !fullscreenAvailable());
  D?.documentElement?.classList.toggle('bn-fs', isFullscreen());
}

// ───────────────────────── 화면 꺼짐 방지 (P-22) ─────────────────────────
let wake = null, wakeBusy = false, wakeDenied = false;
function wakeWanted() {
  if (!G || !D || D.hidden) return false;
  if (G.settings?.keepAwake === false) return false;
  const top = G.top;
  if (!top) return false;
  if (typeof top.keepAwake === 'boolean') return top.keepAwake;
  return WAKE_SCENES.has(top.name);
}
function syncWake() {
  const api = NAV?.wakeLock;
  if (!api?.request) return;
  const want = wakeWanted();
  if (want && !wake && !wakeBusy && !wakeDenied) {
    wakeBusy = true;
    let p;
    try { p = api.request('screen'); } catch { wakeBusy = false; wakeDenied = true; return; }
    Promise.resolve(p).then((s) => {
      wakeBusy = false;
      if (!s) return;
      wake = s;
      s.addEventListener?.('release', () => { if (wake === s) wake = null; });
      if (!wakeWanted()) releaseWake();
    }, () => { wakeBusy = false; wakeDenied = true; }); // 권한 없음·배터리 절약 등: 다음 화면 전환/복귀 때 다시 시도
  } else if (!want && wake) releaseWake();
}
function releaseWake() {
  const s = wake; wake = null;
  try { s?.release?.()?.catch?.(() => {}); } catch { /* 무시 */ }
}

// ───────────────────────── 커서 숨김 (P-30) ─────────────────────────
let lastMouse = 0, cursorHidden = false, mouseDown = false;
function cursorWanted() {
  if (!G) return false;
  const top = G.top;
  if (!top || mouseDown) return false;
  const on = typeof top.hideCursor === 'boolean' ? top.hideCursor : CURSOR_SCENES.has(top.name);
  return on && now() - lastMouse > CURSOR_IDLE_MS;
}
function setCursorHidden(on) {
  if (cursorHidden === on) return;
  cursorHidden = on;
  D?.documentElement?.classList.toggle('bn-nocursor', on);
  if (G?.canvas?.style) G.canvas.style.cursor = on ? 'none' : '';
}

// ───────────────────────── 소리 잠금 안내 (P-23) · 홈 화면 추가 안내 (§6.6) ─────────────────────────
/** 컨트롤러만 쓰는 중이고 소리가 아직 잠겨 있다 (게임패드 입력은 사용자 활성화가 아니라서 소리를 켤 수 없다). APK 는 해당 없음 */
export function audioHint() {
  if (!G || isApp()) return false;
  if (G.input?.mode !== 'pad') return false;
  const ctx = G.audio?.ctx;
  return !ctx || ctx.state !== 'running';
}
/** 아이폰 사파리처럼 전체 화면 API 가 없는 iOS 브라우저: '홈 화면에 추가' 안내 카드를 한 번 보여 준다 */
export function a2hsHint() {
  if (!G || !isIOS() || fsApi() || isStandalone()) return false;
  return !G.meta?.a2hsSeen;
}
export function dismissA2hs() {
  if (!G?.meta) return;
  G.meta.a2hsSeen = true;
  call(() => G.saves?.saveMeta?.(G.meta));
}

// ───────────────────────── 저장공간 보존 (§9.3 Storage) ─────────────────────────
let persistAsked = false, storageTipPending = false;
/** navigator.storage.persist() — 이미 보존 중이면 그대로 true. APK(앱 전용 저장소)·파이어폭스(권한 창이 뜬다)에서는 묻지 않는다 */
export function requestPersist() {
  const st = NAV?.storage;
  if (!st?.persist || isApp() || /Firefox\//.test(UA)) return Promise.resolve(false);
  return Promise.resolve()
    .then(() => (st.persisted ? st.persisted() : false))
    .then((p) => p || st.persist())
    .then((v) => !!v, () => false);
}
function onFirstSave() {
  if (persistAsked) return;
  persistAsked = true;
  requestPersist().then((ok) => {
    // 보존이 안 되는 브라우저(특히 iOS 사파리는 7일 안 쓰면 지운다): 마을에 돌아왔을 때 백업 안내를 한 번
    if (!ok && !isApp() && !isStandalone() && !G?.meta?.storageTipSeen && !G?.cloud?.loggedIn) storageTipPending = true;
  });
}

// ───────────────────────── 서비스 워커 · 새 버전 (§9.3) ─────────────────────────
let swStarted = false, swReg = null, updReady = false, reloading = false, reloadOnChange = false, lastSwCheck = 0, updateToastDone = false;
const updFns = new Set();
function swAllowed() {
  if (!W || !NAV || !('serviceWorker' in NAV) || isApp()) return false;
  if (W.__BN_NOSW || W.__BN_BUILD?.sw === false) return false; // 아티팩트 등 서비스 워커를 쓰지 않는 배포
  if (new URLSearchParams(W.location.search).has('nosw')) return false;
  if (W.location.protocol === 'https:') return true;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(W.location.hostname);
}
/** 페이지 load 뒤 sw.js 등록. ?nosw 면 이미 있는 등록도 지운다 (개발용 스위치) */
export function registerServiceWorker() {
  if (swStarted) return;
  swStarted = true;
  if (!swAllowed()) {
    if (W?.location && new URLSearchParams(W.location.search).has('nosw')) {
      try { NAV?.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister().catch(() => {})), () => {}); } catch { /* 무시 */ }
    }
    return;
  }
  const sw = NAV.serviceWorker;
  sw.addEventListener('controllerchange', () => {
    // 사용자가 [업데이트]를 눌렀을 때만 새로고침한다 (첫 설치의 clients.claim() 으로는 새로고침하지 않는다)
    if (reloadOnChange && !reloading) { reloading = true; W.location.reload(); }
  });
  let p;
  try { p = sw.register('sw.js'); } catch (e) { console.warn('[sw] 등록 실패:', e?.message || e); return; }
  Promise.resolve(p).then((reg) => {
    if (!reg) return;
    swReg = reg; lastSwCheck = now();
    if (reg.waiting && sw.controller) markUpdateReady();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && sw.controller) markUpdateReady(); });
    });
  }, (e) => { console.warn('[sw] 등록 실패:', e?.message || e); });
}
function checkSwUpdate() {
  if (!swReg || now() - lastSwCheck < SW_UPDATE_EVERY) return;
  lastSwCheck = now();
  try { swReg.update?.()?.catch?.(() => {}); } catch { /* 오프라인 등 */ }
}
function markUpdateReady() {
  if (updReady) return;
  updReady = true;
  if (G) G.dirty = true;
  for (const fn of [...updFns]) call(fn, { apply: applyUpdate });
  queueUpdateToast();
}
let updateToastQueued = false;
function queueUpdateToast() { updateToastQueued = true; }
/** 게임 중이면 조용한 토스트 한 번. 타이틀이면 타이틀(onUpdateReady)이 [업데이트] 를 보여 준다 */
function flushUpdateToast() {
  if (!updateToastQueued || updateToastDone || !G?.top) return;
  const onTitle = G.top.name === 'title';
  if (onTitle && updFns.size) { updateToastQueued = false; return; }
  updateToastQueued = false; updateToastDone = true;
  call(() => G.toast?.(onTitle ? `${UPDATE_READY_TEXT} — 새로고침하면 적용됩니다` : UPDATE_LATER_TEXT, '#b8c4d8', 3.2));
}
export function updateReady() { return updReady; }
export function onUpdateReady(cb) {
  if (typeof cb !== 'function') return () => {};
  updFns.add(cb);
  if (updReady) Promise.resolve().then(() => { if (updFns.has(cb)) call(cb, { apply: applyUpdate }); });
  return () => updFns.delete(cb);
}
/** 새 버전 적용: 대기 중인 워커에 SKIP_WAITING → 제어권이 넘어오면 새로고침 (4초 안에 안 넘어와도 새로고침) */
export function applyUpdate() {
  if (reloading || !W) return;
  const w = swReg?.waiting;
  if (!w) { reloading = true; W.location.reload(); return; }
  reloadOnChange = true;
  try { w.postMessage({ type: 'SKIP_WAITING' }); } catch { /* 무시 */ }
  setTimeout(() => { if (!reloading) { reloading = true; W.location.reload(); } }, 4000);
}

// ───────────────────────── 주기 점검 (0.5초) ─────────────────────────
function tick() {
  if (!G) return;
  syncWake();
  setCursorHidden(cursorWanted());
  flushUpdateToast();
  if (storageTipPending && G.top?.name === 'hub' && !(G.toasts?.length)) {
    storageTipPending = false;
    if (G.meta) { G.meta.storageTipSeen = true; call(() => G.saves?.saveMeta?.(G.meta)); }
    call(() => G.toast?.(STORAGE_TIP_TEXT, '#cfc2a8', 5));
  }
}

// ───────────────────────── 초기화 ─────────────────────────
export const api = {
  safeInsets, safeRect, onInsetsChange, isStandalone, isApp, isIOS, isAndroid, isAndroidWeb,
  fullscreenAvailable, isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen,
  onUpdateReady, applyUpdate, updateReady, audioHint, a2hsHint, dismissA2hs, requestPersist,
  AUDIO_HINT_TEXT, A2HS_TEXT, UPDATE_READY_TEXT,
  get audioHintOn() { return audioHint(); },
};

export function initPlatform(game) {
  if (!W || !D) return api;
  G = game || G;
  if (G) G.platform = api;
  if (inited) return api;
  inited = true;
  measureInsets();
  writeInsetVars();

  // 안전 영역: 창 크기 변화는 game.js 가 직접 받는다 (그때 safeInsets() 가 다시 잰다). 앱 브리지·회전 직후 값만 여기서 챙긴다
  W.addEventListener('bn-insets', () => recheckInsets(true));
  W.addEventListener('resize', () => { insetsDirty = true; });
  W.addEventListener('orientationchange', () => { insetsDirty = true; setTimeout(() => recheckInsets(false), 250); });

  // 확대·스크롤 방지 (예전 index.html 인라인 스크립트)
  D.addEventListener('gesturestart', (e) => e.preventDefault());
  D.addEventListener('touchmove', (e) => { if (e.target?.closest?.('#app')) e.preventDefault(); }, { passive: false });

  // 전체 화면: ⛶ 버튼(있으면), Alt+Enter (데스크톱), 첫 탭 자동 (안드로이드 웹)
  D.getElementById('fsBtn')?.addEventListener('click', () => { toggleFullscreen(); });
  W.addEventListener('keydown', (e) => {
    if (!e.altKey || e.repeat || (e.code !== 'Enter' && e.code !== 'NumpadEnter')) return;
    if (!fullscreenAvailable()) return;
    e.preventDefault(); e.stopImmediatePropagation(); // 게임의 '결정' 키로 새지 않게
    toggleFullscreen();
  }, true);
  W.addEventListener('pointerup', onFirstTap, true);
  const onFs = () => { syncFsButton(); if (G) G.dirty = true; };
  D.addEventListener('fullscreenchange', onFs);
  D.addEventListener('webkitfullscreenchange', onFs);
  syncFsButton();

  // 커서: 마우스를 움직이면 바로 다시 보인다
  lastMouse = now();
  W.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { lastMouse = now(); setCursorHidden(false); } }, { passive: true });
  W.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { mouseDown = true; lastMouse = now(); setCursorHidden(false); } wakeDenied = false; }, { passive: true });
  W.addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') { mouseDown = false; lastMouse = now(); } }, { passive: true });

  // 화면 꺼짐 방지: 탭이 숨으면 브라우저가 풀어 주므로 돌아올 때 다시 요청. 새 버전 확인도 이때 (30분마다)
  D.addEventListener('visibilitychange', () => {
    if (D.hidden) { releaseWake(); return; }
    wakeDenied = false; syncWake(); checkSwUpdate();
    if (G) G.dirty = true;
  });
  W.addEventListener('keydown', () => { wakeDenied = false; }, { passive: true, once: true });

  // 첫 슬롯 저장 뒤 저장공간 보존 요청
  try { G?.saves?.onWrite?.((ev) => { if (ev?.type === 'write') onFirstSave(); }); } catch { /* 무시 */ }
  bus.on('stageCleared', onFirstSave);

  setInterval(tick, TICK_MS);

  // 서비스 워커는 첫 화면을 다 받은 뒤 등록한다 (부팅과 대역폭을 다투지 않게)
  if (D.readyState === 'complete') setTimeout(registerServiceWorker, 0);
  else W.addEventListener('load', () => setTimeout(registerServiceWorker, 0), { once: true });
  return api;
}
