// Full regression suite — MASTER_PLAN §5.1, the single entry for a W4 QA round. Runs every suite in the §5.1 order,
// one process at a time (the QA box is heavily loaded), and writes ONE summary: /tmp/claude-0/qa/run_all.json + .md with
// every step's status and every finding grouped by W4 fix bucket (MASTER_PLAN §5.3). A round that stops early (Ctrl-C,
// a crashed step, --bail) still writes the summary of what ran — it is rewritten after every step.
//
//   node tools/qa/run_all.mjs [--quick] [--only id,group,…] [--skip id,group,…] [--list] [--bail]
//                             [--timeout-scale 2] [--apk] [--site https://…] [--dist]
//
//   --quick         a shorter round: integration desktop only, perf --quick on desk + phone1low, soak 3 min,
//                   visual --quick, feel/commands --quick where the tool supports it
//   --only/--skip   step ids (see --list) or groups: static unit balance runtime platform perf soak visual galleries delivery
//   --apk           also build and verify the APK (slow; off by default)   --site URL  also run the post-deploy smoke
//   --dist          integration also runs against dist/web (after the delivery build; the load suite always does)
//
// Exit code 1 when any step is red. Optional steps whose tool does not exist yet (feel_test, balance_companions,
// scan_mount_fit, test_companions) are reported as 'absent', not as failures.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from './lib/server.mjs';
import { QA_DIR, TOOLS_DIR, parseFlags, list, findingsMd } from './lib/report.mjs';
import { ownerOf, bucketOfPackage, groupFindings } from './lib/owners.mjs';

const args = parseFlags();
const QUICK = !!args.quick;
const SCALE = Number(args['timeout-scale']) || 1;
const LOG_DIR = path.join(QA_DIR, 'run_all');
fs.mkdirSync(LOG_DIR, { recursive: true });
const HEROES = ['kael', 'sera', 'victor', 'bran', 'lia', 'azel'];
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const MIN = 60000;

/** step: id, group, cmd [argv], timeout ms, script (the file whose owner triages a red exit), report (JSON path of a
 *  tools/qa report with findings/checks), ok(code, out) → pass?, optional: absent when the script does not exist. */
