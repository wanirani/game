// CHAPTER-AUDIT (read-only lane): a bot plays 「본 게임」 (scene v2g, story on, new interface, fold_open, render size 0.5) from a clean
// save towards the ending of chapter 1 and writes down, event by event, what a player can and cannot do today.
//   node tools/v2/chapter_audit.mjs [--shots 1] [--to <event id>] [--from <event id | save file | last>] [--out <dir>] [--verbose 1]
//                                   [--device fold_open] [--res 0.5] [--budget 1] (budget = multiplier on every honest-play budget)
// HONEST PLAY: input goes in through the pad's own pointer handlers (stick drag, attack / roll / jump / skill / bell buttons), taps on the
//   dialogue box, on choice rows and on prompt pills. Time is fast-forwarded by ticking the game. The bot reads the game's state to decide
//   where to walk (the scene's own collision world for routes, enemies for tactics). A read-only spy on the story runner's entry point
//   notes which sequence each engine event starts (nothing is changed by it).
// HELP (logged with beat, reason, what was done): putting the hero somewhere, felling enemies by script, raising a story event by hand,
//   setting an enemy's health. Help is used only after the stated honest budget of the beat is spent.
// Output: <out>/table.md + table.json (rewritten after every beat), <out>/state.json (everything needed to resume the report),
//   <out>/saves/<nnn>_<event id>.json (the game's save composed after every completed story event), <out>/shots/<nnn>_<beat>.png, <out>/seen.txt.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';
import { installBot } from './game_bot.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
// --out is required since 2026-11-18: a run without --from clears the numbered saves and stills of its folder, and a bare call (or "--help") once wiped another run's saves.
if (args.help || !args.out || args.out === true) { console.error('usage: node tools/v2/chapter_audit.mjs --out <dir> [--max-seconds 500] [--from last | <event id> | <save file>] [--to <event id>] [--shots 1] [--only <beat> --keep 1] [--device fold_open] [--res 0.5] [--budget 1]\n  --out is required: a run without --from CLEARS the numbered saves and stills in that folder.'); process.exit(2); }
const OUT = String(args.out), DEV = String(args.device || 'fold_open'), RES = Number(args.res ?? 0.5), VERB = !!args.verbose;
const MAXS = Number(args['max-seconds'] ?? 0), T0 = Date.now();
const SHOTS = !!args.shots && String(args.shots) !== '0', FROM = args.from ? String(args.from) : null, TO = args.to ? String(args.to) : null, KB = Number(args.budget ?? 1);
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const SAVES = `${OUT}/saves`, SHOTD = `${OUT}/shots`, SF = `${OUT}/state.json`;
fs.mkdirSync(SAVES, { recursive: true }); fs.mkdirSync(SHOTD, { recursive: true });
if (!args.from) for (const d of [SAVES, SHOTD]) for (const f of fs.readdirSync(d)) if (/^\d{3}_.*\.(json|png)$/.test(f)) fs.rmSync(`${d}/${f}`);   // a clean run starts with empty save and still folders (only this tool's own files)
const { EVENTS } = await import('../../src/v2/data/events.js');
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

// ───────── state of the audit (kept on disk so a cut-off run continues) ─────────
let ST = { started: new Date().toISOString(), rows: {}, beats: [], helps: [], errors: [], lost: [], warnings: [], notes: [], num: { ticks: 0, deaths: 0, crossings: 0, saves: 0, storySaves: 0, lostWay: [], fights: [], maxNoSave: 0, lastSaveT: 0, blocks: {} }, lastT: 0 };
let resume = null;
if (FROM) {
  const files = fs.readdirSync(SAVES).filter((f) => f.endsWith('.json')).sort();
  let f = FROM === 'last' ? files[files.length - 1] : fs.existsSync(FROM) ? FROM : files.filter((x) => x.replace(/^\d+_/, '').replace(/\.json$/, '') === FROM).pop();
  if (!f) { console.error('no save to continue from: ' + FROM); process.exit(2); }
  if (!f.includes('/')) f = `${SAVES}/${f}`;
  resume = JSON.parse(fs.readFileSync(f, 'utf8')); resume.file = f;
  if (fs.existsSync(SF)) { try { ST = JSON.parse(fs.readFileSync(SF, 'utf8')); } catch { /* start a new record */ } }
  ST.notes.push(`resumed ${new Date().toISOString()} from ${f} (after beat ${resume.beat} "${resume.beatId}")`);
}
const saveState = () => fs.writeFileSync(SF, JSON.stringify(ST));

