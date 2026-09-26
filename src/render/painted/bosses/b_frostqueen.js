// 서리 여왕 이자벨라 (b_frostqueen) — 채색 컷아웃 퍼핏 렌더러
// 부품 (Kling): 머리 2종(차가운 미소 / 턱이 찢어지게 벌어진 비명 — 교차 전환) · 금 간 도자기 몸통(얼음 심장) ·
//   얼어붙은 희생자 얼굴·손이 갇힌 얼음 종 치마 · 얼음 칼날 부채 깃(후광) · 팔 3종(발톱 손 / 편 손 / 3페이즈의 뼈 팔) ·
//   바닥에서 기어오르는 얼어붙은 희생자 4종 · 얼음 파편 9종 · 위험 지대용 얼음 기둥/고드름/가시 덩어리 · 망토 천 무늬
// 절차적 층: verlet 얼음 비단 망토(채색 무늬 + 캐시 그라디언트, 바람·눈보라에 날림) · 발밑 서리 웅덩이 · 얼음 반짝이/눈송이/입김 ·
//   손끝 시전 빛 · 얼음 심장 맥동 · 균열 발광 · 순간이동 잔상 · 거울 분신(같은 리그, 거울 틴트, 반투명) · 사망 동결 → 산산조각
// 로직(src/game/bosses/b_frostqueen.js)의 상태를 읽기만 한다:
//   boss { cx, bottom, facing, t, st, state, pose{la,le,ra,re,lean,cast}, vanish, phase, hp/stats.maxHp, flashT, dying, frozenT, _shat,
//          clones[], beamLine, beamAim, windK, A{floor,x0,x1,top} }   분신 { queen, pose, facing, t, bobPh, cx, bottom }
// 판정은 바꾸지 않는다 (docs/art/BOSS_PIPELINE.md §8.8): 논리 판정 = 치마 윗부분 + 몸통, 머리·왕관은 벡터 때처럼 판정 위로 솟는다.
import { Drawer, Strand, Particles, DamageState, Shards, halo, puff, rr, hash1, loadRig, pickVariant, quality, ledgesOver, makeCanvas } from '../kit.js';

const DIR = 'painted/bosses/b_frostqueen';
const ICE = '#9fe8ff', ICE_L = '#e6fbff', GEM = '#5fd0ff', MIST = '#dff4ff';
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));

/** 거울 분신 틴트: 은빛 유리 (채도 ↓, 밝기 ↑, 연보라 기운) */
const MIRROR = [
  { when: (h, s, l) => l < 0.16, h: 238, s: 0.5, s0: 0.05, l: 1.2, l0: 0.05 },
  { when: () => true, h: 222, s: 0.42, s0: 0.04, l: 1.1, l0: 0.07 },
];
const DEF = {
  glow: ICE,
  // 손상 굽기: 갈색 그을림 대신 푸른 동상 얼룩 (얼음 몸이 탁한 갈색으로 더러워지지 않게)
  defaults: { stain: 'rgb(70,110,170)', char: 1.2 },
  outline: { width: 2.0, color: 'rgba(6,10,26,0.9)' },
  parts: {
    head_a: { flash: true, cracks: 3, holes: 0, crackMinLum: 150 },
    head_b: { flash: true, cracks: 3, holes: 0, crackMinLum: 150 },
    torso: { flash: true, cracks: 4, holes: 1 },
    skirt: { flash: true, cracks: 4, holes: 2 },
    collar: { flash: true, cracks: 2, holes: 1 },
    armU: { flash: true, deep: 0.6, cracks: 2 }, armU2: { flash: true, deep: 0.6, cracks: 2 },
    armC: { flash: true, deep: 0.6, cracks: 2 }, armO: { flash: true, deep: 0.6, cracks: 2 }, armS: { flash: true, deep: 0.6, cracks: 1 },
    cape_tex: { noDmg: true, outline: 0 },
  },
  prefix: { sh: { noDmg: true, outline: 1.2 }, vic: { noDmg: true, outline: 1.4 }, hz_: { noDmg: true, outline: 1.5 } },
  tints: { mirror: { rules: MIRROR, levels: ['base'], glow: '#eef8ff', skip: ['sh', 'vic', 'hz_', 'cape'] } },
};

