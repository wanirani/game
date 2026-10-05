// 온라인 기록 API 테스트: node tools/online/test_online.mjs [--mode=memory|server|all] [--filter=문자열]   (= npm run test:online)
//  - memory: 메모리 저장소(tools/accounts/mem_store.mjs) — 동시성 테스트 포함
//  - server: 실제 @netlify/blobs 클라이언트 + 로컬 BlobsServer (tools/accounts/test_api.mjs 와 같은 방식)
// 계약: docs/specs/online.md. 핸들러(netlify/functions/api.mts)를 Request/Context 로 직접 부른다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryBackend } from '../accounts/mem_store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const MODES = args.mode && args.mode !== 'all' ? [args.mode] : ['memory', 'server'];
const FILTER = typeof args.filter === 'string' ? args.filter : null;

const ENV = new Map([['AUTH_PEPPER', 'online-test-pepper-0123456789abcdef0123']]);
globalThis.Netlify = {
  context: null,
  env: { get: (k) => ENV.get(k), set: (k, v) => { ENV.set(k, v); }, has: (k) => ENV.has(k), delete: (k) => { ENV.delete(k); }, toObject: () => Object.fromEntries(ENV) },
};

const api = (await import(path.join(ROOT, 'netlify/functions/api.mts'))).default;
const rt = await import(path.join(ROOT, 'netlify/lib/runtime.mts'));
const cfg = await import(path.join(ROOT, 'netlify/lib/config.mts'));
const gd = await import(path.join(ROOT, 'netlify/lib/gamedata.mts'));
const runs = await import(path.join(ROOT, 'netlify/lib/runs.mts'));
const boards = await import(path.join(ROOT, 'netlify/lib/boards.mts'));
const nickLib = await import(path.join(ROOT, 'netlify/lib/nick.mts'));
const scrypto = await import(path.join(ROOT, 'netlify/lib/crypto.mts'));
const { runCleanup } = await import(path.join(ROOT, 'netlify/lib/cleanup.mts'));
const { ONLINE } = cfg;

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
let T = Date.UTC(2026, 9, 5, 3, 0, 0); // 한국 시간 정오
rt.setClock(() => T);
const advance = (ms) => { T += ms; };
const kst = (t = T) => new Date(t + 9 * HOUR).toISOString().slice(0, 10).replace(/-/g, '');

let ipSeq = 0;
const freshIp = () => { ipSeq++; return `198.18.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`; };
const HANGUL = /[가-힣]/;

