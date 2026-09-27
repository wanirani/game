// 몰록 (b_moloch) — 채색 컷아웃 퍼핏 렌더러 (s15 '몰록의 제단', 용광로의 우상)
// 부품 (Kling, 정면 퍼핏): 녹청 청동 흉갑(배에 화로 구멍, 가시 견갑) · 녹청 황소 머리(주황 눈, 달군 입, 목깃) · 뿔 두 개(머리 그림에서 잘라냄) ·
//   부러진 뿔 그루터기(가시 고리 + 쇳물) · 근육 청동 팔/허벅지 · 화로 창 달린 팔뚝+주먹 두 벌 · 룬 망치 · 달군 갈고리 집게 ·
//   가시 굴뚝 · 찢긴 가죽 앞치마 · 화로 창살 · 사슬 고리/갈고리 · 짓눌린 영혼 해골 3 · 청동/쇳물 파편 12.
// 절차적 층: 화로 속 불(한 번 구운 방사 그라디언트) · 영혼 · 굴뚝 불꽃(가산 퍼프) · 눈빛 · 쇳물 침 · 균열 발광(손상 단계) ·
//   용암 웅덩이(한 번 구움) · 불똥 입자 · 사망: 균열 → 폭발(창살·굴뚝·파편이 튀어 나감) → 용암 속으로 가라앉음(바닥에서 잘라 그림).
// 로직(src/game/bosses/c_moloch.js)의 상태를 읽기만 한다:
//   boss { cx, bottom, sink, turnK, pose{ha,he,hd,ta,te,td,tongOpen,roar,lean,tilt,chim}, grateK, heat, formPhase, tongs{x,y,open}|null,
//          hamGlow, chainSw, vx, exploded, dying, hp/stats.maxHp, flashT, hitPart{grate?}, A{floor} }
// 좌표: 벡터 paintBody 와 같은 몸 좌표계 — translate(cx, bottom+sink) · scale(turnK,1) · rotate(lean). Drawer 의 기준 행렬을 그 몸 좌표계로 잡아
//   모든 부품을 지역 좌표로 바로 그린다 (돌아설 때의 가로 찌그러짐까지 벡터와 같다). 판정은 바꾸지 않는다.
import { Drawer, Particles, Shards, halo, rr, loadRig, pickVariant, quality, QUALITY, makeCanvas, ledgesOver } from '../kit.js';

const DIR = 'painted/bosses/b_moloch';
const FIRE = '#ff7a2a', HOT = '#ffd070', LAVA = '#ff5a1a', SOUL = '#ffe8a0', RED = '#ff4020';
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const tierOf = (game) => { const t = game?.quality ?? game?.tier ?? game?.settings?.quality; return QUALITY[t] ? t : quality(game).name; };
const qualityOf = (game) => QUALITY[tierOf(game)];

// 로직과 같은 몸 치수 (앵커 = 발밑 가운데 = 바닥, 위 = −y, 오른쪽 = 바라보는 쪽)
const SHOULDER = [100, -222], L_UP = 82, L_FORE = 78, HAFT = 150;
const FURN = [0, -142, 46, 54];
const HEAD_Y = -244;
const TORSO_Y = -142;                 // 흉갑 화로 구멍 가운데
const GRATE_R = 51;                   // 창살 바깥 테 반지름 (월드 px)
// 굴뚝: 채색 머리(뿔 포함 ±95px)가 벡터 머리보다 넓어 벡터 자리(±64)에 두면 머리 뒤에 완전히 가려진다 →
// 견갑 뒤에서 바깥으로 기울어 솟게 한다 (꼭대기 ≈ ±131, −346: 머리 옆·뿔 아래로 불꽃이 보인다). 로직의 굴뚝 불꽃 터짐 자리도 이 값을 쓴다 (art.chimneyTop)
const CH_X = 118, CH_Y = -214, CH_ROT = 0.1;

