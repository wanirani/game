// 태엽 거신 (b_colossus) — 채색 컷아웃 퍼핏 렌더러 (ART-BOSS-3). 정면을 보는 유일한 보스.
// 부품 (Kling, tools/painted/configs/b_colossus.json): 피 묻은 황동 흉갑(가시 견갑·굴뚝·환기구를 움켜쥔 해골 손·용광로 창살) ·
//   기어박스 골반 · 가시 투구 속 피 흘리는 해골 머리 · 위팔 원통 / 팔꿈치 톱니 / 아래팔 피스톤 / 갈퀴 건틀릿 · 황동 허벅지 / 가시 장갑 정강이 / 무릎 톱니 ·
//   시계판(그림 속 바늘은 지움, 바늘은 로직 clockH/clockM 으로 그림) · 우리 속 박동하는 심장(노출 코어) · 진자 막대 2종 + 피 묻은 초승달 칼날 · 파편 11종
// 로직(src/game/bosses/b_colossus.js)의 값을 읽기만 한다: bx, F(A.floor), wy(), crouch, bob, stepLift[], arms[{side,fx,fy,fly,planted,glow,vx}],
//   gearA, gearSpd, clockH/M, door, heat, power, look, pend{a,len,k,warn}, phase, state, flashT, dying, paintBack(경고 표시)
// 모든 층은 바닥선에서 자른다 (무릎 꿇기·사망 때 가라앉음). 팔다리 원통은 좌우 반전하지 않는다 (왼쪽 위 조명 유지).
import { Drawer, Particles, DamageState, Shards, halo, puff, rr, loadRig, pickVariant, quality, ik2, ledgesOver } from '../kit.js';

const DIR = 'painted/bosses/b_colossus';
const FURN = '#ff7a1a', FURN_L = '#ffd27a', EYE = '#ff3a2a';
const PI = Math.PI, TAU = PI * 2;
const L1 = 118, L2 = 124;           // 로직 팔 길이 (상완/전완)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const DEF = {
  glow: '#ff7a2a',
  outline: { width: 2.0, color: 'rgba(10,6,4,0.9)' },
  parts: {
    torso: { flash: true, cracks: 4, holes: 1, chips: 2, char: 2, crackMinLum: 110 },
    pelvis: { flash: true, deep: 0.8, deepOnly: true, cracks: 2 },
    head: { flash: true, cracks: 3, holes: 1, crackMinLum: 120 },
    uarm: { flash: true, deep: 0.7, cracks: 1 },
    farm: { flash: true, cracks: 1 },
    fist: { flash: true, cracks: 2 },
    thigh: { flash: true, deep: 0.75, deepOnly: true, cracks: 1 },
    shin: { flash: true, cracks: 2, holes: 1 },
    clock: { flash: true, cracks: 3, crackMinLum: 150, holes: 0 },
    core: { noDmg: true, flash: true },
    egear: { noDmg: true, outline: 1.4 }, kgear: { noDmg: true, outline: 1.4 },
    rod1: { noDmg: true, outline: 1.4 }, rod2: { noDmg: true, outline: 1.4 }, blade: { noDmg: true, flash: true },
  },
  prefix: { deb: { noDmg: true, outline: 1.2 } },
};

