// 혼돈의 군주 (b_chaos) — 채색 컷아웃 퍼핏 렌더러 (정면을 보는 우주적 존재)
// 부품 (Kling): 가시 왕관의 흑요석 두개골 머리(분리된 턱 — 아가리가 열리면 아래로 벌어짐) · 가시 돋친 어깨와 별빛 눈이 박힌 몸통
//   (아래로 촉수 덩어리) · 눈 박힌 흑요석 발톱 팔(좌우 = 거울) · 곧은 촉수(체인 타일 6개: 몸 아래 촉수 · 바닥에서 솟는 공허 촉수) ·
//   떠다니는 눈알(흰자 · 세로 동공 홍채 · 파열된 눈) · 흑요석 파편 10종 · 부서진 왕관 2 · 결정 심장(핵) ·
//   옛 보스의 그림자 5종(레비아탄·태엽 거신·서리 여왕·사신·드라큘라).
// 절차적 층: 공허 소용돌이(어두운 원판 + 보라 발광 + 별 반짝임) · 눈빛 · 세 번째 눈 · 핵 노출 맥동 · 글리치(가로 조각 어긋남 +
//   색 분리 실루엣) · 궤도 결정 파편 · 눈 줄기(촉수 끝) · 손상 균열 발광 · 사망(눈이 터지고 → 팔이 떨어지고 → 내파: 왕관·머리·심장이 산산이).
// 로직(src/game/bosses/b_chaos.js)의 상태를 읽기만 한다:
//   boss { cx, cy, t, st, state, phase, hp/stats.maxHp, flashT, hitPart, core, eyes[{x,y,open,look,dead,hp,laser,part}], shards[{a,r,s,z,rot}],
//          shadows[{kind,x,y,t,life,warn,d,st,f}], mouth, third, glitch, exposed, dying, _implode, A{floor,x0,x1} }
// 판정은 바꾸지 않는다: 핵 110×110 (얼굴에 맞춤) · 눈 40×40 (그림 지름 ≈ 40) · 접촉 100×110. 팔·촉수·왕관은 그림만.
import { Drawer, Particles, Shards, halo, puff, rr, hash1, loadRig, pickVariant, quality, QUALITY, ledgesOver } from '../kit.js';

const DIR = 'painted/bosses/b_chaos';
const VIOLET = '#b060ff', VIOLET_L = '#e2c4ff', MAGENTA = '#ff3ad8', VOID = '#07030e';
const SHADOW_EYES = { lev: '#5fe8ff', col: '#ff9a3a', fq: '#bff4ff', death: '#7dffb0', drac: '#ff2a3a' };
const ECHO = { lev: 'echo0', col: 'echo1', fq: 'echo2', death: 'echo3', drac: 'echo4' };
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const tierOf = (game) => { const t = game?.quality ?? game?.tier ?? game?.settings?.quality; return QUALITY[t] ? t : quality(game).name; };
const qualityOf = (game) => QUALITY[tierOf(game)];

