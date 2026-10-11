// HUD 영역 배치의 단일 출처 (MASTER_PLAN §1.8 v1.1) — owner: HUD-LAYOUT (W1) → HUD-FINAL (W3)
//
// hudLayout(world, vw, vh, pad?, opts?) → 레이아웃 L (논리 px, 사각형은 모두 {x,y,w,h}; 읽기 전용 — 고치지 말 것,
//   같은 입력이면 같은 객체를 돌려주므로 한 프레임에 여러 번 불러도 할당이 없다)
//   상시 영역: portrait vitals hearts skills ult awGauge ready companions callouts score combo
//   companionsDraw  동료 위젯을 그릴 때 companion_hud 에 넘기는 안쪽 사각형 (L.companions 안; 바깥 고리가 칸을 넘지 않게 — CMP_INK)
//   bossBar    지금 쓰는 보스 체력바 칸 (bossSlot 'top'|'bottom'; bossTop·bossBottom 은 두 후보, bossShown = 지금 보이는지)
//   transient  알림(announcer)·배너 한 칸 (배너가 이긴다)
//   meter(i)   기믹 게이지 i번째 줄 {x,y,w,h} (≤ 3줄, 가운데 위)
//   toast(i)   토스트 i번째 줄 {x: 가운데, y: 15px 글자 기준선, l, r, w, top, h: 26, hidden}. 2줄 토스트는 두 줄 칸을 쓴다
//   toastRows  이번 배치에서 쓸 수 있는 토스트 줄 수 (보통 3, 위쪽 보스 바가 보이면 1) · toastArea 토스트 줄 전체 사각형
//   meterRows  토스트·위쪽 보스 칸이 비켜 준 기믹 게이지 줄 수 (0–3)
//   gap {l, r} 가운데 빈 칸 (토스트·위쪽 보스 칸의 가로 범위)
//   touch, safe {l,r,t,b} (HUD 여백: safeArea 'full' 일 때만 game.safe), pad [패드 사각형 복사본; 숫자가 아니거나 크기 0 인 것은 뺀다],
//   padLeft/padTop (오른쪽 패드 묶음 | null). 패드 쪽이 사각형을 제자리에서 고쳐도 다음 호출에서 알아채고 다시 계산한다
//   터치: 상시 영역은 y 297 위에만 둔다 (TOUCH_FLOOR; 아래 보스 칸은 예외 — 태블릿 띠, 위쪽 칸이 240 px 보다 좁을 때)
//   textMin    이 배치의 HUD 글자 하한 (논리 px; 터치 = ceil(11 CSS px / cssScale), 아니면 0 — platform §6.2, hudPx)
//   big        휴대폰 배치 (터치이고 textMin ≥ 14): 글자가 커진 만큼 체력·하트·필살·동료·점수 칸을 키우고 왼쪽 묶음을 아래로 민다.
//              rows = { vit: vitalsRows(F), ult: ultRows(F), buff } (hud.js 가 같은 줄 위치로 그린다)
//   spBar      필살(SP) 막대 사각형 (각성 게이지 = spBar.y + 14 — feel_hud 가 SP 막대 위에 빛을 겹치는 계약)
// pad 를 생략하면 터치 모드에서 touchpad.occupiedRects() 를 쓰고, 그것이 비어 있으면(PLAT-TOUCH 이전 스텁)
// §1.4 기본 터치 배치를 본뜬 모형(modelPadRects)을 쓴다. 키보드·패드 모드에서는 패드가 없다.
// opts (시험·도구용 덮어쓰기): { touch, safe, boss, meters, textMin }  — meters = 토스트가 비켜 줄 기믹 게이지 줄 수 (기본:
//   world.gimmick.meterRows 가 숫자면 그 값, 아니면 3줄을 늘 비워 둔다), textMin = 글자 하한 (기본: hudTextMin(touch))
// hudRegions(L, opts) → 겹침 검사용 목록 (tools/test_hud_layout.mjs, HUD-FINAL)
// 프리셋 (hud_mobile §3): L.preset 'wide'(16:9~21:9 휴대폰·데스크톱 — 예전 배치) | 'fold'(1.1~1.5 : 1 폴드 펼침·태블릿 — 참고 캡처 구조).
//   hudPreset() = settings.hud.preset ('auto' 면 논리 화면비 vw/vh < 1.55 → fold), hudScaleK() = settings.hud.scale (0.85–1.2).
//   fold 에서 더 생기는 칸: minimap(원형, 왼쪽 위) · stage(스테이지 이름판) · quick[0..3](빠른 칸, 가운데 아래) · arc(데스크톱·패드: 스킬 원호;
//   터치는 패드가 원호를 그리므로 null). score = 가운데 위 재화 줄, vitals = 가운데 아래 큰 HP 막대, skills 는 크기 0 (원호에 있다).
//   fold 터치에서는 TOUCH_FLOOR 규칙 대신 '패드·스틱 자리와 겹치지 않기'만 지킨다 (아래 가운데는 체력·빠른 칸 자리).
// 주의 (순환 import): game.js 가 이 파일을 import 해도 되도록 모듈 최상위에서는 import 값에 접근하지 않는다.
import { input } from '../core/input.js';
import { touchpad, padPlan, planExtent, foldScale, foldSysPlan, deviceDpr, PAD_M, SYS_D, SYS_M_WIDE, PAD_LAYOUT_FOLD } from '../core/touchpad.js';
import * as GAME from '../core/game.js';
import { game, VIEW_H } from '../core/game.js';

export const HUD_GAP = 8;        // 영역 사이 최소 간격
export const TOAST_ROW = 26;     // 토스트 한 줄 높이
export const METER_ROW = 20;     // 기믹 게이지 줄 간격
export const METER_H = 16;       // 기믹 게이지 한 줄 높이
export const TOUCH_FLOOR = 296;  // 터치: 상시 영역의 아래 끝 한계 (§1.8 'no persistent HUD below y 297 on touch'; 아래 보스 칸만 예외)
/**
 * 동료 위젯(companion_hud, 설계 128×68)이 원점 밖으로 칠하는 폭 (설계 px): 탈것 바탕 원 r+3.5 · 탑승 금빛 고리 · 비행 탈것 기력 호 r+7
 * → 왼쪽·위로 8, 수호신 바탕 원 r+3 → 오른쪽으로 4. hudLayout 은 이만큼 안쪽 사각형(companionsDraw)을 주어 잉크가 L.companions 안에 머물게 한다
 */
export const CMP_INK = Object.freeze({ l: 8, t: 8, r: 4 });
const CMP_W = 128, CMP_H = 68;   // companion_hud 의 BASE_W × BASE_H (이 크기를 기준으로 줄여 그린다)

