// 드라큘라 백작 (b_dracula) — 채색 컷아웃 퍼핏 렌더러 (1형태 귀족 · 변신 · 2형태 날개 달린 마왕, 한 아틀라스)
// 부품 (Kling): 1형태 — 옆얼굴 두 장(차가운 미소 / 송곳니 드러낸 포효) · 높은 붉은 깃 연미복 몸통 · 검은 소매 · 레이스 소맷부리의
//   편 손 / 움켜쥔 손 · 다리 · 박쥐 날개처럼 펼친 망토 반쪽(뒤 = 거울, 앞 = 손에 쥔 자락) · 몸을 감싼 망토 · 박쥐 3종 ·
//   변신 중간 프레임(찢어지는 연미복 사이로 붉은 비늘과 뿔이 솟는 백작).
//   2형태 — 뿔 달린 용머리(경첩 턱) · 비늘 몸통(가슴의 지옥불 문양) · 위팔 / 편 발톱 팔 / 움켜쥔 팔 · 역관절 다리(허벅지·정강이·발) ·
//   거대한 박쥐 날개(앞 / 뒤 거울) · 가시 꼬리(체인 타일 6개) · 찢긴 살점·날개막·뿔·뼈 파편 10종.
// 절차적 층: 지옥불 오라·눈빛·가슴 문양 맥동(가산 퍼프) · 입 속 불길 · 숨결 불꽃 혀 · 피 방울(매달렸다 떨어져 바닥에 튐) ·
//   손상 단계 균열 발광 · 변신(몸부림 → 균열 → 폭발 파편 → 불꽃 실루엣에서 마왕이 자라남) · 사망(날개가 재로 → 몸이 박쥐 떼로 흩어짐).
// 로직(src/game/bosses/b_dracula.js)의 상태를 읽기만 한다:
//   boss { cx, bottom, facing, t, st, state, form, cape, wrap, armL, armR, vanish, bats[], swarm, d2{scale,wing,jaw,hover,crouch,glowC},
//          hands{l,r}, redSky, phase, hp/stats.maxHp, flashT, dying, _ash, A{floor,x0,x1} }
// 판정은 바꾸지 않는다 (1형태 상반신 40×70 · 2형태 머리 88×76 / 가슴 128×100 / 다리 140×120). 머리·가슴은 그 상자에 맞춰 배치했다.
import { Drawer, Particles, Shards, halo, puff, rr, loadRig, pickVariant, quality, QUALITY, ik2, ledgesOver } from '../kit.js';

const DIR = 'painted/bosses/b_dracula';
const BLOOD = '#ff2a3a', HELL = '#ff7a2a', HELL_L = '#ffd070', EYE2 = '#ffd060', RUNE = '#ff9a3a';
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** 실제 품질 등급 (설정 'auto' 면 품질 조절기가 정한 game.quality) → 플래그 */
const tierOf = (game) => { const t = game?.quality ?? game?.tier ?? game?.settings?.quality; return QUALITY[t] ? t : quality(game).name; };
const qualityOf = (game) => QUALITY[tierOf(game)];