const DEF = {
  glow: MAGENTA,
  outline: { width: 1.8, color: 'rgba(6,2,12,0.9)' },
  defaults: { stain: 'rgb(40,20,70)', char: 1.0, crackMinLum: 60 },
  parts: {
    head: { flash: true, cracks: 4, holes: 0 }, jaw: { flash: true, cracks: 2, holes: 0 },
    body: { flash: true, cracks: 5, holes: 1 }, arm: { flash: true, cracks: 2, holes: 0 },
    eye: { flash: true, cracks: 3, holes: 0, crackMinLum: 30, stain: 'rgb(120,20,60)' }, iris: { noDmg: true, flash: true }, lid: { noDmg: true }, eyeBurst: { noDmg: true },
    heart0: { noDmg: true, flash: true },
  },
  prefix: { tn: { cracks: 1, holes: 0 }, sh: { noDmg: true, outline: 1.2 }, crown: { noDmg: true, outline: 1.3 }, echo: { noDmg: true, outline: 0 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_chaos', kind: 'boss', ownsDeathFade: true,
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    const names = Object.keys(rig.parts);
    rig.shardP = names.filter((n) => /^sh\d/.test(n)).map((n) => rig.parts[n]);
    rig.tent = ['tn0', 'tn1', 'tn2', 'tn3', 'tn4', 'tncap'].map((n) => rig.parts[n]).filter(Boolean);
    rig.art = makeArt(rig);
    return rig;
  },
  init(b, rig) {
    const q = qualityOf(b.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(60), q, lt: null, pf: 0, jolt: 0, lvl: -1,
      eyeDead: [], gone: { arms: false, body: false }, W: [0, 0], coreW: [0, 0], tp: [], flashPart: null,
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) { return bounds(b, st, out); },
  lights(L, b, rig, st) {
    if (st.gone.body) return;
    if (b.exposed) L.add(b.cx, b.cy + 40, 160, MAGENTA, 0.7);
  },
  debris(i, rig) {
    const P = rig.shardP; if (!P?.length) return null;
    const p = P[i % P.length], im = p.v.base, k = p.k;
    return { size: Math.max(6, (p.r ?? 6) * 1.2), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 경계 ─────────────────────────
function bounds(b, st, out) {
  let x0 = b.cx - 320, x1 = b.cx + 320, y0 = b.cy - 280, y1 = Math.max(b.cy + 300, b.A?.floor ?? 0) + 10;
  for (const e of b.eyes ?? []) { if (e.dead) continue; if (e.x - 60 < x0) x0 = e.x - 60; if (e.x + 60 > x1) x1 = e.x + 60; if (e.y - 60 < y0) y0 = e.y - 60; if (e.y + 90 > y1) y1 = e.y + 90; }
  for (const s of b.shadows ?? []) { const sx = s.st ? s.st.x : s.x; x0 = Math.min(x0, sx - 180); x1 = Math.max(x1, sx + 180); y0 = Math.min(y0, s.y - 600); }
  if ((b.dying > 0 || st?.shards?.list.length) && b.A) { x0 = Math.min(x0, b.A.x0); x1 = Math.max(x1, b.A.x1); y0 = Math.min(y0, b.cy - 420); y1 = Math.max(y1, b.A.floor + 8); }
  out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
  return out;
}

// ───────────────────────── 메인 ─────────────────────────
const _o = { x: 0, y: 0 };
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D;
  if (st.q.name !== tierOf(world.game)) st.q = qualityOf(world.game);
  const q = st.q, P = st.P;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, F = A.floor, t = b.t;
  P.update(dt, F);
  st.shards.update(dt, F);
  const dying = b.dying > 0, dT = dying ? 3.8 - b.dying : 0;
  const ratio = dying ? 0 : b.hp / b.stats.maxHp;
  const lvl = dying ? 2 : (ratio < 0.7 ? 1 : 0) + (ratio < 0.4 ? 1 : 0);
  if (st.lvl >= 0 && lvl > st.lvl && !dying) levelBurst(st, b, rig, lvl);
  st.lvl = lvl;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) { st.jolt = 1; st.flashPart = b.hitPart; hitBurst(st, b); }
  st.jolt = Math.max(0, st.jolt - dt * 6);
  // 눈이 막 터졌으면: 파열된 눈이 떨어지고 체액이 튄다
  for (let i = 0; i < b.eyes.length; i++) {
    const e = b.eyes[i], was = st.eyeDead[i];
    if (e.dead && was === false) eyeBurst(st, rig, e);
    st.eyeDead[i] = e.dead;
  }
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  D.begin(ctx); D.end();
  b.paintBack?.(ctx, world);             // 어둠·반전·레이저 예고·왜곡 예고 (소용돌이·그림자는 채색이 그린다)
  drawShadows(ctx, D, b, rig, st, t, F);
  P.draw(ctx, 0);
  const g = st.gone;
  if (!g.body) {
    drawVortex(ctx, b, st, t, dying ? 1 - smooth(1.8, 2.6, dT) : 1);
    orbitShards(D, b, rig, st, false);
    const glitch = clamp(b.glitch ?? 0, 0, 1);
    if (glitch > 0.05 && q.name !== 'low') drawGlitched(ctx, D, b, world, rig, st, lvl, t, glitch, dying, dT);
    else drawLord(ctx, D, b, world, rig, st, lvl, t, 0, 1, dying, dT, true);
    orbitShards(D, b, rig, st, true);
  }
  drawEyes(ctx, D, b, rig, st, t, dt);
  if (dying) deathTick(st, b, rig, dT);
  D.end();
  st.shards.draw(D);
  D.end();
  b.paintFront?.(ctx, world);
  P.draw(ctx, 1);
  // 공허 불씨 · 별 반짝임
  if (!g.body && rr.next() < dt * 14 * q.ambient) P.emit('spore', b.cx + rr.range(-150, 150), b.cy + rr.range(-140, 140), rr.range(-15, 15), rr.range(-30, 5), { color: rr.chance(0.5) ? VIOLET_L : MAGENTA, layer: 1 });
  if (!g.body && rr.next() < dt * 5 * q.ambient) P.emit('smoke', b.cx + rr.range(-90, 90), b.cy + rr.range(60, 160), rr.range(-10, 10), 25, { color: '#14062a', size: rr.range(14, 26), layer: 0 });
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 공허 소용돌이 ─────────────────────────
function drawVortex(ctx, b, st, t, a) {
  if (a <= 0.01) return;
  const x = b.cx, y = b.cy, q = st.q, r = 240 + Math.sin(t * 1.3) * 8;
  // 어두운 원판 (몸 뒤의 공허) — 퍼프 스프라이트 두 겹, 일반 합성
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * 0.9 * a; ctx.drawImage(puff(VOID), x - r, y - r * 0.9, r * 2, r * 1.8);
  ctx.globalAlpha = ga * 0.8 * a; ctx.drawImage(puff('#12052a'), x - r * 0.7, y - r * 0.62, r * 1.4, r * 1.24);
  ctx.globalAlpha = ga;
  if (!q.halos) return;
  halo(ctx, x, y, r * 1.05, VIOLET, 0.22 * a);
  // 나선 팔 (가산 퍼프가 회전하며 흐름) + 반짝이는 별
  const arms = q.name === 'high' ? 5 : 3, per = q.name === 'high' ? 6 : 4;
  for (let i = 0; i < arms; i++) for (let k = 0; k < per; k++) {
    const u = (k + 1) / per, ang = t * 0.6 + i / arms * TAU + u * 3, rr2 = 40 + u * 180;
    halo(ctx, x + Math.cos(ang) * rr2, y + Math.sin(ang) * rr2 * 0.8, 16 + u * 10, i % 2 ? MAGENTA : VIOLET, 0.16 * a * (1 - u * 0.4));
  }
  const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 24; i++) {
    const ang = hash1(i) * TAU + t * 0.1 * (hash1(i + 5) - 0.5), rr2 = 40 + hash1(i + 3) * 200;
    ctx.globalAlpha = ga * a * (0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i)));
    ctx.fillRect(x + Math.cos(ang) * rr2, y + Math.sin(ang) * rr2 * 0.8, 1.8, 1.8);
  }
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
}

// ───────────────────────── 군주 본체 ─────────────────────────
// 배치 (월드 = cx,cy 기준, 정면이라 좌우 뒤집기 없음): 머리 얼굴 중심 (0,-20) · 몸통 목 (0,-72) · 어깨 (±80,-28) · 촉수 뿌리 배 아래
const HEAD_Y = -20, NECK_Y = -72;
function drawLord(ctx, D, b, world, rig, st, lvl, t, ox, alpha, dying, dT, full, bodyA = alpha) {
  const R = rig.parts, q = st.q, P = st.P;
  const x = b.cx + ox + (st.jolt > 0 ? (rr.next() - 0.5) * 5 * st.jolt : 0), y = b.cy;
  const V = (p) => pickVariant(p, lvl, false, null);
  const breathe = Math.sin(t * 1.4) * 0.012;
  const flashAll = b.flashT > 0 && !dying && st.flashPart !== undefined && !(st.flashPart && st.flashPart.eyeI !== undefined);
  const F = b.A.floor;
  // 1) 몸 아래 촉수 (몸 뒤) — 바닥선 아래는 잘라 그린다
  if (full) {
    D.end(); D.save(); ctx.beginPath(); ctx.rect(x - 600, y - 800, 1200, F + 2 - (y - 800)); ctx.clip();
    tentacles(D, b, rig, st, x, y, t, alpha, lvl, dying, dT);
    D.end(); D.restore();
  }
  D.startFlash(); if (!flashAll) D.rec = false;
  // 2) 팔 (좌 = 거울) — 몸 뒤
  if (!st.gone.arms) {
    const Bd = R.body, sc = 1 + breathe;
    for (const side of [-1, 1]) {
      const sh = Bd[side < 0 ? 'shL' : 'shR'], sx = x + (sh[0] - Bd.neck[0]) * Bd.k * sc, sy = y + NECK_Y + (sh[1] - Bd.neck[1]) * Bd.k * sc;
      const ang = armAngle(b, t, side, dying, dT);
      const Ar = R.arm;
      D.part(Ar, V(Ar), 'sh', sx - side * 6, sy + 6, side * ang, Ar.k * side, Ar.k, bodyA);
    }
  }
  // 3) 몸통 · 4) 머리 (턱 → 머리)
  const Bd = R.body, bs = 1 + breathe;
  D.part(Bd, V(Bd), 'neck', x, y + NECK_Y, 0, Bd.k * bs, Bd.k * bs, bodyA);
  D.end();
  if (full && q.ledges) ledgesOver(ctx, world, x - 260, y - 200, x + 260, Math.min(F, y + 260));
  const H = R.head, J = R.jaw, m = clamp(b.mouth ?? 0.1, 0, 1);
  const hy = y + HEAD_Y + Math.sin(t * 1.3) * 2, hrot = Math.sin(t * 0.9) * 0.025 + (dying ? Math.sin(t * 40) * 0.04 : 0);
  // 아가리 속 (턱이 벌어진 틈): 자홍 발광
  const hingeX = x + (H.hinge[0] - H.c[0]) * H.k, hingeY = hy + (H.hinge[1] - H.c[1]) * H.k;
  if (q.halos && m > 0.15 && bodyA > 0.01) halo(ctx, hingeX, hingeY + 6 + m * 14, 24 + m * 26, MAGENTA, (0.35 + m * 0.5) * bodyA, true);
  D.part(J, V(J), 'hinge', hingeX, hingeY + m * 26, hrot * 0.5, J.k, J.k * (1 + m * 0.12), bodyA);
  D.part(H, V(H), 'c', x, hy, hrot, H.k, H.k, bodyA);
  if (b.flashT > 0 && flashAll && bodyA > 0.01) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.5 * bodyA); else { D.rec = false; D.log.length = 0; }
  D.end();
  if (!full) return;
  // 균열 발광 (손상 단계) · 핵 노출 · 눈빛 · 세 번째 눈
  glowOver(ctx, D, Bd, lvl, 'neck', x, y + NECK_Y, 0, bs, 0.6 * alpha, t, st);
  glowOver(ctx, D, H, lvl, 'c', x, hy, hrot, 1, 0.5 * alpha, t + 1.1, st);
  const cx0 = x + (Bd.core[0] - Bd.neck[0]) * Bd.k * bs, cy0 = y + NECK_Y + (Bd.core[1] - Bd.neck[1]) * Bd.k * bs;
  st.coreW[0] = cx0; st.coreW[1] = cy0;
  const ex = clamp(b.exposed ? 1 : 0, 0, 1);
  st.expo = lerp(st.expo ?? 0, ex, 0.08);
  if (st.expo > 0.02) {
    const Hc = R.heart0, pu = 1 + 0.08 * Math.sin(t * 7);
    if (q.halos) { halo(ctx, cx0, cy0, 70 * pu * st.expo, MAGENTA, 0.6 * st.expo, true); halo(ctx, cx0, cy0, 140 * st.expo, VIOLET, 0.3 * st.expo); }
    if (Hc) D.part(Hc, Hc.v.base, 'c', cx0, cy0, Math.sin(t * 2) * 0.05, Hc.k * 0.9 * pu, Hc.k * 0.9 * pu, st.expo * alpha);
    D.end();
  }
  if (q.halos) {
    const fl = 0.85 + 0.15 * Math.sin(t * 11);
    for (const k of ['eyeL', 'eyeR']) halo(ctx, x + (H[k][0] - H.c[0]) * H.k, hy + (H[k][1] - H.c[1]) * H.k, 14 * fl, VIOLET, 0.85 * alpha, true);
  }
  const te = clamp(b.third ?? 0, 0, 1);
  if (te > 0.02) {
    const I = R.iris, tx = x + (H.third[0] - H.c[0]) * H.k, ty = hy + (H.third[1] - H.c[1]) * H.k;
    if (q.halos) halo(ctx, tx, ty, 34 * te, MAGENTA, 0.8 * alpha, true);
    D.part(I, I.v.base, 'c', tx, ty, 0, I.k * 0.5, I.k * 0.72 * te, alpha);
    D.end();
  }
}
function armAngle(b, t, side, dying, dT) {
  const s = b.state, st = b.st ?? 0;
  let a = 1.05 + Math.sin(t * 1.2 + side) * 0.08;                          // 늘어뜨림 (아래 바깥)
  if (s === 'lasers' || s === 'grid' || s === 'shadow' || s === 'warp') a = 0.25 + Math.sin(t * 2 + side) * 0.1;
  else if (s === 'spiral' || s === 'flower' || s === 'rings' || s === 'starfall') a = -0.35 + Math.sin(t * 3 + side) * 0.12;
  else if (s === 'tendrils') a = st < 0.15 ? -0.6 : 1.45;                    // 들었다가 내리꽂음
  else if (s === 'intro') a = st > 1 && st < 1.9 ? -0.7 : 1.2;
  else if (s === 'finale') a = -0.8 + Math.sin(t * 4 + side) * 0.15;
  if (dying) a = -0.9 + Math.sin(t * 14 + side * 2) * 0.35 * Math.min(1, dT);
  return a;
}

