// WORLD: area registry and validation. docs/v2/AREA_FORMAT.md
//   AREAS[id]() -> Promise<area>   (a fresh object every call; area.stage goes to compileEnv)
//   validateArea(area, twin) -> { errors, warnings, stats }      validateAll() -> { id: result }
import { ASSET_ROOT } from '../../core/assets.js';
import { compileEnv, validateEnv } from '../env/build.js';
import { ensureProps, propPack } from '../env/baked.js';
import { sectionAt } from '../b/world.js';
import SLICE0 from '../env/stage_slice0_env.js';
import { eshville } from './eshville.js';
import { graveyard } from './graveyard.js';
import { belltower } from './belltower.js';
import { ossuary } from './ossuary.js';
import { reachGrid } from './reach.js';
export { nearestFreeSpot } from './reach.js';   // WORLD-3: nearestFreeSpot(area, W, x, z) -> { x, z, y, moved } - where a crossing that would land inside something puts the hero (AREA_FORMAT 14)
import { AREA_FOLDS } from './folds.js';
import { flameSpots } from '../env/props2.js';

export const ENEMY_KINDS = ['melee', 'ranged', 'skeleton_soldier', 'skeleton_mage', 'plague_corpse', 'grave_ghost', 'gravekeeper_armor', 'bat', 'banshee_queen'];
export const ACTOR_MODELS = ['alberto', 'edmund', 'elise', 'hadwin', 'hadwin1', 'lotte', 'marta', 'rook', 'sera', 'villager_f', 'villager_m', 'kael'];
export const INTERACT_KINDS = ['bell', 'door', 'sign', 'chest', 'lever', 'grave', 'rest', 'shop', 'pull', 'ring'];   // ring = a whip ring (AREA_FORMAT 13): { x, z, y (ground under the ring), h (ring height above y), landing: {x, y, z} }
export const ANCHOR_KINDS = ['fire', 'embers', 'smoke', 'mist', 'candle', 'glow_red', 'fog_bank', 'leaves'];
export const ROOMS = ['street', 'alley', 'courtyard', 'hall', 'crypt', 'tower', 'field'];
export const DEFAULT_AREA = 'eshville_now';
/** kinds of the prototype rules (scene v2c walks areas with them) */
export const PROTO_KIND = { melee: 'melee', ranged: 'ranged', skeleton_soldier: 'melee', skeleton_mage: 'ranged', plague_corpse: 'melee', grave_ghost: 'ranged', gravekeeper_armor: 'melee', bat: 'melee', banshee_queen: 'melee' };

