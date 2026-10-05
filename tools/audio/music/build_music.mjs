#!/usr/bin/env node
// 배경음악 오프라인 렌더 파이프라인 — 게임 악보(data/music.js) → 표준 MIDI → FluidSynth(FluidR3_GM) → AAC(.m4a) + index.json
// 사용: node tools/audio/music/build_music.mjs [--only title,s01] [--check] [--jobs 4] [--spectro title,s01] [--no-render]
//   --check      다시 렌더하지 않고 index.json ↔ 파일, 루프 지점, 음량, 용량 예산을 검증
//   --spectro    지정 곡의 스펙트로그램 PNG 를 빌드 폴더(spec/)에 만든다 (기본: 대표 6곡)
//   --no-render  MIDI/스펙만 만든다
// 중간 산출물(MIDI, WAV, 스펙): $AUDIO_BUILD_DIR (기본 /tmp/claude-0/audio_build) — 저장소 밖
// 자세한 설명·QA 표: tools/audio/music/README.md
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TRACKS } from '../../../src/data/music.js';
import { compileTrack, INST } from '../../../src/core/audio.js';
import { writeSMF, meta } from './smf.mjs';
import { pick, pickKit, GM_NAME, KIT_NAME, CHORUS, LANE_KEY, LANE_VEL, OVERRIDE } from './gm.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(ROOT, 'assets/audio/music');
const BUILD = process.env.AUDIO_BUILD_DIR || '/tmp/claude-0/audio_build';
const CALIB = JSON.parse(fs.readFileSync(path.join(HERE, 'gm_calib.json'), 'utf8'));

const PPQ = 1920, RATE = 44100;
const LUFS = -16, LUFS_JINGLE = -15, TP_MAX = -1.0, BUDGET_MB = 30;
const REV_CC = 140;           // MIDI 내보내기용 CC91 = rev × 140 (렌더는 rev 값으로 컨볼루션 잔향 송신을 직접 만든다)
const JINGLES = new Set(['victory', 'gameover']);
// 비트레이트 (kbps) — 조용하고 단순한 곡은 낮춰 용량 예산(30 MB)을 지킨다
const KBPS = { default: 96, prologue: 80, story: 80, sad: 80, church: 80, inn: 80, gameover: 80, worldmap2: 80, hub: 88, shop: 88, minigame: 88, credits: 88, ending: 88, s02: 88, s06: 88, s10: 88, s14: 88, s18: 88 };
const SPECTRO = ['title', 's01', 's14', 'boss', 'dracula', 'nihil'];

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ONLY = opt('--only') ? opt('--only').split(',').map((s) => s.trim()).filter(Boolean) : null;
const CHECK = args.includes('--check'), NORENDER = args.includes('--no-render');
const JOBS = +(opt('--jobs') || Math.max(1, os.cpus().length));
const SPEC_IDS = opt('--spectro') ? opt('--spectro').split(',') : SPECTRO;

