// 니힐 (b_nihil) — 채색 컷아웃 퍼핏 렌더러 (ART-BOSS-8, 2부 최종 보스)
// 부품 (Kling, tools/painted/prompts/art-boss-8.mjs): 별밤을 품은 거대한 두건 수의(가슴이 삼각으로 갈라져 우주가 보인다) · 도자기 가면
//   (+ 좌우 반쪽 · 조각 6 · 귀까지 찢어진 웃음) · 가면 위로 번지는 쓰러뜨린 자들의 얼굴 7장(드라큘라 · 혼돈 · 나르키사 · 지즈 · 몰록 · 마라 · 사신) ·
//   거대한 도자기 손(손바닥 + 손가락 마디 14 · 감긴 손바닥 눈) + 뜬 손바닥 눈 · 떠도는 작은 눈알 · 메아리 실루엣 4 ·
//   아가리 입술(별 조각 이빨 띠) · 강착원반 · 검은 태양의 흰 불꽃 코로나 2겹 · 세로로 찢어진 태양의 눈 · 파편 10
// 움직임은 전부 로직(src/game/bosses/d_nihil.js)의 값을 읽기만 한다:
//   bx, by, bob, face, sxOf(), tilt, look, lookY, introK, glitch, glitchSpike, formPhase, tear, mawK, sunK, implode, echoKey/echoA/echoFlick,
//   faceIdx/faceA, hands[{i, side, x, y, rot, s, curl, spread, point, eye, a, mode, hitT}], _lastHit, flashT, dying, dieT, hp, stats.maxHp, A.floor, t
// 상태별 표현: P1 두건 실루엣(프리즘 윤곽 · 옷자락 물결 · 이 빠진 별빛 후광 · 두건 끈) + 가면(얼굴이 번갈아 번짐) + 두 손(손가락 마디가
//   로직 curl/spread/point 로 접힘, 손바닥 눈이 뜨고 플레이어를 본다) · P2 일그러짐(수의 가로 찢김 · 가면 조각 밀림 · 색 번짐 · 찢어진 웃음) +
//   메아리 실루엣(드라큘라 · 혼돈 · 나르키사 · 지즈) · 가슴 막 안쪽에서 밀려 나오는 얼굴들 · 피해만큼 뜨는 작은 눈 · P3 세로 찢김 → 무너지는 별의
//   아가리(입술 이빨 띠 · 강착원반 · 빨려 드는 별 · 특이점, 가면이 두 쪽으로 갈라짐) · final 빨려듦(implode) · P4 흰 불꽃을 두른 검은 태양
//   (코로나 2겹 역회전 · 홍염 · 세로 눈 · 떠 있는 가면 반쪽) · 손상 단계(가면 · 손 균열 + 보랏빛 균열 발광) · 부위별 피격 섬광(_lastHit)
// 사망 4초 (로직과 같은 시각): 0~2.7초 빛의 금이 가면/핵에서 사방으로 번지고 수의가 가로로 찢어진다 · 1.3초 늘어진 손이 부서지며 사라진다 ·
//   1.6초 가면이 조각나 빛에 매달려 벌어진다 · 2.7초 흰 섬광(로직 game.flash) — 몸은 사라지고 조각이 흩어져 떨어진다 → 작은 빛 하나가 사그라든다
// 좌표: 몸 지역 = 가면 가운데 원점 (로직 bx, by+bob), 가로 배율 sxOf(). 손 지역 = 로직 손 변환 (translate(x,y) rotate(rot) scale(−side·s, s))
import { Particles, DamageState, Shards, Drawer, puff, rr, loadRig, pickVariant, quality, QUALITY, ledgesOver, makeCanvas } from '../kit.js';

const DIR = 'painted/bosses/b_nihil';
const PI = Math.PI, TAU = PI * 2;
const VOID = '#04010a', PORC = '#e9e3f0';
const VIO = '#b070ff', VIO_L = '#dcc8ff', VIO_D = '#2c0c50', NEB = '#8a6aff', PM = '#ff5ad0', PC = '#5ad8ff', WHITE = '#ffffff';
const DAWN = '#fff6c8', IRIS = '#ffd86a', BITE = '#ff60c0', STARC = '#fff6e0';
const ECHO_COL = { dracula: '#ff2a3a', chaos: '#b060ff', narkissa: '#cfe8ff', ziz: '#bfe0ff' };
const ECHO_KEYS = ['dracula', 'chaos', 'narkissa', 'ziz'];
const FACES = ['face_dracula', 'face_chaos', 'face_narkissa', 'face_ziz', 'face_moloch', 'face_mara', 'face_death'];   // 로직 faceIdx 순서
const MAW_Y = 60;          // 아가리 가운데 (로직 MAW_Y)
const MK = 1.18;           // 로직 가면 · 손 기준 배율 (그림은 이 배율에서 로직 크기와 같게 잘랐다)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const h01 = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };   // 로직과 같은 해시 (금 · 눈 표)
const qOf = (g) => QUALITY[g?.quality ?? g?.tier ?? g?.settings?.quality] ?? quality(g);

/** 굽기 옵션. 수의(가장 큰 부품)는 손상 변형 없이 1장만 굽고, 섬광 · 프리즘 윤곽 실루엣은 load() 에서 반 해상도로 따로 굽는다 (메모리) */
const DEF = {
  glow: VIO,
  outline: { width: 1.5, color: 'rgba(6,2,12,0.9)' },
  parts: {
    robe: { noDmg: true, outline: 0 },
    mask: { flash: true, cracks: 3, char: 0, holes: 0, crackMinLum: 150 },
    maskL: { flash: true, cracks: 2, char: 0, holes: 0, crackMinLum: 150 },
    maskR: { flash: true, cracks: 2, char: 0, holes: 0, crackMinLum: 150 },
    grin: { noDmg: true },
    palm: { flash: true, cracks: 3, char: 0, holes: 1, crackMinLum: 150 },
    peye: { noDmg: true, flash: true },
    eyeball: { noDmg: true, outline: 0.8 },
    slit: { noDmg: true, outline: 0 },
    teeth: { noDmg: true, outline: 1.2 },
    disk: { noDmg: true, outline: 0 }, sunA: { noDmg: true, outline: 0 }, sunB: { noDmg: true, outline: 0 },
  },
  prefix: {
    f0_: { flash: true, deep: 0.6, cracks: 1, char: 0, holes: 0, crackMinLum: 150 },
    f1_: { flash: true, deep: 0.6, cracks: 1, char: 0, holes: 0, crackMinLum: 150 },
    f2_: { flash: true, deep: 0.6, cracks: 1, char: 0, holes: 0, crackMinLum: 150 },
    f3_: { flash: true, deep: 0.6, cracks: 1, char: 0, holes: 0, crackMinLum: 150 },
    f4_: { flash: true, deep: 0.6, cracks: 1, char: 0, holes: 0, crackMinLum: 150 },
    face_: { noDmg: true, outline: 0 },
    echo_: { noDmg: true, outline: 0 },
    mfr: { noDmg: true, outline: 1 },
    deb: { noDmg: true, outline: 1.2 },
  },
};

// ───────────────────────── 손 기하 (hand_a 원본 px → 손 지역 단위) ─────────────────────────
const HK = 0.144 / MK;                 // 손 지역 단위 / 원본 px (L_HAND ÷ 기준 배율)
const EYE_C = [868, 1145];             // 손바닥 가운데 (감긴 눈) = 손 지역 (0, 4)
const FSRC = [
  [[492, 915], [372, 768], [283, 650], [166, 508]],     // 새끼
  [[630, 862], [592, 703], [568, 534], [452, 200]],     // 약지
  [[826, 858], [810, 623], [800, 445], [761, 76]],      // 중지
  [[1000, 846], [1040, 671], [1062, 510], [1098, 160]], // 검지 (가리키기 = 로직 f.i 3)
  [[1196, 1104], [1398, 950], [1618, 756]],             // 엄지 (마디 둘)
];
const FL = 1.22;                       // 손가락 길이 배율 (로직 손가락은 그림보다 길다 — 거미처럼 긴 손가락)
const CURL = [0.75, 1.75, 2.7];        // 로직 CURL (마디별 접힘, curl 1 에서 rad)
const FING = FSRC.map((J, i) => {
  const P = J.map((q) => [(q[0] - EYE_C[0]) * HK, (q[1] - EYE_C[1]) * HK + 4]);
  const B = P[0], T = P[P.length - 1];
  const aN = Math.atan2(T[0] - B[0], -(T[1] - B[1]));    // 위(−y)에서 잰 각, + = 엄지 쪽(+x)
  const seg = [];
  for (let k = 0; k < P.length - 1; k++) { const dx = P[k + 1][0] - P[k][0], dy = P[k + 1][1] - P[k][1]; seg.push({ L: Math.hypot(dx, dy) * FL, d: Math.atan2(dx, -dy) - aN }); }
  return { i, b: B, aN, seg, thumb: i === 4, names: seg.map((_, k) => `f${i}_${k}`) };
});

