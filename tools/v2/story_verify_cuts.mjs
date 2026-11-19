// STORY-VERIFY (2026-11-19): the chapter's last scenes seen at several moments, on two devices, from several hero positions - and the break attempts of the
// verifier: the page hidden during a cut (the game saves; that save is loaded), a reload on the ending card and after it, the hall's bell in the queen's first
// act (pressed, held, pressed again while the line is up), every dialogue tapped as fast as the pad allows, a fall at a cut's last tick, old boss saves.
//   node tools/v2/story_verify_cuts.mjs --saves <dir of chapter_audit saves> --out <dir> [--only keepers,ending,...] [--devices fold_open,phone2]
// NOT honest play: the hero is put at a spot, the bell's interact event is raised where the hero stands (as tools/v2/chapter_cuts.mjs does), the hero is felled
// by the rules' own _die. Honest: every load is the game's own load of a stored save, every hidden save is the game's own (visibilitychange), the hall's bell
// and the fast taps are pointer events on the pad's own button and on the dialogue box.
// Result: <out>/verify.txt (ok / FAIL / note lines), <out>/<device>/<chain>_<nn>_<moment>.jpg
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
if (!args.saves || args.saves === true || !args.out || args.out === true) { console.error('usage: node tools/v2/story_verify_cuts.mjs --saves <dir> --out <dir> [--only a,b] [--devices fold_open,phone2]'); process.exit(2); }
const DIR = String(args.saves), OUT = String(args.out), ONLY = args.only && args.only !== true ? String(args.only).split(',') : null, DEVS = String(args.devices || 'fold_open').split(','), RES = Number(args.res ?? 0.5);
fs.mkdirSync(OUT, { recursive: true });
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const port = 9100 + Math.floor(Math.random() * 600), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const lines = [], errors = []; let bad = 0, nOk = 0;
const put = (l) => { lines.push(l); console.log(l); fs.writeFileSync(`${OUT}/verify.txt`, lines.join('\n') + '\n'); };
const ok = (c, t) => { put(`${c ? 'ok  ' : 'FAIL'} [${DEV}/${chain}] ${t}`); if (c) nOk++; else bad++; };
const note = (t, o) => put(`     · [${DEV}/${chain}] ${t}${o === undefined ? '' : ': ' + (typeof o === 'string' ? o : JSON.stringify(o))}`);
const FILES = fs.readdirSync(DIR).filter((f) => /^\d+_.*\.json$/.test(f)).sort();
const read = (f, dir = DIR) => { const o = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')); return JSON.stringify(o.save ?? o); };
const after = (id) => { const f = FILES.filter((x) => x.replace(/^\d+_/, '').replace(/\.json$/, '') === id).pop(); if (!f) throw new Error('no save for ' + id); return read(f); };

function install() {
  const g = window.__game, v = window.__v2, P = (window.__sv = { d: 0, adv: 6, SH: null, mark: 0, top: 0, mv: 0, fast: false, taps: 0 });
  import('/src/v2/game/storyhost.js').then((m) => { P.SH = m.SHOTS; }, () => {});
  const queen = () => v.scene.sim?.enemies.find((x) => x.def?.boss && !x.dead && x.state !== 'dead') ?? null;
  const shotName = () => { const s = v.scene.host?.shot; if (!s) return null; for (const k in P.SH ?? {}) if (P.SH[k] === s) return k; return '?'; };
  const lastLine = () => { const S = v.scene.host.seen; for (let i = S.length - 1; i >= 0; i--) if (S[i][0] === 'line') return S[i][1] + ': ' + S[i][2]; return ''; };
  const fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
  const btn = (id) => { let b = (v.scene.hud.metrics?.().pad?.buttons ?? []).find((q) => q.id === id) ?? null; if (b && !(b.cx > 0)) { try { g.alpha = 1; g.render(); } catch { /* between areas */ } b = (v.scene.hud.metrics?.().pad?.buttons ?? []).find((q) => q.id === id) ?? null; } return b && b.cx > 0 ? b : null; };
  /** a finger on the dialogue box (the HUD's own pointer handler takes it) */
  const tapBox = () => { const sc = v.scene, b = sc.hud.metrics().dialog?.box, r = g.canvasRect ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }; if (!b) return; const x = r.x + ((b.x + b.w / 2) / g.viewW) * r.w, y = r.y + ((b.y + b.h / 2) / g.viewH) * r.h; fire('pointerdown', 21, x, y); fire('pointerup', 21, x, y); P.taps++; };
  const step = () => { const sc = v.scene; if (sc.hud?.modal === 'dialog') { if (P.fast) tapBox(); else if (P.adv > 0 && ++P.d >= P.adv) { P.d = 0; sc.hud.advanceDialog(); } } g.tick(1 / 60); };
  P.idle = () => { const sc = v.scene, H = sc.host; return !!v.ready && !!sc.sim && !sc.hud.modal && !H.st.busy && !H.locks() && !sc._go && !sc.xing && sc.fadeA <= 0.01; };
  P.who = () => { const sc = v.scene; if (!sc.sim) return {}; const h = sc.sim.hero, o = { hero: [Math.round(h.x), Math.round(h.z)] }; for (const p of sc.people.list) if (p.on) o[p.id] = [Math.round(p.x), Math.round(p.z)]; return o; };
  P.state = () => {
    const sc = v.scene, sim = sc.sim, h = sim?.hero, H = sc.host, e = sim ? queen() : null, ready = !!v.ready && !!sim, M = ready ? sc.hud.metrics?.() ?? {} : {};
    return { ready, area: v.area, idle: ready && P.idle(), modal: sc.hud.modal ?? null, shot: ready ? shotName() : null, lock: !!H?.locks?.(), inputLock: !!H?.inputLock, busy: !!H?.st.busy, x: h ? Math.round(h.x) : 0, z: h ? Math.round(h.z) : 0, hp: h ? Math.round(h.hp) : 0, dead: !!h?.dead,
      pad: !!M.pad?.shown && !M.pad?.back, pills: ready ? Array.from(sc.state.prompts ?? []).map((p) => p.label) : [], line: H ? lastLine() : '', obj: H?.objective ?? '', ended: H?.ended ?? null, card: ready ? !!sc.ch?.card : false, seenCard: ready ? !!sc.ch?.seen : false,
      queen: e ? { hp: Math.round(e.hp), max: e.hpMax, active: !!e.active, alpha: +(+e.alpha).toFixed(2), phase: e.bphase, hold: !!e.fleeHold, kneel: e.kneel > 0 } : null, q: ready ? { hp: sc.ch.q.hp, cur: Math.round(sc.ch.q.cur) } : null,
      flags: ready ? ['queen_fled', 'queen_driven', 'queen_sent', 'elise_found', 'keepers_promised', 'elise_home'].filter((f) => sc._flagFn(f)) : [], seen: H?.seen.length ?? 0, warn: H?.warnings.length ?? 0, top: g.top?.constructor?.name ?? '' };
  };
  const hit = (i, wait) => { P.adv = 0; P.mark = v.scene.host?.seen.length ?? 0; for (let k = 0; k < (wait | 0); k++) step(); try { g.alpha = 1; g.render(); } catch { /* between areas */ } return { ok: true, ticks: i, ...P.state() }; };
  /** tick until a cut point (dialogue pages are turned every 6 ticks, or tapped every tick when P.fast) */
  P.until = (spec, max) => {
    g._pageHidden = true; P.adv = 6;
    for (let i = 0; i < max; i++) {
      const sc = v.scene;
      if (spec.top && (g.top?.constructor?.name ?? '') === spec.top) return { ok: true, ticks: i, top: spec.top };
      if (v.ready && sc && sc.sim && g.top === sc) {
        const H = sc.host, m = sc.hud.modal ?? null;
        if (spec.shot && shotName() === spec.shot) { if (spec.first) { if (H.shotLock) return hit(i, 2); } else if (spec.mid) { if (H.shotLock) { if (H.shotT > P.top) P.top = H.shotT; if (H.shotT <= P.top * 0.5) return hit(i); } } else if (spec.last) { if (H.shotLock && H.shotT <= 1.5 / 60) return hit(i); } else if (m === 'dialog') return hit(i, 70); }
        if (spec.line !== undefined && m === 'dialog' && H.seen.length > P.mark && lastLine().includes(spec.line)) return hit(i, 70);
        if (spec.move && H.moves.length > 0 && ++P.mv >= spec.move) return hit(i);
        if (spec.modal && m === spec.modal && (spec.modal !== 'end' || !!sc.hud.metrics().end?.ready)) return hit(i);   // (the card takes a tap once it is ready: 5.6 s)
        if (spec.idle && i > 8 && P.idle()) return hit(i, spec.wait | 0);
        if (spec.free && i > 2 && !H.locks() && !m && !H.st.busy) return hit(i, spec.wait | 0);
        if (spec.area && v.area === spec.area && P.idle()) return hit(i);
        if (spec.top && (g.top?.constructor?.name ?? '') === spec.top) return { ok: true, ticks: i, top: spec.top };
      } else if (spec.top && (g.top?.constructor?.name ?? '') === spec.top) return { ok: true, ticks: i, top: spec.top };
      step();
    }
    try { g.alpha = 1; g.render(); } catch { /* between areas */ }
    return { ok: false, ...P.state() };
  };
  P.run = (n) => { g._pageHidden = true; for (let i = 0; i < n; i++) step(); try { g.alpha = 1; g.render(); } catch { /* between areas */ } return P.state(); };
  P.set = (k, val) => { P[k] = val; return val; };
  P.trig = (event) => { const sc = v.scene, t = (sc.area.triggers ?? []).find((q) => q.event === event); if (!t) return null; return P.putY((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2, t.y ?? 0); };
  P.putY = (x, z, y) => { const sc = v.scene; sc._enterAt(null, { x, z, y }); sc.cam.snap = true; const h = sc.sim.hero; return [Math.round(h.x), Math.round(h.z), Math.round(h.y)]; };
  P.spot = (id) => { const d = v.scene.area.interact.find((q) => q.id === id); return d ? { x: d.x, z: d.z, y: d.y ?? 0, r: d.r ?? 60, event: d.event } : null; };
  P.use = (want) => { const sc = v.scene, W = want ? String(want).split('|') : null, okT = () => { const t = sc.people.target; return !!t && (!W || W.includes(t.id)); }; step(); step(); step(); for (let i = 0; i < 60 && !okT(); i++) step(); const t = sc.people.target; if (!okT()) return { err: 'the prompt on offer is ' + (t ? t.id : 'none') }; v.use(); step(); step(); return { id: t.id }; };
  P.ring = (id) => { const sc = v.scene, d = sc.area.interact.find((q) => q.id === id); if (!d) return { err: 'no spot ' + id }; sc.emit('interact', { id: d.id, kind: d.kind, event: d.event ?? null, data: d.data ?? null, locked: d.locked ?? null, spot: d, ring: true }); return { id, event: d.event }; };
  /** the pad's own button, held for n ticks (stops when a crossing, a journey or a box begins) */
  P.hold = (id, nTicks, through) => { const b = btn(id); if (!b) return { err: 'no pad button ' + id }; const a0 = v.area; fire('pointerdown', 15, b.cx, b.cy); let i = 0; for (; i < nTicks; i++) { step(); const sc = v.scene; if (!through && i > 3 && (sc.xing || sc._go || v.area !== a0 || sc.hud.modal)) break; } fire('pointerup', 15, b.cx, b.cy); return { held: i, ...P.state() }; };
  P.queenHp = (hp) => { const e = queen(); if (!e) return null; if (hp) e.hp = hp; return Math.round(e.hp); };
  P.die = () => { const sim = v.scene.sim; sim._die(sim.hero); return true; };
  P.wakeQueen = () => { const e = queen(); if (!e) return null; const was = !!e.active; if (!was) v.scene.sim.wake(e); return { was, now: !!e.active }; };
  /** the page goes to the background and comes back: the game's own save on hiding (storyhost.js _onHide) - returns what it stored */
  P.hide = () => { const before = localStorage.getItem('bn.v2.save'); Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); const s = localStorage.getItem('bn.v2.save'); delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); return { save: s, wrote: s !== before }; };
  P.saved = () => localStorage.getItem('bn.v2.save');
  P.seenFrom = (i) => v.scene.host.seen.slice(i).map((q) => q.join(' | '));
  P.warnings = () => v.scene.host.warnings.slice(-6);
  P.tapEnd = () => v.scene.hud.tapEnd?.();
}

