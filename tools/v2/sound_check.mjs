// v2 타격감 소리 검사 — 표(src/v2/feel/table.js)의 모든 사건을 게임 오디오 엔진(src/core/audio.js Engine, OfflineAudioContext)으로 실제와 같은
// 경로(믹서·컴프레서·리미터·방 울림·덕킹)로 렌더해서 피크·라우드니스·길이·클리핑을 잰다. 클리핑·빠진 파일·빈 소리가 있으면 실패(종료 코드 1).
//
//   node tools/v2/sound_check.mjs [--out /tmp/claude-0/v2/soundfeel] [--phone] [--quick] [--no-demos] [--shot]
//     --phone   휴대폰처럼 샘플을 32 kHz(드문 소리 24 kHz)로 풀어서 렌더 (Android WebView 경로)
//     --quick   타격 조합을 한손검만 (기본: 무기 6 × 재질 7 × 세기 4 전부)
//     --shot    시험 페이지(tools/v2/sound_view.html)를 열어 3연타 시연을 누르고 화면을 찍는다
//   산출: <out>/sound_check.json (전체 표) · <out>/demo_<이름>.m4a + .png(스펙트로그램) · 콘솔 요약
//   헤드리스 Chromium 은 AAC 를 못 풀어서 .m4a 요청을 같은 내용의 WAV 로 바꿔 준다 (tools/audio/m4a_route.mjs 와 같은 방법) — 소리 내용은 같다.
//   여기서 재는 것은 소리 크기·길이이지 속도가 아니다 (오프라인 렌더 시간은 기기 성능과 무관). 기기에 그대로 옮겨지는 숫자: 층 수·노드 수·파일 바이트.
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { m4aToWav } from '../audio/m4a_route.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2), has = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const OUT = opt('out', '/tmp/claude-0/v2/soundfeel');
fs.mkdirSync(OUT, { recursive: true });
const fails = [], warns = [];

// ── 1) 파일 검사 (브라우저 없이) ──
const NEW = path.join(root, 'assets/v2/audio'), nix = JSON.parse(fs.readFileSync(path.join(NEW, 'index.json'), 'utf8'));
const oix = JSON.parse(fs.readFileSync(path.join(root, 'assets/audio/sfx_v2/index.json'), 'utf8'));
let newBytes = 0;
for (const [fid, f] of Object.entries(nix.files)) {
  const p = path.join(NEW, fid + '.m4a');
  if (!fs.existsSync(p) || !fs.statSync(p).size) { fails.push(`빠진 파일: assets/v2/audio/${fid}.m4a`); continue; }
  const b = fs.readFileSync(p); newBytes += b.length;
  if (crypto.createHash('sha1').update(b).digest('hex').slice(0, 8) !== f.m4a) fails.push(`해시 다름: ${fid}.m4a (index.json 을 다시 만들어야 함)`);
  if (f.dpk > -0.95) fails.push(`파일 피크 초과: ${fid} ${f.dpk} dBFS`);
}
for (const [name, d] of Object.entries(nix.sfx)) for (const fid of d.f) if (!nix.files[fid]) fails.push(`index: ${name} → 없는 파일 ${fid}`);
for (const f of fs.readdirSync(NEW)) if (f.endsWith('.m4a') && !nix.files[f.slice(0, -4)]) warns.push(`index 에 없는 파일: ${f}`);
if (newBytes > 1.5 * 1048576) fails.push(`새 소리 합계 ${(newBytes / 1048576).toFixed(2)} MB > 1.5 MB`);
const T = await import(path.join(root, 'src/v2/feel/table.js'));
const used = T.usedSources();
for (const n of used.old) if (!oix.sfx[n]) fails.push(`표가 쓰는 옛 샘플이 없음: ${n}`); else for (const fid of oix.sfx[n].f) if (!fs.existsSync(path.join(root, 'assets/audio/sfx_v2', fid + '.m4a'))) fails.push(`빠진 파일: assets/audio/sfx_v2/${fid}.m4a`);
for (const n of used.neu) if (!nix.sfx[n]) fails.push(`표가 쓰는 새 샘플이 없음: ${n}`);
// 층 수 (기기에 그대로 옮겨지는 숫자): 품질별 한 사건의 층 수
const tier = (ls, q) => ls.filter((l) => l.q <= q).length;
const layerStats = { low: { max: 0, sum: 0, n: 0 }, medium: { max: 0, sum: 0, n: 0 }, high: { max: 0, sum: 0, n: 0 } };
const countRec = (r) => { for (const [k, q] of Object.entries(T.QUALITY)) { const c = tier(r.layers, q), s = layerStats[k]; s.max = Math.max(s.max, c); s.sum += c; s.n++; } };