const DEF = {
  glow: '#ff5a2a',
  outline: { width: 2.0, color: 'rgba(8,2,4,0.92)' },
  defaults: { stain: 'rgb(70,18,22)', char: 1.2 },
  parts: {
    head_a: { flash: true, cracks: 2, holes: 0 }, head_b: { flash: true, cracks: 2, holes: 0 },
    torso: { flash: true, cracks: 2, holes: 1 },
    sleeve: { flash: true, deep: 0.62, cracks: 1, holes: 0 }, handO: { flash: true, deep: 0.62, cracks: 1, holes: 0 }, handC: { flash: true, deep: 0.62, cracks: 1, holes: 0 },
    leg: { flash: true, deep: 0.6, cracks: 1, holes: 0 },
    cape: { membrane: true, holes: 3, cracks: 0, char: 0.6 }, cloak: { flash: true, membrane: true, holes: 2, cracks: 0, char: 0.6 },
    morph: { noDmg: true, flash: true },
    dhead: { flash: true, cracks: 3, holes: 0 }, djaw: { flash: true, cracks: 1, holes: 0 },
    dtorso: { flash: true, cracks: 4, holes: 0 },
    dua: { flash: true, deep: 0.6, cracks: 2, holes: 0 }, dfaO: { flash: true, deep: 0.6, cracks: 2, holes: 0 }, dfaC: { flash: true, deep: 0.6, cracks: 2, holes: 0 },
    dthigh: { flash: true, deep: 0.6, cracks: 1, holes: 0 }, dshin: { flash: true, deep: 0.6, cracks: 1, holes: 0 }, dfoot: { flash: true, deep: 0.6, cracks: 1, holes: 0 },
    dwing: { membrane: true, holes: 4, cracks: 2 },
  },
  prefix: { dt: { flash: true, cracks: 1, holes: 0 }, deb: { noDmg: true, outline: 1.3 }, bat: { noDmg: true, outline: 1.0 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_dracula', kind: 'boss', ownsDeathFade: true,
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    const names = Object.keys(rig.parts);
    rig.debs = names.filter((n) => n.startsWith('deb'));
    rig.batP = ['bat0', 'bat2', 'bat1'].map((n) => rig.parts[n]).filter(Boolean);   // 날개 위 · 중간 · 아래
    rig.tail = ['dt0', 'dt1', 'dt2', 'dt3', 'dt4', 'dtcap'].map((n) => rig.parts[n]).filter(Boolean);
    rig.art = makeArt(rig);
    return rig;
  },
  init(b, rig) {
    const q = qualityOf(b.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(60), q, lt: null, pf: 0, jolt: 0, lvl: -1, lvlSeen: -1,
      form: b.form ?? 1, head: 'a', headT: 0, W: [0, 0], W2: [0, 0], L: { x: 0, y: 0, f: 1, lean: 0, c: 1, s: 0, sc: 1 },
      gone: { wingF: false, wingN: false, body: false }, tailP: [], eyeW: [0, 0], runeW: [0, 0], mouthW: [0, 0], ik: {}, dripT: 0,
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) { return bounds(b, st, out); },
  lights(L, b, rig, st) {
    if (b.dying > 0 && st.gone.body) return;
    if ((b.form ?? 1) === 2) L.add(st.runeW[0], st.runeW[1], 120 * (b.d2?.scale ?? 1), RUNE, 0.45 + (b.d2?.glowC ?? 0) * 0.3);
    else if (b.vanish < 0.8) L.add(st.eyeW[0], st.eyeW[1], 60, BLOOD, 0.45);
  },
  debris(i, rig) {
    const names = rig.debs; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k;
    return { size: Math.max(8, (p.r ?? 8) * 1.2), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 경계 ─────────────────────────
function bounds(b, st, out) {
  let x0, x1, y0, y1;
  if ((b.form ?? 1) === 2) {
    const s = Math.max(0.2, b.d2?.scale ?? 1), top = b.bottom - (b.d2?.hover ?? 0);
    x0 = b.cx - 340 * s; x1 = b.cx + 340 * s; y0 = top - 420 * s; y1 = b.bottom + 12;
    if (b.state === 'transform') { x0 = Math.min(x0, b.cx - 200); x1 = Math.max(x1, b.cx + 200); y0 = Math.min(y0, b.bottom - 330); }
  } else {
    x0 = b.cx - 200; x1 = b.cx + 200; y0 = b.bottom - 200; y1 = b.bottom + 12;
  }
  // 박쥐 떼 (로직 bats[] · 돌진하는 박쥐 무리) — 한 번 훑어 최소·최대
  const B = b.bats;
  if (B?.length) for (let i = 0; i < B.length; i++) { const q = B[i]; if (q.x - 24 < x0) x0 = q.x - 24; if (q.x + 24 > x1) x1 = q.x + 24; if (q.y - 20 < y0) y0 = q.y - 20; if (q.y + 20 > y1) y1 = q.y + 20; }
  if (b.swarm) { x0 = Math.min(x0, b.swarm.x - 90); x1 = Math.max(x1, b.swarm.x + 90); y0 = Math.min(y0, b.swarm.y - 70); }
  if ((b.dying > 0 || st?.shards?.list.length) && b.A) { x0 = Math.min(x0, b.A.x0); x1 = Math.max(x1, b.A.x1); y0 = Math.min(y0, b.bottom - 460); y1 = Math.max(y1, b.A.floor + 8); }
  out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
  return out;
}

// ───────────────────────── 지역 → 월드 ─────────────────────────
// 지역 좌표: 원점 = 발밑(2형태는 떠오른 만큼 위), x = 바라보는 쪽, y = 아래. lean 은 허리 높이(LEAN_Y) 기준 회전
const LEAN_Y = -70;
function setL(L, x, y, f, lean, sc = 1) { L.x = x; L.y = y; L.f = f; L.lean = lean; L.c = Math.cos(lean); L.s = Math.sin(lean); L.sc = sc; }
function W(L, lx, ly, out) {
  lx *= L.sc; ly *= L.sc;
  const oy = LEAN_Y * L.sc, dy = ly - oy;
  out[0] = L.x + L.f * (L.c * lx - L.s * dy); out[1] = L.y + oy + L.s * lx + L.c * dy;
  return out;
}
const _pw = [0, 0], _q = [0, 0], _q2 = [0, 0];
/** 부품 pv 피벗을 지역 (lx,ly) 에, 지역 회전 lrot, 배율 sc, 가로 배율 sxm(음수 = 거울), 세로 배율 sym */
function put(D, L, part, img, pivot, lx, ly, lrot, alpha = 1, sc = 1, sxm = 1, sym = 1) {
  const w = W(L, lx, ly, _pw), k = part.k * sc * L.sc;
  D.part(part, img, pivot, w[0], w[1], L.f * (lrot + L.lean), k * sxm * L.f, k * sym, alpha);
}
function axis(p, a, b) {
  const key = a + '>' + b, c = (p._ax ??= {});
  if (!c[key]) { const A = p[a], B = p[b]; c[key] = { a: Math.atan2(B[1] - A[1], B[0] - A[0]), len: Math.hypot(B[0] - A[0], B[1] - A[1]) * p.k }; }
  return c[key];
}
/** 부품 p 의 피벗 pv 가 지역 (lx,ly), 회전 lrot, 배율 sc (sxm/sym) 로 놓였을 때 텍셀 점 q 의 지역 좌표 */
function localPt(p, pv, q, lx, ly, lrot, sc, out, sxm = 1, sym = 1) {
  const A = p[pv], dx = (q[0] - A[0]) * p.k * sc * sxm, dy = (q[1] - A[1]) * p.k * sc * sym, c = Math.cos(lrot), s = Math.sin(lrot);
  out[0] = lx + c * dx - s * dy; out[1] = ly + s * dx + c * dy; return out;
}

// ───────────────────────── 메인 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D;
  if (st.q.name !== tierOf(world.game)) st.q = qualityOf(world.game);
  if (st.rig !== rig) st.rig = rig;
  const q = st.q, P = st.P;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now; st._dt = dt;
  const A = b.A, F = A.floor, form = b.form ?? 1;
  P.update(dt, F);
  st.shards.update(dt, F);
  const dying = b.dying > 0, dT = dying ? 3.6 - b.dying : 0;
  // 손상 단계: 1형태 75%·60%, 2형태(50%↓)는 35%·20% (새 몸이라 0부터)
  const ratio = dying ? 0 : b.hp / b.stats.maxHp;
  const lvl = dying ? 2 : form === 1 ? (ratio < 0.75 ? 1 : 0) + (ratio < 0.6 ? 1 : 0) : (ratio < 0.35 ? 1 : 0) + (ratio < 0.2 ? 1 : 0);
  if (st.lvlSeen === form && lvl > st.lvl && !dying) levelBurst(st, b, rig, lvl, form);
  st.lvl = lvl; st.lvlSeen = form;
  // 형태 전환: 변신 연출 중 1 → 2 가 되는 순간 백작의 몸이 터져 흩어진다
  // (1형태에서 한 방에 쓰러진 경우도 사망 시작에 백작의 몸이 터져 흩어진다 — 로직이 즉시 마왕으로 바꿔 사망시킴)
  if (form !== st.form) { if (form === 2 && (b.state === 'transform' || dying) && st.form === 1) transformBurst(st, b, rig); st.form = form; }
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) { st.jolt = 1; st.flashSel = struckPart(b, form); hitBurst(st, b, form); }
  st.jolt = Math.max(0, st.jolt - dt * 6);

  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  D.begin(ctx); D.end();
  b.paintBack?.(ctx, world);           // 붉은 하늘·피의 달·예고선 (로직)
  P.draw(ctx, 0);
  if (form === 1) drawCount(ctx, D, b, world, rig, st, lvl, dt);
  else drawDemon(ctx, D, b, world, rig, st, lvl, dt, dying, dT);
  D.end();
  st.shards.draw(D);
  D.end();
  b.paintFront?.(ctx, world);          // 박쥐 (로직 → 채색 박쥐 art.bat)
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 1형태: 백작 ─────────────────────────
function drawCount(ctx, D, b, world, rig, st, lvl, dt) {
  const R = rig.parts, L = st.L, q = st.q, P = st.P, t = b.t, f = b.facing || 1;
  const tf = b.state === 'transform';
  const tt = tf ? (b.st ?? 0) : 0;
  const va = clamp(1 - (b.vanish ?? 0), 0, 1);
  if (va <= 0.004) return;
  const V = (p, deep = false) => pickVariant(p, lvl, deep, null);
  // 몸부림: 변신 중 떨림 + 부풂
  const writhe = tf ? smooth(0, 0.5, tt) : 0;
  const jx = (st.jolt > 0 ? (rr.next() - 0.5) * 3 * st.jolt : 0) + (tf ? Math.sin(t * 50) * 1.6 * writhe : 0);
  const lean = tf ? Math.sin(t * 13) * 0.08 * writhe - 0.1 * writhe : (b.state === 'hellfire' || b.state === 'spiral' ? -0.05 : 0.02) + Math.sin(t * 1.3) * 0.012;
  const sc = 1 + (tf ? (0.06 + 0.05 * Math.sin(t * 22)) * writhe : 0);
  setL(L, b.cx + jx, b.bottom, f, lean, sc);
  const cp = clamp(b.cape ?? 0.15, 0, 1), wr = clamp(b.wrap ?? 0, 0, 1);
  const T = R.torso, breathe = Math.sin(t * 1.6) * 0.8;
  // 몸통 배치: 엉덩이 피벗 → 지역 (-2, -58)
  const tx = -2, ty = -58 + breathe * 0.3, trot = 0;
  const tp = (pv, out) => localPt(T, 'hip', T[pv], tx, ty, trot, 1, out);
  const neck = tp('neck', st._nk ??= [0, 0]), shN = tp('shN', st._sn ??= [0, 0]), shF = tp('shF', st._sf ??= [0, 0]), back = tp('back', st._bk ??= [0, 0]);
  // 변신 후반: 반쯤 변한 몸(morph)으로 교차
  const mk = tf ? smooth(0.55, 1.15, tt) : 0;
  const a0 = va * (1 - mk * 0.9);
  D.startFlash(); if (!(b.flashT > 0)) D.rec = false;
  // 피격 섬광은 판정 부위(상반신 40×70 = 머리·몸통·감싼 망토)에만 — 다리·팔은 기록하지 않는다 (BOSS_PIPELINE §9)
  const rec0 = D.rec;
  if (a0 > 0.01) {
    // 1) 뒤 망토 (거울, 몸 뒤로 드리움 → 펼치면 박쥐 날개처럼)
    const cw = lerp(0.34, 1.02, cp) * (1 - wr * 0.6), crot = lerp(0.12, -0.34, cp) + Math.sin(t * 2) * 0.03 * (1 - cp);
    put(D, L, R.cape, V(R.cape), 'root', back[0] + 2, back[1] + 2, crot, a0, 1, -cw, lerp(1, 0.92, cp));
    // 2) 먼 다리 · 먼 팔 (어둡게)
    const hip = tp('hip', st._hp ??= [0, 0]);
    D.rec = false;
    put(D, L, R.leg, V(R.leg, true), 'hip', hip[0] - 5, hip[1] - 2, 0.03, a0, 1, 0.72);
    countArm(D, L, rig, b, st, shF[0], shF[1], -1, b.armL ?? 0, a0 * 0.95, V, true);
    // 3) 가까운 다리 · 몸통
    put(D, L, R.leg, V(R.leg), 'hip', hip[0] + 4, hip[1] - 1, -0.04, a0, 1, 0.72);
    D.rec = rec0;
    put(D, L, T, V(T), 'hip', tx, ty, trot, a0);
  }
  D.end();
  if (q.ledges) ledgesOver(ctx, world, b.cx - 170, b.bottom - 170, b.cx + 170, b.bottom);
  if (a0 > 0.01) {
    // 4) 머리 (평소 = 미소 / 공격·변신 = 포효) — 높은 깃은 몸통 쪽(머리 뒤)에 있다
    const angry = tf || b.state === 'hellfire' || b.state === 'spiral' || b.state === 'summon' || (b.state === 'intro' && (b.st ?? 0) > 0.6) || (b.state === 'inferno' && (b.st ?? 0) < 1.4) || (b.state === 'tele' && (b.st ?? 0) > 0.85 && (b.st ?? 0) < 1.15) || (b.state === 'batdash' && b.reform);
    const H = angry ? R.head_b : R.head_a;
    const hrot = (angry ? -0.1 : 0.02) + Math.sin(t * 1.1) * 0.03 + (tf ? Math.sin(t * 31) * 0.08 * writhe : 0);
    const hx = neck[0] + 1, hy = neck[1] + 6;
    put(D, L, H, V(H), 'neck', hx, hy, hrot, a0);
    const e = localPt(H, 'neck', H.eyeN, hx, hy, hrot, 1, _q); W(L, e[0], e[1], st.eyeW);
    // 5) 앞 망토 자락 (앞손이 쥠 — 펼칠 때만)
    const fk = smooth(0.3, 0.7, cp) * (1 - wr);
    if (fk > 0.01) {
      const up = clamp(b.armR ?? 0, 0, 1);
      put(D, L, R.cape, V(R.cape), 'root', shN[0] + 2, shN[1] - 6, lerp(0.9, 0.25, up) + Math.sin(t * 2.4) * 0.03, a0 * fk, 1, lerp(0.3, 0.55, cp), 0.9);
    }
    // 6) 가까운 팔
    D.rec = false; countArm(D, L, rig, b, st, shN[0], shN[1], 1, b.armR ?? 0, a0, V, false); D.rec = rec0;
    // 7) 몸을 감싼 망토 (순간이동·박쥐 돌진 준비)
    if (wr > 0.02) put(D, L, R.cloak, V(R.cloak), 'neck', neck[0] - 1, neck[1] - 2, Math.sin(t * 3) * 0.02, a0 * Math.min(1, wr * 1.4));
  }
  // 8) 변신 중간 몸 (찢어지는 연미복 사이로 붉은 비늘·뿔)
  if (mk > 0.01) {
    const pulse = 1 + 0.05 * Math.sin(t * 26) + 0.04 * mk;
    put(D, L, R.morph, R.morph.v.base, 'foot', 0, 0, Math.sin(t * 17) * 0.05, va * mk, 0.92 * pulse);
  }
  if (b.flashT > 0) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.55 * va); else { D.rec = false; D.log.length = 0; }
  D.end();
  // 균열 발광 (손상 단계 · 변신 중 몸속 지옥불이 새어 나옴)
  const glowK = tf ? 0.4 + writhe * 0.9 : 0.45;
  if (a0 > 0.01) glowOver(ctx, D, L, R.torso, tf ? 2 : lvl, 'hip', tx, ty, trot, glowK * a0, t, st);
  // 붉은 눈빛 · 헬파이어 손 · 오라
  if (q.halos && a0 > 0.05) {
    halo(ctx, st.eyeW[0], st.eyeW[1], 7 + Math.sin(t * 9) * 1.5, BLOOD, 0.75 * a0, true);
    if (b.state === 'hellfire' && st.handW) halo(ctx, st.handW[0], st.handW[1], 22 + Math.sin(t * 20) * 4, HELL, 0.85 * a0, true);
    if (b.state === 'spiral' || b.state === 'summon') halo(ctx, b.cx, b.bottom - 92, 40 + Math.sin(t * 8) * 6, BLOOD, 0.35 * a0);
    if (tf) { halo(ctx, b.cx, b.bottom - 80, 90 + writhe * 60, BLOOD, 0.3 + writhe * 0.35); halo(ctx, b.cx, b.bottom - 90, 30 + mk * 40, HELL_L, 0.3 * writhe, true); }
  }
  // 입가 피 (가끔 매달렸다 떨어짐) · 발밑 붉은 안개
  st.dripT -= dt;
  if (st.dripT <= 0 && a0 > 0.5 && q.ambient > 0.3) { st.dripT = rr.range(0.9, 2.2); const m = W(L, 8, -123, st.W); P.emit('blood', m[0], m[1], 0, 0, { hang: rr.range(0.3, 0.7), size: 1.4, layer: 1 }); }
  if (rr.next() < dt * 3 * q.ambient && a0 > 0.3) P.emit('smoke', b.cx + rr.range(-30, 30), b.bottom - rr.range(0, 12), rr.range(-15, 15), -12, { color: '#3a0612', size: rr.range(10, 18), layer: 0 });
  if (tf && rr.next() < dt * 40 * q.ambient) {
    const a = rr.next() * TAU, r = rr.range(20, 70);
    P.emit(rr.chance(0.5) ? 'blood' : 'ember', b.cx + Math.cos(a) * r, b.bottom - 80 + Math.sin(a) * r, Math.cos(a) * 60, Math.sin(a) * 60 - 80, { color: rr.chance(0.5) ? BLOOD : HELL, layer: 1 });
  }
}

/** 백작 팔: 로직 armL/armR (0 내림 ~ 1 들어올림) → 벡터와 같은 각도식. 소매 두 마디(늘린 소매 스프라이트) + 손 */
function countArm(D, L, rig, b, st, sx, sy, side, raise, alpha, V, far) {
  const R = rig.parts, S = R.sleeve;
  const a = lerp(0.15, side > 0 ? 2.3 : 2.0, raise), ea = a + (raise > 0.5 ? -0.3 : 0.25);
  const L1 = 23, L2 = 21;
  const d1 = Math.atan2(Math.cos(a), side * Math.sin(a)), d2 = Math.atan2(Math.cos(ea), side * Math.sin(ea));
  const ex = sx + Math.cos(d1) * L1, ey = sy + Math.sin(d1) * L1, hx = ex + Math.cos(d2) * L2, hy = ey + Math.sin(d2) * L2;
  const sl = axis(S, 'a', 'b');
  put(D, L, S, V(S, far), 'a', sx, sy, d1 - sl.a, alpha, 1, L1 / sl.len, 0.95);
  put(D, L, S, V(S, far), 'a', ex, ey, d2 - sl.a, alpha, 1, L2 / sl.len, 0.85);
  const open = raise > 0.45 || b.state === 'hellfire' || b.state === 'summon';
  const Hd = open ? R.handO : R.handC, ha = axis(Hd, 'wr', 'tip');
  put(D, L, Hd, V(Hd, far), 'wr', hx, hy, d2 - ha.a, alpha, 1.05);
  if (!far) { const tip = localPt(Hd, 'wr', Hd.palm, hx, hy, d2 - ha.a, 1.05, _q2); st.handW = W(L, tip[0], tip[1], st.handW ?? [0, 0]); }
}

// ───────────────────────── 2형태: 마왕 ─────────────────────────
function drawDemon(ctx, D, b, world, rig, st, lvl, dt, dying, dT) {
  const R = rig.parts, L = st.L, q = st.q, P = st.P, t = b.t, f = b.facing || 1, d = b.d2;
  const s = d.scale ?? 1;
  if (s <= 0.01) return;
  // 사망 중에는 변신 연출이 아니다: 1형태에서 한 방에 쓰러지면 state 가 'transform' 인 채로 사망(onDeath → becomeDemon(true))해
  // st 가 멈춘 채 반투명 몸 + 지옥불 실루엣으로 3.6초 내내 남았다 → 사망은 늘 완성된 마왕 몸에서 시작
  const tf = b.state === 'transform' && !dying, tt = tf ? (b.st ?? 0) : 9;
  const G = st.gone;
  if (G.body) { if (dying) deathTick(st, b, rig, dT); return; }
  const V = (p, deep = false) => pickVariant(p, lvl, deep, null);
  const cr = (d.crouch ?? 0) * 20, breathe = Math.sin(t * 1.6) * 2;
  const jx = (st.jolt > 0 ? (rr.next() - 0.5) * 5 * st.jolt : 0) + (dying ? Math.sin(t * 60) * 2 * Math.min(1, dT) : 0);
  const lean = (b.state === 'claw' ? 0.08 * (b.st > 0.45 ? 1 : -1) : 0) + (d.crouch ?? 0) * 0.06 + Math.sin(t * 1.2) * 0.01;
  setL(L, b.cx + jx, b.bottom - (d.hover ?? 0), f, lean, s);
  // 걸음: d_idle 에서 플레이어 쪽으로 천천히 걸을 때(로직 60px/s) 발을 번갈아 들어 딛는다 (벡터는 미끄러지듯 이동)
  const wvx = st.wpx == null || dt <= 0 ? 0 : (b.cx - st.wpx) / dt; st.wpx = b.cx;
  const walking = b.state === 'd_idle' && (d.hover ?? 0) < 4 && Math.abs(wvx) > 8 && Math.abs(wvx) < 400;
  st.walkK = clamp((st.walkK ?? 0) + (walking ? dt * 4 : -dt * 4), 0, 1);
  if (st.walkK > 0) { st.gait = (st.gait ?? 0) + dt * 5.2; if (walking) st.wdir = Math.sign(wvx * f) || 1; } else st.gait = 0;
  const wk = st.walkK, gu = st.gait ?? 0, wd = st.wdir ?? 1;
  const bob = -Math.abs(Math.cos(gu)) * 3 * wk;
  const T = R.dtorso;
  const tx = 0, ty = -118 + cr + breathe * 0.4 + bob, trot = -0.02 * (d.crouch ?? 0);
  const tp = (pv, out) => localPt(T, 'hip', T[pv], tx, ty, trot, 1, out);
  const neckP = tp('neck', st._dn ??= [0, 0]), shN = tp('shN', st._dsn ??= [0, 0]), shF = tp('shF', st._dsf ??= [0, 0]), wingR = tp('wing', st._dw ??= [0, 0]), tailR = tp('tail', st._dtr ??= [0, 0]), hip = tp('hip', st._dh ??= [0, 0]);
  // 자라나는 동안(변신)·사망 붕괴 전 투명도
  const grow = tf ? smooth(1.75, 2.6, tt) : 1;
  const a0 = clamp(0.25 + grow * 0.75, 0, 1);
  D.startFlash(); if (!(b.flashT > 0) || tf) D.rec = false;
  // 피격 섬광은 맞은 판정 부위(머리 / 가슴 / 다리)에만 — 날개·꼬리·팔은 판정이 없으니 번쩍이지 않는다 (BOSS_PIPELINE §9)
  const rec0 = D.rec, sel = st.flashSel, recOn = (g) => { D.rec = rec0 && (!sel || sel === g); };
  D.rec = false;
  // 1) 날개 (뒤 = 거울, 앞 = 그대로). 로직 wing 0~1 = 접힘~활짝
  const open = clamp(d.wing ?? 0.5, 0, 1), k = 0.35 + open * 0.65, flap = Math.sin(t * 2.2) * 0.08 + (b.state === 'gust' ? Math.sin(t * 9) * 0.18 : 0);
  const wrot = -(flap + (1 - k) * 0.7) - 0.05, wsx = lerp(0.62, 1, k), wsy = lerp(0.8, 1, k);
  if (!G.wingF) put(D, L, R.dwing, V(R.dwing), 'root', wingR[0] - 6, wingR[1] + 4, -wrot + 0.05, a0 * 0.9, 0.92, -wsx, wsy);
  // 2) 꼬리 (체인 타일)
  drawTail(D, L, rig, st, tailR, t, a0, V, cr);
  if (!G.wingN) put(D, L, R.dwing, V(R.dwing), 'root', wingR[0] + 4, wingR[1] + 2, wrot, a0, 1, wsx, wsy);
  // 3) 먼 다리 · 먼 팔
  recOn('legs');
  leg(D, L, rig, st, hip[0] - 10, hip[1] - 4, -30 + Math.sin(gu + PI) * 16 * wk * wd, cr, a0 * 0.95, V, true, Math.max(0, Math.cos(gu + PI) * wd) * 12 * wk);
  const armBack = f > 0 ? b.hands.l : b.hands.r, armFront = f > 0 ? b.hands.r : b.hands.l;
  D.rec = false;
  demonArm(D, L, rig, b, st, shF[0], shF[1], armBack, a0 * 0.95, V, true, dying);
  recOn('legs');
  // 4) 가까운 다리 · 몸통
  leg(D, L, rig, st, hip[0] + 8, hip[1] - 2, 30 + Math.sin(gu) * 16 * wk * wd, cr, a0, V, false, Math.max(0, Math.cos(gu) * wd) * 12 * wk);
  recOn('chest');
  put(D, L, T, V(T), 'hip', tx, ty, trot, a0);
  D.end();
  if (q.ledges) { const w0 = W(L, -150, -330, st.W), w1 = W(L, 150, 0, st.W2); ledgesOver(ctx, world, Math.min(w0[0], w1[0]) - 120 * s, w0[1], Math.max(w0[0], w1[0]) + 120 * s, b.bottom); }
  // 5) 머리 (입 속 → 턱 → 머리)
  const K = R.dhead, J = R.djaw;
  const hx = neckP[0] - 31, hy = neckP[1] + 32;
  const hrot = Math.sin(t * 1.1) * 0.03 + (b.state === 'meteor' || b.state === 'nova' ? -0.12 : 0) + (tf && tt > 2.7 && tt < 3.6 ? -0.18 : 0) + (dying ? Math.sin(t * 34) * 0.06 : 0);
  const jaw = clamp(d.jaw ?? 0.12, 0, 1), jrot = lerp(-0.26, 0.1, jaw);
  mouthFill(ctx, D, L, K, 'neck', hx, hy, hrot, a0, jaw, d.glowC ?? 0, t);
  recOn('head');
  const hg = localPt(K, 'neck', K.hinge, hx, hy, hrot, 1, _q);
  put(D, L, J, V(J), 'hinge', hg[0], hg[1], hrot + jrot, a0);
  put(D, L, K, V(K), 'neck', hx, hy, hrot, a0);
  const e = localPt(K, 'neck', K.eyeN, hx, hy, hrot, 1, _q2); W(L, e[0], e[1], st.eyeW);
  const m = localPt(K, 'neck', K.mouth, hx, hy, hrot, 1, _q2); W(L, m[0], m[1], st.mouthW);
  // 6) 가까운 팔
  D.rec = false;
  demonArm(D, L, rig, b, st, shN[0], shN[1], armFront, a0, V, false, dying);
  if (b.flashT > 0 && !tf) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.55); else { D.rec = false; D.log.length = 0; }
  D.end();
  // 자라나는 동안: 지옥불 실루엣 (가산 발광) 이 몸을 덮었다 걷힘
  if (tf && tt < 3.0) {
    const gk = 1 - smooth(1.7, 2.9, tt);
    if (gk > 0.02) {
      const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
      put(D, L, T, T.v.glow ?? T.v.flash, 'hip', tx, ty, trot, gk * 0.9); put(D, L, K, K.v.glow ?? K.v.flash, 'neck', hx, hy, hrot, gk * 0.9);
      D.end(); ctx.globalCompositeOperation = op;
    }
  }
  // 균열 발광 · 가슴 문양 · 눈 · 입김
  const rw = localPt(T, 'hip', T.rune, tx, ty, trot, 1, _q); W(L, rw[0], rw[1], st.runeW);
  glowOver(ctx, D, L, T, lvl, 'hip', tx, ty, trot, 0.55 * a0, t, st);
  glowOver(ctx, D, L, K, lvl, 'neck', hx, hy, hrot, 0.45 * a0, t + 1.3, st);
  if (q.halos) {
    const pu = 0.7 + 0.3 * Math.sin(t * 5) + (d.glowC ?? 0) * 0.5;
    halo(ctx, st.runeW[0], st.runeW[1], 26 * pu * s, RUNE, 0.55 * a0, true);
    halo(ctx, st.eyeW[0], st.eyeW[1], 12 * s, EYE2, 0.9 * a0, true);
    halo(ctx, b.cx, b.bottom - 6, 150 * s, HELL, 0.22 * a0);
    if (jaw > 0.4 || (d.glowC ?? 0) > 0.2) halo(ctx, st.mouthW[0], st.mouthW[1], (18 + jaw * 20 + (d.glowC ?? 0) * 20) * s, HELL, 0.5 + (d.glowC ?? 0) * 0.4, true);
  }
  // 지옥불 숨결 · 광선 충전: 입에서 불꽃 혀
  if (b.state === 'breath' && (b.st ?? 0) > 0.35 && (b.st ?? 0) < 1.8 && q.flames) flame(ctx, st.mouthW[0], st.mouthW[1], f > 0 ? 0.55 : PI - 0.55, 70 * s, 16 * s, t, HELL, 0.7, 0, q.flames);
  if (b.state === 'beams' && b.beam && q.halos) halo(ctx, b.beam.x0, b.beam.y0, 20 + b.beam.k * 30, BLOOD, 0.6 + b.beam.k * 0.4, true);
  // 불씨 · 발톱의 피 · 변신 포효 충격
  if (rr.next() < dt * 10 * q.ambient) P.emit('ember', b.cx + rr.range(-90, 90) * s, b.bottom - rr.range(0, 60), rr.range(-20, 20), rr.range(-120, -40), { color: HELL, layer: 1 });
  st.dripT -= dt;
  if (st.dripT <= 0 && st.clawW && q.ambient > 0.3) { st.dripT = rr.range(0.5, 1.4); P.emit('blood', st.clawW[0], st.clawW[1], 0, 0, { hang: rr.range(0.2, 0.5), size: 2, layer: 1 }); }
  if (dying) deathTick(st, b, rig, dT);
}

/** 마왕 팔: 어깨 → 로직 손 위치 (월드 → 지역), 두 관절 IK. 발톱 휘두를 땐 편 손, 예고(움켜쥠)엔 쥔 손 */
function demonArm(D, L, rig, b, st, sx, sy, hand, alpha, V, far, dying) {
  const R = rig.parts, U = R.dua;
  const d = b.d2, s = d.scale || 1, f = b.facing || 1;
  // 손 위치: 월드 → 지역 (L 의 역변환: lean 은 작으니 무시하지 않고 정확히)
  const wx = (hand.x - L.x) * f / L.sc, wy0 = (hand.y - L.y) / L.sc - LEAN_Y, c = L.c, sn = L.s;
  const lx = c * wx + sn * wy0, ly = -sn * wx + c * wy0 + LEAN_Y;
  const clench = b.state === 'claw' && (b.st ?? 0) < 0.45 && !far;
  const Fo = clench ? R.dfaC : R.dfaO;
  const au = axis(U, 'sh', 'el'), af = axis(Fo, 'el', 'wr');
  const r = ik2(sx, sy, lx, ly, au.len * 0.92, af.len * 0.92, far ? -1 : 1, st.ik);   // 팔꿈치는 바깥·위로 (벡터와 같은 방향)
  put(D, L, U, V(U, far), 'sh', sx, sy, r.a1 - au.a, alpha, 0.92);
  put(D, L, Fo, V(Fo, far), 'el', r.ex, r.ey, r.a2 - af.a, alpha, 0.92);
  if (!far) { const tp = localPt(Fo, 'el', Fo.tip, r.ex, r.ey, r.a2 - af.a, 0.92, _q2); st.clawW = W(L, tp[0], tp[1], st.clawW ?? [0, 0]); }
  void s; void dying;
}

/** 역관절 다리: 엉덩이 → 발목(바닥 근처), 무릎은 앞으로. 발은 바닥에 평평하게 (lift = 걸음 중 발을 든 높이, 발끝이 살짝 아래로) */
function leg(D, L, rig, st, hx, hy, ax, cr, alpha, V, far, lift = 0) {
  const R = rig.parts, Th = R.dthigh, Sh = R.dshin, Ft = R.dfoot;
  const at = axis(Th, 'hip', 'knee'), as = axis(Sh, 'knee', 'ankle'), af = axis(Ft, 'ankle', 'toe');
  const ankY = -20 + cr * 0.15 - lift;
  const r = ik2(hx, hy, ax, ankY, at.len * 1.05, as.len * 1.05, 1, st.ik);   // 무릎은 앞으로
  put(D, L, Th, V(Th, far), 'hip', hx, hy, r.a1 - at.a, alpha, 1.05);
  put(D, L, Sh, V(Sh, far), 'knee', r.ex, r.ey, r.a2 - as.a, alpha, 1.05);
  put(D, L, Ft, V(Ft, far), 'ankle', r.hx, r.hy, 0.12 + lift * 0.02 - af.a, alpha, 1.1);
}

/** 꼬리: 몸통 꼬리뿌리 → 뒤로 늘어져 흔들리는 곡선 위에 타일 6개 (가시가 위로 오게 거울) */
function drawTail(D, L, rig, st, root, t, alpha, V, cr) {
  const tiles = rig.tail; if (!tiles?.length) return;
  const n = tiles.length, P = st.tailP;
  const sway = Math.sin(t * 2) * 12, lift = Math.sin(t * 1.3) * 8;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = root[0] - 18 - u * 150, y = root[1] + 8 + Math.sin(u * PI) * 55 - u * u * 60 + cr * 0.3 + (sway * u * u) + lift * u;
    P[i] = P[i] ?? [0, 0]; P[i][0] = x + sway * u * 0.5; P[i][1] = y;
  }
  for (let i = 0; i < n; i++) {
    const p = tiles[i], a = P[i], bq = P[i + 1];
    const ang = Math.atan2(bq[1] - a[1], bq[0] - a[0]), len = Math.hypot(bq[0] - a[0], bq[1] - a[1]);
    const tl = axis(p, 'jl', 'jr').len;
    put(D, L, p, V(p), 'jl', a[0], a[1], ang - PI, alpha, 1, -(len / tl) * 1.18, 1);
  }
}

/** 입 속 (턱을 잘라낸 자리 뒤): 어두운 목구멍 + 지옥불 */
function mouthFill(ctx, D, L, H, pv, hx, hy, hrot, a, jaw, glowC, t) {
  const M = H.mouthPoly; if (!M) return;
  const w = W(L, hx, hy, _q2), k = H.k * L.sc;
  D.set(H[pv][0], H[pv][1], w[0], w[1], L.f * (hrot + L.lean), k * L.f, k);
  ctx.beginPath(); ctx.moveTo(M[0][0], M[0][1]);
  for (let i = 1; i < M.length; i++) ctx.lineTo(M[i][0], M[i][1]);
  ctx.closePath();
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a;
  ctx.fillStyle = '#1a0202'; ctx.fill();
  ctx.globalAlpha = ga * a * clamp(0.35 + jaw * 0.5 + glowC * 0.4 + Math.sin(t * 11) * 0.05, 0, 1);
  ctx.fillStyle = '#c8320e'; ctx.fill();
  ctx.globalAlpha = ga;
  D.end();
}

/** 가산 불꽃 혀 (퍼프를 방향으로 겹침) */
function flame(ctx, x, y, ang, len, w, t, color, a, seed = 0, n = 5) {
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  const img = puff(color, true), img2 = puff(color);
  n = Math.max(2, n | 0);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), fl = Math.sin(t * 9 + i * 1.7 + seed) * 0.5 + 0.5;
    const aa = ang + Math.sin(t * 5 + i * 2.1 + seed) * 0.25 * u, dd = len * u * (0.8 + fl * 0.3);
    const px = x + Math.cos(aa) * dd, py = y + Math.sin(aa) * dd, ww = w * (1.4 - u) * (0.8 + fl * 0.4), hh = ww * (1.6 - u * 0.4);
    ctx.globalAlpha = ga * a * (1 - u * 0.65);
    ctx.drawImage(i === 0 ? img : img2, px - ww, py - hh, ww * 2, hh * 2);
  }
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}

