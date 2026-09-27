// 필살기·각성기 레이어 키트 — owner: FX-ULTKIT (feel.md §5.1, §5.2, §8; MASTER_PLAN §1.7 #13, §5.2)
//
// 공개 API (feel §5.1 서명 그대로. 모든 인자는 생략 가능하고, 함수는 예외를 밖으로 던지지 않는다)
//  ULTFX.begin(w, p, {color, accent, tier, dimCol, classId, name, awaken, letterbox, zoom, zoomHold, dur, maxDur}) → 연출 세션 | null
//      카메라 줌 펄스 1.12/1.16/1.20 (+2차 전직 기울기 0.8°) · 레터박스 —/28/40px · 방사 집중선 + 색보정(+2차 비네트)을 한 장으로 ·
//      속성 입자층 —/40/80(+뒤쪽 빛 알갱이 20) · 주인공 곁 기술 이름 22/28/34px (2차는 '직업명 · 기술명') · 빠르게 움직이면 잔상 자동.
//      화면 층은 world.overlays 에 올리고, 월드가 처음 갱신될 때(필살기 컷인 장면이 닫힌 뒤) 시작한다.
//      awaken(기본값: world.hudHidden) 이면 레터박스와 기술 이름은 각성 쪽(awaken.js·컷인)이 그리므로 건너뛴다.
//      end() 가 불리지 않아도 world.cutscene 이 풀리면 0.25초 뒤, 또는 maxDur(필살기 5초·각성 9초) 뒤 스스로 정리한다.
//  ULTFX.beat(w, x, y, {power 0..1, color, accent, ground, groundY, tier, shake}) → 충격파 고리 1/2개(+2차: 바닥 타원·먼지 6) · 섬광 · 불꽃 · 카메라 반동
//      2차 전직 직업 중 박자 장식이 있는 직업(폭풍의 소환사: 낙뢰, 헬파이어: 착탄 폭발)은 박자마다 장식이 붙는다.
//  ULTFX.final(w, x, y, {color, accent, tier, ground, classId, targets, noFlash, flashColor, shake, impact, impactFg, impactBg, flourish, silent}) →
//      번쩍임 0.6(game.flash 정책) + 고리 1/2/3 + 불씨 비 40(1차+) + 2차: 임팩트 프레임 2장(검정 + 흰 실루엣 → difference 반전; low 는 흰 번쩍임) ·
//      바닥 균열 · 직업 장식(24종, ULT_FLOURISH). 임팩트 프레임 동안에는 화면 번쩍임을 두 프레임 미뤘다가 다시 켠다(검정 화면이 씻기지 않게).
//  ULTFX.afterimage(w, p, tint, {life, gap, min, max, tier, alpha}) → 캐시 잔상 비트맵 1장 → true | false
//      단계별 동시 상한 0/3/5, 품질 상한 8/5/3, 0.045초 간격 제한. 영웅은 잔상을 만들 때 한 번만 그리고, 그 뒤로는 비트맵만 그린다.
//  ULTFX.end(w, p?, {quick}) → 줌·기울기·레터박스 복구, 화면 층 0.25초 페이드 후 제거
//  (추가) ULTFX.prepare(w, p?) 미리 굽기 · ULTFX.flourish(w, classId, x, y, o) 직업 장식만 · ULTFX.active(w) · ULTFX.tierOf(p) ·
//         ULTFX.accentOf(classId) · ULTFX.glow(color) 256px 빛 스프라이트 · ULTFX.sprite(name) 장식 스프라이트
//  ULT_TIERS[0|1|2] (= ULT_TIERS.T0/T1/T2) 단계 표 · ULT_FLOURISH[classId] {name, colors, sprites} · ULTFX_STATS (시험용 계수)
//
// 성능 (feel §8, MASTER_PLAN §5.2)
//  · 프레임마다 그라디언트를 만들지 않는다 (굽기 때만: ULTFX_STATS.gradients). 모든 빛·문양은 캐시 스프라이트.
//  · 캔버스는 풀에서 쓴다: 부팅 뒤 한가할 때, 스테이지 진입 뒤 한가할 때(prepare) 미리 만들고 굽는다 → 시전 중 새 캔버스 0 (ULTFX_STATS.castCanvases).
//  · 입자는 품질별 필살기 최대치(600/400/220, 각성 700/450/250) 안에서만 뿌린다 (다른 연출이 이미 뿌린 입자 수도 센다).
//  · 화면 전체 층: 집중선 + 색보정 + 비네트 = 1장 (low 에서는 없음, medium 은 마무리 순간 걷어낸다). 임팩트 프레임 1장.
//    difference 합성은 시전당 1프레임 (low 에서는 쓰지 않음). 실루엣은 월드 개체를 한 번만 다시 그린다.
//  · settings.flashFx 0 → 임팩트 프레임 없음, 0.5 → 약하게(반전 없음) · reduceMotion → 기울기·집중선 회전 끔 · quality 반영.
import { clamp, lerp, rand, TAU, ease, hexToRgb } from '../core/math.js';
import { game, TILE } from '../core/game.js';
import { bus } from '../core/events.js';
import { audio } from '../core/audio.js';
import { isSolidType } from '../core/physics.js';
import { Entity } from '../game/entity.js';
import { CLASSES } from '../data/classes.js';
import { CHARACTERS } from '../data/characters.js';
import * as AWD from '../data/awaken.js';   // 각성 색 (미리 굽기용; 이름공간 import — 내보내기가 바뀌어도 연결 오류 없음)
import * as HFX from './hitfx.js';
import * as UI from '../core/ui.js';
import { drawHero } from './hero.js';

const DEG = Math.PI / 180;
const OUT = 0.25;                    // 화면 층 퇴장 (초)
const Q = {
  high:   { peak: 600, awPeak: 700, ghosts: 8, sil: 0.5, layer: true, diff: true, rs: 1.25, decals: true },
  medium: { peak: 400, awPeak: 450, ghosts: 5, sil: 0.5, layer: true, diff: true, rs: 1, decals: true },
  low:    { peak: 220, awPeak: 250, ghosts: 3, sil: 0, layer: false, diff: false, rs: 0.75, decals: false },
};

// ═══════════════════════════ 단계 표 (feel §5.2) ═══════════════════════════
/** 필살기 연출 단계: 0 = 기본 직업, 1 = Lv10 전직, 2 = Lv25 전직. 피해량은 단계와 무관 (순수 연출) */
export const ULT_TIERS = {
  0: {
    tier: 0, zoom: 1.12, zin: 0.2, zhold: 0.2, zout: 0.3, roll: 0, letterbox: 0, lbSlide: 0.15,
    lines: { a: 0.25, spin: 0, accent: false }, grade: { src: 'ult', a: 0.12, vig: 0 },
    beat: { rings: 1, ground: false, dust: 0 }, ghosts: 0, element: { n: 0, back: 0 },
    final: { flash: 0.6, rings: 1, embers: 0, impact: false, crack: false, flourish: false, roll: 0, star: false },
    name: { size: 22, style: 'bone', drips: 0, prefix: false },
  },
  1: {
    tier: 1, zoom: 1.16, zin: 0.2, zhold: 0.2, zout: 0.3, roll: 0, letterbox: 28, lbSlide: 0.15,
    lines: { a: 0.40, spin: 0.3, accent: false }, grade: { src: 'accent', a: 0.18, vig: 0 },
    beat: { rings: 2, ground: false, dust: 0 }, ghosts: 3, element: { n: 40, back: 0 },
    final: { flash: 0.6, rings: 2, embers: 40, impact: false, crack: false, flourish: false, roll: 0.6 * DEG, star: true },
    name: { size: 28, style: 'blood', drips: 0.35, prefix: false },
  },
  2: {
    tier: 2, zoom: 1.20, zin: 0.2, zhold: 0.2, zout: 0.3, roll: 0.8 * DEG, letterbox: 40, lbSlide: 0.15,
    lines: { a: 0.55, spin: 0.3, accent: true }, grade: { src: 'accent', a: 0.22, vig: 0.35 },
    beat: { rings: 2, ground: true, dust: 6 }, ghosts: 5, element: { n: 80, back: 20 },
    final: { flash: 0.6, rings: 3, embers: 40, impact: true, crack: true, flourish: true, roll: 1.2 * DEG, star: true },
    name: { size: 34, style: 'gold', drips: 0, prefix: true },
  },
};
ULT_TIERS.T0 = ULT_TIERS[0]; ULT_TIERS.T1 = ULT_TIERS[1]; ULT_TIERS.T2 = ULT_TIERS[2];

/** 2차 전직 직업 장식 (feel §5.2 표). colors 는 각성기 2차 변형도 같이 쓴다 (feel §6.4) */
export const ULT_FLOURISH = {
  kael_templar:       { name: '성광의 방패 문장', colors: ['#ffd84a', '#fff8e0', '#a01020'], sprites: ['shield'] },
  kael_inquisitor:    { name: '단죄의 불십자', colors: ['#ff9a3a', '#c01020', '#ffe070'], sprites: ['brand'] },
  kael_bloodhunter:   { name: '핏빛 초승달', colors: ['#ff2040', '#ffd0d8', '#c0142a'], sprites: ['crescentR'] },
  kael_nightraven:    { name: '까마귀 떼', colors: ['#6a6aff', '#0e0c14', '#b0b0ff'], sprites: ['crow'] },
  sera_saint:         { name: '천사의 날개', colors: ['#fff8d0', '#ffd84a', '#ffffff'], sprites: ['wing'] },
  sera_oracle:        { name: '시계 룬 진', colors: ['#8ac8ff', '#e8c872', '#e8fbff'], sprites: ['clock'] },
  sera_archmage:      { name: '삼원소 고리', colors: ['#ff7a2a', '#9fe8ff', '#fff2a0'], sprites: ['ringF', 'ringI', 'ringT'] },
  sera_stormcaller:   { name: '천둥 갈래', colors: ['#bfe0ff', '#ffffff', '#6a9aff'], sprites: [] },
  victor_phantom:     { name: '유령 탄환', colors: ['#9ab0ff', '#e8f0ff', '#4a5aff'], sprites: [] },
  victor_executioner: { name: '처형 조준', colors: ['#ff2030', '#ffe0e0', '#1a0a0a'], sprites: ['skullx'] },
  victor_hellfire:    { name: '지옥불 착탄', colors: ['#ff7a2a', '#ffd070', '#ff3010'], sprites: [] },
  victor_gunlord:     { name: '황금 탄피 비', colors: ['#ffd84a', '#fff0b0', '#c8a040'], sprites: ['muzzle'] },
  bran_guardian:      { name: '성역의 방벽', colors: ['#fff2b0', '#ffd84a', '#1a3a7a'], sprites: ['dome'] },
  bran_crusader:      { name: '십자군 충격파', colors: ['#fff2b0', '#c01020', '#ffd84a'], sprites: ['crossR'] },
  bran_warlord:       { name: '전쟁 깃발과 검은 불꽃', colors: ['#ff5020', '#5a0a0a', '#ffd0a0'], sprites: ['banner'], soft: ['#2a0a14', '#ff3010'] },
  bran_bloodrage:     { name: '피의 간헐천', colors: ['#ff1a2a', '#5a0010', '#ffb0b8'], sprites: ['geyser'] },
  lia_shadowmaster:   { name: '그림자 분신', colors: ['#b060ff', '#4a2a8a', '#e0c8ff'], sprites: [], soft: ['#4a2a8a'] },
  lia_kunoichi:       { name: '진홍 꽃보라', colors: ['#ff4a6a', '#ffb0c0', '#8a0a20'], sprites: ['petals'] },
  lia_bladedancer:    { name: '황금 칼날 회오리', colors: ['#ffd84a', '#fff8e0', '#5a0a2a'], sprites: ['blade'] },
  lia_reaper:         { name: '망령의 낫', colors: ['#6affb0', '#e8fff4', '#0a0a0a'], sprites: ['scythe'] },
  azel_nosferatu:     { name: '박쥐 소용돌이', colors: ['#b0103a', '#ff2a3a', '#12060c'], sprites: ['bat'] },
  azel_bloodking:     { name: '혈왕의 관', colors: ['#ff1a2a', '#ffd84a', '#5a0010'], sprites: ['crown'] },
  azel_dawnbringer:   { name: '여명', colors: ['#ffd070', '#ff2040', '#fff8e8'], sprites: ['moon', 'sun'] },
  azel_seraph:        { name: '흑백의 날개', colors: ['#ffffff', '#b060ff', '#1a1a2a'], sprites: ['wing', 'wingD', 'crescentW', 'crescentD'] },
};

/** 시험·계측용 계수 */
export const ULTFX_STATS = {
  canvases: 0, castCanvases: 0, bakes: 0, gradients: 0, sessions: 0, beats: 0, finals: 0, flourishes: {},
  impactFrames: 0, silFrames: 0, diffFrames: 0, whiteFrames: 0, silDraws: 0, layerFrames: 0,
  ghostCaptures: 0, ghostSkips: 0, deferredFlash: 0, pooled: false, prepared: null, errors: 0,
};

// ═══════════════════════════ 작은 도구 ═══════════════════════════
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function mkCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  ULTFX_STATS.canvases++;
  if (live(game?.world)) ULTFX_STATS.castCanvases++;   // 시전 중에 만든 캔버스 (0 이어야 한다)
  return c;
}
function radial(g, x0, y0, r0, x1, y1, r1, stops) {
  ULTFX_STATS.gradients++;
  const gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function linear(g, x0, y0, x1, y1, stops) {
  ULTFX_STATS.gradients++;
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
const RGBC = new Map();
function rgbOf(c) {
  let v = RGBC.get(c);
  if (!v) {
    v = typeof c === 'string' && c[0] === '#' ? hexToRgb(c) : [255, 255, 255];
    if (v.some((n) => !Number.isFinite(n))) v = [255, 255, 255];
    if (RGBC.size > 256) RGBC.clear();
    RGBC.set(c, v);
  }
  return v;
}
function rgbaOf(c, a) { const v = rgbOf(c); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; }
function mixC(a, b, t) {
  const x = rgbOf(a), y = rgbOf(b);
  const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return '#' + h(lerp(x[0], y[0], t)) + h(lerp(x[1], y[1], t)) + h(lerp(x[2], y[2], t));
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function qk(w) {
  let q = null;
  try { q = w?.qualityNow?.() ?? null; } catch { q = null; }
  q = q ?? game?.quality ?? game?.settings?.quality ?? 'high';
  return q === 'low' || q === 'medium' ? q : 'high';
}
function flashK() { const k = Number(game?.settings?.flashFx ?? 1); return Number.isFinite(k) ? clamp(k, 0, 1) : 1; }
function calm() { return !!game?.settings?.reduceMotion; }
function sfx(name, o) { try { audio.sfx(name, o); } catch { /* 소리 없음 */ } }
function clampTier(t) { t = Number(t); return t >= 2 ? 2 : t >= 1 ? 1 : 0; }
function tierOfClass(classId) { return clampTier(CLASSES[classId]?.tier ?? 0); }
function ultColor(charId) { return CHARACTERS[charId]?.ult?.color ?? '#fff2b0'; }
/** 직업 강조색 = look.aura.color ?? look.secondary ?? 캐릭터 필살기 색 (feel §5.2) */
export function accentOf(classId, fallback) {
  const L = CLASSES[classId]?.look;
  return L?.aura?.color ?? L?.secondary ?? fallback ?? '#fff2b0';
}
/** 화면에서 보이는 강조색: 거의 검은 색(가산 합성에서 사라짐, 예: victor_deadeye #1a1a20)은 필살기 색으로 바꾼다 */
function visAccent(classId, col) {
  const a = accentOf(classId, col), v = rgbOf(a);
  return (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255 < 0.22 ? col : a;
}
const AURA_DEF = { kael: 'holy', sera: 'holy', victor: 'fire', bran: 'fire', lia: 'dark', azel: 'blood' };
function auraOf(classId, charId, accent) {
  const A = CLASSES[classId]?.look?.aura;
  if (A?.type) return { type: A.type, color: A.color ?? accent };
  return { type: AURA_DEF[charId] ?? 'holy', color: accent };
}
function live(w) { const s = w?.__ultfx; return s && !s.dead ? s : null; }
/** 품질별 필살기 입자 최대치 안에서 뿌릴 수 있는 수 (want 는 high 기준, fx.quality 배율 적용) */
function room(w, want, aw = false, min = 0) {
  const fx = w?.fx;
  if (!fx?.list) return 0;
  const B = Q[qk(w)], cap = Math.min(aw ? B.awPeak : B.peak, fx.max ?? 1400);
  const free = cap - fx.list.length;
  const n = Math.round(want * (fx.quality ?? 1));
  return Math.max(min, Math.min(n, free));
}
function emitOK(w, aw = false) {
  const fx = w?.fx;
  if (!fx?.list) return false;
  const B = Q[qk(w)];
  return fx.list.length < Math.min(aw ? B.awPeak : B.peak, fx.max ?? 1400) - 6;
}
function burstN(w, type, x, y, n, opts, aw) {
  const k = room(w, n, aw);
  for (let i = 0; i < k; i++) w.fx.emit(type, x, y, opts);
  return k;
}
/** x 열에서 y 아래로 가장 가까운 바닥(px) | null (skills.js groundAt 과 같은 규칙) */
function groundBelow(w, x, y, maxDrop = 7 * TILE) {
  const m = w?.map;
  if (!m?.groundBelow || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const tx = Math.floor(x / TILE);
  let ty = Math.floor(y / TILE), g = 0;
  while (ty > 0 && isSolidType(m.typeAt(tx, ty)) && g++ < 6) ty--;
  const gy = m.groundBelow(tx, Math.max(0, ty));
  if (gy === null || gy === undefined || gy - y > maxDrop) return null;
  return gy;
}
/** 화면 안 적 (o.targets 가 있으면 그 목록), (x,y) 에 가까운 순 */
function foesNear(w, x, y, o, max = 8) {
  let list = Array.isArray(o?.targets) ? o.targets.filter((e) => e && !e.dead) : null;
  if (!list) {
    const cam = w.camera;
    list = [];
    try { for (const e of w.enemies?.() ?? []) if (!cam || cam.visible(e.x, e.y, e.w, e.h, 10)) list.push(e); } catch { list = []; }
  }
  list.sort((a, b) => Math.hypot(a.cx - x, a.cy - y) - Math.hypot(b.cx - x, b.cy - y));
  return list.slice(0, max);
}

// ── 그리기 도구 (프레임마다 그라디언트 없음) ──
/** 이미지를 (x,y) 기준점(ax, ay: 0..1)에 sx·sy 배율, rot 회전으로 */
function blit(ctx, img, x, y, sx = 1, rot = 0, a = 1, add = false, ax = 0.5, ay = 0.5, sy = sx) {
  if (!img || !(a > 0.004) || !sx || !sy) return;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
  const iw = img.width, ih = img.height;
  if (rot || sx < 0 || sy < 0) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sx, sy);
    ctx.drawImage(img, -iw * ax, -ih * ay);
    ctx.restore();
  } else ctx.drawImage(img, x - iw * ax * sx, y - ih * ay * sy, iw * sx, ih * sy);
}
/** 가로로 늘어선 스프라이트 시트의 fi 번째 칸 */
function drawFrame(ctx, img, fi, nf, x, y, sx, sy, rot, a, add = false) {
  if (!img || !(a > 0.004) || !sx || !sy) return;
  const fw = img.width / nf, fh = img.height;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sx, sy);
  ctx.drawImage(img, fi * fw, 0, fw, fh, -fw / 2, -fh / 2, fw, fh);
  ctx.restore();
}
/** 가는 빛살 n 개 (가산) */
function rays(ctx, x, y, n, r0, r1, rot, col, a, wd = 0.05) {
  if (!(a > 0.004)) return;
  ctx.globalAlpha = a > 1 ? 1 : a; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const an = rot + i * TAU / n;
    ctx.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0);
    ctx.lineTo(x + Math.cos(an - wd) * r1, y + Math.sin(an - wd) * r1);
    ctx.lineTo(x + Math.cos(an + wd) * r1, y + Math.sin(an + wd) * r1);
    ctx.closePath();
  }
  ctx.fill();
}
/** 꼬리가 뾰족한 빛줄기 (x0,y0 꼬리 → x1,y1 머리) */
function taper(ctx, x0, y0, x1, y1, wd, col, a) {
  if (!(a > 0.004)) return;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy * wd / 2, ny = ux * wd / 2;
  ctx.globalAlpha = a > 1 ? 1 : a; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 + nx, y1 + ny); ctx.lineTo(x1 + ux * wd * 0.7, y1 + uy * wd * 0.7); ctx.lineTo(x1 - nx, y1 - ny); ctx.closePath(); ctx.fill();
}
function boltPts(x0, y0, x1, y1, n = 9, jag = 26) {
  const P = [x0, y0], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 1; i < n; i++) { const u = i / n, j = (Math.random() * 2 - 1) * jag * Math.sin(u * Math.PI); P.push(x0 + dx * u + nx * j, y0 + dy * u + ny * j); }
  P.push(x1, y1);
  return P;
}
function strokePts(ctx, P) { ctx.beginPath(); ctx.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) ctx.lineTo(P[i], P[i + 1]); ctx.stroke(); }
function drawBolt(ctx, P, col, wd, a) {
  if (!(a > 0.004) || !P) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = col; ctx.globalAlpha = Math.min(1, a * 0.3); ctx.lineWidth = wd * 3.4; strokePts(ctx, P);
  ctx.globalAlpha = Math.min(1, a * 0.85); ctx.lineWidth = wd; strokePts(ctx, P);
  ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = Math.min(1, a); ctx.lineWidth = Math.max(1, wd * 0.4); strokePts(ctx, P);
}