/** in the page: taps, the fast-forward loop, the story spy, routes on the scene's own collision world, jump / echo assistance for the bot */
function installCa() {
  const g = window.__game, v = window.__v2, B = window.__bot;
  const fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
  const toClient = (lx, ly) => { const r = g.canvasRect, s = v.scene.state; return [r.x + lx / s.viewW * r.w, r.y + ly / s.viewH * r.h]; };
  const A = (window.__ca = { ticks: 0, raised: [], open: [], completed: [], lr: [], dlgT: 0, taps: 0, pills: 0, choice: 0, lost: [], passive: false, wantJump: false, jumpHold: 0, jumpCd: 0, echoCd: 0, echoHold: 0, echoes: 0, jumps: 0, deaths: 0, _dead: false, kills: 0, mods: null, autoEcho: true });
  const H = v.scene.host, EV = H.STORY.EVENTS;
  const get = (d, k) => { let x = d; for (const q of k.split('.')) x = x == null ? undefined : x[q]; return x; };
  // read-only spy: which sequences does this engine event start? (same test the runner makes: not done, data matches, conditions hold)
  const orig = H.st.story;
  H.st.story = (name, d, api) => {
    try {
      if (!name.startsWith('play.')) {
        const hits = [];
        for (const e of EV) { if (e.on !== name) continue; if (e.once !== false && H.st.isDone(e.id)) continue; let ok = true; for (const k in e.match ?? {}) if (get(d, k) !== e.match[k]) { ok = false; break; } if (!ok) continue; if (!H.st.test(e.if ?? null, e.ifAny ?? null)) continue; hits.push(e.id); }
        const key = name + ':' + (d?.event ?? d?.talk ?? d?.group ?? d?.id ?? d?.area ?? d?.phase ?? '');
        if (name !== 'enemy.kill') { A.lr.push(key); if (A.lr.length > 40) A.lr.shift(); }
        if (A.raised.length < 3000) A.raised.push({ t: A.ticks, key, hits, area: v.area, again: !!d?.again, refused: !!d?.refused, locked: d?.locked ?? null });
        for (const id of hits) A.open.push({ id, t0: A.ticks, seen0: H.seen.length, on: key, area: v.area });
      }
    } catch (e) { console.warn('[audit] spy failed', e); }
    return orig(name, d, api);
  };
  for (const c of document.querySelectorAll('canvas')) c.addEventListener('webglcontextlost', () => A.lost.push({ t: A.ticks, area: v.area }));
  A.draw = () => { g.alpha = 1; g.render(); };
  const pad = () => v.scene.hud.metrics?.().pad?.buttons ?? [];
  const btn = (id) => pad().find((q) => q.id === id) ?? null;
  A.relJump = () => { if (A.jumpHold > 0) { const b = btn('jump'); if (b) fire('pointerup', 13, b.cx, b.cy); A.jumpHold = 0; } if (A.echoHold > 0) { const b = btn('bell'); if (b) fire('pointerup', 15, b.cx, b.cy); A.echoHold = 0; } };
  // the bot's brain plus: long jump presses where the way goes up a ledge or over a gap, a short ring of the bell at hidden ghosts and at the queen's scream / song
  const dec0 = B.decide;
  B.decide = () => {
    if (A.path && v.ready && v.scene.sim) A.follow();
    const o = dec0(), sc = v.scene, sim = sc.sim; A.wantJump = false; A.wantEcho = false;
    if (!v.ready || !sim) return o;
    const h = sim.hero;
    if (A.passive) {   // let himself be struck: walk up to the nearest enemy and stand there, no blow, no guard, no roll
      o.attack = false; o.guard = false; o.dash = false; o.mx = 0; o.mz = 0; let bd = 1e9, be = null;
      for (const e of sim.enemies) { if (e.dead || e.state === 'dead') continue; const dd = Math.hypot(e.x - h.x, e.z - h.z); if (dd < bd) { bd = dd; be = e; } }
      if (be && bd > 46) { o.mx = (be.x - h.x) / bd; o.mz = (be.z - h.z) / bd; }
    }
    if (o.jump) { A.wantJump = true; o.jump = false; }
    if (!o.attack && !o.guard && !o.dash && (o.mx || o.mz) && h.onGround && A.mods) {
      const d = Math.hypot(o.mx, o.mz), ux = o.mx / d, uz = o.mz / d, W = sc.W, y0 = h.y, gnd = A.mods.world.groundAt;
      const ga = gnd(W, h.x + ux * 19, h.z + uz * 19, y0 + 125);
      if (Number.isFinite(ga) && ga - y0 > 19) A.wantJump = true;
      else if (!Number.isFinite(ga) || ga < y0 - 60) { for (let s = 50; s <= 150; s += 14) { const q = gnd(W, h.x + ux * s, h.z + uz * s, y0 + 30); if (Number.isFinite(q) && q > y0 - 105) { A.wantJump = true; break; } } }
    }
    if (A.autoEcho && !A.passive && sc._caps?.bell && h.bellOk && !(h.bellCd > 0) && A.echoCd <= 0 && !sc.hud.modal) {
      let want = false; const E = sim.enemies;
      for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.dead || e.state === 'dead' || !e.active) continue; const dd = Math.hypot(e.x - h.x, e.z - h.z);
        if (e.def?.fade != null && !e.solid && dd < 230) want = true;
        else if (e.def?.boss && dd < 420 && e.atk && (e.atk.id === 'scream' || e.atk.id === 'song') && e.state === 'attack') want = true; }
      if (want) A.wantEcho = true;
    }
    return o;
  };
  A.assist = () => {
    const sc = v.scene, h = sc.sim?.hero; if (!h) return;
    if (A.jumpCd > 0) A.jumpCd--; if (A.echoCd > 0) A.echoCd--;
    if (A.jumpHold > 0) { if (--A.jumpHold === 0) { const b = btn('jump'); if (b) fire('pointerup', 13, b.cx, b.cy); A.jumpCd = 10; } }
    else if (A.wantJump && h.onGround && A.jumpCd <= 0) { const b = btn('jump'); if (b) { fire('pointerdown', 13, b.cx, b.cy); A.jumpHold = 20; A.jumps++; } }
    if (A.echoHold > 0) { if (--A.echoHold === 0) { const b = btn('bell'); if (b) fire('pointerup', 15, b.cx, b.cy); A.echoCd = 150; } }
    else if (A.wantEcho && A.echoCd <= 0 && A.jumpHold <= 0) { const b = btn('bell'); if (b && !b.disabled) { fire('pointerdown', 15, b.cx, b.cy); A.echoHold = 5; A.echoes++; } }
  };
  A.after = () => {
    const sc = v.scene, h = sc.sim?.hero, dead = !!h?.dead; if (dead && !A._dead) A.deaths++; A._dead = dead;
    if (A.open.length && !H.st.busy && !sc.hud.modal) { for (const o of A.open) { o.t1 = A.ticks; o.seen1 = H.seen.length; A.completed.push(o); } A.open.length = 0; }
  };
  A.step = (bot) => {
    const sc = v.scene, m = sc.hud?.modal ?? null;
    if (m === 'dialog') {
      if (B.ts) B.touchEnd(); A.relJump();
      if (++A.dlgT >= 9) {
        A.dlgT = 0; const d = sc.hud.metrics?.().dialog; let x = sc.state.viewW / 2, y = sc.state.viewH * 0.3;
        if (d && d.choices && Array.isArray(d.choiceRects) && d.choiceRects.length && d.shown >= d.total && d.page >= d.pages - 1) { const r = d.choiceRects[A.choice] ?? d.choiceRects[0]; if (r) { x = r.x + r.w / 2; y = r.y + r.h / 2; } }
        const c = toClient(x, y); fire('pointerdown', 31, c[0], c[1]); fire('pointerup', 31, c[0], c[1]); A.taps++;
      }
    } else if (bot && v.ready && !sc._go && !sc.xing && B.ts) { B.touchStep(); A.assist(); }
    g.tick(1 / 60); A.ticks++; A.after();
  };
  A.u = {
    idle: () => { const sc = v.scene; return v.ready && !sc.hud.modal && !H.st.busy && !sc._go && !sc.xing && sc.fadeA <= 0.01; },
    busy: () => !!H.st.busy || !!v.scene.hud.modal,
    away: () => !v.ready || !!v.scene._go || !!v.scene.xing,
    dead: () => !!v.scene.sim?.hero?.dead,
    modal: () => !!v.scene.hud.modal,
  };
  A.run = (n, bot, until) => { g._pageHidden = true; let i = 0; for (; i < n; i++) { A.step(bot); if (i % 60 === 0) A.draw(); if (until && A.u[until]()) { i++; break; } } if (B.ts) B.touchEnd(); A.relJump(); A.draw(); return A.status(i); };
  A.status = (i) => {
    const sc = v.scene, sim = sc.sim, h = sim?.hero, bs = sim?.bossState?.() ?? null; let awake = 0; if (sim) for (const e of sim.enemies) if (!e.dead && e.state !== 'dead' && e.active) awake++;
    return { i, ticks: A.ticks, ready: !!v.ready, area: v.area, sec: v.section, x: h ? Math.round(h.x) : 0, y: h ? Math.round(h.y) : 0, z: h ? Math.round(h.z) : 0, hp: h ? Math.round(h.hp) : 0, hpMax: h?.hpMax ?? 0, dead: !!h?.dead, onGround: !!h?.onGround, act: h?.act ?? null, hook: h?.hookId ?? null,
      modal: sc.hud?.modal ?? null, go: !!sc._go, xing: !!sc.xing, busy: !!H.st.busy, running: H.st.running ?? null, seen: H.seen.length, obj: H.objective ?? '', prompt: v.prompt?.id ?? null, left: sim ? sim.enemies.filter((e) => !e.dead).length : 0, awake, deaths: A.deaths,
      flags: Object.keys(H.st.state.flags).filter((k) => H.st.state.flags[k]), items: { ...H.st.state.items }, saves: H.saves, ended: H.ended ?? null, lr: A.lr.slice(-30), coins: sc.brk?.coins ?? 0,
      boss: bs ? { hp: Math.round(bs.hp), hpMax: bs.hpMax, phase: bs.phase, kneel: !!bs.kneel, fled: !!bs.fled, sub: bs.sub ?? null } : null, scene: !!sc.glr && !!sc.sim };
  };
  /** a route on the scene's own collision world (locked exits, people and breakables are in it) -> number of way points (0 = none) */
  A.plan = (tx, tz, r, direct) => {
    const sc = v.scene, h = sc.sim.hero, RG = A.mods.reach.reachGrid, gnd = A.mods.world.groundAt;
    // a person standing where the hero stands (people appear on top of him) must not close the start of the route
    const inside = sc.W.boxes.filter((b) => b.actor != null && b.solid && h.x > b.x0 - 34 && h.x < b.x1 + 34 && h.z > b.z0 - 34 && h.z < b.z1 + 34);
    const W = inside.length ? { ...sc.W, boxes: sc.W.boxes.filter((b) => !inside.includes(b)) } : sc.W; A.inPerson = inside.map((b) => b.actor);
    for (const opt of [{ R: 26, onFoot: true }, { R: 14, onFoot: true }, { R: 14, onFoot: false }, { R: 6, onFoot: false }]) {
      const G = RG(W, h.x, h.z, opt.R, { onFoot: opt.onFoot }), p = G.near(tx, tz, r) ?? G.near(tx, tz, r * 2.2);
      if (p) { const path = G.path(p[0], p[1], true); if (path && path.length) {
        if (direct) path.push([tx, tz]);
        let lo = 1e9, hi = -1e9; for (const q of path) { const y = gnd(sc.W, q[0], q[1]); if (Number.isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } }
        if (hi - lo > 30) { A.path = path; A.wi = 0; B.setRoute([path[0]]); } else { A.path = null; B.setRoute(path); }   // a route that climbs is followed way point by way point (the bot's own follower takes the nearest in 2D: wrong where floors lie behind each other)
        return path.length; } }
    }
    return 0;
  };
  A.route = (pts) => { A.path = null; B.setRoute(pts); return pts.length; };
  A.follow = () => {
    const P = A.path; if (!P) return; const sc = v.scene, h = sc.sim?.hero; if (!h) return; const gnd = A.mods.world.groundAt; let moved = false;
    while (A.wi < P.length - 1) { const q = P[A.wi], gy = gnd(sc.W, q[0], q[1], h.y + 40); if (Math.hypot(q[0] - h.x, q[1] - h.z) < 24 && h.onGround && Number.isFinite(gy) && Math.abs(gy - h.y) < 30) { A.wi++; moved = true; } else break; }
    if (moved) { const sk = B.skipMap; B.setRoute([P[A.wi]]); B.skipMap = sk; }
  };
  A.group = (gr) => { const sim = v.scene.sim, h = sim.hero; let best = null, bd = 1e9, n = 0, hid = 0; for (const e of sim.enemies) { if (e.group !== gr || e.dead || e.state === 'dead') continue; n++; if (e.def?.fade != null && !e.solid) hid++; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd) { bd = d; best = [Math.round(e.x), Math.round(e.z), Math.round(e.hp), e.kind]; } } return { n, best, d: Math.round(bd), hid }; };
  A.trig = (event) => { const t = v.scene.area.triggers.find((q) => q.event === event); return t ? [(t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2, t.id] : null; };
  A.exit = (id) => { const x = v.exits.find((q) => q.id === id), g = x && x.locked && x.lockAt ? x.lockAt : null; return x ? { x: g ? (g.x0 + g.x1) / 2 : (x.x0 + x.x1) / 2, z: g ? g.z0 - 6 : (x.z0 + x.z1) / 2, locked: x.locked ?? null, to: x.to, at: !!g } : null; };   // a shut gate in front of its exit box (lockAt, AREA_FORMAT 3): the hero walks up to the gate, not to the box behind it
  A.spot = (what, data) => {
    const P = v.scene.people;
    for (const p of P.list) if (p.id === what) return { id: p.id, x: p.x, y: p.y, z: p.z, r: p.r, person: true, on: !!p.on, talk: p.def.talk ?? null };
    for (const s of P.spots) { const d = s.def; if ((s.id === what || d.event === what) && (!data || Object.keys(data).every((k) => d.data?.[k] === data[k]))) return { id: s.id, x: s.x, y: s.y, z: s.z, r: s.r, person: false, on: !!s.on, kind: d.kind, event: d.event ?? null, locked: d.locked ?? null }; }
    return null;
  };
  A.pill = () => { const sc = v.scene; A.draw(); const P = sc.hud.metrics?.().prompts ?? []; const p = P.find((q) => q.action === 'confirm'); if (!p || !v.prompt) return null; const id = v.prompt.id; const c = toClient(p.x + p.w / 2, p.y + p.h / 2); fire('pointerdown', 32, c[0], c[1]); fire('pointerup', 32, c[0], c[1]); A.pills++; g.tick(1 / 60); A.ticks++; A.after(); g.tick(1 / 60); A.ticks++; A.after(); return id; };
  /** hold the bell button until the long ring has rung (a sequence, a crossing, a notice) or n ticks */
  A.bell = (n) => { const sc = v.scene, b = btn('bell'); if (!b) return { err: 'no bell button' }; if (B.ts) B.touchEnd(); A.relJump(); g._pageHidden = true; const seen0 = H.seen.length, lr0 = A.raised.length; let i = 0, rang = false, waited = 0, again = 0; const ae = A.autoEcho, h0 = sc.sim?.hero; A.autoEcho = false;
    while (h0 && waited < 240 && (!h0.bellOk || h0.bellCd > 0) && !sc.hud.modal && !H.st.busy) { A.step(true); waited++; }   // the bell rests after an echo / the hero is in a move: wait as a player would (the bot keeps guarding)
    if (B.ts) B.touchEnd(); A.relJump(); A.autoEcho = ae;
    fire('pointerdown', 15, b.cx, b.cy); for (; i < n; i++) { g.tick(1 / 60); A.ticks++; A.after(); if (i % 30 === 0) A.draw();
      if (i > 0 && i % 50 === 0 && h0 && !(h0.bellCharge > 0) && h0.act !== 'ring' && again < 3) { fire('pointerup', 15, b.cx, b.cy); for (let k = 0; k < 24; k++) { g.tick(1 / 60); A.ticks++; A.after(); } fire('pointerdown', 15, b.cx, b.cy); again++; }   /* the hold did not start (struck, or pressed too early): press again */
      if (H.st.busy || sc.hud.modal || sc.xing || H.seen.length > seen0 || A.raised.slice(lr0).some((q) => q.key.startsWith('bell.long'))) { rang = true; break; } } fire('pointerup', 15, b.cx, b.cy); g.tick(1 / 60); A.ticks++; A.after(); A.draw();
    return { i, rang, waited, again, act: sc.sim?.hero?.act ?? null, charge: sc.sim?.hero?.bellCharge ?? 0, disabled: !!b.disabled, raised: A.raised.slice(lr0).map((q) => q.key + (q.hits.length ? '>' + q.hits.join('+') : '')) }; };
  /** a short press of the bell button (echo) */
  A.echo = () => { const sc = v.scene, b = btn('bell'); if (!b) return { err: 'no bell button' }; if (B.ts) B.touchEnd(); A.relJump(); const lr0 = A.raised.length; fire('pointerdown', 15, b.cx, b.cy); for (let i = 0; i < 5; i++) { g.tick(1 / 60); A.ticks++; A.after(); } fire('pointerup', 15, b.cx, b.cy); for (let i = 0; i < 40; i++) { g.tick(1 / 60); A.ticks++; A.after(); } A.draw(); return { disabled: !!b.disabled, raised: A.raised.slice(lr0).map((q) => q.key + (q.hits.length ? '>' + q.hits.join('+') : '')) }; };
  /** a press of the skill button (the whip hook when a ring is in reach) */
  A.skill = () => { const sc = v.scene, h = sc.sim.hero, b = btn('skill'); if (!b) return { err: 'no skill button' }; if (B.ts) B.touchEnd(); A.relJump(); const hook0 = h.hookId ?? null, p0 = [Math.round(h.x), Math.round(h.y), Math.round(h.z)]; let flew = false;
    fire('pointerdown', 16, b.cx, b.cy); for (let i = 0; i < 4; i++) { g.tick(1 / 60); A.ticks++; A.after(); } fire('pointerup', 16, b.cx, b.cy);
    for (let i = 0; i < 150; i++) { g.tick(1 / 60); A.ticks++; A.after(); if (h.act === 'hook' || !h.onGround) flew = true; else if (flew && i > 12) break; } A.draw();
    return { hook0, flew, from: p0, to: [Math.round(h.x), Math.round(h.y), Math.round(h.z)], disabled: !!b.disabled, mode: h.skillMode ?? null }; };
  A.seen = (from) => H.seen.slice(from);
  A.save = () => { try { const o = H.compose(H.st.save()); o.why = 'audit'; return o; } catch (e) { return { err: String(e) }; } };
  // ── help (never used by honest play; every call is logged by the tool) ──
  A.fell = (group) => { const sim = v.scene.sim; let n = 0; for (const e of sim.enemies) if (e.group === group && !e.dead && e.state !== 'dead') { e.hp = 0; sim._kill(e); n++; } return n; };
  A.put = (x, z, y) => { const sc = v.scene, h = sc.sim.hero; if (y == null) { let gy = -1e9; for (const b of sc.W.boxes) if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > gy) gy = b.y1; if (gy > -1e8) y = gy; } h.x = x; h.z = z; if (y != null) h.y = y; h.vx = 0; h.vz = 0; h.vy = 0; if (h.safe) { h.safe.x = x; h.safe.z = z; h.safe.y = h.y; } sc.cam.snap = true; g.tick(1 / 60); A.ticks++; A.after(); return [Math.round(h.x), Math.round(h.y), Math.round(h.z)]; };
  A.emit = (name, data) => { v.scene.emit(name, data); return true; };
  A.bossHp = (k) => { const sim = v.scene.sim; for (const e of sim.enemies) if (e.def?.boss && !e.dead) { e.hp = Math.max(1, Math.round((e.hpMax ?? e.def.hp) * k)); return [e.hp, e.hpMax ?? e.def.hp]; } return null; };
  return import('/src/v2/world/reach.js').then((reach) => import('/src/v2/b/world.js').then((world) => { A.mods = { reach, world }; return true; }));
}

