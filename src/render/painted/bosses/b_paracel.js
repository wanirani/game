// 파라켈 박사 / 수은의 연금술사 (b_paracel) — 채색 컷아웃 퍼핏 렌더러 (CH26-B, docs/specs/ex_s26.md §2.2)
// 부품 (Kling, configs/b_paracel.json · tools/kling/manifest_ex6-boss.json):
//   옆모습 몸(body_a: 머리 · 가까운 팔 위/아래 · 벌린 손 · 장화 / body_b = 손과 먼 팔을 외투 결로 메운 것: 몸통(허리띠까지) · 앞치마 자락(플라스크 셋 + 금빛 약병) · 외투 뒷자락) ·
//   비명 머리(heads_a 거울상) · 바지 허벅지 · 쥔 손 둘(빈 손 · 금빛 약병을 쥔 손) · 접합 팔 세 장(뿌리 + 눈 · 꿰맨 마디 · 갈고리 손) ·
//   배양조(태아 포함) · 깨진 받침 · 깨진 뚜껑 · 가슴의 얼굴(2페이즈) · 플라스크 셋 · 확대경 · 금 조각 셋 · 유리 조각 둘
// 움직임은 전부 로직(src/game/bosses/e_paracel.js)의 값을 읽기만 한다:
//   boss { zx, fy, fk, facing, ps{lean,crouch,kneel,armN,lash,lashLow,lens,melt,tankK}, pts{hip,neck,head,eyeN,shN,shF,elN,hdN,knN,knF,ftN,ftF,tank,chest,lens,tA},
//          graft[7], fused, tankBroke, tankCrackT, goldK, sunk, exposed, stunned, stagLong, lensOn, tankUp, elemI, walkK, walkPh, spd, dieT, vanishK, dying,
//          state, t, flashT, hitPart, pHead/pTorso/pLegs/pTank/pChest, A.floor }
// 상태별 표현: 걷기(다리 · 외투 자락 흔들림) · 플라스크 던지기(다음 원소 병을 쥐고 돌림) · 붓기 · 렌즈(확대경을 들어 금빛 초점) · 배양조 부풂(가로로 부풀고 떨림) ·
//   접합 팔(마디 타일이 7점을 따라 늘어난다 — '관절이 너무 많은' 팔, 아래는 살 힘줄 벡터) · 수은 해일(몸이 은빛으로 녹아 납작해짐 → 가라앉음 → 다시 솟음 + 노출 빛) ·
//   무릎(비명 머리) · 15% 마지막 약(금빛 약병을 입으로) · 전환(배양조가 깨져 뚜껑·유리가 강체로 튀고 녹색 배양액 → 가슴의 얼굴) ·
//   금 번짐(goldK — 부위마다 굽힌 금빛 변형을 발끝 → 정수리 순서로, 부위 안에서는 아래에서 위로 차오르게 · 경계에 금 결정) ·
//   손상 0–2 · 피격 섬광(맞은 부위만) · 쓰러짐(무릎 꿇고 금 조각상 — 스토리는 그대로 남고, 아케이드는 금 조각·금가루로 흩어져 3초에 사라짐)
// 그리기 안에서는 Math.random · world.fx 를 쓰지 않는다 (hook_tags) — 렌더 난수 rr 과 시각 t 만.
import { Drawer, Particles, Shards, halo, puff, rr, loadRig, pickVariant, quality, QUALITY, ik2 } from '../kit.js';

