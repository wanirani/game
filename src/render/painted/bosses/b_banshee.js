// 밴시 여왕 (b_banshee) — 채색 컷아웃 퍼핏 렌더러
// 부품: Kling 으로 그린 두건 쓴 절규하는 얼굴(아래턱 분리) · 해골 얼굴(레퀴엠, 아래턱 분리) · 쇠사슬 감긴 수의(몸) · 뒤로 늘어진 베일+머리칼
//   · 수갑 찬 해골 손 팔 · 사슬 고리 2종 · 두건 쓴 원령(떠도는 영혼) · 파편 5
// 움직임은 전부 기존 로직(src/game/bosses/a_banshee.js)의 값을 읽기만 한다:
//   boss { cx, bottom, facing, lean, arms, armsUp, mouth, skull, alpha, fury, phase, state, stateT, flashT, dying, deathT, t, wrist(s), chainsV[i].pts, A }
// 상태별 표현: idle(떠다니며 수의·베일이 물결) wail(턱이 탈골된 듯 늘어나며 목구멍 청록 발광) chains(두 팔을 치켜듦, 사슬 발광)
//   hands(두 팔을 아래로) phase(흐려졌다 나타남 — 로직 alpha 를 그대로 곱함, 사라질 때 영기) spiral(팔 휘저음) summon·requiem(원령들이 주위를 돎)
//   transform(베일이 치솟고 청록 폭발) · 1페이즈 원한의 사슬(사슬 발광·검은 눈물) · 2페이즈 레퀴엠(얼굴 → 해골 교차, 베일이 치솟음, 레퀴엠 틴트)
//   피격 섬광 · 손상 단계 0~2(구운 균열·얼룩·찢김 + 단계 상승 영기 폭발) · death(턱이 떨어지고 팔이 사슬째 떨어지며 몸이 위로 흩어져 사라짐, 원령 해방)
// 절차적 층: 수의·베일 띠 물결(가로 띠마다 흔들어 그림 — 천의 움직임), 벡터 사슬 대신 채색 사슬 고리(로직 verlet 점을 따라),
//   밑단에서 피어오르는 영기·반딧불, 눈에서 흐르는 검은 눈물(바닥 튐), 입 속 청록 발광
// 좌표: 로직 벡터 그림과 같은 지역 좌표계 (발 중앙 원점, +x = 바라보는 쪽). 로직의 손목 좌표(wrist)는 그림 배율 SC(1.22)를 곱해 쓴다.
import { Drawer, Particles, DamageState, Shards, halo, puff, rr, loadRig, pickVariant, quality, QUALITY } from '../kit.js';

const DIR = 'painted/bosses/b_banshee';
const TEAL = '#5affd0', PALE = '#c0fff4', INK = '#050d0e', INK_HI = '#7affd8';
const PI = Math.PI, TAU = PI * 2, SC = 1.22;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** 실제 적용 품질 등급 (설정이 'auto' 면 조절기가 고른 game.quality/tier) */
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));

// 레퀴엠(2페이즈) 틴트: 청록 → 더 차갑고 밝게, 흰 천 → 푸른 잿빛, 그림자 → 검보라
const REQUIEM_RULES = [
  { when: (h, s, l) => h > 150 && h < 200 && s > 0.25 && l > 0.2, h: 178, s: 1.15, l: 1.08 },
  { when: (h, s, l) => l < 0.16, h: 268, s0: 0.25, l: 0.9 },
  { when: (h, s, l) => l > 0.86, h: 190, s0: 0.08, l: 0.94 },
  { when: () => true, h: 215, s: 0.4, s0: 0.1, l: 0.86 },
];

/** 굽기 옵션 (kit.loadRig def) */
const DEF = {
  glow: TEAL,
  outline: { width: 1.8, color: 'rgba(4,14,16,0.85)' },
  parts: {
    veil: { membrane: true, holes: 3, cracks: 0, char: 1, stain: 'rgb(70,110,110)' },
    body: { flash: true, holes: 2, cracks: 2, char: 1, stain: 'rgb(60,100,100)', crackMinLum: 150 },
    faceU: { flash: true, cracks: 3, char: 1, holes: 0, crackMinLum: 150 },
    faceJ: { flash: true, cracks: 1, holes: 0 },
    skullU: { flash: true, cracks: 4, char: 1, holes: 1, crackMinLum: 150 },
    skullJ: { flash: true, cracks: 1, holes: 0 },
    arm: { flash: true, deep: 0.72, cracks: 2, holes: 1, crackMinLum: 150 },
  },
  prefix: { link: { noDmg: true, outline: 1.2 }, wraith: { noDmg: true, outline: 0 }, deb: { noDmg: true, outline: 1.4 } },
  tints: { requiem: { rules: REQUIEM_RULES, levels: ['dmg2'], glow: '#a8fff0', skip: ['deb', 'link', 'wraith', 'face', 'skull'] } },
};