/** 몸 아래 촉수 5가닥 (체인 타일) */
function tentacles(D, b, rig, st, x, y, t, alpha, lvl, dying, dT) {
  const T = rig.tent; if (!T?.length) return;
  const n = T.length, Bd = rig.parts.body;
  const rootY = y + NECK_Y + (Bd.belly[1] - Bd.neck[1]) * Bd.k;
  const stab = b.state === 'tendrils' ? smooth(0.05, 0.3, b.st ?? 0) * (1 - smooth(0.9, 1.6, b.st ?? 0)) : 0;
  const wither = dying ? 1 - smooth(0.5, 2.6, dT) * 0.5 : 1;
  const N = st.q.name === 'low' ? 3 : 5;
  for (let j = 0; j < N; j++) {
    const u0 = N === 1 ? 0.5 : j / (N - 1);
    const rx = x + (u0 - 0.5) * 110, sc = (0.5 + 0.1 * Math.sin(j * 2.3)) * wither;
    let px = rx, py = rootY - 10, ang = PI / 2 + (u0 - 0.5) * 0.9 * (1 - stab * 0.8);
    const ph = j * 1.7;
    for (let i = 0; i < n; i++) {
      const p = T[i], u = i / n, len = 36 * sc * 1.05 * (1 + stab * 0.4);
      ang += Math.sin(t * (1.6 + (dying ? 4 : 0)) + ph + u * 3) * 0.28 * (1 - stab * 0.7) * (0.4 + u);
      const tl = (p.jr[0] - p.jl[0]) * p.k;
      D.part(p, pickVariant(p, lvl), 'jl', px, py, ang, (len / tl) * 1.15 * p.k, p.k * sc, alpha);
      px += Math.cos(ang) * len; py += Math.sin(ang) * len;
    }
  }
}