const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage(), errs = [];
let BEAT = '(boot)';
page.on('console', (m) => { if (m.type() === 'error') errs.push({ beat: BEAT, text: '[console.error] ' + m.text().slice(0, 300) }); else if (VERB && m.type() === 'warning') console.log('       [warn] ' + m.text().slice(0, 200)); });
page.on('pageerror', (e) => errs.push({ beat: BEAT, text: '[pageerror] ' + String(e.message).slice(0, 300) }));
page.on('crash', () => errs.push({ beat: BEAT, text: '[page crashed]' }));
await page.addInitScript((s) => { try { if (window.top !== window) return; if (sessionStorage.getItem('__ca_seeded')) return; sessionStorage.setItem('__ca_seeded', '1'); if (s == null) localStorage.removeItem('bn.v2.save'); else localStorage.setItem('bn.v2.save', s); } catch { /* storage */ } }, resume ? JSON.stringify(resume.save) : null);

const ev = (fn, arg) => page.evaluate(fn, arg);
const st = () => ev(() => window.__ca.status(0));
const run = (n, bot = true, until = null) => ev(([a, b, u]) => window.__ca.run(a, b, u), [n, bot, until]);
let shotN = 0;
const shot = async (name) => { if (!SHOTS) return null; const f = `${SHOTD}/${String(shotBase + ++shotN).padStart(3, '0')}_${name.replace(/[^a-z0-9_]+/gi, '_')}.png`; try { await ev(() => window.__ca?.draw()); await page.waitForTimeout(100); await page.screenshot({ path: f }); return f; } catch (e) { return null; } };
async function open() {
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0${RES < 1 ? '&v2res=' + RES : ''}`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 });
  await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 30000 }).catch(() => {});
  const cdp = await page.context().newCDPSession(page), T = new Touch(cdp, page);
  await ensureTouchMode(T, page); await page.waitForTimeout(300);
  await ev(installBot, [[0, 0]]); await ev(installCa);
  const pad = await ev(() => { const m = window.__v2.scene.hud.metrics?.(); if (!m?.pad) return null; const Bt = {}; for (const b of m.pad.buttons) Bt[b.id === 'roll' ? 'dash' : b.id] = { cx: b.cx, cy: b.cy, d: b.d, disabled: b.disabled }; return Bt; });
  const vp = await ev(() => [innerWidth, innerHeight]);
  await ev(([x0, y0, btn]) => { const B = window.__bot; B.opt.giveUp = 1500; B.touchSetup(x0, y0, 56, btn); }, [Math.round(vp[0] * 0.2), Math.round(vp[1] * 0.68), pad]);
  return ev(() => ({ area: window.__v2.area, hud: window.__v2.stats.hud, story: !!window.__v2.scene.host, err: window.__v2.error ?? null, pad: Object.keys(window.__v2.scene.hud.metrics().pad.buttons.reduce((o, b) => { o[b.id] = 1; return o; }, {})).join(' '), view: [innerWidth, innerHeight, devicePixelRatio] }));
}
/** fast-forward; waits out area loads. -> last status */
async function play(ticks, { bot = false, until = null, pred = null, chunk = 240 } = {}) {
  let s = null, left = ticks, loads = 0;
  while (left > 0) {
    s = await run(Math.min(chunk, left), bot, until);
    if (!s.ready) { await page.waitForTimeout(350); if (++loads > 200) break; continue; }
    left -= Math.max(1, s.i);
    if (until && (await ev((u) => window.__ca.u[u](), until))) break;
    if (pred && pred(s)) break;
  }
  return s ?? (await st());
}
/** let a running sequence and its dialogues finish (the bot keeps guarding the hero where he stands) */
async function settle(max = 3000, bot = true) {
  await ev(() => { const h = window.__v2.scene.sim?.hero; if (h && window.__v2.ready) window.__ca.route([[h.x, h.z]]); }).catch(() => {});
  await play(30, { bot }); let s = await play(max, { bot, until: 'idle', chunk: 120 }); await play(24, { bot });
  if (!(await ev(() => window.__ca.u.idle()))) s = await play(max, { bot, until: 'idle', chunk: 120 });
  return st();
}
const help = (reason, what) => { ST.helps.push({ beat: BEAT, reason, what, t: ST.num.ticks }); log(`  HELP [${BEAT}] ${reason} — ${what}`); beatHelp.push(what); };
let beatHelp = [];
/** walk (and fight what is in the way) to a point; done = within r, or pred(status) */
async function walk(tx, tz, { r = 60, budget = 3600, pred = null, planR = null, direct = false } = {}) {
  budget *= KB; let s = await st(), used = 0, planAt = -1e9, noPath = 0, deaths0 = s.deaths; const area0 = s.area;
  while (used < budget) {
    if (!s.ready) { await page.waitForTimeout(350); s = await st(); used += 10; continue; }
    if ((pred && pred(s)) || Math.hypot(s.x - tx, s.z - tz) < r) return { ok: true, s, used };
    if (s.area !== area0) return { ok: false, s, used, why: 'the area changed to ' + s.area };
    if (used - planAt >= 420 || s.deaths !== deaths0) { deaths0 = s.deaths; const n = await ev(([x, z, rr, dr]) => window.__ca.plan(x, z, rr, dr), [tx, tz, planR ?? Math.max(20, r * 0.7), direct]); planAt = used; if (!n) { if (++noPath >= 3) return { ok: false, s, used, why: `no route on the scene's own collision world from (${s.x},${s.z},y${s.y}) to (${tx},${tz})` }; } else noPath = 0; }
    s = await run(150, true); used += Math.max(1, s.i);
  }
  return { ok: false, s, used, why: `honest budget of ${budget} ticks used; hero at (${s.x},${s.z},y${s.y}), target (${tx},${tz})` };
}
/** fight until a group has fallen (honest budget), -> { ok, left } */
async function clear(group, { budget = 3600 } = {}) {
  budget *= KB; let used = 0, s = await st(), q = null; const t0 = s.ticks, hp0 = s.hp, d0 = s.deaths;
  await ev(() => { const B = window.__bot; B.opt.giveUp = 1e9; B.skipMap = {}; });
  while (used < budget) {
    q = await ev((gr) => window.__ca.group(gr), group); if (!q.n) break;
    if (q.d > 220) { const n = await ev(([x, z]) => window.__ca.plan(x, z, 110), q.best); if (!n) await ev((p) => window.__ca.route([p]), [q.best[0], q.best[1]]); } else await ev((p) => window.__ca.route([p]), [q.best[0], q.best[1]]);
    s = await run(180, true); used += Math.max(1, s.i);
    if (!s.ready) { await page.waitForTimeout(350); s = await st(); }
  }
  await ev(() => { window.__bot.opt.giveUp = 1500; });
  q = await ev((gr) => window.__ca.group(gr), group); s = await st();
  ST.num.fights.push({ beat: BEAT, group, ticks: s.ticks - t0, hp: [hp0, s.hp], deaths: s.deaths - d0, left: q.n });
  return { ok: !q.n, left: q.n, used, s, why: q.n ? `${q.n} of group "${group}" still stand after the honest budget of ${budget} ticks (nearest ${JSON.stringify(q.best)}, hidden ${q.hid}; hero hp ${s.hp}, deaths in the fight ${s.deaths - d0})` : '' };
}
async function clearOrHelp(group, o) { const r = await clear(group, o); if (!r.ok) { const n = await ev((g) => window.__ca.fell(g), group); help(r.why, `felled the last ${n} of group "${group}" by script`); } await settle(); return { ok: true, honest: r.ok }; }
const trig = (e) => ev((x) => window.__ca.trig(x), e);
async function walkTrig(event, o = {}) { const p = await trig(event), s0 = await st(); if (!p) return { ok: false, why: `no trigger with event "${event}" in ${s0.area} (state ${s0.flags.join('+')})` }; const key = 'trigger:' + event; const w = await walk(p[0], p[1], { r: 22, budget: 3600, pred: (s) => s.lr.includes(key), ...o }); const s = await settle(); return { ...w, ok: w.ok || s.lr.includes(key), p }; }
/** walk to a person or a spot and tap the pill that is offered for it */
async function useSpot(what, { budget = 3000, data = null, how = 'pill' } = {}) {
  const s0 = await st(), t = await ev(([w, d]) => window.__ca.spot(w, d), [what, data]);
  if (!t) return { ok: false, why: `no person or spot "${what}"${data ? JSON.stringify(data) : ''} in ${s0.area} in this state (${s0.flags.join('+') || 'base'})` };
  if (!t.on) return { ok: false, why: `"${what}" is in ${s0.area} but not shown in this state` };
  const want = t.id, w = await walk(t.x, t.z, { r: t.person ? 96 : Math.max(36, t.r * 0.7), budget, pred: (s) => s.prompt === want && how === 'pill' });
  if (how === 'bell') { let rang = null; for (let i = 0; i < 3; i++) { rang = await ev(() => window.__ca.bell(260)); if (rang.rang) break; await play(140, { bot: true }); } const s = await settle(); return { ok: !!rang?.rang, rang, s, why: rang?.rang ? '' : `the long ring did nothing at "${what}" (hero ${s.x},${s.z},y${s.y}; spot ${Math.round(t.x)},${Math.round(t.z)},y${Math.round(t.y)}; ${JSON.stringify(rang)}; ${w.why ?? ''})` }; }
  let got = null, offered = new Set();
  for (let i = 0; i < 10 && !got; i++) { const s = await play(24, { bot: true }); if (s.prompt) offered.add(s.prompt); if (s.prompt === want) got = await ev(() => window.__ca.pill()); else if (i % 3 === 2) await walk(t.x, t.z, { r: t.person ? 60 : 30, budget: 300, pred: (q) => q.prompt === want }); }
  for (let k = 0; k < 8 && !got; k++) { const an = k * Math.PI / 4, px = t.x + Math.cos(an) * (t.person ? 70 : t.r * 0.8), pz = t.z + Math.sin(an) * (t.person ? 70 : t.r * 0.8); await walk(px, pz, { r: 22, budget: 360, pred: (q) => q.prompt === want }); const s = await play(20, { bot: true }); if (s.prompt) offered.add(s.prompt); if (s.prompt === want) got = await ev(() => window.__ca.pill()); }
  if (!got) { const s = await st(); return { ok: false, offered: [...offered], s, why: `the prompt for "${want}" was never offered (hero ${s.x},${s.z},y${s.y}; spot ${Math.round(t.x)},${Math.round(t.z)},y${Math.round(t.y)} r${t.r}; prompts offered on the way: ${[...offered].join(', ') || 'none'}; enemies awake: ${s.awake}; ${w.why ?? ''})` }; }
  const s = await settle(); return { ok: true, s };
}
/** hold the bell button next to a bell: the long ring (crossing / hanging) */
async function ring(spotId, o = {}) { return useSpot(spotId, { ...o, how: 'bell' }); }
async function waitArea(id, max = 4200) { await play(max, { bot: false, pred: (q) => q.ready && q.area === id && !q.go && !q.xing, chunk: 60 }); const s = await settle(3600); return { ok: s.area === id, s, why: s.area === id ? '' : `still in ${s.area} (wanted ${id}); last events ${s.lr.slice(-5).join(' ')}` }; }
/** push the hero through / against an exit */
async function pushExit(id, { budget = 3600, to = null } = {}) {
  const x = await ev((q) => window.__ca.exit(q), id), s0 = await st(); if (!x) return { ok: false, why: `no exit "${id}" in ${s0.area}` };
  const w = await walk(x.x, x.z, { r: 12, budget, planR: 70, direct: true, pred: (s) => s.go || s.area !== s0.area || s.lr.includes('exit.locked:' + id) || s.lr.includes('exit.missing:' + id) });
  if (to) { const a = await waitArea(to); return { ...a, locked: x.locked }; }
  const s = await settle(); return { ok: w.ok || s.lr.includes('exit.locked:' + id), s, locked: x.locked, why: w.why };
}
/** the hero lets himself be struck down (no help: he walks into the enemies and does not defend) */
async function dieOnPurpose(group, budget = 5400) {
  await ev(() => { window.__ca.passive = true; });
  let s = await st(); const d0 = s.deaths; let used = 0;
  while (used < budget && s.deaths === d0) { const q = await ev((gr) => window.__ca.group(gr), group); if (!q.n) break; await ev((p) => window.__ca.route([p]), [q.best[0], q.best[1]]); s = await run(200, true); used += Math.max(1, s.i); }
  await ev(() => { window.__ca.passive = false; });
  if (s.deaths === d0) return { ok: false, why: `the hero was not struck down in ${budget} ticks standing among group "${group}"` };
  s = await play(900, { bot: false, pred: (q) => q.ready && !q.dead, chunk: 30 }); s = await settle(3000, false);
  return { ok: true, s };
}

