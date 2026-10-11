// 효과음 레지스트리 검증 — 등록된 모든 효과음을 헤드리스 Chromium 의 OfflineAudioContext 로 하나씩 렌더해 검사한다.
// 사용: node tools/test_sfx.mjs [--only a,b] [--levels] [--json 파일] [--calibrate]
//  --levels     이름별 피크·단기 RMS·길이·노드 수 표 출력 (음량 보정용)
//  --json       결과 전체를 파일로 저장
//  --calibrate  녹음 샘플 음량(g)을 합성음과 같은 크기가 되게 맞춰 assets/audio/sfx/index.json 에 쓴다 (tools/audio/sfx/build_sfx.py 뒤에)
// 검사 항목
//  1. 레지스트리: 내장 73종(§1.9 표의 '76' 은 오기, 목록은 73개 +_default) + 체감 45종(sfx_feel.js) + 동료 31종(audio_companions.js 가 하나라도 등록했으면 전부 필수), 이름 충돌 없음
//  2. sfx_feel.js 가 audio.js 를 import 하지 않음 (순환 금지)
//  3. API: defineSfx(name, def, vol) / SFX_KIT {T, N, R} / fn(S, H) 의 H = {T, N, FM, ARP, BOOM, CRACKLE, mtof, R} / audio 도우미
//  4. 체감 예산: 100ms 창 상한(10·8·6), prio 예외, hit* 7개 이상이면 재질 레이어 생략, stopName
//  5. 렌더: 예외·NaN 없음, 무음 아님, 클리핑 없음, 꼬리가 사라짐(멈추지 않는 소리 없음), 길이·노드 수 예산, 체감 효과음 음량 범위
//  6. 녹음 샘플 (assets/audio/sfx/index.json, 헤드리스는 ogg 로 푼다): 매핑된 이름이 모두 등록된 효과음, 파일이 모두 있음, 합계 ≤ 3 MB,
//     샘플을 얹은 렌더도 5 의 검사 + 단기 RMS 가 합성음만일 때의 0.6~1.6배 (같은 호출 음량에서 크기가 크게 달라지지 않게)
//  7. 고급 효과음 v2 시범 (assets/audio/sfx_v2, 스위치 pilot.sfx2 — docs/specs/anime_motion_sfx.md §4·§5.1):
//     이름이 모두 등록된 효과음 · 변형 3~5개 · 파일(m4a·ogg) 모두 있음 · 합계 ≤ 1.2 MB · 빌드가 잰 사건 라우드니스 -19~-14.5 LUFS, 트루 피크 ≤ -1 dBTP ·
//     푼 ogg 피크 ≤ -0.5 dBFS · 변형마다 엔진 렌더: 합성음 층이 한 번도 안 울림(합성 단독 0) + 5 의 검사 + 지금 게임 소리(샘플+합성)와 K-가중 순간 라우드니스 ±1.5 dB ·
//     실행 규칙(같은 변형 연달아 안 나옴, 모든 변형 쓰임, 품질 low 면 방 잔향 끔, pan, 화면 x → pan, theme → 공간) · 노드 수 (v2 대 지금) 표
//     --calibrate-v2  v2 g 를 지금 게임 소리 크기에 맞춰 assets/audio/sfx_v2/index.json 에 쓴다 (build_sfx_v2.py 뒤에 — 공정한 A/B: 더 커서 좋게 들리는 일 없게)
//     --ref <커밋>     스위치 꺼짐 = 지금과 같음: 그 커밋의 audio.js 와 지금 audio.js 로 모든 효과음을 같은 난수열로 렌더 — 노드 그래프·난수 호출 수가 같고
//                     렌더 차이 ≤ 1e-5 (-100 dBFS; OfflineAudioContext 는 같은 코드도 렌더마다 float 반올림이 흔들려 바이트 비교는 못 한다)
//     --no-v2         7 을 건너뜀
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));

// MASTER_PLAN §1.9 이름 표
const BASE = 'whip whip_crack slash slash_heavy gun shotgun dagger axe cross holywater_burn stopwatch magic holy fire ice thunder dark hit hit_heavy crit clang enemy_die explode jump double_jump land footstep dash mist splash hurt death heart coin item powerup levelup extra_life chest heal save candle door break_wall secret bell clock_tick thunderclap bat ghost boss_roar boss_die warning ult combo charge_ready enhance_hit enhance_success enhance_fail enhance_destroy dice card slot_spin slot_win win lose coin_insert ready go menu_move menu_ok menu_cancel type'.split(' ');
const FEEL = 'step_stone step_dirt step_wood step_metal step_snow step_water step_bone step_flesh step_push skid pivot land_heavy dash_burst launch wall_bounce ground_bounce down_hit counter back_attack hit_flesh hit_bone hit_ghost hit_stone impact_crack kill_slowmo rank_up announce combo_milestone ult_impact impact_frame awaken_hold awaken_charge cutin_whoosh brush_stroke seal_stamp eye_glint awaken_stinger awaken_boom heartbeat crow_caw finger_snap cylinder_spin choir_gate war_horn sheath'.split(' ');
const CMP = 'summon dismiss mount_up neigh gallop hoof_land boar_grunt wolf_howl wolf_bite wing_flap roar_small fire_breath screech bone_rattle fairy_chime knight_guard imp_cackle owl_hoot gear_whir scythe soul_reap egg_crack companion_join bond_up knock_off assist stag_call griffin_cry mirror_chime jelly_zap momo_gulp'.split(' ');

const fails = [], warns = [], infos = [];
const fail = (m) => fails.push(m), warn = (m) => warns.push(m), info = (m) => infos.push(m);

// ── 정적 검사: sfx_feel.js 는 audio.js 를 import 하면 안 된다 ──
{
  const src = fs.readFileSync(path.join(root, 'src/core/sfx_feel.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  if (/\b(?:import|export)\b[^;]*?['"][^'"]*\baudio\.js['"]/.test(src) || /\bimport\s*\(\s*['"][^'"]*\baudio\.js['"]/.test(src)) fail('sfx_feel.js 가 audio.js 를 import(또는 re-export) 함 (순환 금지)');
  const other = [...src.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] || m[2]);
  if (other.length) warn(`sfx_feel.js 의 import: ${other.join(', ')} (간접 순환 여부 확인 필요)`);
}
for (const n of FEEL) if (BASE.includes(n) || CMP.includes(n)) fail(`체감 이름 충돌: ${n}`);
for (const n of CMP) if (BASE.includes(n)) fail(`동료 이름 충돌: ${n}`);

const srv = await start(0);
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext()).newPage();
const pageErrs = [];
page.on('pageerror', (e) => pageErrs.push('PAGEERROR ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error') pageErrs.push('CONSOLE ' + t.slice(0, 300));
  else if (m.type() === 'warning' && !t.includes("defineSfx: 'hit'")) warn('콘솔 경고: ' + t.slice(0, 200));
});
await page.route('**/__test_sfx__.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>sfx test</title>' }));
await page.goto(`http://localhost:${port}/__test_sfx__.html`);

