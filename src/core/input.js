// 입력 시스템: 키보드 · 게임패드 · 모바일 터치(가상 패드) · 포인터(메뉴 터치/클릭)
// 사용법:
//   input.down('attack')      지금 눌려 있음
//   input.pressed('jump')     이번 프레임에 눌림 (엣지)
//   input.released('jump')    이번 프레임에 뗌
//   input.buffered('jump', 0.12)  최근 0.12초 안에 눌렸고 아직 소비되지 않음 → input.consume('jump')
//   input.axisX / axisY       -1..1
//   input.command(['down','downfwd','fwd','attack'], facing, 0.5)  격투 커맨드 판정
//   input.pointer {x,y,down,tapped,active}  논리 좌표 (게임 화면 기준)
// 액션 목록
export const ACTIONS = [
  'left', 'right', 'up', 'down',
  'jump', 'attack', 'dash', 'sub', 'skill1', 'skill2', 'ult', 'swap',
  'menu', 'confirm', 'cancel', 'map',
];

const KEYMAP = {
  ArrowLeft: ['left'], ArrowRight: ['right'], ArrowUp: ['up'], ArrowDown: ['down'],
  KeyZ: ['jump', 'confirm'], Space: ['jump', 'confirm'],
  KeyX: ['attack', 'cancel'], KeyJ: ['attack'],
  KeyC: ['dash'], ShiftLeft: ['dash'], ShiftRight: ['dash'], KeyK: ['dash'],
  KeyA: ['sub'], KeyS: ['skill1'], KeyD: ['skill2'], KeyF: ['ult'], KeyV: ['ult'],
  KeyQ: ['swap'], KeyE: ['swap'], KeyW: ['up'],
  Enter: ['menu', 'confirm'], Escape: ['menu', 'cancel'], Backspace: ['cancel'],
  Tab: ['map'], KeyM: ['map'],
};

/** 글자를 입력할 수 있는 요소인가 (읽기 전용 칸은 제외 — 세이브 코드 내보내기처럼 키로 버튼을 조작) */
const isTyping = (t) => !!t && (t.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.readOnly));

// 표준 게임패드 매핑
const PADMAP = [
  ['jump', 'confirm'], // 0 A
  ['attack', 'cancel'], // 1 B
  ['attack'], // 2 X
  ['sub'], // 3 Y
  ['skill1'], // 4 LB
  ['skill2'], // 5 RB
  ['dash'], // 6 LT
  ['ult'], // 7 RT
  ['map'], // 8 select
  ['menu'], // 9 start
  [], [],
  ['up'], ['down'], ['left'], ['right'], // 12-15 dpad
];

class Input {
  constructor() {
    this.state = {}; // action -> bool (현재)
    this.prev = {};
    this.pressTime = {}; // action -> game time of last press
    this.consumed = {};
    this.sources = { key: {}, pad: {}, touch: {} };
    this.axisX = 0; this.axisY = 0;
    this.time = 0;
    this.history = []; // [{dir, t}] 방향 입력 이력 (커맨드용)
    this.lastDir = 'n';
    this.pointer = { x: 0, y: 0, down: false, tapped: false, active: false, justDown: false };
    this._tapQueued = false; this._downQueued = false;
    this._tapLatch = false; // 이번 프레임 스텝에서 발생한 탭 → 같은 프레임의 render() 까지 유지
    this.padOff = false;    // 가상 패드가 장면에 의해 꺼져 있으면 터치 버튼 입력 무시
    this.anyKeyPressed = false;
    this.touchMode = false;
    this.game = null;
    this.textCapture = null; // 이니셜 입력 등 문자 입력용 콜백
    for (const a of ACTIONS) { this.state[a] = false; this.prev[a] = false; this.pressTime[a] = -99; }
  }

