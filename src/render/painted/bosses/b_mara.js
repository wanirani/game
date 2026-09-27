// 마라 (b_mara) — 채색 컷아웃 퍼핏 렌더러 (ART-BOSS-7)
// 부품 (Kling, tools/painted/prompts/art-boss-7.mjs): 도자기 가면 머리(등뼈 목 · 뒤통수 실 머리) + P3 깨진 이마 머리(검은 속 · 보랏빛 눈 · 피 흘리는 꿰맨 입) ·
//   갈비뼈가 드러난 야윈 몸통(배의 꿰맨 흉터 · 누더기 잠옷) · 네 팔(위팔 · 아래팔 · 벌린 손 / 움켜쥔 갈고리 손) · 쪼그린 다리(넙다리 · 정강이 · 갈고리 발) ·
//   녹슨 쇠 흔들 요람 · 이빨 난 살덩이(아기 인형 얼굴 셋이 박힘) · 잠든 인형 얼굴 2 + 깨어난 인형 머리 2 + 눈이 빈 인형 가면 ·
//   도자기 인형 다리(부러진 넙다리 · 가시 정강이 · 발 달린 다리 · 금 간 구체 관절 · 작은 손 달린 팔) · 검은 실 머리카락 뭉치 · 파편 6
// 움직임은 전부 로직(src/game/bosses/d_mara.js)의 값을 읽기만 한다:
//   boss { bx, by, bob, facing, rock, form, morph, legK, pose{sing,raise,cut,throw,lean,crouch,slump,reach,rear,grin}, jt{hip,chest,sho,head,headA,crown,mouth,
//          kneeN,kneeF,footN,footF,body,bodyA,arms[{r,e,h,a}]}, legs[{near,rl,kl,fl}], heads[{alive,grow,hitT,leg}], mouthK, eyeT, collapsed, dawn, formPhase,
//          hp, stats.maxHp, flashT, dying, dieT, t, A.floor }
// 상태별 표현: P1 = 떠 있는 요람 위에 쪼그린 노파(요람 흔들림 rock · 둥실 bob) · 자장가(팔 들고 고개 젖힘 + 보랏빛 음표 입자) · 실 · 인형 · 가위 ·
//   변신 dreamshift(창살 사이로 이빨 난 살덩이가 부풀어 오른다) · P2 요람의 짐승(도자기 거미 다리 여덟 · 가까운 무릎의 아기 인형 머리 셋 = 약점,
//   부서지면 목 그루터기 · 다시 돋을 때 커진다) · 요람 돌진 · 얼굴들 · 비명(꿰맨 입이 세로로 찢어지며 거대한 눈) · 가짜 새벽(쓰러진 척 → 빛이 꺼졌다 켜짐) ·
//   붕괴(주저앉음) · 손상 단계(구운 균열 + 보랏빛 균열 발광, P3 = 이마가 깨진 머리로 교체 + 창살 사이 피) · 피격 섬광(머리 · 몸통 · 요람만)
// 사망 3.4초: 0.4초 잠든 얼굴의 실이 끊어져 떨어짐 → 0.8초 팔이 떨어짐 → 1.2초 가면이 깨져 조각남 → 1.6초 요람 · 몸통 · 다리가 무너짐 → 보랏빛 심장이 떠오른다
// 좌표: 로직과 같은 몸 지역 좌표 (원점 = 몸 발밑 가운데, 오른쪽 = 바라보는 쪽). 원본 그림 대부분은 왼쪽을 본다 → 부품 축에 대해 뒤집어 그린다.
import { Particles, DamageState, Shards, Drawer, halo, rr, hash1, loadRig, pickVariant, quality, QUALITY, ledgesOver } from '../kit.js';

const DIR = 'painted/bosses/b_mara';
const PI = Math.PI, TAU = PI * 2;
const DREAM = '#c060ff', DREAM_L = '#e8c0ff', PINK = '#ff80c0', BLOOD = '#3a0412', BLOOD_HI = '#b01838', PORC = '#efe8e0';
const HAIR = 'rgba(10,6,12,0.92)';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);

/** 굽기 옵션 (kit.loadRig def). 피격 섬광 = 판정 부위(얼굴 · 몸통 · 요람 · 살덩이 · 아기 머리)만 */
const DEF = {
  glow: DREAM,
  outline: { width: 1.7, color: 'rgba(8,4,10,0.9)' },
  parts: {
    head: { flash: true, cracks: 4, char: 1, holes: 0, crackMinLum: 120 },
    headb: { flash: true, cracks: 3, char: 1, holes: 0, crackMinLum: 120 },
    torso: { flash: true, cracks: 3, char: 1, holes: 0, crackMinLum: 80 },
    cradle: { flash: true, cracks: 1, char: 1, holes: 0, crackMinLum: 60 },
    flesh: { flash: true, cracks: 2, char: 1, holes: 0, crackMinLum: 60 },
    ua: { deep: 0.62, cracks: 2, char: 1, holes: 0, crackMinLum: 70 },
    fa: { deep: 0.62, cracks: 2, char: 1, holes: 0, crackMinLum: 70 },
    hand: { deep: 0.62, noDmg: true },
    claw: { deep: 0.62, noDmg: true },
    thigh: { deep: 0.6, cracks: 2, char: 1, holes: 0, crackMinLum: 90 },
    shin: { deep: 0.6, cracks: 2, char: 1, holes: 0, crackMinLum: 90 },
    foot: { deep: 0.6, noDmg: true },
    dthigh: { deep: 0.55, cracks: 2, char: 1, holes: 0, crackMinLum: 120 },
    dshin: { deep: 0.55, cracks: 2, char: 1, holes: 0, crackMinLum: 120 },
    dleg: { cracks: 2, char: 1, holes: 0, crackMinLum: 120 },
    ball: { deep: 0.55, noDmg: true },
    face0: { noDmg: true }, face1: { noDmg: true },
    face2: { noDmg: true, flash: true }, face3: { noDmg: true, flash: true }, dmask: { noDmg: true, flash: true },
    darm: { noDmg: true }, hair: { noDmg: true },
  },
  prefix: { deb: { noDmg: true, outline: 1.2 } },
};

