// CHAPTER lane: the queen's stretches and the rest point across every way a new rules object is made - a load, a crossing at any bell in either
// direction, leaving the dungeon and coming back, a fall (docs/v2/ENGINE_API.md 12.4; src/v2/game/chapter.js).
//   node tools/v2/chapter_states.mjs --save <a save written after ev_boss_flee by tools/v2/chapter_audit.mjs> [--root <tree>] [--out <dir>]
// NOT honest play: the tool puts the hero at bells and into the hall, sets the queen's health and fells the hero by the rules' own _die. What it
// uses of the scene is what the game itself uses: scene.cross (the one way to cross), scene.travelTo (the story's journey), the story's own saves.
// Exit 1 when a check fails.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
if (!args.save || args.save === true) { console.error('usage: node tools/v2/chapter_states.mjs --save <save after ev_boss_flee (json of chapter_audit.mjs)> [--root <tree>] [--out <dir>]'); process.exit(2); }
const OUT = String(args.out || '/tmp/claude-0/v2/chapter/states'); fs.mkdirSync(OUT, { recursive: true });
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.m4a': 'audio/mp4', '.txt': 'text/plain; charset=utf-8' };
const serveRoot = (root, p) => new Promise((r) => { const s = http.createServer((req, res) => { let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(root, u); if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; } fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); }); }); s.listen(p, () => r(s)); });
const port = 9100 + Math.floor(Math.random() * 600), srv = args.root && args.root !== true ? await serveRoot(path.resolve(String(args.root)), port) : await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
let bad = 0, n = 0; const lines = [];
const ok = (cond, text) => { n++; const l = `${cond ? 'ok  ' : 'FAIL'} ${text}`; lines.push(l); console.log(l); if (!cond) bad++; };
const errors = [];

/** in the page: fast-forward (dialogue pages are turned), the state, the scripted hands */
function install() {
  const g = window.__game, v = window.__v2, P = (window.__cs = { d: 0 });
  const queen = () => v.scene.sim?.enemies.find((x) => x.def?.boss && !x.dead && x.state !== 'dead') ?? null;
  P.idle = () => { const sc = v.scene, H = sc.host; return !!v.ready && !!sc.sim && !sc.hud.modal && !H.st.busy && !sc._go && !sc.xing && sc.fadeA <= 0.01; };
  P.state = () => {
    const sc = v.scene, sim = sc.sim, h = sim?.hero, e = sim ? queen() : null;
    return { ready: !!v.ready && !!sim, area: v.area, idle: P.idle(), x: h ? Math.round(h.x) : 0, z: h ? Math.round(h.z) : 0, hp: h ? Math.round(h.hp) : 0, dead: !!h?.dead, deaths: sim?.deaths ?? 0,
      rest: sim?.rest ? [Math.round(sim.rest.x), Math.round(sim.rest.z)] : null,
      queen: e ? { hp: Math.round(e.hp), active: !!e.active, alpha: +e.alpha.toFixed(2), phase: e.bphase, hold: !!e.fleeHold, drawn: !!e._a3, x: Math.round(e.x), z: Math.round(e.z), kneel: e.kneel > 0 } : null,
      q: sc.ch ? { hp: sc.ch.q.hp, cur: Math.round(sc.ch.q.cur) } : null, tear: !!sc.ch?.tear, flags: ['queen_fled', 'queen_driven', 'queen_sent'].filter((f) => sc._flagFn(f)), modal: sc.hud.modal ?? null,
      obj: sc.state?.objective ?? sc.host?.objective ?? null, bar: sc.state?.boss ? Math.round(sc.state.boss.hp ?? -1) : null };
  };
  P.run = (ticks, untilIdle) => { g._pageHidden = true; for (let i = 0; i < ticks; i++) { const sc = v.scene; if (sc.hud?.modal === 'dialog' && ++P.d >= 6) { P.d = 0; sc.hud.advanceDialog(); } g.tick(1 / 60); if (untilIdle && i > 8 && P.idle()) break; } try { g.alpha = 1; g.render(); } catch { /* between areas */ } return P.state(); };
  P.put = (x, z) => { const sc = v.scene; sc._enterAt(null, { x, z, y: 0 }); const h = sc.sim.hero; return [Math.round(h.x), Math.round(h.z)]; };
  P.atBell = (id) => { const sc = v.scene, d = sc.area.interact.find((q) => q.id === id); if (!d) return null; for (const [ox, oz] of [[0, -44], [0, 44], [-44, 0], [44, 0], [-40, -40], [40, -40]]) if (sc._spotOk({ x: d.x + ox, z: d.z + oz, y: 0 })) return P.put(d.x + ox, d.z + oz); return null; };
  P.cross = () => v.scene.cross({});
  P.travel = (id, spawn) => v.scene.travelTo(id, spawn);
  P.queenHp = (hp) => { const e = queen(); if (!e) return null; e.hp = hp; return Math.round(e.hp); };
  P.die = () => { const sim = v.scene.sim; sim._die(sim.hero); return true; };
  P.saved = () => localStorage.getItem('bn.v2.save');
  P.bread = () => { const d = v.scene.area.interact.find((q) => q.id === 'boss_rest'); return d ? [d.x, d.z] : null; };
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
  await ev(install);
  return idle();
}
const run = (t, u = false) => ev(([a, b]) => window.__cs.run(a, b), [t, u]);
async function wait(pred, max = 400) { let s = null; for (let i = 0; i < max; i++) { s = await run(30, false); if (pred(s)) return s; if (!s.ready) await page.waitForTimeout(250); } return s; }
const idle = (area) => wait((s) => s.ready && s.idle && (!area || s.area === area));
async function crossAt(bell, to) { await idle(); const at = await ev((b) => window.__cs.atBell(b), bell); if (!at) return { area: 'no free spot at ' + bell }; await run(20); const r = await ev(() => window.__cs.cross()); if (!r) return { area: 'cross refused at ' + bell }; return idle(to); }
async function travel(id, spawn) { await idle(); const r = await ev(([a, b]) => window.__cs.travel(a, b), [id, spawn]); if (!r) return { area: 'travel refused' }; return idle(id); }
async function intoHall() { await idle(); await ev(() => window.__cs.put(600, 3150)); return wait((s) => s.idle && !!s.queen?.active, 60); }
async function fall() { const s0 = await idle(); await ev(() => window.__cs.die()); return wait((s) => s.ready && s.idle && s.deaths > s0.deaths && !s.dead, 600); }
const near = (p, q, r = 60) => !!p && !!q && Math.hypot(p[0] - q[0], p[1] - q[1]) <= r;
const gone = (s) => !!s.queen && !s.queen.active && s.queen.alpha === 0 && !s.queen.drawn && s.queen.hold && s.bar === null;
const J = (o) => JSON.stringify(o);

