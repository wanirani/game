// Adversarial tests of the story runner (STORY-REVIEW lane). Run: node tools/v2/story_break.mjs [--dir <folder>]
// Exit 0 = every test passed. Not part of the game data.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const di = args.indexOf('--dir');
const dir = path.resolve(di >= 0 ? args[di + 1] : 'tools/v2/story_stage');
const { STORY, createStory } = await import(pathToFileURL(path.join(dir, 'index.js')).href);

let fails = 0;
const ok = (cond, what) => { if (cond) console.log('  ok   ' + what); else { fails++; console.log('  FAIL ' + what); } };

// a small game: dialogue pages wait for next() / choose(i); area changes answer at once with area.enter
function game(opts) {
  const o = opts || {};
  const warns = [];
  const st = createStory(STORY, { warn: (m) => warns.push(m) });
  const g = { st, warns, page: null, pages: [], log: [], area: null, saves: [] };
  const twin = { eshville_now: 'eshville_past', eshville_past: 'eshville_now', graveyard_now: 'graveyard_past', graveyard_past: 'graveyard_now', ossuary_now: 'ossuary_past', ossuary_past: 'ossuary_now' };
  g.api = {
    showDialog(d) { g.page = d; g.pages.push((d.speaker || '') + ': ' + d.text.replace(/\n/g, ' / ')); },
    banner(kind, t, s) { g.log.push('banner ' + t); }, toast(t) { g.log.push('toast ' + t); }, lock() {}, sound() {}, fx() {}, wakeGroup() {},
    prompt(p) { g.log.push('prompt ' + (p ? p.label : 'null')); }, objective(t) { g.log.push('objective ' + t); },
    unlockExit(id, a) { g.log.push('unlock ' + a + '/' + id); }, lockExit() {}, hideActor(id, a) { g.log.push('hide ' + a + '/' + id); }, showActor(id, a) { g.log.push('show ' + a + '/' + id); },
    camera(shot, s, done) { done(); }, wait(s, done) { done(); }, music() {}, candle() {}, moon() {}, ring() {}, spawn() {}, moveActor(a, b, c, done) { done(); },
    save(obj) { g.saves.push(JSON.parse(JSON.stringify(obj))); }, end(id) { g.log.push('end ' + id); },
    gotoArea(id) { if (o.holdArea) { g.pendingArea = id; return; } g.enter(id); },
    bellCross(opt) { const to = (opt && opt.to) || twin[g.area]; if (o.holdArea) { g.pendingArea = to; return; } g.enter(to); },
  };
  g.enter = (id) => { g.area = id; st.story('area.enter', { area: id }, g.api); };
  g.ev = (name, d) => st.story(name, d, g.api);
  g.next = () => { const p = g.page; if (!p) return false; g.page = null; if (p.choices) p.onChoice(o.pick | 0); else p.onDone(); return true; };
  g.drain = (max) => { let n = 0; while (g.page && n < (max || 500)) { g.next(); n++; } return n; };
  g.I = (event, data, id) => g.ev('interact', { id: id || event, kind: 'x', event, data });
  g.T = (event) => g.ev('trigger', { id: event, event });
  g.talk = (key) => g.ev('talk', { id: key, talk: key });
  return g;
}

// play from the start to the first crossing (built areas only)
function toSmithy(g) {
  g.enter('eshville_now'); g.drain();
  g.T('church.arrive'); g.drain();
  g.ev('exit.missing', { id: 'to_belltower', to: 'belltower_now' }); g.drain();   // the fall (bridge)
  g.drain();
  g.ev('group.clear', { group: 'st_p' }); g.drain();
  g.talk('edmund.tavern'); g.drain();
}

console.log('1. unknown / malformed events');
{
  const g = game();
  let threw = null;
  try {
    g.ev('no.such.event', { a: 1 }); g.ev(undefined, undefined); g.ev('trigger', null); g.ev('interact', {}); g.ev('talk', {}); g.ev('talk', { talk: 'no.such.key' });
    g.st.story('area.enter', null, null); g.st.story('group.clear', { group: 'zzz' }, null); g.st.story('boss.phase', 7, undefined); g.st.story('', {}, {});
    g.st.talk('nope', null); g.st.load('rubbish'); g.st.load({ flags: 5, done: 'x', items: [1], area: 9 }); g.st.load(null);
  } catch (e) { threw = e; }
  ok(!threw, 'no throw on unknown names, missing data, missing api, rubbish saves' + (threw ? ' — ' + threw.message : ''));
  ok(!g.st.busy, 'nothing left running');
}

