// Platform QA runner — platform.md §11 WP-10, MASTER_PLAN §5.1 "runtime platform".
// Runs the platform suites one after another (each in its own process), then prints one summary by issue.
//
//   node tools/qa/run_platform.mjs [--only pad,bind,touch,view,menu,pwa,load,turntable] [--strict] [--assume PKG,…] [--shots]
//                                  [--jobs N] (suites in parallel, default 2; output buffered per suite) [--timeout <s per suite>]
//   npm run qa:platform
//
// Suites: pad (platform_pad), bind (platform_bind: awaken/mount/guard on keyboard, pad and touch + every canvas button,
//         stepped), touch (platform_touch + the --layout matrix), view (platform_view without its pwa group),
//         menu (platform_menu), pwa (platform_pwa), load (platform_load; --dist when dist/web exists),
//         turntable (tools/qa/turntable.mjs when PLAT-TURNTABLE has added it).
// Reports: /tmp/claude-0/qa/platform/<suite>.json and summary.json (red checks by issue and by owning package: a
// W1/W2 package that runs the whole suite reads its own rows). Exit 1 when any check is red (fail/error).
// "pending" = the check fails but the package that delivers the feature has not landed yet (see lib/suite.mjs);
// --strict counts pending as red (use it once every platform package has landed).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, HEADLINE } from './lib/suite.mjs';
import { REPORT_DIR, ROOT } from './lib/server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs();
const pass = [];
if (args.strict) pass.push('--strict');
if (args.assume.length) pass.push('--assume', args.assume.join(','));
if (args.shots) pass.push('--shots');
const dist = fs.existsSync(path.join(ROOT, 'dist/web/index.html'));

const SUITES = [
  { key: 'pad', file: 'platform_pad.mjs', report: 'platform_pad.json' },
  { key: 'bind', file: 'platform_bind.mjs', report: 'platform_bind.json' },
  { key: 'touch', file: 'platform_touch.mjs', report: 'platform_touch.json' },
  { key: 'touch', file: 'platform_touch.mjs', extra: ['--layout', '--only', 'matrix'], report: 'platform_touch_layout.json' },
  { key: 'view', file: 'platform_view.mjs', extra: ['--skip', 'pwa'], report: 'platform_view.json' },
  { key: 'menu', file: 'platform_menu.mjs', report: 'platform_menu.json' },
  { key: 'pwa', file: 'platform_pwa.mjs', report: 'platform_pwa.json' },
  { key: 'load', file: 'platform_load.mjs', extra: dist ? ['--dist'] : [], report: dist ? 'platform_load_dist.json' : 'platform_load.json' },
  { key: 'turntable', file: 'turntable.mjs', report: null, optional: true },
];
const TIMEOUT_MS = Number(args.timeout || 15 * 60) * 1000;

const JOBS = Math.max(1, Number(args.jobs) || 2); // two suites at a time by default (checks are frame-based, not wall-clock)
function run(file, argv) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    // with --jobs > 1 each suite's output is buffered and printed when it ends (no interleaving)
    const child = spawn(process.execPath, [path.join(HERE, file), ...argv], { stdio: JOBS > 1 ? ['ignore', 'pipe', 'pipe'] : 'inherit', cwd: ROOT });
    let out = '';
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.on('exit', (code, sig) => { clearTimeout(timer); if (JOBS > 1) process.stdout.write(`\n══ ${file} ${argv.join(' ')} ══\n${out}`); resolve({ code, sig, ms: Date.now() - t0 }); });
  });
}

fs.mkdirSync(REPORT_DIR, { recursive: true });
const t0 = Date.now();
const todo = [];
const runs = [];
for (const [idx, s0] of SUITES.entries()) {
  const s = { ...s0, idx };
  if (args.only && !args.only.includes(s.key)) continue;
  if (s.optional && !fs.existsSync(path.join(HERE, s.file))) { runs.push({ ...s, skipped: 'not present yet (PLAT-TURNTABLE)' }); continue; }
  todo.push(s);
}
async function runOne(s) {
  if (JOBS === 1) console.log(`\n══ ${s.file} ${[...(s.extra || []), ...pass].join(' ')} ══`);
  const rp = s.report && path.join(REPORT_DIR, s.report);
  if (rp && fs.existsSync(rp)) fs.rmSync(rp);
  const r = await run(s.file, [...(s.extra || []), ...pass]);
  let rep = null;
  if (rp && fs.existsSync(rp)) { try { rep = JSON.parse(fs.readFileSync(rp, 'utf8')); } catch { rep = null; } }
  runs.push({ ...s, ...r, rep });
}
const COST = { view: 10, pad: 5, menu: 3, touch: 2, turntable: 2, bind: 1, pwa: 1, load: 1 }; // longest first packs the workers best
const queue = todo.slice().sort((a, b) => (COST[b.key] ?? 1) - (COST[a.key] ?? 1));
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => { while (queue.length) await runOne(queue.shift()); }));
runs.sort((a, b) => a.idx - b.idx);

