// v2g chapter staging (CHAPTER lane, 2026-11-18) — what the scene itself remembers and stages so that chapter 1 plays from its start to its end.
// docs/v2/ENGINE_API.md 12.4. The scene makes one (scene.ch) and calls: enter() after every new Sim, tick(dt) every tick, phase(name, e, b) for the
// rules' boss events, arrived() on the far side of a crossing, revived() after a fall, out() / load(o) for the save, reset() for a new game.
//   rest    the last rest spot (and, while none was taken in an area, the bell the hero last arrived at there) outlives the rules object: every
//           crossing, journey, rebuild and load makes a new Sim, which used to forget where the hero stands up after a fall
//   queen   the banshee queen's flight, the chase and the return (GDD 9.1 minutes 104-114). At half health she tears through the room's bell into
//           1697 and is GONE from tonight; that night she goes on from the health she left with, in her second act, until the hero has driven her
//           back through the same bell; tonight she goes on from there, down to the kneel and the knell. Which stretch is on is read from the
//           story's flags (queen_fled, queen_driven, queen_sent); her health is kept here and in the save. A fall starts the stretch again.
//   end     the ending: the 3D edition's own card (hud.showEnd), then the 3D chooser - never the old 2D title
// Without a story (index.html?scene=v2g&area=...) nothing here acts: the rules' own four-second flight and the scene's notices stay as they were.
import { PRESET_IDS } from '../fx/index.js';
import { feel } from '../feel/index.js';
import { sectionAt } from '../b/world.js';
import { input } from '../../core/input.js';

export const DRIVE_K = 0.25;   // that night she is driven back at a quarter of her health (flight at a half: the rules' phaseAt; kneel at 4 %: kneelAt)
const TEAR_T = 0.9;            // seconds of the tear: she streaks to the bell, the bell tolls, she is gone
const AWAY = '(away)';       // the group name of a boss that is not in this night
const END_CARD = 1.6, END_LEAVE = 7;   // seconds after the story's end step: the card comes up (the closing banner had its time) · without a card the scene is left

const num = (v) => (Number.isFinite(v) ? v : null);
const spotIn = (o) => (o && typeof o === 'object' && typeof o.area === 'string' && Number.isFinite(o.x) && Number.isFinite(o.z) ? { area: o.area, x: o.x, z: o.z, y: num(o.y) } : null);

