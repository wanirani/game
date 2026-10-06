// 익명 통계 서버 테스트 (메모리 저장소): node tools/telemetry/test_telemetry.mjs [--filter=문자열]   (= npm run test:telemetry)
//  - netlify/functions/api.mts 의 POST /api/t · GET /api/stats 를 Request/Context 로 직접 부르고, 저장소는 tools/accounts/mem_store.mjs
//  - 확인: 검사 거절(형식·필드 허용 목록·범위·길이), 32KB 상한, 망별 제한, 원본 저장(IP 없음), 매시 모으기의 멱등성(다시 돌리기·중간 실패·늦은 원본),
//          공개 통계 합치기·캐시·식별 정보 없음, 30일 지난 원본 정리, 예약 함수 설정
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMemoryBackend } from '../accounts/mem_store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const FILTER = typeof args.filter === 'string' ? args.filter : null;

globalThis.Netlify = { context: null, env: { get: (k) => (k === 'AUTH_PEPPER' ? 'telemetry-test-pepper-0123456789abcdef' : undefined), set() {}, has: (k) => k === 'AUTH_PEPPER', delete() {}, toObject: () => ({}) } };
const api = (await import(path.join(ROOT, 'netlify/functions/api.mts'))).default;
const aggFn = await import(path.join(ROOT, 'netlify/functions/telemetry_agg.mts'));
const rt = await import(path.join(ROOT, 'netlify/lib/runtime.mts'));
const cfg = await import(path.join(ROOT, 'netlify/lib/config.mts'));
const tel = await import(path.join(ROOT, 'netlify/lib/telemetry.mts'));
const { runCleanup } = await import(path.join(ROOT, 'netlify/lib/cleanup.mts'));
const client = await import(path.join(ROOT, 'src/core/telemetry.js'));

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
let T = Date.UTC(2026, 9, 1, 10, 20, 0);
rt.setClock(() => T);
const advance = (ms) => { T += ms; };
let backend = null;
let ipSeq = 0;
let IP = '198.51.100.7';
const freshIp = () => { ipSeq++; IP = `203.0.113.${(ipSeq % 250) + 1}`; return IP; };

async function call(method, p, { body, raw, ctype = 'application/json', ip = IP, headers = {}, deploy = 'production' } = {}) {
  const h = new Headers(headers);
  let payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined;
  if (payload !== undefined && ctype && !h.has('content-type')) h.set('content-type', ctype);
  const init = { method, headers: h };
  if (payload !== undefined) { init.body = payload; init.duplex = 'half'; }
  const ctx = { requestId: 'test', ip };
  if (deploy) ctx.deploy = { context: deploy, id: '0123456789abcdef01234567', published: deploy === 'production' };
  const res = await api(new Request('https://game.test' + p, init), ctx);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 204 */ }
  return { status: res.status, headers: res.headers, text, body: json };
}
const expectErr = (r, status, code) => {
  assert.equal(r.status, status, `기대 ${status} ${code}, 실제 ${r.status} ${r.text}`);
  if (code) assert.equal(r.body?.error, code, r.text);
};
const store = () => backend.factory(cfg.STORES.telemetry, 'production');
const keys = (prefix = '') => backend.keys('site', cfg.STORES.telemetry).map((k) => k.slice(cfg.STORES.telemetry.length + 1)).filter((k) => k.startsWith(prefix)).sort();

// ── 묶음 만들기 ──
const IID = 'AAAAAAAAAAAAAAAAAAAAAA';
let sidSeq = 0;
const sid = () => `s${String(++sidSeq).padStart(10, '0')}`;
const ev = {
  start: (o = {}) => ({ t: 'session_start', s: 1, b: '1.0.0+20261001T0000.abc1234', plat: 'web', os: 'android', br: 'chrome', vp: '800x300', dpr: 2.75, cores: 8, mem: 4, q: 'auto', tier: 'medium', input: 'touch', ...o }),
  error: (o = {}) => ({ t: 'error', s: 3, msg: 'TypeError: x is undefined', fr: ['src/game/world.js:120:7', 'src/core/game.js:600:12'], kind: 'error', scene: 'stage', stage: 's01', room: 'r2', ...o }),
  perf: (o = {}) => ({ t: 'perf', s: 70, fps: 57.3, p5: 41, tier: 'medium', heap: 180, dur: 60, scene: 'stage', ...o }),
  sstart: (o = {}) => ({ t: 'stage_start', s: 5, stage: 's01', mode: 'story', hero: 'kael', cls: 'kael_hunter', lv: 3, diff: 'normal', in: 'touch', ...o }),
  clear: (o = {}) => ({ t: 'stage_clear', s: 300, stage: 's01', mode: 'story', time: 245.5, rank: 'A', deaths: 1, hero: 'kael', cls: 'kael_hunter', lv: 4, diff: 'normal', ...o }),
  death: (o = {}) => ({ t: 'death', s: 100, stage: 's01', room: 'r2', x: 14, y: 9, cause: 'enemy:skeleton', hero: 'kael', lv: 3, time: 95.2, mode: 'story', diff: 'normal', ...o }),
  boss: (o = {}) => ({ t: 'boss_result', s: 280, boss: 'b_nightwing', stage: 's01', dur: 62.5, win: true, lv: 4, hero: 'kael', diff: 'normal', mode: 'story', ...o }),
  arcade: (o = {}) => ({ t: 'arcade_result', s: 400, mode: 'survival', score: 123456, wave: 12, time: 610, cleared: false, hero: 'lia', diff: 'hard', stage: 'arena', ...o }),
};
const batch = (events, o = {}) => ({ v: 1, id: IID, sid: sid(), ev: events, ...o });
const post = (b, o = {}) => call('POST', '/api/t', { body: b, ...o });