// ═══════════════════════════ 캔버스 풀 · 캐시 스프라이트 ═══════════════════════════
const GLOW = 256, GLOW_CAP = 24, LAYER = 512, SPR_CAP = 8;
const GH = { bw: 150, bt: 180, bb: 30 };   // 잔상 비트맵 상자 (발 중앙 기준 좌우 bw, 위 bt, 아래 bb; 월드 px)
const POOL = { glow: new Map(), glowSpare: [], layers: [], sprites: new Map(), spriteSpare: [], ghosts: [], sil: null, scratch: null };
/** 풀을 미리 만든다 (부팅 뒤 한가할 때 · 스테이지 진입 뒤 한가할 때). 이미 있으면 모자란 만큼만 */
function ensurePools(q = 'high') {
  if (typeof document === 'undefined') return false;
  const B = Q[q] ?? Q.high;
  while (POOL.glowSpare.length + POOL.glow.size < 6) { const c = mkCanvas(GLOW, GLOW); if (!c) return false; POOL.glowSpare.push(c); }
  if (B.layer) while (POOL.layers.length < 2) POOL.layers.push({ key: null, c: mkCanvas(LAYER, LAYER), used: 0 });
  while (POOL.spriteSpare.length + POOL.sprites.size < 4) POOL.spriteSpare.push(mkCanvas(256, 256));
  const W = Math.ceil(2 * GH.bw * B.rs), H = Math.ceil((GH.bt + GH.bb) * B.rs);
  while (POOL.ghosts.length < B.ghosts + 1) POOL.ghosts.push({ c: mkCanvas(W, H), part: null, until: 0 });
  if (B.sil && !POOL.sil) POOL.sil = mkCanvas(Math.ceil(1280 * B.sil), Math.ceil(540 * B.sil));
  if (!POOL.scratch) POOL.scratch = mkCanvas(4, 4);
  ULTFX_STATS.pooled = true;
  return true;
}

// ── 256px 빛 (색별, LRU 24) ──
let GLOW_WIN = 0, GLOW_N = 0;
function bakeGlow(g, col, S) {
  const R = S / 2;
  g.fillStyle = radial(g, R, R, 0, R, R, R, [[0, 'rgba(255,255,255,1)'], [0.1, rgbaOf(col, 0.95)], [0.32, rgbaOf(col, 0.45)], [0.62, rgbaOf(col, 0.12)], [1, rgbaOf(col, 0)]]);
  g.fillRect(0, 0, S, S);
}
function resetCtx(c) {
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)'; g.filter = 'none';
  g.clearRect(0, 0, c.width, c.height);
  return g;
}
export function glowSprite(color) {
  const key = typeof color === 'string' && color ? color : '#ffffff';
  const M = POOL.glow;
  let c = M.get(key);
  if (c) { if (M.size > 4) { M.delete(key); M.set(key, c); } return c; }
  // 굽기 속도 상한: 0.2초에 6장 (넘으면 hitfx 의 96px 빛으로)
  const now = perfNow();
  if (now - GLOW_WIN > 200) { GLOW_WIN = now; GLOW_N = 0; }
  if (++GLOW_N > 6) return HFX.glow?.(key) ?? null;
  c = POOL.glowSpare.pop() ?? (M.size < GLOW_CAP ? mkCanvas(GLOW, GLOW) : null);
  if (!c) { const k0 = M.keys().next().value; c = M.get(k0); M.delete(k0); }
  if (!c) return null;
  try { bakeGlow(resetCtx(c), key, c.width); } catch (e) { console.warn('[ultfx] glow', e); }
  ULTFX_STATS.bakes++;
  M.set(key, c);
  return c;
}

// ── 화면 층: 방사 집중선 64줄 + 색보정 + 비네트 (512², 한 장) ──
function bakeLayer(c, L) {
  const g = resetCtx(c), S = c.width, R = S / 2;
  if (L.gradeA > 0) { g.fillStyle = rgbaOf(L.gradeCol, L.gradeA); g.fillRect(0, 0, S, S); }
  if (L.vig > 0) {
    g.fillStyle = radial(g, R, R, R * 0.4, R, R, R, [[0, 'rgba(0,0,0,0)'], [0.55, `rgba(0,0,0,${(L.vig * 0.45).toFixed(3)})`], [1, `rgba(0,0,0,${L.vig})`]]);
    g.fillRect(0, 0, S, S);
  }
  const rnd = mulberry(L.seed ?? 1234);
  g.fillStyle = L.lineCol;
  for (let i = 0; i < 64; i++) {
    const a = ((i + rnd() * 0.8) / 64) * TAU, r0 = R * (0.3 + rnd() * 0.24), r1 = R * 1.45;
    const hw = (0.5 + rnd() * 2.6) / r1;
    g.globalAlpha = L.lineA * (0.45 + rnd() * 0.55);
    g.beginPath();
    g.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0);
    g.lineTo(R + Math.cos(a - hw) * r1, R + Math.sin(a - hw) * r1);
    g.lineTo(R + Math.cos(a + hw) * r1, R + Math.sin(a + hw) * r1);
    g.closePath(); g.fill();
  }
  g.globalAlpha = 1;
}
function layerTex(key, spec) {
  const Ls = POOL.layers;
  let e = Ls.find((l) => l.key === key);
  if (e) { e.used = perfNow(); return e.c; }
  e = Ls.find((l) => !l.key);
  if (!e && Ls.length < 3) { const c = mkCanvas(LAYER, LAYER); if (c) { e = { key: null, c, used: 0 }; Ls.push(e); } }
  if (!e) { const busy = new Set(); const s = live(game?.world); if (s?.tex) busy.add(s.tex); e = Ls.filter((l) => !busy.has(l.c)).sort((a, b) => a.used - b.used)[0]; }
  if (!e?.c) return null;
  try { bakeLayer(e.c, spec); } catch (err) { console.warn('[ultfx] layer', err); return null; }
  ULTFX_STATS.bakes++;
  e.key = key; e.used = perfNow();
  return e.c;
}
function layerFor(tier, col, acc) {
  const T = ULT_TIERS[tier];
  const lineCol = T.lines.accent ? mixC(acc, '#ffffff', 0.35) : '#ffffff';
  const gradeCol = T.grade.src === 'ult' ? col : acc;
  const key = `${lineCol}|${T.lines.a}|${gradeCol}|${T.grade.a}|${T.grade.vig}`;
  return layerTex(key, { lineCol, lineA: T.lines.a, gradeCol, gradeA: T.grade.a, vig: T.grade.vig, seed: 977 + tier * 31 });
}

// ── 장식 스프라이트 (이름별, LRU 8) ──
export function spriteOf(name) {
  const M = POOL.sprites;
  let c = M.get(name);
  if (c) { M.delete(name); M.set(name, c); return c; }
  const d = SPR[name];
  if (!d) return null;
  c = POOL.spriteSpare.pop() ?? (M.size < SPR_CAP ? mkCanvas(d.w, d.h) : null);
  if (!c) { const k0 = M.keys().next().value; c = M.get(k0); M.delete(k0); }
  if (!c) return null;
  if (c.width !== d.w || c.height !== d.h) { c.width = d.w; c.height = d.h; }
  const g = resetCtx(c);
  g.save();
  try { d.bake(g, d.w, d.h); } catch (e) { console.warn('[ultfx] sprite', name, e); }
  g.restore();
  ULTFX_STATS.bakes++;
  M.set(name, c);
  return c;
}