let page = null, ctx = null, DEV = 'fold_open', chain = '', nShot = 0;
const ev = (fn, arg) => page.evaluate(fn, arg);
async function boot(saveStr) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ ...contextOptions(DEV) }); page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`[${DEV}/${chain}] ${String(e).slice(0, 300)}`); put(`     ! page error [${DEV}/${chain}] ${String(e).slice(0, 200)}`); });
  await page.addInitScript((s) => { try { if (window.top !== window) return; if (sessionStorage.getItem('__sv_seeded')) return; sessionStorage.setItem('__sv_seeded', '1'); if (s) localStorage.setItem('bn.v2.save', s); else localStorage.removeItem('bn.v2.save'); } catch { /* storage */ } }, saveStr);
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&v2res=${RES}`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 });
  await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 30000 }).catch(() => {});
  try { const cdp = await page.context().newCDPSession(page), T = new Touch(cdp, page); await ensureTouchMode(T, page); await page.waitForTimeout(300); } catch (e) { put('     · touch mode: ' + String(e).slice(0, 120)); }
  await ev(install); await page.waitForFunction(() => !!window.__sv?.SH, null, { timeout: 20000 });
}
/** the same page loaded again (a reload on the device): the stored save is what the game finds */
async function reload() {
  await page.reload();
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 });
  await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 30000 }).catch(() => {});
  await ev(install); await page.waitForFunction(() => !!window.__sv?.SH, null, { timeout: 20000 });
}
async function until(spec, max = 60, soft = false) {
  await ev(() => { window.__sv.top = 0; window.__sv.mv = 0; }); let s = null;
  for (let i = 0; i < max; i++) { s = await ev((q) => window.__sv.until(q, 45), spec); if (s.ok) return s; if (!s.ready) await page.waitForTimeout(250); }
  if (soft) return s;
  throw new Error(`cut point ${JSON.stringify(spec)} not reached: ${JSON.stringify(s).slice(0, 500)}`);
}
const idle = () => until({ idle: true }, 80);
/** the area is built again after a scene that changed a world flag (the screen reads 「불러오는 중…」 meanwhile): wall time until the game stands again */
async function built() { const t0 = Date.now(); await page.waitForFunction(() => !!window.__v2?.ready && !!window.__v2.scene?.sim, null, { timeout: 60000 }); return Date.now() - t0; }
const P = (name, ...a) => ev(([n, b]) => window.__sv[n](...b), [name, a]);
async function still(id, text) {
  const dir = `${OUT}/${DEV}`; fs.mkdirSync(dir, { recursive: true });
  const file = `${dir}/${chain}_${String(++nShot).padStart(2, '0')}_${id}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
  const s = await P('state'), w = await P('who');
  put(`     still ${file.replace(OUT + '/', '')} — ${text}: shot ${s.shot} lock ${s.lock} modal ${s.modal} pad ${s.pad ? 'ON' : 'off'} pills [${s.pills.join(', ')}] who ${JSON.stringify(w)} line "${s.line.replace(/\n/g, ' / ').slice(0, 60)}"`);
  return { ...s, who: w };
}
/** from the save after the queen was sent to the first line of the two keepers' scene */
async function toKeepers() {
  await boot(after('ev_boss_sent')); await idle();
  const b = await P('spot', 'bell_arena'); await P('putY', b.x, b.z - 44, b.y); await ev(() => window.__sv.until({ idle: true }, 30)); await P('ring', 'bell_arena'); await until({ area: 'ossuary_past' }, 160);
  await P('putY', 600, 3760, 0); const u = await P('use', 'oss_elise|elise'); if (u.err) throw new Error(u.err);
  return until({ line: '찾았네요' }, 200);
}
const chains = [], C = (id, fn) => chains.push({ id, fn });

