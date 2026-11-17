// 환경 키트 — 기하 쓰기 도구 (순수 JS: DOM·GL 없음 → node 에서도 돈다). docs/v2/ENV_KIT.md §1
// 시범판 B 의 정점 형식(28바이트: 위치 3f · uv 2f · 색 4ub · 부가 4ub)으로 바로 쓴다 → B 의 glr.mesh()/drawMesh() 가 그대로 그린다.
// 빛은 꼭짓점마다 굽는다(B 의 lightAt: 달빛 + 주변광 + 점광) × 그늘(ao) × 재질 색 × 얼룩 잡음. 실행 중 빛 계산 0.
// 감기 규칙: 바깥에서 볼 때 du 가 오른쪽·dv 가 위 (B 와 같다: dv × du = 바깥 법선). 어긋나면 스스로 뒤집는다.
import { VERT_BYTES, lightAt } from '../b/world.js';
import { KMATS, TRIM } from './mats.js';

class Writer {
  constructor() { this.cap = 2048; this.n = 0; this.buf = new ArrayBuffer(this.cap * VERT_BYTES); this.f = new Float32Array(this.buf); this.u = new Uint8Array(this.buf); }
  vert(x, y, z, u, v, r, g, b, fog) {
    if (this.n >= this.cap) { const nb = new ArrayBuffer(this.cap * 2 * VERT_BYTES); new Uint8Array(nb).set(this.u); this.cap *= 2; this.buf = nb; this.f = new Float32Array(nb); this.u = new Uint8Array(nb); }
    const o = this.n * 7, c = this.n * VERT_BYTES + 20, f = this.f, q = this.u;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = u; f[o + 4] = v;
    q[c] = r <= 0 ? 0 : r >= 2 ? 255 : (r * 127.5 + 0.5) | 0; q[c + 1] = g <= 0 ? 0 : g >= 2 ? 255 : (g * 127.5 + 0.5) | 0; q[c + 2] = b <= 0 ? 0 : b >= 2 ? 255 : (b * 127.5 + 0.5) | 0; q[c + 3] = 128;
    q[c + 4] = 255; q[c + 5] = 0; q[c + 6] = 0; q[c + 7] = fog;
    this.n++;
  }
  done() { return { data: this.buf.slice(0, this.n * VERT_BYTES), count: this.n }; }
}

