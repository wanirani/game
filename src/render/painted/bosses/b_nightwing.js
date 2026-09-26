// 나이트윙 (b_nightwing) — 채색 컷아웃 퍼핏 렌더러
// 부품: Kling 으로 그린 머리(경첩 아래턱 분리) · 근육질 몸통 · 앞팔(발톱 손) 2 · 펼친 날개 · 접힌 날개 · 뒷다리(갈고리 발톱) · 파편 6
// 움직임은 전부 기존 로직(src/game/bosses/a_nightwing.js)의 값을 읽기만 한다:
//   boss { cx, bottom, facing, lean, flap, flapRate, spread, mouth, claw, rage, phase, state, stateT, flashT, dying, deathT, t, hp/stats.maxHp, A.floor }
// 상태별 표현: idle(날갯짓·숨쉬기) swoop(날개 접고 급강하 — 잔상은 로직의 fx.ghost 가 이 모듈의 ghost() 로 그림)
//   screech(입이 찢어지게 벌어지고 목구멍 발광·머리 젖힘) talon(발톱 펼침·낙하) blades(날개 젖힘·핏줄 발광) summon(검은 연기)
//   bloodRain(온몸에서 피가 흘러내림) transform(날개 활짝·핏줄 폭주) · 1페이즈 격노(핏줄 균열 발광) · 2페이즈 피의 광란(피빛 틴트 교차 페이드)
//   피격 섬광(몸 전체) · 손상 단계 0~2(구운 흉터/찢긴 막 + 단계 상승 피·털 폭발) · death(턱이 뜯겨 나가고 날개가 찢겨 떨어지며 몸이 무너짐)
// 절차적 그로테스크 층: 입 속 피 섞인 침 줄(verlet 아님, 턱 벌림에 따라 늘어짐) · 송곳니에서 떨어지는 핏방울(바닥 튐) · 빠지는 털 조각
//   · 날개 막의 핏줄 발광(균열 발광 오버레이) · 눈의 붉은 불 · 바닥 그림자
// 좌표: 로직의 벡터 그림과 같은 지역 좌표계 (발 중앙 원점, +x = 바라보는 쪽, y 위가 음수). 기울기(lean)·좌우 뒤집기 포함.
import { Drawer, Particles, DamageState, Shards, halo, puff, rr, hash1, loadRig, pickVariant, quality, ledgesOver } from '../kit.js';

const DIR = 'painted/bosses/b_nightwing';
const RED = '#ff2a40', EYE = '#ff3040', BLOOD = '#3c0508', BLOOD_HI = '#ff5a5a';
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));

// 피의 광란(2페이즈) 틴트: 회색 털·피부 → 피에 젖은 검붉은색, 붉은 막 → 더 선명하게, 이빨·하이라이트는 거의 그대로
const BLOOD_RULES = [
  { when: (h, s, l) => l > 0.84, s: 0.9, l: 1 },
  { when: (h, s, l) => (h < 32 || h > 328) && s > 0.28, h: 354, s: 1.25, l: 1.02 },
  { when: (h, s, l) => l < 0.1, h: 352, s0: 0.35, l: 1.1 },
  { when: () => true, h: 356, s: 0.55, s0: 0.3, l: 0.9 },
];

/** 굽기 옵션 (kit.loadRig def) */
const DEF = {
  glow: RED,
  outline: { width: 2.0, color: 'rgba(8,2,4,0.9)' },
  parts: {
    head: { flash: true, cracks: 2, char: 1, holes: 0, crackMinLum: 80 },
    jaw: { flash: true, cracks: 1, char: 1, holes: 0, crackMinLum: 80 },
    torso: { flash: true, cracks: 4, char: 1, holes: 0, crackMinLum: 95 },
    armL: { flash: true, cracks: 1, holes: 0, crackMinLum: 95 },
    armR: { flash: true, cracks: 1, holes: 0, crackMinLum: 95 },
    wing: { flash: true, deep: 0.7, membrane: true, holes: 4, cracks: 4, char: 1, crackMinLum: 55 },
    wingf: { flash: true, deep: 0.7, membrane: true, holes: 2, cracks: 2, crackMinLum: 55 },
    leg: { flash: true, deep: 0.78, cracks: 1, holes: 0, crackMinLum: 80 },
  },
  prefix: { deb: { noDmg: true, outline: 1.4 } },
  tints: { blood: { rules: BLOOD_RULES, levels: ['dmg2'], glow: '#ff5a6a', skip: ['deb'] } },
};