C('keepers', async () => {
  const s0 = await toKeepers(); ok(s0.area === 'eshville_past' && s0.inputLock, `the keepers' scene opens in eshville_past with the hero held (${s0.area}, lockInput ${s0.inputLock})`);
  const a = await still('found', 'first line 「찾았네요」'); ok(!a.pad && !a.pills.length, `first line: pad off, no pill (pad ${a.pad}, pills ${a.pills.length})`);
  const hid = [];
  await until({ shot: 'two_keepers', first: true }); const b = await still('shot_first', 'two_keepers, first frame'); ok(!b.pad && !b.pills.length, `first frame of the cut: pad off, no pill (pad ${b.pad}, pills ${b.pills.length})`);
  hid.push(['camera two_keepers (first frame)', (await P('hide')).save]);
  await until({ move: 45 }, 60, true); const c = await still('walk_mid', 'Elise walks (lockInput)'); ok(!c.pad && !c.pills.length && c.lock, `during the walk: held, pad off, no pill (lock ${c.lock}, pad ${c.pad}, pills ${c.pills.length})`);
  hid.push(['lockInput + moveActor (the walk)', (await P('hide')).save]);
  await until({ line: '종지기예요' }, 200); const d = await still('promise_first', 'promise, first page');
  ok(d.who.elise && Math.abs(d.who.elise[0] - 4296) < 3 && Math.abs(d.who.elise[1] - 1436) < 3 && d.who.lotte && Math.abs(d.who.lotte[0] - 4104) < 3, `Elise right of the bell, Lotte left (${JSON.stringify(d.who)})`);
  await until({ line: '약속!' }); await still('promise_mid', '「약속!」');
  await until({ line: '아저씨도요' }); const e = await still('promise_last', 'last page before the story lets go'); ok(!e.pad && e.lock, `last page: still held, pad off (lock ${e.lock}, pad ${e.pad})`);
  hid.push(['the promise, last page (camera on, dialogue open)', (await P('hide')).save]);
  const f0 = await until({ free: true }, 60); note('ticks from the last page to free', f0.ticks);
  const f = await P('run', 1); ok(f.pad || true, `the tick the story lets go: pad ${f.pad ? 'ON' : 'off'}, pills [${f.pills.join(', ')}], lock ${f.lock}`);
  const g1 = await P('run', 60); const h = await still('after_1s', 'one second after the cut'); ok(h.pad && !h.lock && !h.inputLock, `one second after: pad back, hero free (pad ${h.pad}, lock ${h.lock})`); ok(h.pills.length > 0, `one second after: a pill tells what to do (${h.pills.join(', ') || 'none'}); objective "${h.obj}"`);
  void g1;
  // the hidden saves, loaded
  for (const [what, sv] of args.lite ? [] : hid) {
    if (!sv) { ok(false, `hidden during ${what}: nothing was stored`); continue; }
    const o = JSON.parse(sv); note(`hidden during ${what}: stored`, { why: o.why, area: o.area, storyArea: o.story.area, spawn: o.story.spawn, pos: o.pos, promised: !!o.story.flags?.keepers_promised, found: !!o.story.flags?.elise_found });
    await boot(sv); const s = await until({ line: '찾았네요' }, 200, true);
    ok(s.ok && s.area === 'eshville_past', `loaded: the scene plays again from its first line (${s.ok ? s.line.slice(0, 30) : 'NOT REACHED: ' + JSON.stringify(s).slice(0, 200)})`);
    if (!s.ok) continue;
    const w = await P('who'); ok(Math.abs(w.hero[0] - 4044) < 60 && Math.abs(w.hero[1] - 1396) < 60, `loaded: the hero stands at the keepers' mark (${w.hero}), Elise ${w.elise}, Lotte ${w.lotte}`);
    ok(!!w.elise && Math.abs(w.elise[0] - 3996) < 40, `loaded: Elise starts beside the hero again, not at the bell (${w.elise})`);
    const z = await until({ free: true, wait: 30 }, 300, true); const w2 = await P('who');
    ok(z.ok && !z.lock && !z.inputLock && z.pad, `loaded: the scene ends, hero free, pad back (ok ${z.ok}, lock ${z.lock}, pad ${z.pad})`); ok(!!w2.elise && Math.abs(w2.elise[0] - 4296) < 3 && z.flags.includes('keepers_promised'), `loaded: Elise at her place ${w2.elise}, promised ${z.flags.includes('keepers_promised')}`);
    if (what.startsWith('lockInput')) await still('hidden_loaded_end', 'after the reloaded scene');
  }
});

