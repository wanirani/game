// 나르키사 (b_narkissa) — 채색 컷아웃 퍼핏 렌더러 (s14 '만경의 옥좌', 1형태 가면 → 33% 가면이 깨진 2형태)
// 부품 (Kling, 정면 퍼핏 — 벡터 그림처럼 바라보는 쪽으로 좌우 반전만 한다):
//   반은 검은 유리(짝 안 맞는 눈 수십 개)·반은 금 간 자기(磁器)인 가면 머리 · 2형태: 눈이 가득한 얼굴 + 거울 이빨 아가리(경첩 턱) ·
//   유리 바늘 왕관 · 2형태의 깨진 거울 후광 · 흑요석 흉갑(초록 보석) · 비명 지르는 얼굴이 비친 거울 조각 드레스 +
//   떨어져 나가는 거울 조각 5개 · 유리 팔(위팔·아래팔·갈퀴 손) · 등의 칼날 팔(거울 칼날) · 손거울 · 거미 다리(허벅지·발톱 정강이) ·
//   벽거울 틀(경기장 소품·낙하 거울) · 유리/가면 파편 11종.
// 절차적 층: 눈빛(플레이어를 본다, 깜빡임) · 가슴 보석 맥동 · 가산 후광 · 균열 발광(손상 단계) · 유리 반짝임 입자 ·
//   드레스 조각 탈락(피해율) · 가면 균열 떨림(shatter) · 공전 파편(2형태) · 분신(청백 발광 실루엣) · 돌진 잔상 · 사망 산산조각.
// 로직(src/game/bosses/c_narkissa.js)의 상태를 읽기만 한다:
//   boss { cx, bottom, facing, t, state, pose{bob,tilt,rot,scale,fade,fa0a,fa0e,fa1a,fa1e,ba,low,high,mirror,scream,jaw,spread,swing,fold,droop},
//          legs.F[{s,i,hx,hy,x,y,init}], formPhase, maskCrack, eyeGlow, twin, stunned, dashing, inMirror, hidden, shattered, dying,
//          hp/stats.maxHp, flashT, hitPart, A{floor,x0,x1} }
//   분신(NarkTwin)은 drawPaintedDirect 로 같은 리그를 쓴다 (def.id 'nark_twin', pose·legs·facing·bottom·inT·fadeT·flashT).
// 판정은 바꾸지 않는다 (얼굴 40×50 · 드레스 80×180 · 팔 40×120 ×2 · 돌진 250×90). 그림은 그보다 크다 (다리·후광·칼날 팔).
import { Drawer, Particles, Shards, halo, rr, loadRig, pickVariant, quality, QUALITY } from '../kit.js';

const DIR = 'painted/bosses/b_narkissa';
const GL = '#dff4ff', GL_C = '#9fe8ff', GL_V = '#c8b0ff', GOLD = '#ffd86a', RED = '#ff3050', GEM = '#40ffb0', EYE_C = '#bff6ff';
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const h01 = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const tierOf = (game) => { const t = game?.quality ?? game?.tier ?? game?.settings?.quality; return QUALITY[t] ? t : quality(game).name; };
const qualityOf = (game) => QUALITY[tierOf(game)];

// 로직과 같은 몸 치수 (앵커 = 몸통 판정 아래 가운데, 위 = −y)
const WAIST = -150, NECK = -214, HEAD_S = 1.15, HEAD_S2 = 1.4, MASK_C = NECK - 33 * HEAD_S, FACE2_C = NECK - 50 * HEAD_S2, HOVER = 20;
const BLADE_ARMS = [[-1, -20, -204, 2.55, -1.55], [1, 20, -204, 2.55, -1.55], [-1, -16, -180, 2.1, -1.95], [1, 16, -180, 2.1, -1.95]];
const LEG_L = [[118, 150], [148, 190], [172, 226]];
/** 드레스 앞에 매달린 거울 조각: [x, 매단 y, 배율, 떨어져 나가는 피해율] */
const HANG = [[-54, -104, 0.9, 0.3], [-20, -82, 1.0, 0.5], [22, -98, 0.95, 0.66], [56, -86, 0.88, 0.8], [0, -128, 0.8, 0.9]];

