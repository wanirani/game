// CHAPTER-VERIFY: tries to break what the CHAPTER lane staged - the queen's stretches, the rest point, the road bell, the story's hold on enemies,
// the ending card - from saves of an honest bot run (tools/v2/chapter_audit.mjs writes one after every story event).
//   node tools/v2/chapter_verify.mjs --saves <dir of chapter_audit saves> [--out <dir>] [--only S3,S0]
// NOT honest play where it says so: the tool puts the hero at a spot, sets the queen's health and fells the hero by the rules' own _die (as
// tools/v2/chapter_states.mjs does). Honest here: every ring of the bell is a press of the pad's own 「종」 button (pointer events), every load is
// the game's own load of a stored save, every save is the game's own (host.saveNow / the story's save step). No flag is ever set by hand.
// Exit 1 when a check fails.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
if (!args.saves || args.saves === true) { console.error('usage: node tools/v2/chapter_verify.mjs --saves <dir of chapter_audit saves> [--out <dir>] [--only S3,S0]'); process.exit(2); }
const DIR = String(args.saves), OUT = String(args.out || '/tmp/claude-0/v2/chapterverify/probe'), ONLY = args.only && args.only !== true ? String(args.only).split(',') : null;
fs.mkdirSync(OUT, { recursive: true });
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const port = 9100 + Math.floor(Math.random() * 600), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
let bad = 0, n = 0; const lines = [], errors = [];
const put = (l) => { lines.push(l); console.log(l); fs.writeFileSync(`${OUT}/verify.txt`, lines.join('\n') + '\n'); };
const ok = (cond, text) => { n++; put(`${cond ? 'ok  ' : 'FAIL'} ${text}`); if (!cond) bad++; };
const J = (o) => JSON.stringify(o);
const obs = (label, o) => put(`     · ${label}: ${typeof o === 'string' ? o : J(o)}`);
const saveOf = (id) => { const f = fs.readdirSync(DIR).filter((x) => x.replace(/^\d+_/, '').replace(/\.json$/, '') === id).sort().pop(); if (!f) throw new Error('no save for ' + id + ' in ' + DIR); const o = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8')); return JSON.stringify(o.save ?? o); };

/** in the page: fast-forward (dialogue pages are turned every P.adv ticks; 0 = never), the state, the scripted hands, the pad's own buttons */
function install() {
  const g = window.__game, v = window.__v2, P = (window.__cs = { d: 0, adv: 6 });
  const queen = () => v.scene.sim?.enemies.find((x) => x.def?.boss && !x.dead && x.state !== 'dead') ?? null;
  const fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
  const btn = (id) => { let b = (v.scene.hud.metrics?.().pad?.buttons ?? []).find((q) => q.id === id) ?? null; if (b && !(b.cx > 0)) { try { g.alpha = 1; g.render(); } catch { /* between areas */ } b = (v.scene.hud.metrics?.().pad?.buttons ?? []).find((q) => q.id === id) ?? null; } return b && b.cx > 0 ? b : null; };
  const step = () => { const sc = v.scene; if (sc.hud?.modal === 'dialog' && P.adv > 0 && ++P.d >= P.adv) { P.d = 0; sc.hud.advanceDialog(); } g.tick(1 / 60); };
  P.idle = () => { const sc = v.scene, H = sc.host; return !!v.ready && !!sc.sim && !sc.hud.modal && !H.st.busy && !sc._go && !sc.xing && sc.fadeA <= 0.01; };
  P.state = () => {
    const sc = v.scene, sim = sc.sim, h = sim?.hero, e = sim ? queen() : null, H = sc.host;
    return { ready: !!v.ready && !!sim, area: v.area, idle: P.idle(), x: h ? Math.round(h.x) : 0, z: h ? Math.round(h.z) : 0, hp: h ? Math.round(h.hp) : 0, dead: !!h?.dead, deaths: sim?.deaths ?? 0,
      rest: sim?.rest ? [Math.round(sim.rest.x), Math.round(sim.rest.z)] : null,
      queen: e ? { hp: Math.round(e.hp), active: !!e.active, alpha: +e.alpha.toFixed(2), phase: e.bphase, hold: !!e.fleeHold, drawn: !!e._a3, x: Math.round(e.x), z: Math.round(e.z), kneel: e.kneel > 0 } : null,
      q: sc.ch ? { hp: sc.ch.q.hp, cur: Math.round(sc.ch.q.cur) } : null, tear: !!sc.ch?.tear, flags: ['queen_fled', 'queen_driven', 'queen_sent'].filter((f) => sc._flagFn(f)), modal: sc.hud.modal ?? null,
      bar: sc.state?.boss ? Math.round(sc.state.boss.hp ?? -1) : null, shot: !!H?.shotLock, lock: !!H?.locks?.(), ended: H?.ended ?? null, obj: H?.objective ?? '', seen: H?.seen.length ?? 0, warn: H?.warnings.length ?? 0 };
  };
  P.run = (ticks, untilIdle) => { g._pageHidden = true; for (let i = 0; i < ticks; i++) { step(); if (untilIdle && i > 8 && P.idle()) break; } try { g.alpha = 1; g.render(); } catch { /* between areas */ } return P.state(); };
  P.putY = (x, z, y) => { const sc = v.scene; sc._enterAt(null, { x, z, y }); const h = sc.sim.hero; return [Math.round(h.x), Math.round(h.z), Math.round(h.y)]; };
  P.put = (x, z) => P.putY(x, z, 0);
  P.atBell = (id) => { const sc = v.scene, d = sc.area.interact.find((q) => q.id === id); if (!d) return null; const y = d.y ?? 0; for (const [ox, oz] of [[0, -44], [0, 44], [-44, 0], [44, 0], [-40, -40], [40, -40]]) if (sc._spotOk({ x: d.x + ox, z: d.z + oz, y })) return P.putY(d.x + ox, d.z + oz, y); return null; };
  P.beside = (dist) => { const sc = v.scene, e = queen(); if (!e) return null; for (const [ox, oz] of [[-dist, 0], [dist, 0], [0, -dist], [0, dist]]) if (sc._spotOk({ x: e.x + ox, z: e.z + oz, y: 0 })) return P.put(e.x + ox, e.z + oz); return null; };
  P.travel = (id, spawn) => v.scene.travelTo(id, spawn);
  P.queenHp = (hp) => { const e = queen(); if (!e) return null; e.hp = hp; return Math.round(e.hp); };
  P.die = () => { const sim = v.scene.sim; sim._die(sim.hero); return true; };
  P.saved = () => localStorage.getItem('bn.v2.save');
  P.saveNow = () => { v.scene.host.saveNow('probe'); return localStorage.getItem('bn.v2.save'); };
  P.bread = () => { const d = v.scene.area.interact.find((q) => q.id === 'boss_rest'); return d ? [d.x, d.z] : null; };
  P.spot = (id) => { const d = v.scene.area.interact.find((q) => q.id === id); return d ? { event: d.event, x: d.x, z: d.z, label: d.label } : null; };
  P.person = (id) => { const p = v.scene.people.byId?.(id); return p ? { x: Math.round(p.x), z: Math.round(p.z) } : null; };
  P.test = (c) => { try { return !!v.scene.host.st.test(c, null); } catch (e) { return String(e); } };
  P.done = (id) => !!v.scene.host.st.isDone(id);
  P.seenTail = (k) => v.scene.host.seen.slice(-k).map((q) => q.join(' | '));
  P.seenFrom = (i) => v.scene.host.seen.slice(i).map((q) => q.join(' | '));
  P.foes = () => { const sim = v.scene.sim, h = sim.hero; let near = 1e9; const L = sim.enemies.filter((e) => !e.dead && e.state !== 'dead').map((e) => { const d = Math.round(Math.hypot(e.x - h.x, e.z - h.z)); if (e.active && d < near) near = d; return { k: e.kind, on: !!e.active, d, st: e.state, at: [Math.round(e.x), Math.round(e.z)] }; }); return { near: near > 1e8 ? null : near, awake: L.filter((q) => q.on).length, L }; };
  /** a press of a pad button held for up to n ticks (pointer events on the pad's own handlers); stop = let go as soon as something answers */
  P.hold = (id, nTicks, stop) => { const b = btn(id); if (!b) return { err: 'no pad button ' + id }; const a0 = v.area; fire('pointerdown', 15, b.cx, b.cy); let i = 0; for (; i < nTicks; i++) { step(); const sc = v.scene; if (stop && i > 3 && (sc.xing || sc._go || v.area !== a0 || sc.hud.modal)) break; } fire('pointerup', 15, b.cx, b.cy); const sc = v.scene; return { held: i, xing: !!sc.xing, modal: sc.hud.modal ?? null, disabled: !!b.disabled }; };
  P.tap = (id) => { const b = btn(id); if (!b) return { err: 'no pad button ' + id }; fire('pointerdown', 15, b.cx, b.cy); for (let i = 0; i < 5; i++) step(); fire('pointerup', 15, b.cx, b.cy); for (let i = 0; i < 3; i++) step(); const h = v.scene.sim.hero; return { bellCd: +(h.bellCd ?? 0).toFixed(2), bellOk: !!h.bellOk, act: h.act ?? null }; };
  /** stand beside the queen (wherever she is, seen or not) and press attack k times */
  P.strike = (k) => { const e = queen(); if (!e) return null; P.beside(52); const b = btn('attack'), hp0 = e.hp; if (!b) return { err: 'no attack button' }; for (let j = 0; j < k; j++) { fire('pointerdown', 16, b.cx, b.cy); for (let i = 0; i < 4; i++) step(); fire('pointerup', 16, b.cx, b.cy); for (let i = 0; i < 14; i++) step(); } return { hp0: Math.round(hp0), hp: Math.round(e.hp), active: !!e.active, alpha: e.alpha, solid: !!e.solid }; };
  /** n ticks: how close the awake enemies come, how many ticks any of them is in an attack, the hero's health, when he is first hurt */
  P.watch = (nTicks) => { let minD = 1e9, atk = 0, hurtAt = -1, holdTicks = 0; const hp0 = v.scene.sim.hero.hp; for (let i = 0; i < nTicks; i++) { step(); const sim = v.scene.sim; if (!sim) continue; const h = sim.hero; if (sim.hold) holdTicks++; for (const e of sim.enemies) { if (e.dead || e.state === 'dead' || !e.active) continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < minD) minD = d; if (e.state === 'attack') atk++; } if (hurtAt < 0 && h.hp < hp0) hurtAt = i; } const h = v.scene.sim.hero; return { minD: minD > 1e8 ? null : Math.round(minD), attackTicks: atk, hp: [Math.round(hp0), Math.round(h.hp)], hurtAt, holdTicks, modal: v.scene.hud.modal ?? null }; };
  /** the page goes to the background and comes back (the browser's own event; the state is what document.visibilityState would say) */
  P.hide = () => { const H = v.scene.host, n0 = H.saves; try { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); return { savesMade: H.saves - n0, why: H.lastSave?.why ?? null, visible: document.visibilityState }; } catch (e) { return { err: String(e) }; } };
}
let page = null, ctx = null;
const ev = (fn, arg) => page.evaluate(fn, arg);
async function boot(saveStr) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ ...contextOptions('fold_open') }); page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
  await page.addInitScript((s) => { try { if (window.top !== window) return; if (sessionStorage.getItem('__cs_seeded')) return; sessionStorage.setItem('__cs_seeded', '1'); localStorage.setItem('bn.v2.save', s); } catch { /* storage */ } }, saveStr);
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&v2res=0.5`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 });
  await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 30000 }).catch(() => {});
  try { const cdp = await page.context().newCDPSession(page), T = new Touch(cdp, page); await ensureTouchMode(T, page); await page.waitForTimeout(300); } catch (e) { put('     · touch mode: ' + String(e).slice(0, 120)); }
  await ev(install);
  return idle();
}
const run = (t, u = false) => ev(([a, b]) => window.__cs.run(a, b), [t, u]);
async function wait(pred, max = 400) { let s = null; for (let i = 0; i < max; i++) { s = await run(30, false); if (pred(s)) return s; if (!s.ready) await page.waitForTimeout(250); } return s; }
const idle = (area) => wait((s) => s.ready && s.idle && (!area || s.area === area));
async function travel(id, spawn) { await idle(); const r = await ev(([a, b]) => window.__cs.travel(a, b), [id, spawn]); if (!r) return { area: 'travel refused' }; return idle(id); }
async function intoHall() { await idle(); await ev(() => window.__cs.put(600, 3150)); return wait((s) => s.idle && !!s.queen?.active, 30); }
async function fall() { const s0 = await idle(); await ev(() => window.__cs.die()); return wait((s) => s.ready && s.idle && s.deaths > s0.deaths && !s.dead, 600); }
/** the long ring by the pad's own button in front of a bell; to = the area it should carry him to (null: one press, whatever happens) */
async function ringAt(bell, to, tries = 3) {
  let s = await idle(), press = null, k = 0;
  for (; k < tries; k++) {
    const at = await ev((b) => window.__cs.atBell(b), bell); if (!at) return { ...s, area: 'no free spot at ' + bell };
    await run(40);
    press = await ev(() => window.__cs.hold('bell', 320, true));
    s = await wait((q) => q.ready && q.idle, 200);
    if (!to || s.area === to) { k++; break; }
  }
  return { ...s, press, tries: k };
}
const near = (p, q, r = 60) => !!p && !!q && Math.hypot(p[0] - q[0], p[1] - q[1]) <= r;
const gone = (s) => !!s.queen && !s.queen.active && s.queen.alpha === 0 && !s.queen.drawn && s.queen.hold && s.bar === null;
const pick = (s) => ({ area: s.area, at: [s.x, s.z], hp: s.hp, rest: s.rest, queen: s.queen, kept: s.q, flags: s.flags, modal: s.modal, bar: s.bar, obj: s.obj, ...(s.press ? { press: s.press, tries: s.tries } : {}) });
const sections = [];
const section = (id, title, fn) => sections.push({ id, title, fn });

section('S3', 'the kneel (save after ev_boss_kneel)', async () => {
  const sv = saveOf('ev_boss_kneel');
  let s = await boot(sv); s = await run(60); const driven = s.q.hp, bread = await ev(() => window.__cs.bread());
  obs('load of a save made while she knelt', pick(s));
  ok(s.area === 'ossuary_now' && !!s.queen && !s.queen.kneel && s.queen.phase === 2 && s.queen.hp <= 225 && !s.queen.hold, `a save made at the kneel loads tonight with her standing, second act, at ${s.queen?.hp} (not above a quarter, not sent)`);
  const kneel = async () => { await ev(() => window.__cs.beside(70)); await run(20); await ev(() => window.__cs.queenHp(36)); return wait((q) => !!q.queen?.kneel, 40); };
  s = await kneel(); ok(!!s.queen?.kneel, `brought to 36 she kneels (${J(s.queen)})`);
  await ev(() => window.__cs.beside(70));
  const tap = await ev(() => window.__cs.tap('bell')), h = await ev(() => window.__cs.hold('bell', 480, true)); s = await wait((q) => q.flags.includes('queen_sent') && q.idle, 200);
  obs('a short ring (echo), then at once a long press that begins while the bell rests', { tap, hold: h, flags: s.flags, kneel: s.queen?.kneel ?? null });
  ok(!tap.bellOk && s.flags.includes('queen_sent'), `blocker 6 in the scene: the long press begun while the bell was not ready (${tap.act ?? 'resting'}) sent her (held ${h.held} ticks)`);
  s = await boot(sv); s = await kneel(); s = await fall(); obs('a fall while she kneels', pick(s));
  ok(s.area === 'ossuary_now' && near([s.x, s.z], bread, 70) && !!s.queen && s.queen.hp === driven && !s.queen.kneel && s.queen.phase === 2 && !s.flags.includes('queen_sent'), `a fall at the kneel: he stands up at the bread, she is back at ${s.queen?.hp} (the stretch began at ${driven}), standing`);
  s = await intoHall(); s = await kneel(); const sk = await ev(() => window.__cs.saveNow()); s = await boot(sk); s = await run(60); obs("the game's own save at the kneel, loaded", pick(s));
  ok(!!s.queen && !s.queen.kneel && s.queen.hp >= 37 && s.queen.hp <= 225 && !s.flags.includes('queen_sent') && !s.queen.hold, `loaded: she stands at ${s.queen?.hp}, to be brought to her knees again`);
  s = await kneel(); const a = await ringAt('bell_arena', null, 1); obs("a long ring at the hall's bell while she kneels", pick(a));
  if (a.area === 'ossuary_past') { ok(gone(a) || !a.queen, 'crossed at the hall bell while she knelt: she is not in 1697'); const c = await ringAt('bell_arena', 'ossuary_now'); obs('and back', pick(c)); ok(c.area === 'ossuary_now' && !!c.queen && !c.queen.hold && c.queen.hp <= 225 && !c.flags.includes('queen_sent'), `back tonight she goes on at ${c.queen?.hp}`); }
  else ok(a.flags.includes('queen_sent') || a.area === 'ossuary_now', `the long ring at the hall bell with her kneeling: ${a.flags.includes('queen_sent') ? 'the knell (she was in reach)' : 'nothing crossed'}`);
  if (!a.flags.includes('queen_sent')) { s = await intoHall(); s = await kneel(); await ev(() => { window.__cs.adv = 6; }); s = await run(13 * 60 + 40); obs('thirteen seconds at the kneel without the knell', pick(s)); ok(!!s.queen && !s.queen.kneel && s.queen.hp <= 225 && !s.flags.includes('queen_sent'), `left alone she stands up again at ${s.queen?.hp} (not above a quarter)`); }
});

section('S0', 'the first act (save after ev_boss_intro)', async () => {
  let s = await boot(saveOf('ev_boss_intro')); const bread = await ev(() => window.__cs.bread()); obs('load', pick(s));
  s = await run(180); ok(!!s.queen && s.queen.active && s.queen.phase === 1, `loaded inside her hall before the flight: she is awake, first act (${J(s.queen)})`);
  await ev(() => window.__cs.queenHp(700)); s = await run(30); const sv = await ev(() => window.__cs.saveNow());
  s = await fall(); obs('a fall in the first act', pick(s));
  ok(s.area === 'ossuary_now' && near([s.x, s.z], bread, 70), `a fall tonight before the flight: he stands up at the bread (${s.x},${s.z})`);
  ok(!!s.queen && s.queen.hp === 900 && s.queen.phase === 1 && !s.queen.active && s.flags.length === 0, `she is back at full health in her first act, asleep (${J(s.queen)})`);
  obs('shown after the fall', await ev(() => window.__cs.seenTail(3)));
  s = await intoHall(); ok(!!s.queen?.active, 'he steps in again: she wakes');
  s = await boot(sv); s = await run(120); obs('the game\'s own save made in mid-fight (she was at 700), loaded', pick(s));
  ok(!!s.queen && s.queen.phase === 1 && s.queen.hp === 900 && s.flags.length === 0, `loaded: the first act starts again at ${s.queen?.hp}`);
  const a = await ringAt('bell_arena', null, 1); obs("a long ring at the hall's bell while she is here (first act)", pick(a));
  if (a.area === 'ossuary_past') {
    ok(!a.queen, 'in 1697 before her flight there is no queen');
    const b = await ringAt('bell_arena', null, 1); obs('the same bell in 1697 (sealed until she has fled)', pick(b)); ok(b.area === 'ossuary_past', 'the sealed bell answers dull, he stays in 1697');
    const c = await ringAt('bell_riddle', 'ossuary_now'); obs('back through the riddle-room bell', pick(c));
    ok(c.area === 'ossuary_now' && c.queen?.hp === 900 && c.queen.phase === 1 && c.flags.length === 0, 'tonight again: the first act from full health, no flag set');
  } else ok(a.area === 'ossuary_now', 'the hall bell did not carry him over in the first act');
  s = await intoHall(); await ev(() => window.__cs.beside(120)); await ev(() => window.__cs.queenHp(452)); s = await run(30);
  await ev(() => window.__cs.queenHp(448)); s = await wait((q) => q.flags.includes('queen_fled') && q.idle, 200); obs('at half health', pick(s));
  ok(s.flags.join() === 'queen_fled' && gone(s) && s.q.hp > 0, `she tears away at half and is gone from tonight (kept ${s.q.hp})`);
  const hit = await ev(() => window.__cs.strike(10)); s = await run(600); obs('ten attacks on the spot where she vanished, then ten seconds', { hit, ...pick(s) });
  ok(gone(s) && !s.flags.includes('queen_sent') && !s.flags.includes('queen_driven'), 'she cannot be touched or finished tonight without crossing');
});

section('S1', 'she is away (save after ev_boss_flee)', async () => {
  let s = await boot(saveOf('ev_boss_flee')); const kept = s.q.hp; obs('load', pick(s)); obs('Sera at the lantern', await ev(() => window.__cs.person('sera')));
  await ev(() => window.__cs.atBell('bell_riddle')); await run(40);
  const tap = await ev(() => window.__cs.tap('bell')), h = await ev(() => window.__cs.hold('bell', 480, true)); s = await wait((q) => q.ready && q.idle, 200);
  obs("an echo, then at once a long press at the riddle-room bell (begun during the bell's rest)", { tap, hold: h, area: s.area });
  ok(!tap.bellOk && s.area === 'ossuary_past', `a long press begun while the bell was not ready (${tap.act ?? 'resting'}) still carries him over (held ${h.held} ticks)`);
  ok(!!s.queen && s.queen.hp === kept && s.queen.phase === 2 && !s.queen.hold, `1697: she waits at ${s.queen?.hp} (left with ${kept})`);
  let b = await ringAt('bell_riddle', 'ossuary_now'); ok(b.area === 'ossuary_now' && gone(b), `back at the same bell: tonight she is gone (${b.area})`);
  for (const bell of ['bell_entry', 'bell_coffins', 'bell_arena']) {
    const a = await ringAt(bell, 'ossuary_past'), okA = a.area === 'ossuary_past' && !!a.queen && !a.queen.hold && a.queen.phase === 2 && a.queen.hp <= kept;
    const c = await ringAt(bell, 'ossuary_now');
    ok(okA && c.area === 'ossuary_now' && gone(c), `${bell}: over (${a.area}, she ${J(a.queen)}, ${a.tries} press) and back (${c.area}, hero hp ${c.hp}, ${c.tries} press, kept ${J(c.q)})`);
  }
});

section('S2', 'the chase (save after ev_boss_past)', async () => {
  let s = await boot(saveOf('ev_boss_past')); const kept = s.q.hp; s = await run(60); obs('load', pick(s));
  ok(s.area === 'ossuary_past' && !!s.queen && s.queen.phase === 2 && s.queen.hp <= kept && !s.queen.hold, `loaded in 1697 in mid-chase: she is here at ${s.queen?.hp} (left tonight with ${kept}), second act`);
  s = await intoHall(); await ev(() => window.__cs.queenHp(350)); s = await run(20); const sv = await ev(() => window.__cs.saveNow());
  s = await travel('graveyard_past', 'from_ossuary'); const g1 = s.area; s = await travel('ossuary_past', 'rest'); obs('left the dungeon of 1697 in mid-chase and came back', pick(s));
  ok(g1 === 'graveyard_past' && s.area === 'ossuary_past' && s.queen?.hp === 350 && !s.queen.hold, `she goes on from ${s.queen?.hp} (was 350)`);
  s = await boot(sv); s = await run(60); obs("the game's own save in mid-chase, loaded", pick(s));
  ok(s.area === 'ossuary_past' && s.queen?.hp === 350 && s.queen.phase === 2, `loaded: she goes on from ${s.queen?.hp} (was 350)`);
  s = await intoHall(); await ev(() => window.__cs.queenHp(30)); s = await wait((q) => q.flags.includes('queen_driven') && q.idle, 200); obs('her health set to 30 in 1697 (below the kneel)', pick(s));
  ok(s.flags.includes('queen_driven') && !s.flags.includes('queen_sent') && gone(s) && s.q.hp >= 37, `she is driven back, not sent: kept ${J(s.q)}`);
  obs('shown', await ev(() => window.__cs.seenTail(5)));
});

section('S8', "that night's graveyard: the corpses, a dialogue with enemies near, a fall", async () => {
  let s = await boot(saveOf('ev_gate_past')); s = await travel('graveyard_past', 'from_eshville'); obs('arrival', { ...pick(s), foes: await ev(() => window.__cs.foes()) });
  const w0 = await ev(() => window.__cs.watch(600)); obs('ten seconds standing where he arrives', w0);
  ok(w0.minD === null && w0.hp[0] === w0.hp[1], 'nothing wakes while he stands at the gate');
  await ev(() => window.__cs.put(600, 445)); let f = null, t = 0; for (; t < 60; t++) { await run(15); f = await ev(() => window.__cs.foes()); if (f.near !== null && f.near < 150) break; }
  obs('standing in the wake trigger until the first corpse is within 150', { ticks: t * 15, awake: f.awake, near: f.near });
  await ev(() => { window.__cs.adv = 0; window.__cs.put(600, 975); }); const w1 = await ev(() => window.__cs.watch(600)); obs("the keeper's greeting left open for ten seconds, the corpses coming up behind", w1);
  ok(w1.modal === 'dialog' && w1.attackTicks === 0 && w1.hp[0] === w1.hp[1] && w1.holdTicks > 500, `while the dialogue is open nobody attacks (attack ticks ${w1.attackTicks}, nearest ${w1.minD}, hero ${w1.hp.join(' -> ')})`);
  await ev(() => { window.__cs.adv = 2; }); const w2 = await ev(() => window.__cs.watch(240)); obs('pages turned every two ticks, four seconds', w2);
  const w3 = await ev(() => window.__cs.watch(240)); obs('the next four seconds (he stands still)', w3);
  await ev(() => { window.__cs.adv = 6; }); s = await idle();
  s = await fall(); obs('a fall among the corpses', { ...pick(s), foes: await ev(() => window.__cs.foes()) });
  const w4 = await ev(() => window.__cs.watch(600)); obs('ten seconds after he stood up', w4);
  ok(s.area === 'graveyard_past' && w4.hp[0] === w4.hp[1], `after the fall he stands up in graveyard_past at (${s.x},${s.z}) and is left alone there`);
});

section('S4', 'the ending card, a reload on it, the ossuary after the ending', async () => {
  let s = await boot(saveOf('ev_ending')); obs('load of the save from the last crossing', pick(s));
  s = await wait((q) => q.modal === 'end', 300); obs('the card', { modal: s.modal, area: s.area, ended: s.ended, obj: s.obj });
  ok(s.modal === 'end', 'the ending plays again from that save up to the card');
  const st1 = await ev(() => window.__cs.saved()), o1 = JSON.parse(st1); obs('what is stored while the card is up', { why: o1.why, area: o1.area, done: Array.isArray(o1.story?.done) ? o1.story.done.length : Object.keys(o1.story?.done ?? {}).length });
  const hid = await ev(() => window.__cs.hide()); s = await run(120); const st2 = await ev(() => window.__cs.saved()); obs('the page hidden and shown again during the card', { hid, storedSame: st2 === st1, modal: s.modal });
  ok(s.modal === 'end', 'the card is still up after the page was hidden and shown');
  s = await boot(st2); s = await run(240); obs('a reload on the ending card', pick(s)); obs('shown after that reload', await ev(() => window.__cs.seenTail(4)));
  ok(s.area === 'eshville_now' && !s.dead, `after a reload on the card: ${s.area}, modal ${s.modal}, input ${s.lock ? 'LOCKED' : 'free'}, idle ${s.idle}`);
  ok(!s.lock && s.idle, 'the hero can be moved after that reload (no lock left over)');
  s = await travel('ossuary_now', 'entry'); obs('the ossuary tonight after the ending', { ...pick(s), sera: await ev(() => window.__cs.person('sera')) });
  ok(s.area === 'ossuary_now' && !s.queen, 'no queen in the ossuary after the ending');
  const n0 = s.seen; await ev(() => window.__cs.put(600, 3150)); s = await run(300); obs('five seconds in her hall', { bar: s.bar, shown: await ev((i) => window.__cs.seenFrom(i), n0) });
  ok(s.bar === null && s.modal === null, 'her hall is empty: no bar, no scene');
  const a = await ringAt('bell_arena', 'ossuary_past'); obs("the hall's bell", { ...pick(a), elise: await ev(() => window.__cs.person('elise')) }); ok(a.area === 'ossuary_past' && !a.queen, '1697 after the ending: no queen');
  const c = await ringAt('bell_arena', 'ossuary_now'); ok(c.area === 'ossuary_now' && c.warn === 0, `and back (${c.area}); story warnings ${c.warn}`);
});

section('S5', 'the page hidden during a camera shot (the queen\'s entrance)', async () => {
  let s = await boot(saveOf('ev_boss_rest')); obs('load (before her door, the entrance not played)', { ...pick(s), intro: await ev(() => window.__cs.done('ev_boss_intro')) });
  await ev(() => { window.__cs.adv = 0; window.__cs.put(600, 3150); }); s = await wait((q) => q.shot || q.modal === 'dialog', 20); obs('in her hall', { shot: s.shot, modal: s.modal, lock: s.lock });
  const hid = await ev(() => window.__cs.hide()), stored = await ev(() => window.__cs.saved()); obs('hidden and shown during the shot', hid);
  await ev(() => { window.__cs.adv = 6; }); s = await wait((q) => q.idle && !!q.queen?.active, 200); obs('the scene after that', { ...pick(s), intro: await ev(() => window.__cs.done('ev_boss_intro')) });
  ok(!s.shot && !s.lock && !!s.queen?.active && (await ev(() => window.__cs.done('ev_boss_intro'))), 'the entrance ran to its end after the page came back: no lock left, she is awake');
  s = await boot(stored); s = await wait((q) => q.idle && !!q.queen?.active, 200); obs('the save made while hidden, loaded', { ...pick(s), intro: await ev(() => window.__cs.done('ev_boss_intro')), shown: await ev(() => window.__cs.seenTail(3)) });
  ok(!!s.queen?.active && !s.lock, 'loaded: he is in her hall, she wakes, nothing is locked');
});

section('S6', 'the road bell a second time (save after ev_hung_now)', async () => {
  let s = await boot(saveOf('ev_hung_now')); obs('load', { ...pick(s), post: await ev(() => window.__cs.spot('road_bell')), bag: await ev(() => window.__cs.test(['has:road_bell'])) });
  const n0 = s.seen, a = await ringAt('road_bell', 'graveyard_past'); obs('a long ring at the hung road bell tonight', { ...pick(a), post: await ev(() => window.__cs.spot('road_bell')) });
  const b = await ringAt('road_bell', 'graveyard_now'); const shown = await ev((i) => window.__cs.seenFrom(i), n0); obs('and at the same post in 1697', { area: b.area, shown });
  ok(a.area === 'graveyard_past' && b.area === 'graveyard_now' && !shown.some((l) => l.includes('걸었다')), 'the hung bell is a crossing bell in both nights: nothing is hung twice');
});

section('S7', 'the road bell without Edmund (save after ev_carve_b, the hero set on the terrace)', async () => {
  let s = await boot(saveOf('ev_carve_b')); const n0 = s.seen; obs('load', { ...pick(s), bag: await ev(() => window.__cs.test(['has:road_bell'])), edmund: await ev(() => window.__cs.done('ev_edmund_grave')) });
  await ev(() => window.__cs.putY(502, 1880, 140)); await run(40); const h = await ev(() => window.__cs.hold('bell', 320, true)); s = await wait((q) => q.ready && q.idle && q.area === 'graveyard_now', 300);
  obs('a long ring at the empty post without the bell in the bag', { hold: h, area: s.area, shown: await ev((i) => window.__cs.seenFrom(i), n0) });
  ok(s.area === 'graveyard_now' && (await ev(() => window.__cs.test(['bell_hung']))) && s.warn === 0, 'Edmund hands the bell over first, then it is hung: the story goes on');
});

for (const S of sections) {
  if (ONLY && !ONLY.includes(S.id)) continue;
  const t0 = Date.now(); put(`── ${S.id} ${S.title}`);
  try { await S.fn(); } catch (e) { ok(false, `${S.id} stopped: ${String(e?.stack ?? e).slice(0, 500)}`); }
  put(`   (${S.id}: ${Math.round((Date.now() - t0) / 1000)} s; page errors so far ${errors.length}${errors.length ? ' - ' + errors[errors.length - 1] : ''})`);
}
ok(errors.length === 0, `page errors: ${errors.length}${errors.length ? ' - ' + errors[0] : ''}`);
await browser.close(); srv.close?.();
put(bad ? `FAIL (${bad} of ${n})` : `ALL OK (${n} checks)`);
process.exit(bad ? 1 : 0);