C('keepers_fast', async () => {
  await toKeepers(); await P('set', 'fast', true);
  const z0 = await until({ free: true, wait: 30 }, 300, true); const ms = await built(); note('after the scene the area is built again: wall time of the loading screen on this machine', ms + ' ms'); await P('run', 30); const z = { ...(await P('state')), ok: z0.ok }; const w = await P('who'), t = await ev(() => window.__sv.taps);
  ok(z.ok && !z.lock && z.pad && z.flags.includes('keepers_promised'), `every page tapped every tick (${t} taps): the scene ends, hero free (ok ${z.ok}, lock ${z.lock}, pad ${z.pad})`);
  ok(!!w.elise && Math.abs(w.elise[0] - 4296) < 3 && Math.abs(w.elise[1] - 1436) < 3 && Math.abs(w.lotte[0] - 4104) < 3, `fast taps: Elise and Lotte at their places (${JSON.stringify(w)})`);
  await still('fast_end', 'after the scene tapped through'); await P('set', 'fast', false);
  note('lines shown', (await P('seenFrom', 0)).filter((l) => l.startsWith('line')).length);
});

C('keepers_fall', async () => {
  await toKeepers(); await until({ shot: 'two_keepers', last: true }); await P('die'); const s1 = await P('run', 2);
  note('felled at the last tick of the camera step', { dead: s1.dead, lock: s1.lock, modal: s1.modal });
  const z0 = await until({ free: true, wait: 240 }, 400, true); await built(); await P('run', 60); const z = { ...(await P('state')), ok: z0.ok }; const w = await P('who');
  ok(z.ok && !z.lock && !z.inputLock && !z.dead && z.pad, `a fall at the cut's last tick: the hero stands again, free, pad back (ok ${z.ok}, dead ${z.dead}, lock ${z.lock}, pad ${z.pad}, area ${z.area}, at ${z.x},${z.z})`);
  note('after the fall', { flags: z.flags, obj: z.obj, who: w, line: z.line.slice(0, 50) }); await still('fall_end', 'after a fall at the last tick of the cut');
});

