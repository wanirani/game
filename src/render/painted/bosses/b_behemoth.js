// 베헤모스 (b_behemoth) — 채색 컷아웃 퍼핏 렌더러 (ART-BOSS-7)
// 부품 (Kling, tools/painted/prompts/art-boss-7.mjs): 털가죽 반쪽 · 드러난 멧돼지 두개골 머리(빛나는 버섯 · 피 흐르는 썩은 구멍, 경첩 아래턱 분리) ·
//   구멍이 숭숭 뚫린 이끼 가죽 몸통(등가시 · 찢긴 옆구리 갈비 · 초록빛 구멍 · 꼬리) · 다리 두 벌(이끼 나무 다리 + 발굽: 넙다리 / 정강이+발 두 조각) ·
//   포자 주머니 3종 + 터진 주머니 2종 · 무릎 상처(드러난 무릎뼈 · 흐르는 피) · 죽은 나무 3 · 거대 버섯 2 + 버섯 무리 · 흰 꽃(사망 때 핀다) ·
//   균사의 여왕(잠듦/깨어남 · 두 팔을 치켜든 비명) · 파편 8 (살점 · 뼈 · 나무껍질 · 버섯)
// 움직임은 전부 로직(src/game/bosses/d_behemoth.js)의 값을 읽기만 한다:
//   boss { bx, by, facing, turnK, pose{rear,kneel,slump,lie,roar,headDown,scrape,breath,qRaise,pulse}, bodyA, drop, headA, jawK,
//          legs[{side,near,hipL,kneeL,footL}], sacs[{i,lx,ly,alive,grow,hitT}], queenAwake, queenAct, queenGlow, queenP, dmgStage, kneeling, stunned,
//          rushing, qFall{x,y,rot}, bloomK, dying, dieT, hp, stats.maxHp, flashT, t, A.floor }
// 상태별 표현: 걷기/돌진(다리 IK · 발 먼지) · 포효(턱 벌림 · 고개 젖힘) · 앞발 치켜들기(rear) · 땅 긁기 · 뿌리/포자 폭발(주머니 맥동 · 포자) ·
//   부패의 숨(입속 초록 빛) · 무릎 꿇음(kneel: 앞다리 꺾임 · 여왕이 바닥−150 까지 흘러내린다) · 기절(주머니를 모두 터뜨림: 터진 주머니 · 주저앉음) ·
//   페이즈 1 여왕 깨어남(어두운 변형 → 밝은 변형 · 눈 빛) · 페이즈 2 여왕 비명(두 팔 치켜든 그림) · 손상 단계(구운 균열 + 초록 균열 발광,
//   P2 가운데 나무 부러짐 + 앞 무릎 상처, P3 뒤 나무 부러짐 + 뒤 무릎 상처 + 두개골 금 + 버섯이 부풀어 빛남) · 피격 섬광(두개골 · 몸통 · 여왕)
// 사망 4.0초: 0.4초 주머니가 모두 터짐 → 0.9초 여왕이 시들어 떨어짐(로직 qFall) → 1.1–1.7초 나무가 부러져 쓰러짐 → 짐승이 눕고 등에 흰 꽃이 핀다 → 3.2초부터 흐려짐
// 좌표: 로직과 같은 몸 지역 좌표 (원점 = 몸 가운데 바닥, 오른쪽 = 앞). 그림은 turnK(−1~1)로 종이처럼 뒤집는다 (로직 벡터 그림과 같음).
import { Particles, DamageState, Shards, Drawer, halo, rr, hash1, loadRig, pickVariant, quality, QUALITY, ledgesOver } from '../kit.js';

const DIR = 'painted/bosses/b_behemoth';
const PI = Math.PI, TAU = PI * 2;
const GLOW = '#9ad040', SPORE = '#c8ff6a', SPORE_L = '#e8ffb0', ROT = '#2a3010', ROT_HI = '#8ab83a', BLOOD = '#3a0806', BLOOD_HI = '#9a2a1a';
const PIVOT = [-150, -178], NECK = [190, -218], QBASE = [80, -318];   // 로직 d_behemoth.js 와 같은 값
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);

