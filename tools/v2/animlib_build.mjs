// v2 animlib: 산 클립들을 게임이 싣는 공용 클립 묶음으로 만든다. docs/v2/ANIM_LIBRARY.md
//   node tools/v2/animlib_build.mjs [--out=assets/v2/char3d/clips] [--only=이름,이름] [--report=파일.json] [--quiet] [--spec=다른 목록.mjs]
// 읽는 것: tools/v2/animlib_spec.mjs (목록 · 가공 지시), 원본 GLB (저장소 밖 RAW_DIR / OWN_DIR), 기준 뼈대 assets/v2/char3d/kael.glb
// 쓰는 것: <out>/<묶음>.glb (뼈대 + 스킨 + 애니메이션, 메시 없음) 와 <out>/index.json (클립마다 길이 · 순환 · 이벤트 · 권장 배속 · 뺀 이동)
// 묶음 GLB 는 런타임 그대로(glb.js loadGLB → skel.js clipFromAnim) 읽힌다. 뷰어의 ?clips= 로도 열린다(그쪽은 이름 규칙에 맞는 세 개만 고른다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGLB } from './char3d_glbio.mjs';
import * as C from './animlib_core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const { CLIPS, GROUPS, RAW_DIR, OWN_DIR } = await import(opt.spec ? path.resolve(opt.spec) : './animlib_spec.mjs');   // --spec=다른 목록 (살펴보기용)
const OUT = path.resolve(root, opt.out ?? 'assets/v2/char3d/clips');
const only = opt.only ? new Set(opt.only.split(',')) : null;
const REF = C.loadRig(path.join(root, 'assets/v2/char3d/kael.glb'));
const ref = REF.rig, HIP = ref.restHipY;   // 기준 캐릭터의 골반 높이(m) — 이동 거리를 m 로 적을 때 쓴다
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const cache = new Map();
const frames = (c) => { const f = path.join(c.own ? OWN_DIR : RAW_DIR, c.src + '.glb'); if (!cache.has(f)) cache.set(f, fs.existsSync(f) ? C.rawFrames(f) : null); return cache.get(f); };

function events(F, c, J) {
  const ev = [], n = F.n, dt = F.dt, kind = c.kind ?? 'story', out = {};
  const vR = C.speedOf(J.tipR, n, dt), vL = C.speedOf(J.tipL, n, dt), v = new Float32Array(n);
  for (let k = 0; k < n; k++) v[k] = kind === 'cast' || c.hand === 'both' ? Math.max(vR[k], vL[k]) : c.hand === 'L' ? vL[k] : vR[k];
  if (c.man) { ev.push([r2(Math.max(0, c.man.strike[0] - 0.03)), 'swing'], [c.man.hit, 'hit']); out.strike = c.man.strike; out.tHit = c.man.hit; }
  else if (kind === 'attack' || kind === 'cast') {
    const mx = Math.max(...v), pk = C.peaks(v, mx * 0.5, 5).sort((a, b) => v[b] - v[a]).slice(0, c.hits ?? 1).sort((a, b) => a - b);
    pk.forEach((k, i) => {
      let a = k, b = k; while (a > 0 && v[a - 1] > v[k] * 0.45) a--; while (b < n - 1 && v[b + 1] > v[k] * 0.45) b++;
      if (kind === 'attack') { ev.push([r2(Math.max(0, a * dt - 0.03)), 'swing']); ev.push([r2(k * dt), 'hit']); if (i === pk.length - 1) out.strike = [r2(a * dt), r2(b * dt)]; }
      else ev.push([r2(k * dt), i === pk.length - 1 ? 'release' : 'charge']);
    });
    out.tHit = pk.length ? pk[0] * dt : null;
  }
  if (kind === 'react') {   // 몸이 바닥에 닿는 순간
    let mn = 1e9; for (let k = 0; k < n; k++) mn = Math.min(mn, J.hips[k * 3 + 1]);
    if (mn < HIP * 0.5 && J.hips[1] > HIP * 0.7) for (let k = 1; k < n; k++) if (J.hips[k * 3 + 1] < mn + 0.06) { ev.push([r2(k * dt), 'body']); break; }
  }
  if (kind === 'loco' || kind === 'attack' || kind === 'react') for (const s of ['L', 'R']) {
    const h = new Float32Array(n); let mn = 1e9, mx = -1e9;
    for (let k = 0; k < n; k++) { h[k] = Math.min(J['foot' + s][k * 3 + 1] - 0.07, J['toe' + s][k * 3 + 1]); mn = Math.min(mn, h[k]); mx = Math.max(mx, h[k]); }
    const R = mx - mn; if (R < 0.035) continue;
    let down = c.loop ? h[n - 1] < mn + R * 0.4 : h[0] < mn + R * 0.4;
    for (let k = 1; k < n; k++) { if (!down && h[k] < mn + R * 0.3 && h[k] < mn + 0.06) { down = true; ev.push([r2(k * dt), 'foot' + s]); } else if (down && h[k] > mn + R * 0.55) down = false; }
  }
  for (const e of c.ev ?? []) ev.push([e[0], e[1]]);
  ev.sort((a, b) => a[0] - b[0]);
  return { ev, ...out };
}

