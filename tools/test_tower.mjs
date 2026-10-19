// 무한의 탑 시험 (헤드리스 Chromium, 고정 스텝): node tools/test_tower.mjs [--filter=문자열] [--shots=폴더] [--fold=폴더 [--fold-only=card,pact,merchant,route]]
//  - 시즌 2: 계획 재현(난이도 5개 × 1~100층 × 같은 시드 세 판, 시즌 1 필드 그대로) · 변이 10종 · 계약 6종 · 상인 · 피의 길 ·
//    욕심 판(실제 서버 처리기 api.mts — 층 점수 상한 · 층 최소 시간) · 시즌 1 기록/제출 모양. --fold=폴더 → Fold 펼침 화면 4장만 찍고 끝
//  - API 는 이 파일 안의 흉내(docs/specs/online.md §2)로 답하고, 게임은 디스크에서 https://game.test 로 내보낸다 (로그인 = bn_auth 미리 넣기)
//  - 게임 루프를 멈추고(game._pageHidden) game.tick(1/60) 을 직접 돌린다 → 부하와 상관없이 같은 결과
// 확인: 층 계획 재현(같은 시드 → 같은 방·적, 다른 시드 → 다름)·방 풀 검증(tools/tower_rooms.mjs) ·
//       메뉴 → 헌터 선택 → 탑 · 1층 적 = 계획 · 처치 → 출구(▲) → 2층 · 5층 보스 등장·격파 → 축복(키보드) → 출구(가만히 서 있기) ·
//       축복 12종 효과(능력치·버프·가시·가속·대시 무적·부활) · 갇힌 적 불러내기(졸개만 잡아도 25초, 벽에 박지 않음) · 10층 안식처(회복 + 축복 셋, 패드로 고르기) · 일시정지 축복 칸 ·
//       쓰러짐 → 결과(층·시간·처치·축복) → 기기 최고 기록(meta.towerBest) · 온라인 제출 본문(board tower:<diff>, floor) ·
//       명예의 전당(기기 탭 탑 부문·온라인 보드 tower:normal) · 휴대폰(740×360·844×390) 메뉴 5장 카드 배치·탭 크기·터치로 축복 고르기 ·
//       콘솔 오류 0
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { contextOptions } from './qa/lib/viewports.mjs';
import { fakePadInit, BTN } from './qa/lib/fakepad.mjs';
import { installTapRecorder, auditScene } from './qa/lib/taps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const FILTER = typeof args.filter === 'string' ? args.filter : null;
const SHOTS = typeof args.shots === 'string' ? args.shots : '/tmp/claude-0/tower_shots';
const NO_SHOTS = SHOTS === 'off';   // --shots=off: 검사는 그대로, 확인용 스크린숏만 찍지 않는다 (다른 작업이 브라우저를 쓰는 동안 부하·장수 줄이기)
if (!NO_SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };
const TOKEN = 'T'.repeat(43);
const AUTH = { bn_auth: JSON.stringify({ id: 'hunter01', token: TOKEN }) };

// ───────────────────────── API 흉내 ─────────────────────────
function makeMock() {
  const M = { log: [], runs: [], finishes: [], finishRes: [], real: null };
  M.handle = (method, p, headers, body) => {
    const authed = headers.authorization === `Bearer ${TOKEN}`;
    const ok = (o, status = 200) => ({ status, body: { ok: true, ...o } });
    const err = (status, error) => ({ status, body: { ok: false, error } });
    if (p === '/api/health') return ok({});
    if (p === '/api/auth/me') return authed ? ok({ id: 'hunter01', createdAt: Date.now() - 86400e3, nick: '탑지기' }) : err(401, 'unauthorized');
    if (p === '/api/saves') return authed ? ok({ slots: [1, 2, 3].map((slot) => ({ slot, empty: true, rev: 0 })), meta: { rev: 0 } }) : err(401, 'unauthorized');
    if (p === '/api/meta') return method === 'GET' ? ok({ rev: 0, data: null }) : ok({ rev: 1 });
    if (p === '/api/runs' && method === 'POST') { M.runs.push(body); return ok({ run: `run.${M.runs.length}.${body?.board}`, seed: 777, ts: Date.now() }); }
    if (p === '/api/runs/finish' && method === 'POST') { M.finishes.push(body); return ok({ best: true, rank: 2, total: 9, entry: { rank: 2, nick: '탑지기', time: body?.result?.time } }); }
    const m = /^\/api\/boards\/([a-z0-9:_]+)$/.exec(p);
    if (m) {
      const entries = Array.from({ length: 12 }, (_, i) => ({ rank: i + 1, nick: `등반가${i + 1}`, time: 600000 + i * 5000, score: 500000 - i * 1000, floor: 30 - i, hero: 'kael', cls: 'kael_hunter', level: 60, date: Date.now(), ghost: false }));
      return ok({ board: m[1], total: 12, entries, ...(authed ? { me: { rank: 2, time: 605000, score: 499000, floor: 29 } } : {}) });
    }
    if (p === '/api/daily') return err(404, 'not_found');
    return err(404, 'not_found');
  };
  return M;
}

// ───────────────────────── 실제 서버 (욕심 판 · 시즌 1 기록 시험) ─────────────────────────
// netlify/functions/api.mts 를 메모리 저장소(tools/accounts/mem_store.mjs)와 가짜 시계로 부른다 — 기록 검사(online.mts checkResult)와
// 탑 규칙(gamedata.mts TOWER_RULES)이 진짜 서버 그대로 (tools/online/test_client_online.mjs realApi 와 같은 방식)
let REAL = null;
async function realApi() {
  if (REAL) return REAL;
  globalThis.Netlify ??= { context: null, env: { get: () => undefined, set() {}, has: () => false, delete() {}, toObject: () => ({}) } };
  const api = (await import(path.join(ROOT, 'netlify/functions/api.mts'))).default;
  const rt = await import(path.join(ROOT, 'netlify/lib/runtime.mts'));
  const scrypto = await import(path.join(ROOT, 'netlify/lib/crypto.mts'));
  const gd = await import(path.join(ROOT, 'netlify/lib/gamedata.mts'));
  const { createMemoryBackend } = await import(path.join(ROOT, 'tools/accounts/mem_store.mjs'));
  const backend = createMemoryBackend();
  rt.setStoreFactory((name, dc) => backend.factory(name, dc));
  scrypto.setHashCostForTests?.({ N: 1024, r: 8, p: 1 });
  const clock = { t: Date.now() };
  rt.setClock(() => clock.t);
  let ip = 0;
  const call = async (method, p, body, token) => {
    const h = new Headers({ 'content-type': 'application/json' });
    if (token) h.set('authorization', `Bearer ${token}`);
    const init = { method, headers: h };
    if (body !== undefined) { init.body = JSON.stringify(body); init.duplex = 'half'; }
    const r = await api(new Request('https://game.test' + p, init), { ip: `198.18.7.${++ip % 250}`, deploy: { context: 'production' } });
    return { status: r.status, body: await r.json() };
  };
  const signup = async (id) => { const r = await call('POST', '/api/auth/signup', { id, password: 'crimson-moon-77' }); assert.equal(r.status, 201, JSON.stringify(r.body)); return { id: r.body.id, token: r.body.token }; };
  REAL = { api, gd, clock, call, signup };
  return REAL;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

async function newContext(M, vp = 'desk', extra = {}) {
  const ctx = await browser.newContext({ ...(vp === 'desk' ? { viewport: { width: 1280, height: 720 } } : contextOptions(vp)), serviceWorkers: 'block', ...extra });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host !== 'game.test') return route.abort('blockedbyclient');
    if (u.pathname.startsWith('/api/')) {
      M.log.push({ method: req.method(), path: u.pathname });
      let body = null;
      try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
      if (M.real) {   // 실제 서버 처리기 (netlify/functions/api.mts + 메모리 저장소 — realApi)
        if (u.pathname === '/api/runs/finish') {
          M.finishes.push(body);
          M.real.clock.t += Math.ceil(Number(body?.result?.time) || 0) + 5000;   // 판을 실제로 그만큼 했다 (서버의 걸린 시간 검사)
        }
        const buf = req.postDataBuffer();
        const res = await M.real.api(new Request(req.url(), { method: req.method(), headers: await req.allHeaders(), body: buf && buf.length ? buf : undefined }), { ip: '198.51.100.30', deploy: { context: 'production' } });
        const out = Buffer.from(await res.arrayBuffer());
        if (u.pathname === '/api/runs/finish') { try { M.finishRes.push({ status: res.status, body: JSON.parse(out.toString('utf8')) }); } catch { M.finishRes.push({ status: res.status }); } }
        return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: out });
      }
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
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 300)); });
  for (const s of initScripts) await page.addInitScript(s.fn, s.arg);
  await page.addInitScript((store) => { if (store) for (const [k, v] of Object.entries(store)) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } } }, init);
  await page.goto('https://game.test/index.html?nosw', { timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.scenes.length > 0 && window.__game.scenesReady !== false, null, { timeout: 60000 });
  return { page, errs };
}
const waitTop = (page, name, ms = 20000) => page.waitForFunction((n) => window.__game.top?.name === n && (window.__game.fade?.a ?? 0) < 0.05, name, { timeout: ms });
const shot = (page, name) => (NO_SHOTS ? Promise.resolve() : page.screenshot({ path: path.join(SHOTS, `${name}.png`) }));
const freeze = (page) => page.evaluate(() => { window.__game._pageHidden = true; });
const thaw = (page) => page.evaluate(() => { const g = window.__game; g._pageHidden = false; g.last = performance.now(); });
/** 고정 스텝 n 번 (패드 읽기 포함), 끝에 한 번 그림 */
const ticks = (page, n) => page.evaluate((n) => { const g = window.__game; for (let i = 0; i < n; i++) { try { g.input?.pollFrame?.(); } catch { /* */ } g.tick(1 / 60); } g.render?.(); g.syncPad?.(); }, n);
/** 조건(문자열 식: g = game, t = 맨 아래 탑 장면, w = world, p = 영웅)이 참이 될 때까지 스텝 → 걸린 스텝, 못 하면 예외 */
async function tickUntil(page, pred, max = 1200, what = pred) {
  const n = await page.evaluate(([pred, max]) => {
    const g = window.__game;
    // eslint-disable-next-line no-new-func
    const f = new Function('g', 't', 'w', 'p', `return (${pred});`);
    const tw = () => g.scenes.find((s) => s.name === 'tower') ?? g.top;
    for (let i = 0; i <= max; i++) {
      const t = tw(), w = g.world ?? t?.world;
      try { if (f(g, t, w, w?.player)) { g.render?.(); g.syncPad?.(); return i; } } catch { /* 아직 */ }
      try { g.input?.pollFrame?.(); } catch { /* */ }
      g.tick(1 / 60);
      if (i % 30 === 0) g.render?.();
    }
    g.render?.();
    return -1;
  }, [pred, max]);
  if (n < 0) {
    const st = await page.evaluate(() => { const g = window.__game, t = g.scenes.find((s) => s.name === 'tower'); return { top: g.top?.name, phase: t?.phase, floor: t?.floor, enemies: t?.world?.enemies().length, dead: t?.world?.player?.dead }; });
    throw new Error(`${what} — ${max} 스텝 안에 안 됨 ${JSON.stringify(st)}`);
  }
  return n;
}
/** 키를 k 스텝 동안 누른다 */
async function key(page, code, k = 3) { await page.keyboard.down(code); await ticks(page, k); await page.keyboard.up(code); await ticks(page, 2); }
/** 패드 버튼을 k 스텝 동안 누른다 */
async function pad(page, i, k = 3) { await page.evaluate((i) => window.__padSet(i, 1), i); await ticks(page, k); await page.evaluate((i) => window.__padSet(i, 0), i); await ticks(page, 2); }

/** 지금 층의 적 id 목록 (정렬, 정예는 *) */
const foes = (page) => page.evaluate(() => window.__game.world.enemies().filter((e) => e.kind === 'enemy').map((e) => e.def.id + (e.elite ? '*' : '')).sort());
/** 같은 설정의 새 계획표로 층 n 의 계획 (페이지 안 — 장면과 같은 모듈) */
const planOf = (page, n, seed = null) => page.evaluate(async ([n, seed]) => {
  const T = await import('/src/data/tower.js');
  const t = window.__game.scenes.find((s) => s.name === 'tower');
  const P = new T.TowerPlanner(seed ?? t.seed, { stages: t.planner.stages, order: t.planner.order, enemies: t.planner.enemies, bosses: t.planner.bosses, lateBosses: t.planner.lateBosses, P: t.planner.P, eliteBase: t.planner.eliteBase });
  const p = P.plan(n);
  return { kind: p.kind, key: p.key ?? null, bossId: p.bossId ?? null, foes: p.enemies.map((e) => e.id + (e.elite ? '*' : '')).sort(),
    mut: p.mut ?? null, mutBlood: p.mutBlood ?? null, pacts: p.pacts ?? null, merchant: !!p.merchant, route: !!p.route };   // 시즌 2
}, [n, seed]);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ───────────────────────── 층 계획 (Node) ─────────────────────────
test('층 계획: 같은 시드 → 같은 방·적·보스, 다른 시드 → 다름 · 층 종류 · 곡선 · 축복 후보 · 방 풀 검증', async () => {
  const T = await import(path.join(ROOT, 'src/data/tower.js'));
  const { STAGES, STAGE_ORDER, STAGE_ORDER_P1 } = await import(path.join(ROOT, 'src/data/stages.js'));
  const { ENEMIES } = await import(path.join(ROOT, 'src/data/enemies.js'));
  const bosses = ['b_nightwing', 'b_banshee', 'b_dullahan', 'b_crimson', 'b_bonedragon', 'b_grimoire', 'b_chimera', 'b_leviathan', 'b_colossus', 'b_frostqueen', 'b_death', 'b_dracula', 'b_chaos'];
  const mk = (seed, order = STAGE_ORDER_P1) => new T.TowerPlanner(seed, { stages: STAGES, order, enemies: ENEMIES, bosses, P: 60, eliteBase: 0.04 });
  const dump = (P) => Array.from({ length: 40 }, (_, i) => { const p = P.plan(i + 1); return [p.kind, p.key, p.bossId, p.level, p.enemies.map((e) => `${e.id}@${e.slot}${e.elite ? '*' : ''}`).join(',')].join('|'); });
  assert.deepEqual(dump(mk(4242)), dump(mk(4242)), '같은 시드 = 같은 계획');
  assert.notDeepEqual(dump(mk(4242)), dump(mk(4243)), '다른 시드 = 다른 계획');
  assert.deepEqual([1, 4, 5, 9, 10, 15, 20, 25].map(T.floorKind), ['combat', 'combat', 'boss', 'combat', 'rest', 'boss', 'rest', 'boss']);
  const P = mk(99);
  for (let f = 1; f <= 60; f++) {
    const p = P.plan(f);
    if (p.kind === 'boss') assert.ok(bosses.includes(p.bossId), `${f}층 보스 ${p.bossId}`);
    if (p.kind !== 'combat') { assert.equal(p.enemies.length, 0); continue; }
    const R = T.towerRoom(STAGES, p.sid, p.rid);
    assert.ok(R && R.ground >= 4, `${f}층 방 ${p.key}`);
    assert.equal(p.enemies.length, T.TOWER_CURVE.count(f));
    for (const e of p.enemies) {
      assert.ok(T.towerFoeOk(ENEMIES, e.id), `${f}층 적 ${e.id}`);
      const s = R.slots[e.slot];
      assert.ok(s && (ENEMIES[e.id].flying || s.ground), `${f}층 ${e.id} 자리 ${e.slot}`);
    }
    // 최근 4층 안에 같은 방이 다시 나오지 않는다
    for (let k = 1; k <= 4 && f - k >= 1; k++) assert.notEqual(P.plan(f - k).key ?? '-', p.key, `${f}층 방 반복`);
  }
  // 곡선: 층이 오를수록 강해진다
  for (let f = 2; f <= 60; f++) {
    assert.ok(T.TOWER_CURVE.hp(f) > T.TOWER_CURVE.hp(f - 1) && T.TOWER_CURVE.atk(f) > T.TOWER_CURVE.atk(f - 1), `곡선 ${f}`);
    assert.ok(T.TOWER_CURVE.level(60, f) >= T.TOWER_CURVE.level(60, f - 1));
  }
  const d = T.towerDiff({ enemyHp: 1, enemyAtk: 1, enemySpeed: 1, bossHp: 1, elite: 0.04 }, 21);
  assert.ok(Math.abs(d.enemyHp - (1 + 0.6 + 0.0008 * 400)) < 1e-9 && d.enemySpeed === 1.2);
  // 축복: 12종, 후보 셋은 서로 다르고 가득 찬 것은 빠진다, 같은 입력 → 같은 후보
  assert.equal(T.BLESSINGS.length, 12);
  const o = T.blessingOffer(5, 10, {}, 0);
  assert.equal(new Set(o).size, 3);
  assert.deepEqual(o, T.blessingOffer(5, 10, {}, 0));
  const full = Object.fromEntries(T.BLESSINGS.filter((b) => b.id !== 'might' && b.id !== 'crit').map((b) => [b.id, b.max]));
  assert.deepEqual(T.blessingOffer(5, 10, full, 0).sort(), ['crit', 'might']);
  // 2부 풀
  assert.ok(mk(1, STAGE_ORDER).rooms.length > mk(1).rooms.length);
  // 외전 보스 (lateBosses, docs/specs/ex_s21.md · ex_s22.md · ex_s23.md · ex_s24.md · ex_s25.md): 순서 구간의 계획은 그대로이고, 순서를 다 지난 무작위 구간에서만 후보가 된다
  //   (장면은 arcade.js sideBosses() = BOSS_ORDER 의 STORY_BOSSES 뒤 = 아르겐 · 네메인 · 하겐 · 엘제베트 · 카론 · 파라켈(s26, 1부 외전) 을 준다)
  const LATE = ['b_argen', 'b_nemain', 'b_hagen', 'b_bride', 'b_charon', 'b_paracel'];
  {
    // arcade.js 는 브라우저 모듈을 끌어오므로 소스에서 BOSS_ORDER 를 읽는다 (STORY_BOSSES = 20 뒤 = 외전 보스)
    const src = fs.readFileSync(path.join(ROOT, 'src/scenes/front/arcade.js'), 'utf8'), at = src.indexOf('export const BOSS_ORDER = [');
    const order = [...src.slice(at, src.indexOf('];', at)).matchAll(/'(b_\w+)'/g)].map((m) => m[1]);
    assert.deepEqual(order.slice(20), LATE, 'BOSS_ORDER 의 외전 보스 (sideBosses) = 아르겐 · 네메인 · 하겐 · 엘제베트 · 카론 · 파라켈');
  }
  const late = (seed) => new T.TowerPlanner(seed, { stages: STAGES, order: STAGE_ORDER_P1, enemies: ENEMIES, bosses, lateBosses: LATE, P: 60, eliteBase: 0.04 });
  assert.deepEqual(dump(late(4242)).slice(0, 2 * STAGE_ORDER_P1.length), dump(mk(4242)).slice(0, 2 * STAGE_ORDER_P1.length), '외전 보스를 더해도 순서 구간은 같다');
  const lateAt = Object.fromEntries(LATE.map((id) => [id, []]));
  for (let sd = 1; sd <= 40; sd++) { const L = late(sd); for (let f = 1; f <= 120; f++) { const p = L.plan(f); if (p.kind === 'boss' && lateAt[p.bossId]) lateAt[p.bossId].push(f); } }
  for (const id of LATE) assert.ok(lateAt[id].length > 0 && lateAt[id].every((f) => f > 2 * STAGE_ORDER_P1.length), `${id} 층 ${lateAt[id].slice(0, 8)}`);
  // 방 풀 검증 (validate_maps --stages): 오류 0
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/tower_rooms.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /오류 0개/);
});