// 지역 좌표 배치 (logic px) — 벡터 그림(a_nightwing.js drawFigure)과 같은 틀
const NECK_Y = -116, HEAD_S = 0.96, LEG_S = 0.84, WING_IN = 9;

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_nightwing', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = quality(boss.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(40), q,
      dmg: new DamageState(boss.def?.phases ?? [0.6, 0.3]), lt: null, pf: 0, lvl: 0, tintK: -1, fs: null, jolt: 0,
      pose: {}, gpose: {}, debris: rig.man.groups?.debris ?? [], dead: {}, W: [0, 0], lastPh: boss.phase ?? 0,
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.cx, B = b.bottom;
    let x0 = X - 330, x1 = X + 330, y0 = B - 330, y1 = Math.max(B + 30, (b.A?.floor ?? B) + 10);
    if (b.dying > 0 || st?.shards?.list.length) { const A = b.A; x0 = Math.min(x0, A.x0 - 40); x1 = Math.max(x1, A.x1 + 40); y1 = Math.max(y1, A.floor + 20); }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    const p = st.pose;
    if (p.eyeW && !(b.dying > 0 && (b.deathT ?? 0) > 1)) L.add(p.eyeW[0], p.eyeW[1], 70 + (b.rage ?? 0) * 50, EYE, 0.5 + (b.rage ?? 0) * 0.3);
  },
  /** 월드 파편(ABoss.spawnDebris)용 채색 조각 */
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.85;
    return { size: Math.max(10, (p.r ?? 10) * 1.1), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
  /** 급강하·발톱 낙하 잔상 (로직 afterimage → fx.ghost 가 부름): 스냅숏 자세를 붉은 발광 실루엣으로 */
  ghost(ctx, b, s, a, rig, st) {
    if (!rig || !st) return false;
    const D = st.ghostD ??= new Drawer();
    const o = st.gpose;
    poseOf(o, b, s, rig, b.t ?? 0, st, true);
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    D.begin(ctx);
    D.save();
    const fsx = s.f ?? 1;
    ctx.translate(s.x, s.b - 60); ctx.rotate(s.lean ?? 0); ctx.scale(fsx, 1); ctx.translate(0, 60);
    D.begin(ctx);
    drawFigure(D, ctx, b, rig, st, o, 'ghost', a * 0.42);
    D.end();
    D.restore();
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
    return true;
  },
};