/** the ending from a given place at the bell (dx, dz from the bell's spot) */
async function ending(tag, dx, dz, full) {
  await boot(after('ev_keepers')); await idle();
  const b = await P('spot', 'big_bell'), at = await P('putY', b.x + dx, b.z + dz, b.y); await ev(() => window.__sv.until({ idle: true }, 30));
  const s = await P('state'); note(`${tag}: the hero rings from`, { want: [b.x + dx, b.z + dz], at: [s.x, s.z], pills: s.pills });
  await P('ring', 'big_bell');
  await until({ line: '빵은' }, 120); const a = await still(`${tag}_bread`, 'ev_ending first page (two_keepers shot)'); ok(!a.pad && !a.pills.length, `${tag} bread: pad off, no pill`);
  await until({ shot: 'years', mid: true }, 200); await still(`${tag}_years`, 'years, middle');
  await until({ shot: 'two_keepers', first: true }, 300); const h0 = await still(`${tag}_home_first`, 'ev_ending_home, first frame of two_keepers'); ok(h0.area === 'eshville_now' && !h0.pad && !h0.pills.length && h0.lock, `${tag} home first frame: tonight, held, pad off, no pill (${h0.area}, lock ${h0.lock}, pad ${h0.pad}, pills ${h0.pills.length})`);
  const hid = []; if (full) hid.push(['ev_ending_home camera two_keepers', (await P('hide')).save]);
  await until({ line: '' }, 120); await still(`${tag}_home_bell`, 'ending.bell first page');
  await until({ shot: 'ring_widen', mid: true }, 300); const rw = await still(`${tag}_ring_widen`, 'ring_widen, middle'); ok(!rw.pad && !rw.pills.length, `${tag} ring_widen: pad off, no pill`);
  if (full) hid.push(['ev_ending_home camera ring_widen', (await P('hide')).save]);
  await until({ line: '' }, 200); await still(`${tag}_town_first`, 'ending.town first page');
  await until({ line: '로테?' }, 200); const l = await still(`${tag}_lotte`, '「…로테?」 (last page)'); ok(!l.pad && l.lock, `${tag} last page: held, pad off`);
  ok(!!l.who.alberto && Math.abs(l.who.alberto[0] - 4104) < 4 && !!l.who.elise && Math.abs(l.who.elise[0] - 4296) < 4, `${tag} 「…로테?」: Alberto on Lotte's place, Elise right of the bell (${JSON.stringify(l.who)})`);
  await until({ line: '까마귀' }, 200); const l2 = await still(`${tag}_last`, 'the last page before the story lets go'); ok(!l2.pad && l2.lock && !l2.pills.length, `${tag} last page: held, pad off, no pill`);
  if (!full) return;
  await ev(() => { window.__sv.adv = 6; });
  const c = await until({ modal: 'end' }, 300); const cs = await still(`${tag}_card`, 'the ending card'); ok(cs.modal === 'end' && !cs.pad, `the card is up, pad off (modal ${cs.modal}, pad ${cs.pad})`); void c;
  // a reload on the card
  const onCard = await P('saved'); const oc = onCard ? JSON.parse(onCard) : null; note('stored save while the card is up', oc ? { why: oc.why, area: oc.area, home: !!oc.story.flags?.elise_home, card: oc.ch?.card } : null);
  await reload(); const r = await until({ modal: 'end' }, 300, true); ok(r.ok && r.modal === 'end', `a reload on the card: the card comes up again (ok ${r.ok}, modal ${r.modal}, area ${r.area})`);
  const rs = await still(`${tag}_card_reload`, 'the card after a reload'); note('after the reload', { who: rs.who, obj: rs.obj, lock: rs.lock, inputLock: rs.inputLock });
  await P('tapEnd'); const t = await until({ top: 'V2Chooser' }, 200, true); ok(t.ok, `the card tapped: the 3D chooser is on top (${JSON.stringify(t).slice(0, 120)})`);
  await page.waitForTimeout(1000);   // one second after the card
  const after1 = await ev(() => localStorage.getItem('bn.v2.save')); const o1 = after1 ? JSON.parse(after1) : null; note('stored save one second after the card', o1 ? { why: o1.why, area: o1.area, card: o1.ch?.card, pos: o1.pos } : null);
  await reload(); const r2 = await until({ idle: true, wait: 200 }, 200, true); const r2s = await still(`${tag}_after_card_reload`, 'a reload one second after the card');
  ok(r2.ok && r2s.modal !== 'end' && !r2s.lock && !r2s.inputLock && r2s.pad, `a reload one second after the card: no card again, hero free, pad on (ok ${r2.ok}, modal ${r2s.modal}, lock ${r2s.lock}, pad ${r2s.pad}, area ${r2s.area})`);
  note('after the card, reloaded', { obj: r2s.obj, who: r2s.who, pills: r2s.pills, ended: r2s.ended });
  for (const [what, sv] of hid) {
    if (!sv) { ok(false, `hidden during ${what}: nothing was stored`); continue; }
    const o = JSON.parse(sv); note(`hidden during ${what}: stored`, { why: o.why, area: o.area, storyArea: o.story.area, spawn: o.story.spawn, pos: o.pos, home: !!o.story.flags?.elise_home });
    await boot(sv); const s2 = await until({ shot: 'two_keepers', first: true }, 300, true);
    ok(s2.ok && s2.area === 'eshville_now', `loaded: tonight's ending plays again from its start (${s2.ok ? 'two_keepers at ' + s2.x + ',' + s2.z : 'NOT REACHED ' + JSON.stringify(s2).slice(0, 260)})`);
    if (!s2.ok) { await still(`${tag}_hidden_stuck`, 'the loaded hidden save'); continue; }
    await ev(() => { window.__sv.adv = 6; }); const c2 = await until({ modal: 'end' }, 400, true); ok(c2.ok, `loaded: the ending runs to its card (${c2.ok})`);
  }
}
C('ending_mid', () => ending('mid', 0, -18, !args.lite));
C('ending_west', () => ending('west', -70, -6, false));
C('ending_east', () => ending('east', 70, -6, false));
C('ending_south', () => ending('south', 0, -72, false));

