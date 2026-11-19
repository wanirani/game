// WHIP2-VERIFY lane — the rules' carried presses, tried adversarially (node, no browser). Today's rules against the lane's start commit (--base).
//   node tools/v2/whip_v2rules.mjs [--base /dev/shm/whip2verify/base]
// A  a skill pressed in each sixth of a roll, under a ring (hook) and in the open with resonance (call): does it fire, on which tick, from where
// B  the ring is in reach when the roll starts and out of reach where it ends (is the hook thrown at a ring he can no longer reach?)
// C  the scene holds the hero in the middle of the roll (dropPresses every tick, as the pause / a dialogue / a walked step do): nothing may fire afterwards
// D  a jump / a skill pressed behind a queued combo hit: what comes out, how late - old rules beside today's
// E  hurt inside the carry: nothing fires after the stun
// F  the longest wait between a skill press and its move over every moment of a roll, a jump and a combo
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const ROOT = new URL('../..', import.meta.url).pathname, BASE = String(args.base || '/dev/shm/whip2verify/base');
const NEW = await import(ROOT + 'src/v2/play/index.js'), OLD = await import(BASE + '/src/v2/play/index.js');
const DT = 1 / 60;
let fails = 0; const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (!cond) fails++; };

/** run a finger script: ev = { tick: { attack, dash, jump, skill, mx, mz, hold } }. Returns the events with their ticks */
function run(P, o) {
  const { Sim, TUNE, flatArena } = P, s = new Sim(flatArena(900, 600, []), {}), h = s.hero, EV = [];
  if (o.ring) s.hookPoints.push({ id: 'r1', x: o.ring[0], y: 0, z: o.ring[1], to: [o.ring[0] + 60, o.ring[1] + 10] });
  if (o.reso) { h.reso = h.resoMax; s.caller = s.caller ?? { id: 'c', x: 0, z: 0 }; }
  if (o.foe) s.addEnemy({ kind: 'skeleton_soldier', x: o.foe[0], z: o.foe[1], active: true });
  let tick = 0;
  s.hooks.event = (name, a, b) => { if (name === 'attack') EV.push([tick, 'move:' + (b?.id ?? '?')]); else if (name === 'act') EV.push([tick, 'act:' + b]); else if (name === 'roll') EV.push([tick, 'roll']); else if (name === 'jump') EV.push([tick, 'jump']); else if (name === 'heroHurt') EV.push([tick, 'hurt']); else if (name === 'deny') EV.push([tick, 'deny']); };
  let mx = o.mx ?? 0, mz = o.mz ?? 0; const st = [];
  for (tick = 0; tick < (o.n ?? 90); tick++) {
    const e = o.ev[tick] ?? {}; if (e.mx !== undefined) { mx = e.mx; mz = e.mz ?? 0; }
    if (o.keepHp !== false) h.hp = h.hpMax;
    if (e.hurt) s.hurtHero ? s.hurtHero(10, -1, 0, { str: 'M', knock: 100 }) : null;
    if (o.hold && tick >= o.hold[0] && tick < o.hold[1]) { s.dropPresses(); st.push('held'); continue; }   // the scene: pause = no rules tick at all, presses dropped
    if (o.lock && tick >= o.lock[0] && tick < o.lock[1]) { s.dropPresses(); s.update(DT, { mx: 0, mz: 0, attack: false, attackHeld: false, dash: false, guard: false, jump: false, jumpHeld: false, jumpUsed: false, skill: false, skillHeld: false, bell: false, bellHeld: false, lockNext: false }); st.push('locked'); continue; }   // a dialogue: rules run, no input, presses dropped before the tick
    const inp = { mx, mz, attack: !!e.attack, attackHeld: !!e.attack || !!e.attackHeld, dash: !!e.dash, guard: !!e.dash, jump: !!e.jump, jumpHeld: !!e.jump, jumpUsed: false, skill: !!e.skill, skillHeld: false, bell: false, bellHeld: false, lockNext: false };
    s.update(DT, inp);
    st.push(`${h.move ? h.move.id : '-'}${h.dashT > 0 ? 'R' : ''}${h.onGround ? '' : 'A'}${h.hurtT > 0 ? 'H' : ''}${h.act ? '+' + h.act : ''}`);
  }
  return { EV, st, h, s, TUNE };
}
const first = (EV, p, from = 0) => EV.find((q) => q[0] >= from && q[1].startsWith(p));

