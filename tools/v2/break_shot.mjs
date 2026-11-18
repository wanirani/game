// BREAK lane: staged captures of breakables in scene v2g (forced rule inputs, as tools/v2/game_shot.mjs does).
//   node tools/v2/break_shot.mjs --plan jar|crate|barrel|drops|roll|five|areas|hud [--area eshville_now] [--device fold_open] [--out /tmp/claude-0/v2/break] [--q "..."]
// One browser, one page. Prints one JSON line per picture.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/break'), PLAN = String(args.plan || 'jar'), AREA = String(args.area || 'eshville_now');
fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = []; let code = 0;

function install() {
  const v = window.__v2, sc = v.scene, g = window.__game; g._pageHidden = true;
  const F = (window.__F = { hold: {}, once: {}, n: 0, ev: [], peace: true });
  F.hook = () => {
    const sim = sc.sim; if (!sim || sim.__f) return; sim.__f = true;
    const u0 = sim.update.bind(sim); sim.update = (dt, inp) => { if (inp) { for (const k in F.hold) inp[k] = F.hold[k]; for (const k in F.once) inp[k] = F.once[k]; F.once = {}; } return u0(dt, inp); };
    const H = sim.hooks, e0 = H.event; H.event = function (name, a, b, c) { if (name === 'break' || name === 'drop' || name === 'pickup') F.ev.push([F.n, name, name === 'break' ? a.kind + '#' + a.id : a, name === 'break' ? b : b]); return e0.apply(this, arguments); };
    if (F.peace) { sim.done = true; for (const e of sim.enemies) { e.dead = true; e.hp = 0; e.active = false; } }   // a quiet street for the pictures (done first: the stand-in rule must not rebuild the area)
  };
  F.tick = (n = 1) => { for (let i = 0; i < n; i++) { F.hook(); g.tick(1 / 60); F.n++; } g.render(); };
  F.put = (x, z, dx = 1, dz = 0) => {
    F.hook(); const sim = sc.sim, h = sim.hero, B = sc.W.boxes; let gy = -Infinity;
    for (const b of B) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 > gy) gy = b.y1; }
    h.x = x; h.z = z; if (Number.isFinite(gy)) h.y = gy; h.vx = 0; h.vz = 0; h.vy = 0; h.onGround = true; h.move = null; h.act = null; h.dashT = 0; h.rollCd = 0;
    const l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; if (h.wishX !== undefined) { h.wishX = 0; h.wishZ = 0; } sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ;
    if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; } h._px = h.x; h._py = h.y; h._pz = h.z; sc.visY = sc.visYP = h.y; sc.cam.snap = true; sc._whipReset = true;
  };
  F.brk = (pred) => sc.sim.breakables.filter((b) => !b.broken && (!pred || pred(b)));
  F.css = (x, y, z) => { const p = v.project(x, y, z), r = g.canvas.getBoundingClientRect(); return [Math.round(r.left + p.x / g.viewW * r.width), Math.round(r.top + p.y / g.viewH * r.height)]; };
  F.info = () => { const h = sc.sim.hero, st = sc.brk.stat; return { n: F.n, hero: [Math.round(h.x), Math.round(h.z)], anim: h.anim, coins: sc.brk.coins, hp: Math.round(h.hp), reso: +h.reso.toFixed(2), whole: sc.sim.brkLive, shards: sc.brk.shN, peak: sc.brk.shPeak, pickups: sc.sim.pickN, draws: st.draws, tris: Math.round(st.tris), lost: sc.glr.gl.isContextLost(), ev: F.ev.slice(-6) }; };
  return { ready: v.ready, area: v.area, n: sc.sim.breakables.length };
}