export default {
  id: 'b_colossus', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(b, rig) {
    const q = quality(b.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(48), q,
      dmg: new DamageState(b.def?.phases ?? [0.65, 0.3]), lt: null, pf: 0, jolt: 0,
      debris: rig.man.groups?.debris ?? [], gone: { armL: false, armR: false, head: false, body: false }, deathStep: 0,
      arm: [{}, {}], ik: {}, pend: [], lastLift: [0, 0],
    };
  },
  draw(ctx, b, world, rig, st) { drawColossus(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const A = b.A, F = A.floor;
    let x0 = b.bx - 330, x1 = b.bx + 330;
    for (const a of b.arms ?? []) { x0 = Math.min(x0, a.fx - 110); x1 = Math.max(x1, a.fx + 110); }
    let y0 = F - 540, y1 = F + 12;
    if (b.dying > 0 || st?.shards?.list.length) { x0 = Math.min(x0, A.x0); x1 = Math.max(x1, A.x1); y0 = Math.min(y0, F - 640); }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.8;
    return { size: Math.max(10, (p.r ?? 10) * 1.1), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

const _a = [0, 0], _b = [0, 0], _c = [0, 0], _d = [0, 0], _e = [0, 0];

function drawColossus(ctx, b, world, rig, st) {
  const D = st.D, R = rig.parts;
  const qn = world.game?.settings?.quality ?? 'high';
  if (st.q.name !== qn) st.q = quality(world.game);
  const q = st.q, P = st.P, t = b.t;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, F = A.floor;
  P.update(dt, F);
  st.shards.update(dt, F);
  const dying = b.dying > 0, dT = dying ? 3.4 - b.dying : 0;
  const ratio = dying ? 0 : b.hp / b.stats.maxHp;
  const up = st.dmg.update(ratio, dt);
  const lvl = dying ? 2 : Math.max(0, st.dmg.level);
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 6);
  const flashOn = b.flashT > 0 && !dying;
  // 피격 섬광은 맞은 판정 부위에만: 정강이 = 그쪽 다리, 주먹 = 그쪽 팔, 시계판 = 흉갑 + 시계판, 코어 = 코어 (부위를 모르면 전체)
  const hp = flashOn ? b.hitPart : null, BP = b.parts ?? {};
  const fl = (key) => flashOn && (!hp || hp === BP[key]), flAll = flashOn && !hp;
  // 섬광은 부품을 그린 직후 바로 덧그린다 (끝에 한꺼번에 덧그리면 흉갑 뒤에 숨은 위팔·골반 뒤 허벅지의 흰 실루엣이
  // 흉갑·골반 위로 드러나고, 흉갑 섬광이 앞에 있는 머리·아래팔까지 밝혔다)
  const fa = flashOn ? clamp(b.flashT / 0.1, 0, 1) * 0.5 : 0;
  const FL = () => { if (D.rec) { D.flash(fa); D.rec = true; } };
  const V = (part, deep = false) => pickVariant(part, lvl, deep, null);
  const pw = clamp(b.power ?? 1, 0, 1), heat = clamp(b.heat ?? 0, 0, 1), door = clamp(b.door ?? 0, 0, 1);
  const cr = b.crouch ?? 0, gA = b.gearA ?? 0;
  const jx = st.jolt ? (rr.next() - 0.5) * 4 * st.jolt : 0;
  const bx = b.bx + jx;
  if (up > 0) { const y = b.wy(-262); P.burst('spark', bx, y, 20, { speed: 380, color: '#ffd080' }); P.burst('chip', bx, y, 10, { speed: 300, color: '#b8863b' }); P.burst('smoke', bx, y, 6, { speed: 60, color: '#d8d4e0' }); }
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  const ga0 = ctx.globalAlpha;
  if (dying) ctx.globalAlpha = ga0 * clamp(b.dying / 0.4, 0, 1);
  D.begin(ctx);
  // 경고 표시 (레인·내려찍기·시계추 호) — 몸 뒤
  b.paintBack?.(ctx, world);
  P.draw(ctx, 0);
  // 바닥선 아래는 그리지 않는다
  D.end(); D.save();
  ctx.beginPath(); ctx.rect(A.x0 - 800, F - 3000, A.w + 1600, 3002); ctx.clip();
  // 바닥 그림자
  D.img(puff('#000000'), 32, 32, bx, F - 2, 0, 230 / 32, 18 / 32, 0.65);
  // ── 몸통 / 골반 변환 ──
  const T = R.torso, Pv = R.pelvis, tk = T.k;
  const ty = b.wy(-262), breath = 1 + Math.sin(t * 1.6) * 0.006;
  const tp = (pv, out) => D.pt(T.clock[0], T.clock[1], pv[0], pv[1], bx, ty, 0, tk, tk * breath, out);
  const py = b.wy(-170);
  const pp = (pv, out) => D.pt(Pv.c[0], Pv.c[1], pv[0], pv[1], bx, py, 0, Pv.k, Pv.k, out);
  const bodyOn = !st.gone.body;
  // ── 다리 (허벅지 → 정강이 → 무릎 톱니), 골반 뒤 ──
  const legs = st._legs ??= [{ s: -1, i: 0 }, { s: 1, i: 1 }];
  for (const L of legs) {
    if (!bodyOn) break;
    const s = L.s, lift = b.stepLift?.[L.i] ?? 0;
    const H = pp(s < 0 ? Pv.hipL : Pv.hipR, _a);
    const hx = H[0], hy = H[1];
    const fx = bx + s * (92 + cr * 30), fy = F - lift;
    const Th = R.thigh, Sh = R.shin;
    const l1 = 86, l2 = 92;
    const k = ik2(hx, hy, fx, fy, l1, l2, s, st.ik);
    const kx = k.ex, ky = k.ey;
    D.rec = fl(s < 0 ? 'shinL' : 'shinR');
    limb(D, Th, V(Th, true), hx, hy, kx, ky, Th.k); FL();
    limb(D, Sh, V(Sh), kx, ky, fx, fy, Sh.k); FL();
    const kg = R.kgear;
    if (kg) { D.part(kg, kg.v.base, 'c', kx, ky, gA * 2 * s, kg.k, kg.k, 1); FL(); }
    // 착지 순간 (걸음): 먼지·증기
    if (L.fx != null && st.lastLift[L.i] > 4 && lift <= 0.5) { P.burst('smoke', fx, F - 6, 6, { speed: 90, angle: -PI / 2, spread: 1.4, color: '#8a8074' }); P.burst('spark', fx, F - 4, 6, { speed: 240, angle: -PI / 2, spread: 1.2, color: '#ffc070' }); }
    st.lastLift[L.i] = lift;
    L.fx = fx; L.fy = fy; L.kx = kx; L.ky = ky;
  }
  // ── 골반 ──
  D.rec = flAll;
  if (bodyOn) { D.part(Pv, V(Pv, true), 'c', bx, py, 0, Pv.k, Pv.k, 1); FL(); }
  // ── 팔: 어깨 → 팔꿈치 (위팔은 흉갑 견갑 뒤) ──
  const armGeo = st.arm;
  for (const a of b.arms ?? []) {
    const s = a.side, G = armGeo[s < 0 ? 0 : 1];
    const gone = s < 0 ? st.gone.armL : st.gone.armR;
    G.gone = gone || !bodyOn;
    if (G.gone) continue;
    armIK(b, a, G, R.fist);
    D.rec = fl(s < 0 ? 'fistL' : 'fistR');
    limb(D, R.uarm, V(R.uarm, true), G.sx, G.sy, G.ex, G.ey, R.uarm.k); FL();
  }
  // ── 흉갑 ──
  D.rec = fl('clock');
  if (bodyOn) {
    D.part(T, V(T), 'clock', bx, ty, 0, tk, tk * breath, 1); FL();
    glowOver(ctx, D, T, lvl, 'clock', bx, ty, 0, tk, tk * breath, 0.5 + heat * 0.5, st, t);
  } else if (dT < 3.25 && T.v.glow) {
    // 흉갑이 터진 자리: 발광 실루엣이 번쩍이며 사라짐
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    D.img(T.v.glow, T.clock[0], T.clock[1], bx, ty, 0, tk, tk, clamp((3.25 - dT) / 0.35, 0, 1) * 0.85);
    ctx.globalCompositeOperation = op;
  }
  D.rec = false;
  // 발판 덧그리기 (거대한 흉갑이 경기장 발판을 덮지 않게) — 팔·머리·시계는 발판 앞
  if (q.ledges !== false) {
    const cam = world.camera, cx0 = cam?.x ?? -1e9, cy0 = cam?.y ?? -1e9, cx1 = cx0 + (cam?.vw ?? 2e9), cy1 = cy0 + (cam?.vh ?? 2e9);
    D.end(); ledgesOver(ctx, world, Math.max(bx - 180, cx0), Math.max(ty - 130, cy0), Math.min(bx + 180, cx1), Math.min(F - 10, cy1));
  }
  D.end();
  // 굴뚝 불빛 · 용광로 창살 · 해골 손 뒤 불씨
  if (q.halos && pw > 0.05 && bodyOn) {
    for (const pv of [T.chL, T.chR]) { const c = tp(pv, _a); halo(ctx, c[0], c[1] + 4, 16 + heat * 10, FURN, (0.35 + heat * 0.4) * pw); }
    const f = tp(T.furn, _a), hot = 0.6 + 0.25 * Math.sin(t * 9) + heat * 0.5;
    halo(ctx, f[0], f[1], 52 + heat * 20, FURN, 0.35 * hot * pw);
  }
  if (heat > 0.25 && rr.next() < dt * 10 * heat * q.ambient) { const f = tp(T.furn, _a); P.emit('ember', f[0] + rr.range(-30, 30), f[1] + rr.range(-20, 10), rr.range(-30, 30), rr.range(-120, -60), { color: FURN, layer: 1 }); }
  // ── 코어 (시계판 문 뒤) ──
  const cc = tp(T.clock, _b), ccx = cc[0], ccy = cc[1];
  if (door > 0.05 && R.core && bodyOn) {
    const Co = R.core, pu = 1 + Math.sin(t * 14) * 0.04 + (dying ? Math.sin(t * 40) * 0.03 : 0);
    if (q.halos) halo(ctx, ccx, ccy, 110 * pu, FURN, 0.8 * door, true);
    D.rec = fl('core');
    D.part(Co, Co.v.base, 'c', ccx, ccy, Math.sin(t * 2) * 0.03, Co.k * pu, Co.k * pu, door); FL();
    D.rec = false;
    D.end();
    const hp = D.pt(Co.c[0], Co.c[1], Co.heart[0], Co.heart[1], ccx, ccy, 0, Co.k * pu, Co.k * pu, _c);
    if (q.halos) { halo(ctx, hp[0], hp[1], 34 + Math.sin(t * 14) * 6, '#ffffff', 0.55 * door, true); halo(ctx, hp[0], hp[1], 60, '#ff3a2a', 0.35 * door); }
    if (rr.next() < dt * 8 * door * q.ambient) P.emit('ember', ccx + rr.range(-30, 30), ccy + rr.range(-30, 30), rr.range(-60, 60), rr.range(-160, -60), { color: FURN_L, layer: 1 });
    if (rr.next() < dt * 3 * door * q.ambient) P.emit('blood', hp[0] + rr.range(-8, 8), hp[1] + 10, 0, 0, { hang: rr.range(0.1, 0.3), layer: 1 });
  }
  // ── 시계판 (왼쪽 경첩으로 열림) + 바늘 ──
  const Ck = R.clock;
  if (Ck && door < 0.98 && bodyOn) {
    const cs = Math.cos(door * PI * 0.62), k = Ck.k;
    const hx = ccx - (Ck.c[0] - Ck.hinge[0]) * k;
    D.rec = fl('clock');
    D.part(Ck, V(Ck), 'hinge', hx, ccy, 0, k * cs, k, 1); FL();
    D.rec = false;
    glowOver(ctx, D, Ck, lvl, 'hinge', hx, ccy, 0, k * cs, k, 0.4 + heat * 0.4, st, t + 1);
    D.end();
    const cx = hx + (Ck.c[0] - Ck.hinge[0]) * k * cs;
    if (cs > 0.25) {
      ctx.lineCap = 'round';
      const hand = (a, len, w) => { ctx.beginPath(); ctx.moveTo(cx, ccy); ctx.lineTo(cx + Math.sin(a) * len * cs, ccy - Math.cos(a) * len); ctx.lineWidth = w; ctx.stroke(); };
      ctx.strokeStyle = '#140a04';
      hand(b.clockH ?? 0, 24, 5);
      if (!b.pend) hand(b.clockM ?? 0, 38, 3);
      ctx.fillStyle = '#b8863b'; ctx.beginPath(); ctx.ellipse(cx, ccy, 5 * cs, 5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3a2008'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    if (heat > 0.3 && q.halos) halo(ctx, cx, ccy, 60, '#ff5a14', heat * 0.35);
  }
  // ── 아래팔 · 팔꿈치 톱니 · 갈퀴 주먹 · 사슬 (앞) ──
  for (const a of b.arms ?? []) {
    const s = a.side, G = armGeo[s < 0 ? 0 : 1];
    if (G.gone) continue;
    D.rec = fl(s < 0 ? 'fistL' : 'fistR');
    // 사슬 (발사 중: 손목 → 주먹)
    if (G.chain) {
      D.end();
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(G.wx, G.wy); ctx.lineTo(G.hx, G.hy);
      ctx.strokeStyle = '#2a2830'; ctx.lineWidth = 7; ctx.stroke();
      ctx.setLineDash([9, 6]); ctx.lineDashOffset = -t * 200;
      ctx.strokeStyle = '#9a98a8'; ctx.lineWidth = 3; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    limb(D, R.farm, V(R.farm), G.ex, G.ey, G.wx, G.wy, R.farm.k); FL();
    const eg = R.egear;
    if (eg) { D.part(eg, eg.v.base, 'c', G.ex, G.ey, -gA * 3 * s, eg.k, eg.k, 1); FL(); }
    const Fi = R.fist;
    D.part(Fi, V(Fi), 'wrist', G.hx, G.hy, G.hrot, Fi.k * (s < 0 ? -1 : 1) * 1.0, Fi.k, 1); FL();
    G.fistPose = [G.hx, G.hy, G.hrot, Fi.k * (s < 0 ? -1 : 1), Fi.k];
    if (a.glow > 0.02 && q.halos) { D.end(); const p = D.pt(Fi.wrist[0], Fi.wrist[1], Fi.palm[0], Fi.palm[1], G.hx, G.hy, G.hrot, Fi.k, Fi.k, _c); halo(ctx, p[0], p[1], 50 + a.glow * 40, FURN, a.glow * 0.8); halo(ctx, p[0], p[1], 20, '#ffffff', a.glow * 0.6, true); }
    // 날아가는 주먹: 불꽃
    if (a.fly && rr.next() < dt * 30 * q.ambient) P.emit('spark', a.fx - Math.sign(a.vx || s) * 30, a.fy + rr.range(-10, 10), -Math.sign(a.vx || s) * rr.range(100, 260), rr.range(-60, 60), { color: '#ffb060', layer: 1 });
    // 관절 기름 방울
    if (!dying && rr.next() < dt * 0.6 * q.ambient) P.emit('ichor', G.ex, G.ey + 10, 0, 0, { color: '#1a1208', hi: '#ffb060', hang: rr.range(0.2, 0.5), layer: 1 });
  }
  D.rec = false;
  // ── 머리 ──
  if (!st.gone.head && bodyOn) {
    const Hd = R.head, hx = bx + (b.look ?? 0) * 10, hy = b.wy(-362) - 22 + Math.sin(t * 2.1) * 1.5;
    const hr = (b.look ?? 0) * 0.04 + (dying ? Math.sin(t * 30) * 0.05 : 0);
    D.rec = flAll;
    D.part(Hd, V(Hd), 'eyes', hx, hy, hr, Hd.k, Hd.k, 1); FL();
    D.rec = false;
    glowOver(ctx, D, Hd, lvl, 'eyes', hx, hy, hr, Hd.k, Hd.k, 0.5 + heat * 0.3, st, t + 2);
    const eL = D.pt(Hd.eyes[0], Hd.eyes[1], Hd.eyeL[0], Hd.eyeL[1], hx, hy, hr, Hd.k, Hd.k, _c);
    const eR = D.pt(Hd.eyes[0], Hd.eyes[1], Hd.eyeR[0], Hd.eyeR[1], hx, hy, hr, Hd.k, Hd.k, _d);
    const mo = D.pt(Hd.eyes[0], Hd.eyes[1], Hd.mouth[0], Hd.mouth[1], hx, hy, hr, Hd.k, Hd.k, _e);
    D.end();
    const flick = 0.85 + 0.15 * Math.sin(t * 30), ec = b.phase >= 2 ? '#ffe0c0' : EYE;
    if (q.halos && pw > 0.02) for (const e of [eL, eR]) { halo(ctx, e[0], e[1], 16 * flick, EYE, 0.8 * pw); halo(ctx, e[0], e[1], 6, ec, 0.9 * pw, true); }
    if (!dying && rr.next() < dt * (0.5 + lvl * 0.8) * q.ambient) P.emit('blood', mo[0] + rr.range(-10, 10), mo[1], 0, 0, { hang: rr.range(0.2, 0.5), layer: 1 });
    st.headPose = [hx, hy, hr];
  }
  // ── 시계추 (몸 앞) ──
  if (b.pend && bodyOn) drawPendulum(ctx, D, b, rig, st, q);
  if (flashOn) D.flash(fa);   // 남은 기록(시계추 칼날) — 나머지는 부품마다 이미 덧그렸다
  else { D.rec = false; D.log.length = 0; }
  D.end();
  st.shards.draw(D);
  D.end();
  D.restore();   // 바닥 클립
  // 톱니 회전 불꽃 (빠르게 돌 때 · 과열)
  if ((b.gearSpd > 1 || heat > 0.5) && rr.next() < dt * 12 * q.ambient) { const s = rr.sign(); P.emit('spark', bx + s * 138, b.wy(-312), s * rr.range(60, 200), rr.range(-200, -60), { color: '#ffd080', layer: 1 }); }
  if (hit) {
    const hp = b.hitPart, x = hp ? hp.x + hp.w / 2 : bx, y = hp ? hp.y + hp.h / 2 : ty;
    P.burst('spark', x, y, 8, { speed: 320, color: '#ffe0a0' });
    P.burst('chip', x, y, 4, { speed: 240, color: '#b8863b' });
  }
  if (dying) deathFx(ctx, D, b, rig, st, dt, dT, tp);
  P.draw(ctx, 1);
  ctx.globalAlpha = ga0;
  ctx.imageSmoothingQuality = q0;
}

/** 원통형 팔다리 부품을 두 점 사이에 (top → bot). 길이는 세로 배율로 맞춘다 (0.6 … 1.5), 좌우 반전 없음 */
function limb(D, part, img, x0, y0, x1, y1, k) {
  if (!part || !img) return;
  const nat = Math.hypot(part.bot[0] - part.top[0], part.bot[1] - part.top[1]);
  const d = Math.hypot(x1 - x0, y1 - y0);
  const sy = clamp(d / nat, k * 0.6, k * 1.5);
  const rot = Math.atan2(y1 - y0, x1 - x0) - Math.atan2(part.bot[1] - part.top[1], part.bot[0] - part.top[0]);
  D.part(part, img, 'top', x0, y0, rot, k, sy, 1);
}

/** 팔 IK (로직 벡터 그림과 같은 식): 어깨(로직) → 팔꿈치 → 손목, 갈퀴 손 배치. G 에 결과 */
function armIK(b, a, G, Fi) {
  const s = a.side, sh = b.shoulder(s);
  const shx = sh.x, shy = sh.y;
  const fx = a.fx, fy = a.fy;
  // 손(갈퀴) 길이만큼 손목을 어깨 쪽으로 당긴 목표
  const hl = Fi ? Math.hypot(Fi.palm[0] - Fi.wrist[0], Fi.palm[1] - Fi.wrist[1]) * Fi.k : 40;
  let dx = fx - shx, dy = fy - shy, d = Math.hypot(dx, dy) || 1;
  let tx = fx - dx / d * hl * 0.8, ty = fy - dy / d * hl * 0.8;
  dx = tx - shx; dy = ty - shy; d = Math.hypot(dx, dy) || 1;
  const reach = L1 + L2 - 2;
  let wx = tx, wy = ty;
  if (d > reach) { wx = shx + dx / d * reach; wy = shy + dy / d * reach; d = reach; }
  const a0 = Math.atan2(wy - shy, wx - shx);
  const cosE = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const ea = a0 - s * Math.acos(cosE);
  G.sx = shx; G.sy = shy; G.ex = shx + Math.cos(ea) * L1; G.ey = shy + Math.sin(ea) * L1; G.wx = wx; G.wy = wy;
  // 손: 발사 중이면 날아가는 방향, 박혔으면 아래, 아니면 아래팔 방향
  let dir;
  if (a.fly) dir = Math.sign(a.vx || (fx - shx)) > 0 ? 0 : PI;
  else if (a.planted) dir = PI / 2;
  else dir = Math.atan2(wy - G.ey, wx - G.ex);
  G.chain = a.fly || Math.hypot(fx - wx, fy - wy) > hl * 1.3;
  if (G.chain) { G.hx = fx - Math.cos(dir) * hl * 0.8; G.hy = fy - Math.sin(dir) * hl * 0.8; }
  else { G.hx = wx; G.hy = wy; }
  // 손 그림: wrist → tip 이 dir 을 향하게
  const v = Fi ? Math.atan2(Fi.tip[1] - Fi.wrist[1], (Fi.tip[0] - Fi.wrist[0]) * (s < 0 ? -1 : 1)) : PI / 2;
  G.hrot = dir - v;
}

// ───────────────────────── 시계추 ─────────────────────────
function drawPendulum(ctx, D, b, rig, st, q) {
  const pd = b.pend, R = rig.parts;
  const pvx = b.bx, pvy = b.wy(-262);
  const a = -pd.a, L = pd.len;
  const dx = -Math.sin(a), dy = Math.cos(a);          // 막대 방향 (피벗 → 칼날), 로직: rotate(-a) 후 +y
  const r1 = R.rod1, r2 = R.rod2, Bl = R.blade;
  // 휘두름 잔상 (칼날 궤적)
  if (!pd.warn && q.smear) {
    D.end();
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,190,110,0.22)'; ctx.lineWidth = 30;
    const aa = PI / 2 - pd.a;
    ctx.beginPath(); ctx.arc(pvx, pvy, L, aa - 0.25, aa + 0.25); ctx.stroke();
    ctx.globalCompositeOperation = op;
  }
  const rodL = Math.max(10, L - 20);
  if (r1 && r2) {
    const mid = rodL * 0.5;
    limb(D, r1, r1.v.base, pvx, pvy, pvx + dx * mid, pvy + dy * mid, r1.k);
    limb(D, r2, r2.v.base, pvx + dx * mid, pvy + dy * mid, pvx + dx * rodL, pvy + dy * rodL, r2.k);
  }
  if (Bl) {
    // 초승달 칼날: 그림은 세로(볼록한 날이 오른쪽) → 날이 아래(막대 반대쪽)를 향하도록 회전
    const bxp = pvx + dx * L, byp = pvy + dy * L;
    const edgeA = Math.atan2(Bl.edge[1] - Bl.hub[1], Bl.edge[0] - Bl.hub[0]);
    const rot = Math.atan2(dy, dx) - edgeA;
    D.rec = b.flashT > 0 && !(b.dying > 0) && !b.hitPart;
    D.part(Bl, Bl.v.base, 'hub', bxp - dx * 18, byp - dy * 18, rot, Bl.k, Bl.k, 1);
    D.rec = false;
    D.end();
    const sp = Math.abs(Math.cos(((b.st ?? 0) - 0.9) / 1.4 * PI)) * (pd.warn ? 0 : 1);
    if (q.halos) halo(ctx, bxp + dx * 10, byp + dy * 10, 70, FURN, 0.2 + sp * 0.35);
    if (b.bx !== undefined && byp > b.A.floor - 60 && !pd.warn && rr.next() < 0.8) st.P.burst('spark', bxp, b.A.floor - 4, 2, { speed: 320, angle: -PI / 2, spread: 0.8, color: '#ffd080' });
  }
  const pk = R.kgear;
  if (pk) D.part(pk, pk.v.base, 'c', pvx, pvy, (b.gearA ?? 0) * 4, pk.k * 0.8, pk.k * 0.8, 1);
}

/** 손상 단계 균열 발광 (주황, 반 해상도, 가산, 맥동) */
function glowOver(ctx, D, part, lvl, pivot, x, y, rot, sx, sy, a, st, t) {
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 || part.v.deep_dmg1) ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? part.gl.dmg2 : part.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? part[pivot] : pivot;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + part.w * 0.01)) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 사망 붕괴 ─────────────────────────
// 로직: 무릎 꿇고 문이 열린 채 연쇄 폭발(3.4 s), 끝에 가라앉음. 채색: 1.0 s 왼팔 · 1.6 s 오른팔이 떨어지고 · 2.2 s 투구가 튕겨 날아감 ·
// 2.9 s 흉갑이 톱니·볼트·해골 파편으로 터짐 → 끝에 페이드 (ownsDeathFade)
function deathFx(ctx, D, b, rig, st, dt, dT, tp) {
  const R = rig.parts, P = st.P, sh = st.shards, fade = Math.max(0.3, 3.3 - dT);
  const dropArm = (i, key) => {
    st.gone[key] = true;
    const G = st.arm[i], s = i ? 1 : -1;
    if (G.ex == null) return;
    const Fa = R.farm, Fi = R.fist;
    const nat = Math.hypot(Fa.bot[0] - Fa.top[0], Fa.bot[1] - Fa.top[1]);
    const rot = Math.atan2(G.wy - G.ey, G.wx - G.ex) - Math.atan2(Fa.bot[1] - Fa.top[1], Fa.bot[0] - Fa.top[0]);
    sh.spawn(Fa.v.dmg2 ?? Fa.v.base, Fa.top[0], Fa.top[1], G.ex, G.ey, rot, Fa.k, clamp(Math.hypot(G.wx - G.ex, G.wy - G.ey) / nat, Fa.k * 0.6, Fa.k * 1.5), s * 120, -200, s * 3, { r: 20, fade });
    if (G.fistPose) { const [x, y, r, sx, sy] = G.fistPose; sh.spawn(Fi.v.dmg2 ?? Fi.v.base, Fi.wrist[0], Fi.wrist[1], x, y, r, sx, sy, s * 200, -300, s * 5, { r: 26, fade, bounce: 0.3 }); }
    P.burst('spark', G.ex, G.ey, 18, { speed: 360, color: '#ffd080' });
    P.burst('ichor', G.ex, G.ey, 8, { speed: 220, color: '#1a1208', hi: '#ffb060' });
  };
  if (!st.gone.armL && dT > 1.0) dropArm(0, 'armL');
  if (!st.gone.armR && dT > 1.6) dropArm(1, 'armR');
  if (!st.gone.head && dT > 2.2 && st.headPose) {
    st.gone.head = true;
    const Hd = R.head, [x, y, r] = st.headPose;
    sh.spawn(Hd.v.dmg2 ?? Hd.v.base, Hd.eyes[0], Hd.eyes[1], x, y, r, Hd.k, Hd.k, rr.range(-160, 160), -620, rr.range(-4, 4), { r: 50, fade, bounce: 0.25 });
    P.burst('spark', x, y + 40, 30, { speed: 420, color: '#ffd080' });
    P.burst('blood', x, y + 30, 12, { speed: 260 });
  }
  if (!st.gone.body && dT > 2.9) {
    st.gone.body = true;
    const c = tp(R.torso.clock, _a);
    for (let i = 0; i < 16 && st.debris.length; i++) {
      const p = R[st.debris[i % st.debris.length]], a = -PI / 2 + (rr.next() - 0.5) * 2.8, sp = rr.range(280, 620);
      sh.spawn(p.v.base, p.c[0], p.c[1], c[0] + rr.range(-90, 90), c[1] + rr.range(-60, 60), rr.next() * TAU, p.k * 1.4 * rr.sign(), p.k * 1.4, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-10, 10), { r: (p.r ?? 10) * 0.8, fade: 0.5 });
    }
    P.burst('spark', c[0], c[1], 40, { speed: 520, color: '#ffd080' });
    P.burst('smoke', c[0], c[1], 14, { speed: 160, color: '#e8e4ee' });
  }
  if (dT < 3 && rr.next() < dt * 12) { const x = b.bx + rr.range(-150, 150), y = b.wy(rr.range(-380, -60)); P.emit('spark', x, y, rr.range(-260, 260), rr.range(-420, -100), { color: '#ffd080', layer: 1 }); }
  if (dT < 3 && rr.next() < dt * 4) P.emit('smoke', b.bx + rr.range(-120, 120), b.wy(rr.range(-340, -150)), 0, -60, { color: '#6a5a50', layer: 1 });
}
