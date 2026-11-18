// PLAY2-VERIFY (node, no screen): tries to break the rules.   node tools/v2/play_verify_fuzz.mjs [--only pairs,late,edge,boss,bots,fuzz]
//   pairs  every pair of buttons pressed on the same tick, from ten hero states (idle, run, air, hurt, dead, mid-attack, roll, guard, charging, tool act)
//   late   a released button must do nothing afterwards (no action start later than 0.5 s after everything is released)
//   edge   moves at the edge of a platform, against a wall, in the air
//   boss   wind-up ticks at 60 Hz, hits only inside the declared shape, every attack has an answer, stagger / phases reachable
//   bots   20 seeded fights for each test pilot
//   fuzz   30,000 fuzzed ticks with the boss and all kinds: NaN, stuck states
const { Sim, TUNE, KINDS, MOVES, flatArena, ATTACKS } = await import('../../src/v2/play/index.js');
const { bossBot, naiveBot } = await import('./play_bot.mjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const ONLY = args.only ? String(args.only).split(',') : null, want = (k) => !ONLY || ONLY.includes(k);
let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); } console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  (' + extra + ')' : '')); };
const DT = 1 / 60;
let seed = 1; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mk = (spawns = [], W = null) => { const log = []; const sim = new Sim(W ?? flatArena(520, 360, spawns), { event: (n, ...a) => log.push([sim._n ?? 0, n, a]) }); sim.log = log; sim._n = 0; return sim; };
const step = (sim, inp) => { sim._n++; sim.update(DT, inp); if (sim.stop > 0) sim.stop = 0; };   // the scene owns the hit-stop: it clears sim.stop every tick
const NUMK = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'dirX', 'dirZ', 'hp', 'reso', 'charge', 'bellCharge', 'gait', 'alpha', 'tele', 'hover', 'gy', 'poiseHp', 'staggerK'];
const bad = (sim) => { for (const o of [sim.hero, ...sim.enemies, ...sim.shots]) for (const k of NUMK) if (k in o && typeof o[k] === 'number' && !Number.isFinite(o[k])) return `${o === sim.hero ? 'hero' : o.kid ?? 'shot'}.${k}=${o[k]}`; const h = sim.hero, l = Math.hypot(h.dirX, h.dirZ); if (Math.abs(l - 1) > 1e-3) return 'hero dir length ' + l; return null; };
const blank = () => ({ mx: 0, mz: 0, jump: false, jumpHeld: false, attack: false, attackHeld: false, dash: false, guard: false, lockNext: false, skill: false, skillHeld: false, bell: false, bellHeld: false });
const BTN = { attack: (i) => { i.attack = true; i.attackHeld = true; }, jump: (i) => { i.jump = true; i.jumpHeld = true; }, roll: (i) => { i.dash = true; i.guard = true; }, skill: (i) => { i.skill = true; i.skillHeld = true; }, bell: (i) => { i.bell = true; i.bellHeld = true; }, lock: (i) => { i.lockNext = true; } };
const STARTS = ['attack', 'roll', 'act', 'jump', 'guardUp', 'charge'];
const restful = (h) => !h.move && !h.act && !h.charging && h.dashT <= 0 && !h.guard && h.hurtT <= 0 && h.onGround && !h.bellDown;

