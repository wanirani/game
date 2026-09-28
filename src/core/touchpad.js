// 캔버스 가상 패드 — platform.md §5.1–5.5, §11 WP-2 · MASTER_PLAN §1.4 (배치·규칙), §1.8 (HUD), §1.10 P-18 · companions §6 (탑승/수호)
// feel §3.1 (터치 질주 고리), §6.1 (필살 길게 누르기 고리) — owner: PLAT-TOUCH
//
// 구조
//   #tpad    화면 전체 이벤트 층. 평소에는 pointer-events:none: 터치는 window 캡처 단계에서 받는다. 버튼·스틱 자리를 누른 손가락만
//            패드가 가져가고(stopPropagation, 그래서 그 밑의 캔버스 탭은 생기지 않는다), 나머지 탭은 캔버스로 그대로 간다.
//            배치 편집기가 열리면 .edit 가 붙어 모든 입력을 받는다 (DOM 도구 막대 + 어두운 배경).
//   #tpadcv  버튼·스틱을 그리는 투명 캔버스 (pointer-events:none). 백킹 DPR = min(기기 DPR, game.dpr, 1.2 MP 예산).
//            상태가 바뀔 때만, 최대 30 Hz 로 다시 그린다. 패드가 숨으면 display:none (합성 비용 없음).
//   예전 DOM 패드(#touch)는 초기화할 때 지운다 (예전 도우미 setPad·hidePad·padPush·townPad 는 #touch 가 없으면 조용히 넘어간다).
//
// API
//   initTouchPad(input) → 패드 객체 | null (DOM 없음)     input.js 가 부른다. 여러 번 불러도 한 번만 초기화한다
//   touchpad.setVisible(on, { hideButtons })  표시의 유일한 주인 game.syncPad 가 매 프레임 부른다 (같은 값이면 아무것도 하지 않음)
//                                             hideButtons: true(동작 버튼 전부) | [id…] | null — 장면 플래그 padHideButtons 그대로
//   touchpad.visible                          마지막으로 적용된 표시 여부
//   touchpad.openEditor({ onClose(saved) }) · touchpad.closeEditor({ save })   배치 편집기 (옵션 › 터치 › 버튼 배치 편집)
//                                             저장하면 settings.touchLayout = {id:{right,bottom,d}} (크기 등급·touchScale 1 기준 CSS px) 후
//                                             game.saves.saveSettings. closeEditor() / {save:false} 는 버린다. touchpad.editorOpen
//   touchpad.occupiedRects() → [{id,x,y,w,h}] 논리 px: 지금 보이는 버튼 + Ⅱ/가방(+⛶). 배치가 같으면 같은 배열 (hudLayout)
//   touchpad.stickZone() → {x,y,w,h} | null   논리 px: 스틱이 쉬는 자리 (world.stickRect → clearStickAtSpawn)
//   touchpad.buttons({ all }) → [{id,cx,cy,d}] CSS px (QA 드라이버). all: 상태 때문에 숨긴 버튼(탈것·수호)까지 전부
//   touchpad.setTechRadial(fn | null)         ⇄ 350ms 길게 누르기 → fn({x, y}) (기술 원형 메뉴, platform §5.5 P2).
//                                             없으면 길게 눌러도 손을 뗄 때 페이지를 넘긴다
//   touchpad.layoutInfo()                     디버그: {sizeClass, k, kEff, band, bandH, left, custom, yMin}
//
// 버튼 id: attack jump dash sub skill1 skill2 ult swap mount guard · 시스템 pause bag fullscreen
// 입력: input.touch.set(action, on) (버튼), input.touch.axis(x, y, {sprint}) (스틱; 반지름 단위, 방향 구역은 input 이 정한다), clear()
// 규칙 (MASTER_PLAN §1.4): 누르는 반경 = 보이는 반지름 + 10 px, 겹치면 가장 가까운 버튼. 손가락을 밀면 버튼이 바뀐다 (touchSlide).
//   공격·점프 사이 띠(가운데 약 12 px)는 둘 다. ⇄ 는 손을 뗄 때(350ms 미만) 누른다 (길게 누르기 = 기술 원형 메뉴 자리),
//   빠른 연타는 줄 세워 모두 넘긴다. 게임 스텝이 돌기 전에 뗀 눌림은 한 스텝 뒤에 뗀다 (짧은 탭이 사라지지 않게).
//   떠 있는 스틱: 화면 왼쪽 45 %·위 64px 아래 아무 곳. 10px 데드존, 1.15R 질주, 1.4R 넘으면 받침이 따라온다. 뗀 뒤 0.3초에 사라진다.
//   단, 캔버스에 그린 UI 버튼(ui.taps 등록 영역, 맨 위 장면의 hudRects — 마을 '▲ 대화'·메뉴) 위에서는 스틱을 만들지 않고 탭을 넘긴다.
// 주의 (순환 import): game.js · world.js · hud_layout.js 가 이 파일을 import 한다 → 모듈 최상위에서 import 값에 접근하지 않는다.
import * as PF from './platform.js';
import * as SAVE from './save.js';
import { FONT, onFontEpoch } from './ui.js';
import * as UI from './ui.js';            // UI.taps (공용 탭 영역 등록부) — 스틱 자리의 캔버스 버튼은 캔버스로 보낸다
import { input as INPUT } from './input.js';
import * as HAP from './haptics.js';

// ───────────────────────── 배치 ─────────────────────────
/** 동작 버튼 (편집기에서 옮길 수 있는 것) */
export const PAD_IDS = ['attack', 'jump', 'dash', 'sub', 'skill1', 'skill2', 'ult', 'swap', 'mount', 'guard'];
export const SYS_IDS = ['pause', 'bag', 'fullscreen'];
/** 크기 등급 S 기준 [right, bottom, 지름] (CSS px, 안전 영역 오른쪽 아래 모서리에서 버튼 중심까지) — MASTER_PLAN §1.4 */
export const PAD_LAYOUT_S = {
  attack: [108, 58, 72], jump: [36, 118, 68], dash: [190, 44, 56], sub: [118, 146, 54],
  skill1: [190, 122, 54], skill2: [50, 200, 54], ult: [262, 96, 58], swap: [128, 214, 44],
  mount: [262, 176, 48], guard: [196, 200, 48],
};
/** 태블릿 띠 배치 (캔버스 아래 남는 세로 ≥ 120 CSS px): 두 줄로 납작하게. 윗줄 위 끝 157 (× 배율) */
export const PAD_LAYOUT_BAND = {
  jump: [36, 46, 68], attack: [124, 46, 72], dash: [206, 46, 56], swap: [284, 46, 44], guard: [356, 46, 48],
  skill2: [44, 128, 54], sub: [124, 128, 54], skill1: [204, 128, 54], ult: [284, 128, 58], mount: [356, 128, 48],
};
const MIN_D = 44;          // 버튼 최소 지름 (CSS px)
const MAX_D_EDIT = 96;     // 편집기 크기 조절 상한 (§5.3)
const GAP = 14;            // 버튼 사이 최소 간격 (수용 조건 12 px + 여유)
const SLOP = 10;           // 누르는 반경 = 보이는 반지름 + 10
const SYS_SLOP = 8;
const BAND_MIN = 120;      // 태블릿 띠로 보는 캔버스 아래 여백 (CSS px)
const HUD_TOP = 88;        // 오른손: 점수 칸 아래 (논리 px, MASTER_PLAN §1.8)
const HUD_TOP_LEFT = 172;  // 왼손 모드: 왼쪽 위 HUD 묶음(준비 문구까지) 아래
const STICK_R = 60;        // 스틱 받침 반지름 (Ø120), 손잡이 Ø52
const KNOB_R = 26;
const STICK_DZ = 10;       // 데드존 (CSS px)
const SPRINT_K = 1.15, REANCHOR_K = 1.4;
const STICK_FADE = 0.3;    // 뗀 뒤 사라지는 시간 (s)
const SWAP_LONG = 350;     // ms
const SWAP_HOLD_MS = 100, SWAP_HOLD_STEPS = 3;
const DRAW_MS = 32;        // 다시 그리기 간격 하한 (≤ 30 Hz; 60/120 Hz 화면에서 33.3ms 마다)
const OVERLAY_MP = 1.2e6;  // 오버레이 백킹 픽셀 상한

/** 버튼 → 입력 액션 (예전 DOM 패드와 같다: 점프는 결정, Ⅱ 는 취소도) */
const ACTS = {
  attack: ['attack'], jump: ['jump', 'confirm'], dash: ['dash'], sub: ['sub'], skill1: ['skill1'], skill2: ['skill2'],
  ult: ['ult'], swap: ['swap'], mount: ['mount'], guard: ['guard'], pause: ['menu', 'cancel'], bag: ['map'], fullscreen: [],
};
const LABEL = {
  attack: '공격', jump: '점프', dash: '대시', sub: '보조', skill1: 'S1', skill2: 'S2', ult: '필살', swap: '⇄', mount: '탑승', guard: '수호',
};
/** padHideButtons 를 정하지 않은 마을: 전투 버튼 숨김 (hub.js NO_COMBAT + 수호; 탈것은 남긴다) */
const HUB_HIDE = ['attack', 'sub', 'skill1', 'skill2', 'ult', 'swap', 'guard'];

const TAU = Math.PI * 2;
const ZERO = Object.freeze({ l: 0, r: 0, t: 0, b: 0 });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const hasDom = () => typeof document !== 'undefined' && typeof window !== 'undefined';
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** 터치 화면이 있는 기기 (지금 입력 모드와 무관) — 초기화 때 버튼 그림을 미리 구울지 */
function touchScreen() {
  try { return (navigator.maxTouchPoints ?? 0) > 0 || !!window.matchMedia?.('(pointer: coarse)')?.matches; } catch { return false; }
}

// ───────────────────────── 상태 ─────────────────────────
const S = {
  inited: false, input: null, root: null, cv: null, ctx: null, link: null,
  visible: false, ownerT: -1e9,              // 마지막 game.syncPad 호출 시각 (그 뒤 0.6초 동안 예전 경로는 무시)
  hideOpt: undefined, hbRef: null, hbLen: -1, hidden: new Set(), hiddenKey: '',
  L: null, sig: [], fontEpoch: 0,
  shown: {}, cmp: null,                        // 상태에 따른 표시 (탈것·수호) + 마지막 hudInfo
  ptrs: new Map(),                             // pointerId → {kind:'btn'|'stick'|'sys', ids:[], id, t0, x, y, swapT, radial}
  counts: Object.create(null),                 // 액션 → 누르고 있는 손가락 수
  pressIt: Object.create(null), late: new Map(), // 액션 → 누를 때 input.time · 미룬 뗌 (actOff)
  stick: { active: false, id: -1, ax: 0, ay: 0, fx: 0, fy: 0, sprint: false, relT: -1e9, ex: 0, ey: 0 },
  swapHold: null,                              // {t, it} 손을 뗀 뒤 ⇄ 를 잠깐 누르고 있는 중
  swapGap: null, swapQ: 0,                     // ⇄ 를 뗀 직후 (다음 눌림까지 한 스텝) · 줄 선 ⇄ 탭 수
  radialFn: null,
  editor: null,
  raf: 0, lastDraw: -1e9, pending: true, drawSig: [], anim: false,
  spr: Object.create(null), spriteKey: '',   // 버튼 id → [보통, 눌림] 캔버스: 한 번만 만들고 다시 구울 때는 같은 캔버스에 그린다
  lver: 0,                                     // 배치를 다시 계산할 때마다 +1 (occupiedRects 캐시)
  occ: [], occKey: '', occState: { lver: -1, hidden: '', sh: 0, ver: 0 },
};