const NECK_Y = -182, EYE_Y = -214;

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_banshee', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(32), q,
      dmg: new DamageState(boss.def?.phases ?? [0.6, 0.3]), lt: null, pf: 0, lvl: 0, tintK: -1, fs: null, jolt: 0,
      debris: rig.man.groups?.debris ?? [], dead: {}, W: [0, 0], o: {}, wr: [], diss: 0,
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.cx, B = b.bottom;
    let x0 = X - 260, x1 = X + 260, y0 = B - 330, y1 = Math.max(B + 60, (b.A?.floor ?? B) + 10);
    // 손목 사슬 (월드 점)
    for (const ch of b.chainsV ?? []) for (const p of ch.pts) { if (p.x - 20 < x0) x0 = p.x - 20; if (p.x + 20 > x1) x1 = p.x + 20; if (p.y + 20 > y1) y1 = p.y + 20; }
    if (b.dying > 0 || st?.shards?.list.length || st?.wr?.length) { const A = b.A; x0 = Math.min(x0, A.x0 - 40); x1 = Math.max(x1, A.x1 + 40); y0 = Math.min(y0, B - 520); y1 = Math.max(y1, A.floor + 20); }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    const e = st.o.eyeW;
    if (e && !(b.dying > 0 && (b.deathT ?? 0) > 1.2)) L.add(e[0], e[1], 60 + (b.fury ?? 0) * 40, TEAL, 0.5 * (b.alpha ?? 1));
  },
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.9;
    return { size: Math.max(10, (p.r ?? 10) * 1.1), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P, R = rig.parts;
  if (st.rig !== rig) st.rig = rig;
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
  st.tintK = st.tintK < 0 ? ((b.phase ?? 0) >= 2 ? 1 : 0) : approach(st.tintK, (b.phase ?? 0) >= 2 ? 1 : 0, dt * 0.8);
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 6);
  if (st.fs == null) st.fs = b.facing || 1;
  st.fs = approach(st.fs, b.facing || 1, dt * 9);
  const fsx = Math.sign(st.fs || 1) * Math.max(0.12, Math.abs(st.fs));
  const X = b.cx + (b.flashT > 0 ? (rr.next() - 0.5) * 4 : 0), B = b.bottom, lean = (b.lean ?? 0) * 0.6;
  const cl = Math.cos(lean), sl = Math.sin(lean);
  const W = (lx, ly, out = st.W) => { const x = fsx * lx, y = ly + 100; out[0] = X + cl * x - sl * y; out[1] = B - 100 + sl * x + cl * y; return out; };
  st._W = W;
  const alpha = clamp(b.alpha ?? 1, 0, 1);
  // 사망: 몸이 위로 흩어진다 (1.0 s 부터)
  st.diss = dying ? clamp((dT - 0.95) / 1.1, 0, 1) : 0;
  const o = pose(st.o, b, rig, st, t, dT, dying);
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  const ga0 = ctx.globalAlpha;
  // 바닥 그림자 · 역광 (월드)
  D.begin(ctx);
  const alt = clamp((floor - B) / 300, 0, 1);
  if (!st.dead.body) D.img(puff('#000000'), 32, 32, X, floor - 2, 0, 90 * (1 - alt * 0.4) / 32, 12 / 32, 0.45 * (1 - alt * 0.5) * alpha * (1 - st.diss));
  D.end();
  if (q.halos && !st.dead.body) {
    const c = W(0, -140, [0, 0]), tr = b.state === 'transform' ? 1 : 0;
    halo(ctx, c[0], c[1], 190, '#0c3a3a', 0.55 * alpha * (1 - st.diss));
    halo(ctx, c[0], c[1] - 10, 150, TEAL, (0.1 + (b.fury ?? 0) * 0.1 + tr * 0.25) * alpha * (1 - st.diss));
    if ((b.phase ?? 0) >= 2) halo(ctx, c[0], c[1] + 70, 130, '#6a40ff', (0.14 + 0.06 * Math.sin(t * 5)) * alpha * (1 - st.diss));
  }
  if (up > 0 && !dying) levelBurst(P, W, up);
  // 원령 (뒤쪽 반)
  wraiths(ctx, D, b, rig, st, dt, t, X, B, 0, alpha);
  P.draw(ctx, 0);
  // ── 몸 (지역 좌표) ──
  ctx.globalAlpha = ga0 * alpha;
  D.save();
  ctx.beginPath(); ctx.rect(A.x0 - 2000, floor - 3000, A.w + 4000, 3002); ctx.clip();
  ctx.translate(X, B - 100); ctx.rotate(lean); ctx.scale(fsx, 1); ctx.translate(0, 100);
  D.begin(ctx);
  const rec = b.flashT > 0 && !dying;
  D.rec = rec; D.log.length = 0;
  drawFigure(ctx, D, b, rig, st, o, t);
  if (rec) {
    const fa = clamp(b.flashT / 0.1, 0, 1) * 0.65;
    D.flash(fa);
    // 띠로 그린 수의도 섬광
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    drawBody(ctx, D, R.body, R.body.v.flash, o, st, t, fa);
    ctx.globalCompositeOperation = op;
  } else { D.rec = false; D.log.length = 0; }
  D.end();
  D.restore();
  ctx.globalAlpha = ga0;
  // ── 월드: 사슬 · 파편 · 원령(앞) · 입자 ──
  D.begin(ctx);
  if (!st.dead.arms) chains(ctx, D, b, rig, st, o, W, alpha);
  st.shards.draw(D);
  D.end();
  wraiths(ctx, D, b, rig, st, dt, t, X, B, 1, alpha);
  ambient(P, b, st, o, W, dt, q, hit, alpha);
  if (dying) deathFx(D, b, rig, st, o, W, dt, dT, fsx, lean);
  P.draw(ctx, 1);
  ctx.globalAlpha = ga0;
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 자세 ─────────────────────────
function pose(o, b, rig, st, t, dT, dying) {
  const R = rig.parts;
  const m = clamp(b.mouth ?? 0, 0, 1.4), bob = Math.sin(t * 2) * 3;
  o.m = m; o.bob = bob; o.sk = clamp(b.skull ?? 0, 0, 1);
  o.nx = 2; o.ny = NECK_Y + bob * 0.5;
  // 베일 치솟음 (2페이즈 · 변신 · 사망)
  const rise = clamp((b.fury ?? 0) * 0.5 + (b.state === 'transform' ? 0.6 : 0) + (dying ? 0.8 : 0), 0, 1.2);
  o.rise = lerp(o.rise ?? rise, rise, 0.08);
  // 얼굴
  const jolt = st.jolt;
  o.fx = 4; o.fy = EYE_Y + bob * 0.3;
  o.frot = Math.sin(t * 1.3) * 0.04 - m * 0.04 + (jolt ? (rr.next() - 0.5) * 0.14 * jolt : 0);
  // 턱 탈골 (통곡할수록 아래로)
  o.drop = (m - 0.25) * 13 + (dying ? 8 + dT * 8 : 0);
  // 팔: 로직 손목(지역, SC 곱)
  for (const s of [-1, 1]) {
    const w = b.wrist?.(s);
    const k = s < 0 ? 'aL' : 'aR';
    const a = o[k] ??= { tx: 0, ty: 0 };
    if (w) { a.tx = w.x * SC; a.ty = w.y * SC; } else { a.tx = s * 50; a.ty = -120; }
  }
  return o;
}

