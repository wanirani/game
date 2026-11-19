// WHIP lane — the LOOK of the lash: stills from the game camera at 120 samples a second (two per rule tick), one contact sheet per move.
//   node tools/v2/whip_look.mjs [--tag before] [--areas graveyard_now,eshville_past] [--moves c1,c2,c3,c3_side,c3_three,sweep,sweep_side,whip,pull,plunge,hook]
//                               [--device fold_open] [--res 0.75] [--out /tmp/claude-0/v2/whip2/look] [--nosheet] [--base <commit>: that commit's src/v2/whip under today's scene]
// The game is advanced by ticks (g.tick) and every sample is drawn by the tool (g.alpha = 0.5, then 1; the scene itself draws a hit tick at 1 - _hitSnap).
// Fingers go through the pad's own pointer handlers (whip_lib). Each cell of a sheet is the game picture cut around the hero with three marks:
//   cyan ring = where the drawn hand holds the lash (the lash root of the posed skeleton, moved with the hero's drawn position)
//   yellow ring = the drawn tip · red ring + line = the struck enemy (its body axis and the rules' hit point)
// and the label: tick, sample a (alpha 0.5) or b (alpha 1), HIT on the tick of the rules' hit, ICE while the hit-stop holds the world.
// Numbers per move (state the draw reads — the lash's drawn centre line is the mesh's own: whip.drawn / whip.sample, the streak is read from the mesh):
//   touch    the tick on which a drawn node of the lash first touches the target's body, relative to the tick of the rules' hit (0 = the same tick)
//   out      how far the lash is out on the hit tick (whip.ext, 1 = straight)
//   root     the largest gap between the lash root as drawn and the hand as drawn (world px)
//   kink     the sharpest corner of the lit streak: degrees of turn between two neighbouring pieces of its centre line, in the world (on the screen a smooth
//            arc seen edge-on folds over by itself). An arc of the strike turns about 22 degrees a piece; a hook or a corner is 60 and more
//   step     the largest move of the drawn tip between two samples (world px) and the move in the sample of the hit tick ("jump")
// Writes <out>/<tag>_<area>_<move>.png and <out>/<tag>.json. Exit 1 on a page error.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { launch, argsOf } from './whip_lib.mjs';

const args = argsOf(process.argv), TAG = String(args.tag || 'now'), DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/whip2/look'), RES = String(args.res || '0.75');
const AREAS = String(args.areas || 'graveyard_now,eshville_past').split(','), SHEET = !args.nosheet, BASE = args.base ? String(args.base) : null;
const ALL = ['c1', 'c2', 'c3', 'c3_side', 'c3_three', 'sweep', 'sweep_side', 'whip', 'pull', 'plunge', 'hook'], MOVES = args.moves ? String(args.moves).split(',') : ALL;
const T0 = Date.now(), log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);

