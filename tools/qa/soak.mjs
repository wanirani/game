// Soak test — MASTER_PLAN §5.2 "soak": 10-minute scripted soak (stage ↔ hub ↔ menu loops): JS heap and live canvas count
// stable (±10 %), zero errors.
//
//   node tools/qa/soak.mjs [--minutes 10] [--vp desk|phone1] [--quality high|medium|low]
//
// One page, game loop frozen and stepped by hand (lib/step.mjs) so a loaded machine still runs whole cycles. Each cycle:
// a stage room (a lap of 8 rooms from s01 to s20, r1 and boss rooms) with 600 frames of scripted combat → hub (300 frames,
// walking, mount + 2 guardians) → menu (every tab, 30 frames each) → back. After every cycle (gc forced) the tool samples
// the JS heap, live canvases (count and bytes, WeakRef), DOM nodes, decoded image bytes (assets.stats) and world entities.
// Stability: the peak of the last lap must stay within +10 % of the peak of the first lap (same rooms; lap 1 fills the
// caches) for the heap, the live canvas count/bytes and the DOM; decoded images must stay within the LRU budget.
// Every page/console error fails. 10 minutes ≈ 3–4 laps on the loaded CI box.
// Report: /tmp/claude-0/qa/tools/soak.json (+ .md). Exit 1 on a red check.
import { openEnv } from './lib/server.mjs';
import { freeze, step, settle } from './lib/step.mjs';
import { perfProbeInit } from './lib/perfprobe.mjs';
import { Checks, writeReport, parseFlags } from './lib/report.mjs';
import { ownerOf } from './lib/owners.mjs';

const args = parseFlags();
const MINUTES = Number(args.minutes) || 10;
const VP = args.vp || 'desk';
const QUALITY = args.quality || (VP.startsWith('phone') ? 'medium' : 'high');
const C = new Checks(false);
const findings = [];
// one lap = 8 rooms spread over the game; stability compares the last lap with the first one (same rooms, so stage-sized
// caches such as backgrounds and painted atlases are like for like)
const LAP = [['s01', 'r1'], ['s03', 'boss'], ['s05', 'r1'], ['s08', 'boss'], ['s11', 'r1'], ['s14', 'boss'], ['s17', 'r1'], ['s20', 'boss']];
const MB = (b) => +(b / 1048576).toFixed(2);

const COMBAT = (i) => `(() => { const g = window.__game, w = g.world, p = w?.player; const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c, key: c, bubbles: true }));
  for (let i = 0; i < ${i}; i++) {
    if (i % 14 === 0) key('KeyX', true); if (i % 14 === 4) key('KeyX', false);
    if (i % 120 === 0) key('ArrowRight', true); if (i % 120 === 70) { key('ArrowRight', false); key('ArrowLeft', true); } if (i % 120 === 110) key('ArrowLeft', false);
    if (i % 90 === 45) { key('KeyZ', true); } if (i % 90 === 50) key('KeyZ', false);
    const q = g.world?.player; if (q) { q.buffs.invincible = 9999; q.hp = Math.max(q.hp, 1); }
    window.__qaStep(1, i % 3 === 0);
    for (let k = 0; k < 6 && /^(dialogue|companionJoin|story|bossIntro|document|ultCutin|awakenCutin|gameover|results)$/.test(g.top?.name ?? ''); k++) { if (g.top?.name === 'ultCutin' || g.top?.name === 'awakenCutin') break; g.pop(); }
  }
  for (const c of ['KeyX', 'ArrowRight', 'ArrowLeft', 'KeyZ']) key(c, false);
  return g.top?.name; })()`;

const env = await openEnv({ browserArgs: ['--js-flags=--expose-gc'] });
const samples = [];
const t0 = Date.now();
let s;
try {
  s = await env.page(VP, 'index.html?scene=stage&stage=s01&room=r1&mount=mt_warhorse&guards=gd_fairy,gd_imp&ch=8', { settings: { quality: QUALITY }, initScripts: [perfProbeInit()] });
  await s.waitGame('!!g.world?.player');
  await freeze(s.page);
  await settle(s.page, 60);
  let cycle = 0;
  while (Date.now() - t0 < MINUTES * 60000) {
    cycle++;
    const [st, room] = LAP[(cycle - 1) % LAP.length];
    // stage
    await s.eval(({ st, room }) => window.__game.go('stage', { stageId: st, roomId: room }, { fade: false }), { st, room });
    for (let k = 0; k < 40; k++) { const ok = await s.eval((st) => { const w = window.__game.world; return !!(w?.player && (w.stageId ?? w.def?.id) === st); }, st).catch(() => false); if (ok) break; await step(s.page, 2, false); await s.wait(100); }
    await settle(s.page, 30);
    await s.page.evaluate(COMBAT(600));
    // hub
    await s.eval(() => window.__game.go('hub', {}, { fade: false }));
    for (let k = 0; k < 40; k++) { const ok = await s.eval(() => window.__game.top?.name === 'hub' && !!window.__game.world?.player).catch(() => false); if (ok) break; await step(s.page, 2, false); await s.wait(100); }
    await s.page.evaluate(COMBAT(300));
    // menu: every tab
    await s.eval(async () => {
      const g = window.__game;
      const M = await import('/src/scenes/menu/menu.js');
      const tabs = (M.MENU_TABS || []).map((t) => t.id);
      g.push('menu', { world: g.world, tab: tabs[0] || 'status' });
      for (const t of tabs) { const m = g.top; if (m?.name !== 'menu') break; const i = tabs.indexOf(t); if (typeof m.switchTab === 'function') m.switchTab(0, i); else m.ti = i; window.__qaStep(30, true); }
      for (let i = 0; i < 4 && g.top?.name === 'menu'; i++) g.pop();
    });
    await settle(s.page, 10);
    const m = await s.eval(() => {
      try { window.gc?.(); } catch { /* */ }
      const g = window.__game, st = g.assets?.stats?.();
      const live = window.__perf.live();
      return { heap: performance.memory?.usedJSHeapSize ?? 0, canv: live.n, canvBytes: live.bytes, dom: document.getElementsByTagName('*').length, tex: st?.total ?? 0, texBudget: st?.budget ?? 0, painted: st?.painted ?? 0, ents: g.world?.entities?.length ?? 0, scenes: g.scenes.length, top: g.top?.name };
    });
    samples.push({ cycle, stage: st, room, t: Math.round((Date.now() - t0) / 1000), ...m, errs: s.errs.length });
    console.log(`cycle ${cycle} ${st}/${room} t=${Math.round((Date.now() - t0) / 1000)}s heap ${MB(m.heap)} MB, canvases ${m.canv} (${MB(m.canvBytes)} MB), dom ${m.dom}, decoded ${MB(m.tex)} MB, scenes ${m.scenes}, errors ${s.errs.length}`);
  }
} catch (e) {
  C.add('harness', 'error', String(e?.message || e).split('\n')[0]);
} finally {
  const errs = s ? [...new Set(s.errs)] : [];
  C.add('errors', errs.length ? 'fail' : 'pass', errs.length ? `${errs.length} page/console error(s): ${errs.slice(0, 3).join(' || ')}` : 'no page/console errors');
  if (errs.length) findings.push({ id: 'soak.errors', sev: 'S2', kind: 'soak', title: 'page/console errors during the soak', detail: errs.slice(0, 5).join(' || '), file: 'src/game/world.js', ...ownerOf('src/game/world.js') });
  await env.close();
}

