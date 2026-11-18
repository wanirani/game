// v2g story host — plugs the story (src/v2/data: STORY, createStory) into the scene. docs/v2/ENGINE_API.md 8-10, docs/v2/DATA_FORMAT.md 5, 6, 10.
//   - the api object of DATA_FORMAT 5 (dialogue through the HUD, banners, notices, objective line, prompts, exits, actors, camera shots,
//     waits, sound, music, candles, moon, chronicle, save, area changes, the bell crossing, the end)
//   - story flags that areas are built from (FLAGS world: true, and every name in the world module's AREA_FLAGS) go on as area flags
//   - the save: localStorage 'bn.v2.save' { v: 1, story: storyObj.save(), area, era, spawn, pos, hp, reso, nights, t } — written at the
//     story's save steps and on leaving; a broken or foreign value is ignored (new game)
// Nothing here may stop the game: every call into the story and every api function is guarded.
import { audio } from '../../core/audio.js';
import { feel } from '../feel/index.js';

export const SAVE_KEY = 'bn.v2.save';
const SAVE_V = 1;
// story / area music ids -> v1 tracks (assets/audio/music/<id>.m4a)
const MUSIC = { village_burning: 's01', village_past: 'hub', graveyard_mist: 's02', table_warm: 'inn', ossuary_now: 's03', ossuary_past: 'church', boss_banshee: 'boss', dawn_bell: 'ending' };
// camera shots of the `camera` step (TEXT.shots): what the section rig is bent to while the shot runs
export const SHOTS = {
  moon_bell: { pitch: -0.2, dist: 1500, lookY: 420 }, bell_crack: { pitch: -0.3, dist: 900, lookY: 520, shake: 0.5 }, fall: { pitch: 0.9, dist: 1300, lookY: 40, shake: 0.6, flash: true },
  wake_past: { pitch: 0.1, dist: 480, lookY: 70 }, table: { pitch: 0.22, dist: 520, lookY: 80 }, knot: { pitch: 0.16, dist: 360, lookY: 86 },
  years: { pitch: 0.5, dist: 1250, lookY: 120 }, banshee_song: { pitch: 0.12, dist: 1100, lookY: 220 }, two_keepers: { pitch: 0.2, dist: 560, lookY: 90 }, ring_widen: { pitch: 1.1, dist: 2400, lookY: 0 },
};

/** the saved game, or null (nothing saved, another version, broken data) */
export function readSave() {
  let o = null;
  try { o = JSON.parse(globalThis.localStorage?.getItem(SAVE_KEY) ?? 'null'); } catch { o = null; }
  if (!o || typeof o !== 'object' || Array.isArray(o) || o.v !== SAVE_V || !o.story || typeof o.story !== 'object' || Array.isArray(o.story)) return null;
  return o;
}
export function writeSave(o) { try { globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify(o)); return true; } catch { return false; } }
export function clearSave() { try { globalThis.localStorage?.removeItem(SAVE_KEY); } catch { /* private mode */ } }

