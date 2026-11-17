// v2 castenemy: 실은 GLB 를 게임 런타임 그대로(브라우저 없이) 읽어 본다 — 뼈대 · 든 클립마다 9시점 자세 · 뼈 행렬에 NaN 없음 · 가중치 합 1 · 사람형 뼈 이름. docs/v2/CAST_R1_ENEMIES.md §10
//   node tools/v2/castenemy_check.mjs assets/v2/char3d/*.glb
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, CPose, clipFromAnim, sampleClip, applyPose } from '../../src/v2/char3d/skel.js';
import { buildClips } from '../../src/v2/char3d/clips.js';
let bad = 0;
for (const f of process.argv.slice(2)) {
  const G = readGLB(f), M = buildModel(G), P0 = M.prims[0], name = f.split('/').pop();
  if (!M.skin) { console.log(name.padEnd(24), 'static prop · prims', M.prims.length, '· tris', P0.idx.length / 3, '· OK'); continue; }
  const rig = new Rig(M), P = new CPose(); const clips = buildClips(rig, M.anims);
  for (const a of M.anims) clips[a.name] = clipFromAnim(rig, a, { name: a.name });
  let n = 0, nan = 0, maxw = 0;
  for (const [k, c] of Object.entries(clips)) for (let i = 0; i <= 8; i++) { sampleClip(c, (c.duration * i) / 8, P); applyPose(rig, P); n++; for (const v of rig.jm) if (!Number.isFinite(v)) nan++; }
  for (let i = 0; i < P0.weights.length; i += 4) { const s = P0.weights[i] + P0.weights[i + 1] + P0.weights[i + 2] + P0.weights[i + 3]; maxw = Math.max(maxw, Math.abs(s - 1)); }
  const keys = [...rig.key.keys()], need = ['hips', 'spine', 'head', 'armL', 'armR', 'forearmL', 'forearmR', 'handL', 'handR', 'uplegL', 'uplegR', 'legL', 'legR', 'footL', 'footR'];
  const miss = M.skin.joints.length === 24 ? need.filter((k) => !keys.includes(k)) : [];
  if (nan || maxw > 0.02 || miss.length) bad++;
  console.log(name.padEnd(24), 'joints', M.skin.joints.length, '· clips', M.anims.map((a) => a.name).join(','), '· poses sampled', n, '· NaN', nan, '· weight sum err', maxw.toFixed(4), miss.length ? '· MISSING ' + miss : '· humanoid keys OK');
}
console.log(bad ? 'FAILED ' + bad : 'ALL OK');
