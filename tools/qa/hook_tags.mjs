// Hook-tag survival (MASTER_PLAN R4) and draw-path hygiene scan (MASTER_PLAN §5.1 static row; R12; request #218).
//
//   node tools/qa/hook_tags.mjs [--strict] [--update] [--quiet]
//
// Checks
//   tags.w1        every file of the W1 baseline (/tmp/claude-0/plan/hook_baseline.json, written by GAME-HOOKS and
//                  WORLD-CAM; a copy is kept in tools/qa/hook_baseline_w1.json) still has ≥ its [hook:*] tag count  → red
//   tags.total     per tag kind, the repo-wide count is ≥ the ratchet snapshot (tools/qa/hook_tags_ratchet.json)   → red
//   tags.file      a file lost tags although the repo total per kind held (moved with the code?)                    → warn
//   tags.unknown   a [hook:x] tag outside TAGS (feel/awaken/gimmick/cmp/plat/p2/ach/ng/gal)                                     → warn
//   draw.fx        a particle/FX spawn (fx.emit/burst/ring/flash/slash/text/sprite/dmg/callout/ghost/addDecal…) inside
//                  a draw-path function (draw*, render*, paint*, *Draw): the spawn rate then follows the render rate
//                  (120 Hz, frame skips, hidden tabs), not the simulation                                             → red (S3)
//   draw.rng       Math.random or a core/math.js RNG helper (rand, randi, pick, chance, weightedPick) inside a draw path:
//                  rendering consumes gameplay RNG (BOSS_PIPELINE §8.5, request #218)                                 → warn (S4; red with --strict)
// --update rewrites the ratchet from the current tree (the lead or FIX-TOOLS runs it after an agreed tag removal).
// Report: /tmp/claude-0/qa/tools/hook_tags.json (+ .md), findings grouped by W4 fix bucket and last owning package.
// Exit 1 on any red check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskJs, functionRanges, lineIndex, chain, DRAW_NAME } from './lib/jsscan.mjs';
import { ownerOf } from './lib/owners.mjs';
import { writeReport, parseFlags } from './lib/report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = parseFlags();
const TAGS = ['feel', 'awaken', 'gimmick', 'cmp', 'plat', 'p2', 'ach', 'ng', 'gal'];
const W1_PLAN = '/tmp/claude-0/plan/hook_baseline.json';
const W1_COPY = path.join(HERE, 'hook_baseline_w1.json');
const RATCHET = path.join(HERE, 'hook_tags_ratchet.json');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.(m?js)$/.test(e.name)) out.push(f);
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const files = walk(path.join(ROOT, 'src')).map(rel).sort();

// ── tag counts ────────────────────────────────────────────────────────────────────────────────────────
const counts = {};   // file → { tag → n }
const unknown = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const re = /\[hook:([a-z0-9_-]+)\]/g;
  let r;
  while ((r = re.exec(src))) {
    const t = r[1];
    if (!TAGS.includes(t)) { unknown.push({ file: f, line: src.slice(0, r.index).split('\n').length, tag: t }); continue; }
    ((counts[f] ||= {})[t] = (counts[f][t] || 0) + 1);
  }
}
const fileTotal = (f) => Object.values(counts[f] || {}).reduce((a, b) => a + b, 0);
const tagTotal = (c, t) => Object.values(c).reduce((a, m) => a + (m[t] || 0), 0);

const checks = [];
const findings = [];
const check = (id, status, detail, extra = {}) => { checks.push({ id, status, detail, ...extra }); if (!args.quiet) console.log(`${status === 'pass' ? 'ok  ' : status === 'warn' ? 'warn' : 'FAIL'} ${id} — ${detail}`); };

// W1 baseline (keep a copy in tools/qa so the check survives a /tmp wipe)
let w1 = null;
try { w1 = JSON.parse(fs.readFileSync(W1_PLAN, 'utf8')); } catch { w1 = null; }
if (w1) { try { if (!fs.existsSync(W1_COPY) || fs.readFileSync(W1_COPY, 'utf8') !== JSON.stringify(w1, null, 1)) fs.writeFileSync(W1_COPY, JSON.stringify(w1, null, 1)); } catch { /* read-only */ } }
else { try { w1 = JSON.parse(fs.readFileSync(W1_COPY, 'utf8')); } catch { w1 = null; } }
if (!w1) check('tags.w1', 'fail', `no W1 baseline (${W1_PLAN} or ${rel(W1_COPY)})`);
else {
  const lost = Object.entries(w1).filter(([f, n]) => fileTotal(f) < n).map(([f, n]) => ({ file: f, baseline: n, now: fileTotal(f) }));
  for (const l of lost) findings.push({ id: `tags.w1:${l.file}`, sev: 'S2', kind: 'hook-tags', file: l.file, title: `[hook:*] tags lost: ${l.now} < W1 baseline ${l.baseline}`, ...ownerOf(l.file) });
  check('tags.w1', lost.length ? 'fail' : 'pass', lost.length ? lost.map((l) => `${l.file} ${l.now} < ${l.baseline}`).join('; ') : Object.entries(w1).map(([f, n]) => `${path.basename(f)} ${fileTotal(f)}≥${n}`).join(', '));
}