// hero states to press from. Each returns a sim prepared so that the next tick is "in" the state
const STATES = {
  idle: (s) => {},
  run: (s) => { const i = blank(); i.mx = 1; for (let k = 0; k < 30; k++) step(s, i); },
  air: (s) => { const i = blank(); i.jump = true; i.jumpHeld = true; step(s, i); i.jump = false; for (let k = 0; k < 8; k++) step(s, i); },
  hurt: (s) => { s.hurtHero(5, 1, 0, {}); step(s, blank()); },
  dead: (s) => { s.hurtHero(500, 1, 0, {}); step(s, blank()); },
  attack: (s) => { const i = blank(); i.attack = true; step(s, i); i.attack = false; for (let k = 0; k < 5; k++) step(s, i); },
  roll: (s) => { const i = blank(); i.mx = 1; i.dash = true; step(s, i); i.dash = false; i.mx = 0; for (let k = 0; k < 6; k++) step(s, i); },
  guard: (s) => { const i = blank(); i.guard = true; for (let k = 0; k < 20; k++) step(s, i); },
  charging: (s) => { const i = blank(); i.attackHeld = true; for (let k = 0; k < 30; k++) step(s, i); },
  act: (s) => { const i = blank(); i.bell = true; step(s, i); i.bell = false; for (let k = 0; k < 4; k++) step(s, i); },
};

if (want('pairs') || want('late')) {
  const names = Object.keys(BTN); let n = 0, late = [], stuck = [], nan = [], threw = [];
  for (const st of Object.keys(STATES)) for (let a = 0; a < names.length; a++) for (let b = a; b < names.length; b++) for (const stick of [0, 1]) for (const holdTicks of [1, 3, 30]) {
    n++; seed = 7 + n;
    const s = mk([{ kind: 'melee', x: -480, z: -320, active: false }]); s.enemies[0].wakeBy = 'trigger'; s.hero.reso = 2; s.hookPoints.push({ id: 'ring', x: -200, z: 0, y: 0, to: [-260, 0] });
    const tag = `${st} + ${names[a]}${b !== a ? '+' + names[b] : ''}${stick ? ' +stick' : ''} held ${holdTicks}`;
    try {
      STATES[st](s);
      const i = blank(); if (stick) { i.mx = 0.7; i.mz = 0.7; }
      BTN[names[a]](i); BTN[names[b]](i);
      const sameHold = (st === 'guard' ? 'guard' : st === 'charging' ? 'attackHeld' : null);   // the state's own held button is released together with the pair
      step(s, i); i.attack = i.jump = i.dash = i.skill = i.bell = i.lockNext = false;
      for (let k = 1; k < holdTicks; k++) step(s, i);
      const rel = s._n; const z = blank();
      let lateEv = null, restT = -1;
      for (let k = 0; k < 360; k++) {
        const l0 = s.log.length; step(s, z);
        for (let q = l0; q < s.log.length; q++) { const [t, name, ar] = s.log[q]; if (STARTS.includes(name) && !(name === 'charge' && ar[1] !== 'start') && (t - rel) * DT > 0.5 && st !== 'dead' && !lateEv) lateEv = `${name}${name === 'act' ? ':' + ar[1] : ''} ${((t - rel) * DT).toFixed(2)} s after release`; }
        const e = bad(s); if (e) { nan.push(tag + ' → ' + e); break; }
        if (restT < 0 && !s.hero.dead && restful(s.hero)) restT = k;
      }
      if (lateEv) late.push(tag + ' → ' + lateEv);
      if (!(restful(s.hero) || s.hero.dead)) stuck.push(tag + ` → anim ${s.hero.anim} act ${s.hero.act} move ${s.hero.move?.id} charging ${s.hero.charging} bellDown ${s.hero.bellDown} guard ${s.hero.guard}`);
    } catch (e) { threw.push(tag + ' → ' + String(e?.stack ?? e).split('\n').slice(0, 2).join(' | ')); }
  }
  ok(`pairs: ${n} cases (10 states × 21 button pairs × stick × hold 1/3/30 ticks): no exception`, threw.length === 0, threw.slice(0, 4).join(' ‖ '));
  ok('pairs: no NaN, direction stays a unit vector', nan.length === 0, nan.slice(0, 4).join(' ‖ '));
  ok('pairs: the hero is back at rest (or respawned) 6 s after everything is released', stuck.length === 0, `${stuck.length} stuck · ` + stuck.slice(0, 4).join(' ‖ '));
  ok('late: no action starts later than 0.5 s after every button is released', late.length === 0, `${late.length} cases · ` + late.slice(0, 6).join(' ‖ '));
  // update() without an input object while a jump is buffered (hit-stop) must not throw
  { const s = mk(); let err = null; try { s.stop = 0.05; s.update(DT, { jump: true }); s.stop = 0; s.update(DT); } catch (e) { err = String(e); } ok('update(dt) with no input after a buffered jump does not throw', !err, err ?? ''); }
}