/** a save made while the card was up (the story has ended, the card was never dismissed), loaded: the card, the chooser, and a reload a second after it */
C('card', async () => {
  await boot(after('ev_ending_home')); const r = await until({ modal: 'end' }, 400, true);
  ok(r.ok && r.modal === 'end', `a save from the ending card, loaded: the card comes up again (ok ${r.ok}, modal ${r.modal}, area ${r.area})`);
  const cs = await still('card_loaded', 'the card after a load'); note('behind the card', { who: cs.who, obj: cs.obj, lock: cs.lock, pad: cs.pad, pills: cs.pills });
  const tp = await P('tapEnd'), t = await until({ top: 'V2Chooser' }, 200, true); ok(tp === true && t.ok, `the card tapped: the 3D chooser is on top (tap ${tp}, ${JSON.stringify(t).slice(0, 100)})`);
  await page.waitForTimeout(1000);
  const s1 = await ev(() => localStorage.getItem('bn.v2.save')), o1 = s1 ? JSON.parse(s1) : null; note('stored save one second after the card', o1 ? { why: o1.why, area: o1.area, card: o1.ch?.card, pos: o1.pos } : null);
  await reload(); const r2 = await until({ idle: true, wait: 200 }, 200, true), r2s = await still('after_card_reload', 'a reload one second after the card');
  ok(r2.ok && r2s.modal !== 'end' && !r2s.lock && !r2s.inputLock && r2s.pad, `a reload one second after the card: no card again, hero free, pad on (ok ${r2.ok}, modal ${r2s.modal}, lock ${r2s.lock}, pad ${r2s.pad}, area ${r2s.area})`);
  note('after the card, reloaded', { obj: r2s.obj, who: r2s.who, pills: r2s.pills, ended: r2s.ended, seenCard: r2s.seenCard });
  const b = await P('spot', 'big_bell'); await P('putY', b.x, b.z - 18, b.y); await P('run', 20); const n0 = (await P('state')).seen; await P('ring', 'big_bell'); const z = await until({ idle: true, wait: 60 }, 200, true);
  note('the big bell rung after the ending', { area: z.area, obj: z.obj, seen: await P('seenFrom', n0), modal: z.modal, lock: z.lock });
});

