#!/usr/bin/env node
// STORY lane check (no browser). Loads the staged story data, validates it against docs/v2/DATA_FORMAT.md, cross-checks every
// reference against the world areas and the files on disk, checks the page rule, lists the Hangul the fonts do not have yet,
// and plays the whole first release against a fake api in the order of the minute table.
//
//   node tools/v2/story_check.mjs                 # everything; exit 0 = clean
//   node tools/v2/story_check.mjs --dir src/v2/data   # after the main session moved the folder
//   node tools/v2/story_check.mjs --sync-flags    # rewrite the set / read lists of flags.js, then check
// Writes /tmp/claude-0/v2/story/transcript.txt · transcript_bridge.txt · script_owner.md · font_new_chars.txt · report.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { MINUTES, ROUTE_A, ROUTE_B, NOISE } from './story_route.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DIR = path.resolve(ROOT, argOf('--dir', 'src/v2/data'));
const OUT = argOf('--out', '/tmp/claude-0/v2/story');
fs.mkdirSync(OUT, { recursive: true });

const errors = [], warnings = [], info = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m), note = (m) => info.push(m);

// ───────────────────────── 1. the folder itself ─────────────────────────
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
function stripComments(src) {
  let out = '', i = 0; const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      const q = c; out += c; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') { out += src[i++]; } out += src[i++]; }
      out += q; i++; continue;
    }
    out += c; i++;
  }
  return out;
}
const codeOf = {};
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const code = codeOf[f] = stripComments(src);
  for (const m of code.matchAll(/\bimport\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1] || m[2];
    if (!spec.startsWith('./')) err(`${f}: import "${spec}" leaves the folder (only ./ imports are allowed)`);
    else if (!fs.existsSync(path.join(DIR, spec))) err(`${f}: import "${spec}" does not exist`);
  }
  const bare = code.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
  for (const bad of ['window', 'document', 'localStorage', 'sessionStorage', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'fetch', 'XMLHttpRequest', 'process', 'require', 'Date', 'Math.random', 'performance', 'navigator', 'globalThis']) {
    const re = new RegExp('(^|[^.\\w$])' + bad.replace('.', '\\.') + '\\b');
    if (re.test(bare)) err(`${f}: uses ${bad} (the staged folder is data plus one pure runner)`);
  }
  if (f !== 'run.js' && f !== 'index.js' && /\bfunction\b|=>/.test(bare)) err(`${f}: data files contain literals only (found a function)`);
}

const mod = await import(pathToFileURL(path.join(DIR, 'index.js')).href);
const S = mod.STORY, createStory = mod.createStory;
if (!S || typeof createStory !== 'function') { console.error('index.js must export STORY and createStory'); process.exit(1); }
const { PEOPLE, DIALOGS, EVENTS, ITEMS, OBJECTIVES, CHRONICLE, FLAGS, TEXT } = S;

// ───────────────────────── 2. the world (read only) ─────────────────────────
const world = { areas: {}, ids: [] };
{
  const quiet = console.warn; console.warn = () => {};
  try {
    const w = await import(pathToFileURL(path.join(ROOT, 'src/v2/world/index.js')).href);
    world.ids = Object.keys(w.AREAS);
    for (const id of world.ids) { try { world.areas[id] = await w.AREAS[id](); } catch (e) { warn(`world area ${id} failed to load: ${e.message}`); } }
  } catch (e) { warn('src/v2/world/index.js could not be imported: ' + e.message); }
  console.warn = quiet;
}
const built = (id) => !!world.areas[id];
const hooks = { trigger: new Map(), interact: new Map(), exits: new Map(), groups: new Map(), talk: new Map(), actors: new Map(), when: new Map(), music: new Set() };
const add = (map, k, v) => { if (!map.has(k)) map.set(k, []); map.get(k).push(v); };
for (const [aid, a] of Object.entries(world.areas)) {
  for (const t of a.triggers || []) { add(hooks.trigger, t.event, { area: aid, id: t.id, data: t.data }); if (t.wake) add(hooks.groups, t.wake, aid); }
  for (const t of a.interact || []) add(hooks.interact, t.event, { area: aid, id: t.id, data: t.data, locked: t.locked });
  for (const t of a.exits || []) add(hooks.exits, t.id, { area: aid, to: t.to, locked: t.locked });
  for (const t of a.enemies || []) if (t.group) add(hooks.groups, t.group, aid);
  for (const t of a.actors || []) { add(hooks.talk, t.talk, { area: aid, id: t.id }); add(hooks.actors, aid + '/' + t.id, t); if (t.when) add(hooks.when, t.when, aid + '/' + t.id); }
  if (a.music) hooks.music.add(a.music);
}

// ───────────────────────── 3. format ─────────────────────────
const KINDS = new Set(['key', 'tool', 'keepsake', 'food', 'letter']);
const BANNERS = new Set(['area', 'section', 'night', 'clear', 'dead']);
const ACTIONS = new Set(['attack', 'jump', 'dash', 'guard', 'skill1', 'ult', 'lock', 'confirm']);
const ENGINE_EVENTS = new Set(['area.enter', 'section.enter', 'enemy.kill', 'area.clear', 'hero.dead', 'hero.respawn', 'trigger', 'exit', 'exit.locked', 'exit.missing',
  'interact', 'talk', 'group.clear', 'bell.echo', 'boss.phase']);
const STEP_ARITY = { say: [1, 1], banner: [2, 3], toast: [1, 2], prompt: [1, 1], give: [1, 2], take: [1, 2], setFlag: [1, 2], clearFlag: [1, 1], unlockExit: [1, 2], lockExit: [1, 3],
  wakeGroup: [1, 1], spawn: [2, 3], moveActor: [2, 3], hideActor: [1, 2], showActor: [1, 2], camera: [1, 2], wait: [1, 1], sound: [1, 2], music: [1, 1], fx: [1, 2], objective: [1, 1],
  chronicle: [1, 1], candle: [1, 1], moon: [1, 1], ring: [1, 1], save: [0, 0], gotoArea: [1, 2], bellCross: [0, 1], lockInput: [1, 1], if: [2, 3], run: [1, 1], end: [1, 1] };

const width = (line) => { let w = 0; for (const ch of line) { const c = ch.codePointAt(0); w += (c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60) ? 1 : 0.5; } return w; };
const MAX_LINES = 2, MAX_W = 30;
let pageCount = 0, widest = { w: 0, text: '' };
function checkPage(p, where) {
  const who = Array.isArray(p) ? p[0] : p && p.who, text = Array.isArray(p) ? p[1] : p && p.text, mood = Array.isArray(p) ? p[2] : p && p.mood;
  pageCount++;
  if (!PEOPLE[who]) err(`${where}: speaker "${who}" is not in PEOPLE`);
  if (typeof text !== 'string' || !text.trim()) { err(`${where}: empty page`); return; }
  const lines = text.split('\n');
  if (lines.length > MAX_LINES) err(`${where}: ${lines.length} lines on one page (max ${MAX_LINES}): ${JSON.stringify(text)}`);
  for (const l of lines) {
    const w = width(l);
    if (w > widest.w) widest = { w, text: l };
    if (w > MAX_W) err(`${where}: line is ${w} wide (max ${MAX_W}): ${l}`);
    if (l !== l.trim()) err(`${where}: line has leading or trailing space: ${JSON.stringify(l)}`);
  }
  if (mood && !(PEOPLE[who] && PEOPLE[who].moods && PEOPLE[who].moods[mood])) err(`${where}: mood "${mood}" is not defined for ${who}`);
  if (who === 'kael' && /^\(/.test(text) !== /\)$/.test(text)) err(`${where}: unbalanced inner-voice brackets: ${text}`);
}

