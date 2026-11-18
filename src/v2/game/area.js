// v2g area loading seam (docs/v2/ENGINE_API.md 3). Every area comes from src/v2/world AREAS (docs/v2/AREA_FORMAT.md) through
// WORLD_LOADER in seams.js — the test route too (AREAS.slice0), so its statues come from the baked prop pack.
// Only when the world module cannot be loaded at all does the test route fall back to the kit stage compiled here.
import STAGE from '../env/stage_slice0_env.js';
import { compileEnv } from '../env/build.js';
import { KIT_TEX } from '../env/mats.js';
import { WORLD_LOADER } from './seams.js';

export const DEFAULT_AREA = 'eshville_now';   // what 「본 게임」 opens
export const TEST_AREA = 'slice0';             // the old test route: index.html?scene=v2g&area=slice0
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
export const kitTexPath = (n) => (KIT_TEX[n]?.file ? 'v2/' + KIT_TEX[n].file : ('v2/env/' + n + '.webp').replace('/env/../', '/'));   // '../props/props_atlas' -> v2/props/props_atlas.webp

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
 * so the report can say what is missing as a 3D mesh. An unknown id gives the test route (area.test = true).
 */
/** every collision box gets the same keys in the same order. The collision loops (ground under a point, sliding along walls) read
 *  x0 ... walk of every box many times a tick; the test route had 5 different key layouts among its 78 boxes, which makes the
 *  engine fall back to a generic read that allocates a number object per read (CORE-VERIFY heap profile: about 38 KB a frame). */
function uniformBoxes(W) {
  const B = W?.boxes; if (!Array.isArray(B)) return;
  const keys = ['x0', 'x1', 'z0', 'z1', 'y0', 'y1', 'solid', 'walk'];
  for (let i = 0; i < B.length; i++) for (const k of Object.keys(B[i])) if (!keys.includes(k)) keys.push(k);
  for (let i = 0; i < B.length; i++) { const b = B[i], o = {}; for (let j = 0; j < keys.length; j++) o[keys[j]] = b[keys[j]]; B[i] = o; }
}
/** collision the area asks for beyond the stage: a wall in every exit box (solid while the exit is locked — the gate prop has no
 *  collision of its own, AREA_FORMAT 3) and a small box under every solid person. The scene finds them again by b.gate / b.actor. */
function addBoxes(W, def) {
  const B = W.boxes, ground = (x, z) => { let g = -Infinity; for (let i = 0; i < B.length; i++) { const b = B[i]; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 > g) g = b.y1; } return Number.isFinite(g) ? g : 0; };
  for (const x of Array.isArray(def.exits) ? def.exits : []) B.push({ x0: x.x0, x1: x.x1, z0: x.z0, z1: x.z1, y0: -400, y1: 2400, solid: !!x.locked, walk: false, gate: x.id });
  for (const a of Array.isArray(def.actors) ? def.actors : []) {
    if (a.solid === false) continue;
    const r = Math.max(12, a.r ?? 16), g = a.y ?? ground(a.x, a.z);
    B.push({ x0: a.x - r, x1: a.x + r, z0: a.z - r, z1: a.z + r, y0: g - 20, y1: g + 110, solid: !a.when, walk: false, actor: a.id });
  }
}
/** flags = the story flags the area is built from (AREA_FORMAT 13: AREAS[id](flags) — a shut gate, a mended stair ...). */
export async function loadArea(id = DEFAULT_AREA, flags = null) {
  let def = null, got = id;
  if (WORLD_LOADER) {
    try {
      const m = await WORLD_LOADER(); let f = m.AREAS?.[id];
      if (!f) { console.warn('[v2g] no area "' + id + '" in the world module, using the test route'); got = TEST_AREA; f = m.AREAS?.[TEST_AREA]; }
      def = f ? await f(flags ? { ...flags } : {}) : null;
    } catch (e) { console.warn('[v2g] area "' + id + '" failed to load, using the test route:', String(e?.message ?? e)); def = null; }
  }
  if (!def) got = TEST_AREA;
  const stage = def ? fillStage(def, def.stage ?? def) : STAGE;
  const W = compileEnv(stage);
  W.hookPoints = Array.isArray(stage.hookPoints) ? stage.hookPoints : [];   // whip rings (interact kind 'ring') -> the rules' hook points (Sim reads W.hookPoints)
  if (def) addBoxes(W, def);
  uniformBoxes(W);
  const flatProps = W.sprites.filter((s) => s.kind === 'prop').map((s) => ({ img: s.img, x: s.x, z: s.z }));
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    id: got, name: def?.name ?? stage.name ?? W.name ?? '', era: def?.era === 'past' ? 'past' : 'now', twin: def?.twin ?? null, W, def, fromWorld: !!def, test: got === TEST_AREA,
    rooms: def?.rooms ?? null, room: typeof def?.room === 'string' ? def.room : null, music: def?.music ?? null,
    spawns: def?.spawns ?? {}, exits: arr(def?.exits), triggers: arr(def?.triggers), interact: arr(def?.interact), actors: arr(def?.actors), anchors: arr(def?.anchors), flatProps,
  };
}
/** which single story flag of this area opens that exit? -> { flag: true } | null. Used by the stand-in rule while no story is
 *  plugged in (the arena is cleared -> the key-locked exit opens): the area is then rebuilt in the state the story would give it. */
