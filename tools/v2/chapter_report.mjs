// CHAPTER-AUDIT (read-only helper): merges the audit runs into the final table and the numbers.
//   node tools/v2/chapter_report.mjs [--out /tmp/claude-0/v2/chapter_audit]
// state.json = the last run's line of play; state_run*.json = earlier runs (a row that was not reached honestly in the last line is taken from the best earlier run).
import fs from 'node:fs';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '/tmp/claude-0/v2/chapter_audit';
const { EVENTS } = await import('../../src/v2/data/events.js');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(`${OUT}/${f}`, 'utf8')); } catch { return null; } };
const S = rd('state.json'), older = ['state_run5.json', 'state_run4.json', 'state_run3.json'].map((f) => [f, rd(f)]).filter((q) => q[1]);
const rank = (r) => (!r ? 0 : r.status === 'honest' ? 2 : 1);
const rows = {}, from = {};
for (const e of EVENTS) { let best = S.rows[e.id] ?? null, src = 'last line'; for (const [f, o] of older) { const r = o.rows[e.id]; if (rank(r) > rank(best)) { best = r; src = f.replace('state_', '').replace('.json', ''); } } if (best) { rows[e.id] = best; from[e.id] = src; } }
const WHY = {
  ev_tower_bridge: 'cannot fire: it listens to exit.missing {to_belltower}, raised only when belltower_now does not exist — the tower is built (src/v2/world/index.js AREAS)',
  ev_tower_locked: 'cannot fire before the promise: the tower door is only reached through trigger church.arrive, which sets `promise` and unlocks it (tools/v2/chapter_reach.mjs: no way round the trigger box); after the promise the exit is open',
  ev_bell_lost: 'safety net for a save cut off in the middle of the first crossing (events.js: safety: true) — not met in play, by design',
  ev_ossuary_door_past: 'not played: needs a second visit to graveyard_past after the bell hangs (the first visit ends in the crossing). Its other branch (carved + bell not hung -> run ev_hang_bell) is shadowed by ev_ossuary_exit_past, which fires first at the hook landing',
  ev_ossuary_bridge: 'cannot fire in play: exit.missing {to_ossuary} needs a missing area, and ev_ossuary_exit_now only runs it while the exit is still locked with ossuary_open set — the door dialogue unlocks the exit in the same step',
};
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s).replace(/\|/g, '/');
const L = ['| # | event (GDD minute) | result | Δ ticks | what the player sees | errors · warnings | still |', '|---|---|---|---|---|---|---|'];
let honest = 0, helped = 0, not = 0;
EVENTS.forEach((e, i) => { const r = rows[e.id];
  if (!r) { not++; L.push(`| ${i + 1} | ${e.id} (${e.minute}) | NOT REACHED — ${WHY[e.id] ?? 'not met by the plan'} | | | | |`); return; }
  if (r.status === 'honest') honest++; else helped++;
  L.push(`| ${i + 1} | ${e.id} (${e.minute}) | ${r.status === 'honest' ? 'honest play' : 'WITH HELP — ' + cut(r.help ?? '', 170)}${from[e.id] !== 'last line' ? ' (' + from[e.id] + ')' : ''}${(r.times ?? 1) > 1 ? ' ×' + r.times : ''} | ${r.dt} | ${cut((r.seen ?? []).slice(0, 3).join(' ▸ ') || '(nothing shown)', 150)} | ${cut([...(r.errors ?? []), ...(r.warnings ?? [])].join(' ; '), 100) || '—'} | ${r.still ? 'shots/' + r.still.split('/').pop() : ''} |`); });
fs.writeFileSync(`${OUT}/table_final.md`, L.join('\n') + '\n');
// numbers
const blocks = {}; for (const e of EVENTS) { const r = S.rows[e.id]; if (!r) continue; blocks[e.minute] = (blocks[e.minute] ?? 0) + r.dt; }
const lastT = Math.max(...Object.values(S.rows).map((r) => r.ticks)), deaths = S.beats.reduce((n, b) => n + b.raised.filter((q) => q.startsWith('hero.dead')).length, 0);
const saveEv = ['ev_rest', 'ev_return_first', 'ev_hung_now', 'ev_boss_rest', 'ev_boss_sent', 'ev_keepers', 'ev_ending_home'].filter((id) => S.rows[id]).map((id) => [id, S.rows[id].ticks]).sort((a, b) => a[1] - b[1]);
let gap = 0, gapAt = ''; for (let i = 0; i <= saveEv.length; i++) { const a = i ? saveEv[i - 1] : ['(start)', 0], b = saveEv[i] ?? ['(end)', lastT]; if (b[1] - a[1] > gap) { gap = b[1] - a[1]; gapAt = `${a[0]} -> ${b[0]}`; } }
const cross = S.beats.filter((b) => b.ok && /cross|hang_bell|boss_chase|boss_back|ending_bell/.test(b.id) && b.id !== 'to_bell_past').map((b) => b.id);
const N = { rows: { honest, helped, notReached: not, of: EVENTS.length }, ticksTotal: lastT, gameMinutes: +(lastT / 3600).toFixed(1), perBlockMinutes: Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, +(v / 3600).toFixed(1)])), fights: S.num.fights.map((f) => `${f.group}: ${f.ticks} ticks, hp ${JSON.stringify(f.hp)}, falls ${f.deaths}`), heroFalls: deaths, lostWay: S.num.lostWay, helps: S.helps, saveFiles: fs.readdirSync(`${OUT}/saves`).length, storySaveSteps: saveEv.map((q) => `${q[0]}@${q[1]}`), longestWithoutSaveStep: { ticks: gap, minutes: +(gap / 3600).toFixed(1), between: gapAt }, crossings: cross, pageErrors: S.errors.filter((e) => !e.text.startsWith('[tool]')), toolErrors: S.errors.filter((e) => e.text.startsWith('[tool]')).length, contextLost: S.lost, storyWarnings: S.warnings, notes: S.notes };
fs.writeFileSync(`${OUT}/numbers.json`, JSON.stringify(N, null, 1));
console.log(JSON.stringify({ ...N, fights: undefined, notes: undefined, helps: N.helps.map((h) => `${h.beat}: ${h.what}`) }, null, 1));
console.log('FIGHTS\n' + N.fights.join('\n'));