C('held_bell', async () => {
  await boot(after('ev_boss_intro')); await P('run', 180);
  const b = await P('spot', 'bell_arena'); await P('putY', b.x, b.z - 44, b.y ?? 0); await P('set', 'adv', 0); await P('run', 40);
  const s0 = await P('state'); note('in the hall, first act', { queen: s0.queen, at: [s0.x, s0.z], hp: s0.hp, obj: s0.obj, pad: s0.pad, pills: s0.pills });
  const w0 = s0.warn, n1 = s0.seen, h1 = await P('hold', 'bell', 320), s1 = await P('state'), shown1 = await P('seenFrom', n1);
  note('the bell held', { held: h1.held, modal: s1.modal, area: s1.area, hp: s1.hp, shown: shown1, queen: s1.queen });
  ok(s1.area === 'ossuary_now' && shown1.some((l) => l.includes('붙들고')), `the hall's bell held in her first act: he stays tonight and is told why (${s1.area}; ${shown1.length} shown)`);
  if (s1.modal === 'dialog') { await still('held_line', 'the line of the held bell'); const h2 = await P('hold', 'bell', 90, true), s2 = await P('state'); note('the bell pressed again while the line is up', { press: h2.err ?? h2.held, modal: s2.modal, area: s2.area, shown: (await P('seenFrom', n1)).length }); ok(s2.area === 'ossuary_now' && (await P('seenFrom', n1)).filter((l) => l.includes('붙들고')).length === 1, 'pressed again while the line is up: nothing more is raised'); }
  const z = await until({ free: true, wait: 20 }, 120, true);
  ok(z.ok && !z.lock && z.area === 'ossuary_now' && !!z.queen && z.queen.hp === s0.queen.hp && z.queen.phase === 1, `after the line: hero free, queen as she was (ok ${z.ok}, queen ${JSON.stringify(z.queen)}, was ${s0.queen?.hp})`);
  await P('set', 'adv', 0); const n2 = z.seen, t1 = await P('hold', 'bell', 5, true); await P('run', 50); note('the bell pressed short (a tap)', { shown: await P('seenFrom', n2), area: (await P('state')).area });
  await ev(() => { window.__sv.adv = 6; }); await until({ free: true, wait: 20 }, 60, true); await P('set', 'adv', 0); void t1;
  const n3 = (await P('state')).seen, h3 = await P('hold', 'bell', 320); await ev(() => { window.__sv.adv = 6; }); const z2 = await until({ free: true, wait: 20 }, 120, true);
  note('held a second time', { held: h3.held, shown: await P('seenFrom', n3), area: z2.area, hp: z2.hp, warnings: z2.warn - w0, last: await P('warnings') });
  ok(z2.area === 'ossuary_now' && !z2.lock, `held again: still tonight, free (${z2.area})`);
});