/** 굽기 옵션. 피격 섬광 = 판정 부위(두개골 · 턱 · 몸통 · 여왕 · 주머니) */
const DEF = {
  glow: GLOW,
  outline: { width: 1.8, color: 'rgba(8,8,4,0.9)' },
  parts: {
    head: { flash: true, cracks: 4, char: 1, holes: 0, crackMinLum: 110 },
    jaw: { flash: true, cracks: 2, char: 1, holes: 0, crackMinLum: 110 },
    torso: { flash: true, cracks: 5, char: 1, holes: 0, crackMinLum: 60 },
    fth: { deep: 0.58, cracks: 2, char: 1, holes: 0, crackMinLum: 60 },
    fsh: { deep: 0.58, cracks: 2, char: 1, holes: 0, crackMinLum: 60 },
    hth: { deep: 0.58, cracks: 2, char: 1, holes: 0, crackMinLum: 60 },
    hsh: { deep: 0.58, cracks: 2, char: 1, holes: 0, crackMinLum: 60 },
    queen: { flash: true, deep: 0.5, noDmg: true },
    queen2: { flash: true, noDmg: true },
    sac0: { flash: true, noDmg: true }, sac1: { flash: true, noDmg: true }, sac2: { flash: true, noDmg: true },
    sacx: { noDmg: true }, sacx2: { noDmg: true }, kwound: { noDmg: true },
    tree0: { cracks: 2, char: 1, holes: 0, crackMinLum: 60 }, tree1: { cracks: 2, char: 1, holes: 0, crackMinLum: 60 }, tree2: { cracks: 2, char: 1, holes: 0, crackMinLum: 60 },
    mush0: { noDmg: true }, mush1: { noDmg: true }, mush2: { noDmg: true }, flower: { noDmg: true },
  },
  prefix: { deb: { noDmg: true, outline: 1.2 } },
};

const SACS = ['sac0', 'sac1', 'sac2'];
/** 등의 숲 (그린 등 윤곽 위, 몸 지역 x): 나무 [x, 부품, 배율, 부러지는 손상 단계] · 버섯 [x, 부품, 배율] */
const TREES = [[-132, 'tree0', 0.95, 2], [-58, 'tree1', 1.05, 1], [22, 'tree2', 0.9, 99]];
const MUSH = [[-100, 'mush0', 0.9], [126, 'mush0', 0.62], [-20, 'mush2', 0.85], [150, 'mush1', 0.7]];
/** 체력이 줄수록 벌어지는 상처 [피해 비율, 몸 지역 점들] — 그린 몸통(x −166…176, 등 윤곽 아래 · 배 −125 위)의 옆구리에만 놓는다.
 *  로직 벡터의 자리(−230…−138, −250…−190)는 채색 몸통 밖(꼬리 · 허공)이라 붉은 선이 떠 보였다. 주머니 그림(−104/−36/32, −244…−172)은 피한다 */
const GASHES = [
  [0.2, [[-150, -160], [-134, -150], [-118, -157], [-102, -144]]],
  [0.45, [[118, -272], [134, -252], [128, -234], [144, -214]]],
  [0.7, [[-64, -150], [-48, -136], [-30, -146], [-12, -130], [4, -140]]],
];

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_behemoth', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(40), q,
      dmg: new DamageState(boss.def?.phases ?? [0.6, 0.3]), lt: null, pf: 0, lvl: 0, jolt: 0, dead: {},
      debris: rig.man.groups?.debris ?? [], w: [0, 0], w2: [0, 0], pts: { eye: [0, 0], mouth: [0, 0], hinge: [0, 0] },
      sacDead: [false, false, false], fell: {}, stage0: 0,
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.bx ?? b.cx, floor = b.A?.floor ?? b.by;
    let x0 = X - 430, x1 = X + 430, y0 = (b.by ?? floor) - 580, y1 = floor + 12;
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 30 < x0) x0 = px - 30; if (px + 30 > x1) x1 = px + 30; if (py - 30 < y0) y0 = py - 30; }
    if (st?.shards?.list.length) for (const s of st.shards.list) { if (s.x - 200 < x0) x0 = s.x - 200; if (s.x + 200 > x1) x1 = s.x + 200; if (s.y - 200 < y0) y0 = s.y - 200; }
    const Q = b.qFall; if (Q) { if (Q.x - 160 < x0) x0 = Q.x - 160; if (Q.x + 160 > x1) x1 = Q.x + 160; if (Q.y - 200 < y0) y0 = Q.y - 200; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    // 로직 lightsB 가 몸 · 주머니 · 머리 · 여왕 · 숨 · 꽃 빛을 낸다. 여기서는 P3 두개골 금의 초록 빛만 더한다
    if (st.lvl >= 2 && !(b.dying > 0)) L.add(st.pts.eye[0], st.pts.eye[1], 90, SPORE, 0.35);
  },
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.9;
    return { size: Math.max(10, (p.w + p.h) * 0.25 * p.k), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 변환 도우미 ─────────────────────────
/** 부품 두 피벗(pa → pb)을 지역 두 점에 맞춰 그린다 (축 방향 늘림 · 폭 wk 배 · mir = 축에 대해 뒤집기) */
function limb(D, img, p, pa, pb, ax, ay, bx, by, wk = 1, mir = false, alpha = 1) {
  if (!img || alpha <= 0.004) return;
  const A = p[pa], B = p[pb];
  const sdx = B[0] - A[0], sdy = B[1] - A[1], Ls = Math.hypot(sdx, sdy) || 1;
  const tdx = bx - ax, tdy = by - ay, Lt = Math.hypot(tdx, tdy) || 1e-3;
  const cs = sdx / Ls, ss = sdy / Ls, ct = tdx / Lt, stn = tdy / Lt;
  const u = Lt / Ls, v = p.k * wk * (mir ? -1 : 1);
  const a = ct * u * cs + stn * v * ss, c = ct * u * ss - stn * v * cs, b = stn * u * cs - ct * v * ss, d = stn * u * ss + ct * v * cs;
  const m = D.m, ctx = D.ctx, e = ax - (a * A[0] + c * A[1]), f = ay - (b * A[0] + d * A[1]);
  ctx.setTransform(m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]);
  if (alpha !== 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * alpha; ctx.drawImage(img, 0, 0); ctx.globalAlpha = ga; } else ctx.drawImage(img, 0, 0);
}
function glowOver(ctx, D, st, p, pivot, x, y, rot, sx, sy, a, t) {
  const lvl = st.lvl;
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : p.v.dmg1 ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? p.gl.dmg2 : p.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? p[pivot] : pivot;
  const pa = a * (0.45 + 0.55 * Math.max(0, Math.sin(t * 3.3 + p.w * 0.013)) ** 3) * (lvl > 1 ? 1.1 : 0.75);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - p.pad) * 0.5, (pv[1] - p.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}