const only = args.only ? String(args.only).split(',') : null;
// 페이지 평가가 통째로 실패해도(모듈 문법 오류 등) 브라우저·서버를 닫고 실패로 보고한다
const res = await page.evaluate(async ({ only, FEEL, V2 }) => {
  const out = { api: [], budget: [], renders: {}, names: [], cmpErr: null };
  const ok = (cond, msg) => { if (!cond) out.api.push(msg); };
  const A = await import('/src/core/audio.js');
  const F = await import('/src/core/sfx_feel.js');
  try { await import('/src/core/audio_companions.js'); } catch (e) { out.cmpErr = String(e && e.message || e); }
  const { SFX, Engine, defineSfx, SFX_KIT, audio } = A;
  out.names = Object.keys(SFX);
  out.layers = Object.keys(SFX).filter((n) => SFX[n].layer === 'hit');
  out.feelNames = F.FEEL_SFX_NAMES;
  // ── API ──
  ok(typeof defineSfx === 'function', 'defineSfx export 없음');
  ok(SFX_KIT && ['T', 'N', 'R'].every((k) => typeof SFX_KIT[k] === 'function'), 'SFX_KIT 에 T/N/R 함수 없음');
  for (const n of FEEL) ok(SFX[n] && SFX[n] === F.FEEL_SFX[n], `SFX 에 체감 효과음 ${n} 이(가) 병합되지 않음`);
  for (const [n, d] of Object.entries(SFX)) {
    if (typeof d.fn !== 'function') { out.api.push(`${n}: fn 없음`); continue; }
    for (const k of ['max', 'gap', 'rev', 'vary', 'vol', 'lead']) if (d[k] != null && !(Number.isFinite(d[k]) && d[k] >= 0)) out.api.push(`${n}.${k} 값 이상: ${d[k]}`);
    if (d.max != null && d.max < 1) out.api.push(`${n}.max < 1`);
    if (d.rev != null && d.rev > 1) out.api.push(`${n}.rev > 1`);
    if (d.duck != null && !(Array.isArray(d.duck) && d.duck.length === 2 && d.duck.every(Number.isFinite))) out.api.push(`${n}.duck 형식 이상`);
    if (d.layer != null && d.layer !== 'hit') out.api.push(`${n}.layer 알 수 없음: ${d.layer}`);
  }
  if (typeof defineSfx === 'function') {
    const hitDef = SFX.hit;
    ok(defineSfx('hit', { fn() {} }, 1) === false && SFX.hit === hitDef, 'defineSfx 가 내장 이름(hit)을 덮어씀');
    ok(defineSfx('', { fn() {} }) === false, 'defineSfx 가 빈 이름을 받음');
    ok(defineSfx('__probe_bad', {}) === false && !SFX.__probe_bad, 'defineSfx 가 fn 없는 정의를 받음');
    let probe = null;
    ok(defineSfx('__probe', { max: 1, fn(S, H) { probe = H; H.T(S, 'sine', 440, 0, 0, 0.1, 0.2); } }, 1.7) === true, 'defineSfx 등록 실패');
    ok(SFX.__probe && SFX.__probe.vol === 1.7, 'defineSfx 의 vol 이 반영되지 않음');
    ok(defineSfx('__probe', { fn(S, H) { probe = H; H.N(S, 0, 0.05, 0.2); } }) === true, 'defineSfx 가 같은 외부 이름 재등록을 거부');
    const oc = new OfflineAudioContext(2, 4410, 44100), eng = new Engine(oc);
    eng.sfx('__probe');
    const need = ['T', 'N', 'FM', 'ARP', 'BOOM', 'CRACKLE', 'mtof', 'R'];
    ok(probe && need.every((k) => typeof probe[k] === 'function'), `fn(S, H) 의 H 에 ${need.join('/')} 가 모두 있어야 함 (받은 값: ${probe ? Object.keys(probe).join(',') : '없음'})`);
    ok(probe === SFX_KIT, 'H 와 SFX_KIT 이 같은 객체가 아님');
    delete SFX.__probe;
    // 경계: 프로토타입 이름·이상한 이름·음수 vol, throw 하는 정의, 프로토타입 이름 재생
    ok(defineSfx('__proto__', { fn() {} }) === false && Object.getPrototypeOf(SFX) === Object.prototype, "defineSfx('__proto__') 가 SFX 프로토타입을 바꿈");
    ok(defineSfx('bad name', { fn() {} }) === false && !('bad name' in SFX), 'defineSfx 가 공백 들어간 이름을 받음');
    ok(defineSfx('__probe_neg', { vol: 1, fn() {} }, -2) === true && SFX.__probe_neg.vol === 1, 'defineSfx 가 음수 vol 을 반영함');
    delete SFX.__probe_neg;
    defineSfx('__probe_throw', { fn(S, H) { H.T(S, 'sine', 440, 0, 0, 0.1, 0.2); throw new Error('probe'); } });
    const e3 = new Engine(new OfflineAudioContext(2, 4410, 44100));
    let threw = false; try { e3.sfx('__probe_throw'); } catch { threw = true; }
    ok(threw && e3.live.some((x) => x.name === '__probe_throw'), 'fn 이 throw 하면 이미 만든 소리가 live 로 추적되지 않음 (노드 누수)');
    delete SFX.__probe_throw;
    let protoErr = null;
    for (const n of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) { try { e3.sfx(n); } catch (e) { protoErr = `${n}: ${e.message}`; } }
    ok(!protoErr, `프로토타입 이름 재생이 _default 로 가지 않고 오류: ${protoErr}`);
    ok(!audio.has('constructor') && audio.lead('constructor') === 0, 'audio.has/lead 가 프로토타입 이름을 등록된 것으로 봄');
  }
  for (const k of ['liveCount', 'stopSfx', 'has', 'lead', 'setQuality']) ok(typeof audio[k] === 'function', `audio.${k} 없음`);
  ok(audio.has('step_stone') && !audio.has('__nope__') && !audio.has('_default'), 'audio.has 결과 이상');
  ok(audio.lead('awaken_stinger') === 0.4 && audio.lead('hit') === 0, 'audio.lead 결과 이상');
  ok(audio.stats && Number.isFinite(audio.stats.starts), 'audio.stats 없음');
  ok(audio.quality === 'high', `audio.quality 기본값 이상: ${audio.quality}`);
  audio.setQuality('low'); ok(audio.quality === 'low', 'audio.setQuality 무시됨'); audio.setQuality(null); ok(audio.quality === 'high', 'audio.setQuality(null) 복원 실패');
  audio.setQuality('constructor'); ok(audio.quality === 'high', "audio.setQuality('constructor') 가 받아들여짐"); audio.setQuality(null);
  // 품질 추종: world.fx.quality → game.quality('auto' 조절값) → settings.quality
  const g0 = window.__game;
  window.__game = { world: { fx: { quality: 0.75 } }, quality: 'low', settings: { quality: 'high' } }; ok(audio.quality === 'medium', `fx.quality 0.75 → medium 이어야 함 (${audio.quality})`);
  window.__game = { world: null, quality: 'low', settings: { quality: 'auto' } }; ok(audio.quality === 'low', `월드 없을 때 game.quality 를 따라야 함 (${audio.quality})`);
  window.__game = { settings: { quality: 'medium' } }; ok(audio.quality === 'medium', `settings.quality 를 따라야 함 (${audio.quality})`);
  window.__game = g0;
  // ── 체감 예산 ──
  const B = (m) => out.budget.push(m);
  {
    const pool = FEEL.filter((n) => !SFX[n].prio && SFX[n].layer !== 'hit');
    for (const cap of [10, 8, 6]) {
      const eng = new Engine(new OfflineAudioContext(2, 4410, 44100)); eng.feelCap = cap;
      for (const n of pool.slice(0, 14)) eng.sfx(n);
      if (eng.live.length !== cap || eng.stats.dropped !== 14 - cap) B(`상한 ${cap}: 시작 ${eng.live.length}, 누락 ${eng.stats.dropped} (기대 ${cap}/${14 - cap})`);
      eng.sfx('ult_impact');
      if (!eng.live.some((x) => x.name === 'ult_impact')) B(`상한 ${cap}: prio(ult_impact)가 예산에 막힘`);
      eng.sfx('hit'); eng.sfx('footstep');
      if (eng.live.length !== cap + 3) B(`상한 ${cap}: 체감 외 효과음(hit/footstep)이 예산에 막힘`);
    }
    const eng = new Engine(new OfflineAudioContext(2, 4410, 44100));
    [0.5, 0.6, 0.7, 0.8].forEach((v) => eng.sfx('hit', { vol: v }));
    [0.5, 0.6].forEach((v) => eng.sfx('hit_heavy', { vol: v }));
    eng.sfx('hit_flesh');
    if (eng.stats.skipped !== 0 || !eng.live.some((x) => x.name === 'hit_flesh')) B('hit* 6개(+레이어 없음)일 때 재질 레이어가 생략됨');
    eng.sfx('hit_heavy', { vol: 0.9 }); eng.sfx('hit_bone');
    if (eng.stats.skipped !== 1 || eng.live.some((x) => x.name === 'hit_bone')) B(`hit* 8개일 때 재질 레이어가 생략되지 않음 (skipped ${eng.stats.skipped})`);
    eng.sfx('impact_crack');
    if (!eng.live.some((x) => x.name === 'impact_crack')) B('impact_crack(레이어 아님)이 생략됨');
    const e2 = new Engine(new OfflineAudioContext(2, 4410, 44100));
    e2.sfx('awaken_hold'); const x = e2.live.find((y) => y.name === 'awaken_hold'); e2.stopName('awaken_hold');
    if (!x || x.end > 0.07) B('stopName 이 소리를 멈추지 않음');
    if (e2.liveCount('awaken') !== 1 || e2.liveCount('zzz') !== 0) B('liveCount 결과 이상');
    e2.sfx('awaken_hold'); // 홀드 취소 직후 다시 홀드 — gap(0.2초)에 막히면 안 된다
    if (e2.live.filter((y) => y.name === 'awaken_hold').length !== 2) B('stopName 직후 같은 소리를 다시 재생하면 gap 에 막힘');
  }
  // ── 렌더 ──
  // DELAY 0.6: 마스터 컴프레서가 렌더 시작 후 ~0.5초 동안 짧은 소리를 30~45% 작게 내므로 정상 상태(게임에서 듣는 음량)에서 잰다
  const SR = 44100, DELAY = 0.6;
  out.unknownOnly = (only || []).filter((n) => !Object.prototype.hasOwnProperty.call(SFX, n));
  const names = (only || Object.keys(SFX)).filter((n) => Object.prototype.hasOwnProperty.call(SFX, n));
  const stat = (b, from) => {
    const L = b.getChannelData(0), Rr = b.getChannelData(1), n = L.length;
    let pk = 0, bad = 0, ss = 0;
    for (let i = 0; i < n; i++) { const a = L[i], c = Rr[i]; if (!Number.isFinite(a) || !Number.isFinite(c)) { bad++; continue; } const m = Math.max(Math.abs(a), Math.abs(c)); if (m > pk) pk = m; }
    const w = Math.floor(SR * 0.05); let st = 0;
    for (let i = 0; i + w <= n; i += w >> 1) { let s = 0; for (let j = i; j < i + w; j++) { const v = (L[j] + Rr[j]) * 0.5; s += v * v; } st = Math.max(st, Math.sqrt(s / w)); }
    const tw = Math.floor(SR * 0.1); for (let i = n - tw; i < n; i++) { const v = (L[i] + Rr[i]) * 0.5; ss += v * v; }
    return { peak: pk, st, tail: Math.sqrt(ss / tw), bad, lm: lufsM(L, Rr) };
  };
  // ITU-R BS.1770 K-가중 순간 라우드니스(400 ms 창) 최댓값 — 귀에 들리는 크기. 비교·보정은 이걸로 한다
  // (50 ms RMS 는 저음이 많은 합성음을 크게, 중고음이 많은 녹음 소리를 작게 재서 'v2 가 더 커서 좋게 들리는' 착시를 만든다)
  function kw(x) {
    const out = new Float64Array(x.length), fs = SR;
    let K = Math.tan(Math.PI * 1681.974450955533 / fs), Q = 0.7071752369554196, Vh = Math.pow(10, 3.999843853973347 / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const s1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
    K = Math.tan(Math.PI * 38.13547087602444 / fs); Q = 0.5003270373238773; a0 = 1 + K / Q + K * K;
    const s2 = [1, -2, 1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, z1 = 0, z2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i], y = s1[0] * v + s1[1] * x1 + s1[2] * x2 - s1[3] * y1 - s1[4] * y2; x2 = x1; x1 = v; y2 = y1; y1 = y;
      const z = s2[0] * y + s2[1] * u1 + s2[2] * u2 - s2[3] * z1 - s2[4] * z2; u2 = u1; u1 = y; z2 = z1; z1 = z; out[i] = z;
    }
    return out;
  }
  function lufsM(L, Rr) {
    const a = kw(L), b = kw(Rr), w = Math.floor(SR * 0.4), hop = Math.floor(SR * 0.05);
    let s = 0, best = 0;
    const sq = (i) => a[i] * a[i] + b[i] * b[i];
    for (let i = 0; i < Math.min(w, a.length); i++) s += sq(i);
    best = s;
    for (let i = w; i < a.length; i++) { s += sq(i) - sq(i - w); if ((i - w) % hop === 0 && s > best) best = s; }
    return -0.691 + 10 * Math.log10(best / w + 1e-20);
  }
  const one = async (name) => {
    try {
      // 1) 길이 측정 (렌더 없이)
      const dry = new Engine(new OfflineAudioContext(2, 4410, SR)); dry.sfx(name, { delay: DELAY });
      const ent = dry.live[dry.live.length - 1];
      const len = ent ? ent.end - ent.st - DELAY - 0.05 : 0;
      // 2) 노드 수를 세며 렌더 (잔향 꼬리 3.3초 포함)
      const oc = new OfflineAudioContext(2, Math.ceil(SR * Math.min(9, DELAY + len + 3.8)), SR);
      const eng = new Engine(oc); eng.setVolumes(0.6, 0.8);
      let srcs = 0, nodes = 0;
      for (const k of ['createOscillator', 'createBufferSource']) { const f = oc[k].bind(oc); oc[k] = (...a) => { srcs++; nodes++; return f(...a); }; }
      for (const k of ['createGain', 'createBiquadFilter', 'createStereoPanner']) { const f = oc[k].bind(oc); oc[k] = (...a) => { nodes++; return f(...a); }; }
      eng.sfx(name, { delay: DELAY });
      const b = await oc.startRendering();
      return { len: +len.toFixed(3), srcs, nodes, ...stat(b) };
    } catch (e) { return { err: String(e && e.stack || e) }; }
  };
  for (let i = 0; i < names.length; i += 8) {
    const part = names.slice(i, i + 8), rs = await Promise.all(part.map(one));
    part.forEach((n, j) => { out.renders[n] = rs[j]; });
  }
  // 엔진을 만든 뒤의 노드 생성 수 (효과음 한 번의 비용: 소스·합성 오실레이터·전체 노드·컨볼버)
  const counted = (oc) => {
    const n = { srcs: 0, osc: 0, nodes: 0, conv: 0 };
    for (const k of ['createOscillator', 'createBufferSource', 'createGain', 'createBiquadFilter', 'createStereoPanner', 'createConvolver', 'createWaveShaper', 'createDynamicsCompressor', 'createDelay']) {
      if (typeof oc[k] !== 'function') continue;
      const f = oc[k].bind(oc);
      oc[k] = (...a) => { n.nodes++; if (k === 'createOscillator') { n.osc++; n.srcs++; } if (k === 'createBufferSource') n.srcs++; if (k === 'createConvolver') n.conv++; return f(...a); };
    }
    return n;
  };
  // ── 녹음 샘플: 같은 렌더에 샘플 뱅크를 얹어 잰다 (bankOf(name, g, s, 변형 번호)) ──
  out.smp = { renders: {}, missing: [], unknown: [], bytes: 0, err: null };
  try {
    const r = await fetch('/assets/audio/sfx/index.json');
    if (!r.ok) throw new Error('index.json ' + r.status);
    const ix = await r.json(); out.smp.index = ix;
    const dc = new OfflineAudioContext(1, 1, SR), bufs = {};
    for (const [id, f] of Object.entries(ix.files)) {
      for (const fmt of ix.formats) { const rr = await fetch(`/assets/audio/sfx/${id}.${fmt}`); if (!rr.ok) { out.smp.missing.push(`${id}.${fmt}`); continue; } out.smp.bytes += (await rr.clone().arrayBuffer()).byteLength; if (fmt === 'ogg') bufs[id] = { buf: await dc.decodeAudioData(await rr.arrayBuffer()), off: 0 }; }
    }
    const pick = (only ? Object.keys(ix.sfx).filter((n) => only.includes(n)) : Object.keys(ix.sfx));
    for (const n of pick) if (!Object.prototype.hasOwnProperty.call(SFX, n)) out.smp.unknown.push(n);
    const oneS = async (name, d, v) => {
      const bank = { sample: (n) => (n === name ? { bufs: [bufs[d.f[v]]], g: d.g, s: d.s, r: d.r || 1 } : null) };
      try {
        const dry = new Engine(new OfflineAudioContext(2, 4410, SR)); dry.bank = bank; dry.sfx(name, { delay: DELAY });
        const ent = dry.live[dry.live.length - 1], len = ent ? ent.end - ent.st - DELAY - 0.05 : 0;
        const oc = new OfflineAudioContext(2, Math.ceil(SR * Math.min(9, DELAY + len + 3.8)), SR);
        const eng = new Engine(oc); eng.setVolumes(0.6, 0.8); eng.bank = bank;
        const n = counted(oc);
        eng.sfx(name, { delay: DELAY });
        return { len: +len.toFixed(3), ...n, ...stat(await oc.startRendering()) };
      } catch (e) { return { err: String(e && e.stack || e) }; }
    };
    for (const n of pick) {
      const d = ix.sfx[n];
      if (!Object.prototype.hasOwnProperty.call(SFX, n) || !d.f.every((id) => bufs[id])) continue;
      const vs = [];
      for (let v = 0; v < d.f.length; v++) vs.push(await oneS(n, d, v));
      const solos = [];
      for (let v = 0; v < d.f.length; v++) solos.push(await oneS(n, { ...d, g: 1, s: 0 }, v)); // 샘플만 (g=1) — 보정용
      const okS = solos.filter((x) => !x.err && x.st > 0);
      const solo = okS.length ? { st: Math.exp(okS.reduce((a, x) => a + Math.log(x.st), 0) / okS.length) } : solos[0]; // 변형들의 기하 평균
      out.smp.renders[n] = { vs, solo };
    }
  } catch (e) { out.smp.err = String(e && e.message || e); }
  // ── 고급 효과음 v2 (시범): 변형마다 v2 샘플만 얹어 렌더 (합성음 fn 이 불리면 센다) + 실행 규칙 ──
  out.v2 = { err: null, index: null, missing: [], bytes: 0, dec: {}, renders: {}, rt: [] };
  if (V2) try {
    const r = await fetch('/assets/audio/sfx_v2/index.json');
    if (!r.ok) throw new Error('assets/audio/sfx_v2/index.json ' + r.status);
    const ix = await r.json(); out.v2.index = ix;
    const dc = new OfflineAudioContext(1, 1, SR), vb = {};
    for (const [id] of Object.entries(ix.files || {})) {
      for (const fmt of ix.formats || []) {
        const rr = await fetch(`/assets/audio/sfx_v2/${id}.${fmt}`);
        if (!rr.ok) { out.v2.missing.push(`${id}.${fmt}`); continue; }
        const ab = await rr.arrayBuffer(); out.v2.bytes += ab.byteLength;
        if (fmt !== 'ogg') continue;
        const b = await dc.decodeAudioData(ab); vb[id] = { buf: b, off: 0 };
        let pk = 0; for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > pk) pk = a; } }
        out.v2.dec[id] = { peak: pk, dur: b.duration, ch: b.numberOfChannels };
      }
    }
    const pick = Object.keys(ix.sfx || {}).filter((n) => !only || only.includes(n));
    const oneV = async (name, d, v) => {
      const mk = () => ({ sample: (n) => (n === name ? { bufs: [vb[d.f[v]]], g: d.g, rev: d.rev, last: -1 } : null) });
      const def = SFX[name], fn0 = def.fn; let syn = 0;
      def.fn = function (...a) { syn++; return fn0.apply(this, a); };
      try {
        const dry = new Engine(new OfflineAudioContext(2, 4410, SR)); dry.v2 = mk(); dry.sfx(name, { delay: DELAY });
        const ent = dry.live[dry.live.length - 1], len = ent ? ent.end - ent.st - DELAY - 0.05 : 0;
        const oc = new OfflineAudioContext(2, Math.ceil(SR * Math.min(9, DELAY + len + 3.8)), SR);
        const eng = new Engine(oc); eng.setVolumes(0.6, 0.8); eng.v2 = mk();
        const n = counted(oc);
        eng.sfx(name, { delay: DELAY });
        return { len: +len.toFixed(3), syn, ...n, ...stat(await oc.startRendering()) };
      } catch (e) { return { err: String(e && e.stack || e) }; } finally { def.fn = fn0; }
    };
    for (const n of pick) {
      const d = ix.sfx[n];
      if (!Object.prototype.hasOwnProperty.call(SFX, n) || !Array.isArray(d.f) || !d.f.every((id) => vb[id])) continue;
      const vs = [];
      for (let v = 0; v < d.f.length; v++) vs.push(await oneV(n, d, v));
      out.v2.renders[n] = vs;
    }
    // 실행 규칙
    const RT = (m) => out.v2.rt.push(m);
    const nm = pick.find((n) => ix.sfx[n].f.length >= 3 && ix.sfx[n].f.every((id) => vb[id]));
    if (nm) {
      const d = ix.sfx[nm], sm = { bufs: d.f.map((id) => vb[id]), g: d.g, last: -1 }, bank = { sample: (n) => (n === nm ? sm : null) };
      const eng = new Engine(new OfflineAudioContext(2, 4410, SR)); eng.v2 = bank;
      const seen = new Set(); let prev = -1, rep = 0;
      for (let i = 0; i < 80; i++) { delete eng.lastT[nm]; eng.feelT.length = 0; eng.sfx(nm); if (sm.last === prev) rep++; prev = sm.last; seen.add(sm.last); }
      if (rep) RT(`${nm}: 같은 변형이 연달아 ${rep}번 (80번 중)`);
      if (seen.size !== d.f.length) RT(`${nm}: 80번 중 쓰인 변형 ${seen.size}/${d.f.length}`);
      if (eng.v2Starts !== 80) RT(`${nm}: v2Starts ${eng.v2Starts} ≠ 80`);
      const e2 = new Engine(new OfflineAudioContext(2, 4410, SR)); e2.v2 = bank; e2.v2Quality = 'low';
      e2.sfx(nm); if (e2.live[e2.live.length - 1].room || e2.room) RT("품질 'low' 인데 방 잔향을 씀");
      e2.v2Quality = 'high'; delete e2.lastT[nm]; e2.feelT.length = 0; e2.sfx(nm);
      if (!e2.live[e2.live.length - 1].room || e2.roomSpace !== 'hall') RT(`품질 'high' 인데 방 잔향 없음 (공간 ${e2.roomSpace})`);
      const ir1 = e2.room && e2.room.buffer; e2.v2Space = 'cave'; delete e2.lastT[nm]; e2.feelT.length = 0; e2.sfx(nm);
      if (!e2.room || e2.room.buffer === ir1 || e2.roomSpace !== 'cave') RT('공간이 바뀌어도 방 임펄스를 다시 만들지 않음');
      const oc3 = new OfflineAudioContext(2, 4410, SR), e3 = new Engine(oc3); e3.v2 = bank; let pans = 0;
      const f3 = oc3.createStereoPanner.bind(oc3); oc3.createStereoPanner = () => { pans++; return f3(); };
      e3.sfx(nm, { pan: -0.5 }); if (pans !== 1) RT('v2 소리에서 pan 옵션이 무시됨');
      let syn = 0; const def = SFX.whip, fn0 = def.fn; def.fn = function (...a) { syn++; return fn0.apply(this, a); };
      try { e3.sfx('whip'); } finally { def.fn = fn0; }
      if (syn !== 1 || e3.v2Starts !== 1) RT('v2 에 없는 이름(whip)이 지금 경로(합성음)로 가지 않음');
    }
    // AudioSystem: 이 페이지는 스위치가 꺼져 있다 → v2 없음. _v2Opts: theme → 공간, 화면 x → pan (가장자리 ±0.6)
    if (audio.v2 || audio.v2Stats().on !== false) RT('스위치가 꺼져 있는데 audio.v2 가 있음');
    const g0 = window.__game, fake = { eng: {}, quality: 'medium' };
    window.__game = { world: { stage: { theme: 'catacombs' }, camera: { x: 100, w: 960, _zoom: 1 } } };
    const o1 = audio._v2Opts.call(fake, { x: 820, vol: 0.8 }), o2 = audio._v2Opts.call(fake, { x: 99999 }), o3 = audio._v2Opts.call(fake, { pan: 0.2, x: 0 }), o4 = audio._v2Opts.call(fake, undefined);
    window.__game = g0;
    if (!(Math.abs(o1.pan - 0.3) < 1e-9 && o1.vol === 0.8)) RT(`_v2Opts: x 820 (화면 중심 580, 반폭 480) → pan 0.3 이어야 함 (${o1.pan})`);
    if (o2.pan !== 0.6) RT(`_v2Opts: 화면 밖 x → pan 0.6 이어야 함 (${o2.pan})`);
    if (o3.pan !== 0.2) RT('_v2Opts: 호출부가 준 pan 을 덮어씀');
    if (o4 !== undefined) RT('_v2Opts: opts 없으면 그대로 두어야 함');
    if (fake.eng.v2Space !== 'cave' || fake.eng.v2Quality !== 'medium') RT(`_v2Opts: theme catacombs → cave, 품질 medium 이어야 함 (${fake.eng.v2Space}, ${fake.eng.v2Quality})`);
  } catch (e) { out.v2.err = String(e && e.message || e); }
  return out;
}, { only, FEEL, V2: !args['no-v2'] }).catch(async (e) => {
  console.log('  ✗ 페이지 평가 실패: ' + String(e && e.message || e).split('\n').slice(0, 3).join(' | '));
  for (const m of pageErrs) console.log('  ✗ ' + m);
  await browser.close(); srv.close();
  process.exit(1);
});