console.log('2. events in the wrong order');
{
  const g = game();
  g.enter('eshville_now'); g.drain();
  const before = JSON.stringify(g.st.save().flags);
  // late-game events fired in the first minute
  g.ev('boss.phase', { boss: 'banshee_queen', phase: 'sent' }); g.drain();
  g.ev('boss.phase', { boss: 'banshee_queen', phase: 'flee' }); g.drain();
  g.I('oss.elise'); g.drain(); g.I('oss.knell', { post: 1 }); g.drain(); g.I('bell.hang'); g.drain(); g.I('grave.carve', { grave: 'a' }); g.drain();
  g.ev('group.clear', { group: 'tower_bats' }); g.drain();
  g.ev('bell.echo', {}); g.drain();
  const f = g.st.save().flags;
  ok(!f.queen_sent && !f.queen_fled && !f.elise_found && !f.fell && !f.bell_hung && !f.carved_a, 'late events before their time change nothing (flags before: ' + before + ' → after: ' + JSON.stringify(f) + ')');
  ok(!g.st.has('crow_feather') && !g.st.has('knell_bell'), 'no items from out-of-order events');
  ok(g.area === 'eshville_now', 'still in the first area');
}

console.log('3. the same event twice');
{
  const g = game();
  g.enter('eshville_now'); const a = g.pages.length; g.enter('eshville_now'); g.drain();
  ok(g.pages.filter((p) => p.includes('1797년')).length === 1, 'area.enter twice: the opening plays once');
  g.T('church.arrive'); g.T('church.arrive'); g.drain();
  ok(g.pages.filter((p) => p.includes('카엘 발크레인입니다')).length === 1, 'trigger twice while the scene is open: plays once');
  g.talk('alberto.church'); g.talk('alberto.church'); g.talk('alberto.church');
  const n = g.drain();
  ok(n === 1, 'talk pressed three times while the box is open: one page, not three (got ' + n + ')');
  // the bell pressed twice during the crossing must not cross back
  const h = game({ holdArea: true });
  h.area = 'eshville_now'; h.st.load({ flags: { fell: true, crossed: true, promise: true, key_entrusted: true, met_edmund: true }, items: { valkrein_knot: 1 }, area: 'eshville_now', era: 'now', done: ['ev_opening', 'ev_past_wake', 'ev_bell_first', 'ev_return_first'] });
  h.st.story('area.enter', { area: 'eshville_now' }, h.api); h.drain();
  h.I('bell.ring'); h.I('bell.ring'); h.I('bell.ring');
  const first = h.pendingArea; h.pendingArea = null; h.enter(first); h.drain();
  ok(first === 'eshville_past' && !h.pendingArea && h.area === 'eshville_past', 'bell pressed three times during one crossing: crosses once (now in ' + h.area + ', pending ' + h.pendingArea + ')');
}

console.log('4. save in the middle of a sequence → load → continue');
{
  // 4a. mid-dialogue save returns the state from before the scene; the scene replays
  const g = game(); toSmithy(g);
  g.talk('hadwin1.smithy'); g.next(); g.next();
  const mid = JSON.parse(JSON.stringify(g.st.save()));
  ok(!mid.flags.key_entrusted && g.st.busy, 'mid-scene save does not contain the half-played scene');
  const g2 = game(); g2.st.load(mid); g2.enter(mid.area); g2.drain();
  g2.talk('hadwin1.smithy'); g2.drain();
  ok(g2.st.flag('key_entrusted') && (g2.st.flag('key_order_silver') || g2.st.flag('key_order_iron')), 'after loading, the smithy scene replays from its start and completes');
  // a page callback of the old runner after load must do nothing
  const stale = g.page; g.st.load(mid); let threw = null; try { if (stale) { (stale.onChoice || stale.onDone)(0); } } catch (e) { threw = e; }
  ok(!threw && !g.st.busy, 'a stale dialogue callback after load is ignored');

  // 4b. save taken while the first crossing is under way, loaded with the hero already on the other side (worst case)
  const c = game({ holdArea: true }); c.area = 'eshville_past';
  const base = { flags: { fell: true, promise: true, key_entrusted: true, key_order_silver: true, met_edmund: true, pending_change: true }, items: { valkrein_knot: 1 }, area: 'eshville_past', era: 'past', done: ['ev_opening', 'ev_church_arrive', 'ev_past_wake', 'ev_table', 'ev_smithy_past'] };
  c.st.load(JSON.parse(JSON.stringify(base))); c.st.story('area.enter', { area: 'eshville_past' }, c.api); c.drain();
  c.I('bell.ring'); c.drain();
  const during = JSON.parse(JSON.stringify(c.st.save()));       // the crossing has not answered yet
  const d = game(); d.st.load(during); d.enter('eshville_now'); d.drain();   // the scene put the hero in 1797
  d.I('bell.ring'); d.drain();                                   // the player tries the bell
  if (d.area === 'eshville_now' && !d.st.flag('crossed')) { /* stuck */ }
  if (d.area === 'eshville_past') { d.I('bell.ring'); d.drain(); }
  ok(d.st.flag('crossed') && d.area === 'eshville_now' && d.pages.some((p) => p.includes('백 년 전입니다')), 'first crossing cut off and loaded on the 1797 side: the bell still works and the return scene plays (area ' + d.area + ', crossed ' + d.st.flag('crossed') + ')');

  // 4c. save taken after the crossing but before the return scene finished
  c.pendingArea && c.enter(c.pendingArea); c.next();
  const after = JSON.parse(JSON.stringify(c.st.save()));
  const e = game(); e.st.load(after); e.enter('eshville_now'); e.drain();
  if (e.area === 'eshville_past') { e.I('bell.ring'); e.drain(); }
  if (!e.pages.some((p) => p.includes('백 년 전입니다'))) { e.I('bell.ring'); e.drain(); if (e.area === 'eshville_past') { e.I('bell.ring'); e.drain(); } }
  ok(e.st.flag('crossed') && e.area === 'eshville_now' && e.pages.some((p) => p.includes('백 년 전입니다')) && e.st.objectiveText() === '대장간에 들른다', 'return scene cut off after the crossing: replays on load (objective: ' + e.st.objectiveText() + ')');

  // 4d. the ending cut off after the last crossing
  const z = game({ holdArea: true }); z.area = 'eshville_past';
  z.st.load({ flags: { fell: true, promise: true, crossed: true, key_entrusted: true, met_edmund: true, got_key: true, elise_found: true, keepers_promised: true, queen_sent: true, bell_hung: true }, items: { valkrein_knot: 1, key_silver: 1 }, area: 'eshville_past', era: 'past',
    done: ['ev_opening', 'ev_church_arrive', 'ev_past_wake', 'ev_table', 'ev_smithy_past', 'ev_bell_first', 'ev_return_first', 'ev_keepers'] });
  z.st.story('area.enter', { area: 'eshville_past' }, z.api); z.drain();
  z.I('bell.ring'); z.drain();
  const s1 = JSON.parse(JSON.stringify(z.st.save()));
  z.pendingArea && z.enter(z.pendingArea); z.next();
  const s2 = JSON.parse(JSON.stringify(z.st.save()));
  for (const [label, sv] of [['during the crossing', s1], ['during the ending scene', s2]]) {
    const y = game(); y.st.load(sv); y.enter('eshville_now'); y.drain();
    if (!y.st.flag('elise_home')) { y.I('bell.ring'); y.drain(); if (y.area === 'eshville_past') { y.I('bell.ring'); y.drain(); } }
    ok(y.st.flag('elise_home') && y.log.includes('end r1') && y.area === 'eshville_now', 'ending cut off ' + label + ' and loaded in 1797: the ending still plays (elise_home ' + y.st.flag('elise_home') + ', area ' + y.area + ')');
  }
}

