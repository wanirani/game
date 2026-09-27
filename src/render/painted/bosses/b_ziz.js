// 지즈 (b_ziz) — 채색 컷아웃 퍼핏 렌더러 (ART-BOSS-7)
// 부품 (Kling, tools/painted/prompts/art-boss-7.mjs): 해골 부리 머리(경첩 아래턱 분리 · 폭풍 깃털 목갈기) · 뜯긴 가슴의 깃털 몸통 ·
//   반쪽 갈비뼈(좌우 대칭, 코어가 드러나면 문짝처럼 벌어진다) · 뼈가 드러난 날개(위팔·아래팔·첫째날개깃 3조각, 좌우 대칭) ·
//   깃털 넓적다리 + 피 묻은 뼈 정강이/갈고리 발 · 날개 앞가장자리의 깃털 눈 12 · 꼬리 깃털 2종 · 파편 12 (뼈·부리 해골·발톱·살점·깃털)
// 움직임은 전부 기존 로직(src/game/bosses/c_ziz.js)의 값을 읽기만 한다:
//   boss { zx, zy, tilt, facing, flapMul, ps{raise,spread,fold,crash,mouth,neck,coreOpen,talon,eyes}, wing[±1]{S,E,Wr,Tp,a1,a2,a3},
//          eyes[{side,lx,ly,ang,alive,open,fireT,hitT,x,y}], head{lx,ly,a,x,y}, dmg, stunned, dying, dieT, state, t, flashT, A.floor }
// 상태별 표현: 날갯짓(3조각 날개가 로직 관절각을 그대로 따른다) · gust(날개를 들어 코어 노출 → 갈비 벌어짐·코어 섬광) ·
//   bolts/eyestorm(눈이 뜨이고 쏠 때 번쩍) · talon(다리 앞으로·발 벌림) · feathers(날개 번개) · cyclone(폭풍구름 회오리·깃털 소용돌이) ·
//   crash(추락·다리 벌어짐·기절 스파크) · 페이즈 전환(날개 활짝·포효) · 손상 단계 0~2(구운 찢긴 깃털막/균열 + 번개빛 균열 발광, 꼬리깃 빠짐) ·
//   피격 섬광(몸통·머리·안쪽 날개만 약하게 — 화면을 덮는 날개 전체를 하얗게 칠하지 않는다) · 눈 피격/파괴(눈만 번쩍·터진 눈구멍 피)
// 절차적 층: 몸을 감싼 폭풍구름(캐시 스프라이트) + 구름 속 번개 · 날개깃을 타고 흐르는 번개 · 가슴 구전 코어(맥동 발광 + 갈비 사이 번개) ·
//   눈꺼풀(감김→뜨임, 감긴 눈은 꿰맨 자국) · 해골 눈구멍 번개 눈동자 · 입 속 번개 · 떨어지는 깃털/핏방울/스파크
// 사망: 0.4s 눈이 모두 터짐 · 0.9s 첫째날개깃이 찢겨 떨어짐 · 1.5s 날개 뼈가 뜯김 · 2.1s 머리·턱이 떨어짐 · 2.5s 몸통·갈비·다리가 무너짐
//   (폭풍빛 심장이 떨어지는 로직 연출은 벡터 paintFront 대신 여기서 그린다)
// 좌표: 로직과 같은 몸 지역 좌표 (원점 = 몸 중심 zx,zy, tilt 회전, y 위가 음수). 머리만 facing 으로 뒤집힌다(종이 뒤집기).
import { Drawer, Particles, DamageState, Shards, halo, puff, rr, hash1, loadRig, pickVariant, quality, QUALITY, ledgesOver, makeCanvas } from '../kit.js';

const DIR = 'painted/bosses/b_ziz';
const PI = Math.PI, TAU = PI * 2;
const CORE = '#bfe0ff', BOLT = '#e8f6ff', EYEC = '#fff2a0', BLUE = '#9fd0ff', BLOOD = '#3a0610', BLOOD_HI = '#ff6a6a';
const FEATHER_C = 'rgba(28,34,52,0.92)';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));
/** 실제 적용 품질 등급 (설정이 'auto' 면 조절기가 고른 game.quality/tier) */
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);

/** 굽기 옵션 (kit.loadRig def). 피격 섬광은 판정 부위 중 몸통 쪽만 (눈은 자기 섬광) */
const DEF = {
  glow: BLUE,
  outline: { width: 1.8, color: 'rgba(4,6,12,0.9)' },
  parts: {
    torso: { flash: true, cracks: 4, char: 1, holes: 0, crackMinLum: 70 },
    ribs: { flash: true, cracks: 2, char: 1, holes: 0, crackMinLum: 110 },
    head: { flash: true, cracks: 3, char: 1, holes: 0, crackMinLum: 120 },
    jaw: { flash: true, cracks: 2, char: 1, holes: 0, crackMinLum: 120 },
    wA: { flash: true, membrane: true, holes: 3, cracks: 3, char: 1, crackMinLum: 60 },
    wB: { membrane: true, holes: 4, cracks: 3, char: 1, crackMinLum: 55 },
    wC: { membrane: true, holes: 6, cracks: 2, char: 1, crackMinLum: 45 },
    thigh: { cracks: 1, char: 1, holes: 0, crackMinLum: 60 },
    shin: { cracks: 2, char: 1, holes: 0, crackMinLum: 100 },
    eye: { noDmg: true, flash: true },
    fth1: { noDmg: true }, fth2: { noDmg: true },
  },
  prefix: { deb: { noDmg: true, outline: 1.3 } },
};