const SLEEP = ['face0', 'face1', 'face0'];            // 실에 매달린 잠든 얼굴
const BABY = ['face2', 'face3', 'dmask'];             // P2 무릎의 아기 인형 머리 (heads[0..2])
const SLEEPERS = [[[-140, -62], [-62, -138], [70, -118]], [[-200, -60], [-100, -150], [20, -160]]];   // 로직 벡터 그림과 같은 자리
const CR_SX = 1.3;                                    // 요람 가로 늘림 (판정 요람 272px 폭에 맞춘다)

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_mara', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(40), q,
      dmg: new DamageState(boss.def?.phases ?? [0.6, 0.3]), lt: null, pf: 0, lvl: 0, jolt: 0, dead: {}, ph0: 0,
      debris: rig.man.groups?.debris ?? [], w: { x: 0, y: 0 }, fl: [], nfl: 0, pts: { mouth: [0, 0], eye: [0, 0], face: [0, 0] },
      lastForm: boss.form ?? 1, hb: [0, 0, 0], morphK: 0,
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const f2 = b.form === 2;
    const X = b.bx ?? b.cx, Y = (b.by ?? b.cy) + (f2 ? 0 : (b.bob ?? 0)), floor = b.A?.floor ?? Y + 60;
    let x0 = X - (f2 ? 360 : 330), x1 = X + (f2 ? 360 : 330), y0 = Y - (f2 ? 470 : 520), y1 = Math.max(Y + 80, floor + 12);
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 30 < x0) x0 = px - 30; if (px + 30 > x1) x1 = px + 30; if (py - 30 < y0) y0 = py - 30; if (py + 30 > y1) y1 = py + 30; }
    if (st?.shards?.list.length) for (const s of st.shards.list) { if (s.x - 180 < x0) x0 = s.x - 180; if (s.x + 180 > x1) x1 = s.x + 180; if (s.y - 180 < y0) y0 = s.y - 180; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    // 로직 lightsB 가 얼굴 · 몸 · 입 · 아기 머리 빛을 낸다. 여기서는 P3 보랏빛 눈과 사망 때 떠오르는 심장만 더한다
    if (b.formPhase >= 2 && !(b.dying > 0) && st.pts.eye) L.add(st.pts.eye[0], st.pts.eye[1], 90, DREAM, 0.55);
  },
  /** 월드 파편(ABoss.spawnDebris)용 채색 조각 */
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.9;
    return { size: Math.max(10, (p.w + p.h) * 0.25 * p.k), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 변환 도우미 ─────────────────────────
/**
 * 부품의 두 피벗(pa → pb)을 몸 지역 두 점 (ax,ay) → (bx,by) 에 맞춰 그린다 (축 방향 늘림 + 폭 wk 배, mir = 축에 대해 뒤집기).
 * 한 번의 setTransform + drawImage. 반환: 폭 배율 (섬광 기록용)
 */
function limb(D, img, p, pa, pb, ax, ay, bx, by, wk = 1, mir = true, alpha = 1, st = null) {
  if (!img || alpha <= 0.004) return;
  const A = p[pa], B = p[pb];
  const sdx = B[0] - A[0], sdy = B[1] - A[1], Ls = Math.hypot(sdx, sdy) || 1;
  const tdx = bx - ax, tdy = by - ay, Lt = Math.hypot(tdx, tdy) || 1e-3;
  const cs = sdx / Ls, ss = sdy / Ls, ct = tdx / Lt, stn = tdy / Lt;
  const u = Lt / Ls, v = p.k * wk * (mir ? -1 : 1);
  const a = ct * u * cs + stn * v * ss, c = ct * u * ss - stn * v * cs, b = stn * u * cs - ct * v * ss, d = stn * u * ss + ct * v * cs;
  aff(D, img, a, b, c, d, ax - (a * A[0] + c * A[1]), ay - (b * A[0] + d * A[1]), alpha);
  if (st && p.v.flash && D.rec) { const L = st.fl, i = st.nfl * 7; L[i] = p; L[i + 1] = a; L[i + 2] = b; L[i + 3] = c; L[i + 4] = d; L[i + 5] = ax - (a * A[0] + c * A[1]); L[i + 6] = ay - (b * A[0] + d * A[1]); st.nfl++; }
}
/** 몸 지역 아핀 (a b c d e f) 을 기준 변환 D.m 에 곱해 그린다 */
function aff(D, img, a, b, c, d, e, f, alpha = 1) {
  const m = D.m, ctx = D.ctx;
  ctx.setTransform(m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]);
  if (alpha !== 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * alpha; ctx.drawImage(img, 0, 0); ctx.globalAlpha = ga; } else ctx.drawImage(img, 0, 0);
}
/** 기록한 아핀 부품을 흰 실루엣으로 가산 덧그림 (피격 섬광) */
function flashAff(D, st, alpha) {
  if (!st.nfl || alpha <= 0.01) { st.nfl = 0; return; }
  const ctx = D.ctx, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const L = st.fl;
  for (let j = 0; j < st.nfl; j++) { const i = j * 7, p = L[i]; aff(D, p.v.flash, L[i + 1], L[i + 2], L[i + 3], L[i + 4], L[i + 5], L[i + 6], alpha); }
  ctx.globalCompositeOperation = op;
  st.nfl = 0;
}
/** 피벗 하나에 놓는 강체 부품 (뒤집기 = 원본이 왼쪽을 볼 때) */
function rigid(D, st, img, p, pivot, x, y, rot, sx, sy, alpha = 1, rec = false) {
  if (!img) return;
  const pv = typeof pivot === 'string' ? p[pivot] : pivot;
  D.img(img, pv[0], pv[1], x, y, rot, sx, sy, alpha);
  if (rec && D.rec && p.v.flash) { const c = Math.cos(rot), s = Math.sin(rot); const a = c * sx, b = s * sx, cc = -s * sy, d = c * sy; const L = st.fl, i = st.nfl * 7; L[i] = p; L[i + 1] = a; L[i + 2] = b; L[i + 3] = cc; L[i + 4] = d; L[i + 5] = x - (a * pv[0] + cc * pv[1]); L[i + 6] = y - (b * pv[0] + d * pv[1]); st.nfl++; }
}
/** 축에 대해 뒤집어 그린(sx < 0) 부품이 피벗 pa → pb 를 몸 지역 A → B 에 맞출 때의 회전 (사망 조각이 그 자리에서 튀지 않게) */
function mirRot(p, pa, pb, A, B) {
  const ts = Math.atan2(B[1] - A[1], B[0] - A[0]), ss = Math.atan2(p[pb][1] - p[pa][1], p[pb][0] - p[pa][0]);
  return ts - (PI - ss);
}
const V = (st, p, deep = false) => pickVariant(p, deep ? Math.min(st.lvl, 1) : st.lvl, deep, null);

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P, R = rig.parts;
  st.q = qOf(world.game);
  const q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, floor = A.floor, t = b.t, J = b.jt, s = b.pose, f2 = b.form === 2;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0, dT = dying ? (b.dieT ?? 0) : 0;
  const up = st.dmg.update(dying ? 0 : b.hp / b.stats.maxHp, dt);
  st.lvl = dying ? 2 : clamp(Math.max(b.formPhase | 0, st.dmg.level), 0, 2);
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 6);
  if (!dying && (b.state === 'intro' || b.hp >= b.stats.maxHp)) { st.dead = {}; st.shards.clear(); }
  if (st.lastForm !== b.form) { if (b.form === 2) formBurst(P, b, st); st.lastForm = b.form; }
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  // ── 뒤: 꿈빛 기운 (로직 paintBack — 캐시 발광 스프라이트) · 뒤 입자 ──
  if (!dying || dT < 2.6) b.paintBack?.(ctx, world);
  P.draw(ctx, 0);
  if (up > 0 && !dying) levelBurst(P, b, st, up);
  // ── 몸 (지역 좌표) ──
  const X = b.bx + (b.flashT > 0 ? (rr.next() - 0.5) * 3 : 0), Y = b.by + (f2 ? 0 : b.bob);
  const shake = (b.morph > 0 ? Math.sin(t * 60) * 3 * b.morph : 0) + (dying && dT < 0.5 ? (rr.next() - 0.5) * 5 : 0);
  D.begin(ctx);
  const wm = st.wm ??= [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < 6; i++) wm[i] = D.m[i];
  const enter = () => {
    ctx.setTransform(wm[0], wm[1], wm[2], wm[3], wm[4], wm[5]);   // 부품이 직접 건 변환이 남아 있어도 월드 기준에서 시작
    D.save();
    ctx.beginPath(); ctx.rect(X - 3000, floor - 4000, 6000, 4002); ctx.clip();   // 바닥 아래로는 아무것도 (인형 팔 · 사슬 · 무너진 조각)
    ctx.translate(X + shake * b.facing, Y); ctx.scale(b.facing || 1, 1);
    if (!f2 && b.rock) { ctx.translate(0, -50); ctx.rotate(b.rock); ctx.translate(0, 50); }
    D.begin(ctx);
  };
  enter();
  const rec = b.flashT > 0 && !dying;
  D.rec = false; st.nfl = 0;
  const dead = st.dead;
  // 뒤층: 머리카락 뭉치 · 잠든 얼굴 · 먼 팔다리 · 요람
  if (!dead.hair) drawHairBack(ctx, D, st, R, b, J, t, f2);
  if (!dead.sleep) drawSleepers(ctx, D, st, R, b, J, t, f2);
  if (f2) {
    for (const L of b.legs) if (!L.near) drawDollLeg(D, st, R, b, L, true);
    if (!dead.arms) { drawArm(D, st, R, b, 3, true); drawArm(D, st, R, b, 1, true); }
    if (!dead.body) drawBeastCore(ctx, D, st, R, b, J, t, rec, dying, dT);
  } else {
    if (!dead.arms) { drawArm(D, st, R, b, 1, true); drawArm(D, st, R, b, 3, true); }
    if (!dead.body) {
      drawUnderDolls(D, st, R, b, t);
      drawCradle1(ctx, D, st, R, b, t, rec);
      drawChains(ctx, D, b, t);
    }
  }
  // 발판 덧그리기 (요람 · 머리카락이 발판을 덮어도 딛을 곳이 보이게) → 노파(판정 부위)는 그 위에
  if (q.ledges !== false) {
    D.end(); D.restore();
    const cam = world.camera, cx0 = cam?.x ?? -1e9, cy0 = cam?.y ?? -1e9, cx1 = cx0 + (cam?.vw ?? 2e9), cy1 = cy0 + (cam?.vh ?? 2e9);
    ledgesOver(ctx, world, Math.max(X - 330, cx0), Math.max(Y - 480, cy0), Math.min(X + 330, cx1), Math.min(Y + 60, cy1, floor - 4));
    enter();
  }
  if (!dead.body) {
    if (f2) {
      for (const L of b.legs) if (L.near) drawDollLeg(D, st, R, b, L, false);
      drawHag(ctx, D, st, R, b, J, t, rec, 2);
      for (const h of b.heads) drawBaby(ctx, D, st, R, b, h, t);
    } else drawHag(ctx, D, st, R, b, J, t, rec, 1);
  } else if (!dead.head) drawHead(ctx, D, st, R, b, J, t, rec);
  if (!dead.arms) { drawArm(D, st, R, b, 2, false); drawArm(D, st, R, b, 0, false); }
  if (!dead.hair) drawHairFront(ctx, D, b, J, t);
  if (rec) flashAff(D, st, clamp(b.flashT / 0.1, 0, 1) * 0.55); else st.nfl = 0;
  D.rec = false;
  D.end();
  D.restore();
  // ── 월드: 파편 · 입자 · 사망 ──
  D.begin(ctx);
  st.shards.draw(D);
  D.end();
  ambient(P, b, st, dt, q, hit, t);
  if (dying) deathFx(ctx, b, rig, st, dt, dT);
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 머리카락 · 잠든 얼굴 ─────────────────────────
function drawHairBack(ctx, D, st, R, b, J, t, f2) {
  const H = R.hair; if (!H) return;
  const cx = J.crown[0], cy = J.crown[1];
  const k = H.k, len = Math.hypot(H.tip[0] - H.root[0], H.tip[1] - H.root[1]) * k;   // 기본 길이 (≈ 175)
  // 뒤로 흘러 물속처럼 떠오르는 뭉치 두 겹 (아래 겹은 짙게, 조금 짧게)
  const sw = Math.sin(t * 1.3) * 0.08, sw2 = Math.sin(t * 1.7 + 1) * 0.1;
  const droop = f2 ? 0.3 : 0.05 + b.pose.slump * 0.5 - b.pose.sing * 0.15;
  const L1 = len * (1.02 + f2 * 0.12), L2 = len * 0.86;
  const a1 = PI + 0.22 - droop + sw, a2 = PI - 0.18 - droop * 0.6 + sw2;
  limb(D, pickVariant(H, 0), H, 'root', 'tip', cx + 4, cy + 6, cx + 4 + Math.cos(a2) * L2, cy + 6 + Math.sin(a2) * L2, 0.8, true, 0.9);
  limb(D, pickVariant(H, 0), H, 'root', 'tip', cx + 2, cy, cx + 2 + Math.cos(a1) * L1, cy + Math.sin(a1) * L1, 1, false);
  // 뭉치에서 빠져나와 떠다니는 가닥 (가는 경로)
  D.end(); D.set(0, 0, 0, 0, 0, 1, 1);
  ctx.strokeStyle = HAIR; ctx.lineCap = 'round';
  const n = st.q.name === 'low' ? 3 : 6;
  for (let i = 0; i < n; i++) {
    const L = (150 + i * 24) * (1 + f2 * 0.15), a = -2.5 - i * 0.14 + Math.sin(t * 1.3 + i) * 0.1 + f2 * 0.45;
    const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.7 + 30 * f2;
    ctx.lineWidth = 2.4 - i * 0.28;
    ctx.beginPath(); ctx.moveTo(cx - 4, cy + 2);
    ctx.bezierCurveTo(cx - 24 + Math.sin(t * 2 + i) * 10, cy - 36, (cx + ex) / 2 + Math.sin(t * 1.7 + i * 1.3) * 20, (cy + ey) / 2 - 24, ex, ey);
    ctx.stroke();
  }
}
function drawSleepers(ctx, D, st, R, b, J, t, f2) {
  const S = SLEEPERS[f2 ? 1 : 0], cx = J.crown[0], cy = J.crown[1], fsx = b.facing || 1;
  const pos = st.hb;
  for (let i = 0; i < 3; i++) {
    const o = S[i], fx = cx + o[0] + Math.sin(t * 0.9 + i * 2) * 14, fy = cy + o[1] + Math.cos(t * 1.1 + i) * 10;
    // 실 (정수리 → 얼굴 정수리)
    D.end(); D.set(0, 0, 0, 0, 0, 1, 1);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo((cx + fx) / 2 + Math.sin(t * 1.5 + i) * 20, Math.min(cy, fy) - 30, fx, fy - 26);
    ctx.strokeStyle = 'rgba(12,6,14,0.92)'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(210,140,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    const p = R[SLEEP[i]]; if (!p) continue;
    const k = p.k * 0.9, rot = Math.sin(t * 0.8 + i) * 0.18;
    // 얼굴은 몸 뒤집힘을 되돌려 늘 정면 (i = 2 는 좌우 반대로 써서 같은 얼굴이 반복돼 보이지 않게)
    rigid(D, st, pickVariant(p, 0), p, 'top', fx, fy - 26, rot, k * fsx * (i === 2 ? -1 : 1), k, 0.94);
    pos[i] = fx;
  }
}
function drawHairFront(ctx, D, b, J, t) {
  D.end(); D.set(0, 0, 0, 0, 0, 1, 1);
  const cx = J.crown[0], cy = J.crown[1];
  ctx.strokeStyle = HAIR; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const x0 = cx + 2 + i * 5, y0 = cy + 6, sw = Math.sin(t * 1.8 + i) * 5;
    ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + 18, y0 + 22, x0 + 12 + sw, y0 + 56, x0 + 8 + sw, y0 + 80 + i * 12);
  }
  ctx.stroke();
}