/** in the page: one sequence. S = { ev, stick, at: [[dx, dz], ...], move, from, n, after, skill } */
async function seq(S, o) {
  const v = window.__v2, sc = v.scene, W = window.__W, g = window.__game, sim = sc.sim, F = sc.fx.feel, wp = sc.whip;
  const { writeWhipMesh, meshInfo } = await import('/src/v2/whip/mesh.js');
  W.drawEvery = 0;
  if (W.X0 === undefined) { W.clear(); W.X0 = sim.hero.x; W.Z0 = sim.hero.z; for (const x of sc.area.exits ?? []) { x.locked = true; if (x._box) x._box.solid = true; } }
  for (const e of sim.enemies) if (e._used) { e._used = false; e.x = e.homeX = -99999; e.z = e.homeZ = -99999; e._px = e.x; e._pz = e.z; e.active = false; e.state = 'idle'; e.atk = null; e.wakeBy = 'trigger'; e.stun = 0; e.kx = e.kz = 0; e.pullT = 0; }
  F.stop = 0; F.slowT = 0;
  const kind = ['skeleton_soldier', 'plague_corpse', 'skeleton_mage', 'grave_ghost', 'gravekeeper_armor'].find((k) => sim.enemies.some((q) => q.kid === k && !q.dead));
  if (W.dir === undefined) { const q = W.straight(W.X0, W.Z0); W.X0 = q.x; W.Z0 = q.z; W.dir = [q.dx, q.dz]; W.spot = [Math.round(q.x), Math.round(q.z), W.dir]; }   // the sequences run along a free straight (whip_lib)
  const DX = W.dir[0], DZ = W.dir[1];
  let X = W.X0, Z = W.Z0, ring = null;
  if (S.skill) {   // under a whip ring: a spot from which the rules offer the hook
    const P = sim.hookPoints[0]; if (!P) return { skip: 'no whip ring in this area' };
    let found = false;
    for (const d of [120, 90, 150, 60, 180, 210]) { for (let k = 0; k < 8 && !found; k++) { const a = (k * Math.PI) / 4, x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d; if (!Number.isFinite(W.ground(x, z))) continue; W.put(x, z, 1, 0); W.tick(3); if (sim.hero.hookId != null && sim.hero.onGround) { X = x; Z = z; found = true; } } if (found) break; }
    if (!found) return { skip: 'no spot under the ring' };
    ring = { x: P.x, y: (P.y ?? 0) + (P.h ?? 150), z: P.z };
  }
  if (!S.skill) W.put(X, Z, DX, DZ); sim.hero.reso = 0; for (let i = 0; i < 20; i++) g.tick(1 / 60);
  const foes = []; if (!S.skill) for (let k = 0; k < S.at.length; k++) foes.push(W.enemy(kind, X + S.at[k][0] * DX - S.at[k][1] * DZ, Z + S.at[k][0] * DZ + S.at[k][1] * DX, { fresh: k > 0 && !sim.enemies.some((q) => q.kid === kind && !q.dead && !q._used) }));
  const hits = []; let ti = 0;
  const H = sim.hooks, h0 = H.hit; H.hit = function (e, dmg, mv, x, y, z, info) { hits.push({ tick: ti, id: mv.id, e, x, y, z, ex: e.x, ey: e.y, ez: e.z, er: e.r, eh: e.h }); return h0.call(this, e, dmg, mv, x, y, z, info); };
  const I = meshInfo(wp), vtx = new Float32Array(I.floats), tmp = new Float32Array(wp.n * 3), tmp2 = new Float32Array(wp.n * 3), TS = (I.nTrail / 6) + 1, trail0 = (I.verts - TS * 2) * 10;
  const glc = sc.glr.canvas, CW = 300, CH = 240, COLS = 8, maxCells = 40;
  let cv = null, cx = null; if (o.sheet) { cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * Math.ceil(maxCells / COLS); cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height); }
  const P = {}, proj = (x, y, z) => { sc.project(x, y, z, P); return [P.x, P.y]; };
  const lashOn = (N, C) => { let m = 1e9; for (let i = 2; i < wp.n; i++) { const o3 = i * 3, dh = Math.max(0, Math.hypot(N[o3] - C.ex, N[o3 + 2] - C.ez) - C.er - 2), y = N[o3 + 1], dv = y < C.ey - 4 ? C.ey - 4 - y : y > C.ey + C.eh + 4 ? y - C.ey - C.eh - 4 : 0, d = Math.hypot(dh, dv); if (d < m) m = d; } return m; };
  const rows = [], held = new Set(); let cells = 0, lastTip = null, hitTick = -1, startTick = -1, endAt = S.n, simT = sim.time;
  const want = S.move === 'pull' ? 'whip' : S.move; let hit0 = null;
  const tgt = () => (hit0 ? hit0 : foes.length ? { e: foes[0], ex: foes[0].x, ey: foes[0].y, ez: foes[0].z, er: foes[0].r, eh: foes[0].h, x: foes[0].x, y: foes[0].y + 60, z: foes[0].z } : null);
  for (let i = 0; i < S.n && i <= endAt; i++) {
    ti = i;
    for (const q of S.ev) if (q[0] === i) { if (q[1] === 'down') { W.down(q[2]); held.add(q[2]); } else { W.up(q[2]); held.delete(q[2]); } }
    if (S.stick) { if (i <= S.stick[2]) W.stick(DX, DZ); else W.stick(0, 0); }
    const h = sim.hero; h.hp = h.hpMax; g.tick(1 / 60);
    const moved = sim.time !== simT; simT = sim.time;
    const mvId = h.move ? h.move.id : h.act === 'hook' ? 'hook' : null;
    if (startTick < 0 && (mvId === S.move || (S.move === 'pull' && mvId === 'whip'))) startTick = i;
    if (hitTick < 0) { const q = hits.find((x) => x.id === want); if (q) { hit0 = q; hitTick = i; endAt = i + (S.after ?? 7); } }
    if (S.skill && startTick >= 0 && endAt === S.n) endAt = startTick + (S.after ?? 16);
    const cap = startTick >= 0 && i >= startTick + (S.from ?? 0) && (S.move !== 'pull' || hitTick >= 0);
    if (!cap) { if (i % 6 === 0) { g.alpha = 1; g.render(); } continue; }
    for (const al of [0.5, 1]) {
      const a = sc._hitSnap ? 1 : al;
      g.alpha = al; if (o.sheet) g.render();
      const N = wp.drawn ? wp.drawn(a, tmp) : wp.sample(a, tmp); writeWhipMesh(wp, vtx, a, tmp2);
      const k1 = 1 - a, hx = h.x - (h.x - h._px) * k1, hz = h.z - (h.z - h._pz) * k1, hy = sc.visY - (sc.visY - sc.visYP) * k1, R = wp.root;
      const rx = R.x - (h.x - h._px) * k1, ry = R.y - (sc.visY - sc.visYP) * k1, rz = R.z - (h.z - h._pz) * k1;   // the hand of the posed skeleton as the character draw places it
      const o3 = (wp.n - 1) * 3, tip = [N[o3], N[o3 + 1], N[o3 + 2]], C = tgt();
      // the streak's centre line as the mesh has it (visible part only), on the screen
      const sp = []; let nv = 0; for (let j = 0; j < TS; j++) { const q = trail0 + j * 20; sp.push([vtx[q], vtx[q + 1], vtx[q + 2], vtx[q + 6]]); if (vtx[q + 6] >= 0.06) nv++; }
      let kink = 0; const live = wp.trailLive > 0.01;   // a corner counts where the streak is lit on both sides of it (three neighbouring sections at 6 % strength or more, pieces of 2 px or more), measured in the world: the turn between two neighbouring pieces
      if (live) for (let j = 1; j < sp.length - 1; j++) { if (sp[j - 1][3] < 0.06 || sp[j][3] < 0.06 || sp[j + 1][3] < 0.06) continue; const ax = sp[j][0] - sp[j - 1][0], ay = sp[j][1] - sp[j - 1][1], az = sp[j][2] - sp[j - 1][2], bx = sp[j + 1][0] - sp[j][0], by = sp[j + 1][1] - sp[j][1], bz = sp[j + 1][2] - sp[j][2], la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz); if (la < 2 || lb < 2) continue; const ang = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / (la * lb)))) * 57.2958; if (ang > kink) kink = ang; }
      if (kink > (W._kw ?? 0) || !rows.length) { if (!rows.length) W._kw = 0; if (kink > W._kw) { W._kw = kink; W._kp = { tick: i, al, hero: [h.x, h.y, h.z, h.dirX, h.dirZ].map((q) => +q.toFixed(1)), dir: W.dir, pts: sp.map((q) => [Math.round(q[0]), Math.round(q[1]), Math.round(q[2]), +q[3].toFixed(2)]), hist: Array.from(wp.hist).map((q) => +q.toFixed(1)), tip: Array.from(N.slice((wp.n - 1) * 3)).map((q) => +q.toFixed(1)) }; } }
      const step = lastTip ? Math.hypot(tip[0] - lastTip[0], tip[1] - lastTip[1], tip[2] - lastTip[2]) : 0; lastTip = tip;
      const row = { tick: i, s: al === 1 ? 'b' : 'a', a, mv: mvId, moveT: +(h.moveT ?? 0).toFixed(4), hit: i === hitTick, ice: !moved, ext: +wp.ext.toFixed(3), root: +Math.hypot(N[0] - rx, N[1] - ry, N[2] - rz).toFixed(1), kink: +kink.toFixed(0), streak: live ? nv : 0, step: +step.toFixed(1), body: C ? +lashOn(N, C).toFixed(1) : -1, tipHit: hit0 ? +Math.hypot(tip[0] - hit0.x, tip[1] - hit0.y, tip[2] - hit0.z).toFixed(1) : -1 };
      rows.push(row);
      if (o.sheet && cells < maxCells) {
        const k = glc.width / g.viewW, c = proj(hx + (C ? (C.ex - hx) * 0.35 : 0), hy + 62, hz), sw = CW * (o.zoom ?? 1.9) * (k / 2.0), sh = sw * CH / CW, sx = c[0] * k - sw / 2, sy = c[1] * k - sh / 2;
        const X0 = (cells % COLS) * CW, Y0 = Math.floor(cells / COLS) * CH, f = CW / sw;
        cx.save(); cx.beginPath(); cx.rect(X0, Y0, CW, CH); cx.clip();
        cx.drawImage(glc, sx, sy, sw, sh, X0, Y0, CW, CH);
        const mark = (p, col, r) => { const q = proj(p[0], p[1], p[2]); cx.strokeStyle = col; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(X0 + (q[0] * k - sx) * f, Y0 + (q[1] * k - sy) * f, r, 0, 6.2832); cx.stroke(); };
        mark([rx, ry, rz], '#30e0ff', 6); mark(tip, '#ffe640', 7);
        if (C) { mark([C.x, C.y, C.z], '#ff4040', 9); const q0 = proj(C.ex, C.ey, C.ez), q1 = proj(C.ex, C.ey + C.eh, C.ez); cx.strokeStyle = 'rgba(255,64,64,0.55)'; cx.beginPath(); cx.moveTo(X0 + (q0[0] * k - sx) * f, Y0 + (q0[1] * k - sy) * f); cx.lineTo(X0 + (q1[0] * k - sx) * f, Y0 + (q1[1] * k - sy) * f); cx.stroke(); }
        if (ring) mark([ring.x, ring.y, ring.z], '#ff4040', 9);
        cx.restore();
        cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(X0, Y0, CW, 17); cx.font = '12px monospace'; cx.fillStyle = row.hit ? '#ff6060' : row.ice ? '#80c8ff' : '#ffffff';
        cx.fillText(`t${i - startTick}${row.s} ${row.hit ? 'HIT ' : ''}${row.ice ? 'ICE ' : ''}root ${row.root} kink ${row.kink} step ${row.step}`, X0 + 4, Y0 + 12);
        cx.strokeStyle = '#333'; cx.lineWidth = 1; cx.strokeRect(X0 + 0.5, Y0 + 0.5, CW - 1, CH - 1);
        cells++;
      }
    }
  }
  for (const q of held) W.up(q); W.stick(0, 0); H.hit = h0;
  F.stop = 0; F.slowT = 0; for (let i = 0; i < 50; i++) { sim.hero.hp = sim.hero.hpMax; g.tick(1 / 60); } g.alpha = 1; g.render();
  // summary
  const tb = rows.filter((r) => r.s === 'b'), firstTouch = tb.find((r) => r.body >= 0 && r.body <= 1), hitRow = tb.find((r) => r.hit);
  const hitA = rows.find((r) => r.hit), vis = rows.filter((r) => r.streak >= 3);
  const out = { kind, start: startTick, hitTick, hitRel: hitTick >= 0 ? hitTick - startTick : null, hits: hits.map((q) => `${q.tick - startTick}:${q.id}`), touch: firstTouch && hitTick >= 0 ? firstTouch.tick - hitTick : null,
    out: hitRow ? hitRow.ext : null, bodyAtHit: hitRow ? hitRow.body : null, root: Math.max(0, ...rows.map((r) => r.root)), kink: Math.max(0, ...vis.map((r) => r.kink)), kinkAt: (vis.slice().sort((p, q) => q.kink - p.kink)[0] ?? {}).tick - startTick,
    step: Math.max(0, ...rows.map((r) => r.step)), jump: hitA ? hitA.step : null, rows, everyFrame: !!sc.everyFrame, spot: W.spot, worst: o.debug ? W._kp : undefined };
  if (o.sheet) { const used = Math.ceil(cells / COLS) * CH, c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = Math.max(CH, used); c2.getContext('2d').drawImage(cv, 0, 0); out.png = c2.toDataURL('image/png'); out.cells = cells; }
  return out;
}