// 배치 상수 (몸 지역 logic px)
const CORE_Y = 10;           // 가슴 코어 (로직 pCore = (0,8))
const HEAD_S = 1.0, EYE_S = 0.86, LEG_S = 1.0;
const RIB_X = 5, RIB_Y = -46;
const TAIL_ANG = -1.426;     // 꼬리깃 그림의 깃대 → 끝 방향 (위)

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_ziz', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(48), q,
      dmg: new DamageState(boss.def?.phases ?? [0.6, 0.3]), lt: null, pf: 0, lvl: 0, fs: null, jolt: 0,
      dead: {}, eyeGone: false, W: [0, 0], cloud: cloudSprite(), debris: rig.man.groups?.debris ?? [],
      pts: { head: [0, 0], eye: [0, 0], mouth: [0, 0], hinge: [0, 0], jawTip: [0, 0], wrist: { '-1': [0, 0], '1': [0, 0] } },
      lastBurst: -1,
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.zx ?? b.cx, Y = b.zy ?? b.cy, floor = b.A?.floor ?? Y + 400;
    let x0 = X - 760, x1 = X + 760, y0 = Y - 580, y1 = Math.max(Y + 420, floor + 12);
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 40 < x0) x0 = px - 40; if (px + 40 > x1) x1 = px + 40; if (py - 40 < y0) y0 = py - 40; if (py + 40 > y1) y1 = py + 40; }
    if (st?.shards?.list.length) for (const s of st.shards.list) { if (s.x - 200 < x0) x0 = s.x - 200; if (s.x + 200 > x1) x1 = s.x + 200; if (s.y - 200 < y0) y0 = s.y - 200; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    // 로직 lightsB 가 코어·머리·눈 빛을 이미 낸다. 여기서는 번개 깃의 순간 섬광만 더한다
    if (st.flashL > 0.05 && st.flashW) L.add(st.flashW[0], st.flashW[1], 260, BLUE, st.flashL * 0.6);
  },
  /** 월드 파편(ABoss.spawnDebris)용 채색 조각 */
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.9;
    return { size: Math.max(10, (p.w + p.h) * 0.25 * p.k), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 캐시 스프라이트 ─────────────────────────
let _cloud = null;
/** 폭풍구름 한 덩이 (256×160, 한 번만 만든다 — 싸움 중 새 캔버스 0) */
function cloudSprite() {
  if (_cloud) return _cloud;
  const c = makeCanvas(256, 160), g = c.getContext('2d');
  const blobs = [[70, 92, 58], [128, 70, 70], [188, 94, 56], [104, 108, 50], [160, 112, 48], [128, 96, 64]];
  for (const [x, y, r] of blobs) {
    const gr = g.createRadialGradient(x, y - r * 0.25, 0, x, y, r);
    gr.addColorStop(0, 'rgba(58,68,94,0.9)'); gr.addColorStop(0.55, 'rgba(30,36,54,0.75)'); gr.addColorStop(1, 'rgba(14,18,30,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 윗면 은빛 가장자리
  g.globalCompositeOperation = 'source-atop';
  const hl = g.createLinearGradient(0, 30, 0, 120); hl.addColorStop(0, 'rgba(150,170,210,0.35)'); hl.addColorStop(0.5, 'rgba(150,170,210,0)');
  g.fillStyle = hl; g.fillRect(0, 0, 256, 160);
  _cloud = c;
  return c;
}
const CLOUDS = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ a: (i / 7) * TAU, r: 170 + hash1(i * 3.3) * 170, s: 240 + hash1(i * 1.7) * 150, y: -30 + hash1(i * 5.1) * 120, sp: 0.12 + hash1(i * 2.2) * 0.1 }));

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
  ctx.globalAlpha = ga * a * 0.55; ctx.strokeStyle = BLUE; ctx.lineWidth = w * 3; ctx.stroke();
  ctx.globalAlpha = ga * a; ctx.strokeStyle = BOLT; ctx.lineWidth = w; ctx.stroke();
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P, R = rig.parts;
  st.q = qOf(world.game);
  const q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, floor = A.floor, t = b.t, s = b.ps;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0, dT = dying ? (b.dieT ?? 0) : 0;
  // 손상 단계: 로직 dmg(페이즈) 와 체력 비율 중 큰 쪽
  const up = st.dmg.update(dying ? 0 : b.hp / b.stats.maxHp, dt);
  st.lvl = dying ? 2 : clamp(Math.max(b.dmg | 0, st.dmg.level), 0, 2);
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 6);
  if (st.fs == null) st.fs = b.facing || 1;
  st.fs = approach(st.fs, b.facing || 1, dt * 7);
  st.flashL = Math.max(0, (st.flashL ?? 0) - dt * 4);
  if (b.state === 'intro' || b.hp >= b.stats.maxHp) { if (!dying) { st.dead = {}; st.eyeGone = false; st.shards.clear(); } }
  const X = b.zx + (b.flashT > 0 ? (rr.next() - 0.5) * 4 : 0), Y = b.zy, tilt = b.tilt ?? 0;
  const tc = Math.cos(tilt), ts = Math.sin(tilt);
  const W = (lx, ly, out = st.W) => { out[0] = X + lx * tc - ly * ts; out[1] = Y + lx * ts + ly * tc; return out; };
  st._W = W;
  const dk = dying ? clamp(1 - dT / 3, 0, 1) : 1;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  const dead = st.dead;
  // ── 뒤: 폭풍구름 + 구름 속 번개 (월드) ──
  drawClouds(ctx, b, st, X, Y, t, dk);
  P.draw(ctx, 0);
  if (up > 0 && !dying) levelBurst(P, W, up);
  // ── 몸 (지역 좌표) ──
  D.begin(ctx);
  const enter = () => {
    D.save();
    ctx.beginPath(); ctx.rect(X - 3000, floor - 4000, 6000, 4002); ctx.clip();   // 바닥 아래로 늘어진 깃·발톱은 자른다
    ctx.translate(X, Y); if (tilt) ctx.rotate(tilt);
    D.begin(ctx);
  };
  enter();
  const rec = b.flashT > 0 && !dying;
  D.rec = false; D.log.length = 0;
  // 뒤층: 꼬리깃 → 날개 (C → B → A, 좌우)
  if (!dead.body) drawTail(D, st, R, b, s, t);
  drawWings(D, ctx, st, R, b, t, rec);
  // 발판 덧그리기 (날개가 발판을 덮어도 딛을 곳이 보이게) → 몸통·머리·눈(판정 부위)은 그 위에
  if (q.ledges !== false && !dead.wings) {
    D.end(); D.restore();
    const cam = world.camera, cx0 = cam?.x ?? -1e9, cy0 = cam?.y ?? -1e9, cx1 = cx0 + (cam?.vw ?? 2e9), cy1 = cy0 + (cam?.vh ?? 2e9);
    ledgesOver(ctx, world, Math.max(X - 700, cx0), Math.max(Y - 500, cy0), Math.min(X + 700, cx1), Math.min(Y + 340, cy1, floor - 4));
    D.begin(ctx);
    enter();
  }
  if (!dead.body) {
    D.rec = rec;
    drawTorso(D, ctx, st, R, b, s, t);
    drawLegs(D, st, R, b, s, t);
    drawCore(D, ctx, st, R, b, s, t, q);
    D.rec = false;
  }
  drawEyes(D, ctx, st, R, b, t, q);
  if (!dead.head) { D.rec = rec; drawHead(D, ctx, st, R, b, s, t, q); }
  if (rec) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.55);
  else { D.rec = false; D.log.length = 0; }
  D.end();
  D.restore();
  // ── 월드: 파편 · 입자 · 사망 ──
  D.begin(ctx);
  st.shards.draw(D);
  D.end();
  ambient(P, b, st, W, dt, q, hit, t);
  if (dying) deathFx(ctx, D, b, rig, st, W, dt, dT);
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

