// 다곤 (b_dagon) — 채색 컷아웃 퍼핏 렌더러 (s16 '가라앉은 성소', 사제왕)
// 부품 (Kling, 옆모습 — 오른쪽을 봄): 아귀 머리(부푼 흐린 눈·등지느러미 가시·아가미 주름 목) · 경첩으로 자른 아래턱(바늘이빨) ·
//   녹청 사제복을 걸친 비늘 몸통 · 따개비 핀 파이프 오르간(검은 물이 흘러내림) · 위팔/아래팔(뒤쪽은 어둡게) · 물갈퀴 발톱 ·
//   목장 쥔 주먹 · 산호 목장 자루 + 소용돌이 갈고리(진주) · 산호 왕관 · 생물발광 미끼 전구 · 뱀장어 촉수 타일 6 ·
//   진주층 낭종에 박힌 익사한 순례자 3 · 살점/따개비/오르간 파편 11.
// 절차적 층: 입속(검붉은 목구멍 + 그 안의 둘째 입) · 아가미 틈(한 번 구운 스프라이트, 벌어짐) · 미끼 줄기 · 발광 ·
//   상처(균열 발광 = 체액 청록) · 늘어나는 잔눈 · 터진 눈(2단계) · 오르간 소리 구멍 빛 · 수면 거품 · 체액/물방울 입자 ·
//   사망: 경련 → 체액 분출 + 살점 파편 → 순례자들이 풀려나 떠오름 → 오르간 관이 부러져 떨어짐 → 가라앉으며 사라짐.
// 로직(src/game/bosses/c_dagon.js)의 상태를 읽기만 한다:
//   boss { ox, oy, facing, rot, sink, wy, ps{mouth,gill,crook,arms,crown,pipes,wail,slump,lean,inhale}, K{hx,hy,ha,mx,my,gl,gr,crookX,crookY},
//          bulbs[{i,alive,grow,hitT,out,sx,sy,tx,ty,lx,ly}], lures, dmg, dash, twitch, dying, dieT, flashT, hitPart, pFace, pGill, pBody, A }
// 좌표: 벡터 paintBody 와 같은 몸 좌표계 — translate(ox, oy−70) · scale(facing,1) · rotate(rot·π/2) · translate(0,70).
//   원점 = 상체 밑 수면선, +x = 바라보는 쪽, 위 = −y. 바닥(A.floor) 아래는 잘라 그린다. 판정은 바꾸지 않는다.
import { Drawer, Particles, Shards, halo, rr, loadRig, pickVariant, quality, QUALITY, makeCanvas, ik2 } from '../kit.js';

const DIR = 'painted/bosses/b_dagon';
const BIO = '#6fffe8', WATER = '#6fd8ff', ICHOR = '#58ffd8', GILLC = '#ff5a6a', CORAL_L = '#ff9d7e', PALE = '#bff4ff', HEART = '#4aa8ff';
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const tierOf = (game) => { const t = game?.quality ?? game?.tier ?? game?.settings?.quality; return QUALITY[t] ? t : quality(game).name; };
const qualityOf = (game) => QUALITY[tierOf(game)];

// 배치 (몸 지역 좌표, 월드 px). 부품 배율 1 = 아틀라스 기준 크기
const HEAD_S = 0.9;                 // 머리 · 턱
const CROWN_S = 0.85;
const TORSO_S = 1.2, TORSO_Y = 20;  // 몸통 'base' 가 (0, TORSO_Y)
const ORGAN_S = 1.0, ORGAN_X = -72, ORGAN_Y = -118, ORGAN_A = -0.14;
const ARM_S = 1.0, FIST_S = 1.05, BULB_S = 0.95;
// 순례자 낭종 (x, y, 기울기, 배율) — 등살·사제복 뒷자락에 박혀 있다
const PILGRIMS = [[-92, -120, -0.16, 0.92], [-104, -46, -0.06, 0.84], [-126, -180, -0.3, 0.68]];
const TENT_BACK = [-70, -30, 10], TENT_FRONT = [-40, 0, 36, 70];
const TILES = ['tent0', 'tent1', 'tent2', 'tent3', 'tent4', 'tent5'];
// 원본 아틀라스 텍셀(td 2) 좌표로 잡은 보조 점 — 로드 때 구운 텍셀로 바꾼다
const HEAD_PTS = {
  lip: [[400, 286], [470, 262], [556, 240]],                  // 윗입술 안쪽 선 (경첩 → 주둥이 끝)
  small: [[477, 152], [335, 155], [300, 228], [430, 116], [522, 162], [262, 170]],   // 손상될수록 뜨는 잔눈
};
const JAW_PTS = { tip: [202, 44], mid: [104, 40], back: [26, 34] };