// ───────────────────────── 팔 ─────────────────────────
/** 팔 i: 위팔 r→e · 아래팔 e→h · 손 (0 · 2 = 벌린 손, 1 · 3 = 움켜쥔 갈고리) */
function drawArm(D, st, R, b, i, far) {
  const a = b.jt.arms[i]; if (!a) return;
  const ua = R.ua, fa = R.fa, hd = i % 2 ? R.claw : R.hand;
  const wk = far ? 0.8 : 0.9;
  limb(D, V(st, ua, far), ua, 'r', 'e', a.r[0], a.r[1], a.e[0], a.e[1], wk);
  limb(D, V(st, fa, far), fa, 'e', 'wr', a.e[0], a.e[1], a.h[0], a.h[1], wk);
  // 손: 손목 → 손끝이 팔 방향(a.a) + 손가락 오므림 흔들림
  const curl = Math.sin(b.t * 2 + i) * 0.12 + b.pose.cut * 0.25 - b.pose.raise * 0.1;
  const ang = a.a + curl, L = Math.hypot(hd.tip[0] - hd.wr[0], hd.tip[1] - hd.wr[1]) * hd.k * (far ? 0.9 : 1);
  limb(D, pickVariant(hd, 0, far), hd, 'wr', 'tip', a.h[0], a.h[1], a.h[0] + Math.cos(ang) * L, a.h[1] + Math.sin(ang) * L, far ? 0.9 : 1);
}