if (want('edge')) {
  // a platform 200 × 200, 100 high, in the middle of the flat arena; the hero stands 6 px from its +x edge
  const mkW = () => { const W = flatArena(520, 360, []); W.boxes.push({ x0: -100, x1: 100, z0: -100, z1: 100, y0: 0, y1: 100, solid: true, walk: true }); W.start = { x: 92, z: 0, y: 100 }; return W; };
  const res = [];
  const acts = { attack3: (i, k) => { i.attack = k < 60 && k % 12 === 0; }, roll: (i, k) => { i.dash = k === 0; i.guard = k < 3; }, charge: (i, k) => { i.attackHeld = k < 50; }, bell: (i, k) => { i.bell = k === 0; i.bellHeld = k < 2; }, ring: (i, k) => { i.bell = k === 0; i.bellHeld = k < 90; }, guard: (i, k) => { i.guard = k < 40; }, jumpAtk: (i, k) => { i.jump = k === 0; i.jumpHeld = k < 10; i.attack = k === 12; }, rollAir: (i, k) => { i.jump = k === 0; i.jumpHeld = k < 10; i.dash = k === 14; }, runOff: (i) => {} };
  for (const [name, fn] of Object.entries(acts)) for (const dir of [[1, 0], [0.7, 0.7], [-1, 0]]) {
    const s = mk([], mkW()); const h = s.hero; let e = null, minY = 1e9;
    try { for (let k = 0; k < 240; k++) { const i = blank(); if (k < 60) { i.mx = dir[0]; i.mz = dir[1]; } fn(i, k); step(s, i); minY = Math.min(minY, h.y); e = e ?? bad(s); } } catch (x) { e = String(x); }
    const inWall = h.x > 520 || h.x < -520 || Math.abs(h.z) > 360, inBox = Math.abs(h.x) < 100 - 1 && Math.abs(h.z) < 100 - 1 && h.y < 99;
    if (e || inWall || inBox || !restful(h) || minY < -1) res.push(`${name} dir ${dir} → ${e ?? ''} x ${h.x.toFixed(0)} y ${h.y.toFixed(0)} z ${h.z.toFixed(0)} minY ${minY.toFixed(0)} anim ${h.anim}`);
  }
  ok('edge: nine move sets × three directions at a platform edge: no NaN, never inside the block or below the floor, back at rest', res.length === 0, res.slice(0, 5).join(' ‖ '));
  // against a wall: run into the +x wall of the arena, then every move; position must stay inside
  const out = [];
  for (const [name, fn] of Object.entries(acts)) { const s = mk(); const h = s.hero; h.x = 500; let e = null; for (let k = 0; k < 200; k++) { const i = blank(); i.mx = 1; fn(i, k); step(s, i); e = e ?? bad(s); } if (e || h.x > 520 - h.r + 1 || h.y < -1) out.push(`${name} → ${e ?? ''} x ${h.x.toFixed(1)} y ${h.y.toFixed(0)}`); }
  ok('wall: every move while pushing into a wall keeps the hero inside the arena', out.length === 0, out.join(' ‖ '));
}