const DEF = {
  glow: '#bff6ff',
  outline: { width: 1.8, color: 'rgba(3,3,9,0.92)' },
  defaults: { stain: 'rgb(38,42,66)', char: 0.5, crackMinLum: 70 },
  parts: {
    head: { flash: true, cracks: 4, holes: 0 }, head2: { flash: true, cracks: 3, holes: 0 }, jaw2: { flash: true, cracks: 2, holes: 0 },
    torso: { flash: true, cracks: 3, holes: 0, crackMinLum: 45 }, gown: { flash: true, cracks: 5, holes: 2, crackMinLum: 60 },
    upper: { flash: true, deep: 0.5, cracks: 1, holes: 0, crackMinLum: 45 }, fore: { flash: true, deep: 0.5, cracks: 1, holes: 0, crackMinLum: 45 },
    hand: { flash: true, deep: 0.5, cracks: 1, holes: 0, crackMinLum: 45 },
    thigh: { deep: 0.45, cracks: 1, holes: 0, crackMinLum: 45 }, shin: { deep: 0.45, cracks: 1, holes: 0, crackMinLum: 45 },
    crown: { cracks: 2, holes: 1 }, blade: { noDmg: true }, hmirror: { noDmg: true }, halo2: { noDmg: true }, frame: { noDmg: true },
  },
  prefix: { sh: { flash: true, cracks: 1, holes: 0 }, deb: { noDmg: true, outline: 1.2 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_narkissa', kind: 'boss', ownsDeathFade: true,
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    const names = Object.keys(rig.parts);
    rig.debs = names.filter((n) => n.startsWith('deb')).map((n) => rig.parts[n]);
    rig.sh = names.filter((n) => n.startsWith('sh')).sort().map((n) => rig.parts[n]);
    rig.art = makeArt(rig);
    return rig;
  },
  init(b, rig) {
    const q = qualityOf(b.world?.game ?? b.boss?.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(70), q, lt: null, pf: 0, jolt: 0, lvl: -1,
      L: { x: 0, y: 0, f: 1, rot: 0, c: 1, s: 0, sc: 1, a: 1 }, fallen: [false, false, false, false, false], shattered: false,
      rec: [], flashSel: null, W: [0, 0], W2: [0, 0], lp: [0, 0], faceW: [0, 0], glint: 0,
    };
  },
  draw(ctx, b, world, rig, st) {
    if (b.def?.id === 'nark_twin') drawTwin(ctx, b, world, rig, st);
    else drawBoss(ctx, b, world, rig, st);
  },
  bounds(b, rig, st, out) { return bounds(b, st, out); },
  lights(L, b, rig, st) {
    if (b.hidden || b.shattered || b.inMirror) return;
    L.add(st.faceW[0], st.faceW[1], 90, (b.formPhase ?? 0) >= 2 ? EYE_C : GL, 0.35 + (b.eyeGlow ?? 0) * 0.3);
  },
  debris(i, rig) {
    const L = rig.debs; if (!L?.length) return null;
    const p = L[i % L.length], im = p.v.base, k = p.k;
    return { size: Math.max(8, (p.r ?? 8) * 1.2), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 경계 ─────────────────────────
function bounds(b, st, out) {
  const P = b.pose ?? {};
  let x0 = b.cx - 340, x1 = b.cx + 340, y0 = b.bottom - 470, y1 = Math.max(b.A?.floor ?? b.bottom, b.bottom + 40) + 10;
  if (Math.abs(P.rot ?? 0) > 0.3) { x0 -= 60; x1 += 60; }
  if ((b.dying > 0 || st?.shards?.list.length) && b.A) { x0 = Math.min(x0, b.A.x0); x1 = Math.max(x1, b.A.x1); y1 = Math.max(y1, b.A.floor + 10); }
  out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
  return out;
}

// ───────────────────────── 지역 → 월드 (로직의 drawNark 와 같은 변환) ─────────────────────────
// translate(x, Y) → scale(f, 1) → (0,−125) 둘레 rot → (0,−150) 둘레 scale → 지역 (lx, ly)
function setL(L, x, y, f, rot, sc, a) { L.x = x; L.y = y; L.f = f || 1; L.rot = rot || 0; L.c = Math.cos(L.rot); L.s = Math.sin(L.rot); L.sc = sc || 1; L.a = a; }
function W(L, lx, ly, out) {
  const x = lx * L.sc, y = -150 + (ly + 150) * L.sc, dy = y + 125;
  out[0] = L.x + L.f * (x * L.c - dy * L.s); out[1] = L.y - 125 + x * L.s + dy * L.c;
  return out;
}
const _w = [0, 0];
/** 부품 pivot 을 지역 (lx, ly) 에, 지역 회전 lrot, 배율 sc (sxm/sym = 축별 배율, 음수 = 거울) */
function put(D, L, part, img, pivot, lx, ly, lrot, sc = 1, sxm = 1, sym = 1, alpha = 1) {
  if (!part || !img) return;
  const w = W(L, lx, ly, _w), k = part.k * sc * L.sc;
  D.part(part, img, pivot, w[0], w[1], L.f * (lrot + L.rot), k * sxm * L.f, k * sym, alpha * L.a);
}
function axis(p, a, b) {
  const key = a + '>' + b, c = (p._ax ??= {});
  if (!c[key]) { const A = p[a], B = p[b]; c[key] = { a: Math.atan2(B[1] - A[1], B[0] - A[0]), len: Math.hypot(B[0] - A[0], B[1] - A[1]) * p.k }; }
  return c[key];
}
/** 부품 p 의 피벗 pv 가 지역 (lx,ly), 회전 lrot, 배율 sc 로 놓였을 때 텍셀 점 q 의 지역 좌표 */
function localPt(p, pv, q, lx, ly, lrot, sc, out, sxm = 1) {
  const A = p[pv], dx = (q[0] - A[0]) * p.k * sc * sxm, dy = (q[1] - A[1]) * p.k * sc, c = Math.cos(lrot), s = Math.sin(lrot);
  out[0] = lx + c * dx - s * dy; out[1] = ly + s * dx + c * dy; return out;
}
/** 두 점 사이에 뼈 부품 (pa → pb 축을 맞춘다, 길이에 맞춰 균일 배율) */
function seg(D, L, part, img, pa, pb, x0, y0, x1, y1, alpha = 1) {
  if (!part) return;
  const ax = axis(part, pa, pb), len = Math.hypot(x1 - x0, y1 - y0) || 1;
  put(D, L, part, img, pa, x0, y0, Math.atan2(y1 - y0, x1 - x0) - ax.a, len / (ax.len || 1), 1, 1, alpha);
}
/** 월드 좌표 뼈 (다리): 축 방향으로 길이를 맞추고, 굵기는 wMul (가로로 누운 부품 전용) */
function segW(D, part, img, pa, pb, x0, y0, x1, y1, wMul, alpha) {
  if (!part || !img) return;
  const ax = axis(part, pa, pb), len = Math.hypot(x1 - x0, y1 - y0) || 1, s = len / (ax.len || 1);
  D.part(part, img, pa, x0, y0, Math.atan2(y1 - y0, x1 - x0) - ax.a, part.k * s, part.k * s * wMul, alpha);
}

/** 두 마디 IK (로직 SpiderLegs 와 같은 식: 무릎은 바깥 위로) */
function ik2(hx, hy, fx, fy, L1, L2, side, o) {
  const dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy) || 1;
  const dc = clamp(d, Math.abs(L1 - L2) + 1, L1 + L2 - 1), th = Math.atan2(dy, dx);
  const a1 = Math.acos(clamp((L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc), -1, 1)), ka = th - side * a1;
  o.kx = hx + Math.cos(ka) * L1; o.ky = hy + Math.sin(ka) * L1;
  if (d > dc) { o.fx = hx + (dx / d) * dc; o.fy = hy + (dy / d) * dc; } else { o.fx = fx; o.fy = fy; }
  return o;
}

// ───────────────────────── 메인 ─────────────────────────
function tick(b, world, st) {
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  if (st.q.name !== tierOf(world.game)) st.q = qualityOf(world.game);
  const F = b.A?.floor ?? b.boss?.A?.floor ?? b.bottom + HOVER;
  st.P.update(dt, F); st.shards.update(dt, F);
  return dt;
}
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, dt = tick(b, world, st), P = st.P, q = st.q;
  const ratio = b.dying > 0 ? 0 : clamp(b.hp / b.stats.maxHp, 0, 1);
  const form = b.formPhase ?? 0;
  const lvl = b.dying > 0 ? 2 : ratio < 0.33 ? 2 : ratio < 0.66 ? 1 : 0;
  if (st.lvl >= 0 && lvl > st.lvl && !(b.dying > 0)) levelBurst(st, b, rig, lvl);
  st.lvl = lvl;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) { st.jolt = 1; st.flashSel = struckGroup(b); hitBurst(st, b); }
  st.jolt = Math.max(0, st.jolt - dt * 6);
  // 산산조각 (사망 1.55초): 마지막 그린 부품 배치 그대로 강체 파편으로
  if (b.shattered && !st.shattered) { st.shattered = true; shatterBurst(st, b, rig); }
  if (!b.shattered && st.shattered && !(b.dying > 0)) st.shattered = false;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  D.begin(ctx); D.end();
  b.paintBack?.(ctx, world);
  P.draw(ctx, 0);
  if (!b.shattered) {
    const dying = b.dying > 0, el = dying ? 2.8 - b.dying : 0;
    const shake = dying ? Math.sin((b.t ?? 0) * 70) * 2.2 * clamp(el / 1.5, 0, 1) : (st.jolt > 0 ? (rr.next() - 0.5) * 3 * st.jolt : 0);
    drawNark(ctx, D, rig, st, {
      b, x: b.cx + shake, y: b.bottom, f: b.facing, P: b.pose, t: b.t ?? 0, form, lvl, ratio, legs: b.legs, floor: b.A.floor,
      tear: !!(b.twin && !b.twin.dead), eyeGlow: b.eyeGlow ?? 0, maskCrack: b.maskCrack ?? 0, look: lookOf(b, world),
      flash: b.flashT > 0 ? clamp(b.flashT / 0.12, 0, 1) : 0, sel: st.flashSel, twin: false, dying, el, rec: dying,
    });
  }
  D.end();
  st.shards.draw(D);
  D.end();
  b.paintFront?.(ctx, world);          // 기절 금빛 고리 (로직)
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}
/** 거울 분신: 같은 퍼핏을 옅게 + 청백 발광 실루엣, 세 번 맞으면 로직이 깨뜨린다 */
function drawTwin(ctx, tw, world, rig, st) {
  const D = st.D;
  tick(tw, world, st);
  const host = tw.boss;
  const a = 0.62 * (tw.inT ?? 1) * (tw.fadeT >= 0 ? clamp(1 - tw.fadeT / 0.45, 0, 1) : 1);
  if (a <= 0.01 || !host) return;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  D.begin(ctx); D.end();
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a;
  drawNark(ctx, D, rig, st, {
    b: tw, x: tw.cx, y: tw.bottom, f: tw.facing, P: tw.pose, t: tw.t ?? 0, form: host.formPhase ?? 0, lvl: 0, ratio: 1, legs: tw.legs, floor: host.A.floor,
    tear: false, eyeGlow: 0.4, maskCrack: 0, look: [0, 0.3], flash: tw.flashT > 0 ? 1 : 0, sel: 'all', twin: true, glowA: 0.28, dying: false, el: 0,
  });
  ctx.globalAlpha = ga;
  D.end();
  ctx.imageSmoothingQuality = q0;
}
function lookOf(b, world) {
  const p = world.player; if (!p) return [0, 0];
  const fx = b.cx + b.facing * 2, fy = b.bottom + (b.pose?.bob ?? 0) + ((b.formPhase ?? 0) >= 2 ? FACE2_C : MASK_C);
  return [clamp((p.cx - fx) / 300, -1, 1) * b.facing, clamp((p.cy - fy) / 300, -1, 1)];
}
function struckGroup(b) {
  const hp = b.hitPart;
  if (!hp) return 'body';
  if (hp.face) return 'head';
  if (b.dashing) return 'all';
  const dx = hp.x + hp.w / 2 - b.cx;
  return Math.abs(dx) < 30 ? 'body' : 'arms';
}

/**
 * 나르키사 한 몸 (보스 · 분신 공용)
 * o: {b, x, y, f, P, t, form, lvl, ratio, legs, floor, tear, eyeGlow, maskCrack, look, flash, sel, twin, glowA, dying, el, rec}
 */
function drawNark(ctx, D, rig, st, o) {
  const R = rig.parts, q = st.q, P = o.P, t = o.t, form = o.form, L = st.L, lvl = o.lvl;
  const Y = o.y + (P.bob ?? 0);
  const fade = clamp(P.fade ?? 1, 0, 1);
  if (fade <= 0.01) return;
  setL(L, o.x, Y, o.f, P.rot, P.scale, fade);
  const V = (p, deep = false, lv = lvl) => pickVariant(p, lv, deep, null);
  const halos = q.halos;
  const recAll = o.flash > 0 && o.sel === 'all';
  const recOn = (g) => o.flash > 0 && (recAll || o.sel === g);
  if (o.flash > 0) D.startFlash(); else D.rec = false;
  if (o.rec) st.rec.length = 0;
  const rec = o.rec ? st.rec : null;
  // ── 뒤 발광 · 바닥 반사 ──
  if (halos) {
    W(L, 0, -150, st.W);
    halo(ctx, st.W[0], st.W[1], 170, o.twin ? GL_C : '#8090c0', (o.twin ? 0.32 : 0.18) * fade);
    const fr = o.floor - Y;
    if (fr > -10 && fr < 90) halo(ctx, o.x, o.floor, 110, GL, 0.16 * (1 - fr / 90) * fade);
  }
  // ── 거미 다리 (월드 좌표, 로직 발 위치) ──
  drawLegs(ctx, D, rig, st, o, fade);
  D.rec = false;
  const HY = MASK_C;
  // ── 2형태: 깨진 거울 후광 + 뒤쪽 공전 파편 ──
  if (form >= 2 && R.halo2) {
    put(D, L, R.halo2, R.halo2.v.base, 'c', 0, FACE2_C - 4, Math.sin(t * 0.4) * 0.08, 1 + Math.sin(t * 2) * 0.02);
    orbit(D, L, rig, t, P, false);
  }
  // ── 유리 바늘 왕관 (1형태: 머리 뒤, 2형태: 부러진 바늘 = 손상 변형) ──
  if (R.crown) {
    const cs = 1 + Math.sin(t * 2) * 0.03 + (P.scream ?? 0) * 0.12;
    const cy = form >= 2 ? FACE2_C + 18 : HY + 14;
    put(D, L, R.crown, V(R.crown, false, form >= 2 ? 2 : form >= 1 ? 1 : 0), 'c', 0, cy, (P.tilt ?? 0) * 0.5, cs, 1 + (P.spread ?? 0) * 0.15, 1);
    if (halos && !o.twin) {
      const i = Math.floor(t * 1.3) % 7, a = -PI / 2 + (i - 3) * 0.32;
      W(L, Math.cos(a) * 80 * cs, cy + Math.sin(a) * 80 * cs, st.W);
      halo(ctx, st.W[0], st.W[1], 12, '#ffffff', (0.4 + 0.4 * Math.sin(t * 7 + i)) * fade, true);
    }
  }
  // ── 등 칼날 팔 4개 ──
  for (let k = 0; k < 4; k++) {
    const [s, sx, sy, a0, e0] = BLADE_ARMS[k];
    const upper = k < 2;
    const tw = Math.sin(t * 2.3 + k * 1.7) * 0.07 + Math.sin(t * 7.1 + k) * 0.02;
    let a = a0 + (P.ba ?? 0) * 0.45 + tw, e = e0 + (P.ba ?? 0) * 0.7;
    const sw = upper ? (P.high ?? 0) : (P.low ?? 0);
    if (sw > 0.01) { a = lerp(a, upper ? 1.62 : 0.75, sw); e = lerp(e, upper ? 0.05 : 0.35, sw); }
    if ((P.droop ?? 0) > 0.01) { a = lerp(a, 0.5, P.droop); e = lerp(e, 0.2, P.droop); }
    const L1 = 64, L2 = 70;
    const ex = sx + s * Math.sin(a) * L1, ey = sy + Math.cos(a) * L1, bb = a + e;
    const wx = ex + s * Math.sin(bb) * L2, wy = ey + Math.cos(bb) * L2;
    seg(D, L, R.upper, V(R.upper, true), 'a', 'b', sx, sy, ex, ey);
    seg(D, L, R.fore, V(R.fore, true), 'a', 'b', ex, ey, wx, wy);
    if (R.blade) {
      const dir = Math.atan2(Math.cos(bb), s * Math.sin(bb)), ax = axis(R.blade, 'base', 'tip');
      put(D, L, R.blade, R.blade.v.base, 'base', wx, wy, dir - ax.a, 1.0, 1, s);
    }
  }
  // ── 드레스 (거울 조각 종) ──
  const dmg = 1 - o.ratio;
  D.rec = recOn('body');
  if (R.gown) {
    const sp = P.spread ?? 0, swing = P.swing ?? 0;
    put(D, L, R.gown, V(R.gown), 'waist', 0, WAIST - 10, swing * 0.06 + Math.sin(t * 1.3) * 0.012, 1, 1.18 + sp * 0.18, 1);
    if (rec) pushRec(rec, D, L, R.gown, V(R.gown), 'waist', 0, WAIST - 10, 0, 1, 1.18, 1);
    glowOver(ctx, D, L, R.gown, lvl, 'waist', 0, WAIST - 10, 0, 1, 1.18 + sp * 0.18, 1, fade * 0.8, t, st, q);
  }
  // 드레스 앞에 매달린 조각들 (피해가 쌓이면 하나씩 떨어져 나간다)
  for (let i = 0; i < HANG.length; i++) {
    const [hx, hy, hs, thr] = HANG[i], part = rig.sh[i % Math.max(1, rig.sh.length)];
    if (!part) break;
    const gone = !o.twin && dmg > thr;
    if (!o.twin) {
      if (gone && !st.fallen[i]) { st.fallen[i] = true; dropShard(st, L, part, hx, hy, hs, o); }
      else if (!gone && st.fallen[i]) st.fallen[i] = false;
    }
    if (gone) continue;
    const sw = Math.sin(t * 1.35 + i * 1.7) * 0.06 + (P.swing ?? 0) * 0.25 + (P.spread ?? 0) * hx * 0.004;
    const w = 1 + (P.spread ?? 0) * 0.25;
    put(D, L, part, V(part, false, Math.min(1, lvl)), topPivot(part), hx * w, hy, sw, hs * 0.62);
    if (rec) pushRec(rec, D, L, part, V(part), topPivot(part), hx * w, hy, sw, hs * 0.62, 1, 1);
  }
  if (halos && dmg > 0.2 && !o.twin) { W(L, 0, -60, st.W); halo(ctx, st.W[0], st.W[1], 70, GL_V, (0.12 + dmg * 0.18) * fade); }
  // ── 뒤쪽 앞팔 (어둡게) ──
  D.rec = recOn('arms');
  drawArm(D, L, rig, st, -1, P.fa0a ?? 0.4, P.fa0e ?? 0.5, P, false, V, rec);
  // ── 몸통 ──
  D.rec = recOn('body');
  if (R.torso) {
    put(D, L, R.torso, V(R.torso), 'waist', 0, WAIST + 6, 0, 1);
    if (rec) pushRec(rec, D, L, R.torso, V(R.torso), 'waist', 0, WAIST + 6, 0, 1, 1, 1);
    glowOver(ctx, D, L, R.torso, lvl, 'waist', 0, WAIST + 6, 0, 1, 1, 1, fade, t, st, q);
    if (halos && R.torso.gem) {
      localPt(R.torso, 'waist', R.torso.gem, 0, WAIST + 6, 0, 1, st.lp);
      W(L, st.lp[0], st.lp[1], st.W);
      halo(ctx, st.W[0], st.W[1], 16 + Math.sin(t * 3) * 2, GEM, (0.55 + 0.25 * Math.sin(t * 3)) * fade, true);
    }
  }
  // ── 머리 ──
  D.rec = recOn('head');
  drawHead(ctx, D, rig, st, o, V, rec);
  // ── 앞쪽 앞팔 ──
  D.rec = recOn('arms');
  drawArm(D, L, rig, st, 1, P.fa1a ?? 1.95, P.fa1e ?? 0.85, P, true, V, rec);
  D.rec = false;
  if (form >= 2) orbit(D, L, rig, t, P, true);
  // ── 피격 섬광 / 분신 발광 ──
  D.end();
  if (o.flash > 0) D.flash(o.twin ? 0.7 * o.flash : 0.62 * o.flash);
  if (o.twin && o.glowA > 0) {
    // 분신: 몸통 부품의 청백 발광 실루엣을 옅게 더해 유리 유령처럼
    D.startFlash();
    if (R.gown) put(D, L, R.gown, R.gown.v.base, 'waist', 0, WAIST - 10, 0, 1, 1.18 + (P.spread ?? 0) * 0.18, 1);
    if (R.torso) put(D, L, R.torso, R.torso.v.base, 'waist', 0, WAIST + 6, 0, 1);
    D.end();
    D.flash(o.glowA, 'glow');
  }
  // 반짝임 입자 (유리)
  if (!o.twin && !o.dying && q.particles > 150) {
    st.glint += 1 / 60;
    if (st.glint > 0.12) {
      st.glint = 0;
      W(L, rr.range(-80, 80), rr.range(-280, -20), st.W);
      st.P.emit('spore', st.W[0], st.W[1], rr.range(-10, 10), rr.range(-20, 5), { color: rr.chance(0.5) ? GL : GL_C, life: rr.range(0.5, 1.1), size: rr.range(0.8, 1.8) });
    }
  }
}
function topPivot(part) { return part._top ??= [part.c[0], part.pad + 6]; }

/** 거미 다리 6개 (뒤 → 앞). 로직이 발 위치를 계산한다 (바닥에 박혔다가 한 발씩 옮김, 떠오르면 늘어뜨림) */
function drawLegs(ctx, D, rig, st, o, fade) {
  const F = o.legs?.F, R = rig.parts;
  if (!F || !R.thigh || !R.shin) return;
  const J = st._ik ??= {};
  for (let i = 2; i >= 0; i--) {
    for (const qd of F) {
      if (qd.i !== i || !qd.init) continue;
      const [L1, L2] = LEG_L[i];
      ik2(qd.hx, qd.hy, qd.x, qd.y, L1, L2, qd.s, J);
      const deep = i === 2;
      const wm = 0.62 - i * 0.04;
      segW(D, R.thigh, pickVariant(R.thigh, Math.min(1, o.lvl), deep, null), 'a', 'b', qd.hx, qd.hy, J.kx, J.ky, wm, fade);
      segW(D, R.shin, pickVariant(R.shin, Math.min(1, o.lvl), deep, null), 'a', 'tip', J.kx, J.ky, J.fx, J.fy, wm * 0.95, fade);
    }
  }
  D.end();
}
/** 앞팔 한 쪽: 어깨 → 팔꿈치 → 손목 + 손 (앞쪽 손은 손거울을 들 수 있다) — 로직 arm() 과 같은 각 */
function drawArm(D, L, rig, st, s, a, e, P, front, V, rec) {
  const R = rig.parts;
  if ((P.droop ?? 0) > 0.01) { a = lerp(a, 0.12, P.droop); e = lerp(e, 0.15, P.droop); }
  const sx = s * 36, sy = -198, L1 = 66, L2 = 70;
  const ex = sx + s * Math.sin(a) * L1, ey = sy + Math.cos(a) * L1, bb = a + e;
  const wx = ex + s * Math.sin(bb) * L2, wy = ey + Math.cos(bb) * L2;
  const deep = !front;
  seg(D, L, R.upper, V(R.upper, deep), 'a', 'b', sx, sy, ex, ey);
  seg(D, L, R.fore, V(R.fore, deep), 'a', 'b', ex, ey, wx, wy);
  const dir = Math.atan2(Math.cos(bb), s * Math.sin(bb));
  if (front && (P.mirror ?? 0) > 0.3 && R.hmirror) {
    const ax = axis(R.hmirror, 'grip', 'c');
    put(D, L, R.hmirror, R.hmirror.v.base, 'grip', wx, wy, dir - 0.3 - ax.a, clamp(P.mirror, 0, 1));
  }
  if (R.hand) {
    const ax = axis(R.hand, 'w', 'tip');
    put(D, L, R.hand, V(R.hand, deep), 'w', wx, wy, dir - ax.a, 1, 1, s);
    if (rec) pushRec(rec, D, L, R.hand, V(R.hand, deep), 'w', wx, wy, dir - ax.a, 1, 1, s);
  }
  if (rec) { recSeg(rec, D, L, R.upper, V(R.upper, deep), 'a', 'b', sx, sy, ex, ey); recSeg(rec, D, L, R.fore, V(R.fore, deep), 'a', 'b', ex, ey, wx, wy); }
}
/** 머리: 1형태 가면 / 2형태 눈 가득한 얼굴 + 경첩 턱 (아가리 속은 절차적) */
function drawHead(ctx, D, rig, st, o, V, rec) {
  const R = rig.parts, L = st.L, P = o.P, t = o.t, form = o.form, q = st.q, fade = L.a;
  const tilt = (P.tilt ?? 0) + Math.sin(t * 0.9) * 0.03;
  const mc = form < 2 ? clamp(o.maskCrack, 0, 1) : 0;
  const shx = mc > 0 ? Math.sin(t * 60) * 1.2 * mc : 0;
  if (form >= 2 && R.head2) {
    // 얼굴 가운데 = FACE2_C (목 둘레로 기울임)
    const fx = shx - Math.sin(tilt) * (FACE2_C - NECK), fy = NECK + Math.cos(tilt) * (FACE2_C - NECK);
    const H = R.head2, lv = o.ratio < 0.12 ? 2 : o.ratio < 0.22 ? 1 : 0;
    const jo = 2 + (P.jaw ?? 0.2) * 20;
    // 경첩 지역 좌표
    const hp = localPt(H, 'face', H.hinge ?? H.face, fx, fy, tilt, 1, st.lp);
    const hx = hp[0] - Math.sin(tilt) * jo, hy = hp[1] + Math.cos(tilt) * jo;
    // 아가리 속 (검붉은 목구멍 + 붉은 빛)
    W(L, (hp[0] + hx) / 2, (hp[1] + hy) / 2 - 4, st.W);
    D.end();
    ctx.fillStyle = '#050106';
    ctx.beginPath(); ctx.ellipse(st.W[0], st.W[1], 24 * L.sc, (10 + jo * 0.6) * L.sc, L.f * (tilt + L.rot), 0, TAU); ctx.fill();
    if (q.halos) halo(ctx, st.W[0], st.W[1] + 4, 20 + jo * 0.5, RED, (0.3 + (P.jaw ?? 0) * 0.4) * fade);
    if (R.jaw2) {
      put(D, L, R.jaw2, V(R.jaw2, false, lv), 'hinge', hx, hy, tilt, 1);
      if (rec) pushRec(rec, D, L, R.jaw2, V(R.jaw2, false, lv), 'hinge', hx, hy, tilt, 1, 1, 1);
    }
    put(D, L, H, V(H, false, lv), 'face', fx, fy, tilt, 1);
    if (rec) pushRec(rec, D, L, H, V(H, false, lv), 'face', fx, fy, tilt, 1, 1, 1);
    glowOver(ctx, D, L, H, Math.max(lv, 1), 'face', fx, fy, tilt, 1, 1, 1, fade * 0.7, t, st, q);
    eyes(ctx, D, L, st, H, 'face', fx, fy, tilt, H.eyes, o, true);
    W(L, fx, fy, st.faceW);
  } else if (R.head) {
    const H = R.head;
    put(D, L, H, V(H, false, mc > 0.05 ? 2 : o.lvl), 'neck', shx, NECK + 2, tilt, 1);
    if (rec) pushRec(rec, D, L, H, V(H, false, 2), 'neck', shx, NECK + 2, tilt, 1, 1, 1);
    glowOver(ctx, D, L, H, mc > 0.05 ? 2 : o.lvl, 'neck', shx, NECK + 2, tilt, 1, 1, 1, fade * Math.max(mc * 1.4, o.lvl ? 0.8 : 0), t, st, q);
    eyes(ctx, D, L, st, H, 'neck', shx, NECK + 2, tilt, H.eyes, o, false);
    if (o.tear && H.eyeR) {
      // 진짜 여제의 옅은 붉은 눈물 (분신과 구별)
      localPt(H, 'neck', H.eyeR, shx, NECK + 2, tilt, 1, st.lp);
      W(L, st.lp[0], st.lp[1] + 2, st.W); W(L, st.lp[0] + 0.5, st.lp[1] + 17, st.W2);
      D.end();
      ctx.strokeStyle = 'rgba(255,40,70,0.85)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(st.W[0], st.W[1]); ctx.quadraticCurveTo(st.W[0] + L.f * 1.5, (st.W[1] + st.W2[1]) / 2, st.W2[0], st.W2[1]); ctx.stroke();
      if (q.halos) halo(ctx, st.W2[0], st.W2[1], 6, RED, 0.6 * fade);
    }
    localPt(H, 'neck', H.face, shx, NECK + 2, tilt, 1, st.lp);
    W(L, st.lp[0], st.lp[1], st.faceW);
  }
}
/** 눈빛: 칠해진 눈 위에 플레이어 쪽을 보는 빛 (가끔 깜빡) */
function eyes(ctx, D, L, st, H, pv, lx, ly, lrot, list, o, many) {
  if (!list?.length || !st.q.halos) return;
  D.end();
  const t = o.t, g = o.eyeGlow ?? 0, lk = o.look ?? [0, 0], fade = L.a;
  for (let i = 0; i < list.length; i++) {
    const blink = ((t * 0.37 + h01(i) * 7) % 3.1) < 0.12;
    if (blink && !g) continue;
    localPt(H, pv, list[i], lx, ly, lrot, 1, st.lp);
    const main = i < 2;
    const r = (many ? 3.2 : main ? 3.6 : 2) * (1 + g * 0.4);
    W(L, st.lp[0] + lk[0] * (main ? 1.4 : 0.8), st.lp[1] + lk[1] * 1.0, st.W);
    const col = many ? (i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? EYE_C : GL_V) : (main ? EYE_C : '#ffffff');
    halo(ctx, st.W[0], st.W[1], r * (3 + g * 1.5), col, (0.34 + g * 0.3) * fade, true);
  }
}
/** 3페이즈: 머리 둘레를 도는 거울 파편 8개 (front = 앞쪽 절반만) */
function orbit(D, L, rig, t, P, front) {
  const list = rig.debs; if (!list.length) return;
  const hy = FACE2_C;
  for (let i = 0; i < 8; i++) {
    const a = t * 0.9 + (i / 8) * TAU, z = Math.sin(a);
    if ((z > 0) !== front) continue;
    const r = 118 + (P.spread ?? 0) * 30, x = Math.cos(a) * r, y = hy + 40 + z * 26 + Math.sin(t * 2 + i) * 6;
    const part = list[(i * 3) % list.length];
    put(D, L, part, part.v.base, 'c', x, y, a * 2 + i, (0.55 + 0.2 * z) * 0.8);
  }
}

// ───────────────────────── 균열 발광 ─────────────────────────
function glowOver(ctx, D, L, part, lvl, pivot, lx, ly, lrot, sc, sxm, sym, a, t, st, q) {
  if (!q.crackGlow || lvl <= 0 || a <= 0.01 || !part) return;
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 ? 1 : 0);
  if (!drawn) return;
  const g = drawn === 2 ? part.gl.dmg2 : part.gl.dmg1;
  if (!g) return;
  const pv = part[pivot], w = W(L, lx, ly, st.W), k = part.k * sc * L.sc;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + part.w * 0.01)) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, w[0], w[1], L.f * (lrot + L.rot), k * 2 * sxm * L.f, k * 2 * sym, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
  D.end();
}

