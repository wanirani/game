// v2g area loading seam (docs/v2/ENGINE_API.md 3). Today: the decorated test route (env kit stage).
// Next: src/v2/world AREAS (docs/v2/AREA_FORMAT.md) through WORLD_LOADER in seams.js.
import STAGE from '../env/stage_slice0_env.js';
import { compileEnv } from '../env/build.js';
import { KIT_TEX } from '../env/mats.js';
import { WORLD_LOADER } from './seams.js';

export const DEFAULT_AREA = 'slice0';
const ROOM = { street: 'street', corner: 'alley', alley: 'alley', stairs: 'alley', garden: 'courtyard', yard: 'courtyard' };
const ROOMS_OK = { street: 1, alley: 1, courtyard: 1, hall: 1 };   // reverb rooms the sound module knows; other tags (crypt, tower, field) fall back
const ROOM_ALT = { crypt: 'hall', tower: 'hall', field: 'street' };
/** room reverb name for a section id (area: rooms{sectionId: tag} > section.room > area.room > built-in table) */
export function roomOf(area, sectionId) {
  let r = area.rooms?.[sectionId] ?? null;
  if (!r) { const S = area.W.sections; for (let i = 0; i < S.length; i++) if (S[i].id === sectionId && S[i].room) r = S[i].room; }
  r = r ?? area.room ?? ROOM[sectionId] ?? 'street';
  return ROOMS_OK[r] ? r : ROOM_ALT[r] ?? 'street';
}
/** file path (under assets/) of a world texture name that is not a v1 tile: kit file, or KIT_TEX[n].file (docs/v2/AREA_FORMAT.md 2) */
export const kitTexPath = (n) => (KIT_TEX[n]?.file ? 'v2/' + KIT_TEX[n].file : 'v2/env/' + n + '.webp');

/** area fields -> the three stage fields the rules read (idempotent: the WORLD loader may already have done it) */
function fillStage(def, stage) {
  const sp = def.spawns?.default;
  if (sp && Number.isFinite(sp.x) && Number.isFinite(sp.z)) stage.start = { ...(stage.start ?? {}), x: sp.x, z: sp.z };
  if (Array.isArray(def.enemies) && def.enemies.length && !(Array.isArray(stage.spawns) && stage.spawns.length)) stage.spawns = def.enemies.map((e) => ({ kind: e.kind, x: e.x, z: e.z, yard: !!e.yard, active: !!e.active, group: e.group ?? null, face: e.face ?? null }));
  if (def.camera && Array.isArray(stage.sections)) for (const s of stage.sections) if (def.camera[s.id]) s.cam = def.camera[s.id];
  return stage;
}

/**
 * -> { id, name, era, twin, W, def, rooms, room, music, spawns, exits, triggers, interact, actors, anchors, flatProps, fromWorld }
 * W = compileEnv() result. Flat prop cards (W.sprites kind 'prop') are never drawn by v2g; they are listed in flatProps
 * so the report can say what is missing as a 3D mesh. An unknown id (or no WORLD module yet) gives the test route.
 */
export async function loadArea(id = DEFAULT_AREA) {
  let def = null;
  if (id !== DEFAULT_AREA && WORLD_LOADER) {
    try { const m = await WORLD_LOADER(); const f = m.AREAS?.[id]; def = f ? await f() : null; if (!f) console.warn('[v2g] no area "' + id + '" in the world module, using the test route'); }
    catch (e) { console.warn('[v2g] area "' + id + '" failed to load, using the test route:', String(e?.message ?? e)); def = null; }
  }
  const stage = def ? fillStage(def, def.stage ?? def) : STAGE;
  const W = compileEnv(stage);
  const flatProps = W.sprites.filter((s) => s.kind === 'prop').map((s) => ({ img: s.img, x: s.x, z: s.z }));
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    id: def ? id : DEFAULT_AREA, name: def?.name ?? stage.name ?? W.name ?? '', era: def?.era ?? 'now', twin: def?.twin ?? null, W, def, fromWorld: !!def,
    rooms: def?.rooms ?? null, room: typeof def?.room === 'string' ? def.room : null, music: def?.music ?? null,
    spawns: def?.spawns ?? {}, exits: arr(def?.exits), triggers: arr(def?.triggers), interact: arr(def?.interact), actors: arr(def?.actors), anchors: arr(def?.anchors), flatProps,
  };
}
/** does the world module know this area? (exits to areas that are not built yet only show their label) */
export async function hasArea(id) {
  if (id === DEFAULT_AREA) return true;
  if (!WORLD_LOADER) return false;
  try { return !!(await WORLD_LOADER()).AREAS?.[id]; } catch { return false; }
}