try {
  const file = JSON.parse(fs.readFileSync(String(args.save), 'utf8')), save0 = JSON.stringify(file.save ?? file);
  // ───────── A: tonight, after the flight ─────────
  let s = await boot(save0); const bread = await ev(() => window.__cs.bread()), kept = s.q.hp;
  ok(s.area === 'ossuary_now' && s.flags.join() === 'queen_fled' && kept > 0, `load after the flight: ${s.area}, flags ${s.flags.join('+')}, her health kept ${kept}`);
  ok(gone(s), `tonight after a load she is gone (not awake, not drawn, no bar): ${J(s.queen)}`);
  ok(near(s.rest, bread, 30), `the hero would stand up at the bread ${J(bread)} after a load: ${J(s.rest)}`);
  s = await intoHall(); s = await run(300);
  ok(gone(s), `in her hall for five seconds: nothing brings her back (${J(s.queen)})`);
  s = await travel('graveyard_now', 'from_ossuary'); const sg = s;
  s = await travel('ossuary_now', 'entry');
  ok(sg.area === 'graveyard_now' && s.area === 'ossuary_now' && gone(s), `left the dungeon (${sg.area}) and came back at the entry: still gone (${J(s.queen)})`);
  ok(near(s.rest, bread, 30), `after leaving and coming back the hero would still stand up at the bread: ${J(s.rest)}`);
  // ───────── B: 1697, the chase ─────────
  s = await crossAt('bell_riddle', 'ossuary_past');
  ok(s.area === 'ossuary_past' && !!s.queen && !s.queen.hold && s.queen.hp === kept && s.queen.phase === 2 && !s.queen.active, `crossed at the riddle-room bell: in 1697 she waits in her hall at ${s.queen?.hp} (left with ${kept}), second act, asleep while the hero is outside: ${J(s.queen)}`);
  ok(near(s.rest, bread, 30), `that night the hero would stand up at the same bread: ${J(s.rest)}`);
  s = await intoHall();
  ok(!!s.queen?.active && s.queen.hp === kept, `the hero steps into the hall of 1697: she wakes (${J(s.queen)})`);
  const mid = kept - 70; await ev((h) => window.__cs.queenHp(h), mid); s = await run(20);
  ok(s.q.cur === mid, `her health is followed during the chase (set to ${mid}: kept cur ${s.q.cur})`);
  s = await crossAt('bell_arena', 'ossuary_now');
  ok(s.area === 'ossuary_now' && gone(s), `back tonight at the hall's bell in mid-chase: she is not here (${J(s.queen)})`);
  s = await crossAt('bell_arena', 'ossuary_past'); s = await wait((q) => q.idle && !!q.queen?.active, 40);
  ok(s.area === 'ossuary_past' && s.queen?.hp === mid && s.queen.phase === 2, `and to 1697 again: she goes on from ${s.queen?.hp} (was ${mid})`);
  s = await fall();
  ok(s.area === 'ossuary_past' && near([s.x, s.z], bread, 70), `a fall in 1697: the hero stands up at the bread, in the night he fell in (${s.area} ${s.x},${s.z}; hp ${s.hp})`);
  ok(!!s.queen && s.queen.hp === kept && s.queen.phase === 2 && !s.queen.active, `the chase starts again: she is back at ${s.queen?.hp} (${kept}), asleep in her hall (${J(s.queen)})`);
  s = await intoHall();
  const drive = Math.floor(900 * 0.25) - 6; await ev((h) => window.__cs.queenHp(h), drive);
  s = await wait((q) => q.flags.includes('queen_driven') && q.idle, 200);
  ok(s.flags.includes('queen_driven') && gone(s), `brought down to ${drive}: she tears back, 'driven' is told and she is gone from 1697 (${J(s.queen)}; kept ${J(s.q)})`);
  const driven = s.q.hp;
  s = await run(400);
  ok(gone(s), `nothing brings her back to 1697 by a timer (${J(s.queen)})`);
  await ev(() => window.__cs.atBell('bell_arena')); s = await run(60);
  ok(gone(s), `at the bell the prompt points to there is no queen (hero ${s.x},${s.z})`);
  // ───────── C: a load in 1697 after she was driven, then tonight ─────────
  const save1 = await ev(() => window.__cs.saved()), o1 = JSON.parse(save1);
  ok(!!o1.ch && o1.ch.queen?.hp === driven && !!o1.ch.rest, `the story's save after 'driven' carries ch: queen ${J(o1.ch?.queen)}, rest ${J(o1.ch?.rest)}, bell ${J(o1.ch?.bell)}`);
  s = await boot(save1);
  ok(s.area === 'ossuary_past' && gone(s) && near(s.rest, bread, 30), `loaded that save: 1697, she is gone, the hero would stand up at the bread (${J(s.queen)}; rest ${J(s.rest)})`);
  s = await crossAt('bell_riddle', 'ossuary_now');
  ok(s.area === 'ossuary_now' && !!s.queen && !s.queen.hold && s.queen.hp === driven && s.queen.phase === 2 && !s.queen.active, `crossed at the riddle-room bell: tonight she is back in her hall at ${s.queen?.hp} (driven out with ${driven}), second act, asleep while the hero is outside`);
  s = await intoHall();
  ok(!!s.queen?.active, `the hero steps into the hall tonight: she wakes (${J(s.queen)})`);
  const mid2 = driven - 60; await ev((h) => window.__cs.queenHp(h), mid2); s = await run(20);
  s = await travel('graveyard_now', 'from_ossuary'); s = await travel('ossuary_now', 'rest');
  ok(s.area === 'ossuary_now' && s.queen?.hp === mid2 && !s.queen.hold, `left the dungeon in mid-fight and came back: she goes on from ${s.queen?.hp} (was ${mid2})`);
  s = await intoHall(); s = await fall();
  ok(s.area === 'ossuary_now' && near([s.x, s.z], bread, 70), `a fall tonight: the hero stands up at the bread (${s.area} ${s.x},${s.z}; hp ${s.hp})`);
  ok(!!s.queen && s.queen.hp === driven && s.queen.phase === 2, `the last stretch starts again from ${s.queen?.hp} (${driven}), not from full health (${J(s.queen)})`);
  s = await intoHall(); s = await crossAt('bell_arena', 'ossuary_past');
  ok(s.area === 'ossuary_past' && gone(s), `to 1697 once more at the hall's bell: she is not there (${J(s.queen)})`);
  s = await crossAt('bell_arena', 'ossuary_now'); s = await wait((q) => q.idle && !!q.queen?.active, 40);
  ok(s.area === 'ossuary_now' && !!s.queen?.active && s.queen.hp === driven, `and back: set down in her hall, she is awake at once at ${s.queen?.hp}`);
  // ───────── D: a load tonight in the last stretch ─────────
  const save2 = await ev(() => { window.__v2.scene.host.saveNow('probe'); return window.__cs.saved(); });
  s = await boot(save2);
  ok(s.area === 'ossuary_now' && !!s.queen && !s.queen.hold && s.queen.hp === driven && s.queen.phase === 2, `a save made tonight in the last stretch loads with her at ${s.queen?.hp}, second act (${J(s.queen)})`);
  ok(errors.length === 0, `page errors: ${errors.length}${errors.length ? ' - ' + errors[0] : ''}`);
} catch (e) { ok(false, 'the probe stopped: ' + String(e?.stack ?? e).slice(0, 600)); }
fs.writeFileSync(`${OUT}/states.txt`, lines.join('\n') + '\n');
await browser.close(); srv.close?.();
console.log(bad ? `FAIL (${bad} of ${n})` : `ALL OK (${n} state checks)`);
process.exit(bad ? 1 : 0);
