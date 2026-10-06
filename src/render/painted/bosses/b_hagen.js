// 하겐 / 은빛 늑대 (b_hagen) — 채색 컷아웃 퍼핏 렌더러 (EX3-BOSS, docs/specs/ex_s23.md §2.2)
// 부품 (Kling, tools/painted/prompts/ex3-boss.mjs · configs/b_hagen.json):
//   사람 — 옆모습 전신(full_a, 가까운 팔을 외투 결로 메운 거울상)에서 모자 머리 · 몸통(외투 윗판·탄띠) · 외투 앞자락 · 뒷자락 두 띠(사슬) · 장화 ·
//          위팔(해진 어깨받이) · 아래팔+주먹(털 커프스) · 장총 · 사냥칼 · 뿔피리
//   늑대 — 네 발 옆모습(beast_a, 거울상)에서 몸통(찢어진 외투·탄띠) · 뒷다리 위(허벅지+정강이)/아래(발등+발) · 앞다리 위/아래 · 꼬리 두 토막 +
//          머리 둘(heads_a: 입 닫힘 / 벌림, 외투 깃 조각)
//   소품 — 은 올가미 · 은탄 (로직 e_hagen.js 가 직접 그린다) · 외투 조각 셋 · 털 뭉치 (전환·쓰러짐의 강체 조각)
// 움직임은 전부 로직(src/game/bosses/e_hagen.js)의 값을 읽기만 한다:
//   boss { zx, fy, fk, facing, wolf, morph, tearT, ps{…}, pts{hip,neck,head,eye,mouth,shN/shF,elN/elF,hdN/hdF,knN/knF,ftN/ftF,kTip,tA,hA},
//          wp{hip,sh,neck,head,snout,eye,elN/elF,pwN/pwF,knN/knF,hkN/hkF,ftN/ftF,wa,ha}, tail[7], rf{x,y,a}, gun, knifeOut, hornOut, rifleDrop,
//          aimLock, ghost, stunned, exposed, reloading, offering, cWin, moonK, dawnK, dieT, vanishK, walkK, t, flashT, hitPart, A.floor }
// 상태별 표현: 대기(외투 뒷자락 물결) · 조준(무릎 쏴 · 노란 눈) · 장전 노출 · 칼 · 뿔피리 · 올가미 던지기 · 무릎(stagger) · 전환(몸이 뒤틀리고 외투 조각이
//   강체로 찢겨 나간다 → 달빛 섬광 속 늑대) · 늑대 웅크림/도약/할퀴기/울부짖음/급강하 · 가슴을 내줌(offer) · 손상 0–2 · 피격 섬광(맞은 부위만) ·
//   쓰러짐(늑대가 눕고 → 새벽빛 → 은빛 털이 흩어지며 사람으로 누움, 아케이드는 눈보라로 사라짐) · 바닥에 내던진 장총
// 좌표: 로직과 같은 몸 지역 좌표 (원점 = 발 가운데 바닥 zx,fy, 좌우 fk, +x = 얼굴 쪽, y 아래가 양수)
import { Drawer, Particles, Shards, halo, rr, loadRig, pickVariant, quality, QUALITY } from '../kit.js';

