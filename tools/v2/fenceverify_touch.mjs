// FENCE-VERIFY (11-18): adversarial trusted-touch check of the fences, railings, low walls, stair cheeks and cemetery gates of eshville_now and
// graveyard_now. Every case puts the hero near a piece and drives him with TRUSTED touches (CDP) on the virtual stick (and the roll / jump buttons):
// pushes at 90 / 60 / 30 / 0 degrees to the piece from both lateral sides (and from both faces where the far side is reachable), a roll and a jump
// into it, and a heavy knock-back into it (the rules' own hurtHero, knock 380 = the heaviest enemy blow). Each frame the hero's position is recorded
// in the page; the node side measures how deep the body circle (r 14, 92 high) reaches into the triangles the kit DRAWS for every fence-like piece
// (the same capture as world_fence_node.mjs). After each case the stick is pushed the other way: the hero must walk off (not stuck).
// Passages the fix narrowed (open graveyard gate, church stair between its cheeks, graveyard road) are walked through by touch.
//   node tools/v2/fenceverify_touch.mjs [--dev fold_open|phone2] [--areas eshville_now,graveyard_now] [--out /tmp/claude-0/v2/fenceverify] [--shots 1]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';
import { loadPropsNode } from './world_node.mjs';
loadPropsNode();
const { AREAS } = await import('../../src/v2/world/index.js');
const { reachGrid } = await import('../../src/v2/world/reach.js');
const { compileEnv } = await import('../../src/v2/env/build.js');
const { Geo } = await import('../../src/v2/env/geo.js');
const K = await import('../../src/v2/env/kit.js');
const { PROPS } = await import('../../src/v2/env/props.js');
await import('../../src/v2/env/props2.js'); await import('../../src/v2/env/props3.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.dev || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/fenceverify'), AREAS_L = String(args.areas || 'eshville_now,graveyard_now').split(','), SHOTS = String(args.shots ?? '1') !== '0';
const ONLY = args.only ? new RegExp(String(args.only)) : null, SHOT_RE = new RegExp(String(args.shotre || 'p90|knock|roll|jump|pass|end[we]$|_in$|cheek'));   // --only <regex>: run only the cases whose name matches; --shotre: which cases are captured (failures always)
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const HR = 14, HH = 92, TOL = 0.5;
fs.mkdirSync(OUT, { recursive: true });