// ── 결과 판정 ──
if (res.cmpErr) fail('audio_companions.js import 오류: ' + res.cmpErr);
if (res.unknownOnly.length) fail(`--only 에 등록되지 않은 이름: ${res.unknownOnly.join(' ')}`);
for (const m of res.api) fail('API: ' + m);
for (const m of res.budget) fail('예산: ' + m);
const names = new Set(res.names);
for (const n of BASE) if (!names.has(n)) fail(`내장 효과음 누락: ${n}`);
for (const n of FEEL) if (!names.has(n)) fail(`체감 효과음 누락: ${n}`);
if (res.feelNames.length !== FEEL.length || res.feelNames.some((n) => !FEEL.includes(n))) fail(`FEEL_SFX 이름이 §1.9 표와 다름: ${res.feelNames.filter((n) => !FEEL.includes(n)).join(',') || '(개수 ' + res.feelNames.length + ')'}`);
const cmpHave = CMP.filter((n) => names.has(n));
if (!cmpHave.length) info(`동료 효과음 ${CMP.length}종 미등록 (audio_companions.js 스텁) — 등록되면 전부 필수로 검사`);
else if (cmpHave.length < CMP.length) fail(`동료 효과음 누락 ${CMP.length - cmpHave.length}종: ${CMP.filter((n) => !names.has(n)).join(' ')}`);
const extra = res.names.filter((n) => n !== '_default' && !BASE.includes(n) && !FEEL.includes(n) && !CMP.includes(n));
if (extra.length) info(`표에 없는 추가 등록 이름: ${extra.join(' ')}`);