const DIR = 'painted/bosses/b_hagen';
const PI = Math.PI;
const AMBER = '#ffcf6a', MOON = '#a8c8ff', SNOW = 'rgba(238,244,255,0.85)', FURC = 'rgba(214,220,232,0.9)', LEATHER = '#4a3426';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);
const DEF = {
  glow: '#ffcf6a',
  outline: { width: 1.3, color: 'rgba(8,6,10,0.9)' },
  parts: {
    torso: { flash: true, cracks: 2, char: 0.25, holes: 0, crackMinLum: 40 },
    headH: { flash: true, cracks: 1, char: 0.1, holes: 0, crackMinLum: 60 },
    skirtF: { flash: true, cracks: 2, char: 0.2, holes: 1 },
    tailA: { cracks: 1, char: 0.2, holes: 1, deep: 0.6 },
    tailB: { cracks: 1, char: 0.2, holes: 1, deep: 0.6 },
    boot: { flash: true, cracks: 1, char: 0.2, holes: 0, deep: 0.55 },
    armU: { flash: true, cracks: 1, char: 0.2, holes: 0, deep: 0.55 },
    armF: { flash: true, cracks: 1, char: 0.15, holes: 0, deep: 0.55 },
    rifle: { noDmg: true, deep: 0.6 },
    knife: { noDmg: true },
    horn: { noDmg: true },
    wBody: { flash: true, cracks: 3, char: 0.2, holes: 0, crackMinLum: 45 },
    wHeadC: { flash: true, cracks: 2, char: 0.1, holes: 0, crackMinLum: 60 },
    wHeadO: { flash: true, cracks: 2, char: 0.1, holes: 0, crackMinLum: 60 },
    hindU: { flash: true, cracks: 1, char: 0.15, holes: 0, deep: 0.55 },
    hindL: { flash: true, cracks: 1, char: 0.1, holes: 0, deep: 0.55 },
    foreU: { flash: true, cracks: 1, char: 0.15, holes: 0, deep: 0.55 },
    foreL: { flash: true, cracks: 1, char: 0.1, holes: 0, deep: 0.55 },
    wTailA: { cracks: 1, char: 0.1, holes: 0, deep: 0.6 },
    wTailB: { cracks: 1, char: 0.1, holes: 0, deep: 0.6 },
    trap: { noDmg: true, outline: 1.0 },
    bullet: { noDmg: true, outline: 0.8 },
  },
  prefix: { deb: { noDmg: true, outline: 1.0 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_hagen', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return { D: new Drawer(), P: new Particles(q.particles), shards: new Shards(24), q, lt: null, pf: 0, fp: null, jolt: 0, tearT: -1, humanT: -1, lvl: 0, W: [0, 0], E: [0, 0], ff: {}, mk: [0, 0] };
  },
  draw(ctx, boss, world, rig, st) { drawBoss(ctx, boss, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.zx ?? b.cx, Y = b.fy ?? b.bottom;
    let x0 = X - 200, x1 = X + 200, y0 = Y - 230, y1 = Y + 30;
    const d = b.rifleDrop;
    if (d) { x0 = Math.min(x0, d.x - 70); x1 = Math.max(x1, d.x + 70); y1 = Math.max(y1, d.y + 20); }
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 30 < x0) x0 = px - 30; if (px + 30 > x1) x1 = px + 30; if (py - 30 < y0) y0 = py - 30; if (py + 30 > y1) y1 = py + 30; }
    if (st?.shards?.list.length) for (const s of st.shards.list) { if (s.x - 60 < x0) x0 = s.x - 60; if (s.x + 60 > x1) x1 = s.x + 60; if (s.y - 60 < y0) y0 = s.y - 60; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    if (st.flashL > 0.05) L.add(st.flashW?.[0] ?? b.zx, st.flashW?.[1] ?? b.fy - 80, 200, MOON, st.flashL * 0.7);
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
  const floor = b.A.floor, t = b.t;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0;
  const hk = b.stats?.maxHp ? b.hp / b.stats.maxHp : 1;
  st.lvl = b.wolf ? (hk < 0.25 ? 2 : 1) : (hk < 0.75 ? 1 : 0);
  // 피격 부위 고정 (섬광이 다시 켜진 프레임의 b.hitPart)
  if (b.flashT > st.pf + 1e-4) st.fp = b.hitPart ?? null;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 7);
  st.flashL = Math.max(0, (st.flashL ?? 0) - dt * 2.5);
  const fOn = b.flashT > 0 && !dying, fp = st.fp, ff = st.ff;
  ff.head = fOn && (!fp || fp === b.pHead);
  ff.body = fOn && (!fp || fp === b.pBody || fp === b.pBack);
  ff.legs = fOn && (!fp || fp === b.pLegs);
  if (b.state === 'intro' || (b.hp >= b.stats.maxHp && !dying)) { if (!b.wolf) st.shards.clear(); st.tearT = b.tearT; }
  const X = b.zx, Y = b.fy, fk = Math.abs(b.fk) < 0.02 ? 0.02 * Math.sign(b.fk || 1) : b.fk;
  const W = (lx, ly, out = st.W) => { out[0] = X + fk * lx; out[1] = Y + ly; return out; };
  const bodyA = 1 - (b.vanishK ?? 0);
  const ga = ctx.globalAlpha;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  // 외투가 찢어진 순간 (로직 tearT 가 바뀐 프레임) → 외투 조각·털 뭉치가 강체로 튄다
  if (b.tearT > 0 && b.tearT !== st.tearT) { st.tearT = b.tearT; coatTear(b, rig, st, W); }
  // 사람으로 돌아온 순간 (쓰러짐 3초) → 은빛 털이 눈송이처럼
  if (b.lieHuman && st.humanT < 0) { st.humanT = t; furScatter(b, st, W, q); }
  if (!b.lieHuman) st.humanT = -1;
  // ── 바닥: 내던진 장총 ──
  D.begin(ctx);
  const dr = b.rifleDrop;
  if (dr && bodyA > 0.01) { const p = R.rifle, k = p.k; D.part(p, p.v.base, 'butt', dr.x - Math.cos(dr.a) * 52, dr.y - 3 - Math.sin(dr.a) * 52, dr.a - Math.atan2(p.muzzle[1] - p.butt[1], p.muzzle[0] - p.butt[0]), k, k, bodyA); }
  D.end();
  P.draw(ctx, 0);
  if (bodyA > 0.01) {
    ctx.globalAlpha = ga * bodyA;
    D.begin(ctx);
    D.save();
    ctx.translate(X, Y); ctx.scale(fk, 1);
    D.begin(ctx);
    D.rec = false; D.log.length = 0;
    const jr = st.jolt ? (rr.next() - 0.5) * 0.04 * st.jolt : 0;
    const m = clamp(b.morph ?? (b.wolf ? 1 : 0), 0, 1);
    if (m < 0.999) { ctx.globalAlpha = ga * bodyA * (1 - m); human(D, ctx, R, b, st, ff, jr, t); }
    if (m > 0.001) { ctx.globalAlpha = ga * bodyA * m; wolf(D, ctx, R, b, st, ff, jr, t); }
    if (fOn) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.6);
    else { D.rec = false; D.log.length = 0; }
    D.end();
    // 빛: 노란 눈 (조준 고정 · 카운터 창이면 밝게)
    eyes(ctx, b, st, q, m, t);
    D.restore();
    ctx.globalAlpha = ga;
  }
  // ── 월드: 강체 조각 · 입자 · 전환 달빛 섬광 ──
  D.begin(ctx);
  st.shards.draw(D);
  D.end();
  if ((b.moonK ?? 0) > 0.05 && !dying && q.halos) halo(ctx, X, Y - 120, 150, MOON, 0.12 * b.moonK);
  const mt = b.morphT >= 0 ? t - b.morphT : 9;
  if (mt < 0.5 && b.wolf) { const k = 1 - mt / 0.5; halo(ctx, X, Y - 70, 180, '#dfe8ff', 0.6 * k, true); }
  ambient(P, b, st, W, dt, q, hit, t, bodyA);
  P.draw(ctx, 1);
  ctx.globalAlpha = ga;
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 부품 배치 ─────────────────────────
/** 두 점을 잇는 부품 (피벗 a → b 벡터를 로직 (ax,ay) → (bx,by) 에 맞춰 돌리고, 길이 비율을 lo..hi 로 늘인다) */
function segment(D, p, pa, pb, ax, ay, bx, by, lvl, deep, jr = 0, lo = 0.85, hi = 1.18, flipY = false, alpha = 1) {
  const A = p[pa], B = p[pb];
  const ix = B[0] - A[0], iy = B[1] - A[1];
  const lx = bx - ax, ly = by - ay;
  const rot = Math.atan2(ly, lx) - Math.atan2(flipY ? -iy : iy, ix) + jr;
  const k = p.k * clamp(Math.hypot(lx, ly) / (Math.hypot(ix, iy) * p.k || 1), lo, hi);
  D.part(p, pickVariant(p, lvl, deep, null), pa, ax, ay, rot, k, flipY ? -k : k, alpha);
}
/** 매달린 띠 (top 피벗 → 원하는 각 ang 으로 늘어뜨림) — 아래 끝(bot) 의 지역 좌표를 out 에 */
function hang(D, p, x, y, ang, lvl, deep, sx = 1, out) {
  const ia = Math.atan2(p.bot[1] - p.top[1], p.bot[0] - p.top[0]), k = p.k;
  D.part(p, pickVariant(p, lvl, deep, null), 'top', x, y, ang - ia, k * sx, k);
  if (out) { const L = Math.hypot(p.bot[0] - p.top[0], p.bot[1] - p.top[1]) * k; out[0] = x + Math.cos(ang) * L; out[1] = y + Math.sin(ang) * L; }
}

/** 사람 (지역 좌표) */
function human(D, ctx, R, b, st, ff, jr, t) {
  const P = b.pts, s = b.ps, lvl = st.lvl, rf = b.rf;
  const back = b.gun === 'back' && !b.knifeOut;
  const rifleSeg = (deep) => segment(D, R.rifle, 'butt', 'muzzle', rf.x, rf.y, rf.x + Math.cos(rf.a) * 104, rf.y + Math.sin(rf.a) * 104, 0, deep, 0, 0.95, 1.05);
  // 1) 등에 멘 장총 (몸 뒤)
  if (back) rifleSeg(true);
  // 2) 먼 팔 (deep)
  segment(D, R.armU, 'sh', 'el', P.shF.x, P.shF.y, P.elF.x, P.elF.y, lvl, true, 0, 0.8, 1.2);
  segment(D, R.armF, 'el', 'hd', P.elF.x, P.elF.y, P.hdF.x, P.hdF.y, lvl, true, 0, 0.8, 1.2);
  // 3) 외투 뒷자락 두 띠 (허리 뒤에서 뒤로 끌린다 — 걸음·무릎·누움)
  const kn = clamp(s.kneel, 0, 1), lie = clamp(s.lie, 0, 1), walk = b.walkK ?? 0;
  const base = P.tA * 0.6 + 0.12 + 0.18 * walk + 0.35 * kn + Math.sin(t * 2.1) * 0.05;
  const a1 = lerp(PI / 2 + base, PI / 2 + 1.35, lie), a2 = a1 + 0.08 + 0.12 * walk + 0.25 * kn + Math.sin(t * 2.1 - 0.8) * 0.06;
  const m = st.mk;
  hang(D, R.tailA, P.hip.x - 9, P.hip.y + 2, a1, lvl, false, 1, m);
  hang(D, R.tailB, m[0] + 1, m[1] - 2, a2, lvl, true);
  // 4) 다리: 장화 (먼 = deep · 가까운). 무릎은 외투 앞자락 속
  segment(D, R.boot, 'kn', 'sole', P.knF.x, P.knF.y, P.ftF.x, P.ftF.y, lvl, true, 0, 0.85, 1.15);
  D.rec = ff.legs; segment(D, R.boot, 'kn', 'sole', P.knN.x, P.knN.y, P.ftN.x, P.ftN.y, lvl, false, 0, 0.85, 1.15); D.rec = false;
  // 5) 외투 앞자락 (허리 → 두 무릎 가운데 쪽으로 늘어진다)
  const mx = (P.knN.x + P.knF.x) / 2, my = (P.knN.y + P.knF.y) / 2;
  D.rec = ff.body;
  segment(D, R.skirtF, 'top', 'bot', P.hip.x + 2, P.hip.y - 2, P.hip.x + (mx - P.hip.x) * 1.55, P.hip.y + (my - P.hip.y) * 1.55, lvl, false, jr * 0.5, 0.85, 1.12);
  // 6) 몸통
  segment(D, R.torso, 'hip', 'nk', P.hip.x, P.hip.y, P.neck.x, P.neck.y, lvl, false, jr, 0.92, 1.1);
  D.rec = false;
  // 7) 머리 (모자)
  D.rec = ff.head;
  const h = R.headH;
  D.part(h, pickVariant(h, Math.min(1, lvl), false, null), 'nk', P.neck.x, P.neck.y, (P.hA ?? 0) + jr, h.k, h.k);
  const e = D.pt(h.nk[0], h.nk[1], h.eye[0], h.eye[1], P.neck.x, P.neck.y, (P.hA ?? 0) + jr, h.k, h.k, st.E);
  st.eyeL = st.eyeL ?? [0, 0]; st.eyeL[0] = e[0]; st.eyeL[1] = e[1];
  D.rec = false;
  // 8) 장총 (손에 든 자세) · 뿔피리
  if (!back && b.gun !== 'none' && lie < 0.5) rifleSeg(false);
  if (b.hornOut) { const p = R.horn, ia = Math.atan2(p.bell[1] - p.mp[1], p.bell[0] - p.mp[0]); D.part(p, p.v.base, 'mp', P.mouth.x + 1, P.mouth.y, -0.95 - ia, p.k, p.k); }
  // 9) 가까운 팔 (몸 앞) + 사냥칼
  D.rec = ff.body;
  segment(D, R.armU, 'sh', 'el', P.shN.x, P.shN.y, P.elN.x, P.elN.y, lvl, false, 0, 0.8, 1.2);
  if (b.knifeOut) segment(D, R.knife, 'grip', 'tip', P.hdN.x, P.hdN.y, P.kTip.x, P.kTip.y, 0, false, 0, 0.9, 1.1, true);
  segment(D, R.armF, 'el', 'hd', P.elN.x, P.elN.y, P.hdN.x, P.hdN.y, lvl, false, 0, 0.8, 1.2);
  D.rec = false;
}

/** 늑대 (지역 좌표) */
function wolf(D, ctx, R, b, st, ff, jr, t) {
  const Wp = b.wp, T0 = b.tail, lvl = st.lvl;
  // 1) 꼬리 두 토막 (꼬리 점 0→3, 3→6)
  segment(D, R.wTailA, 'root', 'mid', T0[0].x, T0[0].y, T0[3].x, T0[3].y, lvl, false, 0, 0.8, 1.2);
  segment(D, R.wTailB, 'mid', 'tip', T0[3].x, T0[3].y, T0[6].x, T0[6].y, lvl, false, 0, 0.8, 1.2);
  // 2) 먼 다리 (deep): 뒷다리 · 앞다리
  segment(D, R.hindU, 'hip', 'hk', Wp.hip.x + 4, Wp.hip.y, Wp.hkF.x, Wp.hkF.y, lvl, true, 0, 0.75, 1.2);
  segment(D, R.hindL, 'hk', 'sole', Wp.hkF.x, Wp.hkF.y, Wp.ftF.x, Wp.ftF.y, lvl, true, 0, 0.8, 1.15);
  segment(D, R.foreU, 'sh', 'el', Wp.sh.x + 6, Wp.sh.y - 2, Wp.elF.x, Wp.elF.y, lvl, true, 0, 0.75, 1.2);
  segment(D, R.foreL, 'el', 'sole', Wp.elF.x, Wp.elF.y, Wp.pwF.x, Wp.pwF.y, lvl, true, 0, 0.8, 1.15);
  // 3) 몸통
  D.rec = ff.body; segment(D, R.wBody, 'hip', 'sh', Wp.hip.x, Wp.hip.y, Wp.sh.x, Wp.sh.y, lvl, false, jr, 0.9, 1.1); D.rec = false;
  // 4) 가까운 뒷다리
  D.rec = ff.legs;
  segment(D, R.hindU, 'hip', 'hk', Wp.hip.x, Wp.hip.y, Wp.hkN.x, Wp.hkN.y, lvl, false, 0, 0.75, 1.2);
  segment(D, R.hindL, 'hk', 'sole', Wp.hkN.x, Wp.hkN.y, Wp.ftN.x, Wp.ftN.y, lvl, false, 0, 0.8, 1.15);
  D.rec = false;
  // 5) 머리 (입 닫힘 / 벌림) — 목 피벗, 그림의 목→주둥이를 로직 목→주둥이에
  D.rec = ff.head;
  const open = (b.ps?.jaw ?? 0) > 0.45, h = open ? R.wHeadO : R.wHeadC;
  const ia = Math.atan2(h.snout[1] - h.nk[1], h.snout[0] - h.nk[0]), la = Math.atan2(Wp.snout.y - Wp.neck.y, Wp.snout.x - Wp.neck.x);
  const rot = la - ia + jr;
  D.part(h, pickVariant(h, Math.min(1, lvl), false, null), 'nk', Wp.neck.x, Wp.neck.y, rot, h.k, h.k);
  const e = D.pt(h.nk[0], h.nk[1], h.eye[0], h.eye[1], Wp.neck.x, Wp.neck.y, rot, h.k, h.k, st.E);
  st.eyeW = st.eyeW ?? [0, 0]; st.eyeW[0] = e[0]; st.eyeW[1] = e[1];
  D.rec = false;
  // 6) 가까운 앞다리
  D.rec = ff.legs;
  segment(D, R.foreU, 'sh', 'el', Wp.sh.x, Wp.sh.y, Wp.elN.x, Wp.elN.y, lvl, false, 0, 0.75, 1.2);
  segment(D, R.foreL, 'el', 'sole', Wp.elN.x, Wp.elN.y, Wp.pwN.x, Wp.pwN.y, lvl, false, 0, 0.8, 1.15);
  D.rec = false;
}

/** 빛: 노란 눈 (지역 좌표) */
function eyes(ctx, b, st, q, m, t) {
  if ((b.dying > 0 && b.lieHuman) || b.ghost && b.air) return;
  const e = m > 0.5 ? st.eyeW : st.eyeL;
  if (!e) return;
  const k = (0.75 + 0.25 * Math.sin(t * 5)) * (b.dying > 0 ? 0.4 : 1) * (b.aimLock || b.cWin ? 1.6 : 1);
  if (q.halos) halo(ctx, e[0], e[1], 7, AMBER, 0.5 * k);
  halo(ctx, e[0], e[1], 2.4, '#fff4d8', Math.min(1, 0.8 * k), true);
}
/** 외투가 찢어진 순간: 외투 조각 셋 + 털 뭉치가 강체로 튄다 */
function coatTear(b, rig, st, W) {
  const R = rig.parts, P = b.pts, c = W(P.neck.x - 4, P.neck.y + 26, [0, 0]);
  for (const [name, side, s] of [['debVest', -1, 0.9], ['debSleeve', 1, 1], ['debScrap', -1, 1], ['debScrap', 1, 0.8], ['debFur', 1, 1]]) {
    const p = R[name]; if (!p) continue;
    const k = p.k * s;
    st.shards.spawn(p.v.base, p.c[0], p.c[1], c[0] + rr.range(-10, 10), c[1] + rr.range(-14, 14), rr.range(-0.6, 0.6), k * (b.facing || 1), k, side * (b.facing || 1) * rr.range(80, 220), rr.range(-420, -220), rr.range(-6, 6), { r: 6, bounce: 0.25, fade: 3.0 });
  }
  st.P.burst('ashLight', c[0], c[1], 16, { speed: 220, color: FURC });
  st.flashL = 1; st.flashW = [c[0], c[1]];
}
/** 사람으로 돌아온 순간: 은빛 털이 눈송이처럼 흩어진다 */
function furScatter(b, st, W, q) {
  const n = Math.round(30 * q.ambient) + 6;
  for (let i = 0; i < n; i++) { const p = W(rr.range(-70, 40), rr.range(-40, -6), [0, 0]); st.P.emit('ashLight', p[0], p[1], rr.range(-40, 40), rr.range(-120, -30), { color: i % 3 ? FURC : SNOW, size: rr.range(1.6, 3.2), life: rr.range(1.6, 2.8) }); }
  st.flashL = 0.6; const c = W(-10, -20, [0, 0]); st.flashW = [c[0], c[1]];
}
function ambient(P, b, st, W, dt, q, hit, t, bodyA) {
  const amb = q.ambient;
  if (bodyA < 0.3) return;
  if (b.dying > 0) {
    if ((b.dieT ?? 0) < 1.5 && rr.next() < dt * 10 * amb) { const p = W(rr.range(-60, 40), rr.range(-30, -4), [0, 0]); P.emit('ashLight', p[0], p[1], rr.range(-30, 30), rr.range(-60, -20), { color: SNOW, layer: 1 }); }
    return;
  }
  if (b.ghost && b.air) return;
  // 외투·털에서 떨어지는 눈
  if (rr.next() < dt * (b.wolf ? 2.5 : 1.5) * amb) { const p = W(rr.range(-50, 40), rr.range(-120, -20), [0, 0]); P.emit('ashLight', p[0], p[1], rr.range(-20, 20), rr.range(10, 40), { color: SNOW, layer: 0 }); }
  // 카운터 창 — 흰 섬광
  if (b.cWin && rr.next() < dt * 30 * amb) { const p = W(rr.range(-20, 20), rr.range(-100, -20), [0, 0]); P.emit('spark', p[0], p[1], rr.range(-160, 160), rr.range(-200, 40), { color: '#fff4d8' }); }
  if (b.stunned && rr.next() < dt * 10 * amb) { const p = W(rr.range(-20, 20), rr.range(-100, -40), [0, 0]); P.emit('ashLight', p[0], p[1], rr.range(-20, 20), rr.range(-60, -20), { color: SNOW, life: 1.2, layer: 1 }); }
  if (hit) {
    const hp = st.fp, p = st.W2h ??= [0, 0];
    if (hp) { p[0] = hp.x + hp.w / 2 + rr.range(-6, 6); p[1] = hp.y + hp.h / 2 + rr.range(-6, 6); } else W(rr.range(-10, 10), rr.range(-90, -40), p);
    P.burst('chip', p[0], p[1], 3, { speed: 200, color: b.wolf ? '#c8ccd8' : LEATHER });
    P.burst('spark', p[0], p[1], 3, { speed: 240, color: b.wolf ? MOON : AMBER });
  }
}