if (samples.length >= LAP.length + 2) {
  // first lap fills the caches (baseline = its maximum); the last LAP.length cycles are the same rooms again
  const first = samples.slice(0, LAP.length);
  const tail = samples.slice(-LAP.length);
  const peak = (xs, k) => Math.max(...xs.map((x) => x[k]));
  const fmt = (k, v) => (k === 'heap' || k === 'canvBytes' ? `${MB(v)} MB` : v);
  for (const [k, label, file] of [['heap', 'JS heap', 'src/game/world.js'], ['canv', 'live canvases', 'src/render/painted/kit.js'], ['canvBytes', 'live canvas bytes', 'src/render/painted/kit.js'], ['dom', 'DOM nodes', 'src/core/game.js']]) {
    const b = peak(first, k), t = peak(tail, k);
    const gr = b ? (t - b) / b : 0;
    const ok = gr <= 0.1;
    C.add(`stable.${k}`, ok ? 'pass' : 'fail', `${label}: peak of lap 1 ${fmt(k, b)} → peak of the last ${LAP.length} cycles ${fmt(k, t)} (${(gr * 100).toFixed(1)} %, limit +10 %)`);
    if (!ok) findings.push({ id: `soak.${k}`, sev: 'S3', kind: 'soak', title: `${label} grow ${(gr * 100).toFixed(0)} % over a ${MINUTES}-minute soak (stage ↔ hub ↔ menu)`, detail: samples.map((x) => `${x.cycle}:${k === 'heap' || k === 'canvBytes' ? MB(x[k]) : x[k]}`).join(' '), file, ...ownerOf(file), repro: `node tools/qa/soak.mjs --minutes ${MINUTES} --vp ${VP}` });
  }
  const over = samples.filter((x) => x.texBudget && x.tex > x.texBudget);
  C.add('stable.textures', over.length ? 'fail' : 'pass', over.length ? `decoded images over the LRU budget in ${over.length} cycle(s): ${over.map((x) => `${x.cycle}:${MB(x.tex)}/${MB(x.texBudget)} MB`).join(', ')}` : `decoded images ≤ budget in every cycle (max ${MB(Math.max(...samples.map((x) => x.tex)))} MB)`);
  const stack = samples.filter((x) => x.scenes > 2);
  C.add('stable.scenes', stack.length ? 'fail' : 'pass', stack.length ? `scene stack grew: ${stack.map((x) => `${x.cycle}:${x.scenes}`).join(', ')}` : 'scene stack back to the base after every cycle');
} else C.add('cycles', samples.length ? 'warn' : 'fail', `only ${samples.length} cycle(s) in ${MINUTES} min (need ≥ ${LAP.length + 2}, i.e. more than one lap of ${LAP.length} rooms, for the stability checks)`);

const c = C.counts();
const md = `\n## Samples\n\n| cycle | stage | t (s) | heap MB | canvases | canvas MB | DOM | decoded MB | entities | errors |\n|---|---|---|---|---|---|---|---|---|---|\n${samples.map((x) => `| ${x.cycle} | ${x.stage}/${x.room} | ${x.t} | ${MB(x.heap)} | ${x.canv} | ${MB(x.canvBytes)} | ${x.dom} | ${MB(x.tex)} | ${x.ents} | ${x.errs} |`).join('\n')}\n`;
const out = writeReport('soak', { tool: 'soak', when: new Date().toISOString(), minutes: MINUTES, vp: VP, quality: QUALITY, counts: c, checks: C.list, samples, findings }, { title: `Soak (${MINUTES} min, ${VP})`, findings, extraMd: md });
console.log(`\nsoak: ${samples.length} cycles, ${c.pass} pass, ${c.warn} warn, ${c.fail} fail, ${c.error} error — ${out.json}`);
process.exit(C.red.length ? 1 : 0);
