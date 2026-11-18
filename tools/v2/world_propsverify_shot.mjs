// PROPS-VERIFY (browser, scene v2c ?area=<id>, software WebGL - frame times mean nothing here): an independent look at the baked props.
//   node tools/v2/world_propsverify_shot.mjs --mode shots [--device fold_open] [--out dir] [--areas a,b] [--per 2] [--pack dir] [--env dir]
//        every prop kind of every area next to the hero from the play camera (<area>__<kind>_<n>.png) and close up (…_near.png)
//   node tools/v2/world_propsverify_shot.mjs --mode touch [--json file]
//        REAL touch (CDP touch events on the virtual stick): the hero walks into one prop of every kind from four sides;
//        where he stops is compared with the visible shape at hero height (overlap > 0 = his body is inside the model, < 0 = air wall)
//   --spots '[["name","area",x,z,distK?],…]'  extra fixed spots for --mode shots (distK < 1 moves the camera closer)
// --pack / --env: the page gets these files instead of assets/v2/props/* and assets/v2/env/* (scratch builds).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';
import { freeze } from '../qa/lib/step.mjs';
import { loadPropsNode } from './world_node.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const MODE = String(args.mode || 'shots'), DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/propsverify/shots'), PER = Number(args.per ?? 1);
const LIST = String(args.areas || 'eshville_now,eshville_past,graveyard_now,graveyard_past,slice0').split(',');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
fs.mkdirSync(OUT, { recursive: true });
if (args.pack) process.env.BN_PROPS_PACK = path.join(String(args.pack), 'props.bin');
loadPropsNode();
const { AREAS } = await import('../../src/v2/world/index.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const { propPack } = await import('../../src/v2/env/baked.js');
const PK = propPack();
/** visible extents of a pack prop below hero height (80 in the rules), unit scale */
function lowBox(name) {
  const d = PK.head.props[name]; if (!d) return null;
  const qp = new Int16Array(PK.ab, PK.base + d.pos, d.nv * 3), b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, d };
  for (let i = 0; i < d.nv; i++) { const v = [0, 1, 2].map((k) => d.lo[k] + ((qp[i * 3 + k] + 32768) / 65535) * (d.hi[k] - d.lo[k])); if (v[1] > 80 || v[1] < 6) continue; b.x0 = Math.min(b.x0, v[0]); b.x1 = Math.max(b.x1, v[0]); b.z0 = Math.min(b.z0, v[2]); b.z1 = Math.max(b.z1, v[2]); }
  return b;
}
const TOMB = { round: 'tomb_a', point: 'tomb_b', broken: 'tomb_c', cross: 'tomb_d' };
const PLAN = {};
for (const id of LIST) {
  const a = await AREAS[id](), W = compileEnv(a.stage), sp = a.spawns.default, grid = reachGrid(W, sp.x, sp.z, 14), parts = [];
  const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(walk); return; } if (typeof o.mesh === 'string' && (o.t === 'prop' || o.t === 'deco') && typeof o.x === 'number') parts.push(o); for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v); };
  walk(a.stage);
  const kinds = new Map();
  for (const p of parts) { const k = p.mesh + (p.kind ? '-' + p.kind : '') + (p.code ? '-code' : ''); (kinds.get(k) ?? kinds.set(k, []).get(k)).push(p); }
  const spots = [];
  for (const [k, list] of kinds) {
    let n = 0;
    for (const p of list) {
      if (n >= PER) break;
      // a standable spot beside / in front of the prop
      const cand = [[p.x + 70, p.z - 30], [p.x - 70, p.z - 30], [p.x + 40, p.z - 70], [p.x - 40, p.z - 70], [p.x + 100, p.z], [p.x - 100, p.z], [p.x, p.z - 110], [p.x + 90, p.z + 40], [p.x - 90, p.z + 40], [p.x, p.z - 170], [p.x + 160, p.z - 60], [p.x - 160, p.z - 60]];
      const c = cand.find(([x, z]) => grid.reachable(x, z)); if (!c) continue;
      spots.push({ name: `${k}_${n}`, kind: k, part: { mesh: p.mesh, kind: p.kind, code: !!p.code, t: p.t, x: p.x, z: p.z, h: p.h, flip: !!p.flip }, x: c[0], z: c[1] }); n++;
    }
  }
  PLAN[id] = { spots, grid };
}
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port), report = {};
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const place = (page, x, z, ticks = 40, distK = 1) => page.evaluate(([x, z, ticks, distK]) => {
  const v = window.__v2, sc = v.scene, h = sc.sim.hero;
  h.x = x; h.z = z; h.y = 300; h.vx = h.vz = h.vy = 0; h.onGround = false; h.safe = { x, z, y: 0 }; sc.cam.snap = true; if (sc.areaState) sc.areaState.in = {};
  window.__qaStep(ticks - 1, false);
  const R = sc._sec?.cam, keep = R ? [R.dist, R.lookY] : null;
  if (R && distK !== 1) { R.dist *= distK; R.lookY = R.lookY * 0.6 + 40; sc.cam.snap = true; window.__qaStep(1, false); sc.cam.snap = true; }
  window.__qaStep(1, true);
  if (R && distK !== 1) { R.dist = keep[0]; R.lookY = keep[1]; }
  const st = v.stats;
  return { x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), draws: st.gl.draws, staticTris: st.env?.visibleStaticTris ?? 0, texMB: +(st.gl.texBytes / 1048576).toFixed(1) };
}, [x, z, ticks, distK]);
try {
  for (const id of LIST) {
    const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage(), errs = [];
    page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 300)));
    page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`[http ${r.status()}] ${r.url().replace(/^.*localhost:\d+\//, '')}`); });
    const over = async (pattern, dir) => page.route(pattern, async (route) => { const f = path.join(dir, path.basename(new URL(route.request().url()).pathname)); if (fs.existsSync(f)) await route.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.webp') ? 'image/webp' : 'application/octet-stream' }); else await route.continue(); });
    if (args.pack) await over('**/assets/v2/props/*', String(args.pack));
    if (args.env) await over('**/assets/v2/env/*', String(args.env));
    await page.goto(`http://localhost:${port}/index.html?scene=v2c&area=${id}&peace=1&areanav=0&nosw`);
    await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 });
    const cdp = await ctx.newCDPSession(page), t = new Touch(cdp, page);
    await page.waitForTimeout(600); if (MODE === 'touch') { await ensureTouchMode(t, page); await page.waitForTimeout(200); }
    await freeze(page);
    const R = (report[id] = {});
    if (MODE === 'shots') {
      const extra = args.spots ? JSON.parse(String(args.spots)).filter((s) => s[1] === id).map(([name, , x, z, distK]) => ({ name, x, z, distK: distK ?? 1, fixed: true })) : [];
      for (const s of args.only === 'spots' ? extra : [...PLAN[id].spots, ...extra]) {
        if (s.fixed) { const r = await place(page, s.x, s.z, 50, s.distK); await page.waitForTimeout(80); await page.screenshot({ path: path.join(OUT, `${id}__${s.name}.png`) }); R[s.name] = r; continue; }
        const r = await place(page, s.x, s.z, 50); await page.waitForTimeout(80); await page.screenshot({ path: path.join(OUT, `${id}__${s.name}.png`) });
        const n = await place(page, s.x, s.z, 4, 0.42); await page.waitForTimeout(80); await page.screenshot({ path: path.join(OUT, `${id}__${s.name}_near.png`) });
        R[s.name] = { ...r, part: s.part, near: n.staticTris }; console.log(id, s.name, JSON.stringify(s.part), '-> hero', r.x, r.z, r.y);
      }
    } else if (MODE === 'touch') {
      const [vw, vh] = await page.evaluate(() => [innerWidth, innerHeight]), sx = Math.round(vw * 0.2), sy = Math.round(vh * 0.68);
      const axis = async (ax, az) => { if (!t.active.has(21)) await t.down(21, sx, sy); await t.move(21, sx + ax * 70, sy - az * 70); };
      for (const s of PLAN[id].spots) {
        const p = s.part, name = p.mesh === 'grave' || p.mesh === 'tomb' ? (TOMB[p.kind] ?? (p.mesh === 'tomb' ? 'tomb_a' : null)) : p.mesh, lb = !p.code && name ? lowBox(name) : null;
        if (!lb || p.t !== 'prop') continue;
        const sc = (p.h ?? lb.d.h) / lb.d.h, fl = p.flip ? -1 : 1, vx0 = p.x + Math.min(lb.x0 * fl, lb.x1 * fl) * sc, vx1 = p.x + Math.max(lb.x0 * fl, lb.x1 * fl) * sc, vz0 = p.z + lb.z0 * sc, vz1 = p.z + lb.z1 * sc;
        const res = {};
        for (const [side, ax, az, x, z] of [['W', 1, 0, vx0 - 50, p.z], ['E', -1, 0, vx1 + 50, p.z], ['S', 0, 1, p.x, vz0 - 50], ['N', 0, -1, p.x, vz1 + 50]]) {
          if (!PLAN[id].grid.reachable(x, z)) { res[side] = 'no ground'; continue; }
          const a = await place(page, x, z, 30); if (Math.abs(a.x - x) > 4 || Math.abs(a.z - z) > 4) { res[side] = 'start pushed'; continue; }
          await axis(ax, az); await page.evaluate(() => window.__qaStep(70, false)); const b = await page.evaluate(() => { const h = window.__v2.scene.sim.hero; return { x: h.x, z: h.z }; }); await t.upAll(); await page.evaluate(() => window.__qaStep(3, false));
          // overlap of the hero's body (r 14) with the visible box along the push axis; > 0 = inside the model, < 0 = stopped in the air before it
          const ov = side === 'W' ? b.x + 14 - vx0 : side === 'E' ? vx1 - (b.x - 14) : side === 'S' ? b.z + 14 - vz0 : vz1 - (b.z - 14);
          const moved = Math.hypot(b.x - a.x, b.z - a.z);
          res[side] = moved > 110 ? `walked past (${Math.round(moved)})` : Math.round(ov);
        }
        R[s.name] = { name, at: [p.x, p.z], h: p.h, visibleLow: [Math.round(vx1 - vx0), Math.round(vz1 - vz0)], foot: lb.d.foot.map((f) => Math.round(f * 2 * sc)), res };
        console.log(`${id} ${s.name.padEnd(18)} visible ${Math.round(vx1 - vx0)}x${Math.round(vz1 - vz0)} foot ${lb.d.foot.map((f) => Math.round(f * 2 * sc)).join('x')}  overlap W ${res.W} · E ${res.E} · S(front) ${res.S} · N(back) ${res.N}`);
      }
    }
    console.log(`${id}: ${errs.length ? errs.join(' | ') : 'no page errors'}`); R._errs = errs;
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1));
