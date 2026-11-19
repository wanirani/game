// WHIP-VERIFY lane — SAME GAME: seeded random input on the rules of the lane's base commit and on today's rules (node, no browser).
//   node tools/v2/whipverify_same.mjs [--base /dev/shm/whipverify/base] [--seeds 12] [--ticks 6000] [--out /tmp/claude-0/v2/whipverify]
// Parts:
//   A  OLD against TODAY with the buffer shut (TUNE.bufT one tick, rollIfr 0.26): whatever still differs is a change that is NOT the buffer or the roll.
//   B  OLD against TODAY as shipped: player-side sums (damage taken, dealt, kills, rolls, rolls hurt, moves, presses that did nothing) + first difference per seed.
//   C  TODAY only, press audit: every press -> what fired, how many ticks later; fired twice / after a hit / later than 12 ticks.
import fs from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const ROOT = new URL('../..', import.meta.url).pathname, BASE = String(args.base || '/dev/shm/whipverify/base'), SEEDS = Number(args.seeds ?? 12), TICKS = Number(args.ticks ?? 6000), OUT = String(args.out || '/tmp/claude-0/v2/whipverify');
const NEW = await import(ROOT + 'src/v2/play/index.js'), OLD = await import(BASE + '/src/v2/play/index.js');
const DT = 1 / 60;
const rng = (s) => () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const KINDS = ['skeleton_soldier', 'skeleton_soldier', 'grave_ghost', 'plague_corpse', 'gravekeeper_armor', 'bat'];

/** the finger script of a seed: per tick { mx, mz, attack, attackHeld, dash, guard, jumpPress, jumpHeld, skill } - never reads the game */
function script(seed, n) {
  const R = rng(seed * 7919 + 13), S = []; let mx = 0, mz = 0, stickT = 0, holdA = 0, holdG = 0, holdJ = 0;
  for (let i = 0; i < n; i++) {
    if (stickT-- <= 0) { stickT = 12 + Math.floor(R() * 50); if (R() < 0.22) { mx = 0; mz = 0; } else { const a = R() * 6.2832; mx = Math.cos(a); mz = Math.sin(a); } }
    const o = { mx, mz, attack: false, attackHeld: false, dash: false, guard: false, jumpPress: false, jumpHeld: false, skill: false };
    const r = R();
    if (holdA > 0) { holdA--; o.attackHeld = true; } else if (r < 0.07) { o.attack = true; o.attackHeld = true; holdA = R() < 0.12 ? 28 + Math.floor(R() * 40) : 2 + Math.floor(R() * 4); }
    const r2 = R();
    if (holdG > 0) { holdG--; o.guard = true; } else if (r2 < 0.022) { o.dash = true; o.guard = true; holdG = 2 + Math.floor(R() * 5); }
    const r3 = R();
    if (holdJ > 0) { holdJ--; o.jumpHeld = true; } else if (r3 < 0.012) { o.jumpPress = true; o.jumpHeld = true; holdJ = 3 + Math.floor(R() * 9); }
    if (R() < 0.012) o.skill = true;
    S.push(o);
  }
  return S;
}

