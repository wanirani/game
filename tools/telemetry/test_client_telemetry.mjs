// 익명 통계 클라이언트 탐침 (헤드리스 Chromium, tools/qa/lib/server.mjs): node tools/telemetry/test_client_telemetry.mjs [--filter=문자열]
//  - /api/** 는 실제 핸들러(netlify/functions/api.mts) + 메모리 저장소로 처리하고, 보낸 묶음을 서버 검사(checkBatch)로 다시 확인한다
//  - 개발 서버(localhost) + ?telemetry=1: session_start · 타이틀 안내 카드 · 오류(창·잡힌 오류·거부된 약속, 프레임은 file:line:col 만) ·
//    스테이지/사망(낙사·적·함정)/보스/클리어/아케이드 사건 모양 · 설정 끄기(보내기 멈춤, 기록·설치 id 지움)와 옵션 줄로 다시 켜기
//  - GPC(navigator.globalPrivacyControl) 면 기본 끔 → 아무것도 보내지 않음
//  - 공식 사이트 흉내(https://game.test, 운영 CSP): navigator.webdriver 이고 ?telemetry=1 이 없으면 아무것도 걸지 않음 /
//    webdriver 가 아니면 보냄 (숨을 때 sendBeacon text/plain, CSP 위반 0)
//  - 안드로이드 앱 흉내(https://appassets.androidplatform.net + window.__BN_APP): 프록시가 있으면 sendBeacon 대신 감싼 fetch 로만,
//    프록시 없는 옛 앱은 끔
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openEnv, ROOT } from '../qa/lib/server.mjs';
import { createMemoryBackend } from '../accounts/mem_store.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const FILTER = typeof args.filter === 'string' ? args.filter : null;

globalThis.Netlify = { context: null, env: { get: () => undefined, set() {}, has: () => false, delete() {}, toObject: () => ({}) } };
const api = (await import(path.join(ROOT, 'netlify/functions/api.mts'))).default;
const rt = await import(path.join(ROOT, 'netlify/lib/runtime.mts'));
const tel = await import(path.join(ROOT, 'netlify/lib/telemetry.mts'));
const backend = createMemoryBackend();
rt.setStoreFactory((name, dc) => backend.factory(name, dc));
const origWarn = console.warn;
console.warn = (...a) => { if (!String(a[0]).includes('AUTH_PEPPER')) origWarn(...a); };