const S = (id, group, cmd, timeout, extra = {}) => ({ id, group, cmd, timeout, script: extra.script || cmd.find((x) => /\.(mjs|py|sh)$/.test(x)) || null, ...extra });
const node = (...a) => ['node', ...a];
const STEPS = [
  // ── static
  S('validate_maps', 'static', node('tools/validate_maps.mjs'), 5 * MIN),
  S('part2_static', 'static', node('tools/test_part2.mjs', '--static'), 10 * MIN),
  S('fonts', 'static', ['python3', 'tools/fonts/build_fonts.py', '--check'], 10 * MIN),
  S('hook_tags', 'static', node('tools/qa/hook_tags.mjs'), 5 * MIN, { report: path.join(TOOLS_DIR, 'hook_tags.json') }),
  S('bindings', 'static', node('tools/qa/bindings.mjs'), 10 * MIN, { report: path.join(TOOLS_DIR, 'bindings.json') }),
  S('painted_registry', 'static', node('tools/qa/painted_registry.mjs'), 5 * MIN, { report: path.join(TOOLS_DIR, 'painted_registry.json') }),
  // ── unit
  S('save_v2', 'unit', node('tools/test_save_v2.mjs'), 10 * MIN),
  S('settings_v2', 'unit', node('tools/test_settings_v2.mjs'), 10 * MIN),
  S('companion_state', 'unit', node('tools/test_companion_state.mjs'), 10 * MIN),
  S('accounts_api', 'unit', node('tools/accounts/test_api.mjs'), 10 * MIN),
  S('sfx', 'unit', node('tools/test_sfx.mjs'), 10 * MIN),
  S('hud_layout', 'unit', node('tools/test_hud_layout.mjs'), 15 * MIN),
  // ── balance
  ...HEROES.map((h) => S(`balance.${h}`, 'balance', node('tools/balance.mjs', 'normal', h, '--check'), 10 * MIN)),
  S('balance_companions', 'balance', node('tools/balance_companions.mjs'), 10 * MIN, { optional: true }),
  S('scan_mount_fit', 'balance', node('tools/scan_mount_fit.mjs'), 10 * MIN, { optional: true }),
  // ── runtime
  S('integration', 'runtime', node('tools/integration.mjs'), 90 * MIN),
  S('integration_mobile', 'runtime', node('tools/integration.mjs', '--mobile'), 90 * MIN, { quickSkip: true }),
  S('part2', 'runtime', node('tools/test_part2.mjs'), 90 * MIN),
  S('feel', 'runtime', node('tools/feel_test.mjs', ...(QUICK ? ['--quick'] : [])), 60 * MIN, { optional: true }),   // --quick: kael + lia
  S('mount', 'runtime', node('tools/test_mount.mjs'), 40 * MIN),
  S('guardians', 'runtime', node('tools/test_guardians.mjs'), 40 * MIN),
  S('companions', 'runtime', node('tools/test_companions.mjs'), 40 * MIN, { optional: true }),
  S('commands', 'runtime', node('tools/qa/commands.mjs', ...(QUICK ? ['--quick'] : [])), 60 * MIN, { report: path.join(TOOLS_DIR, 'commands.json') }),
  // ── platform (pad, touch, view, menu, bind, turntable, load, pwa)
  S('platform', 'platform', node('tools/qa/run_platform.mjs'), 60 * MIN, { platform: true }),
  // ── perf / soak / visual
  S('perf', 'perf', node('tools/qa/perf_budget.mjs', '--profiles', QUICK ? 'desk,phone1low' : 'phone1,phone2,tablet,desk,fhd2x,phone1low', ...(QUICK ? ['--quick'] : [])), 90 * MIN, { report: path.join(TOOLS_DIR, 'perf_budget.json') }),
  S('soak', 'soak', node('tools/qa/soak.mjs', '--minutes', QUICK ? '3' : '10'), (QUICK ? 10 : 20) * MIN, { report: path.join(TOOLS_DIR, 'soak.json') }),
  S('visual', 'visual', node('tools/qa/visual_review.mjs', ...(QUICK ? ['--quick'] : [])), 120 * MIN, { report: path.join(TOOLS_DIR, 'visual_review.json') }),
  // ── smoke on every gallery page (tools/smoke.mjs prints NO ERRORS)
  ...fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /^gallery_.*\.html$/.test(f)).sort().map((f) => S(`gallery.${f.replace(/^gallery_|\.html$/g, '')}`, 'galleries',
    node('tools/smoke.mjs', '--url', `tools/${f}`, '--steps', 'wait:1.5,shot', '--out', path.join(LOG_DIR, 'galleries', f.replace('.html', ''))), 5 * MIN,
    { script: `tools/${f}`, ok: (code, out) => code === 0 && /NO ERRORS/.test(out) })),
  // ── delivery
  S('build_web', 'delivery', node('tools/deploy/build_web.mjs'), 30 * MIN),
  // §5.1 writes `serve_dist.mjs --check-load --offline`; serve_dist is only a server, so the load budget and the offline
  // checks run through the suites that implement them
  S('load_dist', 'delivery', node('tools/qa/platform_load.mjs', '--dist'), 30 * MIN),
  S('sw_offline', 'delivery', node('tools/deploy/test_sw.mjs'), 20 * MIN),
  S('artifact', 'delivery', node('tools/deploy/build_artifact.mjs', '--check'), 30 * MIN),
  ...(args.dist ? [S('integration_dist', 'delivery', node('tools/integration.mjs', '--dist'), 90 * MIN)] : []),
  ...(args.apk ? [
    S('apk_build', 'delivery', ['bash', 'tools/apk/build_apk.sh', '--verify'], 60 * MIN),
    S('apk_verify', 'delivery', node('tools/apk/verify_apk.mjs'), 20 * MIN),
  ] : []),
  ...(typeof args.site === 'string' ? [S('smoke_deployed', 'delivery', node('tools/deploy/smoke_deployed.mjs', args.site), 20 * MIN)] : []),
];

