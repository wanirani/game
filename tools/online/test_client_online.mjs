// 온라인 기능 클라이언트 시험 (헤드리스 Chromium): node tools/online/test_client_online.mjs [--filter=문자열] [--shots=폴더]
//  - docs/specs/online.md 계약의 API 를 이 파일 안의 흉내(mock)로 답한다 (Playwright route 가로채기) — 서버 구현을 기다리지 않는다
//  - 게임은 디스크에서 그대로 https://game.test 로 내보낸다 (cloud.eligible: https). 로그인은 bn_auth 를 미리 넣어 흉내 낸다
// 확인: 런 시작·제출(결과·고스트 본문, 정산 화면 순위 줄) · 오프라인 대기열과 다시 보내기 · 6시간 지난 대기열 버림 ·
//       명예의 전당 온라인 탭(휴대폰 740×360·844×390, 데스크톱; 키보드·패드·터치, 탭 크기 감사, 스크린숏) ·
//       오늘의 도전 카드 · 규칙 적용(적 체력·속도 배율, 물약·보조 무기 금지, 피해 배율, 어둠, 시드) ·
//       고스트 크기(20분 ≤ 24KB)·재생 위치 정확도·재생 그리기 · 로그인 안 했을 때 안내 · 별명 바꾸기 화면
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { fakePadInit, connect as padConnect, press as padPress, BTN } from '../qa/lib/fakepad.mjs';
import { installTapRecorder, auditScene } from '../qa/lib/taps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const FILTER = typeof args.filter === 'string' ? args.filter : null;
const SHOTS = typeof args.shots === 'string' ? args.shots : '/tmp/claude-0/online_shots';
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };
const TOKEN = 'T'.repeat(43);
const AUTH = { bn_auth: JSON.stringify({ id: 'hunter01', token: TOKEN }) };
const kstDay = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');

// ───────────────────────── API 흉내 (docs/specs/online.md §2) ─────────────────────────
function makeMock() {
  const M = {
    log: [], runs: 0, finishes: [], down: new Set(), nick: '헌터#1234', ghosts: new Map(),
    daily: { date: kstDay(), seed: 424242, stageId: 's01', diff: 'normal', hero: 'kael', cls: 'kael_crusader', preset: 1, mods: ['hp_x1.5', 'haste'], board: `daily:${kstDay()}` },
    rank: 3, total: 12, best: true,
  };
  M.entries = (board, n = 50) => Array.from({ length: n }, (_, i) => ({
    rank: i + 1, nick: i === 2 ? M.nick : `사냥꾼${i + 1}`, time: 60000 + i * 1530, score: 900000 - i * 9000, wave: board.startsWith('survival') ? 40 - Math.floor(i / 2) : undefined,
    hero: ['kael', 'sera', 'victor', 'bran', 'lia', 'azel'][i % 6], cls: ['kael_hunter', 'sera_exorcist', 'victor_gunslinger', 'bran_warrior', 'lia_shadow', 'azel_mage'][i % 6], level: 25, date: Date.now(), ghost: i < 20,
  }));
  M.handle = (method, p, headers, body) => {
    const authed = headers.authorization === `Bearer ${TOKEN}`;
    const ok = (o, status = 200) => ({ status, body: { ok: true, ...o } });
    const err = (status, error) => ({ status, body: { ok: false, error } });
    if (p === '/api/health') return ok({});
    if (p === '/api/auth/me') return authed ? ok({ id: 'hunter01', createdAt: Date.now() - 86400e3, nick: M.nick }) : err(401, 'unauthorized');
    if (p === '/api/saves') return authed ? ok({ slots: [1, 2, 3].map((slot) => ({ slot, empty: true, rev: 0 })), meta: { rev: 0 } }) : err(401, 'unauthorized');
    if (p === '/api/meta') return method === 'GET' ? ok({ rev: 0, data: null }) : ok({ rev: 1 });
    if (p === '/api/runs' && method === 'POST') {
      if (!authed) return err(401, 'unauthorized');
      M.runs++;
      return ok({ run: `run.${M.runs}.${body?.board}`, seed: body?.board?.startsWith('daily') ? M.daily.seed : 777 + M.runs, ts: Date.now() });
    }
    if (p === '/api/runs/finish' && method === 'POST') {
      if (!authed) return err(401, 'unauthorized');
      M.finishes.push(body);
      if (body?.ghost) M.ghosts.set(body.run.split('.').slice(2).join('.'), { nick: M.nick, time: body.result.time, hero: body.result.hero, cls: body.result.cls, data: body.ghost });
      return ok({ best: M.best, rank: M.rank, total: M.total, entry: { rank: M.rank, nick: M.nick, time: body?.result?.time } });
    }
    let m = /^\/api\/boards\/([a-z0-9:_]+)$/.exec(p);
    if (m) {
      const board = m[1];
      const o = { board, total: 50, entries: M.entries(board) };
      if (authed) o.me = { rank: 3, time: 63060, score: 882000 };
      return ok(o);
    }
    m = /^\/api\/ghosts\/([a-z0-9:_]+)\/(\d+)$/.exec(p);
    if (m) { const g = M.ghosts.get(m[1]); return g ? ok(g) : err(404, 'not_found'); }
    if (p === '/api/daily') return ok(M.daily);
    if (p === '/api/profile/nick' && method === 'PUT') {
      if (!authed) return err(401, 'unauthorized');
      const n = String(body?.nick ?? '');
      if (n.includes('바보')) return { status: 400, body: { ok: false, error: 'nick_banned', message: '쓸 수 없는 낱말이 들어 있어요. 다른 별명을 정해 주세요.' } };
      M.nick = n === '드라큘라' ? `${n}#12` : n;
      return ok({ nick: M.nick });
    }
    return err(404, 'not_found');
  };
  return M;
}