function game() { return S.input?.game ?? INPUT?.game ?? null; }
function settings() { return game()?.settings ?? {}; }
function inputRef() { return S.input ?? INPUT; }
function touchMode() { const i = inputRef(); return i ? (i.mode != null ? i.mode === 'touch' : !!i.touchMode) : false; }

// ───────────────────────── 기하 ─────────────────────────
function insetsCss() {
  const g = game();
  const s = g?.safeCss;
  if (s && typeof s.l === 'number') return s;
  try { const r = PF.safeInsets?.(); if (r && typeof r.l === 'number') return r; } catch { /* 스텁 */ }
  return ZERO;
}
function canvasBox() {
  const g = game();
  const r = g?.canvasRect;
  if (r && r.w > 0 && r.h > 0) return r;
  try {
    const cv = g?.canvas || document.getElementById('screen');
    const b = cv?.getBoundingClientRect?.();
    if (b && b.width > 0 && b.height > 0) return { x: b.left, y: b.top, w: b.width, h: b.height };
  } catch { /* DOM 없음 */ }
  return { x: 0, y: 0, w: window.innerWidth || 1, h: window.innerHeight || 1 };
}
function sizeClass(h) { return h < 400 ? ['S', 1] : h < 700 ? ['M', 1.1] : ['L', 1.25]; }
function fsShown() {
  try {
    const ok = PF.canFullscreen?.() ?? PF.fullscreenAvailable?.();
    if (ok === false) return false;
    if (ok === undefined) { const d = document; if (!(d.fullscreenEnabled || d.webkitFullscreenEnabled) || window.__BN_APP) return false; }
    return !(document.fullscreenElement || document.webkitFullscreenElement);
  } catch { return false; }
}
/** 저장된 사용자 배치 (검증된 항목만) → {id:[right,bottom,d]} | null */
function customLayout(st) {
  const v = st.touchLayout;
  if (!v || typeof v !== 'object') return null;
  let out = null;
  for (const id of PAD_IDS) {
    const b = v[id];
    if (!b || typeof b !== 'object') continue;
    const r = b.right, bt = b.bottom, d = b.d;
    if (![r, bt, d].every((x) => typeof x === 'number' && Number.isFinite(x)) || d < 20 || d > 400) continue;
    // 편집기는 Ø 44–96 CSS px 을 배율(≥ 0.8)로 나눠 저장한다 → 120 을 넘는 값은 고친 저장본: 화면을 덮지 않게 자른다
    (out ??= {})[id] = [r, bt, Math.min(d, MAX_D_EDIT / 0.8)];
  }
  return out;
}

/** 버튼들을 서로 GAP 이상 떨어뜨리고 경계 안에 둔다 (pinned 는 움직이지 않는다). 이미 맞으면 아무것도 바꾸지 않는다 */
function settle(list, B, pinned = null, iters = 120) {
  const fit = (b) => {
    b.cx = clamp(b.cx, B.x0 + b.d / 2, Math.max(B.x0 + b.d / 2, B.x1 - b.d / 2));
    b.cy = clamp(b.cy, B.y0 + b.d / 2, Math.max(B.y0 + b.d / 2, B.y1 - b.d / 2));
  };
  for (const b of list) if (b.id !== pinned) fit(b);
  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], C = list[j];
        let dx = C.cx - A.cx, dy = C.cy - A.cy, dist = Math.hypot(dx, dy);
        const need = A.d / 2 + C.d / 2 + GAP;
        if (dist >= need - 0.05) continue;
        if (dist < 0.001) { dx = -1; dy = -0.5; dist = Math.hypot(dx, dy); }
        const push = need - dist + 0.1, ux = dx / dist, uy = dy / dist;
        const wa = A.id === pinned ? 0 : C.id === pinned ? 1 : 0.5, wc = 1 - wa;
        A.cx -= ux * push * wa; A.cy -= uy * push * wa; C.cx += ux * push * wc; C.cy += uy * push * wc;
        if (A.id !== pinned) fit(A);
        if (C.id !== pinned) fit(C);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return list;
}

const LSIG = { i: 0, ch: false };
/** 배치 서명 칸 하나 비교·기록 (NaN 은 NaN 과 같다고 본다) */
function lput(x) {
  const v = S.sig, i = LSIG.i++, o = v[i];
  if (o !== x && !(x !== x && o !== o)) { v[i] = x; LSIG.ch = true; }
}
/**
 * 배치 계산 (창·캔버스·안전 영역·설정이 바뀔 때만; 나머지는 캐시).
 * L = { W, H, ins, cr, cs, vw, vh, k, kEff, cls, band, bandH, left, custom, yMin, bounds, btn:{id:{id,cx,cy,d}}, sys:{…}, R, home, zone }
 */
function layout(force = false) {
  if (!hasDom()) return null;
  const g = game(), st = settings();
  const W = window.innerWidth || 1, H = window.innerHeight || 1;
  const ins = insetsCss(), cr = canvasBox();
  const vw = g?.viewW || Math.round(clamp((540 * cr.w) / cr.h, 960, 1280)), vh = g?.viewH || 540;
  const safeT = st.safeArea === 'full' ? num(g?.safe?.t, 0) : 0;
  // 바뀌었나: 매 프레임 두 번쯤 불리므로 배열을 새로 만들지 않고 제자리에서 비교·기록한다
  LSIG.i = 0; LSIG.ch = false;
  lput(W); lput(H); lput(ins.l); lput(ins.r); lput(ins.t); lput(ins.b); lput(cr.x); lput(cr.y); lput(cr.w); lput(cr.h); lput(vw); lput(vh); lput(safeT);
  lput(st.touchScale); lput(st.touchLeftHanded); lput(st.touchLayout); lput(st.safeArea); lput(st.touchStick); lput(fsShown()); lput(g?.dpr); lput(S.fontEpoch);
  if (!force && S.L && !LSIG.ch) return S.L;
  S.lver++;

  const cls = sizeClass(H);
  const ts = clamp(num(Number(st.touchScale), 1) || 1, 0.8, 1.3);
  const k = cls[1] * ts;
  const left = !!st.touchLeftHanded;
  const cs = cr.h / vh;
  const bandH = H - ins.b - (cr.y + cr.h);
  const band = bandH >= BAND_MIN;
  const yMin = Math.max(ins.t, cr.y + ((left ? HUD_TOP_LEFT : HUD_TOP) + safeT) * cs);
  const T = band ? PAD_LAYOUT_BAND : PAD_LAYOUT_S;
  const custom = customLayout(st);
  // 기본 배치: 점수 칸(y 88) 위로, 화면 폭 56 % 너머로 올라가지 않게 배율을 줄인다 (touchScale 1.3 도 phone2 에서 SCORE 를 덮지 않게)
  let tallest = 0, extent = 0;
  for (const id of PAD_IDS) { const [r, b, d] = T[id]; tallest = Math.max(tallest, b + d / 2); extent = Math.max(extent, r + d / 2); }
  const availH = H - ins.b - yMin, availW = (W - ins.l - ins.r) * 0.56;
  let kEff = Math.min(k, availH / tallest, availW / extent);
  if (band) kEff = Math.min(kEff, Math.max((bandH - 4) / tallest, Math.min(1, k)));
  kEff = Math.max(0.5, kEff);
  const bounds = { x0: ins.l, x1: W - ins.r, y0: yMin, y1: H - ins.b };
  const btnList = [];
  for (const id of PAD_IDS) {
    const c = custom?.[id];
    const [r, b, d0] = c ?? T[id];
    const kk = c ? k : kEff;
    const d = Math.max(MIN_D, d0 * kk);
    btnList.push({ id, cx: left ? ins.l + r * kk : W - ins.r - r * kk, cy: H - ins.b - b * kk, d });
  }
  settle(btnList, bounds);
  const btn = {};
  for (const b of btnList) btn[b.id] = b;

  // 시스템 버튼: 안전 영역 위쪽 가운데 (Ⅱ 왼쪽, 가방 오른쪽, ⛶ 는 되는 곳에서만 가방 오른쪽)
  const sd = Math.max(MIN_D, 44 * cls[1]);
  const mid = ins.l + (W - ins.l - ins.r) / 2, sy = ins.t + 6 + sd / 2;
  const sys = {
    pause: { id: 'pause', cx: mid - 6 - sd / 2, cy: sy, d: sd },
    bag: { id: 'bag', cx: mid + 6 + sd / 2, cy: sy, d: sd },
  };
  if (fsShown()) sys.fullscreen = { id: 'fullscreen', cx: mid + 6 + sd + 12 + sd / 2, cy: sy, d: sd };

  // 스틱
  const R = STICK_R * cls[1] * ts;
  const off = 24 + SPRINT_K * R;
  const home = { x: left ? W - ins.r - off : ins.l + off, y: H - ins.b - off };
  const zw = 0.45 * (W - ins.l - ins.r);
  const zone = left ? { x0: W - ins.r - zw, x1: W - ins.r, y0: ins.t + 64, y1: H } : { x0: ins.l, x1: ins.l + zw, y0: ins.t + 64, y1: H };

  S.L = { W, H, ins, cr, cs, vw, vh, k, kEff, ts, cls: cls[0], band, bandH, left, custom: !!custom, yMin, bounds, btn, sys, sd, R, home, zone };
  S.spriteKey = ''; // 크기가 바뀌었을 수 있다 → 버튼 그림 다시 굽기
  S.pending = true;
  if (S.editor) editorRelayout();
  return S.L;
}

/** 지금 화면에 보이는 동작 버튼인가 (편집기: 전부) */
function shownBtn(id) {
  if (S.editor) return true;
  if (S.hidden.has(id)) return false;
  if (id === 'mount') return !!S.shown.mount;
  if (id === 'guard') return !!S.shown.guard;
  return true;
}
/** 편집기가 열려 있으면 편집 중인 위치, 아니면 배치 */
function btnPos(L, id) { return S.editor?.pos[id] ?? L.btn[id]; }

