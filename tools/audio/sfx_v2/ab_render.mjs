// 지금 효과음 ↔ 고급 효과음 v2 비교 렌더 (시범 산출물). 게임 오디오 엔진(src/core/audio.js 의 Engine)을 헤드리스 Chromium 의
// OfflineAudioContext 로 그대로 돌린다 — 믹서·마스터 컴프레서·잔향·덕킹·녹음 샘플 뱅크(RecBank)·v2 뱅크(V2Bank) 모두 게임과 같은 코드.
//   지금 = 엔진에 v2 뱅크 없음 (스위치 꺼짐과 같은 경로: 녹음 샘플 + 합성음 층)
//   v2   = 엔진에 v2 뱅크 (스위치 켜짐: v2 이름은 녹음 층 샘플만, 나머지 이름은 지금 그대로)
//
//  1) 소리 비교표:  node tools/audio/sfx_v2/ab_render.mjs --list out.m4a [--json timings.json] [--names hit,crit]
//     이름마다 [지금] 0.6초 [v2] 1.2초 … 각 소리를 같은 세기(vol 1)로 3번 (변형·반복감 비교), 발소리는 6걸음, 궁극기 타격은 2번.
//  2) 게임 장면:    node tools/audio/sfx_v2/ab_render.mjs --log capture.json --from F0 --to F1 --a a.wav --b b.wav [--music s01 --music-at 12] [--space open]
//     capture_combat.mjs 가 기록한 audio.sfx 호출(프레임·이름·옵션)을 같은 시각(프레임/60초)에 다시 울린다. 배경음은 그 곡 파일을
//     게임과 같은 크기(RecBank: -19 LUFS 기준)로 음악 버스(musicIn)에 넣어 덕킹까지 같게.
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { routeM4a } from '../m4a_route.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const SR = 48000, WARM = 0.6;
const V2IX = JSON.parse(fs.readFileSync(path.join(root, 'assets/audio/sfx_v2/index.json'), 'utf8')), V2NAMES = V2IX.names;