const DIR = 'painted/bosses/b_paracel';
const PI = Math.PI;
const SILVER = '#c8d4e0', GOLD = '#e8c060', GOLD_H = '#fff0b0', GOLD_D = '#7a5a1c', GLASS = '#8fd8b8', BROTH = '#7dff9a', LENS = '#ffd060';
const EL = ['flaskR', 'flaskB', 'flaskG'], ELC = ['#ff7a2a', '#9fe8ff', '#7cff5a'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);
// 금 번짐 문턱 (e_paracel.js ON 과 같은 값 · 장화 부품 = 장화+정강이라 둘의 사이)
const ON = { shinF: 0.03, shinN: 0.06, thighF: 0.24, thighN: 0.28, tail: 0.38, skirt: 0.44, torso: 0.52, tank: 0.5, graft: 0.6, arm: 0.66, hand: 0.7, head: 0.84, face: 0.9 };
const RAMP = 0.12;
// 금빛 변형: 밝기를 금 사다리로 (그늘 = 짙은 황토 · 빛 = 옅은 금)
const GOLD_RULES = [
  { when: (h, s, l) => l > 0.78, h: 47, s: 0.55, s0: 0.3, l: 0.98 },
  { when: (h, s, l) => l < 0.12, h: 36, s: 0.2, s0: 0.55, l: 1.2, l0: 0.08 },
  { when: () => true, h: 42, s: 0.35, s0: 0.5, l: 0.85, l0: 0.13 },
];
// 수은 변형 (녹아내릴 때): 차가운 은빛
const MERC_RULES = [
  { when: () => true, h: 212, s: 0.12, s0: 0.06, l: 0.75, l0: 0.28 },
];
const BODY = ['head', 'headS', 'torso', 'skirt', 'tail', 'armU', 'armF', 'handO', 'handG', 'handV', 'thigh', 'shin', 'gRoot', 'gSeg', 'gHand', 'chestFace', 'tankBase'];
const DEF = {
  glow: '#ffd890',
  outline: { width: 1.2, color: 'rgba(8,5,8,0.9)' },
  parts: {
    head: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 60 },
    headS: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 60 },
    torso: { flash: true, cracks: 2, char: 0.15, holes: 0, crackMinLum: 30 },
    skirt: { flash: true, cracks: 2, char: 0.2, holes: 1, crackMinLum: 30 },
    tail: { flash: true, noDmg: true },
    armU: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 30 },
    armF: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 30 },
    handO: { flash: true, noDmg: true },
    handG: { flash: true, noDmg: true },
    handV: { flash: true, noDmg: true },
    thigh: { flash: true, noDmg: true, deep: 0.6 },
    shin: { flash: true, noDmg: true, deep: 0.6 },
    gRoot: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 50 },
    gSeg: { flash: true, noDmg: true },
    gHand: { flash: true, noDmg: true },
    tank: { flash: true, noDmg: true, outline: 0.9 },
    tankBase: { flash: true, noDmg: true, outline: 0.9 },
    tankLid: { noDmg: true, outline: 0.8 },
    chestFace: { flash: true, noDmg: true, outline: 0.8 },
    flaskR: { noDmg: true, outline: 0.6 },
    flaskB: { noDmg: true, outline: 0.6 },
    flaskG: { noDmg: true, outline: 0.6 },
    lens: { noDmg: true, outline: 0.7 },
  },
  prefix: { au: { noDmg: true, outline: 0.6 }, gl: { noDmg: true, outline: 0.5 } },
  tints: {
    gold: { rules: GOLD_RULES, levels: ['base', 'dmg1', 'dmg2'], glow: GOLD_H, parts: BODY },
    merc: { rules: MERC_RULES, levels: ['base'], glow: '#f4f8ff', parts: BODY.filter((n) => n !== 'tankBase' && n !== 'chestFace') },
  },
};
const COLORS = [SILVER, GOLD, GOLD_H, GLASS, BROTH, LENS, '#ffffff', ...ELC];

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_paracel', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    for (const c of COLORS) { puff(c, false); puff(c, true); }   // 싸움 중 새 캔버스 0: 쓰는 발광 색은 미리 굽는다
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(28), q, lt: null, pf: 0, fp: null, jolt: 0, lvl: 0, gk: 0, melt: 0,
      tb: boss.tankBroke ?? -9, fusedT: boss.fused ? -9 : null, wasFused: !!boss.fused, crumbled: false, sparkAcc: 0, dustAcc: 0,
      ff: { head: false, body: false, legs: false, tank: false, chest: false }, flashL: 0, flashW: [0, 0], E: [0, 0], H: [0, 0], G: [0, 0], L: [0, 0],
      path: new Float32Array(16), cum: new Float32Array(8), edge: [],
    };
  },
  draw(ctx, boss, world, rig, st) { drawBoss(ctx, boss, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.zx ?? b.cx, Y = b.fy ?? b.bottom, f = b.facing ?? 1;
    let x0 = X - 130, x1 = X + 130, y0 = Y - 250, y1 = Y + 30;
    const reach = (b.ps?.lash ?? 0) > 0.05 ? 290 : 150;
    if (f > 0) x1 = Math.max(x1, X + reach); else x0 = Math.min(x0, X - reach);
    if (b.ps?.melt > 0.05) { x0 = Math.min(x0, X - 90); x1 = Math.max(x1, X + 90); }
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 30 < x0) x0 = px - 30; if (px + 30 > x1) x1 = px + 30; if (py - 30 < y0) y0 = py - 30; if (py + 30 > y1) y1 = py + 30; }
    if (st?.shards?.list.length) for (const s of st.shards.list) { if (s.x - 40 < x0) x0 = s.x - 40; if (s.x + 40 > x1) x1 = s.x + 40; if (s.y - 40 < y0) y0 = s.y - 40; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    if (st.flashL > 0.05) L.add(st.flashW[0], st.flashW[1], 200, st.flashC ?? BROTH, st.flashL * 0.7);
  },
  /** 월드 파편(spawnDebris)용 채색 조각 — 금 조각 셋 */
  debris(i, rig) {
    const names = Object.keys(rig.parts).filter((n) => n.startsWith('au')); if (!names.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 1.2;
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
  const floor = b.A?.floor ?? b.fy, t = b.t;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0;
  const hk = b.stats?.maxHp ? b.hp / b.stats.maxHp : 1;
  st.lvl = dying ? 2 : hk < 0.35 ? 2 : hk < 0.7 ? 1 : 0;
  st.gk = clamp(b.goldK ?? 0, 0, 1);
  st.melt = clamp(b.ps?.melt ?? 0, 0, 1);
  // 피격 부위 고정 (섬광이 다시 켜진 프레임의 b.hitPart)
  if (b.flashT > st.pf + 1e-4) st.fp = b.hitPart ?? null;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 7);
  st.flashL = Math.max(0, st.flashL - dt * 2.2);
  const fOn = b.flashT > 0 && !dying, fp = st.fp, ff = st.ff;
  ff.head = fOn && (!fp || fp === b.pHead);
  ff.body = fOn && (!fp || fp === b.pTorso || fp === b.pChest);
  ff.legs = fOn && (!fp || fp === b.pLegs);
  ff.tank = fOn && (!fp || fp === b.pTank);
  ff.chest = fOn && (!fp || fp === b.pChest);
  // 다시 시작(onReset) — 깨진 배양조 · 조각 정리
  if (b.state === 'intro' || (!b.fused && (b.tankBroke ?? -9) < 0 && st.tb >= 0)) { st.shards.clear(); st.tb = b.tankBroke ?? -9; st.crumbled = false; }
  // 배양조가 깨진 순간 (로직 tankBroke 가 바뀐 프레임) → 뚜껑·유리가 강체로 튀고 배양액이 쏟아진다
  if ((b.tankBroke ?? -9) >= 0 && b.tankBroke !== st.tb) { st.tb = b.tankBroke; shatterTank(b, rig, st); }
  if (b.fused && !st.wasFused) st.fusedT = t;
  st.wasFused = !!b.fused;
  const bodyA = 1 - (b.vanishK ?? 0);
  if ((b.vanishK ?? 0) > 0.01 && !st.crumbled) { st.crumbled = true; crumble(b, rig, st); }
  const ga = ctx.globalAlpha;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  b.paintBack?.(ctx);   // 바닥 그림자 · 녹은 몸의 수은 웅덩이 (로직의 벡터 — 난수 없음)
  P.draw(ctx, 0);
  st.edge.length = 0;
  if (bodyA > 0.01 && !b.sunk) {
    ctx.globalAlpha = ga * bodyA;
    const fk = Math.abs(b.fk) < 0.2 ? 0.2 * Math.sign(b.fk || b.facing || 1) : b.fk;
    const melt = st.melt;
    D.begin(ctx); D.save();
    ctx.translate(b.zx, b.fy); ctx.scale(fk, 1 - melt * 0.8);
    if (melt > 0) ctx.transform(1, 0, Math.sin(t * 9) * 0.06 * melt, 1, 0, 0);
    D.begin(ctx);
    D.rec = false; D.log.length = 0;
    body(D, ctx, R, b, st, t, q);
    if (fOn) D.flash(clamp(b.flashT / 0.1, 0, 1) * (0.5 - 0.12 * clamp(st.gk, 0, 1)));
    else { D.rec = false; D.log.length = 0; }
    D.end();
    goldEdges(ctx, st, t, q);
    D.restore();
    ctx.globalAlpha = ga;
  }
  // ── 월드: 강체 조각 · 앞 효과 · 입자 ──
  D.begin(ctx);
  st.shards.draw(D);
  D.end();
  if (bodyA > 0.01 && !b.sunk) front(ctx, b, st, q, t, bodyA);
  b.paintFront?.(ctx);   // 노출 빛 · 배양조 부풂 빛 (로직의 벡터)
  ambient(P, b, st, dt, q, hit, t, bodyA);
  P.draw(ctx, 1);
  ctx.globalAlpha = ga;
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 부품 놓기 ─────────────────────────
/**
 * 부품 p 의 피벗 pv 를 (x,y) 에. lvl 손상 단계 · deep 먼 쪽 · on 금 번짐 문턱(null = 없음) · fill 'y' = 부품 안에서 아래→위로 차오름, 'a' = 섞기
 * 녹을 때(melt)는 은빛 변형을 덮는다. 반환 = 부품 (없으면 null)
 */
function put(D, st, p, pv, x, y, rot, sx, sy, lvl, deep, on, fill = 'y', alpha = 1) {
  if (!p) return null;
  const kg = on == null ? 0 : clamp((st.gk - on) / RAMP, 0, 1);
  const img = pickVariant(p, lvl, deep, kg >= 1 ? 'gold' : null);
  D.part(p, img, pv, x, y, rot, sx, sy, alpha);
  const pp = typeof pv === 'string' ? p[pv] : pv;
  if (kg > 0 && kg < 1) {
    const g = pickVariant(p, lvl, deep, 'gold');
    if (fill === 'a') D.img(g, pp[0], pp[1], x, y, rot, sx, sy, alpha * kg);
    else goldFill(D, st, g, pp, x, y, rot, sx, sy, alpha, kg);
  }
  if (st.melt > 0.02 && p.v.merc_base) D.img(pickVariant(p, 0, deep, 'merc'), pp[0], pp[1], x, y, rot, sx, sy, alpha * Math.min(1, st.melt * 1.4));
  return p;
}
/** 금이 부품 아래쪽부터 차오른다: 잘라 그린 금 변형 + 부드러운 띠 + 경계 결정 자리 기록 */
function goldFill(D, st, img, pp, x, y, rot, sx, sy, alpha, k) {
  const ctx = D.ctx, w = img.width, h = img.height, cut = h * (1 - k);
  D.set(pp[0], pp[1], x, y, rot, sx, sy);
  const ga = ctx.globalAlpha;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, cut, w, h - cut + 1); ctx.clip();
  ctx.globalAlpha = ga * alpha; ctx.drawImage(img, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(0, cut - 7, w, 7); ctx.clip();
  ctx.globalAlpha = ga * alpha * 0.45; ctx.drawImage(img, 0, 0);
  ctx.restore();
  ctx.globalAlpha = ga;
  // 경계 위의 세 점 (지역 좌표) — goldEdges 가 결정 · 반짝임을 그린다
  if (st.edge.length < 24) for (const u of [0.28, 0.52, 0.76]) { const o = D.pt(pp[0], pp[1], w * u, cut, x, y, rot, sx, sy, [0, 0]); st.edge.push(o[0], o[1], rot); }
}
/** 굳어 가는 경계의 금 결정 (지역 틀에서, D.end() 뒤 — 지역 변환은 save 안에 남아 있다) */
function goldEdges(ctx, st, t, q) {
  const E = st.edge; if (!E.length) return;
  const m = st.D.m;
  ctx.save();
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.lineWidth = 0.6; ctx.strokeStyle = GOLD_D; ctx.fillStyle = GOLD;
  for (let i = 0; i < E.length; i += 3) {
    const x = E[i], y = E[i + 1], r = E[i + 2] - PI / 2, s = 1.7 + 0.9 * Math.sin(i * 1.7 + t * 3);
    for (let k = -1; k <= 1; k++) {
      const a = r + k * 0.7, bx = x + Math.cos(r + PI / 2) * k * 1.8, by = y + Math.sin(r + PI / 2) * k * 1.8;
      ctx.beginPath(); ctx.moveTo(bx - Math.sin(a) * 0.8, by + Math.cos(a) * 0.8); ctx.lineTo(bx + Math.cos(a) * s, by + Math.sin(a) * s); ctx.lineTo(bx + Math.sin(a) * 0.8, by - Math.cos(a) * 0.8); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (q.halos) halo(ctx, x, y, 6, GOLD_H, 0.18 + 0.1 * Math.sin(t * 8 + i));
  }
  ctx.restore();
}
/** 두 점을 잇는 팔다리 부품: 그림의 a→b 를 로직 (ax,ay)→(bx,by) 방향으로, 길이는 축 방향(sy)만 lo..hi 로 늘인다 (그림 축이 세로인 부품) */
function limb(D, st, p, pa, pb, ax, ay, bx, by, lvl, deep, on, lo = 0.8, hi = 1.25) {
  if (!p) return;
  const A = p[pa], B = p[pb];
  const ix = B[0] - A[0], iy = B[1] - A[1], lx = bx - ax, ly = by - ay;
  const rot = Math.atan2(ly, lx) - Math.atan2(iy, ix);
  const s = clamp(Math.hypot(lx, ly) / (Math.hypot(ix, iy) * p.k || 1), lo, hi);
  put(D, st, p, pa, ax, ay, rot, p.k, p.k * s, lvl, deep, on);
}
/** 피벗 a 를 (x,y) 에 두고 그림의 a→b 방향이 각 ang 이 되게 */
function aimAt(D, st, p, pa, pb, x, y, ang, lvl, deep, on, sx = 1, sy = 1, fill = 'y', alpha = 1) {
  if (!p) return 0;
  const ia = Math.atan2(p[pb][1] - p[pa][1], p[pb][0] - p[pa][0]);
  put(D, st, p, pa, x, y, ang - ia, p.k * sx, p.k * sy, lvl, deep, on, fill, alpha);
  return ang - ia;
}

// ───────────────────────── 몸 (지역 틀: 발 = 0,0 · 앞 = +x) ─────────────────────────
function body(D, ctx, R, b, st, t, q) {
  const S = b.pts, Pz = b.ps, lvl = st.lvl, ff = st.ff, G = st.gk;
  const jr = st.jolt ? (rr.next() - 0.5) * 0.03 * st.jolt : 0;
  const kneel = clamp(Pz.kneel, 0, 1), crouch = clamp(Pz.crouch, 0, 1), walk = b.walkK ?? 0, ph = b.walkPh ?? 0;
  // 몸통 틀 (허리 = 로직 hip, 기울기 = 로직 등 각도의 변화) — 목·허리띠·어깨 자리는 그림에서 읽는다
  const T = R.torso, tRot = (S.tA - 0.2) + jr, tk = T.k;
  const hx = S.hip.x, hy = S.hip.y;
  const at = (pv, o) => D.pt(T.hip[0], T.hip[1], T[pv][0], T[pv][1], hx, hy, tRot, tk, tk, o);
  const NK = at('nk', st.H), BELT = at('belt', [0, 0]), BELTB = at('beltB', [0, 0]), SHN = at('shN', [0, 0]), TANK = at('tank', [0, 0]);
  // ── 1) 접합 팔 (먼 어깨 뒤에서 — 늘 몸 뒤) ──
  D.rec = ff.body;
  graftArm(D, ctx, R, b, st, t, q);
  // ── 2) 배양조 / 깨진 받침 (등 뒤) ──
  D.rec = ff.tank;
  if (!b.fused) tank(D, ctx, R, b, st, t, TANK);
  else put(D, st, R.tankBase, 'c', S.tank.x, S.tank.y, -0.12 + (S.tA - 0.2) * 0.8, R.tankBase.k, R.tankBase.k, 0, false, ON.tank, 'y');
  // ── 3) 먼 다리 (deep) ──
  D.rec = ff.legs;
  limb(D, st, R.thigh, 'hip', 'kn', hx - 4, hy + 2, S.knF.x, S.knF.y, 0, true, ON.thighF, 0.75, 1.25);
  limb(D, st, R.shin, 'kn', 'ft', S.knF.x, S.knF.y, S.ftF.x, S.ftF.y, 0, true, ON.shinF, 0.75, 1.3);
  // ── 4) 외투 뒷자락 (허리 뒤에서, 걸음·움직임에 늦게 따라 흔들림) ──
  D.rec = ff.legs || ff.body;
  const sway = Math.sin(ph) * 0.07 * walk + Math.sin(t * 1.7) * 0.025 + (b.spd > 0 ? 0.05 * walk : 0);
  const tl = R.tail;
  put(D, st, tl, 'top', BELTB[0], BELTB[1], tRot * 0.35 + sway + 0.08 * kneel, tl.k * (1 + 0.15 * kneel), tl.k * (1 - 0.32 * kneel - 0.12 * crouch), 0, false, ON.tail);
  // ── 5) 가까운 다리 ──
  D.rec = ff.legs;
  limb(D, st, R.thigh, 'hip', 'kn', hx + 4, hy + 3, S.knN.x, S.knN.y, 0, false, ON.thighN, 0.75, 1.25);
  limb(D, st, R.shin, 'kn', 'ft', S.knN.x, S.knN.y, S.ftN.x, S.ftN.y, 0, false, ON.shinN, 0.75, 1.3);
  // ── 6) 앞치마 · 외투 앞자락 (허리띠에 매달림 — 플라스크 셋과 금빛 약병 포함) ──
  D.rec = ff.body || ff.legs;
  const sk = R.skirt;
  put(D, st, sk, 'top', BELT[0], BELT[1], tRot * 0.4 - sway * 0.5 - 0.06 * kneel, sk.k * (1 + 0.12 * kneel), sk.k * (1 - 0.3 * kneel - 0.1 * crouch), lvl, false, ON.skirt);
  // ── 7) 몸통 (허리띠까지) ──
  D.rec = ff.body;
  put(D, st, T, 'hip', hx, hy, tRot, tk, tk, lvl, false, ON.torso);
  // ── 8) 가슴의 얼굴 (2페이즈 — 받아들인 호문쿨루스) ──
  if (b.fused) {
    const cf = R.chestFace, open = b.exposed || b.stunned;
    const pop = st.fusedT != null ? clamp((t - st.fusedT) / 0.3, 0, 1) : 1;
    const pul = 1 + 0.045 * Math.sin(t * 5) * (G < ON.face + RAMP ? 1 : 0) + (open ? 0.08 + 0.03 * Math.sin(t * 22) : 0);
    const s = cf.k * pul * (0.55 + 0.45 * pop);
    D.rec = ff.chest;
    put(D, st, cf, 'c', S.chest.x, S.chest.y, tRot * 0.6 + (open ? Math.sin(t * 17) * 0.04 : 0), s, s, 0, false, ON.face, 'y');
    st.chestOpen = open;
  }
  // ── 9) 가까운 팔 (어깨 = 그림의 어깨 → 팔을 들수록 목 쪽으로 · 손 = 로직 hdN). 팔 두 마디는 머리 뒤로 지나가고(얼굴을 가리지 않게),
  //       쥔 손과 든 것(병 · 확대경 · 약병)은 머리 앞에 — 쉼의 벌린 손은 소매보다 먼저 ──
  D.rec = ff.body;
  const arm = nearArm(D, ctx, R, b, st, t, SHN, NK);
  // ── 10) 머리 (서기 = 웃는 머리 · 무릎/쓰러짐/전환 = 비명 머리). 각도 = 로직 목→머리 방향의 변화 + 약 마실 때 젖힘 ──
  D.rec = ff.head;
  const scream = b.stunned || b.dying > 0 || b.state === 'fuse';
  const hp = scream ? R.headS : R.head;
  const ang = Math.atan2(S.head.y - S.neck.y, S.head.x - S.neck.x) - Math.atan2(-13.6, 11.6);
  const drink = clamp((Pz.armN - 3.3) / 0.6, 0, 1);
  const hr = ang * 0.9 - 0.32 * drink + jr + (b.stunned ? Math.sin(t * 13) * 0.04 : 0);
  if (hp) {
    put(D, st, hp, 'nk', NK[0], NK[1], hr, hp.k, hp.k, Math.min(1, lvl), false, ON.head);
    const e = D.pt(hp.nk[0], hp.nk[1], hp.eye[0], hp.eye[1], NK[0], NK[1], hr, hp.k, hp.k, st.E);
    st.eyeL = e;
  }
  // ── 11) 쥔 손 + 든 것 (머리 앞) ──
  D.rec = ff.body;
  if (arm) gripHand(D, ctx, R, b, st, t, arm);
  D.rec = false;
}

/** 등의 배양조: 가로로 부풀고 떨린다 · 금 간 줄(맞은 직후) · 등뼈로 가는 관 */
function tank(D, ctx, R, b, st, t, TANK) {
  const p = R.tank; if (!p) return;
  const S = b.pts, k = clamp(b.ps.tankK, 0, 1);
  const rot = -0.12 + (S.tA - 0.2) * 0.8;
  const sx = p.k * (1 + 0.16 * k + Math.sin(t * 18) * 0.025 * k), sy = p.k * (1 + 0.05 * k);
  // 관 (받침 옆 → 등) — 벡터
  const hs = D.pt(p.c[0], p.c[1], p.hose[0], p.hose[1], S.tank.x, S.tank.y, rot, sx, sy, st.G);
  D.end(); ctx.save(); const m = D.m; ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#141a16'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(hs[0], hs[1]); ctx.quadraticCurveTo(hs[0] + 6, hs[1] + 12, TANK[0], TANK[1] + 6); ctx.stroke();
  ctx.strokeStyle = 'rgba(120,140,128,0.5)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(hs[0], hs[1] - 0.8); ctx.quadraticCurveTo(hs[0] + 6, hs[1] + 11, TANK[0], TANK[1] + 5); ctx.stroke();
  ctx.restore();
  put(D, st, p, 'c', S.tank.x, S.tank.y, rot, sx, sy, 0, false, null);
  // 맞은 직후 1.5초: 유리에 흰 금
  const crack = b.t - (b.tankCrackT ?? -9);
  if (crack < 1.5) {
    D.set(p.c[0], p.c[1], S.tank.x, S.tank.y, rot, sx, sy);
    const cx = p.c[0], cy = p.c[1], a = 1 - crack / 1.5;
    ctx.strokeStyle = `rgba(255,255,255,${(0.85 * a).toFixed(3)})`; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx - 6, cy - 22); ctx.lineTo(cx + 3, cy - 8); ctx.lineTo(cx - 3, cy + 4); ctx.lineTo(cx + 7, cy + 18); ctx.moveTo(cx + 3, cy - 8); ctx.lineTo(cx + 12, cy - 12); ctx.stroke();
    D.end();
  }
}

/** 접합 팔: 7점 경로를 따라 뿌리(눈) · 꿰맨 마디(필요한 만큼) · 갈고리 손. 아래에 살 힘줄 벡터가 굽은 마디 사이를 메운다 */
function graftArm(D, ctx, R, b, st, t, q) {
  const Gp = b.graft; if (!Gp || Gp.length < 7) return;
  const root = R.gRoot, seg = R.gSeg, hand = R.gHand; if (!root || !seg || !hand) return;
  const n = 7, cum = st.cum, path = st.path;
  cum[0] = 0;
  for (let i = 0; i < n; i++) { path[i * 2] = Gp[i].x; path[i * 2 + 1] = Gp[i].y; if (i) cum[i] = cum[i - 1] + Math.hypot(Gp[i].x - Gp[i - 1].x, Gp[i].y - Gp[i - 1].y); }
  const L = cum[n - 1];
  const at = (d, o) => {
    d = clamp(d, 0, L);
    let i = 1; while (i < n - 1 && cum[i] < d) i++;
    const s0 = cum[i - 1], u = (d - s0) / ((cum[i] - s0) || 1);
    o[0] = path[(i - 1) * 2] + (path[i * 2] - path[(i - 1) * 2]) * u; o[1] = path[(i - 1) * 2 + 1] + (path[i * 2 + 1] - path[(i - 1) * 2 + 1]) * u;
    return o;
  };
  const lenOf = (p) => Math.hypot(p.b?.[0] - p.a?.[0], p.b?.[1] - p.a?.[1]) * p.k;
  const Lr = lenOf(root), Ls = lenOf(seg), Lh = Math.hypot(hand.tip[0] - hand.wr[0], hand.tip[1] - hand.wr[1]) * hand.k;
  const lash = clamp(b.ps.lash, -1, 1);
  const fit = Math.min(1, L / (Lr * 0.9 + Lh * 0.85));   // 쉼(짧은 경로)에서는 타일을 겹쳐 줄인다
  const A = [0, 0], B = [0, 0];
  const on = ON.graft;
  // 살 힘줄 (벡터): 경로를 따라 두 겹
  D.end(); ctx.save(); const m = D.m; ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const gold = clamp((st.gk - on) / RAMP, 0, 1);
  ctx.strokeStyle = gold > 0.5 ? '#5a4214' : '#4a2a2c'; ctx.lineWidth = 9.5;
  ctx.beginPath(); ctx.moveTo(path[0], path[1]); for (let i = 1; i < n; i++) ctx.lineTo(path[i * 2], path[i * 2 + 1]); ctx.stroke();
  ctx.strokeStyle = gold > 0.5 ? '#b88a30' : '#9a6466'; ctx.lineWidth = 6.5;
  ctx.stroke();
  ctx.restore();
  // 뿌리 (그루터기 + 눈)
  const lr = Lr * Math.min(1, fit * 1.05);
  at(0, A); at(lr, B);
  const ra = Math.atan2(B[1] - A[1], B[0] - A[0]);
  const rs = clamp(Math.hypot(B[0] - A[0], B[1] - A[1]) / (Lr || 1), 0.7, 1.05);
  const rr0 = aimAt(D, st, root, 'a', 'b', A[0], A[1], ra, Math.min(1, st.lvl), false, on, rs, 1, 'a');
  // 눈 깜박임 (벡터 눈꺼풀)
  if ((t * 0.45) % 1 < 0.07 && gold < 1) {
    const e = D.pt(root.a[0], root.a[1], root.eye[0], root.eye[1], A[0], A[1], rr0, root.k * rs, root.k, [0, 0]);
    D.end(); ctx.save(); ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.fillStyle = '#8a5a5c'; ctx.beginPath(); ctx.ellipse(e[0], e[1], 3.4, 3.0, ra, 0, PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a1012'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(e[0] - Math.cos(ra) * 3, e[1] - Math.sin(ra) * 3); ctx.lineTo(e[0] + Math.cos(ra) * 3, e[1] + Math.sin(ra) * 3); ctx.stroke();
    ctx.restore();
  }
  // 꿰맨 마디 (뿌리 끝 → 손목 사이를 메움, 15% 겹침 — 늘어날수록 마디가 는다)
  const hs = L - Lh * Math.min(1, fit);
  const step = Ls * 0.85;
  let d = lr - Ls * 0.15, i = 0;
  while (d < hs - Ls * 0.3 && i < 18) {
    const d1 = Math.min(d + Ls, hs + Ls * 0.1);
    at(d, A); at(d1, B);
    const a = Math.atan2(B[1] - A[1], B[0] - A[0]), s = clamp(Math.hypot(B[0] - A[0], B[1] - A[1]) / (Ls || 1), 0.6, 1.1);
    aimAt(D, st, seg, 'a', 'b', A[0], A[1], a, 0, false, on, s, 0.94 + 0.08 * Math.sin(i * 2.1 + t * 3), 'a');
    d += step; i++;
  }
  // 갈고리 손 (손목 → 끝 방향으로, 휘두를 때 조금 더 길게)
  at(Math.max(lr * 0.8, hs), A); at(L, B);
  let ha = Math.atan2(B[1] - A[1], B[0] - A[0]);
  if (Math.hypot(B[0] - A[0], B[1] - A[1]) < 2) ha = Math.atan2(path[13] - path[11], path[12] - path[10]);
  const wig = lash > 0 ? 0 : Math.sin(t * 4.2) * 0.12;
  aimAt(D, st, hand, 'wr', 'tip', A[0], A[1], ha + wig, 0, false, on, Math.min(1.08, Math.max(0.8, fit)) * (1 + Math.max(0, lash) * 0.08), 1, 'a');
}

/** 가까운 팔: 쉼(armN 0) = 그림처럼 늘어뜨림 → armN 이 오르면 로직 손 자리로. 어깨는 팔을 들수록 그림의 어깨(등 쪽)에서 목 쪽으로 조금 옮긴다
 *  (등에서 팔이 솟아 보이지 않게). 반환 = 쥔 손을 머리 앞에 그릴 자리 (쉼이면 null — 벌린 손은 여기서 소매보다 먼저 그렸다) */
function nearArm(D, ctx, R, b, st, t, SH0, NK) {
  const S = b.pts, Pz = b.ps, aN = clamp(Pz.armN, 0, 4), lvl = Math.min(1, st.lvl);
  const U = R.armU, F = R.armF; if (!U || !F) return null;
  const l1 = Math.hypot(U.el[0] - U.sh[0], U.el[1] - U.sh[1]) * U.k, l2 = Math.hypot(F.wr[0] - F.el[0], F.wr[1] - F.el[1]) * F.k;
  const k = clamp(Math.max(aN, Pz.lens), 0, 1);
  const SH = st.SH ??= [0, 0];
  SH[0] = lerp(SH0[0], NK[0] - 6, 0.45 * k); SH[1] = lerp(SH0[1], NK[1] + 10, 0.3 * k);
  // 쉼 자리: 어깨 아래로 거의 곧게 (숨쉬기 · 걸음에 조금 흔들림)
  const sw = Math.sin((b.walkPh ?? 0) + PI) * 4 * (b.walkK ?? 0) + Math.sin(t * 2.1) * 1.2;
  const rx = SH[0] + 2 + sw, ry = SH[1] + (l1 + l2) * 0.97;
  let tx = lerp(rx, S.hdN.x, k), ty = lerp(ry, S.hdN.y, k);
  // 마지막 약: 약병 주둥이를 (그림의) 입으로 — 로직 손 자리 대신 지난 프레임의 눈 자리 아래
  const drink = clamp((Pz.armN - 3.3) / 0.6, 0, 1);
  if (drink > 0 && st.eyeL) { tx = lerp(tx, st.eyeL[0] - 4, 0.75 * drink); ty = lerp(ty, st.eyeL[1] + 26, 0.75 * drink); }
  const o = ik2(SH[0], SH[1], tx, ty, l1, l2 + 2, aN > 2.5 ? 1 : -1, st.ik ??= {});
  const wx = o.hx, wy = o.hy, fa = Math.atan2(wy - o.ey, wx - o.ex);
  const grip = aN > 0.45 || Pz.lens > 0.05;
  limb(D, st, U, 'sh', 'el', SH[0], SH[1], o.ex, o.ey, lvl, false, ON.arm, 0.85, 1.15);
  if (!grip) aimAt(D, st, R.handO, 'wr', 'tip', wx, wy, fa + 0.08, 0, false, ON.hand);   // 소매 안으로 들어가므로 아래팔보다 먼저
  limb(D, st, F, 'el', 'wr', o.ex, o.ey, wx, wy, lvl, false, ON.arm, 0.85, 1.2);
  if (!grip) return null;
  const A = st.armOut ??= { wx: 0, wy: 0, fa: 0 };
  A.wx = wx; A.wy = wy; A.fa = fa;
  return A;
}
/** 쥔 손 (빈 손 · 약병 쥔 손) + 손에 든 것 — 머리 앞 */
function gripHand(D, ctx, R, b, st, t, A) {
  const hp = b.ps.armN > 3.5 ? R.handV : R.handG; if (!hp) return;
  const hr = aimAt(D, st, hp, 'wr', 'grip', A.wx, A.wy, A.fa - 0.15, 0, false, ON.hand);
  const g = D.pt(hp.wr[0], hp.wr[1], hp.grip[0], hp.grip[1], A.wx, A.wy, hr, hp.k, hp.k, st.L);
  held(D, ctx, R, b, st, t, g, hr, A.fa);
}
/** 손에 든 것 (손 grip 자리) */
function held(D, ctx, R, b, st, t, g, hr, fa) {
  const Pz = b.ps, aN = Pz.armN;
  const rec = D.rec; D.rec = false;
  if (Pz.lens > 0.05) {
    const p = R.lens; if (!p) { D.rec = rec; return; }
    const s = 0.35 + 0.65 * clamp(Pz.lens, 0, 1);
    // 확대경: 손잡이 끝을 손에, 알이 로직 렌즈 자리(손 위)를 향하게
    const ang = Math.atan2(b.pts.lens.y - g[1], b.pts.lens.x - g[0]);
    const r = aimAt(D, st, p, 'grip', 'c', g[0], g[1], ang, 0, false, null, s, s);
    st.lensW = D.pt(p.grip[0], p.grip[1], p.c[0], p.c[1], g[0], g[1], r, p.k * s, p.k * s, st.lensW ?? [0, 0]);
  } else if (aN > 0.45 && aN < 2.6) {
    const p = R[EL[(b.elemI ?? 0) % 3]]; if (p) {
      const spin = aN > 1.5 ? t * 8 : Math.sin(t * 3) * 0.1;
      D.part(p, p.v.base, 'neck', g[0], g[1], hr + PI + spin, p.k, p.k);
    }
  }
  D.rec = rec;
}

/** 몸 앞 효과 (월드 틀): 고글 반짝임 · 렌즈 초점 · 가슴 얼굴 빛 · 금 조각상 광택 */
function front(ctx, b, st, q, t, a) {
  const f = b.fk || 1, m = st.melt;
  const toW = (lx, ly, o) => { o[0] = b.zx + lx * (Math.abs(f) < 0.2 ? 0.2 * Math.sign(f) : f); o[1] = b.fy + ly * (1 - m * 0.8); return o; };
  if (st.eyeL && b.dying <= 0) {
    const e = toW(st.eyeL[0], st.eyeL[1], [0, 0]), k = 0.6 + 0.4 * Math.sin(t * 2.3);
    if (q.halos) halo(ctx, e[0], e[1], 7, SILVER, 0.35 * k * a);
    halo(ctx, e[0], e[1], 1.8, '#ffffff', 0.75 * k * a, true);
  }
  if (b.lensOn && st.lensW && b.ps.lens > 0.3) {
    const l = toW(st.lensW[0], st.lensW[1], [0, 0]), k = 0.6 + 0.3 * Math.sin(t * 20);
    halo(ctx, l[0], l[1], 26, LENS, k * a);
    halo(ctx, l[0], l[1], 6, '#ffffff', 0.9 * a, true);
  }
  if (b.fused && q.halos) {
    const c = toW(b.pts.chest.x, b.pts.chest.y, [0, 0]);
    halo(ctx, c[0], c[1], 22, GOLD, (st.chestOpen ? 0.45 : 0.22) * a);
  }
  // 굳은 금 광택: 아래에서 위로 흐르는 빛 한 줄 (금이 다 번진 부위가 있을 때)
  if (st.gk > 0.4 && q.halos) {
    const top = -40 - 140 * clamp((st.gk - 0.2) / 0.8, 0, 1), u = (t * 0.32) % 1;
    if (u < 0.45) { const p = toW(b.pts.hip.x + Math.sin(u * 9) * 6, lerp(-6, top, u / 0.45), [0, 0]); halo(ctx, p[0], p[1], 10, GOLD_H, 0.4 * Math.sin(u / 0.45 * PI) * a, true); }
  }
}

/** 배양조가 깨진 순간: 뚜껑 · 유리 조각이 강체로 튀고 녹색 배양액이 쏟아진다 */
function shatterTank(b, rig, st) {
  const R = rig.parts, f = b.facing || 1;
  const C = b.toW ? b.toW(b.pts.tank.x, b.pts.tank.y, { x: 0, y: 0 }) : { x: b.zx - 30 * f, y: b.fy - 120 };
  const lid = R.tankLid;
  if (lid) st.shards.spawn(lid.v.base, lid.c[0], lid.c[1], C.x, C.y - 30, rr.range(-0.4, 0.4), lid.k * f, lid.k, -f * rr.range(80, 200), rr.range(-460, -300), rr.range(-7, 7), { r: 7, bounce: 0.35, fade: 3.0 });
  const gl = Object.keys(R).filter((n) => n.startsWith('gl'));
  for (let i = 0; i < 7 && gl.length; i++) {
    const p = R[gl[i % gl.length]], s = p.k * rr.range(0.7, 1.4);
    st.shards.spawn(p.v.base, p.c[0], p.c[1], C.x + rr.range(-12, 12), C.y + rr.range(-25, 25), rr.range(-3, 3), s * (rr.next() < 0.5 ? -1 : 1), s, rr.range(-260, 260) - f * 60, rr.range(-420, -120), rr.range(-12, 12), { r: 3, bounce: 0.3, fade: 2.2 });
  }
  st.P.burst('ichor', C.x, C.y, 18, { speed: 260, angle: -PI / 2, spread: 1.3, color: '#1e3a14', hi: BROTH });
  st.P.burst('spark', C.x, C.y, 10, { speed: 260, color: GLASS });
  st.flashL = 1; st.flashW[0] = C.x; st.flashW[1] = C.y; st.flashC = BROTH;
}
/** 아케이드 쓰러짐: 굳은 금 조각상이 금 조각과 금가루로 흩어진다 (조각은 한 번) */
function crumble(b, rig, st) {
  const R = rig.parts, au = Object.keys(R).filter((n) => n.startsWith('au'));
  if (!au.length) return;
  const f = b.facing || 1;
  for (let i = 0; i < 9; i++) {
    const p = R[au[i % au.length]], s = p.k * rr.range(0.8, 1.6);
    const x = b.zx + rr.range(-22, 26) * f, y = b.fy - rr.range(20, 150);
    st.shards.spawn(p.v.base, p.c[0], p.c[1], x, y, rr.range(-1, 1), s * (rr.next() < 0.5 ? -1 : 1), s, rr.range(-140, 140), rr.range(-260, -40), rr.range(-6, 6), { r: 4, bounce: 0.25, fade: 2.4 });
  }
  st.flashL = 0.8; st.flashW[0] = b.zx; st.flashW[1] = b.fy - 90; st.flashC = GOLD;
}
function ambient(P, b, st, dt, q, hit, t, bodyA) {
  const amb = q.ambient, f = b.fk || 1;
  const toW = (lx, ly, o) => { o[0] = b.zx + lx * f; o[1] = b.fy + ly; return o; };
  if (b.dying > 0) {
    // 금이 다 번지는 동안 반짝임, 아케이드는 금가루로 흩어짐
    const crumbling = (b.vanishK ?? 0) > 0;
    st.dustAcc += dt * (crumbling ? 26 : 5) * amb;
    while (st.dustAcc >= 1) { st.dustAcc -= 1; const p = toW(rr.range(-22, 26), -rr.range(6, 150) * (1 - 0.6 * (b.vanishK ?? 0)), [0, 0]); P.emit(crumbling ? 'ember' : 'spark', p[0], p[1], rr.range(-40, 40), crumbling ? rr.range(-80, -20) : rr.range(-120, -30), { color: rr.next() < 0.4 ? GOLD_H : GOLD, layer: 1 }); }
    return;
  }
  if (bodyA < 0.3 || b.sunk) return;
  // 굳어 가는 경계의 금 반짝임
  if (st.edge.length && rr.next() < dt * 6 * amb) {
    const E = st.edge, j = 3 * Math.floor(rr.next() * (E.length / 3));
    const p = toW(E[j], E[j + 1], [0, 0]);
    P.emit('spark', p[0], p[1], rr.range(-50, 50), rr.range(-140, -40), { color: GOLD_H });
  }
  // 배양조 부풂: 녹청 기포 불티
  if (b.tankUp && !b.fused && rr.next() < dt * 16 * amb) { const p = toW(b.pts.tank.x + rr.range(-8, 8), b.pts.tank.y + rr.range(-20, 20), [0, 0]); P.emit('spore', p[0], p[1], rr.range(-15, 15), rr.range(-60, -20), { color: BROTH }); }
  // 렌즈 초점: 금빛 불티
  if (b.lensOn && st.lensW && rr.next() < dt * 20 * amb) { const l = st.lensW, p = toW(l[0], l[1], [0, 0]); P.emit('ember', p[0] + rr.range(-4, 4), p[1] + rr.range(-4, 4), rr.range(-30, 30), rr.range(-60, -10), { color: LENS }); }
  // 녹을 때 수은 방울
  if (st.melt > 0.1 && rr.next() < dt * 24 * amb) { const p = toW(rr.range(-30, 30), -rr.range(2, 40) * (1 - st.melt * 0.8), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-60, 60), rr.range(-160, -40), { color: SILVER }); }
  // 무릎: 머리 위 은빛 침
  if (b.stunned && st.eyeL && rr.next() < dt * 2.5 * amb) { const p = toW(st.eyeL[0] - 2, st.eyeL[1] + 15, [0, 0]); P.emit('blood', p[0], p[1], rr.range(-14, 14), rr.range(-20, 10), { color: '#5e6874', hi: SILVER }); }
  if (hit) {
    const hp = st.fp, p = st.H2 ??= [0, 0];
    if (hp) { p[0] = hp.x + hp.w / 2 + rr.range(-6, 6); p[1] = hp.y + hp.h / 2 + rr.range(-6, 6); } else { const w = toW(rr.range(-10, 10), rr.range(-120, -40), [0, 0]); p[0] = w[0]; p[1] = w[1]; }
    const gilt = hp === b.pLegs ? st.gk > ON.thighN + RAMP : hp === b.pHead ? st.gk > ON.head + RAMP : st.gk > ON.torso + RAMP;
    if (hp === b.pTank) { P.burst('spark', p[0], p[1], 4, { speed: 220, color: GLASS }); P.burst('ichor', p[0], p[1], 3, { speed: 160, color: '#1e3a14', hi: BROTH }); }
    else if (gilt) P.burst('spark', p[0], p[1], 5, { speed: 240, color: GOLD_H });
    else { P.burst('blood', p[0], p[1], 3, { speed: 170 }); P.burst('spark', p[0], p[1], 2, { speed: 220, color: SILVER }); }
  }
}
