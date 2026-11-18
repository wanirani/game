// 카메라 따라붙기 (SPEED-FIRE): 본 게임 장면(v2g)에서 영웅을 오른쪽으로 끝까지 달리게 하고, 틱마다 영웅이 화면 가운데서 얼마나 처지는지(px)와
// 그 흔들림(틱 사이 변화)을 잰다. --before <commit> 이면 장면 파일(src/v2/game/index.js)만 그때 것으로 돌린다 (규칙 · 빠르기는 지금 것).
//   node tools/v2/speedfire_cam.mjs [--before f5c94c5] [--area eshville_now] [--x 1500 --z 150] [--shots /tmp/claude-0/v2/speedfire/cam]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const AREA = String(args.area || 'eshville_now'), X = Number(args.x ?? 1500), Z = Number(args.z ?? 150), SH = args.shots ? String(args.shots) : null, BEFORE = args.before ? String(args.before) : null;
if (SH) fs.mkdirSync(SH, { recursive: true });
const FILE = 'src/v2/game/index.js', OLD = BEFORE ? execFileSync('git', ['show', BEFORE + ':' + FILE], { encoding: 'utf8', maxBuffer: 1 << 26 }) : null;
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = []; let out = null;
try {
  const ctx = await browser.newContext({ ...contextOptions('fold_open'), serviceWorkers: 'block' }), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  if (OLD) await page.route('**/' + FILE, (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: OLD }));
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${AREA}&v2auto=0&nosw`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 }).catch(() => {});
  if (!(await page.evaluate(() => !!window.__v2?.ready))) throw new Error('scene not ready');
  out = await page.evaluate(([X, Z, shots]) => {
    const sc = window.__v2.scene, g = window.__game, sim = sc.sim, h = sim.hero; g._pageHidden = true;
    const hold = { mx: 0, mz: 0 }; const u0 = sim.update.bind(sim); sim.update = (dt, inp) => { if (inp) { inp.mx = hold.mx; inp.mz = hold.mz; } return u0(dt, inp); };
    for (const e of sim.enemies) { e.active = false; e.x += 9000; }
    h.x = X; h.z = Z; h.vx = h.vz = 0; h.dirX = 1; h.dirZ = 0; sc.cam.snap = true;
    for (let i = 0; i < 90; i++) g.tick(1 / 60);   // 서서 카메라가 자리 잡게
    const rows = [], W = g.viewW, cv = document.querySelector('canvas'), P = {};
    hold.mx = 1;
    for (let i = 0; i < 100; i++) {
      g.tick(1 / 60); g.alpha = 1; sc._matrix(W, g.viewH, 1); sc.project(h.x, h.y + 90, h.z, P);
      rows.push({ i, x: Math.round(h.x), v: Math.round(Math.hypot(h.vx, h.vz)), sx: +(P.x - W / 2).toFixed(1) });
    }
    hold.mx = 0;
    for (let i = 0; i < 60; i++) { g.tick(1 / 60); sc._matrix(W, g.viewH, 1); sc.project(h.x, h.y + 90, h.z, P); rows.push({ i: 100 + i, x: Math.round(h.x), v: Math.round(Math.hypot(h.vx, h.vz)), sx: +(P.x - W / 2).toFixed(1) }); }
    void cv; void shots;
    return { W, rows };
  }, [X, Z, SH]);
} catch (e) { errs.push('exception: ' + (e?.stack ?? e)); }
if (out) {
  const R = out.rows, run = R.filter((r) => r.i >= 40 && r.i < 100), stop = R.filter((r) => r.i >= 130);
  const lag = run.reduce((a, r) => a + r.sx, 0) / run.length, jit = Math.max(...run.slice(1).map((r, k) => Math.abs(Math.abs(r.sx - run[k].sx))));
  const peak = Math.max(...R.slice(0, 100).map((r) => r.sx)), rest = stop.reduce((a, r) => a + r.sx, 0) / stop.length;
  console.log(JSON.stringify({ before: BEFORE, area: AREA, viewW: out.W, speed: run[run.length - 1].v, lagPx: +lag.toFixed(1), lagPctOfHalfWidth: +((lag / (out.W / 2)) * 100).toFixed(1), peakPx: peak, jitterPxPerTick: +jit.toFixed(2), afterStopPx: +rest.toFixed(1) }));
  if (args.rows) console.log(R.map((r) => `${r.i}:${r.sx}`).join(' '));
}
console.log(errs.length ? errs.slice(0, 6).join('\n') : 'NO ERRORS');
await browser.close(); srv.close?.();
process.exit(errs.some((e) => /pageerror|exception/.test(e)) ? 1 : 0);
