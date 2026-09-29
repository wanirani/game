// 계정·클라우드 저장 API 테스트: node tools/accounts/test_api.mjs [--mode=memory|server|all] [--filter=문자열]
//  - memory: netlify/lib/runtime.mts 의 setStoreFactory 로 메모리 저장소(mem_store.mjs)를 주입 (동시성 테스트 포함)
//  - server: 실제 @netlify/blobs 클라이언트 + 로컬 BlobsServer (@netlify/blobs/server) — getStore/getDeployStore·조건부 쓰기 실사용 검증
// 핸들러(netlify/functions/api.mts)를 Request/Context 로 직접 호출한다. Node 22.18+ 의 타입 제거 기능으로 .mts 를 그대로 import 한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { createMemoryBackend } from './mem_store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const MODES = args.mode && args.mode !== 'all' ? [args.mode] : ['memory', 'server'];
const FILTER = typeof args.filter === 'string' ? args.filter : null;

// ── Netlify 전역 흉내 (Netlify.env 는 @netlify/blobs 도 쓰므로 get/set/has/delete/toObject 모두 필요) ──
const ENV = new Map();
globalThis.Netlify = {
  context: null,
  env: {
    get: (k) => ENV.get(k),
    set: (k, v) => { ENV.set(k, v); },
    has: (k) => ENV.has(k),
    delete: (k) => { ENV.delete(k); },
    toObject: () => Object.fromEntries(ENV),
  },
};

const api = (await import(path.join(ROOT, 'netlify/functions/api.mts'))).default;
const fnConfig = (await import(path.join(ROOT, 'netlify/functions/api.mts'))).config;
const rt = await import(path.join(ROOT, 'netlify/lib/runtime.mts'));
const cfg = await import(path.join(ROOT, 'netlify/lib/config.mts'));
const sval = await import(path.join(ROOT, 'netlify/lib/validate.mts'));
const scrypto = await import(path.join(ROOT, 'netlify/lib/crypto.mts'));
const { isValidSave: clientIsValidSave, DEFAULT_META } = await import(path.join(ROOT, 'src/core/save.js'));
const { newGameState } = await import(path.join(ROOT, 'src/game/state.js'));
const { CHARACTERS } = await import(path.join(ROOT, 'src/data/characters.js'));

// ── 시계 ──
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);
let T = T0;
rt.setClock(() => T);
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const advance = (ms) => { T += ms; };

// ── 요청 도우미 ──
let ipSeq = 0;
let IP = '198.51.100.1';
const freshIp = () => { ipSeq++; IP = `203.0.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`; return IP; };
let DEPLOY = 'production';
const SECRETS = new Set(); // 평문으로 저장되면 안 되는 값 (비밀번호, 복구 코드, 토큰)
const HANGUL = /[가-힣]/;

// ctype: 본문의 Content-Type (기본 application/json, null 이면 보내지 않음). ip: null 이면 context.ip 없음. deploy: null 이면 배포 문맥 없음
async function call(method, urlPath, { body, raw, token, auth, ip = IP, headers = {}, deploy = DEPLOY, ctype } = {}) {
  const h = new Headers(headers);
  let payload;
  if (raw !== undefined) payload = raw;
  else if (body !== undefined) payload = JSON.stringify(body);
  if (payload !== undefined && !h.has('content-type')) {
    const ct = ctype === undefined ? 'application/json' : ctype;
    if (ct) h.set('content-type', ct);
  }
  if (token) h.set('authorization', `Bearer ${token}`);
  if (auth) h.set('authorization', auth);
  const init = { method, headers: h };
  if (payload !== undefined) { init.body = payload; init.duplex = 'half'; }
  const req = new Request('https://game.test' + urlPath, init);
  const ctx = { requestId: 'test' };
  if (ip !== null) ctx.ip = ip;
  if (deploy !== null) ctx.deploy = { context: deploy, id: '0123456789abcdef01234567', published: deploy === 'production' };
  const res = await api(req, ctx);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 아래에서 실패 처리 */ }
  // 모든 응답 공통 계약
  assert.ok(json && typeof json === 'object' && typeof json.ok === 'boolean', `JSON {ok} 응답이 아님: ${res.status} ${text.slice(0, 200)}`);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('access-control-allow-origin'), null, 'CORS 헤더가 있으면 안 됨');
  // 게임 데이터(data) 안의 필드(아이템 uid 등)는 빼고 API 가 만든 필드만 검사
  const envelope = json && typeof json === 'object' ? JSON.stringify({ ...json, data: undefined, server: json.server ? { ...json.server, data: undefined } : undefined }) : text;
  assert.ok(!/"(pw|rc|salt|hash|uid|sessions|stack|etag)"\s*:/.test(envelope), `내부 필드 노출: ${envelope.slice(0, 200)}`);
  assert.ok(!/\bat .+:\d+:\d+/.test(text), '스택 트레이스 노출');
  if (!json.ok) {
    assert.equal(typeof json.error, 'string');
    assert.ok(typeof json.message === 'string' && HANGUL.test(json.message), `한국어 message 없음: ${text}`);
    assert.ok(res.status >= 400, '실패인데 2xx');
  } else {
    assert.ok(res.status < 300, `성공인데 ${res.status}`);
  }
  return { status: res.status, body: json, headers: res.headers, text };
}

function expectErr(r, status, code) {
  assert.equal(r.status, status, `기대 ${status} ${code}, 실제 ${r.status} ${r.text}`);
  assert.equal(r.body.ok, false);
  assert.equal(r.body.error, code, `기대 오류 ${code}, 실제 ${r.text}`);
}
function expectOk(r, status = 200) {
  assert.equal(r.status, status, `기대 ${status}, 실제 ${r.status} ${r.text}`);
  assert.equal(r.body.ok, true);
  return r.body;
}

let idSeq = 0;
const newId = (p = 'hunter') => `${p}${(++idSeq).toString().padStart(3, '0')}`.slice(0, 16);
const PW = 'crimson-moon-77';

async function signup(id = newId(), password = PW, extra = {}) {
  const r = await call('POST', '/api/auth/signup', { body: { id, password }, ...extra });
  const b = expectOk(r, 201);
  SECRETS.add(password); SECRETS.add(b.token); SECRETS.add(b.recoveryCode); SECRETS.add(b.recoveryCode.replace(/-/g, ''));
  return { id: b.id, token: b.token, recoveryCode: b.recoveryCode, password };
}
async function login(id, password = PW, extra = {}) {
  const r = await call('POST', '/api/auth/login', { body: { id, password }, ...extra });
  if (r.body.ok) SECRETS.add(r.body.token);
  return r;
}

function validSave(charId = 'kael') {
  const s = newGameState({ slot: 1, difficulty: 'normal', charId });
  s.savedAt = T;
  return s;
}

// ── 테스트 러너 ──
const tests = [];
const test = (name, fn, opts = {}) => tests.push({ name, fn, ...opts });

// ═════════ 라우팅·HTTP ═════════
test('함수 설정: path /api/*', () => { assert.equal(fnConfig.path, '/api/*'); });

test('GET /api/health → {ok, api:1, time} (인증·저장소 불필요)', async () => {
  const b = expectOk(await call('GET', '/api/health'));
  assert.deepEqual(b, { ok: true, api: 1, time: T });
  const r = await call('POST', '/api/health');
  expectErr(r, 405, 'method_not_allowed');
  assert.equal(r.headers.get('allow'), 'GET');
});

test('알 수 없는 경로 → 404 not_found (JSON)', async () => {
  expectErr(await call('GET', '/api/nope'), 404, 'not_found');
  expectErr(await call('GET', '/api'), 404, 'not_found');
  expectErr(await call('POST', '/api/auth'), 404, 'not_found');
  expectErr(await call('GET', '/api/saves/1/extra'), 404, 'not_found');
  expectErr(await call('GET', '/api/auth/me/x'), 404, 'not_found');
});

test('허용되지 않는 메서드 → 405 + Allow', async () => {
  const cases = [
    ['GET', '/api/auth/signup', 'POST'], ['GET', '/api/auth/login', 'POST'], ['GET', '/api/auth/logout', 'POST'],
    ['POST', '/api/auth/me', 'GET'], ['GET', '/api/auth/password', 'POST'], ['GET', '/api/auth/recover', 'POST'],
    ['POST', '/api/auth/account', 'DELETE'], ['GET', '/api/auth/account', 'DELETE'], ['GET', '/api/auth/account/delete', 'POST'],
    ['POST', '/api/saves', 'GET'], ['PATCH', '/api/saves', 'GET'], ['POST', '/api/saves/1', 'GET, PUT, DELETE'],
    ['DELETE', '/api/meta', 'GET, PUT'], ['OPTIONS', '/api/auth/login', 'POST'], ['HEAD', '/api/saves', 'GET'],
  ];
  for (const [m, p, allow] of cases) {
    const r = await call(m, p);
    expectErr(r, 405, 'method_not_allowed');
    assert.equal(r.headers.get('allow'), allow, `${m} ${p}`);
  }
});

test('끝 슬래시 허용 (/api/auth/me/ → 인증 필요)', async () => {
  expectErr(await call('GET', '/api/auth/me/'), 401, 'unauthorized');
});

test('JSON 본문 오류: 깨진 JSON·빈 본문·UTF-8 아님 → 400 bad_json, 객체 아님 → 400 bad_request', async () => {
  freshIp();
  expectErr(await call('POST', '/api/auth/login', { raw: '{"id":' }), 400, 'bad_json');
  expectErr(await call('POST', '/api/auth/login', { raw: '' }), 400, 'bad_json');
  expectErr(await call('POST', '/api/auth/login'), 400, 'bad_json');
  expectErr(await call('POST', '/api/auth/login', { raw: new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d]) }), 400, 'bad_json');
  for (const raw of ['[]', 'null', '"x"', '12', 'true']) expectErr(await call('POST', '/api/auth/login', { raw }), 400, 'bad_request');
  // BOM 이 붙은 UTF-8 JSON 은 허용 (형식 검사까지 진행)
  expectErr(await call('POST', '/api/auth/login', { raw: '\ufeff{"id":"nobody_here","password":"whatever1"}' }), 401, 'invalid_credentials');
});

test('본문 크기 제한: 인증 4KB 초과 → 413 (Content-Length 거짓이어도 실제로 센다)', async () => {
  freshIp();
  const big = JSON.stringify({ id: 'abcd', password: 'x'.repeat(5000) });
  expectErr(await call('POST', '/api/auth/login', { raw: big }), 413, 'payload_too_large');
  expectErr(await call('POST', '/api/auth/signup', { raw: big }), 413, 'payload_too_large');
  expectErr(await call('POST', '/api/auth/login', { raw: '{}', headers: { 'content-length': '999999' } }), 413, 'payload_too_large');
  // 정확히 4096 바이트는 통과
  const pad = 4096 - JSON.stringify({ id: 'nobody_here', password: 'whatever1', p: '' }).length;
  const exact = JSON.stringify({ id: 'nobody_here', password: 'whatever1', p: 'x'.repeat(pad) });
  assert.equal(Buffer.byteLength(exact), 4096);
  expectErr(await call('POST', '/api/auth/login', { raw: exact }), 401, 'invalid_credentials');
});

test('저장소 장애 → 500 server_error (내부 정보 없음)', async () => {
  const b = currentBackend;
  b.failAll = true;
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  try {
    const r = await call('POST', '/api/auth/login', { body: { id: 'someone', password: 'whatever1' }, ip: freshIp() });
    expectErr(r, 500, 'server_error');
    assert.ok(!r.text.includes('simulated'), '내부 오류 메시지 노출');
  } finally {
    b.failAll = false;
    console.error = orig;
  }
  assert.equal(errs.length, 1);
  assert.ok(!errs[0].includes('whatever1') && !errs[0].includes(IP), '로그에 비밀번호·IP 기록');
}, { memOnly: true });

