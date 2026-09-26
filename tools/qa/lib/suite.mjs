// Check runner and report writer for the platform QA suites.
//
//   const suite = new Suite('platform_pad');                  // parses process.argv (--only, --vp, --strict, --assume, --shots)
//   if (suite.wants('glyphs')) await suite.check({ id: 'glyphs.ps', group: 'glyphs', issue: 'P-05', pkg: 'PLAT-INPUT', title: '…' },
//     async () => ({ pass: set === 'ps', detail: `set ${set}`, metrics: {…} }));
//   process.exit(await suite.finish());
//
// Status of a check:
//   pass     the assertion held
//   fail     the assertion failed (red)
//   error    the harness could not run the check (red)
//   pending  it failed or errored, but the check has a `gate` (the package that delivers the feature) and that
//            package has not landed yet (markers below). Pending checks are listed with what they would report;
//            --strict (or --assume PKG,…) turns them into real results.
//   skip     not applicable here (reason in detail)
// Checks for the headline defects of platform.md §0 are never gated: they must be red until fixed.
//
// Reports: /tmp/claude-0/qa/platform/<suite>.json (+ screenshots of failures under shots/<suite>/).
// Exit code: 1 when any check is red (fail/error), else 0.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, REPORT_DIR } from './server.mjs';

/** The headline issues the suite must show red on the unfixed tree (platform.md §11 WP-10 acceptance). */
export const HEADLINE = ['P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-07', 'P-11', 'P-12'];

export function parseArgs(argv = process.argv.slice(2)) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (!v.startsWith('--')) continue;
    const eq = v.indexOf('=');
    if (eq > 0) { a[v.slice(2, eq)] = v.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { a[v.slice(2)] = next; i++; } else a[v.slice(2)] = true;
  }
  const list = (x) => (x === undefined || x === true ? null : String(x).split(',').map((s) => s.trim()).filter(Boolean));
  return { ...a, only: list(a.only), vp: list(a.vp), assume: list(a.assume) || [], strict: !!a.strict, shots: !!a.shots };
}

const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return null; } };
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const isStub = (p) => { const s = read(p); return s === null || s.includes('STUB (W0 SKEL)'); };

/**
 * Has the package that delivers a feature landed? Static probes of the working tree (cheap, deterministic).
 * A gated check is only red once its package has landed (or with --strict / --assume).
 */
export function computeMarkers() {
  return {
    'PLAT-INPUT': !isStub('src/core/prompts.js') || exists('src/core/haptics.js') || exists('src/data/controls.js'),
    'PLAT-TOUCH': !isStub('src/core/touchpad.js'),
    'PLAT-CORE': /\buiK\b/.test(read('src/core/game.js') || ''),
    'PLAT-BOOT': !isStub('src/core/platform.js') || exists('src/boot-gate.js'),
    'PLAT-SAVE-ASSETS': /settingsVersion/.test(read('src/core/save.js') || ''),
    'PLAT-MENU': /shouldFollow/.test(read('src/scenes/menu/common.js') || ''),
    'PLAT-TURNTABLE': exists('tools/qa/turntable.mjs'),
    'DELIVERY-WEB': exists('tools/deploy/build_web.mjs') && exists('dist/web/index.html'),
    'CMP-SYS': !isStub('src/game/companions.js'),
    'AWAKEN-CORE': !isStub('src/game/awaken.js'),
  };
}

const ICON = { pass: 'ok  ', fail: 'FAIL', error: 'ERR ', pending: 'pend', skip: 'skip' };

export class Suite {
  constructor(name, args = parseArgs()) {
    this.name = name; this.args = args; this.t0 = Date.now();
    this.markers = computeMarkers();
    for (const k of args.assume) this.markers[k] = true;
    this.results = [];
    this.pageErrors = [];
    this.shotDir = path.join(REPORT_DIR, 'shots', name);
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    this.quiet = !!args.quiet;
  }
  /** Group filter from --only (no filter = every group). */
  wants(group) { return !this.args.only || this.args.only.includes(group); }
  /** Viewport filter from --vp. */
  vps(defaults) { return this.args.vp ? defaults.filter((v) => this.args.vp.includes(v)) : defaults; }
  landed(pkg) { return this.args.strict || !pkg || !!this.markers[pkg]; }