console.log('5. a choice answered while another sequence waits');
{
  const g = game({ pick: 1 }); toSmithy(g);
  g.talk('hadwin1.smithy');
  let guard = 0; while (g.page && !g.page.choices && guard++ < 20) g.next();
  ok(g.page && g.page.choices && g.page.choices.length === 2, 'the choice page is open (' + (g.page && g.page.choices) + ')');
  g.ev('hero.dead', {}); g.ev('hero.respawn', {}); g.T('past.street'); g.talk('lotte.fell');   // other things happen meanwhile
  const ch = g.page; ch.onChoice(1); ch.onChoice(0); ch.onChoice(1);                              // answered three times
  g.page === ch && (g.page = null);
  g.drain();
  ok(g.st.flag('key_order_iron') && !g.st.flag('key_order_silver'), 'the first answer counts, later answers are ignored');
  ok(g.st.flag('key_entrusted') && !g.st.busy, 'the choice scene finished, queued sequences ran afterwards, nothing left running');
  ok(g.pages.some((p) => p.includes('갓 묻힌 주검')), 'the queued sequence played after the scene');
}

console.log('6. 10,000 unmatched events');
{
  const g = game(); g.enter('eshville_now'); g.drain();
  const api = g.api; const st = g.st;
  const d1 = { id: 'x', event: 'no.such' }, d2 = { group: 'nope' }, d3 = { enemy: { group: null } };
  const run = (n) => { for (let i = 0; i < n; i++) { st.story('play.hit', d1, api); st.story('trigger', d1, api); st.story('interact', d1, api); st.story('group.clear', d2, api); st.story('enemy.kill', d3, api); } };
  run(20000);                                  // warm up
  if (global.gc) global.gc();
  const h0 = process.memoryUsage().heapUsed, t0 = process.hrtime.bigint();
  run(2000);                                   // 5 × 2,000 = 10,000 events
  const t1 = process.hrtime.bigint(), h1 = process.memoryUsage().heapUsed;
  const ms = Number(t1 - t0) / 1e6;
  console.log('  10,000 events (2,000 each of an unknown name, trigger, interact, group.clear, enemy.kill): ' + ms.toFixed(2) + ' ms = ' + (ms * 100).toFixed(1) + ' ns each, heap ' + ((h1 - h0) / 1024).toFixed(1) + ' KB');
  ok(ms < 20, 'under 20 ms for 10,000 events');
  ok(h1 - h0 < 64 * 1024, 'heap growth under 64 KB (no per-event allocation)');
  ok(!st.busy && g.warns.length === 0, 'no warnings, nothing started (' + g.warns.length + ' warnings)');
}

console.log(fails ? 'FAILED: ' + fails : 'OK: all break tests passed');
process.exit(fails ? 1 : 0);