// ═════════ 가입 ═════════
test('가입 성공: 201, 아이디 소문자 정규화, 토큰·복구 코드 형식', async () => {
  freshIp();
  const raw = `  Hunter_${++idSeq}A `;
  const r = await call('POST', '/api/auth/signup', { body: { id: raw, password: PW } });
  const b = expectOk(r, 201);
  assert.equal(b.id, raw.trim().toLowerCase());
  assert.match(b.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(b.recoveryCode, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  SECRETS.add(b.token); SECRETS.add(b.recoveryCode); SECRETS.add(b.recoveryCode.replace(/-/g, ''));
  const me = expectOk(await call('GET', '/api/auth/me', { token: b.token }));
  assert.equal(me.id, b.id);
  assert.equal(me.createdAt, T);
  // 대소문자만 다른 아이디는 중복
  expectErr(await call('POST', '/api/auth/signup', { body: { id: b.id.toUpperCase(), password: PW } }), 409, 'id_taken');
});

test('가입: 아이디 형식 오류 → 400 invalid_id', async () => {
  freshIp();
  const bad = ['abc', 'a'.repeat(17), '1abc', '_abcd', 'ab-cd', 'ab cd', 'abc.d', '한글아이디', 'abcé', '', '    ', null, 123, ['abcd'], { a: 1 }, undefined, 'ａｂｃｄｅ',
    // 저장소 키 주입·경로 조작 시도 (아이디가 bn-users 의 키가 된다)
    '../admin', 'abcd/../x', 'abcd/slot1', '%2e%2e%2fx', 'abcd\\x', 'abcd\u0000', '/abcd'];
  for (const id of bad) {
    freshIp(); // IP 제한(10분 20회)에 걸리지 않도록 매번 다른 IP
    expectErr(await call('POST', '/api/auth/signup', { body: { id, password: PW } }), 400, 'invalid_id');
  }
});

test('가입: 예약어 → 400 reserved_id', async () => {
  for (const id of ['admin', 'Root', 'SYSTEM', 'guest', 'null', 'undefined', 'admin_1', 'official_x', 'gm_kael', 'moderator9']) {
    freshIp();
    expectErr(await call('POST', '/api/auth/signup', { body: { id, password: PW } }), 400, 'reserved_id');
  }
});

test('가입: 비밀번호 규칙 (8~64자, 제어 문자 금지, 아이디와 달라야 함)', async () => {
  const id = newId();
  const bad = ['short7!', 'x'.repeat(65), 'abc\ndefgh', 'tab\there12', 'nul\u0000char1', 12345678, null, undefined, ['12345678'], '\u2028abcdefgh'];
  for (const password of bad) {
    freshIp();
    expectErr(await call('POST', '/api/auth/signup', { body: { id, password } }), 400, 'invalid_password');
  }
  freshIp();
  expectErr(await call('POST', '/api/auth/signup', { body: { id, password: id.toUpperCase() } }), 400, 'password_same_as_id');
  // 한글·이모지 비밀번호 (코드 포인트 기준 8자) 허용, 정확히 64자 허용
  freshIp();
  const k = await signup(newId(), '흡혈귀사냥꾼들아');
  expectOk(await login(k.id, '흡혈귀사냥꾼들아'), 200);
  freshIp();
  const e = await signup(newId(), '🦇🦇🦇🦇🌙🌙🌙🌙');
  expectOk(await login(e.id, '🦇🦇🦇🦇🌙🌙🌙🌙'), 200);
  freshIp();
  const long64 = 'nocturne-'.repeat(8).slice(0, 63) + '!';
  assert.equal([...long64].length, 64);
  const l = await signup(newId(), long64);
  expectOk(await login(l.id, long64), 200);
});

test('가입: IP당 1시간 5개 → 6번째 429 signup_limited', async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i++) await signup(newId(), PW, { ip });
  const r = await call('POST', '/api/auth/signup', { body: { id: newId(), password: PW }, ip });
  expectErr(r, 429, 'signup_limited');
  assert.ok(r.body.retryAfter > 3500 && r.body.retryAfter <= 3600, `retryAfter ${r.body.retryAfter}`);
  assert.equal(r.headers.get('retry-after'), String(r.body.retryAfter));
  await signup(newId(), PW, { ip: freshIp() }); // 다른 IP 는 가능
  advance(HOUR);
  await signup(newId(), PW, { ip });
});

test('가입: 같은 아이디 동시 가입 → 정확히 하나만 성공', async () => {
  const id = newId();
  const rs = await Promise.all([0, 1, 2, 3, 4].map(() => call('POST', '/api/auth/signup', { body: { id, password: PW }, ip: freshIp() })));
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  for (const r of rs.filter((x) => x.status !== 201)) expectErr(r, 409, 'id_taken');
  for (const r of rs) if (r.body.ok) { SECRETS.add(r.body.token); SECRETS.add(r.body.recoveryCode); }
}, { memOnly: true });

// ═════════ 로그인 ═════════
test('로그인: 성공(대소문자 무시), 틀린 비밀번호·없는 아이디는 같은 응답', async () => {
  freshIp();
  const u = await signup();
  const ok1 = expectOk(await login(u.id.toUpperCase()));
  assert.equal(ok1.id, u.id);
  assert.match(ok1.token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(ok1.token, u.token);
  const wrong = await login(u.id, 'not-the-password');
  const none = await login('nobody_' + idSeq, 'not-the-password');
  const badFmt = await login('!!', 'not-the-password');
  expectErr(wrong, 401, 'invalid_credentials');
  expectErr(none, 401, 'invalid_credentials');
  expectErr(badFmt, 401, 'invalid_credentials');
  assert.equal(wrong.text, none.text);
  assert.equal(wrong.text, badFmt.text);
  expectErr(await call('POST', '/api/auth/login', { body: { id: u.id } }), 400, 'bad_request');
  expectErr(await call('POST', '/api/auth/login', { body: { password: PW } }), 400, 'bad_request');
  expectErr(await call('POST', '/api/auth/login', { body: { id: u.id, password: 1234 } }), 400, 'bad_request');
  expectErr(await call('POST', '/api/auth/login', { body: { id: u.id, password: 'x'.repeat(300) } }), 400, 'bad_request');
});

test('로그인: 아이디+망별 5회 실패 → 그 망에서 10분 잠금 (맞는 비밀번호도 거부), 이후 해제·초기화', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const ip = freshIp();
  for (let i = 0; i < 4; i++) expectErr(await login(u.id, 'wrong-password', { ip }), 401, 'invalid_credentials');
  const r5 = await login(u.id, 'wrong-password', { ip });
  expectErr(r5, 429, 'locked');
  assert.equal(r5.body.retryAfter, 600);
  assert.equal(r5.headers.get('retry-after'), '600');
  const r6 = await login(u.id, PW, { ip });
  expectErr(r6, 429, 'locked');
  advance(5 * MIN);
  expectErr(await login(u.id, PW, { ip }), 429, 'locked');
  advance(5 * MIN + 1000);
  expectOk(await login(u.id, PW, { ip }));
  // 성공하면 그 망의 실패 횟수 초기화 → 다시 4번 틀려도 잠기지 않음
  for (let i = 0; i < 4; i++) expectErr(await login(u.id, 'wrong-password', { ip }), 401, 'invalid_credentials');
  expectOk(await login(u.id, PW, { ip }));
});

test('로그인: 없는 아이디도 똑같이 잠김 (계정 존재 여부 노출 없음)', async () => {
  const ghost = 'ghost_' + (++idSeq);
  const ip = freshIp();
  for (let i = 0; i < 4; i++) expectErr(await login(ghost, 'wrong-password', { ip }), 401, 'invalid_credentials');
  expectErr(await login(ghost, 'wrong-password', { ip }), 429, 'locked');
  // 아이디 전체 한도도 똑같이
  const ghost2 = 'ghost_' + (++idSeq);
  for (let i = 0; i < 19; i++) expectErr(await login(ghost2, 'wrong-password', { ip: freshIp() }), 401, 'invalid_credentials');
  expectErr(await login(ghost2, 'wrong-password', { ip: freshIp() }), 429, 'locked');
});

test('로그인: 실패 창(10분)이 지나면 실패 횟수 다시 셈', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const ip = freshIp();
  for (let i = 0; i < 4; i++) expectErr(await login(u.id, 'wrong-password', { ip }), 401, 'invalid_credentials');
  advance(10 * MIN + 1);
  expectErr(await login(u.id, 'wrong-password', { ip }), 401, 'invalid_credentials');
});

test('IP당 인증 시도 10분 20회 → 21번째 429 rate_limited, 다른 IP·10분 후 가능', async () => {
  const ip = freshIp();
  const u = await signup(newId(), PW, { ip: freshIp() });
  for (let i = 0; i < 20; i++) {
    const r = await login(i % 2 ? u.id : 'nobody_' + i, i % 2 ? PW : 'wrong-password', { ip });
    assert.ok(r.status !== 429 || r.body.error !== 'rate_limited', `${i + 1}번째에 이미 제한`);
  }
  const r = await login(u.id, PW, { ip });
  expectErr(r, 429, 'rate_limited');
  assert.ok(r.body.retryAfter > 0 && r.body.retryAfter <= 600);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  // 가입·복구도 같은 IP 제한을 받는다
  expectErr(await call('POST', '/api/auth/signup', { body: { id: newId(), password: PW }, ip }), 429, 'rate_limited');
  expectErr(await call('POST', '/api/auth/recover', { body: { id: u.id, recoveryCode: u.recoveryCode, newPassword: 'another-pass-1' }, ip }), 429, 'rate_limited');
  expectOk(await login(u.id, PW, { ip: freshIp() }));
  advance(10 * MIN);
  expectOk(await login(u.id, PW, { ip }));
});

test('AUTH_PEPPER: 설정 후 로그인하면 재해시, pepper 가 사라지면 오류 없이 로그인 실패', async () => {
  ENV.delete('AUTH_PEPPER');
  const u = await signup(newId(), PW, { ip: freshIp() });
  ENV.set('AUTH_PEPPER', 'test-pepper-value-0123456789');
  expectOk(await login(u.id, PW, { ip: freshIp() })); // pep:0 해시 검증 → pep:1 로 재해시
  expectOk(await login(u.id, PW, { ip: freshIp() }));
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  ENV.delete('AUTH_PEPPER');
  try {
    expectErr(await login(u.id, PW, { ip: freshIp() }), 401, 'invalid_credentials');
  } finally { console.error = orig; }
  assert.ok(errs.every((e) => !e.includes(PW)));
  ENV.set('AUTH_PEPPER', 'test-pepper-value-0123456789');
  expectOk(await login(u.id, PW, { ip: freshIp() }));
  // pepper 를 쓰는 동안 새로 가입한 계정
  const v = await signup(newId(), PW, { ip: freshIp() });
  expectOk(await login(v.id, PW, { ip: freshIp() }));
  ENV.delete('AUTH_PEPPER');
});

// ═════════ 세션 ═════════
test('세션: 토큰 없음·형식 오류·가짜 토큰 → 401 unauthorized + WWW-Authenticate', async () => {
  for (const auth of [undefined, 'Bearer', 'Bearer abc', 'Basic dXNlcjpwYXNz', `Bearer ${'A'.repeat(43)}`, `Bearer ${'A'.repeat(44)}`, `Token ${'A'.repeat(43)}`]) {
    const r = await call('GET', '/api/auth/me', { auth });
    expectErr(r, 401, 'unauthorized');
    assert.equal(r.headers.get('www-authenticate'), 'Bearer');
  }
  expectErr(await call('GET', '/api/saves'), 401, 'unauthorized');
  expectErr(await call('GET', '/api/meta'), 401, 'unauthorized');
});

test('세션: 소문자 bearer 도 허용', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  expectOk(await call('GET', '/api/auth/me', { auth: `bearer ${u.token}` }));
});

test('세션: 30일 만료, 7일 지나 사용하면 30일 연장(슬라이딩)', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const idle = expectOk(await login(u.id, PW, { ip: freshIp() })).token;
  advance(8 * DAY);
  expectOk(await call('GET', '/api/auth/me', { token: u.token })); // 연장 → 38일째 만료
  advance(22 * DAY); // 30일째
  expectErr(await call('GET', '/api/auth/me', { token: idle }), 401, 'unauthorized'); // 한 번도 안 쓴 세션은 만료
  expectOk(await call('GET', '/api/auth/me', { token: u.token })); // 다시 연장 → 60일째 만료
  advance(29 * DAY); // 59일째: 아직 유효 (다시 연장 → 89일째 만료)
  expectOk(await call('GET', '/api/auth/me', { token: u.token }));
  advance(30 * DAY + 1); // 89일째 + 1ms
  expectErr(await call('GET', '/api/auth/me', { token: u.token }), 401, 'unauthorized');
});