/** 수의(몸): 허리 아래를 가로 띠로 흔들어 그린다. img = 그릴 변형 (섬광 포함) */
function drawBody(ctx, D, Bd, img, o, st, t, a) {
  if (!img) return;
  const k = Bd.k, drag = -(st._lean ?? 0) * 30 / k;
  const n = st.q.name === 'low' ? 5 : 9;
  const u0 = Bd.waist[1] / Bd.h;
  const amp = (3.5 + (o.rise ?? 0) * 3) / k;
  warp(ctx, D, img, Bd, Bd.neck, o.nx, o.ny, 0, k, k * (1 + Math.sin(t * 2.1) * 0.01), a, n, u0, amp, t * 2.6, 5.2, drag, st.diss);
}
/** 가로 띠 흔들기: 띠 i 는 u(0 위→1 아래)에 따라 x 로 sin 흔들림 + 끌림, diss(사망)면 위쪽으로 흩어지며 흐려짐 */
function warp(ctx, D, img, p, pv, x, y, rot, sx, sy, a, n, u0, amp, ph, freq, drag, diss = 0) {
  if (a <= 0.004) return;
  D.set(pv[0], pv[1], x, y, rot, sx, sy);
  const H = img.height, Wd = img.width, y0 = Math.max(0, Math.min(H - 2, u0 * H));
  const ga = ctx.globalAlpha;
  if (y0 > 1) {
    ctx.globalAlpha = ga * a * (1 - diss);
    if (diss > 0) ctx.drawImage(img, 0, 0, Wd, y0 + 1, 0, -diss * 60, Wd, y0 + 1);
    else ctx.drawImage(img, 0, 0, Wd, y0 + 1, 0, 0, Wd, y0 + 1);
  }
  const hh = (H - y0) / n;
  for (let i = 0; i < n; i++) {
    const sy0 = y0 + i * hh, u = (sy0 + hh * 0.5) / H;
    const uu = (u - u0) / Math.max(0.01, 1 - u0);
    const dx = Math.sin(ph + uu * freq) * amp * Math.pow(uu, 1.3) + drag * uu * uu;
    const da = diss > 0 ? clamp(1 - diss * (1.6 - uu), 0, 1) : 1;
    if (da <= 0.01) continue;
    ctx.globalAlpha = ga * a * da;
    ctx.drawImage(img, 0, sy0, Wd, hh + 1, dx, sy0 - diss * (40 + uu * 90), Wd, hh + 1);
  }
  ctx.globalAlpha = ga;
}
/** 부품 (레퀴엠 틴트 교차 페이드) */
function part(D, st, p, pivot, x, y, rot, sx, sy, a = 1, deep = false, tintable = true) {
  const tk = tintable ? st.tintK : 0;
  if (tk < 0.999) D.part(p, pickVariant(p, st.lvl, deep, null), pivot, x, y, rot, sx, sy, a);
  if (tk > 0.001) D.part(p, pickVariant(p, st.lvl, deep, 'requiem'), pivot, x, y, rot, sx, sy, a * tk);
}
const _a = [0, 0], _b = [0, 0], _c = [0, 0];