// people
for (const [id, p] of Object.entries(PEOPLE)) {
  if (p.id !== id) err(`PEOPLE.${id}: id mismatch`);
  for (const k of ['name', 'title', 'voice']) if (typeof p[k] !== 'string') err(`PEOPLE.${id}: ${k} must be a string`);
  if (!Array.isArray(p.eras) || !p.eras.length || p.eras.some((e) => e !== 'now' && e !== 'past')) err(`PEOPLE.${id}: eras must list 'now' / 'past'`);
  if (p.model && !fs.existsSync(path.join(ROOT, 'assets/v2/char3d', p.model + '.glb'))) err(`PEOPLE.${id}: model assets/v2/char3d/${p.model}.glb is missing`);
  for (const f of [p.portrait, ...Object.values(p.moods || {})]) if (f && !fs.existsSync(path.join(ROOT, 'assets/v2/portraits', f + '.webp'))) err(`PEOPLE.${id}: portrait assets/v2/portraits/${f}.webp is missing`);
  if (id !== 'narrator' && id !== 'sign' && !p.voice) err(`PEOPLE.${id}: no voice note`);
}
const noBust = Object.values(PEOPLE).filter((p) => p.name && !p.portrait).map((p) => p.id);

// flags used
const flagSet = new Map(), flagRead = new Map(), itemGive = new Map(), itemTake = new Map(), itemRead = new Map();
const refs = { say: new Map(), run: new Map() };
const useCond = (list, who) => {
  for (const s of typeof list === 'string' ? [list] : list || []) {
    const body = s.replace(/^!/, '');
    const i = body.indexOf(':');
    if (i < 0) add(flagRead, body, who);
    else {
      const t = body.slice(0, i), k = body.slice(i + 1);
      if (t === 'has') { add(itemRead, k, who); if (!ITEMS[k]) err(`${who}: condition has:${k} — item unknown`); }
      else if (t === 'era') { if (k !== 'now' && k !== 'past') err(`${who}: era:${k}`); }
      else if (t === 'area') { if (!built(k) && !(TEXT.areas && TEXT.areas[k])) err(`${who}: area:${k} is neither built nor named in TEXT.areas`); }
      else if (t === 'done') { if (!EVENTS.some((e) => e.id === k)) err(`${who}: done:${k} — no such sequence`); }
      else if (t === 'seen') { if (!DIALOGS[k]) err(`${who}: seen:${k} — no such dialogue`); }
      else err(`${who}: unknown condition "${s}"`);
    }
  }
};
function checkSteps(steps, who, ctx) {
  if (!Array.isArray(steps)) { err(`${who}: steps must be a list`); return; }
  steps.forEach((s, i) => {
    const w = `${who} step ${i + 1}`;
    if (!Array.isArray(s) || typeof s[0] !== 'string') { err(`${w}: a step is [verb, …]`); return; }
    const [op, a, b, c] = s;
    const ar = STEP_ARITY[op];
    if (!ar) { err(`${w}: unknown step "${op}"`); return; }
    if (s.length - 1 < ar[0] || s.length - 1 > ar[1]) err(`${w}: ${op} takes ${ar[0]}–${ar[1]} arguments, got ${s.length - 1}`);
    switch (op) {
      case 'say': if (typeof a === 'string') { if (!DIALOGS[a]) err(`${w}: dialogue "${a}" does not exist`); add(refs.say, a, who); } else if (Array.isArray(a)) a.forEach((p, j) => checkPage(p, `${w} page ${j + 1}`)); else err(`${w}: say needs a key or pages`); break;
      case 'banner': if (!BANNERS.has(a)) err(`${w}: banner kind "${a}"`); if (typeof b !== 'string' || width(b) > 20) err(`${w}: banner title missing or too long`); if (c != null && width(c) > 26) err(`${w}: banner sub too long`); break;
      case 'toast': if (typeof a !== 'string' || width(a) > 30) err(`${w}: toast text missing or wider than 30`); if (b && !['item', 'info', 'warn'].includes(b)) err(`${w}: toast kind "${b}"`); break;
      case 'prompt': if (a != null && !(TEXT.prompts && TEXT.prompts[a])) err(`${w}: prompt "${a}" is not in TEXT.prompts`); if (a != null) ctx.prompts.add(a); break;
      case 'give': if (!ITEMS[a]) err(`${w}: item "${a}" unknown`); add(itemGive, a, who); break;
      case 'take': if (!ITEMS[a]) err(`${w}: item "${a}" unknown`); add(itemTake, a, who); break;
      case 'setFlag': add(flagSet, a, who); break;
      case 'clearFlag': add(flagSet, a, who + ' (clear)'); break;
      case 'unlockExit': case 'lockExit': {
        const area = op === 'unlockExit' ? b : c;
        if (!area) { if (!hooks.exits.has(a) && !ctx.waiting) err(`${w}: exit "${a}" is in no built area`); }
        else if (built(area)) { if (!(world.areas[area].exits || []).some((e) => e.id === a)) err(`${w}: area ${area} has no exit "${a}"`); }
        else if (!ctx.waiting) warn(`${w}: area ${area} is not built`);
        break;
      }
      case 'wakeGroup': if (!hooks.groups.has(a) && !ctx.waiting) err(`${w}: enemy group "${a}" is in no built area`); break;
      case 'hideActor': case 'showActor':
        if (b && built(b)) { if (!hooks.actors.has(b + '/' + a)) ctx.needActors.add(b + '/' + a); }
        else if (!b) err(`${w}: ${op} needs the area id (the sequence may run in another area)`);
        break;
      case 'camera': if (a != null && !(TEXT.shots && TEXT.shots[a])) err(`${w}: camera shot "${a}" is not in TEXT.shots`); break;
      case 'music': if (!(TEXT.music && TEXT.music[a]) && !hooks.music.has(a)) err(`${w}: music "${a}" is neither an area music id nor in TEXT.music`); break;
      case 'objective': if (a != null && !OBJECTIVES[a]) err(`${w}: objective "${a}" unknown`); if (a != null) ctx.objectives.add(a); break;
      case 'chronicle': if (!CHRONICLE[a]) err(`${w}: chronicle "${a}" unknown`); ctx.chron.add(a); break;
      case 'save': if (!(ctx.top && i === steps.length - 1)) err(`${w}: save must be the last step of a sequence`); break;
      case 'gotoArea': if (!built(a) && !ctx.waiting) err(`${w}: area "${a}" is not built (mark the sequence waiting)`); if (built(a) && b && !world.areas[a].spawns[b]) err(`${w}: area ${a} has no spawn "${b}"`); break;
      case 'if': useCond(a, who); checkSteps(b, who + ' if', { ...ctx, top: false }); if (c) checkSteps(c, who + ' else', { ...ctx, top: false }); break;
      case 'run': if (!EVENTS.some((e) => e.id === a)) err(`${w}: run "${a}" — no such sequence`); add(refs.run, a, who); break;
      default: break;
    }
  });
}
const ctx0 = () => ({ prompts: new Set(), objectives: new Set(), chron: new Set(), needActors: new Set(), waiting: false, top: true });
const used = ctx0();

