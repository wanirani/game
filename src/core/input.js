// 입력 시스템: 키보드 · 게임패드 · 모바일 터치(가상 패드) · 포인터(메뉴 터치/클릭) — platform.md §3–§4, MASTER_PLAN §1.4
//
// 액션 (data/controls.js ACTIONS):
//   이동 left right up down · 게임 jump attack dash sub skill1 skill2 ult swap awaken mount guard map menu
//   메뉴 의미 confirm cancel prevTab nextTab alt alt2 · 회전 viewL viewR viewReset
//   메뉴는 게임 액션 이름(dash 등)이 아니라 의미 액션을 읽는다: 패드 B 는 게임에선 대시, 메뉴에선 취소 (MASTER_PLAN §1.4)
//   Q·E 는 게임에선 둘 다 swap, 메뉴에선 prevTab(Q·S·LB) / nextTab(E·D·RB) 로 구분된다.
//
// 읽기:
//   input.down(a)  pressed(a)  released(a)       지금 눌림 / 이번 스텝에 눌림 / 이번 스텝에 뗌
//   input.buffered(a, s) · consume(a)             최근 s초 안에 눌렸고 아직 소비되지 않음
//   input.pressTime[a] · input.releasedAt(a) · input.heldFor(a)   스텝 시각(input.time) 기록 — 히트스톱에도 안전 (R16)
//   input.axisX / axisY                           디지털 -1·0·1 (스틱은 8방향 구역)
//   input.analogX / analogMag                     아날로그 -1..1 / 0..1 (패드 스틱: 원형 데드존 후 재조정, 터치 스틱: 반지름 단위, 키보드·D-pad ±1)
//                                                 디지털 방향이 걸린 축에서만 값이 있다: axisX 가 0 이면 analogX 도 0, 부호는 늘 axisX 와 같다
//                                                 (걷기 = 0 < |analogX| < 0.55; 스틱은 원래 기울기 0.40 에서 걸리고 0.35 아래에서 풀린다)
//   input.sprintHint                              터치 스틱을 바깥 고리(1.15R) 너머로 밀었음
//   input.stickL / stickR {x, y, mag}             데드존 적용 후 패드 스틱 (stickR: 메뉴 회전·스크롤)
//   input.command(seq, facingAt, within) → {ok:true, facing} | false
//   input.queueCommand(cmd | techId)              터치 기술 원형 메뉴(platform §5.5 P2): 고른 기술을 입력한 커맨드로 친다 (0.5초 안에 소비)
//       seq 예: ['d','df','f','btn:attack'] (f=전방, b=후방). facingAt: (t) => 그 시각의 방향 (함수; valueOf() = 지금 방향)
//       또는 예전처럼 숫자 facing. f/b 는 "첫 방향을 넣던 순간" 의 방향 기준 (MASTER_PLAN §1.21). 터치 모드는 창 0.8초 이상.
//   input.pointer {x, y, down, tapped, justDown, active, rawX, rawY, type}   논리 좌표 (setPointerTransform 적용 후)
//
// 기기:
//   input.mode 'kb' | 'pad' | 'touch' — 마지막으로 의미 있는 입력을 준 기기 (sessionStorage 에 보관)
//   input.touchMode (= mode === 'touch', 예전 코드용 별칭) · input.onMode(fn) → 구독 해제 함수
//   input.padInfo {index, id, name, glyphs, detected, standard} | null   glyphs = 'xbox'|'ps'|'nintendo'|'generic' (ctrlPrompts 가 덮어씀)
//   input.bindings {key:{action:[code]}, pad:{action:[btnIdx|'lsx-'…]}, touch:{action:[buttonId]}, preset, confirm}
//   input.refreshBindings() · input.remap(device 'pad'|'key', action, codeOrIndex) → {ok, swapped, reason}
//   input.setPreset('arcade'|'classic') · input.resetBindings('pad'|'key')
//   input.rumble(strong, weak, ms) → haptics.js · input.activePad() → Gamepad | null
//   input.pollFrame()                             rAF 마다 한 번 (game.js): 패드 읽기·진동 정리·설정 변경 반영
//   input.setPointerTransform(fn | null)          fn(x, y) → {x, y} | [x, y]: 논리 좌표 → 맨 위 장면의 UI 좌표 (uiScale)
//
// 가상 패드 API (touchpad.js 가 부른다):
//   input.touch.set(action | 'a,b' | [a, b], on)   버튼
//   input.touch.axis(x, y, {sprint})               스틱: 반지름 단위 (|v| 가 1 을 넘을 수 있다). 0.45 에서 방향이 걸리고 0.35 아래에서 풀린다.
//                                                  sprint 를 주지 않으면 |v| ≥ 1.15 가 질주 신호
//   input.touch.tap(action)                        한 스텝만 누름 (예: 스킬 페이지를 손을 뗄 때 발동)
//   input.touch.clear()
//   가상 패드 표시는 game.syncPad 가 정한다 (mode === 'touch' 일 때만). 예전 game.js 는 setPadOff(off) 를 불렀고 그것도 계속 동작한다.
//
// 각성기 키(V) 는 'awaken' 이다. awaken.js 가 아직 'awaken' 을 읽지 않는 동안에는 V 가 필살기(ult) 로도 눌린다
// (input.awakenAsUlt; 누군가 down/pressed/buffered/releasedAt('awaken') 을 처음 부르면 자동으로 꺼진다).
import {
  ACTIONS, KEY_DEFAULTS, PAD_PRESETS, PAD_MENU, PAD_CONFIRM, TOUCH_BINDINGS, REMAPPABLE, PAD_FIXED, KEY_FIXED,
  PAD_IGNORE, padSetOf, padNameOf, HAT,
} from '../data/controls.js';
import { haptics } from './haptics.js';
import { bus } from './events.js';

export { ACTIONS };

/** 글자를 입력할 수 있는 요소인가 (읽기 전용 칸은 제외 — 세이브 코드 내보내기처럼 키로 버튼을 조작) */
const isTyping = (t) => !!t && (t.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.readOnly));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isKeyCode = (v) => typeof v === 'string' && /^[A-Za-z0-9]{1,32}$/.test(v);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const MODES = new Set(['kb', 'pad', 'touch']);
const ACTION_SET = new Set(ACTIONS);
const SS_MODE = 'bn.inputMode', SS_GLYPHS = 'bn.padGlyphs';

// 스틱 (platform §4.3). 방향이 걸리고 풀리는 문턱은 원래 기울기(데드존 전) 기준. 수용 조건을 모두 만족하도록:
//   0.15 → 안 움직임, 0.40 → 걷기 (feel A8), 0.55 → 이동, 다시 0.30 → 멈춤 (platform WP-1)
// 패드 모드 전환은 0.5 넘게 기울였을 때 (§3)
const STICK_ENGAGE = 0.4, STICK_RELEASE = 0.35, STICK_HOT = 0.5;
const TOUCH_ENGAGE = 0.45, TOUCH_RELEASE = 0.35, TOUCH_DZ = 0.12, TOUCH_SPRINT = 1.15;
const TRIG_ON = 0.5, TRIG_OFF = 0.35;
const SECTOR = Math.PI / 4, SECTOR_KEEP = (22.5 + 7.5) * Math.PI / 180;   // 45° 구역 + ±7.5° 히스테리시스
const SECT_DIRS = [['right'], ['right', 'down'], ['down'], ['down', 'left'], ['left'], ['left', 'up'], ['up'], ['up', 'right']];
const L3 = 10, L3_STILL = 0.6, L3_HOLD_MS = 250;   // 탈것(L3): 스틱이 0.6 안쪽일 때만, 또는 0.25초 누르고 있으면
const CMD_TOUCH_WINDOW = 0.8;
const HIST_MAX = 24;

