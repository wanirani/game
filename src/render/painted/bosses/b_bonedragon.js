// 본 드래곤 (b_bonedragon) — 채색 컷아웃 퍼핏 렌더러 (기준 구현)
// 부품: Kling 으로 그린 두개골(위/경첩 턱) · 척추 몸통 타일 12종 + 등가시 12종(따로 잘라 조합) · 흉곽 · 날개 · 앞다리 · 뼈 파편 7종
// 움직임은 전부 기존 로직(src/game/bosses/a_bonedragon.js)의 상태를 읽기만 한다:
//   Wyrm { pts[0..k] (머리→구멍), k, N, L, hole{x,y,nx,ny}, hx,hy, a(머리 각도), jaw, flare, wing, ext, hidden, scale, soul }
//   boss { heads, main, twin, state, stateT, phase, fury, hp/stats.maxHp, flashT, dying, deathT, t, A.floor, player }
// 상태별 표현: idle(숨쉬기·날개 흔들림) bite(젖힘·돌진 잔상) breath(입 속 불길) boneRain(날개 활짝·떨림) spit
//   burrow(잠수→발밑 분출: 몸통이 구멍 밖으로 솟음, 옛 구멍 흉터) wall(벽 구멍: 몸통이 벽에서, 벽 균열)
//   transform(균열·영혼불 폭주) 쌍두(서리색 틴트, 등장 분출) · 피격 섬광 · 손상 단계 0~2(구운 균열/그을림/찢김 + 단계 상승 파편 폭발)
//   death(머리부터 척추가 한 마디씩 떨어져 나가고 두개골·턱·날개·다리가 튕겨 굴러감, 흉곽은 구멍으로 가라앉음)
// 절차적 그로테스크 층: 척수 힘줄 관(관절 틈 메움) · verlet 힘줄 줄 · 입 속 끈적한 줄 · 체액(ichor) 방울→바닥 튐 · 영혼불 · 재/뼛가루
import { Drawer, Chain, Strand, Particles, DamageState, Shards, halo, puff, rr, hash1, loadRig, pickVariant, quality, drawStrand, angDiff } from '../kit.js';

const DIR = 'painted/bosses/b_bonedragon';
const SOUL = '#6aff8a', TWIN = '#8ac8ff';
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, s) => (v < t ? Math.min(v + s, t) : Math.max(v - s, t));