async function call(method, urlPath, { body, raw, token, auth, headers = {}, ip = '192.0.2.10' } = {}) {
  const h = new Headers(headers);
  const payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined;
  if (payload !== undefined && !h.has('content-type')) h.set('content-type', 'application/json');
  if (token) h.set('authorization', `Bearer ${token}`);
  if (auth) h.set('authorization', auth);
  const init = { method, headers: h };
  if (payload !== undefined) { init.body = payload; init.duplex = 'half'; }
  const res = await api(new Request('https://game.test' + urlPath, init), { requestId: 't', ip, deploy: { context: 'production', id: '0123456789abcdef01234567', published: true } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 아래 */ }
  assert.ok(json && typeof json.ok === 'boolean', `JSON {ok} 아님: ${res.status} ${text.slice(0, 200)}`);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  // 내부 식별자·로그인 정보가 응답에 없어야 한다 (고스트 data 는 클라이언트 것이라 뺀다)
  const env = JSON.stringify({ ...json, data: undefined });
  assert.ok(!/"(uid|u|id|pw|rc|hash|sessions|etag|rn|a)"\s*:/.test(env) || urlPath.startsWith('/api/auth/'), `내부 필드 노출: ${env.slice(0, 200)}`);
  if (!json.ok) {
    assert.ok(typeof json.message === 'string' && HANGUL.test(json.message), `한국어 message 없음: ${text}`);
    assert.equal(res.headers.get('cache-control'), 'no-store', '오류는 캐시하지 않는다');
  }
  return { status: res.status, body: json, headers: res.headers, text };
}
const expectErr = (r, status, code) => {
  assert.equal(r.status, status, `기대 ${status} ${code}, 실제 ${r.status} ${r.text}`);
  assert.equal(r.body.error, code, `기대 ${code}, 실제 ${r.text}`);
};
const expectOk = (r, status = 200) => { assert.equal(r.status, status, `기대 ${status}, 실제 ${r.status} ${r.text}`); assert.equal(r.body.ok, true); return r.body; };

let idSeq = 0;
const PW = 'crimson-moon-77';
async function signup(prefix = 'runner') {
  const id = `${prefix}${(++idSeq).toString().padStart(3, '0')}`.slice(0, 16);
  const b = expectOk(await call('POST', '/api/auth/signup', { body: { id, password: PW }, ip: freshIp() }), 201);
  return { id: b.id, token: b.token };
}
const ctx = () => new rt.Ctx(new Request('https://admin.local/'), { ip: 'admin', deploy: { context: 'production' } });
const store = (name) => ctx().store(name);
const uidOf = async (id) => (await store(cfg.STORES.users).get(id, { type: 'json' })).uid;
const keysOf = async (name, prefix) => (await store(name).list(prefix ? { prefix } : {})).blobs.map((b) => b.key).sort();

const RES = (o = {}) => ({ time: 60_000, score: 1000, hero: 'kael', cls: 'kael_hunter', level: 25, ...o });
const start = async (u, board) => expectOk(await call('POST', '/api/runs', { body: { board }, token: u.token }));
/** 런 시작 → (걸린 시간만큼) 시계 → 제출 */
async function play(u, board, result = RES(), { ghost, elapsed, extra = {} } = {}) {
  const s = await start(u, board);
  advance(elapsed ?? Math.ceil(Number(result.time) || 0) + 500);
  return call('POST', '/api/runs/finish', { body: { run: s.run, result, ...(ghost !== undefined ? { ghost } : {}), ...extra }, token: u.token });
}
const board = (b, o = {}) => call('GET', `/api/boards/${b}${o.q ?? ''}`, o);
const ghostData = (n) => Buffer.alloc(n, 7).toString('base64');

const tests = [];
const test = (name, fn, opts = {}) => tests.push({ name, fn, ...opts });

// ═════════ 데이터·배포 ═════════
test('게임 데이터 사본(gamedata.mts)이 src/data·arcade.js 와 같다', async () => {
  const { CLASSES } = await import(path.join(ROOT, 'src/data/classes.js'));
  const { DIFFICULTIES } = await import(path.join(ROOT, 'src/data/difficulty.js'));
  const { STAGES, STAGE_ORDER, STAGE_ORDER_P2 } = await import(path.join(ROOT, 'src/data/stages.js'));
  const { CHARACTERS } = await import(path.join(ROOT, 'src/data/characters.js'));
  assert.deepEqual(Object.fromEntries(Object.entries(gd.CLASS_INFO).map(([k, v]) => [k, [...v]])), Object.fromEntries(Object.values(CLASSES).map((c) => [c.id, [c.charId, c.tier]])));
  assert.deepEqual([...gd.DIFFICULTY_IDS], DIFFICULTIES.map((d) => d.id));
  assert.deepEqual({ ...gd.STAGE_LEVELS }, Object.fromEntries(STAGE_ORDER.map((s) => [s, STAGES[s].level])));
  assert.deepEqual([...gd.STAGE_IDS], Array.from({ length: 20 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`), '명세: s01~s20');
  assert.deepEqual([...gd.P2_STAGES], [...STAGE_ORDER_P2]);
  assert.deepEqual([...cfg.CHARACTER_IDS].sort(), Object.keys(CHARACTERS).sort());
  // arcade.js 는 브라우저 모듈(캔버스·오디오)을 끌어오므로 소스에서 표를 읽는다
  const src = fs.readFileSync(path.join(ROOT, 'src/scenes/front/arcade.js'), 'utf8');
  const block = (name) => src.slice(src.indexOf(`export const ${name} = [`), src.indexOf('];', src.indexOf(`export const ${name} = [`)));
  const presets = [...block('LEVEL_PRESETS').matchAll(/\{[^}]*\}/g)].map((m) => ({ lv: Number(/lv: (\d+)/.exec(m[0])[1]), tier: Number(/tier: (\d+)/.exec(m[0])[1]), p2: /p2: true/.test(m[0]) }));
  assert.deepEqual(gd.LEVEL_PRESETS.map((p) => ({ lv: p.lv, tier: p.tier, p2: !!p.p2 })), presets);
  assert.equal(gd.COURSE_COUNT, [...block('COURSES').matchAll(/\{ name:/g)].length);
});

test('배포 묶음: netlify/ 코드의 상대 import 는 netlify/ 안만 가리킨다 (dist/deploy 에는 netlify/ 만 들어간다)', () => {
  const dir = path.join(ROOT, 'netlify');
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => /\.m?ts$/.test(f));
  assert.ok(files.length >= 15);
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(path.join(dir, f)), m[1]);
      assert.ok(target.startsWith(dir + path.sep), `${f} → ${m[1]}`);
      assert.ok(fs.existsSync(target), `${f} → ${m[1]} 없음`);
    }
  }
});

test('라우팅: 새 경로의 메서드 405 + Allow, 없는 경로 404', async () => {
  for (const [m, p, allow] of [['GET', '/api/runs', 'POST'], ['GET', '/api/runs/finish', 'POST'], ['POST', '/api/boards/survival:normal', 'GET'],
    ['DELETE', '/api/ghosts/survival:normal/1', 'GET'], ['POST', '/api/daily', 'GET'], ['GET', '/api/profile/nick', 'PUT'], ['POST', '/api/profile/nick', 'PUT']]) {
    const r = await call(m, p);
    expectErr(r, 405, 'method_not_allowed');
    assert.equal(r.headers.get('allow'), allow, `${m} ${p}`);
  }
  for (const p of ['/api/boards', '/api/boards/a/b', '/api/ghosts/survival:normal', '/api/ghosts/a/1/2', '/api/profile', '/api/runs/x']) expectErr(await call('GET', p), 404, 'not_found');
});

// ═════════ 별명 ═════════
test('별명: 처음엔 me.nick = null, 첫 제출 때 헌터#1234 자동 생성, me 에 포함', async () => {
  const u = await signup();
  assert.equal(expectOk(await call('GET', '/api/auth/me', { token: u.token })).nick, null);
  const f = expectOk(await play(u, 'practice:s01:normal'));
  assert.match(f.entry.nick, /^헌터#\d{4}$/);
  const me = expectOk(await call('GET', '/api/auth/me', { token: u.token }));
  assert.equal(me.nick, f.entry.nick);
  assert.equal(me.id, u.id);
  // 두 번째 제출은 같은 별명
  assert.equal(expectOk(await play(u, 'practice:s02:normal')).entry.nick, me.nick);
  // 순위표에 로그인 아이디가 없다
  assert.ok(!(await board('practice:s01:normal')).text.includes(u.id));
});

test('별명: PUT 검사 — 길이·글자·#, 금칙어(한·영, 밑줄·숫자 끼워도), 운영자 사칭, 로그인 아이디 포함, 인증 필요', async () => {
  const u = await signup('nickcheck');
  const put = (nick, tok = u.token) => call('PUT', '/api/profile/nick', { body: { nick }, token: tok });
  expectErr(await call('PUT', '/api/profile/nick', { body: { nick: '드라큘라' } }), 401, 'unauthorized');
  for (const bad of ['가', 'a', 'abcdefghijklm', '가나다라마바사아자차카타파', 'a b', 'ab#1', '헌터#1234', 'ab!', 'ㅋㅋㅋ', '😀😀', '', 12, null, ['ab'], 'a'.repeat(70)]) {
    expectErr(await put(bad), 400, 'invalid_nick');
  }
  for (const bad of ['씨발놈', '시_발', 'Fuck_you', 'f_u_c_k', 'SHIT2', '병1신', '운영자', '관리자님', 'GM', 'admin123', 'Official_', '섹스']) expectErr(await put(bad), 400, 'banned_nick');
  expectErr(await put(u.id), 400, 'nick_is_id');
  expectErr(await put(u.id.toUpperCase().slice(0, 12)), 400, 'nick_is_id');
  assert.equal(expectOk(await put('  밤의_사냥꾼 ')).nick, '밤의_사냥꾼');
  assert.equal(expectOk(await put('Grape_7')).nick, 'Grape_7'); // 짧은 영어 조각(rape)은 정상 단어를 막지 않는다
  assert.equal(expectOk(await call('GET', '/api/auth/me', { token: u.token })).nick, 'Grape_7');
});

test('별명: 대소문자 무시 중복 → #숫자, 같은 요청 반복은 그대로, 대소문자만 바꾸기, 바꾸면 이전 별명이 풀리고 순위표도 바뀜', async () => {
  const a = await signup(), b = await signup(), c = await signup();
  const put = (u, nick) => call('PUT', '/api/profile/nick', { body: { nick }, token: u.token });
  assert.equal(expectOk(await put(a, 'Dracula')).nick, 'Dracula');
  const bn = expectOk(await put(b, 'dracula')).nick;
  assert.match(bn, /^dracula#\d{4}$/);
  assert.equal(expectOk(await put(b, 'DRACULA')).nick, bn, '이미 dracula#… 이면 새 번호를 받지 않는다');
  assert.equal(expectOk(await put(a, 'DRACULA')).nick, 'DRACULA');
  expectOk(await play(a, 'survival:hard', RES({ wave: 5, time: 30_000 })));
  assert.equal((await board('survival:hard')).body.entries[0].nick, 'DRACULA');
  assert.equal(expectOk(await put(a, 'Vlad')).nick, 'Vlad');
  assert.equal((await board('survival:hard')).body.entries[0].nick, 'Vlad', '순위표 별명도 바뀐다');
  assert.equal(expectOk(await put(c, 'dracula')).nick, 'dracula', '풀린 별명은 다른 사람이 정확히 가져갈 수 있다');
  const held = (await keysOf(cfg.STORES.nicks)).map(nickLib.nickOfKey);
  assert.deepEqual(held.filter((n) => /dracula|vlad/.test(n)).sort(), ['dracula', bn.toLowerCase(), 'vlad'].sort());
});

// ═════════ 런 시작 ═════════
test('런 시작: 인증 필요, 보드 ID 검사, {run, seed(32비트), ts}, 일일 도전 시드 = /api/daily', async () => {
  expectErr(await call('POST', '/api/runs', { body: { board: 'survival:normal' } }), 401, 'unauthorized');
  const u = await signup();
  const today = kst();
  const old61 = kst(T - 61 * DAY), old60 = kst(T - 60 * DAY), tomorrow = kst(T + DAY);
  const bad = ['bossrush:5:normal', 'bossrush:01:normal', 'bossrush:-1:normal', 'bossrush:0:veryhard', 'bossrush:0', 'survival:Normal', 'survival:', 'practice:s21:normal',
    'practice:s00:hard', 'practice:s1:hard', 'practice:s01', 'daily:20261301', 'daily:20260230', `daily:${tomorrow}`, `daily:${old61}`, 'daily:2026105', 'story:s01', 'x', '', 'survival:normal ',
    'BOSSRUSH:0:normal', 7, null, undefined];
  for (const b of bad) expectErr(await call('POST', '/api/runs', { body: { board: b }, token: u.token }), 400, 'invalid_board');
  const seeds = new Set();
  for (const b of ['bossrush:0:easy', 'bossrush:4:inferno', 'survival:nightmare', 'practice:s20:hard', 'practice:s14:normal', `daily:${old60}`]) {
    const r = expectOk(await call('POST', '/api/runs', { body: { board: b }, token: u.token }));
    assert.match(r.run, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    assert.ok(Number.isInteger(r.seed) && r.seed >= 0 && r.seed <= 0xffffffff, String(r.seed));
    assert.equal(r.ts, T);
    assert.ok(!Buffer.from(r.run.split('.')[0], 'base64url').toString().includes(await uidOf(u.id)), '토큰에 uid 가 그대로 들어가지 않는다');
    seeds.add(r.seed);
  }
  assert.equal(seeds.size, 6);
  const d = expectOk(await call('GET', '/api/daily'));
  const r1 = expectOk(await call('POST', '/api/runs', { body: { board: `daily:${today}` }, token: u.token }));
  const r2 = expectOk(await call('POST', '/api/runs', { body: { board: d.board }, token: u.token }));
  assert.equal(r1.seed, d.seed);
  assert.equal(r2.seed, d.seed);
  assert.notEqual(r1.run, r2.run);
});

// ═════════ 제출 ═════════
test('제출: 성공 응답 {best, rank, total, entry}, 순위표에 반영', async () => {
  const u = await signup();
  const r = expectOk(await play(u, 'practice:s03:hard', RES({ time: 95_432.6, score: 4321, rank: 'S', deaths: 0 })));
  assert.equal(r.best, true);
  assert.equal(r.rank, 1);
  assert.equal(r.total, 1);
  assert.deepEqual(Object.keys(r.entry).sort(), ['cls', 'date', 'ghost', 'hero', 'level', 'nick', 'rank', 'score', 'time'].sort());
  assert.equal(r.entry.time, 95_433);
  assert.equal(r.entry.ghost, false);
  assert.equal(r.entry.date, T);
  const g = expectOk(await board('practice:s03:hard'));
  assert.deepEqual(g.entries, [r.entry]);
  assert.equal(g.total, 1);
  // 서바이벌 항목에는 wave
  const s = expectOk(await play(u, 'survival:easy', RES({ wave: 12, time: 400_000 })));
  assert.equal(s.entry.wave, 12);
});

test('제출: 같은 런은 한 번만 (409 run_used)', async () => {
  const u = await signup();
  const s = await start(u, 'bossrush:0:normal');
  advance(70_000);
  const body = { run: s.run, result: RES() };
  expectOk(await call('POST', '/api/runs/finish', { body, token: u.token }));
  expectErr(await call('POST', '/api/runs/finish', { body, token: u.token }), 409, 'run_used');
  expectErr(await call('POST', '/api/runs/finish', { body: { ...body, result: RES({ time: 59_000 }) }, token: u.token }), 409, 'run_used');
});

test('경합: 같은 런을 동시에 두 번 보내도 하나만 성공 (nonce onlyIfNew)', async () => {
  const u = await signup();
  const s2 = await start(u, 'bossrush:0:normal');
  advance(70_000);
  const both = await Promise.all([1, 2, 3].map(() => call('POST', '/api/runs/finish', { body: { run: s2.run, result: RES({ time: 50_000 }) }, token: u.token })));
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409, 409]);
}, { memOnly: true });

test('제출: 만료(6시간)·위조·다른 계정·다른 보드·다른 키의 런 거절', async () => {
  const u = await signup(), v = await signup();
  const s = await start(u, 'practice:s05:normal');
  const fin = (run, o = {}) => call('POST', '/api/runs/finish', { body: { run, result: RES(), ...o }, token: u.token });
  advance(2 * MIN);
  const [p, sig] = s.run.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  const forge = (o) => `${Buffer.from(JSON.stringify({ ...claims, ...o })).toString('base64url')}.${sig}`;
  expectErr(await fin(forge({ ts: claims.ts - HOUR })), 400, 'invalid_run'); // 시작 시각을 앞당김
  expectErr(await fin(forge({ b: 'practice:s05:easy' })), 400, 'invalid_run');
  expectErr(await fin(`${p}.${sig.slice(0, -2)}${sig.endsWith('AA') ? 'BB' : 'AA'}`), 400, 'invalid_run');
  for (const junk of ['', 'abc', `${p}`, `${p}.`, 123, null, `${p}.${sig}.x`]) expectErr(await fin(junk), 400, 'invalid_run');
  expectErr(await call('POST', '/api/runs/finish', { body: { run: s.run, result: RES() }, token: v.token }), 400, 'invalid_run'); // 다른 계정
  expectErr(await fin(s.run, { board: 'practice:s05:hard' }), 400, 'invalid_run'); // 보드 불일치
  // 다른 키(AUTH_PEPPER)로 서명된 토큰
  ENV.set('AUTH_PEPPER', 'some-other-pepper-zzzzzzzzzzzzzzzzzzzz');
  const other = runs.signRun('practice:s05:normal', await uidOf(u.id), T - MIN).run;
  ENV.set('AUTH_PEPPER', 'online-test-pepper-0123456789abcdef0123');
  expectErr(await fin(other), 400, 'invalid_run');
  // 거절된 시도는 런을 쓰지 않았다 → 보드가 맞으면 그대로 제출된다
  expectOk(await fin(s.run, { board: 'practice:s05:normal' }));
  // 6시간이 지나면 410
  const s2 = await start(u, 'practice:s05:normal');
  advance(6 * HOUR + 1000);
  expectErr(await fin(s2.run), 410, 'run_expired');
  // 만료 직전은 통과
  const s3 = await start(u, 'practice:s05:normal');
  advance(6 * HOUR);
  expectOk(await fin(s3.run));
  // 인증 필요
  expectErr(await call('POST', '/api/runs/finish', { body: { run: s3.run, result: RES() } }), 401, 'unauthorized');
});

test('제출: 시간 검사 — 걸린 시간 ≥ time × 0.9 − 3초 (경계 포함), 거절돼도 런은 남는다', async () => {
  const u = await signup();
  const s = await start(u, 'bossrush:2:hard');
  const fin = (result) => call('POST', '/api/runs/finish', { body: { run: s.run, result }, token: u.token });
  advance(10_000);
  expectErr(await fin(RES({ time: 60_000 })), 422, 'implausible_time');
  advance(51_000 - 10_000 - 1); // 60000 × 0.9 − 3000 = 51000
  expectErr(await fin(RES({ time: 60_000 })), 422, 'implausible_time');
  advance(1);
  expectOk(await fin(RES({ time: 60_000 })));
  // 서바이벌도 같은 검사 (time 은 순위 기준이 아니어도)
  const s2 = await start(u, 'survival:normal');
  advance(1000);
  expectErr(await call('POST', '/api/runs/finish', { body: { run: s2.run, result: RES({ wave: 3, time: 600_000 }) }, token: u.token }), 422, 'implausible_time');
  expectOk(await call('POST', '/api/runs/finish', { body: { run: s2.run, result: RES({ wave: 3, time: 2000 }) }, token: u.token }));
});

test('제출: 값 범위 (time 5초~2시간, wave 1~999, level 1~99, score 0~99,999,999, hero·cls 데이터) → 422, 고스트 형식·크기, 본문 48KB', async () => {
  const u = await signup();
  const s = await start(u, 'practice:s07:normal');
  const sv = await start(u, 'survival:hard');
  advance(3 * HOUR);
  const fin = (run, result, o = {}) => call('POST', '/api/runs/finish', { body: { run, result, ...o }, token: u.token });
  const bad = [RES({ time: 4999 }), RES({ time: 2 * HOUR + 1 }), RES({ time: '60000' }), RES({ time: NaN }), RES({ level: 0 }), RES({ level: 100 }), RES({ level: 1.5 }),
    RES({ score: -1 }), RES({ score: 100_000_000 }), RES({ score: 1.5 }), RES({ score: '1' }), RES({ hero: 'dracula' }), RES({ hero: undefined }), RES({ cls: 'sera_saint' }),
    RES({ cls: undefined }), RES({ cls: '__proto__' }), RES({ deaths: -1 }), RES({ deaths: 1.5 }), RES({ rank: 'zz' }), RES({ rank: 3 }), null, [], 'x'];
  for (const r of bad) expectErr(await fin(s.run, r), 422, 'invalid_result');
  for (const w of [0, 1000, 2.5, undefined, '3']) expectErr(await fin(sv.run, RES({ wave: w })), 422, 'invalid_result');
  for (const g of ['', '!!!!', 'ab cd', 12, { a: 1 }, 'A'.repeat(ONLINE.ghostMaxChars + 4)]) expectErr(await fin(s.run, RES(), { ghost: g }), 422, 'invalid_ghost');
  expectErr(await call('POST', '/api/runs/finish', { raw: JSON.stringify({ run: s.run, result: RES(), pad: 'x'.repeat(48 * 1024) }), token: u.token }), 413, 'payload_too_large');
  // 경계 값은 통과
  expectOk(await fin(s.run, RES({ time: 5000, level: 99, score: 99_999_999, deaths: 9999, rank: 'S', extra: 'ignored' }), { ghost: 'A'.repeat(ONLINE.ghostMaxChars) }));
  expectOk(await fin(sv.run, RES({ wave: 999, level: 1, score: 0, time: 0 })));
});

test('최고 기록만: 나쁜·같은 기록은 best:false (기록 그대로), 좋은 기록은 갱신, 계정당 한 줄', async () => {
  const u = await signup();
  const b = 'practice:s02:easy';
  const r1 = expectOk(await play(u, b, RES({ time: 80_000, score: 500 })));
  const r2 = expectOk(await play(u, b, RES({ time: 90_000, score: 9999 })));
  assert.equal(r2.best, false);
  assert.deepEqual(r2.entry, r1.entry);
  const r3 = expectOk(await play(u, b, RES({ time: 80_000, score: 500 })));
  assert.equal(r3.best, false, '같은 기록은 갱신이 아니다 (먼저 세운 날짜 유지)');
  assert.equal(r3.entry.date, r1.entry.date);
  const r4 = expectOk(await play(u, b, RES({ time: 80_000, score: 501 })));
  assert.equal(r4.best, true, '연습: 같은 시간이면 점수가 높은 쪽');
  const r5 = expectOk(await play(u, b, RES({ time: 70_000, score: 1 })));
  assert.equal(r5.best, true);
  const g = expectOk(await board(b));
  assert.equal(g.total, 1);
  assert.equal(g.entries.length, 1);
  assert.equal(g.entries[0].time, 70_000);
  // 서바이벌: wave 가 높을수록, 같으면 score
  const s1 = expectOk(await play(u, 'survival:normal', RES({ wave: 10, score: 100, time: 1000 })));
  assert.equal(s1.best, true);
  assert.equal(expectOk(await play(u, 'survival:normal', RES({ wave: 9, score: 99999, time: 1000 }))).best, false);
  assert.equal(expectOk(await play(u, 'survival:normal', RES({ wave: 10, score: 101, time: 1000 }))).best, true);
  // 보스 러시: 시간만 (점수는 보지 않는다)
  expectOk(await play(u, 'bossrush:1:hard', RES({ time: 100_000, score: 10 })));
  assert.equal(expectOk(await play(u, 'bossrush:1:hard', RES({ time: 100_000, score: 9999 }))).best, false);
});

test('순위·동점: 명세 순서 (서바이벌 wave→score, 연습 time→score, 보스 러시·일일 time), 완전 동점은 먼저 세운 기록, total = 계정 수, me', async () => {
  const [a, b, c, d] = [await signup(), await signup(), await signup(), await signup()];
  const sv = 'survival:inferno';
  expectOk(await play(a, sv, RES({ wave: 10, score: 100, time: 1000 })));
  expectOk(await play(b, sv, RES({ wave: 10, score: 200, time: 1000 })));
  const rc = expectOk(await play(c, sv, RES({ wave: 12, score: 0, time: 1000 })));
  assert.equal(rc.rank, 1);
  assert.equal(rc.total, 3);
  let g = expectOk(await board(sv));
  assert.deepEqual(g.entries.map((e) => [e.rank, e.wave, e.score]), [[1, 12, 0], [2, 10, 200], [3, 10, 100]]);
  const pr = 'practice:s09:normal';
  expectOk(await play(a, pr, RES({ time: 70_000, score: 10 })));
  expectOk(await play(b, pr, RES({ time: 70_000, score: 30 })));
  expectOk(await play(c, pr, RES({ time: 69_999, score: 0 })));
  g = expectOk(await board(pr));
  assert.deepEqual(g.entries.map((e) => [e.time, e.score]), [[69_999, 0], [70_000, 30], [70_000, 10]]);
  const br = 'bossrush:3:normal';
  const ra = expectOk(await play(a, br, RES({ time: 300_000, score: 1 })));
  const rb = expectOk(await play(b, br, RES({ time: 300_000, score: 999 })));
  assert.deepEqual([ra.rank, rb.rank], [1, 2], '보스 러시 완전 동점: 먼저 세운 기록이 위 (점수는 보지 않는다)');
  const rd = expectOk(await play(d, br, RES({ time: 299_999 })));
  assert.equal(rd.rank, 1);
  g = expectOk(await board(br, { token: b.token }));
  assert.deepEqual(g.entries.map((e) => e.rank), [1, 2, 3]);
  assert.equal(g.total, 3);
  assert.deepEqual(g.me, { rank: 3, time: 300_000, score: 999 });
  assert.deepEqual(expectOk(await board(sv, { token: b.token })).me, { rank: 2, time: 1000, score: 200, wave: 10 });
  assert.equal(expectOk(await board(sv, { token: d.token })).me, null);
  const dy = `daily:${kst()}`;
  expectOk(await play(a, dy, RES({ time: 50_000, score: 1 })));
  expectOk(await play(b, dy, RES({ time: 49_000, score: 0 })));
  assert.deepEqual(expectOk(await board(dy)).entries.map((e) => e.time), [49_000, 50_000]);
});

test('고스트: 상위 20위 안의 최고 기록만 저장, 밀려나면 지움, 최고 기록이 아니면 무시, GET /api/ghosts 404', async () => {
  const b = 'practice:s04:normal';
  const users = [];
  for (let i = 0; i < 21; i++) users.push(await signup('gh'));
  for (let i = 0; i < 21; i++) {
    const r = expectOk(await play(users[i], b, RES({ time: 60_000 + i * 1000 }), { ghost: ghostData(30 + i) }));
    assert.equal(r.rank, i + 1);
    assert.equal(r.entry.ghost, i < 20, `${i + 1}위 고스트 표시`);
  }
  const uid = async (i) => uidOf(users[i].id);
  const gkeys = async () => keysOf(cfg.STORES.ghosts, 'practice.s04.normal/');
  assert.equal((await gkeys()).length, 20, '21위의 고스트는 저장하지 않는다');
  assert.ok(!(await gkeys()).includes(`practice.s04.normal/${await uid(20)}`));
  let g = expectOk(await call('GET', `/api/ghosts/${b}/1`));
  assert.deepEqual(g, { ok: true, nick: (await board(b)).body.entries[0].nick, time: 60_000, hero: 'kael', cls: 'kael_hunter', data: ghostData(30) });
  g = await call('GET', `/api/ghosts/${b}/20`);
  assert.equal(g.body.data, ghostData(49));
  assert.equal(g.headers.get('cache-control'), 'public, max-age=30');
  expectErr(await call('GET', `/api/ghosts/${b}/21`), 404, 'ghost_not_found');
  expectErr(await call('GET', `/api/ghosts/${b}/100`), 404, 'ghost_not_found');
  expectErr(await call('GET', '/api/ghosts/practice:s04:hard/1'), 404, 'ghost_not_found');
  for (const r of ['0', 'x', '-1', '01', '1000']) expectErr(await call('GET', `/api/ghosts/${b}/${r}`), 400, 'bad_request');
  expectErr(await call('GET', '/api/ghosts/practice:s99:normal/1'), 400, 'invalid_board');
  // 새 1위 → 20위가 21위로 밀려 고스트가 지워진다
  const top = await signup('gh');
  const rt1 = expectOk(await play(top, b, RES({ time: 59_000 }), { ghost: ghostData(99) }));
  assert.deepEqual([rt1.rank, rt1.entry.ghost], [1, true]);
  assert.ok(!(await gkeys()).includes(`practice.s04.normal/${await uid(19)}`), '밀려난 고스트 삭제');
  assert.equal((await gkeys()).length, 20);
  const list = expectOk(await board(b, { q: '?limit=100' })).entries;
  assert.equal(list.filter((e) => e.ghost).length, 20);
  assert.equal(list[20].ghost, false);
  expectErr(await call('GET', `/api/ghosts/${b}/21`), 404, 'ghost_not_found');
  // 최고 기록이 아닌 제출의 고스트는 무시 (지금 고스트 그대로)
  const r2 = expectOk(await play(users[0], b, RES({ time: 99_000 }), { ghost: ghostData(5) }));
  assert.equal(r2.best, false);
  assert.equal(expectOk(await call('GET', `/api/ghosts/${b}/2`)).data, ghostData(30));
  // 고스트 없이 기록을 갱신하면 예전 고스트는 버린다 (지금 기록과 맞지 않으므로)
  const r3 = expectOk(await play(users[0], b, RES({ time: 59_500 })));
  assert.deepEqual([r3.best, r3.rank, r3.entry.ghost], [true, 2, false]);
  expectErr(await call('GET', `/api/ghosts/${b}/2`), 404, 'ghost_not_found');
  assert.ok(!(await gkeys()).includes(`practice.s04.normal/${await uid(0)}`), '예전 고스트 파일도 지운다');
});

test('순위표: 공개 캐시(public, max-age=30, Vary) / 인증하면 no-store + me, limit, 빈 보드, 잘못된 보드·토큰', async () => {
  const u = await signup();
  const b = 'bossrush:0:hard';
  for (let i = 0; i < 3; i++) expectOk(await play(await signup(), b, RES({ time: 100_000 + i })));
  let r = await board(b);
  expectOk(r);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=30');
  assert.match(r.headers.get('vary') ?? '', /Authorization/);
  assert.equal(r.body.me, undefined);
  assert.equal(r.body.board, b);
  assert.equal(r.body.total, 3);
  r = await board(b, { token: u.token });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.body.me, null);
  expectOk(await play(u, b, RES({ time: 200_000 })));
  assert.deepEqual(expectOk(await board(b, { token: u.token })).me, { rank: 4, time: 200_000, score: 1000 });
  expectErr(await board(b, { auth: 'Bearer ' + 'x'.repeat(43) }), 401, 'unauthorized');
  expectErr(await board(b, { auth: 'Basic abc' }), 401, 'unauthorized');
  assert.equal(expectOk(await board(b, { q: '?limit=1' })).entries.length, 1);
  assert.equal(expectOk(await board(b, { q: '?limit=100' })).entries.length, 4);
  for (const q of ['?limit=0', '?limit=101', '?limit=abc', '?limit=-1', '?limit=1.5', '?limit=']) expectErr(await board(b, { q }), 400, 'bad_request');
  // 퍼센트 인코딩된 ':' 도 같은 보드
  assert.equal(expectOk(await call('GET', '/api/boards/bossrush%3A0%3Ahard')).total, 4);
  const empty = expectOk(await board('practice:s20:inferno'));
  assert.deepEqual([empty.total, empty.entries], [0, []]);
  for (const bad of ['practice:s21:normal', 'bossrush:9:normal', `daily:${kst(T + DAY)}`, 'nope', '%E0%A4%A']) expectErr(await call('GET', `/api/boards/${bad}`), 400, 'invalid_board');
  // 오래된 일일 도전은 읽을 수 있다 (비어 있음)
  assert.equal(expectOk(await board(`daily:${kst(T - 90 * DAY)}`)).total, 0);
  // 기본 limit 50
  const many = 'practice:s19:easy';
  const idx = { v: 1, board: many, total: 120, list: Array.from({ length: 120 }, (_, i) => ({ u: `u${i}`, n: `n${i}`, t: 10_000 + i, s: 0, h: 'kael', c: 'kael_hunter', l: 1, d: i })) };
  await store(cfg.STORES.boards).setJSON('b/practice.s19.easy/i', idx);
  const m = expectOk(await board(many));
  assert.equal(m.entries.length, 50);
  assert.equal(m.total, 120);
  assert.equal(expectOk(await board(many, { q: '?limit=100' })).entries.at(-1).rank, 100, '100위까지만');
});

test('안드로이드 앱 출처: 순위표 응답에 CORS 헤더, Vary 에 Authorization·Origin 둘 다', async () => {
  const r = await call('GET', '/api/boards/survival:normal', { headers: { origin: 'https://appassets.androidplatform.net', 'sec-fetch-site': 'cross-site' } });
  expectOk(r);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://appassets.androidplatform.net');
  assert.deepEqual((r.headers.get('vary') ?? '').split(',').map((s) => s.trim()).sort(), ['Authorization', 'Origin']);
  expectErr(await call('GET', '/api/boards/survival:normal', { headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } }), 403, 'forbidden');
  expectErr(await call('POST', '/api/runs', { body: { board: 'survival:normal' }, headers: { 'sec-fetch-site': 'cross-site' } }), 403, 'forbidden');
  const u = await signup();
  expectErr(await call('PUT', '/api/profile/nick', { raw: '{"nick":"abc"}', token: u.token, headers: { 'content-type': 'text/plain' } }), 415, 'unsupported_media_type');
});

// ═════════ 일일 도전 ═════════
test('일일 도전: 같은 날 같은 값, 날마다 다름, 한국 자정에 바뀜, 규칙(스테이지·난이도·헌터·직업·등급·규칙 1~2개), 키 없이는 알 수 없음', async () => {
  const T0 = T;
  T = Date.UTC(2026, 9, 5, 14, 59, 59); // 한국 23:59:59
  const a = expectOk(await call('GET', '/api/daily'));
  assert.equal(a.date, '20261005');
  assert.equal(a.board, 'daily:20261005');
  const r = await call('GET', '/api/daily');
  assert.equal(r.headers.get('cache-control'), 'public, max-age=1', '자정을 넘겨 캐시하지 않는다');
  assert.deepEqual(r.body, a);
  T -= 10 * HOUR;
  assert.deepEqual(expectOk(await call('GET', '/api/daily')), a);
  assert.equal((await call('GET', '/api/daily')).headers.get('cache-control'), `public, max-age=${ONLINE.dailyCacheSec}`);
  T = Date.UTC(2026, 9, 5, 15, 0, 0); // 한국 다음 날 0시
  const b = expectOk(await call('GET', '/api/daily'));
  assert.equal(b.date, '20261006');
  assert.notDeepEqual({ ...b, date: 0, board: 0 }, { ...a, date: 0, board: 0 });
  // 60일 치: 규칙 검사, 고르게 섞임
  const seen = { stage: new Set(), hero: new Set(), diff: new Set(), mods: new Set(), seeds: new Set(), n: new Set() };
  for (let i = 0; i < 60; i++) {
    const date = kst(Date.UTC(2026, 0, 1) + i * DAY);
    const d = runs.dailyFor(date);
    assert.deepEqual(runs.dailyFor(date), d, '결정적');
    assert.deepEqual(Object.keys(d).sort(), ['board', 'cls', 'date', 'diff', 'hero', 'mods', 'preset', 'seed', 'stageId'].sort());
    assert.ok(gd.STAGE_IDS.includes(d.stageId));
    assert.ok(['normal', 'hard'].includes(d.diff));
    assert.ok(cfg.CHARACTER_IDS.includes(d.hero));
    const P = gd.LEVEL_PRESETS[d.preset];
    assert.ok(P, `preset ${d.preset}`);
    assert.equal(!!P.p2, gd.P2_STAGES.includes(d.stageId), `${d.stageId} → 등급 ${d.preset}`);
    if (!P.p2) assert.ok(P.lv >= gd.STAGE_LEVELS[d.stageId], `${d.stageId} 권장 레벨 ≤ 등급 레벨`);
    assert.deepEqual(gd.CLASS_INFO[d.cls], [d.hero, P.tier], `${d.hero} ${d.cls} tier ${P.tier}`);
    assert.ok(d.mods.length >= 1 && d.mods.length <= 2 && new Set(d.mods).size === d.mods.length);
    assert.ok(d.mods.every((m) => runs.DAILY_MODS.includes(m)));
    assert.ok(!runs.DAILY_CONFLICTS.some(([x, y]) => d.mods.includes(x) && d.mods.includes(y)), d.mods.join(','));
    assert.ok(Number.isInteger(d.seed) && d.seed >= 0 && d.seed <= 0xffffffff);
    seen.stage.add(d.stageId); seen.hero.add(d.hero); seen.diff.add(d.diff); d.mods.forEach((m) => seen.mods.add(m)); seen.seeds.add(d.seed); seen.n.add(d.mods.length);
  }
  assert.ok(seen.stage.size >= 12 && seen.hero.size === 6 && seen.diff.size === 2 && seen.mods.size === 6 && seen.seeds.size === 60 && seen.n.size === 2, JSON.stringify(Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.size]))));
  // 비밀 키가 다르면 다른 도전 (키를 모르면 미리 알 수 없다)
  const mine = runs.dailyFor('20261010');
  ENV.set('AUTH_PEPPER', 'another-secret-pepper-value-123456789');
  const theirs = runs.dailyFor('20261010');
  ENV.set('AUTH_PEPPER', 'online-test-pepper-0123456789abcdef0123');
  assert.notEqual(mine.seed, theirs.seed);
  assert.deepEqual(runs.dailyFor('20261010'), mine);
  T = T0;
});

// ═════════ 요청 제한 ═════════
test('요청 제한: 제출 1분 6번·하루 300번, 런 시작 10분 60번, 별명 1시간 10번 → 429 rate_limited + Retry-After', async () => {
  const u = await signup();
  const ss = [];
  for (let i = 0; i < 8; i++) ss.push(await start(u, 'practice:s01:hard'));
  advance(6000);
  for (let i = 0; i < 6; i++) expectOk(await call('POST', '/api/runs/finish', { body: { run: ss[i].run, result: RES({ time: 5000 }) }, token: u.token }));
  const r = await call('POST', '/api/runs/finish', { body: { run: ss[6].run, result: RES({ time: 5000 }) }, token: u.token });
  expectErr(r, 429, 'rate_limited');
  assert.ok(Number(r.headers.get('retry-after')) >= 1 && r.body.retryAfter >= 1);
  advance(MIN);
  expectOk(await call('POST', '/api/runs/finish', { body: { run: ss[6].run, result: RES({ time: 5000 }) }, token: u.token })); // 제한에 걸린 런은 쓰이지 않았다
  // 하루 300번: 카운터를 채워 둔다
  await store(cfg.STORES.limits).setJSON(`acct/${await uidOf(u.id)}/run-d`, { n: ONLINE.submitPerDay, start: T - HOUR });
  expectErr(await call('POST', '/api/runs/finish', { body: { run: ss[7].run, result: RES({ time: 5000 }) }, token: u.token }), 429, 'rate_limited');
  advance(23 * HOUR + 1000);
  // 런 시작
  const v = await signup();
  for (let i = 0; i < ONLINE.startMax; i++) expectOk(await call('POST', '/api/runs', { body: { board: 'survival:easy' }, token: v.token }));
  expectErr(await call('POST', '/api/runs', { body: { board: 'survival:easy' }, token: v.token }), 429, 'rate_limited');
  // 다른 계정은 영향 없음
  expectOk(await call('POST', '/api/runs', { body: { board: 'survival:easy' }, token: u.token }));
  // 별명
  for (let i = 0; i < ONLINE.nickMax; i++) expectOk(await call('PUT', '/api/profile/nick', { body: { nick: `밤${i}사냥` }, token: v.token }));
  expectErr(await call('PUT', '/api/profile/nick', { body: { nick: '밤의왕' }, token: v.token }), 429, 'rate_limited');
});

// ═════════ 탈퇴·정리·운영 ═════════
test('탈퇴: 순위 기록·고스트·별명·계정별 제한 기록을 모두 지우고, 다른 사람 순위가 올라간다', async () => {
  const u = await signup(), w = await signup();
  expectOk(await call('PUT', '/api/profile/nick', { body: { nick: 'Nosferatu' }, token: u.token }));
  const b1 = 'practice:s06:normal', b2 = `daily:${kst()}`;
  expectOk(await play(u, b1, RES({ time: 50_000 }), { ghost: ghostData(40) }));
  expectOk(await play(u, b2, RES({ time: 50_000 })));
  expectOk(await play(w, b1, RES({ time: 60_000 })));
  const uid = await uidOf(u.id);
  assert.equal(expectOk(await board(b1)).entries[0].nick, 'Nosferatu');
  expectOk(await call('DELETE', '/api/auth/account', { body: { password: PW }, token: u.token, ip: freshIp() }));
  const all = [...(await keysOf(cfg.STORES.boards)), ...(await keysOf(cfg.STORES.ghosts)), ...(await keysOf(cfg.STORES.limits)), ...(await keysOf(cfg.STORES.runs))];
  assert.ok(!all.some((k) => k.includes(uid)), `남은 키: ${all.filter((k) => k.includes(uid)).join(', ')}`);
  assert.ok(!(await keysOf(cfg.STORES.nicks)).includes(nickLib.nickKey('Nosferatu')));
  const gr = await board(b1);
  const g = expectOk(gr);
  assert.deepEqual([g.total, g.entries.length, g.entries[0].rank, g.entries[0].time], [1, 1, 1, 60_000]);
  assert.ok(!gr.text.includes('Nosferatu'));
  assert.equal(expectOk(await board(b2)).total, 0);
  expectErr(await call('GET', `/api/ghosts/${b1}/1`), 404, 'ghost_not_found');
  // 같은 별명을 다른 사람이 쓸 수 있다
  assert.equal(expectOk(await call('PUT', '/api/profile/nick', { body: { nick: 'nosferatu' }, token: w.token })).nick, 'nosferatu');
});

test('정리: 쓴 런 기록(7시간 뒤)·61일 지난 일일 도전·표시 없는 고스트(1시간 뒤)·버려진 별명·하루 제출 카운터(하루 창)', async () => {
  const c = ctx();
  const u = await signup();
  const d0 = kst();
  const runKeys0 = new Set(await keysOf(cfg.STORES.runs, 'used/'));
  expectOk(await play(u, `daily:${d0}`, RES({ time: 20_000 }), { ghost: ghostData(10) }));
  expectOk(await play(u, 'practice:s08:normal', RES({ time: 20_000 }), { ghost: ghostData(11) }));
  const uid = await uidOf(u.id);
  const mine = (await keysOf(cfg.STORES.runs, 'used/')).filter((k) => !runKeys0.has(k));
  assert.equal(mine.length, 2);
  const runKeys = async () => (await keysOf(cfg.STORES.runs, 'used/')).filter((k) => mine.includes(k));
  // 표시 없는 고스트·버려진 별명 (주인 없음)
  await store(cfg.STORES.ghosts).setJSON(`practice.s08.normal/deadbeefdeadbeefdeadbeefdeadbeef`, { v: 1, data: 'AAAA', t: 1, at: T }, { metadata: { at: T } });
  await store(cfg.STORES.nicks).setJSON(nickLib.nickKey('ghostnick'), { uid: 'x', id: 'nobody_here', nick: 'ghostnick', at: T });
  let r = await runCleanup(c);
  assert.equal((await runKeys()).length, 2, '아직 유효한 런 기록은 남긴다');
  assert.ok((await keysOf(cfg.STORES.ghosts)).includes('practice.s08.normal/deadbeefdeadbeefdeadbeefdeadbeef'), '막 저장한 고스트는 1시간 동안 남긴다');
  assert.ok((await keysOf(cfg.STORES.nicks)).includes(nickLib.nickKey('ghostnick')));
  assert.ok((await keysOf(cfg.STORES.limits)).includes(`acct/${uid}/run-d`));
  advance(3 * HOUR);
  r = await runCleanup(c);
  assert.ok((await keysOf(cfg.STORES.limits)).includes(`acct/${uid}/run-d`), '하루 제출 카운터는 하루 창이 끝날 때까지 남긴다');
  assert.ok(!(await keysOf(cfg.STORES.limits)).includes(`acct/${uid}/run-m`));
  advance(5 * HOUR);
  r = await runCleanup(c);
  assert.equal((await runKeys()).length, 0, JSON.stringify(r));
  assert.ok(!(await keysOf(cfg.STORES.ghosts)).includes('practice.s08.normal/deadbeefdeadbeefdeadbeefdeadbeef'));
  assert.ok(!(await keysOf(cfg.STORES.nicks)).includes(nickLib.nickKey('ghostnick')));
  assert.equal(expectOk(await call('GET', `/api/ghosts/practice:s08:normal/1`)).data, ghostData(11), '순위표의 고스트는 그대로');
  assert.ok((await keysOf(cfg.STORES.nicks)).length >= 1, '주인이 있는 별명은 그대로');
  advance(20 * HOUR);
  await runCleanup(c);
  assert.ok(!(await keysOf(cfg.STORES.limits)).includes(`acct/${uid}/run-d`));
  // 60일: 아직 남김 (제출 마감) / 62일: 지움
  advance(59 * DAY);
  await runCleanup(c);
  assert.ok((await keysOf(cfg.STORES.boards, `b/daily.${d0}/`)).includes(`b/daily.${d0}/e/${uid}`));
  advance(2 * DAY);
  r = await runCleanup(c);
  assert.deepEqual(await keysOf(cfg.STORES.boards, `b/daily.${d0}/`), []);
  assert.deepEqual(await keysOf(cfg.STORES.boards, `u/${uid}/daily.`), []);
  assert.deepEqual(await keysOf(cfg.STORES.ghosts, `daily.${d0}/`), []);
  assert.equal((await keysOf(cfg.STORES.boards, 'b/practice.s08.normal/')).length, 2, '일일 도전이 아닌 보드는 그대로');
  assert.ok(r.boards.deleted >= 4, JSON.stringify(r.boards));
  // 예약 함수 진입점
  const fn = await import(path.join(ROOT, 'netlify/functions/cleanup.mts'));
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try { assert.equal((await fn.default(new Request('https://cleanup.local/', { method: 'POST' }), { deploy: { context: 'production' } })).status, 204); } finally { console.log = orig; }
  assert.match(logs.join('\n'), /런 \d+\/\d+ · 순위 \d+\/\d+ · 별명 \d+\/\d+/);
});

test('운영: board(아이디 포함)·board-remove(순위·별명)·nick(새 별명·자동), show 에 별명·보드', async () => {
  const admin = await import(path.join(ROOT, 'netlify/lib/admin.mts'));
  const c = ctx();
  const [a, b, d] = [await signup(), await signup(), await signup()];
  const bd = 'bossrush:1:easy';
  expectOk(await call('PUT', '/api/profile/nick', { body: { nick: 'Cheater' }, token: a.token }));
  expectOk(await play(a, bd, RES({ time: 10_000 }), { ghost: ghostData(8) }));
  expectOk(await play(b, bd, RES({ time: 20_000 })));
  expectOk(await play(d, bd, RES({ time: 30_000 })));
  let v = await admin.adminBoard(c, bd);
  assert.deepEqual(v.entries.map((e) => e.id), [a.id, b.id, d.id]);
  assert.equal(v.total, 3);
  const info = await admin.adminShow(c, a.id);
  assert.equal(info.nick, 'Cheater');
  assert.deepEqual(info.boards, [bd]);
  assert.deepEqual(await admin.adminRemoveEntry(c, bd, '1'), { nick: 'Cheater', id: a.id });
  v = await admin.adminBoard(c, bd);
  assert.deepEqual([v.total, v.entries[0].id], [2, b.id]);
  expectErr(await call('GET', `/api/ghosts/${bd}/1`), 404, 'ghost_not_found');
  const dn = expectOk(await board(bd)).entries[1].nick;
  await admin.adminRemoveEntry(c, bd, dn.toUpperCase());
  assert.equal((await admin.adminBoard(c, bd)).total, 1);
  await assert.rejects(admin.adminRemoveEntry(c, bd, '5'), /순위표에 없습니다/);
  await assert.rejects(admin.adminBoard(c, 'nope:1'), /보드 ID/);
  // 별명 바꾸기: 별명으로 찾기 → 자동 별명, 아이디로 찾기 → 지정
  const auto = await admin.adminRenameNick(c, 'cheater');
  assert.equal(auto.from, 'Cheater');
  assert.match(auto.to, /^헌터#\d{4}$/);
  assert.equal(expectOk(await call('GET', '/api/auth/me', { token: a.token })).nick, auto.to);
  const named = await admin.adminRenameNick(c, b.id, '순한양');
  assert.equal(named.to, '순한양');
  assert.equal(expectOk(await board(bd)).entries[0].nick, '순한양');
  await assert.rejects(admin.adminRenameNick(c, b.id, '씨발'), /banned_nick/);
});

// ═════════ 동시성 (메모리 저장소) ═════════
test('경합: 여러 계정이 같은 보드에 동시에 제출해도 기록이 빠지지 않는다 (순위 목록 조건부 쓰기)', async () => {
  const b = 'survival:nightmare';
  const us = [];
  for (let i = 0; i < 12; i++) us.push(await signup('cc'));
  const ss = [];
  for (const u of us) ss.push(await start(u, b));
  advance(MIN);
  const rs = await Promise.all(us.map((u, i) => call('POST', '/api/runs/finish', { body: { run: ss[i].run, result: RES({ wave: 5 + i, time: 1000 }) }, token: u.token })));
  rs.forEach((r) => expectOk(r));
  const g = expectOk(await board(b));
  assert.equal(g.total, 12);
  assert.deepEqual(g.entries.map((e) => e.wave), Array.from({ length: 12 }, (_, i) => 16 - i));
  // 응답의 rank 는 '그 제출이 목록에 들어간 순간'의 순위 → 뒤에 들어온 더 좋은 기록에 밀릴 수만 있다
  rs.forEach((r, i) => { const final = 12 - i; assert.ok(r.body.rank >= 1 && r.body.rank <= final, `${r.body.rank} ≤ ${final}`); assert.ok(r.body.total <= 12); });
}, { memOnly: true });

test('경합: 같은 계정의 런 여러 개가 동시에 끝나도 가장 좋은 기록이 남는다', async () => {
  const u = await signup();
  const b = 'practice:s10:hard';
  const times = [90_000, 70_000, 80_000, 75_000, 85_000];
  const ss = [];
  for (let i = 0; i < times.length; i++) ss.push(await start(u, b));
  advance(2 * MIN);
  const rs = await Promise.all(times.map((t, i) => call('POST', '/api/runs/finish', { body: { run: ss[i].run, result: RES({ time: t }) }, token: u.token })));
  rs.forEach((r) => expectOk(r));
  const g = expectOk(await board(b, { token: u.token }));
  assert.deepEqual([g.total, g.entries.length, g.entries[0].time, g.me.time], [1, 1, 70_000, 70_000]);
}, { memOnly: true });

test('경합: 탈퇴하는 동안 끝난 제출이 순위표에 남지 않는다', async () => {
  const b = 'practice:s11:normal';
  const u = await signup();
  expectOk(await call('PUT', '/api/profile/nick', { body: { nick: 'Phantom' }, token: u.token }));
  const s = await start(u, b);
  advance(2 * MIN);
  const backend = currentBackend;
  // 제출이 기록을 쓰기 직전에 멈춰 두고 탈퇴를 끝낸 뒤 풀어 준다
  let release;
  const gate = new Promise((r) => { release = r; });
  let held = false;
  backend.hook = async (op, st, key) => { if (!held && st === cfg.STORES.boards && op === 'setJSON' && key.startsWith('u/')) { held = true; await gate; } };
  let settled = false;
  const fin = call('POST', '/api/runs/finish', { body: { run: s.run, result: RES() }, token: u.token }).finally(() => { settled = true; });
  while (!held && !settled) await new Promise((r) => setImmediate(r));
  assert.ok(held, '제출이 기록 쓰기 전에 끝남');
  expectOk(await call('DELETE', '/api/auth/account', { body: { password: PW }, token: u.token, ip: freshIp() }));
  release();
  backend.hook = null;
  expectErr(await fin, 401, 'unauthorized');
  const g = expectOk(await board(b));
  assert.equal(g.entries.length, 0);
  assert.equal(g.total, 0);
  assert.ok(!(await keysOf(cfg.STORES.boards)).some((k) => k.includes('/e/') && k.startsWith(`b/practice.s11`)));
}, { memOnly: true });

test('서버 오류 뒤 같은 런으로 다시 보내면 받아 준다 (기록은 한 번, best 유지)', async () => {
  const u = await signup();
  const b = 'practice:s12:normal';
  const s = await start(u, b);
  advance(2 * MIN);
  const backend = currentBackend;
  let failNext = true;
  backend.hook = async (op, st, key) => { if (failNext && st === cfg.STORES.boards && op === 'setJSON' && key.endsWith('/i')) { failNext = false; throw new Error('simulated outage'); } };
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a.join(' '));
  let r;
  try { r = await call('POST', '/api/runs/finish', { body: { run: s.run, result: RES() }, token: u.token }); } finally { console.error = orig; backend.hook = null; }
  expectErr(r, 500, 'server_error');
  assert.ok(errs.some((e) => e.includes('runs-finish')));
  const again = expectOk(await call('POST', '/api/runs/finish', { body: { run: s.run, result: RES() }, token: u.token }));
  assert.deepEqual([again.best, again.rank, again.total], [true, 1, 1]);
  expectErr(await call('POST', '/api/runs/finish', { body: { run: s.run, result: RES() }, token: u.token }), 409, 'run_used');
}, { memOnly: true });

// ═════════ 실행 ═════════
let currentBackend = null;

async function runMode(mode) {
  let cleanup = async () => {};
  if (mode === 'memory') {
    const b = createMemoryBackend();
    currentBackend = b;
    rt.setStoreFactory((name, dc) => b.factory(name, dc));
  } else {
    const { BlobsServer } = await import('@netlify/blobs/server');
    const { setEnvironmentContext } = await import('@netlify/blobs');
    const dir = path.join(ROOT, 'tools/.qa_online', `blobs-${process.pid}-${Date.now()}`);
    const token = 'local-test-token';
    const server = new BlobsServer({ directory: dir, token });
    const { port } = await server.start();
    const url = `http://localhost:${port}`;
    setEnvironmentContext({ siteID: 'test-site', token, edgeURL: url, uncachedEdgeURL: url, deployID: '0123456789abcdef01234567', primaryRegion: 'us-east-1' });
    rt.setStoreFactory(null);
    currentBackend = null;
    cleanup = async () => {
      await server.stop();
      fs.rmSync(dir, { recursive: true, force: true });
      try { fs.rmdirSync(path.dirname(dir)); } catch { /* 다른 실행이 쓰는 중 */ }
    };
  }
  let pass = 0, fail = 0, skip = 0;
  const t0 = Date.now();
  for (const t of tests) {
    if (FILTER && !t.name.includes(FILTER)) continue;
    if (t.memOnly && mode !== 'memory') { skip++; continue; }
    T += 2 * HOUR; // 테스트끼리 시간 창이 겹치지 않게
    scrypto.setHashCostForTests({ N: 1024, r: 8, p: 1 });
    try {
      await t.fn();
      pass++;
      console.log(`  ✓ ${t.name}`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${t.name}\n      ${String(e?.stack ?? e).split('\n').slice(0, 8).join('\n      ')}`);
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