const DEF = {
  glow: '#ffb070',
  outline: { width: 1.8, color: 'rgba(12,5,2,0.92)' },
  defaults: { stain: 'rgb(30,14,6)', char: 0.6, crackMinLum: 45 },
  parts: {
    torso: { flash: true, cracks: 6, holes: 1 }, head: { flash: true, cracks: 4, holes: 0 },
    hornL: { flash: true, cracks: 2, holes: 0 }, hornR: { flash: true, cracks: 2, holes: 0 }, stump: { flash: true, noDmg: true },
    limb: { flash: true, deep: 0.62, cracks: 2, holes: 0 }, foreH: { flash: true, cracks: 2, holes: 0 }, foreT: { flash: true, deep: 0.62, deepOnly: true, cracks: 2, holes: 0 },
    hammer: { cracks: 2, holes: 0 }, tongs: { noDmg: true }, chimney: { cracks: 3, holes: 1 }, apron: { flash: true, cracks: 3, holes: 2 },
    grate: { flash: true, noDmg: true }, link: { noDmg: true, outline: 1.2 }, hook: { noDmg: true, outline: 1.2 },
  },
  prefix: { soul: { noDmg: true }, deb: { noDmg: true, outline: 1.2 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_moloch', kind: 'boss', ownsDeathFade: true,
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    const names = Object.keys(rig.parts);
    rig.debs = names.filter((n) => /^deb\d+$/.test(n)).map((n) => rig.parts[n]);
    rig.souls = names.filter((n) => /^soul\d+$/.test(n)).sort().map((n) => rig.parts[n]);
    rig.bake = bakeFx();
    rig.art = makeArt(rig);
    return rig;
  },
  init(b, rig) {
    const q = qualityOf(b.world?.game);
    return { D: new Drawer(), P: new Particles(q.particles), shards: new Shards(60), q, lt: null, pf: 0, jolt: 0, lvl: -1, sel: null, form: -1, exploded: false, emb: 0, W: [0, 0], lp: [0, 0], fl: 0 };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    let x0 = b.cx - 340, x1 = b.cx + 340, y0 = b.bottom - 640, y1 = b.bottom + 40;   // 망치를 치켜들면 머리가 바닥 위 ≈590px 까지 올라간다
    if (b.tongs) { x0 = Math.min(x0, b.tongs.x - 140); x1 = Math.max(x1, b.tongs.x + 140); y0 = Math.min(y0, b.tongs.y - 80); y1 = Math.max(y1, b.tongs.y + 80); }
    if ((b.dying > 0 || st?.shards?.list.length) && b.A) { x0 = Math.min(x0, b.A.x0); x1 = Math.max(x1, b.A.x1); y0 = Math.min(y0, b.bottom - 700); }
    // 남아 있는 입자 (불똥·연기·파편 불씨 — BOSS_PIPELINE §8.15)
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 30 < x0) x0 = px - 30; if (px + 30 > x1) x1 = px + 30; if (py - 30 < y0) y0 = py - 30; if (py + 30 > y1) y1 = py + 30; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b) {
    if (b.dying > 0 && b.exploded) L.add(b.cx, b.bottom - 60, 320, LAVA, 0.6);
  },
  debris(i, rig) {
    const L = rig.debs; if (!L?.length) return null;
    const p = L[i % L.length], im = p.v.base, k = p.k;
    return { size: Math.max(8, (p.r ?? 8) * 1.2), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 한 번 굽는 절차적 그림 ─────────────────────────
/** 화로 속 불 원반 · 용암 웅덩이 (그라디언트는 굽기 때 한 번만) */
function bakeFx() {
  const furn = makeCanvas(128, 128), g = furn.getContext('2d');
  let gr = g.createRadialGradient(64, 76, 4, 64, 64, 64);
  gr.addColorStop(0, '#fff4c0'); gr.addColorStop(0.3, '#ffb040'); gr.addColorStop(0.65, '#d04a0c'); gr.addColorStop(1, '#3a0800');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 64, 0, TAU); g.fill();
  const pool = makeCanvas(344, 64), p = pool.getContext('2d');
  p.save(); p.translate(172, 32); p.scale(1, 32 / 172);
  gr = p.createRadialGradient(0, 0, 10, 0, 0, 172);
  gr.addColorStop(0, 'rgba(255,230,140,0.95)'); gr.addColorStop(0.35, 'rgba(255,140,40,0.9)'); gr.addColorStop(0.7, 'rgba(180,40,6,0.75)'); gr.addColorStop(1, 'rgba(60,8,0,0)');
  p.fillStyle = gr; p.beginPath(); p.arc(0, 0, 172, 0, TAU); p.fill();
  p.restore();
  return { furn, pool };
}

// ───────────────────────── 도우미 ─────────────────────────
function axis(p, a, b) {
  const key = a + '>' + b, c = (p._ax ??= {});
  if (!c[key]) { const A = p[a], B = p[b]; c[key] = { a: Math.atan2(B[1] - A[1], B[0] - A[0]), len: Math.hypot(B[0] - A[0], B[1] - A[1]) * p.k }; }
  return c[key];
}
/** 부품 pivot 을 몸 좌표 (x,y) 에, 회전 rot, 배율 sc (sxm/sym 축별, 음수 = 거울) */
function put(D, part, img, pivot, x, y, rot, sc = 1, sxm = 1, sym = 1, alpha = 1) {
  if (!part || !img) return;
  const k = part.k * sc;
  D.part(part, img, pivot, x, y, rot, k * sxm, k * sym, alpha);
}
/** 두 점 사이 뼈 (pa → pb 축 정렬, 길이 맞춤, 굵기 wMul) */
function seg(D, part, img, pa, pb, x0, y0, x1, y1, wMul = 1, alpha = 1) {
  if (!part || !img) return;
  const ax = axis(part, pa, pb), len = Math.hypot(x1 - x0, y1 - y0) || 1, s = len / (ax.len || 1);
  D.part(part, img, pa, x0, y0, Math.atan2(y1 - y0, x1 - x0) - ax.a, part.k * s * wMul, part.k * s, alpha);
}
/** 부품 텍셀 점 q 의 몸 좌표 (pivot pv 가 (x,y), 회전 rot, 배율 sc) */
function ptOf(p, pv, q, x, y, rot, sc, out, sxm = 1, sym = 1) {
  const A = p[pv], dx = (q[0] - A[0]) * p.k * sc * sxm, dy = (q[1] - A[1]) * p.k * sc * sym, c = Math.cos(rot), s = Math.sin(rot);
  out[0] = x + c * dx - s * dy; out[1] = y + s * dx + c * dy; return out;
}
/** 팔 관절 (로직 armJoints 와 같은 식) */
function armJoints(s, a, e, o) {
  o.sx = s * SHOULDER[0]; o.sy = SHOULDER[1];
  o.ex = o.sx + s * Math.sin(a) * L_UP; o.ey = o.sy + Math.cos(a) * L_UP;
  o.b = a + e;
  o.wx = o.ex + s * Math.sin(o.b) * L_FORE; o.wy = o.ey + Math.cos(o.b) * L_FORE;
  return o;
}
const canvasAng = (s, a) => Math.atan2(Math.cos(a), s * Math.sin(a));
/** 사슬 고리 타일을 (x0,y0)→(x1,y1) 처진 곡선(sag, 가로 흔들림 swing)을 따라 */
function chainTiles(D, R, x0, y0, x1, y1, sag, swing = 0, sc = 1, maxN = 40) {
  const L = R.link; if (!L) return;
  const ax = axis(L, 'a', 'b'), step = ax.len * sc;
  const dist = Math.hypot(x1 - x0, y1 - y0) + Math.abs(sag) * 0.6;
  const n = clamp(Math.round(dist / step), 1, maxN);
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const k = i / n, x = lerp(x0, x1, k) + Math.sin(k * PI) * swing, y = lerp(y0, y1, k) + Math.sin(k * PI) * sag;
    const len = Math.hypot(x - px, y - py) || 1;
    D.part(L, L.v.base, 'a', px, py, Math.atan2(y - py, x - px) - ax.a, L.k * (len / ax.len), L.k * sc);
    px = x; py = y;
  }
}

// ───────────────────────── 메인 ─────────────────────────
function tick(b, world, st) {
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  if (st.q.name !== tierOf(world.game)) st.q = qualityOf(world.game);
  const F = b.A?.floor ?? b.bottom;
  st.P.update(dt, F); st.shards.update(dt, F);
  return dt;
}
function struckGroup(b) {
  const hp = b.hitPart;
  if (!hp) return 'body';
  if (hp.grate) return 'grate';
  if (hp.y + hp.h / 2 < b.bottom - 270) return 'head';
  return 'body';
}
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, dt = tick(b, world, st), R = rig.parts, q = st.q, P = b.pose, t = b.t ?? 0;
  const ratio = b.dying > 0 ? 0 : clamp(b.hp / b.stats.maxHp, 0, 1);
  const lvl = b.dying > 0 ? 2 : ratio < 0.33 ? 2 : ratio < 0.66 ? 1 : 0;
  const form = b.formPhase ?? 0, f1 = form >= 1, f2 = form >= 2;
  const dying = b.dying > 0, el = dying ? 3.2 - b.dying : 0, exploded = !!b.exploded && dying;
  const hit = b.flashT > 0.06 && (!(st.pf > 0.06) || b.flashT > st.pf + 1e-3); st.pf = b.flashT;   // 섬광이 다시 채워지면(연타) 새 피격 → 맞은 부위 갱신
  if (hit) { st.jolt = 1; st.sel = struckGroup(b); }
  st.jolt = Math.max(0, st.jolt - dt * 6);
  if (st.lvl >= 0 && lvl > st.lvl && !dying) levelBurst(st, b, rig);
  st.lvl = lvl;
  const flash = b.flashT > 0 ? clamp(b.flashT / 0.12, 0, 1) : 0;
  const recOn = (g) => flash > 0 && (st.sel === g || (g === 'body' && st.sel === 'grate'));
  const tk = Math.abs(b.turnK ?? 1) < 0.18 ? Math.sign(b.turnK || 1) * 0.18 : (b.turnK ?? 1);
  const X = b.cx, Y = b.bottom + (b.sink ?? 0), F = b.A?.floor ?? b.bottom;
  const breath = Math.sin(t * 1.4) * 2;
  const lean = P.lean ?? 0, cl = Math.cos(lean), sl = Math.sin(lean);
  // 몸 좌표 → 월드 (입자용)
  const Wd = (lx, ly, out = st.W) => { out[0] = X + tk * (cl * lx - sl * ly); out[1] = Y + sl * lx + cl * ly; return out; };
  // 뿔 부러짐: 로직 형태가 2 로 오르는 순간 채색 뿔이 튕겨 나간다 (로직의 벡터 뿔 잔상은 채색일 때 등록되지 않음)
  if (st.form >= 0 && form >= 2 && st.form < 2 && !dying) hornBreak(st, rig, b, tk, Wd);
  st.form = form;
  if (exploded && !st.exploded) { st.exploded = true; explodeBurst(st, rig, b, tk, Wd); }
  if (!dying) st.exploded = false;
  const a0 = dying ? clamp(b.dying / 1.2, 0, 1) : 1;       // 폭발 뒤 가라앉으며 사라짐 (벡터와 같은 곡선)
  if (a0 <= 0.01) { D.begin(ctx); st.shards.draw(D); D.end(); st.P.draw(ctx, 1); return; }
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  D.begin(ctx);
  b.paintBack?.(ctx, world);           // 화로 광선 예고선 (로직)
  st.P.draw(ctx, 0);
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a0;
  // ── 몸 좌표계 (바닥선 아래는 잘라낸다: 허벅지·앞치마는 용암 속, 사망 때 가라앉음) ──
  D.save();
  ctx.beginPath(); ctx.rect(X - 2000, F + 6 - 4000, 4000, 4000); ctx.clip();
  const shake = st.jolt > 0 ? (rr.next() - 0.5) * 3 * st.jolt : 0;
  const WM = ctx.getTransform();       // 월드 변환 (발판 덧그리기용)
  ctx.translate(X + shake, Y); ctx.scale(tk, 1); ctx.rotate(lean);
  D.begin(ctx);
  if (flash > 0) D.startFlash(); else D.rec = false;
  const V = (p, deep = false, lv = lvl) => pickVariant(p, lv, deep, null);
  const J = st._j ??= {}, K = st._k ??= {};
  // ── 굴뚝 (등 뒤) ──
  if (!exploded && R.chimney) {
    for (const s of [-1, 1]) {
      const cx = s * CH_X, cy = CH_Y + breath, cracked = f1 && s < 0, rot = s * CH_ROT;
      put(D, R.chimney, V(R.chimney, false, cracked ? 2 : Math.min(lvl, 1)), 'base', cx, cy, rot);
      if (cracked) glowOver(ctx, D, R.chimney, 2, 'base', cx, cy, rot, 1, 1, 1, 0.9, t, st);
      const top = ptOf(R.chimney, 'base', R.chimney.top, cx, cy, rot, 1, st.lp);
      chimneyFlame(ctx, st, top[0], top[1], P, t, s, cracked, dt, Wd);
    }
    D.end();
  }
  // ── 집게 팔 (뒤쪽, −x) ──
  armJoints(-1, P.ta ?? 0.4, P.te ?? 0.9, K);
  D.rec = recOn('body');
  seg(D, R.limb, V(R.limb, true), 'a', 'b', K.sx, K.sy + breath, K.ex, K.ey + breath, 1.15);
  seg(D, R.foreT, V(R.foreT, true), 'a', 'b', K.ex, K.ey + breath, K.wx, K.wy + breath);
  D.rec = false;
  drawTongs(ctx, D, R, b, st, K, breath, tk, t);
  // ── 허벅지 (용암 속으로) ──
  D.rec = recOn('body');
  for (const s of [-1, 1]) seg(D, R.limb, V(R.limb, s < 0), 'a', 'b', s * 44, -78, s * 60, 6, 1.4);
  D.rec = false;
  // ── 화로 속: 불 · 짓눌린 영혼 ──
  const [fx, fy] = FURN, heat = b.heat ?? 0.35, gk = b.grateK ?? 0;
  D.end();
  const FB = rig.bake.furn;
  ctx.drawImage(FB, fx - 50, fy - 50 + breath, 100, 100);
  if (rig.souls.length) {
    for (let i = 0; i < 3; i++) {
      const p = rig.souls[i % rig.souls.length];
      const sx = fx - 22 + i * 22 + Math.sin(t * 1.7 + i * 2) * 3, sy = fy - 4 + (i === 1 ? 10 : 0) + Math.sin(t * 2.3 + i) * 3 + breath;
      put(D, p, p.v.base, 'c', sx, sy, Math.sin(t * 1.3 + i) * 0.12, (i === 1 ? 0.78 : 0.68));
    }
    D.end();
  }
  if (q.halos) halo(ctx, fx, fy + 12 + breath, 46, HOT, 0.3 + heat * 0.45 + Math.sin(t * 9) * 0.05);
  // ── 몸통 ──
  D.rec = recOn('body');
  if (R.torso) {
    put(D, R.torso, V(R.torso), 'hole', 0, TORSO_Y + breath, 0);
    glowOver(ctx, D, R.torso, lvl, 'hole', 0, TORSO_Y + breath, 0, 1, 1, 1, 1, t, st);
  }
  // ── 창살 (열리면 위로 접혀 올라간다) ──
  D.rec = recOn('grate');
  if (!exploded && R.grate) {
    const open = 1 - gk * 0.92;
    put(D, R.grate, R.grate.v.base, 'top', 0, TORSO_Y - GRATE_R + breath, 0, 1, 1, open);
    D.end();
    if (q.halos && heat > 0.4) halo(ctx, 0, TORSO_Y + breath, 44, '#ff8a30', (heat - 0.4) * 0.9);
    if (q.halos && gk > 0.3) halo(ctx, 0, TORSO_Y + breath, 80, HOT, 0.3 * gk + Math.sin(t * 20) * 0.05);
  }
  D.rec = false;
  // ── 가슴의 사슬 ──
  chainTiles(D, R, -74, -236 + breath, 74, -236 + breath, 58, (b.chainSw ?? 0) * 0.3, 0.9);
  // ── 앞치마 ──
  D.rec = recOn('body');
  if (R.apron) {
    const sk = Math.sin(t * 1.1) * 0.03 - (b.vx ?? 0) * 0.001 * tk;
    put(D, R.apron, V(R.apron), 'belt', 0, -60 + breath, sk);
  }
  // ── 발판 덧그리기 (BOSS_PIPELINE §8.11): 우상이 경기장 한쪽 발판(머리 높이)을 덮어도 딛을 곳이 보이게.
  //    굴뚝·흉갑·창살·앞치마 위, 머리·뿔·망치 팔 아래. 발판은 타일 층과 같은 그림이라 몸의 투명도(a0)와 무관하게 불투명하게 덧그린다
  if (q.ledges !== false && !exploded) {
    const cam = world.camera, cx0 = cam?.x ?? -1e9, cy0 = cam?.y ?? -1e9, cx1 = cx0 + (cam?.vw ?? 2e9), cy1 = cy0 + (cam?.vh ?? 2e9);
    ctx.setTransform(WM);
    const ga2 = ctx.globalAlpha; ctx.globalAlpha = ga;
    ledgesOver(ctx, world, Math.max(X - 320, cx0), Math.max(Y - 480, cy0), Math.min(X + 320, cx1), Math.min(F - 8, cy1));
    ctx.globalAlpha = ga2;
    D.end();
  }
  // ── 머리 + 뿔 ──
  D.rec = recOn('head');
  drawHead(ctx, D, rig, b, st, P, t, breath, f2, lvl, V);
  // ── 망치 팔 (앞, +x) ──
  armJoints(1, P.ha ?? 0.3, P.he ?? 1.3, J);
  D.rec = recOn('body');
  seg(D, R.limb, V(R.limb), 'a', 'b', J.sx, J.sy + breath, J.ex, J.ey + breath, 1.15);
  D.rec = false;
  const hd = canvasAng(1, P.hd ?? 2.9), wy = J.wy + breath;
  const hx = J.wx + Math.cos(hd) * HAFT, hy = wy + Math.sin(hd) * HAFT;
  if (R.hammer) {
    const ax = axis(R.hammer, 'grip', 'head');
    put(D, R.hammer, V(R.hammer, false, Math.min(1, lvl)), 'head', hx, hy, hd - ax.a, 1, 1, 1);
    if ((b.hamGlow ?? 0) > 0 && q.halos) { D.end(); halo(ctx, hx, hy, 60, HOT, b.hamGlow * 0.8); }
  }
  D.rec = recOn('body');
  seg(D, R.foreH, V(R.foreH), 'a', 'b', J.ex, J.ey + breath, J.wx, wy);
  D.rec = false;
  // ── 팔목 사슬 ──
  if (st.q.name !== 'low') {
    const sw = b.chainSw ?? 0;
    chainTiles(D, R, J.wx - 6, wy, J.wx - 20, wy + 150, 0, sw, 0.85, 12);
    chainTiles(D, R, K.wx + 6, K.wy + breath, K.wx + 24, K.wy + breath + 130, 0, -sw, 0.85, 12);
  }
  // ── 뿔 부러진 뒤 가슴이 갈라진 자리 ──
  D.end();
  if (f2 && q.halos) halo(ctx, -12, -222 + breath, 34, FIRE, 0.5);
  // ── 사망: 균열 발광이 커지고 속불이 샌다 ──
  if (dying && !exploded && q.halos) {
    const k = clamp(el / 1.2, 0, 1);
    halo(ctx, 0, TORSO_Y + breath, 90 + 140 * k, HOT, 0.25 + 0.55 * k * k);
    halo(ctx, 0, -300, 60 + 60 * k, FIRE, 0.2 + 0.4 * k);
  }
  // ── 피격 섬광 ──
  if (flash > 0) D.flash(0.6 * flash);
  D.restore();
  ctx.globalAlpha = ga;
  D.begin(ctx);
  // ── 용암 웅덩이 (허리 아래가 잠긴 자리, 몸 앞) ──
  const pool = rig.bake.pool, pw = 344 * (1 + Math.sin(t * 1.2) * 0.02);
  const lg = ctx.globalCompositeOperation;
  ctx.globalAlpha = ga * a0 * 0.9;
  ctx.drawImage(pool, X - pw / 2, b.bottom - 30, pw, 64);
  ctx.globalAlpha = ga;
  if (q.halos) {
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.7 + i * 0.25) % 1, bx = Math.sin(i * 7.3 + Math.floor(t * 0.7 + i * 0.25) * 3) * 120;
      halo(ctx, X + bx, b.bottom - 2 - k * 6, 8 + k * 10, HOT, (1 - k) * 0.7 * a0);
    }
  }
  ctx.globalCompositeOperation = lg;
  // 용암 불똥
  st.emb += dt * (q.particles > 150 ? 7 : 3);
  while (st.emb > 1) { st.emb -= 1; st.P.emit('ember', X + rr.range(-140, 140), b.bottom - 4, rr.range(-20, 20), rr.range(-120, -60), { life: rr.range(0.6, 1.3) }); }
  st.shards.draw(D);
  D.end();
  b.paintFront?.(ctx, world);          // 쇳물 줄기 (로직)
  st.P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