function process1(c) {
  const F0 = frames(c); if (!F0) return null;
  const dt = F0.dt; let a, b, loopCost = null;
  if (Array.isArray(c.cut)) { a = Math.round(c.cut[0] / dt); b = Math.round(c.cut[1] / dt); }
  else if (c.cut?.loop) { [a, b, loopCost] = C.findLoop(F0, c.cut.loop[0], c.cut.loop[1], Math.round((c.cut.from ?? 0) / dt), Math.round((c.cut.to ?? 1e9) / dt) > F0.n - 1 ? F0.n - 1 : Math.round(c.cut.to / dt)); }
  else if (c.loop) { a = 0; b = F0.n - 1; }
  else [a, b] = C.autoTrim(F0);
  const F = C.slice(F0, a, b, !!c.rev);
  const info = C.fixRoot(F, c.xz ?? 'auto', c.y === 'clamp' ? 'keep' : c.y ?? 'keep');
  if (c.y === 'clamp') for (let k = 0; k < F.n; k++) F.root[k * 3 + 1] = Math.min(F.root[k * 3 + 1], 0.02);
  const loopErr = c.loop ? C.closeLoop(F, Math.min(6, Math.floor(F.n / 4))) : null;
  const J = C.fk(F, ref), E = events(F, c, J);
  const G = C.resample(F, c.fps ?? 30), L = C.toLocal(G, ref);
  const dur = (F.n - 1) * dt;
  let speed = c.speed;
  if (speed == null) speed = c.loop ? 1 : c.kind === 'attack' ? Math.max(1, Math.min(1.6, Math.round((E.tHit ?? 0.3) / 0.3 / 0.05) * 0.05)) : c.kind === 'react' ? 1.2 : c.kind === 'cast' ? 1.15 : 1;
  const tr = [info.travel[0] * HIP, info.travel[1] * HIP], far = Math.hypot(tr[0], tr[1]) > 0.08 && (c.xz ?? 'auto') !== 'keep';
  const meta = {
    n: c.n, g: c.g, id: c.id, src: F0.srcName, loop: !!c.loop, dur: r3(dur), keys: G.n, fps: Math.round((G.n - 1) / dur), speed: r2(speed), ev: E.ev,
    ...(E.strike ? { strike: E.strike } : {}), ...(far ? { travel: [r2(tr[0]), r2(tr[1])], ...(c.loop ? {} : { moveT: [r2(info.moveT[0]), r2(info.moveT[1])] }) } : {}),
    cut: [r2(a * dt), r2(b * dt)], ...(c.rev ? { rev: true } : {}), root: `${c.xz ?? 'auto'}/${c.y ?? 'keep'}`, use: c.use,
  };
  return { c, L, meta, loopErr, loopCost, tracks: L.tracks.length };
}

