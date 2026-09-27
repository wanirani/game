// 키메라 호문쿨루스 (b_chimera) — 채색 컷아웃 퍼핏 렌더러 (ART-BOSS-3)
// 부품 (Kling, tools/painted/configs/b_chimera.json): 사자 몸통(등의 황동 받침·찢긴 가죽 속 근육과 뱀) · 뒷다리/앞다리 아랫마디 ·
//   사자 머리(경첩 턱, 입 속은 뚫고 절차적 목구멍) · 산양 머리 · 뱀 꼬리(곧은 그림을 곡선 따라 띠로 구부려 그림) · 뱀 머리 ·
//   영약 유리관 3종(온전/깨짐) · 파편 9종
// 움직임은 전부 로직(src/game/bosses/a_chimera.js)의 값을 읽기만 한다:
//   gait vx onGround crouch lean roar claw goatUp goatGlow tailA tailCoil(→ tailPts()) snakeOpen tubesBroken enraged fury
//   state stateT phase flashT dying deathT facing cx bottom
// 절차적 층: 영약 발광·기포 · 깨진 관의 녹색 불길 · 산성 침(ichor 방울→바닥 튐) · 산양 주문 룬 · 광폭화 녹색 화상(발광 실루엣) ·
//   돌진 잔상 · 손상 단계 균열 발광(산성 녹색) · 사망 붕괴(관 파열 → 꼬리 절단 → 산양·사자 머리가 떨어져 나감 → 몸통 붕괴)
// 규칙: 그리기 코드는 Math.random / world.fx.emit 을 쓰지 않는다 (kit.rr + 자체 Particles). 클립은 D.save/D.restore.
import { Drawer, Particles, DamageState, Shards, halo, puff, rr, hash1, loadRig, pickVariant, quality, ledgesOver } from '../kit.js';

const DIR = 'painted/bosses/b_chimera';
const ACID = '#7cff5a', ACID_D = '#1f5a0c', ACID_HI = '#d8ffb0';
const PI = Math.PI, TAU = PI * 2;
const S = 1.04;   // 로직 그림 배율 (a_chimera.js 의 S) — 로직 지역 좌표 → 월드 px
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));