// ── 2) 렌더 목록 ──
const { DEMOS, LISTENER } = await import(path.join(root, 'tools/v2/sound_demos.js'));
const NEAR = { x: 110, y: 50, z: 30 }, FARP = { x: 500, y: 50, z: 1900 };
const jobs = [];
const weapons = has('quick') ? ['sword'] : T.WEAPONS;
for (const w of weapons) for (const m of T.MATERIALS) for (const s of T.STRENGTHS) { jobs.push({ id: `hit.${w}.${m}.${s}`, grp: 'hit', lines: [{ t: 0, c: 'hit', a: [w, m, s, 0], pos: NEAR }], dur: 1.6 }); countRec(T.hitFeel(w, m, s, 0)); }
for (const m of T.MATERIALS) {
  jobs.push({ id: `hit.sword.${m}.H+crit`, grp: 'mod', lines: [{ t: 0, c: 'hit', a: ['sword', m, 'H', T.FLAG.crit], pos: NEAR }], dur: 1.8 });
  jobs.push({ id: `hit.sword.${m}.H+kill`, grp: 'mod', lines: [{ t: 0, c: 'hit', a: ['sword', m, 'H', T.FLAG.kill], pos: NEAR }], dur: 2.2 });
  jobs.push({ id: `hit.great.${m}.F+finisher`, grp: 'mod', lines: [{ t: 0, c: 'hit', a: ['great', m, 'F', T.FLAG.finisher | T.FLAG.kill], pos: NEAR }], dur: 2.6 });
  countRec(T.hitFeel('sword', m, 'H', T.FLAG.crit)); countRec(T.hitFeel('great', m, 'F', T.FLAG.finisher | T.FLAG.kill));
}
for (const w of weapons) {
  jobs.push({ id: `guard.${w}`, grp: 'mod', lines: [{ t: 0, c: 'hit', a: [w, 'armor', 'M', T.FLAG.guard], pos: NEAR }], dur: 1.6 });
  jobs.push({ id: `parry.${w}`, grp: 'mod', lines: [{ t: 0, c: 'hit', a: [w, 'armor', 'H', T.FLAG.parry], pos: NEAR }], dur: 2.0 });
  for (const s of T.STRENGTHS) { jobs.push({ id: `swing.${w}.${s}`, grp: 'swing', lines: [{ t: 0, c: 'swing', a: [w, s], pos: NEAR }], dur: 1.0 }); countRec(T.swingFeel(w, s)); }
}
for (const name of T.EVENT_NAMES) {
  const r = T.EVENTS[name];
  if (r.loop) jobs.push({ id: name, grp: 'loop', lines: [{ t: 0, c: 'loop+', a: [name], pos: r.flat ? null : NEAR }, { t: 2.0, c: 'loop-', a: [name] }], dur: 2.6 });
  else { const long = name.startsWith('bell.') ? (name === 'bell.toll' ? 8 : 5.5) : name.includes('.charge') ? 1.6 : name.includes('impact') ? 2.6 : 1.8; jobs.push({ id: name, grp: name.split('.')[0], lines: [{ t: 0, c: 'play', a: [name], pos: r.flat ? null : NEAR }], dur: long }); countRec(r); }
}
// 공간·느린 화면·품질 비교 (같은 타격)
const REF = [{ t: 0, c: 'hit', a: ['sword', 'bone', 'H', 0], pos: NEAR }];
jobs.push({ id: 'space.near', grp: 'space', lines: REF, dur: 1.6 });
jobs.push({ id: 'space.far(3.3x)', grp: 'space', lines: [{ ...REF[0], pos: FARP }], dur: 1.6 });
jobs.push({ id: 'space.left', grp: 'space', lines: [{ ...REF[0], pos: { x: -420, y: 50, z: 30 } }], dur: 1.6 });
jobs.push({ id: 'space.slowmo(0.25)', grp: 'space', lines: [{ t: 0, c: 'ts', a: [0.25] }, { t: 0.001, c: 'hit', a: ['sword', 'bone', 'H', 0], pos: NEAR }], dur: 1.8 });
for (const room of ['street', 'alley', 'courtyard', 'hall']) jobs.push({ id: `room.${room}`, grp: 'space', room, lines: REF, dur: 2.6 });
for (const q of ['low', 'medium', 'high']) jobs.push({ id: `quality.${q}`, grp: 'space', q, lines: [{ t: 0, c: 'hit', a: ['great', 'bone', 'F', T.FLAG.finisher | T.FLAG.kill], pos: NEAR }], dur: 2.6 });
// 옛 샘플 뱅크가 없을 때 (?sfx=v1 · m4a 를 못 푸는 브라우저 · 아직 안 풀림): v1 합성음으로 대신 — 비지 않고 깨지지 않아야 한다
for (const [id, line] of [['hit', { t: 0, c: 'hit', a: ['sword', 'bone', 'H', 0], pos: NEAR }], ['finisher', { t: 0, c: 'hit', a: ['great', 'armor', 'F', T.FLAG.finisher | T.FLAG.kill], pos: NEAR }], ['dash', { t: 0, c: 'play', a: ['move.dash'], pos: NEAR }], ['fire', { t: 0, c: 'play', a: ['magic.fire.impact'], pos: NEAR }]]) jobs.push({ id: `fallback.${id}`, grp: 'fallback', noOld: true, lines: [line], dur: 2.4 });
// 같은 순간 3명 타격 (겹치기) · 덕킹 깊이
jobs.push({ id: 'multi.3targets', grp: 'space', lines: [0, 1, 2].map((i) => ({ t: 0, c: 'hit', a: ['sword', ['bone', 'flesh', 'armor'][i], 'H', 0], pos: { x: -100 + i * 120, y: 50, z: 30 } })), dur: 1.8 });
if (!has('no-demos')) for (const [k, d] of Object.entries(DEMOS)) jobs.push({ id: `demo.${k}`, grp: 'demo', room: d.room, lines: d.ev, dur: d.dur + 1.2, wav: true });