/** 굴뚝 불꽃: 가산 퍼프 기둥 (금 간 쪽은 작고 검붉다) + 불똥 */
function chimneyFlame(ctx, st, x, y, P, t, s, cracked, dt, Wd) {
  if (!st.q.halos) return;
  st.D.end();   // 굴뚝 부품 변환이 남아 있으면 불꽃이 엉뚱한 곳(부품 텍셀 공간)에 그려진다 → 몸 좌표 기준으로

  const k = 0.5 + (P.chim ?? 0) * 0.5, fk = 0.7 + Math.sin(t * 13 + s) * 0.15;
  const h = (60 + 70 * (P.chim ?? 0)) * fk * (cracked ? 0.6 : 1), w = 20 * fk * (cracked ? 0.6 : 1);
  halo(ctx, x, y + 4, 26, cracked ? RED : FIRE, 0.7 * k);
  for (let i = 0; i < 4; i++) {
    const u = i / 3, sway = Math.sin(t * 9 + i * 1.7 + s) * 4 * u;
    halo(ctx, x + sway, y - h * u * 0.8, w * (1.3 - u * 0.7), i < 2 ? HOT : (cracked ? RED : FIRE), (0.75 - u * 0.4) * k, i === 0);
  }
  st.fl += dt * (cracked ? 2 : 5) * k;
  if (st.fl > 1 && st.q.particles > 150) {
    st.fl -= 1;
    const w2 = Wd(x, y - 10);
    st.P.emit(cracked ? 'smoke' : 'ember', w2[0], w2[1], rr.range(-15, 15), rr.range(-120, -60), cracked ? { color: '#140c0a', life: rr.range(0.8, 1.4) } : { life: rr.range(0.5, 1) });
  }
}
/** 집게: 손에 들었거나(한 쌍, 벌림 tongOpen) 날아가 사슬 끝에 (로직 tongs {x,y,open}) */
function drawTongs(ctx, D, R, b, st, K, breath, tk, t) {
  const Tg = R.tongs; if (!Tg) return;
  const ax = axis(Tg, 'p', 'tip');
  const T = b.tongs;
  if (T) {
    const lx = (T.x - b.cx) / tk, ly = T.y - b.bottom - (b.sink ?? 0);
    chainTiles(D, R, K.wx, K.wy + breath, lx, ly, 30, 0, 0.8, 40);
    const op = (T.open ?? 0) * 0.5;
    put(D, Tg, Tg.v.base, 'p', lx - 40, ly, -op - ax.a);
    put(D, Tg, Tg.v.base, 'p', lx - 40, ly, op - ax.a, 1, 1, -1);
    D.end();
    if (st.q.halos) halo(ctx, lx + 40, ly, 30, HOT, 0.8);
  } else {
    const td = canvasAng(-1, b.pose.td ?? 0.9), op = (b.pose.tongOpen ?? 0.15) * 0.45, wy = K.wy + breath;
    put(D, Tg, Tg.v.base, 'p', K.wx, wy, td - op - ax.a);
    put(D, Tg, Tg.v.base, 'p', K.wx, wy, td + op - ax.a, 1, 1, -1);
    D.end();
    if (st.q.halos) halo(ctx, K.wx + Math.cos(td) * 84, wy + Math.sin(td) * 84, 14 + (b.pose.tongOpen ?? 0) * 10, HOT, 0.6 + (b.pose.tongOpen ?? 0) * 0.3);
  }
}
/** 머리: 뿔(또는 부러진 그루터기) → 머리 → 눈빛·입불·쇳물 침 */
function drawHead(ctx, D, rig, b, st, P, t, breath, f2, lvl, V) {
  const R = rig.parts, H = R.head; if (!H) return;
  const hb = Math.sin(t * 1.4) * 2 + (P.roar ?? 0) * -4;
  const hy = HEAD_Y + hb + breath, rot = (P.tilt ?? 0) + Math.sin(t * 0.8) * 0.02, q = st.q;
  const bl = ptOf(H, 'neck', H.hornL, 0, hy, rot, 1, st._bl ??= [0, 0]), br = ptOf(H, 'neck', H.hornR, 0, hy, rot, 1, st._br ??= [0, 0]);
  if (f2) {
    if (R.stump) {
      put(D, R.stump, R.stump.v.base, 'c', bl[0] + 4, bl[1] + 2, rot + 0.5, 1);
      put(D, R.stump, R.stump.v.base, 'c', br[0] - 4, br[1] + 2, rot - 0.5, 1, -1, 1);
    }
  } else {
    if (R.hornL) put(D, R.hornL, V(R.hornL), 'base', bl[0], bl[1], rot);
    if (R.hornR) put(D, R.hornR, V(R.hornR), 'base', br[0], br[1], rot);
  }
  put(D, H, V(H), 'neck', 0, hy, rot);
  glowOver(ctx, D, H, lvl, 'neck', 0, hy, rot, 1, 1, 1, 0.9, t, st);
  D.end();
  if (!q.halos) return;
  if (f2) for (const p of [bl, br]) halo(ctx, p[0], p[1] + 4, 16, HOT, 0.8);
  const eg = 0.7 + (P.roar ?? 0) * 0.3 + (f2 ? 0.3 : 0);
  for (const e of [H.eyeL, H.eyeR]) {
    if (!e) continue;
    ptOf(H, 'neck', e, 0, hy, rot, 1, st.lp);
    halo(ctx, st.lp[0], st.lp[1], 16 + (P.roar ?? 0) * 6, RED, eg * 0.8);
    halo(ctx, st.lp[0], st.lp[1], 5, f2 ? '#fff4c0' : '#ffb040', 0.9, true);
  }
  if (H.mouth) {
    ptOf(H, 'neck', H.mouth, 0, hy, rot, 1, st.lp);
    if ((P.roar ?? 0) > 0.2) halo(ctx, st.lp[0], st.lp[1] + 6, 20 + (P.roar ?? 0) * 12, FIRE, (P.roar ?? 0) * 0.8);
    // 쇳물 침 (흘러내리는 방울)
    const dk = (t * 0.6) % 1;
    halo(ctx, st.lp[0] - 6, st.lp[1] + 10 + dk * 24, 5, HOT, 0.8 * (1 - dk * 0.5), true);
  }
}
// ───────────────────────── 균열 발광 ─────────────────────────
function glowOver(ctx, D, part, lvl, pivot, x, y, rot, sc, sxm, sym, a, t, st) {
  if (!st.q.crackGlow || lvl <= 0 || a <= 0.01 || !part) return;
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 ? 1 : 0);
  if (!drawn) return;
  const g = drawn === 2 ? part.gl.dmg2 : part.gl.dmg1;
  if (!g) return;
  const pv = part[pivot], k = part.k * sc;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 3.4 + part.w * 0.01)) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, x, y, rot, k * 2 * sxm, k * 2 * sym, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
  D.end();
}

