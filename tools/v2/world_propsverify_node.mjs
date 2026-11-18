// PROPS-VERIFY (node, no browser): pack numbers and footprint against the visible shape, placements per area.
//   node tools/v2/world_propsverify_node.mjs [--json out.json]
import fs from 'node:fs';
import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { propPack } = await import('../../src/v2/env/baked.js');
const { AREAS } = await import('../../src/v2/world/index.js');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] ?? true]); return a; }, []));
const P = propPack(), out = { props: {}, areas: {} };
console.log('prop           tris  h    visible half x/z (at 20%..80% height)   foot x/z   footH  ratio x/z   glow');
for (const [name, d] of Object.entries(P.head.props)) {
  const nv = d.nv, qp = new Int16Array(P.ab, P.base + d.pos, nv * 3);
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, lx0 = 1e9, lx1 = -1e9, lz0 = 1e9, lz1 = -1e9, y0 = 1e9;
  for (let i = 0; i < nv; i++) {
    const v = [0, 1, 2].map((k) => d.lo[k] + ((qp[i * 3 + k] + 32768) / 65535) * (d.hi[k] - d.lo[k]));
    x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); z0 = Math.min(z0, v[2]); z1 = Math.max(z1, v[2]); y0 = Math.min(y0, v[1]);
    if (v[1] < 80) { lx0 = Math.min(lx0, v[0]); lx1 = Math.max(lx1, v[0]); lz0 = Math.min(lz0, v[2]); lz1 = Math.max(lz1, v[2]); }   // the part at hero height (hero h 80 in the rules)
  }
  const r = { tris: d.ni / 3, h: d.h, x: [x0, x1], z: [z0, z1], lowX: [lx0, lx1], lowZ: [lz0, lz1], y0, foot: d.foot, footH: d.footH, glow: !!d.glow, emis: !!d.emis, cell: d.cell };
  out.props[name] = r;
  const f = d.foot ?? [0, 0];
  console.log(`${name.padEnd(13)} ${String(r.tris).padStart(4)}  ${String(d.h).padStart(3)}  x ${lx0.toFixed(0)}..${lx1.toFixed(0)} z ${lz0.toFixed(0)}..${lz1.toFixed(0)} (all x ${x0.toFixed(0)}..${x1.toFixed(0)} z ${z0.toFixed(0)}..${z1.toFixed(0)} y0 ${y0.toFixed(1)})  foot ${f[0]}/${f[1]}  ${d.footH ?? '-'}  cover x ${(2 * f[0] / (lx1 - lx0)).toFixed(2)} z ${(2 * f[1] / (lz1 - lz0)).toFixed(2)}  off x ${((lx0 + lx1) / 2).toFixed(0)} z ${((lz0 + lz1) / 2).toFixed(0)}  ${d.glow ? 'glow' : ''}${d.emis ? ' emis' : ''}`);
}
for (const id of Object.keys(AREAS)) {
  const a = await AREAS[id](), st = a.stage ?? a, parts = [];
  const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(walk); return; } if (typeof o.mesh === 'string' && (o.t === 'prop' || o.t === 'deco') && typeof o.x === 'number') parts.push(o); for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v); };
  walk(st);
  const by = {};
  for (const p of parts) { const k = p.mesh + (p.code ? ' (code)' : '') + (p.kind ? ':' + p.kind : ''); (by[k] ?? (by[k] = [])).push(`${p.t === 'deco' ? 'd' : 'p'}(${Math.round(p.x)},${Math.round(p.z)}${p.h ? ' h' + p.h : ''}${p.flip ? ' flip' : ''}${p.rot ? ' rot' + (+p.rot).toFixed(2) : ''}${p.lit === false ? ' unlit' : ''})`); }
  out.areas[id] = by;
  console.log(`\n[${id}] ${parts.length} prop parts`);
  for (const [k, v] of Object.entries(by)) console.log(`  ${k} x${v.length}: ${v.slice(0, 14).join(' ')}${v.length > 14 ? ' …' : ''}`);
}
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(out, null, 1));
