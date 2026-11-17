// v2 char3d: 리깅된 GLB 를 게임에 싣는 크기로 다시 싼다. docs/v2/CHAR3D_PILOT.md §5
//   node tools/v2/char3d_pack.mjs <base.glb> <out.glb> [--clips=a.glb,b.glb] [--tex=1024] [--fmt=webp|jpeg] [--q=82] [--noanim]
// 하는 일:
//   · 정점: 위치 float32 · 법선 int8(정규화) · uv uint16(정규화) · 뼈 번호 uint8 · 가중치 uint8(정규화) → 정점당 52 → 28바이트
//   · 그림: 한 변 --tex 로 줄여 WebP(또는 JPEG)로 다시 넣는다 (PIL 사용)
//   · 클립: base 의 클립 + --clips 의 클립. 다른 파일의 클립은 뼈 이름으로 base 뼈대에 다시 맞춘다 (서비스가 리깅할 때마다 뼈 위치가 조금씩 달라서).
//     회전 키는 int16(정규화) 쿼터니언, 골반 이동만 float32. 크기(scale) 키와 안 쓰는 데이터는 버린다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readGLB, writeGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, clipFromAnim, qmul, qconj, qnorm } from '../../src/v2/char3d/skel.js';

const argv = process.argv.slice(2), pos = argv.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const [basePath, outPath] = pos;
if (!basePath || !outPath) { console.error('usage: char3d_pack.mjs base.glb out.glb [--clips=a.glb,b.glb] [--tex=1024] [--fmt=webp] [--q=82]'); process.exit(2); }
const TEX = Number(opt.tex ?? 1024), FMT = opt.fmt ?? 'webp', Q = Number(opt.q ?? 82);

const G = readGLB(basePath), M = buildModel(G), rig = new Rig(M);
if (M.prims.length !== 1) console.warn('프림이 ' + M.prims.length + '개 — 첫 번째만 쌉니다');
const P = M.prims[0], nv = P.pos.length / 3;

// ── BIN 을 차례로 쌓는다 ──
const chunks = []; let size = 0; const views = [], accessors = [];
const view = (bytes, o = {}) => { const padN = (4 - (size % 4)) % 4; if (padN) { chunks.push(new Uint8Array(padN)); size += padN; } views.push({ buffer: 0, byteOffset: size, byteLength: bytes.byteLength, ...o }); chunks.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)); size += bytes.byteLength; return views.length - 1; };
const acc = (o) => { accessors.push(o); return accessors.length - 1; };
const mm = (a, n) => { const mn = new Array(n).fill(Infinity), mx = new Array(n).fill(-Infinity); for (let i = 0; i < a.length; i++) { const k = i % n; if (a[i] < mn[k]) mn[k] = a[i]; if (a[i] > mx[k]) mx[k] = a[i]; } return { min: mn, max: mx }; };

const aPos = acc({ bufferView: view(P.pos, { target: 34962 }), componentType: 5126, count: nv, type: 'VEC3', ...mm(P.pos, 3) });
const nrm = new Int8Array(nv * 4);
for (let i = 0; i < nv; i++) { const x = P.nrm[i * 3], y = P.nrm[i * 3 + 1], z = P.nrm[i * 3 + 2], l = Math.hypot(x, y, z) || 1; nrm[i * 4] = Math.round((x / l) * 127); nrm[i * 4 + 1] = Math.round((y / l) * 127); nrm[i * 4 + 2] = Math.round((z / l) * 127); }
const aNrm = acc({ bufferView: view(nrm, { target: 34962, byteStride: 4 }), componentType: 5120, normalized: true, count: nv, type: 'VEC3' });
let uvOk = true; for (let i = 0; i < P.uv.length; i++) if (P.uv[i] < 0 || P.uv[i] > 1) { uvOk = false; break; }
const aUV = uvOk ? acc({ bufferView: view(Uint16Array.from(P.uv, (v) => Math.round(v * 65535)), { target: 34962 }), componentType: 5123, normalized: true, count: nv, type: 'VEC2' }) : acc({ bufferView: view(P.uv, { target: 34962 }), componentType: 5126, count: nv, type: 'VEC2' });
const jn = new Uint8Array(nv * 4), wt = new Uint8Array(nv * 4);
for (let i = 0; i < nv; i++) {
  let s = 0; for (let k = 0; k < 4; k++) s += P.weights[i * 4 + k];
  let acc8 = 0, best = 0;
  for (let k = 0; k < 4; k++) { const w = Math.round((P.weights[i * 4 + k] / (s || 1)) * 255); wt[i * 4 + k] = w; jn[i * 4 + k] = w ? P.joints[i * 4 + k] : 0; acc8 += w; if (wt[i * 4 + k] > wt[i * 4 + best]) best = k; }
  wt[i * 4 + best] += 255 - acc8;   // 합이 정확히 255 가 되게
}
const aJ = acc({ bufferView: view(jn, { target: 34962 }), componentType: 5121, count: nv, type: 'VEC4' });
const aW = acc({ bufferView: view(wt, { target: 34962 }), componentType: 5121, normalized: true, count: nv, type: 'VEC4' });
const idx = nv > 65535 ? Uint32Array.from(P.idx) : Uint16Array.from(P.idx);
const aIdx = acc({ bufferView: view(idx, { target: 34963 }), componentType: nv > 65535 ? 5125 : 5123, count: idx.length, type: 'SCALAR' });
const aIBM = acc({ bufferView: view(M.skin.ibm), componentType: 5126, count: M.skin.joints.length, type: 'MAT4' });