// ───────────────────────── 파편 · 사망 ─────────────────────────
/** 사망 산산조각용 배치 기록 (그린 그대로 강체 파편이 된다) */
function pushRec(rec, D, L, part, img, pivot, lx, ly, lrot, sc, sxm, sym) {
  if (!part || !img || rec.length > 40) return;
  const w = W(L, lx, ly, _w), k = part.k * sc * L.sc, pv = typeof pivot === 'string' ? part[pivot] : pivot;
  rec.push({ img, px: pv[0], py: pv[1], x: w[0], y: w[1], rot: L.f * (lrot + L.rot), sx: k * sxm * L.f, sy: k * sym, r: Math.max(part.w, part.h) * part.k * sc * 0.25 });
}
function recSeg(rec, D, L, part, img, pa, pb, x0, y0, x1, y1) {
  if (!part) return;
  const ax = axis(part, pa, pb), len = Math.hypot(x1 - x0, y1 - y0) || 1;
  pushRec(rec, D, L, part, img, pa, x0, y0, Math.atan2(y1 - y0, x1 - x0) - ax.a, len / (ax.len || 1), 1, 1);
}
function shatterBurst(st, b, rig) {
  const cx = b.cx, cy = b.bottom - 150;
  for (const r of st.rec) {
    const a = Math.atan2(r.y - cy, r.x - cx) + rr.range(-0.5, 0.5), sp = rr.range(160, 420);
    st.shards.spawn(r.img, r.px, r.py, r.x, r.y, r.rot, r.sx, r.sy, Math.cos(a) * sp, Math.sin(a) * sp - 260, rr.range(-7, 7), { r: clamp(r.r, 6, 40), fade: 1.15, bounce: 0.35 });
  }
  st.rec.length = 0;
  spawnDeb(st, rig, cx, cy, 14, 480, 0.9, 1.1);
  st.P.burst('spore', cx, cy, 40, { speed: 380, color: GL, life: 1.0, size: 2 });
  st.P.burst('spore', cx, cy - 60, 24, { speed: 300, color: GL_C, life: 0.9, size: 1.6 });
}
function spawnDeb(st, rig, x, y, n, speed, sc = 1, fade = 1.4, up = 1) {
  const L = rig.debs; if (!L?.length) return;
  for (let j = 0; j < n; j++) {
    const p = L[(j * 3 + (x | 0)) % L.length], a = -PI / 2 * up + rr.range(-1.5, 1.5), sp = speed * rr.range(0.4, 1);
    st.shards.spawn(p.v.base, p.c[0], p.c[1], x + rr.range(-20, 20), y + rr.range(-20, 20), rr.next() * TAU, p.k * sc * rr.range(0.35, 0.7) * rr.sign(), p.k * sc * rr.range(0.35, 0.7), Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-9, 9), { r: (p.r ?? 8) * sc * 0.4, fade, bounce: 0.35 });
  }
}
function dropShard(st, L, part, hx, hy, hs, o) {
  const pv = topPivot(part), w = W(L, hx, hy, _w), k = part.k * hs * 0.62 * L.sc;
  st.shards.spawn(part.v.base, pv[0], pv[1], w[0], w[1], L.f * L.rot, k * L.f, k, rr.range(-60, 60), rr.range(-80, 20), rr.range(-3, 3), { r: 14, fade: 2.2, bounce: 0.3 });
  st.P.burst('spore', w[0], w[1] + 20, 10, { speed: 160, color: GL, life: 0.7, size: 1.6 });
}
function hitBurst(st, b) {
  const hp = b.hitPart, x = hp ? hp.x + hp.w / 2 : b.cx, y = hp ? hp.y + hp.h / 2 : b.bottom - 150;
  st.P.burst('spore', x, y, 10, { speed: 220, color: GL, life: 0.5, size: 1.6 });
}
function levelBurst(st, b, rig, lvl) {
  const x = b.cx, y = b.bottom - 170;
  spawnDeb(st, rig, x, y, 4 + lvl * 2, 300, 0.8, 1.6);
  st.P.burst('spore', x, y, 24, { speed: 300, color: GL_C, life: 0.8, size: 2 });
}