// 체감 효과음 예산: 소스 노드 수(모바일 비용), 음량 범위(sfxVol 0.8, vol 1 기준 정상 상태 단기 RMS: 발소리 ≈ footstep(≈0.032) 의 1.1배 — 같은 호출 음량으로 옛 footstep 을 대체하므로,
//   재질 레이어 ≈ hit(≈0.2) 의 40~50%)
const SFXLAYER = new Set(res.layers);
for (const n of ['hit_flesh', 'hit_bone', 'hit_ghost', 'hit_stone']) if (!SFXLAYER.has(n)) fail(`${n}: layer 'hit' 표시 없음 (재질 레이어 예산 미적용)`);
const SRC_MAX = (n) => (!FEEL.includes(n) ? 60 : n.startsWith('step_') ? 6 : n.startsWith('hit_') ? 10 : 40);
const ST_BAND = (n) => (n.startsWith('step_') ? [0.024, 0.045] : SFXLAYER.has(n) ? [0.05, 0.13] : [0.03, 0.5]);
const LEN_MAX = (n) => (group(n) === 'feel' || group(n) === 'cmp' ? 3 : 6);
const group = (n) => (FEEL.includes(n) ? 'feel' : CMP.includes(n) ? 'cmp' : BASE.includes(n) || n === '_default' ? 'base' : 'extra');
let played = 0;
for (const [n, r] of Object.entries(res.renders)) {
  if (r.err) { fail(`${n}: 렌더 오류 ${r.err.split('\n')[0]}`); continue; }
  played++;
  if (r.bad) fail(`${n}: 비정상 샘플(NaN/Inf) ${r.bad}개`);
  if (r.peak < 0.003) fail(`${n}: 무음 (피크 ${r.peak.toFixed(4)})`);
  if (r.peak > 1.05) fail(`${n}: 클리핑 (피크 ${r.peak.toFixed(3)})`);
  if (r.tail > 0.003) fail(`${n}: 소리가 끝나지 않음 (마지막 0.1초 RMS ${r.tail.toFixed(4)})`);
  if (r.len <= 0 || r.len > LEN_MAX(n)) fail(`${n}: 길이 이상 ${r.len}s (최대 ${LEN_MAX(n)}s)`);
  if (r.srcs > SRC_MAX(n)) (group(n) === 'feel' || group(n) === 'cmp' ? fail : warn)(`${n}: 소스 노드 ${r.srcs}개 > ${SRC_MAX(n)}`);
  if (group(n) === 'feel') { const [lo, hi] = ST_BAND(n); if (r.st < lo || r.st > hi) fail(`${n}: 음량 범위 밖 (단기 RMS ${r.st.toFixed(3)}, 기대 ${lo}–${hi})`); }
}
for (const e of pageErrs) fail(e);

