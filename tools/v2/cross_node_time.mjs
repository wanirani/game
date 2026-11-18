// CROSSING lane (node, no browser): how long does building a twin area take on the main thread? (AREAS[id](flags) + compileEnv + nearestFreeSpot)
//   node tools/v2/cross_node_time.mjs
import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { AREAS, nearestFreeSpot } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const ids = Object.keys(AREAS);
console.log('areas:', ids.join(', '));
for (const id of ids) {
  const t = [];
  for (let k = 0; k < 4; k++) {
    const t0 = performance.now(); const def = await AREAS[id]({}); const t1 = performance.now();
    const W = compileEnv(def.stage ?? def); const t2 = performance.now();
    const sp = def.spawns?.default ?? { x: 0, z: 0 };
    let fs = null; try { fs = nearestFreeSpot({ stage: def.stage ?? def, spawns: def.spawns ?? {}, interact: def.interact ?? [] }, W, sp.x, sp.z); } catch (e) { fs = String(e.message); }
    const t3 = performance.now();
    t.push([t1 - t0, t2 - t1, t3 - t2]);
    if (k === 3) { let bytes = 0; for (const m of W.env.meshes) bytes += m.data.byteLength; console.log(id.padEnd(16), 'twin', String(def.twin).padEnd(16), 'def/compile/freeSpot ms (4 runs):', t.map((q) => q.map((v) => v.toFixed(0)).join('/')).join('  '), '| meshes', W.env.meshes.length, 'bytes', (bytes / 1e6).toFixed(1) + 'MB', 'boxes', W.boxes.length, 'spot', JSON.stringify(fs)); }
  }
}
