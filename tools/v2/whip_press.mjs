// WHIP lane — press timing (docs/v2/PLAY_API.md 1.1: the input buffer).
//   node tools/v2/whip_press.mjs [--device phone2] [--out /tmp/claude-0/v2/whip] [--base 9468e00] [--rules]
// Two parts:
//   RULES (node, no browser): the same finger scripts run on the rules of commit --base (git archive of src/v2/play into <out>/base_play) and on
//     today's rules -> a before / after table. "Before" gets the jump the way the scene gave it then (held true for 0.12 s until used).
//   PAGE (scene v2g, graveyard_now, today's tree): the same scripts as touches on the pad's own pointer handlers, the game advanced by ticks.
// Cases: 1 skill tapped d ticks after an attack tap, under the whip ring   2 roll tapped d ticks after an attack tap (stick held)
//        3 attack tapped k ticks before the third hit ends                 4 jump tapped d ticks into a roll
//        5 (page) the route bot's skill presses under the ring while the grave-keeper strikes (press 4 ticks, wait 8, up to 13 presses)
// Writes <out>/press.json (read by the owner picture). Exit 1 when today's tree drops a press the buffer should carry, or on a page error.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { launch, argsOf } from './whip_lib.mjs';

const args = argsOf(process.argv), DEV = String(args.device || 'phone2'), OUT = String(args.out || '/tmp/claude-0/v2/whip'), BASE = String(args.base || '9468e00');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (!cond) fails++; };
const DT = 1 / 60, ROOT = new URL('../..', import.meta.url).pathname;