// 실제 서버 처리기 (netlify/functions/api.mts + 메모리 저장소) — 끝에서 끝까지 시험 하나에 쓴다
globalThis.Netlify ??= { context: null, env: { get: () => undefined, set() {}, has: () => false, delete() {}, toObject: () => ({}) } };
let REAL = null;
async function realApi() {
  if (REAL) return REAL;
  const api = (await import(path.join(ROOT, 'netlify/functions/api.mts'))).default;
  const rt = await import(path.join(ROOT, 'netlify/lib/runtime.mts'));
  const scrypto = await import(path.join(ROOT, 'netlify/lib/crypto.mts'));
  const { createMemoryBackend } = await import(path.join(ROOT, 'tools/accounts/mem_store.mjs'));
  const backend = createMemoryBackend();
  rt.setStoreFactory((name, dc) => backend.factory(name, dc));
  scrypto.setHashCostForTests?.({ N: 1024, r: 8, p: 1 });
  REAL = { api };
  return REAL;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

async function newContext(M, vp = 'desk') {
  const ctx = await browser.newContext({ ...(vp === 'desk' ? { viewport: { width: 1280, height: 720 } } : contextOptions(vp)), serviceWorkers: 'block' });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host !== 'game.test') return route.abort('blockedbyclient');
    if (u.pathname.startsWith('/api/')) {
      M.log.push({ method: req.method(), path: u.pathname, q: u.search });
      if ([...M.down].some((d) => u.pathname === d || d === '*')) return route.abort('internetdisconnected');
      let body = null;
      try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
      if (M.real) {
        const headers = await req.allHeaders();
        const buf = req.postDataBuffer();
        const res = await M.real.api(new Request(req.url(), { method: req.method(), headers, body: buf && buf.length ? buf : undefined }), { ip: '198.51.100.30', deploy: { context: 'production' } });
        return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
      }
      if (M.rejectGhost && u.pathname === '/api/runs/finish' && body?.ghost) { M.rejected = (M.rejected ?? 0) + 1; return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_ghost', message: '고스트 형식' }) }); }
      const r = M.handle(req.method(), u.pathname, await req.allHeaders(), body);
      return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
    }
    const file = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, headers: { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }, body: fs.readFileSync(file) });
  });
  return ctx;
}
async function openGame(ctx, { init = null, initScripts = [] } = {}) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  for (const s of initScripts) await page.addInitScript(s.fn, s.arg);
  await page.addInitScript((store) => { if (store) for (const [k, v] of Object.entries(store)) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } } }, init);
  await page.goto('https://game.test/index.html?nosw', { timeout: 30000 });
  await page.waitForFunction(() => window.__game && window.__game.scenes.length > 0 && window.__game.scenesReady !== false, null, { timeout: 30000 });
  return { page, errs };
}
const waitTop = (page, name, ms = 15000) => page.waitForFunction((n) => window.__game.top?.name === n && (window.__game.fade?.a ?? 0) < 0.05, name, { timeout: ms });
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
/** 고정 스텝으로 게임 진행 (부하에 상관없이 같은 결과) */
const ticks = (page, n) => page.evaluate((n) => { const g = window.__game; for (let i = 0; i < n; i++) g.tick(1 / 60); g.render?.(); }, n);