// ── 테스트 러너 ──
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('POST /api/t: 올바른 묶음 → 204 본문 없음, raw/<날>/<시>/<무작위> 에 그대로 (IP·헤더 없음)', async () => {
  const b = batch([ev.start(), ev.sstart(), ev.death(), ev.error()]);
  const r = await post(b);
  assert.equal(r.status, 204, r.text);
  assert.equal(r.text, '');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('content-type'), null);
  const ks = keys('raw/');
  assert.equal(ks.length, 1);
  assert.match(ks[0], /^raw\/2026-10-01\/10\/[A-Za-z0-9_-]{12}$/);
  const doc = await store().get(ks[0], { type: 'json' });
  assert.equal(doc.id, IID); assert.equal(doc.sid, b.sid); assert.equal(doc.at, T); assert.equal(doc.ev.length, 4);
  assert.deepEqual(doc.ev[2], ev.death());
  const dump = [...backend.data.entries()].filter(([k]) => k.includes(cfg.STORES.telemetry)).map(([, v]) => v.body).join('\n');
  assert.ok(!dump.includes(IP), 'IP 가 통계 저장소에 있으면 안 된다');
});

test('POST /api/t: text/plain (sendBeacon) 도 받는다, 그 밖의 형식은 415', async () => {
  assert.equal((await post(batch([ev.start()]), { ctype: 'text/plain;charset=UTF-8' })).status, 204);
  expectErr(await post(batch([ev.start()]), { ctype: 'application/x-www-form-urlencoded' }), 415, 'unsupported_media_type');
  expectErr(await post(batch([ev.start()]), { ctype: 'multipart/form-data; boundary=x' }), 415, 'unsupported_media_type');
  expectErr(await call('POST', '/api/t', { raw: new Blob([JSON.stringify(batch([ev.start()]))]), ctype: 'application/octet-stream' }), 415, 'unsupported_media_type');
  assert.equal(keys('raw/').length, 1);
});

test('라우팅: GET /api/t 405 · POST /api/stats 405 · 다른 사이트(cross-site) 403 · 배포 문맥 없음 500', async () => {
  expectErr(await call('GET', '/api/t'), 405, 'method_not_allowed');
  expectErr(await call('POST', '/api/stats', { body: {} }), 405, 'method_not_allowed');
  expectErr(await post(batch([ev.start()]), { headers: { 'sec-fetch-site': 'cross-site' } }), 403, 'forbidden');
  expectErr(await post(batch([ev.start()]), { deploy: null }), 500, 'server_error');
  assert.equal(keys('raw/').length, 0);
});

