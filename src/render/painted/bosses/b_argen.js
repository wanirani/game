// 아르겐 (b_argen) — 채색 컷아웃 퍼핏 렌더러 (EX-BOSS)
// 부품 (Kling, tools/painted/prompts/ex-boss.mjs · configs/b_argen.json): 날개 없는 은룡 전신에서 잘라 낸 몸통(옆구리의 깨진 구멍 = 공허의 핵 자리) ·
//   벌린 입의 머리 + 경첩에서 분리한 아래턱 · 곧은 목 띠 · 지느러미 꼬리 띠 (둘 다 로직 사슬을 따라 구부린다) · 찢긴 은청색 막의 날개 한 장
//   (가까운 날개 = 기본, 먼 날개 = 어둡게 구운 deep 변형) · 뒷다리 · 앞다리 · 공허 결정 넷 + 핵 보석 · 파편 9 (비늘·결정·뿔)
// 움직임은 전부 로직(src/game/bosses/e_argen.js)의 값을 읽기만 한다:
//   boss { zx, zy, fk, pitch, ps{…}, neck(9점) · tailP(11점) · head{lx,ly,a,jaw} · wing.n/f{S,Wr} · legs{hn,hf,fn} · crys[] ·
//          coreBase · coreOpenK() · voidK · silverK · coreCrack · purified · stunned · hidden · dying · dieT · flashT · hitPart · A.floor }
// 상태별 표현: 날갯짓(날개 한 장을 로직 어깨→손목 벡터에 맞춰 돌리고 늘인다) · 숨결(입 속 번개 빛 + 입자) · 급강하(로직 pitch) ·
//   꼬리 휩쓸기(꼬리 띠가 로직 베지어 사슬을 따른다) · 핵 노출(보석 · 맥동 발광) · 손상 0~2(구운 균열 + 보랏빛 균열 발광) ·
//   피격 섬광(맞은 부위 쪽만) · 페이즈 전환(결정 자람/깨짐 → 결정 조각이 강체 파편으로 튄다) · 3페이즈 은빛(구운 'pure' 틴트를 silverK 만큼 덧그림)
// 정화(체력 0, 5초): 핵 균열 → 핵 보석이 부서짐(파편) → 남은 결정이 하나씩 떨어져 나감 → 'pure' 틴트로 완전히 은빛 → 로직이 내려앉혔다가 날려 보낸다.
//   몸은 부서지지 않는다 (ownsDeathFade: 마지막 0.35초에만 흐려진다 — 그 전에 화면 위로 날아간다)
// 좌표: 로직과 같은 몸 지역 좌표 (원점 = 몸 중심 zx,zy, 좌우 fk, 기울기 pitch, +x = 머리 쪽, y 아래가 양수)
import { Drawer, Particles, DamageState, Shards, halo, rr, hash1, loadRig, pickVariant, quality, QUALITY, ledgesOver } from '../kit.js';

const DIR = 'painted/bosses/b_argen';
const PI = Math.PI, TAU = PI * 2;
const VOID = '#8a3cff', VOID_L = '#d4a8ff', PURE = '#bfe8ff', BOLT = '#eef6ff', SKY = '#9fd8ff', MOUTH = '#2a0814', THROAT = '#6a1424';
const MOTE = 'rgba(190,140,255,0.85)', SILVER_MOTE = 'rgba(220,240,255,0.9)';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
/** 실제 적용 품질 등급 (설정이 'auto' 면 조절기가 고른 game.quality/tier) */
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);
// 정화 틴트: 보랏빛 공허 핏줄·결정 빛 → 은청색, 나머지 → 살짝 밝고 차갑게 (탁해지지 않게 재질별로 — kit.RECOLOR 규칙 형식)
const PURE_RULES = [
  { when: (h, s, l) => h > 245 && h < 335 && s > 0.12, h: 205, s: 0.45, l: 1.18, l0: 0.06 },
  { when: (h, s, l) => (h < 20 || h > 335) && s > 0.3 && l < 0.5, dh: 0, s: 0.8, l: 1.0 },   // 입 속 붉은 살은 그대로에 가깝게
  { when: () => true, h: 210, s: 0.5, s0: 0.02, l: 1.06, l0: 0.03 },
];

