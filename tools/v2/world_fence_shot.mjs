// FENCE: push the hero into the iron railing of the main street and the wooden picket fence of the outskirts of eshville_now (the owner's two
// screenshots, 11-18) with TRUSTED touches (CDP) on the virtual stick, from every side the hero can reach; capture each push and measure how far
// the body circle (r 14) reaches into the drawn bars.
//   node tools/v2/world_fence_shot.mjs [--mode after|before] [--out /tmp/claude-0/v2/fence] [--dev fold_open] [--res 0.6]
//   --mode before serves src/v2/env/{build,kit,props2}.js as they were in commit 66ab4ef (before the fix) - nothing on disk changes.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const MODE = String(args.mode || 'after'), OUT = String(args.out || '/tmp/claude-0/v2/fence'), DEV = String(args.dev || 'fold_open'), RES = Number(args.res ?? 0.6);
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
fs.mkdirSync(OUT, { recursive: true });
// the drawn bars (kit railing / woodFence): iron posts' caps 3.6 across, wooden posts 3.5
const FENCES = { iron: { x0: 1860, x1: 2180, z: 5, hw: 3.6 }, wood: { x0: 80, x1: 420, z: 6, hw: 3.5 } };
const pen = (f, x, z) => { const e = f.box ? 0 : f.hw, dx = Math.max(f.x0 - e - x, 0, x - f.x1 - e), dz = Math.max(f.z - f.hw - z, 0, z - f.z - f.hw); return +(14 - Math.hypot(dx, dz)).toFixed(1); };
// [name, fence, start x, start z, stick dx, stick dy (screen: +y = down = towards the camera = -z)]
const PUSH = [
  ['iron_in', 'iron', 2020, 70, 0, 1, 1200], ['iron_in_left', 'iron', 2060, 60, -0.7, 0.7, 450], ['iron_in_right', 'iron', 1980, 60, 0.7, 0.7, 450],
  ['iron_end_w', 'iron', 1800, 16, 1, 0.15, 900], ['iron_end_e', 'iron', 2240, 16, -1, 0.15, 900],
  ['wood_in', 'wood', 250, 70, 0, 1, 1200], ['wood_in_left', 'wood', 290, 60, -0.7, 0.7, 450], ['wood_in_right', 'wood', 210, 60, 0.7, 0.7, 450],
  ['wood_end_w', 'wood', 20, 16, 1, 0.15, 900], ['wood_end_e', 'wood', 480, 16, -1, 0.15, 900],
  // the church front: the low wall with piers and railing left of the stair (its pier fin stood 11-14 over the side the hero walks along), and the stair's left cheek
  ['lowwall_side', 'lowwall', 3720, 1050, -1, 0, 900], ['cheek_up', 'cheek', 3720, 1080, -0.45, -1, 1200],
];
// the pier fin / cap (before) reached x 3671 / 3674 along z 985..1257; the cheek's band is x 3658..3671 (both drawn from x 3660 on)
FENCES.lowwall = { x0: 3658, x1: MODE === 'before' ? 3674 : 3668, z: 1120, hw: 135, box: true };   // after: no fin, the side piers' caps reach 3668
FENCES.cheek = { x0: 3658, x1: 3671, z: 1175, hw: 77, box: true };

const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const out = { mode: MODE, dev: DEV, pushes: [] };
try {
  const ctx = await browser.newContext({ ...contextOptions(DEV), serviceWorkers: 'block' }), page = await ctx.newPage();   // (a service worker would answer the module requests past page.route)
  if (MODE === 'before') for (const f of ['build.js', 'kit.js', 'props2.js']) {
    const body = execFileSync('git', ['show', '66ab4ef:src/v2/env/' + f], { encoding: 'utf8' });
    await page.route('**/src/v2/env/' + f + '*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body }));
  }
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=eshville_now&v2story=0&v2auto=0&v2res=${RES}`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 });
  await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 15000 }).catch(() => {});
  const cdp = await ctx.newCDPSession(page), T = new Touch(cdp, page);
  await ensureTouchMode(T, page); await page.waitForTimeout(300);
  const vp = await page.evaluate(() => [innerWidth, innerHeight]), sx = Math.round(vp[0] * 0.2), sy = Math.round(vp[1] * 0.62);
  for (const [name, fk, X, Z, dx, dy, HOLD] of PUSH) {
    await page.evaluate(([x, z]) => { const sc = window.__v2.scene, h = sc.sim.hero; for (const e of sc.sim.enemies ?? []) { e.active = false; } h.x = x; h.z = z; h._px = x; h._pz = z; h.vx = 0; h.vz = 0; h.ifr = 999; sc.cam.snap = true; }, [X, Z]);
    await page.waitForTimeout(500);
    await T.down(21, sx, sy); await page.waitForTimeout(40);
    for (let i = 1; i <= 5; i++) { await T.move(21, Math.round(sx + dx * 11 * i), Math.round(sy + dy * 11 * i)); await page.waitForTimeout(25); }
    let worst = -14, samples = 0; const t0 = Date.now();
    while (Date.now() - t0 < HOLD) { const h = await page.evaluate(() => ({ x: window.__v2.hero.x, z: window.__v2.hero.z })); worst = Math.max(worst, pen(FENCES[fk], h.x, h.z)); samples++; await page.waitForTimeout(60); }
    const h = await page.evaluate(() => { const v = window.__v2, h = v.hero, p = v.project(h.x, h.y + 46, h.z); return { x: h.x, z: h.z, y: h.y, p }; });
    const vpw = vp[0], vph = vp[1], cw = Math.min(560, vpw), ch = Math.min(420, vph), cx = Math.max(0, Math.min(vpw - cw, Math.round((h.p?.x ?? vpw / 2) - cw / 2))), cy = Math.max(0, Math.min(vph - ch, Math.round((h.p?.y ?? vph / 2) - ch / 2)));
    const file = `${OUT}/${MODE}_${name}.png`;
    await page.screenshot({ path: file, clip: { x: cx, y: cy, width: cw, height: ch } });
    await T.up(21); await page.waitForTimeout(200);
    const r = { name, fence: fk, from: [X, Z], stick: [dx, dy], end: [Math.round(h.x * 10) / 10, Math.round(h.z * 10) / 10], overlapNow: pen(FENCES[fk], h.x, h.z), overlapWorst: worst, samples, file };
    out.pushes.push(r);
    console.log(`${MODE} ${name.padEnd(14)} from (${X},${Z}) stick (${dx},${dy}) -> hero (${r.end}) body circle into the drawn bars: ${r.overlapNow} (worst while pushing ${worst})`);
  }
  out.errors = await page.evaluate(() => window.__v2.error ?? null);
} finally { await browser.close(); srv.close?.(); }
fs.writeFileSync(`${OUT}/shot_${MODE}.json`, JSON.stringify(out, null, 1));
const bad = out.pushes.filter((p) => p.overlapWorst > 0.5);
console.log(`${MODE}: ${out.pushes.length} pushes, ${bad.length} with the body inside the bars`);
process.exit(0);
