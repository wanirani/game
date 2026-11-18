// WORLD-LOOK: does the hero read at a glance? Stills from the game camera (scene v2g, no story) at six or more spots per area and,
// per still, the hero's size on screen and the brightness contrast between the hero (and an enemy standing three metres away) and
// the picture directly around them.
//   node tools/v2/look_read.mjs [--areas a,b] [--out /tmp/claude-0/v2/look/read] [--tag before] [--device fold_open] [--tier mid]
//        [--spots 8] [--flags gate_open] [--png 1]
// How one spot is measured (everything in the page, on the pixels of the 3D canvas, so the HUD does not count):
//   - the rules stand still (sim.update is a no-op while the tool runs): nobody wakes or walks; the scene's own tick (camera, poses,
//     character light, particles) goes on. The hero is put on the spot, one enemy of the area's own cast 178 px (three metres: a person
//     is 104 px = 1.75 m) beside him at the same depth, the camera snaps to its rest place and 24 ticks pass.
//   - three frames of the same moment are read back: without the hero, without the enemy, and the whole picture. Where the first two
//     differ from the third is the hero / the enemy (their exact silhouettes, also behind a railing).
//   - size  = height of the silhouette's box in CSS px and as a share of the screen height (+ the projected height of 104 px at his feet)
//   - lit   = mean luma of the brighter half of the silhouette / mean luma of what is behind and around it (the frame WITHOUT the
//             figure, over the silhouette grown by 28 % of its height; nothing below the feet)     aim >= 1.6
//   - mean  = mean luma of the whole silhouette / the same background
//   - edge  = the 3 px band inside the outline on the figure's darker side / the brighter of (the body 6..14 px further in, the
//             background 2..8 px outside)      aim >= 1.15 (a visible light edge)
//   luma = Rec.709 on the display values (what the screen shows), 0..1.
// Prints one JSON line per still and a table; writes <out>/look_read_<tag>.json and .md. One browser, one page per area.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import http from 'node:http';
import path from 'node:path';