// ── 터치 HUD 글자 하한 (platform §6.2, 벤치마크 3) ──
// HUD 는 uiScale 장면이 아니라 논리 1 px = cssScale CSS px 이다 (휴대폰 ≈ 0.67–0.72). 터치에서는 전투 HUD 의 모든 글자를
// 실제 화면 11 CSS px 이상으로 그린다 → 논리 px 하한 = ceil(11 / cssScale) (phone2 17, phone1 16, 태블릿 11, 큰 터치 화면 ≤ 9).
export const HUD_MIN_CSS = 11;
export const HUD_BIG_MIN = 14;   // 하한이 이 논리 px 이상이면 휴대폰 배치(L.big)를 쓴다
const HUD_TEXT_MAX = 20;         // 하한의 상한 (캔버스가 아주 작아도 칸이 넘치지 않게; cssScale < 0.55 에서만 걸린다)
/** 이 기기의 HUD 글자 하한 (논리 px). 터치가 아니면 0 */
export function hudTextMin(touch = hudTouch(), g = game) {
  if (!touch) return 0;
  const cs = Number(g?.cssScale);
  return Math.min(HUD_TEXT_MAX, Math.ceil(HUD_MIN_CSS / (cs > 0.05 ? cs : 1) - 1e-6));
}
/** HUD 글자 크기 n 에 하한을 적용한다 (feel_hud·토스트·기믹 게이지도 이것을 쓰면 같은 규칙이 된다) */
export function hudPx(n, touch = hudTouch()) {
  const m = hudTextMin(touch);
  return n < m ? m : n;
}
/** 휴대폰 배치 체력 칸의 세로 줄 (칸 위 기준 상대 y): 이름 기준선 · HP 막대(숫자는 막대 안) · MP 막대 · EXP 막대 · 칸 높이 */
export function vitalsRows(F) {
  const name = Math.ceil(F * 0.82), hpTop = name + 4, hpH = F + 1, mpTop = hpTop + hpH + 3, mpH = 8, expTop = mpTop + mpH + 3;
  return { name, hpTop, hpH, mpTop, mpH, expTop, expH: 3, h: expTop + 3 };
}
// 퀘스트 칸 접힘 (quest_tracker.js 가 읽고 바꾼다 — 기기 localStorage 'bn.qt', 기본 접힘). 배치도 본다: 접혀 있으면 퀘스트 칸이
// 머리 줄 높이뿐이라 그 아래로 토스트 줄을 화면 오른쪽 끝까지 넓힌다 (hudfix, 검토 의견 '토스트가 268 dp 칸에서 잘린다')
let QC = null;
export function questCollapsed() {
  if (QC == null) { try { const v = localStorage.getItem('bn.qt'); QC = v == null ? true : v === '1'; } catch { QC = true; } }
  return QC;
}
export function setQuestCollapsed(v) {
  QC = !!v;
  try { localStorage.setItem('bn.qt', QC ? '1' : '0'); } catch { /* 저장 못 함 — 이번 실행만 */ }
}
/** 필살 칸의 세로 줄: 휴대폰 배치는 라벨을 F px 로 (막대는 그 아래), 아니면 예전 위치 (라벨 기준선 +10, 막대 +16) */
export function ultRows(F, big) {
  if (!big) return { label: 10, barTop: 16, h: 28 };
  const label = Math.ceil(F * 0.82), barTop = label + 4;
  return { label, barTop, h: barTop + 11 };
}

const R = (x, y, w, h) => ({ x, y, w, h });
const ZERO = Object.freeze({ l: 0, r: 0, t: 0, b: 0 });
const NO_PAD = Object.freeze([]);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const hitsAny = (r, list) => { for (const p of list) if (overlaps(r, p)) return true; return false; };

/** HUD 가 터치 배치를 쓰는가 (input.mode 가 생기면 그것, 아니면 기존 input.touchMode) */
export function hudTouch() {
  const m = input.mode;
  return m != null ? m === 'touch' : !!input.touchMode;
}

/** HUD 안전 영역 여백 (논리 px). 기본 safeArea 'fit' 은 캔버스가 이미 안전 영역 안에 있으므로 0 */
export function hudSafe(g = game) {
  if (g?.settings?.safeArea !== 'full') return ZERO;
  const s = g.safe;
  return s && (s.l || s.r || s.t || s.b) ? s : ZERO;
}

/** 지금 HUD 프리셋: settings.hud.preset ('wide'|'fold') 또는 'auto' → 논리 화면비 (vw/vh) 1.55 미만이면 'fold' */
export const FOLD_ASPECT = 1.55;
export function hudPreset(g = game, vw = g?.viewW, vh = g?.viewH) {
  if (g?.viewBand) return 'wide';   // [hudredo] 버튼 배치 '아래 띠' = 예전 판: 16:9 게임 안 HUD 는 넓은 배치
  const p = g?.settings?.hud?.preset;
  if (p === 'wide' || p === 'fold') return p;
  const a = (Number(vw) || 960) / (Number(vh) || VIEW_H);
  return a < FOLD_ASPECT ? 'fold' : 'wide';
}
/** 인터페이스 크기 배율 (settings.hud.scale, 0.85–1.2) */
export function hudScaleK(g = game) {
  const k = Number(g?.settings?.hud?.scale);
  return Number.isFinite(k) && k > 0 ? clamp(k, 0.85, 1.2) : 1;
}

/** 보스 체력바가 지금 보이는가 (등장 연출·대화 중·쓰러지는 중에는 숨김) */
export function bossBarShown(world) {
  const b = world?.boss;
  return !!(b && world.bossActive && !b.pendingBoss && !b.dead && !(b.dying > 0) && !world.cutscene);
}

// ── §1.4 터치 배치 모형 (PLAT-TOUCH 가 실제 패드를 그리기 전까지의 대체 + 시험용) ──
/** 크기 S 기준 버튼: [안전 영역 오른쪽 아래 모서리에서 중심까지 right, bottom, 지름] (CSS px) */
export const PAD_LAYOUT = {
  attack: [108, 58, 72], jump: [36, 118, 68], dash: [190, 44, 56], sub: [118, 146, 54],
  skill1: [190, 122, 54], skill2: [50, 200, 54], ult: [262, 96, 58], swap: [128, 214, 44],
  mount: [262, 176, 48], guard: [196, 200, 48],
};
/** 크기 등급 (platform §5.2): CSS 뷰포트 높이 < 400 → ×1.0, < 700 → ×1.1, 그 이상 ×1.25, 사용자 touchScale 곱 */
export function padSizeK(cssH, touchScale = 1) {
  return (cssH < 400 ? 1 : cssH < 700 ? 1.1 : 1.25) * clamp(Number(touchScale) || 1, 0.8, 1.3);
}

/**
 * 캔버스 배치 모형 (platform §6.1 fit/full, §5.2 태블릿 띠: 남는 세로가 120 CSS px 이상이면 캔버스를 위에 붙인다).
 * inset = CSS px 안전 영역. 반환 { vw, cs, canvas:{x,y,w,h}, cssW, cssH, inset, safe(논리 px HUD 여백) }
 */
export function modelView(cssW, cssH, inset = ZERO, safeArea = 'fit', { tall = true } = {}) {
  const fit = safeArea !== 'full';
  const ax = fit ? inset.l : 0, ay = fit ? inset.t : 0;
  const aw = fit ? cssW - inset.l - inset.r : cssW, ah = fit ? cssH - inset.t - inset.b : cssH;
  // 세로 확장 시야 (hud_mobile §2): game.viewSize 가 있으면 그 계산 (16:9 보다 네모나면 높이 540–760), 없으면 예전 규칙
  const V = typeof GAME.viewSize === 'function' ? GAME.viewSize(aw, ah, tall) : { vw: Math.round(clamp((VIEW_H * aw) / ah, 960, 1280)), vh: VIEW_H };
  const vw = V.vw, vh = V.vh;
  const s = Math.min(aw / vw, ah / vh);
  let w = Math.floor(vw * s), h = Math.floor(vh * s);
  if (vh !== VIEW_H) { if (aw - w <= 2) w = Math.floor(aw); if (ah - h <= 2) h = Math.floor(ah); }
  const spare = ah - h;
  const canvas = { x: ax + (aw - w) / 2, y: spare >= 120 ? ay : ay + spare / 2, w, h };
  const cs = h / vh;
  const safe = fit ? ZERO : { l: inset.l / cs, r: inset.r / cs, t: inset.t / cs, b: inset.b / cs };
  return { vw, vh, cs, canvas, cssW, cssH, inset, safe };
}