// ───────── the table ─────────
let seenAt = 0, lastEvT = resume ? (ST.lastT ?? 0) : 0, saveN = resume ? Number(String(resume.file).split('/').pop().slice(0, 3)) || 0 : 0;
let shotBase = resume ? fs.readdirSync(SHOTD).filter((f) => /^\d{3}_/.test(f)).map((f) => Number(f.slice(0, 3))).reduce((a, b) => Math.max(a, b), 0) : 0;
const T_BASE = resume ? (resume.ticks ?? ST.num.ticks ?? 0) : 0, D_BASE = resume ? (ST.num.deaths ?? 0) : 0;   // ticks of the runs before this one (the page's counter starts at 0 again)
const fmtSeen = (e) => (e[0] === 'line' ? `${e[1]}: ${String(e[2]).replace(/\n/g, ' / ')}` : e[0] === 'banner' ? `[띠] ${e[1]}${e[2] ? ' — ' + e[2] : ''}` : e[0] === 'notice' ? `[알림] ${e[1]}` : e[0] === 'objective' ? `[목표] ${e[1]}` : e[0] === 'prompt' ? `[단추 안내] ${e[1]}` : e[0] === 'choice' ? `[고르기] ${e[1]}` : `[${e[0]}] ${e[1]}${e[2] ? ' ' + e[2] : ''}`);
const SEEN = [];
if (resume && fs.existsSync(`${OUT}/seen.txt`)) { for (const l of fs.readFileSync(`${OUT}/seen.txt`, 'utf8').split('\n')) if (l) SEEN.push(l); SEEN.push(`══ resumed from ${resume.file.split('/').pop()}`); }
async function collect(beat, result, still) {
  const c = await ev((from) => { const A = window.__ca, H = window.__v2.scene.host; return { completed: A.completed.splice(0), raised: A.raised.splice(0), done: H.st.state.done.slice(), lost: A.lost.splice(0), warnings: H.warnings.slice(), seen: A.seen(from), ticks: A.ticks, deaths: A.deaths, status: A.status(0), save: A.save() }; }, seenAt);
  c.ticks += T_BASE; c.deaths += D_BASE; for (const o of c.completed) { o.t0 += T_BASE; o.t1 += T_BASE; }
  const base = seenAt; seenAt += c.seen.length; SEEN.push(`── ${beat.id} — ${beat.label}`); for (const e of c.seen) SEEN.push('   ' + fmtSeen(e));
  const newErr = errs.splice(0); for (const e of newErr) ST.errors.push(e); for (const l of c.lost) ST.lost.push({ beat: beat.id, ...l });
  const warnNew = c.warnings.filter((w) => !ST.warnings.includes(w)); for (const w of warnNew) ST.warnings.push(w);
  const helpTxt = beatHelp.length ? beatHelp.join('; ') : null, evs = [];
  const row = (id, o) => { const first = !ST.rows[id]; if (first || ST.rows[id].status === 'not reached') { ST.rows[id] = { id, status: helpTxt ? 'helped' : 'honest', help: helpTxt, beat: beat.id, dt: Math.max(0, (o.t1 ?? c.ticks) - lastEvT), ticks: o.t1 ?? c.ticks, seen: (o.seen ?? []).map(fmtSeen), on: o.on ?? null, area: o.area ?? c.status.area, errors: newErr.map((e) => e.text), warnings: warnNew, still, times: 1 }; lastEvT = o.t1 ?? c.ticks; evs.push(id); } else ST.rows[id].times = (ST.rows[id].times ?? 1) + 1; };
  for (const o of c.completed) row(o.id, { ...o, seen: c.seen.slice(Math.max(0, o.seen0 - base), Math.max(0, o.seen1 - base)) });
  for (const id of c.done) if (!ST.rows[id]) row(id, { on: '(run from another sequence, or before this run)', seen: [] });
  ST.num.ticks = c.ticks; ST.num.deaths = c.deaths; ST.num.storySaves = c.status.saves; ST.lastT = lastEvT;
  // saves: one file per story event that completed in this beat (the game's own save object, composed now) + the beat to continue after
  if (c.save && !c.save.err && c.status.ready && !c.status.busy) for (const id of evs.length ? evs : []) { const f = `${SAVES}/${String(++saveN).padStart(3, '0')}_${id}.json`; fs.writeFileSync(f, JSON.stringify({ event: id, beat: beat.n, beatId: beat.id, ticks: c.ticks, at: new Date().toISOString(), save: c.save })); ST.num.saves++; }
  ST.beats.push({ n: beat.n, id: beat.id, label: beat.label, ok: !!result?.ok, why: result?.ok ? '' : String(result?.why ?? '?').slice(0, 700), help: helpTxt, events: evs, raised: c.raised.filter((q) => q.hits.length || /^(exit|interact|talk|trigger|boss|hero|bell)/.test(q.key)).map((q) => q.key + (q.hits.length ? '>' + q.hits.join('+') : '') + (q.again ? ' (again)' : '')).slice(0, 40), ticks: c.ticks, at: [c.status.area, c.status.x, c.status.z, c.status.y], hp: c.status.hp, deaths: c.deaths, still, errors: newErr.map((e) => e.text), obj: c.status.obj, flags: c.status.flags.join(' '), items: Object.keys(c.status.items).filter((k) => c.status.items[k] > 0).join(' ') });
  saveState(); writeTable(); fs.writeFileSync(`${OUT}/seen.txt`, SEEN.join('\n') + '\n');
  return { c, evs };
}
function writeTable() {
  const L = ['| # | event (GDD minute) | result | Δ ticks | what the player sees | errors · warnings | still |', '|---|---|---|---|---|---|---|'];
  EVENTS.forEach((e, i) => { const r = ST.rows[e.id]; const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s).replace(/\|/g, '/');
    if (!r) L.push(`| ${i + 1} | ${e.id} (${e.minute}) | not reached | | | | |`);
    else L.push(`| ${i + 1} | ${e.id} (${e.minute}) | ${r.status === 'honest' ? 'honest play' : r.status === 'helped' ? 'WITH HELP: ' + cut(r.help ?? '', 160) : r.status} | ${r.dt} | ${cut(r.seen.slice(0, 3).join(' ▸ '), 150)} | ${cut([...r.errors, ...r.warnings].join(' ; '), 120)} | ${r.still ? r.still.split('/').pop() : ''} |`); });
  fs.writeFileSync(`${OUT}/table.md`, L.join('\n') + '\n'); fs.writeFileSync(`${OUT}/table.json`, JSON.stringify({ rows: ST.rows, beats: ST.beats, helps: ST.helps, errors: ST.errors, lost: ST.lost, warnings: ST.warnings, num: ST.num, notes: ST.notes }, null, 1));
}

