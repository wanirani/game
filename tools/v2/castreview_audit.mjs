// v2 castreview: 실은 캐릭터 GLB 를 게임 런타임(glb.js · skel.js) 그대로 읽어 숫자로 검사한다. docs/v2/CAST_R1.md §검수
//   node tools/v2/castreview_audit.mjs [--json=out.json] assets/v2/char3d/*.glb
// 보는 것: 파일 크기(상한) · 삼각형 · 꼭짓점 · 뼈 · 텍스처 한 변 · 쉬는 자세의 키와 발바닥 높이 · 앞(+Z)을 보는가(발끝) ·
//   든 클립과, 빌려 온 공용 클립(카엘의 run · 라이브러리의 walk · hit · idle)에서 삼각형 변이 얼마나 늘어나는가(치마 늘어짐 · 튀는 꼭짓점) · 발이 땅을 파고드는가 · NaN.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, CPose, clipFromAnim, sampleClip, applyPose } from '../../src/v2/char3d/skel.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const jsonOut = (process.argv.find((a) => a.startsWith('--json=')) ?? '').slice(7);
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const CAP = (id) => (/^w_/.test(id) ? 150e3 : id === 'banshee_queen' ? 1.6e6 : /^(skeleton|plague|grave|bat|villager)/.test(id) ? 500e3 : 900e3);

function imgSize(b) {
  if (!b || b.length < 30) return null;
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20), 'png'];
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const f = b.toString('latin1', 12, 16);
    if (f === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff, 'webp'];
    if (f === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1, 'webp-ll']; }
    if (f === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3), 'webp-x'];
  }
  if (b[0] === 0xff && b[1] === 0xd8) { let o = 2; while (o < b.length) { const m = b[o + 1], l = b.readUInt16BE(o + 2); if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5), 'jpeg']; o += 2 + l; } }
  return null;
}

// 공용 클립: 카엘의 run + 라이브러리 묶음
function loadShared() {
  const out = [];
  const add = (file, want) => {
    const M = buildModel(readGLB(path.join(root, file))), rig = new Rig(M);
    for (const a of M.anims) if (want.some((w) => (w instanceof RegExp ? w.test(a.name) : w === a.name))) out.push({ name: path.basename(file, '.glb') + ':' + a.name, clip: clipFromAnim(rig, a, { name: a.name, loop: true, inPlace: true }) });
  };
  add('assets/v2/char3d/kael.glb', [/run/i]);
  try { add('assets/v2/char3d/clips/locomotion.glb', ['walk', 'idle', 'sprint']); add('assets/v2/char3d/clips/reactions.glb', [/^hit/]); add('assets/v2/char3d/clips/story.glb', [/^talk|^sit/]); } catch (e) { console.error('shared clips:', e.message); }
  return out;
}
const SHARED = loadShared();

function skin(rig, P0, out) {
  const jm = rig.jm, pos = P0.pos, J = P0.joints, Wt = P0.weights, n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; let ox = 0, oy = 0, oz = 0;
    for (let k = 0; k < 4; k++) { const w = Wt[i * 4 + k]; if (!w) continue; const o = J[i * 4 + k] * 12; ox += w * (jm[o] * x + jm[o + 1] * y + jm[o + 2] * z + jm[o + 3]); oy += w * (jm[o + 4] * x + jm[o + 5] * y + jm[o + 6] * z + jm[o + 7]); oz += w * (jm[o + 8] * x + jm[o + 9] * y + jm[o + 10] * z + jm[o + 11]); }
    out[i * 3] = ox; out[i * 3 + 1] = oy; out[i * 3 + 2] = oz;
  }
  return out;
}
const bbox = (p) => { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < b[k]) b[k] = p[i + k]; if (p[i + k] > b[k + 3]) b[k + 3] = p[i + k]; } return b; };
function edgeLens(p, idx) { const L = new Float32Array(idx.length); for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e] * 3, b = idx[t + (e + 1) % 3] * 3; L[t + e] = Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]); } return L; }