const V = (st, p, deep = false) => pickVariant(p, deep ? Math.min(st.lvl, 1) : st.lvl, deep, null);
/** 그린 등 윤곽: 몸 지역 x → 몸 지역 y (몸 변환 전) */
function backY(T, x) {
  const B = T.back, k = T.k, o = T.org;
  if (!B?.length) return -300;
  const tx = o[0] + x / k;
  let i = 0;
  while (i < B.length - 2 && B[i + 1][0] < tx) i++;
  const a = B[i], c = B[i + 1], u = clamp((tx - a[0]) / ((c[0] - a[0]) || 1), 0, 1);
  return (lerp(a[1], c[1], u) - o[1]) * k;
}

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P, R = rig.parts;
  st.q = qOf(world.game);
  const q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, floor = A.floor, t = b.t, s = b.pose;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0, dT = dying ? (b.dieT ?? 0) : 0;
  const up = st.dmg.update(dying ? 0 : b.hp / b.stats.maxHp, dt);
  st.lvl = dying ? 2 : clamp(Math.max(b.dmgStage | 0, st.dmg.level), 0, 2);
  // 피격 부위 고정: 섬광이 다시 켜진 프레임(새 피격)의 b.hitPart — 그 뒤 hurtbox() 가 다시 불려 바뀌어도 섬광은 맞은 부위에만
  if (b.flashT > st.pf + 1e-4) st.fp = b.hitPart ?? null;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 6);
  // 부위별 피격 섬광 (BOSS_PIPELINE §9): 몸통 · 두개골(+턱) · 여왕 · 주머니는 자기 섬광(sc.hitT)만 · 모르는 부위(null) = 벡터처럼 전부
  const fp = st.fp, ff = st.ff ??= {};
  ff.body = !fp || fp === b.pBody;
  ff.head = !fp || fp === b.pSkull;
  ff.queen = !fp || fp === b.pQueen;
  ff.sacs = !fp;
  if (!dying && (b.state === 'intro' || b.hp >= b.stats.maxHp)) { st.dead = {}; st.fell = {}; st.shards.clear(); }
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  const fadeA = dying ? 1 - clamp((dT - 3.2) / 0.8, 0, 1) : 1;
  const ga0 = ctx.globalAlpha;
  ctx.globalAlpha = ga0 * fadeA;
  b.paintBack?.(ctx, world);
  P.draw(ctx, 0);
  if (up > 0 && !dying) levelBurst(P, b, st, up);
  const sx = Math.abs(b.turnK) < 0.12 ? Math.sign(b.turnK || b.facing || 1) * 0.12 : b.turnK;
  st.sx = sx;
  const X = b.bx + (b.flashT > 0 ? (rr.next() - 0.5) * 3 : 0) + (b.stunned ? Math.sin(t * 40) * 1.5 : 0), Y = b.by;
  D.begin(ctx);
  const wm = st.wm ??= [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < 6; i++) wm[i] = D.m[i];
  const frame = () => {
    ctx.setTransform(wm[0], wm[1], wm[2], wm[3], wm[4], wm[5]);   // 다리 등이 직접 건 변환이 남아 있어도 월드 기준에서 시작
    D.save();
    ctx.beginPath(); ctx.rect(X - 3000, floor - 4000, 6000, 4002); ctx.clip();   // 바닥 아래로는 아무것도 (발굽 · 쓰러진 나무 · 무릎)
    ctx.translate(X, Y); ctx.scale(sx, 1);
    D.begin(ctx);
  };
  const bodyXf = () => { D.end(); ctx.translate(0, b.drop); ctx.translate(PIVOT[0], PIVOT[1]); ctx.rotate(b.bodyA); ctx.translate(-PIVOT[0], -PIVOT[1]); D.begin(ctx); };
  frame();
  const rec = b.flashT > 0 && !dying;
  const fa = clamp(b.flashT / 0.1, 0, 1) * 0.55;
  /** 피격 섬광 덧그리기는 부품을 그린 좌표계(몸 변환 안/밖) 안에서 블록마다 */
  const flash = () => { if (rec) D.flash(fa); else { D.rec = false; D.log.length = 0; } };
  const leave = () => { D.end(); D.restore(); D.begin(ctx); };
  D.rec = false; D.log.length = 0;
  // 먼 다리 (어두운 변형)
  for (const L of b.legs) if (!L.near) drawLeg(D, st, R, b, L, true);
  // 몸 변환 안: 등의 숲 · 몸통 · 상처 · 주머니
  D.save(); bodyXf();
  drawForest(ctx, D, st, R, b, t, dying, dT);
  const T = R.torso;
  D.rec = rec && ff.body;
  D.part(T, V(st, T), 'org', 0, 0, st.jolt ? (rr.next() - 0.5) * 0.01 * st.jolt : 0, T.k, T.k * (1 + Math.sin(t * 1.6) * 0.006));
  D.rec = false;
  glowOver(ctx, D, st, T, 'org', 0, 0, 0, T.k, T.k, 0.5, t);
  drawGashes(ctx, D, b, t);
  drawSacs(ctx, D, st, R, b, t, rec && ff.sacs);
  flash();
  leave();
  // 발판 덧그리기 (등의 숲이 '=' 발판을 덮어도 딛을 곳이 보이게) → 머리 · 여왕 · 가까운 다리는 그 위
  if (q.ledges !== false) {
    D.end(); D.restore();
    const cam = world.camera, cx0 = cam?.x ?? -1e9, cy0 = cam?.y ?? -1e9, cx1 = cx0 + (cam?.vw ?? 2e9), cy1 = cy0 + (cam?.vh ?? 2e9);
    ledgesOver(ctx, world, Math.max(X - 420, cx0), Math.max(Y - 560, cy0), Math.min(X + 420, cx1), Math.min(Y - 60, cy1, floor - 4));
    frame();
  }
  D.save(); bodyXf();
  drawHead(ctx, D, st, R, b, t, rec && ff.head);
  flash();
  drawBlooms(D, st, R, b);
  leave();
  if (!b.qFall) drawQueen(ctx, D, st, R, b, t, rec && ff.queen);
  flash();
  for (const L of b.legs) if (L.near) drawLeg(D, st, R, b, L, false);
  drawMoss(ctx, D, b, t);
  D.end();
  D.restore();
  // ── 월드: 떨어진 여왕 · 파편 · 입자 · 사망 ──
  if (b.qFall) drawFallenQueen(ctx, D, st, R, b);
  D.begin(ctx);
  st.shards.draw(D);
  D.end();
  ambient(P, b, st, dt, q, hit, t);
  if (dying) deathFx(b, rig, st, dt, dT);
  P.draw(ctx, 1);
  ctx.globalAlpha = ga0;
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 다리 ─────────────────────────
/** 다리: 넙다리 hip→knee · 정강이+발굽 knee→foot (앞다리 = 버섯 난 이끼 다리, 뒷다리 = 다른 그림). 무릎 상처는 손상 단계 */
function drawLeg(D, st, R, b, L, far) {
  const front = L.side > 0, h = L.hipL, k = L.kneeL, f = L.footL;
  const Th = front ? R.fth : R.hth, Sh = front ? R.fsh : R.hsh;
  const wk = far ? 1.05 : (front ? 1.3 : 1.22);
  const hx = h[0] + (front ? 0 : -12), hy = h[1] + (front ? 0 : 4);
  limb(D, V(st, Sh, far), Sh, 'knee', 'foot', k[0], k[1] - 6, f[0], f[1] + 2, wk * 0.95);
  limb(D, V(st, Th, far), Th, 'hip', 'knee', hx, hy, k[0], k[1], wk);
  if (far) return;
  const wound = (front && b.dmgStage >= 1) || (!front && b.dmgStage >= 2) || b.dying > 0;
  if (wound && R.kwound) {
    const W = R.kwound, kk = W.k * 0.9;
    D.part(W, pickVariant(W, 0), 'c', k[0] + (front ? 4 : -4), k[1] - 4, Math.atan2(f[1] - k[1], f[0] - k[0]) - PI / 2, kk, kk);
  }
}