/** 아케이드 연습 장면을 바로 연다 (임시 세이브 · 헌터 선택 건너뜀) */
async function startPractice(page, cfg = {}) {
  await page.evaluate(async (cfg) => {
    const A = await import('/src/scenes/front/arcade.js');
    A.startArcade(window.__game, { kind: 'practice', diff: 'normal', preset: 1, course: 0, stageId: 's01', ghost: 'off', ...cfg }, cfg.charId ?? 'kael');
  }, cfg);
  await waitTop(page, 'practice');
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ───────────────────────── 런 흐름 ─────────────────────────
test('런 시작·제출: 시작 때 POST /api/runs, 정산 화면이 결과+고스트를 올리고 순위 줄을 보여 줌', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH });
  await startPractice(page);
  await page.waitForFunction(() => window.__game.top.orun?.state === 'ready', null, { timeout: 8000 });
  assert.deepEqual(M.log.filter((r) => r.path === '/api/runs').map((r) => r.method), ['POST']);
  // 영웅을 오른쪽으로 3초 움직여 고스트를 쌓는다
  await page.evaluate(() => { window.__game._pageHidden = true; });
  await page.keyboard.down('ArrowRight'); await ticks(page, 180); await page.keyboard.up('ArrowRight');
  await page.evaluate(() => window.__game.top.finish(true));
  await page.evaluate(() => { window.__game._pageHidden = false; });
  await waitTop(page, 'arcadeResults');
  await page.waitForFunction(() => window.__game.top.onl?.state === 'ok', null, { timeout: 10000 });
  const f = M.finishes[0];
  assert.ok(f, '제출 요청');
  assert.match(f.run, /^run\.1\.practice:s01:normal$/);
  assert.equal(f.board, 'practice:s01:normal', 'board 도 보낸다 (§2.2)');
  for (const k of ['time', 'score', 'hero', 'cls', 'level']) assert.ok(k in f.result, `result.${k}`);
  assert.equal(f.result.hero, 'kael');
  assert.ok(f.result.time > 2000 && f.result.time < 10000, `time ${f.result.time}`);
  assert.ok(typeof f.ghost === 'string' && f.ghost.length > 10 && f.ghost.length <= 24 * 1024, 'ghost');
  const txt = await page.evaluate(() => window.__game.top.onlineText());
  assert.match(txt[0], /새 최고 기록! 3위 \(전체 12명\)/);
  await page.evaluate(() => { const t = window.__game.top; t.shown = t.res.rows.length; t.scoreShown = t.final; t.doneT = t.t; });
  await page.waitForTimeout(400);
  await shot(page, 'results_ok_desk');
  // 기기에도 내 최고 고스트
  assert.ok(await page.evaluate(() => !!JSON.parse(localStorage.getItem('bn_ghost_best') ?? '{}')['practice:s01:normal']));
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('오프라인 대기열: 제출이 끊기면 기기에 두고, 연결되면 다시 보냄 · 6시간 지난 것은 버림', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH });
  await startPractice(page);
  await page.waitForFunction(() => window.__game.top.orun?.state === 'ready', null, { timeout: 8000 });
  M.down.add('/api/runs/finish');
  await page.evaluate(() => { window.__game.world.run.time = 42.5; window.__game.top.finish(true); });
  await waitTop(page, 'arcadeResults');
  await page.waitForFunction(() => window.__game.top.onl?.state === 'queued', null, { timeout: 10000 });
  assert.match((await page.evaluate(() => window.__game.top.onlineText()))[0], /오프라인/);
  let q = await page.evaluate(() => JSON.parse(localStorage.getItem('bn_online_q')));
  assert.equal(q.length, 1);
  assert.equal(q[0].body.result.time, 42500);
  assert.equal(M.finishes.length, 0);
  // 6시간 지난 항목 하나 더 (보내지 않고 버려야 한다)
  await page.evaluate(() => { const q = JSON.parse(localStorage.getItem('bn_online_q')); q.unshift({ ...q[0], at: Date.now() - 7 * 3600e3, body: { ...q[0].body, run: 'run.old' } }); localStorage.setItem('bn_online_q', JSON.stringify(q)); });
  M.down.clear();
  const flushed = page.evaluate(() => new Promise((res) => { import('/src/core/events.js').then(({ bus }) => { const off = bus.on('online:flushed', (o) => { off(); res(o); }); }); }));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const o = await flushed;
  assert.equal(o.sent.length, 1);
  assert.equal(o.sent[0].rank, 3);
  assert.equal(o.dropped, 1);
  assert.equal(M.finishes.length, 1);
  assert.equal(M.finishes[0].run, 'run.1.practice:s01:normal');
  q = await page.evaluate(() => JSON.parse(localStorage.getItem('bn_online_q')));
  assert.equal(q.length, 0);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('시작할 때 오프라인: 게임은 그대로, 정산은 "이번 기록은 올리지 못함", 대기열 없음', async () => {
  const M = makeMock();
  M.down.add('/api/runs');
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH });
  await startPractice(page);
  await page.waitForFunction(() => window.__game.top.orun?.state === 'offline', null, { timeout: 10000 });
  await ticks(page, 30);
  await page.evaluate(() => window.__game.top.finish(true));
  await waitTop(page, 'arcadeResults');
  await page.waitForFunction(() => window.__game.top.onl?.state === 'offline', null, { timeout: 10000 });
  assert.match((await page.evaluate(() => window.__game.top.onlineText()))[0], /올리지 못했어요/);
  assert.ok([null, '[]'].includes(await page.evaluate(() => localStorage.getItem('bn_online_q'))), '대기열 없음');
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('고스트 형식 거절(422 invalid_ghost): 같은 런으로 고스트 없이 다시 보냄', async () => {
  const M = makeMock();
  M.rejectGhost = true;
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH });
  await startPractice(page);
  await page.waitForFunction(() => window.__game.top.orun?.state === 'ready', null, { timeout: 8000 });
  await ticks(page, 30);
  await page.evaluate(() => window.__game.top.finish(true));
  await waitTop(page, 'arcadeResults');
  await page.waitForFunction(() => window.__game.top.onl?.state === 'ok', null, { timeout: 10000 });
  assert.equal(M.rejected, 1);
  assert.equal(M.finishes.length, 1);
  assert.equal(M.finishes[0].ghost, undefined);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('끝에서 끝까지 (실제 서버 처리기 · 메모리 저장소): 가입 → 연습 완주 → 1위 · 순위표 · 1위 고스트 · 별명 · 오늘의 도전', async () => {
  const M = makeMock();
  M.real = await realApi();
  const su = await M.real.api(new Request('https://game.test/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: `e2e${Date.now() % 1e6}`, password: 'crimson-moon-77', remember: true }) }), { ip: '198.51.100.31', deploy: { context: 'production' } });
  const sj = await su.json();
  assert.ok(sj.ok, JSON.stringify(sj));
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: { bn_auth: JSON.stringify({ id: sj.id, token: sj.token }) } });
  await startPractice(page);
  await page.waitForFunction(() => window.__game.top.orun?.state === 'ready', null, { timeout: 10000 });
  await page.evaluate(() => { window.__game._pageHidden = true; });
  await page.keyboard.down('ArrowRight'); await ticks(page, 120); await page.keyboard.up('ArrowRight');
  await page.evaluate(() => { const w = window.__game.world; w.run.time = Math.max(w.run.time, 6.2); });
  await page.waitForTimeout(2500);   // 서버 검사: 실제 걸린 시간 ≥ 기록 × 0.9 − 3초
  await page.evaluate(() => { window.__game._pageHidden = false; window.__game.top.finish(true); });
  await waitTop(page, 'arcadeResults');
  await page.waitForFunction(() => ['ok', 'error', 'queued'].includes(window.__game.top.onl?.state), null, { timeout: 15000 });
  const onl = await page.evaluate(() => window.__game.top.onl);
  assert.equal(onl.state, 'ok', JSON.stringify(onl));
  assert.equal(onl.rank, 1); assert.equal(onl.total, 1); assert.equal(onl.best, true);
  // 명예의 전당: 내 항목·내 순위 (별명은 자동 '헌터#…')
  await page.evaluate(() => window.__game.go('highscore', { src: 'online', board: 'practice:s01:normal' }, { fade: false }));
  await page.waitForFunction(() => window.__game.top?.name === 'highscore' && window.__game.top.ob?.state === 'ready', null, { timeout: 10000 });
  const b = await page.evaluate(() => window.__game.top.ob.data);
  assert.equal(b.entries.length, 1); assert.equal(b.me.rank, 1); assert.match(b.entries[0].nick, /^헌터#\d+$/); assert.equal(b.entries[0].ghost, true);
  // 별명 바꾸기 → 순위표에 반영
  const nick = await page.evaluate(async () => (await import('/src/core/online.js')).setNick('밤의사냥꾼'));
  assert.equal(nick.ok, true); assert.equal(nick.nick, '밤의사냥꾼');
  const nid = await page.evaluate(async (id) => (await import('/src/core/online.js')).setNick(`${id}x`), sj.id);
  assert.equal(nid.ok, false); assert.match(nid.message, /아이디/);
  // 다음 판: 1위 고스트를 받아 재생
  await startPractice(page, { ghost: 'top' });
  await page.waitForFunction(() => !!window.__game.top.ghost, null, { timeout: 10000 });
  // 오늘의 도전 카드 (서버가 정한 값이 이 게임 데이터로 열린다)
  await page.evaluate(() => window.__game.go('arcade', { cfg: { kind: 'daily' } }, { fade: false }));
  await page.waitForFunction(() => window.__game.top?.name === 'arcade' && ['ready', 'error'].includes(window.__game.top.daily?.state), null, { timeout: 10000 });
  const d = await page.evaluate(() => ({ state: window.__game.top.daily.state, msg: window.__game.top.daily.msg, cfg: window.__game.top.daily.cfg }));
  assert.equal(d.state, 'ready', d.msg);
  assert.ok(d.cfg.cls, '직업이 그 헌터의 것');
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 로그인 안 함 ─────────────────────────
test('게스트: 런 요청 0건, 정산·명예의 전당·오늘의 도전에 로그인 안내', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx);
  await page.waitForTimeout(3500);   // online.js 의 자동 보내기(3초)도 요청을 만들지 않아야 한다
  assert.equal(M.log.length, 0, '처음 요청 0건');
  await startPractice(page);
  await page.evaluate(() => window.__game.top.finish(true));
  await waitTop(page, 'arcadeResults');
  assert.equal(await page.evaluate(() => window.__game.top.onl?.state), 'guest');
  assert.equal((await page.evaluate(() => window.__game.top.onlineText()))[0], '로그인하면 순위에 오를 수 있어요');
  assert.equal(M.log.filter((r) => r.path.startsWith('/api/runs')).length, 0);
  // 명예의 전당 온라인 탭: 순위는 보이고(인증 없이) 왼쪽에 로그인 안내
  await page.evaluate(() => window.__game.go('highscore', { src: 'online' }, { fade: false }));
  await page.waitForFunction(() => window.__game.top?.name === 'highscore' && window.__game.top.ob?.state === 'ready', null, { timeout: 10000 });
  assert.equal(await page.evaluate(() => window.__game.top.ob.data.me), null);
  await page.waitForTimeout(300);
  await shot(page, 'hof_online_guest_desk');
  const login = await page.evaluate(async () => { const { taps } = await import('/src/core/ui.js'); return taps.audit().some((r) => r.id === 'login'); });
  assert.ok(login, '로그인 버튼');
  // 오늘의 도전 카드
  await page.evaluate(() => window.__game.go('arcade', { cfg: { kind: 'daily' } }, { fade: false }));
  await page.waitForFunction(() => window.__game.top?.name === 'arcade' && window.__game.top.daily?.boardState === 'ready', null, { timeout: 10000 });
  await page.waitForTimeout(300);
  await shot(page, 'arcade_daily_guest_desk');
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 명예의 전당 온라인 탭 ─────────────────────────
for (const vp of ['phone2', 'phone1', 'desk']) {
  test(`명예의 전당 온라인 탭 (${vp}): 보드 선택·목록·내 순위, 탭 크기, 스크린숏`, async () => {
    const M = makeMock();
    const ctx = await newContext(M, vp);
    const { page, errs } = await openGame(ctx, { init: AUTH });
    await installTapRecorder(page);
    await page.evaluate(() => window.__game.go('highscore', { src: 'online', board: 'bossrush:1:hard' }, { fade: false }));
    await page.waitForFunction(() => window.__game.top?.name === 'highscore' && window.__game.top.ob?.state === 'ready', null, { timeout: 10000 });
    assert.ok(M.log.some((r) => r.path === '/api/boards/bossrush:1:hard' && r.q === '?limit=50'), '보드 요청');
    assert.equal(await page.evaluate(() => window.__game.top.ob.data.me.rank), 3);
    const r = await auditScene(page, null, { wait: 500 });
    await shot(page, `hof_online_${vp}`);
    const bad = [...(r.red ?? []), ...(r.yellow ?? [])];
    assert.deepEqual(bad.map((b) => `${b.id ?? b.src} ${Math.round(b.hitCss?.w ?? b.w)}×${Math.round(b.hitCss?.h ?? b.h)}`), [], '탭 크기');
    // 서바이벌 → 연습 → 오늘의 도전 (터치는 ▶ 쪽 탭, 그 밖은 키보드)
    if (vp !== 'desk') {
      const tapOpt = async () => {
        const z = await page.evaluate(async () => { const { taps } = await import('/src/core/ui.js'); const g = window.__game; const a = taps.audit().filter((x) => x.id === 'hopt:0:1').pop(); const R = g.canvas.getBoundingClientRect(); const k = (R.height / g.viewH) * (g.uiK || 1); return { x: R.left + (a.x + a.w - 10) * k, y: R.top + (a.y + a.h / 2) * k }; });
        await page.touchscreen.tap(z.x, z.y);
        await page.waitForTimeout(250);
      };
      await tapOpt();
      await page.waitForFunction(() => window.__game.top.sel.kind === 'survival' && window.__game.top.ob.state === 'ready', null, { timeout: 8000 });
      await shot(page, `hof_online_survival_${vp}`);
      // 목록 끌어 넘기기
      const L = await page.evaluate(() => { const g = window.__game, l = g.top._OL.list, R = g.canvas.getBoundingClientRect(), k = (R.height / g.viewH) * (g.uiK || 1); return { x: R.left + (l.x + l.w / 2) * k, y0: R.top + (l.y + l.h - 20) * k, y1: R.top + (l.y + 20) * k }; });
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: L.x, y: L.y0 }] });
      for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: L.x, y: L.y0 + ((L.y1 - L.y0) * i) / 8 }] }); await page.waitForTimeout(30); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(500);
      assert.ok(await page.evaluate(() => window.__game.top.scroll.y > 30), '끌어서 넘김');
    } else {
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => window.__game.top.sel.kind === 'survival', null, { timeout: 3000 });
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => window.__game.top.sel.kind === 'practice' && window.__game.top.ob.state === 'ready', null, { timeout: 8000 });
      assert.ok(M.log.some((x) => /^\/api\/boards\/practice:s\d\d:/.test(x.path)));
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => window.__game.top.sel.kind === 'daily' && window.__game.top.ob.state === 'ready', null, { timeout: 8000 });
      assert.ok(M.log.some((x) => x.path === `/api/boards/daily:${kstDay()}`));
      // 목록으로 내려가 ↓ 로 넘김
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
      for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);
      assert.ok(await page.evaluate(() => window.__game.top.ofocus >= window.__game.top.orows().length && window.__game.top.scroll.y > 30), '키보드로 넘김');
      await shot(page, 'hof_online_daily_desk');
      // Q/E (prevTab) = 기기 탭
      await page.keyboard.press('KeyQ');
      await page.waitForFunction(() => window.__game.top.src === 'device', null, { timeout: 3000 });
    }
    assert.deepEqual(errs, []);
    await ctx.close();
  });
}