// ── 클립 ──
const animations = [], clipLog = [];
function addClip(srcModel, srcRig, anim, from) {
  const clip = clipFromAnim(srcRig, anim, { loop: false });   // 정규 클립 (이동 가공 없음 — 그건 게임이 읽을 때 한다)
  const samplers = [], channels = [];
  const timeAcc = new Map();
  const tAcc = (times) => { const key = times.length + ':' + times[0] + ':' + times[times.length - 1]; if (!timeAcc.has(key)) timeAcc.set(key, acc({ bufferView: view(Float32Array.from(times)), componentType: 5126, count: times.length, type: 'SCALAR', min: [times[0]], max: [times[times.length - 1]] })); return timeAcc.get(key); };
  const q = [0, 0, 0, 1], a = [0, 0, 0, 1], b = [0, 0, 0, 1];
  for (const tr of clip.tracks) {
    const j = rig.key.get(tr.key); if (j == null) continue;
    const Pw = rig.parWR.subarray(j * 4, j * 4 + 4), Lr = rig.restR.subarray(j * 4, j * 4 + 4), n = tr.times.length, out = new Int16Array(n * 4);
    for (let k = 0; k < n; k++) { qmul(qconj(Pw, a), tr.rot.subarray(k * 4, k * 4 + 4), b); qmul(b, Pw, a); qmul(a, Lr, q); qnorm(q); for (let c = 0; c < 4; c++) out[k * 4 + c] = Math.round(q[c] * 32767); }
    samplers.push({ input: tAcc(tr.times), output: acc({ bufferView: view(out), componentType: 5122, normalized: true, count: n, type: 'VEC4' }), interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node: j, path: 'rotation' } });
  }
  if (clip.root) {
    const j = rig.key.get('hips'), n = clip.root.times.length, out = new Float32Array(n * 3), k0 = rig.restHipY / (rig.restWS[j] || 1);
    const Pc = qconj(rig.parWR.subarray(j * 4, j * 4 + 4), [0, 0, 0, 1]);
    for (let k = 0; k < n; k++) {
      const v = [clip.root.pos[k * 3] * k0, clip.root.pos[k * 3 + 1] * k0, clip.root.pos[k * 3 + 2] * k0];
      const tx = 2 * (Pc[1] * v[2] - Pc[2] * v[1]), ty = 2 * (Pc[2] * v[0] - Pc[0] * v[2]), tz = 2 * (Pc[0] * v[1] - Pc[1] * v[0]);
      out[k * 3] = rig.restT[j * 3] + v[0] + Pc[3] * tx + Pc[1] * tz - Pc[2] * ty; out[k * 3 + 1] = rig.restT[j * 3 + 1] + v[1] + Pc[3] * ty + Pc[2] * tx - Pc[0] * tz; out[k * 3 + 2] = rig.restT[j * 3 + 2] + v[2] + Pc[3] * tz + Pc[0] * ty - Pc[1] * tx;
    }
    samplers.push({ input: tAcc(clip.root.times), output: acc({ bufferView: view(out), componentType: 5126, count: n, type: 'VEC3' }), interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node: j, path: 'translation' } });
  }
  const name = anim.name.replace(/^Armature\|/, '').replace(/\|baselayer$/, '');
  animations.push({ name, samplers, channels });
  clipLog.push(`${name} (${clip.duration.toFixed(2)}초, 뼈 ${clip.tracks.length}, 키 ${clip.tracks[0]?.times.length ?? 0}, 출처 ${path.basename(from)})`);
}
if (!opt.noanim) {
  for (const a of M.anims) addClip(M, rig, a, basePath);
  for (const f of (opt.clips ?? '').split(',').filter(Boolean)) {
    const g2 = readGLB(f), m2 = buildModel(g2), r2 = new Rig(m2);
    const miss = [...r2.key.keys()].filter((k) => !rig.key.has(k));
    if (miss.length) console.warn(f + ': base 에 없는 뼈 ' + miss.join(','));
    for (const a of m2.anims) addClip(m2, r2, a, f);
  }
}