// ───────────────────────── 시즌 2 계획 (Node) ─────────────────────────
test('시즌 2 계획: 같은 시드 → 세 번 모두 같은 변이·계약·상인·갈림길 · 난이도 5개 × 1~100층 · 시즌 1 필드는 그대로 · 변이 10 · 계약 6', async () => {
  const T = await import(path.join(ROOT, 'src/data/tower.js'));
  const { STAGES, STAGE_ORDER, STAGE_ORDER_P1 } = await import(path.join(ROOT, 'src/data/stages.js'));
  const { ENEMIES } = await import(path.join(ROOT, 'src/data/enemies.js'));
  const { DIFFICULTIES } = await import(path.join(ROOT, 'src/data/difficulty.js'));
  assert.equal(DIFFICULTIES.length, 5);
  const B1 = ['b_nightwing', 'b_banshee', 'b_dullahan', 'b_crimson', 'b_bonedragon', 'b_grimoire', 'b_chimera', 'b_leviathan', 'b_colossus', 'b_frostqueen', 'b_death', 'b_dracula', 'b_chaos'];
  const src = fs.readFileSync(path.join(ROOT, 'src/scenes/front/arcade.js'), 'utf8'), at = src.indexOf('export const BOSS_ORDER = [');
  const B2 = [...src.slice(at, src.indexOf('];', at)).matchAll(/'(b_\w+)'/g)].map((m) => m[1]).slice(0, 20);
  const P2ORDER = STAGE_ORDER.filter((id) => !STAGES[id]?.side);
  // 시즌 1 계획표 = season2() 를 비운 계획표 (시즌 2 는 따로 뽑는 난수 줄기만 쓴다 → 옛 필드가 하나도 바뀌지 않아야 한다)
  class Season1 extends T.TowerPlanner { season2() { /* 시즌 1 */ } }
  const old = (p) => JSON.stringify([p.kind, p.key, p.bossId, p.level, p.sid, p.rid, p.enemies, p.pool ?? null]);
  const s2 = (p) => JSON.stringify([p.mut ?? null, p.mutBlood ?? null, p.pacts ?? null, !!p.merchant, !!p.route, p.extra ?? null]);
  const seen = { mut: new Set(), blood: new Set(), pact: new Set() }, mutN = {};
  let floors = 0;
  for (const [i, d] of DIFFICULTIES.entries()) {
    for (const [order, bosses, P] of [[STAGE_ORDER_P1, B1, [10, 25, 40, 60, 60][i]], [P2ORDER, B2, 68]]) {
      for (const seed of [1, 4242, 0x9e3779b9 >>> 0, 77 + i]) {
        const opts = { stages: STAGES, order, enemies: ENEMIES, bosses, P, eliteBase: d.elite ?? 0 };
        // 같은 시드로 세 판 (계획표 셋) — 하나는 100층부터 거꾸로 묻는다 (층은 1부터 차례로 기억된다)
        const runs = [new T.TowerPlanner(seed, opts), new T.TowerPlanner(seed, opts), new T.TowerPlanner(seed, opts)];
        runs[2].plan(100);
        const dumps = runs.map((R) => Array.from({ length: 100 }, (_, k) => { const p = R.plan(k + 1); return old(p) + s2(p); }));
        assert.deepEqual(dumps[1], dumps[0], `${d.id} 시드 ${seed}: 둘째 판 = 첫 판`);
        assert.deepEqual(dumps[2], dumps[0], `${d.id} 시드 ${seed}: 셋째 판 = 첫 판`);
        const S1 = new Season1(seed, opts);
        const R = runs[0];
        let prevMut = null, prevBlood = null;
        for (let f = 1; f <= 100; f++) {
          const p = R.plan(f), q = S1.plan(f);
          floors++;
          assert.equal(old(p), old(q), `${d.id} ${seed} ${f}층: 시즌 1 필드 그대로`);
          const tag = `${d.id} 시드 ${seed} ${f}층 (${p.kind})`;
          if (p.kind !== 'combat' || f < T.MUT_FROM) { assert.equal(p.mut ?? null, null, `${tag} 변이 없음`); assert.equal(p.mutBlood ?? null, null, `${tag} 센 변이 없음`); }
          else {
            assert.ok(T.MUTATOR[p.mut], `${tag} 변이 ${p.mut}`);
            assert.equal(T.MUTATOR[p.mutBlood]?.tier, 2, `${tag} 피의 길 변이 ${p.mutBlood} = 센 것`);
            assert.notEqual(p.mut, prevMut, `${tag} 같은 변이가 연달아`);
            assert.notEqual(p.mutBlood, prevBlood, `${tag} 같은 센 변이가 연달아`);
            assert.equal(p.mut, T.mutatorOf(seed, f, false, prevMut), `${tag} rngOf(seed,'mut',f)`);
            prevMut = p.mut; prevBlood = p.mutBlood;
            seen.mut.add(p.mut); seen.blood.add(p.mutBlood); mutN[p.mut] = (mutN[p.mut] ?? 0) + 1;
          }
          if (p.kind === 'combat') {
            // 질주의 계약: 계획의 추가 적 셋 (방의 자리 · 날지 않으면 바닥 자리)
            assert.equal(p.extra?.length, 3, `${tag} 추가 적`);
            const room = T.towerRoom(STAGES, p.sid, p.rid);
            for (const e of p.extra) {
              assert.ok(T.towerFoeOk(ENEMIES, e.id), `${tag} 추가 적 ${e.id}`);
              const s = room.slots[e.slot];
              assert.ok(s && (ENEMIES[e.id].flying || s.ground), `${tag} 추가 적 자리 ${e.slot}`);
            }
          } else assert.equal(p.extra ?? null, null);
          if (p.kind === 'rest') {
            assert.equal(p.pacts?.length, 2, `${tag} 계약 둘`);
            assert.equal(new Set(p.pacts).size, 2);
            assert.ok(p.pacts.every((id) => T.PACT[id]), `${tag} 계약 ${p.pacts}`);
            assert.deepEqual(p.pacts, T.pactOffer(seed, f, {}), `${tag} rngOf(seed,'pact',f)`);
            p.pacts.forEach((id) => seen.pact.add(id));
          } else assert.equal(p.pacts ?? null, null);
          assert.equal(!!p.route, p.kind === 'boss', `${tag} 갈림길 = 보스 층`);
          assert.equal(!!p.merchant, p.kind === 'boss' && [15, 35, 55, 75, 95].includes(f), `${tag} 상인 = 15·35·55·75·95층`);
        }
      }
    }
  }
  assert.equal(floors, 5 * 2 * 4 * 100);
  assert.deepEqual([...seen.mut].sort(), T.MUTATORS.map((m) => m.id).sort(), '변이 10종이 모두 나온다');
  assert.deepEqual([...seen.blood].sort(), T.MUTATORS.filter((m) => m.tier === 2).map((m) => m.id).sort(), '센 변이 모두');
  assert.deepEqual([...seen.pact].sort(), T.PACTS.map((p) => p.id).sort(), '계약 6종이 모두 나온다');
  const tot = Object.values(mutN).reduce((a, b) => a + b, 0);
  for (const [id, n] of Object.entries(mutN)) assert.ok(n / tot > 0.03 && n / tot < 0.25, `변이 ${id} 비율 ${(n / tot).toFixed(3)}`);
  // 변이 10종 · 계약 6종의 모양: 이름·설명·아이콘 파일 · 피해 변이는 0.6초 이상 예고 · 계약마다 진짜 손해
  assert.equal(T.MUTATORS.length, 10);
  assert.equal(new Set(T.MUTATORS.map((m) => m.name)).size, 10);
  const icon = (id) => ['png', 'webp'].some((x) => fs.existsSync(path.join(ROOT, `assets/icons/${id}.${x}`)));
  for (const m of T.MUTATORS) {
    assert.ok(m.name && m.desc && /^#[0-9a-f]{6}$/i.test(m.color) && m.w > 0 && [1, 2].includes(m.tier), `변이 ${m.id}`);
    assert.ok(icon(m.icon), `변이 아이콘 ${m.icon}`);
    if (m.frac) assert.ok(m.warn >= 0.6 && m.frac <= 0.1, `${m.id}: 예고 ${m.warn}초 · 피해 ${m.frac}`);
  }
  assert.equal(T.MUTATOR.gold.gold, 3, '황금 층 = 골드 ×3');
  assert.equal(T.MUTATOR.rush.rushSec, 30, '속공 = 30초');
  assert.equal(T.PACTS.length, 6);
  const base = { atk: 100, mag: 100, def: 40, res: 40, hp: 500, mp: 100, crit: 10, critDmg: 50, lifesteal: 0, moveSpd: 0, atkSpd: 0, goldBonus: 0 };
  for (const P of T.PACTS) {
    assert.ok(P.name && P.up && P.down && icon(P.icon), `계약 ${P.id}`);
    const s = T.applyPactStats({ ...base }, { [P.id]: true });
    const statDown = Object.keys(base).some((k) => (s[k] ?? 0) < base[k]);
    assert.ok(statDown || P.rules || P.noRestHeal || P.bossHp > 1 || P.extraFoes > 0, `${P.id}: 손해가 있어야 한다`);
    const statUp = Object.keys(base).some((k) => (s[k] ?? 0) > base[k]);
    assert.ok(statUp || P.bless > 0, `${P.id}: 이득이 있어야 한다`);
  }
  // 상인 값: 층 레벨에 따라 오른다 (10G 단위)
  assert.equal(T.merchantPrice(30, 1), 30);
  assert.ok(T.merchantPrice(70, 60) > T.merchantPrice(70, 30) && T.merchantPrice(70, 60) % 10 === 0);
  // 서버 사본과 같은 규칙 (netlify/lib/gamedata.mts — 욕심 판 시험이 이 값으로 잰다)
  const GD = await import(path.join(ROOT, 'netlify/lib/gamedata.mts'));
  assert.deepEqual({ ...GD.TOWER_RULES }, { ...T.TOWER_RULES });
  const PH = T.TOWER_PHASE;
  assert.ok(PH.enter + PH.clear + PH.gateOpen >= T.TOWER_RULES.minFloorSec - 1e-9 && PH.restEnter + PH.gateOpen + 1.4 >= T.TOWER_RULES.minFloorSec, '건너뛸 수 없는 연출 ≥ minFloorSec');
});

// ───────────────────────── 한 판 (데스크톱) ─────────────────────────
test('한 판: 메뉴 → 헌터 선택 → 1층 처치·출구 → 5층 보스·축복 → 축복 12종 → 10층 안식처 → 일시정지 → 부활 → 결과·기록·온라인 제출', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH, initScripts: [fakePadInit({ connected: true })] });
  // 메뉴: 저장된 설정 = 무한의 탑 · 보통 · 전설의 헌터 → 결정 → 헌터 선택 → 결정
  await page.evaluate(() => { const g = window.__game; g.meta.arcadeCfg = { kind: 'tower', diff: 'normal', preset: 3 }; g.go('arcade', {}, { fade: false }); });
  await waitTop(page, 'arcade');
  assert.equal(await page.evaluate(() => window.__game.top.kind), 'tower');
  await page.waitForTimeout(300);
  await shot(page, 'menu_desk');
  await page.keyboard.press('Enter');
  await waitTop(page, 'charselect');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await waitTop(page, 'tower', 30000);
  await freeze(page);
  const info = await page.evaluate(() => { const t = window.__game.top; return { seed: t.seed, kind: t.cfg.kind, diff: t.cfg.diff, lv: t.P.lv, board: t.board, mode: t.world.mode, arcade: t.world.arcade, lives: t.world.run.lives }; });
  assert.ok(Number.isInteger(info.seed), 'seed');
  assert.deepEqual({ ...info, seed: 0 }, { seed: 0, kind: 'tower', diff: 'normal', lv: 60, board: 'tower:normal', mode: 'tower', arcade: true, lives: 1 });
  await page.waitForFunction(() => window.__game.top.orun?.state === 'ready', null, { timeout: 8000 });
  assert.deepEqual(M.runs, [{ board: 'tower:normal' }], '런 시작 (POST /api/runs)');

  // 1층: 계획대로 적이 나온다
  await tickUntil(page, "t.phase === 'fight'", 200, '1층 전투 시작');
  const plan1 = await planOf(page, 1);
  const f1 = { key: await page.evaluate(() => window.__game.top.plan.key), foes: await foes(page) };
  assert.equal(plan1.kind, 'combat');
  assert.deepEqual(f1, { key: plan1.key, foes: plan1.foes }, '1층 = 계획');
  assert.equal(await page.evaluate(() => window.__game.world.stage.id), 'tower');
  await shot(page, 'floor1');
  // 처치 → 층 돌파 → 출구 → ▲
  await page.evaluate(() => window.__game.top.debugKillAll());
  await tickUntil(page, "t.phase === 'gate' && t.gate && t.gate.near", 400, '출구 열림');
  assert.equal(await page.evaluate(() => window.__game.top.cleared), 1);
  assert.ok(await page.evaluate(() => window.__game.world.run.kills) >= 5);
  await shot(page, 'gate');
  await key(page, 'ArrowUp');
  await tickUntil(page, "t.floor === 2 && t.phase === 'enter' && g.fade.a < 0.05", 200, '2층');
  assert.equal(await page.evaluate(() => window.__game.top.call?.main), '제 2층');

  // 5층: 보스 → 격파 → 축복(키보드) → 출구 (가만히 서 있기)
  await page.evaluate(() => window.__game.top.debugFloor(5));
  await tickUntil(page, "t.phase === 'boss' && w.boss", 200, '보스 등장');
  const bossId = await page.evaluate(async () => (await window.__game.world.bossReady())?.def?.id);
  assert.equal(bossId, (await planOf(page, 5)).bossId, '보스 = 계획');
  await tickUntil(page, "g.top.name === 'tower' && !w.cutscene", 400, '보스 등장 연출 끝');
  await ticks(page, 30);
  await shot(page, 'boss');
  await page.evaluate(() => window.__game.top.debugKillAll());
  await tickUntil(page, "g.top.name === 'towerBlessing'", 400, '보스 격파 → 축복');
  assert.equal(await page.evaluate(() => window.__game.scenes.find((s) => s.name === 'tower').bossKills), 1);
  await ticks(page, 20);
  await shot(page, 'blessing_boss');
  const offer5 = await page.evaluate(() => window.__game.top.ids);
  assert.equal(offer5.length, 3);
  await key(page, 'ArrowRight');
  await key(page, 'Enter');
  await tickUntil(page, "g.top.name === 'tower' && t.phase === 'gate'", 200, '축복 → 출구');
  assert.equal(await page.evaluate(() => window.__game.top.paused), false, '축복을 고른 뒤 일시정지 표시가 풀린다 (층 이름·출구 안내·적 방향 표시)');
  const took5 = await page.evaluate(() => window.__game.top.takenOrder);
  assert.deepEqual(took5, [offer5[2]], '→ 다음 카드 = 세 번째');
  // 시즌 2: 보스 층 뒤 갈림길 — [play-fix #3] 영웅 왼쪽 = 안전한 길, 오른쪽 = 피의 길 (둘 다 한 화면, 영웅은 어느 문 위에도 서 있지 않다).
  //  예전 규칙(발밑 = 안전한 길, 가만히 1.4초면 저절로)은 고르기를 보이지 않게 했다 → 가만히 서 있기 · 자동 전투로는 고르지 않고, 사람이 문으로 걸어가야 고른다
  const routes5 = await page.evaluate(() => {
    const t = window.__game.top, w = t.world, p = w.player, cam = w.camera;
    return { gates: t.gates.map((g) => ({ route: g.route, cx: Math.round(g.cx), near: g.near, seen: cam.visible(g.x, g.y - 90, g.w, g.h + 90, 0) })), px: Math.round(p.cx) };
  });
  assert.equal(routes5.gates.length, 2, `갈림길 문 둘 ${JSON.stringify(routes5)}`);
  assert.deepEqual(routes5.gates.map((r) => r.route), ['safe', 'blood']);
  assert.ok(routes5.gates[0].cx < routes5.px && routes5.px < routes5.gates[1].cx, `영웅이 두 문 사이 ${JSON.stringify(routes5)}`);
  assert.ok(routes5.gates.every((g) => g.seen && !g.near), `두 문 모두 화면 안 · 영웅은 문 위가 아니다 ${JSON.stringify(routes5)}`);
  assert.ok(Math.abs(routes5.gates[0].cx - routes5.gates[1].cx) >= 5 * 48, `문 사이 ${JSON.stringify(routes5)}`);
  await ticks(page, 240);   // 가만히 4초 (예전 규칙이면 1.4초에 떠났다)
  assert.deepEqual(await page.evaluate(() => { const t = window.__game.top; return [t.floor, t.phase]; }), [5, 'gate'], '가만히 서 있기로는 고르지 않는다');
  // 자동 전투: 길을 고르지 않는다 (가운데에서 기다린다 — 안내 한 줄)
  await page.evaluate(async () => { const A = await import('/src/game/autoplay.js'); A.setLevel(window.__game, 'battle', { toast: false }); });
  await ticks(page, 300);
  assert.deepEqual(await page.evaluate(() => { const t = window.__game.top; return [t.floor, t.phase]; }), [5, 'gate'], '자동 전투는 길을 고르지 않는다');
  await page.evaluate(async () => { const A = await import('/src/game/autoplay.js'); A.setLevel(window.__game, 'off', { toast: false }); });
  // 사람이 왼쪽으로 걸어가 안전한 문 위에 서면 (1.4초) 안전한 길
  await page.keyboard.down('ArrowLeft');
  await tickUntil(page, 't.gates[0].near', 300, '안전한 문까지 걷기');
  await page.keyboard.up('ArrowLeft');
  await tickUntil(page, 't.floor === 6', 400, '안전한 문 위에 서 있으면 6층');
  assert.equal(await page.evaluate(() => window.__game.top.cleared), 5);
  assert.equal(await page.evaluate(() => window.__game.top.route), 'safe', '걸어가 서 있기 = 안전한 길');
  assert.equal(await page.evaluate(() => window.__game.top.bloodFloor), false);
  assert.equal(await page.evaluate(() => window.__game.top.mut?.id ?? null), (await planOf(page, 6)).mut, '6층 변이 = 계획 (안전한 길)');

  // 축복 12종 효과 (6층 전투 중) — 변이 없는 6층으로 다시 (변이는 따로 시험한다: '변이 10종')
  await page.evaluate(() => window.__game.top.debugFloor(6, { mut: null }));
  await tickUntil(page, "t.phase === 'fight'", 200, '6층 전투');
  const fx = await page.evaluate(() => {
    const t = window.__game.top, w = t.world, p = w.player, out = {};
    // 방의 무작위 강화 구슬(지도 p — 종류는 Math.random)은 치운다: 아래 자석 축복이 끌어오면 로사리오(화면의 적 전멸 → 6층이 끝나 버림)나
    // 성광의 오라가 뒤의 '갇힌 적 불러내기' 검사를 흔든다
    for (const e of w.entities) if (e.kind === 'pickup') e.dead = true;
    const snap = () => ({ ...p.stats, air: p.maxAirJumps(), hp: p.hp });
    for (const id of ['might', 'crit', 'leech', 'vigor', 'mana', 'wings', 'volley', 'magnet', 'frenzy', 'phoenix']) {
      const a = snap(), n0 = t.taken[id] | 0, ok = t.applyBlessing(id), b = snap();
      out[id] = { ok, n0, a, b };
    }
    // 처치 가속: 처치 한 번 → 3초 동안 이동 속도 +25
    const s0 = p.stats.moveSpd; t.onKill(); out.frenzyOn = { d: p.stats.moveSpd - s0, haste: t.hasteT };
    out.revive = t.reviveLeft;
    out.triple = p.buffs.triple;
    return out;
  });
  const near = (x, y, e = 1.5) => Math.abs(x - y) <= e;
  for (const [id, r] of Object.entries(fx).filter(([k]) => !['frenzyOn', 'revive', 'triple'].includes(k))) assert.ok(r.ok || r.n0 >= 1, `${id} 적용`);
  const R = (id) => fx[id], step = (id) => (R(id).ok ? 1 : 0);
  if (step('might')) { const n = fx.might.n0 + 1; assert.ok(near(fx.might.b.atk, fx.might.a.atk * (1 + 0.15 * n) / (1 + 0.15 * (n - 1)), 2), `might ${fx.might.a.atk}→${fx.might.b.atk}`); }
  if (step('crit')) assert.ok(near(fx.crit.b.crit, Math.min(90, fx.crit.a.crit + 8)), 'crit +8');
  if (step('leech')) assert.ok(near(fx.leech.b.lifesteal, fx.leech.a.lifesteal + 3), 'leech +3');
  if (step('vigor')) { const n = fx.vigor.n0 + 1; assert.ok(near(fx.vigor.b.hp, fx.vigor.a.hp * (1 + 0.2 * n) / (1 + 0.2 * (n - 1)), 2), 'vigor hp'); assert.ok(fx.vigor.b.hp > fx.vigor.a.hp, 'vigor: 늘어난 만큼 회복'); }
  if (step('mana')) assert.ok(near(fx.mana.b.mpRegen, fx.mana.a.mpRegen + 3, 0.01), 'mana +3');
  if (step('wings')) assert.equal(fx.wings.b.air, fx.wings.a.air + 1, 'wings +1');
  if (step('magnet')) assert.ok(fx.magnet.b.magnet >= 1 && near(fx.magnet.b.heartBonus, fx.magnet.a.heartBonus + 50), 'magnet');
  assert.equal(fx.triple, 9999, 'volley → 트리플 샷');
  assert.ok(fx.frenzyOn.d >= 25 && fx.frenzyOn.haste === 3, `frenzy ${JSON.stringify(fx.frenzyOn)}`);
  assert.equal(fx.revive, 1, 'phoenix → 부활 1');
  // 처치 가속은 3초 뒤 풀린다
  await ticks(page, 200);
  assert.equal(await page.evaluate(() => window.__game.top.hasteT <= 0), true);
  // 대시 무적: 대시 뒤 0.25초 더
  const dash = await page.evaluate(() => {
    const t = window.__game.top, w = t.world, p = w.player;
    t.applyBlessing('dash');
    p.iframes = 0; p.startDash(1, w);
    return { dashT: p.dashT };
  });
  await ticks(page, 1);
  const ifr = await page.evaluate(() => window.__game.world.player.iframes);
  assert.ok(ifr > dash.dashT + 0.15, `대시 무적 ${ifr} > ${dash.dashT}+0.15`);
  // 가시 반사: 맞으면 곁의 적이 피해를 받는다
  const thorn = await page.evaluate(() => {
    const t = window.__game.top, w = t.world, p = w.player;
    t.applyBlessing('thorns');
    const e = w.spawnEnemy('skeleton', p.cx + 60, p.bottom, { level: 10 });
    e.invuln = false;
    const hp0 = e.hp;
    w.onPlayerHurt(5);
    return { hp0, hp1: e.hp, dead: e.dead || e.dying > 0 };
  });
  assert.ok(thorn.hp1 < thorn.hp0 || thorn.dead, `가시 ${JSON.stringify(thorn)}`);
  // HUD 아이콘 줄
  await ticks(page, 10);
  await shot(page, 'blessings_hud');
  // 갇힌 적 불러내기: 졸개만 계속 잡아(처치 수는 늘어도) 남은 적 수가 새로 줄지 않으면 25초 뒤 불러낸다 — 불러낸 적은 벽에 박히지 않는다
  const stall = await page.evaluate(async () => {
    const { isSolidType } = await import('/src/core/physics.js');
    const g = window.__game, t = g.top, w = t.world, p = w.player, m = w.map;
    // 적은 이 검사 동안 시험이 직접 처치할 때만 쓰러진다 (박쥐도): 위에서 받은 가시 반사(무적이어도 맞으면 곁의 적을 친다)나 자석 축복이
    // 끌어온 강화(성광의 오라·로사리오 — 정예가 떨어뜨린 것)가 영웅에게 닿은 적을 쓰러뜨리면(방·시드·난수마다 다름) 남은 적 수가 줄어
    // 불러내기 시계가 다시 시작되거나 박쥐가 먼저 죽어 처치 수가 모자란다 (흔들리는 실패)
    const held = w.enemies().filter((e) => !e.invuln);
    for (const e of held) e.invuln = true;
    for (const e of w.entities) if (e.kind === 'pickup') e.dead = true;
    delete p.buffs.holyaura;
    p.buffs.invincible = 9999;
    let n = 0, kills = 0;
    const o = t.summonStragglers.bind(t);
    t.summonStragglers = () => { n++; return o(); };
    for (let i = 0; i < 60 * 32 && !n; i++) {
      if (i % 180 === 90) w.spawnEnemy('bat', p.cx + 100, p.bottom - 40, { level: 5, elite: false }).invuln = true;
      if (i % 180 === 150) for (const e of w.enemies()) if (e.def?.id === 'bat') { e.dead = true; w.onEnemyKilled(e, null); kills++; }
      g.tick(1 / 60);
    }
    delete t.summonStragglers;
    let inWall = 0;
    for (const e of w.enemies()) {
      if (e.kind !== 'enemy' || e.def?.flying) continue;
      for (let x = e.x + 4; x <= e.x + e.w - 4; x += 8) for (let y = e.y + 4; y <= e.y + e.h - 4; y += 8) if (isSolidType(m.typeAt(Math.floor(x / 48), Math.floor(y / 48)))) { inWall++; x = Infinity; break; }
    }
    p.buffs.invincible = 0;
    for (const e of held) e.invuln = false;
    return { n, kills, inWall };
  });
  assert.ok(stall.n === 1 && stall.kills >= 5, `졸개만 잡아도 불러내기 ${JSON.stringify(stall)}`);
  assert.equal(stall.inWall, 0, '불러낸 적이 벽에 박힘');

  // 10층 안식처: 회복 + 축복 셋 (패드로 고르기)
  await page.evaluate(() => { const t = window.__game.top; t.debugFloor(10); const p = t.world.player; p.hp = Math.round(p.stats.hp * 0.4); });
  const hpBefore = await page.evaluate(() => window.__game.world.player.hp);
  await tickUntil(page, "g.top.name === 'towerBlessing'", 400, '안식처 축복');
  const rest = await page.evaluate(() => ({ ids: window.__game.top.ids, hp: window.__game.world.player.hp, max: window.__game.world.player.stats.hp, kind: window.__game.scenes[0].kind }));
  assert.equal(rest.kind, 'rest');
  assert.equal(rest.ids.length, 3, '축복 셋');
  assert.ok(rest.hp >= hpBefore + rest.max * 0.29, `회복 ${hpBefore} → ${rest.hp}`);
  await ticks(page, 20);
  await shot(page, 'blessing_rest');
  const before10 = await page.evaluate(() => ({ ...window.__game.scenes[0].taken }));
  await page.evaluate(() => window.__padConnect?.());
  await pad(page, BTN.LEFT);
  await pad(page, BTN.A);
  // 시즌 2: 안식처 축복 뒤 피의 계약 (둘 + 거절) → 패드로 거절 (→ → A)
  await tickUntil(page, "g.top.name === 'towerBlessing' && g.top.mode === 'pact'", 200, '안식처 → 피의 계약');
  const pact10 = await page.evaluate(() => ({ ids: window.__game.top.ids, plan: window.__game.scenes[0].plan.pacts }));
  assert.deepEqual(pact10.ids, [...pact10.plan, null], `계약 둘 + 거절 ${JSON.stringify(pact10)}`);
  await ticks(page, 20);
  // 방금 고른 축복 알림은 계약 창이 떠 있는 동안 숨고 시간도 멈춘다 (창 제목을 가리지 않게) → 창을 닫은 뒤 뜬다
  const blessToast = () => page.evaluate(() => { const g = window.__game, x = g.toasts.find((o) => o.text.startsWith('축복: ')); return { deferred: g.toastsDeferred(g.top), t: x?.t ?? null, max: x?.max ?? null }; });
  const held = await blessToast();
  assert.ok(held.deferred && held.t != null && held.t === held.max, `계약 창 위 축복 알림 보류 ${JSON.stringify(held)}`);
  await shot(page, 'pact_rest');
  await pad(page, BTN.RIGHT);
  await pad(page, BTN.RIGHT);
  await pad(page, BTN.A);
  await tickUntil(page, "g.top.name === 'tower' && t.phase === 'gate'", 200, '안식처 → 출구');
  let shown = null;   // 앞 알림(이정표 등)이 줄을 차지하면 그 뒤에 차례로 뜬다
  for (let i = 0; i < 30; i++) { await ticks(page, 10); shown = await blessToast(); if (shown.t != null && shown.t < shown.max) break; }
  assert.ok(!shown.deferred && shown.t != null && shown.t < shown.max, `창을 닫은 뒤 축복 알림 ${JSON.stringify(shown)}`);
  assert.deepEqual(await page.evaluate(() => window.__game.top.pactOrder), [], '거절 → 계약 없음');
  const after10 = await page.evaluate(() => ({ taken: { ...window.__game.top.taken }, last: window.__game.top.takenOrder.at(-1) }));
  assert.equal(after10.last, rest.ids[0], '패드 ← = 첫 카드');
  assert.equal(after10.taken[rest.ids[0]], (before10[rest.ids[0]] | 0) + 1);

  // 일시정지: 받은 축복 칸
  await page.evaluate(() => window.__game.push('arcadePause', { run: window.__game.top }));
  await ticks(page, 20);
  await shot(page, 'pause_side');
  await page.evaluate(() => window.__game.pop());
  await ticks(page, 2);

  // 쓰러짐 → 부활 (불사조) → 다시 쓰러짐 → 결과
  const kill = () => page.evaluate(() => { const w = window.__game.world, p = w.player; p.iframes = 0; p.hp = 1; p.takeHit(999999, { team: 'enemy', dir: 1, kb: [100, -200] }, w, {}); return p.dead; });
  assert.equal(await kill(), true);
  await tickUntil(page, '!p.dead && t.reviveLeft === 0', 400, '부활');
  assert.equal(await page.evaluate(() => window.__game.top.name), 'tower');
  await ticks(page, 200);   // 출구 위에서 되살아났으면 가만히 서 있어 11층으로 올라갈 수 있다
  const cleared = await page.evaluate(() => window.__game.top.cleared);
  assert.equal(cleared, 10);
  const reached = await page.evaluate(() => window.__game.top.floor);
  await page.evaluate(() => import('/src/core/events.js').then(({ bus }) => { window.__arcFin = []; bus.on('arcadeFinished', (d) => window.__arcFin.push(d)); }));
  assert.equal(await kill(), true);
  await tickUntil(page, "g.top.name === 'arcadeResults' && g.fade.a < 0.05", 600, '결과 화면');
  const res = await page.evaluate(() => { const r = window.__game.top.res; return { kind: r.kind, rows: r.rows.map((x) => [x[0], typeof x[1] === 'function' ? 'fn' : x[1]]), floor: r.extra.floor, bl: r.extra.blessings.length, time: r.time }; });
  assert.equal(res.kind, 'tower');
  assert.equal(res.floor, 10);
  // 익명 통계 사건 (core/telemetry.js 가 arcade_result 로 받는다)
  const fin = await page.evaluate(() => window.__arcFin.map((d) => ({ kind: d.kind, floor: d.extra?.floor, cleared: d.cleared, diff: d.diff })));
  assert.deepEqual(fin, [{ kind: 'tower', floor: 10, cleared: false, diff: 'normal' }]);
  assert.ok(res.bl >= 12, `축복 ${res.bl}`);
  const rowMap = Object.fromEntries(res.rows);
  assert.equal(rowMap['돌파한 층'], '10층');
  assert.equal(rowMap['도달한 층'], `제 ${reached}층`);
  assert.ok(rowMap['처치 수'] && rowMap['받은 축복'] && rowMap['걸린 시간'], JSON.stringify(rowMap));
  // 기기 최고 기록
  const best = await page.evaluate(() => window.__game.meta.towerBest);
  assert.equal(best?.normal?.floor, 10, JSON.stringify(best));
  assert.ok(best.normal.blessings.length >= 12 && best.normal.charId);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('bloodnocturne_meta') ?? '{}')?.towerBest?.normal?.floor ?? null), 10, '메타에 저장');
  // 시즌 2: v:2 기록 · 10층 이정표(K1 장부 tw:10 → 잔상 「이끼」) — 판 안의 알림 · 결과 줄 · 잔상 쪽 해금
  const s2best = await page.evaluate(async () => {
    const C = await import('/src/data/cosmetics.js'), g = window.__game, r = g.top.res;
    const ctx = C.cosContext(g.meta);
    return { v: g.meta.towerBest.normal.v, ms: r.extra.milestones, row: r.rows.find((x) => x[0] === '시즌 2')?.[1], moss: C.needMet(C.TRAILS.tr_moss.need, ctx), silver: C.needMet(C.TRAILS.tr_silver.need, ctx) };
  });
  // [play-fix #22] 0 인 것은 뺀다 (예전 「계약 0 · 피의 길 0번 · 잔상 「이끼」」 — 계약 · 피의 길을 본 적 없는 플레이어에게 뜻 모를 말)
  assert.deepEqual(s2best, { v: 2, ms: ['tr_moss'], row: '새 잔상 「이끼」', moss: true, silver: false }, JSON.stringify(s2best));
  // 아무것도 없으면 줄 자체가 없다 · 있는 것만 차례로 (장면의 결과 계산을 그대로 — 가짜 판 셋)
  const rowsOf = await page.evaluate(async () => {
    const { TowerScene } = await import('/src/scenes/front/arcade_tower.js');
    const P = TowerScene.prototype;
    const fake = (o) => ({ world: { run: { score: 0, kills: 3 } }, floor: 4, cleared: 3, clock: 61, bossKills: 0, takenOrder: [], seed: 7, bloodRuns: 0, pactOrder: [], milestones: [],
      blessingSummary: () => '없음', seasonSummary: P.seasonSummary, ...o });
    const row = (o) => P.results.call(fake(o)).rows.find((x) => x[0] === '시즌 2')?.[1] ?? null;
    return { none: row({}), blood: row({ bloodRuns: 2 }), pact: row({ pactOrder: ['fury'] }), all: row({ bloodRuns: 1, pactOrder: ['fury', 'oath'], milestones: ['tr_moss'] }) };
  });
  assert.deepEqual(rowsOf, { none: null, blood: '피의 길 2번', pact: '맺은 계약 1개', all: '피의 길 1번 · 맺은 계약 2개 · 새 잔상 「이끼」' }, JSON.stringify(rowsOf));
  // 온라인 제출: board tower:normal, floor = 돌파한 층
  await page.waitForFunction(() => window.__game.top.onl?.state === 'ok', null, { timeout: 10000 });
  const f = M.finishes[0];
  assert.ok(f, '제출');
  assert.equal(f.board, 'tower:normal');
  assert.match(f.run, /tower:normal$/);
  assert.equal(f.result.floor, 10);
  assert.equal(f.result.hero, 'kael');
  assert.ok(f.result.time > 0 && Math.abs(f.result.time - Math.round(res.time * 1000)) <= 1, `time ${f.result.time}`);
  assert.ok(!('ghost' in f), '탑은 고스트 없음');
  await thaw(page);
  await page.evaluate(() => { const t = window.__game.top; t.shown = t.res.rows.length; t.scoreShown = t.final; t.doneT = t.t; });
  await page.waitForTimeout(500);
  await shot(page, 'results');

  // 같은 시드로 다시: 1층 방·적이 같다
  await page.evaluate((seed) => import('/src/scenes/front/arcade.js').then((A) => A.startArcade(window.__game, { kind: 'tower', diff: 'normal', preset: 3, seed }, 'kael')), info.seed);
  await waitTop(page, 'tower', 30000);
  await freeze(page);
  assert.equal(await page.evaluate(() => window.__game.top.seed), info.seed);
  await tickUntil(page, "t.phase === 'fight'", 200, '다시 1층');
  assert.deepEqual({ key: await page.evaluate(() => window.__game.top.plan.key), foes: await foes(page) }, f1, '같은 시드 → 같은 1층');
  // 다른 시드면 계획이 다르다 (앞 10층 중 하나라도)
  const other = [];
  for (let n = 1; n <= 10; n++) other.push(JSON.stringify(await planOf(page, n, (info.seed + 1) >>> 0)) === JSON.stringify(await planOf(page, n)));
  assert.ok(other.includes(false), '다른 시드 → 다른 계획');
  await page.evaluate(() => { const t = window.__game.top; t.done = true; window.__game.go('arcade', {}, { fade: false }); });
  await thaw(page);
  await waitTop(page, 'arcade');

  // 명예의 전당: 기기 탭 '무한의 탑' 부문, 온라인 보드 tower:normal
  await page.evaluate(() => window.__game.go('highscore', { mode: 'tower', src: 'device' }, { fade: false }));
  await waitTop(page, 'highscore');
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => { const g = window.__game; return g.top.tabs.index; }), await page.evaluate(async () => (await import('/src/scenes/front/common.js')).MODES.findIndex((m) => m.id === 'tower')));
  await shot(page, 'hall_device');
  await page.evaluate(() => window.__game.go('highscore', { src: 'online', board: 'tower:normal' }, { fade: false }));
  await waitTop(page, 'highscore');
  await page.waitForFunction(() => window.__game.top.ob?.state === 'ready', null, { timeout: 10000 });
  assert.ok(M.log.some((r) => r.method === 'GET' && r.path === '/api/boards/tower:normal'), 'GET 보드');
  const hs = await page.evaluate(() => { const t = window.__game.top; return { sel: t.sel.kind, rec: t.recText(t.ob.data.entries[0]), me: t.recText(t.ob.data.me) }; });
  assert.deepEqual(hs, { sel: 'tower', rec: '30층 · 10:00.00', me: '29층 · 10:05.00' });
  await page.waitForTimeout(300);
  await shot(page, 'hall_online');
  // 클라우드 메타 합치기: 난이도별로 더 높은 층 (같으면 빠른 쪽)
  const merged = await page.evaluate(() => import('/src/core/cloud.js').then((C) => C.mergeMeta(
    { towerBest: { normal: { floor: 5, time: 100 }, easy: { floor: 3, time: 90 } } },
    { towerBest: { normal: { floor: 7, time: 300 }, easy: { floor: 3, time: 80 }, hard: { floor: 2, time: 50 } } }).towerBest));
  assert.deepEqual(Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, [v.floor, v.time]])), { normal: [7, 300], easy: [3, 80], hard: [2, 50] });
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 시즌 2 (데스크톱): 변이 · 상인 · 피의 길 · 계약 ─────────────────────────
/** 페이지 안 도우미 (고정 스텝): window.__S2 */
function installS2(page) {
  return page.evaluate(async () => {
    const g = window.__game, TW = await import('/src/data/tower.js'), { isSolidType } = await import('/src/core/physics.js');
    const T = () => g.scenes.find((s) => s.name === 'tower');
    const step = (n = 1) => { for (let i = 0; i < n; i++) { try { g.input?.pollFrame?.(); } catch { /* */ } g.tick(1 / 60); } g.render?.(); };
    const until = (pred, max = 600, what = '') => { for (let i = 0; i <= max; i++) { if (pred()) return i; step(1); } throw new Error(`${what || pred} — ${max} 스텝 안에 안 됨 (phase ${T()?.phase}, top ${g.top?.name})`); };
    const foes = () => T().world.enemies().filter((e) => e.kind === 'enemy');
    const fight = (f, mut) => { const t = T(); t.debugFloor(f, { mut }); until(() => t.phase === 'fight', 240, `${f}층 전투`); step(2); return t; };
    const kill = (e) => { const w = T().world; e.dead = true; w.onEnemyKilled(e, null); };
    const inWall = (e) => {
      const m = T().world.map;
      if (e.def?.flying) return false;
      for (let x = e.x + 4; x <= e.x + e.w - 4; x += 8) for (let y = e.y + 4; y <= e.y + e.h - 4; y += 8) if (isSolidType(m.typeAt(Math.floor(x / 48), Math.floor(y / 48)))) return true;
      return false;
    };
    // 다른 적은 방 저쪽 끝으로 (위험물 시험 동안 영웅을 건드리지 않게)
    const away = (keep = []) => { const t = T(), p = t.world.player, W = t.world.map.pxW; for (const e of foes()) if (!keep.includes(e)) { e.x = p.cx < W / 2 ? W - 60 - e.w : 60; e.vx = 0; } };
    const p = T().world.player;
    window.__hz = [];
    if (!p._s2wrap) {
      const o = p.takeHit.bind(p);
      p._s2wrap = true;
      p.takeHit = function s2Hit(dmg, atk, ...r) { if (atk?.flat === 1 && atk?.kb?.[1] === -400) window.__hz.push({ dmg, invuln: !!this.invuln }); return o(dmg, atk, ...r); };
    }
    window.__S2 = { g, TW, T, step, until, foes, fight, kill, inWall, away };
    return true;
  });
}