/** 굽기 옵션 (kit.loadRig def) */
const DEF = {
  glow: SOUL,
  outline: { width: 2.2, color: 'rgba(10,5,6,0.9)' },
  parts: {
    skull_upper: { cracks: 4, holes: 2, flash: true },
    skull_jaw: { cracks: 2, holes: 2, flash: true },
    torso: { deep: 0.9, deepOnly: true, cracks: 4, holes: 3 },
    wing: { deep: 0.74, deepOnly: true, membrane: true, holes: 4, cracks: 2 },
    leg: { deep: 0.8, cracks: 2, holes: 1 },
  },
  prefix: {
    va: { cracks: 2, holes: 1, char: 2 }, vb: { cracks: 2, holes: 1, char: 2 },
    vas: { noDmg: true, outline: 1.8 }, vbs: { noDmg: true, outline: 1.8 },
    deb: { noDmg: true, outline: 1.6 },
  },
  // 쌍두(3페이즈, 체력 30% 미만에서만 등장) → 가장 심한 손상 단계만 서리색으로 굽는다
  tints: { frost: { rules: 'frost', levels: ['dmg2'], glow: TWIN, skip: ['deb'] } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_bonedragon', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    return {
      D: new Drawer(), P: new Particles(quality(boss.world?.game).particles), shards: new Shards(64),
      dmg: new DamageState(boss.def?.phases ?? [0.6, 0.3]), heads: new Map(), lt: null, pf: 0, scars: [],
      q: quality(boss.world?.game), deathBurst: false, twinSeen: false, hitHead: null,
      vert: rig.man.groups.vert, spine: rig.man.groups.spine, debris: rig.man.groups.debris,
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) { return bounds(b, st, out); },
  lights(L, b, rig, st) {
    for (const hs of st.heads.values()) if (hs.coreVis > 0.2 && hs.core) L.add(hs.core[0], hs.core[1], 170, hs.soul, 0.55 * hs.coreVis);
  },
  /** 월드 파편(ABoss.spawnDebris)용 채색 조각 */
  debris(i, rig) {
    const names = rig.man.groups.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.9;
    return { size: Math.max(10, (p.r ?? 10) * 1.2), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 경계 (컬링) ─────────────────────────
function bounds(b, st, out) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = (x, y, r) => { if (x - r < x0) x0 = x - r; if (x + r > x1) x1 = x + r; if (y - r < y0) y0 = y - r; if (y + r > y1) y1 = y + r; };
  for (const h of b.heads ?? []) {
    const s = h.scale ?? 1;
    add(h.hole.x, h.hole.y - (h.hole.ny < 0 ? 200 * s : 0), 380 * s);   // 흉곽·날개 (구멍 위)
    for (let i = 0; i <= h.k; i++) add(h.pts[i].x, h.pts[i].y, 110 * s);
    add(h.hx, h.hy, 190 * s);                                              // 두개골 + 뿔 + 벌린 턱
  }
  if (b.dying > 0 || st?.shards?.list.length) { add(b.A.x0 + b.A.w / 2, b.A.floor - 200, Math.max(b.A.w / 2, 300)); }
  if (x0 > x1) { x0 = b.x - 300; x1 = b.x + b.w + 300; y0 = b.y - 300; y1 = b.y + b.h + 300; }
  out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
  return out;
}

// ───────────────────────── 머리별 상태 ─────────────────────────
function headState(st, h, b, twin) {
  let hs = st.heads.get(h);
  if (hs) return hs;
  const seed = twin ? 977 : 131;
  hs = {
    twin, soul: twin ? TWIN : SOUL, ichor: twin ? '#0b1422' : '#0e1a0b', ichorHi: twin ? '#b8dcff' : '#7dff9a',
    tint: twin ? 'frost' : null, fs: 0, init: false, lx: h.hx, ly: h.hy, spd: 0, jolt: 0, trail: [], chain: new Chain(40),
    hx0: h.hole.x, hy0: h.hole.y, hnx: h.hole.nx, emerge: 0, strands: [], core: null, coreVis: 0,
    tiles: seq(st.vert.length, 40, seed), spines: seq(st.spine.length, 40, seed + 7),
    spJ: Array.from({ length: 40 }, (_, i) => ({ s: 0.78 + hash1(seed + i * 3.7) * 0.42, r: (hash1(seed + i * 5.1) - 0.5) * 0.36, snap: hash1(seed + i * 9.3) < 0.14 })),
    gone: new Uint8Array(40), skullGone: false, jawGone: false, wingGone: false, legGone: false,
    scale: h.scale ?? 1,
  };
  for (let i = 0; i < 5; i++) hs.strands.push(new Strand(7, 7 * (h.scale ?? 1), { g: 900, damp: 0.93, pinB: true }));
  st.heads.set(h, hs);
  return hs;
}
/** 이웃이 겹치지 않는 긴 순열 (타일 반복 무늬 방지) */
function seq(n, len, seed) {
  const out = []; let prev = -1, k = 0;
  while (out.length < len) {
    const perm = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(hash1(seed + k++ * 1.37) * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    if (perm[0] === prev) perm.push(perm.shift());
    out.push(...perm); prev = out[out.length - 1];
  }
  return out;
}

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const R = rig.parts, D = st.D, q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, floor = A.floor;
  const P = st.P;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  // 손상 단계 (사망 중엔 최대)
  const ratio = b.dying > 0 ? 0 : b.hp / b.stats.maxHp;
  const up = st.dmg.update(ratio, dt);
  const dl = b.dying > 0 ? 2 : Math.max(0, st.dmg.level);
  if (up > 0) for (const h of b.heads) if (!h.hidden) levelBurst(P, h, st.heads.get(h), up);
  // 피격 순간
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.hitHead = nearestHead(b);
  // 쌍두 등장 분출
  if (b.twin && !st.twinSeen) { st.twinSeen = true; eruptBurst(P, b.twin.hole.x, b.twin.hole.y, TWIN, '#0b1422', 1.2); }
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';     // 기기 해상도 근처로 구웠으므로 쌍선형이면 충분 (고품질 보간은 큰 스프라이트에서 매우 느림)
  // 옛 구멍 흉터 (잠행·벽 돌격으로 구멍이 옮겨간 자리)
  D.begin(ctx);
  drawScars(ctx, D, st, dt, rig);
  D.end();
  P.draw(ctx, 0);
  if (b.twin) drawHead(ctx, D, b, b.twin, world, rig, st, dt, dl, hit);
  drawHead(ctx, D, b, b.main, world, rig, st, dt, dl, hit);
  st.shards.draw(D);
  D.end();
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

function nearestHead(b) {
  const p = b.player; if (!b.twin || b.twin.hidden || !p) return b.main;
  const da = Math.abs(b.main.hx - p.cx) + Math.abs(b.main.hy - p.cy), db = Math.abs(b.twin.hx - p.cx) + Math.abs(b.twin.hy - p.cy);
  return db < da ? b.twin : b.main;
}

function levelBurst(P, h, hs, level) {
  const soul = hs?.soul ?? SOUL;
  P.burst('chip', h.hx, h.hy, 10 + level * 6, { speed: 380, angle: -PI / 2, spread: 1.4 });
  P.burst('boneDust', h.hx, h.hy, 8, { speed: 90 });
  P.burst('ichor', h.hx, h.hy, 8, { speed: 260, angle: -PI / 2, spread: 1.2, color: hs?.ichor, hi: hs?.ichorHi });
  P.burst('ember', h.hx, h.hy, 14, { speed: 160, color: soul });
  const m = h.pts[Math.floor(h.k / 2)];
  if (m) { P.burst('chip', m.x, m.y, 8, { speed: 260 }); P.burst('boneDust', m.x, m.y, 6, { speed: 70 }); }
}
function eruptBurst(P, x, y, soul, ichor, k = 1, angle = -PI / 2) {
  const ox = Math.cos(angle) * 6, oy = Math.sin(angle) * 6;
  P.burst('chip', x + ox, y + oy, Math.round(18 * k), { speed: 520, angle, spread: 0.9 });
  P.burst('boneDust', x + ox, y + oy, Math.round(12 * k), { speed: 140, angle, spread: 1.1, jitter: 30 });
  P.burst('ichor', x + ox * 2, y + oy * 2, Math.round(8 * k), { speed: 420, angle, spread: 0.8, color: ichor });
  P.burst('ember', x + ox * 2, y + oy * 2, Math.round(16 * k), { speed: 240, angle, spread: 1.0, color: soul });
}

// ───────────────────────── 구멍 흉터 ─────────────────────────
function drawScars(ctx, D, st, dt, rig) {
  const S = st.scars;
  for (let i = S.length - 1; i >= 0; i--) {
    const s = S[i]; s.t += dt;
    const a = clamp(1 - (s.t - 2.2) / 1.2, 0, 1);
    if (a <= 0) { S.splice(i, 1); continue; }
    const rot = s.ny < 0 ? 0 : s.nx > 0 ? -PI / 2 : PI / 2;
    D.img(puff('#000000'), 32, 32, s.x, s.y - 2, rot, 70 * s.s / 32, 12 / 32, 0.8 * a);
    drawRubble(D, rig, st, s.x, s.y, rot, s.s, s.seed, a, true);
  }
}
/** 흙더미 + 작은 뼈 조각 (채색 파편 스프라이트 재사용) */
function drawRubble(D, rig, st, x, y, rot, s, seed, a = 1, flat = false) {
  const deb = st.debris; if (!deb?.length) return;
  const c = Math.cos(rot), sn = Math.sin(rot);
  D.img(puff('#1c1510'), 32, 32, x, y - 1, rot, 118 * s / 32, (flat ? 9 : 17) / 32, 0.95 * a);
  for (let i = 0; i < 7; i++) {
    const u = (i - 3) / 3.3, r1 = hash1(seed + i * 1.7), r2 = hash1(seed + i * 2.3 + 11);
    const p = rig.parts[deb[Math.floor(r1 * deb.length)]];
    const lx = u * 96 * s + (r2 - 0.5) * 14, ly = -2 - (1 - Math.abs(u)) * (flat ? 2 : 7) + r2 * 3;
    const px = x + c * lx - sn * ly, py = y + sn * lx + c * ly;
    const k = p.k * (0.42 + r2 * 0.3) * s * (flat ? 0.8 : 1);
    D.img(p.v.base, p.c[0], p.c[1], px, py, rot + (r1 - 0.5) * 2.4 + (u > 0 ? 1.2 : -1.2), k * (r2 > 0.5 ? 1 : -1), k, a);
  }
}

// ───────────────────────── 머리 하나 (구멍 + 몸 + 목 + 두개골) ─────────────────────────
const _Q = { x: 0, y: 0, a: 0 }, _p0 = [0, 0], _p1 = [0, 0], _p2 = [0, 0];
function drawHead(ctx, D, b, h, world, rig, st, dt, dl, hit) {
  const R = rig.parts, q = st.q, P = st.P;
  const twin = h !== b.main, hs = headState(st, h, b, twin);
  const s = h.scale ?? 1, hole = h.hole, k = h.k, Pt = h.pts, A = b.A;
  const floorHole = hole.ny < 0, nx = hole.nx, ny = hole.ny;
  const soul = hs.soul, tint = hs.tint, t = b.t;
  const dying = b.dying > 0, dT = b.deathT ?? 0;
  const fury = b.fury ?? 0, flare = h.flare ?? 0;
  const transform = b.state === 'transform';
  // 구멍이 옮겨졌다 (잠행 분출 · 벽 돌격): 옛 자리에 흉터, 줄·잔상 초기화, 분출 파편
  if (Math.abs(hole.x - hs.hx0) > 4 || Math.abs(hole.y - hs.hy0) > 4 || hole.nx !== hs.hnx) {
    st.scars.push({ x: hs.hx0, y: hs.hy0, nx: hs.hnx, ny: hs.hnx ? 0 : -1, s, t: 0, seed: (hs.hx0 | 0) % 997 });
    hs.hx0 = hole.x; hs.hy0 = hole.y; hs.hnx = hole.nx; hs.trail.length = 0;
    for (const sd of hs.strands) sd.init = false;
    hs.erupted = false;
  }
  // 분출 순간 (구멍에서 목이 빠르게 뻗어 나옴)
  if (!hs.erupted && h.ext > 60 && (h.extSp ?? 0) > 2000) { hs.erupted = true; eruptBurst(P, hole.x, hole.y, soul, hs.ichor, 1, Math.atan2(ny, nx)); }
  if (h.ext < 20) hs.erupted = false;
  // 방향 (머리가 구멍 어느 쪽에 있나) — 부드럽게 뒤집어 튐 방지
  const side = floorHole ? (Math.sign(h.hx - hole.x) || (hs.fs >= 0 ? 1 : -1)) : nx;
  if (!hs.init) { hs.fs = side; hs.init = true; }
  hs.fs = approach(hs.fs, side, dt * 4.5);
  const fs = hs.fs, fsn = fs >= 0 ? 1 : -1;
  const spd = Math.hypot(h.hx - hs.lx, h.hy - hs.ly) / Math.max(dt, 1 / 120); hs.lx = h.hx; hs.ly = h.hy; hs.spd = lerp(hs.spd, spd, 0.4);
  if (hit && st.hitHead === h) hs.jolt = 1;
  hs.jolt = Math.max(0, hs.jolt - dt * 7);
  const lvl = dl;
  const V = (part, deep) => pickVariant(part, lvl, deep, tint);

  // ── 구멍 (뒤) ──
  D.end();
  const hrot = floorHole ? 0 : nx > 0 ? -PI / 2 : PI / 2;
  D.img(puff('#000000'), 32, 32, hole.x, hole.y - (floorHole ? 2 : 0), hrot, 96 * s / 32, 20 / 32, 0.95);
  if (q.halos) { D.end(); halo(ctx, hole.x - nx * 8, hole.y - (floorHole ? 12 : 0), 120 * s, soul, 0.2 + flare * 0.18 + fury * 0.08); }

  // ── 보이는 쪽만 (바닥 위 / 벽 안쪽) ──
  D.end();
  ctx.save();
  ctx.beginPath();
  if (floorHole) ctx.rect(A.x0 - 800, hole.y - 2000, A.w + 1600, 2000);
  else if (nx < 0) ctx.rect(hole.x - 3000, hole.y - 2000, 3000, 4000);
  else ctx.rect(hole.x, hole.y - 2000, 3000, 4000);
  ctx.clip();

  const C = hs.chain.set(Pt, k);
  const ext = C.length;
  // ── 흉곽: 목 소켓이 체인 위 dS 지점. 나오는 중엔 표면 아래로 가라앉아 있음 ──
  const T = R.torso, dS = 150 * s;
  const fe = clamp((ext - 20) / (1.4 * dS), 0, 1);
  hs.emerge = fe;
  C.at(dS * fe, _Q);
  let qx = _Q.x - nx * (1 - fe) * dS * 0.9, qy = _Q.y - ny * (1 - fe) * dS * 0.9;
  const vx = qx - hole.x, vy = qy - hole.y, vl = Math.hypot(vx, vy);
  let axx = nx, axy = ny;
  if (ext > 40 && vl > 1) { axx = lerp(nx, vx / vl, 0.5); axy = lerp(ny, vy / vl, 0.5); const l = Math.hypot(axx, axy) || 1; axx /= l; axy /= l; }
  if (dying) { const sink = Math.max(0, dT - 0.75); qx -= nx * sink * sink * 240; qy -= ny * sink * sink * 240; }
  const tk = T.k * s, breath = 1 + Math.sin(t * 1.7) * 0.022 + flare * 0.03 + (transform ? Math.sin(t * 30) * 0.012 : 0);
  const tsx = tk * -fs, tsy = tk * breath;
  const tvx = (T.neck[0] - T.base[0]) * (tsx < 0 ? -1 : 1), tvy = T.neck[1] - T.base[1];
  const trot = Math.atan2(axy, axx) - Math.atan2(tvy, tvx) + (hs.jolt > 0 && st.hitHead === h ? 0 : 0);
  const tp = (pv, out) => D.pt(T.neck[0], T.neck[1], pv[0], pv[1], qx, qy, trot, tsx, tsy, out);
  const shN = tp(T.shoulderN, [0, 0]), shF = tp(T.shoulderF, [0, 0]), core = tp(T.core, [0, 0]), legN = tp(T.legN, [0, 0]), legF = tp(T.legF, [0, 0]);
  const baseVis = floorHole ? clamp((hole.y - Math.min(shN[1], shF[1]) - 10) / 60, 0, 1) : clamp((fe - 0.1) / 0.4, 0, 1);
  hs.core = core; hs.coreVis = dying ? 0 : baseVis;

  // ── 날개 ──
  const W = R.wing, open = clamp((h.wing - 0.55) / 0.45, 0, 1);
  const flapK = b.state === 'boneRain' || transform ? 1 : 0.35;
  const flap = Math.sin(t * 2.2 + (twin ? 1.3 : 0)) * 0.07 + Math.sin(t * 11) * 0.1 * flare * flapK;
  const wk = W.k * s, wbase = Math.atan2(axy, axx) + PI / 2;
  const deathW = dying ? Math.max(0, dT - 0.5) : 0;
  const wingOn = !hs.wingGone && baseVis > 0.02;
  const wingDraw = (sh, far) => {
    const mir = -fs * (far ? 0.86 : 1);
    const rot = wbase + (-fsn) * (-0.2 + open * 0.42 + flap + (far ? 0.28 : 0) - deathW * 1.1);
    const sy = wk * (far ? 0.86 : 1) * (0.84 + open * 0.16 + Math.sin(t * 2.2 + 0.6) * 0.04);
    const wa = baseVis * (dying ? clamp(1 - (dT - 0.6) / 0.85, 0, 1) : 1);
    D.part(W, V(W, true), 'root', sh[0], sh[1], rot, wk * mir, sy, wa);
    glowOver(ctx, D, W, lvl, 'root', sh[0], sh[1], rot, wk * mir, sy, 0.35 * wa, st, t, false, tint);
    return rot;
  };
  // ── 앞다리 (구멍 가장자리를 짚음) ──
  const Lg = R.leg;
  const legPlace = (sh, reach, far, out) => {
    let px, py;
    if (floorHole) { px = hole.x + fsn * reach * s; py = hole.y + 4; }
    else { px = hole.x + nx * 20; py = hole.y + (far ? 70 : -90) * s; }
    if (dying) py += Math.max(0, dT - 0.8) * 200;
    const lvx = (Lg.plant[0] - Lg.elbow[0]) * fsn, lvy = Lg.plant[1] - Lg.elbow[1];
    const nat = Math.hypot(lvx, lvy) * Lg.k * s, want = Math.hypot(px - sh[0], py - sh[1]);
    const f = clamp(want / nat, 0.72, 1.3) * (far ? 0.9 : 1);
    out.rot = Math.atan2(py - sh[1], px - sh[0]) - Math.atan2(lvy, lvx);
    out.sx = Lg.k * s * f * (Math.abs(fs) < 0.2 ? fs * 5 : fsn); out.sy = Lg.k * s * f; out.x = sh[0]; out.y = sh[1];
    return out;
  };
  const legDraw = (sh, reach, far) => {
    if (baseVis <= 0.02 || hs.legGone) return;
    const L = legPlace(sh, reach, far, hs._leg ??= {});
    D.part(Lg, V(Lg, far), 'elbow', L.x, L.y, L.rot, L.sx, L.sy, baseVis);
  };
  if (wingOn) wingDraw(shF, true);
  legDraw(legF, 58, true);
  if (wingOn) wingDraw(shN, false);
  // 흉곽 속 영혼불 (뒤)
  if (baseVis > 0.05 && !dying) { D.end(); halo(ctx, core[0], core[1] + 10 * s, 120 * s, soul, 0.3 * baseVis * (0.8 + 0.2 * Math.sin(t * 3.1))); }
  D.part(T, V(T, true), 'neck', qx, qy, trot, tsx, tsy, dying ? clamp(1.9 - dT, 0, 1) : 1);
  glowOver(ctx, D, T, lvl, 'neck', qx, qy, trot, tsx, tsy, 0.5, st, t, transform, tint);
  // 흉곽 안 영혼불 (앞, 가산) + 불씨
  D.end();
  const fireK = (0.75 + fury * 0.5 + flare * 0.4 + (lvl >= 2 ? Math.sin(t * 23) * 0.12 : 0)) * (dying ? clamp(1 - dT, 0, 1) * 1.6 : 1);
  if (baseVis > 0.05 && fireK > 0.02) {
    halo(ctx, core[0], core[1], 70 * s * fireK, soul, 0.26 * baseVis, true);
    soulFlame(ctx, core[0], core[1] + 18 * s, Math.atan2(axy, axx), 58 * s * fireK, 14 * s, t, soul, 0.42 * baseVis, twin ? 5 : 2);
    if (rr.next() < dt * (3 + fury * 4) * q.ambient) P.emit('ember', core[0] + rr.range(-30, 30) * s, core[1] + rr.range(-40, 10) * s, rr.range(-20, 20), rr.range(-80, -30), { color: soul, layer: 1 });
    if (rr.next() < dt * 0.9 * q.ambient) P.emit('smoke', core[0] + rr.range(-50, 50) * s, core[1] - 60 * s, 0, -30, { color: twin ? '#1a2230' : '#1d2a1f', layer: 0 });
  }
  // 구덩이 그림자 (흉곽 잘린 선 가림)
  if (floorHole) D.img(puff('#000000'), 32, 32, hole.x, hole.y, 0, 150 * s / 32, 54 * s / 32, 0.92);
  legDraw(legN, 112, false);

  // ── 목: 척수 관(뒤) → 등가시 → 척추 몸통 타일 (구멍 → 머리) ──
  const F = C.frames();
  const hideBelow = dS * fe - 16;
  const arc = C.arc;
  const tiles = st.vert, spines = st.spine;
  // 척수 힘줄 관: 관절 틈(특히 급하게 굽은 바깥쪽)을 살점으로 메운다
  if (k >= 2) {
    D.end();
    let started = false;
    ctx.beginPath();
    for (let i = k; i >= 0; i--) {
      if (arc[i] < hideBelow - 20 || hs.gone[Math.max(0, i - 1)]) { started = false; continue; }
      if (!started) { ctx.moveTo(Pt[i].x, Pt[i].y); started = true; } else ctx.lineTo(Pt[i].x, Pt[i].y);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = twin ? '#141826' : '#1e0907'; ctx.lineWidth = 30 * s; ctx.stroke();
    ctx.strokeStyle = twin ? '#2c3452' : '#4a1712'; ctx.lineWidth = 17 * s; ctx.stroke();
    ctx.strokeStyle = twin ? 'rgba(150,190,255,0.35)' : 'rgba(170,80,60,0.45)'; ctx.lineWidth = 3 * s; ctx.stroke();
    // 관절마다 영혼불 (틈으로 새어 나옴)
    if (q.halos && !dying) for (let i = k - 1; i > 0; i -= 2) if (arc[i] > hideBelow) halo(ctx, Pt[i].x, Pt[i].y, (20 + F[i].bend * 30) * s, soul, 0.16 + fury * 0.12 + Math.sin(t * 6 + i) * 0.05);
  }
  const u0 = 1 / Math.max(1, h.N);
  const tileX = (i) => {                          // 마디 i 의 타일 배치 계산 → hs._tx[i]
    const f = F[i], tile = rig.parts[tiles[hs.tiles[i]]];
    const tl = tile.jr[0] - tile.jl[0];
    const over = 1.22 + clamp(f.bend, 0, 0.9) * 0.55;   // 굽힘이 클수록 겹침 ↑ (바깥쪽 틈 방지)
    const sx = f.len * over / tl, sy = sx * lerp(0.8, 1.2, i * u0) * s * fs;
    return { tile, f, sx, sy, cx: (tile.jr[0] + tile.jl[0]) / 2, cy: tile.jr[1] };
  };
  const TX = hs._tx ??= [];
  for (let i = k - 1; i >= 0; i--) TX[i] = tileX(i);
  // 등가시 (몸통 뒤)
  for (let i = k - 1; i >= 0; i--) {
    const f = F[i], mid = (arc[i] + arc[i + 1]) / 2;
    if (mid < hideBelow || hs.gone[i]) continue;
    const X = TX[i], sp = rig.parts[spines[hs.spines[i]]], j = hs.spJ[i];
    if (!X.tile.spn) continue;
    D.pt(X.cx, X.cy, X.tile.spn[0], X.tile.spn[1], f.x, f.y, f.a, X.sx, X.sy, _p0);
    const ss = (j.snap ? 0.42 : j.s) * lerp(0.75, 1.15, i * u0) * (lvl >= 2 && j.snap ? 0.8 : 1);
    const sgn = X.sy < 0 ? -1 : 1;
    D.part(sp, V(sp, false), 'base', _p0[0], _p0[1], f.a + j.r * sgn + Math.sin(t * 2 + i) * 0.03 * flare, Math.abs(X.sx) * ss * Math.sign(X.sx), Math.abs(X.sx) * ss * sgn, 1);
  }
  // 척추 몸통 타일
  for (let i = k - 1; i >= 0; i--) {
    const f = F[i], mid = (arc[i] + arc[i + 1]) / 2;
    if (mid < hideBelow || hs.gone[i]) continue;
    const X = TX[i];
    let x = f.x, y = f.y, rot = f.a;
    // 사망: 머리 쪽부터 한 마디씩 떨어져 나간다 (강체 파편으로 넘김)
    if (dying && !hs.gone[i]) {
      const tau = dT - (0.38 + (i / Math.max(1, k)) * 0.7 + hash1(i * 3.1 + (twin ? 5 : 0)) * 0.12);
      if (tau > 0) { detachTile(st, hs, X, i, x, y, rot, V, rig, spines); continue; }
      x += (rr.next() - 0.5) * 3 * Math.min(1, dT * 3); y += (rr.next() - 0.5) * 3 * Math.min(1, dT * 3);
    }
    D.part(X.tile, V(X.tile, false), [X.cx, X.cy], x, y, rot, X.sx, X.sy, 1);
    if (i % 2 === 0) glowOver(ctx, D, X.tile, lvl, [X.cx, X.cy], x, y, rot, X.sx, X.sy, 0.4, st, t + i, false, tint);
    // 체액 방울 (목 아래쪽에서)
    if (!dying && i > 0 && rr.next() < dt * (0.3 + lvl * 0.3) * q.ambient) {
      const ox = -Math.sin(rot) * fsn, oy = Math.cos(rot) * fsn;
      P.emit('ichor', x + ox * 18 * s, y + oy * 18 * s, 0, 0, { color: hs.ichor, hi: hs.ichorHi, hang: rr.range(0.1, 0.35), layer: 1 });
    }
  }
  // 썩은 힘줄 줄 (verlet, 목 아래쪽으로 늘어짐)
  if (!dying && k >= 4) {
    D.end();
    const nS = q.strands > 0 ? Math.round(hs.strands.length * q.strands) : 0;
    for (let j = 0; j < nS; j++) {
      const i = 1 + j * 3; if (i + 2 > k - 1 || arc[i + 2] < hideBelow) break;
      const a0 = F[i], a1 = F[i + 2];
      const o0x = -Math.sin(a0.a) * fsn * 14 * s, o0y = Math.cos(a0.a) * fsn * 14 * s, o1x = -Math.sin(a1.a) * fsn * 14 * s, o1y = Math.cos(a1.a) * fsn * 14 * s;
      const sd = hs.strands[j];
      sd.seg = (Math.hypot(a0.x - a1.x, a0.y - a1.y) * 1.25) / (sd.n - 1);
      sd.step(dt, a0.x + o0x, a0.y + o0y, a1.x + o1x, a1.y + o1y);
      drawStrand(ctx, sd, 4.2 * s, twin ? ['#0c1020', '#2a3458', '#9ab8ff'] : ['#1a0605', '#5e1c12', '#b0604a']);
    }
    if (nS === 0) {  // 저품질: 고정 곡선
      for (let i = 1; i + 2 < k; i += 3) {
        if (arc[i + 2] < hideBelow) break;
        const a0 = Pt[i], a1 = Pt[i + 2], ox = -Math.sin(F[i].a) * fsn, oy = Math.cos(F[i].a) * fsn;
        ctx.beginPath(); ctx.moveTo(a0.x + ox * 14 * s, a0.y + oy * 14 * s);
        ctx.quadraticCurveTo((a0.x + a1.x) / 2 + ox * 22, (a0.y + a1.y) / 2 + oy * 22 + 10, a1.x + ox * 14 * s, a1.y + oy * 14 * s);
        ctx.strokeStyle = '#3a100c'; ctx.lineWidth = 3.5 * s; ctx.stroke();
      }
    }
  }

  // ── 두개골 + 경첩 턱 ──
  if (!hs.skullGone) drawSkull(ctx, D, b, h, hs, rig, st, dt, lvl, hit, V);

  // 피격 섬광 (맞은 머리의 두개골·턱·앞쪽 마디)
  if (b.flashT > 0 && st.hitHead === h && !dying) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.6);
  else { D.rec = false; D.log.length = 0; }
  D.end();
  ctx.restore();   // clip

  // ── 구멍 앞 흙더미 ──
  drawRubble(D, rig, st, hole.x, hole.y, hrot, s, (hole.x | 0) % 997);
  // 벽 구멍: 벽 균열
  if (!floorHole) {
    D.end();
    ctx.strokeStyle = 'rgba(12,8,6,0.85)'; ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + hash1(i + (hole.y | 0)) * 0.6, r0 = 40 * s, r1 = r0 + 30 + hash1(i * 3.3) * 50;
      const x0 = hole.x - nx * 2, y0 = hole.y;
      ctx.moveTo(x0 + Math.cos(a) * r0 * 0.3, y0 + Math.sin(a) * r0);
      ctx.lineTo(x0 + Math.cos(a) * r1 * 0.35 + hash1(i) * 6, y0 + Math.sin(a) * r1);
    }
    ctx.stroke();
  }

  // ── 반응 / 주변 입자 (그리기 전용 난수) ──
  if (hit && st.hitHead === h) {
    P.burst('chip', h.hx, h.hy, 6, { speed: 280 });
    P.burst('boneDust', h.hx, h.hy, 4, { speed: 80 });
    P.burst('ichor', h.hx, h.hy, 5, { speed: 220, angle: -PI / 2, spread: 1.3, color: hs.ichor, hi: hs.ichorHi });
  }
  if (!dying && !h.hidden) {
    if (hs.spd > 700 && rr.next() < dt * 30 * q.ambient) P.emit('boneDust', h.hx + rr.range(-30, 30), h.hy + rr.range(-20, 20), 0, -10, { layer: 1 });
    if (lvl >= 2 && k > 2 && rr.next() < dt * 1.5) { const j = 1 + Math.floor(rr.next() * (k - 2)); P.emit('chip', Pt[j].x, Pt[j].y, rr.range(-40, 40), rr.range(20, 80)); }
    if (rr.next() < dt * 1.2 * q.ambient) P.emit('ash', h.hx + rr.range(-200, 200), h.hy - 200, 0, rr.range(10, 30), { layer: rr.chance(0.5) ? 0 : 1 });
  } else if (dying && !hs.burst && dT > 0.3) {
    hs.burst = true;
    const w = b.world;
    w?.fx?.ring?.(core[0], core[1], { color: soul, r0: 10, r1: 220, life: 0.5, width: 8 });
    P.burst('ember', core[0], core[1], 40, { speed: 300, color: soul });
    P.burst('ichor', core[0], core[1], 16, { speed: 380, angle: -PI / 2, spread: 1.4, color: hs.ichor, hi: hs.ichorHi });
    P.burst('boneDust', core[0], core[1], 14, { speed: 160, jitter: 30 });
    // 채색 뼈 파편이 흉곽에서 튀어 나감
    for (let i = 0; i < 9; i++) {
      const p = rig.parts[st.debris[i % st.debris.length]], a = -PI / 2 + (rr.next() - 0.5) * 2.6, sp = rr.range(260, 560);
      st.shards.spawn(p.v.base, p.c[0], p.c[1], core[0], core[1], rr.next() * TAU, p.k * s * rr.sign(), p.k * s, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-9, 9), { r: (p.r ?? 10) * 0.6, fade: 2.35 - dT });
    }
  }
  if (dying) deathParts(ctx, D, b, h, hs, rig, st, dt, dT, { shN, shF, legN, legF, core, W, wk, fs, fsn, wbase, open, s, baseVis, V, legPlace, qx, qy, trot, tsx, tsy });
}

/** 손상 단계 균열 발광 오버레이 (반 해상도, 가산, 맥동) */
function glowOver(ctx, D, part, lvl, pivot, x, y, rot, sx, sy, a, st, t, boost = false, tint = null) {
  if (!st.q.crackGlow || lvl <= 0) return;
  const g = (tint && part.gl[tint + '_dmg2']) || part.gl[lvl === 1 ? 'dmg1' : 'dmg2'] || part.gl.dmg2;
  if (!g) return;
  const pv = typeof pivot === 'string' ? part[pivot] : pivot;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + part.w * 0.01)) * (boost ? 1.8 : 1) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

