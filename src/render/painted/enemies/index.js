// Painted enemy registry: render id (ENEMIES[id].render) → painted renderer module { spec, draw }.
// A module may serve several render ids (palette/weapon variants of one rig, see docs/art/ENEMY_PIPELINE.md §6).
// render/enemies.js draws the module when its rig is loaded, else the vector renderer (with a short crossfade).
import * as skeleton from './skeleton.js';
import * as armor_knight from './armor_knight.js';
import * as gravedigger from './gravedigger.js';
import * as bat from './bat.js';
import * as ghost from './ghost.js';

import { registerPainted } from '../registry.js';
import { requestRig } from '../enemy_kit.js';

export const PAINTED_ENEMIES = {};
/** also listed in the shared painted registry (kind 'enemy') so tooling / kill switches see every painted creature;
 *  drawing goes through render/enemies.js (facing, elite scale, vector crossfade), not registry.drawPaintedDirect */
function reg(mod, ids = [mod.spec.id]) {
  for (const id of ids) {
    PAINTED_ENEMIES[id] = mod;
    registerPainted(id, { kind: 'enemy', module: { id, kind: 'enemy', tier: mod.spec.tier, async load() { const r = requestRig(mod.spec); await r.promise; if (!r.ready) throw new Error('rig ' + mod.spec.src); return r; }, draw() {} } });
  }
}

reg(skeleton);
reg(armor_knight);
reg(gravedigger);
reg(bat);
reg(ghost);
