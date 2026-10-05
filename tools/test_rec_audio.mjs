// 녹음 음원 검사 — src/core/audio_rec.js (RecBank) + audio.js (RecPlayer·AudioSystem 전환) 를 헤드리스 Chromium 에서 시험한다.
// 사용: node tools/test_rec_audio.mjs [--keep-fixtures]
//  고정 자료(ffmpeg 로 만든 사인파 곡)를 assets/audio/music/ 주소에 page.route 로 대신 준다 (실제 음악 파일·목록이 있든 없든 같은 결과).
//  헤드리스 Chromium 은 AAC 를 풀지 못하므로 고정 곡은 WAV·Ogg 내용이다 (decodeAudioData 는 내용으로 형식을 안다) — window.__BN_AUDIO_CODECS 로 m4a 지원을 강제.
// 검사 항목
//  1. 녹음 곡이 시작된다 (RecPlayer, 루프 지점 = 목록 값 + 프라이밍 보정), 프라이밍 감지 (WAV 앞 2112 샘플 무음 → off = 2112/48000)
//  2. 루프가 빈틈 없이 돈다: 풀린 버퍼를 OfflineAudioContext 에서 같은 loopStart/loopEnd 로 렌더 → 루프 지점 앞뒤 10 ms RMS 와 표본 간 차이
//  3. 파일 404 → 합성 트랙, 목록 404 → 합성, 코덱 없음(AAC 못 풂) → 목록을 받지도 않고 합성
//  4. 설정 전환 (setMusicSource 'synth' ↔ 'recorded') 이 엔진을 바꾼다, 같은 곡 다시 부르기는 무시
//  5. 교차 페이드 (fade 1) 동안 두 곡, 끝나면 이전 곡 PCM 을 놓는다 (풀린 곡 ≤ 지금 + 다음)
//  6. 휴대폰 (터치 에뮬레이션): 풀기 rate ≤ 24 kHz, 상한 16 MB — 긴 곡 두 개를 차례로 틀어도 붙잡은 PCM 최대치 ≤ 상한
//  7. loop:false 곡은 한 번 울리고 끝난다 (audio.current → null)
//  8. 효과음 샘플: 목록·core 묶음이 풀린다 (m4a 실패 → ogg), 샘플 효과음 재생, 미리 받기(prefetch)
//  9. 페이지 오류·콘솔 오류 0 (일부러 만든 404 의 'Failed to load resource' 는 제외)
// 10. 실제 녹음 곡 (assets/audio/music/index.json 이 있으면): 곡 몇 개를 ffmpeg 로 WAV 로 풀어(프라이밍은 ffmpeg 가 자름) 실제 목록과 함께 주고,
//     실제 루프 지점에서 이음매 앞뒤 RMS 가 이어지는지·이음매 표본 차가 곡 안의 보통 차이 수준인지 본다 (--real a,b 로 곡 고르기)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FX = '/tmp/claude-0/audio_rt/fixtures';
const SR = 48000, PRIMING = 2112;
const fails = [], infos = [];
const ok = (c, m) => { (c ? infos : fails).push(m); console.log(`${c ? '✓' : '✗'} ${m}`); };

