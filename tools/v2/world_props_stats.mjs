// PROPS lane: static triangles per area and per prop kind (no browser).   node tools/v2/world_props_stats.mjs [--pack dir] [--json file]
import fs from 'node:fs';
import { loadPropsNode } from './world_node.mjs';
const a = process.argv.slice(2), opt = {}; for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) opt[a[i].slice(2)] = a[i + 1];
const pack = loadPropsNode((opt.pack ?? 'assets/v2/props') + '/props.bin');
const { AREAS } = await import('../../src/v2/world/index.js'), { compileEnv } = await import('../../src/v2/env/build.js'), out = {};
for (const id of Object.keys(AREAS)) {
  const A = await AREAS[id](), W = compileEnv(A.stage), st = W.env.stats, props = Object.entries(st.props).sort((x, y) => y[1][1] - x[1][1]);
  out[id] = { tris: st.tris, chunks: Object.fromEntries(Object.entries(st.chunks).map(([k, v]) => [k, v.tris])), props: st.props, anchors: (A.anchors ?? []).length };
  console.log(`${id.padEnd(15)} ${st.tris} static tris | props ${props.reduce((s, p) => s + p[1][1], 0)} | ` + props.slice(0, 14).map(([n, [c, t]]) => `${n} ${c}x=${t}`).join(' · '));
}
if (pack) console.log('pack: ' + Object.entries(pack.head.props).map(([n, d]) => `${n} ${d.tris}`).join(' · ') + ` | total ${Object.values(pack.head.props).reduce((s, d) => s + d.tris, 0)} tris, atlas ${pack.head.atlas.w}x${pack.head.atlas.h}`);
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(out, null, 1));