C('old_boss', async () => {
  const D = 'tools/v2/fixtures/saves_apk11';
  for (const f of fs.readdirSync(D).filter((x) => /boss/.test(x)).sort()) {
    await boot(read(f, D)); const s = await until({ idle: true, wait: 30 }, 200, true);
    ok(s.ok && !s.lock && s.pad, `${f}: loads and stands free (ok ${s.ok}, area ${s.area}, lock ${s.lock}, pad ${s.pad})`);
    note(f, { area: s.area, at: [s.x, s.z], hp: s.hp, obj: s.obj, queen: s.queen, kept: s.q, flags: s.flags, pills: s.pills, line: s.line.slice(0, 40), warn: s.warn });
    await still(f.replace(/\.json$/, ''), 'an old boss save, loaded');
    if (/intro/.test(f)) { const n0 = s.seen; await P('trig', 'boss.enter'); const z = await until({ idle: true, wait: 30 }, 200, true); note(f + ': he steps into the hall', { shown: (await P('seenFrom', n0)).length, obj: z.obj, queen: z.queen }); }
  }
});

const t00 = Date.now();
for (DEV of DEVS) {
  for (const S of chains) {
    if (ONLY && !ONLY.includes(S.id)) continue;
    chain = S.id; nShot = 0; const t0 = Date.now(); put(`── [${DEV}] ${S.id}`);
    try { await S.fn(); } catch (e) { bad++; put(`STOP [${DEV}/${S.id}] ${String(e?.message ?? e).slice(0, 600)}`); try { await page.screenshot({ path: `${OUT}/${DEV}_${S.id}_stopped.jpg`, type: 'jpeg', quality: 80 }); } catch { /* no page */ } }
    put(`   (${S.id}: ${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}
put(`${nOk} ok, ${bad} failed, page errors ${errors.length}${errors.length ? ' - ' + errors[0] : ''} (${Math.round((Date.now() - t00) / 1000)} s)`);
await browser.close(); srv.close?.();
process.exit(bad || errors.length ? 1 : 0);
