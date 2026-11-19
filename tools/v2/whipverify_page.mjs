// WHIP-VERIFY lane — own measurements in the real scene (v2g, story off, ONE browser, game advanced by ticks).
//   node tools/v2/whipverify_page.mjs --part press|feel|alloc|look [--devices fold_open,phone2] [--n 200] [--out /tmp/claude-0/v2/whipverify]
//   press  trusted touches (CDP Input.dispatchTouchEvent) on the pad's buttons at random moments of a fight; the stick is driven through the pad's
//          pointer handlers. What every press did, how many ticks later, fired twice / across a hit / later than 12 ticks; hook presses under a ring; 60 s of mashing
//   feel   tick table of a hit (stop, spark, flinch, flash, number, sound, vibration, lash on the body) + sounds started for 3 / 6 / 10 struck in one tick
//   alloc  garbage per frame: exact heap difference between forced collections in batches + sampling profile by owner (src/v2 against src/core)
//   look   stills at 120 samples a second around a hit (two per tick), cut around the hero, one sheet per sequence
import fs from 'node:fs';
import { launch, argsOf } from './whip_lib.mjs';

const args = argsOf(process.argv), OUT = String(args.out || '/tmp/claude-0/v2/whipverify'), PART = String(args.part || 'press'), DEVS = String(args.devices || 'fold_open,phone2').split(','), N = Number(args.n ?? 200);
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (!cond) fails++; };
const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const T0 = Date.now(), log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);

// ───────── in the page: helpers shared by the parts ─────────
function setup() {
  const v = window.__v2, sc = v.scene, W = window.__W, sim = sc.sim, h = sim.hero;
  W.drawEvery = 20; W.clear(); W.X0 = h.x; W.Z0 = h.z; W.ev = [];
  for (const x of sc.area.exits ?? []) { x.locked = true; if (x._box) x._box.solid = true; }   // nobody walks out of the area in the middle of a measurement
  const ev0 = sim.hooks.event;
  sim.hooks.event = function (name, a, b, c, d, e, f, g2) {
    if (name === 'attack') W.ev.push([W.n, 'move', b && b.id]); else if (name === 'roll') W.ev.push([W.n, 'roll']); else if (name === 'jump') W.ev.push([W.n, 'jump']); else if (name === 'act') W.ev.push([W.n, 'act', b]);
    else if (name === 'heroHurt') W.ev.push([W.n, 'hurt']); else if (name === 'deny') W.ev.push([W.n, 'deny', c]); else if (name === 'guard' || name === 'parry') W.ev.push([W.n, name]);
    return ev0 ? ev0.call(this, name, a, b, c, d, e, f, g2) : undefined;
  };
  W.snap = () => { if (!sc.sim) return { gone: true, n: W.n, go: JSON.stringify(sc._go ?? null) }; const q = sc.sim.hero; return { n: W.n, hurt: q.hurtT > 0, air: !q.onGround, move: q.move ? q.move.id : null, act: q.act, roll: q.dashT > 0, chg: !!q.charging, rollCd: +q.rollCd.toFixed(2), hook: q.hookId, guard: !!q.guard, gt: q.guardTap > 0, dead: !!q.dead, stop: sc.fx.feel.stop > 0, mx: sc.inp.mx, mz: sc.inp.mz, airAtk: !!q.airAtk }; };
  W.go = (n, o) => { const q = sc.sim.hero; if (o) { if (o.stick) W.stick(o.stick[0], o.stick[1]); if (o.reso) { q.reso = q.resoMax; q.callCd = 0; } if (o.home && Math.hypot(q.x - W.X0, q.z - W.Z0) > 230) { W.put(W.X0, W.Z0, 1, 0); W.tick(6); } } W.tick(n); return W.snap(); };
  W.fight = (kinds, at) => kinds.map((k, i) => W.enemy(k, W.X0 + at[i][0], W.Z0 + at[i][1], { awake: true, hp: 99999 }));
  W.ringSpot = () => { const P = sc.sim.hookPoints[0]; if (!P) return null; for (const d of [120, 90, 150, 60, 180, 210]) for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d; if (!Number.isFinite(W.ground(x, z))) continue; W.put(x, z, 1, 0); W.tick(3); const q = sc.sim.hero; if (q.hookId != null && q.onGround) return { x, z, ring: P.id }; } return null; };
  const B = {}; for (const id of ['attack', 'roll', 'jump', 'skill']) { const b = W.btn(id); B[id] = b ? { cx: b.cx, cy: b.cy } : null; }
  return { btn: B, x0: W.X0, z0: W.Z0, kinds: [...new Set(sim.enemies.map((q) => q.kid))], rings: sim.hookPoints.length };
}