// ─── 굽기 함수들 (한 번만 실행; 그라디언트·그림자는 여기서만) ───
function rune(g, x, y, i, s = 1) {
  g.beginPath();
  g.moveTo(x, y - 7 * s); g.lineTo(x, y + 7 * s);
  if (i & 1) { g.moveTo(x, y - 2 * s); g.lineTo(x + 5 * s, y - 7 * s); }
  if (i & 2) { g.moveTo(x, y + 2 * s); g.lineTo(x - 5 * s, y + 7 * s); }
  if (i & 4) { g.moveTo(x - 4 * s, y); g.lineTo(x + 4 * s, y); }
  if (i & 8) { g.moveTo(x, y - 7 * s); g.lineTo(x - 4 * s, y - 3 * s); }
  g.stroke();
  if (i % 3 === 0) { g.beginPath(); g.arc(x + 4 * s, y + 4 * s, 1.6 * s, 0, TAU); g.stroke(); }
}
function flamePath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y - 36 * s);
  g.bezierCurveTo(x + 15 * s, y - 14 * s, x + 12 * s, y + 6 * s, x, y + 9 * s);
  g.bezierCurveTo(x - 12 * s, y + 6 * s, x - 15 * s, y - 14 * s, x, y - 36 * s);
  g.closePath();
}
function bakeShield(g, w, h) {
  const cx = w / 2, cy = h / 2 + 4;
  g.fillStyle = radial(g, cx, cy, 0, cx, cy, w * 0.5, [[0, 'rgba(255,232,150,0.55)'], [0.6, 'rgba(255,210,90,0.18)'], [1, 'rgba(255,200,80,0)']]);
  g.fillRect(0, 0, w, h);
  const path = (s) => {
    g.beginPath(); g.moveTo(cx - 70 * s, cy - 84 * s); g.quadraticCurveTo(cx, cy - 100 * s, cx + 70 * s, cy - 84 * s);
    g.lineTo(cx + 72 * s, cy - 14 * s); g.bezierCurveTo(cx + 70 * s, cy + 44 * s, cx + 36 * s, cy + 80 * s, cx, cy + 100 * s);
    g.bezierCurveTo(cx - 36 * s, cy + 80 * s, cx - 70 * s, cy + 44 * s, cx - 72 * s, cy - 14 * s); g.closePath();
  };
  g.shadowColor = '#ffd84a'; g.shadowBlur = 16;
  g.fillStyle = linear(g, cx - 70, cy - 100, cx + 70, cy + 100, [[0, '#fff6c8'], [0.35, '#f0c860'], [0.7, '#b07a28'], [1, '#6a3e10']]);
  path(1); g.fill(); g.shadowBlur = 0;
  g.fillStyle = linear(g, cx, cy - 90, cx, cy + 90, [[0, '#fffaf0'], [1, '#cfc4ae']]);
  path(0.82); g.fill();
  g.save(); path(0.82); g.clip();
  g.fillStyle = '#a01020'; g.fillRect(cx - 13, cy - 90, 26, 190); g.fillRect(cx - 70, cy - 38, 140, 26);
  g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(cx - 13, cy - 90, 6, 190); g.fillRect(cx - 70, cy - 38, 140, 6);
  g.fillStyle = 'rgba(60,0,8,0.35)'; g.fillRect(cx + 7, cy - 90, 6, 190); g.fillRect(cx - 70, cy - 18, 140, 6);
  g.restore();
  g.strokeStyle = '#ffe79a'; g.lineWidth = 2.2; path(0.82); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5; path(0.97); g.stroke();
  g.fillStyle = '#fff2c0';
  for (const [dx, dy] of [[-58, -72], [58, -72], [-63, 6], [63, 6], [-34, 62], [34, 62]]) { g.beginPath(); g.arc(cx + dx, cy + dy, 3.2, 0, TAU); g.fill(); }
}
function bakeBrand(g, w, h) {
  const cx = w / 2, cy = h / 2 + 12;
  g.fillStyle = radial(g, cx, cy, 0, cx, cy, w * 0.6, [[0, 'rgba(255,170,60,0.65)'], [0.5, 'rgba(255,110,30,0.25)'], [1, 'rgba(255,90,20,0)']]);
  g.fillRect(0, 0, w, h);
  for (const [fx0, fy0, s, c] of [[cx, cy - 50, 1.25, '#ff5a14'], [cx - 30, cy - 22, 0.8, '#ff5a14'], [cx + 30, cy - 22, 0.8, '#ff5a14']]) {
    g.fillStyle = c; flamePath(g, fx0, fy0, s); g.fill();
    g.fillStyle = '#ffd070'; flamePath(g, fx0, fy0 + 6 * s, s * 0.55); g.fill();
  }
  g.shadowColor = '#ff7a1a'; g.shadowBlur = 14; g.fillStyle = '#ffae40';
  g.fillRect(cx - 10, cy - 52, 20, 104); g.fillRect(cx - 36, cy - 26, 72, 20);
  g.shadowBlur = 0; g.fillStyle = '#fff4c0';
  g.fillRect(cx - 4, cy - 46, 8, 92); g.fillRect(cx - 30, cy - 20, 60, 8);
  g.strokeStyle = 'rgba(120,20,0,0.55)'; g.lineWidth = 1.5;
  g.strokeRect(cx - 10, cy - 52, 20, 104); g.strokeRect(cx - 36, cy - 26, 72, 20);
}
/** 초승달: 캔버스 가운데가 원의 중심, 볼록한 쪽이 +x (돌리면 중심을 두고 회전) */
function bakeCrescent(g, w, h, col, edge, glowC) {
  const cx = w / 2, cy = h / 2, R = w * 0.44, half = 1.2;
  const path = (d) => {
    const tx = R * Math.cos(half), ty = R * Math.sin(half), r2 = Math.hypot(tx + d, ty), a2 = Math.atan2(ty, tx + d);
    g.beginPath(); g.arc(cx, cy, R, -half, half, false); g.arc(cx - d, cy, r2, a2, -a2, true); g.closePath();
  };
  g.shadowColor = glowC; g.shadowBlur = 18; g.fillStyle = rgbaOf(col, 0.92); path(R * 0.55); g.fill();
  g.shadowBlur = 6; g.shadowColor = edge; g.fillStyle = edge; path(R * 0.2); g.fill();
  g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, R, -half * 0.92, half * 0.92, false); g.stroke();
}
function bakeCrow(g, w, h) {
  const fw = w / 2;
  for (let f = 0; f < 2; f++) {
    g.save(); g.translate(f * fw + fw / 2, h / 2 + 2);
    g.beginPath();
    g.ellipse(0, 0, 16, 7, 0, 0, TAU);
    g.moveTo(20, -4); g.arc(14, -4, 6, 0, TAU);
    g.moveTo(19, -6); g.lineTo(30, -3); g.lineTo(19, -1);
    g.moveTo(-13, -2); g.lineTo(-30, -8); g.lineTo(-27, 0); g.lineTo(-30, 7); g.lineTo(-13, 3);
    if (f === 0) { g.moveTo(-6, -3); g.lineTo(-18, -22); g.lineTo(-4, -18); g.lineTo(2, -26); g.lineTo(8, -14); g.lineTo(6, -3); }
    else { g.moveTo(-6, 2); g.lineTo(-20, 18); g.lineTo(-6, 14); g.lineTo(0, 24); g.lineTo(8, 12); g.lineTo(6, 2); }
    g.fillStyle = '#0e0c14'; g.fill('nonzero');
    g.strokeStyle = 'rgba(122,122,255,0.75)'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = '#c8c8ff'; g.beginPath(); g.arc(15.5, -5.5, 1.4, 0, TAU); g.fill();
    g.restore();
  }
}
/** 날개: 뿌리가 (22, h-22), +x 로 펼쳐짐 */
function bakeWing(g, w, h, dark) {
  const rx = 22, ry = h - 22;
  const c1 = dark ? '#1a1426' : '#ffffff', c2 = dark ? '#40306a' : '#ffe7a0';
  const rim = dark ? 'rgba(176,96,255,0.9)' : 'rgba(200,160,70,0.7)', glowC = dark ? '#b060ff' : '#fff8d0';
  const fill = linear(g, rx, ry, rx + 210, ry - 160, [[0, c2], [0.55, c1], [1, dark ? '#0a0810' : '#fffdf6']]);
  const feather = (a, r0, L, wd) => {
    const bx = rx + Math.cos(a) * r0, by = ry + Math.sin(a) * r0, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    const tx = bx + ux * L, ty = by + uy * L;
    g.beginPath(); g.moveTo(bx, by);
    g.quadraticCurveTo(bx + ux * L * 0.55 + nx * wd, by + uy * L * 0.55 + ny * wd, tx, ty);
    g.quadraticCurveTo(bx + ux * L * 0.5 - nx * wd * 0.8, by + uy * L * 0.5 - ny * wd * 0.8, bx, by);
    g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + ux * L * 0.85, by + uy * L * 0.85); g.stroke();
  };
  g.fillStyle = fill; g.strokeStyle = rim; g.lineWidth = 1; g.shadowColor = glowC; g.shadowBlur = 12;
  for (let i = 0; i < 9; i++) feather((-6 - i * 8.2) * DEG, 26, 196 - i * 10, 15 - i * 0.6);
  g.shadowBlur = 4;
  for (let i = 0; i < 7; i++) feather((-2 - i * 9) * DEG, 16, 120 - i * 7, 13);
  g.shadowBlur = 0;
  for (let i = 0; i < 8; i++) feather((-4 - i * 10) * DEG, 6, 54 - i * 2, 11);
}
function bakeClock(g, w, h) {
  const cx = w / 2, cy = h / 2, R = w * 0.46;
  g.fillStyle = radial(g, cx, cy, 0, cx, cy, R, [[0, 'rgba(138,200,255,0.22)'], [0.7, 'rgba(138,200,255,0.08)'], [1, 'rgba(138,200,255,0)']]);
  g.fillRect(0, 0, w, h);
  g.shadowColor = '#8ac8ff'; g.shadowBlur = 10; g.strokeStyle = '#bfe4ff';
  g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R * 0.9, 0, TAU); g.stroke();
  g.beginPath(); g.arc(cx, cy, R * 0.56, 0, TAU); g.stroke();
  g.shadowBlur = 0;
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * TAU, big = i % 5 === 0, r0 = R * 0.9, r1 = r0 - (big ? 12 : 5);
    g.lineWidth = big ? 2.5 : 1; g.strokeStyle = big ? '#e8c872' : 'rgba(191,228,255,0.8)';
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  g.strokeStyle = '#dff2ff'; g.lineWidth = 1.4;
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU - Math.PI / 2; rune(g, cx + Math.cos(a) * R * 0.71, cy + Math.sin(a) * R * 0.71, i * 5 + 3, 1.05); }
  g.strokeStyle = 'rgba(191,228,255,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.14, cy + Math.sin(a) * R * 0.14); g.lineTo(cx + Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.52); g.stroke(); }
  g.fillStyle = '#e8c872'; g.beginPath(); g.arc(cx, cy, R * 0.06, 0, TAU); g.fill();
}
function bakeRuneRing(g, w, h, col, sides) {
  const cx = w / 2, cy = h / 2, R = w * 0.46;
  g.shadowColor = col; g.shadowBlur = 12; g.strokeStyle = col;
  g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, R * 0.84, 0, TAU); g.stroke();
  g.shadowBlur = 4; g.lineWidth = 1.3;
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * TAU; g.save(); g.translate(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); g.rotate(a + Math.PI / 2); rune(g, 0, 0, i * 7 + sides, 0.62); g.restore();
  }
  g.lineWidth = 2; g.beginPath();
  const n = sides === 3 ? 6 : sides, step = sides === 3 ? 2 : sides === 5 ? 2 : 1;
  for (let i = 0; i <= n; i++) { const k = (i * step) % n, a = -Math.PI / 2 + k / n * TAU, x = cx + Math.cos(a) * R * 0.8, y = cy + Math.sin(a) * R * 0.8; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  if (sides === 3) { for (let i = 0; i <= 3; i++) { const a = Math.PI / 2 + i / 3 * TAU, x = cx + Math.cos(a) * R * 0.8, y = cy + Math.sin(a) * R * 0.8; if (i) g.lineTo(x, y); else g.moveTo(x, y); } }
  g.stroke();
  if (sides === 6) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i / 6 * TAU; g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8); } g.stroke(); }
  g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
}
function bakeSkullX(g, w, h) {
  const cx = w / 2, cy = h / 2, R = 52;
  g.shadowColor = '#ff2030'; g.shadowBlur = 10; g.strokeStyle = '#ff3040'; g.lineWidth = 3.5;
  for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx, cy, R, k * Math.PI / 2 + 0.24, (k + 1) * Math.PI / 2 - 0.24); g.stroke(); }
  g.lineWidth = 3;
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14)); g.lineTo(cx + Math.cos(a) * (R + 16), cy + Math.sin(a) * (R + 16)); g.stroke(); }
  g.shadowBlur = 0; g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,80,90,0.7)'; g.beginPath(); g.arc(cx, cy, R * 0.72, 0, TAU); g.stroke();
  g.shadowColor = '#ff2030'; g.shadowBlur = 8; g.fillStyle = '#ffe8e8';
  g.beginPath(); g.arc(cx, cy - 5, 17, 0, TAU); g.fill();
  g.fillRect(cx - 10, cy + 5, 20, 12);
  g.shadowBlur = 0; g.fillStyle = '#2a0006';
  g.beginPath(); g.ellipse(cx - 7, cy - 4, 5, 6, 0, 0, TAU); g.ellipse(cx + 7, cy - 4, 5, 6, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(cx, cy + 2); g.lineTo(cx - 3, cy + 7); g.lineTo(cx + 3, cy + 7); g.closePath(); g.fill();
  g.strokeStyle = '#2a0006'; g.lineWidth = 1.2; g.beginPath();
  for (let i = -2; i <= 2; i++) { g.moveTo(cx + i * 4, cy + 10); g.lineTo(cx + i * 4, cy + 17); }
  g.stroke();
}
function bakeMuzzle(g, w, h) {
  const ox = 14, oy = h / 2;
  g.fillStyle = radial(g, ox, oy, 0, ox, oy, 70, [[0, 'rgba(255,248,210,0.95)'], [0.4, 'rgba(255,200,80,0.45)'], [1, 'rgba(255,160,40,0)']]);
  g.fillRect(0, 0, w, h);
  const RAYS = [[0, w - 18], [0.42, 92], [-0.42, 92], [0.95, 50], [-0.95, 50], [1.6, 24], [-1.6, 24], [Math.PI, 16]].sort((a, b) => a[0] - b[0]);
  const star = (k) => {
    g.beginPath();
    RAYS.forEach(([a, L], i) => {
      const x = ox + Math.cos(a) * L * k, y = oy + Math.sin(a) * L * k * 0.9;
      const nx = RAYS[(i + 1) % RAYS.length][0], mid = nx > a ? (a + nx) / 2 : (a + nx + TAU) / 2;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
      g.lineTo(ox + Math.cos(mid) * 10 * k, oy + Math.sin(mid) * 10 * k);
    });
    g.closePath();
  };
  g.shadowColor = '#ff9a30'; g.shadowBlur = 12;
  g.fillStyle = 'rgba(255,140,40,0.85)'; star(1); g.fill();
  g.shadowBlur = 0; g.fillStyle = '#ffd84a'; star(0.72); g.fill();
  g.fillStyle = '#fffbe8'; star(0.42); g.fill();
}
function bakeDome(g, w, h) {
  const cx = w / 2, by = h - 2, rx = w * 0.48, ry = h * 0.94;
  const path = () => { g.beginPath(); g.ellipse(cx, by, rx, ry, 0, Math.PI, TAU); g.closePath(); };
  g.save(); path(); g.clip();
  g.fillStyle = radial(g, cx, by, ry * 0.2, cx, by, ry, [[0, 'rgba(255,248,210,0.04)'], [0.72, 'rgba(255,236,160,0.2)'], [1, 'rgba(255,220,120,0.6)']]);
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,244,200,0.4)'; g.lineWidth = 1.2;
  const s = 16, hh = s * Math.sqrt(3);
  g.beginPath();
  for (let y = by; y > by - ry - hh; y -= hh / 2) {
    const row = Math.round((by - y) / (hh / 2));
    for (let x = cx - rx - s * 3 + (row % 2) * s * 1.5; x < cx + rx + s * 3; x += s * 3) {
      for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU, px = x + Math.cos(a) * s, py = y + Math.sin(a) * s; if (k) g.lineTo(px, py); else g.moveTo(px, py); }
    }
  }
  g.stroke();
  g.restore();
  g.shadowColor = '#ffd84a'; g.shadowBlur = 12; g.strokeStyle = '#fff2b0'; g.lineWidth = 3;
  g.beginPath(); g.ellipse(cx, by, rx - 1.5, ry - 1.5, 0, Math.PI, TAU); g.stroke();
  g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.2; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 5;
  g.beginPath(); g.ellipse(cx, by, rx * 0.8, ry * 0.8, 0, Math.PI * 1.18, Math.PI * 1.42); g.stroke();
}
function bakeCross(g, w, h) {
  const cx = w / 2, cy = h / 2 + 10;
  const path = (k) => {
    const vw = 22 * k, hw = 90 * k, t = -62, b = -18, top = -112, bot = 110;
    g.beginPath();
    g.moveTo(cx - vw, cy + top); g.lineTo(cx + vw, cy + top); g.lineTo(cx + vw, cy + t + (1 - k) * 8);
    g.lineTo(cx + hw, cy + t + (1 - k) * 8); g.lineTo(cx + hw, cy + b - (1 - k) * 8); g.lineTo(cx + vw, cy + b - (1 - k) * 8);
    g.lineTo(cx + vw, cy + bot); g.lineTo(cx - vw, cy + bot); g.lineTo(cx - vw, cy + b - (1 - k) * 8);
    g.lineTo(cx - hw, cy + b - (1 - k) * 8); g.lineTo(cx - hw, cy + t + (1 - k) * 8); g.lineTo(cx - vw, cy + t + (1 - k) * 8);
    g.closePath();
  };
  g.shadowColor = '#fff2b0'; g.shadowBlur = 22; g.fillStyle = '#c01020'; path(1); g.fill();
  g.shadowBlur = 0; g.fillStyle = '#ff5a50'; path(0.62); g.fill();
  g.fillStyle = '#fff4d0'; path(0.26); g.fill();
  g.strokeStyle = '#ffd84a'; g.lineWidth = 2.5; path(1); g.stroke();
}
function bakeBanner(g, w, h) {
  const px = w / 2;
  g.fillStyle = '#1a0e0a'; g.fillRect(px - 3, 12, 6, h - 12);
  g.fillStyle = '#c8a040'; g.beginPath(); g.moveTo(px, 0); g.lineTo(px + 6, 14); g.lineTo(px - 6, 14); g.closePath(); g.fill();
  g.fillStyle = '#2a1810'; g.fillRect(px - 36, 18, 72, 5);
  g.beginPath();
  g.moveTo(px - 33, 23); g.lineTo(px + 33, 23); g.lineTo(px + 33, 150); g.lineTo(px + 21, 138); g.lineTo(px + 11, 162);
  g.lineTo(px, 146); g.lineTo(px - 10, 166); g.lineTo(px - 21, 140); g.lineTo(px - 33, 154); g.closePath();
  g.fillStyle = linear(g, 0, 23, 0, 166, [[0, '#6a0c0c'], [1, '#240505']]); g.fill();
  g.strokeStyle = 'rgba(255,80,32,0.6)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = 'rgba(200,160,64,0.85)';
  g.beginPath(); g.arc(px, 80, 12, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(px - 10, 74); g.quadraticCurveTo(px - 26, 60, px - 20, 44); g.quadraticCurveTo(px - 18, 62, px - 6, 70); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(px + 10, 74); g.quadraticCurveTo(px + 26, 60, px + 20, 44); g.quadraticCurveTo(px + 18, 62, px + 6, 70); g.closePath(); g.fill();
  g.fillStyle = '#240505'; g.beginPath(); g.arc(px - 4, 79, 2.6, 0, TAU); g.arc(px + 4, 79, 2.6, 0, TAU); g.fill();
}
function bakeGeyser(g, w, h) {
  const cx = w / 2;
  g.shadowColor = '#ff1a2a'; g.shadowBlur = 12;
  g.beginPath();
  g.moveTo(cx - 24, h); g.bezierCurveTo(cx - 20, h * 0.6, cx - 16, 90, cx - 13, 42);
  g.quadraticCurveTo(cx, 26, cx + 13, 42); g.bezierCurveTo(cx + 16, 90, cx + 20, h * 0.6, cx + 24, h); g.closePath();
  g.fillStyle = linear(g, 0, 26, 0, h, [[0, '#ff5a6a'], [0.3, '#d01a34'], [0.8, '#7a0a18'], [1, '#3a0006']]); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,200,210,0.35)';
  g.beginPath(); g.moveTo(cx - 6, 48); g.lineTo(cx - 2, 48); g.lineTo(cx - 5, h - 20); g.lineTo(cx - 10, h - 20); g.closePath(); g.fill();
  g.fillStyle = '#c0142a';
  for (let i = 0; i < 10; i++) { const y = 60 + i * 18, s = i % 2 ? 1 : -1; g.beginPath(); g.arc(cx + s * (15 + (i % 3) * 3), y, 2.5 + (i % 3), 0, TAU); g.fill(); }
  g.fillStyle = '#e8243a';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42, L = 16 + (i % 2) * 8, x = cx + Math.cos(a) * 12, y = 40 + Math.sin(a) * 12;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a - 0.2) * L, y + Math.sin(a - 0.2) * L); g.lineTo(x + Math.cos(a + 0.2) * L, y + Math.sin(a + 0.2) * L); g.closePath(); g.fill();
    g.beginPath(); g.arc(x + Math.cos(a) * (L + 4), y + Math.sin(a) * (L + 4), 2.6, 0, TAU); g.fill();
  }
}
function bakePetals(g, w, h) {
  const C = [['#ff4a6a', '#ffb0c0'], ['#e01a44', '#ff8aa0'], ['#ff7a9a', '#ffe0e8']];
  for (let f = 0; f < 3; f++) {
    g.save(); g.translate(f * 32 + 16, 16); g.rotate(f * 0.6);
    const petal = (k) => { g.beginPath(); g.moveTo(0, -12 * k); g.bezierCurveTo(10 * k, -8 * k, 9 * k, 7 * k, 0, 12 * k); g.bezierCurveTo(-9 * k, 7 * k, -10 * k, -8 * k, 0, -12 * k); g.closePath(); };
    g.fillStyle = C[f][0]; petal(1); g.fill();
    g.fillStyle = rgbaOf(C[f][1], 0.65); g.save(); g.translate(-2, -2); petal(0.55); g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, -9); g.lineTo(0, 9); g.stroke();
    g.restore();
  }
}
function bakeBlade(g, w, h) {
  const cy = h / 2;
  g.strokeStyle = '#ffd84a'; g.lineWidth = 3; g.beginPath(); g.arc(10, cy, 6, 0, TAU); g.stroke();
  g.fillStyle = '#5a0a2a'; g.fillRect(16, cy - 4, 26, 8);
  g.strokeStyle = '#ffd84a'; g.lineWidth = 1; g.beginPath(); for (let x = 19; x < 42; x += 5) { g.moveTo(x, cy - 4); g.lineTo(x + 3, cy + 4); } g.stroke();
  g.fillStyle = '#e8c060'; g.fillRect(42, cy - 9, 6, 18);
  g.shadowColor = '#ffd84a'; g.shadowBlur = 8;
  g.beginPath(); g.moveTo(48, cy - 7); g.lineTo(w - 4, cy); g.lineTo(48, cy + 7); g.closePath();
  g.fillStyle = linear(g, 48, 0, w - 4, 0, [[0, '#c8963a'], [0.35, '#ffd84a'], [1, '#fff8e0']]); g.fill();
  g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(50, cy - 2.5); g.lineTo(w - 12, cy); g.stroke();
}
/** 낫: 손잡이 끝(20,70)이 회전 축, +x 로 뻗은 자루 끝에서 +y 쪽으로 휘는 날 */
function bakeScythe(g, w, h) {
  g.shadowColor = '#6affb0'; g.shadowBlur = 14;
  g.strokeStyle = 'rgba(40,90,70,0.95)'; g.lineWidth = 8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(20, 70); g.lineTo(200, 70); g.stroke();
  g.strokeStyle = 'rgba(160,255,210,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(24, 67); g.lineTo(198, 67); g.stroke();
  g.beginPath();
  g.moveTo(186, 60); g.quadraticCurveTo(252, 118, 172, 238); g.quadraticCurveTo(214, 136, 178, 84); g.closePath();
  g.fillStyle = linear(g, 186, 60, 172, 238, [[0, 'rgba(232,255,244,0.95)'], [0.5, 'rgba(106,255,176,0.8)'], [1, 'rgba(40,160,110,0.35)']]); g.fill();
  g.shadowBlur = 4; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(188, 62); g.quadraticCurveTo(250, 120, 174, 234); g.stroke();
  g.shadowBlur = 0; g.fillStyle = '#e8fff4'; g.beginPath(); g.arc(200, 70, 6, 0, TAU); g.fill();
}
function bakeBat(g, w, h) {
  const fw = w / 2;
  for (let f = 0; f < 2; f++) {
    g.save(); g.translate(f * fw + fw / 2, h / 2 + 2);
    const up = f === 0 ? -1 : 1;
    g.beginPath();
    g.ellipse(0, 0, 6, 8, 0, 0, TAU);
    g.moveTo(-4, -6); g.lineTo(-5, -13); g.lineTo(-1, -8); g.moveTo(4, -6); g.lineTo(5, -13); g.lineTo(1, -8);
    for (const s of [-1, 1]) {
      g.moveTo(s * 4, -2); g.lineTo(s * 16, up * 14 - 2); g.lineTo(s * 28, up * 8 - 4); g.lineTo(s * 24, up * 2);
      g.lineTo(s * 19, 4); g.lineTo(s * 14, up * 1 + 2); g.lineTo(s * 9, 6); g.lineTo(s * 4, 4);
    }
    g.fillStyle = '#12060c'; g.fill();
    g.strokeStyle = 'rgba(255,74,106,0.55)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#ff2a3a'; g.beginPath(); g.arc(-2.5, -3, 1.4, 0, TAU); g.arc(2.5, -3, 1.4, 0, TAU); g.fill();
    g.restore();
  }
}
function bakeCrown(g, w, h) {
  const cx = w / 2, cy = 118;
  g.shadowColor = '#ff1a2a'; g.shadowBlur = 14; g.strokeStyle = '#ff3040';
  g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 98, 0, TAU); g.stroke();
  g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, 84, 0, TAU); g.stroke();
  g.shadowBlur = 3; g.lineWidth = 1.4;
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.save(); g.translate(cx + Math.cos(a) * 91, cy + Math.sin(a) * 91); g.rotate(a + Math.PI / 2); rune(g, 0, 0, i * 3 + 1, 0.55); g.restore(); }
  const peaks = [[-56, -40], [-28, -52], [0, -66], [28, -52], [56, -40]], vals = [-42, -14, 14, 42];
  g.beginPath(); g.moveTo(cx - 60, cy + 4);
  peaks.forEach(([x, y], i) => { g.lineTo(cx + x, cy + y); if (i < vals.length) g.lineTo(cx + vals[i], cy - 10); });
  g.lineTo(cx + 60, cy + 4); g.lineTo(cx + 56, cy + 24); g.lineTo(cx - 56, cy + 24); g.closePath();
  g.shadowColor = '#ff1a2a'; g.shadowBlur = 16;
  g.fillStyle = linear(g, 0, cy - 66, 0, cy + 24, [[0, '#ffe79a'], [0.45, '#c8963a'], [1, '#8a1010']]); g.fill();
  g.shadowBlur = 0; g.strokeStyle = '#fff2c0'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#5a0010'; g.fillRect(cx - 56, cy + 6, 112, 5);
  for (const [x, y] of peaks) {
    g.fillStyle = '#ff1a2a'; g.beginPath(); g.arc(cx + x, cy + y, 5, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(cx + x - 1.5, cy + y - 1.5, 1.6, 0, TAU); g.fill();
  }
  g.fillStyle = '#ff1a2a'; g.beginPath(); g.moveTo(cx, cy - 6); g.lineTo(cx + 8, cy + 6); g.lineTo(cx, cy + 18); g.lineTo(cx - 8, cy + 6); g.closePath(); g.fill();
  g.fillStyle = '#b00a24';
  for (let i = 0; i < 6; i++) {
    const x = cx - 45 + i * 18 + (i % 2) * 3, L = 12 + (i * 7) % 20;
    g.beginPath(); g.moveTo(x - 3, cy + 24); g.lineTo(x + 3, cy + 24); g.lineTo(x + 2, cy + 24 + L); g.arc(x, cy + 24 + L, 3.2, 0, Math.PI); g.closePath(); g.fill();
  }
}
function bakeMoon(g, w, h) {
  const cx = w / 2, cy = h / 2, R = w * 0.4;
  g.shadowColor = '#ff2040'; g.shadowBlur = 24;
  g.fillStyle = radial(g, cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R, [[0, '#ff6070'], [0.55, '#b0102a'], [1, '#3a0006']]);
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.shadowBlur = 0; g.fillStyle = 'rgba(70,0,12,0.45)';
  for (const [dx, dy, r] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.13], [-0.05, 0.35, 0.1], [0.35, -0.35, 0.08], [-0.45, 0.25, 0.07]]) { g.beginPath(); g.arc(cx + dx * R, cy + dy * R, r * R, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(255,160,170,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R - 1, Math.PI * 0.9, Math.PI * 1.6); g.stroke();
}
function bakeSun(g, w, h) {
  const cx = w / 2, cy = h / 2, R = w * 0.5;
  g.fillStyle = radial(g, cx, cy, 0, cx, cy, R, [[0, 'rgba(255,240,200,0.5)'], [0.5, 'rgba(255,200,100,0.18)'], [1, 'rgba(255,180,80,0)']]);
  g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,208,112,0.75)'; g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU, L = R * (i % 2 ? 0.72 : 0.96), wd = i % 2 ? 0.07 : 0.1;
    g.moveTo(cx + Math.cos(a - wd) * R * 0.4, cy + Math.sin(a - wd) * R * 0.4); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.lineTo(cx + Math.cos(a + wd) * R * 0.4, cy + Math.sin(a + wd) * R * 0.4); g.closePath();
  }
  g.fill();
  g.shadowColor = '#ffd070'; g.shadowBlur = 20;
  g.fillStyle = radial(g, cx, cy, 0, cx, cy, R * 0.42, [[0, '#fffef0'], [0.55, '#ffe7a0'], [1, '#ff9a30']]);
  g.beginPath(); g.arc(cx, cy, R * 0.4, 0, TAU); g.fill();
}
const SPR = {
  shield: { w: 200, h: 236, bake: bakeShield },
  brand: { w: 104, h: 140, bake: bakeBrand },
  crescentR: { w: 256, h: 256, bake: (g, w, h) => bakeCrescent(g, w, h, '#ff2040', '#ffd0d8', '#c0142a') },
  crescentW: { w: 256, h: 256, bake: (g, w, h) => bakeCrescent(g, w, h, '#f4f0ff', '#ffffff', '#fff2b0') },
  crescentD: { w: 256, h: 256, bake: (g, w, h) => bakeCrescent(g, w, h, '#240c3a', '#c090ff', '#b060ff') },
  crow: { w: 144, h: 60, bake: bakeCrow },
  wing: { w: 256, h: 200, bake: (g, w, h) => bakeWing(g, w, h, false) },
  wingD: { w: 256, h: 200, bake: (g, w, h) => bakeWing(g, w, h, true) },
  clock: { w: 256, h: 256, bake: bakeClock },
  ringF: { w: 256, h: 256, bake: (g, w, h) => bakeRuneRing(g, w, h, '#ff7a2a', 3) },
  ringI: { w: 256, h: 256, bake: (g, w, h) => bakeRuneRing(g, w, h, '#9fe8ff', 6) },
  ringT: { w: 256, h: 256, bake: (g, w, h) => bakeRuneRing(g, w, h, '#fff2a0', 5) },
  skullx: { w: 144, h: 144, bake: bakeSkullX },
  muzzle: { w: 200, h: 100, bake: bakeMuzzle },
  dome: { w: 256, h: 176, bake: bakeDome },
  crossR: { w: 220, h: 256, bake: bakeCross },
  banner: { w: 104, h: 200, bake: bakeBanner },
  geyser: { w: 72, h: 256, bake: bakeGeyser },
  petals: { w: 96, h: 32, bake: bakePetals },
  blade: { w: 128, h: 36, bake: bakeBlade },
  scythe: { w: 256, h: 256, bake: bakeScythe },
  bat: { w: 128, h: 44, bake: bakeBat },
  crown: { w: 240, h: 224, bake: bakeCrown },
  moon: { w: 240, h: 240, bake: bakeMoon },
  sun: { w: 256, h: 256, bake: bakeSun },
};
export const ULT_SPRITES = Object.keys(SPR);

