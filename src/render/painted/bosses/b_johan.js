// 요한 / 돌아오지 못한 수문지기 (b_johan) — 채색 컷아웃 퍼핏 렌더러 (EX-BOSS, docs/specs/ex_s27.md §2.2)
// 부품 (Higgsfield gpt_image_2_5 · #00FF00 녹색 배경 → tools/higgsfield/key_green.py, configs/b_johan.json · tools/higgsfield/manifest_exboss.json):
//   범포 몸통(가슴 쇠판 · 허리 사슬 · 납 추) · 허벅지 · 정강이+납 장화 · 투구 둘(온전 — 금 간 앞 창 / 터짐 — 검은 물) · 팔 위/아래 · 장갑 둘(벌린 · 쥔) ·
//   T자 수문 열쇠 · 닻(사슬) · 공기 호스 마디(사슬 타일 반복) · 끊어진 호스 끝 · 장어 머리 · 장어 몸 마디 · 기름 등불 · 수문 바퀴
// 움직임은 전부 로직(src/game/bosses/e_johan.js)의 값을 읽기만 한다:
//   boss { zx, fy, fk, facing, ps{lean,crouch,kneel,keyUp,keyTurn,chain,hoseK,lash,clutch,jump}, pts{hip,neck,helm,win,chest,lamp,shN,shF,elN,hdN,elF,hdF,knN,knF,ftN,ftF,keyE,belt,tA},
//          hose[7], eel[5], breached, _whip, eelK, lampK, wheelA, closeK, anchor{x,y,on}, keyStuck, bootStuck, stunned, helmOff, drainK, dieT, vanishK, dying,
//          airH, state, t, flashT, hitPart, pHelm/pTorso/pLegs/pKey/pEel, A.floor, hasWheel(), wheelPos() }
// 그리기 안에서는 Math.random · world.fx 를 쓰지 않는다 (hook_tags) — 시각 t 만.
import { Drawer, halo, puff, loadRig, pickVariant, quality, QUALITY } from '../kit.js';