// ───────────────────────── 자세 계산 (지역 좌표) ─────────────────────────
// s = 스냅숏(잔상) 또는 보스 자신: {flap, spread, claw, mouth}
function poseOf(o, b, s, rig, t, st, ghost = false) {
  const R = rig.parts;
  const fl = Math.sin(s.flap ?? 0), sp = clamp(s.spread ?? 1, 0.3, 1.45), claw = clamp(s.claw ?? 0, 0, 1.2), m = clamp(s.mouth ?? 0, 0, 1.4);
  const state = ghost ? 'swoop' : b.state;
  o.fl = fl; o.sp = sp; o.claw = claw; o.m = m;
  o.fold = clamp((0.74 - sp) / 0.32, 0, 1);
  const bob = -fl * 4 + Math.sin(t * 1.9) * 1.5;
  o.bob = bob;
  // 날개: 가까운(왼쪽) 날개 회전 (+ = 들어 올림). 내려치기(fl>0)·접기(sp<1) = 내림
  o.wRot = -fl * 0.42 - (1 - sp) * 0.9;
  o.wK = 0.9 + 0.1 * Math.min(sp, 1.3);
  o.wSy = 1 + fl * 0.05;
  // 팔 들어 올림 (0 = 늘어뜨림, 1 ≈ 75°)
  let arm = 0.06 + Math.sin(t * 1.7) * 0.04 + claw * 0.4;
  if (!ghost) {
    if (state === 'screech') arm = Math.max(arm, 0.3 + m * 0.35);
    else if (state === 'blades') arm = Math.max(arm, 0.95);
    else if (state === 'summon' || state === 'transform') arm = Math.max(arm, 0.8 + Math.sin(t * 9) * 0.08);
    else if (state === 'bloodRain') arm = Math.max(arm, 0.7 + Math.sin(t * 3) * 0.1);
    if (b.dying > 0) arm = 0.6 + Math.sin(t * 23) * 0.4;
  }
  o.arm = arm;
  o.leg = 0.08 + claw * 0.3 + Math.sin(t * 3.1) * 0.04;
  o.legSy = 1 + claw * 0.12;
  // 몸통: 목 소켓 위치 (지역)
  const T = R.torso, tk = T.k;
  o.tx = 1; o.ty = NECK_Y + bob; o.trot = fl * 0.02; o.tsx = tk; o.tsy = tk * (1 + Math.sin(t * 2.4) * 0.015);
  // 머리: 목 위, 비명 땐 뒤로 젖힘
  const jolt = ghost ? 0 : st.jolt;
  o.hrot = o.trot - m * 0.1 + Math.sin(t * 2.2) * 0.03 + (jolt ? (rr.next() - 0.5) * 0.12 * jolt : 0);
  o.hk = R.head.k * HEAD_S;
  o.jrot = m * 0.56 - (R.head.jawOpen0 ?? 0.7);
  return o;
}

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P;
  if (st.rig !== rig) { st.rig = rig; st._gm = null; }
  const qn = world.game?.settings?.quality ?? 'high';
  if (st.q.name !== qn) st.q = quality(world.game);
  const q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, floor = A.floor, t = b.t;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0, dT = b.deathT ?? 0;
  // 손상 단계 · 피의 광란 틴트
  const ratio = dying ? 0 : b.hp / b.stats.maxHp;
  const up = st.dmg.update(ratio, dt);
  st.lvl = dying ? 2 : Math.max(0, st.dmg.level);
  const wantTint = (b.phase ?? 0) >= 2 ? 1 : 0;
  st.tintK = st.tintK < 0 ? wantTint : approach(st.tintK, wantTint, dt * 0.9);
  // 피격 순간
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 6);
  // 좌우 뒤집기: 종이 뒤집기 (≈0.2 s)
  if (st.fs == null) st.fs = b.facing || 1;
  st.fs = approach(st.fs, b.facing || 1, dt * 10);
  const fsx = Math.sign(st.fs || 1) * Math.max(0.12, Math.abs(st.fs));
  const X = b.cx + (b.flashT > 0 ? (rr.next() - 0.5) * 5 : 0), B = b.bottom, lean = b.lean ?? 0;
  const o = poseOf(st.pose, b, b, rig, t, st);
  // 지역 → 월드 (입자용)
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const W = (lx, ly, out = st.W) => { const x = fsx * lx, y = ly + 60; out[0] = X + cl * x - sl * y; out[1] = B - 60 + sl * x + cl * y; return out; };
  st._Wf = W;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  // 바닥 그림자 (월드)
  D.begin(ctx);
  const alt = clamp((floor - B) / 360, 0, 1);
  const bodyGone = st.dead.body;
  if (!bodyGone) D.img(puff('#000000'), 32, 32, X, floor - 2, 0, 150 * (1 - alt * 0.45) / 32, 18 * (1 - alt * 0.45) / 32, 0.6 * (1 - alt * 0.55));
  D.end();
  P.draw(ctx, 0);
  // 레벨 상승 폭발
  if (up > 0 && !dying) levelBurst(P, W, up);
  // ── 몸 (지역 좌표) ──
  D.save();
  ctx.beginPath(); ctx.rect(A.x0 - 2000, floor - 3000, A.w + 4000, 3002); ctx.clip();   // 바닥 아래는 그리지 않는다
  ctx.translate(X, B - 60); ctx.rotate(lean); ctx.scale(fsx, 1); ctx.translate(0, 60);
  D.begin(ctx);
  const rec = b.flashT > 0 && !dying;
  D.rec = rec; D.log.length = 0;
  // 뒤층: 날개 → (발판 덧그리기) → 다리·몸통·팔·머리
  drawWings(D, ctx, b, rig, st, o, 'main', 1);
  if (q.ledges !== false && !st.dead.wings) {
    D.end(); D.restore();
    const cam = world.camera, cx0 = cam?.x ?? -1e9, cy0 = cam?.y ?? -1e9, cx1 = cx0 + (cam?.vw ?? 2e9), cy1 = cy0 + (cam?.vh ?? 2e9);
    ledgesOver(ctx, world, Math.max(X - 300, cx0), Math.max(B - 300, cy0), Math.min(X + 300, cx1), Math.min(B - 40, cy1));
    D.begin(ctx);
    D.save();
    ctx.beginPath(); ctx.rect(A.x0 - 2000, floor - 3000, A.w + 4000, 3002); ctx.clip();
    ctx.translate(X, B - 60); ctx.rotate(lean); ctx.scale(fsx, 1); ctx.translate(0, 60);
    D.begin(ctx);
    D.rec = rec;
  }
  drawFigure(D, ctx, b, rig, st, o, 'main', 1, true);
  if (rec) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.7);
  else { D.rec = false; D.log.length = 0; }
  D.end();
  D.restore();
  // ── 월드: 파편 · 입자 ──
  D.begin(ctx);
  st.shards.draw(D);
  D.end();
  ambient(P, b, st, o, W, dt, q, hit);
  if (dying) deathFx(ctx, D, b, rig, st, o, W, dt, dT, fsx, X, B, lean);
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

/** 부품 하나 (피의 광란 틴트 교차 페이드 포함) */
function part(D, st, p, pivot, x, y, rot, sx, sy, a = 1, deep = false) {
  const tk = st.tintK;
  if (tk < 0.999) D.part(p, pickVariant(p, st.lvl, deep, null), pivot, x, y, rot, sx, sy, a);
  if (tk > 0.001) D.part(p, pickVariant(p, st.lvl, deep, 'blood'), pivot, x, y, rot, sx, sy, a * tk);
}
/** 잔상: 발광 실루엣 */
function gpart(D, p, pivot, x, y, rot, sx, sy, a) {
  const im = p.v.glow ?? p.v.flash; if (!im) return;
  const pv = typeof pivot === 'string' ? p[pivot] : pivot;
  D.img(im, pv[0], pv[1], x, y, rot, sx, sy, a);
}
const _a = [0, 0], _b = [0, 0], _c = [0, 0], _h = [0, 0];