// ═══════════════════════════ 월드 연출 개체 ═══════════════════════════
/** 장식·잔상 그리기용 가벼운 개체 (월드 시간으로 진행: 히트스톱에 멈추고 슬로모션을 따른다) */
class UltEnt extends Entity {
  constructor(o) {
    super(0, 0, 1, 1);
    this.kind = 'effect'; this.z = o.z ?? 13; this.o = o; this.life = o.life ?? 1; this.lt = 0; this.d = o.d ?? {};
  }
  // 가짜 벽 판정(world.inUnrevealedFake)은 개체 중심을 본다 → 플레이어 위치(가짜 벽 안에 있으면 벽이 이미 드러난 상태)
  get cx() { return this.world?.player?.cx ?? this.x + this.w / 2; }
  set cx(v) { this.x = v - this.w / 2; }
  get cy() { return this.world?.player?.cy ?? this.y + this.h / 2; }
  cover(w) { const c = w.camera; if (c) { this.x = c.x - 200; this.y = c.y - 200; this.w = c.vw + 400; this.h = c.vh + 400; } }
  update(dt, w) {
    this.t += dt; this.lt += dt;
    this.cover(w);
    try { this.o.tick?.(this, w, dt); } catch (err) { ULTFX_STATS.errors++; console.error('[ultfx]', err); this.dead = true; }
    if (this.lt >= this.life) { this.dead = true; try { this.o.end?.(this, w); } catch (err) { console.error('[ultfx]', err); } }
  }
  draw(ctx, w) {
    if (!this.o.draw) return;
    ctx.save();
    try { this.o.draw(ctx, this, w); } catch (err) { ULTFX_STATS.errors++; console.error('[ultfx]', err); this.dead = true; }
    ctx.restore();
  }
}
function spawn(w, o) {
  if (!w?.add) return null;
  const e = new UltEnt(o);
  e.world = w; e.cover(w);
  return w.add(e);
}
function addOv(w, o) {
  if (typeof w?.addOverlay === 'function') return w.addOverlay(o);
  if (Array.isArray(w?.overlays)) { o.t = 0; w.overlays.push(o); return o; }
  return null;
}

// ═══════════════════════════ 잔상 (캐시 비트맵) ═══════════════════════════
function ghostSlot(w, holdMs = 0) {
  const now = perfNow();
  for (const s of POOL.ghosts) if (now >= s.until || s.part?.done) { s.part = null; s.until = now + holdMs; return s; }
  const B = Q[qk(w)];
  if (POOL.ghosts.length < B.ghosts + 1) {
    const c = mkCanvas(Math.ceil(2 * GH.bw * B.rs), Math.ceil((GH.bt + GH.bb) * B.rs));
    if (!c) return null;
    const s = { c, part: null, until: now + holdMs };
    POOL.ghosts.push(s);
    return s;
  }
  return null;
}
/** 영웅 스냅샷을 슬롯 캔버스에 한 번 그린다 (tint 로 물들임). 반환 {c, W, H, rs, x: 발 중앙 x, y: 발 y} */
function captureGhost(w, snap, tint, slot, rs) {
  const W = Math.ceil(2 * GH.bw * rs), H = Math.ceil((GH.bt + GH.bb) * rs), c = slot.c;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = resetCtx(c);
  g.setTransform(rs, 0, 0, rs, (GH.bw - snap.cx) * rs, (GH.bt - snap.bottom) * rs);
  try { drawHero(g, snap, w, { noFx: true }); } catch (e) { console.warn('[ultfx] ghost', e); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (tint) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.78; g.fillStyle = tint; g.fillRect(0, 0, W, H); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  ULTFX_STATS.ghostCaptures++;
  return { c, W, H, rs, x: snap.cx, y: snap.bottom };
}
function drawGhostBmp(ctx, b, x, y, a, add = true, flip = false) {
  if (!b || !(a > 0.004)) return;
  ctx.globalAlpha = a > 1 ? 1 : a; ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
  const dw = b.W / b.rs, dh = b.H / b.rs;
  if (flip) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(b.c, 0, 0, b.W, b.H, -GH.bw, y - GH.bt, dw, dh); ctx.restore(); }
  else ctx.drawImage(b.c, 0, 0, b.W, b.H, x - GH.bw, y - GH.bt, dw, dh);
}
/** 한 방(맵)에 하나: 살아 있는 잔상들을 영웅 바로 뒤(z 9.4)에 그린다 */
function trailOf(w) {
  let tr = w.__ultTrail;
  if (tr && !tr.dead && tr.map === w.map) return tr;
  tr = spawn(w, {
    life: 1e9, z: 9.4, d: { list: [], idle: 0 },
    tick(e, ww, dt) {
      const L = e.d.list;
      for (let i = L.length - 1; i >= 0; i--) { const g = L[i]; g.t += dt; if (g.t >= g.life) { g.done = true; L.splice(i, 1); } }
      if (L.length) e.d.idle = 0; else if ((e.d.idle += dt) > 2) e.dead = true;
    },
    draw(ctx, e) { for (const g of e.d.list) drawGhostBmp(ctx, g.b, g.b.x, g.b.y, g.a * (1 - g.t / g.life) ** 1.4, true); },
    end() {},
  });
  if (!tr) return null;
  tr.map = w.map;
  w.__ultTrail = tr;
  return tr;
}
function liveGhosts(tr) { return tr?.d?.list?.length ?? 0; }
function afterimageImpl(w, p, tint, o = {}) {
  if (!w?.fx || !p || p.dead) return false;
  const s = live(w);
  const tier = clampTier(o.tier ?? s?.tier ?? tierOfClass(p.hero?.classId));
  let max = ULT_TIERS[tier].ghosts;
  if (o.min != null) max = Math.max(max, o.min);
  if (o.max != null) max = o.max;
  const q = qk(w), B = Q[q];
  max = Math.min(max, B.ghosts);
  if (!(max > 0)) return false;
  const st = s ?? (p.__ultGhost ??= { at: -9 });
  const now = w.rt ?? w.time ?? 0;
  if (now - (st.ghostAt ?? st.at ?? -9) < (o.gap ?? 0.045)) return false;
  const tr = trailOf(w);
  if (!tr || liveGhosts(tr) >= max) return false;
  const slot = ghostSlot(w);
  if (!slot) { ULTFX_STATS.ghostSkips++; return false; }
  if (s) s.ghostAt = now; else st.at = now;
  const col = tint ?? (tier >= 2 ? (s?.accent ?? visAccent(p.hero?.classId, ultColor(p.hero?.charId))) : (s?.color ?? ultColor(p.hero?.charId)));
  const snap = typeof p.snapshot === 'function' ? p.snapshot() : p;
  const b = captureGhost(w, snap, col, slot, B.rs);
  const life = o.life ?? 0.26;
  const g = { b, t: 0, life, a: o.alpha ?? 0.7, done: false };
  slot.part = g; slot.until = perfNow() + (life / Math.max(0.15, w.slowmoScale ?? 0.35)) * 1000 + 400;
  tr.d.list.push(g);
  return true;
}

// ═══════════════════════════ 연출 세션 (begin … end) ═══════════════════════════
class Session {
  constructor(w, p, o) {
    this.w = w; this.p = p || w.player || null; this.o = o;
    const hero = this.p?.hero ?? w.hero ?? null;
    this.charId = o.charId ?? hero?.charId ?? null;
    this.classId = o.classId ?? hero?.classId ?? null;
    this.tier = clampTier(o.tier ?? tierOfClass(this.classId));
    this.T = ULT_TIERS[this.tier];
    this.color = o.color ?? ultColor(this.charId);
    this.accent = o.accent ?? visAccent(this.classId, this.color);
    this.awaken = o.awaken ?? !!w.hudHidden;
    this.q = qk(w);
    this.dir = (this.p?.facing ?? 1) < 0 ? -1 : 1;
    this.t = 0; this.env = 0; this.started = false; this.ending = false; this.endT = 0; this.dead = false;
    this.lbSet = 0; this.rollSet = 0; this.kick = null;
    this.maxDur = o.maxDur ?? (this.awaken ? 9 : 5);
    this.emitDur = o.dur ?? (this.awaken ? 2.0 : 1.3);
    this.sawCut = false; this.noCut = 0; this.finalAt = null; this.finals = 0; this.ghostAt = -9; this.bt = -9; this.bn = 0;
    const E = this.T.element, fq = w.fx?.quality ?? 1;
    this.aura = auraOf(this.classId, this.charId, this.accent);
    this.elemN = Math.round(E.n * fq); this.backN = Math.round(E.back * fq); this.elemDone = 0; this.backDone = 0;
    this.cx = this.p?.cx ?? 0; this.cy = this.p?.cy ?? 0; this.ph = this.p?.h ?? 64;
    this.tex = Q[this.q].layer && o.lines !== false ? layerFor(this.tier, this.color, this.accent) : null;
    this.name = this.makeName();
    this.ov = addOv(w, { draw: (ctx, vw, vh) => this.draw(ctx, vw, vh), update: (dt) => this.update(dt) });
    ULTFX_STATS.sessions++;
  }
  makeName() {
    const o = this.o;
    if (o.name === false || (this.awaken && o.name == null)) return null;
    const base = typeof o.name === 'string' ? o.name : CHARACTERS[this.charId]?.ult?.name;
    if (!base) return null;
    const N = this.T.name, cls = CLASSES[this.classId];
    const text = N.prefix && cls?.name ? `${cls.name} · ${base}` : base;
    return { text, size: N.size, style: N.style, drips: N.drips, w: text.length * N.size * 0.8, t0: 0.04, dur: 1.55 };
  }
  start() {
    this.started = true;
    const cam = this.w.camera, T = this.T, o = this.o;
    if (o.zoom !== false && typeof cam?.zoomPulse === 'function') {
      const z = typeof o.zoom === 'number' ? o.zoom : T.zoom;
      cam.zoomPulse(z, T.zin, T.zhold + (o.zoomHold ?? 0), T.zout);
    }
  }
  update(dt) {
    if (this.dead) { if (this.ov) this.ov.dead = true; return; }
    const w = this.w, p = this.p;
    if (!this.started) this.start();
    this.t += dt;
    if (p && !p.hidden && !p.dead) { this.cx = p.cx; this.cy = p.cy; this.dir = (p.facing ?? 1) < 0 ? -1 : 1; this.ph = p.h ?? this.ph; }
    if (p?.dead) { this.finish(true); return; }
    const kin = ease.outCubic(clamp(this.t / 0.15, 0, 1));
    const kout = this.ending ? 1 - clamp((this.t - this.endT) / OUT, 0, 1) : 1;
    this.env = kin * kout;
    // end() 를 부르지 않은 연출도 정리: 연출(cutscene)이 풀리고 0.25초, 또는 최대 시간
    if (w.cutscene) { this.sawCut = true; this.noCut = 0; } else if (this.sawCut && !this.ending && (this.noCut += dt) > 0.25) this.finish();
    if (!this.ending && this.t > this.maxDur) this.finish();
    this.tickLetterbox();
    this.tickRoll(dt);
    this.tickElement();
    this.tickGhost();
    if (this.ending && this.t - this.endT >= Math.max(OUT, this.T.lbSlide)) this.kill();
  }
  tickLetterbox() {
    const T = this.T, w = this.w;
    if (!(T.letterbox > 0) || this.awaken || this.o.letterbox === false) return;
    const s = T.lbSlide || 0.15;
    const kin = ease.outCubic(clamp(this.t / s, 0, 1)), kout = this.ending ? 1 - ease.inCubic(clamp((this.t - this.endT) / s, 0, 1)) : 1;
    const v = T.letterbox * kin * kout, cur = w.letterbox || 0;
    // 다른 연출(각성)이 더 크게 잡고 있으면 건드리지 않는다
    if (Math.abs(cur - this.lbSet) < 0.6 || cur < v) { w.letterbox = v; this.lbSet = v; }
  }
  tickRoll(dt) {
    const cam = this.w.camera;
    if (!cam || !('roll' in cam)) return;
    let r = 0;
    if (!calm() && this.q !== 'low') {
      r = (this.T.roll || 0) * this.dir * this.env;
      const k = this.kick;
      if (k) { k.t += dt; if (k.t > 0.7) this.kick = null; else r += k.a * Math.exp(-k.t * 5.5) * Math.cos(k.t * 16); }
    }
    if (Math.abs((cam.roll || 0) - this.rollSet) < 1e-4) { cam.roll = r; this.rollSet = r; }
  }
  tickElement() {
    if (this.ending || !this.aura || !this.p) return;
    const w = this.w, fx = w.fx;
    if (!fx) return;
    const u = clamp(this.t / this.emitDur, 0, 1);
    let want = Math.floor(this.elemN * u) - this.elemDone;
    while (want-- > 0) { this.elemDone++; if (emitOK(w, this.awaken)) emitAura(fx, this.aura, this.cx, this.cy); }
    let wb = Math.floor(this.backN * u) - this.backDone;
    while (wb-- > 0) {
      this.backDone++;
      if (!emitOK(w, this.awaken)) continue;
      const g = glowSprite(this.aura.color), a = rand(0, TAU), r = rand(40, 220);
      if (g) fx.sprite(g, this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r * 0.6, { size: rand(16, 34), life: rand(0.9, 1.6), s0: 0.6, s1: 1, alpha: 0.5, layer: 'back', vy: -rand(20, 70), vx: rand(-25, 25) });
    }
  }
  tickGhost() {
    if (this.T.ghosts <= 0 || this.ending) return;
    const p = this.p;
    if (!p || p.hidden || p.dead) return;
    if (Math.hypot(p.vx || 0, p.vy || 0) < 380) return;
    afterimageImpl(this.w, p, null, {});
  }
  draw(ctx, vw, vh) {
    if (!this.started || this.dead) return;
    const imp = this.w.__ultImpact;
    if (this.tex && !(imp && !imp.dead)) this.drawLayer(ctx, vw, vh);
    if (this.name) this.drawName(ctx, vw, vh);
  }
  drawLayer(ctx, vw, vh) {
    let a = this.env;
    if (this.finalAt != null && this.q === 'medium') a *= 1 - clamp((this.t - this.finalAt) / 0.12, 0, 1);   // medium: 마무리 번쩍임과 겹치지 않게 (화면 전체 층 ≤ 2)
    if (a < 0.01) return;
    const cam = this.w.camera;
    const sp = cam?.toScreen ? cam.toScreen(this.cx, this.cy - 10) : { x: vw / 2, y: vh / 2 };
    const cx = clamp(sp.x, vw * 0.25, vw * 0.75), cy = clamp(sp.y, vh * 0.25, vh * 0.75);
    const D = Math.hypot(Math.max(cx, vw - cx), Math.max(cy, vh - cy)) * 1.02;
    const spin = this.T.lines.spin && !calm() ? this.t * this.T.lines.spin * this.dir : 0;
    const rush = 1 + 0.35 * (1 - ease.outCubic(clamp(this.t / 0.35, 0, 1)));   // 시작할 때 선이 안쪽으로 몰려든다
    const S = D * rush;
    ctx.save();
    ctx.globalAlpha = a; ctx.globalCompositeOperation = 'source-over';
    ctx.translate(cx, cy); if (spin) ctx.rotate(spin);
    ctx.drawImage(this.tex, -S, -S, S * 2, S * 2);
    ctx.restore();
    ULTFX_STATS.layerFrames++;
  }
  drawName(ctx, vw, vh) {
    const N = this.name, t = this.t - N.t0;
    if (t < 0 || t > N.dur) return;
    const kout = this.ending ? 1 - clamp((this.t - this.endT) / OUT, 0, 1) : 1;
    const a = clamp(t / 0.12, 0, 1) * clamp((N.dur - t) / 0.3, 0, 1) * kout;
    if (a <= 0.01) return;
    const cam = this.w.camera;
    const sp = cam?.toScreen ? cam.toScreen(this.cx, this.cy - this.ph * 0.5 - 16) : { x: vw / 2, y: vh * 0.3 };
    const slide = (1 - ease.outCubic(clamp(t / 0.2, 0, 1))) * 70 * this.dir;
    const lb = this.w.letterbox || 0, half = Math.min(N.w / 2, vw / 2 - 20);
    const x = clamp(sp.x - slide, half + 14, vw - half - 14), y = clamp(sp.y - N.size * 0.7, lb + N.size * 0.8 + 6, vh - lb - N.size);
    if (this.tier >= 2) {
      const u = ease.outCubic(clamp((t - 0.05) / 0.25, 0, 1));
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = this.accent;
      ctx.fillRect(x - N.w / 2 * u, y + N.size * 0.55, N.w * u, 3);
      ctx.globalAlpha = 1;
    }
    try {
      const r = UI.bloodText(ctx, N.text, x, y, { size: N.size, style: N.style, drips: N.drips, align: 'center', baseline: 'middle', alpha: a, t, maxWidth: vw - 40 });
      if (r?.w) N.w = r.w;
    } catch (e) { this.name = null; console.warn('[ultfx] name', e); }
  }
  finish(quick = false) {
    if (this.dead) return;
    if (!this.ending) { this.ending = true; this.endT = this.t; }
    if (quick) this.kill();
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    if (this.ov) this.ov.dead = true;
    const w = this.w, cam = w.camera;
    if (this.lbSet > 0 && Math.abs((w.letterbox || 0) - this.lbSet) < 0.6) w.letterbox = 0;
    this.lbSet = 0;
    if (cam && this.rollSet !== 0 && Math.abs((cam.roll || 0) - this.rollSet) < 1e-4) cam.roll = 0;
    this.rollSet = 0;
    if (w.__ultfx === this) w.__ultfx = null;
  }
}

