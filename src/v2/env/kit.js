// 환경 키트 — 건물 조각 (순수 함수: Geo 에 삼각형을 쓴다). docs/v2/ENV_KIT.md §1
//   dressWall  벽 한 덩어리 → 밑돌(plinth) · 돌림띠 · 모서리돌 · 버팀벽 · 깊이 있는 창(틀·창턱·살·덧문·불 켜진 유리) · 아치 문(계단) · 목조 위층(내밀기) · 갓돌/처마띠/성가퀴 · 난간
//   dressRoof  맞배지붕 → 돌기와 경사면 · 처마 · 용마루 · 박공 · 굴뚝 · 지붕창
//   dressFloor / dressBlock / dressStairs / dressPillar / arch / gate / pave / fence
// 모든 조각은 "벽면 틀"(Frame: u 오른쪽 · y 위 · w 바깥) 위에서 짓기 때문에 벽이 어느 쪽을 보든 같은 코드다.
import { Frame, sm, hash, vnoise } from './geo.js';

const CELL = 40;   // 빛을 굽는 격자 (B 는 64)

/** 구멍 뚫린 벽면: holes = [{u0,u1,y0,y1}] 자리는 비운다 */
export function wallGrid(G, F, mat, u0, u1, y0, y1, w, holes = [], o = {}) {
  if (u1 - u0 < 0.5 || y1 - y0 < 0.5) return;
  const cell = o.cell ?? CELL;
  const cuts = (a, b, ex) => {
    const s = [a, b]; for (const e of ex) if (e > a + 0.5 && e < b - 0.5 && !s.some((q) => Math.abs(q - e) < 0.5)) s.push(e);
    const n = Math.max(1, Math.round((b - a) / cell)); for (let i = 1; i < n; i++) { const c = a + (b - a) * i / n; if (!s.some((q) => Math.abs(q - c) < cell * 0.3)) s.push(c); }
    return s.sort((p, q) => p - q);
  };
  const us = cuts(u0, u1, holes.flatMap((h) => [h.u0, h.u1])), ys = cuts(y0, y1, holes.flatMap((h) => [h.y0, h.y1]));
  for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
    const cu = (us[i] + us[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    if (holes.some((h) => cu > h.u0 && cu < h.u1 && cy > h.y0 && cy < h.y1)) continue;
    F.face(G, mat, us[i], us[i + 1], ys[j], ys[j + 1], w, o);
  }
}

/** 아치 곡선 위의 점 (지역 [u, y]) — kind: 'round' 반원/낮은 아치, 'point' 뾰족 아치 */
function archPts(u, yS, hw, rise, kind, n = 8) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = -1 + 2 * i / n, a = Math.abs(t); pts.push([u + t * hw, yS + rise * (kind === 'point' ? 1 - a ** 1.55 : Math.sqrt(Math.max(0, 1 - t * t)))]); }
  return pts;
}
/** 네모 구멍의 위쪽 모서리를 아치 모양으로 메운다 (벽과 같은 재질) */
function spandrels(G, F, mat, u, hw, yS, rise, kind, w, o) {
  const P = archPts(u, yS, hw, rise, kind), top = yS + rise, m = P.length >> 1;
  for (let i = 0; i < m; i++) G.tri(mat, F.pt(u - hw, top, w), F.pt(P[i][0], P[i][1], w), F.pt(P[i + 1][0], P[i + 1][1], w), F.n, o);
  for (let i = m; i + 1 < P.length; i++) G.tri(mat, F.pt(u + hw, top, w), F.pt(P[i][0], P[i][1], w), F.pt(P[i + 1][0], P[i + 1][1], w), F.n, o);
}
/** 아치 돌 띠 (홍예석) + 이맛돌 */
function archBand(G, F, mat, u, hw, yS, rise, kind, w, th, o = {}) {
  const A = archPts(u, yS, hw, rise, kind), B = archPts(u, yS, hw + th, rise + th, kind);
  for (let i = 0; i + 1 < A.length; i++) G.quad4(mat, F.pt(A[i][0], A[i][1], w), F.pt(A[i + 1][0], A[i + 1][1], w), F.pt(B[i + 1][0], B[i + 1][1], w), F.pt(B[i][0], B[i][1], w), F.n, { ...o, k: (o.k ?? 1) * (i % 2 ? 0.9 : 1.06), vary: 0 });
  F.box(G, mat, u - th * 0.55, u + th * 0.55, yS + rise - 2, yS + rise + th + 4, w, w + 2.5, { faces: 'FLRT', k: 1.12, vary: 0 });
}

/** 창: 깊이 있는 구멍 + 틀 + 창턱 + 살 + 덧문 + 유리 (lit 이면 스스로 빛난다). s = {u,y,w,h, arch?, lit?, shutters?, frame?, depth?, cols?, rows?} */
export function windowAt(G, F, s, w0, wallMat) {
  const hw = s.w / 2, u0 = s.u - hw, u1 = s.u + hw, y0 = s.y, y1 = s.y + s.h, d = s.depth ?? 9, fm = s.frame ?? 'trimstone';
  const rise = s.arch ? (s.arch === 'point' ? Math.min(s.h * 0.45, hw * 1.3) : hw) : 0, yS = y1 - rise, dk = { k: 0.6, vary: 0 };
  G.quad(wallMat, F.pt(u0, y0, w0), F.vec(0, 0, -d), [0, yS - y0, 0], F.vec(1, 0, 0), dk);          // 문설주 안쪽 (왼)
  G.quad(wallMat, F.pt(u1, y0, w0), F.vec(0, 0, -d), [0, yS - y0, 0], F.vec(-1, 0, 0), dk);         // (오른)
  G.quad(fm, F.pt(u0, y0, w0), F.vec(u1 - u0, 0, 0), F.vec(0, 0, -d), [0, 1, 0], { k: 0.9, vary: 0 }); // 안쪽 창턱
  if (y1 > 250) G.quad(wallMat, F.pt(u0, y1, w0), F.vec(u1 - u0, 0, 0), F.vec(0, 0, -d), [0, -1, 0], { k: 0.45, vary: 0, keep: true });
  // 유리
  const lit = s.lit ?? 0, pm = lit ? 'glass' : 'glassDark', po = lit ? { emis: 0.72 + 0.4 * lit, fog: 0.72 } : { k: 1.15, vary: 0 };
  const cols = s.cols ?? (s.w > 30 ? 2 : 1), rows = s.rows ?? (s.h > 58 ? 2 : 1), wp = w0 - d;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) F.face(G, pm, u0 + (u1 - u0) * i / cols, u0 + (u1 - u0) * (i + 1) / cols, y0 + (y1 - y0) * j / rows, y0 + (y1 - y0) * (j + 1) / rows, wp, { ...po, uo: hash(s.u + i, s.y + j), vo: hash(s.y + j, s.u) });
  for (let i = 1; i < cols; i++) { const c = u0 + (u1 - u0) * i / cols; F.box(G, 'timber', c - 1.9, c + 1.9, y0, y1, wp, wp + 1.8, { faces: 'FLR', k: 0.62, vary: 0 }); }
  for (let j = 1; j < rows; j++) { const c = y0 + (y1 - y0) * j / rows; F.box(G, 'timber', u0, u1, c - 1.9, c + 1.9, wp, wp + 1.8, { faces: 'FT', k: 0.62, vary: 0 }); }
  if (rise) { spandrels(G, F, wallMat, s.u, hw, yS, rise, s.arch, w0, {}); if (fm) archBand(G, F, fm, s.u, hw, yS, rise, s.arch, w0 + 0.6, 6); }
  if (fm) {
    F.box(G, fm, u0 - 5, u0, y0, yS, w0, w0 + 2.2, { faces: 'FLRT', vary: 0 }); F.box(G, fm, u1, u1 + 5, y0, yS, w0, w0 + 2.2, { faces: 'FLRT', vary: 0 });
    if (!rise) F.box(G, fm, u0 - 8, u1 + 8, y1, y1 + 8, w0, w0 + 3.2, { faces: 'FLRT', vary: 0 });
    F.box(G, fm, u0 - 8, u1 + 8, y0 - 6, y0, w0, w0 + 6.5, { faces: 'FLRT', vary: 0, k: 1.06 });      // 바깥 창턱
  }
  if (s.shutters) {   // 열어젖힌 덧문 (널 + 띠쇠)
    const sw = hw * 0.94, t = s.shutterTint ?? [0.42, 0.56, 0.5];
    for (const sg of [-1, 1]) {
      const a = sg < 0 ? u0 - 6 - sw : u1 + 6, b = a + sw;
      F.box(G, 'wood', a, b, y0 + 1, yS - 1, w0 + 0.6, w0 + 3.4, { faces: 'FLRT', tint: t, vary: 0.2 });
      for (const fy of [0.2, 0.78]) F.face(G, 'metal', a + 1, b - 1, y0 + (yS - y0) * fy - 1.6, y0 + (yS - y0) * fy + 1.6, w0 + 3.7, { k: 0.8, vary: 0 });
    }
  }
}
/** 불 켜진 창이 내는 빛 (굽기 전에 W.lights 에 넣는다) */
export function windowLight(F, s, w0 = 0) { return { ...((p) => ({ x: p[0], y: p[1], z: p[2] }))(F.pt(s.u, s.y + s.h * 0.45, w0 + 30)), r: s.r ?? 210, c: [1.0, 0.55, 0.22], i: 0.35 + 0.55 * (s.lit ?? 0) }; }

