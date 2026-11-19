// v2g route bot (ENGINE lane) — runs inside the page. Shared by tools/v2/game_check.mjs (test route) and tools/v2/game_walk.mjs
// (real areas: eshville_now -> graveyard gate -> graveyard_now -> mausoleum).
//   await page.evaluate(installBot, routeOrNull)      window.__bot = { decide, think, run, touchSetup, touchStep, touchRun, touchEnd, status, setRoute, opt ... }
// One brain (decide) for both input paths: digital (input auto source) and touch (pointer events on the pad's own handlers every tick).
/** in the page: the route bot. think() = digital decisions for the fast-forward run, pilot() = analog wishes for the touch run */
export function installBot(ROUTE0) {
  const g = window.__game, v = window.__v2, input = g.input;
  const ROUTE = Array.isArray(ROUTE0) ? ROUTE0.map((p) => [p[0], p[1]]) : [[330, 120], [560, 182], [790, 190], [1230, 190], [1300, 182], [1480, 182], [1520, 130], [1720, 190], [1990, 190], [2190, 190], [2190, 420], [2190, 960], [2190, 1500], [2190, 1720], [2190, 1860]];   // default = the test route (slice0)
  const B = (window.__bot = { wp: 0, t: 0, ticks: 0, simT: -1, deaths: v.scene.sim.deaths ?? 0, act: {}, stuck: 0, lx: 0, lz: 0, side: 0, atk: 0, minHp: 100, jumpT: 0, dodge: 0, fs: 0, skipMap: {}, skips: 0, max: { draws: 0, tris: 0, charTris: 0, drawn: 0, culled: 0, stop: 0, shots: 0, dying: 0, lights: 0 }, feel0: 0 });
  const target = (h, E, now) => { let tg = null, bd = 1e9; for (const e of E) { if (e.state === 'dead' || e.solid === false || (B.skipMap[e.id] ?? 0) > now) continue; const d = Math.hypot(e.x - h.x, (e.z - h.z) * 1.5); if (Math.abs(e.y - h.y) > 110) continue; if (!(e.active ? d < 620 : d < 300)) continue; if (d < bd) { bd = d; tg = e; } } return tg; };
  const waypoint = (h) => { let ni = B.wp, nd = 1e9; for (let i = B.wp; i < ROUTE.length; i++) { const d = Math.hypot(ROUTE[i][0] - h.x, ROUTE[i][1] - h.z); if (d < nd) { nd = d; ni = i; } } B.wp = ni; const w = ROUTE[B.wp]; if (Math.hypot(w[0] - h.x, w[1] - h.z) < 26 && B.wp < ROUTE.length - 1) B.wp++; return ROUTE[B.wp]; };
  input.setAutoSource(() => B.act);
  // options for real areas (tools/v2/game_walk.mjs): giveUp = rule ticks on one target before walking on, hunt() = true while the way ahead is shut and the arena must be cleared
  B.opt = { giveUp: 0, hunt: null, ring: null }; B.ringDone = false; B.kinds = {}; B.tgId = null; B.tgT = 0; B.hunting = false; B.hb = null;   // ring = { x, y, z } landing spot of a whip ring on the route: the touch driver taps the skill button whenever the rules show the hook (hero.hookId)
  B.setRoute = (r) => { ROUTE.length = 0; for (const p of r) ROUTE.push([p[0], p[1]]); B.wp = 0; B.skipMap = {}; };
  // ── one brain for both input paths: decide() -> analog wishes { mx, mz, attack, dash(roll), guard, jump } ──
  //    tactics for the real rules: walk the route; guard an attack that is being wound up in front of the hero (the roll button
  //    held without the stick), roll away from what cannot be guarded or comes from behind, strike in the gaps
  const D = (B.d = { lx: 0, lz: 0, lt: 0, stuckT: 0, escT: 0, escS: 1, rollT: 0, fs: 0, o: { mx: 0, mz: 0, attack: false, dash: false, guard: false, jump: false } });
  B.pt = 0; B.now = () => B.pt / 60;   // the bot's clock = rule ticks (works fast-forwarded, stands still during hit-stop)
  B.decide = () => {
    const o = D.o; o.mx = 0; o.mz = 0; o.attack = false; o.dash = false; o.guard = false; o.jump = false;
    if (!v.ready || !v.scene.sim) return o;   // an area is loading
    const sim = v.scene.sim, h = sim.hero, E = sim.enemies, now = B.now();
    B.minHp = Math.min(B.minHp, h.hp);
    if (h.dead || (sim.section === 'done' && !B.opt.giveUp)) return o;   // test route: the arena is the end. Real areas (giveUp set): play goes on
    if (B.opt.ring) { const R = B.opt.ring; if (h.onGround && !h.act && Math.hypot(h.x - R.x, h.z - R.z) < 70 && Math.abs(h.y - R.y) < 40) B.ringDone = true; if (B.ringDone) return o; }   // WHIP: landed on the terrace behind the whip ring - the walk ends here
    const hdx = h.dirX ?? h.facing ?? 1, hdz = h.dirZ ?? 0;
    // 1) something is about to hit: an enemy winding up within its reach, or a shot close by
    let th = null, td = 1e9, tx0 = 0, tz0 = 0, canGuard = true;
    for (let i = 0; i < E.length; i++) {
      const e = E[i]; if (e.dead || e.state === 'dead' || Math.abs(e.y - h.y) > 110) continue;
      const A = e.atk, wind = e.tele !== undefined ? e.tele > 0.2 && A && !A.shot : e.state === 'attack';
      if (!wind) continue;
      const d = Math.hypot(e.x - h.x, e.z - h.z), reach = A ? (A.box ? A.box.f1 + (A.lunge ?? 0) : A.radius ? A.radius.r + A.radius.fwd : 100) + 36 : 110;
      if (d < reach && d < td) { td = d; th = e; tx0 = e.x; tz0 = e.z; canGuard = e.tele !== undefined && (!A || (A.guard !== 'break' && A.guard !== 'chip')); }
    }
    const S = sim.shots;
    for (let i = 0; i < S.length; i++) { const q = S[i]; if (q.dead || q.friendly) continue; const d = Math.hypot(q.x - h.x, q.z - h.z); if (d < 150 && d < td && Math.abs(q.y - h.y - 60) < 90) { td = d; th = q; tx0 = q.x; tz0 = q.z; canGuard = sim.hero.guard !== undefined; } }
    if (th) {
      const ux = (tx0 - h.x) / (td || 1), uz = (tz0 - h.z) / (td || 1), front = hdx * ux + hdz * uz;
      if (canGuard && front > 0.35) { o.guard = true; return o; }                       // face it and block (the rules turn an early block into a parry)
      if (now > D.rollT) { D.rollT = now + 0.7; o.dash = true; o.mx = -ux; o.mz = -uz; if (Math.abs(o.mz) < 0.3 && (h.z < 100 || h.z > 2000)) o.mz = h.z < 100 ? 0.7 : -0.7; return o; }   // roll away
      o.mx = -ux; o.mz = -uz; return o;                                                  // roll not ready: step back
    }
    // 2) fight the nearest enemy that has seen us (or stands in the way), else follow the route
    let tg = target(h, v.enemies, B.t);
    if (tg && B.opt.giveUp > 0) {   // real areas: do not spend the night on one enemy that cannot be brought down (armoured front, ghosts)
      if (tg.id !== B.tgId) { B.tgId = tg.id; B.tgT = B.t; } else if (B.t - B.tgT > B.opt.giveUp && !(tg.yard && B.opt.hunt && B.opt.hunt())) { B.skipMap[tg.id] = B.t + 2400; tg = target(h, v.enemies, B.t); B.tgId = tg ? tg.id : null; B.tgT = B.t; }
    }
    // the gate at the end of the route is shut: go back along the route until what is left of the arena is found, then come back
    let back = null;
    if (!tg && B.opt.hunt && B.opt.hunt() && (B.hunting || B.wp >= ROUTE.length - 2)) {
      B.hunting = true; let bd = 1e9, far = null;
      for (const e of v.enemies) { if (!e.yard || e.state === 'dead') continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd) { bd = d; far = e; } }
      if (far && bd < 520) tg = far;
      else if (far) { if (B.hb == null) B.hb = ROUTE.length - 1; const w = ROUTE[B.hb]; if (Math.hypot(w[0] - h.x, w[1] - h.z) < 34 && B.hb > 0) B.hb--; back = ROUTE[B.hb]; }
    } else if (B.hunting && !(B.opt.hunt && B.opt.hunt())) { B.hunting = false; B.hb = null; let ni = 0, nd = 1e9; for (let i = 0; i < ROUTE.length; i++) { const d = Math.hypot(ROUTE[i][0] - h.x, ROUTE[i][1] - h.z); if (d < nd) { nd = d; ni = i; } } B.wp = ni; }
    let tx = null, tz = 0, fight = false;
    if (tg) {
      fight = true; const dx = tg.x - h.x, dz = tg.z - h.z, d = Math.hypot(dx, dz);
      if (d < 96 && Math.abs(dz) < 40) { o.mx = (dx / (d || 1)) * 0.55; o.mz = (dz / (d || 1)) * 0.55; o.attack = true; B.kinds[tg.kind] = (B.kinds[tg.kind] ?? 0) + 1; }   // in reach: face it (360 degrees) and strike
      else { const side = h.x <= tg.x ? -1 : 1; tx = tg.x + side * 62; tz = tg.z; }
    } else { const w = back ?? waypoint(h); tx = w[0]; tz = w[1]; }
    if (tx !== null) { const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz); if (d > 6) { const k = d > 50 ? 1 : 0.6; o.mx = (dx / d) * k; o.mz = (dz / d) * k; } }
    if (now - D.lt >= 0.25) { const moved = Math.hypot(h.x - D.lx, h.z - D.lz); D.lx = h.x; D.lz = h.z; D.lt = now; if ((o.mx || o.mz) && !o.attack && moved < 6) D.stuckT += 0.25; else D.stuckT = Math.max(0, D.stuckT - 0.25); }
    if (D.stuckT >= 0.75) { if (fight && ++D.fs >= 3) { B.skipMap[tg.id] = B.t + 420; D.fs = 0; B.skips++; } D.stuckT = 0; D.escT = now + 0.5; D.escS = h.z > 150 && h.z < 260 ? -1 : 1; if (fight && Math.random() < 0.5) D.escS = -D.escS; }
    if (now < D.escT) { o.jump = D.escT - now > 0.25; o.mz = D.escS; o.mx *= 0.3; o.attack = false; }
    return o;
  };
  const restart = () => { const d = v.scene.sim?.deaths ?? 0; if (d !== B.deaths) { B.deaths = d; B.wp = 0; B.skipMap = {}; D.stuckT = 0; D.escT = 0; } };   // fell and started over: follow the route from its beginning again
  /** true when the rules moved since the last call (false during hit-stop: keep the last decision) */
  const ruleTick = () => { if (!v.ready || !v.scene.sim) { B.ticks++; return false; } const st = v.scene.sim.time ?? 0; B.ticks++; if (st === B.simT) return false; B.simT = st; B.t++; B.pt++; restart(); return true; };
  // digital path (keyboard-like actions through the input auto source)
  B.think = () => {
    if (!ruleTick()) return;
    const o = B.decide(), a = (B.act = {});
    if (o.mx > 0.3) a.right = true; else if (o.mx < -0.3) a.left = true;
    if (o.mz > 0.3) a.up = true; else if (o.mz < -0.3) a.down = true;
    if (o.guard) a.dash = true;                                   // held with no direction = guard
    else if (o.dash) a.dash = B.t % 2 === 0;                      // a fresh press
    if (o.attack) { B.atk++; if (B.atk % 7 < 3) a.attack = true; }
    if (o.jump) a.jump = true;
  };
  const watch = () => {
    const sc = v.scene, s = sc.c3, F = sc.fx?.feel, M = B.max, G = sc.glr.stats;
    M.draws = Math.max(M.draws, G.draws + (sc.fx?.stats.draws ?? 0)); M.tris = Math.max(M.tris, G.tris); M.charTris = Math.max(M.charTris, s.tris); M.drawn = Math.max(M.drawn, s.drawn); M.culled = Math.max(M.culled, s.culled);
    if (F) M.stop = Math.max(M.stop, F.stop); M.shots = Math.max(M.shots, sc.shotN); M.lights = Math.max(M.lights, sc.fx?.lights.count ?? 0);
    let dy = 0; for (const a of sc.actors) if (a.dieAge >= 0) dy++; M.dying = Math.max(M.dying, dy);
  };
  B.run = (n, renderEvery) => {
    g._pageHidden = true;
    for (let i = 0; i < n; i++) {
      B.think(); g.tick(1 / 60); watch();
      if (renderEvery && i % renderEvery === 0) { g.alpha = 1; g.render(); watch(); }
      if (v.section === 'done' && !B.opt.giveUp) break;
    }
    g.alpha = 1; g.render();
    return B.status();
  };
  B.status = () => { const h = v.hero; if (!h || !v.ready) return { loading: true, ticks: B.ticks, area: v.area }; return { area: v.area, kinds: B.kinds, ticks: B.ticks, sec: v.section, x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), hp: h.hp, left: v.enemies.length, yard: v.enemies.filter((e) => e.yard).length, wp: B.wp, t: B.t, deaths: v.scene.sim.deaths ?? 0, minHp: B.minHp, max: B.max, skips: B.skips, feelN: v.scene.feelN - B.feel0, simT: +(v.scene.sim.time ?? 0).toFixed(1) }; };
  // touch driver: the pilot's wishes go through the virtual pad's own pointer handlers (stick drag + button presses) every tick
  const fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 21, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
  const COOL = { attack: 5, dash: 24, jump: 12, skill: 8 }, FINGER = { attack: 11, dash: 12, jump: 13, skill: 14 };
  B.touchSetup = (x0, y0, R, btn) => { B.ts = { x0, y0, R, btn, stick: false, held: { attack: 0, dash: 0, jump: 0, skill: 0 }, presses: { attack: 0, dash: 0, jump: 0, guard: 0, skill: 0 }, moves: 0, skillAt: [] }; input.setAutoSource(null); B.act = {}; };
  B.touchStep = () => {
    const S = B.ts; if (!ruleTick()) return;
    const w = B.decide(); watch();
    { const h = v.scene.sim?.hero; w.skill = !!(B.opt.ring && !B.ringDone && h && h.hookId != null && h.act !== 'hook' && !h.dead); if (w.skill && S.held.skill === 0 && S.skillAt.length < 40) S.skillAt.push(h.hurtT > 0 ? 'stunned' : h.move ? h.move.id : h.dashT > 0 ? 'roll' : h.charging ? 'charging' : h.onGround ? 'free' : 'air'); }   // WHIP: under a whip ring a player taps the skill button, whatever he is doing - the rules carry the press (input buffer)
    if (!S.stick) { fire('pointerdown', 21, S.x0, S.y0); S.stick = true; }
    fire('pointermove', 21, S.x0 + w.mx * S.R, S.y0 - w.mz * S.R); S.moves++;
    for (const k of ['attack', 'dash', 'jump', 'skill']) {
      const b = S.btn[k]; let st = S.held[k]; if (!b) continue;
      if (k === 'dash' && st === 999) { if (!w.guard) { fire('pointerup', FINGER[k], b.cx, b.cy); st = -3; } }          // guarding: the roll button stays down
      else if (k === 'dash' && w.guard && st <= 0) { fire('pointerdown', FINGER[k], b.cx, b.cy); S.presses.guard++; st = 999; }
      else if (st > 0) { if (--st === 0) { fire('pointerup', FINGER[k], b.cx, b.cy); st = -COOL[k]; } }
      else if (st < 0) st++;
      else if (w[k]) { fire('pointerdown', FINGER[k], b.cx, b.cy); S.presses[k]++; st = 3; }
      S.held[k] = st;
    }
  };
  B.touchEnd = () => { const S = B.ts; if (!S) return; for (const k of ['attack', 'dash', 'jump', 'skill']) if (S.held[k] > 0 && S.btn[k]) fire('pointerup', FINGER[k], S.btn[k].cx, S.btn[k].cy); if (S.stick) fire('pointerup', 21, S.x0, S.y0); S.stick = false; };
  B.touchRun = (n, renderEvery) => {
    g._pageHidden = true;
    for (let i = 0; i < n; i++) { B.touchStep(); g.tick(1 / 60); if (renderEvery && i % renderEvery === 0) { g.alpha = 1; g.render(); watch(); } if (v.section === 'done' && !B.opt.giveUp) break; }
    g.alpha = 1; g.render();
    // lift every finger between calls: the new pad lets go of touches by itself when the HUD has not been drawn for about a second
    // (its watchdog), which happens between two calls of a slow headless run — the next call presses again
    B.touchEnd(); B.ts.held.attack = 0; B.ts.held.dash = 0; B.ts.held.jump = 0; B.ts.held.skill = 0;
    const st = B.status(); st.presses = B.ts.presses; st.stickMoves = B.ts.moves; st.mode = input.mode; st.ringDone = B.ringDone; st.skillAt = B.ts.skillAt; return st;
  };
  B.stop = () => { B.act = {}; input.setAutoSource(null); };
  return true;
}