/** 글리치: 몸을 가로 조각으로 나눠 어긋나게 + 색 분리 실루엣 (렌더 RNG 대신 시간 해시 → 프레임마다 결정적) */
function drawGlitched(ctx, D, b, world, rig, st, lvl, t, g, dying, dT) {
  const x = b.cx, y = b.cy, n = st.q.name === 'high' ? 6 : 4, h = 320 / n;
  drawLord(ctx, D, b, world, rig, st, lvl, t, 0, 1, dying, dT, true, 0);   // 촉수·핵·눈빛만 (몸은 아래 조각들이 그린다)
  for (let i = 0; i < n; i++) {
    const y0 = y - 190 + i * h, off = (hash1(i + Math.floor(t * 20)) - 0.5) * 60 * g;
    D.end(); D.save(); ctx.beginPath(); ctx.rect(x - 300, y0, 600, h + 1); ctx.clip();
    drawLord(ctx, D, b, world, rig, st, lvl, t, off, 1 - g * 0.45, dying, dT, false);
    D.end(); D.restore();
  }
  // 색 분리: 머리·몸 발광 실루엣 두 벌 (자홍 / 흰) 을 좌우로
  const R = rig.parts, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (const [dx, key, a] of [[8 * g, 'glow', 0.3 * g], [-8 * g, 'flash', 0.18 * g]]) {
    const Bd = R.body, H = R.head;
    D.part(Bd, Bd.v[key] ?? Bd.v.base, 'neck', x + dx, y + NECK_Y, 0, Bd.k, Bd.k, a);
    D.part(H, H.v[key] ?? H.v.base, 'c', x + dx, y + HEAD_Y, 0, H.k, H.k, a);
  }
  D.end(); ctx.globalCompositeOperation = op;
}

