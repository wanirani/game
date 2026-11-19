// WHIP2-VERIFY lane — own LOOK captures (not the lane's whip_look): every whip move at 120 samples a second from the game camera, against an enemy
// in front, beside and behind and against a jar. Cells are the game picture itself, cut around the hero, with NO rings drawn over the lash (only a 2 px
// dot at the computed tip and at the computed hand, so the numbers can be checked against the picture by eye).
//   node tools/v2/whip_v2look.mjs [--areas graveyard_now,eshville_past] [--moves c1,c2,c3,sweep,whip,plunge] [--places front,side,behind,jar]
//                                 [--device fold_open] [--res 0.75] [--out /tmp/claude-0/v2/whip2verify/look] [--fire] [--nosheet]
// Two passes per case: pass 1 finds the tick of the rules' hit (no drawing), pass 2 draws ticks hit-6 .. hit+8, two samples each (alpha 0.5 and 1).
// Numbers per sample (own formulas): d = smallest distance of a drawn lash node to the target's body cylinder, step = how far the drawn tip moved since
// the sample before, gap = drawn lash root to the hand of the posed skeleton placed where the hero is drawn (through the actor's own weapon matrix).
import fs from 'node:fs';
import { launch, argsOf } from './whip_lib.mjs';

const args = argsOf(process.argv), DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/whip2verify/look'), RES = String(args.res || '0.75');
const AREAS = String(args.areas || 'graveyard_now,eshville_past').split(','), MOVES = String(args.moves || 'c1,c2,c3,sweep,whip,plunge').split(','), PLACES = String(args.places || 'front,side,behind,jar').split(',');
const T0 = Date.now(), log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);

