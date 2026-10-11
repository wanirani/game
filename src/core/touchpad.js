// 캔버스 가상 패드 — platform.md §5.1–5.5, §11 WP-2 · MASTER_PLAN §1.4 (배치·규칙), §1.8 (HUD), §1.10 P-18 · companions §6 (탑승/수호)
// feel §3.1 (터치 질주 고리), §6.1 (필살 길게 누르기 고리) — owner: PLAT-TOUCH
//
// 구조
//   #tpad    화면 전체 이벤트 층. 평소에는 pointer-events:none: 터치는 window 캡처 단계에서 받는다. 버튼·스틱 자리를 누른 손가락만
//            패드가 가져가고(stopPropagation, 그래서 그 밑의 캔버스 탭은 생기지 않는다), 나머지 탭은 캔버스로 그대로 간다.
//            배치 편집기가 열리면 .edit 가 붙어 모든 입력을 받는다 (DOM 도구 막대 + 어두운 배경).
//   #tpadcv  버튼·스틱을 그리는 투명 캔버스 (pointer-events:none). 백킹 DPR = min(기기 DPR, 3, 6.5 MP 예산) — 화질 등급과 무관
//            (hudfix: 자동 화질이 낮음으로 내려가도 흐려지지 않게; 메모리 ≤ 2 GB 기기만 1.5 · 1.5 MP). 버튼 아래에는 상시 HUD 칸
//            (hud_crisp.js 가 같은 DPR 로 구운 빠른 칸·체력·재화·퀘스트·지도 테)을 붙인다 → HUD 와 버튼이 같은 선명도.
//            상태가 바뀔 때만, 최대 30 Hz 로 다시 그린다. 패드가 숨으면 display:none (합성 비용 없음).
//            숨은 동안에는 백킹을 0×0 으로 놓고(R1-REQ-342), 다시 보일 때 같은 작업 안에서 되살려 그린 뒤 보인다.
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
//   touchpad.layoutInfo()                     디버그: {sizeClass, k, kEff, band, bandH, left, custom, yMin, preset, dpr, backing, opacity…}
//   touchpad.bottomReserve() → 0–0.5           (hudfix) 게임 화면 아래에서 쉬는 스틱·아래 줄 버튼이 차지하는 높이 비 → camera 경기장 바닥
//   touchpad.crispDpr() · hudLayer(id, c, x, y, ver, dpr) · hudLayerShown(id)   (hudfix) HUD 선명 칸 — hud_crisp.js 가 쓴다
//   touchpad.layoutVersion()                  (hudfix) 배치를 다시 계산할 때마다 바뀌는 번호 (아래 띠 빠른 칸 캐시 키)
//
// 버튼 id: attack jump dash sub skill1 skill2 ult swap mount guard · 시스템 pause bag fullscreen (+ fold: maptog = 큰 지도 열고 닫기)
// 프리셋 (hud_mobile §3): settings.hud.preset 'auto'(논리 화면비 < 1.55 → fold) | 'wide' | 'fold'. fold = 큰 공격 버튼 둘레 스킬 원호
//   (PAD_LAYOUT_FOLD, 오른쪽 아래) + 오른쪽 위 아이콘 줄(지도·가방·메뉴) + 탈것·수호 버튼 늘 표시(쓸 수 없으면 어둡게).
//   배율 = foldScale(화면 높이, touchScale, settings.hud.scale). 편집기 저장은 프리셋마다 (fold 는 touchLayout 의 'fold:<id>' 키).
//   HUD 가 그리는 탭 자리 (미니맵·빠른 칸): game.hudTaps = [{act, x,y,w,h}] (논리 px, game.hudTapsT 갱신 시각) — 패드가 판정해
//   act 가 입력 액션이면 누름/뗌을 보내고, 'hudmap' 이면 game.hudMapBig 를 뒤집는다.
// 그림 (hud_mobile §4): hud.js 의 hudArt/drawArtIcon/drawSkillArt (assets/ui/hud · assets/icons/skills) — 받기 전에는 예전 벡터 그림.
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
export const SYS_IDS = ['pause', 'bag', 'fullscreen', 'maptog'];
// ── HUD-REDO 배치 (사용자 피드백 2026-10-11, /tmp/claude-0/g10/hudredo_design.md) ──
// 단위 dp = CSS px (폴드 8 펼침 DPR 2: 1 dp = 0.163 mm). 가장자리 여백 PAD_M 은 화면 끝(+안전 영역)에서 '그린 테' 바깥까지.
// 아래 줄 (왼쪽→오른쪽): 점프 · 공격 · 대시 (대시가 모서리). 탈것은 대시 위 (예전 점프 자리), 수호는 탈것 위.
// 스킬 원호는 공격 위에서 왼쪽 아래로 납작하게: 필살 → 스킬2 → 스킬1 → ⇄(넘김). 보조는 원호 위 (예전 탈것 자리).
// 마을(공격 버튼을 숨긴 장면): 탈것 · 점프 · 대시 를 대시의 아래 줄에 같은 간격으로.
// 아래 띠(band): 띠 안에 두 줄 — 아랫줄 넘김 · 수호 · 점프 · 공격 · 대시, 윗줄은 그 사이사이 (보조 · 스킬1 · 스킬2 · 필살 · 탈것).
export const PAD_M = 25;                                  // 가장자리 여백 dp (폴드 4.1 mm) — 그린 테 바깥까지
export const PAD_GAP = 14;                                // 버튼 사이 (누르는 원 사이) 최소 dp (2.3 mm)
// 크기 (hudfix: 사용자 의견 2 '버튼을 약간씩 줄여' — 공격 19.1 → 14.1 mm, 점프 12.0 → 10.0, 스킬·보조 ≈10.4 → 9.3, 대시·탈것 ≈9.0 → 9.3,
// 필살 10.2, ⇄/수호 8.6 mm; 폴드 DPR 2: 1 dp = 0.163 mm × 그린 테 배율)
export const PAD_SIZE = Object.freeze({ A: 76, J: 60, B: 56, U: 56, S: 52 });   // 공격 · 점프 · 일반(대시·탈것·보조·스킬) · 필살 · ⇄/수호
/** 그린 테의 지름 / 버튼 지름 (assets/ui/hud 알파에서 잰 값: ring_attack 1.14, frame_ult 1.12, ring_small 1.02) */
export const RIM = Object.freeze({ attack: 1.14, ult: 1.12 });
export const rimOf = (id) => RIM[id] ?? 1.02;
/**
 * 버튼 배치 생성 → {id: [right, bottom, d]} (dp, 안전 영역 오른쪽 아래 모서리에서 버튼 중심까지)
 *  kind 'overlay'(게임 화면 위 — 폴드·태블릿: 공격 둘레 납작한 원호) | 'wide'(게임 화면 위 — 휴대폰: 두 줄, 높이 ≤ 화면 41 %) | 'band'(아래 띠: 두 줄)
 *  k 크기 배율 · town = 공격 버튼이 없는 장면 (탈것·점프·대시 한 줄)
 *  여백 m 은 배율과 상관없이 그대로 (그린 테 바깥까지)
 */