const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
const CSP = /Content-Security-Policy = "([^"]+)"/.exec(toml)[1];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };
const VP = { viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' };
const env = await openEnv();

/**
 * 문맥의 요청 가로채기: /api/** → 실제 핸들러 (log 에 {path, method, ctype, body, status}).
 * host 를 주면 그 호스트의 나머지 요청은 디스크 파일로 답한다 (html 에는 운영 CSP; 앱 흉내는 CSP 없음 — AssetServer 처럼)
 */
async function hook(ctx, log, host = null) {
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.pathname.startsWith('/api/')) {
      const headers = await req.allHeaders();
      const body = req.postDataBuffer();
      const entry = { host: u.host, path: u.pathname, method: req.method(), ctype: headers['content-type'] ?? '', body: body ? body.toString('utf8') : '' };
      const r = new Request(`https://game.test${u.pathname}${u.search}`, { method: req.method(), headers, body: body && body.length ? body : undefined });
      const res = await api(r, { ip: '198.51.100.30', deploy: { context: 'production' } });
      entry.status = res.status;
      log.push(entry);
      return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    }
    if (!host || u.host !== host) return route.continue();
    const file = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    const ext = path.extname(file);
    const h = { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' };
    if (ext === '.html' && host !== 'appassets.androidplatform.net') h['content-security-policy'] = CSP;
    return route.fulfill({ status: 200, headers: h, body: fs.readFileSync(file) });
  });
}
const posts = (log) => log.filter((r) => r.path === '/api/t');
/** 보낸 묶음들 → 서버 검사를 통과해야 한다 → 사건 목록 */
function eventsOf(log) {
  const out = [];
  for (const r of posts(log)) {
    assert.equal(r.status, 204, `서버가 거절: ${r.status} ${r.body.slice(0, 300)}`);
    const b = tel.checkBatch(JSON.parse(r.body));
    assert.match(b.id, /^[A-Za-z0-9_-]{22}$/);
    out.push(...b.ev.map((e) => ({ ...e, _id: b.id, _sid: b.sid })));
  }
  return out;
}
const T = (s) => s.page.evaluate(() => { const t = window.__game?.telemetry; return t ? { active: t.active, forced: t.forced, why: t.why, on: t.on(), q: t.q.map((e) => e.t), id: t.id } : null; });
/** 줄이 빌 때까지 보낸다 */
async function drain(s) {
  for (let i = 0; i < 10; i++) {
    const n = await s.page.evaluate(async () => { const t = window.__game.telemetry; await t.flush('manual'); return t.q.length; });
    if (!n) return;
  }
  throw new Error('줄이 비지 않음');
}
const waitQ = (s, type, timeout = 8000) => s.waitGame(`g.telemetry && g.telemetry.q.some((e) => e.t === ${JSON.stringify(type)})`, timeout);
const bus = (s, evt, data) => s.page.evaluate(async ([evt, data]) => { const m = await import('/src/core/events.js'); m.bus.emit(evt, data); await new Promise((r) => setTimeout(r, 0)); }, [evt, data]);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('?telemetry=1 (localhost): session_start · 타이틀 안내 카드 · 서버 검사 통과', async () => {
  const log = [];
  const s = await env.page(VP, null);
  await hook(s.ctx, log);
  await s.goto('index.html?telemetry=1');
  const st = await T(s);
  assert.equal(st.active, true); assert.equal(st.forced, true);
  await waitQ(s, 'session_start');
  await s.waitGame('g.top?.name === "title" && (g.top.notes || []).some((c) => c.id === "telemetry")', 8000);
  await drain(s);
  const ev = eventsOf(log);
  const ss = ev.find((e) => e.t === 'session_start');
  assert.ok(ss, JSON.stringify(ev));
  assert.equal(ss.plat, 'web'); assert.equal(ss.os, 'linux'); assert.equal(ss.br, 'chrome'); assert.equal(ss.vp, '1200x700');
  assert.equal(ss.b, 'dev'); assert.ok(['low', 'medium', 'high'].includes(ss.tier)); assert.equal(ss.input, 'kb');
  assert.equal(posts(log)[0].ctype, 'application/json');
  const raw = backend.keys('site', 'bn-telemetry').filter((k) => k.includes('/raw/'));
  assert.ok(raw.length >= 1);
  // 안내 카드 ✕ → meta.tips.telemetry, 카드 사라짐
  await s.page.evaluate(() => window.__game.telemetry.dismissNotice());
  await s.waitGame('!(g.top.notes || []).some((c) => c.id === "telemetry")', 4000);
  assert.equal(await s.page.evaluate(() => JSON.parse(localStorage.getItem('bloodnocturne_meta')).tips.telemetry), true);
  await s.close();
});

