// 탈것 렌더러 — owner: CMP-MOUNT-ART-A (companions §11.2; MASTER_PLAN §1.2 · §1.15; docs/specs/ART_DECISION.md)
//
//  drawMount(ctx, m, world|null, layer 'back'|'front', opts = { alpha, tint, scale, noFx, flash })
//      m = MountRider · MountGhost · 잔상 스냅숏 · mountView (필드는 mount.js 머리말). m.pose = mount_rig.mountPose 결과.
//      순서: MOUNT_DRAW_B[id] (CMP-MOUNT-ART-B) → 채색 퍼핏 (등록 + 구워짐 + 켜짐) → 벡터 (이 파일, 대체 그림).
//      back = 먼 다리·꼬리·몸·가까운 다리·목·머리·마구 / front = 등자 끈·등자·고삐 (기수의 가까운 다리 위에 겹친다).
//      opts.tint = 단색 유령 (돌진 잔상·필살기 퇴장), opts.flash / m.flashT > 0 = 피격 번쩍임, opts.noFx = 불꽃·빛 생략.
//      opts.rider === false = 기수 없이 혼자 (고삐는 목 위에 늘어지고 등자는 안장에 매달린다; 메뉴에서 탈것만 보일 때).
//  drawMountIcon(ctx, id, x, y, r)   초상화가 없을 때의 절차적 머리 아이콘 (원 안). 2부 B 탈것은 MB.MOUNT_ICON_B[id] 가 있으면 그것.
//  preloadMounts(ids, game)          채색 탈것 미리 굽기 (선택: 동료 탭·마구간·스테이지 입장에서 불러도 된다; drawMount 도 처음 볼 때 시작한다)
//  MOUNT_PAL                         탈것별 색 (갤러리·아이콘·B 패키지 참고용)
//
// 규칙: 그리기에서 Math.random · world.fx.emit 을 쓰지 않는다 (불꽃·연기는 시간 함수로 그린다). 그라디언트는 지역 좌표에서
// 한 번 만들어 캐시한다 (캔버스 그라디언트는 채울 때의 변환을 따른다). 품질: high 전부 · medium 불꽃 수 절반 · low 눈빛만.
import { clamp, lerp, TAU, shade, rgba } from '../core/math.js';
import { game } from '../core/game.js';
import * as RIG from './mount_rig.js';
import * as MB from './mounts_b.js';
import * as REG from './painted/registry.js';
import { puff, Drawer, pickVariant } from './painted/kit.js';

const OUT = '#0a0608';
const PI = Math.PI;

// ───────────────────────── 색 ─────────────────────────
export const MOUNT_PAL = {
  mt_warhorse: { coat: '#1d1b28', hi: '#56607e', dark: '#09080d', mane: '#8c1224', maneHi: '#d23a4c', steel: '#8a90a0', steelHi: '#e0e4ee', cloth: '#76101c', trim: '#c8a040', leather: '#1a1210', eye: '#ff5a2a', hoof: '#26262c', glow: '#ff6a2a', awake: '#ff8a2a' },
  mt_boar: { coat: '#4c3122', hi: '#80603e', dark: '#22160e', mane: '#1a120c', maneHi: '#4a3626', steel: '#9aa0aa', steelHi: '#dde2ea', tusk: '#e8dcc0', cloth: '#5a3a22', trim: '#8a8e9a', leather: '#4a2e1a', eye: '#ff3a2a', hoof: '#1a120c', glow: '#ff4a2a', awake: '#ff7a2a' },
  mt_skelsteed: { coat: '#262c3a', hi: '#4a5670', dark: '#10131c', bone: '#d8d0bc', boneDk: '#8a8478', mane: '#6ad0ff', maneHi: '#e0f8ff', steel: '#4a4a56', steelHi: '#9aa0b0', cloth: '#16121a', trim: '#6ad0ff', leather: '#1a1418', eye: '#8ae8ff', hoof: '#6a6458', glow: '#6ad0ff', awake: '#b0ffd8', bones: true, fire: true },
  mt_ignis: { coat: '#1c1210', hi: '#4a2c1e', dark: '#080404', mane: '#ff7a1a', maneHi: '#ffe08a', lava: '#ff6a14', steel: '#4a4038', steelHi: '#8a7a6a', cloth: '#3a1a10', trim: '#ffb040', leather: '#2a1a12', eye: '#fff0a0', hoof: '#1a0e0a', glow: '#ff8a2a', awake: '#fff4c0', fire: true },
  mt_silva: { coat: '#eeeee4', hi: '#ffffff', dark: '#a8a898', mane: '#f4f4ec', maneHi: '#ffffff', antler: '#d8ffcc', leaf: '#4f8a3e', steel: '#d8c890', steelHi: '#fff4c0', cloth: '#5a7a4a', trim: '#e8d890', leather: '#6a4a2a', eye: '#7affb0', hoof: '#3a3430', glow: '#a8ff9a', awake: '#fff0a0' },
};
const DEF_PAL = MOUNT_PAL.mt_warhorse;
const palOf = (id) => MOUNT_PAL[id] ?? DEF_PAL;

// ───────────────────────── 품질 ─────────────────────────
/** 0 = low, 1 = medium, 2 = high */
function qTier(world) {
  const q = world?.fx?.quality;
  if (Number.isFinite(q)) return q >= 0.95 ? 2 : q >= 0.6 ? 1 : 0;
  const t = game?.quality ?? game?.settings?.quality;
  return t === 'low' ? 0 : t === 'medium' ? 1 : 2;
}

// ───────────────────────── 채색 퍼핏 (registry) ─────────────────────────
/** 준비된 채색 리그 (없으면 null, 처음 부를 때 굽기를 시작한다) */
function paintedRig(id) {
  try {
    if (!id || !REG.hasPainted?.(id)) return null;
    if (!REG.paintedEnabled?.(game)) return null;
    const st = REG.paintedState(id);
    if (st === 'ready') return REG.paintedRig(id);
    if (st === 'idle') REG.preloadPainted(id, game);
  } catch { /* 채색 실패 → 벡터 */ }
  return null;
}
export function preloadMounts(ids, g = game) {
  const out = [];
  for (const id of ids ?? []) { try { if (REG.hasPainted?.(id)) out.push(REG.preloadPainted(id, g)); } catch { /* 무시 */ } }
  return Promise.all(out);
}

// ───────────────────────── 디스패처 ─────────────────────────
const O0 = { alpha: 1, tint: null, scale: 1, noFx: false, flash: false, rider: true };
export function drawMount(ctx, m, world, layer = 'back', opts = O0) {
  if (!m) return;
  const fnB = MB.MOUNT_DRAW_B?.[m.id];
  if (typeof fnB === 'function') { fnB(ctx, m, world, layer, opts); return; }
  const P = m.pose;
  if (!P) throw new Error('mount pose missing');
  const o = opts ?? O0;
  const alpha = clamp((o.alpha ?? 1) * (m.alpha ?? 1), 0, 1);
  if (alpha <= 0.01) return;
  const sc = (o.scale ?? 1) * (m.scale ?? 1);
  const f = (m.facing ?? 1) < 0 ? -1 : 1;
  const turn = P.turnK < 1 ? 0.45 + 0.55 * P.turnK : 1;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.translate(m.cx ?? 0, m.bottom ?? 0);
  ctx.scale(f * sc * turn, sc);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const tint = o.tint ?? null;
  const flash = !tint && (o.flash || (m.flashT ?? 0) > 0);
  const fx = !o.noFx && !tint;
  const q = qTier(world);
  const C = S0;
  C.m = m; C.P = P; C.T = RIG.templateFor(m); C.pal = palOf(m.id); C.tint = tint; C.flash = flash; C.fx = fx; C.q = q;
  C.t = world?.time ?? m.t ?? 0; C.aw = !!m.awakened; C.world = world; C.f = f; C.ridden = o.rider !== false; C.rig = null;
  try {
    let rig = paintedRig(m.id);
    if (rig && tint && tint !== rig.def?.glow) rig = null;                 // 다른 색 유령은 벡터 실루엣 (구운 발광 실루엣은 한 색)
    if (rig && rig.mount && P.kind === 'quad') paintedQuad(ctx, C, layer, rig);
    else if (P.kind === 'quad') (layer === 'front' ? vecFront : vecBack)(ctx, C);
    else throw new Error('no drawer for rig ' + (m.rig ?? P.tpl));
  } finally { ctx.restore(); }
}
/** 그리기 문맥 (한 번에 하나만 그리므로 재사용) */
const S0 = { m: null, P: null, T: null, pal: null, tint: null, flash: false, fx: true, q: 2, t: 0, aw: false, world: null, f: 1, ridden: true, rig: null };

