// 둘라한 (b_dullahan) — 채색 컷아웃 퍼핏 렌더러 (말 + 기사 두 퍼핏을 안장에서 붙인다)
// 부품 (Kling): 유령마 몸통(안장·드러난 갈비뼈 속 푸른 혼불) · 해골 드러난 말머리+갈기(아래턱 분리) · 앞다리 2종/뒷다리(무릎·비절에서 둘로)
//   · 꼬리 · 흑기사 몸통(가시 견갑·목 없는 목받이) · 갑옷 다리(무릎에서 둘로) · 창 든 팔 · 머리 받치는 팔 · 긴 창 · 불타는 해골 · 찢긴 망토 · 파편 9
// 움직임은 전부 기존 로직(src/game/bosses/a_dullahan.js)의 값을 읽기만 한다:
//   boss { cx, bottom, facing, mounted, S, gait, rear, lanceA, lanceX, lean, skullUp, skullOut, vx, capeT, fury, phase, inferno,
//          horseFade/fadeX/fadeB/fadeF, state, stateT, flashT, dying, deathT, t, onGround, hp/stats.maxHp, A }
// 판정과 맞추는 기준점 (로직 좌표를 그대로 쓴다): 목 = neck() (8,-170)/(2,-128), 창 기준 = (34,-128)/(24,-88),
//   창끝 = lanceTip() 과 같은 직선 위 (170+lanceX) 지점 (+그림 창날 24), 머리 든 손 = skullHand().
//   → 돌격·찌르기의 창 판정과 그림 창이 항상 겹친다. 창을 쥔 손은 팔 길이에 맞춰 자루를 따라 미끄러진다.
// 상태별 표현: idle(말 숨쉬기·갈기 불꽃) charge(뒤로 물러남 → 앞발 들기 → 창 수평 돌진, 잔상은 로직 fx.ghost 가 ghost() 로)
//   skull(머리 든 팔을 치켜들고 해골 불꽃이 커짐 → 던진 뒤 빈 손) stomp(말이 뒷발로 서며 아래턱이 벌어지고 비명 → 내리찍기)
//   thrust/lunge(창이 자루를 따라 뻗고 창 잔광) hellfire(창을 치켜들면 창날을 타고 푸른 불이 오름) transform(지옥의 기수: 갈기·발굽·목 불꽃 폭발)
//   dismount(말이 서서 울부짖다 푸른 불티로 흩어지며 사라짐 — horseFade) · 도보(걷기·도약 때 다리 접기·망토 날림) · phantom(유령마 투사체 = phantom())
//   던진 해골 투사체 = skullShot() · 피격 섬광 · 손상 단계 0~2(구운 균열·그을림 + 푸른 균열 발광, 단계 상승 때 불티·파편 폭발)
//   death(목 불꽃이 치솟음 → 해골이 튀어 오르며 터짐 → 창이 떨어짐 → 팔·망토가 떨어짐 → 갑옷이 무너져 흩어지고 혼불이 꺼짐; 기승 중이면 말이 흩어짐)
// 절차적 층: 목 그루터기의 푸른 혼불 혀(가산 퍼프) · 갈기/꼬리/발굽 불꽃 · 해골의 주황 불꽃·녹아 떨어지는 불방울 · 말 상처에서 떨어지는 검푸른 엑토플라즘
//   · 망토 가로 띠 흔들기(천의 움직임) · 창 룬 발광 · 입 속 푸른 빛
// 좌표: 로직 벡터 그림과 같은 지역 좌표계 (발 중앙 원점, +x = 바라보는 쪽, 배율 S). 기승 중에는 뒷발(-46,0) 기준으로 rear 만큼 몸을 일으킨다.
import { Drawer, Particles, DamageState, Shards, halo, puff, rr, hash1, loadRig, pickVariant, quality, QUALITY, ledgesOver, ik2 } from '../kit.js';

const DIR = 'painted/bosses/b_dullahan';
const BFIRE = '#8ab8ff', BCORE = '#e2f0ff', BDEEP = '#2c56d8', OFIRE = '#ff8a2a', OCORE = '#ffd680', ECTO = '#0b1532', ECTO_HI = '#a8d0ff', STEEL = '#3c404e';
const PI = Math.PI, TAU = PI * 2;
const BU = 1.3;              // 굽기 기준 배율 (기승 S): 부품 텍셀 → 지역 단위 = k / BU
const TIP_OVER = 24;          // 판정 끝 너머로 보이는 창날 길이 (지역 단위, 벡터는 34)
const LANCE_THICK = 1.3;      // 창 자루 굵기 (세로 배율)
const HEAD_K = 0.86;          // 말머리 배율 (그림 원본이 몸에 비해 크다)
const RIDER_K = 1.08;         // 기승 중 기사 배율 (말 위에서 작아 보이지 않게, 목 위치는 로직 neck() 그대로)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
/** 실제 적용 품질 등급 (설정이 'auto' 면 조절기가 고른 game.quality/tier) */
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);