/** 문: 아치 속으로 들어간 문짝 + 문설주 + 띠쇠 + 계단. s = {u,w,h, arch?, rise?(문턱 높이 = 계단), depth?}. 계단의 밟는 상자를 boxes 에 더한다 */
export function doorAt(G, F, s, w0, yb, wallMat, boxes) {
  const hw = s.w / 2, u0 = s.u - hw, u1 = s.u + hw, up = s.rise ?? 0, y0 = yb + up, y1 = y0 + s.h, d = s.depth ?? 15;
  const rise = s.arch ? (s.arch === 'point' ? Math.min(s.h * 0.4, hw * 1.25) : hw) : 0, yS = y1 - rise, dk = { k: 0.5, vary: 0 };
  G.quad(wallMat, F.pt(u0, y0, w0), F.vec(0, 0, -d), [0, yS - y0, 0], F.vec(1, 0, 0), dk);
  G.quad(wallMat, F.pt(u1, y0, w0), F.vec(0, 0, -d), [0, yS - y0, 0], F.vec(-1, 0, 0), dk);
  G.quad('stone', F.pt(u0, y0, w0), F.vec(u1 - u0, 0, 0), F.vec(0, 0, -d), [0, 1, 0], { k: 0.75, vary: 0 });
  const wp = w0 - d;
  if (s.open) {   // pulled open (story state): a dark doorway and the leaf swung out on its left hinge
    F.face(G, 'stone', u0, u1, y0, y1, wp, { k: 0.2, vary: 0, tint: s.glow ?? [0.5, 0.45, 0.5] });
    F.box(G, 'darkwood', u0 - 2.5, u0 + 2.5, y0, yS - 2, w0 - 3, w0 + s.w * 0.86, { faces: 'FLRT', k: 0.95, vary: 0.25, tint: s.tint });
    for (const fy of [0.16, 0.5, 0.82]) F.box(G, 'metal', u0 - 3.6, u0 + 3.6, y0 + (yS - y0) * fy - 2.6, y0 + (yS - y0) * fy + 2.6, w0 + 2, w0 + s.w * 0.7, { faces: 'LRT', k: 0.85, vary: 0 });
  } else {
  F.face(G, 'darkwood', u0, u1, y0, y1, wp, { k: 0.95, vary: 0.25, tint: s.tint });
  for (const fy of [0.16, 0.5, 0.82]) F.box(G, 'metal', u0 + 1, u0 + (u1 - u0) * 0.78, y0 + (yS - y0) * fy - 2.6, y0 + (yS - y0) * fy + 2.6, wp, wp + 1.4, { faces: 'FT', k: 0.85, vary: 0 });
  F.box(G, 'metal', u1 - 13, u1 - 7, y0 + s.h * 0.4, y0 + s.h * 0.4 + 9, wp, wp + 2.6, { faces: 'FLRT', k: 1.1, vary: 0 });
  }
  if (rise) { spandrels(G, F, wallMat, s.u, hw, yS, rise, s.arch, w0, {}); archBand(G, F, 'trimstone', s.u, hw, yS, rise, s.arch, w0 + 0.8, 9); }
  else F.box(G, 'trimstone', u0 - 12, u1 + 12, y1, y1 + 11, w0, w0 + 4.5, { faces: 'FLRT', vary: 0 });
  F.box(G, 'trimstone', u0 - 9, u0, yb, yS, w0, w0 + 4, { faces: 'FLRT', vary: 0 }); F.box(G, 'trimstone', u1, u1 + 9, yb, yS, w0, w0 + 4, { faces: 'FLRT', vary: 0 });
  const n = Math.round(up / 7);   // 계단: 위 칸일수록 얕다
  for (let i = 0; i < n; i++) {
    const top = yb + up - i * 7, dep = 13 * (i + 1), a = F.pt(u0 - 12 - i * 3, 0, w0), b = F.pt(u1 + 12 + i * 3, 0, w0 + dep);
    F.box(G, 'stone', u0 - 12 - i * 3, u1 + 12 + i * 3, yb, top, w0, w0 + dep, { faces: 'FLRT', top: 'trimstone', vary: 0.1 });
    boxes?.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]), y0: yb - 1, y1: top, solid: true, walk: true, stair: true, kit: true });
  }
}

