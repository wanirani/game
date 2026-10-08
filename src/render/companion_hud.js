// 동료 HUD — owner: CMP-UI (companions §7.1, §7.5; MASTER_PLAN §1.8 · 요청 24 HUD-LAYOUT · 요청 104 CMP-SYS)
//
//  drawCompanionHUD(ctx, world, o) → 탭 판정 사각형 배열 [{x,y,w,h, act:'mount'|'guard', slot?}] | null
//      o = { x, y, touch, rect: L.companionsDraw, lane: L.callouts (300×52 카드 줄), layout: L }
//        글자 하한 (터치, platform §6.2): layout.textMin (논리 px; 11 CSS px) — 위젯은 배율 k 로 줄여 그리므로 위젯 좌표에서는
//        ceil(textMin / k) 이상으로 쓴다 (휴대폰 배치는 k = 1). 터치에서는 수호신마다 붙던 AUTO 알약(9 px) 대신 '수호' 라벨 옆에 AUTO 를 한 번 쓴다
//        rect 는 그리기 상자: hud.js 가 L.companions (x 244–372, y 92–160) 를 hud_layout.js 의 CMP_INK {l:8, t:8, r:4} 만큼 안으로
//        줄여 넘긴다 (116×61.6 at (252,100) → 위젯 배율 ≈0.906). 탈것 위젯의 받침 원판(r+3.5) · 탑승 금빛 고리 · 비행형 스태미나 호(r+7)
//        · 수호신 받침 원판(r+3)은 이 상자 밖으로 왼쪽·위 최대 8px, 오른쪽 4px 번진다 — 그래도 L.companions 안이다 (MASTER_PLAN §1.8).
//        이 파일이 잉크를 스스로 o.rect 안에 가두도록 바뀌면 같은 변경에서 CMP_INK 를 {l:0,t:0,r:0} 으로 (두 번 줄지 않게).
//      hud.js 가 돌려받은 배열을 world.companions.hudRects 에 둔다 (CompanionSystem.handleTaps 가 터치 대체 경로로 쓴다).
//      배열·사각형은 모듈이 재사용한다 (프레임마다 할당 없음) — 다음 그리기까지만 유효.
//      터치(o.touch)면 사각형은 손가락 판정 크기(44 CSS px, 이웃과는 간격 가운데까지)로 넓힌 것이고 ui.taps 에도 같은 영역을 올린다.
//   · 탈것 위젯 (40 px 원): 초상화 크롭(iconFocus) · 바깥 고리 = 탈것 HP (#e8a040, 30 % 미만 빨강) · 재소환 대기 = 회색 막 + 초 ·
//     탑승 중 = 금빛 고리 · 비행형(stamina) = 바깥 파란 호 · noMount 보스전 = 막 + 빗금. 라벨: 키보드 [R] · 패드 L3 · 터치 탑승/하차
//   · 수호신 위젯 (38 px 원 × 1–2): 초상화 크롭 · 시계 방향 재사용 대기 부채꼴 + 초 · 준비되면 금빛 맥동(준비 순간 번쩍) ·
//     자동 스킬이 켜져 있으면 AUTO 알약. 라벨: [G] · R3 · 수호
//   · 장착한 동료가 없거나 마을이면 위젯을 그리지 않는다 (null)
//   · 스킬 카드 줄 (o.lane): world.companions.callouts 를 한 장씩 — 0.18초 미끄러져 들어와 1.2초 머물고 0.2초 빠진다.
//     뒤에 카드가 기다리면 머무는 시간을 줄인다. 카드는 한 번 구운 비트맵 (callout 객체에 붙여 둔다; 시스템이 4초 뒤 버린다).
//     줄이 화면 오른쪽 절반이면(왼손 패드 배치) 오른쪽에서 들어온다.
//  drawCompanionIcon(ctx, id, x, y, r, { locked, ring, alpha }) — 원형 아이콘 (초상화 크롭 캐시 → 없으면 색 원판 + 이름 첫 글자 +
//      render/mounts·guardians 의 drawMountIcon/drawGuardianIcon). locked = 검은 원판 + '?'. 메뉴 동료 탭·합류 연출도 쓴다.
//  portraitCrop(id) → { img, sx, sy, s } | null   초상화 정사각 크롭 영역 (로드 전·실패면 null)
//
// 성능 (MASTER_PLAN §5.2, R12): 초상화 크롭·빛 번짐·카드는 모두 캐시 비트맵. 매 프레임은 drawImage 몇 번 + 호(arc) 몇 개 + 초 글자.
// 주의 (순환 import): 모듈 최상위에서 import 값에 접근하지 않는다. 탈것·수호신 런타임(mount.js 등)은 여기서 import 하지 않는다.
import { text, FONT, font, fontEpoch, taps } from '../core/ui.js';
import { assets } from '../core/assets.js';
import { TAU, clamp, rgba, shade } from '../core/math.js';
import { drawGlyph, glyphWidth, promptMode } from '../core/prompts.js';
import { companionDef } from '../data/companions.js';
import * as MDRAW from './mounts.js';
import * as GDRAW from './guardians.js';