// ── RULES: before (commit BASE) and after (today) ──
const baseDir = `${OUT}/base_play`; fs.rmSync(baseDir, { recursive: true, force: true }); fs.mkdirSync(baseDir, { recursive: true });
execSync(`git archive ${BASE} src/v2 | tar -x -C ${baseDir}`, { cwd: ROOT, maxBuffer: 1 << 28 });   // (the rules import ../char3d and friends)
const NEW = await import(ROOT + 'src/v2/play/index.js'), OLD = await import(baseDir + '/src/v2/play/index.js');
function rules(P, oldJump) {
  const { Sim, TUNE, MOVES, flatArena } = P, mk = () => { const s = new Sim(flatArena(900, 500, []), {}); s.hookPoints.push({ id: 'r1', x: 250, y: 0, z: 40, to: [300, 50] }); s.update(DT, {}); return s; };
  const out = { bufT: TUNE.bufT ?? 0, rollIfr: TUNE.rollIfr, c1: MOVES.c1.hit, c3dur: MOVES.c3.dur, rollT: TUNE.rollT, skill: [], roll: [], c3: [], jump: [] };
  for (let d = 0; d <= 14; d++) { const s = mk(); let at = -1; for (let i = 0; i < 60; i++) { s.update(DT, { attack: i === 0, skill: i === d }); if (at < 0 && s.hero.act === 'hook') at = i - d; } out.skill.push({ d, thrown: at >= 0, wait: at }); }
  for (let d = 0; d <= 14; d++) { const s = mk(); let at = -1; for (let i = 0; i < 50; i++) { s.update(DT, { mx: 1, attack: i === 0, dash: i === d, guard: i >= d && i < d + 3 }); if (at < 0 && s.hero.dashT > 0) at = i - d; } out.roll.push({ d, rolled: at >= 0, wait: at }); }
  for (let k = 1; k <= 16; k++) {
    const s = mk(), end = Math.round(MOVES.c3.dur * 60); let c3s = -1, c3e = -1, next = -1, n = 0; s.hooks.attack = () => n++;
    for (let i = 0; i < 120; i++) { const h = s.hero, press = c3s >= 0 && i === c3s + end - k; s.update(DT, { attack: (i % 9 === 0 && n < 3) || press }); if (c3s < 0 && h.move === MOVES.c3) c3s = i; if (c3s >= 0 && c3e < 0 && h.move !== MOVES.c3) c3e = i; if (c3e >= 0 && next < 0 && h.move === MOVES.c1) next = i; }
    out.c3.push({ k, again: next >= 0 && next - c3e <= 1, afterEnd: next >= 0 ? next - c3e : -1 });
  }
  for (let d = 6; d <= 20; d += 2) {
    const s = mk(); let at = -1, re = -1, used = false;
    for (let i = 0; i < 60; i++) { const inp = { mx: 1, dash: i === 0, jump: oldJump ? i >= d && i <= d + 7 && !used : i === d, jumpHeld: i >= d && i < d + 4, jumpUsed: false }; s.update(DT, inp); if (inp.jumpUsed) used = true; const h = s.hero; if (re < 0 && i > 1 && h.dashT <= 0) re = i; if (at < 0 && i > d && !h.onGround) at = i; }
    out.jump.push({ d, jumped: at >= 0, afterRoll: at >= 0 ? at - re : -1 });
  }
  return out;
}
const RB = rules(OLD, true), RA = rules(NEW, false);
const cell = (q, okKey, wKey) => (q[okKey] ? String(q[wKey]) : '.').padStart(2), row = (a, k, w) => a.map((q) => cell(q, k, w)).join(' ');
const table = (tag, B, A) => {
  console.log(`1 skill tapped d ticks after an attack tap, d = 0..14 (the hit window of hit 1 ends at ${A.c1[1]} s = tick ${Math.ceil(A.c1[1] * 60)}; number = ticks from the press to the throw)`);
  if (B) console.log('   before: ' + row(B.skill, 'thrown', 'wait')); console.log(`   ${tag}  ` + row(A.skill, 'thrown', 'wait'));
  console.log('2 roll tapped d ticks after an attack tap, stick held, d = 0..14 (number = ticks from the press to the roll)');
  if (B) console.log('   before: ' + row(B.roll, 'rolled', 'wait')); console.log(`   ${tag}  ` + row(A.roll, 'rolled', 'wait'));
  console.log('3 attack tapped k ticks before the third hit ends, k = 1..16 (number = ticks after its end on which a new first hit begins)');
  if (B) console.log('   before: ' + row(B.c3, 'again', 'afterEnd')); console.log(`   ${tag}  ` + row(A.c3, 'again', 'afterEnd'));
  console.log(`4 jump tapped d ticks into a roll of ${Math.round(A.rollT * 60)} ticks, d = 6, 8 .. 20 (number = ticks after the roll ends)`);
  if (B) console.log('   before: ' + row(B.jump, 'jumped', 'afterRoll')); console.log(`   ${tag}  ` + row(A.jump, 'jumped', 'afterRoll'));
};
console.log(`[rules] BEFORE = commit ${BASE} (no buffer; the scene held a jump for 0.12 s) · AFTER = today (buffer ${RA.bufT} s). "." = the press did nothing`);
table('after: ', RB, RA);
const N = Math.ceil(RA.bufT * 60 - 1e-9) - 1, hitEnd = Math.ceil(RA.c1[1] * 60 - 1e-6), rollN = Math.round(RA.rollT * 60);
const judge = (A, tag) => {
  ok(`${tag}: skill after an attack tap - every press from tick ${Math.max(1, hitEnd - N)} on throws the hook (and the same-tick press does)`, A.skill.every((q) => (q.d > 0 && q.d < hitEnd - N) || q.thrown), 'threw ' + A.skill.filter((q) => q.thrown).length + ' of 15');
  ok(`${tag}: roll after an attack tap - every press from tick ${Math.max(1, hitEnd - N)} on rolls`, A.roll.every((q) => (q.d > 0 && q.d < hitEnd - N) || q.rolled), 'rolled ' + A.roll.filter((q) => q.rolled).length + ' of 15');
  ok(`${tag}: attack in the last ${N} ticks of the third hit starts a new first hit as the third ends`, A.c3.every((q) => q.k > N || q.again), A.c3.filter((q) => q.again).length + ' of 16');
  ok(`${tag}: jump in the last ${N} ticks of a roll jumps as the roll ends`, A.jump.filter((q) => q.d >= rollN - N).every((q) => q.jumped && q.afterRoll <= 1), A.jump.filter((q) => q.jumped).length + ' of 8');
};
judge(RA, 'rules');
console.log(`   carried presses, before -> after: skill ${RB.skill.filter((q) => q.thrown).length} -> ${RA.skill.filter((q) => q.thrown).length} of 15 · roll ${RB.roll.filter((q) => q.rolled).length} -> ${RA.roll.filter((q) => q.rolled).length} of 15 · attack after the third hit ${RB.c3.filter((q) => q.again).length} -> ${RA.c3.filter((q) => q.again).length} of 16 · jump out of a roll ${RB.jump.filter((q) => q.jumped).length} -> ${RA.jump.filter((q) => q.jumped).length} of 8`);

