import { ENEMIES } from '/home/user/game/src/data/enemies.js';
import { STAGES } from '/home/user/game/src/data/stages.js';
const first = {};
for (const [sid, s] of Object.entries(STAGES)) for (const id of s.enemies ?? []) first[id] ??= sid;
for (const [id, d] of Object.entries(ENEMIES)) console.log([id, d.name, first[id] ?? '-', `${d.size?.w}x${d.size?.h}`, d.ai, d.flying ? 'fly' : '', d.phase ? 'phase' : '', d.material].join('|'));
