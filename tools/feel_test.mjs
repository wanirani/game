#!/usr/bin/env node
// Feel acceptance harness (FEEL-QA) — docs/specs/feel.md §10, MASTER_PLAN §5.1 "runtime feel".
//
//   node tools/feel_test.mjs                    all checks, 6 heroes (≈ 4–8 min; stepped, so load mostly stretches the timing checks)
//   node tools/feel_test.mjs --quick            kael + lia only for the per-hero checks, one boss hero
//   node tools/feel_test.mjs --only M,C5,A      run only these ids or groups (M1…M6 C1…C15 U1 U2 A1…A8 V1 X1…X3 I1 R183)
//   node tools/feel_test.mjs --heroes kael,bran --out /tmp/x
//
// Output: <out>/report.json (default /tmp/claude-0/qa_feel/report.json) and <out>/shots/*.png (V1 review set).
// Exit code 0 = no failing check and no page/console error; 1 = at least one failure; 2 = bad arguments.
//
// How it drives the game (deterministic, stepped):
//  · The rAF loop is paused (game._pageHidden) and the harness steps game.tick(1/60) itself, calling input.pollFrame and
//    game.syncPad every step, so every check is frame-exact and independent of machine load.
//  · performance.now is a virtual clock that advances 1/60 s per step while paused (awaken.js stepScale, pad timestamps …),
//    and the real clock is kept for the frame-cost checks (U2, A6: step + render wall time).
//  · Keyboard = input.sources.key[action]; gamepad = a mocked navigator.getGamepads (tools/qa/lib/fakepad.mjs);
//    touch = CDP touch events on the canvas pad (tools/qa/lib/touch.mjs) — the DOM .b.ult button of feel §10 A7 no longer exists.
//  · Passive dummies: new Enemy(id, …) with hp 1e7, a no-op AI and harmless = true, placed on the widest flat floor of s04 r1.
//  · Every page records pageerror and console.error (same filter as tools/integration.mjs); any error fails the run, and an
//    error raised while a check runs is also recorded as an 'error' case under that check's id.
//  · Desktop pages are 960×540 (feel §8 "headless relative checks … 960×540"); the mobile page is 844×390 at DPR 2 (A7).
//  · Timing checks (U2 ratios, A6 250 ms) are measured on this machine. U2 (feel §8: ultimate, first awakening and sprint-at-SSS
//    averages against the page's own gameplay / idle-walk baseline) is judged on wall time and on main-thread CPU time (CDP
//    ThreadTime per rendered frame): when both averages are over budget it is a 'fail' at any load. A U2 miss on wall time only
//    is 'inconclusive' when the measured frames took > 1.3× their main-thread CPU time (the renderer waited for a core). Any
//    other timing miss while the 1-minute load average is above 1.5 × CPU cores is 'inconclusive' (numbers kept), not 'fail'.
//  · Before the first awakening on each hero page and on the 1280 V1 page the harness waits (real time) for the hero's cut-in CG, as in play
//    ('pre-decoded', feel §8); the class is switched mid-stage here, so without the wait the art could lose the load race.
//  · V1 is a visual review: the harness writes the PNGs and marks V1 'review'; a person (or agent) opens them.
//  · window.__feelStats (feel §8 instrumentation) is checked as I1: it must exist with ?feelstats and carry the six keys.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, CHROME, IGNORE_CONSOLE } from './qa/lib/server.mjs';
import { Touch, padLayout } from './qa/lib/touch.mjs';
import { fakePadInit } from './qa/lib/fakepad.mjs';

// ───────────────────────── arguments ─────────────────────────
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { console.error(`unknown argument ${a}`); process.exit(2); }
  const k = a.slice(2), v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  args[k] = v;
}
const KNOWN_ARGS = new Set(['only', 'heroes', 'out', 'quick', 'headed']);
for (const k of Object.keys(args)) if (!KNOWN_ARGS.has(k)) { console.error(`unknown option --${k} (known: ${[...KNOWN_ARGS].join(', ')})`); process.exit(2); }
for (const k of ['only', 'heroes', 'out']) if (args[k] === true) { console.error(`--${k} needs a value`); process.exit(2); }
const OUT = path.resolve(String(args.out && args.out !== true ? args.out : '/tmp/claude-0/qa_feel'));
const SHOTS = path.join(OUT, 'shots');
const ALL_HEROES = ['kael', 'sera', 'victor', 'bran', 'lia', 'azel', 'isolde'];   // = src/data/characters.js CHAR_ORDER (7번째 영웅 이졸데 포함)
const HEROES = args.heroes && args.heroes !== true ? String(args.heroes).split(',').map((s) => s.trim()).filter(Boolean) : (args.quick ? ['kael', 'lia'] : ALL_HEROES);
for (const h of HEROES) if (!ALL_HEROES.includes(h)) { console.error(`unknown hero ${h}`); process.exit(2); }
const ALL_IDS = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', ...Array.from({ length: 15 }, (_, i) => 'C' + (i + 1)), 'U1', 'U2', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'V1', 'X1', 'X2', 'X3', 'I1', 'R183'];
const ONLY = args.only && args.only !== true ? String(args.only).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : null;
// an entry is an exact id (C2, R183) or a one-letter group (C = C1…C15); anything else (R18, C1X) would match no check and the
// run would open browsers, test nothing and exit 0 — so validation uses the same rule as WANT
const onlyMatches = (o, id) => o === id || (o.length === 1 && id.startsWith(o));
if (ONLY) for (const o of ONLY) if (!ALL_IDS.some((id) => onlyMatches(o, id))) { console.error(`--only: unknown id/group ${o} (ids: ${ALL_IDS.join(' ')}; groups: M C U A V X I R)`); process.exit(2); }
const WANT = (id) => !ONLY || ONLY.some((o) => onlyMatches(o, id));
const want = WANT;
const wantAny = (...ids) => ids.some(want);

// ───────────────────────── spec tables (feel §1 baseline, §3, §4, §8) ─────────────────────────
const BASE = {
  run: { kael: 275, sera: 255, victor: 285, bran: 245, lia: 305, azel: 290, isolde: 280 },
  apex: { kael: 135, sera: 128, victor: 132, bran: 125, lia: 138, azel: 139, isolde: 169 },
  dash: { kael: 142, sera: 151, victor: 135, bran: 121, lia: 159, azel: 178, isolde: 149 },
  ult: { kael: 1.97, sera: 2.17, victor: 1.90, bran: 2.42, lia: 2.08, azel: 2.13, isolde: 2.45 },
};
const CLASS_PICK = {   // tier 0 · one tier 1 · one tier 2 (the tier-2 child of that tier-1)
  kael: ['kael_hunter', 'kael_crusader', 'kael_templar'],
  sera: ['sera_exorcist', 'sera_priestess', 'sera_saint'],
  victor: ['victor_gunslinger', 'victor_desperado', 'victor_gunlord'],
  bran: ['bran_knight', 'bran_berserker', 'bran_warlord'],
  lia: ['lia_assassin', 'lia_dancer', 'lia_reaper'],
  azel: ['azel_dhampir', 'azel_vampire', 'azel_nosferatu'],
  isolde: ['isolde_lancer', 'isolde_dragoon', 'isolde_stormlord'],
};
const MATERIAL_ENEMY = { flesh: 'zombie', bone: 'skeleton', metal: 'armor_knight', ghost: 'ghost', stone: 'mud_man', slime: 'slime', paper: 'mummy', ice: 'frozen_knight', fire: 'hellhound' };
const MATERIAL_PRESET = { flesh: ['blood'], bone: ['shard'], metal: ['spark'], ghost: ['ecto'], stone: ['gravel'], slime: ['goo'], paper: ['paper'], ice: ['ice'], fire: ['ember'] };

/** fix bucket per check (MASTER_PLAN §5.3) — where a failure is most likely fixed */
const BUCKET = {
  M: 'FIX-ENGINE (src/game/feel_move.js, src/game/player.js, src/data/feel_move.js)',
  C: 'FIX-ENGINE (src/game/impact.js, src/game/enemy.js, src/game/style.js, src/game/world.js, src/core/particles.js)',
  C11: 'FIX-RENDER (src/render/hitfx.js materialBurst) / FIX-ENGINE (src/core/particles.js)',
  C15: 'FIX-PLATFORM (src/core/game.js flash)',
  U: 'FIX-SYSTEMS (src/game/skills.js ULTS) / FIX-RENDER (src/render/ultfx.js)',
  A: 'FIX-ENGINE (src/game/awaken.js, src/game/awaken_directors*.js)',
  A3: 'FIX-SCENES-A (src/scenes/awaken_cutin.js)',
  A7: 'FIX-PLATFORM (src/core/touchpad.js) / FIX-HUD (src/render/hud_layout.js)',
  A8: 'FIX-PLATFORM (src/core/input.js)',
  X: 'FIX-COMPANIONS (src/game/companions.js, src/game/mount.js, src/game/guardian*.js)',
  U2: 'FIX-RENDER (ultimate cast after a combo, mid-room: live combo/style HUD src/render/feel_hud.js + tile chunk layer src/render/tiles.js + src/render/ultfx.js; requests.jsonl lines 330, 357)',
  A6: 'FIX-RENDER (first-awakening frame cost: src/scenes/awaken_cutin.js bake, src/render/ultfx.js)',
  I1: 'FIX-PLATFORM (src/core/game.js publishes window.__feelStats per frame; counters in particles.js, hitfx.js, hero.js, audio.js — feel §8)',
  R183: 'FIX-PLATFORM (src/core/game.js syncPad)',
  V: 'FIX-SCENES-A (src/scenes/awaken_cutin.js) / FIX-ASSETS (assets/cg/cutin_*.webp)',
};

// ───────────────────────── report ─────────────────────────
fs.mkdirSync(SHOTS, { recursive: true });
const CORES = os.cpus().length || 1;
const report = {
  harness: 'tools/feel_test.mjs', spec: 'docs/specs/feel.md §10', started: new Date().toISOString(), finished: null,
  args, heroes: HEROES, machine: { cores: CORES, load: os.loadavg().map((x) => +x.toFixed(1)) },
  cases: [], pages: [], errors: [], shots: [], summary: null, defects: [],
};
const t0 = Date.now();
const elapsed = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
function rec(id, ctx, status, detail, data = null) {
  const c = { id, ...ctx, status, detail, data };
  report.cases.push(c);
  const mark = status === 'pass' ? 'ok ' : status === 'fail' ? 'FAIL' : status === 'inconclusive' ? 'INC ' : status === 'review' ? 'REV ' : status === 'skip' ? 'skip' : status;
  console.log(`[${elapsed()}] ${mark} ${id}${ctx.hero ? ' ' + ctx.hero : ''}${ctx.variant ? ' ' + ctx.variant : ''} — ${detail}`);
  return c;
}
/** timing checks: a failure under heavy machine load is reported as inconclusive (numbers kept) */
function timingStatus(ok) {
  if (ok) return 'pass';
  const load = os.loadavg()[0];
  return load > CORES * 1.5 ? 'inconclusive' : 'fail';
}
const round = (v, d = 1) => (Number.isFinite(v) ? +v.toFixed(d) : v);
function stats(a) {
  if (!a?.length) return { n: 0 };
  const s = [...a].sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return { n: a.length, avg: round(a.reduce((x, y) => x + y, 0) / a.length), med: round(q(0.5)), p95: round(q(0.95)), max: round(s[s.length - 1]) };
}
function saveReport() {
  const by = {};
  for (const c of report.cases) {
    const b = (by[c.id] ??= { pass: 0, fail: 0, inconclusive: 0, review: 0, skip: 0, error: 0 });
    b[c.status] = (b[c.status] ?? 0) + 1;
  }
  const status = (b) => (b.fail || b.error ? 'fail' : b.inconclusive ? 'inconclusive' : b.review && !b.pass ? 'review' : b.pass ? 'pass' : 'skip');
  report.summary = {
    ids: Object.fromEntries(Object.entries(by).map(([k, b]) => [k, { status: status(b), ...b }])),
    pass: report.cases.filter((c) => c.status === 'pass').length,
    fail: report.cases.filter((c) => c.status === 'fail' || c.status === 'error').length,
    inconclusive: report.cases.filter((c) => c.status === 'inconclusive').length,
    review: report.cases.filter((c) => c.status === 'review').length,
    pageErrors: report.errors.length,
  };
  // W4 triage: every failing case with the fix bucket of the file it most likely lives in (MASTER_PLAN §5.3);
  // timing checks that missed their budget on an overloaded machine are listed too, as unconfirmed S3
  report.defects = report.cases.filter((c) => c.status === 'fail' || c.status === 'error' || c.status === 'inconclusive').map((c) => ({
    id: c.id, hero: c.hero ?? null, variant: c.variant ?? null, sev: c.status === 'error' ? 'S2' : (/^(U2|A6)$/.test(c.id) ? 'S3' : 'S2'),
    confirmed: c.status !== 'inconclusive', detail: c.detail, bucket: BUCKET[c.id] ?? BUCKET[c.id[0]] ?? 'FIX-TOOLS',
  }));
  report.finished = new Date().toISOString();
  report.machine.loadEnd = os.loadavg().map((x) => +x.toFixed(1));
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
}