export function padPlan(kind = 'overlay', k = 1, m = PAD_M, town = false) {
  // 최소 지름 44 dp(MIN_D)를 자리 계산 전에 적용 (hudfix): 작은 배율에서 나중에 키우면 밀어내기(settle)가 대시를 여백 안으로 밀었다 (fold26)
  const fl = (v) => Math.max(44, v);
  const A = fl(PAD_SIZE.A * k), J = fl(PAD_SIZE.J * k), B = fl(PAD_SIZE.B * k), U = fl(PAD_SIZE.U * k), S = fl(PAD_SIZE.S * k), G = Math.max(12, PAD_GAP * k);
  const rA = (A / 2) * RIM.attack, rB = (B / 2) * 1.02;
  const yb = m + rA;                                     // 아래 줄 중심 높이 (공격 테가 여백에 닿게)
  const P = {};
  P.dash = [m + rB, yb, B];
  P.attack = [P.dash[0] + B / 2 + G + A / 2, yb, A];
  P.jump = [P.attack[0] + A / 2 + G + J / 2, yb, J];
  P.mount = [P.dash[0], yb + B + G, B];
  if (kind === 'band' || kind === 'wide') {
    // 두 줄: 아랫줄 오른쪽부터 대시 · 공격 · 점프 · 수호 · ⇄, 윗줄은 아랫줄 버튼 사이에 벽돌처럼 (탈것 · 필살 · 스킬2 · 스킬1 · 보조).
    // 휴대폰(wide)도 이 두 줄을 쓴다 — 예전 원호(수호가 탈것 위)는 묶음 높이가 화면의 59 % 였다 (hudfix, 의견 7·8)
    P.guard = [P.jump[0] + J / 2 + G + S / 2, yb, S];
    P.swap = [P.guard[0] + S + G, yb, S];
    const ux = (P.attack[0] + P.jump[0]) / 2, dxA = ux - P.attack[0];
    const uy = Math.max(yb + Math.sqrt(Math.max(0, (A / 2 + U / 2 + G) ** 2 - dxA * dxA)), yb + B + G);   // 대시 위 탈것과 같은 높이
    P.ult = [ux, uy, U];
    P.skill2 = [ux + U / 2 + G + B / 2 + 4 * k, uy, B];
    P.skill1 = [P.skill2[0] + B + G + 2 * k, uy, B];
    P.sub = [P.skill1[0] + B + G + 2 * k, uy, B];
    P.mount = [P.dash[0], uy, B];
  } else {
    P.guard = [P.dash[0], P.mount[1] + B / 2 + G + S / 2, S];
    P.ult = [P.attack[0], yb + A / 2 + G + U / 2 + 4 * k, U];
    const step = (from, dist, deg) => { const a = (deg * Math.PI) / 180; return [from[0] + dist * Math.cos(a), from[1] - dist * Math.sin(a)]; };
    const s2 = step(P.ult, U / 2 + B / 2 + G + 2 * k, 8);
    P.skill2 = [s2[0], s2[1], B];
    const s1 = step(P.skill2, B + G + 2 * k, 18);
    P.skill1 = [s1[0], s1[1], B];
    const sw = step(P.skill1, B / 2 + S / 2 + G + 2 * k, 32);
    P.swap = [sw[0], sw[1], S];
    // 보조: 스킬1·스킬2 위 (세 원이 같은 간격의 삼각형)
    const mx = (P.skill1[0] + P.skill2[0]) / 2, my = (P.skill1[1] + P.skill2[1]) / 2;
    const vx = P.skill1[0] - P.skill2[0], vy = P.skill1[1] - P.skill2[1], vl = Math.hypot(vx, vy) || 1;
    const h = Math.sqrt(Math.max(0, (B + G + 2 * k) ** 2 - (vl / 2) ** 2));
    P.sub = [mx - (vy / vl) * h, my + (vx / vl) * h, B];
    if (P.sub[1] < my) P.sub = [mx + (vy / vl) * h, my - (vx / vl) * h, B];
  }
  if (town) {
    // 마을 (hudfix — 두 검토 의견): 대시·점프는 스테이지와 같은 자리 그대로 (손이 기억한 자리에서 다른 버튼이 눌리지 않게),
    // 탈것은 점프 왼쪽에 스테이지와 같은 간격으로 → 탈것 · 점프 · (공격 자리 — 마을엔 공격이 없어 비움) · 대시, 모두 대시의 아래 줄
    P.mount = [P.jump[0] + J / 2 + G + B / 2, yb, B];
  }
  for (const id in P) P[id] = P[id].map((v) => Math.round(v * 10) / 10);
  return P;
}
/** 예전 이름 (도구·조작 안내·데스크톱 원호 HUD 가 읽는다): 배율 1 의 표 */
export const PAD_LAYOUT_FOLD = Object.freeze(padPlan('overlay', 1));
export const PAD_LAYOUT_S = PAD_LAYOUT_FOLD;
export const PAD_LAYOUT_BAND = Object.freeze(padPlan('band', 1));
export const FOLD_ASPECT = 1.55;
/**
 * 버튼 크기 배율: 폴드·태블릿 화면 높이 750 dp = 1 (0.88–1.1), 휴대폰(넓은 배치) 430 dp = 1 (0.82–1) — × touchScale × settings.hud.scale.
 * 폴드·태블릿 하한 0.88 은 기기 픽셀로 잰다 (× 2 / devicePixelRatio): 화면 크기(디스플레이 확대)를 키워 DPR 이 2 → 2.625 가 되면
 * CSS 높이가 755 → 575 로 줄어 배율이 0.77 이 되는데, 하한 0.88 에 걸려 버튼이 실제로 16 % 커졌다 (공격 테 16.7 mm — hudfix).
 * 하한을 DPR 에 맞춰 낮추면 같은 기기에서는 확대와 상관없이 실제 mm 크기가 같다.
 */
export function foldScale(cssH, touchScale = 1, hudScale = 1, wide = false, dpr = 2) {
  const h = Number(cssH) || 750;
  const lo = 0.88 * Math.min(1, 2 / Math.max(1, Number(dpr) || 2));
  const base = wide ? clamp(h / 430, 0.82, 1) : clamp(h / 750, lo, 1.1);
  return base * clamp(Number(touchScale) || 1, 0.8, 1.3) * clamp(Number(hudScale) || 1, 0.85, 1.2);
}
/** 지금 기기 DPR (노드 도구: 2) */
export function deviceDpr() { try { return (typeof window !== 'undefined' && window.devicePixelRatio) || 2; } catch { return 2; } }
/** 시스템 아이콘 지름 (dp) */
export const SYS_D = 46;
/** 넓은 배치(휴대폰·띠) 시스템 줄의 위쪽 여백 dp — 위쪽 가운데라 모서리·엄지와 멀다. 세로가 좁아 토스트·게이지 줄을 지키려고 PAD_M 보다 작게 */
export const SYS_M_WIDE = 8;
/** 폴드 시스템 아이콘 줄 (오른쪽 위, 오른쪽부터 메뉴(Ⅱ)·가방·지도·⛶; 그린 테 바깥이 위·오른쪽 여백 PAD_M) → {id: {id,cx,cy,d}} CSS px.
 *  ids 를 주면 그 순서로 (마을은 지도 없음) */
export function foldSysPlan(W, ins, sd, fs, ids = null) {
  const y = ins.t + PAD_M + sd / 2, out = {};
  let x = W - ins.r - PAD_M - sd / 2;
  for (const id of ids ?? (fs ? ['pause', 'bag', 'maptog', 'fullscreen'] : ['pause', 'bag', 'maptog'])) { out[id] = { id, cx: x, cy: y, d: sd }; x -= sd + 12; }
  return out;
}
/** 프리셋 ('wide' | 'fold'): settings.hud.preset, 'auto' 면 논리 화면비 */
export function presetOf(st, vw, vh) {
  const p = st?.hud?.preset;
  if (p === 'wide' || p === 'fold') return p;
  return (Number(vw) || 960) / (Number(vh) || 540) < FOLD_ASPECT ? 'fold' : 'wide';
}
/** 배치 표의 그린 테까지 크기: {top, extent} (dp; 아래·오른쪽 끝에서 가장 먼 테 바깥) */
export function planExtent(P) {
  let top = 0, extent = 0;
  for (const id in P) { const [r, b, d] = P[id], h = (d / 2) * rimOf(id); top = Math.max(top, b + h); extent = Math.max(extent, r + h); }
  return { top, extent };
}
const MIN_D = 44;          // 버튼 최소 지름 (CSS px)
const MAX_D_EDIT = 96;     // 편집기 크기 조절 상한 (§5.3)
const GAP = 14;            // 버튼 사이 최소 간격 (수용 조건 12 px + 여유)
const SLOP = 10;           // 누르는 반경 = 보이는 반지름 + 10
const SYS_SLOP = 8;
const BAND_MIN = 120;      // 태블릿 띠로 보는 캔버스 아래 여백 (CSS px)
const HUD_TOP = 88;        // 오른손: 점수 칸 아래 (논리 px, MASTER_PLAN §1.8)
const HUD_TOP_LEFT = 172;  // 왼손 모드: 왼쪽 위 HUD 묶음(준비 문구까지) 아래
const STICK_R = 57;        // 스틱 이동 반지름 (dp) — 받침 그림 2.3R ≈ 131 dp ≈ 21 mm (폴드), 손잡이 Ø ≈ 0.87R
const KNOB_R = 26;
const STICK_DZ = 10;       // 데드존 (CSS px)
const SPRINT_K = 1.15, REANCHOR_K = 1.4;
const STICK_FADE = 0.3;    // 뗀 뒤 사라지는 시간 (s)
const SWAP_LONG = 350;     // ms
const HUD_LONG = 450;      // HUD 칸 길게 누르기 (ms)
const SWAP_HOLD_MS = 100, SWAP_HOLD_STEPS = 3;
const DRAW_MS = 32;        // 다시 그리기 간격 하한 (≤ 30 Hz; 60/120 Hz 화면에서 33.3ms 마다)
// 오버레이 백킹 (hudfix): 품질 등급과 상관없이 기기 해상도 (상한 DPR 3 · 6.5 MP). 품질 조절기가 '낮음'으로 내려도 버튼이 흐려지지 않게
// (예전: 낮음 = DPR 1 → 폴드에서 기기의 50 %). 메모리가 아주 적은 기기(navigator.deviceMemory ≤ 2 GB)만 DPR 1.5 · 1.5 MP
const OVERLAY_MP = 6.5e6, OVERLAY_DPR = 3, LOWMEM_MP = 1.5e6, LOWMEM_DPR = 1.5;
function lowMemory() { try { const m = Number(navigator?.deviceMemory); return Number.isFinite(m) && m > 0 && m <= 2; } catch { return false; } }