/** 굽기 옵션 (kit.loadRig def) */
const DEF = {
  glow: ACID,
  outline: { width: 2.0, color: 'rgba(12,6,4,0.9)' },
  parts: {
    torso: { flash: true, deep: 0.86, deepOnly: true, cracks: 3, holes: 2, char: 2, crackMinLum: 120 },   // 몸통 덩어리는 살짝 어둡게 (머리·관이 앞으로 읽히게)
    legH: { flash: true, deep: 0.6, cracks: 1, holes: 1, char: 1 },
    legF: { flash: true, deep: 0.6, cracks: 1, holes: 1, char: 1 },
    lion: { flash: true, cracks: 2, holes: 1, crackMinLum: 110 },
    lion_jaw: { flash: true, cracks: 1, holes: 0 },
    goat: { flash: true, cracks: 2, holes: 1 },
    snake: { flash: true, cracks: 2, holes: 1, crackMinLum: 60 },
    shead: { flash: true, cracks: 1, holes: 0, crackMinLum: 60 },
  },
  prefix: { tube: { noDmg: true, outline: 1.4 }, deb: { noDmg: true, outline: 1.2 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_chimera', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(b, rig) {
    const q = quality(b.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(40), q,
      dmg: new DamageState(b.def?.phases ?? [0.6, 0.3]), lt: null, pf: 0, jolt: 0, fs: null, trail: [],
      tail: Array.from({ length: 16 }, () => ({ x: 0, y: 0 })), sflip: 1,
      gone: { tubes: false, snake: false, goat: false, lion: false, body: false }, deathBurst: false,
      debris: rig.man.groups?.debris ?? [], bb: { x0: 0, y0: 0, x1: 0, y1: 0 },
    };
  },
  draw(ctx, b, world, rig, st) { drawChimera(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const A = b.A;
    let x0 = b.cx - 340, x1 = b.cx + 340, y0 = b.bottom - 360, y1 = b.bottom + 24;
    if (b.dying > 0 || st?.shards?.list.length) { x0 = Math.min(x0, A.x0); x1 = Math.max(x1, A.x1); y0 = Math.min(y0, A.floor - 420); y1 = Math.max(y1, A.floor + 24); }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    if (b.dying > 0 && (b.deathT ?? 0) > 2.1) return;
    if (b.enraged) L.add(b.cx, b.bottom - 110, 240, ACID, 0.35 + 0.15 * Math.sin(b.t * 8));
  },
  /** 월드 파편(ABoss.spawnDebris)용 채색 조각 */
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.8;
    return { size: Math.max(10, (p.r ?? 10) * 1.1), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 지역 좌표계 ─────────────────────────
// 지역 좌표(월드 px, 앞 = +x, 위 = −y, 원점 = 발 중앙) → 월드. 몸 전체 기울기(lean) 는 원점 기준 회전, 방향 fs(종이 뒤집기 중엔 |fs|<1)
const F = { X: 0, B: 0, fs: 1, fsn: 1, c: 1, s: 0, th: 0 };
function L2W(lx, ly, out) {
  out[0] = F.X + F.fs * (lx * F.c - ly * F.s);
  out[1] = F.B + (lx * F.s + ly * F.c);
  return out;
}
/** 지역 회전 r → 월드 회전 */
const wr = (r) => F.fsn * (F.th + r);

const _a = [0, 0], _b = [0, 0], _c = [0, 0], _d = [0, 0], _e = [0, 0];

// ───────────────────────── 메인 ─────────────────────────
function drawChimera(ctx, b, world, rig, st) {
  const D = st.D, R = rig.parts;
  if (st.rig !== rig) st.rig = rig;
  const qn = world.game?.settings?.quality ?? 'high';
  if (st.q.name !== qn) st.q = quality(world.game);
  const q = st.q, P = st.P;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const floor = b.floorY ?? b.A.floor, t = b.t;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0, dT = b.deathT ?? 0;
  // 손상 단계
  const ratio = dying ? 0 : b.hp / b.stats.maxHp;
  const up = st.dmg.update(ratio, dt);
  const lvl = dying ? 2 : Math.max(0, st.dmg.level);
  // 피격 순간
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 7);
  // 방향 (종이 뒤집기 ≈ 0.12 s)
  const face = b.facing >= 0 ? 1 : -1;
  if (st.fs == null) st.fs = face;
  st.fs = approach(st.fs, face, dt * 16);
  const fs = Math.abs(st.fs) < 0.08 ? 0.08 * Math.sign(st.fs || face) : st.fs;
  // 몸 프레임
  const g = b.gait ?? 0, vx = Math.abs(b.vx ?? 0), walk = clamp(vx / 150, 0, 1), run = clamp(vx / 600, 0, 1);
  let cr = clamp(b.crouch ?? 0, 0, 1.3);
  const air = !b.onGround;
  const transform = b.state === 'transform';
  let sink = 0, tilt = 0;
  if (dying) { sink = clamp((dT - 1.1) / 0.8, 0, 1); sink = sink * sink * 26; tilt = -clamp((dT - 1.2) / 0.8, 0, 1) * 0.08; }
  const jit = (st.jolt > 0 ? (rr.next() - 0.5) * 5 * st.jolt : 0) + (dying && dT < 1.9 ? (rr.next() - 0.5) * 4 : 0) + (transform ? Math.sin(t * 60) * 1.5 : 0);
  F.X = b.cx + jit; F.B = floor; F.fs = fs; F.fsn = fs >= 0 ? 1 : -1;
  F.th = (b.lean ?? 0) * 0.3 + tilt; F.c = Math.cos(F.th); F.s = Math.sin(F.th);
  const bob = Math.sin(g * 2) * (1 + run * 4) * (air ? 0 : 1) + cr * 18 + sink;
  const airY = air ? b.bottom - floor : 0;            // 도약 중엔 몸이 공중에 (로직 bottom)
  const bodyY = airY + bob;
  const alphaAll = dying ? clamp((2.35 - dT) / 0.35, 0, 1) : 1;
  const V = (part, deep = false) => pickVariant(part, lvl, deep, null);
  // 레벨 상승 폭발
  if (up > 0) {
    L2W(20, -110, _a);
    P.burst('ichor', _a[0], _a[1], 10 + up * 4, { speed: 260, angle: -PI / 2, spread: 1.3, color: ACID_D, hi: ACID_HI });
    P.burst('chip', _a[0], _a[1], 8, { speed: 240, color: '#b0854a' });
    P.burst('spore', _a[0], _a[1], 14, { speed: 120, color: ACID });
  }
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  const ga0 = ctx.globalAlpha;
  ctx.globalAlpha = ga0 * alphaAll;
  D.begin(ctx);
  // ── 바닥 그림자 ──
  if (!st.gone.body) D.img(puff('#000000'), 32, 32, b.cx, floor - 2, 0, 150 / 32, 16 / 32, 0.6 * (air ? clamp(1 - (floor - b.bottom) / 300, 0.2, 1) : 1));
  P.draw(ctx, 0);
  // 바닥선 아래는 그리지 않는다 (사망 때 주저앉는 몸통·옆으로 벌어지는 다리가 바닥 타일을 뚫지 않게)
  D.end(); D.save();
  ctx.beginPath(); ctx.rect(b.cx - 1600, floor - 3000, 3200, 3002); ctx.clip();
  // ── 몸통 변환 ──
  const T = R.torso, tk = T.k;
  const breath = 1 + Math.sin(t * 1.8) * 0.012 + (b.roar ?? 0) * 0.01;
  L2W(0, bodyY, _a);
  const tx = _a[0], ty = _a[1], trot = wr(0), tsx = tk * fs, tsy = tk * breath;
  const tp = (pv, out) => D.pt(T.c[0], T.c[1], pv[0], pv[1], tx, ty, trot, tsx, tsy, out);
  st.bb.x0 = b.cx - 150; st.bb.x1 = b.cx + 150; st.bb.y0 = floor + bodyY - 170; st.bb.y1 = floor + bodyY - 20;
  // 광폭화 오라 (뒤, 가산)
  if (b.enraged && q.halos && !st.gone.body) halo(ctx, b.cx, floor + bodyY - 100, 170, ACID, 0.18 + 0.07 * Math.sin(t * 8));
  const flashOn = b.flashT > 0 && !dying;
  // 피격 섬광은 부품마다 그린 직후 바로 덧그린다(st.fa) — 끝에 한꺼번에 덧그리면 몸통에 가려진 부분(머리를 잘라 낸 몸통 앞쪽,
  // 다리 윗부분)의 흰 실루엣이 사자 갈기·몸통 위로 드러나고 겹친 곳은 두 번 더해진다
  st.fa = flashOn ? clamp(b.flashT / 0.1, 0, 1) * 0.55 : 0;
  // ── 뱀 꼬리 + 뱀 머리 (가장 뒤) ──
  if (!st.gone.snake) drawSnake(ctx, D, b, rig, st, dt, airY, bob, lvl, flashOn);
  // 돌진 잔상 (발광 실루엣, 몸 뒤)
  trailFx(ctx, D, b, st, T, tx, ty, trot, tsx, tsy, q, dying);
  // ── 다리 (먼 쪽 deep → 가까운 쪽), 윗부분은 몸통 뒤에 숨는다 ──
  const legs = st._legs ??= [
    { part: 'legH', hip: 'hipH2', far: true, front: false, ph: PI * 0.5, dx: 0 },
    { part: 'legF', hip: 'hipF2', far: true, front: true, ph: PI * 1.5, dx: 0 },
    { part: 'legH', hip: 'hipH', far: false, front: false, ph: PI * 1.5, dx: 0 },
    { part: 'legF', hip: 'hipF', far: false, front: true, ph: PI * 0.5, dx: 0 },
  ];
  D.rec = flashOn;
  for (const L of legs) {
    if (st.gone.body) break;
    const Lg = R[L.part]; if (!Lg) continue;
    const H = tp(T[L.hip], _b);
    const nat = Math.hypot(Lg.hip[0] - Lg.foot[0], Lg.hip[1] - Lg.foot[1]) * Lg.k;
    // 발 위치 (지역): 그림 속 발 x + 걸음 흔들림
    const baseX = (Lg.foot[0] - Lg.hip[0]) * Lg.k + localOf(T, L.hip)[0];
    const ph = g + L.ph;
    let fx = baseX + Math.sin(ph) * (14 + run * 22) * walk, lift = Math.max(0, Math.cos(ph)) * (7 + run * 16) * walk;
    let fxW, fyW;
    if (air || (dying && dT > 1.25)) {
      // 공중: 앞다리는 앞으로 뻗고 뒷다리는 뒤로 (사망 붕괴 중엔 옆으로 퍼진다)
      const a = air ? (L.front ? 0.95 : -0.9) + (b.vy < 0 ? -0.15 : 0.2) : (L.front ? 0.9 : -0.9) * clamp((dT - 1.25) / 0.5, 0, 1);
      fxW = H[0] + F.fs * Math.sin(a) * nat * 0.96; fyW = Math.min(floor, H[1] + Math.cos(a) * nat * 0.96);
    } else {
      if (L.front && !L.far && (b.claw ?? 0) > 0.2) { fx += b.claw * 26; lift += b.claw * 34; }   // 발톱 치켜들기
      if (L.far) fx += L.front ? 6 : 10;
      L2W(fx, 0, _c); fxW = _c[0]; fyW = floor - lift;
      // 너무 멀면(엉덩이가 들림) 다리 길이에 맞춰 당긴다 — 윗부분이 몸통 밖으로 드러나지 않게
      const dx = fxW - H[0], dy = fyW - H[1], d = Math.hypot(dx, dy);
      if (d > nat * 0.98) { fxW = H[0] + dx / d * nat * 0.98; fyW = H[1] + dy / d * nat * 0.98; }
    }
    const lvx = (Lg.hip[0] - Lg.foot[0]) * Lg.k * fs, lvy = (Lg.hip[1] - Lg.foot[1]) * Lg.k;
    const rot = Math.atan2(H[1] - fyW, H[0] - fxW) - Math.atan2(lvy, lvx);
    D.part(Lg, V(Lg, L.far), 'foot', fxW, fyW, rot, Lg.k * fs, Lg.k, 1);
    if (flashOn) { D.flash(st.fa); D.rec = true; }
    if (!L.far) glowOver(ctx, D, Lg, lvl, 'foot', fxW, fyW, rot, Lg.k * fs, Lg.k, 0.4, st, t + (L.front ? 1 : 0));
    L.fx = fxW; L.fy = fyW; L.rot = rot;
  }
  // ── 몸통 ──
  if (!st.gone.body) {
    D.part(T, V(T, true), 'c', tx, ty, trot, tsx, tsy, 1);
    if (flashOn) D.flash(st.fa);
    glowOver(ctx, D, T, lvl, 'c', tx, ty, trot, tsx, tsy, 0.55, st, t, transform);
    // 광폭화: 영약이 온몸을 태운다 (녹색 발광 실루엣 맥동)
    if (b.enraged && q.halos && T.v.glow) {
      const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      D.img(T.v.glow, T.c[0], T.c[1], tx, ty, trot, tsx, tsy, 0.05 + 0.04 * Math.sin(t * 7));
      ctx.globalCompositeOperation = op;
    }
  }
  D.rec = false;
  // 발판 덧그리기 (몸통이 경기장 발판을 덮지 않게) — 머리·관은 발판 앞
  if (q.ledges !== false && !st.gone.body) {
    const cam = world.camera, cx0 = cam?.x ?? -1e9, cy0 = cam?.y ?? -1e9, cx1 = cx0 + (cam?.vw ?? 2e9), cy1 = cy0 + (cam?.vh ?? 2e9);
    D.end(); ledgesOver(ctx, world, Math.max(st.bb.x0, cx0), Math.max(st.bb.y0, cy0), Math.min(st.bb.x1, cx1), Math.min(st.bb.y1, cy1));
  }
  // ── 영약 유리관 ──
  drawTubes(ctx, D, b, rig, st, dt, tp, trot, lvl, dying, dT);
  // ── 산양 ──
  if (!st.gone.goat) drawGoat(ctx, D, b, rig, st, dt, tp, lvl, flashOn);
  // ── 사자 머리 ──
  if (!st.gone.lion) drawLion(ctx, D, b, rig, st, dt, bodyY, cr, lvl, flashOn, hit);
  // 피격 섬광: 판정이 몸+머리 한 덩어리라 전체가 번쩍이지만, 부품마다 그린 직후에 이미 덧그렸다 (가림 순서 유지). 남은 기록만 정리
  if (flashOn) D.flash(st.fa);
  else { D.rec = false; D.log.length = 0; }
  // ── 사망 붕괴 ──
  if (dying) deathFx(ctx, D, b, rig, st, dt, dT, tp, trot, tsx, tsy, tx, ty);
  // 반응 입자
  if (hit) {
    L2W(40, -100 + bodyY, _a);
    P.burst('ichor', _a[0], _a[1], 5, { speed: 220, angle: -PI / 2, spread: 1.4, color: ACID_D, hi: ACID_HI });
    P.burst('chip', _a[0], _a[1], 4, { speed: 200, color: '#a07844' });
  }
  if (!dying && rr.next() < dt * 0.8 * q.ambient) { L2W(rr.range(-80, 60), -60 + bodyY, _a); P.emit('ichor', _a[0], _a[1], 0, 0, { color: ACID_D, hi: ACID_HI, hang: rr.range(0.2, 0.5), layer: 1 }); }
  D.end();
  st.shards.draw(D);
  D.end();
  D.restore();   // 바닥 클립
  P.draw(ctx, 1);
  ctx.globalAlpha = ga0;
  ctx.imageSmoothingQuality = q0;
}

/** 몸통 텍셀 피벗 → 지역 좌표 (몸통 배율, 흔들림 제외) — 발 위치 계산용 */
function localOf(T, name) {
  const c = T._loc ??= {};
  return c[name] ??= [(T[name][0] - T.c[0]) * T.k, (T[name][1] - T.c[1]) * T.k];
}

// ───────────────────────── 뱀 꼬리 ─────────────────────────
function drawSnake(ctx, D, b, rig, st, dt, airY, bob, lvl, flashOn) {
  const R = rig.parts, Sn = R.snake, H = R.shead;
  if (!Sn || typeof b.tailPts !== 'function') return;
  const q = st.q, P = st.P, t = b.t;
  const src = b.tailPts();
  const pts = st.tail;
  // 뿌리 쪽 2점을 엉덩이 안쪽으로 더해 (몸통 뒤에 숨음) 그림의 길이와 비슷하게, 몸 흔들림은 뿌리 쪽에만
  const n0 = 12;
  let k = 0;
  const bx = (src[0] - src[2]), by = (src[1] - src[3]), bl = Math.hypot(bx, by) || 1;
  for (let j = 2; j >= 1; j--) { L2W((src[0] + bx / bl * 16 * j) * S, (src[1] + by / bl * 16 * j) * S + airY + bob, _a); pts[k].x = _a[0]; pts[k].y = _a[1]; k++; }
  for (let i = 0; i < n0; i++) {
    const w = 1 - i / (n0 - 1);
    L2W(src[i * 2] * S, src[i * 2 + 1] * S + airY + bob * w, _a); pts[k].x = _a[0]; pts[k].y = _a[1]; k++;
  }
  const n = k;
  const img = pickVariant(Sn, lvl, false, null);
  drawBent(ctx, D, img, Sn, pts, n, Sn.k * 1.0, F.fsn, 1);
  // 섬광: 띠를 반 해상도 버퍼에 불투명하게 그린 뒤 한 번만 가산 (띠를 바로 가산하면 겹친 곳은 두 번, 굽은 바깥 틈은 0번 더해져
  // 얼룩말 줄무늬·검은 쐐기가 생겼다)
  if (flashOn && Sn.v.flash) {
    const bb = st._fbb ??= [0, 0, 0, 0], pad = Sn.h * Sn.k * 0.6 + 4;
    bb[0] = bb[1] = 1e9; bb[2] = bb[3] = -1e9;
    for (let i = 0; i < n; i++) { const p = pts[i]; if (p.x < bb[0]) bb[0] = p.x; if (p.y < bb[1]) bb[1] = p.y; if (p.x > bb[2]) bb[2] = p.x; if (p.y > bb[3]) bb[3] = p.y; }
    bb[0] -= pad; bb[1] -= pad; bb[2] += pad; bb[3] += pad;
    flashLayer(ctx, D, st, bb, st.fa, (o, D2) => drawBent(o, D2, Sn.v.flash, Sn, pts, n, Sn.k, F.fsn, 1));
  }
  // 뱀 머리: 꼬리 끝 방향, 위아래 뒤집기 히스테리시스
  if (!H) return;
  const p1 = pts[n - 2], p2 = pts[n - 1];
  const A = Math.atan2(p2.y - p1.y, p2.x - p1.x), ca = Math.cos(A);
  if (ca < -0.25) st.sflip = -1; else if (ca > 0.25) st.sflip = 1;
  const op = clamp(b.snakeOpen ?? 0, 0, 1.2);
  const hk = H.k * (1 + op * 0.12);
  const sy = hk * st.sflip;
  const a0 = Math.atan2((H.snout[1] - H.neck[1]) * st.sflip, H.snout[0] - H.neck[0]);
  const rot = A - a0 + (op > 0.3 ? -st.sflip * op * 0.12 : 0);
  D.rec = flashOn;
  D.part(H, pickVariant(H, lvl, false, null), 'neck', p2.x, p2.y, rot, hk, sy, 1);
  if (flashOn) D.flash(st.fa);
  D.rec = false;
  const m = D.pt(H.neck[0], H.neck[1], H.mouth[0], H.mouth[1], p2.x, p2.y, rot, hk, sy, _e);
  const e = D.pt(H.neck[0], H.neck[1], H.eye[0], H.eye[1], p2.x, p2.y, rot, hk, sy, _d);
  D.end();
  if (q.halos) {
    halo(ctx, e[0], e[1], 9 + (b.fury ?? 0) * 6, '#ffe040', 0.45 + (b.fury ?? 0) * 0.3, true);
    if (op > 0.1) halo(ctx, m[0], m[1], 14 + op * 14, ACID, 0.35 * op, true);
  }
  // 독니에서 떨어지는 독
  if (op > 0.2 && rr.next() < dt * (3 + op * 6) * q.ambient) P.emit('ichor', m[0], m[1], 0, 0, { color: ACID_D, hi: ACID_HI, hang: rr.range(0.08, 0.3), layer: 1 });
  // 꼬리 비늘 사이 녹색 빛 (가끔 포자)
  if (rr.next() < dt * 1.2 * q.ambient) { const j = 3 + Math.floor(rr.next() * (n - 4)); P.emit('spore', pts[j].x, pts[j].y, rr.range(-10, 10), rr.range(-30, -10), { color: ACID, layer: 1 }); }
  st.snakeHead = [p2.x, p2.y, rot, hk, sy];
}

/**
 * 곧게 그린 부품(뿌리 root → 끝 tip, 가로)을 점 목록을 따라 세로 띠로 잘라 구부려 그린다.
 * 띠마다 setTransform 한 번 + drawImage 한 번. 굽힘 바깥쪽 틈은 띠를 겹쳐 가린다.
 * thick = 두께 배율(월드px/텍셀), flip = −1 이면 위아래 뒤집기 (좌우 반전 시 배 쪽이 곡선 안쪽을 보게)
 */
export function drawBent(ctx, D, img, part, pts, n, thick, flip, alpha = 1, taper = null) {
  if (!img || n < 2 || alpha <= 0.01) return;
  let L = 0;
  const arc = drawBent._arc ??= new Float32Array(128);
  arc[0] = 0;
  for (let i = 1; i < n; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); arc[i] = L; }
  if (L < 1) return;
  const x0 = part.root[0], x1 = part.tip[0], cy = (part.root[1] + part.tip[1]) / 2, span = x1 - x0;
  const ga = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = ga * alpha;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const seg = arc[i + 1] - arc[i]; if (seg < 0.5) continue;
    const u0 = x0 + span * (arc[i] / L), u1 = x0 + span * (arc[i + 1] / L);
    const rot = Math.atan2(c.y - a.y, c.x - a.x);
    const sx = seg / (u1 - u0);
    const th = taper ? thick * taper(i / (n - 2)) : thick;
    const e = 3 + (i < n - 2 ? Math.abs(angle(pts, i)) * part.h * 0.35 : 0);
    const s0 = Math.max(0, u0 - e), s1 = Math.min(img.width, u1 + e + 1);
    D.set(u0, cy, a.x, a.y, rot, sx, th * flip);
    ctx.drawImage(img, s0, 0, s1 - s0, img.height, s0, 0, s1 - s0, img.height);
  }
  ctx.globalAlpha = ga;
}
/**
 * 겹쳐 그리는 띠(구부린 꼬리)의 가산 섬광: 반 해상도 버퍼에 흰 실루엣을 보통 합성으로 그려(겹쳐도 한 번) 장치 좌표로 한 번만 가산한다.
 * bb = 월드 사각형 [x0,y0,x1,y1]. draw(o, D2) 는 기준 변환(카메라·DPR, 반 해상도)이 걸린 버퍼에 그린다.
 * 버퍼는 섬광이 처음 필요할 때 만들어 이 인스턴스 상태에 둔다 (≤ 화면 ¼ 크기).
 */
function flashLayer(ctx, D, st, bb, alpha, draw) {
  if (alpha <= 0.01 || typeof document === 'undefined') return;
  const m = D.m, cw = ctx.canvas?.width ?? 0, ch = ctx.canvas?.height ?? 0;
  const dx0 = Math.max(0, Math.floor(m[0] * bb[0] + m[4])), dy0 = Math.max(0, Math.floor(m[3] * bb[1] + m[5]));
  const dx1 = Math.min(cw, Math.ceil(m[0] * bb[2] + m[4])), dy1 = Math.min(ch, Math.ceil(m[3] * bb[3] + m[5]));
  if (dx1 - dx0 < 2 || dy1 - dy0 < 2) return;
  const R = 0.5, w = Math.ceil((dx1 - dx0) * R), h = Math.ceil((dy1 - dy0) * R);
  let c = st.fbuf;
  if (!c || c.width < w || c.height < h) { c = st.fbuf = document.createElement('canvas'); c.width = Math.max(w, st.fbufW ?? 0); c.height = Math.max(h, st.fbufH ?? 0); st.fbufW = c.width; st.fbufH = c.height; st.fctx = c.getContext('2d'); }
  const o = st.fctx;
  o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, w + 1, h + 1);
  o.setTransform(m[0] * R, m[1] * R, m[2] * R, m[3] * R, (m[4] - dx0) * R, (m[5] - dy0) * R);
  const D2 = st.fD ??= new Drawer();
  D2.begin(o);
  draw(o, D2);
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * alpha;
  ctx.drawImage(c, 0, 0, w, h, dx0, dy0, dx1 - dx0, dy1 - dy0);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  D.end();
}
function angle(pts, i) {
  const a = pts[i], b = pts[i + 1], c = pts[i + 2];
  if (!c) return 0;
  let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
  return Math.atan2(Math.sin(d), Math.cos(d));
}