// ── PAGE: today's tree through the pad ──
async function cases() {
  const sc = window.__v2.scene, W = window.__W, { TUNE, MOVES } = await import('/src/v2/play/index.js'), hero = () => sc.sim.hero;
  const ring = sc.area.interact.find((q) => q.kind === 'ring' && q.landing), SPOT = [ring.x - 44, ring.z - 170];
  W.clear(); W.drawEvery = 12;
  /** play a finger script: ev = [[tick, 'down'|'up', button]], n ticks; seen(i) after each tick. Fingers are lifted at the end */
  const play = (ev, n, seen) => { const held = new Set(); for (let i = 0; i < n; i++) { for (const e of ev) if (e[0] === i) { if (e[1] === 'down') { W.down(e[2]); held.add(e[2]); } else { W.up(e[2]); held.delete(e[2]); } } W.tick(1); seen(i); } for (const b of held) W.up(b); W.stick(0, 0); W.tick(3); };
  const tap = (t, b, hold = 3) => [[t, 'down', b], [t + hold, 'up', b]];
  const reset = () => { W.put(SPOT[0], SPOT[1], 1, 0); hero().reso = 0; W.tick(24); };
  const out = { bufT: TUNE.bufT ?? 0, rollIfr: TUNE.rollIfr, c1: MOVES.c1.hit, c3dur: MOVES.c3.dur, rollT: TUNE.rollT, skill: [], roll: [], c3: [], jump: [], keeper: [] };
  for (let d = 0; d <= 14; d++) { reset(); let at = -1; play([...tap(2, 'attack'), ...tap(2 + d, 'skill')], 60, (i) => { if (at < 0 && hero().act === 'hook') at = i - (2 + d); }); out.skill.push({ d, thrown: at >= 0, wait: at }); W.tick(70); }
  for (let d = 0; d <= 14; d++) { reset(); let at = -1; W.stick(1, 0); W.tick(2); play([...tap(2, 'attack'), ...tap(2 + d, 'roll')], 50, (i) => { if (at < 0 && hero().dashT > 0) at = i - (2 + d); }); out.roll.push({ d, rolled: at >= 0, wait: at }); W.tick(30); }
  for (let k = 1; k <= 16; k++) {
    reset(); let c3s = -1, c3e = -1, next = -1, pressed = -1; const end = Math.round(MOVES.c3.dur * 60);
    play([...tap(2, 'attack'), ...tap(13, 'attack'), ...tap(26, 'attack')], 120, (i) => { const h = hero(); if (c3s < 0 && h.move === MOVES.c3) c3s = i; if (c3s >= 0 && pressed < 0 && i === c3s + end - 1 - k) { W.down('attack'); pressed = i + 1; } if (pressed >= 0 && i === pressed + 2) W.up('attack'); if (c3s >= 0 && c3e < 0 && h.move !== MOVES.c3) c3e = i; if (c3e >= 0 && next < 0 && h.move === MOVES.c1) next = i; });
    out.c3.push({ k, again: next >= 0 && next - c3e <= 1, afterEnd: next >= 0 ? next - c3e : -1 }); W.tick(40);
  }
  for (let d = 6; d <= 20; d += 2) { reset(); let at = -1, re = -1; W.stick(1, 0); W.tick(2); play([...tap(2, 'roll'), ...tap(2 + d, 'jump')], 60, (i) => { const h = hero(); if (re < 0 && i > 3 && h.dashT <= 0) re = i; if (at < 0 && i > 2 + d && !h.onGround) at = i; }); out.jump.push({ d, jumped: at >= 0, afterRoll: at >= 0 ? at - re : -1 }); W.tick(30); }
  for (let p = 0; p < 8; p++) {   // the hook while the grave-keeper strikes
    reset(); const e = W.enemy('gravekeeper_armor', SPOT[0] - 96, SPOT[1], { awake: true, cd: 0.1 }); e._used = false;
    let presses = 0, thrown = -1; const states = []; W.tick(30 + p * 11);
    for (let i = 0; i < 156 && thrown < 0; i++) {
      const h = hero();
      if (i % 12 === 0) { if (h.hookId == null) { states.push('(knocked out of reach: put back)'); W.put(SPOT[0], SPOT[1], 1, 0); } W.down('skill'); presses++; states.push(h.hurtT > 0 ? 'stunned' : h.act ? h.act : h.move ? h.move.id : h.dashT > 0 ? 'roll' : 'free'); }
      if (i % 12 === 4) W.up('skill');
      W.tick(1); if (hero().act === 'hook') thrown = i;
    }
    W.up('skill'); out.keeper.push({ phase: p, presses, thrown: thrown >= 0, tick: thrown, at: states.join(' ') });
    e.x = e.homeX = -99999; e.z = e.homeZ = -99999; e.active = false; e.state = 'idle'; e.atk = null; e.wakeBy = 'trigger'; W.tick(90);
  }
  return out;
}
let PA = null;
if (!args.rules) {
  const L = await launch(OUT);
  try { const page = await L.page(DEV); await L.open(page, 'graveyard_now'); PA = await page.evaluate(cases); await page.context().close(); } catch (e) { L.errs.push('[tool] ' + (e?.stack ?? e)); }
  await L.close();
  if (PA) {
    console.log(`\n[page ${DEV}] today's tree, touches on the pad's own pointer handlers, game time`);
    table('today: ', null, PA);
    console.log('5 the hook under the ring while the grave-keeper strikes (a press every 12 ticks; what the hero was doing at each press)');
    for (const q of PA.keeper) console.log(`   start ${q.phase}: ${q.thrown ? 'thrown at press ' + q.presses + ' (tick ' + q.tick + ')' : 'NOT thrown in ' + q.presses + ' presses'} — ${q.at}`);
    judge(PA, 'page');
    ok('page: the hook under the ring while the grave-keeper strikes is thrown within 3 presses from every start', PA.keeper.every((q) => q.thrown && q.presses <= 3), 'presses ' + PA.keeper.map((q) => (q.thrown ? q.presses : 'x')).join(' '));
  }
  for (const e of L.errs) { console.log('ERR ' + e); fails++; }
}
fs.writeFileSync(`${OUT}/press.json`, JSON.stringify({ device: DEV, base: BASE, rulesBefore: RB, rulesAfter: RA, page: PA }, null, 1));
console.log(fails ? `FAILED: ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