// ───────── press ─────────
const KIND = { attack: 'move', roll: 'roll', jump: 'jump', skill: 'act' };
function judge(presses, ev, tag) {
  const C = {}; for (const k of ['attack', 'roll', 'jump', 'skill']) C[k] = { n: 0, fired: 0, guard: 0, told: 0, nothing: 0, nothingBy: {}, late: 0, lateList: [], acrossHit: 0, max: 0, waits: {} };
  const P = presses.map((p) => ({ ...p, used: false })), hurts = ev.filter((e) => e[1] === 'hurt').map((e) => e[0]), orphans = [];
  for (const p of P) C[p.K].n++;
  for (const e of ev) {
    let K = null; if (e[1] === 'move') { if (e[2] === 'whip') continue; K = 'attack'; } else if (e[1] === 'roll') K = 'roll'; else if (e[1] === 'jump') K = 'jump'; else if (e[1] === 'act' && (e[2] === 'hook' || e[2] === 'call')) K = 'skill'; else continue;
    let best = null; for (const p of P) if (p.K === K && !p.used && p.n0 <= e[0] && e[0] - p.n0 <= 45) best = p;
    if (!best) { orphans.push({ tick: e[0], what: e[2] ?? e[1] }); continue; }
    best.used = true; best.fire = e[0]; best.what = e[2] ?? e[1];
    const w = e[0] - best.n0, c = C[K]; c.fired++; c.waits[w] = (c.waits[w] ?? 0) + 1; if (w > c.max) c.max = w;
    if (w > 12 && e[2] !== 'sweep') { c.late++; c.lateList.push(`${w}t ${best.what} (was ${best.s0.hurt ? 'stunned' : best.s0.move ?? (best.s0.roll ? 'roll' : best.s0.act ?? (best.s0.air ? 'air' : 'free'))}${best.s0.stop ? ', frozen' : ''})`); }
    if (hurts.some((t) => t >= best.n0 && t < e[0])) c.acrossHit++;
  }
  for (const p of P) { if (p.used) continue; const c = C[p.K];
    if (p.K === 'roll' && (p.s1.guard || p.s1.gt || ev.some((e) => (e[1] === 'guard' || e[1] === 'parry') && e[0] >= p.n0 && e[0] <= p.n0 + 20))) { c.guard++; continue; }
    if (p.K === 'skill' && ev.some((e) => e[1] === 'deny' && e[0] >= p.n0 && e[0] <= p.n0 + 14 && e[2] !== 'busy')) { c.told++; continue; }
    c.nothing++; const st = p.s0.dead ? 'dead' : p.s0.hurt ? 'stunned' : p.s0.act ? 'act:' + p.s0.act : p.s0.roll ? 'rolling' : p.s0.move ? 'move:' + p.s0.move : p.s0.chg ? 'charging' : p.s0.air ? 'air' : p.s0.guard ? 'guarding' : (p.K === 'roll' && !(p.s0.mx || p.s0.mz) ? 'free,no stick' : 'free'); c.nothingBy[st] = (c.nothingBy[st] ?? 0) + 1; }
  for (const k of ['attack', 'roll', 'jump', 'skill']) { const c = C[k]; if (!c.n) continue; console.log(`   ${tag} ${k.padEnd(6)} presses ${c.n} · fired ${c.fired}${c.guard ? ' · guard ' + c.guard : ''}${c.told ? ' · refused and told ' + c.told : ''} · did nothing ${c.nothing} ${JSON.stringify(c.nothingBy)} · later than 12 ticks ${c.late} ${c.lateList.slice(0, 6).join('; ')} · across a hit ${c.acrossHit} · longest wait ${c.max} · waits ${JSON.stringify(c.waits)}`); }
  console.log(`   ${tag} actions with no press of their own: ${orphans.length} ${JSON.stringify(orphans.slice(0, 10))}`);
  return { C, orphans };
}
async function partPress(L) {
  const res = {};
  for (const dev of DEVS) {
    const page = await L.page(dev); await L.open(page, 'graveyard_now', '&v2res=0.5');
    const cdp = await page.context().newCDPSession(page), info = await page.evaluate(setup), R = rng(dev.length * 977 + 3);
    log(`${dev}: buttons ${JSON.stringify(info.btn)} · kinds ${info.kinds.join(',')} · rings ${info.rings}`);
    const down = (b) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.cx, y: b.cy, id: 1, radiusX: 6, radiusY: 6, force: 0.5 }] }), up = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // a: fight — attack / roll / jump / skill at random moments, four enemies awake
    await page.evaluate(() => { const W = window.__W; W.put(W.X0, W.Z0, 1, 0); W.fight(['skeleton_soldier', 'skeleton_soldier', 'grave_ghost', 'gravekeeper_armor'], [[130, 0], [-120, 40], [20, 140], [60, -130]]); W.tick(20); });
    const order = []; for (const k of ['attack', 'roll', 'jump', 'skill']) for (let i = 0; i < N; i++) order.push(k); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const presses = []; let trustedSeen = null;
    for (let i = 0; i < order.length; i++) {
      const K = order[i], gap = 5 + Math.floor(R() * 30), hd = 2 + Math.floor(R() * 4); let st = null;
      if (K === 'roll') { if (R() < 0.85) { const a = R() * 6.2832; st = [Math.cos(a), Math.sin(a)]; } else st = [0, 0]; } else if (R() < 0.4) { if (R() < 0.25) st = [0, 0]; else { const a = R() * 6.2832; st = [Math.cos(a), Math.sin(a)]; } }
      const s0 = await page.evaluate(([n, o]) => window.__W.go(n, o), [gap, { stick: st, reso: K === 'skill', home: true }]);
      if (s0.gone) { console.log(`   ${dev}: the scene let go of its rules at press ${i} (${s0.go}) — stopped`); break; }
      if (trustedSeen === null) trustedSeen = await page.evaluate(() => new Promise((r) => { window.addEventListener('pointerdown', (e) => r({ trusted: e.isTrusted, type: e.pointerType }), { once: true, capture: true }); setTimeout(() => r(null), 1500); window.__probe = 1; })).catch(() => null), 0;
      await down(info.btn[K]);
      const s1 = await page.evaluate((n) => window.__W.go(n), hd);
      await up();
      presses.push({ K, n0: s0.n, s0, s1, hd });
      if (i % 200 === 199) log(`${dev}: ${i + 1} presses`);
    }
    const tail = await page.evaluate(() => { const W = window.__W; W.stick(0, 0); W.go(60); const ev = W.ev; W.ev = []; return { ev, lost: W.lost() }; });
    console.log(`[press] ${dev}: fight, ${presses.length} trusted presses`);
    const J = judge(presses, tail.ev, dev);
    // b: the hook under a ring, a grave-keeper striking, the hero busy in different ways
    const ring = await page.evaluate(() => { const W = window.__W, sc = window.__v2.scene; for (const e of sc.sim.enemies) if (e._used) { e._used = false; } W.clear(); const s = W.ringSpot(); if (s) { W.RX = s.x; W.RZ = s.z; W.enemy('gravekeeper_armor', s.x + 70, s.z + 30, { awake: true, hp: 99999 }); } return s; });
    let JR = null;
    if (ring) {
      const pr = [];
      for (let i = 0; i < Math.min(N, 120); i++) {
        const pre = ['none', 'attack', 'attack', 'attack', 'jump', 'roll'][Math.floor(R() * 6)], d = Math.floor(R() * 15);
        const s0 = await page.evaluate(([pre, d]) => { const W = window.__W, sc = window.__v2.scene, h = sc.sim.hero; W.put(W.RX, W.RZ, 1, 0); W.tick(4 + Math.floor(Math.random() * 30));
          if (pre === 'attack') { W.down('attack'); W.tick(2); W.up('attack'); W.tick(Math.max(0, d - 2)); } else if (pre === 'jump') { W.down('jump'); W.tick(2); W.up('jump'); W.tick(d); } else if (pre === 'roll') { W.stick(1, 0); W.tick(1); W.down('roll'); W.tick(2); W.up('roll'); W.stick(0, 0); W.tick(d); }
          return W.snap(); }, [pre, d]);
        await down(info.btn.skill); const s1 = await page.evaluate(() => window.__W.go(3)); await up();
        const s2 = await page.evaluate(() => { const W = window.__W, h = window.__v2.scene.sim.hero; W.go(14); const s = W.snap(); let k = 0; while (h.act && k++ < 90) W.tick(1); return s; });
        pr.push({ K: 'skill', n0: s0.n, s0, s1, hd: 3, pre, d, hookAtPress: s0.hook != null, hookLater: s2.hook != null || s2.act === 'hook' });
      }
      const ev = await page.evaluate(() => { const W = window.__W; const ev = W.ev; W.ev = []; return ev; });
      console.log(`[press] ${dev}: hook under ring ${ring.ring} at (${Math.round(ring.x)},${Math.round(ring.z)}), ${pr.length} trusted skill presses (pre-action: none / attack / jump / roll d ticks before)`);
      JR = judge(pr, ev, dev + ' ring');
      const lit = pr.filter((p) => p.hookAtPress), thrown = lit.filter((p) => ev.some((e) => e[1] === 'act' && e[2] === 'hook' && e[0] >= p.n0 && e[0] <= p.n0 + 13));
      const missed = lit.filter((p) => !thrown.includes(p)).map((p) => `${p.pre}+${p.d}${p.s0.hurt ? ' stunned' : ''}${p.s0.air ? ' air' : ''}${p.s0.roll ? ' rolling' : ''}`);
      console.log(`   ${dev} ring: hook lit at the press ${lit.length} · thrown within 13 ticks ${thrown.length} · not thrown: ${missed.length} ${JSON.stringify(missed.slice(0, 14))}`);
      JR.lit = lit.length; JR.thrown = thrown.length; JR.missed = missed;
    } else console.log(`[press] ${dev}: no spot found from which the ring lights the hook`);
    // c: 60 s of mashing (through the pad's pointer handlers, in the page)
    const mash = await page.evaluate((seed) => {
      const sc = window.__v2.scene, W = window.__W, h = sc.sim.hero; let s = seed >>> 0; const R = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
      W.clear(); W.put(W.X0, W.Z0, 1, 0); W.fight(['skeleton_soldier', 'skeleton_soldier', 'grave_ghost', 'gravekeeper_armor'], [[130, 0], [-120, 40], [20, 140], [60, -130]]); W.ev = [];
      const held = { attack: 0, roll: 0, jump: 0, skill: 0 }, seen = {}, worst = {}; let run = 0, sig0 = '';
      for (let i = 0; i < 3600; i++) {
        for (const k in held) { if (held[k] > 0) { if (--held[k] === 0) W.up(k); } else if (R() < 0.3) { W.down(k); held[k] = 1 + Math.floor(R() * (R() < 0.08 ? 45 : 4)); } }
        if (i % 14 === 0) { if (R() < 0.2) W.stick(0, 0); else { const a = R() * 6.2832; W.stick(Math.cos(a), Math.sin(a)); } }
        if (i % 300 === 0 && Math.hypot(h.x - W.X0, h.z - W.Z0) > 300) W.put(W.X0, W.Z0, 1, 0);
        h.reso = h.resoMax; W.tick(1);
        const sig = h.move ? 'move:' + h.move.id : h.act ? 'act:' + h.act : h.charging ? 'charging' : h.dashT > 0 ? 'roll' : h.hurtT > 0 ? 'hurt' : h.guard ? 'guard' : !h.onGround ? 'air' : 'free';
        seen[sig] = (seen[sig] ?? 0) + 1; if (sig === sig0) run++; else { run = 1; sig0 = sig; } if (run > (worst[sig] ?? 0)) worst[sig] = run;
      }
      for (const k in held) if (held[k] > 0) W.up(k); W.stick(0, 0); W.tick(240);
      const n = {}; for (const e of W.ev) { const k = e[1] + (e[2] ? ':' + e[2] : ''); n[k] = (n[k] ?? 0) + 1; }
      return { seen, worst, events: n, end: { move: h.move ? h.move.id : null, act: h.act, chg: !!h.charging, roll: h.dashT > 0, hurt: h.hurtT > 0, guard: !!h.guard, air: !h.onGround, dead: !!h.dead, queued: h.queued > 0, bufD: h.bufD > 0, bufJ: h.bufJ > 0, bufS: h.bufS > 0 }, lost: W.lost() };
    }, 12345 + dev.length);
    console.log(`[press] ${dev}: mash 3600 ticks — ticks by state ${JSON.stringify(mash.seen)} · longest unbroken run ${JSON.stringify(mash.worst)} · events ${JSON.stringify(mash.events)} · 4 s after letting go ${JSON.stringify(mash.end)}`);
    const E = mash.end, free = !E.move && !E.act && !E.chg && !E.roll && !E.hurt && !E.guard && !E.air && !E.dead && !E.queued && !E.bufD && !E.bufJ && !E.bufS;
    const longMove = Object.entries(mash.worst).filter(([k, n]) => (k.startsWith('move:') && k !== 'move:plunge' && n > 60) || (k === 'roll' && n > 30) || (k === 'charging' && n > 90) || (k.startsWith('act:') && n > 150));
    ok(`${dev}: trusted touches reach the pad (first pointerdown seen in the page)`, !trustedSeen || trustedSeen.trusted !== false, JSON.stringify(trustedSeen));
    ok(`${dev}: fight — no action without a press of its own (no press fires twice)`, J.orphans.length === 0, J.orphans.length + ' orphans');
    ok(`${dev}: fight — no press fires across a hit`, Object.values(J.C).every((c) => c.acrossHit === 0));
    ok(`${dev}: fight — no press fires later than 12 ticks (frozen ticks counted; a sweep out of a roll aside)`, Object.values(J.C).every((c) => c.late === 0), Object.entries(J.C).map(([k, c]) => `${k} ${c.late}`).join(' · '));
    ok(`${dev}: fight — a press with the hero free on the ground always does something`, Object.entries(J.C).every(([k, c]) => !(c.nothingBy.free > 0)), Object.entries(J.C).map(([k, c]) => `${k} ${c.nothingBy.free ?? 0}`).join(' · '));
    if (JR) ok(`${dev}: ring — every skill press with the hook lit throws it within 13 ticks`, JR.thrown === JR.lit, `${JR.thrown} of ${JR.lit}`);
    ok(`${dev}: mash 60 s — the hero is free 4 s after letting go, no move that never ends`, free && longMove.length === 0, JSON.stringify(longMove));
    ok(`${dev}: no WebGL context lost`, !tail.lost && !mash.lost);
    res[dev] = { fight: J, ring: JR, mash, trustedSeen };
    await page.context().close();
  }
  fs.writeFileSync(`${OUT}/press.json`, JSON.stringify(res));
}