/**
 * 기본 터치 배치를 논리 px 사각형으로 (touchpad.occupiedRects() 와 같은 모양, 각 사각형에 id).
 * v = { vw, cssW, cssH, canvas:{x,y,w,h} (CSS px), inset:{l,r,t,b} (CSS px), touchScale, leftHanded, companions = true }
 * Ⅱ/가방 두 버튼(44 CSS px × 크기 등급)은 안전 영역 위쪽 가운데 ±50 CSS px.
 */
export function modelPadRects(v) {
  const ins = v.inset ?? ZERO;
  const csx = v.canvas.w / v.vw, csy = v.canvas.h / (v.vh ?? VIEW_H);
  const out = [];
  const add = (id, cx, cy, d) => out.push({ id, x: (cx - d / 2 - v.canvas.x) / csx, y: (cy - d / 2 - v.canvas.y) / csy, w: d / csx, h: d / csy });
  // touchpad.layout() 과 같은 계산 (padPlan · foldScale · foldSysPlan; 편집·settle 없이 기본값) — HUD-REDO 배치
  const band = v.cssH - ins.b - (v.canvas.y + v.canvas.h) >= 120;
  const fold = !band && v.preset === 'fold';
  const dpr = v.dpr ?? 2;
  const kd = fold || band ? foldScale(v.cssH, v.touchScale, v.hudScale, false, dpr) : foldScale(v.cssH, v.touchScale, 1, true);
  const csH = v.canvas.h / (v.vh ?? VIEW_H);
  const yMin = band ? v.canvas.y + v.canvas.h : v.canvas.y + (fold ? 160 : v.leftHanded ? 172 : 88) * csH;
  const availH = v.cssH - ins.b - yMin - (band ? 4 : 0), availW = (v.cssW - ins.l - ins.r) * 0.56;
  const kind = band ? 'band' : fold ? 'overlay' : 'wide';
  let k = kd, T = padPlan(kind, k, PAD_M, !!v.town);
  for (let i = 0; i < 6; i++) {
    const e = planExtent(T);
    const f = Math.min(1, (availH - PAD_M) / Math.max(1, e.top - PAD_M), (availW - PAD_M) / Math.max(1, e.extent - PAD_M));
    if (f >= 0.999) break;
    k = Math.max(0.5, k * f * 0.995);
    T = padPlan(kind, k, PAD_M, !!v.town);
  }
  for (const id in T) {
    const [right, bottom, d] = T[id];
    add(id, v.leftHanded ? ins.l + right : v.cssW - ins.r - right, v.cssH - ins.b - bottom, Math.max(44, d));
  }
  if (fold) {
    const sys = foldSysPlan(v.cssW, ins, Math.max(44, SYS_D * clamp(kd, 0.95 * Math.min(1, 2 / Math.max(1, dpr)), 1.15)), false, v.town ? ['pause', 'bag'] : null);
    for (const id in sys) add(id, sys[id].cx, sys[id].cy, sys[id].d);
    return out;
  }
  const mid = ins.l + (v.cssW - ins.l - ins.r) / 2, S = Math.max(44, SYS_D * clamp(kd, 0.96, 1.1)), top = ins.t + SYS_M_WIDE;
  add('pause', mid - 6 - S / 2, top + S / 2, S);
  add('bag', mid + 6 + S / 2, top + S / 2, S);
  return out;
}

// 실제 화면에 맞춘 모형 (창 크기·배율·안전 영역·터치 설정이 바뀔 때만 다시 잰다; 매 프레임 할당 없음)
const LV_N = 14;
const liveVals = new Array(LV_N).fill(undefined);
let liveOk = false, liveRects = NO_PAD;
function liveModelPad() {
  const g = game, cv = g?.canvas;
  if (!cv || typeof window === 'undefined') return NO_PAD;
  const s = g.safe ?? ZERO, st = g.settings ?? ZERO, v = liveVals;
  const iw = window.innerWidth, ih = window.innerHeight;
  if (liveOk && v[0] === iw && v[1] === ih && v[2] === g.viewW && v[3] === g.scale && v[4] === g.dpr && v[5] === s.l && v[6] === s.r
    && v[7] === s.t && v[8] === s.b && v[9] === st.touchScale && v[10] === st.touchLeftHanded && v[11] === st.safeArea
    && v[12] === g.viewH && v[13] === st.hud) return liveRects;
  v[0] = iw; v[1] = ih; v[2] = g.viewW; v[3] = g.scale; v[4] = g.dpr; v[5] = s.l; v[6] = s.r; v[7] = s.t; v[8] = s.b;
  v[9] = st.touchScale; v[10] = st.touchLeftHanded; v[11] = st.safeArea; v[12] = g.viewH; v[13] = st.hud;
  const r = cv.getBoundingClientRect();
  liveOk = !!(r.width && r.height); // 캔버스가 잠깐 숨겨져 크기가 0 이면 기억하지 않고 다음 호출에 다시 잰다
  if (!liveOk) return (liveRects = NO_PAD);
  const cs = r.height / (g.viewH || VIEW_H);
  liveRects = modelPadRects({
    vw: g.viewW, vh: g.viewH || VIEW_H, preset: hudPreset(g), hudScale: hudScaleK(g), cssW: window.innerWidth, cssH: window.innerHeight,
    canvas: { x: r.left, y: r.top, w: r.width, h: r.height },
    inset: { l: (s.l || 0) * cs, r: (s.r || 0) * cs, t: (s.t || 0) * cs, b: (s.b || 0) * cs },
    touchScale: st.touchScale, leftHanded: !!st.touchLeftHanded, dpr: deviceDpr(),
  });
  return liveRects;
}

/** 지금 HUD 가 피해야 할 패드 사각형 (논리 px) */
export function hudPadRects(touch = hudTouch()) {
  if (!touch) return NO_PAD;
  let rects = null;
  try { rects = touchpad.occupiedRects?.(); } catch { rects = null; }
  return rects?.length ? rects : liveModelPad();
}