test('오류: 창 오류 · 잡힌 오류(그리기) · 거부된 약속 → 주소·쿼리를 뗀 file:line:col 프레임 ≤ 5', async () => {
  const log = [];
  const s = await env.page(VP, null);
  await hook(s.ctx, log);
  await s.goto('index.html?telemetry=1');
  await waitQ(s, 'session_start');
  await s.page.evaluate(() => {
    const g = window.__game, sc = g.top;
    // 그리기 오류: game.js 가 잡아 console.error + __bnReportError('render') (한 프레임만)
    const r = sc.render; sc.render = null; setTimeout(() => { sc.render = r; }, 120);
    // 창 오류: 장면 update 에서 던진다 (rAF 콜백 밖으로 나가 window 'error')
    const u = sc.update; sc.update = function (dt) { sc.update = u; throw new Error('qa boom at https://evil.example/path/x.js?token=abc'); };
    Promise.reject(new Error('qa reject http://127.0.0.1:9/p?q=1'));
  });
  await s.waitGame('g.telemetry.q.filter((e) => e.t === "error").length >= 3', 8000);
  await drain(s);
  const errs = eventsOf(log).filter((e) => e.t === 'error');
  const kinds = new Set(errs.map((e) => e.kind));
  assert.ok(kinds.has('error') && kinds.has('caught') && kinds.has('rejection'), JSON.stringify(errs));
  for (const e of errs) {
    assert.ok(!/https?:|evil\.example|127\.0\.0\.1|localhost|token=|\?q=/.test(JSON.stringify(e)), JSON.stringify(e));
    assert.ok(e.fr.length <= 5);
    for (const f of e.fr) assert.match(f, /^[^:?#]+:\d+:\d+$/);
  }
  const boom = errs.find((e) => e.kind === 'error');
  assert.equal(boom.msg, 'qa boom at /path/x.js'); assert.equal(boom.scene, 'title');
  assert.ok(boom.fr.some((f) => f.startsWith('src/core/game.js:')), JSON.stringify(boom.fr));
  const caught = errs.find((e) => e.kind === 'caught');
  assert.equal(caught.where, 'render'); assert.ok(caught.fr[0].startsWith('src/core/game.js:'), JSON.stringify(caught.fr));
  assert.equal(errs.find((e) => e.kind === 'rejection').msg, 'qa reject /p');
  // 같은 오류는 실행마다 3번까지
  await s.page.evaluate(() => { for (let i = 0; i < 6; i++) window.__bnReportError(new Error('same'), 'x'); });
  assert.equal(await s.page.evaluate(() => window.__game.telemetry.q.filter((e) => e.t === 'error' && e.msg === 'same').length), 3);
  await s.close();
});

test('스테이지·사망·보스·클리어·아케이드 사건 모양', async () => {
  const log = [];
  const s = await env.page(VP, null);
  await hook(s.ctx, log);
  await s.goto('index.html?telemetry=1&scene=stage&stage=s01');
  await waitQ(s, 'stage_start');
  await s.skipDialogue();
  // 성능: 게임 중 1초 표본 60개 → perf 하나 (타이머 대신 직접 60번)
  await s.page.evaluate(() => { const t = window.__game.telemetry; t.fps.length = 0; for (let i = 0; i < 60; i++) t.perfTick(); });
  // 낙사 (실제 경로: world.onPlayerFell → die(this, 'fall')), 적의 공격, 주인 없는 공격(함정)
  await s.page.evaluate(() => {
    const w = window.__game.world, p = w.player;
    p.hp = 1; w.onPlayerFell(p);
    p.die(w, { team: 'enemy', owner: { kind: 'enemy', def: { id: 'skeleton' }, cx: p.cx } });
    p.die(w, { team: 'enemy', dir: 1, flat: 1 });
  });
  await bus(s, 'bossStarted', { bossId: 'b_nightwing', stageId: 's01', time: 100 });
  await bus(s, 'playerDied', { cause: null }); // 보스전 중 사망 → 보스 패배 (world.bossActive 가 아니면 원인 unknown)
  await bus(s, 'bossKilled', { bossId: 'b_nightwing', stageId: 's01', time: 162.5 });
  await bus(s, 'stageCleared', { stageId: 's01', rank: 'A', time: 170.25, score: 12345 });
  await bus(s, 'arcadeFinished', { kind: 'survival', cleared: false, reason: null, score: 98765, time: 321.5, extra: { wave: 14, hard: true }, charId: 'lia', diff: 'hard', stageId: 'arena' });
  await drain(s);
  const ev = eventsOf(log);
  const ss = ev.find((e) => e.t === 'stage_start');
  assert.deepEqual({ ...ss, s: 0, _id: 0, _sid: 0 }, { t: 'stage_start', s: 0, stage: 's01', mode: 'story', hero: 'kael', cls: ss.cls, lv: ss.lv, diff: 'normal', in: 'kb', _id: 0, _sid: 0 });
  const deaths = ev.filter((e) => e.t === 'death');
  assert.deepEqual(deaths.map((d) => d.cause), ['fall', 'enemy:skeleton', 'hazard', 'unknown']);
  for (const d of deaths) {
    assert.equal(d.stage, 's01'); assert.equal(d.mode, 'story'); assert.equal(d.hero, 'kael'); assert.equal(d.diff, 'normal');
    assert.ok(Number.isInteger(d.x) && Number.isInteger(d.y) && d.lv >= 1 && d.time >= 0 && typeof d.room === 'string', JSON.stringify(d));
  }
  const boss = ev.filter((e) => e.t === 'boss_result');
  assert.equal(boss.length, 1, '보스전 밖의 사망은 보스 패배가 아니다 (world.bossActive 아님)');
  assert.deepEqual([boss[0].boss, boss[0].win, boss[0].dur, boss[0].mode], ['b_nightwing', true, 62.5, 'story']);
  const clear = ev.find((e) => e.t === 'stage_clear');
  assert.deepEqual([clear.stage, clear.rank, clear.time, clear.deaths, clear.mode], ['s01', 'A', 170.3, 4, 'story']);
  const perf = ev.find((e) => e.t === 'perf');
  assert.ok(perf && perf.dur === 60 && perf.fps > 0 && perf.p5 > 0 && perf.p5 <= perf.fps && ['low', 'medium', 'high'].includes(perf.tier) && perf.scene === 'stage', JSON.stringify(perf));
  assert.ok(perf.heap > 0, 'js 힙 MB (Chromium performance.memory)');
  const ar = ev.find((e) => e.t === 'arcade_result');
  assert.deepEqual([ar.mode, ar.score, ar.wave, ar.time, ar.cleared, ar.hero, ar.diff], ['survival', 98765, 14, 321.5, false, 'lia', 'hard']);
  assert.equal(new Set(ev.map((e) => e._id)).size, 1, '설치 id 하나');
  await s.close();
});

test('설정 끄기: 보내지 않고 기록·설치 id 를 지움 → 옵션 줄로 다시 켜면 새 id', async () => {
  const log = [];
  const s = await env.page(VP, null);
  await hook(s.ctx, log);
  await s.goto('index.html?telemetry=1');
  await waitQ(s, 'session_start');
  await drain(s);
  const id1 = eventsOf(log)[0]._id;
  assert.equal(await s.page.evaluate(() => localStorage.getItem('bn_tid')), id1);
  await s.page.evaluate(() => window.__game.push('options', { page: 'etc' }));
  await s.waitGame('g.top?.name === "options"', 5000);
  const row = await s.page.evaluate(() => { const r = window.__game.top.rows(4).find((x) => x.id === 'telemetry'); return r ? { label: r.label, type: r.type } : null; });
  assert.deepEqual(row, { label: '익명 통계·오류 보내기', type: 'bool' });
  await s.page.evaluate(() => { const o = window.__game.top; o.change(o.rows(4).find((x) => x.id === 'telemetry'), 1); });
  assert.equal(await s.page.evaluate(() => window.__game.settings.telemetry), false);
  await s.waitGame('!g.telemetry.on() && !localStorage.getItem("bn_tid") && !g.telemetry.q.length', 5000);
  const n0 = posts(log).length;
  await s.page.evaluate(() => { window.__bnReportError(new Error('while off'), 'x'); window.__game.telemetry.track('perf', { fps: 60, p5: 50, tier: 'high', dur: 60 }); });
  await bus(s, 'arcadeFinished', { kind: 'survival', cleared: false, score: 1, time: 1, charId: 'kael' });
  assert.equal(await s.page.evaluate(() => window.__game.telemetry.flush('manual')), false);
  await s.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await s.wait(1500);
  assert.equal(posts(log).length, n0, '끈 뒤에는 요청 0');
  assert.equal(await s.page.evaluate(() => window.__game.telemetry.q.length), 0);
  // 다시 켜기 (옵션 줄) → 새 세션 알림 · 새 설치 id
  await s.page.evaluate(() => { const o = window.__game.top; o.change(o.rows(4).find((x) => x.id === 'telemetry'), 1); });
  await waitQ(s, 'session_start');
  await drain(s);
  const ids = new Set(eventsOf(log).map((e) => e._id));
  assert.equal(ids.size, 2, '다시 켜면 새 익명 번호');
  await s.page.evaluate(() => window.__game.pop()); // 설정을 닫으면 저장
  await s.waitGame('g.top?.name === "title"', 5000);
  assert.equal(await s.page.evaluate(() => JSON.parse(localStorage.getItem('bloodnocturne_settings')).telemetry), true);
  await s.close();
});

test('GPC: navigator.globalPrivacyControl 이면 기본 끔 (아무것도 보내지 않고 안내 카드도 없음)', async () => {
  const log = [];
  const s = await env.page(VP, null, { initScripts: [() => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true, configurable: true }); }] });
  await hook(s.ctx, log);
  await s.goto('index.html?telemetry=1');
  assert.equal(await s.page.evaluate(() => window.__game.settings.telemetry), false);
  const st = await T(s);
  assert.equal(st.active, true); assert.equal(st.on, false);
  await s.wait(2500);
  assert.equal(await s.page.evaluate(() => window.__game.telemetry.flush('manual')), false);
  assert.equal(posts(log).length, 0);
  assert.equal(await s.page.evaluate(() => (window.__game.top.notes || []).some((c) => c.id === 'telemetry')), false);
  assert.equal(await s.page.evaluate(() => localStorage.getItem('bn_tid')), null);
  await s.close();
});