/** 굽기 옵션 (kit.loadRig def). 피격 섬광 = 판정 부위의 그림(몸통·머리·턱). 먼 날개·먼 다리 = deep 변형 */
const DEF = {
  glow: '#b878ff',
  outline: { width: 1.6, color: 'rgba(6,4,14,0.9)' },
  parts: {
    // 그을림(char)은 은빛 비늘에서 검은 얼룩으로 보여 약하게 — 큰 날개막은 그을림 없이 균열·찢김만
    torso: { flash: true, cracks: 4, char: 0.5, holes: 0, crackMinLum: 95 },
    head: { flash: true, cracks: 3, char: 0.35, holes: 0, crackMinLum: 120 },
    jaw: { flash: true, cracks: 2, char: 0.35, holes: 0, crackMinLum: 120 },
    neck: { cracks: 3, char: 0.25, holes: 0, crackMinLum: 100 },
    tail: { cracks: 3, char: 0.25, holes: 0, crackMinLum: 100 },
    wing: { membrane: true, holes: 2, cracks: 1, char: 0, crackMinLum: 70, deep: 0.62 },
    legH: { cracks: 1, char: 0.3, holes: 0, deep: 0.62 },
    legF: { cracks: 1, char: 0.3, holes: 0 },
    gem: { noDmg: true },
  },
  prefix: { cr: { noDmg: true }, deb: { noDmg: true, outline: 1.2 } },
  tints: { pure: { rules: PURE_RULES, levels: ['dmg2'], glow: PURE, skip: ['cr', 'deb', 'gem'] } },
};
// 로직 상수 (e_argen.js 와 같은 값)
const CC = [14, -4], SHN = [26, -50], SHF = [12, -56];
const NECK_R0 = 40, NECK_R1 = 29, TAIL_R0 = 29;   // 채색 띠 굵기 (로직 판정과 무관 — 그림 비례만)
const WING_UP = -2.3, WING_S = 1;   // 날개: 위로 든 자세의 어깨→손목 각 · 크기 배율 (아틀라스 lps 0.205 가 이미 게임 크기 — 텍셀 낭비 없게)
const CRYS_SPR = ['cr1', 'cr2', 'cr3', 'cr4'];

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_argen', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(40), q,
      dmg: new DamageState(boss.def?.phases ?? [0.65, 0.3]), lt: null, pf: 0, lvl: 0, jolt: 0, fp: null,
      cAlive: [], gemGone: false, debris: rig.man.groups?.debris ?? [],
      pts: { eye: [0, 0], mouth: [0, 0], hinge: [0, 0], jawTip: [0, 0], snout: [0, 0] }, W: [0, 0], W2: [0, 0], _arc: new Float32Array(16),
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.zx ?? b.cx, Y = b.zy ?? b.cy, floor = b.A?.floor ?? Y + 400;
    let x0 = X - 780, x1 = X + 780, y0 = Y - 620, y1 = Math.max(Y + 440, floor + 12);
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 40 < x0) x0 = px - 40; if (px + 40 > x1) x1 = px + 40; if (py - 40 < y0) y0 = py - 40; if (py + 40 > y1) y1 = py + 40; }
    if (st?.shards?.list.length) for (const s of st.shards.list) { if (s.x - 120 < x0) x0 = s.x - 120; if (s.x + 120 > x1) x1 = s.x + 120; if (s.y - 120 < y0) y0 = s.y - 120; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    // 로직 lightsB 가 핵·입·은빛을 낸다. 여기서는 결정이 깨지는 순간의 보랏빛만
    if (st.flashL > 0.05) L.add(st.flashW?.[0] ?? b.zx, st.flashW?.[1] ?? b.zy, 220, VOID_L, st.flashL * 0.6);
  },
  /** 월드 파편(spawnDebris)용 채색 조각 */
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.9;
    return { size: Math.max(10, (p.w + p.h) * 0.25 * p.k), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P, R = rig.parts;
  st.q = qOf(world.game);
  const q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const floor = b.A.floor, t = b.t, s = b.ps;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0, dT = dying ? (b.dieT ?? 0) : 0;
  const up = st.dmg.update(dying ? 0 : b.hp / b.stats.maxHp, dt);
  st.lvl = dying ? 2 : clamp(Math.max(b.dmg | 0, st.dmg.level), 0, 2);
  // 피격 부위 고정 (섬광이 다시 켜진 프레임의 b.hitPart)
  if (b.flashT > st.pf + 1e-4) st.fp = b.hitPart ?? null;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 6);
  st.flashL = Math.max(0, (st.flashL ?? 0) - dt * 3);
  const fOn = b.flashT > 0 && !dying, fp = st.fp;
  const ff = st.ff ??= {};
  ff.head = fOn && (!fp || fp === b.pHead || fp === b.pNeck);
  ff.body = fOn && (!fp || fp === b.pBody || fp === b.pCore || fp === b.pTail || fp === b.pWing);
  if (b.state === 'intro' || (b.hp >= b.stats.maxHp && !dying)) { st.shards.clear(); st.gemGone = false; }
  const X = b.zx, Y = b.zy, fk = Math.abs(b.fk) < 0.02 ? 0.02 * Math.sign(b.fk || 1) : b.fk, pitch = b.pitch ?? 0;
  const pc = Math.cos(pitch), ps = Math.sin(pitch);
  const W = (lx, ly, out = st.W) => { out[0] = X + fk * (lx * pc - ly * ps); out[1] = Y + lx * ps + ly * pc; return out; };
  st._W = W;
  const sk = clamp(b.silverK ?? 0, 0, 1), vk = clamp(b.voidK ?? 0, 0, 1);
  const alpha = (b.alpha ?? 1) * (dying ? clamp(b.dying / 0.35, 0, 1) : 1);
  if (alpha <= 0.01) return;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * alpha;
  // 결정이 깨진 순간 → 결정 그림 조각이 튄다 (로직 개체에 쓰지 않고 그리기 상태에 기억)
  crystalBreaks(b, rig, st, W);
  if (up > 0 && !dying) levelBurst(P, W, up);
  P.draw(ctx, 0);
  // ── 몸 (지역 좌표) ──
  D.begin(ctx);
  const enter = () => {
    D.save();
    ctx.beginPath(); ctx.rect(X - 3000, floor - 4000, 6000, 4002); ctx.clip();   // 바닥 아래는 그리지 않는다
    ctx.translate(X, Y); ctx.scale(fk, 1); if (pitch) ctx.rotate(pitch);
    D.begin(ctx);
  };
  enter();
  D.rec = false; D.log.length = 0;
  const jr = st.jolt ? (rr.next() - 0.5) * 0.025 * st.jolt : 0;
  // 뒤층: 먼 날개 → 가까운 날개 (둘 다 몸통 뒤: 옆구리의 핵이 가려지지 않게)
  drawWing(D, ctx, st, R.wing, b.wing.f, true, sk, t);
  drawWing(D, ctx, st, R.wing, b.wing.n, false, sk, t);
  drawCrystals(D, ctx, st, rig, b, sk, 'wing');
  // 발판 덧그리기: 날개가 발판을 덮어도 딛을 곳이 보이게 → 몸통·머리(판정 부위)는 그 위에
  if (q.ledges !== false) {
    D.end(); D.restore();
    const cam = world.camera, cx0 = cam?.x ?? -1e9, cy0 = cam?.y ?? -1e9, cx1 = cx0 + (cam?.vw ?? 2e9), cy1 = cy0 + (cam?.vh ?? 2e9);
    ledgesOver(ctx, world, Math.max(X - 760, cx0), Math.max(Y - 560, cy0), Math.min(X + 760, cx1), Math.min(Y + 300, cy1, floor - 4));
    D.begin(ctx);
    enter();
  }
  drawLeg(D, st, R.legH, b.legs.hf, true, sk, 1);
  drawStrip(ctx, D, st, R.tail, b.tailP, 11, false, sk, (i) => TAIL_R0 / (R.tail.r * R.tail.lps));
  D.rec = ff.body;
  drawPart(D, st, R.torso, 'c', 0, 0, jr, R.torso.k, R.torso.k * (1 + Math.sin(t * 2.1) * 0.01), sk);
  D.rec = false;
  glowOver(ctx, D, st, R.torso, 'c', 0, 0, jr, R.torso.k, R.torso.k, 0.55, t, vk);
  drawCore(D, ctx, st, rig, b, t, q, sk);
  drawCrystals(D, ctx, st, rig, b, sk, 'body', 'tail');
  drawLeg(D, st, R.legH, b.legs.hn, false, sk, 1);
  drawLeg(D, st, R.legF, b.legs.fn, false, sk, 1);
  drawStrip(ctx, D, st, R.neck, b.neck, 9, true, sk, (i) => lerp(NECK_R0, NECK_R1, i / 8) / (R.neck.r * R.neck.lps));
  drawHead(D, ctx, st, rig, b, s, t, q, sk, ff.head);
  drawCrystals(D, ctx, st, rig, b, sk, 'neck', 'head');
  if (fOn) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.55);
  else { D.rec = false; D.log.length = 0; }
  D.end();
  // 은빛이 돌아온다: 몸에 흐르는 은빛 (지역 좌표 경로)
  if (sk > 0.04) silverStreaks(ctx, D, b, t, sk, q);
  D.restore();
  // ── 월드: 파편 · 입자 · 정화 ──
  D.begin(ctx);
  st.shards.draw(D);
  D.end();
  ambient(P, b, st, W, dt, q, hit, t, sk, vk);
  if (dying) purifyFx(ctx, b, rig, st, W, dt, dT, q);
  P.draw(ctx, 1);
  ctx.globalAlpha = ga;
  ctx.imageSmoothingQuality = q0;
}

