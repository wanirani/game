// WHIP lane — the hook under a ring while an elite strikes: every skill press and what became of it (node, the real rules, no browser, seeded).
//   node tools/v2/whip_hookpress.mjs [--n 1000] [--seed 7] [--base <tree with src/v2/play>] [--kind gravekeeper_armor] [--list 12]
// The hero stands 120 px from a whip ring, a grave-keeper (awake, never falling) beside him. Every 20-60 ticks one skill press, in a third of the cases with
// another press 0-5 ticks before it (attack, jump, or roll with the stick). The hero's health is kept up; after a hook, and when he is knocked more than 150 px
// from his spot, he is set back. For every press: was the hook thrown within 45 rule ticks, how many ticks later, and if not - why:
//   hit     the hero was struck after the press and before the hook could go (a press never fires across a hit - PLAY_API 1.1)
//   ran out the press waited longer than the buffer (0.19 s) plus its hold (0.35 s in a roll, a stun, the air, an open hit window)
//   no ring the ring was out of reach on the tick he became free          taken   a later press of another button took its place
import fs from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('n', 1000)), SEED = Number(arg('seed', 7)), BASE = arg('base', null), KIND = arg('kind', 'gravekeeper_armor'), LIST = Number(arg('list', 12)), ROOT = new URL('../..', import.meta.url).pathname;
const P = await import((BASE ?? ROOT) + '/src/v2/play/index.js'), { Sim, flatArena, TUNE } = P, DT = 1 / 60;
let seed = SEED >>> 0; const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const realRandom = Math.random; Math.random = rnd;
const X0 = 0, Z0 = 0, ev = []; let tick = 0;
const sim = new Sim(flatArena(900, 700, [{ kind: KIND, x: X0 + 70, z: Z0 + 30, active: true }]), { event: (n, a, b) => { if (n === 'heroHurt') ev.push([tick, 'hurt']); else if (n === 'act' && (b === 'hook' || b === 'call')) ev.push([tick, b]); else if (n === 'deny') ev.push([tick, 'deny']); } });
sim.hookPoints.push({ id: 'r1', x: X0 + 120, y: 0, z: Z0, to: [X0 + 320, Z0 + 40] });
const foe = sim.enemies[0], h0 = () => sim.hero;
const home = () => { const h = h0(); h.x = X0; h.z = Z0; h.y = 0; h.vx = h.vz = h.vy = 0; h.onGround = true; h.act = null; h.move = null; h.dashT = 0; h.hurtT = 0; h.ifr = 0; h.rollCd = 0; h.charging = false; h.dirX = 1; h.dirZ = 0; sim.dropPresses(); foe.x = X0 + 70; foe.z = Z0 + 30; };
const state = (h) => (h.dead ? 'dead' : h.hurtT > 0 ? 'stunned' : h.act ? 'act:' + h.act : h.dashT > 0 ? 'rolling' : h.move ? 'move:' + h.move.id : !h.onGround ? 'air' : 'free');
const step = (inp) => { const h = h0(); h.hp = h.hpMax; foe.hp = foe.hpMax = 99999; sim.stop = 0; sim.update(DT, inp); sim.stop = 0; tick++; if (h0().act === null && Math.hypot(h0().x - X0, h0().z - Z0) > 150 && h0().onGround && !(h0().hurtT > 0) && !(h0().dashT > 0)) home(); };
home(); for (let i = 0; i < 30; i++) step({});
const presses = [];
for (let i = 0; i < N; i++) {
  const gap = 20 + Math.floor(rnd() * 40); for (let k = 0; k < gap; k++) step({});
  const pre = rnd() < 0.34 ? ['attack', 'jump', 'roll'][Math.floor(rnd() * 3)] : null, d = Math.floor(rnd() * 6);
  if (pre) { step(pre === 'attack' ? { attack: true } : pre === 'jump' ? { jump: true, jumpHeld: true } : { mx: 0, mz: -1, dash: true }); for (let k = 0; k < d; k++) step(pre === 'jump' ? { jumpHeld: true } : pre === 'roll' ? { mz: -1 } : {}); }
  const h = h0(), p = { t: tick, st: state(h), lit: h.hookId != null, pre, d, trace: [] };
  step({ skill: true, mz: pre === 'roll' ? -1 : 0 });
  for (let k = 0; k < 45; k++) { const q = h0(); p.trace.push(`${state(q)}${q.bufS > 0 ? '*' : ''}${q.hookId == null ? '!' : ''}`); if (ev.some((e) => e[0] >= p.t && e[1] === 'hook')) break; step({ mz: pre === 'roll' && k < 20 ? -1 : 0 }); }
  const fired = ev.find((e) => e[0] >= p.t && e[1] === 'hook'); p.fire = fired ? fired[0] - p.t : -1;
  if (!fired) {
    const hurt = ev.find((e) => e[0] >= p.t && e[1] === 'hurt'), firstFree = p.trace.findIndex((s) => s.startsWith('free'));
    const lost = p.trace.findIndex((s) => !s.includes('*'));   // the tick the carried press was gone
    p.why = hurt && (lost < 0 || hurt[0] - p.t - 1 <= lost + 1) ? 'hit' : firstFree >= 0 && p.trace[firstFree].includes('!') ? 'no ring' : lost >= 0 && (firstFree < 0 || lost <= firstFree) ? 'ran out' : 'other';
  }
  presses.push(p); ev.length = 0;
  if (h0().act === 'hook') { for (let k = 0; k < 60 && h0().act; k++) step({}); home(); for (let k = 0; k < 8; k++) step({}); }
}
Math.random = realRandom;
const lit = presses.filter((p) => p.lit), ok = lit.filter((p) => p.fire >= 0), by = {}, why = {}, waits = {};
for (const p of lit) { const k = p.st; by[k] ??= [0, 0]; by[k][0]++; if (p.fire >= 0) { by[k][1]++; const w = p.fire > 12 ? '13+' : p.fire > 0 ? '1-12' : '0'; waits[w] = (waits[w] ?? 0) + 1; } else why[`${p.st} -> ${p.why}`] = (why[`${p.st} -> ${p.why}`] ?? 0) + 1; }
console.log(`whip_hookpress${BASE ? ' (rules of ' + BASE + ')' : ''}: ${N} skill presses under the ring, ${KIND} striking (seed ${SEED}) · the ring was lit at ${lit.length} of them`);
console.log(`  hook thrown: ${ok.length} of ${lit.length} = ${(ok.length / lit.length * 100).toFixed(1)} %   · wait in rule ticks: ${JSON.stringify(waits)} · longest ${Math.max(...ok.map((p) => p.fire))}`);
console.log('  by the hero\'s state at the press (thrown / presses): ' + Object.entries(by).map(([k, v]) => `${k} ${v[1]}/${v[0]}`).join(' · '));
console.log('  not thrown, why: ' + (Object.entries(why).map(([k, v]) => `${k} ${v}`).join(' · ') || '-'));
const miss = lit.filter((p) => p.fire < 0);
for (const p of miss.slice(0, LIST)) console.log(`    press @${p.t} (${p.st}${p.pre ? ', ' + p.pre + ' ' + p.d + ' ticks before' : ''}) ${p.why}: ${p.trace.slice(0, 40).join(' ')}`);
fs.mkdirSync('/tmp/claude-0/v2/whip2', { recursive: true }); fs.writeFileSync(`/tmp/claude-0/v2/whip2/hookpress${BASE ? '_base' : ''}.json`, JSON.stringify({ n: N, lit: lit.length, thrown: ok.length, by, why, miss: miss.map((p) => ({ t: p.t, st: p.st, pre: p.pre, d: p.d, why: p.why, trace: p.trace })) }));