// ── 고정 자료 ──
function ff(args) { execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]); }
function fixtures() {
  fs.mkdirSync(FX, { recursive: true });
  // title: 6 초, 왼쪽 220 Hz · 오른쪽 330 Hz (루프 4 초 = 정수 주기 → 이음매가 매끈해야 한다), 앞에 인코더 프라이밍 무음 2112 샘플
  ff(['-f', 'lavfi', '-i', `sine=frequency=220:sample_rate=${SR}:duration=6`, '-f', 'lavfi', '-i', `sine=frequency=330:sample_rate=${SR}:duration=6`,
    '-filter_complex', `[0][1]amerge=inputs=2,volume=2,adelay=${PRIMING}S|${PRIMING}S[a]`, '-map', '[a]', '-c:a', 'pcm_s16le', `${FX}/title.wav`]);
  // hub: 3 초 노이즈 (Ogg) · victory: 2 초 (loop:false) · 긴 곡 2개 (휴대폰 상한 시험, 75 초·60 초)
  ff(['-f', 'lavfi', '-i', `anoisesrc=d=3:c=pink:r=${SR}:a=0.3`, '-ac', '2', '-c:a', 'libvorbis', '-q:a', '2', `${FX}/hub.ogg`]);
  ff(['-f', 'lavfi', '-i', `sine=frequency=523:sample_rate=${SR}:duration=2`, '-ac', '2', '-c:a', 'libvorbis', '-q:a', '2', `${FX}/victory.ogg`]);
  ff(['-f', 'lavfi', '-i', `anoisesrc=d=75:c=brown:r=${SR}:a=0.2`, '-ac', '2', '-c:a', 'libvorbis', '-q:a', '0', `${FX}/long1.ogg`]);
  ff(['-f', 'lavfi', '-i', `anoisesrc=d=60:c=pink:r=${SR}:a=0.2`, '-ac', '2', '-c:a', 'libvorbis', '-q:a', '0', `${FX}/long2.ogg`]);
  // 계약 형식 그대로의 m4a 도 하나 (실제 브라우저용; 헤드리스는 못 풂 → 코덱 시험)
  ff(['-i', `${FX}/hub.ogg`, '-c:a', 'aac', '-b:a', '96k', `${FX}/hub.m4a`]);
  const size = (f) => (fs.existsSync(`${FX}/${f}`) ? fs.statSync(`${FX}/${f}`).size : 400000);
  const T = (file, duration, extra = {}) => ({ file, bytes: size(file), duration, loop: true, loopStart: 0, loopEnd: duration, priming: 0, lufs: -16, peak: -1, ...extra });
  const index = {
    version: 1, rate: SR, format: 'm4a',
    tracks: {
      title: T('title.wav', 6, { loopStart: 1, loopEnd: 5, priming: PRIMING, lufs: -12 }),
      hub: T('hub.ogg', 3, { loopStart: 0.5, loopEnd: 2.5 }),
      victory: T('victory.ogg', 2, { loop: false }),
      s01: T('missing.m4a', 40),
      worldmap: T('long1.ogg', 75, { loopStart: 2, loopEnd: 74 }),
      worldmap2: T('long2.ogg', 60, { loopStart: 1, loopEnd: 59 }),
    },
    alias: { inn: 'hub' },
  };
  fs.writeFileSync(`${FX}/index.json`, JSON.stringify(index, null, 1));
  return index;
}

const index = fixtures();
const srv = await start(0);
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

/** 새 페이지: 시험용 빈 문서에서 audio.js 를 불러 둔다. route: 음악 목록·파일을 고정 자료로 (missing → 404) */
async function open({ mobile = false, codecs = ['m4a', 'ogg'], noIndex = false, real = null } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } : {});
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  if (codecs) await page.addInitScript((c) => { window.__BN_AUDIO_CODECS = c; }, codecs);
  await page.route('**/assets/audio/music/**', (r) => {
    const f = new URL(r.request().url()).pathname.split('/').pop();
    if (f === 'index.json' && noIndex) return r.fulfill({ status: 404, body: '' });
    if (real) { const w = real[f] || (f === 'index.json' ? path.join(root, 'assets/audio/music/index.json') : null); return w ? r.fulfill({ status: 200, contentType: 'application/octet-stream', body: fs.readFileSync(w) }) : r.fulfill({ status: 404, body: '' }); }
    const p = path.join(FX, f);
    if (!fs.existsSync(p)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: f.endsWith('.json') ? 'application/json' : 'audio/mp4', body: fs.readFileSync(p) });
  });
  await page.route('**/__test_rec__.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>rec test</title>' }));
  await page.goto(`http://localhost:${port}/__test_rec__.html`);
  await page.evaluate(async () => { const A = await import('/src/core/audio.js'); window.A = A; window.audio = A.audio; A.audio.unlock(); });
  return { ctx, page, errs };
}
const until = async (page, fn, arg, ms = 8000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await new Promise((r) => setTimeout(r, 50));
  }
};

