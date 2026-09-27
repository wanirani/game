// 진홍의 갑주군주 (b_crimson) — 채색 컷아웃 퍼핏 렌더러
// 부품 (Kling, tools/painted/configs/b_crimson.json): 투구(속이 빈 투구 밑으로 피 묻은 힘줄) · 흉갑(어깨 구멍 속 살) · 견갑 ·
//   위팔 판 · 건틀릿(주먹+팔보호대) · 넓적다리 판(가시) · 정강이+사바톤 2종 · 허리(해골 버클·비늘 치마·누더기) · 할버드 ·
//   칼날 건틀릿 · 발톱 건틀릿 (분리 형태 로켓 주먹) · 심장(속을 채운 살아 있는 핵) · 갑옷 파편 9
// 움직임은 전부 기존 로직(src/game/bosses/a_crimson.js)을 읽기만 한다:
//   조립: pose() (H 엉덩이 · T 몸통 · G 할버드 손잡이 · dx,dy), hA(할버드 각), hR, crouch, twist, gait, vx, heat, visor, phase, state
//   분리: split, pc.{helm,gF,gB,hal}.{x,y,a,busy,fixed,vx,vy,spin}, cx/cy (핵 = 흉갑 + 심장)
// 상태별 표현: idle/걷기(발 교차·흔들림) sweep(하단/상단 휘두름 + 할버드 잔상) overhead(치켜들기 → 내려찍기) leap(웅크림·공중·착지)
//   thrust(몸통을 앞으로 기울여 찌르기) pillars(할버드를 땅에) transform(업화: 균열·관절 불꽃 폭주) splitting(떨림 → 산산이 분리)
//   분리: 부유하는 흉갑 밑으로 뛰는 심장이 늘어져 피를 흘리고, 투구·건틀릿·할버드는 핏빛 힘줄로 핵에 이어져 있다
//   rocket(주먹 뒤로 불꽃 분사) halSpin(회전 잔상) helmFire(면갑 틈 불길) crush(재조립 압살) · 피격 섬광 · 손상 0~2 ·
//   death(조립: 투구가 튕겨 나가고 무너짐 / 분리: 심장이 터지고 부품이 떨어짐)
// 절차적 그로테스크 층: 심장 박동 발광 · 관절·목 틈의 검붉은 불꽃 · 피 방울 → 바닥 튐 · 허리 밑으로 늘어진 힘줄(verlet) ·
//   면갑 눈빛 · 불씨·연기 · 균열 발광(열기에 따라)
import { Drawer, Strand, Particles, DamageState, Shards, halo, puff, rr, hash1, loadRig, pickVariant, quality, QUALITY, drawStrand, ik2, ledgesOver } from '../kit.js';

const DIR = 'painted/bosses/b_crimson';
// 실제 품질 등급: 설정 기본값은 'auto' 라서 settings.quality 만 보면 폰에서도 늘 'high' 가 된다 → 조절기 결과(game.quality)를 먼저 본다
const tierOf = (game) => { const t = game?.quality ?? game?.tier ?? game?.settings?.quality; return QUALITY[t] ? t : quality(game).name; };
const LAVA = '#ff7a2a', DFIRE = '#ff3a1a', EMBER = '#ffb060';
const BLOOD = '#3a0206', BLOODHI = '#ff5a4a';
const PI = Math.PI, TAU = PI * 2;
const S = 1.2;              // 로직 지역 단위 → 월드 px (a_crimson.js 와 같음)
const SC = 1.06;            // 채색 부품 배율
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