// ───────────────────────── 등의 숲 ─────────────────────────
function drawForest(ctx, D, st, R, b, t, dying, dT) {
  const T = R.torso, s = b.pose, stg = b.dmgStage | 0;
  const sway = (i) => Math.sin(t * 0.9 + i * 1.7) * 0.03 - s.rear * 0.06 + s.lie * 0.08;
  for (let i = 0; i < TREES.length; i++) {
    const [x, name, sc, breakAt] = TREES[i];
    const p = R[name]; if (!p || st.fell[name]) continue;
    const y = backY(T, x) + 14, k = p.k * sc;
    if (stg >= breakAt) {
      // 부러진 나무: 밑동만 (위쪽을 잘라낸다) + 쪼개진 끝
      const cut = p.base[1] - (p.base[1] - 0) * 0.34;
      D.save();
      D.set(p.base[0], p.base[1], x, y, sway(i) * 0.3, k, k);
      D.ctx.beginPath(); D.ctx.rect(0, cut, p.w, p.h - cut); D.ctx.clip();
      D.img(V(st, p), p.base[0], p.base[1], x, y, sway(i) * 0.3, k, k);
      D.set(p.base[0], p.base[1], x, y, sway(i) * 0.3, k, k);
      const c = D.ctx, cx = p.base[0], w = p.w * 0.16;
      c.fillStyle = '#c8b890';
      c.beginPath(); c.moveTo(cx - w, cut + 6); c.lineTo(cx - w * 0.5, cut - 10); c.lineTo(cx, cut + 2); c.lineTo(cx + w * 0.4, cut - 16); c.lineTo(cx + w, cut + 6); c.closePath(); c.fill();
      D.restore();
    } else {
      D.part(p, V(st, p), 'base', x, y, sway(i), k, k);
      glowOver(ctx, D, st, p, 'base', x, y, sway(i), k, k, 0.4, t + i);
    }
  }
  const gk = 0.3 + 0.35 * stg + 0.3 * s.pulse;
  for (let i = 0; i < MUSH.length; i++) {
    const [x, name, sc0] = MUSH[i];
    const p = R[name]; if (!p) continue;
    if (dying && dT > 1.3 + i * 0.15) continue;
    const sc = sc0 * (1 + stg * 0.12 + Math.sin(t * 2 + i) * 0.015 * s.pulse), y = backY(T, x) + 10, k = p.k * sc;
    D.part(p, pickVariant(p, 0), 'base', x, y, sway(i + 3) * 0.5, k, k);
    if (st.q.halos && name !== 'mush1') { D.end(); halo(ctx, x, y - p.base[1] * k * 0.75, 60 * sc, SPORE, 0.16 * gk); }
  }
}