const rows = []; let bad = 0;
for (const f of files) {
  const id = path.basename(f, '.glb'), bytes = fs.statSync(f).size, G = readGLB(f), M = buildModel(G), P0 = M.prims[0];
  const r = { id, bytes, cap: CAP(id), sizeOk: bytes <= CAP(id), tris: M.stats.tris, verts: M.stats.verts, joints: M.stats.joints, prims: M.prims.length, tex: M.images.map((im) => imgSize(im.bytes ? Buffer.from(im.bytes) : null)), clips: M.anims.map((a) => `${a.name}(${a.duration.toFixed(2)}s)`), issues: [] };
  if (!r.sizeOk) r.issues.push(`size ${bytes} > cap ${r.cap}`);
  if (!M.skin) {
    const b = bbox(P0.pos); r.dims = [b[3] - b[0], b[4] - b[1], b[5] - b[2]].map((v) => +v.toFixed(3)); r.min = b.slice(0, 3).map((v) => +v.toFixed(3)); rows.push(r); continue;
  }
  const rig = new Rig(M), P = new CPose(); rig.pose();
  const rest = skin(rig, P0, new Float32Array(P0.pos.length)), b = bbox(rest), H = b[4] - b[1];
  r.height = +H.toFixed(3); r.minY = +b[1].toFixed(3); r.width = +(b[3] - b[0]).toFixed(3); r.depth = +(b[5] - b[2]).toFixed(3); r.centerX = +((b[0] + b[3]) / 2).toFixed(3);
  // 앞을 보는가: 발목 아래 꼭짓점(바닥에서 4% 안)의 z 평균이 골반 z 보다 앞(+)인가 · 발끝 뼈가 발목보다 앞인가
  let zs = 0, zn = 0; for (let i = 0; i < rest.length; i += 3) if (rest[i + 1] < b[1] + H * 0.04) { zs += rest[i + 2]; zn++; }
  const hip = rig.boneWorld('hips'), toe = rig.boneWorld('toeL') ?? rig.boneWorld('toeR'), foot = rig.boneWorld('footL');
  r.footZ = zn ? +(zs / zn - (hip ? hip[14] : 0)).toFixed(3) : null; r.toeZ = toe && foot ? +(toe[14] - foot[14]).toFixed(3) : null;
  r.keys = [...rig.key.keys()].length;
  if (M.stats.joints === 24) { if (r.toeZ != null ? r.toeZ <= 0 : r.footZ != null && r.footZ <= 0) r.issues.push('faces -Z? toeZ=' + r.toeZ + ' footZ=' + r.footZ); }
  if (Math.abs(r.minY) > 0.03 * H) r.issues.push('rest minY ' + r.minY + ' (not on ground)');
  let maxw = 0; for (let i = 0; i < P0.weights.length; i += 4) maxw = Math.max(maxw, Math.abs(P0.weights[i] + P0.weights[i + 1] + P0.weights[i + 2] + P0.weights[i + 3] - 1));
  if (maxw > 0.02) r.issues.push('weights sum err ' + maxw.toFixed(3));
  // 클립 시험
  const L0 = edgeLens(rest, P0.idx), tmp = new Float32Array(rest.length);
  const own = M.anims.map((a) => ({ name: a.name, clip: clipFromAnim(rig, a, { name: a.name }) }));
  const tests = M.stats.joints === 24 ? [...own, ...SHARED] : own;
  r.motion = [];
  for (const t of tests) {
    let worst = 0, over = 0, nan = 0, lo = 1e9, hi = -1e9, maxH = 0;
    for (let i = 0; i < 8; i++) {
      sampleClip(t.clip, (t.clip.duration * (i + 0.5)) / 8, P); applyPose(rig, P);
      for (const v of rig.jm) if (!Number.isFinite(v)) nan++;
      skin(rig, P0, tmp); const bb = bbox(tmp); lo = Math.min(lo, bb[1]); hi = Math.max(hi, bb[4]); maxH = Math.max(maxH, bb[3] - bb[0], bb[5] - bb[2]);
      const L = edgeLens(tmp, P0.idx); let o = 0;
      for (let e = 0; e < L.length; e++) { if (L0[e] < H * 0.004) continue; const q = L[e] / L0[e]; if (q > worst) worst = q; if (q > 2.5) o++; }
      over = Math.max(over, o);
    }
    r.motion.push({ clip: t.name, stretchMax: +worst.toFixed(2), edgesOver2_5: over, pctOver: +((100 * over) / L0.length).toFixed(2), minY: +lo.toFixed(3), nan });
    if (nan) r.issues.push(t.name + ': NaN');
    if (over / L0.length > 0.01) r.issues.push(`${t.name}: ${((100 * over) / L0.length).toFixed(1)}% edges stretched >2.5x (max ${worst.toFixed(1)}x)`);
  }
  rig.T.set(rig.restT); rig.R.set(rig.restR);
  if (r.issues.length) bad++;
  rows.push(r);
}
for (const r of rows) {
  console.log(`${r.id.padEnd(20)} ${String(r.bytes).padStart(8)} B ${r.sizeOk ? 'ok ' : 'OVER'} tris ${String(r.tris).padStart(6)} verts ${String(r.verts).padStart(6)} bones ${String(r.joints).padStart(2)} tex ${r.tex.map((t) => (t ? t[0] + 'x' + t[1] + ' ' + t[2] : '?')).join(',')} ${r.height != null ? `H ${r.height} minY ${r.minY} W ${r.width} D ${r.depth} toeZ ${r.toeZ} footZ ${r.footZ}` : 'dims ' + r.dims + ' min ' + r.min}`);
  console.log(`    clips: ${r.clips.join(', ') || '-'}`);
  if (r.motion) console.log('    motion: ' + r.motion.map((m) => `${m.clip} x${m.stretchMax} ${m.pctOver}% y${m.minY}`).join(' | '));
  if (r.issues.length) console.log('    ISSUES: ' + r.issues.join(' ; '));
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
console.log(bad ? `WITH ISSUES: ${bad}` : 'ALL OK');