// ───────────────────────── 표시 ─────────────────────────
function hiddenFrom(opt) {
  const g = game(), top = g?.top;
  let hb = opt;
  if (hb === undefined) hb = top?.padHideButtons;
  if ((hb == null) && top?.name === 'hub' && top.padHideButtons === undefined) hb = HUB_HIDE;
  return hb ?? null;
}
function applyHidden(hb) {
  if (hb === S.hbRef && (Array.isArray(hb) ? hb.length : -1) === S.hbLen) return;
  S.hbRef = hb; S.hbLen = Array.isArray(hb) ? hb.length : -1;
  const next = new Set(hb === true ? PAD_IDS : Array.isArray(hb) ? hb.filter((x) => typeof x === 'string') : []);
  const key = [...next].sort().join(',');
  if (key === S.hiddenKey) return;
  S.hidden = next; S.hiddenKey = key;
  // 숨긴 버튼을 누르고 있던 손가락은 뗀다
  for (const [, p] of S.ptrs) {
    if (p.kind !== 'btn') continue;
    const keep = p.ids.filter((id) => !next.has(id));
    if (keep.length !== p.ids.length) { for (const id of p.ids) if (next.has(id)) releaseBtn(p, id, false); p.ids = keep; }
  }
  S.occKey = ''; S.pending = true;
}
function apply(on, hb) {
  applyHidden(hb);
  if (on === S.visible) return;
  S.visible = on;
  if (!on) releaseAll(true);   // 필살·각성 컷인처럼 잠깐 숨길 때는 스틱을 누르고 있는 손가락을 기억한다
  if (S.cv && !S.editor) S.cv.style.display = on ? '' : 'none';
  S.occKey = ''; S.pending = true;
  if (on) { layout(); startLoop(); resumeStick(); }
}
/** 숨기는 동안 기억해 둔 스틱 손가락이 아직 화면에 있으면 같은 받침에서 이어 간다 (다시 떼었다 누르지 않아도 계속 달린다) */
function resumeStick() {
  const s = S.stick, p = S.ptrs.get(s.id);
  if (!p || p.kind !== 'stick' || !p.suspended) return;
  p.suspended = false;
  s.active = true; s.fx = p.x; s.fy = p.y;
  stickSend(); S.pending = true;
}
function legacyVisible(on) {
  if (now() - S.ownerT < 600) return; // game.syncPad 가 주인이다
  const g = game();
  apply(!!on && !(g?.portraitLocked ?? g?._locked ?? false), hiddenFrom(undefined));
}

// ───────────────────────── 입력 보내기 ─────────────────────────
/** 눌렀다가 게임 스텝이 한 번도 돌기 전에 뗀 액션: 뗌을 다음 스텝 뒤로 미룬다 (한 프레임보다 짧은 탭·느린 기기에서 입력이 사라지지 않게).
 *  a → {it: 누를 때 input.time, t: 뗀 시각} */
const LATE_MAX_MS = 250;
function actOn(a) {
  if (S.late.has(a)) { S.late.delete(a); S.counts[a] = 1; return; } // 아직 input 에는 눌린 채다
  const n = (S.counts[a] = (S.counts[a] || 0) + 1);
  if (n === 1) {
    const i = inputRef();
    S.pressIt[a] = typeof i?.time === 'number' ? i.time : NaN;
    try { i?.touch?.set?.(a, true); } catch (e) { console.error('[touchpad]', e); }
  }
}
function actOff(a) {
  const n = (S.counts[a] || 0) - 1;
  S.counts[a] = Math.max(0, n);
  if (n !== 0) return;
  const i = inputRef();
  if (typeof i?.time === 'number' && i.time === S.pressIt[a]) { S.late.set(a, { it: i.time, t: now() }); startLoop(); return; }
  try { i?.touch?.set?.(a, false); } catch (e) { console.error('[touchpad]', e); }
}
/** 미룬 뗌: 스텝이 한 번이라도 돌았으면 (또는 너무 오래 기다렸으면) 이제 뗀다. rAF 마다 */
function tickLate() {
  if (!S.late.size) return;
  const i = inputRef(), t = now();
  for (const [a, v] of S.late) {
    if ((i?.time ?? v.it) === v.it && t - v.t < LATE_MAX_MS) continue;
    S.late.delete(a);
    try { i?.touch?.set?.(a, false); } catch (e) { console.error('[touchpad]', e); }
  }
}
function pressBtn(p, id) {
  if (id === 'swap') { p.swapT = now(); p.radial = false; p.swapOn = true; return; } // ⇄ 는 손을 뗄 때
  for (const a of ACTS[id]) actOn(a);
}
function releaseBtn(p, id, fire) {
  if (id === 'swap') {
    const long = p.radial;
    p.swapOn = false;
    if (fire && !long) fireSwap();
    return;
  }
  for (const a of ACTS[id]) actOff(a);
}
/** ⇄: 손을 뗄 때 짧게(≥ 100ms 그리고 게임 3스텝) 누른다 — 한 스텝짜리 눌림이 프레임 사이에 사라지지 않게.
 *  누르고 있는 동안(또는 뗀 뒤 스텝이 아직 안 돈 동안) 또 탭하면 버리지 않고 최대 2번까지 줄 세운다 */
function fireSwap() {
  if (S.swapHold || S.swapGap) { S.swapQ = Math.min(2, S.swapQ + 1); startLoop(); return; }
  actOn('swap');
  S.swapHold = { t: now(), it: inputRef()?.time ?? 0 };
  startLoop();
}
function tickSwap() {
  const h = S.swapHold, i = inputRef(), it = i?.time ?? 0;
  if (h) {
    const dt = now() - h.t;
    if ((dt >= SWAP_HOLD_MS && (it - h.it >= (SWAP_HOLD_STEPS - 0.5) / 60 || dt > 600)) || dt > 1000) {
      S.swapHold = null; actOff('swap');
      S.swapGap = { it, t: now() }; // 다음 눌림 전에 뗀 상태를 한 스텝 이상 보여 준다 (그래야 새 눌림으로 잡힌다)
    }
    return;
  }
  const g = S.swapGap;
  if (g && (it > g.it || now() - g.t > 300)) {
    S.swapGap = null;
    if (S.swapQ > 0) { S.swapQ--; fireSwap(); }
  }
}
function buzz() {
  const st = settings();
  if (st.vibration === false) return;
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    const a = HAP.haptics?.active; // 게임 진동(피격·각성 등)이 울리는 중이면 짧은 누름 진동으로 끊지 않는다 (MASTER_PLAN §1.11)
    if (a && now() < a.until) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(8);
  } catch { /* 무시 */ }
}
function unlockAudio() { try { game()?.audio?.unlock?.(); } catch { /* 무시 */ } }

/** 스틱 방향 (platform §4.3/§5.2): 반지름의 45 % 에서 걸리고 30 % 아래에서 풀린다. 45° 구역 8개 + ±7.5° 히스테리시스,
 *  위·아래는 남북·대각 구역에서만. 아날로그 벡터는 axis(), 디지털 방향은 set('left'…) 으로 보낸다 (input 은 방향을 만들지 않는다) */
const DIR_ENGAGE = 0.45, DIR_RELEASE = 0.30;
const SECTOR = Math.PI / 4, SECTOR_KEEP = (22.5 + 7.5) * Math.PI / 180;
const SECT_DIRS = [['right'], ['right', 'down'], ['down'], ['down', 'left'], ['left'], ['left', 'up'], ['up'], ['up', 'right']];
const DIRS = ['left', 'right', 'up', 'down'];
const dirState = { eng: false, sec: -1, any: false, on: { left: false, right: false, up: false, down: false } };
function sectorOf(x, y, prev) {
  const ang = Math.atan2(y, x);
  if (prev >= 0) {
    let d = Math.abs(ang - prev * SECTOR);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d <= SECTOR_KEEP) return prev;
  }
  return ((Math.round(ang / SECTOR) % 8) + 8) % 8;
}
function sendDirs(dx, dy, raw) {
  const st = dirState;
  if (!(st.eng ? raw >= DIR_RELEASE : raw >= DIR_ENGAGE)) { st.eng = false; st.sec = -1; } else { st.eng = true; st.sec = sectorOf(dx, dy, st.sec); }
  const want = st.sec >= 0 ? SECT_DIRS[st.sec] : null;
  if (want) st.any = true;
  const t = inputRef()?.touch;
  for (const d of DIRS) {
    const on = !!want && want.includes(d);
    if (on === st.on[d] && !on && !st.any) continue; // 아무 방향도 누른 적 없으면 보낼 것 없음
    st.on[d] = on;
    try { t?.set?.(d, on); } catch (e) { console.error('[touchpad]', e); } // 매번 네 방향 모두 (예전 axis 가 방향을 덮어써도 맞춘다)
  }
}
function clearDirs() {
  const st = dirState;
  st.eng = false; st.sec = -1;
  for (const d of DIRS) st.on[d] = false;
  st.any = false;
}
function stickSend() {
  const s = S.stick, L = S.L;
  const i = inputRef();
  if (!i?.touch) return;
  if (!s.active || !L) { i.touch.axis(0, 0, { sprint: false }); s.sprint = false; sendDirs(0, 0, 0); return; }
  const dx = s.fx - s.ax, dy = s.fy - s.ay, dist = Math.hypot(dx, dy);
  if (dist < STICK_DZ) { i.touch.axis(0, 0, { sprint: false }); s.sprint = false; sendDirs(0, 0, 0); return; }
  s.sprint = dist >= SPRINT_K * L.R;
  i.touch.axis(dx / L.R, dy / L.R, { sprint: s.sprint });
  sendDirs(dx, dy, dist / L.R);
}
function releaseAll(keepStick = false) {
  const s = S.stick;
  const held = keepStick && s.active ? S.ptrs.get(s.id) : null;   // 잠깐 숨김: 스틱 손가락은 멈춘 채 기억 (resumeStick)
  for (const [, p] of S.ptrs) {
    if (p.kind === 'btn' || p.kind === 'sys') for (const id of p.ids) releaseBtn(p, id, false);
  }
  S.ptrs.clear();
  if (held?.kind === 'stick') { held.suspended = true; S.ptrs.set(s.id, held); }
  if (s.active) { s.active = false; s.relT = now(); s.ex = s.ax; s.ey = s.ay; }
  s.sprint = false;
  for (const a in S.counts) S.counts[a] = 0;
  S.late.clear();
  S.swapHold = null; S.swapGap = null; S.swapQ = 0;
  clearDirs();
  try { inputRef()?.touch?.clear?.(); } catch (e) { console.error('[touchpad]', e); }
  S.pending = true;
}

// ───────────────────────── 판정 ─────────────────────────
/** (x, y) 에 걸리는 동작 버튼 id 목록 (테두리가 가장 가까운 것 하나, 공격·점프 사이 띠에서는 둘 다) */
function hitBtns(L, x, y) {
  let best = null, bestE = Infinity;
  for (const id of PAD_IDS) {
    if (!shownBtn(id)) continue;
    const b = btnPos(L, id);
    const e = Math.hypot(x - b.cx, y - b.cy) - b.d / 2;
    if (e > SLOP) continue;
    if (e < bestE) { bestE = e; best = id; }
  }
  if ((!best || best === 'attack' || best === 'jump') && inPlinkBand(L, x, y)) return ['attack', 'jump'];
  return best ? [best] : null;
}
/** 공격·점프 사이의 띠 (platform §5.2 '겹침 띠', 점프 공격용 동시 누름): 두 테두리 모두에서 (간격/2 + 6) px 안.
 *  기본 배치(간격 ≈ 24 px × 배율)에서는 가운데 약 12 px 폭. 둘이 36 px × 배율 넘게 떨어져 있으면(사용자 배치) 띠가 없다
 *  (배율을 곱하지 않으면 크기 등급 L × touchScale 1.3 의 기본 배치(간격 38 px)에서 띠가 사라진다) */