if (want('boss')) {
  const A = ATTACKS, Q = [A.Q_WAIL, A.Q_SWEEP, A.Q_SCREAM, A.Q_SUMMON, A.Q_SONG];
  console.log('boss wind-ups at 60 Hz: ' + Q.map((a) => `${a.id} ${Math.round(a.windup * 60)} ticks (${a.windup} s), direction frozen for the last ${Math.round(a.windup * 0.2 * 60)}`).join(' · '));
  ok('boss: every wind-up is at least 0.6 s (36 ticks) — long enough to read and answer', Q.every((a) => a.windup >= 0.6), Q.map((a) => a.id + ' ' + Math.round(a.windup * 60)).join(' '));
  // hits only inside the declared shape: hero parked on a grid (does nothing), the attack forced; where he is hurt must lie inside shape + body radius
  const forced = (atk, hx, hz, bphase = 1) => { const s = mk([{ kind: 'banshee_queen', x: 0, z: 0, active: true, phase: bphase }]); const e = s.enemies[0], h = s.hero; h.x = hx; h.z = hz; e.cd = 99; e.dirX = 1; e.dirZ = 0; step(s, blank()); s.startAttack(e, atk); e.cd = 99; return s; };
  for (const atk of [A.Q_SWEEP, A.Q_SCREAM, A.Q_SONG, A.Q_WAIL]) {
    let outside = [], hits = 0, n = 0, far = 0;
    for (let gx = -700; gx <= 700; gx += 50) for (let gz = -340; gz <= 340; gz += 42) {
      if (Math.hypot(gx, gz) < 50) continue; n++; seed = n;
      const s = forced(atk, gx, gz), e = s.enemies[0], h = s.hero; const hp0 = h.hp; let hurtAt = null, dir = null;
      const W = s.W; W.boxes[0].x0 = -900; W.boxes[0].x1 = 900;   // (wide floor so far lanes can be tested)
      for (let k = 0; k < Math.round((atk.windup + atk.strike + 3.4) * 60) && !hurtAt; k++) { const i = blank(); step(s, i); if (e.phase === 'strike' && !dir) dir = [e.dirX, e.dirZ, e.x, e.z]; if (h.hp < hp0) hurtAt = [h.x, h.z]; h.x = gx; h.z = gz; h.vx = h.vz = 0; e.cd = 99; }
      if (!hurtAt) continue; hits++;
      const ex = gx - dir[2], ez = gz - dir[3], d = Math.hypot(ex, ez), f = ex * dir[0] + ez * dir[1], l = Math.abs(ez * dir[0] - ex * dir[1]); let inside = true;
      if (atk.arc) inside = d <= atk.arc.r + h.r + 1 && (d < h.r + 10 || Math.atan2(l, f) * 180 / Math.PI <= atk.arc.deg / 2 + 1);
      else if (atk.radius) inside = d <= atk.radius.r + h.r + 1;
      else if (atk.pulse) inside = d <= atk.pulse.r + 1;
      else if (atk.mark?.box) { const b = atk.mark.box; inside = false; for (let q = 0; q < atk.mark.fan; q++) { const an = (q - (atk.mark.fan - 1) / 2) * atk.mark.spread * Math.PI / 180, c = Math.cos(an), sn = Math.sin(an), lx = dir[0] * c - dir[1] * sn, lz = dir[0] * sn + dir[1] * c, ff = ex * lx + ez * lz, ll = Math.abs(ez * lx - ex * lz); if (ff >= b.f0 - h.r && ff <= b.f1 + h.r && ll <= b.side + h.r) inside = true; } far = Math.max(far, d); }
      if (!inside) outside.push(`(${gx},${gz}) d ${d.toFixed(0)}`);
    }
    ok(`boss ${atk.id}: every hit on a standing hero lies inside the declared warning shape (+ body radius)`, outside.length === 0 && hits > 0, `${hits} hit spots of ${n}${far ? ' · farthest hit ' + far.toFixed(0) + ' px' : ''} · outside ${outside.length}: ` + outside.slice(0, 5).join(' '));
  }
  // answers: from 110 px in front of her (worst place), each answer tried; at least one must leave the hero unhurt
  const answers = {
    walkX: (i, k, s) => { i.mx = -1; }, walkZ: (i, k, s) => { i.mz = 1; },
    rollLate: (i, k, s) => { const e = s.enemies[0]; if (e.atk && Math.abs(e.atk.windup - e.stateT - 0.1) < DT * 0.6) { i.mx = -1; i.dash = true; } },
    guard: (i, k, s) => { i.guard = true; },
    parry: (i, k, s) => { const e = s.enemies[0]; i.guard = !!e.atk && e.atk.windup - e.stateT < 0.1; },
    bell: (i, k, s) => { i.bell = k === 18; },
    runRollZ: (i, k, s) => { i.mz = 1; i.dash = k === 30; },
  };
  for (const atk of [A.Q_WAIL, A.Q_SWEEP, A.Q_SCREAM, A.Q_SONG]) {
    const r = {};
    for (const [nm, fn] of Object.entries(answers)) { seed = 99; const s = forced(atk, 110, 0, 2), h = s.hero, e = s.enemies[0]; const hp0 = h.hp; for (let k = 0; k < Math.round((atk.windup + atk.strike + atk.recover + 2) * 60); k++) { const i = blank(); fn(i, k, s); step(s, i); e.cd = 99; } r[nm] = hp0 - h.hp; }
    const unhurt = Object.entries(r).filter(([, v]) => v === 0).map(([k]) => k);
    ok(`boss ${atk.id}: avoidable from 110 px in front (answers that take no damage)`, unhurt.length > 0, 'unhurt: ' + (unhurt.join(', ') || 'NONE') + ' · damage ' + Object.entries(r).map(([k, v]) => k + ' ' + v).join(' '));
  }
  // stagger and phases reachable by plain play: bossBot fight, events seen
  { seed = 4242; const s = mk([{ kind: 'banshee_queen', x: 260, z: 0, active: true }]); const inp = blank(), st = {}; const seen = new Set(); let t = 0; while (t < 240 && !s.enemies[0].dead && !s.hero.dead && s.deaths === 0) { bossBot(s, inp, st); const l0 = s.log.length; step(s, inp); for (let q = l0; q < s.log.length; q++) seen.add(s.log[q][1]); t += DT; }
    ok('boss: stagger, flee, return, phase 2 (summon or song), kneel and knell are all reached in one read-the-tells fight', ['bossStagger', 'bossFlee', 'bossReturn', 'kneel', 'knell', 'bossDown'].every((k) => seen.has(k)) && (seen.has('summon') || seen.has('pulse')), [...seen].filter((k) => /boss|kneel|knell|summon|pulse|silence/.test(k)).join(' ') + ` · ${t.toFixed(0)} s`); }
}

