// v2 castenemy: 사람 꼴이 아닌 "박쥐"에 손으로 뼈대를 박고 날갯짓 클립을 써 넣는다. docs/v2/CAST_R1_ENEMIES.md §박쥐
//   node tools/v2/castenemy_bat_rig.mjs <oriented.glb> <out_rigged.glb> [--span=0.8] [--period=0.4] [--amp=48]
// 들어오는 모델: char3d_orient.mjs 를 거친 정지 모델 — 얼굴이 +Z, 위가 +Y, 날개를 좌우(X)로 활짝 편 모습.
// 나가는 모델: 날개폭이 --span 미터, 바닥이 y 0, 뼈 5개(Hips · wingL1 · wingL2 · wingR1 · wingR2), 클립 fly (+ 같은 내용의 run).
//   · 뼈 가중치는 |x| 로만 정한다: 몸통(가운데) → 안쪽 날개(어깨 관절) → 바깥 날개(손목 관절). 몸통 너비는 메시 두께(z)에서 잰다.
//   · 날갯짓 = 날개 뼈를 몸의 긴 축(Y)으로 돌린다. 몸을 앞으로 숙여 날리면(게임이 모델을 Rx 로 숙인다) 위아래 날갯짓이 된다.
//   · run 은 fly 의 사본이다: 지금 런타임(src/v2/char3d/clips.js buildClips)이 이름에 run 이 든 클립만 "달리기"로 집어 가기 때문 — 코드를 안 고쳐도 튼다.
// 결과는 리깅 서비스가 준 파일과 같은 꼴(float 정점 + JOINTS_0/WEIGHTS_0 + 스킨 + 애니메이션)이라 char3d_pack.mjs 로 그대로 싼다.
import { readGLB, writeGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';

const argv = process.argv.slice(2), pos = argv.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const [inp, out] = pos;
if (!inp || !out) { console.error('usage: castenemy_bat_rig.mjs oriented.glb out.glb [--span=0.8] [--period=0.4] [--amp=48]'); process.exit(2); }
const SPAN = Number(opt.span ?? 0.8), T = Number(opt.period ?? 0.4), AMP = Number(opt.amp ?? 48);

const G = readGLB(inp), M = buildModel(G), P = M.prims[0], nv = P.pos.length / 3;
// ── 크기 · 자리: 날개폭 = SPAN, x·z 가운데, 바닥 y 0 ──
let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { const c = P.pos[i * 3 + k]; if (c < lo[k]) lo[k] = c; if (c > hi[k]) hi[k] = c; }
const sc = SPAN / (hi[0] - lo[0]), cx = (lo[0] + hi[0]) / 2;
const p = new Float32Array(nv * 3);
// 몸통의 z 가운데를 0 으로: 가운데 띠(|x| < 폭의 4%)의 z 평균
let zs = 0, zn = 0; for (let i = 0; i < nv; i++) if (Math.abs(P.pos[i * 3] - cx) < (hi[0] - lo[0]) * 0.04) { zs += P.pos[i * 3 + 2]; zn++; }
const cz = zn ? zs / zn : (lo[2] + hi[2]) / 2;
for (let i = 0; i < nv; i++) { p[i * 3] = (P.pos[i * 3] - cx) * sc; p[i * 3 + 1] = (P.pos[i * 3 + 1] - lo[1]) * sc; p[i * 3 + 2] = (P.pos[i * 3 + 2] - cz) * sc; }
const half = SPAN / 2, H = (hi[1] - lo[1]) * sc;
// ── 몸통 너비: |x| 띠마다 z 두께를 재서, 가운데 두께의 35% 아래로 처음 떨어지는 곳이 어깨 ──
const NB = 40, zmin = new Array(NB).fill(1e9), zmax = new Array(NB).fill(-1e9), ysum = new Array(NB).fill(0), ycnt = new Array(NB).fill(0);
for (let i = 0; i < nv; i++) { const b = Math.min(NB - 1, Math.floor((Math.abs(p[i * 3]) / half) * NB)); const z = p[i * 3 + 2]; if (z < zmin[b]) zmin[b] = z; if (z > zmax[b]) zmax[b] = z; ysum[b] += p[i * 3 + 1]; ycnt[b]++; }
const thick = zmin.map((v, b) => (zmax[b] > v ? zmax[b] - v : 0)), t0 = Math.max(thick[0], thick[1]);
let sb = 2; while (sb < NB - 1 && thick[sb] > t0 * 0.35) sb++;
const x0 = Math.min(0.3, Math.max(0.1, (sb + 0.5) / NB)) * half;   // 어깨 관절
const x1 = x0 + (half - x0) * 0.5;                                  // 손목 관절 (날개 가운데)
const d0 = half * 0.035, d1 = half * 0.07;
// 날개가 몸에 붙는 높이: 어깨 바로 바깥 띠들의 평균 높이
let ys = 0, yn = 0; for (let b = sb; b < Math.min(NB, sb + 4); b++) { ys += ysum[b]; yn += ycnt[b]; }
ys = yn ? ys / yn : H * 0.6;
const yc = H * 0.5;
console.log(`날개폭 ${SPAN} m · 키 ${H.toFixed(3)} · 몸통 반폭(어깨) ${x0.toFixed(3)} · 손목 ${x1.toFixed(3)} · 어깨 높이 ${ys.toFixed(3)} · 가운데 두께 ${t0.toFixed(3)}`);

// ── 가중치 ──
const ss = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const J_HIPS = 0, J_L1 = 1, J_L2 = 2, J_R1 = 3, J_R2 = 4;
const jn = new Uint16Array(nv * 4), wt = new Float32Array(nv * 4);
for (let i = 0; i < nv; i++) {
  const x = p[i * 3], ax = Math.abs(x), wi = ss(x0 - d0, x0 + d0, ax), wo = ss(x1 - d1, x1 + d1, ax);
  const left = x >= 0;   // 캐릭터의 왼쪽 = +X (앞이 +Z)
  jn[i * 4] = J_HIPS; wt[i * 4] = 1 - wi;
  jn[i * 4 + 1] = left ? J_L1 : J_R1; wt[i * 4 + 1] = wi * (1 - wo);
  jn[i * 4 + 2] = left ? J_L2 : J_R2; wt[i * 4 + 2] = wi * wo;
}

// ── BIN ──
const chunks = []; let size = 0; const views = [], accessors = [];
const view = (bytes, o = {}) => { const padN = (4 - (size % 4)) % 4; if (padN) { chunks.push(new Uint8Array(padN)); size += padN; } views.push({ buffer: 0, byteOffset: size, byteLength: bytes.byteLength, ...o }); chunks.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)); size += bytes.byteLength; return views.length - 1; };
const acc = (o) => { accessors.push(o); return accessors.length - 1; };
const mmx = (a, n) => { const mn = new Array(n).fill(Infinity), mx = new Array(n).fill(-Infinity); for (let i = 0; i < a.length; i++) { const k = i % n; if (a[i] < mn[k]) mn[k] = a[i]; if (a[i] > mx[k]) mx[k] = a[i]; } return { min: mn, max: mx }; };
const aPos = acc({ bufferView: view(p, { target: 34962 }), componentType: 5126, count: nv, type: 'VEC3', ...mmx(p, 3) });
const aNrm = acc({ bufferView: view(P.nrm, { target: 34962 }), componentType: 5126, count: nv, type: 'VEC3' });
const aUV = acc({ bufferView: view(P.uv, { target: 34962 }), componentType: 5126, count: nv, type: 'VEC2' });
const aJ = acc({ bufferView: view(jn, { target: 34962 }), componentType: 5123, count: nv, type: 'VEC4' });
const aW = acc({ bufferView: view(wt, { target: 34962 }), componentType: 5126, count: nv, type: 'VEC4' });
const idx = Uint32Array.from(P.idx);
const aIdx = acc({ bufferView: view(idx, { target: 34963 }), componentType: 5125, count: idx.length, type: 'SCALAR' });
// 뼈: 노드 1..5 (0 은 메시). 회전 없는 뼈라 역바인드 = −(세계 위치)
const J = [
  { name: 'Hips', t: [0, yc, 0], w: [0, yc, 0], children: [2, 4] },
  { name: 'wingL1', t: [x0, ys - yc, 0], w: [x0, ys, 0], children: [3] },
  { name: 'wingL2', t: [x1 - x0, 0, 0], w: [x1, ys, 0] },
  { name: 'wingR1', t: [-x0, ys - yc, 0], w: [-x0, ys, 0], children: [5] },
  { name: 'wingR2', t: [-(x1 - x0), 0, 0], w: [-x1, ys, 0] },
];
const ibm = new Float32Array(16 * J.length);
J.forEach((j, k) => { ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.w[0], -j.w[1], -j.w[2], 1], k * 16); });
const aIBM = acc({ bufferView: view(ibm), componentType: 5126, count: J.length, type: 'MAT4' });
// 그림은 그대로 옮긴다
const im0 = G.json.images[P.image], ibv = G.json.bufferViews[im0.bufferView];
const imgView = view(G.bin.slice(ibv.byteOffset ?? 0, (ibv.byteOffset ?? 0) + ibv.byteLength));

