// 조작 데이터 (platform.md §3–§4, MASTER_PLAN §1.4) — 순수 데이터, import 없음.
//  ACTIONS            입력 액션 전체 (게임플레이 + 메뉴 의미 + 회전)
//  ACTION_NAMES       액션의 한국어 이름 (옵션 › 조작 안내·키 지정 화면, 교체 안내 토스트)
//  REMAPPABLE         옵션에서 바꿀 수 있는 12개 액션 (이동·일시정지·메뉴 결정/취소는 고정)
//  KEY_DEFAULTS       키보드 기본 배치 (액션 → KeyboardEvent.code[], 첫 항목이 안내에 쓰이는 대표 키)
//  PAD_PRESETS        패드 프리셋 arcade(기본)·classic (액션 → 표준 배치 버튼 번호[] 또는 축 이름 'lsx-' …)
//  PAD_MENU           메뉴 의미 바인딩 (결정·취소 위치는 ctrlConfirm 으로 정해진다)
//  TOUCH_BINDINGS     터치 패드 버튼 id (prompts 가 터치 글리프를 그릴 때 쓴다)
//  PAD_FIXED / KEY_FIXED  키 지정에서 거부되는 버튼·키 (START, D-pad / Escape·Enter·방향키)
//  GLYPHS             패드 글리프 표 (xbox / ps / nintendo / generic) — 위치별 표시 이름·색
//  PAD_DETECT, PAD_IGNORE, padSetOf(id), padNameOf(id, set)   컨트롤러 인식 (platform §4.1)
//  KEY_LABELS, keyLabel(code)   키캡 글자
//  TOUCH_LABELS       터치 글리프 글자 (가상 패드 버튼 표시와 같은 말)
//  ACTION_FALLBACK    바인딩이 없을 때 대신 보여 줄 액션 (각성기 → 필살기 길게)
//  HAT                비표준 패드 햇 스위치(축 9) 값 → 방향

/** 모든 액션. 기존 16개 + 각성·탈것·수호신·회전 + 메뉴 의미(이전/다음 탭, 보조 기능 1·2) */
export const ACTIONS = [
  'left', 'right', 'up', 'down',
  'jump', 'attack', 'dash', 'sub', 'skill1', 'skill2', 'ult', 'swap',
  'menu', 'confirm', 'cancel', 'map',
  'awaken', 'mount', 'guard', 'viewL', 'viewR', 'viewReset',
  'prevTab', 'nextTab', 'alt', 'alt2',
];

export const ACTION_NAMES = {
  left: '왼쪽', right: '오른쪽', up: '위', down: '아래',
  jump: '점프', attack: '공격', dash: '대시', sub: '보조무기', skill1: '스킬 1', skill2: '스킬 2',
  ult: '필살기', swap: '스킬 페이지', menu: '일시정지', confirm: '결정', cancel: '취소', map: '빠른 메뉴',
  awaken: '각성기', mount: '탈것 소환/하차', guard: '수호신 스킬',
  viewL: '영웅 왼쪽 회전', viewR: '영웅 오른쪽 회전', viewReset: '회전 초기화·자동 회전',
  prevTab: '이전 탭', nextTab: '다음 탭', alt: '보조 기능', alt2: '보조 기능 2',
};

/** 옵션 › 조작 에서 바꿀 수 있는 액션 (MASTER_PLAN §1.4 Rules) */
export const REMAPPABLE = ['jump', 'attack', 'dash', 'sub', 'skill1', 'skill2', 'swap', 'ult', 'awaken', 'map', 'mount', 'guard'];

