// BREAK lane: what stands where in an area (to place breakables beside it).  node tools/v2/break_dump.mjs <areaId> [flag,flag]
const { AREAS } = await import('../../src/v2/world/index.js');
const id = process.argv[2] ?? 'eshville_now', flags = Object.fromEntries((process.argv[3] ?? '').split(',').filter(Boolean).map((f) => [f, true]));
const a = await AREAS[id](flags), r = (v) => Math.round(v);
console.log('sections', a.stage.sections.map((s) => `${s.id}[${s.x0}..${s.x1} x ${s.z0}..${s.z1}]`).join(' '));
console.log('spawns', Object.entries(a.spawns).map(([n, s]) => `${n}(${s.x},${s.z})`).join(' '));
console.log('exits', a.exits.map((x) => `${x.id}[${x.x0}..${x.x1} x ${x.z0}..${x.z1}]${x.locked ? ' locked' : ''}`).join(' '));
console.log('actors', a.actors.map((p) => `${p.id}(${p.x},${p.z})`).join(' '));
console.log('interact', a.interact.map((p) => `${p.id}:${p.kind}(${p.x},${p.z} r${p.r})`).join(' '));
console.log('triggers', a.triggers.map((x) => `${x.id}[${x.x0}..${x.x1} x ${x.z0}..${x.z1}]`).join(' '));
console.log('enemies', a.enemies.map((e) => `${e.kind.slice(0, 8)}(${e.x},${e.z})`).join(' '));
const P = a.stage.parts;
console.log('props', P.filter((p) => p.t === 'prop' || p.t === 'deco').map((p) => `${p.mesh}(${r(p.x)},${r(p.z)}${p.y ? ',y' + r(p.y) : ''}${p.solid ? ' s' + p.solid + (p.solidZ ? '/' + p.solidZ : '') : ''})`).join(' '));
console.log('floors', P.filter((p) => p.t === 'floor' || p.t === 'pave').map((p) => `${p.t}[${r(p.x)}..${r(p.x + p.w)} x ${r(p.z)}..${r(p.z + p.d)}${p.y ? ' y' + r(p.y) : ''}]`).join(' '));
console.log('walls/blocks', P.filter((p) => ['wall', 'block', 'house', 'fence', 'stairs'].includes(p.t)).map((p) => `${p.t}[${r(p.x)}..${r(p.x + (p.w ?? 0))} x ${r(p.z)}..${r(p.z + (p.d ?? 0))}${p.y ? ' y' + r(p.y) : ''}${p.h ? ' h' + r(p.h) : ''}]`).join(' '));
console.log('breakables', (a.breakables ?? []).length);
