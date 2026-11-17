// UI lane: checks of the v2 interface (docs/v2/UI_API.md) on the test page tools/v2/ui_view.html.
//   node tools/v2/ui_check.mjs [--devices fold_open,phone2] [--texts normal,large,xlarge] [--json /tmp/claude-0/v2/ui/check.json] [--live v2g]
// Per device and text size: page errors 0; every button >= 44 CSS px; buttons, labels and the resting stick inside
// the safe area (also with simulated insets); labels not clipped by their canvas and not under another button; buttons
// clear of the stick zone and of each other; touches become the documented input actions (tap, hold, slide, stick);
// pause and dialogue open, take taps and close; no opaque HUD pixel outside the safe area; draw time and allocation.
// Headless Chromium has no GPU: the draw time printed here is a software-raster figure, not the device's.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(','), TEXTS = String(args.texts || 'normal,large,xlarge').split(',');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const INSET = '44,0,34,21';   // iPhone-like landscape insets (CSS px): l,t,r,b
const fails = [], report = {};
let passN = 0;
const ok = (c, m) => { if (c) { passN++; } else { fails.push(m); console.log('  FAIL ' + m); } return c; };
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

async function open(ctx, q) {
  const page = await ctx.newPage(); page._errs = [];
  page.on('pageerror', (e) => page._errs.push(String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') page._errs.push('console: ' + m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${port}/tools/v2/ui_view.html?${q}`);
  await page.waitForFunction(() => window.__ui?.ready && window.__ui.hud.ready, null, { timeout: 20000 }).catch(() => page._errs.push('page not ready'));
  await page.waitForTimeout(250);
  return page;
}
const touch = async (client, type, pts) => client.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
const logOf = (page) => page.evaluate(() => window.__ui.log.splice(0));
const metrics = (page) => page.evaluate(() => { const u = window.__ui, m = u.hud.metrics(); m.css = u.game.cssScale; m.win = { w: innerWidth, h: innerHeight }; m.canvases = [...document.querySelectorAll('#v2pad canvas.v2b')].map((c) => { const r = c.getBoundingClientRect(); return { id: c.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height }; }); return m; });

function geometry(tag, m, inset) {
  const P = m.pad, B = P.buttons, bd = P.bounds, z = P.stick.zone;
  const safe = { l: inset[0], t: inset[1], r: m.win.w - inset[2], b: m.win.h - inset[3] };
  ok(Math.abs(bd.l - safe.l) < 0.6 && Math.abs(bd.r - safe.r) < 0.6 && Math.abs(bd.b - safe.b) < 0.6, `${tag}: pad bounds follow the safe area`);
  let minD = 1e9, minGap = 1e9;
  for (const b of B) {
    minD = Math.min(minD, b.d);
    ok(b.d >= 44, `${tag}: ${b.id} is ${b.d} px (< 44)`);
    const r = b.d / 2, L = b.labelRect;
    ok(b.cx - r >= safe.l && b.cx + r <= safe.r && b.cy - r >= safe.t && b.cy + r <= safe.b, `${tag}: ${b.id} circle outside the safe area`);
    ok(L.x >= safe.l && L.x + L.w <= safe.r && L.y + L.h <= safe.b + 0.5, `${tag}: ${b.id} label outside the safe area (${JSON.stringify(L)})`);
    const cv = m.canvases.find((c) => c.id === b.id);
    ok(cv && L.x >= cv.x - 0.5 && L.x + L.w <= cv.x + cv.w + 0.5 && L.y + L.h <= cv.y + cv.h + 0.5, `${tag}: ${b.id} label clipped by its canvas`);
    ok(b.cx - r > z.x + z.w || b.cx + r < z.x || b.cy + r < z.y, `${tag}: ${b.id} overlaps the stick zone`);
    for (const o of B) {
      if (o === b) continue;
      const gap = Math.hypot(o.cx - b.cx, o.cy - b.cy) - r - o.d / 2; minGap = Math.min(minGap, gap);
      ok(gap >= 6, `${tag}: ${b.id} and ${o.id} are ${gap.toFixed(1)} px apart (< 6)`);
      // this label must not sit under the other button's glass (nearest point of the label rect to the circle centre)
      const nx = Math.max(L.x, Math.min(o.cx, L.x + L.w)), ny = Math.max(L.y, Math.min(o.cy, L.y + L.h));
      ok(Math.hypot(nx - o.cx, ny - o.cy) >= o.d / 2 - 0.5, `${tag}: label of ${b.id} is under ${o.id}`);
      const OL = o.labelRect;
      ok(L.x + L.w <= OL.x || OL.x + OL.w <= L.x || L.y + L.h <= OL.y || OL.y + OL.h <= L.y, `${tag}: labels of ${b.id} and ${o.id} overlap`);
    }
  }
  const s = P.stick;
  ok(s.cx - s.r >= safe.l && s.cx + s.r <= safe.r && s.cy + s.r <= safe.b, `${tag}: resting stick outside the safe area`);
  ok(s.cx - s.r >= z.x && s.cx + s.r <= z.x + z.w, `${tag}: resting stick outside its zone`);
  return { minD, minGap: +minGap.toFixed(1), k: P.k, labelPx: P.labelPx, buttons: B.map((b) => [b.id, b.d, Math.round(b.cx), Math.round(b.cy)]), stick: [Math.round(s.cx), Math.round(s.cy), s.r] };
}

/** No opaque HUD pixel outside the safe rectangle (canvas HUD; the soft banner band and the pause dim are below the alpha threshold on purpose). */
const outside = (page, inset) => page.evaluate((ins) => {
  const cv = document.getElementById('screen'), c = cv.getContext('2d'), W = cv.width, H = cv.height, k = W / innerWidth;
  const d = c.getImageData(0, 0, W, H).data, l = ins[0] * k, t = ins[1] * k, r = W - ins[2] * k, b = H - ins[3] * k; let n = 0;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { if (x >= l - 1 && x <= r + 1 && y >= t - 1 && y <= b + 1) continue; if (d[(y * W + x) * 4 + 3] > 150) n++; }
  return n;
}, inset);

try {
  for (const dev of DEVICES) {
    report[dev] = {};
    for (const text of TEXTS) {
      const tag = `${dev}/${text}`; console.log(`[${tag}]`);
      const ctx = await browser.newContext(contextOptions(dev));
      const R = (report[dev][text] = {});
      // 1) geometry, no insets and with insets
      let page = await open(ctx, `view=boss&bg=black&dev=${dev}&text=${text}&freeze=1`);
      R.geometry = geometry(tag, await metrics(page), [0, 0, 0, 0]);
      ok(page._errs.length === 0, `${tag}: page errors ${JSON.stringify(page._errs)}`);
      const client = await ctx.newCDPSession(page);
      // 2) touches become actions
      const m0 = await metrics(page), bt = Object.fromEntries(m0.pad.buttons.map((b) => [b.id, b]));
      const EXPECT = { attack: 'attack', jump: 'jump', roll: 'dash,guard', skill: 'skill1', bell: 'ult', lock: 'lock' };
      await logOf(page);
      for (const id in EXPECT) {
        await touch(client, 'touchStart', [[bt[id].cx, bt[id].cy]]); await page.waitForTimeout(70);
        const down = await page.evaluate((i) => window.__ui.hud.metrics().pad.buttons.find((b) => b.id === i).down, id);
        await touch(client, 'touchEnd', []); await page.waitForTimeout(40);
        const lg = await logOf(page), want = EXPECT[id];
        if (id === 'roll' && m0.pad.buttons.find((b) => b.id === 'roll').disabled) { ok(!lg.some((e) => e[1] === want), `${tag}: disabled roll still sent ${want}`); continue; }
        ok(down && lg.some((e) => e[0] === 'down' && e[1] === want) && lg.some((e) => e[0] === 'up' && e[1] === want), `${tag}: ${id} did not send ${want} (${JSON.stringify(lg)})`);
      }
      // the label plate under a button is part of the button (hit radius = radius + 8)
      await touch(client, 'touchStart', [[bt.attack.cx, bt.attack.cy + bt.attack.d / 2 + 6]]); await page.waitForTimeout(40); await touch(client, 'touchEnd', []);
      ok((await logOf(page)).some((e) => e[1] === 'attack'), `${tag}: pressing the attack name plate does not attack`);
      // slide from attack to jump
      await touch(client, 'touchStart', [[bt.attack.cx, bt.attack.cy]]); await page.waitForTimeout(50);
      await touch(client, 'touchMove', [[(bt.attack.cx + bt.jump.cx) / 2, bt.jump.cy]]); await touch(client, 'touchMove', [[bt.jump.cx, bt.jump.cy]]); await page.waitForTimeout(50);
      await touch(client, 'touchEnd', []); await page.waitForTimeout(40);
      let lg = await logOf(page);
      ok(lg.some((e) => e[0] === 'up' && e[1] === 'attack') && lg.some((e) => e[0] === 'down' && e[1] === 'jump'), `${tag}: sliding attack -> jump (${JSON.stringify(lg)})`);
      // two fingers: stick + attack at once
      const z = m0.pad.stick.zone, sx = z.x + z.w * 0.4, sy = z.y + z.h * 0.6;
      await touch(client, 'touchStart', [[sx, sy]]); await touch(client, 'touchMove', [[sx + 60, sy - 40]]); await page.waitForTimeout(40);
      await touch(client, 'touchMove', [[sx + 60, sy - 40], [bt.attack.cx, bt.attack.cy]]).catch(() => {});
      await touch(client, 'touchStart', [[sx + 60, sy - 40], [bt.attack.cx, bt.attack.cy]]); await page.waitForTimeout(60);
      const mid = await page.evaluate(() => ({ v: { ...window.__ui.input._touchVec }, held: [...window.__ui.held], live: window.__ui.hud.metrics().pad.stick.live }));
      ok(mid.live && mid.v.x > 0.3 && mid.v.y < -0.2, `${tag}: stick vector ${JSON.stringify(mid.v)} (wanted right and up)`);
      ok(mid.held.includes('attack') && mid.held.includes('right'), `${tag}: stick + attack together (${mid.held})`);
      await touch(client, 'touchEnd', []); await page.waitForTimeout(60);
      const end = await page.evaluate(() => ({ v: { ...window.__ui.input._touchVec }, held: [...window.__ui.held] }));
      ok(end.v.mag === 0 && end.held.length === 0, `${tag}: everything released after lifting (${JSON.stringify(end)})`);
      // 3) pause button -> pause menu -> resume by tap
      await logOf(page);
      await touch(client, 'touchStart', [[bt.pause.cx, bt.pause.cy]]); await page.waitForTimeout(50); await touch(client, 'touchEnd', []); await page.waitForTimeout(350);
      let mm = await metrics(page);
      ok(mm.modal === 'pause' && !mm.pad.shown, `${tag}: pause button opens the pause menu and hides the pad (modal ${mm.modal}, pad ${mm.pad.shown})`);
      if (mm.pause) {
        const rw = mm.pause.rows[0], c = mm.css;
        ok(rw.h * c >= 44, `${tag}: pause row is ${(rw.h * c).toFixed(1)} px tall (< 44)`);
        await touch(client, 'touchStart', [[(rw.x + rw.w / 2) * c, (rw.y + rw.h / 2) * c]]); await touch(client, 'touchEnd', []); await page.waitForTimeout(300);
        mm = await metrics(page); lg = await logOf(page);
        ok(mm.modal === null && mm.pad.shown, `${tag}: resume row closes the menu and the pad returns (${mm.modal}, pad ${mm.pad.shown})`);
      }
      // 4) cost: time and allocation of update + draw in a tight loop (animated boss view state)
      R.cost = await page.evaluate(async () => {
        const u = window.__ui, cv = document.getElementById('screen'), c = cv.getContext('2d'), S = u.state;
        for (let i = 0; i < 900; i++) { u.hud.update(1 / 60, S); u.hud.draw(c, S); }   // warm up: let the optimiser finish before measuring
        globalThis.gc?.(); const m0 = performance.memory?.usedJSHeapSize ?? 0, t0 = performance.now(), N = 3000;
        for (let i = 0; i < N; i++) { u.hud.update(1 / 60, S); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.setTransform(S.scale, 0, 0, S.scale, 0, 0); u.hud.draw(c, S); }
        c.getImageData(0, 0, 1, 1); const t1 = performance.now(), m1 = performance.memory?.usedJSHeapSize ?? 0;
        // the same with a 1-pixel read-back after every frame, so the rasteriser cannot defer or skip a frame
        const t2 = performance.now(), N2 = 240;
        for (let i = 0; i < N2; i++) { u.hud.update(1 / 60, S); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.setTransform(S.scale, 0, 0, S.scale, 0, 0); u.hud.draw(c, S); c.getImageData(i % 50, 0, 1, 1); }
        const flushed = (performance.now() - t2) / N2;
        const st = u.hud.stats();
        return { msPerFrameFlushed: +flushed.toFixed(3), msPerFrame: +((t1 - t0) / N).toFixed(3), heapBytesPerFrame: Math.round((m1 - m0) / N), canvas: [cv.width, cv.height], drawMs: { avg: +st.drawMs.avg.toFixed(3), p95: +st.drawMs.p95.toFixed(3), max: +st.drawMs.max.toFixed(3) }, updMs: +st.updMs.toFixed(4), padRepaints: st.padRepaints };
      });
      // (allocation is measured by tools/v2/ui_alloc.mjs with the sampling heap profiler; performance.memory is too coarse to assert on)
      ok(page._errs.length === 0, `${tag}: page errors after touches ${JSON.stringify(page._errs)}`);
      await page.close();

      // 5) simulated insets: pad geometry + no opaque canvas pixel outside
      const ins = INSET.split(',').map(Number);
      for (const view of ['boss', 'many', 'toast', 'dialog', 'choice', 'play']) {
        page = await open(ctx, `view=${view}&bg=black&dev=${dev}&text=${text}&freeze=1&inset=${INSET}`);
        if (view === 'boss') R.geometryInset = geometry(tag + '/inset', await metrics(page), ins);
        const n = await outside(page, ins);
        ok(n === 0, `${tag}: view ${view} has ${n} opaque HUD pixels outside the safe area`);
        if (view === 'dialog' || view === 'choice') {
          const mt = await metrics(page), d = mt.dialog, c = mt.css;
          ok(mt.modal === 'dialog' && !mt.pad.shown, `${tag}: dialogue is modal and hides the pad`);
          if (d) {
            ok(d.box.x * c >= ins[0] - 0.5 && (d.box.x + d.box.w) * c <= mt.win.w - ins[2] + 0.5 && (d.box.y + d.box.h) * c <= mt.win.h - ins[3] + 0.5 && d.box.top * c >= ins[1], `${tag}: dialogue box outside the safe area ${JSON.stringify(d.box)}`);
            ok(d.text.x >= d.box.x && d.text.x + d.text.w <= d.box.x + d.box.w && d.text.y + d.text.h <= d.box.y + d.box.h + 1, `${tag}: dialogue text area leaves its box`);
            ok(d.pages >= 1 && d.shown === d.total, `${tag}: dialogue text revealed (${d.shown}/${d.total}, ${d.pages} page)`);
            const cl = await ctx.newCDPSession(page);
            if (view === 'choice') {
              const q = d.choiceRects[1];
              ok(q && q.h * c >= 40, `${tag}: choice button is ${(q?.h * c).toFixed(1)} px tall`);
              await touch(cl, 'touchStart', [[(q.x + q.w / 2) * c, (q.y + q.h / 2) * c]]); await touch(cl, 'touchEnd', []); await page.waitForTimeout(250);
              const l2 = await logOf(page), m2 = await metrics(page);
              ok(l2.some((e) => e[0] === 'dialog' && e[1] === 'choice' && e[2] === 1) && m2.modal === null && m2.pad.shown, `${tag}: tapping the second choice (${JSON.stringify(l2)}, modal ${m2.modal})`);
            } else {
              for (let i = 0; i < d.pages; i++) { await touch(cl, 'touchStart', [[mt.win.w / 2, mt.win.h / 2]]); await touch(cl, 'touchEnd', []); await page.waitForTimeout(120); }
              const l2 = await logOf(page), m2 = await metrics(page);
              ok(l2.some((e) => e[0] === 'dialog' && e[1] === 'done') && m2.modal === null && m2.pad.shown, `${tag}: tapping through the dialogue closes it (${JSON.stringify(l2)}, modal ${m2.modal})`);
            }
          } else ok(false, `${tag}: no dialogue metrics`);
        }
        ok(page._errs.length === 0, `${tag}: view ${view} page errors ${JSON.stringify(page._errs)}`);
        await page.close();
      }
      // 5b) touch: a tap on a prompt chip presses that prompt's action (hit area at least 44 CSS px), not the stick
      page = await open(ctx, `view=play&bg=black&dev=${dev}&text=${text}&freeze=1`);
      {
        const mp = await metrics(page), c = mp.css, cl = await ctx.newCDPSession(page);
        ok(mp.prompts.length === 3, `${tag}: three prompt chips drawn (${mp.prompts.length})`);
        await logOf(page);
        for (const q of mp.prompts) { await touch(cl, 'touchStart', [[(q.x + q.w / 2) * c, (q.y + q.h / 2) * c]]); await touch(cl, 'touchEnd', []); await page.waitForTimeout(60); }
        const lp = await logOf(page), st = await page.evaluate(() => window.__ui.hud.metrics().pad.stick.live);
        ok(lp.filter((e) => e[0] === 'tap').length === 3 && lp.some((e) => e[0] === 'tap' && e[1] === 'skill1') && !lp.some((e) => e[0] === 'axis') && !st, `${tag}: prompt chips take taps (${JSON.stringify(lp)})`);
      }
      ok(page._errs.length === 0, `${tag}: prompt view page errors ${JSON.stringify(page._errs)}`);
      await page.close();
      // 5c) left-handed setting: the cluster and the stick swap sides, same rules
      page = await open(ctx, `view=boss&bg=black&dev=${dev}&text=${text}&freeze=1&left=1&inset=${INSET}`);
      {
        const ml = await metrics(page); geometry(tag + '/left', ml, ins);
        const at = ml.pad.buttons.find((b) => b.id === 'attack');
        ok(at.cx < ml.win.w / 2 && ml.pad.stick.cx > ml.win.w / 2, `${tag}: left-handed layout mirrors (attack x ${at.cx}, stick x ${ml.pad.stick.cx})`);
        ok((await outside(page, ins)) === 0, `${tag}: left-handed view has opaque HUD pixels outside the safe area`);
      }
      await page.close();
      // 6) keyboard mode: the pad is gone, prompts show key caps
      page = await open(ctx, `view=kb&bg=black&dev=${dev}&text=${text}&freeze=1`);
      const mk = await metrics(page);
      ok(!mk.pad.shown, `${tag}: pad hidden in keyboard mode`);
      const gone = await page.evaluate(() => { window.__ui.hud.release(); window.__ui.hud.release(); return !document.getElementById('v2pad'); });
      await page.waitForTimeout(120);
      ok(gone, `${tag}: release() removes the pad layer`);
      ok(page._errs.length === 0, `${tag}: kb view page errors ${JSON.stringify(page._errs)}`);
      await page.close();
      console.log(`  buttons ${JSON.stringify(R.geometry.buttons)} minGap ${R.geometry.minGap} label ${R.geometry.labelPx}px | cost ${JSON.stringify(R.cost)}`);
      await ctx.close();
    }
  }
  // 7) --live <scene>: the HUD plugged into the real game scene (iframe, the scene's own HUD seam); the pad must drive the hero
  if (args.live) {
    const tag = 'live/' + args.live; console.log(`[${tag}]`);
    const ctx = await browser.newContext(contextOptions('fold_open'));
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
    await page.goto(`http://localhost:${port}/tools/v2/ui_view.html?live=${args.live}`);
    const up = await page.waitForFunction(() => window.__ui?.live, null, { timeout: 120000 }).then(() => true, () => false);
    if (ok(up, `${tag}: live page did not come up`)) {
      await page.waitForTimeout(1500);
      const cl = await ctx.newCDPSession(page);
      const hero = () => page.evaluate(() => { const v = window.__ui.win.__v2, h = v.hero; return { x: h.x, z: h.z, anim: h.anim, hp: h.hp }; });
      const m = await page.evaluate(() => { const u = window.__ui, m = u.hud.metrics(); return { pad: m.pad, modal: m.modal, builtin: !!u.scene.hud.builtin, hidePad: u.scene.hidePad, tpad: getComputedStyle(u.win.document.getElementById('tpad') ?? u.win.document.body).display, stats: u.hud.stats() }; });
      ok(!m.builtin && m.hidePad === true, `${tag}: scene uses the UI lane HUD and hides the v1 pad`);
      ok(m.pad.shown, `${tag}: v2 pad is shown in touch mode`);
      ok(await page.evaluate(() => window.__ui.win.document.fonts.check('700 32px "BN Brush"', '0')), `${tag}: brush font loaded in the game`);
      const bt = Object.fromEntries(m.pad.buttons.map((b) => [b.id, b])), z = m.pad.stick.zone, sx = z.x + z.w * 0.4, sy = z.y + z.h * 0.7;
      const h0 = await hero();
      await touch(cl, 'touchStart', [[sx, sy]]); await touch(cl, 'touchMove', [[sx + 70, sy]]); await page.waitForTimeout(1600);
      const h1 = await hero(); await touch(cl, 'touchEnd', []);
      ok(h1.x > h0.x + 15, `${tag}: stick right moves the hero (x ${h0.x.toFixed(0)} -> ${h1.x.toFixed(0)})`);
      let seen = '';
      await touch(cl, 'touchStart', [[bt.attack.cx, bt.attack.cy]]); await page.waitForTimeout(90); await touch(cl, 'touchEnd', []);
      for (let i = 0; i < 20 && seen !== 'attack'; i++) { await page.waitForTimeout(60); seen = (await hero()).anim; }
      ok(seen === 'attack', `${tag}: attack button starts an attack (anim ${seen})`);
      await page.waitForTimeout(900);
      await touch(cl, 'touchStart', [[bt.pause.cx, bt.pause.cy]]); await page.waitForTimeout(60); await touch(cl, 'touchEnd', []); await page.waitForTimeout(500);
      const pm = await page.evaluate(() => { const u = window.__ui, m = u.hud.metrics(); return { modal: m.modal, pause: m.pause, css: u.game.cssScale, rect: u.game.canvasRect, shown: m.pad.shown }; });
      ok(pm.modal === 'pause' && !pm.shown, `${tag}: pause button opens the pause menu (modal ${pm.modal})`);
      if (pm.pause) { const r = pm.pause.rows[0]; await touch(cl, 'touchStart', [[pm.rect.x + (r.x + r.w / 2) * pm.css, pm.rect.y + (r.y + r.h / 2) * pm.css]]); await touch(cl, 'touchEnd', []); await page.waitForTimeout(500); }
      const end = await page.evaluate(() => { const u = window.__ui, m = u.hud.metrics(); return { modal: m.modal, shown: m.pad.shown, stats: u.hud.stats(), frame: u.win.__v2.stats?.frameMs ?? null }; });
      ok(end.modal === null && end.shown, `${tag}: resume returns to play (modal ${end.modal})`);
      report.live = { scene: args.live, hudDrawMs: end.stats.drawMs, hudUpdMs: end.stats.updMs, padRepaints: end.stats.padRepaints, frameMs: end.frame };
      console.log('  live HUD draw ms', JSON.stringify(end.stats.drawMs), 'update ms', end.stats.updMs.toFixed(4), 'pad repaints', end.stats.padRepaints, 'scene frame', JSON.stringify(end.frame));
    }
    ok(errs.length === 0, `${tag}: page errors ${JSON.stringify(errs)}`);
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }
report.pass = passN; report.fail = fails.length; report.fails = fails;
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1));
console.log(`\nUI CHECK: ${passN} passed, ${fails.length} failed`);
for (const f of fails) console.log('  - ' + f);
process.exitCode = fails.length ? 1 : 0;