// ── summary ───────────────────────────────────────────────────────────────────────────────────────
const red = [], pending = [];
const byIssue = {};
for (const r of runs) {
  if (r.skipped) continue;
  if (!r.rep) {
    // a suite without a report (crash, timeout, or a foreign script such as turntable.mjs): its exit code decides
    const status = r.code === 0 ? 'pass' : 'error';
    const c = { suite: r.file, id: `${r.key}.exit`, issue: r.key === 'turntable' ? 'P-11/§7' : null, status, detail: `exit ${r.code ?? r.sig} after ${(r.ms / 1000).toFixed(0)} s` };
    if (status !== 'pass') red.push(c);
    continue;
  }
  for (const c of r.rep.checks) {
    const x = { suite: r.file, ...c };
    if (c.status === 'fail' || c.status === 'error') red.push(x);
    if (c.status === 'pending') pending.push(x);
    const k = c.issue || '(errors)';
    (byIssue[k] ||= { pass: 0, fail: 0, error: 0, pending: 0, skip: 0 })[c.status]++;
  }
}
const redIssues = [...new Set(red.map((c) => c.issue || '(page errors / harness)'))].sort();
// which package owns each red check (a W1/W2 package runs the whole suite and looks only at its own rows)
const redByPackage = {};
for (const c of red) redByPackage[c.pkg || '(page errors / harness)'] = (redByPackage[c.pkg || '(page errors / harness)'] || 0) + 1;
const summary = {
  when: new Date().toISOString(), durationMs: Date.now() - t0, strict: args.strict, dist,
  suites: runs.map((r) => ({ file: r.file, extra: r.extra || [], exit: r.code ?? null, ms: r.ms ?? 0, skipped: r.skipped || null, counts: r.rep?.counts || null })),
  redIssues, headline: HEADLINE, byIssue, redByPackage,
  red: red.map((c) => ({ suite: c.suite, id: c.id, issue: c.issue, pkg: c.pkg, status: c.status, detail: String(c.detail || '').slice(0, 300), shot: c.shot })),
  pending: pending.map((c) => ({ suite: c.suite, id: c.id, issue: c.issue, gate: c.gate, would: c.would, detail: String(c.detail || '').slice(0, 200) })),
};
fs.writeFileSync(path.join(REPORT_DIR, 'summary.json'), JSON.stringify(summary, null, 1));

console.log('\n══════════ platform QA summary ══════════');
for (const s of summary.suites) console.log(`${s.file.padEnd(20)} ${(s.extra.join(' ') || '').padEnd(12)} ${s.skipped ? 'skipped: ' + s.skipped : s.counts ? `${s.counts.pass} pass, ${s.counts.fail} fail, ${s.counts.error} error, ${s.counts.pending} pending, ${s.counts.skip} skip` : `exit ${s.exit}`} ${s.ms ? `(${(s.ms / 1000).toFixed(0)} s)` : ''}`);
console.log('\nby issue (pass/fail/error/pending):');
for (const [k, v] of Object.entries(byIssue).sort()) console.log(`  ${k.padEnd(10)} ${v.pass}/${v.fail}/${v.error}/${v.pending}${v.fail + v.error ? '  ← red' : ''}`);
if (red.length) {
  console.log(`\nred checks (${red.length}):`);
  for (const c of red) console.log(`  ${c.status === 'error' ? 'ERR ' : 'FAIL'} ${c.id} [${[c.issue, c.pkg].filter(Boolean).join(' ')}] ${String(c.detail || '').slice(0, 160)}`);
}
const pend = {};
for (const c of pending) (pend[c.gate] ||= []).push(c.id);
if (pending.length) console.log(`\npending (waiting for their package): ${Object.entries(pend).map(([k, v]) => `${k} ×${v.length}`).join(', ')}`);
if (red.length) console.log(`\nred by package: ${Object.entries(redByPackage).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(', ')}`);
console.log(`\nred issues: ${redIssues.join(', ') || 'none'}`);
console.log(`total ${(summary.durationMs / 60000).toFixed(1)} min — ${path.join(REPORT_DIR, 'summary.json')}`);
process.exit(red.length ? 1 : 0);