// ───────────────────────── P1: 요람 · 인형 팔 · 사슬 ─────────────────────────
function drawCradle1(ctx, D, st, R, b, t, rec) {
  const C = R.cradle; if (!C) return;
  const k = C.k * 1.02;
  D.rec = rec;
  rigid(D, st, V(st, C), C, 'c', 0, 2, 0, k * CR_SX, k, 1, true);
  D.rec = false;
  glowOver(ctx, D, st, C, 'c', 0, 2, 0, k * CR_SX, k, 0.45, t);
  // 변신: 창살 사이로 이빨 난 살덩이가 부풀어 오른다 (요람 앞, 난간 위로 넘친다)
  const m = b.morph ?? 0;
  if (m > 0.01 && R.flesh) {
    const F = R.flesh, sk = F.k * (0.35 + 0.6 * m) * (1 + Math.sin(t * 9) * 0.04 * m);
    D.rec = rec; rigid(D, st, V(st, F), F, 'c', 0, -70, 0, sk, sk, clamp(m * 1.6, 0, 1), true); D.rec = false;
    D.end(); halo(ctx, 0, -70, 170 * m, DREAM, 0.45 * m);
  }
  // P3: 휜 창살 사이로 피가 흐른다
  if (st.lvl >= 2) bloodBars(ctx, D, b, t, -86, -96, 190, 1);
}
function drawUnderDolls(D, st, R, b, t) {
  const p = R.darm; if (!p) return;
  const room = Math.max(0, b.A.floor - (b.by + b.bob) - 2);
  for (let i = 0; i < 5; i++) {
    const x = -84 + i * 40, sw = Math.sin(t * 3 + i * 1.9);
    const x1 = x + sw * 14, y1 = Math.min(30 + Math.cos(t * 2.4 + i) * 6 + (i % 2) * 12, room - 6);
    if (y1 < -16) continue;
    limb(D, pickVariant(p, 0), p, 'a', 'b', x, -34, x1, y1, 0.9, i % 2 === 0, 0.95);
  }
}
function drawChains(ctx, D, b, t) {
  D.end(); D.set(0, 0, 0, 0, 0, 1, 1);
  const room = Math.max(0, b.A.floor - (b.by + b.bob) - 2);
  ctx.lineWidth = 2.4;
  for (const [x, ph] of [[-150, 0], [146, 1.7]]) {
    const sw = Math.sin(t * 1.5 + ph) * 10 - (b.rock ?? 0) * 140;
    let last = null;
    for (let k = 0; k < 8; k++) {
      const u = k / 8, cx = x + sw * u * u, cy = -26 + k * 10;
      if (cy > room - 4) break;
      ctx.strokeStyle = '#0a070c'; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.ellipse(cx, cy, k % 2 ? 2 : 3.6, 5.5, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = k % 2 ? '#3a3440' : '#5a5260'; ctx.lineWidth = 1.8; ctx.stroke();
      last = [cx, cy];
    }
    if (last) { ctx.fillStyle = '#241e2a'; ctx.beginPath(); ctx.arc(last[0], last[1] + 7, 4.5, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(160,40,40,0.7)'; ctx.beginPath(); ctx.arc(last[0] - 1, last[1] + 6, 1.6, 0, TAU); ctx.fill(); }
  }
}
/** 창살 사이로 흐르는 핏줄기 (지역 x0 부터 폭 w, 윗줄 y0) */
function bloodBars(ctx, D, b, t, x0, y0, w, k) {
  D.end(); D.set(0, 0, 0, 0, 0, 1, 1);
  ctx.strokeStyle = BLOOD; ctx.fillStyle = BLOOD; ctx.lineWidth = 2.4 * k;
  for (let i = 0; i < 6; i++) {
    const x = x0 + (i / 5) * w + hash1(i) * 10, len = 12 + ((t * 30 + i * 13) % 30);
    ctx.beginPath(); ctx.moveTo(x, y0 + 20); ctx.lineTo(x + 1, y0 + 20 + len); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 1, y0 + 22 + len, 2.6 * k, 0, TAU); ctx.fill();
  }
}

// ───────────────────────── 노파 (몸통 · 다리 · 머리) ─────────────────────────
function drawHag(ctx, D, st, R, b, J, t, rec, form) {
  const T = R.torso;
  if (form === 1) drawLegP1(D, st, R, b, J.hip[0] - 8, J.hip[1], J.kneeF, J.footF, true);
  // 목 다리 (몸통 목 그루터기 → 머리 등뼈 끝) 는 머리 부품의 등뼈가 맡는다. 몸통: 엉덩이 → 어깨
  D.rec = rec;
  const wk = form === 2 ? 0.92 : 1;
  const br = 1 + Math.sin(t * 2.2) * 0.02 * (1 - b.pose.slump);
  limb(D, V(st, T), T, 'hip', 'sho', J.hip[0], J.hip[1] + (form === 2 ? 14 : 4), J.sho[0], J.sho[1], wk * br, true, 1, st);
  D.rec = false;
  if (form === 1) {
    drawLegP1(D, st, R, b, J.hip[0] + 6, J.hip[1], J.kneeN, J.footN, false);
  } else {
    // 허리가 요람 살에 녹아든 힘줄
    D.end(); D.set(0, 0, 0, 0, 0, 1, 1);
    ctx.strokeStyle = '#4a1024'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < 4; k++) { const x = J.hip[0] - 10 + k * 8; ctx.moveTo(x, J.hip[1] + 8); ctx.quadraticCurveTo(x - 18 - k * 4, J.hip[1] + 24, x - 36 - k * 8, J.hip[1] + 30 + k * 3); }
    ctx.stroke();
  }
  drawHead(ctx, D, st, R, b, J, t, rec);
}
/** 쪼그린 다리 하나: 넙다리 hip→knee · 정강이 knee→foot(무릎 혹이 위로 오게 뒤집음) · 난간을 움켜쥔 갈고리 발 */
function drawLegP1(D, st, R, b, hx, hy, kn, ft, far) {
  const Th = R.thigh, Sh = R.shin, Ft = R.foot;
  const wk = far ? 0.42 : 0.5;
  limb(D, V(st, Th, far), Th, 'top', 'bot', hx, hy, kn[0], kn[1], wk);
  limb(D, V(st, Sh, far), Sh, 'bot', 'top', kn[0], kn[1] - 4, ft[0], ft[1] - 8, wk * 0.9);
  // 발: 발목에서 앞으로 · 아래로 난간을 감싼다
  const L = Math.hypot(Ft.tip[0] - Ft.wr[0], Ft.tip[1] - Ft.wr[1]) * Ft.k;
  limb(D, pickVariant(Ft, 0, far), Ft, 'wr', 'tip', ft[0] - 2, ft[1] - 10, ft[0] + L * 0.72, ft[1] - 10 + L * 0.7, 1);
}
/** 머리: 도자기 가면 (P3 = 이마가 깨진 머리) + 비명 때 세로로 찢어진 입속 거대한 눈 */
function drawHead(ctx, D, st, R, b, J, t, rec) {
  const P3 = (b.formPhase | 0) >= 2;
  const H = P3 && R.headb ? R.headb : R.head;
  const k = H.k, rot = J.headA + (st.jolt ? (rr.next() - 0.5) * 0.12 * st.jolt : 0);
  D.rec = rec;
  rigid(D, st, V(st, H), H, 'c', J.head[0], J.head[1], rot, -k, k, 1, true);
  D.rec = false;
  glowOver(ctx, D, st, H, 'c', J.head[0], J.head[1], rot, -k, k, 0.5, t);
  // 기준점 (조명 · 입자)
  D.pt(H.c[0], H.c[1], H.mouth[0], H.mouth[1], J.head[0], J.head[1], rot, -k, k, st.pts.mouth);
  D.pt(H.c[0], H.c[1], H.eye[0], H.eye[1], J.head[0], J.head[1], rot, -k, k, st.pts.eye);
  const W = b.toWorld(st.pts.eye[0], st.pts.eye[1], st.w); st.pts.eye[0] = W.x; st.pts.eye[1] = W.y;
  const fake = !!b.dawn?.fake, dk = b.dying > 0 ? clamp(1.3 - (b.dieT ?? 0), 0, 1) : 1;
  D.end();
  // P3: 깨진 이마 속 보랏빛 눈이 맥동 (가짜 새벽 동안은 꺼진다)
  if (P3 && !fake && dk > 0.02) {
    D.set(H.c[0], H.c[1], J.head[0], J.head[1], rot, -k, k);
    const pk = (0.6 + 0.4 * Math.sin(t * 5)) * dk;
    if (st.q.halos) halo(ctx, H.eye[0], H.eye[1], 70 / (k * 2.2), DREAM, 0.75 * pk);
    halo(ctx, H.eye[0], H.eye[1], 14 / (k * 2.2), '#ffffff', 0.8 * pk, true);
    D.end();
  }
  // 찢어진 입 → 거대한 눈 (로직 mouthK · 입 지역 좌표에서)
  const mk = b.mouthK ?? 0;
  if (mk > 0.02) {
    D.set(0, 0, st.pts.mouth[0], st.pts.mouth[1], rot, 1, 1);
    const hw = 3 + 11 * mk, hh = 7 + 17 * mk;
    ctx.fillStyle = '#12020a'; ctx.beginPath(); ctx.ellipse(0, 0, hw + 2, hh + 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f4ecf0'; ctx.beginPath(); ctx.ellipse(0, 0, hw * 0.9, hh * 0.8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(200,40,60,0.7)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-hw, -4); ctx.lineTo(-3, -1); ctx.moveTo(hw, 5); ctx.lineTo(3, 2); ctx.stroke();
    // 홍채 + 세로 동공이 플레이어를 본다
    const p = b.P;
    let lx = 0, ly = 0;
    if (p) { const W2 = b.toWorld(st.pts.mouth[0], st.pts.mouth[1], st.w); const dx = (p.cx - W2.x) * (b.facing || 1), dy = p.cy - W2.y, d = Math.hypot(dx, dy) || 1; lx = dx / d * hw * 0.35; ly = dy / d * hh * 0.25; }
    ctx.fillStyle = '#7a20c0'; ctx.beginPath(); ctx.arc(lx, ly, hw * 0.62, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c070ff'; ctx.beginPath(); ctx.arc(lx - hw * 0.1, ly - hw * 0.1, hw * 0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#050206'; ctx.beginPath(); ctx.ellipse(lx, ly, hw * 0.14, hw * 0.52, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(lx - hw * 0.2, ly - hw * 0.25, 1.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#120610'; ctx.lineWidth = 1.1; ctx.beginPath();
    for (let q = 0; q < 5; q++) { const y = -hh * 0.8 + q * hh * 0.4, sw = Math.sin(t * 6 + q) * 2; ctx.moveTo(-hw - 1, y); ctx.lineTo(-hw - 5 + sw, y + 5); ctx.moveTo(hw + 1, y); ctx.lineTo(hw + 5 - sw, y + 5); }
    ctx.stroke();
    if (st.q.halos) halo(ctx, 0, 0, hh * 1.8, PINK, 0.4 * mk);
    D.end();
  }
}

// ───────────────────────── P2: 요람의 짐승 ─────────────────────────
function drawBeastCore(ctx, D, st, R, b, J, t, rec, dying, dT) {
  const F = R.flesh, C = R.cradle;
  const ba = J.bodyA, bx = J.body[0], by = J.body[1], c = Math.cos(ba), s = Math.sin(ba);
  const at = (lx, ly, o) => { o[0] = bx + lx * c - ly * s; o[1] = by + lx * s + ly * c; return o; };
  const o = st.pts.face;
  // 요람 (창살 = 갈비뼈) — 뒤
  at(0, 58, o);
  const k = C.k * 1.08;
  D.rec = rec;
  rigid(D, st, V(st, C), C, 'c', o[0], o[1], ba, k * CR_SX, k, 1, true);
  D.rec = false;
  glowOver(ctx, D, st, C, 'c', o[0], o[1], ba, k * CR_SX, k, 0.45, t);
  // 살덩이: 요람 속을 채우고 난간 위로 넘쳐 부푼다 (이빨 난 입 = 앞쪽, 박힌 아기 얼굴). 맥동, 사망 때 꺼진다
  const pul = 1 + Math.sin(t * 3.2) * 0.03, deflate = dying ? clamp(1 - (dT - 1.4) / 1.6, 0.35, 1) : 1;
  at(0, -52 + (1 - deflate) * 40, o);
  if (F) {
    const fk = F.k * 0.96;
    D.rec = rec;
    rigid(D, st, V(st, F), F, 'c', o[0], o[1], ba, fk * pul, fk * pul * deflate, 1, true);
    D.rec = false;
    glowOver(ctx, D, st, F, 'c', o[0], o[1], ba, fk * pul, fk * pul * deflate, 0.45, t);
  }
  if (st.lvl >= 2 || (b.hp / b.stats.maxHp) < 0.3) bloodBars(ctx, D, b, t, bx - 100, by - 20, 200, 1);
}
/** 도자기 인형 다리: 부러진 넙다리(뿌리 → 무릎) · 가시 정강이 / 발 달린 다리(무릎 → 발) · 금 간 구체 관절 (먼 쪽 = 어두운 변형) */
function drawDollLeg(D, st, R, b, L, far) {
  const r = L.rl, k = L.kl, f = L.fl;
  const Th = R.dthigh, Sh = L.near && (L.i === 1 || L.i === 2) ? R.dleg : R.dshin;
  const wk = far ? 0.34 : 0.42;
  limb(D, V(st, Th, far), Th, 'a', 'b', r[0], r[1], k[0], k[1], wk, L.i % 2 === 0);
  if (Sh === R.dleg) limb(D, V(st, Sh), Sh, 'a', 'b', k[0], k[1], f[0], f[1], wk * 0.9, false);
  else limb(D, V(st, Sh, far), Sh, 'a', 'b', k[0], k[1], f[0], f[1], wk * 0.95, L.i % 2 === 1);
  const Bl = R.ball;
  if (Bl) { const bk = Bl.k * (far ? 0.62 : 0.72); rigid(D, st, pickVariant(Bl, 0, far), Bl, 'c', k[0], k[1], L.i * 1.3, bk, bk); }
}
/** 가까운 무릎의 아기 인형 머리 (heads[i]: 살아 있으면 얼굴 · 부서졌으면 목 그루터기 · 다시 돋을 때 grow 로 커진다) */
function drawBaby(ctx, D, st, R, b, h, t) {
  const L = b.legs[h.leg]; if (!L) return;
  const kx = L.kl[0], ky = L.kl[1], fsx = b.facing || 1;
  if (!h.alive) {
    D.end(); D.set(0, 0, 0, 0, 0, 1, 1);
    ctx.fillStyle = '#e6dcd6'; ctx.strokeStyle = '#1a0c16'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(kx - 8, ky - 6); ctx.lineTo(kx - 5, ky - 16); ctx.lineTo(kx - 1, ky - 10); ctx.lineTo(kx + 3, ky - 18); ctx.lineTo(kx + 8, ky - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = BLOOD_HI; ctx.beginPath(); ctx.arc(kx, ky - 7, 3, 0, TAU); ctx.fill();
    return;
  }
  const p = R[BABY[h.i % 3]]; if (!p) return;
  const g = h.grow, sc = 0.25 + 0.75 * g, wob = Math.sin(t * 5 + h.i * 2) * 0.12;
  const k = p.k * 0.86 * sc;
  const cy = ky - 20 * sc;
  rigid(D, st, pickVariant(p, 0), p, 'c', kx, cy, wob, k * fsx, k);
  if (h.hitT > 0 && p.v.flash) { const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; D.img(p.v.flash, p.c[0], p.c[1], kx, cy, wob, k * fsx, k, clamp(h.hitT * 5, 0, 0.9)); ctx.globalCompositeOperation = op; }
  if (g > 0.9 && st.q.halos && !b.dawn?.fake) {
    D.end(); D.set(0, 0, 0, 0, 0, 1, 1);
    const e = 0.35 + 0.3 * Math.sin(t * 6 + h.i);
    halo(ctx, kx - 7 * sc, cy - 2, 9, '#9fd0ff', e); halo(ctx, kx + 7 * sc, cy - 2, 9, '#9fd0ff', e);
  }
}

// ───────────────────────── 손상 발광 ─────────────────────────
function glowOver(ctx, D, st, p, pivot, x, y, rot, sx, sy, a, t) {
  const lvl = st.lvl;
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : p.v.dmg1 ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? p.gl.dmg2 : p.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? p[pivot] : pivot;
  const pa = a * (0.45 + 0.55 * Math.max(0, Math.sin(t * 4.1 + p.w * 0.013)) ** 3) * (lvl > 1 ? 1.1 : 0.75);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - p.pad) * 0.5, (pv[1] - p.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 입자 ─────────────────────────
function levelBurst(P, b, st, level) {
  const c = b.toWorld(b.jt.chest[0], b.jt.chest[1], st.w);
  P.burst('chip', c.x, c.y - 40, 10 + level * 6, { speed: 300, color: PORC });
  P.burst('blood', c.x, c.y, 10 + level * 6, { speed: 260, angle: -PI / 2, spread: 1.4, color: BLOOD, hi: BLOOD_HI });
  P.burst('spore', c.x, c.y, 16, { speed: 160, color: DREAM_L });
}
function formBurst(P, b, st) {
  const c = b.toWorld(0, -90, st.w);
  P.burst('chip', c.x, c.y, 26, { speed: 380, color: PORC });
  P.burst('blood', c.x, c.y, 20, { speed: 320, color: BLOOD, hi: BLOOD_HI });
  P.burst('spore', c.x, c.y, 30, { speed: 240, color: DREAM });
}
function ambient(P, b, st, dt, q, hit, t) {
  if (b.dying > 0) return;
  const amb = q.ambient, f2 = b.form === 2, w = st.w;
  // 꿈빛 티끌 (자장가 때 더)
  if (!b.dawn?.fake && rr.next() < dt * (2 + b.pose.sing * 10 + (f2 ? 2 : 0)) * amb) {
    const p = b.toWorld(rr.range(-120, 120), rr.range(-260, -40), w);
    P.emit('spore', p.x, p.y, rr.range(-20, 20), rr.range(-50, -10), { color: rr.chance(0.5) ? DREAM : DREAM_L, layer: rr.chance(0.5) ? 0 : 1 });
  }
  // 요람 · 살덩이에서 떨어지는 핏방울 (손상 · P2)
  if ((st.lvl >= 1 || f2) && rr.next() < dt * (0.8 + st.lvl * 1.2 + (f2 ? 1 : 0)) * amb) {
    const p = b.toWorld(rr.range(-90, 90), f2 ? rr.range(-40, 10) : rr.range(-40, -20), w);
    P.emit('blood', p.x, p.y, 0, 0, { color: BLOOD, hi: BLOOD_HI, hang: rr.range(0.1, 0.5), layer: 1 });
  }
  // 비명: 입에서 피 · 분홍 기운
  if ((b.mouthK ?? 0) > 0.3 && rr.next() < dt * 6 * amb) {
    const m = b.mouthP; P.emit('blood', m.x, m.y + 8, rr.range(-20, 20), rr.range(0, 40), { color: BLOOD, hi: BLOOD_HI, layer: 1 });
  }
  // 붕괴 · 가짜 새벽: 도자기 가루
  if ((b.collapsed || b.dawn?.fake) && rr.next() < dt * 10 * amb) { const f = b.faceP; P.emit('chip', f.x + rr.range(-20, 20), f.y - 30, rr.range(-60, 60), rr.range(-160, -40), { color: PORC }); }
  if (hit) {
    const f = b.faceP;
    P.burst('chip', f.x + rr.range(-12, 12), f.y + rr.range(-20, 20), 5, { speed: 220, color: PORC });
    P.burst('spore', f.x, f.y, 5, { speed: 140, color: DREAM_L });
  }
  // 막 부서진 아기 머리 → 도자기 조각 · 피
  for (const h of b.heads ?? []) {
    if (!h.alive && !h._pb) { h._pb = true; P.burst('chip', h.x, h.y - 16, 14, { speed: 280, color: PORC }); P.burst('blood', h.x, h.y - 10, 10, { speed: 220, color: BLOOD, hi: BLOOD_HI }); }
    else if (h.alive) h._pb = false;
  }
}

// ───────────────────────── 사망 붕괴 ─────────────────────────
function deathFx(ctx, b, rig, st, dt, dT) {
  const R = rig.parts, P = st.P, dead = st.dead, J = b.jt, f2 = b.form === 2, fsx = b.facing || 1;
  const fade = Math.max(0.6, 3.3 - dT);
  const w = st.w;
  const shard = (p, pivot, lx, ly, lrot, sx, sy, vx, vy, vr, r, bounce = 0.3, img = null) => {
    const W = b.toWorld(lx, ly, w), pv = typeof pivot === 'string' ? p[pivot] : pivot;
    st.shards.spawn(img ?? pickVariant(p, 2), pv[0], pv[1], W.x, W.y, lrot * fsx + (!f2 ? (b.rock ?? 0) * fsx : 0), sx * fsx, sy, vx * fsx, vy, vr * fsx, { r, bounce, fade });
  };
  // 0.4 s: 잠든 얼굴의 실이 끊어진다
  if (!dead.sleep && dT > 0.4) {
    const S = SLEEPERS[f2 ? 1 : 0];
    for (let i = 0; i < 3; i++) {
      const p = R[SLEEP[i]]; if (!p) continue;
      const lx = J.crown[0] + S[i][0], ly = J.crown[1] + S[i][1] - 26;
      shard(p, 'top', lx, ly, 0, p.k * 0.9 * (i === 2 ? -1 : 1), p.k * 0.9, rr.range(-60, 60), rr.range(-120, -20), rr.range(-3, 3), 22, 0.35, pickVariant(p, 0));
    }
    dead.sleep = true;
  }
  // 0.8 s: 네 팔이 떨어진다
  if (!dead.arms && dT > 0.8) {
    for (let i = 0; i < 4; i++) {
      const a = J.arms[i], ua = R.ua, fa = R.fa, hd = i % 2 ? R.claw : R.hand;
      shard(ua, 'r', a.r[0], a.r[1], mirRot(ua, 'r', 'e', a.r, a.e), -ua.k * 0.85, ua.k * 0.85, rr.range(20, 120), rr.range(-200, -60), rr.range(1, 4), 22, 0.3);
      shard(fa, 'e', a.e[0], a.e[1], mirRot(fa, 'e', 'wr', a.e, a.h), -fa.k * 0.85, fa.k * 0.85, rr.range(20, 140), rr.range(-220, -60), rr.range(1, 5), 20, 0.3);
      shard(hd, 'wr', a.h[0], a.h[1], a.a - PI / 2, -hd.k, hd.k, rr.range(40, 160), rr.range(-240, -80), rr.range(2, 6), 14, 0.35, pickVariant(hd, 0));
      const W = b.toWorld(a.e[0], a.e[1], w); P.burst('blood', W.x, W.y, 6, { speed: 180, color: BLOOD, hi: BLOOD_HI });
    }
    dead.arms = true;
  }
  // 1.2 s: 가면이 깨진다
  if (!dead.head && dT > 1.2) {
    const H = (b.formPhase | 0) >= 2 && R.headb ? R.headb : R.head;
    shard(H, 'c', J.head[0], J.head[1], J.headA, -H.k, H.k, rr.range(-60, 60), -300, rr.range(-4, 4), 34, 0.3);
    const W = b.toWorld(J.head[0], J.head[1], w);
    P.burst('chip', W.x, W.y, 26, { speed: 340, color: PORC });
    P.burst('blood', W.x, W.y + 10, 12, { speed: 240, color: BLOOD, hi: BLOOD_HI });
    P.burst('spore', W.x, W.y, 24, { speed: 260, color: DREAM });
    const d0 = R[st.debris[0]];
    if (d0) st.shards.spawn(d0.v.base, d0.c[0], d0.c[1], W.x, W.y, 0.3, d0.k, d0.k, rr.range(-160, 160), -380, rr.range(-6, 6), { r: 14, fade });
    b.world?.fx?.ring?.(W.x, W.y, { color: DREAM, r0: 10, r1: 140, life: 0.4, width: 5 });
    dead.head = true;
  }
  // 1.6 s: 요람 · 몸통 · 다리 · 머리카락이 무너진다
  if (!dead.body && dT > 1.6) {
    const T = R.torso, C = R.cradle;
    shard(T, 'hip', J.hip[0], J.hip[1], mirRot(T, 'hip', 'sho', J.hip, J.sho), -T.k, T.k, rr.range(-60, 60), -160, rr.range(-2, 2), 30, 0.2);
    if (f2) {
      shard(C, 'c', J.body[0], J.body[1] + 58, J.bodyA, C.k * 1.08 * CR_SX, C.k * 1.08, 0, -60, 0.4, 80, 0.1);
      for (const L of b.legs) {
        const Th = R.dthigh;
        const ang = Math.atan2(L.kl[1] - L.rl[1], L.kl[0] - L.rl[0]) - Math.atan2(Th.b[1] - Th.a[1], Th.b[0] - Th.a[0]);
        shard(Th, 'a', L.rl[0], L.rl[1], ang, Th.k * 0.9, Th.k * 0.4, rr.range(-160, 160), rr.range(-260, -80), rr.range(-5, 5), 30, 0.3);
      }
    } else shard(C, 'c', 0, 2, 0, C.k * 1.02 * CR_SX, C.k * 1.02, rr.range(-30, 30), -40, rr.range(-0.8, 0.8), 80, 0.12);
    for (let i = 1; i < st.debris.length; i++) {
      const p = R[st.debris[i]]; if (!p) continue;
      const W = b.toWorld(rr.range(-80, 80), f2 ? -100 : -80, w), a = -PI / 2 + (rr.next() - 0.5) * 2.4, sp = rr.range(220, 480);
      st.shards.spawn(p.v.base, p.c[0], p.c[1], W.x, W.y, rr.next() * TAU, p.k * rr.sign(), p.k, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-8, 8), { r: (p.w + p.h) * 0.2 * p.k, fade });
    }
    const W = b.toWorld(0, f2 ? -100 : -90, w);
    P.burst('chip', W.x, W.y, 30, { speed: 380, color: PORC });
    P.burst('blood', W.x, W.y, 24, { speed: 340, color: BLOOD, hi: BLOOD_HI });
    P.burst('spore', W.x, W.y, 30, { speed: 300, color: DREAM_L });
    dead.body = true; dead.hair = true;
  }
  // 무너지는 동안: 꿈빛 티끌이 흩어진다
  if (dT < 2.8 && rr.next() < dt * 20) { const p = b.toWorld(rr.range(-140, 140), rr.range(-260, 0), w); P.emit('spore', p.x, p.y, rr.range(-30, 30), rr.range(-80, -20), { color: rr.chance(0.5) ? DREAM : DREAM_L }); }
  // 보랏빛 심장이 떠오른다 (로직 drawHeart 와 같은 자리)
  if (dT > 1.0) {
    const k = clamp((dT - 1.0) / 0.8, 0, 1) * clamp(b.dying / 0.5, 0, 1);
    const x = b.bx, y = (f2 ? b.by - 110 : b.by + (b.bob ?? 0) - 70) - (dT - 1) * 8;
    if (k > 0.01) {
      halo(ctx, x, y, 110, DREAM, 0.7 * k);
      ctx.save(); ctx.translate(x, y); const sc = 1.3 + Math.sin(b.t * 7) * 0.08; ctx.scale(sc, sc);
      ctx.globalAlpha *= k;
      ctx.fillStyle = '#b060e8';
      ctx.beginPath(); ctx.moveTo(0, 14); ctx.bezierCurveTo(-26, -4, -14, -24, 0, -10); ctx.bezierCurveTo(14, -24, 26, -4, 0, 14); ctx.fill();
      ctx.strokeStyle = '#3a0a50'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      halo(ctx, x - 4, y - 6, 22, '#ffffff', 0.6 * k, true);
    }
  }
}