// ratchet over every file
let ratchet = null;
try { ratchet = JSON.parse(fs.readFileSync(RATCHET, 'utf8')); } catch { ratchet = null; }
if (args.update || !ratchet) {
  fs.writeFileSync(RATCHET, JSON.stringify({ when: new Date().toISOString(), note: 'per-file [hook:*] counts; node tools/qa/hook_tags.mjs --update rewrites it', counts }, null, 1) + '\n');
  check('tags.total', 'pass', `${args.update ? 'ratchet updated' : 'ratchet created'}: ${rel(RATCHET)} (${Object.keys(counts).length} files, ${TAGS.map((t) => `${t} ${tagTotal(counts, t)}`).join(', ')})`);
} else {
  const base = ratchet.counts || {};
  const dropped = TAGS.filter((t) => tagTotal(counts, t) < tagTotal(base, t));
  for (const t of dropped) {
    const who = Object.keys(base).filter((f) => (counts[f]?.[t] || 0) < base[f][t] && base[f][t]);
    findings.push({ id: `tags.total:${t}`, sev: 'S2', kind: 'hook-tags', file: who[0] || null, files: who, title: `[hook:${t}] total ${tagTotal(counts, t)} < ratchet ${tagTotal(base, t)} (lost in ${who.join(', ')})`, ...ownerOf(who[0] || 'src/game/world.js') });
  }
  check('tags.total', dropped.length ? 'fail' : 'pass', dropped.length ? dropped.map((t) => `${t} ${tagTotal(counts, t)} < ${tagTotal(base, t)}`).join('; ') : TAGS.map((t) => `${t} ${tagTotal(counts, t)}≥${tagTotal(base, t)}`).join(', '));
  const moved = [];
  for (const [f, m] of Object.entries(base)) for (const [t, n] of Object.entries(m)) if ((counts[f]?.[t] || 0) < n && !dropped.includes(t)) moved.push(`${f} ${t} ${counts[f]?.[t] || 0}<${n}`);
  check('tags.file', moved.length ? 'warn' : 'pass', moved.length ? `per-file decrease with stable totals (moved?): ${moved.join('; ')}` : 'no file lost tags');
}
const unk = {};
for (const u of unknown) { const k = `[hook:${u.tag}] ${u.file}`; unk[k] = (unk[k] || 0) + 1; }
check('tags.unknown', unknown.length ? 'warn' : 'pass', unknown.length ? `package-local tags outside R4's set (not counted): ${Object.entries(unk).map(([k, n]) => `${k} ×${n}`).join('; ')}` : 'all tags are feel/awaken/gimmick/cmp/plat/p2');