test('세션: 7일이 안 됐으면 연장하지 않음', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  advance(6 * DAY);
  expectOk(await call('GET', '/api/auth/me', { token: u.token }));
  advance(24 * DAY + 1); // 발급 후 30일 + 1ms
  expectErr(await call('GET', '/api/auth/me', { token: u.token }), 401, 'unauthorized');
});

test('세션: 사용자당 최대 10개, 넘으면 가장 오래된 것부터 폐기', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const tokens = [u.token];
  for (let i = 0; i < 10; i++) { advance(1000); tokens.push(expectOk(await login(u.id, PW, { ip: freshIp() })).token); }
  expectErr(await call('GET', '/api/auth/me', { token: tokens[0] }), 401, 'unauthorized');
  for (const t of tokens.slice(1)) expectOk(await call('GET', '/api/auth/me', { token: t }));
  advance(1000);
  tokens.push(expectOk(await login(u.id, PW, { ip: freshIp() })).token);
  expectErr(await call('GET', '/api/auth/me', { token: tokens[1] }), 401, 'unauthorized');
  expectOk(await call('GET', '/api/auth/me', { token: tokens[2] }));
});

test('로그아웃: 그 세션만 폐기', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const other = expectOk(await login(u.id, PW, { ip: freshIp() })).token;
  expectOk(await call('POST', '/api/auth/logout', { token: u.token }));
  expectErr(await call('GET', '/api/auth/me', { token: u.token }), 401, 'unauthorized');
  expectErr(await call('POST', '/api/auth/logout', { token: u.token }), 401, 'unauthorized');
  expectOk(await call('GET', '/api/auth/me', { token: other }));
  expectErr(await call('POST', '/api/auth/logout'), 401, 'unauthorized');
});

// ═════════ 비밀번호 변경 ═════════
test('비밀번호 변경: 오류 경로', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const body = (o, n) => ({ body: { oldPassword: o, newPassword: n }, token: u.token, ip: freshIp() });
  expectErr(await call('POST', '/api/auth/password', { body: { oldPassword: PW, newPassword: 'new-password-1' } }), 401, 'unauthorized');
  expectErr(await call('POST', '/api/auth/password', body('wrong-password', 'new-password-1')), 403, 'wrong_password');
  expectErr(await call('POST', '/api/auth/password', body(PW, 'short')), 400, 'invalid_password');
  expectErr(await call('POST', '/api/auth/password', body(PW, u.id)), 400, 'password_same_as_id');
  expectErr(await call('POST', '/api/auth/password', body(PW, PW)), 400, 'same_password');
  expectErr(await call('POST', '/api/auth/password', body(undefined, 'new-password-1')), 400, 'bad_request');
  expectErr(await call('POST', '/api/auth/password', { raw: 'nope', token: u.token }), 400, 'bad_json');
});

test('비밀번호 변경: 성공 → 다른 세션 폐기, 현재 세션 유지, 새 비밀번호로 로그인', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const other = expectOk(await login(u.id, PW, { ip: freshIp() })).token;
  const NEW = 'garlic-and-stakes-9';
  SECRETS.add(NEW);
  expectOk(await call('POST', '/api/auth/password', { body: { oldPassword: PW, newPassword: NEW }, token: u.token, ip: freshIp() }));
  expectOk(await call('GET', '/api/auth/me', { token: u.token }));
  expectErr(await call('GET', '/api/auth/me', { token: other }), 401, 'unauthorized');
  expectErr(await login(u.id, PW, { ip: freshIp() }), 401, 'invalid_credentials');
  expectOk(await login(u.id, NEW, { ip: freshIp() }));
});

test('비밀번호 변경: 현재 비밀번호 5회 틀리면 그 망에서 잠금 (로그인도 잠김), 다른 망은 영향 없음', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const ip = freshIp();
  const req = () => call('POST', '/api/auth/password', { body: { oldPassword: 'wrong-password', newPassword: 'new-password-1' }, token: u.token, ip });
  for (let i = 0; i < 4; i++) expectErr(await req(), 403, 'wrong_password');
  expectErr(await req(), 429, 'locked');
  expectErr(await login(u.id, PW, { ip }), 429, 'locked');
  expectErr(await call('POST', '/api/auth/account/delete', { body: { password: PW }, token: u.token, ip }), 429, 'locked');
  expectOk(await call('GET', '/api/auth/me', { token: u.token })); // 세션은 그대로
  expectOk(await login(u.id, PW, { ip: freshIp() }));
  advance(10 * MIN + 1);
  expectOk(await login(u.id, PW, { ip }));
});

// ═════════ 복구 코드 ═════════
test('복구: 성공 → 새 비밀번호·새 복구 코드·모든 세션 폐기, 이전 코드는 1회용', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const other = expectOk(await login(u.id, PW, { ip: freshIp() })).token;
  // 입력 정규화: 소문자, 하이픈 대신 공백, 0→o, 1→l
  const messy = ' ' + u.recoveryCode.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l') + ' ';
  const NEW = 'dawn-breaks-over-castle';
  SECRETS.add(NEW);
  const r = await call('POST', '/api/auth/recover', { body: { id: u.id.toUpperCase(), recoveryCode: messy, newPassword: NEW }, ip: freshIp() });
  const b = expectOk(r);
  assert.equal(b.id, u.id);
  assert.match(b.recoveryCode, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  assert.notEqual(b.recoveryCode, u.recoveryCode);
  SECRETS.add(b.recoveryCode); SECRETS.add(b.recoveryCode.replace(/-/g, '')); SECRETS.add(b.token);
  expectErr(await call('GET', '/api/auth/me', { token: u.token }), 401, 'unauthorized');
  expectErr(await call('GET', '/api/auth/me', { token: other }), 401, 'unauthorized');
  expectOk(await call('GET', '/api/auth/me', { token: b.token }));
  expectErr(await login(u.id, PW, { ip: freshIp() }), 401, 'invalid_credentials');
  expectOk(await login(u.id, NEW, { ip: freshIp() }));
  // 이전 코드 재사용 불가, 새 코드는 사용 가능
  expectErr(await call('POST', '/api/auth/recover', { body: { id: u.id, recoveryCode: u.recoveryCode, newPassword: 'third-password-3' }, ip: freshIp() }), 401, 'invalid_recovery');
  expectOk(await call('POST', '/api/auth/recover', { body: { id: u.id, recoveryCode: b.recoveryCode, newPassword: 'third-password-3' }, ip: freshIp() }));
  SECRETS.add('third-password-3');
});

test('복구: 오류 경로 (없는 아이디·틀린 코드·형식 오류는 같은 응답, 비밀번호 규칙은 먼저 검사)', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const rec = (body) => call('POST', '/api/auth/recover', { body, ip: freshIp() });
  const wrong = await rec({ id: u.id, recoveryCode: 'AAAA-BBBB-CCCC-DDDD', newPassword: 'new-password-1' });
  const none = await rec({ id: 'nobody_' + (++idSeq), recoveryCode: u.recoveryCode, newPassword: 'new-password-1' });
  const malformed = await rec({ id: u.id, recoveryCode: 'abc', newPassword: 'new-password-1' });
  const badId = await rec({ id: '!!!', recoveryCode: u.recoveryCode, newPassword: 'new-password-1' });
  for (const r of [wrong, none, malformed, badId]) expectErr(r, 401, 'invalid_recovery');
  assert.equal(wrong.text, none.text);
  assert.equal(wrong.text, malformed.text);
  expectErr(await rec({ id: u.id, recoveryCode: u.recoveryCode, newPassword: 'short' }), 400, 'invalid_password');
  expectErr(await rec({ id: u.id, recoveryCode: u.recoveryCode, newPassword: u.id }), 400, 'password_same_as_id');
  expectErr(await rec({ id: u.id, newPassword: 'new-password-1' }), 400, 'bad_request');
  expectErr(await rec({ recoveryCode: u.recoveryCode, newPassword: 'new-password-1' }), 400, 'bad_request');
  // 여기까지 코드 실패 2회(wrong, malformed) → 아직 잠기지 않음, 올바른 코드로 성공
  expectOk(await rec({ id: u.id, recoveryCode: u.recoveryCode, newPassword: 'new-password-1' }));
});

test('복구: 같은 망에서 5회 틀리면 10분 잠금, 복구하면 로그인 잠금(망별·전체)도 풀림', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const ip = freshIp();
  const rec = (code, from = ip) => call('POST', '/api/auth/recover', { body: { id: u.id, recoveryCode: code, newPassword: 'new-password-1' }, ip: from });
  for (let i = 0; i < 4; i++) expectErr(await rec('ZZZZ-ZZZZ-ZZZZ-ZZZZ'), 401, 'invalid_recovery');
  const r = await rec('ZZZZ-ZZZZ-ZZZZ-ZZZZ');
  expectErr(r, 429, 'locked');
  assert.equal(r.body.retryAfter, 600);
  expectErr(await rec(u.recoveryCode), 429, 'locked');
  advance(10 * MIN + 1);
  // 로그인 잠금(한 망 + 아이디 전체)을 만든 뒤 복구로 풀기
  const lockedNet = freshIp();
  for (let i = 0; i < 5; i++) await login(u.id, 'wrong-password', { ip: lockedNet });
  for (let i = 0; i < 15; i++) await login(u.id, 'wrong-password', { ip: freshIp() });
  expectErr(await login(u.id, PW, { ip: lockedNet }), 429, 'locked');
  expectErr(await login(u.id, PW, { ip: freshIp() }), 429, 'locked');
  const b = expectOk(await rec(u.recoveryCode));
  SECRETS.add(b.recoveryCode); SECRETS.add(b.recoveryCode.replace(/-/g, '')); SECRETS.add(b.token);
  expectOk(await login(u.id, 'new-password-1', { ip: lockedNet }));
  expectOk(await login(u.id, 'new-password-1', { ip: freshIp() }));
  SECRETS.add('new-password-1');
});

// ═════════ 탈퇴 ═════════
test('탈퇴: 오류 경로', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  expectErr(await call('DELETE', '/api/auth/account', { body: { password: PW } }), 401, 'unauthorized');
  expectErr(await call('DELETE', '/api/auth/account', { body: { password: 'wrong-password' }, token: u.token, ip: freshIp() }), 403, 'wrong_password');
  expectErr(await call('DELETE', '/api/auth/account', { body: {}, token: u.token, ip: freshIp() }), 400, 'bad_request');
  expectErr(await call('DELETE', '/api/auth/account', { token: u.token, ip: freshIp() }), 400, 'bad_json');
  expectOk(await call('GET', '/api/auth/me', { token: u.token }));
});

test('탈퇴: 계정·세션·저장 데이터 모두 삭제, 같은 아이디 재가입 시 이전 데이터 없음', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const other = expectOk(await login(u.id, PW, { ip: freshIp() })).token;
  expectOk(await call('PUT', '/api/saves/1', { body: { data: validSave(), baseRev: 0 }, token: u.token }));
  expectOk(await call('PUT', '/api/saves/3', { body: { data: validSave('sera'), baseRev: 0 }, token: u.token }));
  expectOk(await call('DELETE', '/api/saves/3', { token: u.token })); // 묘비도 지워져야 함
  expectOk(await call('PUT', '/api/meta', { body: { data: structuredClone(DEFAULT_META), baseRev: 0 }, token: u.token }));
  const before = await storageKeys();
  assert.ok(before.some((k) => k.startsWith('bn-saves/')));
  expectOk(await call('DELETE', '/api/auth/account', { body: { password: PW }, token: u.token, ip: freshIp() }));
  expectErr(await call('GET', '/api/auth/me', { token: u.token }), 401, 'unauthorized');
  expectErr(await call('GET', '/api/auth/me', { token: other }), 401, 'unauthorized');
  expectErr(await login(u.id, PW, { ip: freshIp() }), 401, 'invalid_credentials');
  const after = await storageKeys();
  assert.ok(!after.includes(`bn-users/${u.id}`), '사용자 레코드 남음');
  const removed = before.filter((k) => !after.includes(k));
  assert.ok(removed.filter((k) => k.startsWith('bn-saves/')).length === 3, `저장 데이터 삭제: ${removed.join(',')}`);
  assert.ok(removed.filter((k) => k.startsWith('bn-sessions/')).length >= 2, '세션 삭제');
  // 재가입
  const again = await signup(u.id, 'fresh-start-2026', { ip: freshIp() });
  const list = expectOk(await call('GET', '/api/saves', { token: again.token }));
  assert.ok(list.slots.every((s) => s.empty && s.rev === 0 && s.summary === null && s.savedAt === null));
  assert.deepEqual(list.meta, { rev: 0, savedAt: null, empty: true });
});