// ───────────────────────── 표 (로직과 같은 식) ─────────────────────────
/** 사망 때 가면/핵에서 번지는 빛의 금 (로직 tabs().cracks 와 같은 점) */
const CRACKS = (() => {
  const out = [];
  for (let i = 0; i < 9; i++) {
    const pts = [0, 0];
    let a = (i / 9) * TAU + h01(i) * 0.5, x = 0, y = 0;
    for (let k = 1; k <= 7; k++) { a += (h01(i * 13 + k * 3.1) - 0.5) * 0.9; const l = 26 + h01(i * 7 + k) * 26; x += Math.cos(a) * l; y += Math.sin(a) * l * 1.15; pts.push(x, y); }
    out.push(pts);
  }
  return out;
})();
/** 수의 속에서 피해만큼 뜨는 작은 눈 (로직 tabs().eyes 와 같은 자리 규칙) */
const SPOTS = (() => {
  const out = [];
  for (let i = 0; out.length < 30 && i < 90; i++) {
    const y = lerp(-120, 176, h01(i * 5.1 + 0.7));
    const half = y < -20 ? 58 + (y + 120) * 0.4 : 96 + (y + 20) * 0.58;
    const x = (h01(i * 9.7 + 1.3) * 2 - 1) * half * 0.82;
    if (Math.abs(x) < 64 && y < 60) continue;
    out.push({ x, y, s: 0.75 + h01(i * 2.9) * 0.9, ph: h01(i * 4.4) * TAU });
  }
  return out;
})();
/** 가슴 막 안쪽에서 밀려 나오는 얼굴들 [x, y, 배율, 얼굴 번호] (몸 지역) */
const PRESSED = [[-46, 78, 0.6, 0], [48, 104, 0.55, 4], [0, 158, 0.46, 1]];

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_nihil', kind: 'boss', ownsDeathFade: true,
  async load(env) {
    // 추가 실루엣(수의 섬광 ½ 해상도 · 프리즘 윤곽 ¼ 해상도 3장 · 가면 색 번짐 2장 ≈ 리그의 11%)만큼 예산을 비워 둔다
    const budget = env?.budgetMB ?? 15;
    const rig = await loadRig(DIR, DEF, { ...env, budgetMB: budget * 0.88 });
    await bakeExtras(rig);
    return rig;
  },
  init(boss, rig) {
    const q = qOf(boss.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(40), q,
      dmg: new DamageState(boss.def?.phases ?? [0.75, 0.45, 0.15]), lt: null, pf: 0, fp: null, lvl: 0, dead: {}, lfp: boss.formPhase | 0,
      debris: rig.man.groups?.debris ?? [], frags: rig.man.groups?.mfr ?? [],
      wm: [1, 0, 0, 1, 0, 0], bm: [1, 0, 0, 1, 0, 0], mm: [1, 0, 0, 1, 0, 0], hm: [1, 0, 0, 1, 0, 0], sm: [1, 0, 0, 1, 0, 0],
      rg: { v: new Float32Array(9), y: new Float32Array(9), o: new Float32Array(9), g: new Float32Array(8), q: 1, Z: 150, vZ: 0 },
      ml: new Float32Array(34), mr: new Float32Array(34), tp: [0, 0],
      rec: false, fl: [], fm: new Float32Array(6 * 48), fa: new Float32Array(48), nfl: 0, nd: 0, gl0: 0,
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const X = b.bx ?? b.cx, Y = (b.by ?? b.cy) + (b.bob ?? 0), floor = b.A?.floor ?? Y + 280;
    let x0 = X - 350, x1 = X + 350, y0 = Y - 430, y1 = Math.max(Y + 80, floor + 12);
    for (const h of b.hands ?? []) { if (h.x - 200 < x0) x0 = h.x - 200; if (h.x + 200 > x1) x1 = h.x + 200; if (h.y - 210 < y0) y0 = h.y - 210; if (h.y + 150 > y1) y1 = h.y + 150; }
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 30 < x0) x0 = px - 30; if (px + 30 > x1) x1 = px + 30; if (py - 30 < y0) y0 = py - 30; if (py + 30 > y1) y1 = py + 30; }
    if (st?.shards?.list.length) for (const s of st.shards.list) { if (s.x - 120 < x0) x0 = s.x - 120; if (s.x + 120 > x1) x1 = s.x + 120; if (s.y - 120 < y0) y0 = s.y - 120; }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    // 로직 lightsB 가 몸 · 아가리 · 손 · 메아리 · 태양 빛을 낸다. 여기서는 태양의 눈과 흰 섬광 뒤 사그라드는 마지막 빛만 더한다
    const cy = b.by + b.bob;
    if (b.dying > 0) {
      const dT = b.dieT ?? 0;
      if (dT >= 2.7) { const u = clamp((dT - 2.7) / 1.3, 0, 1); L.add(b.bx, cy - u * 20, 60 + 200 * (1 - u), DAWN, 0.9 * (1 - u)); }
      return;
    }
    if (b.sunK > 0.5) L.add(b.bx, cy, 70, IRIS, 0.5 * b.sunK);
  },
  /** 월드 파편(ABoss.spawnDebris)용 채색 조각 */
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 1.1;
    return { size: Math.max(10, (p.w + p.h) * 0.25 * p.k), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 추가 굽기 (load 때 한 번) ─────────────────────────
function tintSil(src, w, h, color) {
  const c = makeCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, w, h);
  return c;
}
async function bakeExtras(rig) {
  const R = rig.parts, X = rig.extra = {};
  const bmp = async (c) => { if (typeof createImageBitmap !== 'function') return c; try { return await createImageBitmap(c); } catch { return c; } };
  let mb = 0;
  const robe = R.robe?.v.base;
  if (robe) {
    const w = Math.ceil(robe.width / 2), h = Math.ceil(robe.height / 2), w4 = Math.ceil(robe.width / 4), h4 = Math.ceil(robe.height / 4);
    X.robeF = await bmp(tintSil(robe, w, h, '#ffffff'));     // 수의 피격 섬광 (가산, ½)
    X.robeM = await bmp(tintSil(robe, w4, h4, PM));          // 프리즘 윤곽 (¼ — 부드러운 색 띠면 충분): 몸 뒤에 좌우로 밀어 가산 → 가장자리에만
    X.robeC = await bmp(tintSil(robe, w4, h4, PC));
    X.robeV = await bmp(tintSil(robe, w4, h4, VIO_L));       // 중간 품질: 한 장
    mb += (w * h * 4 + w4 * h4 * 4 * 3) / 1048576;
  }
  const mask = R.mask?.v.base;
  if (mask) {
    X.maskM = await bmp(tintSil(mask, mask.width, mask.height, PM));   // P2 일그러짐 색 번짐
    X.maskC = await bmp(tintSil(mask, mask.width, mask.height, PC));
    mb += (mask.width * mask.height * 4 * 2) / 1048576;
  }
  rig.memMB += mb;
}