/** 각도 → 8방향 구역 (0 = 오른쪽, 시계 방향; y 는 아래가 +). 직전 구역에서 ±30° 안이면 유지 */
function sectorOf(x, y, prev) {
  const ang = Math.atan2(y, x);
  if (prev >= 0) {
    let d = Math.abs(ang - prev * SECTOR);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d <= SECTOR_KEEP) return prev;
  }
  return ((Math.round(ang / SECTOR) % 8) + 8) % 8;
}
/** 스틱 디지털 상태 갱신 (히스테리시스). → 구역 번호 또는 -1 */
function stickDigital(st, x, y, mag, on, off) {
  if (!(st.eng ? mag >= off : mag >= on)) { st.eng = false; st.sec = -1; return -1; }
  st.eng = true;
  st.sec = sectorOf(x, y, st.sec);
  return st.sec;
}
/** 원형 데드존 → 0..1 로 재조정 (out 을 고쳐 쓴다) */
function radial(out, x, y, dz, top = 0.95) {
  const m = Math.hypot(x, y);
  if (!(m >= dz) || m <= 0) { out.x = 0; out.y = 0; out.mag = 0; return out; }
  const k = Math.min(1, (m - dz) / Math.max(0.05, top - dz));
  out.x = (x / m) * k; out.y = (y / m) * k; out.mag = k;
  return out;
}
function hatDir(v) {
  if (!Number.isFinite(v) || Math.abs(v) > 1.05) return null;
  const i = Math.round((v + 1) / (2 / 7));
  return HAT[((i % 8) + 8) % 8];
}
function hasTouchScreen() {
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    return !!coarse && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
  } catch { return false; }
}
function ssGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* 저장 불가 (비공개 창 등) */ } }

class Input {
  constructor() {
    this.state = {}; // action -> bool (현재)
    this.prev = {};
    this.pressTime = {};   // action -> 마지막으로 눌린 스텝 시각 (input.time)
    this.releaseTime = {}; // action -> 마지막으로 뗀 스텝 시각
    this.consumed = {};
    this.sources = { key: {}, pad: {}, touch: {} };
    this.axisX = 0; this.axisY = 0;
    this.analogX = 0; this.analogY = 0; this.analogMag = 0;
    this.sprintHint = false;
    this.stickL = { x: 0, y: 0, mag: 0 };
    this.stickR = { x: 0, y: 0, mag: 0 };
    this.time = 0;
    this.history = []; // [{dir, t}] 방향 입력 이력 (커맨드용)
    this.lastDir = 'n';
    this.pointer = { x: 0, y: 0, down: false, tapped: false, active: false, justDown: false, rawX: 0, rawY: 0, type: 'mouse' };
    this._tapQueued = false; this._downQueued = false;
    this._tapLatch = false; // 이번 프레임 스텝에서 발생한 탭 → 같은 프레임의 render() 까지 유지
    this.padOff = false;    // 가상 패드가 장면에 의해 꺼져 있으면 터치 버튼 입력 무시
    this.anyKeyPressed = false;
    this.game = null;
    this.textCapture = null; // 이니셜 입력 등 문자 입력용 콜백
    this.mode = 'kb';
    this.padInfo = null;
    this.bindings = { key: {}, pad: {}, touch: {}, preset: 'arcade', confirm: 'south' };
    this.keyActs = {}; this.padActs = [];
    this.keysDown = new Set();
    this._keyFresh = new Set(); // 눌린 뒤 아직 스텝이 돌지 않은 키
    this._keyLate = new Set();  // 스텝 전에 뗀 키 (다음 스텝까지 눌린 채)
    this._stickEng = { x: 0, y: 0 }; // 왼쪽 스틱이 직접 건 디지털 방향 (D-pad·키와 구분: 아날로그를 스틱에서 읽을지)
    this.pads = new Map();     // gamepad.index → 상태
    this.pad = null;           // 캔버스 가상 패드 (touchpad.js initTouchPad 결과)
    this.awakenAsUlt = true;
    this.flushT = -99; this.flushN = 0;
    this._modeFns = new Set();
    this._ptrXf = null; this._ptrId = null;
    this._lastFramePoll = -1e9; this._pollN = 0; this._bindSig = ''; this._bindSettings = null;
    this._padVis = null; this._domPadKey = '';
    this._touchVec = { x: 0, y: 0, mag: 0, raw: 0 }; this._touchSt = { eng: false, sec: -1 }; this._touchSprint = false;
    this._touchTaps = new Map();
    this._bufWin = {};
    this._queuedCmd = null;
    this._inited = false;
    this.touch = this._makeTouchApi();
    for (const a of ACTIONS) { this.state[a] = false; this.prev[a] = false; this.pressTime[a] = -99; this.releaseTime[a] = -99; }
  }

  /** 예전 코드용: input.touchMode (읽기 전용 별칭; 쓰면 기기 전환) */
  get touchMode() { return this.mode === 'touch'; }
  set touchMode(on) { this.setTouchMode(!!on); }