// ── 속성 입자층 (look.aura.type) ──
function emitAura(fx, aura, cx, cy) {
  const a = rand(0, TAU), r = rand(26, 130), x = cx + Math.cos(a) * r, y = cy + 10 + Math.sin(a) * r * 0.7, c = aura.color;
  switch (aura.type) {
    case 'fire': fx.emit(Math.random() < 0.7 ? 'fire' : 'ember', x, y, { color: c, angle: -Math.PI / 2, spread: 0.9, speed: 120 }); break;
    case 'ice': fx.emit('ice', x, y - 40, { color: c, speed: 90, grav: 240 }); break;
    case 'thunder': fx.emit('thunder', x, y, { color: c, speed: 420 }); break;
    case 'dark': fx.emit(Math.random() < 0.6 ? 'dark' : 'magic', x, y, { color: c, angle: -Math.PI / 2, spread: 1.2, speed: 70 }); break;
    case 'blood': fx.emit(Math.random() < 0.5 ? 'bloodmist' : 'ember', x, y, { color: c, angle: -Math.PI / 2, spread: 1.2, speed: 60 }); break;
    default: fx.emit('holy', x, y, { color: c, angle: -Math.PI / 2, spread: 1.4, speed: 140 });
  }
}

// ═══════════════════════════ 임팩트 프레임 ═══════════════════════════
/** 다른 곳의 화면 번쩍임을 잠시 치운다 (검정 화면이 흰 번쩍임에 씻기지 않게). 끝나면 되돌린다 */
function deferGameFlash(w, im) {
  const F = w.game?.flashFx;
  if (F && F.a > 0.001) {
    if (!im.defer || F.a > im.defer.a) im.defer = { color: F.color, a: F.a, decay: F.decay };
    F.a = 0;
    ULTFX_STATS.deferredFlash++;
  }
}
function startImpact(w, o, cx, cy) {
  const fk = flashK();
  if (!(fk > 0) || !w) return false;
  const prev = w.__ultImpact;
  if (prev && !prev.dead) return false;
  const im = { w, t: 0, q: qk(w), fk, fg: o.impactFg ?? '#ffffff', bg: o.impactBg ?? '#000000', cx, cy, sil: null, nA: 0, drawnB: false, defer: null, flash: o.flash ?? null, dead: false, ov: null };
  im.ov = addOv(w, {
    update(dt) { im.t += dt; if (im.drawnB || im.t > 0.3) endImpact(im); },
    draw(ctx, vw, vh) { drawImpact(im, ctx, vw, vh); },
  });
  if (!im.ov) return false;
  w.__ultImpact = im;
  ULTFX_STATS.impactFrames++;
  deferGameFlash(w, im);
  return true;
}
function endImpact(im) {
  if (im.dead) return;
  im.dead = true;
  if (im.ov) im.ov.dead = true;
  const w = im.w;
  if (w.__ultImpact === im) w.__ultImpact = null;
  const F = w.game?.flashFx;
  if (im.defer && F && im.defer.a > F.a) { F.color = im.defer.color; F.a = im.defer.a; F.decay = im.defer.decay; }
  if (im.flash) w.game?.flash?.(im.flash.color, im.flash.a, im.flash.decay);
}
/** 실루엣으로 다시 그릴 개체: 플레이어 + 마무리 지점에 가까운 적·보스 (최대 8; 다시 그리는 비용 상한) */
function silList(w, cx, cy) {
  const cam = w.camera, out = [];
  for (const e of w.entities ?? []) {
    if (!e || e.dead || e.hidden) continue;
    if (e.kind !== 'player' && e.kind !== 'enemy' && e.kind !== 'boss') continue;
    if (cam && !cam.visible(e.x, e.y, e.w, e.h, 40)) continue;
    if (w.inUnrevealedFake?.(e)) continue;
    out.push(e);
  }
  const d = (e) => (e.kind === 'player' ? -1 : e.kind === 'boss' ? 0 : Math.hypot(e.cx - cx, e.cy - cy));
  if (out.length > 8) { out.sort((a, b) => d(a) - d(b)); out.length = 8; }
  out.sort((a, b) => a.z - b.z);
  return out;
}
/** 실루엣 캔버스: 개체를 한 번 다시 그려 흰색으로 물들이고, 방사선과 검정 바탕을 뒤에 깐다 (본 화면에는 1회 그리기) */
function bakeSilhouettes(w, vw, vh, im) {
  const c = POOL.sil;
  if (!c) return null;
  const k = Q[im.q].sil || 0.5, W = Math.ceil(vw * k), H = Math.ceil(vh * k);
  if (c.width < W || c.height < H) { c.width = Math.max(c.width, W); c.height = Math.max(c.height, H); }
  const g = resetCtx(c);
  const cam = w.camera;
  g.save(); g.scale(k, k);
  try { cam?.apply?.(g); } catch { /* 카메라 없음 */ }
  for (const e of silList(w, im.cx, im.cy)) { try { e.draw(g, w); ULTFX_STATS.silDraws++; } catch { /* 한 개체 실패는 무시 */ } }
  g.restore();
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.shadowBlur = 0;
  g.globalCompositeOperation = 'source-in'; g.fillStyle = im.fg; g.fillRect(0, 0, W, H);
  // 실루엣 뒤: 방사 집중선 (마무리 지점으로 모인다) → 검정 바탕
  g.globalCompositeOperation = 'destination-over';
  const sp = cam?.toScreen ? cam.toScreen(im.cx, im.cy) : { x: vw / 2, y: vh / 2 };
  const px = clamp(sp.x, 0, vw) * k, py = clamp(sp.y, 0, vh) * k, R = Math.hypot(W, H);
  g.fillStyle = im.fg; g.globalAlpha = 0.34;
  g.beginPath();
  for (let i = 0; i < 48; i++) {
    const a = (i + Math.random() * 0.7) / 48 * TAU, r0 = R * (0.08 + Math.random() * 0.12), hw = (0.004 + Math.random() * 0.012);
    g.moveTo(px + Math.cos(a) * r0, py + Math.sin(a) * r0);
    g.lineTo(px + Math.cos(a - hw) * R, py + Math.sin(a - hw) * R); g.lineTo(px + Math.cos(a + hw) * R, py + Math.sin(a + hw) * R); g.closePath();
  }
  g.fill();
  g.globalAlpha = 1; g.fillStyle = im.bg; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  return { W, H };
}
function drawImpact(im, ctx, vw, vh) {
  if (im.dead) return;
  deferGameFlash(im.w, im);   // 같은 프레임에 들어온 번쩍임도 뒤로 미룬다
  const phaseA = im.nA === 0 || (!im.drawnB && im.t < 1.4 / 60 && im.nA < 3);
  if (phaseA) {
    im.nA++;
    if (im.q === 'low' || !POOL.sil) {
      ctx.globalAlpha = 0.75 * im.fk; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, vw, vh);
      ULTFX_STATS.whiteFrames++;
      return;
    }
    if (!im.sil) im.sil = bakeSilhouettes(im.w, vw, vh, im);
    if (im.sil) {
      ctx.globalAlpha = im.fk >= 1 ? 1 : 0.65; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(POOL.sil, 0, 0, im.sil.W, im.sil.H, 0, 0, vw, vh);
      ULTFX_STATS.silFrames++;
    }
    return;
  }
  if (im.drawnB) return;
  im.drawnB = true;
  if (im.q !== 'low' && Q[im.q].diff && im.fk >= 1) {
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, vw, vh);
    ULTFX_STATS.diffFrames++;
  } else {
    ctx.globalAlpha = 0.4 * im.fk; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, vw, vh);
    ULTFX_STATS.whiteFrames++;
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
/** 세션 없이 마무리만 불렸을 때의 기울기 반동 */
function rollKickAlone(w, a) {
  const cam = w.camera;
  if (!cam || !('roll' in cam) || calm() || qk(w) === 'low' || !a) return;
  let set = 0, t = 0;
  addOv(w, {
    life: 0.75,
    update(dt) {
      t += dt;
      if (Math.abs((cam.roll || 0) - set) > 1e-4) { this.dead = true; return; }
      set = t >= 0.7 ? 0 : a * Math.exp(-t * 5.5) * Math.cos(t * 16);
      cam.roll = set;
    },
    draw() {},
  });
}

// ═══════════════════════════ 직업 장식 24종 (feel §5.2) ═══════════════════════════
function fctx(w, s, classId, x, y, o) {
  const def = ULT_FLOURISH[classId], p = w.player ?? null;
  let foes = null;
  return {
    w, s, p, classId, x, y, o, def, c: def.colors, q: qk(w), qf: w.fx?.quality ?? 1, aw: s?.awaken ?? !!w.hudHidden,
    cam: w.camera, dir: (p?.facing ?? 1) < 0 ? -1 : 1,
    get foes() { return foes ?? (foes = foesNear(w, x, y, o, 8)); },
    get ground() { const g = groundBelow(w, x, y - 10, 8 * TILE); return g ?? (p ? p.bottom : y); },
  };
}
function fireBlast(w, x, y, big, aw) {
  const g = glowSprite('#ff7a2a');
  if (g) w.fx.sprite(g, x, y, { size: big ? 260 : 130, life: big ? 0.3 : 0.2, s0: 0.3, s1: 1.2 });
  w.fx.ring(x, y, { color: '#ffb040', r0: 8, r1: big ? 140 : 70, life: 0.3, width: big ? 10 : 6 });
  burstN(w, 'fire', x, y, big ? 12 : 6, { speed: big ? 300 : 200 }, aw);
  burstN(w, 'ember', x, y, big ? 8 : 3, { speed: 260 }, aw);
  burstN(w, 'smoke', x, y - 10, big ? 3 : 1, { speed: 60 }, aw);
}
/** 낙뢰 한 줄기 (하늘 → x1,y1) */
function lightning(w, x0, y0, x1, y1, col, life = 0.18, wd = 3.5, aw = false, branches = 2) {
  const mk = () => {
    const P = boltPts(x0, y0, x1, y1, 10, 30), B = [];
    for (let i = 0; i < branches; i++) {
      const k = 2 + Math.floor(Math.random() * 6) * 2, bx = P[k], by = P[k + 1], a = Math.atan2(y1 - y0, x1 - x0) + rand(-0.9, 0.9), L = rand(40, 110);
      B.push(boltPts(bx, by, bx + Math.cos(a) * L, by + Math.sin(a) * L, 5, 14));
    }
    return { P, B };
  };
  let cur = mk(), at = 0;
  const g = glowSprite(col);
  if (g) w.fx.sprite(g, x1, y1, { size: 150 * (wd / 3.5), life: 0.2, s0: 0.4, s1: 1.2 });
  burstN(w, 'thunder', x1, y1, 6, { color: col, speed: 420 }, aw);
  return spawn(w, {
    life, z: 13,
    tick(e) { if (e.lt - at > 0.045) { at = e.lt; cur = mk(); } },
    draw(ctx, e) {
      const a = 1 - e.lt / life;
      drawBolt(ctx, cur.P, col, wd, a);
      for (const b of cur.B) drawBolt(ctx, b, col, wd * 0.5, a * 0.8);
    },
  });
}

