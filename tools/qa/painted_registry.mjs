// Painted-art registry and coverage audit — MASTER_PLAN §5.1 static row, R11, R15; ART_DECISION.md.
//
//   node tools/qa/painted_registry.mjs [--quiet] [--strict]
//
// Node only (no browser). Checks
//   reg.index                every src/render/painted/reg/*.js is imported by reg/index.js (else its registrations are dead)
//   reg.<file>               the reg module imports in Node and exports bosses/companions/npcs (objects of importers) and
//                            enemies (array of {mod, ids?})
//   mod.<kind>.<id>          each registered painted module imports in Node; boss/companion modules default-export
//                            {id (= registered id), kind, load, draw}; enemy modules export spec {id, src} + draw
//   assets.<kind>.<id>       the module's asset folder (const DIR = 'painted/…', enemy spec.src) holds the atlas and its
//                            manifest.json / rig.json; the JSON parses; atlas size in the JSON = the webp header; every part
//                            rect lies inside the atlas
//   cover.enemies            every ENEMIES id (91) draws: its render id has a vector renderer (ENEMY_RENDER) or is 'none';
//                            painted art listed (missing painted art = listed, not red: vector is the documented fallback)
//   cover.bosses             every BOSSES id (20) has a boss class (BOSS_CLASSES); painted art listed
//   cover.companions         every companion (20) has a vector drawer (mount template / MOUNT_DRAW_B / GUARDIAN_DRAW_A|B);
//                            painted art listed
//   cover.heroes / cover.npcs  every class (42) and NPC has a puppet manifest entry and its asset folder (rig.json + atlases)
//   orphans                  asset folders under assets/painted/** that no registration uses (dead weight in dist/web)
// A red result in a file whose package is still running (/tmp/claude-0/plan/state.json "running") is reported as pending.
// Report: /tmp/claude-0/qa/tools/painted_registry.json (+ .md). Exit 1 on any red (non-pending) check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Checks, writeReport, parseFlags } from './lib/report.mjs';
import { ownerOf, inFlight } from './lib/owners.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = parseFlags();
const C = new Checks(!!args.quiet);
const findings = [];
const RUNNING = inFlight();
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
const exists = (f) => fs.existsSync(path.join(ROOT, f));

/** Record a red result: pending when the owning package is still running. */
function red(id, title, file, detail = '', sev = 'S2') {
  const o = ownerOf(file);
  const pending = !!(o.pkg && RUNNING.has(o.pkg));
  findings.push({ id, sev, kind: 'painted', title, file, detail, ...o, ...(pending ? { pending: true } : {}) });
  C.add(id, pending ? 'warn' : 'fail', `${pending ? `[pending: ${o.pkg} still running] ` : ''}${title}${detail ? ' — ' + detail : ''}`);
}

// ── webp header size ──────────────────────────────────────────────────────────────────────────────────
function webpSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff) }; }
  return null;
}
/** Checks one asset folder (repo-relative, e.g. assets/painted/bosses/b_x). → problems[] */
function checkAssetDir(dir) {
  const probs = [];
  if (!exists(dir)) return [`missing folder ${dir}`];
  const files = fs.readdirSync(path.join(ROOT, dir));
  const jsonName = files.includes('manifest.json') ? 'manifest.json' : files.includes('rig.json') ? 'rig.json' : null;
  if (!jsonName) probs.push(`no manifest.json/rig.json in ${dir}`);
  const atlases = files.filter((f) => /^atlas.*\.webp$/.test(f));
  if (!atlases.length) probs.push(`no atlas*.webp in ${dir}`);
  if (!jsonName) return probs;
  let J;
  try { J = JSON.parse(fs.readFileSync(path.join(ROOT, dir, jsonName), 'utf8')); } catch (e) { probs.push(`${jsonName} does not parse: ${e.message}`); return probs; }
  // atlas file + declared size
  const a = J.atlas;
  const aFile = typeof a === 'string' ? a : a?.file ? (a.file.endsWith('.webp') ? a.file : a.file + '.webp') : atlases[0];
  if (aFile && !files.includes(aFile)) probs.push(`${jsonName} names atlas '${aFile}', not in ${dir}`);
  const aPath = path.join(ROOT, dir, aFile || '');
  const real = aFile && fs.existsSync(aPath) ? webpSize(aPath) : null;
  const decl = a && typeof a === 'object' && a.w ? { w: a.w, h: a.h } : Array.isArray(J.size) ? { w: J.size[0], h: J.size[1] } : null;
  if (real && decl && (Math.abs(real.w - decl.w) > 1 || Math.abs(real.h - decl.h) > 1)) probs.push(`atlas ${aFile} is ${real.w}×${real.h}, ${jsonName} says ${decl.w}×${decl.h}`);
  const W = real?.w ?? decl?.w, H = real?.h ?? decl?.h;
  // part rects inside the atlas: {x,y,w,h} or {rect:[x,y,w,h]} (nested variants included)
  if (W && H && J.parts && typeof J.parts === 'object') {
    const out = [];
    const visit = (name, p, depth = 0) => {
      if (!p || typeof p !== 'object' || depth > 3) return;
      const r = Array.isArray(p.rect) ? { x: p.rect[0], y: p.rect[1], w: p.rect[2], h: p.rect[3] } : (typeof p.x === 'number' && typeof p.w === 'number') ? p : null;
      if (r) { if (r.x < -0.5 || r.y < -0.5 || r.x + r.w > W + 0.5 || r.y + r.h > H + 0.5) out.push(name); return; }
      for (const [k, v] of Object.entries(p)) if (v && typeof v === 'object' && !Array.isArray(v)) visit(`${name}.${k}`, v, depth + 1);
    };
    for (const [n, p] of Object.entries(J.parts)) visit(n, p);
    if (out.length) probs.push(`${out.length} part rect(s) outside the ${W}×${H} atlas: ${out.slice(0, 5).join(', ')}`);
  }
  return probs;
}