function inPlinkBand(L, x, y) {
  if (!shownBtn('attack') || !shownBtn('jump')) return false;
  const a = btnPos(L, 'attack'), j = btnPos(L, 'jump');
  const gap = Math.hypot(a.cx - j.cx, a.cy - j.cy) - a.d / 2 - j.d / 2;
  if (gap > 36 * Math.max(1, L.k)) return false;
  const band = Math.max(SLOP, gap / 2 + 6);
  return Math.hypot(x - a.cx, y - a.cy) - a.d / 2 <= band && Math.hypot(x - j.cx, y - j.cy) - j.d / 2 <= band;
}
function hitSys(L, x, y) {
  let best = null, bestD = Infinity;
  for (const id in L.sys) {
    const b = L.sys[id], h = b.d / 2 + SYS_SLOP;
    if (Math.abs(x - b.cx) > h || Math.abs(y - b.cy) > h) continue;
    const dd = Math.hypot(x - b.cx, y - b.cy);
    if (dd < bestD) { bestD = dd; best = id; }
  }
  return best;
}
function inStickZone(L, x, y) {
  const z = L.zone;
  if (x < z.x0 || x > z.x1 || y < z.y0 || y > z.y1) return false;
  if (settings().touchStick === 'fixed') return Math.hypot(x - L.home.x, y - L.home.y) <= 2 * L.R;
  return true;
}
/**
 * (x, y) 가 캔버스에 그린 UI 버튼 위인가: 그러면 스틱을 만들지 않고 탭을 캔버스로 보낸다.
 * 예: 마을의 '▲ 대화 · 들어가기' 버튼(아래 가운데, 왼쪽 부분이 스틱 자리 45 % 안), 왼손 모드에서 오른쪽 위 '동료'·'메뉴' 버튼.
 * 공용 탭 등록부(ui.taps.at — 등록된 영역 + 터치 여유) 와 맨 위 장면의 hudRects({id: rect} | [rect], 논리 px) 를 본다
 */
function onCanvasUi(L, x, y) {
  const cr = L.cr;
  if (x < cr.x || y < cr.y || x > cr.x + cr.w || y > cr.y + cr.h) return false;
  const g = game(), top = g?.top;
  const k = top?.uiScale && g?.uiK > 0 ? g.uiK : 1; // uiScale 장면은 UI 좌표로 등록한다
  const lx = ((x - cr.x) * L.vw) / cr.w / k, ly = ((y - cr.y) * L.vh) / cr.h / k;
  try {
    // 방금 그린 묶음만 본다: 등록부는 장면이 바뀌어도 비우지 않으므로 앞 장면(타이틀 등)의 영역이 잠깐 스틱을 막지 않게
    const T = UI.taps;
    if (T && now() - (T.sealedAt || 0) < 500) {
      const z = T.at?.(lx, ly);
      if (z && (z.owner == null || g?.scenes?.includes?.(z.owner))) return true;
    }
  } catch { /* 등록부 없음 */ }
  const R = top?.hudRects;
  if (!R || typeof R !== 'object') return false;
  for (const r of Array.isArray(R) ? R : Object.values(R)) {
    if (r && r.w > 0 && r.h > 0 && lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) return true;
  }
  return false;
}

// ───────────────────────── 포인터 (window 캡처) ─────────────────────────
function claim(e) {
  if (e.cancelable) e.preventDefault(); // 호환 마우스 이벤트·확대 방지
  e.stopPropagation();
}
function onDown(e) {
  if (S.editor) { editDown(e); return; }
  if (!S.visible || e.pointerType === 'mouse') return;
  const L = layout();
  if (!L) return;
  const x = e.clientX, y = e.clientY;
  const sys = hitSys(L, x, y);
  if (sys) {
    claim(e);
    const p = { kind: 'sys', id: sys, ids: [sys], t0: now(), x, y };
    S.ptrs.set(e.pointerId, p);
    pressBtn(p, sys);
    buzz(); unlockAudio(); S.pending = true; startLoop();
    return;
  }
  const ids = hitBtns(L, x, y);
  if (ids) {
    claim(e);
    const p = { kind: 'btn', ids, t0: now(), x, y, swapT: 0, radial: false, swapOn: false };
    S.ptrs.set(e.pointerId, p);
    for (const id of ids) pressBtn(p, id);
    buzz(); unlockAudio(); S.pending = true; startLoop();
    return;
  }
  if (!S.stick.active && inStickZone(L, x, y) && !onCanvasUi(L, x, y)) {
    claim(e);
    const s = S.stick;
    s.active = true; s.id = e.pointerId; s.fx = x; s.fy = y;
    if (settings().touchStick === 'fixed') { s.ax = L.home.x; s.ay = L.home.y; } else { s.ax = x; s.ay = y; }
    S.ptrs.set(e.pointerId, { kind: 'stick', ids: [], t0: now(), x, y });
    stickSend(); unlockAudio(); S.pending = true; startLoop();
  }
}
function onMove(e) {
  if (S.editor) { editMove(e); return; }
  const p = S.ptrs.get(e.pointerId);
  if (!p) return;
  claim(e);
  const x = e.clientX, y = e.clientY;
  p.x = x; p.y = y;
  const L = S.L;
  if (!L) return;
  if (p.kind === 'stick') {
    if (p.suspended) return;   // 패드가 숨은 동안: 위치만 기억 (입력은 보내지 않는다)
    const s = S.stick;
    s.fx = x; s.fy = y;
    if (settings().touchStick !== 'fixed') {
      const dx = x - s.ax, dy = y - s.ay, dist = Math.hypot(dx, dy), lim = REANCHOR_K * L.R;
      if (dist > lim) { const k = (dist - lim) / dist; s.ax += dx * k; s.ay += dy * k; }
    }
    stickSend(); S.pending = true;
    return;
  }
  if (p.kind !== 'btn' || settings().touchSlide === false) return;
  const next = hitBtns(L, x, y) ?? [];
  if (next.length === p.ids.length && next.every((id, i) => id === p.ids[i])) return;
  for (const id of p.ids) if (!next.includes(id)) releaseBtn(p, id, false); // 밀어서 벗어난 ⇄ 는 누르지 않는다
  const added = next.filter((id) => !p.ids.includes(id));
  p.ids = next;
  for (const id of added) pressBtn(p, id);
  if (added.length) buzz();
  S.pending = true;
}
function onUp(e) {
  if (S.editor) { editUp(e); return; }
  const p = S.ptrs.get(e.pointerId);
  if (!p) return;
  claim(e);
  S.ptrs.delete(e.pointerId);
  const cancel = e.type === 'pointercancel';
  if (p.kind === 'stick') {
    const s = S.stick;
    s.active = false; s.relT = now(); s.ex = s.ax; s.ey = s.ay; s.sprint = false;
    stickSend();
  } else if (p.kind === 'sys') {
    releaseBtn(p, p.id, false);
    if (p.id === 'fullscreen' && !cancel) toggleFs();
  } else {
    for (const id of p.ids) releaseBtn(p, id, !cancel);
  }
  S.pending = true;
}
function toggleFs() {
  try {
    if (typeof PF.toggleFullscreen === 'function') { PF.toggleFullscreen(); return; }
    const d = document, el = d.documentElement;
    if (d.fullscreenElement) d.exitFullscreen?.();
    else el.requestFullscreen?.({ navigationUI: 'hide' })?.then?.(() => { try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* 무시 */ } }, () => {});
  } catch { /* 무시 */ }
}

// ───────────────────────── 매 프레임 ─────────────────────────
function startLoop() {
  if (S.raf || !hasDom()) return;
  S.raf = requestAnimationFrame(tick);
}
function readState() {
  const g = game(), w = g?.world ?? g?.top?.world ?? null;
  let info = null;
  try { info = w?.companions?.hudInfo?.() ?? null; } catch { info = null; }
  S.cmp = info;
  const m = !!info?.mount, gd = !!(info?.guards && info.guards.length);
  if (m !== !!S.shown.mount || gd !== !!S.shown.guard) {
    S.shown.mount = m; S.shown.guard = gd; S.occKey = '';
    // 사라진 버튼을 누르고 있던 손가락은 뗀다
    for (const [, p] of S.ptrs) {
      if (p.kind !== 'btn') continue;
      for (const id of p.ids.slice()) if (!shownBtn(id)) { releaseBtn(p, id, false); p.ids.splice(p.ids.indexOf(id), 1); }
    }
  }
  return w;
}
function tick(t) {
  S.raf = 0;
  const L = layout();
  if (!L) return;
  tickSwap();
  tickLate();
  const w = readState();
  // ⇄ 길게 누르기 → 기술 원형 메뉴
  if (S.radialFn) {
    for (const [, p] of S.ptrs) {
      if (p.kind === 'btn' && p.swapOn && !p.radial && now() - p.swapT >= SWAP_LONG) {
        p.radial = true;
        try { S.radialFn({ x: p.x, y: p.y }); } catch (e) { console.error('[touchpad] radial', e); }
      }
    }
  }
  const fading = !S.stick.active && now() - S.stick.relT < STICK_FADE * 1000 + 40;
  const live = S.visible || S.editor || fading || S.swapHold || S.swapGap || S.late.size;
  if (live) {
    const changed = stateChanged(L, w);
    if ((changed || S.pending || S.anim || fading) && t - S.lastDraw >= DRAW_MS) {
      S.lastDraw = t; S.pending = false;
      draw(L, w);
    } else if (changed) S.pending = true;
    startLoop();
  } else if (S.ctx && S.drawn) { clearCanvas(); }
}

