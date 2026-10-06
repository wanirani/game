// 카론 / 사신의 마부 (b_charon) — 채색 컷아웃 퍼핏 렌더러 (EX5-BOSS, docs/specs/ex_s25.md §2.2)
// 부품 (Kling, tools/painted/prompts/ex5-boss.mjs · configs/b_charon.json):
//   영구 마차 — 옆모습 마차(coach_a, 앞 = 오른쪽): 상자 몸통(가까운 바퀴 · 먼 바퀴 · 지붕 관 · 걸이 등불은 잘라 냄) · 마부석 앞판(마부 다리 앞) · 끌채 둘
//   소품 — 살바퀴 한 장(가까운 둘 · 먼 둘 모두 돌린다, 먼 것은 deep) · 녹청 등불(마차 걸이 · 2페이즈 손) · 관(지붕 roofN · 떨구기는 로직 지대가 그린다) ·
//          은화 · 채찍 손잡이(끈은 로직 점을 잇는 벡터 마디) · 탄 명부 · 파편 둘(금테 판자 · 상자 문짝)
//   마부 — 서 있는 옆모습(coachman_a 거울상: 모자 머리 · 소매 위/아래 + 뼈 손, coachman_b = 팔을 외투 결로 메운 것: 겹망토 몸통 · 앞자락 · 뒷자락) +
//          다리(limbs_a 거울상: 바지 허벅지 · 승마 장화)
// 말 둘은 그리지 않는다 — 로직의 drawHorses()(벡터 탈것 리그 render/mounts.js, id mt_morgen)를 그 자리에서 부른다 (명세 §2 '말 그리기', 0 Kling · 0 아틀라스).
// 움직임은 전부 로직(src/game/bosses/e_charon.js)의 값을 읽기만 한다:
//   boss { zx, fy, fk, facing, coach, broke, tilt, pivot, joltY, wA, roofN, lanK, lanUp, lanBroken, lanOutT, man, O, oRot, ps{…}, pts{hip,neck,head,eye,hatB,shN/shF,
//          elN/elF,hdN/hdF,knN/knF,ftN/ftF,lan,tA,hA,lanA}, whip[10], chain[10], tails[2][5], whipMode, chainMode, crack, stunned, exposed, cWin, cWinG, dieT, vanishK,
//          horsesOn, hFree, state, t, flashT, hitPart, A.floor }
// 상태별 표현: 마차 대기(바퀴가 굴러간 거리만큼 돈다 · 말 걸음) · 질주(말 질주 · 먼지) · 덜컹(joltY) · 등불 부풂/꺼짐 · 채찍(벡터 끈) · 마부석의 마부(앉음) ·
//   무릎(마차가 기울고 마부가 고꾸라짐) · 전환(말이 풀려 내달림 → 마차가 앞으로 기울어 부서짐: 파편 둘·관이 강체로 튐 → 마부가 잔해에서 일어섬) ·
//   서 있는 마부(걷기 · 등불 · 고삐 사슬 · 무릎 · 주저앉음 · 15% 나동그라짐) · 손상 0–2 · 피격 섬광(맞은 부위만) · 쓰러짐(주저앉음 → 재와 혼불, 아케이드는 3초에 사라짐)
// 빈 영구차(마차 혼)는 로직이 구운 실루엣 비트맵을 지대에서 그린다 — 퍼핏을 두 번 그리지 않는다 (명세 §2.1).
// 좌표: 마차 = 마차 지역 (원점 zx, fy+joltY, 좌우 fk, 기울기 tilt 는 pivot 둘레) · 마부 = 마부 지역 (원점 O, 좌우 fk, 틀 회전 oRot) — 로직과 같다
import { Drawer, Particles, Shards, halo, rr, loadRig, pickVariant, quality, QUALITY } from '../kit.js';