const usedDirs = new Set();
const painted = { boss: new Set(), enemy: new Set(), companion: new Set(), npc: new Set() };

// ── 1. reg/*.js: all in index.js, import in Node, right shape ─────────────────────────────────────────
const REG_DIR = 'src/render/painted/reg';
const regFiles = fs.readdirSync(path.join(ROOT, REG_DIR)).filter((f) => f.endsWith('.js') && f !== 'index.js').sort();
const indexSrc = fs.readFileSync(path.join(ROOT, REG_DIR, 'index.js'), 'utf8');
const notIndexed = regFiles.filter((f) => !new RegExp(`from\\s*['"]\\./${f.replace('.', '\\.')}['"]`).test(indexSrc));
if (notIndexed.length) for (const f of notIndexed) red(`reg.index.${f}`, `${REG_DIR}/${f} is not imported by reg/index.js: its registrations never run`, `${REG_DIR}/${f}`, `add "import * as rN from './${f}';" and rN to REG_PACKAGES (reg/index.js, lead-managed)`);
else C.add('reg.index', 'pass', `all ${regFiles.length} reg modules are in reg/index.js`);

const importerPath = (fn, fromDir) => { const m = String(fn).match(/import\(\s*['"]([^'"]+)['"]\s*\)/); return m ? rel(path.resolve(path.join(ROOT, fromDir), m[1])) : null; };
const bossMods = [], cmpMods = [], npcMods = [], enemyMods = [];
for (const f of regFiles) {
  const file = `${REG_DIR}/${f}`;
  let m;
  try { m = await imp(file); } catch (e) { red(`reg.${f}`, `${file} does not import in Node`, file, String(e?.message || e).split('\n')[0]); continue; }
  const bad = [];
  for (const k of ['bosses', 'companions', 'npcs']) if (m[k] !== undefined && (typeof m[k] !== 'object' || Array.isArray(m[k]) || Object.values(m[k]).some((v) => typeof v !== 'function'))) bad.push(`${k} is not {id: () => import(…)}`);
  if (m.enemies !== undefined && !Array.isArray(m.enemies)) bad.push('enemies is not an array');
  const missing = ['bosses', 'enemies', 'companions', 'npcs'].filter((k) => m[k] === undefined);
  if (bad.length || missing.length) red(`reg.${f}`, `${file} has the wrong shape`, file, [...bad, missing.length ? `missing exports ${missing.join(',')}` : ''].filter(Boolean).join('; '));
  else C.add(`reg.${f}`, 'pass', `bosses ${Object.keys(m.bosses).length}, enemies ${m.enemies.length}, companions ${Object.keys(m.companions).length}, npcs ${Object.keys(m.npcs).length}`);
  const indexed = !notIndexed.includes(f);
  for (const [id, fn] of Object.entries(m.bosses || {})) bossMods.push({ id, file: importerPath(fn, REG_DIR), reg: file, fn, indexed });
  for (const [id, fn] of Object.entries(m.companions || {})) cmpMods.push({ id, file: importerPath(fn, REG_DIR), reg: file, fn, indexed });
  for (const [id, fn] of Object.entries(m.npcs || {})) npcMods.push({ id, file: importerPath(fn, REG_DIR), reg: file, fn, indexed });
  for (const e of m.enemies || []) enemyMods.push({ mod: e?.mod ?? e, ids: e?.ids, reg: file, indexed });
}
// the base registrations that live outside reg/ (registry.js: b_bonedragon; enemies/index.js: 5 reference enemies)
bossMods.push({ id: 'b_bonedragon', file: 'src/render/painted/bosses/b_bonedragon.js', reg: 'src/render/painted/registry.js', fn: () => imp('src/render/painted/bosses/b_bonedragon.js'), indexed: true });
for (const id of ['skeleton', 'armor_knight', 'gravedigger', 'bat', 'ghost']) {
  try { enemyMods.push({ mod: await imp(`src/render/painted/enemies/${id}.js`), reg: 'src/render/painted/enemies/index.js', indexed: true }); } catch (e) { red(`mod.enemy.${id}`, `reference enemy module does not import`, `src/render/painted/enemies/${id}.js`, String(e?.message || e).split('\n')[0]); }
}

