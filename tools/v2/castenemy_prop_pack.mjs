// v2 castenemy: 손에 드는 단단한 소품(검 · 지팡이 · 삽창)을 게임에 싣는 정지 GLB 로 싼다. docs/v2/CAST_R1_ENEMIES.md §무기
//   node tools/v2/castenemy_prop_pack.mjs <tripo.glb> <out.glb> --len=95 --grip=0.12 [--tex=512] [--q=82] [--flip]
// 나가는 모델 (뼈 없음): 단위 = cm (리깅 서비스의 손 뼈 공간과 같다 — Char3D.weapon 자리에 그대로 넣는다),
//   원점 = 쥐는 자리(자루 축 위), +Y = 날 · 머리 쪽, 납작한 면의 법선 = ±Z. 길이 = --len cm, 쥐는 자리 = 아래 끝에서 --grip 비율.
//   정점: 위치 float32 · 법선 int8 · uv uint16, 그림: WebP --tex.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readGLB, writeGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';

const argv = process.argv.slice(2), posA = argv.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const [inp, out] = posA;
if (!inp || !out) { console.error('usage: castenemy_prop_pack.mjs in.glb out.glb --len=95 --grip=0.12 [--tex=512] [--flip]'); process.exit(2); }
const LEN = Number(opt.len ?? 100), GRIP = Number(opt.grip ?? 0.15), TEX = Number(opt.tex ?? 512), Q = Number(opt.q ?? 82);

const G = readGLB(inp), M = buildModel(G), P = M.prims[0], nv = P.pos.length / 3;
const p = Float32Array.from(P.pos), n = Float32Array.from(P.nrm);
const bbox = () => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { const c = p[i * 3 + k]; if (c < lo[k]) lo[k] = c; if (c > hi[k]) hi[k] = c; } return { lo, hi, e: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] }; };
let B = bbox();
if (B.e[1] < Math.max(B.e[0], B.e[2])) console.warn('경고: 가장 긴 축이 Y 가 아닙니다 — 원본 그림을 세워서 다시 만드세요', B.e);
const rotY90 = () => { for (let i = 0; i < nv; i++) { const x = p[i * 3], z = p[i * 3 + 2]; p[i * 3] = z; p[i * 3 + 2] = -x; const a = n[i * 3], c = n[i * 3 + 2]; n[i * 3] = c; n[i * 3 + 2] = -a; } };
{   // 수평면(x·z)의 주축을 찾아 넓은 쪽을 X 로 돌린다 (서비스가 준 모델이 Y 축으로 비스듬히 돌아 있을 때가 있다)
  let mx = 0, mz = 0; for (let i = 0; i < nv; i++) { mx += p[i * 3]; mz += p[i * 3 + 2]; } mx /= nv; mz /= nv;
  let cxx = 0, czz = 0, cxz = 0; for (let i = 0; i < nv; i++) { const x = p[i * 3] - mx, z = p[i * 3 + 2] - mz; cxx += x * x; czz += z * z; cxz += x * z; }
  const th = 0.5 * Math.atan2(2 * cxz, cxx - czz), c = Math.cos(th), s = Math.sin(th);   // 주축 방향 (cos, sin)
  for (let i = 0; i < nv; i++) { const x = p[i * 3], z = p[i * 3 + 2]; p[i * 3] = c * x + s * z; p[i * 3 + 2] = -s * x + c * z; const a = n[i * 3], b = n[i * 3 + 2]; n[i * 3] = c * a + s * b; n[i * 3 + 2] = -s * a + c * b; }
  B = bbox(); console.log('주축 돌림', (th * 180 / Math.PI).toFixed(1) + '°');
}
if (B.e[2] > B.e[0]) { rotY90(); B = bbox(); }   // 넓은 쪽이 X, 납작한 면이 Z 를 보게
if (opt.flip) { for (let i = 0; i < nv; i++) { p[i * 3 + 1] = -p[i * 3 + 1]; p[i * 3 + 2] = -p[i * 3 + 2]; n[i * 3 + 1] = -n[i * 3 + 1]; n[i * 3 + 2] = -n[i * 3 + 2]; } B = bbox(); }   // X 축으로 180°
const sc = LEN / B.e[1], yg = B.lo[1] + GRIP * B.e[1];
let sx = 0, sz = 0, sn = 0;
for (let i = 0; i < nv; i++) if (Math.abs(p[i * 3 + 1] - yg) < B.e[1] * 0.04) { sx += p[i * 3]; sz += p[i * 3 + 2]; sn++; }
const cx = sn ? sx / sn : (B.lo[0] + B.hi[0]) / 2, cz = sn ? sz / sn : (B.lo[2] + B.hi[2]) / 2;
for (let i = 0; i < nv; i++) { p[i * 3] = (p[i * 3] - cx) * sc; p[i * 3 + 1] = (p[i * 3 + 1] - yg) * sc; p[i * 3 + 2] = (p[i * 3 + 2] - cz) * sc; }
B = bbox();