test('검사: 형식·허용 목록·범위·길이를 벗어나면 400 (묶음 전체를 저장하지 않음)', async () => {
  const bad = [
    ['빈 본문', { raw: '' }, 'bad_json'],
    ['JSON 아님', { raw: '{"v":1,' }, 'bad_json'],
    ['UTF-8 아님', { raw: Buffer.from([0x7b, 0xff, 0xfe, 0x7d]) }, 'bad_json'],
    ['배열', { body: [batch([ev.start()])] }, 'bad_request'],
    ['너무 깊음', { raw: JSON.stringify({ v: 1, id: IID, sid: 'abcdefghijk', ev: [{ t: 'error', s: 1, msg: 'x', kind: 'error', fr: [[[['a']]]] }] }) }, 'bad_request'],
    ['v 가 1 아님', { body: batch([ev.start()], { v: 2 }) }, 'bad_request'],
    ['설치 id 형식', { body: batch([ev.start()], { id: 'user_hunter01' }) }, 'bad_request'],
    ['세션 id 형식', { body: batch([ev.start()], { sid: 'x' }) }, 'bad_request'],
    ['최상위 필드 추가', { body: batch([ev.start()], { account: 'hunter01' }) }, 'bad_request'],
    ['사건 0개', { body: batch([]) }, 'bad_request'],
    ['사건 51개', { body: batch(Array.from({ length: 51 }, () => ev.perf())) }, 'bad_request'],
    ['모르는 종류', { body: batch([{ t: 'click', s: 1 }]) }, 'bad_request'],
    ['모르는 필드', { body: batch([ev.death({ ip: '1.2.3.4' })]) }, 'bad_request'],
    ['필수 필드 없음', { body: batch([ev.death({ cause: undefined })]) }, 'bad_request'],
    ['s 없음', { body: batch([{ ...ev.perf(), s: undefined }]) }, 'bad_request'],
    ['범위 밖 fps', { body: batch([ev.perf({ fps: 1000 })]) }, 'bad_request'],
    ['정수 아님 x', { body: batch([ev.death({ x: 1.5 })]) }, 'bad_request'],
    ['id 대문자', { body: batch([ev.sstart({ stage: 'S01' })]) }, 'bad_request'],
    ['id 41자', { body: batch([ev.sstart({ hero: 'a'.repeat(41) })]) }, 'bad_request'],
    ['enum 밖 plat', { body: batch([ev.start({ plat: 'desktop' })]) }, 'bad_request'],
    ['원인 형식', { body: batch([ev.death({ cause: 'enemy:Skeleton King' })]) }, 'bad_request'],
    ['메시지 301자', { body: batch([ev.error({ msg: 'x'.repeat(301) })]) }, 'bad_request'],
    ['메시지 제어 문자', { body: batch([ev.error({ msg: 'a\nb' })]) }, 'bad_request'],
    ['프레임 6개', { body: batch([ev.error({ fr: Array.from({ length: 6 }, (_, i) => `a.js:${i}:1`) })]) }, 'bad_request'],
    ['프레임에 주소', { body: batch([ev.error({ fr: ['https://evil.example/a.js:1:2'] })]) }, 'bad_request'],
    ['프레임에 쿼리', { body: batch([ev.error({ fr: ['src/a.js?v=1:1:2'] })]) }, 'bad_request'],
    ['불리언 아님 win', { body: batch([ev.boss({ win: 1 })]) }, 'bad_request'],
    ['문자열 숫자', { body: batch([ev.arcade({ score: '100' })]) }, 'bad_request'],
    ['모르는 아케이드 모드', { body: batch([ev.arcade({ mode: 'towers' })]) }, 'bad_request'],
    ['화면 크기 형식', { body: batch([ev.start({ vp: '800*300' })]) }, 'bad_request'],
    ['빌드 이름에 공백', { body: batch([ev.start({ b: '1.0 beta' })]) }, 'bad_request'],
    ['좋은 사건 뒤의 나쁜 사건', { body: batch([ev.start(), ev.death({ lv: 0 })]) }, 'bad_request'],
  ];
  for (const [name, o, code] of bad) {
    const r = await call('POST', '/api/t', { ...o });
    assert.equal(r.status, 400, `${name}: ${r.status} ${r.text}`);
    assert.equal(r.body?.error, code, `${name}: ${r.text}`);
  }
  assert.equal(keys('raw/').length, 0, '거절한 묶음은 저장하지 않는다');
  // 선택 필드는 없거나 null 이어도 된다
  assert.equal((await post(batch([ev.start({ cores: null, mem: undefined }), ev.error({ scene: null, stage: undefined, room: undefined, fr: [] })]))).status, 204);
  // 무한의 탑 정산 (wave 칸 = 돌파한 층)
  assert.equal((await post(batch([ev.arcade({ mode: 'tower', wave: 23, bosses: 2 })]))).status, 204);
});

test('저장 전에 오류 문구의 주소·메일·IP·긴 토큰을 가린다', async () => {
  const msg = 'Failed https://blood.example.app/src/x.js for me@mail.example.com from 192.168.0.12 tok ' + 'Z'.repeat(40);
  assert.equal((await post(batch([ev.error({ msg })]))).status, 204);
  const doc = await store().get(keys('raw/')[0], { type: 'json' });
  const m = doc.ev[0].msg;
  assert.ok(!/blood\.example|mail\.example|192\.168|ZZZZ/.test(m), m);
  assert.match(m, /\/src\/x\.js/); assert.match(m, /\[email\]/); assert.match(m, /\[ip\]/); assert.match(m, /\[redacted\]/);
});