const DIR = 'painted/bosses/b_charon';
const PI = Math.PI;
const SOUL = '#7dffb0', GOLD = '#c8a050', ASH = 'rgba(184,180,176,0.8)', EMBER = '#ffb060';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);
// 로직과 같은 마차 자리 (e_charon.js SEAT · LANT · WHL · H1)
const LANT = { x: 75, y: -146 }, WHL = [{ x: -60, y: -42, r: 40 }, { x: 91, y: -31, r: 31 }], H1X = 176, HS = 1.25;
const ROOF = [[-6, -160, 1], [-22, -171, 0.8], [18, -180, 0.66]];   // 지붕 관 자리 (마차 지역 x, y, 크기)
const DEF = {
  glow: '#7dffb0',
  outline: { width: 1.2, color: 'rgba(6,4,8,0.9)' },
  parts: {
    coach: { flash: true, cracks: 3, char: 0.2, holes: 0, crackMinLum: 30 },
    dash: { flash: true, cracks: 1, char: 0.1, holes: 0 },
    shafts: { noDmg: true, deep: 0.6 },
    wheel: { flash: true, noDmg: true, deep: 0.55 },
    lantern: { noDmg: true, outline: 0.8, deep: 0.5 },
    coffin: { noDmg: true, outline: 0.9 },
    coin: { noDmg: true, outline: 0.6 },
    whipH: { noDmg: true, outline: 0.6 },
    ledger: { noDmg: true, outline: 0.6 },
    head: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 60 },
    torso: { flash: true, cracks: 2, char: 0.2, holes: 0, crackMinLum: 30 },
    skirt: { flash: true, cracks: 2, char: 0.2, holes: 1, crackMinLum: 30 },
    tail: { flash: true, noDmg: true, deep: 0.6 },
    armU: { flash: true, cracks: 1, char: 0.1, holes: 0, deep: 0.55 },
    armF: { flash: true, cracks: 1, char: 0.1, holes: 0, deep: 0.55 },
    thigh: { flash: true, noDmg: true, deep: 0.55 },
    shin: { flash: true, noDmg: true, deep: 0.55 },
  },
  prefix: { debA: { noDmg: true, outline: 0.8 }, debB: { noDmg: true, outline: 0.8 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_charon', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return { D: new Drawer(), P: new Particles(q.particles), shards: new Shards(24), q, lt: null, pf: 0, fp: null, jolt: 0, brk: -9, lanOut: -9, lvl: 0, W: [0, 0], E: [0, 0], H: [0, 0], ff: {}, ashAcc: 0, eye: null };
  },
  draw(ctx, boss, world, rig, st) { drawBoss(ctx, boss, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.zx ?? b.cx, Y = b.fy ?? b.bottom, f = b.facing ?? 1;
    let x0, x1;
    if (b.coach || b.horsesOn) { const ext = 284 + (b.hRun ?? 0); x0 = f > 0 ? X - 170 : X - ext; x1 = f > 0 ? X + ext : X + 170; }
    else { x0 = X - 200; x1 = X + 200; }
    let y0 = Y - 300, y1 = Y + 30;
    if (b.chainMode === 'lash') { if (f > 0) x1 = Math.max(x1, X + 9 * 48 + 80); else x0 = Math.min(x0, X - 9 * 48 - 80); }
    if (b.whipMode === 'crack' && b.crack) { const c = b.toWorldM(b.crack.x, b.crack.y, { x: 0, y: 0 }); x0 = Math.min(x0, c.x - 40); x1 = Math.max(x1, c.x + 40); y0 = Math.min(y0, c.y - 40); }
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 30 < x0) x0 = px - 30; if (px + 30 > x1) x1 = px + 30; if (py - 30 < y0) y0 = py - 30; if (py + 30 > y1) y1 = py + 30; }
    if (st?.shards?.list.length) for (const s of st.shards.list) { if (s.x - 40 < x0) x0 = s.x - 40; if (s.x + 40 > x1) x1 = s.x + 40; if (s.y - 40 < y0) y0 = s.y - 40; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    if (st.flashL > 0.05) L.add(st.flashW?.[0] ?? b.zx, st.flashW?.[1] ?? b.fy - 80, 180, SOUL, st.flashL * 0.7);
  },
  /** 월드 파편(spawnDebris)용 채색 조각 — 나무 파편 둘 */
  debris(i, rig) {
    const names = Object.keys(rig.parts).filter((n) => n.startsWith('deb')); if (!names.length) return null;
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
  st.lvl = b.coach ? (hk < 0.75 ? 1 : 0) : (hk < 0.25 ? 2 : 1);
  // 피격 부위 고정 (섬광이 다시 켜진 프레임의 b.hitPart)
  if (b.flashT > st.pf + 1e-4) st.fp = b.hitPart ?? null;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 7);
  st.flashL = Math.max(0, (st.flashL ?? 0) - dt * 2.5);
  const fOn = b.flashT > 0 && !dying, fp = st.fp, ff = st.ff;
  ff.man = fOn && (!fp || fp === b.pMan || fp === b.pHead);
  ff.body = fOn && (!fp || fp === b.pBody || fp === b.pTorso || fp === b.pLan);
  ff.wheel = fOn && (!fp || fp === b.pWheelR || fp === b.pWheelF);
  ff.legs = fOn && (!fp || fp === b.pSkirt);
  if (b.state === 'intro' || (b.hp >= b.stats.maxHp && !dying)) { st.shards.clear(); st.brk = b.broke; }
  // 마차가 부서진 순간 (로직 broke 가 바뀐 프레임) → 파편 둘 · 관 · 바퀴가 강체로 튄다
  if (b.broke > 0 && b.broke !== st.brk) { st.brk = b.broke; wreck(b, rig, st); }
  // 등불이 꺼진 순간 → 녹청 불티
  if (b.lanOutT > 0 && b.lanOutT !== st.lanOut) { st.lanOut = b.lanOutT; const L = b.lanternW({ x: 0, y: 0 }); P.burst('spark', L.x, L.y, 12, { speed: 240, color: SOUL }); st.flashL = 0.8; st.flashW = [L.x, L.y]; }
  const bodyA = 1 - (b.vanishK ?? 0);
  const ga = ctx.globalAlpha;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  P.draw(ctx, 0);
  if (bodyA > 0.01) {
    ctx.globalAlpha = ga * bodyA;
    const fk = Math.abs(b.fk) < 0.02 ? 0.02 * Math.sign(b.fk || 1) : b.fk;
    const jr = st.jolt ? (rr.next() - 0.5) * 0.03 * st.jolt : 0;
    // ── 1) 마차 뒤쪽: 먼 말 · 먼 바퀴 · 상자 · 지붕 관 ──
    if (b.coach || b.horsesOn) {
      D.begin(ctx); D.save();
      ctx.translate(b.zx, b.fy + (b.joltY ?? 0)); ctx.scale(fk, 1);
      if (b.horsesOn) b.drawHorses(ctx, world, 'far');
      if (b.coach) {
        coachFrame(ctx, b); D.begin(ctx);
        D.rec = false; D.log.length = 0;
        coachBack(D, R, b, st, ff, jr);
        if (fOn) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.6); else { D.rec = false; D.log.length = 0; }
      }
      D.restore();
    }
    // ── 2) 마부 (자기 틀) ──
    D.begin(ctx); D.save();
    ctx.translate(b.O.x, b.O.y); ctx.scale(fk, 1); if (b.oRot) ctx.rotate(b.oRot);
    const tb = b.ps?.tumble ?? 0;
    if (tb > 0.01) { ctx.translate(-10, 0); ctx.rotate(-0.5 * tb); ctx.translate(10, 0); }
    D.begin(ctx);
    D.rec = false; D.log.length = 0;
    man(D, ctx, R, b, st, ff, jr, t);
    if (fOn) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.6);
    else { D.rec = false; D.log.length = 0; }
    D.end();
    eyes(ctx, b, st, q, t);
    D.restore();
    // ── 3) 마차 앞쪽: 앞판 · 가까운 바퀴 · 등불 · 끌채 · 가까운 말 · 고삐 ──
    if (b.coach || b.horsesOn) {
      D.begin(ctx); D.save();
      ctx.translate(b.zx, b.fy + (b.joltY ?? 0)); ctx.scale(fk, 1);
      if (b.coach) {
        ctx.save(); coachFrame(ctx, b); D.begin(ctx);
        D.rec = false; D.log.length = 0;
        coachFront(D, ctx, R, b, st, ff, t);
        if (fOn) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.6); else { D.rec = false; D.log.length = 0; }
        ctx.restore(); D.begin(ctx);
        if (!b.hFree) shafts(D, R, b);
        D.end();
      }
      if (b.horsesOn) { b.drawHorses(ctx, world, 'near'); if (b.coach && !b.hFree) reins(ctx, b); }
      D.restore();
    }
    ctx.globalAlpha = ga;
  }
  // ── 월드: 강체 조각 · 입자 ──
  D.begin(ctx);
  st.shards.draw(D);
  D.end();
  if (b.lanUp && !dying && q.halos) { const L = b.lanternW({ x: 0, y: 0 }); halo(ctx, L.x, L.y, 26 + 20 * (b.lanK ?? 0), SOUL, 0.25 + 0.2 * (b.lanK ?? 0) + 0.1 * Math.sin(t * 10)); }
  ambient(P, b, st, dt, q, hit, t, bodyA);
  P.draw(ctx, 1);
  ctx.globalAlpha = ga;
  ctx.imageSmoothingQuality = q0;
}
/** 마차 기울기 (pivot 둘레) — 마차 지역 틀 안에서 */
function coachFrame(ctx, b) {
  if (!b.tilt) return;
  ctx.translate(b.pivot.x, b.pivot.y); ctx.rotate(b.tilt); ctx.translate(-b.pivot.x, -b.pivot.y);
}