const DEF = {
  glow: LAVA,
  outline: { width: 2.0, color: 'rgba(12,3,4,0.92)' },
  parts: {
    helm: { flash: true, cracks: 3, holes: 1 },
    torso: { flash: true, cracks: 4, holes: 2 },
    pauldron: { flash: true, deep: 0.6, cracks: 2, holes: 1 },
    upper: { flash: true, deep: 0.58, cracks: 1, holes: 0 },
    fist: { flash: true, deep: 0.58, cracks: 1, holes: 0 },
    thigh: { flash: true, deep: 0.58, cracks: 1, holes: 1 },
    shin: { flash: true, cracks: 2, holes: 1 },
    shin2: { flash: true, deep: 0.58, deepOnly: true, cracks: 2, holes: 1 },
    waist: { flash: true, cracks: 2, holes: 1 },
    halberd: { flash: true, cracks: 2, holes: 0, char: 1 },
    gblade: { flash: true, cracks: 1, holes: 0 },
    gclaw: { flash: true, cracks: 1, holes: 0 },
    heart: { flash: true, cracks: 2, holes: 1, stain: '#2a0204', crackMinLum: 90 },
  },
  prefix: { deb: { noDmg: true, outline: 1.4 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_crimson', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const guts = [];
    for (let i = 0; i < 3; i++) guts.push(new Strand(6, 7, { g: 900, damp: 0.92 }));
    return {
      // 입자 풀은 최고 등급 크기로 한 번 만들고, 등급에 따라 P.max 로 상한만 바꾼다 (전투 중 등급이 바뀌어도 새 배열 없음)
      D: new Drawer(), P: new Particles(QUALITY.high.particles), shards: new Shards(48),
      dmg: new DamageState(boss.def?.phases ?? [0.6, 0.3]), q: null, lt: null, pf: 0, jolt: 0,
      guts, trail: [], d: {}, wasSplit: !!boss.split, pts: {}, lastHA: boss.hA ?? -1, spinA: [],
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    let x0, x1, y0, y1;
    if (!b.split) { x0 = b.cx - 380; x1 = b.cx + 380; y0 = b.bottom - 400; y1 = b.bottom + 30; }
    else {
      x0 = b.cx - 170; x1 = b.cx + 170; y0 = b.cy - 190; y1 = b.cy + 190;
      for (const k in b.pc) { const p = b.pc[k], r = k === 'hal' ? 200 : 110; x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r); y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r); }
    }
    if (b.dying > 0 || st?.shards?.list.length) { x0 = Math.min(x0, b.A.x0 - 40); x1 = Math.max(x1, b.A.x1 + 40); y1 = Math.max(y1, b.A.floor + 30); }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  /** 월드 파편(ABoss.spawnDebris)용 채색 갑옷 조각 */
  debris(i, rig) {
    const names = rig.man.groups.debris; if (!names?.length) return null;
    const p = rig.parts[names[(i * 4) % names.length]], im = p.v.base, k = p.k * 0.95;
    return { size: Math.max(10, (p.r ?? 10) * 1.2), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 도우미 ─────────────────────────
const _a = [0, 0], _b = [0, 0], _c = [0, 0], _e = {};
/** 로직 지역 좌표(a_crimson.js 의 W) → 월드 */
function W(b, fx, lx, ly, out) { out[0] = b.cx + fx * lx * S; out[1] = b.bottom + ly * S; return out; }
/** 팔다리: 부품 텍셀 pA 를 월드 A 에, pB 쪽이 B 를 향하게. m = 좌우(±1). 길이에 맞춰 늘림 (sLo..sHi 로 제한) */
function limb(D, part, img, pA, pB, ax, ay, bx, by, m, kb, sLo = 0.85, sHi = 1.2, a = 1) {
  const vx = (pB[0] - pA[0]) * m, vy = pB[1] - pA[1];
  const nat = Math.hypot(vx, vy) * kb, want = Math.hypot(bx - ax, by - ay);
  const s = clamp(want / Math.max(1e-3, nat), sLo, sHi) * kb;
  const rot = Math.atan2(by - ay, bx - ax) - Math.atan2(vy, vx);
  D.part(part, img, pA, ax, ay, rot, m * s, s, a);
  return rot;
}
/** 심장 박동 (쿵-쿵 … 쉼) 0..1 */
function beat(t, rate) { const u = (t * rate) % 1; return Math.max(0, Math.sin(u * TAU * 2) * (u < 0.5 ? 1 : 0)) ** 2; }
/** 불꽃 혀 (가산 퍼프를 방향으로 늘여 겹침) */
function flame(ctx, x, y, ang, len, w, t, color, a, seed = 0, n = 5) {
  if (a <= 0.01) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  const img = puff(color, true), img2 = puff(color);
  n = Math.max(2, n | 0);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), fl = Math.sin(t * 9 + i * 1.7 + seed) * 0.5 + 0.5;
    const aa = ang + Math.sin(t * 5 + i * 2.1 + seed) * 0.25 * u, dd = len * u * (0.8 + fl * 0.3);
    const px = x + Math.cos(aa) * dd, py = y + Math.sin(aa) * dd;
    const ww = w * (1.4 - u) * (0.8 + fl * 0.4), hh = ww * (1.6 - u * 0.4);
    ctx.globalAlpha = ga * a * (1 - u * 0.65);
    ctx.drawImage(i === 0 ? img : img2, px - ww, py - hh, ww * 2, hh * 2);
  }
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
/** 손상 균열 발광 (반 해상도, 가산, 맥동, 열기로 강해짐) */
function glowOver(ctx, D, part, lvl, pivot, x, y, rot, sx, sy, a, st, t) {
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 || part.v.deep_dmg1) ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? part.gl.dmg2 : part.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? part[pivot] : pivot;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + part.w * 0.01)) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}
/** 핏빛 힘줄 (두 점 사이로 늘어짐, 두 번 획) */
function tendril(ctx, ax, ay, bx, by, w, sag, t, seed, a = 1) {
  if (a <= 0.02) return;
  const mx = (ax + bx) / 2 + Math.sin(t * 2.3 + seed) * 6, my = (ay + by) / 2 + sag + Math.sin(t * 1.7 + seed * 2) * 4;
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a;
  ctx.lineCap = 'round';
  // 꼬인 두 가닥 (굵은 힘줄 + 가는 핏줄) — 살덩이처럼 보이게
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by);
  ctx.strokeStyle = '#140203'; ctx.lineWidth = w; ctx.stroke();
  ctx.strokeStyle = '#5a080c'; ctx.lineWidth = w * 0.62; ctx.stroke();
  ctx.strokeStyle = 'rgba(210,70,60,0.55)'; ctx.lineWidth = Math.max(0.8, w * 0.18); ctx.stroke();
  const tx = Math.sin(t * 3.1 + seed) * w * 0.9, ty = Math.cos(t * 2.7 + seed) * w * 0.7;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx + tx, my + ty + w, bx, by);
  ctx.strokeStyle = '#2a0406'; ctx.lineWidth = w * 0.45; ctx.stroke();
  ctx.strokeStyle = '#9a1418'; ctx.lineWidth = w * 0.22; ctx.stroke();
  ctx.globalAlpha = ga;
}

