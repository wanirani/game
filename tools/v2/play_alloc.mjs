// PLAY: bytes allocated per tick by the rules (Sim.update) and by the drive functions (driveHero / driveActor), in steady play.
//   node tools/v2/play_alloc.mjs [--ticks=100000] [--entry=<path to another play/index.js>] [--only=<part of a scenario name>] [--profile]
// Method ("counting allocator"): the young generation is made so large that no garbage collection runs during a measured stretch, so the growth of
// the young space over the stretch is exactly what the code allocated (the parent counts --trace-gc lines to prove no collection ran). The script restarts itself with --expose-gc --max-semi-space-size.
// Scenarios: fight (hero bot + six kinds kept alive, 100,000 ticks) · run (stick circles and reversals, no enemies) · boss (the queen, hero bot).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = fileURLToPath(import.meta.url), root = path.resolve(path.dirname(here), '../..');
if (typeof globalThis.gc !== 'function') {   // parent: run the measuring child with a huge young generation and GC tracing, then count the collections inside each stretch
  const r = spawnSync(process.execPath, ['--expose-gc', '--trace-gc', '--min-semi-space-size=1024', '--max-semi-space-size=1024', '--max-old-space-size=4096', here, ...process.argv.slice(2)], { encoding: 'utf8', maxBuffer: 1 << 26 });
  let cur = null, gcs = 0; const out = [];
  for (const line of (r.stdout || '').split('\n')) {
    if (line.startsWith('@@S ')) { cur = line.slice(4); gcs = 0; }
    else if (line.startsWith('@@E ')) { out.push(line.slice(4) + `   · collections during the stretch: ${gcs}`); cur = null; }
    else if (/Scavenge|Mark-Compact|Mark-sweep/i.test(line)) { if (cur) gcs++; }
    else if (line.trim()) out.push(line);
  }
  console.log(out.join('\n')); if (r.stderr) console.error(r.stderr.slice(0, 2000));
  process.exit(r.status ?? 1);
}
const v8 = await import('node:v8');
const young = () => { let n = 0; for (const sp of v8.getHeapSpaceStatistics()) if (sp.space_name === 'new_space' || sp.space_name === 'new_large_object_space') n += sp.space_used_size; return n; };
const opt = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const PROFILE = process.argv.includes('--profile'), N = Number(opt('ticks', 100000)), entry = opt('entry', path.join(root, 'src/v2/play/index.js'));
const P = await import(pathToFileURL(path.resolve(entry)).href);
const { Sim, TUNE, KINDS, flatArena, driveHero, driveActor, usePlayClips, UNIT } = P;
const { readGLB } = await import('./char3d_glbio.mjs');
const { buildModel } = await import('../../src/v2/char3d/glb.js');
const { Rig } = await import('../../src/v2/char3d/skel.js');
const { buildClips } = await import('../../src/v2/char3d/clips.js');
const { Char3D, GRIP } = await import('../../src/v2/char3d/hero3d.js');
const { clipsFromGroup } = await import('../../src/v2/play/animlib.js');
const { PoseAnimator } = await import('../../src/v2/game/anim.js').catch(() => ({}));   // the scene's allocation-free animator (read-only use); falls back to char3d's
const { Animator } = await import('../../src/v2/char3d/skel.js');
const DIR = path.join(root, 'assets/v2/char3d'), index = JSON.parse(fs.readFileSync(path.join(DIR, 'clips/index.json'), 'utf8')), lib = {};
for (const g of index.groups) if (['locomotion', 'combat', 'reactions', 'magic', 'enemy'].includes(g.g)) Object.assign(lib, clipsFromGroup(buildModel(readGLB(path.join(DIR, 'clips', g.file))), index));
usePlayClips(lib);
const models = new Map();
function mkChar(id) {
  let model = models.get(id); if (!model) { model = buildModel(readGLB(path.join(DIR, id + '.glb'))); models.set(id, model); }
  const rig = new Rig(model), asset = { model, clips: buildClips(rig, model.anims), url: 'assets/v2/char3d/' + id + '.glb' }, ch = Object.create(Char3D.prototype);
  Object.assign(ch, { asset, rig: new Rig(model), dx: 1, dz: 0, scale: UNIT, kbT: 0, kbSp: 0, M: new Float32Array(16), WM: new Float32Array(16), _g: new Float32Array(16), _t: new Float32Array(16), grip: { ...GRIP } });
  ch.anim = new (PoseAnimator ?? Animator)(ch.rig, asset.clips); ch.anim.play('idle', { fade: 0 }); ch.anim.update(0);
  return ch;
}
let seed = 7; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const DT = 1 / 60, inp = { mx: 0, mz: 0, jump: false, jumpHeld: false, attack: false, attackHeld: false, dash: false, guard: false, lockNext: false, skill: false, bell: false, jumpUsed: false };
function pilot(sim, i, mode) {   // no allocation in here
  const h = sim.hero, E = sim.enemies; inp.attack = inp.dash = inp.jump = inp.guard = inp.skill = inp.bell = false; inp.mx = inp.mz = 0;
  if (mode === 'run') { const k = (i / 90) | 0, a = k % 3 === 2 ? (k * 2.4) % 6.28 : i * 0.05; inp.mx = Math.cos(a); inp.mz = Math.sin(a); return; }
  let near = null, nd = 1e9; for (let j = 0; j < E.length; j++) { const e = E[j]; if (e.dead || e.state === 'dead') continue; const dx = e.x - h.x, dz = e.z - h.z, d = Math.sqrt(dx * dx + dz * dz); if (d < nd) { nd = d; near = e; } }
  if (!near) return;
  const ph = (i / 240) | 0;
  if (ph % 4 === 3) { inp.guard = true; return; }
  if (nd > 110) { inp.mx = (near.x - h.x) / nd; inp.mz = (near.z - h.z) / nd; } else if (i % 16 === 0 && mode !== 'calm') inp.attack = true;
  if (i % 150 === 0) { inp.dash = true; inp.mx = 1; }
  if (i % 400 === 0) inp.bell = true;
}
const ONLY = opt('only', '');   // --only=<part of a scenario name>
async function scenario(name, spawns, mode, drive) {
  if (ONLY && !name.includes(ONLY)) return 0;
  const sim = new Sim(flatArena(700, 500, spawns), {}), hero = mkChar('kael'), chars = new Map(); let bad = 0;
  const one = (i) => {
    pilot(sim, i, mode); sim.update(DT, inp);
    const h = sim.hero; h.hp = h.hpMax; const E = sim.enemies;
    for (let j = 0; j < E.length; j++) { const e = E[j]; if (!e.dead && e.state !== 'dead' && !e.def.boss) e.hp = e.hpMax; if (e.def.boss && e.hp < e.hpMax * 0.6) e.hp = e.hpMax; }   // nobody dies: the same six fight for the whole stretch
    if (drive) { driveHero(hero, h, DT, TUNE); for (let j = 0; j < E.length; j++) { const e = E[j]; if (e.dead) continue; let ch = chars.get(e.id); if (!ch) { ch = mkChar(e.def.model); chars.set(e.id, ch); } driveActor(ch, e, DT); } }
    if (!Number.isFinite(h.x)) bad++;
  };
  for (let i = 0; i < 6000; i++) one(i);   // warm up: optimise the code, build the lazy tables
  globalThis.gc(); globalThis.gc();
  if (PROFILE) {   // --profile: where the bytes come from (sampling heap profiler, by function)
    const { Session } = await import('node:inspector/promises'), ses = new Session(); ses.connect();
    await ses.post('HeapProfiler.startSampling', { samplingInterval: 256, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    for (let i = 6000; i < 6000 + 30000; i++) one(i);
    const { profile } = await ses.post('HeapProfiler.stopSampling'), by = new Map();
    const walk = (n) => { const k = `${n.callFrame.functionName || '(anonymous)'}  ${path.basename(n.callFrame.url || '')}:${n.callFrame.lineNumber + 1}`; if (n.selfSize) by.set(k, (by.get(k) ?? 0) + n.selfSize); for (const c of n.children ?? []) walk(c); };
    walk(profile.head);
    console.log(`-- ${name}: top allocators (bytes/tick over 30000 ticks)`);
    for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`   ${(v / 30000).toFixed(1).padStart(8)}  ${k}`);
    ses.disconnect(); return 0;
  }
  console.log('@@S ' + name);
  const h0 = young(), t0 = performance.now();
  for (let i = 6000; i < 6000 + N; i++) one(i);
  const h1 = young(), ms = performance.now() - t0;
  console.log(`@@E ${name.padEnd(36)} ${((h1 - h0) / N).toFixed(1).padStart(8)} bytes/tick   (${N} ticks, ${(ms / N * 1000).toFixed(1)} µs/tick${bad ? ', NaN ' + bad : ''}, enemies alive ${sim.enemies.filter((e) => !e.dead).length})`);
  return (h1 - h0) / N;
}
const SIX = ['skeleton_soldier', 'skeleton_mage', 'plague_corpse', 'grave_ghost', 'gravekeeper_armor', 'bat'].map((kind, i) => ({ kind, x: 160 + (i % 3) * 90, z: -120 + i * 50, active: true }));
console.log('entry', path.relative(root, path.resolve(entry)));
await scenario('rules: fight, six kinds', SIX, 'fight', false);
await scenario('rules: six kinds, hero only guards', SIX, 'calm', false);
await scenario('rules: run / reversals, no enemies', [], 'run', false);
if (KINDS.banshee_queen?.attacks?.length) await scenario('rules: boss', [{ kind: 'banshee_queen', x: 240, z: 0, active: true }], 'fight', false);
await scenario('rules + drive: fight, six kinds', SIX, 'fight', true);
await scenario('rules + drive: run, no enemies', [], 'run', true);