// dialogues
let variantCount = 0;
for (const [key, vs] of Object.entries(DIALOGS)) {
  if (!Array.isArray(vs) || !vs.length) { err(`DIALOGS['${key}']: must be a non-empty list of variants`); continue; }
  vs.forEach((v, i) => {
    const who = `${key}#${i}`;
    variantCount++;
    useCond(v.if, key); useCond(v.ifAny, key);
    if (!Array.isArray(v.pages) || !v.pages.length) err(`${who}: no pages`);
    (v.pages || []).forEach((p, j) => checkPage(p, `${who} page ${j + 1}`));
    if (v.choice) {
      const o = v.choice.options;
      if (!Array.isArray(o) || o.length !== 2) err(`${who}: a choice has exactly two options`);
      (o || []).forEach((op, k) => {
        if (typeof op.label !== 'string' || !op.label || width(op.label) > 8) err(`${who}: choice label ${k + 1} missing or wider than 8`);
        (op.pages || []).forEach((p, j) => checkPage(p, `${who} option ${k + 1} page ${j + 1}`));
        if (op.then) checkSteps(op.then, key, { ...used, top: false });
      });
    }
    if (v.then) checkSteps(v.then, key, { ...used, top: false });
    const last = i === vs.length - 1;
    if (!last && !v.if && !v.ifAny && !v.once) err(`${who}: an unconditional variant hides the ones after it`);
  });
  const lastV = vs[vs.length - 1];
  if (lastV.if || lastV.ifAny || lastV.once) warn(`DIALOGS['${key}']: no default variant (the last one is conditional)`);
}

// events
const evById = new Map();
const minuteSet = new Set(MINUTES.map((m) => m.m));
const waitingList = [];
for (const ev of EVENTS) {
  const who = ev.id || '(no id)';
  if (!ev.id || !/^ev_[a-z0-9_]+$/.test(ev.id)) err(`event id "${ev.id}" must look like ev_name`);
  if (evById.has(ev.id)) err(`event id ${ev.id} is used twice`);
  evById.set(ev.id, ev);
  if (ev.on && !ENGINE_EVENTS.has(ev.on) && !ev.on.startsWith('play.')) err(`${who}: "${ev.on}" is not an engine event (ENGINE_API section 6 / DATA_FORMAT section 6)`);
  if (!ev.minute || !(minuteSet.has(ev.minute) || ev.minute === 'any' || /^\d+-\d+$/.test(ev.minute))) err(`${who}: minute "${ev.minute}"`);
  useCond(ev.if, who); useCond(ev.ifAny, who);
  const ctx = { ...used, waiting: !!ev.waiting, top: true };
  checkSteps(ev.steps, who, ctx);
  if (ev.waiting) waitingList.push(ev);
  // the hook the sequence listens to must exist in a built area (unless it waits for one)
  const m = ev.match || {};
  const need = (ok, what) => { if (ok) return; if (ev.waiting) return; err(`${who}: ${what}`); };
  if (ev.on === 'trigger') need(m.event ? hooks.trigger.has(m.event) : m.id && [...hooks.trigger.values()].flat().some((t) => t.id === m.id), `no built area has a trigger with event "${m.event || m.id}"`);
  if (ev.on === 'interact') {
    const list = hooks.interact.get(m.event) || [];
    need(list.length > 0, `no built area has an interact with event "${m.event}"`);
    for (const k of Object.keys(m)) if (k.startsWith('data.')) need(list.some((t) => t.data && t.data[k.slice(5)] === m[k]), `no interact "${m.event}" carries ${k} = ${m[k]}`);
    if (m.id) need(list.some((t) => t.id === m.id), `no interact "${m.event}" has id ${m.id}`);
  }
  if (ev.on === 'exit' || ev.on === 'exit.locked' || ev.on === 'exit.missing') {
    need(hooks.exits.has(m.id), `no built area has an exit "${m.id}"`);
    if (ev.on === 'exit.missing' && hooks.exits.has(m.id) && hooks.exits.get(m.id).every((e) => built(e.to))) warn(`${who}: exit ${m.id} leads to a built area now — the bridge is no longer needed`);
  }
  if (ev.on === 'group.clear') need(hooks.groups.has(m.group), `no built area has an enemy group "${m.group}"`);
  if (ev.on === 'area.enter' && m.area) need(built(m.area), `area "${m.area}" is not built`);
  if (ev.on === 'talk') need(hooks.talk.has(m.talk), `no actor carries talk key "${m.talk}"`);
  if (ev.waiting && !ev.waiting.startsWith('hook:') && built(ev.waiting)) warn(`${who}: waits for ${ev.waiting}, which is built now — check its hooks and remove "waiting"`);
}
for (const ev of EVENTS) if (!ev.on && !refs.run.has(ev.id)) err(`${ev.id}: has no "on" and nothing runs it (unreachable)`);

// items, objectives, chronicle, text
for (const [id, it] of Object.entries(ITEMS)) {
  if (it.id !== id) err(`ITEMS.${id}: id mismatch`);
  if (!KINDS.has(it.kind)) err(`ITEMS.${id}: kind "${it.kind}"`);
  if (!it.name || width(it.name) > 10) err(`ITEMS.${id}: name missing or wider than 10`);
  if (!it.desc || it.desc.includes('\n') || width(it.desc) > 40) err(`ITEMS.${id}: desc must be one line, at most 40 wide`);
  if (!itemGive.has(id)) err(`ITEMS.${id}: nothing gives it`);
}
for (const [id, list] of itemTake) if (!itemGive.has(id)) err(`item ${id} is taken by ${list[0]} but never given`);
for (const [id, list] of itemRead) if (!itemGive.has(id)) err(`item ${id} is tested by ${list[0]} but never given`);
for (const [id, o] of Object.entries(OBJECTIVES)) {
  if (o.id !== id) err(`OBJECTIVES.${id}: id mismatch`);
  if (!o.text || width(o.text) > 16) err(`OBJECTIVES.${id}: text missing or wider than 16 (${width(o.text || '')})`);
  if (!used.objectives.has(id)) err(`OBJECTIVES.${id}: no sequence sets it`);
}
for (const [id, c] of Object.entries(CHRONICLE)) {
  if (c.id !== id) err(`CHRONICLE.${id}: id mismatch`);
  if (c.kind !== 'line' && c.kind !== 'blank') err(`CHRONICLE.${id}: kind`);
  if (!c.title || width(c.title) > 14) err(`CHRONICLE.${id}: title missing or wider than 14`);
  if (!c.body) err(`CHRONICLE.${id}: body missing`);
  useCond(c.unlock, 'chronicle:' + id); useCond(c.show, 'chronicle:' + id);
  const open = (c.unlock || []).includes('never');
  if (c.kind === 'blank' && !open && !(c.past && c.now)) err(`CHRONICLE.${id}: a filled blank needs past and now`);
  if (!open && !used.chron.has(id)) err(`CHRONICLE.${id}: no sequence writes it`);
  for (const t of [c.body, c.past, c.now]) if (t && width(t) > 90) err(`CHRONICLE.${id}: text wider than 90`);
}
for (const [id, p] of Object.entries(TEXT.prompts || {})) {
  if (p.action != null && !ACTIONS.has(p.action)) err(`TEXT.prompts.${id}: action "${p.action}" is not a pad action`);
  if (!p.tip || width(p.tip) > 30) err(`TEXT.prompts.${id}: tip missing or wider than 30 (${width(p.tip || '')})`);
  if (p.action && (!p.label || width(p.label) > 6)) err(`TEXT.prompts.${id}: label missing or wider than 6`);
  if (!used.prompts.has(id)) err(`TEXT.prompts.${id}: no sequence shows it`);
}
{
  const chapterTitles = new Map(Object.values(TEXT.chapters || {}).map((c) => [c.title, c.sub]));
  const seenCh = new Set();
  const scan = (steps) => { for (const st of steps || []) { if (st[0] === 'banner' && (st[1] === 'area' || st[1] === 'clear')) { seenCh.add(st[2]); if (!chapterTitles.has(st[2])) err(`banner "${st[2]}" is not in TEXT.chapters`); else if (chapterTitles.get(st[2]) !== st[3]) err(`banner "${st[2]}": sub differs from TEXT.chapters`); } if (st[0] === 'if') { scan(st[2]); scan(st[3]); } } };
  for (const ev of EVENTS) scan(ev.steps);
  for (const t of chapterTitles.keys()) if (!seenCh.has(t)) err(`TEXT.chapters "${t}" is shown by no sequence`);
  for (const ev of EVENTS) for (const st of ev.steps || []) if (st[0] === 'banner' && st[1] === 'dead' && (st[2] !== TEXT.death.title || st[3] !== TEXT.death.sub)) err(`${ev.id}: dead banner differs from TEXT.death`);
}
const BUTTONS = ['공격', '점프', '구르기', '솜씨', '종', '다음 적'];
for (const [id, p] of Object.entries(TEXT.prompts || {})) for (const m of (p.tip || '').matchAll(/「([^」]+)」/g)) if (!BUTTONS.includes(m[1])) err(`TEXT.prompts.${id}: 「${m[1]}」 is not a button name (${BUTTONS.join(' ')})`);