// ───────────────────────── page-side library (runs inside the page) ─────────────────────────
async function pageLib() {
  if (window.__fq) return 'ok';
  const g = window.__game;
  const I = (p) => import(p);
  const [IN, EN, PH, AU, CL, FH, AWm, CMB, FMD, HL, TP, AWD, EV, AS] = await Promise.all([
    I('/src/core/input.js'), I('/src/game/enemy.js'), I('/src/core/physics.js'), I('/src/core/audio.js'),
    I('/src/data/classes.js'), I('/src/data/feel_hit.js'), I('/src/game/awaken.js'), I('/src/game/combat.js'),
    I('/src/data/feel_move.js'), I('/src/render/hud_layout.js'), I('/src/core/touchpad.js'), I('/src/data/awaken.js'),
    I('/src/core/events.js'), I('/src/core/assets.js')]);
  const input = IN.input, T = PH.T, TILE = 48;
  const solid = (t) => PH.isSolidType(t);
  const realNow = performance.now.bind(performance);
  let vt = realNow();
  const Q = { g, input, EN, PH, AU, CLASSES: CL.CLASSES, FH, AW: AWm, CMB, FMD, HL, TP, AWD, EV, assets: AS.assets, realNow, steps: 0, errs: [] };
  window.__fq = Q;
  Q.log = { hits: [], callouts: [], texts: [], sfx: [], scenes: [], ev: [], emits: null };
  const cap = (L, n) => { if (L.length > n) L.splice(0, L.length - (n >> 1)); };
  // ── global hooks (instance properties; nothing in src/ is edited) ──
  const sfx0 = AU.audio.sfx.bind(AU.audio);
  AU.audio.sfx = function (name, o) { Q.log.sfx.push([Q.steps, name]); cap(Q.log.sfx, 6000); return sfx0(name, o); };
  const push0 = g.push.bind(g), pop0 = g.pop.bind(g);
  g.push = function (name, params) { Q.log.scenes.push([Q.steps, 'push', name]); return push0(name, params); };
  g.pop = function (...a) { Q.log.scenes.push([Q.steps, 'pop', g.top?.name]); return pop0(...a); };
  for (const ev of ['ultimateCast', 'awakenCast', 'styleRankUp', 'mounted', 'dismounted', 'guardianSkill']) {
    EV.bus.on(ev, (d) => { Q.log.ev.push([Q.steps, ev, { charId: d?.charId, tier: d?.tier, classId: d?.classId, rank: d?.rank, id: d?.id, reason: d?.reason }]); cap(Q.log.ev, 2000); });
  }
  Q.hook = (w) => {
    Q._hw = w;
    if (!w || w.__fqHooked) return;
    w.__fqHooked = true;
    const oh = w.onPlayerHit;
    if (typeof oh === 'function') {
      w.onPlayerHit = function (target, info, attack) {
        Q.log.hits.push({ s: Q.steps, cls: info?.cls, hs: info?.hitstop, dmg: info?.dmg, crit: !!info?.crit, counter: !!info?.counter, back: !!info?.back, air: !!info?.air, otg: !!info?.otg, cont: !!info?.cont, killed: !!info?.killed, moveId: info?.moveId ?? null, fxType: info?.fxType ?? null, tags: attack?.tags ? [...attack.tags] : [], tid: target?.__id ?? target?.kind ?? null, final: !!attack?.final, whs: w.hitstop });
        cap(Q.log.hits, 4000);
        return oh.call(this, target, info, attack);
      };
    }
    const fx = w.fx;
    if (fx) {
      const co = fx.callout?.bind(fx);
      if (co) fx.callout = (x, y, text, o) => { Q.log.callouts.push([Q.steps, String(text)]); cap(Q.log.callouts, 2000); return co(x, y, text, o); };
      const tx = fx.text?.bind(fx);
      if (tx) fx.text = (x, y, str, o) => { Q.log.texts.push([Q.steps, String(str)]); cap(Q.log.texts, 2000); return tx(x, y, str, o); };
      const em = fx.emit.bind(fx);
      fx.emit = (type, x, y, o) => { const E = Q.log.emits; if (E) E[type] = (E[type] ?? 0) + 1; return em(type, x, y, o); };
    }
  };
  Q.hook(g.world);
  if (g.world?.player) g.world.player.buffs.invincible = 99999;
  // ── stepping ──
  Q.pause = () => { g._pageHidden = true; vt = Math.max(vt, realNow()); performance.now = () => vt; g.fps = 60; };
  Q.resume = () => { performance.now = realNow; g._pageHidden = false; g.last = realNow(); };
  Q.step = (n = 1, fn = null) => {
    for (let i = 0; i < n; i++) {
      vt += 1000 / 60; Q.steps++;
      try { input.pollFrame?.(); g.tick(1 / 60); g.syncPad?.(); } catch (e) { Q.errs.push(String(e?.stack || e).slice(0, 400)); console.error('[feel_test] tick', e); }
      if (g.world !== Q._hw) Q.hook(g.world);
      if (fn && fn(i) === false) return i + 1;
    }
    return n;
  };
  Q.until = (fn, max = 600) => { for (let i = 0; i <= max; i++) { if (fn()) return i; if (i < max) Q.step(1); } return -1; };
  Q.render = () => { const t = realNow(); try { input.beginRender?.(); g.render(); input.endRender?.(); } catch (e) { console.error('[feel_test] render', e); } return realNow() - t; };
  Q.slow = [];   // frames over 100 ms: [steps, tick ms, render ms, top scene, particles]
  Q.fn = 0;      // rendered frames so far (the Node side divides main-thread CPU time by this count)
  Q.frame = () => {
    Q.fn++;
    const t = realNow(); Q.step(1); const t1 = realNow(); Q.render(); const t2 = realNow();
    if (t2 - t > 100) { Q.slow.push([Q.steps, +(t1 - t).toFixed(1), +(t2 - t1).toFixed(1), g.top?.name, g.world?.fx?.list?.length ?? 0]); if (Q.slow.length > 200) Q.slow.shift(); }
    return t2 - t;
  };
  // ── input ──
  Q.key = (a, v = true) => { input.sources.key[a] = !!v; };
  Q.release = () => { const k = input.sources.key; for (const a in k) k[a] = false; };
  Q.press = (a, n = 2) => { Q.key(a); Q.step(n); Q.key(a, false); };
  // ── world ──
  Q.w = () => g.world; Q.p = () => g.world?.player; Q.top = () => g.top?.name;
  Q.floor = () => {
    const m = g.world.map, S = (tx, ty) => solid(m.typeAt(tx, ty));
    const clear = (tx, ty) => !S(tx, ty) && m.typeAt(tx, ty) !== T.SPIKE && m.typeAt(tx, ty) !== T.LIQUID;
    let best = null;
    for (let ty = 2; ty < m.h; ty++) {
      let run = 0;
      for (let tx = 0; tx <= m.w; tx++) {
        const ok = tx < m.w && S(tx, ty) && clear(tx, ty - 1) && clear(tx, ty - 2) && clear(tx, ty - 3) && clear(tx, ty - 4);
        if (ok) run++;
        else { if (run > (best?.n ?? 0)) best = { n: run, t0: tx - run, t1: tx, ty }; run = 0; }
      }
    }
    if (!best) return null;
    best.x0 = best.t0 * TILE; best.x1 = best.t1 * TILE; best.y = best.ty * TILE;
    const head = (tx) => { let n = 0; for (let ty = best.ty - 1; ty >= 0 && clear(tx, ty); ty--) n++; return n; };
    best.head = []; for (let tx = best.t0; tx < best.t1; tx++) best.head.push(head(tx));
    return best;
  };
  Q.setup = ({ transitioning = false } = {}) => {
    const w = g.world, p = w.player;
    for (const e of w.entities) if (e !== p && (e.kind === 'enemy' || e.kind === 'trigger')) e.dead = true;
    p.buffs.invincible = 99999;
    w.transitioning = transitioning;
    Q.fl = Q.floor();
    Q.home = { x: Math.round((Q.fl.x0 + Q.fl.x1) / 2 - p.w / 2) };
    Q.reset();
    return { floor: { x0: Q.fl.x0, x1: Q.fl.x1, y: Q.fl.y, tiles: Q.fl.n }, heroSame: p.hero === w.hero, view: [g.viewW, g.viewH], quality: g.tier, fxq: w.fx?.quality };
  };
  Q.reset = (x = null, settle = 14) => {
    const w = g.world, p = w.player;
    Q.release();
    for (let i = 0; i < 3 && g.top?.name === 'pause'; i++) g.pop();   // pad disconnect / focus loss auto-pause
    for (const e of w.entities) if (e.kind === 'enemy' && !e.__dummy && !e.dead) e.dead = true;
    p.endMove?.(); p.dashT = 0; p.dashCool = 0; p.hurtT = 0; p.charging = 0; p.holdT = 0; p.iframes = 0;
    p.sprinting = false; p.moveFx = null; p.apexY = undefined; p.faceHoldT = 0;
    if (p.fm) { p.fm.tapAt = -99; p.fm.tapDir = 0; p.fm.sprintT = 0; p.fm.runHeldT = 0; p.fm.momT = 0; p.fm.airMom = false; }
    p.x = x ?? Q.home.x; p.y = Q.fl.y - p.h - 1; p.vx = 0; p.vy = 0; p.facing = 1;
    w.hitstop = 0; w.slowmo = 0;
    if (Array.isArray(input.history)) input.history.length = 0;
    Q.step(settle);
  };
  let dn = 0, hn = 0;
  Q.dummy = (id = 'skeleton', dx = 80, o = {}) => {
    const w = g.world, p = w.player;
    const fx = o.x ?? (p.cx + dx), fy = o.fy ?? Q.fl.y;
    const e = new EN.Enemy(id, fx, fy, { level: o.level ?? 5, diff: w.diff, facing: o.facing ?? (fx > p.cx ? -1 : 1), elite: false });
    const hp = o.hp ?? 1e7;
    e.hp = hp; if (e.stats) { e.stats.hp = hp; e.stats.maxHp = hp; }
    e.harmless = o.harmless ?? true; e.ai = { update() {} }; e.awake = true; e.__dummy = true; e.__id = 'd' + (++dn);
    if (o.roomFoe) w.roomFoes = (w.roomFoes ?? 0) + 1;
    w.add(e);
    return e;
  };
  Q.clearDummies = () => { for (const e of g.world.entities) if (e.__dummy) e.dead = true; Q.step(1); };
  Q.hit = (e, o = {}) => {
    const w = g.world, p = w.player;
    const hb = e.hurtbox ? e.hurtbox() : { x: e.x, y: e.y, w: e.w, h: e.h };
    const dir = o.dir ?? (e.cx >= p.cx ? 1 : -1);
    const atk = { owner: p, stats: p.stats, team: 'player', mv: 1, type: 'atk', kb: [150, -80], hitstop: 0.05, shake: 0, dir, hitId: 'fq' + (++hn), tags: ['melee'], ...o };
    return CMB.playerStrike(w, { x: hb.x - 2, y: hb.y - 2, w: hb.w + 4, h: hb.h + 4 }, atk);
  };
  Q.setClass = (cid) => { const p = Q.p(); p.hero.classId = cid; p.refreshStats(); p.hp = p.stats.hp; p.mp = p.stats.mp; return CL.CLASSES[cid]?.tier ?? null; };
  Q.ultSetup = (cid) => {
    Q.reset();
    const tier = Q.setClass(cid);
    const ds = [-230, -150, -70, 80, 160, 240].map((dx, i) => Q.dummy(i % 2 ? 'zombie' : 'skeleton', dx, {}));
    Q.step(4);
    Q._ult = { tier, ds, hp0: ds.map((e) => e.hp) };
    Q._ultDs = ds;
  };
  Q.fxCount = (shape) => g.world.fx.list.reduce((n, q) => n + (q.shape === shape ? 1 : 0), 0);
  Q.sceneOf = (name) => g.scenes.find((s) => s.name === name) ?? null;
  Q.rect = (r) => r ? (r.w != null ? { x: r.x ?? r.l, y: r.y ?? r.t ?? r.top, w: r.w, h: r.h } : { x: r.l ?? r.x0, y: r.t ?? r.y0, w: (r.r ?? r.x1) - (r.l ?? r.x0), h: (r.b ?? r.y1) - (r.t ?? r.y0) }) : null;
  Q.overlap = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  return 'ok';
}

// ───────────────────────── movement (feel §3; M1–M6) ─────────────────────────
async function pM1({ hero }) {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  w.transitioning = true;
  const B = p.ch.move.speed * p.speedMul;
  Q.reset(Q.fl.x0 + 30);
  let maxV = 0;
  Q.key('right'); Q.step(70, () => { maxV = Math.max(maxV, Math.abs(p.vx)); }); Q.key('right', false);
  const sprintSeen = p.sprinting;
  Q.reset();
  const y0 = p.bottom; let minB = y0;
  Q.key('jump'); Q.step(90, (i) => { if (i === 60) Q.key('jump', false); minB = Math.min(minB, p.bottom); }); Q.key('jump', false);
  const apex = y0 - minB;
  Q.reset(Q.home.x - 120);
  const x0 = p.x;
  Q.key('dash'); Q.step(2); Q.key('dash', false); Q.step(38);
  const dash = p.x - x0;
  w.transitioning = false;
  return { B, maxV, sprintSeen, apex, dash, speedMul: p.speedMul };
}

async function pM2({ raw }) {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  w.transitioning = true;
  Q.reset(Q.fl.x0 + 30);
  const B = p.ch.move.speed * p.speedMul;
  if (!window.__padConnect) return { error: 'no fake pad' };
  window.__padConnect(); Q.step(2);
  window.__padAxes(raw, 0);
  const v = [], gaits = new Set(), anims = new Set();
  Q.step(70, (i) => { if (i >= 40) { v.push(Math.abs(p.vx)); gaits.add(p.gait); anims.add(p.anim); } });
  const analogX = Q.input.analogX, mode = Q.input.mode;
  window.__padAxes(0, 0); Q.step(4);
  // the pad stays connected (a disconnect auto-pauses the game, platform §4.5); keyboard sources keep working in pad mode
  w.transitioning = false;
  const avg = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  return { B, avg, min: Math.min(...v), max: Math.max(...v), gaits: [...gaits], anims: [...anims], analogX, mode };
}

async function pM3({ hero }) {
  const Q = window.__fq, w = Q.w(), p = Q.p(), P = Q.FMD.PERSONALITY;
  w.transitioning = true;
  const B = p.ch.move.speed * p.speedMul, k = (P[hero] ?? P._default).sprintK, kB = k * B;
  const out = { B, k, kB };
  // (a) double tap: press 4 steps, release 5 steps (0.083 s), press again
  Q.reset(Q.fl.x0 + 30);
  Q.key('right'); Q.step(4); Q.key('right', false); Q.step(5); Q.key('right');
  let reach = -1, maxV = 0;
  Q.step(40, (i) => { if (reach < 0 && p.sprinting && Math.abs(Math.abs(p.vx) - kB) <= 3) reach = i + 1; maxV = Math.max(maxV, Math.abs(p.vx)); });
  out.tap = { reachSteps: reach, reachT: reach > 0 ? +(reach / 60).toFixed(3) : null, sprinting: p.sprinting, maxV };
  Q.key('right', false);
  // (b) dash chain: hold the direction through a ground dash
  Q.reset(Q.fl.x0 + 30);
  Q.key('right'); Q.step(10); Q.key('dash'); Q.step(2); Q.key('dash', false);
  Q.until(() => p.dashT <= 0, 40);
  reach = -1; maxV = 0;
  const exitV = Math.abs(p.vx);   // the dash's own exit speed (sera's blink ends faster than k·B) — M3 judges the sprint once reached
  Q.step(40, (i) => { if (reach < 0 && p.sprinting && Math.abs(Math.abs(p.vx) - kB) <= 3) reach = i + 1; if (reach > 0) maxV = Math.max(maxV, Math.abs(p.vx)); });
  out.chain = { reachSteps: reach, reachT: reach > 0 ? +(reach / 60).toFixed(3) : null, sprinting: p.sprinting, maxV, exitV };
  Q.key('right', false);
  // (c) a second tap later than 0.24 s does not sprint
  Q.reset(Q.fl.x0 + 30);
  Q.key('right'); Q.step(4); Q.key('right', false); Q.step(16); Q.key('right');
  let any = false;
  Q.step(30, () => { any ||= p.sprinting; });
  out.late = { sprinted: any };
  Q.key('right', false);
  w.transitioning = false;
  return out;
}

async function pM4({ hero }) {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  w.transitioning = true;
  const B = p.ch.move.speed * p.speedMul;
  const slide = (sprint) => {
    Q.reset(Q.fl.x0 + 30);
    if (sprint) { Q.key('right'); Q.step(4); Q.key('right', false); Q.step(5); Q.key('right'); Q.step(30); }
    else { Q.key('right'); Q.step(45); }
    const wasSprint = p.sprinting, v0 = Math.abs(p.vx);
    Q.key('right', false);
    const x0 = p.x; let skidN = 0, stopAt = -1;
    Q.step(50, (i) => { if (p.anim === 'skid') skidN++; if (stopAt < 0 && Math.abs(p.vx) < 1) stopAt = i + 1; });
    return { wasSprint, v0, slide: +(p.x - x0).toFixed(1), skidT: +(skidN / 60).toFixed(3), stopT: stopAt > 0 ? +(stopAt / 60).toFixed(3) : null };
  };
  const out = { B, run: slide(false), sprint: slide(true) };
  // edge guard: carve a 3×3 pit near the right end of the floor, skid toward it
  const m = w.map, fl = Q.fl;
  const c = Math.max(fl.t0 + 8, fl.t1 - 4);
  const saved = [];
  for (let tx = c; tx < c + 3; tx++) for (let ty = fl.ty; ty < fl.ty + 3; ty++) { saved.push([tx, ty, m.typeAt(tx, ty)]); m.set(tx, ty, Q.PH.T.EMPTY); }
  const edge = c * 48;
  Q.reset(Math.max(fl.x0 + 10, edge - 360));
  Q.key('right');
  const reached = Q.until(() => p.x + p.w >= edge - 14, 200);
  Q.key('right', false);
  let fell = false;
  Q.step(40, () => { if (p.bottom > fl.y + 4) fell = true; });
  out.edge = { reached: reached >= 0, v0: null, dist: +(edge - (p.x + p.w)).toFixed(1), onGround: !!p.onGround, fell, anim: p.anim };
  for (const [tx, ty, t] of saved) m.set(tx, ty, t);
  Q.reset();
  w.transitioning = false;
  return out;
}

async function pM5({ hero }) {
  const Q = window.__fq, w = Q.w(), p = Q.p(), G = Q.FMD.GAIT, P = Q.FMD.PERSONALITY;
  w.transitioning = true;
  const B = p.ch.move.speed * p.speedMul, cad = (P[hero] ?? P._default).cad;
  const events = [], sfx0 = Q.log.sfx.length;
  let last = p.feel?.lastStep ?? null;
  const pass = (dir) => {
    Q.reset(dir > 0 ? Q.fl.x0 + 30 : Q.fl.x1 - 30 - p.w);
    const key = dir > 0 ? 'right' : 'left';
    Q.key(key);
    Q.step(24);   // warm-up (full speed after ≈ 0.1 s)
    last = p.feel?.lastStep ?? null;
    Q.step(400, () => {
      const ls = p.feel?.lastStep;
      if (ls && ls !== last && Math.abs(p.vx) >= 0.97 * B && p.onGround) events.push({ s: Q.steps, ph: ls.ph, gait: ls.gait, surface: ls.surface });
      last = ls;
      const far = dir > 0 ? p.x + p.w > Q.fl.x1 - 60 : p.x < Q.fl.x0 + 60;
      return !far;
    });
    Q.key(key, false);
  };
  pass(1); pass(-1);
  // rate from the event times of each pass (first → last event), phases at each event
  const segs = [];
  let cur = [];
  for (const e of events) { if (cur.length && e.s - cur[cur.length - 1].s > 40) { segs.push(cur); cur = []; } cur.push(e); }
  if (cur.length) segs.push(cur);
  let n = 0, t = 0;
  for (const s of segs) if (s.length >= 3) { n += s.length - 1; t += (s[s.length - 1].s - s[0].s) / 60; }
  const rate = t > 0 ? n / t : null;
  const PI = Math.PI;
  const phErr = events.map((e) => { const x = (((e.ph - G.contactPh) % PI) + PI) % PI; return Math.min(x, PI - x); });
  const sfx = Q.log.sfx.slice(sfx0).map((q) => q[1]);
  w.transitioning = false;
  return {
    B, cad, expected: 4.2 * cad, rate, events: events.length, segs: segs.map((s) => s.length), phMax: phErr.length ? Math.max(...phErr) : null,
    surfaces: [...new Set(events.map((e) => e.surface))], gaits: [...new Set(events.map((e) => e.gait))],
    stepSfx: sfx.filter((s) => s.startsWith('step_')).length, legacyFootstep: sfx.filter((s) => s === 'footstep').length, stepT: p.stepT,
  };
}

async function pM6({ hero }) {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  w.transitioning = true;
  const out = {};
  // takeoff stretch and normal landing
  Q.reset();
  Q.key('jump');
  let air = -1, sqTake = 0, landed = -1, sqLand = 9, heavy = false;
  Q.step(120, (i) => {
    if (i === 20) Q.key('jump', false);
    if (air < 0 && !p.onGround) air = i;
    if (air >= 0 && i - air < 2) sqTake = Math.max(sqTake, p.feel?.sq ?? 0);
    if (air >= 0 && landed < 0 && p.onGround && i > air + 2) landed = i;
    if (landed >= 0 && i - landed < 10) sqLand = Math.min(sqLand, p.feel?.sq ?? 9);
    if (p.anim === 'land_heavy') heavy = true;
  });
  Q.key('jump', false);
  out.jump = { sqTake, sqLand, heavy };
  // 1-tile drop: never heavy
  const drop = (tiles) => {
    Q.reset();
    p.y = Q.fl.y - p.h - tiles * 48; p.vy = 0; p.onGround = false; p.apexY = p.y; p.physY = p.y;
    let ld = -1, sq = 9, hv = false, maxVy = 0;
    Q.step(120, (i) => {
      maxVy = Math.max(maxVy, p.vy);
      if (ld < 0 && p.onGround && i > 1) ld = i;
      if (ld >= 0 && i - ld < 10) sq = Math.min(sq, p.feel?.sq ?? 9);
      if (p.anim === 'land_heavy') hv = true;
      return !(ld >= 0 && i - ld > 12);
    });
    return { landed: ld >= 0, sqLand: sq, heavy: hv, maxVy: Math.round(maxVy) };
  };
  out.hop = drop(1);
  // 5-tile fall: needs 5 free tiles + the hero's height above the home column
  const col = Math.floor((Q.home.x + p.w / 2) / 48) - Q.fl.t0;
  const head = Q.fl.head[col] ?? 0;
  const tiles = 5 + Math.ceil(p.h / 48);
  if (head >= tiles) out.fall = { ...drop(5), headroom: head };
  else {
    // not enough headroom above the home column: find another column of the floor that has it
    const i = Q.fl.head.findIndex((h) => h >= tiles);
    if (i >= 0) { Q.home.x0 = Q.home.x; Q.home.x = (Q.fl.t0 + i) * 48 + 24 - p.w / 2; out.fall = { ...drop(5), headroom: Q.fl.head[i], column: i }; Q.home.x = Q.home.x0; }
    else out.fall = { skipped: true, headroom: Math.max(...Q.fl.head) };
  }
  Q.reset();
  w.transitioning = false;
  return out;
}