/** 목조 뼈대: 기둥 · 가로대 · 가새. wins = 그 층의 창 (창 양옆에 기둥이 선다) */
export function timberFrame(G, F, u0, u1, y0, y1, w, wins = [], o = {}) {
  const T = { vary: 0.25, k: o.k ?? 1 }, mid = o.mid ?? (y0 + (y1 - y0) * 0.44);
  F.box(G, 'timber', u0, u1, y0, y0 + 11, w, w + 3.6, { ...T, faces: 'FLRT' });
  F.box(G, 'timber', u0, u1, y1 - 9, y1, w, w + 3, { ...T, faces: 'FLR' });
  const cs = [u0 + 4.5, u1 - 4.5];
  for (const s of wins) { cs.push(s.u - s.w / 2 - 4.5, s.u + s.w / 2 + 4.5); }
  cs.sort((a, b) => a - b);
  const inWin = (a, b) => wins.find((s) => a >= s.u - s.w / 2 - 5 && b <= s.u + s.w / 2 + 5);
  const posts = [cs[0]];
  for (let i = 1; i < cs.length; i++) { const a = posts[posts.length - 1], b = cs[i]; if (b - a < 9) continue; if (!inWin(a, b)) { const n = Math.ceil((b - a) / (o.bay ?? 84)); for (let k = 1; k < n; k++) posts.push(a + (b - a) * k / n); } posts.push(b); }
  for (const c of posts) F.box(G, 'timber', c - 4.5, c + 4.5, y0 + 11, y1 - 9, w, w + 3, { ...T, faces: 'FLR' });
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i] + 4.5, b = posts[i + 1] - 4.5, win = inWin(posts[i], posts[i + 1]);
    if (win) { if (win.y - 6 > y0 + 16) F.box(G, 'timber', a, b, win.y - 13, win.y - 6, w, w + 2.6, { ...T, faces: 'FT' }); continue; }
    F.box(G, 'timber', a, b, mid - 3.5, mid + 3.5, w, w + 2.6, { ...T, faces: 'FT' });
    if (b - a > 34 && hash(posts[i], y0) > 0.3) {   // 가새 (칸마다 방향을 바꾼다)
      const dir = i % 2, ya = y0 + 11, yb = mid - 3.5, p = dir ? [[a, yb - 8], [b, ya], [b, ya + 8], [a, yb]] : [[a, ya], [b, yb - 8], [b, yb], [a, ya + 8]];
      G.quad4('timber', F.pt(p[0][0], p[0][1], w + 2.4), F.pt(p[1][0], p[1][1], w + 2.4), F.pt(p[2][0], p[2][1], w + 2.4), F.pt(p[3][0], p[3][1], w + 2.4), F.n, { ...T, rot: true });
    }
  }
}

const FACES = (P) => {
  const y0 = P.y ?? 0, x0 = P.x, x1 = P.x + P.w, z0 = P.z, z1 = P.z + P.d;
  return { F: [new Frame(x0, z0, 0, -1), P.w], L: [new Frame(x0, z1, -1, 0), P.d], R: [new Frame(x1, z0, 1, 0), P.d], y0, y1: y0 + P.h };
};
const featsOf = (K, key, side) => (K[key] ?? []).filter((s) => (s.side ?? 'F') === side);

/** 벽 part 의 불 켜진 창 → 빛 목록 */
export function wallLights(P) {
  const K = P.kit ?? {}, FS = FACES(P), out = [];
  for (const side of K.faces ?? 'FLR') for (const s of featsOf(K, 'windows', side)) if (s.lit) out.push(windowLight(FS[side][0], { ...s, y: FS.y0 + s.y }, K.storey && s.y >= K.storey && (K.jettySides ?? 'F').includes(side) ? (K.jetty ?? 0) : 0));
  return out;
}

