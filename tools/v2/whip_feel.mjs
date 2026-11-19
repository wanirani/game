// WHIP lane — hit feel end to end (scene v2g, today's tree, one browser, game advanced by ticks, frames drawn by the tool).
//   node tools/v2/whip_feel.mjs [--device fold_open] [--out /tmp/claude-0/v2/whip] [--areas graveyard_now,eshville_now,eshville_past] [--shots]
// For every hero hit type (first, second, third hit, sweep, charged coil, plunge) against every enemy kind the areas hold and against a
// breakable, at 60 Hz (one frame per tick, drawn at alpha 0.5) and at 120 Hz (two frames per tick, alpha 0.25 and 0.75), it records the
// display frame on which (the frames of the hit tick and of the tick after it are really drawn; the values are read from the state those draws use)
//   reach   a drawn node of the lash touches the target's body (what the frame shows: the scene's own interpolation; a crack puts the tip on the contact point, the charged coil winds round the body)
//   freeze  the picture stops (the first frame after which hero, enemy and lash are drawn where they were drawn the frame before)
//   spark   the hit preset is in the effect engine when a frame is drawn, and whether its point lies ON the target's body
//   flash   the enemy's hit flash is drawn (actor.hitAge)   pose  the rules put it in its hurt / stagger / death state (the clip follows on that tick)
//   number  the damage number is on        sound  the audio engine was asked to start (+ its own 4 ms and the spread delay)   buzz  the vibration was asked for
// all as frames relative to `reach`. Pass = every one within one display frame of reach at both rates.
// Also: the strength table (frozen ticks, shake, sound, vibration per move) and what several things struck in one tick start in the audio engine.
// Writes <out>/feel.json. Exit 1 on a failed line or a page error.
import fs from 'node:fs';
import { launch, argsOf } from './whip_lib.mjs';

const args = argsOf(process.argv), DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/whip'), AREAS = String(args.areas || 'graveyard_now,eshville_now,eshville_past').split(',');
let fails = 0; const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (!cond) fails++; };