// ───────────────────────── 벡터 도우미 ─────────────────────────
/** 번쩍임/유령 색 변환 */
const LIGHT = new Map();
function col(C, c) {
  if (C.tint) return C.tint;
  if (C.flash && typeof c === 'string' && c[0] === '#') { let v = LIGHT.get(c); if (!v) { v = shade(c, 0.62); LIGHT.set(c, v); } return v; }
  return c;
}
const DEEP = new Map();
function deep(c) { if (typeof c !== 'string' || c[0] !== '#') return c; let v = DEEP.get(c); if (!v) { v = shade(c, -0.38); DEEP.set(c, v); } return v; }
/** 가산 빛 방울 (캐시된 퍼프) */
function glow(ctx, x, y, r, color, a) {
  if (a <= 0.01 || r < 0.5) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * Math.min(1, a);
  ctx.drawImage(puff(color, true), x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
/** 가늘어지는 마디 (둥근 끝). w0 → w1, bulge = 앞쪽 근육 볼록 (+ 는 진행 방향의 왼쪽) */
function limb(ctx, x0, y0, x1, y1, w0, w1, bulge = 0) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L, a = Math.atan2(dy, dx);
  const h0 = w0 / 2, h1 = w1 / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + nx * h0, y0 + ny * h0);
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  ctx.quadraticCurveTo(mx + nx * ((h0 + h1) / 2 + bulge), my + ny * ((h0 + h1) / 2 + bulge), x1 + nx * h1, y1 + ny * h1);
  ctx.arc(x1, y1, h1, a + PI / 2, a - PI / 2, true);
  ctx.quadraticCurveTo(mx - nx * ((h0 + h1) / 2 + bulge * 0.4), my - ny * ((h0 + h1) / 2 + bulge * 0.4), x0 - nx * h0, y0 - ny * h0);
  ctx.arc(x0, y0, h0, a - PI / 2, a + PI / 2, true);
  ctx.closePath();
}
/** 결정론적 깜빡임 0..1 */
const flick = (t, s) => 0.5 + 0.5 * Math.sin(t * 13 + s * 7.1) * Math.sin(t * 7.3 + s * 3.3);

// ── 캐시된 지역 그라디언트 (탈것 id · 이름 별) ──
const GRAD = new Map();
function grad(ctx, key, make) { let g = GRAD.get(key); if (!g) { g = make(ctx); GRAD.set(key, g); } return g; }