// ── 묶음 GLB 쓰기 ──
function writeGroup(g, items) {
  const chunks = []; let size = 0; const views = [], accessors = [], animations = [];
  const push = (bytes) => { const pad = (4 - (size % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); size += pad; } const off = size; chunks.push(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)); size += bytes.byteLength; return off; };
  for (const it of items) {
    const { L, meta } = it, n = L.times.length, start = size + ((4 - (size % 4)) % 4);
    push(L.times); push(L.root.v); for (const t of L.tracks) push(t.q);
    const bv = views.length; views.push({ buffer: 0, byteOffset: start, byteLength: size - start });
    const aT = accessors.length; accessors.push({ bufferView: bv, byteOffset: 0, componentType: 5126, count: n, type: 'SCALAR', min: [0], max: [L.times[n - 1]] });
    const samplers = [], channels = [];
    accessors.push({ bufferView: bv, byteOffset: n * 4, componentType: 5126, count: n, type: 'VEC3' });
    samplers.push({ input: aT, output: accessors.length - 1 }); channels.push({ sampler: 0, target: { node: L.root.node, path: 'translation' } });
    L.tracks.forEach((t, i) => { accessors.push({ bufferView: bv, byteOffset: n * 16 + i * n * 8, componentType: 5122, normalized: true, count: n, type: 'VEC4' }); samplers.push({ input: aT, output: accessors.length - 1 }); channels.push({ sampler: samplers.length - 1, target: { node: t.node, path: 'rotation' } }); });
    animations.push({ name: meta.n, samplers, channels });
    it.bytes = size - start;
  }
  const J = REF.g.json;
  const nodes = J.nodes.map((nd) => { const o = { name: nd.name }; for (const k of ['children', 'translation', 'rotation', 'scale', 'matrix']) if (nd[k]) o[k] = nd[k]; return o; });
  const json = { asset: { version: '2.0', generator: 'bloodmoon tools/v2/animlib_build.mjs' }, scene: 0, scenes: [{ nodes: J.scenes[J.scene ?? 0].nodes }], nodes, skins: [{ joints: J.skins[0].joints }], animations, accessors, bufferViews: views };
  const bin = new Uint8Array(size); { let o = 0; for (const ch of chunks) { bin.set(ch, o); o += ch.byteLength; } }
  return writeGLB(path.join(OUT, g + '.glb'), json, bin);
}

fs.mkdirSync(OUT, { recursive: true });
const done = [], missing = [];
for (const c of CLIPS) { if (only && !only.has(c.n)) continue; const r = process1(c); if (r) done.push(r); else missing.push(c.n + ' ← ' + c.src); }
const index = { v: 1, generator: 'tools/v2/animlib_build.mjs', note: '시각은 초(1배속 기준). travel = 뺀 수평 이동 [x(왼쪽+), z(앞+)] m, 키 1.8 m 기준 — 다른 키에는 키/1.8 을 곱한다. ev = [초, 이름]. speed = 권장 재생 배속.', height: 1.8, hip: r3(HIP), groups: [], clips: [] };
let total = 0;
for (const g of GROUPS) {
  const items = done.filter((d) => d.c.g === g); if (!items.length) continue;
  const bytes = writeGroup(g, items); total += bytes;
  index.groups.push({ g, file: g + '.glb', bytes, clips: items.length });
  for (const it of items) index.clips.push(it.meta);
}
if (!only) {
  const js = JSON.stringify(index).replace(/\{"n":/g, '\n{"n":').replace(/\],"clips":\[/, '],\n"clips":[');
  fs.writeFileSync(path.join(OUT, 'index.json'), js + '\n'); total += Buffer.byteLength(js) + 1;
}
if (opt.report) fs.writeFileSync(opt.report, JSON.stringify(done.map((d) => ({ ...d.meta, tracks: d.tracks, bytes: d.bytes, loopErr: d.loopErr, loopCost: d.loopCost, why: d.c.why, rej: d.c.rej })), null, 1));
if (!opt.quiet) for (const d of done) { const m = d.meta; console.log(`${m.g.padEnd(10)} ${m.n.padEnd(17)} ${String(m.id).padStart(3)} ${m.src.padEnd(34)} ${m.loop ? 'loop' : 'once'} ${m.dur.toFixed(2)}s ${String(m.keys).padStart(3)}k ${String(d.tracks).padStart(2)}tr ${(d.bytes / 1024).toFixed(1).padStart(5)}KB x${m.speed} cut ${m.cut.join('-')}${d.loopErr != null ? ' loopErr ' + d.loopErr.toFixed(4) : ''}${m.travel ? ' travel ' + m.travel.join(',') : ''} ev ${m.ev.map((e) => e[1] + '@' + e[0]).join(' ')}`); }
console.log(`묶음 ${index.groups.map((g) => `${g.g} ${g.clips}개 ${(g.bytes / 1024).toFixed(0)}KB`).join(' · ')} · 합계 ${(total / 1024).toFixed(0)} KB (${total} B) · 클립 ${done.length}`);
if (missing.length) console.log('원본이 없어 건너뜀: ' + missing.join(', '));