// ── 브라우저 ──
const srv = await start(0), port = srv.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext()).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await routeM4a(page, root);   // 헤드리스 Chromium 은 AAC 를 못 푼다 → 같은 내용의 WAV
await page.route('**/__ab__.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>ab</title>' }));
let music = null;
if (opt('music')) {
  const id = opt('music'), mix = JSON.parse(fs.readFileSync(path.join(root, 'assets/audio/music/index.json'), 'utf8'));
  const t = mix.tracks[id];
  const wav = path.join(os.tmpdir(), `ab_music_${id}.wav`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(root, 'assets/audio/music', t.file), '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_s16le', wav]);
  const bytes = fs.readFileSync(wav);
  await page.route('**/__music__.wav', (r) => r.fulfill({ contentType: 'audio/wav', body: bytes }));
  // RecBank 과 같은 크기: gain = 10^((REF_LUFS(-19) − 곡 LUFS)/20), 0.25~2
  music = { gain: Math.min(2, Math.max(0.25, Math.pow(10, (-19 - t.lufs) / 20))), at: +opt('music-at', String(t.loopStart || 0)) };
}
await page.goto(`http://localhost:${port}/__ab__.html`);
const setup = await page.evaluate(async ({ SR, hasMusic }) => {
  const A = await import('/src/core/audio.js'), REC = await import('/src/core/audio_rec.js');
  const dc = new OfflineAudioContext(2, SR, SR);
  const rec = new REC.RecBank(); rec.attach(dc);
  const ix = await rec.sfxIndex(); await rec.loadSfx(Object.keys(ix.sfx));
  const v2 = new A.V2Bank(); await v2.attach(dc);
  let mbuf = null;
  if (hasMusic) mbuf = await dc.decodeAudioData(await (await fetch('/__music__.wav')).arrayBuffer());
  const b64 = (f32) => { const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  window.__ab = {
    // evts: [{t, name, o}] (초, WARM 뒤 기준) → 렌더 (앞 WARM 초는 마스터 컴프레서 안정용으로 잘라 낸다)
    async render({ evts, dur, useV2, space, music, WARM }) {
      const oc = new OfflineAudioContext(2, Math.ceil(SR * (dur + WARM)), SR);
      const eng = new A.Engine(oc); eng.setVolumes(0.6, 0.8); eng.bank = rec; eng.v2 = useV2 ? v2 : null; eng.v2Space = space || 'hall'; eng.v2Quality = 'high';
      if (music && mbuf) { const s = oc.createBufferSource(), g = oc.createGain(); s.buffer = mbuf; s.loop = true; g.gain.value = music.gain; s.connect(g); g.connect(eng.musicIn); s.start(0, Math.max(0, music.at - WARM)); }
      const groups = new Map();
      for (const e of evts) { const q = Math.max(1, Math.round((WARM + e.t) * SR / 128)); if (q * 128 >= oc.length) continue; (groups.get(q) || groups.set(q, []).get(q)).push(e); }
      for (const [q, es] of groups) oc.suspend(q * 128 / SR).then(() => { for (const e of es) { try { eng.sfx(e.name, e.o || {}); } catch (err) { console.error(err); } } oc.resume(); });
      const b = await oc.startRendering(), skip = Math.round(WARM * SR);
      return { L: b64(b.getChannelData(0).subarray(skip)), R: b64(b.getChannelData(1).subarray(skip)), stats: { ...eng.stats }, v2Starts: eng.v2Starts };
    },
  };
  return { recNames: rec.smp.size, v2: v2.stats(), music: mbuf ? mbuf.duration : 0 };
}, { SR, hasMusic: !!music });
console.log('banks', JSON.stringify(setup));

const f32 = (b64) => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
async function render(evts, dur, useV2, space = 'hall', mus = null) {
  const r = await page.evaluate((a) => window.__ab.render(a), { evts, dur, useV2, space, music: mus, WARM });
  return { L: Float32Array.from(f32(r.L)), R: Float32Array.from(f32(r.R)), stats: r.stats, v2Starts: r.v2Starts };
}
function writeWav(file, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { buf.writeFloatLE(L[i], 44 + i * 8); buf.writeFloatLE(R[i], 48 + i * 8); }
  fs.writeFileSync(file, buf);
}
const peakOf = (L, R) => { let p = 0; for (let i = 0; i < L.length; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i])); return p; };
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
// ITU-R BS.1770 K-가중 순간 라우드니스(400 ms) 최댓값 — 비교는 귀에 들리는 크기로 (tools/test_sfx.mjs 와 같은 식)
function kw(x) {
  const out = new Float64Array(x.length);
  let K = Math.tan(Math.PI * 1681.974450955533 / SR), Q = 0.7071752369554196; const Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K; const s1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  K = Math.tan(Math.PI * 38.13547087602444 / SR); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K; const s2 = [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = s1[0] * v + s1[1] * x1 + s1[2] * x2 - s1[3] * y1 - s1[4] * y2; x2 = x1; x1 = v; y2 = y1; y1 = y;
    const z = y - 2 * u1 + u2 - s2[0] * z1 - s2[1] * z2; u2 = u1; u1 = y; z2 = z1; z1 = z; out[i] = z;
  }
  return out;
}
function lufsM(L, R) {
  const a = kw(L), b = kw(R), w = Math.floor(SR * 0.4); let s = 0, best = 0;
  const sq = (i) => a[i] * a[i] + b[i] * b[i];
  for (let i = 0; i < Math.min(w, a.length); i++) s += sq(i);
  best = s;
  for (let i = w; i < a.length; i++) { s += sq(i) - sq(i - w); if (s > best) best = s; }
  return -0.691 + 10 * Math.log10(best / w + 1e-20);
}