// ── draw-path scan ────────────────────────────────────────────────────────────────────────────────────
const RNG_HELPERS = ['rand', 'randi', 'pick', 'chance', 'weightedPick'];
const FX_METHODS = 'emit|burst|ring|ering|flash|slash|text|sprite|speedLine|dmg|callout|ghost|addDecal|spawnDmg|materialBurst';
const FX_RE = new RegExp(`(^|[^\\w$.])((?:[\\w$]+\\??\\.)*fx)\\??\\.(${FX_METHODS})\\s*\\(`, 'g');
const drawFx = [], drawRng = [];
// Reviewed exceptions (file + draw function + reason). Keep this list short; every entry needs a reason.
const ALLOW_FX = [
  { file: 'src/scenes/town/common.js', fn: 'render', reason: 'one-shot reveal burst guarded by this.burstDone on a scene-local Particles; not per-frame' },
];
const allowedFx = (f, fn) => ALLOW_FX.some((a) => a.file === f && (fn === a.fn || fn.startsWith(a.fn + ' ')));
const seenLine = new Set();
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const m = maskJs(src);
  const fns = functionRanges(m);
  const draws = fns.filter((x) => DRAW_NAME.test(x.name));
  if (!draws.length) continue;
  const L = lineIndex(src);
  // RNG helper names imported from core/math.js (named imports, possibly renamed) and namespace imports
  const helpers = new Set();
  const ns = new Set();
  for (const im of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*\/math\.js['"]/g)) {
    for (const part of im[1].split(',')) { const [a, b] = part.trim().split(/\s+as\s+/); if (RNG_HELPERS.includes(a)) helpers.add(b || a); }
  }
  for (const im of src.matchAll(/import\s*\*\s*as\s*([\w$]+)\s*from\s*['"][^'"]*\/math\.js['"]/g)) ns.add(im[1]);
  const rngRe = new RegExp(`(?:\\bMath\\.random\\s*\\(${helpers.size ? `|(?<![\\w$.])(?:${[...helpers].join('|')})\\s*\\(` : ''}${ns.size ? `|\\b(?:${[...ns].join('|')})\\.(?:${RNG_HELPERS.join('|')})\\s*\\(` : ''})`, 'g');
  const inDraw = (off) => { const c = chain(fns, off); const d = c.find((x) => DRAW_NAME.test(x.name)); return d ? { draw: d, inner: c[c.length - 1] } : null; };
  let r;
  while ((r = rngRe.exec(m))) {
    const w = inDraw(r.index);
    if (!w) continue;
    const line = L.line(r.index);
    if (seenLine.has(`rng:${f}:${line}`)) continue;
    seenLine.add(`rng:${f}:${line}`);
    drawRng.push({ file: f, line, fn: w.inner.name === w.draw.name ? w.draw.name : `${w.draw.name} › ${w.inner.name}`, code: L.text(line).trim().slice(0, 160) });
  }
  FX_RE.lastIndex = 0;
  while ((r = FX_RE.exec(m))) {
    const off = r.index + r[1].length;
    const w = inDraw(off);
    if (!w) continue;
    // the particle system's own draw() calls its internal helpers on `this`, never `fx.`; a local drawing kit named
    // `fx` that only paints (ultfx sprites) is filtered by the method list above
    const line = L.line(off);
    const fnName = w.inner.name === w.draw.name ? w.draw.name : `${w.draw.name} › ${w.inner.name}`;
    if (allowedFx(f, fnName) || seenLine.has(`fx:${f}:${line}`)) continue;
    seenLine.add(`fx:${f}:${line}`);
    drawFx.push({ file: f, line, fn: w.inner.name === w.draw.name ? w.draw.name : `${w.draw.name} › ${w.inner.name}`, call: `${r[2]}.${r[3]}`, code: L.text(line).trim().slice(0, 160) });
  }
}
for (const x of drawFx) findings.push({ id: `draw.fx:${x.file}:${x.line}`, sev: 'S3', kind: 'draw-fx', file: x.file, line: x.line, title: `${x.call}() inside ${x.fn}() — spawns per rendered frame`, code: x.code, ...ownerOf(x.file) });
for (const x of drawRng) findings.push({ id: `draw.rng:${x.file}:${x.line}`, sev: 'S4', kind: 'draw-rng', file: x.file, line: x.line, title: `RNG in ${x.fn}() — rendering consumes gameplay Math.random`, code: x.code, ...ownerOf(x.file) });
check('draw.fx', drawFx.length ? 'fail' : 'pass', drawFx.length ? `${drawFx.length} FX spawn(s) inside draw paths: ${drawFx.slice(0, 6).map((x) => `${x.file}:${x.line} ${x.call} in ${x.fn}`).join('; ')}${drawFx.length > 6 ? ' …' : ''}` : 'no FX spawns inside draw paths');
const rngFiles = [...new Set(drawRng.map((x) => x.file))];
check('draw.rng', drawRng.length ? (args.strict ? 'fail' : 'warn') : 'pass', drawRng.length ? `${drawRng.length} RNG call(s) in draw paths across ${rngFiles.length} file(s): ${rngFiles.slice(0, 8).join(', ')}${rngFiles.length > 8 ? ' …' : ''}` : 'no RNG in draw paths');

const red = checks.filter((c) => c.status === 'fail');
const summary = {
  tool: 'hook_tags', when: new Date().toISOString(), strict: !!args.strict,
  counts: { files: Object.keys(counts).length, perTag: Object.fromEntries(TAGS.map((t) => [t, tagTotal(counts, t)])) },
  checks, findings, drawFx, drawRng, tagCounts: counts,
};
const out = writeReport('hook_tags', summary, { title: 'Hook tags and draw-path scan', findings });
console.log(`\nhook_tags: ${checks.filter((c) => c.status === 'pass').length} pass, ${checks.filter((c) => c.status === 'warn').length} warn, ${red.length} fail · ${findings.length} finding(s) (${drawFx.length} draw.fx, ${drawRng.length} draw.rng) — ${out.json}`);
process.exit(red.length ? 1 : 0);
