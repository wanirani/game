// 네메인 (b_nemain) — 채색 컷아웃 퍼핏 렌더러 (EX2-BOSS, docs/specs/ex_s22.md §2.2)
// 부품 (Kling, tools/painted/prompts/ex2-boss.mjs · configs/b_nemain.json): 망토 없는 옆모습 전신에서 잘라 낸 몸통 · 넓적다리 · 정강이(장화) ·
//   가면 머리 / 반쯤 벗겨진 가면의 맨얼굴 머리 · 위팔(까마귀 해골 어깨받이) · 아래팔+주먹 · 까마귀 부리 단검 · 날개처럼 펼친 깃털 망토
//   (날개 한 장 = 먼 쪽 deep · 가까운 쪽 거울 + 진홍 뒤판 3띠) · 붉은 눈 까마귀 2프레임(날개 위/아래) · 가면 파편 2 · 깃털 2 · 옻칠 조각 2
// 움직임은 전부 로직(src/game/bosses/e_nemain.js)의 값을 읽기만 한다:
//   boss { zx, fy, fk, facing, sink, swarm, dark, vanishK, ghost, stunned, cWin, masked, maskBreakT, dmg, daggersDown, ps{spread,kneel,…},
//          pts{hip, neck, head, shN/shF, elN/elF, hdN/hdF, dgN/dgF, knN/knF, ftN/ftF, eye, tA, hA} · flock{x,y,ph,a,mode} · walkK · t · flashT · hitPart · A.floor }
// 상태별 표현: 대기(망토 뒤판 물결 · 붉은 눈 깜빡임) · 던지기(팔) · 가라앉음/솟아오름(바닥 아래로 잘림 + 그림자 웅덩이) · 펼친 망토(소환·둥지·폭풍) ·
//   무릎(stagger·굴복) · 손상 0–2(가면 금이 커진다 · 구운 균열) · 피격 섬광(맞은 부위만) · 가면이 깨지는 순간(가면 파편 두 쪽이 강체로 튄다) ·
//   까마귀 떼(그리는 수 = 품질 × 40, 최소 16) · 그믐(붉은 눈 한 쌍) · 굴복(단검 두 자루가 바닥에 · 무릎 · 아케이드는 까마귀로 흩어짐)
// 좌표: 로직과 같은 몸 지역 좌표 (원점 = 발 가운데 바닥 zx,fy, 좌우 fk, +x = 얼굴 쪽, y 아래가 양수)
import { Drawer, Particles, Shards, Strand, drawStrand, halo, rr, hash1, loadRig, pickVariant, quality, QUALITY } from '../kit.js';

