// 환경 키트 — 저폴리 3D 소품 (세운 그림판 대신). docs/v2/ENV_KIT.md §2
// 모두 PROPS[이름](G, x, y, z, o) 꼴의 순수 함수: Geo 에 삼각형을 쓰고, 빛 번짐·바닥 빛 웅덩이·닿는 그림자는 G.fx 에 적어 둔다(장면이 스티커로 그린다).
// 충돌은 여기서 만들지 않는다 — 스테이지 part 의 solid 값(B 와 같은 규칙)이 맡는다.
import { Frame, hash, sm } from './geo.js';

const fx = (G) => G.fx ?? (G.fx = { glows: [], pools: [], shadows: [] });
const shadow = (G, x, y, z, rx, rz = rx * 0.62, a = 0.55) => fx(G).shadows.push({ x, y, z, rx, rz, a });
const baseAO = (G, y0, span = 26) => { G.shade = (x, y) => 0.6 + 0.4 * sm(0, span, y - y0); };

/** 상자 겉의 테두리 널 + 가새 (나무 상자) */
function crateFace(G, F, len, y0, y1, w, tint) {
  const e = Math.min(7, len * 0.12), T = { tint, vary: 0.2, k: 1.08 };
  F.box(G, 'wood', 0, len, y0, y0 + e, w, w + 1.6, { ...T, faces: 'FT' }); F.box(G, 'wood', 0, len, y1 - e, y1, w, w + 1.6, { ...T, faces: 'F' });
  F.box(G, 'wood', 0, e, y0 + e, y1 - e, w, w + 1.6, { ...T, faces: 'FR' }); F.box(G, 'wood', len - e, len, y0 + e, y1 - e, w, w + 1.6, { ...T, faces: 'FL' });
  G.quad4('wood', F.pt(e, y0 + e, w + 1.2), F.pt(e + e * 1.1, y0 + e, w + 1.2), F.pt(len - e, y1 - e, w + 1.2), F.pt(len - e - e * 1.1, y1 - e, w + 1.2), F.n, { ...T, k: 0.95 });
}
/** 수레바퀴 (xy 평면의 원판: 테 · 살 · 바퀴통 + 위쪽 접지면) */
function wheel(G, cx, cy, z, r, th, n = 12) {
  const P = (rr, i) => [cx + Math.cos(i * 2 * Math.PI / n) * rr, cy + Math.sin(i * 2 * Math.PI / n) * rr], T = { tint: [0.62, 0.48, 0.38], vary: 0.15 }, N = [0, 0, -1];
  for (let i = 0; i < n; i++) {
    const a = P(r * 0.8, i), b = P(r * 0.8, i + 1), c = P(r, i + 1), d = P(r, i);
    G.quad4('wood', [a[0], a[1], z], [b[0], b[1], z], [c[0], c[1], z], [d[0], d[1], z], N, T);
    const am = (i + 0.5) * 2 * Math.PI / n;
    G.quad4('metal', [d[0], d[1], z], [c[0], c[1], z], [c[0], c[1], z + th], [d[0], d[1], z + th], [Math.cos(am), Math.sin(am), 0], { vary: 0, k: 0.9, keep: Math.sin(am) > 0.2 });
  }
  for (let i = 0; i < n; i += 2) { const a = i * 2 * Math.PI / n, dx = -Math.sin(a) * 1.6, dy = Math.cos(a) * 1.6, p = P(r * 0.82, i); G.quad4('wood', [cx - dx, cy - dy, z + 0.6], [cx + dx, cy + dy, z + 0.6], [p[0] + dx, p[1] + dy, z + 0.6], [p[0] - dx, p[1] - dy, z + 0.6], N, { ...T, k: 0.85 }); }
  const hub = []; for (let i = 0; i < 6; i++) hub.push([cx + Math.cos(i * Math.PI / 3) * r * 0.2, cy + Math.sin(i * Math.PI / 3) * r * 0.2, z - 1.5]);
  G.poly('metal', hub, N, { vary: 0, k: 1.05 });
}
/** 등불 상자: 스스로 빛나는 유리 네 면 + 쇠 모서리 + 뾰족 갓 */
function lantern(G, x, y, z, s, hh, glow) {
  const c = glow?.c ?? [1, 0.72, 0.36], E = { emis: 1.55, tint: c, fog: 0.5 };
  G.box('white', x - s, y, z - s, x + s, y + hh, z + s, { faces: 'FLR', ...E });
  for (const [dx, dz] of [[-1, -1], [1, -1]]) G.box('metal', x + dx * s - 1.2, y - 2, z + dz * s - 1.2, x + dx * s + 1.2, y + hh + 1, z + dz * s + 1.2, { faces: 'FLR', vary: 0, k: 0.7 });
  G.box('metal', x - s - 1.5, y - 3, z - s - 1.5, x + s + 1.5, y, z + s + 1.5, { faces: 'FLRT', vary: 0, k: 0.7 });
  G.lathe('metal', x, z, [[s * 1.75, y + hh], [s * 0.5, y + hh + s * 1.1], [1.2, y + hh + s * 1.5], [0, y + hh + s * 2.1]], 4, { a0: Math.PI / 4, vary: 0, k: 0.75, flat: true });
  if (glow) fx(G).glows.push({ x, y: y + hh * 0.5, z: z - s - 1, r: glow.r ?? 70, c, flicker: !!glow.flicker });
}

