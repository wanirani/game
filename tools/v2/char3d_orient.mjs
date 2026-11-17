// v2 char3d: 생성된 정지 모델을 "앞 = +Z, 위 = +Y, 발 = y 0" 으로 돌려 놓는다 (자동 리깅 서비스가 이 방향을 가정한다).
//   node tools/v2/char3d_orient.mjs <in.glb> <out.glb> [front=+x|-x|+z|-z|auto]
// auto: 발끝이 뻗은 쪽을 앞으로 본다 (발 높이의 x·z 범위가 발목보다 더 나간 쪽).
import { readGLB, writeGLB, vec3View } from './char3d_glbio.mjs';
const [inp, out, frontArg = 'auto'] = process.argv.slice(2);
if (!inp || !out) { console.error('usage: char3d_orient.mjs in.glb out.glb [front]'); process.exit(2); }
const g = readGLB(inp);
const prims = g.json.meshes.flatMap((m) => m.primitives);
let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
const each = (acc, fn) => { const v = vec3View(g, acc); for (let i = 0; i < v.count; i++) { const o = i * v.stride; fn(v.dv, o); } return v; };
for (const p of prims) each(p.attributes.POSITION, (dv, o) => { for (let k = 0; k < 3; k++) { const c = dv.getFloat32(o + k * 4, true); if (c < lo[k]) lo[k] = c; if (c > hi[k]) hi[k] = c; } });
const H = hi[1] - lo[1];
let front = frontArg;
if (front === 'auto') {
  const ext = (y0, y1) => { const r = [1e9, -1e9, 1e9, -1e9]; for (const p of prims) each(p.attributes.POSITION, (dv, o) => { const y = (dv.getFloat32(o + 4, true) - lo[1]) / H; if (y < y0 || y > y1) return; const x = dv.getFloat32(o, true), z = dv.getFloat32(o + 8, true); r[0] = Math.min(r[0], x); r[1] = Math.max(r[1], x); r[2] = Math.min(r[2], z); r[3] = Math.max(r[3], z); }); return r; };
  const f = ext(0, 0.04), a = ext(0.1, 0.16);
  const d = { '+x': f[1] - a[1], '-x': a[0] - f[0], '+z': f[3] - a[3], '-z': a[2] - f[2] };
  const wide = hi[0] - lo[0] > hi[2] - lo[2] ? 'z' : 'x';   // 팔 벌린 쪽이 좌우 축 → 앞뒤 축은 나머지
  front = d['+' + wide] > d['-' + wide] ? '+' + wide : '-' + wide;
  console.log('발끝 돌출', JSON.stringify(d), '→ 앞 =', front);
}
// (x,z) → (x',z'): 앞이 +Z 가 되게 Y 축으로 돈다 (거울상 아님)
const R = { '+z': [1, 0, 0, 1], '-z': [-1, 0, 0, -1], '+x': [0, -1, 1, 0], '-x': [0, 1, -1, 0] }[front];   // x' = R0·x + R1·z, z' = R2·x + R3·z
const cx = (lo[0] + hi[0]) / 2, cz = (lo[2] + hi[2]) / 2;
for (const p of prims) {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const v = each(p.attributes.POSITION, (dv, o) => {
    const x = dv.getFloat32(o, true) - cx, y = dv.getFloat32(o + 4, true) - lo[1], z = dv.getFloat32(o + 8, true) - cz;
    const q = [R[0] * x + R[1] * z, y, R[2] * x + R[3] * z];
    for (let k = 0; k < 3; k++) { dv.setFloat32(o + k * 4, q[k], true); const c = dv.getFloat32(o + k * 4, true); if (c < mn[k]) mn[k] = c; if (c > mx[k]) mx[k] = c; }
  });
  v.acc.min = mn; v.acc.max = mx;
  if (p.attributes.NORMAL != null) each(p.attributes.NORMAL, (dv, o) => { const x = dv.getFloat32(o, true), z = dv.getFloat32(o + 8, true); dv.setFloat32(o, R[0] * x + R[1] * z, true); dv.setFloat32(o + 8, R[2] * x + R[3] * z, true); });
  if (p.attributes.TANGENT != null) delete p.attributes.TANGENT;
}
const size = writeGLB(out, g.json, g.bin);
console.log('쓴 파일', out, size, 'bytes · 키', H.toFixed(3));