// ── 배치 계산 ──
/** 패드 사각형마다 막는 쪽: 0 = 위쪽 시스템 버튼(칸 가운데와 비교), +1 = 오른쪽 묶음, −1 = 왼쪽 묶음(왼손 모드) */
function padSides(pad, vw, vh) {
  let rightN = 0, leftN = 0;
  for (const p of pad) if (p.y + p.h > vh * 0.3) { if (p.x + p.w / 2 >= vw / 2) rightN++; else leftN++; }
  const side = rightN >= leftN ? 1 : -1;
  return pad.map((p) => (p.y + p.h <= vh * 0.3 ? 0 : side));
}
/** r 의 아래 끝을, r 과 가로로 겹치고 r 아래로 내려오는 패드 사각형 위 8 px 까지 줄인다 (위에서 덮으면 높이 0) */
function shrinkBottom(r, pad, bottom) {
  for (const p of pad) if (p.x < r.x + r.w && p.x + p.w > r.x && p.y + p.h > r.y) bottom = Math.min(bottom, p.y - HUD_GAP);
  r.h = Math.max(0, bottom - r.y);
  return r;
}
/** 가로 칸 [l, r] 을, 세로로 겹치는 패드 사각형에서 8 px 떨어지게 줄인다 → {l, r} */
function clipSpan(l, r, top, h, pad, sides) {
  const mid = (l + r) / 2;
  for (let i = 0; i < pad.length; i++) {
    const p = pad[i];
    if (!(p.y < top + h && p.y + p.h > top)) continue;
    if (p.x + p.w <= l || p.x >= r) continue;
    const s = sides[i] || (p.x + p.w / 2 >= mid ? 1 : -1);
    if (s > 0) r = Math.min(r, p.x - HUD_GAP); else l = Math.max(l, p.x + p.w + HUD_GAP);
  }
  return { l, r: Math.max(l, r) };
}