if (args.list) {
  for (const s of STEPS) console.log(`${s.id.padEnd(22)} ${s.group.padEnd(10)} ${s.cmd.join(' ')}${s.optional ? '   (optional)' : ''}`);
  process.exit(0);
}
const only = list(args.only), skip = list(args.skip, []);
const pick = (s) => (!only || only.includes(s.id) || only.includes(s.group)) && !skip.includes(s.id) && !skip.includes(s.group) && !(QUICK && s.quickSkip && !only);
const plan = STEPS.filter(pick);
if (only) {
  const known = new Set(STEPS.flatMap((s) => [s.id, s.group]));
  const bad = only.filter((x) => !known.has(x));
  if (bad.length) { console.error(`unknown step/group: ${bad.join(', ')} (see --list)`); process.exit(2); }
}

// ── running ────────────────────────────────────────────────────────────────────────────────────────────────────────────
function run(step) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const logFile = path.join(LOG_DIR, `${step.id}.log`);
    const log = fs.createWriteStream(logFile);
    let tail = '';
    const child = spawn(step.cmd[0], step.cmd.slice(1), { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (b) => { log.write(b); tail = (tail + b.toString()).slice(-60000); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }, step.timeout * SCALE);
    current = child;
    child.on('close', (code, sig) => {
      clearTimeout(timer); log.end(); current = null;
      resolve({ code, sig, timedOut, ms: Date.now() - t0, out: tail, logFile });
    });
    child.on('error', (e) => { clearTimeout(timer); log.end(); current = null; resolve({ code: -1, sig: null, timedOut: false, ms: Date.now() - t0, out: String(e), logFile }); });
  });
}
let current = null;

const results = [];
const findings = [];
const t0 = Date.now();

/** Findings of a tools/qa report (already carry file/bucket/pkg). */
function reportFindings(step) {
  if (!step.report || !fs.existsSync(step.report)) return { counts: null, list: [] };
  try {
    const j = JSON.parse(fs.readFileSync(step.report, 'utf8'));
    if (Date.parse(j.when || 0) < Date.parse(results.at(-1)?.start || 0) - 1000) return { counts: j.counts || null, list: [], stale: true };
    return { counts: j.counts || null, list: (j.findings || []).map((f) => ({ ...f, step: step.id })) };
  } catch { return { counts: null, list: [] }; }
}
/** Red rows of the platform summary → findings (bucket from the owning package the suite names). */
function platformFindings() {
  const f = '/tmp/claude-0/qa/platform/summary.json';
  if (!fs.existsSync(f)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return (j.red || []).map((c) => ({ id: `platform.${c.suite}.${c.id}`, sev: 'S2', kind: 'platform', title: `${c.suite} ${c.id}${c.issue ? ` (${c.issue})` : ''}`, detail: c.detail, pkg: c.pkg || null, bucket: bucketOfPackage(c.pkg) || '(platform, owner unknown)', step: 'platform' }));
  } catch { return []; }
}

function summarize(final = false) {
  const counts = { pass: 0, fail: 0, error: 0, absent: 0, skipped: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1;
  const planned = plan.map((s) => s.id);
  const summary = {
    tool: 'run_all', when: new Date().toISOString(), durationMs: Date.now() - t0, quick: QUICK, final,
    planned, notRun: planned.filter((id) => !results.some((r) => r.id === id)),
    counts, steps: results, findings,
    byBucket: Object.fromEntries(Object.entries(groupFindings(findings)).map(([k, v]) => [k, v.length])),
  };
  fs.writeFileSync(path.join(QA_DIR, 'run_all.json'), JSON.stringify(summary, null, 1));
  const icon = { pass: 'ok', fail: 'FAIL', error: 'ERROR', absent: 'absent', skipped: 'skipped' };
  const md = `# Full regression round (MASTER_PLAN §5.1)\n\n${summary.when} · ${(summary.durationMs / 60000).toFixed(1)} min · ${QUICK ? 'quick' : 'full'} · ` +
    `${counts.pass} pass, ${counts.fail} fail, ${counts.error} error, ${counts.absent} absent${summary.notRun.length ? ` · not run: ${summary.notRun.join(', ')}` : ''}\n\n` +
    `| step | group | status | time | exit | report / log |\n|---|---|---|---|---|---|\n` +
    results.map((r) => `| ${r.id} | ${r.group} | ${icon[r.status]} | ${(r.ms / 60000).toFixed(1)} min | ${r.timedOut ? 'timeout' : r.code ?? r.sig ?? ''} | ${r.report ? `\`${r.report}\`` : ''} \`${r.logFile}\` |`).join('\n') +
    `\n\n## Red steps\n\n${results.filter((r) => r.status === 'fail' || r.status === 'error').map((r) => `### ${r.id}\n\n\`${r.cmd}\` → ${r.timedOut ? 'timed out' : `exit ${r.code ?? r.sig}`}; owner of the suite: ${r.owner?.pkg ?? '?'} (${r.owner?.bucket ?? '?'})\n\n\`\`\`\n${r.tail}\n\`\`\``).join('\n\n') || '(none)'}\n\n` +
    `## Findings by W4 bucket\n\n${findingsMd(findings)}\n`;
  fs.writeFileSync(path.join(QA_DIR, 'run_all.md'), md);
  return summary;
}