// ── 3) 브라우저 ──
const srv = await start(0), port = srv.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 756 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { window.__BN_AUDIO_CODECS = ['m4a']; });
await ctx.route(/\/assets\/(audio|v2\/audio)\/.+\.m4a(\?.*)?$/, (r) => {
  const file = path.join(root, decodeURIComponent(new URL(r.request().url()).pathname));
  if (!file.startsWith(path.join(root, 'assets')) || !fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
  try { return r.fulfill({ status: 200, contentType: 'audio/wav', body: m4aToWav(file).wav }); } catch (e) { return r.fulfill({ status: 500, body: String(e.message || e) }); }
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.route('**/__sc__.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>sound check</title>' }));
await page.goto(`http://localhost:${port}/__sc__.html`);
const SR = 48000, WARM = 0.3;
const setup = await page.evaluate(async ({ SR, phone, oldNames }) => {
  const A = await import('/src/core/audio.js'), F = await import('/src/v2/feel/index.js'), D = await import('/tools/v2/sound_demos.js');
  const dc = new OfflineAudioContext(2, SR, SR);
  const v2 = new A.V2Bank(); v2.ctx = dc; v2.rate = phone ? 32000 : 0; v2.lazyRate = phone ? 24000 : 0;
  await v2.index(); await v2.load(oldNames);
  const bank = new A.V2Bank(F.NEW_DIR); bank.ctx = dc; bank.rate = phone ? 32000 : 0; bank.lazyRate = phone ? 24000 : 0;
  const ix = await bank.index(); if (ix) await bank.load(ix.names);
  // K-가중 (BS.1770, 48 kHz) → 400 ms 창 최대 (LUFS-M)
  const kw = (x) => { const y = new Float32Array(x.length); let a1 = 0, a2 = 0, b1 = 0, b2 = 0, c1 = 0, c2 = 0, d1 = 0, d2 = 0; for (let i = 0; i < x.length; i++) { const v = x[i], s = 1.53512485958697 * v - 2.69169618940638 * a1 + 1.19839281085285 * a2 + 1.69065929318241 * b1 - 0.73248077421585 * b2; a2 = a1; a1 = v; b2 = b1; b1 = s; const o = s - 2 * c1 + c2 + 1.99004745483398 * d1 - 0.99007225036621 * d2; c2 = c1; c1 = s; d2 = d1; d1 = o; y[i] = o; } return y; };
  const db = (v) => (v > 1e-9 ? 20 * Math.log10(v) : -180);
  const b64 = (f32) => { const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  window.__sc = async ({ lines, dur, q, room, wav, WARM, listener, noOld }) => {
    const oc = new OfflineAudioContext(4, Math.ceil(SR * (dur + WARM)), SR);
    const eng = new A.Engine(oc); eng.setVolumes(0.6, 0.8); eng.v2 = noOld ? null : v2; eng.v2Quality = q || 'high';
    const sp = oc.createChannelSplitter(2), mg = oc.createChannelMerger(4); eng.master.connect(sp); sp.connect(mg, 0, 2); sp.connect(mg, 1, 3); mg.connect(oc.destination);   // 채널 2·3 = 마스터 컴프레서 앞
    const host = { eng, quality: q || 'high', sfx(n, o) { eng.feelCap = 10; eng.sfx(n, o); }, duck(a, t) { eng.duck(a, t); } };
    const fsnd = new F.FeelSound(host); fsnd.bank = bank; fsnd.bankP = Promise.resolve();
    fsnd.setListener(...listener); fsnd.setRoom(room || 'street');
    const loops = new Map(), groups = new Map(); let duckMin = 1;
    for (const e of lines) { const k = Math.max(1, Math.round((WARM + e.t) * SR / 128)); if (k * 128 >= oc.length) continue; (groups.get(k) || groups.set(k, []).get(k)).push(e); }
    for (const [k, es] of groups) oc.suspend(k * 128 / SR).then(() => { for (const e of es) { try { D.runLine(fsnd, e, loops); } catch (err) { console.error('line', JSON.stringify(e), err && err.message); } } oc.resume(); });
    for (let t = WARM + 0.1; t < dur + WARM - 0.05; t += 0.1) { const k = Math.round(t * SR / 128); if (!groups.has(k)) oc.suspend(k * 128 / SR).then(() => { duckMin = Math.min(duckMin, eng.duckG.gain.value); oc.resume(); }); }
    const buf = await oc.startRendering(), skip = Math.round(WARM * SR), Lc = buf.getChannelData(0).subarray(skip), Rc = buf.getChannelData(1).subarray(skip), P0 = buf.getChannelData(2).subarray(skip), P1 = buf.getChannelData(3).subarray(skip);
    let pk = 0, pre = 0, clip = 0, last = 0, sq = 0, lr = 0;
    for (let i = 0; i < Lc.length; i++) { const a = Math.abs(Lc[i]), b = Math.abs(Rc[i]), m = a > b ? a : b; if (m > pk) pk = m; if (m >= 0.999) clip++; if (m > 0.001) last = i; sq += Lc[i] * Lc[i] + Rc[i] * Rc[i]; lr += Lc[i] * Lc[i] - Rc[i] * Rc[i]; const p = Math.max(Math.abs(P0[i]), Math.abs(P1[i])); if (p > pre) pre = p; }
    const kl = kw(Lc), kr = kw(Rc), w = Math.round(0.4 * SR), h = Math.round(0.1 * SR), cs = new Float64Array(kl.length + w + 1);
    for (let i = 0; i < kl.length; i++) cs[i + 1] = cs[i] + kl[i] * kl[i] + kr[i] * kr[i];
    for (let i = kl.length; i < kl.length + w; i++) cs[i + 1] = cs[i];
    let mx = 0; for (let i = 0; i + w <= kl.length + w; i += h) { const v = (cs[i + w] - cs[i]) / w; if (v > mx) mx = v; }
    // 고역 비율 (4 kHz 위 에너지) — 거리·느린 화면의 저역 통과가 먹었는지
    let hf = 0, x1 = 0, y1 = 0; const al = 1 / (1 + 2 * Math.PI * 4000 / SR); for (let i = 0; i < Lc.length; i++) { const x = Lc[i] + Rc[i], y = al * (y1 + x - x1); x1 = x; y1 = y; hf += y * y; }
    return { peak: +db(pk).toFixed(2), pre: +db(pre).toFixed(2), lufsM: +(mx > 0 ? -0.691 + 10 * Math.log10(mx) : -120).toFixed(1), len: +(last / SR).toFixed(3), clip, hf: +(sq > 0 ? 10 * Math.log10(hf / (sq * 2 + 1e-12) + 1e-9) : -90).toFixed(1), bal: +(sq > 0 ? lr / sq : 0).toFixed(2),
      duck: +db(duckMin).toFixed(1), starts: fsnd.starts, miss: fsnd.miss, layers: fsnd.layersPlayed, eng: { ...eng.stats }, L: wav ? b64(Lc) : null, R: wav ? b64(Rc) : null };
  };
  // 고리 이음매: 끝→처음의 뜀이 버퍼 안의 이웃 샘플 차이(99.9 백분위)보다 크면 고리마다 딸깍 소리가 난다
  const S = await import('/src/v2/feel/sound.js'), seams = {};
  for (const k of S.LOOP_KINDS) { const d = S.loopBuf(dc, k).getChannelData(0), n = d.length, df = new Float32Array(n - 1); for (let i = 1; i < n; i++) df[i - 1] = Math.abs(d[i] - d[i - 1]); df.sort(); seams[k] = { seam: +Math.abs(d[0] - d[n - 1]).toFixed(4), p999: +df[Math.floor((n - 1) * 0.999)].toFixed(4), sec: +(n / 22050).toFixed(2) }; }
  // 기능 시험 (오프라인 컨텍스트에서 시간을 멈춰 가며): 빼앗긴 배경 고리 다시 켜기 · 느린 화면에서 울리던 큰 소리의 필터가 내려갔다 올라오기 · 고리 이동 · release
  const func = await (async () => {
    const oc = new OfflineAudioContext(2, SR * 4, SR), eng = new A.Engine(oc); eng.v2 = v2;
    const fsnd = new F.FeelSound({ eng, quality: 'high', sfx(n, o) { eng.feelCap = 10; eng.sfx(n, o); }, duck(a, t) { eng.duck(a, t); } }); fsnd.bank = bank; fsnd.bankP = Promise.resolve();
    fsnd.setListener(0, 300, -700, 0, -0.33, 0.944, 800);
    const out = {}, at = (t, fn) => oc.suspend(Math.round(t * SR / 128) * 128 / SR).then(() => { try { fn(); } catch (e) { out.error = String(e && e.message || e); } oc.resume(); });
    let id = 0, mv = 0, fl = null;
    at(0.1, () => { id = fsnd.loopStart('loop.street'); mv = fsnd.loopStart('loop.magic.fire', { x: -300, y: 40, z: 0 }); out.started = id > 0 && mv > 0 && fsnd.loops.length === 2; });
    at(0.4, () => { const h = fsnd.loops.find((x) => x.id === id); eng.steal(h.x, oc.currentTime); out.panBefore = fsnd.loops.find((x) => x.id === mv).x.node.pan.value; fsnd.loopMove(mv, { x: 400, y: 40, z: 0 }); });
    at(1.2, () => { fsnd.update(); const h = fsnd.loops.find((x) => x.id === id); out.restarted = !!h && !h.x.stolen && h.x.end > oc.currentTime + 10; out.panAfter = +fsnd.loops.find((x) => x.id === mv).x.node.pan.value.toFixed(2); });
    at(1.4, () => { fsnd.hit('great', 'armor', 'F', 18, { x: 0, y: 40, z: 0 }); fl = fsnd.filters.find((x) => x.f); out.filterOpen = fl ? Math.round(fl.f.frequency.value) : 0; });
    at(1.6, () => fsnd.setTimeScale(0.25));
    at(2.0, () => { out.filterSlow = fl ? Math.round(fl.f.frequency.value) : 0; fsnd.setTimeScale(1); });
    at(2.5, () => { out.filterBack = fl ? Math.round(fl.f.frequency.value) : 0; fsnd.loopStop(mv); out.afterStop = fsnd.loops.length; });
    at(3.0, () => { fsnd.release(); out.released = fsnd.loops.length === 0 && eng.roomSpace === null; });
    await oc.startRendering();
    return out;
  })();
  return { old: v2.stats(), neu: bank.stats(), seams, func };
}, { SR, phone: has('phone'), oldNames: used.old });
console.log('뱅크', JSON.stringify(setup));
for (const [k, v] of Object.entries(setup.seams)) if (v.seam > v.p999 * 1.5 + 0.002) fails.push(`고리 이음매가 튄다: ${k} (뜀 ${v.seam}, 이웃 차 99.9% ${v.p999})`);
{ const f = setup.func, bad = [];
  if (f.error) bad.push('오류 ' + f.error); if (!f.started) bad.push('고리 시작'); if (!f.restarted) bad.push('빼앗긴 배경 고리 다시 켜기'); if (!(f.panAfter > 0.2 && f.panBefore < 0)) bad.push(`고리 이동 팬 ${f.panBefore}→${f.panAfter}`);
  if (!(f.filterOpen > 15000 && f.filterSlow < 2500 && f.filterBack > 12000)) bad.push(`느린 화면 필터 ${f.filterOpen}→${f.filterSlow}→${f.filterBack} Hz`); if (f.afterStop !== 1) bad.push('고리 정지'); if (!f.released) bad.push('release');
  console.log('기능 시험', JSON.stringify(f)); for (const b of bad) fails.push('기능 시험 실패: ' + b); }
if (setup.neu.loaded !== Object.keys(nix.sfx).length) fails.push(`새 샘플 ${Object.keys(nix.sfx).length}개 중 ${setup.neu.loaded}개만 풀림`);

const f32 = (b) => { const u = Buffer.from(b, 'base64'); return new Float32Array(u.buffer, u.byteOffset, u.byteLength / 4); };
function writeWav(file, Lc, Rc) {
  const n = Lc.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Lc[i])) * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Rc[i])) * 32767), 46 + i * 4); }
  fs.writeFileSync(file, buf);
}
const rows = [], t0 = Date.now();
for (const j of jobs) {
  const r = await page.evaluate((a) => window.__sc(a), { lines: j.lines, dur: j.dur, q: j.q || 'high', room: j.room || 'street', wav: !!j.wav, WARM, listener: LISTENER, noOld: !!j.noOld });
  if (j.wav) {
    const base = path.join(OUT, j.id.replace('.', '_')), wav = path.join('/dev/shm/soundfeel', j.id + '.wav');
    fs.mkdirSync('/dev/shm/soundfeel', { recursive: true }); writeWav(wav, f32(r.L), f32(r.R));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'aac', '-b:a', '128k', base + '.m4a']);
    execFileSync('python3', [path.join(root, 'tools/v2/audio/spectro.py'), wav, base + '.png']);   // 로그 주파수 스펙트로그램 (눈금 포함)
    fs.unlinkSync(wav);
  }
  delete r.L; delete r.R;
  rows.push({ id: j.id, grp: j.grp, ...r });
  if (r.clip > 0 || r.peak >= -0.1) fails.push(`클리핑: ${j.id} 피크 ${r.peak} dBFS (${r.clip} 샘플)`);
  if (r.peak < -60) fails.push(`소리 없음: ${j.id} (피크 ${r.peak} dBFS)`);
  if (r.miss > 0 && !j.noOld) fails.push(`샘플 없는 층: ${j.id} (${r.miss}개)`);
  if (r.starts === 0) fails.push(`엔진이 재생하지 않음: ${j.id}`);
  if (r.pre > 0) warns.push(`리미터에 기댐: ${j.id} 마스터 앞 피크 +${r.pre} dBFS`);
}
for (const e of errs) fails.push('페이지 오류: ' + e);