/** 다시 그릴 필요가 있나: 그리는 값들을 숫자 배열로 모아 지난번과 비교 (할당 없음) */
const SIG_N = 40;
const SIG = { i: 0, ch: false };
/** 서명 칸 하나 비교·기록 (매 프레임 새 함수를 만들지 않게 모듈 함수) */
function sput(x) {
  const v = S.drawSig, i = SIG.i++;
  if (v[i] !== x && !(Number.isNaN(v[i]) && Number.isNaN(x))) { v[i] = x; SIG.ch = true; }
}
function stateChanged(L, w) {
  const v = S.drawSig;
  if (v.length !== SIG_N) { v.length = SIG_N; v.fill(NaN); }
  SIG.i = 0; SIG.ch = false;
  const st = settings(), p = w?.player, run = w?.run;
  sput(S.visible ? 1 : 0); sput(S.editor ? 1 : 0); sput(num(st.touchOpacity, 0.55));
  let mask = 0, bit = 1;
  for (const id of PAD_IDS) { if (isPressed(id)) mask |= bit; bit <<= 1; if (shownBtn(id)) mask |= bit; bit <<= 1; }
  for (const id of SYS_IDS) { if (isPressed(id)) mask |= bit; bit <<= 1; }
  sput(mask);
  const s = S.stick;
  sput(s.active ? 1 : 0); sput(Math.round(s.ax)); sput(Math.round(s.ay)); sput(Math.round(s.fx)); sput(Math.round(s.fy)); sput(s.sprint ? 1 : 0);
  sput(s.active ? 0 : Math.round(clamp((now() - s.relT) / (STICK_FADE * 1000), 0, 1) * 10));
  // 스킬 2칸: id(해시), 재사용 대기(0.1초), MP 부족
  for (let k = 0; k < 2; k++) {
    const sid = p?.hero?.slots?.[(p.skillPage ?? 0) * 2 + k] ?? null;
    sput(sid ? hashStr(sid) : 0);
    const cd = sid ? num(p.skillCd?.[sid], 0) : 0;
    sput(cd > 0 ? Math.ceil(cd * 10) : 0);
    const sk = sid ? SKILL_DB?.[sid] : null;
    sput(sk && num(p?.mp, 0) < num(sk.cost, 10) ? 1 : 0);
  }
  sput(num(p?.skillPage, 0));
  sput(run?.sub ? hashStr(run.sub) : 0);
  const sw = run?.sub ? SUB_DB?.[run.sub] : null;
  sput(sw && num(run?.hearts, 0) < num(sw.cost, 1) ? 1 : 0);
  sput(Math.floor(num(run?.sp, 0)));
  const aw = w?.awakenState;
  sput(aw?.ready ? 1 : 0); sput(Math.round(num(aw?.holdK, 0) * 50));
  const c = S.cmp, m = c?.mount;
  sput(m ? (m.riding ? 2 : 1) + (m.blocked ? 4 : 0) : 0); sput(m && num(m.cd, 0) > 0 ? Math.ceil(num(m.cd, 0) * 10) : 0);
  sput(m && num(m.maxHp, 0) > 0 ? Math.round((num(m.hp, 0) / m.maxHp) * 40) : 0); // 탈것 HP 고리
  const gcd = guardCd(c);
  sput(gcd.n); sput(Math.ceil(gcd.cd * 10));
  sput(S.swapHold ? 1 : 0);
  sput(S.hiddenKey.length);
  sput(S.editor ? S.editor.ver : 0);
  sput(L.W); sput(L.H);
  sput(drawAssetsReady ? 1 : 0);
  // 반짝임(필살 가득·각성 가능·질주)은 계속 움직인다
  const reduce = st.reduceMotion === true;
  S.anim = !reduce && S.visible && ((num(run?.sp, 0) >= 100 && shownBtn('ult')) || !!aw?.ready || num(aw?.holdK, 0) > 0 || s.sprint);
  return SIG.ch;
}
function hashStr(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
const GCD = { n: 0, cd: 0, max: 1, ready: false }; // 매 프레임 새 객체를 만들지 않는다 (읽고 바로 쓴다)
function guardCd(c) {
  const gs = c?.guards, o = GCD;
  if (!gs || !gs.length) { o.n = 0; o.cd = 0; o.max = 1; o.ready = false; return o; }
  let best = Infinity, max = 1;
  for (const gg of gs) { const cd = num(gg?.cd, 0); if (cd < best) { best = cd; max = num(gg?.cdMax, 1) || 1; } }
  o.n = gs.length; o.cd = Math.max(0, best); o.max = max; o.ready = best <= 0;
  return o;
}
function isPressed(id) {
  if (S.editor) return S.editor.sel === id;
  if (id === 'swap' && S.swapHold) return true;
  for (const [, p] of S.ptrs) if ((p.kind === 'btn' || p.kind === 'sys') && p.ids.includes(id)) return true;
  return false;
}

// ───────────────────────── 그리기 ─────────────────────────
let drawAssetsReady = false, SKILL_DB = null, SUB_DB = null, glyphFn = null, iconFn = null;
function loadDrawAssets() {
  Promise.all([import('../render/hud.js'), import('../render/icons.js'), import('../data/skills.js'), import('../data/subweapons.js')]).then(([h, ic, sk, sw]) => {
    glyphFn = h.drawSkillGlyph ?? null; iconFn = ic.drawIcon ?? null; SKILL_DB = sk.SKILLS ?? null; SUB_DB = sw.SUBWEAPONS ?? null;
    drawAssetsReady = true; S.pending = true;
  }).catch((e) => { console.error('[touchpad] draw assets', e); });
}

function overlayDpr(L) {
  const g = game();
  const dev = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const cap = num(g?.dpr, 1.5) || 1.5;
  return clamp(Math.min(dev, cap, Math.sqrt(OVERLAY_MP / (L.W * L.H))), 0.5, 3);
}
function ensureCanvasSize(L) {
  const cv = S.cv;
  const dpr = overlayDpr(L);
  const bw = Math.max(1, Math.round(L.W * dpr)), bh = Math.max(1, Math.round(L.H * dpr));
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; S.spriteKey = ''; }
  S.dpr = dpr;
  return dpr;
}
function clearCanvas() {
  const c = S.ctx;
  if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, S.cv.width, S.cv.height);
  S.drawn = false;
}

/**
 * 버튼 바탕(원판 + 테두리 + 고정 글자) 을 굽는다: 배치·DPR·글꼴이 바뀔 때만.
 * 캔버스는 버튼 id × (보통, 눌림) 26개를 처음 한 번만 만들고, 다시 구울 때(회전·크기 조절·touchScale·글꼴)는 같은 캔버스에
 * 크기만 바꿔 그린다 → 스테이지 도중 새 캔버스 0개 (MASTER_PLAN §5.2). 매 그리기마다 부르므로 바뀌었는지는 숫자로만 본다
 */