test('크기: 32KB 넘는 본문 → 413 (Content-Length 를 믿지 않고 실제로 센다)', async () => {
  const big = JSON.stringify(batch([ev.error({ msg: 'x'.repeat(300) })])).replace('"ev"', `"pad":"${'p'.repeat(cfg.TELEMETRY.bodyMax)}","ev"`);
  expectErr(await call('POST', '/api/t', { raw: big }), 413, 'payload_too_large');
  // 스트림(길이 헤더 없음)으로도
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  expectErr(await call('POST', '/api/t', { raw: stream }), 413, 'payload_too_large');
  // 50건 × 큰 오류는 32KB 안: 통과
  const ok = batch(Array.from({ length: 50 }, (_, i) => ev.error({ msg: `${'가'.repeat(150)} ${i}` })));
  const n = Buffer.byteLength(JSON.stringify(ok));
  assert.ok(n < cfg.TELEMETRY.bodyMax, `${n}`);
  assert.equal((await post(ok)).status, 204);
});

test('망별 제한: 10분에 120묶음, 다음은 429 + Retry-After, 다른 망·다음 창은 통과. 망 키는 bn-ratelimit 에만', async () => {
  const ip = freshIp();
  for (let i = 0; i < cfg.TELEMETRY.ipMax; i++) assert.equal((await post(batch([ev.perf()]), { ip })).status, 204, `#${i}`);
  const r = await post(batch([ev.perf()]), { ip });
  expectErr(r, 429, 'rate_limited');
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal((await post(batch([ev.perf()]), { ip: '203.0.113.250' })).status, 204);
  assert.equal(keys('raw/').length, cfg.TELEMETRY.ipMax + 1);
  const lim = backend.keys('site', cfg.STORES.limits).filter((k) => k.includes('/ip/tel/'));
  assert.equal(lim.length, 2, JSON.stringify(lim));
  assert.ok(!lim.some((k) => k.includes(ip)), '망 키에 IP 원문이 없다');
  advance(11 * MIN);
  assert.equal((await post(batch([ev.perf()]), { ip })).status, 204);
  // 정리: 창이 끝나고 몇 시간 뒤 카운터는 지워진다
  advance(4 * HOUR);
  const c = new rt.Ctx(new Request('https://cleanup.local/'), { deploy: { context: 'production' } });
  await runCleanup(c);
  assert.equal(backend.keys('site', cfg.STORES.limits).filter((k) => k.includes('/ip/tel/')).length, 0);
});

// ── 모으기 ──
const aggCtx = () => new rt.Ctx(new Request('https://agg.local/'), { deploy: { context: 'production' } });
async function seedTwoHours() {
  // 10시 칸: 세션 2 (web/android, apk/android) · 스테이지 시작 3 · 사망 3 (r2 두 번 같은 칸) · 클리어 2 · 보스 2승 1패 · 오류 같은 것 2 · 성능 2 · 아케이드 1
  await post(batch([ev.start(), ev.sstart(), ev.death(), ev.death({ s: 120 }), ev.error(), ev.perf(), ev.clear({ time: 245.5, deaths: 2 }), ev.boss({ win: false, dur: 30 }), ev.boss({ dur: 62.5 })]));
  await post(batch([ev.start({ plat: 'apk', br: 'webview', input: 'touch' }), ev.sstart(), ev.death({ room: 'r3', x: 3, y: 4, cause: 'boss:b_nightwing' }), ev.error({ msg: 'TypeError: x is undefined' }), ev.perf({ fps: 31, p5: 12, tier: 'low' }), ev.clear({ time: 180, deaths: 0, rank: 'S' })]));
  advance(HOUR); // 11시 칸
  await post(batch([ev.start({ os: 'ios', br: 'safari' }), ev.sstart({ diff: 'hard' }), ev.boss({ boss: 'b_banshee', stage: 's02', dur: 90 }), ev.arcade(), ev.error({ msg: 'RangeError: bad 17', fr: ['src/a.js:1:1'] }), ev.error({ msg: 'RangeError: bad 18', fr: ['src/a.js:1:1'] })]));
}