// ───────────────────────── 메인 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P;
  if (st.rig !== rig) st.rig = rig;
  const qn = tierOf(world.game);
  if (st.q?.name !== qn) { st.q = QUALITY[qn]; P.max = Math.min(P.x.length, st.q.particles); }
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const floor = b.A.floor;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0, dT = b.deathT ?? 0;
  const ratio = dying ? 0 : b.hp / b.stats.maxHp;
  const up = st.dmg.update(ratio, dt);
  const lvl = dying ? 2 : Math.max(0, st.dmg.level);
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 7);
  const fx = b.facing >= 0 ? 1 : -1;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  D.begin(ctx);
  // 분리 순간: 핵에서 피·파편 폭발
  if (b.split && !st.wasSplit) { st.wasSplit = true; if (!dying) splitBurst(st, rig, b); }
  if (!b.split) st.wasSplit = false;
  if (up > 0 && !dying) { const x = b.split ? b.cx : b.cx, y = b.split ? b.cy : b.bottom - 150; P.burst('chip', x, y, 10 + up * 6, { speed: 360, angle: -PI / 2, spread: 1.4 }); P.burst('blood', x, y, 10, { speed: 280, angle: -PI / 2, spread: 1.3, color: BLOOD, hi: BLOODHI }); P.burst('ember', x, y, 16, { speed: 220, color: LAVA }); }
  // 바닥 그림자
  if (!st.d.gone) {
    const alt = b.split ? clamp((floor - b.bottom) / 300, 0, 1) : 0;
    D.img(puff('#000000'), 32, 32, b.cx, floor - 2, 0, (b.split ? 80 * (1 - alt * 0.4) : 100) / 32, (b.split ? 12 : 16) / 32, b.split ? 0.5 * (1 - alt * 0.5) : 0.6);
  }
  D.end();
  P.draw(ctx, 0);
  if (!st.d.gone) {
    if (!b.split) drawAssembled(ctx, D, b, rig, st, dt, lvl, fx, hit, dying, dT);
    else drawSplit(ctx, D, b, rig, st, dt, lvl, fx, hit, dying, dT);
  }
  if (dying) death(ctx, D, b, rig, st, dt, dT, fx, lvl);
  st.shards.draw(D);
  D.end();
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 조립 형태 ─────────────────────────
function drawAssembled(ctx, D, b, rig, st, dt, lvl, fx, hit, dying, dT) {
  const R = rig.parts, P = st.P, q = st.q, t = b.t;
  const V = (p, deep = false) => pickVariant(p, lvl, deep, null);
  const Pz = b.pose(), H = Pz.H, G = Pz.G, dx = Pz.dx, dy = Pz.dy;
  const heat = clamp(b.heat ?? 0, 0, 1), cr = b.crouch ?? 0, tw = b.twist ?? 0;
  const walk = clamp(Math.abs(b.vx) / 90, 0, 1), g0 = b.gait ?? 0;
  const rec = b.flashT > 0 && !dying;
  const shake = (st.jolt > 0 ? st.jolt * 3 : 0) + (b.state === 'transform' || b.state === 'splitting' ? 2.2 : 0) + (dying ? 3 * clamp(1 - dT, 0, 1) : 0);
  const jx = shake ? (rr.next() - 0.5) * shake : 0, jy = shake ? (rr.next() - 0.5) * shake * 0.6 : 0;
  const d = st.d, m = -fx;                          // 원본 그림은 왼쪽을 본다 → 좌우 m
  const k = (p) => p.k * SC;
  // ── 몸통 배치: 엉덩이 H, 앞으로 기울기(웅크림·찌르기 돌진에서 손이 닿도록) ──
  const T = R.torso, kT = k(T);
  W(b, fx, H.x + tw * 6, H.y - 3, _a); const hipX = _a[0] + jx, hipY = _a[1] + jy;
  const fh = W(b, fx, G.x + dx * 18, G.y + dy * 18, st.pts.fh ??= [0, 0]), bh = W(b, fx, G.x - dx * 22, G.y - dy * 22, st.pts.bh ??= [0, 0]);
  let lean = tw * 0.1 + cr * 0.12 + Math.sin(t * 1.9) * 0.012;
  const reach = (R.upper.bot[1] - R.upper.top[1]) * k(R.upper) + (R.fist.wrist[1] - R.fist.hand[1]) * k(R.fist);
  for (let it = 0; it < 2; it++) {       // 앞손이 팔 길이보다 멀면 몸통을 그만큼 앞으로 숙인다 (찌르기)
    D.pt(T.hip[0], T.hip[1], T.shN[0], T.shN[1], hipX, hipY, fx * lean, m * kT, kT, _b);
    const dd = Math.hypot(fh[0] - _b[0], fh[1] - _b[1]) - reach * 1.08;
    if (dd <= 0) break;
    lean = Math.min(0.75, lean + dd / 150);
  }
  const trot = fx * lean;
  const tp = (pv, out) => D.pt(T.hip[0], T.hip[1], pv[0], pv[1], hipX, hipY, trot, m * kT, kT, out);
  const shN = tp(T.shN, st.pts.shN ??= [0, 0]), shF = tp(T.shF, st.pts.shF ??= [0, 0]), neck = tp(T.neck, st.pts.neck ??= [0, 0]), core = tp(T.core, st.pts.core ??= [0, 0]);
  st.pts.hip = st.pts.hip ?? [0, 0]; st.pts.hip[0] = hipX; st.pts.hip[1] = hipY;
  // ── 다리 (발 = 로직 걸음) ──
  const legs = st.pts.legs ??= [{}, {}];
  const leg = (i, far) => {
    const L = legs[i];
    const hx = far ? H.x - 16 : H.x + 18, fxl = far ? -30 + Math.sin(g0 + PI) * 16 * walk : 34 + Math.sin(g0) * 16 * walk;
    const lift = Math.max(0, Math.cos(far ? g0 + PI : g0)) * 10 * walk;
    W(b, fx, hx, H.y + 4, _a); L.hx = _a[0] + jx; L.hy = _a[1] + jy;
    W(b, fx, fxl, -6 - lift, _b);
    const Sh = far ? R.shin2 : R.shin, ks = k(Sh), Th = R.thigh, kt = k(Th);
    const l1 = (Th.bot[1] - Th.top[1]) * kt * 0.92, l2 = (Sh.ankle[1] - Sh.knee[1]) * ks, foot = (Sh.sole[1] - Sh.ankle[1]) * ks;
    ik2(L.hx, L.hy, _b[0], _b[1] - foot, l1, l2, fx, _e);
    L.kx = _e.ex; L.ky = _e.ey; L.ax = _e.hx; L.ay = _e.hy; L.far = far; L.Sh = Sh;
    return L;
  };
  const LB = leg(0, true), LF = leg(1, false);
  const drawLeg = (L) => {
    const far = L.far, Sh = L.Sh, ks = k(Sh), Th = R.thigh;
    D.rec = rec;
    limb(D, Th, V(Th, far), Th.top, Th.bot, L.hx, L.hy, L.kx, L.ky, m, k(Th), 0.75, 1.25);
    // 정강이+사바톤: 무릎에서 발목 방향으로 (크기 고정, 발끝은 앞)
    const vx = (Sh.ankle[0] - Sh.knee[0]) * m, vy = Sh.ankle[1] - Sh.knee[1];
    const rot = Math.atan2(L.ay - L.ky, L.ax - L.kx) - Math.atan2(vy, vx);
    D.rec = rec;
    D.part(Sh, V(Sh, far), 'knee', L.kx, L.ky, rot, m * ks, ks, 1);
  };
  // ── 팔 ──
  const drawArm = (sh, hand, far) => {
    const U = R.upper, Fi = R.fist, ku = k(U), kf = k(Fi);
    const l1 = (U.bot[1] - U.top[1]) * ku, l2 = (Fi.wrist[1] - Fi.hand[1]) * kf;
    ik2(sh[0], sh[1], hand[0], hand[1], l1 * 1.12, l2 * 1.12, -fx, _e);   // 팔꿈치는 아래·뒤로
    D.rec = rec;
    limb(D, U, V(U, far), U.top, U.bot, sh[0], sh[1], _e.ex, _e.ey, m, ku, 0.8, 1.35);
    D.rec = rec;
    limb(D, Fi, V(Fi, far), Fi.wrist, Fi.hand, _e.ex, _e.ey, hand[0], hand[1], m, kf, 0.8, 1.35);
  };
  // ── 할버드 (로직 G · hA) + 휘두름 잔상 ──
  const Hb = R.halberd, kh = k(Hb);
  const g = W(b, fx, G.x, G.y, st.pts.g ??= [0, 0]); g[0] += jx; g[1] += jy;
  const hrot = fx * b.hA;
  const tr = st.trail;
  tr.unshift(g[0], g[1], hrot); if (tr.length > 18) tr.length = 18;
  const av = Math.abs(b.hA - st.lastHA) / Math.max(dt, 1 / 120); st.lastHA = b.hA;
  // 열기 발광 (몸 전체) + 변신 폭주
  D.end();
  if (q.halos) {
    if (heat > 0.02) halo(ctx, core[0], core[1], 150, DFIRE, 0.1 * heat + 0.05 * Math.sin(t * 6) * heat);
    if (b.state === 'transform' || b.state === 'splitting') halo(ctx, core[0], core[1] - 20, 210, '#ff5a2a', 0.25 + 0.12 * Math.sin(t * 30));
  }
  // 뒤층: 먼 다리 → 먼 견갑 → 먼 팔
  drawLeg(LB);
  const Pd = R.pauldron, kp = k(Pd);
  D.rec = rec;
  D.part(Pd, V(Pd, true), 'sh', shF[0], shF[1] + 2, trot + fx * 0.15, m * kp * 0.92, kp * 0.92, 1);
  drawArm(shF, bh, true);
  // 앞 다리 · 허리 뒤 늘어진 힘줄 · 몸통 · 허리
  drawLeg(LF);
  D.rec = rec;
  D.part(T, V(T), 'hip', hipX, hipY, trot, m * kT, kT, 1);
  glowOver(ctx, D, T, lvl, 'hip', hipX, hipY, trot, m * kT, kT, 0.6 + heat * 0.4, st, t);
  guts(ctx, D, b, st, dt, hipX, hipY, fx, q, dying);
  const Wa = R.waist, kw = k(Wa);
  D.rec = rec;
  D.part(Wa, V(Wa), 'belt', hipX + fx * 3, hipY - 6, trot * 0.5 + Math.sin(t * 2) * 0.01, m * kw, kw * (1 + Math.sin(g0 * 2) * 0.01 * walk), 1);
  glowOver(ctx, D, Wa, lvl, 'belt', hipX + fx * 3, hipY - 6, trot * 0.5, m * kw, kw, 0.5 + heat * 0.4, st, t + 1);
  // 투구 (목 소켓 위, 약간 앞으로 숙임)
  const Hm = R.helm, khm = k(Hm) * 0.98;
  const hbob = Math.sin(t * 2) * 1.2;
  const hrotL = trot + fx * (-0.32 + tw * 0.08 + (b.state === 'transform' ? Math.sin(t * 25) * 0.03 : 0));
  if (!d.helmGone) {
    D.rec = rec;
    D.part(Hm, V(Hm), 'neck', neck[0] + fx * 2, neck[1] + 10 + hbob, hrotL, m * khm, khm, 1);
    glowOver(ctx, D, Hm, lvl, 'neck', neck[0] + fx * 2, neck[1] + 10 + hbob, hrotL, m * khm, khm, 0.6 + heat * 0.4, st, t + 2);
  }
  const eye = D.pt(Hm.neck[0], Hm.neck[1], Hm.eye[0], Hm.eye[1], neck[0] + fx * 2, neck[1] + 10 + hbob, hrotL, m * khm, khm, st.pts.eye ??= [0, 0]);
  // 발판 덧그리기 (BOSS_PIPELINE §8.11): 채색 몸통은 벡터보다 훨씬 커서 경기장 발판을 가린다 → 뒤층(다리·몸통·투구) 위에 발판을 다시 그리고
  //  공격 부위(할버드)와 앞 팔·앞 견갑은 발판 앞에 그린다
  if (q.ledges !== false) ledges(ctx, D, b.world, b.cx - 180, b.bottom - 400, b.cx + 180, b.bottom - 20);
  // 할버드 휘두름 잔상 (가산 발광 실루엣)
  if (q.smear && av > 5 && !dying) {
    const gi = Hb.v.glow, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 1; j < 5; j++) {
      const o = j * 3; if (tr.length < o + 3) break;
      D.img(gi, Hb.g[0], Hb.g[1], tr[o], tr[o + 1], tr[o + 2], fx * kh, kh, 0.22 / j * clamp((av - 5) / 8, 0, 1));
    }
    ctx.globalCompositeOperation = op;
  }
  D.rec = rec;
  D.part(Hb, V(Hb), 'g', g[0], g[1], hrot, fx * kh, kh, 1);
  glowOver(ctx, D, Hb, lvl, 'g', g[0], g[1], hrot, fx * kh, kh, 0.5 + heat * 0.5, st, t + 3);
  // 앞 팔 · 앞 견갑
  drawArm(shN, fh, false);
  D.rec = rec;
  D.part(Pd, V(Pd), 'sh', shN[0] + fx * 2, shN[1] + 4, trot - fx * 0.05 + Math.sin(t * 2.1) * 0.02, m * kp, kp, 1);
  glowOver(ctx, D, Pd, lvl, 'sh', shN[0] + fx * 2, shN[1] + 4, trot - fx * 0.05, m * kp, kp, 0.6 + heat * 0.4, st, t + 4);
  // 피격 섬광
  if (b.flashT > 0 && !dying) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.6);
  else { D.rec = false; D.log.length = 0; }
  D.end();
  // ── 발광 · 불꽃 ──
  const vis = clamp(b.visor ?? 0.3, 0, 2.5);
  if (!d.helmGone) {
    if (q.halos) halo(ctx, eye[0], eye[1], 12 + vis * 9, LAVA, 0.55 + vis * 0.18, true);
    if (vis > 1.1 && q.flames) flame(ctx, eye[0], eye[1], trot - fx * 0.2 + (fx > 0 ? 0 : PI), 18 + vis * 10, 5, t, LAVA, 0.35 + (vis - 1.1) * 0.3, 1, q.flames);
  }
  // 심장 박동: 흉갑 균열 속에서
  const bt = beat(t, 0.9 + heat * 0.8 + lvl * 0.2);
  if (q.halos) halo(ctx, core[0], core[1], 26 + bt * 16 + heat * 12, DFIRE, 0.28 + bt * 0.3 + heat * 0.2, true);
  // 관절·목 틈의 검붉은 불꽃 (열기)
  if (q.flames && (heat > 0.04 || b.state === 'transform')) {
    const fk = heat + (b.state === 'transform' ? 0.8 : 0);
    flame(ctx, neck[0], neck[1] + 4, -PI / 2 + trot, 22 + fk * 26, 8, t, DFIRE, 0.25 + fk * 0.3, 0, q.flames);
    flame(ctx, shN[0], shN[1] - 6, -PI / 2, 16 + fk * 18, 6, t, DFIRE, 0.18 + fk * 0.25, 3, Math.max(2, q.flames - 1));
    if (fk > 0.5) flame(ctx, hipX, hipY - 4, -PI / 2, 14 + fk * 14, 6, t, LAVA, 0.2 + fk * 0.15, 5, Math.max(2, q.flames - 2));
  }
  // 칼날 발광 (녹은 날)
  L_blade(ctx, D, Hb, g, hrot, fx, kh, _c);
  if (q.halos) halo(ctx, _c[0], _c[1], 36 + heat * 20, LAVA, 0.18 + heat * 0.2 + (av > 5 ? 0.15 : 0));
  // ── 입자 ──
  const amb = q.ambient;
  if (!dying) {
    if (hit) { P.burst('spark', core[0] + fx * 16, core[1], 10, { speed: 420 }); P.burst('blood', core[0], core[1], 6, { speed: 220, angle: -PI / 2, spread: 1.4, color: BLOOD, hi: BLOODHI }); P.burst('chip', core[0], core[1], 4, { speed: 260 }); }
    // 허리·투구 밑에서 떨어지는 피
    if (rr.next() < dt * (0.9 + lvl * 0.8 + heat) * amb) P.emit('blood', hipX + rr.range(-22, 22), hipY + rr.range(20, 46), 0, 0, { color: BLOOD, hi: BLOODHI, hang: rr.range(0.2, 0.6), layer: 1 });
    if (!d.helmGone && rr.next() < dt * (0.6 + lvl * 0.5) * amb) P.emit('blood', neck[0] + rr.range(-10, 10), neck[1] + 16, 0, 0, { color: BLOOD, hi: BLOODHI, hang: rr.range(0.2, 0.5), layer: 1 });
    if (rr.next() < dt * (2 + heat * 10) * amb) P.emit('ember', core[0] + rr.range(-40, 40), core[1] + rr.range(-60, 60), rr.range(-20, 20), rr.range(-90, -30), { color: rr.chance(0.5) ? LAVA : EMBER, layer: 1 });
    if (heat > 0.3 && rr.next() < dt * 2 * amb) P.emit('smoke', neck[0], neck[1] - 10, 0, -40, { color: '#1e0c0a', layer: 0 });
    if (av > 6 && rr.next() < dt * 40 * amb) P.emit('ember', _c[0], _c[1], rr.range(-60, 60), rr.range(-80, 20), { color: EMBER, layer: 1 });
    if (b.state === 'transform' && rr.next() < dt * 40 * amb) P.emit('ember', core[0] + rr.range(-60, 60), core[1] + rr.range(-90, 70), rr.range(-50, 50), rr.range(-200, -60), { color: DFIRE, layer: 1 });
    // 착지: 바닥 균열 불씨 (도약·내려찍기 — 로직이 흙먼지·충격파를 그린다)
    if (b.state === 'leap' && b.leapLanded && !st.landSeen) { st.landSeen = true; P.burst('chip', b.cx, b.A.floor - 4, 14, { speed: 380, angle: -PI / 2, spread: 1.2 }); P.burst('ember', b.cx, b.A.floor - 6, 16, { speed: 260, angle: -PI / 2, spread: 1.4, color: LAVA }); }
    if (b.state !== 'leap') st.landSeen = false;
  }
  st.asm = { hipX, hipY, trot, m, kT, shN, shF, neck, core, eye, g, hrot, LB, LF, hrotL, khm };
}
/** 월드 사각형 안의 한 방향 발판을 화면에 보이는 부분만 다시 그린다 */
function ledges(ctx, D, world, x0, y0, x1, y1) {
  const cam = world?.camera;
  D.end();
  if (cam) { x0 = Math.max(x0, cam.x); y0 = Math.max(y0, cam.y); x1 = Math.min(x1, cam.x + cam.vw); y1 = Math.min(y1, cam.y + cam.vh); }
  if (x1 > x0 && y1 > y0) ledgesOver(ctx, world, x0, y0, x1, y1);
}
const _bl = [0, 0];
function L_blade(ctx, D, Hb, g, hrot, fx, kh, out) { return D.pt(Hb.g[0], Hb.g[1], Hb.blade[0], Hb.blade[1] - 30, g[0], g[1], hrot, fx * kh, kh, out); }