const HALF_PI = Math.PI / 2;
const MOUNT_R = 20, GUARD_R = 19;           // 지름 40 / 38 (companions §7.1)
const GUARD_DX = [46, 90];                   // 수호신 위젯 왼쪽 끝 (탈것 위젯 기준)
const BASE_W = 128, BASE_H = 68;             // L.companions 기본 크기 (o.rect 가 이보다 작으면 위젯을 그만큼 줄여 그린다)
const HP_COL = '#e8a040', HP_LOW = '#ff4a3a', STAM_COL = '#7ec8ff', GOLD = '#ffd070';
const CARD_IN = 0.18, CARD_HOLD = 1.2, CARD_OUT = 0.2, CARD_CUT = 0.55;

// ───────────────────────── 공용 캐시 ─────────────────────────
/** 지금 ctx 변환의 픽셀 배율 (논리 px → 캔버스 px) */
function pxK(ctx) {
  try { const m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; } catch { return 1; }
}
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}
const GLOWS = new Map();
/** 가산 합성용 둥근 빛 스프라이트 (색마다 한 장) */
function glowSprite(color) {
  let c = GLOWS.get(color);
  if (c) return c;
  c = mkCanvas(64, 64);
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, rgba(color, 0.9)); r.addColorStop(0.35, rgba(color, 0.42)); r.addColorStop(0.7, rgba(color, 0.1)); r.addColorStop(1, rgba(color, 0));
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  GLOWS.set(color, c);
  return c;
}
function glowAt(ctx, x, y, r, color, a) {
  if (!(a > 0.01)) return;
  const s = glowSprite(color), ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}

/** 초상화 정사각 크롭 영역 (iconFocus: 중심 x·w, y·h, 한 변 s·w). 초상화가 아직 없으면 null */
export function portraitCrop(id) {
  const d = companionDef(id);
  if (!d?.portrait) return null;
  const img = assets.get(d.portrait);
  if (!img || !(img.width > 8) || !(img.height > 8)) return null;   // 로드 전 · 메모리 정리로 1×1 이 된 이미지
  const f = d.iconFocus ?? { x: 0.5, y: 0.35, s: 0.6 };
  const s = clamp(f.s, 0.05, 1) * img.width;
  const sx = clamp(f.x * img.width - s / 2, 0, img.width - s), sy = clamp(f.y * img.height - s / 2, 0, Math.max(0, img.height - s));
  return { img, sx, sy, s };
}