const BAKE = { lver: -1, dpr: 0, epoch: -1, dk: '' };
function bakeSprites(L) {
  let dk = '';
  if (S.editor) for (const id of PAD_IDS) dk += S.editor.pos[id].d.toFixed(1) + ','; // 편집기에서 크기를 바꾸는 중
  const B = BAKE;
  if (S.spriteKey === 'ok' && B.lver === S.lver && B.dpr === S.dpr && B.epoch === S.fontEpoch && B.dk === dk) return;
  S.spriteKey = 'ok'; B.lver = S.lver; B.dpr = S.dpr; B.epoch = S.fontEpoch; B.dk = dk;
  const make = (id, d, pressed, sys) => {
    const pair = (S.spr[id] ??= [null, null]), k = pressed ? 1 : 0;
    let c = pair[k];
    if (!c) { c = document.createElement('canvas'); pair[k] = c; }
    const pad = 6, sz = Math.max(1, Math.ceil((d + pad * 2) * S.dpr));
    if (c.width !== sz || c.height !== sz) { c.width = sz; c.height = sz; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    if (sys) drawSysBase(g, id, d / 2 + pad, d / 2 + pad, d, pressed);
    else drawDisc(g, id, d / 2 + pad, d / 2 + pad, d / 2, pressed);
    c._d = d;
  };
  for (const id of PAD_IDS) { const d = btnPos(L, id).d; make(id, d, false); make(id, d, true); }
  for (const id of SYS_IDS) { make(id, L.sd, false, true); make(id, L.sd, true, true); }
}
function blit(c, id, cx, cy, d, pressed) {
  const sp = S.spr[id]?.[pressed ? 1 : 0];
  if (!sp || Math.abs(sp._d - d) > 0.05) return false;
  const pad = 6, s = d + pad * 2;
  c.drawImage(sp, cx - s / 2, cy - s / 2, s, s);
  return true;
}

const COL = { gold: '#e8c872', bone: '#f3e2b8', blood: '#b3122e', ink: '#07030a' };
function discGradient(g, cx, cy, r, pressed, id) {
  const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  if (pressed) { gr.addColorStop(0, '#fff0b8'); gr.addColorStop(0.5, '#e8c872'); gr.addColorStop(1, '#8a2a1a'); }
  else if (id === 'ult') { gr.addColorStop(0, '#7a1020'); gr.addColorStop(0.65, '#3a0610'); gr.addColorStop(1, '#16020a'); }
  else if (id === 'mount' || id === 'guard') { gr.addColorStop(0, '#3a2a52'); gr.addColorStop(0.65, '#1c1230'); gr.addColorStop(1, '#0c0716'); }
  else { gr.addColorStop(0, '#5a1424'); gr.addColorStop(0.62, '#2a0710'); gr.addColorStop(1, '#12030a'); }
  return gr;
}
function drawDisc(g, id, cx, cy, r, pressed) {
  g.save();
  // 그림자
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.arc(cx, cy + 1.5, r + 1.5, 0, TAU); g.fill();
  g.fillStyle = discGradient(g, cx, cy, r, pressed, id);
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  // 테두리 (금) + 안쪽 어두운 선 + 위쪽 광택
  const rw = Math.max(1.5, r * 0.07);
  g.lineWidth = rw; g.strokeStyle = pressed ? '#fff6d0' : 'rgba(232,200,114,0.9)';
  g.beginPath(); g.arc(cx, cy, r - rw / 2, 0, TAU); g.stroke();
  g.lineWidth = 1; g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.arc(cx, cy, r - rw - 0.5, 0, TAU); g.stroke();
  g.lineWidth = Math.max(1, r * 0.06); g.strokeStyle = pressed ? 'rgba(255,255,255,0.45)' : 'rgba(255,235,200,0.16)';
  g.beginPath(); g.arc(cx, cy, r * 0.74, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  // 고정 글자·문양 (공격·점프·대시)
  if (id === 'attack' || id === 'jump' || id === 'dash') {
    g.save();
    g.globalAlpha = pressed ? 0.28 : 0.22;
    g.fillStyle = pressed ? '#3a0a08' : COL.gold; g.strokeStyle = g.fillStyle;
    g.translate(cx, cy - r * 0.08);
    emblem(g, id, r * 0.62);
    g.restore();
    label(g, LABEL[id], cx, cy + r * 0.02, Math.max(12, r * 0.5), pressed);
  }
  g.restore();
}
function emblem(g, id, s) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (id === 'attack') { // 교차한 두 검
    for (const sx of [-1, 1]) {
      g.save(); g.scale(sx, 1); g.rotate(-0.78);
      g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.12, -s * 0.78); g.lineTo(s * 0.12, s * 0.42); g.lineTo(-s * 0.12, s * 0.42); g.lineTo(-s * 0.12, -s * 0.78); g.closePath(); g.fill();
      g.fillRect(-s * 0.38, s * 0.42, s * 0.76, s * 0.12); g.fillRect(-s * 0.07, s * 0.54, s * 0.14, s * 0.34);
      g.restore();
    }
  } else if (id === 'jump') { // 위 화살 두 개
    g.lineWidth = s * 0.2;
    for (const oy of [-0.3, 0.25]) { g.beginPath(); g.moveTo(-s * 0.55, (oy + 0.35) * s); g.lineTo(0, (oy - 0.2) * s); g.lineTo(s * 0.55, (oy + 0.35) * s); g.stroke(); }
  } else if (id === 'dash') { // 겹친 쐐기
    g.lineWidth = s * 0.2;
    for (const ox of [-0.35, 0.2]) { g.beginPath(); g.moveTo((ox - 0.2) * s, -s * 0.55); g.lineTo((ox + 0.35) * s, 0); g.lineTo((ox - 0.2) * s, s * 0.55); g.stroke(); }
  }
}
function label(g, str, x, y, size, pressed, color = null, family = null) {
  g.font = `800 ${Math.round(size)}px ${family ?? FONT.body}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (!pressed) { g.lineJoin = 'round'; g.lineWidth = Math.max(2, size * 0.2); g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(str, x, y); }
  g.fillStyle = pressed ? '#1a0608' : (color ?? COL.bone);
  g.fillText(str, x, y);
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function drawSysBase(g, id, cx, cy, d, pressed) {
  const h = d / 2;
  g.save();
  g.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(g, cx - h, cy - h + 1.5, d, d, d * 0.23); g.fill();
  g.fillStyle = pressed ? '#e8c872' : 'rgba(22,6,12,0.9)'; roundRect(g, cx - h, cy - h, d, d, d * 0.23); g.fill();
  g.lineWidth = 1.5; g.strokeStyle = pressed ? '#fff6d0' : 'rgba(232,200,114,0.8)'; roundRect(g, cx - h + 0.75, cy - h + 0.75, d - 1.5, d - 1.5, d * 0.22); g.stroke();
  const ink = pressed ? '#1a0608' : COL.bone, u = d / 44;
  g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
  if (id === 'pause') {
    g.fillRect(cx - 7 * u, cy - 9 * u, 5 * u, 18 * u); g.fillRect(cx + 2 * u, cy - 9 * u, 5 * u, 18 * u);
  } else if (id === 'bag') { // 가방
    g.lineWidth = 2.2 * u;
    g.beginPath(); g.moveTo(cx - 5 * u, cy - 5 * u); g.quadraticCurveTo(cx - 5 * u, cy - 12 * u, cx, cy - 12 * u); g.quadraticCurveTo(cx + 5 * u, cy - 12 * u, cx + 5 * u, cy - 5 * u); g.stroke();
    roundRect(g, cx - 11 * u, cy - 6 * u, 22 * u, 17 * u, 4 * u); g.fill();
    g.fillStyle = pressed ? '#e8c872' : 'rgba(22,6,12,0.9)';
    g.fillRect(cx - 11 * u, cy - 1 * u, 22 * u, 2 * u);
    g.fillStyle = pressed ? '#8a2a1a' : COL.gold; g.fillRect(cx - 2.5 * u, cy - 2.5 * u, 5 * u, 5 * u);
  } else if (id === 'fullscreen') { // 네 모서리
    g.lineWidth = 2.4 * u;
    const a = 10 * u, b = 4 * u;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.beginPath(); g.moveTo(cx + sx * a, cy + sy * (a - b)); g.lineTo(cx + sx * a, cy + sy * a); g.lineTo(cx + sx * (a - b), cy + sy * a); g.stroke();
    }
  }
  g.restore();
}

/** 원형 재사용 대기 부채꼴 (남은 비율 f, 위에서 시계 방향) + 남은 초 */
function cooldown(c, cx, cy, r, f, secs) {
  if (f <= 0) return;
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.62)';
  c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r - 1, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(f, 0, 1)); c.closePath(); c.fill();
  if (secs > 0) label(c, secs < 1 ? secs.toFixed(1) : String(Math.ceil(secs)), cx, cy + 1, Math.max(13, r * 0.62), false, '#ffffff', FONT.num);
  c.restore();
}

function draw(L, w) {
  const c = S.ctx;
  if (!c) return;
  const dpr = ensureCanvasSize(L);
  bakeSprites(L);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, S.cv.width, S.cv.height);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.drawn = true;
  const st = settings();
  const op = clamp(num(st.touchOpacity, 0.55), 0.15, 1);
  const tsec = now() / 1000;
  if (S.editor) { drawEditor(c, L, tsec); return; }
  drawStick(c, L, op);
  if (!S.visible) return;
  const p = w?.player, run = w?.run;
  for (const id of PAD_IDS) {
    if (!shownBtn(id)) continue;
    const b = btnPos(L, id);
    const pressed = isPressed(id);
    drawButton(c, L, id, b, pressed, pressed ? Math.max(0.9, op) : op, p, run, w, tsec);
  }
  for (const id of SYS_IDS) {
    const b = L.sys[id];
    if (!b) continue;
    const pressed = isPressed(id);
    c.globalAlpha = pressed ? Math.max(0.9, op) : Math.max(0.5, op);
    blit(c, id, b.cx, b.cy, b.d, pressed);
  }
  c.globalAlpha = 1;
}

function drawButton(c, L, id, b, pressed, alpha, p, run, w, tsec) {
  const cx = b.cx, cy = b.cy, r = b.d / 2;
  c.save();
  c.globalAlpha = alpha;
  if (pressed) { c.translate(cx, cy); c.scale(0.94, 0.94); c.translate(-cx, -cy); }
  if (!blit(c, id, cx, cy, b.d, pressed)) drawDisc(c, id, cx, cy, r, pressed);
  switch (id) {
    case 'skill1': case 'skill2': drawSkill(c, id, cx, cy, r, pressed, p); break;
    case 'sub': drawSub(c, cx, cy, r, pressed, run); break;
    case 'ult': drawUlt(c, cx, cy, r, pressed, run, w, tsec); break;
    case 'swap': {
      const page = num(p?.skillPage, 0) + 1;
      label(c, '⇄', cx, cy - r * 0.38, Math.max(10, r * 0.42), pressed, COL.gold);
      label(c, `${page}/2`, cx, cy + r * 0.14, Math.max(12, r * 0.56), pressed, null, FONT.num);
      break;
    }
    case 'mount': {
      const m = S.cmp?.mount;
      if (m?.blocked && !m.riding) c.globalAlpha *= 0.45; // 보스전 등 탈것 금지
      label(c, m?.riding ? '하차' : LABEL.mount, cx, cy + 1, Math.max(12, r * 0.52), pressed);
      const cd = num(m?.cd, 0);
      if (cd > 0 && !pressed) cooldown(c, cx, cy, r, cd / Math.max(0.1, num(m?.cdMax, cd) || cd), cd);
      if (m && num(m.maxHp, 0) > 0) ring(c, cx, cy, r - 2.5, num(m.hp, 0) / m.maxHp, num(m.hp, 0) / m.maxHp < 0.3 ? '#ff5050' : '#e8a040', 2.5);
      break;
    }
    case 'guard': {
      const gc = guardCd(S.cmp);
      label(c, LABEL.guard, cx, cy + 1, Math.max(12, r * 0.52), pressed, gc.ready ? '#fff2c0' : null);
      if (gc.cd > 0 && !pressed) cooldown(c, cx, cy, r, gc.cd / gc.max, gc.cd);
      else if (gc.ready) ring(c, cx, cy, r - 2.5, 1, '#9fd8ff', 2.5);
      break;
    }
    default: break;
  }
  c.restore();
}
function ring(c, cx, cy, r, f, color, lw) {
  if (f <= 0) return;
  c.save();
  c.lineWidth = lw; c.strokeStyle = color; c.lineCap = 'round';
  c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(f, 0, 1)); c.stroke();
  c.restore();
}
function drawSkill(c, id, cx, cy, r, pressed, p) {
  const k = id === 'skill2' ? 1 : 0;
  const sid = p?.hero?.slots?.[num(p?.skillPage, 0) * 2 + k] ?? null;
  const sk = sid && SKILL_DB ? SKILL_DB[sid] : null;
  if (!sk) { label(c, LABEL[id], cx, cy + 1, Math.max(12, r * 0.5), pressed, 'rgba(243,226,184,0.55)', FONT.num); return; }
  const cd = num(p.skillCd?.[sid], 0);
  const noMp = num(p.mp, 0) < num(sk.cost, 10);
  if (glyphFn) {
    c.save();
    if (noMp && cd <= 0) c.globalAlpha *= 0.45;
    try { glyphFn(c, sk, cx, cy - r * 0.06, r * 1.4); } catch { /* 문양 실패 → 글자만 */ }
    c.restore();
  }
  label(c, LABEL[id], cx, cy + r * 0.66, Math.max(10, r * 0.34), pressed, COL.gold, FONT.num);
  if (cd > 0) cooldown(c, cx, cy, r, cd / Math.max(0.1, num(sk.cd, 3)), cd);
  else if (noMp) { // MP 부족: 푸른 막 + 'MP'
    c.save();
    c.fillStyle = 'rgba(20,34,90,0.5)'; c.beginPath(); c.arc(cx, cy, r - 1, 0, TAU); c.fill();
    label(c, 'MP', cx, cy, Math.max(11, r * 0.42), false, '#8ec8ff', FONT.num);
    c.restore();
  }
}
function drawSub(c, cx, cy, r, pressed, run) {
  const sw = run?.sub && SUB_DB ? SUB_DB[run.sub] : null;
  if (sw && iconFn) {
    c.save();
    if (num(run.hearts, 0) < num(sw.cost, 1)) c.globalAlpha *= 0.4;
    try { iconFn(c, sw.icon, cx, cy - r * 0.12, r * 1.05, null, { glow: false }); } catch { /* 아이콘 없음 */ }
    c.restore();
    label(c, LABEL.sub, cx, cy + r * 0.62, Math.max(10, r * 0.34), pressed, COL.gold);
  } else label(c, LABEL.sub, cx, cy + 1, Math.max(12, r * 0.5), pressed);
}
function drawUlt(c, cx, cy, r, pressed, run, w, tsec) {
  const sp = clamp(num(run?.sp, 0), 0, 100);
  const full = sp >= 100;
  const aw = w?.awakenState;
  const reduce = settings().reduceMotion === true;
  const pulse = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(tsec * 6);
  // 게이지 고리 (테두리 안쪽)
  const gr = r - Math.max(3, r * 0.1);
  c.save();
  c.lineWidth = Math.max(3, r * 0.1);
  c.strokeStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.arc(cx, cy, gr, 0, TAU); c.stroke();
  c.strokeStyle = aw?.ready ? '#ff3050' : full ? '#ffe070' : '#ff8a2a';
  c.lineCap = 'round';
  if (sp > 0) { c.beginPath(); c.arc(cx, cy, gr, -Math.PI / 2, -Math.PI / 2 + TAU * sp / 100); c.stroke(); }
  c.restore();
  if (full && !pressed) {
    // 가득: 금빛 맥동 + 광택이 한 바퀴 돈다
    c.save();
    c.globalAlpha *= 0.35 + 0.45 * pulse;
    c.fillStyle = aw?.ready ? 'rgba(255,48,80,0.55)' : 'rgba(255,214,110,0.45)';
    c.beginPath(); c.arc(cx, cy, r * 0.8, 0, TAU); c.fill();
    c.restore();
    if (!reduce) {
      const a = (tsec * 3) % TAU;
      c.save(); c.lineWidth = Math.max(2, r * 0.12); c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineCap = 'round';
      c.beginPath(); c.arc(cx, cy, gr, a, a + 0.5); c.stroke(); c.restore();
    }
  }
  label(c, LABEL.ult, cx, cy + (aw?.ready ? -r * 0.12 : 1), Math.max(12, r * 0.5), pressed, full ? '#fff2c0' : null);
  if (aw?.ready) label(c, '각성', cx, cy + r * 0.42, Math.max(10, r * 0.3), pressed, '#ff8090');
  // 길게 누르기 (각성): 바깥 고리가 시계 방향으로 찬다 (feel §6.1)
  const hk = clamp(num(aw?.holdK, 0), 0, 1);
  if (hk > 0) {
    c.save();
    c.lineWidth = 5; c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(cx, cy, r + 6, 0, TAU); c.stroke();
    c.strokeStyle = hk >= 1 ? '#ffe070' : '#ff3050';
    c.beginPath(); c.arc(cx, cy, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * hk); c.stroke();
    c.restore();
  }
}

function drawStick(c, L, op) {
  const s = S.stick, R = L.R;
  const fixed = settings().touchStick === 'fixed';
  let ax, ay, fx, fy, a;
  if (s.active) { ax = s.ax; ay = s.ay; fx = s.fx; fy = s.fy; a = Math.max(0.85, op); }
  else {
    const f = (now() - s.relT) / (STICK_FADE * 1000);
    if (f < 1 && !fixed) { ax = s.ex; ay = s.ey; fx = ax; fy = ay; a = Math.max(0.85, op) * (1 - f); }
    else if (S.visible) { ax = L.home.x; ay = L.home.y; fx = ax; fy = ay; a = fixed ? op : op * 0.45; }
    else return;
  }
  if (a <= 0.01) return;
  c.save();
  c.globalAlpha = a;
  // 받침
  c.fillStyle = 'rgba(18,4,10,0.38)';
  c.beginPath(); c.arc(ax, ay, R, 0, TAU); c.fill();
  c.lineWidth = 2; c.strokeStyle = 'rgba(232,200,114,0.7)';
  c.beginPath(); c.arc(ax, ay, R, 0, TAU); c.stroke();
  // 네 방향 눈금
  c.fillStyle = 'rgba(232,200,114,0.55)';
  for (let i = 0; i < 4; i++) {
    const t = i * Math.PI / 2, x = ax + Math.cos(t) * R * 0.78, y = ay + Math.sin(t) * R * 0.78;
    c.beginPath(); c.arc(x, y, 2.2, 0, TAU); c.fill();
  }
  // 질주 고리 (1.15R): 넘어가면 붉게 빛난다
  c.lineWidth = s.sprint ? 3 : 1.5;
  c.strokeStyle = s.sprint ? '#ff5064' : 'rgba(255,90,110,0.35)';
  if (!s.sprint) c.setLineDash([5, 6]);
  c.beginPath(); c.arc(ax, ay, R * SPRINT_K, 0, TAU); c.stroke();
  c.setLineDash([]);
  // 손잡이 (질주 고리까지만)
  let dx = fx - ax, dy = fy - ay;
  const dist = Math.hypot(dx, dy), lim = R * SPRINT_K;
  if (dist > lim) { dx *= lim / dist; dy *= lim / dist; }
  const kr = KNOB_R * (R / STICK_R);
  const kx = ax + dx, ky = ay + dy;
  c.translate(kx, ky); // 원점 기준 그라데이션을 재사용 (매번 새로 만들지 않는다)
  c.fillStyle = knobGradient(c, kr, s.sprint);
  c.beginPath(); c.arc(0, 0, kr, 0, TAU); c.fill();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.stroke();
  c.restore();
}
const KNOB_GRAD = { kr: 0, ctx: null, n: null, s: null };
function knobGradient(c, kr, sprint) {
  const G = KNOB_GRAD;
  if (G.kr !== kr || G.ctx !== c) { G.kr = kr; G.ctx = c; G.n = null; G.s = null; }
  let gr = sprint ? G.s : G.n;
  if (!gr) {
    gr = c.createRadialGradient(-kr * 0.3, -kr * 0.35, kr * 0.1, 0, 0, kr);
    if (sprint) { gr.addColorStop(0, '#ffd0a0'); gr.addColorStop(0.55, '#e0405a'); gr.addColorStop(1, '#5a0716'); G.s = gr; }
    else { gr.addColorStop(0, '#fff0c0'); gr.addColorStop(0.55, '#c89a48'); gr.addColorStop(1, '#5a3a14'); G.n = gr; }
  }
  return gr;
}

// ───────────────────────── 배치 편집기 (platform §5.3) ─────────────────────────
function editorRelayout() {
  const E = S.editor, L = S.L;
  if (!E || !L) return;
  E.bounds = L.bounds;
  settle(PAD_IDS.map((id) => E.pos[id]), E.bounds, null, 200);
  E.ver++;
}
function defaultPositions(L) {
  const T = L.band ? PAD_LAYOUT_BAND : PAD_LAYOUT_S;
  const list = PAD_IDS.map((id) => {
    const [r, b, d0] = T[id];
    const d = Math.max(MIN_D, d0 * L.kEff);
    return { id, cx: L.left ? L.ins.l + r * L.kEff : L.W - L.ins.r - r * L.kEff, cy: L.H - L.ins.b - b * L.kEff, d };
  });
  settle(list, L.bounds);
  const out = {};
  for (const b of list) out[b.id] = b;
  return out;
}
function openEditor(opts = {}) {
  if (S.editor) return true;
  if (!ensureDom()) return false;
  const L = layout(true);
  if (!L) return false;
  releaseAll();
  const pos = {};
  for (const id of PAD_IDS) { const b = L.btn[id]; pos[id] = { id, cx: b.cx, cy: b.cy, d: b.d }; }
  S.editor = { pos, bounds: L.bounds, drag: null, sel: null, reset: false, moved: false, ver: 1, onClose: typeof opts?.onClose === 'function' ? opts.onClose : null };
  touchpad.editorOpen = true;
  const root = S.root;
  root.classList.add('edit');
  root.style.pointerEvents = 'auto';
  root.style.zIndex = '25';
  root.style.background = 'rgba(4,1,6,0.62)';
  S.cv.style.display = '';
  buildBar();
  window.addEventListener('keydown', onEditKey, true);
  window.addEventListener('keyup', onEditKeyUp, true);
  S.pending = true;
  startLoop();
  return true;
}
function closeEditor(opts = {}) {
  const E = S.editor;
  if (!E) return false;
  const save = !!opts?.save;
  let saved = false;
  if (save) {
    const g = game(), L = S.L;
    const out = E.reset && !E.moved ? null : toStored(E.pos, L);
    if (g?.settings) {
      g.settings.touchLayout = out;
      try { (g.saves ?? SAVE.saves)?.saveSettings?.(g.settings); } catch (e) { console.error('[touchpad] saveSettings', e); }
    }
    saved = true;
  }
  S.editor = null;
  touchpad.editorOpen = false;
  window.removeEventListener('keydown', onEditKey, true);
  window.removeEventListener('keyup', onEditKeyUp, true);
  S.bar?.remove(); S.bar = null;
  const root = S.root;
  if (root) { root.classList.remove('edit'); root.style.pointerEvents = 'none'; root.style.zIndex = '10'; root.style.background = ''; }
  if (S.cv) S.cv.style.display = S.visible ? '' : 'none';
  layout(true);
  S.occKey = ''; S.pending = true;
  if (!S.visible) clearCanvas();
  startLoop();
  try { E.onClose?.(saved); } catch (e) { console.error('[touchpad] onClose', e); }
  return saved;
}
/** CSS px 위치 → settings.touchLayout (크기 등급·touchScale 1 기준, 오른손 좌표) */
function toStored(pos, L) {
  const out = {};
  const r1 = (v) => Math.round(v * 10) / 10;
  for (const id of PAD_IDS) {
    const b = pos[id];
    const right = L.left ? (b.cx - L.ins.l) / L.k : (L.W - L.ins.r - b.cx) / L.k;
    out[id] = { right: r1(right), bottom: r1((L.H - L.ins.b - b.cy) / L.k), d: r1(clamp(b.d / L.k, 20, 400)) };
  }
  return out;
}
function buildBar() {
  S.bar?.remove();
  const bar = document.createElement('div');
  bar.className = 'tp-bar';
  bar.style.fontFamily = FONT.body; // touchpad.css 의 글자는 inherit
  const mk = (tag, cls, txt) => { const el = document.createElement(tag); el.className = cls; el.textContent = txt; bar.appendChild(el); return el; };
  mk('span', 'tp-title', '버튼 배치 편집');
  mk('span', 'tp-hint', '끌어서 옮기고, 모서리의 금색 점을 끌어 크기를 바꿉니다');
  const bSave = mk('button', 'tp-btn tp-save', '저장');
  const bReset = mk('button', 'tp-btn', '기본값');
  const bCancel = mk('button', 'tp-btn', '취소');
  for (const b of [bSave, bReset, bCancel]) b.type = 'button';
  bSave.addEventListener('click', () => closeEditor({ save: true }));
  bCancel.addEventListener('click', () => closeEditor({ save: false }));
  bReset.addEventListener('click', () => {
    const E = S.editor, L = S.L;
    if (!E || !L) return;
    E.pos = defaultPositions(L); E.reset = true; E.moved = false; E.sel = null; E.ver++;
    S.pending = true; startLoop();
  });
  S.root.appendChild(bar);
  S.bar = bar;
}
function onEditKey(e) {
  if (!S.editor) return;
  e.stopPropagation();
  if (e.key === 'Escape' || e.code === 'Escape' || e.key === 'Backspace') { e.preventDefault(); closeEditor({ save: false }); }
  else if ((e.key === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && !(e.target?.tagName === 'BUTTON')) { e.preventDefault(); closeEditor({ save: true }); }
}
function onEditKeyUp(e) { if (S.editor) e.stopPropagation(); }
const snap = (v) => Math.round(v / 4) * 4;
function editHandle(b) { const r = b.d / 2; return { x: b.cx + r * 0.72, y: b.cy + r * 0.72 }; }
function editDown(e) {
  const E = S.editor;
  if (!E || e.target?.closest?.('.tp-bar')) return;
  claim(e);
  if (E.drag) return; // 한 번에 한 손가락
  const x = e.clientX, y = e.clientY;
  let pick = null, mode = 'move';
  for (let i = PAD_IDS.length - 1; i >= 0 && !pick; i--) { // 크기 손잡이 먼저
    const b = E.pos[PAD_IDS[i]], h = editHandle(b);
    if (Math.hypot(x - h.x, y - h.y) <= 14) { pick = b; mode = 'size'; }
  }
  if (!pick) {
    let bestE = Infinity;
    for (const id of PAD_IDS) {
      const b = E.pos[id], ed = Math.hypot(x - b.cx, y - b.cy) - b.d / 2;
      if (ed <= 6 && ed < bestE) { bestE = ed; pick = b; }
    }
  }
  E.sel = pick?.id ?? null;
  if (pick) E.drag = { pid: e.pointerId, id: pick.id, mode, ox: x - pick.cx, oy: y - pick.cy };
  E.ver++; S.pending = true; startLoop();
}
function editMove(e) {
  const E = S.editor, D = E?.drag;
  if (!D || D.pid !== e.pointerId) return;
  claim(e);
  const b = E.pos[D.id], x = e.clientX, y = e.clientY;
  if (D.mode === 'move') { b.cx = snap(x - D.ox); b.cy = snap(y - D.oy); }
  else b.d = clamp(snap(2 * Math.hypot(x - b.cx, y - b.cy) / 1.018), MIN_D, MAX_D_EDIT);
  const B = E.bounds, r = b.d / 2;
  b.cx = clamp(b.cx, B.x0 + r, Math.max(B.x0 + r, B.x1 - r));
  b.cy = clamp(b.cy, B.y0 + r, Math.max(B.y0 + r, B.y1 - r));
  settle(PAD_IDS.map((id) => E.pos[id]), E.bounds, D.id, 200);
  E.moved = true; E.ver++; S.pending = true; startLoop();
}
function editUp(e) {
  const E = S.editor, D = E?.drag;
  if (!D || D.pid !== e.pointerId) { if (E && !e.target?.closest?.('.tp-bar')) claim(e); return; }
  claim(e);
  E.drag = null;
  // 놓은 뒤 한 번 더 정리 (놓은 버튼은 그 자리) — 저장된 배치가 다음 실행에서 움직이지 않게
  settle(PAD_IDS.map((id) => E.pos[id]), E.bounds, D.id, 200);
  E.ver++; S.pending = true; startLoop();
}
function drawEditor(c, L, tsec) {
  const E = S.editor;
  // 버튼을 올릴 수 있는 위쪽 한계
  c.save();
  c.strokeStyle = 'rgba(232,200,114,0.35)'; c.lineWidth = 1; c.setLineDash([6, 6]);
  c.beginPath(); c.moveTo(L.ins.l, L.yMin); c.lineTo(L.W - L.ins.r, L.yMin); c.stroke();
  c.setLineDash([]);
  // 스틱 자리 (옮길 수 없음)
  c.globalAlpha = 0.8;
  c.strokeStyle = 'rgba(232,200,114,0.6)'; c.lineWidth = 2; c.setLineDash([4, 5]);
  c.beginPath(); c.arc(L.home.x, L.home.y, L.R, 0, TAU); c.stroke();
  c.setLineDash([]);
  const stickTxt = settings().touchStick === 'fixed' ? '이동 스틱' : L.left ? '이동 스틱 (오른쪽 아무 곳)' : '이동 스틱 (왼쪽 아무 곳)';
  label(c, stickTxt, L.home.x, L.home.y, 13, false, 'rgba(243,226,184,0.85)');
  // 사용법 (도구 막대의 안내 문구가 좁은 화면에서 빠지므로 캔버스에도)
  const hx = L.left ? L.W - L.ins.r - (L.W - L.ins.l - L.ins.r) * 0.3 : L.ins.l + (L.W - L.ins.l - L.ins.r) * 0.3;
  label(c, '버튼을 끌어서 옮기고, 금색 점을 끌어 크기를 바꿉니다', hx, L.yMin + 40, 14, false, 'rgba(243,226,184,0.9)');
  label(c, '버튼끼리 겹치지 않게 자동으로 밀려납니다', hx, L.yMin + 62, 12, false, 'rgba(184,168,144,0.9)');
  c.restore();
  for (const id of PAD_IDS) {
    const b = E.pos[id], sel = E.sel === id;
    c.save();
    c.globalAlpha = 0.95;
    if (!blit(c, id, b.cx, b.cy, b.d, false)) drawDisc(c, id, b.cx, b.cy, b.d / 2, false);
    if (id !== 'attack' && id !== 'jump' && id !== 'dash') label(c, LABEL[id], b.cx, b.cy + 1, Math.max(12, b.d * 0.24), false);
    if (sel) { c.lineWidth = 2.5; c.strokeStyle = '#fff2c0'; c.beginPath(); c.arc(b.cx, b.cy, b.d / 2 + 4, 0, TAU); c.stroke(); }
    const h = editHandle(b);
    c.fillStyle = sel ? '#fff2c0' : COL.gold; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(h.x, h.y, 6.5, 0, TAU); c.fill(); c.stroke();
    c.restore();
  }
  void tsec;
}

// ───────────────────────── DOM ─────────────────────────
function ensureDom() {
  if (!hasDom()) return false;
  if (S.root && S.root.isConnected) return true;
  const d = document;
  if (!S.link && !d.querySelector('link[href$="css/touchpad.css"]')) {
    const l = d.createElement('link');
    l.rel = 'stylesheet'; l.href = 'css/touchpad.css';
    (d.head || d.documentElement).appendChild(l);
    S.link = l;
  }
  let root = d.getElementById('tpad');
  if (!root) {
    root = d.createElement('div');
    root.id = 'tpad';
    root.setAttribute('aria-hidden', 'true');
    (d.getElementById('app') || d.body).appendChild(root);
  }
  // 꼭 필요한 값은 인라인으로도 (touchpad.css 를 못 받아도 동작)
  Object.assign(root.style, { position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', zIndex: '10', pointerEvents: 'none', touchAction: 'none' });
  let cv = d.getElementById('tpadcv');
  if (!cv) { cv = d.createElement('canvas'); cv.id = 'tpadcv'; root.appendChild(cv); }
  Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', display: S.visible ? '' : 'none' });
  S.root = root; S.cv = cv; S.ctx = cv.getContext('2d');
  return !!S.ctx;
}
function removeLegacyPad() {
  try { document.getElementById('touch')?.remove(); } catch { /* 무시 */ }
}

/**
 * 가상 패드 초기화 (input.js 가 부른다). → 패드 객체 (input.pad) | null
 * 돌려주는 객체의 setVisible 은 예전 경로(input.setPadOff → _applyPad)용: game.syncPad 가 0.6초 안에 부른 적이 있으면 무시한다.
 */
export function initTouchPad(input) {
  if (input) S.input = input;
  if (!hasDom()) return null;
  if (!S.inited) {
    if (!ensureDom()) return null;
    S.inited = true;
    removeLegacyPad();
    const opt = { capture: true, passive: false };
    window.addEventListener('pointerdown', onDown, opt);
    window.addEventListener('pointermove', onMove, opt);
    window.addEventListener('pointerup', onUp, opt);
    window.addEventListener('pointercancel', onUp, opt);
    window.addEventListener('blur', () => { if (!S.editor) releaseAll(); });
    // 앱 전환·화면 끄기: 손가락을 뗀 이벤트가 오지 않을 수 있다 → 돌아왔을 때 버튼·스틱이 눌린 채 남지 않게
    document.addEventListener('visibilitychange', () => { if (document.hidden && !S.editor) releaseAll(); });
    window.addEventListener('resize', () => { S.pending = true; startLoop(); });
    try { onFontEpoch?.(() => { S.fontEpoch++; S.pending = true; startLoop(); }); } catch { /* 글꼴 알림 없음 */ }
    try { S.input?.onMode?.((m) => { if (m !== 'touch' && !S.editor) releaseAll(); }); } catch { /* 예전 input */ }
    loadDrawAssets();
    const L = layout(true);
    // 버튼 그림은 미리 굽는다 (게임 도중 새 캔버스를 만들지 않게; 다시 구울 때는 같은 캔버스를 쓴다).
    // 터치 모드이거나 터치 화면이 있는 기기에서만 (키보드로 시작한 터치 노트북이 스테이지 도중 터치로 바뀌어도 새 캔버스 0개).
    // 오버레이 백킹은 처음 그릴 때 잡는다 (숨어 있는 동안 전체 화면 크기 메모리를 쓰지 않게)
    if (L && (touchMode() || touchScreen())) { try { S.dpr = overlayDpr(L); bakeSprites(L); } catch (e) { console.error('[touchpad] bake', e); } }
  }
  return padObject;
}

// ───────────────────────── 공개 API ─────────────────────────
export const touchpad = {
  editorOpen: false,
  get visible() { return S.visible; },
  /** 표시의 유일한 주인 game.syncPad 가 매 프레임 부른다. opts.hideButtons = 장면 플래그 padHideButtons (true | [id…] | null) */
  setVisible(on, opts) {
    S.ownerT = now();
    if (!S.inited) initTouchPad(S.input ?? INPUT);
    apply(!!on, hiddenFrom(opts && typeof opts === 'object' && 'hideButtons' in opts ? opts.hideButtons : undefined));
  },
  openEditor,
  closeEditor,
  /** 논리 px 사각형 [{id,x,y,w,h}]: 지금 보이는 버튼 (+ Ⅱ/가방/⛶). 터치 모드가 아니고 패드도 숨어 있으면 [] */
  occupiedRects() {
    if (!hasDom() || !(S.visible || touchMode() || S.editor)) return NO_RECTS;
    const L = layout();
    if (!L) return NO_RECTS;
    if (!S.raf) readState();
    const o = S.occState, ver = S.editor ? S.editor.ver : 0, sh = (S.shown.mount ? 1 : 0) + (S.shown.guard ? 2 : 0);
    if (S.occKey === 'ok' && o.lver === S.lver && o.hidden === S.hiddenKey && o.sh === sh && o.ver === ver) return S.occ;
    o.lver = S.lver; o.hidden = S.hiddenKey; o.sh = sh; o.ver = ver;
    const kx = L.vw / L.cr.w, ky = L.vh / L.cr.h;
    const out = [];
    const add = (b) => out.push({ id: b.id, x: (b.cx - b.d / 2 - L.cr.x) * kx, y: (b.cy - b.d / 2 - L.cr.y) * ky, w: b.d * kx, h: b.d * ky });
    for (const id of PAD_IDS) if (shownBtn(id)) add(btnPos(L, id));
    for (const id of SYS_IDS) if (L.sys[id]) add(L.sys[id]);
    S.occ = out; S.occKey = 'ok';
    return out;
  },
  /** 논리 px: 스틱이 쉬는 자리 (고정 스틱의 받침, 떠 있는 스틱은 기본 자리 둘레 ≈ 240 논리 px). 숨어 있으면 null */
  stickZone() {
    if (!hasDom() || !(S.visible || touchMode())) return null;
    const L = layout();
    if (!L) return null;
    const kx = L.vw / L.cr.w, ky = L.vh / L.cr.h, h = L.R + 24;
    const x0 = Math.max(L.cr.x, L.home.x - h), x1 = Math.min(L.cr.x + L.cr.w, L.home.x + h);
    const y0 = Math.max(L.cr.y, L.home.y - h), y1 = Math.min(L.cr.y + L.cr.h, L.home.y + h);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: (x0 - L.cr.x) * kx, y: (y0 - L.cr.y) * ky, w: (x1 - x0) * kx, h: (y1 - y0) * ky };
  },
  /** QA 드라이버: [{id, cx, cy, d}] CSS px. all: 상태로 숨긴 버튼(탈것·수호·장면 숨김)까지 배치 전부 */
  buttons({ all = false } = {}) {
    if (!hasDom()) return [];
    const L = layout();
    if (!L) return [];
    if (!all && !S.visible && !S.editor) return [];
    if (!S.raf) readState();
    const out = [];
    for (const id of PAD_IDS) if (all || shownBtn(id)) { const b = btnPos(L, id); out.push({ id, cx: b.cx, cy: b.cy, d: b.d }); }
    for (const id of SYS_IDS) { const b = L.sys[id]; if (b) out.push({ id, cx: b.cx, cy: b.cy, d: b.d }); }
    return out;
  },
  /** ⇄ 길게 누르기(350ms) 처리기: fn({x, y}) — 기술 원형 메뉴 (없으면 ⇄ 는 늘 손을 뗄 때 페이지 전환) */
  setTechRadial(fn) { S.radialFn = typeof fn === 'function' ? fn : null; },
  /** 디버그: 지금 상태로 n 번 그려 평균 ms (성능 확인용) */
  debugDraw(n = 50) {
    const L = layout();
    if (!L || !S.ctx) return null;
    const g = game(), w = g?.world ?? null;
    const t0 = now();
    for (let i = 0; i < n; i++) draw(L, w);
    S.pending = true;
    return (now() - t0) / n;
  },
  layoutInfo() {
    const L = layout();
    return L ? { sizeClass: L.cls, k: L.k, kEff: L.kEff, band: L.band, bandH: L.bandH, left: L.left, custom: L.custom, yMin: L.yMin, R: L.R, dpr: S.dpr ?? null } : null;
  },
};
const NO_RECTS = Object.freeze([]);
/** input.pad (예전 경로에서 setVisible 을 부른다) */
const padObject = {
  setVisible: legacyVisible,
  get visible() { return S.visible; },
  openEditor, closeEditor,
  occupiedRects: () => touchpad.occupiedRects(),
  stickZone: () => touchpad.stickZone(),
  buttons: (o) => touchpad.buttons(o),
};