// ───────────────────────── 파편 ─────────────────────────
function spawnDeb(st, rig, x, y, n, speed, sc = 1, fade = 1.6, up = 1) {
  const L = rig.debs; if (!L?.length) return;
  for (let j = 0; j < n; j++) {
    const p = L[(j * 5 + (x | 0)) % L.length], a = -PI / 2 * up + rr.range(-1.3, 1.3), sp = speed * rr.range(0.4, 1);
    st.shards.spawn(p.v.base, p.c[0], p.c[1], x + rr.range(-16, 16), y + rr.range(-16, 16), rr.next() * TAU, p.k * sc * rr.range(0.5, 0.9) * rr.sign(), p.k * sc * rr.range(0.5, 0.9), Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-8, 8), { r: (p.r ?? 8) * sc * 0.5, fade, bounce: 0.3 });
  }
}
function levelBurst(st, b, rig) {
  spawnDeb(st, rig, b.cx, b.bottom - 170, 5, 320, 0.8, 1.6);
  st.P.burst('ember', b.cx, b.bottom - 170, 20, { speed: 260 });
}
function hornBreak(st, rig, b, tk, Wd) {
  const R = rig.parts;
  for (const [part, s] of [[R.hornL, -1], [R.hornR, 1]]) {
    if (!part) continue;
    const w = Wd(s * 40, HEAD_Y - 96), dir = Math.sign(tk) * s;
    st.shards.spawn(part.v.base, part.base[0], part.base[1], w[0], w[1], 0, part.k * tk, part.k, dir * rr.range(160, 240), -rr.range(260, 360), dir * rr.range(4, 7), { r: 18, fade: 2.4, bounce: 0.35 });
  }
  const w = Wd(0, HEAD_Y - 96);
  spawnDeb(st, rig, w[0], w[1], 6, 300, 0.7, 1.6);
  st.P.burst('ember', w[0], w[1], 26, { speed: 300 });
}
function explodeBurst(st, rig, b, tk, Wd) {
  const R = rig.parts, G = Wd(0, TORSO_Y);
  if (R.grate) st.shards.spawn(R.grate.v.base, R.grate.c[0], R.grate.c[1], G[0], G[1], 0, R.grate.k * tk, R.grate.k, rr.range(-120, 120), -rr.range(420, 560), rr.range(-6, 6), { r: 30, fade: 2.2, bounce: 0.3 });
  if (R.chimney) for (const s of [-1, 1]) {
    const w = Wd(s * (CH_X + 8), CH_Y - 70);
    st.shards.spawn(R.chimney.v.dmg2 ?? R.chimney.v.base, R.chimney.base[0], R.chimney.base[1] * 0.55, w[0], w[1], s * CH_ROT, R.chimney.k * tk, R.chimney.k, s * Math.sign(tk) * rr.range(160, 260), -rr.range(300, 420), s * rr.range(2, 5), { r: 20, fade: 2.2, bounce: 0.3 });
  }
  spawnDeb(st, rig, G[0], G[1], 16, 520, 1, 1.9);
  st.P.burst('ember', G[0], G[1], 60, { speed: 480 });
  st.P.burst('smoke', G[0], G[1], 14, { speed: 160, color: '#1a1010' });
}