/** 벽 한 덩어리 꾸미기. P = B 의 wall part + kit:{style,…}. boxes = 더할 충돌 상자(문 계단) */
export function dressWall(G, P, boxes) {
  const K = P.kit ?? {}, FS = FACES(P), y0 = FS.y0, y1 = FS.y1, base = y0 + (K.base ?? 0);
  const style = K.style ?? (P.mat === 'plaster' ? 'plaster' : P.mat === 'stone' ? 'low' : 'stone');
  const lower = K.lower ?? { timber: 'ashlar', plaster: 'plaster', rubble: 'rubble', low: 'stone', stone: 'ashlar' }[style];
  const upper = style === 'timber' ? 'plaster' : lower, yJ = K.storey ? y0 + K.storey : null, ph = K.plinth ?? (style === 'low' ? 0 : 30);
  const eaves = K.eaves ?? (style === 'timber' || style === 'plaster');
  G.tintMul = K.tint ?? null;
  for (const side of K.faces ?? 'FLR') {
    const [F, len] = FS[side], jet = yJ && (K.jettySides ?? 'F').includes(side) ? (K.jetty ?? 0) : 0;
    const wins = featsOf(K, 'windows', side).map((s) => ({ ...s, y: y0 + s.y })), doors = featsOf(K, 'doors', side);
    G.shade = (x, y) => (0.52 + 0.48 * sm(0, 70, y - base)) * (eaves ? 0.64 + 0.36 * sm(0, 38, y1 - y) : 1) * (jet && y < yJ ? 0.66 + 0.34 * sm(0, 30, yJ - y) : 1);
    const hole = (s) => ({ u0: s.u - s.w / 2, u1: s.u + s.w / 2, y0: s.y, y1: s.y + s.h });
    const dh = doors.map((s) => ({ u0: s.u - s.w / 2, u1: s.u + s.w / 2, y0: base, y1: base + (s.rise ?? 0) + s.h }));
    const lo = wins.filter((s) => !yJ || s.y < yJ), hi = wins.filter((s) => yJ && s.y >= yJ);
    const go = K.cell ? { cell: K.cell } : {};   // 큰 벽은 빛 굽는 격자를 성기게 (삼각형 절약)
    wallGrid(G, F, lower, 0, len, y0, yJ ?? y1, 0, [...lo.map(hole), ...dh], go);
    if (yJ) {
      wallGrid(G, F, upper, 0, len, yJ, y1, jet, hi.map(hole), go);
      if (jet) {   // 내민 위층: 옆 마구리 + 장선 끝
        F.box(G, upper, 0, len, yJ, y1, 0, jet, { faces: 'LR' });
        for (let u = 10; u < len - 4; u += 34) F.box(G, 'timber', u - 4, u + 4, yJ - 10, yJ, 0, jet + 3, { faces: 'FLR', k: 0.8, vary: 0 });
      }
      if (style === 'timber') timberFrame(G, F, 0, len, yJ, y1, jet, hi, { mid: K.mid ? y0 + K.mid : undefined });
      else F.box(G, 'trimstone', 0, len, yJ - 5, yJ + 5, jet, jet + 3, { faces: 'FLRT', vary: 0 });
    } else if (style === 'plaster') timberFrame(G, F, 0, len, y0 + ph, y1, 0, lo, { bay: 110 });
    if (ph) {   // 밑돌: 문 자리는 비운다
      let a = 0; const segs = []; for (const d of [...dh].sort((p, q) => p.u0 - q.u0)) { segs.push([a, d.u0 - 9]); a = d.u1 + 9; } segs.push([a, len]);
      for (const [p, q] of segs) if (q - p > 2) F.box(G, 'stone', p, q, y0, base + ph, 0, 4.5, { faces: 'FLRT', top: 'trimstone', vary: 0.1 });
    }
    for (const cy of K.courses ?? []) F.box(G, 'trimstone', 0, len, y0 + cy - 4.5, y0 + cy + 4.5, 0, 3.2, { faces: 'FLRT', vary: 0 });
    if (K.quoins) for (const end of [0, 1]) for (let yy = base + ph, i = 0; yy + 20 < (yJ ?? y1) - 6; yy += 22, i++) {
      const wd = i % 2 ? 15 : 25; F.box(G, 'trimstone', end ? len - wd : 0, end ? len : wd, yy + 1, yy + 21, 0, 2.6, { faces: 'FLRT', vary: 0.12 });
    }
    for (const b of featsOf(K, 'buttress', side)) {   // 버팀벽: 두 단 + 비스듬한 머리
      const bw = (b.w ?? 36) / 2, d1 = b.d ?? 24, h1 = b.h * 0.55, d2 = d1 * 0.55, mat = b.mat ?? 'stone';
      F.box(G, mat, b.u - bw, b.u + bw, y0, y0 + h1, 0, d1, { faces: 'FLR' });
      G.quad4('trimstone', F.pt(b.u - bw, y0 + h1, d1), F.pt(b.u + bw, y0 + h1, d1), F.pt(b.u + bw, y0 + h1 + 14, d2), F.pt(b.u - bw, y0 + h1 + 14, d2), [F.nx * 0.6, 0.8, F.nz * 0.6], { vary: 0 });
      F.box(G, mat, b.u - bw, b.u + bw, y0 + h1, y0 + b.h, 0, d2, { faces: 'FLR' });
      G.quad4('trimstone', F.pt(b.u - bw, y0 + b.h, d2), F.pt(b.u + bw, y0 + b.h, d2), F.pt(b.u + bw, y0 + b.h + 16, 0), F.pt(b.u - bw, y0 + b.h + 16, 0), [F.nx * 0.6, 0.8, F.nz * 0.6], { vary: 0 });
    }
    for (const s of wins) windowAt(G, F, s, yJ && s.y >= yJ ? jet : 0, yJ && s.y >= yJ ? upper : lower);
    for (const s of doors) doorAt(G, F, s, 0, base, lower, boxes);
    if (K.cornice ?? (style === 'stone' || style === 'rubble')) F.box(G, 'trimstone', -5, len + 5, y1 - 13, y1, 0, 6, { faces: 'FLRT', vary: 0.08 });
    if (K.coping) F.box(G, 'trimstone', -3, len + 3, y1, y1 + 6, -3, 3.5, { faces: 'FLRT', vary: 0.1 });
    for (const g of featsOf(K, 'gates', side)) gate(G, F, g, base, lower);
  }
  G.shade = null;
  // 윗면 · 성가퀴
  if (!K.noTop) {
    G.quad(style === 'low' ? 'trimstone' : 'stone', [P.x - (K.coping ? 3 : 0), y1 + (K.coping ? 6 : 0), P.z - (K.coping ? 3 : 0)], [P.w + (K.coping ? 6 : 0), 0, 0], [0, 0, P.d + (K.coping ? 6 : 0)], [0, 1, 0], { cell: 80, k: 0.95 });
  }
  if (K.battlement) for (const side of K.faces ?? 'FLR') {
    const [F, len] = FS[side], n = Math.max(2, Math.round(len / 46));
    for (let i = 0; i < n; i++) if (i % 2 === 0) F.box(G, lower, len * i / n, len * (i + 1) / n, y1, y1 + 24, -16, 6, { faces: 'FLRT', top: 'trimstone', vary: 0.1 });
  }
  if (K.rail) for (const side of K.rail) { const [F, len] = FS[side]; railing(G, F, 4, len - 4, y1 + (K.coping ? 6 : 0), K.railH ?? 38, -(side === 'F' ? P.d : P.w) / 2); }
  // 낮은 담의 기둥. FENCE (11-18): a pier goes through the wall's thickness, so it is drawn only on the faces the wall runs along (on the short end
  // face of a deep wall it was a fin as long as the wall, 11 out over the side the hero walks along); the end piers stand flush with the wall's ends
  const sides = [...(K.faces ?? 'FLR')], runs = (s) => FS[s][1] >= (s === 'F' ? P.d : P.w), pierSides = sides.some(runs) ? sides.filter(runs) : sides;
  if (K.piers) for (const side of pierSides) {
    const [F, len] = FS[side], n = Math.max(1, Math.round(len / K.piers)), th = side === 'F' ? P.d : P.w;
    for (let i = 0; i <= n; i++) { const u = len * i / n; F.box(G, 'stone', Math.max(0, u - 11), Math.min(len, u + 11), y0, y1 + 16, -th - 4, 5, { faces: 'FLRT', top: 'trimstone' }); F.box(G, 'trimstone', Math.max(-3, u - 14), Math.min(len + 3, u + 14), y1 + 16, y1 + 22, -th - 7, 8, { faces: 'FLRT', vary: 0 }); }
  }
  G.tintMul = null;
  // FENCE: a low wall holds the hero where its piers, pier caps and coping are drawn, not at its plain box (the body circle went 5-14 into them)
  if (boxes && (style === 'low' || K.piers || K.rail)) {
    let ex0 = P.x, ex1 = P.x + P.w, ez0 = P.z, ez1 = P.z + P.d;
    const env = (F, u0, u1, w0, w1) => { for (const [u, w] of [[u0, w0], [u1, w0], [u0, w1], [u1, w1]]) { const p = F.pt(u, 0, w); ex0 = Math.min(ex0, p[0]); ex1 = Math.max(ex1, p[0]); ez0 = Math.min(ez0, p[2]); ez1 = Math.max(ez1, p[2]); } };
    if (K.coping) { ex0 -= 3; ex1 += 3; ez0 -= 3; ez1 += 3; for (const side of sides) env(FS[side][0], -3, FS[side][1] + 3, -3, 3.5); }
    if (K.piers) for (const side of pierSides) env(FS[side][0], -3, FS[side][1] + 3, -(side === 'F' ? P.d : P.w) - 7, 8);
    if (ex0 < P.x || ex1 > P.x + P.w || ez0 < P.z || ez1 > P.z + P.d) boxes.push({ x0: ex0, x1: ex1, z0: ez0, z1: ez1, y0, y1: Math.max(y0 + (P.collideH ?? 0), y1 + (K.piers ? 22 : 6)), solid: true, walk: false, inv: true, kit: true, part: P });
  }
}