// ───────── the plan: one beat = one thing the player does; `fn` returns { ok, why } after honest play (and logged help where it failed) ─────────
const P = []; const add = (id, label, fn) => P.push({ n: P.length, id, label, fn });
const note = (m) => { ST.notes.push(`[${BEAT}] ${m}`); log('  note: ' + m); };
const putNear = async (x, z, why, what) => { const at = await ev(([a, b]) => window.__ca.put(a, b), [x, z]); help(why, `${what ?? 'put the hero'} at ${at}`); await play(20, { bot: false }); };
const emitHelp = async (name, data, why) => { await ev(([n, d]) => window.__ca.emit(n, d), [name, data]); help(why, `raised the engine event ${name} ${JSON.stringify(data)} by hand`); return settle(); };
/** a beat that walks into a trigger; on failure the hero is put into the box */
const trigBeat = (id, label, event, o = {}) => add(id, label, async () => { let w = await walkTrig(event, o); if (!w.ok && w.p) { await putNear(w.p[0], w.p[1], w.why, `put the hero into trigger ${event}`); await settle(); w = { ok: true }; } return w; });
const defOf = (what, data) => ev(([w, dt]) => { const a = window.__v2.scene.area; const p = a.actors.find((q) => q.id === w); if (p) return { person: true, id: p.id, talk: p.talk ?? null }; const q = a.interact.find((t) => (t.id === w || t.event === w) && (!dt || Object.keys(dt).every((k) => t.data?.[k] === dt[k]))); return q ? { person: false, id: q.id, kind: q.kind, event: q.event ?? null, data: q.data ?? null, locked: q.locked ?? null } : null; }, [what, data ?? null]);
/** press a person or a spot; when honest play does not get the prompt, the engine event is raised by hand (logged) */
async function spotOrHelp(id, what, o = {}) { const r = await useSpot(what, o); if (r.ok) return r; ST.num.lostWay.push({ beat: id, why: r.why }); const d = await defOf(what, o.data); if (!d) return r; if (d.person) await emitHelp('talk', { id: d.id, talk: d.talk }, r.why); else await emitHelp('interact', { id: d.id, kind: d.kind, event: d.event, data: d.data, locked: d.locked }, r.why); return { ok: true, helped: true }; }
const spotBeat = (id, label, what, o = {}) => add(id, label, async () => spotOrHelp(id, what, o));
/** the long ring at a bell and the crossing to `to`; help: the hero is put next to the bell, then the ring is raised by hand */
const crossBeat = (id, label, bell, to, o = {}) => add(id, label, async () => {
  let r = await ring(bell, { budget: o.budget ?? 3600 });
  if (!r.ok) { ST.num.lostWay.push({ beat: id, why: r.why }); const t = await ev((b) => window.__ca.spot(b), bell); if (!t) return r; await putNear(t.x, t.z - 44, r.why, `put the hero next to the bell ${bell}`); r = await ring(bell, { budget: 600 }); if (!r.ok) { const d = await defOf(bell); await emitHelp('interact', { id: d.id, kind: d.kind, event: d.event, data: d.data, locked: d.locked, ring: true }, r.why); } }
  if (o.shot) await shot(o.shot);
  const a = await waitArea(to, 6000); if (a.ok) ST.num.crossings++; if (o.after) await o.after(a); return a; });
const groupBeat = (id, label, group, o = {}) => add(id, label, async () => clearOrHelp(group, o));