test('시즌 2: 변이 10종 효과 · 알림 카드 · 분열 상한 · 폭발/낙뢰 예고와 피해 · 상인(골드 모자람/사기/다시 뽑기/떠나기) · 피의 길 · 계약 6종 · 결과 줄', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH });
  await page.evaluate(() => import('/src/scenes/front/arcade.js').then((A) => A.startArcade(window.__game, { kind: 'tower', diff: 'normal', preset: 3, seed: 4242 }, 'kael')));
  await waitTop(page, 'tower', 30000);
  await freeze(page);
  await installS2(page);

  // ── 변이: 기준 층(7층, 변이 없음)과 같은 층에 변이를 덮어 비교 ──
  const mut = await page.evaluate(() => {
    const { T, TW, step, fight, foes, inWall } = window.__S2, t = T(), w = t.world, p = w.player;
    p.buffs.invincible = 9999;
    const snap = () => foes().map((e) => ({ id: e.def.id, hp: e.stats.maxHp, atk: e.stats.atk, elite: !!e.elite, eliteOk: e.def.elite !== false, scale: e.scale || 1, wall: inWall(e) }));
    fight(7, null);
    const base = { foes: snap(), gold: w.diff.gold, eAtk: w.diff.enemyAtk, heroAtk: p.stats.atk, dark: !!w.rules?.dark, card: t.mutCard };
    const out = { base, plan: t.plan.enemies.length };
    for (const id of ['giant', 'elite', 'gold', 'fog', 'mad']) {
      t.debugFloor(7, { mut: id });
      const card = t.mutCard ? { id: t.mutCard.m.id, blood: t.mutCard.blood } : null;
      fight(7, id);
      out[id] = { card, foes: snap(), gold: w.diff.gold, eAtk: w.diff.enemyAtk, heroAtk: p.stats.atk, dark: !!w.rules?.dark, line: t.mut?.name };
    }
    // 변이 없는 층으로 돌아오면 안개·광기가 풀린다
    fight(7, null);
    out.after = { dark: !!w.rules?.dark, heroAtk: p.stats.atk, eAtk: w.diff.enemyAtk };
    // 카드는 3.4초 뒤 사라진다
    t.debugFloor(6, { mut: 'gold' });
    out.cardT0 = !!t.mutCard; step(Math.ceil(3.5 * 60)); out.cardT1 = !!t.mutCard;
    out.cap8 = TW.TOWER_CURVE.count(8);
    return out;
  });
  const { base } = mut;
  assert.ok(base.foes.length >= 5 && base.card === null, `기준 층 ${JSON.stringify(base).slice(0, 200)}`);
  assert.deepEqual(mut.giant.card, { id: 'giant', blood: false }, '층 시작 알림 카드');
  const near = (a, b, e) => Math.abs(a - b) <= e;
  // 거인: 절반(최소 3) · 체력 ×2.4 · 공격 ×1.25 · 키 ×1.4 (머리 위가 막히면 들어가는 만큼만) · 벽에 박히지 않는다
  assert.equal(mut.giant.foes.length, Math.max(3, Math.ceil(base.foes.length * 0.5)), '거인의 층 적 수');
  mut.giant.foes.forEach((e, i) => {
    assert.equal(e.id, base.foes[i].id);
    assert.ok(near(e.hp, base.foes[i].hp * 2.4, 1), `거인 체력 ${base.foes[i].hp} → ${e.hp}`);
    assert.ok(near(e.atk, base.foes[i].atk * 1.25, 1), `거인 공격 ${base.foes[i].atk} → ${e.atk}`);
    assert.ok(e.scale >= 1 && e.scale <= 1.4 + 1e-9, `거인 크기 ${e.scale}`);
    assert.equal(e.wall, false, `거인 ${e.id} 이 벽에 박힘`);
  });
  assert.ok(mut.giant.foes.some((e) => e.scale > 1.2), '거인: 하나 이상은 크게');
  // 정예 무리: 60 %(최소 3) · 모두 정예
  assert.equal(mut.elite.foes.length, Math.max(3, Math.ceil(base.foes.length * 0.6)));
  assert.ok(mut.elite.foes.every((e) => e.elite || !e.eliteOk), '정예 무리 = 모두 정예');
  // 황금 층: 골드 ×3 · 안개: 어둠 규칙 · 광기: 적 공격 ×1.5 · 영웅 공격 ×1.5
  assert.ok(near(mut.gold.gold, base.gold * 3, 1e-9), `황금 층 골드 ${base.gold} → ${mut.gold.gold}`);
  assert.equal(mut.fog.dark, true, '피의 안개 = 어둠');
  assert.equal(base.dark, false);
  assert.ok(near(mut.mad.eAtk, base.eAtk * 1.5, 1e-9), '광기의 층 적 공격 배율');
  assert.ok(near(mut.mad.heroAtk, base.heroAtk * 1.5, 1), `광기의 층 영웅 공격 ${base.heroAtk} → ${mut.mad.heroAtk}`);
  mut.mad.foes.forEach((e, i) => assert.ok(near(e.atk, base.foes[i].atk * 1.5, 1.5), `광기 적 공격 ${base.foes[i].atk} → ${e.atk}`));
  assert.deepEqual(mut.after, { dark: false, heroAtk: base.heroAtk, eAtk: base.eAtk }, '변이 없는 층 = 원래대로');
  assert.deepEqual([mut.cardT0, mut.cardT1], [true, false], '알림 카드는 잠깐');

  // 분열: 쓰러진 적이 작은 둘로 (다시 갈라지지 않음) · 층마다 count(f) 까지 · 벽에 박히지 않는다
  const split = await page.evaluate(() => {
    const { T, step, fight, foes, kill, inWall } = window.__S2, t = fight(8, 'split');
    const orig = foes();
    const parent = Object.fromEntries(orig.map((e) => [e.def.id, { hp: e.stats.maxHp, w: e.w, elite: !!e.elite }]));
    for (const e of orig) { kill(e); step(1); }
    const kids = foes().filter((e) => e._towerSplit);
    const r = { n0: orig.length, kids: kids.length, splitN: t.splitN, small: kids.every((c) => Math.abs((c.scale || 1) - 0.7) < 1e-6 && c.w < parent[c.def.id].w), weak: kids.every((c) => parent[c.def.id].elite || c.stats.maxHp <= Math.ceil(parent[c.def.id].hp * 0.35) + 1), wall: kids.filter(inWall).length, elite: kids.filter((c) => c.elite).length };
    for (const c of kids) { kill(c); step(1); }
    r.after = foes().filter((e) => e._towerSplit).length; r.splitN2 = t.splitN;
    step(3);
    r.phase = t.phase;
    return r;
  });
  assert.equal(split.kids, Math.min(2 * split.n0, mut.cap8), `분열 수 ${JSON.stringify(split)}`);
  assert.ok(split.splitN <= mut.cap8 && split.splitN === split.kids, `분열 상한 count(8)=${mut.cap8}`);
  assert.ok(split.small && split.weak && split.elite === 0 && split.wall === 0, `분열 조각 ${JSON.stringify(split)}`);
  assert.deepEqual([split.after, split.splitN2, split.phase], [0, split.splitN, 'clear'], '조각은 다시 갈라지지 않고, 다 잡으면 층 돌파');

  // 폭발하는 시체: 0.6초 넘게 붉은 원 → 안이면 최대 체력 8 % · 밖이면 없음
  const bomb = await page.evaluate(() => {
    const { T, step, fight, foes, kill, away } = window.__S2, t = fight(9, 'bomb'), w = t.world, p = w.player;
    p.buffs.invincible = 0;
    const [a, b] = foes();
    away([a, b]);
    window.__hz = [];
    a.x = p.cx - a.w / 2; a.y = p.bottom - a.h;
    kill(a);
    const hz = w.entities.find((x) => x.hz === 'bomb' && !x.dead);
    const r = { warn: hz?.warn, early: null, hits: [] };
    step(Math.floor(0.55 * 60)); r.early = hz.hit;
    for (let i = 0; i < 40 && !hz.hit; i++) { p.iframes = 0; p.buffs.invincible = 0; step(1); }
    r.hits = window.__hz.map((h) => h.dmg); r.want = Math.ceil(p.stats.hp * 0.08);
    // 멀리서 터지면 맞지 않는다
    window.__hz = [];
    b.x = p.cx + 600 < w.map.pxW - 60 ? p.cx + 600 : p.cx - 600 - b.w;
    kill(b);
    const hz2 = w.entities.find((x) => x.hz === 'bomb' && !x.dead && x !== hz);
    for (let i = 0; i < 80 && hz2 && !hz2.hit; i++) { p.iframes = 0; step(1); }
    r.far = window.__hz.length; r.hz2 = !!hz2;
    p.buffs.invincible = 9999;
    return r;
  });
  assert.ok(bomb.warn >= 0.6 && bomb.early === false, `폭발 예고 ${JSON.stringify(bomb)}`);
  assert.deepEqual(bomb.hits, [bomb.want], `폭발 피해 ${JSON.stringify(bomb)}`);
  assert.ok(bomb.hz2 && bomb.far === 0, `멀리서 터진 시체 ${JSON.stringify(bomb)}`);

  // 낙뢰: 2.4초마다 영웅 곁(±90px)에 표식 0.6초 넘게 → 기둥 안 영웅·적이 맞는다
  const bolt = await page.evaluate(() => {
    const { T, step, until, fight, foes, away } = window.__S2, t = fight(11, 'bolt'), w = t.world, p = w.player;
    p.buffs.invincible = 0;
    const e = foes()[0];
    away([e]);
    window.__hz = [];
    const n = until(() => w.entities.some((x) => x.hz === 'bolt' && !x.dead), 200, '낙뢰');
    const hz = w.entities.find((x) => x.hz === 'bolt' && !x.dead);
    const r = { n, dx: Math.abs(hz.fx0 - p.cx), warn: hz.warn };
    // 첫 벼락: 영웅이 기둥 안 (적은 멀리)
    const px = hz.fx0 - p.w / 2;
    p.x = px; p.vx = 0;
    step(Math.floor(0.5 * 60)); r.early = hz.hit;
    for (let i = 0; i < 40 && !hz.hit; i++) { p.iframes = 0; p.buffs.invincible = 0; p.x = px; p.vx = 0; step(1); }
    r.hits = window.__hz.map((h) => h.dmg); r.want = Math.ceil(p.stats.hp * 0.1);
    // 다음 벼락: 기둥 안의 적이 맞는다 (영웅은 무적)
    p.buffs.invincible = 9999;
    until(() => w.entities.some((x) => x.hz === 'bolt' && !x.dead && x !== hz && !x.hit), 200, '다음 낙뢰');
    const hz2 = w.entities.find((x) => x.hz === 'bolt' && !x.dead && x !== hz);
    r.gap = hz2.t;
    e.invuln = false;
    const hp0 = e.hp;
    for (let i = 0; i < 70 && !hz2.hit; i++) { e.x = hz2.fx0 - e.w / 2; e.y = hz2.foot - e.h; e.vx = 0; e.vy = 0; step(1); }
    r.foeHit = e.hp < hp0 || e.dead || e.dying > 0;
    return r;
  });
  assert.ok(bolt.n <= Math.ceil(2.4 * 60) + 2 && bolt.dx <= 90 + 1 && bolt.warn >= 0.6 && bolt.early === false, `낙뢰 ${JSON.stringify(bolt)}`);
  assert.deepEqual(bolt.hits, [bolt.want], `낙뢰 피해 ${JSON.stringify(bolt)}`);
  assert.ok(bolt.foeHit, '낙뢰가 기둥 안의 적도 친다');

  // 흡혈의 밤: 처치하면 4 % 회복 · 체력이 서서히 마르되 25 % 아래로는 아니다
  const vamp = await page.evaluate(() => {
    const { T, step, fight, foes, kill } = window.__S2, t = fight(12, 'vamp'), w = t.world, p = w.player, max = p.stats.hp;
    p.buffs.invincible = 9999;
    p.hp = Math.round(max * 0.5);
    const h0 = p.hp; kill(foes()[0]); const h1 = p.hp;
    p.hp = max * 0.3; step(120); const h2 = p.hp; step(360); const h3 = p.hp;
    return { max, heal: (h1 - h0) / max, drop: (max * 0.3 - h2) / max, floor: h3 / max };
  });
  assert.ok(vamp.heal >= 0.035, `흡혈 회복 ${JSON.stringify(vamp)}`);
  assert.ok(vamp.drop > 0.015 && vamp.drop < 0.035, `흡혈의 밤 마름 ${JSON.stringify(vamp)}`);
  assert.ok(vamp.floor >= 0.25 - 1e-6 && vamp.floor < 0.27, `마름 바닥 25 % ${JSON.stringify(vamp)}`);

  // 속공: 30초 안에 돌파 → 축복 하나 · 30초를 넘기면 없음
  const rush = await page.evaluate(() => {
    const { g, T, step, until, fight } = window.__S2;
    let t = fight(13, 'rush');
    t.debugKillAll();
    until(() => g.top.name === 'towerBlessing' || t.phase === 'gate', 300, '속공 축복');
    const fast = { top: g.top.name, mode: g.top.mode, ok: t.rushOk };
    if (g.top.name === 'towerBlessing') { g.top.choose(0); until(() => g.top.name === 'tower' && t.phase === 'gate', 120, '속공 → 출구'); }
    t = fight(14, 'rush');
    t.fightT = 31;
    t.debugKillAll();
    let blessed = false;
    until(() => { blessed ||= g.top.name === 'towerBlessing'; return t.phase === 'gate' || blessed; }, 300, '느린 속공');
    return { fast, slow: { ok: t.rushOk, blessed } };
  });
  assert.deepEqual(rush.fast, { top: 'towerBlessing', mode: 'bless', ok: true }, '속공 성공 → 축복');
  assert.deepEqual(rush.slow, { ok: false, blessed: false }, '30초를 넘긴 속공 → 축복 없음');

  // ── 상인 (15층 보스 뒤): 축복 → 로크 → 골드가 모자라면 그대로 · 사기 · 한 장만 · 다시 뽑기 · 떠나기 → 갈림길 ──
  await page.evaluate(() => window.__S2.T().debugFloor(15));
  await tickUntil(page, "t.phase === 'boss' && w.boss", 300, '15층 보스');
  await page.evaluate(() => window.__game.world.bossReady());
  await tickUntil(page, "g.top.name === 'tower' && !w.cutscene", 600, '보스 등장 연출 끝');
  await page.evaluate(() => window.__S2.T().debugKillAll());
  await tickUntil(page, "g.top.name === 'towerBlessing'", 400, '보스 격파 → 축복');
  await page.evaluate(() => window.__game.top.choose(0));
  await tickUntil(page, "g.top.name === 'towerBlessing' && g.top.mode === 'shop'", 200, '축복 → 상인');
  const shop = await page.evaluate(() => {
    const { g, T, step } = window.__S2, t = T(), p = t.world.player, st = g.state, top = g.top, nc = top.ids.length;
    const npc = t.world.entities.find((e) => e.pseudo?.npcId === 'npc_rook');
    const r = { nc, npc: !!npc, npcId: npc?.pseudo?.npcId, look: !!npc?.pseudo?.look, prices: { heal: t.shopPrice('heal'), bless: t.shopPrice('bless'), reroll: t.shopPrice('reroll') }, level: t.plan.level };
    st.gold = 0; p.hp = Math.round(p.stats.hp * 0.5);
    const hp0 = p.hp;
    top.choose(nc);   // 상처 치료 — 골드 0
    r.poor = { msg: top.msg?.text, gold: st.gold, hp: p.hp === hp0 };
    st.gold = 100000;
    top.choose(nc); r.heal = { gold: 100000 - st.gold, hp: p.hp > hp0 };
    const id0 = top.ids[0], n0 = t.taken[id0] | 0, g1 = st.gold;
    top.choose(0); r.buy = { gold: g1 - st.gold, took: (t.taken[id0] | 0) - n0, bought: t.shop.bought === id0 };
    const g2 = st.gold;
    top.choose(1); r.second = { msg: top.msg?.text, gold: g2 - st.gold };
    const ids0 = [...top.ids];
    top.choose(nc + 1); r.reroll = { gold: g2 - st.gold, bought: t.shop.bought, changed: JSON.stringify(ids0) !== JSON.stringify(top.ids), n: top.ids.length };
    step(10);
    top.choose(nc + 2);   // 떠나기
    step(2);
    r.after = { top: g.top.name, phase: t.phase, gates: t.gates.map((x) => x.route), leaving: !!npc?.leaving };
    step(30);
    r.npcGone = !t.world.entities.includes(npc);
    return r;
  });
  assert.ok(shop.npc && shop.npcId === 'npc_rook' && shop.look, '상인 = 로크 퍼펫');
  assert.equal(shop.nc, 3);
  const TWn = await import(path.join(ROOT, 'src/data/tower.js'));
  assert.deepEqual(shop.prices, { heal: TWn.merchantPrice(30, shop.level), bless: TWn.merchantPrice(70, shop.level), reroll: TWn.merchantPrice(20, shop.level) });
  assert.deepEqual(shop.poor, { msg: `골드가 모자랍니다 (${shop.prices.heal.toLocaleString('en-US')}G 필요)`, gold: 0, hp: true }, `골드 모자람 ${JSON.stringify(shop.poor)}`);
  assert.deepEqual(shop.heal, { gold: shop.prices.heal, hp: true });
  assert.deepEqual(shop.buy, { gold: shop.prices.bless, took: 1, bought: true });
  assert.deepEqual(shop.second, { msg: '이 카드 중에서는 한 장만 살 수 있습니다', gold: 0 });
  assert.deepEqual(shop.reroll, { gold: shop.prices.reroll, bought: null, changed: true, n: 3 });
  assert.deepEqual(shop.after, { top: 'tower', phase: 'gate', gates: ['safe', 'blood'], leaving: true });
  assert.equal(shop.npcGone, true);

  // ── 피의 길: 붉은 문 위에 서면 다음 전투 층 넷이 센 변이 · 보너스 ×2 · 골드 ×2 · 정예 +0.15, 다음 안식처에서 축복 둘 ──
  const plan16 = await planOf(page, 16);
  const baseDiff16 = await page.evaluate(async () => { const TW = window.__S2.TW, t = window.__S2.T(); return TW.towerDiff(t.baseDiff, 16); });
  await page.evaluate(() => { const t = window.__S2.T(), p = t.world.player, bg = t.gates[1]; p.x = bg.cx - p.w / 2; p.y = bg.bottom - p.h; p.vx = 0; p.vy = 0; });
  // [play-fix #3] 옮겨 놓기만으로는 고르지 않는다 (사람 입력이 없다) → 붉은 문 위에서 ▲ (사람 키)
  await ticks(page, 120);
  assert.equal(await page.evaluate(() => window.__S2.T().floor), 15, '문 위로 옮겨 놓기만으로는 떠나지 않는다');
  await key(page, 'ArrowUp');
  await tickUntil(page, "t.floor === 16 && t.phase === 'enter'", 400, '피의 길 → 16층');
  const blood = await page.evaluate(() => {
    const { T, step, until } = window.__S2, t = T(), w = t.world;
    const r = { route: t.route, bloodFloor: t.bloodFloor, left: t.blood, runs: t.bloodRuns, mut: t.mut?.id, card: t.mutCard?.blood, gold: w.diff.gold, elite: w.diff.elite };
    until(() => t.phase === 'fight', 240, '16층 전투');
    let s0 = 0;   // 분열 조각까지 다 쓰러뜨린 뒤 한 스텝 = 층 돌파 (그 스텝에 오른 점수 = 돌파 보너스)
    for (let i = 0; i < 20 && t.phase === 'fight'; i++) { t.debugKillAll(); s0 = w.run.score; step(1); }
    r.phase = t.phase; r.bonus = w.run.score - s0; r.banner = w.banner?.sub;
    for (const f of [17, 18, 19]) { t.debugFloor(f); r[`b${f}`] = t.bloodFloor; }
    t.debugFloor(21); r.b21 = t.bloodFloor;
    return r;
  });
  assert.deepEqual({ route: blood.route, bloodFloor: blood.bloodFloor, left: blood.left, runs: blood.runs, card: blood.card }, { route: 'blood', bloodFloor: true, left: 3, runs: 1, card: true }, JSON.stringify(blood));
  assert.equal(blood.mut, plan16.mutBlood, '피의 길 변이 = 계획의 센 변이');
  assert.equal(TWn.MUTATOR[blood.mut].tier, 2);
  assert.ok(near(blood.gold, baseDiff16.gold * 2 * (TWn.MUTATOR[blood.mut].gold ?? 1), 1e-9), `피의 길 골드 ${baseDiff16.gold} → ${blood.gold}`);
  assert.ok(near(blood.elite, Math.min(0.9, (baseDiff16.elite ?? 0) + 0.15), 1e-9), `피의 길 정예 ${blood.elite}`);
  assert.equal(blood.bonus, 300 * 16 * 2, `피의 길 돌파 보너스 ×2 ${blood.bonus}`);
  assert.match(blood.banner, /피의 길 ×2/);
  assert.deepEqual([blood.b17, blood.b18, blood.b19, blood.b21], [true, true, true, false], '피의 길 = 전투 층 넷');
  // 20층 안식처: 축복 둘 (피의 길) → 피의 계약 → 거절
  await page.evaluate(() => { window.__S2.T().bloodBless = 1; window.__S2.T().debugFloor(20); });
  const rest20 = await page.evaluate(() => {
    const { g, T, until } = window.__S2, t = T();
    let blessings = 0;
    for (let k = 0; k < 4; k++) {
      until(() => g.top.name === 'towerBlessing', 400, '안식처 고르기');
      if (g.top.mode === 'pact') break;
      const cur = g.top;
      blessings++; cur.choose(0);
      until(() => g.top !== cur, 120, '축복 닫힘');
    }
    const pact = { mode: g.top.mode, ids: g.top.ids };
    g.top.choose(g.top.ids.length - 1);   // 거절
    until(() => g.top.name === 'tower' && t.phase === 'gate', 200, '거절 → 출구');
    return { blessings, pact, taken: t.pactOrder.length };
  });
  assert.equal(rest20.blessings, 2, `피의 길 뒤 안식처 = 축복 둘 ${JSON.stringify(rest20)}`);
  assert.equal(rest20.pact.mode, 'pact');
  assert.equal(rest20.pact.ids.at(-1), null);
  assert.equal(rest20.taken, 0);

  // ── 피의 계약 6종: 이득과 손해 ──
  const pacts = await page.evaluate(async () => {
    const { g, T, step, until, fight, foes } = window.__S2, inv = await import('/src/game/inventory.js');
    let t = fight(21, null);
    const w = t.world, p = w.player, st = g.state, s0 = { ...p.stats }, out = {};
    const took = (id) => { t.takePact(id); return { ...p.stats }; };
    let s = took('fury');
    const potion = inv.addByBase(st, 'c_potion', 1);
    const uid = potion?.uid ?? (st.inventory ?? []).find((i) => i.baseId === 'c_potion')?.uid;
    out.fury = { atk: s.atk / s0.atk, rules: w.rules?.noPotion === true, label: w.rules?.label, use: uid ? inv.useItem(st, st.heroes?.kael, uid, p) : null };
    const s1 = s; s = took('edge'); out.edge = { critDmg: s.critDmg - s1.critDmg, def: s.def / Math.max(1, s1.def) };
    const s2 = s; s = took('greed'); out.greed = { gold: s.goldBonus - s2.goldBonus };
    const s3 = s; s = took('thirst'); out.thirst = { ls: s.lifesteal - s3.lifesteal, mp: s.mp / s3.mp };
    const s4 = s; s = took('swift'); out.swift = { move: s.moveSpd - s4.moveSpd, atkSpd: s.atkSpd - s4.atkSpd };
    t = fight(22, null);
    out.swift.foes = foes().length - t.plan.enemies.length;
    // 탐욕의 계약: 안식처에서 회복하지 않는다 → 남은 계약은 맹세 하나 + 거절
    t.debugFloor(30); p.hp = Math.round(p.stats.hp * 0.4); const h0 = p.hp;
    until(() => t.phase === 'clear' && !!w.banner, 400, '30층 안식처 알림');
    out.greed.banner = w.banner?.sub;
    until(() => g.top.name === 'towerBlessing', 400, '30층 축복');
    out.greed.heal = (p.hp - h0) / p.stats.hp;   // 자연 회복(초당 몇)만 — 안식처 30 % 는 없다
    out.greed.bannerUnderCards = w.banner ?? null;   // [play-fix #17] 카드가 뜨면 큰 알림은 치운다 (카드 뒤로 비치지 않게)
    const picks0 = t.picks;
    g.top.choose(0);
    until(() => g.top.name === 'towerBlessing' && g.top.mode === 'pact', 200, '30층 계약');
    out.offer = [...g.top.ids];
    g.top.choose(0);   // 맹세의 계약 → 지금 축복 하나 더
    until(() => g.top.name === 'towerBlessing' && g.top.mode === 'bless', 200, '맹세 → 축복 하나 더');
    g.top.choose(0);
    until(() => g.top.name === 'tower' && t.phase === 'gate', 200, '30층 → 출구');
    out.oath = { picks: t.picks - picks0, mul: t.bossHpMul };
    const bh = w.diff.bossHp;
    t.debugFloor(35);
    out.oath.boss = { hp: w.diff.bossHp, oathHp: t.oathHp, mul: t.bossHpMul };
    out.order = [...t.pactOrder];
    return out;
  });
  assert.ok(near(pacts.fury.atk, 1.4, 0.02) && pacts.fury.rules && pacts.fury.label === '광기의 계약', `광기의 계약 ${JSON.stringify(pacts.fury)}`);
  assert.ok(pacts.fury.use && pacts.fury.use.ok === false && pacts.fury.use.msg.startsWith('광기의 계약'), `광기의 계약 = 물약 금지 ${JSON.stringify(pacts.fury.use)}`);
  assert.ok(pacts.edge.critDmg === 80 && near(pacts.edge.def, 0.5, 0.06), `칼날의 계약 ${JSON.stringify(pacts.edge)}`);
  assert.equal(pacts.greed.gold, 100);
  assert.ok(near(pacts.thirst.ls, 5, 1e-9) && near(pacts.thirst.mp, 0.5, 0.02), `갈증의 계약 ${JSON.stringify(pacts.thirst)}`);
  assert.ok(near(pacts.swift.move, 20, 1e-9) && near(pacts.swift.atkSpd, 20, 1e-9) && pacts.swift.foes === 3, `질주의 계약 ${JSON.stringify(pacts.swift)}`);
  assert.ok(pacts.greed.heal < 0.03, `탐욕의 계약 = 안식처 회복(30 %) 없음 ${pacts.greed.heal}`);
  assert.match(pacts.greed.banner, /탐욕의 계약/);
  assert.equal(pacts.greed.bannerUnderCards, null, '축복 카드 뒤에 안식처 알림이 남지 않는다');
  assert.deepEqual(pacts.offer, ['oath', null], '맺은 계약은 다시 나오지 않는다');
  assert.equal(pacts.oath.picks, 2, '맹세의 계약 = 축복 하나 더');
  assert.equal(pacts.oath.mul, 1.5);
  assert.ok(pacts.oath.boss.oathHp === 1.5 && pacts.oath.boss.mul === 1, `맹세 → 다음 군주 체력 ×1.5 (한 번) ${JSON.stringify(pacts.oath)}`);
  assert.deepEqual(pacts.order, ['fury', 'edge', 'greed', 'thirst', 'swift', 'oath']);
  const bossHp35 = await page.evaluate(async () => { const TW = window.__S2.TW, t = window.__S2.T(); return { now: t.world.diff.bossHp, base: TW.towerDiff(t.baseDiff, 35).bossHp }; });
  assert.ok(near(bossHp35.now, bossHp35.base * 1.5, 1e-9), `35층 군주 체력 ${JSON.stringify(bossHp35)}`);

  // ── 결과: '시즌 2' 줄 · extra.v / pacts / blood ──
  await tickUntil(page, "t.phase === 'boss' && w.boss", 300, '35층 보스');
  await page.evaluate(() => window.__game.world.bossReady());
  await tickUntil(page, "g.top.name === 'tower' && !w.cutscene", 600, '35층 보스 연출 끝');
  const fin = await page.evaluate(() => {
    const { g, T, until } = window.__S2, t = T(), w = t.world, p = w.player;
    p.buffs.invincible = 0; p.iframes = 0; p.hp = 1; t.reviveLeft = 0;
    p.takeHit(999999, { team: 'enemy', dir: 1, kb: [100, -200] }, w, {});
    until(() => g.top.name === 'arcadeResults', 900, '결과');
    const r = g.top.res;
    return { row: r.rows.find((x) => x[0] === '시즌 2')?.[1], v: r.extra.v, pacts: r.extra.pacts, blood: r.extra.blood };
  });
  // 이정표: 이 기기에서 처음 넘은 20·30층 안식처 → 잔상 「은빛」「혹한」 (결과 줄 + extra.milestones)
  assert.deepEqual(fin, { row: '피의 길 1번 · 맺은 계약 6개 · 새 잔상 「은빛」「혹한」', v: 2, pacts: pacts.order, blood: 1 }, `결과 ${JSON.stringify(fin)}`);   // [play-fix #22]
  assert.deepEqual(await page.evaluate(() => window.__game.top.res.extra.milestones), ['tr_silver', 'tr_frost']);
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── [play-fix] Fold 리플레이 #16 · #17 · #18 · #19 ─────────────────────────
// #16 HUD 이름판 = 「무한의 탑 · 제 n층」 (전투 · 군주 · 안식처 층 모두 — 예전엔 방을 빌려 온 스테이지의 「n장」, 보스 층은 「제 n층」만)
// #17 축복 카드가 떠 있으면 위 가운데 층 이름 · 시계(modeTag)를 그리지 않고 'BOSS DOWN!' 큰 알림도 치운다 → 카드를 고르면 다시 그린다
// #18 탑 전용 가시: 한 번 닿으면 최대 체력 12 % 한 번 · 마지막으로 딛고 선 땅(p.safeSpot)으로 · 짧은 무적 (그 사이 다시 맞지 않는다) — 이야기 스테이지 Player 는 그대로
// #19 출구 자리: 영웅이 물속 · 공중이면 걸어서 닿는 가장 가까운 마른 땅 (벽 · 기둥 너머 · 방 시작 자리로 가지 않는다) — 합성 지도 + 실제 층
test('play-fix: HUD 「무한의 탑 · 제 n층」 · 축복 카드 뒤 시계/알림 숨김 · 가시 = 피해 한 번 + 안전한 땅 · 출구는 닿는 마른 땅', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH });
  await page.evaluate(() => import('/src/scenes/front/arcade.js').then((A) => A.startArcade(window.__game, { kind: 'tower', diff: 'normal', preset: 3, seed: 4242 }, 'kael')));
  await waitTop(page, 'tower', 30000);
  await freeze(page);
  await installS2(page);
  // #16
  const labels = await page.evaluate(async () => {
    const { T, until } = window.__S2, { chapterLabel } = await import('/src/data/stages.js'), t = T(), out = [];
    for (const f of [2, 5, 10, 13]) {
      t.debugFloor(f, { mut: null });
      const st = t.world.stage, cl = chapterLabel(st, 'num');
      out.push({ f, kind: t.kind, plate: `${cl ? cl + ' · ' : ''}${st.name}` });
    }
    return out;
  });
  for (const L of labels) assert.equal(L.plate, `무한의 탑 · 제 ${L.f}층`, JSON.stringify(labels));
  assert.deepEqual(labels.map((L) => L.kind), ['combat', 'boss', 'rest', 'combat'], JSON.stringify(labels));
  // #17
  await page.evaluate(() => {
    const { T, until } = window.__S2, t = T(), w = t.world;
    w.player.buffs.invincible = 9999;
    t.debugFloor(5, { mut: null });
    until(() => t.phase === 'boss' && w.boss, 300, '5층 보스');
  });
  await page.evaluate(() => window.__game.world.bossReady());
  const cards = await page.evaluate(() => {
    const { g, T, until } = window.__S2, t = T(), w = t.world;
    until(() => g.top.name === 'tower' && !w.cutscene, 600, '보스 등장 연출 끝');
    t.debugKillAll();
    let seen = false;
    until(() => { seen ||= w.banner?.text === 'BOSS DOWN!'; return g.top.name === 'towerBlessing'; }, 1200, '축복 카드');
    if (!seen) throw new Error('BOSS DOWN 알림이 카드 전에 나오지 않음');
    let tags = 0; const mt = t.modeTag; t.modeTag = function (...a) { tags++; return mt.apply(this, a); };
    g.render();
    const under = { banner: w.banner ?? null, tags };
    g.top.choose(0);
    until(() => g.top.name === 'tower' && t.phase === 'gate', 200, '축복 → 갈림길');
    tags = 0; g.render();
    const after = { tags, top: g.top.name };
    t.modeTag = mt;
    return { under, after };
  });
  assert.deepEqual(cards.under, { banner: null, tags: 0 }, `카드 뒤 ${JSON.stringify(cards)}`);
  assert.equal(cards.after.tags, 1, `카드를 닫으면 층 이름 · 시계를 다시 그린다 ${JSON.stringify(cards)}`);
  // #18 가시 — 가시(^)가 있는 전투 층을 계획에서 찾아 그 방으로
  const spike = await page.evaluate(async () => {
    const { T, until, step } = window.__S2, t = T(), TW = window.__S2.TW, { STAGES } = await import('/src/data/stages.js'), { T: TT } = await import('/src/core/physics.js');
    let f0 = 0;
    for (let f = 6; f <= 80 && !f0; f++) { const pl = t.planner.plan(f); if (pl.kind === 'combat' && TW.towerRoom(STAGES, pl.sid, pl.rid).room.map.some((r) => r.includes('^'))) f0 = f; }
    if (!f0) return { f0 };
    t.debugFloor(f0, { mut: null });
    until(() => t.phase === 'fight', 240, '가시 층 전투');
    const w = t.world, p = w.player, m = w.map;
    for (const e of w.enemies()) { e.dead = true; }   // 적 없이 가시만
    p.buffs.invincible = 0; p.iframes = 0;
    until(() => p.onGround && p.safeSpot?.roomId === w.roomId, 240, '디딘 땅');
    const safe = { x: Math.round(p.safeSpot.x), y: Math.round(p.safeSpot.y) };
    // 가시 칸 찾기 (위가 빈 칸)
    let sx = -1, sy = -1;
    for (let ty = 1; ty < m.h && sx < 0; ty++) for (let tx = 1; tx < m.w - 1; tx++) if (m.typeAt(tx, ty) === TT.SPIKE && m.typeAt(tx, ty - 1) !== TT.SOLID) { sx = tx; sy = ty; break; }
    const hp0 = p.hp, max = p.stats.hp, hits = [];
    const o = p.takeHit; p.takeHit = function (d, a, ...r) { const h = this.hp; const res = o.call(this, d, a, ...r); if (this.hp < h) hits.push(h - this.hp); return res; };
    p.x = sx * 48 + 24 - p.w / 2; p.y = sy * 48 - p.h + 8; p.vx = 0; p.vy = 0;
    step(1);
    const after1 = { x: Math.round(p.x), y: Math.round(p.y), iframes: +(p.iframes ?? 0).toFixed(2), resets: t.spikeResets ?? 0 };
    step(50);   // 무적 동안 다시 맞지 않는다 (가시 위로 다시 옮겨도)
    p.x = sx * 48 + 24 - p.w / 2; p.y = sy * 48 - p.h + 8; step(2);
    p.takeHit = o;
    return { f0, spikeAt: [sx, sy], safe, after1, hits, pct: hits.map((d) => +(d / max * 100).toFixed(1)), dead: p.dead, hp: p.hp, hp0, own: Object.hasOwn(p, 'takeHit') };
  });
  assert.ok(spike.f0 > 0, `가시 층을 찾지 못함 ${JSON.stringify(spike)}`);
  assert.equal(spike.hits.length, 1, `가시 = 피해 한 번 (무적 동안 다시 맞지 않는다) ${JSON.stringify(spike)}`);
  assert.ok(Math.abs(spike.pct[0] - 12) <= 0.6, `가시 피해 = 최대 체력 12 % ${JSON.stringify(spike)}`);
  assert.deepEqual([spike.after1.x, spike.after1.y], [spike.safe.x, spike.safe.y], `가시 → 마지막으로 딛고 선 땅 ${JSON.stringify(spike)}`);
  assert.ok(spike.after1.iframes >= 1 && spike.after1.resets === 1 && !spike.dead && spike.own, JSON.stringify(spike));
  const story = await page.evaluate(async () => { const { Player } = await import('/src/game/player.js'); return Player.prototype.takeHit.name; });
  assert.notEqual(story, 'towerHit', '이야기 스테이지의 Player.takeHit 는 그대로 (탑 장면이 영웅 하나만 감싼다)');
  // #19 출구 자리 — ① 합성 지도: 물웅덩이 속 영웅, 왼쪽은 천장까지 닿는 기둥(그 너머가 방 시작), 오른쪽에 마른 땅
  const synth = await page.evaluate(async () => {
    const { TowerScene } = await import('/src/scenes/front/arcade_tower.js'), { T: TT } = await import('/src/core/physics.js');
    const W = 32, H = 12, grid = Array.from({ length: H }, () => Array(W).fill(TT.EMPTY));
    for (let x = 0; x < W; x++) grid[11][x] = TT.SOLID;
    for (let y = 0; y < H; y++) { grid[y][0] = TT.SOLID; grid[y][W - 1] = TT.SOLID; grid[y][12] = TT.SOLID; }   // 기둥 (천장까지)
    for (let x = 13; x <= 22; x++) for (const y of [9, 10]) grid[y][x] = TT.LIQUID;   // 물웅덩이 (기둥에 붙어 있다)
    const map = { w: W, h: H, typeAt: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? TT.SOLID : grid[y][x]) };
    const fake = { world: { map } };
    const swim = TowerScene.prototype.reachableSpot.call(fake, { cx: 18.5 * 48, bottom: 10.6 * 48, h: 88 });
    const air = TowerScene.prototype.reachableSpot.call(fake, { cx: 5.5 * 48, bottom: 7 * 48, h: 88 });   // 기둥 왼쪽 공중
    return { swim: swim && { tx: Math.floor(swim.cx / 48), b: swim.bottom / 48 }, air: air && { tx: Math.floor(air.cx / 48), b: air.bottom / 48 } };
  });
  assert.deepEqual(synth.swim, { tx: 23, b: 11 }, `물속 → 웅덩이 오른쪽 마른 땅 (기둥 너머 · 방 시작이 아니다) ${JSON.stringify(synth)}`);
  assert.deepEqual(synth.air, { tx: 5, b: 11 }, `공중 → 바로 아래 땅 ${JSON.stringify(synth)}`);
  // ② 실제 층: 마지막 처치 때 영웅이 공중 (방 시작에서 먼 곳) → 문은 영웅 곁 단단한 땅 (방 시작 자리가 아니다)
  const real = await page.evaluate(() => {
    const { T, until, step } = window.__S2, t = T();
    t.debugFloor(7, { mut: null });
    until(() => t.phase === 'fight', 240, '7층 전투');
    const w = t.world, p = w.player, m = w.map;
    for (const e of w.enemies()) e.dead = true;
    step(2);
    if (t.gate) { t.gate.dead = true; t.gate = null; }
    const cp = w.run.checkpoint;
    // 방 시작에서 10칸 넘게 떨어진, 발밑이 단단한 칸 위 3칸 공중
    let tx = -1, gy = -1;
    for (let x = 2; x < m.w - 2 && tx < 0; x++) {
      if (Math.abs(x * 48 - cp.x) < 10 * 48) continue;
      for (let y = 3; y < m.h - 1; y++) if (m.typeAt(x, y) === 1 && m.typeAt(x, y - 1) === 0 && m.typeAt(x, y - 2) === 0 && m.typeAt(x, y - 3) === 0 && m.typeAt(x, y - 4) === 0) { tx = x; gy = y; break; }
    }
    p.x = tx * 48 + 24 - p.w / 2; p.y = (gy - 3) * 48 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
    t.phase = 'clear'; t.openGate();
    const g0 = t.gate;
    return { tx, gy, cpx: Math.round(cp.x), gate: g0 && { tx: Math.floor(g0.cx / 48), bottom: g0.bottom / 48, below: m.typeAt(Math.floor(g0.cx / 48), Math.round(g0.bottom / 48)) } };
  });
  assert.ok(real.tx > 0 && real.gate, JSON.stringify(real));
  assert.ok(Math.abs(real.gate.tx - real.tx) <= 4 && real.gate.below === 1 && Math.abs(real.gate.tx * 48 - real.cpx) > 6 * 48, `공중 처치 → 곁의 단단한 땅 (방 시작 아님) ${JSON.stringify(real)}`);
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 욕심 판 (BLOCKER) ─────────────────────────
// 지옥 난이도 · 매 갈림길 피의 길 · 변이 10종을 돌아가며(황금 층 포함) · 이득 큰 계약부터 · 상인에서 축복 사기 · 콤보 999 · 적은 나오자마자 전멸 ·
// 출구는 열리자마자. 층마다 오른 점수 ≤ maxScorePerFloor, 층마다 걸린 시간 ≥ minFloorSec (실제 gamedata.mts 값),
// 결과는 실제 서버 처리기(api.mts — checkResult)가 받아야 한다
test('욕심 판 (BLOCKER): 피의 길 매번 · 황금 층 · 좋은 계약 → 층 점수 ≤ maxScorePerFloor · 층 시간 ≥ minFloorSec · 실제 서버가 받는다', async () => {
  const R = await realApi();
  const RULES = R.gd.TOWER_RULES;
  const T = await import(path.join(ROOT, 'src/data/tower.js'));
  assert.deepEqual({ ...RULES }, { ...T.TOWER_RULES }, '클라이언트 규칙 = 서버 규칙');
  const u = await R.signup('greedy01');
  const M = makeMock();
  M.real = R;
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: { bn_auth: JSON.stringify(u) }, initScripts: [fakePadInit({ connected: true })] });
  await page.evaluate(() => import('/src/scenes/front/arcade.js').then((A) => A.startArcade(window.__game, { kind: 'tower', diff: 'inferno', preset: 3, seed: 90210 }, 'kael')));
  await waitTop(page, 'tower', 30000);
  await freeze(page);
  await page.waitForFunction(() => window.__game.top.orun?.state === 'ready', null, { timeout: 15000 });
  const LAST = 32;
  await page.evaluate(async (LAST) => {
    const g = window.__game, TW = await import('/src/data/tower.js');
    const t = g.scenes.find((s) => s.name === 'tower'), w = t.world, p = w.player;
    const CYC = ['gold', 'split', 'elite', 'rush', 'bomb', 'bolt', 'mad', 'giant', 'vamp', 'fog'];
    const PRI = ['swift', 'greed', 'oath', 'fury', 'edge', 'thirst'];
    let k = 0;
    // 1층은 장면 시작(시계 0 · 점수 0)에 열렸다 (이 도우미를 거는 동안 이미 지난 시간도 1층의 시간)
    const G = window.__greed = { log: [{ f: 1, s: 0, c: 0, mut: null, blood: false, at: [t.floor, w.run.score, t.clock] }], muts: [], bloodFloors: 0, done: false, killed: false, shops: 0, pacts: [] };
    const o = t.loadFloor.bind(t);
    t.loadFloor = (n) => {
      t.forceMut = TW.floorKind(n) === 'combat' && n >= TW.MUT_FROM ? CYC[k++ % CYC.length] : undefined;
      const s = w.run.score, c = t.clock;
      o(n);
      t.forceMut = undefined;
      G.log.push({ f: n, s, c, mut: t.mut?.id ?? null, blood: t.bloodFloor, gold: w.diff.gold });
      if (t.mut) G.muts.push(t.mut.id);
      if (t.bloodFloor) G.bloodFloors++;
    };
    p.buffs.invincible = 1e9;
    const act = () => {
      const top = g.top;
      if (G.killed) { if (G.up) { G.up = false; window.__padSet(12, 0); } return; }   // 쓰러진 뒤에는 아무것도 하지 않는다 (결과 = 돌파한 층 LAST)
      if (top?.name === 'towerBlessing') {
        if (top.picked !== undefined) return;
        if (top.mode === 'pact') { const i = PRI.map((id) => top.ids.indexOf(id)).find((i) => i >= 0); G.pacts.push(top.ids[i ?? top.ids.length - 1]); top.choose(i ?? top.ids.length - 1); }
        else if (top.mode === 'shop') { if (!top._greed) { top._greed = 1; G.shops++; g.state.gold = Math.max(g.state.gold ?? 0, 1e6); top.choose(0); } else top.choose(top.items().length - 1); }
        else top.choose(0);
        return;
      }
      if (top !== t || t.done) return;
      if (t.floor > LAST && !G.killed) {   // 끝: 쓰러진다 → 결과 → 실제 서버 제출
        G.killed = true; p.buffs.invincible = 0; p.iframes = 0; t.reviveLeft = 0; p.hp = 1;
        p.takeHit(999999, { team: 'enemy', dir: 1, kb: [100, -200] }, w, {});
        return;
      }
      if ((t.phase === 'fight' || (t.phase === 'boss' && !w.cutscene)) && w.enemies().length) {
        w.combo.n = Math.max(w.combo.n, 999); w.combo.t = w.combo.window = 2.6;   // 콤보 999 (점수 배율 ×51 · 끝나면 COMBO BONUS n²×5)
        t.debugKillAll();
      }
      // 출구: (갈림길이면 붉은 문 위로 옮겨 가서) ▲ 를 매 스텝 눌렀다 뗐다 — 문은 장면 자신의 규칙(TowerGate.update)으로 연다
      if (t.phase === 'gate') {
        const gate = t.gates.find((x) => x.route === 'blood') ?? t.gate;
        if (gate.route === 'blood') { p.x = gate.cx - p.w / 2; p.y = gate.bottom - p.h; p.vx = 0; p.vy = 0; }
        G.up = !G.up; window.__padSet(12, G.up ? 1 : 0);
      } else if (G.up) { G.up = false; window.__padSet(12, 0); }
    };
    window.__greedStep = (n) => {
      for (let i = 0; i < n; i++) {
        if (g.top?.name === 'arcadeResults') { G.done = true; break; }
        act();
        try { g.input?.pollFrame?.(); } catch { /* */ }
        g.tick(1 / 60);
      }
      g.render?.();
      return { floor: t.floor, phase: t.phase, top: g.top?.name, done: G.done };
    };
  }, LAST);
  let st = null;
  for (let i = 0; i < 600; i++) {
    st = await page.evaluate(() => window.__greedStep(240));
    if (st.done) break;
    await page.evaluate(async () => { try { await window.__game.world?.bossReady?.(); } catch { /* 보스 없음 */ } });
  }
  assert.ok(st?.done, `욕심 판이 끝나지 않음 ${JSON.stringify(st)}`);
  const G = await page.evaluate(() => {
    const G = window.__greed, top = window.__game.top, r = top.res;
    return { ...G, final: { score: r.score, time: r.time, floor: r.extra.floor, reached: r.extra.reached, v: r.extra.v, blood: r.extra.blood, pacts: r.extra.pacts } };
  });
  // 층마다: 점수 ≤ maxScorePerFloor · 시간 ≥ minFloorSec
  const rows = G.log.map((x, i) => {
    const nx = G.log[i + 1] ?? { s: G.final.score, c: G.final.time };
    return { f: x.f, ds: nx.s - x.s, dt: nx.c - x.c, mut: x.mut, blood: x.blood, last: !G.log[i + 1] };
  });
  for (const r of rows) {
    assert.ok(r.ds <= RULES.maxScorePerFloor, `${r.f}층 점수 ${r.ds} > ${RULES.maxScorePerFloor} (${r.mut})`);
    if (!r.last) assert.ok(r.dt >= RULES.minFloorSec, `${r.f}층 시간 ${r.dt.toFixed(3)}초 < ${RULES.minFloorSec}초 (${r.mut}${r.blood ? ' · 피의 길' : ''})`);
  }
  const capHits = rows.filter((r) => r.ds >= RULES.maxScorePerFloor - 1).length;
  assert.ok(capHits >= 10, `욕심 판이 층 상한에 닿아야 한다 (닿은 층 ${capHits})`);
  assert.equal(G.final.floor, LAST, '돌파한 층');
  assert.ok(G.final.score <= (G.final.floor + 1) * RULES.maxScorePerFloor, `점수 ${G.final.score}`);
  assert.ok(G.final.time * 1000 >= G.final.floor * RULES.minFloorSec * 1000, `시간 ${G.final.time}`);
  // 욕심 판의 모양: 갈림길마다 피의 길 · 변이 10종이 모두 (황금 층 포함) · 계약 셋 · 상인
  const bosses = [5, 15, 25].length;
  assert.equal(G.final.blood, bosses, '갈림길 3번 모두 피의 길');
  assert.equal(G.bloodFloors, bosses * 4, '피의 길 층 12');
  assert.deepEqual([...new Set(G.muts)].sort(), T.MUTATORS.map((m) => m.id).sort(), '변이 10종');
  const goldBlood = G.log.find((x) => x.mut === 'gold' && x.blood);
  assert.ok(goldBlood, '피의 길 위의 황금 층');
  // 안식처 10·20·30층: 후보 둘 중 이득이 큰 쪽 (질주 > 탐욕 > 맹세 > 광기 > 칼날 > 갈증)
  const PRI = ['swift', 'greed', 'oath', 'fury', 'edge', 'thirst'], taken = {}, want = [];
  for (const f of [10, 20, 30]) { const offer = T.pactOffer(90210, f, taken); const id = PRI.find((x) => offer.includes(x)); want.push(id); taken[id] = true; }
  assert.deepEqual(G.pacts, want, `계약 ${G.pacts}`);
  assert.deepEqual(G.final.pacts, want);
  assert.equal(G.shops, 1, '15층 상인');
  assert.equal(G.final.v, 2);
  // 실제 서버: 받았고, 순위표의 기록 = 제출한 층·점수·시간
  await page.waitForFunction(() => ['ok', 'error', 'login', 'offline'].includes(window.__game.top.onl?.state), null, { timeout: 20000 });
  const onl = await page.evaluate(() => window.__game.top.onl);
  assert.equal(onl.state, 'ok', `서버가 받지 않음 ${JSON.stringify(onl)} ${JSON.stringify(M.finishRes)}`);
  const sent = M.finishes.at(-1).result;
  assert.equal(sent.floor, LAST);
  assert.equal(sent.v, 2);
  assert.ok(sent.score === Math.min(99999999, G.final.score), `제출 점수 ${sent.score} / ${G.final.score}`);
  const b = await R.call('GET', '/api/boards/tower:inferno');
  const mine = b.body.entries.find((e) => e.floor === LAST);
  assert.ok(mine && mine.score === sent.score && mine.time === sent.time, `순위표 ${JSON.stringify(b.body).slice(0, 300)}`);
  console.log(`    욕심 판: ${LAST}층 · 점수 ${G.final.score.toLocaleString()} (층 상한에 닿은 층 ${capHits}) · 시간 ${G.final.time.toFixed(1)}초 · 가장 짧은 층 ${Math.min(...rows.filter((r) => !r.last).map((r) => r.dt)).toFixed(3)}초 · 가장 큰 층 점수 ${Math.max(...rows.map((r) => r.ds)).toLocaleString()} · 계약 ${G.pacts.join('/')}`);
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 시즌 1 기록 · 제출 모양 ─────────────────────────
test('시즌 1 기록: v 없는 옛 기록이 읽히고 보인다 · 더 높이 오르면 v:2 기록 · 제출은 v 하나만 더 · 실제 서버는 v 를 버리고 같은 기록', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const OLD = { normal: { floor: 12, time: 345.6, score: 123456, charId: 'kael', blessings: ['might', 'crit'], date: '2026-09-01' }, hard: { floor: 7, time: 222, score: 4567, charId: 'sera', blessings: [], date: '2026-09-02', v: 1 } };
  const { page, errs } = await openGame(ctx, { init: { ...AUTH, bloodnocturne_meta: JSON.stringify({ towerBest: OLD }) } });
  const texts = await page.evaluate(async () => {
    const g = window.__game, out = {};
    for (const diff of ['normal', 'hard', 'easy']) {
      g.meta.arcadeCfg = { kind: 'tower', diff, preset: 3 };
      g.go('arcade', {}, { fade: false });
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      g.render?.();
      out[diff] = g.top.bestText();
    }
    g.go('highscore', { mode: 'tower', src: 'device' }, { fade: false });
    for (let i = 0; i < 30; i++) g.tick(1 / 60);
    g.render?.();
    out.hs = g.top.name;
    out.best = JSON.parse(JSON.stringify(g.meta.towerBest));
    return out;
  });
  assert.match(texts.normal, /12층 돌파 · .* · 시즌 1$/, texts.normal);
  assert.match(texts.hard, /7층 돌파 · .* · 시즌 1$/, `v:1 = 시즌 1 ${texts.hard}`);
  assert.match(texts.easy, /기록이 아직 없습니다/);
  assert.equal(texts.hs, 'highscore');
  assert.deepEqual(texts.best, OLD, '옛 기록은 읽기만 해도 그대로');
  // 클라우드 합치기: 높은 층이 이긴다 (v 도 함께)
  const merged = await page.evaluate(() => import('/src/core/cloud.js').then((C) => {
    const a = C.mergeMeta({ towerBest: { normal: { floor: 12, time: 300 } } }, { towerBest: { normal: { floor: 15, time: 400, v: 2 } } }).towerBest.normal;
    const b = C.mergeMeta({ towerBest: { normal: { floor: 16, time: 300 } } }, { towerBest: { normal: { floor: 15, time: 400, v: 2 } } }).towerBest.normal;
    return [a, b];
  }));
  assert.deepEqual(merged, [{ floor: 15, time: 400, v: 2 }, { floor: 16, time: 300 }]);
  // 시즌 2 판: 제출 모양 = 시즌 1 모양 + v (결과에서 v 를 뺀 것과 비교)
  await page.evaluate(() => import('/src/scenes/front/arcade.js').then((A) => A.startArcade(window.__game, { kind: 'tower', diff: 'normal', preset: 3, seed: 5150 }, 'kael')));
  await waitTop(page, 'tower', 30000);
  await freeze(page);
  const pay = await page.evaluate(async () => {
    const t = window.__game.top, O = await import('/src/core/online.js');
    const r2 = t.results(), r1 = t.results();
    delete r1.extra.v;
    const a = t.onlinePayload(false, r2).result, b = t.onlinePayload(false, r1).result;
    return { a, b, ca: O.cleanResult(a), cb: O.cleanResult(b) };
  });
  assert.deepEqual(Object.keys(pay.a).filter((k) => !(k in pay.b)), ['v']);
  assert.deepEqual(Object.keys(pay.b).filter((k) => !(k in pay.a)), []);
  assert.deepEqual({ ...pay.a, v: undefined }, { ...pay.b, v: undefined }, '나머지 필드는 같다');
  assert.equal(pay.a.v, 2);
  assert.deepEqual({ ...pay.ca, v: undefined }, { ...pay.cb, v: undefined }, 'cleanResult 뒤에도 v 만 다르다');
  assert.equal(pay.ca.v, 2);
  assert.equal('v' in pay.cb, false);
  // 12층보다 낮게 끝나면 옛 기록(시즌 1)이 남고, 넘으면 v:2 기록 → 시즌 2
  const end = async (n) => {
    await page.evaluate((n) => { const t = window.__game.top; t.debugFloor(n); }, n);
    await page.evaluate(() => { const w = window.__game.world, p = w.player; p.iframes = 0; p.buffs.invincible = 0; p.hp = 1; window.__game.top.reviveLeft = 0; p.takeHit(999999, { team: 'enemy', dir: 1, kb: [100, -200] }, w, {}); });
    await tickUntil(page, "g.top.name === 'arcadeResults' && g.fade.a < 0.05", 600, '결과');
    return page.evaluate(() => JSON.parse(JSON.stringify(window.__game.meta.towerBest.normal)));
  };
  const lower = await end(4);
  assert.deepEqual(lower, OLD.normal, '낮은 판은 옛 기록을 덮지 않는다');
  await thaw(page);
  await page.evaluate(() => import('/src/scenes/front/arcade.js').then((A) => A.startArcade(window.__game, { kind: 'tower', diff: 'normal', preset: 3, seed: 5151 }, 'kael')));
  await waitTop(page, 'tower', 30000);
  await freeze(page);
  const higher = await end(14);
  assert.equal(higher.floor, 13);
  assert.equal(higher.v, 2);
  const txt = await page.evaluate(() => { const g = window.__game; g.meta.arcadeCfg = { kind: 'tower', diff: 'normal', preset: 3 }; g.go('arcade', {}, { fade: false }); for (let i = 0; i < 30; i++) g.tick(1 / 60); return g.top.bestText(); });
  assert.match(txt, /13층 돌파 · .* · 시즌 2$/, txt);
  assert.deepEqual(errs, []);
  await ctx.close();
  // 실제 서버: v 가 있는 제출과 없는 제출이 같은 기록으로 남는다 (checkResult 는 v 를 읽지 않는다)
  const R = await realApi();
  const RES = { time: 120000, score: 777777, hero: 'kael', cls: 'kael_hunter', level: 60, deaths: 1, floor: 13 };
  const ent = [];
  for (const [id, res] of [['season1a', RES], ['season2a', { ...RES, v: 2 }]]) {
    const acct = await R.signup(id);
    const s = await R.call('POST', '/api/runs', { board: 'tower:normal' }, acct.token);
    assert.equal(s.status, 200, JSON.stringify(s.body));
    R.clock.t += RES.time + 5000;
    const f = await R.call('POST', '/api/runs/finish', { run: s.body.run, result: res }, acct.token);
    assert.equal(f.status, 200, JSON.stringify(f.body));
    ent.push(f.body.entry);
  }
  const strip = (e) => { const o = { ...e }; for (const k of ['nick', 'rank', 'date', 'ts', 'd', 'me', 'ghost', 'g']) delete o[k]; return o; };
  assert.deepEqual(strip(ent[1]), strip(ent[0]), `서버 기록 ${JSON.stringify(ent)}`);
  assert.equal('v' in ent[1], false);
});