/** 날개 두 장 (먼 쪽 = +x, 어둡게·작게 · 가까운 쪽 = −x) */
function drawWings(D, ctx, b, rig, st, o, mode, alpha) {
  if (st.dead.wings && mode === 'main') return;
  const R = rig.parts, T = R.torso, Wg = R.wing, Wf = R.wingf;
  const ghost = mode === 'ghost';
  for (const far of [true, false]) {
    const s = far ? 1 : -1;                     // 지역 x 방향
    const sh = D.pt(T.neck[0], T.neck[1], T[s < 0 ? 'shoulderL' : 'shoulderR'][0], T[s < 0 ? 'shoulderL' : 'shoulderR'][1], o.tx, o.ty, o.trot, o.tsx, o.tsy, _a);
    const rx = sh[0] - s * WING_IN, ry = sh[1] + 4;
    const kk = far ? 0.9 : 1;
    const mir = s > 0 ? -1 : 1;                 // 그림은 왼쪽 날개 → 오른쪽(+x)은 뒤집기
    const rot = (o.wRot + (far ? 0.06 : 0)) * mir;
    const a1 = (1 - o.fold) * alpha, a2 = o.fold * alpha;
    const wk = Wg.k * o.wK * kk;
    if (a1 > 0.01) {
      if (ghost) gpart(D, Wg, 'root', rx, ry, rot, wk * mir, wk * o.wSy, a1);
      else {
        part(D, st, Wg, 'root', rx, ry, rot, wk * mir, wk * o.wSy, a1, far);
        glowOver(ctx, D, st, Wg, 'root', rx, ry, rot, wk * mir, wk * o.wSy, 0.5 * a1, b.t + (far ? 1.3 : 0), veinBoost(b));
      }
    }
    if (a2 > 0.01) {
      const fk = Wf.k * kk;
      const frot = (0.18 + o.claw * 0.1 + Math.sin(b.t * 5 + (far ? 1 : 0)) * 0.04) * mir;
      if (ghost) gpart(D, Wf, 'root', rx, ry - 4, frot, fk * mir, fk, a2);
      else part(D, st, Wf, 'root', rx, ry - 4, frot, fk * mir, fk, a2, far);
    }
  }
}
function veinBoost(b) { return (b.state === 'transform' || b.state === 'blades') ? 1.8 : 1 + (b.rage ?? 0) * 0.5; }