add('opening', '서막 (banner, moon shot, first lines)', async () => { const s = await settle(2400, false); return { ok: !s.busy && s.obj !== '', why: 'the opening did not finish: ' + JSON.stringify(s).slice(0, 300) }; });
trigBeat('first_bell', '마을 외곽: 첫 종소리', 'bell.toll');
add('die_1', '일부러 쓰러진다 (첫 번째) — 해골 병사 앞에서 막지 않는다', async () => dieOnPurpose('out_a'));
add('die_2', '일부러 쓰러진다 (두 번째)', async () => dieOnPurpose('out_a'));
groupBeat('out_a', '마을 외곽의 해골 (group out_a)', 'out_a', { budget: 3000 });
trigBeat('street_enter', '큰길 어귀', 'tutorial.guard', { budget: 4800 });
groupBeat('st_a', '큰길의 첫 싸움 (group st_a)', 'st_a', { budget: 3600 });
spotBeat('door_pull', '갇힌 사람의 문을 당긴다', 'door.pull');
spotBeat('inn_door_now', '여관 문 (오늘 밤)', 'inn_door', { budget: 1800 });
groupBeat('st_b', '큰길 안쪽 (group st_b)', 'st_b', { budget: 3600 });
trigBeat('square_enter', '광장 어귀', 'square.enter', { budget: 4200 });
groupBeat('sq', '광장의 싸움 (group sq)', 'sq', { budget: 5400 });
spotBeat('rook_shop', '로크의 수레 (shop.rook)', 'rook_shop', { budget: 2400 });
spotBeat('well', '우물', 'well', { budget: 2400 });
trigBeat('church', '성당: 알베르토 신부와 엘리제, 약속', 'church.arrive', { budget: 4200 });
spotBeat('rest_church', '촛불 앞에서 쉰다 → 저장', 'church_rest');
add('bell_now_before', '큰 종 앞에서 「종」을 길게 (오늘 밤, 떨어지기 전)', async () => ring('big_bell'));
add('tower_door', '종탑 문 → 종탑', async () => pushExit('to_belltower', { to: 'belltower_now' }));
add('tower_climb', '종탑을 오른다 (trigger tower.top) — honest budget 7200 ticks', async () => { let w = await walkTrig('tower.top', { budget: 7200 }); const s = await st(); if (!w.ok && s.area === 'belltower_now' && w.p) { ST.num.lostWay.push({ beat: 'tower_climb', why: w.why }); await putNear(w.p[0], w.p[1], w.why, 'put the hero on the top floor inside trigger tower.top'); await settle(); w = { ok: true }; } return w; });
add('tower_bats', '박쥐 떼 (group tower_bats) → 종에 금이 가고 떨어진다', async () => { await clearOrHelp('tower_bats', { budget: 4200 }); return waitArea('eshville_past', 6000); });
add('bell_past_no', '그 밤의 큰 종: 매듭도 열쇠도 없이 길게 울린다', async () => ring('big_bell'));
trigBeat('past_street', '그 밤의 큰길', 'past.street', { budget: 6000 });
groupBeat('st_p', '그 밤 큰길의 싸움 (group st_p)', 'st_p', { budget: 4800 });
spotBeat('tavern_door', '주막 문 (그 밤)', 'inn_door', { budget: 1500 });
spotBeat('edmund_1', '에드문트의 식탁 (첫 번째)', 'edmund', { budget: 3600 });
spotBeat('edmund_2', '종 조각을 보인다 → 발크레인 매듭', 'edmund', { budget: 900 });
spotBeat('hadwin1', '대장간의 하드윈 1세: 열쇠를 맡긴다 (은 열쇠)', 'hadwin1', { budget: 3600 });
add('to_bell_past', '그 밤의 큰 종 앞으로 (section church → 건넘 안내)', async () => { const t = await ev(() => window.__ca.spot('big_bell')); const w = await walk(t.x, t.z, { r: 70, budget: 5400 }); await settle(); return w; });
crossBeat('first_cross', '종을 길게 울린다 → 첫 건넘 → 달라진 오늘 밤', 'big_bell', 'eshville_now', { shot: 'crossing' });
add('smithy_now', '오늘 밤의 대장간: 손자 하드윈의 서랍', async () => { let r = await useSpot('smithy_door', { budget: 4800 }); const s = await st(); if (!s.items.key_silver) { note('the smithy door spot did not give the key (' + (r.why ?? 'pressed') + ') — talking to Hadwin'); r = await useSpot('hadwin', { budget: 1200 }); } const e = await st(); return { ok: !!e.items.key_silver, why: 'no silver key after the smithy: ' + (r.why ?? '') }; });
add('gate_now', '묘지 문: 은 열쇠로 연다 (exit to_graveyard)', async () => { const r = await pushExit('to_graveyard', { budget: 5400 }); let s = await st(); if (!s.flags.includes('gate_open')) { ST.num.lostWay.push({ beat: 'gate_now', why: r.why }); s = await emitHelp('exit.locked', { id: 'to_graveyard', locked: 'key_graveyard' }, 'the locked gate did not answer the hero pushing against it: ' + (r.why ?? '') + ' ' + s.lr.slice(-4).join(' ')); } return { ok: s.flags.includes('gate_open'), why: 'gate_open not set (key in the bag: ' + !!s.items.key_silver + ')' }; });
add('to_graveyard', '묘지 문을 지난다 → 안개의 묘지', async () => pushExit('to_graveyard', { to: 'graveyard_now' }));
trigBeat('bats', '묘지 가는 길: 박쥐', 'bats.swoop', { budget: 3600 });
trigBeat('elite', '정예 무덤지기 갑주 앞', 'elite.gravekeeper', { budget: 4200 });
groupBeat('elite_fight', '무덤지기 갑주와 싸운다 (group gate) — honest budget 7200 ticks', 'gate', { budget: 7200 });
trigBeat('echo_hint', '안개의 묘지: 메아리 안내', 'echo.hint', { budget: 3600 });
add('echo_first', '「종」을 짧게 — 숨은 유령을 드러낸다', async () => { let r = null; for (let i = 0; i < 4; i++) { r = await ev(() => window.__ca.echo()); if (r.raised?.some((q) => q.startsWith('bell.echo'))) break; await play(150, { bot: true }); } await settle(); return { ok: !!r?.raised?.some((q) => q.startsWith('bell.echo')), why: 'no bell.echo was raised: ' + JSON.stringify(r) }; });
add('ghosts', '유령들 (group ghosts) — 이야기에 필요 없지만 길에 있다', async () => { const r = await clear('ghosts', { budget: 3600 }); if (!r.ok) note('ghosts not cleared honestly: ' + r.why); await settle(); return { ok: true }; });
spotBeat('grave_now_a', '이름 없는 무덤 (첫째, 오늘 밤)', 'nameless_a');
spotBeat('grave_now_b', '이름 없는 무덤 (둘째, 오늘 밤)', 'nameless_b');
spotBeat('stones', '발크레인의 비석', 'valkrein_stones');
const hookUp = async (label) => { const t = await ev(() => window.__ca.spot('depths_ring')); if (!t) return { ok: false, why: 'no whip ring depths_ring here' }; let s = await st(); if (s.y > 100) return { ok: true, already: true };
  const w = await walk(t.x, t.z - 150, { r: 60, budget: 3600, pred: (q) => q.hook != null && Math.hypot(q.x - t.x, q.z - t.z) < 230 }); let k = null;
  for (let i = 0; i < 6; i++) { s = await st(); if (s.y > 100) break; if (s.hook == null) { await walk(t.x, t.z - 120, { r: 40, budget: 600, pred: (q) => q.hook != null }); } k = await ev(() => window.__ca.skill()); await play(30, { bot: true }); }
  s = await st(); return { ok: s.y > 100, s, why: `the whip hook did not carry the hero up (${label}): hero ${s.x},${s.z},y${s.y}; last press ${JSON.stringify(k)}; ${w.why ?? ''}` }; };