/** 궤도 결정 파편 (로직 shards[]: a, r, s, z, rot) — 앞 반원은 몸 앞, 뒤 반원은 몸 뒤 */
function orbitShards(D, b, rig, st, front) {
  const S = rig.shardP; if (!S?.length || !b.shards) return;
  for (let i = 0; i < b.shards.length; i++) {
    const s = b.shards[i], sn = Math.sin(s.a);
    if ((sn > 0) !== front) continue;
    const p = S[i % S.length], x = b.cx + Math.cos(s.a) * s.r, y = b.cy + sn * s.r * 0.6 - 10, k = p.k * s.z * 1.1;
    D.part(p, p.v.base, 'c', x, y, s.rot, k, k, front ? 1 : 0.75);
  }
  D.end();
}

// ───────────────────────── 떠다니는 눈 (판정 부위) ─────────────────────────
// 눈마다: 발광 → 눈 줄기(촉수 끝) → 흰자(손상 단계는 눈 체력) → 동공(플레이어를 봄) → 깜빡임(세로로 감김). 맞은 눈만 흰 섬광.
function drawEyes(ctx, D, b, rig, st, t, dt) {
  const R = rig.parts, E = R.eye, I = R.iris, cap = rig.tent?.[rig.tent.length - 1], q = st.q;
  if (!E || !I) return;
  const dying = b.dying > 0;
  for (let i = 0; i < b.eyes.length; i++) {
    const e = b.eyes[i]; if (e.dead) continue;
    const open = clamp(e.open ?? 1, 0, 1), r = 20;                           // 판정 40×40 ↔ 그림 지름 ≈ 40
    const pu = 0.85 + 0.15 * Math.sin(t * 5 + i);
    if (q.halos) halo(ctx, e.x, e.y, (r * 2.3 + (e.laser ? e.laser.k * 26 : 0)) * pu, e.laser ? MAGENTA : VIOLET, (0.45 + (e.laser ? e.laser.k * 0.5 : 0)), true);
    // 눈 줄기 (아래로 늘어진 촉수 끝)
    if (cap) {
      const sw = Math.sin(t * 3 + i * 1.7) * 0.4, tl = (cap.jr[0] - cap.jl[0]) * cap.k;
      D.part(cap, cap.v.base, 'jl', e.x, e.y + r * 0.5, PI / 2 + sw, (32 / tl) * cap.k, cap.k * 0.7, 0.95);
    }
    const lvl = e.hp < 0.34 ? 2 : e.hp < 0.67 ? 1 : 0;
    const k = (2 * r) / ((E.w - E.pad * 2) * E.k) * E.k, sy = k * Math.max(0.08, open);
    D.startFlash();
    const struck = b.flashT > 0 && st.flashPart === e.part;
    if (!struck) D.rec = false;
    D.part(E, pickVariant(E, lvl), 'c', e.x, e.y, 0, k, sy, 1);
    if (open > 0.25) {
      const lx = Math.cos(e.look ?? 0) * 6, ly = Math.sin(e.look ?? 0) * 6 * open;
      const ki = k * 0.62;
      D.part(I, I.v.base, 'c', e.x + lx, e.y + ly, 0, ki, ki * Math.max(0.1, open), 1);
    }
    if (struck) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.8); else { D.rec = false; D.log.length = 0; }
    D.end();
    // 감기는 눈꺼풀 (흑요석 초승달) — 반쯤 감길 때만
    if (open < 0.85 && R.lid) { const Ld = R.lid, kl = k * 1.05; D.part(Ld, Ld.v.base, 'c', e.x - r * 0.1, e.y - r * (0.4 + open * 0.3), -PI / 2, kl, kl * (1 - open) * 1.2, 0.9); D.end(); }
    if (e.laser && q.halos) halo(ctx, e.x, e.y, 10 + e.laser.k * 16, '#ffffff', 0.6 * e.laser.k, true);
    if (dying && rr.next() < dt * 6) st.P.emit('spore', e.x, e.y, rr.range(-40, 40), rr.range(-40, 40), { color: MAGENTA, layer: 1 });
  }
}