// ───────────────────────── 유리관 ─────────────────────────
function drawTubes(ctx, D, b, rig, st, dt, tp, trot, lvl, dying, dT) {
  const R = rig.parts, q = st.q, P = st.P, t = b.t;
  const broken = b.tubesBroken || (dying && dT > 0.3);
  if (dying && dT > 0.3 && !st.gone.tubes) {
    st.gone.tubes = true;
    for (let i = 0; i < 3; i++) {
      const T = R.torso, cp = tp(T['cup' + i], _a);
      P.burst('chip', cp[0], cp[1] - 20, 8, { speed: 320, angle: -PI / 2, spread: 1.2, color: '#c8fff0' });
      P.burst('ichor', cp[0], cp[1] - 20, 8, { speed: 280, angle: -PI / 2, spread: 1.1, color: ACID_D, hi: ACID_HI });
    }
  }
  if (dying && dT > 1.6) return;
  const T = R.torso;
  for (let i = 0; i < 3; i++) {
    const tb = R[(broken ? 'tubeb' : 'tube') + i]; if (!tb) continue;
    const cp = tp(T['cup' + i], _a);
    const tilt = (i - 1) * 0.1 + Math.sin(t * 2 + i) * 0.015;
    const rot = trot + F.fsn * tilt, k = tb.k;
    D.part(tb, tb.v.base, 'base', cp[0], cp[1] + 2, rot, k * F.fs, k, 1);
    const lq = D.pt(tb.base[0], tb.base[1], tb.liq[0], tb.liq[1], cp[0], cp[1] + 2, rot, k * F.fs, k, _b);
    const top = D.pt(tb.base[0], tb.base[1], tb.top[0], tb.top[1], cp[0], cp[1] + 2, rot, k * F.fs, k, _c);
    D.end();
    const fury = b.fury ?? 0;
    if (q.halos) halo(ctx, lq[0], lq[1], 22 + fury * 10, ACID, 0.3 + fury * 0.2 + 0.08 * Math.sin(t * 3 + i * 2), true);
    // 기포 (결정론적: 시간으로 위치 계산)
    if (!broken && q.name !== 'low') {
      ctx.fillStyle = 'rgba(230,255,215,0.85)';
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        const u = ((t * (0.55 + j * 0.13) + hash1(i * 7 + j)) % 1);
        const bx = lq[0] + Math.sin(t * 3 + j * 2 + i) * 2.5, by = lq[1] + 14 - u * 30;
        ctx.moveTo(bx + 1.4, by); ctx.arc(bx, by, 1.1 + u * 0.8, 0, TAU);
      }
      ctx.fill();
    }
    if (broken) {
      // 깨진 관: 녹색 불길 + 흘러내리는 영약
      flame(ctx, top[0], top[1] + 4, -PI / 2 + Math.sin(t * 3 + i) * 0.2, 30 + fury * 12, 7, t, ACID, 0.55, i * 3, q.flames);
      if (rr.next() < dt * 6 * q.ambient) P.emit('spore', top[0] + rr.range(-4, 4), top[1], rr.range(-15, 15), rr.range(-90, -50), { color: ACID, layer: 1 });
      if (rr.next() < dt * 2 * q.ambient) P.emit('ichor', lq[0] + rr.range(-5, 5), lq[1] + 12, 0, 0, { color: ACID_D, hi: ACID_HI, hang: rr.range(0.1, 0.3), layer: 1 });
    }
  }
}