/** 부품 하나 (손상 단계 변형) */
function part(D, st, p, pivot, x, y, rot, sx, sy, a = 1) {
  D.part(p, pickVariant(p, st.lvl, false, null), pivot, x, y, rot, sx, sy, a);
}
/** 손상 단계 균열 발광 (반 해상도, 가산, 맥동) — 실제 그려진 변형에 맞는 것만 */
function glowOver(ctx, D, st, p, pivot, x, y, rot, sx, sy, a, t) {
  const lvl = st.lvl;
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : p.v.dmg1 ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? p.gl.dmg2 : p.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? p[pivot] : pivot;
  const pa = a * (0.45 + 0.55 * Math.max(0, Math.sin(t * 5.3 + p.w * 0.013)) ** 3) * (lvl > 1 ? 1.1 : 0.75);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - p.pad) * 0.5, (pv[1] - p.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 폭풍구름 ─────────────────────────
function drawClouds(ctx, b, st, X, Y, t, dk) {
  const spr = st.cloud; if (!spr || dk <= 0.01) return;
  const cyc = (b.flapMul ?? 1) > 1 ? 1 : 0;
  st.cyc = approach(st.cyc ?? 0, cyc, 1 / 30);
  const ck = st.cyc;
  const ga = ctx.globalAlpha;
  for (const c of CLOUDS) {
    const a = c.a + t * c.sp * (1 + ck * 6);
    const r = c.r * (1 + ck * 0.3);
    const x = X + Math.cos(a) * r, y = Y + c.y + Math.sin(a) * r * 0.35, w = c.s, h = c.s * 0.62;
    ctx.globalAlpha = ga * (0.5 + ck * 0.2) * dk;
    ctx.drawImage(spr, x - w / 2, y - h * 0.55, w, h);
  }
  ctx.globalAlpha = ga;
  // 구름 속 번개 (시간 조각마다 한 번)
  const bk = Math.floor(t * 5), h = hash1(bk * 1.37);
  if (h < (0.33 + ck * 0.3) * dk) {
    const c = CLOUDS[Math.floor(hash1(bk * 2.9) * CLOUDS.length)], a = c.a + t * c.sp * (1 + ck * 6);
    const x = X + Math.cos(a) * c.r, y = Y + c.y + Math.sin(a) * c.r * 0.35;
    if (st.q.halos) halo(ctx, x, y, 130, BLUE, 0.35);
    ctx.beginPath(); boltPath(ctx, x - 50, y - 30, x + 60, y + 50, 14, 8, bk); strokeBolt(ctx, 0.8, 1.6);
    st.flashL = Math.max(st.flashL ?? 0, 0.6); st.flashW = st.flashW ?? [0, 0]; st.flashW[0] = x; st.flashW[1] = y;
  }
}

// ───────────────────────── 꼬리 ─────────────────────────
function drawTail(D, st, R, b, s, t) {
  const F = [R.fth1, R.fth2];
  for (const i of [0, 4, 1, 3, 2]) {
    if (st.lvl >= 2 && i === 3) continue;          // 손상 2단계: 꼬리깃 하나가 빠졌다
    const u = i / 4 - 0.5, sw = Math.sin(t * 1.4 + i) * 16;
    const x0 = u * 40, y0 = 96, dx = u * 210 + sw, dy = 234 - Math.abs(u) * 60 - s.crash * 140;
    const ang = Math.atan2(dy, dx), L = Math.hypot(dx, dy);
    const p = F[(i + (st.lvl >= 1 ? 1 : 0)) % 2];
    const len = Math.hypot(p.tip[0] - p.quill[0], p.tip[1] - p.quill[1]) * p.k;
    const k = p.k * clamp(L / len, 0.6, 1.25);
    D.part(p, pickVariant(p, 0), 'quill', x0, y0, ang - TAIL_ANG, k * (u < 0 ? -1 : 1) * 0.9, k, 1);
  }
}

// ───────────────────────── 날개 ─────────────────────────
/** 한쪽 날개: 첫째날개깃(C, 그린 손목에 매달림) → 아래팔(B, 로직 팔꿈치) → 위팔(A, 로직 어깨). 좌(-1)는 거울 */
function drawWings(D, ctx, st, R, b, t, rec) {
  if (st.dead.wings) return;
  const wA = R.wA, wB = R.wB, wC = R.wC;
  for (const side of [-1, 1]) {
    const Wg = b.wing[side];
    const sg = side;
    const rotOf = (a, ang) => (side > 0 ? a - ang : ang - a);
    const kA = wA.k, kB = wB.k, kC = wC.k;
    const rA = rotOf(Wg.a1, wA.ang), rB = rotOf(Wg.a2, wB.ang), rC = rotOf(Wg.a3, wC.ang);
    // 그린 손목 (B 의 wr 피벗이 놓이는 곳)
    const wr = D.pt(wB.el[0], wB.el[1], wB.wr[0], wB.wr[1], Wg.E.x, Wg.E.y, rB, kB * sg, kB, st.pts.wrist[side]);
    if (!st.dead['wC' + side]) {
      part(D, st, wC, 'wr', wr[0], wr[1], rC, kC * sg, kC);
      glowOver(ctx, D, st, wC, 'wr', wr[0], wr[1], rC, kC * sg, kC, 0.55, t + side);
    }
    if (!st.dead['wB' + side]) {
      part(D, st, wB, 'el', Wg.E.x, Wg.E.y, rB, kB * sg, kB);
      glowOver(ctx, D, st, wB, 'el', Wg.E.x, Wg.E.y, rB, kB * sg, kB, 0.55, t + side * 2);
    }
    if (!st.dead['wA' + side]) {
      D.rec = rec;
      part(D, st, wA, 'sh', Wg.S.x, Wg.S.y, rA, kA * sg, kA);
      D.rec = false;
      glowOver(ctx, D, st, wA, 'sh', Wg.S.x, Wg.S.y, rA, kA * sg, kA, 0.5, t + side * 3);
    }
    // 깃을 타고 흐르는 번개 (시간 조각마다 몇 가닥, 결정적)
    if (!st.dead['wC' + side]) {
      const bk = Math.floor(t * 7), cyc = (b.flapMul ?? 1) > 1 ? 0.25 : 0;
      for (let j = 0; j < 2; j++) {
        if (hash1(bk * 1.31 + j * 5.7 + side * 11) > 0.16 + cyc + st.lvl * 0.04) continue;
        const u = hash1(bk * 3.1 + j + side), x0 = lerp(Wg.E.x, wr[0] + side * 170, u), y0 = lerp(Wg.E.y, wr[1] + 30, u) + 20;
        const len = 90 + hash1(bk + j * 9.1) * 110, ang = PI / 2 + side * (0.2 + u * 0.7);
        D.end();
        ctx.beginPath(); boltPath(ctx, x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len, 9, 7, bk * 13 + j + side);
        strokeBolt(ctx, 0.85, 1.6);
        if (st.q.halos && j === 0) halo(ctx, x0 + Math.cos(ang) * len * 0.5, y0 + Math.sin(ang) * len * 0.5, 70, BLUE, 0.3);
        const w = st._W(x0, y0, [0, 0]); st.flashL = Math.max(st.flashL ?? 0, 0.5); st.flashW = w;
      }
    }
  }
}

// ───────────────────────── 몸통 · 다리 · 코어 ─────────────────────────
function drawTorso(D, ctx, st, R, b, s, t) {
  const T = R.torso, k = T.k;
  const br = 1 + Math.sin(t * 2.1) * 0.012;
  const sq = 1 - s.crash * 0.06;
  const rot = (st.jolt ? (rr.next() - 0.5) * 0.03 * st.jolt : 0);
  part(D, st, T, 'c', 0, CORE_Y, rot, k * (1 + s.crash * 0.04), k * br * sq);
  glowOver(ctx, D, st, T, 'c', 0, CORE_Y, rot, k, k * br * sq, 0.55, t);
}
function drawLegs(D, st, R, b, s, t) {
  const Th = R.thigh, Sh = R.shin, f = b.facing || 1;
  const thA = Math.atan2(Th.knee[1] - Th.hip[1], Th.knee[0] - Th.hip[0]);
  for (const side of [-1, 1]) {
    const hx = side * 36, hy = 78;
    const fwd = s.talon * f * 70, spread = s.crash * side * 110;
    const kx = hx + side * 16 + fwd * 0.6 + spread, ky = 134 - s.talon * 20 - s.crash * 40 + Math.sin(t * 1.3 + side) * 3;
    const ax = kx + side * 4 + fwd * 0.5 + spread * 0.4, ay = 198 - s.talon * 36 - s.crash * 80;
    const mir = side < 0 ? -1 : 1;
    // 거울(좌)이면 그림 축각이 π−θ 가 된다
    const a1 = Math.atan2(ky - hy, kx - hx), rot1 = mir > 0 ? a1 - thA : a1 - (PI - thA);
    const k1 = Th.k * LEG_S;
    part(D, st, Th, 'hip', hx, hy - 8, rot1, k1 * mir, k1);
    // 정강이 + 발: 그린 무릎에서 로직 발목 방향으로
    const kn = D.pt(Th.hip[0], Th.hip[1], Th.knee[0], Th.knee[1], hx, hy - 8, rot1, k1 * mir, k1, st.W2 ??= [0, 0]);
    const shA = Math.atan2(Sh.ankle[1] - Sh.knee[1], Sh.ankle[0] - Sh.knee[0]);
    const a2 = Math.atan2(ay - ky, ax - kx);
    const r2 = mir > 0 ? a2 - shA : a2 - (PI - shA);
    const open = 1 + s.talon * 0.18 + s.crash * 0.1;
    part(D, st, Sh, 'knee', kn[0], kn[1] - 4, r2, Sh.k * LEG_S * mir * open, Sh.k * LEG_S);
  }
}
function drawCore(D, ctx, st, R, b, s, t, q) {
  const Rb = R.ribs, op = s.coreOpen ?? 0;
  const pulse = 0.8 + 0.2 * Math.sin(t * 9) + 0.1 * Math.sin(t * 23);
  D.end();
  // 코어: 뜯긴 가슴 속 구전 (가산 발광 + 갈비 사이로 번개)
  if (q.halos) {
    halo(ctx, 0, CORE_Y, (70 + op * 60) * pulse, CORE, 0.6 + op * 0.3);
    halo(ctx, 0, CORE_Y, (26 + op * 12), '#ffffff', 0.85 * pulse, true);
  } else halo(ctx, 0, CORE_Y, (40 + op * 20) * pulse, CORE, 0.8, true);
  const bk = Math.floor(t * 14);
  ctx.beginPath();
  const nb = 3 + Math.round(op * 3);
  for (let k = 0; k < nb; k++) { const a = hash1(bk + k * 3.3) * TAU; boltPath(ctx, 0, CORE_Y, Math.cos(a) * (40 + op * 18), CORE_Y + Math.sin(a) * (54 + op * 12), 5, 5, bk + k); }
  strokeBolt(ctx, 0.75 + op * 0.25, 1.4);
  // 반쪽 갈비뼈 ×2 (코어가 드러나면 문짝처럼 벌어진다)
  const kr = Rb.k;
  for (const side of [-1, 1]) {
    const mir = side < 0 ? 1 : -1;               // 그림 = 왼쪽 반쪽 (가슴뼈가 오른쪽)
    const rot = -side * (op * 0.55 + Math.sin(t * 2.3 + side) * 0.02);
    part(D, st, Rb, 'st', side * RIB_X, RIB_Y, rot, kr * mir * (1 + op * 0.15), kr);
  }
  // 갈비 사이로 새어 나오는 빛
  D.end();
  if (q.halos) halo(ctx, 0, CORE_Y - 6, (46 + op * 16) * pulse, CORE, 0.35 + op * 0.35);
}

// ───────────────────────── 날개 눈 ─────────────────────────
function drawEyes(D, ctx, st, R, b, t, q) {
  const E = R.eye; if (!E || st.dead.wings) return;
  const cx = E.c[0], cy = E.c[1], rx = (E.r[0] - E.l[0]) / 2, ry = rx * (112 / 215);
  const k = E.k * EYE_S;
  for (const e of b.eyes) {
    if (st.dead['wA' + e.side] && st.dead['wB' + e.side]) continue;
    const ang = e.side > 0 ? e.ang : e.ang - PI;
    const alive = e.alive && !st.eyeGone;
    D.part(E, E.v.base, 'c', e.lx, e.ly, ang, k * e.side, k, 1);
    // 눈꺼풀 / 터진 눈구멍 (그림 텍셀 좌표에서)
    D.set(cx, cy, e.lx, e.ly, ang, k * e.side, k);
    const o = alive ? clamp(e.open, 0, 1) : 0;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.08, ry * 1.25, 0, 0, TAU); ctx.clip();
    if (!alive) {
      ctx.fillStyle = '#1a0306'; ctx.fillRect(cx - rx * 1.2, cy - ry * 1.4, rx * 2.4, ry * 2.8);
      ctx.fillStyle = '#6a0c18'; ctx.beginPath(); ctx.ellipse(cx, cy + ry * 0.2, rx * 0.7, ry * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b01828'; ctx.beginPath(); ctx.ellipse(cx - rx * 0.2, cy + ry * 0.05, rx * 0.25, ry * 0.18, 0, 0, TAU); ctx.fill();
    } else if (o < 0.985) {
      const ue = cy - ry * 1.25 * o, le = cy + ry * 1.25 * o;
      ctx.fillStyle = '#3b2a36';
      ctx.beginPath(); ctx.moveTo(cx - rx * 1.3, cy - ry * 1.4); ctx.lineTo(cx + rx * 1.3, cy - ry * 1.4); ctx.lineTo(cx + rx * 1.3, ue); ctx.quadraticCurveTo(cx, ue + ry * 0.5 * (1 - o), cx - rx * 1.3, ue); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2c1f29';
      ctx.beginPath(); ctx.moveTo(cx - rx * 1.3, cy + ry * 1.4); ctx.lineTo(cx + rx * 1.3, cy + ry * 1.4); ctx.lineTo(cx + rx * 1.3, le); ctx.quadraticCurveTo(cx, le - ry * 0.3 * (1 - o), cx - rx * 1.3, le); ctx.closePath(); ctx.fill();
      // 꿰맨 자국 (감긴 눈)
      if (o < 0.25) {
        ctx.strokeStyle = 'rgba(8,4,8,0.95)'; ctx.lineWidth = Math.max(1, rx * 0.07); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - rx, cy + ry * 0.1); ctx.quadraticCurveTo(cx, cy + ry * 0.35, cx + rx, cy + ry * 0.1);
        for (let j = -3; j <= 3; j++) { const x = cx + j * rx * 0.26; ctx.moveTo(x - rx * 0.06, cy - ry * 0.35); ctx.lineTo(x + rx * 0.06, cy + ry * 0.6); }
        ctx.stroke();
      }
    }
    ctx.restore();
    // 쏠 때 · 맞을 때 섬광
    if (alive && (e.fireT > 0 || e.hitT > 0) && E.v.flash) {
      const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      D.img(E.v.flash, cx, cy, e.lx, e.ly, ang, k * e.side, k, e.hitT > 0 ? 0.8 : 0.5);
      ctx.globalCompositeOperation = op;
    }
    if (alive && o > 0.4 && q.halos && e.fireT > 0) { D.end(); halo(ctx, e.lx, e.ly, 34 + 30 * clamp(e.fireT * 3, 0, 1), EYEC, 0.55 * o); }
  }
  D.end();
}