// ───────── feel ─────────
async function feelInPage() {
  const v = window.__v2, sc = v.scene, W = window.__W, g = window.__game, fx = sc.fx, F = fx.feel, sim = sc.sim;
  const { feel } = await import('/src/v2/feel/index.js'), { PRESET_IDS } = await import('/src/v2/fx/index.js'); const NAME = {}; for (const k in PRESET_IDS) NAME[PRESET_IDS[k]] = k;
  W.clear(); W.drawEvery = 0; const X0 = sim.hero.x, Z0 = sim.hero.z, rec = { t: 0, fx: [], snd: [], buzz: [], hit: [], brk: [] };
  const p0 = fx.playAt.bind(fx); fx.playAt = (id, x, y, z, ...r) => { rec.fx.push({ t: rec.t, name: NAME[id] ?? String(id) }); return p0(id, x, y, z, ...r); };
  const f0 = feel.sound.fire.bind(feel.sound); feel.sound.fire = (r, bus, pos, vol, pitch, delay) => { const st = f0(r, bus, pos, vol, pitch, delay); rec.snd.push({ t: rec.t, bus, delay: Math.round((delay || 0) * 1000), started: !!st }); return st; };
  const h0 = feel.haptics.play.bind(feel.haptics); feel.haptics.play = (n) => { rec.buzz.push({ t: rec.t, name: n }); return h0(n); };
  const H = sim.hooks, hit0 = H.hit, brk0 = H.break;
  H.hit = function (e, dmg, mv, x, y, z, info) { rec.hit.push({ t: rec.t, id: mv.id, e }); return hit0.call(this, e, dmg, mv, x, y, z, info); };
  H.break = function (b, by, dx, dz) { rec.brk.push({ t: rec.t, by, b }); return brk0 ? brk0.call(this, b, by, dx, dz) : undefined; };
  const SCRIPT = { c1: { ev: [[2, 'd'], [5, 'u']], d: 70, n: 50 }, c3: { ev: [[2, 'd'], [5, 'u'], [13, 'd'], [16, 'u'], [26, 'd'], [29, 'u']], d: 80, n: 90 }, whip: { ev: [[2, 'd'], [52, 'u']], d: 170, n: 110 } };
  const lash = (C) => { const w = sc.whip, n = w.n, P = w.nodes; let m = 1e9; for (let i = 2; i < n; i++) { const o = i * 3, dh = Math.max(0, Math.hypot(P[o] - C.x, P[o + 2] - C.z) - C.r - 2), dv = P[o + 1] < C.y - 4 ? C.y - 4 - P[o + 1] : P[o + 1] > C.y + C.h + 4 ? P[o + 1] - C.y - C.h - 4 : 0, d = Math.hypot(dh, dv); if (d < m) m = d; } return Math.round(m); };
  let tReal = performance.now(); const pace = async () => { const w = tReal + 16.7 - performance.now(); if (w > 0.5) await new Promise((r) => setTimeout(r, w)); tReal = performance.now(); };
  const reset = () => { rec.t = 0; rec.fx.length = 0; rec.snd.length = 0; rec.buzz.length = 0; rec.hit.length = 0; rec.brk.length = 0; };
  const away = (e) => { e._used = false; e.x = e.homeX = -99999; e.z = e.homeZ = -99999; e._px = e.x; e._pz = e.z; e.active = false; e.state = 'idle'; e.atk = null; e.wakeBy = 'trigger'; e.stun = 0; e.kx = e.kz = 0; };
  const rows = [];
  const run = async (move, target) => {
    const S = SCRIPT[move], h = sim.hero; let e = null, b = null; W.put(X0, Z0, 1, 0); for (let i = 0; i < 20; i++) g.tick(1 / 60);
    if (target === 'jar') { b = sim.breakables.find((q) => !q.broken); if (!b) return; W.put(b.x - S.d, b.z, 1, 0); for (let i = 0; i < 20; i++) g.tick(1 / 60); } else e = W.enemy(target, X0 + S.d, Z0, {});
    reset(); const fr = []; let simT = sim.time;
    for (let i = 0; i < S.n; i++) {
      for (const q of S.ev) if (q[0] === i) { if (q[1] === 'd') W.down('attack'); else W.up('attack'); }
      h.hp = h.hpMax; await pace(); rec.t = i; g.tick(1 / 60);
      const moved = sim.time !== simT; simT = sim.time; const C = e ? { x: e.x, y: e.y, z: e.z, r: e.r, h: e.h } : b ? { x: b.x, y: b.y, z: b.z, r: b.r, h: b.h } : null;
      fr.push({ i, moved, stop: F.stop > 0, snap: !!sc._hitSnap, lash: C ? lash(C) : -1, flinch: e ? e.stun > 0 || ['hurt', 'stagger', 'death'].includes(e.anim) || e.state === 'dead' : false, flash: e ? e.flashT > 0 : false, num: sc.numbers.some((q) => q.on && q.t < 0.05), mv: h.move ? h.move.id : null });
    }
    W.up('attack');
    const hit = e ? rec.hit.find((q) => q.id === move && q.e === e) : rec.brk.find((q) => q.by === move), t0 = hit ? hit.t : null, row = { move, target, hitTick: t0 };
    if (t0 != null) {
      const first = (p) => { const q = fr.find((x) => x.i >= t0 - 3 && p(x)); return q ? q.i - t0 : null; }, firstR = (A, p) => { const q = A.find((x) => x.t >= t0 - 3 && p(x)); return q ? q.t - t0 : null; };
      const snd = rec.snd.filter((q) => q.t >= t0 - 3 && q.t <= t0 + 3 && /f3_hit|f3_big|f3_enemy/.test(q.bus));
      let frozen = 0; for (let k = t0 + 1; k < fr.length && !fr[k].moved; k++) frozen++;
      Object.assign(row, { stop: first((x) => x.stop), spark: firstR(rec.fx, (q) => q.name.startsWith('hit.')), sparks: [...new Set(rec.fx.filter((q) => q.t === t0).map((q) => q.name))].join('+'), flinch: first((x) => x.flinch), flash: first((x) => x.flash), number: first((x) => x.num),
        sound: snd.length ? snd[0].t - t0 : null, soundAsked: snd.length, soundStarted: snd.filter((q) => q.started).length, soundDelays: snd.map((q) => q.delay).join('/'), buzz: firstR(rec.buzz, () => true), buzzName: (rec.buzz.find((q) => q.t >= t0 - 3) ?? {}).name ?? null,
        snap: fr[t0]?.snap, frozenTicks: frozen, lashBefore2: fr[t0 - 2]?.lash, lashBefore1: fr[t0 - 1]?.lash, lashAtHit: fr[t0]?.lash, lashAfter1: fr[t0 + 1]?.lash });
    }
    rows.push(row); if (e) away(e); F.stop = 0; F.slowT = 0; for (let i = 0; i < 50; i++) { sim.hero.hp = sim.hero.hpMax; g.tick(1 / 60); } g.alpha = 1; g.render();
  };
  const kinds = ['skeleton_soldier', 'gravekeeper_armor'].filter((k) => sim.enemies.some((q) => q.kid === k));
  for (const target of [...kinds, 'jar']) for (const move of ['c1', 'c3', 'whip']) await run(move, target);
  // N soldiers struck in one tick by the third hit
  const multi = [];
  for (const n of [3, 6, 10]) {
    W.put(X0, Z0, 1, 0); for (let i = 0; i < 10; i++) g.tick(1 / 60); const es = [];
    for (let k = 0; k < n; k++) { const a = -0.9 + (1.8 * k) / Math.max(1, n - 1), d = 56 + (k % 3) * 13; es.push(W.enemy('skeleton_soldier', X0 + Math.cos(a) * d, Z0 + Math.sin(a) * d * 0.8, { fresh: true })); }
    await new Promise((r) => setTimeout(r, 300)); reset(); const S = SCRIPT.c3;
    for (let i = 0; i < 80; i++) { for (const q of S.ev) if (q[0] === i) { if (q[1] === 'd') W.down('attack'); else W.up('attack'); } sim.hero.hp = sim.hero.hpMax; await pace(); rec.t = i; g.tick(1 / 60); }
    const by = {}; for (const q of rec.hit) { const k = q.t + ':' + q.id; (by[k] = by[k] ?? { tick: q.t, move: q.id, struck: 0 }).struck++; }
    for (const k in by) { const o = by[k], s = rec.snd.filter((q) => q.t === o.tick && /f3_hit|f3_big/.test(q.bus)), en = rec.snd.filter((q) => q.t === o.tick && /f3_enemy/.test(q.bus)); o.asked = s.length; o.started = s.filter((q) => q.started).length; o.delays = s.map((q) => q.delay).join('/'); o.enemyBusAsked = en.length; o.enemyBusStarted = en.filter((q) => q.started).length; o.buzz = rec.buzz.filter((q) => q.t === o.tick).map((q) => q.name).join('+'); }
    multi.push({ n, hits: Object.values(by) }); for (const e of es) away(e); F.stop = 0; for (let i = 0; i < 60; i++) g.tick(1 / 60);
  }
  // every whole breakable within 400 px of the densest spot, broken in one tick
  let jars = null; { const B = (sim.breakables ?? []).filter((q) => !q.broken); if (B.length) { let best = null, bn = 0; for (const q of B) { const c = B.filter((o) => Math.hypot(o.x - q.x, o.z - q.z) < 400).length; if (c > bn) { bn = c; best = q; } }
    await new Promise((r) => setTimeout(r, 400)); reset(); rec.t = 0; const c = sim.breakAt(best.x, best.z, 400, 'sweep'); g.tick(1 / 60); const s = rec.snd.filter((q) => /f3_enemy/.test(q.bus)); jars = { broken: c, asked: s.length, started: s.filter((q) => q.started).length, delays: s.map((q) => q.delay).join('/') }; } }
  return { area: v.area, rows, multi, jars };
}
async function partFeel(L) {
  const page = await L.page(DEVS[0]); await L.open(page, String(args.area || 'graveyard_now'), '&v2res=0.5');
  const r = await page.evaluate(feelInPage);
  console.log(`[feel] ${r.area} (${DEVS[0]}) — ticks relative to the tick in which the rules land the hit (0 = same tick, drawn on the first frame after it)`);
  console.log('   move  target              stop spark flinch flash number sound buzz | snap frozen | lash to body (px) 2 before / 1 before / hit tick / after | sparks · sound asked/started (delays ms) · buzz');
  for (const q of r.rows) console.log(q.hitTick == null ? `   ${q.move.padEnd(5)} ${q.target.padEnd(18)} NO HIT` : `   ${q.move.padEnd(5)} ${q.target.padEnd(18)} ${[q.stop, q.spark, q.flinch, q.flash, q.number, q.sound, q.buzz].map((x) => String(x ?? '-').padStart(4)).join('  ')} | ${String(q.snap).padEnd(5)} ${String(q.frozenTicks).padStart(2)} | ${[q.lashBefore2, q.lashBefore1, q.lashAtHit, q.lashAfter1].map((x) => String(x).padStart(4)).join(' ')} | ${q.sparks} · ${q.soundAsked}/${q.soundStarted} (${q.soundDelays}) · ${q.buzzName}`);
  for (const m of r.multi) for (const hgrp of m.hits) console.log(`   ${m.n} soldiers: tick ${hgrp.tick} ${hgrp.move} struck ${hgrp.struck} · hit sounds asked ${hgrp.asked} started ${hgrp.started} (delays ${hgrp.delays}) · enemy-bus asked ${hgrp.enemyBusAsked} started ${hgrp.enemyBusStarted} · buzz ${hgrp.buzz}`);
  console.log(`   breakables in one tick: ${JSON.stringify(r.jars)}`);
  const hitRows = r.rows.filter((q) => q.hitTick != null && q.target !== 'jar');
  ok('every measured hit: stop, spark, flinch, flash, number, sound and vibration begin in the tick of the hit', hitRows.length > 0 && hitRows.every((q) => [q.stop, q.spark, q.flinch, q.flash, q.number, q.sound, q.buzz].every((x) => x === 0)), hitRows.filter((q) => ![q.stop, q.spark, q.flinch, q.flash, q.number, q.sound, q.buzz].every((x) => x === 0)).map((q) => q.move + '/' + q.target).join(', '));
  ok('every measured hit: the lash is on the body in the tick of the hit', hitRows.every((q) => q.lashAtHit <= 2), hitRows.map((q) => `${q.move}/${q.target.slice(0, 6)} ${q.lashAtHit}`).join(' · '));
  for (const m of r.multi) { const c3 = m.hits.filter((q) => q.move === 'c3').sort((a, b) => b.struck - a.struck)[0]; ok(`${m.n} soldiers in one third hit: struck ${c3?.struck}, hit sounds started ${c3?.started}`, !!c3 && c3.struck === m.n && c3.started >= Math.min(m.n, 3), JSON.stringify(c3)); }
  fs.writeFileSync(`${OUT}/feel.json`, JSON.stringify(r)); await page.context().close();
}

