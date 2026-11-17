// PROPS lane: captures of props next to the 3D hero at Fold size (scene v2c ?area=<id>), for judging and for the owner sheet.
//   node tools/v2/world_props_shot.mjs --out <dir> [--spots '[["name","area",x,z],...]' | --set props|wide|tex] [--pack <dir with props.bin + props_atlas.webp>] [--env <dir with k_*.webp>] [--numbers file.json]
// --pack / --env: the page gets these files instead of assets/v2/props/* and assets/v2/env/* (test a scratch build without touching the shipped files).
// One browser, one page per area. Software WebGL: frame times mean nothing here.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { freeze } from '../qa/lib/step.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const OUT = String(args.out || '/tmp/claude-0/v2/props/shots_game');
export const SETS = {
  props: [
    ['angel', 'graveyard_now', 275, 1480], ['gargoyle', 'graveyard_now', 520, 1960], ['deadtree', 'graveyard_now', 275, 1010], ['cross', 'graveyard_now', 715, 1215], ['coffin', 'graveyard_now', 690, 1690],
    ['graves', 'graveyard_now', 520, 1180], ['mausoleum', 'graveyard_now', 600, 1900], ['niche', 'graveyard_now', 330, 1990], ['cemgate', 'graveyard_now', 600, 860], ['lanternpost', 'graveyard_now', 600, 1040],
    ['bell', 'eshville_now', 4100, 1410], ['brazier', 'eshville_now', 3760, 1550], ['wreck', 'eshville_now', 545, 205], ['cart', 'eshville_now', 925, 205], ['goods', 'eshville_now', 1040, 205], ['well', 'eshville_now', 3995, 410],
    ['esh_graves', 'eshville_now', 4310, 1130], ['fire', 'eshville_now', 2400, 180],
    ['stall', 'eshville_past', 2135, 205], ['plaguepost', 'eshville_past', 1215, 210], ['past_lantern', 'eshville_past', 700, 210],
    ['s0_angel', 'slice0', 2120, 1160], ['s0_fountain', 'slice0', 1740, 1150], ['s0_gargoyle', 'slice0', 2080, 2080], ['s0_cart', 'slice0', 340, 180],
  ],
  wide: [
    ['w_esh_now_1', 'eshville_now', 330, 150], ['w_esh_now_2', 'eshville_now', 3900, 640], ['w_esh_now_3', 'eshville_now', 3900, 1440],
    ['w_esh_past_1', 'eshville_past', 1840, 150], ['w_esh_past_2', 'eshville_past', 3900, 640], ['w_esh_past_3', 'eshville_past', 4590, 1090],
    ['w_grv_now_1', 'graveyard_now', 600, 300], ['w_grv_now_2', 'graveyard_now', 600, 1300], ['w_grv_now_3', 'graveyard_now', 600, 1860],
    ['w_grv_past_1', 'graveyard_past', 600, 1010], ['w_grv_past_2', 'graveyard_past', 300, 1150], ['w_grv_past_3', 'graveyard_past', 600, 1860],
    ['w_s0_1', 'slice0', 420, 150], ['w_s0_2', 'slice0', 2190, 1250], ['w_s0_3', 'slice0', 2190, 1860],
  ],
};
const spots = args.spots ? JSON.parse(String(args.spots)) : String(args.set || 'props').split(',').flatMap((s) => SETS[s]);
if (import.meta.url === `file://${process.argv[1]}`) {
  fs.mkdirSync(OUT, { recursive: true });
  const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port), numbers = {};
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const byArea = new Map(); for (const s of spots) (byArea.get(s[1]) ?? byArea.set(s[1], []).get(s[1])).push(s);
    for (const [area, list] of byArea) {
      const ctx = await browser.newContext(contextOptions('fold_open')), page = await ctx.newPage(), errs = [];
      page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 300)));
      page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`[http ${r.status()}] ${r.url().replace(/^.*localhost:\d+\//, '')}`); });
      const over = async (pattern, dir) => page.route(pattern, async (route) => { const f = path.join(dir, path.basename(new URL(route.request().url()).pathname)); if (fs.existsSync(f)) await route.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream' }); else await route.continue(); });
      if (args.pack) await over('**/assets/v2/props/*', String(args.pack));
      if (args.env) await over('**/assets/v2/env/*', String(args.env));
      const t0 = Date.now();
      await page.goto(`http://localhost:${port}/index.html?scene=v2c&area=${area}&peace=1&areanav=0&nosw`);
      await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 });
      await page.waitForTimeout(600); await freeze(page);
      for (const [name, , x, z] of list) {
        const r = await page.evaluate(([x, z]) => {
          const v = window.__v2, sc = v.scene, h = sc.sim.hero;
          h.x = x; h.z = z; h.y = 300; h.vx = h.vz = h.vy = 0; h.onGround = false; h.safe = { x, z, y: 0 }; sc.cam.snap = true; if (sc.areaState) sc.areaState.in = {};
          window.__qaStep(50, false); window.__qaStep(1, true); const st = v.stats;
          return { x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), draws: st.gl.draws, tris: st.gl.tris, staticTris: st.env?.visibleStaticTris ?? 0, staticDraws: st.env?.staticDraws ?? 0, texBytes: st.gl.texBytes, kitTexBytes: st.env?.kitTexBytes, allStatic: st.env?.staticTris, loadMs: st.env?.loadMs, compileMs: st.env?.compileMs };
        }, [x, z]);
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        numbers[name] = { area, ...r }; console.log(name, JSON.stringify(r));
      }
      console.log(`${area}: ${Date.now() - t0} ms, ${errs.length ? errs.join(' | ') : 'no page errors'}`);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
  if (args.numbers) fs.writeFileSync(String(args.numbers), JSON.stringify(numbers, null, 1));
}