// ───────────────────────── 벡터: back 층 ─────────────────────────
function vecBack(ctx, C) {
  const { P, T, pal } = C;
  const bones = !!pal.bones;
  // 0) 발밑 그림자
  if (!C.tint && C.m.onGround !== false) {
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.32; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(-2, 0, T.body.rx + 10, 4, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = ga;
  }
  // 1) 꼬리
  drawTail(ctx, C);
  // 2) 먼 다리
  drawLeg(ctx, C, 0, true); drawLeg(ctx, C, 1, true);
  // 3) 몸통
  drawBody(ctx, C);
  // 4) 가까운 다리
  drawLeg(ctx, C, 2, false); drawLeg(ctx, C, 3, false);
  // 5) 목 · 갈기 · 머리
  drawNeck(ctx, C);
  drawHead(ctx, C);
  tackBack(ctx, C);
  // 6) 효과: 불꽃·콧김·각성
  if (C.fx) drawFxBack(ctx, C);
  void bones;
}

function legColor(C, far) {
  const c = C.pal.bones ? C.pal.bone : C.pal.coat;
  return col(C, far ? deep(c) : c);
}
function drawLeg(ctx, C, i, far) {
  const { P, T, pal } = C, L = P.legs[i];
  const fore = i === 1 || i === 3;
  const boar = T.name === 'boar', stag = T.name === 'stag';
  const w1 = boar ? 11 : stag ? 7 : 10, w2 = boar ? 8 : stag ? 4.2 : 6.2, wr = boar ? 13 : stag ? 9 : 12;
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
  if (pal.bones) {
    // 뼈 다리: 가는 뼈대 + 관절 혹
    ctx.fillStyle = col(C, far ? deep(pal.boneDk) : pal.bone);
    limb(ctx, L.rx, L.ry, L.kx, L.ky, 6, 4.5, 0); ctx.fill(); ctx.stroke();
    limb(ctx, L.kx, L.ky, L.fx, L.fy - 3, 4, 3.2, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(L.kx, L.ky, 3.6, 0, TAU); ctx.fill(); ctx.stroke();
  } else {
    // 윗마디 (근육 볼록) → 아랫마디
    ctx.fillStyle = legColor(C, far);
    limb(ctx, L.rx, L.ry, L.kx, L.ky, wr, w1, fore ? 2.5 : 3.5); ctx.fill(); ctx.stroke();
    limb(ctx, L.kx, L.ky, L.fx, L.fy - 3.2, w1 * 0.8, w2, 0); ctx.fill(); ctx.stroke();
    if (!C.tint && !far) {   // 윤기
      ctx.strokeStyle = col(C, pal.hi); ctx.lineWidth = 1.2; ctx.globalAlpha *= 0.6;
      ctx.beginPath(); ctx.moveTo(lerp(L.rx, L.kx, 0.15) - 2, lerp(L.ry, L.kx === L.rx ? L.ry : L.ky, 0.15)); ctx.lineTo(lerp(L.rx, L.kx, 0.7) - 1.5, lerp(L.ry, L.ky, 0.7)); ctx.stroke();
      ctx.globalAlpha /= 0.6;
    }
  }
  // 발목 털 (그림메인 · 이그니스) / 발굽
  const hx = L.fx, hy = L.fy;
  if (!boar && !stag && !pal.bones) {
    ctx.fillStyle = col(C, far ? deep(pal.mane === '#ff7a1a' ? '#3a1a0c' : pal.dark) : (C.m.id === 'mt_ignis' ? '#5a2410' : pal.dark));
    ctx.beginPath(); ctx.moveTo(hx - 4.5, hy - 7); ctx.quadraticCurveTo(hx - 7, hy - 2, hx - 6, hy - 1); ctx.lineTo(hx + 4, hy - 2); ctx.quadraticCurveTo(hx + 4, hy - 6, hx + 2.5, hy - 8); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = col(C, far ? deep(pal.hoof) : pal.hoof); ctx.strokeStyle = OUT; ctx.lineWidth = 1;
  ctx.beginPath();
  if (boar) { ctx.moveTo(hx - 4, hy - 4); ctx.lineTo(hx + 5, hy - 3.5); ctx.lineTo(hx + 5.5, hy); ctx.lineTo(hx - 4.5, hy); ctx.closePath(); }
  else if (stag) { ctx.moveTo(hx - 2.5, hy - 4.5); ctx.lineTo(hx + 3, hy - 4); ctx.lineTo(hx + 4.5, hy); ctx.lineTo(hx - 3, hy); ctx.closePath(); }
  else { ctx.moveTo(hx - 4, hy - 4.5); ctx.lineTo(hx + 3.5, hy - 4.5); ctx.lineTo(hx + 5, hy); ctx.lineTo(hx - 4.5, hy); ctx.closePath(); }
  ctx.fill(); ctx.stroke();
  // 불타는 발굽 (이그니스) · 영혼불 (코슈타)
  if (C.fx && pal.fire && C.q > 0 && L.up < 0.5) glow(ctx, hx, hy - 3, far ? 5 : 7, C.aw ? pal.awake : pal.glow, 0.35 + 0.2 * flick(C.t, i));
}

function drawBody(ctx, C) {
  const { P, T, pal, m } = C, B = T.body;
  const boar = T.name === 'boar', stag = T.name === 'stag';
  ctx.save();
  ctx.translate(P.bx, P.by); ctx.rotate(P.ba);
  const rx = B.rx, ry = B.ry;
  // 몸통 윤곽: 가슴 → 기갑 → 등 → 엉덩이 → 배
  ctx.beginPath();
  if (boar) {
    ctx.moveTo(rx + 2, -2);
    ctx.quadraticCurveTo(rx, -ry - 6, rx - 16, -ry - 4);                   // 두툼한 어깨 혹
    ctx.quadraticCurveTo(-4, -ry - 1, -rx + 8, -ry + 2);
    ctx.quadraticCurveTo(-rx - 4, -ry + 6, -rx - 2, 3);
    ctx.quadraticCurveTo(-rx + 2, ry + 2, -rx + 14, ry + 2);
    ctx.quadraticCurveTo(0, ry + 7, rx - 10, ry + 1);                      // 처진 배
    ctx.quadraticCurveTo(rx + 5, ry - 3, rx + 2, -2);
  } else {
    ctx.moveTo(rx + 1, -1);
    ctx.quadraticCurveTo(rx - 2, -ry - 5, rx - 13, -ry - 2);                // 가슴 → 기갑
    ctx.quadraticCurveTo(-2, -ry + 4, -rx + 9, -ry - 1);                    // 등 (안장 자리 살짝 파임)
    ctx.quadraticCurveTo(-rx - 5, -ry + 1, -rx - 1, 3);                     // 엉덩이
    ctx.quadraticCurveTo(-rx + 3, ry + 2, -rx + 13, ry);                     // 뒷다리 위
    ctx.quadraticCurveTo(0, ry + 4, rx - 9, ry - 1);                         // 배
    ctx.quadraticCurveTo(rx + 3, ry - 2, rx + 1, -1);                        // 가슴 아래
  }
  ctx.closePath();
  if (C.tint || C.flash) ctx.fillStyle = col(C, pal.bones ? pal.coat : pal.coat);
  else ctx.fillStyle = grad(ctx, m.id + ':body', (g) => {
    const gr = g.createLinearGradient(0, -ry - 6, 0, ry + 6);
    gr.addColorStop(0, pal.hi); gr.addColorStop(0.35, pal.coat); gr.addColorStop(1, pal.dark);
    return gr;
  });
  ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
  if (!C.tint) {
    // 근육 윤곽 (어깨 · 엉덩이)
    ctx.strokeStyle = col(C, pal.dark); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(rx - 12, 0, ry * 0.8, -1.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(-rx + 12, -1, ry * 0.85, 2.4, 5.2); ctx.stroke();
    ctx.strokeStyle = col(C, pal.hi); ctx.globalAlpha *= 0.55; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(rx - 13, -ry - 1); ctx.quadraticCurveTo(-2, -ry + 4.5, -rx + 9, -ry); ctx.stroke();
    ctx.globalAlpha /= 0.55;
  }
  // 종류별 몸 장식
  if (pal.bones) bodySkeleton(ctx, C, rx, ry);
  if (m.id === 'mt_ignis') bodyLava(ctx, C, rx, ry);
  if (boar) bodyBristles(ctx, C, rx, ry);
  if (stag) bodyRuff(ctx, C, rx, ry);
  // 마구: 가슴받이 · 안장 천 · 안장 · 배띠
  tack(ctx, C, rx, ry);
  ctx.restore();
}
function bodySkeleton(ctx, C, rx, ry) {
  const { pal } = C;
  // 갈비 안 영혼불
  if (C.fx) glow(ctx, 2, 1, ry * 1.9, C.aw ? pal.awake : pal.glow, 0.45 + 0.15 * flick(C.t, 3));
  ctx.strokeStyle = col(C, pal.bone); ctx.lineWidth = 2.4;
  for (let k = -2; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 5.5 + 2, -ry + 2); ctx.quadraticCurveTo(k * 5.5 + 7, 1, k * 5.5 + 3, ry - 1); ctx.stroke(); }
  ctx.strokeStyle = OUT; ctx.lineWidth = 0.8;
  for (let k = -2; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 5.5 + 3.2, -ry + 2); ctx.quadraticCurveTo(k * 5.5 + 8.2, 1, k * 5.5 + 4.2, ry - 1); ctx.stroke(); }
  // 척추 · 골반
  ctx.fillStyle = col(C, pal.bone); ctx.strokeStyle = OUT; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(-rx + 9, -ry + 5, 9, 6, -0.3, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(rx - 9, -ry + 6, 7, 5, 0.3, 0, TAU); ctx.fill(); ctx.stroke();
}
function bodyLava(ctx, C, rx, ry) {
  const { pal } = C;
  const hot = C.aw ? pal.awake : pal.lava;
  ctx.strokeStyle = col(C, hot); ctx.lineWidth = 1.3;
  const k = 0.65 + 0.35 * flick(C.t * 0.6, 1);
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * k;
  ctx.beginPath();
  ctx.moveTo(rx - 6, -4); ctx.lineTo(rx - 12, 2); ctx.lineTo(rx - 10, 8);
  ctx.moveTo(4, -ry + 4); ctx.lineTo(0, -1); ctx.lineTo(5, 5); ctx.lineTo(1, ry - 2);
  ctx.moveTo(-rx + 8, -3); ctx.lineTo(-rx + 14, 3); ctx.lineTo(-rx + 11, 9);
  ctx.stroke();
  ctx.globalAlpha = ga;
  if (C.fx && C.q > 0) { glow(ctx, rx - 10, 3, 9, pal.glow, 0.3 * k); glow(ctx, 2, 2, 10, pal.glow, 0.25 * k); glow(ctx, -rx + 12, 3, 9, pal.glow, 0.3 * k); }
}
function bodyBristles(ctx, C, rx, ry) {
  const { pal } = C;
  ctx.strokeStyle = col(C, pal.mane); ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let k = 0; k < 12; k++) { const x = rx - 12 - k * 5.2, y = -ry - 2 + Math.abs(k - 3) * 0.35; ctx.moveTo(x, y + 2); ctx.lineTo(x - 3.5, y - 6 - (k % 3) * 1.6); }
  ctx.stroke();
  if (!C.tint) { ctx.strokeStyle = col(C, pal.dark); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8, 4); ctx.lineTo(3, 9); ctx.moveTo(-6, 2); ctx.lineTo(-10, 8); ctx.stroke(); }   // 흉터
}
function bodyRuff(ctx, C, rx, ry) {
  const { pal } = C;
  ctx.fillStyle = col(C, pal.hi); ctx.strokeStyle = OUT; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(rx - 4, -ry); ctx.quadraticCurveTo(rx + 7, -2, rx + 2, ry + 3); ctx.quadraticCurveTo(rx - 6, ry - 1, rx - 10, 2); ctx.quadraticCurveTo(rx - 9, -ry + 3, rx - 4, -ry); ctx.fill(); ctx.stroke();
}
/** 마구 (몸통 지역 좌표) */
function tack(ctx, C, rx, ry) {
  const { pal, m, T } = C;
  const sx = T.seat[0] - T.body.x, sy = T.seat[1] - T.body.y;   // 안장점 (몸통 좌표)
  const boar = T.name === 'boar';
  if (m.id === 'mt_warhorse') {
    // 강철 가슴판
    ctx.fillStyle = col(C, pal.steel); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(rx - 10, -ry + 1); ctx.quadraticCurveTo(rx + 4, -ry + 2, rx + 3, 4); ctx.quadraticCurveTo(rx, ry - 2, rx - 8, ry - 3); ctx.quadraticCurveTo(rx - 3, 0, rx - 10, -ry + 1); ctx.fill(); ctx.stroke();
    if (!C.tint) { ctx.fillStyle = col(C, pal.steelHi); for (const [x, y] of [[rx - 5, -ry + 4], [rx - 1, -2], [rx - 3, 5]]) { ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill(); } }
    // 강철 엉덩이 판
    ctx.fillStyle = col(C, pal.steel);
    ctx.beginPath(); ctx.moveTo(-rx + 12, -ry - 1); ctx.quadraticCurveTo(-rx - 3, -ry + 1, -rx - 1, 5); ctx.lineTo(-rx + 9, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (!boar) {
    // 안장 천 (진홍 · 금 술)
    const clothTop = sy - 1, clothBot = Math.min(ry + 1, sy + 17);
    ctx.fillStyle = col(C, pal.cloth); ctx.strokeStyle = OUT; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(sx - 13, clothTop); ctx.lineTo(sx + 11, clothTop - 1); ctx.lineTo(sx + 12, clothBot); ctx.lineTo(sx - 14, clothBot + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (!C.tint) {
      ctx.strokeStyle = col(C, pal.trim); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sx - 13.5, clothBot); ctx.lineTo(sx + 11.5, clothBot - 1); ctx.stroke();
      if (m.id === 'mt_warhorse' && C.q > 0) { ctx.lineWidth = 0.8; ctx.beginPath(); for (let x = sx - 13; x <= sx + 11; x += 2.2) { ctx.moveTo(x, clothBot + 0.5); ctx.lineTo(x - 0.3, clothBot + 3); } ctx.stroke(); }
      if (m.id === 'mt_silva') { ctx.fillStyle = col(C, pal.leaf); for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(rx - 6 - k * 2.2, -ry + 3 + k * 4.2, 2.6, 1.4, 0.6 + k * 0.3, 0, TAU); ctx.fill(); } }
    }
  } else {
    // 멧돼지 가죽 마구 (가슴 · 배 · 쇠고리)
    ctx.strokeStyle = col(C, pal.leather); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(rx - 4, -ry + 2); ctx.lineTo(rx - 9, ry); ctx.moveTo(sx + 9, sy); ctx.lineTo(sx + 5, ry + 2); ctx.moveTo(sx - 10, sy); ctx.lineTo(sx - 12, ry + 3); ctx.stroke();
    if (!C.tint) { ctx.fillStyle = col(C, pal.steel); for (const [x, y] of [[rx - 6, 3], [sx + 7, 6], [sx - 11, 7]]) { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, TAU); ctx.fill(); } }
  }
  // 안장 (앞뒤 턱)
  ctx.fillStyle = col(C, pal.leather); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(sx - 10, sy + 1); ctx.quadraticCurveTo(sx - 11, sy - 5, sx - 8, sy - 5.5);   // 뒤 턱
  ctx.quadraticCurveTo(sx, sy - 1, sx + 7, sy - 4);                                       // 앉는 곳
  ctx.quadraticCurveTo(sx + 10, sy - 7, sx + 10.5, sy - 3);                              // 앞 턱
  ctx.lineTo(sx + 9, sy + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (!C.tint) { ctx.strokeStyle = col(C, m.id === 'mt_silva' ? pal.trim : shade(pal.leather, 0.35)); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(sx - 7, sy - 3.5); ctx.quadraticCurveTo(sx, sy + 0.2, sx + 7, sy - 2.5); ctx.stroke(); }
  // 배띠
  ctx.strokeStyle = col(C, pal.leather); ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(sx + 3, sy); ctx.lineTo(sx + 2, ry + (boar ? 3 : 1)); ctx.stroke();
}

function drawNeck(ctx, C) {
  const { P, T, pal, m } = C;
  const boar = T.name === 'boar', stag = T.name === 'stag';
  const x0 = P.nx, y0 = P.ny, x1 = P.hx, y1 = P.hy;
  const w0 = boar ? 26 : stag ? 15 : 20, w1 = boar ? 20 : stag ? 9 : 12;
  ctx.fillStyle = col(C, pal.bones ? pal.coat : pal.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  limb(ctx, x0, y0, x1, y1, w0, w1, boar ? 3 : 4); ctx.fill(); ctx.stroke();
  if (pal.bones) {   // 목뼈
    ctx.fillStyle = col(C, pal.bone); ctx.lineWidth = 0.9;
    for (let k = 0; k < 5; k++) { const u = 0.1 + k * 0.19; ctx.beginPath(); ctx.ellipse(lerp(x0, x1, u) - 2, lerp(y0, y1, u), 3.4, 2.4, P.na, 0, TAU); ctx.fill(); ctx.stroke(); }
  }
  // 갈기: 목 윗선을 따라 (말 · 해골마 · 이그니스 = 머리카락/불꽃, 사슴 = 목털, 멧돼지 = 뻣뻣한 털)
  const nx = Math.sin(P.na), ny = -Math.cos(P.na);        // 목의 위쪽 법선 (진행 방향 왼쪽)
  const k0 = C.q === 0 ? 5 : 8;
  const flame = !!pal.fire;
  const mc = col(C, C.aw && flame ? pal.awake : pal.mane);
  const t = C.t, blow = P.mane;
  if (!boar) {
    ctx.strokeStyle = mc; ctx.lineWidth = stag ? 2.2 : 3;
    ctx.beginPath();
    for (let k = 0; k < k0; k++) {
      const u = k / (k0 - 1) * 0.92, bx = lerp(x0, x1, u) + nx * (lerp(w0, w1, u) / 2 - 1.5), by = lerp(y0, y1, u) + ny * (lerp(w0, w1, u) / 2 - 1.5);
      const len = (stag ? 5 : flame ? 12 : 11) * (1 - u * 0.35), sw = C.q === 0 ? 0 : Math.sin(t * (flame ? 9 : 4) + k * 1.3) * (flame ? 3 : 1.6);
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - 4 - blow * 4, by - 2 + sw * 0.5, bx - 7 - blow * 9 + sw, by + len * (flame ? -0.4 : 0.5));
    }
    ctx.stroke();
    if (!C.tint && !stag) {
      ctx.strokeStyle = col(C, C.aw && flame ? '#ffffff' : pal.maneHi); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < k0; k += 2) { const u = k / (k0 - 1) * 0.9, bx = lerp(x0, x1, u) + nx * (lerp(w0, w1, u) / 2), by = lerp(y0, y1, u) + ny * (lerp(w0, w1, u) / 2); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 3, by - 2, bx - 6 - blow * 6, by + 3); }
      ctx.stroke();
    }
    // 각성 그림메인: 갈기 끝 불씨
    if (C.fx && C.aw && m.id === 'mt_warhorse') for (let k = 1; k < k0; k += 2) { const u = k / (k0 - 1) * 0.9; glow(ctx, lerp(x0, x1, u) + nx * 8 - 7 - blow * 8, lerp(y0, y1, u) + ny * 8 + 4, 4, pal.awake, 0.5 * flick(t, k)); }
  } else {
    ctx.strokeStyle = mc; ctx.lineWidth = 1.8; ctx.beginPath();
    for (let k = 0; k < 5; k++) { const u = k / 4, bx = lerp(x0, x1, u) + nx * (lerp(w0, w1, u) / 2), by = lerp(y0, y1, u) + ny * (lerp(w0, w1, u) / 2); ctx.moveTo(bx, by); ctx.lineTo(bx - 4, by - 7 - (k % 2) * 2); }
    ctx.stroke();
  }
}