// ───────── alloc ─────────
async function partAlloc(L) {
  const AREAS = String(args.areas || 'graveyard_now,eshville_now,eshville_past').split(','), TIERS = String(args.tiers || 'mid').split(','), SCENS = String(args.scens || 'stand,fight,jars').split(','), SECS = Number(args.secs ?? 10), MAXF = Number(args.frames ?? 6000), BATCH = Number(args.batch ?? 40);
  const page = await L.page(DEVS[0]), cdp = await page.context().newCDPSession(page), rows = [];
  await cdp.send('HeapProfiler.enable');
  for (const area of AREAS) for (const tier of TIERS) for (const scen of SCENS) {
    await L.open(page, area, `&v2res=0.5&v2tier=${tier}`);
    const info = await page.evaluate((scen) => {
      const sc = window.__v2.scene, W = window.__W, g = window.__game, sim = sc.sim, h = sim.hero; W.drawEvery = 0; W.clear(); W.X0 = h.x; W.Z0 = h.z; let note = '';
      if (scen === 'fight') { const have = [...new Set(sim.enemies.map((q) => q.kid))], K = []; for (let i = 0; i < 6; i++) K.push(have[i % have.length]); const at = [[110, 0], [-110, 30], [30, 120], [50, -120], [150, 90], [-140, -80]]; K.forEach((k, i) => W.enemy(k, W.X0 + at[i][0], W.Z0 + at[i][1], { awake: true, hp: 99999 })); note = '6 awake: ' + K.join(','); }
      if (scen === 'jars') { const B = (sim.breakables ?? []).filter((q) => !q.broken); let fires = []; try { const seen = new Set(), walk = (o, d) => { if (!o || typeof o !== 'object' || seen.has(o) || d > 3) return; seen.add(o); if (Array.isArray(o)) { for (const q of o) walk(q, d + 1); return; } if (typeof o.x === 'number' && typeof o.z === 'number' && /fire|blaze|torch|brazier|flame/i.test(JSON.stringify(Object.values(o).filter((q) => typeof q === 'string')))) fires.push(o); for (const k in o) { const q = o[k]; if (q && typeof q === 'object' && !(q instanceof Float32Array)) walk(q, d + 1); } }; walk(sc.anchors, 0); } catch (e) { note += 'anchors: ' + e.message + ' '; }
        let best = null, bd = 1e9, bf = null; for (const b of B) for (const f of fires) { const d = Math.hypot(b.x - f.x, b.z - f.z); if (d < bd && Number.isFinite(W.ground(b.x - 70, b.z))) { bd = d; best = b; bf = f; } } if (!best) best = B.find((b) => Number.isFinite(W.ground(b.x - 70, b.z)));
        if (best) { W.put(best.x - 70, best.z, 1, 0); W.X0 = best.x - 70; W.Z0 = best.z; } note += `breakables ${B.length}, fires ${fires.length}, nearest fire to the jar ${bf ? Math.round(bd) + ' px' : 'none'}`; }
      W.brk0 = (sim.breakables ?? []).filter((q) => q.broken).length;
      W.frames = (n, scen) => { const q = sc.sim.hero, inp = sc.inp; for (let i = 0; i < n; i++) { q.hp = q.hpMax; if (scen !== 'stand' && (W.fn = (W.fn | 0) + 1) % 11 === 0) inp.attack = true; g.tick(1 / 60); g.alpha = 0.5; g.render(); } };
      const t0 = performance.now(); W.frames(40, scen); const ms = (performance.now() - t0) / 40; W.frames(200, scen);   // warm up
      return { ms, note, tier: sc.perf.tier, lost: W.lost() };
    }, scen);
    const frames = Math.max(BATCH * 5, Math.min(MAXF, Math.round((SECS * 1000) / info.ms / BATCH) * BATCH));
    await cdp.send('HeapProfiler.collectGarbage'); const uA = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 512, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const diffs = []; let dropped = 0;
    for (let f = 0; f < frames; f += BATCH) {
      await cdp.send('HeapProfiler.collectGarbage'); const u0 = (await cdp.send('Runtime.getHeapUsage')).usedSize;
      await page.evaluate(([n, s]) => { window.__W.frames(n, s); }, [BATCH, scen]);
      const u1 = (await cdp.send('Runtime.getHeapUsage')).usedSize; if (u1 - u0 < 0) dropped++; else diffs.push((u1 - u0) / BATCH);
    }
    const prof = (await cdp.send('HeapProfiler.stopSampling')).profile;
    await cdp.send('HeapProfiler.collectGarbage'); const uB = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    const own = { v2: 0, core: 0, other: 0 }, fn = {}; const walk = (nd) => { const u = nd.callFrame.url || '', o = u.includes('/src/v2/') ? 'v2' : u.includes('/src/core/') ? 'core' : 'other'; own[o] += nd.selfSize; if (nd.selfSize > 0) { const k = `${u.replace(/^.*\/src\//, '').replace(/\?.*$/, '') || '(page)'}:${nd.callFrame.functionName || '(anon)'}:${nd.callFrame.lineNumber + 1}`; fn[k] = (fn[k] ?? 0) + nd.selfSize; } for (const c of nd.children ?? []) walk(c); }; walk(prof.head);
    diffs.sort((a, b) => a - b); const med = diffs.length ? diffs[diffs.length >> 1] : NaN, mean = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length), end = await page.evaluate(() => ({ brk: (window.__v2.scene.sim.breakables ?? []).filter((q) => q.broken).length - window.__W.brk0, lost: window.__W.lost() }));
    const top = Object.entries(fn).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, b]) => `${k} ${(b / frames / 1024).toFixed(2)}`);
    const row = { area, tier: info.tier, scen, frames, msPerFrame: +info.ms.toFixed(1), exactMedian: Math.round(med), exactMean: Math.round(mean), exactMin: Math.round(diffs[0] ?? NaN), exactMax: Math.round(diffs[diffs.length - 1] ?? NaN), batches: diffs.length, dropped, retainedPerFrame: Math.round((uB - uA) / frames), sampledV2: Math.round(own.v2 / frames), sampledCore: Math.round(own.core / frames), sampledOther: Math.round(own.other / frames), top, note: info.note, broke: end.brk, lost: end.lost };
    rows.push(row); fs.writeFileSync(`${OUT}/alloc.json`, JSON.stringify(rows, null, 1));
    log(`${area} ${row.tier} ${scen}: ${frames} frames (${row.msPerFrame} ms each) · exact ${row.exactMedian} B/frame median (mean ${row.exactMean}, ${row.exactMin}…${row.exactMax}, ${row.batches} batches of ${BATCH}, ${dropped} dropped) · kept after collection ${row.retainedPerFrame} B/frame · sampled by owner: src/v2 ${row.sampledV2} · src/core ${row.sampledCore} · other ${row.sampledOther} B/frame · ${row.note}${scen === 'jars' ? ' · broke ' + row.broke : ''}${row.lost ? ' · CONTEXT LOST' : ''}`);
    console.log('      top (KB/frame): ' + top.join(' | '));
  }
  await page.context().close();
}