// years and names written one way
const YEAR_OK = new Set(['1797', '1697']);
const allText = [];
const walk = (v, where) => { if (typeof v === 'string') allText.push([where, v]); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, where + '[' + i + ']')); else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], where + '.' + k); };
walk({ DIALOGS, EVENTS, ITEMS, OBJECTIVES, CHRONICLE, TEXT: { ...TEXT, shots: null, music: null }, PEOPLE }, 'STORY');
for (const [where, t] of allText) {
  for (const m of t.matchAll(/\d{4}/g)) if (!YEAR_OK.has(m[0])) err(`${where}: year ${m[0]} (only 1797 = 오늘 밤 and 1697 = 그 밤 are used)`);
  if (/1797[^·\n]{0,6}그 밤|1697[^·\n]{0,6}오늘 밤/.test(t)) err(`${where}: year and night do not match: ${t}`);
  for (const bad of ['에쉬빌', '애슈빌', '발크라인', '벨크레인', '알버토', '에드먼트', '에드문드', '엘리재', '롯테', '하드원', '비길리아', '납골탑', '밴쉬', '벤시']) if (t.includes(bad)) err(`${where}: "${bad}" — a name is written another way elsewhere`);
  if (/[월화수목금토일]요일|\d+월\s*\d+일/.test(t)) err(`${where}: a weekday or date — the canon fixes none for these nights: ${t}`);
  if (/ {2,}/.test(t) && !where.includes('shots')) err(`${where}: double space: ${JSON.stringify(t)}`);
}

// flags: declared, set, read
const flagUse = (name) => ({ set: [...new Set((flagSet.get(name) || []).map((s) => s.replace(' (clear)', '')))].sort(), read: [...new Set(flagRead.get(name) || [])].sort() });
for (const [flag, actors] of hooks.when) for (const a of actors) add(flagRead, flag, 'area:' + a);
for (const name of new Set([...flagSet.keys(), ...flagRead.keys()])) if (!FLAGS[name]) err(`flag "${name}" is used but not declared in FLAGS`);
if (argv.includes('--sync-flags')) {
  const lines = ['// Story flags: what each one means, who sets it, who reads it. Shape: docs/v2/DATA_FORMAT.md section 9.',
    '// `set` / `read` are recomputed by `node tools/v2/story_check.mjs --sync-flags` (ids of sequences, talk keys, area:<id>/<actor>, chronicle:<id>).',
    '// world: true = an area actor uses the flag in `when` (AREA_FORMAT section 4).', '', 'export const FLAGS = {'];
  const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  for (const [name, f] of Object.entries(FLAGS)) {
    const u = flagUse(name);
    const extra = (f.world ? ' world: true,' : '') + (f.reserved ? ' reserved: true,' : '');
    lines.push(`  ${name}: { means: ${q(f.means)},${extra}`, `    set: [${u.set.map(q).join(', ')}],`, `    read: [${u.read.map(q).join(', ')}] },`);
    f.set = u.set; f.read = u.read;
  }
  lines.push('};', '');
  fs.writeFileSync(path.join(DIR, 'flags.js'), lines.join('\n'));
  note('flags.js rewritten (--sync-flags)');
}
for (const [name, f] of Object.entries(FLAGS)) {
  const u = flagUse(name);
  if (!f.means) err(`FLAGS.${name}: no meaning`);
  if (f.reserved) { if (u.set.length) err(`FLAGS.${name}: reserved but set by ${u.set[0]}`); continue; }
  if (!u.set.length) err(`FLAGS.${name}: read but never set`);
  if (!u.read.length) err(`FLAGS.${name}: set but never read (by a condition, a chronicle entry or an area actor)`);
  if (JSON.stringify(f.set || []) !== JSON.stringify(u.set) || JSON.stringify(f.read || []) !== JSON.stringify(u.read)) err(`FLAGS.${name}: set / read lists are stale — run with --sync-flags`);
  const worldUse = hooks.when.has(name);
  if (worldUse && !f.world) err(`FLAGS.${name}: an area actor uses it in "when" — mark world: true`);
}
for (const [flag, actors] of hooks.when) if (!FLAGS[flag]) err(`area actor ${actors[0]} appears "when: ${flag}" — no such flag`);

// talk keys of area actors ↔ dialogues; no orphan dialogue
for (const [key, list] of hooks.talk) if (!DIALOGS[key]) err(`actor ${list[0].area}/${list[0].id} carries talk key "${key}" — no such dialogue`);
for (const key of Object.keys(DIALOGS)) if (!refs.say.has(key) && !hooks.talk.has(key)) err(`DIALOGS['${key}']: orphan (no say step and no area actor uses it)`);
// people ↔ eras of the areas they stand in
for (const [key, list] of hooks.talk) for (const t of list) {
  const actor = hooks.actors.get(t.area + '/' + t.id)[0];
  const era = world.areas[t.area].era;
  const speakers = new Set((DIALOGS[key] || []).flatMap((v) => (v.pages || []).map((p) => p[0])));
  const owner = Object.values(PEOPLE).find((p) => p.model === actor.model && speakers.has(p.id));
  if (!owner) warn(`actor ${t.area}/${t.id} (model ${actor.model}) never speaks in "${key}"`);
  else if (!owner.eras.includes(era)) err(`PEOPLE.${owner.id} stands in ${t.area} (${era}) but eras = ${owner.eras}`);
}
// hooks of the built world the story does not use
const usedTrig = new Set(EVENTS.filter((e) => e.on === 'trigger').map((e) => e.match && e.match.event));
const usedInter = new Set(EVENTS.filter((e) => e.on === 'interact').map((e) => e.match && e.match.event));
const unusedHooks = [...[...hooks.trigger.keys()].filter((k) => !usedTrig.has(k)).map((k) => 'trigger ' + k), ...[...hooks.interact.keys()].filter((k) => !usedInter.has(k)).map((k) => 'interact ' + k)];