// ───────────────────────── combat (feel §4; C1–C15) ─────────────────────────
async function pC1C3() {
  const Q = window.__fq, w = Q.w(), p = Q.p(), H = Q.FH.HITSTOP;
  const ms = p.moveSet;
  const cases = [['L', ms.ground?.[0], 'ground'], ['M', ms.ground?.[1], 'ground'], ['H', ms.up, 'up'], ['F', ms.ground?.[3] ?? ms.charge, 'ground']];
  const out = { rows: [], bloom: null };
  const R0 = Math.random;
  Math.random = () => 0.99;   // no crits: a crit adds HITSTOP.mod.crit frames (C1 checks the class base values)
  try {
  for (const [wantCls, mv, kind] of cases) {
    Q.reset(); p.facing = 1;
    const d = Q.dummy('skeleton', 64, { facing: -1 });
    Q.step(2);
    p.stats.crit = 0;
    w.freezeLog.length = 0; w.hitstop = 0; w.frozenRecent = 0;
    const n0 = Q.log.hits.length;
    p.startMove(w, mv, kind);
    let r = null, whs = null;
    Q.step(60, () => { if (Q.log.hits.length > n0) { r = Q.log.hits[n0]; whs = w.hitstop; return false; } });
    const exp = wantCls === 'L' && r?.fxType === 'bullet' ? H.gun : H[wantCls];
    out.rows.push({ want: wantCls, moveId: mv?.id, cls: r?.cls ?? null, infoHs: r?.hs ?? null, worldHitstop: whs, expected: exp, crit: r?.crit, counter: r?.counter, back: r?.back });
    if (wantCls === 'F' && r) {
      // C3: particles keep moving (0.3×) while the F freeze holds the world
      const snap = w.fx.list.filter((q) => q.shape !== 'dmg' && q.shape !== 'callout' && q.shape !== 'decal').map((q) => [q, q.x, q.y]);
      const hs0 = w.hitstop;
      Q.step(2);
      const still = snap.filter(([q]) => w.fx.list.includes(q));
      const disp = still.map(([q, x, y]) => Math.hypot(q.x - x, q.y - y));
      out.bloom = { hitstop: hs0, frozenAfter2: w.hitstop > 0, n: still.length, avgDisp: disp.length ? disp.reduce((a, b) => a + b, 0) / disp.length : 0 };
    }
    Q.step(30); d.dead = true; Q.step(2);
  }
  } finally { Math.random = R0; }
  return out;
}

async function pC2() {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  Q.reset(); p.facing = 1;
  const ds = [Q.dummy('skeleton', 40, { facing: -1 }), Q.dummy('zombie', 62, { facing: -1 }), Q.dummy('skeleton', 84, { facing: -1 })];
  Q.step(2);
  w.freezeLog.length = 0;
  const frozen = [], n0 = Q.log.hits.length, perSec = [0, 0, 0];
  // the three dummies are held at their spots (knockback would carry them out of reach within ~1 s and the last two
  // seconds would test nothing); the hero keeps her own movement
  const home = ds.map((d) => d.x), cx0 = p.cx;
  for (let i = 0; i < 180; i++) {
    frozen.push(w.hitstop > 0 ? 1 : 0);
    Q.key('attack', (i % 4) < 2);   // mash: 2 steps down, 2 up
    const h = Q.log.hits.length;
    Q.step(1);
    perSec[Math.floor(i / 60)] += Q.log.hits.length - h;
    const shift = Math.max(0, p.cx - cx0);   // a lunge that carries her forward takes the pack along, so it stays in front of her
    for (const [j, d] of ds.entries()) { d.x = home[j] + shift; d.vx = 0; }
  }
  Q.release(); Q.step(30);
  let worst = 0;
  for (let i = 0; i + 60 <= frozen.length; i++) { let s = 0; for (let j = i; j < i + 60; j++) s += frozen[j]; worst = Math.max(worst, s); }
  const targets = new Set(Q.log.hits.slice(n0).map((h) => h.tid)).size;
  for (const d of ds) d.dead = true; Q.step(2);
  return { hits: Q.log.hits.length - n0, perSec, targets, frozenTotal: frozen.reduce((a, b) => a + b, 0) / 60, worstWindow: worst / 60 };
}

async function pC4() {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  Q.reset(); p.facing = 1;
  const d = Q.dummy('skeleton', 64, { facing: -1 });
  Q.step(2);
  const n0 = Q.log.hits.length;
  Q.press('attack', 2);
  const hitAt = Q.until(() => Q.log.hits.length > n0, 40);
  const first = p.move?.id;
  // S-class freeze (0.25 s) right after the first hit; attack pressed 0.05 s into it
  w.hitstop = 0.25;
  Q.step(3);
  Q.press('attack', 2);
  const seen = new Set();
  Q.step(70, () => { if (p.move?.id) seen.add(p.move.id); });
  d.dead = true; Q.step(2);
  return { hitAt, first, seen: [...seen], chained: [...seen].some((id) => id !== first) };
}

async function pC5() {
  const Q = window.__fq, w = Q.w(), p = Q.p(), J = Q.FH.JUGGLE;
  const out = {};
  // launcher: apex and airtime of a skeleton
  Q.reset(); p.facing = 1;
  let d = Q.dummy('skeleton', 30, { facing: -1 });
  Q.step(2);
  const g0 = d.bottom;
  const n0 = Q.log.hits.length;
  p.startMove(w, p.moveSet.up, 'up');
  Q.until(() => Q.log.hits.length > n0, 40);
  let minB = d.bottom, tAir0 = null, tAir1 = null;
  Q.step(180, () => {
    minB = Math.min(minB, d.bottom);
    if (tAir0 == null && !d.onGround) tAir0 = w.time;
    if (tAir0 != null && tAir1 == null && d.onGround) { tAir1 = w.time; return false; }
  });
  out.launch = { apex: +(g0 - minB).toFixed(1), air: tAir0 != null && tAir1 != null ? +(tAir1 - tAir0).toFixed(3) : null, launcherCls: Q.log.hits[n0]?.cls };
  d.dead = true; Q.step(40);
  // 15 airborne hits: the 15th shows '가드!' and gravity 1.3
  Q.reset(); p.facing = 1;
  d = Q.dummy('skeleton', 60, { facing: -1 });
  Q.step(2);
  Q.hit(d, { moveId: 'whipUp', launch: true, kb: [40, -680], hitstop: 0.06 });
  Q.until(() => w.hitstop <= 0, 30); Q.step(6);
  const c0 = Q.log.callouts.length;
  const trace = [];
  for (let i = 1; i <= 16; i++) {
    if (d.onGround) break;
    const cBefore = Q.log.callouts.length;
    Q.hit(d, { moveId: 'whip1', kb: [60, -80], hitstop: 0.05 });
    const guard = Q.log.callouts.slice(cBefore).some((c) => c[1] === (J.guardCallout ?? '가드!'));
    Q.until(() => w.hitstop <= 0, 30); Q.step(1);   // juggle gravity is applied by the next enemy update
    trace.push({ i, jn: d.jn, guard, grav: +(d.gravity / (d.baseGravity || 1)).toFixed(2), air: !d.onGround });
    Q.step(2);
  }
  const firstGuard = trace.find((t) => t.guard)?.i ?? null;
  out.guard = { firstGuardAt: firstGuard, trace, gravAfter: trace.find((t) => t.guard)?.grav ?? null, guardCallouts: Q.log.callouts.slice(c0).filter((c) => c[1] === '가드!').length };
  Q.step(90); d.dead = true; Q.step(2);
  return out;
}

async function pC6() {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  Q.reset(); p.facing = 1;
  const d = Q.dummy('skeleton', 60, { facing: -1 });
  Q.step(2);
  Q.hit(d, { moveId: 'whipUp', launch: true, kb: [40, -680], hitstop: 0.06 });
  Q.step(10);
  const landed = Q.until(() => d.onGround, 160);
  Q.step(1);
  const out = { landed: landed >= 0, downAtLanding: +(d.down ?? 0).toFixed(3) };
  const c0 = Q.log.callouts.length;
  Q.hit(d, { moveId: 'whip1', kb: [60, -40], hitstop: 0.05 });
  const otg1 = d.otg;
  Q.until(() => w.hitstop <= 0, 20); Q.step(2);
  Q.hit(d, { moveId: 'whip1', kb: [60, -40], hitstop: 0.05 });
  const otg2 = d.otg, wake = d.wakeInv;
  Q.until(() => w.hitstop <= 0, 20);
  const hp0 = d.hp, h0 = Q.log.hits.length;
  const n3 = Q.hit(d, { moveId: 'whip1', kb: [60, -40], hitstop: 0.05 });
  out.otg = { otg1, otg2, wakeInvAfter2: +(wake ?? 0).toFixed(3), otgCallout: Q.log.callouts.slice(c0).some((c) => c[1] === '다운 추가타'), third: { hitCount: n3, dmg: hp0 - d.hp, logged: Q.log.hits.length - h0, wakeInvAtHit: +(d.wakeInv ?? 0).toFixed(3) } };
  Q.step(40); d.dead = true; Q.step(2);
  return out;
}

async function pC7() {
  const Q = window.__fq, w = Q.w(), p = Q.p(), m = w.map, fl = Q.fl;
  // a wall 3 tiles right of home: build one if the floor has none there (restored afterwards)
  const wc = Math.floor((Q.home.x + p.w) / 48) + 5;
  const saved = [];
  for (let ty = fl.ty - 4; ty < fl.ty; ty++) { saved.push([wc, ty, m.typeAt(wc, ty)]); m.set(wc, ty, Q.PH.T.SOLID); }
  const wallX = wc * 48;
  Q.reset(); p.facing = 1;
  const d = Q.dummy('skeleton', 0, { x: wallX - 70, facing: -1 });
  p.x = d.x - p.w - 20; Q.step(2);
  const c0 = Q.log.callouts.length;
  let vx0 = null, flipped = false, maxVx = 0, flipAt = -1;
  Q.hit(d, { moveId: 'gs3', finisher: true, kb: [460, -360], hitstop: 0.1, dir: 1 });
  Q.step(60, (i) => { if (d.vx > 0) maxVx = Math.max(maxVx, d.vx); if (vx0 == null && d.vx > 50) vx0 = d.vx; if (vx0 != null && d.vx < -50 && !flipped) { flipped = true; flipAt = i; return false; } });
  const bounces1 = Q.log.callouts.slice(c0).filter((c) => c[1] === '벽 바운드!').length;
  // same juggle (still airborne after the bounce): another F hit into the wall must not bounce again
  Q.step(3);
  const airborne2 = !d.onGround;
  let vx2 = 0;
  if (airborne2) { Q.hit(d, { moveId: 'gs3', finisher: true, kb: [460, -360], hitstop: 0.1, dir: 1 }); Q.step(30, () => { vx2 = Math.max(vx2, d.vx); }); }
  const bounces2 = Q.log.callouts.slice(c0).filter((c) => c[1] === '벽 바운드!').length;
  for (const [tx, ty, t] of saved) m.set(tx, ty, t);
  Q.step(40); d.dead = true; Q.step(2);
  return { maxVx: Math.round(maxVx), flipped, flipAt, bounces1, bounces2, airborne2, vx2: Math.round(vx2) };
}

async function pC8() {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  Q.reset(); p.facing = 1;
  const d = Q.dummy('zombie', 60, { facing: -1 });
  Q.step(2);
  Q.hit(d, { moveId: 'whipUp', launch: true, kb: [40, -680], hitstop: 0.06 });
  Q.until(() => w.hitstop <= 0, 20); Q.step(12);
  const airborne = !d.onGround;
  const c0 = Q.log.callouts.length;
  Q.hit(d, { moveId: 'whipA2', kb: [200, 120], hitstop: 0.05 });
  const slamVy = d.vy;
  const land = Q.until(() => d.onGround, 120);
  let vyAfter = null, minVy = 0, down = 0;
  Q.step(12, (i) => { if (i === 0) vyAfter = d.vy; minVy = Math.min(minVy, d.vy); down = Math.max(down, d.down ?? 0); });
  const cb = Q.log.callouts.slice(c0).some((c) => c[1] === '바닥 바운드!');
  Q.step(60); d.dead = true; Q.step(2);
  return { airborne, slamVy: Math.round(slamVy), landed: land >= 0, vyAfterLanding: vyAfter != null ? Math.round(vyAfter) : null, minVyAfter: Math.round(minVy), maxDownAfter: +down.toFixed(3), callout: cb };
}

async function pC9() {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  const out = {};
  const R0 = Math.random;
  Math.random = () => 0.99;   // no crits: crit damage/style points would move the thresholds this check measures
  try {
  // armor_knight is never launched by whip1
  Q.reset(); p.facing = 1;
  let d = Q.dummy('armor_knight', 70, { facing: -1 });
  Q.step(3);
  const gy = d.bottom; let rise = 0, airborne = false;
  for (let i = 0; i < 3; i++) {
    Q.hit(d, { moveId: 'whip1', kb: [170, -60], hitstop: 0.05 });
    Q.step(25, () => { rise = Math.max(rise, gy - d.bottom); airborne ||= !d.onGround; });
  }
  out.armor = { wclass: d.wclass, rise: +rise.toFixed(1), airborne };
  d.dead = true; Q.step(2);
  // gear_golem staggers after ≈ 12 points (L = 1 point each)
  Q.reset(); p.facing = 1;
  d = Q.dummy('gear_golem', 90, { facing: -1 });
  Q.step(3);
  let hitsToStagger = null;
  for (let i = 1; i <= 20; i++) {
    Q.hit(d, { moveId: 'whip1', kb: [60, -20], hitstop: 0.05 });
    if ((d.staggerT ?? 0) > 0) { hitsToStagger = i; break; }
    Q.until(() => w.hitstop <= 0, 10); Q.step(1);
  }
  out.golem = { wclass: d.wclass, hitsToStagger, staggerT: +(d.staggerT ?? 0).toFixed(2) };
  d.dead = true; Q.step(30);
  // bone_pillar never moves
  Q.reset(); p.facing = 1;
  d = Q.dummy('bone_pillar', 80, { facing: -1 });
  Q.step(3);
  const x0 = d.x, y0 = d.y;
  for (let i = 0; i < 4; i++) { Q.hit(d, { moveId: 'gs3', finisher: true, kb: [460, -360], hitstop: 0.1 }); Q.step(20); }
  out.pillar = { wclass: d.wclass, dx: +(d.x - x0).toFixed(2), dy: +(d.y - y0).toFixed(2) };
  d.dead = true; Q.step(2);
  } finally { Math.random = R0; }
  return out;
}

async function pC10() {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  const R0 = Math.random;
  Q.reset(); p.facing = 1; p.stats.crit = 0;
  const plain = Q.dummy('skeleton', 60, { facing: -1 });
  const ctr = Q.dummy('skeleton', 200, { facing: -1 });
  const back = Q.dummy('skeleton', -170, { facing: -1 });   // left of the hero, facing left: hit from behind by a leftward swing
  Q.step(3);
  Math.random = () => 0.5;
  const out = {};
  try {
    const n0 = Q.log.hits.length, c0 = Q.log.callouts.length;
    Q.hit(plain, { moveId: 'whip2', kb: [170, -140], hitstop: 0.05, dir: 1 });
    Q.until(() => w.hitstop <= 0, 20);
    ctr.state = 'attack'; ctr.didHit = false; ctr.stateT = 0.2;
    Q.hit(ctr, { moveId: 'whip2', kb: [170, -140], hitstop: 0.05, dir: 1 });
    const hP = Q.log.hits[n0], hC = Q.log.hits[n0 + 1];
    out.counter = { plainDmg: hP?.dmg, counterDmg: hC?.dmg, ratio: hP?.dmg ? +(hC?.dmg / hP.dmg).toFixed(3) : null, flag: !!hC?.counter, plainFlag: !!hP?.counter, callout: Q.log.callouts.slice(c0).some((c) => c[1] === 'COUNTER'), cls: hC?.cls };
    Q.until(() => w.hitstop <= 0, 20);
    const c1 = Q.log.callouts.length, n1 = Q.log.hits.length;
    // the dummy's own update may have turned it while the steps above ran (idle turn); C10 checks the impact rule, so
    // face it away from the hero right before the swing and record what it was
    const facingBefore = back.facing;
    back.facing = -1;
    Q.hit(back, { moveId: 'whip1', kb: [170, -60], hitstop: 0.05, dir: -1 });
    out.back = { flag: !!Q.log.hits[n1]?.back, callout: Q.log.callouts.slice(c1).some((c) => c[1] === 'BACK ATTACK'), facingBefore };
  } finally { Math.random = R0; }
  Q.step(30); Q.clearDummies();
  return out;
}

async function pC11({ mats }) {
  const Q = window.__fq, w = Q.w(), p = Q.p(), B = Q.FH.BUDGET;
  const q = w.fx.quality ?? 1, qk = q >= 0.95 ? 'high' : q >= 0.7 ? 'medium' : 'low';
  const rows = [];
  for (const [mat, id] of mats) {
    Q.reset(); p.facing = 1;
    const d = Q.dummy(id, 90, { facing: -1 });
    Q.step(3);
    const n0 = w.fx.list.length;
    const before = new Set(w.fx.list);
    Q.log.emits = {};
    Q.hit(d, { moveId: 'whip2', kb: [170, -140], hitstop: 0.05, dir: 1 });
    const emits = Q.log.emits; Q.log.emits = null;
    const added = w.fx.list.filter((x) => !before.has(x));
    const ui = added.filter((x) => x.shape === 'dmg' || x.shape === 'callout').length;
    rows.push({ mat, id, defMat: d.def?.material ?? null, emits, added: added.length, addedNoUi: added.length - ui, listDelta: w.fx.list.length - n0 });
    Q.step(20); d.dead = true; Q.step(2);
  }
  return { quality: qk, perHit: B?.[qk]?.perHit ?? 28, rows };
}

async function pC12() {
  const Q = window.__fq, w = Q.w(), p = Q.p(), g = Q.g;
  const out = {};
  Q.reset(); p.facing = 1;
  let d = Q.dummy('skeleton', 70, { facing: -1 });
  Q.step(2);
  const before = new Set(w.fx.list);
  const ys = [];
  for (let i = 0; i < 10; i++) {
    const b = new Set(w.fx.list);
    Q.hit(d, { moveId: 'whip1', kb: [20, 0], hitstop: 0.05, dir: 1 });
    const nd = w.fx.list.filter((x) => !b.has(x) && x.shape === 'dmg');
    if (nd.length) ys.push(Math.round(nd[0].y));
    Q.until(() => w.hitstop <= 0, 12); Q.step(1);
  }
  let totals = 0;
  Q.step(50, () => { totals = Math.max(totals, w.fx.list.filter((x) => !before.has(x) && x.shape === 'dmg' && x.key === 'total').length); });
  const steps = ys.slice(1).map((y, i) => ys[i] - y);
  out.column = { numbers: ys.length, ys, rises: steps, totals, col: d._dmgCol ? { hits: d._dmgCol.hits, total: d._dmgCol.total } : null };
  d.dead = true; Q.step(40);
  // live cap: 4 dummies × 12 fast hits
  Q.reset(); p.facing = 1;
  const ds = [Q.dummy('skeleton', 60, { facing: -1 }), Q.dummy('skeleton', 110, { facing: -1 }), Q.dummy('skeleton', 160, { facing: -1 }), Q.dummy('skeleton', 210, { facing: -1 })];
  Q.step(2);
  let maxLive = 0;
  for (let i = 0; i < 12; i++) {
    for (const e of ds) { Q.hit(e, { moveId: 'whip1', kb: [10, 0], hitstop: 0.0001, dir: 1 }); maxLive = Math.max(maxLive, Q.fxCount('dmg')); }
    Q.step(1, () => { maxLive = Math.max(maxLive, Q.fxCount('dmg')); });
  }
  Q.step(20, () => { maxLive = Math.max(maxLive, Q.fxCount('dmg')); });
  const q = w.fx.quality ?? 1, qk = q >= 0.95 ? 'high' : q >= 0.7 ? 'medium' : 'low';
  out.cap = { maxLive, cap: Q.FH.BUDGET?.[qk]?.dmgNums ?? 24 };
  for (const e of ds) e.dead = true; Q.step(40);
  // showDamage off shows none
  Q.reset(); p.facing = 1;
  d = Q.dummy('skeleton', 70, { facing: -1 });
  Q.step(2);
  const sd = g.settings.showDamage;
  g.settings.showDamage = false;
  const b2 = new Set(w.fx.list);
  for (let i = 0; i < 5; i++) { Q.hit(d, { moveId: 'whip1', kb: [10, 0], hitstop: 0.05, dir: 1 }); Q.until(() => w.hitstop <= 0, 12); Q.step(1); }
  Q.step(40);
  out.off = { numbers: w.fx.list.filter((x) => !b2.has(x) && x.shape === 'dmg').length, texts: 0 };
  g.settings.showDamage = sd;
  d.dead = true; Q.step(2);
  return out;
}