/** the baked prop pack must be in memory before compileEnv (statues, gargoyles, trees are baked meshes) */
export async function ensureWorldAssets() {
  if (propPack()) return true;
  try { await ensureProps(`${ASSET_ROOT}v2/props/props.bin`); return true; } catch (e) { console.warn('[world] baked props not loaded, using low-poly stand-ins:', String(e?.message ?? e)); return false; }
}
/** fill the stage fields that come from area fields (docs/v2/AREA_FORMAT.md 2) */
export function finishArea(a) {
  const st = a.stage, d = a.spawns.default;
  st.start = { x: d.x, z: d.z };
  st.spawns = a.enemies.map((e) => ({ kind: e.kind, x: e.x, z: e.z, yard: !!e.yard, active: !!e.active, group: e.group ?? null, face: e.face ?? null, rise: !!e.rise }));   // rise: lies in the ground until the hero is near (PLAY_API)
  st.decals = st.decals ?? [];
  if (st.folds == null) st.folds = AREA_FOLDS[a.id] ?? null;   // small materials drawn with a look-alike texture of their chunk (fewer draw calls; ENV_KIT 18)
  // whip rings -> the rules' hook points (src/v2/play/sim.js reads W.hookPoints: { id, x, z, y, h, to: [x, z] })
  st.hookPoints = a.interact.filter((it) => it.kind === 'ring' && it.landing).map((it) => ({ id: it.id, x: it.x, z: it.z, y: it.y ?? 0, h: it.h ?? 150, to: [it.landing.x, it.landing.z] }));
  a.camera = Object.fromEntries(st.sections.map((s) => [s.id, s.cam]));
  a.anchors = a.anchors ?? [];
  // SPEED-FIRE: the game draws no flame geometry (env/props2.js flames) - every place a flame stands needs a particle fire anchor.
  // An anchor already there gets the flame's width; a missing one (braziers) is added with the size of what burns there.
  for (const f of flameSpots(st.parts)) {
    const an = a.anchors.find((q) => q.kind === 'fire' && Math.hypot(q.x - f.x, q.z - f.z) < 60 && Math.abs((q.y ?? 0) - f.y) < 70);
    if (an) { if (an.w == null) an.w = f.w; }
    else a.anchors.push({ id: `fire_${f.part.mesh}_${Math.round(f.x)}_${Math.round(f.z)}`, kind: 'fire', x: f.x, y: f.y, z: f.z, size: f.size, w: f.w, light: true });
  }
  return a;
}
const slice0 = () => finishArea({
  id: 'slice0', name: '시범 구간', era: 'now', twin: null, room: 'street', rooms: { street: 'street', corner: 'alley', alley: 'alley', yard: 'courtyard' }, music: null,
  stage: { ...SLICE0 }, spawns: { default: { x: SLICE0.start.x, z: SLICE0.start.z, face: [1, 0], section: 'street' } }, exits: [], actors: [],
  enemies: SLICE0.spawns.map((s) => ({ kind: s.kind, x: s.x, z: s.z, yard: !!s.yard, group: s.yard ? 'yard' : 'route' })), triggers: [], interact: [], anchors: [],
});
const make = (f) => async (flags = {}) => { await ensureWorldAssets(); const a = finishArea(f(flags ?? {})); a.flags = { ...(flags ?? {}) }; return a; };
/** AREAS[id](flags) builds the area for the given story flags (docs/v2/AREA_FORMAT.md 13). No argument = the base state (nothing done yet). */
export const AREAS = {
  eshville_now: make((f) => eshville('now', f)),
  eshville_past: make((f) => eshville('past', f)),
  graveyard_now: make((f) => graveyard('now', f)),
  graveyard_past: make((f) => graveyard('past', f)),
  belltower_now: make((f) => belltower('now', f)),
  ossuary_now: make((f) => ossuary('now', f)),
  ossuary_past: make((f) => ossuary('past', f)),
  slice0: make(slice0),
};
/** story flags that change what an area is built from (AREA_FORMAT 13). validateAll() checks the base state and every one of these states. */
export const AREA_FLAGS = {
  eshville_now: ['door_pulled', 'gate_open', 'promise', 'elise_home', 'bells_answered'],
  eshville_past: ['past_gate_open', 'past_street_clear'],
  graveyard_now: ['bell_hung', 'ossuary_open', 'carved_a', 'carved_b'],
  graveyard_past: ['bell_hung', 'carved_a', 'carved_b'],
  belltower_now: ['fell'],
  ossuary_now: ['wedge_stone', 'wedge_wood', 'knells_hung', 'queen_sent'],
  ossuary_past: ['wedge_stone', 'wedge_wood', 'knell_1', 'knell_2', 'knell_3', 'knell_4', 'queen_fled', 'queen_sent', 'elise_found'],
  slice0: [],
};
/** the states validateAll() walks: base, each flag alone, and all of them together (wedge_stone and wedge_wood never together) */
export function areaStates(id) {
  const F = AREA_FLAGS[id] ?? [], out = [{}];
  for (const f of F) out.push({ [f]: true });
  if (F.length > 1) out.push(Object.fromEntries(F.filter((f) => f !== 'wedge_wood').map((f) => [f, true])));
  return out;
}
export const stateName = (flags) => Object.keys(flags ?? {}).filter((k) => flags[k]).join('+') || 'base';