// ── 결정적 해시 (세기 인간미: 패스마다 같아야 루프 이음매가 맞는다) ──
function hash01(...k) { let h = 2166136261; for (const c of k.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const median = (a) => { if (!a.length) return 60; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// ── 곡 → 파트(MIDI 채널) 목록 ──
export function buildTrack(id) {
  const def = TRACKS[id], comp = compileTrack(def, id);
  // 섹션 타임라인 (도입 + 반복 순서 1회)
  const tl = []; let beat = 0;
  comp.seq.forEach((name, i) => { const s = comp.secs[name]; tl.push({ name, i, beat, beats: s.beats, bpm: s.bpm, bpb: def.sec[name].sig ?? comp.bpb, ev: s.ev }); beat += s.beats; });
  const introBeats = tl.slice(0, comp.loopAt).reduce((a, s) => a + s.beats, 0);
  const sec = (b0, b1) => tl.reduce((a, s) => a + Math.max(0, Math.min(b1, s.beat + s.beats) - Math.max(b0, s.beat)) * 60 / s.bpm, 0);
  const ideal = { intro: sec(0, introBeats), body: sec(introBeats, beat) };
  // 채널별 이벤트 수집
  const byCh = comp.chans.map(() => []);
  const compiledCount = comp.chans.map(() => 0);
  for (const s of tl) {
    const minD = 0.03 * s.bpm / 60; let idx = 0;
    for (const e of s.ev) {
      if (e.c < 0 || !byCh[e.c]) continue;
      compiledCount[e.c]++;
      byCh[e.c].push({ tick: Math.round((s.beat + e.t) * PPQ), dur: Math.max(1, Math.round(Math.max(e.d, minD) * PPQ)), m: e.m, v: e.v, hum: hash01(id, s.name, s.i, e.c, idx++) });
    }
  }
  const hasGtr = comp.chans.some((c) => c.inst === 'gtr');
  const parts = [];
  let drumPart = null, taiko = null;
  comp.chans.forEach((cd, ci) => {
    const evs = byCh[ci];
    const inst = INST[cd.inst] ? cd.inst : 'lead';
    const rev = cd.rev ?? INST[inst].rev ?? 0.2, dly = cd.dly ?? INST[inst].dly ?? 0, ov = OVERRIDE[`${id}.${cd.id}`] || {};
    if (inst === 'kit') {
      const lanes = new Set(evs.map((e) => e.m));
      const kit = ov.kit ?? pickKit(lanes, hasGtr);
      drumPart = { cid: cd.id, inst, ci, drum: true, kit, prog: kit, name: KIT_NAME[kit], vol: (cd.vol ?? 0.5) * (ov.vol ?? 1), pan: cd.pan ?? 0, rev, dly: 0, cho: 0, lanes: [...lanes].sort().join(''), notes: [], compiled: compiledCount[ci] };
      for (const e of evs) {
        const v = e.v * (0.96 + 0.08 * e.hum);
        if (e.m === 'z') {
          if (!taiko) taiko = { cid: cd.id + '.z', inst: 'kit:z', ci, prog: 116, name: GM_NAME[116], vol: (cd.vol ?? 0.5) * 0.9, pan: 0, rev: 0.35, dly: 0, cho: 0, notes: [], compiled: 0 };
          taiko.notes.push({ tick: e.tick, dur: PPQ * 2, key: 36, vel: clamp(Math.round(127 * Math.sqrt(v)), 1, 127) }); taiko.compiled++;
        } else if (LANE_KEY[e.m]) {
          drumPart.notes.push({ tick: e.tick, dur: PPQ / 8, key: LANE_KEY[e.m], vel: clamp(Math.round(127 * Math.sqrt(v * (LANE_VEL[e.m] ?? 0.8))), 1, 127) });
        }
      }
      drumPart.compiled -= taiko ? taiko.compiled : 0;
      return;
    }
    const ms = evs.map((e) => e.m);
    const st = { min: ms.length ? Math.min(...ms) : 60, max: ms.length ? Math.max(...ms) : 60, med: median(ms) };
    const prog = ov.prog ?? pick(inst, cd, st, def);
    const p = { cid: cd.id, inst, ci, prog, name: GM_NAME[prog] || `GM ${prog}`, vol: (cd.vol ?? 0.5) * (ov.vol ?? 1), pan: cd.pan ?? 0, rev: ov.rev ?? rev, dly, cho: ov.cho ?? CHORUS[prog] ?? 0, st, gen: !!cd.gen, from: cd.from || null, notes: [], compiled: compiledCount[ci] };
    for (const e of evs) p.notes.push({ tick: e.tick, dur: e.dur, key: clamp(Math.round(e.m), 0, 127), vel: clamp(Math.round(127 * Math.sqrt(clamp(e.v * (0.96 + 0.08 * e.hum), 0.01, 1))), 1, 127) });
    parts.push(p);
  });
  if (taiko) parts.push(taiko);
  // 같은 채널·같은 키 겹침 정리 (중복 제거, 앞 음을 뒤 음 시작에서 끊음) — MIDI 노트오프 모호성 방지
  for (const p of parts.concat(drumPart ? [drumPart] : [])) {
    p.notes.sort((a, b) => a.tick - b.tick || a.key - b.key);
    const out = [], lastByKey = new Map();
    for (const n of p.notes) {
      const prev = lastByKey.get(n.key);
      if (prev && prev.tick === n.tick) { prev.vel = Math.max(prev.vel, n.vel); prev.dur = Math.max(prev.dur, n.dur); p.dedup = (p.dedup || 0) + 1; continue; }
      if (prev && prev.tick + prev.dur > n.tick) prev.dur = n.tick - prev.tick;
      out.push(n); lastByKey.set(n.key, n);
    }
    p.notes = out;
  }
  // 채널 음량: 목표 진폭 A = vol × 10^(−L_prog/20) (L = GM 보정표), 곡 안 최대를 CC7 127 로
  const all = parts.concat(drumPart ? [drumPart] : []);
  for (const p of all) p.A = p.vol * Math.pow(10, -(CALIB[p.drum ? 'd' + p.kit : String(p.prog)] ?? -18) / 20);
  const Amax = Math.max(...all.map((p) => p.A));
  for (const p of all) {
    p.cc7 = clamp(Math.round(127 * Math.sqrt(p.A / Amax)), 1, 127);
    p.cc10 = clamp(Math.round(64 + p.pan * 63), 0, 127);
    p.cc91 = clamp(Math.round(p.rev * REV_CC), 0, 127);
    p.cc93 = clamp(Math.round(p.cho), 0, 127);
  }
  // MIDI 채널 배정: 멜로디 0‥8,10‥15 (포트 0) → 16‥24,26‥31 (포트 1) …, 드럼 = 9
  let n = 0;
  for (const p of parts) { while (n % 16 === 9) n++; p.mch = n++; }
  if (drumPart) drumPart.mch = 9;
  return { id, def, comp, tl, introBeats, totalBeats: beat, ideal, parts: all, loop: comp.loop };
}

function toMIDI(T) {
  const { tl, introBeats, totalBeats, def, comp } = T;
  const cond = [meta.name(0, `${T.id} — ${def.name}`)];
  for (const s of tl) {
    const tk = Math.round(s.beat * PPQ);
    cond.push(meta.tempo(tk, Math.round(60e6 / s.bpm)), meta.marker(tk, `sec:${s.name}`));
    const bpb = s.bpb; cond.push(Number.isInteger(bpb) ? meta.timesig(tk, bpb, 4) : meta.timesig(tk, Math.round(bpb * 2), 8));
  }
  const ls = Math.round(introBeats * PPQ), le = Math.round(totalBeats * PPQ);
  if (comp.loop) cond.push(meta.marker(ls, 'loopStart'), meta.marker(le, 'loopEnd'));
  else cond.push(meta.marker(le, 'end'));
  const tracks = [cond];
  for (const p of T.parts) {
    const ch = p.mch, port = ch >> 4, tr = [meta.name(0, `${p.cid} (${p.inst} → ${p.name})`), meta.port(0, port)];
    tr.push({ tick: 0, k: 'prog', ch, prog: p.prog }, { tick: 0, k: 'cc', ch, cc: 7, val: p.cc7 }, { tick: 0, k: 'cc', ch, cc: 10, val: p.cc10 },
      { tick: 0, k: 'cc', ch, cc: 11, val: 127 }, { tick: 0, k: 'cc', ch, cc: 91, val: p.cc91 }, { tick: 0, k: 'cc', ch, cc: 93, val: p.cc93 });
    for (const nt of p.notes) tr.push({ tick: nt.tick, k: 'on', ch, key: nt.key, vel: nt.vel }, { tick: nt.tick + Math.max(1, nt.dur), k: 'off', ch, key: nt.key });
    tracks.push(tr);
  }
  return writeSMF({ ppq: PPQ, tracks });
}

// ── 별칭 탐지: 컴파일 결과가 같거나 일정 음정 이동만 다르면 별칭 ──
function signature(T) {
  const notes = [];
  for (const p of T.parts) for (const n of p.notes) notes.push([p.inst, p.prog, n.tick, n.dur, p.drum ? n.key : 0, n.vel].join(','));
  const keys = T.parts.flatMap((p) => (p.drum ? [] : p.notes.map((n) => n.key)));
  return { body: notes.join(';') + '|' + T.tl.map((s) => s.name + s.bpm).join(',') + '|' + T.comp.loopAt, keys };
}
function findAliases(list) {
  const alias = {}, sigs = list.map((T) => [T.id, signature(T)]);
  for (let i = 0; i < sigs.length; i++) for (let j = 0; j < i; j++) {
    const [a, A] = sigs[j], [b, B] = sigs[i];
    if (alias[b] || alias[a] || A.body !== B.body || A.keys.length !== B.keys.length) continue;
    const d = B.keys.length ? B.keys[0] - A.keys[0] : 0;
    if (B.keys.every((k, x) => k - A.keys[x] === d)) alias[b] = a; // d≠0 이면 순수 조옮김 재사용
  }
  return alias;
}

function run(cmd, argv) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? res(out) : rej(new Error(`${cmd} ${argv.join(' ')} → ${code}\n${err.slice(-3000)}`))));
  });
}
async function pool(items, n, fn) {
  const q = [...items], res = [];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) { const it = q.shift(); res.push(await fn(it)); } }));
  return res;
}