test('탈퇴: POST /api/auth/account/delete 도 같은 동작', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  expectErr(await call('POST', '/api/auth/account/delete', { body: { password: 'nope-nope' }, token: u.token, ip: freshIp() }), 403, 'wrong_password');
  expectOk(await call('POST', '/api/auth/account/delete', { body: { password: PW }, token: u.token, ip: freshIp() }));
  expectErr(await call('GET', '/api/auth/me', { token: u.token }), 401, 'unauthorized');
});

// ═════════ 저장 슬롯 ═════════
test('저장: 빈 목록 → 슬롯 1~3 비어 있음, rev 0', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const b = expectOk(await call('GET', '/api/saves', { token: u.token }));
  assert.deepEqual(b.slots, [1, 2, 3].map((slot) => ({ slot, empty: true, rev: 0, savedAt: null, summary: null })));
  assert.deepEqual(b.meta, { rev: 0, savedAt: null, empty: true });
  const g = await call('GET', '/api/saves/2', { token: u.token });
  expectErr(g, 404, 'slot_empty');
  assert.equal(g.body.slot, 2);
  assert.equal(g.body.rev, 0);
});

test('저장: 올리기·요약·내려받기·rev 충돌·force·baseRev 생략', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const s = validSave('sera');
  s.heroes.sera.level = 17; s.progress.chapter = 4; s.stats.playTime = 3723.5; s.difficulty = 'hard'; s.gold = 1234;
  const put1 = expectOk(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 0 }, token: u.token }));
  assert.deepEqual(put1, { ok: true, slot: 1, rev: 1, savedAt: T });
  const list = expectOk(await call('GET', '/api/saves', { token: u.token }));
  assert.deepEqual(list.slots[0], {
    slot: 1, empty: false, rev: 1, savedAt: T,
    summary: { charId: 'sera', level: 17, classId: s.heroes.sera.classId, chapter: 4, playTime: 3723.5, difficulty: 'hard', gold: 1234, clientSavedAt: s.savedAt },
  });
  assert.equal(list.slots[1].empty, true);
  const got = expectOk(await call('GET', '/api/saves/1', { token: u.token }));
  assert.equal(got.slot, 1); assert.equal(got.rev, 1); assert.equal(got.savedAt, T);
  assert.deepEqual(got.data, JSON.parse(JSON.stringify(s)));
  assert.ok(clientIsValidSave(got.data));
  advance(1000);
  assert.equal(expectOk(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 1 }, token: u.token })).rev, 2);
  // 오래된 baseRev → 409 conflict + 서버 요약
  const c = await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 1 }, token: u.token });
  expectErr(c, 409, 'conflict');
  assert.deepEqual(c.body.server, { rev: 2, savedAt: T, empty: false, summary: list.slots[0].summary });
  // 비어 있지 않은 슬롯에 baseRev 0 → 충돌
  expectErr(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 0 }, token: u.token }), 409, 'conflict');
  // force 로 덮어쓰기
  assert.equal(expectOk(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 1, force: true }, token: u.token })).rev, 3);
  // baseRev null / 생략 → 검사 없이 덮어쓰기
  assert.equal(expectOk(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: null }, token: u.token })).rev, 4);
  assert.equal(expectOk(await call('PUT', '/api/saves/1', { body: { data: s }, token: u.token })).rev, 5);
  assert.equal(expectOk(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 5, force: false }, token: u.token })).rev, 6);
});

test('저장: 잘못된 baseRev·force → 400 bad_request, 잘못된 슬롯 → 400 invalid_slot', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const s = validSave();
  for (const baseRev of ['1', -1, 1.5, true, {}, [], Number.MAX_SAFE_INTEGER + 2]) {
    expectErr(await call('PUT', '/api/saves/1', { body: { data: s, baseRev }, token: u.token }), 400, 'bad_request');
  }
  for (const force of ['yes', 1, 0, {}]) expectErr(await call('PUT', '/api/saves/1', { body: { data: s, force }, token: u.token }), 400, 'bad_request');
  for (const p of ['0', '4', '01', '1a', '%31', 'abc', '-1', '1.0', ' 1', '', '１', '..', '%2e%2e', '1%2F..%2Fmeta', '..%2F..%2Fbn-users']) {
    for (const m of ['GET', 'PUT', 'DELETE']) {
      const r = await call(m, `/api/saves/${p}`, { token: u.token, body: m === 'PUT' ? { data: s } : undefined });
      if (p === '') { assert.equal(r.status, m === 'GET' ? 200 : 405); continue; } // '/api/saves/' = 목록
      if (p === '..' || p === '%2e%2e') { expectErr(r, 404, 'not_found'); continue; } // URL 파서가 점 경로를 먼저 정리 → '/api/' (저장소에 닿지 않음)
      expectErr(r, 400, 'invalid_slot');
    }
  }
});

test('저장: 구조가 틀린 데이터 → 422 invalid_save', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const base = validSave();
  const muts = [
    (s) => null, (s) => [], (s) => 'save', (s) => 42,
    (s) => { delete s.heroes; }, (s) => { s.heroes = []; }, (s) => { s.inventory = {}; }, (s) => { delete s.progress; },
    (s) => { s.progress = []; }, (s) => { s.charId = 'dracula'; }, (s) => { s.charId = 7; }, (s) => { delete s.heroes.kael; },
    (s) => { s.heroes.kael.level = 'x'; }, (s) => { s.heroes.kael.level = null; }, (s) => { delete s.heroes.kael.equip; },
    (s) => { s.heroes.kael.equip = []; }, (s) => { s.heroes.nosferatu = { level: 1, equip: {} }; }, (s) => { s.heroes.sera = 'x'; },
  ];
  for (const m of muts) {
    const s = structuredClone(base);
    const out = m(s);
    const data = out === undefined ? s : out;
    expectErr(await call('PUT', '/api/saves/2', { body: { data }, token: u.token }), 422, 'invalid_save');
  }
  expectErr(await call('PUT', '/api/saves/2', { body: {}, token: u.token }), 422, 'invalid_save');
  expectErr(await call('PUT', '/api/saves/2', { body: { data: base }, token: 'x' }), 401, 'unauthorized');
});

test('저장: 서버 검사 = 클라이언트 isValidSave (무작위 변형 400개 비교), 캐릭터 ID 목록 일치', () => {
  assert.deepEqual([...cfg.CHARACTER_IDS].sort(), Object.keys(CHARACTERS).sort());
  const base = validSave('lia');
  base.heroes.kael = structuredClone(validSave('kael').heroes.kael);
  const values = [undefined, null, 0, 1, NaN, Infinity, -1, 'x', '', [], {}, true, 'kael', 'sera', 'dracula', { level: 3, equip: {} }];
  const paths = [['heroes'], ['inventory'], ['progress'], ['charId'], ['heroes', 'lia'], ['heroes', 'kael'], ['heroes', 'lia', 'level'],
    ['heroes', 'kael', 'level'], ['heroes', 'lia', 'equip'], ['heroes', 'azel'], ['heroes', 'zzz'], ['heroes', '__proto__x'], ['stats']];
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  let agreeValid = 0;
  for (let i = 0; i < 400; i++) {
    const s = structuredClone(base);
    const k = 1 + rnd(3);
    for (let j = 0; j < k; j++) {
      const p = paths[rnd(paths.length)];
      let o = s;
      for (const seg of p.slice(0, -1)) { if (o && typeof o === 'object') o = o[seg]; }
      if (o && typeof o === 'object') {
        const v = values[rnd(values.length)];
        if (v === undefined) delete o[p.at(-1)]; else o[p.at(-1)] = structuredClone(v);
      }
    }
    const a = sval.isValidSave(s), b = clientIsValidSave(s);
    assert.equal(a, b, `불일치: ${JSON.stringify(s).slice(0, 300)}`);
    if (a) agreeValid++;
  }
  assert.ok(agreeValid > 10, `유효 표본이 너무 적음 ${agreeValid}`);
  for (const c of Object.keys(CHARACTERS)) assert.ok(sval.isValidSave(validSave(c)));
});

test('저장: 512KB 제한 (큰 정상 세이브는 통과, 초과는 413)', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const s = validSave();
  const item = s.inventory[0];
  const fill = (target) => {
    const t = structuredClone(s);
    let i = 0;
    while (JSON.stringify({ data: t, baseRev: null }).length < target) t.inventory.push({ ...item, uid: `u${i++}`, note: 'x'.repeat(200) });
    return t;
  };
  const okSave = fill(500 * 1024);
  const r = await call('PUT', '/api/saves/3', { body: { data: okSave, baseRev: null }, token: u.token });
  expectOk(r);
  const got = expectOk(await call('GET', '/api/saves/3', { token: u.token }));
  assert.equal(got.data.inventory.length, okSave.inventory.length);
  expectErr(await call('PUT', '/api/saves/3', { body: { data: fill(513 * 1024), baseRev: null }, token: u.token }), 413, 'payload_too_large');
});

test('저장: 슬롯 삭제 → 묘비(rev 유지), 이전 baseRev 는 충돌, 빈 슬롯에 baseRev 0 허용, 삭제는 멱등', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const s = validSave();
  expectOk(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 0 }, token: u.token }));
  expectOk(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 1 }, token: u.token }));
  advance(5000);
  const d = expectOk(await call('DELETE', '/api/saves/1', { token: u.token }));
  assert.deepEqual(d, { ok: true, slot: 1, rev: 3 });
  const list = expectOk(await call('GET', '/api/saves', { token: u.token }));
  assert.deepEqual(list.slots[0], { slot: 1, empty: true, rev: 3, savedAt: null, summary: null });
  const g = await call('GET', '/api/saves/1', { token: u.token });
  expectErr(g, 404, 'slot_empty');
  assert.equal(g.body.rev, 3);
  expectErr(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 2 }, token: u.token }), 409, 'conflict');
  const c = await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 1 }, token: u.token });
  expectErr(c, 409, 'conflict');
  assert.deepEqual(c.body.server, { rev: 3, savedAt: null, empty: true, summary: null });
  assert.equal(expectOk(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 0 }, token: u.token })).rev, 4);
  expectOk(await call('DELETE', '/api/saves/1', { token: u.token }));
  assert.deepEqual(expectOk(await call('DELETE', '/api/saves/1', { token: u.token })), { ok: true, slot: 1, rev: 5 });
  assert.deepEqual(expectOk(await call('DELETE', '/api/saves/2', { token: u.token })), { ok: true, slot: 2, rev: 0 });
  assert.equal(expectOk(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 5 }, token: u.token })).rev, 6);
  expectErr(await call('DELETE', '/api/saves/1'), 401, 'unauthorized');
});

test('저장: 다른 사용자 데이터는 보이지 않음', async () => {
  const a = await signup(newId(), PW, { ip: freshIp() });
  const b = await signup(newId(), PW, { ip: freshIp() });
  expectOk(await call('PUT', '/api/saves/1', { body: { data: validSave(), baseRev: 0 }, token: a.token }));
  expectOk(await call('PUT', '/api/meta', { body: { data: { clears: 3 }, baseRev: 0 }, token: a.token }));
  expectErr(await call('GET', '/api/saves/1', { token: b.token }), 404, 'slot_empty');
  assert.ok(expectOk(await call('GET', '/api/saves', { token: b.token })).slots.every((s) => s.empty));
  assert.equal(expectOk(await call('GET', '/api/meta', { token: b.token })).data, null);
  expectOk(await call('DELETE', '/api/saves/1', { token: b.token }));
  assert.equal(expectOk(await call('GET', '/api/saves/1', { token: a.token })).rev, 1);
});