// ── the drawn triangles of every fence-like piece (as world_fence_node.mjs) ──
class Cap extends Geo { constructor(W) { super(W, { cull: false }); this.T = []; } _emit(M, P) { const tri = (a, b, c) => this.T.push([a[0], a[2], b[0], b[2], c[0], c[2], Math.min(a[1], b[1], c[1]), Math.max(a[1], b[1], c[1]), [a, b, c]]); tri(P[0], P[1], P[2]); if (P.length === 4) tri(P[0], P[2], P[3]); this.tris++; } }
function clipY(V, lo, hi) { let poly = V; for (const [k, s] of [[lo, 1], [hi, -1]]) { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], da = (a[1] - k) * s, db = (b[1] - k) * s; if (da >= 0) out.push(a); if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); } } poly = out; if (poly.length < 3) return poly.length ? poly : null; } return poly; }
const segD2 = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz; let t = l > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const qx = ax + dx * t - px, qz = az + dz * t - pz; return qx * qx + qz * qz; };
function polyD(px, pz, Q) { let pos = 0, neg = 0, best = Infinity; for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length], c = (b[0] - a[0]) * (pz - a[2]) - (b[2] - a[2]) * (px - a[0]); if (c > 1e-9) pos++; else if (c < -1e-9) neg++; best = Math.min(best, segD2(px, pz, a[0], a[2], b[0], b[2])); } let area = 0; for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; area += a[0] * b[2] - b[0] * a[2]; } if (Math.abs(area) > 1e-6 && (pos === 0 || neg === 0)) return 0; return Math.sqrt(best); }
function triD(px, pz, t) { const [ax, az, bx, bz, cx, cz] = t, area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax); if (Math.abs(area) > 1e-6) { const s1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax), s2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx), s3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx); if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) return 0; } return Math.sqrt(Math.min(segD2(px, pz, ax, az, bx, bz), segD2(px, pz, bx, bz, cx, cz), segD2(px, pz, cx, cz, ax, az))); }
function pieces(S, W) {
  const out = [], cap = (kind, P, fn) => { const G = new Cap(W); fn(G); if (G.T.length) out.push({ kind, P, T: G.T }); };
  for (const P of S.parts) {
    const k = P.kit ?? {};
    if (P.t === 'fence') cap(P.kind === 'wood' ? 'fence.wood' : 'fence.iron', P, (G) => K.fenceAt(G, P));
    else if (P.t === 'wall' && (k.style === 'low' || k.rail || k.piers)) cap(k.rail ? 'lowwall.rail' : 'lowwall', P, (G) => K.dressWall(G, P, []));
    else if (P.t === 'block' && k.balustrade) cap('balustrade', P, (G) => K.balustrade(G, P));
    else if (P.t === 'stairs' && k.cheeks) cap('stair.cheeks', P, (G) => K.stairCheeks(G, P));
    else if ((P.t === 'deco' || P.t === 'prop') && P.mesh === 'cemgate') cap('gate', P, (G) => PROPS.cemgate(G, P.x, P.y ?? 0, P.z, P));
  }
  for (const p of out) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const t of p.T) { x0 = Math.min(x0, t[0], t[2], t[4]); x1 = Math.max(x1, t[0], t[2], t[4]); z0 = Math.min(z0, t[1], t[3], t[5]); z1 = Math.max(z1, t[1], t[3], t[5]); }
    p.bb = { x0, x1, z0, z1 }; p.grid = new Map(); p.over = p.kind === 'gate' ? (p.P.y ?? 0) + 110 : Infinity;
    p.T.forEach((t, i) => { const a = Math.floor(Math.min(t[0], t[2], t[4]) / 16), b = Math.floor(Math.max(t[0], t[2], t[4]) / 16), c = Math.floor(Math.min(t[1], t[3], t[5]) / 16), d = Math.floor(Math.max(t[1], t[3], t[5]) / 16); for (let i2 = a; i2 <= b; i2++) for (let j = c; j <= d; j++) { const key = i2 * 100003 + j; let l = p.grid.get(key); if (!l) p.grid.set(key, (l = [])); l.push(i); } });
  }
  return out;
}
function pen(p, x, z, y) {
  if (x < p.bb.x0 - HR || x > p.bb.x1 + HR || z < p.bb.z0 - HR || z > p.bb.z1 + HR) return -HR;
  let best = HR; const a = Math.floor((x - HR) / 16), b = Math.floor((x + HR) / 16), c = Math.floor((z - HR) / 16), d = Math.floor((z + HR) / 16), seen = new Set();
  for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) for (const k of p.grid.get(i * 100003 + j) ?? []) {
    if (seen.has(k)) continue; seen.add(k); const t = p.T[k];
    if (t[7] <= y + 0.5 || t[6] >= y + HH || t[6] > p.over) continue;
    let dd; if (t[6] >= y + 0.5 && t[7] <= y + HH) dd = triD(x, z, t); else { const Q = clipY(t[8], y + 0.5, y + HH); if (!Q) continue; dd = Q.length < 3 ? Math.sqrt(segD2(x, z, Q[0][0], Q[0][2], Q[Q.length - 1][0], Q[Q.length - 1][2])) : polyD(x, z, Q); }
    if (dd < best) best = dd;
  }
  return HR - best;
}
const worstPen = (PC, x, z, y) => { let w = -HR, k = null; for (const p of PC) { const q = pen(p, x, z, y); if (q > w) { w = q; k = p; } } return [w, k]; };