// ───────────────────────── 마차 ─────────────────────────
function wheelAt(D, R, x, y, r, a, deep, lvl) {
  const p = R.wheel; if (!p) return;
  const s = p.k * r / 40;
  D.part(p, pickVariant(p, 0, deep, null), 'c', x, y, a, s, s);
}
function coachBack(D, R, b, st, ff, jr) {
  const wa = b.wA ?? 0, a1 = wa * WHL[0].r / WHL[1].r;
  // 먼 바퀴 둘 (deep) — 가까운 바퀴 뒤로 살짝 비켜서
  D.rec = ff.wheel;
  wheelAt(D, R, WHL[0].x - 5, WHL[0].y - 2, WHL[0].r * 0.94, wa + 0.3, true);
  wheelAt(D, R, WHL[1].x - 5, WHL[1].y - 2, WHL[1].r * 0.94, a1 + 0.3, true);
  D.rec = false;
  // 지붕 관 (roofN)
  const c = R.coffin;
  if (c) for (let i = 0; i < Math.min(3, b.roofN ?? 0); i++) { const [x, y, s] = ROOF[i]; D.part(c, c.v.base, 'c', x, y, 0, c.k * s, c.k * s); }
  // 상자 몸통 (마부석 포함)
  const p = R.coach;
  D.rec = ff.body;
  if (p) D.part(p, pickVariant(p, st.lvl, false, null), 'o', 0, 0, jr * 0.3, p.k, p.k);
  D.rec = false;
}
function coachFront(D, ctx, R, b, st, ff, t) {
  const wa = b.wA ?? 0, a1 = wa * WHL[0].r / WHL[1].r;
  // 앞판 (마부 다리 앞)
  const d = R.dash; if (d) D.part(d, pickVariant(d, st.lvl, false, null), 'o', 0, 0, 0, d.k, d.k);
  // 가까운 바퀴 둘
  D.rec = ff.wheel;
  wheelAt(D, R, WHL[0].x, WHL[0].y, WHL[0].r, wa, false);
  wheelAt(D, R, WHL[1].x, WHL[1].y, WHL[1].r, a1, false);
  D.rec = false;
  // 걸이 등불 (부풀면 커지고, 꺼지면 어둡다)
  const L = R.lantern; if (!L) return;
  const out = b.lanBroken && t - b.lanOutT < 2.5, k = b.lanK ?? 0, s = L.k * (1 + 0.25 * k);
  D.rec = ff.body && st.fp === b.pLan;
  D.part(L, pickVariant(L, 0, out, null), 'ring', LANT.x, LANT.y, Math.sin(t * 2.4) * 0.05, s, s);
  D.rec = false;
}
/** 끌채 둘: 상자 앞에서 가까운 말의 옆구리로 (마차 기울기와 무관 — 말 쪽 끝을 붙잡는다) */
function shafts(D, R, b) {
  const p = R.shafts; if (!p) return;
  const ax = 118, ay = -46, bx = H1X - 18 + (b.hRun ?? 0), by = -56 * HS;
  const ix = p.b[0] - p.a[0], iy = p.b[1] - p.a[1], lx = bx - ax, ly = by - ay;
  const rot = Math.atan2(ly, lx) - Math.atan2(iy, ix), k = Math.hypot(lx, ly) / Math.hypot(ix, iy);
  D.part(p, pickVariant(p, 0, false, null), 'a', ax, ay, rot, k, p.k * 1.1);
}
/** 고삐 (마부 먼 손 → 두 말의 굴레) — 벡터 (로직 drawReins 와 같은 선) */
function reins(ctx, b) {
  const P = b.pts, O = b.O;
  const hx = (O.x - b.zx) / b.fk + P.hdF.x, hy = O.y - (b.fy + (b.joltY ?? 0)) + P.hdF.y;
  for (const i of [1, 0]) {
    const br = b.bridleOf(i);
    ctx.strokeStyle = i ? 'rgba(29,74,60,0.8)' : '#2a1c16'; ctx.lineWidth = i ? 1 : 1.4;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + br.x) / 2, Math.max(hy, br.y) + 18, br.x, br.y); ctx.stroke();
    if (!i) { ctx.strokeStyle = 'rgba(125,255,176,0.35)'; ctx.lineWidth = 3; ctx.stroke(); }
  }
}