/** 손상 단계 균열 발광 (반 해상도 오버레이, 가산 맥동) */
function glowOver(ctx, D, L, part, lvl, pivot, lx, ly, lrot, a, t, st) {
  if (!st.q.crackGlow || lvl <= 0 || a <= 0.01) return;
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 ? 1 : 0);
  if (!drawn) return;
  const g = drawn === 2 ? part.gl.dmg2 : part.gl.dmg1;
  if (!g) return;
  const pv = part[pivot], w = W(L, lx, ly, st.W), k = part.k * L.sc;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + part.w * 0.01)) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, w[0], w[1], L.f * (lrot + L.lean), k * 2 * L.f, k * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
  D.end();
}

// ───────────────────────── 단계 · 변신 · 사망 ─────────────────────────
function spawnDeb(st, rig, x, y, n, speed, sc = 1, fade = 1.6, up = 1) {
  const names = rig.debs; if (!names?.length) return;
  for (let j = 0; j < n; j++) {
    const p = rig.parts[names[(j * 3 + (x | 0)) % names.length]], a = -PI / 2 * up + rr.range(-1.4, 1.4), sp = speed * rr.range(0.4, 1);
    st.shards.spawn(p.v.base, p.c[0], p.c[1], x + rr.range(-12, 12), y + rr.range(-12, 12), rr.next() * TAU, p.k * sc * rr.sign(), p.k * sc, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-8, 8), { r: (p.r ?? 8) * sc * 0.6, fade, bounce: 0.3 });
  }
}
/** 맞은 판정 부위 (로직 hitParts: 2형태 머리 / 가슴 / 다리 상자의 중심 높이로 구분). 1형태·모름 = null (판정 부위 전체) */
function struckPart(b, form) {
  const hp = b.hitPart;
  if (form !== 2 || !hp || !(hp.h > 0)) return null;
  const s = b.d2?.scale || 1, rel = (hp.y + hp.h / 2) - (b.bottom - (b.d2?.hover ?? 0));
  return rel < -212 * s ? 'head' : rel < -116 * s ? 'chest' : 'legs';
}
function hitBurst(st, b, form) {
  const P = st.P;
  if (form === 1) {
    const y = b.bottom - 100;
    P.burst('blood', b.cx + b.facing * 6, y, 5, { speed: 180 });
    P.burst('smoke', b.cx, y, 2, { speed: 40, color: '#2a0a14' });
  } else {
    const s = b.d2?.scale ?? 1, y = b.bottom - (b.d2?.hover ?? 0) - 190 * s;
    P.burst('blood', b.cx + b.facing * 20, y, 6, { speed: 240 });
    P.burst('ember', b.cx, y, 8, { speed: 200, color: HELL });
  }
}
function levelBurst(st, b, rig, lvl, form) {
  const P = st.P;
  if (form === 1) {
    const x = b.cx, y = b.bottom - 100;
    P.burst('blood', x, y, 12 + lvl * 4, { speed: 260 });
    P.burst('smoke', x, y, 6, { speed: 70, color: '#1a0610', jitter: 20 });
  } else {
    const s = b.d2?.scale ?? 1, x = b.cx, y = b.bottom - (b.d2?.hover ?? 0) - 180 * s;
    spawnDeb(st, rig, x, y, 3 + lvl * 2, 320, 0.8 * s);
    P.burst('blood', x, y, 16, { speed: 300 });
    P.burst('ember', x, y, 20, { speed: 240, color: HELL });
  }
}
/** 변신 폭발 (t=1.6): 백작의 몸·망토·머리가 조각나 사방으로 흩어지고 피가 터진다 */
function transformBurst(st, b, rig) {
  const R = rig.parts, P = st.P, x = b.cx, y = b.bottom - 90, f = b.facing || 1;
  for (const [n, pv, sc, cnt] of [['morph', 'heart', 0.8, 1], ['cape', 'root', 0.7, 2], ['torso', 'heart', 1, 1], ['head_b', 'neck', 1.1, 1], ['cloak', 'front', 0.6, 1], ['leg', 'hip', 0.9, 2], ['sleeve', 'a', 1.3, 2]]) {
    const p = R[n]; if (!p) continue;
    for (let j = 0; j < cnt; j++) {
      const a = -PI / 2 + rr.range(-1.5, 1.5), sp = rr.range(220, 460);
      st.shards.spawn(pickVariant(p, 2), p[pv][0], p[pv][1], x + rr.range(-20, 20), y + rr.range(-40, 30), rr.range(-0.6, 0.6), p.k * sc * f * (j ? -1 : 1), p.k * sc, Math.cos(a) * sp, Math.sin(a) * sp - 120, rr.range(-9, 9), { r: 10, fade: 1.3, bounce: 0.25 });
    }
  }
  spawnDeb(st, rig, x, y, 8, 520, 0.7, 1.4);
  P.burst('blood', x, y, 60, { speed: 520, jitter: 20 });
  P.burst('ember', x, y, 50, { speed: 420, color: HELL });
  P.burst('smoke', x, y, 16, { speed: 140, color: '#2a0610', jitter: 30 });
}
/** 사망 (3.6초): 먼 날개 재 → 가까운 날개 재 → (로직 _ash 섬광) 몸이 박쥐 떼와 살점으로 흩어짐 */
function deathTick(st, b, rig, dT) {
  const R = rig.parts, G = st.gone, P = st.P, L = st.L, s = b.d2?.scale ?? 1, f = b.facing || 1;
  const x = b.cx, y = b.bottom - (b.d2?.hover ?? 0);
  const fade = (end) => Math.max(0.3, Math.min(end, b.dying - 0.05));
  if (!G.wingF && dT > 0.9) {
    G.wingF = true;
    for (let i = 0; i < 36; i++) P.emit(i % 3 ? 'ash' : 'ember', x - f * rr.range(20, 260) * s, y - rr.range(160, 420) * s, rr.range(-40, 40), rr.range(-60, 30), { color: HELL, layer: 1, size: rr.range(2, 5), life: rr.range(1, 2) });
    spawnDeb(st, rig, x - f * 120 * s, y - 280 * s, 3, 180, 0.9 * s, fade(1.8), 0.5);
  }
  if (!G.wingN && dT > 1.5) {
    G.wingN = true;
    for (let i = 0; i < 36; i++) P.emit(i % 3 ? 'ash' : 'ember', x + f * rr.range(20, 260) * s, y - rr.range(160, 420) * s, rr.range(-40, 40), rr.range(-60, 30), { color: HELL, layer: 1, size: rr.range(2, 5), life: rr.range(1, 2) });
    spawnDeb(st, rig, x + f * 120 * s, y - 280 * s, 3, 180, 0.9 * s, fade(1.8), 0.5);
  }
  if (!G.body && b._ash) {
    G.body = true;
    setL(L, x, y, f, 0, s);
    for (const [n, pv, lx, ly, sc] of [['dhead', 'neck', -20, -215, 1], ['dtorso', 'hip', 0, -118, 1], ['dua', 'sh', 0, -190, 0.92], ['dfaO', 'el', 40, -150, 0.92], ['dthigh', 'hip', 0, -120, 1], ['dshin', 'knee', 20, -70, 1], ['djaw', 'hinge', 30, -230, 1]]) {
      const p = R[n]; if (!p) continue;
      const w = W(L, lx, ly, st.W), a = -PI / 2 + rr.range(-1.2, 1.2), sp = rr.range(160, 420);
      st.shards.spawn(pickVariant(p, 2), p[pv][0], p[pv][1], w[0], w[1], rr.range(-0.3, 0.3), p.k * s * sc * f, p.k * s * sc, Math.cos(a) * sp, Math.sin(a) * sp - 160, rr.range(-5, 5), { r: 16 * s, fade: fade(1.3), bounce: 0.25 });
    }
    spawnDeb(st, rig, x, y - 150 * s, 10, 560, 1 * s, fade(1.3));
    P.burst('blood', x, y - 150 * s, 70, { speed: 560, jitter: 30 });
    P.burst('ember', x, y - 150 * s, 60, { speed: 460, color: HELL });
    P.burst('smoke', x, y - 140 * s, 14, { speed: 120, color: '#1a0508', jitter: 50 });
  }
  if (!G.body && P.n < 220 && rr.next() < 0.5) P.emit('ember', x + rr.range(-90, 90) * s, y - rr.range(20, 280) * s, rr.range(-60, 60), rr.range(-160, -60), { color: HELL, layer: 1 });
}