// ───────────────────────── 변환 도우미 ─────────────────────────
/** out = M · T(x,y) · R(rot) · S(sx,sy) */
function frame(out, M, x, y, rot, sx, sy) {
  const c = Math.cos(rot), s = Math.sin(rot), a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
  out[0] = M[0] * a + M[2] * b; out[1] = M[1] * a + M[3] * b; out[2] = M[0] * cc + M[2] * d; out[3] = M[1] * cc + M[3] * d;
  out[4] = M[0] * x + M[2] * y + M[4]; out[5] = M[1] * x + M[3] * y + M[5];
  return out;
}
function setT(ctx, M, a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
  ctx.setTransform(M[0] * a + M[2] * b, M[1] * a + M[3] * b, M[0] * c + M[2] * d, M[1] * c + M[3] * d, M[0] * e + M[2] * f + M[4], M[1] * e + M[3] * f + M[5]);
}
/** 지역 아핀 (a b c d e f) 을 틀 M 에 곱해 그림 한 장. 섬광 기록 중이면 최종 행렬을 남긴다 (img = null → 기록만) */
function draw6(ctx, st, M, img, p, a, b, c, d, e, f, alpha = 1) {
  if (alpha <= 0.004) return;
  const A = M[0] * a + M[2] * b, B = M[1] * a + M[3] * b, C = M[0] * c + M[2] * d, D = M[1] * c + M[3] * d, E = M[0] * e + M[2] * f + M[4], F = M[1] * e + M[3] * f + M[5];
  if (img) {
    ctx.setTransform(A, B, C, D, E, F);
    if (alpha !== 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * alpha; ctx.drawImage(img, 0, 0); ctx.globalAlpha = ga; } else ctx.drawImage(img, 0, 0);
    st.nd++;
  }
  if (st.rec && p?.v.flash && st.nfl < 48) { const i = st.nfl++, m = st.fm, o = i * 6; st.fl[i] = p; m[o] = A; m[o + 1] = B; m[o + 2] = C; m[o + 3] = D; m[o + 4] = E; m[o + 5] = F; st.fa[i] = alpha; }
}
/** 부품의 피벗 pv 를 틀 M 의 (x,y) 에, 회전 rot, 배율 sx/sy */
function put(ctx, st, M, img, p, pv, x, y, rot, sx, sy, alpha = 1) {
  const c = Math.cos(rot), s = Math.sin(rot), a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
  draw6(ctx, st, M, img, p, a, b, cc, d, x - (a * pv[0] + cc * pv[1]), y - (b * pv[0] + d * pv[1]), alpha);
}
/** 두 피벗(pa → pb)을 틀 M 의 두 점에 맞춰 (축 방향 늘림, 폭 = p.k·wk) */
function limb(ctx, st, M, img, p, pa, pb, ax, ay, bx, by, wk, alpha = 1) {
  const A = p[pa], B = p[pb];
  const sdx = B[0] - A[0], sdy = B[1] - A[1], Ls = Math.hypot(sdx, sdy) || 1;
  const tdx = bx - ax, tdy = by - ay, Lt = Math.hypot(tdx, tdy) || 1e-3;
  const cs = sdx / Ls, ss = sdy / Ls, ct = tdx / Lt, stn = tdy / Lt, u = Lt / Ls, v = p.k * wk;
  const a = ct * u * cs + stn * v * ss, c = ct * u * ss - stn * v * cs, b = stn * u * cs - ct * v * ss, d = stn * u * ss + ct * v * cs;
  draw6(ctx, st, M, img, p, a, b, c, d, ax - (a * A[0] + c * A[1]), ay - (b * A[0] + d * A[1]), alpha);
}
/** 기록한 부품을 흰 실루엣으로 가산 덧그림 (부위별 피격 섬광) */
function flushFlash(ctx, st, alpha) {
  const n = st.nfl; st.nfl = 0;
  if (!n || alpha <= 0.01) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha, m = st.fm;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const o = i * 6, im = st.fl[i].v.flash;
    ctx.setTransform(m[o], m[o + 1], m[o + 2], m[o + 3], m[o + 4], m[o + 5]);
    ctx.globalAlpha = ga * alpha * st.fa[i];
    ctx.drawImage(im, 0, 0);
  }
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
/** 틀 M 안의 (x,y) 에 타원 발광 (반지름 rx, ry) — 캐시 퍼프 스프라이트 한 장 */
function glowE(ctx, M, x, y, rx, ry, color, a, core = false) {
  if (a <= 0.01 || rx < 1 || ry < 1) return;
  setT(ctx, M, rx, 0, 0, ry, x, y);
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * Math.min(1, a);
  ctx.drawImage(puff(color, core), -1, -1, 2, 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
const V = (st, p, deep = false) => pickVariant(p, deep ? Math.min(st.lvl, 1) : st.lvl, deep, null);

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, P = st.P, R = rig.parts, X2 = rig.extra ?? {};
  st.q = qOf(world.game);
  const q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const floor = b.A.floor, t = b.t;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  st.nd = 0;
  const dying = b.dying > 0, dT = dying ? (b.dieT ?? 0) : 0;
  const up = st.dmg.update(dying ? 0 : b.hp / b.stats.maxHp, dt);
  st.lvl = dying ? 2 : clamp(Math.max(st.dmg.level, b.formPhase >= 2 ? 2 : b.formPhase | 0), 0, 2);
  // 피격 부위 고정: 섬광이 다시 켜진 프레임(새 피격)의 로직 _lastHit ('h0' · 'h1' · 'core' · 'shroud')
  if (b.flashT > st.pf + 1e-4) st.fp = b._lastHit ?? null;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (!dying && (b.state === 'intro' || b.hp >= b.stats.maxHp)) { st.dead = {}; st.shards.clear(); }
  const fp = b.formPhase | 0;
  if (fp > st.lfp && !dying) formBurst(P, b, fp);
  st.lfp = fp;
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  D.begin(ctx);
  const wm = st.wm;
  for (let i = 0; i < 6; i++) wm[i] = D.m[i];
  // ── 흰 섬광 뒤: 몸은 사라지고 조각 · 마지막 빛만 ──
  if (dying && dT >= 2.7) {
    deathFx(ctx, b, rig, st, dt, dT);
    deathLight(ctx, st, b, dT);
    ctx.setTransform(wm[0], wm[1], wm[2], wm[3], wm[4], wm[5]); D.begin(ctx);
    st.shards.draw(D);
    D.end();
    P.draw(ctx, 0); P.draw(ctx, 1);
    ctx.imageSmoothingQuality = q0;
    return;
  }
  const X = b.bx + (b.flashT > 0 && !dying ? (rr.next() - 0.5) * 3 : 0) + (dying ? (rr.next() - 0.5) * 4 * clamp(dT / 2.7, 0, 1) : 0);
  const Y = b.by + b.bob;
  const sx = b.sxOf(), room = Math.max(40, floor - Y - 8);
  const robeA = (1 - b.sunK) * b.introK;
  const simp = 1 - 0.85 * (b.implode ?? 0);
  const rec = b.flashT > 0 && !dying, fk = clamp(b.flashT / 0.1, 0, 1) * 0.55;
  const hitPart = rec ? (st.fp ?? 'core') : null;
  // 바닥 아래로는 아무것도 (옷자락 · 손끝 · 조각)
  ctx.setTransform(wm[0], wm[1], wm[2], wm[3], wm[4], wm[5]);
  D.save();
  ctx.beginPath(); ctx.rect(X - 4000, floor - 5000, 8000, 5002); ctx.clip();
  // ── 뒤: 공허의 기운 · 뒤 입자 · 메아리 ──
  const aura = b.introK;
  glowE(ctx, wm, X, Y + 40, 360, 330, VIO_D, 0.55 * aura);
  if (q.halos) glowE(ctx, wm, X, Y - 20, 220, 200, NEB, 0.16 * aura * (1 - b.sunK));
  ctx.setTransform(wm[0], wm[1], wm[2], wm[3], wm[4], wm[5]);
  P.draw(ctx, 0);
  if (up > 0 && !dying) levelBurst(P, b, up);
  drawEcho(ctx, st, R, b, wm, X, Y, t, q);
  // ── 몸 (두건 수의 · 아가리) ──
  const BM = frame(st.bm, wm, X, Y, 0, sx * simp, simp);
  if (robeA > 0.01) {
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * robeA;
    const gAmp = Math.max(b.glitch, dying ? 0.4 + dT / 2.7 * 1.4 : 0, (1 - b.introK) * 1.6);
    const G = robeGeom(st, R.robe, room / simp, t, gAmp);
    drawHalo(ctx, st, b, BM, t, q);
    drawRobe(ctx, st, R, X2, b, BM, G, t, q, hitPart === 'shroud' ? fk : 0);
    drawChest(ctx, st, R, b, BM, G, t, q);
    drawSpotEyes(ctx, st, R, b, BM, G, room / simp, t, q);
    drawMaw(ctx, st, R, b, BM, room / simp, t, q, hitPart === 'core' && b.mawK > 0.55 ? fk : 0);
    ctx.globalAlpha = ga;
  }
  // 발판 덧그리기 (수의 · 메아리가 발판을 덮어도 딛을 곳이 보이게) → 가면 · 손(판정 부위)은 그 위에
  if (q.ledges !== false && (robeA > 0.05 || b.echoA > 0.05 || b.echoFlick)) {
    ctx.setTransform(wm[0], wm[1], wm[2], wm[3], wm[4], wm[5]);
    const cam = world.camera, cx0 = cam?.x ?? -1e9, cy0 = cam?.y ?? -1e9, cx1 = cx0 + (cam?.vw ?? 2e9), cy1 = cy0 + (cam?.vh ?? 2e9);
    ledgesOver(ctx, world, Math.max(X - 300, cx0), Math.max(Y - 240, cy0), Math.min(X + 300, cx1), Math.min(floor - 4, cy1));
  }
  // ── 가면 (P1–P3) ──
  if (robeA > 0.01) {
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * robeA;
    const MM = frame(st.mm, BM, 0, 0, b.tilt ?? 0, 1, 1);
    st.rec = rec && hitPart === 'core' && b.mawK <= 0.55;
    drawMask(ctx, st, R, X2, b, MM, t, q, dying, dT);
    st.rec = false;
    flushFlash(ctx, st, fk);   // 가면 섬광 (손보다 뒤)
    ctx.globalAlpha = ga;
  }
  // ── P4 검은 태양 ──
  if (b.sunK > 0.01) {
    const SM = frame(st.sm, wm, X, Y, 0, 1, 1);
    drawSun(ctx, st, R, b, SM, t, q, hitPart === 'core' ? fk : 0, dying, dT);
  }
  // ── 두 손 ──
  for (const h of b.hands) {
    const mine = rec && hitPart === 'h' + h.i, hk = !dying && h.hitT > 0.02 ? clamp(h.hitT * 4, 0, 0.5) : 0;
    st.rec = mine || hk > 0;
    drawHand(ctx, st, R, b, h, wm, t, q);
    st.rec = false;
    flushFlash(ctx, st, Math.max(mine ? fk : 0, hk));
  }
  // ── 앞: 사망의 빛의 금 ──
  if (dying) { deathFx(ctx, b, rig, st, dt, dT); drawCracks(ctx, st, b, wm, X, sx, dT); }
  ctx.setTransform(wm[0], wm[1], wm[2], wm[3], wm[4], wm[5]);
  D.restore();
  // ── 월드: 파편 · 입자 ──
  ctx.setTransform(wm[0], wm[1], wm[2], wm[3], wm[4], wm[5]); D.begin(ctx);
  st.shards.draw(D);
  D.end();
  ambient(P, b, st, dt, q, hit, t, X, Y, room);
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 메아리 (P2) ─────────────────────────
function drawEcho(ctx, st, R, b, wm, X, Y, t, q) {
  const key = b.echoFlick ? ECHO_KEYS[Math.floor(b.t * 7) % 4] : b.echoKey;
  const a = b.echoFlick ? 0.55 : b.echoA;
  if (!key || a < 0.02) return;
  const p = R['echo_' + key]; if (!p) return;
  const col = ECHO_COL[key];
  glowE(ctx, wm, X, Y - 40, 300, 260, col, 0.26 * a);
  const jit = b.glitch > 0.3 ? (h01(Math.floor(b.t * 18)) - 0.5) * 10 : 0;
  const sc = p.k * 1.45 * (1 + 0.03 * Math.sin(t * 2)), fs = (b.face ?? -1) >= 0 ? 1 : -1;
  const y = Y - 70;
  put(ctx, st, wm, p.v.base, p, p.c, X + jit, y, 0, sc * fs, sc, a * 0.66);
  // 잔상 (일그러짐 · 전환 중 번갈아): 옆으로 밀린 가산 한 장
  if ((b.glitch > 0.3 || b.echoFlick) && q.name !== 'low') {
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    const off = (h01(Math.floor(b.t * 12) + 3) - 0.5) * 24;
    put(ctx, st, wm, p.v.base, p, p.c, X + jit + off, y - 4, 0, sc * fs * 1.04, sc * 1.04, a * 0.18);
    ctx.globalCompositeOperation = op;
  }
}

// ───────────────────────── 수의 (가로 조각 = 물결 · 찢김 · 바닥 위 압축) ─────────────────────────
const RN = 8, RTOP = 3;   // 조각 수 · 가면 아래 자연 크기 구간을 나누는 윗조각 수
/**
 * 수의 그림의 세로 사상: 가면 아래 Z 까지는 원래 크기, 그 아래(해진 밑단)는 바닥 위 room 안에 들어오도록 눌러 담는다 (바닥 아래로 그리지 않는다).
 * 조각 경계마다 옷자락 물결(가로 밀림 o, 깊을수록 크게) · 일그러짐(조각별 가로 찢김 g)
 */
function robeGeom(st, R, room, t, gAmp) {
  const G = st.rg, k = R.k, Fy = R.face[1], H = R.h;
  const Z = Math.min(150, Math.max(40, room * 0.6));
  const below = (H - Fy) * k;
  const q = clamp((room + 4 - Z) / Math.max(1, below - Z), 0.16, 1);
  const vZ = Fy + Z / k;
  for (let i = 0; i <= RN; i++) {
    const v = i <= RTOP ? vZ * (i / RTOP) : vZ + (H - vZ) * ((i - RTOP) / (RN - RTOP));
    const y = v <= vZ ? (v - Fy) * k : Z + (v - vZ) * k * q;
    const dep = y > 0 ? clamp(y / 260, 0, 1) : clamp(-y / 260, 0, 1) * 0.35;
    G.v[i] = v; G.y[i] = y;
    G.o[i] = Math.sin(t * 1.1 + y * 0.012) * (1 + 11 * dep) + Math.sin(t * 2.3 + i * 0.9) * 3 * dep;
  }
  const gb = Math.floor(t * 20);
  for (let i = 0; i < RN; i++) G.g[i] = gAmp > 0.3 ? (h01(gb * 7.3 + i * 3.1) - 0.5) * 20 * gAmp : 0;
  G.q = q; G.Z = Z; G.vZ = vZ;
  return G;
}
/** 수의 텍셀 (u, v) → 몸 지역 좌표 */
function robePt(G, R, u, v, out) {
  let i = 0;
  while (i < RN - 1 && v > G.v[i + 1]) i++;
  const h = G.v[i + 1] - G.v[i] || 1, w = clamp((v - G.v[i]) / h, 0, 1);
  out[0] = (u - R.face[0]) * R.k + lerp(G.o[i], G.o[i + 1], w) + G.g[i];
  out[1] = lerp(G.y[i], G.y[i + 1], w) - 4;
  return out;
}
/** 조각별 전단 변환으로 이어 그린다 (이음매가 벌어지지 않게 위 · 아래 경계의 밀림을 선형으로 잇는다). f = img 해상도 / 기본 텍셀 */
function robeSlices(ctx, st, M, img, R, G, f, dx, dy, alpha, n = RN) {
  if (!img || alpha <= 0.004) return;
  const k = R.k, W = R.w, H = R.h, Fx = R.face[0];
  const ga = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = ga * alpha;
  for (let i = 0; i < n; i++) {
    const v0 = G.v[i], v1 = G.v[i + 1], h = v1 - v0;
    if (h <= 0.5) continue;
    const o0 = G.o[i] + G.g[i] + dx, o1 = G.o[i + 1] + G.g[i] + dx;
    const c = (o1 - o0) / h, d = (G.y[i + 1] - G.y[i]) / h;
    setT(ctx, M, k, 0, c, d, -Fx * k + o0 - c * v0, G.y[i] - 4 + dy - d * v0);
    const sh = Math.min(h + 0.8, H - v0);
    ctx.drawImage(img, 0, v0 * f, W * f, sh * f, 0, v0, W, sh);
    st.nd++;
  }
  ctx.globalAlpha = ga;
}
function drawRobe(ctx, st, R, X2, b, BM, G, t, q, flashK) {
  const Rb = R.robe; if (!Rb) return;
  // 프리즘 윤곽 (현실에서 도려낸 자리): 색 실루엣을 좌우로 밀어 몸 뒤에 가산 → 가장자리에만 색 띠. 일그러짐 때 크게 벌어진다
  if (q.halos) {
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    // 평소에는 두건 · 어깨 · 가슴(윗조각)만 — 가는 밑단 올에 색 띠가 끼면 수정 조각처럼 보인다. 일그러질 때는 전체가 벌어진다
    const fl = 0.75 + 0.25 * Math.sin(t * 5.3) * Math.sin(t * 2.1), sp = 3 + b.glitch * 9, n = b.glitch > 0.3 ? RN : RTOP + 1;
    if (q.name === 'high' && X2.robeM) {
      robeSlices(ctx, st, BM, X2.robeM, Rb, G, 0.25, -sp, 0, 0.6 * fl, n);
      robeSlices(ctx, st, BM, X2.robeC, Rb, G, 0.25, sp, -1, 0.6 * fl, n);
    } else if (X2.robeV) robeSlices(ctx, st, BM, X2.robeV, Rb, G, 0.25, 0, -2.5, 0.55 * fl, n);
    ctx.globalCompositeOperation = op;
  }
  robeSlices(ctx, st, BM, Rb.v.base, Rb, G, 1, 0, 0, 1);
  // 수의 피격 섬광 (맞은 부위만 — 거대한 실루엣 전체가 하얘지면 눈이 아프다: 로직처럼 옅게)
  if (flashK > 0.01 && X2.robeF) {
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    robeSlices(ctx, st, BM, X2.robeF, Rb, G, 0.5, 0, 0, flashK * 0.55);
    ctx.globalCompositeOperation = op;
  }
}
/** 이 빠진 별빛 후광 (P3 에는 흩어진다) — 별 18개는 한 경로, 발광은 몇 개만 */
function drawHalo(ctx, st, b, BM, t, q) {
  const n = 22, cx = -16, cy = -118, r0 = 168, br = b.tear ?? 0, gb = Math.floor(t * 12);
  setT(ctx, BM);
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  if (br < 0.95) { ctx.globalAlpha = ga * 0.14 * (1 - br); ctx.strokeStyle = VIO_L; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = ga * 0.9;
  ctx.fillStyle = STARC;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    if (i % 6 === 4) continue;
    const a = (i / n) * TAU + t * 0.07, r = r0 + br * (30 + h01(i) * 70), fk = b.glitch > 0.3 ? h01(gb + i) : 1;
    if (fk < 0.3) continue;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, s = 3.2 + 1.6 * Math.sin(t * 3 + i);
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y - s * 0.25); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.25, y + s * 0.25);
    ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y + s * 0.25); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.25, y - s * 0.25); ctx.closePath();
  }
  ctx.fill();
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  if (q.halos) for (let i = 1; i < n; i += 5) {
    const a = (i / n) * TAU + t * 0.07, r = r0 + br * (30 + h01(i) * 70);
    glowE(ctx, BM, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 11, 11, STARC, 0.5);
  }
}
/** 가슴 창 (별밤이 보이는 삼각 틈): 막 안쪽에서 밀려 나오는 얼굴들 · 빛의 갈비뼈 · 맥동하는 별 */
function drawChest(ctx, st, R, b, BM, G, t, q) {
  const Rb = R.robe, C = Rb?.chest; if (!C) return;
  const tp = st.tp;
  setT(ctx, BM);
  ctx.beginPath();
  for (let i = 0; i < C.length; i++) { robePt(G, Rb, C[i][0], C[i][1], tp); i ? ctx.lineTo(tp[0], tp[1]) : ctx.moveTo(tp[0], tp[1]); }
  ctx.closePath();
  st.D.save();
  ctx.clip();
  const ga = ctx.globalAlpha, M = R.mask;
  if (q.name !== 'low' && M) {
    const k = b.formPhase >= 1 ? 1.6 : 1;
    for (let i = 0; i < PRESSED.length; i++) {
      const [x, y0, sc, fi] = PRESSED[i];
      const y = y0 <= G.Z ? y0 : G.Z + (y0 - G.Z) * G.q;
      const a = clamp((0.1 + 0.07 * Math.sin(t * 0.9 + i * 2.1)) * k, 0, 0.4), sw = Math.sin(t * 0.6 + i) * 0.12;
      const s = M.k * sc * (1 + 0.05 * Math.sin(t * 1.3 + i));
      put(ctx, st, BM, M.v.base, M, M.c, x, y, sw, s, M.k * sc, a);
      const F = R[FACES[fi]];
      if (F) put(ctx, st, BM, F.v.base, F, F.c, x, y, sw, F.k * sc, F.k * sc, a * 1.3);
    }
  }
  // 빛의 갈비뼈 (가산 획)
  if (q.name !== 'low') {
    setT(ctx, BM);
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.strokeStyle = VIO_L;
    for (let i = 0; i < 5; i++) {
      const y = 62 + i * 24, w = 80 - i * 7, pulse = 0.5 + 0.5 * Math.sin(t * 1.6 - i * 0.7);
      ctx.globalAlpha = ga * (0.12 + 0.12 * pulse); ctx.lineWidth = 5 - i * 0.5;
      ctx.beginPath();
      for (const s of [-1, 1]) { ctx.moveTo(s * 6, y - 8); ctx.quadraticCurveTo(s * w, y - 12, s * (w - 12), y + 22); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
  // 가슴 속 별 (맥동) — 수의 그림의 밝은 별 자리
  robePt(G, Rb, Rb.core[0], Rb.core[1], tp);
  const pk = 0.55 + 0.45 * Math.sin(t * 2.4);
  glowE(ctx, BM, tp[0], tp[1], 46 * pk + 20, 46 * pk + 20, NEB, 0.5);
  glowE(ctx, BM, tp[0], tp[1], 12 + 6 * pk, 12 + 6 * pk, WHITE, 0.8, true);
  ctx.globalAlpha = ga;
  st.D.restore();
}
/** 별밤 속에서 하나씩 뜨는 눈 — 피해가 쌓일수록 많아진다 (로직 drawSpotEyes 와 같은 수) */
function drawSpotEyes(ctx, st, R, b, BM, G, room, t, q) {
  const E = R.eyeball; if (!E) return;
  const dmg = clamp((1 - b.hp / Math.max(1, b.stats.maxHp)) * 1.35 + (b.formPhase >= 1 ? 0.1 : 0), 0, 1);
  const n = Math.min(SPOTS.length, Math.floor(dmg * SPOTS.length), q.name === 'high' ? 22 : q.name === 'medium' ? 12 : 6);
  if (n <= 0) return;
  const lx = (b.look ?? 0) * Math.sign(b.sxOf()), img = E.v.base;
  for (let i = 0; i < n; i++) {
    const e = SPOTS[i];
    const y = e.y <= G.Z ? e.y : G.Z + (e.y - G.Z) * G.q;
    if (y > room - 8) continue;
    const bl = clamp(Math.sin(t * 0.9 + e.ph) * 4 + 3, 0, 1);
    if (bl < 0.05) continue;
    const s = E.k * e.s * 0.7;
    put(ctx, st, BM, img, E, E.c, e.x + lx * 2 + (b.glitch > 0.3 ? (h01(Math.floor(t * 20) + i) - 0.5) * 8 * b.glitch : 0), y, 0, s * 1.1, s * 0.62 * bl, 0.92);
  }
}

// ───────────────────────── P3 아가리 ─────────────────────────
function drawMaw(ctx, st, R, b, BM, room, t, q, flashK) {
  const open = Math.max((b.tear ?? 0) * 0.28, b.mawK ?? 0);
  if (open < 0.02) return;
  const y0 = -34, y1 = Math.min(206, room - 6);
  if (y1 - y0 < 60) return;
  const Lp = st.ml, Rp = st.mr, N = 16;
  for (let i = 0; i <= N; i++) {
    const u = i / N, y = lerp(y0, y1, u);
    const w = Math.pow(Math.sin(PI * u), 0.8) * (22 + 86 * open) * (1 + 0.25 * Math.sin(PI * Math.min(1, u * 1.6)));
    const j = (h01(i * 7.7) - 0.5) * 10 * open + Math.sin(t * 3 + i) * 2 * open;
    Lp[i * 2] = -w + j; Lp[i * 2 + 1] = y; Rp[i * 2] = w + j * 0.8; Rp[i * 2 + 1] = y;
  }
  setT(ctx, BM);
  ctx.beginPath();
  ctx.moveTo(Lp[0], Lp[1]);
  for (let i = 1; i <= N; i++) ctx.lineTo(Lp[i * 2], Lp[i * 2 + 1]);
  for (let i = N; i >= 0; i--) ctx.lineTo(Rp[i * 2], Rp[i * 2 + 1]);
  ctx.closePath();
  ctx.fillStyle = '#000000'; ctx.fill();
  st.D.save();
  ctx.clip();
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  // 강착원반 (천천히 기울며 돈다)
  const Dk = R.disk;
  if (Dk) { const sc = Dk.k * (0.45 + 0.6 * open); put(ctx, st, BM, Dk.v.base, Dk, Dk.c, 0, MAW_Y, Math.sin(t * 0.4) * 0.15, sc, sc * (0.9 + 0.1 * Math.sin(t * 0.7)), 0.95); }
  // 빨려 드는 별 (한 경로 · 두 색)
  setT(ctx, BM);
  const nS = q.name === 'high' ? 18 : q.name === 'medium' ? 12 : 6;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = pass; i < nS; i += 2) {
      const u = (t * 0.45 + i / nS) % 1, r = (1 - u) * (150 * open + 30), a = i * 2.39996 + t * 2.2 + u * 4;
      const x = Math.cos(a) * r, y = MAW_Y + Math.sin(a) * r * 0.42, s = 1.2 + u * 2.6;
      ctx.moveTo(x + s, y); ctx.arc(x, y, s, 0, TAU);
    }
    ctx.globalAlpha = ga * (pass ? 0.95 : 0.7); ctx.fillStyle = pass ? WHITE : VIO_L; ctx.fill();
  }
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
  // 특이점
  const pk = 0.8 + 0.2 * Math.sin(t * 9);
  glowE(ctx, BM, 0, MAW_Y, (40 + 60 * open) * pk, (40 + 60 * open) * pk, BITE, 0.55 * open + 0.2);
  glowE(ctx, BM, 0, MAW_Y, (18 + 16 * open) * pk, (18 + 16 * open) * pk, WHITE, 0.9, true);
  if (flashK > 0.01) glowE(ctx, BM, 0, MAW_Y, 60, 60, WHITE, flashK * 1.6, true);
  st.D.restore();
  // 입술: 별 조각 이빨 띠를 찢어진 가장자리를 따라 조각별 전단으로 이어 붙인다 (왼쪽 = 이빨이 안쪽(+x), 오른쪽 = 뒤집음)
  const T = R.teeth;
  if (T) {
    const img = T.v.base, Ht = T.h, kT = T.k * (0.5 + 0.5 * open), gum = T.top[0] + (T.w - T.top[0]) * 0.12;
    for (const [E, s] of [[Lp, 1], [Rp, -1]]) {
      for (let j = 0; j < 8; j++) {
        const i0 = j * 2, i1 = j * 2 + 2, v0 = (j / 8) * Ht, v1 = ((j + 1) / 8) * Ht;
        const x0 = E[i0 * 2] - s * 2, yy0 = E[i0 * 2 + 1], x1 = E[i1 * 2] - s * 2, yy1 = E[i1 * 2 + 1];
        const c = (x1 - x0) / (v1 - v0), d = (yy1 - yy0) / (v1 - v0);
        setT(ctx, BM, kT * s, 0, c, d, x0 - gum * kT * s - c * v0, yy0 - d * v0);
        const sh = Math.min(v1 - v0 + 0.6, Ht - v0);
        ctx.drawImage(img, 0, v0, T.w, sh, 0, v0, T.w, sh);
        st.nd++;
      }
    }
  }
  if (q.name === 'high') {
    setT(ctx, BM);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2;
    for (const [E, c] of [[Lp, 'rgba(255,90,208,0.5)'], [Rp, 'rgba(90,216,255,0.5)']]) {
      ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(E[0], E[1]);
      for (let i = 1; i <= N; i++) ctx.lineTo(E[i * 2], E[i * 2 + 1]);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = op;
  }
}

// ───────────────────────── 가면 ─────────────────────────
/** 도자기 가면: P2 일그러짐(가로 조각 밀림 · 색 번짐 · 찢어진 웃음) · P3 두 쪽으로 갈라짐 · 스치는 얼굴 · 별빛 눈동자 · 사망 때 조각남 */
function drawMask(ctx, st, R, X2, b, MM, t, q, dying, dT) {
  const M = R.mask; if (!M) return;
  const k = M.k, img = V(st, M);
  const open = (b.formPhase >= 2 || b.mawK > 0.05) ? Math.max(b.tear ?? 0, b.mawK ?? 0) : 0;
  const lx = (b.look ?? 0) * Math.sign(b.sxOf()), ly = b.lookY ?? 0, ek = b.introK * (dying ? clamp(1 - dT / 2.4, 0, 1) : 1);
  // 사망 1.6초부터: 조각 6개가 빛에 매달려 벌어진다
  if (dying && dT >= 1.6) {
    const sep = (dT - 1.6) * 14;
    for (const n of st.frags) {
      const p = R[n]; if (!p) continue;
      const dx = p.c[0] - p.o[0], dy = p.c[1] - p.o[1], L = Math.hypot(dx, dy) || 1;
      const hs = h01(n.length * 3.1 + p.c[0]);
      put(ctx, st, MM, pickVariant(p, 0), p, p.o, (dx / L) * sep, (dy / L) * sep, (hs - 0.5) * 0.3 * (dT - 1.6), k, k);
    }
    return;
  }
  const eyes = st.eyes ??= [[0, 0], [0, 0]];
  if (open > 0.02) {
    const d = (6 + 44 * open) * MK, rL = -0.1 * open, rR = 0.1 * open;
    const L = R.maskL, Rr = R.maskR;
    if (L) put(ctx, st, MM, V(st, L), L, L.c, -d, 2 * MK, rL, k, k);
    if (Rr) put(ctx, st, MM, V(st, Rr), Rr, Rr.c, d, -2 * MK, rR, k, k);
    if (L) { eyes[0][0] = -d + (L.eye[0] - L.c[0]) * k; eyes[0][1] = 2 * MK + (L.eye[1] - L.c[1]) * k; }
    if (Rr) { eyes[1][0] = d + (Rr.eye[0] - Rr.c[0]) * k; eyes[1][1] = -2 * MK + (Rr.eye[1] - Rr.c[1]) * k; }
    crackGlow(ctx, st, MM, L, L?.c, -d, 2 * MK, rL, k, t, q);
    crackGlow(ctx, st, MM, Rr, Rr?.c, d, -2 * MK, rR, k, t, q);
  } else {
    const g = b.glitch ?? 0;
    if (g > 0.05) {
      // 가로 5조각이 제각각 밀린다 (로직 drawMask 와 같은 규칙)
      const n = 5, H = M.h, sh = H / n, gb = Math.floor(t * 24);
      for (let i = 0; i < n; i++) {
        const off = (h01(gb * 3.7 + i * 1.3) - 0.5) * 16 * g * MK;
        setT(ctx, MM, k, 0, 0, k, -M.c[0] * k + off, -M.c[1] * k);
        const hh = Math.min(sh + 0.6, H - i * sh);
        ctx.drawImage(img, 0, i * sh, M.w, hh, 0, i * sh, M.w, hh);
        st.nd++;
      }
      if (st.rec && M.v.flash) put(ctx, st, MM, null, M, M.c, 0, 0, 0, k, k);   // (섬광 기록만 — 그림은 위 조각)
      if (g > 0.35 && X2.maskM && q.name !== 'low') {
        const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
        put(ctx, st, MM, X2.maskM, null, M.c, -5, 0, 0, k, k, 0.32 * g);
        put(ctx, st, MM, X2.maskC, null, M.c, 5, 0, 0, k, k, 0.32 * g);
        ctx.globalCompositeOperation = op;
      }
    } else put(ctx, st, MM, img, M, M.c, 0, 0, 0, k, k);
    crackGlow(ctx, st, MM, M, M.c, 0, 0, 0, k, t, q);
    // 스치는 얼굴 (쓰러뜨린 자들) · P2 부터 찢어진 웃음
    const rec = st.rec; st.rec = false;
    if (b.faceA > 0.02 && open < 0.3) { const F = R[FACES[b.faceIdx | 0]]; if (F) put(ctx, st, MM, F.v.base, F, F.c, 0, 0, 0, F.k, F.k, clamp(b.faceA, 0, 1)); }
    const gr = R.grin;
    if (gr && b.formPhase >= 1) {
      const ga = b.glitch > 0.5 ? 0.9 : clamp(0.18 + 0.22 * Math.sin(t * 0.8) + (b.formPhase >= 2 ? 0.2 : 0), 0, 0.6);
      put(ctx, st, MM, gr.v.base, gr, gr.c, 0, 0, 0, gr.k, gr.k, ga);
    }
    st.rec = rec;
    eyes[0][0] = (M.eyeL[0] - M.c[0]) * k; eyes[0][1] = (M.eyeL[1] - M.c[1]) * k;
    eyes[1][0] = (M.eyeR[0] - M.c[0]) * k; eyes[1][1] = (M.eyeR[1] - M.c[1]) * k;
  }
  // 별빛 눈동자 (플레이어를 본다)
  if (ek > 0.02) for (const e of eyes) {
    const x = e[0] + lx * 4, y = e[1] + ly * 3;
    if (q.halos) glowE(ctx, MM, x, y, 16, 16, VIO_L, 0.7 * ek);
    glowE(ctx, MM, x, y, 6.5, 6.5, WHITE, 0.95 * ek, true);
  }
}
/** 손상 단계 균열 발광 (반 해상도 오버레이, 맥동 가산) */
function crackGlow(ctx, st, M, p, pv, x, y, rot, s, t, q) {
  if (!p || !pv || !q.crackGlow || st.lvl <= 0) return;
  const g = st.lvl >= 2 ? p.gl.dmg2 : p.gl.dmg1 ?? p.gl.dmg2;
  if (!g) return;
  const pa = (0.45 + 0.55 * Math.max(0, Math.sin(t * 4.1 + p.w * 0.013)) ** 3) * (st.lvl > 1 ? 0.9 : 0.6);
  const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
  const rec = st.rec; st.rec = false;
  put(ctx, st, M, g, null, [(pv[0] - p.pad) * 0.5, (pv[1] - p.pad) * 0.5], x, y, rot, s * 2, s * 2, Math.min(1, pa));
  st.rec = rec;
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── P4 검은 태양 ─────────────────────────
const HOLE_A = 77 / 1.6, HOLE_B = 72 / 1.6;   // 코로나 그림의 가운데 구멍 반지름 (월드 px, 배율 k 에서)
const SLIT_H = 232 / 1.6, SLIT_W = 44 / 1.6;
function drawSun(ctx, st, R, b, SM, t, q, flashK, dying, dT) {
  const k = b.sunK, r = 84 * (0.35 + 0.65 * k);
  const fl = dying ? 0.7 + 0.3 * Math.sin(t * 40) : 1, grow = dying ? 1 + dT * 0.06 : 1;
  const op = ctx.globalCompositeOperation;
  // 흰 불꽃 코로나 2겹 (역회전)
  ctx.globalCompositeOperation = 'lighter';
  const A = R.sunA, B = R.sunB;
  if (B && q.name !== 'low') { const m = (r * 1.02 / HOLE_B) * (0.9 + 0.06 * Math.sin(t * 4.3 + 1)) * grow; put(ctx, st, SM, B.v.base, B, B.c, 0, 0, 1 - t * 0.19, B.k * m, B.k * m, k * 0.34 * fl); }
  if (A) { const m = (r * 1.02 / HOLE_A) * (1.0 + 0.05 * Math.sin(t * 3.1)) * grow; put(ctx, st, SM, A.v.base, A, A.c, 0, 0, t * 0.12, A.k * m, A.k * m, k * 0.62 * fl); }
  ctx.globalCompositeOperation = op;
  if (q.halos) glowE(ctx, SM, 0, 0, r * 2.6, r * 2.6, DAWN, 0.14 * k);
  // 검은 원반 + 흰 테
  setT(ctx, SM);
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * Math.max(k, 0.01);
  ctx.fillStyle = '#000000';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,246,200,0.45)'; ctx.lineWidth = 9; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.globalAlpha = ga;
  if (q.halos) glowE(ctx, SM, 0, 0, r * 0.8, r * 0.8, VIO_D, 0.5 * k);
  // 앞에 떠 있는 부서진 가면 반쪽 (P4 = 마지막 손상 단계)
  const L = R.maskL;
  if (L) {
    const lk = L.k * 0.72, lxp = -10 + Math.sin(t * 0.8) * 4, lyp = 6 + Math.sin(t * 1.1) * 3, lr = -0.35 + Math.sin(t * 0.6) * 0.05;
    if (dying && dT >= 1.6) {
      const sep = (dT - 1.6) * 14;
      for (const n of st.frags) {
        const p = R[n]; if (!p || p.c[0] > p.o[0]) continue;   // 왼쪽 조각만
        const dx = p.c[0] - p.o[0], dy = p.c[1] - p.o[1], Ln = Math.hypot(dx, dy) || 1;
        const MF = frame(st.mm, SM, lxp, lyp, lr, 1, 1);
        put(ctx, st, MF, pickVariant(p, 0), p, p.o, (dx / Ln) * sep, (dy / Ln) * sep, 0.2 * (dT - 1.6), lk, lk, 0.7 * k);
      }
    } else put(ctx, st, SM, pickVariant(L, 2), L, L.c, lxp, lyp, lr, lk, lk, 0.6 * k);
  }
  setT(ctx, SM);
  ctx.globalAlpha = ga * k;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, -0.6 + t * 0.3, 0.3 + t * 0.3); ctx.stroke();
  ctx.globalAlpha = ga;
  // 마지막 눈: 검은 원반 가운데 세로로 찢어진 흰 눈이 플레이어를 본다
  const S = R.slit, lx = b.look ?? 0, ly = b.lookY ?? 0, ew = r * 0.22, eh = r * 0.62 * (0.85 + 0.15 * Math.sin(t * 2.3));
  const eo = dying ? clamp(1 - dT / 2.2, 0, 1) : 1;
  if (S && eo > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    put(ctx, st, SM, S.v.base, S, S.c, 0, 0, 0, S.k * (ew * 2.4 / SLIT_W), S.k * (eh * 2.1 / SLIT_H) * eo, k);
    glowE(ctx, SM, lx * ew * 0.5, ly * eh * 0.25, ew * 2.2, ew * 2.2, IRIS, 0.8 * k * eo);
    ctx.globalCompositeOperation = op;
    setT(ctx, SM);
    ctx.globalAlpha = ga * k;
    ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.ellipse(lx * ew * 0.5, ly * eh * 0.25, ew * 0.3, eh * 0.5 * eo, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = ga;
  }
  // 홍염: 테두리에서 솟았다 떨어지는 흰 불꽃 고리
  if (k > 0.3) {
    setT(ctx, SM);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < (q.name === 'high' ? 5 : 2); i++) {
      const a = i * 1.7 + t * 0.21, life = (t * 0.35 + i * 0.27) % 1, hgt = r * (0.35 + 0.9 * Math.sin(PI * life));
      const c = Math.cos(a), sn = Math.sin(a), c2 = Math.cos(a + 0.5), s2 = Math.sin(a + 0.5), am = a + 0.25;
      ctx.globalAlpha = ga * 0.55 * k * Math.sin(PI * life) * fl;
      ctx.strokeStyle = i % 2 ? DAWN : WHITE; ctx.lineWidth = 3 + 3 * (1 - life);
      ctx.beginPath(); ctx.moveTo(c * r, sn * r); ctx.quadraticCurveTo(Math.cos(am) * (r + hgt * 1.6), Math.sin(am) * (r + hgt * 1.6), c2 * r, s2 * r); ctx.stroke();
    }
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
  }
  // 핵 피격 섬광: 원반이 하얗게
  if (flashK > 0.01) {
    setT(ctx, SM);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * flashK;
    ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
  }
}

// ───────────────────────── 손 ─────────────────────────
function drawHand(ctx, st, R, b, h, wm, t, q) {
  if (h.a <= 0.01) return;
  const Pm = R.palm; if (!Pm) return;
  const HM = frame(st.hm, wm, h.x, h.y, h.rot, -h.side * h.s, h.s);
  const ga = ctx.globalAlpha;
  if (h.a < 1) ctx.globalAlpha = ga * h.a;
  const wk = 1 / MK;
  // 손목 천에서 풀려 흔들리는 짧은 공허의 올 (손바닥 뒤, 끝으로 가늘어진다)
  setT(ctx, HM);
  ctx.lineCap = 'round'; ctx.strokeStyle = VOID;
  for (let i = 0; i < 4; i++) {
    const x0 = -24 + i * 16, y0 = 88, sw = Math.sin(t * 2.2 + i * 1.4 + h.i) * 8, len = 24 + (i % 2) * 16;
    let px = x0, py = y0;
    for (let k = 1; k <= 3; k++) {
      const u = k / 3, x = x0 + sw * u * u, y = y0 + len * u;
      ctx.lineWidth = 6 * (1.15 - u); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      px = x; py = y;
    }
  }
  // 손바닥 (감긴 눈이 그려져 있다)
  put(ctx, st, HM, V(st, Pm), Pm, Pm.c, 0, 4, 0, Pm.k * wk, Pm.k * wk);
  crackGlow(ctx, st, HM, Pm, Pm.c, 0, 4, 0, Pm.k * wk, t, q);
  // 손가락: 로직 curl · spread · point 를 그대로 — 마디마다 접힌 만큼 짧아지고(원근), 뒤로 넘어가면 어두운 면
  const tw0 = h.mode === 'float' ? 1 : 0.25;
  for (const f of FING) {
    const curl = f.thumb ? h.curl * 0.6 : h.point > 0.5 ? (f.i === 3 ? 0.04 : 0.95) : h.curl;
    const a0 = f.aN * (0.55 + 0.45 * h.spread);
    let x = f.b[0], y = f.b[1];
    for (let k = 0; k < f.seg.length; k++) {
      const p = R[f.names[k]]; if (!p) break;
      const sg = f.seg[k], th = CURL[k] * curl * (f.thumb ? 0.8 : 1), c = Math.cos(th);
      const a = a0 + sg.d * (1 - 0.6 * clamp(curl, 0, 1));
      const len = sg.L * (Math.abs(c) < 0.22 ? (c < 0 ? -0.22 : 0.22) : c);
      const side = sg.L * Math.sin(th) * 0.18 * (f.thumb ? -1 : 1), tw = Math.sin(t * 7 + f.i * 1.3 + k) * 0.6 * tw0;
      const ux = Math.sin(a), uy = -Math.cos(a), nx = Math.cos(a), ny = Math.sin(a);
      const x2 = x + ux * len + nx * (side + tw), y2 = y + uy * len + ny * (side + tw);
      limb(ctx, st, HM, V(st, p, c < 0), p, 'a', 'b', x, y, x2, y2, wk);
      x = x2; y = y2;
    }
  }
  // 손바닥 눈: 뜨면 눈꺼풀이 세로로 벌어지고 홍채가 플레이어 쪽으로
  const o = h.eye ?? 0, E = R.peye;
  if (o >= 0.06 && E) {
    const p = b.world?.player;
    let lx = 0, ly = 0;
    if (p) { const dx = p.cx - h.x, dy = p.cy - h.y, c = Math.cos(-h.rot), s = Math.sin(-h.rot); lx = (dx * c - dy * s) * -h.side; ly = dx * s + dy * c; const d = Math.hypot(lx, ly) || 1; lx /= d; ly /= d; }
    put(ctx, st, HM, E.v.base, E, E.c, lx * 3, 4 + ly * 2 * o, 0, E.k * wk, E.k * wk * o);
    if (q.halos) glowE(ctx, HM, 0, 4, 46, 46, IRIS, 0.35 * o);
  } else if (q.halos) glowE(ctx, HM, 0, 6, 26, 26, IRIS, 0.12 + 0.08 * Math.sin(t * 4 + h.i));
  // P4: 새벽빛 테
  if (b.sunK > 0.05 && Pm.v.flash) {
    const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    const rec = st.rec; st.rec = false;
    put(ctx, st, HM, Pm.v.flash, null, Pm.c, 0, 4, 0, Pm.k * wk, Pm.k * wk, 0.16 * b.sunK);
    st.rec = rec;
    ctx.globalCompositeOperation = op;
    if (q.halos) glowE(ctx, HM, 0, 0, 70, 70, DAWN, 0.25 * b.sunK);
  }
  ctx.globalAlpha = ga;
}

// ───────────────────────── 입자 ─────────────────────────
function levelBurst(P, b, level) {
  const x = b.bx, y = b.by + b.bob;
  P.burst('chip', x, y, 8 + level * 5, { speed: 280, color: PORC });
  P.burst('spore', x, y + 40, 14 + level * 4, { speed: 200, color: VIO_L });
}
function formBurst(P, b, fp) {
  const x = b.bx, y = b.by + b.bob;
  if (fp === 1) { P.burst('chip', x, y, 22, { speed: 360, color: PORC }); P.burst('spore', x, y, 30, { speed: 260, color: VIO }); }
  else if (fp === 2) { for (let i = 0; i < 5; i++) P.burst('spore', x, y + i * 36, 8, { speed: 220, color: i % 2 ? BITE : WHITE }); P.burst('chip', x, y, 16, { speed: 300, color: PORC }); }
  else if (fp >= 3) { P.burst('ember', x, y, 40, { speed: 360, color: DAWN }); P.burst('spore', x, y, 30, { speed: 300, color: WHITE }); }
}
function ambient(P, b, st, dt, q, hit, t, X, Y, room) {
  if (b.dying > 0) return;
  const amb = q.ambient, sun = b.sunK > 0.5;
  // 수의에서 떠오르는 별 티끌
  if (!sun && rr.next() < dt * 3.5 * amb * b.introK) P.emit('spore', X + rr.range(-190, 190), Y + rr.range(-80, Math.min(200, room)), rr.range(-12, 12), rr.range(-40, -12), { color: rr.chance(0.6) ? STARC : VIO_L, layer: rr.chance(0.5) ? 0 : 1 });
  // 아가리로 빨려 드는 별
  if ((b.mawK > 0.3 || b.tear > 0.5) && rr.next() < dt * 9 * amb) {
    const a = rr.next() * TAU, r = rr.range(140, 220), mx = X, my = Y + MAW_Y;
    P.emit('spore', mx + Math.cos(a) * r, my + Math.sin(a) * r * 0.5, -Math.cos(a) * 220, -Math.sin(a) * 110, { color: rr.chance(0.5) ? WHITE : VIO_L, life: 0.6, layer: 1 });
  }
  // 검은 태양의 새벽빛 불티
  if (sun && rr.next() < dt * 10 * amb) { const a = rr.next() * TAU, r = 84 + rr.range(0, 20); P.emit('ember', X + Math.cos(a) * r, Y + Math.sin(a) * r, Math.cos(a) * 60, Math.sin(a) * 60 - 20, { color: rr.chance(0.5) ? DAWN : WHITE, layer: 1 }); }
  // 일그러짐이 튈 때 가면 가루
  const gl = b.glitch > 0.6;
  if (gl && !st.gl0 && !sun) P.burst('chip', X, Y, 5, { speed: 180, color: PORC });
  st.gl0 = gl;
  if (hit) {
    const fp = st.fp, H = fp === 'h0' ? b.hands[0] : fp === 'h1' ? b.hands[1] : null;
    if (H) { P.burst('chip', H.x, H.y, 6, { speed: 220, color: PORC }); if (H.eye > 0.5) P.burst('spore', H.x, H.y, 5, { speed: 160, color: IRIS }); }
    else if (sun) P.burst('ember', X, Y, 8, { speed: 260, color: DAWN });
    else if (b.mawK > 0.55) P.burst('spore', X, Y + MAW_Y, 8, { speed: 220, color: BITE });
    else if (fp === 'shroud') P.burst('spore', X + rr.range(-60, 60), Y + rr.range(60, 140), 6, { speed: 160, color: WHITE });
    else { P.burst('chip', X + rr.range(-12, 12), Y + rr.range(-20, 20), 5, { speed: 220, color: PORC }); P.burst('spore', X, Y, 4, { speed: 140, color: VIO_L }); }
  }
}

// ───────────────────────── 사망 ─────────────────────────
function deathFx(ctx, b, rig, st, dt, dT) {
  const R = rig.parts, P = st.P, dead = st.dead, X = b.bx, Y = b.by + b.bob, sun = b.sunK > 0.5;
  // 1.3 s: 늘어진 손이 부서지며 가루가 된다 (로직이 손을 흐리게 한다)
  if (!dead.hands && dT > 1.3) {
    for (const h of b.hands) { P.burst('chip', h.x, h.y, 14, { speed: 240, color: PORC }); P.burst('spore', h.x, h.y, 10, { speed: 180, color: VIO_L }); }
    dead.hands = true;
  }
  // 무너지는 동안: 빛 티끌이 가운데로 빨려 든다
  if (dT < 2.7 && rr.next() < dt * 24) { const a = rr.next() * TAU, r = rr.range(120, 260); P.emit('spore', X + Math.cos(a) * r, Y + Math.sin(a) * r, -Math.cos(a) * 200, -Math.sin(a) * 200, { color: rr.chance(0.5) ? WHITE : DAWN, life: 0.8 }); }
  // 2.7 s: 흰 섬광 — 가면(또는 태양 앞 반쪽) 조각과 파편이 흩어져 떨어진다
  if (!dead.white && dT >= 2.7) {
    const fade = 1.4;
    const M = R.mask, k = M?.k ?? 0.6, sx = b.sxOf(), sep = (2.7 - 1.6) * 14;
    for (const n of st.frags) {
      const p = R[n]; if (!p) continue;
      if (sun && p.c[0] > p.o[0]) continue;
      const dx = p.c[0] - p.o[0], dy = p.c[1] - p.o[1], L = Math.hypot(dx, dy) || 1;
      const s = sun ? k * 0.72 : k, ox = sun ? -10 : 0, oy = sun ? 6 : 0;
      const wx = X + (ox + (dx / L) * sep + (p.c[0] - p.o[0]) * s) * (sun ? 1 : sx), wy = Y + oy + (dy / L) * sep + (p.c[1] - p.o[1]) * s;
      st.shards.spawn(pickVariant(p, 0), p.c[0], p.c[1], wx, wy, rr.range(-0.3, 0.3), s * (sun ? 1 : Math.sign(sx) || 1), s, (dx / L) * rr.range(160, 320), (dy / L) * rr.range(120, 260) - 260, rr.range(-6, 6), { r: 10, bounce: 0.35, fade });
    }
    for (let i = 0; i < st.debris.length; i++) {
      const p = R[st.debris[i]]; if (!p) continue;
      const a = -PI / 2 + (rr.next() - 0.5) * 2.8, sp = rr.range(220, 460);
      st.shards.spawn(p.v.base, p.c[0], p.c[1], X + rr.range(-60, 60), Y + rr.range(-40, 60), rr.next() * TAU, p.k * rr.sign() * 1.2, p.k * 1.2, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-8, 8), { r: (p.w + p.h) * 0.2 * p.k, fade });
    }
    P.burst('spore', X, Y, 40, { speed: 420, color: WHITE });
    P.burst('spore', X, Y, 24, { speed: 300, color: DAWN });
    P.burst('chip', X, Y, 22, { speed: 380, color: PORC });
    if (sun) P.burst('ember', X, Y, 30, { speed: 400, color: DAWN });
    dead.white = true;
  }
}
/** 빛의 금 (로직 drawCracks 와 같은 점 · 같은 속도) — 가면/핵에서 사방으로 번진다 */
function drawCracks(ctx, st, b, wm, X, sx, dT) {
  const k = clamp(dT / 2.4, 0, 1);
  if (k <= 0) return;
  const CM = frame(st.hm, wm, X, b.coreY(), 0, sx, 1);
  setT(ctx, CM);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const C of CRACKS) {
    const segs = C.length / 2 - 1, m = k * segs, full = Math.floor(m), fr = m - full;
    ctx.moveTo(C[0], C[1]);
    for (let j = 1; j <= full; j++) ctx.lineTo(C[j * 2], C[j * 2 + 1]);
    if (full < segs) ctx.lineTo(lerp(C[full * 2], C[full * 2 + 2], fr), lerp(C[full * 2 + 1], C[full * 2 + 3], fr));
  }
  ctx.strokeStyle = 'rgba(255,246,220,0.35)'; ctx.lineWidth = 8; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.4; ctx.stroke();
  ctx.globalCompositeOperation = op;
  glowE(ctx, CM, 0, 0, 60 + k * 170, 60 + k * 170, WHITE, 0.4 + 0.5 * k, true);
}
/** 흰 섬광 뒤: 작은 빛 하나가 떠오르며 사그라든다 (로직 drawDeathLight 와 같은 자리) */
function deathLight(ctx, st, b, dT) {
  const u = clamp((dT - 2.7) / 1.3, 0, 1), x = b.bx, y = b.coreY() - u * 20;
  glowE(ctx, st.wm, x, y, 160 * (1 - u) + 4, 160 * (1 - u) + 4, DAWN, 0.5 * (1 - u));
  glowE(ctx, st.wm, x, y, 70 * (1 - u) + 6, 70 * (1 - u) + 6, WHITE, 1 - u, true);
}
