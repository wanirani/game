// PROPS lane: print what is inside generated prop models (bounds, triangles, texture, connected parts).
//   node tools/v2/world_glb_info.mjs <dir with <id>.glb> [--only a,b]
import fs from 'node:fs';
import path from 'node:path';
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
const dir = process.argv[2], only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null;
for (const fn of fs.readdirSync(dir).filter((n) => n.endsWith('.glb')).sort()) {
  const id = fn.replace(/\.glb$/, ''); if (only && !only.has(id)) continue;
  const M = buildModel(readGLB(path.join(dir, fn)));
  for (const pr of M.prims) {
    const nv = pr.pos.length / 3, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pr.pos[i * 3 + k]); hi[k] = Math.max(hi[k], pr.pos[i * 3 + k]); }
    const im = M.images[pr.image];
    console.log(id.padEnd(12), 'prims', M.prims.length, 'nv', nv, 'tris', pr.idx.length / 3, 'size', hi.map((v, k) => (v - lo[k]).toFixed(2)).join(' x '), 'lo', lo.map((v) => v.toFixed(2)).join(','), 'img', im ? `${im.mime ?? ''} ${im.bytes?.length}` : 'none', 'keys', Object.keys(pr).join(','));
  }
}