/** 스테이지 줄 t:'fence' 한 줄 (x0,z0 → x1,z1, y, h, kind 'iron'｜'wood', face): 쇠 난간 또는 나무 울타리 */
export function fenceAt(G, P, boxes) {
  const y = P.y ?? 0, dx = P.x1 - P.x0, dz = P.z1 - P.z0, len = Math.hypot(dx, dz), nx = P.face?.[0] ?? dz / len, nz = P.face?.[1] ?? -dx / len, F = new Frame(P.x0, P.z0, nx, nz);
  const sgn = (F.ux * dx + F.uz * dz) >= 0 ? 1 : -1, F2 = sgn > 0 ? F : new Frame(P.x1, P.z1, nx, nz);
  (P.kind === 'wood' ? woodFence : railing)(G, F2, 0, len, y, P.h ?? 44, 0);
  // FENCE (11-18): the fence itself collides where its posts and caps are drawn (half-width 3.6 iron / 3.5 wood, the end posts beyond the ends).
  // It was drawn only: the hero stopped at the area's edge 9 units behind it and the bars ran through his legs. As tall as a low wall's collision
  // (collideH 800), so no jump lands inside it. A slanted fence gets a chain of boxes 8 long.
  if (boxes) {
    const hw = P.kind === 'wood' ? 3.5 : 3.6, n = Math.abs(F2.ux) < 1e-6 || Math.abs(F2.uz) < 1e-6 ? 1 : Math.ceil(len / 8);
    for (let i = 0; i < n; i++) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const u of [len * i / n - (i ? 0 : hw), len * (i + 1) / n + (i === n - 1 ? hw : 0)]) for (const w of [-hw, hw]) { const p = F2.pt(u, y, w); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
      boxes.push({ x0, x1, z0, z1, y0: y - 2, y1: y + (P.collideH ?? 800), solid: true, walk: false, inv: true, kit: true, part: P });
    }
  }
}
/** 쇠 난간: 기둥 + 위아래 가로대 + 창살 (끝이 뾰족하다) */
export function railing(G, F, u0, u1, y, h, w = 0, o = {}) {
  const M = { k: o.k ?? 0.9, vary: 0 }, n = Math.max(1, Math.round((u1 - u0) / 64));
  F.box(G, 'metal', u0, u1, y + h - 8, y + h - 3.5, w - 1.6, w + 1.6, { ...M, faces: 'FT' }); F.box(G, 'metal', u0, u1, y + 3.5, y + 8, w - 1.6, w + 1.6, { ...M, faces: 'FT' });
  for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; F.box(G, 'metal', u - 2.4, u + 2.4, y, y + h + 3, w - 2.4, w + 2.4, { ...M, faces: 'FLRT' }); F.box(G, 'metal', u - 3.6, u + 3.6, y + h + 3, y + h + 8, w - 3.6, w + 3.6, { ...M, faces: 'FLRT', k: 1.1 }); }
  const step = o.step ?? 14;   // 창살은 굵게·성기게 (가는 창살은 안티에일리어싱 없는 화면에서 톱니로 보였다)
  for (let u = u0 + step; u < u1 - 2; u += step) {
    F.box(G, 'metal', u - 1.7, u + 1.7, y + 5, y + h, w - 1.4, w + 1.4, { ...M, faces: 'FLR' });
    G.tri('metal', F.pt(u - 3.2, y + h, w), F.pt(u + 3.2, y + h, w), F.pt(u, y + h + 9, w), F.n, M);
  }
}
/** 나무 울타리: 기둥 + 가로 널 두 줄 + 뾰족 말뚝 */
export function woodFence(G, F, u0, u1, y, h, w = 0) {
  const n = Math.max(1, Math.round((u1 - u0) / 56)), T = { tint: [0.9, 0.78, 0.66], vary: 0.3 };
  for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; F.box(G, 'wood', u - 3.5, u + 3.5, y, y + h + 4, w - 3.5, w + 3.5, { ...T, faces: 'FLRT' }); }
  for (const fy of [0.3, 0.72]) F.box(G, 'wood', u0, u1, y + h * fy - 3, y + h * fy + 3, w - 1, w + 1.6, { ...T, faces: 'FT' });
  for (let u = u0 + 8, i = 0; u < u1 - 6; u += 13, i++) {
    const hh = h * (0.92 + 0.14 * hash(u, i)), lean = (hash(i, u) - 0.5) * 3;
    G.quad4('wood', F.pt(u - 4, y, w + 2), F.pt(u + 4, y, w + 2), F.pt(u + 4 + lean, y + hh - 6, w + 2), F.pt(u - 4 + lean, y + hh - 6, w + 2), F.n, { ...T, k: 0.85 + 0.3 * hash(u, 3) });
    G.tri('wood', F.pt(u - 4 + lean, y + hh - 6, w + 2), F.pt(u + 4 + lean, y + hh - 6, w + 2), F.pt(u + lean, y + hh + 3, w + 2), F.n, T);
  }
}

/** 성문: 깊은 아치 속의 내림 쇠창살. g = {u,w,h} */
export function gate(G, F, g, yb, wallMat) {
  const hw = g.w / 2, u0 = g.u - hw, u1 = g.u + hw, d = g.depth ?? 34, rise = hw * 0.8, yS = yb + g.h - rise, y1 = yb + g.h, dk = { k: 0.42, vary: 0 };
  // 벽면 위에 어두운 구멍을 '덧붙여' 그린다(벽을 뚫지 않는다): 안쪽 면을 벽 앞 0.5 에 두고 아치 밖은 벽 재질로 다시 덮는다
  F.face(G, 'stone', u0, u1, yb, y1, 0.5, { k: 0.16, vary: 0, tint: [0.5, 0.55, 0.8] });
  spandrels(G, F, wallMat, g.u, hw, yS, rise, 'point', 0.9, {});
  for (let u = u0 + 9; u < u1 - 4; u += 15) F.box(G, 'metal', u - 2, u + 2, yb, y1, 0.6, 3.4, { faces: 'FLR', k: 0.8, vary: 0 });
  for (let y = yb + 20; y < y1 - 8; y += 26) F.box(G, 'metal', u0, u1, y - 2, y + 2, 0.6, 3.8, { faces: 'FT', k: 0.85, vary: 0 });
  for (let u = u0 + 9; u < u1 - 4; u += 15) G.tri('metal', F.pt(u - 3.5, yb + 9, 3.5), F.pt(u + 3.5, yb + 9, 3.5), F.pt(u, yb, 3.5), F.n, { k: 0.9, vary: 0 });
  archBand(G, F, 'trimstone', g.u, hw, yS, rise, 'point', 4.5, 14);
  for (const sg of [-1, 1]) {   // 문 양옆 버팀 기둥
    const c = g.u + sg * (hw + 22);
    F.box(G, 'stone', c - 18, c + 18, yb, yS + 30, 0, d * 0.6, { faces: 'FLRT', top: 'trimstone' }); F.box(G, 'trimstone', c - 21, c + 21, yb, yb + 16, 0, d * 0.6 + 3, { faces: 'FLRT', vary: 0 });
  }
  void dk;
}