// ── 그림 ──
let images = [], textures = [], used = [];
const srcIm = M.images[P.image];
if (srcIm?.bytes) {
  const dir = mkdtempSync(path.join(tmpdir(), 'c3dpack-')), inF = path.join(dir, 'in.bin'), outF = path.join(dir, 'out.' + FMT);
  writeFileSync(inF, srcIm.bytes);
  const py = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); w, h = im.size; s = int(sys.argv[3])
if max(w, h) > s: im = im.resize((max(1, round(w * s / max(w, h))), max(1, round(h * s / max(w, h)))), Image.LANCZOS)
if sys.argv[4] == 'webp': im.save(sys.argv[2], 'WEBP', quality=int(sys.argv[5]), method=6)
else: im.save(sys.argv[2], 'JPEG', quality=int(sys.argv[5]), optimize=True, progressive=True)
print(w, h, im.size[0], im.size[1])`;
  const r = execFileSync('python3', ['-I', '-c', py, inF, outF, String(TEX), FMT, String(Q)], { encoding: 'utf8' }).trim();
  const bytes = readFileSync(outF); rmSync(dir, { recursive: true, force: true });
  images = [{ bufferView: view(new Uint8Array(bytes)), mimeType: FMT === 'webp' ? 'image/webp' : 'image/jpeg' }];
  textures = FMT === 'webp' ? [{ extensions: { EXT_texture_webp: { source: 0 } } }] : [{ source: 0 }];
  if (FMT === 'webp') used.push('EXT_texture_webp');
  console.log('그림', r.split(' ').slice(0, 2).join('×'), '→', r.split(' ').slice(2).join('×'), FMT, 'q' + Q, bytes.length, 'bytes (원본 ' + srcIm.bytes.length + ')');
}
used.push('KHR_mesh_quantization');

// ── JSON ──
const J = G.json;
const nodes = J.nodes.map((n) => { const o = { name: n.name }; for (const k of ['children', 'translation', 'rotation', 'scale', 'matrix']) if (n[k]) o[k] = n[k]; if (n.mesh != null) { o.mesh = 0; if (n.skin != null) o.skin = 0; } return o; });
const json = {
  asset: { version: '2.0', generator: 'bloodmoon tools/v2/char3d_pack.mjs' },
  extensionsUsed: used, extensionsRequired: used,
  scene: 0, scenes: [{ nodes: J.scenes[J.scene ?? 0].nodes }], nodes,
  meshes: [{ name: 'body', primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUV, JOINTS_0: aJ, WEIGHTS_0: aW }, indices: aIdx, material: 0 }] }],
  materials: [{ name: 'body', pbrMetallicRoughness: { ...(textures.length ? { baseColorTexture: { index: 0 } } : {}), metallicFactor: 0, roughnessFactor: 0.9 } }],
  skins: [{ joints: J.skins[0].joints, inverseBindMatrices: aIBM }],
  accessors, bufferViews: views,
};
if (textures.length) { json.textures = textures; json.images = images; }
if (animations.length) json.animations = animations;
const bin = new Uint8Array(size); { let o = 0; for (const c of chunks) { bin.set(c, o); o += c.byteLength; } }
const total = writeGLB(outPath, json, bin);
const vb = nv * (12 + 4 + (uvOk ? 4 : 8) + 4 + 4);
console.log(`쓴 파일 ${outPath}: ${total} bytes (${(total / 1024).toFixed(0)} KB) · 삼각형 ${idx.length / 3} · 정점 ${nv} · 뼈 ${M.skin.joints.length} · 정점 데이터 ${vb} · 색인 ${idx.byteLength} · 클립 ${animations.length}`);
for (const l of clipLog) console.log('  클립', l);