/** 버튼 → 입력 액션 (예전 DOM 패드와 같다: 점프는 결정, Ⅱ 는 취소도) */
const ACTS = {
  attack: ['attack'], jump: ['jump', 'confirm'], dash: ['dash'], sub: ['sub'], skill1: ['skill1'], skill2: ['skill2'],
  ult: ['ult'], swap: ['swap'], mount: ['mount'], guard: ['guard'], pause: ['menu', 'cancel'], bag: ['map'], fullscreen: [], maptog: [],
};
/** HUD 탭 자리가 보낼 수 있는 입력 액션 */
const ACT_OK = new Set(['sub', 'map', 'menu', 'mount', 'guard', 'skill1', 'skill2', 'ult', 'swap']);
const LABEL = {
  attack: '공격', jump: '점프', dash: '대시', sub: '보조', skill1: 'S1', skill2: 'S2', ult: '필살', swap: '넘김', mount: '탑승', guard: '수호',
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
function customLayout(st, prefix = '') {
  const v = st.touchLayout;
  if (!v || typeof v !== 'object') return null;
  let out = null;
  for (const id of PAD_IDS) {
    const b = v[prefix + id];
    if (!b || typeof b !== 'object') continue;
    const r = b.right, bt = b.bottom, d = b.d;
    if (![r, bt, d].every((x) => typeof x === 'number' && Number.isFinite(x)) || d < 20 || d > 400) continue;
    // 편집기는 Ø 44–96 CSS px 을 배율(≥ 0.8)로 나눠 저장한다 → 120 을 넘는 값은 고친 저장본: 화면을 덮지 않게 자른다
    (out ??= {})[id] = [r, bt, Math.min(d, MAX_D_EDIT / 0.8)];
  }
  return out;
}
/** 저장 키 앞머리: 아래 띠 'band:' · 폴드 'fold:' · 넓은 배치 '' (프리셋마다 따로 저장) */
const layoutPrefix = (band, fold) => (band ? 'band:' : fold ? 'fold:' : '');

/** 버튼들을 서로 GAP 이상 떨어뜨리고 경계 안에 둔다 (pinned 는 움직이지 않는다). 이미 맞으면 아무것도 바꾸지 않는다 */
function settle(list, B, pinned = null, iters = 120, gap = GAP) {
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
        const need = A.d / 2 + C.d / 2 + gap;
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
  upgradeLayoutRev(g, st);
  const W = window.innerWidth || 1, H = window.innerHeight || 1;
  const ins = insetsCss(), cr = canvasBox();
  const vw = g?.viewW || Math.round(clamp((540 * cr.w) / cr.h, 960, 1280)), vh = g?.viewH || 540;
  const safeT = st.safeArea === 'full' ? num(g?.safe?.t, 0) : 0;
  // 공격 버튼을 숨긴 장면(마을): 탈것·점프·대시 를 한 줄로 (편집기에서는 전투 배치)
  const town = !S.editor && S.hidden.has('attack');
  // 바뀌었나: 매 프레임 두 번쯤 불리므로 배열을 새로 만들지 않고 제자리에서 비교·기록한다
  LSIG.i = 0; LSIG.ch = false;
  lput(W); lput(H); lput(ins.l); lput(ins.r); lput(ins.t); lput(ins.b); lput(cr.x); lput(cr.y); lput(cr.w); lput(cr.h); lput(vw); lput(vh); lput(safeT);
  lput(st.touchScale); lput(st.touchLeftHanded); lput(st.touchLayout); lput(st.safeArea); lput(st.touchStick); lput(fsShown()); lput(g?.dpr); lput(S.fontEpoch);
  lput(st.hud?.preset); lput(st.hud?.scale); lput(st.hud?.pad); lput(town ? 1 : 0); lput(S.hiddenKey); lput(deviceDpr());
  if (!force && S.L && !LSIG.ch) return S.L;
  S.lver++;

  const cls = sizeClass(H);
  const ts = clamp(num(Number(st.touchScale), 1) || 1, 0.8, 1.3);
  const left = !!st.touchLeftHanded;
  const cs = cr.h / vh;
  const bandH = H - ins.b - (cr.y + cr.h);
  const band = bandH >= BAND_MIN;
  const fold = !band && presetOf(st, vw, vh) === 'fold';
  // 폴드: 왼쪽 위 묶음(미니맵·체력·필살)과 오른쪽 위 아이콘 줄·퀘스트 칸 아래(논리 y 160)부터 버튼을 둘 수 있다
  const yMin = band ? cr.y + cr.h : Math.max(ins.t, cr.y + ((fold ? 160 : left ? HUD_TOP_LEFT : HUD_TOP) + safeT) * cs);
  const kind = band ? 'band' : fold ? 'overlay' : 'wide';
  const prefix = layoutPrefix(band, fold);
  const custom = customLayout(st, prefix);
  // 크기 배율 (hudredo §1): 폴드·태블릿·띠 = 화면 높이 750 dp 기준, 휴대폰 = 430 dp 기준 (× touchScale, 폴드는 × 인터페이스 크기).
  // 폴드·태블릿 하한은 기기 DPR 로 잰다 (hudfix: 디스플레이 확대로 버튼이 커지지 않게)
  const dev = deviceDpr(), dk = Math.min(1, 2 / Math.max(1, dev));
  const kBase = fold || band ? foldScale(H, ts, st.hud?.scale, false, dev) : foldScale(H, ts, 1, true);
  // 기본 배치가 들어갈 자리: 세로 = 위쪽 HUD 아래 (띠: 띠 높이), 가로 = 화면 폭 56 %. 넘치면 배율을 줄인다 (여백 PAD_M 은 그대로)
  const availH = H - ins.b - yMin - (band ? 4 : 0), availW = (W - ins.l - ins.r) * 0.56;
  let kEff = kBase, T = padPlan(kind, kEff, PAD_M, town);
  for (let i = 0; i < 6; i++) {
    const e = planExtent(T);
    const f = Math.min(1, (availH - PAD_M) / Math.max(1, e.top - PAD_M), (availW - PAD_M) / Math.max(1, e.extent - PAD_M));
    if (f >= 0.999) break;
    kEff = Math.max(0.5, kEff * f * 0.995);
    T = padPlan(kind, kEff, PAD_M, town);
  }
  const gap = Math.max(12.5, PAD_GAP * kEff);   // 12.5: 바닥값 12 에 딱 붙으면 px 반올림으로 11.98 이 된다 (hudfix)
  const bounds = { x0: ins.l, x1: W - ins.r, y0: yMin, y1: H - ins.b };
  const btnList = [];
  for (const id of PAD_IDS) {
    const c = custom?.[id];
    const [r, b, d0] = c ? [c[0] * kBase, c[1] * kBase, c[2] * kBase] : T[id];
    const d = Math.max(MIN_D, d0);
    btnList.push({ id, cx: left ? ins.l + r : W - ins.r - r, cy: H - ins.b - b, d });
  }
  // 장면이 숨긴 버튼(마을의 공격·스킬 등)은 밀어내기에서 뺀다 — 숨은 공격 버튼 자리 때문에 마을의 점프·탈것이 밀려나지 않게
  settle(S.editor ? btnList : btnList.filter((b) => !S.hidden.has(b.id)), bounds, null, 120, gap);
  const btn = {};
  for (const b of btnList) btn[b.id] = b;

  // 시스템 버튼: 폴드 = 오른쪽 위 아이콘 줄 (마을은 지도 없음), 넓은 배치·띠 = 위쪽 가운데 (Ⅱ 왼쪽, 가방 오른쪽, ⛶ 는 되는 곳에서만)
  const sd = Math.max(MIN_D, SYS_D * (fold ? clamp(kBase, 0.95 * dk, 1.15) : clamp(kBase, 0.96, 1.1)));
  const mid = ins.l + (W - ins.l - ins.r) / 2, sy = ins.t + SYS_M_WIDE + sd / 2;
  let sys;
  if (fold) sys = foldSysPlan(W, ins, sd, fsShown(), town ? (fsShown() ? ['pause', 'bag', 'fullscreen'] : ['pause', 'bag']) : null);
  else {
    sys = {
      pause: { id: 'pause', cx: mid - 6 - sd / 2, cy: sy, d: sd },
      bag: { id: 'bag', cx: mid + 6 + sd / 2, cy: sy, d: sd },
    };
    if (fsShown()) sys.fullscreen = { id: 'fullscreen', cx: mid + 6 + sd + 12 + sd / 2, cy: sy, d: sd };
  }

  // 스틱: 받침 그림(2.3R, 테 ≈ 2.28R) 바깥이 왼쪽·아래 여백 PAD_M
  const R = STICK_R * clamp(kBase, fold || band ? 0.85 * dk : 0.85, 1.15);
  const off = PAD_M + 1.14 * R;
  const home = { x: left ? W - ins.r - off : ins.l + off, y: H - ins.b - off };
  const zw = 0.45 * (W - ins.l - ins.r);
  const zone = left ? { x0: W - ins.r - zw, x1: W - ins.r, y0: ins.t + 64, y1: H } : { x0: ins.l, x1: ins.l + zw, y0: ins.t + 64, y1: H };

  // 다시 칠할 사각형 (CSS px): 버튼 묶음·시스템 줄 — 그린 테·눌림 고리·각성 고리(r+8)까지
  const box = (list) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of list) { const h = b.d * 0.62 + 10; x0 = Math.min(x0, b.cx - h); y0 = Math.min(y0, b.cy - h); x1 = Math.max(x1, b.cx + h); y1 = Math.max(y1, b.cy + h); }
    return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  const dirty = [box(btnList), box(Object.values(sys))].filter(Boolean);

  S.L = { W, H, ins, cr, cs, vw, vh, k: kBase, kEff, ts, cls: cls[0], band, bandH, left, custom: !!custom, yMin, bounds, btn, sys, sd, R, home, zone, fold, town, gap, prefix, dirty, preset: band ? 'band' : fold ? 'fold' : 'wide' };
  S.spriteKey = ''; // 크기가 바뀌었을 수 있다 → 버튼 그림 다시 굽기
  S.pending = true;
  S.fullClear = true;
  if (S.editor) editorRelayout();
  return S.L;
}

/** 지금 화면에 보이는 동작 버튼인가 (편집기: 전부) */
function shownBtn(id) {
  if (S.editor) return true;
  if (S.hidden.has(id)) return false;
  // 탈것·수호: 늘 보이고, 쓸 수 없으면 어둡게 (hud_mobile §3 맨 아래 줄). 휴대폰 두 줄 배치(hudfix)도 빈 칸이 생기지 않게 같은 규칙
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
  if (on && !drawAssetsAsked) loadDrawAssets();
  if (!on) releaseAll(true);   // 필살·각성 컷인처럼 잠깐 숨길 때는 스틱을 누르고 있는 손가락을 기억한다
  S.occKey = ''; S.pending = true;
  if (on) {
    const L = layout(); startLoop(); resumeStick();
    // 숨은 동안 놓아 둔 백킹을 되살려 같은 작업 안에서 그린 뒤 보인다 → 빈 캔버스·지난 그림이 한 프레임도 비치지 않는다
    if (L && !S.editor) paintNow(L);
  }
  if (S.cv && !S.editor) S.cv.style.display = on ? '' : 'none';
  if (!on) releaseCanvas();    // R1-REQ-342: 메뉴·마을·컷신 동안 전체 화면 백킹(phone1 ≈ 2.8 MB)을 들고 있지 않는다
  else noteLayoutReset();
}
/**
 * HUD-REDO 배치 개편 (settings.hud.rev 2): 개편 전(rev < 2)에 편집기로 저장한 사용자 배치는 예전 순서·크기 기준이라
 * 새 배치에서 버튼이 겹치거나 예전 순서로 남는다 → 한 번 지우고 (패드가 처음 보일 때 토스트로 알린다) rev 를 2 로 올려 저장한다
 */
