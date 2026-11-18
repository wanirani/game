// v2g numbers per spot (INTEGRATE-A): draw calls, triangles, characters drawn / skipped, effect anchors, texture memory in real areas
// with the full cast (every person shown, enemies where the area puts them; one extra row with the square arena awake around the hero).
//   node tools/v2/game_spots.mjs [--device fold_open] [--areas eshville_now,graveyard_now,eshville_past] [--json out.json] [--shots dir]
// Headless Chromium = software renderer: counts and bytes are the same on a device, frame times are not measured here.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.device || 'fold_open'), AREAS = String(args.areas || 'eshville_now,graveyard_now').split(','), SHOTS = args.shots ? String(args.shots) : null;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const SPOTS = {
  eshville_now: [['outskirts start', 160, 150], ['outskirts', 900, 150], ['street by the inn', 1800, 200], ['street by the smithy', 2600, 200], ['square entrance', 3400, 200], ['square (well)', 3900, 330], ['square east', 4350, 700], ['church front', 3900, 1320], ['grave road', 4590, 1120]],
  eshville_past: [['outskirts start', 160, 150], ['street by the tavern', 1800, 200], ['square (well)', 3900, 330], ['church front', 3900, 1320]],
  graveyard_now: [['road', 600, 250], ['road (bats)', 600, 560], ['gate', 600, 940], ['field', 600, 1300], ['mausoleum', 600, 1860]],
  graveyard_past: [['road', 600, 250], ['gate', 600, 940], ['field', 600, 1300]],
};
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port), report = {};
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
try {
  for (const area of AREAS) {
    const page = await (await browser.newContext(contextOptions(DEV))).newPage(), errs = [];
    page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${area}&v2auto=0`);
    await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 90000 }).catch(() => errs.push('ready timeout'));
    const rows = [];
    const measure = (name, x, z, wake) => page.evaluate(([name, x, z, wake]) => {
      const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim, h = sim.hero; g._pageHidden = true;
      sc.storyFlag = () => true;                                  // the full cast: every person of the area stands
      h.x = x; h.z = z; h.y = 400; h.vx = h.vz = h.vy = 0; h.onGround = false; if (h.safe) { h.safe.x = x; h.safe.z = z; } sc.cam.snap = true;
      if (wake) { let n = 0; for (const e of sim.enemies) if (e.yard && !e.dead) { e.active = true; const a = n++ * 1.3; e.x = x + Math.cos(a) * 170; e.z = z + Math.sin(a) * 120; } }
      let md = 0, mt = 0, mc = 0, mdr = 0, mp = 0, ml = 0;
      for (let i = 0; i < 90; i++) { g.tick(1 / 60); if (i % 6 === 5) { g.alpha = 1; g.render(); const G = sc.glr.stats, d = G.draws + (sc.fx?.stats.draws ?? 0); md = Math.max(md, d); mt = Math.max(mt, G.tris); mc = Math.max(mc, sc.c3.tris); mdr = Math.max(mdr, sc.c3.drawn); mp = Math.max(mp, sc.fx?.particles.count ?? 0); ml = Math.max(ml, sc.fx?.lights.count ?? 0); } }
      const s = v.stats;
      return { name, x, z, draws: md, tris: Math.round(mt), worldTris: s.world.tris, worldDraws: s.world.draws, charTris: Math.round(mc), drawn: mdr, culled: s.chars.culled, people: s.people.drawn, anchorsLive: s.anchors.live, fires: s.anchors.lit, particles: mp, lights: ml, texMB: s.gl.texMB, charTexMB: +(s.chars.texBytes / 1048576).toFixed(1), worldTexMB: +(s.world.texBytes / 1048576).toFixed(1), bufMB: +(s.gl.bufBytes / 1048576).toFixed(1), canvas: s.gl.canvas, models: s.chars.models.length };
    }, [name, x, z, wake]);
    for (const [name, x, z] of SPOTS[area] ?? []) { const r = await measure(name, x, z, false); rows.push(r); if (SHOTS) { await page.waitForTimeout(100); await page.screenshot({ path: `${SHOTS}/spot_${area}_${name.replace(/[^a-z]+/g, '_')}.png` }); } }
    if (area === 'eshville_now') { const r = await measure('square fight (arena awake around the hero)', 3900, 330, true); rows.push(r); if (SHOTS) { await page.waitForTimeout(100); await page.screenshot({ path: `${SHOTS}/spot_${area}_fight.png` }); } }
    report[area] = { rows, errors: errs };
    console.log(`\n[${area}] ${DEV} · 3D canvas ${rows[0]?.canvas?.join('x')} · textures ${rows[0]?.texMB} MB (world ${rows[0]?.worldTexMB} + characters ${rows[0]?.charTexMB} + effects) · vertex buffers ${rows[0]?.bufMB} MB · ${rows[0]?.models} character models loaded`);
    console.log('  spot                                         draws   triangles (world + characters)   chars drawn/skipped  people  fires(lit)  particles');
    for (const r of rows) console.log(`  ${r.name.padEnd(44)} ${String(r.draws).padStart(5)}   ${String(r.tris).padStart(7)} (${r.worldTris} + ${r.charTris})`.padEnd(86) + `${r.drawn}/${r.culled}`.padEnd(21) + `${r.people}`.padEnd(8) + `${r.anchorsLive}(${r.fires})`.padEnd(12) + r.particles);
    if (errs.length) console.log('  PAGE ERRORS: ' + errs.slice(0, 3).join(' | '));
    await page.context().close();
  }
} finally { await browser.close(); srv.close(); }
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1));