function drawHead(ctx, C) {
  const { P, T, pal, m } = C;
  const H = T.head, L = H.len;
  const boar = T.name === 'boar', stag = T.name === 'stag';
  ctx.save();
  ctx.translate(P.hx, P.hy); ctx.rotate(P.ha);
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;
  const jaw = P.jaw ?? 0;
  if (boar) {
    // 멧돼지: 큰 머리통 → 주둥이 · 강철 엄니 · 코 고리
    ctx.fillStyle = col(C, pal.coat);
    ctx.beginPath(); ctx.moveTo(-6, -12); ctx.quadraticCurveTo(L * 0.5, -13, L - 2, -5); ctx.lineTo(L + 1, 3); ctx.quadraticCurveTo(L * 0.5, 12 + jaw * 4, -5, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col(C, '#6a4632'); ctx.beginPath(); ctx.ellipse(L + 0.5, -0.5, 3.2, 5.5, 0, 0, TAU); ctx.fill(); ctx.stroke();                // 코
    ctx.fillStyle = col(C, pal.coat); ctx.beginPath(); ctx.moveTo(-1, -11); ctx.lineTo(-5, -20 - P.ear * 2); ctx.lineTo(5, -12); ctx.closePath(); ctx.fill(); ctx.stroke();   // 귀
    // 엄니 (상아 + 강철 덮개; 각성 = 녹은 주황 날)
    ctx.fillStyle = col(C, pal.tusk); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(L - 7, 6); ctx.quadraticCurveTo(L + 6, 9, L + 7, -5); ctx.quadraticCurveTo(L + 3, 4, L - 6, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col(C, C.aw ? '#ff7a2a' : pal.steel); ctx.beginPath(); ctx.moveTo(L + 3.5, 1.5); ctx.quadraticCurveTo(L + 6.5, 1, L + 7, -5); ctx.lineTo(L + 4.5, -1); ctx.closePath(); ctx.fill();
    if (C.fx && C.aw) glow(ctx, L + 5, -1, 6, pal.awake, 0.5);
    ctx.strokeStyle = col(C, pal.steel); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(L + 1.5, 4, 2.4, -0.5, PI + 0.5); ctx.stroke();       // 코 고리
    eye(ctx, C, L * 0.42, -5, 1.8);
  } else if (pal.bones) {
    // 해골 말머리
    ctx.fillStyle = col(C, pal.bone);
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(L * 0.55, -9, L, -3); ctx.lineTo(L - 1, 2); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.translate(4, 3); ctx.rotate(jaw * 0.4);                                    // 아래턱 (따닥)
    ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(L - 6, 0); ctx.lineTo(L - 8, 4); ctx.quadraticCurveTo(L * 0.4, 6, -5, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.beginPath(); for (let x = L * 0.45; x < L - 6; x += 2.2) { ctx.moveTo(x, -0.5); ctx.lineTo(x, 1.8); } ctx.stroke();
    ctx.restore();
    ctx.fillStyle = col(C, '#141018'); ctx.beginPath(); ctx.ellipse(L * 0.3, -3, 3.4, 3, 0, 0, TAU); ctx.fill();          // 눈구멍
    ctx.beginPath(); ctx.ellipse(L - 3, -2.5, 1.6, 1.2, 0, 0, TAU); ctx.fill();
    if (!C.tint) { const ec = C.aw ? pal.awake : pal.eye; if (C.fx) glow(ctx, L * 0.3, -3, 7, ec, 0.8); ctx.fillStyle = ec; ctx.beginPath(); ctx.arc(L * 0.3, -3, 1.6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = col(C, pal.bone); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-1, -7); ctx.lineTo(-4, -15 - P.ear * 2); ctx.lineTo(4, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else {
    // 말 · 사슴 머리
    const hl = stag ? L : L;
    ctx.fillStyle = col(C, pal.coat);
    ctx.beginPath(); ctx.moveTo(-5, -8); ctx.quadraticCurveTo(hl * 0.55, -9.5, hl, -4); ctx.quadraticCurveTo(hl + 3, 1, hl - 1, 5 + jaw * 3); ctx.quadraticCurveTo(hl * 0.4, 8, -5, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (!C.tint) { ctx.strokeStyle = col(C, pal.hi); ctx.globalAlpha *= 0.5; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -7.5); ctx.quadraticCurveTo(hl * 0.5, -8.6, hl - 2, -4.5); ctx.stroke(); ctx.globalAlpha /= 0.5; }
    // 귀 (젖힘)
    ctx.fillStyle = col(C, pal.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-4 - P.ear * 3, -16 + P.ear * 3); ctx.lineTo(5, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (m.id === 'mt_warhorse') {   // 강철 면갑
      ctx.fillStyle = col(C, pal.steel);
      ctx.beginPath(); ctx.moveTo(1, -8.5); ctx.lineTo(hl - 3, -5); ctx.lineTo(hl - 5, 2); ctx.lineTo(3, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!C.tint) { ctx.strokeStyle = col(C, pal.steelHi); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(3, -6.5); ctx.lineTo(hl - 5, -3.8); ctx.stroke(); }
    }
    if (m.id === 'mt_ignis' && !C.tint) {   // 용암 균열 · 쇠사슬 굴레
      ctx.strokeStyle = col(C, C.aw ? pal.awake : pal.lava); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(8, -2); ctx.lineTo(13, -4); ctx.stroke();
    }
    if (stag) antlers(ctx, C);
    // 굴레 (가죽 끈 · 재갈)
    if (!C.tint && !stag) { ctx.strokeStyle = col(C, m.id === 'mt_ignis' ? '#5a5048' : pal.leather); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(4, 6); ctx.moveTo(3, 1); ctx.lineTo(hl - 4, 3); ctx.stroke(); }
    eye(ctx, C, hl * 0.33, -3.5, stag ? 1.5 : 1.8);
  }
  ctx.restore();
}
function eye(ctx, C, x, y, r) {
  if (C.tint) return;
  const { pal, P } = C;
  const ec = C.aw && pal.awake && C.m.id !== 'mt_silva' ? pal.awake : pal.eye;
  if (C.fx) glow(ctx, x, y, r * 4.5, ec, 0.55);
  ctx.fillStyle = ec;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * Math.max(0.15, 1 - P.blink), 0, 0, TAU); ctx.fill();
}
function antlers(ctx, C) {
  const { pal, P } = C;
  const gc = C.aw ? pal.awake : pal.glow;
  if (C.fx && C.q > 0) glow(ctx, -3, -24, 22, gc, 0.28 + 0.25 * (P.howl ?? 0));
  ctx.strokeStyle = col(C, pal.antler); ctx.lineWidth = 2.2;
  ctx.beginPath();
  // 두 갈래 (먼 쪽은 약간 뒤) : 줄기 → 가지
  for (const [ox, s] of [[-2, 0.9], [2, 1]]) {
    ctx.moveTo(ox + 1, -8); ctx.quadraticCurveTo(ox - 6 * s, -20 * s, ox - 13 * s, -30 * s);
    ctx.moveTo(ox - 4 * s, -16 * s); ctx.lineTo(ox + 3 * s, -25 * s);
    ctx.moveTo(ox - 8 * s, -23 * s); ctx.lineTo(ox - 5 * s, -33 * s);
    ctx.moveTo(ox - 11 * s, -27 * s); ctx.lineTo(ox - 19 * s, -31 * s);
  }
  ctx.stroke();
  if (!C.tint) {
    ctx.fillStyle = col(C, pal.leaf);
    for (const [x, y, a] of [[-6, -18, 0.6], [1, -24, -0.4], [-12, -28, 0.9], [-4, -31, -0.2]]) { ctx.beginPath(); ctx.ellipse(x, y, 2.4, 1.2, a, 0, TAU); ctx.fill(); }
    if (C.aw) { ctx.fillStyle = '#ffe8f4'; for (const [x, y] of [[-9, -25], [2, -21]]) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill(); } }
  }
}

function drawTail(ctx, C) {
  const { P, T, pal, m } = C;
  const n = P.ta.length, seg = P.tl;
  const stag = T.name === 'stag', boar = T.name === 'boar';
  const flame = !!pal.fire;
  let x = P.tx, y = P.ty;
  if (boar) {   // 가는 꼬리 + 털 뭉치
    ctx.strokeStyle = col(C, pal.dark); ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < n; k++) { x += Math.cos(P.ta[k]) * seg; y += Math.sin(P.ta[k]) * seg; ctx.lineTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = col(C, pal.mane); ctx.beginPath(); ctx.ellipse(x, y + 1, 2.2, 3.4, P.ta[n - 1] - PI / 2, 0, TAU); ctx.fill();
    return;
  }
  if (stag) {   // 짧고 폭신한 꼬리
    const a = P.ta[0];
    ctx.fillStyle = col(C, pal.hi); ctx.strokeStyle = OUT; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 7, 4.2, a, 0, TAU); ctx.fill(); ctx.stroke();
    return;
  }
  // 말꼬리: 가닥 여러 개 (불꽃이면 가산 빛)
  const pts = TPTS;
  pts[0] = x; pts[1] = y;
  for (let k = 0; k < n; k++) { x += Math.cos(P.ta[k]) * seg; y += Math.sin(P.ta[k]) * seg; pts[k * 2 + 2] = x; pts[k * 2 + 3] = y; }
  const base = col(C, C.aw && flame ? pal.awake : pal.mane);
  const strands = C.q === 0 ? 2 : 4;
  for (let s = 0; s < strands; s++) {
    const off = (s - (strands - 1) / 2) * 2.2, w = 5.5 - Math.abs(off) * 0.8;
    ctx.strokeStyle = s % 2 ? base : col(C, pal.maneHi ?? base); ctx.lineWidth = s % 2 ? w : w * 0.55;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let k = 1; k <= n; k++) {
      const wob = C.q === 0 ? 0 : Math.sin(C.t * (flame ? 10 : 3) + k * 1.1 + s) * (flame ? 1.8 : 0.8) * k / n;
      ctx.lineTo(pts[k * 2] + off * k / n * 1.4 + wob, pts[k * 2 + 1] + Math.abs(off) * 0.3);
    }
    ctx.stroke();
  }
  if (C.fx && flame) for (let k = 2; k <= n; k += 1 + (C.q < 2 ? 1 : 0)) glow(ctx, pts[k * 2], pts[k * 2 + 1], 6 + k, C.aw ? pal.awake : pal.glow, 0.28 * flick(C.t, k + 7));
  void m;
}
const TPTS = new Float32Array(24);

/** 뒤 층 효과: 이그니스 불갈기 · 코슈타 영혼불 · 콧김 · 각성 불티 (시간 함수, 입자 없음) */
function drawFxBack(ctx, C) {
  const { P, pal, m, t, q } = C;
  const nx = P.hx + Math.cos(P.ha) * C.T.head.len, ny = P.hy + Math.sin(P.ha) * C.T.head.len;   // 콧구멍 근처
  if (P.snort > 0.05 && m.id !== 'mt_silva') {
    const c = m.id === 'mt_ignis' ? pal.glow : m.id === 'mt_skelsteed' ? pal.glow : '#b8b8c0';
    for (let k = 0; k < (q ? 3 : 1); k++) glow(ctx, nx + 3 + k * 4 * P.snort, ny + 2 - k * 1.5, 3 + k * 2 * P.snort, c, 0.35 * P.snort * (1 - k * 0.25));
  }
  if (pal.fire && q > 0) {
    // 갈기 불꽃 혀 (목 위 가산)
    const n = q === 2 ? 4 : 2, fc = C.aw ? pal.awake : pal.glow;
    for (let k = 0; k < n; k++) {
      const u = 0.15 + k / n * 0.75, x = lerp(P.nx, P.hx, u) - 4, y = lerp(P.ny, P.hy, u) - 7;
      glow(ctx, x - P.mane * 5, y - 3 * flick(t, k), 7 + 2 * flick(t * 1.3, k + 3) + P.fire * 3, fc, 0.3 + 0.12 * P.fire);
    }
  }
  if (C.aw && m.id === 'mt_warhorse' && q > 0) {   // 각성: 마구 불씨 균열
    const B = C.T.body;
    for (let k = 0; k < 3; k++) glow(ctx, P.bx + B.rx - 8 - k * 18, P.by + 3 - (k % 2) * 4, 5, pal.awake, 0.3 + 0.2 * flick(t, k));
  }
}

// ───────────────────────── 벡터: front 층 ─────────────────────────
/** 재갈 위치 (채색이면 머리 부품의 'bit' 점) */
const _bit = [0, 0];
function bitPt(C) {
  const { P, T, rig } = C;
  const H = rig?.parts?.head;
  if (H?.bit) return headPt(PD, C, H, 'bit', P.na - T.neck.a, _bit);
  const hl = T.head.len;
  _bit[0] = P.hx + Math.cos(P.ha) * hl * 0.8 - Math.sin(P.ha) * 3; _bit[1] = P.hy + Math.sin(P.ha) * hl * 0.8 + Math.cos(P.ha) * 3;
  return _bit;
}
function reinStyle(ctx, C) {
  const { pal, m } = C, chain = pal.bones || m.id === 'mt_ignis';
  ctx.strokeStyle = col(C, chain ? '#6a6660' : '#3a2418'); ctx.lineWidth = chain ? 1.4 : 1.1;
  if (chain) ctx.setLineDash([2, 1.5]);
  return chain;
}
/** 등자 쇠 (발바닥 아래) */
function stirrupIron(ctx, C, fx, fy) {
  const { T, pal } = C;
  const iron = pal.bones ? pal.steel : T.name === 'stag' ? pal.trim : pal.steel;
  ctx.strokeStyle = C.tint ? C.tint : OUT; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(fx - 4.5, fy); ctx.lineTo(fx - 2.5, fy - 3.5); ctx.lineTo(fx + 2.5, fy - 3.5); ctx.lineTo(fx + 4.5, fy); ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = col(C, iron); ctx.lineWidth = 1.2; ctx.stroke();
}
function vecFront(ctx, C) {
  if (!C.ridden) return;                                   // 기수 없음: 마구는 back 층에서 다 그렸다
  const { P, m } = C;
  const sx = P.sl.x, sy = P.sl.y;
  // 등자 (기수 발바닥 아래: 안장 + (9, footY + 4)). 끈은 back 층(tackBack) — 기수 다리 뒤로 지나간다
  stirrupIron(ctx, C, sx + 9, sy + (m.def?.footY ?? 22) + 4);
  // 고삐: 재갈 → 기수 손 (안장 앞 위)
  const [bx, by] = bitPt(C), rx = sx + 12, ry = sy - 14;
  const chain = reinStyle(ctx, C);
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo((bx + rx) / 2, Math.max(by, ry) + 8, rx, ry); ctx.stroke();
  if (chain) ctx.setLineDash([]);
}
/** back 층 마구 (몸 앞, 기수 뒤): 등자 끈. 기수가 없으면 늘어진 고삐 + 매달린 등자까지 */
function tackBack(ctx, C) {
  const { P, pal, m } = C;
  const sx = P.sl.x, sy = P.sl.y;
  const drop = C.ridden ? (m.def?.footY ?? 22) + 4 : ((m.def?.footY ?? 22) + 4) * 0.62;
  const fx = sx + (C.ridden ? 9 : 3), fy = sy + drop;
  ctx.strokeStyle = C.tint ? C.tint : OUT; ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.moveTo(sx + 2, sy + 1); ctx.lineTo(fx, fy - 3.5); ctx.stroke();
  ctx.strokeStyle = col(C, pal.leather); ctx.lineWidth = 1.5; ctx.stroke();
  if (C.ridden) return;
  stirrupIron(ctx, C, fx, fy);
  // 고삐: 재갈 → 안장 앞 (목 위로 늘어짐)
  const [bx, by] = bitPt(C), rx = sx + 9, ry = sy - 2;
  const chain = reinStyle(ctx, C);
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo((bx + rx) / 2, Math.max(by, ry) + 6, rx, ry); ctx.stroke();
  if (chain) ctx.setLineDash([]);
}

// ───────────────────────── 채색 퍼핏 (네발) ─────────────────────────
// 부품 (manifest, tools/painted/companions/<id>/config.json): body(hp·sh·seat·neck·tail·… 피벗) · head(목+머리, base·poll·muzzle·eye·…) ·
// foreU/foreL · hindU/hindL (a = 윗관절, b = 아랫관절/발굽 바닥) · tail (a 뿌리 → b 끝, 가로 띠로 잘라 꼬리 사슬을 따라 굽힌다).
// 관절 위치는 리그 포즈(MOUNT_TUNE = 그림에서 잰 치수)에서 오고, 부품은 그 관절에 맞춰 돌린다. 먼 다리 = 가까운 다리의 어두운 변형.
// 모듈(src/render/painted/companions/<id>.js)이 rig.mount = { tint: 'aw'|null, fx: {...} } 를 붙여 이 그리기를 켠다.
const PD = new Drawer();
const _q = [0, 0], _e = [0, 0];
function partGeo(p) {
  if (p._g) return p._g;
  const a = p.a ?? [0, 0], b = p.b ?? [0, p.h];
  p._g = { ang: Math.atan2(b[1] - a[1], b[0] - a[0]), len: Math.hypot(b[0] - a[0], b[1] - a[1]) * p.k };
  return p._g;
}
/** 부품 한 장 (유령 = 구운 발광 실루엣) */
function pput(D, C, p, pv, x, y, rot, sx, sy, deep, tk) {
  if (!p) return;
  if (C.tint) { const im = p.v.glow ?? p.v.flash; if (im) { const q = typeof pv === 'string' ? p[pv] : pv; D.img(im, q[0], q[1], x, y, rot, sx, sy, 1); } return; }
  D.part(p, pickVariant(p, 0, deep, tk), pv, x, y, rot, sx, sy, 1);
}
function pLeg(D, C, U, Lw, L, len1, len2, deep, tk) {
  if (!U || !Lw) return;
  const gu = partGeo(U), gl = partGeo(Lw);
  const s1 = U.k * clamp(len1 / (gu.len || len1), 0.8, 1.25), s2 = Lw.k * clamp(len2 / (gl.len || len2), 0.8, 1.25);
  pput(D, C, Lw, 'a', L.kx, L.ky, L.a2 - gl.ang, s2, s2, deep, tk);
  pput(D, C, U, 'a', L.rx, L.ry, L.a1 - gu.ang, s1, s1, deep, tk);
}
/** 꼬리: 부품을 a→b 방향 가로 띠로 잘라 사슬 마디 각도대로 이어 붙인다 */
function pTail(D, ctx, C, Tp, tk) {
  if (!Tp) return;
  const P = C.P, n = P.ta.length;
  const img = C.tint ? (Tp.v.glow ?? Tp.v.flash) : pickVariant(Tp, 0, false, tk);
  if (!img) return;
  const g = partGeo(Tp), a = Tp.a, b = Tp.b, k = Tp.k;
  const H = img.height, W = img.width;
  const lo = C.q === 0 ? Math.min(n, 2) : n;                // low: 띠 두 개
  const ov = ctx.globalAlpha < 0.98 ? 0 : 1;                  // 반투명(소환·해산)일 때 띠를 겹치면 줄무늬가 보인다
  let wx = P.tx, wy = P.ty;
  for (let i = 0; i < lo; i++) {
    const u0 = i / lo, u1 = (i + 1) / lo;
    const ax = a[0] + (b[0] - a[0]) * u0, ay = a[1] + (b[1] - a[1]) * u0;
    const y0 = i === 0 ? 0 : Math.floor(ay) - ov, y1 = i === lo - 1 ? H : Math.floor(a[1] + (b[1] - a[1]) * u1) + ov;
    const ang = P.ta[Math.min(n - 1, Math.round(i * n / lo))];
    D.set(ax, ay, wx, wy, ang - g.ang, k, k);
    if (y1 > y0) ctx.drawImage(img, 0, y0, W, y1 - y0, 0, y0, W, y1 - y0);
    const seg = g.len / lo;
    wx += Math.cos(ang) * seg; wy += Math.sin(ang) * seg;
  }
}
function paintedQuad(ctx, C, layer, rig) {
  if (layer === 'front') { C.rig = rig; vecFront(ctx, C); return; }
  const { P, T, m } = C, R = rig.parts, D = PD;
  C.rig = rig;
  const tk = C.aw && rig.mount.tint && rig.tintKeys?.includes(rig.mount.tint) ? rig.mount.tint : null;
  // 발밑 그림자
  if (!C.tint && m.onGround !== false) {
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.34; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse((T.sh[0] + T.hp[0]) / 2, 0, (T.sh[0] - T.hp[0]) / 2 + 12, 3.6, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = ga;
  }
  D.begin(ctx);
  if (C.flash) D.startFlash();
  pTail(D, ctx, C, R.tail, tk);
  pLeg(D, C, R.hindU, R.hindL, P.legs[0], T.l1h, T.l2h, true, tk);
  pLeg(D, C, R.foreU, R.foreL, P.legs[1], T.l1f, T.l2f, true, tk);
  const B = R.body, k = B.k, L2 = P.legs[2];
  pput(D, C, B, 'hp', L2.rx, L2.ry, P.pitch, k * (P.stretch ?? 1), k, false, tk);
  const H = R.head, hr = P.na - T.neck.a;
  pput(D, C, H, 'base', P.nx, P.ny, hr, k, k, false, tk);
  pLeg(D, C, R.hindU, R.hindL, P.legs[2], T.l1h, T.l2h, false, tk);
  pLeg(D, C, R.foreU, R.foreL, P.legs[3], T.l1f, T.l2f, false, tk);
  if (C.flash) D.flash(0.62);
  D.end();
  tackBack(ctx, C);
  if (!C.tint) paintedFx(ctx, C, rig, D, hr);
}
/** 머리 부품의 점 → 지역 좌표 */
function headPt(D, C, H, name, hr, out) {
  const q = H?.[name];
  if (!q) return null;
  return D.pt(H.base[0], H.base[1], q[0], q[1], C.P.nx, C.P.ny, hr, H.k, H.k, out);
}
function bodyPt(D, C, B, name, out) {
  const q = B?.[name];
  if (!q) return null;
  const L2 = C.P.legs[2];
  return D.pt(B.hp[0], B.hp[1], q[0], q[1], L2.rx, L2.ry, C.P.pitch, B.k * (C.P.stretch ?? 1), B.k, out);
}
/** 불꽃 혀 (가산 퍼프 몇 겹; 시간 함수라 Math.random 없음) */
function flames(ctx, x, y, ang, len, w, n, t, seed, col, core, a) {
  if (a <= 0.01) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  const img = puff(col, false), imgC = puff(core, true);
  for (let i = 0; i < n; i++) {
    const h = flick(seed, i * 1.7);
    const aa = ang + (i - (n - 1) / 2) * 0.28 + Math.sin(t * 6 + i * 2.1 + seed) * 0.14;
    const L = len * (0.65 + h * 0.5) * (0.85 + 0.15 * Math.sin(t * 11 + i * 1.7 + seed));
    const c = Math.cos(aa), s = Math.sin(aa);
    for (let j = 0; j < 3; j++) {
      const u = (j + 0.5) / 3, wob = Math.sin(t * 9 + i * 1.3 + u * 5 + seed) * w * 0.6 * u;
      const px = x + c * L * u - s * wob, py = y + s * L * u + c * wob, r = w * (1.1 - u * 0.7);
      ctx.globalAlpha = ga * a * (1 - u * 0.45);
      ctx.drawImage(j === 0 ? imgC : img, px - r, py - r, r * 2, r * 2);
    }
  }
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
/** 채색 탈것 효과: 눈빛 · 불갈기 · 영혼불 · 뿔빛 · 콧김 · 각성 불씨 (mount 모듈의 fx 표) */
function paintedFx(ctx, C, rig, D, hr) {
  const { P, pal, t, q } = C, R = rig.parts, fx = rig.mount.fx ?? {};
  const aw = C.aw;
  const glowC = aw ? (fx.awGlow ?? pal.awake) : (fx.glow ?? pal.glow);
  // 눈
  if (headPt(D, C, R.head, 'eye', hr, _e)) {
    const ec = aw && fx.awEye ? fx.awEye : fx.eye ?? pal.eye;
    const er = fx.eyeR ?? 3.2;
    glow(ctx, _e[0], _e[1], er + (P.hurt ?? 0) * 1.5, ec, 0.75 * (1 - P.blink * 0.8));
    if (C.fx && q > 0) glow(ctx, _e[0], _e[1], er * 2.2, ec, 0.24);
  }
  if (!C.fx) return;
  // 불갈기 · 영혼불 갈기 (목 위 점들)
  const mane = aw && fx.awMane ? fx.awMane : fx.mane;
  if (mane && q > 0) {
    const n = q === 2 ? 3 : 2, up = -PI / 2 - 0.5 - P.mane * 0.6;
    for (const name of mane) {
      if (!headPt(D, C, R.head, name, hr, _q)) continue;
      flames(ctx, _q[0], _q[1], up, fx.maneLen ?? 9, fx.maneW ?? 3.2, n, t, name.length + _q[0] * 0.01, glowC, fx.core ?? '#fff4c8', (fx.maneA ?? 0.55) + P.fire * 0.25);
    }
  }
  // 몸의 빛 (갈비 속 영혼불 · 용암 균열 · 각성 불씨)
  const bodyGlows = aw && fx.awBody ? fx.awBody : fx.body;
  if (bodyGlows) for (const [name, r, a0] of bodyGlows) {
    if (!bodyPt(D, C, R.body, name, _q)) continue;
    glow(ctx, _q[0], _q[1], r, glowC, a0 * (0.75 + 0.25 * flick(t, r)) * (q === 0 ? 0.6 : 1));
  }
  // 머리의 빛 (뿔 · 엄니)
  const headGlows = aw && fx.awHead ? fx.awHead : fx.head;
  if (headGlows && q > 0) for (const [name, r, a0] of headGlows) {
    if (!headPt(D, C, R.head, name, hr, _q)) continue;
    glow(ctx, _q[0], _q[1], r * (1 + (P.howl ?? 0) * 0.6), glowC, a0 * (0.8 + 0.2 * flick(t, r + 1)) + (P.howl ?? 0) * 0.3);
  }
  // 꼬리 불꽃
  if (fx.tailFire && q > 0) {
    let x = P.tx, y = P.ty;
    for (let i = 0; i < P.ta.length; i++) {
      x += Math.cos(P.ta[i]) * P.tl; y += Math.sin(P.ta[i]) * P.tl;
      if (i % (q === 2 ? 1 : 2) === 0) glow(ctx, x, y, 4 + i * 0.8, glowC, 0.25 * flick(t, i + 3));
    }
  }
  // 발굽 불빛
  if (fx.hoofs) for (let i = 0; i < 4; i++) { const L = P.legs[i]; glow(ctx, L.fx, L.fy - 2, i < 2 ? 4 : 5.5, glowC, (i < 2 ? 0.22 : 0.35) * (0.7 + 0.3 * flick(t, i))); }
  // 콧김 (대기)
  if (P.snort > 0.05 && fx.snort !== false && headPt(D, C, R.head, 'muzzle', hr, _q)) {
    const c = fx.snort ?? '#b8b8c0';
    for (let k = 0; k < (q ? 3 : 1); k++) glow(ctx, _q[0] + 3 + k * 4 * P.snort, _q[1] + 1 - k * 1.5, 2.5 + k * 2 * P.snort, c, 0.35 * P.snort * (1 - k * 0.25));
  }
}

// ───────────────────────── 아이콘 ─────────────────────────
const ICON_POSE = new Map();
/** 절차적 머리 아이콘: 원 (x, y, r) 안에 탈것 머리를 그린다 (초상화가 없을 때) */
export function drawMountIcon(ctx, id, x, y, r) {
  if (!(r > 0)) return;
  const fB = MB.MOUNT_ICON_B?.[id];
  if (typeof fB === 'function') { fB(ctx, id, x, y, r); return; }
  const pal = MOUNT_PAL[id];
  if (!pal) return;
  let v = ICON_POSE.get(id);
  if (!v) {
    const rig = id === 'mt_boar' ? 'boar' : id === 'mt_silva' ? 'stag' : 'horse';
    v = { id, rig, def: null, anim: 'idle', animT: 0, t: 1.3, cx: 0, bottom: 0, facing: 1, onGround: true, speedK: 0, phase: 0, pitch: 0, rearK: 0, pose: null, awakened: false };
    v.pose = RIG.mountPose(v, 0);
    ICON_POSE.set(id, v);
  }
  const P = v.pose;
  if (!P) return;
  const T = RIG.templateFor(v);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  const s = r / (T.name === 'boar' ? 22 : 26);
  ctx.translate(x, y); ctx.scale(s, s);
  // 머리 중심이 원 가운데 오도록
  const hcx = P.hx + Math.cos(P.ha) * T.head.len * 0.4, hcy = P.hy + Math.sin(P.ha) * T.head.len * 0.4 + (T.name === 'stag' ? -8 : 0);
  ctx.translate(-hcx, -hcy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const C = S0;
  C.m = v; C.P = P; C.T = T; C.pal = pal; C.tint = null; C.flash = false; C.fx = true; C.q = 1; C.t = 1.3; C.aw = false; C.world = null; C.f = 1;
  drawNeck(ctx, C); drawHead(ctx, C);
  ctx.restore();
}