const FL = {
  // ── 카엘 ──
  kael_templar: {
    final(F) {
      const { w, x, y } = F, img = spriteOf('shield'), ring = HFX.ring?.(F.c[0]), gl = glowSprite(F.c[0]);
      sfx('seal_stamp', { vol: 0.9 }); sfx('bell', { pitch: 0.8, vol: 0.6 });
      let hit = false;
      spawn(w, {
        life: 1.55, z: 13,
        tick(e, ww) {
          if (!hit && e.lt >= 0.1) {
            hit = true;
            ww.fx.ring(x, y, { color: F.c[0], r0: 40, r1: 280, life: 0.45, width: 14 });
            burstN(ww, 'holy', x, y, 18, { color: F.c[0], speed: 420 }, F.aw);
            ww.camera?.kick?.(0, 7);
          }
        },
        draw(ctx, e) {
          const t = e.lt, k = t < 0.1 ? ease.inCubic(t / 0.1) : 1;
          const wob = t > 0.1 ? 1 + 0.05 * Math.sin((t - 0.1) * 20) * Math.exp(-(t - 0.1) * 6) : 1;
          const sc = lerp(2.6, 1, k) * wob, fade = clamp((1.55 - t) / 0.4, 0, 1), a = (t < 0.1 ? k : 1) * fade;
          blit(ctx, gl, x, y, 1.9 * sc * (0.92 + 0.08 * Math.sin(t * 9)), 0, 0.75 * a, true);
          if (ring) { blit(ctx, ring, x, y, 2.5 * sc, t * 0.8, 0.8 * a, true); blit(ctx, ring, x, y, 3.3 * sc, -t * 0.5, 0.45 * a, true); }
          rays(ctx, x, y, 12, 110 * sc, 330 * sc * (0.9 + 0.1 * Math.sin(t * 7)), t * 0.5, F.c[1], 0.4 * a, 0.035);
          blit(ctx, img, x, y, 0.95 * sc, 0, a, false);
          if (t < 0.3) blit(ctx, img, x, y, 0.95 * sc, 0, (0.3 - t) / 0.3 * 0.85, true);
        },
      });
    },
  },
  kael_inquisitor: {
    final(F) {
      const { w } = F, img = spriteOf('brand'), gl = glowSprite(F.c[0]);
      const pts = (F.foes.length ? F.foes.map((e) => ({ e, x: e.cx, y: e.cy })) : [-1, 0, 1].map((i) => ({ e: null, x: F.x + i * 130, y: F.y }))).map((pt, i) => ({ ...pt, t0: i * 0.05, lit: false }));
      sfx('fire', { vol: 0.9, pitch: 0.8 });
      spawn(w, {
        life: 1.5, z: 13,
        tick(e, ww) {
          for (const pt of pts) {
            if (pt.e && !pt.e.dead) { pt.x = pt.e.cx; pt.y = pt.e.cy - (pt.e.h ?? 40) * 0.1; }
            if (!pt.lit && e.lt >= pt.t0) {
              pt.lit = true;
              ww.fx.ring(pt.x, pt.y, { color: F.c[0], r0: 10, r1: 90, life: 0.3, width: 8 });
              burstN(ww, 'fire', pt.x, pt.y, 8, { speed: 240 }, F.aw);
              const gy = groundBelow(ww, pt.x, pt.y, 6 * TILE);
              if (gy != null && Q[F.q].decals) HFX.stampDecal?.(ww, pt.x, gy - 6, 1, 'fire', { floor: true, scale: 1.5, life: 10 });
              if (pts.indexOf(pt) < 2) sfx('holywater_burn', { vol: 0.6 });
            }
            if (pt.lit && e.lt < 1.2 && Math.random() < 0.3 && emitOK(ww, F.aw)) ww.fx.emit('fire', pt.x + rand(-14, 14), pt.y - rand(0, 30), { angle: -Math.PI / 2, spread: 0.4, speed: 90 });
          }
        },
        draw(ctx, e) {
          const fade = clamp((1.5 - e.lt) / 0.35, 0, 1);
          for (const pt of pts) {
            const t = e.lt - pt.t0;
            if (t < 0) continue;
            const k = ease.outBack(clamp(t / 0.12, 0, 1)), fl = 0.85 + 0.15 * Math.sin(e.lt * 40 + pt.x);
            blit(ctx, gl, pt.x, pt.y, 0.9 * k, 0, 0.6 * fade * fl, true);
            blit(ctx, img, pt.x, pt.y, lerp(1.8, 1, clamp(t / 0.12, 0, 1)) * 0.9, 0, fade * clamp(t / 0.12, 0, 1), false);
            blit(ctx, img, pt.x, pt.y, 0.9, 0, 0.35 * fade * fl, true);
          }
        },
      });
    },
  },
  kael_bloodhunter: {
    final(F) {
      const { w, x, y } = F, img = spriteOf('crescentR');
      const cuts = [{ t0: 0, a0: -2.2, a1: 0.6, sc: 1.25, fl: 1 }, { t0: 0.12, a0: 2.4, a1: -0.4, sc: 1.05, fl: -1 }, { t0: 0.24, a0: -0.9, a1: 1.9, sc: 1.45, fl: 1 }];
      sfx('slash_heavy', { pitch: 0.75 });
      spawn(w, {
        life: 1.25, z: 13,
        tick(e, ww) {
          for (const c of cuts) {
            if (c.done || e.lt < c.t0 + 0.2) continue;
            c.done = true;
            const n = room(ww, 14, F.aw);
            for (let i = 0; i < n; i++) {
              const u = i / Math.max(1, n), ang = lerp(c.a0, c.a1, 0.55 + 0.45 * u), r = 112 * c.sc;
              ww.fx.emit('blood', x + Math.cos(ang) * r, y + Math.sin(ang) * r, { angle: ang + (Math.PI / 2) * Math.sign(c.a1 - c.a0), spread: 0.35, speed: rand(260, 520) });
            }
            burstN(ww, 'bloodmist', x + Math.cos(c.a1) * 100, y + Math.sin(c.a1) * 100, 3, { speed: 40 }, F.aw);
            sfx('slash', { pitch: rand(0.8, 1.0), vol: 0.6 });
          }
        },
        draw(ctx, e) {
          for (const c of cuts) {
            const t = e.lt - c.t0;
            if (t < 0) continue;
            const u = ease.outCubic(clamp(t / 0.2, 0, 1)), fade = clamp(1 - (t - 0.2) / 0.55, 0, 1);
            if (fade <= 0) continue;
            for (let k = 4; k >= 0; k--) {
              const uu = Math.max(0, u - k * 0.09);
              blit(ctx, img, x, y, c.sc, lerp(c.a0, c.a1, uu), fade * (k ? 0.5 / (k + 0.6) : 1), true, 0.5, 0.5, c.sc * c.fl);
            }
          }
        },
      });
    },
  },
  kael_nightraven: {
    final(F) {
      const { w } = F, img = spriteOf('crow'), cam = w.camera, dir = F.dir;
      const n = Math.max(10, Math.round(26 * F.qf)), birds = [];
      for (let i = 0; i < n; i++) birds.push({ x0: -rand(20, 380), y: rand(0.08, 0.82), sp: rand(1050, 1500), s: rand(1.0, 1.8), ph: rand(0, TAU), bob: rand(10, 30), fr: rand(12, 18) });
      sfx('crow_caw', { vol: 0.9 }); sfx('bat', { pitch: 0.7, vol: 0.5 });
      let caw2 = false;
      const posOf = (b, t) => {
        const px = b.x0 + b.sp * t;
        return { px, X: dir > 0 ? cam.x + px : cam.x + cam.vw - px, Y: cam.y + b.y * cam.vh + Math.sin(t * 6 + b.ph) * b.bob };
      };
      spawn(w, {
        life: 1.7, z: 13,
        tick(e, ww) {
          if (!caw2 && e.lt > 0.35) { caw2 = true; sfx('crow_caw', { pitch: 1.25, vol: 0.6 }); }
          if (Math.random() < 0.5 && emitOK(ww, F.aw)) {
            const b = birds[(Math.random() * birds.length) | 0], P = posOf(b, e.lt);
            if (P.px > 0 && P.px < cam.vw) ww.fx.emit('feather', P.X, P.Y, { color: '#1a1830', speed: 40 });
          }
        },
        draw(ctx, e) {
          const t = e.lt;
          for (const b of birds) {
            const P = posOf(b, t);
            if (P.px < -80 || P.px > cam.vw + 120) continue;
            const f = Math.floor(t * b.fr + b.ph) & 1;
            drawFrame(ctx, img, f, 2, P.X, P.Y, b.s * dir, b.s, Math.cos(t * 6 + b.ph) * 0.12 * dir, 1, false);
          }
        },
      });
    },
  },
  // ── 세라 ──
  sera_saint: {
    final(F) {
      const { w, p } = F, img = spriteOf('wing'), gl = glowSprite(F.c[0]), cam = w.camera;
      sfx('choir_gate', { vol: 0.6 }); sfx('holy', { pitch: 0.8 });
      let burst = false, acc = 0;
      const root = () => ({ x: p ? p.cx - (p.facing ?? 1) * 4 : F.x, y: p ? p.y + (p.h ?? 64) * 0.3 : F.y });
      spawn(w, {
        life: 1.9, z: 9.5,
        tick(e, ww, dt) {
          const r = root();
          if (!burst && e.lt > 0.3) { burst = true; for (let i = 0, n = room(ww, 12, F.aw); i < n; i++) ww.fx.emit('feather', r.x + rand(-140, 140), r.y - rand(0, 80), { color: i % 3 ? '#fffaf0' : '#ffe7a0', speed: 120 }); }
          acc += dt * 24;
          while (acc >= 1) { acc--; if (!emitOK(ww, F.aw) || e.lt > 1.4) continue; ww.fx.emit('feather', cam.x + rand(0, cam.vw), cam.y - 8, { color: Math.random() < 0.7 ? '#fffaf0' : '#ffe7a0', speed: 20, vy: rand(50, 100), grav: 50 }); }
        },
        draw(ctx, e) {
          const t = e.lt, open = ease.outBack(clamp(t / 0.38, 0, 1)), fade = clamp((1.9 - t) / 0.45, 0, 1) * clamp(t / 0.08, 0, 1), r = root();
          const flap = Math.sin(t * 7) * 0.07 * open;
          blit(ctx, gl, r.x, r.y, 1.5 + 0.3 * open, 0, 0.55 * fade, true);
          for (const side of [-1, 1]) {
            ctx.save(); ctx.translate(r.x + side * 6, r.y); ctx.scale(side, 1); ctx.rotate(lerp(1.1, -0.2, open) + flap);
            blit(ctx, img, 0, 0, 0.9, 0, fade, false, 22 / 256, 178 / 200);
            blit(ctx, img, 0, 0, 0.9, 0, 0.3 * fade, true, 22 / 256, 178 / 200);
            ctx.restore();
          }
        },
      });
    },
  },
  sera_oracle: {
    final(F) {
      const { w, x, y } = F, img = spriteOf('clock'), gl = glowSprite(F.c[0]), ticks = [0.2, 0.38, 0.56, 0.74];
      let i = 0;
      spawn(w, {
        life: 1.55, z: 13,
        tick(e, ww) {
          while (i < ticks.length && e.lt >= ticks[i]) {
            const k = i++;
            sfx('clock_tick', { pitch: 1 + k * 0.08, vol: 0.9 });
            ww.fx.ering(x, y, { color: F.c[0], r0: 40 + k * 30, r1: 180 + k * 90, ry: 0.5, life: 0.4, width: 6 });
            ww.fx.ring(x, y, { color: '#e8fbff', r0: 20, r1: 150 + k * 60, life: 0.3, width: 3 });
            burstN(ww, 'ice', x, y, 6, { speed: 260 }, F.aw);
            if (k === ticks.length - 1) {
              ww.fx.ring(x, y, { color: F.c[0], r0: 60, r1: (ww.camera?.vw ?? 960) * 0.75, life: 0.6, width: 16 });
              sfx('ice', { pitch: 0.7 });
              for (const f of F.foes) {
                burstN(ww, 'ice', f.cx, f.cy, 6, { speed: 200 }, F.aw);
                const gy = groundBelow(ww, f.cx, f.cy, 6 * TILE);
                if (gy != null && Q[F.q].decals) HFX.stampDecal?.(ww, f.cx, gy - 6, 1, 'frost', { floor: true, scale: 1.4, life: 10 });
              }
            }
          }
        },
        draw(ctx, e) {
          const t = e.lt, app = ease.outBack(clamp(t / 0.18, 0, 1)), fade = clamp((1.55 - t) / 0.4, 0, 1), a = clamp(t / 0.18, 0, 1) * fade, R = 150 * app;
          blit(ctx, gl, x, y, 1.7 * app, 0, 0.45 * a, true);
          blit(ctx, img, x, y, 1.25 * app, t * 0.25, a, true);
          let k = 0; while (k < ticks.length && t >= ticks[k]) k++;
          const since = k ? t - ticks[k - 1] : 1, over = since < 0.08 ? Math.sin(since / 0.08 * Math.PI) * 0.12 : 0;
          const mA = -Math.PI / 2 + k * (TAU / 12) + over, hA = -Math.PI / 2 + k * (TAU / 48);
          ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = F.c[1]; ctx.lineCap = 'round';
          ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(mA) * R * 0.78, y + Math.sin(mA) * R * 0.78); ctx.stroke();
          ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(hA) * R * 0.5, y + Math.sin(hA) * R * 0.5); ctx.stroke();
          if (k >= ticks.length) { const u = clamp((t - ticks[ticks.length - 1]) / 0.5, 0, 1); ctx.globalAlpha = (1 - u) * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, R * (1 + u * 0.4), 0, TAU); ctx.stroke(); }
        },
      });
    },
  },
  sera_archmage: {
    final(F) {
      const { w, x, y } = F;
      const rings = [['ringF', F.c[0], 'fire', 1, 1, 0.34], ['ringI', F.c[1], 'ice', -1, 0.34, 1], ['ringT', F.c[2], 'thunder', 1, 1, 1]]
        .map(([n, c, pt, sd, sx, sy], i) => ({ img: spriteOf(n), c, pt, sd, sx, sy, t0: i * 0.1, done: false }));
      const gl = glowSprite('#ffffff');
      spawn(w, {
        life: 1.3, z: 13,
        tick(e, ww) {
          for (const r of rings) {
            if (r.done || e.lt < r.t0) continue;
            r.done = true;
            sfx(r.pt, { vol: 0.55 });
            const n = room(ww, 12, F.aw);
            for (let i = 0; i < n; i++) { const a = i / n * TAU; ww.fx.emit(r.pt, x + Math.cos(a) * 120 * r.sx, y + Math.sin(a) * 120 * r.sy, { angle: a, spread: 0.3, speed: 220, color: r.c }); }
          }
        },
        draw(ctx, e) {
          for (const r of rings) {
            const t = e.lt - r.t0;
            if (t < 0) continue;
            const g = ease.outCubic(clamp(t / 0.7, 0, 1)), sc = lerp(0.35, 1.9, g), a = clamp(t / 0.06, 0, 1) * clamp((1.25 - e.lt) / 0.45, 0, 1);
            ctx.save(); ctx.translate(x, y); ctx.scale(r.sx, r.sy);
            blit(ctx, r.img, 0, 0, sc, r.sd * t * 2.4, a, true);
            ctx.restore();
          }
          blit(ctx, gl, x, y, 1.1 + 0.2 * Math.sin(e.lt * 18), 0, clamp(1 - e.lt / 0.8, 0, 1) * 0.8, true);
        },
      });
    },
  },
  sera_stormcaller: {
    beat(F, bx, by) {
      const cam = F.cam;
      lightning(F.w, bx + rand(-90, 90), (cam?.y ?? by - 400) - 20, bx, by, F.c[0], 0.18, 3, F.aw, 1);
      sfx('thunder', { vol: 0.45, pitch: rand(1.0, 1.25) });
    },
    final(F) {
      const { w, x, y } = F, cam = w.camera;
      const tg = F.foes.length ? F.foes.map((e) => [e.cx, e.cy]) : [];
      while (tg.length < 6) { const px = cam.x + cam.vw * rand(0.1, 0.9); tg.push([px, groundBelow(w, px, y, 10 * TILE) ?? y]); }
      sfx('thunderclap', { vol: 1 }); sfx('thunder', { pitch: 0.7 });
      let i = 0, arcAt = 0, arcs = [];
      spawn(w, {
        life: 0.95, z: 13,
        tick(e, ww) {
          while (i < 6 && e.lt >= i * 0.025) { const [tx, ty] = tg[i]; lightning(ww, tx + rand(-120, 120), cam.y - 30, tx, ty, i % 2 ? F.c[0] : F.c[2], 0.32, 5, F.aw, 2); i++; }
          if (e.lt - arcAt > 0.05) {
            arcAt = e.lt; arcs = [];
            for (let k = 0; k < 4; k++) { const a0 = rand(0, TAU), a1 = a0 + rand(0.6, 1.6), r0 = rand(40, 150), r1 = rand(40, 150); arcs.push(boltPts(x + Math.cos(a0) * r0, y + Math.sin(a0) * r0, x + Math.cos(a1) * r1, y + Math.sin(a1) * r1, 6, 16)); }
          }
        },
        draw(ctx, e) { const a = clamp(1 - e.lt / 0.95, 0, 1); for (const P of arcs) drawBolt(ctx, P, F.c[0], 2, a); },
      });
    },
  },
  // ── 빅터 ──
  victor_phantom: {
    final(F) {
      const { w, x, y } = F, cam = w.camera, tg = F.foes, gl = glowSprite(F.c[0]), st = HFX.star?.(F.c[0]);
      const SPD = 2800, shots = [];
      for (let i = 0; i < 7; i++) {
        const e = tg.length ? tg[i % tg.length] : null, tx = e ? e.cx : x + rand(-160, 160), ty = e ? e.cy : y + rand(-100, 100);
        const ang = (i % 2 ? Math.PI : 0) + rand(-0.35, 0.35), L = cam.vw * 1.6;
        shots.push({ t0: i * 0.07, sx: tx - Math.cos(ang) * L * 0.5, sy: ty - Math.sin(ang) * L * 0.5, ang, L, tx, ty, hit: false, fired: false });
      }
      sfx('ghost', { vol: 0.6 });
      spawn(w, {
        life: 1.25, z: 13,
        tick(e, ww) {
          for (const s of shots) {
            const t = e.lt - s.t0;
            if (t < 0) continue;
            if (!s.fired) { s.fired = true; sfx('gun', { pitch: 1.5, vol: 0.45 }); }
            if (!s.hit && t * SPD >= s.L * 0.5) {
              s.hit = true;
              if (st) ww.fx.sprite(st, s.tx, s.ty, { size: 150, angle: rand(0, TAU), life: 0.18, s0: 0.3, s1: 1.2 });
              ww.fx.ring(s.tx, s.ty, { color: F.c[0], r0: 6, r1: 80, life: 0.25, width: 5 });
              burstN(ww, 'thunder', s.tx, s.ty, 5, { color: F.c[1], speed: 380 }, F.aw);
            }
          }
        },
        draw(ctx, e) {
          for (const s of shots) {
            const t = e.lt - s.t0;
            if (t < 0) continue;
            const d = t * SPD;
            if (d > s.L + 520) continue;
            const hd = Math.min(d, s.L), tl = Math.max(0, d - 520), c = Math.cos(s.ang), sn = Math.sin(s.ang);
            const hx = s.sx + c * hd, hy = s.sy + sn * hd, tx0 = s.sx + c * tl, ty0 = s.sy + sn * tl;
            const fade = d > s.L ? clamp(1 - (d - s.L) / 520, 0, 1) : 1;
            taper(ctx, tx0, ty0, hx, hy, 12, F.c[2], 0.35 * fade);
            taper(ctx, tx0, ty0, hx, hy, 6, F.c[0], 0.7 * fade);
            taper(ctx, tx0 + c * 200, ty0 + sn * 200, hx, hy, 2.2, '#ffffff', 0.95 * fade);
            if (d <= s.L) blit(ctx, gl, hx, hy, 0.4, 0, fade, true);
          }
        },
      });
    },
  },
  victor_executioner: {
    final(F) {
      const { w } = F, img = spriteOf('skullx'), gr = glowSprite('#ff2030'), st = HFX.star?.('#ffffff');
      const pts = (F.foes.length ? F.foes : [null]).map((e, i) => ({ e, x: e ? e.cx : F.x, y: e ? e.cy : F.y, t0: i * 0.05, boom: false }));
      const EXE = 0.55;
      let flashed = false;
      sfx('cylinder_spin', { vol: 0.8 });
      spawn(w, {
        life: 1.3, z: 13,
        tick(e, ww) {
          for (const pt of pts) {
            if (pt.e && !pt.e.dead) { pt.x = pt.e.cx; pt.y = pt.e.cy; }
            if (!pt.boom && e.lt >= EXE + pt.t0 * 0.4) {
              pt.boom = true;
              if (gr) ww.fx.sprite(gr, pt.x, pt.y, { size: 230, life: 0.25, s0: 0.3, s1: 1.2 });
              if (st) ww.fx.sprite(st, pt.x, pt.y, { size: 130, angle: Math.PI / 4, life: 0.16, s0: 0.3, s1: 1.2 });
              ww.fx.ring(pt.x, pt.y, { color: F.c[0], r0: 10, r1: 110, life: 0.3, width: 8 });
              burstN(ww, 'blood', pt.x, pt.y, 12, { speed: 360 }, F.aw);
            }
          }
          if (!flashed && e.lt >= EXE) {
            flashed = true;
            ww.game?.flash?.('#ff1020', 0.45, 4);
            sfx('gun', { pitch: 0.55, vol: 1 }); sfx('crit', { pitch: 0.6 });
            ww.camera?.addTrauma?.(0.4);
          }
        },
        draw(ctx, e) {
          const fade = clamp((1.3 - e.lt) / 0.3, 0, 1);
          for (const pt of pts) {
            const t = e.lt - pt.t0;
            if (t < 0) continue;
            const lock = ease.outCubic(clamp(t / 0.28, 0, 1)), sc = lerp(2.4, 1, lock), rot = (1 - lock) * 2.4;
            const boomK = e.lt >= EXE ? clamp(1 - (e.lt - EXE) / 0.3, 0, 1) : 0;
            blit(ctx, img, pt.x, pt.y, sc * (1 + boomK * 0.3), rot, fade * (0.4 + 0.6 * lock), false);
            if (boomK > 0) blit(ctx, img, pt.x, pt.y, sc * (1 + boomK * 0.3), rot, boomK, true);
            else if (lock >= 1 && (Math.floor(e.lt * 16) & 1)) blit(ctx, img, pt.x, pt.y, sc, rot, 0.4 * fade, true);
          }
        },
      });
    },
  },
  victor_hellfire: {
    beat(F, bx, by) { fireBlast(F.w, bx, by, false, F.aw); },
    final(F) {
      const { w, x, y } = F, pts = F.foes.map((e) => [e.cx, e.cy]);
      for (let i = 0; i < 4; i++) pts.push([x + rand(-220, 220), y + rand(-90, 60)]);
      let i = 0;
      spawn(w, {
        life: 0.9, z: 13,
        tick(e, ww) {
          while (i < pts.length && e.lt >= i * 0.06) {
            const [px, py] = pts[i];
            fireBlast(ww, px, py, true, F.aw);
            if (i < 3) sfx('explode', { vol: 0.7, pitch: rand(0.8, 1.0) });
            const gy = groundBelow(ww, px, py, 6 * TILE);
            if (gy != null && Q[F.q].decals && i % 2 === 0) HFX.stampDecal?.(ww, px, gy - 6, 1, 'fire', { floor: true, scale: 1.4, life: 10 });
            i++;
          }
        },
      });
    },
  },
  victor_gunlord: {
    final(F) {
      const { w, p } = F, img = spriteOf('muzzle'), gl = glowSprite(F.c[0]), cam = w.camera, flashes = [0, 0.08, 0.16, 0.24];
      let i = 0, cas = 0, tink = 0;
      const gun = (front) => ({ x: p ? p.cx + (front ? p.facing * 44 : -p.facing * 34) : F.x, y: p ? p.bottom - (front ? 60 : 56) : F.y, d: (front ? 1 : -1) * (p?.facing ?? 1) });
      spawn(w, {
        life: 1.35, z: 13,
        tick(e, ww, dt) {
          while (i < flashes.length && e.lt >= flashes[i]) {
            sfx('gun', { pitch: 1 + i * 0.05, vol: 0.7 });
            for (const front of [true, false]) {
              const g = gun(front);
              for (let k = 0, n = room(ww, 3, F.aw); k < n; k++) ww.fx.emit('shard', g.x, g.y, { color: F.c[0], size: rand(3, 4.5), speed: 0, vx: -g.d * rand(60, 180), vy: -rand(260, 420), life: rand(0.8, 1.2) });
            }
            i++;
          }
          cas += dt * 64;
          while (cas >= 1) {
            cas--;
            if (e.lt > 0.8 || !emitOK(ww, F.aw)) continue;
            ww.fx.emit(Math.random() < 0.25 ? 'gold' : 'shard', cam.x + rand(0, cam.vw), cam.y - 10, { color: Math.random() < 0.5 ? F.c[0] : F.c[1], size: rand(4.5, 7), speed: 0, vx: rand(-40, 40), vy: rand(100, 360), life: rand(0.9, 1.4) });
          }
          if (tink < 2 && e.lt > 0.5 + tink * 0.25) { tink++; sfx('coin', { pitch: 1.6, vol: 0.4 }); }
        },
        draw(ctx, e) {
          for (let k = 0; k < flashes.length; k++) {
            const t = e.lt - flashes[k];
            if (t < 0 || t > 0.07) continue;
            const a = 1 - t / 0.07;
            for (const front of [true, false]) {
              const g = gun(front);
              blit(ctx, gl, g.x, g.y, 0.9, 0, a, true);
              blit(ctx, img, g.x, g.y, 1.5 * g.d, (k & 1 ? 0.12 : -0.08) * g.d, a, true, 14 / 200, 0.5, 1.5);
            }
          }
        },
      });
    },
  },
  // ── 브란 ──
  bran_guardian: {
    final(F) {
      const { w, p } = F, img = spriteOf('dome'), gl = glowSprite(F.c[0]), pulses = [0.35, 0.7];
      const bx = () => (p ? p.cx : F.x), by = () => (p ? p.bottom : F.y);
      sfx('holy', { pitch: 0.7, vol: 0.9 }); sfx('bell', { pitch: 0.8, vol: 0.6 });
      let i = 0;
      spawn(w, {
        life: 1.4, z: 13,
        tick(e, ww) {
          while (i < pulses.length && e.lt >= pulses[i]) {
            i++;
            ww.fx.ering(bx(), by(), { color: F.c[0], r0: 60, r1: 320, ry: 0.22, life: 0.45, width: 8 });
            for (let k = 0, n = room(ww, 10, F.aw); k < n; k++) { const a = Math.PI + rand(0, Math.PI); ww.fx.emit('holy', bx() + Math.cos(a) * 180, by() + Math.sin(a) * 240, { color: F.c[0], speed: 60 }); }
            sfx('holy', { pitch: 1.1, vol: 0.5 });
          }
        },
        draw(ctx, e) {
          const t = e.lt, grow = ease.outBack(clamp(t / 0.2, 0, 1));
          let pul = 0;
          for (const pt of pulses) { const u = t - pt; if (u >= 0 && u < 0.2) pul = Math.max(pul, Math.sin(u / 0.2 * Math.PI)); }
          const out = t > 0.95 ? ease.outCubic(clamp((t - 0.95) / 0.42, 0, 1)) : 0;
          const sc = 1.45 * grow * (1 + 0.1 * pul + 0.6 * out), a = clamp(t / 0.06, 0, 1) * (1 - out);
          blit(ctx, gl, bx(), by() - 70 * sc, 1.7 * sc, 0, 0.3 * a, true);
          blit(ctx, img, bx(), by() + 2, sc, 0, a * (0.85 + 0.15 * pul), true, 0.5, 1);
        },
      });
    },
  },
  bran_crusader: {
    final(F) {
      const { w, x, y } = F, img = spriteOf('crossR'), gy = F.ground, cam = w.camera;
      sfx('bell', { pitch: 0.6 }); sfx('explode', { pitch: 0.8, vol: 0.7 });
      let echo = false;
      spawn(w, {
        life: 1.15, z: 13,
        tick(e, ww) {
          if (!echo && e.lt > 0.25) {
            echo = true;
            ww.fx.ering(x, gy, { color: F.c[2], r0: 20, r1: 420, ry: 0.16, life: 0.5, width: 10 });
            for (const s of [-1, 1]) for (let k = 0, n = room(ww, 6, F.aw); k < n; k++) ww.fx.emit('dust', x + s * rand(20, 80), gy - 6, { angle: s > 0 ? 0 : Math.PI, spread: 0.2, speed: rand(300, 520), vy: -20 });
            sfx('slash_heavy', { pitch: 0.6, vol: 0.7 });
          }
        },
        draw(ctx, e) {
          const t = e.lt, stamp = ease.outCubic(clamp(t / 0.12, 0, 1)), grow = t > 0.12 ? ease.outCubic(clamp((t - 0.12) / 0.6, 0, 1)) : 0;
          const s0 = lerp(0.4, 1.15, stamp);
          blit(ctx, img, x, y, s0 + grow * 1.8, 0, clamp(1 - grow * 1.1, 0, 1), true);
          if (t < 0.35) blit(ctx, img, x, y, s0, 0, 1 - t / 0.35, false);
          if (t > 0.25 && t < 0.9) { const u = (t - 0.25) / 0.65; blit(ctx, img, x, y, 0.8 + u * 1.6, 0, (1 - u) * 0.6, true); }
          const bw = cam.vw * ease.outCubic(clamp(t / 0.3, 0, 1)), bh = cam.vh * ease.outCubic(clamp(t / 0.3, 0, 1)), ba = clamp(1 - t / 0.9, 0, 1);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.45 * ba; ctx.fillStyle = F.c[1]; ctx.fillRect(x - bw, y - 14, bw * 2, 28); ctx.fillRect(x - 14, y - bh, 28, bh * 2);
          ctx.globalAlpha = 0.9 * ba; ctx.fillStyle = '#fff4d0'; ctx.fillRect(x - bw, y - 4, bw * 2, 8); ctx.fillRect(x - 4, y - bh, 8, bh * 2);
        },
      });
    },
  },
  bran_warlord: {
    final(F) {
      const { w, x } = F, img = spriteOf('banner'), gy = F.ground;
      const offs = F.q === 'low' ? [-300, -150, 150, 300] : [-450, -300, -150, 150, 300, 450];
      const bs = offs.map((o, i) => ({ x: x + o, t0: 0.04 * i + rand(0, 0.05), s: rand(0.95, 1.2), ph: rand(0, TAU) }));
      sfx('war_horn', { vol: 0.8 }); sfx('fire', { pitch: 0.6, vol: 0.7 });
      const ringR = (t) => 40 + 420 * ease.outCubic(clamp(t / 0.6, 0, 1));
      spawn(w, {
        life: 1.7, z: 2.5,
        tick(e, ww) {
          if (e.lt >= 0.7) return;
          const r = ringR(e.lt);
          for (let i = 0, n = room(ww, 6, F.aw); i < n; i++) {
            const a = rand(0, TAU), px = x + Math.cos(a) * r, py = gy - 6 + Math.sin(a) * r * 0.18;
            ww.fx.emit(i % 2 ? 'dark' : 'fire', px, py, { color: i % 2 ? '#2a0a14' : '#ff3010', angle: -Math.PI / 2, spread: 0.5, speed: 120 });
          }
        },
        draw(ctx, e) {
          const t = e.lt, r = ringR(t), ra = clamp(1 - t / 0.9, 0, 1);
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ra * 0.6; ctx.strokeStyle = F.c[0]; ctx.lineWidth = 10;
          ctx.beginPath(); ctx.ellipse(x, gy - 4, r, r * 0.18, 0, 0, TAU); ctx.stroke();
          ctx.globalAlpha = ra; ctx.strokeStyle = F.c[2]; ctx.lineWidth = 2.5; ctx.stroke();
          const fade = clamp((1.7 - t) / 0.4, 0, 1);
          for (const b of bs) {
            const u = t - b.t0;
            if (u < 0) continue;
            const rise = ease.outBack(clamp(u / 0.3, 0, 1));
            ctx.save(); ctx.translate(b.x, gy); ctx.transform(1, 0, Math.sin(t * 5 + b.ph) * 0.07, 1, 0, 0);
            blit(ctx, img, 0, 0, b.s, 0, fade * 0.92 * clamp(u / 0.1, 0, 1), false, 0.5, 1, b.s * rise);
            ctx.restore();
          }
        },
      });
    },
  },
  bran_bloodrage: {
    final(F) {
      const { w, x } = F, img = spriteOf('geyser'), gl = glowSprite(F.c[0]), n = F.q === 'low' ? 4 : 6, gs = [];
      for (let i = 0; i < n; i++) {
        const gx = x + (i - (n - 1) / 2) * 150 + rand(-20, 20), gy = groundBelow(w, gx, F.y - 40, 8 * TILE) ?? F.ground;
        gs.push({ x: gx, y: gy, t0: Math.abs(i - (n - 1) / 2) * 0.07, h: rand(1.1, 1.45), done: false });
      }
      const colH = (u) => (u < 0.12 ? ease.outBack(u / 0.12) : u < 0.45 ? 1 + 0.04 * Math.sin(u * 40) : Math.max(0, 1 - (u - 0.45) / 0.25));
      sfx('splash', { pitch: 0.6, vol: 0.9 });
      spawn(w, {
        life: 1.3, z: 13,
        tick(e, ww) {
          for (const g of gs) {
            const u = e.lt - g.t0;
            if (u < 0) continue;
            if (!g.done) {
              g.done = true;
              if (Q[F.q].decals) HFX.stampDecal?.(ww, g.x, g.y - 6, 1, 'crack', { floor: true, scale: 1.3 });
              ww.fx.ering(g.x, g.y, { color: F.c[0], r0: 6, r1: 70, ry: 0.25, life: 0.3, width: 6 });
              sfx('holywater_burn', { vol: 0.5, pitch: rand(0.7, 0.9) });
            }
            if (u > 0.08 && u < 0.5 && Math.random() < 0.7 && emitOK(ww, F.aw)) ww.fx.emit('blood', g.x + rand(-8, 8), g.y - 230 * g.h * colH(u), { angle: -Math.PI / 2, spread: 1.2, speed: rand(160, 380) });
          }
        },
        draw(ctx, e) {
          for (const g of gs) {
            const u = e.lt - g.t0;
            if (u < 0) continue;
            const hk = colH(u);
            if (hk <= 0.01) continue;
            blit(ctx, img, g.x, g.y + 4, 1.1, 0, 1, false, 0.5, 1, g.h * hk);
            blit(ctx, gl, g.x, g.y - 40, 0.9, 0, 0.5 * Math.min(1, hk), true);
          }
        },
      });
    },
  },
  // ── 리아 ──
  lia_shadowmaster: {
    final(F) {
      const { w, x, y, p } = F, cut = HFX.cut?.(F.c[0]);
      let bmp = null;
      if (p) { const slot = ghostSlot(w, 1400); if (slot) bmp = captureGhost(w, p.snapshot ? p.snapshot() : p, F.c[0], slot, Q[F.q].rs); }
      const cl = [];
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2, px = x + Math.cos(a) * 170, py = y + Math.sin(a) * 90 + 40;
        cl.push({ x: px, y: py, face: px < x ? 1 : -1, t0: i * 0.07, cut: false });
      }
      sfx('mist', { vol: 0.7 });
      spawn(w, {
        life: 1.05, z: 13,
        tick(e, ww) {
          for (const c of cl) {
            if (!c.cut && e.lt >= c.t0 + 0.12) {
              c.cut = true;
              sfx('slash', { pitch: rand(1.0, 1.4), vol: 0.6 });
              burstN(ww, 'dark', c.x, c.y - 40, 3, { speed: 60, color: F.c[1] }, F.aw);
              burstN(ww, 'spark', x, y, 4, { color: F.c[2], speed: 380 }, F.aw);
            }
          }
        },
        draw(ctx, e) {
          for (const c of cl) {
            const t = e.lt - c.t0;
            if (t < 0) continue;
            const a = clamp(t / 0.08, 0, 1) * clamp((0.75 - t) / 0.25, 0, 1);
            if (bmp) drawGhostBmp(ctx, bmp, c.x, c.y, a * 0.85, true, c.face !== ((p?.facing ?? 1) < 0 ? -1 : 1));
            if (t >= 0.12 && t < 0.42 && cut) {
              const u = (t - 0.12) / 0.3, ang = Math.atan2(y - (c.y - 40), x - c.x);
              const sx = lerp(c.x, x + (x - c.x) * 0.7, ease.outCubic(u)), sy = lerp(c.y - 40, y + (y - c.y + 40) * 0.7, ease.outCubic(u));
              blit(ctx, cut, sx, sy, 1.6, ang, 1 - u, true);
            }
          }
        },
      });
    },
  },
  lia_kunoichi: {
    final(F) {
      const { w, x, y } = F, img = spriteOf('petals'), cam = w.camera, dir = F.dir;
      const n = Math.max(20, Math.round(70 * F.qf)), P = [], burst = [];
      for (let i = 0; i < n; i++) P.push({ f: i % 3, t0: rand(0, 0.35), y0: rand(-0.1, 1.0), sp: rand(700, 1100), sw: rand(40, 140), ph: rand(0, TAU), spin: rand(-12, 12), s: rand(0.7, 1.4), z: Math.random() });
      for (let i = 0; i < 16; i++) burst.push({ f: i % 3, a: i / 16 * TAU + rand(-0.1, 0.1), sp: rand(380, 620), spin: rand(-14, 14), s: rand(0.8, 1.3) });
      sfx('mist', { vol: 0.7 }); sfx('dash', { pitch: 0.7 });
      spawn(w, {
        life: 1.6, z: 13,
        draw(ctx, e) {
          const W = cam.vw, H = cam.vh, t = e.lt, fade = clamp((1.6 - t) / 0.35, 0, 1);
          for (const q of P) {
            const u = t - q.t0;
            if (u < 0) continue;
            const px = -60 + u * q.sp;
            if (px > W + 80) continue;
            let X = dir > 0 ? cam.x + px : cam.x + W - px, Y = cam.y + q.y0 * H + Math.sin(u * 5 + q.ph) * q.sw * 0.4 + u * 90;
            const dx = X - x, dy = Y - y, d = Math.hypot(dx, dy);
            if (d < 260) { const sw = (1 - d / 260) * 1.6 * dir, c = Math.cos(sw), s = Math.sin(sw); X = x + dx * c - dy * s; Y = y + dx * s + dy * c; }
            drawFrame(ctx, img, q.f, 3, X, Y, q.s * Math.cos(u * 9 + q.ph), q.s, u * q.spin, fade * (0.75 + 0.25 * q.z), false);
          }
          if (t > 0.4) {
            const u = t - 0.4, k = ease.outCubic(clamp(u / 0.8, 0, 1)), a = clamp(1 - u / 0.9, 0, 1);
            for (const b of burst) drawFrame(ctx, img, b.f, 3, x + Math.cos(b.a) * b.sp * k, y + Math.sin(b.a) * b.sp * k * 0.7, b.s, b.s, u * b.spin, a, false);
          }
        },
      });
    },
  },
  lia_bladedancer: {
    final(F) {
      const { w, x, y } = F, img = spriteOf('blade'), gl = glowSprite(F.c[0]), n = F.q === 'low' ? 8 : 14, T0 = 0.55;
      const angOf = (base, t) => base + (t < T0 ? 12 * t * t : 12 * T0 * T0 + 6 * (t - T0));
      let boom = false;
      sfx('slash', { pitch: 1.3, vol: 0.6 });
      spawn(w, {
        life: 1.15, z: 13,
        tick(e, ww) {
          if (!boom && e.lt >= T0) {
            boom = true;
            sfx('slash_heavy', { pitch: 1.2 }); sfx('sheath', { vol: 0.6 });
            burstN(ww, 'gold', x, y, 20, { speed: 420 }, F.aw);
            ww.fx.ring(x, y, { color: F.c[0], r0: 20, r1: 260, life: 0.4, width: 10 });
          }
        },
        draw(ctx, e) {
          const t = e.lt;
          for (let i = 0; i < n; i++) {
            const base = i / n * TAU;
            let r, a;
            if (t < T0) { r = lerp(280, 60, ease.inOutCubic(t / T0)); a = clamp(t / 0.1, 0, 1); }
            else { const u = ease.outCubic(clamp((t - T0) / 0.5, 0, 1)); r = lerp(60, 560, u); a = 1 - u; }
            for (let k = 2; k >= 0; k--) {
              const ang = angOf(base, Math.max(0, t - k * 0.025)), rot = t < T0 ? ang + Math.PI / 2 : ang;
              blit(ctx, img, x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.75, 1.1, rot, a * (k ? 0.3 / k : 1), true);
            }
          }
          blit(ctx, gl, x, y, 1.2 + 0.3 * Math.sin(t * 20), 0, t < T0 ? 0.6 * clamp(t / 0.2, 0, 1) : clamp(1 - (t - T0) / 0.3, 0, 1), true);
        },
      });
    },
  },
  lia_reaper: {
    final(F) {
      const { w, x, y } = F, img = spriteOf('scythe'), dir = F.dir, a0 = -2.1, a1 = 1.3, SW = 0.36, SC = 1.65;
      let souls = false;
      sfx('slash_heavy', { pitch: 0.55 });
      spawn(w, {
        life: 1.25, z: 13,
        tick(e, ww) {
          if (e.lt < SW + 0.05 && emitOK(ww, F.aw)) {
            const ang = lerp(a0, a1, ease.inOutCubic(clamp(e.lt / SW, 0, 1)));
            ww.fx.emit('soul', x + dir * Math.cos(ang) * 300, y + Math.sin(ang) * 300, { speed: 60, color: F.c[0] });
          }
          if (!souls && e.lt > SW) {
            souls = true;
            sfx('ghost', { pitch: 0.8, vol: 0.7 });
            for (const f of F.foes) burstN(ww, 'soul', f.cx, f.cy, 6, { speed: 100, color: F.c[0] }, F.aw);
          }
        },
        draw(ctx, e) {
          const t = e.lt, ang = lerp(a0, a1, ease.inOutCubic(clamp(t / SW, 0, 1))), fade = clamp((1.25 - t) / 0.4, 0, 1);
          ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
          ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
          const trailA = clamp(1 - (t - SW) / 0.45, 0, 1) * fade;
          for (const [wd, al, rr, c] of [[40, 0.22, 300, F.c[0]], [18, 0.5, 312, F.c[0]], [5, 0.95, 318, F.c[1]]]) {
            if (ang <= a0) break;
            ctx.globalAlpha = al * trailA; ctx.strokeStyle = c; ctx.lineWidth = wd;
            ctx.beginPath(); ctx.arc(0, 0, rr, a0, ang); ctx.stroke();
          }
          const al = fade * (t > SW + 0.5 ? clamp(1 - (t - SW - 0.5) / 0.3, 0, 1) : 1);
          ctx.rotate(ang);
          if (img) {
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al * 0.95;
            ctx.drawImage(img, -20 * SC, -70 * SC, img.width * SC, img.height * SC);
            ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * 0.55;
            ctx.drawImage(img, -20 * SC, -70 * SC, img.width * SC, img.height * SC);
          }
          ctx.restore();
        },
      });
    },
  },
  // ── 아젤 ──
  azel_nosferatu: {
    final(F) {
      const { w, x, y } = F, img = spriteOf('bat'), gl = glowSprite(F.c[0]), n = Math.max(14, Math.round(44 * F.qf)), B = [];
      for (let i = 0; i < n; i++) B.push({ a0: rand(0, TAU), r0: rand(280, 520), w: rand(4.5, 7.5), s: rand(0.75, 1.3), ph: rand(0, TAU), fr: rand(14, 20), out: rand(600, 900) });
      sfx('bat', { vol: 0.9 });
      let bat2 = false;
      spawn(w, {
        life: 1.25, z: 13,
        tick(e, ww) {
          if (!bat2 && e.lt > 0.5) { bat2 = true; sfx('bat', { pitch: 0.8, vol: 0.8 }); burstN(ww, 'bloodmist', x, y, 6, { speed: 80 }, F.aw); }
        },
        draw(ctx, e) {
          const t = e.lt, fade = clamp((1.25 - t) / 0.3, 0, 1);
          blit(ctx, gl, x, y, 1.1 + (t < 0.55 ? t : 0.55) * 1.2, 0, 0.5 * fade, true);
          for (const b of B) {
            const a = b.a0 + b.w * t;
            const r = t < 0.55 ? lerp(b.r0, 50, ease.inCubic(t / 0.55)) : 50 + b.out * ease.outCubic(clamp((t - 0.55) / 0.6, 0, 1));
            const f = Math.floor(t * b.fr + b.ph) & 1;
            drawFrame(ctx, img, f, 2, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.55, b.s * (-Math.sin(a) >= 0 ? 1 : -1), b.s, 0, fade, false);
          }
        },
      });
    },
  },
  azel_bloodking: {
    final(F) {
      const { w, x, y } = F, img = spriteOf('crown'), gl = glowSprite(F.c[0]), cy = y - 60;
      const tg = F.foes.length ? F.foes.map((e) => e) : null;
      const pts = tg ?? [-2, -1, 0, 1, 2].map((i) => ({ cx: x + i * 110, cy: groundBelow(w, x + i * 110, y, 8 * TILE) ?? y + 60, dead: false }));
      sfx('seal_stamp', { vol: 0.9 }); sfx('thunder', { pitch: 0.7, vol: 0.8 });
      let i = 0;
      spawn(w, {
        life: 1.35, z: 13,
        tick(e, ww) {
          while (i < pts.length && e.lt >= 0.15 + i * 0.05) {
            const f = pts[i++];
            if (!f || f.dead) continue;
            lightning(ww, x, cy, f.cx, f.cy, F.c[0], 0.24, 4, F.aw, 2);
            burstN(ww, 'blood', f.cx, f.cy, 8, { speed: 300 }, F.aw);
            ww.fx.ring(f.cx, f.cy, { color: F.c[0], r0: 8, r1: 80, life: 0.25, width: 6 });
            if (i === 3) sfx('thunder', { pitch: 0.85, vol: 0.6 });
          }
        },
        draw(ctx, e) {
          const t = e.lt, k = ease.outCubic(clamp(t / 0.1, 0, 1)), fade = clamp((1.35 - t) / 0.35, 0, 1);
          const sc = lerp(1.8, 1, k), pulse = 0.9 + 0.1 * Math.sin(t * 14);
          blit(ctx, gl, x, cy, 1.8 * sc * pulse, 0, 0.6 * fade, true);
          blit(ctx, img, x, cy, sc, 0, fade * k, false);
          if (t < 0.3) blit(ctx, img, x, cy, sc, 0, (0.3 - t) / 0.3, true);
        },
      });
    },
  },
  azel_dawnbringer: {
    final(F) {
      const { w } = F, moon = spriteOf('moon'), sun = spriteOf('sun'), cam = w.camera;
      sfx('bell', { pitch: 0.7, vol: 0.8 }); sfx('holy', { pitch: 0.6, vol: 0.9 });
      let acc = 0;
      spawn(w, {
        life: 1.9, z: -0.5,
        tick(e, ww, dt) {
          if (e.lt < 0.4 || e.lt > 1.4) return;
          acc += dt * 40;
          while (acc >= 1) { acc--; if (!emitOK(ww, F.aw)) continue; const px = cam.x + rand(0, cam.vw), gy = groundBelow(ww, px, cam.y + cam.vh * 0.5, 12 * TILE) ?? cam.y + cam.vh; ww.fx.emit(Math.random() < 0.6 ? 'holy' : 'ember', px, gy - 4, { color: F.c[0], angle: -Math.PI / 2, spread: 0.3, speed: rand(80, 200) }); }
        },
        draw(ctx, e) {
          const t = e.lt, x2 = clamp((t - 0.3) / 0.35, 0, 1), fade = clamp((1.9 - t) / 0.5, 0, 1) * clamp(t / 0.1, 0, 1);
          const cx = cam.x + cam.vw * 0.5, cy = cam.y + cam.vh * 0.32 - 50 * ease.outCubic(clamp((t - 0.3) / 0.8, 0, 1)), R = cam.vh * 0.22, sc = (2 * R) / 192;
          if (x2 > 0) rays(ctx, cx, cy, 9, R * 0.8, cam.vh * 1.2, Math.PI / 2 - 0.9 + Math.sin(t) * 0.05, F.c[0], 0.14 * x2 * fade, 0.06);
          blit(ctx, glowSprite(x2 < 0.5 ? F.c[1] : F.c[0]), cx, cy, 3.2 * (R / 120), 0, 0.6 * fade, true);
          blit(ctx, moon, cx, cy, sc, 0, (1 - x2) * fade, false);
          blit(ctx, sun, cx, cy, sc * 1.6 * (1 + 0.15 * x2), t * 0.3, x2 * fade, true);
          blit(ctx, sun, cx, cy, sc * 1.8, -t * 0.2, x2 * fade * 0.4, true);
        },
      });
    },
  },
  azel_seraph: {
    final(F) {
      const { w, x, y, p } = F, wing = spriteOf('wing'), wingD = spriteOf('wingD'), cW = spriteOf('crescentW'), cD = spriteOf('crescentD');
      sfx('slash_heavy', { pitch: 0.7 }); sfx('holy', { pitch: 0.7, vol: 0.7 }); sfx('dark', { pitch: 0.7, vol: 0.7 });
      const root = () => ({ x: p ? p.cx - (p.facing ?? 1) * 4 : x, y: p ? p.y + (p.h ?? 64) * 0.3 : y });
      let feathers = false;
      spawn(w, {
        life: 1.5, z: 9.5,
        tick(e, ww) {
          if (!feathers && e.lt > 0.3) {
            feathers = true;
            const r = root();
            for (let i = 0, n = room(ww, 14, F.aw); i < n; i++) ww.fx.emit('feather', r.x + rand(-150, 150), r.y - rand(0, 90), { color: i % 2 ? '#fffaf0' : '#1a1426', speed: 140 });
          }
        },
        draw(ctx, e) {
          const t = e.lt, open = ease.outBack(clamp(t / 0.34, 0, 1)), fade = clamp((1.5 - t) / 0.4, 0, 1) * clamp(t / 0.08, 0, 1), r = root(), f = (p?.facing ?? 1) < 0 ? -1 : 1;
          for (const side of [-1, 1]) {
            const img = side === f ? wing : wingD;
            ctx.save(); ctx.translate(r.x + side * 6, r.y); ctx.scale(side, 1); ctx.rotate(lerp(1.1, -0.2, open) + Math.sin(t * 7) * 0.06 * open);
            blit(ctx, img, 0, 0, 0.9, 0, fade, false, 22 / 256, 178 / 200);
            ctx.restore();
          }
        },
      });
      spawn(w, {
        life: 1.0, z: 13,
        draw(ctx, e) {
          const t = e.lt;
          for (const [img, a0, a1, add, t0] of [[cW, -2.4, 0.3, true, 0], [cD, 0.8, 3.5, false, 0.1]]) {
            const u0 = t - t0;
            if (u0 < 0) continue;
            const u = ease.outCubic(clamp(u0 / 0.24, 0, 1)), fade = clamp(1 - (u0 - 0.24) / 0.5, 0, 1);
            for (let k = 3; k >= 0; k--) blit(ctx, img, x, y, 1.35, lerp(a0, a1, Math.max(0, u - k * 0.1)), fade * (k ? 0.45 / (k + 0.5) : 1), k ? true : add);
            if (!add) blit(ctx, img, x, y, 1.35, lerp(a0, a1, u), fade * 0.5, true);
          }
        },
      });
    },
  },
};