// ───────────────────────── 4. fonts ─────────────────────────
const usedChars = new Set();
for (const f of files) for (const ch of codeOf[f]) if (ch.codePointAt(0) > 0x7e) usedChars.add(ch);
const syll = [...usedChars].filter((c) => c >= '가' && c <= '힣').sort();
const fontReport = { source: '', syllables: syll.length, missing: {}, other: [] };
let cmaps = null;
try {
  const py = `
import json, sys
from fontTools.ttLib import TTFont
out = {}
for f in sys.argv[1:]:
    try:
        out[f] = sorted(TTFont('assets/fonts/' + f).getBestCmap().keys())
    except Exception as e:
        out[f] = None
print(json.dumps(out))`;
  const fl = ['noto-sans-kr.woff2', 'hahmlet.woff2', 'bn-brush.woff2', 'noto-sans-kr-ext.woff2', 'hahmlet-ext.woff2'];
  const res = execFileSync('python3', ['-c', py, ...fl], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  cmaps = JSON.parse(res);
  fontReport.source = 'font files (fontTools cmap)';
} catch (e) { cmaps = null; }
const srcChars = new Set();
{
  const walkDir = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walkDir(p); else if (/\.(js|mjs|html|css|json)$/.test(e.name)) { const t = fs.readFileSync(p, 'utf8'); for (const ch of /\.m?js$/.test(e.name) ? stripComments(t) : t) if (ch.codePointAt(0) > 0x7e) srcChars.add(ch); } } };
  walkDir(path.join(ROOT, 'src'));
  if (fs.existsSync(path.join(ROOT, 'index.html'))) for (const ch of fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) if (ch.codePointAt(0) > 0x7e) srcChars.add(ch);
}
const inSrc = (c) => srcChars.has(c);
fontReport.notInSrc = syll.filter((c) => !inSrc(c));
if (cmaps && cmaps['noto-sans-kr.woff2']) {
  for (const [f, label] of [['noto-sans-kr.woff2', 'body (Noto Sans KR, first frame)'], ['hahmlet.woff2', 'title (Hahmlet, first frame)'], ['bn-brush.woff2', 'brush (BN Brush, lazy)']]) {
    const have = new Set(cmaps[f] || []);
    fontReport.missing[label] = syll.filter((c) => !have.has(c.codePointAt(0)));
  }
  const ext = new Set([...(cmaps['noto-sans-kr.woff2'] || []), ...(cmaps['noto-sans-kr-ext.woff2'] || [])]);
  fontReport.notEvenExt = syll.filter((c) => !ext.has(c.codePointAt(0)));
  const core = new Set(cmaps['noto-sans-kr.woff2']);
  fontReport.other = [...usedChars].filter((c) => !(c >= '가' && c <= '힣') && !core.has(c.codePointAt(0))).sort();
} else {
  fontReport.source = 'characters already under src/ (fontTools not available)';
  fontReport.missing['under src/'] = fontReport.notInSrc;
  fontReport.other = [...usedChars].filter((c) => !(c >= '가' && c <= '힣') && !inSrc(c)).sort();
}
if (fontReport.notEvenExt && fontReport.notEvenExt.length) err(`syllables outside the extended font (KS X 1001): ${fontReport.notEvenExt.join('')} — reword`);
fs.writeFileSync(path.join(OUT, 'font_new_chars.txt'), [
  `source: ${fontReport.source}`, `distinct Hangul syllables in the staged story: ${syll.length}`, syll.join(''), '',
  ...Object.entries(fontReport.missing).map(([k, v]) => `not in ${k}: ${v.length}\n${v.join('')}\n`),
  `not yet under src/ (what build_fonts.py --check will report after the move): ${fontReport.notInSrc.length}`, fontReport.notInSrc.join(''), '',
  `other non-ASCII characters not in the body font: ${fontReport.other.length}`, fontReport.other.join(' '), ''].join('\n'));

// ───────────────────────── 5. play it ─────────────────────────
const twinOf = (id) => (world.areas[id] && world.areas[id].twin) || (id.endsWith('_now') ? id.slice(0, -4) + '_past' : id.endsWith('_past') ? id.slice(0, -5) + '_now' : id);
function play(route, policy, label, deferred) {
  const rec = [];             // transcript records
  const runWarn = [];
  const ended = new Set(), began = new Set(), flagsSeen = new Set(), itemsSeen = new Set(), variantsSeen = new Set(), dialogsSeen = new Set();
  let minute = null, curEv = null, choiceN = 0, st = null, area = null, endId = null, saves = 0, prompt = null, lastSave = null;
  // a scene that starts by itself when an area opens belongs to its own row of the minute table, wherever the route stands
  const evMinute = (id) => { const e = id && evById.get(id); return e && e.on === 'area.enter' && minuteSet.has(e.minute) ? e.minute : null; };
  const out = (kind, a, b) => { if (!curEv && (kind === 'unlock' || kind === 'actor' || kind === 'lock')) return; rec.push({ m: evMinute(curEv) || minute, kind, a, b, ev: curEv }); };
  const mk = () => createStory(S, {
    warn: (m) => runWarn.push(m),
    log: (m) => { const [w, id] = m.split(' '); if (w === 'begin') { began.add(id); curEv = id; } else { ended.add(id); curEv = null; } },
  });
  const talked = new Set();
  const later = [];           // deferred mode: callbacks wait here and are delivered one at a time, like a real screen
  let openDialogs = 0, maxLater = 0, midSaveOk = 0;
  const defer = (fn) => { if (deferred) { later.push(fn); if (later.length > maxLater) maxLater = later.length; } else fn(); };
  const api = {
    showDialog(d) {
      if (!d || typeof d.text !== 'string') throw new Error('bad dialog');
      if (openDialogs) runWarn.push('a second dialogue was opened while one is open: ' + d.text);
      openDialogs++;
      out('say', d.speaker || (d.who === 'sign' ? '(글)' : '(해설)'), d.text);
      if (d.portrait && !fs.existsSync(path.join(ROOT, 'assets/v2/portraits', d.portrait + '.webp'))) runWarn.push('portrait missing: ' + d.portrait);
      const k = d.choices ? policy[choiceN++ % policy.length] : -1;
      if (d.choices) out('choice', d.choices.join(' / '), d.choices[k]);
      defer(() => { openDialogs--; if (d.choices) d.onChoice(k); else d.onDone(); });
    },
    banner: (kind, title, sub) => out('banner', kind, title + (sub ? ' — ' + sub : '')),
    toast: (text, o) => out('toast', (o && o.kind) || 'info', text),
    prompt: (p) => { prompt = p; if (p) out('prompt', p.label, p.action); },
    lock: () => {},
    gotoArea: (id, spawn) => { out('goto', id, spawn || 'default'); defer(() => { area = id; st.story('area.enter', { area: id }, api); }); },
    bellCross: (o) => { const to = twinOf(area); out('cross', to, o && o.years ? 'years' : ''); defer(() => { area = to; st.story('area.enter', { area: to }, api); }); },
    sound: (n) => out('sound', n), fx: () => {}, music: (id) => out('music', id),
    wakeGroup: (g) => out('wake', g), spawn: () => {}, moveActor: (id, to, o, done) => defer(done), hideActor: (id, a) => out('actor', 'hide', a + '/' + id), showActor: (id, a) => out('actor', 'show', a + '/' + id),
    camera: (shot, sec, done) => { if (shot) out('camera', shot, TEXT.shots[shot]); defer(done); }, wait: (s, done) => defer(done),
    unlockExit: (id, a) => out('unlock', a + '/' + id), lockExit: (id, k, a) => out('lock', a + '/' + id),
    objective: (text) => out('objective', text), chronicle: (e) => out('chronicle', e.title, e.kind === 'blank' ? e.past + ' → ' + e.now : e.body),
    candle: (n) => out('candle', n), moon: (n) => out('moon', n), ring: (n) => out('ring', n),
    onFlag: (n, v) => { if (v) flagsSeen.add(n); }, onItem: (id, c) => { if (c > 0) itemsSeen.add(id); },
    save: (o) => { saves++; lastSave = JSON.stringify(o); out('save'); }, end: (id) => { endId = id; out('end', id); },
  };
  st = mk();
  for (const step of route) {
    const [k, a, b] = step;
    try {
      if (k === 'm') minute = a;
      else if (k === 'note') out('note', a);
      else if (k === 'ev') {
        if (a === 'area.enter' && b && b.area) area = b.area;
        // stage directions for the owner script, from the labels the world gives its hot spots
        const ar = world.areas[area];
        if (a === 'interact' && b && ar) { const it = (ar.interact || []).find((x) => x.id === b.id); if (it && it.label) out('note', `「${it.label}」 자리에서`); }
        if (a === 'exit.locked' && b && ar) { const ex = (ar.exits || []).find((x) => x.id === b.id); if (ex && ex.label) out('note', `「${ex.label}」로 가는 문 앞`); }
        st.story(a, b, api);
      }
      else if (k === 'talk') {
        const first = (DIALOGS[a] || []).flatMap((v) => v.pages || []).map((pg) => pg[0]).find((w) => w !== 'kael' && w !== 'narrator' && w !== 'sign');
        if (first && PEOPLE[first]) { out('note', talked.has(a) ? `${PEOPLE[first].name}에게 다시 말을 건다` : `${PEOPLE[first].name}에게 말을 건다`); talked.add(a); }
        const before = rec.length; st.story('talk', { id: null, talk: a }, api); if (rec.length === before && DIALOGS[a]) runWarn.push(`talk ${a}: nothing was shown`); }
      else if (k === 'save') {
        const snap = JSON.stringify(st.save());
        const st2 = mk(); st2.load(JSON.parse(snap));
        if (JSON.stringify(st2.save()) !== snap) runWarn.push('save → load → save is not identical');
        st = st2;
      }
    } catch (e) { runWarn.push(`route step ${JSON.stringify(step)} threw: ${e.stack || e.message}`); }
    // deferred mode: the screen answers later. While a sequence waits, save() must give the state from before it began.
    if (deferred && later.length && st.busy) {
      const before = JSON.stringify(st.save()), was = st.running;
      const fn = later.shift(); try { fn(); } catch (e) { runWarn.push('deferred callback threw: ' + e.message); }
      if (st.busy && st.running === was) { if (JSON.stringify(st.save()) !== before) runWarn.push(`save() changed in the middle of ${st.running}`); else midSaveOk++; }
    }
    for (let guard = 0; later.length; guard++) {
      if (guard > 5000) { runWarn.push('deferred callbacks never end'); break; }
      const fn = later.shift(); try { fn(); } catch (e) { runWarn.push('deferred callback threw: ' + e.stack); }
    }
    if (st.busy) runWarn.push(`sequence ${st.running} is still waiting after route step ${JSON.stringify(step)}`);
  }
  // which dialogue variants were shown: replay marks from state.seen
  for (const k of Object.keys(st.state.seen)) { if (k.includes('#')) variantsSeen.add(k); else dialogsSeen.add(k); }
  return { rec, runWarn, ended, began, flagsSeen, itemsSeen, dialogsSeen, st, endId, saves, label, lastSave, maxLater, midSaveOk };
}