test('모으기: 끝난 시간 칸만, 시간·날 요약 숫자가 맞다', async () => {
  await seedTwoHours(); // 지금 11:20
  let r = await tel.runAggregation(aggCtx());
  assert.equal(r.hours, 1, '끝난 10시 칸만 (11시 칸은 아직 쓰이는 중)'); assert.equal(r.raws, 2);
  advance(43 * MIN); // 12:03 — 11시 칸은 끝났지만 유예 5분 안
  assert.equal((await tel.runAggregation(aggCtx())).hours, 0);
  advance(3 * MIN); // 12:06
  r = await tel.runAggregation(aggCtx());
  assert.equal(r.hours, 1, JSON.stringify(r)); assert.equal(r.raws, 1); assert.deepEqual(r.days, ['2026-10-01']);
  assert.deepEqual(keys('hour/'), ['hour/2026-10-01/10', 'hour/2026-10-01/11']);
  const day = await store().get('agg/2026-10-01', { type: 'json' });
  assert.equal(day.batches, 3); assert.equal(day.events, 21); assert.equal(day.sessions, 3); assert.equal(day.hours, 2);
  assert.deepEqual(day.dev.plat, { web: 2, apk: 1 }); assert.deepEqual(day.dev.os, { android: 2, ios: 1 }); assert.equal(day.dev.br.webview, 1);
  assert.deepEqual(day.starts, { 's01|normal': 2, 's01|hard': 1 });
  assert.equal(day.deaths.s01.n, 3);
  assert.deepEqual(day.deaths.s01.rooms.r2.cells, { '14,9': 2 });
  assert.deepEqual(day.deaths.s01.causes, { 'enemy:skeleton': 2, 'boss:b_nightwing': 1 });
  assert.deepEqual(day.clears['s01|normal'].rank, { A: 1, S: 1 }); assert.equal(day.clears['s01|normal'].deaths, 2); assert.equal(day.clears['s01|normal'].deathless, 1);
  assert.deepEqual(day.bosses.b_nightwing, { win: 1, lose: 1, dur: { 62: 1 } });
  assert.equal(day.arcade.survival.n, 1); assert.deepEqual(day.arcade.survival.wave, { 12: 1 });
  const errs = Object.values(day.errors);
  assert.equal(errs.length, 2, '같은 문구+첫 프레임은 한 묶음, 숫자만 다른 문구도 한 묶음');
  assert.deepEqual(errs.map((e) => e.n).sort(), [2, 2]);
  assert.equal(errs.find((e) => e.msg.startsWith('TypeError')).plat, 'web');
  assert.equal(day.summary.bosses.b_nightwing.winRate, 0.5);
  assert.equal(day.summary.clears['s01|normal'].time.p50, 180);
  assert.equal(day.perf.n, 2); assert.deepEqual(day.perf.fps, { 30: 1, 55: 1 });
  // 요약에는 설치 id·세션 id 가 없다
  assert.ok(!JSON.stringify(day).includes(IID));
  assert.ok(!/"sid"|"id"\s*:/.test(JSON.stringify(day)));
});

test('모으기 멱등: 다시 돌려도 · 중간에 실패해도 · 늦게 들어온 원본이 있어도 두 번 세지 않는다', async () => {
  await seedTwoHours();
  advance(46 * MIN);
  await tel.runAggregation(aggCtx());
  const first = await store().get('agg/2026-10-01', { type: 'json' });
  const strip = (d) => ({ ...d, at: 0 });
  // 1) 그대로 다시
  const r2 = await tel.runAggregation(aggCtx());
  assert.equal(r2.hours, 0);
  assert.deepEqual(strip(await store().get('agg/2026-10-01', { type: 'json' })), strip(first));
  // 2) 늦은 원본: 이미 모은 10시 칸에 원본 하나 더 (시계가 어긋난 서버 등) → 그 칸만 다시 계산, 새 사건 한 번만 더해짐
  await store().setJSON('raw/2026-10-01/10/lateLATE0001', { ...batch([ev.death({ room: 'r9' })]), at: T });
  const r3 = await tel.runAggregation(aggCtx());
  assert.equal(r3.hours, 1); assert.equal(r3.raws, 3);
  const after = await store().get('agg/2026-10-01', { type: 'json' });
  assert.equal(after.deaths.s01.n, first.deaths.s01.n + 1);
  assert.equal(after.batches, first.batches + 1);
  assert.equal(after.sessions, first.sessions);
  // 3) 날 요약을 쓴 뒤 state 를 쓰기 전에 실패 → 다음 실행이 같은 칸을 다시 계산 (더하지 않고 새로 씀)
  await store().setJSON('raw/2026-10-01/11/lateLATE0002', { ...batch([ev.perf()]), at: T });
  backend.hook = async (op, st, key) => { if (op === 'setJSON' && key === 'state/agg') throw new Error('simulated crash'); };
  await assert.rejects(tel.runAggregation(aggCtx()), /simulated crash/);
  backend.hook = null;
  const mid = await store().get('agg/2026-10-01', { type: 'json' });
  assert.equal(mid.perf.n, after.perf.n + 1);
  const r4 = await tel.runAggregation(aggCtx());
  assert.equal(r4.hours, 1);
  const fin = await store().get('agg/2026-10-01', { type: 'json' });
  assert.equal(fin.perf.n, after.perf.n + 1, '실패 뒤 다시 돌려도 한 번만');
  assert.equal(fin.batches, after.batches + 1);
  // 예약 함수 진입점: 204, 저장소 오류에도 던지지 않음
  assert.equal(aggFn.config.schedule, '@hourly');
  assert.equal(aggFn.config.path, undefined, '예약 함수는 URL 로 부를 수 없어야 한다');
  backend.failAll = true;
  const res = await aggFn.default(new Request('https://agg.local/', { method: 'POST', body: '{"next_run":"x"}' }), { deploy: { context: 'production' } });
  backend.failAll = false;
  assert.equal(res.status, 204);
});