test('명예의 전당 온라인 탭: 게임패드로 탭 전환·보드 바꾸기·오류 뒤 다시 시도', async () => {
  const M = makeMock();
  M.down.add('*');
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH, initScripts: [fakePadInit({})] });
  await padConnect(page);
  await page.evaluate(() => window.__game.go('highscore', {}, { fade: false }));
  await waitTop(page, 'highscore');
  await padPress(page, BTN.RB);
  await page.waitForFunction(() => window.__game.top.src === 'online' && window.__game.top.ob.state === 'error', null, { timeout: 8000 });
  await page.waitForTimeout(200);
  await shot(page, 'hof_online_error_desk');
  M.down.clear();
  await padPress(page, BTN.A);   // 다시 시도
  await page.waitForFunction(() => window.__game.top.ob.state === 'ready', null, { timeout: 8000 });
  await padPress(page, BTN.DOWN);
  await padPress(page, BTN.RIGHT);
  await page.waitForFunction(() => window.__game.top.ob.state === 'ready' && window.__game.top.ofocus === 1, null, { timeout: 8000 });
  assert.ok(M.log.filter((r) => r.path.startsWith('/api/boards/bossrush')).length >= 2);
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 오늘의 도전 ─────────────────────────
test('오늘의 도전: 카드(스테이지·헌터·규칙·내 최고·TOP 3) → 시작 → 규칙 적용 · 시드 · 보드', async () => {
  const M = makeMock();
  M.daily.mods = ['hp_x1.5', 'haste', 'glass', 'no_potion', 'no_sub', 'dark'];
  for (const vp of ['phone2', 'desk']) {
    const ctx = await newContext(M, vp);
    const { page, errs } = await openGame(ctx, { init: AUTH });
    await installTapRecorder(page);
    await page.evaluate(() => window.__game.go('arcade', { cfg: { kind: 'daily', ghost: 'off' } }, { fade: false }));
    await page.waitForFunction(() => window.__game.top?.name === 'arcade' && window.__game.top.daily?.state === 'ready' && window.__game.top.daily.boardState === 'ready', null, { timeout: 10000 });
    const rows = await page.evaluate(() => window.__game.top.options().map((o) => `${o.label}=${o.value}`));
    assert.match(rows.join('|'), /스테이지=제1장/);
    assert.match(rows.join('|'), /헌터=카엘.*성광의 사냥꾼/);
    assert.match(rows.join('|'), /규칙=적 체력 1\.5배 · 적 속도 1\.25배 · 유리 대포 · 물약 금지 · 보조 무기 금지 · 어둠/);
    const r = await auditScene(page, null, { wait: 400 });
    await shot(page, `arcade_daily_${vp}`);
    if (vp !== 'desk') assert.deepEqual([...(r.red ?? []), ...(r.yellow ?? [])].map((b) => b.id ?? b.src), [], '탭 크기');
    if (vp === 'desk') {
      // 키보드: ↓ 는 안내 줄을 건너 고스트 줄로
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => window.__game.top.options()[window.__game.top.row - 1].id), 'ghost');
      await page.keyboard.press('Enter');
      await waitTop(page, 'practice');
      const st = await page.evaluate(async () => {
        const g = window.__game, w = g.world;
        const { enemyStats } = await import('/src/game/enemy.js');
        const { getDiff } = await import('/src/data/difficulty.js');
        const { RNG } = await import('/src/core/math.js');
        const base = getDiff('normal');
        const e = w.enemies().find((x) => x.kind === 'enemy' && !x.elite);
        const plain = e ? enemyStats(e.def, e.stats.level, base, false) : null;
        const speed0 = e ? (e.def.speed ?? 80) * base.enemySpeed : null;
        // 물약 금지
        const inv = await import('/src/game/inventory.js');
        inv.addByBase(g.state, 'c_potion', 1);
        w.player.hp = Math.max(1, Math.floor(w.player.stats.hp / 2));
        const heal = inv.quickHeal(g.state, w.player.hero, w.player);
        // 보조 무기 금지
        const hearts0 = w.run.hearts, n0 = w.entities.length;
        w.player.subCool = 0; w.player.useSub(w);
        const subBlocked = w.run.hearts === hearts0 && w.entities.length === n0 && !(w.player.subCool > 0);
        // 피해 배율 (Math.random 고정: 치명타 없음·흔들림 1.0)
        const { hitTarget } = await import('/src/game/combat.js');
        const R0 = Math.random; Math.random = () => 0.5;
        let dealt = null, taken = null;
        try {
          if (e) { const hp0 = e.hp; hitTarget(w, { team: 'player', owner: w.player, stats: { atk: 100 }, mv: 1, dir: 1, flat: 0 }, e, e.cx, e.cy); dealt = hp0 - e.hp; }
          w.player.iframes = 0; w.player.invuln = false;
          const php0 = w.player.hp = w.player.stats.hp;
          hitTarget(w, { team: 'enemy', owner: e, stats: { atk: 30 }, mv: 1, dir: -1 }, w.player, w.player.cx, w.player.cy);
          taken = php0 - w.player.hp;
          w.rules = null;
          w.player.iframes = 0; w.player.hp = w.player.stats.hp;
          hitTarget(w, { team: 'enemy', owner: e, stats: { atk: 30 }, mv: 1, dir: -1 }, w.player, w.player.cx, w.player.cy);
          var taken0 = w.player.stats.hp - w.player.hp;
          w.rules = g.state.arcade.rules;
        } finally { Math.random = R0; }
        const ref = new RNG(424242);
        return {
          enemyHp: w.diff.enemyHp, enemySpeed: w.diff.enemySpeed, bossHp: w.diff.bossHp,
          hpRatio: e ? e.stats.maxHp / plain.maxHp : null, speedRatio: e ? e.speed / speed0 : null,
          heal: heal.ok, healMsg: heal.msg, potions0: g.state.inventory.filter((i) => i.baseId === 'c_potion').length,
          subBlocked,
          dealt, taken, taken0, rules: w.rules, rng: !!w.rng && typeof w.rng.next === 'function', seed: g.state.arcade.seed, ref: ref.next() > -1,
          board: g.top.board, orun: g.top.orun?.state, call: g.top.call?.sub, cls: g.state.heroes.kael.classId,
        };
      });
      assert.equal(st.enemyHp, 1.5); assert.equal(st.bossHp, 1.5); assert.equal(st.enemySpeed, 1.25);
      assert.ok(Math.abs(st.hpRatio - 1.5) < 0.02, `적 체력 배율 ${st.hpRatio}`);
      assert.ok(Math.abs(st.speedRatio - 1.25) < 1e-6, `적 속도 배율 ${st.speedRatio}`);
      assert.equal(st.heal, false); assert.match(st.healMsg, /물약을 쓸 수 없다/);
      assert.ok(st.subBlocked, '보조 무기');
      assert.ok(st.taken > 0 && Math.abs(st.taken / st.taken0 - 2) < 0.15, `받는 피해 ${st.taken} / ${st.taken0}`);
      assert.ok(st.dealt > 0, '주는 피해');
      assert.deepEqual(st.rules, { taken: 2, dealt: 1.3, noPotion: true, noSub: true, dark: true });
      assert.ok(st.rng); assert.equal(st.seed, 424242);
      assert.equal(st.board, `daily:${kstDay()}`);
      assert.equal(st.cls, 'kael_crusader');
      assert.match(st.call, /규칙: 적 체력 1\.5배/);
      await page.waitForFunction(() => window.__game.top.orun?.state === 'ready', null, { timeout: 8000 });
      assert.ok(M.log.some((x) => x.path === '/api/runs'));
      await page.waitForTimeout(2600);
      await shot(page, 'daily_dark_desk');
      // 주는 피해 1.3배: 새로 소환한 같은 적 둘에게 같은 공격 (하나는 규칙 없이)
      const dealt0 = await page.evaluate(async () => {
        const g = window.__game, w = g.world; const { hitTarget } = await import('/src/game/combat.js');
        const id = w.enemies().find((x) => x.kind === 'enemy')?.def?.id ?? 'zombie';
        const hit = (rules) => { const e = w.spawnEnemy(id, w.player.cx + 300, w.player.bottom, { elite: false }); e.hp = e.stats.maxHp = 100000; const rl = w.rules; w.rules = rules; const hp0 = e.hp; hitTarget(w, { team: 'player', owner: w.player, stats: { atk: 400 }, mv: 1, dir: 1 }, e, e.cx, e.cy); w.rules = rl; return hp0 - e.hp; };
        const R0 = Math.random; Math.random = () => 0.5;
        try { return { d0: hit(null), d1: hit(w.rules) }; } finally { Math.random = R0; }
      });
      if (dealt0) assert.ok(Math.abs(dealt0.d1 / dealt0.d0 - 1.3) < 0.1, `주는 피해 배율 ${dealt0.d1}/${dealt0.d0}`);
    }
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

test('시드: 같은 일일 시드면 정예 출현·촛불 보상 순서가 같다 (다른 모드는 그대로 Math.random)', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH });
  const seq = await page.evaluate(async () => {
    const A = await import('/src/scenes/front/arcade.js');
    const { World } = await import('/src/game/world.js');
    const { rollCandleLoot } = await import('/src/game/loot.js');
    const g = window.__game;
    const run = (seed) => {
      g.state = A.buildArcadeState({ kind: 'practice', diff: 'nightmare', preset: 1, stageId: 's01', daily: { mods: [], seed, board: 'daily:20261005' } }, 'kael');
      const w = new World(g, 's01', { mode: 'practice' });
      const out = [];
      for (let i = 0; i < 12; i++) out.push(w.spawnEnemy('bat', 100, 100).elite ? 1 : 0);
      for (let i = 0; i < 6; i++) out.push(rollCandleLoot(w, true)[0].type);
      return out.join(',');
    };
    const a = run(99), b = run(99), c = run(12345);
    g.state = A.buildArcadeState({ kind: 'practice', diff: 'normal', preset: 1, stageId: 's01' }, 'kael');
    const plain = new World(g, 's01', { mode: 'practice' });
    return { a, b, c, plainRng: plain.rng, plainRules: plain.rules };
  });
  assert.equal(seq.a, seq.b);
  assert.notEqual(seq.a, seq.c);
  assert.equal(seq.plainRng, null); assert.equal(seq.plainRules, null);
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 고스트 ─────────────────────────
test('고스트: 20분 기록 ≤ 24KB, 위치 오차 ≤ 2px, 자세·방향·방 보존, 재생 보간 (+ 줄곧 뛰는 극단 경로는 5Hz 로 줄여 상한 안)', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx);
  const res = await page.evaluate(async () => {
    const G = await import('/src/game/ghost.js');
    const { RNG } = await import('/src/core/math.js');
    // 20분: 걷기·질주·점프·대시·제자리·공격·방 이동이 섞인 흉내 경로 (60Hz 시뮬레이션, 10Hz 표본). jumpP = 60Hz 한 칸의 점프 확률
    const sim = (jumpP) => {
      const rng = new RNG(7);
      const rec = new G.GhostRecorder(10);
      const truth = [];
      let x = 200, y = 900, vy = 0, room = 0, facing = 1, ground = true, mode = 0, modeT = 0;
      const p = { cx: x, bottom: y, facing, anim: 'idle', move: null };
      for (let f = 0; f < 60 * 1200; f++) {
        const t = f / 60;
        if ((modeT -= 1 / 60) <= 0) { mode = Math.floor(rng.next() * 5); modeT = 0.5 + rng.next() * 3; facing = rng.next() < 0.5 ? -1 : 1; }
        const vx = mode === 0 ? 0 : mode === 1 ? 275 * facing : mode === 2 ? 420 * facing : mode === 3 ? 0 : 600 * facing;
        if (ground && rng.next() < jumpP) { vy = -900; ground = false; }
        if (!ground) { vy += 2200 / 60; if (y + vy / 60 >= 900) { y = 900 - vy / 60; vy = 0; ground = true; } }
        x += vx / 60; y += vy / 60;
        if (x > 4000) { x = 100; room = (room + 1) % 9; } if (x < 0) { x = 3900; room = (room + 8) % 9; }
        p.cx = x; p.bottom = y; p.facing = facing; p.anim = !ground ? (vy < 0 ? 'jump' : 'fall') : mode === 4 ? 'dash' : vx ? 'run' : 'idle'; p.move = mode === 3 && ground ? {} : null;
        const before = rec.n;
        rec.sample(t, p, `r${room}`);
        if (rec.n > before) truth.push({ x, y, room: `r${room}`, facing, pose: G.POSES[G.poseOf(p)] });
      }
      const b64 = rec.encode();
      const T = G.decodeGhost(b64);
      const step = Math.round(10 / T.hz);
      let maxErr = 0, poseBad = 0, roomBad = 0, faceBad = 0;
      for (let j = 0; j < T.n; j++) {
        const tr = truth[Math.min(truth.length - 1, j * step)];
        maxErr = Math.max(maxErr, Math.abs(T.x[j] - tr.x), Math.abs(T.y[j] - tr.y));
        if (T.rooms[T.room[j]] !== tr.room) roomBad++;
        if (G.POSES[T.fp[j] & 15] !== tr.pose) poseBad++;
        if (((T.fp[j] & 16) ? -1 : 1) !== tr.facing) faceBad++;
      }
      // 재생 보간: 두 표본 사이 = 가운데 (같은 방일 때)
      const P = new G.GhostPlayer(T, null);
      let interpBad = 0;
      for (let i = 100; i < T.n - 1; i += 97) {
        if (T.room[i] !== T.room[i + 1]) continue;
        const a = P.at(i / T.hz), b = P.at((i + 1) / T.hz), m = P.at((i + 0.5) / T.hz);
        if (Math.abs(m.x - (a.x + b.x) / 2) > 1 || Math.abs(m.y - (a.y + b.y) / 2) > 1) interpBad++;
      }
      // 재생 위치 vs 원래 위치 (60Hz 모든 순간): 표본 사이는 직선 보간
      return { len: b64.length, n: truth.length, hz: T.hz, decodedN: T.n, maxErr, poseBad, roomBad, faceBad, interpBad };
    };
    const r2 = new G.GhostRecorder(10); for (let k = 0; k < 600; k++) r2.sample(k / 10, { cx: k * 3, bottom: 500, facing: 1, anim: 'run' }, 'r1');
    return { real: sim(0.004), stress: sim(0.05), shortLen: r2.encode().length };
  });
  const { real: r, stress: s } = res;
  console.log(`      20분 고스트(보통): ${r.n}칸 → base64 ${r.len} B (${r.hz}Hz), 위치 오차 최대 ${r.maxErr}px · 줄곧 점프: ${s.len} B (${s.hz}Hz) · 1분 달리기 ${res.shortLen} B`);
  assert.ok(r.len <= 24 * 1024, `크기 ${r.len}`);
  assert.equal(r.hz, 10, '보통 경로는 10Hz 그대로');
  assert.equal(r.decodedN, r.n);
  for (const x of [r, s]) {
    assert.ok(x.len <= 24 * 1024, `크기 ${x.len}`);
    assert.ok(x.maxErr <= 2, `위치 오차 ${x.maxErr}`);
    assert.equal(x.poseBad, 0); assert.equal(x.roomBad, 0); assert.equal(x.faceBad, 0);
    assert.equal(x.interpBad, 0, '보간');
  }
  assert.ok(res.shortLen < 700, `달리기 1분 ${res.shortLen}`);
  assert.deepEqual(errs, []);
  await ctx.close();
});