export class StoryHost {
  /** sc = the scene, mod = src/v2/data/index.js, info = { AREA_FLAGS } of the world module (may be null) */
  constructor(sc, mod, info) {
    this.sc = sc; this.STORY = mod.STORY; this.areaFlags = info?.AREA_FLAGS ?? {};
    this.warnings = []; this.seen = [];   // seen: what the player was shown, in order (tools read it: banners, lines, notices, objectives, prompts)
    this.st = mod.createStory(mod.STORY, { warn: (m) => { this.warnings.push(m); console.warn('[story]', m); } });
    this.objective = ''; this.pill = { action: 'confirm', label: '', icon: undefined }; this.pillOn = false; this.pillT = 0; this.pills = [this.pill];
    this.waits = []; this.moves = []; this.shot = null; this.shotT = 0; this.shotDone = null; this.shotLock = false;
    this.inputLock = false; this.dirty = false; this.saves = 0; this.lastSave = null; this.ended = null; this.moon = null; this.ringN = 0; this.musicId = null; this.candleBonus = 0;
    const F = mod.STORY.FLAGS ?? {}; this.world = new Set();
    for (const k of Object.keys(F)) if (F[k] && F[k].world) this.world.add(k);
    for (const a of Object.keys(this.areaFlags)) for (const n of this.areaFlags[a]) if (F[n]) this.world.add(n);   // a name the story does not declare (past_street_clear) is not passed: the area then keeps its older condition
    this.api = this._api();
    this.story = (name, data) => {
      if (name === 'area.enter') { const id = this.sc.area?.music; if (id && MUSIC[id] && id !== this.musicId) this.api.music(id); }   // each night has its own tune (GDD 2.4 rule 1); a track the build does not ship is skipped by the audio module
      try { this.st.story(name, data, this.api); } catch (e) { console.error('[v2g] story failed on', name, e); }
    };
    this._onHide = () => { if (globalThis.document?.visibilityState === 'hidden') this.saveNow('hidden'); };
    try { globalThis.document?.addEventListener('visibilitychange', this._onHide); } catch { /* no DOM */ }
  }
  release() { try { globalThis.document?.removeEventListener('visibilitychange', this._onHide); } catch { /* no DOM */ } this.waits.length = 0; this.moves.length = 0; if (this.musicId) { try { audio.stopMusic?.(0.6); } catch { /* no audio */ } this.musicId = null; } }
  /** is the hero's input held by the story (a camera shot, a lockInput step)? */
  locks() { return this.shotLock || this.inputLock; }
  note(kind, a, b) { const S = this.seen; if (S.length < 4000) S.push([kind, a ?? '', b ?? '']); }
  flag(name) { return this.st.flag(name); }
  /** every world flag as the story has it now -> the scene's area flags (no rebuild here) */
  worldFlags() { const o = {}, f = this.st.state.flags; for (const n of this.world) o[n] = !!f[n]; return o; }
  /** does this talk key say anything (a dialogue set or a sequence listening to it)? Otherwise the person keeps the neutral line. */
  hasTalk(key) { if (!key) return false; if (this.STORY.DIALOGS?.[key]) return true; for (const e of this.STORY.EVENTS ?? []) if (e.on === 'talk' && e.match?.talk === key) return true; return false; }
  /** does any sequence listen to this event with this data (conditions aside)? When none does, the scene says its own short line. */
  hears(name, d) {
    for (const e of this.STORY.EVENTS ?? []) {
      if (e.on !== name) continue; let ok = true;
      for (const k in e.match ?? {}) { let v = d; for (const q of k.split('.')) v = v == null ? undefined : v[q]; if (v !== e.match[k]) { ok = false; break; } }
      if (ok) return true;
    }
    return false;
  }
  /** a saved game -> the story state; returns where the hero stands: { area, spawn, pos | null, hp | null, reso } (null: nothing usable) */
  restore(o) {
    try { this.st.load(o.story); } catch (e) { console.error('[v2g] story load failed', e); try { this.st.reset(); } catch { /* runner */ } return null; }
    const s = this.st.state; if (!s.area) return null;
    this.objective = this.st.objectiveText?.() ?? ''; this.moon = s.moon; this.candleBonus = Math.max(0, (s.candles | 0) - 3);
    const same = o.area === s.area && o.pos && Number.isFinite(o.pos.x) && Number.isFinite(o.pos.z);   // otherwise the save was cut in the middle of an area change: the story's area and spawn decide
    return { area: s.area, spawn: s.spawn ?? null, pos: same ? { x: o.pos.x, z: o.pos.z, y: Number.isFinite(o.pos.y) ? o.pos.y : undefined, face: Array.isArray(o.pos.face) ? o.pos.face : undefined } : null,
      hp: Number.isFinite(o.hp) && o.hp > 0 ? o.hp : null, reso: Number.isFinite(o.reso) ? o.reso : 0, nights: o.nights && typeof o.nights === 'object' ? o.nights : null };
  }
  /** new game: forget everything (the scene clears its own memory and the stored save) */
  reset() { try { this.st.reset(); } catch (e) { console.error('[v2g] story reset failed', e); } this.objective = ''; this.pillOn = false; this.waits.length = 0; this.moves.length = 0; this.shot = null; this.shotT = 0; this.shotDone = null; this.shotLock = false; this.inputLock = false; this.dirty = false; this.ended = null; this.moon = null; this.candleBonus = 0; this.lastSave = null; }
  // ───────── save ─────────
  /** the save object for the state as it is (storyObj = st.save(): the copy from before a running sequence) */
  compose(storyObj) {
    const sc = this.sc, h = sc.sim?.hero, a = sc.area;
    const o = { v: SAVE_V, t: Date.now(), story: storyObj, area: a?.id ?? storyObj.area ?? null, era: a?.era ?? storyObj.era ?? 'now', spawn: storyObj.spawn ?? null, pos: null, hp: null, reso: 0, nights: sc.nightsOut?.() ?? {} };
    if (h && sc.ready && a && !a.test) {
      const ok = h.onGround && !h.dead, p = ok ? h : h.safe ?? h;
      if (Number.isFinite(p.x) && Number.isFinite(p.z)) o.pos = { x: Math.round(p.x), z: Math.round(p.z), y: Math.round(p.y ?? 0), face: [h.dirX ?? 1, h.dirZ ?? 0] };
      o.hp = h.dead || !(h.hp > 0) ? null : Math.round(h.hp); o.reso = h.reso ?? 0;
    }
    return o;
  }
  saveNow(why) {
    const sc = this.sc; if (!sc.area || sc.area.test || this.ended) return false;
    let s = null; try { s = this.st.save(); } catch (e) { console.error('[v2g] story save failed', e); return false; }
    if (!s || !s.area) return false;   // nothing has happened yet
    const o = this.compose(s); o.why = why ?? '';
    if (o.area !== s.area) { o.pos = null; }   // a sequence is in the middle of an area change: the story's own area and spawn decide
    this.lastSave = o; this.saves++;
    return writeSave(o);
  }
  // ───────── per tick ─────────
  tick(dt) {
    const W = this.waits;
    for (let i = W.length - 1; i >= 0; i--) { const w = W[i]; if ((w.t -= dt) > 0) continue; W.splice(i, 1); try { w.fn(); } catch (e) { console.error('[v2g] story wait', e); } }
    if (this.shot && this.shotT > 0 && (this.shotT -= dt) <= 0) this._shotEnd();
    if (this.pillOn && (this.pillT -= dt) <= 0) this.pillOn = false;
    if (this.dirty && !this.st.busy && !this.sc._go && !this.sc.xing && !this.sc.hud.modal && this.sc.ready) { this.dirty = false; this.sc.rebuildArea(); }   // a flag this area is built from changed: show it once the scene is over
    const M = this.moves, sc = this.sc;
    for (let i = M.length - 1; i >= 0; i--) {
      const m = M[i], p = m.p, dx = m.x - p.x, dz = m.z - p.z, d = Math.sqrt(dx * dx + dz * dz), st = 130 * dt;
      if (d <= st || (m.t += dt) > 20 || sc.people.list.indexOf(p) < 0) {
        if (sc.people.list.indexOf(p) >= 0) { this._place(p, m.x, m.z); if (m.clip0) p.clip = m.clip0; }
        M.splice(i, 1); try { m.done?.(); } catch (e) { console.error('[v2g] story move', e); }
      } else { this._place(p, p.x + dx / d * st, p.z + dz / d * st); p.a3.dx = dx / d; p.a3.dz = dz / d; p.hx = dx / d; p.hz = dz / d; }
    }
  }
  _place(p, x, z) { const b = p.box; if (b) { const r = (b.x1 - b.x0) / 2; b.x0 = x - r; b.x1 = x + r; b.z0 = z - r; b.z1 = z + r; } p.x = x; p.z = z; }
  _shotEnd() { const d = this.shotDone; this.shotDone = null; this.shotT = 0; this.shotLock = false; if (d) { try { d(); } catch (e) { console.error('[v2g] story camera', e); } } }
  /** where a step points: a spawn name, an interact or actor id, or [x, z] */
  _spot(at) {
    const a = this.sc.area; if (!a) return null;
    if (Array.isArray(at) && Number.isFinite(at[0]) && Number.isFinite(at[1])) return { x: at[0], z: at[1] };
    if (typeof at !== 'string') return null;
    const sp = a.spawns?.[at]; if (sp) return sp;
    for (const s of a.interact) if (s.id === at) return s;
    for (const s of a.actors) if (s.id === at) return s;
    return null;
  }
  // ───────── the api of DATA_FORMAT 5 ─────────
  _api() {
    const H = this, sc = this.sc;
    return {
      // the runner prefers scene.hud.toast over api.toast (DATA_FORMAT 5): it gets a small face of the scene whose notice goes through the scene (so `seen` has it)
      scene: { get area() { return sc.area; }, hud: { toast(text, o) { sc._toast(text, typeof o === 'string' ? o : o?.kind); } } }, get sim() { return sc.sim; },
      showDialog(d) {
        H.note('line', d.speaker || (d.who === 'sign' ? '(글씨)' : '(해설)'), d.text);
        if (d.choices) H.note('choice', d.choices.join(' / '));
        if (d.choices && !sc.hud.showDialog?.length && sc.hudKind !== 'ui') { const pick = d.onChoice; d = { ...d, choices: undefined, onDone: () => pick?.(0) }; }   // the built-in box has no choice: the first one
        sc._say(d);
      },
      setDialog(d) { sc.ui.dialog = d ?? null; },
      banner(kind, title, sub) { H.note('banner', title ?? kind, sub); if (sc.hud.banner && sc.hudKind === 'ui') sc.hud.banner(kind, title, sub); else if (title) sc._toast(sub ? title + ' — ' + sub : title, 'info'); },
      toast(text, o) { sc._toast(text, typeof o === 'string' ? o : o?.kind); },   // (the scene writes every notice into `seen`)
      lock(on) { H.inputLock = !!on; },
      gotoArea(id, spawn) { H.note('goto', id, spawn); if (!sc.travelTo(id, spawn ?? null)) throw new Error('area change refused: ' + id); },
      bellCross(o) { if (!sc.cross(o ?? null)) { sc._toast(H.STORY.TEXT?.system?.dull ?? '', 'warn'); throw new Error('crossing refused'); } H.note('cross', sc.xing?.to ?? ''); },
      sound(name, pos) { try { if (feel.has(name)) feel.play(name, pos && typeof pos === 'object' ? pos : null); } catch { /* no audio */ } },
      fx(name, o) { const h = sc.sim?.hero; try { sc.fx?.play(name, o ?? (h ? { x: h.x, y: h.y + 50, z: h.z, dx: h.dirX ?? 1, dz: h.dirZ ?? 0 } : {})); } catch { /* unknown effect */ } },
      music(id) { H.musicId = id; try { if (id === 'quiet' || id == null) audio.stopMusic?.(1.5); else if (MUSIC[id]) audio.music(MUSIC[id], { fade: 1.5 }); } catch { /* no audio */ } },
      wakeGroup(g) { return sc.wakeGroup(g); }, groupLeft(g) { return sc.groupLeft(g); },
      unlockExit(id, area) { sc.unlockExit(id, area); },
      lockExit(id, key, area) { sc.lockExit(id, area, key ?? 'story'); },
      hideActor(id, area) { sc.setActor(id, area ?? sc.area?.id, 'hide'); }, showActor(id, area) { sc.setActor(id, area ?? sc.area?.id, 'show'); },
      prompt(p) { if (!p || !p.action) { H.pillOn = false; return; } H.pill.action = p.action; H.pill.label = p.label ?? ''; H.pillOn = true; H.pillT = 20; H.note('prompt', p.label, p.action); },
      objective(text, id) { H.objective = text || ''; if (text) H.note('objective', text); },
      onFlag(name) { if (H.world.has(name)) H._worldChanged(name); },
      onItem() { /* the bag screen is not built: the runner's own notice is what the player sees */ },
      spawn(kind) { console.warn('[v2g] story spawn is not supported by the rules yet:', kind); },
      moveActor(id, to, o, done) {
        const p = sc.people.byId(id), q = H._spot(to);
        if (!p || !q) { done?.(); return; }
        H.moves.push({ p, x: q.x, z: q.z, t: 0, done, clip0: p.clip }); if (p.a3.asset.clips.walk) p.clip = 'walk';
      },
      camera(shot, seconds, done) {
        if (H.shot && H.shotDone) H._shotEnd();
        H.shot = shot && SHOTS[shot] ? SHOTS[shot] : null;
        if (!H.shot || !(seconds > 0)) { done?.(); return; }
        H.shotT = seconds; H.shotDone = done ?? null; H.shotLock = true;
        if (H.shot.shake) sc.fx?.feel.addTrauma(H.shot.shake); if (H.shot.flash) sc.fx?.feel.flash(1, 1, 1, 0.5);
      },
      wait(seconds, done) { if (!(seconds > 0)) { done?.(); return; } H.waits.push({ t: seconds, fn: done }); },
      candle(n) { const sim = sc.sim; if (!sim) return; if (n > 0) H.candleBonus += n; sc.applyCandles(); if (sim.heal) sim.heal('full'); const s = sc.people.target; if (s && !s.a3 && s.def.kind === 'rest') sim.respawnAt?.(s.def.x, s.def.z, s.def.y); },
      moon(step) { H.moon = step; sc.state.moon = { phase: Math.max(0, Math.min(1, (step | 0) / 7)) }; },
      ring(n) { H.ringN = n; },
      chronicle(e) { const t = (H.STORY.TEXT?.system?.chronicle ?? '{title}').replace('{title}', e?.title ?? ''); sc._toast(t, 'info'); },
      save(obj) { const o = H.compose(obj); o.why = 'story'; H.lastSave = o; H.saves++; writeSave(o); },
      end(id) { H.ended = id ?? 'end'; H.note('end', String(id ?? '')); const c = H.STORY.TEXT?.chapters?.end; if (c && sc.hud.banner) sc.hud.banner('clear', c.title, c.sub); H.waits.push({ t: 6, fn: () => { H.ended = null; H.saveNow('end'); sc._leave(); } }); },
    };
  }
  /** a world flag changed: hand all of them to the scene; when the area the hero stands in is built from it, rebuild once the story is idle */
  _worldChanged(name) {
    const sc = this.sc;
    sc.setWorldFlags(this.worldFlags(), { reload: false });
    const L = this.areaFlags[sc.area?.id]; if (L && L.includes(name)) this.dirty = true;
  }
}