// ───────────────────────── 몸통 위 ─────────────────────────
/** 체력이 줄수록 벌어지는 깊은 상처 (그린 몸통 옆구리 위) */
function drawGashes(ctx, D, b, t) {
  const dm = clamp(1 - b.hp / Math.max(1, b.stats.maxHp), 0, 1);
  D.end();
  for (const [th, pts] of GASHES) {
    if (dm < th) continue;
    const k = clamp((dm - th) / 0.1, 0, 1);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a0404'; ctx.lineWidth = 9 * k; ctx.stroke();
    ctx.strokeStyle = '#6a1a18'; ctx.lineWidth = 5 * k; ctx.stroke();
    ctx.strokeStyle = 'rgba(200,90,70,0.6)'; ctx.lineWidth = 1.5 * k; ctx.stroke();
  }
}
/** 포자 주머니 (맥동 · 다시 자랄 때 커진다) / 터진 자리 */
function drawSacs(ctx, D, st, R, b, t, rec) {
  const pk = b.pose.pulse;
  for (const sc of b.sacs) {
    if (!sc.alive) {
      const p = sc.i % 2 ? R.sacx2 : R.sacx; if (!p) continue;
      const k = p.k * 0.9;
      D.part(p, pickVariant(p, 0), 'c', sc.lx, sc.ly, sc.i * 0.7 - 0.3, k * (sc.i === 1 ? -1 : 1), k);
      continue;
    }
    const p = R[SACS[sc.i % 3]]; if (!p) continue;
    const g = sc.grow, pul = 1 + Math.sin(t * (3 + pk * 14) + sc.i * 2) * (0.05 + 0.1 * pk);
    const k = p.k * (0.3 + 0.7 * g) * pul;
    const rot = (sc.i - 1) * 0.35 + Math.sin(t * 1.3 + sc.i) * 0.04;
    D.rec = rec;
    D.part(p, pickVariant(p, 0), 'c', sc.lx, sc.ly, rot, k, k);
    D.rec = false;
    if (sc.hitT > 0 && p.v.flash) { const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; D.img(p.v.flash, p.c[0], p.c[1], sc.lx, sc.ly, rot, k, k, clamp(sc.hitT * 5, 0, 0.9)); ctx.globalCompositeOperation = op; }
    if (st.q.halos) { D.end(); halo(ctx, sc.lx, sc.ly, 40 + 24 * pk, SPORE, 0.3 + 0.35 * pk + (sc.hitT > 0 ? 0.5 : 0)); }
  }
}
/** 머리: 두개골 (원본이 왼쪽을 본다 → 뒤집기) + 경첩 아래턱 + 눈구멍 초록 불빛 + 입속 숨 + P3 두개골 금 */
function drawHead(ctx, D, st, R, b, t, rec) {
  const H = R.head, J = R.jaw, s = b.pose;
  const rot = b.headA - b.bodyA + (st.jolt ? (rr.next() - 0.5) * 0.06 * st.jolt : 0);
  const k = H.k;
  const hp = D.pt(H.neck[0], H.neck[1], H.hinge[0], H.hinge[1], NECK[0], NECK[1], rot, -k, k, st.pts.hinge);
  const ja = 0.04 + (b.jawK ?? 0) * 0.55, jr = rot + ja - 0.4;
  D.rec = rec;
  D.part(J, V(st, J), 'hinge', hp[0], hp[1], jr, -k, k);
  D.part(H, V(st, H), 'neck', NECK[0], NECK[1], rot, -k, k);
  D.rec = false;
  glowOver(ctx, D, st, H, 'neck', NECK[0], NECK[1], rot, -k, k, 0.5, t);
  const e = D.pt(H.neck[0], H.neck[1], H.eye[0], H.eye[1], NECK[0], NECK[1], rot, -k, k, st.pts.eye);
  const m = D.pt(H.neck[0], H.neck[1], H.mouth[0], H.mouth[1], NECK[0], NECK[1], rot, -k, k, st.pts.mouth);
  D.end();
  const dk = b.dying > 0 ? clamp(1.6 - (b.dieT ?? 0), 0, 1) : 1;
  // 빈 눈구멍의 초록 불빛
  const pk = (0.7 + 0.3 * Math.sin(t * 5)) * dk;
  if (pk > 0.02) { if (st.q.halos) halo(ctx, e[0], e[1], 30, GLOW, 0.8 * pk); halo(ctx, e[0] + 2, e[1], 7, '#ffffff', 0.9 * pk, true); }
  // 입속: 부패의 숨 · 포효
  const mk = clamp(s.breath + (b.jawK ?? 0) * 0.4, 0, 1);
  if (mk > 0.1 && dk > 0) { if (st.q.halos) halo(ctx, m[0], m[1] + 10, 50 + 40 * s.breath, GLOW, (0.25 + 0.55 * s.breath) * dk); }
  // P3: 두개골이 갈라진다 (머리 텍셀 좌표)
  if ((b.dmgStage | 0) >= 2) {
    D.set(H.neck[0], H.neck[1], NECK[0], NECK[1], rot, -k, k);
    const sx0 = H.skull[0], sy0 = H.skull[1], u = 1 / (k * 2);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx0 + 40 * u, sy0 - 90 * u); ctx.lineTo(sx0 + 30 * u, sy0 - 60 * u); ctx.lineTo(sx0 + 44 * u, sy0 - 40 * u); ctx.lineTo(sx0 + 24 * u, sy0 - 12 * u); ctx.lineTo(sx0 + 34 * u, sy0 + 10 * u);
    ctx.strokeStyle = '#140e06'; ctx.lineWidth = 4 * u; ctx.stroke();
    ctx.strokeStyle = 'rgba(170,255,100,0.75)'; ctx.lineWidth = 1.6 * u; ctx.stroke();
    D.end();
  }
}
/** 균사의 여왕: 판정(queenP) 가운데에 가슴을 둔다 — 무릎 꿇으면 판정과 함께 바닥−150 까지 흘러내린다. 붙은 자리(등)와는 뿌리 줄기로 이어진다 */
function drawQueen(ctx, D, st, R, b, t, rec) {
  const s = b.pose, awake = b.queenAwake || b.queenAct > 0, raise = s.qRaise > 0.45;
  const p = raise && R.queen2 ? R.queen2 : R.queen;
  const qx = (b.queenP.x - b.bx) * (b.facing || 1), qy = b.queenP.y - b.by;
  const kn = Math.max(s.kneel, s.slump * 0.7);
  const rot = b.bodyA + (-0.08 + kn * 1.1 + (awake ? 0 : 0.18) - s.qRaise * 0.12) + Math.sin(t * 1.1) * 0.03;
  const k = p.k * (raise ? 1.02 : 1);
  // 붙은 자리 → 여왕 허리: 창백한 뿌리 줄기 (무릎 꿇으면 늘어난다)
  const base = b.bodyPt(QBASE[0], QBASE[1], st.w);
  const wst = D.pt(p.chest[0], p.chest[1], p.waist[0], p.waist[1], qx, qy, rot, k, k, st.w2);
  D.end();
  ctx.strokeStyle = '#d8d0b4'; ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const o = (i - 2) * 7, sw = Math.sin(t * 2 + i) * 4;
    ctx.lineWidth = 3.4 - Math.abs(i - 2) * 0.6;
    ctx.beginPath(); ctx.moveTo(base[0] + o, base[1] + 6);
    ctx.quadraticCurveTo((base[0] + wst[0]) / 2 + o * 2 + sw, (base[1] + wst[1]) / 2 + 10, wst[0] + o * 0.5, wst[1] + 20);
    ctx.stroke();
  }
  D.rec = rec;
  D.part(p, pickVariant(p, 0, !awake), 'chest', qx, qy, rot, k, k);
  D.rec = false;
  // 깨어난 여왕의 눈빛
  if (awake && b.queenGlow > 0.05) {
    const h = D.pt(p.chest[0], p.chest[1], p.head[0], p.head[1], qx, qy, rot, k, k, st.w);
    D.end();
    if (st.q.halos) halo(ctx, h[0], h[1], 22, SPORE_L, 0.7 * b.queenGlow);
    halo(ctx, h[0], h[1], 6, '#ffffff', 0.8 * b.queenGlow, true);
  }
}
/** 사망: 시들어 떨어진 여왕 (로직 qFall, 월드 좌표) — 어두운 변형 */
function drawFallenQueen(ctx, D, st, R, b) {
  const Q = b.qFall, p = R.queen; if (!p) return;
  const a = clamp(1 - ((b.dieT ?? 0) - 2.6) / 1.2, 0, 1);
  if (a <= 0.01) return;
  D.begin(ctx);
  D.save();
  ctx.beginPath(); ctx.rect(Q.x - 400, b.A.floor - 800, 800, 802); ctx.clip();
  D.part(p, pickVariant(p, 0, true), 'chest', Q.x, Q.y, Q.rot, p.k * (b.facing || 1), p.k, a);
  D.restore();
  D.end();
}
/** 사망: 등에 흰 꽃이 핀다 (로직 bloomK) */
function drawBlooms(D, st, R, b) {
  const kB = b.bloomK ?? 0, p = R.flower;
  if (kB <= 0 || !p) return;
  for (let i = 0; i < 12; i++) {
    const u = i / 11, x = -170 + u * 320, g = clamp(kB * 1.6 - hash1(i) * 0.6, 0, 1);
    if (g <= 0) continue;
    const y = backY(R.torso, x) + 8, k = p.k * (0.45 + 0.55 * g) * (0.8 + hash1(i * 3) * 0.4);
    D.part(p, pickVariant(p, 0), 'base', x, y, (hash1(i * 7) - 0.5) * 0.5, k * (i % 2 ? -1 : 1), k * g);
  }
}
/** 배 아래 이끼 늘어짐 */
function drawMoss(ctx, D, b, t) {
  D.end();
  const dr = b.drop;
  ctx.strokeStyle = 'rgba(120,150,70,0.75)'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const x = -150 + i * 32, y = -110 + dr + Math.abs(x) * 0.03, L = 14 + hash1(i) * 22, sw = Math.sin(t * 2 + i) * 4; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw, y + L * 0.5, x - 2 + sw * 1.5, y + L); }
  ctx.stroke();
}