add('hook_now', '채찍 걸기 → 납골당 앞 단 (오늘 밤)', async () => { const r = await hookUp('graveyard_now'); if (!r.ok) { ST.num.lostWay.push({ beat: 'hook_now', why: r.why }); await putNear(600, 1905, r.why, 'put the hero on the terrace before the ossuary door'); return { ok: true }; } return r; });
spotBeat('ossuary_door_now_1', '납골당 문 (오늘 밤, 이름을 새기기 전)', 'ossuary_door');
add('ossuary_exit_now', '납골당 문턱을 밀어 본다 (exit to_ossuary, 잠김)', async () => pushExit('to_ossuary', { budget: 900 }));
add('back_to_eshville', '마을로 돌아간다 (exit to_eshville)', async () => pushExit('to_eshville', { to: 'eshville_now', budget: 7200 }));
crossBeat('cross_to_past', '큰 종에서 길게 → 그 밤으로 (ev_bell_cross)', 'big_bell', 'eshville_past', { budget: 6000 });
add('gate_past', '그 밤의 묘지 문: 같은 열쇠로 연다', async () => { const r = await pushExit('to_graveyard', { budget: 4200 }); let s = await st(); if (!s.flags.includes('past_gate_open')) { ST.num.lostWay.push({ beat: 'gate_past', why: r.why }); s = await emitHelp('exit.locked', { id: 'to_graveyard', locked: 'past_gate' }, 'the locked gate did not answer the hero pushing against it: ' + (r.why ?? '') + ' ' + s.lr.slice(-4).join(' ')); } return { ok: s.flags.includes('past_gate_open'), why: 'past_gate_open not set (key in the bag: ' + !!s.items.key_silver + ')' }; });
add('to_graveyard_past', '그 밤의 묘지로', async () => pushExit('to_graveyard', { to: 'graveyard_past' }));
trigBeat('keeper', '그 밤의 묘지기', 'keeper.greets', { budget: 5400 });
spotBeat('carve_a', '이름을 새긴다 — 첫째 무덤', 'nameless_a');
spotBeat('carve_b', '이름을 새긴다 — 둘째 무덤', 'nameless_b');
trigBeat('edmund_grave', '묘지 깊은 곳: 에드문트와 다시 (길종을 받는다)', 'grave.edmund', { budget: 3600 });
add('hook_past', '채찍 걸기 → 건너편 종대 (그 밤)', async () => { const r = await hookUp('graveyard_past'); const s = await st(); note(`after the hook landing the prompt on offer is "${s.prompt}" (hero ${s.x},${s.z},y${s.y})`); if (!r.ok) { ST.num.lostWay.push({ beat: 'hook_past', why: r.why }); await putNear(600, 1905, r.why, 'put the hero on the terrace before the ossuary door'); return { ok: true }; } return r; });
crossBeat('hang_bell', '빈 종대에 길종을 건다 (「종」 길게) → 백 년 → 오늘 밤', 'road_bell', 'graveyard_now', { budget: 1800, shot: 'hang_cross' });
spotBeat('ossuary_door_now_2', '납골당 문 (오늘 밤, 길종을 건 뒤) → 열린다', 'ossuary_door', { budget: 1800 });
add('enter_ossuary', '납골당으로 (exit to_ossuary)', async () => { const s = await st(); if (s.area === 'ossuary_now') { note('already inside the ossuary: the door opened under the hero and took him in'); return { ok: true }; } return pushExit('to_ossuary', { to: 'ossuary_now', budget: 2400 }); });
trigBeat('oss_coffins', '관의 복도', 'oss.coffins', { budget: 3600 });
groupBeat('oss_hall', '복도의 해골 (group oss_hall)', 'oss_hall', { budget: 3000 });
add('oss_probe_1', '오늘 밤 관의 복도는 막혀 있는가 (걸어서 끝까지 가 본다)', async () => { const far = await ev(() => window.__ca.plan(600, 960, 60)); note(`tonight, a walking route from the hero to the far end of the coffin corridor (600,960): ${far ? 'EXISTS (' + far + ' way points) — the corridor is not shut tonight' : 'none (shut, as designed)'}`); return { ok: true }; });
crossBeat('oss_cross_1', '어귀의 종에서 그 밤으로', 'bell_entry', 'ossuary_past');
add('oss_wedge', '틈의 방 (그 밤): 석상을 밀어 둔다', async () => { const far = await ev(() => window.__ca.plan(600, 1450, 50)); note(`that night, a walking route over the gap to (600,1450): ${far ? 'EXISTS before anything is wedged' : 'none'}`); return spotOrHelp('oss_wedge', 'oss_wedge', { budget: 4800 }); });
crossBeat('oss_cross_2', '복도 끝의 종에서 오늘 밤으로', 'bell_coffins', 'ossuary_now');
trigBeat('oss_gap', '틈 (오늘 밤): 백 년 묵은 석상을 딛고', 'oss.gap', { budget: 3600 });
trigBeat('oss_arena', '곡하는 방', 'oss.arena', { budget: 3600 });
add('oss_arena_fight', '곡하는 방의 싸움 (group oss_arena) — honest budget 6000 ticks', async () => { const r = await clear('oss_arena', { budget: 6000 }); if (!r.ok) note('oss_arena not cleared honestly (no sequence listens to it): ' + r.why); await settle(); return { ok: true }; });
trigBeat('oss_lamp', '등불대의 방: 세라', 'oss.lamp', { budget: 4800 });
spotBeat('oss_riddle', '닳은 석관 (누구의 관인가)', 'oss_riddle', { budget: 3600 });
add('oss_riddle_echo', '석관 앞에서 「종」을 짧게 (메아리로 읽는다)', async () => { let r = null; for (let i = 0; i < 4; i++) { r = await ev(() => window.__ca.echo()); if (r.raised?.some((q) => q.includes('ev_oss_riddle_echo'))) break; await play(150, { bot: true }); } const s = await settle(); return { ok: s.flags.includes('riddle_done'), why: 'riddle_done not set: ' + JSON.stringify(r) }; });
crossBeat('oss_cross_3', '석관의 방 종에서 그 밤으로 → 조종 넷을 받는다', 'bell_riddle', 'ossuary_past');
for (const k of [1, 2, 3, 4]) add('knell_' + k, `종대 ${k} 에 조종을 건다`, async () => { let r = await useSpot('knell_' + k, { budget: 4800 }); let s = await st(); if (!s.flags.includes('knell_' + k)) { note(`knell_${k}: the pill did not hang it (${r.why ?? 'pressed'}) — trying the long ring`); r = await ring('knell_' + k, { budget: 900 }); s = await st(); } if (!s.flags.includes('knell_' + k)) { ST.num.lostWay.push({ beat: 'knell_' + k, why: r.why }); s = await emitHelp('interact', { id: 'knell_' + k, kind: 'bell', event: 'oss.knell', data: { post: k }, locked: null }, r.why ?? 'no prompt'); } return { ok: s.flags.includes('knell_' + k), why: `knell_${k} not set (knell bells in the bag: ${s.items.knell_bell ?? 0})` }; });
crossBeat('oss_cross_4', '석관의 방 종으로 돌아가 오늘 밤으로 (백 년) — 보스 방의 종으로 건너면 여왕의 방 안, 문턱 뒤에 선다(첫 판의 기록)', String(args.back || 'bell_riddle'), 'ossuary_now', { after: async () => { const s = await st(); note(`arrived tonight inside the boss room at (${s.x},${s.z}); boss ${JSON.stringify(s.boss)}; enemies awake ${s.awake}; ev_boss_intro done: ${ST.rows.ev_boss_intro ? 'yes' : 'no'}`); } });
spotBeat('boss_rest', '보스 방 앞 쉼터: 로테의 빵', 'boss_rest', { budget: 4800 });
trigBeat('boss_enter', '맨 안: 밴시 여왕 (노래)', 'boss.enter', { budget: 3600 });
const bossFight = async (label, until, { budget = 9000, maxDeaths = 2 } = {}) => {
  let s = await st(), used = 0; const d0 = s.deaths, t0 = s.ticks; await ev(() => { const B = window.__bot; B.opt.giveUp = 1e9; B.skipMap = {}; });
  while (used < budget * KB && !until(s) && s.deaths - d0 <= maxDeaths) {
    const q = await ev(() => { const sim = window.__v2.scene.sim; for (const e of sim.enemies) if (e.def?.boss && !e.dead) return [Math.round(e.x), Math.round(e.z)]; return null; });
    if (!q) break; if (Math.hypot(q[0] - s.x, q[1] - s.z) > 260) { const n = await ev(([x, z]) => window.__ca.plan(x, z, 120), q); if (!n) await ev((p) => window.__ca.route([p]), q); } else await ev((p) => window.__ca.route([p]), q);
    s = await run(180, true); used += Math.max(1, s.i); if (!s.ready) { await page.waitForTimeout(350); s = await st(); }
    if (s.modal || s.busy) s = await settle();
  }
  await ev(() => { window.__bot.opt.giveUp = 1500; });
  ST.num.fights.push({ beat: BEAT, group: 'boss:' + label, ticks: s.ticks - t0, hp: s.hp, deaths: s.deaths - d0, boss: s.boss });
  return { ok: until(s), s, used, deaths: s.deaths - d0, why: `${label}: not reached in ${used} ticks, ${s.deaths - d0} falls; boss ${JSON.stringify(s.boss)}; hero hp ${s.hp}` };
};
add('boss_1', '밴시 여왕 1막 — 절반까지 (honest: 9000 ticks or 3 falls)', async () => { let r = await bossFight('phase 1 to the flight', (s) => s.flags.includes('queen_fled')); if (!r.ok) { const hp = await ev(() => window.__ca.bossHp(0.52)); help(r.why, `set the queen's health to ${JSON.stringify(hp)} (just above half) by script`); r = await bossFight('phase 1 after help', (s) => s.flags.includes('queen_fled'), { budget: 3600, maxDeaths: 3 }); if (!r.ok) { await emitHelp('boss.phase', { boss: 'banshee_queen', phase: 'flee' }, r.why); } } await settle(); return { ok: true }; });
crossBeat('boss_chase', '달아난 여왕을 쫓아 그 밤으로 (보스 방의 종)', 'bell_arena', 'ossuary_past');
add('boss_past', '그 밤의 여왕을 몰아낸다 (honest: 9000 ticks or 3 falls)', async () => { let r = await bossFight('driven back that night', (s) => s.flags.includes('queen_driven')); if (!r.ok) { const hp = await ev(() => window.__ca.bossHp(0.52)); help(r.why, `set the queen's health to ${JSON.stringify(hp)} by script`); r = await bossFight('that night after help', (s) => s.flags.includes('queen_driven'), { budget: 3600, maxDeaths: 3 }); if (!r.ok) await emitHelp('boss.phase', { boss: 'banshee_queen', phase: 'driven' }, r.why); } await settle(); return { ok: true }; });
crossBeat('boss_back', '오늘 밤으로 돌아온다 (--back2 로 고른 종; 기본은 보스 방의 종)', String(args.back2 || 'bell_arena'), 'ossuary_now', { after: async () => { const s = await st(); note(`back tonight: boss ${JSON.stringify(s.boss)}`); } });
add('boss_die', '보스 앞에서 일부러 쓰러진다 (ev_retry_boss) — 이미 쓰러졌으면 건너뛴다', async () => { if (ST.rows.ev_retry_boss) return { ok: true, skipped: true }; const r = await dieOnPurpose('boss', 7200); return r; });
add('boss_2', '밴시 여왕 2막 — 무릎 꿇을 때까지 (honest: 12000 ticks or 3 falls)', async () => { let r = await bossFight('to the kneel', (s) => !!s.boss?.kneel || s.flags.includes('queen_sent') || s.lr.includes('boss.phase:kneel'), { budget: 12000 }); if (!r.ok) { const hp = await ev(() => window.__ca.bossHp(0.06)); help(r.why, `set the queen's health to ${JSON.stringify(hp)} (just above the kneel) by script`); r = await bossFight('to the kneel after help', (s) => !!s.boss?.kneel || s.lr.includes('boss.phase:kneel'), { budget: 3600, maxDeaths: 3 }); } return r; });
add('boss_knell', '무릎 꿇은 여왕 곁에서 「종」을 길게 — 조종', async () => { let s = await st(), ok = false, rang = null;
  for (let i = 0; i < 5 && !ok; i++) { const q = await ev(() => { const sim = window.__v2.scene.sim; for (const e of sim.enemies) if (e.def?.boss && !e.dead) return [Math.round(e.x), Math.round(e.z), !!e.kneel]; return null; }); if (!q) break; if (!q[2]) { await bossFight('kneel again', (x) => !!x.boss?.kneel, { budget: 2400 }); }
    await ev(() => { window.__ca.autoEcho = false; }); await walk(q[0], q[1], { r: 150, budget: 600 }); rang = await ev(() => window.__ca.bell(260)); await ev(() => { window.__ca.autoEcho = true; }); s = await settle(4200); ok = s.flags.includes('queen_sent'); }
  if (!ok) { await emitHelp('boss.phase', { boss: 'banshee_queen', phase: 'sent' }, `the knell did not send the queen: ${JSON.stringify(rang)}; boss ${JSON.stringify(s.boss)}`); s = await st(); ok = s.flags.includes('queen_sent'); }
  return { ok, why: 'queen_sent not set' }; });