async function look(C) {
  const v = window.__v2, sc = v.scene, W = window.__W, g = window.__game, sim = sc.sim, F = sc.fx.feel, wp = sc.whip;
  W.drawEvery = 0;
  if (W.X0 === undefined) {
    W.clear(); for (const x of sc.area.exits ?? []) { x.locked = true; if (x._box) x._box.solid = true; }
    let q = W.straight(sim.hero.x, sim.hero.z);
    {   // a view from the side: a straight ACROSS the screen (+x or -x) of 320 px, level and clear, anywhere within 1500 px of the start
      const y0 = W.ground(sim.hero.x, sim.hero.z), ok = (x, z, d) => { for (let r = -80; r <= 320; r += 20) { const gy = W.ground(x + d * r, z); if (!(Math.abs(gy - y0) < 3)) return false; } for (const sd of [-24, 0, 24]) if (sim.clearLine && !sim.clearLine(x - d * 80, z + sd, x + d * 320, z + sd, y0 + 40)) return false; return true; };
      let found = null; for (let R = 0; R <= 1500 && !found; R += 40) for (let k = 0; k < (R ? 16 : 1) && !found; k++) { const a = (k * Math.PI) / 8, x = sim.hero.x + Math.cos(a) * R, z = sim.hero.z + Math.sin(a) * R; if (!(Math.abs(W.ground(x, z) - y0) < 3)) continue; for (const d of [1, -1]) if (ok(x, z, d)) { found = { x, z, dx: d, dz: 0 }; break; } }
      if (found) q = found; W.sideView = !!found;
    }
    if (C.fire) {   // a straight across the screen just in FRONT of the biggest blaze of the area (nearer to the camera than the fire), so the streak is seen against the flames
      const fires = (sc.anchors?.list ?? []).filter((a) => a.kind === 'fire').sort((a, b) => b.size - a.size); let found = null;
      const okF = (x, z, d, y0) => { for (let r = -40; r <= 200; r += 20) { const gy = W.ground(x + d * r, z); if (!(Math.abs(gy - y0) < 3)) return false; } for (const sd of [-20, 0, 20]) if (sim.clearLine && !sim.clearLine(x - d * 40, z + sd, x + d * 200, z + sd, y0 + 40)) return false; return true; };
      for (const f of fires) { for (const oz of [80, 110, 140, 60, 170, 200]) { for (const ox of [-90, 90, -40, 40, -140, 140]) { const x = f.x + ox, z = f.z - oz, y0 = W.ground(x, z); if (!Number.isFinite(y0)) continue; const d = ox < 0 ? 1 : -1; if (okF(x, z, d, y0)) { found = { x, z, dx: d, dz: 0, fire: [Math.round(f.x), Math.round(f.y), Math.round(f.z), f.size] }; break; } } if (found) break; } if (found) break; }
      W.fireAt = found ? found.fire : 'none of ' + fires.length; if (found) q = found;
    }
    W.X0 = q.x; W.Z0 = q.z; W.dir = [q.dx, q.dz];
  }
  const DX = W.dir[0], DZ = W.dir[1];
  const kind = ['skeleton_soldier', 'plague_corpse', 'skeleton_mage', 'grave_ghost', 'gravekeeper_armor'].find((k) => sim.enemies.some((q) => q.kid === k && !q.dead));
  const TAP = (t, b = 'attack') => [[t, 'down', b], [t + 3, 'up', b]];
  const SEQ = {
    c1: { ev: TAP(2), front: [70, 0], side: [8, 62], behind: [-62, 0], n: 60 },
    c2: { ev: [...TAP(2), ...TAP(13)], front: [74, 0], side: [8, 66], behind: [-66, 0], n: 70 },
    c3: { ev: [...TAP(2), ...TAP(13), ...TAP(26)], front: [80, 0], side: [-10, 100], behind: [-90, 0], n: 100 },
    sweep: { ev: [...TAP(2, 'roll'), ...TAP(12)], stick: 30, front: [250, 0], side: [178, -96], behind: [100, 34], n: 90 },
    whip: { ev: [[2, 'down', 'attack'], [52, 'up', 'attack']], front: [170, 0], side: [0, 120], behind: [-130, 0], n: 110 },
    plunge: { ev: [...TAP(2, 'jump'), ...TAP(14)], front: [46, 0], side: [0, 52], behind: [-46, 0], n: 90 },
  };
  const S = SEQ[C.move], hits = [], brks = []; let ti = 0;
  const H = sim.hooks, h0 = H.hit, b0 = H.break;
  H.hit = function (e, dmg, mv, x, y, z, info) { hits.push({ tick: ti, id: mv.id, e, x, y, z, ex: e.x, ey: e.y, ez: e.z, er: e.r, eh: e.h }); return h0.call(this, e, dmg, mv, x, y, z, info); };
  H.break = function (b, by, dx, dz) { brks.push({ tick: ti, id: by, x: b.x, y: b.y + b.h * 0.55, z: b.z, ex: b.x, ey: b.y, ez: b.z, er: b.r, eh: b.h }); return b0 ? b0.call(this, b, by, dx, dz) : undefined; };
  const P = {}, proj = (x, y, z) => { sc.project(x, y, z, P); return [P.x, P.y]; };
  const N = new Float32Array(wp.n * 3), HND = { x: 0, y: 0, z: 0 };
  const bodyD = (B) => { let m = 1e9; for (let i = 2; i < wp.n; i++) { const o = i * 3, dh = Math.max(0, Math.sqrt((N[o] - B.ex) ** 2 + (N[o + 2] - B.ez) ** 2) - B.er), y = N[o + 1], dv = y < B.ey ? B.ey - y : y > B.ey + B.eh ? y - B.ey - B.eh : 0, d = Math.sqrt(dh * dh + dv * dv); if (d < m) m = d; } return m; };
  const glc = sc.glr.canvas, CW = 368, CH = 304, COLS = 6;
  const one = (draw, win) => {
    // place
    for (const e of sim.enemies) if (e._used) { e._used = false; e.x = e.homeX = -99999; e.z = e.homeZ = -99999; e._px = e.x; e._pz = e.z; e.active = false; e.state = 'idle'; e.atk = null; e.wakeBy = 'trigger'; e.stun = 0; e.kx = e.kz = 0; e.pullT = 0; }
    F.stop = 0; F.slowT = 0; hits.length = 0; brks.length = 0;
    let X = W.X0, Z = W.Z0, dx = DX, dz = DZ, B = null, foe = null;
    if (C.place === 'jar') {
      let b = null; const d0 = S.front[0];
      for (const q of sim.breakables) { if (q.broken) continue; for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = q.x - d[0] * d0, z = q.z - d[1] * d0, gy = W.ground(x, z); if (!Number.isFinite(gy) || Math.abs(gy - q.y) > 3) continue; if (sim.clearLine && !sim.clearLine(x, z, q.x - d[0] * (q.r + 4), q.z - d[1] * (q.r + 4), gy + 40)) continue; b = q; dx = d[0]; dz = d[1]; X = x; Z = z; break; } if (b) break; }
      if (!b) return { skip: 'no whole breakable with room in front' };
      B = { ex: b.x, ey: b.y, ez: b.z, er: b.r, eh: b.h };
    }
    W.put(X, Z, dx, dz); sim.hero.reso = 0; for (let i = 0; i < 20; i++) g.tick(1 / 60);
    if (C.place !== 'jar') { const at = S[C.place]; foe = W.enemy(kind, X + at[0] * dx - at[1] * dz, Z + at[0] * dz + at[1] * dx, {}); B = { ex: foe.x, ey: foe.y, ez: foe.z, er: foe.r, eh: foe.h }; }
    const rows = [], held = new Set(); let cells = 0, last = null, start = -1, simT = sim.time, hitTick = -1, cv = null, cx = null;
    if (draw) { cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * Math.ceil(((win[1] - win[0] + 1) * 2) / COLS); cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height); }
    for (let i = 0; i < S.n; i++) {
      ti = i;
      for (const q of S.ev) if (q[0] === i) { if (q[1] === 'down') { W.down(q[2]); held.add(q[2]); } else { W.up(q[2]); held.delete(q[2]); } }
      if (S.stick) { if (i <= S.stick) W.stick(dx, dz); else W.stick(0, 0); }
      const h = sim.hero; h.hp = h.hpMax; g.tick(1 / 60);
      const moved = sim.time !== simT; simT = sim.time;
      const mv = h.move ? h.move.id : null; if (start < 0 && mv === C.move) start = i;
      if (hitTick < 0) { const q = hits.find((x) => x.id === C.move) ?? brks.find((x) => x.id === C.move); if (q) hitTick = i; }
      if (!draw) { if (i % 6 === 0) { g.alpha = 1; g.render(); } if (hitTick >= 0 && i > hitTick + 10) break; continue; }
      if (i < win[0] || i > win[1]) { if (i % 6 === 0) { g.alpha = 1; g.render(); } continue; }
      for (const al of [0.5, 1]) {
        g.alpha = al; g.render();
        const a = sc._hitSnap ? 1 : al, k1 = 1 - a; (wp.drawn ? wp.drawn(a, N) : wp.sample(a, N));
        const hx = h.x - (h.x - h._px) * k1, hz = h.z - (h.z - h._pz) * k1, hy = sc.visY - (sc.visY - sc.visYP) * k1;
        let gap = -1; try { const ha = sc.heroA; if (ha.weaponMatrix(ha.place(hx, hy, hz))) { wp.handFromMatrix(ha.WM, HND); const fx = HND.dx ?? 0, fy = HND.dy ?? 0, fz = HND.dz ?? 0; gap = Math.sqrt((N[0] - HND.x - fx * 11) ** 2 + (N[1] - HND.y - fy * 11) ** 2 + (N[2] - HND.z - fz * 11) ** 2); ha.weaponMatrix(ha.place(h.x, sc.visY, h.z)); } } catch { gap = -2; }
        const o3 = (wp.n - 1) * 3, tip = [N[o3], N[o3 + 1], N[o3 + 2]], step = last ? Math.sqrt((tip[0] - last[0]) ** 2 + (tip[1] - last[1]) ** 2 + (tip[2] - last[2]) ** 2) : 0; last = tip;
        const Bn = hits.length ? hits[0] : B, row = { t: i, s: al === 1 ? 'b' : 'a', hit: i === hitTick, ice: !moved, snap: !!sc._hitSnap, ext: +wp.ext.toFixed(2), d: +bodyD(Bn).toFixed(1), step: +step.toFixed(1), gap: +gap.toFixed(1), trail: +wp.trailLive.toFixed(2), stop: +F.stop.toFixed(3), mv };
        rows.push(row);
        const k = glc.width / g.viewW, c = proj(hx + (B.ex - hx) * 0.4, hy + 60, hz + (B.ez - hz) * 0.4), sw = 460 * k, sh = sw * CH / CW, sx = c[0] * k - sw / 2, sy = c[1] * k - sh / 2;
        const X0 = (cells % COLS) * CW, Y0 = Math.floor(cells / COLS) * CH, f = CW / sw;
        cx.drawImage(glc, sx, sy, sw, sh, X0, Y0, CW, CH);
        const dot = (p, col) => { const q = proj(p[0], p[1], p[2]); cx.fillStyle = col; cx.fillRect(X0 + (q[0] * k - sx) * f - 1, Y0 + (q[1] * k - sy) * f - 1, 3, 3); };
        dot(tip, '#00ffff');
        cx.fillStyle = 'rgba(0,0,0,0.62)'; cx.fillRect(X0, Y0, CW, 16); cx.font = '12px monospace'; cx.fillStyle = row.hit ? '#ff7070' : row.ice ? '#80c8ff' : '#fff';
        cx.fillText(`t${i - hitTick >= 0 ? '+' : ''}${hitTick >= 0 ? i - hitTick : i}${row.s} ${row.hit ? 'HIT ' : ''}${row.ice ? 'ICE ' : ''}d${row.d} st${row.step} gap${row.gap} x${row.ext}`, X0 + 3, Y0 + 12);
        cx.strokeStyle = '#444'; cx.strokeRect(X0 + 0.5, Y0 + 0.5, CW - 1, CH - 1); cells++;
      }
    }
    for (const q of held) W.up(q); W.stick(0, 0);
    F.stop = 0; F.slowT = 0; for (let i = 0; i < 50; i++) { sim.hero.hp = sim.hero.hpMax; g.tick(1 / 60); } g.alpha = 1; g.render();
    return { start, hitTick, hits: hits.map((q) => `${q.tick}:${q.id}`), brks: brks.map((q) => `${q.tick}:${q.id}`), rows, png: draw ? cv.toDataURL('image/jpeg', 0.9) : null };
  };
  const p1 = one(false, null); if (p1.skip) { H.hit = h0; H.break = b0; return p1; }
  const c0 = p1.hitTick >= 0 ? p1.hitTick : p1.start >= 0 ? p1.start + 8 : 20;
  const p2 = one(true, [c0 - 5, c0 + 6]); H.hit = h0; H.break = b0;
  return { kind, pass1: { start: p1.start, hitTick: p1.hitTick, hits: p1.hits, brks: p1.brks }, ...p2, sideView: W.sideView, dir: W.dir, spot: [Math.round(W.X0), Math.round(W.Z0)], fireAt: W.fireAt ?? null };
}