  init(game) {
    this.game = game;
    window.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return; // 계정 화면 등 실제 입력 칸에서 타이핑 중이면 게임 키로 쓰지 않음
      if (this.textCapture && e.key.length === 1) { this.textCapture(e.key); }
      const acts = KEYMAP[e.code];
      if (acts) {
        e.preventDefault();
        for (const a of acts) this.sources.key[a] = true;
      }
      this.anyKeyPressed = true;
      this.game?.audio?.unlock();
    });
    window.addEventListener('keyup', (e) => {
      const acts = KEYMAP[e.code];
      if (acts) { e.preventDefault(); for (const a of acts) this.sources.key[a] = false; }
    });
    window.addEventListener('blur', () => { this.sources.key = {}; this.sources.touch = {}; });

    const cv = game.canvas;
    const toLogical = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * game.viewW, y: ((e.clientY - r.top) / r.height) * game.viewH };
    };
    cv.addEventListener('pointerdown', (e) => {
      const p = toLogical(e);
      Object.assign(this.pointer, p, { down: true, active: true });
      this._downQueued = true;
      this.game?.audio?.unlock();
      this.anyKeyPressed = true;
    });
    cv.addEventListener('pointermove', (e) => {
      const p = toLogical(e);
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.active = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (this.pointer.down) {
        const p = toLogical(e);
        this.pointer.x = p.x; this.pointer.y = p.y;
        this._tapQueued = true;
      }
      this.pointer.down = false;
    });
    window.addEventListener('touchstart', () => this.setTouchMode(true), { passive: true });
    this.setupTouchPad();
    // 터치 기기는 부팅 시점부터 터치 모드 (첫 터치 전에도 세로 모드 안내·터치용 안내문 표시)
    try {
      const coarse = window.matchMedia?.('(pointer: coarse)').matches;
      if (coarse && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) this.setTouchMode(true);
    } catch { /* 무시 */ }
  }

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    document.getElementById('touch')?.classList.toggle('hidden', !on);
    document.body.classList.toggle('touch', on);
  }

  /** 장면에 따라 가상 패드 표시/숨김 (game.js 가 매 프레임 호출). 숨길 때 눌려 있던 버튼·스틱을 모두 뗀다 */
  setPadOff(off) {
    if (this.padOff === off) return;
    this.padOff = off;
    const root = document.getElementById('touch');
    root?.classList.toggle('scene-off', off);
    if (off) {
      this.sources.touch = {};
      root?.querySelectorAll('.on').forEach((b) => b.classList.remove('on'));
      const knob = root?.querySelector('#stick .knob');
      if (knob) knob.style.transform = '';
    }
  }

  /** 모바일 가상 패드: #touch 안의 [data-act] 버튼과 #stick 영역 */
  setupTouchPad() {
    const root = document.getElementById('touch');
    if (!root) return;
    const stick = root.querySelector('#stick');
    const knob = root.querySelector('#stick .knob');
    let stickId = null, cx = 0, cy = 0;
    const setDir = (dx, dy) => {
      if (this.padOff) return;
      const t = this.sources.touch;
      const dead = 18;
      t.left = dx < -dead; t.right = dx > dead;
      t.up = dy < -dead * 1.6; t.down = dy > dead * 1.6;
      if (knob) {
        const m = Math.min(1, 46 / Math.max(1, Math.hypot(dx, dy)));
        knob.style.transform = `translate(${dx * m}px, ${dy * m}px)`;
      }
    };
    if (stick) {
      stick.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        stickId = e.pointerId; stick.setPointerCapture(e.pointerId);
        const r = stick.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        setDir(e.clientX - cx, e.clientY - cy);
        this.game?.audio?.unlock();
      });
      stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) setDir(e.clientX - cx, e.clientY - cy); });
      const end = (e) => { if (e.pointerId === stickId) { stickId = null; setDir(0, 0); } };
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
        for (const a of acts) this.sources.touch[a] = true;
        this.game?.audio?.unlock();
        if (navigator.vibrate && this.game?.settings?.vibration) navigator.vibrate(8);
      };
      const off = (e) => {
        e.preventDefault();
        btn.classList.remove('on');
        for (const a of acts) this.sources.touch[a] = false;
      };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    });
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = this.sources.pad;
    for (const k in p) p[k] = false;
    for (const pad of pads) {
      if (!pad) continue;
      pad.buttons.forEach((b, i) => {
        if (b.pressed && PADMAP[i]) for (const a of PADMAP[i]) p[a] = true;
      });
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (ax < -0.4) p.left = true;
      if (ax > 0.4) p.right = true;
      if (ay < -0.5) p.up = true;
      if (ay > 0.5) p.down = true;
      if (pad.buttons.some((b) => b.pressed)) this.anyKeyPressed = true;
    }
  }

  /** 매 고정 스텝 시작 시 호출 */
  update(dt) {
    this.time += dt;
    this.pollPad();
    for (const a of ACTIONS) {
      this.prev[a] = this.state[a];
      const s = this.sources;
      this.state[a] = !!(s.key[a] || s.pad[a] || s.touch[a]);
      if (this.state[a] && !this.prev[a]) { this.pressTime[a] = this.time; this.consumed[a] = false; }
    }
    this.axisX = (this.state.right ? 1 : 0) - (this.state.left ? 1 : 0);
    this.axisY = (this.state.down ? 1 : 0) - (this.state.up ? 1 : 0);
    // 방향 이력 (커맨드 입력). 절대 방향으로 기록 → 판정 시 facing 반영
    const d = this.dirCode();
    if (d !== this.lastDir) {
      this.lastDir = d;
      if (d !== 'n') this.history.push({ dir: d, t: this.time });
      if (this.history.length > 16) this.history.shift();
    }
    for (const a of ['attack', 'jump', 'skill1', 'skill2', 'sub', 'dash']) {
      if (this.pressed(a)) { this.history.push({ dir: 'btn:' + a, t: this.time }); if (this.history.length > 16) this.history.shift(); }
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

  down(a) { return !!this.state[a]; }
  pressed(a) { return !!this.state[a] && !this.prev[a]; }
  released(a) { return !this.state[a] && !!this.prev[a]; }
  buffered(a, window = 0.12) { return !this.consumed[a] && this.time - this.pressTime[a] <= window; }
  consume(a) { this.consumed[a] = true; this.pressTime[a] = -99; }
  /** 모든 액션 입력을 무시 상태로 (장면 전환 직후 오입력 방지) */
  flush() {
    for (const a of ACTIONS) { this.consumed[a] = true; this.prev[a] = this.state[a]; }
    this.pointer.tapped = false; this.pointer.justDown = false; this._tapLatch = false;
    this.history.length = 0;
  }
  anyPressed() { return ACTIONS.some((a) => this.pressed(a)) || this.pointer.tapped; }

  /**
   * 격투 게임식 커맨드 판정.
   * seq 예: ['d','df','f','btn:attack']  (f=전방, b=후방: facing 기준)
   * within: 전체 입력 허용 시간(초)
   */
  command(seq, facing, within = 0.6) {
    const map = (s) => {
      if (s.startsWith('btn:')) return s;
      return s.replace(/f/g, facing > 0 ? 'r' : 'l').replace(/b/g, facing > 0 ? 'l' : 'r');
    };
    const want = seq.map(map);
    const h = this.history;
    let wi = want.length - 1;
    let lastT = null;
    for (let i = h.length - 1; i >= 0 && wi >= 0; i--) {
      if (this.time - h[i].t > within) break;
      if (h[i].dir === want[wi]) {
        if (lastT === null) lastT = h[i].t;
        wi--;
      } else if (wi === want.length - 1) {
        // 마지막 입력(버튼)이 가장 최근이어야 함
        if (h[i].dir.startsWith('btn:')) return false;
      }
    }
    if (wi < 0 && lastT !== null && this.time - lastT < 0.1) {
      this.history.length = 0;
      return true;
    }
    return false;
  }
}

export const input = new Input();