process.on('SIGINT', () => {
  console.log('\ninterrupted — writing the summary of the steps that ran');
  if (current) { try { process.kill(-current.pid, 'SIGKILL'); } catch { /* */ } }
  summarize(false);
  process.exit(130);
});

console.log(`run_all: ${plan.length} step(s)${QUICK ? ' (quick)' : ''} — logs in ${LOG_DIR}`);
for (const step of plan) {
  const start = new Date().toISOString();
  const script = step.script;
  if (step.optional && script && !exists(script)) {
    results.push({ id: step.id, group: step.group, status: 'absent', ms: 0, cmd: step.cmd.join(' '), start, detail: `${script} does not exist yet` });
    console.log(`absent  ${step.id} (${script} not present)`);
    summarize();
    continue;
  }
  process.stdout.write(`run     ${step.id} … `);
  results.push({ id: step.id, group: step.group, status: 'running', start, ms: 0, cmd: step.cmd.join(' ') });
  const r = await run(step);
  const ok = step.ok ? step.ok(r.code, r.out) : r.code === 0;
  const status = r.timedOut || r.code === null || r.code < 0 ? 'error' : ok ? 'pass' : 'fail';
  const rep = reportFindings(step);
  const tail = r.out.split('\n').filter((l) => l.trim()).slice(-25).join('\n').slice(-4000);
  const owner = script ? ownerOf(script) : null;
  results[results.length - 1] = { id: step.id, group: step.group, status, start, ms: r.ms, code: r.code, sig: r.sig, timedOut: r.timedOut, cmd: step.cmd.join(' '), logFile: r.logFile, report: step.report || null, counts: rep.counts, tail, owner };
  findings.push(...rep.list);
  if (step.platform) findings.push(...platformFindings());
  // a red suite without its own findings: one finding for the suite owner to triage from the log
  if (status !== 'pass' && !rep.list.length && !step.platform) {
    const file = script;
    findings.push({ id: `run_all.${step.id}`, sev: status === 'error' ? 'S1' : 'S2', kind: 'suite', title: `${step.id} ${r.timedOut ? 'timed out' : `exited ${r.code ?? r.sig}`}`, detail: tail.split('\n').slice(-6).join(' | ').slice(0, 600), file, ...(file ? ownerOf(file) : {}), repro: step.cmd.join(' '), step: step.id });
  }
  console.log(`${status}${r.timedOut ? ' (timeout)' : ''} in ${(r.ms / 1000).toFixed(0)} s${rep.counts ? ` — ${JSON.stringify(rep.counts)}` : ''}`);
  summarize();
  if (args.bail && status !== 'pass') break;
}
const sum = summarize(true);
console.log(`\nrun_all: ${sum.counts.pass} pass, ${sum.counts.fail} fail, ${sum.counts.error} error, ${sum.counts.absent} absent in ${(sum.durationMs / 60000).toFixed(1)} min`);
console.log(`findings by bucket: ${JSON.stringify(sum.byBucket)}`);
console.log(`${path.join(QA_DIR, 'run_all.json')}\n${path.join(QA_DIR, 'run_all.md')}`);
process.exit(sum.counts.fail || sum.counts.error ? 1 : 0);