if (want('bots')) {
  const fight = (bot, sd) => { seed = sd; const s = mk([{ kind: 'banshee_queen', x: 260, z: 0, active: true }]); const inp = blank(), st = {}; let t = 0, end = null, e = null; while (t < 420 && !end) { bot(s, inp, st); step(s, inp); t += DT; e = e ?? bad(s); if (s.hero.dead || s.deaths > 0) end = 'lost'; else if (s.enemies[0].dead || s.enemies[0].state === 'dead') end = 'won'; } return { end: end ?? 'timeout', t, hp: s.hero.hp, bad: e }; };
  const W = [], L = []; for (let i = 1; i <= 20; i++) { W.push(fight(bossBot, i * 7919)); L.push(fight(naiveBot, i * 104729)); }
  const sum = (R) => `${R.filter((r) => r.end === 'won').length} won / ${R.filter((r) => r.end === 'lost').length} lost / ${R.filter((r) => r.end === 'timeout').length} timeout · time ${Math.min(...R.map((r) => r.t)).toFixed(0)}–${Math.max(...R.map((r) => r.t)).toFixed(0)} s · hero hp at the end ${Math.min(...R.map((r) => r.hp))}–${Math.max(...R.map((r) => r.hp))}`;
  ok('bots: the pilot that reads the tells wins 20 of 20 seeded fights', W.every((r) => r.end === 'won' && !r.bad), sum(W));
  ok('bots: the pilot that only mashes attack loses 20 of 20 seeded fights', L.every((r) => r.end === 'lost' && !r.bad), sum(L));
}