// ── 날갯짓 클립 ──
const N = 16, times = new Float32Array(N + 1), rad = Math.PI / 180;
const rot = { 2: new Float32Array((N + 1) * 4), 3: new Float32Array((N + 1) * 4), 4: new Float32Array((N + 1) * 4), 5: new Float32Array((N + 1) * 4) }, hip = new Float32Array((N + 1) * 3);
for (let k = 0; k <= N; k++) {
  const u = k / N, ph = u * Math.PI * 2; times[k] = u * T;
  const a1 = (-8 + AMP * Math.sin(ph)) * rad;                 // 안쪽 날개: + = 배 쪽(+Z)으로 내려침
  const a2 = (10 + AMP * 0.65 * Math.sin(ph - 1.0)) * rad;    // 바깥 날개: 늦게 따라오고 조금 접힌다
  const qy = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
  rot[2].set(qy(-a1), k * 4); rot[3].set(qy(-a2), k * 4); rot[4].set(qy(a1), k * 4); rot[5].set(qy(a2), k * 4);
  hip.set([0, yc + H * 0.03 * Math.sin(ph - 0.6), -H * 0.07 * Math.sin(ph - 0.3)], k * 3);   // 내려칠 때 몸이 등 쪽(−Z)으로 밀린다
}
const aT = acc({ bufferView: view(times), componentType: 5126, count: N + 1, type: 'SCALAR', min: [0], max: [T] });
const mkAnim = (name) => {
  const samplers = [], channels = [];
  for (const n of [2, 3, 4, 5]) { samplers.push({ input: aT, output: acc({ bufferView: view(rot[n]), componentType: 5126, count: N + 1, type: 'VEC4' }), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: n, path: 'rotation' } }); }
  samplers.push({ input: aT, output: acc({ bufferView: view(hip), componentType: 5126, count: N + 1, type: 'VEC3' }), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: 1, path: 'translation' } });
  return { name, samplers, channels };
};