async function pC13() {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  Q.reset(); p.facing = 1; p.stats.crit = 0;
  // no crits: a crit kill with overkill takes the 1.5 s slow-mo slot (feel §4.9 priority/rate limit) before the last kill
  const R0 = Math.random, hit = (e) => { Math.random = () => 0.99; try { Q.hit(e, { moveId: 'whip1', mv: 5, hitstop: 0.05, dir: 1 }); } finally { Math.random = R0; } };
  const kill3 = () => {
    const ds = [Q.dummy('skeleton', 60, { facing: -1, hp: 1, roomFoe: true }), Q.dummy('skeleton', 130, { facing: -1, hp: 1, roomFoe: true }), Q.dummy('skeleton', 200, { facing: -1, hp: 1, roomFoe: true })];
    Q.step(2);
    for (const e of ds.slice(0, 2)) { hit(e); Q.until(() => w.hitstop <= 0 && w.slowmo <= 0, 60); Q.step(2); }
    const pre = { roomFoes: w.roomFoes, killSlowT: +(w.killSlowT ?? 0).toFixed(2), slowmo: w.slowmo };
    hit(ds[2]);
    const live = w.entities.filter((o) => o.kind === 'enemy' && !ds.includes(o) && !o.dead && !(o.dying > 0)).map((o) => ({ id: o.def?.id, dummy: !!o.__dummy, hidden: !!o.hidden, x: Math.round(o.x) }));
    let slow = 0, scale = null, at = -1;
    Q.step(40, (i) => { if (w.slowmo > slow) { slow = w.slowmo; scale = w.slowmoScale; if (at < 0) at = i; } });
    return { slow: +slow.toFixed(3), scale, at, killed: ds.filter((e) => e.dead || e.dying > 0 || e.hp <= 0).length, pre, live };
  };
  const first = kill3();
  const t0 = w.rt;
  const second = kill3();
  const gap = +(w.rt - t0).toFixed(2), killSlowT = +(w.killSlowT ?? 0).toFixed(2);
  // positive control: once the 1.5 s gap has run out the same kill triggers the slow-mo again (so 'second' was the rate limit)
  Q.until(() => !(w.killSlowT > 0) && !(w.slowmo > 0), 240); Q.step(2);
  const third = kill3();
  return { first, second, third, gap, killSlowT };
}

async function pC14() {
  const Q = window.__fq, w = Q.w(), p = Q.p(), S = w.style, ranks = Q.FH.STYLE.ranks;
  const out = {};
  const R0 = Math.random;
  Math.random = () => 0.99;   // no crits: crit damage/style points would move the thresholds this check measures
  try {
  const words = new Set();
  const watch = () => { const a = S.ann; if (a?.cur?.word) words.add(a.cur.word); for (const q of a?.queue ?? []) if (q?.word) words.add(q.word); };
  // varied combo
  Q.reset(); p.facing = 1;
  let d = Q.dummy('skeleton', 60, { facing: -1 });
  Q.step(2);
  S.reset?.(); if (w.combo) { w.combo.n = 0; w.combo.t = 0; }
  const seq = [
    { moveId: 'whip1', kb: [60, -40] }, { moveId: 'whip2', kb: [60, -60] }, { moveId: 'whip3', kb: [60, -40] },
    { moveId: 'whipUp', launch: true, kb: [20, -680], hitstop: 0.06 },
    { moveId: 'whipA1', kb: [20, -80] }, { moveId: 'whipA2', kb: [20, -80] }, { moveId: 'whipLow', kb: [20, -80] },
    { moveId: 'whipDash', kb: [20, -120] }, { moveId: 'whip4', finisher: true, kb: [60, -120], hitstop: 0.07 },
    { moveId: 'whipCharge', finisher: true, kb: [60, -120], hitstop: 0.08 }, { moveId: 'whip1', kb: [40, -40] }, { moveId: 'whipDown', kb: [40, -40] },
  ];
  let maxRank = 0;
  for (let i = 0; i < 24; i++) {
    const a = seq[i % seq.length];
    Q.hit(d, { hitstop: 0.05, dir: 1, ...a });
    Q.step(1, watch); Q.until(() => { watch(); return w.hitstop <= 0; }, 20); Q.step(12, watch);
    maxRank = Math.max(maxRank, S.rank);
  }
  out.varied = { rank: S.rank, letter: ranks[S.rank - 1]?.r ?? '-', maxRank, pts: Math.round(S.pts), words: [...words] };
  // taking a hit drops one rank
  const r0 = S.rank;
  p.buffs.invincible = 0; p.iframes = 0;
  Q.CMB.enemyStrike(w, p.hurtbox(), { owner: d, stats: d.stats, team: 'enemy', mv: 0.05, dir: -1, kb: [60, -60], tags: ['contact'] });
  const r1 = S.rank;
  p.buffs.invincible = 99999; p.iframes = 0; p.hurtT = 0;
  out.hurt = { before: r0, after: r1 };
  d.dead = true; Q.step(90);
  // spamming one move
  Q.reset(); p.facing = 1;
  d = Q.dummy('skeleton', 60, { facing: -1 });
  Q.step(2);
  S.reset?.();
  let spamMax = 0;
  for (let i = 0; i < 40; i++) {
    Q.hit(d, { moveId: 'whip1', kb: [20, -20], hitstop: 0.05, dir: 1 });
    Q.until(() => w.hitstop <= 0, 20); Q.step(6);
    spamMax = Math.max(spamMax, S.rank);
  }
  out.spam = { maxRank: spamMax, letter: ranks[spamMax - 1]?.r ?? '-', pts: Math.round(S.pts) };
  d.dead = true; Q.step(2);
  } finally { Math.random = R0; }
  return out;
}

async function pC15() {
  const Q = window.__fq, g = Q.g;
  const f0 = g.settings.flashFx;
  g.settings.flashFx = 1;
  g._flashLog.length = 0;
  const a = [];
  for (let i = 0; i < 5; i++) { g.flashFx.a = 0; g.flash('#ffffff', 1, 4); a.push(+g.flashFx.a.toFixed(3)); }
  g.settings.flashFx = 0; g._flashLog.length = 0; g.flashFx.a = 0;
  g.flash('#ffffff', 1, 4);
  const off = g.flashFx.a;
  g.settings.flashFx = f0; g._flashLog.length = 0; g.flashFx.a = 0;
  return { values: a, off };
}

// ───────────────────────── ultimates (feel §5; U1, U2) ─────────────────────────
/** the class and six passive dummies around home (U1/U2/V1); pUlt({setup:false}) then casts into them */
async function pUltSetup({ cid }) {
  window.__fq.ultSetup(cid);
  return { tier: window.__fq._ult.tier };
}
/** U2 gameplay baseline (feel §8): walk back and forth past the dummies with a few swings, render every frame */
async function pBaseline({ n = 90 }) {
  const Q = window.__fq;
  const base = [];
  for (let i = 0; i < n; i++) {
    Q.key('right', i < 40); Q.key('left', i >= 45 && i < 85);
    Q.key('attack', i % 22 === 0 || i % 22 === 1);
    base.push(Q.frame());
  }
  Q.release();
  return { base };
}
async function pUlt({ cid, measure, captureFinal, setup = true }) {
  const Q = window.__fq, w = Q.w(), p = Q.p(), g = Q.g;
  if (setup) Q.ultSetup(cid);
  const { tier, ds, hp0 } = Q._ult;
  w.run.sp = 100; w.run.aw = 0;
  const ev0 = Q.log.ev.length, sc0 = Q.log.scenes.length, h0 = Q.log.hits.length;
  Q.key('ult'); const tw0s = w.time;
  const frames = [];
  let started = false, tStart = null, tLast = null, peak = 0, finalAt = null, steps = 0, zoomMin = 1, zoomMax = 1;
  let shot = null;
  tStart = tw0s;
  for (let i = 0; i < 900; i++) {
    if (i === 2) Q.key('ult', false);
    const ms = measure ? Q.frame() : (Q.step(1), 0);
    if (measure) frames.push(ms);
    steps++;
    const cut = !!w.cutscene || Q.top() !== 'stage';
    if (!started && cut) started = true;
    if (w.cutscene) tLast = w.time;
    peak = Math.max(peak, w.fx.list.length);
    const z = w.camera.zoom; zoomMin = Math.min(zoomMin, z); zoomMax = Math.max(zoomMax, z);
    if (finalAt == null && Q.log.hits.slice(h0).some((h) => h.cls === 'S')) {
      finalAt = i;
      if (captureFinal) { if (!measure) Q.render(); shot = true; break; }
    }
    if (started && !cut && i > 5) break;
  }
  const res = {
    cid, tier, started, tStart, tLast, worldDur: tStart != null && tLast != null ? +(tLast - tStart).toFixed(3) : null, steps, peak, finalAt,
    cast: Q.log.ev.slice(ev0).some((e) => e[1] === 'ultimateCast'), cutins: Q.log.scenes.slice(sc0).filter((s) => s[1] === 'push').map((s) => s[2]),
    classes: [...new Set(Q.log.hits.slice(h0).map((h) => h.cls))], dmg: ds.reduce((n, e, i) => n + (hp0[i] - e.hp), 0),
    zoomMin: +zoomMin.toFixed(3), zoomMax: +zoomMax.toFixed(3), frames: measure ? frames : null, paused: !!shot,
    at: { stage: w.stage?.id ?? null, room: w.roomId ?? null, px: Math.round(p.x), camX: Math.round(w.camera.x) },
  };
  Q._ultDs = ds;
  return res;
}
/**
 * feel §8 third headless ratio: 'sprinting with 6 enemies hit at SSS style: average ≤ 1.5× the idle-walk average (CPU ratio ≤ 1.5×
 * as well); absolute guard: sprint average ≤ 10 ms' (U2_SPRINT).
 * part 'walk': six idle dummies ahead, the hero stands 30 frames then walks (pad stick 0.52) 60 frames — the baseline.
 * part 'sprint': same dummies, double-tap sprint while two dummies take a hit every 8 frames and the style meter is held at SSS.
 * Every frame is stepped and rendered; the Node side brackets each part with main-thread CPU marks.
 */
async function pSprintSSS({ part, n = 90 }) {
  const Q = window.__fq, w = Q.w(), p = Q.p(), S = w.style, ranks = Q.FH.STYLE.ranks;
  const frames = [];
  if (part === 'setup') {
    Q.clearDummies();
    Q.reset(Q.fl.x0 + 30);
    w.transitioning = true;
    Q._spDs = [0, 1, 2, 3, 4, 5].map((i) => Q.dummy(i % 2 ? 'zombie' : 'skeleton', 110 + i * 50, { facing: -1 }));
    Q._spHome = p.x;
    S.reset?.();
    Q.step(4);
    return { dummies: Q._spDs.length };
  }
  if (part === 'walk') {
    if (window.__padConnect) { window.__padConnect(); }
    const gaits = new Set();
    for (let i = 0; i < n; i++) {
      if (i === 30) window.__padAxes?.(0.52, 0);
      frames.push(Q.frame());
      if (i >= 40) gaits.add(p.gait);
    }
    window.__padAxes?.(0, 0);
    Q.release(); Q.step(4);
    return { frames, gaits: [...gaits] };
  }
  if (part === 'prep') {
    // back to the start, dummies back in their slots, one double tap queued by the sprint part
    for (const [i, e] of Q._spDs.entries()) { e.x = Q._spHome + p.w / 2 + 110 + i * 50 - e.w / 2; e.vx = 0; e.vy = 0; }
    Q.reset(Q._spHome, 6);
    S.reset?.();
    return true;
  }
  // part 'sprint'
  const h0 = Q.log.hits.length;
  let sprintN = 0, rankMin = 99;
  const top = ranks.length, sss = ranks[top - 1];
  const holdSSS = () => { S.pts = Math.max(S.pts, Q.FH.STYLE.max ?? sss.min + 400); S.rank = top; S.sinceHit = 0; };
  Q.key('right'); Q.step(4); Q.key('right', false); Q.step(5); Q.key('right');   // double tap (M3)
  // the hero keeps sprinting; every 8th frame two of the six dummies take a hit through the real hit pipeline
  // (combat.playerStrike: hitstop, sparks, damage numbers, style), cycling so all six are hit repeatedly
  let k = 0;
  for (let i = 0; i < n; i++) {
    holdSSS();
    if (i % 8 === 4) for (let j = 0; j < 2; j++) { const e = Q._spDs[k++ % Q._spDs.length]; Q.hit(e, { moveId: 'whip2', kb: [120, -60], hitstop: 0.05, dir: e.cx >= p.cx ? 1 : -1 }); }
    frames.push(Q.frame());
    if (p.sprinting) sprintN++;
    rankMin = Math.min(rankMin, S.rank);
  }
  Q.release(); Q.step(4);
  const hs = Q.log.hits.slice(h0);
  const targets = new Set(hs.map((h) => h.tid));
  const ids = new Set(Q._spDs.map((e) => e.__id));
  const out = { frames, sprintFrames: sprintN, hits: hs.length, targets: [...targets].filter((t) => ids.has(t)).length, rankMin, rankLetter: ranks[rankMin - 1]?.r ?? '-', particlesPeak: w.fx.list.length };
  for (const e of Q._spDs) e.dead = true;
  w.transitioning = false; S.reset?.();
  Q.step(2);
  return out;
}
/** continue an ultimate paused for the V1 screenshot, then check the aftermath */
async function pUltFinish({ measureFrames }) {
  const Q = window.__fq, w = Q.w();
  const frames = [];
  let peak = 0, tLast = null;
  for (let i = 0; i < 900; i++) {
    const ms = measureFrames ? Q.frame() : (Q.step(1), 0);
    if (measureFrames) frames.push(ms);
    peak = Math.max(peak, w.fx.list.length);
    if (w.cutscene) tLast = w.time;
    if (!w.cutscene && Q.top() === 'stage') break;
  }
  return { frames, peak, tLast };
}
async function pUltAfter() {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  Q.step(60);
  const after = { overlays: w.overlays?.length ?? 0, overlayKinds: (w.overlays ?? []).map((o) => o.kind ?? o.id ?? o.constructor?.name ?? 'overlay'), letterbox: w.letterbox ?? 0, hudHidden: !!w.hudHidden, zoom: +w.camera.zoom.toFixed(3), cutscene: !!w.cutscene, top: Q.top(), freeze: !!w.freezeEnemies };
  for (const e of Q._ultDs ?? []) e.dead = true;
  Q.step(2);
  return after;
}

// ───────────────────────── awakening (feel §6; A1–A8) ─────────────────────────
async function pA1({ cid }) {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  Q.reset();
  const tier = Q.setClass(cid);
  const d = Q.dummy('skeleton', 150, {});
  Q.step(2);
  w.run.sp = 100; w.run.aw = 100;
  const ev0 = Q.log.ev.length, sc0 = Q.log.scenes.length, s0 = Q.steps;
  Q.key('ult');
  let castStep = null;
  Q.step(36, () => { if (castStep == null && Q.log.ev.slice(ev0).some((e) => e[1] === 'ultimateCast')) castStep = Q.steps - s0; });
  Q.key('ult', false);
  Q.until(() => !w.cutscene && Q.top() === 'stage', 900);
  const pushes = Q.log.scenes.slice(sc0).filter((s) => s[1] === 'push').map((s) => s[2]);
  d.dead = true; Q.step(30);
  return { tier, castStep, ready: !!w.awakenState?.ready, pushes, awakenCast: Q.log.ev.slice(ev0).some((e) => e[1] === 'awakenCast'), aw: w.run.aw };
}

async function pA2({ cid }) {
  const Q = window.__fq, w = Q.w(), p = Q.p(), AD = Q.AW.AWAKEN_DEBUG;
  Q.reset();
  const tier = Q.setClass(cid);
  const d = Q.dummy('skeleton', 150, {});
  Q.step(2);
  const out = { tier };
  // tap 0.1 s → normal ultimate on release
  w.run.sp = 100; w.run.aw = 100;
  let ev0 = Q.log.ev.length, sc0 = Q.log.scenes.length;
  Q.key('ult'); Q.step(6);
  const castBeforeRelease = Q.log.ev.slice(ev0).some((e) => e[1] === 'ultimateCast');
  Q.key('ult', false); const rel = Q.steps;
  let castAt = null;
  Q.step(6, () => { if (castAt == null && Q.log.ev.slice(ev0).some((e) => e[1] === 'ultimateCast')) castAt = Q.steps - rel; });
  Q.until(() => !w.cutscene && Q.top() === 'stage', 900);
  out.tap = { castBeforeRelease, castAfterRelease: castAt, pushes: Q.log.scenes.slice(sc0).filter((s) => s[1] === 'push').map((s) => s[2]), awakenCast: Q.log.ev.slice(ev0).some((e) => e[1] === 'awakenCast') };
  Q.step(20);
  // 0.3 s hold → cancel, gauges unchanged
  w.run.sp = 100; w.run.aw = 100;
  ev0 = Q.log.ev.length; sc0 = Q.log.scenes.length;
  const cancels0 = AD.cancels;
  Q.key('ult'); Q.step(18); Q.key('ult', false); Q.step(12);
  out.cancel = { casts: Q.log.ev.slice(ev0).filter((e) => e[1] === 'ultimateCast' || e[1] === 'awakenCast').length, pushes: Q.log.scenes.slice(sc0).filter((s) => s[1] === 'push').length, sp: w.run.sp, aw: w.run.aw, cancelsDelta: AD.cancels - cancels0 };
  Q.step(10);
  Q._a2d = d;
  return out;
}