function playFlourish(w, s, classId, x, y, o = {}) {
  const R = FL[classId];
  if (!R?.final || !ULT_FLOURISH[classId] || !w?.fx) return false;
  try { R.final(fctx(w, s, classId, x, y, o)); } catch (e) { ULTFX_STATS.errors++; console.error('[ultfx] 직업 장식', classId, e); return false; }
  ULTFX_STATS.flourishes[classId] = (ULTFX_STATS.flourishes[classId] ?? 0) + 1;
  return true;
}

// ═══════════════════════════ 미리 굽기 ═══════════════════════════
const PREP = { key: null };
function prepareFor(w, p) {
  if (typeof document === 'undefined' || !w || !p?.hero) return false;
  const q = qk(w), cls = p.hero.classId, ch = p.hero.charId, key = `${cls}|${q}`;
  ensurePools(q);
  if (PREP.key === key) return true;
  const tier = tierOfClass(cls), col = ultColor(ch), acc = visAccent(cls, col);
  // 필살기 색 + 각성 색 (awaken.js 가 v.color = T2.color ?? AWAKEN.color 로 부른다)
  const A = AWD.AWAKEN?.[ch], A2 = AWD.T2?.[cls];
  const awCol = A2?.color ?? A?.color, awAcc = A2?.accent ?? A?.accent;
  const pairs = [[col, acc]];
  if (awCol && tier >= 1) pairs.push([awCol, awAcc ?? awCol]);
  const au = auraOf(cls, ch, acc);
  glowSprite('#ffffff'); glowSprite(au.color);
  for (const [c, a] of pairs) {
    glowSprite(c); glowSprite(a); glowSprite(mixC(c, '#ffffff', 0.35));
    try { HFX.star?.(a); HFX.streak?.(a); HFX.ring?.(a); } catch { /* hitfx 캐시 */ }
    if (Q[q].layer) layerFor(tier, c, a);
  }
  // 연기 모양 입자(fire·dark·bloodmist·smoke)는 색별 부드러운 원을 쓴다 → 스테이지 진입 때 미리
  const soft = [];
  if (au.type === 'fire' || au.type === 'dark' || au.type === 'blood') soft.push(au.color);
  const def = ULT_FLOURISH[cls];
  if (tier >= 2 && def) {
    for (const n of def.sprites) spriteOf(n);
    for (const c of def.colors) glowSprite(c);
    try { HFX.ring?.(def.colors[0]); HFX.cut?.(def.colors[0]); HFX.star?.(def.colors[0]); HFX.star?.('#ffffff'); } catch { /* hitfx 캐시 */ }
    soft.push(...(def.soft ?? []));
  }
  try { for (const c of soft) HFX.soft?.(c); } catch { /* hitfx 캐시 */ }
  // 기술 이름 (피 글씨 비트맵): 실제 화면 배율로 미리 굽는다
  try {
    const T = ULT_TIERS[tier], base = CHARACTERS[ch]?.ult?.name, c = POOL.scratch;
    if (base && c) {
      const text = T.name.prefix && CLASSES[cls]?.name ? `${CLASSES[cls].name} · ${base}` : base;
      const g = c.getContext('2d'), k = game?.scale || 1;
      g.setTransform(k, 0, 0, k, 0, 0);
      UI.prewarmText?.(g, text, { size: T.name.size, style: T.name.style, drips: T.name.drips });
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
  } catch { /* 글꼴 준비 전 */ }
  PREP.key = key;
  ULTFX_STATS.prepared = key;
  return true;
}
function idle(fn, timeout = 600) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout });
  else setTimeout(fn, 60);
}
function schedulePrepare() {
  setTimeout(() => idle(() => { try { const w = game?.world; if (w?.player) prepareFor(w, w.player); } catch (e) { console.warn('[ultfx] prepare', e); } }), 250);
}
let HOOKED = false;
function hookBus() {
  if (HOOKED) return;
  HOOKED = true;
  try {
    bus.on('stageEntered', schedulePrepare);
    bus.on('classChanged', () => { PREP.key = null; });
    bus.on('roomEntered', () => {
      const w = game?.world;
      if (!w) return;
      const s = w.__ultfx;
      if (s && !s.dead && s.ov && !w.overlays?.includes(s.ov)) s.kill();   // 방이 바뀌며 오버레이가 비워졌다 → 레터박스·기울기 복구
      const im = w.__ultImpact;
      if (im && !im.dead && !w.overlays?.includes(im.ov)) endImpact(im);
    });
  } catch (e) { console.warn('[ultfx] bus', e); }
}
// 부팅 뒤 한가할 때 풀을 만든다 (모듈 최상위에서는 가져온 값에 접근하지 않는다: 순환 import 규칙)
if (typeof window !== 'undefined' && typeof setTimeout === 'function') {
  setTimeout(() => {
    hookBus();
    idle(() => { try { ensurePools(qk(game?.world)); const w = game?.world; if (w?.player) prepareFor(w, w.player); } catch (e) { console.warn('[ultfx] pool', e); } }, 1500);
  }, 1200);
}