/** 키보드 기본 배치. 첫 코드가 안내 글리프에 쓰인다 */
export const KEY_DEFAULTS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown'],
  jump: ['KeyZ', 'Space'], attack: ['KeyX', 'KeyJ'], dash: ['KeyC', 'ShiftLeft', 'ShiftRight', 'KeyK'],
  sub: ['KeyA'], skill1: ['KeyS'], skill2: ['KeyD'], ult: ['KeyF'], swap: ['KeyQ', 'KeyE'],
  awaken: ['KeyV'], mount: ['KeyR'], guard: ['KeyG'], map: ['Tab', 'KeyM', 'KeyI'],
  menu: ['Escape', 'Enter'], confirm: ['KeyZ', 'Space', 'Enter'], cancel: ['KeyX', 'Escape', 'Backspace'],
  // 메뉴: Q 와 E 는 게임에선 둘 다 스킬 페이지지만 메뉴에선 이전/다음 탭으로 구분된다
  prevTab: ['KeyQ', 'KeyS'], nextTab: ['KeyE', 'KeyD'], alt: ['KeyA'], alt2: ['KeyC'],
  viewL: ['Comma'], viewR: ['Period'], viewReset: ['Slash'],
};

/**
 * 패드 프리셋 (표준 배치 버튼 번호). 이동은 D-pad(12–15) + 왼쪽 스틱(축 이름은 안내용; 실제 스틱은 input.js 가 직접 읽는다).
 * arcade: platform §4.2 (DNF 식) · classic: 예전 배치 (B 공격, LT 대시, SELECT 스킬 페이지)
 */
const MOVE = { up: [12, 'lsy-'], down: [13, 'lsy+'], left: [14, 'lsx-'], right: [15, 'lsx+'] };
export const PAD_PRESETS = {
  arcade: {
    ...MOVE,
    jump: [0], attack: [2], dash: [1], sub: [3], skill1: [4], skill2: [5], swap: [6], ult: [7],
    map: [8], menu: [9], mount: [10], guard: [11], awaken: [],
  },
  classic: {
    ...MOVE,
    jump: [0], attack: [1, 2], dash: [6], sub: [3], skill1: [4], skill2: [5], swap: [8], ult: [7],
    map: [], menu: [9], mount: [10], guard: [11], awaken: [],
  },
};

/** 메뉴 의미 (프리셋 공통). confirm/cancel 은 ctrlConfirm 위치에 따라 0/1 이 바뀐다 */
export const PAD_MENU = {
  prevTab: [4], nextTab: [5], alt: [3], alt2: [6],
  viewL: ['rsx-'], viewR: ['rsx+'], viewReset: [11],
};
export const PAD_CONFIRM = { south: { confirm: [0], cancel: [1] }, east: { confirm: [1], cancel: [0] } };

/** 가상 패드 버튼 id (touchpad.js). 없는 액션은 터치 글리프가 없다 (화면 탭 · 안내 문구) */
export const TOUCH_BINDINGS = {
  left: ['stick'], right: ['stick'], up: ['stick'], down: ['stick'],
  jump: ['jump'], attack: ['attack'], dash: ['dash'], sub: ['sub'], skill1: ['skill1'], skill2: ['skill2'],
  ult: ['ult'], swap: ['swap'], map: ['bag'], menu: ['pause'], mount: ['mount'], guard: ['guard'],
  awaken: ['ult'],
};

/** 키 지정에서 거부: START(9)·D-pad(12–15)·홈(16) / Escape·Enter·방향키·W(위) */
export const PAD_FIXED = new Set([9, 12, 13, 14, 15, 16]);
export const KEY_FIXED = new Set(['Escape', 'Enter', 'NumpadEnter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW']);

/** 바인딩이 없을 때 대신 보여 줄 액션: 패드 기본값에서 각성기는 '필살기 길게' */
export const ACTION_FALLBACK = { awaken: 'ult' };

// ── 컨트롤러 인식 (platform §4.1) ──
export const PAD_IGNORE = /uinput|fpc|gpio|keyboard|touchpad|mouse/;
export const PAD_DETECT = [
  ['ps', /054c|sony|playstation|dualshock|dualsense|wireless controller/],
  ['nintendo', /057e|nintendo|pro controller|joy-con|switch/],
  ['xbox', /045e|xbox|xinput|microsoft|28de/],
];
export function padSetOf(id) {
  const s = String(id ?? '').toLowerCase();
  for (const [set, re] of PAD_DETECT) if (re.test(s)) return set;
  return 'generic';
}
/** 토스트에 쓰는 이름 */
export function padNameOf(id, set = padSetOf(id)) {
  const s = String(id ?? '').toLowerCase();
  if (set === 'ps') return /05c4|09cc/.test(s) ? 'DUALSHOCK 4' : 'DualSense';
  if (set === 'nintendo') return /joy-con/.test(s) ? 'Joy-Con' : 'Pro 컨트롤러';
  if (set === 'xbox' && !/28de/.test(s)) return 'Xbox 컨트롤러';
  return '게임패드';
}

