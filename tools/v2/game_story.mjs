// v2g story check (INTEGRATE-B2): 「본 게임」 with the real story (src/v2/data) plugged in, played through the NEW pad by pointer events
// on the pad's own handlers (the route bot of game_bot.mjs for walking and fighting, taps for dialogue pages, prompt pills and the bell button).
//   node tools/v2/game_story.mjs --plan boot      opening only (smoke)
//   node tools/v2/game_story.mjs --plan first15   GDD 9.1 from a clean save: opening -> Eshville tonight -> people -> church -> bell -> tower -> 1697 -> first crossing -> the change seen tonight
//   node tools/v2/game_story.mjs --plan saves     save -> reload -> continue at five points
//   node tools/v2/game_story.mjs --plan cross30   30 crossings in a row (GPU bytes, canvases, heap)
//   node tools/v2/game_story.mjs --plan edges     crossing while attacking, hurt, in the air, next to walls, during a dialogue
//   [--device fold_open] [--out /tmp/claude-0/v2/integB2] [--res 0.5] [--verbose 1]
// What the player saw (banners, lines, notices, objectives, prompts, in order) comes from scene.host.seen and is written to <out>/<plan>.txt.
// A beat the bot cannot play inside its budget is helped (the tool fells the group or puts the hero at the spot) and listed as helped.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';
import { installBot } from './game_bot.mjs';
import { loadPropsNode } from './world_node.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const PLAN = String(args.plan || 'boot'), DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/integB2'), RES = Number(args.res ?? 0.5), VERB = !!args.verbose;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'];
fs.mkdirSync(OUT, { recursive: true });
const fails = [], helped = [], notes = [];
const fail = (m) => { fails.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const help = (m) => { helped.push(m); console.log('  HELP ' + m); };

loadPropsNode();
const { AREAS } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const built = new Map();
async function areaOf(id, flags) { const k = id + '|' + Object.keys(flags ?? {}).filter((f) => flags[f]).sort().join('+'); let o = built.get(k); if (!o) { const a = await AREAS[id](flags ?? {}); o = { a, W: compileEnv(a.stage) }; built.set(k, o); } return o; }
async function pathTo(id, flags, x, z, tx, tz, tr = 60) {
  const { W } = await areaOf(id, flags);
  for (const R of [26, 14]) { const g = reachGrid(W, x, z, R), p = g.near(tx, tz, tr) ?? g.near(tx, tz, tr * 2.5); if (p) { const path = g.path(p[0], p[1]); if (path && path.length) return path; } }
  return null;
}

/** in the page: taps, fast-forward steps, what the player saw */
function installSt() {
  const g = window.__game, v = window.__v2, B = window.__bot;
  const fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
  const toClient = (lx, ly) => { const r = g.canvasRect, s = v.scene.state; return [r.x + lx / s.viewW * r.w, r.y + ly / s.viewH * r.h]; };
  const S = (window.__st = { dlgT: 0, taps: 0, pills: 0, choice: 0, bellDown: false, fire, toClient });
  S.draw = () => { g.alpha = 1; g.render(); };
  S.step = (bot) => {
    const sc = v.scene, m = sc.hud?.modal ?? null;
    if (m === 'dialog') {
      if (B.ts) B.touchEnd();
      if (++S.dlgT >= 9) {
        S.dlgT = 0; const d = sc.hud.metrics?.().dialog; let x = sc.state.viewW / 2, y = sc.state.viewH * 0.3;
        if (d && d.choices && Array.isArray(d.choiceRects) && d.choiceRects.length && d.shown >= d.total && d.page >= d.pages - 1) { const r = d.choiceRects[S.choice] ?? d.choiceRects[0]; if (r) { x = r.x + r.w / 2; y = r.y + r.h / 2; } }
        const c = toClient(x, y); fire('pointerdown', 31, c[0], c[1]); fire('pointerup', 31, c[0], c[1]); S.taps++;
      }
    } else if (bot && v.ready && !sc._go && !sc.xing && B.ts) B.touchStep();
    g.tick(1 / 60);
  };
  /** n rule ticks; stops early when `until` (a function name on S.u) says so */
  S.run = (n, bot, until) => { g._pageHidden = true; let i = 0; for (; i < n; i++) { S.step(bot); if (i % 40 === 0) S.draw(); if (until && S.u[until]()) break; } if (B.ts) B.touchEnd(); S.draw(); return S.status(i); };
  S.status = (i) => { const sc = v.scene, h = sc.sim?.hero, H = sc.host; return { i, ready: !!v.ready, area: v.area, sec: v.section, x: h ? Math.round(h.x) : 0, y: h ? Math.round(h.y) : 0, z: h ? Math.round(h.z) : 0, hp: h ? Math.round(h.hp) : 0, dead: !!h?.dead, modal: sc.hud?.modal ?? null, go: !!sc._go, xing: !!sc.xing, busy: !!H?.st.busy, running: H?.st.running ?? null, seen: H ? H.seen.length : 0, obj: H?.objective ?? '', prompt: v.prompt?.id ?? null, left: v.enemies.length, flags: Object.keys(H?.st.state.flags ?? {}).join(' '), saves: H?.saves ?? 0, locks: !!H?.locks() }; };
  S.u = {
    idle: () => { const sc = v.scene; return v.ready && !sc.hud.modal && !sc.host.st.busy && !sc._go && !sc.xing && sc.fadeA <= 0.01; },
    busy: () => !!v.scene.host.st.busy || !!v.scene.hud.modal,
    prompt: () => !!v.prompt && !v.scene.hud.modal,
    away: () => !v.ready || !!v.scene._go || !!v.scene.xing,
  };
  S.seen = (from) => v.scene.host.seen.slice(from);
  /** tap the prompt pill on offer (touch: the pill is the button for talking and looking) */
  S.pill = () => { const sc = v.scene; S.draw(); const P = sc.hud.metrics?.().prompts ?? []; const p = P.find((q) => q.action === 'confirm'); if (!p || !v.prompt) return null; const c = toClient(p.x + p.w / 2, p.y + p.h / 2); fire('pointerdown', 32, c[0], c[1]); fire('pointerup', 32, c[0], c[1]); S.pills++; g.tick(1 / 60); g.tick(1 / 60); return v.prompt?.id ?? '?'; };
  /** hold the bell button until the long ring has rung (or n ticks) */
  S.bell = (n) => { const sc = v.scene, b = sc.hud.metrics?.().pad?.buttons?.find((q) => q.id === 'bell'); if (!b) return { err: 'no bell button' }; if (B.ts) B.touchEnd(); g._pageHidden = true; const seen0 = sc.host.seen.length; let i = 0, rang = false;
    fire('pointerdown', 15, b.cx, b.cy); for (; i < n; i++) { g.tick(1 / 60); if (i % 30 === 0) S.draw(); if (sc.host.st.busy || sc.hud.modal || sc.xing || sc.host.seen.length > seen0) { rang = true; break; } } fire('pointerup', 15, b.cx, b.cy); g.tick(1 / 60); S.draw();
    return { i, rang, act: sc.sim.hero.act ?? null, charge: sc.sim.hero.bellCharge ?? 0, disabled: !!b.disabled }; };
  S.fell = (group) => { const sim = v.scene.sim; let n = 0; for (const e of sim.enemies) if (e.group === group && !e.dead && e.state !== 'dead') { e.hp = 0; sim._kill(e); n++; } return n; };
  S.put = (x, z, y) => { const sc = v.scene, h = sc.sim.hero; h.x = x; h.z = z; if (y != null) h.y = y; h.vx = 0; h.vz = 0; h.vy = 0; if (h.safe) { h.safe.x = x; h.safe.z = z; h.safe.y = h.y; } sc.cam.snap = true; g.tick(1 / 60); return [Math.round(h.x), Math.round(h.y), Math.round(h.z)]; };
}

const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage(), errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); else if (VERB && m.type() === 'warning') console.log('       [warn] ' + m.text().slice(0, 200)); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
const shot = async (name) => { await page.evaluate(() => window.__st?.draw()); await page.waitForTimeout(120); await page.screenshot({ path: `${OUT}/${name}.png` }); };
let seenAt = 0; const SEEN = [];
const fmt = (e) => (e[0] === 'line' ? `    ${e[1]}: ${String(e[2]).replace(/\n/g, ' / ')}` : e[0] === 'banner' ? `  [띠] ${e[1]}${e[2] ? ' — ' + e[2] : ''}` : e[0] === 'notice' ? `  [알림] ${e[1]}` : e[0] === 'objective' ? `  [목표] ${e[1]}` : e[0] === 'prompt' ? `  [단추 안내] ${e[1]} (${e[2]})` : e[0] === 'choice' ? `  [고르기] ${e[1]}` : `  [${e[0]}] ${e[1]}${e[2] ? ' ' + e[2] : ''}`);
async function drain(label) { const add = await page.evaluate((f) => (window.__v2?.scene?.host ? window.__st.seen(f) : []), seenAt); seenAt += add.length; if (label) SEEN.push('── ' + label); for (const e of add) SEEN.push(fmt(e)); if (VERB) for (const e of add) console.log('      ' + fmt(e)); return add; }
const st = () => page.evaluate(() => window.__st.status(0));
const flagsNow = () => page.evaluate(() => ({ ...(window.__v2.scene.worldFlags ?? {}) }));
async function open(q = '') {
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0${RES < 1 ? '&v2res=' + RES : ''}${q}`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 90000 }).catch(() => errs.push('ready timeout'));
  await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 15000 }).catch(() => {});
  const cdp = await page.context().newCDPSession(page), T = new Touch(cdp, page);
  await ensureTouchMode(T, page); await page.waitForTimeout(300);
  await page.evaluate(installBot, [[0, 0]]); await page.evaluate(installSt);
  const pad = await page.evaluate(() => { const m = window.__v2.scene.hud.metrics?.(); if (!m?.pad) return null; const Bt = {}; for (const b of m.pad.buttons) Bt[b.id === 'roll' ? 'dash' : b.id] = { cx: b.cx, cy: b.cy, d: b.d, disabled: b.disabled }; return Bt; });
  const vp = await page.evaluate(() => [innerWidth, innerHeight]);
  await page.evaluate(([x0, y0, btn]) => { const B = window.__bot; B.opt.giveUp = 1500; B.touchSetup(x0, y0, 56, btn); }, [Math.round(vp[0] * 0.2), Math.round(vp[1] * 0.68), pad]);
  seenAt = 0;
  return page.evaluate(() => ({ area: window.__v2.area, hud: window.__v2.stats.hud, story: !!window.__v2.scene.host, save: localStorage.getItem('bn.v2.save') ? 1 : 0 }));
}
/** run chunks until the page says `until` (S.u name) or `pred(status)`; waits out area loads. -> last status */
async function play(ticks, { bot = true, until = null, pred = null, chunk = 240 } = {}) {
  let s = null, left = ticks, idleLoads = 0;
  while (left > 0) {
    s = await page.evaluate(([n, b, u]) => window.__st.run(n, b, u), [Math.min(chunk, left), bot, until]);
    left -= Math.max(1, s.i);
    if (!s.ready) { await page.waitForTimeout(350); if (++idleLoads > 120) break; continue; }
    if (until && (await page.evaluate((u) => window.__st.u[u](), until))) break;
    if (pred && pred(s)) break;
  }
  return s ?? (await st());
}
/** let a running sequence and its dialogues finish */
const settle = async (max = 2400) => { await play(60, { bot: false }); return play(max, { bot: false, until: 'idle', chunk: 120 }); };
/** walk (and fight what is in the way) to a point; done = within r, or pred */
async function walk(tx, tz, { r = 70, budget = 3600, pred = null, label = '' } = {}) {
  let s = await st(), replan = 0, last = null;
  for (let used = 0; used < budget;) {
    if (!s.ready) { await page.waitForTimeout(350); s = await st(); used += 20; continue; }
    if (Math.hypot(s.x - tx, s.z - tz) < r || (pred && pred(s))) return { ok: true, s };
    if (!last || replan-- <= 0) { const path = await pathTo(s.area, await flagsNow(), s.x, s.z, tx, tz, r * 0.7); if (path) { await page.evaluate((p) => window.__bot.setRoute(p), path); last = path; replan = 6; } else if (!last) return { ok: false, s, why: 'no route on the reach grid' }; }
    s = await page.evaluate(([n]) => window.__st.run(n, true, null), [200]); used += Math.max(1, s.i);
  }
  return { ok: Math.hypot(s.x - tx, s.z - tz) < r || !!(pred && pred(s)), s, why: 'budget of ' + budget + ' ticks used' + (label ? ' (' + label + ')' : '') };
}
/** fight until a group has fallen; the tool fells what is left when the budget runs out */
async function clear(group, { budget = 3000 } = {}) {
  let s = await st();
  for (let used = 0; used < budget;) {
    const g = await page.evaluate((gr) => { const sim = window.__v2.scene.sim, h = sim.hero; let best = null, bd = 1e9, n = 0; for (const e of sim.enemies) { if (e.group !== gr || e.dead || e.state === 'dead') continue; n++; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd) { bd = d; best = [Math.round(e.x), Math.round(e.z)]; } } return { n, best, d: Math.round(bd) }; }, group);
    if (!g.n) return { ok: true, s };
    if (g.d > 240) { const path = await pathTo(s.area, await flagsNow(), s.x, s.z, g.best[0], g.best[1], 120); if (path) await page.evaluate((p) => window.__bot.setRoute(p), path); }
    s = await page.evaluate(([n]) => window.__st.run(n, true, null), [200]); used += Math.max(1, s.i);
    if (!s.ready) { await page.waitForTimeout(350); s = await st(); }
  }
  const n = await page.evaluate((gr) => window.__st.fell(gr), group);
  if (n) help(`group "${group}": the bot did not finish the fight in ${budget} ticks — the tool felled the last ${n}`);
  return { ok: !n, s: await st() };
}
const center = (b) => [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
const def = async (id) => (await areaOf(id, await flagsNow())).a;
async function useSpot(what, { budget = 2400 } = {}) {   // walk to a person or a spot, tap its pill
  const s0 = await st(), a = await def(s0.area), t = a.actors.find((q) => q.id === what) ?? a.interact.find((q) => q.id === what || q.event === what);
  if (!t) return { ok: false, why: 'no "' + what + '" in ' + s0.area };
  const w = await walk(t.x, t.z, { r: 70, budget, pred: (s) => s.prompt === t.id });
  let got = null;
  for (let i = 0; i < 12 && !got; i++) { const s = await play(30, { bot: false }); if (s.prompt === t.id) got = await page.evaluate(() => window.__st.pill()); else if (i % 3 === 2) await walk(t.x, t.z, { r: 40, budget: 300, pred: (q) => q.prompt === t.id }); }
  if (!got) return { ok: false, why: `no prompt for "${what}" (hero ${JSON.stringify([w.s.x, w.s.z])}, spot ${[t.x, t.z]}, ${w.why ?? ''})` };
  await settle();
  return { ok: true };
}
const beats = [];
const beat = async (name, fn) => { const t0 = Date.now(); let r; try { r = await fn(); } catch (e) { r = { ok: false, why: 'tool error: ' + String(e?.message ?? e).slice(0, 200) }; } const add = await drain(name); const s = await st().catch(() => null); const line = `${r?.ok ? 'ran ' : 'NOT '} ${name}${r?.ok ? '' : ' — ' + (r?.why ?? '?')}  [${s ? s.area + ' ' + s.x + ',' + s.z + ' hp ' + s.hp : ''}; ${add.length} things shown; ${((Date.now() - t0) / 1000).toFixed(0)} s]`; beats.push(line); console.log('  ' + line); return r; };

try {
  const o = await open();
  if (o.area === 'eshville_now' && o.story && o.hud === 'ui') ok(`「본 게임」 opens ${o.area} with the story plugged in (hud ${o.hud}, save in storage: ${o.save})`); else fail('start ' + JSON.stringify(o));
  if (PLAN === 'boot' || PLAN === 'first15') {
    await beat('서막 (opening: banner, moon shot, first lines, objective)', async () => { const s = await settle(1800); return { ok: s.obj !== '' && !s.busy, why: 'opening did not finish: ' + JSON.stringify(s) }; });
    await shot(`${PLAN}_01_opening`);
  }
  if (PLAN === 'first15') {
    const A = await def('eshville_now'), trig = (ev) => center(A.triggers.find((t) => t.event === ev));
    await beat('마을 외곽: 첫 종소리 (trigger bell.toll)', async () => { const p = trig('bell.toll'); const w = await walk(p[0], p[1], { r: 60, budget: 2400 }); await settle(); return w; });
    await beat('마을 외곽의 해골 (group out_a)', async () => { const r = await clear('out_a', { budget: 2400 }); await settle(); return r; });
    await beat('큰길 어귀 (trigger tutorial.guard)', async () => { const p = trig('tutorial.guard'); const w = await walk(p[0], p[1], { r: 60, budget: 3000 }); await settle(); return w; });
    await beat('큰길의 첫 싸움 (group st_a) → 문 두드리는 소리', async () => { const r = await clear('st_a', { budget: 2700 }); await settle(); return r; });
    await beat('갇힌 사람의 문 (interact door.pull)', async () => useSpot('door.pull'));
    await shot('first15_02_door');
    await beat('큰길 안쪽 (group st_b) → 광장으로', async () => { const r = await clear('st_b', { budget: 2700 }); await settle(); return r; });
    await beat('첫 사람들: 마르타에게 말을 건다', async () => useSpot('marta'));
    await shot('first15_03_people');
    await beat('광장 (trigger square.enter)', async () => { const p = trig('square.enter'); const w = await walk(p[0], p[1], { r: 80, budget: 3000 }); await settle(); return w; });
    await beat('광장의 싸움 (group sq) → 세라', async () => { const r = await clear('sq', { budget: 3600 }); await settle(); return r; });
    await shot('first15_04_square');
    await beat('성당 (trigger church.arrive): 알베르토 신부와 엘리제, 약속', async () => { const p = trig('church.arrive'); const w = await walk(p[0], p[1], { r: 80, budget: 3600 }); await settle(3000); return w; });
    await shot('first15_05_church');
    await beat('촛불 앞에서 쉰다 (interact rest) → 저장', async () => { const r = await useSpot('rest'); const s = await st(); return r.ok ? { ok: s.saves > 0, why: 'no save was written' } : r; });
    await beat('큰 종을 살핀다 (interact bell.ring, 오늘 밤)', async () => useSpot('bell.ring'));
    await shot('first15_06_bell_now');
    await beat('종탑 문 (exit to_belltower) → 종탑', async () => { const x = (await def('eshville_now')).exits.find((q) => q.id === 'to_belltower'), p = center(x); const w = await walk(p[0], p[1], { r: 30, budget: 3000, pred: (s) => s.area === 'belltower_now' }); const s = await play(600, { bot: false, pred: (q) => q.ready && q.area === 'belltower_now' }); await settle(); return { ok: s.area === 'belltower_now', why: 'still in ' + s.area + ' ' + (w.why ?? '') }; });
    await beat('종탑을 오른다 (trigger tower.top)', async () => {
      const T = await def('belltower_now'), t = T.triggers.find((q) => q.event === 'tower.top'), p = center(t);
      let w = await walk(p[0], p[1], { r: 50, budget: 5400, pred: (s) => s.flags.includes('fell') || s.running === 'ev_tower_top' });
      const s = await st();
      if (!w.ok && s.area === 'belltower_now') { const y = t.y ?? (T.spawns.top?.y ?? null); const at = await page.evaluate(([x, z]) => { const sc = window.__v2.scene; let g = -1e9; for (const b of sc.W.boxes) if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > g) g = b.y1; return window.__st.put(x, z, g > -1e8 ? g : null); }, p); help(`tower: the bot did not reach the top by itself (${w.why}) — the tool put the hero on the top floor at ${at} (given y ${y})`); w = { ok: true }; }
      await settle(); return w; });
    await shot('first15_07_tower_top');
    await beat('박쥐 떼 (group tower_bats) → 종에 금이 가고 떨어진다', async () => { const r = await clear('tower_bats', { budget: 3000 }); const s = await play(3600, { bot: false, pred: (q) => q.ready && q.area === 'eshville_past' && !q.busy && !q.modal, chunk: 120 }); await settle(3000); return { ok: (await st()).area === 'eshville_past', why: 'not in eshville_past: ' + JSON.stringify(s) }; });
    await shot('first15_08_past_wake');
    const P = await def('eshville_past'), ptrig = (ev) => center(P.triggers.find((t) => t.event === ev));
    await beat('그 밤의 큰길 (trigger past.street)', async () => { const p = ptrig('past.street'); const w = await walk(p[0], p[1], { r: 70, budget: 4200 }); await settle(); return w; });
    await beat('그 밤 큰길의 싸움 (group st_p) → 에드문트', async () => { const r = await clear('st_p', { budget: 3600 }); await settle(); return r; });
    await beat('에드문트의 식탁 (talk edmund.tavern, 첫 번째)', async () => useSpot('edmund', { budget: 3600 }));
    await shot('first15_09_table');
    await beat('종 조각을 보인다 → 발크레인 매듭 (talk edmund.tavern, 두 번째)', async () => useSpot('edmund', { budget: 600 }));
    await beat('대장간의 하드윈 1세: 열쇠를 맡긴다 (talk hadwin1.smithy, 은 열쇠를 고른다)', async () => useSpot('hadwin1', { budget: 3600 }));
    await shot('first15_10_entrust');
    await beat('그 밤의 큰 종 앞으로', async () => { const b = (await def('eshville_past')).interact.find((q) => q.event === 'bell.ring'); const w = await walk(b.x, b.z, { r: 60, budget: 4200 }); await settle(); return w; });
    await shot('first15_11_bell_past');
    await beat('종을 길게 울린다 → 첫 건넘 (백 년이 흐른다) → 달라진 오늘 밤', async () => {
      let rang = null; for (let i = 0; i < 4; i++) { rang = await page.evaluate(() => window.__st.bell(240)); if (rang.rang) break; await play(150, { bot: false }); }
      if (!rang?.rang) return { ok: false, why: 'the long ring did not start a sequence: ' + JSON.stringify(rang) };
      let s = await play(1500, { bot: false, pred: (q) => q.xing || q.go, chunk: 30 });
      if (s.xing) { await play(22, { bot: false, chunk: 22 }); await shot('first15_12_crossing'); }
      s = await play(3600, { bot: false, pred: (q) => q.ready && q.area === 'eshville_now' && !q.xing, chunk: 60 });
      await play(20, { bot: false, chunk: 20 }); await shot('first15_13_arrive');
      await settle(3000); s = await st();
      return { ok: s.area === 'eshville_now' && s.flags.includes('crossed'), why: JSON.stringify(s) }; });
    await shot('first15_14_tonight_changed');
    await beat('오늘 밤의 대장간: 손자의 서랍 (interact shop.smithy)', async () => useSpot('shop.smithy', { budget: 4200 }));
    await shot('first15_15_drawer');
    const end = await page.evaluate(() => { const sc = window.__v2.scene, s = sc.host.st.state; return { flags: Object.keys(s.flags), items: s.items, done: s.done.length, objective: sc.host.objective, chronicle: s.chronicle, worldFlags: Object.keys(sc.worldFlags), saves: sc.host.saves, warnings: sc.host.warnings.slice(0, 20), deaths: sc.sim.deaths ?? 0, exits: window.__v2.exits.map((x) => x.id + ':' + (x.locked ?? 'open')) }; });
    notes.push('end state: ' + JSON.stringify(end));
  }
} catch (e) { fail('tool error: ' + String(e?.stack ?? e)); }
await drain(null).catch(() => {});
const head = [`v2g story run — plan ${PLAN}, device ${DEV}, ${new Date().toISOString()}`, `page errors: ${errs.length}`, ...errs.slice(0, 12).map((e) => '  ' + e.slice(0, 300)), '', 'BEATS (ran = played through the pad by the bot; NOT = could not run)', ...beats.map((b) => '  ' + b), '', 'HELPED BY THE TOOL', ...(helped.length ? helped.map((h) => '  ' + h) : ['  (nothing)']), '', ...notes, '', 'WHAT THE PLAYER SAW, IN ORDER', ...SEEN];
fs.writeFileSync(`${OUT}/${PLAN}.txt`, head.join('\n') + '\n');
console.log(`\nwrote ${OUT}/${PLAN}.txt (${SEEN.length} lines); page errors ${errs.length}${errs.length ? ': ' + errs.slice(0, 4).join(' | ').slice(0, 600) : ''}; helped ${helped.length}; beats not run ${beats.filter((b) => b.startsWith('NOT')).length}`);
await browser.close(); srv.close?.();
if (errs.length) fails.push('page errors');
console.log(fails.length ? 'FAIL: ' + fails.join('; ').slice(0, 600) : 'ALL OK');
process.exit(fails.length ? 1 : 0);