const A = play(ROUTE_A, [0], 'A');
const A2 = play(ROUTE_A, [0], 'A again');
const B = play(ROUTE_B, [1], 'B');
const AD = play(ROUTE_A, [0], 'A deferred', true);     // the same route with every dialogue, camera and area change answered later
const BD = play(ROUTE_B, [1], 'B deferred', true);
for (const r of [A, B, AD, BD]) {
  for (const w of r.runWarn) err(`play ${r.label}: ${w}`);
  const s = r.st.state;
  for (const f of ['fell', 'crossed', 'got_key', 'gate_open', 'carved_a', 'carved_b', 'bell_hung', 'ossuary_open', 'knells_hung', 'queen_sent', 'elise_found', 'keepers_promised', 'elise_home', 'bells_answered']) if (!s.flags[f]) err(`play ${r.label}: flag ${f} is not set at the end`);
  if (r.endId !== 'r1') err(`play ${r.label}: the end step was not reached`);
  if (s.objective !== 'r1_end') err(`play ${r.label}: last objective is ${s.objective}`);
  for (const id of ['bell_cracked', 'fourth_moon', 'graveyard_key', 'nameless_graves', 'road_bell', 'banshee', 'two_keepers']) if (!s.chronicle.includes(id)) err(`play ${r.label}: chronicle entry ${id} was not written`);
  for (const id of ['valkrein_knot', 'key_silver']) if (!(s.items[id] > 0)) err(`play ${r.label}: item ${id} is not in the bag at the end`);
  if (s.items.lotte_bread || s.items.road_bell || s.items.knell_bell || s.items.bell_shard) err(`play ${r.label}: a used-up item is still in the bag: ${JSON.stringify(s.items)}`);
  if (s.candles !== 5) err(`play ${r.label}: candles = ${s.candles} (3 + queen + bell = 5)`);
  if (s.area !== 'eshville_past' && s.area !== 'eshville_now') err(`play ${r.label}: ends in ${s.area}`);
}
const lineOf = (r) => `${r.m}|${r.kind}|${r.a}|${r.b}`;
if (A.rec.map(lineOf).join('\n') !== A2.rec.map(lineOf).join('\n')) err('play A is not deterministic (two runs differ)');
for (const [x, y] of [[A, AD], [B, BD]]) {
  const p = x.rec.map(lineOf), q = y.rec.map(lineOf);
  if (p.join('\n') !== q.join('\n')) { const i = p.findIndex((l, j) => l !== q[j]); err(`play ${y.label} differs from play ${x.label} at record ${i}: "${p[i]}" vs "${q[i]}"`); }
  if (y.maxLater > 1) err(`play ${y.label}: ${y.maxLater} callbacks were pending at once (a waiting step did not wait)`);
  if (!y.midSaveOk) err(`play ${y.label}: save() in the middle of a sequence was never exercised`);
}
// reach: every sequence, flag, item, dialogue is met in A or B
const endedAll = new Set([...A.ended, ...B.ended]);
// `safety: true` = a net for a broken or cut-off save; a normal play never reaches it (tools/v2/story_break.mjs plays it)
for (const ev of EVENTS) if (!ev.safety && !endedAll.has(ev.id) && ![...refs.run.keys()].includes(ev.id)) err(`${ev.id}: never finished in play A or B (unreachable sequence?)`);
for (const [id] of refs.run) { const done = A.st.isDone(id) || B.st.isDone(id) || evById.get(id).once === false; if (!done) err(`${id}: run target never finished`); }
for (const name of Object.keys(FLAGS)) if (!FLAGS[name].reserved && !A.flagsSeen.has(name) && !B.flagsSeen.has(name)) err(`FLAGS.${name}: never set in play A or B`);
for (const id of Object.keys(ITEMS)) if (!A.itemsSeen.has(id) && !B.itemsSeen.has(id)) err(`ITEMS.${id}: never given in play A or B`);
const dlgSeen = new Set([...A.dialogsSeen, ...B.dialogsSeen]);
for (const key of Object.keys(DIALOGS)) if (!dlgSeen.has(key)) err(`DIALOGS['${key}']: never played in play A or B`);
// chronicle list of the UI
const chron = A.st.chronicleList();
if (chron.filter((c) => c.kind === 'blank' && !c.filled).length !== 5) err(`chronicle: ${chron.filter((c) => c.kind === 'blank' && !c.filled).length} blanks stay open at the end (GDD 9.1 says five)`);