// 퍼핏 배치 (논리 px, 오른쪽을 봄, 원점 = 보스 발밑 중심 (cx, bottom), 위 = −y). 치마 밑단은 판정 바닥보다 26 아래 (떠 있으므로 바닥과 겹치지 않음)
const WAIST = -59;          // 치마 허리 피벗 = 몸통 엉덩이 피벗
const LEAN_Y = -70;         // 기울기 회전 중심

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_frostqueen', kind: 'boss', ownsDeathFade: true,
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    rig.cape = capeTexture(rig);
    rig.art = makeArt(rig);           // 로직 파일의 위험 지대·투사체 그리기 도우미 (얼음 기둥·고드름·벽 가시·얼음 탄)
    return rig;
  },
  init(ent, rig) {
    const q = quality(ent.world?.game ?? ent.queen?.world?.game);
    const clone = !!ent.queen;
    return {
      D: new Drawer(), P: new Particles(clone ? 60 : q.particles), shards: new Shards(clone ? 10 : 64), q, clone, clp: new Map(),
      dmg: new DamageState(ent.def?.phases ?? [0.6, 0.3]), lt: null, pf: 0, jolt: 0, scream: 0, vx: 0, px: null,
      cape: new Strand(9, 15, { g: 700, damp: 0.93 }), ghosts: [], vics: [], vicX: null, vicK: 0, cl: [], lastState: null,
      armGone: false, burst: false, L: { x: 0, y: 0, f: 1, lean: 0, c: 1, s: 0, sc: 1 }, W: [0, 0], W2: [0, 0],
    };
  },
  draw(ctx, ent, world, rig, st) { if (st.clone) drawClone(ctx, ent, world, rig, st); else drawBoss(ctx, ent, world, rig, st); },
  bounds(b, rig, st, out) { return bounds(b, st, out); },
  lights(L, b, rig, st) {
    if (b.vanish > 0.8 || st.heartW == null) return;
    L.add(st.heartW[0], st.heartW[1], 70 + (b.phase >= 2 ? 40 : 0), GEM, 0.55);
  },
  debris(i, rig) {
    const names = rig.man.groups.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k;
    return { size: Math.max(8, (p.r ?? 8) * 1.2), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 망토 무늬 (굽기 때 한 번) ─────────────────────────
/** 부품 cape_tex(외곽선 없음, 패드 4) 에서 패드를 빼고 반복 무늬용 캔버스를 만든다 */
function capeTexture(rig) {
  const p = rig.parts.cape_tex; if (!p) return null;
  const im = p.v.base, pad = p.pad ?? 4;
  const w = Math.max(8, im.width - pad * 2 - 2), h = Math.max(8, im.height - pad * 2 - 2);
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.drawImage(im, pad + 1, pad + 1, w, h, 0, 0, w, h);
  // 살짝 어둡고 투명하게 (얼음 비단: 몸 뒤에서 너무 밝지 않게)
  g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(170,200,235)'; g.fillRect(0, 0, w, h);
  return { canvas: c, k: 1 / rig.td * 0.8, pat: null };
}

// ───────────────────────── 경계 (컬링) ─────────────────────────
function bounds(b, st, out) {
  let x0 = b.cx - 170, x1 = b.cx + 170, y0 = b.bottom - 250, y1 = b.bottom + 50;
  const F = b.A?.floor;
  if (F != null && (st?.vicK > 0.01 || b.bottom > F - 170)) y1 = Math.max(y1, F + 8);
  for (const g of st?.ghosts ?? []) { x0 = Math.min(x0, g.x - 170); x1 = Math.max(x1, g.x + 170); y0 = Math.min(y0, g.y - 250); y1 = Math.max(y1, g.y + 50); }
  if (st?.vicX != null && st.vicK > 0.01) { x0 = Math.min(x0, st.vicX - 90); x1 = Math.max(x1, st.vicX + 90); }
  if ((b.dying > 0 || st?.shards?.list.length) && b.A) { x0 = Math.min(x0, b.A.x0); x1 = Math.max(x1, b.A.x1); y1 = Math.max(y1, b.A.floor + 8); }
  out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
  return out;
}

// ───────────────────────── 지역 → 월드 변환 ─────────────────────────
/** L: 퍼핏 지역 좌표계 (x = 앞, 기울기 회전 중심 (0, LEAN_Y)) */
function setL(L, x, y, f, lean, sc = 1) { L.x = x; L.y = y; L.f = f; L.lean = lean; L.c = Math.cos(lean); L.s = Math.sin(lean); L.sc = sc; }
function W(L, lx, ly, out) {
  lx *= L.sc; ly *= L.sc;
  const oy = LEAN_Y * L.sc, dy = ly - oy;
  out[0] = L.x + L.f * (L.c * lx - L.s * dy); out[1] = L.y + oy + L.s * lx + L.c * dy;
  return out;
}
/** 부품의 피벗을 지역 (lx,ly) 에, 지역 회전 lrot, 배율 sc (가로 sx 추가 배율) */
function put(D, L, part, img, pivot, lx, ly, lrot, alpha = 1, sc = 1, sxm = 1, out = null) {
  const w = W(L, lx, ly, out ?? _pw);
  const k = part.k * sc * L.sc;
  D.part(part, img, pivot, w[0], w[1], L.f * (lrot + L.lean), k * sxm * L.f, k, alpha);
}
const _pw = [0, 0], _q = [0, 0];
/** 부품 p 가 피벗 a 에서 피벗 b 로 향하는 텍셀 축의 각도·길이(논리 px) */
function axis(p, a, b) {
  const key = a + '>' + b, c = (p._ax ??= {});
  if (!c[key]) { const A = p[a], B = p[b]; c[key] = { a: Math.atan2(B[1] - A[1], B[0] - A[0]), len: Math.hypot(B[0] - A[0], B[1] - A[1]) * p.k }; }
  return c[key];
}
/** 부품 좌표계 점: 피벗 pv 가 지역 (lx,ly), 지역 회전 lrot 로 놓였을 때 텍셀 점 q 의 지역 좌표 */
function localPt(p, pv, q, lx, ly, lrot, sc, out) {
  const A = p[pv], dx = (q[0] - A[0]) * p.k * sc, dy = (q[1] - A[1]) * p.k * sc, c = Math.cos(lrot), s = Math.sin(lrot);
  out[0] = lx + c * dx - s * dy; out[1] = ly + s * dx + c * dy; return out;
}

// ───────────────────────── 메인 (본체) ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, R = rig.parts;
  if (st.rig !== rig) { st.rig = rig; st.gCape = null; }
  const qn = world.game?.settings?.quality ?? 'high';
  if (st.q.name !== qn) st.q = quality(world.game);
  const q = st.q, P = st.P;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, F = A.floor, t = b.t;
  P.update(dt, F);
  st.shards.update(dt, F);
  const dying = b.dying > 0;
  // 손상 단계 + 단계 상승 순간
  const up = st.dmg.update(dying ? 0 : b.hp / b.stats.maxHp, dt);
  const lvl = dying ? 2 : Math.max(0, st.dmg.level);
  const lv3 = b.phase >= 2;     // 3페이즈 (영원한 겨울): 뼈 팔, 큰 부채 깃, 비명 잦음
  // 속도 (치마·망토가 뒤로 휘날림)
  if (st.px == null) st.px = b.cx;
  const vx = (b.cx - st.px) / Math.max(dt, 1 / 120); st.px = b.cx;
  st.vx = Math.abs(vx) > 1500 ? 0 : lerp(st.vx, vx, 0.15);    // 순간이동은 무시
  // 피격
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 6);
  // 비명 얼굴: 시전·공격 준비·피격·3페이즈 포효·사망
  const s = b.state, bt = b.st ?? 0;
  const scream = dying || b.pose.cast > 0.35 || b.flashT > 0.04 ||
    (s === 'mirror' && bt < 0.7) || s === 'dust' || s === 'blizzard2' || (s === 'icicles' && bt < 0.9) || (s === 'pillars' && bt < 0.75) ||
    (s === 'intro' && bt > 0.15 && bt < 0.9) || (lv3 && s === 'idle' && Math.sin(t * 0.9) > 0.86);
  st.scream = approach(st.scream, scream ? 1 : 0, dt * (scream ? 9 : 5));
  // 워프 시작 → 잔상 (벡터 fx.ghost 대신)
  if (s === 'warp' && st.lastState !== 'warp') st.ghosts.push({ x: b.cx, y: b.bottom, f: b.facing, t: 0, pose: { ...b.pose }, scream: st.scream, lv3 });
  if (s === 'mirror' && st.lastState !== 'mirror') st.ghosts.push({ x: b.cx, y: b.bottom, f: b.facing, t: 0, pose: { ...b.pose }, scream: 1, lv3 });
  st.lastState = s;
  // 단계 상승: 얼음 조각이 몸에서 떨어져 나감 (3단계: 앞팔 살이 깨져 떨어지고 뼈 팔이 드러난다)
  if (up > 0) levelBurst(st, b, rig, up);
  st.armGone = st.dmg.level >= 2;      // 3단계: 앞팔은 뼈 팔 (살이 깨져 나간 뒤)
  if (hit) { iceChips(st, rig, b.cx + b.facing * 10, b.bottom - 95, 4, 260, 0.5); P.burst('spore', b.cx, b.bottom - 95, 8, { speed: 160, color: ICE_L }); }
  // 분신 추적 (깨지면 채색 유리 조각)
  trackClones(st, b, rig);

  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  D.begin(ctx);
  // 로직의 뒤층 효과 (눈보라 화면 덮개 · 광선 조준선) — 벡터 그대로
  D.end();
  b.paintBack?.(ctx, world);
  // 발밑 서리 웅덩이 + 기어오르는 희생자
  floorLayer(ctx, D, b, rig, st, dt, F, lvl);
  P.draw(ctx, 0);
  // 순간이동 잔상
  drawGhosts(ctx, D, b, rig, st, dt);

  const va = clamp(1 - b.vanish, 0, 1);
  if (va > 0.004 && !(dying && b._shat)) {
    const jx = st.jolt > 0 ? (rr.next() - 0.5) * 4 * st.jolt - b.facing * 2 * st.jolt : 0;
    const shake = dying && b.dying > 1.8 ? Math.sin(t * 50) * 1.2 : 0;
    const o = st.o ??= {};
    o.x = b.cx + jx + shake; o.y = b.bottom; o.f = b.facing; o.t = t; o.pose = b.pose; o.lvl = lvl; o.lv3 = lv3; o.tint = null;
    o.alpha = va; o.scream = st.scream; o.vx = st.vx; o.wind = b.windK ?? 0; o.frozen = b.frozenT ?? 0;
    o.flash = b.flashT > 0 && !dying ? clamp(b.flashT / 0.1, 0, 1) * 0.42 : 0; o.beam = s === 'beam' ? b.beamLine : null; o.clone = false;
    o.bobPh = 0;
    drawQueen(ctx, D, b, world, rig, st, o, dt);
    // 사라지는 중: 서리 안개 + 파편
    if (b.vanish > 0.05 && b.vanish < 0.95 && rr.next() < dt * 40 * q.ambient) {
      P.emit('smoke', b.cx + rr.range(-30, 30), b.bottom - rr.range(10, 170), rr.range(-20, 20), -20, { color: MIST, size: rr.range(10, 20), layer: 1 });
      if (rr.chance(0.25)) iceChips(st, rig, b.cx + rr.range(-25, 25), b.bottom - rr.range(30, 150), 1, 180, 0.45);
    }
  }
  // 사망: 동결 → 산산조각 (로직 _shat 시점)
  if (dying && b._shat && !st.burst) shatter(st, b, rig);
  D.end();
  st.shards.draw(D);
  D.end();
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 여왕 한 명 그리기 (본체·분신·잔상 공용) ─────────────────────────
// o = { x, y, f, t, pose, lvl, lv3, tint, alpha, scream, vx, wind, frozen, flash, beam, clone, glow(잔상: 발광 실루엣만) }
function drawQueen(ctx, D, b, world, rig, st, o, dt) {
  const R = rig.parts, q = st.q, P = st.P, L = st.L;
  const pose = o.pose, t = o.t, f = o.f;
  const lean = (pose.lean ?? 0) * 0.3 + clamp(o.vx * f * 0.00022, -0.06, 0.06);
  setL(L, o.x, o.y, f, lean, 1);
  const lvl = o.lvl, tint = o.tint, glowOnly = !!o.glow;
  const V = (p, deep = false) => glowOnly ? (p.v[tint ? tint + '_glow' : 'glow'] ?? p.v.glow ?? p.v.flash) : pickVariant(p, lvl, deep, tint);
  const a0 = o.alpha;
  const breath = Math.sin(t * 1.6) * 0.012;
  // ── 몸통 배치 (지역) ──
  const T = R.torso, S = R.skirt, sway = Math.sin(t * 1.7) * 0.025 + clamp(o.vx * f * 0.0005, -0.1, 0.1) - o.wind * 0.07;
  const hipX = 0, hipY = WAIST;
  const trot = breath * 0.6 + Math.sin(t * 1.1) * 0.012;
  const tp = (pv, out) => localPt(T, 'hip', T[pv], hipX, hipY, trot, 1, out);
  const neck = tp('neck', st._nk ??= [0, 0]), shN = tp('shN', st._sn ??= [0, 0]), shF = tp('shF', st._sf ??= [0, 0]), heart = tp('heart', st._ht ??= [0, 0]), nape = tp('nape', st._np ??= [0, 0]);
  if (!glowOnly) D.startFlash();
  if (o.flash <= 0 && !glowOnly && !(o.frozen > 0)) { D.rec = false; }
  // ── 1) 얼음 칼날 부채 깃 (머리 뒤 후광) ──
  const C = R.collar, ck = (o.lv3 ? 1.16 : 1) * (1 + Math.sin(t * 2.3) * 0.015) * (o.scream > 0.5 ? 1 + o.scream * 0.05 : 1);
  put(D, L, C, V(C), 'root', neck[0] - 3, neck[1] + 6, -0.04 + Math.sin(t * 0.8) * 0.02, a0 * (o.clone ? 0.9 : 1), ck);
  if (!glowOnly && q.halos && !o.clone) { D.end(); const w = W(L, neck[0] - 3, neck[1] - 30, st.W); halo(ctx, w[0], w[1], 58 * ck, ICE, 0.16 * a0 * (0.8 + 0.2 * Math.sin(t * 3))); }
  // ── 2) 얼음 비단 망토 (등에서 뒤로, verlet) ──
  if (!glowOnly && rig.cape) drawCape(ctx, D, b, rig, st, o, nape, dt);
  // ── 3) 뒤팔 (편 손, 어둡게) ──
  arm(D, L, R.armU2, R.armO, shF[0], shF[1], pose.ra ?? 0.2, pose.re ?? 0.4, a0, V, true, o, null);
  // ── 4) 치마 (얼어붙은 희생자들) ──
  put(D, L, S, V(S), 'waist', hipX, hipY, sway, a0, 1, 1 + Math.sin(t * 2.1) * 0.012);
  // ── 5) 몸통 ──
  put(D, L, T, V(T), 'hip', hipX, hipY, trot, a0);
  // ── 6) 머리 (미소 ↔ 비명 교차) ──
  const hrot = trot * 0.5 + Math.sin(t * 1.3) * 0.03 - o.scream * 0.1 + (o.frozen > 0 ? -0.12 * o.frozen : 0);
  const HA = R.head_a, HB = R.head_b, sc = o.scream;
  const hx = neck[0] + 1, hy = neck[1] + 3;
  if (sc < 0.99) put(D, L, HA, V(HA), 'neck', hx, hy, hrot, a0);
  if (sc > 0.01) put(D, L, HB, V(HB), 'neck', hx, hy, hrot, a0 * (glowOnly ? sc : clamp(sc * 1.4, 0, 1)));
  // ── 7) 앞팔 (발톱 손 / 3페이즈: 뼈 팔) ──
  const fore = o.lv3 && !o.clone && st.armGone ? R.armS : R.armC;
  arm(D, L, R.armU, fore, shN[0], shN[1], pose.la ?? 0.3, pose.le ?? 0.3, a0, V, false, o, st);
  // ── 피격 섬광 / 동결 광택 ──
  if (!glowOnly) {
    if (o.flash > 0) D.flash(o.flash * a0);
    else if (o.frozen > 0.02) D.flash(o.frozen * 0.22 * a0, 'glow');
    else { D.rec = false; D.log.length = 0; }
  }
  D.end();
  if (glowOnly) return;
  // ── 균열 발광 (손상 단계) ──
  if (q.crackGlow && lvl > 0 && !o.clone) {
    glowOver(ctx, D, L, T, lvl, 'hip', hipX, hipY, trot, 0.55 * a0, t, st);
    glowOver(ctx, D, L, S, lvl, 'waist', hipX, hipY, sway, 0.45 * a0, t + 1, st);
    glowOver(ctx, D, L, sc > 0.5 ? HB : HA, lvl, 'neck', hx, hy, hrot, 0.5 * a0, t + 2, st);
  }
  // ── 빛: 얼음 심장 · 눈 · 시전 손 ──
  const hw = W(L, heart[0], heart[1], st.heartW ??= [0, 0]);
  if (q.halos) {
    const pulse = 0.75 + 0.25 * Math.sin(t * (o.lv3 ? 7 : 4.5));
    halo(ctx, hw[0], hw[1], (10 + (o.lv3 ? 8 : 0)) * pulse, GEM, 0.8 * a0, true);
    const H = sc > 0.5 ? HB : HA;
    const e = localPt(H, 'neck', H.eye, hx, hy, hrot, 1, _q), ew = W(L, e[0], e[1], st.W);
    halo(ctx, ew[0], ew[1], 7 + sc * 6 + (o.lv3 ? 3 : 0), o.lv3 ? '#ffffff' : ICE, (0.55 + sc * 0.4) * a0, true);
  }
  const cast = pose.cast ?? 0;
  if (st.handW && (cast > 0.05 || o.beam)) {
    const k = Math.max(cast, o.beam ? 0.6 : 0);
    if (q.halos) { halo(ctx, st.handW[0], st.handW[1], 14 + k * 30, ICE, (0.3 + k * 0.55) * a0, true); halo(ctx, st.handW[0], st.handW[1], 40 + k * 40, GEM, 0.12 * k * a0); }
    if (!o.clone && rr.next() < dt * 40 * k * q.ambient) {
      const a = rr.next() * TAU, r = rr.range(26, 50);
      P.emit('spore', st.handW[0] + Math.cos(a) * r, st.handW[1] + Math.sin(a) * r, -Math.cos(a) * r * 4, -Math.sin(a) * r * 4, { color: ICE_L, life: 0.25, layer: 1 });
    }
  }
  // ── 주변 입자: 반짝이 · 눈송이 · 입김 ──
  if (!o.clone && a0 > 0.5) {
    const amb = q.ambient;
    if (rr.next() < dt * 6 * amb) P.emit('spore', o.x + rr.range(-45, 45), o.y - rr.range(0, 170), rr.range(-10, 10), rr.range(-30, -5), { color: rr.chance(0.5) ? ICE_L : ICE, layer: rr.chance(0.5) ? 0 : 1 });
    if (rr.next() < dt * 2.5 * amb) P.emit('ashLight', o.x + rr.range(-80, 80), o.y - rr.range(120, 220), rr.range(-15, 15), rr.range(10, 25), { color: 'rgba(235,248,255,0.85)', layer: 1 });
    if (rr.next() < dt * (1.2 + sc * 6) * amb) {
      const H = sc > 0.5 ? HB : HA;
      const m = localPt(H, 'neck', H.mouth, hx, hy, hrot, 1, _q), mw = W(L, m[0], m[1], st.W2);
      P.emit('smoke', mw[0] + f * 3, mw[1], f * rr.range(20, 50 + sc * 60), rr.range(-15, 5), { color: MIST, size: rr.range(4, 8 + sc * 6), life: rr.range(0.6, 1.1), layer: 1 });
    }
  }
  // ── 사망 동결: 얼음 가시가 몸을 뒤덮으며 자람 ──
  if (o.frozen > 0.02 && !o.clone) {
    const Z = R.hz_spike, Ic = R.hz_icicle, fz = o.frozen;
    D.end();
    for (let i = 0; i < 5; i++) {
      const u = (i - 2) / 2, g = clamp(fz * 1.6 - i * 0.12, 0, 1);
      if (g <= 0) continue;
      const lx = u * 26, ly = 18 - Math.abs(u) * 6, sc2 = (0.34 + hash1(i * 3.3) * 0.16) * g;
      put(D, L, Z, pickVariant(Z, 0), 'base', lx, ly, u * 0.35, 0.95 * a0, sc2);
    }
    for (let i = 0; i < 4; i++) {
      const g = clamp(fz * 1.4 - 0.3 - i * 0.12, 0, 1); if (g <= 0) continue;
      const lx = (i % 2 ? 1 : -1) * (12 + i * 5), ly = -40 - i * 22;
      put(D, L, Ic, pickVariant(Ic, 0), 'root', lx, ly, (i % 2 ? -1 : 1) * (2.2 + i * 0.2), 0.9 * a0, 0.45 * g);
    }
    D.end();
    if (q.halos) { const w = W(L, 0, -90, st.W); halo(ctx, w[0], w[1], 90 + fz * 40, ICE, 0.25 * fz); }
  }
}

/** 팔 (위팔 + 아래팔·손). 로직 각도: a (0 = 아래, + 앞), e (팔꿈치 굽힘) → 지역 방향 θ = π/2 − a. 광선 중엔 앞팔이 조준 방향 */
function arm(D, L, U, Fo, sx, sy, a, e, alpha, V, far, o, st) {
  let tu = PI / 2 - a, tf = PI / 2 - (a + e);
  if (!far && o.beam) {
    const bl = o.beam, wx = (bl.x1 - bl.x0) * L.f, wy = bl.y1 - bl.y0;
    const ang = Math.atan2(wy, wx) - L.lean;
    const k = clamp((bl.warn ?? 1) * 1.5, 0, 1);
    tu = lerp(tu, ang - 0.12, k); tf = lerp(tf, ang, k);
  }
  const au = axis(U, 'sh', 'el'), af = axis(Fo, 'el', 'tip');
  const img = V(U, far), img2 = V(Fo, far);
  const ex = sx + Math.cos(tu) * au.len * 0.92, ey = sy + Math.sin(tu) * au.len * 0.92;
  put(D, L, U, img, 'sh', sx, sy, tu - au.a, alpha * (far ? 0.95 : 1));
  put(D, L, Fo, img2, 'el', ex, ey, tf - af.a, alpha * (far ? 0.95 : 1));
  if (!far && st) {
    const pl = localPt(Fo, 'el', Fo.palm, ex, ey, tf - af.a, 1, _q);
    W(L, pl[0], pl[1], st.handW ??= [0, 0]);
  }
}

/** 손상 단계 균열 발광 (반 해상도, 가산, 맥동) */
function glowOver(ctx, D, L, part, lvl, pivot, lx, ly, lrot, a, t, st) {
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 ? 1 : 0);
  if (!drawn) return;
  const g = drawn === 2 ? part.gl.dmg2 : part.gl.dmg1;
  if (!g) return;
  const pv = part[pivot];
  const w = W(L, lx, ly, st.W);
  const pa = a * (0.55 + 0.45 * Math.sin(t * 3.6 + part.w * 0.01)) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, w[0], w[1], L.f * (lrot + L.lean), part.k * 2 * L.f, part.k * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
  D.end();
}

