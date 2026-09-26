// Painted enemy registry: render id (ENEMIES[id].render) → painted renderer module { spec, draw }.
// A module may serve several render ids (palette/weapon variants of one rig, see docs/art/ENEMY_PIPELINE.md §6).
// render/enemies.js draws the module when its rig is loaded, else the vector renderer (with a short crossfade).
import * as skeleton from './skeleton.js';
import * as armor_knight from './armor_knight.js';
import * as gravedigger from './gravedigger.js';
import * as bat from './bat.js';
import * as ghost from './ghost.js';

export const PAINTED_ENEMIES = {};
function reg(mod, ids = [mod.spec.id]) { for (const id of ids) PAINTED_ENEMIES[id] = mod; }

reg(skeleton);
reg(armor_knight);
reg(gravedigger);
reg(bat);
reg(ghost);
