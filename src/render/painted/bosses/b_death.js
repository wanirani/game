// 사신 데스 (b_death) — 채색 컷아웃 퍼핏 렌더러 (1형태 망토 사신 + 2형태 뿔 달린 거대 해골, 한 아틀라스)
// 부품 (Kling): 1형태 — 두건 쓴 금 간 해골(경첩 턱) · 가시 망토에 싸인 흉곽(영혼불) · 뼈 팔(위팔 / 주먹 쥔 아래팔 / 편 손) ·
//   척추뼈 감긴 자루 + 거대한 초승달 낫날 · 망토 천 무늬.  2형태 — 뿔 달린 해골(경첩 턱) · 비명 지르는 영혼이 갇힌 거대 흉곽+골반 ·
//   찢긴 막의 뼈 날개(가까운 쪽 / 먼 쪽 거울 + 어둡게) · 뼈 창(가시 곤봉) · 비명 영혼 4종 · 뼈 파편 8종
// 절차적 층: verlet 망토 자락(채색 무늬) · 2형태 불타는 누더기 자락 · 영혼불(눈구멍·흉곽·꼬리) · 궤도 영혼 · 낫 휘두름 잔상(발광 실루엣) ·
//   변신 때 망토가 아래부터 타 들어감(불꽃 선) · 순간이동 예고 잔상 · 돌진 잔상 · 사망 붕괴(날개 재 → 팔·낫 낙하 → 해골이 튀고 흉곽 폭발)
// 로직(src/game/bosses/b_death.js)의 상태를 읽기만 한다:
//   boss { cx, bottom, facing, t, st, state, form, scale(S), arm{a,s}, hasScythe, vanish, burn, dim, souls[], blinkTo, dashFrom/To,
//          phase, hp/stats.maxHp, flashT, dying, _boom, jawOpen(), A{floor,x0,x1} }
// 판정은 바꾸지 않는다: hitParts = 몸통 기둥(52·S × 118·S). 두건/뿔 해골·날개·낫은 벡터 때처럼 판정 밖으로 나온다 (그림만).
import { Drawer, Strand, Particles, Shards, halo, puff, rr, hash1, loadRig, pickVariant, quality, ik2, makeCanvas } from '../kit.js';

const DIR = 'painted/bosses/b_death';
const SOUL = '#7dffb0', SOUL_L = '#d8ffe8', SOUL_D = '#1f8a5a';
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));