// ───────────────────────── 머리 ─────────────────────────
function drawHead(D, ctx, st, R, b, s, t, q) {
  const H = R.head, J = R.jaw, Hd = b.head;
  const fsx = Math.sign(st.fs || 1) * Math.max(0.12, Math.abs(st.fs)), sg = Math.sign(fsx);
  const a = Hd.a + (st.jolt ? (rr.next() - 0.5) * 0.1 * st.jolt : 0);
  const c = Math.cos(a), sn = Math.sin(a);
  // 로직 머리 원점(Hd.lx,ly) 에서 눈구멍은 (4,-12) (벡터 그림과 같은 자리)
  const ex = Hd.lx + fsx * (4 * c + 12 * sn), ey = Hd.ly + (4 * sn - 12 * c);
  const hk = H.k * HEAD_S, rot = sg * a;
  // 턱: 경첩 = 머리의 hinge 피벗 위치
  const hp = D.pt(H.eye[0], H.eye[1], H.hinge[0], H.hinge[1], ex, ey, rot, hk * fsx, hk, st.pts.hinge);
  const jaw = 0.2 + clamp(s.mouth, 0, 1.2) * 0.46;
  const jr = rot + sg * (jaw - (J.open0 ?? 0.66));
  part(D, st, H, 'eye', ex, ey, rot, hk * fsx, hk);
  glowOver(ctx, D, st, H, 'eye', ex, ey, rot, hk * fsx, hk, 0.5, t);
  if (!st.dead.jaw) part(D, st, J, 'hinge', hp[0], hp[1], jr, hk * fsx, hk);
  // 기준점 (입자·사망)
  D.pt(H.eye[0], H.eye[1], H.mouth[0], H.mouth[1], ex, ey, rot, hk * fsx, hk, st.pts.mouth);
  D.pt(J.hinge[0], J.hinge[1], J.tip[0], J.tip[1], hp[0], hp[1], jr, hk * fsx, hk, st.pts.jawTip);
  st.pts.eye[0] = ex; st.pts.eye[1] = ey; st.pts.head[0] = ex - fsx * 20; st.pts.head[1] = ey + 30;
  st.hrot = rot; st.hsx = hk * fsx; st.jr = jr;
  D.end();
  const dk = b.dying > 0 ? clamp(1.4 - (b.dieT ?? 0), 0, 1) : 1;
  // 눈구멍 번개 눈동자
  const ek = (0.7 + 0.3 * Math.sin(t * 11)) * dk;
  if (ek > 0.02) {
    if (q.halos) halo(ctx, ex, ey, 34 * ek, CORE, 0.7);
    halo(ctx, ex, ey, 10, '#ffffff', 0.95 * ek, true);
    ctx.beginPath(); boltPath(ctx, ex, ey, ex + fsx * 26, ey - 22, 4, 4, Math.floor(t * 10)); strokeBolt(ctx, 0.7 * ek, 1);
  }
  // 입 속 번개 (포효 · 전환)
  const m = clamp(s.mouth, 0, 1.2);
  if (m > 0.15 && dk > 0) {
    const mp = st.pts.mouth;
    if (q.halos) halo(ctx, mp[0], mp[1], 40 + m * 40, CORE, 0.45 * m * dk);
    if (m > 0.5) { ctx.beginPath(); boltPath(ctx, mp[0] - fsx * 20, mp[1] - 6, mp[0] + fsx * 30, mp[1] + 14, 5, 5, Math.floor(t * 16)); strokeBolt(ctx, 0.6 * m * dk, 1.2); }
  }
}