try {
  const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${AREA}&v2seed=${args.seed ?? 5}${args.q ? '&' + args.q : ''}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 }).catch(() => {});
  console.log(JSON.stringify(await page.evaluate(install)));
  const dpr = await page.evaluate(() => devicePixelRatio);
  const shot = async (name, clip) => {
    const info = await page.evaluate(() => window.__F.info());
    const p = `${OUT}/${name}.png`; await page.screenshot(clip ? { path: p, clip } : { path: p });
    console.log(JSON.stringify({ shot: name, ...info }));
  };
  const T = (n) => page.evaluate((k) => window.__F.tick(k), n);
  const clipAt = async (x, y, z, w = 420, h = 300) => { const [cx, cy] = await page.evaluate(([a, b, c]) => window.__F.css(a, b, c), [x, y, z]); const vp = page.viewportSize(); return { x: Math.max(0, Math.min(vp.width - w, cx - w / 2)), y: Math.max(0, Math.min(vp.height - h, cy - h * 0.62)), width: w, height: h }; };
  /** stand beside the nearest breakable of a kind (on the camera side, a little to the left), face it; returns it */
  const approach = (kind, dx = -1, dz = -0.45, dist = 64, drop = null) => page.evaluate(([k, ax, az, d, dr]) => { const F = window.__F, sc = window.__v2.scene; F.hook(); const b = F.brk((q) => q.kind === k)[0]; if (!b) return null; if (dr) b.drop = dr; const l = Math.hypot(ax, az); F.put(b.x + ax / l * d, b.z + az / l * d, -ax, -az); return { id: b.id, x: b.x, y: b.y, z: b.z, h: b.h }; }, [kind, dx, dz, dist, drop]);

  if (PLAN === 'jar' || PLAN === 'crate' || PLAN === 'barrel' || PLAN === 'pot' || PLAN === 'urn') {
    const b = await approach(PLAN, -1, -0.5, PLAN === 'crate' || PLAN === 'barrel' ? 78 : 66, args.drop ? String(args.drop) : 'none');
    await T(30); const clip = await clipAt(b.x, b.y + 20, b.z, 460, 330);
    await shot(`${PLAN}_0_whole`, clip);
    await page.evaluate(() => { window.__F.once.attack = true; });
    let k = 0; for (; k < 40; k++) { await T(1); if (await page.evaluate((id) => window.__v2.scene.sim.breakables[id].broken, b.id)) break; }
    await shot(`${PLAN}_1_hit`, clip);
    for (const [i, n] of [[2, 3], [3, 3], [4, 4], [5, 6], [6, 10], [7, 20], [8, 50], [9, 90]]) { await T(n); await shot(`${PLAN}_${i}`, clip); }
  } else if (PLAN === 'drops') {
    for (const [kind, drop] of [['barrel', 'coin5'], ['jar', 'heal'], ['pot', 'reso']]) {
      const b = await approach(kind, -1, -0.5, kind === 'barrel' ? 190 : 170, drop); if (!b) continue;
      await page.evaluate(([id]) => { const sc = window.__v2.scene, h = sc.sim.hero; h.hp = 40; h.reso = 0.5; }, [b.id]);
      await T(20); const clip = await clipAt(b.x - 60, b.y + 20, b.z - 30, 560, 360);
      await page.evaluate((id) => { const sc = window.__v2.scene, B = sc.sim.breakables[id]; sc.sim.breakAt(B.x, B.z, 4, 'c1'); }, b.id);
      let i = 0; for (const n of [4, 6, 8, 12, 20, 30]) { await T(n); await shot(`drops_${kind}_${i++}`, clip); }
      await page.evaluate(() => { window.__F.hold.mx = 1; window.__F.hold.mz = 0.45; }); await T(10); await shot(`drops_${kind}_${i++}_walk`, clip);
      for (const n of [5, 5, 6, 10]) { await T(n); await shot(`drops_${kind}_${i++}`, clip); }
      await page.evaluate(() => { window.__F.hold = {}; }); await T(40);
    }
  } else if (PLAN === 'roll') {
    // a row of jars set up in the open street (test only): the roll goes through all of them
    const at = await page.evaluate(() => { const F = window.__F, sc = window.__v2.scene; F.hook(); const sim = sc.sim, L = sim.breakables.filter((b) => !b.broken && b.def.roll).slice(0, 4), h = sim.hero; const x0 = 300, z0 = 150; L.forEach((b, i) => { b.x = x0 + 60 + i * 42; b.z = z0; b.box.x0 = b.x - b.r; b.box.x1 = b.x + b.r; b.box.z0 = b.z - b.r; b.box.z1 = b.z + b.r; b.drop = i === 1 ? 'coin3' : 'none'; }); sc.brk._bake(sc.area, sim.breakables, sc.glr); F.put(x0, z0, 1, 0); return { x: x0, z: z0, y: h.y, n: L.length }; });
    await T(20); const clip = await clipAt(at.x + 110, at.y + 20, at.z, 640, 330);
    await shot('roll_0', clip);
    const v0 = await page.evaluate(() => { const F = window.__F; F.hold.mx = 1; F.hold.mz = 0; F.once.dash = true; return 0; });
    const sp = []; for (let i = 1; i <= 9; i++) { await T(i === 1 ? 2 : 3); sp.push(await page.evaluate(() => { const h = window.__v2.scene.sim.hero; return [Math.round(h.x), Math.round(Math.hypot(h.vx, h.vz)), h.anim]; })); await shot(`roll_${i}`, clip); }
    console.log(JSON.stringify({ rollSpeed: sp }));
  } else if (PLAN === 'five') {
    const r = await page.evaluate(() => { const F = window.__F, sc = window.__v2.scene; F.hook(); const sim = sc.sim, L = sim.breakables.filter((b) => !b.broken && b.kind === 'jar').concat(sim.breakables.filter((b) => !b.broken && b.kind !== 'jar' && b.def.roll)).slice(0, 5); const x0 = 320, z0 = 170; L.forEach((b, i) => { b.x = x0 + Math.cos(i * 1.257) * 62; b.z = z0 + Math.sin(i * 1.257) * 62; b.box.x0 = b.x - b.r; b.box.x1 = b.x + b.r; b.box.z0 = b.z - b.r; b.box.z1 = b.z + b.r; b.drop = 'coin2'; }); sc.brk._bake(sc.area, sim.breakables, sc.glr); F.put(x0, z0, 1, 0); return { x: x0, z: z0, y: sim.hero.y, n: L.length }; });
    await T(30); const clip = await clipAt(r.x, r.y + 20, r.z, 620, 420); await shot('five_0', clip);
    // timing: 40 frames around the break of all five at once (tick + render each), mid tier
    const tm = await page.evaluate(() => { const F = window.__F, sc = window.__v2.scene, g = window.__game, out = { before: [], after: [] }; const fr = () => { const t0 = performance.now(); F.hook(); g.tick(1 / 60); g.render(); sc.glr.gl.finish(); return performance.now() - t0; };
      for (let i = 0; i < 40; i++) out.before.push(fr()); sc.sim.breakAt(sc.sim.hero.x, sc.sim.hero.z, 90, 'c3'); for (let i = 0; i < 40; i++) out.after.push(fr());
      const med = (a) => { const b = [...a].sort((p, q) => p - q); return +b[b.length >> 1].toFixed(2); }, mx = (a) => +Math.max(...a).toFixed(2);
      return { before: { med: med(out.before), max: mx(out.before) }, after: { med: med(out.after), max: mx(out.after), first: +out.after[0].toFixed(2) }, peak: sc.brk.shPeak, shards: sc.brk.shN, tris: Math.round(sc.brk.stat.tris), draws: sc.brk.stat.draws, tier: sc.perf.tier }; });
    console.log(JSON.stringify({ five: tm })); await shot('five_1', clip); await T(12); await shot('five_2', clip); await T(30); await shot('five_3', clip);
  } else if (PLAN === 'areas') {
    const st = await page.evaluate(() => { const sc = window.__v2.scene, s = sc.brk.stat; window.__F.tick(4); return { area: sc.area.id, n: sc.sim.breakables.length, draws: s.draws, tris: Math.round(s.tris), gl: window.__v2.stats.gl.draws, glTris: window.__v2.stats.gl.tris }; });
    console.log(JSON.stringify({ areas: st }));
    const groups = await page.evaluate(() => { const L = window.__v2.scene.sim.breakables, out = []; for (const b of L) { let g = out.find((q) => Math.hypot(q.x - b.x, q.z - b.z) < 260 && Math.abs(q.y - b.y) < 60); if (!g) out.push(g = { x: b.x, z: b.z, y: b.y, n: 0 }); g.n++; } return out; });
    let i = 0; for (const gq of groups) { await page.evaluate(([x, z]) => { const F = window.__F; F.put(x - 80, z - 90, 1, 0.6); F.tick(40); }, [gq.x, gq.z]); await shot(`area_${AREA}_${i++}`); }
  } else if (PLAN === 'hud') {
    await page.evaluate(() => { const F = window.__F, sc = window.__v2.scene; F.peace = false; F.hook(); });
    await T(30); await shot(`hud_${DEV}_0`);
    await page.evaluate(() => { const sc = window.__v2.scene, h = sc.sim.hero; for (let i = 0; i < 4; i++) sc.sim.hooks.pickup('coin', 1, h); }); await T(8); await shot(`hud_${DEV}_1`); await T(30); await shot(`hud_${DEV}_2`);
    await page.evaluate(() => { const sc = window.__v2.scene, h = sc.sim.hero; for (let i = 0; i < 23; i++) sc.sim.hooks.pickup('coin', 1, h); }); await T(40); await shot(`hud_${DEV}_3`); await T(400); await shot(`hud_${DEV}_4_faded`);
  }
} catch (e) { console.error('FAILED', e); code = 1; } finally { await browser.close(); srv.close(); }
if (errs.length) { console.log('PAGE ERRORS:\n' + errs.join('\n')); code = 1; } else console.log('no page errors');
process.exit(code);