function drawFigure(ctx, D, b, rig, st, o, t) {
  const R = rig.parts, Bd = R.body, V = R.veil, dead = st.dead;
  const diss = st.diss;
  st._lean = (b.lean ?? 0) * Math.sign(st.fs || 1);   // 지역(뒤집힌) 좌표에서의 끌림 방향
  // 머리 위치 (지역): 얼굴 top 점 → 베일 고정점
  const F = R.faceU, fk = F.k;
  const top = D.pt(F.eyes[0], F.eyes[1], F.top[0], F.top[1], o.fx, o.fy, o.frot, fk, fk, _a);
  // ── 베일 + 머리칼 (뒤) ──
  if (!dead.body) {
    const vk = V.k, rise = o.rise;
    const img = pickVariant(V, st.lvl, false, st.tintK > 0.5 ? 'requiem' : null);
    const va = 0.9 * (1 - diss * 0.6);
    warp(ctx, D, img, V, V.top, top[0] - 2, top[1] + 4 - rise * 6, Math.sin(t * 0.9) * 0.03, vk * (1 + rise * 0.22), vk * (1 - rise * 0.1), va, st.q.name === 'low' ? 5 : 10, 0.18, (6 + rise * 8) / vk, t * 1.8, 4.2, -st._lean * 40 / vk, diss);
  }
  // ── 뒤쪽 팔 (s = -1) ──
  if (!dead.arms) arm(ctx, D, b, rig, st, o, -1, t);
  // ── 수의 ──
  if (!dead.body) {
    const tk = st.tintK;
    if (tk < 0.999) drawBody(ctx, D, Bd, pickVariant(Bd, st.lvl, false, null), o, st, t, 1);
    if (tk > 0.001) drawBody(ctx, D, Bd, pickVariant(Bd, st.lvl, false, 'requiem'), o, st, t, tk);
    glowOver(ctx, D, st, Bd, 'neck', o.nx, o.ny, 0, Bd.k, Bd.k, 0.4, t, b);
    // 허리 사슬 발광 (원한의 사슬)
    if ((b.phase ?? 0) >= 1 && st.q.halos) {
      const w = D.pt(Bd.neck[0], Bd.neck[1], Bd.waist[0], Bd.waist[1], o.nx, o.ny, 0, Bd.k, Bd.k, _b);
      D.end(); halo(ctx, w[0], w[1] + 6, 34, TEAL, (0.22 + 0.1 * Math.sin(t * 6)) * (1 - diss));
    }
  }
  // ── 얼굴 / 해골 ──
  if (!dead.head) face(ctx, D, b, rig, st, o, t);
  // ── 앞쪽 팔 (s = +1) ──
  if (!dead.arms) arm(ctx, D, b, rig, st, o, 1, t);
}