// ───────────────────────── 로직이 쓰는 채색 소품 (rig.art) ─────────────────────────
function makeArt(rig) {
  const R = rig.parts, GD = new Drawer();
  return {
    /** 채색 굴뚝 꼭대기 (몸 좌표, 바라보는 쪽 굴뚝 기준 — 반대쪽은 x 부호만 바꾼다). 로직의 굴뚝 불꽃 터짐·굴뚝 조명 자리 */
    chimneyTop: R.chimney?.top ? ptOf(R.chimney, 'base', R.chimney.top, CH_X, CH_Y, CH_ROT, 1, [0, 0]) : null,
    /** 유도 영혼 탄: 짓눌린 영혼 해골 (원점 = 탄 중심, 로직이 둘레 빛을 그린다) */
    soul(ctx, x, y, i, rot = 0, s = 0.6) {
      const L = rig.souls; if (!L.length) return false;
      const p = L[Math.abs(i | 0) % L.length], im = p.v.base, k = p.k * s * 1.4;
      ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
      ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k);
      ctx.restore();
      return true;
    },
    /** 사슬 기둥 (바닥에서 솟구친 사슬 + 갈고리, 솟은 뒤 우상 쪽으로 당겨지는 사슬) */
    chainColumn(ctx, x, F, h, age, ix, iy) {
      if (!R.link) return false;
      const k = clamp(age / 0.12, 0, 1), top = F - h * k;
      GD.begin(ctx);
      if (top < F - 8) chainTiles(GD, R, x, F - 4, x + Math.sin(age * 20) * 1.5, top + 8, 0, 0, 1.1, 30);
      if (age > 0.12) chainTiles(GD, R, x, top + 10, ix, iy, 40 * Math.max(0, 1 - age), 0, 0.9, 40);
      if (R.hook) { const ax = axis(R.hook, 'a', 'c'); GD.part(R.hook, R.hook.v.base, 'a', x, top + 10, -PI / 2 - ax.a, R.hook.k * 1.3, R.hook.k * 1.3); }
      GD.end();
      return true;
    },
  };
}