if (want('fuzz')) {
  seed = 20261118; const kinds = ['banshee_queen', 'melee', 'ranged', 'plague_corpse', 'grave_ghost', 'gravekeeper_armor', 'bat', 'bat'];
  const s = mk(kinds.map((k, i) => ({ kind: k, x: 200 + (i % 4) * 60, z: -120 + i * 34, active: true }))); s.respawnAt(0, 0); s.hookPoints.push({ id: 'ring', x: -300, z: 100, y: 0, to: [-380, 100] });
  const inp = blank(); let e = null, at = -1, sameT = 0, lastKey = '', worst = 0, worstKey = '', bossSame = 0, bossKey = '', bossWorst = 0, threw = null, deaths = 0;
  const r = () => Math.random();
  for (let k = 0; k < 30000 && !e && !threw; k++) {
    if (k % 6 === 0) { const a = r() * 6.283, m = r() < 0.2 ? 0 : r() < 0.3 ? 0.4 : 1; inp.mx = Math.cos(a) * m; inp.mz = Math.sin(a) * m; inp.guard = r() < 0.15; inp.attackHeld = r() < 0.25; inp.bellHeld = r() < 0.2; inp.jumpHeld = r() < 0.5; }
    inp.attack = r() < 0.12; inp.dash = r() < 0.04; inp.jump = r() < 0.03; inp.skill = r() < 0.02; inp.bell = r() < 0.03; inp.lockNext = r() < 0.01;
    if (k % 997 === 0) s.hero.reso = 3;
    if (k % 4001 === 0 && s.enemies.filter((q) => !q.dead).length < 4) for (const kd of kinds.slice(1)) s.addEnemy({ kind: kd, x: (r() - 0.5) * 800, z: (r() - 0.5) * 500, active: true });
    try { step(s, inp); } catch (x) { threw = String(x?.stack ?? x).split('\n').slice(0, 3).join(' | '); break; }
    e = bad(s); if (e) at = k;
    const h = s.hero, key = h.dead ? 'dead' : h.act ? 'act:' + h.act : h.charging ? 'charging' : h.hurtT > 0 ? 'hurt' : h.dashT > 0 ? 'roll' : h.move ? 'move:' + h.move.id : 'free';
    if (key === lastKey && key !== 'free') { sameT++; if (sameT > worst) { worst = sameT; worstKey = key; } } else { sameT = 0; lastKey = key; }
    const b = s.enemies.find((q) => q.def.boss && !q.dead); if (b) { const bk = b.state + ':' + (b.atk?.id ?? '') + (b.fled ? ':fled' : ''); if (bk === bossKey && b.state !== 'chase' && b.state !== 'idle') { bossSame++; if (bossSame > bossWorst) bossWorst = bossSame; } else { bossSame = 0; bossKey = bk; } }
    deaths = s.deaths;
  }
  ok('fuzz: 30,000 random ticks with the boss + six kinds (respawn on): no exception', !threw, threw ?? '');
  ok('fuzz: no NaN / broken direction', !e, e ? `${e} at tick ${at}` : `hero deaths ${deaths} · enemies ever ${s.enemies.length}`);
  ok('fuzz: the hero is never held by one state longer than 3 s (roll, move, tool, hurt, death)', worst <= 180, `longest ${worst} ticks in ${worstKey}`);
  ok('fuzz: the boss is never in one attack / stagger / kneel / fled state longer than 13 s', bossWorst <= 13 * 60, `longest ${bossWorst} ticks`);
}
console.log(`\n${pass} passed, ${fail} failed`); if (fail) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exitCode = 1; }