function build(vw, vh, T, S, pad, bossOn, nM, F) {
  const l = S.l || 0, rr = S.r || 0, t = S.t || 0, b = S.b || 0;
  const right = vw - rr;
  const big = !!T && F >= HUD_BIG_MIN;
  const L = { vw, vh, touch: T, safe: S, pad, textMin: F, big };
  // 왼쪽 위 묶음 (초상화·체력·하트·스킬·필살·각성·준비 문구·동료)
  // 터치: 스킬 슬롯 아래 '페이지 n/2' 줄이 없다 (패드 ⇄ 버튼이 같은 것을 보여 준다) → 스킬 칸 높이 40
  L.portrait = R(14 + l, 12 + t, 66, 66);
  let ur;
  if (!big) {
    ur = ultRows(F, false);
    L.vitals = R(90 + l, 12 + t, 230, 50);
    L.hearts = R(90 + l, 64 + t, 260, 26);
    L.skills = R(14 + l, 92 + t, 88, T ? 40 : 62);
    L.ult = R(106 + l, 96 + t, 120, ur.h);
    L.companions = R(244 + l, 92 + t, 128, 68);
    L.rows = null;
  } else {
    // 휴대폰 배치: 글자 F px 가 들어가도록 체력 칸을 키우고(HP 숫자는 F+1 px 막대 안), 하트 줄·버프 칸을 늘리고,
    // 그 아래 묶음(스킬·필살·각성·준비 문구·동료)을 하트 줄 밑으로 민다. 동료 위젯은 거의 줄이지 않는다 (136 px → 배율 ≈ 0.97;
    // 140 px(배율 1)이면 노치 인셋 'full' 에서 위쪽 보스 칸이 240 px 아래로 좁아져 보스 바가 패드 쪽 아래 칸으로 내려간다)
    const vit = vitalsRows(F), buff = Math.min(26, F + 6);
    ur = ultRows(F, true);
    L.vitals = R(90 + l, 10 + t, 260, vit.h);
    L.hearts = R(90 + l, L.vitals.y + vit.h + 3, 290, buff + 4);
    const y1 = L.hearts.y + L.hearts.h + 4;
    L.skills = R(14 + l, y1, 88, 40);
    L.ult = R(106 + l, y1, 120, ur.h);
    L.companions = R(244 + l, y1, 136, Math.ceil(CMP_H * (136 - CMP_INK.l - CMP_INK.r) / CMP_W) + CMP_INK.t);
    L.rows = { vit, ult: ur, buff };
  }
  // 필살 막대 · 각성 게이지 · 준비 문구 (feel_hud 계약: 각성 게이지 y = SP 막대 y + 14, 준비 문구 = 각성 게이지 y + 22)
  L.spBar = R(L.ult.x, L.ult.y + ur.barTop, L.ult.w, 10);
  L.awGauge = R(106 + l, L.spBar.y + 14, 120, 20);
  L.ready = R(106 + l, L.awGauge.y + 22, 130, 22);
  // 동료 위젯 그리기 칸: 원점을 바깥 고리 폭만큼 안쪽으로, 크기는 남는 너비에 맞춘 배율(≈ 0.91; 휴대폰 배치 1)로 → 잉크 x 244–372, y 92–155
  const cmpK = (L.companions.w - CMP_INK.l - CMP_INK.r) / CMP_W;
  L.companionsDraw = R(L.companions.x + CMP_INK.l, L.companions.y + CMP_INK.t, CMP_W * cmpK, CMP_H * cmpK);
  // 오른쪽 위 점수 (고정 영역: 패드가 여기까지 올라오면 패드 배치(PLAT-TOUCH)가 크기를 줄여야 한다). 휴대폰 배치는 'SCORE' 글자를 빼고 20 px 넓힌다
  L.score = big ? R(right - 184, 10 + t, 170, 70) : R(right - 164, 10 + t, 150, T ? 70 : 62);
  // 동료 스킬 카드 줄의 기본 자리: 왼쪽 묶음 바로 아래 (휴대폰 배치는 묶음이 내려온 만큼)
  const laneY = big ? Math.max(L.skills.y + L.skills.h, L.ready.y + L.ready.h, L.companions.y + L.companions.h) + 4 : 176 + t;

  // 패드 분석: 위쪽 가운데 시스템 버튼 / 버튼 묶음 (오른쪽, 왼손 모드면 왼쪽)
  const sides = padSides(pad, vw, vh);
  let padLeft = null, padRight = null, padTop = null, inBand = false, clusters = 0;
  for (let i = 0; i < pad.length; i++) {
    const p = pad[i];
    if (!sides[i]) continue;
    clusters++;
    if (p.y + p.h > vh + 40) inBand = true; // 태블릿: 패드가 캔버스 아래 띠에 있다
    padTop = padTop == null ? p.y : Math.min(padTop, p.y);
    if (sides[i] > 0) padLeft = padLeft == null ? p.x : Math.min(padLeft, p.x);
    else padRight = padRight == null ? p.x + p.w : Math.max(padRight, p.x + p.w);
  }
  L.padLeft = padLeft; L.padRight = padRight; L.padTop = padTop;

  // 콤보·스타일 열 (DNF): 아래 끝 = min(200, 패드 위 − 8). 큰 패드(touchScale 1.3 등)가 오른쪽을 다 덮어
  // 40 px 도 남지 않으면 왼쪽 동료 카드 줄 아래(알림 칸 왼쪽)로 옮긴다
  // 터치에서는 y 297 아래(엄지·떠 있는 스틱 자리)에 상시 영역을 두지 않는다 (§1.8 '터치 패드' 행) → 대체 칸은 y 236–296
  // (터치는 52 px 미만이면 옮긴다: 그보다 낮으면 'HITS' 글자가 11 CSS px 아래로 줄어든다 — hudredo, 큰 패드 touchScale 1.3)
  let combo = shrinkBottom(R(right - 320, 90 + t, 306, 0), pad, 200 + t);
  if (combo.h < (T ? 52 : 40)) {
    const ay = Math.max(236 + t, laneY + 52 + HUD_GAP);
    const alt = R(14 + l, ay, 300, T ? Math.min(104, TOUCH_FLOOR - ay) : 104);
    if (alt.h >= 40 && !hitsAny(alt, pad)) combo = alt;
  }
  L.combo = combo;

  // 동료 스킬 카드 줄 (왼손 모드로 왼쪽 아래에 패드가 있으면 오른쪽 콤보 열 아래로 옮긴다)
  let lane = R(14 + l, laneY, 300, 52);
  if (hitsAny(lane, pad)) {
    const alt = R(right - 314, combo.y + combo.h + HUD_GAP, 300, 52);
    if (!hitsAny(alt, pad) && !overlaps(alt, combo) && (!T || alt.y + alt.h <= TOUCH_FLOOR)) lane = alt;
  }
  L.callouts = lane;

  // 기믹 게이지: 가운데 위 (터치는 시스템 버튼 아래). 옆 영역·패드에 닿으면 줄이거나 옆으로 민다
  const cx = (l + right) / 2;
  let mTop = (T ? 76 : 12) + t;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < pad.length; i++) {
      const p = pad[i];
      if (sides[i] === 0 && p.x < cx + 100 && p.x + p.w > cx - 100 && p.y < mTop + 3 * METER_ROW && p.y + p.h + 4 > mTop) mTop = p.y + p.h + 4;
    }
  }
  const mBot = mTop + 3 * METER_ROW - (METER_ROW - METER_H);
  const inRows = (q) => q.y < mBot && q.y + q.h > mTop;
  let lo = -Infinity, hi = Infinity;
  for (const q of [L.vitals, L.hearts, L.companions]) if (inRows(q)) lo = Math.max(lo, q.x + q.w + HUD_GAP);
  for (const q of [L.score, combo]) if (inRows(q)) hi = Math.min(hi, q.x - HUD_GAP);
  for (let i = 0; i < pad.length; i++) {
    if (!sides[i] || !inRows(pad[i])) continue;
    if (sides[i] > 0) hi = Math.min(hi, pad[i].x - HUD_GAP); else lo = Math.max(lo, pad[i].x + pad[i].w + HUD_GAP);
  }
  const half = Math.max(0, Math.min(100, (hi - lo) / 2));
  const mcx = clamp(cx, lo + half, hi - half);
  const meters = [0, 1, 2].map((i) => R(mcx - half, mTop + i * METER_ROW, half * 2, METER_H));
  L.meters = meters;
  L.meter = (i) => meters[i] ?? R(mcx - half, mTop + i * METER_ROW, half * 2, METER_H);

  // 가운데 빈 칸 (토스트, 위쪽 보스 칸): 왼쪽은 동료 칸 오른쪽 + 8 (기본 배치 380, 휴대폰 배치는 동료 칸이 넓어진 만큼)
  const gapL = Math.max(380 + l, L.companions.x + L.companions.w + HUD_GAP), gapR = vw - 328 - rr;
  L.gap = { l: gapL, r: gapR };

  // 알림·배너 칸: y 230–294, 좌우 322 여백, 패드에 닿으면 패드에서 8 px 떨어진 곳까지
  const ty = 230 + t, th = 64;
  const ts = clipSpan(322 + l, right - 322, ty, th, pad, sides);
  const tw = Math.min(560, ts.r - ts.l);
  L.transient = R(ts.l + (ts.r - ts.l - tw) / 2, ty, tw, th);

  // 보스 체력바: 아래 칸 (데스크톱·태블릿 띠) / 위쪽 가운데 칸 (패드가 아래를 덮는 휴대폰).
  // 위쪽 칸은 y 148 에서 시작하되, 큰 시스템 버튼 때문에 게이지 줄이 내려왔으면 그 아래로 비킨다
  const n = clamp(Math.round(nM), 0, 3);
  L.meterRows = n;   // 토스트·위쪽 보스 칸이 비켜 준 게이지 줄 수
  const bty = Math.max(148 + t, n ? meters[n - 1].y + METER_H + 4 : 0);
  // 휴대폰 배치: 동료 라벨('하차 수호 AUTO')과 보스 이름이 같은 높이의 F px 글자라 8 px 사이면 한 줄로 이어 읽힌다 → 8 px 더 띄운다
  // (그러면 240 px 보다 좁아질 때는 띄우지 않는다 — 위쪽 칸이 좁으면 보스 바가 패드 쪽 아래 칸으로 내려가므로)
  let tsl = clipSpan(gapL + (big ? HUD_GAP : 0), gapR, bty, 36, pad, sides);
  if (big && tsl.r - tsl.l < 240) tsl = clipSpan(gapL, gapR, bty, 36, pad, sides);
  L.bossTop = R(tsl.l, bty, tsl.r - tsl.l, 36);
  const bw = Math.min(640, vw - 260 - l - rr), by = vh - 72 - b;
  const bx = (l + right - bw) / 2;
  let bottom = R(bx, by, bw, 48);
  if (hitsAny(bottom, pad)) {
    const bs = clipSpan(bx, bx + bw, by, 48, pad, sides);
    bottom = R(bs.l, by, bs.r - bs.l, 48);
  }
  L.bossBottom = bottom;
  const padCoversBottom = T && clusters > 0 && !inBand;
  if (padCoversBottom) L.bossSlot = L.bossTop.w < 240 && bottom.w >= 240 && bottom.w > L.bossTop.w ? 'bottom' : 'top';
  else L.bossSlot = bottom.w >= 360 || bottom.w >= L.bossTop.w ? 'bottom' : 'top';
  L.bossBar = L.bossSlot === 'top' ? L.bossTop : L.bossBottom;
  L.bossShown = !!bossOn;

  // 토스트: 게이지 아래 26 px 줄 ≤ 3 (위쪽 보스 바가 보이면 그 아래 1줄), 알림 칸 위에서 멈춘다
  // (알림 단어가 박히는 첫 프레임의 위쪽 넘침은 hud.js 가 토스트 줄을 빼고 잘라 그린다 — 휴대폰에서 줄 수를 줄이지 않으려고)
  let top0 = n ? meters[n - 1].y + METER_H + 4 : mTop;
  const bossTopOn = L.bossShown && L.bossSlot === 'top';
  if (bossTopOn) top0 = Math.max(top0, L.bossTop.y + L.bossTop.h + 4);
  const rows = Math.max(0, Math.min(bossTopOn ? 1 : 3, Math.floor((L.transient.y - 4 - top0) / TOAST_ROW)));
  const rowAt = (i) => {
    const top = top0 + i * TOAST_ROW;
    const s = clipSpan(gapL, gapR, top, TOAST_ROW, pad, sides);
    return { x: (s.l + s.r) / 2, y: top + 18, l: s.l, r: s.r, w: s.r - s.l, top, h: TOAST_ROW, hidden: i >= rows };
  };
  const toastList = [0, 1, 2].map(rowAt);
  L.toastRows = rows;
  L.toasts = toastList;
  L.toast = (i) => toastList[i] ?? rowAt(i);
  L.toastArea = R(gapL, top0, gapR - gapL, rows * TOAST_ROW);
  return L;
}