// ── cases: [name, start x, z, world dir x, z, mode ('push'|'roll'|'jump'|'knock'|'pass'), hold ms, pass: {axis, beyond}] ──
const D = (deg, nx, nz) => { const a = deg * Math.PI / 180; return [nx * Math.cos(a) - nz * Math.sin(a), nx * Math.sin(a) + nz * Math.cos(a)]; };
function facePushes(tag, fx, fz, nx, nz, tx, tz, full) {   // a face point (fx, fz), outward normal n, tangent t: 90 / 60 / 30 both sides, 0 both ways, roll, jump, knock
  const C = [], S = (d) => [fx + nx * d, fz + nz * d];
  const into = [-nx, -nz];
  C.push([`${tag}_p90`, ...S(60), ...into, 'push', 700]);
  for (const deg of full ? [30, 60] : [60]) for (const sd of [1, -1]) { const [dx, dz] = D(sd * deg, into[0], into[1]), st = S(60); C.push([`${tag}_p${90 - deg}${sd > 0 ? 'a' : 'b'}`, st[0] - dx * 0 - tx * sd * 0, st[1], dx, dz, 'push', 700]); }
  if (full) { const st = S(HR + 1.5); C.push([`${tag}_p0a`, st[0], st[1], tx, tz, 'push', 600]); C.push([`${tag}_p0b`, st[0], st[1], -tx, -tz, 'push', 600]); }
  C.push([`${tag}_roll`, ...S(110), ...into, 'roll', 900]);
  C.push([`${tag}_jump`, ...S(70), ...into, 'jump', 900]);
  C.push([`${tag}_knock`, ...S(HR + 26), ...into, 'knock', 900]);
  return C;
}
function casesFor(id) {
  const C = [];
  if (id === 'eshville_now') {
    // front-edge fences (the far side is the area's edge, not reachable): iron 1860-2180 (screenshot 1) and wood 80-420 (screenshot 2) in full, the others in part
    for (const [tag, x0, x1, z, hw, full] of [['iron1', 1860, 2180, 5, 3.6, true], ['wood1', 80, 420, 6, 3.5, true], ['iron2', 2700, 3020, 5, 3.6, false], ['wood2', 860, 1240, 6, 3.5, false], ['iron3', 3500, 3820, 5, 3.6, false], ['iron4', 4100, 4420, 5, 3.6, false]]) {
      C.push(...facePushes(tag, (x0 + x1) / 2, z + hw, 0, 1, 1, 0, full));
      if (full) for (const [e, sx] of [['w', x0 - 60], ['e', x1 + 60]]) C.push([`${tag}_end${e}`, sx, 17, sx < x0 ? 1 : -1, -0.12, 'push', 700]);
    }
    // church front: low wall 3616..3660 (railing on its east face), low wall 4140..4184 (railing west), the stair 3660..4140 x 1100..1250 with cheeks L and R
    C.push(...facePushes('lowW_e', 3660, 1060, 1, 0, 0, 1, true));
    C.push(...facePushes('lowW_w', 3616, 1060, -1, 0, 0, 1, true));
    C.push(...facePushes('lowE_w', 4140, 1060, -1, 0, 0, 1, true));
    C.push(...facePushes('lowE_e', 4184, 1060, 1, 0, 0, 1, false));
    C.push(['cheekL_up', 3700, 1080, -0.42, 0.9, 'push', 1300], ['cheekR_up', 4100, 1080, 0.42, 0.9, 'push', 1300]);
    C.push(['stair_pass', 3900, 1040, 0, 1, 'pass', 1600, { axis: 'z', beyond: 1240 }], ['stair_pass_l', 3700, 1040, 0, 1, 'pass', 1700, { axis: 'z', beyond: 1240 }], ['stair_pass_r', 4100, 1040, 0, 1, 'pass', 1700, { axis: 'z', beyond: 1240 }]);
    // the cemetery gate (shut in this state) at 4590,1010: posts 4467..4513 / 4667..4713
    C.push(...facePushes('gate_s', 4590, 1001, 0, -1, 1, 0, true));
    C.push(['gatepostL_s', 4490, 950, 0, 1, 'push', 700], ['gatepostR_s', 4690, 950, 0, 1, 'push', 700]);
  } else {
    // the graveyard road between the low walls 446..490 and 710..754 (z 130..900), the field walls at z 900..960, the open gate at 600,930
    C.push(...facePushes('roadL', 490, 520, 1, 0, 0, 1, true));
    C.push(...facePushes('roadR', 710, 520, -1, 0, 0, 1, true));
    C.push(...facePushes('roadL_out', 446, 520, -1, 0, 0, 1, false));
    C.push(...facePushes('roadR_out', 754, 520, 1, 0, 0, 1, false));
    C.push(...facePushes('fieldL_n', 300, 960, 0, 1, 1, 0, true));
    C.push(...facePushes('fieldR_n', 900, 960, 0, 1, 1, 0, true));
    C.push(...facePushes('fieldL_s', 300, 900, 0, -1, 1, 0, false));
    C.push(['gate_pass', 600, 840, 0, 1, 'pass', 1400, { axis: 'z', beyond: 1000 }], ['gate_pass_l', 556, 840, 0, 1, 'pass', 1400, { axis: 'z', beyond: 1000 }], ['gate_pass_r', 644, 840, 0, 1, 'pass', 1400, { axis: 'z', beyond: 1000 }]);
    C.push(['gate_back', 600, 1040, 0, -1, 'pass', 1400, { axis: '-z', beyond: 860 }]);
    C.push(['gateleafL_in', 600, 940, -1, 0, 'push', 700], ['gateleafR_in', 600, 940, 1, 0, 'push', 700], ['gateleafL_30', 600, 900, -0.87, 0.5, 'push', 700], ['gateleafR_30', 600, 900, 0.87, 0.5, 'push', 700]);
    C.push(['gatepostL_s', 520, 860, -0.2, 1, 'push', 700], ['gatepostR_s', 680, 860, 0.2, 1, 'push', 700], ['gatepostL_n', 500, 1010, 0, -1, 'push', 700], ['gatepostR_n', 700, 1010, 0, -1, 'push', 700]);
    C.push(['road_pass', 600, 200, 0, 1, 'pass', 1900, { axis: 'z', beyond: 820 }]);
    C.push(...facePushes('gateL_leaf', 556, 980, 1, 0, 0, 1, false).filter((c) => c[0].endsWith('knock')));
  }
  return C;
}

