// File → owner mapping for W4 findings (MASTER_PLAN §5.3 fix buckets, master_plan.json package `owns` globs).
//
//   import { bucketOf, packageOf, ownerOf, groupFindings } from './lib/owners.mjs';
//   bucketOf('src/core/particles.js')   → 'FIX-ENGINE'      (the W4 bucket that fixes it; buckets partition every source file)
//   packageOf('src/core/particles.js')  → 'FEEL-REACT'      (the last W0–W3 package that owned it, for the report)
//   ownerOf(file) → { bucket, pkg }
//   groupFindings(list) → { [bucket]: [finding…] } for findings that carry `file` (or files[0])
//
// Glob syntax as in the plan: `**` any depth, `*` any characters inside one path segment, `?` one character, a leading
// `!` removes paths from the entry's earlier globs. Paths are repo-relative with forward slashes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let PLAN = null;
function plan() {
  if (PLAN) return PLAN;
  try { PLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/specs/master_plan.json'), 'utf8')); } catch { PLAN = { decisions: {}, waves: [] }; }
  return PLAN;
}

const RE_CACHE = new Map();
/** Glob → RegExp (anchored). Text after the first space (plan notes such as "src/core/ui.js (FONT, …)") is ignored. */
export function globRe(glob) {
  const g = String(glob).trim().split(/\s+/)[0];
  if (RE_CACHE.has(g)) return RE_CACHE.get(g);
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { re += g[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += g[i + 2] === '/' ? 2 : 1; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') { const j = g.indexOf('}', i); re += '(?:' + g.slice(i + 1, j).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|') + ')'; i = j; }
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  const r = new RegExp('^' + re + '$');
  RE_CACHE.set(g, r);
  return r;
}

/** Does the owns list (with ! excludes, in order) match the file? */
export function ownsMatch(owns, file) {
  let hit = false;
  for (const g0 of owns || []) {
    const neg = g0.startsWith('!');
    const g = neg ? g0.slice(1) : g0;
    if (globRe(g).test(file)) hit = !neg;
  }
  return hit;
}

export function buckets() { return plan().decisions?.qa_loop?.buckets || []; }

/** W4 fix bucket of a repo file (first matching bucket; FIX-TOOLS for tools/**, null when none matches). */
export function bucketOf(file) {
  const f = norm(file);
  for (const b of buckets()) if (ownsMatch(b.owns, f)) return b.key;
  return null;
}

/** The last package in wave order W0…W3 whose owns (or appends) covers the file; null when none. */
export function packageOf(file) {
  const f = norm(file);
  let last = null;
  for (const w of plan().waves || []) {
    if (!/^W[0-3]$/.test(w.id)) continue;
    for (const p of w.packages || []) if (ownsMatch(p.owns, f)) last = p.key;
  }
  if (!last) for (const e of plan().decisions?.external_packages || []) if (ownsMatch(e.owns, f)) last = e.key;
  return last;
}

export function ownerOf(file) { return { bucket: bucketOf(file), pkg: packageOf(file) }; }

/** { bucket: [finding…] } — a finding's file is f.file or f.files[0]; findings without a file go under '(harness)'. */
export function groupFindings(list) {
  const out = {};
  for (const f of list) {
    const file = f.file || f.files?.[0] || null;
    const k = f.bucket || (file ? bucketOf(file) : null) || '(harness)';
    (out[k] ||= []).push(f);
  }
  return out;
}

export function norm(file) {
  let f = String(file).replace(/\\/g, '/');
  if (f.startsWith(ROOT.replace(/\\/g, '/') + '/')) f = f.slice(ROOT.length + 1);
  return f.replace(/^\.\//, '').replace(/[?#].*$/, '');
}
export { ROOT };