/** 팔 하나: 어깨 → 로직 손목 방향으로 회전·길이 맞춤 (채색 수갑 = 로직 사슬 고정점) */
function arm(ctx, D, b, rig, st, o, s, t) {
  const R = rig.parts, Bd = R.body, Ar = R.arm;
  const shp = Bd[s < 0 ? 'shoulderL' : 'shoulderR'];
  const sh = D.pt(Bd.neck[0], Bd.neck[1], shp[0], shp[1], o.nx, o.ny, 0, Bd.k, Bd.k, _b);
  const a = s < 0 ? o.aL : o.aR;
  const mir = s < 0 ? -1 : 1;
  const dx0 = Ar.wrist[0] - Ar.shoulder[0], dy0 = Ar.wrist[1] - Ar.shoulder[1];
  const nat = Math.hypot(dx0, dy0) * Ar.k;
  const dist = Math.hypot(a.tx - sh[0], a.ty - sh[1]);
  const L = clamp(dist / nat, 0.78, 1.3);
  const rot = Math.atan2(a.ty - sh[1], a.tx - sh[0]) - Math.atan2(dy0, mir * dx0);
  const sx = Ar.k * L * mir, sy = Ar.k * (0.92 + 0.08 * L);
  const far = s < 0;
  part(D, st, Ar, 'shoulder', sh[0], sh[1], rot, sx, sy, far ? 0.92 : 1, far);
  glowOver(ctx, D, st, Ar, 'shoulder', sh[0], sh[1], rot, sx, sy, 0.35, t + s, b);
  // 사슬 고정점 (지역 → 월드는 chains 에서)
  const c = D.pt(Ar.shoulder[0], Ar.shoulder[1], Ar.chainAt[0], Ar.chainAt[1], sh[0], sh[1], rot, sx, sy, s < 0 ? (o.cL ??= [0, 0]) : (o.cR ??= [0, 0]));
  void c;
  const hnd = D.pt(Ar.shoulder[0], Ar.shoulder[1], Ar.hand[0], Ar.hand[1], sh[0], sh[1], rot, sx, sy, s < 0 ? (o.hL ??= [0, 0]) : (o.hR ??= [0, 0]));
  void hnd;
  // 사망 파편용 배치 기록
  const rec = s < 0 ? (o.armL ??= {}) : (o.armR ??= {});
  rec.x = sh[0]; rec.y = sh[1]; rec.rot = rot; rec.sx = sx; rec.sy = sy; rec.far = far;
}

/** 얼굴 ↔ 해골 (교차) + 탈골되는 아래턱 + 입 속 + 눈 */
function face(ctx, D, b, rig, st, o, t) {
  const R = rig.parts, sk = o.sk, m = o.m;
  const layers = sk < 0.02 ? 1 : sk > 0.98 ? 2 : 3;
  // 입 속 (두 얼굴 공통, 뒤에): 검은 목구멍 + 청록 발광
  const F = (layers & 1) ? R.faceU : R.skullU, fk = F.k;
  const mt = D.pt(F.eyes[0], F.eyes[1], F.mouth[0], F.mouth[1], o.fx, o.fy, o.frot, fk, fk, _a);
  const jt = D.pt(F.eyes[0], F.eyes[1], F.chin[0], F.chin[1], o.fx, o.fy, o.frot, fk, fk, _c);
  const mh = (jt[1] - mt[1]) * 0.5 + Math.max(0, o.drop) * 0.6;
  D.end();
  ctx.fillStyle = '#020606';
  ctx.beginPath(); ctx.ellipse(mt[0], mt[1] + mh * 0.8, 5.4, mh, 0, 0, TAU); ctx.fill();
  const wail = (b.state === 'wail' || b.state === 'requiem' || b.state === 'transform' || b.dying > 0) ? m : m * 0.5;
  if (wail > 0.3 && st.q.halos) halo(ctx, mt[0], mt[1] + mh * 0.8, 20 * wail, TEAL, 0.45 * wail * (1 - st.diss), true);
  for (const which of [1, 2]) {
    if (!(layers & which)) continue;
    const U = which === 1 ? R.faceU : R.skullU, J = which === 1 ? R.faceJ : R.skullJ;
    const a = which === 1 ? 1 - sk : sk;
    const k = U.k;
    // 아래턱 (탈골)
    if (!st.dead.jaw) {
      const jp = D.pt(U.eyes[0], U.eyes[1], U.jawTop[0], U.jawTop[1], o.fx, o.fy, o.frot, k, k, _b);
      const dd = o.drop * (which === 2 ? 1.2 : 1);
      part(D, st, J, 'jawTop', jp[0] - Math.sin(o.frot) * dd, jp[1] + Math.cos(o.frot) * dd, o.frot + Math.sin(t * 7) * 0.02 * m, k, k * (1 + Math.max(0, o.drop) * 0.012), a, false, false);
    }
    part(D, st, U, 'eyes', o.fx, o.fy, o.frot, k, k, a, false, false);
    glowOver(ctx, D, st, U, 'eyes', o.fx, o.fy, o.frot, k, k, 0.5 * a, t, b);
  }
  // 눈 (청록 불) — 두 얼굴의 눈 위치가 같도록 맞춰 둠
  const E = R.faceU;
  const eL = D.pt(E.eyes[0], E.eyes[1], E.eyeL[0], E.eyeL[1], o.fx, o.fy, o.frot, E.k, E.k, o.eyeLl ??= [0, 0]);
  const eR = D.pt(E.eyes[0], E.eyes[1], E.eyeR[0], E.eyeR[1], o.fx, o.fy, o.frot, E.k, E.k, o.eyeRl ??= [0, 0]);
  D.end();
  const ec = sk > 0.5 ? PALE : TEAL, fury = b.fury ?? 0;
  const ek = (0.8 + fury * 0.5 + (b.state === 'transform' ? 0.5 : 0)) * (1 - st.diss);
  if (ek > 0.02) { halo(ctx, eL[0], eL[1], (6 + fury * 4) * ek, ec, 0.9, true); halo(ctx, eR[0], eR[1], (6 + fury * 4) * ek, ec, 0.9, true); }
  const W = st._W;
  if (W) { o.eyeW = W((eL[0] + eR[0]) / 2, eL[1], o.eyeW ?? [0, 0]); o.eLW = W(eL[0], eL[1] + 3, o.eLW ?? [0, 0]); o.eRW = W(eR[0], eR[1] + 3, o.eRW ?? [0, 0]); o.mouthW = W(mt[0], mt[1] + mh, o.mouthW ?? [0, 0]); o.hemW = W(o.nx, o.ny + 190, o.hemW ?? [0, 0]); }
}