const DEF = {
  glow: SOUL,
  outline: { width: 2.0, color: 'rgba(4,8,6,0.92)' },
  defaults: { stain: 'rgb(40,60,40)', char: 1.4 },
  parts: {
    hood: { flash: true, cracks: 3, holes: 1 }, hjaw: { flash: true, cracks: 1, holes: 0 },
    torso: { flash: true, cracks: 3, holes: 3, membrane: true },
    skull2: { flash: true, cracks: 4, holes: 1 }, sjaw: { flash: true, cracks: 2, holes: 0 },
    rib2: { flash: true, cracks: 4, holes: 1 },
    wing: { flash: true, deep: 0.62, membrane: true, holes: 4, cracks: 2 },
    humerus: { flash: true, deep: 0.62, cracks: 1, holes: 0 }, foreFist: { flash: true, deep: 0.62, cracks: 1, holes: 0 }, foreOpen: { flash: true, deep: 0.62, cracks: 1, holes: 0 },
    shaft: { noDmg: true, flash: true, outline: 1.6 }, blade: { noDmg: true, flash: true, outline: 1.6 },
    spike: { noDmg: true, flash: true, outline: 1.6 },
    cloak_tex: { noDmg: true, outline: 0 },
  },
  prefix: { deb: { noDmg: true, outline: 1.3 }, soul: { noDmg: true, outline: 0 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_death', kind: 'boss', ownsDeathFade: true,
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    const names = Object.keys(rig.parts);
    rig.debs = names.filter((n) => n.startsWith('deb'));
    rig.soulsP = names.filter((n) => n.startsWith('soul'));
    rig.cloak = clothTexture(rig);
    rig.art = makeArt(rig);
    return rig;
  },
  init(b, rig) {
    const q = quality(b.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(56), q, lt: null, pf: 0, jolt: 0, lvl: -1, lvlSeen: -1,
      cape: new Strand(8, 16, { g: 800, damp: 0.93 }), rags: [new Strand(7, 12, { g: 700, damp: 0.92 }), new Strand(7, 13, { g: 700, damp: 0.92 })],
      ghosts: [], ghostT: 0, form: b.form ?? 1, formBurst: false, jawA: 0, px: null, vx: 0,
      gone: { wingF: false, wingN: false, arms: false, scythe: false, skull: false, body: false },
      L: { x: 0, y: 0, f: 1, lean: 0, c: 1, s: 0, sc: 1 }, W: [0, 0], W2: [0, 0], grip: [0, 0], gripW: [0, 0], heartW: null, o: {}, og: {},
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) { return bounds(b, st, out); },
  lights(L, b, rig, st) { if (st.heartW && b.vanish < 0.8 && !st.gone.body) L.add(st.heartW[0], st.heartW[1], 90 * (b.scale ?? 1), SOUL, 0.5); },
  debris(i, rig) {
    const names = rig.debs; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k;
    return { size: Math.max(8, (p.r ?? 8) * 1.2), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

function clothTexture(rig) {
  const p = rig.parts.cloak_tex; if (!p) return null;
  const im = p.v.base, pad = p.pad ?? 4;
  const w = Math.max(8, im.width - pad * 2 - 2), h = Math.max(8, im.height - pad * 2 - 2);
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.drawImage(im, pad + 1, pad + 1, w, h, 0, 0, w, h);
  return { canvas: c, k: 1 / rig.td * 0.7, pat: null, m: null };
}

// ───────────────────────── 경계 ─────────────────────────
function bounds(b, st, out) {
  const S = b.scale ?? 1, f2 = (b.form ?? 1) === 2;
  const rx = (f2 ? 240 : 150) * S, top = (f2 ? 280 : 230) * S;
  let x0 = b.cx - rx, x1 = b.cx + rx, y0 = b.bottom - top, y1 = b.bottom + 40;
  for (const g of st?.ghosts ?? []) { x0 = Math.min(x0, g.x - rx); x1 = Math.max(x1, g.x + rx); y0 = Math.min(y0, g.y - top); y1 = Math.max(y1, g.y + 40); }
  if (b.blinkTo) { x0 = Math.min(x0, b.blinkTo.x - rx); x1 = Math.max(x1, b.blinkTo.x + rx); y0 = Math.min(y0, b.blinkTo.y - top); }
  if ((b.dying > 0 || st?.shards?.list.length) && b.A) { x0 = Math.min(x0, b.A.x0); x1 = Math.max(x1, b.A.x1); y0 = Math.min(y0, b.bottom - 420); y1 = Math.max(y1, b.A.floor + 8); }
  out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
  return out;
}

// ───────────────────────── 지역 → 월드 ─────────────────────────
const LEAN_Y = -70;
function setL(L, x, y, f, lean, sc = 1) { L.x = x; L.y = y; L.f = f; L.lean = lean; L.c = Math.cos(lean); L.s = Math.sin(lean); L.sc = sc; }
function W(L, lx, ly, out) {
  lx *= L.sc; ly *= L.sc;
  const oy = LEAN_Y * L.sc, dy = ly - oy;
  out[0] = L.x + L.f * (L.c * lx - L.s * dy); out[1] = L.y + oy + L.s * lx + L.c * dy;
  return out;
}
const _pw = [0, 0], _q = [0, 0], _q2 = [0, 0], _ik = {};
function put(D, L, part, img, pivot, lx, ly, lrot, alpha = 1, sc = 1, sxm = 1) {
  const w = W(L, lx, ly, _pw), k = part.k * sc * L.sc;
  D.part(part, img, pivot, w[0], w[1], L.f * (lrot + L.lean), k * sxm * L.f, k, alpha);
}
function axis(p, a, b) {
  const key = a + '>' + b, c = (p._ax ??= {});
  if (!c[key]) { const A = p[a], B = p[b]; c[key] = { a: Math.atan2(B[1] - A[1], B[0] - A[0]), len: Math.hypot(B[0] - A[0], B[1] - A[1]) * p.k }; }
  return c[key];
}
/** 부품 p 의 피벗 pv 가 지역 (lx,ly), 회전 lrot, 배율 sc (가로 거울 sxm) 로 놓였을 때 텍셀 점 q 의 지역 좌표 */
function localPt(p, pv, q, lx, ly, lrot, sc, out, sxm = 1) {
  const A = p[pv], dx = (q[0] - A[0]) * p.k * sc * sxm, dy = (q[1] - A[1]) * p.k * sc, c = Math.cos(lrot), s = Math.sin(lrot);
  out[0] = lx + c * dx - s * dy; out[1] = ly + s * dx + c * dy; return out;
}

// ───────────────────────── 메인 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, q0q = world.game?.settings?.quality ?? 'high';
  if (st.q.name !== q0q) st.q = quality(world.game);
  if (st.rig !== rig) { st.rig = rig; st.gCape = null; }
  const q = st.q, P = st.P;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now; st._cdt = dt;
  const A = b.A, F = A.floor, t = b.t, S = b.scale ?? 1, form = b.form ?? 1;
  P.update(dt, F);
  st.shards.update(dt, F);
  const dying = b.dying > 0, dT = dying ? 3.2 - b.dying : 0;
  // 손상 단계: 1형태는 75%·60%, 2형태(50%↓)는 35%·20% 에서 한 단계씩 (2형태로 바뀌면 새 몸이라 0부터)
  const ratio = dying ? 0 : b.hp / b.stats.maxHp;
  const lvl = dying ? 2 : form === 1 ? (ratio < 0.75 ? 1 : 0) + (ratio < 0.6 ? 1 : 0) : (ratio < 0.35 ? 1 : 0) + (ratio < 0.2 ? 1 : 0);
  if (st.lvlSeen === form && lvl > st.lvl && !dying) levelBurst(st, b, rig, lvl);
  st.lvl = lvl; st.lvlSeen = form;
  // 형태 전환 순간: 불탄 망토 조각이 흩어지고 영혼이 터져 나옴
  if (form !== st.form) { if (form === 2 && !dying) formBurst(st, b, rig); st.form = form; }
  // 속도 (망토·누더기 흔들림)
  if (st.px == null) st.px = b.cx;
  const vx = (b.cx - st.px) / Math.max(dt, 1 / 120); st.px = b.cx;
  st.vx = Math.abs(vx) > 2500 ? 0 : lerp(st.vx, vx, 0.2);
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) { st.jolt = 1; P.burst('chip', b.cx + b.facing * 8, b.bottom - 90 * S, 6, { speed: 260 }); P.burst('ember', b.cx, b.bottom - 90 * S, 8, { speed: 160, color: SOUL }); }
  st.jolt = Math.max(0, st.jolt - dt * 6);
  // 턱: 로직 jawOpen (0.1 닫힘 … 1 활짝, 변신·저승의 문·사망 중엔 딱딱 부딪힘)
  const jo = typeof b.jawOpen === 'function' ? b.jawOpen() : 0.1;
  st.jawA = approach(st.jawA, clamp((jo - 0.08) * 0.42, 0, 0.4), dt * 6);
  // 돌진 잔상
  st.ghostT -= dt;
  if (b.state === 'dash' && Math.abs(st.vx) > 500 && st.ghostT <= 0) { st.ghostT = 0.05; st.ghosts.push({ x: b.cx, y: b.bottom, f: b.facing, a: b.arm.a, s: b.arm.s, form, S, t: 0, life: 0.28, k: 0.45 }); }

  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  D.begin(ctx);
  // 로직 뒤층 (저승의 문 어둠 · 돌진/휩쓸기 예고) — 순간이동 예고 잔상은 채색이 대신 그린다
  D.end();
  b.paintBack?.(ctx, world);
  P.draw(ctx, 0);
  // 순간이동 예고 (새 자리에 희미한 영혼 실루엣)
  if (b.state === 'blink' && b.blinkTo && b.vanish > 0.9) {
    const k = clamp(((b.st ?? 0) % 1.25 - 0.25) / 0.37, 0, 1);
    const p = b.world?.player, f = p && p.cx < b.blinkTo.x ? -1 : 1;
    const o = st.og;
    fillO(o, b.blinkTo.x, b.blinkTo.y, f, t, -1.5, 0, form, S, 0, (0.14 + 0.3 * k), true);
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    drawReaper(ctx, D, b, rig, st, o, dt); D.end();
    ctx.globalCompositeOperation = op;
    if (q.halos) halo(ctx, b.blinkTo.x, b.blinkTo.y - 120 * S, 18 + 16 * k, SOUL, 0.5 * k, true);
  }
  drawGhosts(ctx, D, b, rig, st, dt);
  // 본체
  const va = clamp(1 - b.vanish, 0, 1);
  if (va > 0.004 && !st.gone.body) {
    const jx = st.jolt > 0 ? (rr.next() - 0.5) * 4 * st.jolt - b.facing * 2 * st.jolt : 0;
    const shake = dying ? Math.sin(t * 60) * 1.5 * Math.min(1, dT) : 0;
    const o = st.o;
    fillO(o, b.cx + jx + shake, b.bottom, b.facing, t, b.arm.a, b.arm.s, form, S, lvl, va, false);
    o.burn = b.state === 'transform' ? (b.burn ?? 0) : 0; o.scythe = b.hasScythe; o.flash = b.flashT > 0 && !dying ? clamp(b.flashT / 0.1, 0, 1) * 0.5 : 0;
    o.dying = dying; o.dT = dT; o.vx = st.vx;
    drawReaper(ctx, D, b, rig, st, o, dt);
    // 사라지는 중: 검은 연기 + 영혼 불씨
    if (b.vanish > 0.05 && b.vanish < 0.95 && rr.next() < dt * 40 * q.ambient) {
      P.emit('smoke', b.cx + rr.range(-30, 30) * S, b.bottom - rr.range(10, 150) * S, rr.range(-20, 20), -20, { color: '#0c0a10', size: rr.range(10, 20), layer: 1 });
      P.emit('ember', b.cx + rr.range(-30, 30) * S, b.bottom - rr.range(10, 150) * S, rr.range(-40, 40), rr.range(-80, -20), { color: SOUL, layer: 1 });
    }
  }
  if (dying) deathBreak(st, b, rig, dT, S, form);
  D.end();
  st.shards.draw(D);
  D.end();
  // 로직 앞층 (대기 중인 회전 낫 고리)
  b.paintFront?.(ctx, world);
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}
function fillO(o, x, y, f, t, a, s, form, S, lvl, alpha, glow) {
  o.x = x; o.y = y; o.f = f; o.t = t; o.a = a; o.s = s; o.form = form; o.S = S; o.lvl = lvl; o.alpha = alpha; o.glow = glow;
  o.burn = 0; o.scythe = true; o.flash = 0; o.dying = false; o.dT = 0; o.vx = 0;
  return o;
}

// ───────────────────────── 사신 한 명 (본체·잔상 공용) ─────────────────────────
function drawReaper(ctx, D, b, rig, st, o, dt) {
  const R = rig.parts, L = st.L, q = st.q, P = st.P, t = o.t, f = o.f, S = o.S;
  const glowOnly = o.glow, lvl = o.lvl;
  const V = (p, deep = false) => glowOnly ? (p.v.glow ?? p.v.flash) : pickVariant(p, lvl, deep, null);
  const lean = clamp(o.vx * f * 0.0003, -0.12, 0.12) + (o.form === 2 ? -0.02 : 0.03);
  setL(L, o.x, o.y, f, lean, S);
  if (!glowOnly) { D.startFlash(); if (o.flash <= 0) D.rec = false; }
  const a0 = o.alpha;
  if (o.form === 1) drawForm1(ctx, D, b, rig, st, o, V, a0, dt);
  else drawForm2(ctx, D, b, rig, st, o, V, a0, dt);
  if (!glowOnly) {
    if (o.flash > 0) D.flash(o.flash * a0);
    else { D.rec = false; D.log.length = 0; }
  }
  D.end();
}

/** 낫 잡은 손 위치 (지역, 배율 전): arm.a 로 들어 올림·앞으로 뻗음 */
function gripOf(a, s, form, out) {
  const up = Math.max(0, -a);
  out[0] = (form === 2 ? 34 : 30) + Math.sin(a) * 14 + s * 6; out[1] = (form === 2 ? -74 : -70) + Math.cos(a) * 6 - up * 14;
  return out;
}

/** 1형태: 망토 사신 */
function drawForm1(ctx, D, b, rig, st, o, V, a0, dt) {
  const R = rig.parts, L = st.L, q = st.q, P = st.P, t = o.t, T = R.torso, H = R.hood, J = R.hjaw;
  const bob = Math.sin(t * 1.7) * 0.012;
  const tx = 0, ty = 4, trot = bob;
  const tp = (pv, out) => localPt(T, 'hem', T[pv], tx, ty, trot, 1, out);
  const neck = tp('neck', st._nk ??= [0, 0]), shN = tp('shN', st._sn ??= [0, 0]), shF = tp('shF', st._sf ??= [0, 0]), heart = tp('heart', st._ht ??= [0, 0]), back = tp('back', st._bk ??= [0, 0]);
  // 변신: 망토가 아래부터 타 들어감 (burn 0→1, 불꽃 선 위만 그림)
  const burnY = o.burn > 0 ? lerp(12, -150, o.burn) : null;
  if (burnY != null && !o.glow) { D.end(); D.save(); const w = W(L, 0, burnY, st.W); ctx.beginPath(); ctx.rect(o.x - 400, w[1] - 600, 800, 600); ctx.clip(); }
  // 망토 자락 (뒤, verlet)
  if (!o.glow && rig.cloak) cloth(ctx, D, b, rig, st, st.cape, back, 7, 44, 150, o, '#0a0710', 0.95);
  // 뒤팔 (편 손, 어둡게)
  const farUp = clamp(-o.a / 2.2, 0, 1);
  if (!st.gone.arms) armTo(D, L, R.humerus, R.foreOpen, shF[0], shF[1], shF[0] + lerp(4, 22, farUp), shF[1] + lerp(40, -30, farUp) + Math.sin(t * 1.6) * 3, -1, a0 * 0.95, V, true, 'wr');
  // 몸통 (가시 망토 + 영혼불 흉곽)
  put(D, L, T, V(T), 'hem', tx, ty, trot, a0);
  // 두건 해골 + 경첩 턱 (입 속 어둠 → 턱 → 두건)
  const hx = neck[0] + 2, hy = neck[1] + 5, hrot = bob * 0.5 + Math.sin(t * 1.2) * 0.03 + (o.dying ? Math.sin(t * 30) * 0.05 : 0);
  if (!o.glow) mouthFill(ctx, D, L, H, 'neck', hx, hy, hrot, a0);
  const hg = localPt(H, 'neck', H.hinge, hx, hy, hrot, 1, _q);
  put(D, L, J, V(J), 'hinge', hg[0], hg[1], hrot + st.jawA, a0);
  put(D, L, H, V(H), 'neck', hx, hy, hrot, a0);
  // 앞팔 + 낫
  if (!st.gone.arms) scytheArm(ctx, D, b, rig, st, o, V, shN, a0, 1);
  if (burnY != null && !o.glow) { D.end(); D.restore(); burnLine(ctx, st, o, burnY, dt); }
  if (o.glow) return;
  D.end();
  glowOver(ctx, D, L, T, o.lvl, 'hem', tx, ty, trot, 0.5 * a0, t, st);
  // 영혼불: 흉곽 · 눈구멍 · 발밑
  const hw = W(L, heart[0], heart[1], st.heartW ??= [0, 0]);
  if (q.halos) halo(ctx, hw[0], hw[1], 22 + Math.sin(t * 5) * 4, SOUL, 0.5 * a0, true);
  eyes(ctx, st, L, H, hx, hy, hrot, o, a0, 1);
  if (rr.next() < dt * 6 * q.ambient) P.emit('ember', o.x + rr.range(-30, 30) * o.S, o.y - rr.range(0, 16), rr.range(-10, 10), rr.range(-60, -20), { color: SOUL, layer: 1 });
  if (rr.next() < dt * 2.5 * q.ambient) P.emit('smoke', o.x + rr.range(-30, 30) * o.S, o.y - rr.range(0, 10), 0, -18, { color: '#0a0e0c', size: rr.range(10, 18), layer: 0 });
  orbitSouls(ctx, D, b, rig, st, o, a0);
}

/** 2형태: 뿔 달린 거대 해골 + 뼈 날개 */
function drawForm2(ctx, D, b, rig, st, o, V, a0, dt) {
  const R = rig.parts, L = st.L, q = st.q, P = st.P, t = o.t, Rb = R.rib2, K = R.skull2, J = R.sjaw, Wg = R.wing;
  const bob = Math.sin(t * 1.9) * 0.015;
  const rx = 0, ry = 0, rrot = bob;
  const rp = (pv, out) => localPt(Rb, 'base', Rb[pv], rx, ry, rrot, 1, out);
  const neck = rp('neck', st._nk ??= [0, 0]), shN = rp('shN', st._sn ??= [0, 0]), shF = rp('shF', st._sf ??= [0, 0]), heart = rp('heart', st._ht ??= [0, 0]);
  const ragB = rp('ragB', st._rb ??= [0, 0]), ragF = rp('ragF', st._rf ??= [0, 0]), hip = rp('hip', st._hp ??= [0, 0]);
  const dT = o.dT ?? 0;
  // 영혼불 꼬리 (골반 아래)
  if (!o.glow) tail(ctx, D, st, L, hip, o, dt);
  // 날개: 먼 쪽(앞으로 펼침, 거울 + 어둡게) → 가까운 쪽(뒤로)
  const flap = Math.sin(t * 2.3) * 0.09 + (b.state === 'transform' || b.state === 'reap' ? Math.sin(t * 9) * 0.05 : 0);
  const spread = b.state === 'storm' || b.state === 'reap' || b.state === 'transform' ? 0.18 : 0;
  if (!st.gone.wingF) put(D, L, Wg, V(Wg, true), 'root', shN[0] - 10, shN[1] + 6, -0.25 - flap - spread, a0 * 0.95, 0.9, -1);
  // 불탄 누더기 자락 (뒤)
  if (!o.glow && rig.cloak) { cloth(ctx, D, b, rig, st, st.rags[0], ragB, 5, 22, 70, o, '#0b0810', 0.9, true); }
  // 뒤팔
  const farUp = clamp(-o.a / 2.2, 0, 1);
  if (!st.gone.arms) armTo(D, L, R.humerus, R.foreOpen, shF[0], shF[1], shF[0] + lerp(-6, 16, farUp), shF[1] + lerp(46, -34, farUp) + Math.sin(t * 1.6) * 3, -1, a0 * 0.95, V, true, 'wr', 1.25);
  if (!st.gone.wingN) put(D, L, Wg, V(Wg), 'root', shF[0] + 2, shF[1] + 4, 0.18 + flap + spread, a0);
  // 흉곽 + 골반
  put(D, L, Rb, V(Rb), 'base', rx, ry, rrot, a0);
  if (!o.glow && rig.cloak) cloth(ctx, D, b, rig, st, st.rags[1], ragF, 5, 18, 58, o, '#0b0810', 0.9, true);
  // 해골 (입 속 → 턱 → 두개골). 사망 폭발 뒤엔 없음
  const hx = neck[0] + 3, hy = neck[1] + 6, hrot = bob * 0.5 + Math.sin(t * 1.1) * 0.035 - (b.state === 'transform' ? 0.12 : 0) + (o.dying ? Math.sin(t * 34) * 0.06 : 0);
  if (!st.gone.skull) {
    if (!o.glow) mouthFill(ctx, D, L, K, 'neck', hx, hy, hrot, a0);
    const hg = localPt(K, 'neck', K.hinge, hx, hy, hrot, 1, _q);
    put(D, L, J, V(J), 'hinge', hg[0], hg[1], hrot + st.jawA * 1.1, a0);
    put(D, L, K, V(K), 'neck', hx, hy, hrot, a0);
  }
  // 앞팔 + 낫 (1.15배)
  if (!st.gone.arms) scytheArm(ctx, D, b, rig, st, o, V, shN, a0, 1.15);
  if (o.glow) return;
  D.end();
  glowOver(ctx, D, L, Rb, o.lvl, 'base', rx, ry, rrot, 0.55 * a0, t, st);
  if (!st.gone.skull) glowOver(ctx, D, L, K, o.lvl, 'neck', hx, hy, hrot, 0.5 * a0, t + 1, st);
  // 영혼 심장 (갇힌 비명 얼굴들) · 눈 · 뿔 위 영혼불 왕관
  const hw = W(L, heart[0], heart[1], st.heartW ??= [0, 0]);
  const pu = 0.7 + 0.3 * Math.sin(t * 6);
  if (q.halos) { halo(ctx, hw[0], hw[1], 34 * pu * o.S, SOUL, 0.55 * a0, true); halo(ctx, hw[0], hw[1], 70 * o.S, SOUL_D, 0.25 * a0); }
  if (!st.gone.skull) {
    eyes(ctx, st, L, K, hx, hy, hrot, o, a0, 1.4);
    if (q.flames) { const cw = W(L, hx + 4, hy - 46, st.W2); flame(ctx, cw[0], cw[1], -PI / 2, 40 * o.S, 12 * o.S, t, SOUL, 0.45 * a0, 3, q.flames); }
  }
  if (rr.next() < dt * 10 * q.ambient) P.emit('ember', hw[0] + rr.range(-40, 40) * o.S, hw[1] + rr.range(-40, 40) * o.S, rr.range(-20, 20), rr.range(-90, -30), { color: SOUL, layer: 1 });
  orbitSouls(ctx, D, b, rig, st, o, a0);
  void dT;
}

/** 입 속 어둠 (턱을 잘라낸 자리 뒤) — 부품 텍셀 공간 폴리곤 */
function mouthFill(ctx, D, L, H, pv, hx, hy, hrot, a) {
  const M = H.mouth; if (!M) return;
  const w = W(L, hx, hy, _q2), k = H.k * L.sc;
  D.set(H[pv][0], H[pv][1], w[0], w[1], L.f * (hrot + L.lean), k * L.f, k);
  ctx.beginPath(); ctx.moveTo(M[0][0], M[0][1]);
  for (let i = 1; i < M.length; i++) ctx.lineTo(M[i][0], M[i][1]);
  ctx.closePath();
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a;
  ctx.fillStyle = '#050305'; ctx.fill();
  ctx.globalAlpha = ga;
}

/** 두 관절 팔: 어깨 → 목표 손 위치 (ik2). endPv = 아래팔 부품에서 목표에 닿을 피벗 */
function armTo(D, L, U, Fo, sx, sy, tx, ty, bend, alpha, V, far, endPv, sc = 1) {
  const au = axis(U, 'sh', 'el'), af = axis(Fo, 'el', endPv);
  const r = ik2(sx, sy, tx, ty, au.len * sc, af.len * sc, bend, _ik);
  put(D, L, U, V(U, far), 'sh', sx, sy, r.a1 - au.a, alpha, sc);
  put(D, L, Fo, V(Fo, far), 'el', r.ex, r.ey, r.a2 - af.a, alpha, sc);
  return r;
}

/** 낫 든 앞팔: 손(주먹) → 낫 자루 + 날. 낫이 날아가 있으면 편 손 */
function scytheArm(ctx, D, b, rig, st, o, V, sh, a0, bs) {
  const R = rig.parts, L = st.L, g = gripOf(o.a, o.s, o.form, st.grip);
  const hold = o.scythe && !st.gone.scythe;
  const sc = o.form === 2 ? 1.25 : 1;
  const ex = hold ? g[0] : g[0] + 6, ey = hold ? g[1] : g[1] + 8;
  // 낫 (손 뒤로 자루가 지나감 → 먼저 그림)
  const r = -0.25 + o.a * 0.55 + o.s * 0.6;
  if (hold) {
    drawScytheAt(ctx, D, L, rig, ex, ey, r, bs, a0, V, o, st);
  }
  armTo(D, L, R.humerus, hold ? R.foreFist : R.foreOpen, sh[0], sh[1], ex, ey, 1, a0, V, false, hold ? 'grip' : 'wr', sc);
  W(L, ex, ey, st.gripW);
}
/** 낫 한 자루: 자루 grip 이 (gx,gy), 회전 r (0 = 자루가 위, 날이 앞으로), 배율 bs */
function drawScytheAt(ctx, D, L, rig, gx, gy, r, bs, a0, V, o, st) {
  const Sh = rig.parts.shaft, Bl = rig.parts.blade;
  const srot = -PI / 2 + r;
  put(D, L, Sh, V(Sh), 'grip', gx, gy, srot, a0, bs);
  const top = localPt(Sh, 'grip', Sh.top, gx, gy, srot, bs, _q);
  // 휘두름 잔상: 날의 발광 실루엣을 뒤따르는 각도로 가산
  if (o.s > 0.2 && !o.glow && st.q.smear) {
    D.end();
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    for (let j = 1; j <= 3; j++) put(D, L, Bl, Bl.v.glow, 'tang', top[0], top[1], r - o.s * 0.35 * j, a0 * o.s * 0.3 / j, bs, -1);
    D.end(); ctx.globalCompositeOperation = op;
  }
  put(D, L, Bl, V(Bl), 'tang', top[0], top[1], r, a0, bs, -1);
  // 날 가장자리 영혼빛
  if (!o.glow && st.q.halos) { D.end(); const e = localPt(Bl, 'tang', Bl.edge, top[0], top[1], r, bs, _q2, -1), ew = W(L, e[0], e[1], st.W2); halo(ctx, ew[0], ew[1], 40 * bs * L.sc, SOUL, 0.18 * a0); }
}

/** 눈구멍 영혼불 (가까운 눈 + 먼 눈) */
function eyes(ctx, st, L, H, hx, hy, hrot, o, a0, sz) {
  const q = st.q, t = o.t;
  const fk = (0.85 + 0.15 * Math.sin(t * 13)) * (o.dying ? 1.5 : 1);
  for (const [pv, k] of [['eyeN', 1], ['eyeF', 0.6]]) {
    const e = localPt(H, 'neck', H[pv], hx, hy, hrot, 1, _q), ew = W(L, e[0], e[1], st.W);
    if (q.flames && k === 1) flame(ctx, ew[0], ew[1], -PI / 2 - 0.25 * L.f, 16 * sz * L.sc * fk, 4.5 * sz * L.sc, t, SOUL, 0.6 * a0, pv === 'eyeN' ? 1 : 4, Math.max(2, q.flames - 1));
    if (q.halos) halo(ctx, ew[0], ew[1], 9 * sz * L.sc * fk * k, SOUL, 0.8 * a0, true);
  }
}

/** 궤도 영혼 (로직 souls[]: a, r, s) — 비명 영혼 스프라이트가 몸 둘레를 돈다 */
function orbitSouls(ctx, D, b, rig, st, o, a0) {
  const S = o.S, names = rig.soulsP; if (!names?.length || !b.souls) return;
  const cx = o.x, cy = o.y - 80 * S;
  for (let i = 0; i < b.souls.length; i++) {
    const s = b.souls[i], p = rig.parts[names[i % names.length]];
    const rad = s.r * S * (o.form === 2 ? 1.25 : 1), ang = s.a;
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad * 0.45;
    const vxs = -Math.sin(ang);                      // 진행 방향 (시계 방향 궤도)
    const k = p.k * (0.5 + 0.12 * Math.sin(o.t * 3 + i)) * S;
    const front = Math.sin(ang) > 0;                 // 앞 반원 (조금 더 진함)
    D.part(p, p.v.base, 'c', x, y, Math.cos(ang) * 0.3, k * (vxs >= 0 ? 1 : -1), k, a0 * (front ? 0.7 : 0.4));
  }
  D.end();
}

/** 천 자락 (verlet 리본 + 채색 무늬). anchor = 지역 점, w0→w1 폭, len 길이. burn = 가장자리 영혼불 */
function cloth(ctx, D, b, rig, st, S0, anchor, w0, w1, len, o, dark, alpha, burn = false) {
  const L = st.L, f = o.f, n = S0.n, dt = 1 / 60;
  const aw = W(L, anchor[0], anchor[1], st.W);
  S0.seg = len * L.sc / (n - 1);
  S0.wx = f * -(160 + Math.abs(o.vx) * 0.5) + Math.sin(o.t * 1.5 + n) * 110;
  S0.step(Math.min(0.05, st._cdt ?? dt), aw[0], aw[1]);
  const F = b.A?.floor ?? 1e9, p = S0.p;
  for (let i = 1; i < n; i++) if (p[i * 2 + 1] > F - 2) p[i * 2 + 1] = F - 2;
  const E = S0._e ??= new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    let tx = p[i1 * 2] - p[i0 * 2], ty = p[i1 * 2 + 1] - p[i0 * 2 + 1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let nx = -ty, ny = tx; if (nx * f > 0) { nx = -nx; ny = -ny; }
    const u = i / (n - 1), w = (w0 + u * (w1 - w0)) * L.sc * (1 + Math.sin(o.t * 2.6 + i) * 0.1);
    E[i * 4] = p[i * 2] - nx * 3; E[i * 4 + 1] = p[i * 2 + 1] - ny * 3;
    E[i * 4 + 2] = p[i * 2] + nx * w; E[i * 4 + 3] = p[i * 2 + 1] + ny * w;
  }
  D.end();
  D.save();
  ctx.beginPath(); ctx.moveTo(E[0], E[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(E[i * 4], E[i * 4 + 1]);
  const lx = E[(n - 1) * 4], ly = E[(n - 1) * 4 + 1], rx = E[(n - 1) * 4 + 2], ry = E[(n - 1) * 4 + 3];
  for (let j = 1; j <= 6; j++) { const u = j / 7, dd = (j % 2 ? 12 : 1) * L.sc + Math.sin(o.t * 4 + j) * 2; ctx.lineTo(lerp(lx, rx, u), lerp(ly, ry, u) + dd); }
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(E[i * 4 + 2], E[i * 4 + 3]);
  ctx.closePath();
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * o.alpha * alpha;
  ctx.fillStyle = dark; ctx.fill();
  const cp = rig.cloak;
  if (cp) {
    if (!cp.pat) { cp.pat = ctx.createPattern(cp.canvas, 'repeat'); cp.m = typeof DOMMatrix !== 'undefined' ? new DOMMatrix() : null; }
    if (cp.pat) {
      if (cp.m && cp.pat.setTransform) { cp.m.a = cp.k * L.sc; cp.m.d = cp.k * L.sc; cp.m.b = cp.m.c = 0; cp.m.e = aw[0]; cp.m.f = aw[1]; cp.pat.setTransform(cp.m); }
      ctx.globalAlpha = ga * o.alpha * alpha * 0.8; ctx.fillStyle = cp.pat; ctx.fill();
    }
  }
  ctx.globalAlpha = ga;
  D.restore();
  // 영혼빛 가장자리 (불탄 누더기) / 옅은 테
  ctx.beginPath(); ctx.moveTo(E[2], E[3]); for (let i = 1; i < n; i++) ctx.lineTo(E[i * 4 + 2], E[i * 4 + 3]);
  ctx.strokeStyle = burn ? 'rgba(125,255,176,0.55)' : 'rgba(120,110,150,0.35)'; ctx.globalAlpha = ga * o.alpha; ctx.lineWidth = burn ? 1.6 : 1.1; ctx.stroke();
  ctx.globalAlpha = ga;
  if (burn && st.q.ambient > 0.3 && rr.next() < 0.25) { const j = 1 + Math.floor(rr.next() * (n - 1)); st.P.emit('ember', E[j * 4 + 2], E[j * 4 + 3], rr.range(-20, 20), rr.range(-60, -20), { color: SOUL, layer: 1 }); }
}

/** 2형태 꼬리: 골반 아래 영혼불 + 연기 */
function tail(ctx, D, st, L, hip, o, dt) {
  const q = st.q, t = o.t;
  D.end();
  const w = W(L, hip[0], hip[1] + 8, st.W);
  if (q.flames) {
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 10 * o.S;
      flame(ctx, w[0] + ox, w[1] + 16 * o.S, PI / 2 + Math.sin(t * 2 + i) * 0.3 - L.f * 0.3, 34 * o.S, 11 * o.S, t, SOUL, 0.35 * o.alpha, i * 3, q.flames);
    }
  }
  if (q.halos) halo(ctx, w[0], w[1] + 20 * o.S, 40 * o.S, SOUL_D, 0.35 * o.alpha);
  if (rr.next() < dt * 10 * q.ambient) st.P.emit('smoke', w[0] + rr.range(-20, 20), w[1] + rr.range(10, 40) * o.S, rr.range(-20, 20), rr.range(-30, -5), { color: '#08110c', size: rr.range(10, 18), layer: 0 });
}

/** 변신: 타 들어가는 선의 영혼불 */
function burnLine(ctx, st, o, burnY, dt) {
  const L = st.L, q = st.q, w0 = W(L, -36, burnY, st.W), x0 = w0[0], y0 = w0[1], w1 = W(L, 36, burnY, st.W2), x1 = w1[0];
  const n = q.name === 'low' ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), x = lerp(x0, x1, u), y = y0 + Math.sin(o.t * 9 + i * 2) * 3;
    if (q.flames) flame(ctx, x, y, -PI / 2, 26 + hash1(i) * 16, 7, o.t, SOUL, 0.5, i, Math.min(3, q.flames));
    if (rr.next() < dt * 20 * q.ambient) st.P.emit('ember', x, y, rr.range(-30, 30), rr.range(-120, -40), { color: SOUL, layer: 1 });
    if (rr.next() < dt * 8 * q.ambient) st.P.emit('ash', x, y, rr.range(-30, 30), rr.range(-60, -10), { layer: 1 });
  }
  if (q.halos) halo(ctx, (x0 + x1) / 2, y0, 70, SOUL, 0.35);
}

/** 영혼불 혀 (가산 퍼프를 방향으로 겹침) */
function flame(ctx, x, y, ang, len, w, t, color, a, seed = 0, n = 5) {
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  const img = puff(color, true), img2 = puff(color);
  n = Math.max(2, n | 0);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), fl = Math.sin(t * 9 + i * 1.7 + seed) * 0.5 + 0.5;
    const aa = ang + Math.sin(t * 5 + i * 2.1 + seed) * 0.25 * u;
    const d = len * u * (0.8 + fl * 0.3);
    const px = x + Math.cos(aa) * d, py = y + Math.sin(aa) * d;
    const ww = w * (1.4 - u) * (0.8 + fl * 0.4), hh = ww * (1.6 - u * 0.4);
    ctx.globalAlpha = ga * a * (1 - u * 0.65);
    ctx.drawImage(i === 0 ? img : img2, px - ww, py - hh, ww * 2, hh * 2);
  }
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}