const TAP = (t, b = 'attack') => [[t, 'down', b], [t + 3, 'up', b]];
const SEQ = {
  c1: { ev: TAP(2), at: [[70, 0]], move: 'c1', n: 60, after: 6 },
  c2: { ev: [...TAP(2), ...TAP(13)], at: [[74, 0]], move: 'c2', n: 70, after: 6 },
  c3: { ev: [...TAP(2), ...TAP(13), ...TAP(26)], at: [[80, 0]], move: 'c3', n: 100, from: 2, after: 9 },
  c3_side: { ev: [...TAP(2), ...TAP(13), ...TAP(26)], at: [[-10, 100]], move: 'c3', n: 100, from: 2, after: 9, note: 'nobody in front: the first two hits cut the air, the third only reaches the one beside and behind' },
  c3_three: { ev: [...TAP(2), ...TAP(13), ...TAP(26)], at: [[84, 0], [6, 92], [-30, -88]], move: 'c3', n: 100, from: 2, after: 9, note: 'front, right and left-behind in one third hit' },
  sweep: { ev: [...TAP(2, 'roll'), ...TAP(12)], stick: [1, 0, 30], at: [[250, 0]], move: 'sweep', n: 90, after: 7 },
  sweep_side: { ev: [...TAP(2, 'roll'), ...TAP(12)], stick: [1, 0, 30], at: [[178, -96]], move: 'sweep', n: 90, after: 7, note: 'the only target stands to the left of where the roll ends' },
  whip: { ev: [[2, 'down', 'attack'], [52, 'up', 'attack']], at: [[170, 0]], move: 'whip', n: 110, after: 5 },
  pull: { ev: [[2, 'down', 'attack'], [52, 'up', 'attack']], at: [[170, 0]], move: 'pull', n: 130, after: 19 },
  plunge: { ev: [...TAP(2, 'jump'), ...TAP(14)], at: [[46, 0]], move: 'plunge', n: 90, after: 7 },
  hook: { ev: TAP(2, 'skill'), at: [], move: 'hook', n: 70, skill: true, after: 15 },
};

