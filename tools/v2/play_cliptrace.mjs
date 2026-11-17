// PLAY: print the sword tip path of a library clip on Kael (model space: +Z front, +X left, +Y up), to pick strike windows.
//   node tools/v2/play_cliptrace.mjs atk2 atk3 launcher [--step=0.033]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, Animator } from '../../src/v2/char3d/skel.js';
import { Char3D, GRIP } from '../../src/v2/char3d/hero3d.js';
import { clipsFromGroup } from '../../src/v2/play/animlib.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), DIR = path.join(root, 'assets/v2/char3d');
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'clips/index.json'), 'utf8')), lib = {};
for (const g of index.groups) Object.assign(lib, clipsFromGroup(buildModel(readGLB(path.join(DIR, 'clips', g.file))), index));
const model = buildModel(readGLB(path.join(DIR, (process.env.MODEL || 'kael') + '.glb')));
const ch = Object.create(Char3D.prototype);
Object.assign(ch, { asset: { model, clips: lib }, rig: new Rig(model), dx: 1, dz: 0, scale: 1, M: new Float32Array(16), WM: new Float32Array(16), _g: new Float32Array(16), _t: new Float32Array(16), grip: { ...GRIP } });
ch.anim = new Animator(ch.rig, lib);
const ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const step = Number((process.argv.find((a) => a.startsWith('--step=')) || '--step=0.0333').slice(7));
const deg = (r) => Math.round((r * 180) / Math.PI);
for (const name of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const c = lib[name]; if (!c) { console.log(name, 'not in library'); continue; }
  console.log(`\n${name}  dur ${c.duration.toFixed(2)}  strike ${JSON.stringify(c.meta.strike)}  ev ${JSON.stringify(c.events)}`);
  let prev = null;
  for (let t = 0; t <= c.duration + 1e-6; t += step) {
    ch.anim.play(name, { fade: 0, time: t, restart: t === 0 }); ch.anim.update(0);
    const W = ch.weaponMatrix(ID), p = [W[4] * 70 + W[12], W[5] * 70 + W[13], W[6] * 70 + W[14]];
    const hip = ch.rig.boneWorld('hips'), head = ch.rig.boneWorld('head'), hand = ch.rig.boneWorld('handR');
    const v = prev ? Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) / step : 0; prev = p;
    const lean = deg(Math.atan2(head[14] - hip[14], head[13] - hip[13]));
    console.log(`  t ${t.toFixed(2)}  tip az ${String(deg(Math.atan2(p[0], p[2]))).padStart(4)}°  h ${p[1].toFixed(2)}  fwd ${p[2].toFixed(2)}  side ${p[0].toFixed(2)}  v ${v.toFixed(1).padStart(5)}  hipY ${hip[13].toFixed(2)} hipZ ${hip[14].toFixed(2)}  lean ${String(lean).padStart(3)}°  ${'#'.repeat(Math.min(40, Math.round(v / 1.5)))}`);
  }
}