// ───────────────────────── 옛 보스의 그림자 ─────────────────────────
// 로직 shadows[] 의 위치·시간을 그대로 따른다 (벡터 paintShadow 와 같은 움직임). 공허빛 실루엣 + 테두리 발광
function drawShadows(ctx, D, b, rig, st, t, F) {
  const S = b.shadows; if (!S?.length) return;
  const R = rig.parts, q = st.q;
  for (const s of S) {
    const p = R[ECHO[s.kind]]; if (!p) continue;
    const k = clamp(s.t / (s.warn || 0.4), 0, 1), out = clamp((s.life - s.t) / 0.4, 0, 1), a = Math.min(k, out);
    if (a <= 0.01) continue;
    const ec = SHADOW_EYES[s.kind], hh = (p.h - p.pad * 2) * p.k, below = (p.h - p.pad - p.c[1]) * p.k;
    let x = s.x, y = s.y, sx = p.k, sy = p.k, rot = 0, clip = false;
    if (s.kind === 'lev') {
      const rise = s.t < s.warn ? 0 : 1 - Math.pow(1 - Math.min(1, (s.t - s.warn) / 0.18), 3);
      y = F + (1 - rise) * hh * 0.95 + 24 - below; clip = true;   // 발밑에서 솟구침 (바닥 아래는 잘림)
    } else if (s.kind === 'col') {
      const fall = s.t < s.warn ? 0 : Math.min(1, (s.t - s.warn) / 0.12);
      y = s.t < s.warn ? s.y - 520 + k * 60 : lerp(s.y - 520, s.y - 60, fall * fall); rot = 0.3;
    } else if (s.kind === 'fq') {
      y = s.y - 20;
    } else if (s.kind === 'death') {
      if (s.t < s.warn) continue;
      x = s.st.x; y = F - below; sx = p.k * (s.d ?? 1) * -1;
    } else if (s.kind === 'drac') {
      y = F - below; sx = p.k * (s.f || 1);
    }
    if (clip) { D.end(); D.save(); ctx.beginPath(); ctx.rect(x - 400, F - 800, 800, 800); ctx.clip(); }
    if (q.halos) halo(ctx, x, y, hh * 0.7, VIOLET, 0.35 * a);
    D.part(p, p.v.base, 'c', x, y, rot, sx, sy, a * 0.88);
    D.end();
    if (clip) D.restore();
    if (q.halos) halo(ctx, x, y - hh * 0.3, 22, ec, 0.35 * a, true);
  }
}