/** 허리 밑으로 늘어진 피 묻은 힘줄 (verlet) */
function guts(ctx, D, b, st, dt, hipX, hipY, fx, q, dying) {
  if (dying && (b.deathT ?? 0) > 0.9) return;
  const n = q.strands > 0 ? Math.max(1, Math.round(st.guts.length * q.strands)) : 0;
  D.end();
  for (let i = 0; i < n; i++) {
    const sd = st.guts[i];
    sd.wx = -b.vx * 3;
    sd.step(dt, hipX + fx * (i - 1) * 12, hipY + 26 + i * 3);
    drawStrand(ctx, sd, 3.4 - i * 0.5, ['#140203', '#6a0a10', q.name === 'high' ? '#d0504a' : null]);
  }
}

// ───────────────────────── 분리 형태 ─────────────────────────
function drawSplit(ctx, D, b, rig, st, dt, lvl, fx, hit, dying, dT) {
  const R = rig.parts, P = st.P, q = st.q, t = b.t, c = b.pc, d = st.d;
  const V = (p, deep = false) => pickVariant(p, lvl, deep, null);
  const heat = clamp(b.heat ?? 0, 0, 1), m = -fx, rec = b.flashT > 0 && !dying;
  const k = (p) => p.k * SC;
  const shake = (st.jolt > 0 ? st.jolt * 3 : 0) + (dying ? 2.5 * clamp(1 - dT, 0, 1) : 0);
  const cx = b.cx + (shake ? (rr.next() - 0.5) * shake : 0), cy = b.cy - 4 + (shake ? (rr.next() - 0.5) * shake : 0);
  const pa = dying ? clamp(1 - (dT - 1.6) / 0.7, 0, 1) : 1;       // 떨어진 부품이 사라짐
  const T = R.torso, kT = k(T) * 0.98, trot = fx * (Math.sin(t * 1.6) * 0.05 + (b.vx ?? 0) / 2400);
  const tp = (pv, out) => D.pt(T.core[0], T.core[1], pv[0], pv[1], cx, cy, trot, m * kT, kT, out);
  const shN = tp(T.shN, st.pts.shN ??= [0, 0]), shF = tp(T.shF, st.pts.shF ??= [0, 0]), neck = tp(T.neck, st.pts.neck ??= [0, 0]), hip = tp(T.hip, st.pts.hip ??= [0, 0]);
  const bt = beat(t, 1.3 + heat * 0.6 + lvl * 0.3);
  const coreOn = !d.coreGone;
  // 조각 배치 (로직 pc) — 투구 목 · 건틀릿 손목 · 할버드 손잡이 (힘줄 끝)
  const Hm = R.helm, khm = k(Hm) * 0.98, Gb = R.gblade, Gc = R.gclaw, Hb = R.halberd, kh = k(Hb), kg = k(Gb) * 1.15;
  const hRot = fx * (c.helm.a - 0.32);
  const hn = D.pt(Hm.c[0], Hm.c[1], Hm.neck[0], Hm.neck[1], c.helm.x, c.helm.y, hRot, m * khm, khm, st.pts.hn ??= [0, 0]);
  const gRot = (pc) => fx * pc.a + fx * PI / 2;
  const wF = D.pt(Gb.hand[0], Gb.hand[1], Gb.wrist[0], Gb.wrist[1], c.gF.x, c.gF.y, gRot(c.gF), fx * kg, kg, st.pts.wF ??= [0, 0]);
  const wB = D.pt(Gc.hand[0], Gc.hand[1], Gc.wrist[0], Gc.wrist[1], c.gB.x, c.gB.y, gRot(c.gB), fx * kg, kg, st.pts.wB ??= [0, 0]);
  D.end();
  // 발광 · 추진 불꽃 (핵 아래로)
  if (q.halos && coreOn) halo(ctx, cx, cy, 170, '#5a0a08', 0.55);
  if (q.flames && coreOn) flame(ctx, hip[0], hip[1] + 20, PI / 2, 70 + Math.sin(t * 4) * 10, 17, t, DFIRE, 0.45 + heat * 0.2, 0, q.flames);
  // 힘줄 (핵 ↔ 떠다니는 조각): 멀리 날아가면(로켓) 끊어져 사라진다
  if (coreOn && !(dying && dT > 0.9)) {
    const link = (ax, ay, bx, by, w, seed) => { const dd = Math.hypot(bx - ax, by - ay), a = clamp((380 - dd) / 120, 0, 1); tendril(ctx, ax, ay, bx, by, w, clamp(60 - dd * 0.12, 8, 50), t, seed, a); };
    link(neck[0], neck[1], hn[0], hn[1], 10, 0.3);
    link(shF[0], shF[1], wB[0], wB[1], 8, 1.1);
    link(hip[0] - fx * 10, hip[1] - 20, c.hal.x, c.hal.y, 7, 2.2);
  }
  // 할버드 (뒤) — 회전 잔상
  const spin = Math.abs(c.hal.spin ?? 0);
  if (q.smear && spin > 8 && !dying) {
    const gi = Hb.v.glow, op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    for (let j = 1; j < 4; j++) D.img(gi, Hb.g[0], Hb.g[1], c.hal.x, c.hal.y, fx * (c.hal.a - j * 0.22 * Math.sign(c.hal.spin || 1)), fx * kh, kh, 0.2 / j * pa);
    ctx.globalCompositeOperation = op;
  }
  if (q.halos) halo(ctx, c.hal.x, c.hal.y, 50, DFIRE, (0.3 + heat * 0.2) * pa);
  D.rec = rec;
  D.part(Hb, V(Hb), 'g', c.hal.x, c.hal.y, fx * c.hal.a, fx * kh, kh, pa);
  // 뒤 건틀릿 (발톱)
  gauntlet(ctx, D, b, st, Gc, V(Gc, true), c.gB, gRot(c.gB), fx, kg, rec, pa, dt, t, q);
  // 핵: 먼 견갑 → 심장(흉갑 밑으로 늘어져 뛴다) → 흉갑 → 가까운 견갑
  if (coreOn) {
    const Pd = R.pauldron, kp = k(Pd);
    D.rec = rec;
    D.part(Pd, V(Pd, true), 'sh', shF[0], shF[1] + 2, trot + fx * 0.3, m * kp * 0.92, kp * 0.92, 1);
    const Ht = R.heart, kht = k(Ht) * (1.38 + bt * 0.1), hsq = 1 - bt * 0.05;
    D.rec = rec;
    D.part(Ht, V(Ht), 'top', hip[0] - fx * 4, hip[1] - 34, trot * 0.6 + Math.sin(t * 1.3) * 0.05, m * kht, kht * hsq, 1);
    glowOver(ctx, D, Ht, lvl, 'top', hip[0] - fx * 4, hip[1] - 34, trot * 0.6, m * kht, kht * hsq, 0.7, st, t + 5);
    D.rec = rec;
    D.part(T, V(T), 'core', cx, cy, trot, m * kT, kT, 1);
    glowOver(ctx, D, T, lvl, 'core', cx, cy, trot, m * kT, kT, 0.8 + heat * 0.3, st, t);
    D.rec = rec;
    D.part(Pd, V(Pd), 'sh', shN[0] + fx * 2, shN[1] + 4, trot - fx * 0.2, m * kp, kp, 1);
    D.end();
    D.pt(Ht.top[0], Ht.top[1], Ht.c[0], Ht.c[1], hip[0] - fx * 4, hip[1] - 34, trot * 0.6, m * kht, kht * hsq, _c);
    if (q.halos) halo(ctx, _c[0], _c[1] + 6, 30 + bt * 26, DFIRE, 0.3 + bt * 0.45, true);
    // 발판 덧그리기 (§8.11): 떠 있는 핵(흉갑·심장)은 발판 뒤, 투구·앞 건틀릿(공격 부위)은 발판 앞
    if (q.ledges !== false) ledges(ctx, D, b.world, cx - 170, cy - 130, cx + 170, cy + 150);
    // 앞 건틀릿으로 가는 힘줄은 흉갑 앞에
    if (!(dying && dT > 0.9)) { const dd = Math.hypot(wF[0] - shN[0], wF[1] - shN[1]); tendril(ctx, shN[0], shN[1], wF[0], wF[1], 8, clamp(60 - dd * 0.12, 8, 50), t, 3.3, clamp((380 - dd) / 120, 0, 1)); }
  }
  // 투구 (면갑 불길)
  const vis = clamp(b.visor ?? 1, 0, 2.5);
  if (q.halos) halo(ctx, c.helm.x, c.helm.y, 44, DFIRE, (0.25 + heat * 0.2) * pa);
  D.rec = rec;
  D.part(Hm, V(Hm), 'c', c.helm.x, c.helm.y, hRot, m * khm, khm, pa);
  glowOver(ctx, D, Hm, lvl, 'c', c.helm.x, c.helm.y, hRot, m * khm, khm, (0.6 + heat * 0.4) * pa, st, t + 2);
  const eye = D.pt(Hm.c[0], Hm.c[1], Hm.eye[0], Hm.eye[1], c.helm.x, c.helm.y, hRot, m * khm, khm, st.pts.eye ??= [0, 0]);
  // 앞 건틀릿 (칼날) — 로켓 주먹
  gauntlet(ctx, D, b, st, Gb, V(Gb), c.gF, gRot(c.gF), fx, kg, rec, pa, dt, t, q);
  if (b.flashT > 0 && !dying) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.6);
  else { D.rec = false; D.log.length = 0; }
  D.end();
  if (pa > 0.05) {
    if (q.halos) halo(ctx, eye[0], eye[1], 12 + vis * 9, LAVA, (0.55 + vis * 0.18) * pa, true);
    if (q.flames && (b.state === 'helmFire' || vis > 1.6)) flame(ctx, eye[0], eye[1], hRot + (fx > 0 ? 0 : PI), 20 + vis * 12, 6, t, LAVA, 0.5 * pa, 2, q.flames);
  }
  // 입자: 심장에서 피, 불씨
  const amb = q.ambient;
  if (!dying && coreOn) {
    if (hit) { P.burst('spark', cx + fx * 12, cy, 10, { speed: 420 }); P.burst('blood', hip[0], hip[1], 7, { speed: 240, angle: -PI / 2, spread: 1.4, color: BLOOD, hi: BLOODHI }); }
    if (rr.next() < dt * (2.2 + lvl + bt * 3) * amb) P.emit('blood', hip[0] + rr.range(-18, 18), hip[1] + rr.range(30, 60), rr.range(-10, 10), 0, { color: BLOOD, hi: BLOODHI, hang: rr.range(0.05, 0.3), layer: 1 });
    if (rr.next() < dt * 8 * amb) P.emit('ember', hip[0] + rr.range(-20, 20), hip[1] + 40, rr.range(-30, 30), rr.range(40, 120), { color: rr.chance(0.5) ? LAVA : DFIRE, layer: 0 });
  }
  st.spl = { cx, cy, trot, m, kT, hip, shN, shF, hRot, khm, kg, kh };
}
/** 떠다니는 건틀릿 한 짝: 발사 중이면 뒤로 불꽃 분사 + 잔상 */
function gauntlet(ctx, D, b, st, part, img, pc, rot, fx, kg, rec, a, dt, t, q) {
  const sp = Math.hypot(pc.vx ?? 0, pc.vy ?? 0);
  const fire = pc.busy && !pc.fixed && sp > 300;
  D.end();
  if (q.halos) halo(ctx, pc.x, pc.y, 40, DFIRE, (0.28 + (fire ? 0.4 : 0)) * a);
  if (fire && q.flames) {
    const ang = Math.atan2(-(pc.vy ?? 0), -(pc.vx ?? 0));
    flame(ctx, pc.x + Math.cos(ang) * 14, pc.y + Math.sin(ang) * 14, ang, 60, 12, t, DFIRE, 0.65 * a, 4, q.flames);
    if (rr.next() < dt * 50 * q.ambient) st.P.emit('ember', pc.x, pc.y, Math.cos(ang) * 120 + rr.range(-40, 40), Math.sin(ang) * 120 + rr.range(-40, 40), { color: LAVA, layer: 1 });
  } else if (pc.busy && q.flames && b.state === 'rocket') {
    const ang = rot + PI / 2;   // 조준 중: 손목 뒤로 작은 불꽃 (스프라이트 위쪽 = 주먹 앞 → 뒤는 rot + 90°)
    flame(ctx, pc.x + Math.cos(ang) * 22, pc.y + Math.sin(ang) * 22, ang, 26, 7, t, DFIRE, 0.4 * a, 6, Math.max(2, q.flames - 1));
  }
  D.rec = rec;
  D.part(part, img, 'hand', pc.x, pc.y, rot, fx * kg, kg, a);
}
function splitBurst(st, rig, b) {
  const P = st.P, R = rig.parts, x = b.cx, y = b.cy;
  P.burst('blood', x, y, 24, { speed: 420, spread: 3.1, color: BLOOD, hi: BLOODHI });
  P.burst('ember', x, y, 30, { speed: 320, color: LAVA });
  P.burst('chip', x, y, 14, { speed: 420 });
  for (let i = 0; i < 6; i++) {
    const p = R['deb' + (i % 9)], a = -PI / 2 + (rr.next() - 0.5) * 2.6, sp = rr.range(260, 520);
    st.shards.spawn(p.v.base, p.c[0], p.c[1], x, y, rr.next() * TAU, p.k * SC * rr.sign(), p.k * SC, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-9, 9), { r: (p.r ?? 8) * 0.7, fade: 2.2 });
  }
}