export async function flagsThatOpen(id, flags, exitId) {
  if (!WORLD_LOADER) return null;
  try {
    const m = await WORLD_LOADER(), f = m.AREAS?.[id], names = m.AREA_FLAGS?.[id] ?? [];
    if (!f) return null;
    for (const n of names) {
      if (flags?.[n]) continue;
      const a = await f({ ...(flags ?? {}), [n]: true }), x = (a?.exits ?? []).find((q) => q.id === exitId);
      if (x && !x.locked) return { [n]: true };
    }
  } catch (e) { console.warn('[v2g] area states of "' + id + '":', String(e?.message ?? e)); }
  return null;
}
/** does the world module know this area? (exits to areas that are not built yet only show their label) */
export async function hasArea(id) {
  if (!WORLD_LOADER) return id === TEST_AREA;
  try { const A = (await WORLD_LOADER()).AREAS; return typeof id === 'string' && !!A && Object.prototype.hasOwnProperty.call(A, id) && typeof A[id] === 'function'; } catch { return false; }   // own entries only: a tampered save naming "__proto__" is not an area (INTEGRATE-VERIFY)
}
/** what the story host needs from the world module: which flags each area is built from (AREA_FLAGS) */
export async function worldInfo() {
  if (!WORLD_LOADER) return null;
  try { const m = await WORLD_LOADER(); return { AREA_FLAGS: m.AREA_FLAGS ?? {} }; } catch { return null; }
}
/** where a bell crossing lands: the same x, z, or the nearest free reachable spot when something stands there in this night
 *  (world module nearestFreeSpot, AREA_FORMAT 14). -> { x, z, y, moved } | null (no floor anywhere near: the crossing is refused) */
export async function freeSpot(area, x, z) {
  if (!WORLD_LOADER || !area?.def) return { x, z, y: null, moved: 0 };
  try {
    const m = await WORLD_LOADER(); if (typeof m.nearestFreeSpot !== 'function') return { x, z, y: null, moved: 0 };
    const d = area.def, r = m.nearestFreeSpot({ stage: d.stage ?? d, spawns: d.spawns ?? {}, interact: Array.isArray(d.interact) ? d.interact : [] }, area.W, x, z);
    return r ? { x: r.x, z: r.z, y: r.y, moved: r.moved } : null;
  } catch (e) { console.warn('[v2g] free spot:', String(e?.message ?? e)); return { x, z, y: null, moved: 0 }; }
}