const DIR = 'painted/bosses/b_nemain';
const PI = Math.PI, TAU = PI * 2;
const CRIM = '#c0142a', CRIM_L = '#ff4a6a', EYE = '#ff3a50', FEATHER = 'rgba(20,16,26,0.9)';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);
// 가면 파편의 푸른 눈빛 → 진홍 (debris 원본의 눈이 청록) — 'red' 틴트로 굽는다
const RED_RULES = [
  { when: (h, s, l) => h > 160 && h < 250 && s > 0.3 && l > 0.25, h: 352, s: 1.0, l: 0.9 },
  { when: () => true, dh: 0, s: 1, l: 1 },
];
const DEF = {
  glow: '#ff4a6a',
  outline: { width: 1.3, color: 'rgba(6,3,8,0.9)' },
  parts: {
    torso: { flash: true, cracks: 3, char: 0.25, holes: 0, crackMinLum: 45 },
    headM: { flash: true, cracks: 3, char: 0.15, holes: 0, crackMinLum: 30 },
    headB: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 60 },
    thigh: { flash: true, cracks: 1, char: 0.2, holes: 0, deep: 0.55 },
    shin: { flash: true, cracks: 1, char: 0.2, holes: 0, deep: 0.55 },
    armU: { flash: true, cracks: 1, char: 0.2, holes: 0, deep: 0.55 },
    armF: { flash: true, cracks: 1, char: 0.15, holes: 0, deep: 0.55 },
    dagger: { noDmg: true, deep: 0.6 },
    wing: { cracks: 1, char: 0, holes: 1, membrane: true, deep: 0.6 },
    clkA: { cracks: 1, char: 0, holes: 1, membrane: true },
    clkB: { cracks: 1, char: 0, holes: 1, membrane: true },
    clkC: { cracks: 1, char: 0, holes: 2, membrane: true },
  },
  prefix: { crow: { noDmg: true, outline: 1.0 }, deb: { noDmg: true, outline: 1.0 } },
  tints: { red: { rules: RED_RULES, parts: ['debMskA', 'debMskB'], levels: ['base'] } },
};
const NF = 40;
const CLOAK_EYES = Array.from({ length: 12 }, (_, i) => ({ u: 0.15 + hash1(i * 3.3) * 0.8, v: hash1(i * 7.1) - 0.5, k: hash1(i * 9.9) * 10, s: 0.7 + hash1(i * 1.7) * 0.6 }));

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_nemain', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(24), q,
      hair: [new Strand(7, 4.2, { g: 700, damp: 0.9 }), new Strand(6, 4, { g: 700, damp: 0.9 })],
      lt: null, pf: 0, fp: null, jolt: 0, maskT: -1, lvl: 0, W: [0, 0], E: [0, 0], ff: {}, debris: Object.keys(rig.parts).filter((n) => n.startsWith('deb')),
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.zx ?? b.cx, Y = b.fy ?? b.bottom;
    let x0 = X - 320, x1 = X + 320, y0 = Y - 400, y1 = Y + 30;
    const F = b.flock;
    if (F?.a > 0.01) for (let i = 0; i < NF; i++) { const x = F.x[i], y = F.y[i]; if (x - 40 < x0) x0 = x - 40; if (x + 40 > x1) x1 = x + 40; if (y - 40 < y0) y0 = y - 40; if (y + 40 > y1) y1 = y + 40; }
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 30 < x0) x0 = px - 30; if (px + 30 > x1) x1 = px + 30; if (py - 30 < y0) y0 = py - 30; if (py + 30 > y1) y1 = py + 30; }
    if (st?.shards?.list.length) for (const s of st.shards.list) { if (s.x - 60 < x0) x0 = s.x - 60; if (s.x + 60 > x1) x1 = s.x + 60; if (s.y - 60 < y0) y0 = s.y - 60; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    if (st.flashL > 0.05) L.add(st.flashW?.[0] ?? b.zx, st.flashW?.[1] ?? b.fy - 130, 180, CRIM_L, st.flashL * 0.6);
  },
  /** 월드 파편(spawnDebris)용 채색 조각 */
  debris(i, rig) {
    const names = Object.keys(rig.parts).filter((n) => n.startsWith('deb')); if (!names.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.9;
    return { size: Math.max(8, (p.w + p.h) * 0.25 * p.k), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P, R = rig.parts;
  st.q = qOf(world.game);
  const q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const floor = b.A.floor, t = b.t, s = b.ps, pt = b.pts;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0;
  st.lvl = clamp(b.dmg | 0, 0, 2);
  // 피격 부위 고정 (섬광이 다시 켜진 프레임의 b.hitPart)
  if (b.flashT > st.pf + 1e-4) st.fp = b.hitPart ?? null;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 7);
  st.flashL = Math.max(0, (st.flashL ?? 0) - dt * 3);
  const fOn = b.flashT > 0 && !dying, fp = st.fp, ff = st.ff;
  ff.head = fOn && (!fp || fp === b.pHead);
  ff.body = fOn && (!fp || fp === b.pBody || fp === b.pCloak);
  ff.legs = fOn && (!fp || fp === b.pLegs);
  if (b.state === 'intro' || (b.hp >= b.stats.maxHp && !dying)) { st.shards.clear(); }
  const X = b.zx, Y = b.fy + (b.sink ?? 0) * 170, fk = Math.abs(b.fk) < 0.02 ? 0.02 * Math.sign(b.fk || 1) : b.fk;
  const W = (lx, ly, out = st.W) => { out[0] = X + fk * lx; out[1] = Y + ly; return out; };
  const bodyA = clamp(1 - (b.swarm ?? 0), 0, 1) * (1 - 0.92 * clamp(b.dark ?? 0, 0, 1)) * (1 - (b.vanishK ?? 0));
  const ga = ctx.globalAlpha;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  // 가면이 깨진 순간 (로직 maskBreakT 가 바뀐 프레임) → 가면 파편 두 쪽이 강체로 튄다
  if (b.maskBreakT > 0 && b.maskBreakT !== st.maskT) { st.maskT = b.maskBreakT; maskBreak(b, rig, st, W); }
  if (b.maskBreakT < 0) st.maskT = -1;
  // ── 뒤층: 그림자 웅덩이 ──
  shadowPool(ctx, b, st, t);
  P.draw(ctx, 0);
  if (bodyA > 0.01) {
    ctx.globalAlpha = ga * bodyA;
    D.begin(ctx);
    D.save();
    ctx.beginPath(); ctx.rect(X - 3000, floor - 4000, 6000, 4000); ctx.clip();   // 바닥 아래는 그리지 않는다 (가라앉음 · 망토 끌림)
    ctx.translate(X, Y); ctx.scale(fk, 1);
    D.begin(ctx);
    D.rec = false; D.log.length = 0;
    const jr = st.jolt ? (rr.next() - 0.5) * 0.04 * st.jolt : 0;
    const sp = clamp(s.spread, 0, 1);
    // 1) 펼친 날개 (먼 쪽 deep · 가까운 쪽 거울) — 몸 뒤
    if (sp > 0.04) {
      wing(D, R.wing, pt, sp, t, true);
      wing(D, R.wing, pt, sp, t, false);
    }
    // 2) 진홍 뒤판 3띠 (어깨에서 뒤로 끌린다 — 물결)
    drape(D, ctx, rig, b, pt, sp, t, st);
    // 3) 먼 팔 · 먼 다리 (deep)
    arm(D, R, pt.shF, pt.elF, pt.hdF, pt.dgF, true, st.lvl, b.daggersDown);
    leg(D, R, { x: pt.hip.x - 4, y: pt.hip.y - 1 }, pt.knF, pt.ftF, true, st.lvl);
    // 4) 가까운 다리 · 몸통
    D.rec = ff.legs; leg(D, R, pt.hip, pt.knN, pt.ftN, false, st.lvl); D.rec = false;
    D.rec = ff.body; segment(D, R.torso, 'hip', 'nk', pt.hip.x, pt.hip.y, pt.neck.x, pt.neck.y, st.lvl, false, jr, 0.92, 1.12); D.rec = false;
    // 5) 뒷머리 가닥 (verlet, 지역 좌표에서 시뮬레이션)
    hair(ctx, D, b, pt, st, dt, q);
    // 6) 머리 (가면 / 맨얼굴)
    D.rec = ff.head; head(D, ctx, R, b, pt, st, jr); D.rec = false;
    // 7) 가까운 팔 (몸 앞)
    D.rec = ff.body; arm(D, R, pt.shN, pt.elN, pt.hdN, pt.dgN, false, st.lvl, b.daggersDown); D.rec = false;
    if (fOn) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.6);
    else { D.rec = false; D.log.length = 0; }
    D.end();
    // 8) 빛: 눈 · 망토 자락의 붉은 눈 (지역 좌표)
    eyes(ctx, b, pt, sp, t, st, q);
    D.restore();
    ctx.globalAlpha = ga;
  }
  // ── 월드: 떨어진 단검 · 파편 · 까마귀 떼 · 그믐의 눈 · 입자 ──
  D.begin(ctx);
  if (b.daggersDown && dying && (b.vanishK ?? 0) < 1) {
    const dg = R.dagger, k = dg.k;
    for (const [dx, a] of [[22, 0.06], [40, -0.1]]) D.part(dg, dg.v.base, 'grip', X + (b.facing || 1) * dx, floor - 2.5, (b.facing < 0 ? 0 : PI) + a, k, k * (b.facing < 0 ? 1 : -1), 1 - (b.vanishK ?? 0));
  }
  st.shards.draw(D);
  flock(D, b, rig, world);
  D.end();
  if ((b.dark ?? 0) > 0.4 && !dying) {
    const e = W(pt.eye.x, pt.eye.y, st.E), a = clamp(((b.dark ?? 0) - 0.4) / 0.6, 0, 1) * (b.ghost ? 0.6 : 1);
    for (const dx of [-5, 5]) { halo(ctx, e[0] + dx, e[1], 18, CRIM_L, 0.7 * a); halo(ctx, e[0] + dx, e[1], 5, '#ffffff', 0.85 * a, true); }
  }
  ambient(P, b, st, W, dt, q, hit, t, bodyA);
  P.draw(ctx, 1);
  ctx.globalAlpha = ga;
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 부품 배치 ─────────────────────────
/** 두 점을 잇는 부품 (피벗 a → b 벡터를 로직 (ax,ay) → (bx,by) 에 맞춰 돌리고, 길이 비율을 lo..hi 로 늘인다) */
function segment(D, p, pa, pb, ax, ay, bx, by, lvl, deep, jr = 0, lo = 0.85, hi = 1.18, flipY = false) {
  const A = p[pa], B = p[pb];
  const ix = B[0] - A[0], iy = B[1] - A[1];
  const lx = bx - ax, ly = by - ay;
  const rot = Math.atan2(ly, lx) - Math.atan2(iy, ix) + jr;
  const k = p.k * clamp(Math.hypot(lx, ly) / (Math.hypot(ix, iy) * p.k || 1), lo, hi);
  D.part(p, pickVariant(p, lvl, deep, null), pa, ax, ay, rot, k, flipY ? -k : k);
}
function leg(D, R, H, K, F, far, lvl) {
  segment(D, R.thigh, 'hip', 'kn', H.x, H.y, K.x, K.y, lvl, far, 0, 0.82, 1.15);
  segment(D, R.shin, 'kn', 'sole', K.x, K.y, F.x, F.y, lvl, far, 0, 0.78, 1.12);
}
function arm(D, R, S, E, H, Dg, far, lvl, dropped) {
  if (!dropped) {
    // 단검: 주먹(grip) → 칼끝(tip) 을 로직 손 → 단검 끝에 (먼 팔이면 deep)
    const dg = R.dagger;
    segment(D, dg, 'grip', 'tip', H.x, H.y, Dg.x, Dg.y, 0, far, 0, 0.9, 1.1);
  }
  segment(D, R.armU, 'sh', 'el', S.x, S.y, E.x, E.y, lvl, far, 0, 0.85, 1.15);
  segment(D, R.armF, 'el', 'hd', E.x, E.y, H.x, H.y, lvl, far, 0, 0.85, 1.15);
}
/** 날개 한 장 (먼 = 뒤·위로, 가까운 = 거울로 앞·위로). 펼침 sp 만큼 늘어나고 펼쳐진다 */
function wing(D, p, pt, sp, t, far) {
  const ix = p.tip[0] - p.root[0], iy = p.tip[1] - p.root[1];
  const want = far ? lerp(1.9, -2.45, sp) : lerp(1.2, -0.75, sp);
  const flap = Math.sin(t * 3.1 + (far ? 0.5 : 0)) * 0.05 * sp;
  const k = p.k * (0.3 + 0.7 * sp) * (far ? 0.92 : 1);
  const dirArt = Math.atan2(iy, far ? ix : -ix);   // 거울(가까운 날개)이면 그림의 뿌리→끝 방향도 x 반전
  D.part(p, pickVariant(p, 0, far, null), 'root', pt.shN.x - 4, pt.shN.y - 2, want - dirArt + flap, far ? k : -k, k);
}
/** 진홍 뒤판 3띠: 어깨 뒤에서 매달려 아래로 이어지는 사슬 (띠마다 조금씩 더 뒤로 끌리고 물결친다). 펼치면 넓어진다 */
function drape(D, ctx, rig, b, pt, sp, t, st) {
  const parts = [rig.parts.clkA, rig.parts.clkB, rig.parts.clkC];
  const kn = clamp(b.ps.kneel, 0, 1), walk = b.walkK ?? 0;
  const sxK = lerp(0.42, 0.95, sp);
  let x = pt.shN.x - 7, y = pt.shN.y - 4;
  let rot = 0.12 + 0.12 * walk + 0.25 * kn - 0.05 * sp;
  for (let i = 0; i < 3; i++) {
    const p = parts[i];
    const wave = Math.sin(t * 2.2 - i * 0.9) * (0.05 + 0.04 * i) + Math.sin(t * 5.3 + i) * 0.015 * walk;
    rot += (i ? 0.08 + 0.1 * walk + 0.25 * kn : 0) + wave;
    const k = p.k, len = (p.bot[1] - p.top[1]) * k;
    D.part(p, pickVariant(p, st.lvl, false, null), 'top', x, y, rot, k * sxK, k);
    x += -Math.sin(rot) * (len - 3); y += Math.cos(rot) * (len - 3);
  }
}
function head(D, ctx, R, b, pt, st, jr) {
  const masked = b.masked, p = masked ? R.headM : R.headB;
  const lvl = masked ? clamp(b.dmg | 0, 0, 1) : 0;
  const rot = (pt.hA ?? 0) * 0.9 + jr;
  D.part(p, pickVariant(p, lvl, false, null), 'nk', pt.neck.x + 1, pt.neck.y + 3, rot, p.k, p.k);
  // 눈 위치 (지역 좌표) — eyes() 가 쓴다
  const e = D.pt(p.nk[0], p.nk[1], p.eye[0], p.eye[1], pt.neck.x + 1, pt.neck.y + 3, rot, p.k, p.k, st.E);
  st.eyeL = st.eyeL ?? [0, 0]; st.eyeL[0] = e[0]; st.eyeL[1] = e[1];
}
/** 뒷머리 두 가닥 (은빛): 머리 뒤에서 흘러내려 걸음·바람에 흔들린다 */
function hair(ctx, D, b, pt, st, dt, q) {
  if (q.strands <= 0) return;
  const hx = pt.head.x - 9, hy = pt.head.y - 2, walk = b.walkK ?? 0;
  D.end();
  for (let i = 0; i < st.hair.length; i++) {
    const S = st.hair[i];
    S.wx = -260 * (0.4 + walk) - 60 * Math.sin(b.t * 1.7 + i);
    S.step(dt, hx - i * 2, hy + i * 3);
    drawStrand(ctx, S, 3.2 - i * 0.6, ['#2a2a36', '#9a9eae', '#e4e6f0'], 0.95);
  }
  D.begin(ctx);
}
/** 빛: 붉은 눈 (가면 눈구멍 · 맨얼굴) + 망토 자락의 깜빡이는 붉은 눈 (지역 좌표) */
function eyes(ctx, b, pt, sp, t, st, q) {
  const e = st.eyeL;
  if (e) {
    const k = 0.75 + 0.25 * Math.sin(t * 5);
    if (q.halos) halo(ctx, e[0], e[1], 6.5, CRIM_L, 0.45 * k);
    halo(ctx, e[0], e[1], 2.2, '#ffd0d8', 0.8 * k, true);
  }
  if (!q.halos) return;
  // 망토 자락의 붉은 눈: 뒤판을 따라 흩어진 점 (어깨 → 밑단), 깜빡인다
  const x0 = pt.shN.x - 12, y0 = pt.shN.y + 10, kn = clamp(b.ps.kneel, 0, 1);
  for (let i = 0; i < CLOAK_EYES.length; i++) {
    const E = CLOAK_EYES[i];
    const open = Math.sin(t * 0.9 + E.k) > -0.5;
    if (!open) continue;
    const yy = y0 + E.u * (Math.abs(pt.shN.y) - 14) * (1 - 0.3 * kn), xx = x0 - E.u * (22 + 30 * kn) + E.v * lerp(14, 60, sp);
    halo(ctx, xx, yy, 5 * E.s, CRIM_L, 0.55);
  }
}
/** 그림자 웅덩이 (가라앉음 · 그림자 걸음 이동) — 월드 좌표 */
function shadowPool(ctx, b, st, t) {
  const sk = Math.max(b.sink ?? 0, b.state === 'shadowStep' && b.ghost ? 1 : 0);
  if (sk < 0.04) return;
  const x = b.zx, y = b.A.floor;
  ctx.save();
  ctx.fillStyle = `rgba(6,2,8,${(0.55 + 0.3 * sk).toFixed(3)})`;
  ctx.beginPath(); ctx.ellipse(x, y - 3, 46 + 30 * sk, 9 + 4 * sk, 0, 0, TAU); ctx.fill();
  if (st.q.halos) for (let i = 0; i < 5; i++) { const u = hash1(i * 3.1 + Math.floor(t * 8)) - 0.5; halo(ctx, x + u * 90 * sk, y - 5 - hash1(i * 7.7) * 6, 9, CRIM_L, 0.5 * sk); }
  ctx.restore();
}
/** 까마귀 떼: 그리는 수 = 품질 × 40 (최소 16) — 날개 위/아래 두 장을 번갈아 */
function flock(D, b, rig, world) {
  const F = b.flock;
  if (!F || F.a <= 0.01) return;
  const n = clamp(Math.round(NF * (world.fx?.quality ?? 1)), 16, NF);
  const U = rig.parts.crowU, Dn = rig.parts.crowD;
  const a = clamp(F.a, 0, 1);
  const moving = F.mode === 'burst' || F.mode === 'up';
  for (let i = 0; i < n; i++) {
    const up = Math.sin(F.ph[i]) > 0, p = up ? U : Dn;
    const dir = moving ? (F.vx[i] >= 0 ? 1 : -1) : (Math.cos(F.ph[i] * 0.2) >= 0 ? 1 : -1);
    const sc = (0.55 + hash1(i * 3.3) * 0.3) * (46 / Math.max(1, (p.w - p.pad * 2) * p.k)) * p.k;
    D.part(p, p.v.base, 'c', F.x[i], F.y[i], 0, dir * sc, sc, a);
  }
}
/** 가면이 깨진 순간: 가면 파편 두 쪽(진홍 틴트) + 옻칠 조각 + 깃털 */
function maskBreak(b, rig, st, W) {
  const R = rig.parts, pt = b.pts, c = W(pt.head.x + 4, pt.head.y - 2, [0, 0]);
  const pieces = [['debMskA', 1], ['debMskB', -1], ['debLq1', 1], ['debLq2', -1], ['debFth', 1]];
  for (const [name, side] of pieces) {
    const p = R[name]; if (!p) continue;
    const img = p.v.red_base ?? p.v.base, s = p.k * (name.startsWith('debMsk') ? 1 : 0.9);
    st.shards.spawn(img, p.c[0], p.c[1], c[0], c[1], rr.range(-0.5, 0.5), s * (b.facing || 1), s, side * (b.facing || 1) * rr.range(90, 220), rr.range(-420, -260), rr.range(-7, 7), { r: 6, bounce: 0.3, fade: 2.6 });
  }
  st.P.burst('spark', c[0], c[1], 14, { speed: 360, color: CRIM_L });
  st.flashL = 1; st.flashW = [c[0], c[1]];
}
function ambient(P, b, st, W, dt, q, hit, t, bodyA) {
  const amb = q.ambient;
  if (b.dying > 0) {
    // 굴복: 망토에서 깃털이 흩날린다 (0–2초)
    if ((b.dieT ?? 0) < 2 && rr.next() < dt * 24 * amb) { const p = W(rr.range(-50, -10), rr.range(-120, -30), [0, 0]); P.emit('ash', p[0], p[1], rr.range(-60, 60), rr.range(-160, -60), { color: FEATHER, size: rr.range(2, 3.4), life: rr.range(1.2, 2.2), layer: 1 }); }
    return;
  }
  if (bodyA < 0.3) return;
  // 망토에서 떨어지는 검은 깃털 가루
  if (rr.next() < dt * (1.5 + 3 * clamp(b.ps.spread, 0, 1)) * amb) { const p = W(rr.range(-60, -14), rr.range(-110, -10), [0, 0]); P.emit('ash', p[0], p[1], rr.range(-30, 10), rr.range(-30, 20), { color: FEATHER, size: rr.range(1.6, 2.8), life: rr.range(1.4, 2.4), layer: 0 }); }
  // 카운터 창 (솟아오름) — 진홍 섬광
  if (b.cWin && rr.next() < dt * 30 * amb) { const p = W(rr.range(-20, 20), rr.range(-120, -20), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-160, 160), rr.range(-200, 40), { color: CRIM_L }); }
  if (b.stunned && rr.next() < dt * 10 * amb) { const p = W(rr.range(-20, 20), rr.range(-100, -40), [0, 0]); P.emit('ash', p[0], p[1], rr.range(-20, 20), rr.range(-60, -20), { color: FEATHER, life: 1.2, layer: 1 }); }
  if (hit) {
    const hp = st.fp, p = st.W2h ??= [0, 0];
    if (hp) { p[0] = hp.x + hp.w / 2 + rr.range(-6, 6); p[1] = hp.y + hp.h / 2 + rr.range(-6, 6); } else W(rr.range(-10, 10), rr.range(-100, -40), p);
    P.burst('chip', p[0], p[1], 4, { speed: 220, color: hp === b.pHead && b.masked ? '#3a3a48' : '#201a26' });
    P.burst('spark', p[0], p[1], 4, { speed: 260, color: CRIM_L });
  }
}