// ── 녹음 샘플 판정 (+ --calibrate: g 를 합성음 크기에 맞춰 index.json 에 쓴다) ──
const SM = res.smp;
let smpN = 0;
const calib = {};
if (SM.err) fail('녹음 샘플: ' + SM.err);
else {
  for (const m of SM.missing) fail(`녹음 샘플 파일 없음: ${m}`);
  for (const n of SM.unknown) fail(`녹음 샘플 매핑이 등록되지 않은 효과음 이름: ${n}`);
  if (SM.bytes > 3 * 1048576) fail(`녹음 샘플 합계 ${(SM.bytes / 1048576).toFixed(2)} MB > 3 MB`);
  for (const [n, { vs, solo }] of Object.entries(SM.renders)) {
    const base = res.renders[n];
    const d = SM.index.sfx[n];
    for (const [i, r] of vs.entries()) {
      if (r.err) { fail(`${n}[샘플 ${i}]: 렌더 오류 ${r.err.split('\n')[0]}`); continue; }
      if (r.bad) fail(`${n}[샘플 ${i}]: 비정상 샘플 ${r.bad}개`);
      if (r.peak < 0.003) fail(`${n}[샘플 ${i}]: 무음`);
      if (r.peak > 1.05) fail(`${n}[샘플 ${i}]: 클리핑 (피크 ${r.peak.toFixed(3)})`);
      if (r.tail > 0.003) fail(`${n}[샘플 ${i}]: 소리가 끝나지 않음`);
      const k = base && !base.err ? r.st / base.st : 1;
      if (!args.calibrate && (k < 0.6 || k > 1.6)) fail(`${n}[샘플 ${i}]: 음량이 합성음과 너무 다름 (단기 RMS ${r.st.toFixed(3)} / 합성 ${base.st.toFixed(3)} = ${k.toFixed(2)}배)`);
    }
    smpN++;
    // 보정: 합성음 몫 s 를 남기고 나머지 에너지를 샘플이 채우게 (비상관 합) — g = 합성 RMS × √(1−s²) / 샘플(g=1) RMS
    if (base && !base.err && solo && !solo.err && solo.st > 1e-4) calib[n] = +Math.min(4, Math.max(0.05, (base.st * Math.sqrt(Math.max(0, 1 - d.s * d.s))) / solo.st)).toFixed(3);
    if (args.levels) console.log(`smp    ${n.padEnd(17)} 합성 ${base?.st?.toFixed(3)}  샘플+합성 ${vs.map((r) => r.st?.toFixed(3)).join('/')}  (g ${d.g}, s ${d.s}${calib[n] ? `, 보정 g ${calib[n]}` : ''})`);
  }
}
if (args.calibrate && !SM.err) {
  const f = path.join(root, 'assets/audio/sfx/index.json');
  const ix = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [n, g] of Object.entries(calib)) ix.sfx[n].g = g;
  fs.writeFileSync(f, JSON.stringify(ix, null, 1) + '\n');
  console.log(`--calibrate: 녹음 샘플 음량 ${Object.keys(calib).length}종을 ${path.relative(root, f)} 에 썼다`);
}