function readIndex() { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')); } catch { return null; } }

async function main() {
  fs.mkdirSync(path.join(BUILD, 'mid'), { recursive: true }); fs.mkdirSync(path.join(BUILD, 'spec'), { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const ids = Object.keys(TRACKS);
  const PY = path.join(HERE, 'render.py');
  if (CHECK) {
    const out = await run('python3', [PY, 'check', path.join(OUT, 'index.json'), '--budget', String(BUDGET_MB), '--tp', String(TP_MAX), ...(ONLY ? ['--only', ONLY.join(',')] : [])]);
    process.stdout.write(out);
    if (/^FAIL/m.test(out)) process.exit(1);
    return;
  }
  for (const id of ONLY || []) if (!TRACKS[id]) { console.error(`알 수 없는 곡: ${id}`); process.exit(2); }
  const all = ids.map((id) => buildTrack(id));
  const aliases = findAliases(all);
  const want = all.filter((T) => (!ONLY || ONLY.includes(T.id)) && !aliases[T.id]);
  const specs = [];
  for (const T of want) {
    const mid = path.join(BUILD, 'mid', `${T.id}.mid`);
    fs.writeFileSync(mid, toMIDI(T));
    const dlyParts = T.parts.filter((p) => p.dly > 0);
    const dmax = Math.max(0, ...dlyParts.map((p) => p.dly));
    const spec = {
      id: T.id, name: T.def.name, mid, rate: RATE, loop: T.loop, kbps: KBPS[T.id] ?? KBPS.default,
      lufs: JINGLES.has(T.id) ? LUFS_JINGLE : LUFS, tp: TP_MAX, out: path.join(OUT, `${T.id}.m4a`), work: path.join(BUILD, 'work'),
      stats: path.join(BUILD, 'spec', `${T.id}.stats.json`), spectro: SPEC_IDS.includes(T.id) ? path.join(BUILD, 'spec', `${T.id}.png`) : null,
      ideal: T.ideal, bpm: T.comp.bpm,
      // 게임 엔진 리드 딜레이 재현: 지연 = min(1.5, 0.75박) (곡 기본 bpm), 송신은 채널별 dly (CC7 에 √(dly/dmax) 로 반영)
      delay: dlyParts.length ? { time: Math.min(1.5, (60 / T.comp.bpm) * 0.75), gain: dmax, chans: Object.fromEntries(dlyParts.map((p) => [p.mch, Math.sqrt(p.dly / dmax)])) } : null,
      drums: T.parts.filter((p) => p.drum).map((p) => p.mch),
      rev: Object.fromEntries(T.parts.map((p) => [p.mch, p.rev])),
      parts: T.parts.map((p) => ({ cid: p.cid, inst: p.inst, gm: p.drum ? `kit ${p.kit} ${p.name}` : `${p.prog} ${p.name}`, mch: p.mch, compiled: p.compiled, midi: p.notes.length, dedup: p.dedup || 0, cc7: p.cc7, cc91: p.cc91, cc93: p.cc93, cc10: p.cc10, lanes: p.lanes })),
    };
    const sp = path.join(BUILD, 'spec', `${T.id}.json`);
    fs.writeFileSync(sp, JSON.stringify(spec, null, 1));
    specs.push(sp);
  }
  console.log(`MIDI ${want.length}곡 → ${path.join(BUILD, 'mid')}` + (Object.keys(aliases).length ? `, 별칭 ${JSON.stringify(aliases)}` : ', 별칭 없음'));
  if (NORENDER) return;
  const t0 = Date.now();
  await pool(specs, JOBS, async (sp) => {
    const id = path.basename(sp, '.json');
    const t = Date.now();
    await run('python3', [PY, 'build', sp]);
    console.log(`  ${id.padEnd(10)} ${((Date.now() - t) / 1000).toFixed(1)}s`);
  });
  // index.json 갱신 (부분 빌드면 나머지 항목 유지)
  const prev = readIndex();
  const idx = { version: 1, rate: RATE, format: 'm4a', generated: new Date().toISOString(), tracks: { ...(prev?.tracks || {}) }, alias: { ...(prev?.alias || {}), ...aliases } };
  for (const T of want) {
    const s = JSON.parse(fs.readFileSync(path.join(BUILD, 'spec', `${T.id}.stats.json`), 'utf8'));
    idx.tracks[T.id] = s.entry; delete idx.alias[T.id];
  }
  for (const a of Object.keys(idx.alias)) if (!TRACKS[a]) delete idx.alias[a];
  for (const k of Object.keys(idx.tracks)) if (!TRACKS[k] || aliases[k]) delete idx.tracks[k];
  const ord = Object.fromEntries(ids.filter((k) => idx.tracks[k]).map((k) => [k, idx.tracks[k]]));
  idx.tracks = ord;
  idx.totalBytes = Object.values(ord).reduce((a, t) => a + t.bytes, 0);
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx, null, 1) + '\n');
  console.log(`완료 ${((Date.now() - t0) / 1000).toFixed(0)}s — ${Object.keys(ord).length}곡, ${(idx.totalBytes / 1048576).toFixed(2)} MB`);
  writeQA(idx, ids);
}

// README 의 QA 표 갱신 (<!-- QA:BEGIN --> … <!-- QA:END -->)
function writeQA(idx, ids) {
  const rd = path.join(HERE, 'README.md');
  if (!fs.existsSync(rd)) return;
  const rows = [];
  for (const id of ids) {
    const sp = path.join(BUILD, 'spec', `${id}.stats.json`);
    if (!fs.existsSync(sp) || !idx.tracks[id]) continue;
    const s = JSON.parse(fs.readFileSync(sp, 'utf8')), e = s.entry, q = s.qa;
    const seam = e.loop ? `${q.seam.jump.toFixed(2)} / ${q.seam.hf.toFixed(2)} / ${q.seam.match_db.toFixed(0)} dB` : '—';
    rows.push(`| ${id} | ${e.duration.toFixed(1)} | ${e.loop ? `${e.loopStart.toFixed(3)}–${e.loopEnd.toFixed(3)}` : 'no loop'} | ${(q.durErrMs).toFixed(2)} | ${e.lufs.toFixed(1)} | ${e.peak.toFixed(1)} | ${q.limitDb.toFixed(1)} | ${q.clip} | ${seam} | ${q.notesOk ? 'ok' : q.notesMsg} | ${q.kbps} | ${(e.bytes / 1024).toFixed(0)} |`);
  }
  const table = ['| id | dur s | loop s | Δtempo ms | LUFS | dBTP | limiter dB | clip | seam jump / hf / match | notes MIDI=compiled | kbps | KiB |', '|---|---|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n');
  let md = fs.readFileSync(rd, 'utf8');
  md = md.replace(/<!-- QA:BEGIN -->[\s\S]*<!-- QA:END -->/, `<!-- QA:BEGIN -->\n${table}\n\nTotal: ${Object.keys(idx.tracks).length} files, ${(idx.totalBytes / 1048576).toFixed(2)} MB (budget ${BUDGET_MB} MB). Aliases: ${Object.keys(idx.alias).length ? JSON.stringify(idx.alias) : 'none'}.\n<!-- QA:END -->`);
  fs.writeFileSync(rd, md);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
