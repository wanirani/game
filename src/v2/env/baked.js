// 환경 키트 — 구운 소품 (docs/v2/ENV_KIT.md §11). tools/v2/world_props_bake.mjs 가 만든 묶음(assets/v2/props/props.bin)과 아틀라스 한 장을 읽어
// 소품을 **덩어리 메시 안에** 써 넣는다 → 소품 하나는 그리기 호출이 아니라 삼각형 값만 든다 (같은 덩어리의 구운 소품은 모두 그리기 1회).
//   await ensureProps(url)          브라우저: 묶음을 한 번 받는다 (compileEnv 전에)      setPropPack(arrayBuffer)   node 도구: 읽은 파일을 넣는다
//   bakedDef(name)                  { h, foot:[rx,rz], footH, light, tris } | null        bakedProp(G, name, x, y, z, o)   o = { h, flip, rot, tint, k, lit, c, flicker }
// 묶음이 없으면(받기 전·실패) bakedDef 가 null 이라 build.js 가 손으로 짠 저폴리 소품으로 대신한다.
let PACK = null, LOADING = null;
/** 아틀라스의 텍스처 이름. 키트 텍스처는 assets/v2/env/<이름>.webp 로 받으므로 이 이름은 assets/v2/props/props_atlas.webp 를 가리킨다 */
export const PROP_ATLAS = '../props/props_atlas';

export function setPropPack(buf) {
  const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), dv = new DataView(ab);
  if (dv.getUint32(0, true) !== 0x31504e42) throw new Error('props.bin: bad magic');
  const jl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, jl))), base = 8 + jl;
  PACK = { head, ab, base, cache: new Map() };
  return PACK;
}
export function ensureProps(url) {
  if (PACK) return Promise.resolve(PACK);
  if (!LOADING) LOADING = fetch(url).then((r) => { if (!r.ok) throw new Error('props.bin ' + r.status); return r.arrayBuffer(); }).then(setPropPack).catch((e) => { LOADING = null; throw e; });
  return LOADING;
}
export const propPack = () => PACK;
export const bakedDef = (name) => PACK?.head.props[name] ?? null;
export const bakedNames = () => (PACK ? Object.keys(PACK.head.props) : []);

function decode(name) {
  let m = PACK.cache.get(name); if (m) return m;
  const d = PACK.head.props[name], nv = d.nv, b = PACK.base;
  const qp = new Int16Array(PACK.ab, b + d.pos, nv * 3), qn = new Int8Array(PACK.ab, b + d.nrm, nv * 4), qu = new Uint16Array(PACK.ab, b + d.uv, nv * 2), I = new Uint16Array(PACK.ab, b + d.idx, d.ni);
  const V = new Float32Array(nv * 8), E = d.emis ? new Uint8Array(nv) : null;
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) { V[i * 8 + k] = d.lo[k] + ((qp[i * 3 + k] + 32768) / 65535) * (d.hi[k] - d.lo[k]); V[i * 8 + 3 + k] = qn[i * 4 + k] / 127; }
    V[i * 8 + 6] = qu[i * 2] / 65535; V[i * 8 + 7] = qu[i * 2 + 1] / 65535;
    if (E && qn[i * 4 + 3] > 0) E[i] = 1;   // glow flag (lantern glass, coals, flames): this vertex is not darkened by the baked light
  }
  m = { d, V, I, E }; PACK.cache.set(name, m); return m;
}
/** 소품 하나를 (x, y, z) 발밑에 세운다. o.h = 세계 높이, o.flip = 좌우 뒤집기, o.rot = y 축 회전(라디안), o.tint, o.k */
export function bakedProp(G, name, x, y, z, o = {}) {
  if (!PACK || !PACK.head.props[name]) return false;
  const { d, V, I, E } = decode(name), s = (o.h ?? d.h) / d.h, fl = o.flip ? -1 : 1, c = Math.cos(o.rot ?? 0), sn = Math.sin(o.rot ?? 0), n = V.length / 8, W = new Float32Array(V.length);
  for (let i = 0; i < n; i++) {
    const q = i * 8, px = V[q] * fl * s, pz = V[q + 2] * s, nx = V[q + 3] * fl, nz = V[q + 5];
    W[q] = x + c * px + sn * pz; W[q + 1] = y + V[q + 1] * s; W[q + 2] = z - sn * px + c * pz;
    W[q + 3] = c * nx + sn * nz; W[q + 4] = V[q + 4]; W[q + 5] = -sn * nx + c * nz; W[q + 6] = V[q + 6]; W[q + 7] = V[q + 7];
  }
  let J = I;
  if (o.drop) {   // o.drop(x, y, z) in the model's own units: triangles whose middle it accepts are left out (the cart's melted shafts - props3.js builds real ones)
    const K = []; for (let t = 0; t < I.length; t += 3) { const p = I[t] * 8, q = I[t + 1] * 8, r = I[t + 2] * 8; if (!o.drop((V[p] + V[q] + V[r]) / 3, (V[p + 1] + V[q + 1] + V[r + 1]) / 3, (V[p + 2] + V[q + 2] + V[r + 2]) / 3)) K.push(I[t], I[t + 1], I[t + 2]); }
    J = new Uint16Array(K);
  }
  if (fl < 0) { const S = J; J = new Uint16Array(S.length); for (let t = 0; t < S.length; t += 3) { J[t] = S[t]; J[t + 1] = S[t + 2]; J[t + 2] = S[t + 1]; } }
  const lit = o.lit !== false, gc = o.c ?? d.glow?.c ?? [1, 0.72, 0.36];
  G.mesh('props', W, J, { tint: o.tint, k: o.k ?? 1, E, emisK: lit ? 1.45 : 0.22, emisTint: lit && o.c ? [0.55 + 0.45 * o.c[0], 0.55 + 0.45 * o.c[1], 0.55 + 0.45 * o.c[2]] : null });
  if (lit && d.glow && d.glowAt) {   // glow sprite and light pool at the glowing part (the light itself is the part's `light`)
    const gx = d.glowAt[0] * fl * s, gz = d.glowAt[2] * s, F = G.fx ?? (G.fx = { glows: [], pools: [], shadows: [] });
    F.glows.push({ x: x + c * gx + sn * gz, y: y + d.glowAt[1] * s, z: z - sn * gx + c * gz - 6 * s, r: d.glow.r * s, c: gc, flicker: o.flicker ?? !!d.glow.flicker });
    F.pools.push({ x: x + c * gx + sn * gz, y, z, r: d.glow.pool ?? 190, c: gc, a: 0.3, flicker: o.flicker ?? !!d.glow.flicker });
  }
  const rx = (d.foot?.[0] || (d.hi[0] - d.lo[0]) * 0.35) * s, rz = (d.foot?.[1] || (d.hi[2] - d.lo[2]) * 0.35) * s;
  (G.fx ?? (G.fx = { glows: [], pools: [], shadows: [] })).shadows.push({ x, y, z, rx: rx * 1.25, rz: rz * 0.9, a: 0.5 });
  return true;
}
