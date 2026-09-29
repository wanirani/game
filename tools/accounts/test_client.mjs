// 계정 클라이언트 브라우저 테스트 (헤드리스 Chromium): node tools/accounts/test_client.mjs [--filter=문자열]
//  - 게임을 디스크에서 그대로 내보내되 호스트를 흉내 낸다: https://game.test (공식 사이트 역할), https://claude.ai (임베드 역할)
//  - netlify.toml 의 운영 CSP 를 문서 응답에 그대로 붙인다 (claude.ai 흉내에는 connect-src 'none' 을 더해 다른 요청을 모두 막는다)
//  - /api/* 는 실제 핸들러(netlify/functions/api.mts) + 메모리 저장소(mem_store.mjs)로 처리한다
// 확인: 게스트·claude.ai·오프라인에서 요청 0건/안내, '로그인 유지' 켬·끔 저장 위치와 서버 세션 길이, 로그아웃·모든 기기 로그아웃,
//       약한 비밀번호 사전 차단, 시험용 주소 덮어쓰기로 다른 사이트에 보내지 않음, 형식이 틀린 서버 응답 거부, CSP 위반 0건,
//       안드로이드 앱 흉내(https://appassets.androidplatform.net + window.__BN_APP): /api 프록시가 켜져 있으면 같은 출처 /api 만,
//       프록시 없는 옛 앱만 공식 사이트(APP_API_BASE) 직접 + 앱 출처 CORS
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createMemoryBackend } from './mem_store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const FILTER = typeof args.filter === 'string' ? args.filter : null;

globalThis.Netlify = { context: null, env: { get: () => undefined, set() {}, has: () => false, delete() {}, toObject: () => ({}) } };
const api = (await import(path.join(ROOT, 'netlify/functions/api.mts'))).default;
const rt = await import(path.join(ROOT, 'netlify/lib/runtime.mts'));
const scrypto = await import(path.join(ROOT, 'netlify/lib/crypto.mts'));
const backend = createMemoryBackend();
rt.setStoreFactory((name, dc) => backend.factory(name, dc));
scrypto.setHashCostForTests({ N: 1024, r: 8, p: 1 });

const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const CSP = /Content-Security-Policy = "([^"]+)"/.exec(toml)[1];
const CSP_CLAUDE = CSP.replace("connect-src 'self'", "connect-src 'none'");
const cloudMod = await import(path.join(ROOT, 'src/core/cloud.js'));
const APP_HOST = 'appassets.androidplatform.net';
const SITE_HOST = new URL(cloudMod.APP_API_BASE).host; // 앱이 직접 부르는 공식 사이트 (프록시 없는 옛 앱)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

/** 새 브라우저 문맥: 모든 요청을 가로채 디스크 파일·API 핸들러로 답한다. log 에 요청을 남긴다 */
async function newContext({ offline = false, hooks = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
  const log = [];
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    log.push({ host: u.host, path: u.pathname, method: req.method() });
    if (u.host !== 'game.test' && u.host !== 'claude.ai' && u.host !== APP_HOST && u.host !== SITE_HOST) return route.abort('blockedbyclient');
    if (u.host === SITE_HOST && !u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, body: 'not found' });
    if (u.pathname.startsWith('/api/')) {
      if (u.host === 'claude.ai') return route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' });
      const hook = hooks[u.pathname];
      if (hook) return route.fulfill(hook);
      const headers = await req.allHeaders();
      const body = req.postDataBuffer();
      const r = new Request(req.url(), { method: req.method(), headers, body: body && body.length ? body : undefined });
      const res = await api(r, { ip: '198.51.100.20', deploy: { context: 'production' } });
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    const file = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    const ext = path.extname(file);
    const headers = { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' };
    // 앱(AssetServer)은 CSP 를 붙이지 않는다 — 웹 흉내에만 운영 CSP
    if (ext === '.html' && u.host !== APP_HOST) headers['content-security-policy'] = u.host === 'claude.ai' ? CSP_CLAUDE : CSP;
    return route.fulfill({ status: 200, headers, body: fs.readFileSync(file) });
  });
  if (offline) await ctx.setOffline(true);
  return { ctx, log };
}