/** 손상 단계 균열 발광 (반 해상도, 가산, 맥동) */
function glowOver(ctx, D, st, p, pivot, x, y, rot, sx, sy, a, t, b) {
  const lvl = st.lvl;
  if (!st.q.crackGlow || lvl <= 0 || !p.gl) return;
  const drawn = lvl >= 2 ? 2 : (p.v.dmg1 || p.v.deep_dmg1) ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? ((st.tintK > 0.5 && p.gl.requiem_dmg2) || p.gl.dmg2) : p.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? p[pivot] : pivot;
  const boost = b.state === 'transform' ? 1.8 : 1 + (b.fury ?? 0) * 0.4;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 3.6 + p.w * 0.01)) * boost * (lvl > 1 ? 1.1 : 0.8) * (1 - st.diss);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - p.pad) * 0.5, (pv[1] - p.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 사슬 (월드, 로직 verlet 점을 따라 채색 고리) ─────────────────────────
function chains(ctx, D, b, rig, st, o, W, alpha) {
  const R = rig.parts, L0 = R.link0, L1 = R.link1;
  const glowK = (b.phase ?? 0) >= 1 ? 1 : 0.45;
  for (let i = 0; i < (b.chainsV?.length ?? 0); i++) {
    const s = i ? 1 : -1, pts = b.chainsV[i].pts, n = pts.length;
    const cl = s < 0 ? o.cL : o.cR;
    if (!cl || n < 2) continue;
    const c0 = W(cl[0], cl[1], _a);
    const ddx = c0[0] - pts[0].x, ddy = c0[1] - pts[0].y;
    let px = c0[0], py = c0[1];
    for (let j = 1; j < n; j++) {
      const f = 1 - j / (n - 1);
      const qx = pts[j].x + ddx * f, qy = pts[j].y + ddy * f;
      const dx = qx - px, dy = qy - py, len = Math.hypot(dx, dy) || 1;
      // 고리 굵기는 고정, 늘어난 마디는 고리를 여러 개 이어 붙인다 (순간이동 직후 늘어난 사슬이 굵어지지 않게)
      const tl = L0.r[0] - L0.l[0], nom = tl * L0.k * 0.62;
      const m = Math.max(1, Math.min(12, Math.round(len / nom))), ang = Math.atan2(dy, dx);
      for (let u = 0; u < m; u++) {
        const Lk = (j + u) % 2 ? L0 : L1, f0 = (u + 0.5) / m;
        const sx = Math.min(len / m * 1.35 / tl, Lk.k * 0.9);
        D.img(Lk.v.base, Lk.c[0], Lk.c[1], px + dx * f0, py + dy * f0, ang, sx, Lk.k * ((j + u) % 2 ? 0.62 : 0.5), alpha);
      }
      px = qx; py = qy;
    }
    D.end();
    if (st.q.halos) halo(ctx, px, py, 16 + glowK * 8, TEAL, (0.25 + 0.35 * glowK + 0.1 * Math.sin(b.t * 7 + i)) * alpha * (1 - st.diss));
    const ce = s < 0 ? (o.chainEndL ??= [0, 0]) : (o.chainEndR ??= [0, 0]);   // 프레임마다 배열을 새로 만들지 않는다
    ce[0] = px; ce[1] = py;
  }
}

// ───────────────────────── 원령 (두건 쓴 영혼들이 주위를 돎) ─────────────────────────
function wraiths(ctx, D, b, rig, st, dt, t, X, B, layer, alpha) {
  const Wr = rig.parts.wraith; if (!Wr) return;
  const s = b.state, dying = b.dying > 0;
  const want = dying ? 0 : (s === 'summon' || s === 'requiem' || s === 'transform') ? 1 : (b.phase ?? 0) >= 2 ? 0.45 : 0;
  st.wk = approach(st.wk ?? 0, want, dt * 1.6);
  const n = 4;
  D.begin(ctx);
  if (st.wk > 0.01) {
    for (let i = 0; i < n; i++) {
      const a = t * (0.9 + i * 0.07) + i * TAU / n;
      const front = Math.sin(a) > 0 ? 1 : 0;
      if (front !== layer) continue;
      const r = 120 + Math.sin(t * 1.3 + i) * 18 + (s === 'requiem' ? 60 : 0);
      const x = X + Math.cos(a) * r, y = B - 150 + Math.sin(a * 2 + i) * 30 - Math.sin(a) * 18;
      const k = Wr.k * (0.8 + front * 0.25) * (1 + Math.sin(t * 3 + i) * 0.05);
      D.img(Wr.v.base, Wr.c[0], Wr.c[1], x, y, Math.cos(a) * 0.25, k * (Math.cos(a) > 0 ? -1 : 1), k, st.wk * (0.28 + front * 0.2) * alpha);
    }
  }
  // 사망: 해방된 원령들이 위로 날아오름
  if (layer === 1 && st.wr.length) {
    for (let i = st.wr.length - 1; i >= 0; i--) {
      const w = st.wr[i]; w.t += dt; w.x += w.vx * dt; w.y += w.vy * dt; w.vy -= 60 * dt;
      const a = clamp(1 - w.t / 1.8, 0, 1);
      if (a <= 0) { st.wr.splice(i, 1); continue; }
      const k = Wr.k * w.s;
      D.img(Wr.v.base, Wr.c[0], Wr.c[1], w.x, w.y, Math.sin(w.t * 3 + i) * 0.2, k * w.f, k, a * 0.6);
    }
  }
  D.end();
}

// ───────────────────────── 입자 ─────────────────────────
function levelBurst(P, W, level) {
  const c = W(0, -150, [0, 0]);
  P.burst('smoke', c[0], c[1], 10 + level * 4, { speed: 120, color: '#0f3a38' });
  P.burst('spore', c[0], c[1], 20 + level * 6, { speed: 180, color: TEAL });
  P.burst('ichor', c[0], c[1] - 30, 8, { speed: 220, angle: -PI / 2, spread: 1.3, color: INK, hi: INK_HI });
}
function ambient(P, b, st, o, W, dt, q, hit, alpha) {
  if (b.dying > 0) return;
  const amb = q.ambient * alpha, t = b.t;
  // 밑단에서 피어오르는 영기 · 반딧불
  if (rr.next() < dt * 6 * amb) { const p = W(rr.range(-28, 28), rr.range(-20, 10), [0, 0]); P.emit('smoke', p[0], p[1], rr.range(-10, 10), rr.range(-40, -15), { color: rr.chance(0.5) ? '#1c4a4a' : '#2a6a66', layer: rr.chance(0.5) ? 0 : 1 }); }
  if (rr.next() < dt * 9 * amb) { const p = W(rr.range(-40, 40), rr.range(-60, 10), [0, 0]); P.emit('spore', p[0], p[1], rr.range(-15, 15), rr.range(-50, -20), { color: TEAL, layer: 1 }); }
  // 검은 눈물 (1페이즈 이상 · 통곡)
  const tears = ((b.phase ?? 0) >= 1 ? 1.2 : 0.3) + (o.m > 0.8 ? 1 : 0);
  if (o.eLW && rr.next() < dt * tears * amb) { const e = rr.chance(0.5) ? o.eLW : o.eRW; P.emit('ichor', e[0], e[1] + 4, 0, 0, { color: INK, hi: INK_HI, hang: rr.range(0.3, 0.8), layer: 1 }); }
  // 통곡: 입에서 영기 분출
  if ((b.state === 'wail' || b.state === 'requiem') && o.m > 0.9 && o.mouthW && rr.next() < dt * 16 * amb) P.emit('smoke', o.mouthW[0], o.mouthW[1], rr.range(-40, 40), rr.range(-20, 30), { color: '#2a7a70', layer: 1 });
  if (b.state === 'transform' && rr.next() < dt * 30 * amb) { const p = W(rr.range(-60, 60), rr.range(-230, -20), [0, 0]); P.emit('spore', p[0], p[1], rr.range(-80, 80), rr.range(-140, -40), { color: rr.chance(0.5) ? TEAL : PALE, layer: 1 }); }
  if (b.state === 'phase' && rr.next() < dt * 20) { const p = W(rr.range(-40, 40), rr.range(-220, 0), [0, 0]); P.emit('smoke', p[0], p[1], rr.range(-30, 30), rr.range(-30, 10), { color: '#1c4a4a', layer: 1 }); }
  if (hit) {
    const p = W(rr.range(-10, 10), rr.range(-170, -110), [0, 0]);
    P.burst('spore', p[0], p[1], 10, { speed: 200, color: TEAL });
    P.burst('smoke', p[0], p[1], 3, { speed: 60, color: '#1c4a4a' });
  }
}

// ───────────────────────── 사망 ─────────────────────────
// 0.35s 영기 폭발 · 0.6s 아래턱이 떨어짐 · 0.85s 두 팔이 사슬째 떨어짐 · 0.95~2.0s 몸·베일이 위로 흩어짐 · 1.25s 얼굴이 깨져 조각 · 원령 해방
function deathFx(D, b, rig, st, o, W, dt, dT, fsx, lean) {
  const R = rig.parts, P = st.P, dead = st.dead;
  const fade = 2.35 - dT;
  const shard = (p, img, pivot, lx, ly, lrot, sx, sy, vx, vy, vr, r, bounce = 0.3) => {
    const w = W(lx, ly, [0, 0]);
    const pv = typeof pivot === 'string' ? p[pivot] : pivot;
    st.shards.spawn(img, pv[0], pv[1], w[0], w[1], fsx < 0 ? lean - lrot : lean + lrot, sx * Math.sign(fsx), sy, vx, vy, vr, { r, bounce, fade });
  };
  if (!st.dBurst && dT > 0.35) {
    st.dBurst = true;
    const c = W(0, -150, [0, 0]);
    b.world?.fx?.ring?.(c[0], c[1], { color: TEAL, r0: 10, r1: 220, life: 0.5, width: 7 });
    P.burst('spore', c[0], c[1], 40, { speed: 320, color: TEAL });
    P.burst('smoke', c[0], c[1], 14, { speed: 140, color: '#1c4a4a' });
    P.burst('ichor', c[0], c[1], 14, { speed: 300, angle: -PI / 2, spread: 1.4, color: INK, hi: INK_HI });
  }
  if (!dead.jaw && dT > 0.6) {
    dead.jaw = true;
    const U = o.sk > 0.5 ? R.skullU : R.faceU, J = o.sk > 0.5 ? R.skullJ : R.faceJ, k = U.k;
    const jp = D.pt(U.eyes[0], U.eyes[1], U.jawTop[0], U.jawTop[1], o.fx, o.fy, o.frot, k, k, [0, 0]);
    shard(J, pickVariant(J, 2), 'jawTop', jp[0], jp[1] + o.drop, o.frot, k, k, fsx * rr.range(40, 120), -160, fsx * 5, 8, 0.4);
  }
  if (!dead.arms && dT > 0.85) {
    dead.arms = true;
    const Ar = R.arm;
    for (const a of [o.armL, o.armR]) if (a) shard(Ar, pickVariant(Ar, 2, a.far), 'shoulder', a.x, a.y, a.rot, a.sx, a.sy, rr.range(-120, 120), rr.range(-260, -100), rr.range(-5, 5), 16, 0.25);
    for (const e of [o.chainEndL, o.chainEndR]) if (e) P.burst('spore', e[0], e[1], 10, { speed: 160, color: TEAL });
  }
  if (!dead.head && dT > 1.25) {
    dead.head = true;
    const c = W(o.fx, o.fy + 10, [0, 0]);
    for (let i = 0; i < 6; i++) {
      const p = R[st.debris[i % st.debris.length]]; if (!p) continue;
      const a = -PI / 2 + (rr.next() - 0.5) * 2.2, sp = rr.range(200, 440);
      st.shards.spawn(p.v.base, p.c[0], p.c[1], c[0], c[1], rr.next() * TAU, p.k * rr.sign(), p.k, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-8, 8), { r: (p.r ?? 10) * 0.6, fade });
    }
    P.burst('spore', c[0], c[1], 30, { speed: 260, color: PALE });
    // 원령 해방
    for (let i = 0; i < 5; i++) st.wr.push({ x: c[0] + rr.range(-30, 30), y: c[1] + rr.range(-20, 40), vx: rr.range(-120, 120), vy: rr.range(-160, -60), t: 0, s: rr.range(0.7, 1.1), f: rr.sign() });
  }
  if (!dead.body && dT > 2.05) dead.body = true;
  // 흩어지는 동안 영기가 위로 솟음
  if (st.diss > 0 && st.diss < 1 && rr.next() < dt * 40) { const p = W(rr.range(-50, 50), rr.range(-230, 10), [0, 0]); P.emit(rr.chance(0.6) ? 'smoke' : 'spore', p[0], p[1], rr.range(-30, 30), rr.range(-120, -40), { color: rr.chance(0.5) ? '#2a6a66' : TEAL, layer: 1 }); }
  if (dT < 1.2 && rr.next() < dt * 20) { const p = W(rr.range(-30, 30), rr.range(-200, -100), [0, 0]); P.emit('spore', p[0], p[1], rr.range(-100, 100), rr.range(-160, -20), { color: TEAL, layer: 1 }); }
}