/** 굽기 옵션 (kit.loadRig def) */
const LEG = { flash: true, deep: 0.6, cracks: 1, holes: 0, char: 1, stain: 'rgb(44,58,104)', crackMinLum: 110 };
const ARMOR = { flash: true, cracks: 1, holes: 0, char: 1, crackMinLum: 35 };
const DEF = {
  glow: BFIRE,
  outline: { width: 1.8, color: 'rgba(3,5,14,0.9)' },
  parts: {
    hbody: { flash: true, cracks: 3, holes: 1, char: 1, stain: 'rgb(40,52,96)', crackMinLum: 110 },
    hneck: { flash: true, cracks: 2, holes: 0, char: 1, stain: 'rgb(40,52,96)', crackMinLum: 140 },
    hjaw: { flash: true, cracks: 1, holes: 0, crackMinLum: 140 },
    foreU: LEG, foreL: LEG, foreU2: LEG, foreL2: LEG, hindU: LEG, hindL: LEG,
    tail: { flash: true, noDmg: true },
    torso: { flash: true, cracks: 3, holes: 0, char: 1, crackMinLum: 35 },
    legU: { ...ARMOR, deep: 0.6 }, legL: { ...ARMOR, deep: 0.6 },
    armN: ARMOR, armF: { ...ARMOR, deep: 0.72, deepOnly: true },
    lance: { flash: true, noDmg: true, outline: 1.2 },
    skull: { flash: true, noDmg: true, outline: 1.2 },
    cape: { flash: true, holes: 2, cracks: 0, char: 1, stain: 'rgb(40,8,12)' },
  },
  prefix: { deb: { noDmg: true, outline: 1.2 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_dullahan', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(40), q,
      dmg: new DamageState(boss.def?.phases ?? [0.6, 0.3]), lt: null, pf: 0, lvl: 0, fs: null,
      o: {}, go: {}, po: {}, fo: {}, dead: {}, dv: null, W: [0, 0],
      X: 0, B: 0, S: 1.3, fsx: 1, R: 0, debris: rig.man.groups?.debris ?? [],
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.cx, B = b.bottom, A = b.A;
    let x0 = X - 480, x1 = X + 480, y0 = B - 460, y1 = Math.max(B + 30, (A?.floor ?? B) + 10);
    if (b.horseFade > 0 && b.fadeX != null) { x0 = Math.min(x0, b.fadeX - 320); x1 = Math.max(x1, b.fadeX + 320); y0 = Math.min(y0, b.fadeB - 420); y1 = Math.max(y1, b.fadeB + 20); }
    if (A && (b.dying > 0 || st?.shards?.list.length || st?.dfade)) { x0 = Math.min(x0, A.x0 - 40); x1 = Math.max(x1, A.x1 + 40); y0 = Math.min(y0, B - 520); y1 = Math.max(y1, A.floor + 20); }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    const o = st.o;
    const k = b.dying > 0 ? clamp(1 - (b.deathT ?? 0) / 1.3, 0, 1) : 1;
    if (k <= 0) return;
    if (o.eyeW && b.mounted && !st.dead.horse) L.add(o.eyeW[0], o.eyeW[1], 60, BFIRE, 0.55 * k);
    if (o.hoofW && b.mounted && ((b.phase ?? 0) >= 1 || b.inferno)) L.add(o.hoofW[0], o.hoofW[1], 110, BFIRE, 0.55 * k);
    if (o.tipW && (b.state === 'hellfire' || (b.phase ?? 0) >= 1)) L.add(o.tipW[0], o.tipW[1], 70, BFIRE, 0.45 * k);
  },
  /** 월드 파편(ABoss.spawnDebris)용 채색 조각 */
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.8;
    return { size: Math.max(10, (p.r ?? 10) * 1.1), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
  /** 돌격·연속 찌르기 잔상 (로직 afterimage → fx.ghost): 스냅숏 자세를 푸른 발광 실루엣으로 */
  ghost(ctx, b, s, a, rig, st) {
    if (!rig || !st?.dv || b.dying > 0) return false;
    const D = st.ghostD ??= new Drawer();
    const o = st.go;
    pose(o, b, s, b.t ?? 0, true);
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.save();
    ctx.translate(s.x, s.b); ctx.scale((s.f || 1) * o.S, o.S);
    ctx.globalCompositeOperation = 'lighter';
    D.begin(ctx);
    drawFigure(D, ctx, b, rig, st, o, 'ghost', a * 0.42);
    D.end();
    ctx.restore();
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
    return true;
  },
  /** 유령마 환영 돌격 투사체 (원점 = 투사체 중심) */
  phantom(ctx, b, pr, rig, st) {
    if (!rig || !st?.dv) return false;
    const D = st.phD ??= new Drawer();
    const o = st.po, t = pr.t ?? 0, dir = Math.sign(pr.vx) || 1;
    o.mounted = true; o.S = 1.2; o.g = t * 16; o.run = 1; o.walk = 1; o.rear = 0; o.R = 0; o.bob = Math.sin(o.g * 2) * 4; o.t = t;
    o.nr = 0.1 + Math.sin(o.g * 2) * 0.05; o.jaw = 0.32 + Math.sin(t * 13) * 0.08; o.phase = 2; o.fx = false;
    const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.save();
    ctx.translate(0, (pr.h ?? 110) / 2); ctx.scale(dir * 1.2, 1.2);
    halo(ctx, 0, -70, 170, BFIRE, 0.4);
    halo(ctx, -60, -60, 120, BDEEP, 0.35);
    D.begin(ctx);
    // 뒤따르는 잔영 둘 + 본체
    for (let e = 2; e >= 0; e--) {
      D.save(); ctx.translate(-e * 34, -e * 2); D.begin(ctx);
      const k = e ? 0.45 / e : 1;
      ctx.globalCompositeOperation = 'source-over';
      if (!e) drawHorse(D, ctx, b, rig, st, o, 'plain', 0.3);
      ctx.globalCompositeOperation = 'lighter';
      drawHorse(D, ctx, b, rig, st, o, 'ghost', 0.55 * k);
      D.end(); D.restore(); D.begin(ctx);
    }
    ctx.globalCompositeOperation = op;
    // 갈기·발굽 불꽃
    maneFire(ctx, D, rig, st, o, 1.4, 0);
    ctx.restore();
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
    return true;
  },
  /** 던진 불타는 해골 투사체 (원점 = 투사체 중심) */
  skullShot(ctx, b, p, rig, st) {
    const Sk = rig?.parts?.skull; if (!Sk) return false;
    const D = st.skD ??= new Drawer();
    const dir = Math.sign(p.vx) || 1, t = p.t ?? 0;
    const th = clamp(Math.atan2((p.vy ?? 0) * dir, (p.vx ?? 1) * dir), -0.7, 0.7) + Math.sin(t * 14) * 0.12;
    const k = Sk.k * 0.82;
    const sp = Math.hypot(p.vx ?? 0, p.vy ?? 0) || 1, ux = -(p.vx ?? 0) / sp, uy = -(p.vy ?? 0) / sp;
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    // 불꽃 꼬리 (가산)
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 6; j >= 0; j--) {
      const u = j / 6, r = 20 - j * 2, wob = Math.sin(t * 20 + j * 1.7) * 4 * u;
      ctx.globalAlpha = ga * (0.75 - u * 0.5);
      ctx.drawImage(puff(j < 2 ? OCORE : OFIRE, j === 0), ux * j * 7 - uy * wob - r, uy * j * 7 + ux * wob - j * 1.8 - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
    D.begin(ctx);
    D.part(Sk, Sk.v.base, 'c', 0, 0, th, -k * dir, k);
    const e1 = D.pt(Sk.c[0], Sk.c[1], Sk.eyeA[0], Sk.eyeA[1], 0, 0, th, -k * dir, k, _a), e2 = D.pt(Sk.c[0], Sk.c[1], Sk.eyeB[0], Sk.eyeB[1], 0, 0, th, -k * dir, k, _b);
    D.end();
    const fl = 0.8 + Math.sin(t * 23) * 0.2;
    halo(ctx, e1[0], e1[1], 9 * fl, OFIRE, 0.9, true);
    halo(ctx, e2[0], e2[1], 6 * fl, OFIRE, 0.7, true);
    flames(ctx, 0, -8, -PI / 2, 22, 6, 3, t, 3.1, OFIRE, OCORE, 0.8, 3);
    return true;
  },
};

// ───────────────────────── 파생 치수 (리그마다 한 번) ─────────────────────────
function derive(st, rig) {
  if (st.dv && st.dv.rig === rig) return st.dv;
  const R = rig.parts, dv = { rig };
  const U = (p) => p.k / BU;
  const dist = (p, a, c) => Math.hypot(p[c][0] - p[a][0], p[c][1] - p[a][1]) * U(p);
  const ang = (p, a, c) => Math.atan2(p[c][1] - p[a][1], p[c][0] - p[a][0]);
  const Hb = R.hbody, bu = U(Hb);
  const lf = (R.foreL.hoof[1] - R.foreL.knee[1]) * U(R.foreL) + (R.foreU.knee[1] - R.foreU.hip[1]) * U(R.foreU);
  dv.bu = bu; dv.HBX = -2; dv.HBY = -((Hb.foreN[1] - Hb.c[1]) * bu + lf + 1.8);
  dv.lu = U(R.legU); dv.l1 = dist(R.legU, 'hip', 'knee'); dv.l2 = dist(R.legL, 'knee', 'ankle');
  dv.angU = ang(R.legU, 'hip', 'knee'); dv.angL = ang(R.legL, 'knee', 'ankle');
  dv.legLen = dv.l1 + (R.legL.sole[1] - R.legL.knee[1]) * dv.lu;
  dv.au = U(R.armN); dv.Lf = dist(R.armN, 'elbow', 'grip');
  dv.angN = Math.atan2(R.armN.grip[1] - R.armN.elbow[1], -(R.armN.grip[0] - R.armN.elbow[0]));   // 좌우 뒤집어 그린 팔꿈치→주먹 각도
  dv.Lfa = dist(R.armF, 'elbow', 'palm'); dv.angF = ang(R.armF, 'elbow', 'palm');
  dv.tu = U(R.torso);
  dv.neckHip = [(R.torso.hip[0] - R.torso.neck[0]) * dv.tu, (R.torso.hip[1] - R.torso.neck[1]) * dv.tu];
  dv.lk = U(R.lance); dv.lanceLen = (R.lance.tip[0] - R.lance.butt[0]) * dv.lk; dv.headLen = (R.lance.tip[0] - R.lance.head[0]) * dv.lk;
  dv.sk = U(R.skull); dv.cu = U(R.cape); dv.hk = U(R.hneck) * HEAD_K; dv.tk = U(R.tail);
  st.dv = dv;
  return dv;
}

// ───────────────────────── 자세 ─────────────────────────
/** s = 보스 자신 또는 잔상 스냅숏 {x,b,f,gait,rear,lanceA,lean} */
function pose(o, b, s, t, ghost = false) {
  const mounted = !!b.mounted;
  o.mounted = mounted; o.S = mounted ? 1.3 : 1.2; o.fx = !ghost;
  const vx = b.vx ?? 0;
  o.g = s.gait ?? b.gait ?? 0; o.run = clamp(Math.abs(vx) / 600, 0, 1); o.walk = clamp(Math.abs(vx) / (mounted ? 150 : 110), 0, 1);
  o.rear = mounted ? (s.rear ?? b.rear ?? 0) : 0;
  o.lanceA = s.lanceA ?? b.lanceA ?? -1; o.lanceX = ghost ? Math.max(0, b.lanceX ?? 0) : (b.lanceX ?? 0); o.lean = s.lean ?? b.lean ?? 0;
  o.su = b.skullUp ?? 0.5; o.skullOut = ghost || !!b.skullOut;
  o.bob = mounted ? Math.sin(o.g * 2) * (1 + o.run * 3) : 0;
  o.t = t; o.phase = b.phase ?? 0; o.air = !mounted && !b.onGround;
  o.capeT = b.capeT ?? t;
  o.R = mounted ? -o.rear * 0.55 : 0;
  const st8 = b.state, sT = b.stateT ?? 0;
  // 말 목·턱
  let nr = -o.rear * 0.2 + Math.sin(o.g * 2) * 0.04 * o.run + Math.sin(t * 1.3) * 0.025;
  // 창이 수평이면 말머리를 치켜든다: 돌격·찌르기 창(판정 높이 −128)이 해골 얼굴이 아니라 목 앞을 지나가게
  if (mounted) nr -= 0.34 * clamp(1 - Math.abs(o.lanceA) / 0.45, 0, 1) * (1 - clamp(o.rear * 2, 0, 1));
  o.nr = nr;
  let jaw = 0.06 + Math.sin(t * 2.1) * 0.03 + o.rear * 0.34;
  if (st8 === 'transform' || st8 === 'dismount') jaw += 0.18 + Math.sin(t * 30) * 0.05;
  if (st8 === 'charge' && sT > 1.0) jaw += 0.2;
  if (b.dying > 0) jaw = 0.4;
  o.jaw = clamp(jaw, 0, 0.5);
  return o;
}

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P;
  const dv = derive(st, rig);
  st.q = qOf(world.game);
  const q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, floor = A.floor, t = b.t;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0, dT = b.deathT ?? 0;
  const ratio = dying ? 0 : b.hp / b.stats.maxHp;
  const up = st.dmg.update(ratio, dt);
  st.lvl = dying ? 2 : Math.max(0, st.dmg.level);
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  // 좌우 뒤집기: 종이 뒤집기 (≈0.2 s)
  if (st.fs == null) st.fs = b.facing || 1;
  st.fs = approach(st.fs, b.facing || 1, dt * 10);
  const fsx = Math.sign(st.fs || 1) * Math.max(0.12, Math.abs(st.fs));
  const o = pose(st.o, b, b, t);
  const X = b.cx + (b.flashT > 0 ? (rr.next() - 0.5) * 4 : 0), B = b.bottom, S = o.S;
  st.X = X; st.B = B; st.S = S; st.fsx = fsx; st.R = o.mounted ? -o.rear * 0.55 : 0;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  // 기승 중 사망: 말은 흩어진다
  if (dying && o.mounted && !st.dfade && dT > 0.3) { st.dfade = { x: X, b: B, f: b.facing || 1, g: o.g }; st.dead.horse = true; }
  // 바닥 그림자 · 역광 (월드)
  D.begin(ctx);
  const alt = clamp((floor - B) / 300, 0, 1);
  if (!st.dead.body) {
    const sw = (o.mounted && !st.dead.horse ? 150 : 62) * (1 - alt * 0.4);
    D.img(puff('#000000'), 32, 32, X, floor - 2, 0, sw / 32, 16 * (1 - alt * 0.4) / 32, 0.6 * (1 - alt * 0.5));
  }
  D.end();
  if (q.halos && !st.dead.body) {
    const c = W(st, o.mounted ? 0 : 0, o.mounted ? -115 : -80, _c);
    halo(ctx, c[0], c[1], (o.mounted ? 230 : 150), '#0a1438', 0.5);
    const fury = (b.fury ?? 0) + (b.state === 'transform' ? 0.8 : 0) + (b.inferno ? 0.3 : 0);
    if (fury > 0.02) halo(ctx, c[0], c[1], (o.mounted ? 250 : 170), BDEEP, (0.1 + 0.05 * Math.sin(t * 5)) * fury);
  }
  // 사라지는 유령마 (하마 연출 · 기승 중 사망)
  if (!b.mounted && b.horseFade > 0 && b.fadeX != null) fadeHorse(ctx, st, b, rig, b.fadeX, b.fadeB - (1.2 - b.horseFade) * 60, b.fadeF || 1, clamp(b.horseFade / 1.2, 0, 1), 0.8, b.t, dt);
  if (st.dfade) {
    const k = clamp(1 - (dT - 0.3) / 1.1, 0, 1);
    if (k > 0) fadeHorse(ctx, st, b, rig, st.dfade.x, st.dfade.b - (1 - k) * 40, st.dfade.f, k, 0.5, b.t, dt);
  }
  P.draw(ctx, 0);
  if (up > 0 && !dying) levelBurst(P, st, o, up);
  // ── 몸 (지역 좌표) ──
  const rec = b.flashT > 0 && !dying;
  const open = () => {
    D.save();
    ctx.beginPath(); ctx.rect(A.x0 - 2000, floor - 3000, A.w + 4000, 3002); ctx.clip();   // 바닥 아래는 그리지 않는다
    ctx.translate(X, B); ctx.scale(fsx * S, S);
    if (st.R) { ctx.translate(-46, 0); ctx.rotate(st.R); ctx.translate(46, 0); }
    D.begin(ctx);
  };
  open();
  const fa = clamp(b.flashT / 0.1, 0, 1) * 0.7;
  if (o.mounted && !st.dead.horse) {
    D.rec = rec; D.log.length = 0;
    drawHorse(D, ctx, b, rig, st, o, 'main', 1);
    if (rec) D.flash(fa); else { D.rec = false; D.log.length = 0; }
    D.end();
    maneFire(ctx, D, rig, st, o, 1, dT);
    if (q.ledges !== false) {
      D.restore();
      const cam = world.camera, cx0 = cam?.x ?? -1e9, cy0 = cam?.y ?? -1e9, cx1 = cx0 + (cam?.vw ?? 2e9), cy1 = cy0 + (cam?.vh ?? 2e9);
      ledgesOver(ctx, world, Math.max(X - 220, cx0), Math.max(B - 220, cy0), Math.min(X + 220, cx1), Math.min(B - 30, cy1));
      open();
    }
  }
  D.rec = rec; D.log.length = 0;
  drawRider(D, ctx, b, rig, st, o, 'main', 1);
  if (rec) D.flash(fa); else { D.rec = false; D.log.length = 0; }
  D.end();
  riderFire(ctx, D, b, rig, st, o, dT);
  D.restore();
  // ── 월드: 파편 · 입자 ──
  D.begin(ctx);
  st.shards.draw(D);
  D.end();
  ambient(P, b, st, o, dt, q, hit);
  if (dying) deathFx(ctx, D, b, rig, st, o, dt, dT);
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

/** 지역(F1) → 월드 */
function W(st, lx, ly, out) {
  let x = lx, y = ly;
  if (st.R) { const c = Math.cos(st.R), s = Math.sin(st.R), dx = x + 46; x = -46 + c * dx - s * y; y = s * dx + c * y; }
  out[0] = st.X + st.fsx * st.S * x; out[1] = st.B + st.S * y;
  return out;
}
const _a = [0, 0], _b = [0, 0], _c = [0, 0], _h = [0, 0], _k = [0, 0], _n = [0, 0], _ang = [0, 0];
const _ik = {};

/** 부품 하나. mode: main(손상 변형) · plain(기본) · ghost(발광 실루엣, 호출 측이 가산 합성) */
function put(D, st, p, pivot, x, y, rot, sx, sy, a, deep, mode) {
  if (mode === 'ghost' || st.dissolve > 0) {
    const im = mode === 'ghost' ? (p.v.glow ?? p.v.flash) : pickVariant(p, 0, deep, null); if (!im) return;
    const pv = typeof pivot === 'string' ? p[pivot] : pivot;
    if (st.dissolve > 0) dissolve(D, im, pv, x, y, rot, sx, sy, a, st.dissolve, p.w * 0.37 + p.h * 0.11);
    else D.img(im, pv[0], pv[1], x, y, rot, sx, sy, a);
    return;
  }
  D.part(p, pickVariant(p, mode === 'main' ? st.lvl : 0, deep, null), pivot, x, y, rot, sx, sy, a);
}
/** 흩어지기: 가로 띠마다 다른 때에 흐려지며 위로 떠오른다 (k: 1 온전 → 0 사라짐) */
function dissolve(D, img, pv, x, y, rot, sx, sy, a, k, seed) {
  if (a <= 0.004) return;
  D.set(pv[0], pv[1], x, y, rot, sx, sy);
  const ctx = D.ctx, H = img.height, Wd = img.width, n = 7, hh = H / n, ga = ctx.globalAlpha;
  for (let i = 0; i < n; i++) {
    const h = hash1(seed + i * 3.3);
    const ak = clamp((k - h * 0.55) / 0.45, 0, 1);
    if (ak <= 0.01) continue;
    ctx.globalAlpha = ga * a * ak;
    const rise = (1 - ak) * (14 + h * 26) / Math.abs(sy), side = (h - 0.5) * (1 - ak) * 12 / Math.abs(sx);
    ctx.drawImage(img, 0, i * hh, Wd, hh + 1, side, i * hh - rise, Wd, hh + 1);
  }
  ctx.globalAlpha = ga;
}
/** 말(기승) + 기사 전체 — 잔상 등 다른 변환에서 그릴 때 (D 기준 = F0) */
function drawFigure(D, ctx, b, rig, st, o, mode, alpha) {
  if (o.mounted) {
    D.save(); ctx.translate(-46, 0); ctx.rotate(-o.rear * 0.55); ctx.translate(46, 0); D.begin(ctx);
    drawHorse(D, ctx, b, rig, st, o, mode, alpha);
    drawRider(D, ctx, b, rig, st, o, mode, alpha);
    D.end(); D.restore(); D.begin(ctx);
  } else drawRider(D, ctx, b, rig, st, o, mode, alpha);
}

// ───────────────────────── 말 ─────────────────────────
function legAng(ph, front, far, run, walk, rear, out) {
  const amp = 0.18 * walk + 0.4 * run;
  let a1 = Math.sin(ph) * amp * (front ? 1 : 0.9);
  let a2 = front ? -Math.max(0, Math.cos(ph)) * (0.3 + run * 0.9) * walk : Math.max(0, -Math.cos(ph)) * (0.3 + run * 0.7) * walk;
  if (front && rear > 0) { a1 += rear * (far ? 1.1 : 1.4); a2 -= rear * 1.6; }
  if (!front) a1 -= rear * 0.5;           // 뒷다리는 몸이 일어서도 땅을 딛도록
  out[0] = a1; out[1] = a2;
  return out;
}
/** 두 마디 다리: 아래 마디 먼저, 위 마디(흐린 아래끝)를 위에. 앞으로 차는 각 a1 → 회전 −a1 */
function drawLeg(D, st, U, Lw, jn, hx, hy, a1, a2, deep, mode, alpha, fireOut) {
  const u = U.k / BU;
  const kp = D.pt(U.hip[0], U.hip[1], U[jn][0], U[jn][1], hx, hy, -a1, u, u, _k);
  const kx = kp[0], ky = kp[1];
  put(D, st, Lw, jn, kx, ky, -(a1 + a2), u, u, alpha, deep, mode);
  put(D, st, U, 'hip', hx, hy, -a1, u, u, alpha, deep, mode);
  if (fireOut) D.pt(Lw[jn][0], Lw[jn][1], Lw.fire[0], Lw.fire[1], kx, ky, -(a1 + a2), u, u, fireOut);
}
function drawHorse(D, ctx, b, rig, st, o, mode, alpha) {
  const R = rig.parts, dv = st.dv, Hb = R.hbody, bu = dv.bu;
  const { g, run, walk, rear, t } = o;
  const hx = dv.HBX, hy = dv.HBY + o.bob, brot = Math.sin(g * 2 + 0.6) * 0.025 * run;
  const bs = 1 + Math.sin(t * 2.2) * 0.008;                 // 숨쉬기
  const bp = (name, out) => D.pt(Hb.c[0], Hb.c[1], Hb[name][0], Hb[name][1], hx, hy, brot, -bu, bu * bs, out);
  // 꼬리 (몸 뒤) — 그림은 오른쪽으로 흐르므로 뒤집어 뒤(−x)로
  const T = R.tail, tk = dv.tk;
  bp('tail', _a);
  const trot = 0.1 + Math.sin(t * 2.3) * 0.07 + run * 0.5 - rear * 0.2;
  put(D, st, T, 'root', _a[0] + 3, _a[1] + 2, trot, -tk, tk, alpha, false, mode);
  // 먼 다리 (어둡게)
  o.hoofs ??= [[0, 0], [0, 0], [0, 0], [0, 0]];
  legAng(g + PI * 0.5, true, true, run, walk, rear, _ang); bp('foreF', _h);
  drawLeg(D, st, R.foreU2, R.foreL2, 'knee', _h[0], _h[1], _ang[0], _ang[1], true, mode, alpha, o.hoofs[1]);
  legAng(g + PI * 1.5, false, true, run, walk, rear, _ang); bp('hindF', _h);
  drawLeg(D, st, R.hindU, R.hindL, 'hock', _h[0], _h[1], _ang[0], _ang[1], true, mode, alpha, o.hoofs[3]);
  // 목 + 머리 (뿌리는 몸통 뒤에 숨긴다)
  const H = R.hneck, J = R.hjaw, hk = dv.hk;
  bp('neck', _n);
  const nx = _n[0], ny = _n[1], nr = o.nr + brot;
  const jr = nr + o.jaw;
  const hp = D.pt(H.base[0], H.base[1], H.hinge[0], H.hinge[1], nx, ny, nr, hk, hk, _h);
  if (mode === 'main') mouthInside(ctx, D, H, nx, ny, nr, hk, o.jaw, t);
  put(D, st, J, 'hinge', hp[0], hp[1], jr, hk, hk, alpha, false, mode);
  put(D, st, H, 'base', nx, ny, nr, hk, hk, alpha, false, mode);
  if (mode === 'main') glowOver(ctx, D, st, H, 'base', nx, ny, nr, hk, hk, 0.5, t, 1);
  // 불꽃·조명용 기준점 (F1)
  o.head ??= { eye: [0, 0], m0: [0, 0], m1: [0, 0], m2: [0, 0], crest: [0, 0], jawTip: [0, 0] };
  const hd = o.head;
  D.pt(H.base[0], H.base[1], H.eye[0], H.eye[1], nx, ny, nr, hk, hk, hd.eye);
  D.pt(H.base[0], H.base[1], H.mane0[0], H.mane0[1], nx, ny, nr, hk, hk, hd.m0);
  D.pt(H.base[0], H.base[1], H.mane1[0], H.mane1[1], nx, ny, nr, hk, hk, hd.m1);
  D.pt(H.base[0], H.base[1], H.mane2[0], H.mane2[1], nx, ny, nr, hk, hk, hd.m2);
  D.pt(H.base[0], H.base[1], H.crest[0], H.crest[1], nx, ny, nr, hk, hk, hd.crest);
  D.pt(J.hinge[0], J.hinge[1], J.tip[0], J.tip[1], hp[0], hp[1], jr, hk, hk, hd.jawTip);
  // 몸통
  put(D, st, Hb, 'c', hx, hy, brot, -bu, bu * bs, alpha, false, mode);
  if (mode === 'main') glowOver(ctx, D, st, Hb, 'c', hx, hy, brot, -bu, bu * bs, 0.55, t + 1.7, 1);
  // 가까운 다리
  legAng(g, true, false, run, walk, rear, _ang); bp('foreN', _h);
  drawLeg(D, st, R.foreU, R.foreL, 'knee', _h[0], _h[1], _ang[0], _ang[1], false, mode, alpha, o.hoofs[0]);
  legAng(g + PI, false, false, run, walk, rear, _ang); bp('hindN', _h);
  drawLeg(D, st, R.hindU, R.hindL, 'hock', _h[0], _h[1], _ang[0], _ang[1], false, mode, alpha, o.hoofs[2]);
  // 기수 등자 · 상처 · 갈비 (F1)
  o.stirrup ??= [0, 0]; bp('stirrup', o.stirrup);
  o.wA ??= [0, 0]; bp('wA', o.wA); o.wB ??= [0, 0]; bp('wB', o.wB); o.ribs ??= [0, 0]; bp('ribs', o.ribs);
  o.tailP ??= [0, 0]; D.pt(T.root[0], T.root[1], T.mid[0], T.mid[1], _a[0] + 3, _a[1] + 2, trot, -tk, tk, o.tailP);
}
/** 입 속: 어두운 목구멍 + 푸른 빛 (머리 텍셀 공간) */
function mouthInside(ctx, D, H, x, y, rot, hk, jaw, t) {
  const U = H.mouthUpper, L = H.mouthLower; if (!U || !L || jaw < 0.1) return;
  D.set(H.base[0], H.base[1], x, y, rot, hk, hk);
  const hxp = H.hinge[0], hyp = H.hinge[1], jc = Math.cos(jaw), js = Math.sin(jaw);
  ctx.beginPath(); ctx.moveTo(U[0][0], U[0][1]);
  for (const p of U) ctx.lineTo(p[0], p[1] - 2);
  for (let j = L.length - 1; j >= 0; j--) { const qx = L[j][0] - hxp, qy = L[j][1] - hyp; ctx.lineTo(hxp + qx * jc - qy * js, hyp + qx * js + qy * jc + 2); }
  ctx.closePath();
  ctx.fillStyle = 'rgba(4,8,24,0.96)'; ctx.fill();
  const m = U[2], op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * clamp(jaw * 1.8, 0, 0.9) * (0.8 + 0.2 * Math.sin(t * 17));
  ctx.drawImage(puff(BFIRE, true), m[0] - 26, m[1] - 8, 52, 40);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}

// ───────────────────────── 기사 ─────────────────────────
function drawRider(D, ctx, b, rig, st, o, mode, alpha) {
  const R = rig.parts, dv = st.dv, T = R.torso, dead = mode === 'main' ? st.dead : NONE;
  if (dead.body) return;
  const mounted = o.mounted, t = o.t, rk = mounted ? RIDER_K : 1, tu = dv.tu * rk;
  o.rk = rk;
  const breath = Math.sin(t * 2.4) * 0.6;
  const nx = mounted ? 8 : 2, ny = (mounted ? -170 : -128) + o.bob * 0.5 + breath;
  const lr = o.lean * (mounted ? 0.5 : 0.4) + (mode === 'main' && b.dying > 0 ? Math.sin(t * 31) * 0.03 : 0);
  const hpx = nx + dv.neckHip[0] * rk, hpy = ny + dv.neckHip[1] * rk;
  o.neckL ??= [0, 0]; D.pt(T.hip[0], T.hip[1], T.neck[0], T.neck[1], hpx, hpy, lr, tu, tu, o.neckL);
  // 1) 망토 (몸 뒤, 말 위)
  if (!dead.cape) {
    const C = R.cape, cu = dv.cu * rk;
    D.pt(T.hip[0], T.hip[1], T.cape[0], T.cape[1], hpx, hpy, lr, tu, tu, _c);
    const speed = clamp(Math.abs(b.vx ?? 0) / 500, 0, 1.2);
    const crot = lr + (mounted ? 0.34 : 0.14) + speed * 0.75 + (o.air ? 0.55 : 0) + Math.sin(o.capeT * 3) * 0.05;
    const cp = o.cape ??= {}; cp.x = _c[0]; cp.y = _c[1]; cp.rot = crot; cp.sx = -cu * 0.62; cp.sy = cu * (mounted ? 0.98 : 1.04);
    cloth(ctx, D, st, C, o.cape, alpha, mode, o.capeT, speed);
  }
  // 2) 먼 다리 (도보)
  if (!mounted && !dead.legs) footLeg(D, st, R, dv, o, hpx - 3, hpy, -1, mode, alpha);
  // 3) 머리 받치는 팔 (몸 뒤) + 불타는 해골
  if (!dead.armF) {
    const Af = R.armF, au = dv.au * rk, Lfa = dv.Lfa * rk;
    // 로직 skullHand() 보다 조금 뒤·위 (목 불꽃과 겹쳐 하얗게 뭉개지지 않게, 투사체 출발점과는 몇 단위 차이)
    const htx = (mounted ? -14 : -12) - 7, hty = (mounted ? -176 - o.su * 20 : -110 - o.su * 34) - 4 + o.bob * 0.5 + breath;
    D.pt(T.hip[0], T.hip[1], T.farElbow[0], T.farElbow[1], hpx, hpy, lr, tu, tu, _a);
    let dx = htx - _a[0], dy = hty - _a[1];
    const d = Math.hypot(dx, dy) || 1, s = clamp(d / Lfa, 0.8, 1.25);
    dx /= d; dy /= d;
    const ex = htx - dx * Lfa * s, ey = hty - dy * Lfa * s;
    const rot = Math.atan2(dy, dx) - dv.angF;
    put(D, st, Af, 'elbow', ex, ey, rot, au, au * s, alpha, true, mode);
    o.hand ??= [0, 0]; o.hand[0] = htx; o.hand[1] = hty;
    if (!o.skullOut && !dead.skull) {
      const Sk = R.skull, sk = dv.sk, jig = Math.sin(t * 7) * 0.05;
      const cx = htx + 1, cy = hty - 12;
      put(D, st, Sk, 'c', cx, cy, jig, -sk, sk, alpha, false, mode === 'main' ? 'plain' : mode);
      o.skull ??= { c: [0, 0], e1: [0, 0], e2: [0, 0] };
      o.skull.c[0] = cx; o.skull.c[1] = cy;
      D.pt(Sk.c[0], Sk.c[1], Sk.eyeA[0], Sk.eyeA[1], cx, cy, jig, -sk, sk, o.skull.e1);
      D.pt(Sk.c[0], Sk.c[1], Sk.eyeB[0], Sk.eyeB[1], cx, cy, jig, -sk, sk, o.skull.e2);
      o.skullOn = true;
    } else o.skullOn = false;
  } else o.skullOn = false;
  // 4) 가까운 다리
  if (!dead.legs) {
    if (mounted) {
      const lu = dv.lu * rk, Lu = R.legU, Ll = R.legL;
      const tx = o.stirrup ? o.stirrup[0] - 2 : hpx + 12, ty = o.stirrup ? o.stirrup[1] - 5 : hpy + 30;
      ik2(hpx, hpy, tx, ty, dv.l1 * rk, dv.l2 * rk, 1, _ik);
      put(D, st, Ll, 'knee', _ik.ex, _ik.ey, _ik.a2 - dv.angL, lu, lu, alpha, false, mode);
      put(D, st, Lu, 'hip', hpx, hpy, _ik.a1 - dv.angU, lu, lu, alpha, false, mode);
    } else footLeg(D, st, R, dv, o, hpx + 3, hpy, 1, mode, alpha);
  }
  // 5) 몸통
  put(D, st, T, 'hip', hpx, hpy, lr, tu, tu, alpha, false, mode);
  if (mode === 'main') glowOver(ctx, D, st, T, 'hip', hpx, hpy, lr, tu, tu, 0.6, t + 0.8, 1);
  // 6) 창 + 창 든 팔: 손은 판정 직선 위, 팔꿈치에서 팔 길이만큼 떨어진 곳 (자루를 따라 미끄러짐)
  if (!dead.lance || !dead.armN) {
    D.pt(T.hip[0], T.hip[1], T.elbow[0], T.elbow[1], hpx, hpy, lr, tu, tu, _a);
    const Ex = _a[0], Ey = _a[1];
    const bx = mounted ? 34 : 24, by = mounted ? -128 : -88;
    const ca = Math.cos(o.lanceA), sa = Math.sin(o.lanceA);
    const tipD = 170 + o.lanceX + TIP_OVER;
    const Lf = dv.Lf * rk, wx = bx - Ex, wy = by - Ey, wd = wx * ca + wy * sa, disc = wd * wd - (wx * wx + wy * wy) + Lf * Lf;
    let u = disc > 0 ? -wd + Math.sqrt(disc) : -wd;
    u = clamp(u, tipD - (dv.lanceLen - 8), tipD - (dv.headLen + 10));
    const Hx = bx + u * ca, Hy = by + u * sa, Tx = bx + tipD * ca, Ty = by + tipD * sa;
    const Ln = R.lance, lk = dv.lk;
    if (!dead.lance) {
      // 찌르기 잔광 (창이 앞으로 뻗는 동안)
      if (mode === 'main' && st.q.smear && o.lanceX > 40 && (b.state === 'thrust' || b.state === 'lunge' || b.state === 'charge')) {
        const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i <= 2; i++) D.img(Ln.v.glow, Ln.tip[0], Ln.tip[1], Tx - ca * i * 16, Ty - sa * i * 16, o.lanceA, lk, lk * LANCE_THICK, 0.3 / i);
        ctx.globalCompositeOperation = op;
      }
      put(D, st, Ln, 'tip', Tx, Ty, o.lanceA, lk, lk * LANCE_THICK, alpha, false, mode === 'main' ? 'plain' : mode);
      o.tipL ??= [0, 0]; o.tipL[0] = Tx; o.tipL[1] = Ty;
      o.runeL ??= [0, 0]; D.pt(Ln.tip[0], Ln.tip[1], Ln.rune[0], Ln.rune[1], Tx, Ty, o.lanceA, lk, lk * LANCE_THICK, o.runeL);
      o.headL ??= [0, 0]; D.pt(Ln.tip[0], Ln.tip[1], Ln.head[0], Ln.head[1], Tx, Ty, o.lanceA, lk, lk * LANCE_THICK, o.headL);
      const lt = o.lanceT ??= {}; lt.x = Tx; lt.y = Ty; lt.rot = o.lanceA;
    }
    if (!dead.armN) {
      const An = R.armN, au = dv.au * rk;
      const fa = Math.atan2(Hy - Ey, Hx - Ex), fl = Math.hypot(Hx - Ex, Hy - Ey), s = clamp(fl / Lf, 0.7, 1.35);
      put(D, st, An, 'elbow', Ex, Ey, fa - dv.angN, -au * s, au, alpha, false, mode);
      const at = o.armNT ??= {}; at.x = Ex; at.y = Ey; at.rot = fa - dv.angN; at.sx = -au * s;
    }
  }
  o.hip = o.hip ?? [0, 0]; o.hip[0] = hpx; o.hip[1] = hpy; o.lr = lr;
}
const NONE = {};
/** 도보 다리 (벡터와 같은 걸음): s = +1 가까운 / −1 먼(어둡게) */
function footLeg(D, st, R, dv, o, hx, hy, s, mode, alpha) {
  const g = o.g, walk = o.walk, air = o.air;
  const a = air ? (s > 0 ? 0.5 : -0.3) : Math.sin(g + (s > 0 ? 0 : PI)) * 0.45 * walk;
  const bnd = air ? -0.9 : -Math.max(0, Math.sin(g + (s > 0 ? 0 : PI) + 1)) * 0.6 * walk;
  const k = air ? 1.06 : clamp(-hy / dv.legLen, 0.92, 1.14);
  const lu = dv.lu * k, Lu = R.legU, Ll = R.legL;
  const kp = D.pt(Lu.hip[0], Lu.hip[1], Lu.knee[0], Lu.knee[1], hx, hy, -a, lu, lu, _k);
  const kx = kp[0], ky = kp[1];
  put(D, st, Ll, 'knee', kx, ky, -(a + bnd), lu, lu, alpha, s < 0, mode);
  put(D, st, Lu, 'hip', hx, hy, -a, lu, lu, alpha, s < 0, mode);
}
/** 망토: 가로 띠마다 흔들어 그린다 (천의 움직임). 아래로 갈수록 뒤로 끌리고 물결친다 */
function cloth(ctx, D, st, C, c, alpha, mode, T, speed) {
  const img = mode === 'ghost' ? (C.v.glow ?? C.v.flash) : pickVariant(C, mode === 'main' ? st.lvl : 0, false, null);
  if (!img) return;
  D.set(C.top[0], C.top[1], c.x, c.y, c.rot, c.sx, c.sy);
  if (mode === 'main' && D.rec && C.flashOK) D.log.push(C, C.top[0], C.top[1], c.x, c.y, c.rot, c.sx, c.sy, alpha);
  const ctx2 = D.ctx, H = img.height, Wd = img.width, y0 = Math.max(0, Math.min(H - 2, C.top[1]));
  const n = st.q.name === 'low' ? 4 : 8, ga = ctx2.globalAlpha;
  ctx2.globalAlpha = ga * alpha;
  ctx2.drawImage(img, 0, 0, Wd, y0 + 1, 0, 0, Wd, y0 + 1);
  // 텍셀 단위 흔들림: 지역 단위 진폭 / |sx|. sx 가 음수(뒤집음)라 텍셀 +x = 지역 뒤쪽 → 끌림은 +
  const hh = (H - y0) / n, amp = (2.5 + speed * 4) / Math.abs(c.sx), drag = speed * 9 / Math.abs(c.sx);
  for (let i = 0; i < n; i++) {
    const sy0 = y0 + i * hh, uu = (i + 0.5) / n;
    const dx = Math.sin(T * 5.2 + uu * 5) * amp * uu + drag * uu * uu;
    ctx2.drawImage(img, 0, sy0, Wd, hh + 1, dx, sy0, Wd, hh + 1);
  }
  ctx2.globalAlpha = ga;
}

// ───────────────────────── 불꽃 · 발광 ─────────────────────────
/** 불꽃 혀 n 개 (가산 퍼프): (x,y) 에서 ang 방향, 길이 len, 굵기 w, 혀당 퍼프 nP */
function flames(ctx, x, y, ang, len, w, n, t, seed, col, core, a, nP) {
  if (a <= 0.01 || nP <= 0) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  const img = puff(col, false), imgC = puff(core, true);
  for (let i = 0; i < n; i++) {
    const h = hash1(seed * 13.7 + i * 7.1);
    const aa = ang + (i - (n - 1) / 2) * 0.24 + Math.sin(t * 6 + i * 2.1 + seed) * 0.12;
    const L = len * (0.65 + h * 0.5) * (0.85 + 0.15 * Math.sin(t * 11 + i * 1.7 + seed));
    const c = Math.cos(aa), s = Math.sin(aa);
    for (let j = 0; j < nP; j++) {
      const u = (j + 0.5) / nP;
      const wob = Math.sin(t * 9 + i * 1.3 + u * 5 + seed) * w * 0.7 * u;
      const px = x + c * L * u - s * wob, py = y + s * L * u + c * wob;
      const r = w * (1.1 - u * 0.75);
      ctx.globalAlpha = ga * a * (1 - u * 0.5);
      ctx.drawImage(j === 0 ? imgC : img, px - r, py - r, r * 2, r * 2);
    }
  }
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
/** 말: 갈기·꼬리·발굽 불꽃, 눈, 갈비 속 혼불 (F1 지역, D 기준 변환 상태에서) */
function maneFire(ctx, D, rig, st, o, boost, dT) {
  const hd = o.head; if (!hd) return;
  const q = st.q, t = o.t, ph = o.phase ?? 0;
  const up = -PI / 2 - (o.R || 0);
  const k = boost * (1 + ph * 0.35) * (dT > 0 ? clamp(1 - dT, 0, 1) : 1);
  if (k <= 0.01) return;
  const back = up - 0.85 - o.run * 0.45;
  const nf = q.flames;
  flames(ctx, hd.crest[0], hd.crest[1], back + 0.3, 16 * k, 5, 2, t, 1.1, BFIRE, BCORE, 0.55, Math.max(1, nf - 2));
  flames(ctx, hd.m0[0], hd.m0[1], back, 18 * k, 5.5, 2, t, 2.3, BFIRE, BCORE, 0.55, Math.max(1, nf - 2));
  flames(ctx, hd.m1[0], hd.m1[1], back - 0.2, 16 * k, 5, 2, t, 3.7, BFIRE, BCORE, 0.5, Math.max(1, nf - 2));
  if (ph >= 1 || boost > 1.2) flames(ctx, hd.m2[0], hd.m2[1], back - 0.35, 18 * k, 5, 2, t, 4.9, BFIRE, BCORE, 0.5, Math.max(1, nf - 2));
  // 발굽 불꽃 (1페이즈부터 크게)
  const hf = (0.55 + ph * 0.3 + (boost > 1.2 ? 0.4 : 0)) * k;
  for (let i = 0; i < 4; i++) {
    const h = o.hoofs?.[i]; if (!h) continue;
    flames(ctx, h[0], h[1] + 2, up, (8 + ph * 6) * hf * 1.3, 4, i < 2 || ph >= 1 ? 2 : 1, t, 5.3 + i, BFIRE, BCORE, 0.5 * (i % 2 ? 0.7 : 1), Math.max(1, nf - 3));
    if (q.halos) halo(ctx, h[0], h[1] + 2, 14 + ph * 6, BFIRE, 0.3 * hf * (i % 2 ? 0.6 : 1));
  }
  if (ph >= 1 && o.tailP) flames(ctx, o.tailP[0], o.tailP[1], up - 0.5, 14 * k, 4.5, 2, t, 7.7, BFIRE, BCORE, 0.45, Math.max(1, nf - 3));
  // 눈 · 갈비 혼불
  const fl = 0.8 + Math.sin(t * 13) * 0.2;
  halo(ctx, hd.eye[0], hd.eye[1], (7 + ph * 2) * fl, BFIRE, 0.9, true);
  if (q.halos && o.ribs) halo(ctx, o.ribs[0], o.ribs[1], 26 + Math.sin(t * 5) * 4, BFIRE, (0.28 + ph * 0.1) * k);
  if (o.fx) { o.eyeW = W(st, hd.eye[0], hd.eye[1], o.eyeW ?? [0, 0]); if (o.hoofs) o.hoofW = W(st, o.hoofs[0][0], o.hoofs[0][1], o.hoofW ?? [0, 0]); }
}
/** 기사: 목 그루터기 혼불, 해골 불꽃, 창 룬 */
function riderFire(ctx, D, b, rig, st, o, dT) {
  const q = st.q, t = o.t, dead = st.dead;
  if (dead.body) return;
  const up = -PI / 2 - (o.R || 0);
  const fury = (b.fury ?? 0) + (b.state === 'transform' ? 1 : 0) + (b.inferno ? 0.4 : 0);
  // 죽는 동안 치솟았다가 꺼진다
  const dk = dT > 0 ? (dT < 0.9 ? 1 + dT * 1.2 : clamp(2.1 - (dT - 0.9) * 2, 0, 2)) : 1;
  if (o.neckL && dk > 0.02) {
    const [nx, ny] = o.neckL;
    const back = up - (o.run * 0.5 + clamp(Math.abs(b.vx ?? 0) / 900, 0, 0.5)) * 0.8;
    if (q.halos) halo(ctx, nx, ny - 8, (24 + fury * 10) * dk, BFIRE, 0.4);
    flames(ctx, nx, ny, back, (26 + fury * 12) * dk, 6.5, 4, t, 0.7, BFIRE, BCORE, 0.55, q.flames);
    flames(ctx, nx, ny, back, (14 + fury * 6) * dk, 4, 2, t * 1.3, 9.1, BCORE, '#ffffff', 0.3, Math.max(1, q.flames - 2));
  }
  if (o.skullOn && o.skull) {
    const s = o.skull, big = b.state === 'skull' && (b.stateT ?? 0) < 0.7 ? 1.6 : 1;
    const fl = 0.8 + Math.sin(t * 19) * 0.2;
    if (q.halos) halo(ctx, s.c[0], s.c[1] - 4, 20 * big, OFIRE, 0.3);
    flames(ctx, s.c[0], s.c[1] - 10, up, 16 * big, 5, 3, t, 2.9, OFIRE, OCORE, 0.55, Math.max(1, q.flames - 1));
    halo(ctx, s.e1[0], s.e1[1], 5.5 * fl, OFIRE, 0.9, true);
    halo(ctx, s.e2[0], s.e2[1], 4 * fl, OFIRE, 0.7, true);
  }
  // 창: 1페이즈부터 룬이 빛나고, 지옥불 행렬 때는 창날을 타고 불이 오른다
  if (o.tipL && !dead.lance) {
    const hell = b.state === 'hellfire' ? 1 : 0, ph = b.phase ?? 0;
    if (ph >= 1 || hell) {
      if (q.halos) halo(ctx, o.runeL[0], o.runeL[1], 16 + hell * 14, BFIRE, 0.35 + hell * 0.25);
      if (hell) flames(ctx, o.headL[0], o.headL[1], up, 34, 6, 3, t, 6.1, BFIRE, BCORE, 0.6, q.flames);
    }
  }
  if (o.fx) {
    o.neckW = W(st, o.neckL[0], o.neckL[1], o.neckW ?? [0, 0]);
    if (o.tipL) o.tipW = W(st, o.tipL[0], o.tipL[1], o.tipW ?? [0, 0]);
    if (o.skullOn) o.skullW = W(st, o.skull.c[0], o.skull.c[1], o.skullW ?? [0, 0]);
    if (o.wA) { o.wAW = W(st, o.wA[0], o.wA[1], o.wAW ?? [0, 0]); o.wBW = W(st, o.wB[0], o.wB[1], o.wBW ?? [0, 0]); o.jawW = W(st, o.head.jawTip[0], o.head.jawTip[1], o.jawW ?? [0, 0]); }
    o.chestW = W(st, o.hip[0], o.hip[1] - 30, o.chestW ?? [0, 0]);
  }
}
/** 손상 단계 균열 발광 (반 해상도, 가산, 맥동) — 실제 그려진 변형에 맞는 것만 */
function glowOver(ctx, D, st, p, pivot, x, y, rot, sx, sy, a, t, boost = 1) {
  const lvl = st.lvl;
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : (p.v.dmg1 || p.v.deep_dmg1) ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? p.gl.dmg2 : p.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? p[pivot] : pivot;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + p.w * 0.01)) * boost * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - p.pad) * 0.5, (pv[1] - p.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 사라지는 유령마 ─────────────────────────
/** k: 1 → 0 (사라짐). 몸통은 가로 띠로 흩어져 오르고, 나머지는 흐려지며 푸르게 타오른다 */
function fadeHorse(ctx, st, b, rig, x, bot, f, k, rear, t, dt) {
  const D = st.fadeD ??= new Drawer();
  const o = st.fo;
  o.mounted = true; o.S = 1.3; o.g = st.dfade?.g ?? 0; o.run = 0; o.walk = 0; o.rear = rear * k; o.bob = 0; o.t = t;
  o.nr = -0.3 * k; o.jaw = 0.4 * k; o.phase = 2; o.fx = false;
  const R0 = -o.rear * 0.55; o.R = R0;
  ctx.save();
  ctx.translate(x, bot); ctx.scale(f * 1.3, 1.3);
  ctx.translate(-46, 0); ctx.rotate(R0); ctx.translate(46, 0);
  D.begin(ctx);
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  st.dissolve = k;
  drawHorse(D, ctx, b, rig, st, o, 'plain', k * k);
  ctx.globalCompositeOperation = 'lighter';
  drawHorse(D, ctx, b, rig, st, o, 'ghost', clamp((1 - k) * k * 2.4, 0, 0.8));
  ctx.globalCompositeOperation = op;
  st.dissolve = 0;
  D.end();
  maneFire(ctx, D, rig, st, o, 1.6 * k, 0);
  ctx.restore();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
  // 흩어지는 불티 (월드)
  const P = st.P, n = Math.round(dt * 90 * (0.3 + k) * st.q.ambient);
  for (let i = 0; i < n; i++) {
    const lx = rr.range(-80, 80), ly = rr.range(-150, -20);
    P.emit(i % 3 ? 'ember' : 'ashLight', x + f * 1.3 * lx, bot + 1.3 * ly, rr.range(-30, 30), rr.range(-160, -40), { color: i % 3 ? BFIRE : 'rgba(170,200,255,0.6)', layer: 1 });
  }
}

// ───────────────────────── 입자 ─────────────────────────
function levelBurst(P, st, o, level) {
  const c = o.chestW; if (!c) return;
  P.burst('spark', c[0], c[1], 14 + level * 6, { speed: 420, angle: -PI / 2, spread: 1.6, color: BCORE });
  P.burst('chip', c[0], c[1], 8 + level * 3, { speed: 280, angle: -PI / 2, spread: 1.3, color: STEEL });
  P.burst('ember', c[0], c[1] - 20, 18, { speed: 180, color: BFIRE });
  if (o.mounted && o.wAW) P.burst('ichor', o.wAW[0], o.wAW[1], 10, { speed: 200, angle: -PI / 2, spread: 1.4, color: ECTO, hi: ECTO_HI });
}
function ambient(P, b, st, o, dt, q, hit) {
  if (b.dying > 0) return;
  const amb = q.ambient, lvl = st.lvl, ph = b.phase ?? 0;
  // 목 그루터기 불티
  if (o.neckW && rr.next() < dt * (8 + ph * 5) * amb) P.emit('ember', o.neckW[0] + rr.range(-6, 6), o.neckW[1] - 10, rr.range(-30, 30), rr.range(-140, -60), { color: rr.chance(0.3) ? BCORE : BFIRE, layer: 1 });
  // 해골: 녹아 떨어지는 불방울
  if (o.skullOn && o.skullW && rr.next() < dt * (2 + lvl) * amb) P.emit('blood', o.skullW[0] + rr.range(-5, 5), o.skullW[1] + 10, 0, 0, { color: '#6a1a04', hi: OCORE, hang: rr.range(0.05, 0.25), layer: 1 });
  if (o.skullOn && o.skullW && rr.next() < dt * 6 * amb) P.emit('ember', o.skullW[0] + rr.range(-6, 6), o.skullW[1] - 12, rr.range(-20, 20), rr.range(-120, -50), { color: OFIRE, layer: 1 });
  if (o.mounted && !st.dead.horse) {
    // 말 상처 · 턱에서 엑토플라즘
    const r = dt * (1.2 + lvl * 1.4) * amb;
    if (o.wAW && rr.next() < r) P.emit('ichor', o.wAW[0], o.wAW[1], 0, 0, { color: ECTO, hi: ECTO_HI, hang: rr.range(0.2, 0.7), layer: 1 });
    if (o.wBW && rr.next() < r) P.emit('ichor', o.wBW[0], o.wBW[1], 0, 0, { color: ECTO, hi: ECTO_HI, hang: rr.range(0.2, 0.7), layer: 1 });
    if (o.jawW && o.jaw > 0.2 && rr.next() < dt * 3 * amb) P.emit('ichor', o.jawW[0], o.jawW[1], 0, 0, { color: ECTO, hi: ECTO_HI, hang: rr.range(0.1, 0.4), layer: 1 });
    // 달릴 때 발굽 불티
    if (o.hoofW && (o.run > 0.5 || ph >= 1) && rr.next() < dt * (6 + o.run * 20) * amb) P.emit('ember', o.hoofW[0] + rr.range(-10, 10), o.hoofW[1], rr.range(-60, 60), rr.range(-100, -20), { color: BFIRE, layer: 1 });
  }
  // 손상 2단계: 갑옷 틈에서 불티·연기
  if (lvl >= 2 && o.chestW && rr.next() < dt * 3 * amb) P.emit(rr.chance(0.5) ? 'spark' : 'smoke', o.chestW[0] + rr.range(-18, 18), o.chestW[1] + rr.range(-20, 20), rr.range(-40, 40), rr.range(-60, 0), { color: rr.chance(0.5) ? BCORE : '#141a2c', layer: 1 });
  // 상태별
  const s = b.state;
  if (s === 'hellfire' && o.tipW && rr.next() < dt * 20 * amb) P.emit('ember', o.tipW[0] + rr.range(-10, 10), o.tipW[1] + rr.range(0, 40), rr.range(-30, 30), rr.range(-160, -60), { color: BFIRE, layer: 1 });
  if (s === 'transform' && o.chestW && rr.next() < dt * 30 * amb) P.emit('ember', o.chestW[0] + rr.range(-90, 90), o.chestW[1] + rr.range(-40, 120), rr.range(-50, 50), rr.range(-180, -60), { color: BFIRE, layer: 1 });
  if (s === 'phantom' && o.chestW && rr.next() < dt * 12 * amb) P.emit('smoke', o.chestW[0] + rr.range(-40, 40), o.chestW[1] + rr.range(0, 60), 0, -20, { color: '#16244a', layer: 0 });
  // 피격: 쇳조각·불꽃·엑토플라즘
  if (hit && o.chestW) {
    P.burst('spark', o.chestW[0], o.chestW[1], 10, { speed: 380, color: BCORE });
    P.burst('chip', o.chestW[0], o.chestW[1], 4, { speed: 220, angle: -PI / 2, spread: 1.4, color: STEEL });
    if (o.mounted && o.wAW) P.burst('ichor', o.wAW[0], o.wAW[1], 5, { speed: 160, angle: -PI / 2, spread: 1.2, color: ECTO, hi: ECTO_HI });
  }
}

// ───────────────────────── 사망 붕괴 ─────────────────────────
// 0.3s 목에서 혼불 폭발 · 0.42s 해골이 튀어 올라 터짐 · 0.55s 창이 떨어짐 · 0.75s 팔·망토가 떨어짐
// · 1.0s 갑옷이 무너져 흩어지고(몸통·다리·파편) 목 불꽃이 꺼진다. 기승 중이었다면 0.3s 부터 말이 흩어진다.
function deathFx(ctx, D, b, rig, st, o, dt, dT) {
  const R = rig.parts, P = st.P, dead = st.dead, dv = st.dv;
  const fade = 2.35 - dT, f = Math.sign(st.fsx) || 1, S = st.S;
  const rk = o.rk ?? 1, au = dv.au * rk, tu = dv.tu * rk, lu = dv.lu * rk, l1 = dv.l1 * rk;
  // 지역(F1) 배치 → 월드 파편
  const shard = (p, img, pivot, lx, ly, lrot, sx, sy, vx, vy, vr, r, bounce = 0.3) => {
    const w = W(st, lx, ly, [0, 0]);
    const pv = typeof pivot === 'string' ? p[pivot] : pivot;
    st.shards.spawn(img, pv[0], pv[1], w[0], w[1], f * (lrot + st.R), sx * S * f, sy * S, vx, vy, vr, { r, bounce, fade });
  };
  const V = (p, deep = false) => pickVariant(p, 2, deep, null);
  if (!st.dBurst && dT > 0.3) {
    st.dBurst = true;
    const c = o.neckW ?? W(st, 0, -150, [0, 0]);
    b.world?.fx?.ring?.(c[0], c[1], { color: BFIRE, r0: 10, r1: 220, life: 0.5, width: 7 });
    P.burst('ember', c[0], c[1], 40, { speed: 360, angle: -PI / 2, spread: 1.4, color: BFIRE });
    P.burst('spark', c[0], c[1], 16, { speed: 420, color: BCORE });
  }
  if (!dead.skull && dT > 0.42) {
    dead.skull = true;
    if (o.skullOn && o.skull) {
      const Sk = R.skull;
      shard(Sk, Sk.v.base, 'c', o.skull.c[0], o.skull.c[1], 0, -dv.sk, dv.sk, f * rr.range(-60, 60), -520, f * rr.range(6, 10), 12, 0.4);
      const w = o.skullW ?? W(st, o.skull.c[0], o.skull.c[1], [0, 0]);
      P.burst('ember', w[0], w[1], 24, { speed: 300, color: OFIRE });
      P.burst('blood', w[0], w[1], 10, { speed: 240, angle: -PI / 2, spread: 1.4, color: '#6a1a04', hi: OCORE });
    }
  }
  if (!dead.lance && dT > 0.55 && o.lanceT) {
    dead.lance = true;
    const Ln = R.lance, L = o.lanceT;
    shard(Ln, Ln.v.base, 'tip', L.x, L.y, L.rot, dv.lk, dv.lk * LANCE_THICK, f * rr.range(-80, 80), -140, f * rr.range(-2.5, 2.5), 8, 0.2);
  }
  if (!dead.armN && dT > 0.75) {
    dead.armN = dead.armF = dead.cape = true;
    if (o.armNT) { const a = o.armNT; shard(R.armN, V(R.armN), 'elbow', a.x, a.y, a.rot, a.sx, au, f * rr.range(60, 180), rr.range(-280, -140), f * rr.range(-6, 6), 10); }
    if (o.hand) shard(R.armF, V(R.armF, true), 'palm', o.hand[0], o.hand[1], -0.3, au, au, -f * rr.range(60, 160), rr.range(-300, -160), f * rr.range(-6, 6), 10);
    if (o.cape) { const c = o.cape; shard(R.cape, V(R.cape), 'top', c.x, c.y, c.rot, c.sx, c.sy, -f * rr.range(40, 100), -160, -f * rr.range(0.5, 1.5), 24, 0.1); }
    const c = o.chestW; if (c) P.burst('spark', c[0], c[1], 12, { speed: 300, color: BCORE });
  }
  if (!dead.body && dT > 1.0) {
    dead.body = dead.legs = true;
    const T = R.torso;
    if (o.hip) shard(T, V(T), 'hip', o.hip[0], o.hip[1], o.lr ?? 0, tu, tu, -f * rr.range(40, 120), -220, -f * rr.range(2, 4), 22, 0.25);
    const hx = o.hip?.[0] ?? 0, hy = o.hip?.[1] ?? -100;
    shard(R.legU, V(R.legU), 'hip', hx + 3, hy, 0.2, lu, lu, f * rr.range(60, 160), rr.range(-260, -120), f * rr.range(-5, 5), 12);
    shard(R.legL, V(R.legL), 'knee', hx + 6, hy + l1, -0.1, lu, lu, f * rr.range(-60, 120), rr.range(-200, -80), f * rr.range(-5, 5), 12);
    if (!o.mounted) shard(R.legL, V(R.legL, true), 'knee', hx - 4, hy + l1, 0.1, lu, lu, -f * rr.range(40, 120), rr.range(-200, -80), f * rr.range(-5, 5), 12);
    const c = o.chestW ?? W(st, hx, hy - 30, [0, 0]);
    for (let i = 0; i < 6; i++) {
      const p = R[st.debris[(i * 2 + 1) % st.debris.length]]; if (!p) continue;
      const a = -PI / 2 + (rr.next() - 0.5) * 2.4, sp = rr.range(220, 480);
      st.shards.spawn(p.v.base, p.c[0], p.c[1], c[0], c[1], rr.next() * TAU, p.k * rr.sign(), p.k, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-9, 9), { r: (p.r ?? 10) * 0.8, fade });
    }
    b.world?.fx?.ring?.(c[0], c[1], { color: BFIRE, r0: 20, r1: 260, life: 0.55, width: 9 });
    P.burst('ember', c[0], c[1], 50, { speed: 420, color: BFIRE });
    P.burst('smoke', c[0], c[1], 14, { speed: 120, color: '#18223a' });
    P.burst('chip', c[0], c[1], 14, { speed: 300, angle: -PI / 2, spread: 1.5, color: STEEL });
  }
  // 무너지는 동안: 목에서 혼불이 뿜어지고, 무너진 뒤엔 푸른 연기가 오른다
  const nw = o.neckW;
  if (nw && dT < 1.0 && rr.next() < dt * 40) P.emit('ember', nw[0] + rr.range(-8, 8), nw[1] - 6, rr.range(-80, 80), rr.range(-320, -140), { color: rr.chance(0.3) ? BCORE : BFIRE, layer: 1 });
  if (dead.body && dT < 2.1 && rr.next() < dt * 14) { const c = o.chestW ?? [st.X, st.B - 40]; P.emit('smoke', c[0] + rr.range(-60, 60), st.B - rr.range(0, 30), rr.range(-20, 20), rr.range(-60, -20), { color: '#1a2748', layer: 1 }); }
}