/** 손상 단계 균열 발광 */
function glowOver(ctx, D, L, part, lvl, pivot, lx, ly, lrot, a, t, st) {
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 ? 1 : 0);
  if (!drawn) return;
  const g = drawn === 2 ? part.gl.dmg2 : part.gl.dmg1;
  if (!g) return;
  const pv = part[pivot], w = W(L, lx, ly, st.W), k = part.k * L.sc;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + part.w * 0.01)) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, w[0], w[1], L.f * (lrot + L.lean), k * 2 * L.f, k * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
  D.end();
}

// ───────────────────────── 잔상 (돌진) ─────────────────────────
function drawGhosts(ctx, D, b, rig, st, dt) {
  const G = st.ghosts; if (!G.length) return;
  const op = ctx.globalCompositeOperation;
  for (let i = G.length - 1; i >= 0; i--) {
    const g = G[i]; g.t += dt;
    const a = g.k * (1 - g.t / g.life);
    if (a <= 0) { G.splice(i, 1); continue; }
    const o = fillO(st.og, g.x, g.y, g.f, b.t, g.a, g.s, g.form, g.S, 0, a, true);
    ctx.globalCompositeOperation = 'lighter';
    drawReaper(ctx, D, b, rig, st, o, dt);
    ctx.globalCompositeOperation = op;
  }
  if (G.length > 8) G.splice(0, G.length - 8);
}