/** first awakening (tier 1): hold ult 0.5 s, then step (with render) until the cut-in reaches t = 0.8 s */
async function pAwakenStart({ cid, key, render, holdSteps = 30, until = 0.8 }) {
  const Q = window.__fq, w = Q.w(), p = Q.p(), g = Q.g;
  if (cid) Q.setClass(cid);
  Q.reset(Q.home.x, 4);
  const tier = Q.CLASSES[p.hero.classId]?.tier ?? 0;
  let d = Q._a2d && !Q._a2d.dead ? Q._a2d : null;
  if (!d) d = Q._a2d = Q.dummy('skeleton', 150, {});
  const d2 = Q.dummy('zombie', -160, {});
  Q._awDs = [d, d2];
  Q.step(2);
  const hp0 = [d.hp, d2.hp];
  w.run.sp = 100; w.run.aw = 100;
  const ev0 = Q.log.ev.length, sc0 = Q.log.scenes.length, s0 = Q.steps;
  const frames = [];
  let pushAt = null;
  const ridingAtStart = !!p.mount?.riding;
  Q.key(key);
  for (let i = 0; i < 60; i++) {
    frames.push(render ? Q.frame() : (Q.step(1), 0));
    if (i + 1 === (key === 'awaken' ? 2 : holdSteps)) Q.key(key, false);
    if (Q.top() === 'awakenCutin') { pushAt = Q.steps - s0; frames.splice(0, frames.length - 1); break; }
  }
  Q.key(key, false);
  const sp = w.run.sp, aw = w.run.aw;
  const sc = Q.sceneOf('awakenCutin');
  const info = sc ? { renderedText: sc.renderedText, fallback: !!sc.fallback, short: !!sc.T?.short, end: sc.T?.end, charId: sc.charId, cutinKey: sc.a?.cutin, loaded: !!Q.assets.has?.(sc.a?.cutin), imgW: sc.img?.naturalWidth ?? sc.img?.width ?? 0 } : null;
  // step to cut-in t = until (for the V1 screenshot)
  if (sc) for (let i = 0; i < 200 && Q.top() === 'awakenCutin' && (sc.t ?? 0) < until; i++) frames.push(render ? Q.frame() : (Q.step(1), 0));
  if (!render) Q.render();
  Q._aw = { ev0, sc0, s0, hp0, frames, sc };
  return { tier, pushAt, spAfterCast: sp, awAfterCast: aw, info, sceneT: sc ? +(sc.t ?? 0).toFixed(3) : null, top: Q.top(), line: Q.AWD.AWAKEN[p.hero.charId]?.line, hudHidden: !!w.hudHidden, ridingAtStart };
}

/** continue the awakening until the director ends */
async function pAwakenFinish({ render }) {
  const Q = window.__fq, w = Q.w(), p = Q.p(), g = Q.g, A = Q._aw, AD = Q.AW.AWAKEN_DEBUG;
  const frames = A.frames;
  let peak = 0, popAt = null, dirStart = null, dirEnd = null, freezeSeen = false, padSeen = [], mounted = [];
  const tp = Q.TP.touchpad;
  for (let i = 0; i < 900; i++) {
    frames.push(render ? Q.frame() : (Q.step(1), 0));
    const top = Q.top();
    if (popAt == null && Q.log.scenes.slice(A.sc0).some((s) => s[1] === 'pop' && s[2] === 'awakenCutin')) { popAt = Q.log.scenes.slice(A.sc0).find((s) => s[1] === 'pop' && s[2] === 'awakenCutin')[0] - (Q.log.scenes.slice(A.sc0).find((s) => s[1] === 'push' && s[2] === 'awakenCutin')?.[0] ?? A.s0); dirStart = Q.steps; }
    if (dirStart != null && w.cutscene) { freezeSeen ||= !!w.freezeEnemies; padSeen.push(!!tp?.visible); mounted.push(!!p.mount?.riding); }
    peak = Math.max(peak, w.fx.list.length);
    if (dirStart != null && !w.cutscene && top === 'stage') { dirEnd = Q.steps; break; }
  }
  Q.step(1);
  const dmg = A.hp0.map((h, i) => h - (Q._awDs[i]?.hp ?? h));
  const res = {
    popSteps: popAt, popT: popAt != null ? +(popAt / 60).toFixed(3) : null, dirT: dirStart != null && dirEnd != null ? +((dirEnd - dirStart) / 60).toFixed(3) : null,
    cutscene: !!w.cutscene, freezeEnemies: !!w.freezeEnemies, hudHidden: !!w.hudHidden, letterbox: w.letterbox ?? 0, top: Q.top(), freezeSeen,
    dmg, peak, director: AD.last?.director ?? null, done: !!AD.last?.done, why: AD.last?.why ?? null, frames, sp: w.run.sp, aw: w.run.aw,
    padVisibleDuringDirector: padSeen.filter(Boolean).length, padSamples: padSeen.length, padVisibleAfter: !!tp?.visible, ridingDuringDirector: mounted.filter(Boolean).length,
    awakenCasts: Q.log.ev.slice(A.ev0).filter((e) => e[1] === 'awakenCast').length,
  };
  return res;
}
async function pAwakenCleanup() {
  const Q = window.__fq;
  Q.step(30);
  for (const e of Q._awDs ?? []) e.dead = true;
  Q.step(2);
  return true;
}

// A5: boss cap in s04 room=boss
async function pBossEnter() {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  p.buffs.invincible = 99999;
  let lastX = p.x, stuck = 0, t = 0;
  const log = [];
  for (let i = 0; i < 3600; i++) {
    const top = Q.top();
    if (top === 'stage' && w.boss && w.bossActive && !w.cutscene && w.boss.state !== 'intro') break;
    if (top === 'dialogue' || top === 'bossIntro' || top === 'story') {
      Q.release();
      Q.key(i % 6 < 2 ? 'confirm' : 'jump', i % 6 < 3); Q.key('attack', i % 6 === 4);
      Q.step(1); continue;
    }
    if (top !== 'stage') { Q.release(); Q.step(1); if (i % 60 === 0) log.push(top); continue; }
    Q.key('confirm', false); Q.key('attack', false);
    if (!w.boss) {
      Q.key('right', true);
      if (Math.abs(p.x - lastX) < 0.5) stuck++; else stuck = 0;
      lastX = p.x;
      Q.key('jump', stuck > 10 && stuck % 30 < 16);
    } else { Q.key('right', false); Q.key('jump', false); }
    Q.step(1);
    t++;
  }
  Q.release(); Q.step(2);
  const b = w.boss;
  return { boss: b?.def?.id ?? b?.id ?? null, active: !!w.bossActive, top: Q.top(), state: b?.state ?? null, hp: b?.hp, maxHp: b?.stats?.maxHp, tops: log };
}
async function pBossAwaken({ cid, boost = 0 }) {
  const Q = window.__fq, w = Q.w(), p = Q.p(), b = w.boss;
  Q.setClass(cid);
  p.buffs.invincible = 99999;
  // boost: multiply every hit (instance getter over Player.dmgMul, read per hit) so the uncapped awakening would take far
  // more than 30 % — the cap itself has to engage
  if (boost > 0) Object.defineProperty(p, 'dmgMul', { get: () => boost, configurable: true });
  // keep the hero near the boss (the awakening hits what is on screen)
  const hp0 = b.hp, max = b.stats?.maxHp ?? b.maxHp;
  w.run.sp = 100; w.run.aw = 100;
  const sc0 = Q.log.scenes.length;
  Q.key('ult');
  Q.step(32);
  Q.key('ult', false);
  const pushed = Q.log.scenes.slice(sc0).some((s) => s[1] === 'push' && s[2] === 'awakenCutin');
  let seenDir = false;
  Q.until(() => { if (w.cutscene) seenDir = true; return seenDir && !w.cutscene && Q.top() === 'stage'; }, 900);
  Q.step(20);
  const dealt = hp0 - (b.dead ? 0 : b.hp);
  const cap = Q.AW.AWAKEN_DEBUG.cap ? { ...Q.AW.AWAKEN_DEBUG.cap } : null;
  if (boost > 0) delete p.dmgMul;
  return { cid, boost, pushed, hp0, hp1: b.hp, max, dealt, frac: max ? +(dealt / max).toFixed(4) : null, dead: !!b.dead, director: Q.AW.AWAKEN_DEBUG.last?.director ?? null, cap };
}

// A8: mocked pad — RT held 0.5 s awakens; axes[0] = 0.4 walks
async function pA8({ cid }) {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  Q.reset();
  Q.setClass(cid);
  w.transitioning = true;
  const B = p.ch.move.speed * p.speedMul;
  window.__padConnect(); Q.step(3);
  Q.reset(Q.fl.x0 + 30);
  window.__padAxes(0.4, 0);
  const v = [], gaits = new Set();
  Q.step(60, (i) => { if (i >= 30) { v.push(Math.abs(p.vx)); gaits.add(p.gait); } });
  const analogX = Q.input.analogX, mode = Q.input.mode;
  window.__padAxes(0, 0); Q.step(10);
  w.transitioning = false;
  Q.reset(Q.home.x, 6);
  const d = Q.dummy('skeleton', 150, {});
  Q.step(2);
  w.run.sp = 100; w.run.aw = 100;
  const sc0 = Q.log.scenes.length;
  window.__padSet(7, 1);
  let pushAt = null;
  Q.step(40, (i) => { if (pushAt == null && Q.top() === 'awakenCutin') pushAt = i + 1; });
  window.__padSet(7, 0);
  Q.until(() => Q.log.scenes.slice(sc0).some((s) => s[1] === 'pop' && s[2] === 'awakenCutin') && !w.cutscene && Q.top() === 'stage', 900);
  d.dead = true; Q.step(2);
  const avg = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  return { B, walkAvg: avg, gaits: [...gaits], analogX, mode, pushAt, pushed: pushAt != null };
}

// I1: window.__feelStats (feel §8, ?feelstats)
async function pI1() {
  const Q = window.__fq;
  Q.step(3); Q.render();
  const s = window.__feelStats;
  return { present: !!s && typeof s === 'object', keys: s && typeof s === 'object' ? Object.keys(s) : [] };
}

// ───────────────────────── companions (X1–X3) ─────────────────────────
async function pX1() {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  const out = {};
  Q.until(() => !!p.mount?.riding, 180);
  if (!p.mount?.riding) { p.mount?.debug?.summon?.(); w.companions?.debug?.summon?.(); Q.step(60); }
  out.riding = !!p.mount?.riding;
  out.mountId = p.mount?.def?.id ?? p.mount?.id ?? null;
  Q.release(); Q.step(10);
  p.x = Q.home.x; p.y = Q.fl.y - p.h - 1; p.vx = 0; p.facing = 1; Q.step(20);
  const d = Q.dummy('skeleton', 120, { facing: -1 });
  Q.step(2);
  const R0 = Math.random;
  Math.random = () => 0.99;   // no crits (a crit adds hitstop frames and knockback)
  try {
  // rider normal attacks
  const rows = [];
  for (let i = 0; i < 3; i++) {
    // put the dummy back in reach (the previous hit knocked it away) before each swing
    Q.until(() => d.onGround !== false, 60);
    d.x = p.cx + 120 - d.w / 2; d.vx = 0; p.facing = 1; Q.step(2);
    const n0 = Q.log.hits.length, c0 = w.combo?.n ?? 0, pts0 = w.style?.pts ?? 0;
    w.freezeLog.length = 0;
    Q.press('attack', 2);
    let r = null, whs = null;
    Q.step(40, () => { const h = Q.log.hits.slice(n0).find((x) => x.tid === d.__id && !x.tags.includes('guardian')); if (h && !r) { r = h; whs = w.hitstop; return false; } });
    rows.push({ hit: !!r, cls: r?.cls, tags: r?.tags, hs: r?.hs, worldHitstop: whs, comboDelta: (w.combo?.n ?? 0) - c0, stylePts: Math.round((w.style?.pts ?? 0) - pts0) });
    Q.step(24);
  }
  out.rider = rows;
  // mount charge (dash while riding)
  p.x = d.x - 220; p.facing = 1; Q.step(6);
  const n1 = Q.log.hits.length, c1 = w.combo?.n ?? 0;
  Q.key('right'); Q.press('dash', 2); Q.step(30); Q.key('right', false);
  const ch = Q.log.hits.slice(n1).filter((x) => x.tid === d.__id);
  out.charge = { hits: ch.length, tags: ch[0]?.tags ?? null, hs: ch[0]?.hs ?? null, comboDelta: (w.combo?.n ?? 0) - c1, stillRiding: !!p.mount?.riding };
  Q.step(40);
  } finally { Math.random = R0; }
  d.dead = true; Q.step(2);
  return out;
}
async function pX3({ cid }) {
  const Q = window.__fq, w = Q.w(), p = Q.p();
  Q.setClass(cid);
  p.mount?.dismount?.(w, p, 'debug'); Q.step(30);
  Q.reset();
  const gs = w.companions?.guards ?? w.companions?.guardians ?? [];
  const d = Q.dummy('skeleton', 200, { facing: -1, harmless: false });   // guardians never target harmless foes (guardian.js pickTarget)
  Q.step(2);
  // guardian auto attacks only (the hero idles): hitstop 0, no awakening gain, combo timer not refreshed
  w.run.aw = 10;
  const aw0 = w.run.aw, fl0 = w.freezeLog.length, n0 = Q.log.hits.length, e0 = Q.log.ev.length;
  let maxWorldHs = 0, refresh = 0, prevT = w.combo?.t ?? 0, prevN = w.combo?.n ?? 0;
  Q.step(360, () => {
    maxWorldHs = Math.max(maxWorldHs, w.hitstop);
    const t = w.combo?.t ?? 0, n = w.combo?.n ?? 0;
    const gHit = Q.log.hits.length && Q.log.hits[Q.log.hits.length - 1].s === Q.steps && Q.log.hits[Q.log.hits.length - 1].tags.includes('guardian');
    if (gHit && prevN > 0 && t > prevT + 1e-6) refresh++;
    prevT = t; prevN = n;
  });
  const gh = Q.log.hits.slice(n0).filter((h) => h.tags.includes('guardian'));
  const out = {
    guardians: Array.isArray(gs) ? gs.length : null, autoHits: gh.filter((h) => !h.tags.includes('assist')).length,
    autoHsMax: Math.max(0, ...gh.filter((h) => !h.tags.includes('assist')).map((h) => h.hs ?? 0)), maxWorldHs: +maxWorldHs.toFixed(3),
    freezeLogDelta: w.freezeLog.length - fl0, awDelta: +(w.run.aw - aw0).toFixed(3), comboRefreshByGuardian: refresh,
    rankUps: Q.log.ev.slice(e0).filter((e) => e[1] === 'styleRankUp').length, awPerRank: 1 + (p.stats?.ultGain ?? 0) / 200,
  };
  // assist: the hero's finisher calls a guardian assist (hitstop ≤ 0.03), the combo goes on
  p.x = d.x - 70 - p.w / 2; p.facing = 1; Q.step(4);
  const n1 = Q.log.hits.length;
  const ms = p.moveSet;
  p.startMove(w, ms.ground?.[3] ?? ms.charge, 'ground');
  Q.step(150);
  const hs = Q.log.hits.slice(n1);
  const as = hs.filter((h) => h.tags.includes('assist'));
  const finId = ms.ground?.[3]?.id ?? null;
  const fin = hs.find((h) => finId && h.moveId === finId) ?? hs.find((h) => !h.tags.includes('companion') && !h.tags.includes('guardian'));   // the hero's own finisher
  out.assist = { finisherCls: fin?.cls ?? null, finisherHs: fin?.hs ?? null, assists: as.length, assistHsMax: as.length ? Math.max(...as.map((h) => h.hs ?? 0)) : null, awDelta: +(w.run.aw - aw0).toFixed(3), move: finId, hits: hs.slice(0, 12).map((h) => [h.s, h.cls, h.hs, h.moveId, h.tags.join('/')]) };
  d.dead = true; Q.step(2);
  return out;
}

// ───────────────────────── mobile (A7, M3 touch, R183) ─────────────────────────
async function pHud() {
  const Q = window.__fq, w = Q.w(), g = Q.g;
  const L = Q.HL.hudLayout(w, g.viewW, g.viewH, undefined, { touch: true, boss: true });
  const combo = Q.rect(L.combo), boss = Q.rect(L.bossBar);
  return { combo, boss, overlap: Q.overlap(combo, boss), bossSlot: L.bossSlot ?? null, view: [g.viewW, g.viewH], mode: Q.input.mode };
}

// ───────────────────────── Node side: pages ─────────────────────────
const srv = await startServer();
const browser = await chromium.launch({ executablePath: CHROME, headless: !args.headed, args: ['--autoplay-policy=no-user-gesture-required'] });
const SETTINGS_KEY = 'bloodnocturne_settings';

