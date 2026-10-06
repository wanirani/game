// 엘제베트 / 시든 신부 (b_bride) — 채색 컷아웃 퍼핏 렌더러 (EX4-BOSS, docs/specs/ex_s24.md §2.2)
// 부품 (Kling, tools/painted/prompts/ex4-boss.mjs · configs/b_bride.json):
//   귀부인 — 옆모습 전신(full_a, 팔 없는 옆모습)에서 장미 관 머리 · 몸통(진홍 코르셋·레이스 목깃) · 치마 앞판 · 끌자락(뒤로 끌리는 치마 자락) · 긴 베일 +
//            팔 조각(arms_a: 창백한 위팔 · 주먹 쥔 아래팔)
//   노파 — 떠 있는 옆모습(crone_a, 거울상)에서 해골 같은 금 간 얼굴 머리(두건) · 앞 베일 · 뒤로 흩날리는 베일 · 굽은 몸통(드레스) · 넝마 자락 셋 +
//          팔 조각(arms_a 의 해골: 앙상한 위팔 · 금빛 손톱의 아래팔)
//   소품 — 성배 · 성배 파편 셋(debris) · 핏빛 장미 · 가시 덩굴 마디(채찍은 이 마디를 이어 그린다) · 시든 꽃잎 둘 · 베일 조각
// 움직임은 전부 로직(src/game/bosses/e_bride.js)의 값을 읽기만 한다:
//   boss { zx, fy, fk, facing, crone, morph, hov, ps{…}, pts{hip,neck,head,eye,shN/shF,elN/elF,hdN/hdF,gob,hemF,hemB,tA,hA}, vine[9], train[7], veil[5],
//          rags[3][5], gobletUp, gobBreakT, burnK, crackK, ghost, stunned, exposed, cWin, vineMode, vineGlow, dieT, vanishK, walkK, t, flashT, hitPart, A.floor }
// 상태별 표현: 대기(베일·끌자락 물결) · 왈츠(회전 = fk cos, 박쥐로 흩어진 동안은 그리지 않는다 — 박쥐는 로직의 지대가 그린다) · 가시 채찍(덩굴 마디가
//   8칸 띠까지 뻗는다) · 장미 던지기 · 베일을 젖힘(부름) · 성배 들기/마시기 · 무릎 인사(카운터) · 무릎(stagger) · 전환(베일이 잿빛으로 타고 얼굴에 금 →
//   노파) · 노파 떠 있기/팔 벌림(흡수)/떠오름(욕조)/미끄러짐 · 손상 0–2 · 피격 섬광(맞은 부위만) · 쓰러짐(무릎 → 시든 꽃잎, 아케이드는 3초에 사라짐)
// 젊은 날의 잔상(lastDance)은 로직이 구운 실루엣 비트맵을 지대에서 그린다 — 퍼핏을 두 번 그리지 않는다 (명세 §2.2).
// 좌표: 로직과 같은 몸 지역 좌표 (원점 = 발 가운데 바닥 zx,fy, 좌우 fk, +x = 얼굴 쪽, y 아래가 양수)
import { Drawer, Particles, Shards, halo, rr, loadRig, pickVariant, quality, QUALITY } from '../kit.js';