/**
 * 폴드·태블릿 배치 (hud_mobile §1 참고 캡처 구조 → HUD-REDO /tmp/claude-0/g10/hudredo_design.md §3). 논리 높이 vh 540–760. k = settings.hud.scale.
 *  왼쪽 위: 원형 미니맵 + 오른쪽 열 [스테이지 이름판 · 초상화+이름/직업+HP/MP/EXP(L.portrait·L.vitals) · 하트 줄 · 필살/각성 + 동료 위젯]
 *          그 아래 동료 카드 줄 (사용자 피드백 7: 체력 묶음을 아래 가운데에서 위로 — 아래 가운데는 비우고 버튼이 옆으로 퍼진다)
 *  가운데 위: 재화 줄(L.score: 골드 · 점수 · 목숨) → 그 아래 기믹 게이지 · 위쪽 보스 바 · 토스트
 *  오른쪽 위: 패드 아이콘 줄(지도·가방·메뉴) — 데스크톱은 비워 둔다 · 그 아래 퀘스트 칸(L.quest; 보스 바가 보이면 숨김) · 콤보 열
 *  아래: 빠른 칸 4개(L.quick) — 스틱 받침 오른쪽부터 아래 여백(PAD_M dp) 위에 한 줄 (터치), 데스크톱은 왼쪽 아래
 *  오른쪽 아래: 터치는 패드 원호, 데스크톱·패드는 L.arc (hud.js 가 같은 그림으로 그린다, 누르지는 않는다)
 */