// 값 잡음 (얼룩 · 긴 벽이 되풀이되어 보이지 않게)
const h2 = (i, j) => { let n = (i * 374761393 + j * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
export function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h2(i, j), b = h2(i + 1, j), c = h2(i, j + 1), d = h2(i + 1, j + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
export const hash = (a, b = 0) => h2(Math.round(a * 13.7), Math.round(b * 7.3 + 91));
export const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class Geo {
  /** W: B 의 compileStage 결과 (light · lights 가 다 들어 있어야 한다 — 굽는 순간의 빛을 쓴다) */
  constructor(W, { cull = true } = {}) {
    this.W = W; this.chunk = 'main'; this.out = new Map(); this.cull = cull; this.tris = 0; this.bounds = new Map();
    this.shade = null;   // (x,y,z,n) → 배율: 지금 짓는 덩어리에 거는 그늘 (처마 밑 · 벽 밑동 …)
    this.tintMul = null; // [r,g,b] 지금 짓는 덩어리의 색조 (집마다 다르게)
    this.lift = false;   // true 면 구운 빛을 들어 올린다 (소품)
  }
  _wr(tex) { const k = this.chunk + '|' + tex; let w = this.out.get(k); if (!w) { w = new Writer(); w.chunk = this.chunk; w.tex = tex; this.out.set(k, w); } return w; }
  /** 꼭짓점 하나의 색 */
  _col(M, p, n, o) {
    if (o.emis) { const e = o.emis === true ? 1 : o.emis, t = o.tint ?? M.tint; return [t[0] * e, t[1] * e, t[2] * e]; }
    const c = lightAt(this.W, p[0] + n[0] * 2, p[1] + n[1] * 2, p[2] + n[2] * 2, n[0], n[1], n[2]);
    if (this.lift) { c[0] = Math.min(1.6, 0.42 + 0.72 * c[0]); c[1] = Math.min(1.6, 0.42 + 0.72 * c[1]); c[2] = Math.min(1.6, 0.42 + 0.72 * c[2]); }   // 소품은 캐릭터와 같은 식으로 밝힌다 (B 의 그림판 색조와 같은 생각 — 어두운 길에서도 장애물이 읽히게)
    let k = o.k ?? 1;
    if (this.shade) k *= this.shade(p[0], p[1], p[2], n);
    if (o.shade) k *= o.shade(p[0], p[1], p[2], n);
    if (p[1] < -1) k *= Math.max(0.1, 1 + p[1] / 170);                                   // 구덩이 속은 아래로 갈수록 어둡게 (B 와 같다)
    if (o.vary !== 0) { const a = o.vary ?? 0.16; k *= 1 - a * 0.5 + a * vnoise((p[0] + p[2] * 0.7) / 150 + 3.1, (p[1] + p[2] * 0.3) / 110 + 7.7); }
    const t = o.tint ?? M.tint, tm = this.tintMul;
    return tm && !o.noTintMul ? [c[0] * k * t[0] * tm[0], c[1] * k * t[1] * tm[1], c[2] * k * t[2] * tm[2]] : [c[0] * k * t[0], c[1] * k * t[1], c[2] * k * t[2]];
  }
  _emit(M, P, UV, N, o, flip) {
    const wr = this._wr(M.tex), fog = o.fog != null ? Math.round(o.fog * 255) : o.emis ? 190 : 255, n1 = Array.isArray(N[0]) ? null : N;
    let b = this.bounds.get(this.chunk); if (!b) { b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; this.bounds.set(this.chunk, b); }
    const C = P.map((p, i) => this._col(M, p, n1 ?? N[i], o));
    const idx = P.length === 3 ? (flip ? [0, 2, 1] : [0, 1, 2]) : (flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    for (const i of idx) {
      const p = P[i], c = C[i]; wr.vert(p[0], p[1], p[2], UV[i][0], UV[i][1], c[0], c[1], c[2], fog);
      if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[2] < b[2]) b[2] = p[2]; if (p[0] > b[3]) b[3] = p[0]; if (p[1] > b[4]) b[4] = p[1]; if (p[2] > b[5]) b[5] = p[2];
    }
    this.tris += idx.length / 3;
  }
  /** 보이지 않는 면은 만들지 않는다: 카메라는 늘 +z 쪽을 본다(요 ±25°) → 뒤를 보는 면 · (높지 않은 곳의) 밑면 */
  _hidden(n, y, o) { return this.cull && !o.keep && (n[2] > 0.62 || (n[1] < -0.7 && y < (o.underY ?? 210))); }
  /** uv: 반복 재질 = 세계에 고정한 평면 투영 (이웃 면과 무늬가 이어진다) / 조각 재질(TRIM) = 조각 안에 맞춘다 */
  _uvs(M, P, ua, va, o) {
    if (M.reg) {
      const R = TRIM[M.reg], T = M.tile, a = P[0];
      let lu = 0, lv = 0; const L = P.map((p) => { const d = sub(p, a), u = dot(d, ua), v = dot(d, va); lu = Math.max(lu, Math.abs(u)); lv = Math.max(lv, Math.abs(v)); return [u, v]; });
      const rot = o.rot ?? (M.grain && lu > lv * 1.5);   // 결이 있는 재질은 긴 쪽을 따라
      const su = Math.max(lu, T) , sv = Math.max(lv, T), ox = o.uo ?? 0, oy = o.vo ?? 0;
      return L.map(([u, v]) => { let s = Math.min(1, Math.abs(u) / su + ox * Math.max(0, 1 - lu / su)), t = Math.min(1, Math.abs(v) / sv + oy * Math.max(0, 1 - lv / sv)); if (rot) [s, t] = [t, s]; return [R[0] + s * (R[2] - R[0]), R[3] - t * (R[3] - R[1])]; });
    }
    const T = o.tile ?? M.tile, b = P[0], bu = Math.floor(dot(b, ua) / T), bv = Math.floor(-dot(b, va) / T);
    return P.map((p) => [dot(p, ua) / T - bu, -dot(p, va) / T - bv]);
  }
  /** 평행사변형 한 장. p = 왼아래, du = 오른쪽, dv = 위 (바깥에서 볼 때). o.cell > 0 이면 그 크기로 쪼개 빛을 곱게 굽는다 */
  quad(mat, p, du, dv, n, o = {}) {
    if (this._hidden(n, p[1] + dv[1] * 0.5, o)) return;
    const M = KMATS[mat]; if (!M) throw new Error('모르는 재질: ' + mat);
    const flip = dot(cross(dv, du), n) < 0, ua = norm(du), va = norm(dv);
    const lu = Math.hypot(du[0], du[1], du[2]), lv = Math.hypot(dv[0], dv[1], dv[2]), cell = M.reg ? 0 : (o.cell ?? 0);
    const nu = cell ? Math.max(1, Math.ceil(lu / cell - 0.01)) : 1, nv = cell ? Math.max(1, Math.ceil(lv / cell - 0.01)) : 1;
    const at = (s, t) => [p[0] + du[0] * s + dv[0] * t, p[1] + du[1] * s + dv[1] * t, p[2] + du[2] * s + dv[2] * t];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const P = [at(i / nu, j / nv), at((i + 1) / nu, j / nv), at((i + 1) / nu, (j + 1) / nv), at(i / nu, (j + 1) / nv)];
      this._emit(M, P, o.uv ? o.uv : this._uvs(M, P, ua, va, o), n, o, flip);
    }
  }
  /** 임의의 네 점 (a 왼아래 → b 오른아래 → c 오른위 → d 왼위). o.ns = 꼭짓점별 법선(둥근 면) */
  quad4(mat, a, b, c, d, n, o = {}) {
    if (this._hidden(n, (a[1] + c[1]) / 2, o)) return;
    const M = KMATS[mat]; if (!M) throw new Error('모르는 재질: ' + mat);
    const flip = dot(cross(sub(c, b), sub(b, a)), n) < 0, P = [a, b, c, d];
    const ua = o.ua ?? norm(sub(b, a)), va = o.va ?? norm(sub(d, a));
    this._emit(M, P, o.uv ?? this._uvs(M, P, ua, va, o), o.ns ?? n, o, flip);
  }
  tri(mat, a, b, c, n, o = {}) {
    if (this._hidden(n, (a[1] + b[1] + c[1]) / 3, o)) return;
    const M = KMATS[mat]; if (!M) throw new Error('모르는 재질: ' + mat);
    const flip = dot(cross(sub(c, b), sub(b, a)), n) < 0, P = [a, b, c];
    let ua = o.ua, va = o.va;
    if (!ua) { if (Math.abs(n[1]) > 0.7) { ua = [1, 0, 0]; va = [0, 0, 1]; } else { ua = norm([-n[2], 0, n[0]]); va = [0, 1, 0]; } }
    this._emit(M, P, o.uv ?? this._uvs(M, P, ua, va, o), o.ns ?? n, o, flip);
  }
  /** 볼록 다각형 (한 평면) → 부채꼴 삼각형 */
  poly(mat, pts, n, o = {}) {
    let ua = o.ua, va = o.va;
    if (!ua) { if (Math.abs(n[1]) > 0.7) { ua = [1, 0, 0]; va = [0, 0, 1]; } else { ua = norm([-n[2], 0, n[0]]); va = [0, 1, 0]; } }
    for (let i = 1; i + 1 < pts.length; i++) this.tri(mat, pts[0], pts[i], pts[i + 1], n, { ...o, ua, va });
  }
  /** 축 정렬 상자. faces: F(앞 −z) K(뒤 +z) L(−x) R(+x) T(위) B(밑) — 기본 'FLRT' */
  box(mat, x0, y0, z0, x1, y1, z1, o = {}) {
    const f = o.faces ?? 'FLRT', top = o.top ?? mat;
    if (f.includes('T')) this.quad(top, [x0, y1, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], [0, 1, 0], o);
    if (f.includes('F')) this.quad(mat, [x0, y0, z0], [x1 - x0, 0, 0], [0, y1 - y0, 0], [0, 0, -1], o);
    if (f.includes('L')) this.quad(mat, [x0, y0, z1], [0, 0, z0 - z1], [0, y1 - y0, 0], [-1, 0, 0], o);
    if (f.includes('R')) this.quad(mat, [x1, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0], [1, 0, 0], o);
    if (f.includes('K')) this.quad(mat, [x1, y0, z1], [x0 - x1, 0, 0], [0, y1 - y0, 0], [0, 0, 1], { ...o, keep: true });
    if (f.includes('B')) this.quad(mat, [x0, y0, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1], [0, -1, 0], { ...o, keep: true });
  }
  /** 회전체: prof = [[반지름, 높이], …] 아래→위. sides 각형. 뒤쪽 면은 만들지 않는다. o.cap = 맨 위를 덮는다, o.sq = z 방향 납작 비율 */
  lathe(mat, cx, cz, prof, sides = 8, o = {}) {
    const T = (KMATS[mat].tile ?? 128), sq = o.sq ?? 1, a0 = o.a0 ?? Math.PI / sides;
    const pt = (r, y, a) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r * sq];
    for (let i = 0; i < sides; i++) {
      const a = a0 + i * 2 * Math.PI / sides, b = a + 2 * Math.PI / sides, am = (a + b) / 2;
      if (this.cull && !o.keep && Math.sin(am) > 0.55) continue;
      for (let k = 0; k + 1 < prof.length; k++) {
        const [r0, y0] = prof[k], [r1, y1] = prof[k + 1];
        if (r0 < 0.01 && r1 < 0.01) continue;
        const sl = Math.atan2(r0 - r1, (y1 - y0) || 1e-6), cs = Math.cos(sl), sn = Math.sin(sl);   // 기울기 → 법선의 y 성분
        const nA = [Math.cos(a) * cs, sn, Math.sin(a) * cs], nB = [Math.cos(b) * cs, sn, Math.sin(b) * cs], nm = [Math.cos(am) * cs, sn, Math.sin(am) * cs];
        // 바깥에서 볼 때 오른쪽 = 각이 줄어드는 쪽
        const P = [pt(r0, y0, b), pt(r0, y0, a), pt(r1, y1, a), pt(r1, y1, b)];
        const rr = Math.max(r0, r1), u0 = (i + 1) * rr * 2 * Math.PI / sides / T, u1 = i * rr * 2 * Math.PI / sides / T;
        const M = KMATS[mat], uv = M.reg ? null : [[u0, -y0 / T], [u1, -y0 / T], [u1, -y1 / T], [u0, -y1 / T]];
        const oo = { ...o, uv: uv ?? undefined, ns: o.flat ? undefined : [nB, nA, nA, nB], keep: true };
        if (r1 < 0.01) this.tri(mat, P[0], P[1], P[2], nm, { ...oo, uv: uv ? [uv[0], uv[1], uv[2]] : undefined, ns: o.flat ? undefined : [nB, nA, nm] });
        else if (r0 < 0.01) this.tri(mat, P[0], P[2], P[3], nm, { ...oo, uv: uv ? [uv[0], uv[2], uv[3]] : undefined, ns: o.flat ? undefined : [nm, nA, nB] });
        else this.quad4(mat, P[0], P[1], P[2], P[3], nm, oo);
      }
    }
    if (o.cap) {   // 윗면 (다각형)
      const [r, y] = prof[prof.length - 1], pts = []; for (let i = 0; i < sides; i++) pts.push(pt(r, y, a0 + i * 2 * Math.PI / sides));
      this.poly(o.cap === true ? mat : o.cap, pts, [0, 1, 0], { ...o, uv: undefined, ns: undefined, keep: false, tint: o.capTint ?? o.tint, k: (o.k ?? 1) * (o.capK ?? 1), emis: o.capEmis });
    }
  }
  /** 두 점 사이의 가늘어지는 각기둥 (가지 · 다리 · 장대 · 손잡이). 어느 방향이든 */
  tube(mat, a, b, ra, rb, sides = 5, o = {}) {
    const ax = norm(sub(b, a)), ref = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], e1 = norm(cross(ax, ref)), e2 = cross(ax, e1);
    const ring = (c, r, i) => { const t = i * 2 * Math.PI / sides, cs = Math.cos(t), sn = Math.sin(t); return [[c[0] + (e1[0] * cs + e2[0] * sn) * r, c[1] + (e1[1] * cs + e2[1] * sn) * r, c[2] + (e1[2] * cs + e2[2] * sn) * r], [e1[0] * cs + e2[0] * sn, e1[1] * cs + e2[1] * sn, e1[2] * cs + e2[2] * sn]]; };
    for (let i = 0; i < sides; i++) {
      const [p0, n0] = ring(a, ra, i), [p1, n1] = ring(a, ra, i + 1), [q0] = ring(b, rb, i), [q1] = ring(b, rb, i + 1), nm = norm([n0[0] + n1[0], n0[1] + n1[1], n0[2] + n1[2]]);
      if (this.cull && !o.keep && nm[2] > 0.62) continue;
      if (rb < 0.01) this.tri(mat, p0, p1, q0, nm, { ...o, keep: true, ns: [n0, n1, nm] });
      else this.quad4(mat, p0, p1, q1, q0, nm, { ...o, keep: true, ns: [n0, n1, n1, n0], ua: ax, va: e1 });
    }
  }
  /**
   * 구운 소품의 삼각형 묶음 (src/v2/env/baked.js). V = [x,y,z, nx,ny,nz, u,v] × n (세계 좌표 · 바깥 법선 · 아틀라스 uv), I = 색인 (바깥에서 볼 때 반시계).
   * 꼭짓점마다 그 자리의 빛을 굽고, 카메라가 못 보는 뒤쪽 삼각형은 버린다.
   */
  mesh(mat, V, I, o = {}) {
    const M = KMATS[mat]; if (!M) throw new Error('모르는 재질: ' + mat);
    const wr = this._wr(M.tex), nv = V.length / 8, C = new Float32Array(nv * 3), done = new Uint8Array(nv), oo = { vary: 0, ...o };
    let b = this.bounds.get(this.chunk); if (!b) { b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; this.bounds.set(this.chunk, b); }
    const cull = this.cull && !o.keep;
    for (let t = 0; t < I.length; t += 3) {
      const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2], a = i0 * 8, c = i1 * 8, d = i2 * 8;
      if (cull) {   // 면 법선이 뒤(+z)를 보면 버린다
        const ux = V[c] - V[a], uy = V[c + 1] - V[a + 1], vx = V[d] - V[a], vy = V[d + 1] - V[a + 1], uz = V[c + 2] - V[a + 2], vz = V[d + 2] - V[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
        if (nz / l > 0.66) continue;
      }
      for (const i of [i0, i2, i1]) {   // 키트의 감기 규칙 (바깥에서 볼 때 시계)
        const q = i * 8;
        if (!done[i]) { const col = this._col(M, [V[q], V[q + 1], V[q + 2]], [V[q + 3], V[q + 4], V[q + 5]], oo); C[i * 3] = col[0]; C[i * 3 + 1] = col[1]; C[i * 3 + 2] = col[2]; done[i] = 1; }
        wr.vert(V[q], V[q + 1], V[q + 2], V[q + 6], V[q + 7], C[i * 3], C[i * 3 + 1], C[i * 3 + 2], 255);
        if (V[q] < b[0]) b[0] = V[q]; if (V[q + 1] < b[1]) b[1] = V[q + 1]; if (V[q + 2] < b[2]) b[2] = V[q + 2]; if (V[q] > b[3]) b[3] = V[q]; if (V[q + 1] > b[4]) b[4] = V[q + 1]; if (V[q + 2] > b[5]) b[5] = V[q + 2];
      }
      this.tris++;
    }
  }
  /** 굽기 끝: [{chunk, tex, data, count}] + 덩어리별 경계 상자 */
  done() {
    const meshes = []; for (const w of this.out.values()) if (w.n) meshes.push({ chunk: w.chunk, tex: w.tex, ...w.done() });
    return { meshes, bounds: this.bounds, tris: this.tris };
  }
}