/** 맞배지붕. P = B 의 roof part (+ kit:{chimneys:[{u,t,w,h}], dormers:[{u,w,lit}], gable}) */
export function dressRoof(G, P) {
  const K = P.kit ?? {}, y = P.y, ov = P.over ?? 16, x0 = P.x - ov, x1 = P.x + P.w + ov, z0 = P.z - ov, zm = P.z + P.d / 2, dz = zm - z0, l = Math.hypot(P.h, dz);
  const h = P.h, n = [0, dz / l, -h / l], ye = y - ov * h / (P.d / 2);   // 처마 끝은 벽 위보다 조금 낮다
  const hh = y + h - ye, sl = [0, hh, dz], nl = Math.hypot(hh, dz), nn = [0, dz / nl, -hh / nl];
  G.tintMul = K.tint ?? null;
  G.quad(K.mat ?? 'slate', [x0, ye, z0], [x1 - x0, 0, 0], sl, nn, { cell: 56, vary: 0.3, shade: (px, py) => 0.82 + 0.18 * sm(0, 30, py - ye) });
  G.quad('timber', [x0, ye - 7, z0], [x1 - x0, 0, 0], [0, 7, 0], [0, 0, -1], { k: 0.7, vary: 0.2 });                        // 처마 널
  G.quad('timber', [x0, ye - 7, z0], [x1 - x0, 0, 0], [0, 0, ov], [0, -1, 0], { k: 0.35, vary: 0, keep: true, underY: 0 });   // 처마 밑
  G.box('stone', x0 - 2, y + h - 3, zm - 5, x1 + 2, y + h + 4, zm + 5, { faces: 'FLRT', k: 0.8, tint: [0.7, 0.72, 0.9], vary: 0 });   // 용마루
  for (const [gx, sx] of [[P.x, -1], [P.x + P.w, 1]]) {   // 박공 벽 + 박공널
    G.tri(K.gable ?? 'plaster', [gx, y, P.z], [gx, y, P.z + P.d], [gx, y + h, zm], [sx, 0, 0], { shade: (px, py) => 0.7 + 0.3 * sm(0, 40, y + h - py) });
    const ex = gx + sx * ov;
    G.quad4('timber', [ex, ye - 7, z0], [ex, y + h - 7, zm], [ex, y + h + 1, zm], [ex, ye + 1, z0], [sx, 0, 0], { k: 0.75, vary: 0.2, rot: true });
    G.quad('timber', [gx, y - 1, P.z], [0, 0, P.d], [0, 6, 0], [sx, 0, 0], { k: 0.8 });
    G.quad4('timber', [gx, y + h * 0.1, zm - 4], [gx, y + h * 0.1, zm + 4], [gx, y + h, zm + 4], [gx, y + h, zm - 4], [sx, 0, 0], { k: 0.85, vary: 0 });
  }
  const yAt = (z) => ye + (z - z0) * hh / dz;
  for (const c of K.chimneys ?? []) {   // 굴뚝: 몸통 + 갓돌 + 연통
    const cx = P.x + c.u, cz = z0 + dz * (c.t ?? 0.7), w = (c.w ?? 28) / 2, top = y + h + (c.h ?? 34);
    G.box(K.chimney ?? 'rubble', cx - w, yAt(cz - w) - 2, cz - w, cx + w, top, cz + w, { faces: 'FLR', tint: [0.95, 0.8, 0.78], vary: 0.2 });
    G.box('trimstone', cx - w - 3, top, cz - w - 3, cx + w + 3, top + 6, cz + w + 3, { faces: 'FLRT', vary: 0 });
    for (const dx of w > 12 ? [-w * 0.45, w * 0.45] : [0]) G.lathe(K.chimney ?? 'rubble', cx + dx, cz, [[5, top + 6], [4.2, top + 20], [5, top + 21]], 6, { tint: [0.9, 0.62, 0.5], cap: 'stone', capK: 0.2, vary: 0 });
  }
  for (const d of K.dormers ?? []) {   // 지붕창: 앞벽 + 작은 맞배 + 볼
    const w = (d.w ?? 46) / 2, cx = P.x + d.u, zf = z0 + dz * (d.t ?? 0.3), yb = yAt(zf), wh = d.h ?? 30, gh = w * 0.75, yE = yb + wh, yR = yE + gh;
    const zE = z0 + (yE - ye) * dz / hh, zR = Math.min(zm, z0 + (yR - ye) * dz / hh), F = new Frame(cx - w, zf, 0, -1);
    const win = { u: w, y: yb + 5, w: w * 1.1, h: wh - 6, lit: d.lit ?? 0, frame: 'timber', depth: 4, cols: 2, rows: 1 };
    wallGrid(G, F, 'plaster', 0, w * 2, yb, yE, 0, [{ u0: win.u - win.w / 2, u1: win.u + win.w / 2, y0: win.y, y1: win.y + win.h }], { cell: 200 });
    windowAt(G, F, win, 0, 'plaster');
    G.tri('plaster', [cx - w, yE, zf], [cx + w, yE, zf], [cx, yR, zf], [0, 0, -1], { k: 0.92 });
    for (const sx of [-1, 1]) {
      G.tri('plaster', [cx + sx * w, yb, zf], [cx + sx * w, yE, zf], [cx + sx * w, yE, zE], [sx, 0, 0], { k: 0.85 });
      G.quad4(K.mat ?? 'slate', [cx + sx * (w + 5), yE - 3, zf - 5], [cx, yR, zf - 5], [cx, yR, zR], [cx + sx * (w + 5), yE - 3, zE], [sx * 0.6, 0.8, 0], { vary: 0.25, ua: [0, 0, 1], va: [-sx * 0.8, 0.6, 0] });
      G.quad4('timber', [cx + sx * (w + 5), yE - 8, zf - 5.5], [cx, yR - 5, zf - 5.5], [cx, yR, zf - 5.5], [cx + sx * (w + 5), yE - 3, zf - 5.5], [0, 0, -1], { k: 0.8, vary: 0, rot: true });
    }
  }
  G.tintMul = null;
}

/** 바닥 판: 윗면(띠별 재질) + 옆면(어두운 돌). P.kit.strips = [{x0,x1,z0,z1(판 기준 상대값, 생략 = 끝까지), mat}] */
export function dressFloor(G, P, W) {
  const y = P.y ?? 0, K = P.kit ?? {}, mat = K.mat ?? { cobble: 'cobble', dirt: 'dirt', stone: 'flags' }[P.mat ?? 'cobble'] ?? 'cobble';
  const x0 = P.x, x1 = P.x + P.w, z0 = P.z, z1 = P.z + P.d, C = K.cell ?? 36;
  const st = (K.strips ?? []).map((s) => ({ x0: x0 + (s.x0 ?? 0), x1: x0 + (s.x1 ?? P.w), z0: z0 + (s.z0 ?? 0), z1: z0 + (s.z1 ?? P.d), mat: s.mat, rag: s.rag ?? K.rag ?? 0 }));
  // rag > 0: 띠의 가장자리를 들쭉날쭉하게 (자로 그은 듯한 흙·판석 네모를 없앤다). 가장자리에서 rag 안쪽의 칸은 잡음에 따라 띠에 들거나 빠진다
  const inStrip = (q, cx, cz) => { if (!q.rag) return cx > q.x0 && cx < q.x1 && cz > q.z0 && cz < q.z1; const e = q.rag * (vnoise(cx / 70 + 3.3, cz / 70 + 9.1) * 1.6 - 0.8 + (hash(cx, cz) - 0.5) * 0.7); return cx > q.x0 - (q.x0 > x0 + 1 ? e : -1) && cx < q.x1 + (q.x1 < x1 - 1 ? e : -1) && cz > q.z0 - (q.z0 > z0 + 1 ? e : -1) && cz < q.z1 + (q.z1 < z1 - 1 ? e : -1); };
  const cuts = (a, b, ex) => { const s = [a, b]; for (const e of ex) if (e > a + 1 && e < b - 1 && !s.some((q) => Math.abs(q - e) < 1)) s.push(e); const n = Math.max(1, Math.round((b - a) / C)); for (let i = 1; i < n; i++) { const c = a + (b - a) * i / n; if (!s.some((q) => Math.abs(q - c) < C * 0.35)) s.push(c); } return s.sort((p, q) => p - q); };
  const xs = cuts(x0, x1, st.flatMap((s) => [s.x0, s.x1])), zs = cuts(z0, z1, st.flatMap((s) => [s.z0, s.z1]));
  // 벽·단상·기둥 밑동 가까이는 어둡게 (닿는 곳의 그늘)
  const tall = W.boxes.filter((b) => !b.inv && b.y1 > y + 24 && b.y0 < y + 12);
  const ao = (px, py, pz) => { let d = 99; for (const b of tall) { const dx = Math.max(b.x0 - px, px - b.x1, 0), dzz = Math.max(b.z0 - pz, pz - b.z1, 0), q = dx > dzz ? dx + dzz * 0.4 : dzz + dx * 0.4; if (q < d) d = q; } return 0.5 + 0.5 * sm(0, 46, d); };
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2, s = st.find((q) => inStrip(q, cx, cz));
    G.quad(s ? s.mat : mat, [xs[i], y, zs[j]], [xs[i + 1] - xs[i], 0, 0], [0, 0, zs[j + 1] - zs[j]], [0, 1, 0], { shade: ao, vary: 0.22 });
  }
  if (P.walk === false && !K.sides) return;
  const sd = { cell: 64, k: 0.55, vary: 0.1 }, t = P.thick ?? 220;
  G.quad('stone', [x0, y - t, z0], [P.w, 0, 0], [0, t, 0], [0, 0, -1], sd);
  G.quad('stone', [x0, y - t, z1], [0, 0, -P.d], [0, t, 0], [-1, 0, 0], sd);
  G.quad('stone', [x1, y - t, z0], [0, 0, P.d], [0, t, 0], [1, 0, 0], sd);
}