/** one run. oldJump: the jump the way the scene of the base commit gave it (true for 0.12 s until used). tune: values set on the module's TUNE for the run */
function run(P, seed, n, { oldJump = false, tune = null, audit = false } = {}) {
  const { Sim, TUNE, MOVES, flatArena } = P, keep = {};
  if (tune) for (const k in tune) { keep[k] = TUNE[k]; TUNE[k] = tune[k]; }
  const mr = Math.random; Math.random = rng(seed * 104729 + 7);
  const ER = rng(seed * 31 + 5);
  const s = new Sim(flatArena(430, 300, []), {}), h = s.hero;
  s.hookPoints?.push({ id: 'r1', x: 250, y: 0, z: 40, to: [300, 50] });
  const spawn = (k) => { const a = ER() * 6.2832, d = 150 + ER() * 200; s.addEnemy({ kind: k, x: Math.max(-400, Math.min(400, Math.cos(a) * d)), z: Math.max(-270, Math.min(270, Math.sin(a) * d * 0.7)), active: true }); };
  for (const k of KINDS) spawn(k);
  const M = { dmgTaken: 0, hurts: 0, dmgDealt: 0, hits: 0, kills: 0, rolls: 0, rollsHurt: 0, moves: {}, acts: {}, jumps: 0, denies: 0, dist: 0, press: { attack: 0, dash: 0, jump: 0, skill: 0 }, moveTicks: 0, hurtTicks: 0, guardTicks: 0, freeTicks: 0 };
  const EV = []; let tick = 0, rollAt = -99;
  s.hooks.event = (name, a, b, c) => {
    if (name === 'heroHurt') { M.dmgTaken += a; M.hurts++; if (tick - rollAt <= Math.round(TUNE.rollT * 60)) M.rollsHurt++; EV.push([tick, 'hurt']); }
    else if (name === 'hit') { M.dmgDealt += b; M.hits++; }
    else if (name === 'kill' || name === 'enemyDie' || name === 'die') M.kills++;
    else if (name === 'roll') { M.rolls++; rollAt = tick; EV.push([tick, 'roll']); }
    else if (name === 'attack') { const id = b?.id ?? '?'; M.moves[id] = (M.moves[id] ?? 0) + 1; EV.push([tick, 'move', id]); }
    else if (name === 'act') { M.acts[b] = (M.acts[b] ?? 0) + 1; EV.push([tick, 'act', b]); }
    else if (name === 'jump') { M.jumps++; EV.push([tick, 'jump']); }
    else if (name === 'deny') M.denies++;
  };
  const S = script(seed, n), trace = new Float64Array(n * 4), tags = new Array(n); let jb = 0, jUsed = false;
  const presses = [];
  for (tick = 0; tick < n; tick++) {
    const q = S[tick]; h.hp = h.hpMax;
    let jump = q.jumpPress;
    if (oldJump) { if (q.jumpPress) { jb = 8; jUsed = false; } jump = jb > 0 && !jUsed; if (jb > 0) jb--; }
    const inp = { mx: q.mx, mz: q.mz, attack: q.attack, attackHeld: q.attackHeld, dash: q.dash, guard: q.guard, jump, jumpHeld: q.jumpHeld, jumpUsed: false, skill: q.skill, skillHeld: false, bell: false, bellHeld: false, lockNext: false };
    if (q.attack) { M.press.attack++; presses.push([tick, 'attack']); } if (q.dash) { M.press.dash++; presses.push([tick, 'dash', q.mx !== 0 || q.mz !== 0]); } if (q.jumpPress) { M.press.jump++; presses.push([tick, 'jump']); } if (q.skill) { M.press.skill++; presses.push([tick, 'skill']); }
    const x0 = h.x, z0 = h.z;
    s.update(DT, inp);
    if (inp.jumpUsed) jUsed = true;
    M.dist += Math.hypot(h.x - x0, h.z - z0);
    if (h.move) M.moveTicks++; else if (h.hurtT > 0) M.hurtTicks++; else if (h.guard) M.guardTicks++; else M.freeTicks++;
    const alive = s.enemies.filter((e) => !e.dead && e.state !== 'dead'); let hpSum = 0; for (const e of alive) hpSum += e.hp;
    trace[tick * 4] = h.x; trace[tick * 4 + 1] = h.z; trace[tick * 4 + 2] = h.y; trace[tick * 4 + 3] = hpSum;
    tags[tick] = `${h.move ? h.move.id : '-'}|${h.act ?? '-'}|${h.dashT > 0 ? 'roll' : '-'}|${h.hurtT > 0 ? 'hurt' : '-'}|${h.guard ? 'g' : '-'}|${h.charging ? 'chg' : '-'}|${h.onGround ? 'gr' : 'air'}`;
    if (h.dead) { h.dead = false; h.hp = h.hpMax; }
    while (s.enemies.filter((e) => !e.dead && e.state !== 'dead').length < 6) spawn(KINDS[Math.floor(ER() * KINDS.length)]);
  }
  Math.random = mr;
  if (tune) for (const k in keep) TUNE[k] = keep[k];
  return { M, trace, tags, EV, presses, S };
}
const firstDiff = (A, B, n) => { for (let i = 0; i < n; i++) { if (A.tags[i] !== B.tags[i]) return i; for (let k = 0; k < 4; k++) if (A.trace[i * 4 + k] !== B.trace[i * 4 + k]) return i; } return -1; };
const near = (R, i) => { const o = []; for (const p of R.presses) if (p[0] >= i - 20 && p[0] <= i) o.push(`${p[1]}@${p[0] - i}`); return o.join(' '); };