/** 게임을 열고 준비될 때까지 기다린다 (부팅이 두 단계라 타이틀 뒤에 늦게 등록되는 장면까지: game.scenesReady). errs: 페이지 오류·CSP 위반 */
async function openGame(ctx, url = 'https://game.test/index.html', init = null, app = null) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await page.addInitScript(({ initStore, app }) => {
    if (app) window.__BN_APP = app; // 앱 조각(head_inject.html)이 게임 모듈보다 먼저 만드는 값 흉내
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    if (initStore) for (const [k, v] of Object.entries(initStore)) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } }
  }, { initStore: init, app });
  await page.goto(url, { timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.scenes.length > 0 && window.__game.scenesReady !== false, null, { timeout: 30000 });
  return { page, errs };
}
const scene = (page) => page.evaluate(() => ({ name: window.__game.top?.name, screen: window.__game.top?.screen, msg: window.__game.top?.msg?.text ?? null, remember: window.__game.top?.remember }));
async function openAccount(page) {
  await page.evaluate(() => window.__game.go('account', {}, { fade: false }));
  await page.waitForFunction(() => { const t = window.__game.top; return t?.name === 'account' && t.screen && t.screen !== 'checking'; }, null, { timeout: 10000 });
  return scene(page);
}
async function showScreen(page, name) {
  await page.evaluate((n) => window.__game.top.show(n), name);
  await page.waitForFunction(() => [...document.querySelectorAll('.bn-field')].every((el) => el.style.visibility === 'visible'), null, { timeout: 5000 });
}
const storage = (page) => page.evaluate(() => ({
  local: localStorage.getItem('bn_auth'), session: sessionStorage.getItem('bn_auth'),
  remember: localStorage.getItem('bn_remember'), sync: localStorage.getItem('bn_cloud_sync'),
}));
const waitMsg = (page) => page.waitForFunction(() => { const t = window.__game.top; return t?.name === 'account' && !t.busy && t.msg && !t.msg.spin; }, null, { timeout: 15000 });
const sessionsOf = (id) => JSON.parse(backend.data.get(`site\u0000bn-users\u0000${id}`)?.body ?? '{"sessions":[]}').sessions;
const apiCall = async (method, p, body, token) => {
  const h = new Headers();
  if (body) h.set('content-type', 'application/json');
  if (token) h.set('authorization', `Bearer ${token}`);
  const res = await api(new Request('https://game.test' + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), { ip: '198.51.100.21', deploy: { context: 'production' } });
  return { status: res.status, body: await res.json() };
};
let seq = 0;
const newId = () => `tester${String(++seq).padStart(3, '0')}${Date.now() % 1000}`.slice(0, 16);
const PW = 'crimson-moon-77';

async function signupViaUi(page, id, pw = PW) {
  await showScreen(page, 'signup');
  await page.fill('.bn-field[name=username]', id);
  await page.fill('.bn-field[name=new-password]', pw);
  await page.fill('.bn-field[name=confirm-password]', pw);
  await page.press('.bn-field[name=confirm-password]', 'Enter');
}