test('저장: 같은 baseRev 동시 저장 → 하나만 성공, 나머지 409', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const s = validSave();
  expectOk(await call('PUT', '/api/saves/2', { body: { data: s, baseRev: 0 }, token: u.token }));
  const rs = await Promise.all([0, 1, 2, 3, 4, 5].map(() => call('PUT', '/api/saves/2', { body: { data: s, baseRev: 1 }, token: u.token })));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  for (const r of rs.filter((x) => x.status !== 200)) expectErr(r, 409, 'conflict');
  assert.equal(expectOk(await call('GET', '/api/saves/2', { token: u.token })).rev, 2);
  // force 동시 저장은 모두 성공하고 rev 가 겹치지 않는다
  const fs2 = await Promise.all([0, 1, 2].map(() => call('PUT', '/api/saves/2', { body: { data: s, force: true, baseRev: 0 }, token: u.token })));
  const revs = fs2.map((r) => expectOk(r).rev).sort();
  assert.deepEqual(revs, [3, 4, 5]);
}, { memOnly: true });

// ═════════ 전역 메타 ═════════
test('메타: 비어 있음 → data null, 올리기·내려받기·충돌(서버 데이터 포함)·force', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  assert.deepEqual(expectOk(await call('GET', '/api/meta', { token: u.token })), { ok: true, rev: 0, savedAt: null, data: null });
  const m = structuredClone(DEFAULT_META);
  m.endingsSeen = ['normal']; m.clears = 1; m.highScores = [{ name: 'KAEL', score: 99999, charId: 'kael', stage: 's03', date: T, mode: 'arcade' }];
  assert.deepEqual(expectOk(await call('PUT', '/api/meta', { body: { data: m, baseRev: 0 }, token: u.token })), { ok: true, rev: 1, savedAt: T });
  assert.deepEqual(expectOk(await call('GET', '/api/meta', { token: u.token })), { ok: true, rev: 1, savedAt: T, data: m });
  const c = await call('PUT', '/api/meta', { body: { data: DEFAULT_META, baseRev: 0 }, token: u.token });
  expectErr(c, 409, 'conflict');
  assert.deepEqual(c.body.server, { rev: 1, savedAt: T, data: m });
  assert.equal(expectOk(await call('PUT', '/api/meta', { body: { data: DEFAULT_META, baseRev: 0, force: true }, token: u.token })).rev, 2);
  assert.equal(expectOk(await call('PUT', '/api/meta', { body: { data: m, baseRev: 2 }, token: u.token })).rev, 3);
  assert.equal(expectOk(await call('PUT', '/api/meta', { body: { data: m }, token: u.token })).rev, 4);
  expectErr(await call('PUT', '/api/meta', { body: { data: m, baseRev: 'x' }, token: u.token }), 400, 'bad_request');
  expectErr(await call('GET', '/api/meta', { token: 'nope' }), 401, 'unauthorized');
});

test('메타: 형식 오류 → 422 invalid_meta, 64KB 초과 → 413', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const bad = [null, [], 'x', 5, { unlockedChars: 'kael' }, { unlockedChars: [1] }, { endingsSeen: {} }, { highScores: {} },
    { highScores: Array.from({ length: 201 }, () => ({})) }, { highScores: [1] }, { bestiary: [] }, { clears: 'many' }, { konami: 'yes' }];
  for (const data of bad) expectErr(await call('PUT', '/api/meta', { body: { data, baseRev: null }, token: u.token }), 422, 'invalid_meta');
  expectErr(await call('PUT', '/api/meta', { body: { baseRev: null }, token: u.token }), 422, 'invalid_meta');
  const big = { ...structuredClone(DEFAULT_META), bestiary: { pad: 'x'.repeat(65 * 1024) } };
  expectErr(await call('PUT', '/api/meta', { body: { data: big }, token: u.token }), 413, 'payload_too_large');
  // 모르는 필드는 허용 (앞으로의 확장)
  expectOk(await call('PUT', '/api/meta', { body: { data: { ...DEFAULT_META, bossRushBests: { 0: { time: 321 } }, futureThing: [1, 2] } }, token: u.token }));
});

// ═════════ 배포 문맥 분리 ═════════
test('배포 문맥: 미리보기(deploy-preview) 데이터는 운영(production)과 분리', async () => {
  const id = newId('preview');
  const u = await signup(id, PW, { ip: freshIp(), deploy: 'deploy-preview' });
  expectOk(await call('GET', '/api/auth/me', { token: u.token, deploy: 'deploy-preview' }));
  expectErr(await call('GET', '/api/auth/me', { token: u.token, deploy: 'production' }), 401, 'unauthorized');
  expectErr(await login(id, PW, { ip: freshIp(), deploy: 'production' }), 401, 'invalid_credentials');
  expectOk(await login(id, PW, { ip: freshIp(), deploy: 'deploy-preview' }));
  // 같은 아이디를 운영에서 따로 가입할 수 있다
  await signup(id, PW, { ip: freshIp(), deploy: 'production' });
});

// ═════════ 운영 도구 (netlify/lib/admin.mts) ═════════
test('운영: show·unlock·revoke·reset·delete', async () => {
  const admin = await import(path.join(ROOT, 'netlify/lib/admin.mts'));
  const c = new rt.Ctx(new Request('https://admin.local/'), { ip: 'admin', deploy: { context: 'production' } });
  const u = await signup(newId(), PW, { ip: freshIp() });
  expectOk(await call('PUT', '/api/saves/2', { body: { data: validSave('bran'), baseRev: 0 }, token: u.token }));
  const badNet = freshIp();
  for (let i = 0; i < 5; i++) await login(u.id, 'wrong-password', { ip: badNet });
  for (let i = 0; i < 15; i++) await login(u.id, 'wrong-password', { ip: freshIp() });
  let info = await admin.adminShow(c, u.id.toUpperCase());
  assert.equal(info.id, u.id);
  assert.equal(info.activeSessions, 1);
  assert.ok(info.loginLock?.lockedUntil, '잠금 표시');
  assert.equal(info.loginLock.failures, 20);
  assert.equal(info.loginLock.lockedNetworks, 1);
  assert.equal(info.slots[1].rev, 1);
  assert.equal(info.slots[1].summary.charId, 'bran');
  assert.ok(!JSON.stringify(info).includes('"hash"') && !JSON.stringify(info).includes('salt'));
  await admin.adminUnlock(c, u.id);
  expectOk(await login(u.id, PW, { ip: freshIp() }));
  assert.equal(await admin.adminRevokeSessions(c, u.id), 2);
  expectErr(await call('GET', '/api/auth/me', { token: u.token }), 401, 'unauthorized');
  for (let i = 0; i < 5; i++) await login(u.id, 'wrong-password', { ip: badNet });
  const r = await admin.adminResetPassword(c, u.id);
  SECRETS.add(r.tempPassword); SECRETS.add(r.recoveryCode); SECRETS.add(r.recoveryCode.replace(/-/g, ''));
  assert.match(r.tempPassword, /^[a-z2-9]{12}$/);
  expectErr(await login(u.id, PW, { ip: freshIp() }), 401, 'invalid_credentials');
  const t = expectOk(await login(u.id, r.tempPassword, { ip: badNet })).token; // 잠금도 풀림
  expectErr(await call('POST', '/api/auth/recover', { body: { id: u.id, recoveryCode: u.recoveryCode, newPassword: 'new-password-1' }, ip: freshIp() }), 401, 'invalid_recovery');
  await admin.adminDelete(c, u.id);
  expectErr(await call('GET', '/api/auth/me', { token: t }), 401, 'unauthorized');
  expectErr(await login(u.id, r.tempPassword, { ip: freshIp() }), 401, 'invalid_credentials');
  assert.ok(!(await storageKeys()).some((k) => k === `bn-users/${u.id}`));
  await assert.rejects(admin.adminShow(c, u.id), /계정이 없습니다/);
  await assert.rejects(admin.adminShow(c, '!!'), /아이디 형식/);
});

// ═════════ 보안 점검 ═════════
test('보안: 저장소에 비밀번호·복구 코드·토큰 평문이 없음, 비밀번호 해시는 scrypt 매개변수 포함', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const dump = await storageDump();
  assert.ok(dump.length > 1000);
  for (const s of SECRETS) assert.ok(!dump.includes(s), `평문 비밀이 저장소에 있음: ${s.slice(0, 6)}…`);
  const rec = JSON.parse(await readRaw('bn-users', u.id));
  assert.equal(rec.id, u.id);
  for (const k of ['pw', 'rc']) {
    assert.equal(rec[k].alg, 'scrypt');
    assert.deepEqual([rec[k].N, rec[k].r, rec[k].p, rec[k].len], [32768, 8, 3, 64]);
    assert.equal(Buffer.from(rec[k].salt, 'base64').length, 32);
    assert.equal(Buffer.from(rec[k].hash, 'base64').length, 64);
  }
  assert.equal(rec.sessions.length, 1);
  assert.match(rec.sessions[0].h, /^[0-9a-f]{64}$/);
  assert.equal(rec.sessions[0].h, scrypto.sha256hex(u.token));
  assert.equal(rec.sessions[0].expiresAt - rec.sessions[0].createdAt, 30 * DAY);
  const sess = JSON.parse(await readRaw('bn-sessions', rec.sessions[0].h));
  assert.deepEqual(Object.keys(sess).sort(), ['createdAt', 'expiresAt', 'id', 'uid']);
  // 제한 기록에 IP 원문이 없음
  assert.ok(!dump.includes('203.0.'), 'IP 원문 저장');
  // 키·저장소 이름 길이 제한
  for (const k of await storageKeys()) {
    const [store, ...rest] = k.split('/');
    assert.ok(Buffer.byteLength(store) <= 64 && Buffer.byteLength(rest.join('/')) <= 600, k);
  }
}, { realHash: true });

test('보안: 복구 코드 생성기 (Crockford Base32 16자, 중복 없음)', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const c = scrypto.newRecoveryCode();
    assert.match(c, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    assert.equal(scrypto.normalizeRecoveryCode(c.toLowerCase()), c.replace(/-/g, ''));
    seen.add(c);
  }
  assert.equal(seen.size, 2000);
  assert.equal(scrypto.normalizeRecoveryCode('abcd-efgh-jkmn-pqrs'), 'ABCDEFGHJKMNPQRS');
  assert.equal(scrypto.normalizeRecoveryCode('oooo iiii llll 0000'), '0000111111110000');
  assert.equal(scrypto.normalizeRecoveryCode('UUUU-UUUU-UUUU-UUUU'), null);
  assert.equal(scrypto.normalizeRecoveryCode('AAAA-AAAA-AAAA'), null);
  assert.equal(scrypto.normalizeRecoveryCode(1234), null);
});

// ═════════ 보안 검토 (공격 시나리오) ═════════
const quiet = async (fn) => {
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.map(String).join(' '));
  try { await fn(); } finally { console.error = orig; }
  return errs;
};
const countErr = (rs, code) => rs.filter((r) => r.body.error === code).length;
const noteSignup = (r) => { if (r.body.ok) { SECRETS.add(r.body.token); SECRETS.add(r.body.recoveryCode); SECRETS.add(r.body.recoveryCode.replace(/-/g, '')); } };
const adminCtx = () => new rt.Ctx(new Request('https://admin.local/'), { ip: 'admin', deploy: { context: 'production' } });

// 비밀번호 확인 횟수 = scrypt 호출 수 (node:crypto 의 scrypt 를 감싸 센다)
const cryptoCjs = createRequire(import.meta.url)('node:crypto');
const scryptOrig = cryptoCjs.scrypt;
let scryptCalls = 0;
cryptoCjs.scrypt = function (...a) { scryptCalls++; return scryptOrig.apply(this, a); };
syncBuiltinESMExports();

