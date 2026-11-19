// WHIP lane — press timing through the pad's own pointer handlers, in game ticks (docs/v2/PLAY_API.md 1.1: the input buffer).
//   node tools/v2/whip_press.mjs [--device phone2] [--out /tmp/claude-0/v2/whip] [--base 9468e00]
// Each case is played twice in the same page harness: BEFORE = the rules of commit --base (src/v2/play/sim.js and tune.js of that commit, served
// to the page in place of today's files) and AFTER = today's tree. A case = one finger sequence; the table says on which tick the action began.
//   1 skill tapped d ticks after an attack tap, under the graveyard's whip ring      2 roll tapped d ticks after an attack tap (stick held)
//   3 attack tapped k ticks before the third hit ends                                4 jump tapped d ticks into a roll
//   5 the route bot's presses of the skill button under the ring while the grave-keeper strikes (press 4 ticks, wait 8, up to 13 presses)
// Writes <out>/press.json (read by the owner picture). Exit 1 when today's tree drops a press that the buffer should carry, or on a page error.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch, argsOf } from './whip_lib.mjs';

const args = argsOf(process.argv), DEV = String(args.device || 'phone2'), OUT = String(args.out || '/tmp/claude-0/v2/whip'), BASE = String(args.base || '9468e00');
const L = await launch(OUT); let fails = 0;
const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (!cond) fails++; };
const old = {}; for (const f of ['src/v2/play/sim.js', 'src/v2/play/tune.js']) old[f] = execFileSync('git', ['show', `${BASE}:${f}`], { cwd: new URL('../..', import.meta.url).pathname, maxBuffer: 1 << 26 }).toString();

