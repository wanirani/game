// Adversarial tests of the story runner (STORY-REVIEW lane). Run: node tools/v2/story_break.mjs [--dir <folder>]
// Exit 0 = every test passed. Not part of the game data.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const di = args.indexOf('--dir');
const dir = path.resolve(di >= 0 ? args[di + 1] : 'src/v2/data');
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
  g.drain();
  ok(g.pages.filter((p) => p.includes('아이는 벌써')).length === 1 && !g.pages.some((p) => p.includes('두려워 말게')), 'talk pressed three times while the box is open: the lines play once, the next variant is not used up');
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

// ---- the whole release under stress: every route step doubled, and every scene cut off by a save / load ----
const { ROUTE_A, ROUTE_B } = await import(pathToFileURL(path.resolve('tools/v2/story_route.mjs')).href);
function fire(g, step) {
  if (step[0] === 'ev') g.ev(step[1], step[2]);
  else if (step[0] === 'talk') g.talk(step[1]);
}
function settle(g) {                      // answer everything that waits: pages, then a pending area change, until quiet
  for (let i = 0; i < 400; i++) {
    if (g.page) { g.next(); continue; }
    if (g.pendingArea) { const a = g.pendingArea; g.pendingArea = null; g.enter(a); continue; }
    break;
  }
}
function playRoute(route, pick, mode) {
  const g = game({ pick, holdArea: true });
  let cuts = 0;
  for (const step of route) {
    if (step[0] !== 'ev' && step[0] !== 'talk') continue;
    if (step[0] === 'ev' && step[1] === 'area.enter') { g.area = step[2].area; }
    fire(g, step);
    if (mode === 'double') { fire(g, step); fire(g, step); }
    if (mode === 'cut' && g.st.busy && (g.page || g.pendingArea)) {
      // the player quits in the middle of this scene; the game is loaded again from the story save
      if (g.page && Math.random() < 0.5) g.next();
      const sv = JSON.parse(JSON.stringify(g.st.save()));
      g.page = null; g.pendingArea = null;
      g.st.load(sv); cuts++;
      g.enter(sv.area || g.area); settle(g);
      fire(g, step);                      // and does the same thing again
    }
    settle(g);
  }
  return { g, cuts, done: g.st.flag('elise_home') && g.log.includes('end r1') && !g.st.busy, flags: Object.keys(g.st.save().flags).sort().join(' '), items: JSON.stringify(g.st.save().items), chron: g.st.save().chronicle.join(' ') };
}
console.log('7. every step of the release fired three times in a row (routes A and B, both choices)');
for (const [name, route] of [['A', ROUTE_A], ['B', ROUTE_B]]) for (const pick of [0, 1]) {
  const clean = playRoute(route, pick, 'clean'), dbl = playRoute(route, pick, 'double');
  ok(clean.done, 'route ' + name + ' choice ' + pick + ': clean play reaches the ending');
  ok(dbl.done && dbl.flags === clean.flags && dbl.items === clean.items && dbl.chron === clean.chron, 'route ' + name + ' choice ' + pick + ': tripled events end in the same state (' + (dbl.done ? 'ended' : 'NOT ended, area ' + dbl.g.area + ', running ' + dbl.g.st.running) + (dbl.flags === clean.flags ? '' : '; flags differ') + (dbl.items === clean.items ? '' : '; items ' + dbl.items + ' vs ' + clean.items) + ')');
  ok(dbl.g.warns.length === clean.g.warns.length, 'no new warnings (' + dbl.g.warns.slice(0, 2).join(' | ') + ')');
}
console.log('8. every scene cut off by quitting (save → load → same action again), routes A and B');
for (const [name, route] of [['A', ROUTE_A], ['B', ROUTE_B]]) for (const pick of [0, 1]) {
  const clean = playRoute(route, pick, 'clean');
  let bad = 0, cuts = 0, why = '';
  for (let r = 0; r < 5; r++) { const c = playRoute(route, pick, 'cut'); cuts += c.cuts; if (!c.done || c.flags !== clean.flags || c.chron !== clean.chron) { bad++; why = (c.done ? 'ended' : 'NOT ended in ' + c.g.area + ' running ' + c.g.st.running) + (c.flags === clean.flags ? '' : ' flags differ') + (c.chron === clean.chron ? '' : ' chronicle differs'); } }
  ok(bad === 0, 'route ' + name + ' choice ' + pick + ': 5 plays, ' + cuts + ' scenes cut off and replayed, all reach the same ending' + (bad ? ' — ' + bad + ' failed: ' + why : ''));
}

console.log('9. random events (fuzz)');
{
  const names = ['area.enter', 'trigger', 'interact', 'talk', 'group.clear', 'exit.locked', 'exit.missing', 'bell.echo', 'boss.phase', 'hero.dead', 'hero.respawn', 'section.enter', 'enemy.kill', 'exit'];
  const vals = new Set(), talks = Object.keys(STORY.DIALOGS || STORY.dialogs || {});
  for (const e of STORY.EVENTS || STORY.events || []) for (const k in (e.match || {})) vals.add(JSON.stringify([k, e.match[k]]));
  const pool = [...vals].map((x) => JSON.parse(x));
  let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let threw = null, stuck = 0, n = 0;
  for (let run = 0; run < 300 && !threw; run++) {
    const g = game({ pick: rnd(2), holdArea: rnd(2) === 1 });
    try {
      for (let i = 0; i < 200; i++) {
        const nm = names[rnd(names.length)], d = {};
        for (let k = 0; k < 2; k++) { const [key, v] = pool[rnd(pool.length)]; if (key.indexOf('.') > 0) { const [a, b] = key.split('.'); d[a] = Object.assign(d[a] || {}, { [b]: v }); } else d[key] = v; }
        if (nm === 'talk') d.talk = talks[rnd(talks.length)];
        if (nm === 'area.enter' && typeof d.area === 'string') g.area = d.area;
        g.ev(nm, d); n++;
        const r = rnd(6);
        if (r < 3) settle(g); else if (r === 3 && g.page) g.next(); else if (r === 4) { const sv = JSON.parse(JSON.stringify(g.st.save())); g.page = null; g.pendingArea = null; g.st.load(sv); }
      }
      settle(g);
      if (g.st.busy) stuck++;
    } catch (e) { threw = e; }
  }
  ok(!threw, n + ' random events in 300 games: no throw' + (threw ? ' — ' + (threw.stack || threw.message).split('\n').slice(0, 2).join(' ') : ''));
  ok(stuck === 0, 'no game left with a sequence that never ends (' + stuck + ')');
}

console.log(fails ? 'FAILED: ' + fails : 'OK: all break tests passed');
process.exit(fails ? 1 : 0);