test('자동화: navigator.webdriver 이고 ?telemetry=1 이 없으면 (공식 사이트 흉내) 아무것도 걸지 않음 · localhost 도 끔', async () => {
  const log = [];
  const s = await env.page(VP, null);
  await hook(s.ctx, log, 'game.test');
  await s.page.goto('https://game.test/index.html');
  await s.waitGame();
  assert.equal(await s.page.evaluate(() => navigator.webdriver), true);
  const st = await T(s);
  assert.deepEqual([st.active, st.why], [false, 'webdriver']);
  assert.equal(await s.page.evaluate(() => typeof window.__bnReportError), 'undefined');
  await s.page.evaluate(() => { setTimeout(() => { throw new Error('qa uncaught under webdriver'); }, 0); });
  await s.wait(2500);
  assert.equal(await s.page.evaluate(() => window.__game.telemetry.flush('manual')), false);
  await s.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await s.wait(300);
  assert.equal(log.length, 0, `요청 0: ${JSON.stringify(log)}`);
  await s.close();
  // 개발 서버(localhost, http): 강제 없이는 끔
  const s2 = await env.page(VP, 'index.html');
  const st2 = await T(s2);
  assert.equal(st2.active, false);
  await s2.close();
});

test('공식 사이트 흉내 + webdriver 아님: 보냄, 숨을 때 sendBeacon(text/plain), 운영 CSP 위반 0', async () => {
  const log = [];
  const s = await env.page(VP, null, { initScripts: [() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  }] });
  await hook(s.ctx, log, 'game.test');
  await s.page.goto('https://game.test/index.html');
  await s.waitGame();
  const st = await T(s);
  assert.deepEqual([st.active, st.forced, st.why], [true, false, 'ok']);
  await waitQ(s, 'session_start');
  await s.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  for (let i = 0; i < 40 && !posts(log).length; i++) await s.wait(100);
  assert.equal(posts(log).length, 1);
  assert.match(posts(log)[0].ctype, /^text\/plain/);
  assert.ok(eventsOf(log).some((e) => e.t === 'session_start'));
  assert.equal(await s.page.evaluate(() => window.__game.telemetry.q.length), 0);
  assert.deepEqual(await s.page.evaluate(() => window.__csp), []);
  await s.close();
});