fs.mkdirSync(OUT, { recursive: true });
const L = await launch(OUT), all = {};
try {
  const page = await L.page(DEV);
  for (const area of AREAS) {
    await L.open(page, area, `&v2res=${RES}`);
    await page.evaluate(`window.__look = ${look.toString()}`);
    all[area] = {};
    for (const move of MOVES) for (const place of PLACES) {
      const r = await page.evaluate((C) => window.__look(C).catch((e) => ({ skip: 'error: ' + (e?.stack ?? e) })), { move, place, fire: !!args.fire }).catch((e) => ({ skip: 'evaluate: ' + e.message }));
      const key = `${move}_${place}`;
      if (r.skip) { log(`${area} ${key}: skipped (${r.skip})`); all[area][key] = r; continue; }
      if (r.png && !args.nosheet) fs.writeFileSync(`${OUT}/${args.fire ? 'fire_' : ''}${area}_${key}.jpg`, Buffer.from(r.png.split(',')[1], 'base64')); delete r.png;
      all[area][key] = r;
      const R = r.rows, hb = R.find((q) => q.hit && q.s === 'b'), touch = R.find((q) => q.d <= 1), ice = R.filter((q) => q.ice && q.s === 'b').length, mxs = R.reduce((m, q) => (q.step > m.step ? q : m), { step: 0 }), gp = Math.max(...R.map((q) => q.gap));
      log(`${area} ${key.padEnd(14)} hits ${r.hits.join(' ') || '-'} brk ${r.brks.join(' ') || '-'} | hit tick ${r.hitTick} (pass1 ${r.pass1.hitTick}) | first touch ${touch ? `t${touch.t - r.hitTick}${touch.s}` : 'never'} | on hit: d ${hb ? hb.d : '-'} ext ${hb ? hb.ext : '-'} step ${hb ? hb.step : '-'} | max tip step ${mxs.step} at t${mxs.t - r.hitTick}${mxs.s} | hand gap max ${gp} | frozen ticks ${ice} | streak max ${Math.max(...R.map((q) => q.trail))}`);
    }
  }
  await page.context().close();
} catch (e) { L.errs.push('[tool] ' + (e?.stack ?? e)); }
await L.close();
fs.writeFileSync(`${OUT}/${args.fire ? 'fire_' : ''}look.json`, JSON.stringify(all, null, 1));
for (const e of L.errs) console.log('ERR ' + e);
console.log(L.errs.length ? `FAILED: ${L.errs.length} page errors` : 'DONE');
process.exit(L.errs.length ? 1 : 0);
