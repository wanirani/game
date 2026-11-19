// CHAPTER-AUDIT (read-only helper): merges the audit runs into the final table and the numbers.
//   node tools/v2/chapter_report.mjs [--out /tmp/claude-0/v2/chapter_audit] [--md <file>]
// state.json = the last run's line of play; state_*.json = other runs (a row that was not reached honestly in the last line is taken from the best other run).
// --md <file>: also write the summary line, the numbers and the table as one Markdown file (CHAPTER lane).
import fs from 'node:fs';
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '/tmp/claude-0/v2/chapter_audit';
const { EVENTS } = await import('../../src/v2/data/events.js');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(`${OUT}/${f}`, 'utf8')); } catch { return null; } };
const MD = process.argv.includes('--md') ? process.argv[process.argv.indexOf('--md') + 1] : null;
const S = rd('state.json'), older = fs.readdirSync(OUT).filter((f) => /^state_.+\.json$/.test(f)).sort().reverse().map((f) => [f, rd(f)]).filter((q) => q[1] && q[1].rows);
const rank = (r) => (!r ? 0 : r.status === 'honest' ? 2 : 1);
const rows = {}, from = {};
for (const e of EVENTS) { let best = S.rows[e.id] ?? null, src = 'last line'; for (const [f, o] of older) { const r = o.rows[e.id]; if (rank(r) > rank(best)) { best = r; src = f.replace('state_', '').replace('.json', ''); } } if (best) { rows[e.id] = best; from[e.id] = src; } }
const WHY = {
  ev_tower_locked: 'cannot fire before the promise: the tower door is only reached through trigger church.arrive, which sets `promise` and unlocks it (tools/v2/chapter_reach.mjs: no way round the trigger box); after the promise the exit is open',
  ev_bell_lost: 'safety net for a save cut off in the middle of the first crossing (events.js: safety: true) — not met in play, by design',
  ev_bell_sealed: 'not on the line of play: the arena bell of 1697 before the queen has fled (the line crosses back at the riddle-room bell)',
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
const hasSave = (e) => JSON.stringify(e.steps).includes('["save"]') || (e.id === 'ev_boss_rest');   // (ev_boss_rest is followed by ev_rest on the same press)
const saveEv = EVENTS.filter(hasSave).filter((e) => S.rows[e.id]).flatMap((e) => (S.rows[e.id].all ?? [S.rows[e.id].ticks]).map((t) => [e.id, t])).sort((a, b) => a[1] - b[1]);
let gap = 0, gapAt = ''; for (let i = 0; i <= saveEv.length; i++) { const a = i ? saveEv[i - 1] : ['(start)', 0], b = saveEv[i] ?? ['(end)', lastT]; if (b[1] - a[1] > gap) { gap = b[1] - a[1]; gapAt = `${a[0]} -> ${b[0]}`; } }
const cross = S.beats.filter((b) => b.ok && /cross|hang_bell|boss_chase|boss_back|ending_bell/.test(b.id) && b.id !== 'to_bell_past').map((b) => b.id);
const N = { rows: { honest, helped, notReached: not, of: EVENTS.length }, ticksTotal: lastT, gameMinutes: +(lastT / 3600).toFixed(1), perBlockMinutes: Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, +(v / 3600).toFixed(1)])), fights: S.num.fights.map((f) => `${f.group}: ${f.ticks} ticks, hp ${JSON.stringify(f.hp)}, falls ${f.deaths}`), heroFalls: deaths, lostWay: S.num.lostWay, helps: S.helps, saveFiles: fs.readdirSync(`${OUT}/saves`).length, storySaveSteps: saveEv.length, storySaveEvents: [...new Set(saveEv.map((q) => q[0]))], longestWithoutSaveStep: { ticks: gap, minutes: +(gap / 3600).toFixed(1), between: gapAt }, crossings: cross, pageErrors: S.errors.filter((e) => !e.text.startsWith('[tool]')), toolErrors: S.errors.filter((e) => e.text.startsWith('[tool]')).length, contextLost: S.lost, storyWarnings: S.warnings, notes: S.notes };
fs.writeFileSync(`${OUT}/numbers.json`, JSON.stringify(N, null, 1));
console.log(JSON.stringify({ ...N, fights: undefined, notes: undefined, helps: N.helps.map((h) => `${h.beat}: ${h.what}`) }, null, 1));
console.log('FIGHTS\n' + N.fights.join('\n'));
const SUM = `events reached by honest play ${honest} of ${EVENTS.length} · with help ${helped} · not reached ${not} · helps in the line ${S.helps.length} · page errors ${N.pageErrors.length} · game minutes ${N.gameMinutes} · longest stretch without a save step ${N.longestWithoutSaveStep.minutes} min (${N.longestWithoutSaveStep.between})`;
console.log('SUMMARY ' + SUM);
if (MD) fs.writeFileSync(MD, ['# Chapter 1 played by the bot — merged table', '', SUM, '', 'Runs merged: state.json (the line) ' + older.map((q) => q[0]).join(' '), '', '## Numbers', '', '```json', JSON.stringify({ ...N, notes: undefined }, null, 1), '```', '', '## Notes of the line', '', ...(S.notes ?? []).map((n) => '- ' + n), '', '## Table', '', ...L, ''].join('\n'));