// ───────────────────────── 균열 발광 ─────────────────────────
function glowOver(ctx, D, part, lvl, pivot, x, y, rot, sc, a, t, st) {
  if (!st.q.crackGlow || lvl <= 0 || a <= 0.01) return;
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 ? 1 : 0);
  if (!drawn) return;
  const g = drawn === 2 ? part.gl.dmg2 : part.gl.dmg1;
  if (!g) return;
  const pv = part[pivot], k = part.k * sc;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + part.w * 0.01)) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, x, y, rot, k * 2, k * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
  D.end();
}

// ───────────────────────── 피격 · 단계 · 사망 ─────────────────────────
function hitBurst(st, b) {
  const P = st.P, part = b.hitPart;
  if (part?.eyeI !== undefined) { const e = b.eyes[part.eyeI]; if (e) P.burst('ichor', e.x, e.y, 5, { speed: 160, color: '#2a0640', hi: MAGENTA }); return; }
  P.burst('spark', b.cx + rr.range(-30, 30), b.cy - 10, 6, { speed: 260, color: VIOLET_L });
  P.burst('spore', b.cx, b.cy - 10, 8, { speed: 120, color: MAGENTA });
}
function spawnShards(st, rig, x, y, n, speed, sc = 1, fade = 1.6) {
  const S = rig.shardP; if (!S?.length) return;
  for (let j = 0; j < n; j++) {
    const p = S[(j * 3 + (x | 0)) % S.length], a = -PI / 2 + rr.range(-1.6, 1.6), sp = speed * rr.range(0.4, 1);
    st.shards.spawn(p.v.base, p.c[0], p.c[1], x + rr.range(-14, 14), y + rr.range(-14, 14), rr.next() * TAU, p.k * sc * rr.sign(), p.k * sc, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-10, 10), { r: (p.r ?? 5) * sc, fade, bounce: 0.35 });
  }
}
function levelBurst(st, b, rig, lvl) {
  spawnShards(st, rig, b.cx, b.cy - 60, 4 + lvl * 3, 360, 1.2);
  st.P.burst('spore', b.cx, b.cy, 24, { speed: 260, color: VIOLET_L });
  st.P.burst('smoke', b.cx, b.cy, 8, { speed: 90, color: '#14062a', jitter: 30 });
}
function eyeBurst(st, rig, e) {
  const B = rig.parts.eyeBurst;
  if (B) st.shards.spawn(B.v.base, B.c[0], B.c[1], e.x, e.y, 0, B.k * 0.62, B.k * 0.62, rr.range(-60, 60), -120, rr.range(-4, 4), { r: 10, fade: 1.2, bounce: 0.2 });
  st.P.burst('ichor', e.x, e.y, 10, { speed: 220, color: '#2a0640', hi: MAGENTA });
  st.P.burst('spore', e.x, e.y, 12, { speed: 200, color: MAGENTA });
}
/** 사망 (3.8초): 팔이 떨어짐(1.3초) → 내파(로직 _implode): 왕관·머리·턱·심장·흑요석 파편이 사방으로 */
function deathTick(st, b, rig, dT) {
  const R = rig.parts, G = st.gone, P = st.P, x = b.cx, y = b.cy;
  const fade = (end) => Math.max(0.3, Math.min(end, b.dying - 0.05));
  if (!G.arms && dT > 1.3) {
    G.arms = true;
    const Ar = R.arm;
    for (const side of [-1, 1]) st.shards.spawn(pickVariant(Ar, 2), Ar.sh[0], Ar.sh[1], x + side * 80, y - 20, side * 0.9, Ar.k * side, Ar.k, side * rr.range(80, 160), -200, side * rr.range(2, 5), { r: 20, fade: fade(2), bounce: 0.25 });
    P.burst('spore', x, y, 20, { speed: 220, color: VIOLET_L });
  }
  if (!G.body && b._implode) {
    G.body = true;
    for (const [n, pv, dx, dy, vx, vy, sc] of [['head', 'c', 0, HEAD_Y, 0, -620, 1], ['jaw', 'hinge', 0, 20, 60, -300, 1], ['crown0', 'c', -70, -140, -300, -520, 1.2], ['crown1', 'c', 70, -140, 300, -520, 1.2], ['heart0', 'c', 0, 40, 0, -380, 1], ['body', 'neck', 0, NECK_Y, 0, -80, 1]]) {
      const p = R[n]; if (!p) continue;
      st.shards.spawn(pickVariant(p, 2), p[pv][0], p[pv][1], x + dx, y + dy, rr.range(-0.2, 0.2), p.k * sc, p.k * sc, vx + rr.range(-60, 60), vy, rr.range(-4, 4), { r: n === 'body' ? 60 : 18, fade: fade(1.1), bounce: 0.25 });
    }
    spawnShards(st, rig, x, y - 40, 16, 700, 1.4, fade(1.1));
    P.burst('spore', x, y, 80, { speed: 560, color: VIOLET_L });
    P.burst('spark', x, y, 30, { speed: 620, color: '#ffffff' });
    P.burst('smoke', x, y, 20, { speed: 200, color: '#14062a', jitter: 60 });
  }
}

