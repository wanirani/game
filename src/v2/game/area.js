// v2g area loading seam (docs/v2/ENGINE_API.md 3). Today: the decorated test route (env kit stage).
// Next: src/v2/world AREAS (docs/v2/AREA_FORMAT.md) through WORLD_LOADER in seams.js.
import STAGE from '../env/stage_slice0_env.js';
import { compileEnv } from '../env/build.js';
import { WORLD_LOADER } from './seams.js';

export const DEFAULT_AREA = 'slice0';
const ROOM = { street: 'street', corner: 'alley', alley: 'alley', stairs: 'alley', garden: 'courtyard', yard: 'courtyard' };
/** room reverb name for a section id (area definition may override with rooms: { sectionId: 'hall' } or room: 'hall') */
export function roomOf(area, sectionId) { return area.rooms?.[sectionId] ?? area.room ?? ROOM[sectionId] ?? 'street'; }

/**
 * -> { id, name, W, def, rooms, room, music, triggers, exits, flatProps }
 * W = compileEnv() result. Flat prop cards (W.sprites kind 'prop') are never drawn by v2g; they are listed in flatProps
 * so the report can say what is missing as a 3D mesh.
 */
export async function loadArea(id = DEFAULT_AREA) {
  let def = null;
  if (id !== DEFAULT_AREA && WORLD_LOADER) {
    try { const m = await WORLD_LOADER(); const f = m.AREAS?.[id]; def = f ? await f() : null; }
    catch (e) { console.warn('[v2g] area "' + id + '" failed to load, using the test route:', String(e?.message ?? e)); def = null; }
  }
  const stage = def ? def.stage ?? def : STAGE;
  const W = compileEnv(stage);
  const flatProps = W.sprites.filter((s) => s.kind === 'prop').map((s) => ({ img: s.img, x: s.x, z: s.z }));
  return {
    id: def ? id : DEFAULT_AREA, name: def?.name ?? stage.name ?? W.name ?? '', W, def,
    rooms: def?.rooms ?? null, room: typeof def?.room === 'string' ? def.room : null, music: def?.music ?? null,
    triggers: Array.isArray(def?.triggers) ? def.triggers : [], exits: Array.isArray(def?.exits) ? def.exits : [], flatProps,
  };
}
