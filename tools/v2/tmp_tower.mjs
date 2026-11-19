import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { AREAS } = await import('../../src/v2/world/index.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { groundAt } = await import('../../src/v2/play/collide.js');
const area = await AREAS.belltower_now({});
const W = compileEnv(area.stage);
const near = W.boxes.filter((b) => b.x1 > 380 && b.x0 < 720 && b.z1 > 60 && b.z0 < 420 && (b.y0 ?? 0) < 150);
for (const b of near) console.log('box', [b.x0, b.x1, b.z0, b.z1].map((v) => Math.round(v)).join(' '), 'y', Math.round(b.y0 ?? 0), Math.round(b.y1 ?? 0), b.solid ? 'solid' : '', b.walk ? 'walk' : '', b.stair ? 'stair' : '');
console.log('triggers', JSON.stringify(area.triggers.map((t) => ({ id: t.id, event: t.event, x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, y: t.y }))).slice(0, 600));
const h = { x: 491, z: 190, y: 0 };
for (const opt of [{ R: 26, onFoot: true }, { R: 14, onFoot: true }, { R: 14, onFoot: false }, { R: 6, onFoot: false }]) {
  let G = reachGrid(W, h.x, h.z, opt.R, { onFoot: opt.onFoot }), from = 'own cell';
  if (!G.cells && opt.R > 6) {
    const free = (x, z) => { for (const b of W.boxes) if (b.solid && !b.walk && x + 10 > b.x0 && x - 10 < b.x1 && z + 10 > b.z0 && z - 10 < b.z1 && b.y1 > h.y + 18 && b.y0 < h.y + 60) return false; return true; };
    off: for (const dist of [opt.R + 8, opt.R + 22]) for (let a = 0; a < 8; a++) {
      const sx = h.x + Math.cos(a * Math.PI / 4) * dist, sz = h.z + Math.sin(a * Math.PI / 4) * dist; let clear = true;
      for (let t = 0.25; t <= 1; t += 0.25) if (!free(h.x + (sx - h.x) * t, h.z + (sz - h.z) * t)) { clear = false; break; }
      const gy = groundAt(W, sx, sz, h.y + 30); if (!clear || !Number.isFinite(gy) || Math.abs(gy - h.y) > 12) continue;
      const g2 = reachGrid(W, sx, sz, opt.R, { onFoot: opt.onFoot }); if (g2.cells) { G = g2; from = Math.round(sx) + ',' + Math.round(sz); break off; }
    }
  }
  const p = G.near(360, 930, 15) ?? G.near(360, 930, 34), path = p ? G.path(p[0], p[1], true) : null;
  console.log('R', opt.R, 'onFoot', opt.onFoot, 'flood from', from, 'cells', G.cells, 'near', p && p.map(Math.round).join(','), 'path', path ? path.length + ' pts: ' + path.filter((q, i) => i % 2 === 0).slice(0, 22).map((q) => q.map(Math.round).join(',')).join(' > ') : null);
}