crossBeat('cross_to_elise', '보스 방의 종에서 그 밤으로 (잠든 엘리제에게)', 'bell_arena', 'ossuary_past');
add('elise_wake', '잠든 엘리제를 깨운다 (interact oss.elise)', async () => {
  let r = await useSpot('oss_elise', { budget: 4800 }); let s = await st();
  if (!s.flags.includes('elise_found')) {
    // what the player gets instead: the prompt on offer at the girl, pressed three times
    const tried = []; for (let i = 0; i < 3; i++) { const t = await ev(() => window.__ca.spot('elise')); if (t) await walk(t.x, t.z - 40, { r: 30, budget: 600 }); const p = (await play(20, { bot: true })).prompt; const got = p ? await ev(() => window.__ca.pill()) : null; s = await settle(); tried.push(`${p}→${got}; elise_found ${s.flags.includes('elise_found')}; last ${s.lr.slice(-2).join(' ')}`); if (s.flags.includes('elise_found')) break; }
    note('at the sleeping girl: ' + tried.join(' | ') + ' ; spot search said: ' + (r.why ?? 'ok'));
    if (!s.flags.includes('elise_found')) { await emitHelp('interact', { id: 'oss_elise', kind: 'sign', event: 'oss.elise', data: null, locked: null }, 'the spot oss_elise is never offered: the girl (a person, talk elise.wake) always wins the prompt — ' + (r.why ?? '')); }
  }
  return waitArea('eshville_past', 6000); });
crossBeat('ending_bell', '두 종지기의 약속 뒤, 큰 종을 길게 → 오늘 밤', 'big_bell', 'eshville_now', { shot: 'ending_cross' });
add('after_end', '맺음 뒤 (6초 뒤 저장하고 장면을 떠난다)', async () => { let s = null; try { s = await play(600, { bot: false, pred: (q) => !q.scene, chunk: 60 }); } catch (e) { return { ok: true, left: true, why: 'the scene was left: ' + String(e).slice(0, 120) }; } const sv = await ev(() => { try { const o = JSON.parse(localStorage.getItem('bn.v2.save')); return o ? { why: o.why, area: o.area, done: o.story?.done?.length } : null; } catch { return null; } }).catch(() => null); note(`after the end: scene active ${s?.scene}; ended flag ${s?.ended}; stored save ${JSON.stringify(sv)}`); return { ok: true }; });

// side beats (only with --only): the past door of the ossuary after the road bell hangs
P.push({ n: P.length, id: 'side_past_door', side: true, label: '곁가지: 길종을 건 뒤 그 밤의 납골당 문을 눌러 본다', fn: async () => { let r = await ring('road_bell', { budget: 2400 }); const a = await waitArea('graveyard_past', 6000); if (!a.ok) return { ok: false, why: 'could not cross at the road bell: ' + (r.why ?? a.why) }; ST.num.crossings++; const d = await useSpot('ossuary_door', { budget: 1500 }); const s = await st(); note(`past door after the bell hangs: ${d.ok ? 'pressed' : d.why}; last events ${s.lr.slice(-6).join(' ')}`); r = await ring('road_bell', { budget: 2400 }); const b = await waitArea('graveyard_now', 6000); if (b.ok) ST.num.crossings++; return { ok: d.ok, why: d.why }; } });
P.push({ n: P.length, id: 'side_gate_push', side: true, label: '곁가지: 은 열쇠를 들고 닫힌 묘지 문을 민다 (--from ev_smithy_now --only side_gate_push --keep 1)', fn: async () => { const w = await walk(4590, 950, { r: 40, budget: 5400 }); const s0 = await st(); await ev(() => window.__ca.route([[4590, 1100]])); let s = await run(240, true); await ev(() => window.__ca.route([[4530, 1100], [4650, 1100]])); s = await run(240, true); note(`at the shut cemetery gate with the silver key in the bag (${!!s.items.key_silver}): walked to (${s0.x},${s0.z}) [${w.ok ? 'reached' : w.why}], pushed north for 480 ticks, now at (${s.x},${s.z}); prompt on offer: ${s.prompt}; things shown meanwhile: ${s.seen - s0.seen}; engine events: ${s.lr.join(' ') || 'none'}; objective line: "${s.obj}"`); return { ok: true }; } });
// the area each beat is played in: when an earlier beat failed and the hero is elsewhere, he is moved there by script (logged help) so the audit goes on
const NEED = {};
const need = (area, spawn, ids) => { for (const id of ids.split(' ')) NEED[id] = [area, spawn]; };
need('graveyard_now', 'from_eshville', 'bats elite elite_fight echo_hint echo_first ghosts grave_now_a grave_now_b stones hook_now ossuary_door_now_1 ossuary_exit_now back_to_eshville');
need('eshville_now', 'from_graveyard', 'cross_to_past'); need('eshville_past', 'bell', 'gate_past to_graveyard_past ending_bell');
need('graveyard_past', 'from_eshville', 'keeper carve_a carve_b edmund_grave hook_past hang_bell'); need('graveyard_now', 'from_ossuary', 'ossuary_door_now_2');
need('ossuary_now', 'entry', 'oss_coffins oss_hall oss_probe_1 oss_cross_1'); need('ossuary_past', 'entry', 'oss_wedge oss_cross_2'); need('ossuary_now', 'wedge_far', 'oss_gap oss_arena oss_arena_fight oss_lamp oss_riddle oss_riddle_echo oss_cross_3');
need('ossuary_past', 'rest', 'knell_1 knell_2 knell_3 knell_4 oss_cross_4 boss_past boss_back elise_wake'); need('ossuary_now', 'rest', 'boss_rest boss_enter boss_1 boss_chase boss_die boss_2 boss_knell cross_to_elise');
// ───────── run ─────────
const SKIP = args.skip ? String(args.skip).split(',') : [];
const ONLY = args.only ? String(args.only).split(',') : null, RB = resume ? Math.max(P.findIndex((b) => b.id === resume.beatId), -1) : -1;   // the beat we continue after is found by its id (the plan may have grown since the save was written)
if (resume && !args.keep && !ONLY) {   // forget what the earlier run recorded after the save we continue from (those beats are played again)
  const idx = Object.fromEntries(P.map((b) => [b.id, b.n])), later = (id) => (idx[id] ?? -1) > RB;
  ST.beats = ST.beats.filter((b) => !later(b.id)); ST.helps = ST.helps.filter((h) => !later(h.beat)); ST.num.lostWay = ST.num.lostWay.filter((h) => !later(h.beat)); ST.num.fights = ST.num.fights.filter((h) => !later(h.beat));
  for (const k of Object.keys(ST.rows)) if (later(ST.rows[k].beat)) delete ST.rows[k];
  for (const f of fs.readdirSync(SAVES)) { if (!/^\d{3}_/.test(f)) continue; if (Number(f.slice(0, 3)) > saveN) fs.rmSync(`${SAVES}/${f}`); }
  lastEvT = resume.ticks ?? lastEvT;
}
let code = 0;
try {
  const o = await open(); log(`opened: ${JSON.stringify(o)}${resume ? ' (continuing after beat ' + resume.beat + ' ' + resume.beatId + ')' : ' (clean save)'}`);
  if (o.err || !o.story || o.hud !== 'ui') throw new Error('the game did not open as 「본 게임」 with the story and the new interface: ' + JSON.stringify(o));
  ST.open = o;
  if (resume) await settle(3000);
  for (const b of P) {
    if (ONLY ? !ONLY.includes(b.id) : (b.side || SKIP.includes(b.id) || (resume && b.n <= RB))) continue;
    BEAT = b.id; beatHelp = []; const t0 = Date.now(); let r;
    await ev(() => { window.__ca.lr.length = 0; }).catch(() => {});
    if (NEED[b.id]) { const s0 = await st().catch(() => null); if (s0 && s0.ready && s0.area !== NEED[b.id][0]) { const okGo = await ev(([a, sp]) => window.__v2.scene.travelTo(a, sp), NEED[b.id]).catch(() => false); help(`the hero is in ${s0.area} but this beat is played in ${NEED[b.id][0]} (an earlier beat did not get him there)`, `moved the hero to ${NEED[b.id][0]} / spawn ${NEED[b.id][1]} with scene.travelTo (${okGo})`); await waitArea(NEED[b.id][0], 3000).catch(() => {}); } }
    try { r = await b.fn(); } catch (e) { r = { ok: false, why: 'tool error: ' + String(e?.message ?? e).slice(0, 300) }; if (/Target closed|crash|Execution context/.test(String(e))) { errs.push({ beat: b.id, text: '[tool] ' + String(e).slice(0, 200) }); } }
    let still = null; try { still = await shot(b.id); } catch { /* no picture */ }
    let col = null; try { col = await collect(b, r, still); } catch (e) { log('  collect failed: ' + String(e).slice(0, 200)); errs.push({ beat: b.id, text: '[tool] collect: ' + String(e).slice(0, 200) }); }
    const s = col?.c.status;
    log(`${r?.ok ? 'ran ' : 'NOT '} ${b.n} ${b.id}${r?.ok ? '' : ' — ' + String(r?.why ?? '?').slice(0, 400)} [${s ? `${s.area} ${s.x},${s.z},y${s.y} hp ${s.hp} t${s.ticks}` : '?'}; events ${col?.evs.join(' ') || '-'}; ${((Date.now() - t0) / 1000).toFixed(0)} s]`);
    if (TO && ST.rows[TO]) { log('reached --to ' + TO); break; }
    if (MAXS && (Date.now() - T0) / 1000 > MAXS) { log(`stopped after ${MAXS} s of wall time at beat ${b.n} ${b.id} — continue with --from last`); break; }
    if (s && !s.scene) { log('the scene was left (the end)'); break; }
  }
} catch (e) { code = 1; log('FATAL ' + String(e?.stack ?? e).slice(0, 800)); ST.notes.push('fatal: ' + String(e?.message ?? e).slice(0, 400)); }
for (const e of errs.splice(0)) ST.errors.push(e);
saveState(); writeTable();
log(`table: ${OUT}/table.md · rows reached ${Object.keys(ST.rows).length}/${EVENTS.length} · helps ${ST.helps.length} · page errors ${ST.errors.length} · context lost ${ST.lost.length} · saves ${ST.num.saves}`);
await browser.close().catch(() => {}); srv.close?.();
process.exit(code);