// ───────────────────────── 입자 ─────────────────────────
/** 몸 지역(몸 변환 전) → 월드 */
function W(b, st, lx, ly, out) { const p = b.bodyPt(lx, ly, out); p[0] = b.bx + p[0] * st.sx; p[1] = b.by + p[1]; return p; }
function levelBurst(P, b, st, level) {
  const c = W(b, st, -40, -250, st.w);
  P.burst('chip', c[0], c[1], 12 + level * 6, { speed: 320, color: '#5a4c36' });
  P.burst('spore', c[0], c[1], 20 + level * 8, { speed: 200, color: SPORE });
  P.burst('ichor', c[0], c[1], 10, { speed: 260, color: ROT, hi: ROT_HI });
}
function ambient(P, b, st, dt, q, hit, t) {
  if (b.dying > 0) return;
  const amb = q.ambient, s = b.pose, w = st.w;
  // 주머니 · 등의 버섯에서 피어오르는 포자
  if (rr.next() < dt * (3 + s.pulse * 18 + (b.dmgStage | 0) * 2) * amb) {
    const sc = b.sacs[rr.int(3)];
    if (sc?.alive) P.emit('spore', sc.x + rr.range(-10, 10), sc.y + rr.range(-10, 10), rr.range(-15, 15), rr.range(-50, -15), { color: SPORE, layer: 1 });
    const p = W(b, st, rr.range(-180, 150), rr.range(-340, -300), w);
    P.emit('spore', p[0], p[1], rr.range(-15, 15), rr.range(-40, -10), { color: rr.chance(0.5) ? SPORE : SPORE_L, layer: rr.chance(0.5) ? 0 : 1 });
  }
  // 썩은 즙 · 피 (상처 · 입)
  if (rr.next() < dt * (0.8 + (b.dmgStage | 0) * 1.2) * amb) { const p = W(b, st, rr.range(-160, 120), rr.range(-180, -120), w); P.emit('ichor', p[0], p[1], 0, 0, { color: ROT, hi: ROT_HI, hang: rr.range(0.2, 0.6), layer: 1 }); }
  if ((b.jawK ?? 0) > 0.3 && rr.next() < dt * 4 * amb) { const m = b.mouthP; P.emit('ichor', m.x, m.y, rr.range(-20, 20), 0, { color: ROT, hi: ROT_HI, hang: rr.range(0.05, 0.3), layer: 1 }); }
  if (s.breath > 0.2 && rr.next() < dt * 30 * amb) { const m = b.mouthP; P.emit('spore', m.x, m.y, (b.facing || 1) * rr.range(120, 260), rr.range(-30, 30), { color: GLOW, layer: 1, life: rr.range(0.5, 1) }); }
  // 기절: 머리 위 포자 소용돌이
  if (b.stunned && rr.next() < dt * 16 * amb) { const a = t * 5 + rr.next(), h = b.headP; P.emit('spore', h.x + Math.cos(a) * 40, h.y - 50 + Math.sin(a) * 12, 0, -20, { color: SPORE_L, layer: 1, life: 0.6 }); }
  // 발 먼지 (돌진 · 걷기)
  if (b.rushing && rr.next() < dt * 24 * amb) { const L = b.legs[rr.int(4)]; P.emit('boneDust', L.fxw, L.fyw - 4, rr.range(-60, 60), rr.range(-80, -20), { color: '#6a5c44', layer: 1 }); }
  if (hit) {
    const h = b.headP;
    P.burst('chip', h.x + rr.range(-20, 20), h.y + rr.range(-20, 20), 5, { speed: 240, color: '#ddd3b4' });
    P.burst('ichor', h.x, h.y, 4, { speed: 200, color: ROT, hi: ROT_HI });
  }
  // 막 터진 주머니 → 포자 · 점액
  for (const sc of b.sacs) {
    if (!sc.alive && !st.sacDead[sc.i]) { st.sacDead[sc.i] = true; P.burst('spore', sc.x, sc.y, 22, { speed: 240, color: SPORE }); P.burst('ichor', sc.x, sc.y, 12, { speed: 220, color: ROT, hi: ROT_HI }); }
    else if (sc.alive) st.sacDead[sc.i] = false;
  }
}