async function measure(KINDS_WANT) {
  const v = window.__v2, sc = v.scene, W = window.__W, g = window.__game, { feel } = await import('/src/v2/feel/index.js'), { PRESET_IDS } = await import('/src/v2/fx/index.js'), { MOVES } = await import('/src/v2/play/index.js');
  const NAME = {}; for (const k in PRESET_IDS) NAME[PRESET_IDS[k]] = k;
  const sim = () => sc.sim, hero = () => sc.sim.hero, fx = sc.fx, F = fx.feel;
  W.clear(); W.drawEvery = 0;
  // spot: where the hero stands now is free ground of the area; measure there
  const X0 = hero().x, Z0 = hero().z;
  const rec = { frame: 0, hit: null, fxAt: [], snd: [], buzz: [], brk: null };
  const playAt0 = fx.playAt.bind(fx); fx.playAt = (id, x, y, z, ...r) => { rec.fxAt.push({ name: NAME[id] ?? String(id), x, y, z, frame: rec.frame }); return playAt0(id, x, y, z, ...r); };
  const fire0 = feel.sound.fire.bind(feel.sound); feel.sound.fire = (r, bus, pos, vol, pitch, delay) => { const st = fire0(r, bus, pos, vol, pitch, delay); rec.snd.push({ bus, delay: delay || 0, vol: +(+vol).toFixed(2), started: st, frame: rec.frame }); return st; };
  const hap0 = feel.haptics.play.bind(feel.haptics); feel.haptics.play = (n) => { rec.buzz.push({ name: n, frame: rec.frame }); return hap0(n); };
  const hookHit = (want) => { const H = sim().hooks, h0 = H.hit, b0 = H.break; H.hit = function (e, dmg, mv, x, y, z, info) { if (!rec.hit && mv.id === want) rec.hit = { e, x, y, z, frame: rec.frame, str: mv.strength, stop0: F.stop, tr0: F.trauma, ex: e.x, ey: e.y, ez: e.z, er: e.r, eh: e.h }; const r = h0.call(this, e, dmg, mv, x, y, z, info); if (rec.hit && rec.hit.e === e && rec.hit.stop == null) { rec.hit.stop = F.stop; rec.hit.shake = +(F.trauma - rec.hit.tr0).toFixed(3); rec.hit.feel = r ? { stop: r.stop, shake: r.shake, kick: r.kick, zoom: r.zoom, haptic: r.haptic, layers: r.layers ? r.layers.length : null } : null; } return r; };
    H.break = function (b, by, dx, dz) { if (!rec.brk && by === want) rec.brk = { b, frame: rec.frame, x: b.x, y: b.y + b.h * 0.55, z: b.z, ex: b.x, ey: b.y, ez: b.z, er: b.r, eh: b.h }; return b0 ? b0.call(this, b, by, dx, dz) : undefined; }; return () => { H.hit = h0; H.break = b0; }; };
  const SCRIPT = {   // finger scripts [tick, 'down'|'up', button] + where the target stands (px in front of the hero's start, he faces +x)
    c1: { ev: [[2, 'down', 'attack'], [5, 'up', 'attack']], d: 70, n: 60 },
    c2: { ev: [[2, 'down', 'attack'], [5, 'up', 'attack'], [13, 'down', 'attack'], [16, 'up', 'attack']], d: 74, n: 70 },
    c3: { ev: [[2, 'down', 'attack'], [5, 'up', 'attack'], [13, 'down', 'attack'], [16, 'up', 'attack'], [26, 'down', 'attack'], [29, 'up', 'attack']], d: 80, n: 100 },
    sweep: { ev: [[2, 'down', 'roll'], [5, 'up', 'roll'], [12, 'down', 'attack'], [15, 'up', 'attack']], d: 250, n: 90, stick: true },
    whip: { ev: [[2, 'down', 'attack'], [52, 'up', 'attack']], d: 170, n: 110 },
    plunge: { ev: [[2, 'down', 'jump'], [5, 'up', 'jump'], [14, 'down', 'attack'], [17, 'up', 'attack']], d: 46, n: 90 },
  };
  /** the drawn lash against a body (axis ex,ez, radius er, from ey up eh): smallest distance of a drawn node to the body surface (0 = touching or inside) */
  const lashOn = (a, C) => { const w = sc.whip, n = w.n, P = w.nodes, Q = w.prev; let m = 1e9; for (let i = 2; i < n; i++) { const o = i * 3, x = Q[o] + (P[o] - Q[o]) * a, y = Q[o + 1] + (P[o + 1] - Q[o + 1]) * a, z = Q[o + 2] + (P[o + 2] - Q[o + 2]) * a; const dh = Math.max(0, Math.hypot(x - C.ex, z - C.ez) - C.er - 2), dv = y < C.ey - 4 ? C.ey - 4 - y : y > C.ey + C.eh + 4 ? y - C.ey - C.eh - 4 : 0; const d = Math.hypot(dh, dv); if (d < m) m = d; } return m; };
  const tipDrawn = (a) => { const w = sc.whip, n = w.n, o = (n - 1) * 3, P = w.nodes, Q = w.prev; return [Q[o] + (P[o] - Q[o]) * a, Q[o + 1] + (P[o + 1] - Q[o + 1]) * a, Q[o + 2] + (P[o + 2] - Q[o + 2]) * a]; };
  // the audio engine counts in its own clock (the 100 ms budget window, the same-instant spread): one tick must take one tick of real time around a hit
  let tReal = performance.now(); const pace = async () => { const w = tReal + 16.7 - performance.now(); if (w > 0.5) await new Promise((r) => setTimeout(r, w)); tReal = performance.now(); };
  const run = async (move, target, rate) => {
    const S = SCRIPT[move], h = hero(); let e = null, b = null;
    W.put(X0, Z0, 1, 0); h.reso = 0; for (let i = 0; i < 20; i++) g.tick(1 / 60);
    if (target === 'jar') { b = sim().breakables.find((q) => !q.broken); if (!b) return null; W.put(b.x - S.d - (move === 'sweep' ? 0 : 0), b.z, 1, 0); for (let i = 0; i < 20; i++) g.tick(1 / 60); }
    else e = W.enemy(target, X0 + S.d, Z0, {});
    rec.frame = 0; rec.hit = null; rec.brk = null; rec.fxAt.length = 0; rec.snd.length = 0; rec.buzz.length = 0;
    const un = hookHit(move), fr = [], held = new Set(); let simT = sim().time, drawn = 0;
    for (let i = 0; i < S.n; i++) {
      for (const q of S.ev) if (q[0] === i) { if (q[1] === 'down') { W.down(q[2]); held.add(q[2]); } else { W.up(q[2]); held.delete(q[2]); } }
      if (S.stick) { W.stick(1, 0); if (i % 8 === 0 && !rec.hit && !rec.brk) { g.alpha = 1; g.render(); } }   // (the pad lets go of a held stick when the HUD is not drawn for a while)
      h.hp = h.hpMax; await pace(); g.tick(1 / 60);
      const moved = sim().time !== simT; simT = sim().time;
      for (const al of rate === 120 ? [0.25, 0.75] : [0.5]) {
        rec.frame++; if ((rec.hit || rec.brk) && drawn < 4) { g.alpha = al; g.render(); drawn++; }   // only the frames of the hit tick and the next are really drawn (software WebGL is slow); every value below is state the draw reads
        const hh = hero(), a = sc._hitSnap ? 1 : al, tp = tipDrawn(a), C = rec.hit ?? rec.brk, tg = rec.hit ? rec.hit.e : null;
        fr.push({ f: rec.frame, tick: i, moved, key: [hh._px + (hh.x - hh._px) * a, tp[0], tp[1], tp[2], tg ? tg._px + (tg.x - tg._px) * a : 0].map((q) => Math.round(q * 100)).join(','),
          tipD: C ? Math.hypot(tp[0] - C.x, tp[1] - C.y, tp[2] - C.z) : -1, bodyD: C ? lashOn(a, C) : -1, flash: tg && tg._a3 ? tg._a3.hitAge >= 0 && tg._a3.hitAge < 0.14 : false, pose: tg ? ['hurt', 'stagger', 'death'].includes(tg.anim) || tg.state === 'dead' : false,
          num: sc.numbers.some((q) => q.on && q.t < 0.05), stop: F.stop > 0 });
      }
      if (rec.hit && rec.frame - rec.hit.frame > (rate === 120 ? 36 : 18)) break;
      if (rec.brk && !rec.hit && rec.frame - rec.brk.frame > (rate === 120 ? 24 : 12)) break;
    }
    for (const q of held) W.up(q); W.stick(0, 0); un();
    const C = rec.hit ?? rec.brk; let out = null;
    if (C) {
      const f0 = C.frame + 1;   // the first frame drawn after the tick of the hit (rec.frame counts drawn frames; the hit happened inside the tick before frame f0)
      const first = (p) => { const q = fr.find((x) => x.f >= f0 - 2 && p(x)); return q ? q.f : null; };
      const reach = first((x) => x.f >= f0 && x.bodyD >= 0 && x.bodyD <= 1);   // a drawn node of the lash touches the target's body
      let freeze = null; for (let k = 1; k < fr.length; k++) if (fr[k].f >= f0 && fr[k].key === fr[k - 1].key) { freeze = fr[k - 1].f; break; }
      const sp = rec.fxAt.filter((q) => q.name.startsWith('hit.') && q.frame >= C.frame), tg = rec.hit ? rec.hit.e : null;
      const on = sp.length && tg ? sp.every((q) => Math.hypot(q.x - C.ex, q.z - C.ez) <= C.er + 6 && q.y >= C.ey - 2 && q.y <= C.ey + C.eh + 2) : null;   // against where the target stood when it was hit
      const snd = rec.snd.filter((q) => q.frame >= C.frame && (q.bus === 'f3_hit' || q.bus === 'f3_big' || q.bus === 'f3_enemy')), bz = rec.buzz.filter((q) => q.frame >= C.frame);
      const frozenTicks = (() => { const t = new Set(); for (const x of fr) if (x.f >= f0 && !x.moved) t.add(x.tick); let n = 0; const first0 = fr.find((x) => x.f >= f0 && !x.moved); if (!first0) return 0; for (let k = first0.tick; t.has(k); k++) n++; return n; })();
      const tipMin = Math.min(...fr.filter((x) => x.f >= f0 && x.bodyD >= 0).map((x) => x.bodyD)), tipAt = fr.find((x) => x.f === f0)?.tipD ?? -1;
      out = { move, target, rate, strength: rec.hit ? rec.hit.str : null, contact: f0, reach, freeze, spark: sp.length ? sp[0].frame + 1 : null, sparkOn: on, fxNames: [...new Set(rec.fxAt.filter((q) => q.frame >= C.frame && q.frame <= C.frame + 1).map((q) => q.name))].join('+'),
        flash: first((x) => x.flash), pose: first((x) => x.pose), number: first((x) => x.num), sound: snd.length ? snd[0].frame + 1 : null, soundStarted: snd.length ? snd[0].started : null, soundMs: snd.length ? 4 + Math.round(snd[0].delay * 1000) : null, buzz: bz.length ? bz[0].frame + 1 : null, buzzName: bz.length ? bz[0].name : null,
        frozenTicks, stop: rec.hit ? +(rec.hit.stop ?? 0).toFixed(3) : null, shake: rec.hit ? rec.hit.shake : null, feel: rec.hit ? rec.hit.feel : null, tipMin: +tipMin.toFixed(1), tipAt: +tipAt.toFixed(1) };
    }
    if (e) { e._used = false; e.x = e.homeX = -99999; e.z = e.homeZ = -99999; e._px = e.x; e._pz = e.z; e.active = false; e.state = 'idle'; e.atk = null; e.wakeBy = 'trigger'; e.stun = 0; e.kx = e.kz = 0; }
    F.stop = 0; F.slowT = 0; for (let i = 0; i < 50; i++) { hero().hp = hero().hpMax; g.tick(1 / 60); } g.alpha = 1; g.render();
    return out;
  };
  const have = KINDS_WANT.filter((k) => sim().enemies.some((q) => q.kid === k && !q.dead)), rows = [];
  const targets = [...have]; if (sim().breakables && sim().breakables.some((q) => !q.broken)) targets.push('jar');
  for (const target of targets) for (const move of Object.keys(SCRIPT)) for (const rate of [60, 120]) { const r = await run(move, target, rate); if (r) rows.push(r); else rows.push({ move, target, rate, miss: true }); }
  // several things struck in one tick: four soldiers (or whatever the area has most of) around the hero in the third hit; every whole breakable within 400 px broken at once
  const multi = {};
  { const kind = have[0]; if (kind) { W.put(X0, Z0, 1, 0); for (let i = 0; i < 10; i++) g.tick(1 / 60); const es = []; for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + 0.4; es.push(W.enemy(kind, X0 + Math.cos(a) * 78, Z0 + Math.sin(a) * 60, { fresh: k > 0 && !sim().enemies.some((q) => q.kid === kind && !q.dead && !q._used) })); }
      rec.snd.length = 0; rec.frame = 0; let n = 0; const H = sim().hooks, h0 = H.hit; H.hit = function (...A) { if (A[2].id === 'c3') n++; return h0.apply(this, A); };
      const ev = SCRIPT.c3.ev; for (let i = 0; i < 70; i++) { for (const q of ev) if (q[0] === i) { if (q[1] === 'down') W.down(q[2]); else W.up(q[2]); } hero().hp = hero().hpMax; await pace(); g.tick(1 / 60); rec.frame++; }
      H.hit = h0; const first = rec.snd.find((q) => q.bus === 'f3_hit' || q.bus === 'f3_big'), same = first ? rec.snd.filter((q) => (q.bus === 'f3_hit' || q.bus === 'f3_big') && q.frame >= first.frame + 0 && q.frame <= first.frame + 40) : [];
      const c3s = rec.snd.filter((q) => (q.bus === 'f3_hit' || q.bus === 'f3_big')); const lastFrame = c3s.length ? c3s[c3s.length - 1].frame : -1, grp = c3s.filter((q) => q.frame === lastFrame);
      multi.enemies = { kind, struck: n, asked: grp.length, started: grp.filter((q) => q.started).length, delaysMs: grp.map((q) => Math.round(q.delay * 1000)), vols: grp.map((q) => q.vol) };
      for (const e of es) { e._used = false; e.x = e.homeX = -99999; e.z = e.homeZ = -99999; e.active = false; e.state = 'idle'; e.atk = null; e.wakeBy = 'trigger'; }
      F.stop = 0; for (let i = 0; i < 40; i++) g.tick(1 / 60); } }
  { const B = (sim().breakables ?? []).filter((q) => !q.broken); if (B.length >= 2) { let best = null, bn = 0; for (const q of B) { const n = B.filter((o) => Math.hypot(o.x - q.x, o.z - q.z) < 400).length; if (n > bn) { bn = n; best = q; } }
      await new Promise((r) => setTimeout(r, 400)); rec.snd.length = 0; rec.frame = 0; const n = sim().breakAt(best.x, best.z, 400, 'sweep'); g.tick(1 / 60);
      const grp = rec.snd.filter((q) => q.bus === 'f3_enemy'); multi.jars = { broken: n, asked: grp.length, started: grp.filter((q) => q.started).length, delaysMs: grp.map((q) => Math.round(q.delay * 1000)), vols: grp.map((q) => q.vol) }; } }
  return { area: v.area, kinds: have, rows, multi, strengths: Object.fromEntries(Object.values(MOVES).map((m) => [m.id, m.strength + (m.strength !== m.str ? ' (rules ' + m.str + ')' : '')])) };
}