// ───────────────────────── 휴대폰 ─────────────────────────
for (const vp of ['phone2', 'phone1']) {
  test(`휴대폰 ${vp}: 아케이드 메뉴 카드 5장이 화면에 들어감·탭 크기 · 터치로 축복 고르기`, async () => {
    const M = makeMock();
    const ctx = await newContext(M, vp);
    const { page, errs } = await openGame(ctx, {});
    await installTapRecorder(page);
    await page.evaluate(() => { window.__game.meta.arcadeCfg = { kind: 'tower', diff: 'normal', preset: 2 }; });
    const audit = await auditScene(page, "__game.go('arcade',{},{fade:false})", { wait: 1200 });
    assert.ok(!audit.error, audit.error);
    const red = (audit.red ?? []).filter((r) => r.scene === 'arcade' || !r.scene);
    assert.deepEqual(red, [], `빨간 탭 ${JSON.stringify(red).slice(0, 300)}`);
    const L = await page.evaluate(() => {
      const t = window.__game.top, L = t.layout(t.options().length), g = window.__game, css = (g.cssScale || 1) * (g.uiK || 1);
      return { kind: t.kind, W: L.W, H: L.H, x0: L.x0, CW: L.CW, cw: L.cw, ch: L.ch, cwCss: L.cw * css, chCss: L.ch * css, startBottom: L.start.y + L.start.h, panelBottom: L.oy - 6 + L.panelH, descY: L.descY, cardBottom: L.cardY + L.ch };
    });
    assert.equal(L.kind, 'tower');
    assert.ok(L.x0 >= 12 && L.x0 + L.CW <= L.W - 12, `카드 줄 가로 ${JSON.stringify(L)}`);
    assert.ok(L.cwCss >= 44 && L.chCss >= 44, `카드 탭 ${L.cwCss}×${L.chCss}`);
    assert.ok(L.startBottom <= L.H - 30 && L.panelBottom <= L.H - 30, `아래 안내 줄과 겹침 ${JSON.stringify(L)}`);
    assert.ok(L.cardBottom < L.descY - 8, '카드와 설명 겹침');
    await shot(page, `menu_${vp}`);
    // 터치로 축복 고르기 (안식처)
    await page.evaluate(() => import('/src/scenes/front/arcade.js').then((A) => A.startArcade(window.__game, { kind: 'tower', diff: 'easy', preset: 2, seed: 9 }, 'lia')));
    await waitTop(page, 'tower', 30000);
    await freeze(page);
    await page.evaluate(() => window.__game.top.debugFloor(10));
    await tickUntil(page, "g.top.name === 'towerBlessing'", 400, '안식처 축복');
    await ticks(page, 30);
    const pt = await page.evaluate(() => {
      const g = window.__game, t = g.top, L = t.layout(), cv = g.canvas.getBoundingClientRect(), k = (cv.width / g.viewW) * (g.uiK || 1);
      const i = 2, r = { x: L.x0 + i * (L.cw + L.gap), y: L.top, w: L.cw, h: L.ch };
      return { x: cv.left + (r.x + r.w / 2) * k, y: cv.top + (r.y + r.h / 2) * k, id: t.ids[i], w: r.w * k, h: r.h * k };
    });
    assert.ok(pt.w >= 44 && pt.h >= 44, `축복 카드 ${pt.w}×${pt.h} CSS px`);
    await shot(page, `blessing_${vp}`);
    await thaw(page);   // 터치 탭은 실제 프레임으로 (온라인 클라이언트 시험과 같게)
    await page.waitForTimeout(200);
    await page.touchscreen.tap(pt.x, pt.y);
    // 시즌 2: 안식처 축복 뒤 피의 계약 → 터치로 「거절한다」(셋째 카드)
    await page.waitForFunction(() => window.__game.top?.name === 'towerBlessing' && window.__game.top.mode === 'pact' && window.__game.scenes.find((s) => s.name === 'tower').takenOrder.length > 0, null, { timeout: 8000 });
    assert.equal(await page.evaluate(() => window.__game.scenes.find((s) => s.name === 'tower').takenOrder.at(-1)), pt.id);
    await page.waitForTimeout(400);
    const dp = await page.evaluate(() => {
      const g = window.__game, t = g.top, L = t.layout(), cv = g.canvas.getBoundingClientRect(), k = (cv.width / g.viewW) * (g.uiK || 1);
      const i = t.ids.length - 1, r = { x: L.x0 + i * (L.cw + L.gap), y: L.top, w: L.cw, h: L.ch };
      return { x: cv.left + (r.x + r.w / 2) * k, y: cv.top + (r.y + r.h / 2) * k, id: t.ids[i], w: r.w * k, h: r.h * k };
    });
    assert.ok(dp.id === null && dp.w >= 44 && dp.h >= 44, `거절 카드 ${JSON.stringify(dp)}`);
    await page.touchscreen.tap(dp.x, dp.y);
    await page.waitForFunction(() => window.__game.top?.name === 'tower' && window.__game.top.takenOrder.length > 0, null, { timeout: 8000 });
    assert.deepEqual(await page.evaluate(() => window.__game.top.pactOrder), []);
    await freeze(page);
    await ticks(page, 10);
    await shot(page, `tower_${vp}`);
    assert.deepEqual(errs, []);
    await ctx.close();
  });
}