const chunks = []; let size = 0; const views = [], accessors = [];
const view = (bytes, o = {}) => { const padN = (4 - (size % 4)) % 4; if (padN) { chunks.push(new Uint8Array(padN)); size += padN; } views.push({ buffer: 0, byteOffset: size, byteLength: bytes.byteLength, ...o }); chunks.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)); size += bytes.byteLength; return views.length - 1; };
const acc = (o) => { accessors.push(o); return accessors.length - 1; };
const aPos = acc({ bufferView: view(p, { target: 34962 }), componentType: 5126, count: nv, type: 'VEC3', min: B.lo, max: B.hi });
const nq = new Int8Array(nv * 4);
for (let i = 0; i < nv; i++) { const x = n[i * 3], y = n[i * 3 + 1], z = n[i * 3 + 2], l = Math.hypot(x, y, z) || 1; nq[i * 4] = Math.round((x / l) * 127); nq[i * 4 + 1] = Math.round((y / l) * 127); nq[i * 4 + 2] = Math.round((z / l) * 127); }
const aNrm = acc({ bufferView: view(nq, { target: 34962, byteStride: 4 }), componentType: 5120, normalized: true, count: nv, type: 'VEC3' });
let uvOk = true; for (let i = 0; i < P.uv.length; i++) if (P.uv[i] < 0 || P.uv[i] > 1) { uvOk = false; break; }
const aUV = uvOk ? acc({ bufferView: view(Uint16Array.from(P.uv, (v) => Math.round(v * 65535)), { target: 34962 }), componentType: 5123, normalized: true, count: nv, type: 'VEC2' }) : acc({ bufferView: view(Float32Array.from(P.uv), { target: 34962 }), componentType: 5126, count: nv, type: 'VEC2' });
const idx = nv > 65535 ? Uint32Array.from(P.idx) : Uint16Array.from(P.idx);
const aIdx = acc({ bufferView: view(idx, { target: 34963 }), componentType: nv > 65535 ? 5125 : 5123, count: idx.length, type: 'SCALAR' });
// 그림
const im0 = G.json.images[P.image], ibv = G.json.bufferViews[im0.bufferView];
const dir = mkdtempSync(path.join(tmpdir(), 'ceprop-')), inF = path.join(dir, 'in.bin'), outF = path.join(dir, 'out.webp');
writeFileSync(inF, G.bin.slice(ibv.byteOffset ?? 0, (ibv.byteOffset ?? 0) + ibv.byteLength));
const py = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
t = int(sys.argv[3])
if max(im.size) > t: im = im.resize((t, t), Image.LANCZOS)
im.save(sys.argv[2], 'WEBP', quality=int(sys.argv[4]), method=6)
print(im.size[0])`;
execFileSync('python3', ['-I', '-c', py, inF, outF, String(TEX), String(Q)], { encoding: 'utf8' });
const imgBytes = readFileSync(outF); rmSync(dir, { recursive: true, force: true });
const imgView = view(new Uint8Array(imgBytes));
const bin = new Uint8Array(size + ((4 - (size % 4)) % 4)); { let o = 0; for (const c of chunks) { bin.set(c, o); o += c.byteLength; } }
const json = {
  asset: { version: '2.0', generator: 'castenemy_prop_pack' },
  extensionsUsed: ['EXT_texture_webp'], extensionsRequired: ['EXT_texture_webp'],
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: path.basename(out, '.glb'), mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUV }, indices: aIdx, material: 0 }] }],
  materials: [{ name: 'prop', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.9 } }],
  textures: [{ extensions: { EXT_texture_webp: { source: 0 } } }], images: [{ bufferView: imgView, mimeType: 'image/webp' }],
  accessors, bufferViews: views,
};
const bytes = writeGLB(out, json, bin);
console.log(`쓴 파일 ${out}: ${bytes} bytes (${Math.round(bytes / 1024)} KB) · 삼각형 ${idx.length / 3} · 정점 ${nv} · 길이 ${LEN} cm · 쥐는 자리 ${GRIP} · 폭 ${(B.hi[0] - B.lo[0]).toFixed(1)} × 두께 ${(B.hi[2] - B.lo[2]).toFixed(1)} cm · 그림 ${TEX} webp ${imgBytes.length}`);
