// CHAPTER-AUDIT lane (read-only helper): the story hooks of every area in a given flag state.
//   node tools/v2/chapter_dump.mjs [areaId|all] [flag,flag] [--json file]
const { AREAS, AREA_FLAGS } = await import('../../src/v2/world/index.js');
const argv = process.argv.slice(2), ji = argv.indexOf('--json'), jf = ji >= 0 ? argv.splice(ji, 2)[1] : null;
const which = argv[0] && argv[0] !== 'all' ? [argv[0]] : Object.keys(AREAS).filter((k) => k !== 'slice0');
const flags = Object.fromEntries((argv[1] ?? '').split(',').filter(Boolean).map((f) => [f, true]));
const out = {};
for (const id of which) {
  const a = await AREAS[id](flags), o = out[id] = {};
  o.name = a.name; o.era = a.era; o.twin = a.twin; o.flags = AREA_FLAGS[id];
  o.sections = a.stage.sections.map((s) => ({ id: s.id, label: s.label, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 }));
  o.spawns = a.spawns; o.entry = a.entry ?? null;
  o.exits = a.exits.map((x) => ({ id: x.id, to: x.to, spawn: x.spawn, locked: x.locked ?? null, label: x.label, x0: x.x0, x1: x.x1, z0: x.z0, z1: x.z1 }));
  o.actors = a.actors.map((p) => ({ id: p.id, model: p.model, talk: p.talk, when: p.when ?? null, x: p.x, z: p.z, y: p.y ?? 0, pose: p.pose ?? null }));
  o.triggers = a.triggers.map((t) => ({ ...t }));
  o.interact = a.interact.map((t) => ({ ...t }));
  const g = {}; for (const e of a.enemies) { const k = e.group ?? '-'; (g[k] = g[k] ?? []).push(`${e.kind}(${e.x},${e.z}${e.yard ? ' yard' : ''}${e.active ? ' act' : ''}${e.rise ? ' rise' : ''})`); }
  o.groups = g; o.hooks = a.stage.hookPoints; o.breakables = (a.breakables ?? []).length; o.music = a.music;
  console.log(`\n=== ${id} [${Object.keys(flags).join('+') || 'base'}] ${a.name} era=${a.era} twin=${a.twin}`);
  console.log(' sections ' + o.sections.map((s) => `${s.id}「${s.label}」[${s.x0}..${s.x1} x ${s.z0}..${s.z1}]`).join(' '));
  console.log(' spawns ' + Object.entries(a.spawns).map(([n, s]) => `${n}(${s.x},${s.z}${s.y ? ',y' + s.y : ''})`).join(' ') + (a.entry ? ' entry=' + a.entry : ''));
  console.log(' exits ' + o.exits.map((x) => `${x.id}->${x.to}/${x.spawn}[${x.x0}..${x.x1} x ${x.z0}..${x.z1}]${x.locked ? ' LOCKED:' + x.locked : ''}`).join(' '));
  console.log(' actors ' + o.actors.map((p) => `${p.id}:${p.talk}(${p.x},${p.z}${p.y ? ',y' + p.y : ''})${p.when ? ' when=' + p.when : ''}`).join(' '));
  console.log(' triggers ' + a.triggers.map((t) => `${t.id}=${t.event}[${t.x0}..${t.x1} x ${t.z0}..${t.z1}]${t.wake ? ' wake=' + t.wake : ''}${t.once === false ? ' again' : ''}${t.y0 != null ? ' y' + t.y0 + '..' + t.y1 : ''}`).join(' '));
  console.log(' interact ' + a.interact.map((t) => `${t.id}:${t.kind}=${t.event ?? ''}${t.data ? JSON.stringify(t.data) : ''}(${t.x},${t.z}${t.y ? ',y' + t.y : ''} r${t.r})${t.locked ? ' LOCKED:' + t.locked : ''}${t.when ? ' when=' + t.when : ''}${t.landing ? ' land=' + [t.landing.x, t.landing.z, t.landing.y] : ''}`).join(' '));
  console.log(' groups ' + Object.entries(g).map(([k, v]) => `${k}{${v.join(' ')}}`).join(' '));
}
if (jf) { const fs = await import('node:fs'); fs.writeFileSync(jf, JSON.stringify(out, null, 1)); console.log('wrote ' + jf); }