const DIR = 'painted/bosses/b_bride';
const PI = Math.PI;
const ROSE = '#ff6a8a', CRIM = '#c0143a', GOLD = '#e8c872', ASH = 'rgba(232,228,234,0.8)', PETAL = '#7a1424';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);
const DEF = {
  glow: '#ff6a8a',
  outline: { width: 1.2, color: 'rgba(8,4,8,0.9)' },
  parts: {
    headL: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 60 },
    torsoL: { flash: true, cracks: 2, char: 0.2, holes: 0, crackMinLum: 40 },
    skirtF: { flash: true, cracks: 2, char: 0.2, holes: 1 },
    train: { cracks: 1, char: 0.2, holes: 1, deep: 0.6 },
    veilL: { noDmg: true, deep: 0.7 },
    armU: { flash: true, cracks: 1, char: 0.1, holes: 0, deep: 0.55 },
    armF: { flash: true, cracks: 1, char: 0.1, holes: 0, deep: 0.55 },
    cHead: { flash: true, cracks: 2, char: 0.1, holes: 0, crackMinLum: 60 },
    cVeilF: { noDmg: true },
    cMane: { noDmg: true, deep: 0.7 },
    cBody: { flash: true, cracks: 3, char: 0.25, holes: 1, crackMinLum: 35 },
    ragA: { flash: true, noDmg: true, deep: 0.7 },
    ragB: { flash: true, noDmg: true, deep: 0.6 },
    ragC: { flash: true, noDmg: true },
    cArmU: { flash: true, cracks: 1, char: 0.1, holes: 0, deep: 0.55 },
    cArmF: { flash: true, cracks: 1, char: 0.1, holes: 0, deep: 0.55 },
    goblet: { noDmg: true, outline: 0.9 },
    rose: { noDmg: true, outline: 0.8 },
    vine: { noDmg: true, outline: 0.8, deep: 0.7 },
    petalA: { noDmg: true, outline: 0.6 },
    petalB: { noDmg: true, outline: 0.6 },
    debVeil: { noDmg: true, outline: 0.6 },
  },
  prefix: { gobShard: { noDmg: true, outline: 0.8 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_bride', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return { D: new Drawer(), P: new Particles(q.particles), shards: new Shards(24), q, lt: null, pf: 0, fp: null, jolt: 0, gbT: -9, crT: -1, lvl: 0, W: [0, 0], E: [0, 0], H: [0, 0], ff: {}, mk: [0, 0], petalAcc: 0 };
  },
  draw(ctx, boss, world, rig, st) { drawBoss(ctx, boss, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.zx ?? b.cx, Y = b.fy ?? b.bottom, hov = b.hov ?? 0;
    let x0 = X - 200, x1 = X + 200, y0 = Y - 250 - hov, y1 = Y + 30;
    if (b.vineMode === 'lash') { if ((b.facing ?? 1) > 0) x1 = X + 8 * 48 + 80; else x0 = X - 8 * 48 - 80; }
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 30 < x0) x0 = px - 30; if (px + 30 > x1) x1 = px + 30; if (py - 30 < y0) y0 = py - 30; if (py + 30 > y1) y1 = py + 30; }
    if (st?.shards?.list.length) for (const s of st.shards.list) { if (s.x - 40 < x0) x0 = s.x - 40; if (s.x + 40 > x1) x1 = s.x + 40; if (s.y - 40 < y0) y0 = s.y - 40; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    if (st.flashL > 0.05) L.add(st.flashW?.[0] ?? b.zx, st.flashW?.[1] ?? b.fy - 80, 180, GOLD, st.flashL * 0.7);
  },
  /** 월드 파편(spawnDebris)용 채색 조각 — 시든 꽃잎 */
  debris(i, rig) {
    const names = ['petalA', 'petalB', 'debVeil'].filter((n) => rig.parts[n]); if (!names.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.9;
    return { size: Math.max(6, (p.w + p.h) * 0.25 * p.k), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P, R = rig.parts;
  st.q = qOf(world.game);
  const q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const floor = b.A.floor, t = b.t;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0;
  const hk = b.stats?.maxHp ? b.hp / b.stats.maxHp : 1;
  st.lvl = b.crone ? (hk < 0.25 ? 2 : 1) : (hk < 0.75 ? 1 : 0);
  // 피격 부위 고정 (섬광이 다시 켜진 프레임의 b.hitPart)
  if (b.flashT > st.pf + 1e-4) st.fp = b.hitPart ?? null;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 7);
  st.flashL = Math.max(0, (st.flashL ?? 0) - dt * 2.5);
  const fOn = b.flashT > 0 && !dying, fp = st.fp, ff = st.ff;
  ff.head = fOn && (!fp || fp === b.pHead);
  ff.body = fOn && (!fp || fp === b.pBody || fp === b.pGob);
  ff.legs = fOn && (!fp || fp === b.pSkirt);
  if (b.state === 'intro' || (b.hp >= b.stats.maxHp && !dying)) { st.shards.clear(); st.gbT = b.gobBreakT; }
  const X = b.zx, Y = b.fy, fk = Math.abs(b.fk) < 0.02 ? 0.02 * Math.sign(b.fk || 1) : b.fk;
  const W = (lx, ly, out = st.W) => { out[0] = X + fk * lx; out[1] = Y + ly; return out; };
  const bodyA = 1 - (b.vanishK ?? 0);
  const ga = ctx.globalAlpha;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  // 성배가 깨진 순간 (로직 gobBreakT 가 바뀐 프레임) → 금 파편 셋이 강체로 튄다
  if (b.gobBreakT > 0 && b.gobBreakT !== st.gbT) { st.gbT = b.gobBreakT; gobletBreak(b, rig, st, W); }
  // 얼굴에 금이 가기 시작한 순간 (전환 1.0초) → 베일 조각이 타서 떨어진다
  if (b.crackK > 0 && st.crT < 0 && !b.crone) { st.crT = t; veilAsh(b, rig, st, W); }
  if (b.crackK <= 0) st.crT = -1;
  P.draw(ctx, 0);
  if (bodyA > 0.01 && !b.ghost) {
    ctx.globalAlpha = ga * bodyA;
    D.begin(ctx);
    D.save();
    ctx.translate(X, Y); ctx.scale(fk, 1);
    D.begin(ctx);
    D.rec = false; D.log.length = 0;
    const jr = st.jolt ? (rr.next() - 0.5) * 0.04 * st.jolt : 0;
    const m = clamp(b.morph ?? (b.crone ? 1 : 0), 0, 1);
    if (m < 0.999) { ctx.globalAlpha = ga * bodyA * (1 - m); lady(D, ctx, R, b, st, ff, jr, t); }
    if (m > 0.001) { ctx.globalAlpha = ga * bodyA * m; crone(D, ctx, R, b, st, ff, jr, t); }
    if (fOn) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.6);
    else { D.rec = false; D.log.length = 0; }
    D.end();
    ctx.globalAlpha = ga * bodyA;
    if (m < 0.999 && b.crackK > 0) cracks(ctx, b, (1 - m) * b.crackK);
    eyes(ctx, b, st, q, m, t);
    D.restore();
    ctx.globalAlpha = ga;
  }
  // ── 월드: 강체 조각 · 입자 ──
  D.begin(ctx);
  st.shards.draw(D);
  D.end();
  if (b.gobletUp && !dying && q.halos) { const G = W(b.pts.gob.x, b.pts.gob.y, st.H); halo(ctx, G[0], G[1], 26, GOLD, 0.25 + 0.15 * Math.sin(t * 8)); }
  const mt = b.morphT >= 0 ? t - b.morphT : 9;
  if (mt < 0.5 && b.crone) { const k = 1 - mt / 0.5; halo(ctx, X, Y - 80 - (b.hov ?? 0), 170, '#ffd6e0', 0.5 * k, true); }
  ambient(P, b, st, W, dt, q, hit, t, bodyA);
  P.draw(ctx, 1);
  ctx.globalAlpha = ga;
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 부품 배치 ─────────────────────────
/** 두 점을 잇는 부품 (피벗 a → b 벡터를 로직 (ax,ay) → (bx,by) 에 맞춰 돌리고, 길이 비율을 lo..hi 로 늘인다) — b_hagen.js 와 같다 */
function segment(D, p, pa, pb, ax, ay, bx, by, lvl, deep, jr = 0, lo = 0.85, hi = 1.18, alpha = 1) {
  const A = p[pa], B = p[pb];
  const ix = B[0] - A[0], iy = B[1] - A[1];
  const lx = bx - ax, ly = by - ay;
  const rot = Math.atan2(ly, lx) - Math.atan2(iy, ix) + jr;
  const k = p.k * clamp(Math.hypot(lx, ly) / (Math.hypot(ix, iy) * p.k || 1), lo, hi);
  D.part(p, pickVariant(p, lvl, deep, null), pa, ax, ay, rot, k, k, alpha);
}
/** 피벗 a 를 (x,y) 에 두고 그림의 a→b 방향이 각 ang 이 되게 (길이는 그림 그대로) */
function aim(D, p, pa, pb, x, y, ang, lvl, deep, sx = 1, alpha = 1) {
  const ia = Math.atan2(p[pb][1] - p[pa][1], p[pb][0] - p[pa][0]);
  D.part(p, pickVariant(p, lvl, deep, null), pa, x, y, ang - ia, p.k * sx, p.k, alpha);
}
/** 가시 덩굴 채찍: 마디 그림을 로직 점 사이마다 이어 그린다 (굵기는 그대로, 길이만 늘인다) */
function vine(D, R, b, deep) {
  const p = R.vine, V = b.vine; if (!p || !V) return;
  const L = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) * p.k, ia = Math.atan2(p.b[1] - p.a[1], p.b[0] - p.a[0]);
  const img = pickVariant(p, 0, deep, null);
  for (let i = 1; i < V.length; i++) {
    const a = V[i - 1], c = V[i], dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    const sx = p.k * clamp(len / L, 0.12, 3) * 1.08, sy = p.k * (0.55 + 0.45 * clamp(len / L, 0.3, 1));
    D.part(p, img, 'a', a.x, a.y, Math.atan2(dy, dx) - ia, sx, sy);
  }
}

/** 귀부인 (지역 좌표) */
function lady(D, ctx, R, b, st, ff, jr, t) {
  const P = b.pts, s = b.ps, lvl = st.lvl, lash = b.vineMode === 'lash';
  const kn = clamp(s.kneel, 0, 1), bw = clamp(s.bow, 0, 1), fl = clamp(s.flare, 0, 1);
  // 1) 먼 팔 (deep) — 채찍을 쥔 손
  segment(D, R.armU, 'sh', 'el', P.shF.x, P.shF.y, P.elF.x, P.elF.y, lvl, true, 0, 0.8, 1.25);
  segment(D, R.armF, 'el', 'hd', P.elF.x, P.elF.y, P.hdF.x, P.hdF.y, lvl, true, 0, 0.8, 1.25);
  if (!lash) vine(D, R, b, true);
  // 2) 긴 베일 (머리 뒤 → 등 → 바닥, 로직 베일 띠의 방향으로 흔들린다). 전환 중에는 잿빛으로 타 들어간다
  const V0 = b.veil[0], V4 = b.veil[b.veil.length - 1];
  const va = clamp(Math.atan2(V4.y - V0.y, V4.x - V0.x) - 0.04, 1.35, 2.25);   // 베일을 젖혀도(부름) 깃발처럼 서지 않게
  aim(D, R.veilL, 'top', 'bot', V0.x, V0.y, va, 0, false, 1, 1 - 0.75 * (b.burnK ?? 0));
  // 3) 끌자락 (치마 뒷단 → 바닥을 따라 뒤로)
  const T0 = b.train[0], T6 = b.train[b.train.length - 1];
  D.rec = ff.legs;
  segment(D, R.train, 'top', 'tip', T0.x + 10, T0.y, T6.x - 6, T6.y + 2, lvl, true, 0, 0.7, 1.35);
  // 4) 치마 앞판: 허리에 걸고 바닥까지 늘인다 (펄럭임 · 무릎 · 인사에 따라 옆으로 퍼진다)
  const sk = R.skirtF, sH = (sk.bot[1] - sk.top[1]) * sk.k, drop = Math.max(10, -P.hip.y - (b.hov ?? 0) + 2);
  const ky = sk.k * clamp(drop / sH, 0.45, 1.25), kx = sk.k * (1 + 0.22 * fl + 0.25 * kn + 0.1 * bw);
  D.part(sk, pickVariant(sk, lvl, false, null), 'top', P.hip.x + 1, P.hip.y - 2, P.tA * 0.25 + Math.sin(t * 2.4) * 0.015 + jr * 0.5, kx, ky);
  D.rec = false;
  // 5) 몸통 · 머리
  D.rec = ff.body;
  segment(D, R.torsoL, 'hip', 'nk', P.hip.x, P.hip.y, P.neck.x, P.neck.y, lvl, false, jr, 0.88, 1.15);
  D.rec = ff.head;
  const h = R.headL, hr = (P.hA ?? 0) - 0.02 + jr;
  D.part(h, pickVariant(h, Math.min(1, lvl), false, null), 'nk', P.neck.x, P.neck.y, hr, h.k, h.k);
  const e = D.pt(h.nk[0], h.nk[1], h.eye[0], h.eye[1], P.neck.x, P.neck.y, hr, h.k, h.k, st.E);
  st.eyeL = st.eyeL ?? [0, 0]; st.eyeL[0] = e[0]; st.eyeL[1] = e[1];
  D.rec = false;
  // 6) 휘두른 채찍은 몸 앞
  if (lash) vine(D, R, b, false);
  // 7) 가까운 팔 + 성배
  D.rec = ff.body;
  segment(D, R.armU, 'sh', 'el', P.shN.x, P.shN.y, P.elN.x, P.elN.y, lvl, false, 0, 0.8, 1.25);
  segment(D, R.armF, 'el', 'hd', P.elN.x, P.elN.y, P.hdN.x, P.hdN.y, lvl, false, 0, 0.8, 1.25);
  D.rec = false;
  goblet(D, R, b);
}

/** 노파 (지역 좌표) */
function crone(D, ctx, R, b, st, ff, jr, t) {
  const P = b.pts, lvl = st.lvl, lash = b.vineMode === 'lash';
  // 머리·몸통 자리를 먼저 계산 (뒤에 그릴 것들이 그 피벗에 매달린다)
  const bd = R.cBody, bix = bd.nk[0] - bd.hip[0], biy = bd.nk[1] - bd.hip[1];
  const blx = P.neck.x - P.hip.x, bly = P.neck.y - P.hip.y;
  const brot = Math.atan2(bly, blx) - Math.atan2(biy, bix) + jr;
  const bk = bd.k * clamp(Math.hypot(blx, bly) / (Math.hypot(bix, biy) * bd.k || 1), 0.88, 1.15);
  const hd = R.cHead, hr = (P.hA ?? 0) - 0.5 + jr;
  // 1) 먼 팔 (deep)
  segment(D, R.cArmU, 'sh', 'el', P.shF.x, P.shF.y, P.elF.x, P.elF.y, lvl, true, 0, 0.8, 1.25);
  segment(D, R.cArmF, 'el', 'hd', P.elF.x, P.elF.y, P.hdF.x, P.hdF.y, lvl, true, 0, 0.8, 1.25);
  if (!lash) vine(D, R, b, true);
  // 2) 뒤로 흩날리는 베일 (머리 뒤)
  const mn = D.pt(hd.nk[0], hd.nk[1], hd.mn[0], hd.mn[1], P.neck.x, P.neck.y, hr, hd.k, hd.k, st.mk);
  const H0 = b.hair[0][0], H4 = b.hair[0][b.hair[0].length - 1];
  aim(D, R.cMane, 'top', 'tip', mn[0], mn[1], Math.atan2(H4.y - H0.y, H4.x - H0.x) + 0.75 + Math.sin(t * 2.6) * 0.05, lvl, true);
  // 3) 넝마 자락 셋 (몸통 그림의 rA·rB·rC 에서, 로직 넝마 띠의 방향으로 흩날린다)
  D.rec = ff.legs;
  const rp = ['rA', 'rB', 'rC'], rn = ['ragA', 'ragB', 'ragC'];
  for (let i = 0; i < 3; i++) {
    const p = R[rn[i]], S = b.rags[i]; if (!p || !S) continue;
    const r = D.pt(bd.hip[0], bd.hip[1], bd[rp[i]][0], bd[rp[i]][1], P.hip.x, P.hip.y, brot, bk, bk, st.H);
    const ang = Math.atan2(S[S.length - 1].y - S[0].y, S[S.length - 1].x - S[0].x);
    aim(D, p, 'top', 'bot', r[0], r[1], ang + (i === 0 ? 0.3 : 0), lvl, i < 2);
  }
  D.rec = false;
  // 4) 몸통
  D.rec = ff.body;
  D.part(bd, pickVariant(bd, lvl, false, null), 'hip', P.hip.x, P.hip.y, brot, bk, bk);
  D.rec = false;
  // 5) 머리 (해골 같은 금 간 얼굴 · 두건) + 앞 베일
  D.rec = ff.head;
  D.part(hd, pickVariant(hd, Math.min(1, lvl), false, null), 'nk', P.neck.x, P.neck.y, hr, hd.k, hd.k);
  const e = D.pt(hd.nk[0], hd.nk[1], hd.eye[0], hd.eye[1], P.neck.x, P.neck.y, hr, hd.k, hd.k, st.E);
  st.eyeC = st.eyeC ?? [0, 0]; st.eyeC[0] = e[0]; st.eyeC[1] = e[1];
  const vf = D.pt(hd.nk[0], hd.nk[1], hd.vf[0], hd.vf[1], P.neck.x, P.neck.y, hr, hd.k, hd.k, st.H);
  aim(D, R.cVeilF, 'top', 'bot', vf[0], vf[1], PI / 2 + 0.05 + Math.sin(t * 2.1) * 0.06 - (b.walkK ?? 0) * 0.2, 0, false);
  D.rec = false;
  if (lash) vine(D, R, b, false);
  // 6) 가까운 팔 + 성배
  D.rec = ff.body;
  segment(D, R.cArmU, 'sh', 'el', P.shN.x, P.shN.y, P.elN.x, P.elN.y, lvl, false, 0, 0.8, 1.25);
  segment(D, R.cArmF, 'el', 'hd', P.elN.x, P.elN.y, P.hdN.x, P.hdN.y, lvl, false, 0, 0.8, 1.25);
  D.rec = false;
  goblet(D, R, b);
}
/** 성배 (잔 가운데 = 로직 pts.gob, 늘 똑바로). 깨진 뒤 1.5초는 손에 없다 */
function goblet(D, R, b) {
  if (b.gobBreakT > 0 && b.t - b.gobBreakT < 1.5) return;
  const p = R.goblet; if (!p) return;
  D.part(p, p.v.base, 'c', b.pts.gob.x, b.pts.gob.y, 0, p.k, p.k);
}

/** 전환 중 얼굴에 번지는 금 (지역 좌표, 귀부인 머리 위) */
function cracks(ctx, b, k) {
  if (k <= 0.02) return;
  const h = b.pts.head, a = b.pts.hA ?? 0;
  ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(a);
  ctx.strokeStyle = `rgba(40,12,18,${(0.8 * k).toFixed(3)})`; ctx.lineWidth = 0.8; ctx.beginPath();
  ctx.moveTo(-1, -7); ctx.lineTo(2, -2); ctx.lineTo(0, 2); ctx.lineTo(4, 3 + 5 * k);
  ctx.moveTo(2, -2); ctx.lineTo(7, 0); ctx.moveTo(6, -8); ctx.lineTo(4, -5 + 2 * k); ctx.moveTo(0, 2); ctx.lineTo(-4, 5 * k);
  ctx.stroke();
  ctx.restore();
}
/** 빛: 붉은 눈 (지역 좌표) */
function eyes(ctx, b, st, q, m, t) {
  if (b.dying > 0 && (b.dieT ?? 0) > 1.2) return;
  const e = m > 0.5 ? st.eyeC : st.eyeL;
  if (!e) return;
  const k = (0.75 + 0.25 * Math.sin(t * 4)) * (b.dying > 0 ? 0.4 : 1) * (b.cWin || b.gobletUp ? 1.5 : 1);
  if (q.halos) halo(ctx, e[0], e[1], 7, CRIM, 0.55 * k);
  halo(ctx, e[0], e[1], 2.2, '#ffd0d8', Math.min(1, 0.8 * k), true);
}
/** 성배가 깨진 순간: 금 파편 셋 + 금빛 입자 */
function gobletBreak(b, rig, st, W) {
  const R = rig.parts, c = W(b.pts.gob.x, b.pts.gob.y, [0, 0]);
  const names = Object.keys(R).filter((n) => n.startsWith('gobShard'));
  for (let i = 0; i < names.length; i++) {
    const p = R[names[i]], k = p.k;
    st.shards.spawn(p.v.base, p.c[0], p.c[1], c[0] + rr.range(-4, 4), c[1] + rr.range(-4, 4), rr.range(-0.6, 0.6), k * (b.facing || 1), k, (i - 1) * rr.range(60, 160), rr.range(-380, -200), rr.range(-8, 8), { r: 4, bounce: 0.35, fade: 2.2 });
  }
  st.P.burst('spark', c[0], c[1], 10, { speed: 260, color: GOLD });
  st.flashL = 1; st.flashW = [c[0], c[1]];
}
/** 얼굴에 금이 가는 순간: 베일 조각이 타서 떨어진다 */
function veilAsh(b, rig, st, W) {
  const p = rig.parts.debVeil;
  const c = W(b.veil[1].x, b.veil[1].y, [0, 0]);
  if (p) st.shards.spawn(p.v.base, p.c[0], p.c[1], c[0], c[1], rr.range(-0.4, 0.4), p.k * (b.facing || 1), p.k, -(b.facing || 1) * rr.range(40, 100), rr.range(-160, -60), rr.range(-3, 3), { r: 4, bounce: 0.1, fade: 1.8 });
  st.P.burst('ember', c[0], c[1], 10, { speed: 90, angle: -PI / 2, spread: 1.2 });
}
function ambient(P, b, st, W, dt, q, hit, t, bodyA) {
  const amb = q.ambient;
  if (b.dying > 0) {
    // 시든 꽃잎으로 바스러짐 (아케이드 1.2초부터 — vanishK 가 오른다). 스토리는 무릎 꿇은 채 꽃잎 몇 장만
    const crumble = (b.vanishK ?? 0) > 0;
    st.petalAcc += dt * (crumble ? 30 : 2) * amb;
    while (st.petalAcc >= 1) { st.petalAcc -= 1; const p = W(rr.range(-30, 26), -rr.range(6, 130) * (1 - 0.6 * (b.vanishK ?? 0)) - (b.hov ?? 0), [0, 0]); P.emit('ashLight', p[0], p[1], rr.range(-40, 40), rr.range(-90, -20), { color: rr.next() < 0.5 ? PETAL : '#a01c30', size: rr.range(2, 3.4), life: rr.range(1.2, 2.2), layer: 1 }); }
    return;
  }
  if (b.ghost || bodyA < 0.3) return;
  // 장미 꽃잎 (귀부인) · 잿빛 재 (노파)
  if (rr.next() < dt * (b.crone ? 2.2 : 1.2) * amb) { const p = W(rr.range(-40, 30), rr.range(-130, -30) - (b.hov ?? 0), [0, 0]); P.emit('ashLight', p[0], p[1], rr.range(-20, 20), rr.range(10, 40), { color: b.crone ? ASH : PETAL, layer: 0 }); }
  // 전환: 타는 베일의 불씨
  if ((b.burnK ?? 0) > 0 && !b.crone && rr.next() < dt * 24 * amb) { const v = b.veil[1 + Math.floor(rr.next() * 3)], p = W(v.x, v.y, [0, 0]); P.emit('ember', p[0], p[1], rr.range(-20, 20), rr.range(-60, -20)); }
  // 카운터 창 — 흰 섬광
  if (b.cWin && rr.next() < dt * 30 * amb) { const p = W(rr.range(-20, 20), rr.range(-110, -20), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-160, 160), rr.range(-200, 40), { color: '#ffd6e0' }); }
  // 성배를 든 동안 — 금빛 반짝임
  if (b.gobletUp && rr.next() < dt * 16 * amb) { const p = W(b.pts.gob.x + rr.range(-8, 8), b.pts.gob.y + rr.range(-8, 8), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-40, 40), rr.range(-80, -10), { color: GOLD }); }
  if (b.stunned && rr.next() < dt * 10 * amb) { const p = W(rr.range(-20, 20), rr.range(-110, -40) - (b.hov ?? 0), [0, 0]); P.emit('ashLight', p[0], p[1], rr.range(-20, 20), rr.range(-60, -20), { color: ROSE, life: 1.2, layer: 1 }); }
  if (hit) {
    const hp = st.fp, p = st.W2h ??= [0, 0];
    if (hp) { p[0] = hp.x + hp.w / 2 + rr.range(-6, 6); p[1] = hp.y + hp.h / 2 + rr.range(-6, 6); } else W(rr.range(-10, 10), rr.range(-100, -40), p);
    P.burst('chip', p[0], p[1], 3, { speed: 200, color: b.crone ? '#4a1420' : '#a01c30' });
    P.burst('spark', p[0], p[1], 3, { speed: 240, color: hp === b.pGob ? GOLD : ROSE });
  }
}