test('모으기: 한 번에 읽는 원본 수 상한을 넘으면 나머지 칸은 다음 실행', async () => {
  const st = store();
  for (let h = 0; h < 3; h++) for (let i = 0; i < 4; i++) await st.setJSON(`raw/2026-10-01/0${h}/k${h}${i}xxxxxxxxx`, { ...batch([ev.perf()]), at: T });
  // 상한 5: 첫 칸(4개)만 → 남은 두 칸은 다음 실행들에서 (칸은 쪼개지 않는다)
  let r = await tel.runAggregation(aggCtx(), { maxRaw: 5 });
  assert.equal(r.hours, 1); assert.equal(r.pending, 2);
  assert.equal((await st.get('agg/2026-10-01', { type: 'json' })).perf.n, 4);
  r = await tel.runAggregation(aggCtx(), { maxRaw: 5 });
  assert.equal(r.hours, 1); assert.equal(r.pending, 1);
  r = await tel.runAggregation(aggCtx(), { maxRaw: 5 });
  assert.equal(r.hours, 1); assert.equal(r.pending, 0);
  assert.equal((await tel.runAggregation(aggCtx())).hours, 0);
  assert.equal((await st.get('agg/2026-10-01', { type: 'json' })).perf.n, 12);
});

test('GET /api/stats: 최근 N일 합치기, 짧은 캐시, 식별 정보 없음, days 검사', async () => {
  await seedTwoHours();
  advance(46 * MIN);
  await tel.runAggregation(aggCtx());
  advance(DAY); // 다음 날: 하루치 더
  await post(batch([ev.start(), ev.death({ stage: 's02', room: 'r1', x: 1, y: 2 }), ev.clear({ stage: 's02', time: 400 })]));
  advance(HOUR + 10 * MIN);
  await tel.runAggregation(aggCtx());
  const r = await call('GET', '/api/stats?days=7');
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=60');
  const b = r.body;
  assert.equal(b.ok, true); assert.equal(b.days, 7); assert.equal(b.daily.length, 7); assert.equal(b.to, '2026-10-02');
  assert.equal(b.totals.sessions, 4);
  assert.deepEqual(b.daily.slice(-2).map((d) => d.sessions), [3, 1]);
  assert.equal(b.totals.deaths.s02.n, 1); assert.equal(b.totals.deaths.s01.n, 3);
  assert.equal(b.summary.clears['s02|normal'].time.p50, 400);
  assert.ok(b.summary.deathSpots.length >= 3);
  assert.ok(b.summary.topErrors.length === 2 && b.summary.topErrors[0].n === 2);
  assert.ok(!r.text.includes(IID) && !/"sid"/.test(r.text), '설치·세션 id 가 공개 통계에 없다');
  const one = await call('GET', '/api/stats?days=1');
  assert.equal(one.body.totals.sessions, 1);
  assert.equal((await call('GET', '/api/stats')).body.days, 7);
  for (const q of ['0', '31', 'abc', '-1', '1.5', '007']) expectErr(await call('GET', `/api/stats?days=${q}`), 400, 'bad_request');
  assert.equal((await call('GET', '/api/stats?days=30')).status, 200);
});