// ───────────────────────── 입자 ─────────────────────────
function levelBurst(P, W, level) {
  const c = W(0, 0, [0, 0]);
  P.burst('ash', c[0], c[1], 22 + level * 8, { speed: 280, color: FEATHER_C, size: 3.4 });
  P.burst('blood', c[0], c[1], 12 + level * 6, { speed: 300, angle: -PI / 2, spread: 1.5, color: BLOOD, hi: BLOOD_HI });
  P.burst('spark', c[0], c[1], 14, { speed: 520, color: BOLT });
}
function ambient(P, b, st, W, dt, q, hit, t) {
  if (b.dying > 0) return;
  const amb = q.ambient, s = b.ps, cyc = (b.flapMul ?? 1) > 1;
  // 날개 끝에서 빠지는 깃털 (날갯짓 · 회오리 때 더)
  if (rr.next() < dt * (1.4 + st.lvl * 0.8 + (cyc ? 6 : 0)) * amb) {
    const side = rr.chance(0.5) ? -1 : 1, Wg = b.wing[side], k = rr.next();
    const p = W(lerp(Wg.E.x, Wg.Tp.x, k), lerp(Wg.E.y, Wg.Tp.y, k) + rr.range(40, 120), [0, 0]);
    P.emit('ash', p[0], p[1], rr.range(-40, 40), rr.range(-10, 40), { color: FEATHER_C, size: rr.range(2.4, 4.2), layer: rr.chance(0.5) ? 0 : 1, life: rr.range(1.8, 3.2) });
  }
  // 회오리: 몸 둘레를 도는 깃털
  if (cyc && rr.next() < dt * 22 * amb) {
    const a = rr.next() * TAU, r = rr.range(160, 320), p = W(Math.cos(a) * r, Math.sin(a) * r * 0.45, [0, 0]);
    P.emit('ash', p[0], p[1], -Math.sin(a) * 320 * (b.cdir ?? 1), Math.cos(a) * 110, { color: FEATHER_C, size: rr.range(2.6, 4.4), layer: rr.chance(0.5) ? 0 : 1, life: rr.range(0.8, 1.4) });
  }
  // 드러난 코어의 스파크 · 가슴에서 흐르는 피
  if ((s.coreOpen ?? 0) > 0.4 && rr.next() < dt * 14 * amb) { const p = W(rr.range(-30, 30), CORE_Y + rr.range(-30, 30), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-260, 260), rr.range(-320, 60), { color: BOLT }); }
  if (st.lvl >= 1 && rr.next() < dt * (1 + st.lvl * 1.4) * amb) { const p = W(rr.range(-26, 26), CORE_Y + rr.range(40, 70), [0, 0]); P.emit('blood', p[0], p[1], 0, 0, { color: BLOOD, hi: BLOOD_HI, hang: rr.range(0.15, 0.5), layer: 1 }); }
  // 턱에서 떨어지는 핏물 (입을 벌릴 때)
  if (s.mouth > 0.3 && st.pts.jawTip && rr.next() < dt * 2.2 * amb) { const p = W(st.pts.jawTip[0], st.pts.jawTip[1], [0, 0]); P.emit('blood', p[0], p[1], 0, 0, { color: BLOOD, hi: BLOOD_HI, hang: rr.range(0.1, 0.4), layer: 1 }); }
  // 기절: 온몸에서 스파크
  if (b.stunned && rr.next() < dt * 18 * amb) { const p = W(rr.range(-120, 120), rr.range(-80, 120), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-200, 200), rr.range(-300, 0), { color: BOLT }); }
  if (hit) {
    const p = W(rr.range(-30, 30), rr.range(-40, 40), [0, 0]);
    P.burst('ash', p[0], p[1], 8, { speed: 220, color: FEATHER_C, size: 3.2 });
    P.burst('blood', p[0], p[1], 6, { speed: 240, angle: -PI / 2, spread: 1.4, color: BLOOD, hi: BLOOD_HI });
  }
  // 막 터진 눈 → 피 분수
  for (const e of b.eyes) {
    if (!e.alive && !e._pb) { e._pb = true; P.burst('blood', e.x, e.y, 14, { speed: 260, color: BLOOD, hi: BLOOD_HI }); }
    else if (e.alive) e._pb = false;
    if (!e.alive && rr.next() < dt * 1.2 * amb) P.emit('blood', e.x, e.y + 6, 0, 0, { color: BLOOD, hi: BLOOD_HI, hang: rr.range(0.2, 0.6), layer: 1 });
  }
}