/**
 * 요청을 하나씩 들여보내 관문(isGate 에 맞는 저장소 연산)에 모두 세운 뒤 한꺼번에 풀어 준다.
 * '검사 → (느린 비밀번호 확인) → 기록' 사이의 경합을 결정적으로 재현한다 (메모리 모드 전용).
 */
async function burst(n, makeCall, isGate) {
  const b = currentBackend;
  let arrived = 0, release;
  const gate = new Promise((r) => { release = r; });
  b.hook = async (op, store, key) => { if (isGate(op, store, key)) { arrived++; await gate; } };
  const ps = [];
  try {
    for (let i = 0; i < n; i++) {
      const before = arrived;
      let done = false;
      const p = makeCall(i).finally(() => { done = true; });
      ps.push(p);
      while (arrived === before && !done) await new Promise((r) => setImmediate(r));
    }
  } finally { release(); }
  const rs = await Promise.all(ps);
  b.hook = null;
  return rs;
}

test('공격: 동시 요청으로 아이디 잠금 우회 불가 (같은 네트워크에서 비밀번호 확인은 5번까지)', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const ip = freshIp();
  const s0 = scryptCalls;
  const rs = await burst(12, () => login(u.id, 'wrong-password', { ip }), (op, st, key) => op === 'getWithMetadata' && st === 'bn-users' && key === u.id);
  for (const r of rs) assert.ok(r.status === 401 || r.status === 429, r.text);
  for (let i = 0; i < 6; i++) assert.ok([401, 429].includes((await login(u.id, 'wrong-password', { ip })).status));
  assert.equal(scryptCalls - s0, 5, `같은 네트워크에서 비밀번호를 ${scryptCalls - s0}번 확인함`);
  expectErr(await login(u.id, PW, { ip }), 429, 'locked');
}, { memOnly: true });

test('공격: 여러 IP 동시 요청으로도 아이디 전체 한도(시간당 20번) 우회 불가', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const s0 = scryptCalls;
  await burst(40, () => login(u.id, 'wrong-password', { ip: freshIp() }), (op, st, key) => op === 'getWithMetadata' && st === 'bn-users' && key === u.id);
  for (let i = 0; i < 10; i++) assert.ok([401, 429].includes((await login(u.id, 'wrong-password', { ip: freshIp() })).status));
  assert.equal(scryptCalls - s0, 20, `여러 IP 에서 비밀번호를 ${scryptCalls - s0}번 확인함`);
  expectErr(await login(u.id, PW, { ip: freshIp() }), 429, 'locked');
}, { memOnly: true });

test('공격: 잠금 악용 — 다른 네트워크에서 5번 틀려도 주인은 로그인·복구 가능', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const attacker = freshIp();
  for (let i = 0; i < 4; i++) expectErr(await login(u.id, 'wrong-password', { ip: attacker }), 401, 'invalid_credentials');
  expectErr(await login(u.id, 'wrong-password', { ip: attacker }), 429, 'locked');
  expectErr(await login(u.id, PW, { ip: attacker }), 429, 'locked'); // 공격자 네트워크는 잠김
  expectOk(await login(u.id, PW, { ip: freshIp() }));                // 주인은 다른 네트워크에서 로그인
  // 복구 코드도 네트워크별로 잠긴다
  const rec = (code, ip) => call('POST', '/api/auth/recover', { body: { id: u.id, recoveryCode: code, newPassword: 'new-password-1' }, ip });
  for (let i = 0; i < 4; i++) expectErr(await rec('ZZZZ-ZZZZ-ZZZZ-ZZZZ', attacker), 401, 'invalid_recovery');
  expectErr(await rec('ZZZZ-ZZZZ-ZZZZ-ZZZZ', attacker), 429, 'locked');
  expectErr(await rec(u.recoveryCode, attacker), 429, 'locked');
  const b = expectOk(await rec(u.recoveryCode, freshIp()));
  SECRETS.add(b.recoveryCode); SECRETS.add(b.recoveryCode.replace(/-/g, '')); SECRETS.add(b.token);
  // 복구하면 공격자 네트워크의 로그인 잠금도 풀린다 (주인이 그 네트워크를 쓸 수도 있으므로)
  expectOk(await login(u.id, 'new-password-1', { ip: attacker }));
});

test('공격: 분산 추측 — 여러 네트워크 합계 20번 실패하면 30분 동안 모두 잠김', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  for (let i = 0; i < 19; i++) expectErr(await login(u.id, 'wrong-password', { ip: freshIp() }), 401, 'invalid_credentials');
  const r = await login(u.id, 'wrong-password', { ip: freshIp() });
  expectErr(r, 429, 'locked');
  assert.equal(r.body.retryAfter, 30 * 60);
  expectErr(await login(u.id, PW, { ip: freshIp() }), 429, 'locked');
  advance(30 * MIN + 1000);
  expectOk(await login(u.id, PW, { ip: freshIp() }));
});

test('안드로이드 앱 출처만 다른 출처 허용: preflight 204·CORS 헤더, 앱의 cross-site 요청 허용, 그 밖의 출처는 그대로 403', async () => {
  const APP = 'https://appassets.androidplatform.net';
  const raw = async (method, p, headers = {}, body) => {
    const h = new Headers(headers);
    const init = { method, headers: h };
    if (body !== undefined) { h.set('content-type', 'application/json'); init.body = JSON.stringify(body); init.duplex = 'half'; }
    return api(new Request('https://game.test' + p, init), { requestId: 'test', ip: freshIp(), deploy: { context: DEPLOY, id: '0123456789abcdef01234567', published: DEPLOY === 'production' } });
  };
  const xs = { origin: APP, 'sec-fetch-site': 'cross-site' };
  let r = await raw('OPTIONS', '/api/auth/signup', { ...xs, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), APP);
  assert.match(r.headers.get('access-control-allow-headers') ?? '', /authorization/i);
  assert.match(r.headers.get('access-control-allow-methods') ?? '', /PUT/);
  assert.equal(r.headers.get('vary'), 'Origin');
  r = await raw('OPTIONS', '/api/auth/signup', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' });
  assert.ok(r.status >= 400, String(r.status));
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  const id = newId('app');
  r = await raw('POST', '/api/auth/signup', xs, { id, password: PW });
  const b = await r.json();
  assert.equal(r.status, 201, JSON.stringify(b));
  SECRETS.add(b.token); SECRETS.add(b.recoveryCode);
  assert.equal(r.headers.get('access-control-allow-origin'), APP);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  r = await raw('GET', '/api/saves', { ...xs, authorization: 'Bearer ' + b.token });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), APP);
  r = await raw('PUT', '/api/saves/1', { ...xs, authorization: 'Bearer ' + b.token }, { data: validSave(), baseRev: 0 });
  assert.equal(r.status, 200);
  // 오류 응답도 앱이 읽을 수 있어야 한국어 안내를 보여 줄 수 있다
  r = await raw('POST', '/api/auth/login', xs, { id, password: 'wrong-pass-123' });
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('access-control-allow-origin'), APP);
  // 다른 사이트·비슷하게 꾸민 출처는 전처럼 막는다
  for (const o of ['https://evil.example', 'http://appassets.androidplatform.net', 'https://appassets.androidplatform.net.evil.com', 'https://x.appassets.androidplatform.net', 'null', '']) {
    r = await raw('GET', '/api/saves', { origin: o, 'sec-fetch-site': 'cross-site', authorization: 'Bearer ' + b.token });
    assert.equal(r.status, 403, o);
    assert.equal(r.headers.get('access-control-allow-origin'), null, o);
  }
});

test('공격: 다른 사이트에서 보낸 요청(CSRF·no-cors) 차단 — JSON 이 아닌 Content-Type 415, Sec-Fetch-Site: cross-site 403', async () => {
  const id = newId('csrf');
  const raw = JSON.stringify({ id, password: PW });
  for (const ctype of ['text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', null, 'application/jsonx']) {
    expectErr(await call('POST', '/api/auth/signup', { raw, ctype, ip: freshIp() }), 415, 'unsupported_media_type');
    expectErr(await call('POST', '/api/auth/login', { raw, ctype, ip: freshIp() }), 415, 'unsupported_media_type');
  }
  expectErr(await login(id, PW, { ip: freshIp() }), 401, 'invalid_credentials'); // 계정이 만들어지지 않았다
  const xs = { 'sec-fetch-site': 'cross-site' };
  expectErr(await call('POST', '/api/auth/signup', { body: { id, password: PW }, headers: xs, ip: freshIp() }), 403, 'forbidden');
  expectErr(await login(id, PW, { ip: freshIp() }), 401, 'invalid_credentials');
  // 같은 출처·주소창 직접 입력·헤더 없음은 허용, JSON 매개변수·대소문자 허용
  const u = await signup(id, PW, { headers: { 'sec-fetch-site': 'same-origin' }, ip: freshIp() });
  expectOk(await login(id, PW, { headers: { 'sec-fetch-site': 'none' }, ip: freshIp() }));
  expectOk(await login(id, PW, { ctype: 'Application/JSON; charset=utf-8', ip: freshIp() }));
  // 로그인이 필요한 요청도 막는다
  expectErr(await call('PUT', '/api/saves/1', { body: { data: validSave(), baseRev: 0 }, token: u.token, headers: xs }), 403, 'forbidden');
  expectErr(await call('GET', '/api/saves', { token: u.token, headers: xs }), 403, 'forbidden');
  expectErr(await call('PUT', '/api/saves/1', { raw: JSON.stringify({ data: validSave(), baseRev: 0 }), ctype: 'text/plain', token: u.token }), 415, 'unsupported_media_type');
  expectOk(await call('GET', '/api/saves', { token: u.token }));
});

test('공격: IPv6 주소를 바꿔 가며 IP 제한 우회 불가 (/64 단위), IPv4-mapped 주소는 IPv4 와 같음', async () => {
  const net = `2001:db8:${(++idSeq).toString(16)}:7`;
  for (let i = 1; i <= 20; i++) {
    const r = await login('nobody_' + i, 'wrong-password', { ip: `${net}::${i.toString(16)}` });
    assert.notEqual(r.body.error, 'rate_limited', `${i}번째에 이미 제한`);
  }
  expectErr(await login('nobody_x', 'wrong-password', { ip: `${net}:ffff:ffff:ffff:ffff` }), 429, 'rate_limited');
  expectErr(await login('nobody_y', 'wrong-password', { ip: `${net}:0:0:0:abcd`.toUpperCase() }), 429, 'rate_limited');
  expectErr(await login('nobody_z', 'wrong-password', { ip: `2001:db8:${idSeq.toString(16)}:8::1` }), 401, 'invalid_credentials'); // 다른 /64
  const v4 = freshIp();
  for (let i = 0; i < 20; i++) await login('nobody_' + i, 'wrong-password', { ip: i % 2 ? v4 : `::ffff:${v4}` });
  expectErr(await login('nobody_q', 'wrong-password', { ip: `::FFFF:${v4}` }), 429, 'rate_limited');
  // 가입 수 제한도 /64 단위
  const net2 = `2001:db8:${(++idSeq).toString(16)}:9`;
  for (let i = 1; i <= 5; i++) await signup(newId(), PW, { ip: `${net2}::${i}` });
  expectErr(await call('POST', '/api/auth/signup', { body: { id: newId(), password: PW }, ip: `${net2}::99` }), 429, 'signup_limited');
});

test('공격: X-Forwarded-For·x-nf-client-connection-ip 위조 무시 (context.ip 만 믿음)', async () => {
  const base = freshIp();
  const spoof = (i) => ({ 'x-forwarded-for': `10.0.0.${i}`, 'x-nf-client-connection-ip': `10.0.1.${i}`, 'x-real-ip': `10.0.2.${i}`, 'client-ip': `10.0.3.${i}` });
  for (let i = 0; i < 20; i++) await login('nobody_' + i, 'wrong-password', { ip: base, headers: spoof(i) });
  expectErr(await login('nobody_x', 'wrong-password', { ip: base, headers: spoof(99) }), 429, 'rate_limited');
  // context.ip 가 없으면 헤더로 대신하지 않고 하나의 '알 수 없음' 묶음으로 센다
  for (let i = 0; i < 20; i++) await login('nobody_' + i, 'wrong-password', { ip: null, headers: spoof(100 + i) });
  expectErr(await login('nobody_y', 'wrong-password', { ip: null, headers: spoof(200) }), 429, 'rate_limited');
});