// ───────── look ─────────
async function partLook(L) {
  const AREAS = String(args.areas || 'graveyard_now,eshville_past').split(','), page = await L.page(DEVS[0]);
  const SEQ = { c3_front: { ev: [[2, 'd'], [5, 'u'], [13, 'd'], [16, 'u'], [26, 'd'], [29, 'u']], at: [80, 0], from: 30, n: 60, move: 'c3' }, c3_beside: { ev: [[2, 'd'], [5, 'u'], [13, 'd'], [16, 'u'], [26, 'd'], [29, 'u']], at: [10, 85], from: 30, n: 60, move: 'c3' },
    sweep_behind: { ev: [[14, 'd'], [17, 'u']], roll: [2, 5], at: [150, 0], at2: [20, 0], from: 20, n: 60, move: 'sweep' }, whip_front: { ev: [[2, 'd'], [52, 'u']], at: [170, 0], from: 50, n: 80, move: 'whip' } };
  const want = String(args.seqs || 'c3_front,c3_beside,sweep_behind,whip_front').split(',');
  for (const area of AREAS) {
    await L.open(page, area, '&v2res=0.5');
    await page.evaluate(() => { const W = window.__W, h = window.__v2.scene.sim.hero; W.clear(); W.drawEvery = 0; W.X0 = h.x; W.Z0 = h.z; });
    for (const name of want) {
      const S = SEQ[name]; if (!S) continue; const dir = `${OUT}/look_${area}_${name}`; fs.mkdirSync(dir, { recursive: true });
      await page.evaluate(([S]) => { const W = window.__W, sc = window.__v2.scene, g = window.__game; for (const e of sc.sim.enemies) if (e._used) { e._used = false; e.x = e.homeX = -99999; e.z = e.homeZ = -99999; e._px = e.x; e._pz = e.z; e.active = false; }
        W.put(W.X0, W.Z0, 1, 0); for (let i = 0; i < 20; i++) g.tick(1 / 60); W.foe = W.enemy('skeleton_soldier', W.X0 + S.at[0], W.Z0 + S.at[1], {}); if (S.at2) W.foe2 = W.enemy('skeleton_soldier', W.X0 + S.at2[0], W.Z0 + S.at2[1], { fresh: true }); W.i = 0; W.hitAt = -1; W.info = [];
        const H = sc.sim.hooks; if (!H._wv) { H._wv = H.hit; H.hit = function (e, dmg, mv, ...r) { if (W.hitAt < 0) W.hitAt = W.i; W.info.push(`${W.i}:${mv.id}`); return H._wv.call(this, e, dmg, mv, ...r); }; } }, [S]);
      let k = 0, hitAt = -1; const shots = [];
      for (let i = 0; i < S.n; i++) {
        const st = await page.evaluate(([S, i]) => { const W = window.__W, sc = window.__v2.scene, g = window.__game, h = sc.sim.hero; W.i = i; for (const q of S.ev) if (q[0] === i) { if (q[1] === 'd') W.down('attack'); else W.up('attack'); }
          if (S.roll) { if (i === S.roll[0] - 1) W.stick(1, 0); if (i === S.roll[0]) W.down('roll'); if (i === S.roll[1]) { W.up('roll'); } if (i === S.roll[1] + 14) W.stick(0, 0); }
          h.hp = h.hpMax; g.tick(1 / 60); const w = sc.whip, o = (w.n - 1) * 3; return { hitAt: W.hitAt, mv: h.move ? h.move.id : null, snap: !!sc._hitSnap, tip: [w.nodes[o], w.nodes[o + 1], w.nodes[o + 2]].map((q) => Math.round(q)), tipPrev: [w.prev[o], w.prev[o + 1], w.prev[o + 2]].map((q) => Math.round(q)), hx: Math.round(h.x), hz: Math.round(h.z) }; }, [S, i]);
        if (st.hitAt >= 0 && hitAt < 0) hitAt = st.hitAt;
        const live = st.mv === S.move || (hitAt >= 0 && i <= hitAt + 5);
        if (i >= S.from && live && k < 36) for (const al of [0.5, 1]) { await page.evaluate((a) => { const g = window.__game; g.alpha = window.__v2.scene._hitSnap ? 1 : a; g.render(); }, al); const f = `${dir}/f${String(k).padStart(2, '0')}_t${i}_${al === 1 ? 'b' : 'a'}${i === hitAt ? '_HIT' : ''}.png`; await page.screenshot({ path: f }); shots.push({ f, i, al, tip: st.tip, tipPrev: st.tipPrev, snap: st.snap, hit: i === hitAt }); k++; }
        if (hitAt >= 0 && i > hitAt + 6) break;
      }
      const info = await page.evaluate(() => { const W = window.__W; W.up('attack'); W.stick(0, 0); const sc = window.__v2.scene; sc.fx.feel.stop = 0; for (let i = 0; i < 60; i++) window.__game.tick(1 / 60); return W.info; });
      // tip travel per sample (px in the world between successive samples: alpha 0.5 = half way) — a kink or a jump shows as an outlier
      const tr = []; let last = null; for (const s of shots) { const p = s.al === 1 || s.snap ? s.tip : s.tip.map((q, j) => (q + s.tipPrev[j]) / 2); if (last) tr.push(Math.round(Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]))); last = p; }
      fs.writeFileSync(`${dir}/shots.json`, JSON.stringify({ shots, info, hitAt }));
      log(`${area} ${name}: ${shots.length} stills in ${dir} · hit tick ${hitAt} · hits ${info.join(' ')} · tip travel per sample (px): ${tr.join(' ')}`);
    }
  }
  await page.context().close();
}

const L = await launch(OUT);
try { if (PART === 'press') await partPress(L); else if (PART === 'feel') await partFeel(L); else if (PART === 'alloc') await partAlloc(L); else if (PART === 'look') await partLook(L); else throw new Error('unknown part ' + PART); }
catch (e) { L.errs.push('[tool] ' + (e?.stack ?? e)); }
await L.close();
ok('no page error', L.errs.length === 0, L.errs.slice(0, 4).join(' || ').slice(0, 900));
console.log(fails ? `FAILED ${fails}` : 'ALL OK'); process.exit(fails ? 1 : 0);