// ───────────────────────── 로직 파일용 그리기 도우미 ─────────────────────────
// b_dracula.js 의 박쥐(몸 주위 입자 박쥐·박쥐 돌진 무리·날갯짓 돌풍 탄)와 낙석이 리그 준비 시 이것으로 그린다.
function makeArt(rig) {
  const B = rig.batP, debs = rig.debs.map((n) => rig.parts[n]);
  // 낙석은 굵은 덩어리만 (deb4·deb5 발톱 달린 살점, deb8·deb9 비늘·용암 균열 덩어리). 날개막(deb0~3)·가는 뼈(deb6·7)는
  // 판정 40×40 보다 한참 작거나 비어 보여(뼈 6×16px) 떨어지는 위험물로 읽히지 않았다
  const rocks = ['deb4', 'deb5', 'deb8', 'deb9'].map((n) => rig.parts[n]).filter(Boolean);
  const R = rocks.length ? rocks : debs;
  const ROCK_PX = 38;   // 조각의 긴 변 (월드 px) — 로직 판정 40×40 · 벡터 돌 34px 와 맞춤
  return {
    /** 박쥐 한 마리: (x,y) 중심, s = 로직 반폭(벡터 9·s), ph = 날갯짓 위상, a = 투명도, vx = 진행 방향 */
    bat(ctx, x, y, s, ph, a, vx) {
      if (!B.length || a <= 0.02) return;
      const fl = Math.sin(ph), p = B[fl > 0.35 ? 0 : fl < -0.35 ? 2 : 1] ?? B[0];
      const im = p.v.base, k = p.k * (s / 9) * 0.95;
      const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a;
      ctx.save(); ctx.translate(x, y); ctx.scale(vx < 0 ? -1 : 1, 1 - Math.abs(fl) * 0.08);
      ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k);
      ctx.restore();
      ctx.globalAlpha = ga;
    },
    /** 낙석: 살점·비늘 덩어리 (현재 변환의 원점 = 돌 중심, 회전은 호출 측). 긴 변을 판정 크기에 맞춘다 */
    rock(ctx, i) {
      const p = R[Math.abs(i | 0) % Math.max(1, R.length)]; if (!p) return false;
      const im = p.v.base, k = ROCK_PX / Math.max(1, Math.max(p.w, p.h) - 2 * p.pad);
      ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k);
      return true;
    },
  };
}