function buildFold(vw, vh, T, S, pad, bossOn, nM, F, k, cs, qcIn = false) {
  const l = S.l || 0, rr = S.r || 0, t = S.t || 0, b = S.b || 0;
  const right = vw - rr;
  const L = { vw, vh, touch: T, safe: S, pad, textMin: F, big: false, preset: 'fold', fold: true, hudK: k, rows: null };
  const sides = padSides(pad, vw, vh);
  let padLeft = null, padTop = null, sysLeft = null, sysBottom = null, stickR = null;
  for (let i = 0; i < pad.length; i++) {
    const p = pad[i];
    if (!sides[i] || p.y < vh * 0.3) { // 위쪽 아이콘 줄
      if (p.x + p.w / 2 > vw / 2) { sysLeft = sysLeft == null ? p.x : Math.min(sysLeft, p.x); sysBottom = Math.max(sysBottom ?? 0, p.y + p.h); }
      continue;
    }
    if (sides[i] > 0) { padLeft = padLeft == null ? p.x : Math.min(padLeft, p.x); padTop = padTop == null ? p.y : Math.min(padTop, p.y); }
  }
  // 데스크톱·패드: 스킬 원호 칸 (터치는 패드가 그린다) — 패드 배치표(padPlan) 범위 + 여유 12 (hud.js drawArcHUD 가 같은 비율로 그린다)
  const PE = planExtent(PAD_LAYOUT_FOLD);
  const aw = Math.round((PE.extent + 12) * k), ah = Math.round((PE.top + 12) * k);
  L.arc = T ? null : R(right - aw - 8, vh - b - ah - 8, aw, ah);
  if (L.arc) { padLeft = L.arc.x; padTop = L.arc.y; }
  L.padLeft = padLeft; L.padRight = null; L.padTop = padTop;

  // ── 왼쪽 위: 미니맵 + 오른쪽 열 ──
  const mm = Math.round(104 * k);
  L.minimap = R(12 + l, 10 + t, mm, mm);
  const x0 = L.minimap.x + mm + 10, colW = Math.round(250 * k);
  L.stage = R(x0, 10 + t, colW, Math.max(22, F + 9));
  const vy = L.stage.y + L.stage.h + 6;
  const ph = Math.round(48 * k);
  const vitH = Math.max(ph, vitalsFoldRows(F).h);
  L.portrait = R(x0, vy, ph, ph);
  L.vitals = R(x0 + ph + 6, vy, colW - ph - 6, vitH);
  L.hearts = R(x0, vy + vitH + 6, colW, 26);
  const ur = ultRows(F, false);
  L.ult = R(x0, L.hearts.y + L.hearts.h + 4, 120, ur.h);
  L.spBar = R(L.ult.x, L.ult.y + ur.barTop, L.ult.w, 10);
  L.awGauge = R(L.ult.x, L.spBar.y + 14, 120, 20);
  L.ready = R(L.ult.x, L.awGauge.y + 22, 124, 22);
  L.skills = R(l, t, 0, 0);       // 원호에 있다
  // 동료 위젯: 필살 열 오른쪽 (칸 122 → 배율 ≈ 0.86)
  const cmpX = x0 + 128, cmpW = Math.max(96, x0 + colW - cmpX);
  L.companions = R(cmpX, L.ult.y - 2, cmpW, Math.round(CMP_H * (cmpW - CMP_INK.l - CMP_INK.r) / CMP_W) + CMP_INK.t);
  const cmpK = (L.companions.w - CMP_INK.l - CMP_INK.r) / CMP_W;
  L.companionsDraw = R(L.companions.x + CMP_INK.l, L.companions.y + CMP_INK.t, CMP_W * cmpK, CMP_H * cmpK);
  const leftBottom = Math.max(L.ready.y + L.ready.h, L.companions.y + L.companions.h, L.minimap.y + mm);
  L.callouts = R(12 + l, leftBottom + 6, 300, 52);
  const leftEdge = x0 + colW + HUD_GAP;   // 왼쪽 위 묶음 오른쪽 끝 (+8)

  // ── 가운데 위: 재화 줄 (골드 · 점수 · 목숨) ──
  const cw = Math.round(300 * k), chh = Math.max(28, F + 14);
  const cmax = (sysLeft ?? right) - 12;
  const cxs = clamp(Math.round((leftEdge + 4 + cmax) / 2 - cw / 2), leftEdge + 4, Math.max(leftEdge + 4, cmax - cw));
  L.score = R(cxs, 10 + t, Math.min(cw, Math.max(160, cmax - cxs)), chh);

  // ── 오른쪽: 퀘스트 칸 (아이콘 줄 아래) ──
  const qTop = Math.max(L.score.y + L.score.h + HUD_GAP, (sysBottom ?? 0) + HUD_GAP, 12 + t);
  const qw = Math.round(240 * k), qh = questPanelH(F), qc = !!qcIn;
  // 접힘이면 칸 = 머리 줄 높이 (그 아래는 토스트가 쓴다). 콤보 열은 펼친 높이 기준 그대로 (접고 펼 때 움직이지 않게)
  L.quest = R(right - 12 - qw, qTop, qw, qc ? questHeadH(F) : qh);
  L.questFull = qh;
  L.questShown = !bossOn;

  // ── 아래: 빠른 칸 (터치: 스틱 받침 오른쪽, 아래 여백 PAD_M dp) ──
  // 칸 사이 ≥ 12 CSS px (hud_mobile §3: 옆 칸을 잘못 누르지 않게)
  const csK = cs > 0.05 ? cs : 1, mB = T ? PAD_M / csK : 14;
  const q = Math.max(T ? Math.ceil(44 / csK) : 44, Math.round(52 * k)), qg = T ? Math.ceil(12 / csK) : 10, qn = 4;   // 터치: 칸 ≥ 44 CSS px
  const rowW = qn * q + (qn - 1) * qg;
  let qx = 24 + l;
  if (T) {
    // 스틱 받침 옆 (hudfix: 왼손 모드는 스틱이 오른쪽 → 스틱 왼쪽에 오른쪽 끝을 맞춘다; 예전엔 화면 밖으로 나갔다).
    // 줄은 화면 안 [여백, 화면 − 여백] 에 가둔다 (버튼 묶음과 겹치면 hud 시험 §6 이 잡는다)
    let z = null;
    try { z = touchpad.stickZone?.(); } catch { z = null; }
    const lh = !!game?.settings?.touchLeftHanded;
    if (lh) qx = (z ? z.x : vw - rr - (PAD_M + 2.28 * 57 + 24) / csK) - 4 - rowW;
    else qx = Math.max(qx, (z ? z.x + z.w : (PAD_M + 2.28 * 57 + 24) / csK) + 4);
    qx = clamp(qx, l + PAD_M / csK, Math.max(l + PAD_M / csK, right - PAD_M / csK - rowW));
  }
  const qy = vh - b - mB - q;
  L.quick = [];
  for (let i = 0; i < qn; i++) L.quick.push(R(qx + i * (q + qg), qy, q, q));
  L.quickRow = R(qx, qy, rowW, q);

  // ── 기믹 게이지 · 위쪽 보스 바 · 토스트 (가운데 위 빈 칸) ──
  const gapR0 = L.quest.x - HUD_GAP;
  const mTop = L.score.y + L.score.h + 6;
  const n = clamp(Math.round(nM), 0, 3);
  L.meterRows = n;
  const gapL = leftEdge;
  const midX = (gapL + gapR0) / 2, half = Math.max(0, Math.min(100, (gapR0 - gapL) / 2));
  const meters = [0, 1, 2].map((i) => R(midX - half, mTop + i * METER_ROW, half * 2, METER_H));
  L.meters = meters;
  L.meter = (i) => meters[i] ?? R(midX - half, mTop + i * METER_ROW, half * 2, METER_H);
  // 보스 바: 기믹 게이지 아래, 왼쪽 위 묶음 오른쪽부터 화면 오른쪽 끝까지 (퀘스트 칸은 보스전 동안 숨는다) — 콤보 열은 그 아래
  const bty = Math.max(n ? meters[n - 1].y + METER_H + 4 : mTop, (sysBottom ?? 0) + HUD_GAP);
  const bR = right - 12, bw = Math.min(560, bR - gapL);
  L.bossTop = R(Math.round((gapL + bR) / 2 - bw / 2), bty, bw, 36);
  L.bossBottom = L.bossTop;
  L.bossSlot = 'top';
  L.bossBar = L.bossTop;
  L.bossShown = !!bossOn;
  let topR = bossOn ? L.bossTop.y + L.bossTop.h + HUD_GAP : L.quest.y + L.questFull + HUD_GAP;
  const comboBottom = Math.min(topR + 230, (padTop ?? vh) - HUD_GAP);
  L.combo = R(right - 302, topR, 290, Math.max(0, comboBottom - topR));
  const gapR = Math.min(gapR0, L.combo.x - HUD_GAP);
  L.gap = { l: gapL, r: bossOn ? L.combo.x - HUD_GAP : gapR0 };
  // 알림·배너: 가운데 (콤보 열·동료 카드 줄·보스 바 아래, 패드에 닿으면 그만큼 줄인다)
  const ty = Math.round(Math.max(bty + 36 + 4 + 2 * TOAST_ROW + 4, L.callouts.y + L.callouts.h + HUD_GAP, L.combo.y + L.combo.h + HUD_GAP));
  const padX = L.arc ? [...pad, L.arc] : pad, sidesX = L.arc ? [...sides, 1] : sides;   // 데스크톱 원호 칸도 패드처럼 피한다
  const ts = clipSpan(12 + l, right - 12, ty, 64, padX, sidesX);
  const tw = Math.min(560, ts.r - ts.l);
  L.transient = R(Math.round((ts.l + ts.r - tw) / 2), ty, tw, 64);
  let top0 = n ? meters[n - 1].y + METER_H + 4 : mTop;
  if (L.bossShown) top0 = Math.max(top0, L.bossTop.y + L.bossTop.h + 4);
  // 토스트 줄 (hudfix: 예전엔 왼쪽 묶음 ~ 콤보 열 사이 266 px 한 칸 폭이라 긴 알림이 '…' 로 잘렸다):
  //  줄마다 오른쪽 끝 = 그 줄 높이에 걸리는 것(콤보 열 · 퀘스트 칸) 왼쪽 8 px, 없으면 화면 오른쪽 여백까지. 보스 바 아래는 2줄
  const rows = Math.max(0, Math.min(L.bossShown ? 2 : 3, Math.floor((L.transient.y - 4 - top0) / TOAST_ROW)));
  const qOn = L.quest && L.questShown;
  const rowAt = (i) => {
    const top = top0 + i * TOAST_ROW, bot = top + TOAST_ROW;
    let r = right - 12;
    if (L.combo.h > 0 && L.combo.y < bot && L.combo.y + L.combo.h > top) r = Math.min(r, L.combo.x - HUD_GAP);
    if (qOn && L.quest.y < bot && L.quest.y + L.quest.h + HUD_GAP > top) r = Math.min(r, L.quest.x - HUD_GAP);
    return { x: (gapL + r) / 2, y: top + 18, l: gapL, r, w: r - gapL, top, h: TOAST_ROW, hidden: i >= rows };
  };
  const toastList = [0, 1, 2].map(rowAt);
  L.toastRows = rows;
  L.toasts = toastList;
  L.toast = (i) => toastList[i] ?? rowAt(i);
  const tR = rows ? Math.max(...toastList.slice(0, rows).map((q) => q.r)) : gapR;
  L.toastArea = R(gapL, top0, tR - gapL, rows * TOAST_ROW);
  return L;
}
/** 폴드 체력 칸 세로 줄 (칸 위 기준): 이름 기준선 · HP 막대(숫자는 안) · MP 막대 · EXP 막대 · 높이 */
export function vitalsFoldRows(F) {
  const fs = Math.max(12, F), name = Math.ceil(fs * 0.86), hpTop = name + 4, hpH = Math.max(15, fs + 3), mpTop = hpTop + hpH + 3, mpH = 6, expTop = mpTop + mpH + 3;
  return { fs, name, hpTop, hpH, mpTop, mpH, expTop, expH: 3, h: expTop + 3 };
}
/** 퀘스트 칸 높이 (펼친 크기: 머리 줄 + 3줄) — quest_tracker.js 가 같은 줄 높이로 그린다 */
export function questPanelH(F) { const fs = Math.max(12, F); return Math.round(fs + 14) + 3 * Math.round(fs + 6) + 4; }
/** 퀘스트 칸 머리 줄 높이 (접힌 칸) */
export function questHeadH(F) { return Math.round(Math.max(12, F) + 14); }

// 한 칸짜리 기억 (같은 입력 → 같은 객체).
// 패드는 사각형 객체가 아니라 숫자 값(x,y,w,h)을 적어 둔다: 패드 쪽이 같은 객체를 제자리에서 고쳐도(크기·배치 편집) 바뀐 것을 알아챈다
let memo = null;
const memoArgs = [];
const memoPad = [];
function samePad(snap, pad) {
  if (snap.length !== pad.length * 4) return false;
  for (let i = 0, j = 0; i < pad.length; i++, j += 4) {
    const p = pad[i];
    if (!p || !Object.is(snap[j], p.x) || !Object.is(snap[j + 1], p.y) || !Object.is(snap[j + 2], p.w) || !Object.is(snap[j + 3], p.h)) return false;
  }
  return true;
}
/** 패드 사각형 복사본 (숫자가 아니거나 크기가 없는 것은 버린다 — 배치 전 NaN 등) */
function cleanPad(pad) {
  const out = [];
  for (const p of pad) {
    if (!p || !(Number.isFinite(p.x) && Number.isFinite(p.y) && p.w > 0 && p.h > 0 && Number.isFinite(p.w) && Number.isFinite(p.h))) continue;
    out.push(p.id != null ? { id: p.id, x: p.x, y: p.y, w: p.w, h: p.h } : { x: p.x, y: p.y, w: p.w, h: p.h });
  }
  return out;
}

