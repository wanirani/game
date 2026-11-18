// CROSS-VERIFY lane: adversarial checks of the staged bell crossing (src/v2/game/crossing.js). One headless browser, fast-forward ticks.
//   node tools/v2/cross_verify.mjs --mode look  [--device fold_open] [--res 1] [--out dir] [--cases a,b]   a sample + picture every 0.1 s of game time
//   node tools/v2/cross_verify.mjs --mode break [--res 0.5] [--n 40] [--seed 7]                                 random situations, second presses, lost context, leaving
//   node tools/v2/cross_verify.mjs --mode cost  [--res 1] [--tier low] [--n 30]                                 GPU bytes per night, heap per crossing
// look: every step = 6 ticks of 1/60 s, one drawn frame; the GL canvas and the HUD layer are read back small (64 x 48) in the same task:
//   std = spread of brightness over the picture (0 = one flat colour), diff = mean change against the step before (0 = the picture stood still),
//   hud = how much of the HUD layer is painted, pad = the largest opacity of a pad canvas (the DOM controls).
import fs from 'node:fs';
import { argv, serve, launch, openArea, standAtBell, steps } from './cross_lib.mjs';

const A = argv(), MODE = String(A.mode || 'look'), DEV = String(A.device || 'fold_open'), RES = Number(A.res ?? (MODE === 'break' ? 0.5 : 1)), OUT = String(A.out || '/tmp/claude-0/v2/crossverify'), TIER = A.tier ? String(A.tier) : '';
const N = Number(A.n ?? (MODE === 'cost' ? 30 : 40)), SEED = Number(A.seed ?? 7), CASES = A.cases ? String(A.cases).split(',') : null;
const Q = `${RES < 1 ? '&v2res=' + RES : ''}${TIER ? '&v2tier=' + TIER : ''}`;
fs.mkdirSync(OUT, { recursive: true });
const S = await serve(), { browser, page, errs } = await launch(DEV);
const lines = [], fails = [];
const LIVE = `${OUT}/${MODE}_${DEV}${TIER ? '_' + TIER : ''}_live.txt`;
const say = (m) => { lines.push(m); console.log(m); try { fs.appendFileSync(LIVE, m + '\n'); } catch { /* log */ } }, fail = (m) => { fails.push(m); say('FAIL ' + m); }, ok = (m) => say('ok   ' + m);
let rs = SEED >>> 0; const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; }, ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const st = () => page.evaluate(() => {
  const v = window.__v2, sc = v?.scene, cx = sc?.cx, h = sc?.sim?.hero;
  return sc ? { area: v.area, ready: !!sc.ready, xing: !!sc.xing, go: !!sc._go, locked: !!sc.locked, phase: cx?.phase ?? '', on: !!cx?.on, t: cx?.t ?? 0, bytes: cx?.bytes ?? 0, cross: sc.state.cross ? 1 : 0,
    lost: !!sc.glr?.lost, loaded: cx?.log.loaded ?? 0, answer: cx ? cx.pre !== undefined : true, fade: sc.fadeA ?? 0, hp: Math.round(h?.hp ?? 0), dead: !!h?.dead, modal: sc.hud?.modal ?? null,
    x: Math.round(h?.x ?? 0), y: Math.round(h?.y ?? 0), z: Math.round(h?.z ?? 0), ground: !!h?.onGround, ts: sc._ts ?? 1, err: v.error ?? null } : null;
});
const waits = (s) => (s.phase === 'gather' && !s.answer) || (s.phase === 'passage' && !s.loaded) || (!s.ready && !s.on);
async function until(pred, max = 1500) { let s = null; for (let i = 0; i < max; i++) { s = await st(); if (!s || pred(s)) return s; if (waits(s)) await page.waitForTimeout(60); await steps(page, 2); } return s; }
const done = (s) => s.ready && !s.xing && !s.on && !s.go && s.fade <= 0.01;
const cross = (o) => page.evaluate((opts) => window.__v2.scene.cross(opts ?? null), o ?? null);
/** is the hero inside something solid / stuck? what a crossing must leave clean */
const after = () => page.evaluate(() => {
  const v = window.__v2, sc = v.scene, h = sc.sim.hero, cx = sc.cx; let hit = null;
  for (const q of sc.W.boxes) if (q.solid && !q.walk && h.x > q.x0 + 2 && h.x < q.x1 - 2 && h.z > q.z0 + 2 && h.z < q.z1 - 2 && h.y + 50 > q.y0 && h.y + 10 < q.y1) hit = [q.x0, q.x1, q.z0, q.z1, q.y0, q.y1].map(Math.round);
  let pad = null; try { pad = sc.hud.metrics?.().pad?.back ?? null; } catch { /* old pad */ }
  const s = v.stats;
  return { area: v.area, hit, ground: !!h.onGround, y: Math.round(h.y), dead: !!h.dead, hp: Math.round(h.hp), locked: !!sc.locked, xing: !!sc.xing, on: cx.on, phase: cx.phase, cross: sc.state.cross ? 1 : 0, pad, modal: sc.hud.modal ?? null,
    fade: +sc.fadeA.toFixed(2), ts: sc._ts ?? 1, bytes: cx.bytes, copies: [cx.texA, cx.texB, cx.depth, cx.texF, cx.texL, cx.fboA, cx.fboB, cx.fboF].filter(Boolean).length, hold: !!cx._holdRes, loop: cx.loopId, yq: cx._yq.length,
    tex: s.gl.texBytes, buf: s.gl.bufBytes, canvases: document.querySelectorAll('canvas').length, lost: !!sc.glr.lost };
});
const clean = (a) => !a.hit && a.ground && !a.dead && !a.locked && !a.xing && !a.on && !a.cross && a.pad !== true && !a.modal && a.fade < 0.05 && a.bytes === 0 && a.copies === 0 && !a.hold && !a.loop && a.yq === 0 && !a.lost && Math.abs(a.ts - 1) < 0.01;
const install = () => page.evaluate(() => {
  const mk = () => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; return c.getContext('2d', { willReadFrequently: true }); };
  const a = mk(), b = mk(); let prev = null;
  window.__cv = { sample(k) {
    const g = window.__game, sc = window.__v2.scene, cx = sc.cx; for (let i = 0; i < k; i++) g.tick(1 / 60); g.alpha = 1; g.render();
    a.globalCompositeOperation = 'copy'; a.drawImage(sc.glr.canvas, 0, 0, 64, 48); const d = a.getImageData(0, 0, 64, 48).data, n = 64 * 48;
    let r = 0, gg = 0, bl = 0, s1 = 0, s2 = 0, al = 0, df = 0;
    for (let i = 0; i < n * 4; i += 4) { r += d[i]; gg += d[i + 1]; bl += d[i + 2]; al += d[i + 3]; const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; s1 += l; s2 += l * l; if (prev) df += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); }
    const had = !!prev; prev = d;
    let hud = 0, hudLow = 0; const hc = sc.layer?.hud;
    if (hc && hc.width > 4) { b.globalCompositeOperation = 'copy'; b.drawImage(hc, 0, 0, 64, 48); const e = b.getImageData(0, 0, 64, 48).data; for (let i = 0; i < n; i++) { const v = e[i * 4 + 3] > 24 ? 1 : 0; hud += v; if (i >= 64 * 24) hudLow += v; } }
    let pad = 0; for (const c of document.querySelectorAll('canvas')) { if (c === sc.glr.canvas || c === hc || c === g.canvas) continue; const o = Number(getComputedStyle(c).opacity); if (c.getBoundingClientRect().width > 8 && getComputedStyle(c).display !== 'none' && o > pad) pad = o; }
    const m = s1 / n, X = sc.state.cross;
    return { ph: cx.phase || (sc.ready ? '-' : 'load'), t: +cx.t.toFixed(2), rgb: [Math.round(r / n), Math.round(gg / n), Math.round(bl / n)], a: Math.round(al / n), std: +Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(1), diff: had ? +(df / (n * 3)).toFixed(2) : -1,
      hud: +(hud / n).toFixed(3), hudLow: +(hudLow / (n / 2)).toFixed(3), pad: +pad.toFixed(2), k: X ? +X.k.toFixed(2) : -1, back: X ? !!X.back : false, turn: X ? +X.turn.toFixed(2) : -1, year: X ? X.year : 0, ready: !!sc.ready, locked: !!sc.locked, mode: cx.mode, R: Math.round(cx.R) };
  } };
});

