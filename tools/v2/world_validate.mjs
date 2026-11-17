// WORLD lane: validate every area in node (docs/v2/AREA_FORMAT.md 10).   node tools/v2/world_validate.mjs [--json out.json]
import fs from 'node:fs';
import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { validateAll } = await import('../../src/v2/world/index.js');
const R = await validateAll(); let bad = 0;
for (const [id, r] of Object.entries(R)) {
  const s = r.stats;
  console.log(`[${id}] errors ${r.errors.length} · warnings ${r.warnings.length} · parts ${s.parts} · boxes ${s.boxes} · lights ${s.lights} · static tris ${s.tris} · vertex ${(s.bytes / 1024) | 0} KB · reach cells ${s.reachCells} · enemies ${s.enemies} · actors ${s.actors} · exits ${s.exits} · interact ${s.interact}`);
  for (const [c, q] of Object.entries(s.chunks ?? {})) console.log(`      chunk ${c}: ${q.tris} tris · ${q.draws} draws`);
  if (s.textures) console.log('      textures: ' + s.textures.join(' '));
  for (const e of r.errors) { console.log('  ✗ ' + e); bad++; }
  for (const w of r.warnings) console.log('  · ' + w);
}
const j = process.argv.indexOf('--json'); if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(R, null, 1));
console.log(bad ? `FAIL (${bad} errors)` : 'ALL OK');
process.exit(bad ? 1 : 0);