// ───────────────────────── 사망 붕괴 ─────────────────────────
function deathFx(ctx, D, b, rig, st, W, dt, dT) {
  const R = rig.parts, P = st.P, dead = st.dead, tilt = b.tilt ?? 0;
  const fade = Math.max(0.6, 3.45 - dT);
  const shard = (p, pivot, lx, ly, lrot, sx, sy, vx, vy, vr, r, bounce = 0.3) => {
    const w = W(lx, ly, [0, 0]);
    const pv = typeof pivot === 'string' ? p[pivot] : pivot;
    st.shards.spawn(pickVariant(p, 2), pv[0], pv[1], w[0], w[1], tilt + lrot, sx, sy, vx, vy, vr, { r, bounce, fade });
  };
  // 0.4 s: 눈이 모두 터진다
  if (!st.eyeGone && dT > 0.4) {
    st.eyeGone = true;
    for (const e of b.eyes) { P.burst('blood', e.x, e.y, 8, { speed: 240, color: BLOOD, hi: BLOOD_HI }); P.burst('spark', e.x, e.y, 3, { speed: 300, color: EYEC }); }
  }
  // 0.9 s: 첫째날개깃이 찢겨 떨어진다
  if (!dead['wC1'] && dT > 0.9) {
    for (const side of [-1, 1]) {
      const Wg = b.wing[side], wr = st.pts.wrist[side], p = R.wC, rC = side > 0 ? Wg.a3 - p.ang : p.ang - Wg.a3;
      shard(p, 'wr', wr[0], wr[1], rC, p.k * side, p.k, side * rr.range(60, 160), rr.range(-200, -80), side * rr.range(0.8, 2), 60, 0.1);
      dead['wC' + side] = true;
      for (let i = 0; i < 24; i++) { const q = W(wr[0] + side * rr.range(20, 300), wr[1] + rr.range(0, 200), [0, 0]); P.emit('ash', q[0], q[1], rr.range(-60, 60), rr.range(-80, 20), { color: FEATHER_C, size: rr.range(2.5, 4.5), life: rr.range(1.2, 2.2), layer: 1 }); }
      const q = W(wr[0], wr[1], [0, 0]); P.burst('blood', q[0], q[1], 10, { speed: 220, color: BLOOD, hi: BLOOD_HI });
    }
  }
  // 1.5 s: 날개 뼈째 뜯긴다
  if (!dead.wings && dT > 1.5) {
    for (const side of [-1, 1]) {
      const Wg = b.wing[side];
      const pB = R.wB, pA = R.wA;
      shard(pB, 'el', Wg.E.x, Wg.E.y, side > 0 ? Wg.a2 - pB.ang : pB.ang - Wg.a2, pB.k * side, pB.k, side * rr.range(80, 200), rr.range(-260, -120), side * rr.range(1, 3), 50, 0.15);
      shard(pA, 'sh', Wg.S.x, Wg.S.y, side > 0 ? Wg.a1 - pA.ang : pA.ang - Wg.a1, pA.k * side, pA.k, side * rr.range(40, 140), rr.range(-300, -160), side * rr.range(1, 2.5), 50, 0.15);
      dead['wA' + side] = dead['wB' + side] = true;
      const q = W(Wg.S.x, Wg.S.y, [0, 0]);
      P.burst('blood', q[0], q[1], 18, { speed: 320, color: BLOOD, hi: BLOOD_HI });
      P.burst('spark', q[0], q[1], 10, { speed: 420, color: BOLT });
    }
    dead.wings = true;
  }
  // 2.1 s: 머리와 턱이 떨어진다
  if (!dead.head && dT > 2.1 && st.hsx) {
    const H = R.head, J = R.jaw, e = st.pts.eye, hp = st.pts.hinge, sg = Math.sign(st.hsx);
    shard(H, 'eye', e[0], e[1], st.hrot, st.hsx, Math.abs(st.hsx), sg * rr.range(80, 200), -360, sg * rr.range(3, 6), 40, 0.35);
    shard(J, 'hinge', hp[0], hp[1], st.jr, st.hsx, Math.abs(st.hsx), sg * rr.range(120, 260), -240, sg * rr.range(5, 9), 24, 0.4);
    dead.head = dead.jaw = true;
    const q = W(e[0], e[1] + 40, [0, 0]);
    P.burst('blood', q[0], q[1], 22, { speed: 320, angle: -PI / 2, spread: 1.5, color: BLOOD, hi: BLOOD_HI });
  }
  // 2.5 s: 몸통 · 갈비 · 다리가 무너진다
  if (!dead.body && dT > 2.5) {
    const T = R.torso, Rb = R.ribs;
    shard(T, 'c', 0, CORE_Y, 0, T.k, T.k, rr.range(-40, 40), -120, rr.range(-1.5, 1.5), 90, 0.2);
    for (const side of [-1, 1]) {
      shard(Rb, 'st', side * RIB_X, RIB_Y, -side * 0.6, Rb.k * (side < 0 ? 1 : -1), Rb.k, side * rr.range(120, 240), rr.range(-340, -200), side * rr.range(4, 8), 22, 0.4);
      shard(R.shin, 'knee', side * 50, 134, 0, R.shin.k * side, R.shin.k, side * rr.range(60, 160), rr.range(-200, -80), side * rr.range(2, 5), 20, 0.3);
      shard(R.thigh, 'hip', side * 36, 70, 0, R.thigh.k * side, R.thigh.k, side * rr.range(40, 120), rr.range(-160, -60), side * rr.range(1, 3), 22, 0.25);
    }
    dead.body = true;
    const c = W(0, CORE_Y, [0, 0]);
    b.world?.fx?.ring?.(c[0], c[1], { color: CORE, r0: 20, r1: 260, life: 0.5, width: 8 });
    P.burst('ash', c[0], c[1], 40, { speed: 360, color: FEATHER_C, size: 3.8 });
    P.burst('blood', c[0], c[1], 26, { speed: 380, color: BLOOD, hi: BLOOD_HI });
    P.burst('spark', c[0], c[1], 18, { speed: 560, color: BOLT });
    for (let i = 0; i < 8; i++) {
      const p = R[st.debris[i % st.debris.length]]; if (!p) continue;
      const a = -PI / 2 + (rr.next() - 0.5) * 2.6, sp = rr.range(240, 560);
      st.shards.spawn(p.v.base, p.c[0], p.c[1], c[0], c[1], rr.next() * TAU, p.k * rr.sign(), p.k, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-9, 9), { r: (p.w + p.h) * 0.2 * p.k, fade });
    }
  }
  // 무너지는 동안: 번개가 깃털에서 빠져나가고 깃털이 흩날린다
  if (dT < 2.6 && rr.next() < dt * 20) { const p = W(rr.range(-260, 260), rr.range(-100, 160), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-120, 120), rr.range(40, 260), { color: BOLT }); }
  if (dT < 3 && rr.next() < dt * 16) { const p = W(rr.range(-200, 200), rr.range(-80, 120), [0, 0]); P.emit('ash', p[0], p[1], rr.range(-40, 40), rr.range(-40, 30), { color: FEATHER_C, size: rr.range(2.4, 4), layer: 1 }); }
  // 폭풍빛 심장이 떨어진다 (로직 paintFront 연출과 같은 궤적)
  if (dT > 0.8) {
    const k = clamp(dT - 0.8, 0, 1) * clamp((3.5 - dT) / 0.4, 0, 1), x = b.zx, y = Math.min(b.A.floor - 20, b.zy + 10 + (dT - 0.8) ** 2 * 60);
    if (k > 0.01) {
      halo(ctx, x, y, 90, '#6a9cff', 0.7 * k);
      ctx.save(); ctx.translate(x, y); const sc = 1 + Math.sin(b.t * 8) * 0.06; ctx.scale(sc, sc);
      ctx.globalAlpha *= k;
      ctx.fillStyle = '#b0c8ff';
      ctx.beginPath(); ctx.moveTo(0, 14); ctx.bezierCurveTo(-26, -4, -14, -24, 0, -10); ctx.bezierCurveTo(14, -24, 26, -4, 0, 14); ctx.fill();
      ctx.beginPath(); boltPath(ctx, -8, -12, 6, 10, 4, 4, Math.floor(b.t * 12)); strokeBolt(ctx, 0.8, 1.4);
      ctx.restore();
      halo(ctx, x, y - 2, 30, '#ffffff', 0.6 * k, true);
    }
  }
}