async function cases() {
  const sc = window.__v2.scene, W = window.__W, { TUNE, MOVES } = await import('/src/v2/play/index.js'), sim = () => sc.sim, hero = () => sc.sim.hero;
  const ring = sc.area.interact.find((q) => q.kind === 'ring' && q.landing), SPOT = [ring.x - 44, ring.z - 170];
  W.clear(); W.drawEvery = 12;
  /** play a finger script: ev = [[tick, 'down'|'up', button]], n ticks; seen(i) after each tick. Buttons are lifted at the end */
  const play = (ev, n, seen) => { const held = new Set(); for (let i = 0; i < n; i++) { for (const e of ev) if (e[0] === i) { if (e[1] === 'down') { W.down(e[2]); held.add(e[2]); } else { W.up(e[2]); held.delete(e[2]); } } W.tick(1); seen(i); } for (const b of held) W.up(b); W.stick(0, 0); W.tick(3); };
  const tap = (t, b, hold = 3) => [[t, 'down', b], [t + hold, 'up', b]];
  const reset = () => { W.put(SPOT[0], SPOT[1], 1, 0); hero().reso = 0; W.tick(24); };
  const out = { bufT: TUNE.bufT ?? 0, rollIfr: TUNE.rollIfr, c1: MOVES.c1.hit, c3dur: MOVES.c3.dur, rollT: TUNE.rollT };
  // 1 skill d ticks after attack
  out.skill = [];
  for (let d = 0; d <= 14; d++) { reset(); let at = -1, deny = 0; const n0 = sc.feelN; play([...tap(2, 'attack'), ...tap(2 + d, 'skill')], 60, (i) => { if (at < 0 && hero().act === 'hook') at = i - (2 + d); }); out.skill.push({ d, thrown: at >= 0, wait: at }); W.tick(70); }
  // 2 roll d ticks after attack, the stick held to the right
  out.roll = [];
  for (let d = 0; d <= 14; d++) { reset(); let at = -1; W.stick(1, 0); W.tick(2); play([...tap(2, 'attack'), ...tap(2 + d, 'roll')], 50, (i) => { if (at < 0 && hero().dashT > 0) at = i - (2 + d); }); out.roll.push({ d, rolled: at >= 0, wait: at }); W.tick(30); }
  // 3 attack k ticks before the third hit ends
  out.c3 = [];
  for (let k = 1; k <= 16; k++) {
    reset(); let c3s = -1, c3e = -1, next = -1, pressed = -1; const ev = [...tap(2, 'attack'), ...tap(13, 'attack'), ...tap(26, 'attack')];
    const end = Math.round(MOVES.c3.dur * 60);   // ticks from the start of hit 3 to its end
    play(ev, 120, (i) => { const h = hero(); if (c3s < 0 && h.move === MOVES.c3) c3s = i; if (c3s >= 0 && pressed < 0 && i === c3s + end - 1 - k) { W.down('attack'); pressed = i + 1; } if (pressed >= 0 && i === pressed + 2) W.up('attack'); if (c3s >= 0 && c3e < 0 && h.move !== MOVES.c3) c3e = i; if (c3e >= 0 && next < 0 && h.move === MOVES.c1) next = i; });
    out.c3.push({ k, again: next >= 0 && next - c3e <= 1, afterEnd: next >= 0 ? next - c3e : -1 }); W.tick(40);
  }
  // 4 jump d ticks into a roll
  out.jump = [];
  for (let d = 6; d <= 20; d += 2) { reset(); let at = -1, re = -1; W.stick(1, 0); W.tick(2); play([...tap(2, 'roll'), ...tap(2 + d, 'jump')], 60, (i) => { const h = hero(); if (re < 0 && i > 3 && h.dashT <= 0) re = i; if (at < 0 && i > 2 + d && !h.onGround) at = i; }); out.jump.push({ d, jumped: at >= 0, afterRoll: at >= 0 ? at - re : -1 }); W.tick(30); }
  // 5 the hook while the grave-keeper strikes
  out.keeper = [];
  for (let p = 0; p < 8; p++) {
    reset(); const e = W.enemy('gravekeeper_armor', SPOT[0] - 96, SPOT[1], { awake: true, cd: 0.1 }); e._used = false;
    let presses = 0, thrown = -1, hurt = 0; const states = []; const hp0 = hero().hpMax;
    W.keepHp = true; W.tick(30 + p * 11);
    for (let i = 0; i < 156 && thrown < 0; i++) {
      const h = hero();
      if (i % 12 === 0) { if (h.hookId == null) { states.push('out of reach'); W.put(SPOT[0], SPOT[1], 1, 0); } W.down('skill'); presses++; states.push(h.hurtT > 0 ? 'stunned' : h.act ? h.act : h.move ? h.move.id : h.dashT > 0 ? 'roll' : 'free'); }
      if (i % 12 === 4) W.up('skill');
      W.tick(1); if (hero().act === 'hook') thrown = i;
    }
    W.up('skill'); out.keeper.push({ phase: p, presses, thrown: thrown >= 0, tick: thrown, at: states.join(' ') });
    e.x = e.homeX = -99999; e.z = e.homeZ = -99999; e.active = false; e.state = 'idle'; e.atk = null; e.wakeBy = 'trigger'; W.tick(90);
  }
  return out;
}