export const PROPS = {
  /** 술통: 배부른 몸통 + 쇠 테 세 줄 + 뚜껑 */
  barrel(G, x, y, z, o = {}) {
    const h = o.h ?? 78, r = h * 0.33, rr = (f) => r * (0.8 + 0.2 * Math.sin(Math.PI * f));
    baseAO(G, y, 20);
    G.lathe('wood', x, z, [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => [rr(f), y + h * f]), 10, { tint: [1.0, 0.8, 0.62], vary: 0.25, cap: 'darkwood', capK: 1.1 });
    for (const f of [0.12, 0.5, 0.88]) G.lathe('metal', x, z, [[rr(f) + 0.9, y + h * f - 3], [rr(f) + 0.9, y + h * f + 3]], 10, { vary: 0, k: 0.85 });
    G.shade = null; shadow(G, x, y, z, r * 1.5);
  },
  /** 나무 상자: 널 + 테두리 + 가새 (w·d·h 를 주면 그 크기 — B 의 상자 장애물과 같은 자리) */
  crate(G, x, y, z, o = {}) {
    const h = o.h ?? 62, w = o.w ?? h * 1.05, d = o.d ?? h * 0.9, x0 = x - w / 2, z0 = z - d / 2, t = o.tint ?? [1.1, 0.9, 0.72];
    baseAO(G, y, 22);
    G.box('wood', x0, y, z0, x0 + w, y + h, z0 + d, { faces: 'FLRT', tint: t, vary: 0.25, cell: 60 });
    crateFace(G, new Frame(x0, z0, 0, -1), w, y, y + h, 0, t); crateFace(G, new Frame(x0, z0 + d, -1, 0), d, y, y + h, 0, t); crateFace(G, new Frame(x0 + w, z0, 1, 0), d, y, y + h, 0, t);
    G.shade = null;
    for (const [a, b] of [[x0, x0 + 6], [x0 + w - 6, x0 + w]]) G.box('wood', a, y + h, z0, b, y + h + 1.5, z0 + d, { faces: 'FLRT', tint: t, k: 1.1 });
    shadow(G, x, y, z, w * 0.75, d * 0.7);
  },
  /** 손수레: 짐칸 + 바퀴 둘 + 손잡이 + 받침 다리 + 자루 */
  cart(G, x, y, z, o = {}) {
    const L = (o.h ?? 104) * 0.92, d = 46, x0 = x - L / 2, z0 = z - d / 2, fy = y + 30, T = { tint: [0.95, 0.76, 0.58], vary: 0.25 };
    G.box('wood', x0, fy, z0, x0 + L, fy + 6, z0 + d, { faces: 'FLRT', ...T });
    G.box('wood', x0, fy + 6, z0, x0 + L, fy + 24, z0 + 3, { faces: 'FLRT', ...T }); G.box('wood', x0, fy + 6, z0 + d - 3, x0 + L, fy + 26, z0 + d, { faces: 'FLRT', ...T, k: 0.8 });
    G.box('wood', x0, fy + 6, z0, x0 + 3, fy + 24, z0 + d, { faces: 'FLRT', ...T }); G.box('wood', x0 + L - 3, fy + 6, z0, x0 + L, fy + 24, z0 + d, { faces: 'FLRT', ...T });
    for (const u of [0.25, 0.5, 0.75]) G.box('wood', x0 + L * u - 2, fy + 4, z0 - 1.5, x0 + L * u + 2, fy + 26, z0, { faces: 'FLRT', ...T, k: 1.1 });
    wheel(G, x - L * 0.12, y + 24, z0 - 5, 24, 4); wheel(G, x - L * 0.12, y + 24, z0 + d + 1, 24, 4);
    for (const dz of [3, d - 3]) G.tube('wood', [x0 + L, fy + 4, z0 + dz], [x0 + L + 40, fy + 14, z0 + dz], 2.6, 2.2, 5, T);
    G.tube('wood', [x0 + L - 8, fy, z0 + 4], [x0 + L - 2, y, z0 + 2], 2.4, 2.4, 4, T);
    G.lathe('cloth', x0 + L * 0.3, z, [[13, fy + 6], [16, fy + 16], [12, fy + 30], [4, fy + 35]], 7, { tint: [0.8, 0.7, 0.52], sq: 0.8, cap: true, vary: 0.2 });   // 자루
    G.lathe('cloth', x0 + L * 0.66, z + 3, [[12, fy + 6], [14, fy + 14], [10, fy + 25], [3, fy + 29]], 7, { tint: [0.7, 0.62, 0.5], sq: 0.8, cap: true, vary: 0.2 });
    shadow(G, x, y, z, L * 0.62, d * 0.8, 0.5);
  },
  /** 우물: 돌 테 + 물 + 기둥 둘 + 도르래 + 두레박 + 작은 맞배지붕 */
  well(G, x, y, z, o = {}) {
    const h = o.h ?? 132, r = 38, sq = 0.72;
    baseAO(G, y, 24);
    G.lathe('rubble', x, z, [[r + 2, y], [r, y + 6], [r, y + 32]], 12, { sq, tint: [0.95, 0.9, 0.95], vary: 0.3 });
    G.lathe('trimstone', x, z, [[r + 3, y + 32], [r + 3, y + 38]], 12, { sq, vary: 0.1, cap: true });
    G.shade = null;
    const pts = []; for (let i = 0; i < 12; i++) pts.push([x + Math.cos(i * Math.PI / 6) * (r - 7), y + 38.3, z + Math.sin(i * Math.PI / 6) * (r - 7) * sq]);
    G.poly('stone', pts, [0, 1, 0], { tint: [0.1, 0.16, 0.3], k: 0.7, vary: 0 });   // 어두운 물
    for (const sx of [-1, 1]) G.box('wood', x + sx * (r + 1) - 4, y, z - 4, x + sx * (r + 1) + 4, y + h * 0.78, z + 4, { faces: 'FLRT', tint: [0.8, 0.62, 0.5], vary: 0.2 });
    G.tube('wood', [x - r - 6, y + h * 0.6, z], [x + r + 6, y + h * 0.6, z], 3.4, 3.4, 6, { tint: [0.9, 0.72, 0.56] });
    G.box('cloth', x - 1, y + 46, z - 1.5, x + 1, y + h * 0.6, z - 0.5, { faces: 'FLR', tint: [0.7, 0.6, 0.45], vary: 0 });
    G.lathe('wood', x, z - 1, [[5, y + 40], [6.5, y + 52]], 7, { tint: [0.85, 0.66, 0.5], cap: 'darkwood' });
    const yr = y + h * 0.78, hw = r + 16, dz = 30;   // 지붕 (용마루 x 방향)
    G.quad('slate', [x - hw, yr - 4, z - dz], [hw * 2, 0, 0], [0, h * 0.22 + 4, dz], [0, 0.8, -0.6], { vary: 0.25 });
    for (const sx of [-1, 1]) G.tri('darkwood', [x + sx * hw, yr - 4, z - dz], [x + sx * hw, yr - 4, z + dz], [x + sx * hw, y + h, z], [sx, 0, 0], { k: 1.1 });
    G.quad('timber', [x - hw, yr - 9, z - dz], [hw * 2, 0, 0], [0, 5, 0], [0, 0, -1], { k: 0.75 });
    shadow(G, x, y, z, r * 1.5, r * 1.1, 0.6);
  },
  /** 가로등: 쇠 받침 + 기둥 + 가로대 + 빛나는 등불 */
  lamp(G, x, y, z, o = {}) {
    const h = o.h ?? 196, M = { vary: 0, k: 0.8 }, yl = y + h * 0.76;
    baseAO(G, y, 20);
    G.lathe('metal', x, z, [[10, y], [10, y + 5], [6.5, y + 9], [4.6, y + 26], [3.6, y + 34], [3.0, yl - 22], [4.4, yl - 18], [3.0, yl - 12], [3.0, yl - 3]], 8, M);
    G.shade = null;
    G.box('metal', x - 15, yl - 26, z - 1.2, x + 15, yl - 23.5, z + 1.2, { faces: 'FLRT', ...M });   // 사다리 걸이 (가로대)
    lantern(G, x, yl, z, h * 0.04, h * 0.105, o.glow === false ? null : { r: o.glow?.r ?? 78, c: o.glow?.c });
    fx(G).pools.push({ x, y, z, r: 170, c: [1, 0.66, 0.32], a: 0.3 });
    shadow(G, x, y, z, 16, 11, 0.6);
  },
  /** 장터 가판대: 기둥 넷 + 판매대 + 줄무늬 차양 + 늘어진 술 + 물건 */
  stall(G, x, y, z, o = {}) {
    const w = o.w ?? 150, d = 60, x0 = x - w / 2, z0 = z - d / 2, T = { tint: [0.9, 0.74, 0.58], vary: 0.25 }, c1 = o.c1 ?? [1.05, 0.3, 0.24], c2 = o.c2 ?? [1.1, 1.0, 0.82];
    baseAO(G, y, 24);
    G.box('wood', x0 + 4, y, z0 + 6, x0 + w - 4, y + 38, z0 + d - 6, { faces: 'FLR', ...T, cell: 60 });
    G.shade = null;
    G.box('wood', x0, y + 38, z0, x0 + w, y + 43, z0 + d, { faces: 'FLRT', ...T, k: 1.1 });
    for (const [px, pz, ph] of [[x0 + 3, z0 + 3, 104], [x0 + w - 3, z0 + 3, 104], [x0 + 3, z0 + d - 3, 128], [x0 + w - 3, z0 + d - 3, 128]]) G.box('wood', px - 3, y + 43, pz - 3, px + 3, y + ph, pz + 3, { faces: 'FLR', ...T, k: 0.9 });
    const n = 8, ya = y + 100, yb = y + 132, za = z0 - 16, zb = z0 + d + 2;
    for (let i = 0; i < n; i++) {
      const a = x0 - 8 + (w + 16) * i / n, b = x0 - 8 + (w + 16) * (i + 1) / n, c = i % 2 ? c1 : c2;
      G.quad('cloth', [a, ya, za], [b - a, 0, 0], [0, yb - ya, zb - za], [0, 0.93, -0.36], { tint: c, vary: 0.12, uo: hash(i, x) });
      G.quad('cloth', [a, ya - 9, za], [b - a, 0, 0], [0, 9, 0], [0, 0, -1], { tint: c, k: 0.85, vary: 0 });
      G.tri('cloth', [a, ya - 9, za], [b, ya - 9, za], [(a + b) / 2, ya - 17, za], [0, 0, -1], { tint: c, k: 0.8, vary: 0 });
    }
    for (const sx of [-1, 1]) G.tri('cloth', [x + sx * (w / 2 + 8), ya, za], [x + sx * (w / 2 + 8), yb, zb], [x + sx * (w / 2 + 8), ya, zb], [sx, 0, 0], { tint: c2, k: 0.7, vary: 0 });
    // 물건: 작은 궤짝 둘 + 둥근 채소 + 병
    G.box('wood', x0 + 12, y + 43, z0 + 8, x0 + 44, y + 57, z0 + 34, { faces: 'FLRT', tint: [1.1, 0.9, 0.7] }); G.box('wood', x0 + w - 50, y + 43, z0 + 10, x0 + w - 16, y + 55, z0 + 36, { faces: 'FLRT', tint: [1.0, 0.82, 0.66] });
    for (let i = 0; i < 5; i++) G.lathe('white', x0 + 56 + i * 9 + (i % 2) * 3, z0 + 14 + (i % 3) * 7, [[0.5, y + 43], [5.5, y + 46], [5.5, y + 51], [0, y + 54]], 6, { tint: i % 2 ? [1.3, 0.62, 0.2] : [0.9, 0.3, 0.22], vary: 0 });
    for (let i = 0; i < 4; i++) G.lathe('white', x0 + 18 + i * 7, z0 + 14 + (i % 2) * 8, [[3, y + 57], [3, y + 64], [1.2, y + 67], [1.2, y + 72]], 5, { tint: [0.3, 0.5, 0.36], vary: 0, cap: true });
    shadow(G, x, y, z, w * 0.66, d * 0.9, 0.55);
  },
  /** 화로: 세 다리 + 쇠 그릇 + 이글거리는 숯 (불빛은 빛 번짐 스티커) */
  brazier(G, x, y, z, o = {}) {
    const h = o.h ?? 112, yb = y + h * 0.5, M = { vary: 0, k: 0.75 };
    for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; G.tube('metal', [x + Math.cos(a) * 20, y, z + Math.sin(a) * 15], [x + Math.cos(a) * 5, yb + 4, z + Math.sin(a) * 4], 2.4, 2.0, 4, { ...M, keep: true }); }
    G.lathe('metal', x, z, [[13, y + h * 0.22], [13, y + h * 0.25]], 8, M);
    G.lathe('metal', x, z, [[5, yb], [17, yb + h * 0.13], [22, yb + h * 0.2], [23, yb + h * 0.24]], 9, { ...M, k: 0.95 });
    const pts = []; for (let i = 0; i < 9; i++) pts.push([x + Math.cos(i * 2 * Math.PI / 9) * 21, yb + h * 0.22, z + Math.sin(i * 2 * Math.PI / 9) * 21]);
    G.poly('coal', pts, [0, 1, 0], { emis: 1.0, fog: 0.5 });
    for (let i = 0; i < 5; i++) { const a = i * 1.3, px = x + Math.cos(a) * 9, pz = z + Math.sin(a) * 6 - 4, fh = 16 + 12 * hash(i, x); G.tri('white', [px - 6, yb + h * 0.22, pz], [px + 6, yb + h * 0.22, pz], [px + (hash(x, i) - 0.5) * 6, yb + h * 0.22 + fh, pz], [0, 0, -1], { emis: 1.5, tint: [1.0, 0.56 + 0.2 * hash(i, 1), 0.16], fog: 0.4 }); }
    fx(G).glows.push({ x, y: yb + h * 0.3, z: z - 6, r: o.glow?.r ?? 90, c: o.glow?.c ?? [1, 0.6, 0.25], flicker: true });
    fx(G).pools.push({ x, y, z, r: 200, c: [1, 0.55, 0.22], a: 0.34, flicker: true });
    shadow(G, x, y, z, 26, 18, 0.5);
  },
  /** 건초: 짚단 두 개 + 위에 하나 (묶는 끈) */
  hay(G, x, y, z, o = {}) {
    const h = (o.h ?? 62) * 0.5, w = h * 1.9, d = h * 1.25;
    const bale = (bx, by, bz, k) => {
      G.box('straw', bx - w / 2, by, bz - d / 2, bx + w / 2, by + h, bz + d / 2, { faces: 'FLRT', k, vary: 0.2, shade: (px, py) => 0.72 + 0.28 * sm(0, 14, py - by) });
      for (const u of [-0.25, 0.25]) G.box('cloth', bx + w * u - 1, by, bz - d / 2 - 0.5, bx + w * u + 1, by + h + 0.5, bz + d / 2, { faces: 'FT', tint: [0.5, 0.4, 0.28], vary: 0 });
    };
    bale(x - w * 0.52, y, z, 1); bale(x + w * 0.52, y, z + 2, 0.94); bale(x + 2, y + h, z + 1, 1.05);
    shadow(G, x, y, z, w * 1.25, d * 0.9, 0.5);
  },
  /** 묘비: 둥근 머리 석판(또는 십자) + 받침. 조금 기울어 있다 */
  tomb(G, x, y, z, o = {}) {
    const h = o.h ?? 90, w = h * 0.52, t = 9, lean = (hash(x, z) - 0.5) * 10, F = new Frame(x - w / 2, z - t / 2, 0, -1);
    baseAO(G, y, 30);
    G.box('stone', x - w * 0.62, y, z - t, x + w * 0.62, y + 9, z + t, { faces: 'FLRT', top: 'trimstone' });
    const P = (u, yy) => F.pt(u + lean * (yy - y) / h, yy, 0), Pb = (u, yy) => F.pt(u + lean * (yy - y) / h, yy, -t);
    if (o.cross) {
      const cw = w * 0.3;
      G.quad4('trimstone', P(w / 2 - cw / 2, y + 9), P(w / 2 + cw / 2, y + 9), P(w / 2 + cw / 2, y + h), P(w / 2 - cw / 2, y + h), F.n, { vary: 0.3 });
      G.quad4('trimstone', P(0, y + h * 0.58), P(w, y + h * 0.58), P(w, y + h * 0.58 + cw), P(0, y + h * 0.58 + cw), F.n, { vary: 0.3 });
      G.quad4('trimstone', P(w / 2 - cw / 2, y + 9), Pb(w / 2 - cw / 2, y + 9), Pb(w / 2 - cw / 2, y + h), P(w / 2 - cw / 2, y + h), [-1, 0, 0], { k: 0.8 });
      G.quad4('trimstone', P(w / 2 + cw / 2, y + 9), Pb(w / 2 + cw / 2, y + 9), Pb(w / 2 + cw / 2, y + h), P(w / 2 + cw / 2, y + h), [1, 0, 0], { k: 0.8 });
    } else {
      const yS = y + h - w / 2, pts = [P(0, y + 9), P(w, y + 9), P(w, yS)]; for (let i = 1; i < 7; i++) { const a = i * Math.PI / 7; pts.push(P(w / 2 + Math.cos(a) * w / 2, yS + Math.sin(a) * w / 2)); } pts.push(P(0, yS));
      G.poly('trimstone', pts, F.n, { vary: 0.35, tint: [0.92, 0.95, 1.0] });
      G.quad4('trimstone', P(0, y + 9), Pb(0, y + 9), Pb(0, yS), P(0, yS), [-1, 0, 0], { k: 0.8 }); G.quad4('trimstone', P(w, y + 9), Pb(w, y + 9), Pb(w, yS), P(w, yS), [1, 0, 0], { k: 0.8 });
      for (let i = 0; i < 7; i++) { const a = i * Math.PI / 7, b = (i + 1) * Math.PI / 7, q = (ang) => [w / 2 + Math.cos(ang) * w / 2, yS + Math.sin(ang) * w / 2]; const A = q(a), B = q(b); G.quad4('trimstone', P(A[0], A[1]), Pb(A[0], A[1]), Pb(B[0], B[1]), P(B[0], B[1]), [Math.cos((a + b) / 2), Math.sin((a + b) / 2), 0], { k: 0.95, keep: true }); }
      F.face(G, 'stone', w * 0.24, w * 0.76, y + h * 0.42, y + h * 0.5, 0.4, { k: 0.5, vary: 0 }); F.face(G, 'stone', w * 0.3, w * 0.7, y + h * 0.3, y + h * 0.36, 0.4, { k: 0.5, vary: 0 });   // 새긴 글줄
    }
    G.shade = null; shadow(G, x, y, z, w * 0.8, 12, 0.45);
  },
  /** 분수대: 팔각 수반 + 물 + 가운데 기둥 + 윗 접시 */
  fountain(G, x, y, z, o = {}) {
    const r = o.r ?? 58, sq = 0.78;
    baseAO(G, y, 24);
    G.lathe('ashlar', x, z, [[r + 4, y], [r + 4, y + 7], [r, y + 9], [r, y + 26]], 8, { sq, vary: 0.2 });
    G.lathe('trimstone', x, z, [[r + 3, y + 26], [r + 3, y + 32]], 8, { sq, cap: true, vary: 0.1 });
    G.shade = null;
    const pts = []; for (let i = 0; i < 8; i++) pts.push([x + Math.cos((i + 0.5) * Math.PI / 4) * (r - 8), y + 32.3, z + Math.sin((i + 0.5) * Math.PI / 4) * (r - 8) * sq]);
    G.poly('stone', pts, [0, 1, 0], { tint: [0.12, 0.2, 0.36], k: 0.8, vary: 0 });
    G.lathe('trimstone', x, z, [[11, y + 32], [8, y + 40], [6, y + 66], [9, y + 72], [24, y + 80], [26, y + 85]], 8, { vary: 0.1, cap: 'stone', capTint: [0.14, 0.22, 0.38] });
    G.lathe('trimstone', x, z, [[5, y + 85], [4, y + 100], [6.5, y + 104], [0, y + 114]], 6, { vary: 0 });
    shadow(G, x, y, z, r * 1.25, r, 0.6);
  },
  /** 석상: 받침대 위의 두건 쓴 수호자 (칼을 짚고 선 모습) — 저폴리 회전체 */
  statue(G, x, y, z, o = {}) {
    const h = o.h ?? 210, ph = h * 0.26, s = h / 210, fy = y + ph, T = { vary: 0.3, tint: [0.84, 0.88, 0.98] };
    baseAO(G, y, 30);
    G.box('stone', x - 26 * s, y, z - 20 * s, x + 26 * s, y + 10 * s, z + 20 * s, { faces: 'FLRT', top: 'trimstone' });
    G.box('ashlar', x - 21 * s, y + 10 * s, z - 16 * s, x + 21 * s, y + ph - 7 * s, z + 16 * s, { faces: 'FLR' });
    G.box('trimstone', x - 24 * s, y + ph - 7 * s, z - 19 * s, x + 24 * s, y + ph, z + 19 * s, { faces: 'FLRT' });
    G.shade = (px, py) => 0.72 + 0.28 * sm(0, 60 * s, py - fy);
    G.lathe('trimstone', x, z, [[19, 0], [16.5, 30], [13, 66], [14.5, 84], [17.5, 96], [15, 104], [8.5, 110], [9.8, 118], [10.4, 128], [8, 137], [0, 142]].map(([r, yy]) => [r * s, fy + yy * s]), 9, { sq: 0.7, ...T });
    G.box('trimstone', x - 2.2 * s, fy, z - 14.5 * s, x + 2.2 * s, fy + 86 * s, z - 12.5 * s, { faces: 'FLR', ...T, k: 1.1 });          // 짚은 칼
    G.box('trimstone', x - 10 * s, fy + 80 * s, z - 15 * s, x + 10 * s, fy + 85 * s, z - 12 * s, { faces: 'FLRT', ...T, k: 1.1 });       // 칼코등이
    G.box('trimstone', x - 8 * s, fy + 86 * s, z - 15.5 * s, x + 8 * s, fy + 95 * s, z - 11 * s, { faces: 'FLRT', ...T });               // 포갠 손
    G.shade = null; shadow(G, x, y, z, 36 * s, 26 * s, 0.6);
  },
  /** 마른 나무: 휘어 오르는 줄기 + 가지 두 층 + 잔가지 */
  tree(G, x, y, z, o = {}) {
    const h = o.h ?? 300, sd = o.seed ?? x * 0.37 + z * 0.11, R = (i) => hash(sd + i * 1.7, i * 3.1 + sd), T = { tint: o.tint ?? [0.5, 0.46, 0.5], vary: 0.3 }, dir = o.flip ? -1 : 1;
    let p = [x, y, z], r = h * 0.045; const knots = [];
    G.lathe('darkwood', x, z, [[r * 1.9, y], [r * 1.25, y + h * 0.05], [r, y + h * 0.1]], 7, T);
    p = [x, y + h * 0.1, z];
    for (let i = 0; i < 4; i++) {
      const q = [p[0] + dir * (R(i) - 0.35) * h * 0.09, p[1] + h * 0.14, p[2] + (R(i + 9) - 0.5) * h * 0.03], r2 = r * 0.8;
      G.tube('darkwood', p, q, r, r2, 6, T); p = q; r = r2; knots.push([q, r2]);
    }
    let bi = 0;
    for (const [k, kr] of knots) for (let j = 0; j < 2; j++, bi++) {
      const a = (R(bi + 20) - 0.5) * 2.2 + (j ? Math.PI : 0), up = 0.45 + 0.5 * R(bi + 40), len = h * (0.2 + 0.14 * R(bi + 60));
      const e = [k[0] + Math.cos(a) * len * 0.9, k[1] + len * up, k[2] + Math.sin(a) * len * 0.22];
      G.tube('darkwood', k, e, kr * 0.72, kr * 0.3, 4, { ...T, keep: true });
      for (let m = 0; m < 2; m++) { const f = 0.5 + 0.3 * m, b = [k[0] + (e[0] - k[0]) * f, k[1] + (e[1] - k[1]) * f, k[2] + (e[2] - k[2]) * f], l2 = len * 0.45; G.tube('darkwood', b, [b[0] + Math.cos(a + (m ? 0.9 : -0.9)) * l2 * 0.7, b[1] + l2 * 0.75, b[2]], kr * 0.28, 0, 3, { ...T, keep: true }); }
    }
    G.tube('darkwood', p, [p[0] + dir * h * 0.03, p[1] + h * 0.16, p[2]], r, 0, 4, { ...T, keep: true });
    shadow(G, x, y, z, h * 0.09, h * 0.06, 0.5);
  },
};