/** 영혼불 혀 (가산 퍼프를 방향으로 늘여 겹침 — 채색 배경에 어울리는 부드러운 불) */
function soulFlame(ctx, x, y, ang, len, w, t, color, a, seed = 0) {
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  const img = puff(color, true), img2 = puff(color);
  for (let i = 0; i < 5; i++) {
    const u = i / 4, fl = Math.sin(t * 9 + i * 1.7 + seed) * 0.5 + 0.5;
    const aa = ang + Math.sin(t * 5 + i * 2.1 + seed) * 0.25 * u;
    const d = len * u * (0.8 + fl * 0.3);
    const px = x + Math.cos(aa) * d, py = y + Math.sin(aa) * d - u * len * 0.2;
    const ww = w * (1.4 - u) * (0.8 + fl * 0.4), hh = ww * (1.6 - u * 0.4);
    ctx.globalAlpha = ga * a * (1 - u * 0.65);
    ctx.drawImage(i === 0 ? img : img2, px - ww, py - hh, ww * 2, hh * 2);
  }
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}

// ───────────────────────── 두개골 ─────────────────────────
const _m = [0, 0], _h = [0, 0], _e = [0, 0];
function drawSkull(ctx, D, b, h, hs, rig, st, dt, lvl, hit, V) {
  const R = rig.parts, S = R.skull_upper, J = R.skull_jaw, q = st.q, P = st.P;
  const s = h.scale ?? 1, soul = hs.soul, t = b.t, twin = hs.twin;
  const dying = b.dying > 0, dT = b.deathT ?? 0, fury = b.fury ?? 0, flare = h.flare ?? 0;
  const flip = Math.cos(h.a) < 0 ? -1 : 1;
  const jolt = hs.jolt > 0 && st.hitHead === h ? hs.jolt : 0;
  const hx = h.hx + (jolt ? (rr.next() - 0.5) * 7 * jolt : 0), hy = h.hy + (jolt ? (rr.next() - 0.5) * 7 * jolt : 0);
  const ha = h.a + (jolt ? (rr.next() - 0.5) * 0.08 * jolt : 0);
  const jaw = clamp(h.jaw, 0, 1.1) * 0.62 - S.jawOpen0;
  const ssx = S.k * s, ssy = ssx * flip;
  // 두개골이 떨어져 나가는 순간 (사망)
  if (dying && dT > 0.46 && !hs.skullGone) {
    hs.skullGone = true;
    const vx = (hash1(h.hole.x) - 0.5) * 240 + (hx - h.hole.x) * 0.8;
    st.shards.spawn(V(S, false), S.origin[0], S.origin[1], hx, hy, ha, ssx, ssy, vx, -360, flip * 2.6, { r: 30 * s, bounce: 0.28, fade: 2.35 - dT });
    D.pt(S.origin[0], S.origin[1], S.hinge[0], S.hinge[1], hx, hy, ha, ssx, ssy, _h);
    st.shards.spawn(V(J, false), S.hinge[0], S.hinge[1], _h[0], _h[1], ha + (jaw + 0.6) * flip, ssx, ssy, vx * 1.3 + 90 * flip, -220, -flip * 5, { r: 18 * s, bounce: 0.4, fade: 2.35 - dT });
    P.burst('ember', hx, hy, 20, { speed: 260, color: soul });
    P.burst('boneDust', hx, hy, 8, { speed: 120 });
    return;
  }
  // 빠른 움직임 잔상 (가산 영혼색 실루엣)
  const tr = hs.trail;
  tr.unshift(hx, hy, ha, flip); if (tr.length > 16) tr.length = 16;
  if (q.smear && hs.spd > 650 && hs.spd < 4000 && !dying && !h.hidden) {
    const gk = hs.tint ? hs.tint + '_glow' : 'glow', gi = S.v[gk] ?? S.v.glow;
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    for (let j = 1; j < 4; j++) {
      const o = j * 4; if (tr.length < o + 4) break;
      if (Math.hypot(tr[o] - tr[o - 4], tr[o + 1] - tr[o - 3]) > 70) break;   // 순간이동 (잠행·벽) — 잔상 없음
      D.img(gi, S.origin[0], S.origin[1], tr[o], tr[o + 1], tr[o + 2], ssx, ssx * tr[o + 3], 0.26 / j * clamp((hs.spd - 650) / 600, 0, 1));
    }
    ctx.globalCompositeOperation = op;
  }
  D.pt(S.origin[0], S.origin[1], S.hinge[0], S.hinge[1], hx, hy, ha, ssx, ssy, _h);
  // 입 속 (턱 뒤): 어두운 목구멍 + 입천장 주름 + 끈적한 줄 + 영혼불
  D.set(S.origin[0], S.origin[1], hx, hy, ha, ssx, ssy);
  const U = S.mouthUpper, L = S.mouthLower, hxp = S.hinge[0], hyp = S.hinge[1], jc = Math.cos(jaw), js = Math.sin(jaw);
  ctx.beginPath(); ctx.moveTo(U[0][0], U[0][1]);
  for (const qq of U) ctx.lineTo(qq[0], qq[1] - 6);
  for (let j = L.length - 1; j >= 0; j--) { const qx2 = L[j][0] - hxp, qy2 = L[j][1] - hyp; ctx.lineTo(hxp + qx2 * jc - qy2 * js, hyp + qx2 * js + qy2 * jc); }
  ctx.closePath();
  // 그라디언트는 부품 텍셀 공간 좌표라 한 번 만들어 재사용한다
  if (!st._gm) {
    st._gm = ctx.createLinearGradient(S.hinge[0], 0, U[3][0], 0);
    st._gm.addColorStop(0, 'rgba(6,2,3,0.96)'); st._gm.addColorStop(0.45, 'rgba(26,7,9,0.9)'); st._gm.addColorStop(1, 'rgba(40,10,12,0)');
  }
  ctx.fillStyle = st._gm; ctx.fill();
  const op2 = clamp((jaw + S.jawOpen0 - 0.08) / 0.35, 0, 1);
  if (op2 > 0.12) {
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let r = 1; r < 4; r++) { const qq = U[r]; ctx.moveTo(qq[0] - 14, qq[1] + 2); ctx.quadraticCurveTo(qq[0] - 4, qq[1] + 18, qq[0] + 10, qq[1] + 6); }
    ctx.stroke();
    ctx.restore();
    ctx.lineCap = 'round';
    for (let r = 0; r < 3; r++) {
      const u = U[r + 1], lj = L[r + 2], lx = lj[0] - hxp, ly = lj[1] - hyp;
      const bx = hxp + lx * jc - ly * js, by = hyp + lx * js + ly * jc;
      const mx = (u[0] + bx) / 2 + Math.sin(t * 2 + r) * 3, my = (u[1] + by) / 2 + 10 + op2 * 8;
      const wv = (1.25 - op2 * 0.55) * (r === 1 ? 8 : 5.5);
      ctx.beginPath(); ctx.moveTo(u[0] + (r - 1) * 6, u[1] + 4); ctx.quadraticCurveTo(mx, my, bx, by - 4);
      ctx.strokeStyle = twin ? 'rgba(20,34,52,0.9)' : 'rgba(18,34,14,0.92)'; ctx.lineWidth = wv; ctx.stroke();
      ctx.strokeStyle = twin ? 'rgba(160,210,255,0.55)' : 'rgba(140,255,150,0.5)'; ctx.lineWidth = wv * 0.28; ctx.stroke();
    }
  }
  // 입 속 영혼불 (브레스 · 포효 때 강해짐)
  const breath = b.state === 'breath' && h === b.main;
  const mo = clamp(h.jaw, 0, 1.1) * (0.45 + flare * 0.55) + (breath ? 0.5 : 0);
  if (mo > 0.05) {
    ctx.save(); ctx.clip();
    const gx = U[1][0] + 10, gy = (U[1][1] + L[2][1]) / 2;
    const opx = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * clamp(0.25 + mo * 0.55, 0, 1);
    ctx.drawImage(puff(soul, true), gx - 50 - mo * 40, gy - 50 - mo * 30, 110 + mo * 80, 100 + mo * 60);
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = opx;
    ctx.restore();
  }
  // 턱 → 위 두개골 (피격 섬광 기록)
  const rec = b.flashT > 0 && st.hitHead === h;
  D.rec = rec;
  D.part(J, V(J, false), 'hinge', _h[0], _h[1], ha + jaw * flip, ssx, ssy, 1);
  D.rec = rec;
  D.part(S, V(S, false), 'origin', hx, hy, ha, ssx, ssy, 1);
  D.rec = rec;
  glowOver(ctx, D, S, lvl, 'origin', hx, hy, ha, ssx, ssy, 0.6, st, t, b.state === 'transform', hs.tint);
  const eyeW = D.pt(S.origin[0], S.origin[1], S.eye[0], S.eye[1], hx, hy, ha, ssx, ssy, _e);
  const jawTip = D.pt(S.hinge[0], S.hinge[1], J.tip[0], J.tip[1] + 10, _h[0], _h[1], ha + jaw * flip, ssx, ssy, _m);
  D.end();
  // 눈구멍 영혼불
  const fk = (0.8 + flare * 0.7 + fury * 0.5 + (lvl >= 2 ? 0.3 : 0)) * (dying ? clamp(1.4 - dT * 2, 0, 1) : 1);
  if (fk > 0.02) {
    soulFlame(ctx, eyeW[0], eyeW[1], ha + flip * (-PI / 2 - 0.55), 34 * s * fk, 8 * s, t, soul, 0.6, twin ? 3 : 0);
    halo(ctx, eyeW[0], eyeW[1], 26 * s * fk, soul, 0.75, true);
  }
  // 브레스: 입에서 쏟아지는 불길 (투사체는 로직이 그림, 여기선 입가 불꽃)
  if (breath && b.stateT > 0.2) {
    const m = h.mouth ? h.mouth() : { x: hx, y: hy };
    soulFlame(ctx, m.x, m.y, ha, 70 * s, 20 * s, t, soul, 0.7, 11);
    if (rr.next() < dt * 40 * q.ambient) P.emit('ember', m.x, m.y, Math.cos(ha) * 220 + rr.range(-40, 40), Math.sin(ha) * 220 + rr.range(-40, 40), { color: soul, layer: 1 });
  }
  // 턱에서 떨어지는 체액
  if (!dying && h.jaw > 0.25 && rr.next() < dt * (1.4 + lvl) * q.ambient) P.emit('ichor', jawTip[0], jawTip[1], 0, 0, { color: hs.ichor, hi: hs.ichorHi, hang: rr.range(0.15, 0.4), layer: 1 });
}