const ICONS = new Map();   // `${id}|${px}` → 원형으로 자른 초상화 캔버스
const ICON_MAX = 48;
/** 원형 초상화 크롭 비트맵 (픽셀 크기 px). 초상화가 없으면 null (캐시하지 않음 → 로드되면 바로 바뀐다) */
function iconCanvas(id, px) {
  const key = id + '|' + px;
  let c = ICONS.get(key);
  if (c) return c;
  const cr = portraitCrop(id);
  if (!cr) return null;
  if (ICONS.size >= ICON_MAX) { const k0 = ICONS.keys().next().value; const old = ICONS.get(k0); if (old) old.width = old.height = 1; ICONS.delete(k0); }
  c = mkCanvas(px, px);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.beginPath(); g.arc(px / 2, px / 2, px / 2, 0, TAU); g.closePath(); g.clip();
  g.drawImage(cr.img, cr.sx, cr.sy, cr.s, cr.s, 0, 0, px, px);
  // 아래쪽을 살짝 어둡게 (고리·숫자가 잘 보이게)
  const vg = g.createRadialGradient(px / 2, px * 0.42, px * 0.2, px / 2, px / 2, px * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = vg; g.fillRect(0, 0, px, px);
  ICONS.set(key, c);
  return c;
}

/**
 * 동료 원형 아이콘 (중심 x, y · 반지름 r).
 * opts: locked(검은 원판 + '?') · ring(테두리 색 | false; 기본 동료 색) · alpha
 */
export function drawCompanionIcon(ctx, id, x, y, r, { locked = false, ring, alpha = 1 } = {}) {
  const d = companionDef(id);
  if (!(r > 0)) return;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha *= clamp(alpha, 0, 1);
  const col = d?.color ?? '#c8a060';
  if (locked) {
    const g = ctx.createRadialGradient(x, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, '#231823'); g.addColorStop(1, '#07040a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    text(ctx, '?', x, y + r * 0.38, { size: Math.max(8, Math.round(r * 1.05)), weight: 900, family: FONT.title, color: '#6e5c4a', align: 'center', ow: 0 });
  } else {
    const px = Math.max(8, Math.min(512, Math.ceil(r * 2 * pxK(ctx))));
    const c = d ? iconCanvas(d.id, px) : null;
    if (c) ctx.drawImage(c, 0, 0, c.width, c.height, x - r, y - r, r * 2, r * 2);
    else {
      // 초상화가 아직 없다: 색 원판 + 이름 첫 글자 (+ 아트 패키지의 절차 머리 아이콘이 있으면 그 위에)
      const g = ctx.createRadialGradient(x, y - r * 0.35, 1, x, y, r);
      g.addColorStop(0, shade(col.startsWith('#') ? col : '#c8a060', -0.1)); g.addColorStop(1, shade(col.startsWith('#') ? col : '#c8a060', -0.78));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      text(ctx, d?.name?.[0] ?? '?', x, y + r * 0.36, { size: Math.max(8, Math.round(r * 1.0)), weight: 900, family: FONT.title, color: '#fff4d8', align: 'center', ow: Math.max(1, r * 0.12) });
      try {
        if (d?.kind === 'mount') MDRAW.drawMountIcon?.(ctx, d.id, x, y, r);
        else if (d) GDRAW.drawGuardianIcon?.(ctx, d.id, x, y, r);
      } catch { /* 아이콘 그림 실패는 무시 */ }
    }
  }
  if (ring !== false) {
    ctx.strokeStyle = locked ? 'rgba(110,85,48,0.75)' : (ring || col);
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

// ───────────────────────── 위젯 ─────────────────────────
const RECTS = [];          // 돌려주는 배열 (재사용)
const R_POOL = [{}, {}, {}];
const READY = new Map();   // 수호신 id → { ready, at } (준비 순간 번쩍)
function setRect(i, x, y, w, h, act, slot) {
  const r = R_POOL[i];
  r.x = x; r.y = y; r.w = w; r.h = h; r.act = act;
  if (slot === undefined) delete r.slot; else r.slot = slot;
  RECTS.push(r);
  return r;
}
/** 시계 방향 어두운 부채꼴 (남은 비율 frac, 12시 방향에서 시작) */
function sweep(ctx, x, y, r, frac, color = 'rgba(0,0,0,0.62)') {
  if (!(frac > 0.001)) return;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.arc(x, y, r, -HALF_PI, -HALF_PI + TAU * clamp(frac, 0, 1));
  ctx.closePath(); ctx.fill();
}
/** 호 (12시 방향에서 시계 방향으로 frac 만큼) */
function arcRing(ctx, x, y, r, frac, color, lw) {
  if (!(frac > 0.001)) return;
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y, r, -HALF_PI, -HALF_PI + TAU * clamp(frac, 0, 1)); ctx.stroke();
  ctx.lineCap = 'butt';
}
let FW = 0;   // 이번 그리기의 위젯 좌표 글자 하한 (drawCompanionHUD 가 정한다; 0 = 없음)
function secText(ctx, s, x, y, T) {
  const n = s >= 10 ? Math.ceil(s) : s >= 1 ? Math.ceil(s) : Math.ceil(s * 10) / 10;
  text(ctx, String(n), x, y, { size: Math.max(T ? 16 : 14, FW), weight: 800, family: FONT.num, color: '#ffffff', align: 'center', ow: 3, baseline: 'middle' });
}
/**
 * 위젯 아래 라벨: 키보드·패드 = 기기 글리프, 터치 = 글자. tag = 라벨 뒤에 금색으로 붙이는 꼬리 (터치의 AUTO) — 둘을 함께 가운데 맞추고
 * [lo, hi] (위젯 좌표) 안에 넣는다 (수호신 1마리면 왼쪽 탈것 라벨과 겹치지 않게 왼쪽 끝을 수호신 위젯에 맞춘다)
 */
function label(ctx, action, touchStr, cx, y, T, tag = null, lo = -Infinity, hi = Infinity) {
  const mode = promptMode();
  const size = Math.max(T ? 13 : 11, FW);
  let w = 0, glyph = false;
  if (mode !== 'touch') { w = glyphWidth(action, T ? 16 : 14); glyph = w > 0; }
  if (!glyph && !tag) { text(ctx, touchStr, cx, y + size, { size, weight: 800, color: '#efe4cf', align: 'center', ow: 3 }); return; }
  if (!glyph) { ctx.font = font(size, 800, FONT.body); w = ctx.measureText(touchStr).width; }
  let tw = 0;
  if (tag) { ctx.font = font(size, 800, FONT.body); tw = ctx.measureText(tag).width; }
  const gap = tag ? Math.round(size * 0.3) : 0, total = w + gap + tw;
  const x0 = Math.max(lo, Math.min(cx - total / 2, hi - total));
  if (glyph) drawGlyph(ctx, action, x0, y, T ? 16 : 14);
  else text(ctx, touchStr, x0, y + size, { size, weight: 800, color: '#efe4cf', ow: 3 });
  if (tag) text(ctx, tag, x0 + w + gap, y + size, { size, weight: 800, color: GOLD, ow: 3 });
}

function drawMountWidget(ctx, m, cx, cy, t, T) {
  const r = MOUNT_R;
  const hpF = m.maxHp > 0 ? clamp(m.hp / m.maxHp, 0, 1) : 1;
  const recall = m.state === 'recall';
  // 바탕 + 탑승 중 금빛 번짐
  if (m.riding) glowAt(ctx, cx, cy, r * 1.9, GOLD, 0.5 + 0.15 * Math.sin(t * 4));
  ctx.fillStyle = 'rgba(8,4,10,0.82)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 3.5, 0, TAU); ctx.fill();
  drawCompanionIcon(ctx, m.id, cx, cy, r - 2.5, { ring: false });
  // 재소환 대기 · 소환 금지: 회색 막
  if (recall || m.blocked) {
    ctx.fillStyle = 'rgba(40,36,44,0.62)';
    ctx.beginPath(); ctx.arc(cx, cy, r - 2.5, 0, TAU); ctx.fill();
  }
  if (m.cd > 0 && m.cdMax > 0) sweep(ctx, cx, cy, r - 2.5, m.cd / m.cdMax);
  if (m.blocked && !recall) {
    ctx.strokeStyle = 'rgba(255,90,80,0.85)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.55, cy + r * 0.55); ctx.lineTo(cx + r * 0.55, cy - r * 0.55); ctx.stroke();
  }
  // HP 고리 (바탕 고리 위에)
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  arcRing(ctx, cx, cy, r, recall ? 0 : hpF, hpF < 0.3 ? HP_LOW : HP_COL, 3);
  // 비행형 기력 (바깥 파란 호)
  if (m.stamina != null && m.staminaMax > 0 && (m.riding || m.stamina < m.staminaMax)) {
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r + 4.5, 0, TAU); ctx.stroke();
    arcRing(ctx, cx, cy, r + 4.5, m.stamina / m.staminaMax, STAM_COL, 2);
  }
  // 탑승 중 금빛 고리
  if (m.riding) {
    ctx.strokeStyle = rgba(GOLD, 0.7 + 0.3 * Math.sin(t * 4)); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy, r + (m.stamina != null ? 7 : 3), 0, TAU); ctx.stroke();
  }
  if (recall && m.cd > 0) secText(ctx, m.cd, cx, cy + 1, T);
}

function drawGuardWidget(ctx, g, cx, cy, t, T, auto) {
  const r = GUARD_R;
  const ready = !!g.ready || !(g.cd > 0);
  let st = READY.get(g.id);
  if (!st) { st = { ready, at: -9 }; READY.set(g.id, st); }
  if (ready && !st.ready) st.at = t;
  st.ready = ready;
  if (ready) glowAt(ctx, cx, cy, r * 1.8, g.color?.startsWith('#') ? g.color : GOLD, 0.28 + 0.14 * Math.sin(t * 5));
  ctx.fillStyle = 'rgba(8,4,10,0.82)';
  ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, TAU); ctx.fill();
  drawCompanionIcon(ctx, g.id, cx, cy, r - 2, { ring: false });
  if (!ready && g.cdMax > 0) sweep(ctx, cx, cy, r - 2, g.cd / g.cdMax);
  // 테두리: 준비 = 금빛 맥동, 대기 = 동료 색 흐리게
  if (ready) {
    ctx.strokeStyle = rgba(GOLD, 0.65 + 0.35 * Math.sin(t * 5)); ctx.lineWidth = 2.4;
  } else {
    ctx.strokeStyle = g.color?.startsWith('#') ? rgba(g.color, 0.45) : 'rgba(200,160,90,0.45)'; ctx.lineWidth = 1.6;
  }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  // 준비 순간 번쩍 (0.5초 퍼지는 고리)
  const k = (t - st.at) / 0.5;
  if (k >= 0 && k < 1) {
    ctx.strokeStyle = rgba(GOLD, 1 - k); ctx.lineWidth = 3 * (1 - k) + 0.5;
    ctx.beginPath(); ctx.arc(cx, cy, r + 2 + 10 * k, 0, TAU); ctx.stroke();
    glowAt(ctx, cx, cy, r * (1.6 + k), GOLD, 0.7 * (1 - k));
  }
  if (!ready && g.cd > 0) secText(ctx, g.cd, cx, cy + 1, T);
  if (auto && !T) {   // 터치는 '수호 AUTO' 라벨로 (알약 글자가 하한보다 작다)
    const s = T ? 9 : 8, w = T ? 28 : 24, h = T ? 11 : 10, px = cx - w / 2, py = cy + r - h + 3;
    ctx.fillStyle = 'rgba(20,10,4,0.9)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, w, h, h / 2); else ctx.rect(px, py, w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,208,112,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = font(s, 800, FONT.body); ctx.fillStyle = GOLD; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('AUTO', cx, py + h / 2 + 0.5);
    ctx.textBaseline = 'alphabetic';
  }
}