// ── 고급 효과음 v2 판정 (+ --calibrate-v2) ──
const V2 = res.v2, V2_BUDGET = 1.2 * 1048576;
const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
let v2N = 0;
const calibV2 = {};
if (!args['no-v2']) {
  if (V2.err) fail('v2: ' + V2.err);
  else if (V2.index) {
    const ix = V2.index;
    for (const m of V2.missing) fail(`v2 파일 없음: ${m}`);
    if (V2.bytes > V2_BUDGET) fail(`v2 합계 ${(V2.bytes / 1024).toFixed(0)} KB > 1.2 MB`);
    for (const m of V2.rt) fail('v2 실행: ' + m);
    console.log('v2     이름          변형  LUFS-ev(빌드)                    dBTP(빌드)                 ogg 피크 dBFS   v2−지금 LUFS-M  노드 v2/지금 (소스·합성)');
    for (const [n, d] of Object.entries(ix.sfx)) {
      if (only && !only.includes(n)) continue;
      if (!names.has(n)) { fail(`v2: 등록되지 않은 효과음 이름 ${n}`); continue; }
      if (!Array.isArray(d.f) || d.f.length < 3 || d.f.length > 5) fail(`v2 ${n}: 변형 ${d.f?.length ?? 0}개 (3~5 이어야 함)`);
      if (!(Number(d.g) > 0)) fail(`v2 ${n}: g 이상 (${d.g})`);
      const fs_ = (d.f || []).map((id) => ix.files[id]);
      (d.f || []).forEach((id, i) => {
        const f = fs_[i];
        if (!f) { fail(`v2 ${n}: files 에 ${id} 없음`); return; }
        if (!(f.lufs >= -19 && f.lufs <= -14.5)) fail(`v2 ${id}: 사건 라우드니스 ${f.lufs} LUFS (기대 -19 ~ -14.5, 목표 -16)`);
        if (!(f.peak <= -1.0)) fail(`v2 ${id}: 트루 피크 ${f.peak} dBTP > -1`);
        const dp = V2.dec[id]?.peak;
        if (dp != null && db(dp) > -0.5) fail(`v2 ${id}: 푼 ogg 피크 ${db(dp).toFixed(2)} dBFS > -0.5`);
      });
      const vs = V2.renders[n];
      if (!vs) { fail(`v2 ${n}: 렌더 못 함 (파일을 못 풀었거나 이름 없음)`); continue; }
      vs.forEach((r, i) => {
        const tag = `v2 ${n}[${i + 1}]`;
        if (r.err) { fail(`${tag}: 렌더 오류 ${r.err.split('\n')[0]}`); return; }
        if (r.syn) fail(`${tag}: 합성음 층이 울림 (fn 호출 ${r.syn}번) — v2 이름은 녹음 샘플만`);
        if (r.osc) fail(`${tag}: 오실레이터 ${r.osc}개 (합성음)`);
        if (r.srcs < 1) fail(`${tag}: 샘플 소스가 없음`);
        if (r.bad) fail(`${tag}: 비정상 샘플 ${r.bad}개`);
        if (r.peak < 0.003) fail(`${tag}: 무음`);
        if (r.peak > 1.05) fail(`${tag}: 클리핑 (피크 ${r.peak.toFixed(3)})`);
        if (r.tail > 0.003) fail(`${tag}: 소리가 끝나지 않음`);
      });
      const okv = vs.filter((r) => !r.err);
      const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN);
      const v2lm = mean(okv.map((r) => r.lm));   // 변형들의 K-가중 순간 라우드니스 평균 (dB)
      const clm = SM.renders?.[n] ? mean(SM.renders[n].vs.filter((r) => !r.err).map((r) => r.lm)) : res.renders[n]?.lm;
      const k = v2lm - clm;                      // dB: + 면 v2 가 더 큼
      if (args['calibrate-v2']) { if (Number.isFinite(k)) calibV2[n] = +Math.min(8, Math.max(0.05, d.g * Math.pow(10, -k / 20))).toFixed(3); }
      else if (!(Math.abs(k) <= 1.5)) fail(`v2 ${n}: 지금 게임 소리와 크기 차이 ${k >= 0 ? '+' : ''}${k.toFixed(1)} dB (K-가중 순간 라우드니스 v2 ${v2lm.toFixed(1)} / 지금 ${clm?.toFixed(1)} LUFS) — --calibrate-v2 로 g 맞추기`);
      const curN = SM.renders?.[n]?.vs?.[0] ?? res.renders[n];
      const nodeV = okv.length ? Math.max(...okv.map((r) => r.nodes - r.conv)) : 0;
      console.log(`v2     ${n.padEnd(13)} ${String(d.f.length).padStart(3)}  ${fs_.map((f) => (f ? f.lufs.toFixed(1) : '?').padStart(5)).join(' ').padEnd(31)}  ${fs_.map((f) => (f ? f.peak.toFixed(1) : '?').padStart(4)).join(' ').padEnd(25)}  ${(d.f || []).map((id) => (V2.dec[id] ? db(V2.dec[id].peak).toFixed(1) : '?')).join(' ').padEnd(14)}  ${Number.isFinite(k) ? ((k >= 0 ? '+' : '') + k.toFixed(1) + 'dB').padStart(7) : '      ?'}      ${nodeV}${okv.some((r) => r.conv) ? '+잔향1' : ''} / ${curN?.nodes ?? '?'}  (${okv[0]?.srcs ?? '?'}·${okv[0]?.osc ?? '?'} / ${curN?.srcs ?? '?'}·${curN?.osc ?? '?'})`);
      v2N++;
    }
  }
}
if (args['calibrate-v2'] && V2.index) {
  const f = path.join(root, 'assets/audio/sfx_v2/index.json');
  const ix = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [n, g] of Object.entries(calibV2)) { console.log(`--calibrate-v2: ${n.padEnd(12)} g ${ix.sfx[n].g} → ${g}`); ix.sfx[n].g = g; }
  fs.writeFileSync(f, JSON.stringify(ix, null, 1) + '\n');
  console.log(`--calibrate-v2: v2 음량 ${Object.keys(calibV2).length}종을 ${path.relative(root, f)} 에 썼다 (한 번 더 돌려 ±1.5 dB 확인)`);
}