/** 다리 · 몸통 · 팔 · 입 속 · 턱 · 머리 (+ 잔상 모드) */
function drawFigure(D, ctx, b, rig, st, o, mode, alpha, withBody = true) {
  const R = rig.parts, T = R.torso, H = R.head, J = R.jaw, Lg = R.leg, t = b.t;
  const ghost = mode === 'ghost';
  const dead = st.dead;
  if (ghost) drawWings(D, ctx, b, rig, st, o, 'ghost', alpha);
  const put = ghost ? (p, pv, x, y, r, sx, sy, a, deep) => gpart(D, p, pv, x, y, r, sx, sy, a * alpha) : (p, pv, x, y, r, sx, sy, a, deep) => part(D, st, p, pv, x, y, r, sx, sy, a, deep);
  // 다리 (몸통 털 뒤)
  if (!dead.body) {
    for (const far of [true, false]) {
      const s = far ? 1 : -1, hip = T[s < 0 ? 'hipL' : 'hipR'];
      D.pt(T.neck[0], T.neck[1], hip[0], hip[1], o.tx, o.ty, o.trot, o.tsx, o.tsy, _a);
      const lk = Lg.k * LEG_S, mir = s > 0 ? -1 : 1;
      put(Lg, 'hip', _a[0] + s * 3, _a[1] - 6, (o.leg + (far ? 0.05 : 0)) * mir, lk * mir, lk * o.legSy, 1, far);
    }
    // 몸통
    put(T, 'neck', o.tx, o.ty, o.trot, o.tsx, o.tsy, 1);
    if (!ghost) glowOver(ctx, D, st, T, 'neck', o.tx, o.ty, o.trot, o.tsx, o.tsy, 0.55, t, veinBoost(b));
    // 앞팔 (팔꿈치에 매달림)
    for (const s of [1, -1]) {
      const name = s < 0 ? 'armL' : 'armR', Ar = R[name];
      if (dead[name]) continue;
      const el = T[s < 0 ? 'elbowL' : 'elbowR'];
      D.pt(T.neck[0], T.neck[1], el[0], el[1], o.tx, o.ty, o.trot, o.tsx, o.tsy, _a);
      const rot = -s * (o.arm * 1.25 + Math.sin(t * 2.3 + s) * 0.03);
      put(Ar, 'elbow', _a[0], _a[1], rot, Ar.k, Ar.k, 1);
    }
  }
  // 머리 + 턱
  if (!dead.head) {
    D.pt(T.neck[0], T.neck[1], T.neck[0], T.neck[1] + 14, o.tx, o.ty, o.trot, o.tsx, o.tsy, _a);
    const hx = _a[0] + 2, hy = _a[1];
    const hk = o.hk;
    D.pt(H.neck[0], H.neck[1], H.hinge[0], H.hinge[1], hx, hy, o.hrot, hk, hk, _h);
    const jr = o.hrot + o.jrot;
    if (!ghost) mouthInside(ctx, D, b, st, H, hx, hy, o.hrot, hk, o.jrot, o.m);
    if (!dead.jaw) put(J, 'hinge', _h[0], _h[1], jr, hk, hk, 1);
    put(H, 'neck', hx, hy, o.hrot, hk, hk, 1);
    if (!ghost) {
      glowOver(ctx, D, st, H, 'neck', hx, hy, o.hrot, hk, hk, 0.5, t, veinBoost(b));
      // 월드 기준점 (입자·조명·사망)
      o.headL = o.headL ?? [0, 0]; o.headL[0] = hx; o.headL[1] = hy;
      const e = D.pt(H.neck[0], H.neck[1], H.eye[0], H.eye[1], hx, hy, o.hrot, hk, hk, _b);
      const e2 = D.pt(H.neck[0], H.neck[1], H.eye2[0], H.eye2[1], hx, hy, o.hrot, hk, hk, _c);
      const fang = D.pt(H.neck[0], H.neck[1], H.fang[0], H.fang[1], hx, hy, o.hrot, hk, hk, o.fangL ??= [0, 0]);
      const jt = D.pt(J.hinge[0], J.hinge[1], J.tip[0], J.tip[1], _h[0], _h[1], jr, hk, hk, o.jawTipL ??= [0, 0]);
      void fang; void jt;
      // 눈의 붉은 불 (지역 좌표 = 현재 변환)
      D.end();
      const rage = b.rage ?? 0, ek = (0.7 + rage * 0.6 + (b.state === 'transform' ? 0.5 : 0)) * (b.dying > 0 ? clamp(1.2 - (b.deathT ?? 0), 0, 1) : 1);
      if (ek > 0.02) {
        halo(ctx, e[0], e[1], (13 + rage * 6) * ek, EYE, 0.85, true);
        halo(ctx, e2[0], e2[1], (9 + rage * 5) * ek, EYE, 0.7, true);
      }
      o.eyeL = o.eyeL ?? [0, 0]; o.eyeL[0] = e[0]; o.eyeL[1] = e[1];
      const W = st._Wf; if (W) { o.eyeW = W(e[0], e[1], o.eyeW ?? [0, 0]); o.fangW = W(o.fangL[0], o.fangL[1], o.fangW ?? [0, 0]); o.jawW = W(o.jawTipL[0], o.jawTipL[1], o.jawW ?? [0, 0]); o.headW = W(hx, hy - 30, o.headW ?? [0, 0]); }
    }
  }
}