// ───────────────────────── 단계 · 변신 · 사망 ─────────────────────────
function boneShards(st, rig, x, y, n, speed, sc = 1, fade = 1.6) {
  const names = rig.debs; if (!names?.length) return;
  for (let j = 0; j < n; j++) {
    const p = rig.parts[names[(j * 3 + (x | 0)) % names.length]], a = -PI / 2 + rr.range(-1.4, 1.4), sp = speed * rr.range(0.4, 1);
    st.shards.spawn(p.v.base, p.c[0], p.c[1], x + rr.range(-10, 10), y + rr.range(-10, 10), rr.next() * TAU, p.k * sc * rr.sign(), p.k * sc, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-10, 10), { r: 5 * sc, fade, bounce: 0.35 });
  }
}
function levelBurst(st, b, rig, lvl) {
  const S = b.scale ?? 1, x = b.cx, y = b.bottom - 90 * S;
  boneShards(st, rig, x, y, 3 + lvl * 2, 320, 0.6 * S);
  st.P.burst('chip', x, y, 10 + lvl * 4, { speed: 340, angle: -PI / 2, spread: 1.4 });
  st.P.burst('ember', x, y, 16, { speed: 200, color: SOUL });
  st.P.burst('boneDust', x, y, 6, { speed: 90 });
}
function formBurst(st, b, rig) {
  const x = b.cx, y = b.bottom - 100, R = rig.parts;
  // 불탄 망토·두건이 조각나 흩어짐
  for (const [n, pv, sc] of [['torso', 'hem', 1], ['hood', 'neck', 1]]) {
    const p = R[n]; if (!p) continue;
    for (let j = 0; j < 2; j++) {
      const a = -PI / 2 + rr.range(-1.3, 1.3), sp = rr.range(160, 360);
      st.shards.spawn(pickVariant(p, 2), p[pv][0], p[pv][1], x + rr.range(-20, 20), y + rr.range(-30, 40), rr.range(-0.4, 0.4), p.k * sc * 0.55 * (j ? -1 : 1), p.k * sc * 0.55, Math.cos(a) * sp, Math.sin(a) * sp - 100, rr.range(-6, 6), { r: 12, fade: 1.1, bounce: 0.25 });
    }
  }
  const names = rig.soulsP;
  for (let j = 0; j < 4 && names.length; j++) {
    const p = R[names[j % names.length]], a = -PI / 2 + (j - 1.5) * 0.5;
    st.shards.spawn(p.v.base, p.c[0], p.c[1], x, y, a + PI / 2, p.k * 0.8, p.k * 0.8, Math.cos(a) * 260, Math.sin(a) * 300 - 200, 0, { r: 1, fade: 0.9, bounce: 0 });
  }
  st.P.burst('ash', x, y, 40, { speed: 260, jitter: 30 });
  st.P.burst('ember', x, y, 40, { speed: 340, color: SOUL });
  st.P.burst('smoke', x, y, 10, { speed: 80, color: '#0a0710', jitter: 30 });
}
/** 사망 붕괴: 날개 재 → 팔·낫 → (로직 _boom) 해골 튀고 흉곽 폭발 */
function deathBreak(st, b, rig, dT, S, form) {
  const R = rig.parts, L = st.L, G = st.gone, P = st.P, x = b.cx, y = b.bottom, f = b.facing;
  const fade = (end) => Math.max(0.3, Math.min(end, b.dying - 0.05));
  setL(L, x, y, f, 0, S);
  if (form === 2 && !G.wingF && dT > 0.5) {
    G.wingF = true;
    const w = W(L, 30, -110, st.W);
    for (let i = 0; i < 28; i++) P.emit(i % 3 ? 'ash' : 'ember', w[0] + f * rr.range(-20, 140) * S, w[1] + rr.range(-90, 60) * S, rr.range(-40, 40), rr.range(-60, 30), { color: SOUL, layer: 1, size: rr.range(2, 4.5), life: rr.range(1, 1.8) });
    boneShards(st, rig, w[0] + f * 60 * S, w[1], 3, 200, 0.7 * S, fade(1.6));
  }
  if (form === 2 && !G.wingN && dT > 0.9) {
    G.wingN = true;
    const w = W(L, -30, -110, st.W);
    for (let i = 0; i < 28; i++) P.emit(i % 3 ? 'ash' : 'ember', w[0] - f * rr.range(-20, 140) * S, w[1] + rr.range(-90, 60) * S, rr.range(-40, 40), rr.range(-60, 30), { color: SOUL, layer: 1, size: rr.range(2, 4.5), life: rr.range(1, 1.8) });
    boneShards(st, rig, w[0] - f * 60 * S, w[1], 3, 200, 0.7 * S, fade(1.6));
  }
  if (!G.arms && dT > 1.3) {
    G.arms = true; G.scythe = true;
    const g = st.gripW;
    for (const [n, pv] of [['humerus', 'sh'], ['foreFist', 'el'], ['foreOpen', 'el']]) {
      const p = R[n];
      st.shards.spawn(pickVariant(p, 2), p[pv][0], p[pv][1], g[0] + rr.range(-20, 20), g[1] + rr.range(-20, 10), rr.range(-1, 1), p.k * S * f, p.k * S, rr.range(-120, 120), rr.range(-260, -120), rr.range(-6, 6), { r: 8 * S, fade: fade(1.7), bounce: 0.3 });
    }
    const Sh = R.shaft, Bl = R.blade;
    st.shards.spawn(Sh.v.base, Sh.mid[0], Sh.mid[1], g[0], g[1] - 30 * S, -1.2, Sh.k * S * f, Sh.k * S, f * 90, -260, f * 6, { r: 6 * S, fade: fade(1.7), bounce: 0.25 });
    st.shards.spawn(Bl.v.base, Bl.edge[0], Bl.edge[1], g[0] + f * 40 * S, g[1] - 90 * S, 0.3, -Bl.k * S * f, Bl.k * S, f * 160, -320, -f * 7, { r: 10 * S, fade: fade(1.7), bounce: 0.2 });
    P.burst('chip', g[0], g[1], 10, { speed: 260 });
  }
  if (b._boom && !G.body) {
    G.body = true; G.skull = true;
    const hp = W(L, 4, form === 2 ? -150 : -135, st.W);
    const Kp = form === 2 ? R.skull2 : R.hood;
    st.shards.spawn(pickVariant(Kp, 2), Kp.neck[0], Kp.neck[1], hp[0], hp[1] + 20 * S, 0, Kp.k * S * f, Kp.k * S, f * rr.range(60, 140), -520, f * 4, { r: 18 * S, fade: fade(0.95), bounce: 0.3 });
    const Bp = form === 2 ? R.rib2 : R.torso, bpv = form === 2 ? 'base' : 'hem';
    const bw = W(L, 0, 0, st.W2);
    st.shards.spawn(pickVariant(Bp, 2), Bp[bpv][0], Bp[bpv][1], bw[0], bw[1], 0, Bp.k * S * f, Bp.k * S, rr.range(-40, 40), -120, rr.range(-2, 2), { r: 30 * S, fade: fade(0.9), bounce: 0.2 });
    boneShards(st, rig, x, y - 90 * S, 12, 520, 0.9 * S, fade(0.95));
    const names = rig.soulsP;
    for (let j = 0; j < 6 && names.length; j++) {
      const p = R[names[j % names.length]], a = -PI / 2 + (j - 2.5) * 0.45;
      st.shards.spawn(p.v.base, p.c[0], p.c[1], x, y - 90 * S, a + PI / 2, p.k * S, p.k * S, Math.cos(a) * 320, Math.sin(a) * 380, 0, { r: 1, fade: fade(0.9), bounce: 0 });
    }
    P.burst('ember', x, y - 90 * S, 60, { speed: 460, color: SOUL });
    P.burst('boneDust', x, y - 90 * S, 16, { speed: 160, jitter: 40 });
    P.burst('smoke', x, y - 80 * S, 10, { speed: 100, color: '#0a0710', jitter: 40 });
  }
  if (!G.body && P.n < 200 && rr.next() < 0.5) P.emit('ember', x + rr.range(-40, 40) * S, y - rr.range(20, 160) * S, rr.range(-60, 60), rr.range(-160, -60), { color: SOUL, layer: 1 });
}