// ───────────────────────── 마부 ─────────────────────────
/** 두 점을 잇는 부품 (피벗 a → b 벡터를 로직 (ax,ay) → (bx,by) 에 맞춰 돌리고, 길이 비율을 lo..hi 로 늘인다) — b_bride.js 와 같다 */
function segment(D, p, pa, pb, ax, ay, bx, by, lvl, deep, jr = 0, lo = 0.85, hi = 1.18, alpha = 1) {
  if (!p) return;
  const A = p[pa], B = p[pb];
  const ix = B[0] - A[0], iy = B[1] - A[1];
  const lx = bx - ax, ly = by - ay;
  const rot = Math.atan2(ly, lx) - Math.atan2(iy, ix) + jr;
  const k = p.k * clamp(Math.hypot(lx, ly) / (Math.hypot(ix, iy) * p.k || 1), lo, hi);
  D.part(p, pickVariant(p, lvl, deep, null), pa, ax, ay, rot, k, k, alpha);
}
/** 피벗 a 를 (x,y) 에 두고 그림의 a→b 방향이 각 ang 이 되게 (길이는 그림 그대로 × sy) */
function aim(D, p, pa, pb, x, y, ang, lvl, deep, sx = 1, sy = 1, alpha = 1) {
  if (!p) return;
  const ia = Math.atan2(p[pb][1] - p[pa][1], p[pb][0] - p[pa][0]);
  D.part(p, pickVariant(p, lvl, deep, null), pa, x, y, ang - ia, p.k * sx, p.k * sy, alpha);
}
function man(D, ctx, R, b, st, ff, jr, t) {
  const P = b.pts, lvl = st.lvl, seat = b.man === 'seat', sl = clamp(b.ps?.slump ?? 0, 0, 1);
  // 1) 뒷자락 (허리 뒤에서, 로직 자락 띠의 방향으로 흔들린다)
  const S = b.tails[0], ta = Math.atan2(S[S.length - 1].y - S[0].y, S[S.length - 1].x - S[0].x);
  D.rec = ff.legs;
  aim(D, R.tail, 'top', 'tip', P.hip.x - 6, P.hip.y + 2, ta, lvl, true, 1, seat ? 0.55 : 1 - 0.45 * sl);
  D.rec = false;
  // 2) 먼 팔 · 먼 다리 (deep)
  D.rec = ff.man;
  segment(D, R.armU, 'sh', 'el', P.shF.x, P.shF.y - 6, P.elF.x, P.elF.y, lvl, true, 0, 0.7, 1.5);
  segment(D, R.armF, 'el', 'hd', P.elF.x, P.elF.y, P.hdF.x, P.hdF.y, lvl, true, 0, 0.8, 1.3);
  D.rec = ff.legs;
  segment(D, R.thigh, 'hip', 'kn', P.hip.x - 3, P.hip.y + 3, P.knF.x, P.knF.y, 0, true, 0, 0.6, 1.3);
  segment(D, R.shin, 'kn', 'ft', P.knF.x, P.knF.y, P.ftF.x, P.ftF.y, 0, true, 0, 0.6, 1.35);
  // 3) 가까운 다리
  segment(D, R.thigh, 'hip', 'kn', P.hip.x + 2, P.hip.y + 4, P.knN.x, P.knN.y, 0, false, 0, 0.6, 1.3);
  segment(D, R.shin, 'kn', 'ft', P.knN.x, P.knN.y, P.ftN.x, P.ftN.y, 0, false, 0, 0.6, 1.35);
  // 4) 앞자락 (서 있으면 허리에서 아래로 — 무릎·주저앉음이면 짧게 접힌다; 앉으면 그리지 않는다 — 다리가 보인다)
  if (!seat) {
    const sk = R.skirt, kn = clamp(b.ps?.kneel ?? 0, 0, 1);
    const sy = 1 - 0.35 * kn - 0.5 * sl, sx = 1 + 0.2 * kn + 0.25 * sl + 0.08 * (b.walkK ?? 0);
    D.part(sk, pickVariant(sk, lvl, false, null), 'top', P.hip.x + 1, P.hip.y - 2, P.tA * 0.3 + Math.sin(t * 2.2) * 0.02 - 0.2 * sl + jr * 0.5, sk.k * sx, sk.k * sy);
  }
  D.rec = false;
  // 5) 몸통 · 머리
  D.rec = ff.body || ff.man;
  segment(D, R.torso, 'hip', 'nk', P.hip.x, P.hip.y, P.neck.x, P.neck.y, lvl, false, jr, 0.85, 1.18);
  D.rec = ff.man;
  const h = R.head, hr = (P.hA ?? 0) + jr;
  if (h) {
    D.part(h, pickVariant(h, Math.min(1, lvl), false, null), 'nk', P.neck.x, P.neck.y, hr, h.k, h.k);
    const e = D.pt(h.nk[0], h.nk[1], h.eye[0], h.eye[1], P.neck.x, P.neck.y, hr, h.k, h.k, st.E);
    st.eye = st.eye ?? [0, 0]; st.eye[0] = e[0]; st.eye[1] = e[1];
  }
  D.rec = false;
  // 6) 채찍 (마차 · 내던져짐) — 손잡이 부품 + 벡터 끈 / 고삐 사슬 (2페이즈, 벡터)
  if (b.coach || b.man !== 'stand') whip(D, ctx, R, b);
  // 7) 가까운 팔
  D.rec = ff.man;
  segment(D, R.armU, 'sh', 'el', P.shN.x, P.shN.y - 6, P.elN.x, P.elN.y, lvl, false, 0, 0.7, 1.5);
  segment(D, R.armF, 'el', 'hd', P.elN.x, P.elN.y, P.hdN.x, P.hdN.y, lvl, false, 0, 0.8, 1.3);
  D.rec = false;
  if (!b.coach && b.man === 'stand') {
    D.end(); chain(ctx, b);
    // 손의 등불 (고리 = 손, 늘 아래로)
    const L = R.lantern;
    if (L) { const out = b.lanBroken && t - b.lanOutT < 2.5, k = b.lanK ?? 0, s = L.k * 0.9 * (1 + 0.25 * k); D.part(L, pickVariant(L, 0, out, null), 'ring', P.hdN.x, P.hdN.y, (P.lanA ?? PI / 2) - PI / 2, s, s); }
  }
}
/** 채찍: 손잡이 부품(손에 쥔 곳 grip)을 로직 채찍 첫 마디 방향으로, 끈은 벡터 마디 */
function whip(D, ctx, R, b) {
  const W = b.whip; if (!W) return;
  const p = R.whipH;
  if (p) { const a = Math.atan2(W[3].y - W[0].y, W[3].x - W[0].x); aim(D, p, 'grip', 'tip', W[0].x, W[0].y, a, 0, false); }
  D.end(); ctx.save();
  const m = D.m; ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#120c0a'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(W[3].x, W[3].y); for (let i = 4; i < W.length; i++) ctx.lineTo(W[i].x, W[i].y); ctx.stroke();
  if (b.whipMode === 'crack') { const e = W[W.length - 1]; halo(ctx, e.x, e.y, 12, EMBER, 0.7, true); }
  ctx.restore();
}
/** 고삐 사슬 (2페이즈): 가죽 끈 + 쇠고리 — 벡터 (로직 drawChain 과 같은 모양) */
function chain(ctx, b) {
  const C = b.chain; if (!C) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#2a1c16'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(C[0].x, C[0].y); for (let i = 1; i < C.length; i++) ctx.lineTo(C[i].x, C[i].y); ctx.stroke();
  ctx.strokeStyle = '#6a6870'; ctx.lineWidth = 1.2;
  for (let i = 1; i < C.length; i += 2) { ctx.beginPath(); ctx.ellipse(C[i].x, C[i].y, 2.6, 1.6, Math.atan2(C[i].y - C[i - 1].y, C[i].x - C[i - 1].x), 0, 2 * PI); ctx.stroke(); }
  if (b.chainMode === 'lash') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(125,255,176,0.35)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(C[0].x, C[0].y); for (let i = 1; i < C.length; i++) ctx.lineTo(C[i].x, C[i].y); ctx.stroke(); }
  ctx.restore();
}
/** 빛: 움푹한 눈의 녹청 (마부 지역) */
function eyes(ctx, b, st, q, t) {
  if (b.dying > 0 && (b.dieT ?? 0) > 1.2) return;
  const e = st.eye; if (!e) return;
  const k = (0.75 + 0.25 * Math.sin(t * 3)) * (b.dying > 0 ? 0.4 : 1) * (b.cWin || b.cWinG || b.exposed ? 1.5 : 1);
  if (q.halos) halo(ctx, e[0], e[1], 7, SOUL, 0.55 * k);
  halo(ctx, e[0], e[1], 2.2, '#e8fff0', Math.min(1, 0.8 * k), true);
}
/** 마차가 부서진 순간: 파편 둘 · 관 · 바퀴 하나가 강체로 튄다 + 금빛·녹청 불티 */
function wreck(b, rig, st) {
  const R = rig.parts, f = b.facing || 1;
  const C = b.toWorld(0, -80, { x: 0, y: 0 });
  const pcs = Object.keys(R).filter((n) => n.startsWith('deb')).concat(['coffin', 'wheel']);
  pcs.forEach((n, i) => {
    const p = R[n]; if (!p) return;
    const k = n === 'coffin' ? p.k * 0.85 : n === 'wheel' ? p.k * 0.7 : p.k * 1.3, c = p.c ?? [p.w / 2, p.h / 2];
    st.shards.spawn(p.v.base, c[0], c[1], C.x + rr.range(-50, 50), C.y + rr.range(-30, 20), rr.range(-0.6, 0.6), k * f, k, f * rr.range(-120, 260) + (i - 1.5) * 60, rr.range(-420, -200), rr.range(-6, 6), { r: 8, bounce: 0.3, fade: 2.6 });
  });
  st.P.burst('spark', C.x, C.y, 14, { speed: 280, color: GOLD });
  st.P.burst('spark', C.x, C.y, 10, { speed: 220, color: SOUL });
  st.flashL = 1; st.flashW = [C.x, C.y];
}
function ambient(P, b, st, dt, q, hit, t, bodyA) {
  const amb = q.ambient;
  if (b.dying > 0) {
    // 재와 혼불로 흩어짐 (아케이드 1.2초부터 — vanishK 가 오른다). 스토리는 주저앉은 채 재 몇 점만
    const crumble = (b.vanishK ?? 0) > 0;
    st.ashAcc += dt * (crumble ? 30 : 2) * amb;
    while (st.ashAcc >= 1) { st.ashAcc -= 1; const p = b.toWorldM(rr.range(-26, 26), -rr.range(6, 120) * (1 - 0.6 * (b.vanishK ?? 0)), { x: 0, y: 0 }); P.emit('ashLight', p.x, p.y, rr.range(-40, 40), rr.range(-90, -20), { color: rr.next() < 0.35 ? SOUL : ASH, size: rr.range(2, 3.4), life: rr.range(1.2, 2.2), layer: 1 }); }
    return;
  }
  if (bodyA < 0.3) return;
  // 등불이 부푼 동안 — 녹청 불티
  if (b.lanUp && rr.next() < dt * 18 * amb) { const L = b.lanternW({ x: 0, y: 0 }); P.emit('spark', L.x + rr.range(-8, 8), L.y + rr.range(-8, 8), rr.range(-40, 40), rr.range(-80, -10), { color: SOUL }); }
  // 카운터 창 · 노출 — 흰 섬광
  if ((b.cWin || b.cWinG) && rr.next() < dt * 30 * amb) { const p = b.toWorldM(rr.range(-20, 20), rr.range(-110, -20), { x: 0, y: 0 }); P.emit('spark', p.x, p.y, rr.range(-160, 160), rr.range(-200, 40), { color: '#e8fff0' }); }
  if (b.stunned && rr.next() < dt * 10 * amb) { const p = b.toWorldM(rr.range(-20, 20), rr.range(-110, -40), { x: 0, y: 0 }); P.emit('ashLight', p.x, p.y, rr.range(-20, 20), rr.range(-60, -20), { color: SOUL, life: 1.2, layer: 1 }); }
  if (hit) {
    const hp = st.fp, p = st.W2h ??= [0, 0];
    if (hp) { p[0] = hp.x + hp.w / 2 + rr.range(-6, 6); p[1] = hp.y + hp.h / 2 + rr.range(-6, 6); } else { const w = b.toWorldM(rr.range(-10, 10), rr.range(-100, -40), { x: 0, y: 0 }); p[0] = w.x; p[1] = w.y; }
    P.burst('chip', p[0], p[1], 3, { speed: 200, color: b.coach ? '#2a2430' : '#1a1418' });
    P.burst('spark', p[0], p[1], 3, { speed: 240, color: hp === b.pLan ? SOUL : GOLD });
  }
}