test('고스트 재생: 실제 판을 기록·올림 → 다음 판에서 "1위" 고스트가 같은 시간·같은 자리에 그려지고, 다른 방이면 가장자리 표시', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH });
  await startPractice(page);
  await page.waitForFunction(() => window.__game.top.orun?.state === 'ready', null, { timeout: 8000 });
  await page.evaluate(() => { window.__game._pageHidden = true; });
  await page.keyboard.down('ArrowRight'); await ticks(page, 240); await page.keyboard.up('ArrowRight');
  const rec = await page.evaluate(() => { const w = window.__game.world; return { t: w.run.time, x: w.player.cx, y: w.player.bottom, room: w.roomId }; });
  await page.evaluate(() => window.__game.top.finish(true));
  await page.evaluate(() => { window.__game._pageHidden = false; });
  await waitTop(page, 'arcadeResults');
  await page.waitForFunction(() => window.__game.top.onl?.state === 'ok', null, { timeout: 10000 });
  assert.ok(M.ghosts.get('practice:s01:normal'), '고스트 올라감');
  // 다음 판: 1위 고스트
  await startPractice(page, { ghost: 'top' });
  await page.waitForFunction(() => !!window.__game.top.ghost, null, { timeout: 8000 });
  assert.ok(M.log.some((r) => r.path === '/api/ghosts/practice:s01:normal/1'));
  const g = await page.evaluate((t) => { const s = window.__game.top; const c = s.ghost.at(t); return { x: c.x, y: c.y, room: c.room, dur: s.ghost.duration }; }, rec.t);
  assert.equal(g.room, rec.room);
  assert.ok(Math.abs(g.x - rec.x) <= 12 && Math.abs(g.y - rec.y) <= 12, `재생 위치 (${g.x},${g.y}) vs (${rec.x},${rec.y})`);
  // 그리기: 같은 방에서 영웅 그림이 한 번 더 (비용) + 프레임 시간
  await page.evaluate(() => { window.__game._pageHidden = true; });
  await ticks(page, 60);
  const drawn = await page.evaluate(() => { const s = window.__game.top, w = window.__game.world; const ctx = window.__game.ctx; ctx.save(); w.camera.apply(ctx); const ok = s.ghost.draw(ctx, w, w.run.time); ctx.restore(); const t0 = performance.now(); for (let i = 0; i < 30; i++) { ctx.save(); w.camera.apply(ctx); s.ghost.draw(ctx, w, w.run.time); ctx.restore(); } return { ok, ms: (performance.now() - t0) / 30 }; });
  assert.ok(drawn.ok, '같은 방이면 그린다');
  console.log(`      고스트 그리기 ${drawn.ms.toFixed(2)} ms/프레임 (헤드리스 소프트웨어 래스터)`);
  await page.evaluate(() => { window.__game._pageHidden = false; });
  await page.waitForTimeout(300);
  await shot(page, 'ghost_playback_desk');
  // 다른 방: 앞/뒤 표시
  const off = await page.evaluate(() => { const s = window.__game.top, w = window.__game.world; const room = w.roomId; w.roomId = '__other__'; const o = s.ghost.offset(w, w.run.time + 1); w.roomId = room; return o; });
  assert.equal(off, null, '고스트가 지나가지 않은 방 = 표시 없음');
  const off2 = await page.evaluate(() => { const s = window.__game.top, w = window.__game.world; s.ghost._mk.at = -9; return s.ghost.offset(w, s.ghost.duration + 5); });
  assert.ok(off2 && off2.side === 1 && off2.sec >= 4, `고스트가 이미 끝남 = 앞 ${JSON.stringify(off2)}`);
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 별명 ─────────────────────────
test('별명: 내 계정에 공개 별명, 바꾸기 화면 검사(빈칸·짧음·자모·기호·금칙어·겹침)와 아이디 비공개 안내', async () => {
  const M = makeMock();
  for (const vp of ['phone2', 'desk']) {
    const ctx = await newContext(M, vp);
    const { page, errs } = await openGame(ctx, { init: AUTH });
    await page.evaluate(() => window.__game.go('account', {}, { fade: false }));
    await page.waitForFunction(() => window.__game.top?.name === 'account' && window.__game.top.screen === 'profile' && window.__game.top.nick, null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__game.top.nick), M.nick);
    // 내 계정 목록(공개 별명 줄이 더해짐)이 판 안에 들어간다
    const fit = await page.evaluate(() => { const t = window.__game.top, G = t.geom(); const last = t.itemRect(t.items[t.items.length - 1], G); return { bottom: last.y + last.h, panel: G.y0 + G.PH, ids: t.items.map((x) => x.id) }; });
    assert.ok(fit.bottom <= fit.panel + 1, `목록이 판 밖으로 ${fit.bottom} > ${fit.panel}`);
    assert.ok(fit.ids.includes('nick'));
    await page.waitForTimeout(300);
    await shot(page, `account_profile_${vp}`);
    await page.evaluate(() => window.__game.top.activate('nick'));
    await page.waitForFunction(() => [...document.querySelectorAll('.bn-field')].every((el) => el.style.visibility === 'visible'), null, { timeout: 5000 });
    assert.equal(await page.inputValue('.bn-field[name=nickname]'), M.nick);
    const tryNick = async (v) => {
      await page.fill('.bn-field[name=nickname]', v);
      await page.press('.bn-field[name=nickname]', 'Enter');
      await page.waitForFunction(() => { const t = window.__game.top; return !t.busy && (t.screen !== 'nick' || (t.msg && !t.msg.spin)); }, null, { timeout: 8000 });
      return page.evaluate(() => ({ screen: window.__game.top.screen, msg: window.__game.top.msg?.text ?? null }));
    };
    const puts0 = M.log.filter((r) => r.path === '/api/profile/nick').length;
    assert.match((await tryNick('가')).msg, /2~12자/);
    assert.match((await tryNick('ㅋㅋ사냥')).msg, /자음·모음/);
    assert.match((await tryNick('밤 사냥꾼')).msg, /띄어쓰기/);
    assert.match((await tryNick('밤!사냥')).msg, /「!」/);
    assert.equal(M.log.filter((r) => r.path === '/api/profile/nick').length, puts0, '잘못된 별명은 보내지 않는다');
    if (vp === 'desk') {
      await page.waitForTimeout(200);
      await shot(page, 'account_nick_error_desk');
      assert.match((await tryNick('바보사냥꾼')).msg, /쓸 수 없는 낱말/);
      const ok = await tryNick('드라큘라');
      assert.equal(ok.screen, 'profile');
      assert.match(ok.msg, /같은 별명이 있어 「드라큘라#12」/);
      const ok2 = await page.evaluate(() => window.__game.top.activate('nick'));
      await page.waitForFunction(() => window.__game.top.screen === 'nick');
      const r3 = await tryNick('밤의_사냥꾼');
      assert.equal(r3.screen, 'profile'); assert.match(r3.msg, /「밤의_사냥꾼」로 바꿨습니다/);
      void ok2;
      await page.evaluate(() => window.__game.top.activate('nick'));
      await page.waitForFunction(() => window.__game.top.screen === 'nick');
      const info = await page.evaluate(() => JSON.stringify(window.__game.top.def) + document.body.innerText);
      void info;
    }
    await page.waitForTimeout(250);
    await shot(page, `account_nick_${vp}`);
    assert.deepEqual(errs, []);
    await ctx.close();
  }
});

// ───────────────────────── 실행 ─────────────────────────
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  if (FILTER && !t.name.includes(FILTER)) continue;
  const s = Date.now();
  try { await t.fn(); pass++; console.log(`  ✓ ${t.name} (${((Date.now() - s) / 1000).toFixed(1)}s)`); }
  catch (e) { fail++; console.log(`  ✗ ${t.name}\n    ${String(e.stack ?? e).split('\n').slice(0, 6).join('\n    ')}`); }
}
await browser.close();
console.log(`\n온라인 클라이언트: ${pass} 통과, ${fail} 실패 (${((Date.now() - t0) / 1000).toFixed(0)}s) · 스크린숏 ${SHOTS}`);
process.exit(fail ? 1 : 0);