/**
 * 패드 글리프 (위치 = 표준 배치 번호). kind: face | shoulder | trigger | select | start | stick | dpad
 * face: {label, color} — ps 는 기호 모양(cross/circle/square/triangle)으로 그린다.
 */
const FACE_KIND = ['face', 'face', 'face', 'face', 'shoulder', 'shoulder', 'trigger', 'trigger', 'select', 'start', 'stick', 'stick', 'dpad', 'dpad', 'dpad', 'dpad', 'home'];
export const PAD_KIND = FACE_KIND;
export const GLYPHS = {
  xbox: {
    face: [{ label: 'A', color: '#5fc45a' }, { label: 'B', color: '#e2553f' }, { label: 'X', color: '#3f8ee0' }, { label: 'Y', color: '#e8c23e' }],
    labels: { 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'LS', 11: 'RS', 16: 'Xbox' },
    icon: { 8: 'view', 9: 'menu' },
  },
  ps: {
    face: [{ label: '✕', shape: 'cross', color: '#8fb6ff' }, { label: '○', shape: 'circle', color: '#ff7474' }, { label: '□', shape: 'square', color: '#f590d4' }, { label: '△', shape: 'triangle', color: '#3fd2bc' }],
    labels: { 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3', 16: 'PS' },
    icon: {},
  },
  nintendo: {
    face: [{ label: 'B', color: '#ece4da' }, { label: 'A', color: '#ece4da' }, { label: 'Y', color: '#ece4da' }, { label: 'X', color: '#ece4da' }],
    labels: { 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: '−', 9: '+', 10: 'L', 11: 'R', 16: 'HOME' },
    icon: { 8: 'minus', 9: 'plus' },
  },
  generic: {
    face: [{ label: 'A', color: '#b8b4ae' }, { label: 'B', color: '#b8b4ae' }, { label: 'X', color: '#b8b4ae' }, { label: 'Y', color: '#b8b4ae' }],
    labels: { 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'SELECT', 9: 'START', 10: 'L3', 11: 'R3', 16: 'HOME' },
    icon: {},
  },
};
/** 글리프 세트별 버튼 이름 (옵션 안내 문구용 텍스트) */
export function padButtonName(set, index) {
  const G = GLYPHS[set] ?? GLYPHS.generic;
  if (index >= 0 && index <= 3) return G.face[index].label;
  if (index >= 12 && index <= 15) return ['↑', '↓', '←', '→'][index - 12];
  return G.labels[index] ?? `#${index}`;
}

// ── 키캡 글자 ──
export const KEY_LABELS = {
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Esc', Backspace: 'Back', Tab: 'Tab',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
  MetaLeft: 'Meta', MetaRight: 'Meta', CapsLock: 'Caps',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
  Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins', Delete: 'Del',
};
export function keyLabel(code) {
  if (typeof code !== 'string') return '?';
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return 'Num' + m[1];
  if (/^F\d{1,2}$/.test(code)) return code;
  return code.length > 6 ? code.slice(0, 6) : code;
}

/** 터치 글리프 (가상 패드 버튼과 같은 말) */
export const TOUCH_LABELS = {
  jump: '점프', attack: '공격', dash: '대시', sub: '보조', skill1: 'S1', skill2: 'S2', ult: '필살', swap: '⇄',
  bag: '가방', pause: 'Ⅱ', mount: '탑승', guard: '수호', stick: '스틱',
};

/** 비표준 패드 햇(축 9): (v + 1) / (2/7) 를 반올림한 칸 → [x, y]. |v| > 1.05 이면 중립 */
export const HAT = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
