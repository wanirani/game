// WORLD-2 lane: captures of area spots next to the 3D hero at Fold size (scene v2c ?area=<id>&flags=a,b). The hero is put ON the ground of the spot
// (the older world_props_shot drops him from y 300, which is inside the slabs of the tower floors above that height).
//   node tools/v2/world2_shot.mjs --out <dir> --spots '[["name","area",x,z,"flag,flag"],...]' [--device fold_open] [--numbers file.json]
// One browser, one page per area + state. Software WebGL: frame times mean nothing here.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { freeze } from '../qa/lib/step.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const OUT = String(args.out || '/tmp/claude-0/v2/world2/shots'), spots = JSON.parse(String(args.spots || '[]')), DEV = String(args.device || 'fold_open');
fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port), numbers = {};
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
let bad = 0;
try {
  const groups = new Map(); for (const s of spots) { const k = s[1] + '|' + (s[4] ?? ''); (groups.get(k) ?? groups.set(k, []).get(k)).push(s); }
  for (const [key, list] of groups) {
    const [area, fl] = key.split('|'), ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage(), errs = [];
    page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 300)));
    page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`[http ${r.status()}] ${r.url().replace(/^.*localhost:\d+\//, '')}`); });
    await page.goto(`http://localhost:${port}/index.html?scene=v2c&area=${area}&peace=1&areanav=0&nosw${fl ? '&flags=' + fl : ''}${args.hud === '0' ? '&hud=0' : ''}`);
    await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 });
    await page.waitForTimeout(600); await freeze(page);
    for (const [name, , x, z] of list) {
      const r = await page.evaluate(([x, z]) => {
        const v = window.__v2, sc = v.scene, h = sc.sim.hero; let g = -1e9;
        for (const b of sc.W.boxes) if (b.walk && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.y1 > g) g = b.y1;
        h.x = x; h.z = z; h.y = g + 1; h.vx = h.vz = h.vy = 0; h.onGround = false; h.safe = { x, z, y: g }; sc.cam.snap = true; if (sc.areaState) sc.areaState.in = {};
        window.__qaStep(40, false); window.__qaStep(1, true); const st = v.stats;
        return { x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), draws: st.gl.draws, tris: st.gl.tris, staticTris: st.env?.visibleStaticTris ?? 0, staticDraws: st.env?.staticDraws ?? 0, chunks: st.env?.visibleChunks ?? 0, texMB: +(st.gl.texBytes / 1048576).toFixed(1), kitTexMB: +((st.env?.kitTexBytes ?? 0) / 1048576).toFixed(1), allStatic: st.env?.staticTris };
      }, [x, z]);
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      numbers[name] = { area, flags: fl, ...r }; console.log(name, JSON.stringify(r));
    }
    console.log(`${key}: ${errs.length ? errs.join(' | ') : 'no page errors'}`); bad += errs.length;
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }
if (args.numbers) fs.writeFileSync(String(args.numbers), JSON.stringify(numbers, null, 1));
process.exit(bad ? 1 : 0);
