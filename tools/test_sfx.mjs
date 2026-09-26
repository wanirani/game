// 효과음 레지스트리 검증 — 등록된 모든 효과음을 헤드리스 Chromium 의 OfflineAudioContext 로 하나씩 렌더해 검사한다.
// 사용: node tools/test_sfx.mjs [--only a,b] [--levels] [--json 파일]
//  --levels  이름별 피크·단기 RMS·길이·노드 수 표 출력 (음량 보정용)
//  --json    결과 전체를 파일로 저장
// 검사 항목
//  1. 레지스트리: 내장 76종 + 체감 45종(sfx_feel.js) + 동료 31종(audio_companions.js 가 하나라도 등록했으면 전부 필수), 이름 충돌 없음
//  2. sfx_feel.js 가 audio.js 를 import 하지 않음 (순환 금지)
//  3. API: defineSfx(name, def, vol) / SFX_KIT {T, N, R} / fn(S, H) 의 H = {T, N, FM, ARP, BOOM, CRACKLE, mtof, R} / audio 도우미
//  4. 체감 예산: 100ms 창 상한(10·8·6), prio 예외, hit* 7개 이상이면 재질 레이어 생략, stopName
//  5. 렌더: 예외·NaN 없음, 무음 아님, 클리핑 없음, 꼬리가 사라짐(멈추지 않는 소리 없음), 길이·노드 수 예산, 체감 효과음 음량 범위
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  if (/\bimport\b[^;]*?['"][^'"]*\baudio\.js['"]/.test(src) || /\bimport\s*\(\s*['"][^'"]*\baudio\.js['"]/.test(src)) fail('sfx_feel.js 가 audio.js 를 import 함 (순환 금지)');
  const other = [...src.matchAll(/\bimport\b[^;]*?['"]([^'"]+)['"]/g)].map((m) => m[1]);
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
const res = await page.evaluate(async ({ only, FEEL }) => {
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
  }
  for (const k of ['liveCount', 'stopSfx', 'has', 'lead', 'setQuality']) ok(typeof audio[k] === 'function', `audio.${k} 없음`);
  ok(audio.has('step_stone') && !audio.has('__nope__') && !audio.has('_default'), 'audio.has 결과 이상');
  ok(audio.lead('awaken_stinger') === 0.4 && audio.lead('hit') === 0, 'audio.lead 결과 이상');
  ok(audio.stats && Number.isFinite(audio.stats.starts), 'audio.stats 없음');
  ok(audio.quality === 'high', `audio.quality 기본값 이상: ${audio.quality}`);
  audio.setQuality('low'); ok(audio.quality === 'low', 'audio.setQuality 무시됨'); audio.setQuality(null); ok(audio.quality === 'high', 'audio.setQuality(null) 복원 실패');
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
  }
  // ── 렌더 ──
  const SR = 44100, DELAY = 0.05;
  const names = (only || Object.keys(SFX)).filter((n) => SFX[n]);
  const stat = (b, from) => {
    const L = b.getChannelData(0), Rr = b.getChannelData(1), n = L.length;
    let pk = 0, bad = 0, ss = 0;
    for (let i = 0; i < n; i++) { const a = L[i], c = Rr[i]; if (!Number.isFinite(a) || !Number.isFinite(c)) { bad++; continue; } const m = Math.max(Math.abs(a), Math.abs(c)); if (m > pk) pk = m; }
    const w = Math.floor(SR * 0.05); let st = 0;
    for (let i = 0; i + w <= n; i += w >> 1) { let s = 0; for (let j = i; j < i + w; j++) { const v = (L[j] + Rr[j]) * 0.5; s += v * v; } st = Math.max(st, Math.sqrt(s / w)); }
    const tw = Math.floor(SR * 0.1); for (let i = n - tw; i < n; i++) { const v = (L[i] + Rr[i]) * 0.5; ss += v * v; }
    return { peak: pk, st, tail: Math.sqrt(ss / tw), bad };
  };
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
  return out;
}, { only, FEEL });

// ── 결과 판정 ──
if (res.cmpErr) fail('audio_companions.js import 오류: ' + res.cmpErr);
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

// 체감 효과음 예산: 소스 노드 수(모바일 비용), 음량 범위(sfxVol 0.8, vol 1 기준 단기 RMS: 발소리 ≈ footstep, 재질 레이어 ≈ hit 의 40%)
const SFXLAYER = new Set(res.layers);
for (const n of ['hit_flesh', 'hit_bone', 'hit_ghost', 'hit_stone']) if (!SFXLAYER.has(n)) fail(`${n}: layer 'hit' 표시 없음 (재질 레이어 예산 미적용)`);
const SRC_MAX = (n) => (!FEEL.includes(n) ? 60 : n.startsWith('step_') ? 6 : n.startsWith('hit_') ? 10 : 40);
const ST_BAND = (n) => (n.startsWith('step_') ? [0.015, 0.06] : SFXLAYER.has(n) ? [0.03, 0.12] : [0.03, 0.5]);
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

if (args.levels) {
  const rows = Object.entries(res.renders).filter(([, r]) => !r.err).sort((a, b) => group(a[0]).localeCompare(group(b[0])) || a[0].localeCompare(b[0]));
  console.log('group  name              peak    st      len    src  nodes');
  for (const [n, r] of rows) console.log(`${group(n).padEnd(6)} ${n.padEnd(17)} ${r.peak.toFixed(3).padStart(6)}  ${r.st.toFixed(3).padStart(6)}  ${r.len.toFixed(2).padStart(5)}  ${String(r.srcs).padStart(4)}  ${String(r.nodes).padStart(5)}`);
}
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify({ fails, warns, infos, renders: res.renders }, null, 1));

const cnt = (g) => Object.keys(res.renders).filter((n) => group(n) === g).length;
console.log(`효과음 ${played}/${Object.keys(res.renders).length}종 렌더 (내장 ${cnt('base')} · 체감 ${cnt('feel')} · 동료 ${cnt('cmp')} · 기타 ${cnt('extra')}), API ${res.api.length ? '✗' : '✓'}, 예산 ${res.budget.length ? '✗' : '✓'}`);
for (const m of infos) console.log('  · ' + m);
for (const m of warns) console.log('  ! ' + m);
for (const m of fails) console.log('  ✗ ' + m);
console.log(fails.length ? `실패 ${fails.length}건` : '통과');
await browser.close(); srv.close();
process.exitCode = fails.length ? 1 : 0;