  init(game) {
    this.game = game;
    if (this._inited) return;
    this._inited = true;
    haptics.init(game, this);
    this.refreshBindings();
    this._initMode();

    window.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return; // 계정 화면 등 실제 입력 칸에서 타이핑 중이면 게임 키로 쓰지 않음
      if (this.textCapture && e.key.length === 1) { this.textCapture(e.key); }
      const acts = this.keyActs[e.code];
      if (acts) {
        e.preventDefault();
        if (!this.keysDown.has(e.code)) this._keyFresh.add(e.code);   // 아직 스텝이 보지 못한 새 눌림
        this.keysDown.add(e.code);
        this._rebuildKeySources();
        if (!e.repeat) this.setMode('kb');
      }
      this.anyKeyPressed = true;
      this.game?.audio?.unlock();
    });
    window.addEventListener('keyup', (e) => {
      const had = this.keysDown.delete(e.code);   // 입력 칸에 포커스가 옮겨 간 뒤에 뗀 키도 풀어 준다
      if (this.keyActs[e.code] && !isTyping(e.target)) e.preventDefault();
      // 스텝이 한 번도 돌기 전에 뗀 짧은 톡 (긴 프레임·느린 기기): 다음 스텝 한 번은 눌린 것으로 보여 준다
      if (had && this._keyFresh.has(e.code)) this._keyLate.add(e.code);
      if (had) this._rebuildKeySources();
    });
    window.addEventListener('blur', () => {
      this.keysDown.clear(); this._keyFresh.clear(); this._keyLate.clear(); this.sources.key = {};
      this.touch.clear();
    });

    const cv = game.canvas;
    const toLogical = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / (r.width || 1)) * game.viewW, y: ((e.clientY - r.top) / (r.height || 1)) * game.viewH };
    };
    const setPtr = (p) => { this.pointer.rawX = p.x; this.pointer.rawY = p.y; this._applyPtrXf(); };
    // 기기 판정: 창 전체에서 (가상 패드 층처럼 캔버스 위에 덮인 요소를 눌러도 잡히게)
    window.addEventListener('pointerdown', (e) => {
      this.pointer.type = e.pointerType || 'mouse';
      if (e.pointerType === 'touch' || e.pointerType === 'pen') this.setMode('touch');
      else if (e.pointerType === 'mouse') this.setMode('kb');
    }, { capture: true, passive: true });
    window.addEventListener('touchstart', () => this.setMode('touch'), { passive: true, capture: true });
    window.addEventListener('wheel', () => this.setMode('kb'), { passive: true });
    cv.addEventListener('pointerdown', (e) => {
      setPtr(toLogical(e));
      this._ptrId = e.pointerId;
      Object.assign(this.pointer, { down: true, active: true });
      this._downQueued = true;
      this.game?.audio?.unlock();
      this.anyKeyPressed = true;
    });
    cv.addEventListener('pointermove', (e) => {
      setPtr(toLogical(e));
      this.pointer.active = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (this.pointer.down) {
        setPtr(toLogical(e));
        this._tapQueued = true;
      }
      this.pointer.down = false;
    });
    // 브라우저가 가져간 터치 (가장자리 스와이프·시스템 제스처): 탭 없이 뗀 것으로 (눌린 채 남아 끌기가 멈추지 않게)
    window.addEventListener('pointercancel', (e) => { if (e.pointerId === this._ptrId) this.pointer.down = false; });

    window.addEventListener('gamepadconnected', (e) => { try { if (e.gamepad) this._padConnected(e.gamepad); } catch (err) { console.error(err); } });
    window.addEventListener('gamepaddisconnected', (e) => { try { this._padDisconnected(e.gamepad?.index, e.gamepad?.id); } catch (err) { console.error(err); } });

    this._initTouchPad();
  }

  /** 캔버스 가상 패드 (touchpad.js) — 없거나 실패하면 예전 DOM 패드 (#touch) */
  _initTouchPad() {
    import('./touchpad.js').then((m) => {
      let pad = null;
      try { pad = m.initTouchPad?.(this) ?? null; } catch (e) { console.error('[input] touchpad', e); pad = null; }
      if (pad) { this.pad = pad; this._padVis = null; this._applyPad(); } else this.setupTouchPad();
    }).catch((e) => { console.error('[input] touchpad import', e); this.setupTouchPad(); });
  }

  // ── 기기 모드 ──────────────────────────────────────────────────────────
  _initMode() {
    let m = ssGet(SS_MODE);
    if (!MODES.has(m)) m = hasTouchScreen() ? 'touch' : 'kb';
    const g = ssGet(SS_GLYPHS);
    if (g) this._lastGlyphs = g;
    this.mode = null;
    this.setMode(m);
  }

  /** 기기 전환 (같은 모드면 아무것도 하지 않는다) */
  setMode(m) {
    if (!MODES.has(m) || this.mode === m) return;
    const old = this.mode;
    this.mode = m;
    if (m !== 'pad') this._prevMode = m;
    try { document.body.classList.toggle('touch', m === 'touch'); } catch { /* 문서 없음 */ }
    if (m !== 'touch') this._releaseTouch();
    ssSet(SS_MODE, m);
    if (this.game) this.game.dirty = true;
    // DOM 패드 또는 syncPad 가 없는 예전 game.js 는 여기서 바로 반영 (캔버스 패드 표시는 game.syncPad 몫)
    this._applyPad();
    for (const fn of [...this._modeFns]) { try { fn(m, old); } catch (e) { console.error('[input] onMode', e); } }
    if (old) this._emitDevice();
  }
  setTouchMode(on) { this.setMode(on ? 'touch' : 'kb'); }
  onMode(fn) { if (typeof fn === 'function') this._modeFns.add(fn); return () => this._modeFns.delete(fn); }
  _emitDevice() {
    const m = this.mode;
    bus.emit('inputDevice', {
      kind: m,
      name: m === 'pad' ? this.padInfo?.name ?? '게임패드' : m === 'touch' ? '터치' : '키보드',
      glyphs: m === 'pad' ? this.glyphSet() : m === 'touch' ? 'touch' : 'keyboard',
    });
  }
  /** 패드 글리프 세트 (ctrlPrompts 가 xbox/ps/nintendo 면 그것, 아니면 인식 결과) */
  glyphSet() {
    const p = this.game?.settings?.ctrlPrompts;
    if (p === 'xbox' || p === 'ps' || p === 'nintendo') return p;
    return this.padInfo?.detected ?? this._lastGlyphs ?? 'xbox';
  }
  /** 안내 글리프를 그릴 기기: 'kb' | 'pad' | 'touch' (ctrlPrompts 'keyboard' 면 패드 모드에서도 키보드) */
  promptMode() {
    if (this.mode === 'pad' && this.game?.settings?.ctrlPrompts === 'keyboard') return 'kb';
    return this.mode;
  }

  // ── 가상 패드 표시 (예전 경로) ─────────────────────────────────────────
  /** 장면에 따라 가상 패드 표시/숨김 (예전 game.js 가 매 프레임 호출). 숨길 때 눌려 있던 버튼·스틱을 모두 뗀다 */
  setPadOff(off) {
    off = !!off;
    if (this.padOff !== off) {
      this.padOff = off;
      if (off) this._releaseTouch();
    }
    this._applyPad();
  }
  /**
   * 가상 패드 표시. 캔버스 패드(touchpad.js)는 game.syncPad 가 유일한 주인이라 여기선 건드리지 않는다
   * (game.syncPad 가 없는 예전 game.js 일 때만 여기서 켜고 끈다). 예전 DOM 패드(#touch)는 클래스만 바꾼다 (바뀔 때만).
   */
  _applyPad() {
    const vis = !this.padOff && this.mode === 'touch';
    if (this.pad) {
      if (typeof this.game?.syncPad === 'function' || vis === this._padVis) return;
      this._padVis = vis;
      try { this.pad.setVisible?.(vis); } catch (e) { console.error('[input] pad.setVisible', e); }
      return;
    }
    const k = `${this.mode === 'touch'}|${this.padOff}`;
    if (k === this._domPadKey) return;
    try {
      const root = document.getElementById('touch');
      if (!root) return;
      this._domPadKey = k;
      root.classList.toggle('hidden', this.mode !== 'touch');
      root.classList.toggle('scene-off', this.padOff);
    } catch { /* 문서 없음 */ }
  }
  _releaseTouch() {
    const t = this.sources.touch;
    for (const k in t) t[k] = false;
    this._touchVec.x = this._touchVec.y = this._touchVec.mag = this._touchVec.raw = 0;
    this._touchSt.eng = false; this._touchSt.sec = -1; this._touchSprint = false;
    this._touchTaps.clear();
    try {
      const root = document.getElementById('touch');
      root?.querySelectorAll('.on').forEach((b) => b.classList.remove('on'));
      const knob = root?.querySelector('#stick .knob');
      if (knob) knob.style.transform = '';
    } catch { /* 문서 없음 */ }
  }

  // ── 가상 패드 API ─────────────────────────────────────────────────────
  _makeTouchApi() {
    const self = this;
    const list = (a) => (Array.isArray(a) ? a : String(a ?? '').split(',')).map((s) => String(s).trim()).filter((s) => ACTION_SET.has(s));
    return {
      /** 버튼 (레벨 상태; 키·패드와 OR). 모르는 액션은 무시 */
      set(action, on) {
        const acts = list(action);
        if (on && acts.length) self.setMode('touch');
        for (const a of acts) self.sources.touch[a] = !!on;
      },
      /**
       * 아날로그 스틱 벡터 (반지름 단위, 단위 원 안으로 자른다; 0,0 = 뗌/데드존). 방향(left/right/up/down)은 만들지 않는다:
       * 가상 패드가 구역 판정을 직접 해서 set('left', …) 으로 보낸다. sprint: bool (또는 {sprint}) — 1.15R 바깥 고리
       */
      axis(x, y, sprint) {
        x = Number(x) || 0; y = Number(y) || 0;
        let raw = Math.hypot(x, y);
        if (!Number.isFinite(raw)) { x = 0; y = 0; raw = 0; }
        if (raw > 0) self.setMode('touch');
        const v = self._touchVec;
        v.raw = raw;
        if (raw <= 0) { v.x = 0; v.y = 0; v.mag = 0; } else {
          const k = Math.min(1, raw);
          v.x = (x / raw) * k; v.y = (y / raw) * k; v.mag = k;
        }
        const sp = typeof sprint === 'boolean' ? sprint : typeof sprint?.sprint === 'boolean' ? sprint.sprint : raw >= TOUCH_SPRINT;
        self._touchSprint = raw > 0 && sp;
      },
      /** 한 스텝만 누름 (다음 스텝에 뗀다) */
      tap(action) {
        const acts = list(action);
        if (!acts.length) return;
        self.setMode('touch');
        for (const a of acts) self._touchTaps.set(a, 2);
      },
      /** 모든 터치 입력 해제 (패드 숨김·창 전환) */
      clear() { self._releaseTouch(); },
      get active() { return self.mode === 'touch'; },
    };
  }
  /** 예전 DOM 스틱: 반지름 단위 벡터 → 아날로그 + 8방향 구역 (캔버스 패드는 방향을 직접 보낸다) */
  _legacyStick(x, y) {
    const raw = Math.hypot(x, y);
    if (raw <= TOUCH_DZ) this.touch.axis(0, 0, false); else {
      const k = Math.min(1, (raw - TOUCH_DZ) / (1 - TOUCH_DZ));
      this.touch.axis((x / raw) * k, (y / raw) * k, false);
    }
    const t = this.sources.touch;
    t.left = t.right = t.up = t.down = false;
    const sec = stickDigital(this._touchSt, x, y, raw, TOUCH_ENGAGE, TOUCH_RELEASE);
    if (sec >= 0) for (const d of SECT_DIRS[sec]) t[d] = true;
  }

  /** 예전 모바일 가상 패드 (DOM): #touch 안의 [data-act] 버튼과 #stick 영역. 캔버스 패드가 없을 때만 */
  setupTouchPad() {
    const root = typeof document !== 'undefined' ? document.getElementById('touch') : null;
    if (!root || root.dataset.bnWired) return;
    root.dataset.bnWired = '1';
    this._applyPad();
    const stick = root.querySelector('#stick');
    const knob = root.querySelector('#stick .knob');
    const R = 46;
    let stickId = null, cx = 0, cy = 0;
    const setDir = (dx, dy) => {
      if (this.padOff) return;
      this._legacyStick(dx / R, dy / R);
      if (knob) {
        const m = Math.min(1, R / Math.max(1, Math.hypot(dx, dy)));
        knob.style.transform = `translate(${dx * m}px, ${dy * m}px)`;
      }
    };
    if (stick) {
      stick.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        stickId = e.pointerId; stick.setPointerCapture?.(e.pointerId);
        const r = stick.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        setDir(e.clientX - cx, e.clientY - cy);
        this.game?.audio?.unlock();
      });
      stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) setDir(e.clientX - cx, e.clientY - cy); });
      const end = (e) => { if (e.pointerId === stickId) { stickId = null; this._legacyStick(0, 0); if (knob) knob.style.transform = ''; } };
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
    }
    root.querySelectorAll('[data-act]').forEach((btn) => {
      const acts = btn.dataset.act.split(',');
      const on = (e) => {
        e.preventDefault();
        if (this.padOff) return;
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add('on');
        this.touch.set(acts, true);
        this.game?.audio?.unlock();
        try { if (navigator.vibrate && this.game?.settings?.vibration !== false) navigator.vibrate(8); } catch { /* 무시 */ }
      };
      const off = (e) => {
        e.preventDefault();
        btn.classList.remove('on');
        this.touch.set(acts, false);
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    });
  }

  // ── 포인터 좌표 변환 (UI 배율 장면) ────────────────────────────────────
  setPointerTransform(fn) {
    this._ptrXf = typeof fn === 'function' ? fn : null;
    this._applyPtrXf();
  }
  _applyPtrXf() {
    const p = this.pointer;
    let x = p.rawX, y = p.rawY;
    if (this._ptrXf) {
      try {
        const r = this._ptrXf(x, y);
        if (Array.isArray(r)) { x = r[0]; y = r[1]; } else if (r && typeof r === 'object') { x = r.x; y = r.y; }
      } catch (e) { console.error('[input] pointer transform', e); }
    }
    p.x = Number.isFinite(x) ? x : p.rawX; p.y = Number.isFinite(y) ? y : p.rawY;
  }

  // ── 바인딩 ────────────────────────────────────────────────────────────
  /** 결정 버튼 위치: 'south' | 'east' (ctrlConfirm 'auto' 는 닌텐도 패드면 east) */
  confirmPos() {
    const c = this.game?.settings?.ctrlConfirm;
    if (c === 'south' || c === 'east') return c;
    return this.glyphSet() === 'nintendo' ? 'east' : 'south';
  }
  _bindingSig() {
    const st = this.game?.settings ?? {};
    let maps = '';
    try { maps = JSON.stringify([st.ctrlMap ?? null, st.keyMap ?? null]); } catch { maps = ''; }
    return `${st.ctrlPreset}|${this.confirmPos()}|${maps}`;
  }
  /** settings(ctrlPreset · ctrlConfirm · ctrlMap · keyMap · ctrlPrompts) 로 input.bindings 를 다시 만든다 */
  refreshBindings() {
    const st = this.game?.settings ?? {};
    const presetName = st.ctrlPreset === 'classic' ? 'classic' : 'arcade';
    const pad = {};
    for (const [a, v] of Object.entries(PAD_PRESETS[presetName])) pad[a] = v.slice();
    if (st.ctrlPreset === 'custom' && isObj(st.ctrlMap)) {
      // 저장된 지정에서도 START·D-pad 같은 고정 버튼은 버린다 (손상된 세이브가 일시정지 버튼을 점프로 만들지 않게)
      for (const a of REMAPPABLE) {
        const l = st.ctrlMap[a];
        if (Array.isArray(l)) pad[a] = l.filter((b) => (Number.isInteger(b) && b >= 0 && b <= 63 && !PAD_FIXED.has(b)) || typeof b === 'string').slice(0, 8);
      }
    }
    for (const [a, v] of Object.entries(PAD_MENU)) pad[a] = v.slice();
    const pos = this.confirmPos();
    for (const [a, v] of Object.entries(PAD_CONFIRM[pos])) pad[a] = v.slice();
    const key = {};
    for (const [a, v] of Object.entries(KEY_DEFAULTS)) key[a] = v.slice();
    if (isObj(st.keyMap)) {
      for (const a of REMAPPABLE) {
        const l = st.keyMap[a];
        if (Array.isArray(l)) key[a] = l.filter((c) => isKeyCode(c) && !KEY_FIXED.has(c)).slice(0, 8);
      }
    }
    const touch = {};
    for (const [a, v] of Object.entries(TOUCH_BINDINGS)) touch[a] = v.slice();
    this.bindings = { key, pad, touch, preset: st.ctrlPreset === 'classic' || st.ctrlPreset === 'custom' ? st.ctrlPreset : 'arcade', confirm: pos };
    const keyActs = {};
    for (const [a, codes] of Object.entries(key)) for (const c of codes) (keyActs[c] ??= []).push(a);
    this.keyActs = keyActs;
    const padActs = [];
    for (const [a, list] of Object.entries(pad)) for (const b of list) if (Number.isInteger(b)) (padActs[b] ??= []).push(a);
    this.padActs = padActs;
    this._bindSig = this._bindingSig();
    this._bindSettings = this.game?.settings ?? null;
    this._bindQuick = this._quickSig();
    this._rebuildKeySources();
    if (this.game) this.game.dirty = true;
    return this.bindings;
  }
  /** 매 프레임 비교용 가벼운 서명: 프리셋 · 결정 위치 · 지정 객체 (옵션 화면이 바꾸면 다음 프레임에 반영) */
  _quickSig() {
    const st = this.game?.settings;
    if (!st) return null;
    const q = this._quickArr ??= [];
    q[0] = st.ctrlPreset; q[1] = this.confirmPos(); q[2] = st.ctrlMap; q[3] = st.keyMap;
    return q;
  }
  _checkBindings() {
    const st = this.game?.settings ?? null;
    let changed = st !== this._bindSettings;
    if (!changed && st) {
      const b = this._bindQuick;
      changed = !b || b[0] !== st.ctrlPreset || b[1] !== this.confirmPos() || b[2] !== st.ctrlMap || b[3] !== st.keyMap;
    }
    // 지정 객체를 제자리에서 고친 경우는 30프레임마다 전체 비교로 잡는다
    if (changed || ++this._pollN % 30 === 0) {
      if (changed || this._bindingSig() !== this._bindSig) this.refreshBindings();
    }
  }
  _rebuildKeySources() {
    const k = {};
    for (const set of [this.keysDown, this._keyLate]) {
      for (const code of set) {
        const acts = this.keyActs[code];
        if (acts) for (const a of acts) k[a] = true;
      }
    }
    this.sources.key = k;
  }

  /**
   * 키·버튼 지정 (옵션 › 조작). device 'pad' → 버튼 번호, 'key' → KeyboardEvent.code.
   * 다른 액션이 이미 쓰는 값이면 두 액션의 값을 맞바꾼다. START·Escape·Enter·이동·메뉴 결정/취소는 바꿀 수 없다.
   * → { ok, swapped: 바뀐 다른 액션 | null, reason } (settings.ctrlPreset 'custom' + ctrlMap / keyMap 갱신; 저장은 호출한 화면이 한다)
   */
  remap(device, action, value) {
    const st = this.game?.settings;
    if (!st) return { ok: false, swapped: null, reason: 'nosettings' };
    if (!REMAPPABLE.includes(action)) return { ok: false, swapped: null, reason: 'fixed' };
    const dev = device === 'kb' || device === 'keyboard' ? 'key' : device;
    if (dev === 'pad') {
      if (!Number.isInteger(value) || value < 0 || value > 63) return { ok: false, swapped: null, reason: 'invalid' };
      if (PAD_FIXED.has(value)) return { ok: false, swapped: null, reason: 'reserved' };
    } else if (dev === 'key') {
      if (!isKeyCode(value)) return { ok: false, swapped: null, reason: 'invalid' };
      if (KEY_FIXED.has(value)) return { ok: false, swapped: null, reason: 'reserved' };
    } else return { ok: false, swapped: null, reason: 'device' };
    const src = this.bindings[dev];
    const cur = {};
    for (const a of REMAPPABLE) cur[a] = (src[a] ?? []).slice();
    const old = cur[action];
    const oldPrimary = old.length ? old[0] : null;
    if (oldPrimary === value) return { ok: true, swapped: null, reason: 'same' };
    cur[action] = [value, ...old.slice(1).filter((v) => v !== value)];
    let swapped = null;
    for (const a of REMAPPABLE) {
      if (a === action) continue;
      const i = cur[a].indexOf(value);
      if (i < 0) continue;
      swapped = a;
      if (oldPrimary !== null && !cur[a].includes(oldPrimary)) cur[a][i] = oldPrimary;
      else cur[a].splice(i, 1);
      break;
    }
    if (dev === 'pad') { st.ctrlMap = cur; st.ctrlPreset = 'custom'; } else st.keyMap = cur;
    this.refreshBindings();
    return { ok: true, swapped, reason: null };
  }
  /** 패드 프리셋 선택 (사용자 지정 해제) */
  setPreset(name) {
    const st = this.game?.settings;
    if (!st || (name !== 'arcade' && name !== 'classic')) return false;
    st.ctrlPreset = name; st.ctrlMap = null;
    this.refreshBindings();
    return true;
  }
  /** 기본값 복원: 'pad' → 아케이드 프리셋, 'key' → 기본 키 */
  resetBindings(device = 'pad') {
    const st = this.game?.settings;
    if (!st) return false;
    if (device === 'pad') { st.ctrlPreset = 'arcade'; st.ctrlMap = null; } else st.keyMap = null;
    this.refreshBindings();
    return true;
  }

  // ── 게임패드 ──────────────────────────────────────────────────────────
  _padConnected(gp) {
    if (!gp) return null;
    const known = this.pads.get(gp.index);
    if (known && known.id === gp.id) return known.ignored ? null : known;
    const lid = String(gp.id ?? '').toLowerCase();
    const nb = gp.buttons?.length ?? 0;
    if (PAD_IGNORE.test(lid) || nb < 4) { this.pads.set(gp.index, { index: gp.index, id: gp.id, ignored: true }); return null; }
    const set = padSetOf(gp.id);
    const info = {
      index: gp.index, id: gp.id, name: padNameOf(gp.id, set), set, standard: gp.mapping === 'standard', ignored: false,
      btn: [], l3Ok: false, l3T: 0, stL: { eng: false, sec: -1 }, stR: { eng: false, sec: -1 }, hot: false, missT: 0,
    };
    this.pads.set(gp.index, info);
    this._setActivePad(info);
    if (this.mode === 'pad') this._emitDevice(); else this.setMode('pad');
    const g = this.game;
    this._hotToast(`🎮 ${info.name} 연결됨`, '#c8e0ff', 2.4);
    if (!info.standard) g?.toast?.('이 컨트롤러는 표준 배치가 아닙니다. 설정 › 조작에서 버튼을 지정해 주세요', '#ffd890', 4);
    const meta = g?.meta;
    if (meta && !meta.tips?.pad) {
      meta.tips = { ...(isObj(meta.tips) ? meta.tips : {}), pad: true };
      g.toast?.('설정 › 조작에서 버튼 배치를 바꿀 수 있어요', '#e8dcc8', 3.2);
      try { g.saves?.saveMeta?.(meta); } catch { /* 저장 실패 무시 */ }
    }
    return info;
  }
  _padDisconnected(index, id) {
    const info = this.pads.get(index);
    if (!info || (id !== undefined && info.id !== id)) return;
    this.pads.delete(index);
    if (info.ignored) return;
    const p = this.sources.pad;
    for (const k in p) p[k] = false;
    const rest = [...this.pads.values()].filter((x) => !x.ignored);
    if (rest.length) { this._setActivePad(rest[rest.length - 1]); return; }
    this.padInfo = null;
    this.stickL.x = this.stickL.y = this.stickL.mag = 0;
    this.stickR.x = this.stickR.y = this.stickR.mag = 0;
    const g = this.game;
    this._hotToast('컨트롤러 연결이 끊어졌습니다', '#ffb0a0', 3);
    try { g?.autoPause?.(); } catch (e) { console.error(e); }
    haptics.reset();
    if (this.mode === 'pad') this.setMode(hasTouchScreen() || this._prevMode === 'touch' ? 'touch' : 'kb');
  }
  /** 연결/끊김 토스트: 아직 떠 있는 직전 연결 상태 토스트(이제 틀린 말)는 지우고 새로 띄운다 */
  _hotToast(msg, color, time) {
    const g = this.game;
    if (!g?.toast) return;
    const list = g.toasts;
    const old = this._hotToastObj;
    if (old && Array.isArray(list)) { const i = list.indexOf(old); if (i >= 0) list.splice(i, 1); }
    g.toast(msg, color, time);
    const last = Array.isArray(g.toasts) ? g.toasts[g.toasts.length - 1] : null;
    this._hotToastObj = last && last.text === msg ? last : null;
  }
  _setActivePad(info) {
    const glyphs = info.set;
    const prev = this.padInfo;
    this.padInfo = { index: info.index, id: info.id, name: info.name, glyphs, detected: glyphs, standard: info.standard };
    const eff = this.glyphSet();
    this.padInfo.glyphs = eff;
    if (this._lastGlyphs !== glyphs) { this._lastGlyphs = glyphs; ssSet(SS_GLYPHS, glyphs); }
    if (this._bindingSig() !== this._bindSig) this.refreshBindings();   // 결정 버튼 위치 (닌텐도 → east)
    if (this.game) this.game.dirty = true;
    return !prev || prev.index !== info.index || prev.id !== info.id;
  }
  /** 진동에 쓸 패드 (마지막으로 쓴 패드) */
  activePad() {
    const i = this.padInfo?.index;
    if (i == null) return null;
    try { return navigator.getGamepads?.()?.[i] ?? null; } catch { return null; }
  }

  /** rAF 마다 한 번 (game.js). 패드 스냅숏은 그 프레임의 스텝들이 함께 쓴다 */
  pollFrame() {
    this._lastFramePoll = nowMs();
    this._frameWork();
  }
  _frameWork() {
    this._checkBindings();
    this.pollPad();
    haptics.tick();
    if (this.padInfo) {
      const eff = this.glyphSet();
      if (this.padInfo.glyphs !== eff) { this.padInfo.glyphs = eff; if (this.game) this.game.dirty = true; }
    }
  }

  pollPad() {
    const src = this.sources.pad;
    for (const k in src) src[k] = false;
    let list = [];
    try { list = navigator.getGamepads ? navigator.getGamepads() : []; } catch { list = []; }
    const t = nowMs();
    const dz = Math.max(0.1, Math.min(0.4, Number(this.game?.settings?.ctrlDeadzone) || 0.2));
    const engOn = Math.max(STICK_ENGAGE, dz + 0.1), engOff = Math.min(engOn - 0.05, Math.max(STICK_RELEASE, dz + 0.05));
    let bestL = 0, bestR = 0, active = null;
    const E = this._stickEng;
    E.x = 0; E.y = 0;
    const seen = new Set();
    for (const gp of list || []) {
      if (!gp || gp.connected === false) continue;
      seen.add(gp.index);
      let info = this.pads.get(gp.index);
      if (!info || info.id !== gp.id) info = this._padConnected(gp);
      if (!info || info.ignored) continue;
      info.missT = 0;
      let edge = false;
      const B = gp.buttons || [], A = gp.axes || [];
      const lx = A[0] || 0, ly = A[1] || 0, rawL = Math.hypot(lx, ly);
      // 버튼 (트리거 6·7 은 값 0.5 에서 눌림, 0.35 아래에서 뗌)
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        const v = typeof b === 'object' ? Number(b.value) || 0 : Number(b) || 0;
        const pr = typeof b === 'object' ? !!b.pressed : v > 0.5;
        const was = !!info.btn[i];
        let on;
        if (i === 6 || i === 7) on = was ? v > TRIG_OFF || (pr && v === 0) : v >= TRIG_ON || (pr && v === 0);
        else on = pr || v >= 0.5;
        if (on && !was) edge = true;
        info.btn[i] = on;
        if (!on) { if (i === L3) info.l3Ok = false; continue; }
        if (i === L3) {
          if (!was) { info.l3Ok = rawL < L3_STILL; info.l3T = t; } else if (!info.l3Ok && t - info.l3T >= L3_HOLD_MS) info.l3Ok = true;
          if (!info.l3Ok) continue;
        }
        const acts = this.padActs[i];
        if (acts) for (const a of acts) src[a] = true;
      }
      // 왼쪽 스틱: 원형 데드존 + 8방향 구역
      const secL = stickDigital(info.stL, lx, ly, rawL, engOn, engOff);
      if (secL >= 0) for (const d of SECT_DIRS[secL]) src[d] = true;
      if (rawL >= bestL) {
        bestL = rawL; radial(this.stickL, lx, ly, dz);
        E.x = 0; E.y = 0;
        if (secL >= 0) for (const d of SECT_DIRS[secL]) { if (d === 'left') E.x = -1; else if (d === 'right') E.x = 1; else if (d === 'up') E.y = -1; else E.y = 1; }
      }
      let hot = rawL > STICK_HOT;
      // 오른쪽 스틱 (표준 배치만: 비표준 패드의 축 2–5 는 트리거일 수 있다)
      if (info.standard && A.length >= 4) {
        const rx = A[2] || 0, ry = A[3] || 0, rawR = Math.hypot(rx, ry);
        const secR = stickDigital(info.stR, rx, ry, rawR, engOn, engOff);
        if (secR === 0) src.viewR = true; else if (secR === 4) src.viewL = true;
        if (rawR >= bestR) { bestR = rawR; radial(this.stickR, rx, ry, dz); }
        hot ||= rawR > STICK_HOT;
      }
      // 비표준 배치: 햇 스위치(축 9) 또는 축 6/7 D-pad
      if (!info.standard) {
        let d = null;
        if (A.length >= 10) d = hatDir(A[9]);
        else if (A.length >= 8) { const x = Math.abs(A[6]) > 0.5 ? Math.sign(A[6]) : 0, y = Math.abs(A[7]) > 0.5 ? Math.sign(A[7]) : 0; if (x || y) d = [x, y]; }
        const k = d ? `${d[0]},${d[1]}` : '';
        if (k && k !== info.hat) edge = true;
        info.hat = k;
        if (d) {
          if (d[0] < 0) src.left = true; else if (d[0] > 0) src.right = true;
          if (d[1] < 0) src.up = true; else if (d[1] > 0) src.down = true;
        }
      }
      if (hot && !info.hot) edge = true;
      info.hot = hot;
      if (edge) { active = info; this.anyKeyPressed = true; }
    }
    if (!list || !list.length) { this.stickL.x = this.stickL.y = this.stickL.mag = 0; this.stickR.x = this.stickR.y = this.stickR.mag = 0; }
    if (bestL === 0) { this.stickL.x = this.stickL.y = this.stickL.mag = 0; }
    if (bestR === 0) { this.stickR.x = this.stickR.y = this.stickR.mag = 0; }
    // 이벤트 없이 사라진 패드 (1초 이상 안 보이면 끊긴 것으로). 창이 포커스를 잃었거나 숨은 동안에는 세지 않는다
    // (일부 브라우저는 포커스 없는 창에 패드를 보여 주지 않는다 → 거짓 '연결 끊김'·일시정지 방지)
    let away = false;
    try { away = document.hidden || document.hasFocus?.() === false; } catch { away = false; }
    for (const [idx, info] of this.pads) {
      if (seen.has(idx)) continue;
      if (info.ignored) { this.pads.delete(idx); continue; }
      if (away) { info.missT = 0; continue; }
      if (!info.missT) info.missT = t; else if (t - info.missT > 1000) this._padDisconnected(idx, info.id);
    }
    if (active) {
      const changed = this.padInfo?.index !== active.index && this._setActivePad(active);
      if (this.mode !== 'pad') this.setMode('pad'); else if (changed) this._emitDevice();
    }
  }

  // ── 스텝 ─────────────────────────────────────────────────────────────
  /** 매 고정 스텝 시작 시 호출 */
  update(dt) {
    this.time += dt;
    // 예전 game.js 는 pollFrame 을 부르지 않는다 → 스텝마다 직접 읽는다
    if (nowMs() - this._lastFramePoll > 250) this._frameWork();
    const s = this.sources;
    // 터치 '한 번 누름' (tap): 한 스텝 눌렸다가 다음 스텝에 뗀다
    if (this._touchTaps.size) {
      for (const [a, n] of this._touchTaps) {
        if (n > 1) { s.touch[a] = true; this._touchTaps.set(a, n - 1); } else { s.touch[a] = false; this._touchTaps.delete(a); }
      }
    }
    const aliasUlt = this.awakenAsUlt && !!(s.key.awaken || s.pad.awaken || s.touch.awaken);
    for (const a of ACTIONS) {
      const was = this.state[a];
      this.prev[a] = was;
      const v = !!(s.key[a] || s.pad[a] || s.touch[a]) || (a === 'ult' && aliasUlt);
      this.state[a] = v;
      if (v && !was) { this.pressTime[a] = this.time; this.consumed[a] = false; } else if (!v && was) this.releaseTime[a] = this.time;
    }
    // 스텝 전에 뗀 키는 이번 스텝에 한 번 눌린 것으로 보였으니 이제 뗀다
    if (this._keyFresh.size) this._keyFresh.clear();
    if (this._keyLate.size) { this._keyLate.clear(); this._rebuildKeySources(); }
    this.axisX = (this.state.right ? 1 : 0) - (this.state.left ? 1 : 0);
    this.axisY = (this.state.down ? 1 : 0) - (this.state.up ? 1 : 0);
    // 아날로그: 패드 스틱(스틱이 직접 방향을 걸었을 때) → 터치 스틱 → 디지털
    const L = this.stickL, T = this._touchVec, E = this._stickEng;
    if (L.mag > 0 && this.mode === 'pad' && (E.x || E.y)) { this.analogX = L.x; this.analogY = L.y; this.analogMag = L.mag; } else if (T.mag > 0 && this.mode === 'touch') { this.analogX = T.x; this.analogY = T.y; this.analogMag = T.mag; } else {
      this.analogX = this.axisX; this.analogY = this.axisY; this.analogMag = this.axisX || this.axisY ? 1 : 0;
    }
    // 아날로그는 디지털 방향이 걸린 축에서만 (데드존 밖·방향 문턱 안으로 살짝 기울인 스틱으로는 움직이지 않는다: 0.30 으로 돌리면 멈춤).
    // 부호는 늘 디지털과 같다 (키·D-pad 가 스틱보다 우선)
    if (!this.axisX) this.analogX = 0; else if (Math.sign(this.analogX) !== this.axisX) { this.analogX = this.axisX; this.analogMag = Math.max(this.analogMag, 1); }
    if (!this.axisY) this.analogY = 0; else if (Math.sign(this.analogY) !== this.axisY) this.analogY = this.axisY;
    if (!this.axisX && !this.axisY) this.analogMag = 0;
    this.sprintHint = this.mode === 'touch' && this._touchSprint && T.raw > 0;
    // 방향 이력 (커맨드 입력). 절대 방향으로 기록 → 판정 시 facing 반영. 스틱은 8방향 구역 코드 그대로
    const d = this.dirCode();
    if (d !== this.lastDir) {
      this.lastDir = d;
      if (d !== 'n') this.history.push({ dir: d, t: this.time });
      if (this.history.length > HIST_MAX) this.history.shift();
    }
    for (const a of ['attack', 'jump', 'skill1', 'skill2', 'sub', 'dash']) {
      if (this.state[a] && !this.prev[a]) { this.history.push({ dir: 'btn:' + a, t: this.time }); if (this.history.length > HIST_MAX) this.history.shift(); }
    }
    // 포인터 탭 엣지: update 에서는 탭 직후 첫 스텝에만 true.
    // 한 프레임에 스텝이 여러 번 돌아도 render() 에서 판정하는 버튼이 탭을 놓치지 않도록 latch 해 둔다 (beginRender/endRender)
    this.pointer.tapped = this._tapQueued;
    if (this._tapQueued) { this._tapQueued = false; this._tapLatch = true; }
    this.pointer.justDown = this._downQueued; this._downQueued = false;
  }
  /** 프레임 렌더 직전: 이번 프레임의 스텝들에서 발생한 탭을 render() 쪽에 보이게 한다 */
  beginRender() { this.pointer.tapped = this._tapLatch; }
  /** 프레임 렌더 직후: 탭 소진 (다음 프레임의 update/render 에서 중복 처리 방지) */
  endRender() { this.pointer.tapped = false; this._tapLatch = false; }

  dirCode() {
    const x = this.axisX, y = this.axisY;
    if (x === 0 && y === 0) return 'n';
    if (x === 0) return y < 0 ? 'u' : 'd';
    if (y === 0) return x < 0 ? 'l' : 'r';
    return (y < 0 ? 'u' : 'd') + (x < 0 ? 'l' : 'r');
  }

  // ── 읽기 ─────────────────────────────────────────────────────────────
  _seen(a) { if (a === 'awaken') this.awakenAsUlt = false; }
  down(a) { this._seen(a); return !!this.state[a]; }
  pressed(a) { this._seen(a); return !!this.state[a] && !this.prev[a]; }
  released(a) { this._seen(a); return !this.state[a] && !!this.prev[a]; }
  buffered(a, window = 0.12) {
    this._seen(a);
    this._bufWin[a] = window;
    return !this.consumed[a] && this.time - this.pressTime[a] <= window;
  }
  consume(a) { this.consumed[a] = true; }
  /** 마지막으로 뗀 스텝 시각 (input.time; 없으면 -99) */
  releasedAt(a) { this._seen(a); return this.releaseTime[a] ?? -99; }
  /** 누르고 있는 시간(초), 떼어 있으면 0 */
  heldFor(a) { this._seen(a); return this.state[a] ? this.time - this.pressTime[a] : 0; }
  /** 모든 액션 입력을 무시 상태로 (장면 전환 직후 오입력 방지) */
  flush() {
    for (const a of ACTIONS) { this.consumed[a] = true; this.prev[a] = this.state[a]; }
    this.pointer.tapped = false; this.pointer.justDown = false; this._tapLatch = false;
    this.history.length = 0; this._queuedCmd = null;
    this.flushT = this.time; this.flushN++;
  }
  anyPressed() { return ACTIONS.some((a) => !!this.state[a] && !this.prev[a]) || this.pointer.tapped; }

  /** 진동 (haptics.js). strong/weak 0..1, ms */
  rumble(strong, weak, ms, o) { return haptics.rumble(strong, weak, ms, o); }

  /**
   * 터치 기술 원형 메뉴용 (platform §5.5 P2): 고른 커맨드 기술을 입력한 것으로 친다.
   * cmd = 기술의 커맨드 배열 (DOCS[d].tech.cmd), 또는 기술 id ('tech_hadou' 등 — data/lore.js 에서 찾는다).
   * 공격을 한 스텝 눌러 player 의 커맨드 판정이 돌게 하고, 그 판정의 command(seq) 가 이 커맨드면 성공을 돌려준다 (0.5초 안).
   */
  queueCommand(x) {
    const put = (cmd) => {
      if (!Array.isArray(cmd) || !cmd.length) return false;
      this._queuedCmd = { key: cmd.join(','), t: this.time };
      this._touchTaps.set('attack', 2);
      return true;
    };
    if (Array.isArray(x)) return put(x);
    if (typeof x !== 'string' || !x) return false;
    import('../data/lore.js').then((m) => {
      for (const d of Object.values(m.DOCS ?? {})) if (d?.tech?.id === x) { put(d.tech.cmd); return; }
    }).catch((e) => console.error('[input] queueCommand', e));
    return true;
  }

  /**
   * 격투 게임식 커맨드 판정 (MASTER_PLAN §1.21).
   * seq 예: ['d','df','f','btn:attack']  (f=전방, b=후방)
   * facingAt: (t) => 입력 시각 t 에 영웅이 보던 방향 (±1). f/b 는 첫 방향을 넣던 순간의 방향 기준.
   *           예전처럼 숫자 facing 을 주면 그 방향 기준.
   * within: 전체 입력 허용 시간(초). 터치 모드는 0.8초 이상.
   * → { ok: true, facing } 또는 false
   */
  command(seq, facingAt, within = 0.6) {
    if (!Array.isArray(seq) || !seq.length) return false;
    const q = this._queuedCmd;
    if (q) {
      if (this.time - q.t > 0.5) this._queuedCmd = null;
      else if (q.key === seq.join(',')) {
        this._queuedCmd = null;
        this.history.length = 0;
        const f = typeof facingAt === 'function' ? this._faceAt(facingAt, this.time, Number(facingAt) < 0 ? -1 : 1) : Number(facingAt) < 0 ? -1 : 1;
        return { ok: true, facing: f };
      }
    }
    if (this.mode === 'touch') within = Math.max(within, CMD_TOUCH_WINDOW);
    const fn = typeof facingAt === 'function' ? facingAt : null;
    let cur = Number(facingAt);
    cur = Number.isFinite(cur) && cur !== 0 ? (cur > 0 ? 1 : -1) : null;
    const relative = seq.some((s) => !String(s).startsWith('btn:') && /[fb]/.test(s));
    let best = null;
    if (!relative) {
      const m = this._match(seq, 1, within);
      if (m) best = { m, facing: cur ?? (fn ? this._faceAt(fn, m.t0, 1) : 1) };
    } else if (!fn) {
      const F = cur ?? 1;
      const m = this._match(seq, F, within);
      if (m) best = { m, facing: F };
    } else {
      for (const F of [1, -1]) {
        const m = this._match(seq, F, within);
        if (!m) continue;
        if (this._faceAt(fn, m.t0, cur ?? F) !== F) continue;
        if (!best || m.t0 > best.m.t0) best = { m, facing: F };
      }
    }
    if (!best) return false;
    this.history.length = 0;
    return { ok: true, facing: best.facing };
  }
  _faceAt(fn, t, dflt) {
    let f;
    try { f = Number(fn(t)); } catch { f = NaN; }
    return f === 1 || f === -1 ? f : f > 0 ? 1 : f < 0 ? -1 : dflt;
  }
  /** facing F 로 f/b 를 풀어 이력에서 seq 를 찾는다 → {t0 (첫 방향 시각), tEnd} | null */
  _match(seq, F, win) {
    const want = seq.map((s) => {
      s = String(s);
      if (s.startsWith('btn:')) return s;
      return s.replace(/f/g, F > 0 ? 'r' : 'l').replace(/b/g, F > 0 ? 'l' : 'r');
    });
    const h = this.history;
    let wi = want.length - 1;
    let lastT = null, t0 = null;
    for (let i = h.length - 1; i >= 0 && wi >= 0; i--) {
      if (this.time - h[i].t > win) break;
      if (h[i].dir === want[wi]) {
        if (lastT === null) lastT = h[i].t;
        if (!want[wi].startsWith('btn:')) t0 = h[i].t;
        wi--;
      } else if (wi === want.length - 1) {
        // 마지막 입력(버튼)이 가장 최근이어야 함
        if (h[i].dir.startsWith('btn:')) return null;
      }
    }
    if (wi >= 0 || lastT === null) return null;
    // 마지막 버튼은 방금 눌린 것이어야 한다 (버퍼 창만큼은 허용: 히트스톱 중에 누른 공격도 인정)
    const last = want[want.length - 1];
    const grace = last.startsWith('btn:') ? Math.min(0.5, Math.max(0.1, this._bufWin[last.slice(4)] ?? 0)) : 0.1;
    if (this.time - lastT > grace) return null;
    return { t0: t0 ?? lastT, tEnd: lastT };
  }
}
export const input = new Input();