async function openPage(key, url, { viewport = { width: 960, height: 540 }, mobile = false, quality = 'high', pad = false, extraSettings = {} } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!IGNORE_CONSOLE.test(t)) errs.push('CONSOLE ' + t.slice(0, 400)); } });
  await page.addInitScript(({ k, s }) => { try { localStorage.setItem(k, JSON.stringify(s)); } catch { /* 무시 */ } }, { k: SETTINGS_KEY, s: { settingsVersion: 2, quality, cutinMode: 'full', flashFx: 1, showDamage: true, autoSprint: false, musicVol: 0, sfxVol: 0.2, ...extraSettings } });
  if (pad) { const f = fakePadInit({ connected: false }); await page.addInitScript(f.fn, f.arg); }
  const full = `${srv.origin}/${url}${url.includes('?') ? '&' : '?'}nosw`;
  const P = { key, page, ctx, errs, url: full, t0: Date.now() };
  try {
    await page.goto(full, { timeout: 90000 });
    // scenesReady: two-phase boot (R1-REQ-229, request #426) — ?scene=stage already waits for the lazy scenes in main.js, kept explicit
    await page.waitForFunction(() => { const g = window.__game; return !!g?.world?.player && g.top?.name === 'stage' && !(g.fade?.dir) && g.scenesReady !== false; }, null, { timeout: 120000, polling: 250 });
    await page.waitForTimeout(1500);   // first assets (puppet, cut-in preload) settle
    const ok = await page.evaluate(pageLib);
    if (ok !== 'ok') throw new Error('page library failed: ' + ok);
    await page.evaluate(() => window.__fq.pause());
    // main-thread CPU time (CDP Performance.getMetrics ThreadTime) for the frame-cost ratios: unlike wall time it does not
    // grow while the renderer waits for a core, so a CPU-time ratio over budget is a real regression even on a loaded machine
    try { P.cdp = await ctx.newCDPSession(page); await P.cdp.send('Performance.enable', { timeDomain: 'threadTicks' }); } catch { P.cdp = null; }
  } catch (e) {
    P.fatal = String(e?.message || e);
    errs.push('HARNESS ' + P.fatal);
  }
  return P;
}
async function closePage(P) {
  try { const extra = await P.page.evaluate(() => window.__fq?.errs ?? []); for (const e of extra) P.errs.push('TICK ' + e); } catch { /* page gone */ }
  report.pages.push({ key: P.key, url: P.url, seconds: Math.round((Date.now() - P.t0) / 1000), errors: P.errs.length, fatal: P.fatal ?? null });
  for (const e of P.errs) report.errors.push({ page: P.key, error: e });
  if (P.errs.length) console.log(`[${elapsed()}] page ${P.key}: ${P.errs.length} error(s)\n   ` + P.errs.slice(0, 5).join('\n   '));
  await P.ctx.close().catch(() => {});
  saveReport();
}
async function run(P, id, ctx, fn, arg, judge) {
  if (P.fatal) { rec(id, ctx, 'error', 'page did not start: ' + P.fatal); return null; }
  const e0 = P.errs.length;
  try {
    const r = await P.page.evaluate(fn, arg ?? {});
    if (r?.error) { rec(id, ctx, 'error', r.error, r); return r; }
    if (judge) judge(r);
    return r;
  } catch (e) {
    rec(id, ctx, 'error', 'exception: ' + String(e?.message || e).split('\n')[0].slice(0, 300));
    return null;
  } finally {
    // feel §10: every case must also report zero page or console errors — pin them on the check that was running
    if (P.errs.length > e0) rec(id, ctx, 'error', `${P.errs.length - e0} page/console error(s) during this check: ${P.errs.slice(e0, e0 + 2).join(' · ').slice(0, 400)}`, { errors: P.errs.slice(e0) });
  }
}
/** { cpu: main-thread CPU seconds (null without CDP), fn: rendered frames so far } — CPU per frame between two marks = Δcpu / Δfn */
async function mark(P) {
  let cpu = null;
  try { const m = await P.cdp?.send('Performance.getMetrics'); cpu = m?.metrics?.find((x) => x.name === 'ThreadTime')?.value ?? null; } catch { /* no CDP */ }
  const fn = await P.page.evaluate(() => window.__fq?.fn ?? 0).catch(() => 0);
  return { cpu, fn };
}
/** CPU ms per rendered frame over one or more [from, to] mark pairs (null when a mark has no CPU value or no frame was rendered) */
function cpuPerFrame(...spans) {
  let c = 0, n = 0;
  for (const [a, b] of spans) { if (a?.cpu == null || b?.cpu == null) return null; c += b.cpu - a.cpu; n += b.fn - a.fn; }
  return n > 0 ? round((c * 1000) / n, 2) : null;
}
/**
 * feel §8 "Headless relative checks" (round 2 lead decision): ultimate or awakening avg ≤ 1.8× the gameplay avg (main-thread CPU
 * ratio ≤ 1.8× as well), p95 ≤ 3.0× the gameplay median, absolute guard avg ≤ 12 ms; sprint at SSS avg ≤ 1.5× the idle-walk avg
 * (CPU ratio ≤ 1.5×), absolute guard avg ≤ 10 ms. max ≤ 250 ms for both.
 */
const U2_ULT = { k: 1.8, p95K: 3.0, absMs: 12 };
const U2_SPRINT = { k: 1.5, p95K: null, absMs: 10 };
/**
 * feel §8 headless ratio: wall-time avg ≤ k·baseline avg and ≤ absMs (absolute guard), p95 ≤ p95K·baseline median, max ≤ 250 ms,
 * plus the same avg ratio on main-thread CPU time. A wall-time average miss that the CPU time confirms (ratio: CPU ratio also
 * over k; absolute guard: CPU ms/frame also over absMs) is a 'fail' at any machine load (CPU time does not grow while the
 * renderer waits for a core); any other miss is load-gated (timingStatus).
 */
function ratioStatus({ u, b, cu, cb, k = U2_ULT.k, p95K = U2_ULT.p95K, maxMs = 250, absMs = U2_ULT.absMs }) {
  const ratioOk = u.avg <= k * b.avg, absOk = absMs == null || u.avg <= absMs;
  const wallAvgOk = ratioOk && absOk;
  const wallOk = wallAvgOk && (p95K == null || u.p95 <= p95K * b.med) && (maxMs == null || u.max <= maxMs);
  const cpuRatio = cu != null && cb > 0 ? round(cu / cb, 2) : null;
  const cpuOk = cpuRatio == null ? null : cpuRatio <= k;
  const confirmed = (!ratioOk && cpuOk === false) || (!absOk && cu != null && cu > absMs);
  // contention of these very frames: wall time well above their main-thread CPU time means the renderer sat waiting for a core
  // (unhindered frames run at wall ≈ CPU). The 1-minute load average lags, so a wall-only miss (p95, max, or avg with the CPU
  // ratio in budget) on starved frames is 'inconclusive' whatever the load average says
  const contention = cu != null && cu > 0 ? round(u.avg / cu, 2) : null;
  const starved = contention != null && contention > 1.3;
  const status = wallOk && cpuOk !== false ? 'pass' : confirmed ? 'fail' : starved ? 'inconclusive' : timingStatus(false);
  return { status, wallOk, cpuOk, cpuRatio, confirmed, contention, starved };
}
/** detail suffix for ratioStatus */
const ratioNote = (v) => (v.confirmed ? ' → wall and CPU averages both over budget: fails at any machine load'
  : v.starved && v.status !== 'pass' ? ` → wall-time miss only, and these frames took ${v.contention}× their main-thread CPU time (renderer waiting for a core): inconclusive` : '');
async function shot(P, name, note) {
  const f = path.join(SHOTS, name + '.png');
  try { await P.page.screenshot({ path: f }); report.shots.push({ file: f, note }); } catch (e) { report.shots.push({ file: null, note: note + ' (screenshot failed: ' + e.message + ')' }); }
  return f;
}