test('보고서: report.mjs --file <stats.json> 이 한 파일짜리 HTML 을 만든다 (외부 자원 없음)', async () => {
  await seedTwoHours();
  advance(46 * MIN);
  await tel.runAggregation(aggCtx());
  const r = await call('GET', '/api/stats?days=7');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-tel-'));
  const json = path.join(dir, 'stats.json'), html = path.join(dir, 'report.html');
  fs.writeFileSync(json, r.text);
  const p = spawnSync(process.execPath, [path.join(ROOT, 'tools/telemetry/report.mjs'), '--file', json, '--out', html], { encoding: 'utf8' });
  assert.equal(p.status, 0, p.stderr + p.stdout);
  const out = fs.readFileSync(html, 'utf8');
  for (const h of ['많이 난 오류', '사망 지점', '클리어 시간', '보스', '아케이드', '기기', '성능', '불타는 마을', '나이트윙', '해골 병사', 'TypeError: x is undefined']) assert.ok(out.includes(h), h);
  assert.ok(out.includes('<svg class="map"'), '방 지도');
  assert.ok(!/<script|src="http|href="http/.test(out), '스크립트·외부 자원 없음');
  assert.ok(!out.includes(IID));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('정리: 30일 지난 raw/·hour/ 는 지우고 agg/·state/ 와 최근 원본은 남긴다', async () => {
  await post(batch([ev.start()]));
  advance(2 * HOUR);
  await tel.runAggregation(aggCtx());
  advance(31 * DAY);
  await post(batch([ev.start()])); // 최근 원본
  const c = new rt.Ctx(new Request('https://cleanup.local/'), { deploy: { context: 'production' } });
  const rep = await runCleanup(c);
  assert.equal(rep.telemetry.deleted, 2, JSON.stringify(rep)); // 옛 raw 1 + hour 1
  assert.equal(keys('raw/').length, 1);
  assert.equal(keys('hour/').length, 0);
  assert.deepEqual(keys('agg/'), ['agg/2026-10-01']);
  assert.deepEqual(keys('state/'), ['state/agg']);
  const fn = await import(path.join(ROOT, 'netlify/functions/cleanup.mts'));
  assert.equal(fn.config.schedule, '@daily');
});

test('회차 ng (docs/specs/ngplus.md §7): 네 사건에 선택 정수 1–9, 그 밖은 거절 · 모으기는 회차 칸을 따로', async () => {
  const four = [ev.sstart, ev.clear, ev.death, ev.boss];
  // ng 2 가 든 stage_clear 통과 (네 사건 모두, 1과 9 경계도)
  assert.equal((await post(batch([ev.clear({ ng: 2 })]))).status, 204);
  assert.equal((await post(batch(four.map((m) => m({ ng: 1 }))))).status, 204);
  assert.equal((await post(batch(four.map((m) => m({ ng: 9 }))))).status, 204);
  assert.equal((await post(batch(four.map((m) => m({ ng: null }))))).status, 204, 'null = 없음 (선택 필드)');
  for (const bad of [0, 10, '2', 2.5, -1, true, [2]]) {
    for (const m of four) {
      const r = await post(batch([m({ ng: bad })]));
      assert.equal(r.status, 400, `ng ${JSON.stringify(bad)} (${m().t}): ${r.status}`);
    }
  }
  // 다른 사건에는 ng 가 없다
  for (const m of [ev.arcade, ev.start, ev.perf, ev.error]) assert.equal((await post(batch([m({ ng: 2 })]))).status, 400, `${m().t} 에 ng 는 모르는 필드`);
  assert.ok(tel.checkEvent(ev.clear({ ng: 2 }))?.ng === 2);
  // 모으기: 회차 시작·클리어는 '<난이도>_ng<n>' 칸, 회차 사망·보스는 1회차 표에 섞지 않는다 (사건 수에는 센다)
  const a = tel.emptyAgg();
  tel.foldBatch(a, { ev: [ev.sstart(), ev.sstart({ ng: 2 }), ev.clear({ ng: 2, time: 60 }), ev.clear(), ev.death({ ng: 2 }), ev.boss({ ng: 2 }), ev.death()] });
  assert.deepEqual(a.starts, { 's01|normal': 1, 's01|normal_ng2': 1 });
  assert.equal(a.clears['s01|normal'].n, 1); assert.equal(a.clears['s01|normal_ng2'].n, 1);
  assert.equal(a.deaths.s01.n, 1); assert.deepEqual(a.bosses, {});
  assert.equal(a.events, 7); assert.equal(a.types.death, 2); assert.equal(a.types.boss_result, 1);
  const sum = tel.summarize(a);
  assert.equal(sum.clears['s01|normal_ng2'].stage, 's01'); assert.equal(sum.clears['s01|normal_ng2'].diff, 'normal_ng2'); assert.equal(sum.clears['s01|normal_ng2'].starts, 1);
});

test('요약 합치기: 교환 법칙(순서와 무관) · 오류·칸 수 상한', () => {
  const a = tel.emptyAgg(), b = tel.emptyAgg();
  tel.foldBatch(a, { ev: [ev.start(), ev.death(), ev.error()] });
  tel.foldBatch(b, { ev: [ev.start({ plat: 'pwa' }), ev.death({ x: 99 }), ev.clear()] });
  const ab = tel.mergeAgg(tel.mergeAgg(tel.emptyAgg(), a), b), ba = tel.mergeAgg(tel.mergeAgg(tel.emptyAgg(), b), a);
  assert.deepEqual(JSON.parse(JSON.stringify(ab)), JSON.parse(JSON.stringify(ba)));
  const many = tel.emptyAgg();
  tel.foldBatch(many, { ev: Array.from({ length: 120 }, (_, i) => ev.error({ msg: `E${'abcdefghij'[i % 10]}${String.fromCharCode(65 + (i % 26))}${i}x`, fr: [`f${i}.js:1:1`] })) });
  assert.ok(Object.keys(many.errors).length <= cfg.TELEMETRY.keepErrors);
  const cells = tel.emptyAgg();
  tel.foldBatch(cells, { ev: Array.from({ length: 50 }, (_, i) => ev.death({ x: i })) });
  assert.equal(Object.keys(cells.deaths.s01.rooms.r2.cells).length, cfg.TELEMETRY.keepCells);
  assert.equal(tel.bucket2(37.9), 37); assert.equal(tel.bucket2(125), 120); assert.equal(tel.bucket2(98765), 98000); assert.equal(tel.bucket2(0), 0);
  assert.equal(tel.pct({ 10: 1, 20: 2, 30: 1 }, 0.5), 20); assert.equal(tel.pct({}, 0.5), null);
});

test('클라이언트·서버 계약: 사건 종류와 필수 필드가 같다, 클라이언트 오류 정리 결과가 서버 검사를 통과한다', () => {
  assert.deepEqual([...client.TELEMETRY_TYPES].sort(), [...tel.EVENT_TYPES].sort());
  for (const [t, spec] of Object.entries(tel.EVENT_FIELDS)) {
    assert.deepEqual([...client.TELEMETRY_REQUIRED[t]].sort(), Object.keys(spec).filter((k) => !spec[k].opt).sort(), `${t} 필수 필드`);
  }
  const fr = client.stackFrames('TypeError: a\n    at World.update (https://blood.example/src/game/world.js?v=abc:12:34)\n    at https://blood.example/src/bundle/0c0316e1/app.js:1:99999\nupd@https://x.example/src/core/game.js#h:3:4');
  assert.deepEqual(fr, ['src/game/world.js:12:34', 'src/bundle/0c0316e1/app.js:1:99999', 'src/core/game.js:3:4']);
  assert.equal(client.stackFrames('Error\n    at chrome-extension://abcdef/content.js:1:2'), null, '확장 프로그램 오류는 보내지 않는다');
  const msg = client.cleanMessage('Failed to fetch dynamically imported module: https://blood.example/src/bundle/x/lazy-3.js?v=1 user@mail.example');
  assert.equal(msg, 'Failed to fetch dynamically imported module: /src/bundle/x/lazy-3.js [email]');
  assert.ok(tel.checkEvent({ t: 'error', s: 1, msg, fr, kind: 'error' }), '클라이언트가 만든 오류 사건은 서버 검사를 통과');
  // 문 지기 (자동화·로컬·개발 스위치)
  const G = (search, host, proto, nav = {}, win = {}) => client.telemetryGate({ search, hostname: host, protocol: proto }, nav, win);
  assert.equal(G('', 'blood.example', 'https:').ok, true);
  assert.equal(G('', 'blood.example', 'https:', { webdriver: true }).why, 'webdriver');
  assert.equal(G('?telemetry=1', 'blood.example', 'https:', { webdriver: true }).ok, true);
  assert.equal(G('?telemetry=0', 'blood.example', 'https:').ok, false);
  assert.equal(G('', 'localhost', 'http:').ok, false);
  assert.equal(G('?telemetry=1', 'localhost', 'http:').ok, true);
  assert.equal(G('?telemetry=1', '192.168.0.2', 'http:').ok, false);
  for (const p of ['debug', 'scene=stage', 'nosw', 'feelstats', 'painted=0', 'lo=1', 'stage=s01', 'qa', 'ng=2']) assert.equal(G(`?${p}`, 'blood.example', 'https:').why, 'dev', p);
  assert.equal(G('?telemetry=1', 'claude.ai', 'https:').ok, false);
  assert.equal(G('', 'appassets.androidplatform.net', 'https:', {}, { __BN_APP: { apiProxy: true } }).ok, true);
  assert.equal(G('', 'appassets.androidplatform.net', 'https:', {}, { __BN_APP: { apiProxy: false } }).why, 'app');
});

// ── 실행 ──
let pass = 0, failN = 0;
const t0 = Date.now();
for (const t of tests) {
  if (FILTER && !t.name.includes(FILTER)) continue;
  backend = createMemoryBackend();
  rt.setStoreFactory((name, dc) => backend.factory(name, dc));
  T = Date.UTC(2026, 9, 1, 10, 20, 0);
  sidSeq = 0;
  freshIp();
  try {
    await t.fn();
    pass++;
    console.log(`  ✓ ${t.name}`);
  } catch (e) {
    failN++;
    console.log(`  ✗ ${t.name}\n      ${String(e?.stack ?? e).split('\n').slice(0, 8).join('\n      ')}`);
  }
}
rt.setStoreFactory(null);
rt.setClock(null);
console.log(`\n[telemetry] 통과 ${pass}, 실패 ${failN} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
process.exit(failN ? 1 : 0);