// ═══════════════════════════ 공개 API ═══════════════════════════
function safe(name, fn) {
  return (...args) => {
    try { return fn(...args); } catch (e) { ULTFX_STATS.errors++; console.error(`[ultfx] ${name}`, e); return null; }
  };
}
function beatImpl(w, x, y, o = {}) {
  if (!w?.fx || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const s = live(w);
  const tier = clampTier(o.tier ?? s?.tier ?? tierOfClass(w.player?.hero?.classId));
  const T = ULT_TIERS[tier], pw = clamp(o.power ?? 0.5, 0, 1);
  const col = o.color ?? s?.color ?? '#ffffff', acc = o.accent ?? s?.accent ?? col, aw = s?.awaken ?? !!w.hudHidden;
  const fx = w.fx, cam = w.camera;
  ULTFX_STATS.beats++;
  // 한꺼번에 쏟아지는 박자는 고리만 (50ms 에 3번 넘으면)
  const st = s ?? (w.__ultBeat ??= { bt: -9, bn: 0 }), now = w.rt ?? w.time ?? 0;
  if (now - st.bt < 0.05) st.bn++; else { st.bt = now; st.bn = 1; }
  const lite = st.bn > 3;
  const r1 = 60 + 120 * pw;
  fx.ring(x, y, { color: col, r0: 8, r1, life: 0.26 + 0.12 * pw, width: 5 + 7 * pw });
  if (T.beat.rings >= 2) fx.ring(x, y, { color: acc, r0: 4, r1: r1 * 1.45, life: 0.36 + 0.14 * pw, width: 3 + 4 * pw });
  if (!lite) {
    const g = glowSprite(col);
    if (g) fx.sprite(g, x, y, { size: 110 + 150 * pw, life: 0.18, s0: 0.5, s1: 1.15, alpha: 0.85 });
    if (pw >= 0.55) { const st2 = HFX.star?.(acc); if (st2) fx.sprite(st2, x, y, { size: 90 + 120 * pw, angle: rand(0, TAU), life: 0.16, s0: 0.3, s1: 1.2 }); }
    const n = room(w, 4 + 8 * pw, aw), sc = mixC(col, '#ffffff', 0.5);
    for (let i = 0; i < n; i++) fx.emit('spark', x, y, { color: sc, speed: 380 + 300 * pw });
    const nl = room(w, 3 + 5 * pw, aw);
    for (let i = 0; i < nl; i++) fx.speedLine(x, y, rand(0, TAU), { len: 50 + 70 * pw, width: 3, color: col, life: 0.16, speed: 900 });
  }
  if (T.beat.ground || o.ground) {
    const gy = o.groundY ?? (o.ground ? y : groundBelow(w, x, y, 3 * TILE));
    if (gy != null) {
      if (T.beat.ground) fx.ering(x, gy, { color: acc, r0: 10, r1: r1 * 1.3, ry: 0.2, life: 0.38, width: 6 });
      const nd = room(w, T.beat.dust || (o.ground ? 2 : 0), aw);
      for (let i = 0; i < nd; i++) { const sd = i % 2 ? 1 : -1; fx.emit('dust', x + sd * rand(4, 24), gy - 4, { angle: sd > 0 ? -0.15 : Math.PI + 0.15, spread: 0.25, speed: rand(160, 280), vy: -30 }); }
    }
  }
  if (o.shake !== false && cam) {
    const k = 2 + 5 * pw;
    cam.kick?.(rand(-1, 1) * k, rand(-1, 1) * k);
    cam.addTrauma?.(0.06 + 0.2 * pw);
  }
  if (tier >= 2 && s && !lite) {
    const R = FL[s.classId];
    if (R?.beat) { try { R.beat(fctx(w, s, s.classId, x, y, o), x, y, o); } catch (e) { ULTFX_STATS.errors++; console.error('[ultfx] 박자 장식', e); } }
  }
}
function finalImpl(w, x, y, o = {}) {
  if (!w?.fx || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const s = live(w), p = w.player;
  const classId = o.classId ?? s?.classId ?? p?.hero?.classId;
  const tier = clampTier(o.tier ?? s?.tier ?? tierOfClass(classId));
  const T = ULT_TIERS[tier];
  const col = o.color ?? s?.color ?? ultColor(p?.hero?.charId), acc = o.accent ?? s?.accent ?? visAccent(classId, col);
  const aw = s?.awaken ?? !!w.hudHidden, q = qk(w), cam = w.camera, fx = w.fx, vw = cam?.vw ?? 960;
  ULTFX_STATS.finals++;
  if (s) { s.finalAt = s.t; s.finals++; }
  // 고리 1/2/3
  const RING = [[col, 0.42, 0.5, 20], [acc, 0.62, 0.62, 13], ['#ffffff', 0.85, 0.74, 7]];
  for (let i = 0; i < T.final.rings; i++) { const [c, r, life, wd] = RING[i]; fx.ring(x, y, { color: c, r0: 16 + 14 * i, r1: vw * r, life, width: wd }); }
  // 섬광 핵 · 별 · 가로 렌즈 줄
  const g = glowSprite(mixC(col, '#ffffff', 0.35));
  if (g) fx.sprite(g, x, y, { size: 380 + 80 * tier, life: 0.34, s0: 0.3, s1: 1.25, alpha: 0.95 });
  if (T.final.star) {
    const st = HFX.star?.(acc);
    if (st) fx.sprite(st, x, y, { size: 240 + 60 * tier, angle: rand(-0.2, 0.2), life: 0.26, s0: 0.3, s1: 1.2 });
    const sk = HFX.streak?.(acc);
    if (sk) for (const a of [0, Math.PI]) fx.sprite(sk, x + Math.cos(a) * vw * 0.2, y, { size: vw * 0.5, angle: a, life: 0.3, s0: 0.3, s1: 1 });
  }
  const ns = room(w, 16 + 10 * tier, aw);
  for (let i = 0; i < ns; i++) fx.emit('spark', x, y, { color: i & 1 ? '#ffffff' : acc, speed: rand(420, 820) });
  const nl = room(w, 8 + 6 * tier, aw);
  for (let i = 0; i < nl; i++) fx.speedLine(x, y, rand(0, TAU), { len: rand(90, 160), width: rand(3, 5), color: i & 1 ? col : '#ffffff', life: 0.24, speed: rand(1100, 1600) });
  // 불씨 비 (1차+)
  if (T.final.embers && cam) {
    const n = room(w, T.final.embers, aw);
    for (let i = 0; i < n; i++) fx.emit('ember', cam.x + rand(0, cam.vw), cam.y + rand(-30, cam.vh * 0.35), { speed: 0, vx: rand(-40, 40), vy: rand(60, 200), grav: 90, drag: 0.99, color: i % 3 ? acc : '#ffffff', life: rand(1.0, 1.9), size: rand(1.6, 3.2) });
  }
  // 카메라
  if (o.shake !== false && cam) { cam.addTrauma?.(0.28 + 0.12 * tier); cam.kick?.(rand(-4, 4), 6 + 2 * tier); }
  if (T.final.roll) { const a = T.final.roll * (s?.dir ?? ((p?.facing ?? 1) < 0 ? -1 : 1)); if (s) s.kick = { a, t: 0 }; else rollKickAlone(w, a); }
  // 번쩍임 / 임팩트 프레임
  const flash = o.noFlash ? null : { color: o.flashColor ?? mixC(col, '#ffffff', 0.55), a: T.final.flash, decay: 3 };
  let imp = false;
  if (T.final.impact && o.impact !== false) imp = startImpact(w, { ...o, flash }, x, y);
  if (!imp && flash) w.game?.flash?.(flash.color, flash.a, flash.decay);
  // 바닥 균열 (2차)
  if (T.final.crack && Q[q].decals) {
    let gy = o.ground ? y : groundBelow(w, x, y - 20, 6 * TILE);
    if (gy == null && p) gy = groundBelow(w, x, p.bottom - 20, 3 * TILE);
    if (gy != null) {
      HFX.stampDecal?.(w, x - 30, gy - 8, 1, 'crack', { floor: true, scale: 2.3, life: 14 });
      HFX.stampDecal?.(w, x + 34, gy - 8, -1, 'crack', { floor: true, scale: 1.7, life: 14 });
      fx.ering(x, gy, { color: '#ffd8a0', r0: 20, r1: 260, ry: 0.16, life: 0.5, width: 8 });
      const nd = room(w, 14, aw);
      for (let i = 0; i < nd; i++) fx.emit('gravel', x + rand(-80, 80), gy - 4, { angle: -Math.PI / 2, spread: 0.9, speed: rand(260, 520) });
    }
  }
  // 직업 장식 (2차)
  if (T.final.flourish && o.flourish !== false && classId) playFlourish(w, s, classId, x, y, { ...o, color: col, accent: acc, tier });
  if (!o.silent) { sfx('ult_impact', { vol: 0.8 + 0.1 * tier }); if (imp) sfx('impact_frame'); }
}

export const ULTFX = {
  /** 시전 시작: 줌·기울기·레터박스·집중선·색보정·속성 입자·이름 (feel §5.1) */
  begin: safe('begin', (w, p, o = {}) => {
    if (!w) return null;
    hookBus();
    const prev = live(w);
    if (prev) prev.finish(true);
    const pl = p || w.player;
    if (pl?.hero) { try { prepareFor(w, pl); } catch { /* 굽기 실패는 연출만 줄어든다 */ } }
    const s = new Session(w, pl, o || {});
    w.__ultfx = s;
    return s;
  }),
  /** 박자 한 번: 충격파 고리 + 섬광 + 불꽃 + 카메라 반동 */
  beat: safe('beat', (w, x, y, o) => beatImpl(w, x, y, o || {})),
  /** 마무리: 번쩍임·고리·불씨 비·임팩트 프레임·균열·직업 장식 */
  final: safe('final', (w, x, y, o) => finalImpl(w, x, y, o || {})),
  /** 단계 제한 잔상 (캐시 비트맵) */
  afterimage: safe('afterimage', (w, p, tint, o) => afterimageImpl(w, p, tint ?? null, o || {})),
  /** 끝: 카메라 복구, 화면 층 제거 (quick = 즉시) */
  end: safe('end', (w, p, o) => { const s = live(w); if (s) s.finish(!!o?.quick); }),
  /** 미리 굽기 (스테이지 진입 때 자동) */
  prepare: safe('prepare', (w, p) => prepareFor(w, p || w?.player)),
  /** 직업 장식만 재생 (각성 2차 변형 등) */
  flourish: safe('flourish', (w, classId, x, y, o) => playFlourish(w, live(w), classId, x, y, o || {})),
  /** 지금 진행 중인 세션 | null */
  active: (w) => live(w),
  tierOf: (p) => tierOfClass(p?.hero?.classId),
  accentOf,
  glow: (color) => { try { return glowSprite(color); } catch { return null; } },
  sprite: (name) => { try { return spriteOf(name); } catch { return null; } },
};