const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const out = { dev: DEV, areas: {} };
let bad = 0, total = 0;
try {
  for (const id of AREAS_L) {
    const a = await AREAS[id]({}), W = compileEnv(a.stage), PC = pieces(a.stage, W);
    const seeds = [...Object.values(a.spawns).map((s) => [s.x, s.z]), ...(a.stage.hookPoints ?? []).filter((h) => h.to).map((h) => h.to)];
    const g = reachGrid(W, 0, 0, HR, { noStart: true, seeds, hooks: a.stage.hookPoints ?? [] });
    const ctx = await browser.newContext({ ...contextOptions(DEV), serviceWorkers: 'block' }), page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${id}&v2story=0&v2auto=0&v2res=0.6`);
    await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 });
    await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 15000 }).catch(() => {});
    const cdp = await ctx.newCDPSession(page), T = new Touch(cdp, page);
    await ensureTouchMode(T, page); await page.waitForTimeout(300);
    const vp = await page.evaluate(() => [innerWidth, innerHeight]), sx = Math.round(vp[0] * 0.2), sy = Math.round(vp[1] * 0.66);
    const pad = await page.evaluate(() => { const m = window.__v2?.scene?.hud?.metrics?.(); const B = {}; for (const b of m?.pad?.buttons ?? []) B[b.id] = { cx: b.cx, cy: b.cy }; return B; });
    // a per-frame recorder of the hero (x, y, z) in the page
    await page.evaluate(() => { const v = window.__v2; window.__fv = { on: false, log: [] }; const tick = () => { const R = window.__fv; if (R.on) { const h = v.hero; R.log.push([h.x, h.y, h.z]); } requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    const R = out.areas[id] = { cases: [], errors: errs };
    for (const [name, X, Z, wx, wz, mode, HOLD, pass] of casesFor(id).filter((c) => !ONLY || ONLY.test(c[0]))) {
      // the start must be a spot the hero can reach in this area (reach grid as world_validate) - else the case is skipped (the far side of a front fence)
      if (!g.reachable(X, Z)) { R.cases.push({ name, skipped: 'start not reachable', from: [X, Z] }); console.log(`${DEV} ${id} ${name.padEnd(16)} skipped: (${X},${Z}) not reachable`); continue; }
      total++;
      await page.evaluate(([x, z]) => { const sc = window.__v2.scene, h = sc.sim.hero; for (const e of sc.sim.enemies ?? []) e.active = false; h.x = x; h.z = z; h._px = x; h._pz = z; h.vx = 0; h.vz = 0; h.hp = Math.max(h.hp, 80); h.ifr = 0; h.hurtT = 0; sc.cam.snap = true; window.__fv.log = []; }, [X, Z]);
      await page.waitForTimeout(260);
      await page.evaluate(() => { window.__fv.log = []; window.__fv.on = true; });
      const len = Math.hypot(wx, wz), ux = wx / len, uz = wz / len, R0 = 56;   // stick: screen right = +x, screen up = +z
      if (mode === 'knock') {
        await page.evaluate(([dx, dz]) => { const sim = window.__v2.scene.sim; sim.hero.ifr = 0; sim.hurtHero(1, dx, dz, { atk: { id: 'slam', knock: 380, str: 'F', guard: 'break' } }); }, [ux, uz]);
        await page.waitForTimeout(HOLD);
      } else {
        await T.down(21, sx, sy); await page.waitForTimeout(30);
        for (let i = 1; i <= 4; i++) { await T.move(21, Math.round(sx + ux * R0 * i / 4), Math.round(sy - uz * R0 * i / 4)); await page.waitForTimeout(16); }
        if (mode === 'roll' && pad.roll) { await page.waitForTimeout(120); await T.down(22, pad.roll.cx, pad.roll.cy); await page.waitForTimeout(90); await T.up(22); }
        if (mode === 'jump' && pad.jump) { await page.waitForTimeout(180); await T.down(23, pad.jump.cx, pad.jump.cy); await page.waitForTimeout(140); await T.up(23); }
        await page.waitForTimeout(HOLD);
      }
      const rec = await page.evaluate(() => { const R = window.__fv; R.on = false; const h = window.__v2.hero, p = window.__v2.project(h.x, h.y + 46, h.z); return { log: R.log, end: [h.x, h.y, h.z], p }; });
      // measure: the worst overlap of the body circle with any drawn fence-like piece over every recorded frame
      let worst = -HR, wAt = null, wKind = null;
      for (const [x, y, z] of rec.log) { const [q, k] = worstPen(PC, x, z, y); if (q > worst) { worst = q; wAt = [Math.round(x * 10) / 10, Math.round(y), Math.round(z * 10) / 10]; wKind = k ? `${k.kind}@${k.P.x ?? k.P.x0},${k.P.z ?? k.P.z0}` : null; } }
      const travel = rec.log.length ? Math.hypot(rec.end[0] - X, rec.end[2] - Z) : 0;
      let shot = null;
      if (SHOTS && (worst > TOL || SHOT_RE.test(name))) {
        const vpw = vp[0], vph = vp[1], cw = Math.min(520, vpw), ch = Math.min(380, vph), cx = Math.max(0, Math.min(vpw - cw, Math.round((rec.p?.x ?? vpw / 2) - cw / 2))), cy = Math.max(0, Math.min(vph - ch, Math.round((rec.p?.y ?? vph / 2) - ch / 2)));
        shot = `${OUT}/${DEV}_${id}_${name}.png`; await page.screenshot({ path: shot, clip: { x: cx, y: cy, width: cw, height: ch } });
      }
      if (mode !== 'knock') await T.up(21);
      // passes: the hero must get past the line; pushes: the stick the other way must walk him off (>= 30 in 450 ms), else he is stuck
      let passOk = null, off = null;
      if (mode === 'pass') { const v = pass.axis === 'z' ? rec.end[2] : pass.axis === '-z' ? -rec.end[2] : rec.end[0]; passOk = v >= (pass.axis === '-z' ? -pass.beyond : pass.beyond); }
      else {
        await page.waitForTimeout(mode === 'knock' ? 300 : 120);
        const b0 = await page.evaluate(() => { const h = window.__v2.hero; h.hurtT = 0; return [h.x, h.z]; });
        await T.down(24, sx, sy); await page.waitForTimeout(30);
        for (let i = 1; i <= 4; i++) { await T.move(24, Math.round(sx - ux * R0 * i / 4), Math.round(sy + uz * R0 * i / 4)); await page.waitForTimeout(16); }
        await page.waitForTimeout(450);
        const b1 = await page.evaluate(() => [window.__v2.hero.x, window.__v2.hero.z]); await T.up(24);
        off = Math.round(Math.hypot(b1[0] - b0[0], b1[1] - b0[1]));
      }
      const stuck = off !== null && off < 30, fail = worst > TOL || stuck || passOk === false;
      if (fail) bad++;
      const r = { name, mode, from: [X, Z], dir: [+ux.toFixed(2), +uz.toFixed(2)], frames: rec.log.length, end: rec.end.map((v) => Math.round(v * 10) / 10), travel: Math.round(travel), worstOverlap: +worst.toFixed(2), worstAt: wAt, piece: wKind, walkOff: off, passOk, ok: !fail, shot };
      R.cases.push(r);
      console.log(`${fail ? 'FAIL' : 'ok  '} ${DEV} ${id} ${name.padEnd(16)} ${mode.padEnd(5)} from (${X},${Z}) dir (${r.dir}) frames ${String(r.frames).padStart(3)} end (${r.end}) overlap ${String(r.worstOverlap).padStart(6)} ${wKind && worst > -HR ? '(' + wKind + ')' : ''}${off !== null ? ' walk-off ' + off : ''}${passOk !== null ? ' passed ' + passOk : ''}`);
    }
    R.errors = errs; await ctx.close();
  }
} finally { await browser.close(); srv.close?.(); }
fs.writeFileSync(`${OUT}/touch_${DEV}${args.tag ? '_' + args.tag : ''}.json`, JSON.stringify(out, null, 1));
console.log(`\n${DEV}: ${total} cases, ${bad} FAIL (body overlap > ${TOL} with drawn bars, stuck, or a passage blocked); page errors ${Object.values(out.areas).map((a) => a.errors.length).join('/')}`);
process.exit(bad ? 1 : 0);