// ───────────────────────── 로직이 쓰는 채색 소품 (rig.art) ─────────────────────────
function makeArt(rig) {
  const R = rig.parts;
  const frameK = (() => { const f = R.frame; if (!f?.glassR) return 1; return 25 / (f.glassR * f.k); })();   // 유리 반폭 25px 에 맞춤
  const GD = new Drawer();
  return {
    /** 벽거울 틀 (x,y = 유리 가운데). 로직이 그 위에 금빛/섬광/균열을 덧그린다 */
    frame(ctx, x, y, rot = 0, s = 1) {
      const f = R.frame; if (!f) return false;
      const im = f.v.base, k = f.k * frameK * s;
      ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
      ctx.drawImage(im, -f.c[0] * k, -f.c[1] * k, im.width * k, im.height * k);
      ctx.restore();
      return true;
    },
    /** 거울 조각 탄 (만화경 · 파편 비): i = 모양, len = 긴 변 (월드 px) */
    shard(ctx, x, y, rot, len, i = 0, alpha = 1) {
      const L = rig.sh.length ? rig.sh : rig.debs; if (!L.length) return false;
      const p = L[Math.abs(i | 0) % L.length], im = p.v.base, k = len / Math.max(1, Math.max(p.w, p.h) - p.pad * 2);
      const ga = ctx.globalAlpha; ctx.globalAlpha = ga * alpha;
      ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
      ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k);
      ctx.restore(); ctx.globalAlpha = ga;
      return true;
    },
    /** 돌진 잔상: 드레스·몸통·머리의 청백 발광 실루엣 (fx.ghost 콜백에서) */
    ghost(ctx, x, y, f, P, form, a) {
      if (!R.gown || !R.torso) return false;
      const L = { x: 0, y: 0, f: 1, rot: 0, c: 1, s: 0, sc: 1, a: 1 };
      setL(L, x, y + (P.bob ?? 0), f, P.rot, P.scale, clamp(P.fade ?? 1, 0, 1) * a);
      GD.begin(ctx);
      const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      const g = (p) => p.v.glow ?? p.v.flash ?? p.v.base;
      put(GD, L, R.gown, g(R.gown), 'waist', 0, WAIST - 10, 0, 1, 1.18, 1);
      put(GD, L, R.torso, g(R.torso), 'waist', 0, WAIST + 6, 0, 1);
      const H = form >= 2 ? R.head2 : R.head;
      if (H) put(GD, L, H, g(H), form >= 2 ? 'face' : 'neck', 0, form >= 2 ? FACE2_C : NECK + 2, P.tilt ?? 0, 1);
      GD.end();
      ctx.globalCompositeOperation = op;
      return true;
    },
  };
}