if (opt('list')) {
  // ── 1) 소리 비교표 ──
  const names = opt('names') ? opt('names').split(',') : V2NAMES;
  const LONG = new Set(['ult_impact', 'thunderclap', 'levelup', 'holy']);
  const pattern = (n) => (/^(step_|footstep|gallop)/.test(n) ? [0, 0.3, 0.6, 0.9, 1.2, 1.5] : LONG.has(n) ? [0, 2.0] : /^(menu_move|type)$/.test(n) ? [0, 0.16, 0.32, 0.48] : [0, 0.45, 0.9]);
  const GAP_IN = 0.6, GAP_OUT = 1.2;
  const L = [], R = [], rows = [];
  let tCur = 0;
  const push = (seg) => { L.push(seg.L); R.push(seg.R); tCur += seg.L.length / SR; };
  const sil = (sec) => ({ L: new Float32Array(Math.round(sec * SR)), R: new Float32Array(Math.round(sec * SR)) });
  const trim = (seg) => { // 끝의 무음 (-70 dBFS 미만) 을 잘라 낸다 (50 ms 남김)
    const thr = Math.pow(10, -70 / 20); let e = seg.L.length - 1;
    while (e > 0 && Math.abs(seg.L[e]) < thr && Math.abs(seg.R[e]) < thr) e--;
    const end = Math.min(seg.L.length, e + Math.round(0.05 * SR));
    return { ...seg, L: seg.L.subarray(0, end), R: seg.R.subarray(0, end) };
  };
  push(sil(0.5));
  for (const n of names) {
    const ts = pattern(n), span = ts[ts.length - 1];
    const of = V2IX.sfx[n]?.of;   // 몸 종류 변형: 예전 = 그 이름(enemy_die) 그대로, v2 = v2alt 로 변형 묶음
    const evts = ts.map((t) => ({ t, name: of || n, o: of ? { vol: 1, v2alt: n.slice(of.length + 1) } : { vol: 1 } }));
    const tail = LONG.has(n) ? 2.8 : 1.4;
    const a = trim(await render(evts, span + tail, false)), b = trim(await render(evts, span + tail, true));
    const row = { name: n, cur: +tCur.toFixed(2) };
    push(a); push(sil(GAP_IN)); row.v2 = +tCur.toFixed(2); push(b); push(sil(GAP_OUT));
    row.lmCur = +lufsM(a.L, a.R).toFixed(1); row.lmV2 = +lufsM(b.L, b.R).toFixed(1); row.pkCur = +db(peakOf(a.L, a.R)).toFixed(1); row.pkV2 = +db(peakOf(b.L, b.R)).toFixed(1);
    row.v2Starts = b.v2Starts; row.curStats = a.stats;
    rows.push(row);
    console.log(`${n.padEnd(11)} 지금 ${row.cur.toFixed(1).padStart(5)}s  v2 ${row.v2.toFixed(1).padStart(5)}s   LUFS-M 지금 ${row.lmCur} / v2 ${row.lmV2} (${row.lmV2 - row.lmCur >= 0 ? '+' : ''}${(row.lmV2 - row.lmCur).toFixed(1)} dB)   피크 ${row.pkCur} / ${row.pkV2} dBFS   v2 재생 ${b.v2Starts}`);
  }
  const cat = (arr) => { const n = arr.reduce((a, x) => a + x.length, 0), o = new Float32Array(n); let k = 0; for (const x of arr) { o.set(x, k); k += x.length; } return o; };
  const LL = cat(L), RR = cat(R), pk = peakOf(LL, RR);
  const g = pk > Math.pow(10, -1 / 20) ? Math.pow(10, -1 / 20) / pk : 1;   // 전체를 같은 비율로만 (A/B 상대 크기 유지), 피크 ≤ -1 dBFS
  if (g !== 1) for (let i = 0; i < LL.length; i++) { LL[i] *= g; RR[i] *= g; }
  const out = path.resolve(opt('list')), wav = out.replace(/\.[^.]+$/, '') + '.wav';
  writeWav(wav, LL, RR);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  if (!opt('keep-wav')) fs.unlinkSync(wav);
  console.log(`→ ${out}  ${(LL.length / SR).toFixed(1)}초  피크 ${db(pk * g).toFixed(1)} dBFS (전체 이득 ${db(g).toFixed(1)} dB)`);
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify({ rows, dur: LL.length / SR, gainDb: db(g) }, null, 1));
} else if (opt('log')) {
  // ── 2) 게임 장면 ──
  const cap = JSON.parse(fs.readFileSync(opt('log'), 'utf8'));
  const F0 = +opt('from'), F1 = +opt('to'), dur = (F1 - F0) / 60, base = cap.f0 + F0;
  const evts = cap.log.filter((e) => e.f - cap.f0 > F0 && e.f - cap.f0 <= F1).map((e) => ({ t: (e.f - base) / 60, name: e.name, o: e.o }));
  const space = opt('space', 'open');
  const a = await render(evts, dur, false, space, music), b = await render(evts, dur, true, space, music);
  writeWav(opt('a'), a.L, a.R); writeWav(opt('b'), b.L, b.R);
  const cnt = {}; for (const e of evts) cnt[e.name] = (cnt[e.name] || 0) + 1;
  console.log(`장면 ${dur.toFixed(2)}초, 효과음 호출 ${evts.length}개 (v2 이름 ${evts.filter((e) => V2NAMES.includes(e.name)).length}개): ${Object.entries(cnt).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}×${v}`).join(' ')}`);
  console.log(`지금: 피크 ${db(peakOf(a.L, a.R)).toFixed(1)} dBFS, LUFS-M 최대 ${lufsM(a.L, a.R).toFixed(1)}, 시작 ${a.stats.starts}  |  v2: 피크 ${db(peakOf(b.L, b.R)).toFixed(1)} dBFS, LUFS-M 최대 ${lufsM(b.L, b.R).toFixed(1)}, 시작 ${b.stats.starts} (v2 샘플 ${b.v2Starts})`);
}
for (const e of errs) console.log('  ✗ 페이지 오류: ' + e);
await browser.close(); srv.close();
process.exitCode = errs.length ? 1 : 0;