// ───────────────────────── Fold 화면 (--fold=폴더) ─────────────────────────
// 시험이 아니라 산출물: Galaxy Z Fold 펼침(fold_open)에서 변이 알림 카드 · 피의 계약 · 상인 · 갈림길 4장만 찍고 끝난다 (다른 시험은 돌지 않는다)
const FOLD = typeof args.fold === 'string' ? args.fold : null;
if (FOLD) {
  fs.mkdirSync(FOLD, { recursive: true });
  // --fold-device=phone2 → 같은 장면을 다른 기기(viewports.mjs)로 (기본 fold_open)
  const ctx = await newContext(makeMock(), typeof args['fold-device'] === 'string' ? args['fold-device'] : 'fold_open');
  const { page, errs } = await openGame(ctx, { init: AUTH });
  await page.evaluate(() => import('/src/scenes/front/arcade.js').then((A) => A.startArcade(window.__game, { kind: 'tower', diff: 'hard', preset: 3, seed: 4242 }, 'kael')));
  await waitTop(page, 'tower', 30000);
  await freeze(page);
  await installS2(page);
  // --fold-only=pact,merchant → 그 화면만 찍는다 (나머지는 같은 길을 지나기만 — 스크린숏 수를 아낄 때)
  const ONLY = typeof args['fold-only'] === 'string' ? new Set(args['fold-only'].split(',')) : null, taken = [];
  const snap = async (name) => { if (ONLY && !ONLY.has(name.replace(/^tower_|\.png$/g, ''))) return; await page.screenshot({ path: path.join(FOLD, name) }); taken.push(name); };
  // 1) 변이 알림 카드 (피의 길 위의 낙뢰 — 층 시작 0.9초)
  await page.evaluate(() => { const t = window.__S2.T(); t.world.player.buffs.invincible = 9999; t.debugFloor(16, { mut: 'bolt', blood: true }); });
  await ticks(page, 54);
  await snap('tower_card.png');
  // 2) 피의 계약 (20층 안식처: 축복 → 계약 둘 + 거절)
  await page.evaluate(() => window.__S2.T().debugFloor(20));
  await page.evaluate(() => {   // 축복(피의 길 뒤라 둘)을 고르고 계약 창까지
    const { g, until } = window.__S2;
    until(() => { if (g.top.name === 'towerBlessing' && g.top.mode === 'bless' && g.top.picked === undefined) g.top.choose(0); return g.top.name === 'towerBlessing' && g.top.mode === 'pact'; }, 900, '20층 계약');
  });
  await ticks(page, 30);
  await snap('tower_pact.png');
  await page.evaluate(() => window.__game.top.choose(window.__game.top.ids.length - 1));
  await tickUntil(page, "g.top.name === 'tower' && t.phase === 'gate'", 200, '거절 → 출구');
  // 3) 떠돌이 상인 로크 (35층 군주 뒤 — 카드 한 장을 산 모습)
  await page.evaluate(() => window.__S2.T().debugFloor(35));
  await tickUntil(page, "t.phase === 'boss' && w.boss", 300, '35층 보스');
  await page.evaluate(() => window.__game.world.bossReady());
  await tickUntil(page, "g.top.name === 'tower' && !w.cutscene", 600, '보스 등장 연출 끝');
  await page.evaluate(() => window.__S2.T().debugKillAll());
  await tickUntil(page, "g.top.name === 'towerBlessing'", 400, '격파 → 축복');
  await page.evaluate(() => window.__game.top.choose(0));
  await tickUntil(page, "g.top.name === 'towerBlessing' && g.top.mode === 'shop'", 200, '상인');
  await page.evaluate(() => { const g = window.__game; g.state.gold = 2400; g.top.choose(1); });
  await ticks(page, 30);
  await snap('tower_merchant.png');
  // 4) 갈림길 ([play-fix #3] 떠나기 → 영웅 왼쪽 안전한 길 · 오른쪽 피의 길, 둘 다 한 화면 · 영웅 머리 위 「◀ 안전한 길 · 피의 길 ▶」)
  await page.evaluate(() => { const top = window.__game.top; top.choose(top.items().length - 1); });
  await tickUntil(page, "g.top.name === 'tower' && t.phase === 'gate' && t.gates.length === 2", 200, '갈림길');
  await ticks(page, 70);
  await snap('tower_route.png');
  // [play-fix] 이어서: 자동 전투를 켠 갈림길(안내 한 줄) → 사람이 붉은 문으로 걸어감(문 안내) → ▲ 피의 길 → 가시 층 → 출구 자리 → 결과 줄
  await page.evaluate(async () => { const A = await import('/src/game/autoplay.js'); A.setLevel(window.__game, 'battle', { toast: false }); });
  await ticks(page, 90);
  await snap('tower_route_auto.png');
  await page.evaluate(async () => { const A = await import('/src/game/autoplay.js'); A.setLevel(window.__game, 'off', { toast: false }); });
  await page.keyboard.down('ArrowRight');
  await tickUntil(page, 't.gates[1].near', 300, '붉은 문까지 걷기');
  await page.keyboard.up('ArrowRight');
  await ticks(page, 45);   // 터치 → 키보드로 바뀐 조작 표시가 다 바뀐 뒤 (문 앞에 서서 1.4초 전)
  await snap('tower_route_blood.png');
  await key(page, 'ArrowUp');
  await tickUntil(page, "t.floor === 36 && t.phase === 'enter'", 400, '피의 길 → 36층');
  // 축복 카드 (45층 군주 뒤 — 시계 · BOSS DOWN 이 카드 뒤에 비치지 않는다)
  await page.evaluate(() => { const { T, until } = window.__S2, t = T(); t.debugFloor(45); until(() => t.phase === 'boss' && t.world.boss, 300, '45층'); });
  await page.evaluate(() => window.__game.world.bossReady());
  await tickUntil(page, "g.top.name === 'tower' && !w.cutscene", 600, '보스 등장 연출 끝');
  await page.evaluate(() => window.__S2.T().debugKillAll());
  await tickUntil(page, "g.top.name === 'towerBlessing'", 900, '격파 → 축복');
  await ticks(page, 40);
  await snap('tower_blessing.png');
  await page.evaluate(() => window.__game.top.choose(0));
  await tickUntil(page, "g.top.name === 'tower' && t.phase === 'gate'", 300, '축복 → 갈림길');
  // 가시: 가시 층에서 가시 위로 → 한 번 맞고 안전한 땅으로
  const sp = await page.evaluate(async () => {
    const { T, until, step } = window.__S2, t = T(), TW = window.__S2.TW, { STAGES } = await import('/src/data/stages.js'), { T: TT } = await import('/src/core/physics.js');
    let f0 = 0;
    for (let f = 41; f <= 120 && !f0; f++) { const pl = t.planner.plan(f); if (pl.kind === 'combat' && TW.towerRoom(STAGES, pl.sid, pl.rid).room.map.some((r) => r.includes('^'))) f0 = f; }
    t.debugFloor(f0, { mut: null });
    until(() => t.phase === 'fight', 240, '가시 층');
    const w = t.world, p = w.player, m = w.map;
    // 층이 끝나지 않게 적 하나만 남겨 방 저쪽에 세워 둔다 (화면 · 층 이름 알림이 사라진 뒤 찍는다)
    w.enemies().forEach((e, i) => { if (i) e.dead = true; else { e.update = () => {}; e.x = 2 * 48; e.y = 2 * 48; } });
    p.buffs.invincible = 0; p.iframes = 0;
    until(() => p.onGround && p.safeSpot?.roomId === w.roomId && !t.call && !t.mutCard, 400, '디딘 땅');
    let sx = -1, sy = -1;
    for (let ty = 1; ty < m.h && sx < 0; ty++) for (let tx = 1; tx < m.w - 1; tx++) if (m.typeAt(tx, ty) === TT.SPIKE && m.typeAt(tx, ty - 1) !== TT.SOLID) { sx = tx; sy = ty; break; }
    const hp0 = p.hp;
    p.x = sx * 48 + 24 - p.w / 2; p.y = sy * 48 - p.h + 8; p.vx = 0; p.vy = 0;
    step(1);
    return { f0, hp0, hp: p.hp, resets: t.spikeResets };
  });
  await ticks(page, 30);
  await snap('tower_spike.png');
  console.log('가시', JSON.stringify(sp));
  // 출구 자리: 마지막 처치 때 영웅이 공중 (방 시작에서 먼 곳) → 문은 곁의 단단한 땅
  await page.evaluate(() => {
    const { T, step } = window.__S2, t = T(), w = t.world, p = w.player, m = w.map;
    step(2);
    if (t.gate) { t.gate.dead = true; t.gate = null; }
    const cp = w.run.checkpoint;
    let tx = -1, gy = -1;
    for (let x = 2; x < m.w - 2 && tx < 0; x++) {
      if (Math.abs(x * 48 - cp.x) < 10 * 48) continue;
      for (let y = 3; y < m.h - 1; y++) if (m.typeAt(x, y) === 1 && [1, 2, 3, 4].every((k) => m.typeAt(x, y - k) === 0)) { tx = x; gy = y; break; }
    }
    p.buffs.invincible = 9999;
    p.x = tx * 48 + 24 - p.w / 2; p.y = (gy - 3) * 48 - p.h; p.vx = 0; p.vy = 0; p.onGround = false;
    t.phase = 'clear'; t.openGate();
  });
  await ticks(page, 50);
  await snap('tower_exit.png');
  // 결과 줄 (피의 길 1번 · 계약 · 새 잔상)
  await page.evaluate(() => {
    const { g, T, until } = window.__S2, t = T(), w = t.world, p = w.player;
    p.buffs.invincible = 0; p.iframes = 0; p.hp = 1; t.reviveLeft = 0;
    p.takeHit(999999, { team: 'enemy', dir: 1, kb: [100, -200] }, w, {});
    until(() => g.top.name === 'arcadeResults', 900, '결과');
  });
  await ticks(page, 150);
  await snap('tower_results.png');
  assert.deepEqual(errs, []);
  await ctx.close();
  await browser.close();
  console.log(`Fold 화면 ${taken.length}장 (${taken.join(', ')}): ${FOLD}`);
  process.exit(0);
}

let pass = 0, fail = 0;
for (const t of tests) {
  if (FILTER && !t.name.includes(FILTER)) continue;
  const t0 = Date.now();
  try { await t.fn(); pass++; console.log(`✓ ${t.name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { fail++; console.log(`✗ ${t.name}\n  ${String(e?.stack ?? e).split('\n').slice(0, 6).join('\n  ')}`); }
}
await browser.close();
console.log(`\n${pass} 통과, ${fail} 실패 (스크린숏: ${SHOTS})`);
process.exit(fail ? 1 : 0);