test('공격: 동시 가입으로 IP당 가입 5개 제한 우회 불가', async () => {
  const ip = freshIp();
  const rs = await burst(12, () => call('POST', '/api/auth/signup', { body: { id: newId(), password: PW }, ip }), (op, st) => op === 'getMetadata' && st === 'bn-users');
  rs.forEach(noteSignup);
  let made = rs.filter((r) => r.status === 201).length;
  for (const r of rs) assert.ok(r.status === 201 || r.status === 429, r.text);
  for (let i = 0; i < 6; i++) {
    const r = await call('POST', '/api/auth/signup', { body: { id: newId(), password: PW }, ip });
    noteSignup(r);
    if (r.status === 201) made++; else expectErr(r, 429, 'signup_limited');
  }
  assert.equal(made, 5, `한 IP 에서 ${made}개 가입`);
}, { memOnly: true });

test('경합: 로그인 도중 비밀번호가 바뀌면 그 로그인은 세션을 받지 못함', async () => {
  const b = currentBackend;
  const u = await signup(newId(), PW, { ip: freshIp() });
  const NEW = 'changed-during-login-1';
  SECRETS.add(NEW);
  let fired = false;
  b.hook = async (op, store) => {
    if (fired || op !== 'setJSON' || store !== 'bn-sessions') return;
    fired = true; // 로그인이 옛 비밀번호를 확인하고 세션을 만들기 직전, 주인이 비밀번호를 바꾼다
    expectOk(await call('POST', '/api/auth/password', { body: { oldPassword: PW, newPassword: NEW }, token: u.token, ip: freshIp() }));
  };
  let r;
  try { r = await login(u.id, PW, { ip: freshIp() }); } finally { b.hook = null; }
  assert.ok(fired);
  if (r.body.ok) expectErr(await call('GET', '/api/auth/me', { token: r.body.token }), 401, 'unauthorized');
  else expectErr(r, 401, 'invalid_credentials');
  expectOk(await call('GET', '/api/auth/me', { token: u.token }));
  expectOk(await login(u.id, NEW, { ip: freshIp() }));
}, { memOnly: true });

test('경합: 로그인 재해시가 방금 바뀐 비밀번호를 옛 비밀번호로 되돌리지 않음', async () => {
  const b = currentBackend;
  ENV.delete('AUTH_PEPPER');
  const u = await signup(newId(), PW, { ip: freshIp() });
  ENV.set('AUTH_PEPPER', 'test-pepper-value-0123456789'); // 다음 로그인에서 재해시가 일어난다
  const NEW = 'changed-during-rehash-2';
  SECRETS.add(NEW);
  let fired = false;
  b.hook = async (op, store, key) => {
    if (fired || op !== 'setJSON' || store !== 'bn-users' || key !== u.id) return;
    fired = true;
    expectOk(await call('POST', '/api/auth/password', { body: { oldPassword: PW, newPassword: NEW }, token: u.token, ip: freshIp() }));
  };
  try { await login(u.id, PW, { ip: freshIp() }); } finally { b.hook = null; }
  assert.ok(fired);
  expectErr(await login(u.id, PW, { ip: freshIp() }), 401, 'invalid_credentials');
  expectOk(await login(u.id, NEW, { ip: freshIp() }));
  ENV.delete('AUTH_PEPPER');
}, { memOnly: true });

test('경합: 탈퇴와 동시에 올린 세이브가 서버에 남지 않음', async () => {
  const b = currentBackend;
  const u = await signup(newId(), PW, { ip: freshIp() });
  const uid = JSON.parse(await readRaw('bn-users', u.id)).uid;
  let fired = false;
  b.hook = async (op, store) => {
    if (fired || op !== 'setJSON' || store !== 'bn-saves') return;
    fired = true; // 세이브가 인증을 통과하고 쓰기 직전에 탈퇴가 끝난다
    expectOk(await call('DELETE', '/api/auth/account', { body: { password: PW }, token: u.token, ip: freshIp() }));
  };
  let r;
  try { r = await call('PUT', '/api/saves/2', { body: { data: validSave(), baseRev: 0 }, token: u.token }); } finally { b.hook = null; }
  assert.ok(fired);
  expectErr(r, 401, 'unauthorized');
  assert.deepEqual((await storageKeys()).filter((k) => k.includes(uid)), [], '탈퇴한 계정의 세이브가 남음');
}, { memOnly: true });

test('공격: 너무 깊은 JSON·__proto__ 키 거부 (스택 넘침 DoS·프로토타입 오염 방지)', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const s = validSave();
  let node = {};
  s.progress.flags.deep = node;
  for (let i = 0; i < 40; i++) { node.x = {}; node = node.x; }
  expectErr(await call('PUT', '/api/saves/1', { body: { data: s, baseRev: 0 }, token: u.token }), 422, 'invalid_save');
  const n = 200000; // 512KB 안에 20만 겹 배열
  const errs = await quiet(async () => {
    expectErr(await call('PUT', '/api/saves/1', { raw: `{"data":${'['.repeat(n)}${']'.repeat(n)},"baseRev":0}`, token: u.token }), 400, 'bad_request');
    expectErr(await call('PUT', '/api/meta', { raw: `{"data":{"bestiary":${'{"a":'.repeat(9000)}1${'}'.repeat(9000)}},"baseRev":0}`, token: u.token }), 400, 'bad_request');
  });
  assert.deepEqual(errs, [], '서버 내부 오류가 나면 안 됨');
  const good = JSON.stringify({ data: validSave(), baseRev: 0 });
  const proto = good.replace('"progress":{', '"progress":{"__proto__":{"polluted":true},');
  assert.notEqual(proto, good);
  expectErr(await call('PUT', '/api/saves/1', { raw: proto, token: u.token }), 422, 'invalid_save');
  const meta = JSON.stringify({ data: { bestiary: { bat: 3 } }, baseRev: 0 }).replace('"bestiary":{', '"bestiary":{"__proto__":{"x":1},');
  expectErr(await call('PUT', '/api/meta', { raw: meta, token: u.token }), 422, 'invalid_meta');
  expectErr(await call('POST', '/api/auth/login', { raw: `{"id":${'['.repeat(100)}${']'.repeat(100)},"password":"x"}`, ip: freshIp() }), 400, 'bad_request');
  expectOk(await call('PUT', '/api/saves/1', { body: { data: validSave(), baseRev: 0 }, token: u.token }));
  assert.equal(({}).polluted, undefined);
});

test('보안: 내부 오류 로그에 토큰·키·IP·URL 이 남지 않음', async () => {
  const b = currentBackend;
  const tok = 'Qx7_' + 'aB3-'.repeat(10);
  const hex = 'c0ffee'.repeat(11);
  b.failAll = `Netlify Blobs has generated an internal error (502 status code, ID: 01J8Z): https://blobs.example.net/site:bn-sessions/${hex}?sig=${tok} from 203.0.113.9 / 2001:db8:abcd::17 mail a@b.io`;
  let errs;
  try {
    errs = await quiet(async () => expectErr(await call('POST', '/api/auth/login', { body: { id: 'someone', password: 'whatever1' }, ip: freshIp() }), 500, 'server_error'));
  } finally { b.failAll = false; }
  assert.equal(errs.length, 1);
  for (const bad of [tok, hex, '203.0.113.9', '2001:db8:abcd::17', 'https://', 'blobs.example.net', 'a@b.io', 'whatever1']) assert.ok(!errs[0].includes(bad), `로그에 남음: ${bad} → ${errs[0]}`);
  assert.match(errs[0], /Netlify Blobs has generated an internal error/);
}, { memOnly: true });

test('보안: API 응답 보안 헤더 (CSP·프레임 금지·CORP·Referrer)', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  for (const r of [await call('GET', '/api/health'), await call('GET', '/api/nope'), await call('GET', '/api/saves'), await call('GET', '/api/saves', { token: u.token })]) {
    assert.equal(r.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'; sandbox");
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  }
});

test('보안: 흔한 비밀번호·아이디가 들어간 비밀번호 거부 → 400 weak_password (가입·변경·복구)', async () => {
  const id = newId('weak');
  const weak = ['12345678', 'password', 'Password1', 'qwer1234', '1q2w3e4r', 'QWERTY123', 'aaaaaaaa', 'abababab', '12121212', '가나다라마바사아',
    'iloveyou', 'abcdefgh', '87654321', `${id}1`, `${id}!!`, `12${id}`, 'bloodnocturne', 'ㅁㄴㅇㄹㅁㄴㅇㄹ'];
  for (const password of weak) {
    const r = await call('POST', '/api/auth/signup', { body: { id, password }, ip: freshIp() });
    assert.equal(r.body.error, 'weak_password', `${password} → ${r.text}`);
    assert.equal(r.status, 400);
  }
  const u = await signup(newId(), PW, { ip: freshIp() });
  expectErr(await call('POST', '/api/auth/password', { body: { oldPassword: PW, newPassword: 'qwer1234' }, token: u.token, ip: freshIp() }), 400, 'weak_password');
  expectErr(await call('POST', '/api/auth/recover', { body: { id: u.id, recoveryCode: u.recoveryCode, newPassword: '1q2w3e4r' }, ip: freshIp() }), 400, 'weak_password');
  for (const ok of ['violet-bat-1987', '달빛아래검은성에서', 'x9!kQ2#mZ']) await signup(newId(), ok, { ip: freshIp() });
});

test('보안: scrypt N=2^15·r=8·p=3 (OWASP 최소 기준), 옛 매개변수 해시는 로그인 때 올라감', async () => {
  assert.deepEqual([cfg.SCRYPT.N, cfg.SCRYPT.r, cfg.SCRYPT.p], [32768, 8, 3]);
  const { scryptSync, randomBytes } = await import('node:crypto');
  const u = await signup(newId(), PW, { ip: freshIp() });
  const rec = JSON.parse(await readRaw('bn-users', u.id));
  const salt = randomBytes(32);
  rec.pw = { alg: 'scrypt', N: 16384, r: 8, p: 1, len: 64, salt: salt.toString('base64'), hash: scryptSync(PW.normalize('NFC'), salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64'), pep: 0 };
  await adminCtx().store('bn-users').setJSON(u.id, rec);
  expectOk(await login(u.id, PW, { ip: freshIp() }));
  const after = JSON.parse(await readRaw('bn-users', u.id));
  assert.deepEqual([after.pw.N, after.pw.r, after.pw.p], [32768, 8, 3]);
  expectOk(await login(u.id, PW, { ip: freshIp() }));
}, { realHash: true });

test('로그인 유지: remember:false → 12시간 세션(1시간 넘게 지나 쓰면 연장), 생략·true → 30일', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const loginR = (remember) => call('POST', '/api/auth/login', { body: { id: u.id, password: PW, remember }, ip: freshIp() });
  const short = expectOk(await loginR(false)).token;
  const idle = expectOk(await loginR(false)).token;
  const long = expectOk(await loginR(true)).token;
  [short, idle, long].forEach((t) => SECRETS.add(t));
  const me = (token) => call('GET', '/api/auth/me', { token });
  advance(2 * HOUR);
  expectOk(await me(short)); // 연장 → 14시간째 만료
  advance(11 * HOUR);        // 13시간째
  expectErr(await me(idle), 401, 'unauthorized');
  expectOk(await me(short)); // 연장 → 25시간째 만료
  advance(12 * HOUR + 1);
  expectErr(await me(short), 401, 'unauthorized');
  expectOk(await me(long));
  expectOk(await me(u.token));
  for (const remember of ['no', 0, 1, {}]) expectErr(await loginR(remember), 400, 'bad_request');
  const v = await call('POST', '/api/auth/signup', { body: { id: newId(), password: PW, remember: false }, ip: freshIp() });
  noteSignup(v);
  expectOk(v, 201);
  advance(12 * HOUR + 1);
  expectErr(await me(v.body.token), 401, 'unauthorized');
});

test('로그아웃: {all:true} → 모든 기기에서 로그아웃 (비밀번호는 그대로)', async () => {
  const u = await signup(newId(), PW, { ip: freshIp() });
  const t2 = expectOk(await login(u.id, PW, { ip: freshIp() })).token;
  const t3 = expectOk(await login(u.id, PW, { ip: freshIp() })).token;
  expectErr(await call('POST', '/api/auth/logout', { raw: '{"all":true}', ctype: 'text/plain', token: t2 }), 415, 'unsupported_media_type');
  expectErr(await call('POST', '/api/auth/logout', { body: { all: 'yes' }, token: t2 }), 400, 'bad_request');
  expectOk(await call('GET', '/api/auth/me', { token: t2 }));
  const r = expectOk(await call('POST', '/api/auth/logout', { body: { all: true }, token: t2 }));
  assert.equal(r.revoked, 3);
  for (const t of [u.token, t2, t3]) expectErr(await call('GET', '/api/auth/me', { token: t }), 401, 'unauthorized');
  const t4 = expectOk(await login(u.id, PW, { ip: freshIp() })).token;
  const t5 = expectOk(await login(u.id, PW, { ip: freshIp() })).token;
  assert.equal(expectOk(await call('POST', '/api/auth/logout', { body: { all: false }, token: t4 })).revoked, 1);
  expectOk(await call('GET', '/api/auth/me', { token: t5 }));
});

test('배포 문맥을 알 수 없으면 저장소를 열지 않고 500 (운영 데이터가 배포별 저장소로 새지 않게)', async () => {
  const errs = await quiet(async () => {
    expectErr(await call('POST', '/api/auth/signup', { body: { id: newId(), password: PW }, ip: freshIp(), deploy: null }), 500, 'server_error');
    expectOk(await call('GET', '/api/health', { deploy: null }));
  });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /deploy context/);
});