/**
 * 동료 위젯 + 스킬 카드 줄. 반환: 탭 사각형 배열 (위젯을 그렸을 때) | null
 */
export function drawCompanionHUD(ctx, world, o = {}) {
  const cs = world?.companions;
  if (!cs || world.hudHidden) return null;
  const T = !!o.touch;
  const t = world.time ?? 0;
  let info = null;
  try { info = cs.hudInfo?.() ?? null; } catch { info = null; }
  // 스킬 카드 줄은 위젯과 따로 (수호신을 막 해제해도 이미 뜬 카드는 끝까지)
  if (cs.callouts?.length) {
    try { drawCallouts(ctx, world, cs.callouts, o.lane ?? { x: 14, y: 176, w: 300, h: 52 }, T, T ? Number(o.layout?.textMin) || 0 : 0); } catch (e) { warnOnce('callout', e); }
  }
  if (!info || info.town) return null;
  const m = info.mount, gs = info.guards ?? [];
  if (!m && !gs.length) return null;
  const R0 = o.rect ?? { x: o.x ?? 244, y: o.y ?? 92, w: BASE_W, h: BASE_H };
  const k = Math.min(1, (R0.w || BASE_W) / BASE_W, (R0.h || BASE_H) / BASE_H);
  const x = R0.x, y = R0.y;
  const tmin = T ? Number(o.layout?.textMin) || 0 : 0;
  FW = tmin > 0 ? Math.ceil(tmin / k - 1e-6) : 0;
  RECTS.length = 0;
  ctx.save();
  try {
    ctx.translate(x, y);
    if (k < 1) ctx.scale(k, k);
    const labelY = 44;
    if (m) {
      drawMountWidget(ctx, m, MOUNT_R, MOUNT_R, t, T);
      label(ctx, 'mount', m.riding ? '하차' : '탑승', MOUNT_R, labelY, T);
      setRect(0, x, y, 40 * k, (labelY + 16) * k, 'mount');
    }
    const n = Math.min(2, gs.length);
    for (let i = 0; i < n; i++) {
      const g = gs[i];
      const slot = Number.isFinite(g.slot) ? g.slot : i;
      const gx = GUARD_DX[Math.min(1, i)];
      drawGuardWidget(ctx, g, gx + GUARD_R, MOUNT_R, t, T, !!(g.auto ?? info.auto));
      setRect(1 + i, x + gx * k, y, GUARD_R * 2 * k, (labelY + 16) * k, 'guard', slot);
    }
    if (n) {
      const lx = n > 1 ? (GUARD_DX[0] + GUARD_DX[1] + GUARD_R * 2) / 2 : GUARD_DX[0] + GUARD_R;
      let auto = false;
      if (T) for (let i = 0; i < n; i++) if (gs[i].auto ?? info.auto) { auto = true; break; }
      label(ctx, 'guard', '수호', lx, labelY, T, auto ? 'AUTO' : null, GUARD_DX[0] - 2, BASE_W + 2);
    }
  } catch (e) { warnOnce('widget', e); }
  ctx.restore();
  FW = 0;
  // 터치: 공용 탭 등록부에도 올린다 — 가상 패드가 위젯 위(왼쪽 45 % 떠다니는 스틱 자리)에서 스틱을 만들지 않고
  // 탭을 캔버스로 넘기도록 (touchpad onCanvasUi). 주인 = 이 월드의 장면 (위에 다른 장면이 쌓이면 그 장면 것만 판정된다)
  // 돌려주는 판정 사각형은 등록부와 같은 여유(손가락 44 CSS px)만큼 넓힌 것 — 패드가 캔버스로 넘기는 영역(위젯 + 여유)과
  // CompanionSystem.handleTaps 가 보는 영역(돌려주는 배열)이 같아야 위젯 옆을 누른 탭이 스틱도 동료도 아닌 채로 사라지지 않는다
  if (T && RECTS.length) {
    const m = touchSlop(RECTS, world);
    try {
      const owner = sceneOf(world);
      for (const r of RECTS) taps.add(r.act === 'mount' ? 'cmp.mount' : 'cmp.guard' + (r.slot ?? 0), r, { owner, kind: 'icon', slop: m, src: 'companion_hud' });
    } catch (e) { warnOnce('taps', e); }
    touchRects(RECTS, m);   // 등록부는 값을 복사해 두므로 등록한 뒤에 넓힌다
  }
  return RECTS.length ? RECTS : null;
}
const TOUCH_MIN_CSS = 44, TOUCH_SLOP = 4, TOUCH_SLOP_MAX = 28;   // core/ui.js 탭 등록부(tapSlop)와 같은 규칙 (icon 44 CSS px, 여유 상한 28)
/**
 * 터치 여유 (논리 px): 등록부 규칙(max(4, 짧은 변이 44 CSS px 에 모자란 만큼의 절반), 상한 28)을 위젯마다 계산해 가장 큰 값 하나.
 * 모든 위젯에 같은 여유를 주면 등록부의 '여유 안에서 가장 가까운 영역' 판정이 사이 간격의 가운데에서 갈린다 → 아래 사각형과 똑같다
 */
