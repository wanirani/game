// Story runner. Pure: no imports, no browser or Node API, no timers. The game scene owns time, the screen and storage;
// this file only walks the tables of index.js. Contract: docs/v2/DATA_FORMAT.md (sections 1, 3, 4, 5, 6, 10).
//
//   const st = createStory(STORY, { warn });
//   scene.setStory(st.story);            // story(name, data, api) of ENGINE_API section 6
//   st.talk(key, api); st.save(); st.load(obj); st.reset(); st.state
//
// Cost: an event name nobody listens to is one Map lookup and returns (no allocation). Nothing runs per frame.

const SAVE_VERSION = 1;

function freshState() {
  return {
    v: SAVE_VERSION, flags: {}, items: {}, done: [], seen: {}, chronicle: [], objective: null,
    exits: {}, actors: {}, area: null, era: 'now', spawn: null, moon: 0, ring: 0, candles: 3,
  };
}

function parseCond(s) {
  let neg = false;
  if (s.charCodeAt(0) === 33) { neg = true; s = s.slice(1); }
  const i = s.indexOf(':');
  return i < 0 ? { t: 'flag', k: s, neg } : { t: s.slice(0, i), k: s.slice(i + 1), neg };
}
function compileConds(list) {
  if (!list) return null;
  if (typeof list === 'string') list = [list];
  return list.length ? list.map(parseCond) : null;
}