const res = {};
try {
  for (const side of ['before', 'after']) {
    const page = await L.page(DEV);
    if (side === 'before') for (const f of Object.keys(old)) await page.route('**/' + f, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: old[f] }));
    await L.open(page, 'graveyard_now');
    res[side] = await page.evaluate(cases);
    await page.context().close();
  }
} catch (e) { L.errs.push('[tool] ' + (e?.stack ?? e)); }
await L.close();
if (res.before && res.after) {
  const B = res.before, A = res.after, row = (a, f) => a.map(f).join(' ');
  console.log(`[${DEV}] BEFORE = commit ${BASE} (roll untouchable ${B.rollIfr} s, no buffer) · AFTER = today (buffer ${A.bufT} s, roll untouchable ${A.rollIfr} s). "." = the press did nothing, a number = ticks from the press to the action`);
  const cell = (q, okKey, wKey) => (q[okKey] ? String(q[wKey]) : '.');
  console.log(`1 skill tapped d ticks after an attack tap (hit window of hit 1 ends ${A.c1[1]} s = tick ${Math.ceil(A.c1[1] * 60)}), d = 0..14`);
  console.log('   before: ' + row(B.skill, (q) => cell(q, 'thrown', 'wait').padStart(2))); console.log('   after:  ' + row(A.skill, (q) => cell(q, 'thrown', 'wait').padStart(2)));
  console.log('2 roll tapped d ticks after an attack tap, stick held, d = 0..14');
  console.log('   before: ' + row(B.roll, (q) => cell(q, 'rolled', 'wait').padStart(2))); console.log('   after:  ' + row(A.roll, (q) => cell(q, 'rolled', 'wait').padStart(2)));
  console.log('3 attack tapped k ticks before the third hit ends, k = 1..16 (number = ticks after the end on which a new first hit begins)');
  console.log('   before: ' + row(B.c3, (q) => cell(q, 'again', 'afterEnd').padStart(2))); console.log('   after:  ' + row(A.c3, (q) => cell(q, 'again', 'afterEnd').padStart(2)));
  console.log('4 jump tapped d ticks into a roll (roll = ' + Math.round(A.rollT * 60) + ' ticks), d = 6,8..20 (number = ticks after the roll ends)');
  console.log('   before: ' + row(B.jump, (q) => cell(q, 'jumped', 'afterRoll').padStart(2))); console.log('   after:  ' + row(A.jump, (q) => cell(q, 'jumped', 'afterRoll').padStart(2)));
  console.log('5 the hook under the ring while the grave-keeper strikes (a press every 12 ticks; what the hero was doing at each press)');
  for (const side of ['before', 'after']) for (const q of res[side].keeper) console.log(`   ${side.padEnd(6)} start ${q.phase}: ${q.thrown ? 'thrown at press ' + q.presses + ' (tick ' + q.tick + ')' : 'NOT thrown in ' + q.presses + ' presses'} — ${q.at}`);
  const N = Math.round(A.bufT * 60) - 1, hitEnd = Math.ceil(A.c1[1] * 60 - 1e-6);
  ok(`skill after an attack tap: every press from ${Math.max(0, hitEnd - N)} ticks after the attack on throws the hook`, A.skill.every((q) => q.d < hitEnd - N || q.thrown), 'before: ' + B.skill.filter((q) => q.thrown).length + ' of 15 presses threw, after: ' + A.skill.filter((q) => q.thrown).length);
  ok('skill + attack on the same tick (d = 0): the hook is thrown', A.skill[0].thrown);
  ok(`roll after an attack tap: every press from ${Math.max(0, hitEnd - N)} ticks on rolls`, A.roll.every((q) => q.d < hitEnd - N || q.rolled), 'before: ' + B.roll.filter((q) => q.rolled).length + ' of 15, after: ' + A.roll.filter((q) => q.rolled).length);
  ok(`attack in the last ${N} ticks of the third hit starts a new first hit on the tick the third ends`, A.c3.every((q) => q.k > N || q.again), 'before: ' + B.c3.filter((q) => q.again).length + ' of 16, after: ' + A.c3.filter((q) => q.again).length);
  ok('jump in the last ticks of a roll jumps as the roll ends', A.jump.filter((q) => q.d >= Math.round(A.rollT * 60) - N).every((q) => q.jumped), 'before: ' + B.jump.filter((q) => q.jumped).length + ' of 8, after: ' + A.jump.filter((q) => q.jumped).length);
  ok('the hook under the ring while the grave-keeper strikes: thrown within 3 presses from every start', A.keeper.every((q) => q.thrown && q.presses <= 3), 'presses before: ' + B.keeper.map((q) => (q.thrown ? q.presses : 'x')).join(' ') + ' · after: ' + A.keeper.map((q) => (q.thrown ? q.presses : 'x')).join(' '));
  fs.writeFileSync(`${OUT}/press.json`, JSON.stringify({ device: DEV, base: BASE, before: B, after: A }, null, 1));
}
for (const e of L.errs) console.log('ERR ' + e);
console.log(fails || L.errs.length ? `FAILED: ${fails} line(s), ${L.errs.length} error(s)` : 'ALL OK');
process.exit(fails || L.errs.length ? 1 : 0);