export class Chapter {
  constructor(sc) {
    this.sc = sc;
    this.rest = null;              // { area, x, z, y } the rest spot the hero last used
    this.bell = null;              // { area, x, z, y } where he last arrived by a crossing
    this.q = { hp: 0, cur: 0 };    // the queen's health at the start of the stretch that is on · as it is now in that stretch (0 = not known: the stretch's own start)
    this.tear = null;              // the flight under way (this.T) or null
    this.T = { e: null, t: 0, back: false, x0: 0, z0: 0, x1: 0, z1: 0, rang: false };
    this.grp = null;               // her spawn group while she is away (she is taken out of it so that no wake trigger finds her)
    this.endT = -1; this.endId = null; this.card = false;
    this.seen = false;             // the ending card has been dismissed (kept in the save: a load brings the card up again until it has been)
    this.pend = null;              // a loaded game whose story has ended while the card had not been dismissed: the end id, raised again once the area stands
  }
  reset() { this.rest = null; this.bell = null; this.q.hp = 0; this.q.cur = 0; this.tear = null; this.endT = -1; this.endId = null; this.card = false; this.seen = false; this.pend = null; }
  // ───────── the save ─────────
  out() { return { rest: this.rest, bell: this.bell, queen: { hp: this.q.hp, cur: this.q.cur }, card: this.seen }; }
  /** o = save.ch (an old save has none); o.end = the story's end id when the loaded story has ended and its card was never dismissed (storyhost.js restore) */
  load(o) {
    this.reset(); if (!o || typeof o !== 'object') return;
    this.seen = !!o.card; this.pend = typeof o.end === 'string' && !this.seen ? o.end : null;
    this.rest = spotIn(o.rest); this.bell = spotIn(o.bell);
    const q = o.queen; if (q && typeof q === 'object') { this.q.hp = q.hp > 0 && Number.isFinite(q.hp) ? q.hp : 0; this.q.cur = q.cur > 0 && Number.isFinite(q.cur) ? q.cur : 0; }
  }
  // ───────── where the hero stands up ─────────
  /** the hero rested at a rest spot of this area (the story's rest sequence): he stands up here after a fall, in this night and in its twin */
  restAt(d) {
    const sc = this.sc, a = sc.area; if (!a || a.test || !d || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return;
    this.rest = { area: a.id, x: d.x, z: d.z, y: num(d.y) }; sc.sim?.respawnAt?.(d.x, d.z, d.y);
  }
  /** the far side of a crossing: until a rest is taken in this area or its twin, the hero stands up where the bell set him down */
  arrived() {
    const sc = this.sc, a = sc.area, h = sc.sim?.hero; if (!a || a.test || !h || !sc.host) return;
    this.bell = { area: a.id, x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y) }; this._rest();
    const e = this._queen(); if (e && !e.fleeHold && !e.active && this._near(e)) sc.sim.wake(e);   // set down inside her hall: she does not sleep on
  }
  _rest() {
    const sc = this.sc, sim = sc.sim, a = sc.area, B = this.bell, H = sc.host;
    if (!this.rest && H && H.st.isDone) {   // a save from before the rest spot was kept: the story knows which named rest scene has played (the bread before the queen's door)
      const EV = H.STORY.EVENTS ?? [];
      for (let i = 0; i < EV.length; i++) { const ev = EV[i], m = ev.match; if (ev.on !== 'interact' || !m || m.event !== 'rest' || !m.id || !H.st.isDone(ev.id)) continue; const d = a.interact.find((q) => q.id === m.id && q.kind === 'rest'); if (d) this.rest = { area: a.id, x: d.x, z: d.z, y: num(d.y) }; }
    }
    const R = this.rest;
    const p = R && (R.area === a.id || R.area === a.twin) ? R : B && B.area === a.id ? B : null;
    if (p && sc._spotOk({ x: p.x, z: p.z, y: p.y ?? undefined })) sim.respawnAt(p.x, p.z, p.y ?? undefined);
  }
  // ───────── the queen ─────────
  _queen() { const E = this.sc.sim?.enemies; if (E) for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.def.boss && !e.dead && e.state !== 'dead') return e; } return null; }
  /** 0 first act (tonight) · 1 she fled, the chase is on (she is in 1697) · 2 driven back (tonight, second act) · 3 sent */
  _stage() { const f = this.sc._flagFn; return f('queen_sent') ? 3 : f('queen_driven') ? 2 : f('queen_fled') ? 1 : 0; }
  /** STORY (11-19): tonight, in her first act, the queen holds the bell of her hall - a long ring there carries nobody away while she is awake and the hero stands in the
   *  hall (storyhost.js bellCross refuses and raises bell.held). It used to set him down in an empty 1697 hall whose bell is sealed, and she began again at full health. */
  bellHeld() {
    const sc = this.sc; if (!sc.sim || !sc.host || !sc.area || sc.area.test || sc.area.era !== 'now' || this._stage() !== 0 || this.tear) return false;
    const e = this._queen(); return !!e && !!e.active && !e.fleeHold && this._near(e);
  }
  _near(e) { const sc = this.sc, h = sc.sim.hero, a = sectionAt(sc.W, h.x, h.z), b = sectionAt(sc.W, e.homeX, e.homeZ); return !!a && a === b; }
  /** after every new Sim (first load, crossing, journey, rebuild, restart) */
  enter() {
    const sc = this.sc; this.tear = null;
    if (!sc.sim || !sc.area || sc.area.test || !sc.host) return;
    this._rest(); this._place(true);
  }
  /** the hero stood up after a fall (the rules put a boss back to full health and her first act): the stretch that is on starts again */
  revived() { const sc = this.sc; this.tear = null; if (!sc.sim || !sc.area || sc.area.test || !sc.host) return; this.q.cur = 0; this._place(false); }
  /** put the queen of this Sim into the stretch the story is in */
  _place(fresh) {
    const sc = this.sc, sim = sc.sim, e = this._queen(); if (!e) return;
    const st = this._stage(), now = sc.area.era === 'now', K = e.def;
    e.fleeHold = false;
    if (st === 3 || (now ? st === 1 : st !== 1)) { this._gone(e); return; }   // sent, or in the other night
    if (st === 0) { if (e.group === AWAY) e.group = this.grp; return; }       // first act: as the rules made her
    const lo = now ? Math.ceil(K.hp * (K.kneelAt ?? 0)) + 1 : Math.floor(K.hp * DRIVE_K) + 1, top = Math.round(K.hp * (now ? DRIVE_K : K.phaseAt ?? 0.5));
    let hp = fresh && this.q.cur > 0 ? this.q.cur : this.q.hp > 0 ? this.q.hp : top;
    hp = Math.max(lo, Math.min(e.hpMax, Math.round(hp)));
    if (!(this.q.hp > 0)) this.q.hp = hp;
    if (e.group === AWAY) e.group = this.grp;
    e.hp = hp; e.bphase = 2; e.fled = false; e.solid = true; e.alpha = 1; e.kneel = 0; e.poiseHp = 0; e.staggerK = 0; e.sumCd = 0.5; e.songCd = 5; e.cd = 1.2;
    if (!e.active && this._near(e)) sim.wake(e);   // the hero is already in her hall (a save, a rebuild): she does not sleep on
  }
  /** she is not in this night: nothing of her is drawn, struck, locked on or woken (the scene does not take an actor for her: index.js _sync) */
  _gone(e) {
    const sc = this.sc;
    e.fled = true; e.fleeHold = true; e.active = false; e.wakeBy = 'trigger'; e.solid = false; e.alpha = 0; e.state = 'idle'; e.atk = null; e.phase = null; e.tele = 0; e.stagger = 0; e.stun = 0; e.kneel = 0;
    e.hp = e.hpMax;   // (her health is kept in this.q; a full bar is what the HUD does not draw over an enemy)
    if (e.group !== AWAY) { this.grp = e.group ?? null; e.group = AWAY; }   // out of her group: the hall's wake trigger and the scene's near-wake rule pass her by
    const a = e._a3; if (a) { const L = sc.actors, i = L.indexOf(a); if (i >= 0) { L[i] = L[L.length - 1]; L.length--; } sc._free(a); }
  }
  /**
   * The rules' boss events -> the story's boss.phase (DATA_FORMAT 6): kneel · flee · driven · sent · down. The flight and the return are staged here,
   * their phase is raised when the tear is over (flee: tonight, at half health - the rules' bossFlee; driven: that night, when the hero has brought
   * her down to DRIVE_K - never by a timer: the rules' bossReturn is not a phase any more).
   */
  phase(name, e, b) {
    if (name === 'kneel') return b === 'down' ? 'kneel' : null;
    if (name === 'bossDown') return b ? 'sent' : 'down';
    if (!this.sc.host) return name === 'bossFlee' ? 'flee' : name === 'bossReturn' ? 'driven' : null;   // a story function without the host: the rules' own timed flight, as before
    if (name === 'bossFlee' && e) this._tear(e, false);
    return null;
  }
  _fx(name, x, y, z, dir) { const fx = this.sc.fx, id = PRESET_IDS[name]; if (fx && id !== undefined) { try { fx.playAt(id, x, y, z, dir, 0, 1.2, x, y, z); } catch { /* effect */ } } }
  /** she tears through to the other night (back = out of 1697, driven): untouchable, she streaks to the room's bell, it tolls, she is gone */
  _tear(e, back) {
    const sc = this.sc, sim = sc.sim, T = this.T, fx = sc.fx, E = sim.enemies, S = sc.people.spots, home = sectionAt(sc.W, e.homeX, e.homeZ);
    e.fleeHold = true;
    if (back) { if (e.state === 'attack') sim._cancelAttack(e, 1); e.fled = true; e.fleeT = 0; e.solid = false; e.poiseHp = 0; e.staggerK = 0; e.stagger = 0; e.stun = 0; e.state = 'chase'; }
    else { this.q.hp = Math.max(1, Math.round(e.hp)); this.q.cur = 0; }
    T.e = e; T.t = 0; T.back = back; T.x0 = e.x; T.z0 = e.z; T.x1 = e.x; T.z1 = e.z; T.rang = false;
    let best = 1e12;   // the bell she goes through: a crossing bell in her own hall (else the nearest one)
    for (let i = 0; i < S.length; i++) {
      const q = S[i], ev = q.def.event; if (q.def.kind !== 'bell' || (ev !== 'bell.ring' && ev !== 'bell.sealed')) continue;
      const dx = q.x - e.x, dz = q.z - e.z, d2 = dx * dx + dz * dz + (sectionAt(sc.W, q.x, q.z) === home ? 0 : 1e9);
      if (d2 < best) { best = d2; T.x1 = q.x; T.z1 = q.z; }
    }
    for (let i = 0; i < E.length; i++) { const g = E[i]; if (g.summoned && !g.dead && g.state !== 'dead') { g.hp = 0; sim._kill(g); } }   // the ghosts she called go with her
    if (fx) { const F = fx.feel; F.slowMo(0.35, TEAR_T); F.zoomPunch(0.05, 0.5); F.addTrauma(0.22); }
    this._fx('cross.lift', e.x, e.gy, e.z, back ? 1 : -1);
    try { if (feel.has('cross.rush')) feel.play('cross.rush', null, 0.8, back ? 1.12 : 0.9); } catch { /* no audio */ }
    this.tear = T;
  }
  /** every tick, before the rules run */
  tick(dt) {
    const sc = this.sc, sim = sc.sim;
    if (this.endT >= 0) this._ending(dt);
    if (!sim || !sc.host || !sc.area || sc.area.test) return;
    if (this.pend && this.endT < 0 && sc.ready && !sc._go && !sc.xing && !sc.hud.modal && !sc.host.st.busy && sc.fadeA <= 0.01) { const id = this.pend; this.pend = null; try { sc.host.api.end(id); } catch (e) { console.warn('[v2g] the ending did not come back after the load:', String(e?.message ?? e)); } }   // a reload on the ending card: the card again, then the chooser
    const T = this.tear;
    if (T) {
      const e = T.e;
      if (e.dead || e.state === 'dead' || sim.enemies.indexOf(e) < 0 || !e.fled) { this.tear = null; return; }   // (a fall in that very moment: revived() has put her back)
      T.t += dt;
      const k = Math.min(1, T.t / TEAR_T), s = k * k * (3 - 2 * k), dir = T.back ? 1 : -1;
      e.x = T.x0 + (T.x1 - T.x0) * s; e.z = T.z0 + (T.z1 - T.z0) * s; e.alpha = 1 - 0.8 * k;
      if (!T.rang && k >= 0.6) {
        T.rang = true; this._fx('cross.ring', T.x1, e.gy, T.z1, dir);
        try { feel.play('bell.toll', e, 0.8, T.back ? 1.19 : 0.84); } catch { /* no audio */ }
        if (sc.fx) sc.fx.feel.addTrauma(0.12);
      }
      if (k >= 1) {
        this.tear = null; this._fx('cross.glow', T.x1, e.gy, T.z1, dir);
        if (T.back) { this.q.hp = Math.max(Math.ceil(e.def.hp * (e.def.kneelAt ?? 0)) + 1, Math.round(e.hp)); this.q.cur = 0; }
        this._gone(e);
        sc.emit('boss.phase', { boss: e.kind, phase: T.back ? 'driven' : 'flee' });
      }
      return;
    }
    const e = this._queen(); if (!e) return;
    if (e.fleeHold) { if (e.active && e.alpha <= 0) { e.active = false; e.state = 'idle'; } return; }   // gone: a trigger or a struck neighbour does not bring her back
    const st = this._stage(), now = sc.area.era === 'now';
    if (st === 1 && !now) { if (!e.fled && !(e.kneel > 0) && e.hp <= e.def.hp * DRIVE_K) this._tear(e, true); else this.q.cur = e.hp; }
    else if (st === 2 && now && !e.fled) this.q.cur = e.hp;
  }
  // ───────── the ending ─────────
  /** the story's end step */
  end(id) { this.endT = 0; this.endId = id ?? 'end'; this.card = false; }
  _ending(dt) {
    const sc = this.sc, H = sc.host, hud = sc.hud;
    this.endT += dt;
    if (!this.card && this.endT >= END_CARD && !hud.modal && typeof hud.showEnd === 'function') {
      const T = H?.STORY.TEXT?.ending ?? {}, C = H?.STORY.TEXT?.chapters?.end ?? {};
      this.card = true;
      try { hud.showEnd({ ...T, head: C.title ?? '', onDone: () => this._book() }); } catch (e) { console.warn('[v2g] the ending card failed:', String(e?.message ?? e)); this.card = false; this.endT = END_LEAVE; }
      if (H) H.note('card', T.title ?? '', T.cont ?? '');
    }
    if (this.card && typeof hud.tapEnd === 'function' && (input.pressed('confirm') || input.pressed('attack'))) hud.tapEnd();   // keyboard / pad: the same as a tap on the card
    if (!this.card && this.endT >= END_LEAVE && typeof hud.showEnd !== 'function') this.leave();   // the built-in HUD has no card: the closing banner, then out
  }
  /**
   * SCREENS (11-19): the ending card has been dismissed - the chronicle opens once by itself on what this chapter wrote (its last entry in the middle), and closing
   * it is the way out (leave(), exactly as before). Nothing is saved in between: a reload with the book open finds save.ch.card unset and brings the card up
   * again, then the book - never a free hero at the bell. Where the book cannot open (the old pad's HUD, nothing written, a failure) the card leaves as it always did.
   */
  _book() {
    const sc = this.sc, H = sc.host; let ok = false;
    try {
      const W = H ? H.st.state.chronicle : null;
      ok = !!W && W.length > 0 && sc.hudKind === 'ui' && typeof sc.hud.openScreen === 'function' && sc.hud.openScreen('chronicle', { at: W[W.length - 1], onClose: () => this.leave() }) === true;
      if (ok) H.note('book', 'after the card', String(W.length));
    } catch (e) { ok = false; console.warn('[v2g] the chronicle after the ending card did not open:', String(e?.message ?? e)); }
    if (!ok) this.leave();
  }
  /** after the ending: the save, then the 3D chooser (registered here when the game was opened straight into this scene) */
  leave() {
    const sc = this.sc, g = sc.game, H = sc.host; if (this.endT < 0) return;
    this.endT = -1; this.seen = true;
    if (H) { H.ended = null; try { H.saveNow('end'); } catch (e) { console.error('[v2g] save after the ending failed', e); } }
    const go = () => { if (g.top === sc) sc._leave(); };
    if (g.registry.v2pick) go();
    else import('../chooser.js').then((m) => { if (!g.registry.v2pick) g.register('v2pick', m.default); }).catch((e) => console.warn('[v2g] the chooser did not load:', String(e?.message ?? e))).then(go);
  }
}