const anims = [mkAnim('fly'), mkAnim('run')];
const bin = new Uint8Array(size + ((4 - (size % 4)) % 4)); { let o = 0; for (const c of chunks) { bin.set(c, o); o += c.byteLength; } }
const json = {
  asset: { version: '2.0', generator: 'castenemy_bat_rig' },
  scene: 0, scenes: [{ nodes: [0, 1] }],
  nodes: [{ name: 'Bat', mesh: 0, skin: 0 }, ...J.map((j) => ({ name: j.name, translation: j.t, ...(j.children ? { children: j.children } : {}) }))],
  meshes: [{ primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUV, JOINTS_0: aJ, WEIGHTS_0: aW }, indices: aIdx, material: 0 }] }],
  skins: [{ joints: [1, 2, 3, 4, 5], inverseBindMatrices: aIBM, skeleton: 1 }],
  materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true }],
  textures: [{ source: 0 }], images: [{ bufferView: imgView, mimeType: im0.mimeType ?? 'image/jpeg' }],
  animations: anims,
  accessors, bufferViews: views,
};
const bytes = writeGLB(out, json, bin);
console.log('쓴 파일', out, bytes, 'bytes · 정점', nv, '· 삼각형', idx.length / 3, '· 뼈 5 · 클립 fly(+run 사본)', T + '초');