const L = await launch(OUT), all = [];
try {
  const page = await L.page(DEV);
  for (const area of AREAS) {
    await L.open(page, area, '&v2res=0.5');
    const r = await page.evaluate(measure, ['skeleton_soldier', 'skeleton_mage', 'plague_corpse', 'grave_ghost', 'gravekeeper_armor', 'bat']);
    all.push(r);
    if (args.shots) await page.screenshot({ path: `${OUT}/feel_${area}.png` });
  }
  await page.context().close();
} catch (e) { L.errs.push('[tool] ' + (e?.stack ?? e)); }
await L.close();

const seenKinds = new Set(), rows = [];
for (const A of all) for (const r of A.rows) { const k = r.target === 'jar' ? 'jar@' + A.area : r.target; if (r.target !== 'jar' && seenKinds.has(r.target + r.move + r.rate)) continue; seenKinds.add(r.target + r.move + r.rate); rows.push({ ...r, area: A.area }); }
const rel = (r, k) => (r[k] == null ? ' -' : (r[k] - r.reach >= 0 ? '+' : '') + (r[k] - r.reach));
console.log(`[${DEV}] frames relative to the frame on which the drawn lash tip is on the contact point. 60 Hz: one frame = 16.7 ms · 120 Hz: one frame = 8.3 ms`);
console.log('move    target              Hz  reach freeze spark(on body) flash pose number sound(+ms) buzz   frozen ticks · stop s · shake · effects');
let bad = 0, n = 0, noReach = 0;
for (const r of rows) {
  if (r.miss) continue;
  if (r.reach == null) { noReach++; console.log(`${r.move.padEnd(7)} ${r.target.padEnd(19)} ${String(r.rate).padStart(3)}  the drawn lash never touched the target's body (nearest ${r.tipMin} px) · freeze ${r.freeze != null ? r.freeze - r.contact : '-'} spark ${r.spark != null ? r.spark - r.contact : '-'} (frames after the hit tick's first frame)`); continue; }
  n++; const offs = ['freeze', 'spark', 'flash', 'number', 'sound', 'buzz'].filter((k) => r[k] != null).map((k) => r[k] - r.reach), worst = offs.reduce((m, q) => Math.max(m, Math.abs(q)), 0); if (worst > 1 || r.sparkOn === false) bad++;
  console.log(`${r.move.padEnd(7)} ${r.target.padEnd(19)} ${String(r.rate).padStart(3)}  ${String(r.reach - r.contact).padStart(3)}   ${rel(r, 'freeze').padStart(3)}    ${rel(r, 'spark').padStart(3)} ${r.sparkOn == null ? '      ' : r.sparkOn ? '(on)  ' : '(OFF) '}    ${rel(r, 'flash').padStart(3)}  ${rel(r, 'pose').padStart(3)}   ${rel(r, 'number').padStart(3)}   ${rel(r, 'sound').padStart(3)} ${r.soundMs != null ? '(+' + r.soundMs + ')' : '     '}${r.soundStarted === false ? ' NOT STARTED' : ''} ${rel(r, 'buzz').padStart(3)} ${String(r.buzzName ?? '').padEnd(6)} ${r.frozenTicks} · ${r.stop ?? '-'} · ${r.shake ?? '-'} · ${r.fxNames}${worst > 1 ? '   <-- more than one frame apart' : ''}`);
}
ok(`every hit: freeze, spark, flash, number, sound and vibration within one display frame of the lash reaching the target (${n} measured hits at 60 and 120 Hz)`, n > 0 && bad === 0, `${bad} hits with something more than one frame away or a spark off the body`);
ok('the drawn lash touches the target in every measured hit', noReach === 0, `${noReach} without`);
// the strength table, from the measured rows at 60 Hz against the first kind that has all moves
const st = {}; for (const r of rows) if (!r.miss && r.rate === 60 && r.feel && !st[r.move]) st[r.move] = r;
console.log('\nstrength per move (60 Hz, first measured target): move · feel strength · frozen ticks · hit-stop s · shake added · kick · zoom · vibration · sound layers');
for (const m of Object.keys(st)) { const r = st[m]; console.log(`  ${m.padEnd(7)} ${String(r.strength).padEnd(2)} ${String(r.frozenTicks).padStart(2)} ticks  ${r.stop} s  shake ${r.shake}  kick ${r.feel.kick}  zoom ${r.feel.zoom}  ${r.feel.haptic}  ${r.feel.layers ?? '?'} layers  (on ${r.target})`); }
const cls = (m) => st[m]?.frozenTicks ?? 0;
ok('light < medium < heavy: the first hit freezes fewer ticks than the second, the second fewer than the sweep, the sweep fewer than the third hit and the charged coil', cls('c1') < cls('c2') && cls('c2') < cls('sweep') && cls('sweep') < cls('c3') && cls('whip') >= cls('c3'), ['c1', 'c2', 'sweep', 'plunge', 'c3', 'whip'].map((m) => m + ' ' + cls(m)).join(' · '));
for (const A of all) {
  if (A.multi.enemies) { const q = A.multi.enemies; ok(`${A.area}: ${q.struck} x ${q.kind} struck by one third hit start ${q.started} hit sounds, spread ${q.delaysMs.join(' / ')} ms`, q.struck >= 2 && q.started === Math.min(q.struck, 5), `asked ${q.asked}, levels ${q.vols.join(' / ')}`); }
  if (A.multi.jars) { const q = A.multi.jars; ok(`${A.area}: ${q.broken} breakables broken in one tick start ${q.started} break sounds, spread ${q.delaysMs.join(' / ')} ms`, q.broken >= 2 && q.started === Math.min(q.broken, 5), `asked ${q.asked}, levels ${q.vols.join(' / ')}`); }
}
fs.writeFileSync(`${OUT}/feel.json`, JSON.stringify({ device: DEV, areas: all, rows }, null, 1));
for (const e of L.errs) { console.log('ERR ' + e); fails++; }
console.log(fails ? `FAILED: ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