/** 부품 하나 (손상 단계 변형) + 은빛 틴트 덧그림 (3페이즈·정화: 'pure' 는 dmg2 에만 구워져 있다) */
function drawPart(D, st, p, pivot, x, y, rot, sx, sy, sk, deep = false, a = 1) {
  D.part(p, pickVariant(p, st.lvl, deep, null), pivot, x, y, rot, sx, sy, a);
  if (sk > 0.02 && st.lvl >= 2 && p.v[deep ? 'pure_deep_dmg2' : 'pure_dmg2']) {
    const rec = D.rec; D.rec = false;
    D.part(p, pickVariant(p, 2, deep, 'pure'), pivot, x, y, rot, sx, sy, a * sk);
    D.rec = rec;
  }
}
/** 손상 단계 균열 발광 (반 해상도, 가산, 맥동) — 공허 기세(vk)가 약해지면 같이 흐려진다 */
function glowOver(ctx, D, st, p, pivot, x, y, rot, sx, sy, a, t, vk) {
  const lvl = st.lvl;
  if (!st.q.crackGlow || lvl <= 0 || vk <= 0.05) return;
  const drawn = lvl >= 2 ? 2 : p.v.dmg1 ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? p.gl.dmg2 : p.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? p[pivot] : pivot;
  const pa = a * vk * (0.45 + 0.55 * Math.max(0, Math.sin(t * 4.1 + p.w * 0.013)) ** 3) * (lvl > 1 ? 1.1 : 0.75);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - p.pad) * 0.5, (pv[1] - p.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 날개 · 다리 ─────────────────────────
/** 날개 한 장: 그림의 어깨→손목 벡터를 로직 S→Wr 에 맞춰 돌리고(길이 비율로 0.8~1.25배) 어깨 피벗에 놓는다 */
function drawWing(D, ctx, st, p, Wg, far, sk, t) {
  const ix = p.wr[0] - p.sh[0], iy = p.wr[1] - p.sh[1];
  const lx = Wg.Wr.x - Wg.S.x, ly = Wg.Wr.y - Wg.S.y;
  // 날갯짓 폭을 줄인다: 옆모습에서 내려친 날개가 바닥까지 늘어지지 않게 (위로 든 자세 기준 각의 70%) · 내려칠수록 짧게(원근)
  const d = Math.atan2(Math.sin(Math.atan2(ly, lx) - WING_UP), Math.cos(Math.atan2(ly, lx) - WING_UP));
  const dn = clamp(-d / 1.4, 0, 1);
  const rot = WING_UP + d * 0.7 - Math.atan2(iy, ix);
  const k = p.k * WING_S * clamp(Math.hypot(lx, ly) / (Math.hypot(ix, iy) * p.k * WING_S), 0.85, 1.15) * (far ? 0.9 : 1) * (1 - 0.22 * dn);
  drawPart(D, st, p, 'sh', Wg.S.x, Wg.S.y, rot, k, k * (1 - 0.2 * dn), sk, far);
  if (!far) glowOver(ctx, D, st, p, 'sh', Wg.S.x, Wg.S.y, rot, k, k * (1 - 0.2 * dn), 0.45, t + 1.3, 1);
}
/** 다리 (강체): 그림의 엉덩이→발 벡터를 로직 hip→foot 에 맞춘다 */
function drawLeg(D, st, p, leg, far, sk, a) {
  const ix = p.foot[0] - p.hip[0], iy = p.foot[1] - p.hip[1];
  const lx = leg.foot.x - leg.hip.x, ly = leg.foot.y - leg.hip.y;
  const rot = Math.atan2(ly, lx) - Math.atan2(iy, ix);
  const k = p.k * clamp(Math.hypot(lx, ly) / (Math.hypot(ix, iy) * p.k), 0.8, 1.2) * (far ? 0.94 : 1);
  drawPart(D, st, p, 'hip', leg.hip.x, leg.hip.y, rot, k, k, sk, far, a);
}

// ───────────────────────── 목 · 꼬리 띠 (로직 사슬을 따라 구부린다) ─────────────────────────
/**
 * 곧은 띠 그림을 점 배열(0 = 뿌리, n−1 = 끝)을 따라 마디마다 잘라 그린다. 띠의 u = root → tip 이 호 길이에 비례.
 * 마디 = 텍셀 구간 [uB, uA] 를 그 마디 방향으로 (가로 = 마디 길이에 맞춤, 세로 = ky(i) 배). flip: 위아래 뒤집기 (목: 등가시가 등 쪽으로)
 * 이웃 마디와 겹치게 굽힘에 비례해 늘인다 (바깥쪽 틈 방지)
 */
function drawStrip(ctx, D, st, p, A, n, flip, sk, ky) {
  const img = pickVariant(p, st.lvl, false, null), imgP = sk > 0.02 && st.lvl >= 2 ? p.v.pure_dmg2 : null;
  if (!img || n < 2) return;
  const arc = st._arc;
  arc[0] = 0;
  for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + Math.hypot(A[i * 2] - A[i * 2 - 2], A[i * 2 + 1] - A[i * 2 - 1]);
  const L = arc[n - 1] || 1, u0 = p.root[0], u1 = p.tip[0], ay = p.root[1], h = img.height, du = u0 - u1;
  for (let i = n - 2; i >= 0; i--) {
    const ax = A[i * 2], ayy = A[i * 2 + 1], bx = A[i * 2 + 2], by = A[i * 2 + 3];
    const len = arc[i + 1] - arc[i]; if (len < 0.3) continue;
    const uA = u0 - du * (arc[i] / L), uB = u0 - du * (arc[i + 1] / L);
    const rot = Math.atan2(ayy - by, ax - bx);
    const sx = len / Math.max(0.5, uA - uB), sy = p.k * ky(i) * (flip ? -1 : 1);
    const bend = i > 0 ? Math.abs(Math.atan2(Math.sin(rot - Math.atan2(A[i * 2 - 1] - ayy, A[i * 2 - 2] - ax)), Math.cos(rot - Math.atan2(A[i * 2 - 1] - ayy, A[i * 2 - 2] - ax)))) : 0;
    const e = 2 + bend * h * 0.25;
    D.set(uB, ay, bx, by, rot, sx, sy);
    const s0 = Math.max(0, uB - e), s1 = Math.min(img.width, uA + e + 1);
    if (s1 <= s0) continue;
    ctx.drawImage(img, s0, 0, s1 - s0, h, s0, 0, s1 - s0, h);
    if (imgP) { const g0 = ctx.globalAlpha; ctx.globalAlpha = g0 * sk; ctx.drawImage(imgP, s0, 0, s1 - s0, h, s0, 0, s1 - s0, h); ctx.globalAlpha = g0; }
  }
  // 구운 균열 발광 (가장 굵은 마디 두 개만 — 띠 전체를 다시 자르지 않게)
}

// ───────────────────────── 머리 · 턱 ─────────────────────────
function drawHead(D, ctx, st, rig, b, s, t, q, sk, rec) {
  const H = rig.parts.head, J = rig.parts.jaw, Hd = b.head, k = H.k;
  const rot = Hd.a - (H.ang ?? 0.22);
  const hx = Hd.lx, hy = Hd.ly;
  const hp = D.pt(H.c[0], H.c[1], H.hinge[0], H.hinge[1], hx, hy, rot, k, k, st.pts.hinge);
  const jrot = rot + (Hd.jaw - (J.open0 ?? 0.5));
  const jt = D.pt(J.hinge[0], J.hinge[1], J.tip[0], J.tip[1], hp[0], hp[1], jrot, k, k, st.pts.jawTip);
  const sn = D.pt(H.c[0], H.c[1], H.snout[0], H.snout[1], hx, hy, rot, k, k, st.pts.snout);
  D.pt(H.c[0], H.c[1], H.mouth[0], H.mouth[1], hx, hy, rot, k, k, st.pts.mouth);
  D.pt(H.c[0], H.c[1], H.eye[0], H.eye[1], hx, hy, rot, k, k, st.pts.eye);
  // 입 속 (경첩 · 윗니 끝 · 턱 끝 사이) — 위턱 그림에서 붉은 입 속을 뺐으므로 여기서 칠한다
  D.end();
  ctx.beginPath(); ctx.moveTo(hp[0], hp[1]); ctx.lineTo(lerp(hp[0], sn[0], 0.85), lerp(hp[1], sn[1], 0.85)); ctx.lineTo(lerp(hp[0], jt[0], 0.92), lerp(hp[1], jt[1], 0.92)); ctx.closePath();
  ctx.fillStyle = MOUTH; ctx.fill();
  if (q.halos) halo(ctx, lerp(hp[0], st.pts.mouth[0], 0.5), lerp(hp[1], st.pts.mouth[1], 0.5) + 6, 30, THROAT, 0.5);
  D.rec = rec;
  drawPart(D, st, J, 'hinge', hp[0], hp[1], jrot, k, k, sk);
  drawPart(D, st, H, 'c', hx, hy, rot, k, k, sk);
  D.rec = false;
  glowOver(ctx, D, st, H, 'c', hx, hy, rot, k, k, 0.45, t + 2, clamp(b.voidK ?? 0, 0, 1));
  D.end();
  // 눈: 공허 보라 → 은빛 하늘색
  const e = st.pts.eye, ek = 0.75 + 0.25 * Math.sin(t * 7);
  const ec = sk > 0.5 ? PURE : VOID_L;
  if (q.halos) halo(ctx, e[0], e[1], 22, ec, 0.7 * ek);
  halo(ctx, e[0], e[1], 6, '#ffffff', 0.85 * ek, true);
  // 숨결: 입 속 번개 빛
  const m = clamp(s.mouth, 0, 1.2), mp = st.pts.mouth;
  if (m > 0.3 && (b.state === 'breath' || b.state === 'intro' || b.state === 'crystals')) {
    if (q.halos) halo(ctx, mp[0], mp[1], 34 + m * 40, b.state === 'crystals' ? VOID_L : PURE, 0.5 * m);
    if (b.state === 'breath') { ctx.beginPath(); boltPath(ctx, hp[0], hp[1], mp[0], mp[1], 5, 5, Math.floor(t * 16)); strokeBolt(ctx, 0.7 * m, 1.3); }
  }
}

// ───────────────────────── 핵 · 결정 ─────────────────────────
function drawCore(D, ctx, st, rig, b, t, q, sk) {
  const G = rig.parts.gem;
  const co = b.coreOpenK?.() ?? Math.max(b.coreBase ?? 0, b.ps?.coreOpen ?? 0);
  const pulse = 0.82 + 0.18 * Math.sin(t * 6) + 0.06 * Math.sin(t * 17);
  const [cx, cy] = CC;
  if (b.purified || st.gemGone) {
    // 정화: 핵 자리에 은빛이 고인다 (D.end() = 지역 좌표 기준 변환)
    D.end();
    if (q.halos) halo(ctx, cx, cy, 46, PURE, 0.65 * sk);
    halo(ctx, cx, cy, 14, '#ffffff', 0.7 * sk, true);
    return;
  }
  if (co < 0.05) return;   // 1페이즈: 결정 껍질(shell)이 덮고 있다
  const sc = G.k * (0.85 + 0.25 * co);
  D.part(G, G.v.base, 'c', cx, cy, t * 0.35, sc, sc, Math.min(1, co * 1.4));
  D.end();
  if (q.halos) halo(ctx, cx, cy, 70 * pulse * (0.6 + co), VOID, 0.55 * co);
  halo(ctx, cx, cy, 14 * pulse, '#ffffff', 0.5 * co, true);
  // 정화 직전의 금
  if ((b.coreCrack ?? 0) > 0) {
    const n = 1 + Math.floor(b.coreCrack * 5);
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = hash1(i * 3.1) * TAU; boltPath(ctx, cx, cy, cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, 4, 4, i + 7); }
    strokeBolt(ctx, 0.9, 1.4);
  }
}
/** 공허 결정 (부착 종류별): 결정 그림 넷 중 하나를 바닥 피벗에 놓고 성장 방향(wa)으로 세운다 */
function drawCrystals(D, ctx, st, rig, b, sk, ...kinds) {
  const t = b.t;
  for (let i = 0; i < b.crys.length; i++) {
    const c = b.crys[i];
    if (!c.alive || c.grow <= 0.02 || !kinds.includes(c.at)) continue;
    const p = rig.parts[c.shell ? 'cr1' : CRYS_SPR[i % 4]];
    const sc = p.k * c.s * (0.3 + 0.7 * c.grow) * (c.shell ? 1.05 : 0.9);
    const wob = Math.sin(t * 2 + i) * 0.03;
    D.part(p, p.v.base, 'base', c.x, c.y, c.wa + PI / 2 + wob, sc, sc, 1);
  }
}