/** 입 속: 어두운 목구멍 + 피 섞인 침 줄 + 비명 때 목구멍 발광 (머리 텍셀 공간에서) */
function mouthInside(ctx, D, b, st, H, hx, hy, hrot, hk, jrot, m) {
  const U = H.mouthUpper, L = H.mouthLower; if (!U || !L) return;
  const op2 = clamp((m - 0.08) / 0.5, 0, 1);
  if (op2 <= 0.02) return;
  D.set(H.neck[0], H.neck[1], hx, hy, hrot, hk, hk);
  const hxp = H.hinge[0], hyp = H.hinge[1], jc = Math.cos(jrot), js = Math.sin(jrot);
  ctx.beginPath(); ctx.moveTo(U[0][0], U[0][1]);
  for (const qq of U) ctx.lineTo(qq[0], qq[1] - 4);
  for (let j = L.length - 1; j >= 0; j--) { const qx = L[j][0] - hxp, qy = L[j][1] - hyp; ctx.lineTo(hxp + qx * jc - qy * js, hyp + qx * js + qy * jc); }
  ctx.closePath();
  if (!st._gm) {
    st._gm = ctx.createLinearGradient(H.hinge[0], 0, U[U.length - 1][0], 0);
    st._gm.addColorStop(0, 'rgba(8,1,2,0.97)'); st._gm.addColorStop(0.5, 'rgba(46,4,8,0.95)'); st._gm.addColorStop(1, 'rgba(90,10,16,0.9)');
  }
  ctx.fillStyle = st._gm; ctx.fill();
  // 목구멍 발광 (음파 비명 · 변신)
  const scream = (b.state === 'screech' || b.state === 'transform' || b.state === 'bloodRain') ? m : m * 0.3;
  if (scream > 0.2) {
    D.save(); ctx.clip();
    const gx = (U[1][0] + U[2][0]) / 2, gy = (U[1][1] + L[2][1]) / 2;
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * clamp(scream * 0.6, 0, 0.9);
    ctx.drawImage(puff(RED, true), gx - 40, gy - 34, 80, 68);
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
    D.restore();
  }
  // 피 섞인 침 줄 (위 송곳니 → 아래 이빨)
  ctx.lineCap = 'round';
  const t = b.t;
  for (let r = 0; r < 3; r++) {
    const u = U[Math.min(U.length - 1, r + 1)], lj = L[Math.min(L.length - 1, r + 2)], lx = lj[0] - hxp, ly = lj[1] - hyp;
    const bx = hxp + lx * jc - ly * js, by = hyp + lx * js + ly * jc;
    const mx = (u[0] + bx) / 2 + Math.sin(t * 2.3 + r) * 3, my = (u[1] + by) / 2 + 6 + op2 * 10;
    const wv = (1.3 - op2 * 0.6) * (r === 1 ? 5 : 3.5);
    ctx.beginPath(); ctx.moveTo(u[0] + (r - 1) * 5, u[1] + 3); ctx.quadraticCurveTo(mx, my, bx, by - 3);
    ctx.strokeStyle = 'rgba(70,6,12,0.92)'; ctx.lineWidth = wv; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,150,0.45)'; ctx.lineWidth = wv * 0.3; ctx.stroke();
  }
}