export function createStory(data, opts) {
  const D = data || {};
  const O = opts || {};
  const warnFn = typeof O.warn === 'function' ? O.warn : null;
  const logFn = typeof O.log === 'function' ? O.log : null;
  const warned = new Set();
  function warn(msg) { if (warned.has(msg)) return; warned.add(msg); if (warnFn) { try { warnFn(msg); } catch (e) { /* the reporter must not break the game */ } } }

  const PEOPLE = D.PEOPLE || {}, DIALOGS = D.DIALOGS || {}, ITEMS = D.ITEMS || {}, OBJECTIVES = D.OBJECTIVES || {};
  const CHRONICLE = D.CHRONICLE || {}, TEXT = D.TEXT || {}, EVENTS = D.EVENTS || [];

  const state = freshState();
  const doneSet = new Set();
  let cur = null;            // running sequence: { rec, frames, api, wait, token }
  const queue = [];          // waiting to start: { rec, api }
  let pumping = false, tokenSeq = 0, snap = null, lastApi = null;

  // ---------- conditions ----------
  function test(c) {
    let v;
    switch (c.t) {
      case 'flag': v = !!state.flags[c.k]; break;
      case 'era': v = state.era === c.k; break;
      case 'area': v = state.area === c.k; break;
      case 'has': v = (state.items[c.k] | 0) > 0; break;
      case 'done': v = doneSet.has(c.k); break;
      case 'seen': v = (state.seen[c.k] | 0) > 0; break;
      default: warn('unknown condition "' + c.t + ':' + c.k + '"'); v = false;
    }
    return c.neg ? !v : v;
  }
  function holds(all, any) {
    if (all) for (let i = 0; i < all.length; i++) if (!test(all[i])) return false;
    if (any) { for (let i = 0; i < any.length; i++) if (test(any[i])) return true; return false; }
    return true;
  }

  // ---------- compile the tables once ----------
  function pageStep(p, choice) {
    const who = Array.isArray(p) ? p[0] : p.who, text = Array.isArray(p) ? p[1] : p.text, mood = Array.isArray(p) ? p[2] : p.mood;
    return ['_page', who, text, mood || null, choice || null];
  }
  function compilePages(pages, choice, then) {
    const out = [];
    const n = pages ? pages.length : 0;
    for (let i = 0; i < n; i++) out.push(pageStep(pages[i], choice && i === n - 1 ? choice : null));
    if (choice && !n) out.push(['_page', 'narrator', '', null, choice]);
    if (then) for (let i = 0; i < then.length; i++) out.push(then[i]);
    return out;
  }
  function compileChoice(ch) {
    if (!ch || !Array.isArray(ch.options)) return null;
    return { labels: ch.options.map((o) => o.label), frames: ch.options.map((o) => compilePages(o.pages, null, o.then)) };
  }
  const dialogs = new Map();   // key → [{ all, any, once, tag, steps }]
  for (const key in DIALOGS) {
    const vs = DIALOGS[key];
    if (!Array.isArray(vs)) { warn('dialogue "' + key + '" is not a list of variants'); continue; }
    dialogs.set(key, vs.map((v, i) => ({
      all: compileConds(v.if), any: compileConds(v.ifAny), once: !!v.once, tag: key + '#' + i,
      steps: compilePages(v.pages, compileChoice(v.choice), v.then),
    })));
  }
  const byName = new Map();    // event name → [rec]
  const byId = new Map();
  for (let i = 0; i < EVENTS.length; i++) {
    const ev = EVENTS[i];
    if (!ev || !ev.id) { warn('event #' + i + ' has no id'); continue; }
    if (byId.has(ev.id)) warn('event id "' + ev.id + '" is used twice');
    const match = [];
    if (ev.match) for (const k in ev.match) match.push(k.indexOf('.') < 0 ? k : k.split('.'), ev.match[k]);
    const rec = { id: ev.id, on: ev.on || null, match, all: compileConds(ev.if), any: compileConds(ev.ifAny), once: ev.once !== false, steps: ev.steps || [], minute: ev.minute || null };
    byId.set(ev.id, rec);
    if (rec.on) { let l = byName.get(rec.on); if (!l) byName.set(rec.on, l = []); l.push(rec); }
  }

  function matches(rec, d) {
    const m = rec.match;
    for (let i = 0; i < m.length; i += 2) {
      const k = m[i];
      let v;
      if (typeof k === 'string') v = d ? d[k] : undefined;
      else { v = d; for (let j = 0; j < k.length && v != null; j++) v = v[k[j]]; }
      if (v !== m[i + 1]) return false;
    }
    return true;
  }

  // ---------- calling the game ----------
  function find(api, name) {
    if (!api) return null;
    // the v2 notice is the HUD's (UI_API section 9.7); ENGINE's own api.toast is the old shell toast and comes second
    if (name === 'toast' && api.scene && api.scene.hud && typeof api.scene.hud.toast === 'function') return api.scene.hud;
    if (typeof api[name] === 'function') return api;
    const sc = api.scene;
    if (sc) {
      const h = sc.hud;
      if (h && typeof h[name] === 'function') return h;
      if (typeof sc[name] === 'function') return sc;
    }
    return null;
  }
  function call(api, name, a, b, c, d) {
    const o = find(api, name);
    if (!o) { warn('api.' + name + ' is missing — step skipped'); return false; }
    try { o[name](a, b, c, d); } catch (e) { warn('api.' + name + ' threw: ' + (e && e.message)); return false; }
    return true;
  }
  function callOpt(api, name, a, b, c) {
    const o = find(api, name);
    if (!o) return false;
    try { o[name](a, b, c); } catch (e) { warn('api.' + name + ' threw: ' + (e && e.message)); }
    return true;
  }

  // ---------- state changes ----------
  function setFlag(name, value, api) {
    if (D.FLAGS && !D.FLAGS[name]) warn('flag "' + name + '" is not declared in FLAGS');
    if (value) state.flags[name] = value === true ? true : value; else delete state.flags[name];
    callOpt(api, 'onFlag', name, !!value);
  }
  function give(id, n, api, quiet) {
    const it = ITEMS[id];
    if (!it) warn('item "' + id + '" is not in ITEMS');
    if (n < 0 && (state.items[id] | 0) < -n) warn('take: "' + id + '" is not in the bag');
    const c = Math.max(0, (state.items[id] | 0) + n);
    if (c) state.items[id] = c; else delete state.items[id];
    callOpt(api, 'onItem', id, c);
    if (n > 0 && !quiet) {
      const fmt = (TEXT.system && TEXT.system.got) || '{name}';
      call(api, 'toast', fmt.replace('{name}', it ? it.name : id), TOAST_ITEM);
    }
  }
  const TOAST_ITEM = { kind: 'item' }, TOAST_INFO = { kind: 'info' }, TOAST_WARN = { kind: 'warn' };
  function exitKey(area, id) { return (area || state.area || '?') + '/' + id; }
  function markDone(rec) { if (rec.once && !doneSet.has(rec.id)) { doneSet.add(rec.id); state.done.push(rec.id); } }

  // ---------- the step machine ----------
  function begin(rec, api) {
    snap = serialize();
    cur = { rec, frames: [{ steps: rec.steps, pc: 0 }], api: api || lastApi, wait: null, token: 0 };
    if (logFn) logFn('begin ' + rec.id);
    pump();
  }
  function finish() {
    const rec = cur.rec;
    markDone(rec);
    if (logFn) logFn('end ' + rec.id);
    cur = null; snap = null;
  }
  function pump() {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        if (!cur) {
          if (!queue.length) break;
          const q = queue.shift();
          // a queued once-sequence may have been finished meanwhile (run step) or its conditions may no longer hold
          if (q.rec.once && doneSet.has(q.rec.id)) continue;
          snap = serialize();
          cur = { rec: q.rec, frames: [{ steps: q.rec.steps, pc: 0 }], api: q.api || lastApi, wait: null, token: 0 };
          if (logFn) logFn('begin ' + q.rec.id);
        }
        if (cur.wait) break;
        const f = cur.frames[cur.frames.length - 1];
        if (f.pc >= f.steps.length) {
          cur.frames.pop();
          if (f.mark) markDone(f.mark);
          if (!cur.frames.length) finish();
          continue;
        }
        const step = f.steps[f.pc++];
        try { exec(step, cur.api); } catch (e) { warn('step ' + JSON.stringify(step && step[0]) + ' in ' + cur.rec.id + ' failed: ' + (e && e.message)); if (cur) { cur.wait = null; cur.token = 0; } }
      }
    } finally { pumping = false; }
  }
  function hold(kind) { const t = ++tokenSeq; cur.wait = kind; cur.token = t; return t; }
  function resume(tok) {
    if (!cur || cur.token !== tok) return;
    cur.wait = null; cur.token = 0;
    pump();
  }
  function waiter(tok) { return () => resume(tok); }
  function pushFrame(steps, mark) { if (steps && steps.length) cur.frames.push({ steps, pc: 0, mark: mark || null }); }

  function pickVariant(key) {
    const vs = dialogs.get(key);
    if (!vs) { warn('dialogue "' + key + '" does not exist'); return null; }
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.once && state.seen[v.tag]) continue;
      if (holds(v.all, v.any)) return v;
    }
    warn('dialogue "' + key + '" has no variant for the current state');
    return null;
  }

  function showPage(api, who, text, mood, choice) {
    const p = PEOPLE[who];
    if (!p && who !== 'narrator') warn('speaker "' + who + '" is not in PEOPLE');
    const d = { who, speaker: p && p.name && who !== 'narrator' ? p.name : '', portrait: null, side: (p && p.side) || 'left', text: text || '' };
    if (p) d.portrait = (mood && p.moods && p.moods[mood]) || p.portrait || null;
    if (mood && p && !(p.moods && p.moods[mood])) warn('mood "' + mood + '" of "' + who + '" has no portrait');
    const tok = hold('dialog');
    if (choice) {
      d.choices = choice.labels;
      d.onChoice = (i) => {
        if (!cur || cur.token !== tok) return;
        const k = i === 1 ? 1 : 0;
        pushFrame(choice.frames[k]);
        resume(tok);
      };
    } else d.onDone = waiter(tok);
    const o = find(api, 'showDialog');
    if (o) { try { o.showDialog(d); } catch (e) { warn('api.showDialog threw: ' + (e && e.message)); resume(tok); } }
    else if (api && typeof api.setDialog === 'function') {
      // state path (scene.ui.dialog): clear the object when the page is dismissed so that the next page counts as new
      const done = d.onDone, pick = d.onChoice;
      if (done) d.onDone = () => { api.setDialog(null); done(); };
      if (pick) d.onChoice = (i) => { api.setDialog(null); pick(i); };
      api.setDialog(d);
    }
    else { warn('api.showDialog is missing — dialogue skipped'); if (choice) d.onChoice(0); else resume(tok); }
  }

  function exec(s, api) {
    const op = s[0];
    switch (op) {
      case '_page': showPage(api, s[1], s[2], s[3], s[4]); break;
      case 'say': {
        if (typeof s[1] === 'string') {
          const v = pickVariant(s[1]);
          if (!v) break;
          state.seen[s[1]] = (state.seen[s[1]] | 0) + 1;
          if (v.once) state.seen[v.tag] = 1;
          pushFrame(v.steps);
        } else pushFrame(compilePages(s[1], null, null));
        break;
      }
      case 'banner': call(api, 'banner', s[1], s[2], s[3]); break;
      case 'toast': call(api, 'toast', s[1], s[2] === 'item' ? TOAST_ITEM : s[2] === 'warn' ? TOAST_WARN : TOAST_INFO); break;
      case 'prompt': {
        if (s[1] == null) { call(api, 'prompt', null); break; }
        const p = TEXT.prompts && TEXT.prompts[s[1]];
        if (!p) { warn('prompt "' + s[1] + '" is not in TEXT.prompts'); break; }
        if (p.action) call(api, 'prompt', p); else callOpt(api, 'prompt', null);
        if (p.tip) call(api, 'toast', p.tip, TOAST_INFO);
        break;
      }
      case 'give': give(s[1], s[2] == null ? 1 : s[2], api, false); break;
      case 'take': give(s[1], -(s[2] == null ? 1 : s[2]), api, true); break;
      case 'setFlag': setFlag(s[1], s[2] == null ? true : s[2], api); break;
      case 'clearFlag': setFlag(s[1], false, api); break;
      case 'unlockExit': state.exits[exitKey(s[2], s[1])] = null; call(api, 'unlockExit', s[1], s[2] || state.area); break;
      case 'lockExit': state.exits[exitKey(s[3], s[1])] = s[2] || 'story'; call(api, 'lockExit', s[1], s[2] || 'story', s[3] || state.area); break;
      case 'wakeGroup': call(api, 'wakeGroup', s[1]); break;
      case 'spawn': call(api, 'spawn', s[1], s[2], s[3]); break;
      case 'hideActor': state.actors[exitKey(s[2], s[1])] = 'hide'; call(api, 'hideActor', s[1], s[2] || state.area); break;
      case 'showActor': state.actors[exitKey(s[2], s[1])] = 'show'; call(api, 'showActor', s[1], s[2] || state.area); break;
      case 'moveActor': { const t = hold('cb'); if (!call(api, 'moveActor', s[1], s[2], s[3] || null, waiter(t))) resume(t); break; }
      case 'moveHero': { const t = hold('cb'); if (!call(api, 'moveHero', s[1], s[2] || null, waiter(t))) resume(t); break; }   // the hero walks to a mark (DATA_FORMAT 5)
      case 'putActor': call(api, 'putActor', s[1], s[2], s[3] || null); break;                                                   // a person is set down somewhere at once (out of the picture)
      case 'camera': { const t = hold('cb'); if (!call(api, 'camera', s[1], s[2] == null ? 0 : s[2], waiter(t))) resume(t); break; }
      case 'wait': { const t = hold('cb'); if (!call(api, 'wait', s[1], waiter(t))) resume(t); break; }
      case 'sound': call(api, 'sound', s[1], s[2]); break;
      case 'music': call(api, 'music', s[1]); break;
      case 'fx': call(api, 'fx', s[1], s[2]); break;
      case 'objective': {
        const o = s[1] == null ? null : OBJECTIVES[s[1]];
        if (s[1] != null && !o) warn('objective "' + s[1] + '" is not in OBJECTIVES');
        state.objective = o ? o.id : null;
        call(api, 'objective', o ? o.text : '', o ? o.id : null);
        break;
      }
      case 'chronicle': {
        const e = CHRONICLE[s[1]];
        if (!e) { warn('chronicle "' + s[1] + '" is not in CHRONICLE'); break; }
        if (state.chronicle.indexOf(s[1]) < 0) {
          state.chronicle.push(s[1]);
          if (!callOpt(api, 'chronicle', e)) call(api, 'toast', ((TEXT.system && TEXT.system.chronicle) || '{title}').replace('{title}', e.title), TOAST_INFO);
        }
        break;
      }
      case 'candle': if (s[1] > 0) state.candles += s[1]; call(api, 'candle', s[1]); break;
      case 'moon': state.moon = s[1]; call(api, 'moon', s[1]); break;
      case 'ring': state.ring = s[1]; call(api, 'ring', s[1]); break;
      case 'lockInput': call(api, 'lock', !!s[1]); break;
      case 'save': {
        // the copy includes this sequence as finished when save is its last step
        let last = true;
        for (let i = 0; i < cur.frames.length; i++) if (cur.frames[i].pc < cur.frames[i].steps.length) last = false;
        if (last) { for (let i = 0; i < cur.frames.length; i++) if (cur.frames[i].mark) markDone(cur.frames[i].mark); markDone(cur.rec); }
        else warn('save in ' + cur.rec.id + ' is not the last step — the scene would replay after loading');
        call(api, 'save', serialize());
        break;
      }
      case 'gotoArea': {
        const t = hold('area');
        state.spawn = s[2] || null;
        if (!call(api, 'gotoArea', s[1], s[2] || null)) resume(t);
        break;
      }
      case 'bellCross': {
        const t = hold('area');
        if (!call(api, 'bellCross', s[1] || null)) resume(t);
        break;
      }
      case 'if': pushFrame(holds(compileConds(s[1]), null) ? s[2] : s[3]); break;
      case 'run': {
        const r = byId.get(s[1]);
        if (!r) { warn('run: event "' + s[1] + '" does not exist'); break; }
        if (r.once && doneSet.has(r.id)) break;
        pushFrame(r.steps, r);
        if (!r.steps.length) markDone(r);
        break;
      }
      case 'end': callOpt(api, 'end', s[1]); break;
      default: warn('unknown step "' + op + '" in ' + (cur ? cur.rec.id : '?'));
    }
  }

  // ---------- events in ----------
  function onAreaEnter(d, api) {
    const a = d && d.area;
    const id = a && typeof a === 'object' ? a.id : a;
    if (id) state.area = id;
    let era = (d && d.era) || (a && typeof a === 'object' && a.era) || null;
    if (!era && api && api.scene && api.scene.area && api.scene.area.id === id) era = api.scene.area.era;
    if (!era && typeof id === 'string') era = id.slice(-5) === '_past' ? 'past' : 'now';
    if (era) state.era = era;
    // lock / actor overrides of this area (kept in the save)
    for (const k in state.exits) {
      const i = k.indexOf('/');
      if (k.slice(0, i) !== state.area) continue;
      const v = state.exits[k];
      if (v == null) callOpt(api, 'unlockExit', k.slice(i + 1), state.area); else callOpt(api, 'lockExit', k.slice(i + 1), v, state.area);
    }
    for (const k in state.actors) {
      const i = k.indexOf('/');
      if (k.slice(0, i) !== state.area) continue;
      callOpt(api, state.actors[k] === 'hide' ? 'hideActor' : 'showActor', k.slice(i + 1), state.area);
    }
    if (cur && cur.wait === 'area') { const t = cur.token; cur.wait = null; cur.token = 0; if (t) pump(); }
  }

  // All listeners are tested against the state as it is when the event arrives, then started in table order.
  // (A sequence that finishes at once must not make a later listener of the same event match.)
  const hits = [];
  let hitTop = 0;
  function dispatch(name, d, api) {
    const list = byName.get(name);
    if (!list) return 0;
    const base = hitTop;
    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      if (rec.once && doneSet.has(rec.id)) continue;
      if (!matches(rec, d) || !holds(rec.all, rec.any)) continue;
      // the same sequence is never started twice at once: a second press while it runs or waits in the queue is dropped
      // (a double tap on a bell would otherwise cross and cross straight back)
      if ((cur && cur.rec === rec) || queued(rec)) continue;
      hits[hitTop++] = rec;
    }
    const n = hitTop - base;
    for (let i = base; i < base + n; i++) { const rec = hits[i]; hits[i] = null; if (cur) queue.push({ rec, api, force: true }); else begin(rec, api); }
    hitTop = base;
    return n;
  }
  function queued(rec) { for (let i = 0; i < queue.length; i++) if (queue[i].rec === rec) return true; return false; }

  function story(name, d, api) {
    if (api) lastApi = api;
    if (name === 'area.enter') onAreaEnter(d, api);
    else if (name === 'talk') { talkWith(d && d.talk, d, api); return; }
    else if (name === 'enemy.kill') {
      const g = d && d.enemy && d.enemy.group;
      if (g && byName.has('group.clear') && api && typeof api.groupLeft === 'function' && api.groupLeft(g) === 0) dispatch('group.clear', { group: g }, api);
    }
    dispatch(name, d, api);
  }

  function talkWith(key, d, api) {
    if (!key) { warn('talk without a key'); return false; }
    if (api) lastApi = api;
    // a sequence listening to this talk wins over the plain dialogue
    if (byName.has('talk') && dispatch('talk', d || { talk: key }, api)) return true;
    if (!dialogs.has(key)) { warn('dialogue "' + key + '" does not exist'); return false; }
    const tid = 'talk:' + key;
    // the same person pressed again while their lines are open or waiting: once is enough
    if (cur && cur.rec.id === tid) return true;
    for (let i = 0; i < queue.length; i++) if (queue[i].rec.id === tid) return true;
    const rec = { id: tid, on: null, match: [], all: null, any: null, once: false, steps: [['say', key]], minute: null };
    if (cur) queue.push({ rec, api, force: true }); else begin(rec, api);
    return true;
  }

  // ---------- save / load ----------
  function serialize() {
    const s = state;
    return {
      v: SAVE_VERSION, flags: Object.assign({}, s.flags), items: Object.assign({}, s.items), done: s.done.slice(), seen: Object.assign({}, s.seen),
      chronicle: s.chronicle.slice(), objective: s.objective, exits: Object.assign({}, s.exits), actors: Object.assign({}, s.actors),
      area: s.area, era: s.era, spawn: s.spawn, moon: s.moon, ring: s.ring, candles: s.candles,
    };
  }
  function assign(src) {
    const f = freshState();
    const o = src && typeof src === 'object' ? src : {};
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.assign({}, v) : {});
    const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    state.v = SAVE_VERSION;
    state.flags = obj(o.flags); state.items = obj(o.items); state.seen = obj(o.seen); state.exits = obj(o.exits); state.actors = obj(o.actors);
    state.done = arr(o.done); state.chronicle = arr(o.chronicle);
    state.objective = typeof o.objective === 'string' ? o.objective : f.objective;
    state.area = typeof o.area === 'string' ? o.area : f.area;
    state.era = o.era === 'past' ? 'past' : 'now';
    state.spawn = typeof o.spawn === 'string' ? o.spawn : f.spawn;
    state.moon = Number.isFinite(o.moon) ? o.moon : f.moon;
    state.ring = Number.isFinite(o.ring) ? o.ring : f.ring;
    state.candles = Number.isFinite(o.candles) ? o.candles : f.candles;
    doneSet.clear();
    for (let i = 0; i < state.done.length; i++) doneSet.add(state.done[i]);
    cur = null; queue.length = 0; snap = null;
  }

  function chronicleList() {
    const out = [];
    for (const id in CHRONICLE) {
      const e = CHRONICLE[id];
      if (e.show && !holds(compileConds(e.show), null)) continue;
      const filled = state.chronicle.indexOf(id) >= 0 || (e.unlock && e.unlock.length ? holds(compileConds(e.unlock), null) : e.kind !== 'blank');
      out.push({ id, order: e.order || 0, kind: e.kind || 'line', title: e.title, filled, body: e.body || '', past: filled ? e.past || '' : '', now: filled ? e.now || '' : '' });
    }
    out.sort((a, b) => a.order - b.order);
    return out;
  }

  return {
    story,
    state,
    talk: (key, api) => talkWith(key, null, api),
    save: () => (cur && snap ? snap : serialize()),
    load: (obj) => { assign(obj); },
    reset: () => { assign(null); warned.clear(); },
    // helpers for the scene and the UI (not needed by the story itself)
    flag: (name) => !!state.flags[name],
    has: (id) => (state.items[id] | 0) > 0,
    isDone: (id) => doneSet.has(id),
    get busy() { return !!cur; },
    get running() { return cur ? cur.rec.id : null; },
    exitLock: (area, id, original) => { const k = area + '/' + id; return k in state.exits ? state.exits[k] : original; },
    actorShown: (area, id, original) => { const v = state.actors[area + '/' + id]; return v ? v === 'show' : original; },
    objectiveText: () => (state.objective && OBJECTIVES[state.objective] ? OBJECTIVES[state.objective].text : ''),
    chronicleList,
    test: (conds, any) => holds(compileConds(conds), compileConds(any)),
  };
}
