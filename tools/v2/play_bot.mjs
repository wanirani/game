// PLAY: test pilots for the boss fight — used by tools/v2/play_view.html (demo "boss") and tools/v2/play_rules_test.mjs.
//   bossBot(sim, inp, st)   reads the tells and answers: bell on the scream / the song, parry the sweep, roll out of what cannot be blocked,
//                           light for ghosts, combos in the openings, long bell on the kneeling queen. st = { cd, g, hold } (kept between ticks)
//   naiveBot(sim, inp, st)  walks up and mashes attack — never guards, rolls or rings (it must lose)
const D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function bossBot(sim, inp, st) {
  const h = sim.hero, dt = 1 / 60; st.cd = (st.cd ?? 0) - dt; st.g = (st.g ?? 0) - dt;
  inp.mx = 0; inp.mz = 0; inp.attack = false; inp.dash = false; inp.guard = false; inp.skill = false; inp.bell = false; inp.bellHeld = false; inp.attackHeld = false;
  let boss = null, near = null, nd = 1e9, threat = null;
  for (const e of sim.enemies) {
    if (e.dead || e.state === 'dead') continue;
    if (e.def.boss) boss = e;
    const d = D(e, h); if (!e.fled && e.solid && d < nd) { nd = d; near = e; }
    if (e.state === 'attack' && e.atk && !e.atk.shot && !e.atk.summon) { const left = e.atk.windup - e.stateT; if (e.atk.pulse ? e.phase !== 'recover' : left < 0.16 && left > -0.06) threat = e; }
  }
  if (h.act === 'ring' && !h.actDone) { inp.bellHeld = true; return; }   // keep the long ring going
  if (h.act || h.hurtT > 0) return;
  for (const s of sim.shots) if (!s.dead && !s.friendly && D(s, h) < 62 && !threat) threat = s;
  if (boss && boss.kneel > 0) {   // walk up and ring long
    const d = D(boss, h);
    if (d > 150) { inp.mx = (boss.x - h.x) / d; inp.mz = (boss.z - h.z) / d; } else if (h.bellOk) { inp.bell = true; inp.bellHeld = true; }
    return;
  }
  if (boss && boss.state === 'attack' && boss.atk && boss.atk.bell && h.bellOk && D(boss, h) < 250 && (boss.phase === 'windup' ? boss.stateT > 0.25 : !!boss.atk.pulse)) { inp.bell = true; return; }   // (bellHeld false = a tap)
  if (threat && threat.atk && threat.atk.guard === 'break') {   // cannot be blocked: out of the circle
    const R = threat.atk.radius?.r ?? threat.atk.pulse?.r ?? 200, d = D(threat, h) || 1;
    if (d < R + 30) { inp.mx = (h.x - threat.x) / d; inp.mz = (h.z - threat.z) / d; if (st.cd <= 0 && threat.atk.radius) { inp.dash = true; st.cd = 0.7; } }
    return;
  }
  if (threat) { inp.guard = true; st.g = 0.22; return; }
  if (st.g > 0) { inp.guard = true; return; }
  if (!near) { if (boss && boss.fled) { const d = D(boss, h); if (d > 220) { inp.mx = (boss.x - h.x) / d; inp.mz = (boss.z - h.z) / d; } } return; }
  if (near.def.fade != null && h.reso >= 1 && h.callCd <= 0 && nd < 240 && h.skillMode === 'call') { inp.skill = true; return; }
  const reach = near.def.boss ? near.r + 78 : 96;
  if (nd > reach) { inp.mx = (near.x - h.x) / nd; inp.mz = (near.z - h.z) / nd; }
  else if (st.cd <= 0) { inp.attack = true; st.cd = 0.28; }
}
export function naiveBot(sim, inp, st) {
  const h = sim.hero; st.cd = (st.cd ?? 0) - 1 / 60;
  inp.mx = 0; inp.mz = 0; inp.attack = false;
  let near = null, nd = 1e9; for (const e of sim.enemies) { if (e.dead || e.state === 'dead' || e.fled) continue; const d = D(e, h); if (d < nd) { nd = d; near = e; } }
  if (!near) return;
  if (nd > near.r + 80) { inp.mx = (near.x - h.x) / nd; inp.mz = (near.z - h.z) / nd; } else if (st.cd <= 0) { inp.attack = true; st.cd = 0.3; }
}