// unknown names, missing api, load of rubbish — nothing may throw
{
  const w = [];
  const st = createStory(S, { warn: (m) => w.push(m) });
  try {
    for (const [k, a, b] of NOISE) { if (k === 'ev') st.story(a, b, {}); else st.talk(a, {}); }
    st.story('area.enter', { area: 'eshville_now' }, {});            // an api with nothing: every step is skipped with a warning
    st.story('trigger', { id: 'x', event: 'church.arrive' }, null);
    if (st.busy) err('runner blocks when the api is empty');
    st.load({ flags: 7, done: 'x', items: null, era: 'tomorrow' }); st.load(null); st.load(JSON.parse(A.lastSave));
    st.reset();
    const bad = createStory({ EVENTS: [{ id: 'ev_x', on: 'trigger', steps: [['fly', 1], ['say', 'nope'], ['run', 'nope'], ['give', 'nope']] }] }, { warn: (m) => w.push(m) });
    bad.story('trigger', {}, {});
    createStory(null, null).story('x');
  } catch (e) { err('runner threw on unknown input: ' + (e.stack || e.message)); }
  if (!w.length) err('unknown names were not reported through opts.warn');
  // no work when nothing listens: a hot event name must not allocate
  const st3 = createStory(S, {}); const d = ['L', 3, 'hero']; const api = {};
  for (let i = 0; i < 20000; i++) st3.story('play.step', d, api);
  const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < 2000000; i++) st3.story('play.step', d, api);
  const grown = process.memoryUsage().heapUsed - h0;
  note(`2,000,000 unmatched events: heap ${grown >= 0 ? '+' : ''}${(grown / 1024).toFixed(0)} KB`);
  if (grown > 4 << 20) err(`unmatched events allocate (${(grown / 1048576).toFixed(1)} MB over 2,000,000 calls)`);
}

// ───────────────────────── 6. transcript and owner script ─────────────────────────
const HEAD = Object.fromEntries(MINUTES.map((m) => [m.m, m]));
const dash = (m) => m.replace('-', '–');
function transcript(r, title) {
  const L = [title, ''];
  let m = null;
  for (const x of r.rec) {
    if (x.m !== m) { m = x.m; const h = HEAD[m]; L.push('', `══ ${dash(m)}분 · ${h ? h.place : ''} ══`); }
    const t = (s) => String(s).replace(/\n/g, ' / ');
    switch (x.kind) {
      case 'note': L.push(`  (${x.a})`); break;
      case 'say': L.push(`  ${x.a}: ${t(x.b)}`); break;
      case 'choice': L.push(`  〔고르기〕 ${x.a}  →  ${x.b}`); break;
      case 'banner': L.push(`  〔띠 ${x.a}〕 ${x.b}`); break;
      case 'toast': L.push(`  〔알림〕 ${x.b}`); break;
      case 'prompt': L.push(`  〔단추 안내〕 ${x.a}`); break;
      case 'objective': L.push(`  〔목표〕 ${x.a || '(없음)'}`); break;
      case 'chronicle': L.push(`  〔연대기〕 ${x.a}: ${x.b}`); break;
      case 'goto': L.push(`  → ${x.a} (${x.b})`); break;
      case 'cross': L.push(`  ⇄ 종을 울려 건넌다 → ${x.a}${x.b ? ' (백 년이 흐르는 3초)' : ''}`); break;
      case 'camera': L.push(`  〔카메라〕 ${x.a}`); break;
      case 'music': L.push(`  〔음악〕 ${x.a}`); break;
      case 'sound': L.push(`  〔소리〕 ${x.a === 'bell.toll' ? '종이 울린다' : x.a === 'bell.crack' ? '종에 금이 간다' : x.a}`); break;
      case 'unlock': L.push(`  〔열림〕 ${x.a}`); break;
      case 'actor': L.push(`  〔인물〕 ${x.a} ${x.b}`); break;
      case 'wake': L.push(`  〔적〕 ${x.a}`); break;
      case 'candle': L.push(x.a > 0 ? `  〔촛불〕 한 자루 더` : `  〔촛불〕 모두 다시 켠다`); break;
      case 'moon': L.push(`  〔달〕 ${x.a}칸 기운다`); break;
      case 'ring': L.push(`  〔지도〕 종소리 동그라미 +${x.a}`); break;
      case 'save': L.push('  〔저장〕'); break;
      case 'end': L.push(`  〔끝〕 ${x.a}`); break;
      default: break;
    }
  }
  return L.join('\n') + '\n';
}
fs.writeFileSync(path.join(OUT, 'transcript.txt'), transcript(A, '블러드 녹턴 3D 판 — 첫 출시 대본 (길 A: 설계대로. 종탑·납골당은 지어진 것으로 보고 사건을 넣었다)'));
fs.writeFileSync(path.join(OUT, 'transcript_bridge.txt'), transcript(B, '블러드 녹턴 3D 판 — 첫 출시 대본 (길 B: 지금 지어진 곳만. 빈 곳은 글로 잇는다. 고르기는 둘째 갈래)'));