/** 방향으로 늘인 가산 퍼프 불길 (본 드래곤 soulFlame 과 같은 방식) */
function flame(ctx, x, y, ang, len, w, t, color, a, seed = 0, n = 4) {
  if (!n) return;
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

// ───────────────────────── 산양 ─────────────────────────
function drawGoat(ctx, D, b, rig, st, dt, tp, lvl, flashOn) {
  const R = rig.parts, G = R.goat, T = R.torso; if (!G) return;
  const q = st.q, t = b.t, P = st.P;
  const upk = clamp(b.goatUp ?? 0, 0, 1.2), gl = clamp(b.goatGlow ?? 0, 0, 1.2);
  const root = tp(T.goatRoot, _a);
  const rx = root[0], ry = root[1];
  // 목 끝 (산양 그림의 목 그루터기) — 솟을수록 위로, 살짝 뒤로 젖힘
  const nx = rx + F.fs * (2 + upk * 4), ny = ry - 8 - upk * 20 + Math.sin(t * 2.2) * 1.5;
  const rot = F.fsn * (-0.08 - upk * 0.22 + Math.sin(t * 1.7) * 0.03) + F.fsn * F.th;
  // 절차적 목 (접합부 봉합 + 털목)
  D.end();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(rx, ry + 4); ctx.quadraticCurveTo(rx - F.fs * 4, (ry + ny) / 2, nx, ny + 2);
  ctx.strokeStyle = 'rgba(14,8,6,0.95)'; ctx.lineWidth = 15; ctx.stroke();
  ctx.strokeStyle = '#6a604e'; ctx.lineWidth = 11; ctx.stroke();
  ctx.strokeStyle = 'rgba(190,176,150,0.55)'; ctx.lineWidth = 3; ctx.stroke();
  // 접합부 살점 + 봉합
  ctx.fillStyle = '#5a1810'; ctx.beginPath(); ctx.ellipse(rx, ry + 3, 11, 4.5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#140806'; ctx.lineWidth = 1.2; ctx.beginPath();
  for (let i = -2; i <= 2; i++) { ctx.moveTo(rx + i * 4 - 1.5, ry + 1); ctx.lineTo(rx + i * 4 + 1.5, ry + 5); }
  ctx.stroke();
  const k = G.k;
  D.rec = flashOn;
  D.part(G, pickVariant(G, lvl, false, null), 'neck', nx, ny, rot, k * F.fs, k, 1);
  if (flashOn) D.flash(st.fa);
  D.rec = false;
  glowOver(ctx, D, G, lvl, 'neck', nx, ny, rot, k * F.fs, k, 0.5, st, t + 2);
  const e = D.pt(G.neck[0], G.neck[1], G.eye[0], G.eye[1], nx, ny, rot, k * F.fs, k, _c);
  const br = D.pt(G.neck[0], G.neck[1], G.brow[0], G.brow[1], nx, ny, rot, k * F.fs, k, _d);
  const mo = D.pt(G.neck[0], G.neck[1], G.mouth[0], G.mouth[1], nx, ny, rot, k * F.fs, k, _e);
  D.end();
  if (q.halos) {
    halo(ctx, e[0], e[1], 12 + gl * 16, ACID, 0.55 + gl * 0.4, true);
    if (gl > 0.05) halo(ctx, mo[0], mo[1], 18 + gl * 22, ACID, gl * 0.45, true);
  }
  // 주문 룬 (이마 위, 회전) — 로직 goatRune 과 같은 모양
  if (gl > 0.05) {
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * clamp(gl, 0, 1);
    const cx = br[0], cy = br[1] - 30, r = 20 + gl * 4, a0 = t * 1.5;
    ctx.strokeStyle = 'rgba(124,255,90,0.85)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
    for (let i = 0; i <= 5; i++) { const a = a0 + (i * 2 / 5) * TAU - PI / 2; i ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.stroke();
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
    if (rr.next() < dt * 20 * gl * q.ambient) P.emit('spore', mo[0] + rr.range(-12, 12), mo[1] + rr.range(-12, 12), rr.range(-20, 20), rr.range(-60, -20), { color: ACID, layer: 1 });
  }
  st.goatPose = [nx, ny, rot, k * F.fs, k];
}

// ───────────────────────── 사자 머리 ─────────────────────────
function drawLion(ctx, D, b, rig, st, dt, bodyY, cr, lvl, flashOn, hit) {
  const R = rig.parts, Hd = R.lion, J = R.lion_jaw; if (!Hd || !J) return;
  const q = st.q, t = b.t, P = st.P;
  const roar = clamp(b.roar ?? 0, 0, 1.2);
  L2W(112, -118 + bodyY * 0.8 + cr * 8, _a);
  const hx = _a[0] + (st.jolt ? (rr.next() - 0.5) * 5 * st.jolt : 0), hy = _a[1];
  const hr = -roar * 0.13 + cr * 0.1 + Math.sin(t * 1.9) * 0.02 + (b.dying > 0 ? Math.sin(t * 25) * 0.06 : 0);
  const rot = wr(hr), k = Hd.k * (1 + roar * 0.03), sx = k * F.fs, sy = k;
  // 턱: 그림은 크게 벌린 입 → roar 0 이면 경첩에서 위로 닫는다
  const ja = (Math.min(1, roar) - 1) * 0.3 + Math.sin(t * 3.1) * 0.015;
  const hinge = D.pt(Hd.o[0], Hd.o[1], Hd.hinge[0], Hd.hinge[1], hx, hy, rot, sx, sy, _b);
  // 입 속 (목구멍) — 뚫린 입을 어둡게 메우고 포효 때 산성 빛
  D.set(Hd.o[0], Hd.o[1], hx, hy, rot, sx, sy);
  const TH = Hd.throat;
  ctx.beginPath(); ctx.moveTo(TH[0][0], TH[0][1]);
  for (let i = 1; i < TH.length; i++) ctx.lineTo(TH[i][0], TH[i][1]);
  ctx.closePath();
  ctx.fillStyle = '#1a0507'; ctx.fill();
  D.end();
  if (q.halos && roar > 0.15) { const c = D.pt(Hd.o[0], Hd.o[1], (TH[2][0] + TH[6][0]) / 2, (TH[2][1] + TH[6][1]) / 2, hx, hy, rot, sx, sy, _c); halo(ctx, c[0], c[1], 16 + roar * 10, ACID, 0.3 * roar); }
  D.rec = flashOn;
  D.part(J, pickVariant(J, lvl, false, null), 'hinge', hinge[0], hinge[1], rot + F.fsn * ja, sx, sy, 1);
  if (flashOn) D.flash(st.fa);   // 턱 섬광은 머리를 그리기 전에 (머리에 가려지는 턱 윗부분이 머리 위로 비치지 않게)
  D.rec = flashOn;
  D.part(Hd, pickVariant(Hd, lvl, false, null), 'o', hx, hy, rot, sx, sy, 1);
  if (flashOn) D.flash(st.fa);
  D.rec = false;
  glowOver(ctx, D, Hd, lvl, 'o', hx, hy, rot, sx, sy, 0.55, st, t + 3, b.state === 'transform');
  const e = D.pt(Hd.o[0], Hd.o[1], Hd.eye[0], Hd.eye[1], hx, hy, rot, sx, sy, _c);
  const dr = D.pt(Hd.hinge[0], Hd.hinge[1], J.drip[0], J.drip[1], hinge[0], hinge[1], rot + F.fsn * ja, sx, sy, _d);
  D.end();
  const fury = b.fury ?? 0;
  if (q.halos) halo(ctx, e[0], e[1], 10 + fury * 8 + roar * 4, b.enraged ? ACID : '#b8ff7a', 0.5 + fury * 0.35, true);
  // 산성 침 (턱에서 매달렸다 떨어짐)
  if (rr.next() < dt * (1.2 + roar * 6 + lvl) * q.ambient) P.emit('ichor', dr[0] + rr.range(-4, 4), dr[1], 0, 0, { color: ACID_D, hi: ACID_HI, hang: rr.range(0.15, 0.45), layer: 1 });
  if (roar > 0.7 && rr.next() < dt * 8 * q.ambient) P.emit('spore', dr[0], dr[1] - 10, F.fs * rr.range(40, 120), rr.range(-40, 10), { color: ACID, layer: 1 });
  st.lionPose = [hx, hy, rot, sx, sy, hinge[0], hinge[1], rot + F.fsn * ja];
}

// ───────────────────────── 잔상 / 균열 발광 ─────────────────────────
function trailFx(ctx, D, b, st, T, tx, ty, trot, tsx, tsy, q, dying) {
  const tr = st.trail;
  const fast = !dying && Math.abs(b.vx ?? 0) > 480;
  if (fast) { tr.unshift(tx, ty, trot, tsx, tsy); if (tr.length > 20) tr.length = 20; }
  else if (tr.length) tr.length = Math.max(0, tr.length - 5);
  if (!q.smear || tr.length < 10 || !T.v.glow) return;
  const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
  for (let j = 1; j < 4; j++) {
    const o = j * 5; if (tr.length < o + 5) break;
    D.img(T.v.glow, T.c[0], T.c[1], tr[o], tr[o + 1], tr[o + 2], tr[o + 3], tr[o + 4], 0.2 / j);
  }
  ctx.globalCompositeOperation = op;
}
/** 손상 단계 균열 발광 오버레이 (반 해상도, 가산, 맥동) — 실제로 그려진 변형의 균열에만 */
function glowOver(ctx, D, part, lvl, pivot, x, y, rot, sx, sy, a, st, t, boost = false) {
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 || part.v.deep_dmg1) ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? part.gl.dmg2 : part.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? part[pivot] : pivot;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + part.w * 0.01)) * (boost ? 1.8 : 1) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 사망 붕괴 ─────────────────────────
// 0.3 s 관 파열 → 0.6 s 뱀 꼬리 절단 → 1.0 s 산양 머리 → 1.3 s 사자 머리 → 1.1–1.9 s 몸통 주저앉음 → 2.0 s (최종 섬광) 몸통 붕괴 → 2.35 s 까지 모두 사라짐
function deathFx(ctx, D, b, rig, st, dt, dT, tp, trot, tsx, tsy, tx, ty) {
  const R = rig.parts, P = st.P, sh = st.shards, fade = Math.max(0.2, 2.35 - dT), f = F.fs;
  if (!st.deathBurst && dT > 0.05) {
    st.deathBurst = true;
    L2W(0, -100, _a);
    P.burst('ichor', _a[0], _a[1], 14, { speed: 320, angle: -PI / 2, spread: 1.4, color: ACID_D, hi: ACID_HI });
  }
  if (!st.gone.snake && dT > 0.6 && st.tail) {
    st.gone.snake = true;
    const pts = st.tail, a = pts[2], c = pts[13] ?? pts[pts.length - 1];
    const Sn = R.snake;
    if (Sn) sh.spawn(Sn.v.dmg2 ?? Sn.v.base, (Sn.root[0] + Sn.tip[0]) / 2, (Sn.root[1] + Sn.tip[1]) / 2, (a.x + c.x) / 2, (a.y + c.y) / 2, Math.atan2(c.y - a.y, c.x - a.x), Sn.k * 0.9, Sn.k * F.fsn, -f * 120, -260, rr.range(-3, 3), { r: 14, fade, bounce: 0.3 });
    const hp = st.snakeHead, H = R.shead;
    if (hp && H) sh.spawn(H.v.base, H.neck[0], H.neck[1], hp[0], hp[1], hp[2], hp[3], hp[4], -f * 200, -380, rr.range(-8, 8), { r: 12, fade });
    P.burst('ichor', a.x, a.y, 10, { speed: 260, color: ACID_D, hi: ACID_HI });
  }
  if (!st.gone.goat && dT > 1.0 && st.goatPose) {
    st.gone.goat = true;
    const [x, y, r, sx, sy] = st.goatPose, G = R.goat;
    sh.spawn(G.v.dmg2 ?? G.v.base, G.neck[0], G.neck[1], x, y, r, sx, sy, -f * 160, -520, -f * 6, { r: 22, fade, bounce: 0.3 });
    P.burst('ichor', x, y, 12, { speed: 300, angle: -PI / 2, spread: 0.8, color: '#3a0808', hi: '#ff6a5a' });
    P.burst('spore', x, y, 16, { speed: 140, color: ACID });
  }
  if (!st.gone.lion && dT > 1.3 && st.lionPose) {
    st.gone.lion = true;
    const [x, y, r, sx, sy, jx, jy, jr] = st.lionPose, Hd = R.lion, J = R.lion_jaw;
    sh.spawn(J.v.dmg2 ?? J.v.base, J.hinge[0], J.hinge[1], jx, jy, jr, sx, sy, f * 220, -240, f * 7, { r: 14, fade, bounce: 0.35 });
    sh.spawn(Hd.v.dmg2 ?? Hd.v.base, Hd.o[0], Hd.o[1], x, y, r, sx, sy, f * 150, -330, f * 3.5, { r: 40, fade, bounce: 0.25 });
    P.burst('ichor', x, y + 20, 16, { speed: 300, color: '#3a0808', hi: '#ff6a5a' });
    P.burst('chip', x, y, 10, { speed: 260, color: '#b0854a' });
  }
  if (!st.gone.body && dT > 2.0) {
    st.gone.body = true;
    const T = R.torso, core = tp(T.core, _a);
    // 몸통이 채색 조각으로 터진다 (몸통 자체는 발광 실루엣으로 번쩍이며 사라짐)
    for (let i = 0; i < 9 && st.debris.length; i++) {
      const p = R[st.debris[i % st.debris.length]], a = -PI / 2 + (rr.next() - 0.5) * 2.6, sp = rr.range(260, 540);
      sh.spawn(p.v.base, p.c[0], p.c[1], core[0] + rr.range(-60, 60), core[1] + rr.range(-20, 20), rr.next() * TAU, p.k * rr.sign(), p.k, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-9, 9), { r: (p.r ?? 10) * 0.6, fade: 0.35 });
    }
    for (const L of st._legs ?? []) {
      if (L.fx == null) continue;
      const Lg = R[L.part];
      sh.spawn(pickVariant(Lg, 2, L.far, null), Lg.foot[0], Lg.foot[1], L.fx, L.fy, L.rot, Lg.k * f, Lg.k, rr.range(-120, 120), rr.range(-260, -120), rr.range(-5, 5), { r: 18, fade: 0.35 });
    }
    P.burst('ichor', core[0], core[1], 24, { speed: 420, angle: -PI / 2, spread: 1.5, color: ACID_D, hi: ACID_HI });
    P.burst('spore', core[0], core[1], 30, { speed: 260, color: ACID });
    P.burst('chip', core[0], core[1], 18, { speed: 380, color: '#b0854a' });
    st.bodyFlash = { tx, ty, trot, tsx, tsy };
  }
  if (st.gone.body && st.bodyFlash && dT < 2.3) {
    const T = R.torso, bf = st.bodyFlash, g = T.v.glow ?? T.v.flash;
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    D.img(g, T.c[0], T.c[1], bf.tx, bf.ty, bf.trot, bf.tsx, bf.tsy, clamp((2.3 - dT) / 0.3, 0, 1) * 0.8);
    ctx.globalCompositeOperation = op;
  }
  // 몸부림 중 산성 분출
  if (dT < 2 && rr.next() < dt * 10) { L2W(rr.range(-90, 90), rr.range(-150, -60), _a); P.emit('ichor', _a[0], _a[1], rr.range(-80, 80), rr.range(-300, -120), { color: ACID_D, hi: ACID_HI, layer: 1 }); }
}
