// v2g story host — plugs the story (src/v2/data: STORY, createStory) into the scene. docs/v2/ENGINE_API.md 8-10, docs/v2/DATA_FORMAT.md 5, 6, 10.
//   - the api object of DATA_FORMAT 5 (dialogue through the HUD, banners, notices, objective line, prompts, exits, actors, camera shots,
//     waits, sound, music, candles, moon, chronicle, save, area changes, the bell crossing, the end)
//   - story flags that areas are built from (FLAGS world: true, and every name in the world module's AREA_FLAGS) go on as area flags
//   - the save: localStorage 'bn.v2.save' { v: 1, story: storyObj.save(), area, era, spawn, pos, hp, reso, nights, coins, broken, ch, t } — written at the
//     story's save steps and on leaving; a broken or foreign value is ignored (new game)
// Nothing here may stop the game: every call into the story and every api function is guarded.
import { audio } from '../../core/audio.js';
import { feel } from '../feel/index.js';
import { groundAt } from '../b/world.js';

export const SAVE_KEY = 'bn.v2.save';
const SAVE_V = 1;
// story / area music ids -> v1 tracks (assets/audio/music/<id>.m4a)
const MUSIC = { village_burning: 's01', village_past: 'hub', graveyard_mist: 's02', table_warm: 'inn', ossuary_now: 's03', ossuary_past: 'church', boss_banshee: 'boss', dawn_bell: 'ending' };
// camera shots of the `camera` step (TEXT.shots): what the section rig is bent to while the shot runs - pitch, distance and height; and, for a cut that is a picture of
// a place (STORY, 11-19): `at: [x, z]` = what the camera looks at instead of the hero (the section's side limits do not hold then), `yaw` = from which side (0 = from
// the south), `tallK` = how much a tall screen lifts the look point (0: the same picture on the Fold and on a phone).
export const SHOTS = {
  moon_bell: { pitch: -0.2, dist: 1500, lookY: 420 }, bell_crack: { pitch: 0.12, dist: 560, lookY: 170, at: [360, 1180], tallK: 0, shake: 0.5 },   // (close on the tower's bell; it used to look up past the bell at the moon)
  fall: { pitch: 0.9, dist: 1300, lookY: 40, shake: 0.6, flash: true },
  wake_past: { pitch: 0.1, dist: 480, lookY: 70 }, table: { pitch: 0.22, dist: 520, lookY: 80, yaw: 0.85 }, knot: { pitch: 0.16, dist: 360, lookY: 86, yaw: 0.85 },   // (from the side: the hero stands between the camera and whoever he speaks to)
  beside: { pitch: 0.26, dist: 500, lookY: 76, yaw: 0.85 },   // two people talking, seen from the side so that neither hides the other
  years: { pitch: 0.42, dist: 1040, lookY: 110 }, banshee_song: { pitch: 0.12, dist: 1100, lookY: 220 }, two_keepers: { pitch: 0.5, dist: 444, lookY: 80, at: [4186, 1436], yaw: 0, tallK: 0 },   // the big bell from the churchyard below the terrace: Lotte left of it, Elise right (both nights: the same picture a hundred years apart)
  ring_widen: { pitch: 0.62, dist: 1500, lookY: 120, at: [4130, 1500], yaw: 0, tallK: 0 },
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
    this.walk = null;       // STORY2: the hero's walk to a mark (api.moveHero): { x, z, mx, mz, ... } - the scene hands walk.mx / walk.mz to the rules as the stick of this tick
    this.restSpot = null;   // CHAPTER: the rest spot the hero last pressed ({ area, def }) - the `candle` step makes it the place he stands up at (chapter.js)
    this.inputLock = false; this.dirty = false; this.saves = 0; this.lastSave = null; this.ended = null; this.moon = null; this.ringN = 0; this.musicId = null; this.candleBonus = 0;
    const F = mod.STORY.FLAGS ?? {}; this.world = new Set();
    for (const k of Object.keys(F)) if (F[k] && F[k].world) this.world.add(k);
    for (const a of Object.keys(this.areaFlags)) for (const n of this.areaFlags[a]) if (F[n]) this.world.add(n);   // a name the story does not declare (past_street_clear) is not passed: the area then keeps its older condition
    this.api = this._api();
    this.story = (name, data) => {
      if (name === 'interact' && data && data.kind === 'rest') this.restSpot = { area: this.sc.area?.id ?? null, def: data.spot ?? data };   // CHAPTER
      if (name === 'area.enter') { const id = this.sc.area?.music; if (id && MUSIC[id] && id !== this.musicId) this.api.music(id); }   // each night has its own tune (GDD 2.4 rule 1); a track the build does not ship is skipped by the audio module
      try { this.st.story(name, data, this.api); } catch (e) { console.error('[v2g] story failed on', name, e); }
    };
    this._onHide = () => { if (globalThis.document?.visibilityState === 'hidden') this.saveNow('hidden'); };
    try { globalThis.document?.addEventListener('visibilitychange', this._onHide); } catch { /* no DOM */ }
  }
  release() { try { globalThis.document?.removeEventListener('visibilitychange', this._onHide); } catch { /* no DOM */ } this.waits.length = 0; this.moves.length = 0; this.walk = null; if (this.musicId) { try { audio.stopMusic?.(0.6); } catch { /* no audio */ } this.musicId = null; } }
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
    // STORY-VERIFY (11-19): a save of an earlier build (APK 11 / 12) in the queen's stretches keeps the objective id that build had set there, and the texts have moved on -
    // it read 「석관 방 종으로 건너 여왕에게」 in the middle of her first act, 「방 안 종에서 쫓아 건넌다」 facing her in 1697, 「무릎 꿇리고…」 in the hall she had left. The stretch decides.
    try { const f = s.flags ?? {}, o = s.objective; if (!f.queen_sent) { if (o === 'face_queen' && this.st.isDone('ev_boss_intro') && !f.queen_fled) s.objective = 'fight_queen'; else if (o === 'chase_queen' && f.queen_fled && !f.queen_driven && s.area === 'ossuary_past' && this.st.isDone('ev_boss_past')) s.objective = 'drive_queen'; else if (o === 'send_queen' && f.queen_driven && s.area === 'ossuary_past' && !this.st.isDone('ev_boss_back')) s.objective = 'back_queen'; } } catch { /* an older runner */ }   // (ev_boss_back not done: the way back sets send_queen again; once it is done the line is this build's own)
    this.objective = this.st.objectiveText?.() ?? ''; this.moon = s.moon; this.candleBonus = Math.max(0, (s.candles | 0) - 3);
    const same = o.area === s.area && o.pos && Number.isFinite(o.pos.x) && Number.isFinite(o.pos.z);   // otherwise the save was cut in the middle of an area change: the story's area and spawn decide
    // STORY (11-19): has the story ended in this save (a finished sequence with an `end` step) while its card was never dismissed? Then the card comes up again after the
    // load (chapter.js pend). `why: 'end'` is the save the card's own way out wrote in builds that did not keep `ch.card` yet.
    let end = null;
    if (o.why !== 'end' && !(o.ch && o.ch.card)) { const has = (L) => { for (const q of L ?? []) { if (!Array.isArray(q)) continue; if (q[0] === 'end') return String(q[1] ?? 'end'); if (q[0] === 'if') { const r = has(q[2]) ?? has(q[3]); if (r) return r; } } return null; }; for (const e of this.STORY.EVENTS ?? []) { if (!this.st.isDone(e.id)) continue; const r = has(e.steps); if (r) { end = r; break; } } }
    return { area: s.area, spawn: s.spawn ?? null, pos: same ? { x: o.pos.x, z: o.pos.z, y: Number.isFinite(o.pos.y) ? o.pos.y : undefined, face: Array.isArray(o.pos.face) ? o.pos.face : undefined } : null,
      hp: Number.isFinite(o.hp) && o.hp > 0 ? o.hp : null, reso: Number.isFinite(o.reso) ? o.reso : 0, nights: o.nights && typeof o.nights === 'object' ? o.nights : null,
      coins: Number.isFinite(o.coins) && o.coins > 0 ? Math.floor(o.coins) : 0, broken: same && Array.isArray(o.broken) ? o.broken : null,
      ch: o.ch && typeof o.ch === 'object' ? (end ? { ...o.ch, end } : o.ch) : end ? { end } : null };   // CHAPTER: the last rest spot, the last bell, the queen's health (chapter.js; an old save has none)   // BREAK: the coin count (an old save without it reads 0) and what was broken in the saved area
  }
  /** new game: forget everything (the scene clears its own memory and the stored save) */
  reset() { try { this.st.reset(); } catch (e) { console.error('[v2g] story reset failed', e); } this.objective = ''; this.pillOn = false; this.waits.length = 0; this.moves.length = 0; this.walk = null; this.shot = null; this.shotT = 0; this.shotDone = null; this.shotLock = false; this.inputLock = false; this.restSpot = null; this.dirty = false; this.ended = null; this.moon = null; this.candleBonus = 0; this.lastSave = null; }
  // ───────── save ─────────
  /** the save object for the state as it is (storyObj = st.save(): the copy from before a running sequence) */
  compose(storyObj) {
    const sc = this.sc, h = sc.sim?.hero, a = sc.area;
    const o = { v: SAVE_V, t: Date.now(), story: storyObj, area: a?.id ?? storyObj.area ?? null, era: a?.era ?? storyObj.era ?? 'now', spawn: storyObj.spawn ?? null, pos: null, hp: null, reso: 0, nights: sc.nightsOut?.() ?? {}, coins: sc.brk?.coins ?? 0, broken: sc.brk && sc.ready && a && !a.test && sc.brk.brokenArea === a.id ? sc.brk.brokenOut() : [], ch: sc.ch ? sc.ch.out() : null };   // BREAK: coins + the breakables broken in this area (they stand again on a new arrival)
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
    if (this.walk !== null) this._walkTick(this.walk, dt);   // STORY2: the hero's walk to a mark
    for (let i = M.length - 1; i >= 0; i--) {
      const m = M[i], p = m.p, dx = m.x - p.x, dz = m.z - p.z, d = Math.sqrt(dx * dx + dz * dz), st = (m.v ?? 130) * dt;
      if (d <= st || (m.t += dt) > 20 || sc.people.list.indexOf(p) < 0) {
        if (sc.people.list.indexOf(p) >= 0) { this._place(p, m.x, m.z); if (m.clip0) p.clip = m.clip0; }
        M.splice(i, 1); try { m.done?.(); } catch (e) { console.error('[v2g] story move', e); }
      } else { this._place(p, p.x + dx / d * st, p.z + dz / d * st); p.a3.dx = dx / d; p.a3.dz = dz / d; p.hx = dx / d; p.hz = dz / d; }
    }
  }
  _place(p, x, z) {
    const b = p.box; if (b) { const r = (b.x1 - b.x0) / 2; b.x0 = x - r; b.x1 = x + r; b.z0 = z - r; b.z1 = z + r; } p.x = x; p.z = z;
    const W = this.sc.W; if (W) { const gy = groundAt(W, x, z, p.y + 40); if (Number.isFinite(gy)) p.y = gy; }   // STORY2: her feet follow the floor (a walk up the church stairs)
  }
  // ───────── STORY2: the hero on a mark (api.moveHero) ─────────
  /** one tick of the walk: the stick the scene hands to the rules this tick (w.mx, w.mz) - the rules walk him: collision, steps, sound */
  _walkTick(w, dt) {
    const sc = this.sc, h = sc.sim?.hero; w.mx = 0; w.mz = 0;
    if (!h || h.dead || !sc.ready) { this._walkEnd(false); return; }
    const dx = w.x - h.x, dz = w.z - h.z, d = Math.sqrt(dx * dx + dz * dz);
    if (w.at > 0) { if ((w.at += dt) > 0.3) this._walkEnd(false); return; }   // on the mark: he comes to rest and turns, then the story goes on
    if (d <= 8) { w.at = dt; this._look(w); return; }
    if ((w.t += dt) > w.cap) { this._walkEnd(true); return; }                 // the time is up (a wall he cannot get round): he is set on the mark
    // nothing to walk into on the straight way: he walks it. When he stops getting nearer (a wall, the bell's frame) he steps sideways for a moment - one way round, then the other
    if (d < w.best - 2) { w.best = d; w.stuck = 0; } else if ((w.stuck += dt) > 0.25 && w.sideT <= 0) { w.side = w.side > 0 ? -1 : 1; w.sideT = 0.4 + 0.2 * w.turns++; w.stuck = 0; }
    let ux = dx / d, uz = dz / d;
    if (w.sideT > 0) { const sx = -uz * w.side, sz = ux * w.side; ux = sx * 0.94 + ux * 0.34; uz = sz * 0.94 + uz * 0.34; if ((w.sideT -= dt) <= 0) w.best = 1e9; }
    const m = d > 80 ? 0.66 : Math.max(0.3, 0.66 * d / 80);                   // a walk, slower over the last steps (the rules' own stick: 0.15 is their dead zone, 1 a run)
    w.mx = ux * m; w.mz = uz * m;
  }
  /** where he looks on the mark (set as a spawn's `face` is: the rules' facing; the body turns there by the scene's own turn rule) */
  _look(w) {
    const sc = this.sc, h = sc.sim?.hero, f = w.face; if (!h || f == null) return;
    const q = typeof f === 'string' ? sc.people.byId(f) ?? this._spot(f) : this._spot(f); if (!q) return;
    const lx = q.x - h.x, lz = q.z - h.z, l = Math.sqrt(lx * lx + lz * lz); if (l < 4) return;
    h.dirX = lx / l; h.dirZ = lz / l; if (h.facing !== undefined && Math.abs(h.dirX) > 0.25) h.facing = h.dirX < 0 ? -1 : 1;
  }
  /** the walk is over. place = he did not get there: he is set on the mark, or on the nearest free spot beside it (the scene's own way of standing him somewhere) */
  _walkEnd(place) {
    const w = this.walk, sc = this.sc; if (!w) return; this.walk = null;
    const h = sc.sim?.hero;
    if (place && h && !h.dead && sc.ready) {
      let at = null;
      for (let r = 0; r <= 96 && !at; r += 24) for (let k = 0; k < (r ? 8 : 1) && !at; k++) { const a = k * Math.PI / 4, q = { x: w.x + Math.cos(a) * r, z: w.z + Math.sin(a) * r, y: h.y }; if (sc._spotOk(q)) at = q; }
      if (at) { sc._enterAt(null, at); this.note('placed', Math.round(at.x) + ', ' + Math.round(at.z)); }
      this._look(w);
    }
    const d = w.done; if (d) { try { d(); } catch (e) { console.error('[v2g] story moveHero', e); } }
  }
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
        if (d.choices && sc.hudKind !== 'ui') { const pick = d.onChoice; d = { ...d, choices: undefined, onDone: () => pick?.(0) }; }   // the built-in box (old pad, v2ui=0) cannot ask: it takes the first choice
        sc._say(d);
      },
      setDialog(d) { sc.ui.dialog = d ?? null; },
      banner(kind, title, sub) { H.note('banner', title ?? kind, sub); if (sc.hud.banner && sc.hudKind === 'ui') sc.hud.banner(kind, title, sub); else if (title) sc._toast(sub ? title + ' — ' + sub : title, 'info'); },
      toast(text, o) { sc._toast(text, typeof o === 'string' ? o : o?.kind); },   // (the scene writes every notice into `seen`)
      lock(on) { H.inputLock = !!on; },
      gotoArea(id, spawn) { H.note('goto', id, spawn); if (!sc.travelTo(id, spawn ?? null)) throw new Error('area change refused: ' + id); },
      bellCross(o) {
        // STORY (11-19): the queen holds the bell of her hall while she is in her first act (chapter.js bellHeld) - the bell answers dull and the story says why (ev_bell_held)
        if (sc.ch.bellHeld()) { sc._toast(H.STORY.TEXT?.system?.dull ?? '', 'warn'); H.story('bell.held', {}); throw new Error('crossing refused: the queen holds the bell'); }
        if (!sc.cross(o ?? null)) { sc._toast(H.STORY.TEXT?.system?.dull ?? '', 'warn'); throw new Error('crossing refused'); } H.note('cross', sc.xing?.to ?? '');
      },
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
        // opts.face (STORY, 11-19): where she looks once she stands there - a spot, [x, z] or 'hero' (people.js `look`: kept until the area is built again; the area's own `look` takes over then)
        const f = o && o.face !== undefined ? (o.face === 'hero' ? { hero: true } : H._spot(o.face)) : undefined, look = f === undefined ? null : () => { if (sc.people.list.indexOf(p) >= 0) p.look = f ? (f.hero ? f : { x: f.x, z: f.z }) : null; };
        // STORY2 (11-19): opts.wait === false - the step does not wait for her (she walks on while the next steps run: a camera shot, another person's walk);
        // opts.speed = px a second (130). A new walk of the same person takes over from the one under way (from where she is; the clip she had before the first walk comes back at the end).
        let clip0 = p.clip;
        for (let i = H.moves.length - 1; i >= 0; i--) if (H.moves[i].p === p) { clip0 = H.moves[i].clip0; H.moves.splice(i, 1); }
        const free = !!o && o.wait === false, done2 = () => { look?.(); if (!free) done?.(); };
        H.moves.push({ p, x: q.x, z: q.z, t: 0, done: done2, clip0, v: o && o.speed > 0 ? o.speed : undefined }); if (p.a3.asset.clips.walk && (Math.abs(q.x - p.x) > 2 || Math.abs(q.z - p.z) > 2)) p.clip = 'walk';
        if (free) done?.();
      },
      // STORY2 (11-19): a person is set down at a place at once - for a place OUTSIDE the picture (she then walks in with moveActor); to = a spawn name, a spot or actor id, [x, z].
      // opts.face as for moveActor. Kept until the area is built again (the area's own place takes over then); a person the area does not show is not shown by this.
      putActor(id, to, o) {
        const p = sc.people.byId(id), q = H._spot(to); if (!p || !q) return;
        for (let i = H.moves.length - 1; i >= 0; i--) if (H.moves[i].p === p) { p.clip = H.moves[i].clip0; H.moves.splice(i, 1); }
        p.y = Number.isFinite(q.y) ? q.y : 1e5; H._place(p, q.x, q.z); if (p.y > 9e4) p.y = 0;   // (her feet: the highest floor at that place when the place names no height)
        if (o && o.face !== undefined) { const f = o.face === 'hero' ? { hero: true } : H._spot(o.face); p.look = f ? (f.hero ? f : { x: f.x, z: f.z }) : null; if (f && !f.hero) { const lx = f.x - p.x, lz = f.z - p.z, l = Math.sqrt(lx * lx + lz * lz); if (l > 4) { p.a3.dx = lx / l; p.a3.dz = lz / l; p.hx = p.a3.dx; p.hz = p.a3.dz; } } }
      },
      // STORY2 (11-19): the hero walks to a mark. The scene feeds the rules a stick (index.js update: host.walk.mx / mz), the rules walk him - nothing moves him behind their back.
      // to = a spawn name, a spot or actor id, [x, z]; opts.face = where he looks once he stands there (an actor id: where she is at that moment · a spawn / spot · [x, z]);
      // opts.cap = seconds (3): when he has not arrived by then (a wall in the way that his side steps do not get him round) he is set on the mark - on the nearest free spot of it.
      // cap 0 = no walk: set there at once (the first step of a scene that begins behind a fade), unless he already stands within 16 px.
      moveHero(to, o, done) {
        const q = H._spot(to), h = sc.sim?.hero;
        if (H.walk) H._walkEnd(false);
        if (!q || !h || h.dead) { done?.(); return; }
        const cap = o && Number.isFinite(o.cap) ? Math.max(0, o.cap) : 3;
        H.walk = { x: q.x, z: q.z, t: 0, cap, face: o && o.face !== undefined ? o.face : null, done: done ?? null, mx: 0, mz: 0, best: 1e9, stuck: 0, side: 0, sideT: 0, turns: 0, at: 0 };
        H.note('hero', 'to ' + Math.round(q.x) + ', ' + Math.round(q.z));
        if (cap <= 0) { const dx = q.x - h.x, dz = q.z - h.z; if (dx * dx + dz * dz <= 256) { H._look(H.walk); H._walkEnd(false); } else H._walkEnd(true); }
      },
      camera(shot, seconds, done) {
        if (H.shot && H.shotDone) H._shotEnd();
        H.shot = shot && SHOTS[shot] ? SHOTS[shot] : null;
        if (!H.shot || !(seconds > 0)) { done?.(); return; }
        H.shotT = seconds; H.shotDone = done ?? null; H.shotLock = true;
        if (H.shot.shake) sc.fx?.feel.addTrauma(H.shot.shake); if (H.shot.flash) sc.fx?.feel.flash(1, 1, 1, 0.5);
      },
      wait(seconds, done) { if (!(seconds > 0)) { done?.(); return; } H.waits.push({ t: seconds, fn: done }); },
      candle(n) {
        const sim = sc.sim; if (!sim) return; if (n > 0) H.candleBonus += n; sc.applyCandles(); if (sim.heal) sim.heal('full');
        // CHAPTER: the rest spot that was pressed is where the hero stands up after a fall - kept by the scene (chapter.js), so it outlives crossings, journeys and loads.
        // (It used to be read from the prompt target: none while a dialogue is open, so the bread before the queen's door never set it.)
        const r = H.restSpot, s = sc.people.target, d = r && r.area === sc.area?.id ? r.def : s && !s.a3 && s.def.kind === 'rest' ? s.def : null; H.restSpot = null;
        if (d) sc.ch.restAt(d);
      },
      moon(step) { H.moon = step; sc.state.moon = { phase: Math.max(0, Math.min(1, (step | 0) / 7)) }; },
      ring(n) { H.ringN = n; },
      chronicle(e) { const t = (H.STORY.TEXT?.system?.chronicle ?? '{title}').replace('{title}', e?.title ?? ''); sc._toast(t, 'info'); },
      save(obj) { const o = H.compose(obj); o.why = 'story'; H.lastSave = o; H.saves++; writeSave(o); },
      // CHAPTER: the closing banner, then the 3D edition's ending card and the 3D chooser (chapter.js end / leave) - it used to drop to the old 2D title after six seconds
      end(id) { H.ended = id ?? 'end'; H.note('end', String(id ?? '')); H.inputLock = true; const c = H.STORY.TEXT?.chapters?.end; if (c && sc.hud.banner) sc.hud.banner('clear', c.title, c.sub); sc.ch.end(id); },
    };
  }
  /** a world flag changed: hand all of them to the scene; when the area the hero stands in is built from it, rebuild once the story is idle */
  _worldChanged(name) {
    const sc = this.sc;
    sc.setWorldFlags(this.worldFlags(), { reload: false });
    const L = this.areaFlags[sc.area?.id]; if (L && L.includes(name)) this.dirty = true;
  }
}