  /**
   * meta: { id, group, issue, pkg, gate, title, session? }  — gate = package key whose landing activates the check.
   * fn() → { pass, detail, metrics } | boolean. Thrown errors become status 'error'.
   */
  async check(meta, fn) {
    const t = Date.now();
    let r;
    try {
      r = await fn();
      if (typeof r === 'boolean') r = { pass: r };
      r = { status: r.skip ? 'skip' : r.pass ? 'pass' : 'fail', detail: r.detail ?? r.skip ?? '', metrics: r.metrics };
    } catch (e) {
      r = { status: 'error', detail: 'HARNESS ' + String(e?.message || e).split('\n')[0].slice(0, 300) };
    }
    const gated = meta.gate && !HEADLINE.includes(meta.issue) && !this.landed(meta.gate);
    const rec = {
      id: meta.id, group: meta.group, issue: meta.issue || null, pkg: meta.pkg || meta.gate || null, gate: meta.gate || null,
      title: meta.title || '', status: r.status, detail: r.detail, metrics: r.metrics, ms: Date.now() - t,
    };
    if ((r.status === 'fail' || r.status === 'error') && gated) { rec.status = 'pending'; rec.would = r.status; }
    if ((rec.status === 'fail' || rec.status === 'error') && meta.session) {
      fs.mkdirSync(this.shotDir, { recursive: true });
      rec.shot = path.join(this.shotDir, `${meta.id.replace(/[^\w.-]+/g, '_')}.png`);
      await meta.session.screenshot(rec.shot);
    }
    this.results.push(rec);
    if (!this.quiet) {
      const tag = [rec.issue, rec.pkg].filter(Boolean).join(' ');
      console.log(`${ICON[rec.status]} ${rec.id}${tag ? ` [${tag}]` : ''}${rec.status === 'pending' ? ` (would ${rec.would}; waits for ${rec.gate})` : ''} — ${String(rec.detail).slice(0, 400)}`);
    }
    return rec;
  }

  /** Records the page errors of a session as a check (every page and console error is a bug). */
  async errors(meta, session) {
    const errs = [...new Set(session.errs)];
    if (errs.length) this.pageErrors.push({ id: meta.id, errs });
    return this.check({ issue: null, ...meta }, async () => ({ pass: errs.length === 0, detail: errs.length ? `${errs.length} error(s): ${errs.slice(0, 3).join(' || ')}` : 'no page/console errors' }));
  }

  summary() {
    const by = (s) => this.results.filter((r) => r.status === s);
    const redIssues = [...new Set([...by('fail'), ...by('error')].map((r) => r.issue || '(no issue)'))].sort();
    const pendingBy = {};
    for (const r of by('pending')) (pendingBy[r.gate] ||= []).push(r.id);
    return {
      suite: this.name, when: new Date().toISOString(), durationMs: Date.now() - this.t0, argv: process.argv.slice(2),
      strict: this.args.strict, markers: this.markers,
      counts: { pass: by('pass').length, fail: by('fail').length, error: by('error').length, pending: by('pending').length, skip: by('skip').length },
      redIssues, pendingByPackage: pendingBy, checks: this.results, pageErrors: this.pageErrors,
    };
  }

  /** Writes the JSON report, prints the summary, returns the exit code. */
  async finish() {
    const s = this.summary();
    const file = path.join(REPORT_DIR, `${this.name}${this.args.tag ? '_' + this.args.tag : ''}.json`);
    fs.writeFileSync(file, JSON.stringify(s, null, 1));
    const c = s.counts;
    console.log(`\n${this.name}: ${c.pass} pass, ${c.fail} fail, ${c.error} error, ${c.pending} pending, ${c.skip} skip in ${(s.durationMs / 1000).toFixed(1)} s`);
    if (s.redIssues.length) console.log(`red issues: ${s.redIssues.join(', ')}`);
    const pend = Object.entries(s.pendingByPackage);
    if (pend.length) console.log(`pending (feature not landed): ${pend.map(([k, v]) => `${k} ×${v.length}`).join(', ')}`);
    console.log(`report: ${file}`);
    return c.fail + c.error > 0 ? 1 : 0;
  }
}

/** Small helpers for check bodies. */
export const fmt = (o) => JSON.stringify(o);
export const near = (a, b, tol) => Math.abs(a - b) <= tol;
