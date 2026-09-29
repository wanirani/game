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
//  fullscreenAvailable() / canFullscreen() → bool   ⛶ 를 보여 줄지 (전체 화면 API 가 있고, APK·설치 앱·아이폰이 아님)
//  isFullscreen() / toggleFullscreen() / enterFullscreen() / exitFullscreen()   (enter/toggle 은 사용자 입력 처리 중에 불러야 한다)
//  applyUpdate()                        대기 중인 새 버전 적용 (SKIP_WAITING 보내고 새로고침). updateReady() → bool
//  audioHint() → bool, AUDIO_HINT_TEXT  컨트롤러만 쓰는 중인데 소리가 아직 잠겨 있다 (타이틀 안내, P-23)
//  a2hsHint() → bool, dismissA2hs(), A2HS_TEXT   아이폰 사파리 '홈 화면에 추가' 안내 카드 (한 번 닫으면 meta.tips.a2hs, MASTER_PLAN §1.6)
//  requestPersist() → Promise<bool>     저장공간 영구 보존 요청 (첫 슬롯 저장 뒤 자동으로 한 번)
//  registerServiceWorker()              initPlatform 이 페이지 load 뒤 자동 호출 (https 또는 localhost, ?nosw·APK·아티팩트 제외)
//  backGuard() → { on, armed }          웹 뒤로 가기 센티널 상태 (§5.6, PS-02). 브라우저·설치형 PWA 의 뒤로 가기(제스처)는
//                                       게임을 떠나지 않고 APK 뒤로 버튼(MainActivity.onGameBack)과 같게 동작한다:
//                                       타이틀 첫 화면이면 '한 번 더 누르면 나갑니다' 안내 뒤 두 번째에 떠나고, 그 밖에는 Escape
//                                       (게임플레이 = 일시정지 메뉴, 메뉴·겹친 화면 = 닫기/취소). APK·틀(iframe) 안에서는 쓰지 않는다
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
// MediaQueryList 는 한 번 만들어 두고 .matches(실시간 값)만 읽는다: touchpad.js 가 매 프레임 canFullscreen() 을 묻는다
const MQL = new Map();
const mq = (q) => {
  try {
    let l = MQL.get(q);
    if (l === undefined) { l = W?.matchMedia?.(q) || null; MQL.set(q, l); }
    return !!l?.matches;
  } catch { return false; }
};
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
let insets = ZERO, insetsKey = '0,0,0,0', insetsDirty = true, sizeAt = '', insetsNotify = false;
const insetFns = new Set();
// 한 변의 여백은 그 축 창 크기의 1/4 까지 (실제 기기는 7 % 안팎; 잘못된 브리지 값이 캔버스를 찌그러뜨리지 않게)
const clampInset = (v, axis) => {
  const n = +v;
  if (!(Number.isFinite(n) && n > 0)) return 0;
  const dim = axis === 'y' ? W?.innerHeight : W?.innerWidth;
  return Math.min(n, dim > 0 ? dim / 4 : 400);
};
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
  return { l: clampInset(parseFloat(cs.paddingLeft), 'x'), r: clampInset(parseFloat(cs.paddingRight), 'x'), t: clampInset(parseFloat(cs.paddingTop), 'y'), b: clampInset(parseFloat(cs.paddingBottom), 'y') };
}
/** 앱 브리지 값 (APK: WindowInsets → CSS px, platform §9.4) */
function bridgeInsets() {
  const b = W?.__BN_INSETS;
  if (!b || typeof b !== 'object') return ZERO;
  return { l: clampInset(b.l, 'x'), r: clampInset(b.r, 'x'), t: clampInset(b.t, 'y'), b: clampInset(b.b, 'y') };
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
  // 누가 다시 쟀든(game.resize 안의 safeInsets() 포함) 구독자에게 한 번 알린다 (마이크로태스크: resize 도중에 부르지 않게)
  if (insetFns.size && !insetsNotify) {
    insetsNotify = true;
    Promise.resolve().then(() => { insetsNotify = false; const v = safeInsets(); for (const fn of [...insetFns]) call(fn, v); });
  }
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
/** 안전 영역이 창 크기 변화 없이 바뀌었을 수 있을 때 (앱 브리지, 회전 직후, 크기가 그대로인 resize) → 바뀌었으면 다시 배치 */
function recheckInsets(forceResize = false) {
  const changed = measureInsets();
  if (!changed && !forceResize) return;
  if (G) { G.dirty = true; call(() => G.resize?.()); }
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
/** touchpad.js 가 캔버스 ⛶ 버튼을 그릴지 묻는 이름 (fullscreenAvailable 과 같다: 아이폰 사파리·설치 앱·APK 에서 false) */
export function canFullscreen() { return fullscreenAvailable(); }
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
/** 한 번만 보여 주는 안내를 봤는지: meta.tips = { a2hs, storage, remap, pad } (MASTER_PLAN §1.6). 예전 이름 meta.<key>Seen 도 읽는다 */
const LEGACY_TIP = { a2hs: 'a2hsSeen', storage: 'storageTipSeen' };
function tipSeen(key) {
  const m = G?.meta;
  if (!m) return false;
  const t = m.tips;
  return !!((t && typeof t === 'object' && t[key]) || (LEGACY_TIP[key] && m[LEGACY_TIP[key]]));
}
function markTip(key) {
  const m = G?.meta;
  if (!m) return;
  const t = m.tips && typeof m.tips === 'object' && !Array.isArray(m.tips) ? m.tips : {};
  m.tips = { ...t, [key]: true };
  call(() => G.saves?.saveMeta?.(m));
}
/** 아이폰 사파리처럼 전체 화면 API 가 없는 iOS 브라우저: '홈 화면에 추가' 안내 카드를 한 번 보여 준다 */
export function a2hsHint() {
  if (!G || !isIOS() || fsApi() || isStandalone()) return false;
  return !tipSeen('a2hs');
}
export function dismissA2hs() { markTip('a2hs'); }

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
    if (!ok && !isApp() && !isStandalone() && !tipSeen('storage') && !G?.cloud?.loggedIn) storageTipPending = true;
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
  if (!swReg || D?.hidden || now() - lastSwCheck < SW_UPDATE_EVERY) return;
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
  // 타이틀에 [업데이트] 버튼(onUpdateReady 구독)이 아직 없을 때: 새로고침만으로는 대기 중인 워커가 켜지지 않으므로 '다시 열기'로 안내
  call(() => G.toast?.(onTitle ? `${UPDATE_READY_TEXT} — 게임을 닫았다가 다시 열면 적용됩니다` : UPDATE_LATER_TEXT, '#b8c4d8', 3.2));
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

// ───────────────────────── 뒤로 가기 센티널 (§5.6, PS-02) ─────────────────────────
// 기본 항목(B) 위에 센티널 항목(S, state.bnBack)을 하나 쌓아 둔다. 뒤로 가기 → B 로 돌아오며 popstate → S 를 다시 쌓고 게임에 Escape.
// 크롬은 사용자 입력 없이 쌓은 항목을 뒤로 가기에서 건너뛰므로(history manipulation intervention) 처음 쌓기는 입력(탭·키) 중에 하고,
// 입력이 없는 컨트롤러 사용자를 위해 게임 화면(타이틀 첫 화면 밖)에 들어가면 주기 점검에서도 쌓는다
export const BACK_EXIT_TEXT = '뒤로 가기를 한 번 더 누르면 게임을 나갑니다';
const BACK_EXIT_MS = 2500;
const BACK_KEY = 'bnBack';
let backOn = false, backArmed = false, exitAskUntil = 0;
function backGuardAllowed() {
  if (!W?.history?.pushState || isApp()) return false; // APK: 뒤로 버튼을 MainActivity 가 받아 같은 규칙으로 처리한다
  try { if (W.top !== W) return false; } catch { return false; } // 틀 안(아티팩트 미리보기 등): 부모 페이지의 뒤로 가기를 가로채지 않는다
  return true;
}
/** 지금 뒤로 가기가 '앱 나가기'인가: 타이틀 첫 화면 (MainActivity.BACK_PROBE_JS 와 같은 판정) */
function backMeansExit() {
  const S = G?.scenes;
  if (!S?.length) return true;
  const t = S[S.length - 1];
  return S.length === 1 && t?.name === 'title' && t.mode !== 'menu';
}
function armBack() {
  if (!backOn || backArmed || now() < exitAskUntil) return;
  try { W.history.pushState({ [BACK_KEY]: 1 }, ''); backArmed = true; } catch { /* 보안 오류 등: 센티널 없이 계속 */ }
}
/** 게임에 뒤로(Escape) 한 번: APK 의 ESCAPE_JS 와 같이 keydown → 120 ms 뒤 keyup (input.js 가 한 프레임 이상 눌림으로 본다) */
function sendBack() {
  try {
    const o = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
    const t = D.activeElement || D.body || D;
    t.dispatchEvent(new KeyboardEvent('keydown', o));
    setTimeout(() => { try { t.dispatchEvent(new KeyboardEvent('keyup', o)); } catch { /* 무시 */ } }, 120);
  } catch { /* 무시 */ }
  if (G) G.dirty = true;
}
function onPopState(e) {
  if (e?.state?.[BACK_KEY]) { backArmed = true; return; } // 앞으로 가기로 센티널에 돌아왔다
  if (!backArmed) return; // 센티널을 쌓은 적이 없다 (다른 이유의 popstate)
  backArmed = false;
  if (!G) return;
  if (backMeansExit()) {
    // 타이틀: 센티널을 다시 쌓지 않는다 → 안내 시간 안에 한 번 더 누르면 그대로 떠난다 (두 번 넘게 붙잡지 않는다)
    exitAskUntil = now() + BACK_EXIT_MS;
    call(() => G.toast?.(BACK_EXIT_TEXT, '#cfc2a8', BACK_EXIT_MS / 1000));
    return;
  }
  armBack();
  sendBack();
}
/** 사용자 입력 중: 센티널이 없으면 쌓는다 (입력 중에 쌓은 항목은 크롬이 건너뛰지 않는다) */
function onUserInput(e) {
  if (!backOn || backArmed) return;
  if (e?.type === 'keydown' && (e.key === 'Escape' || e.repeat)) return; // Escape 는 사용자 활성화가 아니다
  armBack();
}
/** 주기 점검: 게임 화면에서 센티널이 없으면 (컨트롤러만 쓰는 경우, 타이틀 안내 뒤 다시 들어온 경우) 쌓는다 */
function syncBack() {
  if (!backOn || backArmed || now() < exitAskUntil) return;
  if (!backMeansExit()) armBack();
}
function initBackGuard() {
  backOn = backGuardAllowed();
  if (!backOn) return;
  backArmed = !!W.history.state?.[BACK_KEY]; // 새로 고침: 이미 센티널 위에 있다
  W.addEventListener('popstate', onPopState);
  for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchend']) W.addEventListener(ev, onUserInput, { capture: true, passive: true });
}
export function backGuard() { return { on: backOn, armed: backArmed }; }

// ───────────────────────── 주기 점검 (0.5초) ─────────────────────────
let lastTopName = null;
function tick() {
  if (!G) return;
  // 화면이 바뀌면 거절됐던 화면 꺼짐 방지를 한 번 더 시도한다 (컨트롤러만 쓰면 터치·키 입력이 없어 다시 시도할 계기가 없다)
  const topName = G.top?.name ?? null;
  if (topName !== lastTopName) { lastTopName = topName; wakeDenied = false; }
  syncWake();
  setCursorHidden(cursorWanted());
  checkSwUpdate(); // 탭을 오래 켜 둔 데스크톱도 30분마다 새 버전을 확인한다 (그 전에는 바로 돌아온다)
  flushUpdateToast();
  syncBack();
  if (storageTipPending && G.top?.name === 'hub' && !(G.toasts?.length)) {
    storageTipPending = false;
    // 그사이 계정에 로그인했으면(클라우드 백업 중) 안내하지 않는다
    if (tipSeen('storage') || G.cloud?.loggedIn) return;
    markTip('storage');
    call(() => G.toast?.(STORAGE_TIP_TEXT, '#cfc2a8', 5));
  }
}

// ───────────────────────── 초기화 ─────────────────────────
export const api = {
  safeInsets, safeRect, onInsetsChange, isStandalone, isApp, isIOS, isAndroid, isAndroidWeb,
  fullscreenAvailable, canFullscreen, isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen,
  onUpdateReady, applyUpdate, updateReady, audioHint, a2hsHint, dismissA2hs, requestPersist, backGuard,
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

  // 안전 영역: 창 크기 변화는 game.js 가 먼저 받는다 (그때 safeInsets() 가 다시 잰다). 그 뒤 여기서 한 번 더 재서,
  // 창 크기는 그대로인데 env() 만 바뀐 경우(game.js 가 옛 값을 썼다)에만 다시 배치한다. 앱 브리지·회전 직후 값도 여기서 챙긴다
  W.addEventListener('bn-insets', () => recheckInsets(true));
  W.addEventListener('resize', () => recheckInsets(false));
  W.addEventListener('orientationchange', () => { insetsDirty = true; setTimeout(() => recheckInsets(false), 250); });

  // 확대·스크롤 방지 (예전 index.html 인라인 스크립트)
  D.addEventListener('gesturestart', (e) => e.preventDefault());
  D.addEventListener('touchmove', (e) => { if (e.target?.closest?.('#app')) e.preventDefault(); }, { passive: false });

  // 전체 화면: Alt+Enter (데스크톱), 첫 탭 자동 (안드로이드 웹). ⛶ 버튼은 캔버스 패드(touchpad.js)가 그리고 toggleFullscreen() 을 부른다
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
  // 창 밖에서 버튼을 놓으면 pointerup 이 오지 않는다 → '누르고 있음'을 풀어 커서가 다시 숨을 수 있게 한다
  W.addEventListener('pointercancel', (e) => { if (e.pointerType === 'mouse') mouseDown = false; }, { passive: true });
  W.addEventListener('blur', () => { mouseDown = false; });

  // 화면 꺼짐 방지: 탭이 숨으면 브라우저가 풀어 주므로 돌아올 때 다시 요청. 새 버전 확인도 이때 (30분마다)
  D.addEventListener('visibilitychange', () => {
    if (D.hidden) { releaseWake(); return; }
    wakeDenied = false; syncWake(); checkSwUpdate();
    if (G) G.dirty = true;
  });
  W.addEventListener('keydown', () => { wakeDenied = false; }, { passive: true, once: true });

  // 뒤로 가기(제스처) = 일시정지·닫기, 타이틀에서는 한 번 확인 (§5.6, PS-02)
  initBackGuard();

  // 첫 슬롯 저장 뒤 저장공간 보존 요청
  try { G?.saves?.onWrite?.((ev) => { if (ev?.type === 'write') onFirstSave(); }); } catch { /* 무시 */ }
  bus.on('stageCleared', onFirstSave);

  setInterval(tick, TICK_MS);

  // 서비스 워커는 첫 화면을 다 받은 뒤 등록한다 (부팅과 대역폭을 다투지 않게)
  if (D.readyState === 'complete') setTimeout(registerServiceWorker, 0);
  else W.addEventListener('load', () => setTimeout(registerServiceWorker, 0), { once: true });
  return api;
}