function touchSlop(list, world) {
  const css = world?.game?.cssScale > 0 ? world.game.cssScale : 1;
  const need = TOUCH_MIN_CSS / css;
  let m = TOUCH_SLOP;
  for (const r of list) m = Math.max(m, (need - Math.min(r.w, r.h)) / 2);
  return clamp(m, 0, TOUCH_SLOP_MAX);
}
/**
 * 터치 판정 사각형: 위젯마다 여유 m 만큼 사방을 넓히되, 이웃 위젯과 맞닿는 쪽은 사이 간격의 가운데에서 멈춘다
 * (겹치지 않아 handleTaps 의 '첫 사각형' 판정과 등록부 판정이 같은 위젯을 고른다). list 는 x 순서 (탈것 → 수호신 1 → 2)
 */
function touchRects(list, m) {
  const n = list.length;
  let prevRight = -Infinity;
  for (let i = 0; i < n; i++) {
    const r = list[i], nx = i + 1 < n ? list[i + 1].x : Infinity;
    const x0 = r.x, x1 = r.x + r.w;
    const L = Math.max(x0 - m, prevRight === -Infinity ? -Infinity : (prevRight + x0) / 2);
    const R = Math.min(x1 + m, nx === Infinity ? Infinity : (x1 + nx) / 2 - 0.01);   // 정확히 가운데는 오른쪽 위젯 (등록부도 나중에 올린 영역이 이긴다)
    prevRight = x1;
    r.x = L; r.w = R - L; r.y -= m; r.h += m * 2;
  }
}
/** 이 월드를 가진 장면 (스테이지). 없으면 null */
function sceneOf(world) {
  const S = world?.game?.scenes;
  if (!Array.isArray(S)) return null;
  for (let i = S.length - 1; i >= 0; i--) if (S[i]?.world === world) return S[i];
  return null;
}