// ───────────────────────── 입자 · 효과 ─────────────────────────
function levelBurst(P, W, level) {
  const c = W(CC[0], CC[1], [0, 0]);
  P.burst('spark', c[0], c[1], 14 + level * 6, { speed: 420, color: VOID_L });
  P.burst('ashLight', c[0], c[1], 16 + level * 6, { speed: 220, color: MOTE });
}
/** 결정이 깨진 프레임: 그 결정 그림이 강체 파편으로 튀고 보랏빛 가루 */
function crystalBreaks(b, rig, st, W) {
  const A = st.cAlive;
  for (let i = 0; i < b.crys.length; i++) {
    const c = b.crys[i], was = A[i];
    A[i] = c.alive;
    if (was !== true || c.alive) continue;
    const p = rig.parts[c.shell ? 'cr1' : CRYS_SPR[i % 4]], w = W(c.x, c.y, [0, 0]);
    const sc = p.k * c.s * 0.9 * Math.sign(b.fk || 1);
    st.shards.spawn(p.v.base, p.base[0], p.base[1], w[0], w[1], (c.wa + PI / 2) * Math.sign(b.fk || 1), sc, Math.abs(sc), rr.range(-160, 160), rr.range(-420, -220), rr.range(-6, 6), { r: 12, bounce: 0.35, fade: 1.6 });
    st.P.burst('spark', w[0], w[1], 10, { speed: 360, color: VOID_L });
    st.P.burst('ashLight', w[0], w[1], 10, { speed: 200, color: MOTE });
    if ((b.silverK ?? 0) > 0.2) st.P.burst('spark', w[0], w[1], 6, { speed: 260, color: PURE });
    st.flashL = 1; st.flashW = [w[0], w[1]];
  }
}
function ambient(P, b, st, W, dt, q, hit, t, sk, vk) {
  if (b.dying > 0) return;
  const amb = q.ambient;
  // 결정에서 피어오르는 공허 가루
  if (rr.next() < dt * (2 + 4 * vk) * amb) {
    const c = b.crys[Math.floor(rr.next() * b.crys.length)];
    if (c?.alive) { const p = W(c.x, c.y, [0, 0]); P.emit('ashLight', p[0], p[1], rr.range(-20, 20), rr.range(-60, -20), { color: MOTE, size: rr.range(1.4, 2.6), life: rr.range(1, 1.8), layer: rr.chance(0.5) ? 0 : 1 }); }
  }
  // 드러난 핵의 스파크
  const co = b.coreOpenK?.() ?? 0;
  if (co > 0.4 && rr.next() < dt * 10 * amb) { const p = W(CC[0] + rr.range(-16, 16), CC[1] + rr.range(-16, 16), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-200, 200), rr.range(-260, 40), { color: VOID_L }); }
  // 은빛 (3페이즈)
  if (sk > 0.1 && rr.next() < dt * 8 * sk * amb) { const p = W(rr.range(-120, 140), rr.range(-60, 40), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-60, 60), rr.range(-160, -40), { color: PURE }); }
  // 숨결 모으기 · 기절
  if (b.state === 'breath' && b.ps.mouth > 0.3 && rr.next() < dt * 20 * amb) { const m = st.pts.mouth, p = W(m[0], m[1], [0, 0]); P.emit('spark', p[0], p[1], rr.range(-220, 220), rr.range(-220, 220), { color: BOLT }); }
  if (b.stunned && rr.next() < dt * 14 * amb) { const p = W(rr.range(-100, 100), rr.range(-60, 60), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-160, 160), rr.range(-260, 0), { color: VOID_L }); }
  if (hit) {
    const hp = st.fp, p = st.W2h ??= [0, 0];
    if (hp) { p[0] = hp.x + hp.w / 2 + rr.range(-8, 8); p[1] = hp.y + hp.h / 2 + rr.range(-8, 8); } else W(rr.range(-30, 30), rr.range(-30, 30), p);
    P.burst('chip', p[0], p[1], 6, { speed: 260, color: '#dfe6f2' });
    P.burst('spark', p[0], p[1], 5, { speed: 300, color: hp === b.pCore ? VOID_L : BOLT });
  }
}
/** 정화 (사망 5초): 핵 보석이 부서지는 순간 보석 조각 + 결정 파편, 그 뒤 은빛 가루가 위로 */
function purifyFx(ctx, b, rig, st, W, dt, dT, q) {
  const P = st.P;
  if (!st.gemGone && b.purified) {
    st.gemGone = true;
    const c = W(CC[0], CC[1], [0, 0]), G = rig.parts.gem;
    for (let i = 0; i < 5; i++) {
      const p = rig.parts[st.debris[[3, 4, 6, 1, 3][i] % st.debris.length]] ?? G;
      const a = -PI / 2 + (rr.next() - 0.5) * 2.4, sp = rr.range(240, 520);
      st.shards.spawn(p.v.base, p.c?.[0] ?? G.c[0], p.c?.[1] ?? G.c[1], c[0], c[1], rr.next() * TAU, p.k * 0.9, p.k * 0.9, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-8, 8), { r: 10, fade: 1.8 });
    }
    P.burst('spark', c[0], c[1], 30, { speed: 560, color: '#ffffff' });
    P.burst('spark', c[0], c[1], 20, { speed: 420, color: VOID_L });
    P.burst('ashLight', c[0], c[1], 26, { speed: 260, color: SILVER_MOTE });
  }
  if (dT > 1.1 && rr.next() < dt * 26 * q.ambient) {
    const p = W(rr.range(-140, 160), rr.range(-70, 50), [0, 0]);
    P.emit('ashLight', p[0], p[1], rr.range(-30, 30), rr.range(-120, -50), { color: SILVER_MOTE, size: rr.range(1.4, 2.8), life: rr.range(1, 2), layer: 1 });
  }
  if (dT < 1.1 && rr.next() < dt * 20) { const c = W(CC[0], CC[1], [0, 0]); P.emit('spark', c[0], c[1], rr.range(-240, 240), rr.range(-240, 120), { color: VOID_L }); }
}
/** 은빛 줄기 (지역 좌표, 결정적) */
function silverStreaks(ctx, D, b, t, sk, q) {
  D.end();   // 기준 변환 = 지역 좌표
  const bk = Math.floor(t * 6);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { const u = hash1(bk + i * 5.3), x = lerp(-110, 120, u); boltPath(ctx, x, -55, x + 30, 30, 4, 6, bk + i); }
  strokeBolt(ctx, 0.55 * sk, 1.4);
  if (q.halos) { halo(ctx, 0, -10, 150, PURE, 0.2 * sk); halo(ctx, b.head.lx, b.head.ly, 60, PURE, 0.25 * sk); }
}

/** 번개 경로 (결정적: seed 로 흔들림) */
function boltPath(ctx, x0, y0, x1, y1, jag, n, seed) {
  ctx.moveTo(x0, y0);
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 1; i < n; i++) {
    const u = i / n, o = (hash1(seed * 7.13 + i * 3.7) - 0.5) * 2 * jag;
    ctx.lineTo(x0 + dx * u + nx * o, y0 + dy * u + ny * o);
  }
  ctx.lineTo(x1, y1);
}
function strokeBolt(ctx, a, w = 2) {
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = ga * a * 0.55; ctx.strokeStyle = SKY; ctx.lineWidth = w * 3; ctx.stroke();
  ctx.globalAlpha = ga * a; ctx.strokeStyle = BOLT; ctx.lineWidth = w; ctx.stroke();
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