test('안드로이드 앱 흉내: 프록시가 있으면 sendBeacon 대신 감싼 fetch 로 같은 출처 /api/t, 프록시 없는 옛 앱은 끔', async () => {
  const log = [];
  const s = await env.page(VP, null, { initScripts: [() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    window.__BN_APP = { platform: 'android', version: '1.0.0', assets: 'full', apiProxy: true, apiBase: '/api' };
    window.__calls = { fetch: [], beacon: 0 };
    const f = window.fetch;
    window.fetch = function (u, o) { window.__calls.fetch.push(String(u)); return f.call(window, u, o); }; // head_inject.html 의 감싼 fetch 자리
    navigator.sendBeacon = () => { window.__calls.beacon++; return true; };
  }] });
  await hook(s.ctx, log, 'appassets.androidplatform.net');
  await s.page.goto('https://appassets.androidplatform.net/index.html');
  await s.waitGame();
  assert.deepEqual([(await T(s)).active, (await T(s)).why], [true, 'ok']);
  await waitQ(s, 'session_start');
  await s.page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  for (let i = 0; i < 40 && !posts(log).length; i++) await s.wait(100);
  const calls = await s.page.evaluate(() => window.__calls);
  assert.equal(calls.beacon, 0);
  assert.ok(calls.fetch.includes('/api/t'), JSON.stringify(calls));
  assert.equal(posts(log)[0].host, 'appassets.androidplatform.net');
  const ss = eventsOf(log).find((e) => e.t === 'session_start');
  assert.deepEqual([ss.plat, ss.br, ss.os], ['apk', 'webview', 'linux']);
  await s.close();
  const s2 = await env.page(VP, null, { initScripts: [() => { window.__BN_APP = { platform: 'android', apiProxy: false, apiBase: null }; }] });
  await hook(s2.ctx, [], 'appassets.androidplatform.net');
  await s2.page.goto('https://appassets.androidplatform.net/index.html?telemetry=1');
  await s2.waitGame();
  assert.deepEqual([(await T(s2)).active, (await T(s2)).why], [false, 'app']);
  await s2.close();
});

let pass = 0, failN = 0;
const t0 = Date.now();
for (const t of tests) {
  if (FILTER && !t.name.includes(FILTER)) continue;
  try {
    await t.fn();
    pass++;
    console.log(`  ✓ ${t.name}`);
  } catch (e) {
    failN++;
    console.log(`  ✗ ${t.name}\n      ${String(e?.stack ?? e).split('\n').slice(0, 8).join('\n      ')}`);
    await env.closeSessions();
  }
}
await env.close();
rt.setStoreFactory(null);
console.log(`\n[telemetry client] 통과 ${pass}, 실패 ${failN} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
process.exit(failN ? 1 : 0);
