// v2 castenemy: 떠다니는 적(무덤 유령 · 밴시 여왕)의 "떠서 서 있기" 클립을 손으로 써서 GLB 에 굽는다 (크레딧 0). docs/v2/CAST_R1_ENEMIES.md §떠다니는 적
//   node tools/v2/castenemy_float_clip.mjs <rigged.glb> <out_clip.glb> [--name=float_idle] [--dur=4] [--regal]
// 나가는 파일 = 들어온 리깅 모델에서 애니메이션만 이 클립으로 바꾼 것. char3d_pack.mjs 의 --clips= 에 넣으면 뼈 이름으로 다시 맞춰 실린다.
// 자세는 src/v2/char3d/clips.js 와 같은 "캐릭터 축 오일러(도)"로 쓴다: x + = 앞으로 숙임, y + = 왼쪽으로 비틂, z = 옆으로 기울임 (왼팔 z − / 오른팔 z + = 팔을 내림).
// 다리 뼈는 건드리지 않는다 — 옷자락이 골반에 매달린 채 그대로 늘어진다. 골반만 위아래로 천천히 떠오르내린다.
import { readGLB, writeGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, CPose, applyPose } from '../../src/v2/char3d/skel.js';

const argv = process.argv.slice(2), pos = argv.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const [inp, out] = pos;
if (!inp || !out) { console.error('usage: castenemy_float_clip.mjs rigged.glb out.glb [--name=float_idle] [--dur=4] [--regal]'); process.exit(2); }
const NAME = opt.name ?? 'float_idle', DUR = Number(opt.dur ?? 4), REGAL = !!opt.regal, N = 32;

const G = readGLB(inp), M = buildModel(G), rig = new Rig(M), P = new CPose();
const TAU = Math.PI * 2;
function pose(u) {
  const s = Math.sin(u * TAU), c = Math.cos(u * TAU), s2 = Math.sin(u * TAU * 2 + 0.7), sl = Math.sin(u * TAU - 0.9);   // sl: 팔이 몸보다 조금 늦게
  P.clear();
  P.root[0] = 0.006 * s2; P.root[1] = 0.035 * s; P.root[2] = 0.01 * c;
  P.e('spine', 3 + 1.5 * s, 2.5 * c, 1.2 * s2); P.e('spine2', 2 + 1.5 * s, 2 * c, 0);
  P.e('neck', -2, 0, 0); P.e('head', (REGAL ? -7 : 6) - 2 * s, 5 * c, 2 * s2);            // 여왕은 턱을 들고, 유령은 고개를 떨군다
  const down = REGAL ? 20 : 30, fwd = REGAL ? 8 : 22, bend = REGAL ? 24 : 42;
  P.e('armL', fwd + 4 * sl, 0, -(down + 5 * sl)); P.e('forearmL', -(bend + 7 * sl), 0, 0); P.e('handL', -8 - 6 * sl, 0, 0);
  P.e('armR', fwd + 4 * sl, 0, down + 5 * sl); P.e('forearmR', -(bend + 7 * sl), 0, 0); P.e('handR', -8 - 6 * sl, 0, 0);
}
const keys = ['spine', 'spine2', 'neck', 'head', 'armL', 'forearmL', 'handL', 'armR', 'forearmR', 'handR'].filter((k) => rig.key.has(k));
const hips = rig.key.get('hips');
const times = new Float32Array(N + 1), rot = Object.fromEntries(keys.map((k) => [k, new Float32Array((N + 1) * 4)])), hip = new Float32Array((N + 1) * 3);
for (let i = 0; i <= N; i++) {
  times[i] = (i / N) * DUR; pose(i / N); applyPose(rig, P);
  for (const k of keys) { const j = rig.key.get(k); rot[k].set(rig.R.subarray(j * 4, j * 4 + 4), i * 4); }
  hip.set(rig.T.subarray(hips * 3, hips * 3 + 3), i * 3);
}
// BIN 뒤에 붙인다
const json = G.json; let bin = G.bin; const extra = []; let size = bin.byteLength + ((4 - (bin.byteLength % 4)) % 4);
const start = size;
const view = (arr) => { json.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: arr.byteLength }); extra.push(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength)); size += arr.byteLength; return json.bufferViews.length - 1; };
const acc = (o) => { json.accessors.push(o); return json.accessors.length - 1; };
const aT = acc({ bufferView: view(times), componentType: 5126, count: N + 1, type: 'SCALAR', min: [0], max: [DUR] });
const samplers = [], channels = [];
for (const k of keys) { samplers.push({ input: aT, output: acc({ bufferView: view(rot[k]), componentType: 5126, count: N + 1, type: 'VEC4' }), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: rig.key.get(k), path: 'rotation' } }); }
samplers.push({ input: aT, output: acc({ bufferView: view(hip), componentType: 5126, count: N + 1, type: 'VEC3' }), interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: hips, path: 'translation' } });
json.animations = [{ name: NAME, samplers, channels }];
const nb = new Uint8Array(size); nb.set(bin, 0); { let o = start; for (const e of extra) { nb.set(e, o); o += e.byteLength; } }
const bytes = writeGLB(out, json, nb);
console.log(`쓴 파일 ${out} ${bytes} bytes · 클립 ${NAME} ${DUR}초 · 뼈 ${keys.length} + 골반 이동 · 키 ${N + 1}`);