// ───────────────────────── 스킬 카드 줄 ─────────────────────────
// 카드 비트맵은 몇 장만 돌려 쓴다 (카드마다 새 캔버스를 만들면 긴 판에서 iOS 캔버스 메모리가 쌓인다).
// 칸의 주인이 대기열(list, 최대 2)에 없으면 그 칸을 넘겨받는다 → 많아야 list 길이 + 1 장
const CARD_CVS = [];
function cardSlot(c, list) {
  if (c._cv) return c._cv;
  let s = null;
  for (const q of CARD_CVS) if (!q.owner || !list.includes(q.owner)) { s = q; break; }
  if (!s) { s = { cv: mkCanvas(1, 1), owner: null }; CARD_CVS.push(s); }
  if (s.owner && s.owner !== c) { s.owner._cv = null; s.owner._cvKey = null; }
  s.owner = c;
  c._cv = s.cv; c._cvKey = null;
  return s.cv;
}
function cardCanvas(c, w, h, k, T, list, F = 0) {
  const d = companionDef(c.id);
  const port = !!portraitCrop(c.id);
  const key = `${w}|${h}|${k}|${T ? 1 : 0}|${port ? 1 : 0}|${fontEpoch}|${F}`;
  if (c._cv && c._cvKey === key) return c._cv;
  const pw = Math.max(1, Math.ceil(w * k)), ph = Math.max(1, Math.ceil(h * k));
  const cv = cardSlot(c, list);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pw, ph);
  g.setTransform(k, 0, 0, k, 0, 0);
  const col = (c.color || d?.color || '#e8c872');
  const colHex = col.startsWith('#') ? col : '#e8c872';
  // 바탕: 왼쪽이 진하고 오른쪽 끝으로 사라지는 띠
  const bg = g.createLinearGradient(0, 0, w, 0);
  bg.addColorStop(0, 'rgba(22,6,14,0.94)'); bg.addColorStop(0.72, 'rgba(18,6,14,0.86)'); bg.addColorStop(1, 'rgba(18,6,14,0)');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const tint = g.createLinearGradient(0, 0, w * 0.6, 0);
  tint.addColorStop(0, rgba(colHex, 0.28)); tint.addColorStop(1, rgba(colHex, 0));
  g.fillStyle = tint; g.fillRect(0, 0, w, h);
  const line = g.createLinearGradient(0, 0, w, 0);
  line.addColorStop(0, 'rgba(255,220,150,0.9)'); line.addColorStop(0.7, 'rgba(255,220,150,0.3)'); line.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = line; g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1);
  g.fillStyle = colHex; g.fillRect(0, 0, 3, h);
  // 초상화 44 px (둥근 사각)
  const ps = Math.min(44, h - 8), px = 8, py = (h - ps) / 2;
  g.save();
  g.beginPath();
  if (g.roundRect) g.roundRect(px, py, ps, ps, 6); else g.rect(px, py, ps, ps);
  g.clip();
  const cr = portraitCrop(c.id);
  if (cr) g.drawImage(cr.img, cr.sx, cr.sy, cr.s, cr.s, px, py, ps, ps);
  else {
    g.fillStyle = shade(colHex, -0.7); g.fillRect(px, py, ps, ps);
    text(g, d?.name?.[0] ?? '?', px + ps / 2, py + ps * 0.68, { size: Math.round(ps * 0.55), weight: 900, family: FONT.title, color: '#fff4d8', align: 'center', ow: 2 });
  }
  g.restore();
  g.strokeStyle = colHex; g.lineWidth = 1.5;
  g.beginPath();
  if (g.roundRect) g.roundRect(px, py, ps, ps, 6); else g.rect(px, py, ps, ps);
  g.stroke();
  // 꼬리표 (공명 / AUTO) 너비를 먼저 잰다 — 스킬 이름이 그 자리를 비워 둔다
  const tag = c.resonance ? '공명' : c.auto ? 'AUTO' : null;
  const ts = Math.max(T ? 10 : 9, F);
  let bw = 0;
  if (tag) { g.font = font(ts, 800, FONT.body); bw = g.measureText(tag).width + 12; }
  // 이름 · 스킬 이름 · 외침 (터치 글자 하한 F: 카드는 줄 칸에 1:1 로 붙는다)
  const tx = px + ps + 10, tw = w - tx - 10;
  const name = c.name || d?.name || '';
  const nameSize = Math.max(T ? 17 : 16, F);
  g.font = font(nameSize, 800, FONT.title);
  const nw = Math.min(g.measureText(name).width, tw * 0.5);
  text(g, name, tx, 21, { size: nameSize, weight: 800, family: FONT.title, color: colHex, ow: 3, maxWidth: tw * 0.5 });
  if (c.skill) text(g, '· ' + c.skill, tx + nw + 6, 21, { size: Math.max(T ? 15 : 14, F), weight: 800, family: FONT.title, color: '#ffe7a0', ow: 3, maxWidth: Math.max(20, tw - nw - 6 - (tag ? bw + 4 : 34)) });
  const ln = c.line ? String(c.line) : '';
  if (ln) {
    // 넘치면 먼저 글자를 11 px (터치는 하한 F) 까지 줄이고, 그래도 넘치면 말줄임
    const min = Math.max(11, F);
    let size = Math.max(T ? 14 : 13, F);
    g.font = font(size, 600, FONT.body);
    while (size > min && g.measureText(ln).width > tw) { size--; g.font = font(size, 600, FONT.body); }
    let s = ln;
    if (g.measureText(s).width > tw) { while (s.length > 1 && g.measureText(s + '…').width > tw) s = s.slice(0, -1); s += '…'; }
    text(g, s, tx, 42, { size, weight: 600, color: '#efe4cf', ow: 3 });
  }
  if (tag) {
    g.font = font(ts, 800, FONT.body);
    const bx = w - bw - 8, by = 5, bh = ts + 5;
    g.fillStyle = c.resonance ? 'rgba(140,16,40,0.92)' : 'rgba(30,18,10,0.9)';
    g.beginPath();
    if (g.roundRect) g.roundRect(bx, by, bw, bh, bh / 2); else g.rect(bx, by, bw, bh);
    g.fill();
    g.strokeStyle = c.resonance ? '#ff8a9a' : 'rgba(255,208,112,0.8)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = c.resonance ? '#ffe0e4' : GOLD; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(tag, bx + bw / 2, by + bh / 2 + 0.5); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  c._cv = cv; c._cvKey = key;
  return cv;
}