let fails = 0; const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (!cond) fails++; };
const res = { A: [], B: [], C: null };

// ── A: the buffer shut ──
console.log(`[A] rules of the base commit against today's rules with the buffer shut (bufT one tick, rollIfr 0.26), ${SEEDS} seeds x ${TICKS} ticks, six enemies kept alive`);
const kindsA = {};
for (let sd = 1; sd <= SEEDS; sd++) {
  const a = run(OLD, sd, TICKS, {}), b = run(NEW, sd, TICKS, { tune: { bufT: 0.001, rollIfr: 0.26, dashIfr: 0.26 } }), d = firstDiff(a, b, TICKS);
  const why = d < 0 ? 'identical' : `old ${a.tags[d]} / new ${b.tags[d]} · before: ${a.tags[Math.max(0, d - 1)]} · presses ${near(a, d)}`;
  res.A.push({ seed: sd, firstDiff: d, why }); const key = d < 0 ? 'identical' : `old ${a.tags[d].split('|').slice(0, 4).join('|')} -> new ${b.tags[d].split('|').slice(0, 4).join('|')} (before ${a.tags[Math.max(0, d - 1)].split('|').slice(0, 4).join('|')})`;
  kindsA[key] = (kindsA[key] ?? 0) + 1;
  console.log(`   seed ${sd}: ${d < 0 ? 'identical for ' + TICKS + ' ticks' : 'first difference at tick ' + d + ' — ' + why}`);
}
console.log('   kinds: ' + JSON.stringify(kindsA));

// ── B: as shipped ──
console.log(`[B] base commit (jump as its scene gave it: held 0.12 s) against today as shipped, same finger scripts`);
const sum = (rs, f) => rs.reduce((t, r) => t + f(r.M), 0), RB = [], RA = [];
for (let sd = 1; sd <= SEEDS; sd++) { const a = run(OLD, sd, TICKS, { oldJump: true }), b = run(NEW, sd, TICKS, {}); RB.push(a); RA.push(b); const d = firstDiff(a, b, TICKS); res.B.push({ seed: sd, firstDiff: d, old: a.tags[d], now: b.tags[d], presses: d >= 0 ? near(a, d) : '' }); }
const line = (name, f, digits = 0) => { const o = sum(RB, f), n = sum(RA, f); console.log(`   ${name.padEnd(34)} before ${o.toFixed(digits).padStart(9)}   today ${n.toFixed(digits).padStart(9)}   ${o ? ((n / o - 1) * 100).toFixed(1) + ' %' : ''}`); return [o, n]; };
const T = {};
T.press = line('presses (attack+roll+jump+skill)', (m) => m.press.attack + m.press.dash + m.press.jump + m.press.skill);
T.moves = line('attack moves started', (m) => Object.values(m.moves).reduce((a, b) => a + b, 0));
for (const id of ['c1', 'c2', 'c3', 'sweep', 'whip', 'plunge']) T['mv_' + id] = line('  ' + id, (m) => m.moves[id] ?? 0);
T.rolls = line('rolls started', (m) => m.rolls);
T.rollsHurt = line('hurt within a roll', (m) => m.rollsHurt);
T.jumps = line('jumps', (m) => m.jumps);
T.hook = line('hooks thrown', (m) => m.acts.hook ?? 0);
T.call = line('calls', (m) => m.acts.call ?? 0);
T.denies = line('skill denied', (m) => m.denies);
T.hits = line('hits on enemies', (m) => m.hits);
T.dealt = line('damage dealt', (m) => m.dmgDealt);
T.hurts = line('times the hero was hurt', (m) => m.hurts);
T.taken = line('damage taken', (m) => m.dmgTaken);
T.dist = line('distance walked (px)', (m) => m.dist);
T.moveTicks = line('ticks inside an attack move', (m) => m.moveTicks);
T.hurtTicks = line('ticks in hit-stun', (m) => m.hurtTicks);
T.freeTicks = line('ticks free', (m) => m.freeTicks);
res.Bsum = T;
console.log('   first difference per seed: ' + res.B.map((q) => `s${q.seed}@${q.firstDiff}[${q.old?.split('|').slice(0, 4).join('|')} -> ${q.now?.split('|').slice(0, 4).join('|')} · ${q.presses}]`).join('  '));

