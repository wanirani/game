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
// pad 를 생략하면 터치 모드에서 touchpad.occupiedRects() 를 쓰고, 그것이 비어 있으면(PLAT-TOUCH 이전 스텁)
// §1.4 기본 터치 배치를 본뜬 모형(modelPadRects)을 쓴다. 키보드·패드 모드에서는 패드가 없다.
// opts (시험·도구용 덮어쓰기): { touch, safe, boss, meters }  — meters = 토스트가 비켜 줄 기믹 게이지 줄 수 (기본:
//   world.gimmick.meterRows 가 숫자면 그 값, 아니면 3줄을 늘 비워 둔다)
// hudRegions(L, opts) → 겹침 검사용 목록 (tools/test_hud_layout.mjs, HUD-FINAL)
// 주의 (순환 import): game.js 가 이 파일을 import 해도 되도록 모듈 최상위에서는 import 값에 접근하지 않는다.
import { input } from '../core/input.js';
import { touchpad } from '../core/touchpad.js';
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

/** 보스 체력바가 지금 보이는가 (등장 연출·대화 중·쓰러지는 중에는 숨김) */
export function bossBarShown(world) {
  const b = world?.boss;
  return !!(b && world.bossActive && !b.dead && !(b.dying > 0) && !world.cutscene);
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
export function modelView(cssW, cssH, inset = ZERO, safeArea = 'fit') {
  const fit = safeArea !== 'full';
  const ax = fit ? inset.l : 0, ay = fit ? inset.t : 0;
  const aw = fit ? cssW - inset.l - inset.r : cssW, ah = fit ? cssH - inset.t - inset.b : cssH;
  const vw = Math.round(clamp((VIEW_H * aw) / ah, 960, 1280));
  const s = Math.min(aw / vw, ah / VIEW_H);
  const w = Math.floor(vw * s), h = Math.floor(VIEW_H * s);
  const spare = ah - h;
  const canvas = { x: ax + (aw - w) / 2, y: spare >= 120 ? ay : ay + spare / 2, w, h };
  const cs = h / VIEW_H;
  const safe = fit ? ZERO : { l: inset.l / cs, r: inset.r / cs, t: inset.t / cs, b: inset.b / cs };
  return { vw, cs, canvas, cssW, cssH, inset, safe };
}

/**
 * 기본 터치 배치를 논리 px 사각형으로 (touchpad.occupiedRects() 와 같은 모양, 각 사각형에 id).
 * v = { vw, cssW, cssH, canvas:{x,y,w,h} (CSS px), inset:{l,r,t,b} (CSS px), touchScale, leftHanded, companions = true }
 * Ⅱ/가방 두 버튼(44 CSS px × 크기 등급)은 안전 영역 위쪽 가운데 ±50 CSS px.
 */
export function modelPadRects(v) {
  const k = padSizeK(v.cssH, v.touchScale);
  const ins = v.inset ?? ZERO;
  const csx = v.canvas.w / v.vw, csy = v.canvas.h / VIEW_H;
  const out = [];
  const add = (id, cx, cy, d) => out.push({ id, x: (cx - d / 2 - v.canvas.x) / csx, y: (cy - d / 2 - v.canvas.y) / csy, w: d / csx, h: d / csy });
  for (const id in PAD_LAYOUT) {
    if (v.companions === false && (id === 'mount' || id === 'guard')) continue;
    const [right, bottom, d] = PAD_LAYOUT[id];
    add(id, v.leftHanded ? ins.l + right * k : v.cssW - ins.r - right * k, v.cssH - ins.b - bottom * k, d * k);
  }
  const mid = ins.l + (v.cssW - ins.l - ins.r) / 2, S = 44 * k, top = ins.t + 6;
  add('pause', mid - 6 - S / 2, top + S / 2, S);
  add('bag', mid + 6 + S / 2, top + S / 2, S);
  return out;
}

// 실제 화면에 맞춘 모형 (창 크기·배율·안전 영역·터치 설정이 바뀔 때만 다시 잰다; 매 프레임 할당 없음)
const LV_N = 12;
const liveVals = new Array(LV_N).fill(undefined);
let liveOk = false, liveRects = NO_PAD;
function liveModelPad() {
  const g = game, cv = g?.canvas;
  if (!cv || typeof window === 'undefined') return NO_PAD;
  const s = g.safe ?? ZERO, st = g.settings ?? ZERO, v = liveVals;
  const iw = window.innerWidth, ih = window.innerHeight;
  if (liveOk && v[0] === iw && v[1] === ih && v[2] === g.viewW && v[3] === g.scale && v[4] === g.dpr && v[5] === s.l && v[6] === s.r
    && v[7] === s.t && v[8] === s.b && v[9] === st.touchScale && v[10] === st.touchLeftHanded && v[11] === st.safeArea) return liveRects;
  v[0] = iw; v[1] = ih; v[2] = g.viewW; v[3] = g.scale; v[4] = g.dpr; v[5] = s.l; v[6] = s.r; v[7] = s.t; v[8] = s.b;
  v[9] = st.touchScale; v[10] = st.touchLeftHanded; v[11] = st.safeArea;
  const r = cv.getBoundingClientRect();
  liveOk = !!(r.width && r.height); // 캔버스가 잠깐 숨겨져 크기가 0 이면 기억하지 않고 다음 호출에 다시 잰다
  if (!liveOk) return (liveRects = NO_PAD);
  const cs = r.height / VIEW_H;
  liveRects = modelPadRects({
    vw: g.viewW, cssW: window.innerWidth, cssH: window.innerHeight,
    canvas: { x: r.left, y: r.top, w: r.width, h: r.height },
    inset: { l: (s.l || 0) * cs, r: (s.r || 0) * cs, t: (s.t || 0) * cs, b: (s.b || 0) * cs },
    touchScale: st.touchScale, leftHanded: !!st.touchLeftHanded,
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

function build(vw, vh, T, S, pad, bossOn, nM) {
  const l = S.l || 0, rr = S.r || 0, t = S.t || 0, b = S.b || 0;
  const right = vw - rr;
  const L = { vw, vh, touch: T, safe: S, pad };
  // 왼쪽 위 묶음 (초상화·체력·하트·스킬·필살·각성·준비 문구·동료)
  L.portrait = R(14 + l, 12 + t, 66, 66);
  L.vitals = R(90 + l, 12 + t, 230, 50);
  L.hearts = R(90 + l, 64 + t, 260, 26);
  L.skills = R(14 + l, 92 + t, 88, 62);
  L.ult = R(106 + l, 96 + t, 120, 28);
  L.awGauge = R(106 + l, 126 + t, 120, 20);
  L.ready = R(106 + l, 148 + t, 130, 22);
  L.companions = R(244 + l, 92 + t, 128, 68);
  // 동료 위젯 그리기 칸: 원점을 바깥 고리 폭만큼 안쪽으로, 크기는 남는 너비에 맞춘 배율(≈ 0.91)로 → 잉크 x 244–372, y 92–155
  const cmpK = (L.companions.w - CMP_INK.l - CMP_INK.r) / CMP_W;
  L.companionsDraw = R(L.companions.x + CMP_INK.l, L.companions.y + CMP_INK.t, CMP_W * cmpK, CMP_H * cmpK);
  // 오른쪽 위 점수 (고정 영역: 패드가 여기까지 올라오면 패드 배치(PLAT-TOUCH)가 크기를 줄여야 한다)
  L.score = R(right - 164, 10 + t, 150, T ? 70 : 62);

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
  let combo = shrinkBottom(R(right - 320, 90 + t, 306, 0), pad, 200 + t);
  if (combo.h < 40) {
    const alt = R(14 + l, 236 + t, 300, T ? Math.min(104, TOUCH_FLOOR - 236 - t) : 104);
    if (alt.h >= 40 && !hitsAny(alt, pad)) combo = alt;
  }
  L.combo = combo;

  // 동료 스킬 카드 줄 (왼손 모드로 왼쪽 아래에 패드가 있으면 오른쪽 콤보 열 아래로 옮긴다)
  let lane = R(14 + l, 176 + t, 300, 52);
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

  // 가운데 빈 칸 (토스트, 위쪽 보스 칸)
  const gapL = 380 + l, gapR = vw - 328 - rr;
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
  const tsl = clipSpan(gapL, gapR, bty, 36, pad, sides);
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

export function hudLayout(world, vw, vh, pad, opts) {
  vw = vw ?? game.viewW; vh = vh ?? game.viewH ?? VIEW_H;
  const T = !!(opts?.touch ?? hudTouch());
  const S = opts?.safe ?? hudSafe(world?.game ?? game);
  if (!Array.isArray(pad)) pad = hudPadRects(T);
  const bossOn = !!(opts?.boss ?? bossBarShown(world));
  const gm = world?.gimmick?.meterRows;
  const nM = clamp(Math.round(Number(opts?.meters ?? (Number.isFinite(gm) ? gm : 3))) || 0, 0, 3);
  const a = memoArgs;
  if (memo && a[0] === vw && a[1] === vh && a[2] === T && a[3] === (S.l || 0) && a[4] === (S.r || 0) && a[5] === (S.t || 0) && a[6] === (S.b || 0)
    && a[7] === bossOn && a[8] === nM && samePad(memoPad, pad)) return memo;
  memo = build(vw, vh, T, S, cleanPad(pad), bossOn, nM);
  a.length = 0; a.push(vw, vh, T, S.l || 0, S.r || 0, S.t || 0, S.b || 0, bossOn, nM);
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
  for (let i = 0; i < meters; i++) persistent.push(['meter' + i, L.meter(i)]);
  if (boss) persistent.push(['boss', L.bossBar]);
  const tl = [];
  for (let i = 0; i < toasts; i++) { const q = L.toast(i); tl.push(['toast' + i, R(q.l, q.top, q.w, q.h)]); }
  return { persistent, toasts: tl, transient: L.transient, pad: L.pad };
}