/** 손상 단계 균열 발광 (반 해상도, 가산, 맥동) — 실제 그려진 변형에 맞는 것만 */
function glowOver(ctx, D, st, p, pivot, x, y, rot, sx, sy, a, t, boost = 1) {
  const lvl = st.lvl;
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : (p.v.dmg1 || p.v.deep_dmg1) ? 1 : 0;
  if (!drawn) return;
  const tint = st.tintK > 0.5 ? 'blood' : null;
  const g = drawn === 2 ? ((tint && p.gl[tint + '_dmg2']) || p.gl.dmg2) : p.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? p[pivot] : pivot;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.6 + p.w * 0.01)) * boost * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - p.pad) * 0.5, (pv[1] - p.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 입자 ─────────────────────────
function levelBurst(P, W, level) {
  const c = W(0, -80, [0, 0]);
  P.burst('blood', c[0], c[1], 14 + level * 6, { speed: 320, angle: -PI / 2, spread: 1.5, color: BLOOD, hi: BLOOD_HI });
  P.burst('ash', c[0], c[1], 16, { speed: 160, color: 'rgba(24,14,12,0.9)' });
  P.burst('chip', c[0], c[1] - 20, 6 + level * 2, { speed: 260, angle: -PI / 2, spread: 1.3 });
}
function ambient(P, b, st, o, W, dt, q, hit) {
  if (b.dying > 0) return;
  const amb = q.ambient, t = b.t, m = o.m;
  // 송곳니·턱에서 떨어지는 피
  if (o.jawW && m > 0.25 && rr.next() < dt * (1.6 + st.lvl * 1.2 + (b.rage ?? 0) * 2) * amb) P.emit('blood', o.jawW[0] + rr.range(-3, 3), o.jawW[1], 0, 0, { color: BLOOD, hi: BLOOD_HI, hang: rr.range(0.15, 0.45), layer: 1 });
  if (o.fangW && rr.next() < dt * (0.6 + st.lvl * 0.6) * amb) P.emit('blood', o.fangW[0], o.fangW[1], 0, 0, { color: BLOOD, hi: BLOOD_HI, hang: rr.range(0.2, 0.6), layer: 1 });
  // 빠지는 털 조각 (날갯짓이 셀수록)
  const fr = Math.abs(b.flapRate ?? 7);
  if (rr.next() < dt * (0.8 + fr * 0.12) * amb) { const p = W(rr.range(-40, 40), rr.range(-120, -60), [0, 0]); P.emit('ash', p[0], p[1], rr.range(-30, 30), rr.range(-10, 30), { color: 'rgba(22,14,12,0.9)', layer: rr.chance(0.5) ? 0 : 1, size: rr.range(1.6, 3.2) }); }
  // 손상 2단계 이상: 상처에서 피가 흐름
  if (st.lvl >= 2 && rr.next() < dt * 2.2 * amb) { const p = W(rr.range(-26, 26), rr.range(-100, -50), [0, 0]); P.emit('blood', p[0], p[1], 0, 0, { color: BLOOD, hi: BLOOD_HI, hang: rr.range(0.1, 0.5), layer: 1 }); }
  // 상태별
  const s = b.state;
  if (s === 'bloodRain' && rr.next() < dt * 26 * amb) { const p = W(rr.range(-150, 150), rr.range(-150, -40), [0, 0]); P.emit('blood', p[0], p[1], rr.range(-20, 20), rr.range(20, 80), { color: BLOOD, hi: BLOOD_HI, layer: rr.chance(0.4) ? 0 : 1 }); }
  if (s === 'summon' && rr.next() < dt * 14 * amb) { const p = W(rr.sign() * rr.range(60, 190), rr.range(-170, -40), [0, 0]); P.emit('smoke', p[0], p[1], 0, -20, { color: '#1a060a', layer: 0 }); }
  if (s === 'transform' && rr.next() < dt * 30 * amb) { const p = W(rr.range(-60, 60), rr.range(-150, -40), [0, 0]); P.emit('ember', p[0], p[1], rr.range(-60, 60), rr.range(-120, -30), { color: RED, layer: 1 }); }
  if (s === 'screech' && m > 0.9 && o.headW && rr.next() < dt * 10 * amb) P.emit('smoke', o.headW[0], o.headW[1] + 30, rr.range(-30, 30), rr.range(-30, 10), { color: '#3a0810', layer: 1 });
  if (s === 'blades' && rr.next() < dt * 18 * amb) { const p = W(rr.sign() * rr.range(80, 200), rr.range(-190, -60), [0, 0]); P.emit('ember', p[0], p[1], 0, rr.range(-40, 0), { color: RED, layer: 1 }); }
  // 피격 반응
  if (hit) {
    const p = W(rr.range(-20, 20), rr.range(-100, -60), [0, 0]);
    P.burst('blood', p[0], p[1], 8, { speed: 260, angle: -PI / 2, spread: 1.4, color: BLOOD, hi: BLOOD_HI });
    P.burst('ash', p[0], p[1], 6, { speed: 120, color: 'rgba(24,14,12,0.9)' });
  }
}

// ───────────────────────── 사망 붕괴 ─────────────────────────
// 0.3s 가슴에서 피 폭발 · 0.5s 아래턱이 뜯겨 날아감 · 0.75s 날개가 찢겨 떨어짐(막 재) · 1.0s 머리·몸통·팔다리가 무너져 굴러감
function deathFx(ctx, D, b, rig, st, o, W, dt, dT, fsx, X, B, lean) {
  const R = rig.parts, P = st.P, dead = st.dead;
  const fade = 2.35 - dT;
  // 지역 부품 → 월드 파편: 지역 배치(px,py,rot,sx,sy)를 월드로 옮긴다 (뒤집기·기울기 포함)
  const shard = (p, img, pivot, lx, ly, lrot, sx, sy, vx, vy, vr, r, bounce = 0.3) => {
    const w = W(lx, ly, [0, 0]);
    const pv = typeof pivot === 'string' ? p[pivot] : pivot;
    const rot = fsx < 0 ? lean - lrot : lean + lrot;
    st.shards.spawn(img, pv[0], pv[1], w[0], w[1], rot, sx * Math.sign(fsx), sy, vx, vy, vr, { r, bounce, fade });
  };
  const V = (p, deep = false) => pickVariant(p, 2, deep, st.tintK > 0.5 ? 'blood' : null);
  if (!st.dBurst && dT > 0.3) {
    st.dBurst = true;
    const c = W(0, -80, [0, 0]);
    b.world?.fx?.ring?.(c[0], c[1], { color: RED, r0: 10, r1: 200, life: 0.45, width: 7 });
    P.burst('blood', c[0], c[1], 30, { speed: 420, angle: -PI / 2, spread: 1.6, color: BLOOD, hi: BLOOD_HI });
    P.burst('ash', c[0], c[1], 24, { speed: 220, color: 'rgba(24,14,12,0.9)' });
    for (let i = 0; i < 6; i++) {
      const p = R[st.debris[i % st.debris.length]]; if (!p) continue;
      const a = -PI / 2 + (rr.next() - 0.5) * 2.4, sp = rr.range(240, 520);
      st.shards.spawn(p.v.base, p.c[0], p.c[1], c[0], c[1], rr.next() * TAU, p.k * rr.sign(), p.k, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-9, 9), { r: (p.r ?? 10) * 0.6, fade });
    }
  }
  if (!dead.jaw && dT > 0.5 && o.headL) {
    dead.jaw = true;
    const H = R.head, J = R.jaw, hk = o.hk;
    const hp = D.pt(H.neck[0], H.neck[1], H.hinge[0], H.hinge[1], o.headL[0], o.headL[1], o.hrot, hk, hk, [0, 0]);
    shard(J, V(J), 'hinge', hp[0], hp[1], o.hrot + o.jrot, hk, hk, fsx * rr.range(80, 200), -300, fsx * 6, 14, 0.35);
    const jw = W(hp[0], hp[1], [0, 0]);
    P.burst('blood', jw[0], jw[1], 16, { speed: 300, angle: PI / 2, spread: 1.2, color: BLOOD, hi: BLOOD_HI });
  }
  if (!dead.wings && dT > 0.75) {
    dead.wings = true;
    const T = R.torso, Wg = R.wing, Wf = R.wingf;
    for (const far of [true, false]) {
      const s = far ? 1 : -1, shp = T[s < 0 ? 'shoulderL' : 'shoulderR'];
      const sh = D.pt(T.neck[0], T.neck[1], shp[0], shp[1], o.tx, o.ty, o.trot, o.tsx, o.tsy, [0, 0]);
      const mir = s > 0 ? -1 : 1, kk = far ? 0.9 : 1, useF = o.fold > 0.5, Pp = useF ? Wf : Wg;
      const k = Pp.k * kk * (useF ? 1 : o.wK);
      shard(Pp, V(Pp, far), 'root', sh[0] - s * WING_IN, sh[1] + 4, (useF ? 0.18 : o.wRot) * mir, k * mir, k, s * fsx * rr.range(60, 160), rr.range(-260, -120), s * fsx * rr.range(1.5, 3.5), 40, 0.15);
      for (let i = 0; i < 26; i++) { const p = W(s * rr.range(40, 220), rr.range(-230, -60), [0, 0]); P.emit(i % 3 ? 'ash' : 'ashLight', p[0], p[1], rr.range(-40, 40), rr.range(-60, 30), { layer: 1, color: i % 3 ? 'rgba(40,6,10,0.9)' : undefined, size: rr.range(2, 4.5), life: rr.range(1.2, 2.2) }); }
      const wp = W(s * 120, -170, [0, 0]);
      P.burst('blood', wp[0], wp[1], 10, { speed: 200, color: BLOOD, hi: BLOOD_HI });
    }
  }
  if (!dead.body && dT > 1.0) {
    dead.body = dead.head = true;
    const T = R.torso, H = R.head, Lg = R.leg;
    shard(T, V(T), 'neck', o.tx, o.ty, o.trot, o.tsx, o.tsy, rr.range(-60, 60), -120, rr.range(-2, 2), 34, 0.25);
    if (o.headL) shard(H, V(H), 'neck', o.headL[0], o.headL[1], o.hrot, o.hk, o.hk, fsx * rr.range(100, 220), -380, fsx * rr.range(4, 8), 26, 0.35);
    for (const s of [1, -1]) {
      const name = s < 0 ? 'armL' : 'armR', Ar = R[name], el = T[s < 0 ? 'elbowL' : 'elbowR'];
      const e = D.pt(T.neck[0], T.neck[1], el[0], el[1], o.tx, o.ty, o.trot, o.tsx, o.tsy, [0, 0]);
      shard(Ar, V(Ar), 'elbow', e[0], e[1], -s * o.arm * 1.25, Ar.k, Ar.k, s * fsx * rr.range(80, 220), rr.range(-320, -160), s * rr.range(-7, 7), 14);
      dead[name] = true;
      const hip = T[s < 0 ? 'hipL' : 'hipR'], hp = D.pt(T.neck[0], T.neck[1], hip[0], hip[1], o.tx, o.ty, o.trot, o.tsx, o.tsy, [0, 0]);
      const mir = s > 0 ? -1 : 1, lk = Lg.k * LEG_S;
      shard(Lg, V(Lg, s > 0), 'hip', hp[0] + s * 3, hp[1] - 6, o.leg * mir, lk * mir, lk, s * fsx * rr.range(60, 160), rr.range(-260, -120), rr.range(-6, 6), 14);
    }
    const c = W(0, -70, [0, 0]);
    P.burst('blood', c[0], c[1], 20, { speed: 300, color: BLOOD, hi: BLOOD_HI });
    P.burst('ash', c[0], c[1], 20, { speed: 200, color: 'rgba(24,14,12,0.9)' });
  }
  // 무너지는 동안: 피가 뿜어지고 털이 흩날림
  if (dT < 1.6 && rr.next() < dt * 24) { const p = W(rr.range(-40, 40), rr.range(-140, -40), [0, 0]); P.emit('blood', p[0], p[1], rr.range(-120, 120), rr.range(-220, -60), { color: BLOOD, hi: BLOOD_HI, layer: 1 }); }
  if (dT < 2 && rr.next() < dt * 16) { const p = W(rr.range(-80, 80), rr.range(-160, -30), [0, 0]); P.emit('ash', p[0], p[1], rr.range(-40, 40), rr.range(-50, 20), { color: 'rgba(22,14,12,0.9)', layer: 1 }); }
}