try {
  // ───────────────────────── look ─────────────────────────
  if (MODE === 'look') {
    const all = [
      { id: 'esh_to_past', area: 'eshville_now', bell: 'big_bell' },
      { id: 'esh_to_now', cont: true },
      { id: 'esh_years', cont: true, opts: { years: true } },              // (that night -> the long form towards 1697)
      { id: 'esh_refuse', cont: true, refuse: true },
      { id: 'esh_slow', cont: true, slow: 4.6 },                            // a slow device: the load lasts 4.6 s of the passage
      { id: 'grave_to_past', area: 'graveyard_now' },
      { id: 'grave_to_now', cont: true },
      { id: 'oss_to_past', area: 'ossuary_now' },
      { id: 'oss_to_now', cont: true },
    ].filter((c) => !CASES || CASES.includes(c.id) || (c.area && CASES.some((k) => k.startsWith(c.id.split('_')[0]))));
    const sum = [];
    for (const c of all) {
      if (c.area) { await openArea(page, S.port, c.area, Q); await install(); }
      const at = await standAtBell(page, c.bell); await steps(page, 30);
      if (CASES && !CASES.includes(c.id)) { if (c.area) { await cross(); await until(done); await steps(page, 30); } continue; }
      const dir = `${OUT}/${DEV}_${c.id}`; fs.mkdirSync(dir, { recursive: true });
      if (c.refuse) await page.evaluate(() => { const sc = window.__v2.scene, b = sc.cx._build; sc.cx.early = null; sc.cx._build = async function () { await this._yield(); sc.cx._build = b; return { pre: null, spot: null }; }; });
      if (c.slow) await page.evaluate((T) => { const cx = window.__v2.scene.cx, h = cx.hold; cx.hold = function () { cx.hold = h; return new Promise((res) => { const w = () => { if (cx.t >= T || !cx.on) res(h.call(cx)); else setTimeout(w, 30); }; w(); }); }; }, c.slow);
      const a0 = (await st()).area, rows = [], e0 = errs.length;
      rows.push({ i: -1, ...(await page.evaluate(() => window.__cv.sample(0))) }); await page.screenshot({ path: `${dir}/f00_before.jpg`, type: 'jpeg', quality: 72, scale: 'css' });
      const r = await cross(c.opts); let endN = 0;
      for (let i = 0; i < 150; i++) {
        let s = await st(); if (!s) break;
        for (let w = 0; w < 200 && s.phase === 'gather' && !s.answer; w++) { await page.waitForTimeout(40); s = await st(); }
        if (s.phase === 'passage' && !s.loaded && !c.slow) await page.waitForTimeout(120);   // (the load runs in real time; the tool's steps are slower than the game's)
        const row = await page.evaluate(() => window.__cv.sample(6)); row.i = i; rows.push(row);
        if (i % 2 === 0 || row.ph === 'ring' || row.ph === 'dull') await page.screenshot({ path: `${dir}/f${String(i + 1).padStart(2, '0')}_${row.ph}_${row.t}.jpg`, type: 'jpeg', quality: 72, scale: 'css' });
        if (c.id === 'esh_to_past' && (row.ph === 'ring' && row.t >= 0.3 && !rows.big1 || row.ph === 'reveal' && row.t >= 0.4 && !rows.big2)) { if (row.ph === 'ring') rows.big1 = 1; else rows.big2 = 1; await page.screenshot({ path: `${dir}/full_${row.ph}.png` }); }
        s = await st(); if (done(s)) { if (++endN >= 3) break; }
      }
      const s = await st(), drawn = rows.filter((q) => q.i >= 0 && q.ph !== '-' );
      const flat = drawn.filter((q) => q.std < 2.5), still = []; let run = 0;
      for (const q of drawn) { if (q.diff >= 0 && q.diff < 0.12) { run++; if (run === 2) still.push(q.i); } else run = 0; }
      const padOn = drawn.filter((q) => q.back && q.pad > 0.05 && q.ph !== 'gather'), hudOn = drawn.filter((q) => (q.ph === 'passage' || q.ph === 'reveal') && q.hudLow > 0.004);
      const ph = {}; for (const q of drawn) ph[q.ph] = (ph[q.ph] ?? 0) + 1;
      const line = `${DEV} ${c.id}: bell ${JSON.stringify(at)} cross() ${r}; ${a0} -> ${s?.area}; steps per phase ${JSON.stringify(ph)}; flat-colour frames ${flat.length}${flat.length ? ' at ' + flat.map((q) => q.i + ':' + q.ph + '@' + q.t + ' std ' + q.std + ' a ' + q.a).slice(0, 6).join(', ') : ''}; still >= 0.2 s at steps [${still.slice(0, 8)}]; pad visible while stepped back ${padOn.length} (${padOn.slice(0, 4).map((q) => q.i + ':' + q.ph + ' ' + q.pad)}); HUD paint in the lower half during passage/reveal ${hudOn.length}; min diff in passage ${Math.min(...drawn.filter((q) => q.ph === 'passage' && q.diff >= 0).map((q) => q.diff), 99)}; page errors ${errs.length - e0}`;
      say(line); sum.push({ id: c.id, rows }); fs.writeFileSync(`${dir}/rows.json`, JSON.stringify(rows));
      fs.writeFileSync(`${dir}/rows.txt`, rows.map((q) => `${String(q.i).padStart(3)} ${q.ph.padEnd(8)} t ${String(q.t).padEnd(5)} rgb ${q.rgb.join(',').padEnd(12)} a ${q.a} std ${String(q.std).padEnd(5)} diff ${String(q.diff).padEnd(6)} hud ${q.hud}/${q.hudLow} pad ${q.pad} k ${q.k} back ${q.back} turn ${q.turn} year ${q.year} mode ${q.mode} R ${q.R} ready ${q.ready} locked ${q.locked}`).join('\n'));
      if (!c.refuse && s?.area === a0) fail(`${c.id}: did not arrive (${JSON.stringify(s)})`);
      if (c.refuse && s?.area !== a0) fail(`${c.id}: a refused crossing changed the area`);
      await steps(page, 40);
    }
  }
  // ───────────────────────── break ─────────────────────────
  if (MODE === 'break') {
    const open = async (area = 'eshville_now') => { await openArea(page, S.port, area, Q); await standAtBell(page); await steps(page, 20); };
    await open();
    const pads = await page.evaluate(() => { const sc = window.__v2.scene, g = window.__game, hc = sc.layer?.hud, L = []; for (const c of document.querySelectorAll('canvas')) { if (c === sc.glr.canvas || c === hc || c === g.canvas) continue; const r = c.getBoundingClientRect(); if (r.width > 20) L.push([Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2), Math.round(r.width)]); } return { L, w: innerWidth, h: innerHeight }; });
    const right = pads.L.filter((p) => p[0] > pads.w * 0.55).sort((a, b) => b[2] - a[2]);
    say(`info pad canvases ${pads.L.length}, right-hand buttons ${JSON.stringify(right.slice(0, 6))}`);
    const tap = async (i) => { const p = right[i % Math.max(1, right.length)]; if (p) await page.touchscreen.tap(p[0], p[1]); };
    const mem = new Map(), PART = String(A.part || 'cross,lost,leave').split(','); let nOk = 0, nBad = 0;
    const KINDS = ['plain', 'attack', 'hurt', 'air', 'roll', 'fall', 'again_gather', 'again_ring', 'again_passage', 'again_reveal', 'again_glow', 'tap_ring', 'tap_passage', 'tap_reveal', 'pause', 'dialog', 'jar', 'enemy', 'years', 'esc_ring', 'esc_reveal', 'move_ring'];
    for (let i = 0; i < (PART.includes('cross') ? N : 0); i++) {
      const kind = KINDS[i % KINDS.length], e0 = errs.length; let note = '';
      let s0 = await st();
      if (!s0 || !s0.ready || s0.dead || !done(s0)) { say(`info state before crossing ${i + 1} not clean (${JSON.stringify(s0)}): the page is opened again`); await open(i % 3 === 2 ? 'graveyard_now' : 'eshville_now'); s0 = await st(); }
      if (i === 14 || i === 28) { await open(i === 14 ? 'graveyard_now' : 'ossuary_now'); s0 = await st(); }
      await standAtBell(page); await steps(page, ri(2, 30));
      const a0 = s0.area; let expect = true;
      // the situation
      if (kind === 'attack') { await tap(0); await steps(page, ri(1, 16)); }
      if (kind === 'hurt') { note = await page.evaluate(() => { const sc = window.__v2.scene; try { return 'hurt ' + sc.sim.hurtHero(1, 1, 0); } catch (e) { return 'hurt failed ' + e.message; } }); await steps(page, ri(0, 12)); }
      if (kind === 'air') { await page.evaluate(() => { const h = window.__v2.scene.sim.hero; h.vy = 520; h.onGround = false; h.y += 4; }); await steps(page, ri(2, 22)); }
      if (kind === 'roll') { await page.evaluate(() => { window.__v2.scene.inp.dash = true; }); await steps(page, ri(1, 14)); }
      if (kind === 'fall') { await page.evaluate(() => { const h = window.__v2.scene.sim.hero; h.y += 420; h.onGround = false; h.vy = -60; }); await steps(page, ri(1, 10)); }
      if (kind === 'pause') { await page.evaluate(() => window.__v2.scene._pause()); await steps(page, 6); expect = false; }
      if (kind === 'dialog') { note = await page.evaluate(() => { const sc = window.__v2.scene; try { sc._say({ name: '시험', text: '종 앞에서.', lines: ['종 앞에서.'] }); } catch (e) { return 'say failed ' + e.message; } return 'dialog'; }); await steps(page, 6); const m = (await st()).modal; note += ' modal ' + m; expect = m !== 'dialog' ? true : false; }
      if (kind === 'jar') { note = await page.evaluate(async () => { const sc = window.__v2.scene, sim = sc.sim, m = await import('/src/v2/play/breakables.js'), h = sim.hero; const L = (sim.breakables ?? []).filter((q) => !q.broken).sort((p, q) => Math.hypot(p.x - h.x, p.z - h.z) - Math.hypot(q.x - h.x, q.z - h.z)); if (!L[0]) return 'no jar'; m.breakOne(sim, L[0], 'hero', 1, 0); return 'jar ' + L[0].id + ' broken, ' + Math.round(Math.hypot(L[0].x - h.x, L[0].z - h.z)) + ' away'; }); await steps(page, ri(0, 8)); }
      if (kind === 'enemy') { note = await page.evaluate(() => { const sc = window.__v2.scene, sim = sc.sim, h = sim.hero, e = sim.enemies.find((q) => !q.dead && q.state !== 'dead'); if (!e) return 'no enemy'; e.x = h.x + 150; e.z = h.z + 20; if (e.homeX !== undefined) { /* stays its own */ } e.active = true; return 'enemy ' + e.kind + ' put next to the hero'; }); for (let k = 0; k < 40; k++) { await steps(page, 6); if (await page.evaluate(() => window.__v2.scene.shotN > 0)) { note += ', a shot in flight'; break; } } }
      if (kind === 'move_ring') { await page.evaluate(() => { const h = window.__v2.scene.sim.hero; h.vx = 380; h.vz = 120; }); }
      const hp0 = (await st()).hp;
      const r = await cross(kind === 'years' ? { years: true } : null);
      if (r !== expect) { fail(`#${i + 1} ${kind}: cross() -> ${r}, expected ${expect} (${note})`); }
      if (kind === 'pause' || (kind === 'dialog' && !expect)) {   // close what was open, then the crossing must work
        const m = await page.evaluate(() => { const sc = window.__v2.scene, hd = sc.hud; try { if (hd.modal === 'pause') (hd.closePause ?? hd.close)?.call(hd); else { sc.ui.dialog = null; (hd.hideDialog ?? hd.closeDialog ?? hd.showDialog)?.call(hd, null); } } catch (e) { return 'close failed ' + e.message; } return hd.modal ?? null; });
        await steps(page, 20); const s = await st(); note += ` closed -> modal ${s.modal} (${m})`;
        if (s.modal) { say(`info #${i + 1} ${kind}: could not close the ${s.modal} by script (${note}): page opened again`); await open(); continue; }
        const r2 = await cross(); if (!r2) fail(`#${i + 1} ${kind}: after closing, cross() -> ${r2}`);
      }
      // while it runs
      const ph = kind.startsWith('again_') || kind.startsWith('tap_') || kind.startsWith('esc_') ? kind.split('_')[1] : null;
      if (ph) {
        const tt = ph === 'gather' ? 0 : ph === 'ring' ? rnd() * 0.4 : ph === 'passage' ? rnd() * 1.0 : ph === 'reveal' ? rnd() * 0.8 : rnd() * 0.9;
        const s = await until((q) => q.phase === ph && q.t >= tt, 2500);
        if (!s || s.phase !== ph) note += ` (phase ${ph} not caught: ${s?.phase})`;
        else if (kind.startsWith('again_')) {
          const r2 = await cross(), r3 = await page.evaluate(() => { const sc = window.__v2.scene; try { sc._ringLong(null); } catch (e) { return 'ringLong threw ' + e.message; } return 'ringLong'; });
          note += ` second cross() in ${ph}@${s.t.toFixed(2)} -> ${r2}, ${r3}`;
          if (ph !== 'glow' && r2) fail(`#${i + 1} ${kind}: a second cross() was accepted in the ${ph}`);
        } else if (kind.startsWith('tap_')) { const b = await page.evaluate(() => { const h = window.__v2.scene.sim?.hero; return h ? [h.act ?? null, Math.round(h.x), Math.round(h.z)] : null; }); for (let k = 0; k < 4; k++) { await tap(k); await steps(page, 2); } const c = await page.evaluate(() => { const h = window.__v2.scene.sim?.hero; return h ? [h.act ?? null, Math.round(h.x), Math.round(h.z)] : null; }); note += ` taps in ${ph}@${s.t.toFixed(2)}: hero ${JSON.stringify(b)} -> ${JSON.stringify(c)}`; if (b && c && b[0] !== c[0] && c[0]) fail(`#${i + 1} ${kind}: a tap on the pad made the hero act (${c[0]}) in the ${ph}`); }
        else { await page.keyboard.press('Escape'); await steps(page, 4); const m = (await st())?.modal; note += ` ESC in ${ph}@${s.t.toFixed(2)} -> modal ${m}`; if (m) fail(`#${i + 1} ${kind}: ESC opened ${m} in the ${ph}`); }
      }
      const s = await until(done, 3000); await steps(page, 90);
      if (!s || !done(s)) { nBad++; fail(`#${i + 1} ${kind}: STUCK ${JSON.stringify(await st())} (${note})`); await open(); continue; }
      const a = await after(), again = kind === 'again_glow';
      const want = again ? null : a0.endsWith('_now') ? a0.replace('_now', '_past') : a0.replace('_past', '_now');
      const key = a.area, m0 = mem.get(key); if (kind !== 'jar' && kind !== 'enemy') { if (!m0) mem.set(key, { tex: a.tex, buf: a.buf, n: 1, var: [] }); else { m0.n++; if (m0.tex !== a.tex || m0.buf !== a.buf) m0.var.push(`#${i + 1} tex ${a.tex} buf ${a.buf}`); } }
      const line = `#${i + 1} ${kind}: ${a0} -> ${a.area}${note ? ' [' + note + ']' : ''} hp ${hp0} -> ${a.hp}, y ${a.y}, ground ${a.ground}, inside ${JSON.stringify(a.hit)}, locked ${a.locked}, crossing ${a.on}/${a.xing}/${a.cross}, pad back ${a.pad}, modal ${a.modal}, time scale ${a.ts}, copies ${a.copies} (${a.bytes} B), tex ${a.tex} buf ${a.buf}, page errors ${errs.length - e0}`;
      if (clean(a) && (want === null || a.area === want) && errs.length === e0) { nOk++; ok(line); } else { nBad++; fail(line); }
    }
    for (const [k, m] of mem) say(`info GPU bytes in ${k}: tex ${m.tex} buf ${m.buf} over ${m.n} visits${m.var.length ? '; DIFFERENT at ' + m.var.join('; ') : ' (identical every visit)'}`);
    say(`break: ${nOk} clean, ${nBad} not clean of ${N}`);
    // the WebGL context is lost at five moments
    for (const [ph, tt] of PART.includes('lost') ? (A.lost ? [['passage', 0.9], ['reveal', 0.35], ['glow', 0.2]] : [['gather', 0], ['ring', 0.25], ['passage', 0.05], ['passage', 0.9], ['reveal', 0.35], ['glow', 0.2]]) : []) {
      await open(); const e0 = errs.length; await cross(); const s1 = await until((q) => q.phase === ph && q.t >= tt, 2500);
      await page.evaluate(() => { const gl = window.__v2.scene.glr.gl; window.__lc = gl.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
      await page.waitForTimeout(150); await steps(page, 20); await page.waitForTimeout(350); await steps(page, 12);
      await page.evaluate(() => window.__lc.restoreContext()); await page.waitForTimeout(300); await steps(page, 6);
      const s = await until(done, 3000); await steps(page, 60); const a = s ? await after() : null;
      const lit = a ? await page.evaluate(() => { const sc = window.__v2.scene, gl = sc.glr.gl, px = new Uint8Array(64); sc._gl(sc.game.viewW, sc.game.viewH, 1, false); gl.readPixels((gl.drawingBufferWidth >> 1) - 2, (gl.drawingBufferHeight >> 1) - 2, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, px); let n = 0; for (let i = 0; i < 64; i += 4) n += px[i] + px[i + 1] + px[i + 2]; return n; }) : 0;
      const line = `context lost in ${ph}@${tt} (caught ${s1?.phase}@${s1?.t?.toFixed(2)}): ended in ${a?.area}, clean ${a ? clean(a) : false}, picture drawn ${lit > 60} (${lit}), ${a ? `inside ${JSON.stringify(a.hit)} ground ${a.ground} locked ${a.locked} crossing ${a.on}/${a.xing} copies ${a.copies} lost ${a.lost}` : JSON.stringify(await st())}, page errors ${errs.length - e0}`;
      if (a && clean(a) && a.area === 'eshville_past' && lit > 60 && errs.length === e0) ok(line); else fail(line);
    }
    // leaving the scene at three moments and coming back
    for (const [ph, tt] of PART.includes('leave') ? [['gather', 0], ['passage', 0.4], ['reveal', 0.3]] : []) {
      await open(); const e0 = errs.length; await cross(); const s1 = await until((q) => q.phase === ph && q.t >= tt, 2500);
      const left = await page.evaluate(async () => {
        const g = window.__game, sc = window.__v2.scene, cx = sc.cx; try { sc._leave(); } catch (e) { return { err: e.message }; }
        for (let i = 0; i < 40; i++) g.tick(1 / 60); g.render(); await new Promise((r) => setTimeout(r, 900)); for (let i = 0; i < 30; i++) g.tick(1 / 60); g.render();
        return { top: g.top?.constructor?.name ?? '?', v2: !!window.__v2, glr: !!sc.glr, xing: !!sc.xing, on: cx.on, progs: [cx.pPass, cx.pWorld, cx.pField, cx.vao].filter(Boolean).length, tex: [cx.texA, cx.texB, cx.depth, cx.texF, cx.texL, cx.fboA, cx.fboB, cx.fboF].filter(Boolean).length, bytes: cx.bytes, yq: cx._yq.length, hold: !!cx._holdRes, loop: cx.loopId, gl: !!document.getElementById('v2g-gl'), pad: !!document.getElementById('v2pad'), hud: !!document.getElementById('v2g-hud') };
      });
      const gone = !left.err && !left.v2 && !left.glr && !left.on && !left.xing && left.progs === 0 && left.tex === 0 && left.bytes === 0 && left.yq === 0 && !left.hold && !left.loop && !left.gl && !left.pad && !left.hud;
      await open(); await cross(); const s = await until(done, 3000); await steps(page, 60); const a = s ? await after() : null;
      const line = `left in ${ph}@${tt} (caught ${s1?.phase}@${s1?.t?.toFixed(2)}): ${JSON.stringify(left)}; back: crossing ended in ${a?.area}, clean ${a ? clean(a) : false}, page errors ${errs.length - e0}`;
      if (gone && a && clean(a) && a.area === 'eshville_past' && errs.length === e0) ok(line); else fail(line);
    }
  }
  // ───────────────────────── cost ─────────────────────────
  if (MODE === 'cost') {
    await openArea(page, S.port, String(A.area || 'eshville_now'), Q); await standAtBell(page); await steps(page, 30);
    const info = await page.evaluate(() => { const s = window.__v2.stats; return { canvas: s.gl.canvas, tier: s.fx?.tier, post: s.fx?.post, renderer: s.gl.renderer }; });
    say(`info cost: ${DEV} res ${RES} tier ${info.tier} post ${info.post} canvas ${info.canvas} ${info.renderer}`);
    const rows = [];
    for (let i = 0; i < N; i++) {
      const r = await cross(); const s = await until(done, 3000); await steps(page, 60);
      if (!r || !s || !done(s)) { fail(`cost: crossing ${i + 1} did not end: ${JSON.stringify(s)}`); break; }
      const m = await page.evaluate(() => { try { window.gc?.(); } catch { /* no gc */ } const s = window.__v2.stats; return { area: s.area, tex: s.gl.texBytes, buf: s.gl.bufBytes, fx: s.fx?.bytes ?? 0, canvases: document.querySelectorAll('canvas').length, heap: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1024), cx: window.__v2.scene.cx.bytes }; });
      rows.push(m); say(`info crossing ${i + 1}: ${m.area} tex ${m.tex} buf ${m.buf} heap ${m.heap} KB copies ${m.cx}`); await standAtBell(page); await steps(page, 6);
    }
    const by = (a) => rows.filter((q) => q.area === a), areas = [...new Set(rows.map((q) => q.area))];
    for (const a of areas) { const L = by(a), tex = [...new Set(L.map((q) => q.tex))], buf = [...new Set(L.map((q) => q.buf))]; (tex.length === 1 && buf.length === 1 ? ok : fail)(`cost ${TIER || 'default tier'}: ${a} over ${L.length} visits: texture bytes ${tex.join('/')}, buffer bytes ${buf.join('/')}, canvases ${[...new Set(L.map((q) => q.canvases))].join('/')}, crossing copies left ${[...new Set(L.map((q) => q.cx))].join('/')}`); }
    const heap = rows.map((q) => q.heap); say(`info heap KB after each crossing (gc forced): ${heap.join(' ')}`);
    for (const a of areas) { const L = by(a).map((q) => q.heap); if (L.length >= 8) { const n = L.length, x = L.map((_, i) => i), mx = (n - 1) / 2, my = L.reduce((p, v) => p + v, 0) / n; let sxy = 0, sxx = 0; for (let i = 2; i < n; i++) { sxy += (x[i] - mx) * (L[i] - my); sxx += (x[i] - mx) * (x[i] - mx); } say(`info heap slope in ${a} (visits 3..${n}): ${(sxy / sxx / 2).toFixed(1)} KB per crossing`); } }
  }
} catch (e) { fail('tool error: ' + String(e?.stack ?? e).slice(0, 600)); }
say(`page errors ${errs.length}${errs.length ? ': ' + [...new Set(errs)].slice(0, 6).join(' | ') : ''}`);
say(fails.length ? `${MODE}: ${fails.length} FAIL` : `${MODE}: ALL OK`);
fs.appendFileSync(`${OUT}/${MODE}_${DEV}${TIER ? '_' + TIER : ''}.txt`, `--- ${new Date().toISOString()} res ${RES}\n${lines.join('\n')}\n`);
await browser.close(); S.close();
process.exit(fails.length ? 1 : 0);