// ───────────────────────── 사망 붕괴 ─────────────────────────
function deathFx(b, rig, st, dt, dT) {
  const R = rig.parts, P = st.P, dead = st.dead, sx = st.sx;
  const fade = Math.max(0.6, 3.6 - dT);
  // 0.4 s: 주머니가 모두 터진다
  if (!dead.sacs && dT > 0.4) {
    for (const sc of b.sacs) { P.burst('spore', sc.x, sc.y, 18, { speed: 260, color: SPORE }); P.burst('ichor', sc.x, sc.y, 10, { speed: 240, color: ROT, hi: ROT_HI }); }
    dead.sacs = true;
  }
  // 1.1–1.7 s: 나무가 부러져 쓰러진다 (조각은 등에서 옆으로 넘어간다)
  for (let i = 0; i < TREES.length; i++) {
    const [x, name, sc] = TREES[i];
    if (st.fell[name] || dT < 1.1 + i * 0.3) continue;
    const p = R[name]; if (!p) continue;
    st.fell[name] = true;
    if ((b.dmgStage | 0) >= TREES[i][3]) continue;   // 이미 부러진 밑동은 그대로
    const y = backY(R.torso, x) + 14, w = W(b, st, x, y, st.w), k = p.k * sc;
    const dir = (i % 2 ? 1 : -1) * Math.sign(sx);
    st.shards.spawn(pickVariant(p, 2), p.base[0], p.base[1], w[0], w[1], b.bodyA * Math.sign(sx), k * Math.sign(sx), k, dir * rr.range(40, 90), rr.range(-140, -60), dir * rr.range(1.2, 2.2), { r: 40, bounce: 0.15, fade });
    P.burst('chip', w[0], w[1] - 30, 14, { speed: 260, color: '#5a4c36' });
  }
  // 1.2 s: 살점 · 뼈 · 버섯 조각이 튄다
  if (!dead.chunks && dT > 1.2) {
    dead.chunks = true;
    for (let i = 0; i < st.debris.length; i++) {
      const p = R[st.debris[i]]; if (!p) continue;
      const w = W(b, st, rr.range(-160, 140), -240, st.w), a = -PI / 2 + (rr.next() - 0.5) * 2.2, sp = rr.range(200, 440);
      st.shards.spawn(p.v.base, p.c[0], p.c[1], w[0], w[1], rr.next() * TAU, p.k * rr.sign(), p.k, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-8, 8), { r: (p.w + p.h) * 0.2 * p.k, fade });
    }
  }
  // 꽃이 필 때 하얀 꽃가루
  if ((b.bloomK ?? 0) > 0 && rr.next() < dt * 14) { const w = W(b, st, rr.range(-170, 150), -300, st.w); P.emit('spore', w[0], w[1], rr.range(-20, 20), rr.range(-60, -20), { color: '#fff0f8', life: rr.range(1, 2) }); }
  if (dT < 2.4 && rr.next() < dt * 18) { const w = W(b, st, rr.range(-180, 160), rr.range(-300, -150), st.w); P.emit('spore', w[0], w[1], rr.range(-30, 30), rr.range(-70, -20), { color: SPORE }); }
}