// ═════════ 클라이언트 (src/core/cloud.js) — 서버와 같은 규칙·받은 데이터 정리 ═════════
const client = await import(path.join(ROOT, 'src/core/cloud.js'));

test('클라이언트: 흔한 비밀번호 목록·약한 비밀번호 판정·아이디 규칙이 서버와 같음', () => {
  assert.deepEqual([...client.COMMON_PASSWORDS], [...sval.COMMON_PASSWORDS]);
  const ids = ['hunter01', 'kael', 'weak042', 'admin_x', 'gm_kael', 'root', 'Abc_1', 'ab', 'a'.repeat(17), '1abc', 'nobody_1', 'staff_q', 'official'];
  const pws = ['12345678', 'Password1', 'qwer1234', 'crimson-moon-77', 'abababab', 'ㅁㄴㅇㄹㅁㄴㅇㄹ', '🦇🦇🦇🦇🌙🌙🌙🌙', 'hunter011', 'hunter01abcd',
    '87654321', '78901234', 'abcdefgh', 'zyxwvuts', '가나다라마바사아', '달빛아래검은성에서', 'x9!kQ2#mZ', 'aaaaaaaaab', 'kaelkael'];
  for (const id of ids) {
    let server = null;
    try { sval.checkNewId(id); } catch (e) { server = e.code; }
    assert.equal(client.checkId(id, true) === null, server === null, `아이디 ${id}: 서버 ${server}`);
    for (const pw of pws) assert.equal(client.isWeakPassword(pw, id), sval.isWeakPassword(pw, normalizeIdLike(id)), `${id} / ${pw}`);
  }
});
const normalizeIdLike = (id) => String(id).trim().toLowerCase();

test('클라이언트: 받은 메타·세이브의 __proto__·constructor 키를 버리고 깊은 트리를 자름 (프로토타입 오염 없음)', () => {
  const evil = JSON.parse('{"unlockedChars":["kael"],"bestiary":{"__proto__":{"polluted":1},"bat":2},"constructor":{"prototype":{"x":1}},'
    + '"bossRushBests":{"__proto__":{"time":1}},"highScores":[{"__proto__":{"admin":true},"score":5,"mode":"arcade"}]}');
  const m = client.mergeMeta(evil, evil);
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.getPrototypeOf(m.bestiary), Object.prototype);
  assert.equal(Object.getPrototypeOf(m.highScores[0]), Object.prototype);
  assert.equal(m.highScores[0].admin, undefined);
  assert.ok(!Object.hasOwn(m, 'constructor'));
  assert.deepEqual(m.bestiary, { bat: 2 });
  const c = client.cleanMeta(evil);
  assert.ok(!JSON.stringify(c).includes('__proto__') && !JSON.stringify(c).includes('polluted'));
  // 대입해도 게임 객체의 프로토타입이 바뀌지 않는다
  const target = {};
  for (const k of Object.keys(m)) target[k] = m[k];
  assert.equal(Object.getPrototypeOf(target), Object.prototype);
  let deep = {};
  const root = { a: deep };
  for (let i = 0; i < 100; i++) { deep.x = {}; deep = deep.x; }
  let depth = 0;
  for (let o = client.sanitizeTree(root, 32); o && typeof o === 'object'; o = o.a ?? o.x) depth++;
  assert.ok(depth <= 32, `깊이 ${depth}`);
  assert.deepEqual(client.sanitizeTree([1, { __proto__: null, a: 1 }, undefined, () => 1]), [1, { a: 1 }, null, null]);
});

test('클라이언트: 시험용 API 주소(bn_api_base)는 같은 출처 경로만 — 다른 사이트로 비밀번호·토큰을 보내지 않음', () => {
  assert.equal(client.safeBase('/api'), '/api');
  assert.equal(client.safeBase(' /v2/api/ '), '/v2/api');
  for (const bad of ['https://evil.example/api', '//evil.example/api', 'http:/evil', '/../api', '/api/../x', '/', '', 'api', '/api?x=1', '/api#x', '\\\\evil', null, 5]) {
    assert.equal(client.safeBase(bad), null, String(bad));
  }
  assert.ok(client.isValidToken('A'.repeat(43)) && !client.isValidToken('A'.repeat(42)) && !client.isValidToken('<img src=x>'.padEnd(43, 'a')));
  assert.ok(client.isValidId('hunter_01') && !client.isValidId('<b>x</b>') && !client.isValidId('Hunter'));
  assert.equal(client.defaultRemember({ hostname: 'appassets.androidplatform.net' }), true);
  assert.equal(client.defaultRemember({ hostname: 'bloodnocturne.netlify.app' }), false); // Node: 터치 판정 없음 → 데스크톱으로 봄
  assert.equal(client.isAndroidApp({ protocol: 'https:', hostname: 'appassets.androidplatform.net' }), true);
  for (const loc of [{ protocol: 'http:', hostname: 'appassets.androidplatform.net' }, { protocol: 'https:', hostname: 'appassets.androidplatform.net.evil.com' }, { protocol: 'https:', hostname: 'blood-nocturne.netlify.app' }, null]) {
    assert.equal(client.isAndroidApp(loc), false, JSON.stringify(loc));
  }
  assert.match(client.APP_API_BASE, /^https:\/\/[a-z0-9-]+\.netlify\.app\/api$/);
  // API 주소 고르기: 앱의 /api 프록시가 켜져 있으면 같은 출처 '/api' (사이트 이름에 기대지 않음), 프록시 없는 옛 앱만 APP_API_BASE
  const appLoc = { protocol: 'https:', hostname: 'appassets.androidplatform.net' };
  const webLoc = { protocol: 'https:', hostname: 'blood-nocturne.netlify.app' };
  assert.equal(client.pickApiBase(webLoc, null, null), '/api');
  assert.equal(client.pickApiBase(webLoc, { apiProxy: true, apiBase: '/api' }, null), '/api');
  assert.equal(client.pickApiBase(appLoc, { platform: 'android', apiProxy: true, apiBase: '/api' }, null), '/api');
  assert.equal(client.pickApiBase(appLoc, { apiProxy: true }, null), '/api');
  assert.equal(client.pickApiBase(appLoc, { apiProxy: true, apiBase: 'https://evil.example/api' }, null), '/api'); // 다른 출처 apiBase 는 무시
  assert.equal(client.pickApiBase(appLoc, { apiProxy: false, apiBase: null }, null), client.APP_API_BASE);
  assert.equal(client.pickApiBase(appLoc, { apiProxy: 'yes' }, null), client.APP_API_BASE); // 정확히 true 일 때만
  assert.equal(client.pickApiBase(appLoc, null, null), client.APP_API_BASE);
  assert.equal(client.pickApiBase(appLoc, { apiProxy: true }, '/v2/api'), '/v2/api'); // 시험용 덮어쓰기가 먼저
  assert.equal(client.pickApiBase(appLoc, null, 'https://evil.example/api'), client.APP_API_BASE); // 다른 사이트 덮어쓰기는 무시
  assert.equal(client.pickApiBase(null, undefined, undefined), '/api');
});

// ═════════ 실행 ═════════
let currentBackend = null;
let storageKeys = async () => [];
let storageDump = async () => '';
let readRaw = async () => null;

async function runMode(mode) {
  let cleanup = async () => {};
  if (mode === 'memory') {
    const b = createMemoryBackend();
    currentBackend = b;
    rt.setStoreFactory((name, dc) => b.factory(name, dc));
    storageKeys = async () => b.keys('site');
    storageDump = async () => b.dump();
    readRaw = async (store, key) => b.data.get(`site\u0000${store}\u0000${key}`)?.body ?? null;
  } else {
    const { BlobsServer } = await import('@netlify/blobs/server');
    const { setEnvironmentContext, getStore } = await import('@netlify/blobs');
    const dir = path.join(ROOT, 'tools/.qa_accounts', `blobs-${process.pid}-${Date.now()}`);
    const token = 'local-test-token';
    const server = new BlobsServer({ directory: dir, token });
    const { port } = await server.start();
    const url = `http://localhost:${port}`;
    setEnvironmentContext({ siteID: 'test-site', token, edgeURL: url, uncachedEdgeURL: url, deployID: '0123456789abcdef01234567', primaryRegion: 'us-east-1' });
    rt.setStoreFactory(null); // 실제 getStore / getDeployStore
    currentBackend = null;
    const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
    storageKeys = async () => {
      const out = [];
      for (const store of Object.values(cfg.STORES)) {
        const { blobs } = await getStore(store).list();
        for (const bl of blobs) out.push(`${store}/${bl.key}`);
      }
      return out;
    };
    storageDump = async () => walk(dir).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    readRaw = async (store, key) => getStore(store, { consistency: 'strong' }).get(key);
    cleanup = async () => {
      await server.stop();
      fs.rmSync(dir, { recursive: true, force: true });
      try { fs.rmdirSync(path.dirname(dir)); } catch { /* 다른 실행이 아직 쓰는 중이면 비어 있지 않다 — 그대로 둔다 */ }
    };
  }
  let pass = 0, fail = 0, skip = 0;
  const t0 = Date.now();
  for (const t of tests) {
    if (FILTER && !t.name.includes(FILTER)) continue;
    if (t.memOnly && mode !== 'memory') { skip++; continue; }
    T += HOUR; // 테스트끼리 시간 창이 겹치지 않게
    DEPLOY = 'production';
    // 해시 비용: 대부분의 테스트는 가볍게(논리는 같다), realHash 테스트만 운영 매개변수로
    scrypto.setHashCostForTests(t.realHash ? null : { N: 1024, r: 8, p: 1 });
    freshIp();
    try {
      await t.fn();
      pass++;
      console.log(`  ✓ ${t.name}`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${t.name}\n      ${String(e?.stack ?? e).split('\n').slice(0, 6).join('\n      ')}`);
    }
  }
  await cleanup();
  console.log(`[${mode}] 통과 ${pass}, 실패 ${fail}, 건너뜀 ${skip} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  return fail;
}

let failures = 0;
for (const mode of MODES) {
  console.log(`\n=== 모드: ${mode} ===`);
  failures += await runMode(mode);
}
rt.setStoreFactory(null);
rt.setClock(null);
scrypto.setHashCostForTests(null);
console.log(failures ? `\n실패 ${failures}건` : '\n모든 테스트 통과');
process.exit(failures ? 1 : 0);