// ── 스위치 꺼짐 = 지금과 같음 (--ref <커밋>): 그 커밋의 audio.js 와 지금 audio.js 로 같은 난수열·같은 호출을 렌더해 노드 그래프·난수 호출 수·샘플을 비교 ──
let refLine = '';
if (args.ref) {
  let refSrc = null;
  try { refSrc = execFileSync('git', ['show', `${args.ref}:src/core/audio.js`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }); } catch (e) { fail(`--ref ${args.ref}: git show 실패 ${String(e.message).split('\n')[0]}`); }
  if (refSrc) {
    const p2 = await (await browser.newContext()).newPage();
    const errs2 = [];
    p2.on('pageerror', (e) => errs2.push(e.message));
    await p2.route('**/__test_sfx__.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>sfx ref</title>' }));
    await p2.route('**/src/core/__audio_ref.js', (r) => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: refSrc }));
    await p2.goto(`http://localhost:${port}/__test_sfx__.html`);
    const idr = await p2.evaluate(async ({ only }) => {
      let seed = 1, calls = 0;
      Math.random = () => { calls++; seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; // 두 모듈 모두 const R = Math.random 으로 잡는다
      const A = await import('/src/core/audio.js'), B = await import('/src/core/__audio_ref.js');
      const out = { diff: [], same: 0, n: 0, v2on: A.audio.v2Stats().on, aV2: A.audio.v2, noise: 0, maxd: 0 };
      // 지금 녹음 샘플 뱅크도 얹는다 (샘플 경로도 같은지)
      const ix = await (await fetch('/assets/audio/sfx/index.json')).json(), dc = new OfflineAudioContext(1, 1, 44100), bufs = {};
      const names = (only || Object.keys(A.SFX)).filter((n) => Object.prototype.hasOwnProperty.call(A.SFX, n) && Object.prototype.hasOwnProperty.call(B.SFX, n));
      for (const n of names) { const d = ix.sfx[n]; if (d) for (const id of d.f) if (!bufs[id]) bufs[id] = { buf: await dc.decodeAudioData(await (await fetch(`/assets/audio/sfx/${id}.ogg`)).arrayBuffer()), off: 0 }; }
      const bank = { sample: (n) => { const d = ix.sfx[n]; return d ? { bufs: d.f.map((id) => bufs[id]), g: d.g, s: d.s, r: d.r || 1 } : null; } };
      const KINDS = ['createOscillator', 'createBufferSource', 'createGain', 'createBiquadFilter', 'createStereoPanner', 'createConvolver', 'createWaveShaper', 'createDelay', 'createBuffer', 'createPeriodicWave'];
      const run = async (M, name) => {
        seed = 12345; calls = 0;
        const oc = new OfflineAudioContext(2, Math.ceil(44100 * 2.6), 44100), eng = new M.Engine(oc); eng.setVolumes(0.6, 0.8); eng.bank = bank;
        const g = {}; for (const k of KINDS) { if (typeof oc[k] !== 'function') continue; const f = oc[k].bind(oc); oc[k] = (...a) => { g[k] = (g[k] || 0) + 1; return f(...a); }; }
        const c0 = calls;
        eng.sfx(name, { delay: 0.05 }); eng.sfx(name, { delay: 0.35, vol: 1.2, pitch: 1.12, pan: -0.4 });
        const sig = JSON.stringify([c0, calls - c0, g, eng.live.length, eng.stats]);
        const b = await oc.startRendering(); return { sig, ch: [b.getChannelData(0), b.getChannelData(1)] };
      };
      const md = (x, y) => { let m = 0; for (let c = 0; c < 2; c++) for (let i = 0; i < x[c].length; i++) { const d = Math.abs(x[c][i] - y[c][i]); if (d > m || d !== d) m = d !== d ? Infinity : d; } return m; };
      for (const name of names) {
        const a = await run(A, name), b = await run(B, name);
        const d = md(a.ch, b.ch);
        out.n++; out.maxd = Math.max(out.maxd, d);
        if (a.sig !== b.sig || !(d <= 1e-5)) out.diff.push(`${name}(${a.sig !== b.sig ? '그래프·난수 호출 다름' : 'Δ' + d.toExponential(1)})`); else out.same++;
      }
      // 같은 모듈끼리도 OfflineAudioContext 렌더는 ±1 ulp 흔들린다 (그래서 바이트 대신 그래프·난수열·-100 dBFS 이하 차이로 본다)
      const a1 = await run(A, 'whip'), a2 = await run(A, 'whip'); out.noise = md(a1.ch, a2.ch);
      return out;
    }, { only }).catch((e) => ({ err: String(e && e.message || e) }));
    if (idr.err) fail('--ref: ' + idr.err);
    else {
      if (idr.v2on || idr.aV2) fail('--ref: 스위치가 꺼져 있는데 audio.v2 가 있음');
      if (idr.diff.length) fail(`스위치 꺼짐인데 ${args.ref} 와 다른 렌더 ${idr.diff.length}종: ${idr.diff.slice(0, 12).join(' ')}`);
      refLine = `스위치 꺼짐 = ${args.ref} 와 같음 ${idr.same}/${idr.n}종 (노드 그래프·난수 호출 수 동일, 렌더 최대 차이 ${idr.maxd.toExponential(1)} — 같은 모듈 두 번 렌더 잡음 ${idr.noise.toExponential(1)})`;
    }
    for (const e of errs2) fail('--ref 페이지 오류: ' + e);
  }
}