// ───────── A: a skill in each sixth of a roll
console.log('[A] a skill pressed in each sixth of a roll (roll starts on tick 2, lasts 21 ticks; the ring 120 px ahead of where the roll starts)');
for (const mode of ['hook', 'call']) {
  const row = [];
  for (let k = 0; k < 6; k++) {
    const at = 2 + 1 + Math.floor(((k + 0.5) / 6) * 21);
    const o = { ev: { 0: { mx: 1 }, 2: { dash: true }, [at]: { skill: true } }, n: 80, ...(mode === 'hook' ? { ring: [120, 40] } : { reso: true }) };
    const a = run(NEW, o), b = run(OLD, o), fa = first(a.EV, 'act:' + mode, at), fb = first(b.EV, 'act:' + mode, at), rollEnd = a.st.findIndex((q, i) => i > 2 && !q.includes('R'));
    row.push(`sixth ${k + 1} (press @${at - 2} of the roll): today ${fa ? 'fires +' + (fa[0] - at) + (fa[0] === rollEnd ? ' = the tick the roll ends' : ' (roll ends +' + (rollEnd - at) + ')') : 'NOTHING'} · before ${fb ? 'fires +' + (fb[0] - at) : 'nothing'}`);
    ok(`A ${mode}: sixth ${k + 1} of the roll fires`, !!fa, row[row.length - 1]);
    if (fa) ok(`A ${mode}: sixth ${k + 1} fires once and no later than the tick after the roll ends`, a.EV.filter((q) => q[1] === 'act:' + mode).length === 1 && fa[0] <= rollEnd + 1);
  }
}
// ───────── B: the ring goes out of reach during the roll
console.log('[B] the ring is in reach where the roll starts and out of reach where it ends');
{
  const R = NEW.TUNE.hookRange, o = { ev: { 0: { mx: -1 }, 2: { dash: true }, 5: { skill: true } }, n: 80, ring: [R - 40, 0] };   // he rolls 175 px away from a ring that was 290 px off
  const a = run(NEW, o), f = first(a.EV, 'act:hook', 5), h = a.h, endX = a.st.findIndex((q, i) => i > 2 && !q.includes('R'));
  const tr = run(NEW, { ...o, n: (f ? f[0] : endX) + 1 }), d = Math.hypot(tr.h.hookFX - (R - 40), tr.h.hookFZ - 0);
  ok('B no hook is thrown at a ring farther than hookRange from where he stands', !f || d <= R + 1, f ? `hook thrown on tick ${f[0]} from ${d.toFixed(0)} px away (hookRange ${R})` : 'no hook thrown - the press ran out or turned into a call');
}
// ───────── C: held by the scene in the middle of the roll
console.log('[C] the scene holds the hero during the roll');
for (const kind of ['hold', 'lock']) {
  const o = { ev: { 0: { mx: 1 }, 2: { dash: true }, 6: { skill: true } }, n: 120, ring: [120, 40], [kind]: [10, 40] };
  const a = run(NEW, o), f = first(a.EV, 'act:hook', 6);
  ok(`C ${kind === 'hold' ? 'pause (no rules tick, presses dropped)' : 'dialogue (rules tick with no input, presses dropped)'}: the skill pressed before it does not fire afterwards`, !f, f ? 'hook fired on tick ' + f[0] : 'nothing fired');
  const o2 = { ev: { 0: { mx: 1 }, 2: { dash: true }, 6: { attack: true } }, n: 120, foe: [400, 0], [kind]: [10, 40] };
  const a2 = run(NEW, o2), f2 = first(a2.EV, 'move:', 6);
  ok(`C ${kind}: the sweep asked for before it does not come out afterwards`, !f2, f2 ? f2[1] + ' on tick ' + f2[0] : 'nothing');
}
// ───────── D: behind a queued combo hit
console.log('[D] attack on tick 2, attack again on tick 2+g (queued), then jump / skill d ticks later - what comes out (old rules beside today)');
for (const btn of ['jump', 'skill']) {
  const sum = { today: { fired: 0, lost: 0, c2: 0, wait: [] }, before: { fired: 0, lost: 0, c2: 0, wait: [] } }; const lines = [];
  for (const g of [4, 8, 11]) for (let d = 1; d <= 12; d++) {
    const at = 2 + g + d, o = { ev: { 2: { attack: true }, [2 + g]: { attack: true }, [at]: { [btn]: true } }, n: 110, ...(btn === 'skill' ? { ring: [120, 40] } : {}) };
    const res = {};
    for (const [nm, P] of [['today', NEW], ['before', OLD]]) {
      const a = run(P, o), f = first(a.EV, btn === 'jump' ? 'jump' : 'act:hook', at), c2 = first(a.EV, 'move:c2', 2);
      res[nm] = `${c2 ? 'c2' : '--'} ${f ? btn + ' +' + (f[0] - at) : 'LOST'}`; if (f) { sum[nm].fired++; sum[nm].wait.push(f[0] - at); } else sum[nm].lost++; if (c2) sum[nm].c2++;
    }
    lines.push(`g${g} d${d}: today ${res.today} | before ${res.before}`);
  }
  console.log(`   ${btn}: today fired ${sum.today.fired}/36 (second hit kept ${sum.today.c2}/36, longest wait ${Math.max(0, ...sum.today.wait)} ticks) · before fired ${sum.before.fired}/36 (second hit kept ${sum.before.c2}/36, longest wait ${Math.max(0, ...sum.before.wait)})`);
  if (args.verbose) for (const l of lines) console.log('      ' + l);
}
// ───────── E: hurt inside the carry
console.log('[E] a skill pressed early in a roll, the hero is hit before the roll ends');
{
  const o = { ev: { 0: { mx: 1 }, 2: { dash: true }, 5: { skill: true } }, n: 120, ring: [120, 40] };
  const a = run(NEW, o); // find the hurt API
  const P = NEW, s = new P.Sim(P.flatArena(900, 600, []), {}), h = s.hero; s.hookPoints.push({ id: 'r1', x: 120, y: 0, z: 40, to: [180, 50] });
  let tick = 0; const EV = []; s.hooks.event = (name, a2, b) => { if (name === 'act') EV.push([tick, 'act:' + b]); else if (name === 'heroHurt') EV.push([tick, 'hurt']); };
  const I = (e = {}) => ({ mx: 1, mz: 0, attack: false, attackHeld: false, dash: !!e.dash, guard: !!e.dash, jump: false, jumpHeld: false, jumpUsed: false, skill: !!e.skill, skillHeld: false, bell: false, bellHeld: false, lockNext: false });
  for (tick = 0; tick < 120; tick++) {
    if (tick === 12) { h.ifr = 0; const fn = s._hurtHero ?? s.hurtHero ?? s.hitHero; if (fn) fn.call(s, h, 5, -1, 0, { str: 'M', knock: 120 }); else if (s.damageHero) s.damageHero(5, -1, 0); }
    s.update(DT, I({ dash: tick === 2, skill: tick === 5 }));
  }
  const hurt = EV.find((q) => q[1] === 'hurt'), f = EV.find((q) => q[1] === 'act:hook');
  ok('E the hit landed in the test', !!hurt, hurt ? 'hurt on tick ' + hurt[0] : 'no way found to hurt the hero from the test - not judged');
  if (hurt) ok('E a skill pressed before the hit does not fire after the stun', !f || f[0] < hurt[0], f ? 'hook on tick ' + f[0] : 'nothing fired');
}
// ───────── F: the longest wait
console.log('[F] the longest wait between a skill press and the hook it throws');
{
  let worst = { w: -1 }; const tally = {};
  const scen = { roll: (at) => ({ ev: { 0: { mx: 1 }, 2: { dash: true }, [at]: { skill: true } }, n: 100, ring: [120, 40] }), jump: (at) => ({ ev: { 2: { jump: true }, [at]: { skill: true } }, n: 100, ring: [120, 40] }), combo: (at) => ({ ev: { 2: { attack: true }, 10: { attack: true }, 22: { attack: true }, [at]: { skill: true } }, n: 140, ring: [120, 40] }), rollAtk: (at) => ({ ev: { 0: { mx: 1 }, 2: { dash: true }, 8: { attack: true }, [at]: { skill: true } }, n: 120, ring: [160, 40] }) };
  for (const nm in scen) { let fired = 0, n = 0, mx = 0; for (let at = 3; at <= 60; at++) { const o = scen[nm](at); if (o.ev[at].attack || o.ev[at].dash || o.ev[at].jump) continue; const a = run(NEW, o), f = first(a.EV, 'act:hook', at); n++; if (f) { fired++; const w = f[0] - at; if (w > mx) mx = w; if (w > worst.w) worst = { w, nm, at }; } } tally[nm] = `${fired}/${n} fired, longest wait ${mx} ticks`; }
  for (const nm in tally) console.log(`   ${nm}: ${tally[nm]}`);
  const cap = Math.round((NEW.TUNE.bufT + NEW.TUNE.bufHold) * 60) + 1;
  ok(`F no hook comes later than bufT + bufHold (${cap} ticks) after its press`, worst.w <= cap, `longest ${worst.w} ticks (${worst.nm}, press on tick ${worst.at})`);
}
console.log(fails ? `FAILED ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