/** 올린 보도: 판석 윗면 + 연석 + 도랑. P = {x,z,w,d,h, kerb:'F'|'L'|'R'…(연석을 두를 변)} → 밟는 상자를 돌려준다 */
export function pave(G, P, W) {
  const y = P.y ?? 0, h = P.h ?? 7, x0 = P.x, x1 = P.x + P.w, z0 = P.z, z1 = P.z + P.d, kerb = P.kerb ?? 'F';
  dressFloor(G, { x: x0, z: z0, w: P.w, d: P.d, y: y + h, walk: false, kit: { mat: P.mat ?? 'flags', cell: 44 } }, W);
  const side = { F: [new Frame(x0, z0, 0, -1), P.w], L: [new Frame(x0, z1, -1, 0), P.d], R: [new Frame(x1, z0, 1, 0), P.d] };
  for (const s of kerb) {
    const [F, len] = side[s];
    for (let u = 0, i = 0; u < len; i++) { const w = Math.min(len - u, 38 + 16 * hash(u, i + x0)); F.box(G, 'trimstone', u + 0.6, u + w - 0.6, y, y + h + 1.2, -7, 1.5, { faces: 'FLRT', k: 0.9 + 0.2 * hash(i, u), vary: 0 }); u += w; }
    G.quad('stone', F.pt(0, y + 0.4, 1.5 + 9), F.vec(len, 0, 0), F.vec(0, 0, -9), [0, 1, 0], { k: 0.5, vary: 0.1, cell: 80 });   // 도랑 (젖어 어두운 돌)
  }
  return { x0, x1, z0, z1, y0: y - 2, y1: y + h, solid: true, walk: true, kit: true };
}

/** 돌 단상 (B 의 block): 몸통 + 밑단 + 윗 갓돌 + (뒤쪽) 난간동자 */
export function dressBlock(G, P, W, boxes) {
  const y0 = P.y ?? 0, y1 = y0 + P.h, x0 = P.x, x1 = P.x + P.w, z0 = P.z, z1 = P.z + P.d, K = P.kit ?? {};
  G.shade = (x, y) => 0.6 + 0.4 * sm(0, 40, y - y0);
  G.box(K.mat ?? 'ashlar', x0, y0, z0, x1, y1 - 7, z1, { faces: 'FLR', cell: 40 });
  G.box('stone', x0 - 3, y0, z0 - 3, x1 + 3, y0 + 11, z1, { faces: 'FLRT', top: 'trimstone', cell: 80 });
  G.shade = null;
  G.box('trimstone', x0 - 3.5, y1 - 7, z0 - 3.5, x1 + 3.5, y1, z1, { faces: 'FLR', vary: 0.1, cell: 80 });
  dressFloor(G, { x: x0 - 3.5, z: z0 - 3.5, w: P.w + 7, d: P.d + 3.5, y: y1, walk: false, kit: { mat: K.top ?? 'flags', cell: 40 } }, W);
  if (K.balustrade) balustrade(G, P, boxes);
}
/** 단상의 뒤 가장자리 난간 (dressBlock 의 kit.balustrade) */
export function balustrade(G, P, boxes) {
  const x0 = P.x, z1 = P.z + P.d, y1 = (P.y ?? 0) + P.h;
  // FENCE (11-18): the balustrade collides where its end posts and rails are drawn (it had none: the hero on the block stood in it); tall, so no jump lands in it
  if (boxes) boxes.push({ x0: x0 - 7, x1: x0 + P.w + 7, z0: z1 - 12, z1: z1 + 2, y0: y1, y1: y1 + 800, solid: true, walk: false, inv: true, kit: true, part: P });
  const F = new Frame(x0, z1 - 5, 0, -1), h = 34;
  F.box(G, 'trimstone', 0, P.w, y1 + h - 6, y1 + h, -4, 4, { faces: 'FLRT', vary: 0.05 }); F.box(G, 'trimstone', 0, P.w, y1, y1 + 4, -3, 3, { faces: 'FLRT', vary: 0.05 });
  for (let u = 12; u < P.w - 6; u += 22) G.lathe('trimstone', x0 + u, z1 - 5, [[3.2, y1 + 4], [4.6, y1 + 11], [2.4, y1 + 20], [3.4, y1 + h - 6]], 6, { vary: 0 });
  for (const u of [0, P.w]) { G.box('stone', x0 + u - 7, y1, z1 - 11, x0 + u + 7, y1 + h + 6, z1 + 1, { faces: 'FLRT', top: 'trimstone' }); G.lathe('trimstone', x0 + u, z1 - 5, [[6, y1 + h + 6], [7, y1 + h + 11], [0, y1 + h + 20]], 6, { vary: 0 }); }
}

