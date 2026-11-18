// 환경 키트 — WORLD 구역이 더한 3D 소품 (docs/v2/ENV_KIT.md §11). props.js 와 같은 꼴: PROPS[이름](G, x, y, z, o).
// 단단한 모양(종·비석·십자가·영묘·묘지 문·등불 기둥·관·납골 벽감·역병 기둥·불탄 잔해·자루·수확물·촛불·불)은 여기서 손으로 짓고,
// 조각상·가고일·고목처럼 덩어리로 빚어야 하는 것은 구운 소품(baked.js)이 맡는다.
import { Frame, hash } from './geo.js';
import { PROPS } from './props.js';
import { railing, wallGrid } from './kit.js';
import { bakedDef, bakedProp } from './baked.js';

const fx = (G) => G.fx ?? (G.fx = { glows: [], pools: [], shadows: [] });
const shadow = (G, x, y, z, rx, rz = rx * 0.62, a = 0.5) => fx(G).shadows.push({ x, y, z, rx, rz, a });
const GEN_TOMB = { round: 'tomb_a', point: 'tomb_b', broken: 'tomb_c', cross: 'tomb_d' }, TOMB0 = PROPS.tomb;
const BRONZE = [1.55, 1.08, 0.5], SOOT = [0.42, 0.38, 0.38], IRON = [0.5, 0.5, 0.56];
/**
 * 불꽃: 스스로 빛나는 잎 모양 여러 겹 (정적 메시 — 실행 중 계산 0). 바깥 겹은 검붉고 길게, 가운데 겹은 주황, 속은 밝은 노랑으로 짧게.
 * 잎마다 밑에서 끝으로, 가운데에서 가장자리로 색이 흐르게 꼭짓점 색을 굽는다. 진짜 불티 · 연기는 지역의 anchors 자리에 효과가 얹는다.
 */
const LAYERS = [
  { hk: 1.0, wk: 1.0, a: [1.0, 0.4, 0.1], b: [0.5, 0.07, 0.03], ea: 1.2, eb: 0.85, dz: 0 },
  { hk: 0.72, wk: 0.8, a: [1.0, 0.72, 0.22], b: [0.98, 0.28, 0.06], ea: 1.5, eb: 1.1, dz: -1.6 },
  { hk: 0.46, wk: 0.6, a: [1.0, 0.95, 0.66], b: [1.0, 0.62, 0.18], ea: 1.75, eb: 1.4, dz: -3.2 },
];
const TS = [0, 0.12, 0.34, 0.62, 1];
function leaf(G, bx, by, bz, H, Wd, lean, ph, L) {
  const hw = (t) => Wd * 2.9 * Math.sqrt(t) * (1 - t) ** 1.25, cx = (t) => bx + lean * t * t + Math.sin(t * 3.1 + ph) * Wd * 0.55 * t;   // 밑은 둥글고 끝은 뾰족하게 휘는 잎
  const col = (edge) => (p) => { const t = Math.max(0, Math.min(1, (p[1] - by) / H)), k = (L.ea + (L.eb - L.ea) * t) * (edge ? 0.7 : 1); return [(L.a[0] + (L.b[0] - L.a[0]) * t) * k, (L.a[1] + (L.b[1] - L.a[1]) * t) * k * (edge ? 0.8 : 1), (L.a[2] + (L.b[2] - L.a[2]) * t) * k * (edge ? 0.6 : 1)]; };
  const n = [0, 0, -1], P = (t, sd) => [cx(t) + sd * hw(t), by + H * t, bz];
  for (let i = 0; i + 1 < TS.length; i++) {
    const t0 = TS[i], t1 = TS[i + 1];
    for (const sd of [-1, 1]) {   // 반쪽 둘: 가운데 줄은 밝고 가장자리는 어둡다 (가장자리 꼭짓점만 어두운 색)
      const o = { fog: 0.4, keep: true, emis: (p) => (Math.abs(p[0] - cx((p[1] - by) / H)) > 0.01 ? col(true)(p) : col(false)(p)) };
      if (i === 0) G.tri('white', P(0, 0), sd < 0 ? P(t1, -1) : P(t1, 0), sd < 0 ? P(t1, 0) : P(t1, 1), n, o);
      else if (i === TS.length - 2) G.tri('white', sd < 0 ? P(t0, -1) : P(t0, 0), sd < 0 ? P(t0, 0) : P(t0, 1), P(1, 0), n, o);
      else G.quad4('white', sd < 0 ? P(t0, -1) : P(t0, 0), sd < 0 ? P(t0, 0) : P(t0, 1), sd < 0 ? P(t1, 0) : P(t1, 1), sd < 0 ? P(t1, -1) : P(t1, 0), n, o);
    }
  }
}
/** 불길 한 무더기: 너비 w · 높이 h · 바깥 잎 n 장 (가운데 · 속 겹은 거기에 맞춰 준다) */
export function flames(G, x, y, z, w, h, n = 5, seed = 1) {
  LAYERS.forEach((L, li) => {
    const m = Math.max(1, Math.round(Math.min(n, 6) * [1, 0.7, 0.45][li]));
    for (let i = 0; i < m; i++) {
      const t = m > 1 ? i / (m - 1) - 0.5 : 0, r1 = hash(i + seed * 3.1 + li * 7, x), r2 = hash(x + li, i + seed), r3 = hash(seed + i * 2.3, li + z);
      const fh = h * L.hk * (0.6 + 0.55 * r1) * (1 - 0.5 * Math.abs(t) * 2 * (li ? 0.6 : 1)), fw = Math.max(3, Math.min(fh * 0.34, (w / Math.max(2, m)) * 0.7 * L.wk * (0.8 + 0.5 * r2)));
      leaf(G, x + t * w * (li ? 0.62 : 0.86) + (r3 - 0.5) * fw * 0.6, y, z + L.dz - i * 0.12, fh, fw, (r2 - 0.5) * fw * 2.6 + t * w * 0.22, r3 * 6.28, L);
    }
  });
}
/** 바닥의 잉걸불: 그을린 재 자리 + 빛나는 숯 조각들 */
export function embers(G, x, y, z, r, n = 9, seed = 1) {
  const ash = []; for (let k = 0; k < 9; k++) { const a = k * 2 * Math.PI / 9, rr = r * (0.8 + 0.35 * hash(k + seed, x)); ash.push([x + Math.cos(a) * rr, y + 0.5, z + Math.sin(a) * rr * 0.55]); }
  G.poly('coal', ash, [0, 1, 0], { tint: [0.34, 0.3, 0.3], vary: 0.3, keep: true });
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + seed, rr = r * (0.15 + 0.8 * hash(i, x + seed)), ex = x + Math.cos(a) * rr, ez = z + Math.sin(a) * rr * 0.5, s = 2.2 + 3.4 * hash(x + seed, i), hot = hash(i + 3, seed);
    G.poly('white', [[ex - s, y + 1, ez], [ex, y + 1, ez - s * 0.6], [ex + s, y + 1, ez], [ex, y + 1, ez + s * 0.6]], [0, 1, 0], { emis: 1.1 + 0.6 * hot, tint: [1, 0.36 + 0.4 * hot, 0.08 + 0.2 * hot], fog: 0.45, keep: true });
  }
}
/** 세로 판(u–y 평면)의 다각형 + 옆 마구리. pts = [[u, y], …] (바깥에서 볼 때 반시계) */
function slab(G, F, pts, t, mat, o = {}) {
  G.poly(mat, pts.map(([u, yy]) => F.pt(u, yy, 0)), F.n, o);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], du = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(du, dy) || 1, n = F.vec(dy / l, -du / l, 0);
    if (n[1] < -0.5) continue;
    G.quad4(mat, F.pt(a[0], a[1], 0), F.pt(a[0], a[1], -t), F.pt(b[0], b[1], -t), F.pt(b[0], b[1], 0), n, { ...o, k: (o.k ?? 1) * (n[1] > 0.3 ? 1.05 : 0.8), keep: true });
  }
}