// ───────────────────────── hero suite ─────────────────────────
/** checks that run on one fixed hero's page whatever --heroes says: C1, C3–C15, A8 and I1 on kael, C2 on lia */
const KAEL_ONLY = ALL_IDS.filter((id) => (id[0] === 'C' && id !== 'C2') || id === 'A8' || id === 'I1');
async function heroSuite(hero, { onlyIds = null } = {}) {
  const [c0, c1, c2] = CLASS_PICK[hero];
  const want = onlyIds ? (id) => onlyIds.includes(id) && WANT(id) : WANT, wantAny = (...ids) => ids.some(want);
  const needPage = wantAny('M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'U1', 'U2', 'A1', 'A2', 'A3', 'A4', 'A6', 'V1') || (hero === 'kael' && (ALL_IDS.some((id) => id[0] === 'C' && id !== 'C2' && want(id)) || wantAny('A8', 'I1'))) || (hero === 'lia' && want('C2'));
  if (!needPage) return;
  const P = await openPage('hero_' + hero, `index.html?scene=stage&stage=s04&char=${hero}${hero === 'kael' ? '&feelstats' : ''}`, { pad: true });
  const ctx = { hero };
  if (!P.fatal) {
    const s = await P.page.evaluate(() => window.__fq.setup({ transitioning: false }));
    console.log(`[${elapsed()}] ${hero}: floor ${s.floor.x0}–${s.floor.x1} (${s.floor.tiles} tiles) y ${s.floor.y}, view ${s.view.join('×')}, quality ${s.quality}, fx ${s.fxq}`);
    report.pages.push({ key: 'setup_' + hero, setup: s });
  }
  // ── movement ──
  if (want('M1')) await run(P, 'M1', ctx, pM1, { hero }, (r) => {
    const okRun = Math.abs(r.maxV - r.B) <= 2 && Math.abs(r.B - BASE.run[hero]) <= 2 && !r.sprintSeen;
    const okApex = Math.abs(r.apex - BASE.apex[hero]) <= 4, okDash = Math.abs(r.dash - BASE.dash[hero]) <= 6;
    rec('M1', ctx, okRun && okApex && okDash ? 'pass' : 'fail', `run max ${round(r.maxV)} (B ${round(r.B)}, today ${BASE.run[hero]}), apex ${round(r.apex)} px (today ${BASE.apex[hero]} ±4), dash ${round(r.dash)} px (today ${BASE.dash[hero]} ±6)${r.sprintSeen ? ', sprint engaged by a plain hold' : ''}`, r);
  });
  if (want('M2')) await run(P, 'M2', ctx, pM2, { raw: 0.52 }, (r) => {
    const ok = Math.abs(r.avg - 0.5 * r.B) <= 3 && Math.abs(r.max - 0.5 * r.B) <= 3 && r.gaits.length === 1 && r.gaits[0] === 'walk' && r.anims.length === 1 && r.anims[0] === 'walk';
    rec('M2', ctx, ok ? 'pass' : 'fail', `analog ${round(r.analogX, 2)} (${r.mode}): steady |vx| ${round(r.avg)}–${round(r.max)} vs 0.5·B ${round(0.5 * r.B)} ±3, gait ${r.gaits.join('/')}, anim ${r.anims.join('/')}`, r);
  });
  if (want('M3')) await run(P, 'M3', ctx, pM3, { hero }, (r) => {
    const okTap = r.tap.reachSteps > 0 && r.tap.reachSteps <= 15 && r.tap.maxV <= r.kB + 3;
    const okChain = r.chain.reachSteps > 0 && r.chain.reachSteps <= 15 && r.chain.maxV <= r.kB + 3;
    const okLate = !r.late.sprinted;
    rec('M3', ctx, okTap && okChain && okLate ? 'pass' : 'fail', `k·B ${round(r.kB)}: double tap ${r.tap.reachT ?? 'never'} s (max ${round(r.tap.maxV)}), dash chain ${r.chain.reachT ?? 'never'} s (dash exit ${round(r.chain.exitV)}, max after ${round(r.chain.maxV)}), late tap sprinted=${r.late.sprinted}`, r);
  });
  if (want('M4')) await run(P, 'M4', ctx, pM4, { hero }, (r) => {
    const okRun = r.run.slide >= 17 && r.run.slide <= 26 && r.run.skidT >= 0.14 && r.run.skidT <= 0.24;
    const okSpr = r.sprint.wasSprint && r.sprint.slide >= 30 && r.sprint.slide <= 44 && r.sprint.skidT >= 0.14 && r.sprint.skidT <= 0.24;
    const okEdge = r.edge.reached && r.edge.onGround && !r.edge.fell && r.edge.dist >= 0 && r.edge.dist <= 6;
    rec('M4', ctx, okRun && okSpr && okEdge ? 'pass' : 'fail', `run slide ${r.run.slide} px / skid ${r.run.skidT} s (17–26, 0.14–0.24), sprint slide ${r.sprint.slide} px / skid ${r.sprint.skidT} s (30–44)${r.sprint.wasSprint ? '' : ' [no sprint]'}, edge stop ${r.edge.dist} px from the ledge, onGround ${r.edge.onGround}${r.edge.fell ? ', FELL' : ''}`, r);
  });
  if (want('M5')) await run(P, 'M5', ctx, pM5, { hero }, (r) => {
    const ok = r.rate != null && Math.abs(r.rate - r.expected) <= 0.2 && r.phMax != null && r.phMax < 0.2 && r.legacyFootstep === 0 && r.stepT === undefined && r.stepSfx > 0;
    rec('M5', ctx, ok ? 'pass' : 'fail', `${round(r.rate, 2)} steps/s vs 4.2×${r.cad} = ${round(r.expected, 2)} ±0.2 over ${r.events} events, max phase error ${round(r.phMax, 3)} rad (< 0.2), step SFX ${r.stepSfx} (${r.surfaces.join('/')}), legacy footstep ${r.legacyFootstep}, p.stepT ${r.stepT === undefined ? 'gone' : r.stepT}`, r);
  });
  if (want('M6')) await run(P, 'M6', ctx, pM6, { hero }, (r) => {
    const okTake = r.jump.sqTake >= 1.12, okLand = r.jump.sqLand <= 0.86 && !r.jump.heavy;
    const okHop = r.hop.landed && !r.hop.heavy;
    const okFall = r.fall.skipped ? null : r.fall.landed && r.fall.heavy && r.fall.sqLand <= 0.76;
    const st = okTake && okLand && okHop && okFall !== false ? (okFall === null ? 'inconclusive' : 'pass') : 'fail';
    rec('M6', ctx, st, `takeoff sq ${round(r.jump.sqTake, 3)} (≥ 1.12), landing sq ${round(r.jump.sqLand, 3)} (≤ 0.86)${r.jump.heavy ? ' HEAVY' : ''}, 1-tile drop heavy=${r.hop.heavy}, 5-tile fall ${r.fall.skipped ? 'no headroom (' + r.fall.headroom + ' tiles)' : `land_heavy=${r.fall.heavy} sq ${round(r.fall.sqLand, 3)} (≤ 0.76)`}`, r);
  });
  // ── combat (kael page; C2 on lia) ──
  if (hero === 'kael') {
    if (wantAny('C1', 'C3')) await run(P, 'C1', ctx, pC1C3, {}, (r) => {
      if (want('C1')) {
        const bad = r.rows.filter((x) => !(x.cls === x.want && x.worldHitstop != null && Math.abs(x.worldHitstop - x.expected) <= 1 / 60 + 1e-3));
        rec('C1', ctx, bad.length ? 'fail' : 'pass', r.rows.map((x) => `${x.want}:${x.moveId}→${x.cls ?? '-'} ${round(x.worldHitstop, 3)}/${round(x.expected, 3)}`).join(', '), r.rows);
      }
      if (want('C3')) rec('C3', ctx, r.bloom && r.bloom.frozenAfter2 && r.bloom.avgDisp > 0 ? 'pass' : 'fail', r.bloom ? `F freeze ${round(r.bloom.hitstop, 3)} s: ${r.bloom.n} particles moved ${round(r.bloom.avgDisp, 2)} px on average in 2 frozen steps` : 'no F hit', r.bloom);
    });
    if (want('C4')) await run(P, 'C4', ctx, pC4, {}, (r) => rec('C4', ctx, r.chained ? 'pass' : 'fail', `attack pressed 0.05 s into a 0.25 s freeze: moves seen after ${r.first} = ${r.seen.join(', ') || 'none'}`, r));
    if (want('C5')) await run(P, 'C5', ctx, pC5, {}, (r) => {
      const okL = r.launch.apex >= 240 && r.launch.air >= 1.1;
      const okG = r.guard.firstGuardAt === 15 && Math.abs((r.guard.gravAfter ?? 0) - 1.3) < 0.01;
      rec('C5', ctx, okL && okG ? 'pass' : 'fail', `whipUp (${r.launch.launcherCls}) apex ${r.launch.apex} px (≥ 240), air ${r.launch.air} s (≥ 1.1); '가드!' on airborne hit #${r.guard.firstGuardAt ?? 'never'} (want 15), gravity ×${r.guard.gravAfter}`, r);
    });
    if (want('C6')) await run(P, 'C6', ctx, pC6, {}, (r) => {
      const ok = r.landed && r.downAtLanding > 0 && r.otg.otg1 === 1 && r.otg.wakeInvAfter2 > 0 && r.otg.otgCallout && r.otg.third.dmg === 0;
      rec('C6', ctx, ok ? 'pass' : 'fail', `down ${r.downAtLanding} s on landing, OTG ${r.otg.otg1}→${r.otg.otg2}, wakeInv ${r.otg.wakeInvAfter2} s, callout ${r.otg.otgCallout}, 3rd hit during wake-up dmg ${r.otg.third.dmg}`, r);
    });
    if (want('C7')) await run(P, 'C7', ctx, pC7, {}, (r) => rec('C7', ctx, r.flipped && r.bounces1 === 1 && r.bounces2 === 1 && r.airborne2 ? 'pass' : 'fail', `F greatsword hit into a wall: max vx ${r.maxVx}, vx flipped ${r.flipped}, '벽 바운드!' ×${r.bounces1}; 2nd F hit into the wall in the same juggle (airborne ${r.airborne2}, vx ${r.vx2}) → total ×${r.bounces2}`, r));
    if (want('C8')) await run(P, 'C8', ctx, pC8, {}, (r) => rec('C8', ctx, r.airborne && r.landed && r.minVyAfter < 0 && r.maxDownAfter === 0 && r.callout ? 'pass' : 'fail', `air down hit (whipA2) on an airborne zombie: slam vy ${r.slamVy}, after landing vy ${r.vyAfterLanding} (min ${r.minVyAfter}), down ${r.maxDownAfter}, '바닥 바운드!' ${r.callout}`, r));
    if (want('C9')) await run(P, 'C9', ctx, pC9, {}, (r) => {
      const ok = !r.armor.airborne && r.armor.rise <= 1 && r.golem.hitsToStagger >= 11 && r.golem.hitsToStagger <= 14 && r.pillar.dx === 0 && r.pillar.dy === 0;
      rec('C9', ctx, ok ? 'pass' : 'fail', `armor_knight (${r.armor.wclass}) rise ${r.armor.rise} px airborne=${r.armor.airborne}; gear_golem (${r.golem.wclass}) staggered after ${r.golem.hitsToStagger ?? 'never'} L hits (≈12); bone_pillar (${r.pillar.wclass}) moved ${r.pillar.dx},${r.pillar.dy}`, r);
    });
    if (want('C10')) await run(P, 'C10', ctx, pC10, {}, (r) => {
      const ok = r.counter.flag && !r.counter.plainFlag && r.counter.callout && Math.abs(r.counter.ratio - 1.25) <= 0.0625 && r.back.flag && r.back.callout;
      rec('C10', ctx, ok ? 'pass' : 'fail', `counter ×${r.counter.ratio} (${r.counter.plainDmg}→${r.counter.counterDmg}), flag ${r.counter.flag}, 'COUNTER' ${r.counter.callout}; back attack flag ${r.back.flag}, 'BACK ATTACK' ${r.back.callout}`, r);
    });
    if (want('C11')) await run(P, 'C11', ctx, pC11, { mats: Object.entries(MATERIAL_ENEMY) }, (r) => {
      const bad = r.rows.filter((x) => !(MATERIAL_PRESET[x.mat].some((t) => (x.emits?.[t] ?? 0) >= 1) && x.addedNoUi <= r.perHit && x.defMat === x.mat));
      rec('C11', ctx, bad.length ? 'fail' : 'pass', r.rows.map((x) => `${x.mat}(${x.id}${x.defMat !== x.mat ? '≠' + x.defMat : ''}) ${MATERIAL_PRESET[x.mat].map((t) => t + '×' + (x.emits?.[t] ?? 0)).join('+')} total ${x.addedNoUi}`).join('; ') + ` — budget ${r.perHit}/hit (${r.quality})`, r);
    });
    if (want('C12')) await run(P, 'C12', ctx, pC12, {}, (r) => {
      const stacked = r.column.numbers >= 8 && r.column.rises.slice(0, 7).every((d) => Math.abs(d - 16) <= 1);
      const ok = stacked && r.column.totals === 1 && r.cap.maxLive <= r.cap.cap && r.off.numbers === 0;
      rec('C12', ctx, ok ? 'pass' : 'fail', `10 hits → ${r.column.numbers} numbers rising by ${r.column.rises.join('/')} px, '합계' ×${r.column.totals}; live max ${r.cap.maxLive} (≤ ${r.cap.cap}); showDamage off → ${r.off.numbers}`, r);
    });
    if (want('C13')) await run(P, 'C13', ctx, pC13, {}, (r) => {
      const ok = r.first.killed === 3 && r.first.slow > 0 && r.first.scale === 0.25 && r.second.killed === 3 && r.second.pre.killSlowT > 0 && r.second.slow === 0 && r.third.killed === 3 && r.third.slow > 0;
      rec('C13', ctx, ok ? 'pass' : 'fail', `last of 3 killed → slowmo ${r.first.slow} s at ×${r.first.scale}; a second trigger ${r.gap} s later (${r.second.killed}/3 killed, gap timer ${r.second.pre.killSlowT} s left) → slowmo ${r.second.slow}; after the gap a third → slowmo ${r.third.slow} (${r.third.killed}/3 killed)`, r);
    });
    if (want('C14')) await run(P, 'C14', ctx, pC14, {}, (r) => {
      const ok = r.varied.maxRank >= 3 && r.varied.words.includes('GREAT!') && r.spam.maxRank <= 2 && r.hurt.after === r.hurt.before - 1;
      rec('C14', ctx, ok ? 'pass' : 'fail', `varied combo → rank ${r.varied.letter} (max ${r.varied.maxRank}), announcer ${r.varied.words.join(', ') || 'none'}; one move spammed → max ${r.spam.letter}; hit taken ${r.hurt.before}→${r.hurt.after}`, r);
    });
    if (want('C15')) await run(P, 'C15', ctx, pC15, {}, (r) => {
      const ok = r.values[0] <= 0.7 + 1e-9 && r.values.every((v) => v <= 0.7 + 1e-9) && r.values.slice(2).every((v) => v <= 0.3 + 1e-9) && r.off === 0;
      rec('C15', ctx, ok ? 'pass' : 'fail', `5 flashes at 1.0 within 1 s → ${r.values.join(', ')} (cap 0.7, later ≤ 0.3); flashFx 0 → ${r.off}`, r);
    });
    if (want('I1')) await run(P, 'I1', ctx, pI1, {}, (r) => rec('I1', ctx, r.present && ['particles', 'dmgNums', 'ghosts', 'gradients', 'heroDraws', 'sfxStarts'].every((k) => r.keys.includes(k)) ? 'pass' : 'fail', r.present ? `window.__feelStats keys: ${r.keys.join(', ')}` : 'window.__feelStats is not defined with ?feelstats (feel §8 instrumentation missing)', r));
  }
  if (hero === 'lia' && want('C2')) await run(P, 'C2', ctx, pC2, {}, (r) => rec('C2', ctx, r.perSec.every((n) => n >= 3) && r.targets === 3 && r.worstWindow <= 0.40 + 1 / 60 + 1e-6 ? 'pass' : 'fail', `lia mashing on 3 dummies 3 s: ${r.hits} hits on ${r.targets}/3 targets (${r.perSec.join('/')} per second, ≥ 3 each), frozen ${round(r.frozenTotal, 2)} s total, worst 1 s window ${round(r.worstWindow, 3)} s (≤ 0.40)`, r));
  // ── ultimates ──
  let gameplay = null;   // U2 gameplay baseline of this page: { b: wall-time stats, cb: CPU ms per frame }
  if (wantAny('U1', 'U2', 'V1')) {
    for (const [i, cid] of [c0, c1, c2].entries()) {
      if (i < 2 && !want('U1')) continue;
      const measure = i === 2 && want('U2');
      const capture = i === 2 && want('V1');
      let r, m0, m1, m2, m3, m4, m5, base = null;
      if (measure) {
        // separate evaluates so the main-thread CPU marks bracket only rendered frames (setup and screenshots stay outside)
        if (!(await run(P, 'U1', { hero, variant: cid }, pUltSetup, { cid }))) continue;
        m0 = await mark(P); base = (await run(P, 'U2', { hero, variant: cid }, pBaseline, { n: 90 }))?.base ?? null; m1 = await mark(P);
        await P.page.evaluate(() => { const Q = window.__fq; Q.release(); Q.step(20); Q.reset(Q.home.x, 4); }).catch(() => {});
        m2 = await mark(P);
        r = await run(P, 'U1', { hero, variant: cid }, pUlt, { cid, measure, captureFinal: capture, setup: false });
        m3 = await mark(P);
      } else r = await run(P, 'U1', { hero, variant: cid }, pUlt, { cid, measure, captureFinal: capture });
      if (!r) continue;
      let fin = null;
      if (r.paused) {
        await shot(P, `ult_final_${hero}_960`, `${hero} ${cid} ultimate final frame, vw 960`);
        if (measure) m4 = await mark(P);
        fin = await P.page.evaluate(pUltFinish, { measureFrames: measure }).catch((e) => ({ error: e.message }));
        if (measure) m5 = await mark(P);
        if (fin?.frames && r.frames) r.frames.push(...fin.frames);
        if (fin) r.peak = Math.max(r.peak, fin.peak ?? 0);
      }
      const after = await P.page.evaluate(pUltAfter).catch((e) => ({ error: e.message }));
      // world-time duration (baseline method, feel §1): last world.time with cutscene set − world.time at the press
      const tLast = r.paused ? (fin?.tLast ?? r.tLast) : r.tLast;
      const dur = r.tStart != null && tLast != null ? +(tLast - r.tStart).toFixed(3) : null;
      if (want('U1')) {
        const durOk = dur != null && Math.abs(dur - BASE.ult[hero]) <= BASE.ult[hero] * 0.1;
        const ok = r.cast && r.started && durOk && after.overlays === 0 && after.letterbox === 0 && !after.hudHidden && Math.abs(after.zoom - 1) <= 0.01 && r.peak <= 600;
        rec('U1', { hero, variant: cid }, ok ? 'pass' : 'fail', `tier ${r.tier}: cutscene ${dur} s world time (today ${BASE.ult[hero]} ±10%), peak particles ${r.peak} (≤ 600), afterwards overlays ${after.overlays}, letterbox ${after.letterbox}, hud hidden ${after.hudHidden}, zoom ${after.zoom}, classes ${r.classes.join('')}, cut-ins ${r.cutins.join('/')}`, { ...r, frames: undefined, dur, after, fin: fin ? { ...fin, frames: undefined } : null });
      }
      if (measure && base?.length && r.frames?.length) {
        const b = stats(base), u = stats(r.frames);
        const cb = cpuPerFrame([m0, m1]), cu = r.paused ? cpuPerFrame([m2, m3], [m4, m5]) : cpuPerFrame([m2, m3]);
        gameplay = { b, cb };
        const v = ratioStatus({ u, b, cu, cb });
        const slow = await P.page.evaluate(() => window.__fq.slow.splice(0)).catch(() => []);
        rec('U2', { hero, variant: cid }, v.status, `gameplay avg ${b.avg} ms (med ${b.med}), ultimate avg ${u.avg} ms (≤ ×${U2_ULT.k} = ${round(U2_ULT.k * b.avg)}, ≤ ${U2_ULT.absMs} abs), p95 ${u.p95} (≤ ×${U2_ULT.p95K} med = ${round(U2_ULT.p95K * b.med)}), max ${u.max} (≤ 250); main-thread CPU ${cu ?? '?'} vs ${cb ?? '?'} ms/frame = ×${v.cpuRatio ?? '?'} (≤ ${U2_ULT.k})${ratioNote(v)}; cast at x ${r.at?.px} (camera x ${r.at?.camX}), load ${round(os.loadavg()[0])}`, { base: b, ult: u, cpu: { base: cb, ult: cu, ratio: v.cpuRatio, contention: v.contention }, at: r.at, slow: slow.slice(0, 40) });
      }
    }
  }
  // ── awakening ──
  if (wantAny('A1')) await run(P, 'A1', ctx, pA1, { cid: c0 }, (r) => {
    const ok = r.tier === 0 && r.castStep != null && r.castStep <= 2 && !r.pushes.includes('awakenCutin') && !r.awakenCast;
    rec('A1', ctx, ok ? 'pass' : 'fail', `tier ${r.tier} with aw 100 / sp 100: ultimate cast ${r.castStep ?? 'never'} step(s) after the press, held 0.6 s; scenes ${r.pushes.join('/') || 'none'}; awakening ${r.awakenCast}`, r);
  });
  if (wantAny('A2', 'A3', 'A4', 'A6', 'V1', 'U2')) {
    const r2 = await run(P, 'A2', ctx, pA2, { cid: c1 }, null);
    const art = await run(P, 'A3', ctx, pCutinReady, {}, null);   // cut-in CG ready before the first awakening (see pCutinReady)
    const awRatio = want('U2') && gameplay != null;   // feel §8: 'ultimate or awakening' average vs the gameplay baseline above
    const mA0 = await mark(P);
    const st = await run(P, 'A2', ctx, pAwakenStart, { key: 'ult', render: wantAny('A6', 'V1') || awRatio, holdSteps: 30, until: 0.8 }, null);
    const mA1 = await mark(P);
    if (st?.info && want('V1')) await shot(P, `cutin_${hero}_960`, `${hero} ${c1} cut-in at t = ${st.sceneT} s, vw 960`);
    const mA2 = await mark(P);
    const fin = st ? await run(P, 'A4', ctx, pAwakenFinish, { render: want('A6') || awRatio }, null) : null;
    const mA3 = await mark(P);
    await P.page.evaluate(pAwakenCleanup).catch(() => {});
    if (awRatio && fin?.frames?.length && st?.info) {
      // the hold frames before the push are gameplay frames: drop their CPU at the gameplay rate
      const nAll = mA1.fn - mA0.fn + mA3.fn - mA2.fn, nDrop = Math.max(0, nAll - fin.frames.length);
      const cAll = mA0.cpu != null && mA1.cpu != null && mA2.cpu != null && mA3.cpu != null ? (mA1.cpu - mA0.cpu + mA3.cpu - mA2.cpu) * 1000 : null;
      const cu = cAll != null && gameplay.cb != null ? round((cAll - nDrop * gameplay.cb) / fin.frames.length, 2) : null;
      const b = gameplay.b, u = stats(fin.frames);
      const v = ratioStatus({ u, b, cu, cb: gameplay.cb });
      rec('U2', { hero, variant: 'awakening ' + c1 }, v.status, `first awakening (cut-in + director, ${u.n} frames): avg ${u.avg} ms (≤ ×${U2_ULT.k} = ${round(U2_ULT.k * b.avg)}, ≤ ${U2_ULT.absMs} abs), p95 ${u.p95} (≤ ×${U2_ULT.p95K} med = ${round(U2_ULT.p95K * b.med)}), max ${u.max} (≤ 250) vs gameplay avg ${b.avg} (med ${b.med}); main-thread CPU ${cu ?? '?'} vs ${gameplay.cb ?? '?'} ms/frame = ×${v.cpuRatio ?? '?'} (≤ ${U2_ULT.k})${ratioNote(v)}; load ${round(os.loadavg()[0])}`, { base: b, awaken: u, cpu: { base: gameplay.cb, awaken: cu, ratio: v.cpuRatio, contention: v.contention, holdFrames: nDrop } });
    }
    if (r2 && st && want('A2')) {
      const okTap = !r2.tap.castBeforeRelease && r2.tap.castAfterRelease != null && r2.tap.castAfterRelease <= 2 && !r2.tap.awakenCast && !r2.tap.pushes.includes('awakenCutin');
      const okCancel = r2.cancel.casts === 0 && r2.cancel.pushes === 0 && r2.cancel.sp === 100 && r2.cancel.aw === 100;
      const okHold = st.pushAt != null && st.pushAt <= 30 && st.spAfterCast === 0 && st.awAfterCast === 0;
      rec('A2', ctx, okTap && okCancel && okHold ? 'pass' : 'fail', `tier ${r2.tier}: tap 0.1 s → ultimate ${r2.tap.castBeforeRelease ? 'BEFORE' : r2.tap.castAfterRelease + ' step(s) after'} release; hold 0.3 s → ${r2.cancel.casts} casts, sp ${r2.cancel.sp} aw ${r2.cancel.aw}; hold 0.5 s → awakenCutin at step ${st.pushAt}, gauges ${st.spAfterCast}/${st.awAfterCast}`, { tap: r2.tap, cancel: r2.cancel, hold: { pushAt: st.pushAt, sp: st.spAfterCast, aw: st.awAfterCast } });
    }
    if (st && fin && want('A3')) {
      const okT = fin.popT != null && Math.abs(fin.popT - 1.45) <= 0.05;
      const okText = st.info?.renderedText === st.line;
      const okImg = st.info && (st.info.loaded || st.info.fallback);
      rec('A3', { hero, variant: 'full' }, okT && okText && okImg ? 'pass' : 'fail', `cut-in popped at ${fin.popT} s (1.45 ±0.05), text ${okText ? 'equals AWAKEN.line' : `'${st.info?.renderedText}' ≠ '${st.line}'`}, image ${st.info?.loaded ? 'cg loaded' : st.info?.fallback ? 'portrait fallback' : 'missing'} (${st.info?.imgW}px; ${art?.loaded ? `art ready after a ${art.loadMs} ms wait` : `art ${art?.cutin ?? '?'} NOT loaded after a ${art?.loadMs ?? '?'} ms wait`})`, { info: st.info, popT: fin.popT, art });
    }
    if (fin && want('A4')) {
      const ok = fin.done && !fin.cutscene && !fin.freezeEnemies && !fin.hudHidden && fin.letterbox === 0 && fin.dmg.some((d) => d > 0) && fin.director === 'hero' && fin.freezeSeen && fin.peak <= 700;
      rec('A4', { hero, variant: c1 }, ok ? 'pass' : 'fail', `director ${fin.director} (${fin.why}) ${fin.dirT} s, cutscene ${fin.cutscene}, freezeEnemies ${fin.freezeEnemies} (held during: ${fin.freezeSeen}), hudHidden ${fin.hudHidden}, dummy damage ${fin.dmg.map((d) => Math.round(d)).join('/')}, peak particles ${fin.peak} (≤ 700)`, { ...fin, frames: undefined });
    }
    if (fin && want('A6') && fin.frames?.length) {
      const f = stats(fin.frames);
      rec('A6', ctx, timingStatus(f.max <= 250), `first awakening of the session: ${f.n} frames (step + render), avg ${f.avg} ms, p95 ${f.p95}, max ${f.max} ms (≤ 250), load ${round(os.loadavg()[0])}`, f);
    }
    // second awakening: tier 2 (진 각성) via the 'awaken' key → short cut-in
    if (wantAny('A3', 'A4')) {
      const s2 = await run(P, 'A3', { hero, variant: 'short' }, pAwakenStart, { cid: c2, key: 'awaken', render: false, until: 9 }, null);
      const f2 = s2 ? await run(P, 'A4', { hero, variant: c2 }, pAwakenFinish, { render: false }, null) : null;
      await P.page.evaluate(pAwakenCleanup).catch(() => {});
      if (s2 && f2 && want('A3')) rec('A3', { hero, variant: 'short' }, s2.info?.short && f2.popT != null && Math.abs(f2.popT - 0.75) <= 0.05 ? 'pass' : 'fail', `'awaken' key at tier ${s2.tier}: cut-in pushed at step ${s2.pushAt}, short=${s2.info?.short}, popped at ${f2.popT} s (0.75 ±0.05)`, { info: s2.info, popT: f2.popT });
      if (f2 && want('A4')) {
        const ok = f2.done && !f2.cutscene && !f2.freezeEnemies && !f2.hudHidden && f2.dmg.some((d) => d > 0) && f2.director === 'hero' && f2.peak <= 700;
        rec('A4', { hero, variant: c2 }, ok ? 'pass' : 'fail', `진 각성 director ${f2.director} (${f2.why}) ${f2.dirT} s, cutscene ${f2.cutscene}, freezeEnemies ${f2.freezeEnemies}, dummy damage ${f2.dmg.map((d) => Math.round(d)).join('/')}, peak ${f2.peak}`, { ...f2, frames: undefined });
      }
    }
  }
  if (hero === 'kael' && want('A8')) await run(P, 'A8', ctx, pA8, { cid: c1 }, (r) => {
    const ok = r.pushed && r.pushAt <= 34 && r.gaits.length === 1 && r.gaits[0] === 'walk' && Math.abs(r.walkAvg - 0.5 * r.B) <= 3;
    rec('A8', ctx, ok ? 'pass' : 'fail', `mocked pad: RT held → awakenCutin at step ${r.pushAt ?? 'never'} (≈ 27–30); axes[0] 0.4 → analog ${round(r.analogX, 2)}, gait ${r.gaits.join('/')}, |vx| ${round(r.walkAvg)} (0.5·B ${round(0.5 * r.B)} ±3)`, r);
  });
  // ── feel §8 third headless ratio: sprinting through 6 enemies hit at SSS style vs idle-walk ──
  if (want('U2')) {
    const sctx = { hero, variant: 'sprint SSS' };
    if (await run(P, 'U2', sctx, pSprintSSS, { part: 'setup' })) {
      const s0 = await mark(P); const wk = await run(P, 'U2', sctx, pSprintSSS, { part: 'walk' }); const s1 = await mark(P);
      await P.page.evaluate(pSprintSSS, { part: 'prep' }).catch(() => {});
      const s2 = await mark(P); const sp = await run(P, 'U2', sctx, pSprintSSS, { part: 'sprint' }); const s3 = await mark(P);
      if (wk?.frames?.length && sp?.frames?.length) {
        const b = stats(wk.frames), u = stats(sp.frames), cb = cpuPerFrame([s0, s1]), cu = cpuPerFrame([s2, s3]);
        const v = ratioStatus({ u, b, cu, cb, ...U2_SPRINT });
        const scene = sp.targets >= 6 && sp.sprintFrames >= 20 && sp.rankLetter === 'SSS';
        rec('U2', sctx, scene ? v.status : 'error', `${scene ? '' : 'scenario not reached — '}sprint ${sp.sprintFrames}/${u.n} frames, ${sp.hits} hits on ${sp.targets}/6 enemies at rank ${sp.rankLetter}: avg ${u.avg} ms vs idle-walk avg ${b.avg} ms (≤ ×${U2_SPRINT.k} = ${round(U2_SPRINT.k * b.avg)}, ≤ ${U2_SPRINT.absMs} abs), max ${u.max} (≤ 250); main-thread CPU ${cu ?? '?'} vs ${cb ?? '?'} ms/frame = ×${v.cpuRatio ?? '?'} (≤ ${U2_SPRINT.k})${ratioNote(v)}; load ${round(os.loadavg()[0])}`, { walk: b, walkGaits: wk.gaits, sprint: u, cpu: { walk: cb, sprint: cu, ratio: v.cpuRatio, contention: v.contention }, scene: { ...sp, frames: undefined } });
      }
    }
  }
  await closePage(P);
}

// ───────────────────────── boss cap (A5) ─────────────────────────
async function bossSuite(hero, cids) {
  const P = await openPage('boss_' + hero, `index.html?scene=stage&stage=s04&room=boss&char=${hero}`);
  const enter = await run(P, 'A5', { hero, variant: 'enter' }, pBossEnter, {}, null);
  if (!enter?.active) { if (enter) rec('A5', { hero }, 'error', `boss fight did not start (top ${enter.top}, boss ${enter.boss}, state ${enter.state})`, enter); await closePage(P); return; }
  for (const cid of cids) {
    await run(P, 'A5', { hero, variant: cid }, pBossAwaken, { cid }, (r) => {
      const ok = r.pushed && r.dealt > 0 && r.frac <= 0.30 + 1e-9;
      rec('A5', { hero, variant: cid }, ok ? 'pass' : 'fail', `${enter.boss}: one awakening dealt ${r.dealt} of ${r.max} (${round(r.frac * 100, 2)} %, cap 30 %)${r.dead ? ', boss died' : ''}, director ${r.director}`, r);
    });
  }
  // the same awakening with ×60 attack: the cap itself has to hold (≤ 30 %, capped hits counted, boss alive)
  const top = cids[cids.length - 1];
  await run(P, 'A5', { hero, variant: top + ' ×60' }, pBossAwaken, { cid: top, boost: 60 }, (r) => {
    const ok = r.pushed && r.frac >= 0.2 && r.frac <= 0.30 + 1e-9 && (r.cap?.capped ?? 0) > 0 && !r.dead;
    rec('A5', { hero, variant: top + ' ×60' }, ok ? 'pass' : 'fail', `${enter.boss} with ×60 attack: one awakening dealt ${r.dealt} of ${r.max} (${round(r.frac * 100, 2)} %, cap 30 %), capped hits ${r.cap?.capped ?? '?'} of ${r.cap?.calls ?? '?'}${r.dead ? ', BOSS DIED' : ''}`, r);
  });
  await closePage(P);
}

// ───────────────────────── mobile (A7, M3 touch, R183) ─────────────────────────
async function mobileSuite() {
  const P = await openPage('mobile_kael', 'index.html?scene=stage&stage=s04&char=kael', { viewport: { width: 844, height: 390 }, mobile: true, quality: 'medium' });
  if (P.fatal) { rec('A7', { hero: 'kael' }, 'error', 'page did not start: ' + P.fatal); await closePage(P); return; }
  const ctx = { hero: 'kael', variant: '844×390' };
  const cdp = await P.ctx.newCDPSession(P.page);
  const T = new Touch(cdp, P.page);
  await P.page.evaluate(() => window.__fq.setup({ transitioning: false }));
  const [W, H] = await P.page.evaluate(() => [innerWidth, innerHeight]);
  // touch mode: one neutral tap, then let syncPad show the pad
  await T.tap(Math.round(W * 0.5), Math.round(H * 0.3), 40);
  await P.page.evaluate(() => { window.__fq.step(4); window.__fq.render(); });
  const mode = await P.page.evaluate(() => window.__fq.input.mode);
  let L = await padLayout(P.page);
  // M3 (c): stick pushed past the outer ring (1.15 R) → sprint
  if (want('M3')) {
    try {
      await P.page.evaluate(() => { const Q = window.__fq; Q.w().transitioning = true; Q.reset(Q.fl.x0 + 30); });
      const x0 = Math.round(W * 0.2), y0 = Math.round(H * 0.68);
      await T.down(21, x0, y0);
      await P.page.evaluate(() => window.__fq.step(2));
      for (let i = 1; i <= 6; i++) { await T.move(21, x0 + i * 16, y0); await P.page.evaluate(() => window.__fq.step(1)); }
      const r = await P.page.evaluate(() => {
        const Q = window.__fq, p = Q.p(), P = Q.FMD.PERSONALITY.kael, B = p.ch.move.speed * p.speedMul;
        let reach = -1, hint = false;
        Q.step(40, (i) => { hint ||= !!Q.input.sprintHint; if (reach < 0 && p.sprinting && Math.abs(Math.abs(p.vx) - P.sprintK * B) <= 3) reach = i + 1; });
        return { reach, hint, sprinting: p.sprinting, vx: Math.abs(p.vx), kB: P.sprintK * B, mode: Q.input.mode };
      });
      await T.up(21);
      await P.page.evaluate(() => { const Q = window.__fq; Q.step(10); Q.w().transitioning = false; Q.reset(); });
      rec('M3', { hero: 'kael', variant: 'touch ring' }, r.hint && r.sprinting && r.reach > 0 && r.reach <= 15 ? 'pass' : 'fail', `touch stick past the outer ring (mode ${r.mode}): sprintHint ${r.hint}, sprinting ${r.sprinting}, k·B ${round(r.kB)} reached after ${r.reach} steps (|vx| ${round(r.vx)})`, r);
    } catch (e) { rec('M3', { hero: 'kael', variant: 'touch ring' }, 'error', 'exception: ' + e.message); }
  }
  // A7: hold the canvas pad's ult button 0.5 s → awakening; pad hidden during the director (R183)
  if (wantAny('A7', 'R183')) {
    try {
      await P.page.evaluate(() => { const Q = window.__fq; Q.reset(); Q.setClass('kael_crusader'); Q._a2d = null; const d = Q.dummy('skeleton', 150, {}); Q._awDs = [d]; Q.w().run.sp = 100; Q.w().run.aw = 100; Q.step(3); Q.render(); });
      L = await padLayout(P.page);
      const ult = L.buttons?.ult;
      if (!ult) throw new Error(`pad ult button not found (source ${L.source}, visible ${L.visible}, have ${Object.keys(L.buttons || {}).join(',')})`);
      const before = await P.page.evaluate(() => ({ vis: !!window.__fq.TP.touchpad.visible, sc: window.__fq.log.scenes.length, s: window.__fq.steps }));
      await T.down(11, ult.cx, ult.cy);
      const hold = await P.page.evaluate(({ sc0 }) => {
        const Q = window.__fq; let at = null;
        Q.step(34, (i) => { if (at == null && Q.top() === 'awakenCutin') at = i + 1; });
        return { at, top: Q.top(), ult: Q.input.state?.ult ?? null, pushed: Q.log.scenes.slice(sc0).some((s) => s[1] === 'push' && s[2] === 'awakenCutin') };
      }, { sc0: before.sc });
      await T.up(11);
      const pad = await P.page.evaluate(() => {
        const Q = window.__fq, w = Q.w(), tp = Q.TP.touchpad;
        const cut = [], dir = [];
        for (let i = 0; i < 900; i++) {
          Q.step(1);
          if (Q.top() === 'awakenCutin') cut.push(!!tp.visible);
          else if (w.cutscene) dir.push(!!tp.visible);
          else if (i > 5) break;
        }
        Q.step(10);
        return { cutSamples: cut.length, cutVisible: cut.filter(Boolean).length, dirSamples: dir.length, dirVisible: dir.filter(Boolean).length, after: !!tp.visible, cutscene: !!w.cutscene };
      });
      const hud = await P.page.evaluate(pHud);
      if (want('A7')) rec('A7', ctx, hold.pushed && hold.at != null && hold.at <= 34 && !hud.overlap && mode === 'touch' ? 'pass' : 'fail', `input ${mode}, pad ${L.source} visible ${before.vis}: ult button (${Math.round(ult.cx)},${Math.round(ult.cy)}) held → awakenCutin at step ${hold.at ?? 'never'}; combo HUD ${JSON.stringify(hud.combo)} vs boss bar (${hud.bossSlot}) ${JSON.stringify(hud.boss)} overlap ${hud.overlap}`, { hold, hud, before });
      if (want('R183')) rec('R183', ctx, pad.dirSamples > 0 && pad.dirVisible === 0 && pad.cutVisible === 0 && pad.after ? 'pass' : 'fail', `request #183: touch pad visible in ${pad.cutVisible}/${pad.cutSamples} cut-in steps and ${pad.dirVisible}/${pad.dirSamples} director steps; visible again afterwards ${pad.after}`, pad);
      await P.page.evaluate(pAwakenCleanup).catch(() => {});
    } catch (e) { rec('A7', ctx, 'error', 'exception: ' + e.message); }
  }
  await closePage(P);
}

// ───────────────────────── companions (X1–X3) ─────────────────────────
async function companionSuite() {
  const P = await openPage('companions_kael', 'index.html?scene=stage&stage=s04&char=kael&cmp=all&mount=mt_warhorse&guards=gd_fairy,gd_knight&ride=1');
  const ctx = { hero: 'kael' };
  if (!P.fatal) await P.page.evaluate(() => window.__fq.setup({ transitioning: false }));
  if (want('X1')) await run(P, 'X1', ctx, pX1, {}, (r) => {
    const okR = r.riding && r.rider.every((x) => x.hit && x.worldHitstop > 0 && x.comboDelta >= 1);
    const okC = r.charge.hits >= 1 && r.charge.comboDelta >= 1;
    rec('X1', ctx, okR && okC ? 'pass' : 'fail', `riding ${r.mountId} ${r.riding}: rider hits ${r.rider.map((x) => `${x.cls ?? '-'} hs ${round(x.worldHitstop, 3)} combo+${x.comboDelta} style+${x.stylePts}`).join(', ')}; mount charge ${r.charge.hits} hit(s) tags ${r.charge.tags?.join('/')}, hs ${r.charge.hs}, combo+${r.charge.comboDelta}`, r);
  });
  if (want('X2')) {
    const st = await run(P, 'X2', ctx, pAwakenStart, { cid: 'kael_crusader', key: 'ult', render: false, holdSteps: 30, until: 9 }, null);
    const fin = st ? await run(P, 'X2', ctx, pAwakenFinish, { render: false }, null) : null;
    const re = fin ? await P.page.evaluate(() => { const Q = window.__fq, p = Q.p(); let at = -1; Q.step(180, (i) => { if (at < 0 && p.mount?.riding) at = i + 1; }); return { remountAt: at, riding: !!p.mount?.riding }; }).catch((e) => ({ error: e.message })) : null;
    await P.page.evaluate(pAwakenCleanup).catch(() => {});
    if (st && fin) rec('X2', ctx, st.ridingAtStart && st.info && fin.ridingDuringDirector === 0 && fin.done && !fin.cutscene && fin.dmg.some((d) => d > 0) && re?.remountAt > 0 ? 'pass' : 'fail', `awakening while riding (riding at the press: ${st.ridingAtStart}): cut-in ${st.info ? 'pushed' : 'NOT pushed'}, riding during the director ${fin.ridingDuringDirector}/${fin.padSamples} steps, director ${fin.director} done ${fin.done}, damage ${fin.dmg.map((d) => Math.round(d)).join('/')}; auto-remount after ${re?.remountAt > 0 ? round(re.remountAt / 60, 2) + ' s' : 'no'}`, { start: st, fin: { ...fin, frames: undefined }, remount: re });
  }
  if (want('X3')) await run(P, 'X3', ctx, pX3, { cid: 'kael_crusader' }, (r) => {
    const ok = r.autoHits > 0 && r.autoHsMax === 0 && r.maxWorldHs === 0 && r.freezeLogDelta === 0 && Math.abs(r.awDelta - r.rankUps * r.awPerRank) < 1e-6 && r.comboRefreshByGuardian === 0 && r.assist.assists >= 1 && r.assist.assistHsMax <= 0.03 + 1 / 60 + 1e-6 && r.assist.finisherCls === 'F';
    rec('X3', ctx, ok ? 'pass' : 'fail', `${r.guardians} guardians: ${r.autoHits} auto hits with hitstop ${r.autoHsMax} (world max ${r.maxWorldHs}, freezeLog +${r.freezeLogDelta}), awakening gauge +${r.awDelta} (style rank-ups ${r.rankUps}), combo refreshed by guardians ×${r.comboRefreshByGuardian}; finisher ${r.assist.finisherCls} (${round(r.assist.finisherHs, 3)} s) → ${r.assist.assists} assist(s) hitstop ${r.assist.assistHsMax}`, r);
  });
  await closePage(P);
}

// ───────────────────────── V1 at vw 1280 ─────────────────────────
/** V1 on a fresh page: switch to the class, let handleUltInput call prepareAwakening, then wait (real time) for the cut-in CG
 *  to load and the idle-time bake (brush font + band) — in play this happens long before the gauge fills */
async function pPrepAwaken({ cid, waitMs = 3500 }) {
  const Q = window.__fq, p = Q.p();
  Q.reset();
  Q.setClass(cid);
  Q.step(3);
  const a = Q.AWD.AWAKEN?.[p.hero.charId];
  const t0 = Q.realNow();
  let img = null;
  while (Q.realNow() - t0 < 10000) {
    img = a ? Q.assets.get(a.cutin) : null;
    if (img && (img.naturalWidth || img.width)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, waitMs));   // prepareCutin bakes in requestIdleCallback (timeout 2.5 s)
  return { cid, cutin: a?.cutin ?? null, loaded: !!(img && (img.naturalWidth || img.width)), waitedMs: Math.round(Q.realNow() - t0) };
}

/** the hero page switches class mid-stage (tier 0 → 1) and steps inside long synchronous evaluates, so the cut-in CG that
 *  prepareAwakening starts loading can lose the race and the first awakening shows the portrait fallback. In play the class is
 *  set before the stage and the art is 'pre-decoded' long before the gauge fills (feel §8), so wait for it (real time) before the
 *  first awakening; then A3/A6 measure the path players see and the V1 960 shot shows the real art */
async function pCutinReady({ maxMs = 10000, settleMs = 1000 }) {
  const Q = window.__fq, p = Q.p();
  Q.step(2);   // handleUltInput → prepareAwakening for the current (tier ≥ 1) class
  const a = Q.AWD.AWAKEN?.[p.hero.charId];
  const t0 = Q.realNow();
  let img = null;
  while (a && Q.realNow() - t0 < maxMs) {
    img = Q.assets.get(a.cutin);
    if (img && (img.naturalWidth || img.width)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const loaded = !!(img && (img.naturalWidth || img.width)), loadMs = Math.round(Q.realNow() - t0);
  await new Promise((r) => setTimeout(r, settleMs));   // prepareCutin bakes band + text in requestIdleCallback
  return { cutin: a?.cutin ?? null, loaded, loadMs };
}

async function wideSuite(hero) {
  const [, c1, c2] = CLASS_PICK[hero];
  const P = await openPage('wide_' + hero, `index.html?scene=stage&stage=s04&char=${hero}`, { viewport: { width: 1280, height: 540 } });
  if (P.fatal) { rec('V1', { hero, variant: 'vw1280' }, 'error', 'page did not start: ' + P.fatal); await closePage(P); return; }
  await P.page.evaluate(() => window.__fq.setup({ transitioning: false }));
  const prep = await run(P, 'V1', { hero, variant: 'vw1280' }, pPrepAwaken, { cid: c2 }, null);
  const st = await run(P, 'V1', { hero, variant: 'vw1280' }, pAwakenStart, { cid: c2, key: 'ult', render: true, holdSteps: 30, until: 0.8 }, null);
  if (st?.info) await shot(P, `cutin_${hero}_1280`, `${hero} ${c2} cut-in at t = ${st.sceneT} s, vw 1280`);
  await run(P, 'V1', { hero, variant: 'vw1280' }, pAwakenFinish, { render: false }, null);
  await P.page.evaluate(pAwakenCleanup).catch(() => {});
  const u = await run(P, 'V1', { hero, variant: 'vw1280' }, pUlt, { cid: c1, measure: false, captureFinal: true }, null);
  if (u?.paused) { await shot(P, `ult_final_${hero}_1280`, `${hero} ${c1} ultimate final frame, vw 1280`); await P.page.evaluate(pUltFinish, { measureFrames: false }).catch(() => {}); }
  await P.page.evaluate(pUltAfter).catch(() => {});
  const view = await P.page.evaluate(() => [window.__game.viewW, window.__game.viewH]);
  const brush = await P.page.evaluate(async () => { const { FONT } = await import('/src/core/ui.js'); const f = FONT.brush, first = String(f).split(',')[0].trim(); try { return { family: f, first, ok: document.fonts.check(`40px ${first}`, '각성') }; } catch (e) { return { family: f, ok: false, err: String(e) }; } });
  report.pages.push({ key: 'wide_view_' + hero, view, brush, prep, cutin: st?.info ?? null });
  await closePage(P);
}

// ───────────────────────── main ─────────────────────────
console.log(`feel_test: heroes ${HEROES.join(',')}${ONLY ? ', only ' + ONLY.join(',') : ''}; out ${OUT}; load ${os.loadavg()[0].toFixed(1)} on ${CORES} cores`);
try {
  for (const hero of HEROES) await heroSuite(hero);
  if (want('C2') && !HEROES.includes('lia')) await heroSuite('lia', { onlyIds: ['C2'] });
  if (KAEL_ONLY.some(want) && !HEROES.includes('kael')) await heroSuite('kael', { onlyIds: KAEL_ONLY });
  if (want('A5')) {
    const bossHeroes = (args.quick ? ['kael'] : ['kael', 'victor']).filter((h) => HEROES.includes(h));
    if (!bossHeroes.length) bossHeroes.push(HEROES[0]);
    for (const h of bossHeroes) await bossSuite(h, [CLASS_PICK[h][1], CLASS_PICK[h][2]]);
  }
  if (wantAny('A7', 'R183', 'M3')) await mobileSuite();
  if (wantAny('X1', 'X2', 'X3')) await companionSuite();
  if (want('V1')) {
    for (const hero of HEROES) await wideSuite(hero);
    const files = report.shots.filter((s) => s.file).map((s) => path.basename(s.file));
    rec('V1', {}, 'review', `${files.length} PNGs in ${SHOTS} to review: no watermark, face in the band, text not clipped at 960/1280, Korean in the brush font`, { files });
  }
} catch (e) {
  report.errors.push({ page: 'harness', error: String(e?.stack || e) });
  console.error(e);
} finally {
  await browser.close().catch(() => {});
  await srv.close().catch(() => {});
  saveReport();
}
const S = report.summary;
console.log(`\nfeel_test: ${S.pass} pass, ${S.fail} fail, ${S.inconclusive} inconclusive, ${S.review} to review; page errors ${S.pageErrors}; ${elapsed()}`);
for (const [id, v] of Object.entries(S.ids)) if (v.status !== 'pass') console.log(`  ${id}: ${v.status} (${Object.entries(v).filter(([k, n]) => k !== 'status' && n).map(([k, n]) => k + ' ' + n).join(', ')})`);
console.log(`report: ${path.join(OUT, 'report.json')}`);
if (!report.cases.length) { console.log('feel_test: no check ran — nothing was tested (exit 1)'); process.exit(1); }
process.exit(S.fail || S.pageErrors ? 1 : 0);
