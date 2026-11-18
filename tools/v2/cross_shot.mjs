// CROSSING lane: frames of one bell crossing, taken at fixed moments of the staged template (fast-forward ticks, Fold size).
//   node tools/v2/cross_shot.mjs --out <dir> [--root <tree>] [--area eshville_now] [--bell big_bell] [--years] [--back] [--refuse] [--tier mid] [--res 1] [--device fold_open] [--post]
//   --back    first cross once (not captured), then capture the crossing back
//   --refuse  make the other night answer "nowhere to stand" (the tool replaces the free-spot search for this one crossing) and capture the refusal
// On a tree without src/v2/game/crossing.js (the commit this lane started from) the old veil is captured at the same wall times.
// Writes <out>/<nn>_<phase>_<ms>.png and <out>/frames.json.
import fs from 'node:fs';
import { argv, serve, launch, openArea, standAtBell, steps, frame } from './cross_lib.mjs';

const A = argv(), OUT = String(A.out || '/tmp/claude-0/v2/cross/shot'), AREA = String(A.area || 'eshville_now'), RES = Number(A.res ?? 1), DEV = String(A.device || 'fold_open');
fs.mkdirSync(OUT, { recursive: true });
const S = await serve(A.root ? String(A.root) : undefined), { browser, ctx, page, errs } = await launch(DEV);
const list = [];
const state = () => page.evaluate(() => { const sc = window.__v2.scene, cx = sc.cx; return { staged: !!cx, phase: cx ? cx.phase : (sc.xing ? (sc.ready ? 'veil' : 'load') : ''), t: cx ? cx.t : 0, ready: sc.ready, xing: !!sc.xing, on: !!cx?.on, fade: sc.fadeA ?? 0, area: window.__v2.area, loaded: cx ? cx.log.loaded : 0, answer: cx ? cx.pre !== undefined : true }; });
let shotN = 0;
const shot = async (label) => { const s = await state(), name = `${String(shotN++).padStart(2, '0')}_${label}.png`; await frame(page, `${OUT}/${name}`); list.push({ file: name, label, phase: s.phase, t: +(+s.t).toFixed(2), area: s.area }); console.log(`  ${name}  (${s.phase} ${(+s.t).toFixed(2)} s, ${s.area})`); };
/** tick until the staged crossing is in `phase` at time >= t (waits in real time for the twin's answer and for the load) */
async function until(phase, t, max = 900) {
  for (let i = 0; i < max; i++) {
    const s = await state();
    if (s.phase === phase && s.t >= t - 1e-4) return s;
    const order = ['gather', 'ring', 'dull', 'passage', 'reveal', 'glow', ''];
    if (order.indexOf(s.phase) > order.indexOf(phase) && !(phase === 'glow' && s.phase === '')) return s;   // already past it
    if (s.phase === 'gather' && !s.answer) { await page.waitForTimeout(40); await steps(page, 1); continue; }
    if (s.phase === 'passage' && phase !== 'passage' && !s.loaded) { await page.waitForTimeout(80); continue; }   // the load runs in real time: do not let the passage's clock run away
    if (s.phase === 'passage' && phase !== 'passage') { await steps(page, 1); await page.waitForTimeout(30); continue; }
    await steps(page, 1);
  }
  return state();
}
try {
  await openArea(page, S.port, AREA, `${RES < 1 ? '&v2res=' + RES : ''}${A.tier ? '&v2tier=' + A.tier : ''}${A.post ? '&v2post=1' : ''}`);
  const at = await standAtBell(page, A.bell ? String(A.bell) : null);
  console.log(`  ${AREA}: hero ${at ? 'in front of the bell at ' + at : 'at the spawn (no bell here)'}; ${JSON.stringify(await page.evaluate(() => ({ canvas: window.__v2.stats.gl.canvas, tier: window.__v2.stats.fx?.tier, post: window.__v2.stats.fx?.post, staged: !!window.__v2.scene.cx })))}`);
  const staged = (await state()).staged;
  const crossNow = (o) => page.evaluate((opts) => window.__v2.scene.cross(opts), o);
  const waitDone = async () => { for (let i = 0; i < 400; i++) { const s = await state(); if (s.ready && !s.xing && !s.on && s.fade <= 0.01) return; if (!s.ready) await page.waitForTimeout(100); await steps(page, 6); } };
  if (A.back) { await crossNow(null); await waitDone(); await standAtBell(page, A.bell ? String(A.bell) : null); await steps(page, 30); }
  if (A.refuse) await page.evaluate(() => { const sc = window.__v2.scene; if (sc.cx) { const b = sc.cx._build; sc.cx._build = async function () { await this._yield(); sc.cx._build = b; return { pre: null, spot: null }; }; } });
  await steps(page, 20);
  await shot('before');
  const ok = await crossNow(A.years ? { years: true } : null);
  if (!ok) throw new Error('cross() refused at once');
  if (staged) {
    if (A.refuse) {
      await until('gather', 0.06); await shot('gather'); await until('dull', 0.06); await shot('dull_a'); await until('dull', 0.2); await shot('dull_b'); await until('dull', 0.38); await shot('dull_c');
      await waitDone(); await steps(page, 12); await shot('after_refusal');
    } else {
      await until('gather', 0.07); await shot('gather');
      for (const t of [0.1, 0.22, 0.32, 0.42]) { await until('ring', t); await shot('ring'); }
      const P = A.years ? [0.08, 0.6, 1.2, 1.8, 2.4, 2.92] : [0.08, 0.45, 0.8, 1.15];
      for (const t of P) { await until('passage', t); await shot('passage'); }
      for (const t of [0.12, 0.28, 0.44, 0.6, 0.76, 0.86]) { await until("reveal", t); await shot("reveal"); }
      await until('glow', 0.1); await shot('land'); await until('glow', 0.4); await shot('glow'); await waitDone(); await steps(page, 50); await shot('after');
    }
  } else {
    // the old veil: 0.7 s up, the load behind one flat colour, 1.1 s thinning
    for (const n of [6, 12, 12, 10]) { await steps(page, n); await shot('veil_up'); }
    await steps(page, 6); await shot('flat'); await page.waitForTimeout(500); await steps(page, 1); await shot('flat');
    for (let i = 0; i < 200; i++) { const s = await state(); if (s.ready) break; await page.waitForTimeout(100); await steps(page, 1); }
    for (const n of [4, 14, 20, 30]) { await steps(page, n); await shot('veil_down'); }
    await waitDone(); await steps(page, 50); await shot('after');
  }
  fs.writeFileSync(`${OUT}/frames.json`, JSON.stringify({ area: AREA, years: !!A.years, back: !!A.back, refuse: !!A.refuse, staged, tier: A.tier ?? 'mid', res: RES, frames: list, errs }, null, 1));
} catch (e) { errs.push('tool error: ' + String(e?.stack ?? e)); console.log(String(e?.stack ?? e)); }
console.log(`  page errors: ${errs.length}`); for (const e of errs.slice(0, 8)) console.log('    ' + e);
await ctx.close(); await browser.close(); S.close();
process.exit(errs.length ? 1 : 0);
