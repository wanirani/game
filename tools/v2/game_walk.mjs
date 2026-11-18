// v2g walk check (INTEGRATE-A): a bot plays the real areas through the NEW pad (cut-glass interface, the default):
//   eshville_now from the first spawn -> clears what it meets (the square arena opens the graveyard gate while no story is plugged in)
//   -> walks into the gate (fade, load) -> graveyard_now -> past the bats, the gate keeper (elite) and the ghosts -> the mausoleum door.
// 1 trusted touches (CDP) on the new pad: stick moves the hero, the attack button swings, the disabled skill / bell buttons answer with a notice
// 2 the walk: pointer events on the pad's own handlers every tick (stick drag + attack / roll / jump presses), fast-forwarded
// 3 people: a prompt near a townsperson, tap it -> dialogue box; no prompt while an enemy is awake nearby
//   node tools/v2/game_walk.mjs [--devices fold_open,phone2] [--shots /tmp/claude-0/v2/integA] [--res 0.5] [--verbose 1] [--json out.json]
// Headless Chromium draws WebGL with a software renderer: the walk renders at half size to finish in time (--res 1 = full size).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';
import { installBot } from './game_bot.mjs';
import { loadPropsNode } from './world_node.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(','), SHOTS = String(args.shots || '/tmp/claude-0/v2/integA'), RES = Number(args.res ?? 0.5);
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'];
const fails = [], report = {};
const fail = (m) => { fails.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
fs.mkdirSync(SHOTS, { recursive: true });

// routes from the world's own reach grid (docs/v2/AREA_FORMAT.md 10)
loadPropsNode();
const { AREAS } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
async function routeTo(areaId, spawn, pick) {
  const a = await AREAS[areaId](), W = compileEnv(a.stage), s = a.spawns[spawn] ?? a.spawns.default;
  for (const R of [26, 14]) { const g = reachGrid(W, s.x, s.z, R), p = pick(g, a); if (p) { const path = g.path(p[0], p[1]); if (path) return path; } }
  return null;
}
const R1 = await routeTo('eshville_now', 'default', (g, a) => { const x = a.exits.find((q) => q.id === 'to_graveyard'); return g.anyIn(x.x0 + 40, x.x1 - 40, x.z0 + 12, x.z1) ?? g.anyIn(x.x0, x.x1, x.z0, x.z1); });
const R2 = await routeTo('graveyard_now', 'from_eshville', (g) => g.near(600, 1900, 50));
if (!R1 || !R2) { console.log('FAIL no walkable route from the reach grid', !!R1, !!R2); process.exit(1); }
console.log(`routes: eshville_now ${R1.length} waypoints (to ${R1[R1.length - 1].map(Math.round)}), graveyard_now ${R2.length} waypoints (to ${R2[R2.length - 1].map(Math.round)})`);

const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const shot = async (page, name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const v2pad = (page) => page.evaluate(() => { const m = window.__v2?.scene?.hud?.metrics?.(); if (!m?.pad) return null; const B = {}; for (const b of m.pad.buttons) B[b.id === 'roll' ? 'dash' : b.id] = { cx: b.cx, cy: b.cy, d: b.d, disabled: b.disabled }; return { buttons: B, stick: m.pad.stick, shown: m.pad.shown }; });

for (const dev of DEVICES) {
  console.log(`\n[${dev}]`);
  const R = (report[dev] = {});
  const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
  const page = await (await browser.newContext(contextOptions(dev))).newPage(), errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  try {
    await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0${RES < 1 ? '&v2res=' + RES : ''}`);
    await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 90000 }).catch(() => errs.push('ready timeout'));
    await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 15000 }).catch(() => {});
    const st0 = await page.evaluate(() => { const v = window.__v2; return v?.ready ? { area: v.area, hud: v.stats.hud, people: v.people.length, kinds: [...new Set(v.enemies.map((e) => e.kind))], res: v.stats.res, anchors: v.stats.anchors, exits: v.exits.map((x) => x.id + ':' + x.locked) } : { err: v?.error ?? 'not ready' }; });
    R.start = st0;
    if (st0.area === 'eshville_now' && st0.hud === 'ui') ok(`「본 게임」 opens ${st0.area} with the cut-glass interface (hud "${st0.hud}"): ${st0.people} people, enemy kinds ${st0.kinds.join(' ')}, ${st0.anchors.n} effect anchors, exits ${st0.exits.join(' ')}, 3D canvas ${st0.res.w}x${st0.res.h}`);
    else { fail(`${dev}: start ${JSON.stringify(st0)}`); continue; }
    // ── 1) trusted touches on the new pad ──
    const cdp = await page.context().newCDPSession(page), T = new Touch(cdp, page);
    await ensureTouchMode(T, page); await page.waitForTimeout(400);
    let pad = await v2pad(page);
    if (!pad || !pad.buttons.attack || !pad.buttons.dash || !pad.buttons.jump) { fail(`${dev}: new pad geometry missing ${JSON.stringify(pad)}`); continue; }
    const vp = await page.evaluate(() => [innerWidth, innerHeight]), sx = Math.round(vp[0] * 0.2), sy = Math.round(vp[1] * 0.68);
    const h0 = await page.evaluate(() => window.__v2.hero);
    await T.down(21, sx, sy); await page.waitForTimeout(40); for (let i = 1; i <= 4; i++) { await T.move(21, sx + 12 * i, sy); await page.waitForTimeout(20); }
    await page.waitForFunction((x0) => window.__v2.hero.x > x0 + 30, h0.x, { timeout: 20000 }).catch(() => {});
    await T.up(21);
    const h1 = await page.evaluate(() => window.__v2.hero);
    const swing = page.evaluate(async () => { const t0 = performance.now(); while (performance.now() - t0 < 8000) { if (window.__v2.hero.anim === 'attack') return true; await new Promise((r) => setTimeout(r, 8)); } return false; });
    await T.down(11, pad.buttons.attack.cx, pad.buttons.attack.cy); await page.waitForTimeout(220); await T.up(11);
    const swung = await swing;
    // the two buttons the rules cannot use yet: dimmed, and a press answers with a notice instead of doing nothing
    const off = ['skill', 'bell'].filter((k) => pad.buttons[k]?.disabled);
    let said = null;
    if (off.length) {
      const b = pad.buttons[off[0]]; await page.waitForTimeout(300);
      await T.down(12, b.cx, b.cy); await page.waitForTimeout(160); await T.up(12); await page.waitForTimeout(500);
      said = await page.evaluate(() => { const sc = window.__v2.scene; return { offT: sc._offT > 0, toasts: sc.hud.metrics?.().hud?.toasts ?? null }; });
    }
    R.touch = { moved: Math.round(h1.x - h0.x), swung, off, said };
    if (R.touch.moved > 30 && swung) ok(`trusted touch on the new pad: stick moved the hero ${R.touch.moved} px, the attack button swings`); else fail(`${dev}: trusted touch ${JSON.stringify(R.touch)}`);
    if (off.length === 0) ok('skill and bell buttons are live (the rules have them)');
    else if (said?.offT) ok(`buttons the rules cannot use yet (${off.join(', ')}) are drawn disabled and a press answers with a notice`);
    else fail(`${dev}: a disabled button (${off.join(', ')}) pressed without any answer ${JSON.stringify(said)}`);
    await shot(page, `walk_${dev}_00_start`);

    // ── 2) the walk through the pad ──
    await page.evaluate(installBot, R1);
    await page.evaluate(([x0, y0, btn]) => {
      const v = window.__v2, B = window.__bot; B.opt.giveUp = 1500; B.opt.hunt = () => { const x = v.exits.find((q) => q.id === 'to_graveyard'); return !!(x && x.locked); };
      B.seen = {}; B.touchSetup(x0, y0, 56, btn);
    }, [sx, sy, pad.buttons]);
    const sections = [], cap = new Set(), t0 = Date.now(); let r = null, phase = 1, reached = false, lockedSeen = false, promptSeen = null;
    for (let i = 0; i < 400 && Date.now() - t0 < 540000; i++) {
      r = await page.evaluate(() => { const B = window.__bot, v = window.__v2, o = B.touchRun(180, 45); if (v.ready) { o.exit = v.exits.map((x) => x.id + ':' + (x.locked ?? 'open')).join(' '); o.prompt = v.prompt?.id ?? null; o.near = (v.scene.area.exits.find((x) => x.id === 'to_ossuary') ?? {})._near ?? false; } return o; });
      if (r.loading) { await page.waitForTimeout(400); continue; }
      const tag = r.area + '/' + r.sec; if (!sections.includes(tag)) sections.push(tag);
      if (args.verbose) console.log('       ' + JSON.stringify({ a: r.area, sec: r.sec, x: r.x, z: r.z, hp: r.hp, left: r.left, deaths: r.deaths, wp: r.wp, kinds: r.kinds, exit: r.exit, skips: r.skips }));
      if (r.prompt && !promptSeen) promptSeen = r.prompt;
      for (const k of Object.keys(r.kinds ?? {})) if (r.kinds[k] >= 2 && !cap.has(r.area + k)) { cap.add(r.area + k); if (dev === DEVICES[0]) await shot(page, `walk_${dev}_fight_${r.area}_${k}`); }
      if (phase === 1 && r.area === 'graveyard_now') { phase = 2; await page.evaluate((route) => { const B = window.__bot; B.setRoute(route); B.opt.hunt = null; B.opt.giveUp = 900; }, R2); await shot(page, `walk_${dev}_10_graveyard`); }
      if (phase === 2 && r.near) { lockedSeen = true; }
      if (phase === 2 && r.z > 1850 && Math.abs(r.x - 600) < 90) { reached = true; break; }
    }
    await page.evaluate(() => window.__bot.touchEnd());
    await shot(page, `walk_${dev}_20_end`);
    R.walk = { ...r, sections, reached, lockedSeen, promptSeen, wallSec: +((Date.now() - t0) / 1000).toFixed(1) };
    const kinds = Object.keys(r?.kinds ?? {});
    if (reached && phase === 2) ok(`walk through the new pad: eshville_now first spawn -> graveyard gate -> graveyard_now -> mausoleum at (${r.x}, ${r.z}); ${(r.ticks / 60).toFixed(0)} s of play, ${r.stickMoves} stick moves, presses attack ${r.presses.attack} · roll ${r.presses.dash} · guard ${r.presses.guard} · jump ${r.presses.jump}; fought ${kinds.map((k) => k + ' x' + r.kinds[k]).join(', ')}; fell ${r.deaths} times in the graveyard, hp ${r.hp}; sections ${sections.join(' > ')}`);
    else fail(`${dev}: the walk did not reach the mausoleum (phase ${phase}) ${JSON.stringify(R.walk)}`);
    if (reached) { if (lockedSeen) ok('the locked mausoleum door stopped the hero and said why (exit to_ossuary, once per approach)'); else console.log('       note: the hero stopped short of the locked mausoleum door (no notice needed yet)'); }

    // ── 3) people: prompt, tap, dialogue; no prompt during a fight ──
    const ppl = await page.evaluate(async () => {
      const v = window.__v2, sc = v.scene, g = window.__game; g._pageHidden = true;
      await sc.gotoArea('eshville_now', 'square'); sc.fadeTo = 0; sc.fadeA = 0; sc.locked = false;
      const sim = sc.sim, h = sim.hero, out = {}; const run = (n) => { for (let i = 0; i < n; i++) g.tick(1 / 60); g.alpha = 1; g.render(); };
      const p = sc.people.byId('rook'); h.x = p.x - 70; h.z = p.z + 10; sc.cam.snap = true;
      for (const e of sim.enemies) { e.active = true; e.x = h.x + 200; e.z = h.z; } run(20); out.fight = v.prompt;            // enemies awake and near: no prompt
      for (const e of sim.enemies) e.dead = true; run(40); out.calm = v.prompt; out.rects = sc.hud.metrics().prompts; out.solid = [Math.round(h.x), Math.round(h.z)];
      out.css = g.cssScale; out.rect = g.canvasRect; g._pageHidden = false;
      return out;
    });
    let dlg = null;
    if (ppl.calm && ppl.rects?.length) {
      const q = ppl.rects[0], cx = ppl.rect.x + (q.x + q.w / 2) * ppl.css, cy = ppl.rect.y + (q.y + q.h / 2) * ppl.css;
      await page.waitForTimeout(500); await shot(page, `walk_${dev}_30_prompt`);
      await T.down(31, cx, cy); await page.waitForTimeout(120); await T.up(31);
      await page.waitForFunction(() => window.__v2.scene.hud.modal === 'dialog', null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      dlg = await page.evaluate(() => { const sc = window.__v2.scene; return { modal: sc.hud.modal, talking: sc.people.talking?.id ?? null, clip: sc.people.byId('rook').a3.anim.cur?.name, d: sc.hud.metrics().dialog }; });
      await shot(page, `walk_${dev}_31_dialog`);
      await T.tap(vp[0] * 0.5, vp[1] * 0.4, 60); await page.waitForTimeout(500); await T.tap(vp[0] * 0.5, vp[1] * 0.4, 60); await page.waitForTimeout(700);
      dlg.after = await page.evaluate(() => window.__v2.scene.hud.modal);
    }
    R.people = { ...ppl, dlg };
    if (!ppl.fight && ppl.calm?.id === 'rook' && dlg?.modal === 'dialog' && !dlg.after) ok(`people: no prompt while enemies are awake nearby; calm -> prompt 「${ppl.calm.label}」 on ${ppl.calm.id}; a tap on it opens the dialogue box (talk clip ${dlg.clip}), a tap closes it`);
    else fail(`${dev}: people prompt / dialogue ${JSON.stringify(R.people)}`);
    if (errs.length) fail(`${dev}: page errors ${errs.slice(0, 4).join(' | ')}`); else ok('0 page errors');
  } catch (e) { fail(`${dev}: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' / ')}`); } finally { await browser.close(); }
}
srv.close();
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1));
console.log(fails.length ? `\nFAIL (${fails.length})\n` + fails.map((f) => ' - ' + f).join('\n') : '\nALL OK');
process.exit(fails.length ? 1 : 0);