fs.mkdirSync(OUT, { recursive: true });
const L = await launch(OUT), all = {};
try {
  const page = await L.page(DEV, BASE ? { serviceWorkers: 'block' } : {});
  if (BASE) {   // the whip module of another commit under today's scene (the "before" sheets): its files are served in place of src/v2/whip/*.js
    const dir = `${OUT}/base_${BASE}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    execSync(`git archive ${BASE} src/v2/whip | tar -x -C ${dir}`, { cwd: new URL('../..', import.meta.url).pathname, shell: '/bin/bash' });
    await page.route('**/src/v2/whip/*.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(dir + new URL(route.request().url()).pathname) }));
  }
  for (const area of AREAS) {
    await L.open(page, area, `&v2res=${RES}`);
    await page.evaluate(`window.__seq = ${seq.toString()}`);
    all[area] = {};
    for (const m of MOVES) {
      const S = SEQ[m]; if (!S) continue;
      const r = await page.evaluate(([S, o]) => window.__seq(S, o).catch((e) => ({ skip: 'error: ' + (e?.stack ?? e) })), [S, { sheet: SHEET, debug: !!args.debug }]).catch((e) => ({ skip: 'evaluate: ' + e.message }));
      if (r.skip) { log(`${area} ${m}: skipped (${r.skip})`); all[area][m] = { skip: r.skip }; continue; }
      if (r.png) { fs.writeFileSync(`${OUT}/${TAG}_${area}_${m}.png`, Buffer.from(r.png.split(',')[1], 'base64')); delete r.png; }
      all[area][m] = r; if (args.debug && r.worst) console.log('   worst kink sample: ' + JSON.stringify(r.worst));
      log(`${area} ${m.padEnd(10)} hit t${r.hitRel} (${r.hits.join(' ')}) · touch ${r.touch == null ? '-' : (r.touch > 0 ? '+' : '') + r.touch} · out ${r.out} · lash to body on the hit tick ${r.bodyAtHit} px · root gap ${r.root} px · kink ${r.kink} deg (t${r.kinkAt}) · tip step max ${r.step} px, in the hit sample ${r.jump} px · ${r.cells ?? 0} cells`);
    }
  }
  await page.context().close();
} catch (e) { L.errs.push('[tool] ' + (e?.stack ?? e)); }
await L.close();
fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(all, null, 1));
for (const e of L.errs) console.log('ERR ' + e);
console.log(L.errs.length ? `FAILED: ${L.errs.length} page errors` : 'ALL OK');
process.exit(L.errs.length ? 1 : 0);