// ── 4) 시험 페이지 화면 ──
if (has('shot')) {
  const p2 = await ctx.newPage(); const e2 = [];
  p2.on('pageerror', (e) => e2.push(e.message)); p2.on('console', (m) => { if (m.type() === 'error') e2.push(m.text()); });
  await p2.goto(`http://localhost:${port}/tools/v2/sound_view.html`);
  await p2.click('#unlock'); await p2.waitForFunction(() => window.__sv && window.__sv.ready, null, { timeout: 60000 });
  await p2.screenshot({ path: path.join(OUT, 'view_idle.png') });
  // 진동: 휴대폰(터치) 모드로 바꾸고 navigator.vibrate 를 가로채 무늬가 표대로 나가는지 본다
  const vib = await p2.evaluate(async () => {
    const { haptics } = await import('/src/core/haptics.js'), { feel, FLAG } = await import('/src/v2/feel/index.js');
    const calls = [], orig = navigator.vibrate; navigator.vibrate = (v) => { calls.push(v); return true; };
    const input = haptics.input, mode = input.mode; input.mode = 'touch';
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    feel.hit('sword', 'bone', 'L', 0, null); await wait(90); feel.hit('sword', 'bone', 'H', 0, null); await wait(140); feel.hit('great', 'bone', 'F', FLAG.finisher | FLAG.kill, null); await wait(300); feel.play('ui.ok'); feel.bell('toll'); await wait(300);
    input.mode = mode; navigator.vibrate = orig; haptics.reset();
    return calls;
  });
  console.log('진동 시험 (L · H · 마무리 · UI · 깊은 종)', JSON.stringify(vib));
  if (JSON.stringify(vib) !== JSON.stringify([15, [32, 40, 80], [60, 50, 120]])) fails.push('진동 무늬가 표와 다름: ' + JSON.stringify(vib));
  await p2.waitForTimeout(6500);   // 깊은 종이 다 울린 뒤에 시연을 찍는다
  await p2.click('[data-demo="combo"]'); await p2.waitForTimeout(2700);
  await p2.screenshot({ path: path.join(OUT, 'view_combo.png') });
  await p2.waitForTimeout(2500);
  await p2.click('[data-demo="spell"]'); await p2.waitForTimeout(3600);
  await p2.screenshot({ path: path.join(OUT, 'view_spell.png'), fullPage: true });
  const st = await p2.evaluate(() => window.__sv.stats());
  console.log('시험 페이지', JSON.stringify(st));
  if (!st.starts) fails.push('시험 페이지: 소리가 하나도 시작되지 않음');
  for (const e of e2) fails.push('시험 페이지 오류: ' + e);
  await p2.close();
}
await browser.close(); srv.close();