// ───────────────────────── 사망 붕괴 ─────────────────────────
function detachTile(st, hs, X, i, x, y, rot, V, rig, spines) {
  hs.gone[i] = 1;
  const s = hs.scale, out = Math.sign(X.sy) || 1;
  const vx = -Math.sin(rot) * -out * rr.range(60, 180) + rr.range(-120, 120), vy = rr.range(-420, -160);
  st.shards.spawn(V(X.tile, false), X.cx, X.cy, x, y, rot, X.sx, X.sy, vx, vy, rr.range(-8, 8), { r: 16 * s, bounce: 0.34, fade: 2.35 - (st._dT ?? 0) });
  const sp = rig.parts[spines[hs.spines[i]]];
  if (X.tile.spn && rr.next() < 0.6) {
    const p = st.D.pt(X.cx, X.cy, X.tile.spn[0], X.tile.spn[1], x, y, rot, X.sx, X.sy, [0, 0]);
    st.shards.spawn(V(sp, false), sp.base[0], sp.base[1], p[0], p[1], rot, Math.abs(X.sx) * Math.sign(X.sx), Math.abs(X.sx) * out, vx * 1.4, vy * 1.2, rr.range(-12, 12), { r: 8 * s, fade: 2.35 - (st._dT ?? 0) });
  }
  st.P.burst('boneDust', x, y, 2, { speed: 60 });
  if (rr.next() < 0.5) st.P.burst('ichor', x, y, 2, { speed: 120, color: hs.ichor, hi: hs.ichorHi });
}
function deathParts(ctx, D, b, h, hs, rig, st, dt, dT, o) {
  st._dT = dT;
  const R = rig.parts, s = o.s;
  // 날개: 접히며(deathW) 막이 재로 부서져 흩어진다 — 큰 날개 통째로 튕기면 어색하므로 재 + 뼈 몇 조각
  if (!hs.wingCrumble && dT > 0.7) {
    hs.wingCrumble = true;
    for (const sh of [o.shF, o.shN]) {
      for (let i = 0; i < 26; i++) st.P.emit(i % 3 ? 'ash' : 'ashLight', sh[0] + o.fsn * rr.range(-40, 220) * s, sh[1] + rr.range(-200, 40) * s, rr.range(-40, 40), rr.range(-60, 30), { layer: 1, size: rr.range(2, 4.5), life: rr.range(1.2, 2.2) });
      for (let i = 0; i < 2; i++) {
        const p = rig.parts[st.debris[(i * 3 + 1) % st.debris.length]];
        st.shards.spawn(p.v.base, p.c[0], p.c[1], sh[0] + o.fsn * rr.range(40, 160) * s, sh[1] - rr.range(40, 140) * s, rr.next() * TAU, p.k * s, p.k * s, o.fsn * rr.range(20, 140), rr.range(-200, -60), rr.range(-6, 6), { r: (p.r ?? 10) * 0.7, fade: 2.35 - dT });
      }
    }
  }
  if (dT > 1.45) hs.wingGone = true;
  // 앞다리: 떨어져 굴러감 (0.8s)
  if (!hs.legGone && dT > 0.8 && o.baseVis > 0.05) {
    hs.legGone = true;
    const Lg = R.leg;
    for (const [sh, reach, far] of [[o.legF, 58, true], [o.legN, 112, false]]) {
      const L = o.legPlace(sh, reach, far, {});
      st.shards.spawn(o.V(Lg, far), Lg.elbow[0], Lg.elbow[1], L.x, L.y, L.rot, L.sx, L.sy, rr.range(-160, 160), rr.range(-300, -120), rr.range(-5, 5), { r: 22 * s, fade: 2.35 - dT });
    }
  }
  // 흉곽이 가라앉는 동안 뼛가루
  if (dT > 0.75 && dT < 2 && rr.next() < dt * 20) st.P.emit('boneDust', h.hole.x + rr.range(-90, 90) * s, h.hole.y - rr.range(0, 30), 0, -40, { layer: 1 });
}