/** 계단 (B 의 stairs): 칸마다 디딤판(밝은 돌)·챌판 + 옆 벽(cheeks: 'L','R','K' — 계단 진행 방향 기준이 아니라 세계 기준 변) */
export function dressStairs(G, P, boxes) {
  const n = P.steps ?? Math.max(2, Math.round(P.h / 12)), y = P.y ?? 0, K = P.kit ?? {};
  for (let i = 0; i < n; i++) {
    const a = i / n, c = (i + 1) / n, hh = P.h * c, lo = y + P.h * a;
    let x0 = P.x, x1 = P.x + P.w, z0 = P.z, z1 = P.z + P.d;
    if (P.dir === 'x+') { x0 = P.x + P.w * a; x1 = P.x + P.w * c; } else if (P.dir === 'x-') { x0 = P.x + P.w * (1 - c); x1 = P.x + P.w * (1 - a); } else if (P.dir === 'z+') { z0 = P.z + P.d * a; z1 = P.z + P.d * c; } else { z0 = P.z + P.d * (1 - c); z1 = P.z + P.d * (1 - a); }
    const run = P.dir[0] === 'x' ? 'L' : 'F', sideF = P.dir[0] === 'x' ? 'F' : 'LR';
    G.box(K.mat ?? 'stone', x0, P.dir[0] === 'x' ? y : lo, z0, x1, y + hh - 3, z1, { faces: (P.dir.endsWith('+') ? run : P.dir[0] === 'x' ? 'R' : '') + sideF, k: 0.82, cell: 70 });   // kit.mat / kit.tread: a wooden flight (darkwood + wood)
    G.box(K.tread ?? 'trimstone', x0 - (P.dir === 'x+' ? 1.5 : 0), y + hh - 3, z0 - (P.dir === 'z+' ? 1.5 : 0), x1, y + hh, z1, { faces: 'FLRT', cell: 70, vary: 0.12, shade: (px, py, pz, nn) => (nn[1] > 0.5 ? 0.86 + 0.14 * sm(0, 14, P.dir === 'z+' ? z1 - pz : P.dir === 'x+' ? x1 - px : 9) : 1) });
  }
  stairCheeks(G, P, boxes);
}
/** 계단의 옆 벽 (dressStairs 의 kit.cheeks): 계단을 따라 비스듬히 오르는 낮은 담 + 갓돌 + 끝 기둥 */
export function stairCheeks(G, P, boxes) {
  const y = P.y ?? 0, K = P.kit ?? {}, T = 9, hRail = K.cheekH ?? 30;
  // FENCE (11-18): a cheek collides where it is drawn, end posts included (it had none: the hero walked through it onto the flight from the side,
  // and on the flight it ran through his body). As tall as a low wall's collision: a jump over its 40-high top post landed inside it.
  const box = (x0, x1, z0, z1) => boxes?.push({ x0, x1, z0, z1, y0: y, y1: y + P.h + 800, solid: true, walk: false, inv: true, kit: true, part: P });
  for (const s of K.cheeks ?? '') {
    if (P.dir === 'z+' && (s === 'L' || s === 'R')) {
      const xa = s === 'L' ? P.x : P.x + P.w - T, xb = xa + T, nx = s === 'L' ? 1 : -1, xf = s === 'L' ? xb : xa;
      box(xa - 2, xb + 2, P.z - 12, P.z + P.d + 12);
      G.quad4('stone', [xf, y, P.z], [xf, y + P.h, P.z + P.d], [xf, y + P.h + hRail, P.z + P.d], [xf, y + hRail, P.z], [nx, 0, 0], { k: 0.9 });
      G.quad4('trimstone', [xa - 1, y + hRail, P.z], [xb + 1, y + hRail, P.z], [xb + 1, y + P.h + hRail, P.z + P.d], [xa - 1, y + P.h + hRail, P.z + P.d], [0, 0.9, -0.43], { vary: 0.05 });
      G.box('stone', xa - 2, y, P.z - 12, xb + 2, y + hRail + 10, P.z + 2, { faces: 'FLRT', top: 'trimstone' });
      G.box('stone', xa - 2, y + P.h, P.z + P.d - 2, xb + 2, y + P.h + hRail + 10, P.z + P.d + 12, { faces: 'FLRT', top: 'trimstone' });
    } else if (P.dir === 'x+' && s === 'K') {
      const za = P.z + P.d, zb = za + T;
      box(P.x - 12, P.x + P.w, za - 2, zb);
      G.quad4('stone', [P.x, y, za], [P.x + P.w, y + P.h, za], [P.x + P.w, y + P.h + hRail, za], [P.x, y + hRail, za], [0, 0, -1], { k: 0.9 });
      G.quad4('trimstone', [P.x, y + hRail, za - 1], [P.x + P.w, y + P.h + hRail, za - 1], [P.x + P.w, y + P.h + hRail, zb], [P.x, y + hRail, zb], [-0.5, 0.86, 0], { vary: 0.05 });
      G.box('stone', P.x - 12, y, za - 2, P.x + 2, y + hRail + 10, zb, { faces: 'FLRT', top: 'trimstone' });
    }
  }
}

/** 돌기둥 (B 의 pillar): 네모 주춧돌 + 배흘림 몸통 + 머릿돌 */
export function dressPillar(G, P) {
  const y = P.y ?? 0, r = P.r, h = P.h, x = P.x, z = P.z;
  G.shade = (px, py) => 0.6 + 0.4 * sm(0, 50, py - y);
  G.box('stone', x - r * 1.3, y, z - r * 1.3, x + r * 1.3, y + 12, z + r * 1.3, { faces: 'FLRT', top: 'trimstone' });
  G.lathe('trimstone', x, z, [[r * 1.18, y + 12], [r * 1.02, y + 20], [r, y + 24]], 10, { vary: 0 });
  G.lathe('ashlar', x, z, [[r, y + 24], [r * 0.97, y + h * 0.5], [r * 0.9, y + h - 26]], 10, { vary: 0.2 });
  G.lathe('trimstone', x, z, [[r * 0.9, y + h - 26], [r * 0.98, y + h - 22], [r * 0.92, y + h - 18], [r * 1.25, y + h - 9]], 10, { vary: 0 });
  G.shade = null;
  G.box('trimstone', x - r * 1.32, y + h - 9, z - r * 1.32, x + r * 1.32, y + h, z + r * 1.32, { faces: 'FLRT' });
}

/** 골목을 가로지르는 아치 다리 (충돌 없음). P = {x,z,w,d, y(아치 시작 높이), rise, h(벽 높이)} */
export function arch(G, P) {
  const F = new Frame(P.x, P.z, 0, -1), hw = P.w / 2, u = hw, yS = P.y, rise = P.rise ?? 40, top = yS + (P.h ?? 90), N = 12, A = archPts(u, yS, hw, rise, 'round', N);
  G.shade = (px, py) => 0.7 + 0.3 * sm(0, 50, py - yS);
  for (let i = 0; i < N; i++) {
    G.quad4('ashlar', F.pt(A[i][0], A[i][1], 0), F.pt(A[i + 1][0], A[i + 1][1], 0), F.pt(A[i + 1][0], top, 0), F.pt(A[i][0], top, 0), F.n, { ua: [1, 0, 0], va: [0, 1, 0] });
    const dx = A[i + 1][0] - A[i][0], dy = A[i + 1][1] - A[i][1], l = Math.hypot(dx, dy);
    G.quad4('stone', F.pt(A[i][0], A[i][1], 0), F.pt(A[i + 1][0], A[i + 1][1], 0), F.pt(A[i + 1][0], A[i + 1][1], -P.d), F.pt(A[i][0], A[i][1], -P.d), [dy / l, -dx / l, 0], { k: 0.5, keep: true, underY: 0 });   // 아치 밑면
  }
  G.shade = null;
  archBand(G, F, 'trimstone', u, hw, yS, rise, 'round', 1.2, 13);
  F.box(G, 'trimstone', -2, P.w + 2, top, top + 8, -P.d - 3, 4, { faces: 'FLRT' });
  for (let i = 0, n = Math.round(P.w / 44); i < n; i++) if (i % 2 === 0) F.box(G, 'ashlar', P.w * i / n, P.w * (i + 1) / n, top + 8, top + 28, -P.d, 2, { faces: 'FLRT', top: 'trimstone' });
  for (const uu of [0, P.w]) F.box(G, 'trimstone', uu - 14, uu + 14, yS - 34, yS, 0, 9, { faces: 'FLRT', vary: 0 });   // 받침돌
}