try {
  // ── 데스크톱: 시작·루프·전환·404·교차 페이드·loop:false·효과음 ──
  {
    const { ctx, page, errs } = await open();
    await page.evaluate(() => audio.music('title'));
    const st = await until(page, () => { const s = audio.recStats(); return s.player?.rec ? s : null; });
    ok(!!st, `1. 녹음 곡 시작 (title → RecPlayer, 프로필 ${st?.profile}, 풀기 ${st?.tracks?.title?.rate} Hz)`);
    const p = await page.evaluate(() => { const p = audio.player; return p?.src ? { loop: p.src.loop, ls: p.src.loopStart, le: p.src.loopEnd, sr: p.src.buffer.sampleRate, ch: p.src.buffer.numberOfChannels, len: p.src.buffer.length, off: p.ent.off } : null; });
    const off = PRIMING / SR;
    ok(p && p.loop && Math.abs(p.off - off) < 1e-6 && Math.abs(p.ls - (1 + off)) < 1e-6 && Math.abs(p.le - (5 + off)) < 1e-6,
      `1. 프라이밍 감지·루프 지점 (off ${p?.off?.toFixed(5)} = ${off.toFixed(5)}, loop ${p?.ls?.toFixed(4)}–${p?.le?.toFixed(4)})`);
    // 2. 루프 이음매: 같은 버퍼를 오프라인으로 렌더 (루프 끝 0.25 초 전부터 0.5 초)
    const seam = await page.evaluate(async () => {
      const e = audio.rec.entry('title'), b = e.buf, sr = b.sampleRate;
      const oc = new OfflineAudioContext(2, Math.ceil(sr * 0.5), sr), s = oc.createBufferSource();
      s.buffer = b; s.loop = true; s.loopStart = e.ls; s.loopEnd = e.le; s.connect(oc.destination); s.start(0, e.le - 0.25);
      const out = await oc.startRendering(), L = out.getChannelData(0), R = out.getChannelData(1);
      const w = Math.round(sr * 0.01), wrap = Math.round(sr * 0.25);
      const rms = (a, i0) => { let q = 0; for (let i = i0; i < i0 + w; i++) q += a[i] * a[i]; return Math.sqrt(q / w); };
      let minR = 1e9, maxR = 0;
      for (let i = 0; i + w <= L.length; i += w >> 1) { const r = rms(L, i); minR = Math.min(minR, r); maxR = Math.max(maxR, r); }
      let jumpWrap = 0, jumpMax = 0;
      for (let i = 1; i < L.length; i++) { const d = Math.max(Math.abs(L[i] - L[i - 1]), Math.abs(R[i] - R[i - 1])); jumpMax = Math.max(jumpMax, d); if (Math.abs(i - wrap) < 3) jumpWrap = Math.max(jumpWrap, d); }
      return { minR, maxR, jumpWrap, jumpMax, before: rms(L, wrap - w), after: rms(L, wrap) };
    });
    ok(seam && seam.minR > 0.9 * seam.maxR && seam.jumpWrap <= seam.jumpMax * 1.01 && Math.abs(seam.before - seam.after) < 0.02 * seam.maxR,
      `2. 루프 이음매 빈틈 없음 (10 ms RMS ${seam?.minR.toFixed(4)}–${seam?.maxR.toFixed(4)}, 이음매 표본 차 ${seam?.jumpWrap.toFixed(5)} ≤ 최대 ${seam?.jumpMax.toFixed(5)})`);
    // 실시간 재생도 루프 지점을 넘어간다 (5 초 뒤에도 같은 RecPlayer, 끝나지 않음)
    // 4. 같은 곡 다시 → 무시, 설정 전환
    const same = await page.evaluate(() => { const p = audio.player; audio.music('title'); return audio.player === p; });
    ok(same, '4. 같은 곡 다시 부르기는 무시');
    await page.evaluate(() => audio.setMusicSource('synth'));
    const syn = await until(page, () => { const s = audio.recStats(); return s.player && !s.player.rec && s.source === 'synth' ? s : null; });
    ok(!!syn, `4. setMusicSource('synth') → 합성 트랙 (${syn?.player?.id})`);
    await page.evaluate(() => audio.setMusicSource('recorded'));
    const rec2 = await until(page, () => { const s = audio.recStats(); return s.player?.rec && s.source === 'recorded' ? s : null; });
    ok(!!rec2, '4. setMusicSource(\'recorded\') → 다시 녹음 곡');
    // 5. 교차 페이드 + 별칭 (inn → hub)
    await page.evaluate(() => audio.music('inn', { fade: 1 }));
    const xf = await until(page, () => { const ps = audio.eng.players; return audio.player?.rec && audio.player.id === 'inn' && ps.length === 2 ? { n: ps.length, ids: ps.map((p) => p.id), dec: audio.rec.dec.size } : null; });
    ok(!!xf, `5. 교차 페이드 중 두 곡 (${xf?.ids?.join(' → ')}), 별칭 inn → hub 녹음`);
    const after = await until(page, () => { const s = audio.recStats(); return audio.eng.players.length === 1 && !s.tracks.title ? s : null; }, null, 6000);
    ok(!!after, `5. 페이드가 끝나면 이전 곡 PCM 을 놓는다 (남은 곡 ${after ? Object.keys(after.tracks).join(',') : '?'}, ${((after?.bytes ?? 0) / 1048576).toFixed(2)} MB)`);
    // 3. 파일 404 → 합성
    await page.evaluate(() => audio.music('s01'));
    const f404 = await until(page, () => { const s = audio.recStats(); return s.player?.id === 's01' ? s : null; }, null, 8000);
    ok(f404 && !f404.player.rec, `3. 파일 404 → 합성 트랙 (s01 rec=${f404?.player?.rec})`);
    // 7. loop:false
    await page.evaluate(() => audio.music('victory'));
    const vic = await until(page, () => { const s = audio.recStats(); return s.player?.id === 'victory' && s.player.rec ? s : null; });
    const ended = vic && await until(page, () => (audio.current === null && !audio.player ? true : null), null, 6000);
    ok(!!vic && !!ended, `7. loop:false 곡은 한 번 울리고 끝난다 (녹음 ${!!vic}, 끝 ${!!ended})`);
    // 8. 효과음 샘플
    const sx = await until(page, () => { const s = audio.recStats().sfx; return s.loaded >= 20 ? s : null; }, null, 10000);
    ok(!!sx, `8. 효과음 샘플 core 묶음 (${sx?.loaded}/${sx?.names}종, 형식 ${sx?.fmt}, ${((sx?.bytes ?? 0) / 1024).toFixed(0)} KB)`);
    const sp = await page.evaluate(() => {
      const e = audio.eng, c = e.ctx, f = c.createBufferSource.bind(c); let n = 0;
      c.createBufferSource = (...a) => { n++; return f(...a); };
      const sm = audio.rec.sample('hit_heavy'); audio.sfx('hit_heavy'); const withSample = n; n = 0;
      audio.sfx('ghost'); const synthOnly = n;
      c.createBufferSource = f;
      return { has: !!sm, s: sm?.s, withSample, synthOnly };
    });
    ok(sp.has && sp.withSample >= 2 && sp.synthOnly >= 0, `8. 샘플 효과음 재생 (hit_heavy: 버퍼 소스 ${sp.withSample}개, 합성 몫 ${sp.s})`);
    await page.evaluate(() => audio.prefetch('hub'));
    const pf = await until(page, () => { const s = audio.recStats(); return s.next === 'hub' ? s : null; });
    ok(!!pf, `8. prefetch('hub') → 다음 곡 (${pf?.next}, 풀림 ${!!pf?.tracks?.hub})`);
    const t0 = await page.evaluate(() => audio.recStats());
    ok(t0.peak <= t0.cap && Object.keys(t0.tracks).length <= 2, `5. 풀린 곡 ≤ 지금 + 다음 (${Object.keys(t0.tracks).join(',') || '없음'}), 최대 ${(t0.peak / 1048576).toFixed(2)} MB ≤ ${(t0.cap / 1048576).toFixed(0)} MB`);
    ok(errs.length === 0, `9. 데스크톱 페이지 오류 0 ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  // ── 목록 404 · 코덱 없음 ──
  {
    const { ctx, page, errs } = await open({ noIndex: true });
    await page.evaluate(() => audio.music('title'));
    const s = await until(page, () => { const s = audio.recStats(); return s.player ? s : null; }, null, 6000);
    ok(s && !s.player.rec && s.index === 'off', `3. 목록 404 → 합성 (index ${s?.index}, why ${s?.why})`);
    ok(errs.length === 0, `9. 목록 404 페이지 오류 0 ${errs.join(' | ')}`);
    await ctx.close();
  }
  {
    const { ctx, page, errs } = await open({ codecs: null });
    const reqs = [];
    page.on('request', (r) => { if (/assets\/audio\/music\//.test(r.url())) reqs.push(r.url()); });
    await page.evaluate(() => audio.music('title'));
    const s = await until(page, () => { const s = audio.recStats(); return s.player ? s : null; }, null, 6000);
    const sx = await until(page, () => { const x = audio.recStats().sfx; return x.loaded >= 20 ? x : null; }, null, 10000);
    ok(s && !s.player.rec && s.why === 'codec' && reqs.length === 0, `3. AAC 를 못 푸는 브라우저 → 목록도 받지 않고 합성 (why ${s?.why}, 음악 요청 ${reqs.length}건)`);
    ok(sx?.fmt === 'ogg', `8. 효과음은 ogg 로 (${sx?.fmt}, ${sx?.loaded}종)`);
    ok(errs.length === 0, `9. 코덱 없음 페이지 오류 0 ${errs.join(' | ')}`);
    await ctx.close();
  }
  // ── 휴대폰: rate·상한 ──
  {
    const { ctx, page, errs } = await open({ mobile: true });
    await page.evaluate(() => audio.music('worldmap'));
    const a = await until(page, () => { const s = audio.recStats(); return s.player?.rec ? s : null; }, null, 15000);
    ok(a && (a.profile === 'phone' || a.profile === 'low') && a.cap === 16 * 1048576 && a.tracks.worldmap?.rate <= 24000,
      `6. 휴대폰 프로필 (${a?.profile}, 상한 ${((a?.cap ?? 0) / 1048576)} MB, worldmap 75 초 → ${a?.tracks?.worldmap?.rate} Hz ${((a?.tracks?.worldmap?.bytes ?? 0) / 1048576).toFixed(2)} MB)`);
    await page.evaluate(() => audio.music('worldmap2', { fade: 0.6 }));
    const b = await until(page, () => { const s = audio.recStats(); return s.player?.rec && s.player.id === 'worldmap2' ? s : null; }, null, 15000);
    const mb = (x) => ((x ?? 0) / 1048576).toFixed(2);
    ok(b && b.peak <= b.cap, `6. 긴 곡 두 개를 차례로: 붙잡은 PCM 최대 ${mb(b?.peak)} MB ≤ ${mb(b?.cap)} MB (지금 ${mb(b?.bytes)} MB, 풀기 ${b?.decodes}번)`);
    await page.evaluate(() => audio.prefetch('worldmap'));
    await page.waitForTimeout(1500);
    const c = await page.evaluate(() => audio.recStats());
    ok(c.peak <= c.cap && c.bytes <= c.cap, `6. 미리 받기는 상한을 넘기지 않는다 (풀린 곡 ${Object.keys(c.tracks).join(',')}, ${mb(c.bytes)} MB, 압축 ${c.raw.join(',')})`);
    ok(errs.length === 0, `9. 휴대폰 페이지 오류 0 ${errs.join(' | ')}`);
    await ctx.close();
  }
  // ── 실제 녹음 곡의 루프 이음매 ──
  const realIx = path.join(root, 'assets/audio/music/index.json');
  if (fs.existsSync(realIx)) {
    const ix = JSON.parse(fs.readFileSync(realIx, 'utf8'));
    const argI = process.argv.indexOf('--real');
    const ids = (argI > 0 ? process.argv[argI + 1].split(',') : ['title', 's01', 'boss', 'hub']).filter((id) => ix.tracks?.[id] && fs.existsSync(path.join(root, 'assets/audio/music', ix.tracks[id].file)));
    const real = {};
    for (const id of ids) { const w = `${FX}/real_${id}.wav`; ff(['-i', path.join(root, 'assets/audio/music', ix.tracks[id].file), '-c:a', 'pcm_f32le', w]); real[ix.tracks[id].file] = w; }
    const { ctx, page, errs } = await open({ real });
    for (const id of ids) {
      await page.evaluate((id) => audio.music(id), id);
      const st = await until(page, (id) => { const s = audio.recStats(); return s.player?.id === id && s.player.rec ? s : null; }, id, 15000);
      const seam = st && await page.evaluate(async (id) => {
        const e = audio.rec.entry(id), b = e.buf, sr = b.sampleRate;
        const oc = new OfflineAudioContext(b.numberOfChannels, Math.ceil(sr * 0.4), sr), s = oc.createBufferSource();
        s.buffer = b; s.loop = true; s.loopStart = e.ls; s.loopEnd = e.le; s.connect(oc.destination); s.start(0, e.le - 0.2);
        const out = await oc.startRendering(), L = out.getChannelData(0), wrap = Math.round(sr * 0.2), w = Math.round(sr * 0.02);
        const rms = (i0) => { let q = 0; for (let i = i0; i < i0 + w; i++) q += L[i] * L[i]; return Math.sqrt(q / w); };
        const d = []; for (let i = 1; i < L.length; i++) d.push(Math.abs(L[i] - L[i - 1]));
        const sorted = [...d].sort((a, b) => a - b), p99 = sorted[Math.floor(sorted.length * 0.99)];
        let jw = 0; for (let i = wrap - 2; i <= wrap + 2; i++) jw = Math.max(jw, d[i - 1] ?? 0);
        return { before: rms(wrap - w), after: rms(wrap), jw, p99, ls: e.ls, le: e.le, rate: sr, off: e.off };
      }, id);
      const rr = seam ? Math.max(seam.before, seam.after) / Math.max(1e-6, Math.min(seam.before, seam.after)) : 0;
      ok(!!seam && seam.jw <= Math.max(seam.p99 * 3, 0.02) && rr < 2.5,
        `10. 실제 곡 ${id}: 루프 ${seam?.ls?.toFixed(3)}–${seam?.le?.toFixed(3)} s (${seam?.rate} Hz, off ${seam?.off}), 이음매 앞뒤 20 ms RMS ${seam?.before?.toFixed(3)}/${seam?.after?.toFixed(3)}, 이음매 표본 차 ${seam?.jw?.toFixed(4)} (곡 안 99% ${seam?.p99?.toFixed(4)})`);
    }
    ok(errs.length === 0, `9. 실제 곡 페이지 오류 0 ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  } else console.log('· assets/audio/music/index.json 없음 — 실제 곡 검사(10)는 건너뜀');
} catch (e) {
  fails.push('예외: ' + (e?.stack || e));
  console.log('✗ 예외: ' + (e?.stack || e));
}
await browser.close();
srv.close();
if (!process.argv.includes('--keep-fixtures')) fs.rmSync(FX, { recursive: true, force: true });
console.log(fails.length ? `실패 ${fails.length}건 / ${fails.length + infos.length}` : `통과 ${infos.length}/${infos.length}`);
process.exitCode = fails.length ? 1 : 0;