/** 벽에 다는 것 (벽면 틀 위에서 짓는다) */
export const WALLPROPS = {
  /** 간판: perp = 벽에서 수직으로 내민 걸이 간판(골목용) / 아니면 벽에 붙인 판 */
  sign(G, F, s) {
    const u = s.u, y = s.y, c = s.c ?? [0.5, 0.16, 0.14], M = { vary: 0, k: 0.75 };
    if (s.perp) {
      const L = s.len ?? 52, a = F.pt(u, y + 40, 0), b = F.pt(u, y + 40, L);
      G.tube('metal', a, b, 1.8, 1.8, 4, { ...M, keep: true }); G.tube('metal', F.pt(u, y + 16, 0), F.pt(u, y + 40, L * 0.55), 1.4, 1.4, 4, { ...M, keep: true });
      const F2 = new Frame(...((p) => [p[0], p[2]])(F.pt(u, 0, 10)), 0, -1), bw = L - 14, sx = F.nx;   // 판은 늘 카메라 쪽(−z)을 본다
      const x0 = sx < 0 ? -bw : 0;
      for (const uu of [x0 + 5, x0 + bw - 5]) F2.box(G, 'metal', uu - 0.8, uu + 0.8, y + 32, y + 40, -0.8, 0.8, { faces: 'FLR', ...M });
      F2.box(G, 'wood', x0, x0 + bw, y, y + 32, -1.5, 1.5, { faces: 'FLRT', tint: [0.8, 0.62, 0.48], vary: 0.2 });
      F2.face(G, 'white', x0 + 3, x0 + bw - 3, y + 3, y + 29, 1.8, { tint: c, vary: 0.1 });
      const cx = x0 + bw / 2, cy = y + 16; G.poly('white', [F2.pt(cx, cy - 9, 2.1), F2.pt(cx + 8, cy, 2.1), F2.pt(cx, cy + 9, 2.1), F2.pt(cx - 8, cy, 2.1)], F2.n, { tint: [1.2, 0.95, 0.4], vary: 0 });
    } else {
      const w = s.w ?? 70, hh = s.h ?? 24;
      F.box(G, 'wood', u - w / 2, u + w / 2, y, y + hh, 0, 3, { faces: 'FLRT', tint: [0.8, 0.62, 0.48], vary: 0.2 });
      F.face(G, 'white', u - w / 2 + 3, u + w / 2 - 3, y + 3, y + hh - 3, 3.3, { tint: c, vary: 0.1 });
      for (const k of [-0.28, 0, 0.28]) G.poly('white', [F.pt(u + w * k, y + 6, 3.6), F.pt(u + w * k + 6, y + hh / 2, 3.6), F.pt(u + w * k, y + hh - 6, 3.6), F.pt(u + w * k - 6, y + hh / 2, 3.6)], F.n, { tint: [1.2, 0.95, 0.4], vary: 0 });
    }
  },
  /** 내걸린 깃발: 가로 장대 + 천(제비꼬리 끝) + 금빛 띠 + 문양 */
  banner(G, F, s) {
    const u = s.u, y = s.y, w = s.w ?? 44, L = s.len ?? 120, c = s.c ?? [0.62, 0.12, 0.14], w0 = 7;
    G.tube('wood', F.pt(u - w / 2 - 6, y + L, w0), F.pt(u + w / 2 + 6, y + L, w0), 2, 2, 5, { tint: [0.7, 0.55, 0.4], keep: true });
    for (const uu of [u - w / 2 - 3, u + w / 2 + 3]) G.tube('metal', F.pt(uu, y + L, 0), F.pt(uu, y + L, w0), 1.4, 1.4, 4, { vary: 0, k: 0.7, keep: true });
    const seg = 4, yy = (i) => y + L - (L - 16) * i / seg, ww = (i) => w0 + Math.sin(i * 1.4 + u) * 2.2;
    for (let i = 0; i < seg; i++) {
      G.quad4('cloth', F.pt(u - w / 2, yy(i + 1), ww(i + 1)), F.pt(u + w / 2, yy(i + 1), ww(i + 1)), F.pt(u + w / 2, yy(i), ww(i)), F.pt(u - w / 2, yy(i), ww(i)), F.n, { tint: c, vary: 0.15, k: 0.9 + 0.2 * Math.sin(i * 1.4 + u) });
      for (const e of [-1, 1]) G.quad4('cloth', F.pt(u + e * (w / 2 - 4) - 2, yy(i + 1), ww(i + 1) + 0.4), F.pt(u + e * (w / 2 - 4) + 2, yy(i + 1), ww(i + 1) + 0.4), F.pt(u + e * (w / 2 - 4) + 2, yy(i), ww(i) + 0.4), F.pt(u + e * (w / 2 - 4) - 2, yy(i), ww(i) + 0.4), F.n, { tint: [1.25, 0.95, 0.4], vary: 0 });
    }
    for (const e of [-1, 1]) G.tri('cloth', F.pt(u, y + 16, ww(seg)), F.pt(u + e * w / 2, y + 16, ww(seg)), F.pt(u + e * w / 2, y, ww(seg)), F.n, { tint: c, k: 0.85, vary: 0 });
    const cy = y + L * 0.6; G.poly('cloth', [F.pt(u, cy - 13, w0 + 1.6), F.pt(u + 10, cy, w0 + 1.6), F.pt(u, cy + 13, w0 + 1.6), F.pt(u - 10, cy, w0 + 1.6)], F.n, { tint: [1.25, 0.95, 0.4], vary: 0 });
  },
  /** 벽등: 쇠 까치발 + 등불 */
  sconce(G, F, s) {
    const a = F.pt(s.u, s.y, 0), b = F.pt(s.u, s.y + 6, 16);
    G.tube('metal', a, b, 1.6, 1.6, 4, { vary: 0, k: 0.7, keep: true });
    lantern(G, b[0], b[1] - 14, b[2], 5, 13, { r: s.r ?? 56, c: s.c });
  },
};