const DEF = {
  glow: ICHOR,
  outline: { width: 1.8, color: 'rgba(4,10,12,0.92)' },
  defaults: { stain: 'rgb(8,20,18)', char: 0.45, crackMinLum: 40 },
  parts: {
    head: { flash: true, cracks: 5, holes: 0 }, jaw: { flash: true, cracks: 2, holes: 0 },
    torso: { flash: true, cracks: 6, holes: 1 }, organ: { deep: 0.82, deepOnly: true, cracks: 5, holes: 1 },
    armU: { flash: true, deep: 0.6, cracks: 2, holes: 0 }, armF: { flash: true, deep: 0.6, cracks: 2, holes: 0 },
    fist: { flash: true, noDmg: true }, claw: { deep: 0.6, deepOnly: true, noDmg: true },
    staff: { noDmg: true }, crook: { noDmg: true }, crown: { flash: true, cracks: 2, holes: 0 }, bulb: { flash: true, noDmg: true, outline: 1 },
  },
  prefix: { tent: { deep: 0.55, cracks: 1, holes: 0, outline: 0 }, pil: { noDmg: true }, deb: { noDmg: true, outline: 1.2 } },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_dagon', kind: 'boss', ownsDeathFade: true,
  async load(env) {
    const rig = await loadRig(DIR, DEF, env);
    const names = Object.keys(rig.parts);
    rig.debs = names.filter((n) => /^deb\d+$/.test(n)).sort((a, b) => +a.slice(3) - +b.slice(3)).map((n) => rig.parts[n]);
    rig.pils = [0, 1, 2].map((i) => rig.parts['pil' + i]).filter(Boolean);
    rig.tents = TILES.map((n) => rig.parts[n]).filter(Boolean);
    rig.pts = bakePoints(rig);
    rig.bake = bakeFx();
    rig.art = makeArt(rig);
    return rig;
  },
  init(b, rig) {
    const q = qualityOf(b.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(48), q, lt: null, pf: 0, jolt: 0, lvl: -1, sel: null,
      tp: new Float32Array(22), arc: new Float32Array(24), W: [0, 0], lp: [0, 0], lq: [0, 0], J: {}, J2: {},
      alive: [true, true, true], freed: [], ev: 0, drip: 0, foam: 0, sink0: null, dieSeen: false,
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    let x0, x1, y0, y1;
    if ((b.rot ?? 0) > 0.3) { x0 = b.ox - 540; x1 = b.ox + 540; y0 = b.oy - 70 - 300; y1 = b.oy - 70 + 300; }
    else { x0 = b.ox - 380; x1 = b.ox + 380; y0 = b.oy - 540; y1 = Math.max(b.oy + 260, (b.A?.floor ?? 0) + 4); }   // 촉수·목장은 바닥(+2 클립)까지 내려온다
    for (const l of b.lures ?? []) { x0 = Math.min(x0, l.x - 90); x1 = Math.max(x1, l.x + 90); y0 = Math.min(y0, l.y - 90); y1 = Math.max(y1, l.y + 90); }
    // 남아 있는 입자 (잠수해 다른 자리로 옮긴 뒤에도 이전 자리의 거품·체액이 잠깐 남는다 — BOSS_PIPELINE §8.15)
    const P = st?.P;
    if (P?.n) for (let i = 0; i < P.n; i++) { const px = P.x[i], py = P.y[i]; if (px - 30 < x0) x0 = px - 30; if (px + 30 > x1) x1 = px + 30; if (py - 30 < y0) y0 = py - 30; if (py + 30 > y1) y1 = py + 30; }
    if ((b.dying > 0 || st?.shards?.list.length || st?.freed?.length) && b.A) { x0 = Math.min(x0, b.A.x0); x1 = Math.max(x1, b.A.x1); y0 = Math.min(y0, b.oy - 700); y1 = Math.max(y1, b.A.floor + 20); }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b) {
    if (b.dying > 0) return;
    if ((b.ps?.wail ?? 0) > 0.3) L.add(b.ox - (b.facing || 1) * 100, b.oy - 110, 150, BIO, 0.35 * b.ps.wail);
  },
  debris(i, rig) {
    const L = rig.debs; if (!L?.length) return null;
    const p = L[i % L.length], im = p.v.base, k = p.k;
    return { size: Math.max(8, (p.r ?? 8) * 1.2), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 로드 때 한 번 ─────────────────────────
/** 원본 아틀라스 텍셀 → 구운 텍셀(+패드) */
function tex(p, q) { const f = p.rawW / p.e.w; return [q[0] * f + p.pad, q[1] * f + p.pad]; }
function bakePoints(rig) {
  const H = rig.parts.head, J = rig.parts.jaw, out = { lip: [], small: [], jaw: {} };
  if (H) { out.lip = HEAD_PTS.lip.map((q) => tex(H, q)); out.small = HEAD_PTS.small.map((q) => tex(H, q)); }
  if (J) for (const [k, q] of Object.entries(JAW_PTS)) out.jaw[k] = tex(J, q);
  return out;
}
/** 아가미 틈 · 아가미 덮개 스프라이트 (그라디언트는 여기서 한 번만) */
function bakeFx() {
  const gill = makeCanvas(64, 26), g = gill.getContext('2d');
  g.translate(32, 13);
  const lens = () => { g.beginPath(); g.moveTo(-30, 0); g.quadraticCurveTo(0, -15, 30, 0); g.quadraticCurveTo(0, 15, -30, 0); g.closePath(); };
  lens();
  const gr = g.createRadialGradient(-2, 0, 1, 0, 0, 30);
  gr.addColorStop(0, '#ff9aa4'); gr.addColorStop(0.3, '#d8384e'); gr.addColorStop(0.72, '#5a0818'); gr.addColorStop(1, '#1a0207');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(255,170,180,0.55)'; g.lineWidth = 1;
  g.beginPath();
  for (let k = -5; k <= 5; k++) { const x = k * 5, h = 11 * (1 - (x / 31) ** 2); g.moveTo(x - 1, -h * 0.85); g.quadraticCurveTo(x + 2, 0, x - 1, h * 0.85); }
  g.stroke();
  lens(); g.strokeStyle = 'rgba(14,3,6,0.95)'; g.lineWidth = 2.2; g.stroke();
  const flap = makeCanvas(66, 18), f = flap.getContext('2d');
  f.translate(33, 12);
  f.beginPath(); f.moveTo(-31, 2); f.quadraticCurveTo(0, -12, 31, -2); f.lineTo(29, 4); f.quadraticCurveTo(0, -3, -31, 2); f.closePath();
  const fg = f.createLinearGradient(0, -12, 0, 5);
  fg.addColorStop(0, '#9db5a4'); fg.addColorStop(0.5, '#4f6a5c'); fg.addColorStop(1, '#1a2620');
  f.fillStyle = fg; f.fill();
  f.strokeStyle = 'rgba(6,12,10,0.9)'; f.lineWidth = 1.4; f.stroke();
  return { gill, flap };
}

// ───────────────────────── 도우미 ─────────────────────────
function axis(p, a, b) {
  const key = a + '>' + b, c = (p._ax ??= {});
  if (!c[key]) { const A = p[a], B = p[b]; c[key] = { a: Math.atan2(B[1] - A[1], B[0] - A[0]), len: Math.hypot(B[0] - A[0], B[1] - A[1]) * p.k }; }
  return c[key];
}
function put(D, part, img, pivot, x, y, rot, sc = 1, sxm = 1, sym = 1, alpha = 1) {
  if (!part || !img) return;
  const k = part.k * sc;
  D.part(part, img, pivot, x, y, rot, k * sxm, k * sym, alpha);
}
/** 두 점 사이 뼈 (pa → pb 축 정렬, 길이 맞춤, 굵기 wMul — 축이 텍스처의 가로(자루)든 세로(팔)든 굵기 쪽에만) */
function seg(D, part, img, pa, pb, x0, y0, x1, y1, wMul = 1, alpha = 1) {
  if (!part || !img) return;
  const ax = axis(part, pa, pb), len = Math.hypot(x1 - x0, y1 - y0) || 1, s = len / (ax.len || 1);
  const horiz = Math.abs(Math.cos(ax.a)) > 0.7;
  D.part(part, img, pa, x0, y0, Math.atan2(y1 - y0, x1 - x0) - ax.a, part.k * s * (horiz ? 1 : wMul), part.k * s * (horiz ? wMul : 1), alpha);
}
/** 부품 텍셀 점 q 의 좌표 (pivot pv 가 (x,y), 회전 rot, 배율 sc) */
function ptOf(p, pv, q, x, y, rot, sc, out, sxm = 1, sym = 1) {
  const A = typeof pv === 'string' ? p[pv] : pv;
  const dx = (q[0] - A[0]) * p.k * sc * sxm, dy = (q[1] - A[1]) * p.k * sc * sym, c = Math.cos(rot), s = Math.sin(rot);
  out[0] = x + c * dx - s * dy; out[1] = y + s * dx + c * dy; return out;
}
/**
 * 점 목록 P(xy 교대, n 점)을 따라 촉수 타일을 잇는다: 끝 → 뿌리 순서(두꺼운 쪽이 위), 타일마다 겹침 14%.
 * 타일 밑에 어두운 살 관을 먼저 그어 굽은 바깥쪽 틈을 덮는다 (tube = 뿌리 쪽 굵기 px, 0 = 없음)
 */
function tileChain(D, tiles, P, n, arc, thick0, thick1, deep, lvl, alpha = 1, tube = 0) {
  arc[0] = 0;
  for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + Math.hypot(P[i * 2] - P[i * 2 - 2], P[i * 2 + 1] - P[i * 2 - 1]);
  const L = arc[n - 1]; if (L < 4) return;
  if (tube > 0) {
    const ctx = D.ctx, h = n >> 1, ga = ctx.globalAlpha;
    D.end();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = deep ? '#141a1c' : '#1e2629';
    if (alpha < 1) ctx.globalAlpha = ga * alpha;
    ctx.lineWidth = tube;
    ctx.beginPath(); ctx.moveTo(P[0], P[1]); for (let i = 1; i <= h; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1]); ctx.stroke();
    ctx.lineWidth = tube * 0.55;
    ctx.beginPath(); ctx.moveTo(P[h * 2], P[h * 2 + 1]); for (let i = h + 1; i < n - 1; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1]); ctx.stroke();
    ctx.globalAlpha = ga;
  }
  const m = tiles.length;
  const at = (d, o) => {
    let i = 1; while (i < n - 1 && arc[i] < d) i++;
    const s0 = arc[i - 1], u = (d - s0) / ((arc[i] - s0) || 1);
    o[0] = P[i * 2 - 2] + (P[i * 2] - P[i * 2 - 2]) * u; o[1] = P[i * 2 - 1] + (P[i * 2 + 1] - P[i * 2 - 1]) * u; return o;
  };
  const a = tileChain._a ??= [0, 0], b = tileChain._b ??= [0, 0];
  for (let j = m - 1; j >= 0; j--) {
    const p = tiles[j]; if (!p) continue;
    at(L * j / m, a); at(L * (j + 1) / m, b);
    const ax = axis(p, 'a', 'b'), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, sl = len * 1.14 / (ax.len || 1);
    const th = lerp(thick0, thick1, j / Math.max(1, m - 1));
    D.part(p, pickVariant(p, lvl, deep), 'a', a[0], a[1], Math.atan2(b[1] - a[1], b[0] - a[0]) - ax.a, p.k * sl, p.k * th, alpha);
  }
}

// ───────────────────────── 메인 ─────────────────────────
function tick(b, world, st) {
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  if (st.q.name !== tierOf(world.game)) st.q = qualityOf(world.game);
  const F = b.A?.floor ?? (b.oy + 300);
  st.P.update(dt, F); st.shards.update(dt, F);
  // 풀려난 순례자: 떠오르며 흐려진다
  for (const f of st.freed) { f.t += dt; f.vy = Math.max(-90, f.vy - 60 * dt); f.vx *= Math.pow(0.4, dt); f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; }
  if (st.freed.length && st.freed.some((f) => f.t > 2.6)) st.freed = st.freed.filter((f) => f.t <= 2.6);
  return dt;
}
function struckGroup(b) {
  const hp = b.hitPart;
  if (!hp) return 'body';
  if (hp === b.pFace) return 'head';
  if (hp.bulb || hp.lure) return 'bulb';
  if (b.pGill && (hp === b.pGill[0] || hp === b.pGill[1])) return 'gill';
  return 'body';
}
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, dt = tick(b, world, st), R = rig.parts, q = st.q, t = b.t ?? 0;
  const A = b.A, F = A?.floor ?? (b.oy + 300);
  const dying = b.dying > 0, el = dying ? (b.dieT ?? 0) : 0;
  const lvl = dying ? 2 : clamp(b.dmg ?? 0, 0, 2);
  const f = b.facing || 1, rot = b.rot ?? 0, ra = rot * PI / 2, cr = Math.cos(ra), sr = Math.sin(ra);
  // 몸 좌표 → 월드 (입자·파편용; 로직 toWorld 와 같은 식)
  const Wd = (lx, ly, out = st.W) => { const dy = ly + 70; out[0] = b.ox + f * (lx * cr - dy * sr); out[1] = b.oy - 70 + (lx * sr + dy * cr); return out; };
  st.Wd = Wd; st.dt = dt;
  if (st.lvl >= 0 && lvl > st.lvl && !dying) levelBurst(st, rig, Wd);
  st.lvl = lvl;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) { st.jolt = 1; st.sel = struckGroup(b); if (st.sel !== 'bulb') hitSpray(st, b, Wd); }
  st.jolt = Math.max(0, st.jolt - dt * 6);
  const flash = !dying && b.flashT > 0 ? clamp(b.flashT / 0.12, 0, 1) : 0;
  // 부서진 왕관 미끼 → 전구가 깨지는 순간 파편
  for (const bu of b.bulbs ?? []) {
    const was = st.alive[bu.i];
    st.alive[bu.i] = bu.alive;
    if (was && !bu.alive && !dying) { const w = Wd(bu.lx, bu.ly); st.P.burst('spark', w[0], w[1], 10, { speed: 240, color: PALE }); st.P.burst('ichor', w[0], w[1], 6, { speed: 160, color: '#0b2a26', hi: ICHOR }); }
  }
  // 사망 연출 사건
  if (dying) deathEvents(st, rig, b, el, Wd);
  else { st.ev = 0; st.dieSeen = false; }
  // 수면 거품 · 떠오를 때 흘러내리는 물
  surfaceFx(st, b, dt);
  let tx = b.twitch > 0 ? Math.sin(t * 60) * 5 * b.twitch : 0;
  if (dying && el < 0.9) tx += (rr.next() - 0.5) * 7 * (1 - el / 0.9);
  if (st.jolt > 0) tx += (rr.next() - 0.5) * 3 * st.jolt;
  const a0 = dying ? clamp(b.dying / 1.2, 0, 1) : 1;     // 마지막 1.2초 동안 가라앉으며 사라진다
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  D.begin(ctx);
  b.paintBack?.(ctx, world);           // 몸 둘레 수면 파문 (로직)
  st.P.draw(ctx, 0);
  if (a0 > 0.01) {
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * a0;
    D.save();
    ctx.beginPath(); ctx.rect((A?.x0 ?? b.ox - 2000) - 1200, F + 2 - 4000, (A?.w ?? 4000) + 2400, 4000); ctx.clip();   // 바닥 아래(심연)는 보이지 않는다
    ctx.translate(b.ox + tx, b.oy - 70); ctx.scale(f, 1); if (rot) ctx.rotate(ra); ctx.translate(0, 70);
    D.begin(ctx);
    if (flash > 0) D.startFlash(); else D.rec = false;
    figure(ctx, D, rig, b, st, lvl, t, flash, dying, el);
    if (flash > 0) D.flash(0.55 * flash); else D.rec = false;
    D.restore();
    ctx.globalAlpha = ga;
  }
  D.begin(ctx);
  // 풀려난 순례자 (월드 좌표, 몸 앞)
  for (const fr of st.freed) {
    const p = fr.p, a = clamp(1 - (fr.t - 1.4) / 1.2, 0, 1) * clamp(fr.t / 0.2, 0, 1);
    if (a <= 0.01 || !p) continue;
    put(D, p, p.v.base, 'c', fr.x, fr.y, fr.rot, fr.s, 1, 1, a);
    D.end();
    if (q.halos) halo(ctx, fr.x, fr.y, 34 * fr.s + fr.t * 10, PALE, 0.5 * a);
  }
  st.shards.draw(D);
  D.end();
  b.paintFront?.(ctx, world);          // 떠다니는 미끼 · 사망 때 떠오르는 푸른 심장 (로직, 미끼는 채색 전구로)
  st.P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

/** 몸 전체 (몸 지역 좌표) */
function figure(ctx, D, rig, b, st, lvl, t, flash, dying, el) {
  const R = rig.parts, s = b.ps ?? {}, K = b.K, q = st.q;
  const recOn = (g) => flash > 0 && (st.sel === g || (g === 'body' && st.sel === 'gill'));
  const V = (p, deep = false, lv = lvl) => pickVariant(p, lv, deep, null);
  const slump = s.slump ?? 0, inhale = s.inhale ?? 0, arms = s.arms ?? 0, lean = s.lean ?? 0;
  const br = K?.br ?? Math.sin(t * 1.7);
  D.rec = false;
  // 1) 뒤 촉수 (어둡게)
  if (rig.tents.length) for (let i = 0; i < TENT_BACK.length; i++) { tentPath(st.tp, TENT_BACK[i], i, false, s, t); tileChain(D, rig.tents, st.tp, 11, st.arc, 1.45, 0.95, true, lvl, 1, 20); }
  // 2) 등의 파이프 오르간
  const oy = ORGAN_Y + slump * 14 - inhale * 4, orot = ORGAN_A + lean * 0.06 + Math.sin(t * 0.8) * 0.01;
  if (R.organ) {
    put(D, R.organ, V(R.organ, true), 'base', ORGAN_X, oy, orot, ORGAN_S);
    glowOver(ctx, D, R.organ, lvl, 'base', ORGAN_X, oy, orot, ORGAN_S, 0.8, t, st, true);
    organFx(ctx, D, R.organ, st, s, lvl, t, oy, orot, dying);
  }
  // 3) 뒤팔: 어깨 → 물갈퀴 발톱 (로직 벡터와 같은 손 자리, 팔꿈치는 ik)
  D.rec = recOn('body');
  if (R.armU && R.armF) {
    const sx = -66, sy = -150 + slump * 14;
    const hx = -110 - arms * 70, hy = -10 - arms * 170 + Math.sin(t * 1.3 + 0.5) * 6;
    const l1 = axis(R.armU, 'a', 'b').len * ARM_S * 0.92, l2 = axis(R.armF, 'a', 'b').len * ARM_S * 0.9;
    const J = ik2(sx, sy, hx, hy, l1, l2, -1, st.J2);
    seg(D, R.armU, V(R.armU, true), 'a', 'b', sx, sy, J.ex, J.ey, 1.05);
    if (R.claw) { const ax = axis(R.claw, 'wr', 'tip'), a = Math.atan2(J.hy - J.ey, J.hx - J.ex); put(D, R.claw, V(R.claw, true), 'wr', J.hx, J.hy, a - ax.a + Math.sin(t * 2.1) * 0.08, ARM_S * 0.95); }
    seg(D, R.armF, V(R.armF, true), 'a', 'b', J.ex, J.ey, J.hx, J.hy, 1.05);
  }
  // 4) 몸통 (들숨에 부풀고, 숨 쉴 때 조금씩)
  D.rec = recOn('body');
  const ex = 1 + br * 0.012 + inhale * 0.07, ey = 1 + inhale * 0.02 - slump * 0.06;
  if (R.torso) {
    put(D, R.torso, V(R.torso), 'base', 0, TORSO_Y, 0, TORSO_S, ex, ey);
    glowOver(ctx, D, R.torso, lvl, 'base', 0, TORSO_Y, 0, TORSO_S, 1, t, st, false, ex, ey);
  }
  D.rec = false;
  // 5) 아가미 (판정 자리 그대로: K.gl / K.gr)
  D.end();
  gills(ctx, rig, b, st, s, t, flash > 0 && (st.sel === 'gill' || st.sel === 'body') ? flash : 0);
  // 6) 등살에 박힌 순례자들 (합창 때 울부짖으며 눈이 빛난다)
  pilgrims(ctx, D, rig, st, s, t, dying);
  // 7) 머리: 미끼 줄기(머리 뒤에서) → 입속 → 아래턱 → 머리 → 잔눈 → 왕관 → 전구
  headGroup(ctx, D, rig, b, st, s, t, lvl, recOn, dying);
  // 8) 앞팔 + 산호 목장
  frontArm(ctx, D, rig, b, st, s, t, lvl, recOn, V);
  // 9) 앞 촉수
  D.rec = false;
  if (rig.tents.length) for (let i = 0; i < TENT_FRONT.length; i++) { tentPath(st.tp, TENT_FRONT[i], i + 3, true, s, t); tileChain(D, rig.tents, st.tp, 11, st.arc, 1.75, 1.05, false, lvl, 1, 24); }
  D.end();
  // 10) 상처의 체액 (2단계: 옆구리에서 흐르는 청록 체액)
  if (lvl >= 1 && q.halos && !dying) {
    const k = lvl >= 2 ? 1 : 0.5, pk = 0.7 + 0.3 * Math.sin(t * 3.1);
    halo(ctx, -40, -80, 40 * k + 10, ICHOR, 0.22 * pk);
    if (lvl >= 2) halo(ctx, 26, -140, 30, ICHOR, 0.2 * pk);
  }
  if (dying && q.halos) {
    const k = clamp(el / 0.8, 0, 1);
    halo(ctx, -10, -110, 80 + 60 * k, ICHOR, 0.2 + 0.3 * k * (1 - clamp((el - 1.4) / 1, 0, 1)));
  }
}

/** 촉수 중심선 (벡터 drawTentacle 과 같은 식, 조금 더 길게) */
function tentPath(P, bx, i, front, s, t) {
  const n = 11, len = (front ? 200 : 170) * 1.08;
  const lift = (s.arms ?? 0) * (front ? 1 : 0.6);
  let a = PI / 2 + (front ? -0.55 + (i - 3) * 0.28 : 0.35 + i * 0.3) - lift * (front ? 0.9 : 0.5);
  let x = bx, y = 24;
  for (let k = 0; k < n; k++) {
    P[k * 2] = x; P[k * 2 + 1] = y;
    const w = Math.sin(t * (1.6 + i * 0.13) - k * 0.55 + i * 1.7) * (0.22 + k * 0.03) * (1 + lift);
    a += w * 0.35 + (front ? -0.04 : 0.03) * (1 + lift);
    x += Math.cos(a) * (len / n); y += Math.sin(a) * (len / n);
  }
}

/** 오르간: 소리 구멍 빛 (오르간·합창·전환), 부서진 관에서 흐르는 검은 물 */
function organFx(ctx, D, O, st, s, lvl, t, oy, orot, dying) {
  const q = st.q, pipes = s.pipes ?? 0, M = O.mouths;
  if (!M?.length) return;
  D.end();
  if (q.halos && pipes > 0.05) {
    for (let i = 0; i < M.length; i++) {
      ptOf(O, 'base', M[i], ORGAN_X, oy, orot, ORGAN_S, st.lp);
      halo(ctx, st.lp[0], st.lp[1], 14 + 26 * pipes, WATER, pipes * 0.8 * (0.8 + 0.2 * Math.sin(t * 18 + i)));
      if (pipes > 0.6) halo(ctx, st.lp[0], st.lp[1] - 4, 6, '#ffffff', (pipes - 0.6) * 1.5, true);
    }
  }
  // 1단계부터: 금 간 관(1·4·5번)의 소리 구멍에서 검은 물이 샌다 (입자)
  if (lvl >= 1 && !dying && st.Wd) {
    st.drip += st.dt * (q.particles > 150 ? 6 : 2.5);
    while (st.drip > 1) {
      st.drip -= 1;
      const i = [1, 4, 5][rr.int(3)];
      ptOf(O, 'base', M[Math.min(i, M.length - 1)], ORGAN_X, oy + 6, orot, ORGAN_S, st.lp);
      const w = st.Wd(st.lp[0] + rr.range(-3, 3), st.lp[1]);
      st.P.emit('ichor', w[0], w[1], rr.range(-8, 8), 0, { color: '#081418', hi: '#7fdcd0', hang: rr.range(0.1, 0.5), layer: 0 });
    }
  }
}

/** 아가미 틈 3개씩 (들숨·경직 때 크게 벌어져 붉게 빛난다) */
function gills(ctx, rig, b, st, s, t, fl) {
  const K = b.K; if (!K?.gl) return;
  const G = rig.bake.gill, Fp = rig.bake.flap, g = s.gill ?? 0, q = st.q;
  for (const [pt, side] of [[K.gl, -1], [K.gr, 1]]) {
    const cx = pt.x + side * 4, cy = pt.y;
    for (let i = 0; i < 3; i++) {
      const yy = cy - 20 + i * 18, open = clamp(0.28 + g * 0.72 + Math.sin(t * 5 + i + side) * g * 0.12, 0.2, 1.1);
      const w = 30 - i * 2, h = 12 * open;
      ctx.drawImage(G, cx - w / 2, yy - h / 2, w, h);
      // 덮개: 벌어질수록 들린다
      const lift = 3 + g * 7;
      ctx.drawImage(Fp, cx - w / 2 - 1, yy - h / 2 - lift - 3, w + 2, 8 + g * 2);
    }
    if (q.halos && g > 0.45) halo(ctx, cx, cy, 34, GILLC, (g - 0.45) * 0.8);
    if (fl > 0) halo(ctx, cx, cy, 30, '#ffffff', 0.45 * fl);
  }
}

/** 등살의 순례자 낭종 */
function pilgrims(ctx, D, rig, st, s, t, dying) {
  const L = rig.pils; if (!L.length) return;
  const wl = s.wail ?? 0, slump = s.slump ?? 0, q = st.q;
  for (let i = 0; i < PILGRIMS.length; i++) {
    if (dying && st.ev > 2 + i) continue;                       // 이미 풀려나 떠올랐다
    const [x, y0, a, sc] = PILGRIMS[i], p = L[i % L.length];
    const y = y0 + slump * (12 - i * 2);
    const shake = wl > 0.3 ? Math.sin(t * 31 + i * 2) * 1.6 * wl : 0;
    const pul = 1 + wl * 0.05 * Math.sin(t * 7 + i * 1.7) + Math.sin(t * 1.1 + i) * 0.01;
    put(D, p, p.v.base, 'c', x + shake, y, a + Math.sin(t * 0.9 + i) * 0.03, sc * pul);
    if (q.halos && (wl > 0.2 || dying)) {
      D.end();
      const k = dying ? 0.8 : wl;
      // 찢어지게 벌린 입 · 움푹한 눈이 생물발광으로 빛난다
      halo(ctx, x + shake, y - 4 * sc, 30 * sc, BIO, 0.35 * k);
      halo(ctx, x + shake - 5 * sc, y - 8 * sc, 7 * sc, '#ffffff', 0.5 * k, true);
      halo(ctx, x + shake + 4 * sc, y - 9 * sc, 7 * sc, '#ffffff', 0.5 * k, true);
    }
  }
}

/** 머리 묶음: 미끼 줄기 → 입속 → 아래턱 → 머리 → 잔눈 → 왕관 → 전구 */
function headGroup(ctx, D, rig, b, st, s, t, lvl, recOn, dying) {
  const R = rig.parts, H = R.head, K = b.K, q = st.q;
  if (!H || !K) return;
  const hx = K.hx, hy = K.hy, ha = K.ha;
  const mouth = s.mouth ?? 0;
  const jawR = -0.08 + mouth * 0.52 + Math.max(0, Math.sin(t * 2.3)) * 0.03 + (dying ? Math.sin(t * 13) * 0.04 : 0);
  // 미끼 줄기 (머리 뒤에서 나와 앞으로 휜다; 판정은 전구 = bulb.part)
  D.end();
  stalks(ctx, b, t);
  // 입속 (턱이 벌어진 틈으로 보인다)
  const P = rig.pts, hinge = ptOf(H, 'o', H.hinge, 0, 0, 0, HEAD_S, st.lq);
  const hgx = hinge[0], hgy = hinge[1];
  D.set(0, 0, hx, hy, ha, 1, 1);
  if (R.jaw && P.lip.length) {
    ctx.beginPath();
    ctx.moveTo(hgx, hgy);
    for (const lp of P.lip) { ptOf(H, 'o', lp, 0, 0, 0, HEAD_S, st.lp); ctx.lineTo(st.lp[0] + 4, st.lp[1] + 2); }
    ptOf(R.jaw, 'hinge', P.jaw.tip, hgx, hgy, jawR, HEAD_S, st.lp); ctx.lineTo(st.lp[0], st.lp[1]);
    ptOf(R.jaw, 'hinge', P.jaw.mid, hgx, hgy, jawR, HEAD_S, st.lp); ctx.lineTo(st.lp[0], st.lp[1]);
    ctx.closePath();
    ctx.fillStyle = '#16030a'; ctx.fill();
    // 목구멍 속의 또 다른 입 (둥글게 난 이빨)
    const open = clamp((jawR + 0.08) / 0.6, 0, 1);
    if (open > 0.15) {
      const mx = hgx + 22, my = hgy + 8 + open * 10;
      ctx.fillStyle = '#5a0a1a'; ctx.beginPath(); ctx.ellipse(mx, my, 9, 5 + open * 7, 0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ece7d3';
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + t * 0.6; ctx.moveTo(mx + Math.cos(a) * 8 + 1.4, my + Math.sin(a) * (4 + open * 6)); ctx.arc(mx + Math.cos(a) * 8, my + Math.sin(a) * (4 + open * 6), 1.4, 0, TAU); }
      ctx.fill();
    }
    D.end();
    if (q.halos) {
      const w = D.pt(0, 0, hgx + 30, hgy + 10 + open * 16, 0, 0, ha, 1, 1, st.lp);
      halo(ctx, hx + w[0], hy + w[1], 26 + open * 22, (s.pipes ?? 0) > 0.2 ? WATER : '#ff4a60', 0.18 + open * 0.3 + (s.pipes ?? 0) * 0.4);
    }
  }
  // 아래턱 · 머리
  D.rec = recOn('head');
  if (R.jaw) {
    const J = ptOf(H, 'o', H.hinge, hx, hy, ha, HEAD_S, st.lp);
    put(D, R.jaw, pickVariant(R.jaw, lvl, false), 'hinge', J[0], J[1], ha + jawR, HEAD_S);
  }
  put(D, H, pickVariant(H, lvl, false), 'o', hx, hy, ha, HEAD_S);
  glowOver(ctx, D, H, lvl, 'o', hx, hy, ha, HEAD_S, 0.9, t, st, false);
  // 잔눈 (손상될수록 머리 곳곳에 검은 물고기 눈이 뜬다) · 터진 큰 눈
  const nSmall = dying ? P.small.length : lvl >= 2 ? P.small.length : lvl >= 1 ? 3 : 1;
  D.set(0, 0, hx, hy, ha, 1, 1);
  for (let i = 0; i < nSmall && i < P.small.length; i++) {
    ptOf(H, 'o', P.small[i], 0, 0, 0, HEAD_S, st.lp);
    const r = 3 + ((i * 7) % 5) * 0.7, blink = Math.sin(t * 0.7 + i * 2.3) > 0.97 ? 0.25 : 1;
    ctx.fillStyle = '#1f2c27'; ctx.beginPath(); ctx.ellipse(st.lp[0], st.lp[1], r + 1.4, (r + 1.4) * blink, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#040708'; ctx.beginPath(); ctx.ellipse(st.lp[0], st.lp[1], r, r * blink, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(170,235,255,0.85)'; ctx.beginPath(); ctx.arc(st.lp[0] - r * 0.35, st.lp[1] - r * 0.35 * blink, r * 0.3, 0, TAU); ctx.fill();
  }
  if ((lvl >= 2 || dying) && H.eye) {
    ptOf(H, 'o', H.eye, 0, 0, 0, HEAD_S, st.lp);
    const ex = st.lp[0], ey = st.lp[1];
    ctx.fillStyle = '#1a0206'; ctx.beginPath(); ctx.ellipse(ex, ey, 15, 13, 0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a1020'; ctx.beginPath(); ctx.ellipse(ex - 2, ey + 2, 9, 7, 0.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(88,255,216,0.55)'; ctx.lineWidth = 2;
    const dy = (t * 40) % 30;
    ctx.beginPath(); ctx.moveTo(ex - 3, ey + 10); ctx.lineTo(ex - 4, ey + 12 + dy * 0.6); ctx.stroke();
    D.end();
    if (q.halos) { const w = D.pt(0, 0, ex, ey, 0, 0, ha, 1, 1, st.lp); halo(ctx, hx + w[0], hy + w[1], 24, ICHOR, 0.35); }
  }
  // 왕관 (머리 위, 머리와 함께 기운다)
  if (R.crown && H.crown) {
    const C = ptOf(H, 'o', H.crown, hx, hy, ha, HEAD_S, st.lp);
    put(D, R.crown, pickVariant(R.crown, Math.min(lvl, 1), false), 'base', C[0], C[1] + 2, ha - 0.06, CROWN_S);
  }
  D.rec = false;
  // 전구 (판정 부위 — 머리 앞에 그린다)
  D.end();
  bulbs(ctx, D, rig, b, st, t);
}
/** 미끼 줄기 + 실 (벡터와 같은 곡선, 채색 톤) */
function stalks(ctx, b, t) {
  ctx.lineCap = 'round';
  for (const bu of b.bulbs ?? []) {
    const sway = Math.sin(t * 1.9 + bu.i * 2.1) * 10;
    const cx = (bu.sx + bu.tx) / 2 - 18 + sway, cy = Math.min(bu.sy, bu.ty) - 40;
    ctx.beginPath(); ctx.moveTo(bu.sx, bu.sy); ctx.quadraticCurveTo(cx, cy, bu.tx, bu.ty);
    ctx.strokeStyle = '#08100e'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = '#4c6356'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = 'rgba(170,215,195,0.4)'; ctx.lineWidth = 1.8; ctx.stroke();
    // 마디 (따개비 같은 혹)
    ctx.fillStyle = '#8f8c7a';
    for (let k = 1; k < 4; k++) {
      const u = k / 4, x = (1 - u) * (1 - u) * bu.sx + 2 * (1 - u) * u * cx + u * u * bu.tx, y = (1 - u) * (1 - u) * bu.sy + 2 * (1 - u) * u * cy + u * u * bu.ty;
      ctx.beginPath(); ctx.arc(x + 2, y, 2.2, 0, TAU); ctx.fill();
    }
    if (bu.alive && !bu.out) {
      ctx.strokeStyle = 'rgba(180,255,240,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bu.tx, bu.ty); ctx.lineTo(bu.lx, bu.ly - 8); ctx.stroke();
    }
  }
}
/** 왕관 미끼 전구 (살아 있으면 발광 전구, 부서지면 찢긴 살 끝에서 체액) */
function bulbs(ctx, D, rig, b, st, t) {
  const Bp = rig.parts.bulb, q = st.q;
  for (const bu of b.bulbs ?? []) {
    if (bu.alive && bu.grow > 0 && !bu.out) {
      const k = 0.8 + 0.2 * Math.sin(t * 5 + bu.i) + (bu.hitT > 0 ? 0.6 : 0), r = 13 * (0.3 + 0.7 * bu.grow);
      if (q.halos) halo(ctx, bu.lx, bu.ly, r * 4.2, BIO, 0.55 * k);
      if (Bp) {
        const sc = BULB_S * (0.3 + 0.7 * bu.grow) * (1 + Math.sin(t * 5 + bu.i) * 0.04);
        put(D, Bp, Bp.v.base, 'c', bu.lx, bu.ly, Math.sin(t * 2 + bu.i) * 0.1, sc);
        if (bu.hitT > 0 && Bp.v.flash) { const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; put(D, Bp, Bp.v.flash, 'c', bu.lx, bu.ly, 0, sc, 1, 1, clamp(bu.hitT / 0.16, 0, 1) * 0.8); ctx.globalCompositeOperation = op; }
        D.end();
      }
      if (q.halos) halo(ctx, bu.lx, bu.ly, r * 1.4, BIO, 0.8 * k, true);
    } else {
      ctx.fillStyle = '#3a0a14'; ctx.beginPath(); ctx.arc(bu.tx, bu.ty, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a1422'; ctx.beginPath(); ctx.arc(bu.tx - 1, bu.ty - 1, 2.5, 0, TAU); ctx.fill();
      const dy = (t * 50 + bu.i * 13) % 30;
      if (q.halos) halo(ctx, bu.tx, bu.ty + 6 + dy, 5, ICHOR, 0.7, true);
    }
  }
}
/** 앞팔 + 산호 목장 (목장은 로직의 선 그대로: 손 아래 +230 → 갈고리 끝) */
function frontArm(ctx, D, rig, b, st, s, t, lvl, recOn, V) {
  const R = rig.parts, K = b.K, q = st.q;
  const crook = s.crook ?? 0, slump = s.slump ?? 0;
  const hx = 112 + crook * 4, hy = -110 - crook * 150 + slump * 30 + Math.sin(t * 1.2) * 3;
  const topX = K?.crookX ?? 124, topY = (K?.crookY ?? -330) + 40;
  const botX = hx + 16, botY = hy + 230;
  // 쥔 자리: 목장 선 위, 손 높이
  const u = (hy - botY) / ((topY - botY) || -1), gx = botX + (topX - botX) * u, gy = hy;
  const sa = Math.atan2(topY - botY, topX - botX);
  // 자루
  if (R.staff) seg(D, R.staff, R.staff.v.base, 'a', 'b', botX, botY, topX, topY, 0.78);
  // 갈고리 (자루 끝에서 위로, 소용돌이는 앞쪽으로 휜다) + 진주 빛
  if (R.crook) {
    const cr = sa + Math.sin(t * 0.9) * 0.03;
    put(D, R.crook, R.crook.v.base, 'base', topX, topY, cr, 1.0);
    if (q.halos && R.crook.pearl) {
      D.end();
      ptOf(R.crook, 'base', R.crook.pearl, topX, topY, cr, 1.0, st.lp);
      const k = 0.6 + 0.4 * Math.sin(t * 3) + crook * 0.6;
      halo(ctx, st.lp[0], st.lp[1], 26 + 22 * crook, CORAL_L, 0.5 * k);
      halo(ctx, st.lp[0], st.lp[1], 7, '#ffffff', 0.7, true);
    }
  }
  // 팔: 어깨 → 손목(주먹이 자루를 감싼다)
  D.rec = recOn('body');
  if (R.armU && R.armF && R.fist) {
    const sx = 50, sy = -150 + slump * 14;
    const fa = axis(R.fist, 'wr', 'grip'), flen = fa.len * FIST_S;
    const fr = sa + PI / 2 - 0.25;                 // 주먹은 자루와 거의 직각 (손목이 뒤쪽 아래)
    const wx = gx - Math.cos(fr) * flen, wy = gy - Math.sin(fr) * flen;
    const l1 = axis(R.armU, 'a', 'b').len * ARM_S, l2 = axis(R.armF, 'a', 'b').len * ARM_S * 0.9;
    const J = ik2(sx, sy, wx, wy, l1, l2, 1, st.J);
    seg(D, R.armU, V(R.armU), 'a', 'b', sx, sy, J.ex, J.ey, 1.12);
    seg(D, R.armF, V(R.armF), 'a', 'b', J.ex, J.ey, J.hx, J.hy, 1.12);
    put(D, R.fist, R.fist.v.base, 'wr', J.hx, J.hy, Math.atan2(gy - J.hy, gx - J.hx) - fa.a, FIST_S);
  }
  D.rec = false;
}

// ───────────────────────── 균열 발광 ─────────────────────────
function glowOver(ctx, D, part, lvl, pivot, x, y, rot, sc, a, t, st, deep = false, sxm = 1, sym = 1) {
  if (!st.q.crackGlow || lvl <= 0 || a <= 0.01 || !part) return;
  const drawn = lvl >= 2 ? 2 : ((deep ? part.v.deep_dmg1 : part.v.dmg1) ? 1 : 0);
  if (!drawn) return;
  const g = drawn === 2 ? part.gl.dmg2 : part.gl.dmg1;
  if (!g) return;
  const pv = part[pivot], k = part.k * sc;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 3.1 + part.w * 0.01)) * (lvl > 1 ? 1.1 : 0.75);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, x, y, rot, k * 2 * sxm, k * 2 * sym, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 입자 · 파편 ─────────────────────────
function surfaceFx(st, b, dt) {
  const q = st.q, sink = b.sink ?? 0;
  // 떠오르는 중(잠김이 줄어드는 중): 몸에서 물이 흘러내린다
  const rising = st.sink0 != null && sink < st.sink0 - 0.0005 && sink < 0.9;
  st.sink0 = sink;
  if (b.dash || !(q.particles > 100)) return;
  if (rising) {
    st.foam += dt * 40;
    while (st.foam > 1) { st.foam -= 1; st.P.emit('spark', b.ox + rr.range(-90, 90), b.wy - rr.range(10, 190) * (1 - sink), rr.range(-15, 15), rr.range(40, 160), { color: PALE, life: rr.range(0.25, 0.5) }); }
  }
}
function hitSpray(st, b, Wd) {
  const hp = b.hitPart; if (!hp) return;
  const x = hp.x + hp.w / 2, y = hp.y + hp.h / 2;
  st.P.burst('ichor', x, y, 7, { speed: 220, color: '#0b2a26', hi: ICHOR });
  if (st.q.particles > 150) st.P.burst('spark', x, y, 5, { speed: 260, color: PALE });
}
function spawnDeb(st, rig, x, y, n, speed, sc = 1, fade = 1.8, from = 0) {
  const L = rig.debs; if (!L?.length) return;
  for (let j = 0; j < n; j++) {
    const p = L[(from + j * 3) % L.length], a = -PI / 2 + rr.range(-1.2, 1.2), sp = speed * rr.range(0.45, 1);
    st.shards.spawn(p.v.base, p.c[0], p.c[1], x + rr.range(-18, 18), y + rr.range(-18, 18), rr.next() * TAU, p.k * sc * rr.range(0.55, 0.9) * rr.sign(), p.k * sc * rr.range(0.55, 0.9), Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-7, 7), { r: (p.r ?? 8) * sc * 0.5, fade, bounce: 0.25 });
  }
}
function levelBurst(st, rig, Wd) {
  const w = Wd(-10, -110);
  spawnDeb(st, rig, w[0], w[1], 4, 300, 0.75, 1.6, 2);
  st.P.burst('ichor', w[0], w[1], 16, { speed: 260, color: '#0b2a26', hi: ICHOR });
  st.P.burst('spark', w[0], w[1], 10, { speed: 300, color: PALE });
}
/** 사망: 0.25초 체액 분출 + 살점 · 0.6/0.95/1.3초 순례자 셋이 풀려나 떠오른다 · 1.5초 오르간 관이 부러져 떨어진다 */
function deathEvents(st, rig, b, el, Wd) {
  if (!st.dieSeen) { st.dieSeen = true; st.ev = 0; }
  if (st.ev === 0 && el >= 0.25) {
    st.ev = 1;
    const w = Wd(0, -120);
    st.P.burst('ichor', w[0], w[1], 26, { speed: 380, color: '#0b2a26', hi: ICHOR });
    st.P.burst('spark', w[0], w[1], 14, { speed: 320, color: PALE });
    spawnDeb(st, rig, w[0], w[1], 7, 460, 1, 2.2, 1);
  }
  if (st.ev === 1) st.ev = 2;
  for (let i = 0; i < 3; i++) {
    if (st.ev === 2 + i && el >= 0.6 + i * 0.35) {
      st.ev = 3 + i;
      const [x, y, a, sc] = PILGRIMS[i], p = rig.pils[i % Math.max(1, rig.pils.length)], w = Wd(x, y);
      if (p) st.freed.push({ p, x: w[0], y: w[1], vx: -(b.facing || 1) * rr.range(40, 90), vy: -rr.range(40, 70), rot: a, vr: rr.range(-0.6, 0.6), s: sc, t: 0 });
      st.P.burst('spark', w[0], w[1], 8, { speed: 150, color: PALE });
    }
  }
  if (st.ev === 5 && el >= 1.5) {
    st.ev = 6;
    const w = Wd(ORGAN_X, ORGAN_Y - 150);
    const pipe = rig.debs[10] ?? rig.debs[0];
    for (let j = 0; j < 3 && pipe; j++) st.shards.spawn(pipe.v.base, pipe.c[0], pipe.c[1], w[0] + (j - 1) * 24, w[1] + j * 20, rr.range(-0.3, 0.3), pipe.k * 1.3, pipe.k * 1.3, -(b.facing || 1) * rr.range(60, 160), -rr.range(120, 260), rr.range(-4, 4), { r: 20, fade: 2.0, bounce: 0.25 });
    spawnDeb(st, rig, w[0], w[1] + 60, 3, 240, 0.8, 1.8, 0);
  }
}

// ───────────────────────── 로직이 쓰는 채색 소품 (rig.art) ─────────────────────────
function makeArt(rig) {
  const R = rig.parts, GD = new Drawer(), LP = new Float32Array(32), ARC = new Float32Array(20), tiles = [];
  return {
    /** 떠다니는 미끼 전구 (x,y 중심, 반지름 r). 둘레 발광은 로직이 그린다 */
    bulb(ctx, x, y, r = 11, rot = 0) {
      const p = R.bulb; if (!p) return false;
      const k = p.k * (r / 13) * BULB_S, im = p.v.base;
      ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
      ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k);
      ctx.restore();
      return true;
    },
    /** 수면을 휩쓰는 촉수 (로직 lash 의 paint 와 같은 중심선에 촉수 타일) */
    lash(ctx, x0, tip, dir, t, dur, hold, seed, wy) {
      const T = rig.tents; if (!T.length) return false;
      const n = 16, len = Math.abs(tip - x0);
      if (len < 4) return true;
      const fade = clamp((dur + hold - t) / 0.18, 0, 1);
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1), x = x0 + (tip - x0) * u;
        LP[k * 2] = x; LP[k * 2 + 1] = wy - 6 + Math.sin(u * 9 - t * 16 + seed) * 12 * u + Math.sin(u * 3 + seed) * 6;
      }
      const m = clamp(Math.round(len / 58), 2, 14);
      tiles.length = 0;
      // 뿌리 tent0 → 가운데는 굵기가 비슷한 tent1/tent2 를 번갈아 → 끝 쪽 tent3·tent4 → 끝 tent5 (굵기가 톱니처럼 튀지 않게)
      for (let j = 0; j < m; j++) {
        const back = m - 1 - j;
        tiles.push(j === 0 ? T[0] : back === 0 ? T[5] : back === 1 && m > 3 ? T[4] : back === 2 && m > 4 ? T[3] : T[1 + ((j - 1) & 1)]);
      }
      GD.begin(ctx);
      tileChain(GD, tiles, LP, n, ARC, 1.55, 1.1, false, 0, fade, 22);
      GD.end();
      halo(ctx, tip, wy - 4, 44, PALE, 0.5 * fade);
      return true;
    },
  };
}