// ── 2. boss / companion / npc modules and their assets ────────────────────────────────────────────────
async function checkLazy(kind, list) {
  let ok = 0;
  for (const r of list) {
    const file = r.file || `(unknown path in ${r.reg})`;
    if (!r.file || !exists(r.file)) { red(`mod.${kind}.${r.id}`, `registered ${kind} '${r.id}' points at a missing module`, r.reg, file); continue; }
    let m;
    try { m = await r.fn.call(null); } catch (e) {
      // the importer path is relative to reg/: import the resolved file directly (Node resolves relative to the caller)
      try { m = await imp(r.file); } catch (e2) { red(`mod.${kind}.${r.id}`, `${r.file} does not import in Node`, r.file, String(e2?.message || e2).split('\n')[0]); continue; }
    }
    const d = m?.default;
    const probs = [];
    if (!d || typeof d !== 'object') probs.push('no default export object');
    else {
      if (d.id !== r.id) probs.push(`default.id '${d.id}' ≠ registered id '${r.id}'`);
      for (const fn of ['load', 'draw']) if (typeof d[fn] !== 'function') probs.push(`default.${fn} is not a function`);
    }
    const src = fs.readFileSync(path.join(ROOT, r.file), 'utf8');
    const dirM = src.match(/const\s+DIR\s*=\s*['"]([^'"]+)['"]/) || src.match(/['"](painted\/(?:bosses|companions|npcs)\/[\w-]+)['"]/);
    // T1 puppets built with the enemy kit name their folder in spec.src, relative to assets/painted/enemies/
    const specDir = typeof m?.spec?.src === 'string' ? path.posix.normalize(`painted/enemies/${m.spec.src}`) : null;
    if (!dirM && !specDir) probs.push('no asset folder (const DIR = \'painted/…\' or spec.src)');
    else {
      const dir = `assets/${dirM ? dirM[1] : specDir}`;
      usedDirs.add(dir);
      probs.push(...checkAssetDir(dir));
    }
    if (probs.length) red(`mod.${kind}.${r.id}`, `painted ${kind} '${r.id}' is incomplete`, r.file, probs.join('; '));
    else { ok++; if (r.indexed) painted[kind].add(r.id); }
  }
  C.add(`mod.${kind}`, ok === list.length ? 'pass' : 'warn', `${ok}/${list.length} ${kind} module(s) import with a complete asset folder`);
}
await checkLazy('boss', bossMods);
await checkLazy('companion', cmpMods);
await checkLazy('npc', npcMods);

// ── 3. enemy modules (spec + rig folder) ─────────────────────────────────────────────────────────────
{
  let ok = 0;
  const seen = new Set();
  for (const e of enemyMods) {
    const spec = e.mod?.spec;
    const id = spec?.id ?? '(no spec)';
    const file = spec ? `src/render/painted/enemies/${spec.id}.js` : e.reg;
    const probs = [];
    if (!spec || typeof spec.id !== 'string' || typeof spec.src !== 'string') probs.push('no spec {id, src}');
    if (typeof e.mod?.draw !== 'function') probs.push('no draw export');
    if (spec?.src && !seen.has(spec.src)) { seen.add(spec.src); const dir = `assets/painted/enemies/${spec.src}`; usedDirs.add(dir); probs.push(...checkAssetDir(dir)); }
    else if (spec?.src) usedDirs.add(`assets/painted/enemies/${spec.src}`);
    if (probs.length) red(`mod.enemy.${id}`, `painted enemy '${id}' is incomplete`, exists(file) ? file : e.reg, probs.join('; '));
    else { ok++; if (e.indexed) for (const rid of e.ids ?? [spec.id]) painted.enemy.add(rid); }
  }
  C.add('mod.enemy', ok === enemyMods.length ? 'pass' : 'warn', `${ok}/${enemyMods.length} enemy module(s) with spec, draw and a complete rig folder (${painted.enemy.size} render ids)`);
}

// ── 4. coverage: every creature draws (vector fallback), painted art listed ──────────────────────────
const missingArt = { enemies: [], bosses: [], companions: [], heroes: [], npcs: [] };
{
  const { ENEMIES } = await imp('src/data/enemies.js');
  const R = await imp('src/render/enemies.js');
  // RENDER_C/D merge into ENEMY_RENDER lazily (circular import guard): build the full vector map ourselves
  const V = { ...(await imp('src/render/enemies_a.js')).RENDER_A, ...(await imp('src/render/enemies_b.js')).RENDER_B, ...(await imp('src/render/enemies_c.js')).RENDER_C, ...(await imp('src/render/enemies_d.js')).RENDER_D, ...R.ENEMY_RENDER };
  const noDraw = [];
  let n = 0, pc = 0;
  for (const [id, d] of Object.entries(ENEMIES)) {
    const r = d.render ?? id;
    if (r === 'none') continue;
    n++;
    const hasV = typeof V[r] === 'function';
    const hasP = painted.enemy.has(r);
    if (hasP) pc++; else missingArt.enemies.push(id);
    if (!hasV) noDraw.push(`${id}(${r})${hasP ? ' painted only' : ' NOTHING'}`);
  }
  if (noDraw.length) red('cover.enemies', `enemies without a vector fallback: ${noDraw.join(', ')}`, 'src/render/enemies.js', 'R11: every visual must render without its image', noDraw.some((x) => /NOTHING/.test(x)) ? 'S2' : 'S3');
  else C.add('cover.enemies', missingArt.enemies.length ? 'warn' : 'pass', `${n} drawn enemies all have a vector renderer; painted ${pc}/${n}${missingArt.enemies.length ? `; no painted art: ${missingArt.enemies.join(', ')}` : ''}`);
}
{
  const { BOSSES } = await imp('src/data/bosses.js');
  const { BOSS_CLASSES } = await imp('src/game/bosses/index.js');
  const noClass = Object.keys(BOSSES).filter((id) => typeof BOSS_CLASSES[id] !== 'function');
  for (const id of Object.keys(BOSSES)) if (!painted.boss.has(id)) missingArt.bosses.push(id);
  if (noClass.length) red('cover.bosses', `bosses without a boss class: ${noClass.join(', ')}`, 'src/game/bosses/index.js');
  else C.add('cover.bosses', missingArt.bosses.length ? 'warn' : 'pass', `${Object.keys(BOSSES).length} bosses have a class (vector draw); painted ${Object.keys(BOSSES).length - missingArt.bosses.length}/${Object.keys(BOSSES).length}${missingArt.bosses.length ? `; no painted art: ${missingArt.bosses.join(', ')}` : ''}`);
}
{
  const CD = await imp('src/data/companions.js');
  const RIG = await imp('src/render/mount_rig.js');
  await imp('src/render/mounts.js');
  const MB = await imp('src/render/mounts_b.js');
  const GA = await imp('src/render/guardians.js');
  let GB = {};
  try { GB = await imp('src/render/guardians_b.js'); } catch { GB = {}; }
  const noDraw = [];
  for (const id of CD.COMPANION_ORDER) {
    const def = CD.companionDef(id);
    const vec = CD.isMountId(id)
      ? (typeof MB.MOUNT_DRAW_B?.[id] === 'function' || !!RIG.TEMPLATES[def?.rig])
      : (typeof GA.GUARDIAN_DRAW_A?.[id] === 'function' || typeof GB.GUARDIAN_DRAW_B?.[id] === 'function');
    if (!vec) noDraw.push(id);
    if (!painted.companion.has(id)) missingArt.companions.push(id);
  }
  if (noDraw.length) {
    const mounts = noDraw.filter((id) => CD.isMountId(id)), guards = noDraw.filter((id) => !CD.isMountId(id));
    if (mounts.length) red('cover.mounts', `mounts without a vector drawer (no template for their rig, no MOUNT_DRAW_B): ${mounts.join(', ')}`, 'src/render/mounts_b.js', 'drawMount throws "no drawer for rig" for these ids');
    if (guards.length) red('cover.guardians', `guardians without a procedural drawer: ${guards.join(', ')}`, 'src/render/guardians_b.js');
  } else C.add('cover.companions', 'pass', `${CD.COMPANION_ORDER.length} companions have a vector drawer`);
  C.add('art.companions', missingArt.companions.length ? 'warn' : 'pass', `painted ${CD.COMPANION_ORDER.length - missingArt.companions.length}/${CD.COMPANION_ORDER.length}${missingArt.companions.length ? `; no painted art: ${missingArt.companions.join(', ')}` : ''}`);
}
{
  const { PUPPETS } = await imp('src/render/puppet_manifest.js');
  const { CLASSES } = await imp('src/data/classes.js');
  const { NPC_ORDER } = await imp('src/data/npcs.js');
  const probs = [];
  const checkPup = (char, cls) => {
    const man = PUPPETS[char]?.[cls];
    if (!man) { return `${cls}: no puppet manifest entry`; }
    const dir = `assets/puppets/${char}/${cls}`;
    if (!exists(dir)) return `${cls}: missing ${dir}`;
    const files = fs.readdirSync(path.join(ROOT, dir));
    const need = ['rig.json', ...(man.lv || ['hi']).map((l) => `atlas_${l}.webp`), ...(man.turn ? ['turn.webp'] : [])];
    const miss = need.filter((f) => !files.includes(f));
    return miss.length ? `${cls}: missing ${miss.join(', ')}` : null;
  };
  for (const [cls, d] of Object.entries(CLASSES)) { const p = checkPup(d.charId, cls); if (p) { probs.push(p); missingArt.heroes.push(cls); } }
  for (const id of NPC_ORDER) { const p = checkPup('npc', id); if (p) { probs.push(p); missingArt.npcs.push(id); } }
  if (probs.length) red('cover.heroes', `hero/NPC puppets incomplete: ${probs.join('; ')}`, 'src/render/puppet_manifest.js', '', 'S3');
  else C.add('cover.heroes', 'pass', `${Object.keys(CLASSES).length} classes and ${NPC_ORDER.length} NPCs have painted puppets (rig.json + atlases${''})`);
}

// ── 5. orphan asset folders ─────────────────────────────────────────────────────────────────────────
{
  const orphans = [];
  for (const kind of ['bosses', 'enemies', 'companions', 'npcs']) {
    const base = `assets/painted/${kind}`;
    if (!exists(base)) continue;
    for (const d of fs.readdirSync(path.join(ROOT, base), { withFileTypes: true })) if (d.isDirectory() && !usedDirs.has(`${base}/${d.name}`)) orphans.push(`${base}/${d.name}`);
  }
  C.add('orphans', orphans.length ? 'warn' : 'pass', orphans.length ? `asset folders no registration uses: ${orphans.join(', ')}` : 'every painted asset folder is used');
  for (const o of orphans) findings.push({ id: `orphan:${o}`, sev: 'S4', kind: 'painted', title: `asset folder not used by any registered module (dead weight in dist/web, or a missing registration)`, file: o, ...ownerOf(o), ...(RUNNING.has(ownerOf(o).pkg) ? { pending: true } : {}) });
}

const summary = {
  tool: 'painted_registry', when: new Date().toISOString(), running: [...RUNNING], counts: C.counts(),
  painted: Object.fromEntries(Object.entries(painted).map(([k, v]) => [k, [...v].sort()])), missingArt, checks: C.list, findings,
};
const md = `\n## Missing painted art (vector fallback in use)\n\n${Object.entries(missingArt).map(([k, v]) => `- **${k}** (${v.length}): ${v.join(', ') || '—'}`).join('\n')}\n`;
const out = writeReport('painted_registry', summary, { title: 'Painted registry and coverage', findings, extraMd: md });
const c = C.counts();
const hard = C.list.filter((x) => x.status === 'fail' || x.status === 'error').length;
console.log(`\npainted_registry: ${c.pass} pass, ${c.warn} warn (incl. pending), ${c.fail} fail — painted ${painted.boss.size} bosses, ${painted.enemy.size} enemy render ids, ${painted.companion.size} companions — ${out.json}`);
process.exit(hard || (args.strict && findings.some((f) => f.pending)) ? 1 : 0);