Object.assign(PROPS, {
  /** 비석 (props.js 의 것을 감싼다): 묶음에 생성 모델 비석이 있으면 그것으로 — o.cross 는 날개 달린 해골 비석, 나머지는 자리마다 둥근 것 · 뾰족 아치. o.code 면 손으로 짠 것 */
  tomb(G, x, y, z, o = {}) {
    const gen = o.cross ? 'tomb_d' : hash(x, z) > 0.5 ? 'tomb_a' : 'tomb_b';
    return !o.code && bakedDef(gen) ? bakedProp(G, gen, x, y, z, { h: o.h ?? 90, flip: hash(z, x) > 0.5 }) : TOMB0(G, x, y, z, o);
  },
  /** 불 (효과 닻 자리에 세우는 눈에 보이는 불길 + 바닥의 잉걸불). o.w · o.h · o.n (바깥 잎 수) · o.embers (기본: 바닥에 놓인 불만). 빛은 part 의 light 로 따로 준다 */
  fire(G, x, y, z, o = {}) {
    const w = o.w ?? 56, h = o.h ?? 78;
    if (o.embers ?? (o.y ?? 0) < 2) embers(G, x, y, z - 2, w * 0.55, o.coals ?? 9, 3);   // 바닥의 불만 (지붕 · 담 위의 불은 재 자리가 허공에 뜬다)
    flames(G, x, y, z, w, h, o.n ?? 5, 3);
    fx(G).glows.push({ x, y: y + h * 0.45, z: z - 4, r: h * 1.25, c: [1, 0.55, 0.2], flicker: true });
    fx(G).pools.push({ x, y, z: z - 10, r: o.pool ?? 230, c: [1, 0.5, 0.2], a: 0.36, flicker: true });
  },
  /** 큰 종: 돌 받침 + 참나무 틀 + 멍에 + 금 간 청동 종 + 줄. o.h (기본 190) */
  bell(G, x, y, z, o = {}) {
    const s = (o.h ?? 190) / 190, T = { vary: 0.2, k: 0.95 };
    G.box('stone', x - 66 * s, y, z - 30 * s, x + 66 * s, y + 12 * s, z + 30 * s, { faces: 'FLRT', top: 'trimstone' });
    for (const sx of [-1, 1]) {
      const px = x + sx * 52 * s;
      G.box('timber', px - 7 * s, y + 12 * s, z - 7 * s, px + 7 * s, y + 170 * s, z + 7 * s, { faces: 'FLR', ...T });
      G.tube('timber', [px, y + 12 * s, z - 24 * s], [px, y + 96 * s, z - 5 * s], 4.5 * s, 4.5 * s, 4, { keep: true, ...T });
      G.tube('timber', [px - sx * 34 * s, y + 170 * s, z - 2 * s], [px, y + 132 * s, z - 2 * s], 4 * s, 4 * s, 4, { keep: true, ...T });
      G.box('metal', px - 8.5 * s, y + 150 * s, z - 8.5 * s, px + 8.5 * s, y + 157 * s, z + 8.5 * s, { faces: 'FLR', vary: 0, k: 0.8 });
    }
    G.box('timber', x - 64 * s, y + 170 * s, z - 9 * s, x + 64 * s, y + 186 * s, z + 9 * s, { faces: 'FLRT', ...T });
    G.box('darkwood', x - 32 * s, y + 146 * s, z - 9 * s, x + 32 * s, y + 163 * s, z + 9 * s, { faces: 'FLRT', vary: 0.2 });
    for (const sx of [-1, 1]) G.box('metal', x + sx * 20 * s - 3 * s, y + 144 * s, z - 10 * s, x + sx * 20 * s + 3 * s, y + 165 * s, z + 10 * s, { faces: 'FLRT', vary: 0, k: 0.8 });
    G.tube('metal', [x - 52 * s, y + 154 * s, z], [x + 52 * s, y + 154 * s, z], 2.6 * s, 2.6 * s, 5, { keep: true, vary: 0, k: 0.8 });
    const yb = y + 60 * s, B = { tint: BRONZE, vary: 0.25 };
    G.lathe('metal', x, z, [[37 * s, yb], [35 * s, yb + 5 * s], [28.5 * s, yb + 16 * s], [24 * s, yb + 36 * s], [21.5 * s, yb + 56 * s], [18 * s, yb + 70 * s], [11 * s, yb + 80 * s], [5 * s, yb + 85 * s]], 12, { ...B, cap: true });
    G.lathe('metal', x, z, [[37.8 * s, yb + 1.5 * s], [37.8 * s, yb + 6 * s]], 12, { tint: [1.9, 1.4, 0.7], vary: 0 });
    G.lathe('metal', x, z, [[25 * s, yb + 30 * s], [25 * s, yb + 33 * s]], 12, { tint: [1.0, 0.75, 0.4], vary: 0 });
    const zf = z - 30 * s;   // 금: 앞면의 어두운 갈지자
    G.quad4('metal', [x + 6 * s, yb + 2 * s, zf - 4 * s], [x + 9 * s, yb + 2 * s, zf - 4 * s], [x + 3 * s, yb + 22 * s, zf + 2 * s], [x + 1 * s, yb + 22 * s, zf + 2 * s], [0, 0.3, -1], { tint: [0.08, 0.07, 0.07], vary: 0 });
    G.quad4('metal', [x + 1 * s, yb + 22 * s, zf + 2 * s], [x + 3.4 * s, yb + 22 * s, zf + 2 * s], [x + 7 * s, yb + 40 * s, zf + 6 * s], [x + 5.6 * s, yb + 40 * s, zf + 6 * s], [0, 0.3, -1], { tint: [0.08, 0.07, 0.07], vary: 0 });
    G.lathe('metal', x, z, [[4 * s, yb - 8 * s], [5.5 * s, yb - 3 * s], [3 * s, yb + 4 * s]], 6, { vary: 0, k: 0.7 });
    G.tube('cloth', [x, yb - 6 * s, z - 2 * s], [x + 5 * s, y + 20 * s, z - 6 * s], 2.2 * s, 2.2 * s, 5, { tint: [0.95, 0.82, 0.6], keep: true });
    shadow(G, x, y, z, 80 * s, 34 * s, 0.5);
  },
  /** 비석 여러 꼴. o.kind: round(기본) · point(뾰족 아치) · obelisk · ledger(누운 판 + 작은 머릿돌) · broken · cross. o.h */
  grave(G, x, y, z, o = {}) {
    const kind = o.kind ?? 'round', h = o.h ?? 90, w = h * 0.5, t = 10, lean = (hash(x, z) - 0.5) * 9, M = { vary: 0.35, tint: [0.92, 0.95, 1.0] };
    const gen = !o.code && GEN_TOMB[kind];   // 생성 모델 비석 넷 (묶음에 있을 때): 둥근 것 · 뾰족 아치 · 깨진 것 · 날개 달린 해골
    if (gen && bakedDef(gen)) return bakedProp(G, gen, x, y, z, { h, flip: hash(z, x) > 0.5 });
    if (kind === 'round' || kind === 'cross') return TOMB0(G, x, y, z, { ...o, cross: kind === 'cross' });
    if (kind === 'obelisk') {
      G.box('stone', x - w * 0.5, y, z - w * 0.5, x + w * 0.5, y + 10, z + w * 0.5, { faces: 'FLRT', top: 'trimstone' });
      G.lathe('trimstone', x, z, [[w * 0.4, y + 10], [w * 0.4, y + 22], [w * 0.3, y + 24], [w * 0.2, y + h * 0.88], [0, y + h]], 4, { a0: Math.PI / 4, flat: true, ...M });
      return shadow(G, x, y, z, w * 0.6, w * 0.4, 0.45);
    }
    if (kind === 'ledger') {
      G.box('trimstone', x - 25, y, z - 50, x + 25, y + 9, z + 44, { faces: 'FLRT', ...M });
      G.box('stone', x - 19, y + 9, z - 44, x + 19, y + 11.5, z + 38, { faces: 'FLRT', k: 0.8 });
      PROPS.tomb(G, x, y, z + 52, { h: h * 0.62, code: o.code });
      return shadow(G, x, y, z, 34, 54, 0.4);
    }
    const F = new Frame(x - w / 2, z - t / 2, 0, -1), sk = (u, yy) => [u + lean * (yy - y) / h, yy];
    G.box('stone', x - w * 0.62, y, z - t, x + w * 0.62, y + 9, z + t, { faces: 'FLRT', top: 'trimstone' });
    const pts = kind === 'point' ? [sk(0, y + 9), sk(w, y + 9), sk(w, y + h * 0.68), sk(w * 0.78, y + h * 0.88), sk(w / 2, y + h), sk(w * 0.22, y + h * 0.88), sk(0, y + h * 0.68)]
      : [sk(0, y + 9), sk(w, y + 9), sk(w, y + h * 0.52), sk(w * 0.66, y + h * 0.8), sk(w * 0.4, y + h * 0.6), sk(w * 0.16, y + h * 0.74), sk(0, y + h * 0.66)];
    slab(G, F, pts, t, 'trimstone', M);
    if (kind === 'point') { const c = sk(w / 2, y + h * 0.66); G.poly('stone', [F.pt(c[0], c[1] - 9, 0.5), F.pt(c[0] + 8, c[1], 0.5), F.pt(c[0], c[1] + 9, 0.5), F.pt(c[0] - 8, c[1], 0.5)], F.n, { k: 0.5, vary: 0 }); F.face(G, 'stone', w * 0.26, w * 0.74, y + h * 0.36, y + h * 0.42, 0.4, { k: 0.5, vary: 0 }); }
    else G.box('trimstone', x + w * 0.7, y, z - 12, x + w * 1.15, y + 8, z + 4, { faces: 'FLRT', ...M });   // 떨어진 조각
    shadow(G, x, y, z, w * 0.8, 12, 0.45);
  },
  /** 고리 달린 돌 십자가. o.h (기본 170) */
  cross(G, x, y, z, o = {}) {
    const h = o.h ?? 170, s = h / 170, M = { vary: 0.3, tint: [0.92, 0.95, 1.0] }, cy = y + h * 0.7;
    G.box('stone', x - 28 * s, y, z - 20 * s, x + 28 * s, y + 10 * s, z + 20 * s, { faces: 'FLRT', top: 'trimstone' });
    G.box('stone', x - 19 * s, y + 10 * s, z - 14 * s, x + 19 * s, y + 22 * s, z + 14 * s, { faces: 'FLRT', top: 'trimstone' });
    G.box('trimstone', x - 7.5 * s, y + 22 * s, z - 5.5 * s, x + 7.5 * s, y + h, z + 5.5 * s, { faces: 'FLRT', ...M });
    G.box('trimstone', x - 31 * s, cy - 7 * s, z - 5.5 * s, x + 31 * s, cy + 7 * s, z + 5.5 * s, { faces: 'FLRT', ...M });
    for (let i = 0; i < 12; i++) {   // 고리
      const a = i * Math.PI / 6, b = a + Math.PI / 6, P = (r, t) => [x + Math.cos(t) * r * s, cy + Math.sin(t) * r * s, z - 3.5 * s];
      G.quad4('trimstone', P(15, a), P(22, a), P(22, b), P(15, b), [0, 0, -1], { ...M, k: 0.9 });
    }
    shadow(G, x, y, z, 30 * s, 20 * s, 0.45);
  },
  /** 영묘 앞면: 계단 + 뾰족 아치 쇠문 + 기둥 둘 + 박공 지붕 + 십자가. o.w · o.h · o.d */
  mausoleum(G, x, y, z, o = {}) {
    const w = o.w ?? 190, h = o.h ?? 150, d = o.d ?? 110, zf = z - d / 2, F = new Frame(x - w / 2, zf, 0, -1), dw = 30, yb = y + 18, yS = yb + 92, wall = o.mat ?? 'ashlar';
    for (let i = 0; i < 3; i++) G.box('stone', x - 52, y, zf - 36 + 12 * i, x + 52, y + 6 * (i + 1), zf - 24 + 12 * i, { faces: 'FLRT', top: 'trimstone' });
    G.shade = (px, py) => 0.6 + 0.4 * Math.min(1, (py - y) / 60);
    wallGrid(G, F, wall, 0, w, y, y + h, 0, [{ u0: w / 2 - dw, u1: w / 2 + dw, y0: y, y1: yS + 28 }], { cell: 44 });
    G.tri(wall, F.pt(w / 2 - dw, yS, 0), F.pt(w / 2, yS + 28, 0), F.pt(w / 2 - dw, yS + 28, 0), F.n, {}); G.tri(wall, F.pt(w / 2 + dw, yS, 0), F.pt(w / 2 + dw, yS + 28, 0), F.pt(w / 2, yS + 28, 0), F.n, {});
    G.box(wall, x - w / 2, y, zf, x + w / 2, y + h, zf + d, { faces: 'LR', cell: 60 });
    G.shade = null;
    F.face(G, 'metal', w / 2 - dw, w / 2 + dw, yb, yS + 28, -11, { tint: [0.4, 0.38, 0.42], vary: 0.3 });   // 쇠문
    for (const yy of [yb + 16, yb + 50, yb + 84]) F.box(G, 'metal', w / 2 - dw, w / 2 + dw, yy, yy + 6, -11, -9, { faces: 'FT', vary: 0, k: 1.1 });
    F.box(G, 'metal', w / 2 - 1.6, w / 2 + 1.6, yb, yS + 26, -11, -9.4, { faces: 'F', vary: 0, k: 0.5 });
    G.quad(wall, F.pt(w / 2 - dw, yb, 0), F.vec(0, 0, -11), [0, yS - yb, 0], F.vec(1, 0, 0), { k: 0.5, vary: 0 }); G.quad(wall, F.pt(w / 2 + dw, yb, 0), F.vec(0, 0, -11), [0, yS - yb, 0], F.vec(-1, 0, 0), { k: 0.5, vary: 0 });
    F.box(G, 'trimstone', w / 2 - dw - 6, w / 2 + dw + 6, y, yb, -11, 4, { faces: 'FT', vary: 0.1 });
    for (const sx of [-1, 1]) {
      const cx = x + sx * (dw + 22), cz = zf - 10;
      G.box('stone', cx - 11, y, cz - 11, cx + 11, yb, cz + 11, { faces: 'FLRT', top: 'trimstone' });
      G.lathe('trimstone', cx, cz, [[9, yb], [7.5, yb + 6], [6.6, y + h - 16], [9.5, y + h - 8], [10.5, y + h - 2]], 8, { vary: 0.2 });
    }
    G.box('trimstone', x - w / 2 - 10, y + h - 4, zf - 22, x + w / 2 + 10, y + h + 6, zf + d, { faces: 'FLRT', vary: 0.1 });
    const yr = y + h + 6, rh = o.roofH ?? 62;
    G.tri(wall, [x - w / 2 - 8, yr, zf - 18], [x + w / 2 + 8, yr, zf - 18], [x, yr + rh, zf - 18], [0, 0, -1], { k: 0.95 });
    for (const sx of [-1, 1]) G.quad4(o.roof ?? 'slate', [x + sx * (w / 2 + 12), yr - 2, zf - 22], [x, yr + rh + 2, zf - 22], [x, yr + rh + 2, zf + d], [x + sx * (w / 2 + 12), yr - 2, zf + d], [sx * 0.6, 0.8, 0], { vary: 0.3, ua: [0, 0, 1], va: [-sx * 0.8, 0.6, 0] });
    G.box('trimstone', x - 3.5, yr + rh, zf - 16, x + 3.5, yr + rh + 30, zf - 10, { faces: 'FLRT', vary: 0 }); G.box('trimstone', x - 11, yr + rh + 15, zf - 16, x + 11, yr + rh + 21, zf - 10, { faces: 'FLRT', vary: 0 });
    shadow(G, x, y, zf - 6, w * 0.6, 26, 0.5);
  },
  /** 묘지 쇠문: 돌기둥 둘(갓돌 + 항아리) + 쇠 아치 + 반쯤 열린 문짝 둘. o.w = 문 사이 너비, o.h = 기둥 높이, o.open 0..1 */
  cemgate(G, x, y, z, o = {}) {
    const gap = o.w ?? 180, h = o.h ?? 200, th = (o.open ?? 0.6) * 65 * Math.PI / 180, L = gap / 2 - 3, ct = Math.cos(th), st = Math.sin(th);
    for (const sx of [-1, 1]) {
      const px = x + sx * (gap / 2 + 18);
      G.box('stone', px - 22, y, z - 22, px + 22, y + 24, z + 22, { faces: 'FLRT', top: 'trimstone' });
      G.box('ashlar', px - 18, y + 24, z - 18, px + 18, y + h, z + 18, { faces: 'FLR', cell: 50 });
      G.box('trimstone', px - 23, y + h, z - 23, px + 23, y + h + 10, z + 23, { faces: 'FLRT', vary: 0.1 });
      G.lathe('trimstone', px, z, [[6, y + h + 10], [11, y + h + 20], [12, y + h + 30], [6, y + h + 38], [8.5, y + h + 43], [0, y + h + 47]], 8, { vary: 0.2 });
    }
    const arc = (i, lift) => { const t = i / 10, u = -1 + 2 * t; return [x + u * gap / 2, y + h - 34 + lift + 44 * (1 - Math.abs(u) ** 1.7), z]; }, I = { tint: IRON, vary: 0, keep: true };
    for (let i = 0; i < 10; i++) { G.tube('metal', arc(i, 0), arc(i + 1, 0), 3, 3, 4, I); G.tube('metal', arc(i, -16), arc(i + 1, -16), 2.4, 2.4, 4, I); if (i % 2 === 1) G.tube('metal', arc(i, -16), arc(i, 0), 2, 2, 4, I); }
    const top = arc(5, 0); G.lathe('metal', top[0], z, [[2.5, top[1]], [5, top[1] + 8], [0, top[1] + 22]], 4, { tint: IRON, vary: 0, flat: true });
    const lh = h * 0.7;
    railing(G, new Frame(x - gap / 2, z, st, -ct), 0, L, y + 4, lh, 0, { step: 16, k: 0.85 });
    railing(G, new Frame(x + gap / 2 - ct * L, z + st * L, -st, -ct), 0, L, y + 4, lh, 0, { step: 16, k: 0.85 });
    shadow(G, x - gap / 2 - 18, y, z, 30, 26, 0.45); shadow(G, x + gap / 2 + 18, y, z, 30, 26, 0.45);
  },
  /** 등불 기둥: 돌 받침 + 나무 기둥 + 쇠 팔 + 매달린 등. o.h (기본 196), o.lit === false 면 꺼진 등 */
  lanternpost(G, x, y, z, o = {}) {
    const h = o.h ?? 196, s = h / 196, lit = o.lit !== false, ax = x + (o.flip ? -1 : 1) * 34 * s, ly = y + h * 0.64, lh = 24 * s, c = o.c ?? [1, 0.72, 0.36];
    G.box('stone', x - 12 * s, y, z - 12 * s, x + 12 * s, y + 14 * s, z + 12 * s, { faces: 'FLRT', top: 'trimstone' });
    G.box('timber', x - 5 * s, y + 14 * s, z - 5 * s, x + 5 * s, y + h * 0.93, z + 5 * s, { faces: 'FLRT', vary: 0.2 });
    G.box('metal', x - 6 * s, y + h * 0.5, z - 6 * s, x + 6 * s, y + h * 0.53, z + 6 * s, { faces: 'FLR', vary: 0, k: 0.8 });
    const I = { vary: 0, k: 0.75, keep: true };
    G.tube('metal', [x, y + h * 0.88, z], [ax, y + h * 0.9, z], 2.4 * s, 2.4 * s, 4, I); G.tube('metal', [x, y + h * 0.74, z], [x + (ax - x) * 0.7, y + h * 0.89, z], 2 * s, 2 * s, 4, I);
    G.tube('metal', [ax, y + h * 0.9, z], [ax, ly + lh + 8 * s, z], 1.6 * s, 1.6 * s, 4, I);
    const w = 8 * s;
    G.box('white', ax - w, ly, z - w, ax + w, ly + lh, z + w, lit ? { faces: 'FLR', emis: 1.5, tint: c, fog: 0.5 } : { faces: 'FLR', tint: [0.2, 0.22, 0.26], vary: 0 });
    for (const dx of [-1, 1]) G.box('metal', ax + dx * w - 1.3, ly - 2, z - w - 1.3, ax + dx * w + 1.3, ly + lh + 1, z - w + 1.3, { faces: 'FLR', vary: 0, k: 0.7 });
    G.box('metal', ax - w - 1.5, ly - 3, z - w - 1.5, ax + w + 1.5, ly, z + w + 1.5, { faces: 'FLRT', vary: 0, k: 0.7 });
    G.lathe('metal', ax, z, [[w * 1.7, ly + lh], [w * 0.5, ly + lh + w], [1.4, ly + lh + w * 1.5]], 4, { a0: Math.PI / 4, vary: 0, k: 0.75, flat: true });
    if (lit) { fx(G).glows.push({ x: ax, y: ly + lh * 0.5, z: z - w - 1, r: 64 * s, c, flicker: !!o.flicker }); fx(G).pools.push({ x: ax, y, z, r: 190, c, a: 0.3, flicker: !!o.flicker }); }
    shadow(G, x, y, z, 16 * s, 12 * s, 0.5);
  },
  /** 관: 여섯 모 널 상자 + 조금 밀린 뚜껑 + 받침목 둘. o.len (기본 112) */
  coffin(G, x, y, z, o = {}) {
    const L = o.len ?? 112, s = L / 112, yb = y + 12 * s, yt = yb + 24 * s, T = { tint: o.tint ?? [0.62, 0.48, 0.42], vary: 0.25 };
    const H = [[-L / 2, -11 * s], [-L / 2 + 28 * s, -21 * s], [L / 2, -13 * s], [L / 2, 13 * s], [-L / 2 + 28 * s, 21 * s], [-L / 2, 11 * s]];
    for (const dx of [-0.3, 0.3]) G.box('wood', x + dx * L - 5 * s, y, z - 20 * s, x + dx * L + 5 * s, yb, z + 20 * s, { faces: 'FLRT', vary: 0.2 });
    const side = (pts, y0, y1, k) => { for (let i = 0; i < 6; i++) { const a = pts[i], b = pts[(i + 1) % 6], nx = b[1] - a[1], nz = -(b[0] - a[0]), l = Math.hypot(nx, nz) || 1; G.quad4('wood', [x + a[0], y0, z + a[1]], [x + b[0], y0, z + b[1]], [x + b[0], y1, z + b[1]], [x + a[0], y1, z + a[1]], [nx / l, 0, nz / l], { ...T, k }); } };
    side(H, yb, yt, 0.9);
    const lid = H.map(([a, b]) => [a * 1.03 + 7 * s, b * 1.05 - 3 * s]);
    side(lid, yt, yt + 5 * s, 1.05);
    G.poly('wood', lid.map(([a, b]) => [x + a, yt + 5 * s, z + b]).reverse(), [0, 1, 0], { ...T, k: 1.1 });
    G.box('metal', x - L * 0.2, yt + 5 * s, z - 2 * s, x + L * 0.36, yt + 6.2 * s, z + 2 * s, { faces: 'FT', vary: 0, k: 0.9 }); G.box('metal', x - L * 0.06, yt + 5 * s, z - 9 * s, x - L * 0.06 + 4 * s, yt + 6.2 * s, z + 9 * s, { faces: 'FT', vary: 0, k: 0.9 });
    shadow(G, x, y, z, L * 0.6, 24 * s, 0.5);
  },
  /** 납골 벽감: 막돌 벽 조각 + 해골이 찬 감실 셋 + 선반의 촛불. o.w · o.h */
  niche(G, x, y, z, o = {}) {
    const w = o.w ?? 170, h = o.h ?? 160, d = 34, F = new Frame(x - w / 2, z - d / 2, 0, -1), nw = w / 3 * 0.62, holes = [];
    for (let i = 0; i < 3; i++) { const u = w * (i + 0.5) / 3; holes.push({ u0: u - nw / 2, u1: u + nw / 2, y0: y + 46, y1: y + h - 34 }); }
    G.shade = (px, py) => 0.62 + 0.38 * Math.min(1, (py - y) / 50);
    wallGrid(G, F, 'fieldstone', 0, w, y, y + h, 0, holes, { cell: 40 });
    F.box(G, 'fieldstone', 0, w, y, y + h, -d, 0, { faces: 'LR' });
    G.shade = null;
    for (const q of holes) {
      F.face(G, 'bone', q.u0, q.u1, q.y0, q.y1, -12, { k: 0.95, vary: 0.1 });
      G.quad('stone', F.pt(q.u0, q.y0, 0), F.vec(0, 0, -12), [0, q.y1 - q.y0, 0], F.vec(1, 0, 0), { k: 0.5, vary: 0 }); G.quad('stone', F.pt(q.u1, q.y0, 0), F.vec(0, 0, -12), [0, q.y1 - q.y0, 0], F.vec(-1, 0, 0), { k: 0.5, vary: 0 });
      F.box(G, 'trimstone', q.u0 - 5, q.u1 + 5, q.y0 - 6, q.y0, 0, 5, { faces: 'FLRT', vary: 0.1 }); F.box(G, 'trimstone', q.u0 - 5, q.u1 + 5, q.y1, q.y1 + 8, 0, 4, { faces: 'FLRT', vary: 0.1 });
    }
    F.box(G, 'trimstone', -3, w + 3, y + h, y + h + 8, -d - 2, 4, { faces: 'FLRT', vary: 0.1 }); F.box(G, 'trimstone', 0, w, y + 24, y + 30, 0, 10, { faces: 'FLRT', vary: 0.1 });
    for (let i = 0; i < 4; i++) { const p = F.pt(w * (0.14 + 0.24 * i), y + 30, 6), ch = 7 + 6 * hash(i, x); G.lathe('white', p[0], p[2], [[2.4, p[1]], [2.1, p[1] + ch]], 5, { tint: [0.95, 0.9, 0.74], vary: 0, cap: true }); G.tri('white', [p[0] - 1.8, p[1] + ch, p[2] - 1], [p[0] + 1.8, p[1] + ch, p[2] - 1], [p[0], p[1] + ch + 7, p[2] - 1], [0, 0, -1], { emis: 1.6, tint: [1, 0.8, 0.4], fog: 0.4 }); }
    fx(G).glows.push({ x, y: y + 44, z: z - d / 2 - 8, r: 46, c: [1, 0.7, 0.35], flicker: true });
    shadow(G, x, y, z - d / 2, w * 0.56, 16, 0.5);
  },
  /** 역병 기둥: 나무 기둥 + 가로대 + 검은·흰 천 + 붉은 가위표 판 + 작은 종. o.h (기본 210) */
  plaguepost(G, x, y, z, o = {}) {
    const h = o.h ?? 210, s = h / 210, yc = y + h * 0.86, F = new Frame(x - 40 * s, z - 5 * s, 0, -1);
    G.box('stone', x - 13 * s, y, z - 13 * s, x + 13 * s, y + 12 * s, z + 13 * s, { faces: 'FLRT', top: 'trimstone' });
    G.box('timber', x - 5 * s, y + 12 * s, z - 5 * s, x + 5 * s, y + h, z + 5 * s, { faces: 'FLRT', vary: 0.2 });
    G.box('timber', x - 40 * s, yc - 4 * s, z - 4 * s, x + 40 * s, yc + 4 * s, z + 4 * s, { faces: 'FLRT', vary: 0.2 });
    const cloth = (u, len, c) => { for (let i = 0; i < 3; i++) { const y1 = yc - 4 * s - len * i / 3, y0 = yc - 4 * s - len * (i + 1) / 3, wv = (j) => 1.5 + Math.sin(j * 1.7 + u) * 2.5; G.quad4('cloth', F.pt(u - 9 * s, y0, wv(i + 1)), F.pt(u + 9 * s, y0, wv(i + 1)), F.pt(u + 9 * s, y1, wv(i)), F.pt(u - 9 * s, y1, wv(i)), F.n, { tint: c, vary: 0.2, k: 0.9 + 0.15 * Math.sin(i * 1.7 + u) }); } const yb = yc - 4 * s - len; G.tri('cloth', F.pt(u - 9 * s, yb, 2), F.pt(u + 3 * s, yb, 2), F.pt(u - 6 * s, yb - 14 * s, 2), F.n, { tint: c, vary: 0, k: 0.85 }); };
    cloth(14 * s, 78 * s, [0.16, 0.15, 0.18]); cloth(66 * s, 64 * s, [1.25, 1.2, 1.08]);
    const by = y + h * 0.46;   // 판 + 붉은 가위표
    F.box(G, 'wood', 24 * s, 56 * s, by, by + 28 * s, 5 * s, 8 * s, { faces: 'FLRT', vary: 0.2 });
    for (const sg of [-1, 1]) G.quad4('cloth', F.pt(40 * s - 11 * s, by + 14 * s - sg * 10 * s - 2 * s, 8.4 * s), F.pt(40 * s - 11 * s + 3 * s, by + 14 * s - sg * 10 * s - 2 * s, 8.4 * s), F.pt(40 * s + 11 * s, by + 14 * s + sg * 10 * s + 2 * s, 8.4 * s), F.pt(40 * s + 11 * s - 3 * s, by + 14 * s + sg * 10 * s + 2 * s, 8.4 * s), F.n, { tint: [1.3, 0.16, 0.14], vary: 0 });
    G.lathe('metal', x + 30 * s, z - 2 * s, [[6 * s, yc - 22 * s], [4.6 * s, yc - 14 * s], [2 * s, yc - 9 * s]], 6, { tint: BRONZE, vary: 0, cap: true });
    shadow(G, x, y, z, 18 * s, 14 * s, 0.5);
  },
  /** 불탄 집의 잔해: 그을린 벽 모서리 + 쓰러진 들보 + 재 더미 + 잉걸불. o.w (기본 170), o.fire === false 면 불길 없음 */
  wreck(G, x, y, z, o = {}) {
    const s = (o.w ?? 170) / 170, W = { tint: SOOT, vary: 0.3 };
    for (const [dx, wd, hh] of [[-80, 26, 96], [-54, 24, 62], [-30, 22, 36]]) G.box('fieldstone', x + dx * s, y, z - 4 * s, x + (dx + wd) * s, y + hh * s, z + 26 * s, { faces: 'FLRT', ...W });
    G.lathe('soil', x + 14 * s, z, [[76 * s, y], [52 * s, y + 9 * s], [24 * s, y + 17 * s], [0, y + 19 * s]], 9, { sq: 0.55, tint: [0.42, 0.4, 0.4], vary: 0.3 });
    const B = { keep: true, vary: 0.3 };
    G.tube('charred', [x - 36 * s, y + 6 * s, z - 20 * s], [x + 56 * s, y + 100 * s, z + 12 * s], 7 * s, 6 * s, 5, B);
    G.tube('charred', [x + 70 * s, y + 4 * s, z - 14 * s], [x - 10 * s, y + 74 * s, z + 10 * s], 6.5 * s, 5.5 * s, 5, B);
    G.tube('charred', [x - 70 * s, y + 92 * s, z + 10 * s], [x + 30 * s, y + 14 * s, z - 26 * s], 6 * s, 5 * s, 5, B);
    G.tube('charred', [x + 20 * s, y + 8 * s, z - 30 * s], [x + 84 * s, y + 12 * s, z - 6 * s], 5.5 * s, 5.5 * s, 5, B);
    G.tube('charred', [x + 40 * s, y + 6 * s, z + 6 * s], [x + 46 * s, y + 66 * s, z + 16 * s], 6 * s, 5 * s, 5, B);
    for (let i = 0; i < 4; i++) { const ex = x + (-30 + 26 * i) * s, ez = z - (10 + 8 * hash(i, x)) * s, r = (7 + 5 * hash(x, i)) * s, pts = []; for (let k = 0; k < 6; k++) pts.push([ex + Math.cos(k) * r, y + (12 + 3 * hash(i, k)) * s, ez + Math.sin(k) * r * 0.6]); G.poly('coal', pts, [0, 1, 0], { emis: 0.9, fog: 0.5 }); }
    if (o.fire !== false) { flames(G, x + 10 * s, y + 16 * s, z - 12 * s, 70 * s, 64 * s, 5, 7); fx(G).glows.push({ x: x + 10 * s, y: y + 50 * s, z: z - 16 * s, r: 96 * s, c: [1, 0.5, 0.18], flicker: true }); fx(G).pools.push({ x, y, z: z - 20 * s, r: 240 * s, c: [1, 0.48, 0.18], a: 0.38, flicker: true }); }
    shadow(G, x, y, z, 96 * s, 34 * s, 0.5);
  },
  /** 자루 더미 */
  sacks(G, x, y, z, o = {}) {
    const s = (o.h ?? 34) / 34, T = { tint: [1.0, 0.82, 0.56], vary: 0.25, cap: true };
    for (const [dx, dz, k, sq] of [[-13, 0, 1, 0.8], [12, -3, 0.9, 0.85], [0, -10, 0.75, 0.8]]) G.lathe('cloth', x + dx * s, z + dz * s, [[10 * s * k, y], [13.5 * s * k, y + 9 * s * k], [12 * s * k, y + 22 * s * k], [6 * s * k, y + 29 * s * k], [7.5 * s * k, y + 33 * s * k]], 7, { ...T, sq });
    shadow(G, x, y, z, 30 * s, 16 * s, 0.45);
  },
  /** 수확물: 호박 셋 + 밀단 둘 */
  harvest(G, x, y, z, o = {}) {
    const s = (o.h ?? 46) / 46;
    for (const [dx, dz, k] of [[-18, -4, 1], [2, -10, 0.8], [-4, 6, 1.15]]) { const cx = x + dx * s, cz = z + dz * s, r = 11 * s * k; G.lathe('white', cx, cz, [[r * 0.4, y], [r * 0.95, y + r * 0.35], [r, y + r * 0.8], [r * 0.8, y + r * 1.2], [r * 0.25, y + r * 1.35]], 8, { tint: [1.45, 0.72 + 0.1 * hash(dx, x), 0.2], vary: 0.25, cap: true }); G.tube('timber', [cx, y + r * 1.3, cz], [cx + 2, y + r * 1.7, cz - 1], 1.6, 1.2, 4, { keep: true, tint: [0.5, 0.6, 0.3] }); }
    for (const [dx, dz] of [[22, 2], [34, -6]]) G.lathe('straw', x + dx * s, z + dz * s, [[8 * s, y], [5 * s, y + 22 * s], [5.5 * s, y + 26 * s], [10 * s, y + 42 * s], [12 * s, y + 46 * s]], 7, { vary: 0.25, cap: true });
    shadow(G, x, y, z, 40 * s, 16 * s, 0.4);
  },
  /** 촛불 무리 (쉼터) */
  candles(G, x, y, z, o = {}) {
    for (let i = 0; i < (o.n ?? 5); i++) { const a = i * 2.4, r = 4 + 9 * hash(i, x), cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r * 0.6, ch = 8 + 14 * hash(x, i); G.lathe('white', cx, cz, [[3, y], [2.5, y + ch]], 5, { tint: [0.95, 0.9, 0.74], vary: 0, cap: true }); G.tri('white', [cx - 2.2, y + ch, cz - 1], [cx + 2.2, y + ch, cz - 1], [cx, y + ch + 9, cz - 1], [0, 0, -1], { emis: 1.6, tint: [1, 0.8, 0.4], fog: 0.4 }); }
    fx(G).glows.push({ x, y: y + 22, z: z - 6, r: 44, c: [1, 0.72, 0.36], flicker: true }); fx(G).pools.push({ x, y, z, r: 120, c: [1, 0.66, 0.3], a: 0.3, flicker: true });
  },
});

/**
 * 구운 소품(생성 모델)에 덧붙이는 것. build.js 가 bakedProp 뒤에 부른다: (G, x, y, z, o, s) — s = 크기 배율.
 * 모델의 그림에 든 불빛(숯 · 등불 유리)은 꼭짓점 깃발로 밝게 남고, 여기서는 불길 · 잉걸불 · 빛 번짐을 더한다.
 */
export const BAKED_EXTRA = {
  brazier(G, x, y, z, o, s) { if (o.lit !== false) flames(G, x, y + 96 * s, z - 6 * s, 30 * s, 40 * s, 2, 5); },
};
/** 구운 소품이 손으로 짠 것과 다른 인자를 받을 때 맞춰 준다 (o, 묶음의 정의) → o */
export const BAKED_ARGS = {};