function upgradeLayoutRev(g, st) {
  if (!g || g.settings !== st || Number(st.hud?.rev) >= 2) return;
  if (st.touchLayout && typeof st.touchLayout === 'object' && Object.keys(st.touchLayout).length) { st.touchLayout = null; S.resetToast = true; }
  st.hud = { ...(st.hud && typeof st.hud === 'object' ? st.hud : {}), rev: 2 };
  try { (g.saves ?? SAVE.saves)?.saveSettings?.(st); } catch (e) { console.error('[touchpad] saveSettings', e); }
}
function noteLayoutReset() {
  if (!S.resetToast) return;
  const g = game();
  if (typeof g?.toast !== 'function') return;
  S.resetToast = false;
  try { g.toast('버튼 배치가 새로 바뀌어, 직접 옮겨 둔 버튼 위치를 처음 상태로 되돌렸습니다', '#ffd890', 5); } catch { /* 토스트 없음 */ }
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
/** HUD 가 그린 탭 자리 (game.hudTaps, 논리 px; 0.4초 안에 갱신된 것만) 중 (x, y) 에 걸리는 것 → {act} | null */
function hitHudZone(L, x, y) {
  const g = game(), Z = g?.hudTaps;
  if (!Z || !Z.length || now() - (g.hudTapsT || 0) > 400) return null;
  const cr = L.cr;   // 캔버스 밖(아래 띠의 빠른 칸)도 같은 변환으로 판정한다 (hudfix)
  const lx = ((x - cr.x) * L.vw) / cr.w, ly = ((y - cr.y) * L.vh) / cr.h, m = 4;
  for (let i = Z.length - 1; i >= 0; i--) {
    const z = Z[i];
    if (z && z.w > 0 && lx >= z.x - m && lx <= z.x + z.w + m && ly >= z.y - m && ly <= z.y + z.h + m) return z;
  }
  return null;
}
function toggleBigMap() { const g = game(); if (g) { g.hudMapBig = !g.hudMapBig; try { g.audio?.sfx?.('menu_move'); } catch { /* 소리 없음 */ } } }
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
  const hz = hitHudZone(L, x, y);
  if (hz) {   // HUD 의 미니맵·빠른 칸 (fold): 입력 액션이면 누르고 있는 동안 누름, 'hudmap' 은 뗄 때 큰 지도 열고 닫기
    claim(e);
    const p = { kind: 'hud', act: hz.act, long: hz.long ?? null, longDone: false, ids: [], t0: now(), x, y, x0: x, y0: y };
    S.ptrs.set(e.pointerId, p);
    if (hz.act !== 'hudmap' && ACT_OK.has(hz.act)) actOn(hz.act);
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
  if (p.suspended) { p.x = e.clientX; p.y = e.clientY; return; }   // 패드가 숨은 동안: 위치만 기억 (가로채지도, 입력을 보내지도 않는다)
  claim(e);
  const x = e.clientX, y = e.clientY;
  p.x = x; p.y = y;
  const L = S.L;
  if (!L) return;
  if (p.kind === 'stick') {
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
  if (p.suspended) { S.ptrs.delete(e.pointerId); return; }   // 숨은 동안 뗀 스틱 손가락: 잊기만 한다 (입력은 숨길 때 이미 풀었다)
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
    if (p.id === 'maptog' && !cancel) toggleBigMap();
  } else if (p.kind === 'hud') {
    if (p.act === 'hudmap') { if (!cancel) toggleBigMap(); } else if (ACT_OK.has(p.act)) actOff(p.act);
    else if (!cancel && !p.longDone) { const g = game(); try { g?.hudTapFn?.(p.act); } catch (er) { console.error('[touchpad] hud tap', er); } }   // 퀘스트 칸·빠른 칸 물약 등 (hud.js)
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
  // HUD 칸 길게 누르기 (hudfix: 빠른 칸 → 가방, 퀘스트 칸 → 퀘스트 창): 누르고 있는 동안 HUD_LONG ms 가 지나면 바로 (뗄 때 탭은 없다)
  for (const [, p] of S.ptrs) {
    if (p.kind !== 'hud' || !p.long || p.longDone || now() - p.t0 < HUD_LONG) continue;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 24) continue;   // 밀어서 벗어난 손가락은 길게 누르기가 아니다
    p.longDone = true; buzz();
    const g = game();
    try { g?.hudTapFn?.(p.long); } catch (er) { console.error('[touchpad] hud long', er); }
  }
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
  // 숨은 캔버스(display:none)에는 그리지 않는다: 그리면 놓아 둔 백킹을 다시 잡는다 (루프는 ⇄·미룬 뗌 처리 때문에 돈다)
  const shown = S.visible || !!S.editor;
  if (live) {
    const changed = stateChanged(L, w);
    if (shown && (changed || S.pending || S.anim || fading) && t - S.lastDraw >= DRAW_MS) {
      S.lastDraw = t; S.pending = false;
      draw(L, w);
    } else if (changed) S.pending = true;
    startLoop();
  }
  if (!shown && S.ctx && (S.drawn || S.cv.width || S.cv.height)) releaseCanvas();
}

/** 다시 그릴 필요가 있나: 그리는 값들을 숫자 배열로 모아 지난번과 비교 (할당 없음) */
const SIG_N = 48;
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
  OCC.mask = occlusion(L, w); sput(OCC.mask);   // 영웅·보스 가림 (hudfix)
  sput(hudLayerSig());                          // HUD 선명 칸 (hudfix: hud_crisp.js)
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
let drawAssetsReady = false, drawAssetsAsked = false, SKILL_DB = null, SUB_DB = null, glyphFn = null, iconFn = null, HUDM = null;
/** 그린 테·아이콘(hud.js)을 쓸 수 있나 (테 그림을 다 받았을 때) */
const artOn = () => !!HUDM?.hudArtReady?.();
/**
 * 스킬·보조무기 버튼 그림(hud.js·icons.js·스킬 데이터)은 첫 화면 뒤에 받는다 (R1-REQ-229: 이 모듈들은 나머지 장면과 같은 lazy 조각에
 * 있다) — 지연 장면(game.whenScenes)이 다 오면, 늦어도 패드가 처음 보일 때. 그 전에는 버튼 글자만 그린다 (drawAssetsReady)
 */
function scheduleDrawAssets() {
  setTimeout(() => { // main.js 가 game.lazyScenes 를 부른 뒤 (같은 동기 구간) 에 본다
    const p = game()?.whenScenes?.();
    if (p && typeof p.then === 'function') p.then(() => setTimeout(loadDrawAssets, 0), () => loadDrawAssets()); else loadDrawAssets();
  }, 0);
}
function loadDrawAssets() {
  if (drawAssetsAsked) return;
  drawAssetsAsked = true;
  Promise.all([import('../render/hud.js'), import('../render/icons.js'), import('../data/skills.js'), import('../data/subweapons.js')]).then(([h, ic, sk, sw]) => {
    glyphFn = h.drawSkillGlyph ?? null; iconFn = ic.drawIcon ?? null; SKILL_DB = sk.SKILLS ?? null; SUB_DB = sw.SUBWEAPONS ?? null;
    HUDM = h;
    try { h.preloadHudArt?.(() => { S.spriteKey = ''; S.pending = true; startLoop(); }); } catch (e) { console.error('[touchpad] hud art', e); }
    drawAssetsReady = true; S.pending = true;
  }).catch((e) => { console.error('[touchpad] draw assets', e); });
}

/** 오버레이 백킹 DPR (HUD-REDO §1 → hudfix): 품질 등급과 상관없이 기기 해상도 그대로 (상한 3, 6.5 MP; 메모리 ≤ 2 GB 기기만 1.5 · 1.5 MP).
 *  버튼 그림은 이 배율로 구워 1:1 로 붙인다 (예전: 게임 캔버스 DPR·1.2 MP 상한 → 폴드에서 1.26 = 기기의 63 % 로 흐렸다) */
function overlayDpr(L) {
  const dev = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const lm = lowMemory(), cap = lm ? LOWMEM_DPR : OVERLAY_DPR, mp = lm ? LOWMEM_MP : OVERLAY_MP;
  return clamp(Math.min(dev, cap, Math.sqrt(mp / Math.max(1, L.W * L.H))), 0.5, 3);
}
function ensureCanvasSize(L) {
  const cv = S.cv;
  const dpr = overlayDpr(L);
  const bw = Math.max(1, Math.round(L.W * dpr)), bh = Math.max(1, Math.round(L.H * dpr));
  if (cv.width !== bw || cv.height !== bh) {
    // 놓아 둔 백킹(0×0)을 되살릴 때는 버튼 그림을 다시 굽지 않는다: 배치·DPR·글꼴이 그대로면 bakeSprites 가 스스로 알아본다
    const restore = cv.width === 0 && cv.height === 0;
    cv.width = bw; cv.height = bh;
    if (!restore) S.spriteKey = '';
  }
  S.dpr = dpr;
  return dpr;
}
/**
 * 숨은 동안 오버레이 백킹을 0×0 으로 놓는다 (R1-REQ-342: phone1 1266×585 ≈ 2.8 MB). 버튼 그림 캔버스(스프라이트)는 그대로 둔다.
 * 다시 보일 때 apply → paintNow 가 같은 작업 안에서 크기를 되돌리고 그린 다음 display 를 켠다 (깜박임 없음)
 */
function releaseCanvas() {
  const cv = S.cv;
  if (!cv || S.editor) return;
  if (cv.width !== 0 || cv.height !== 0) { cv.width = 0; cv.height = 0; }
  S.drawn = false;
  S.pending = true;
}
// ── HUD 선명 칸 (hudfix, 검토 의견 '게임 캔버스의 HUD 는 game.dpr(폴드 보통 1.46)이라 버튼 옆에서 흐리다') ──
// src/render/hud_crisp.js 가 상시 HUD 칸(빠른 칸·체력·재화·퀘스트·이름판·미니맵 테)을 이 덧캔버스와 같은 DPR 로 작은 캔버스에 굽고,
// 매 프레임 hudLayer(id, 캔버스, 기기 px 위치, 판, dpr) 로 알린다. 덧캔버스는 버튼보다 먼저(아래에) 1:1 로 붙인다.
// 250 ms 넘게 알림이 없으면(장면이 바뀌어 HUD 를 그리지 않음) 그 칸은 사라진다. 판(ver)이 바뀔 때만 다시 그린다.
const HUDL = new Map();             // id → {c, x, y, ver, dpr, seen, shown}
const HUDL_TTL = 250;
const HUDL_PREV = [];               // 지난번에 붙인 칸 (기기 px x,y,w,h …) — 다음 그리기에서 지운다
function hudLayerAlive(l, t) { return t - l.seen < HUDL_TTL && !!l.c && l.dpr === S.dpr; }
function hudLayerSig() {
  if (!HUDL.size) return 0;
  const t = now();
  let h = 17;
  for (const [, l] of HUDL) if (hudLayerAlive(l, t)) h = (Math.imul(h, 31) + l.ver * 13 + l.x * 7 + l.y) | 0;
  return h;
}
function clearHudLayers(c) {
  for (let i = 0; i < HUDL_PREV.length; i += 4) c.clearRect(HUDL_PREV[i] - 1, HUDL_PREV[i + 1] - 1, HUDL_PREV[i + 2] + 2, HUDL_PREV[i + 3] + 2);
  const t = now();
  for (const [, l] of HUDL) if (hudLayerAlive(l, t)) c.clearRect(l.x - 1, l.y - 1, l.c.width + 2, l.c.height + 2);
}
function drawHudLayers(c) {
  HUDL_PREV.length = 0;
  if (!S.visible || S.editor) return;
  const t = now();
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
  for (const [, l] of HUDL) {
    if (!hudLayerAlive(l, t)) { l.shown = false; continue; }
    c.drawImage(l.c, l.x, l.y);
    l.shown = true;
    HUDL_PREV.push(l.x, l.y, l.c.width, l.c.height);
  }
  c.restore();
}
/** 지금 상태로 바로 한 번 그린다 (보이기 직전·편집기 열고 닫을 때): 다음 rAF 까지 빈 캔버스가 비치지 않게 */
function paintNow(L) {
  if (!S.ctx || !L) return;
  try {
    const w = readState();
    stateChanged(L, w);
    S.pending = false;
    draw(L, w);
  } catch (e) { S.pending = true; console.error('[touchpad] draw', e); }
}

/**
 * 버튼 바탕(원판 + 테두리 + 고정 글자) 을 굽는다: 배치·DPR·글꼴이 바뀔 때만.
 * 캔버스는 버튼 id × (보통, 눌림) 26개를 처음 한 번만 만들고, 다시 구울 때(회전·크기 조절·touchScale·글꼴)는 같은 캔버스에
 * 크기만 바꿔 그린다 → 스테이지 도중 새 캔버스 0개 (MASTER_PLAN §5.2). 매 그리기마다 부르므로 바뀌었는지는 숫자로만 본다
 */
const BAKE = { lver: -1, dpr: 0, epoch: -1, dk: '', art: false };
/** 버튼 그림 캔버스의 둘레 여백 (그린 테의 모서리 장식이 원 밖으로 0.16r 나온다) */
const spritePad = (d) => Math.ceil(d * 0.1) + 5;
function bakeSprites(L) {
  let dk = '';
  if (S.editor) for (const id of PAD_IDS) dk += S.editor.pos[id].d.toFixed(1) + ','; // 편집기에서 크기를 바꾸는 중
  const B = BAKE;
  const art = artOn();
  if (S.spriteKey === 'ok' && B.lver === S.lver && B.dpr === S.dpr && B.epoch === S.fontEpoch && B.dk === dk && B.art === art) return;
  S.spriteKey = 'ok'; B.lver = S.lver; B.dpr = S.dpr; B.epoch = S.fontEpoch; B.dk = dk; B.art = art;
  const make = (id, d, pressed, sys) => {
    const pair = (S.spr[id] ??= [null, null]), k = pressed ? 1 : 0;
    let c = pair[k];
    if (!c) { c = document.createElement('canvas'); pair[k] = c; }
    const pad = spritePad(d), sz = Math.max(1, Math.ceil((d + pad * 2) * S.dpr));
    if (c.width !== sz || c.height !== sz) { c.width = sz; c.height = sz; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    if (sys) drawSysBase(g, id, d / 2 + pad, d / 2 + pad, d, pressed, art);
    else if (art) paintedDisc(g, id, d / 2 + pad, d / 2 + pad, d / 2, pressed);
    else drawDisc(g, id, d / 2 + pad, d / 2 + pad, d / 2, pressed);
    c._d = d;
  };
  for (const id of PAD_IDS) { const d = btnPos(L, id).d; make(id, d, false); make(id, d, true); }
  for (const id of SYS_IDS) { make(id, L.sd, false, true); make(id, L.sd, true, true); }
}
function blit(c, id, cx, cy, d, pressed) {
  const sp = S.spr[id]?.[pressed ? 1 : 0];
  if (!sp || Math.abs(sp._d - d) > 0.05) return false;
  const k = S.dpr || 1, pad = spritePad(d), s = d + pad * 2;
  // 기기 픽셀에 맞춰 1:1 로 붙인다 (구운 크기 그대로 — 다시 늘이거나 줄이지 않아 흐려지지 않게). 눌림 축소 변환이 걸려 있으면 그대로 따른다
  const x = Math.round((cx - s / 2) * k) / k, y = Math.round((cy - s / 2) * k) / k;
  c.drawImage(sp, x, y, sp.width / k, sp.height / k);
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
/** 그린 고딕 금속 테 버튼 (hud_mobile §4): 어두운 원판 + 테 그림(공격 = 가시 테, 필살 = 금빛 팔각 테, 나머지 = 리벳 테).
 *  테 그림 크기 2.32r → 안쪽 구멍 반지름 ≈ 0.83r (아이콘 자리), 바깥 원 ≈ r, 모서리 장식 ≈ 1.16r */
function paintedDisc(g, id, cx, cy, r, pressed) {
  const ring = HUDM.hudArt(id === 'attack' ? 'ring_attack' : id === 'ult' ? 'frame_ult' : 'ring_small');
  g.save();
  // 어두운 받침 원 + 그림자 (밝은·붉은 배경 위에서도 버튼 윤곽이 서도록 — HUD-REDO 점 5)
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.arc(cx, cy + 2, r * 1.0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(8,2,6,0.92)';
  g.beginPath(); g.arc(cx, cy, r * 0.95, 0, TAU); g.fill();
  g.fillStyle = discGradient(g, cx, cy, r * 0.9, pressed, id);
  g.beginPath(); g.arc(cx, cy, r * 0.88, 0, TAU); g.fill();
  if (ring) { const z = r * 2.32; g.drawImage(ring, cx - z / 2, cy - z / 2, z, z); }
  if (pressed) { g.fillStyle = 'rgba(255,214,140,0.3)'; g.beginPath(); g.arc(cx, cy, r * 0.86, 0, TAU); g.fill(); }
  if (id === 'dash') { // 대시: 그림 아이콘이 없다 → 금빛 쐐기 문양 + 글자
    g.save(); g.globalAlpha = 0.85; g.fillStyle = COL.gold; g.strokeStyle = COL.gold;
    g.translate(cx, cy - r * 0.12); emblem(g, id, r * 0.5); g.restore();
    label(g, LABEL.dash, cx, cy + r * 0.48, Math.max(11, r * 0.34), pressed);
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
const SYS_ART = { pause: 'ui_menu', bag: 'ui_bag', maptog: 'ui_map' };
function drawSysBase(g, id, cx, cy, d, pressed, art = false) {
  const h = d / 2;
  if (art && (SYS_ART[id] || id === 'fullscreen')) { // 그린 아이콘 (오른쪽 위 아이콘 줄): 리벳 테 + 원형 그림 (⛶ 는 어두운 원판 + 금빛 모서리)
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(cx, cy + 1.5, h * 0.98, 0, TAU); g.fill();
    if (!SYS_ART[id] || !HUDM.drawArtIcon(g, SYS_ART[id], cx, cy, d * 0.8)) { g.fillStyle = 'rgba(22,6,12,0.92)'; g.beginPath(); g.arc(cx, cy, h * 0.86, 0, TAU); g.fill(); }
    if (id === 'fullscreen') {
      const u = d / 52, a = 9 * u, b = 4 * u;
      g.strokeStyle = COL.gold; g.lineWidth = 2.2 * u; g.lineCap = 'round';
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.beginPath(); g.moveTo(cx + sx * a, cy + sy * (a - b)); g.lineTo(cx + sx * a, cy + sy * a); g.lineTo(cx + sx * (a - b), cy + sy * a); g.stroke(); }
    }
    const ring = HUDM.hudArt('ring_small');
    if (ring) { const z = d * 1.12; g.drawImage(ring, cx - z / 2, cy - z / 2, z, z); }
    if (pressed) { g.fillStyle = 'rgba(255,214,140,0.32)'; g.beginPath(); g.arc(cx, cy, h * 0.82, 0, TAU); g.fill(); }
    g.restore();
    return;
  }
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
  } else if (id === 'maptog') { // 접힌 지도
    g.lineWidth = 2 * u;
    g.beginPath(); g.moveTo(cx - 11 * u, cy - 7 * u); g.lineTo(cx - 4 * u, cy - 10 * u); g.lineTo(cx + 4 * u, cy - 7 * u); g.lineTo(cx + 11 * u, cy - 10 * u);
    g.lineTo(cx + 11 * u, cy + 7 * u); g.lineTo(cx + 4 * u, cy + 10 * u); g.lineTo(cx - 4 * u, cy + 7 * u); g.lineTo(cx - 11 * u, cy + 10 * u); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(cx - 4 * u, cy - 10 * u); g.lineTo(cx - 4 * u, cy + 7 * u); g.moveTo(cx + 4 * u, cy - 7 * u); g.lineTo(cx + 4 * u, cy + 10 * u); g.stroke();
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

/** 기본 투명도 (설정 touchOpacity 의 새 기본값 — save.js DEFAULT_SETTINGS 와 같다) */
const OP_DEFAULT = 0.95;
/** 지금 그릴 투명도: 설정값 (그린 테 버튼은 0.5 아래로 내리지 않는다 — 그림이 뭉개져 보이지 않게) */
function opacityNow() { return clamp(num(settings().touchOpacity, OP_DEFAULT), artOn() ? 0.5 : 0.15, 1); }
/** 지운 뒤 다시 칠할 사각형들 (CSS px) → 기기 픽셀 정수로 지운다 */
function clearRects(c, list, dpr) {
  for (const r of list) {
    if (!r) continue;
    const x = Math.max(0, Math.floor(r.x * dpr) - 1), y = Math.max(0, Math.floor(r.y * dpr) - 1);
    c.clearRect(x, y, Math.ceil((r.x + r.w) * dpr) + 1 - x, Math.ceil((r.y + r.h) * dpr) + 1 - y);
  }
}
const DIRTY = [];
function draw(L, w) {
  const c = S.ctx;
  if (!c) return;
  const dpr = ensureCanvasSize(L);
  bakeSprites(L);
  c.setTransform(1, 0, 0, 1, 0, 0);
  // 다시 칠하는 곳만 지운다 (HUD-REDO: 기기 해상도 오버레이 — 폴드 2000×1510 전체를 매번 지우지 않게): 버튼 묶음·시스템 줄·스틱(지난번과 이번)
  if (S.editor || S.fullClear || !S.drawn || S.wasEditor) { c.clearRect(0, 0, S.cv.width, S.cv.height); S.fullClear = false; }
  else {
    DIRTY.length = 0;
    for (const r of L.dirty) DIRTY.push(r);
    if (S.stickBox) DIRTY.push(S.stickBox);
    clearRects(c, DIRTY, dpr);
    clearHudLayers(c);
  }
  S.wasEditor = !!S.editor;
  S.drawn = true;
  if (!S.editor) drawHudLayers(c);   // HUD 선명 칸: 버튼·스틱 아래 (hudfix)
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const op = opacityNow();
  const tsec = now() / 1000;
  if (S.editor) { HUDL_PREV.length = 0; drawEditor(c, L, tsec); return; }
  S.stickBox = drawStick(c, L, op);
  if (!S.visible) return;
  const p = w?.player, run = w?.run;
  for (const id of PAD_IDS) {
    if (!shownBtn(id)) continue;
    const b = btnPos(L, id);
    const pressed = isPressed(id);
    // 영웅·보스가 버튼 뒤에 있으면 옅게 (hudfix 가림) — 누르는 동안은 진하게
    drawButton(c, L, id, b, pressed, pressed ? Math.max(0.95, op) : occOf(id) ? Math.min(op, OCC_A) : op, p, run, w, tsec);
  }
  for (const id of SYS_IDS) {
    const b = L.sys[id];
    if (!b) continue;
    const pressed = isPressed(id);
    c.globalAlpha = pressed ? Math.max(0.95, op) : Math.max(0.5, op);
    blit(c, id, b.cx, b.cy, b.d, pressed);
    if (id === 'bag') { // 가방 찬 비율 알약 (가방 한도 300 칸, 중요 물품 포함 어림) — 글자 ≥ 12 CSS px, 어두운 알약 위
      const n = w?.state?.inventory?.length ?? 0;
      if (n > 0) bagPill(c, b, Math.min(100, Math.round((n / 300) * 100)), n >= 270);
    }
  }
  c.globalAlpha = 1;
}
/** 가방 % 알약: 아이콘 오른쪽 아래에 걸친 어두운 알약 + 금테 + 숫자 */
function bagPill(c, b, pct, full) {
  const fs = Math.max(12, Math.round(b.d * 0.3)), str = pct + '%';
  c.save();
  c.font = `800 ${fs}px ${FONT.num}`;
  const tw = c.measureText(str).width, h = fs + 6, w = Math.max(h, tw + 10);
  const x = Math.min(b.cx + b.d * 0.5 + 2, b.cx + b.d * 0.62) - w, y = b.cy + b.d * 0.5 - h * 0.55;
  roundRect(c, x, y, w, h, h / 2);
  c.fillStyle = full ? 'rgba(90,8,16,0.95)' : 'rgba(14,6,10,0.92)'; c.fill();
  c.lineWidth = 1.25; c.strokeStyle = full ? '#ff8a8a' : 'rgba(232,200,114,0.9)'; c.stroke();
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = full ? '#ffd0d0' : '#fff2c0';
  c.fillText(str, x + w / 2, y + h / 2 + 0.5);
  c.restore();
}

function drawButton(c, L, id, b, pressed, alpha, p, run, w, tsec) {
  const cx = b.cx, cy = b.cy, r = b.d / 2;
  c.save();
  c.globalAlpha = alpha;
  if (pressed) { c.translate(cx, cy); c.scale(0.94, 0.94); c.translate(-cx, -cy); }
  if (!blit(c, id, cx, cy, b.d, pressed)) drawDisc(c, id, cx, cy, r, pressed);
  const art = artOn();
  switch (id) {
    case 'attack': // 그린 테: 지금 무기 그림 (없으면 글자)
      if (art) { const ic = weaponIcon(w); if (!(ic && iconFn && drawIconSafe(c, ic, cx, cy, r * 1.15))) label(c, LABEL.attack, cx, cy + 1, Math.max(13, r * 0.42), pressed); }
      break;
    case 'jump': if (art && !HUDM.drawArtIcon(c, 'ui_jump', cx, cy, r * 1.66)) label(c, LABEL.jump, cx, cy + 1, Math.max(12, r * 0.42), pressed); break;
    case 'skill1': case 'skill2': drawSkill(c, id, cx, cy, r, pressed, p); break;
    case 'sub': drawSub(c, cx, cy, r, pressed, run); break;
    case 'ult': drawUlt(c, cx, cy, r, pressed, run, w, tsec); break;
    case 'swap': drawSwap(c, cx, cy, r, pressed, p, art); break;
    case 'mount': {
      const m = S.cmp?.mount;
      if (!m || (m.blocked && !m.riding)) c.globalAlpha *= 0.4; // 탈것이 없거나 보스전 등 탈것 금지 → 어둡게 (쓸 수 있을 때만 밝다)
      if (art && HUDM.drawArtIcon(c, 'ui_mount', cx, cy, r * 1.66)) { if (m?.riding) label(c, '하차', cx, cy + r * 0.55, Math.max(11, r * 0.36), pressed); }
      else label(c, m?.riding ? '하차' : LABEL.mount, cx, cy + 1, Math.max(12, r * 0.52), pressed);
      const cd = num(m?.cd, 0);
      if (cd > 0 && !pressed) cooldown(c, cx, cy, r, cd / Math.max(0.1, num(m?.cdMax, cd) || cd), cd);
      if (m && num(m.maxHp, 0) > 0) ring(c, cx, cy, r - 2.5, num(m.hp, 0) / m.maxHp, num(m.hp, 0) / m.maxHp < 0.3 ? '#ff5050' : '#e8a040', 2.5);
      break;
    }
    case 'guard': {
      const gc = guardCd(S.cmp);
      if (!gc.n) c.globalAlpha *= 0.4;   // 수호신이 없으면 어둡게
      if (!(art && HUDM.drawArtIcon(c, 'ui_guard', cx, cy, r * 1.66))) label(c, LABEL.guard, cx, cy + 1, Math.max(12, r * 0.52), pressed, gc.ready ? '#fff2c0' : null);
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
/**
 * ⇄ = 스킬 넘김 (player.skillPage 0↔1): 넘김 화살표 그림 + 오른쪽 위 작은 배지 = 다음 쪽의 첫 스킬 그림 · '넘김' + 쪽 점 (●○).
 * (hudfix: 예전엔 다음 쪽 스킬 두 개를 0.78r 로 ±0.24r 만 띄워 겹쳐 그려 'ØD' 같은 덩어리로 보였다.) 다음 쪽이 비었으면 어둡게, 배지 없음
 */
function drawSwap(c, cx, cy, r, pressed, p, art) {
  const page = num(p?.skillPage, 0), next = page ? 0 : 1;
  const slots = p?.hero?.slots ?? [];
  const sid = [slots[next * 2], slots[next * 2 + 1]].find((x) => x && SKILL_DB?.[x]) ?? null;
  const a0 = c.globalAlpha;
  if (!sid) c.globalAlpha = a0 * 0.45;
  const oy = cy - r * 0.14;
  if (!(art && HUDM.drawArtIcon(c, 'ui_swap', cx, oy, r * 1.22))) label(c, '⇄', cx, oy, Math.max(12, r * 0.6), pressed, COL.gold);
  label(c, LABEL.swap, cx, cy + r * 0.5, Math.max(11, r * 0.36), pressed);
  // 쪽 점: 지금 쪽이 채운 점
  c.save();
  for (let i = 0; i < 2; i++) {
    c.beginPath(); c.arc(cx + (i ? 1 : -1) * r * 0.13, cy + r * 0.8, Math.max(1.6, r * 0.06), 0, TAU);
    c.fillStyle = i === page ? '#ffe7a0' : 'rgba(0,0,0,0.6)'; c.fill();
    c.lineWidth = 1; c.strokeStyle = 'rgba(232,200,114,0.85)'; c.stroke();
  }
  c.restore();
  // 배지: 다음 쪽 첫 스킬 (어두운 원 + 금테 안에 그림, 버튼 테의 오른쪽 위에 걸친다)
  if (sid) {
    const br = Math.max(9, r * 0.36), bx = cx + r * 0.66, by = cy - r * 0.62;
    c.save();
    c.fillStyle = 'rgba(8,2,6,0.95)'; c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill();
    if (!(art && HUDM.drawSkillArt(c, sid, bx, by, br * 1.86))) glyphFn?.(c, SKILL_DB[sid], bx, by, br * 1.5);
    c.lineWidth = 1.5; c.strokeStyle = '#e8c872'; c.beginPath(); c.arc(bx, by, br, 0, TAU); c.stroke();
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.beginPath(); c.arc(bx, by, br + 1.2, 0, TAU); c.stroke();
    c.restore();
  }
  c.globalAlpha = a0;
}
function drawSkill(c, id, cx, cy, r, pressed, p) {
  const k = id === 'skill2' ? 1 : 0;
  const sid = p?.hero?.slots?.[num(p?.skillPage, 0) * 2 + k] ?? null;
  const sk = sid && SKILL_DB ? SKILL_DB[sid] : null;
  const art = artOn();
  if (!sk) { // 빈 칸: 자물쇠 그림 (잠긴 칸)
    if (art && HUDM.drawArtIcon(c, 'ui_lock', cx, cy, r * 1.5, 0.55)) return;
    label(c, LABEL[id], cx, cy + 1, Math.max(12, r * 0.5), pressed, 'rgba(243,226,184,0.55)', FONT.num); return;
  }
  const cd = num(p.skillCd?.[sid], 0);
  const noMp = num(p.mp, 0) < num(sk.cost, 10);
  if (art && HUDM.drawSkillArt(c, sid, cx, cy, r * 1.66, noMp && cd <= 0 ? 0.4 : 1)) {
    if (cd > 0) cooldown(c, cx, cy, r * 0.84, cd / Math.max(0.1, num(sk.cd, 3)), cd);
    else if (noMp) label(c, 'MP', cx, cy + r * 0.5, Math.max(11, r * 0.36), false, '#8ec8ff', FONT.num);
    return;
  }
  if (glyphFn) {
    c.save();
    if (noMp && cd <= 0) c.globalAlpha *= 0.45;
    try { glyphFn(c, sk, cx, cy - r * 0.06, r * 1.4); } catch { /* 문양 실패 → 글자만 */ }
    c.restore();
  }
  label(c, LABEL[id], cx, cy + r * 0.66, Math.max(11, r * 0.34), pressed, COL.gold, FONT.num);
  if (cd > 0) cooldown(c, cx, cy, r, cd / Math.max(0.1, num(sk.cd, 3)), cd);
  else if (noMp) { // MP 부족: 푸른 막 + 'MP'
    c.save();
    c.fillStyle = 'rgba(20,34,90,0.5)'; c.beginPath(); c.arc(cx, cy, r - 1, 0, TAU); c.fill();
    label(c, 'MP', cx, cy, Math.max(11, r * 0.42), false, '#8ec8ff', FONT.num);
    c.restore();
  }
}
/** 지금 무기 아이콘 id (장착 uid → 가방 항목의 icon; uid 가 바뀔 때만 찾는다) */
const WPN = { uid: null, icon: null };
function weaponIcon(w) {
  const hero = w?.hero ?? w?.player?.hero, uid = hero?.equip?.weapon ?? null;
  if (uid !== WPN.uid) { WPN.uid = uid; WPN.icon = (uid && w?.state?.inventory?.find?.((i) => i.uid === uid)?.icon) || null; }
  return WPN.icon;
}
function drawIconSafe(c, id, cx, cy, size) { try { iconFn(c, id, cx, cy, size, null, { glow: false }); return true; } catch { return false; } }
function drawSub(c, cx, cy, r, pressed, run) {
  const sw = run?.sub && SUB_DB ? SUB_DB[run.sub] : null;
  if (sw && iconFn) {
    c.save();
    if (num(run.hearts, 0) < num(sw.cost, 1)) c.globalAlpha *= 0.4;
    try { iconFn(c, sw.icon, cx, cy - r * 0.12, r * 1.05, null, { glow: false }); } catch { /* 아이콘 없음 */ }
    c.restore();
    label(c, LABEL.sub, cx, cy + r * 0.62, Math.max(11, r * 0.34), pressed, COL.gold);
  } else label(c, LABEL.sub, cx, cy + 1, Math.max(12, r * 0.5), pressed);
}
function drawUlt(c, cx, cy, r, pressed, run, w, tsec) {
  const sp = clamp(num(run?.sp, 0), 0, 100);
  const full = sp >= 100;
  const aw = w?.awakenState;
  const reduce = settings().reduceMotion === true;
  const pulse = reduce ? 0.6 : 0.5 + 0.5 * Math.sin(tsec * 6);
  const cid = w?.hero?.charId ?? w?.player?.hero?.charId;
  if (artOn() && cid && HUDM.drawArtIcon(c, aw?.ready ? 'awaken_' + cid : 'ult_' + cid, cx, cy, r * 1.62, full || aw?.ready ? 1 : 0.55)) {
    // 그린 팔각 테 (hud_mobile §3 궁극기): 안쪽에 SP 고리, 가득 차면 금빛 맥동 + 도는 광택
    const gr = r * 0.8;
    c.save();
    c.lineWidth = Math.max(3, r * 0.1); c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.beginPath(); c.arc(cx, cy, gr, 0, TAU); c.stroke();
    c.strokeStyle = aw?.ready ? '#ff3050' : full ? '#ffe070' : '#ff8a2a';
    if (sp > 0) { c.beginPath(); c.arc(cx, cy, gr, -Math.PI / 2, -Math.PI / 2 + TAU * sp / 100); c.stroke(); }
    if (full && !pressed) {
      c.globalAlpha *= 0.3 + 0.5 * pulse;
      c.lineWidth = Math.max(4, r * 0.18); c.strokeStyle = aw?.ready ? 'rgba(255,60,90,0.9)' : 'rgba(255,224,120,0.9)';
      c.beginPath(); c.arc(cx, cy, r * 1.02, 0, TAU); c.stroke();
      if (!reduce) { const a = (tsec * 3) % TAU; c.globalAlpha = 0.8; c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, r * 0.1); c.beginPath(); c.arc(cx, cy, gr, a, a + 0.5); c.stroke(); }
    }
    c.restore();
    if (!full && !aw?.ready) label(c, `${Math.floor(sp)}%`, cx, cy + r * 0.5, Math.max(11, r * 0.32), pressed, null, FONT.num);
    if (aw?.ready) label(c, '각성', cx, cy + r * 0.5, Math.max(11, r * 0.32), pressed, '#ff8090');
  } else ultVector(c, cx, cy, r, pressed, sp, full, aw, reduce, pulse, tsec);
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
/** 그림 없는 필살 버튼 (예전 벡터 그림) */
function ultVector(c, cx, cy, r, pressed, sp, full, aw, reduce, pulse, tsec) {
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
  if (aw?.ready) label(c, '각성', cx, cy + r * 0.42, Math.max(11, r * 0.3), pressed, '#ff8090');
}

/**
 * 스틱. 쉬는 동안 (hudfix — 보스방에서 받침이 영웅을 가렸다):
 *  · 떠 있는 스틱(기본): 받침 그림 대신 옅은 고리 하나만 (어디를 누르면 되는지만 알려 준다)
 *  · 고정 스틱: 받침 그림을 그리되, 영웅·보스가 받침 뒤에 있으면 OCC_A 로 옅게
 * 누르고 있는 동안은 받침·손잡이를 진하게.
 */
function drawStick(c, L, op) {
  const s = S.stick, R = L.R;
  const fixed = settings().touchStick === 'fixed';
  let ax, ay, fx, fy, a, ghost = false;
  if (s.active) { ax = s.ax; ay = s.ay; fx = s.fx; fy = s.fy; a = Math.max(0.85, op); }
  else {
    const f = (now() - s.relT) / (STICK_FADE * 1000);
    if (f < 1 && !fixed) { ax = s.ex; ay = s.ey; fx = ax; fy = ay; a = Math.max(0.85, op) * (1 - f); }
    else if (S.visible) {
      ax = L.home.x; ay = L.home.y; fx = ax; fy = ay;
      const occ = !!(OCC.mask & OCC_STICK);
      if (fixed) a = occ ? Math.min(op, OCC_A) : op;
      else { ghost = true; a = occ ? 0.22 : Math.min(0.6, op * 0.6); }
    } else return null;
  }
  if (a <= 0.01) return null;
  c.save();
  c.globalAlpha = a;
  if (ghost) { // 떠 있는 스틱의 쉬는 자리: 어두운 얇은 원판 + 금빛 고리 + 가운데 점 (받침 그림·손잡이 없이)
    c.fillStyle = 'rgba(8,3,8,0.22)'; c.beginPath(); c.arc(ax, ay, R, 0, TAU); c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(232,200,114,0.75)'; c.beginPath(); c.arc(ax, ay, R, 0, TAU); c.stroke();
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.arc(ax, ay, R + 1.5, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(232,200,114,0.8)'; c.beginPath(); c.arc(ax, ay, 3, 0, TAU); c.fill();
    c.restore();
    const e = R + 6;
    return { x: ax - e, y: ay - e, w: e * 2, h: e * 2 };
  }
  // 받침 (그린 철판 원판이 있으면 그것 — hud_mobile §3 '바탕 원판 그림')
  const base = artOn() ? HUDM.hudArt('stick_base') : null;
  if (base) { const z = R * 2.3; c.drawImage(base, ax - z / 2, ay - z / 2, z, z); }
  else {
    c.fillStyle = 'rgba(18,4,10,0.38)';
    c.beginPath(); c.arc(ax, ay, R, 0, TAU); c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(232,200,114,0.7)';
    c.beginPath(); c.arc(ax, ay, R, 0, TAU); c.stroke();
  }
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
  // 칠한 사각형 (다음 그리기에서 지울 곳): 받침 그림 2.3R · 질주 고리 1.15R · 손잡이
  const e = Math.max(R * 1.2, Math.hypot(dx, dy) + kr) + 4;
  return { x: ax - e, y: ay - e, w: e * 2, h: e * 2 };
}

// ── 가림 (hudfix, 의견 8): 영웅·보스가 쉬고 있는 스틱 받침·버튼 뒤에 있으면 그 조작을 옅게 (누르면 다시 진하게) ──
const OCC_A = 0.35, OCC_STICK = 1;
const OCC = { mask: 0, hero: { x0: 0, y0: 0, x1: 0, y1: 0, on: false }, boss: { x0: 0, y0: 0, x1: 0, y1: 0, on: false } };
/** 월드 엔티티 사각형 → CSS px (out.on = 화면에 있나) */
function entCss(L, w, e, out) {
  out.on = false;
  const cam = w?.camera;
  if (!cam || !e) return out;
  const z = cam.zoom || 1, k = L.cr.h / L.vh;
  const x = e.x, y = e.y, ew = e.w, eh = e.h;
  if (!(Number.isFinite(x) && Number.isFinite(y) && ew > 0 && eh > 0)) return out;
  out.x0 = L.cr.x + (x - cam.x) * z * k; out.x1 = out.x0 + ew * z * k;
  out.y0 = L.cr.y + (y - cam.y) * z * k; out.y1 = out.y0 + eh * z * k;
  out.on = true;
  return out;
}
/** 원(cx, cy, r) 과 사각형이 겹치나 */
const discHits = (b, cx, cy, r) => b.on && Math.hypot(cx - clamp(cx, b.x0, b.x1), cy - clamp(cy, b.y0, b.y1)) < r;
/** 이번 프레임 가림 마스크: 비트 0 = 스틱 받침, 1.. = PAD_IDS 순서 */
function occlusion(L, w) {
  if (!S.visible || S.editor || !w?.player || L.band) return 0;
  const H = entCss(L, w, w.player, OCC.hero);
  const b = w.boss;
  const B = b && w.bossActive && !b.dead && !b.hidden && !b.pendingBoss ? entCss(L, w, b, OCC.boss) : (OCC.boss.on = false, OCC.boss);
  if (!H.on && !B.on) return 0;
  let m = 0;
  if (!S.stick.active) { const r = 1.14 * L.R; if (discHits(H, L.home.x, L.home.y, r) || discHits(B, L.home.x, L.home.y, r)) m |= OCC_STICK; }
  let bit = 2;
  for (const id of PAD_IDS) {
    if (shownBtn(id)) { const p = btnPos(L, id), r = (p.d / 2) * rimOf(id); if (discHits(H, p.cx, p.cy, r) || discHits(B, p.cx, p.cy, r)) m |= bit; }
    bit <<= 1;
  }
  return m;
}
const occOf = (id) => (OCC.mask >> (PAD_IDS.indexOf(id) + 1)) & 1;
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
  settle(PAD_IDS.map((id) => E.pos[id]), E.bounds, null, 200, L.gap ?? GAP);
  E.ver++;
}
function defaultPositions(L) {
  const T = padPlan(L.band ? 'band' : 'overlay', L.kEff, PAD_M, false);
  const list = PAD_IDS.map((id) => {
    const [r, b, d0] = T[id];
    const d = Math.max(MIN_D, d0);
    return { id, cx: L.left ? L.ins.l + r : L.W - L.ins.r - r, cy: L.H - L.ins.b - b, d };
  });
  settle(list, L.bounds, null, 120, L.gap ?? GAP);
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
  paintNow(L);   // 숨어 있던 패드면 놓아 둔 백킹을 되살려 편집기를 바로 그린다 (빈 캔버스가 한 프레임 비치지 않게)
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
    const mine = E.reset && !E.moved ? null : toStored(E.pos, L);
    // 프리셋마다 따로 저장: 띠 'band:<id>', fold 'fold:<id>', wide 는 그냥 <id>. 다른 프리셋의 저장분은 그대로 둔다
    const prev = g?.settings?.touchLayout && typeof g.settings.touchLayout === 'object' ? g.settings.touchLayout : {};
    const pre = L?.prefix ?? '', keyPre = (k) => (k.startsWith('band:') ? 'band:' : k.startsWith('fold:') ? 'fold:' : '');
    const keep = {};
    for (const k of Object.keys(prev)) if (keyPre(k) !== pre) keep[k] = prev[k];
    if (mine) for (const id of Object.keys(mine)) keep[pre + id] = mine[id];
    const out = Object.keys(keep).length ? keep : null;
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
  const L = layout(true);
  S.occKey = ''; S.pending = true;
  // 보이는 패드는 같은 작업 안에서 다시 그리고(편집기 그림이 한 프레임 남지 않게), 숨은 패드는 백킹을 놓는다
  if (S.visible) paintNow(L); else releaseCanvas();
  if (S.cv) S.cv.style.display = S.visible ? '' : 'none';
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
  settle(PAD_IDS.map((id) => E.pos[id]), E.bounds, D.id, 200, S.L?.gap ?? GAP);
  E.moved = true; E.ver++; S.pending = true; startLoop();
}
function editUp(e) {
  const E = S.editor, D = E?.drag;
  if (!D || D.pid !== e.pointerId) { if (E && !e.target?.closest?.('.tp-bar')) claim(e); return; }
  claim(e);
  E.drag = null;
  // 놓은 뒤 한 번 더 정리 (놓은 버튼은 그 자리) — 저장된 배치가 다음 실행에서 움직이지 않게
  settle(PAD_IDS.map((id) => E.pos[id]), E.bounds, D.id, 200, S.L?.gap ?? GAP);
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
  if (!S.visible && !S.editor) releaseCanvas();   // 기본 300×150 백킹도 처음 보일 때까지 잡지 않는다
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
    scheduleDrawAssets();
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
  /**
   * 카메라용 (hudfix): 게임 화면 아래에서 조작(쉬는 스틱 받침·아래 줄 점프·공격·대시의 그린 테)이 차지하는 높이 / 캔버스 높이 (0–0.5).
   * 터치 모드에서 패드가 게임 화면 위에 있을 때만 (아래 띠·키보드·패드는 0). 보스 경기장 바닥을 이 위로 올린다
   */
  bottomReserve() {
    if (!hasDom() || !S.inited || !touchMode() || S.editor) return 0;
    const L = layout();
    if (!L || L.band) return 0;
    let top = L.home.y - 1.14 * L.R;
    for (const id of ['jump', 'attack', 'dash']) { if (S.hidden.has(id)) continue; const b = btnPos(L, id); top = Math.min(top, b.cy - (b.d / 2) * rimOf(id)); }
    return clamp((L.cr.y + L.cr.h - top) / Math.max(1, L.cr.h), 0, 0.5);
  },
  /** 배치 판 번호 (hudfix): 배치를 다시 계산할 때마다 바뀐다 — 아래 띠 빠른 칸처럼 버튼 자리에 기대는 HUD 배치의 캐시 키 */
  layoutVersion() { if (hasDom()) layout(); return S.lver; },
  /** HUD 선명 칸을 구울 DPR (= 덧캔버스 백킹 DPR). 패드가 없거나 터치 모드가 아니면 0 → HUD 는 게임 캔버스에 그린다 */
  crispDpr() {
    if (!hasDom() || !S.inited || !S.cv || S.editor || !touchMode()) return 0;
    const L = layout();
    return L ? overlayDpr(L) : 0;
  },
  /** HUD 선명 칸 하나를 이번 프레임에 알린다 (hud_crisp.js): c = 구운 캔버스, (x, y) = 덧캔버스 기기 px 왼쪽 위, ver = 내용 판 */
  hudLayer(id, c, x, y, ver, dpr) {
    let l = HUDL.get(id);
    if (!l) { l = { c: null, x: 0, y: 0, ver: -1, dpr: 0, seen: -1e9, shown: false }; HUDL.set(id, l); }
    const t = now();
    if (t - l.seen >= HUDL_TTL) l.shown = false;   // 다시 나타난 칸: 덧캔버스가 한 번 붙일 때까지는 게임 캔버스에도 그린다
    if (l.c !== c || l.x !== x || l.y !== y || l.ver !== ver || l.dpr !== dpr || !l.shown) { S.pending = true; startLoop(); }
    l.c = c; l.x = x; l.y = y; l.ver = ver; l.dpr = dpr; l.seen = t;
  },
  /** 덧캔버스가 이 칸을 (사라졌다 나타난 뒤) 한 번이라도 붙였나 — 아니면 HUD 가 게임 캔버스에도 그린다 (빈 프레임이 없게) */
  hudLayerShown(id) { const l = HUDL.get(id); return !!(l && l.shown && S.visible && S.drawn); },
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
    if (!S.visible && !S.editor) releaseCanvas();   // 숨은 패드면 재어 본 뒤 백킹을 다시 놓는다
    return (now() - t0) / n;
  },
  layoutInfo() {
    const L = layout();
    if (!L) return null;
    // [hudredo] 시험용: 배치 종류·여백·마을 줄·스틱 자리·불투명도·덧캔버스 백킹 크기·기기 DPR
    return {
      sizeClass: L.cls, k: L.k, kEff: L.kEff, band: L.band, bandH: L.bandH, left: L.left, custom: L.custom, yMin: L.yMin, R: L.R, dpr: S.dpr ?? null,
      preset: L.preset, town: !!L.town, gap: L.gap, margin: PAD_M, sysMarginWide: SYS_M_WIDE, W: L.W, H: L.H, ins: L.ins, cr: L.cr, home: L.home,
      opacity: opacityNow(), art: artOn(), devDpr: (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
      backing: S.cv ? { w: S.cv.width, h: S.cv.height } : null, tier: game()?.tier ?? null,
    };
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