const DIR = 'painted/bosses/b_johan';
const PI = Math.PI;
const TEAL = '#3aa8a0', TEAL_H = '#a8f0e0', LAMP = '#ffc860', LAMP_H = '#fff4c8', BRASS_H = '#ecc888', BLACKW = '#0a1a1c', IRON_H = '#7a6c5c';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);
const DEF = {
  glow: TEAL,
  outline: { width: 1.2, color: 'rgba(4,8,10,0.9)' },
  parts: {
    torso: { flash: true, cracks: 2, char: 0.15, holes: 0, crackMinLum: 30 },
    helm: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 50 },
    helmB: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 50 },
    thigh: { flash: true, noDmg: true, deep: 0.6 },
    shin: { flash: true, noDmg: true, deep: 0.6 },
    armU: { flash: true, noDmg: true, deep: 0.6 },
    armF: { flash: true, noDmg: true, deep: 0.6 },
    handO: { flash: true, noDmg: true, deep: 0.6 },
    handF: { flash: true, noDmg: true },
    key: { flash: true, noDmg: true, outline: 0.8 },
    anchor: { noDmg: true, outline: 0.7 },
    hoseSeg: { noDmg: true, outline: 0.7 },
    hoseEnd: { noDmg: true, outline: 0.7 },
    eelHead: { flash: true, noDmg: true, outline: 0.8 },
    eelSeg: { flash: true, noDmg: true, outline: 0.8 },
    lamp: { noDmg: true, outline: 0.6 },
    wheel: { noDmg: true, outline: 0.5 },
  },
};
const COLORS = [TEAL, TEAL_H, LAMP, LAMP_H, BRASS_H, '#ffffff'];

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_johan', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    for (const c of COLORS) { puff(c, false); puff(c, true); }   // 싸움 중 새 캔버스 0: 쓰는 발광 색은 미리 굽는다
    return { D: new Drawer(), q, lt: null, pf: 0, fp: null, jolt: 0, lvl: 0, ff: { helm: false, body: false, legs: false, key: false, eel: false }, NK: [0, 0], WP: [0, 0], C: [0, 0], O: [0, 0] };
  },
  draw(ctx, boss, world, rig, st) { drawBoss(ctx, boss, world, rig, st); },
  bounds(b, rig, st, out) {
    if (typeof b.artBounds === 'function') return b.artBounds(out);
    const X = b.zx ?? b.cx, Y = b.fy ?? b.bottom;
    out.x = X - 200; out.y = Y - 280; out.w = 400; out.h = 320;
    return out;
  },
  lights() {},
};

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, R = rig.parts;
  st.q = qOf(world.game);
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const t = b.t, floor = b.A?.floor ?? b.fy;
  const dying = b.dying > 0;
  const hk = b.stats?.maxHp ? b.hp / b.stats.maxHp : 1;
  st.lvl = dying ? 2 : hk < 0.35 ? 2 : hk < 0.7 ? 1 : 0;
  if (b.flashT > st.pf + 1e-4) st.fp = b.hitPart ?? null;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 7);
  const fOn = b.flashT > 0 && !dying, fp = st.fp, ff = st.ff;
  ff.helm = fOn && (!fp || fp === b.pHelm);
  ff.body = fOn && (!fp || fp === b.pTorso);
  ff.legs = fOn && (!fp || fp === b.pLegs);
  ff.key = fOn && (!fp || fp === b.pKey);
  ff.eel = fOn && (!fp || fp === b.pEel);
  const ga = ctx.globalAlpha, q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  // ── 뒤: 수문 바퀴 (s27 보스 방에서만) · 그림자 · 검은 물웅덩이 ──
  if (b.hasWheel?.() && R.wheel) {
    const W = b.wheelPos(), p = R.wheel, img = pickVariant(p, 0, false, null);
    const s = (2 * W.r) / Math.max(1, img.width - 8);
    ctx.save(); ctx.fillStyle = 'rgba(6,12,14,0.5)'; ctx.beginPath(); ctx.arc(W.x, W.y, W.r + 18, 0, PI * 2); ctx.fill(); ctx.restore();
    D.begin(ctx); D.part(p, img, 'c', W.x, W.y, b.wheelA ?? 0, s, s, 0.92); D.end();
    if ((b.closeK ?? 0) < 1) { ctx.save(); ctx.globalAlpha = ga * 0.7 * (1 - (b.closeK ?? 0)); ctx.fillStyle = BLACKW; ctx.fillRect(W.x - W.r * 0.5, W.y + W.r + 14, W.r, 18); ctx.restore(); }
    else if (st.q.halos) halo(ctx, W.x, W.y, W.r * 0.8, LAMP, 0.08 + 0.04 * Math.sin(t * 2));
  }
  const bodyA = 1 - (b.vanishK ?? 0);
  ctx.save();
  ctx.globalAlpha = ga * Math.max(bodyA, (b.vanishK ?? 0) > 0 ? 0.8 : 0) * 0.5;
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(b.zx, floor + 2, 58 - Math.min(30, (b.airH ?? 0) * 0.15), 8, 0, 0, PI * 2); ctx.fill();
  ctx.restore();
  const pool = Math.max(b.vanishK ?? 0, b.drainK ?? 0);
  if (pool > 0) {
    ctx.save(); ctx.globalAlpha = ga * clamp(1 - Math.max(0, (b.vanishK ?? 0) - 0.8) * 5, 0, 1);
    ctx.fillStyle = BLACKW; ctx.beginPath(); ctx.ellipse(b.zx, floor - 2, 40 + 50 * pool, 9, 0, 0, PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(58,168,160,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(b.zx + Math.sin(t) * 6, floor - 3, (40 + 50 * pool) * 0.6, 4, 0, 0, PI * 2); ctx.stroke();
    ctx.restore();
  }
  if (bodyA > 0.01) {
    ctx.globalAlpha = ga * bodyA;
    const fk = Math.abs(b.fk) < 0.2 ? 0.2 * Math.sign(b.fk || b.facing || 1) : b.fk;
    D.begin(ctx); D.save();
    ctx.translate(b.zx, b.fy); ctx.scale(fk, 1 - (b.vanishK ?? 0) * 0.5);
    D.begin(ctx);
    D.rec = false; D.log.length = 0;
    body(D, ctx, R, b, st, t);
    if (fOn) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.5);
    else { D.rec = false; D.log.length = 0; }
    D.end();
    lampGlow(ctx, b, st, t);
    D.restore();
    ctx.globalAlpha = ga;
  }
  front(ctx, b, R, st, t);
  ctx.globalAlpha = ga;
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 부품 놓기 ─────────────────────────
function put(D, p, pv, x, y, rot, sx, sy, lvl, deep, alpha = 1) {
  if (!p) return null;
  D.part(p, pickVariant(p, lvl, deep, null), pv, x, y, rot, sx, sy, alpha);
  return p;
}
/** 그림 축(pa→pb)이 세로인 팔다리: 로직 (ax,ay)→(bx,by) 방향 · 길이는 sy 만 lo..hi 로 */
function limb(D, p, pa, pb, ax, ay, bx, by, lvl, deep, lo = 0.75, hi = 1.3, w = 1) {
  if (!p) return;
  const A = p[pa], B = p[pb];
  const ix = B[0] - A[0], iy = B[1] - A[1], lx = bx - ax, ly = by - ay;
  const rot = Math.atan2(ly, lx) - Math.atan2(iy, ix);
  const s = clamp(Math.hypot(lx, ly) / (Math.hypot(ix, iy) * p.k || 1), lo, hi);
  put(D, p, pa, ax, ay, rot, p.k * w, p.k * s, lvl, deep);
}
/** 피벗 pa 를 (x,y) 에 두고 그림의 pa→pb 방향이 각 ang 이 되게. sx = 그림 축 방향 배율 (가로 축 부품 — 호스 · 열쇠 · 장어) */
function aimAt(D, p, pa, pb, x, y, ang, sx = 1, sy = 1, lvl = 0, deep = false, alpha = 1) {
  if (!p) return 0;
  const ia = Math.atan2(p[pb][1] - p[pa][1], p[pb][0] - p[pa][0]);
  put(D, p, pa, x, y, ang - ia, p.k * sx, p.k * sy, lvl, deep, alpha);
  return ang - ia;
}
/** 가로 축 부품을 두 점 사이에 (길이 맞춤 — 축 방향만 늘이고 두께는 th 배) */
function span(D, p, pa, pb, x0, y0, x1, y1, th = 1, over = 1.12, deep = false, alpha = 1) {
  if (!p) return;
  const L = Math.hypot(x1 - x0, y1 - y0), il = Math.hypot(p[pb][0] - p[pa][0], p[pb][1] - p[pa][1]) * p.k || 1;
  aimAt(D, p, pa, pb, x0, y0, Math.atan2(y1 - y0, x1 - x0), clamp(L * over / il, 0.15, 3), th, 0, deep, alpha);
}

// ───────────────────────── 몸 (지역 틀: 발 = 0,0 · 앞 = +x) ─────────────────────────
function body(D, ctx, R, b, st, t) {
  const S = b.pts, Pz = b.ps, lvl = st.lvl, ff = st.ff;
  const jr = st.jolt ? Math.sin(t * 61) * 0.02 * st.jolt : 0;
  const T = R.torso, tRot = (S.tA - 0.06) + jr, tk = T.k * (b.breached ? 1.05 : 1);
  const hx = S.hip.x, hy = S.hip.y;
  const NK = D.pt(T.hip[0], T.hip[1], T.nk[0], T.nk[1], hx, hy, tRot, tk, tk, st.NK);
  const whip = b.breached || b._whip, hkOff = b.helmOff ?? 0;
  // ── 1) 1페이즈 공기 호스 (투구 꼭대기 → 천장, 몸 뒤) ──
  if (!whip && hkOff <= 0) hose(D, R, b, false);
  // ── 2) 먼 팔 (deep) ──
  D.rec = ff.body;
  limb(D, R.armU, 'sh', 'el', S.shF.x, S.shF.y, S.elF.x, S.elF.y, 0, true, 0.7, 1.3, 1.1);
  limb(D, R.armF, 'el', 'wr', S.elF.x, S.elF.y, S.hdF.x, S.hdF.y, 0, true, 0.7, 1.3, 1.1);
  aimAt(D, R.handO, 'wr', 'tip', S.hdF.x, S.hdF.y, Math.atan2(S.hdF.y - S.elF.y, S.hdF.x - S.elF.x) + 0.2, 1, 1, 0, true);
  // ── 3) 먼 다리 · 가까운 다리 ──
  D.rec = ff.legs;
  limb(D, R.thigh, 'hip', 'kn', hx - 8, hy + 2, S.knF.x, S.knF.y, 0, true, 0.75, 1.3);
  limb(D, R.shin, 'kn', 'ft', S.knF.x, S.knF.y, S.ftF.x, S.ftF.y, 0, true, 0.75, 1.3);
  limb(D, R.thigh, 'hip', 'kn', hx + 8, hy + 3, S.knN.x, S.knN.y, 0, false, 0.75, 1.3);
  limb(D, R.shin, 'kn', 'ft', S.knN.x, S.knN.y, S.ftN.x, S.ftN.y, 0, false, 0.75, 1.3);
  // ── 4) 몸통 (범포 · 가슴 쇠판 · 허리 사슬) ──
  D.rec = ff.body;
  put(D, T, 'hip', hx, hy, tRot, tk, tk, lvl, false);
  // ── 5) 투구 (온전 / 터짐). 스토리 죽음에는 앞으로 굴러 떨어진다 ──
  D.rec = ff.helm;
  const H = b.breached ? R.helmB : R.helm, hRot = tRot * 0.5 + Math.sin(t * 0.8) * 0.02;
  if (hkOff > 0) {
    const c = D.pt(H.nk[0], H.nk[1], H.c[0], H.c[1], NK[0], NK[1], hRot, H.k, H.k, st.C);
    const gx = lerp(c[0], c[0] + 44, hkOff), gy = lerp(c[1], -26, hkOff * hkOff);
    put(D, H, 'c', gx, gy, hRot + hkOff * 1.4, H.k, H.k, lvl, false);
  } else put(D, H, 'nk', NK[0], NK[1], hRot, H.k, H.k, lvl, false);
  const WP = D.pt(H.nk[0], H.nk[1], H.win[0], H.win[1], NK[0], NK[1], hRot, H.k, H.k, st.WP);
  // ── 6) 2페이즈: 장어 (투구 창에서) · 끊어진 호스 채찍 ──
  if (b.breached && (b.eelK ?? 0) > 0.02 && hkOff <= 0) { D.rec = ff.eel; eel(D, R, b, WP, t); }
  D.rec = false;
  if (whip && hkOff <= 0) hose(D, R, b, true, D.pt(H.nk[0], H.nk[1], H.top[0], H.top[1], NK[0], NK[1], hRot, H.k, H.k, st.O));
  // ── 7) 기름 등불 (가슴께 — 따로 흔들림, 스토리 죽음엔 바닥에) ──
  const L = R.lamp, onFloor = (b.drainK ?? 0) > 0.5;
  put(D, L, onFloor ? 'c' : 'top', S.lamp.x, S.lamp.y - (onFloor ? 10 : 6), onFloor ? 0 : Math.sin(t * 2.3) * 0.25, L.k, L.k, 0, false);
  // ── 8) 수문 열쇠 (손 → 끝) · 가까운 팔 (위로 지나간다) ──
  D.rec = ff.key || ff.body;
  const kx = S.keyE.x - S.hdN.x, ky = S.keyE.y - S.hdN.y, K = R.key;
  if (K) {
    const il = Math.hypot(K.end[0] - K.grip[0], K.end[1] - K.grip[1]) * K.k || 1;
    aimAt(D, K, 'grip', 'end', S.hdN.x, S.hdN.y, Math.atan2(ky, kx), clamp(Math.hypot(kx, ky) / il, 0.6, 1.05), 1, 0, false);
  }
  D.rec = ff.body;
  limb(D, R.armU, 'sh', 'el', S.shN.x, S.shN.y, S.elN.x, S.elN.y, 0, false, 0.7, 1.3, 1.15);
  limb(D, R.armF, 'el', 'wr', S.elN.x, S.elN.y, S.hdN.x, S.hdN.y, 0, false, 0.7, 1.3, 1.15);
  const fa = Math.atan2(S.hdN.y - S.elN.y, S.hdN.x - S.elN.x);
  if ((Pz.clutch ?? 0) > 0.5) aimAt(D, R.handO, 'wr', 'tip', S.hdN.x, S.hdN.y, fa - 0.3, 1.05, 1.05, 0, false);
  else aimAt(D, R.handF, 'wr', 'tip', S.hdN.x, S.hdN.y, fa, 1.05, 1.05, 0, false);
}
/** 공기 호스: 로직 hose 7점을 마디 타일로 (2페이즈 = 끝은 끊어진 호스 끝). root = 그림 투구의 호스 이음매 (있으면 첫 점을 그리로 옮긴다) */
function hose(D, R, b, cut, root = null) {
  const Hp = b.hose; if (!Hp?.length) return;
  const dx = root ? root[0] - Hp[0].x : 0, dy = root ? root[1] - Hp[0].y : 0;
  const n = Hp.length;
  for (let j = 0; j < n - 1; j++) {
    const a = Hp[j], c = Hp[j + 1], last = cut && j === n - 2;
    const fade = cut ? 1 : 1 - j / (n + 2) * 0.25;
    span(D, last ? R.hoseEnd : R.hoseSeg, 'a', 'b', a.x + dx, a.y + dy, c.x + dx, c.y + dy, (b.ps?.hoseK ?? 0) > 0.05 && !cut ? 1 + 0.12 * Math.sin(b.t * 18 - j * 1.4) : 1, last ? 1.0 : 1.1, false, fade);
  }
}
/** 장어: 창(WP)에서 로직 eel 5점 (창 기준으로 옮김) — 몸 마디 셋 + 머리 */
function eel(D, R, b, WP, t) {
  const E = b.eel, k = b.eelK ?? 0, dx = WP[0] - b.pts.win.x, dy = WP[1] - b.pts.win.y;
  const s = 0.6 + 0.4 * k;
  for (let j = 0; j < 3; j++) span(D, R.eelSeg, 'a', 'b', E[j].x + dx, E[j].y + dy, E[j + 1].x + dx, E[j + 1].y + dy, s, 1.25);
  const h3 = E[3], h4 = E[4];
  const ang = Math.atan2(h4.y - h3.y, h4.x - h3.x) + Math.sin(t * 5) * 0.06;
  aimAt(D, R.eelHead, 'nk', 'tip', h3.x + dx, h3.y + dy, ang, s, s * (b.stunned ? 0.95 : 1));
}
/** 등불 빛 (지역 틀 — 그림 위 가산) */
function lampGlow(ctx, b, st, t) {
  if (!st.q.halos) return;
  const S = b.pts, k = b.lampK ?? 0.7, fl = 0.8 + 0.2 * Math.sin(t * 17) * Math.sin(t * 7);
  const onFloor = (b.drainK ?? 0) > 0.5;
  halo(ctx, S.lamp.x, S.lamp.y + (onFloor ? -10 : 6), 18 + 26 * k, LAMP, (0.45 + 0.4 * k) * fl, true);
  if (!b.breached && !(b.dying > 0) && (b.helmOff ?? 0) <= 0) halo(ctx, st.WP[0], st.WP[1], 16, TEAL, 0.3 + 0.1 * Math.sin(t * 2.4));
  if (b.breached && (b.eelK ?? 0) > 0.5) { const E = b.eel[4], dx = st.WP[0] - S.win.x, dy = st.WP[1] - S.win.y; halo(ctx, E.x + dx + 6, E.y + dy - 3, 8, TEAL_H, 0.7); }
}
/** 앞: 닻 (던질 때 · 그림) + 사슬 · 카운터 창 빛 */
function front(ctx, b, R, st, t) {
  const D = st.D;
  if (b.anchor?.on && R.anchor) {
    const S = b.pts, f = b.facing, hx = b.zx + S.hdF.x * f, hy = b.fy + S.hdF.y, ax = b.anchor.x, ay = b.anchor.y;
    const d = Math.hypot(ax - hx, ay - hy), n = Math.max(2, Math.floor(d / 11)), sag = Math.min(40, d * 0.08);
    ctx.save(); ctx.strokeStyle = IRON_H; ctx.lineWidth = 2.6;
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, x = lerp(hx, ax, u), y = lerp(hy, ay, u) + Math.sin(u * PI) * sag; ctx.beginPath(); ctx.ellipse(x, y, 5.5, 3.2, Math.atan2(ay - hy, ax - hx) + (i % 2 ? PI / 2 : 0), 0, PI * 2); ctx.stroke(); }
    ctx.restore();
    D.begin(ctx);
    const p = R.anchor, s = p.k * 1.15;
    D.part(p, pickVariant(p, 0, false, null), 'c', ax, ay - 14, f > 0 ? 0 : PI, s, f > 0 ? s : -s);
    D.end();
  }
  if (!st.q.halos) return;
  if (b.keyStuck) { const S = b.pts; halo(ctx, b.zx + S.keyE.x * b.facing, b.fy - 30, 70 + 12 * Math.sin(t * 14), BRASS_H, 0.35); }
  if (b.bootStuck) halo(ctx, b.zx, b.fy - 20, 80 + 12 * Math.sin(t * 14), BRASS_H, 0.35);
}