/**
 * 아래 띠의 빠른 칸 (hudfix, 버튼 배치 '아래 띠'): 띠 안에서 스틱 받침과 버튼 묶음 사이 빈 곳의 가운데, 스틱 높이에 4칸.
 * 게임 캔버스 밖(논리 y > vh)이라 hud.js 는 덧캔버스 선명 칸으로만 그리고, 탭은 game.hudTaps 로 같다. 자리가 모자라면 없음 (L.quick = null)
 */
function bandQuick(L, g, vw, vh, band) {
  L.quick = null; L.quickRow = null;
  if (!band || typeof window === 'undefined') return;
  let I = null;
  try { I = touchpad.layoutInfo?.(); } catch { I = null; }
  const cr = g?.canvasRect;
  if (!I || !I.band || !I.home || !cr || !(cr.h > 0)) return;
  const cs = cr.h / vh, gap = 16, sr = 1.14 * I.R;
  const q = Math.max(44, Math.round(54 * Math.min(1.1, Math.max(0.85, I.kEff || 1)))), qg = 12, rowW = 4 * q + 3 * qg;
  // 버튼 묶음의 가로 범위 (CSS px): 띠 안 버튼들
  let bx0 = Infinity, bx1 = -Infinity;
  try { for (const b of touchpad.buttons?.() ?? []) { if (b.cy < cr.y + cr.h) continue; bx0 = Math.min(bx0, b.cx - b.d * 0.6); bx1 = Math.max(bx1, b.cx + b.d * 0.6); } } catch { /* 버튼 없음 */ }
  if (!(bx1 > bx0)) return;
  const lo = I.left ? bx1 + gap : I.home.x + sr + gap, hi = I.left ? I.home.x - sr - gap : bx0 - gap;
  if (hi - lo < rowW) return;
  const x0 = (lo + hi) / 2 - rowW / 2, y0 = I.home.y - q / 2;
  L.quick = [];
  for (let i = 0; i < 4; i++) L.quick.push(R((x0 + i * (q + qg) - cr.x) / cs, (y0 - cr.y) / cs, q / cs, q / cs));
  L.quickRow = R((x0 - cr.x) / cs, (y0 - cr.y) / cs, rowW / cs, q / cs);
}

export function hudLayout(world, vw, vh, pad, opts) {
  vw = vw ?? game.viewW; vh = vh ?? game.viewH ?? VIEW_H;
  const T = !!(opts?.touch ?? hudTouch());
  const S = opts?.safe ?? hudSafe(world?.game ?? game);
  if (!Array.isArray(pad)) pad = hudPadRects(T);
  const bossOn = !!(opts?.boss ?? bossBarShown(world));
  const gm = world?.gimmick?.meterRows;
  const nM = clamp(Math.round(Number(opts?.meters ?? (Number.isFinite(gm) ? gm : 3))) || 0, 0, 3);
  const F = T ? clamp(Math.round(Number(opts?.textMin ?? hudTextMin(true))) || 0, 0, HUD_TEXT_MAX) : 0;
  const g0 = world?.game ?? game;
  const pr = opts?.preset ?? hudPreset(g0, vw, vh);
  const hk = opts?.hudScale ?? hudScaleK(g0);
  const qc = opts?.questCollapsed ?? questCollapsed();   // [hudfix] 퀘스트 칸 접힘 → 토스트 줄 폭
  const band = !!g0?.viewBand && T;                      // [hudfix] 아래 띠: 빠른 칸을 띠에
  const lh = !!g0?.settings?.touchLeftHanded;
  const bv = band ? (touchpad.layoutVersion?.() ?? 0) : 0;   // 띠 빠른 칸은 버튼 자리를 따른다 (패드 배치가 늦게 잡혀도 다시 계산)
  const a = memoArgs;
  if (memo && a[0] === vw && a[1] === vh && a[2] === T && a[3] === (S.l || 0) && a[4] === (S.r || 0) && a[5] === (S.t || 0) && a[6] === (S.b || 0)
    && a[7] === bossOn && a[8] === nM && a[9] === F && a[10] === pr && a[11] === hk && a[12] === (Number(g0?.cssScale) || 1) && a[13] === qc && a[14] === band && a[15] === lh && a[16] === bv && samePad(memoPad, pad)) {
    if (band && !memo.quick && pr !== 'fold') bandQuick(memo, g0, vw, vh, band);   // 패드가 아직 안 보여 버튼 자리가 없던 첫 프레임 → 다시 시도
    return memo;
  }
  memo = pr === 'fold' ? buildFold(vw, vh, T, S, cleanPad(pad), bossOn, nM, F, hk, Number(g0?.cssScale) || 1, qc) : build(vw, vh, T, S, cleanPad(pad), bossOn, nM, F);
  if (pr !== 'fold') { memo.preset = 'wide'; memo.fold = false; memo.arc = null; memo.quest = null; memo.questShown = false; bandQuick(memo, g0, vw, vh, band); }
  a.length = 0; a.push(vw, vh, T, S.l || 0, S.r || 0, S.t || 0, S.b || 0, bossOn, nM, F, pr, hk, Number(g0?.cssScale) || 1, qc, band, lh, bv);
  memoPad.length = 0;
  for (const p of pad) memoPad.push(p?.x, p?.y, p?.w, p?.h);
  return memo;
}

/**
 * 겹침 검사용 목록 (시험·HUD-FINAL). boss/meters/toasts 는 보이는 것만 넣는다.
 * → { persistent: [[이름, 사각형]…], toasts: [[이름, 사각형]…], transient, pad }
 */
export function hudRegions(L, { boss = L.bossShown, meters = 3, toasts = L.toastRows } = {}) {
  const persistent = [];
  for (const k of ['portrait', 'vitals', 'hearts', 'skills', 'ult', 'awGauge', 'ready', 'companions', 'callouts', 'score', 'combo']) persistent.push([k, L[k]]);
  if (L.fold) {
    persistent.push(['minimap', L.minimap], ['stage', L.stage]);
    L.quick.forEach((q, i) => persistent.push(['quick' + i, q]));
    if (L.arc) persistent.push(['arc', L.arc]);
    if (L.quest && L.questShown && !boss) persistent.push(['quest', L.quest]);
  }
  for (let i = 0; i < meters; i++) persistent.push(['meter' + i, L.meter(i)]);
  if (boss) persistent.push(['boss', L.bossBar]);
  const tl = [];
  for (let i = 0; i < toasts; i++) { const q = L.toast(i); tl.push(['toast' + i, R(q.l, q.top, q.w, q.h)]); }
  return { persistent, toasts: tl, transient: L.transient, pad: L.pad };
}