// ───────────────────────── 로직 파일용 그리기 도우미 ─────────────────────────
// b_chaos.js 의 공허 촉수(바닥 균열에서 솟는 위험 지대)가 리그 준비 시 이것으로 그린다.
function makeArt(rig) {
  const T = rig.tent;
  return {
    /** 바닥 (x, F) 에서 높이 H 로 솟는 촉수 (w = 반폭, seed = 흔들림 위상) */
    tendril(ctx, x, F, H, w, t, seed) {
      if (!T?.length || H < 3) return false;
      const n = T.length, seg = H / n, sc = w / 30;
      let px = x, py = F + 6, ang = -PI / 2;
      halo(ctx, x, F - 6, 44, VIOLET, 0.7);
      for (let i = 0; i < n; i++) {
        const p = T[i], u = i / n, tl = (p.jr[0] - p.jl[0]) * p.k;
        ang = -PI / 2 + Math.sin(t * 6 + u * 5 + seed) * 0.35 * u;
        const im = p.v.base, sx = (seg / tl) * 1.2 * p.k, sy = p.k * sc;
        ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.scale(sx / p.k, sy / p.k);
        ctx.drawImage(im, -p.jl[0] * p.k, -p.jl[1] * p.k, im.width * p.k, im.height * p.k);
        ctx.restore();
        px += Math.cos(ang) * seg; py += Math.sin(ang) * seg;
      }
      return true;
    },
  };
}