// what each camera shot shows, for the owner script only (the game shows it, it is not text on the screen)
const SHOT_KO = {
  moon_bell: '카메라가 불타는 지붕에서 붉은 달과 종탑으로 천천히 오른다',
  bell_crack: '박쥐 떼가 한 덩어리로 종을 들이받는다. 밝은 금이 종을 가로지른다',
  fall: '발밑이 꺼지고, 카엘과 엘리제가 금에서 새는 빛 속으로 떨어진다. 산 위로 은빛 별똥 하나',
  wake_past: '촛불빛의 종탑 아래. 로테가 쓰러진 카엘을 내려다본다',
  table: '주막의 식탁. 수프 세 그릇과 빈 의자 하나, 맞은편에 에드문트',
  knot: '채찍 끝에 종 조각을 묶는 손',
  years: '같은 자리에서 백 년이 3초에 흐른다',
  banshee_song: '종대 넷 뒤로 여왕이 떠오른다. 노래가 안개 속에 고리로 번진다',
  two_keepers: '종 줄을 사이에 두고 선 로테와 엘리제',
  ring_widen: '골짜기 지도로 물러난다. 종소리 동그라미가 한 겹 넓어지고 수녀원과 수문이 보인다',
};
function ownerScript() {
  const L = [];
  L.push('# 블러드 녹턴 3D 판 — 첫 출시 대본 (소유자용)', '',
    '이 글은 `node tools/v2/story_check.mjs` 가 실제 자료(`src/v2/data/`)를 처음부터 끝까지 돌려서 뽑은 것입니다. 손으로 따로 쓴 글이 아니므로 게임에 나오는 글과 한 글자도 다르지 않습니다.',
    '', '- **두 밤**: 1797년 = 오늘 밤, 1697년 = 그 밤.', '- **읽는 법**: 굵은 이름 = 말하는 사람, *기울인 글* = 해설·글씨, `〔 〕` = 화면에 뜨는 알림·목표·단추 안내, (괄호) = 장면 설명(게임에는 글로 나오지 않음).',
    '- 카엘의 괄호 대사는 혼잣말입니다.', '- 종탑 안과 배웅의 납골당은 아직 지어지지 않았습니다. 대본은 다 썼고, 지어지면 그대로 붙습니다.', '');
  L.push('## 고르는 곳 두 군데', '',
    '| 어디서 | 갈래 | 달라지는 것 |', '|---|---|---|',
    '| 26–33분, 그 밤의 대장간 — 열쇠를 무엇으로 벼릴까 | **은 열쇠** | 오늘 밤 손자 하드윈의 서랍에서 낡은 은 열쇠가 그대로 나온다 |',
    '| | **쇠 열쇠** | 서랍에서 녹슨 쇳덩이가 나온다(「쇠는 백 년을 못 버티오」). 그 밑에 하드윈 1세가 「혹시 몰라」 은으로 하나 더 벼려 둔 열쇠와 쪽지가 있다. 막히지 않고, 물건 「녹슨 쇳덩이」가 하나 더 남는다 |',
    '| 68–82분, 그 밤의 납골당 — 틈에 무엇을 밀어 둘까 | **석상** | 오늘 밤 석상이 백 년째 틈에 서 있어 딛고 건넌다 |',
    '| | **나무 상자** | 오늘 밤 틈에는 부스러기뿐이다. 카엘이 「돌이다」 하고 알아차리고, 그 밤으로 돌아가 다시 고르면 된다 |', '',
    '두 고르기 모두 「돌과 은은 남는다. 쇠는 녹슬고 나무는 삭는다」를 한 번씩 몸으로 겪게 하는 자리이고, 어느 쪽을 골라도 이야기는 막히지 않습니다.', '');
  let m = null;
  for (const x of A.rec) {
    if (x.m !== m) {
      m = x.m; const h = HEAD[m];
      L.push('', `## ${dash(m)}분 · ${h.place}`, '', `> 하는 일: ${h.does}  `, `> 새로 배우는 것: ${h.learn}`, '');
    }
    const t = (s) => String(s).replace(/\n/g, ' ');
    switch (x.kind) {
      case 'note': L.push('', `(${x.a})  `); break;
      case 'say': L.push(x.a.startsWith('(') ? `*${t(x.b)}*  ` : `**${x.a}** ${t(x.b)}  `); break;
      case 'choice': L.push(`〔고르기: ${x.a} — 이 대본은 「${x.b}」〕  `); break;
      case 'banner': L.push('', `〔큰 띠〕 **${x.b}**  `); break;
      case 'toast': L.push(`〔알림〕 ${x.b}  `); break;
      case 'objective': if (x.a) L.push(`〔목표〕 ${x.a}  `); break;
      case 'chronicle': L.push(`〔연대기〕 **${x.a}** — ${x.b}  `); break;
      case 'cross': L.push('', x.b ? '〔종을 울려 건넌다 — 백 년이 3초에 흐른다〕  ' : '〔종을 울려 건넌다〕  '); break;
      case 'goto': L.push('', `〔${(TEXT.areas[x.a] || {}).name || x.a} — ${x.a.endsWith('_past') ? TEXT.night.past : TEXT.night.now}〕  `); break;
      case 'candle': if (x.a > 0) L.push('〔촛불이 한 자루 늘었다〕  '); break;
      case 'moon': L.push('〔달이 한 칸 기운다〕  '); break;
      case 'camera': if (x.a && SHOT_KO[x.a]) L.push(`(장면: ${SHOT_KO[x.a]})  `); break;
      case 'sound': if (x.a === 'bell.toll') L.push('〔소리: 종이 울린다〕  '); else if (x.a === 'bell.crack') L.push('〔소리: 종에 금이 간다〕  '); break;
      case 'end': L.push('', '**— 첫 출시의 끝 —**', ''); break;
      default: break;
    }
  }
  L.push('', '## 덧붙임 1 — 사람과 말투', '', '| 사람 | 밤 | 말투 |', '|---|---|---|');
  for (const p of Object.values(PEOPLE)) if (p.name) L.push(`| ${p.name} (${p.title}) | ${p.eras.map((e) => (e === 'now' ? '오늘 밤' : '그 밤')).join(' · ')} | ${p.voice} |`);
  L.push('', '## 덧붙임 2 — 단추 안내 글 (터치 단추 이름: 공격 · 점프 · 구르기 · 솜씨 · 종 · 다음 적)', '', '| 배우는 것 | 화면에 뜨는 글 |', '|---|---|');
  for (const [id, p] of Object.entries(TEXT.prompts)) L.push(`| ${p.label || id} | ${p.tip} |`);
  L.push('', '## 덧붙임 3 — 물건', '', '| 이름 | 한 줄 |', '|---|---|');
  for (const it of Object.values(ITEMS)) L.push(`| ${it.name} | ${it.desc} |`);
  L.push('', '## 덧붙임 4 — 연대기 (첫 출시가 끝났을 때)', '', '| 제목 | 적힌 글 | 그 밤에 한 일 → 오늘 밤에 달라진 것 |', '|---|---|---|');
  for (const c of chron) L.push(`| ${c.title}${c.kind === 'blank' && !c.filled ? ' (빈칸으로 남음)' : ''} | ${c.body} | ${c.filled && c.past ? c.past + ' → ' + c.now : c.kind === 'blank' ? '—' : ''} |`);
  L.push('', '## 덧붙임 5 — 목표 글 (구역 이름 아래 한 줄)', '', Object.values(OBJECTIVES).map((o) => o.text).join(' · '), '');
  L.push('## 덧붙임 6 — 쓰러졌을 때', '', `큰 띠 「${TEXT.death.title}」 — ${TEXT.death.sub}. 다시 일어설 때 처음 두 번만 한마디가 나옵니다 — 신부를 만나기 전에는 카엘의 혼잣말, 그 뒤로는 종지기나 신부의 말입니다(위 대본의 해당 자리 참고). 그 뒤로는 말없이 일어섭니다.`, '');
  return L.join('\n');
}
fs.writeFileSync(path.join(OUT, 'script_owner.md'), ownerScript());

// ───────────────────────── 7. report ─────────────────────────
const sayCount = A.rec.filter((x) => x.kind === 'say').length;
const report = {
  dir: path.relative(ROOT, DIR), files, people: Object.keys(PEOPLE).length, dialogues: Object.keys(DIALOGS).length, variants: variantCount, pages: pageCount,
  events: EVENTS.length, waiting: waitingList.map((e) => `${e.id} → ${e.waiting}`), bridges: EVENTS.filter((e) => e.bridge).map((e) => e.id),
  items: Object.keys(ITEMS).length, objectives: Object.keys(OBJECTIVES).length, chronicle: Object.keys(CHRONICLE).length, flags: Object.keys(FLAGS).length,
  widestLine: widest, playA: { pagesShown: sayCount, records: A.rec.length, saves: A.saves }, playB: { pagesShown: B.rec.filter((x) => x.kind === 'say').length },
  needActors: [...used.needActors], unusedWorldHooks: unusedHooks, noBust, fonts: { source: fontReport.source, syllables: syll.length, notInSrc: fontReport.notInSrc.length, missing: Object.fromEntries(Object.entries(fontReport.missing).map(([k, v]) => [k, v.length])), other: fontReport.other },
  errors, warnings, info,
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

console.log(`story check — ${report.dir}`);
console.log(`  people ${report.people} · dialogue sets ${report.dialogues} (${report.variants} variants, ${report.pages} pages) · sequences ${report.events} (${report.waiting.length} waiting for areas, ${report.bridges.length} bridges)`);
console.log(`  items ${report.items} · objectives ${report.objectives} · chronicle ${report.chronicle} · flags ${report.flags}`);
console.log(`  page rule: ${MAX_LINES} lines × ${MAX_W}; widest line ${widest.w} — ${widest.text}`);
console.log(`  play A: ${sayCount} pages shown, ${A.ended.size} sequences finished · play B (bridges): ${report.playB.pagesShown} pages, ${B.ended.size} sequences`);
console.log(`  fonts [${fontReport.source}]: ${syll.length} distinct syllables; ${Object.entries(fontReport.missing).map(([k, v]) => `${v.length} not in ${k}`).join(' · ')}; ${fontReport.notInSrc.length} not yet under src/`);
if (fontReport.missing && Object.values(fontReport.missing)[0]) console.log(`    new for the body font: ${Object.values(fontReport.missing)[0].join('')}`);
if (fontReport.other.length) console.log(`    other characters not in the body font: ${fontReport.other.join(' ')}`);
if (used.needActors.size) console.log(`  actors the story shows / hides that the areas do not have yet: ${[...used.needActors].join(', ')}`);
if (unusedHooks.length) console.log(`  world hooks without a sequence (fine): ${unusedHooks.join(', ')}`);
if (noBust.length) console.log(`  speakers without a bust (name plate only): ${noBust.join(', ')}`);
for (const m of info) console.log('  info: ' + m);
for (const m of warnings) console.log('  WARN: ' + m);
for (const m of errors) console.log('  ERROR: ' + m);
console.log(`  wrote ${OUT}/transcript.txt · transcript_bridge.txt · script_owner.md · font_new_chars.txt · report.json`);
console.log(errors.length ? `FAILED: ${errors.length} error(s), ${warnings.length} warning(s)` : `OK: 0 errors, ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