if (args.levels) {
  const rows = Object.entries(res.renders).filter(([, r]) => !r.err).sort((a, b) => group(a[0]).localeCompare(group(b[0])) || a[0].localeCompare(b[0]));
  console.log('group  name              peak    st      len    src  nodes');
  for (const [n, r] of rows) console.log(`${group(n).padEnd(6)} ${n.padEnd(17)} ${r.peak.toFixed(3).padStart(6)}  ${r.st.toFixed(3).padStart(6)}  ${r.len.toFixed(2).padStart(5)}  ${String(r.srcs).padStart(4)}  ${String(r.nodes).padStart(5)}`);
}
if (args.json) fs.writeFileSync(args.json === true ? '/tmp/test_sfx.json' : String(args.json), JSON.stringify({ fails, warns, infos, renders: res.renders }, null, 1));

const cnt = (g) => Object.keys(res.renders).filter((n) => group(n) === g).length;
console.log(`효과음 ${played}/${Object.keys(res.renders).length}종 렌더 (내장 ${cnt('base')} · 체감 ${cnt('feel')} · 동료 ${cnt('cmp')} · 기타 ${cnt('extra')}), API ${res.api.length ? '✗' : '✓'}, 예산 ${res.budget.length ? '✗' : '✓'}, 녹음 샘플 ${smpN}종 (${(SM.bytes / 1024).toFixed(0)} KB)`);
if (!args['no-v2']) console.log(`고급 효과음 v2 ${v2N}종 (${(V2.bytes / 1024).toFixed(0)} KB, 예산 1.2 MB)${refLine ? ' · ' + refLine : ''}`);
for (const m of infos) console.log('  · ' + m);
for (const m of warns) console.log('  ! ' + m);
for (const m of fails) console.log('  ✗ ' + m);
console.log(fails.length ? `실패 ${fails.length}건` : '통과');
await browser.close(); srv.close();
process.exitCode = fails.length ? 1 : 0;