/** 벽면 틀: 원점(ox,oz) + 바깥 법선(nx,nz) → 지역 좌표 (u 오른쪽 · y 위 · w 바깥). 벽이 어느 쪽을 보든 같은 코드로 짓는다 */
export class Frame {
  constructor(ox, oz, nx, nz) { this.ox = ox; this.oz = oz; this.nx = nx; this.nz = nz; this.ux = -nz; this.uz = nx; }
  pt(u, y, w = 0) { return [this.ox + this.ux * u + this.nx * w, y, this.oz + this.uz * u + this.nz * w]; }
  vec(u, y, w) { return [this.ux * u + this.nx * w, y, this.uz * u + this.nz * w]; }
  get n() { return [this.nx, 0, this.nz]; }
  /** 지역 상자: u0..u1 × y0..y1 × w0..w1. faces: F(바깥) L R T B */
  box(G, mat, u0, u1, y0, y1, w0, w1, o = {}) {
    const f = o.faces ?? 'FLRT';
    if (f.includes('F')) G.quad(mat, this.pt(u0, y0, w1), this.vec(u1 - u0, 0, 0), [0, y1 - y0, 0], this.n, o);
    if (f.includes('L')) G.quad(mat, this.pt(u0, y0, w0), this.vec(0, 0, w1 - w0), [0, y1 - y0, 0], this.vec(-1, 0, 0), o);
    if (f.includes('R')) G.quad(mat, this.pt(u1, y0, w1), this.vec(0, 0, w0 - w1), [0, y1 - y0, 0], this.vec(1, 0, 0), o);
    if (f.includes('T')) G.quad(o.top ?? mat, this.pt(u0, y1, w1), this.vec(u1 - u0, 0, 0), this.vec(0, 0, w0 - w1), [0, 1, 0], o);
    if (f.includes('B')) G.quad(mat, this.pt(u0, y0, w0), this.vec(u1 - u0, 0, 0), this.vec(0, 0, w1 - w0), [0, -1, 0], { ...o, keep: true });
  }
  /** 벽면 위의 납작한 사각형 (w 만큼 띄워서) */
  face(G, mat, u0, u1, y0, y1, w, o = {}) { G.quad(mat, this.pt(u0, y0, w), this.vec(u1 - u0, 0, 0), [0, y1 - y0, 0], this.n, o); }
}
