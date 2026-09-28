// Report helpers for the QA-TOOLS scripts (tools/qa/*.mjs other than the platform suites).
//
//   const args = parseFlags();                                   // --a b, --a=b, --flag → { a: 'b', flag: true, _: [...] }
//   writeReport('perf_budget', summary, { title, findings, extraMd })  → { json, md }
//     /tmp/claude-0/qa/tools/<name>.json and <name>.md; findings are grouped by W4 bucket (lib/owners.mjs)
//   finding shape: { id, sev: 'S1'|'S2'|'S3'|'S4', kind, title, file?, files?, line?, bucket?, pkg?, repro?, detail? }
import fs from 'node:fs';
import path from 'node:path';
import { groupFindings } from './owners.mjs';

export const QA_DIR = '/tmp/claude-0/qa';
export const TOOLS_DIR = path.join(QA_DIR, 'tools');

export function parseFlags(argv = process.argv.slice(2)) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (!v.startsWith('--')) { a._.push(v); continue; }
    const eq = v.indexOf('=');
    if (eq > 0) { a[v.slice(2, eq)] = v.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { a[v.slice(2)] = next; i++; } else a[v.slice(2)] = true;
  }
  return a;
}
export const list = (x, dflt = null) => (x === undefined || x === true || x === null ? dflt : String(x).split(',').map((s) => s.trim()).filter(Boolean));

const SEV_ORDER = { S1: 0, S2: 1, S3: 2, S4: 3 };

/** Markdown table of findings grouped by bucket. */
export function findingsMd(findings) {
  if (!findings?.length) return '_No findings._\n';
  const g = groupFindings(findings);
  let md = '';
  for (const [bucket, fs_] of Object.entries(g).sort()) {
    md += `\n### ${bucket} (${fs_.length})\n\n| sev | id | owner pkg | where | finding |\n|---|---|---|---|---|\n`;
    for (const f of fs_.slice().sort((a, b) => (SEV_ORDER[a.sev] ?? 9) - (SEV_ORDER[b.sev] ?? 9))) {
      const where = f.file ? `${f.file}${f.line ? ':' + f.line : ''}` : (f.repro || '');
      md += `| ${f.sev || ''} | ${esc(f.id)} | ${f.pkg || ''} | ${esc(where)} | ${esc(f.title || '')}${f.detail ? ' — ' + esc(String(f.detail).slice(0, 240)) : ''} |\n`;
    }
  }
  return md;
}
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function writeReport(name, summary, { title = name, findings = summary.findings || [], extraMd = '' } = {}) {
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  const json = path.join(TOOLS_DIR, `${name}.json`);
  fs.writeFileSync(json, JSON.stringify(summary, null, 1));
  const checks = summary.checks || [];
  let md = `# ${title}\n\n${summary.when || new Date().toISOString()}\n\n`;
  if (checks.length) {
    md += `| status | check | detail |\n|---|---|---|\n`;
    for (const c of checks) md += `| ${c.status} | ${esc(c.id)} | ${esc(String(c.detail || '').slice(0, 300))} |\n`;
  }
  md += `\n## Findings by W4 bucket\n${findingsMd(findings)}\n${extraMd}`;
  const mdf = path.join(TOOLS_DIR, `${name}.md`);
  fs.writeFileSync(mdf, md);
  return { json, md: mdf };
}

/** Simple check recorder shared by the Node-side tools. */
export class Checks {
  constructor(quiet = false) { this.list = []; this.quiet = quiet; }
  add(id, status, detail = '', extra = {}) {
    const c = { id, status, detail, ...extra };
    this.list.push(c);
    if (!this.quiet) console.log(`${{ pass: 'ok  ', warn: 'warn', fail: 'FAIL', error: 'ERR ', skip: 'skip' }[status] || status} ${id} — ${String(detail).slice(0, 400)}`);
    return c;
  }
  get red() { return this.list.filter((c) => c.status === 'fail' || c.status === 'error'); }
  counts() { const n = (s) => this.list.filter((c) => c.status === s).length; return { pass: n('pass'), warn: n('warn'), fail: n('fail'), error: n('error'), skip: n('skip') }; }
}