// --root <dir>: serve another copy of the game (a snapshot taken before a change: its own src/ and index.html, everything else linked) instead of this tree
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8' };
const serveRoot = (root, p) => new Promise((r) => { const srv = http.createServer((req, res) => { let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html'; const f = path.join(root, u); if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; } fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data); }); }); srv.listen(p, () => r(srv)); });

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/look/read'), TAG = String(args.tag || 'run'), TIER = String(args.tier || 'mid');
const ALL = ['eshville_now', 'eshville_past', 'graveyard_now', 'graveyard_past', 'belltower_now', 'ossuary_now', 'ossuary_past', 'slice0'];
const AREAS = args.areas && args.areas !== true ? String(args.areas).split(',').filter(Boolean) : ALL;
const NSPOT = Math.max(6, Number(args.spots ?? 8)), PNG = !!args.png;
const FLAGS = args.flags && args.flags !== true ? String(args.flags).split(',').filter(Boolean) : [];
const AIM = { lit: 1.6, edge: 1.15, size: 11 };

// named spots (x, z, facing, fight = a place where the area puts enemies). Spots that are not standable are dropped and the
// generator (spawns, enemy places, triggers, hot spots - farthest points first) fills up to --spots.
const S = (name, x, z, dx = 1, dz = 0, fight = false) => ({ name, x, z, dx, dz, fight });
const ESH = [S('west_gate', 30, 150), S('outskirts_fight', 660, 130, 1, 0, true), S('outskirts_east', 1200, 150, 1, 0, true), S('street_inn', 1900, 170, 1, 0, true), S('street_smithy', 2800, 160, 1, 0, true),
  S('square_well', 3900, 330, 1, 0, true), S('square_east', 4160, 520, -1, 0, true), S('church_steps', 3900, 1000, 0, 1), S('church_front', 3900, 1480, 0, 1), S('big_bell', 4200, 1390, 0, 1), S('graveroad', 4590, 1120, 0, 1)];
const GRV = [S('road_start', 600, 190, 0, 1), S('road_fight', 600, 340, 1, 0, true), S('road_bats', 600, 560, 0, 1, true), S('road_end', 600, 820, 0, 1, true), S('gate', 600, 1010, 0, 1, true),
  S('field_west', 340, 1400, 1, 0, true), S('field_east', 860, 1400, -1, 0, true), S('field_mid', 600, 1520, 1, 0, true), S('stair_foot', 600, 1700, 0, 1, true), S('terrace', 600, 1900, 0, -1)];
const OSS = [S('entry', 600, 110, 0, 1), S('coffins', 600, 520, 0, 1, true), S('wedge', 600, 1100, 0, 1), S('wedge_far', 600, 1450, 0, 1), S('arena', 600, 1800, 1, 0, true), S('lamp', 600, 2280, 1, 0), S('riddle', 600, 2620, 1, 0), S('rest', 600, 2900, 0, 1),
  S('boss', 600, 3300, 1, 0, true), S('posts', 600, 3760, 0, 1)];
const NAMED = {
  eshville_now: ESH, eshville_past: ESH, graveyard_now: GRV, graveyard_past: GRV, ossuary_now: OSS, ossuary_past: OSS,
  belltower_now: [S('foot', 360, 120, 0, 1), S('floor1_left', 150, 320, 1, 0), S('floor1_right', 560, 320, -1, 0), S('floor2_roost', 200, 480, 1, 0, true), S('floor3', 560, 640, -1, 0), S('floor4', 150, 800, 1, 0), S('top_in', 360, 960, 0, 1, true), S('top_bell', 480, 1100, -1, 0, true)],
  slice0: [],
};

function install(aim) {
  const v = window.__v2, sc = v.scene, g = window.__game; g._pageHidden = true;
  const L = (window.__L = {}), sim = sc.sim, gl = sc.glr.gl, cv = sc.glr.canvas;
  sim.update = function () {};   // the rules stand still (see the head of this file)
  const groundAt = (x, z) => { let gy = -Infinity; for (const b of sc.W.boxes) { if (!b.walk || x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue; if (b.y1 > gy && b.y1 < 2000) gy = b.y1; } return gy; };
  const ok = (x, z) => { const y = groundAt(x, z); return Number.isFinite(y) && sc._spotOk({ x, z, y }) ? y : null; };
  L.tick = (n) => { for (let i = 0; i < n; i++) { const h = sim.hero; h.hp = h.hpMax ?? h.hp; g.tick(1 / 60); } };
  const put = (o, x, y, z, dx, dz) => {
    o.x = x; o.z = z; o.y = y; o.vx = 0; o.vz = 0; o.vy = 0; if (o.onGround !== undefined) o.onGround = true; if (o.gy !== undefined) o.gy = y; o._gy = y;
    const l = Math.hypot(dx, dz) || 1; o.dirX = dx / l; o.dirZ = dz / l; if (o.facing !== undefined && Math.abs(dx) > 0.3) o.facing = dx > 0 ? 1 : -1;
    o._px = x; o._py = y; o._pz = z;
  };
  /** the spots of this area: the named ones that are standable, then filled from the area's own data */
  L.spots = (named, N) => {
    const A = sc.area.def ?? sc.area, out = [], C = [];
    const add = (list, s) => { const y = ok(s.x, s.z); if (y == null) return; list.push({ ...s, y }); };
    for (const s of named) add(out, s);
    for (const [n, s] of Object.entries(A.spawns ?? {})) add(C, { name: 'spawn_' + n, x: s.x, z: s.z, dx: s.face?.[0] ?? 1, dz: s.face?.[1] ?? 0, fight: false });
    (A.enemies ?? []).forEach((e, i) => { if (e.kind !== 'bat') add(C, { name: 'enemy' + i + '_' + (e.group ?? e.kind), x: e.x, z: e.z - 30, dx: 1, dz: 0, fight: true }); });
    for (const t of A.triggers ?? []) add(C, { name: 'trig_' + t.id, x: (t.x0 + t.x1) / 2, z: (t.z0 + t.z1) / 2, dx: 1, dz: 0, fight: !!t.wake });
    for (const it of A.interact ?? []) add(C, { name: 'at_' + it.id, x: it.x, z: it.z - 36, dx: 0, dz: 1, fight: false });
    const far = (c) => { let m = 1e9; for (const s of out) m = Math.min(m, Math.hypot(s.x - c.x, s.z - c.z) + Math.abs(s.y - c.y) * 2); return m; };
    while (out.length < N && C.length) {
      let bi = -1, bd = -1; const needFight = out.filter((s) => s.fight).length < 3 && C.some((c) => c.fight);
      C.forEach((c, i) => { if (needFight && !c.fight) return; const d = far(c); if (d > bd) { bd = d; bi = i; } });
      if (bi < 0 || bd < 150) { if (needFight) { for (let i = C.length - 1; i >= 0; i--) if (C[i].fight) C.splice(i, 1); continue; } break; }
      out.push(C.splice(bi, 1)[0]);
    }
    return out;
  };
  /** the enemy that stands for the measure: one of the area's own cast (a solid kind first); none -> one is added */
  const PREF = ['skeleton_soldier', 'plague_corpse', 'gravekeeper_armor', 'skeleton_mage', 'grave_ghost', 'melee', 'ranged', 'banshee_queen'];
  L.enemy = () => {
    if (L.en && !L.en.dead) return L.en;
    let best = null, br = 99; for (const e of sim.enemies) { if (e.dead || e.state === 'dead') continue; const r = PREF.indexOf(e.kind); if (r >= 0 && r < br) { br = r; best = e; } }
    if (!best && typeof sim.addEnemy === 'function') { try { best = sim.addEnemy({ kind: (sc.area.era ?? sc.area.def?.era) === 'past' ? 'plague_corpse' : 'skeleton_soldier', x: sim.hero.x + 178, z: sim.hero.z, active: false }); L.added = true; } catch (e) { best = null; } }
    if (best) { L.en = best; L.home = [best.x, best.y, best.z]; }
    return best ?? null;
  };
  const read = () => { const w = cv.width, h = cv.height, px = new Uint8Array(w * h * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const frame = (hideHero, hideEnemy, en) => {
    const ha = sc.heroA, a3 = en?._a3 ?? null, hid = sc._heroHid;
    if (hideHero) { ha.draw = function () {}; sc._heroHid = false; }
    if (hideEnemy && a3) a3.draw = function () {};
    g.alpha = 1; g.render();
    const px = read();
    if (hideHero) { delete ha.draw; sc._heroHid = hid; }
    if (hideEnemy && a3) delete a3.draw;
    return px;
  };
  const lumAt = (P, i) => (0.2126 * P[i] + 0.7152 * P[i + 1] + 0.0722 * P[i + 2]) / 255;
  /** N = whole picture, O = the same without the figure, box = where it may be (canvas px, y from the top), other = another figure's mask or null */
  const figure = (N, O, w, h, box, other) => {
    const x0 = Math.max(0, box[0] | 0), y0 = Math.max(0, box[1] | 0), x1 = Math.min(w - 1, box[2] | 0), y1 = Math.min(h - 1, box[3] | 0), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw < 4 || bh < 4) return null;
    const M = new Uint8Array(bw * bh); let n = 0, mx0 = 1e9, mx1 = -1, my0 = 1e9, my1 = -1;
    for (let y = 0; y < bh; y++) { const row = (h - 1 - (y0 + y)) * w; for (let x = 0; x < bw; x++) { const i = (row + x0 + x) * 4; if (Math.abs(N[i] - O[i]) + Math.abs(N[i + 1] - O[i + 1]) + Math.abs(N[i + 2] - O[i + 2]) > 30) { M[y * bw + x] = 1; n++; if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y; } } }
    if (n < 80) return { n, hidden: true };
    const fh = my1 - my0 + 1, R = Math.max(10, Math.round(fh * 0.28));
    // luma of the figure: all, brighter half, darker half
    const ls = new Float32Array(n); let k = 0, sum = 0;
    for (let y = my0; y <= my1; y++) { const row = (h - 1 - (y0 + y)) * w; for (let x = mx0; x <= mx1; x++) if (M[y * bw + x]) { const l = lumAt(N, (row + x0 + x) * 4); ls[k++] = l; sum += l; } }
    ls.sort(); const half = n >> 1; let lo = 0, hi = 0; for (let i = 0; i < half; i++) lo += ls[i]; for (let i = half; i < n; i++) hi += ls[i];
    const mean = sum / n, lit = hi / (n - half), dark = lo / Math.max(1, half);
    // background: the frame without the figure, over the silhouette grown by R (rows down to the feet + 4 % only), not on the other figure
    const D = new Uint8Array(bw * bh), T = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (M[y * bw + x]) { const a = Math.max(0, x - R), b = Math.min(bw - 1, x + R); for (let q = a; q <= b; q++) T[y * bw + q] = 1; }
    for (let x = 0; x < bw; x++) for (let y = 0; y < bh; y++) if (T[y * bw + x]) { const a = Math.max(0, y - R), b = Math.min(bh - 1, y + R); for (let q = a; q <= b; q++) D[q * bw + x] = 1; }
    const yMax = Math.min(bh - 1, my1 + Math.round(fh * 0.04)); let bs = 0, bn = 0;
    for (let y = 0; y <= yMax; y++) { const row = (h - 1 - (y0 + y)) * w; for (let x = 0; x < bw; x++) { if (!D[y * bw + x]) continue; if (other && other.M[(y0 + y - other.y0) * other.bw + (x0 + x - other.x0)] === 1 && y0 + y >= other.y0 && y0 + y < other.y0 + other.bh && x0 + x >= other.x0 && x0 + x < other.x0 + other.bw) continue; bs += lumAt(O, (row + x0 + x) * 4); bn++; } }
    const bg = bn ? bs / bn : 0;
    // the light edge: per row, the outline on the left and on the right
    const side = [{ band: 0, bn: 0, inn: 0, in: 0, out: 0, on: 0 }, { band: 0, bn: 0, inn: 0, in: 0, out: 0, on: 0 }];
    for (let y = my0; y <= my1; y++) {
      const row = (h - 1 - (y0 + y)) * w; let a = -1, b = -1;
      for (let x = mx0; x <= mx1; x++) if (M[y * bw + x]) { if (a < 0) a = x; b = x; }
      if (a < 0 || b - a < 30) continue;
      for (const [sd, e, dir] of [[0, a, 1], [1, b, -1]]) {
        let run = 0; while (run < 16 && M[y * bw + e + dir * run]) run++;
        if (run < 15) continue;
        const Sd = side[sd];
        for (let q = 1; q <= 3; q++) { Sd.band += lumAt(N, (row + x0 + e + dir * q) * 4); Sd.bn++; }
        for (let q = 6; q <= 14; q++) { Sd.inn += lumAt(N, (row + x0 + e + dir * q) * 4); Sd.in++; }
        for (let q = 2; q <= 8; q++) { const xx = x0 + e - dir * q; if (xx < 0 || xx >= w) continue; Sd.out += lumAt(N, (row + xx) * 4); Sd.on++; }
      }
    }
    let edge = null, edgeSide = null;
    if (side[0].in > 40 && side[1].in > 40) {
      const d = side[0].inn / side[0].in <= side[1].inn / side[1].in ? 0 : 1, Sd = side[d];
      edge = (Sd.band / Sd.bn) / Math.max(1e-4, Math.max(Sd.inn / Sd.in, Sd.on ? Sd.out / Sd.on : 0)); edgeSide = d ? 'right' : 'left';
    }
    return { n, hidden: false, box: [x0 + mx0, y0 + my0, x0 + mx1, y0 + my1], hpx: fh, mean, lit, dark, bg, litK: bg > 0 ? lit / bg : 0, meanK: bg > 0 ? mean / bg : 0, edge, edgeSide, mask: { M, x0, y0, bw, bh } };
  };
  const boxOf = (o, hgt, w, h) => {
    const a = sc.project(o.x, o.y, o.z, {}), b = sc.project(o.x, o.y + hgt, o.z, {}), kx = w / g.viewW, ky = h / g.viewH;
    const ph = Math.abs(a.y - b.y) * ky, cx = (a.x + b.x) / 2 * kx, top = Math.min(a.y, b.y) * ky, bot = Math.max(a.y, b.y) * ky;
    return { box: [cx - ph * 1.1, top - ph * 0.45, cx + ph * 1.1, bot + ph * 0.3], ph };
  };
  L.measure = (s) => {
    const h = sim.hero, en = L.enemy();
    put(h, s.x, s.y, s.z, s.dx, s.dz); h.move = null; h.act = null; h.dashT = 0; if (h.wishX !== undefined) { h.wishX = 0; h.wishZ = 0; } if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; }
    if (sc.heroA) { sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ; } sc.visY = sc.visYP = h.y; sc._whipReset = true;
    let ep = null;
    if (en) { for (const [ox, oz] of [[178, 0], [-178, 0], [126, 126], [-126, 126], [126, -126], [-126, -126], [0, 178], [0, -178]]) { const y = ok(s.x + ox, s.z + oz); if (y != null && Math.abs(y - s.y) < 24) { ep = [s.x + ox, y, s.z + oz]; break; } }
      if (ep) put(en, ep[0], ep[1], ep[2], s.x - ep[0], s.z - ep[2]); else put(en, L.home[0], L.home[1], L.home[2], 1, 0); }
    sc.cam.snap = true; L.tick(24);
    const w = cv.width, hh = cv.height;
    const O1 = frame(true, false, en), O2 = en && ep ? frame(false, true, en) : null, N = frame(false, false, en);
    const hb = boxOf(h, 104, w, hh), css = cv.getBoundingClientRect(), kc = css.height / hh;
    const E = O2 ? figure(N, O2, w, hh, boxOf(en, en.h ?? 104, w, hh).box, null) : null;
    const H = figure(N, O1, w, hh, hb.box, E && !E.hidden ? E.mask : null);
    const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000), st = v.stats || {};
    const pack = (F) => (!F ? null : F.hidden ? { hidden: true, n: F.n } : { px: Math.round(F.hpx * kc), pct: +(F.hpx / hh * 100).toFixed(1), lit: r3(F.litK), mean: r3(F.meanK), edge: r3(F.edge), edgeSide: F.edgeSide, lumLit: r3(F.lit), lumMean: r3(F.mean), lumDark: r3(F.dark), lumBg: r3(F.bg) });
    const R = { hero: pack(H), enemy: pack(E), enemyKind: en ? en.kind : null, enemyAt: ep ? ep.map(Math.round) : null, projPx: Math.round(hb.ph * kc), projPct: +(hb.ph / hh * 100).toFixed(1),
      heroAt: [Math.round(h.x), Math.round(h.y), Math.round(h.z)], section: v.section, canvas: [w, hh], draws: st.gl?.draws ?? null, tris: st.gl?.tris ?? null, worldTris: st.world?.tris ?? null, worldDraws: st.world?.draws ?? null, lost: gl.isContextLost() };
    const Hh = R.hero;
    R.fail = [];
    if (!Hh || Hh.hidden) R.fail.push('hero not seen');
    else { if (Hh.lit < aim.lit) R.fail.push('lit ' + Hh.lit); if (Hh.edge != null && Hh.edge < aim.edge) R.fail.push('edge ' + Hh.edge); if (s.fight && Hh.pct < aim.size) R.fail.push('size ' + Hh.pct + '%'); }
    if (en && ep) put(en, L.home[0], L.home[1], L.home[2], 1, 0);
    return R;
  };
  L.cost = () => { const st = v.stats || {}; return { texMB: st.gl?.texMB ?? null, worldTexMB: +((st.world?.texBytes ?? 0) / 1048576).toFixed(1), charTexMB: +((st.chars?.texBytes ?? 0) / 1048576).toFixed(1), bufMB: +((st.gl?.bufBytes ?? 0) / 1048576).toFixed(1), loadMs: st.loadMs ?? null, lights: sc.W.lights.length, staticTris: sc.W.env?.stats?.tris ?? null }; };
  return { ready: v.ready, area: v.area, enemies: sim.enemies.length };
}

fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700), srv = args.root && args.root !== true ? await serveRoot(path.resolve(String(args.root)), port) : await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = [], rows = [], cost = {}; let code = 0;
try {
  for (const area of AREAS) {
    const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(`[pageerror] ${area}: ${e.message} ${(e.stack ?? '').split('\n').slice(1, 3).join(' | ')}`));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`[console] ${area}: ${m.text().slice(0, 300)}`); });
    try {
      await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${area}&v2auto=0&v2tier=${TIER}&v2story=0`);
      await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 }).catch(() => {});
      const st = await page.evaluate(() => ({ ready: window.__v2?.ready, error: String(window.__v2?.error ?? '') }));
      if (!st.ready) throw new Error('scene not ready: ' + st.error);
      if (FLAGS.length) {
        await page.evaluate((flags) => { const sc = window.__v2.scene; if (typeof sc.setWorldFlags === 'function') { const o = { ...(sc.worldFlags || {}) }; for (const f of flags) o[f] = true; sc.setWorldFlags(o); } }, FLAGS);
        await page.evaluate(async () => { const g = window.__game; g._pageHidden = true; for (let i = 0; i < 40; i++) { for (let k = 0; k < 6; k++) g.tick(1 / 60); g.render(); await new Promise((r) => setTimeout(r, 50)); if (!window.__v2.scene.xing && !window.__v2.scene._rebuilding) break; } });
      }
      await page.evaluate(install, AIM);
      cost[area] = await page.evaluate(() => window.__L.cost());
      const spots = await page.evaluate(([named, n]) => window.__L.spots(named, n), [NAMED[area] ?? [], NSPOT]);
      // an added enemy's model arrives a moment later
      await page.evaluate(async () => { const L = window.__L, en = L.enemy(); for (let i = 0; i < 60 && en && !en._a3; i++) { L.tick(2); await new Promise((r) => setTimeout(r, 100)); } });
      for (const s of spots) {
        const r = await page.evaluate((s) => window.__L.measure(s), s);
        if (r.lost) { errs.push(`context lost at ${area} ${s.name}`); code = 1; break; }
        const file = `${OUT}/${TAG}_${area}_${s.name}.${PNG ? 'png' : 'jpg'}`;
        await page.screenshot(PNG ? { path: file } : { path: file, type: 'jpeg', quality: 88 });
        const row = { area, spot: s.name, fight: !!s.fight, at: [s.x, s.z], file, ...r };
        rows.push(row); console.log(JSON.stringify(row));
      }
    } catch (e) { errs.push(`[tool] ${area}: ${e.stack || e.message}`); code = 1; }
    await ctx.close();
  }
} finally { await browser.close(); srv.close?.(); }

const f2 = (x) => (x == null ? '  -  ' : x.toFixed(2)), pad = (s, n) => String(s).padEnd(n), padL = (s, n) => String(s).padStart(n);
const lines = ['| area | spot | fight | hero px (CSS) | % of screen | lit / around | mean / around | edge | luma lit · around | enemy lit / around | enemy edge | fails |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
console.log('\n' + pad('area', 15) + pad('spot', 22) + 'fight  heroPx   %scr   lit/bg  mean/bg  edge   lumLit lumBg   enemy lit/bg edge   fails');
for (const r of rows) {
  const H = r.hero && !r.hero.hidden ? r.hero : null, E = r.enemy && !r.enemy.hidden ? r.enemy : null;
  console.log(pad(r.area, 15) + pad(r.spot, 22) + pad(r.fight ? 'yes' : '-', 7) + padL(H ? H.px : '-', 6) + padL(H ? H.pct.toFixed(1) : '-', 7) + padL(f2(H?.lit), 9) + padL(f2(H?.mean), 9) + padL(f2(H?.edge), 6) + padL(f2(H?.lumLit), 9) + padL(f2(H?.lumBg), 6) + padL(f2(E?.lit), 12) + padL(f2(E?.edge), 6) + '   ' + (r.fail.join(', ') || 'ok'));
  lines.push(`| ${r.area} | ${r.spot} | ${r.fight ? 'yes' : ''} | ${H ? H.px : '-'} | ${H ? H.pct.toFixed(1) : '-'} | ${f2(H?.lit)} | ${f2(H?.mean)} | ${f2(H?.edge)} | ${f2(H?.lumLit)} · ${f2(H?.lumBg)} | ${f2(E?.lit)} | ${f2(E?.edge)} | ${r.fail.join(', ') || 'ok'} |`);
}
const per = {};
for (const r of rows) { const p = per[r.area] ?? (per[r.area] = { n: 0, fail: 0, lit: [], pct: [], edge: [], elit: [] }); p.n++; if (r.fail.length) p.fail++; const H = r.hero && !r.hero.hidden ? r.hero : null; if (H) { p.lit.push(H.lit); p.pct.push(H.pct); if (H.edge != null) p.edge.push(H.edge); } if (r.enemy && !r.enemy.hidden) p.elit.push(r.enemy.lit); }
const mn = (a) => (a.length ? Math.min(...a) : null), md = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);
console.log('\nper area: stills · failing · hero lit/around min / median · size % min / median · edge min / median · enemy lit/around median');
for (const [a, p] of Object.entries(per)) console.log(`  ${pad(a, 15)} ${padL(p.n, 3)} · ${padL(p.fail, 2)} · ${f2(mn(p.lit))} / ${f2(md(p.lit))} · ${f2(mn(p.pct))} / ${f2(md(p.pct))} · ${f2(mn(p.edge))} / ${f2(md(p.edge))} · ${f2(md(p.elit))}`);
console.log('\ncost per area (this run): draw calls max · triangles max (world part max) · textures MB (world part) · first load ms · static triangles of the area');
for (const a of Object.keys(per)) { const R = rows.filter((r) => r.area === a), c = cost[a] ?? {}; c.drawsMax = Math.max(...R.map((r) => r.draws ?? 0)); c.trisMax = Math.max(...R.map((r) => r.tris ?? 0)); c.worldTrisMax = Math.max(...R.map((r) => r.worldTris ?? 0)); c.worldDrawsMax = Math.max(...R.map((r) => r.worldDraws ?? 0)); cost[a] = c;
  console.log(`  ${pad(a, 15)} ${padL(c.drawsMax, 3)} (world ${c.worldDrawsMax}) · ${padL(c.trisMax, 7)} (${c.worldTrisMax}) · ${c.texMB} (${c.worldTexMB}) · ${c.loadMs} · ${c.staticTris}`); }
fs.writeFileSync(`${OUT}/look_read_${TAG}.json`, JSON.stringify({ tag: TAG, device: DEV, tier: TIER, aim: AIM, rows, per, cost }, null, 1));
fs.writeFileSync(`${OUT}/look_read_${TAG}.md`, lines.join('\n') + '\n');
if (errs.length) { console.log('ERRORS:'); for (const e of errs.slice(0, 20)) console.log('  ' + e); if (errs.some((e) => e.startsWith('[pageerror]') || e.startsWith('[tool]'))) code = 1; }
console.log(code ? 'FAIL' : 'OK');
process.exit(code);