// ───────────────────────── 사망 붕괴 ─────────────────────────
function death(ctx, D, b, rig, st, dt, dT, fx, lvl) {
  const R = rig.parts, P = st.P, d = st.d, fade = 2.35 - dT;
  const V = (p, deep = false) => pickVariant(p, 2, deep, null);
  const k = (p) => p.k * SC;
  if (!d.burst && dT > 0.3) {
    d.burst = true;
    const x = b.split ? b.cx : b.cx, y = b.split ? b.cy : b.bottom - 150;
    b.world?.fx?.ring?.(x, y, { color: DFIRE, r0: 10, r1: 230, life: 0.5, width: 8 });
    P.burst('ember', x, y, 36, { speed: 320, color: LAVA });
    P.burst('blood', x, y, 16, { speed: 360, angle: -PI / 2, spread: 1.5, color: BLOOD, hi: BLOODHI });
  }
  if (!b.split) {
    const A = st.asm; if (!A) return;
    // 0.35 s: 투구가 튕겨 나가고 목에서 피가 솟는다
    if (!d.helmGone && dT > 0.35) {
      d.helmGone = true;
      const Hm = R.helm;
      st.shards.spawn(V(Hm), Hm.neck[0], Hm.neck[1], A.neck[0], A.neck[1] + 10, A.hrotL, A.m * A.khm, A.khm, -fx * rr.range(80, 200), -560, -fx * 4, { r: 26, fade, bounce: 0.35 });
      P.burst('blood', A.neck[0], A.neck[1], 20, { speed: 420, angle: -PI / 2, spread: 0.5, color: BLOOD, hi: BLOODHI });
    }
    if (d.helmGone && !d.gone && rr.next() < dt * 30) P.emit('blood', A.neck[0], A.neck[1], rr.range(-60, 60), rr.range(-320, -160), { color: BLOOD, hi: BLOODHI, layer: 1 });
    // 0.9 s: 갑옷이 무너져 조각나고 심장이 터진다
    if (!d.gone && dT > 0.9) {
      d.gone = true;
      const sp = (p, img, pv, x, y, rot, sx, sy, r) => st.shards.spawn(img, pv[0], pv[1], x, y, rot, sx, sy, rr.range(-140, 140), rr.range(-260, -40), rr.range(-5, 5), { r, fade, bounce: 0.3 });
      sp(R.torso, V(R.torso), R.torso.hip, A.hipX, A.hipY, A.trot, A.m * A.kT, A.kT, 34);
      sp(R.waist, V(R.waist), R.waist.belt, A.hipX, A.hipY - 6, A.trot * 0.5, A.m * k(R.waist), k(R.waist), 30);
      sp(R.halberd, V(R.halberd), R.halberd.g, A.g[0], A.g[1], A.hrot, fx * k(R.halberd), k(R.halberd), 20);
      sp(R.pauldron, V(R.pauldron), R.pauldron.sh, A.shN[0], A.shN[1], A.trot, A.m * k(R.pauldron), k(R.pauldron), 22);
      sp(R.pauldron, V(R.pauldron, true), R.pauldron.sh, A.shF[0], A.shF[1], A.trot, A.m * k(R.pauldron) * 0.92, k(R.pauldron) * 0.92, 22);
      for (const L of [A.LB, A.LF]) {
        sp(L.Sh, V(L.Sh, L.far), L.Sh.knee, L.kx, L.ky, 0, A.m * k(L.Sh), k(L.Sh), 22);
        sp(R.thigh, V(R.thigh, L.far), R.thigh.top, L.hx, L.hy, 0, A.m * k(R.thigh), k(R.thigh), 14);
      }
      for (const [sh, far] of [[A.shN, false], [A.shF, true]]) { sp(R.upper, V(R.upper, far), R.upper.top, sh[0], sh[1], 0, A.m * k(R.upper), k(R.upper), 10); sp(R.fist, V(R.fist, far), R.fist.wrist, sh[0], sh[1] + 30, 0, A.m * k(R.fist), k(R.fist), 12); }
      const Ht = R.heart;
      st.shards.spawn(V(Ht), Ht.c[0], Ht.c[1], A.core[0], A.core[1], 0, A.m * k(Ht), k(Ht), fx * rr.range(40, 140), -300, rr.range(-3, 3), { r: 20, fade, bounce: 0.2 });
      P.burst('blood', A.core[0], A.core[1], 30, { speed: 420, spread: 3.1, color: BLOOD, hi: BLOODHI });
      P.burst('ember', A.core[0], A.core[1], 30, { speed: 300, color: DFIRE });
      P.burst('smoke', A.hipX, A.hipY, 10, { speed: 80, jitter: 40, color: '#1e0c0a' });
    }
  } else {
    const A = st.spl; if (!A) return;
    // 0.9 s: 심장이 터지고 흉갑·견갑이 떨어진다 (떠다니던 조각은 로직이 바닥으로 떨어뜨린다)
    if (!d.coreGone && dT > 0.9) {
      d.coreGone = true;
      const T = R.torso, Pd = R.pauldron, Ht = R.heart;
      st.shards.spawn(V(T), T.core[0], T.core[1], A.cx, A.cy, A.trot, A.m * A.kT, A.kT, rr.range(-100, 100), -200, rr.range(-3, 3), { r: 34, fade, bounce: 0.3 });
      st.shards.spawn(V(Pd), Pd.sh[0], Pd.sh[1], A.shN[0], A.shN[1], A.trot, A.m * k(Pd), k(Pd), fx * 160, -260, fx * 4, { r: 22, fade });
      st.shards.spawn(V(Pd, true), Pd.sh[0], Pd.sh[1], A.shF[0], A.shF[1], A.trot, A.m * k(Pd) * 0.92, k(Pd) * 0.92, -fx * 160, -240, -fx * 4, { r: 22, fade });
      st.shards.spawn(V(Ht), Ht.top[0], Ht.top[1], A.hip[0], A.hip[1] - 34, 0, A.m * k(Ht) * 1.2, k(Ht) * 1.2, 0, -120, rr.range(-2, 2), { r: 26, fade, bounce: 0.15 });
      P.burst('blood', A.hip[0], A.hip[1], 40, { speed: 460, spread: 3.1, color: BLOOD, hi: BLOODHI });
      P.burst('ember', A.hip[0], A.hip[1], 30, { speed: 300, color: DFIRE });
      b.world?.fx?.ring?.(A.hip[0], A.hip[1], { color: '#ff4a2a', r0: 10, r1: 170, life: 0.4, width: 6 });
    }
    if (dT > 1.2 && rr.next() < dt * 12) P.emit('smoke', b.cx + rr.range(-80, 80), b.A.floor - 20, 0, -30, { color: '#1e0c0a', layer: 1 });
  }
}