const unit = (v) => Array.isArray(v) && v.length === 2 && Math.abs(Math.hypot(v[0], v[1]) - 1) < 0.02;
/** -> { errors, warnings, stats }. twin = the loaded twin area (optional; validateAll passes it) */
export function validateArea(a, twin = null) {
  const errors = [], warnings = [], E = (m) => errors.push(m), Wn = (m) => warnings.push(m);
  for (const k of ['id', 'name', 'era', 'stage', 'spawns', 'exits', 'actors', 'enemies', 'triggers', 'interact']) if (a?.[k] == null) E('missing field: ' + k);
  if (errors.length) return { errors, warnings, stats: {} };
  if (![...String(a.name)].some((c) => c.charCodeAt(0) >= 0xac00 && c.charCodeAt(0) <= 0xd7a3)) E('name must be Korean: ' + a.name);
  if (a.era !== 'now' && a.era !== 'past') E('era must be now | past');
  if (!a.spawns.default) E('spawns.default missing');
  if (a.room && !ROOMS.includes(a.room)) Wn('unknown room tag: ' + a.room);
  for (const [s, r] of Object.entries(a.rooms ?? {})) if (!ROOMS.includes(r)) Wn(`rooms.${s}: unknown tag ${r}`);
  const ground = { ...a.stage, spawns: [] };   // the prototype's own flood knows no whip rings, bells or hops: enemies are checked below against this lane's reach grid (same rule: standable + reachable)
  let W = null;
  try { const r = validateEnv(ground); for (const e of r.errors) if (!e.includes('닿을 수 있는 바닥')) E('stage: ' + e); /* the prototype's flood knows no hops, rings or bells: sections are checked below with this lane's reach grid */ W = compileEnv(a.stage); } catch (e) { E('compile failed: ' + String(e?.message ?? e)); }
  if (!W || !a.spawns.default) return { errors, warnings, stats: {} };
  if (W.sprites.some((s) => s.kind === 'prop')) E('flat prop cards left: ' + W.sprites.filter((s) => s.kind === 'prop').map((s) => s.img).join(', '));
  W.hookPoints = a.stage.hookPoints ?? [];
  const d = a.spawns.default, ids = new Set(), secIds = new Set(a.stage.sections.map((s) => s.id));
  // reach = walking + jumping + whip rings + crossing at a bell to the other night and back (the hero keeps x, z): both nights are flooded together until nothing new is found
  // a.entry = spawn names behind something shut in this state (a closed gate): the hero can only stand there after coming in through that spawn, so they start the flood too
  const entry = (a.entry ?? []).map((n) => a.spawns[n]).filter(Boolean).map((s) => [s.x, s.z]);
  let G = reachGrid(W, d.x, d.z, 14, { hooks: W.hookPoints, seeds: entry });
  if (twin && twin.twin === a.id) {
    let W2 = null; try { W2 = compileEnv(twin.stage); W2.hookPoints = twin.stage.hookPoints ?? []; } catch { W2 = null; }
    if (W2) {
      const bells = (ar) => ar.interact.filter((it) => it.kind === 'bell' && it.event === 'bell.ring'), seedsA = [], seedsB = [], td = twin.spawns.default;
      for (let pass = 0, grew = true; pass < 6 && grew; pass++) {
        grew = false;
        const GB = reachGrid(W2, td.x, td.z, 14, { hooks: W2.hookPoints, seeds: seedsB });
        for (const b of bells(twin)) { const at = GB.near(b.x, b.z, b.r); if (at && !seedsA.some((p) => p[0] === at[0] && p[1] === at[1]) && !G.reachable(at[0], at[1]) && !G.blocked(at[0], at[1], 14)) { seedsA.push(at); grew = true; } }
        if (grew) G = reachGrid(W, d.x, d.z, 14, { hooks: W.hookPoints, seeds: [...entry, ...seedsA] });
        for (const b of bells(a)) { const at = G.near(b.x, b.z, b.r); if (at && !seedsB.some((p) => p[0] === at[0] && p[1] === at[1])) { seedsB.push(at); grew = true; } }
      }
    }
  }
  const uniq = (id, what) => { if (!id) E(what + ' without id'); else if (ids.has(what + ':' + id)) E(`duplicate ${what} id: ${id}`); ids.add(what + ':' + id); };
  if (!G.reachable(d.x, d.z)) E('default spawn is not on standable ground');
  for (const s of a.stage.sections) { if (!s.cam) E(`section ${s.id}: no camera rig`); if (!s.label) Wn(`section ${s.id}: no label`); if (!G.anyIn(s.x0, s.x1, s.z0, s.z1)) E(`section ${s.id}: no reachable ground`); }
  for (const [n, s] of Object.entries(a.spawns)) {
    if (!G.reachable(s.x, s.z)) E(`spawn ${n} (${s.x},${s.z}): not reachable from the default spawn`);
    if (!unit(s.face)) E(`spawn ${n}: face must be a unit [dx, dz]`);
    const sec = sectionAt(W, s.x, s.z); if (!sec) E(`spawn ${n}: outside every section`); else if (s.section && s.section !== sec.id) E(`spawn ${n}: section says ${s.section}, stands in ${sec.id}`);
  }
  for (const x of a.exits) {
    uniq(x.id, 'exit');
    if (!(x.x1 > x.x0 && x.z1 > x.z0)) E(`exit ${x.id}: empty box`); else if (!G.anyIn(x.x0, x.x1, x.z0, x.z1)) E(`exit ${x.id}: no reachable ground inside the box`);
    if (!x.to || !x.spawn) E(`exit ${x.id}: needs to + spawn`); else if (!AREAS[x.to]) Wn(`exit ${x.id}: target area ${x.to} is not built yet`);
    if (!x.label) Wn(`exit ${x.id}: no label`);
  }
  for (const p of a.actors) {
    uniq(p.id, 'actor');
    if (!ACTOR_MODELS.includes(p.model)) E(`actor ${p.id}: unknown model ${p.model}`);
    if (!unit(p.face)) E(`actor ${p.id}: face must be a unit [dx, dz]`);
    if (!p.talk) Wn(`actor ${p.id}: no talk key`);
    if (G.blocked(p.x, p.z, p.r ?? 16)) E(`actor ${p.id} (${p.x},${p.z}): inside a wall or a prop, or no ground`);
    else if (!G.near(p.x, p.z, (p.r ?? 16) + 50)) E(`actor ${p.id} (${p.x},${p.z}): the hero cannot get within talking distance`);
  }
  a.enemies.forEach((e, i) => {
    if (!ENEMY_KINDS.includes(e.kind)) E(`enemies[${i}]: unknown kind ${e.kind}`);
    if (e.kind === 'bat') return;
    if (G.blocked(e.x, e.z, 14)) E(`enemies[${i}] ${e.kind} (${e.x},${e.z}): inside a wall or a prop, or no ground`); else if (!G.reachable(e.x, e.z)) E(`enemies[${i}] ${e.kind} (${e.x},${e.z}): not reachable`);
    if (!e.group) Wn(`enemies[${i}]: no group`);
  });
  const groups = new Set(a.enemies.map((e) => e.group));
  for (const t of a.triggers) {
    uniq(t.id, 'trigger');
    if (!t.event) E(`trigger ${t.id}: no event`);
    if (!G.anyIn(t.x0, t.x1, t.z0, t.z1)) E(`trigger ${t.id}: no reachable ground inside the box`);
    if (t.wake && !groups.has(t.wake)) E(`trigger ${t.id}: wakes unknown group ${t.wake}`);
  }
  for (const it of a.interact) {
    uniq(it.id, 'interact');
    if (!INTERACT_KINDS.includes(it.kind)) E(`interact ${it.id}: unknown kind ${it.kind}`);
    if (!(it.r > 0)) E(`interact ${it.id}: needs a radius`); else if (!G.near(it.x, it.z, it.r)) E(`interact ${it.id} (${it.x},${it.z}): no reachable ground within r ${it.r}`);
    if (!it.label) Wn(`interact ${it.id}: no label`);
    if (it.kind === 'ring') {
      const L = it.landing;
      if (!L || !Number.isFinite(L.x) || !Number.isFinite(L.z)) E(`ring ${it.id}: needs landing {x, y, z}`);
      else { const g = G.ground(L.x, L.z); if (!Number.isFinite(g)) E(`ring ${it.id}: landing (${L.x},${L.z}) has no ground`); else if (Math.abs(g - (L.y ?? g)) > 1) E(`ring ${it.id}: landing y ${L.y} but the ground there is ${g}`); if (G.blocked(L.x, L.z, 14)) E(`ring ${it.id}: landing is inside a wall or a prop`); if (Math.hypot(L.x - it.x, L.z - it.z) > 330) Wn(`ring ${it.id}: landing is ${Math.round(Math.hypot(L.x - it.x, L.z - it.z))} from the ring (rules: hookRange 330)`); }
    }
  }
  for (const an of a.anchors ?? []) if (!ANCHOR_KINDS.includes(an.kind)) E(`anchor ${an.id}: unknown kind ${an.kind}`);
  for (const f of flameSpots(a.stage.parts)) if (!(a.anchors ?? []).some((q) => q.kind === 'fire' && Math.hypot(q.x - f.x, q.z - f.z) < 60 && Math.abs((q.y ?? 0) - f.y) < 70)) E(`${f.part.mesh} at (${f.x}, ${f.z}): a flame stands here but no fire anchor draws it (the game bakes no flame geometry)`);
  for (const s of Object.keys(a.rooms ?? {})) if (!secIds.has(s)) Wn(`rooms.${s}: no such section`);
  if (a.twin) {
    if (!AREAS[a.twin]) Wn(`twin ${a.twin} is not built yet`);
    else if (twin) {
      if (twin.twin !== a.id) E(`twin ${a.twin} does not point back (${twin.twin})`);
      if (twin.era === a.era) E('twin has the same era');
      const same = (p, q) => JSON.stringify(p) === JSON.stringify(q);
      if (!same(Object.keys(a.spawns).sort(), Object.keys(twin.spawns).sort())) E('twin: spawn names differ');
      else for (const n of Object.keys(a.spawns)) if (a.spawns[n].x !== twin.spawns[n].x || a.spawns[n].z !== twin.spawns[n].z) E(`twin: spawn ${n} stands elsewhere`);
      if (!same(a.exits.map((x) => [x.id, x.x0, x.x1, x.z0, x.z1]), twin.exits.map((x) => [x.id, x.x0, x.x1, x.z0, x.z1]))) E('twin: exits differ');
      if (!same(a.stage.sections.map((s) => [s.id, s.x0, s.x1, s.z0, s.z1]), twin.stage.sections.map((s) => [s.id, s.x0, s.x1, s.z0, s.z1]))) E('twin: sections differ');
      const fp = (st) => st.parts.filter((p) => ['floor', 'wall', 'stairs', 'pave', 'block'].includes(p.t) && !p.state).map((p) => [p.t, p.x, p.z, p.w, p.d, p.y ?? 0]);   // a part with state: '<flag>' exists only in that story state of one night (a rebuilt stair): not part of the shared footprint
      if (!same(fp(a.stage), fp(twin.stage))) E('twin: floors / building footprints differ');
    }
  }
  const st = W.env.stats;
  return { errors, warnings, stats: { parts: a.stage.parts.length, boxes: W.boxes.length, lights: W.lights.length, tris: st.tris, chunks: st.chunks, bytes: st.bytes, textures: st.textures, reachCells: G.cells, enemies: a.enemies.length, actors: a.actors.length, exits: a.exits.length, triggers: a.triggers.length, interact: a.interact.length, anchors: (a.anchors ?? []).length, decals: a.stage.decals.length } };
}
/** every area in its base state and in every flagged state (AREA_FLAGS), each with its twin in the same state. Keys: id (base) and id@flag+flag */
export async function validateAll() {
  const out = {};
  for (const id of Object.keys(AREAS)) for (const flags of areaStates(id)) {
    const a = await AREAS[id](flags), twin = a.twin && AREAS[a.twin] ? await AREAS[a.twin](flags) : null, r = validateArea(a, twin);
    for (const x of a.exits) if (AREAS[x.to]) { const t = await AREAS[x.to](flags); if (!t.spawns[x.spawn]) r.errors.push(`exit ${x.id}: ${x.to} has no spawn ${x.spawn}`); }
    out[stateName(flags) === 'base' ? id : id + '@' + stateName(flags)] = r;
  }
  return out;
}