/** 확인 대화 상자(frontConfirm)에서 '예'를 고른다 (대화 상자가 닫힌 뒤 onYes 가 불린다) */
async function confirmYes(page) {
  await page.waitForFunction(() => window.__game.top?.name === 'frontConfirm');
  await page.evaluate(() => window.__game.top.close(true));
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('게스트: 시작할 때 요청 0건, 계정 화면을 열 때 health 1건', async () => {
  const { ctx, log } = await newContext();
  const { page, errs } = await openGame(ctx);
  await page.waitForTimeout(800);
  assert.equal(log.filter((r) => r.path.startsWith('/api/')).length, 0);
  const s = await openAccount(page);
  assert.equal(s.screen, 'home');
  assert.deepEqual(log.filter((r) => r.path.startsWith('/api/')).map((r) => r.path), ['/api/health']);
  assert.deepEqual(await page.evaluate(() => window.__csp), []);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('claude.ai 임베드: 요청 0건, 안내 화면, 이 기기 저장은 그대로, 다른 사이트로 가는 시험 주소도 무시', async () => {
  const { ctx, log } = await newContext();
  const { page, errs } = await openGame(ctx, 'https://claude.ai/index.html', { bn_api_base: 'https://evil.example/api', bn_auth: JSON.stringify({ id: 'hunter01', token: 'A'.repeat(43) }) });
  const s = await openAccount(page);
  assert.equal(s.screen, 'unavailable');
  assert.equal(await page.evaluate(async () => (await import('/src/core/cloud.js')).cloud.state), 'blocked');
  const saved = await page.evaluate(async () => {
    const { saves } = await import('/src/core/save.js');
    const { newGameState } = await import('/src/game/state.js');
    saves.write(2, newGameState({ slot: 2, difficulty: 'normal', charId: 'kael' }));
    return !!saves.read(2);
  });
  assert.ok(saved, '이 기기 저장');
  await page.waitForTimeout(2500);
  assert.equal(log.filter((r) => r.path.includes('/api/')).length, 0, '요청이 나감');
  assert.equal(log.filter((r) => r.host === 'evil.example').length, 0, '다른 사이트로 요청');
  // connect-src 'none' 이라 계정 요청을 시도했다면 CSP 위반으로 잡힌다 (게임 자산 JSON 로드는 이 흉내에서만 막히므로 제외)
  const csp = await page.evaluate(() => window.__csp);
  assert.deepEqual(csp.filter((v) => /\/api\/|evil\.example/.test(v)), [], csp.join(' | '));
  assert.deepEqual(errs.filter((e) => e.startsWith('PAGEERROR') || /\/api\/|evil\.example/.test(e)), []);
  await ctx.close();
});

test('오프라인: 계정 화면에 안내, 오류 없음', async () => {
  const { ctx } = await newContext();
  const { page, errs } = await openGame(ctx);
  await ctx.setOffline(true);
  const s = await openAccount(page);
  assert.equal(s.screen, 'unavailable');
  assert.equal(await page.evaluate(async () => (await import('/src/core/cloud.js')).cloud.state), 'offline');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('약한 비밀번호: 화면에서 바로 한국어로 막고 가입 요청을 보내지 않음', async () => {
  const { ctx, log } = await newContext();
  const { page } = await openGame(ctx);
  await openAccount(page);
  await signupViaUi(page, newId(), 'qwer1234');
  const s = await scene(page);
  assert.match(s.msg ?? '', /흔하거나 추측하기 쉬운 비밀번호/);
  assert.equal(log.filter((r) => r.path === '/api/auth/signup').length, 0);
  await ctx.close();
});

test("'로그인 유지' 끔(데스크톱 기본): 토큰은 sessionStorage, 서버 세션 12시간, 새로 고침해도 유지, 로그아웃하면 흔적 삭제", async () => {
  const { ctx } = await newContext();
  const { page, errs } = await openGame(ctx);
  await openAccount(page);
  await showScreen(page, 'login');
  assert.equal((await scene(page)).remember, false, '데스크톱 기본값은 끔');
  const id = newId();
  await signupViaUi(page, id);
  await page.waitForFunction(() => window.__game.top.screen === 'code', null, { timeout: 15000 });
  let st = await storage(page);
  assert.equal(st.local, null, 'localStorage 에 토큰');
  assert.equal(JSON.parse(st.session).id, id);
  assert.equal(st.remember, '0');
  const ss = sessionsOf(id);
  assert.equal(ss.length, 1);
  assert.equal(ss[0].ttl, 12 * 3600 * 1000);
  const token = JSON.parse(st.session).token;
  // 새로 고침: sessionStorage 는 남는다
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.scenes.length > 0 && window.__game.scenesReady !== false);
  await page.waitForFunction(async () => (await import('/src/core/cloud.js')).cloud.verified, null, { timeout: 10000 });
  assert.equal(await page.evaluate(async () => (await import('/src/core/cloud.js')).cloud.id), id);
  // 같은 기기의 새 창(다른 탭)에는 로그인이 없다
  const other = await ctx.newPage();
  await other.goto('https://game.test/index.html');
  await other.waitForFunction(() => window.__game && window.__game.scenes.length > 0 && window.__game.scenesReady !== false);
  assert.equal(await other.evaluate(async () => (await import('/src/core/cloud.js')).cloud.loggedIn), false);
  await other.close();
  // 로그아웃: 저장소·동기화 기록(아이디)·서버 세션 모두 정리
  await openAccount(page);
  await page.evaluate(() => window.__game.top.confirmLogout());
  await confirmYes(page);
  await page.waitForFunction(() => window.__game.top?.name === 'account' && window.__game.top.screen === 'home' && !window.__game.top.busy, null, { timeout: 10000 });
  st = await storage(page);
  assert.equal(st.local, null); assert.equal(st.session, null);
  assert.ok(!(st.sync ?? '').includes(id), '동기화 기록에 아이디가 남음');
  assert.match((await scene(page)).msg, /로그아웃했습니다/);
  assert.equal((await apiCall('GET', '/api/auth/me', null, token)).status, 401);
  assert.deepEqual(await page.evaluate(() => window.__csp), []);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test("'로그인 유지' 켬: 토큰은 localStorage, 서버 세션 30일, 선택을 기억", async () => {
  const { ctx } = await newContext();
  const { page } = await openGame(ctx);
  const id = newId();
  assert.equal((await apiCall('POST', '/api/auth/signup', { id, password: PW })).status, 201);
  await openAccount(page);
  await showScreen(page, 'login');
  await page.fill('.bn-field[name=username]', id);
  await page.fill('.bn-field[name=password]', PW);
  // 키보드로 '로그인 유지' 칸에 가서 켠다 (비밀번호 칸 ↓ → 체크 칸, Z = 결정)
  await page.press('.bn-field[name=password]', 'ArrowDown');
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(100);
  assert.equal((await scene(page)).remember, true, '키보드로 켜짐');
  await page.evaluate(() => window.__game.top.submit());
  await page.waitForFunction(() => window.__game.top.screen === 'profile', null, { timeout: 15000 });
  const st = await storage(page);
  assert.equal(JSON.parse(st.local).id, id);
  assert.equal(st.session, null);
  assert.equal(st.remember, '1');
  const ss = sessionsOf(id);
  assert.equal(ss.at(-1).ttl, 30 * 24 * 3600 * 1000);
  // 다음에 로그인 화면을 열면 켜진 채로
  await page.evaluate(() => window.__game.go('title', {}, { fade: false }));
  await openAccount(page);
  assert.equal(await page.evaluate(() => window.__game.top.remember), true);
  await ctx.close();
});

test('모든 기기에서 로그아웃: 다른 기기의 세션도 끊기고, 서버에 닿지 못하면 로그인 상태를 유지하고 알림', async () => {
  const { ctx } = await newContext();
  const { page } = await openGame(ctx);
  const id = newId();
  const other = (await apiCall('POST', '/api/auth/signup', { id, password: PW })).body.token;
  await openAccount(page);
  await showScreen(page, 'login');
  await page.fill('.bn-field[name=username]', id);
  await page.fill('.bn-field[name=password]', PW);
  await page.press('.bn-field[name=password]', 'Enter');
  await page.waitForFunction(() => window.__game.top.screen === 'profile' && !window.__game.top.busy, null, { timeout: 15000 });
  // 오프라인에서 시도 → 실패 알림, 로그인 유지
  await ctx.setOffline(true);
  await page.evaluate(() => window.__game.top.confirmLogoutAll());
  await confirmYes(page);
  await waitMsg(page);
  assert.equal(await page.evaluate(async () => (await import('/src/core/cloud.js')).cloud.loggedIn), true);
  assert.match((await scene(page)).msg, /인터넷|연결/);
  await ctx.setOffline(false);
  await page.evaluate(() => window.__game.top.confirmLogoutAll());
  await confirmYes(page);
  await page.waitForFunction(() => window.__game.top?.screen === 'home' && !window.__game.top.busy, null, { timeout: 10000 });
  assert.match((await scene(page)).msg, /모든 기기에서 로그아웃했습니다/);
  assert.equal((await apiCall('GET', '/api/auth/me', null, other)).status, 401, '다른 기기 세션이 살아 있음');
  const st = await storage(page);
  assert.equal(st.local, null); assert.equal(st.session, null);
  await ctx.close();
});

test('오프라인 로그아웃: 이 기기에서는 로그아웃하고, 서버에 닿지 못했음을 알림', async () => {
  const { ctx } = await newContext();
  const id = newId();
  const token = (await apiCall('POST', '/api/auth/signup', { id, password: PW })).body.token;
  const { page } = await openGame(ctx, 'https://game.test/index.html', { bn_auth: JSON.stringify({ id, token }), bn_remember: '1' });
  await page.waitForFunction(async () => (await import('/src/core/cloud.js')).cloud.verified, null, { timeout: 10000 });
  await openAccount(page);
  await ctx.setOffline(true);
  await page.evaluate(() => window.__game.top.confirmLogout());
  await confirmYes(page);
  await page.waitForFunction(() => window.__game.top?.screen === 'home' && !window.__game.top.busy, null, { timeout: 15000 });
  assert.match((await scene(page)).msg, /서버에 닿지 못했으니/);
  assert.equal((await storage(page)).local, null);
  await ctx.close();
});

test('시험용 주소 덮어쓰기가 다른 사이트를 가리켜도 같은 출처 /api 만 부름', async () => {
  const { ctx, log } = await newContext();
  const { page } = await openGame(ctx, 'https://game.test/index.html', { bn_api_base: 'https://evil.example/api' });
  await openAccount(page);
  assert.equal(log.filter((r) => r.host === 'evil.example').length, 0);
  assert.ok(log.some((r) => r.host === 'game.test' && r.path === '/api/health'));
  await ctx.close();
});

test('안드로이드 앱: /api 프록시가 켜져 있으면 같은 출처 /api 만, 프록시 없는 옛 앱만 공식 사이트 API 직접(앱 출처 CORS)', async () => {
  const cases = [
    { app: { platform: 'android', version: 'test', assets: 'full', apiProxy: true, apiBase: '/api' }, host: APP_HOST, base: '/api', other: SITE_HOST },
    { app: { platform: 'android', version: 'test', assets: 'full', apiProxy: false, apiBase: null }, host: SITE_HOST, base: cloudMod.APP_API_BASE, other: APP_HOST },
  ];
  for (const c of cases) {
    const { ctx, log } = await newContext();
    const { page, errs } = await openGame(ctx, `https://${APP_HOST}/index.html`, null, c.app);
    const tag = `apiProxy=${c.app.apiProxy}`;
    assert.equal(await page.evaluate(async () => (await import('/src/core/cloud.js')).cloud.base), c.base, tag);
    await openAccount(page);
    assert.equal(await page.evaluate(async () => (await import('/src/core/cloud.js')).cloud.state), 'ready', tag);
    assert.ok(log.some((r) => r.host === c.host && r.path === '/api/health'), `${tag}: ${c.host}/api/health 없음`);
    assert.equal(log.filter((r) => r.host === c.other && r.path.startsWith('/api/')).length, 0, `${tag}: ${c.other} 로 API 요청`);
    assert.deepEqual(errs, [], tag);
    await ctx.close();
  }
});

test('형식이 틀린 로그인 응답(아이디·토큰)은 저장하지 않음', async () => {
  const evil = { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: '<img src=x onerror=alert(1)>', token: 'short' }) };
  const { ctx } = await newContext({ hooks: { '/api/auth/login': evil } });
  const { page } = await openGame(ctx);
  await openAccount(page);
  await showScreen(page, 'login');
  await page.fill('.bn-field[name=username]', 'hunter01');
  await page.fill('.bn-field[name=password]', PW);
  await page.press('.bn-field[name=password]', 'Enter');
  await waitMsg(page);
  const st = await storage(page);
  assert.equal(st.local, null); assert.equal(st.session, null);
  assert.equal(await page.evaluate(async () => (await import('/src/core/cloud.js')).cloud.loggedIn), false);
  assert.match((await scene(page)).msg, /서버 응답을 읽을 수 없습니다/);
  // 저장소에 이상한 값이 들어 있어도 버린다
  await page.evaluate(() => localStorage.setItem('bn_auth', JSON.stringify({ id: '<b>x</b>', token: 'A'.repeat(43) })));
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.scenes.length > 0 && window.__game.scenesReady !== false);
  assert.equal(await page.evaluate(async () => (await import('/src/core/cloud.js')).cloud.loggedIn), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('bn_auth')), null);
  await ctx.close();
});

let pass = 0, fail = 0;
for (const t of tests) {
  if (FILTER && !t.name.includes(FILTER)) continue;
  try {
    await t.fn();
    pass++;
    console.log(`  ✓ ${t.name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${t.name}\n      ${String(e?.stack ?? e).split('\n').slice(0, 6).join('\n      ')}`);
  }
}
await browser.close();
console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail ? 1 : 0);