// ───────────────────────── 로직 파일용 그리기 도우미 ─────────────────────────
// b_death.js 의 위험 지대(던진 낫 · 뼈 창 · 저승의 문 휩쓸기 · 흡수장 영혼)와 회전 낫 투사체가 리그 준비 시 이것으로 그린다.
function makeArt(rig) {
  const R = rig.parts, Sh = R.shaft, Bl = R.blade, Sp = R.spike, souls = rig.soulsP;
  const blit = (ctx, p, im, pv, sx, sy) => { ctx.drawImage(im, -p[pv][0] * sx, -p[pv][1] * sy, im.width * sx, im.height * sy); };
  /** 조립된 낫 (현재 원점 = 자루 가운데, 회전은 호출 측) */
  const scythe = (ctx, k, glow) => {
    const im = glow ? Sh.v.glow ?? Sh.v.base : Sh.v.base;
    // 자루: 가운데(mid) 기준, 세로(위 = 날)
    ctx.save(); ctx.rotate(-PI / 2);
    blit(ctx, Sh, im, 'mid', Sh.k * k, Sh.k * k);
    ctx.restore();
    const top = (Sh.top[0] - Sh.mid[0]) * Sh.k * k;
    ctx.save(); ctx.translate(0, -top); ctx.scale(-1, 1);
    blit(ctx, Bl, glow ? Bl.v.glow ?? Bl.v.base : Bl.v.base, 'tang', Bl.k * k, Bl.k * k);
    ctx.restore();
  };
  return {
    /** 날아가는 낫 (x,y 중심, 회전 ang, 배율 k) */
    thrown(ctx, x, y, ang, k, d) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(d, 1);
      const op = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.35;
      ctx.save(); ctx.rotate(-0.35); scythe(ctx, k, true); ctx.restore();
      ctx.save(); ctx.rotate(-0.7); scythe(ctx, k, true); ctx.restore();
      ctx.globalCompositeOperation = op; ctx.globalAlpha /= 0.35;
      scythe(ctx, k, false);
      ctx.restore();
    },
    /** 회전 낫 (투사체·대기 고리): 날 하나, 원점 = 중심 */
    sickle(ctx, p) {
      if (!Bl) return false;
      halo(ctx, 0, 0, 26, SOUL, 0.45);
      ctx.rotate(p.rot || 0);
      const k = Bl.k * 0.2;
      ctx.drawImage(Bl.v.base, -Bl.edge[0] * k, -Bl.edge[1] * k, Bl.v.base.width * k, Bl.v.base.height * k);
      return true;
    },
    /** 뼈 창: 바닥 (x, F) 에서 높이 h 로 솟음 */
    spear(ctx, x, F, h) {
      if (!Sp || h < 2) return;
      const nat = (Sp.base[1] - Sp.tip[1]) * Sp.k, sy = h / nat * Sp.k, sx = Sp.k * 0.9;
      ctx.save(); ctx.translate(x, F + 3);
      blit(ctx, Sp, Sp.v.base, 'base', sx, sy);
      ctx.restore();
      halo(ctx, x, F - 6, 22, SOUL, 0.5);
    },
    /** 저승의 문: 거대한 유령 낫이 휩쓸고 지나감 (x 앞머리, y0 레인 위, h 높이, d 방향) */
    reap(ctx, x, y0, h, d, t) {
      if (!Bl) return;
      const k = Bl.k * (h / 60) * 1.05;
      ctx.save(); ctx.translate(x, y0 + h * 0.5); ctx.scale(d, 1);
      const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      const ga = ctx.globalAlpha;
      for (let j = 3; j >= 0; j--) {
        ctx.globalAlpha = ga * (j ? 0.18 / j : 0.75);
        ctx.save(); ctx.translate(-j * 70, 0); ctx.rotate(0.12 + Math.sin(t * 20) * 0.02);
        ctx.drawImage(Bl.v.glow ?? Bl.v.base, -Bl.back[0] * k, -Bl.edge[1] * k, Bl.v.base.width * k, Bl.v.base.height * k);
        ctx.restore();
      }
      ctx.globalAlpha = ga * 0.55; ctx.globalCompositeOperation = op;
      ctx.rotate(0.12);
      ctx.drawImage(Bl.v.base, -Bl.back[0] * k, -Bl.edge[1] * k, Bl.v.base.width * k, Bl.v.base.height * k);
      ctx.globalAlpha = ga;
      ctx.restore();
    },
    /** 흡수장: 비명 영혼이 소용돌이 가운데로 빨려 듦 */
    vortex(ctx, cx, F, z, t) {
      if (!souls?.length || z.t < z.warn) return;
      const fade = Math.min(1, z.a * 6, (1 - z.a) * 6);
      for (let i = 0; i < 6; i++) {
        const p = R[souls[i % souls.length]], u = ((t * 0.45 + i / 6) % 1), rad = 190 * (1 - u) + 12, ang = i * 1.7 + u * 7;
        const x = cx + Math.cos(ang) * rad, y = F - 34 + Math.sin(ang) * rad * 0.28 - u * 10;
        const k = p.k * (0.35 + 0.3 * (1 - u));
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(cx - x, 1) * 0.3); ctx.scale(x < cx ? 1 : -1, 1);
        ctx.globalAlpha *= fade * (0.3 + 0.5 * (1 - u));
        ctx.drawImage(p.v.base, -p.c[0] * k, -p.c[1] * k, p.v.base.width * k, p.v.base.height * k);
        ctx.restore();
      }
    },
  };
}