// ── C: press audit on today's rules ──
console.log(`[C] today's rules: what each press did (same scripts, ${SEEDS} seeds)`);
const C = { attack: { n: 0, fired: 0, late: 0, maxWait: 0, afterHurt: 0, waits: {} }, dash: { n: 0, fired: 0, late: 0, maxWait: 0, afterHurt: 0, waits: {} }, jump: { n: 0, fired: 0, late: 0, maxWait: 0, afterHurt: 0, waits: {} }, skill: { n: 0, fired: 0, late: 0, maxWait: 0, afterHurt: 0, waits: {} }, orphan: [], sweepLate: 0 };
for (let i = 0; i < RA.length; i++) {
  const R = RA[i], P = R.presses.map((p) => ({ t: p[0], k: p[1], used: false, stick: p[2] })), hurts = R.EV.filter((e) => e[1] === 'hurt').map((e) => e[0]);
  for (const p of P) C[p.k].n++;
  for (const e of R.EV) {
    let k = null; if (e[1] === 'move') { if (e[2] === 'whip') continue; k = 'attack'; } else if (e[1] === 'roll') k = 'dash'; else if (e[1] === 'jump') k = 'jump'; else if (e[1] === 'act') { if (e[2] === 'hook' || e[2] === 'call') k = 'skill'; else continue; } else continue;
    let best = null; for (const p of P) if (p.k === k && !p.used && p.t <= e[0] && e[0] - p.t <= 40) best = p;   // the newest unused press of that kind
    if (!best) { if (k === 'dash') continue; /* a roll out of a held guard with the stick pushed has no press of its own */ C.orphan.push({ seed: i + 1, tick: e[0], what: e[2] ?? e[1], last: P.filter((p) => p.k === k && p.t <= e[0]).slice(-2).map((p) => `${p.t}${p.used ? 'u' : ''}`).join(',') }); continue; }
    best.used = true; const w = e[0] - best.t, c = C[k]; c.fired++; c.waits[w] = (c.waits[w] ?? 0) + 1; if (w > c.maxWait) c.maxWait = w;
    const lim = e[2] === 'sweep' ? 99 : 12; if (w > lim) c.late++; if (e[2] === 'sweep' && w > 12) C.sweepLate++;
    if (hurts.some((t) => t > best.t && t <= e[0])) c.afterHurt++;
  }
}
for (const k of ['attack', 'dash', 'jump', 'skill']) { const c = C[k]; console.log(`   ${k.padEnd(7)} presses ${String(c.n).padStart(5)} · fired ${String(c.fired).padStart(5)} · later than 12 ticks ${c.late} · longest wait ${c.maxWait} ticks · fired after a hit came in between ${c.afterHurt} · waits ${JSON.stringify(c.waits)}`); }
console.log(`   sweeps out of a roll later than 12 ticks after their press (old rule: roll, then sweep): ${C.sweepLate}`);
console.log(`   actions with no press of their own: ${C.orphan.length} ${JSON.stringify(C.orphan.slice(0, 12))}`);
res.C = C;
ok('no attack, jump or skill fires without a press of its own (a press never fires twice)', C.orphan.length === 0, C.orphan.length + ' orphans');
ok('no press fires later than 12 ticks (0.2 s) after it was made (sweeps out of a roll aside)', C.attack.late + C.dash.late + C.jump.late + C.skill.late === 0);
fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(`${OUT}/same.json`, JSON.stringify(res, null, 1));
console.log(fails ? `FAILED ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