// ── 5) 보고 ──
const by = (g) => rows.filter((r) => r.grp === g);
const agg = (rs) => (rs.length ? { n: rs.length, peakMax: Math.max(...rs.map((r) => r.peak)), preMax: Math.max(...rs.map((r) => r.pre)), lufsMin: Math.min(...rs.map((r) => r.lufsM)), lufsMax: Math.max(...rs.map((r) => r.lufsM)), lenMax: Math.max(...rs.map((r) => r.len)) } : null);
const groups = [...new Set(rows.map((r) => r.grp))];
const summary = Object.fromEntries(groups.map((g) => [g, agg(by(g))]));
const strength = Object.fromEntries(T.STRENGTHS.map((s) => { const rs = rows.filter((r) => r.grp === 'hit' && r.id.endsWith('.' + s)); return [s, { lufsAvg: +(rs.reduce((a, r) => a + r.lufsM, 0) / rs.length).toFixed(1), peakAvg: +(rs.reduce((a, r) => a + r.peak, 0) / rs.length).toFixed(1) }]; }));
for (const k in layerStats) layerStats[k].avg = +(layerStats[k].sum / layerStats[k].n).toFixed(1);
const report = { when: new Date().toISOString(), phone: has('phone'), renders: rows.length, ms: Date.now() - t0, newAudio: { files: Object.keys(nix.files).length, bytes: newBytes }, banks: setup, layerStats, strength, summary, fails, warns, rows };
fs.writeFileSync(path.join(OUT, has('phone') ? 'sound_check_phone.json' : 'sound_check.json'), JSON.stringify(report, null, 1));
console.log(`렌더 ${rows.length}개 (${((Date.now() - t0) / 1000).toFixed(1)}초) · 새 소리 ${Object.keys(nix.files).length}파일 ${(newBytes / 1024).toFixed(1)} KB`);
console.log('묶음           n   피크max  앞단max  LUFS-M(최소~최대)  길이max');
for (const g of groups) { const a = summary[g]; console.log(`${g.padEnd(10)} ${String(a.n).padStart(4)}  ${a.peakMax.toFixed(1).padStart(7)}  ${a.preMax.toFixed(1).padStart(7)}  ${a.lufsMin.toFixed(1).padStart(7)} ~ ${a.lufsMax.toFixed(1).padStart(6)}  ${a.lenMax.toFixed(2).padStart(6)}s`); }
console.log('세기별 타격 평균 LUFS-M', JSON.stringify(strength));
console.log('층 수 (품질별 최대/평균)', JSON.stringify(Object.fromEntries(Object.entries(layerStats).map(([k, v]) => [k, `${v.max}/${v.avg}`]))));
for (const r of rows.filter((r) => ['space', 'demo'].includes(r.grp))) console.log(`  ${r.id.padEnd(22)} 피크 ${r.peak.toFixed(1).padStart(6)}  LUFS-M ${r.lufsM.toFixed(1).padStart(6)}  길이 ${r.len.toFixed(2)}s  고역 ${r.hf} dB  좌우 ${r.bal}  덕킹 ${r.duck} dB  층 ${r.layers}`);
if (warns.length) console.log(`경고 ${warns.length}건:\n  ` + warns.slice(0, 12).join('\n  ') + (warns.length > 12 ? `\n  … 외 ${warns.length - 12}건` : ''));
if (fails.length) { console.log(`실패 ${fails.length}건:\n  ` + fails.slice(0, 30).join('\n  ')); process.exit(1); }
console.log('통과: 클리핑 없음 · 빠진 파일 없음 · 빈 소리 없음');