function drawCallouts(ctx, world, list, lane, T, F = 0) {
  if (!lane || !(lane.w > 40) || !(lane.h > 20)) return;
  // 맨 앞 카드 = 아직 끝나지 않은 첫 카드
  let head = null, next = null;
  for (const c of list) {
    if (!c || c._done) continue;
    if (!head) head = c; else { next = c; break; }
  }
  if (!head) return;
  const tNow = Number.isFinite(head.t) ? head.t : 0;
  // 시작 시각 (카드의 t 기준): 막 생긴 카드는 생긴 때부터, 늦게 처음 그려진 카드(HUD 가 숨어 있던 동안 생김)는 지금부터
  if (head._t0 === undefined) head._t0 = tNow < 0.5 ? 0 : tNow;
  let local = tNow - head._t0;
  let outAt = CARD_IN + CARD_HOLD;
  if (next) { if (head._cut === undefined) head._cut = Math.max(Math.min(local, CARD_IN + CARD_HOLD), CARD_IN + CARD_CUT); outAt = Math.min(outAt, head._cut); }
  if (local >= outAt + CARD_OUT) {
    head._done = true;
    if (!next) return;
    // 다음 카드는 앞 카드가 끝난 순간부터 (그리기 간격과 무관하게 같은 시간표)
    const over = local - (outAt + CARD_OUT);
    head = next;
    const t2 = Number.isFinite(head.t) ? head.t : 0;
    if (head._t0 === undefined) head._t0 = Math.max(0, t2 - over);
    local = t2 - head._t0; outAt = CARD_IN + CARD_HOLD;
  }
  const W = lane.w, H = Math.min(lane.h, 60);
  const k = Math.max(1, Math.min(4, pxK(ctx)));
  const cv = cardCanvas(head, W, H, Math.round(k * 4) / 4, T, list, F);
  // 들어옴 / 머묾 / 나감
  const rm = !!world?.game?.settings?.reduceMotion;
  let a = 1, dx = 0;
  const vw = world?.game?.viewW ?? 960;
  const dir = lane.x + lane.w / 2 > vw / 2 ? 1 : -1;
  if (local < CARD_IN) { const u = clamp(local / CARD_IN, 0, 1); a = u; dx = rm ? 0 : dir * 28 * (1 - u) * (1 - u); }
  else if (local > outAt) { const u = clamp((local - outAt) / CARD_OUT, 0, 1); a = 1 - u; dx = rm ? 0 : dir * 22 * u * u; }
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= a;
  const x = lane.x + dx, y = lane.y + (lane.h - H) / 2;
  ctx.drawImage(cv, 0, 0, cv.width, cv.height, x, y, W, H);
  // 들어오는 순간 금빛 번쩍
  if (local < 0.3) glowAt(ctx, x + 30, y + H / 2, 46, (head.color || GOLD).startsWith('#') ? head.color || GOLD : GOLD, 0.55 * (1 - local / 0.3));
  ctx.restore();
}

const WARNED = new Set();
function warnOnce(tag, e) {
  if (WARNED.has(tag)) return;
  WARNED.add(tag);
  try { console.warn('[companion_hud]', tag, e); } catch { /* 무시 */ }
}