// ───────────────────────── 망토 (verlet 리본 + 채색 무늬) ─────────────────────────
function drawCape(ctx, D, b, rig, st, o, nape, dt) {
  const L = st.L, S = st.cape, f = o.f, n = S.n;
  const aw = W(L, nape[0] - 1, nape[1] + 2, st.W);
  S.wx = f * (-(140 + Math.abs(o.vx) * 0.4) + o.wind * 1700) + Math.sin(o.t * 1.3) * 90;
  S.g = 700;
  S.step(dt, aw[0], aw[1]);
  // 바닥 아래로는 가지 않게
  const F = b.A?.floor ?? 1e9, p = S.p;
  for (let i = 1; i < n; i++) if (p[i * 2 + 1] > F - 2) p[i * 2 + 1] = F - 2;
  const q = st.q;
  // 리본: 척추(앞 가장자리) → 뒤쪽으로 폭 (몸 뒤로 퍼짐). 폭은 아래로 갈수록 넓어짐, 밑단은 들쭉날쭉
  const E = st._ce ??= new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let tx = p[i1 * 2] - p[i0 * 2], ty = p[i1 * 2 + 1] - p[i0 * 2 + 1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let nx = -ty, ny = tx; if (nx * f > 0) { nx = -nx; ny = -ny; }     // 뒤쪽(−f) 을 향하는 법선
    const u = i / (n - 1), w = (5 + u * 34) * (1 + Math.sin(o.t * 2.4 + i * 0.9) * 0.08);
    E[i * 4] = p[i * 2] + nx * 2 - f * 1.5; E[i * 4 + 1] = p[i * 2 + 1] + ny * 2;
    E[i * 4 + 2] = p[i * 2] + nx * w; E[i * 4 + 3] = p[i * 2 + 1] + ny * w;
  }
  D.end();
  D.save();
  ctx.beginPath();
  ctx.moveTo(E[0], E[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(E[i * 4], E[i * 4 + 1]);
  // 밑단 (고드름처럼 들쭉날쭉)
  const lx = E[(n - 1) * 4], ly = E[(n - 1) * 4 + 1], rx = E[(n - 1) * 4 + 2], ry = E[(n - 1) * 4 + 3];
  for (let j = 1; j <= 5; j++) { const u = j / 6, dd = (j % 2 ? 9 : 2) + Math.sin(o.t * 3 + j) * 1.5; ctx.lineTo(lerp(lx, rx, u), lerp(ly, ry, u) + dd); }
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(E[i * 4 + 2], E[i * 4 + 3]);
  ctx.closePath();
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * o.alpha * (o.clone ? 0.6 : 0.82);
  // 채색 무늬 (목덜미에 고정해 움직임과 함께 흐른다)
  const cp = rig.cape;
  if (!cp.pat) { cp.pat = ctx.createPattern(cp.canvas, 'repeat'); cp.m = typeof DOMMatrix !== 'undefined' ? new DOMMatrix() : null; }
  if (cp.pat) {
    if (cp.m && cp.pat.setTransform) { cp.m.a = cp.k; cp.m.d = cp.k; cp.m.b = cp.m.c = 0; cp.m.e = aw[0]; cp.m.f = aw[1]; cp.pat.setTransform(cp.m); }
    ctx.fillStyle = cp.pat; ctx.fill();
  } else { ctx.fillStyle = '#9fc8e8'; ctx.fill(); }
  // 음영 (캐시 그라디언트: 지역 좌표 0..150 아래로) — 위는 어둡고 밑단은 빛이 비침
  ctx.clip();
  if (!st.gCape) {
    const g = ctx.createLinearGradient(0, 0, 0, 150);
    g.addColorStop(0, 'rgba(10,24,60,0.55)'); g.addColorStop(0.45, 'rgba(30,70,130,0.2)'); g.addColorStop(1, 'rgba(200,240,255,0.18)');
    st.gCape = g;
  }
  ctx.translate(aw[0], aw[1]);
  ctx.fillStyle = st.gCape; ctx.fillRect(-120, -10, 240, 190);
  ctx.globalAlpha = ga;
  D.restore();
  // 가장자리 빛 (뒤쪽 테)
  if (q.name !== 'low') {
    ctx.beginPath(); ctx.moveTo(E[2], E[3]); for (let i = 1; i < n; i++) ctx.lineTo(E[i * 4 + 2], E[i * 4 + 3]);
    ctx.strokeStyle = 'rgba(210,240,255,0.5)'; ctx.globalAlpha = ga * o.alpha * 0.7; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.globalAlpha = ga;
  }
}

// ───────────────────────── 바닥: 서리 웅덩이 + 기어오르는 희생자 ─────────────────────────
function floorLayer(ctx, D, b, rig, st, dt, F, lvl) {
  const R = rig.parts, q = st.q;
  const hgt = F - b.bottom, near = clamp(1 - (hgt - 40) / 140, 0, 1) * clamp(1 - b.vanish, 0, 1);
  // 희생자: 1페이즈 이후, 여왕이 바닥 가까이 떠 있을 때 발밑에서 얼어붙은 팔·해골이 솟아 여왕에게 손을 뻗는다
  const want = b.phase >= 1 && near > 0.3 && !(b.dying > 0 && b._shat) ? 1 : 0;
  if (st.vicX == null || (st.vicK <= 0.02 && want)) st.vicX = b.cx;
  if (Math.abs(b.cx - st.vicX) > 150) st.vicK = approach(st.vicK, 0, dt * 3);   // 순간이동: 옛 자리에서 가라앉고
  else st.vicK = approach(st.vicK, want, dt * (want ? 1.2 : 2.5));
  if (near <= 0.01 && st.vicK <= 0.01) return;
  D.end();
  // 서리 웅덩이 (어두운 얼음 + 가산 빛)
  if (near > 0.01) {
    D.img(puff('#cfefff'), 32, 32, b.cx, F - 2, 0, 90 / 32, 9 / 32, 0.3 * near);
    D.end();
    if (q.halos) halo(ctx, b.cx, F - 6, 70, ICE, 0.2 * near);
    if (rr.next() < dt * 8 * near * q.ambient) st.P.emit('smoke', b.cx + rr.range(-70, 70), F - 4, rr.range(-10, 10), -12, { color: MIST, size: rr.range(6, 12), life: rr.range(0.8, 1.4), layer: 0 });
  }
  if (st.vicK > 0.01) {
    D.end();
    D.save(); ctx.beginPath(); ctx.rect(st.vicX - 200, F - 200, 400, 202); ctx.clip();
    const lv3 = b.phase >= 2;
    const set = lv3 ? VIC3 : VIC2;
    for (let i = 0; i < set.length; i++) {
      const [name, ox, sc, rot0] = set[i], p = R[name]; if (!p) continue;
      const k = clamp(st.vicK * 1.3 - i * 0.12, 0, 1); if (k <= 0) continue;
      const e = 1 - (1 - k) * (1 - k);
      const hgt2 = (p.base[1] - p.top[1]) * p.k * sc;
      const y = F + 6 + (1 - e) * hgt2;                     // 바닥에서 솟아오름 (바닥선에서 잘림)
      const x = st.vicX + ox;
      const wob = Math.sin(b.t * 2.2 + i * 1.7) * 0.06 + (x < b.cx ? 0.12 : -0.12) * e;   // 여왕 쪽으로 기움
      D.part(p, p.v.base, 'base', x, y, rot0 + wob, p.k * sc * (ox < 0 ? -1 : 1), p.k * sc, 0.92);
    }
    D.end(); D.restore();
  }
  D.end();
}
const VIC2 = [['vic0', -46, 0.95, 0.05], ['vic3', 40, 0.9, -0.08]];
const VIC3 = [['vic0', -52, 1, 0.08], ['vic2', -14, 0.85, 0], ['vic1', 26, 0.95, -0.05], ['vic3', 58, 0.9, -0.1]];

// ───────────────────────── 잔상 (순간이동·분신 소환) ─────────────────────────
function drawGhosts(ctx, D, b, rig, st, dt) {
  const G = st.ghosts; if (!G.length) return;
  const op = ctx.globalCompositeOperation;
  for (let i = G.length - 1; i >= 0; i--) {
    const g = G[i]; g.t += dt;
    const a = 0.55 * (1 - g.t / 0.4);
    if (a <= 0) { G.splice(i, 1); continue; }
    const o = st.og ??= {};
    o.x = g.x; o.y = g.y - g.t * 30; o.f = g.f; o.t = b.t; o.pose = g.pose; o.lvl = 0; o.lv3 = g.lv3; o.tint = null; o.alpha = a; o.scream = g.scream;
    o.vx = 0; o.wind = 0; o.frozen = 0; o.flash = 0; o.beam = null; o.clone = false; o.glow = true;
    ctx.globalCompositeOperation = 'lighter';
    D.end();
    drawQueen(ctx, D, b, b.world, rig, st, o, dt);
    ctx.globalCompositeOperation = op;
  }
}

// ───────────────────────── 거울 분신 ─────────────────────────
function drawClone(ctx, c, world, rig, st) {
  const qn = world.game?.settings?.quality ?? 'high';
  if (st.q.name !== qn) st.q = quality(world.game);
  const now = world.time ?? c.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  st.P.update(dt, c.queen?.A?.floor ?? 1e9);
  const D = st.D, q = st.q;
  const q0 = ctx.imageSmoothingQuality; ctx.imageSmoothingQuality = 'low';
  const o = st.o ??= {};
  const fade = clamp(c.life / 0.4, 0, 1) * clamp(c.t / 0.25, 0, 1);
  o.x = c.cx; o.y = c.bottom; o.f = c.facing; o.t = c.t + (c.bobPh ?? 0); o.pose = c.pose; o.lvl = 0; o.lv3 = (c.queen?.phase ?? 0) >= 2; o.tint = 'mirror';
  o.alpha = 0.74 * fade; o.scream = 0.25 + 0.2 * Math.sin(c.t * 3); o.vx = 0; o.wind = 0; o.frozen = 0; o.flash = 0; o.beam = null; o.clone = true; o.glow = false;
  st.scream = o.scream;
  D.begin(ctx);
  if (q.halos) { halo(ctx, c.cx, c.bottom - 90, 80, ICE, 0.18 * fade); }
  drawQueen(ctx, D, c.queen ?? c, world, rig, st, o, dt);
  // 유리 반사광 (가산 발광 실루엣, 느리게 훑음)
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  o.glow = true; o.alpha = (0.12 + 0.1 * Math.sin(c.t * 4)) * fade; o.tint = 'mirror';
  D.end();
  drawQueen(ctx, D, c.queen ?? c, world, rig, st, o, dt);
  ctx.globalCompositeOperation = op;
  if (rr.next() < dt * 8 * q.ambient) st.P.emit('spore', c.cx + rr.range(-40, 40), c.bottom - rr.range(10, 170), 0, -12, { color: ICE_L, layer: 1 });
  st.P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}
/** 분신 목록 추적: 깨진 분신 자리에 채색 유리 조각 */
function trackClones(st, b, rig) {
  const cl = st.cl, pos = st.clp;
  for (const c of b.clones ?? []) if (!cl.includes(c)) cl.push(c);
  for (let i = cl.length - 1; i >= 0; i--) {
    const c = cl[i];
    if (!c.dead) { const q = pos.get(c) ?? [0, 0]; q[0] = c.cx; q[1] = c.cy; pos.set(c, q); continue; }
    cl.splice(i, 1);
    const lp = pos.get(c) ?? [c.cx, c.cy]; pos.delete(c);
    const names = rig.man.groups.debris ?? [];
    for (let j = 0; j < 7 && names.length; j++) {
      const p = rig.parts[names[j % names.length]], a = rr.next() * TAU, sp = rr.range(160, 420);
      st.shards.spawn(pickVariant(p, 0), p.c[0], p.c[1], lp[0] + rr.range(-20, 20), lp[1] + rr.range(-50, 40), rr.next() * TAU, p.k * rr.sign() * 1.1, p.k * 1.1, Math.cos(a) * sp, Math.sin(a) * sp - 200, rr.range(-12, 12), { r: 6, fade: 0.9, bounce: 0.3 });
    }
    st.P.burst('spore', lp[0], lp[1], 12, { speed: 260, color: ICE_L });
  }
}

// ───────────────────────── 단계 상승 / 사망 ─────────────────────────
/** 작은 채색 얼음 조각 (파편 스프라이트를 작게) — 키트 입자 chip/spark 는 색을 바꿀 수 없어 얼음에는 이것을 쓴다 */
function iceChips(st, rig, x, y, n, speed, sc = 0.5) {
  const names = rig.man.groups.debris ?? []; if (!names.length) return;
  for (let j = 0; j < n; j++) {
    const p = rig.parts[names[(j * 5 + (x | 0)) % names.length]], a = rr.next() * TAU, sp = speed * rr.range(0.4, 1);
    st.shards.spawn(p.v.base, p.c[0], p.c[1], x + rr.range(-8, 8), y + rr.range(-8, 8), rr.next() * TAU, p.k * sc * rr.range(0.6, 1.1) * rr.sign(), p.k * sc, Math.cos(a) * sp, Math.sin(a) * sp - speed * 0.4, rr.range(-14, 14), { r: 3, fade: rr.range(0.6, 1.1), bounce: 0.35 });
  }
}
function levelBurst(st, b, rig, level) {
  const P = st.P, x = b.cx, y = b.bottom - 100;
  iceChips(st, rig, x, y, 6 + level * 3, 360, 0.55);
  P.burst('spore', x, y, 16, { speed: 140, color: ICE });
  const names = rig.man.groups.debris ?? [];
  for (let j = 0; j < 4 + level * 2 && names.length; j++) {
    const p = rig.parts[names[(j * 3 + level) % names.length]], a = -PI / 2 + rr.range(-1.2, 1.2), sp = rr.range(180, 380);
    st.shards.spawn(pickVariant(p, 0), p.c[0], p.c[1], x + rr.range(-25, 25), y + rr.range(-40, 50), rr.next() * TAU, p.k * rr.sign(), p.k, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-10, 10), { r: 6, fade: 1.6, bounce: 0.3 });
  }
  // 3단계(체력 30% 미만): 앞팔의 살이 깨져 떨어지고 뼈 팔이 드러난다
  if (level >= 2 && !st.armGone && st.handW) {
    st.armGone = true;
    const p = rig.parts.armC, f = b.facing;
    st.shards.spawn(pickVariant(p, 2), p.el[0], p.el[1], st.handW[0] - f * 30, st.handW[1] - 10, 1.2 * f, p.k * f, p.k, f * rr.range(60, 140), -220, f * 5, { r: 8, fade: 1.8, bounce: 0.25 });
    iceChips(st, rig, st.handW[0], st.handW[1], 6, 300, 0.5);
    P.burst('spore', st.handW[0], st.handW[1], 12, { speed: 200, color: ICE_L });
  }
}
function shatter(st, b, rig) {
  st.burst = true;
  const R = rig.parts, L = st.L, x = b.cx, y = b.bottom, f = b.facing;
  const pieces = [['skirt', 'waist', 0, WAIST, 1], ['torso', 'hip', 0, WAIST, 1], ['head_b', 'neck', 4, -113, 1], ['collar', 'root', 0, -108, 0.9], ['armU', 'sh', -14, -99, 1], ['armS', 'el', -10, -80, 1], ['armO', 'el', 14, -85, 1]];
  setL(L, x, y, f, 0, 1);
  for (const [n, pv, lx, ly, sc] of pieces) {
    const p = R[n]; if (!p) continue;
    const w = W(L, lx, ly, st.W), a = -PI / 2 + rr.range(-1.3, 1.3), sp = rr.range(160, 420);
    st.shards.spawn(pickVariant(p, 2), p[pv][0], p[pv][1], w[0], w[1], rr.range(-0.3, 0.3), p.k * f * sc, p.k * sc, Math.cos(a) * sp, Math.sin(a) * sp - 120, rr.range(-7, 7), { r: 14, fade: 0.85, bounce: 0.3 });
  }
  const names = rig.man.groups.debris ?? [];
  for (let j = 0; j < 16 && names.length; j++) {
    const p = R[names[j % names.length]], a = rr.next() * TAU, sp = rr.range(200, 560);
    st.shards.spawn(pickVariant(p, 0), p.c[0], p.c[1], x + rr.range(-30, 30), y - rr.range(20, 170), rr.next() * TAU, p.k * rr.sign() * 1.3, p.k * 1.3, Math.cos(a) * sp, Math.sin(a) * sp - 150, rr.range(-14, 14), { r: 7, fade: 0.85, bounce: 0.3 });
  }
  st.P.burst('spore', x, y - 100, 40, { speed: 480, color: ICE_L });
  st.P.burst('ashLight', x, y - 100, 24, { speed: 260, color: 'rgba(235,248,255,0.9)' });
  st.P.burst('smoke', x, y - 90, 12, { speed: 90, color: MIST, jitter: 40 });
}

// ───────────────────────── 로직 파일용 그리기 도우미 (위험 지대 · 투사체) ─────────────────────────
// 로직(b_frostqueen.js)의 zone paint / 투사체 render 가 리그가 준비됐으면 이것으로 그린다 (아니면 기존 벡터). ctx 는 월드(또는 투사체 지역) 변환.
function makeArt(rig) {
  const R = rig.parts, P = R.hz_pillar, I = R.hz_icicle, sh = rig.man.groups.debris ?? [];
  const dart = R[sh[1]] ?? R[sh[0]], star = R[sh[2]] ?? dart;
  /** 부품 p 를 현재 ctx 변환에서 피벗 pv 가 원점에 오도록 (sx, sy 배율) */
  const blit = (ctx, p, pv, sx, sy) => { const im = p.v.base; ctx.drawImage(im, -p[pv][0] * sx, -p[pv][1] * sy, im.width * sx, im.height * sy); };
  const icicleK = I ? (I.tip[1] - I.root[1]) * I.k : 1;
  return {
    /** 얼음 기둥: 바닥 (x, F) 에서 높이 H·grow 로 솟음 */
    pillar(ctx, x, F, H, grow, seed = 0) {
      if (!P || H * grow < 2) return;
      const k = P.k, nat = (P.base[1] - P.tip[1]) * k;
      ctx.save(); ctx.translate(x, F + 4);
      blit(ctx, P, 'base', k * 0.72 * (seed > 0.5 ? -1 : 1) * (0.9 + seed * 0.2), (H * grow) / nat * k);
      ctx.restore();
      halo(ctx, x, F - H * grow * 0.5, 34 + H * 0.2, ICE, 0.35);
    },
    /** 고드름: 뿌리 = 현재 원점, 아래로 len */
    icicle(ctx, len) {
      if (!I || len < 1) return;
      const s = len / icicleK;
      blit(ctx, I, 'root', I.k * s * 0.9, I.k * s);
    },
    /** 벽 얼음 가시: 벽 wx 에서 경기장 쪽(d) 으로 7개 (g = 자라남 0..1) */
    spikes(ctx, wx, d, F, g) {
      if (!I) return;
      for (let i = 0; i < 7; i++) {
        const y = F - 16 - i * 30, len = (40 + hash1(i * 7.1) * 26) * g;
        if (len < 2) continue;
        const s = len / icicleK;
        ctx.save(); ctx.translate(wx, y); ctx.rotate((d > 0 ? -PI / 2 : PI / 2) + (hash1(i + 3) - 0.5) * 0.4);
        blit(ctx, I, 'root', I.k * s * 1.1, I.k * s);
        ctx.restore();
      }
    },
    /** 얼음 탄 (진행 방향으로 회전). 원점 = 탄 중심 */
    dart(ctx, p) {
      if (!dart) return false;
      ctx.rotate(Math.atan2(p.vy, p.vx));
      halo(ctx, -6, 0, 16, ICE, 0.5);
      ctx.rotate(PI / 2);
      blit(ctx, dart, 'c', dart.k * 0.85, dart.k * 0.85);
      return true;
    },
    /** 다이아몬드 더스트 탄 (회전) */
    diamond(ctx, p) {
      if (!star) return false;
      halo(ctx, 0, 0, 16, ICE, 0.6);
      ctx.rotate((p.t ?? 0) * 6);
      blit(ctx, star, 'c', star.k * 0.7, star.k * 0.7);
      return true;
    },
  };
}
