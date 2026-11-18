// Main-session look check: stills of chosen spots in the real scene (v2g, ?area=<id>, no story).
// The hero is put at each spot facing a direction, the scene runs a moment so the camera settles, and a still is saved.
//   node tools/v2/spot_shot.mjs --area graveyard_now --spots "gate_s:600,860,0,1;gate_n:600,1010,0,-1" [--device fold_open] [--out /tmp/claude-0/v2/main/spots]
//        [--flags gate_open,promise] [--tier mid] [--quiet 1 = enemies are put to sleep far away] [--frames 3 = stills 0.2 s apart per spot]
// One browser, one page. Every picture is checked for a lost WebGL context before it is written. Prints one JSON line per picture.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/main/spots'), AREA = String(args.area || 'eshville_now');
const TIER = String(args.tier || 'mid'), QUIET = String(args.quiet ?? '1') !== '0', FRAMES = Math.max(1, Number(args.frames ?? 1));
const FLAGS = args.flags && args.flags !== true ? String(args.flags).split(',').filter(Boolean) : [];
const SPOTS = String(args.spots || '').split(';').filter(Boolean).map((s, i) => {
  const [name, rest] = s.includes(':') ? s.split(':') : ['s' + i, s]; const [x, z, dx = 1, dz = 0] = rest.split(',').map(Number);
  return { name, x, z, dx, dz };
});
if (!SPOTS.length) { console.error('no --spots given'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = []; let code = 0;

function install(flags, quiet) {
  const v = window.__v2, sc = v.scene, g = window.__game; g._pageHidden = true;
  const F = (window.__F = { n: 0 });
  if (flags.length && typeof sc.setWorldFlags === 'function') { const o = { ...(sc.worldFlags || {}) }; for (const f of flags) o[f] = true; sc.setWorldFlags(o); }
  F.tick = (n = 1) => { for (let i = 0; i < n; i++) { const h = sc.sim?.hero; if (h) h.hp = h.hpMax ?? h.hp; if (quiet && sc.sim) for (const e of sc.sim.enemies) { if (!e.dead && e.awake !== undefined) e.awake = false; } g.tick(1 / 60); F.n++; if (F.n % 6 === 0) g.render(); } g.render(); };
  F.put = (x, z, dx = 1, dz = 0) => {
    const sim = sc.sim, h = sim.hero, B = sc.W.boxes; let gy = -Infinity;
    for (const b of B) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 > gy && b.y1 < 2000) gy = b.y1; }
    h.x = x; h.z = z; if (Number.isFinite(gy)) h.y = gy; h.vx = 0; h.vz = 0; h.vy = 0; h.onGround = true; h.move = null; h.act = null; h.dashT = 0;
    const l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; if (h.wishX !== undefined) { h.wishX = 0; h.wishZ = 0; } if (sc.heroA) { sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ; }
    if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; } h._px = h.x; h._py = h.y; h._pz = h.z; sc.visY = sc.visYP = h.y; if (sc.cam) sc.cam.snap = true; sc._whipReset = true;
  };
  F.info = () => { const h = sc.sim.hero; return { hero: [Math.round(h.x), Math.round(h.y), Math.round(h.z)], area: v.area, tier: sc.perf?.tier, lost: sc.glr.gl.isContextLost(), draws: v.stats?.draws ?? null, tris: v.stats?.tris ?? null }; };
  return { ready: v.ready, area: v.area };
}

try {
  const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${AREA}&v2auto=0&v2tier=${TIER}&v2story=0`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 }).catch(() => {});
  const st = await page.evaluate(() => ({ ready: window.__v2?.ready, error: String(window.__v2?.error ?? '') }));
  if (!st.ready) throw new Error('scene not ready: ' + st.error);
  await page.evaluate(([f, q]) => (0, eval)('(' + window.__spotInstall + ')')(f, q), [FLAGS, QUIET]).catch(() => null);
  await page.evaluate(`window.__spotInstall = ${install.toString()}; (${install.toString()})(${JSON.stringify(FLAGS)}, ${QUIET})`);
  if (FLAGS.length) await page.evaluate(async () => { for (let i = 0; i < 40; i++) { window.__F.tick(6); await new Promise((r) => setTimeout(r, 50)); if (!window.__v2.scene.xing && !window.__v2.scene._rebuilding) break; } });
  for (const s of SPOTS) {
    await page.evaluate(([x, z, dx, dz]) => { const F = window.__F; F.put(x, z, dx, dz); F.tick(50); }, [s.x, s.z, s.dx, s.dz]);
    for (let k = 0; k < FRAMES; k++) {
      if (k) await page.evaluate(() => window.__F.tick(12));
      const info = await page.evaluate(() => window.__F.info());
      if (info.lost) { errs.push('context lost at ' + s.name); code = 1; break; }
      const f = `${OUT}/${AREA}_${s.name}${FRAMES > 1 ? '_' + k : ''}.png`;
      await page.screenshot({ path: f });
      console.log(JSON.stringify({ spot: s.name, file: f, ...info }));
    }
  }
} catch (e) { errs.push('[tool] ' + (e.stack || e.message)); code = 1; }
await browser.close(); srv.close?.();
if (errs.length) { console.log('ERRORS:'); for (const e of errs.slice(0, 20)) console.log('  ' + e); if (errs.some((e) => e.startsWith('[pageerror]') || e.startsWith('[tool]'))) code = 1; }
console.log(code ? 'FAIL' : 'OK');
process.exit(code);
