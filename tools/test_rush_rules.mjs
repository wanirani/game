// 보스 러시 규칙 코스 시험 (헤드리스 Chromium, 고정 스텝): node tools/test_rush_rules.mjs [--filter=문자열] [--fold=폴더]
//  - 규칙 코스 (src/scenes/front/arcade.js RULE_COURSES, 번호 15~): 릴레이 · 무작위 6 · 휴식 없음 — 기기 기록만 (서버 COURSE_COUNT 밖)
//  - API 는 이 파일 안의 흉내로 답하고, 게임은 디스크에서 https://game.test 로 내보낸다 (로그인 = bn_auth 미리 넣기 → 순위표 코스는 런을 시작한다)
//  - 게임 루프를 멈추고(game._pageHidden) game.tick(1/60) 을 직접 돌린다 → 부하와 상관없이 같은 결과
// 확인 (Stage 5 plan §4 P1 acceptance 4):
//   · 표: 서버 코스 15줄 그대로(test_online 대조) · 규칙 코스 3개 · 서버 보드 검사가 15번 이상을 거절 · 메뉴 코스 줄 / 명예의 전당 코스 줄
//   · 릴레이: 라운드 N = 순서[N % 합류 인원] · 그 헌터 자신의 빌드(헌터 선택으로 시작할 때와 같은 buildArcadeState) ·
//     넘어오는 동료·탈것·버프·소환물·탄 없음 · 다시 나오면 남긴 체력 + 회복 · 앞 헌터는 월드에서 빠진다
//   · 휴식 없음: 라운드 사이 체력·하트 그대로 (보통 코스는 회복) · 점수 ×1.5
//   · 무작위 6: 오늘의 시드면 같은 날 같은 보스 여섯(두 번 시작해도 같다) · 무작위는 판마다 다름 · 아는 보스가 적으면 모두 · 비면 첫 코스
//   · 네트워크: 규칙 코스는 fetch 로 /api/runs* 요청 0 (fetch 를 감싸 센다) — 같은 하네스에서 순위표 코스는 POST /api/runs 1 (대조군) ·
//     정산 화면 「기기 기록」 줄 · meta.bossRushBests[번호] 에 기록 · 콘솔 오류 0
//  --fold=폴더: Fold 펼침(fold_open) 화면 한 장만 찍고 끝 (rush_course_row.png: 아케이드 메뉴 코스 줄 = 무작위 6 · 오늘의 시드)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { contextOptions } from './qa/lib/viewports.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const FILTER = typeof args.filter === 'string' ? args.filter : null;
const FOLD = typeof args.fold === 'string' ? args.fold : null;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.m4a': 'audio/mp4' };
const TOKEN = 'T'.repeat(43);
const AUTH = { bn_auth: JSON.stringify({ id: 'hunter01', token: TOKEN }) };
const RELAY = 15, RANDOM6 = 16, NOREST = 17;

// ───────────────────────── API 흉내 ─────────────────────────
function makeMock() {
  const M = { log: [], runs: [], finishes: [] };
  M.handle = (method, p, headers, body) => {
    const authed = headers.authorization === `Bearer ${TOKEN}`;
    const ok = (o, status = 200) => ({ status, body: { ok: true, ...o } });
    const err = (status, error) => ({ status, body: { ok: false, error } });
    if (p === '/api/health') return ok({});
    if (p === '/api/auth/me') return authed ? ok({ id: 'hunter01', createdAt: Date.now() - 86400e3, nick: '러시꾼' }) : err(401, 'unauthorized');
    if (p === '/api/saves') return authed ? ok({ slots: [1, 2, 3].map((slot) => ({ slot, empty: true, rev: 0 })), meta: { rev: 0 } }) : err(401, 'unauthorized');
    if (p === '/api/meta') return method === 'GET' ? ok({ rev: 0, data: null }) : ok({ rev: 1 });
    if (p === '/api/runs' && method === 'POST') { M.runs.push(body); return ok({ run: `run.${M.runs.length}.${body?.board}`, seed: 777, ts: Date.now() }); }
    if (p === '/api/runs/finish' && method === 'POST') { M.finishes.push(body); return ok({ best: true, rank: 1, total: 3, entry: { rank: 1, nick: '러시꾼', time: body?.result?.time } }); }
    if (/^\/api\/boards\//.test(p)) return ok({ board: p.split('/').pop(), total: 0, entries: [] });
    return err(404, 'not_found');
  };
  return M;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

async function newContext(M, vp = 'desk') {
  const ctx = await browser.newContext({ ...(vp === 'desk' ? { viewport: { width: 1280, height: 720 } } : contextOptions(vp)), serviceWorkers: 'block' });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host !== 'game.test') return route.abort('blockedbyclient');
    if (u.pathname.startsWith('/api/')) {
      let body = null;
      try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
      M.log.push({ method: req.method(), path: u.pathname });
      const r = M.handle(req.method(), u.pathname, await req.allHeaders(), body);
      return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
    }
    const file = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, headers: { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }, body: fs.readFileSync(file) });
  });
  return ctx;
}
/** fetch 를 감싸 부른 주소를 센다 (window.__fetchLog) — 서버로 나가는 모든 요청이 여기를 지난다 */
function fetchSpy() {
  window.__fetchLog = [];
  const orig = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try { window.__fetchLog.push({ url: String(typeof input === 'string' ? input : input?.url ?? ''), method: String(init?.method ?? input?.method ?? 'GET').toUpperCase() }); } catch { /* 무시 */ }
    return orig(input, init);
  };
}
async function openGame(ctx, { init = null } = {}) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 300)); });
  await page.addInitScript(fetchSpy);
  await page.addInitScript((store) => { if (store) for (const [k, v] of Object.entries(store)) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } } }, init);
  await page.goto('https://game.test/index.html?nosw', { timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.scenes.length > 0 && window.__game.scenesReady !== false, null, { timeout: 60000 });
  return { page, errs };
}
async function waitTop(page, name, ms = 30000) {
  // 멈춘 루프(freeze)라면 장면 전환(페이드)이 돌도록 잠깐 풀고, 도착하면 다시 멈춘다
  const wasFrozen = await page.evaluate(() => { const g = window.__game, f = !!g._pageHidden; if (f) { g._pageHidden = false; g.last = performance.now(); } return f; });
  try {
    await page.waitForFunction((n) => window.__game.top?.name === n && (window.__game.fade?.a ?? 0) < 0.05, name, { timeout: ms });
    if (wasFrozen) await freeze(page);
  } catch (e) {
    const st = await page.evaluate(() => ({ top: window.__game.top?.name, scenes: window.__game.scenes.map((s) => s.name), fade: window.__game.fade?.a, hidden: window.__game._pageHidden })).catch(() => null);
    throw new Error(`장면 ${name} 을 기다리다 시간 초과 ${JSON.stringify(st)}`);
  }
}
const freeze = (page) => page.evaluate(() => { window.__game._pageHidden = true; });
const ticks = (page, n) => page.evaluate((n) => { const g = window.__game; for (let i = 0; i < n; i++) { try { g.input?.pollFrame?.(); } catch { /* */ } g.tick(1 / 60); } g.render?.(); }, n);
/** 조건(식: g = game, t = 보스 러시 장면, w = world, p = 영웅)이 참이 될 때까지 스텝 → 걸린 스텝, 못 하면 예외 */
async function tickUntil(page, pred, max = 1500, what = pred) {
  const n = await page.evaluate(([pred, max]) => {
    const g = window.__game;
    // eslint-disable-next-line no-new-func
    const f = new Function('g', 't', 'w', 'p', `return (${pred});`);
    for (let i = 0; i <= max; i++) {
      const t = g.scenes.find((s) => s.name === 'bossrush'), w = t?.world;
      try { if (f(g, t, w, w?.player)) { g.render?.(); return i; } } catch { /* 아직 */ }
      try { g.input?.pollFrame?.(); } catch { /* */ }
      g.tick(1 / 60);
      if (i % 60 === 0) g.render?.();
    }
    return -1;
  }, [pred, max]);
  if (n < 0) {
    const st = await page.evaluate(() => { const g = window.__game, t = g.scenes.find((s) => s.name === 'bossrush'); return { top: g.top?.name, phase: t?.phase, round: t?.round, boss: t?.world?.boss?.def?.id, dead: t?.world?.player?.dead }; });
    throw new Error(`${what} — ${max} 스텝 안에 안 됨 ${JSON.stringify(st)}`);
  }
  return n;
}
/** 보스 러시 시작 (헌터 선택 건너뜀: arcade.startArcade — 헌터 선택 화면이 부르는 것과 같은 입구) */
async function startRush(page, cfg, charId = 'kael') {
  await page.evaluate(() => { const g = window.__game; g._pageHidden = false; g.last = performance.now(); });   // 앞 판이 멈춘 루프를 다시 돌린다 (장면 전환 페이드)
  await page.evaluate(async ([cfg, charId]) => {
    const A = await import('/src/scenes/front/arcade.js');
    A.startArcade(window.__game, { kind: 'bossrush', diff: 'normal', preset: 1, ...cfg }, charId);
  }, [cfg, charId]);
  await waitTop(page, 'bossrush');
  await freeze(page);
}
/** 지금 라운드 보스를 쓰러뜨린다 (보스 러시 규칙 시험이라 보스 고유의 쓰러짐 연출은 건너뛴다 — 장면의 격파 처리 onBossDown 을 그대로 부른다) */
const killBoss = (page) => page.evaluate(() => {
  const g = window.__game, t = g.scenes.find((s) => s.name === 'bossrush'), w = t.world, b = w.boss;
  w.onBossDefeated(b);
  for (const e of w.entities) if (e !== w.player && (e === b || e.kind === 'enemy' || e.kind === 'boss' || e.owner === b || e.summoner === b)) e.dead = true;
});
const runsLog = (page) => page.evaluate(() => window.__fetchLog.filter((r) => /\/api\/runs/.test(r.url)));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ───────────────────────── 코스 표 (Node) ─────────────────────────
test('코스 표: 서버 코스 15줄 그대로 · 규칙 코스 3개(번호 15~17) · 서버는 bossrush:15 이상을 받지 않는다', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/scenes/front/arcade.js'), 'utf8');
  const block = (name) => src.slice(src.indexOf(`export const ${name} = [`), src.indexOf('];', src.indexOf(`export const ${name} = [`)));
  const gd = await import(path.join(ROOT, 'netlify/lib/gamedata.mts'));
  assert.equal([...block('COURSES').matchAll(/\{ name:/g)].length, gd.COURSE_COUNT, 'COURSES 블록 = 서버 COURSE_COUNT (tools/online/test_online.mjs 와 같은 대조)');
  assert.equal(Number(/export const ONLINE_COURSES = (\d+);/.exec(src)?.[1]), gd.COURSE_COUNT, 'ONLINE_COURSES = 서버 COURSE_COUNT');
  const rules = [...block('RULE_COURSES').matchAll(/rule: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(rules, ['relay', 'random6', 'norest'], '규칙 코스 순서 = 번호 15 · 16 · 17');
  assert.match(src, /COURSES\.push\(\.\.\.RULE_COURSES\)/, '규칙 코스는 COURSES 뒤에 이어 붙는다');
  const B = await import(path.join(ROOT, 'netlify/lib/boards.mts'));
  for (const c of [RELAY, RANDOM6, NOREST]) assert.equal(B.parseBoard(`bossrush:${c}:normal`, Date.now(), 'write'), null, `서버가 bossrush:${c} 를 거절 → 규칙 코스는 제출하면 안 된다`);
  assert.ok(B.parseBoard(`bossrush:${gd.COURSE_COUNT - 1}:normal`, Date.now(), 'write'), '마지막 순위표 코스는 받는다');
});

// ───────────────────────── 도우미·메뉴 (브라우저) ─────────────────────────
test('도우미·메뉴: 무작위 6 재현 · 후보가 적을 때 · 코스 줄(메뉴 = 규칙 코스 포함, 명예의 전당 = 순위표 코스만) · 시드 줄 · 「기기 기록」', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx);
  const r = await page.evaluate(async () => {
    const A = await import('/src/scenes/front/arcade.js');
    const pool = A.random6Pool(false, false);
    const d1 = A.dailyRushSeed('20261018'), d2 = A.dailyRushSeed('20261019');
    const days = ['20261018', '20261019', '20261020', '20261021', '20261022'].map((d) => A.random6Bosses(A.dailyRushSeed(d), pool).join(','));
    return {
      pool, d1, d2, kst: A.dailyRushSeed() === Number(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '')),
      a: A.random6Bosses(d1, pool), b: A.random6Bosses(d1, [...pool]), days,
      few: A.random6Bosses(5, pool.slice(0, 4)), dup: A.random6Bosses(5, ['b_nightwing', 'b_nightwing', 'nope', 'b_banshee']),
      none: A.random6Bosses(5, []), first: A.courseBosses(0),
      rules: [A.ruleOf(15), A.ruleOf(16), A.ruleOf(17), A.ruleOf(0), A.ruleOf(14)],
      local: [0, 8, 14, 15, 16, 17, 99, -1, 'x'].map((c) => A.localCourse(c)),
      vis: A.visibleCourses(true, true), menu: A.menuCourses(true, true), on: A.RULE_COURSES_ON,
      san: [15, 16, 17].map((c) => A.sanitizeCfg({ kind: 'bossrush', course: c }, false, null, false).course),
      seed0: A.sanitizeCfg({ rushSeed: 'bogus' }, false).rushSeed, seed1: A.sanitizeCfg({ rushSeed: 'daily' }, false).rushSeed,
      labels: [15, 16, 17].map((c) => A.courseLabel(c)), order: A.relayOrder(window.__game, 'sera'), joined: A.joinedHeroes(window.__game),
    };
  });
  assert.ok(r.pool.length >= 13, `무작위 6 후보 = 1부 보스 13명 이상 (${r.pool.length})`);
  assert.equal(r.d1, 20261018); assert.equal(r.d2, 20261019); assert.ok(r.kst, '오늘의 시드 = 한국 날짜');
  assert.deepEqual(r.a, r.b, '같은 시드 · 같은 후보 → 같은 여섯');
  assert.equal(r.a.length, 6); assert.equal(new Set(r.a).size, 6, '겹치는 보스 없음');
  assert.ok(r.a.every((id) => r.pool.includes(id)), '여섯 모두 후보 안');
  assert.ok(new Set(r.days).size >= 4, `날짜마다 다른 여섯 (${new Set(r.days).size}/5)`);
  assert.equal(r.few.length, 4, '아는 보스가 넷이면 넷 모두'); assert.equal(new Set(r.few).size, 4);
  assert.deepEqual([...r.dup].sort(), ['b_banshee', 'b_nightwing'], '겹침·모르는 id 는 거른다');
  assert.deepEqual(r.none, r.first, '후보가 비면 첫 코스 보스');
  assert.deepEqual(r.rules, ['relay', 'random6', 'norest', null, null]);
  assert.deepEqual(r.local, [false, false, false, true, true, true, true, true, true], '기기 기록 코스 = 규칙 코스 · 서버 표 밖 번호');
  assert.ok(!r.vis.some((c) => c >= 15), `명예의 전당(순위표) 코스 줄에 규칙 코스 없음 ${r.vis}`);
  assert.deepEqual(r.menu.filter((c) => c >= 15), r.on ? [15, 16, 17] : [], `메뉴 코스 줄 (RULE_COURSES_ON=${r.on}) ${r.menu}`);
  assert.deepEqual(r.san, [15, 16, 17], '저장된 설정의 규칙 코스는 그대로 (1부만 아는 플레이어도)');
  assert.equal(r.seed0, 'random'); assert.equal(r.seed1, 'daily');
  assert.deepEqual(r.labels, ['릴레이 · 헌터 교대 6연전', '무작위 6 · 아는 보스 중 여섯', '휴식 없음 · 7~13장 보스 · 점수 ×1.5']);
  assert.deepEqual(r.joined, ['kael', 'sera', 'victor', 'bran'], '처음부터 쓸 수 있는 헌터 넷 (헌터 선택과 같은 규칙)');
  assert.deepEqual(r.order, ['sera', 'victor', 'bran', 'kael'], '릴레이 순서 = 고른 헌터부터');
  // 메뉴: 무작위 6 + 오늘의 시드 → 코스 줄 색 · 시드 줄 · 오른쪽 칸 안내 · 「기기 기록」 꼬리표
  const menu = await page.evaluate(() => {
    const g = window.__game;
    g.meta.arcadeCfg = { kind: 'bossrush', diff: 'normal', preset: 1, course: 16, rushSeed: 'daily' };
    g.go('arcade', {}, { fade: false });
    for (let i = 0; i < 40; i++) g.tick(1 / 60);
    g.render?.();
    const t = g.top, o = t.options();
    const drawn = [];
    const ctx = g.ctx, ft = ctx.fillText;
    ctx.fillText = function (s, ...a) { drawn.push(String(s)); return ft.call(this, s, ...a); };
    try { g.render?.(); } finally { ctx.fillText = ft; }
    return { name: t.name, rows: o.map((x) => [x.id, x.value, x.n]), best: t.bestText(), hint: t.ruleHint('random6'), drawn,
      hints: [t.ruleHint('relay'), t.ruleHint('norest')], course: t.cfg.course };
  });
  assert.equal(menu.name, 'arcade');
  assert.equal(menu.course, 16, '저장된 코스 = 무작위 6');
  assert.deepEqual(menu.rows.map((x) => x[0]), ['diff', 'preset', 'course', 'seed'], '무작위 6 이면 시드 줄');
  assert.equal(menu.rows[2][1], '무작위 6 · 아는 보스 중 여섯');
  assert.equal(menu.rows[3][1], '오늘의 시드'); assert.equal(menu.rows[3][2], 2);
  assert.equal(menu.best, '무작위 6 기록이 아직 없습니다');
  assert.equal(menu.hint, '오늘의 시드 · 오늘 하루는 같은 보스 여섯');
  assert.deepEqual(menu.hints, ['라운드마다 다음 헌터로 교대 · 합류 4명', '라운드 사이 회복 없음 · 점수 ×1.5']);
  for (const s of ['기기 기록', '오늘의 시드 · 오늘 하루는 같은 보스 여섯', '무작위 6 · 아는 보스 중 여섯']) assert.ok(menu.drawn.includes(s), `그려짐: ${s}`);
  // 순위표 코스로 바꾸면 시드 줄·꼬리표가 없어진다
  const plain = await page.evaluate(() => { const t = window.__game.top; t.cfg.course = 0; return t.options().map((x) => x.id); });
  assert.deepEqual(plain, ['diff', 'preset', 'course']);
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 네트워크 ─────────────────────────
test('네트워크: 규칙 코스 셋은 /api/runs 요청 0 (fetch 를 세어 봄) · 대조군 순위표 코스는 POST 1 · 정산 「기기 기록」 · 기기 최고 기록', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx, { init: AUTH });
  // 대조군: 순위표 코스 0 → 로그인 중이면 POST /api/runs (하네스가 요청을 세는지 확인)
  await startRush(page, { course: 0 });
  await page.waitForFunction(() => window.__game.scenes.find((s) => s.name === 'bossrush')?.orun?.state === 'ready', null, { timeout: 10000 });
  const ctrl = await runsLog(page);
  assert.equal(ctrl.length, 1, `대조군 POST /api/runs ${JSON.stringify(ctrl)}`);
  assert.equal(ctrl[0].method, 'POST');
  assert.deepEqual(M.runs.map((r) => r.board), ['bossrush:0:normal']);
  await page.evaluate(() => { const g = window.__game, t = g.scenes.find((s) => s.name === 'bossrush'); t.done = true; g.go('arcade', {}, { fade: false }); });
  await waitTop(page, 'arcade');
  await page.evaluate(() => { window.__fetchLog.length = 0; });
  for (const course of [RELAY, RANDOM6, NOREST]) {
    await startRush(page, { course });
    const s = await page.evaluate(() => { const t = window.__game.scenes.find((x) => x.name === 'bossrush'); return { board: t.board, orun: t.orun?.state, local: t.localOnly, rule: t.rule }; });
    assert.deepEqual({ board: s.board, orun: s.orun, local: s.local }, { board: null, orun: 'none', local: true }, `코스 ${course} (${s.rule}): 보드 없음`);
    await tickUntil(page, "t.phase === 'fight'", 900, `코스 ${course} 첫 라운드`);
    await ticks(page, 60);
    if (course !== NOREST) { await page.evaluate(() => { const g = window.__game, t = g.scenes.find((x) => x.name === 'bossrush'); t.done = true; g.go('arcade', {}, { fade: false }); }); await waitTop(page, 'arcade'); continue; }
    // 휴식 없음: 클리어로 정산까지 (제출 없음 · 「기기 기록」 · 기기 최고 기록)
    await page.evaluate(() => window.__game.scenes.find((x) => x.name === 'bossrush').finish(true));
    await waitTop(page, 'arcadeResults');
    await ticks(page, 240);
    const res = await page.evaluate(() => { const t = window.__game.top; return { rows: t.res.rows.map(([a, b]) => [a, typeof b === 'function' ? 'fn' : b]), onl: t.onl, best: window.__game.meta.bossRushBests?.[17] ?? null, extra: t.res.extra }; });
    assert.ok(res.rows.some(([a, b]) => a === '기록' && b === '기기 기록'), `정산 「기기 기록」 ${JSON.stringify(res.rows)}`);
    assert.ok(res.rows.some(([a, b]) => a === '점수 배율' && b === '×1.5 (휴식 없음)'));
    assert.ok(!res.rows.some(([a]) => a === '온라인 순위'), '온라인 순위 줄 없음');
    assert.equal(res.onl, null);
    assert.ok(res.best && res.best.course === 17 && res.best.time >= 0, `기기 최고 기록 meta.bossRushBests[17] ${JSON.stringify(res.best)}`);
    assert.equal(res.extra.rule, 'norest'); assert.equal(res.extra.local, true);
  }
  await page.waitForTimeout(500);
  const rl = await runsLog(page);
  assert.deepEqual(rl, [], `규칙 코스 셋: /api/runs 요청 0 (실제 ${JSON.stringify(rl)})`);
  assert.equal(M.runs.length, 1, '흉내 서버가 받은 런 시작 = 대조군 하나뿐');
  assert.equal(M.finishes.length, 0, '제출 0');
  const q = await page.evaluate(async () => (await import('/src/core/online.js')).queueSize());
  assert.equal(q, 0, '오프라인 대기열에도 없음');
  const all = await page.evaluate(() => window.__fetchLog.map((r) => r.url.replace(/^https:\/\/game\.test/, '')).filter((u) => u.startsWith('/api/')));
  console.log(`    규칙 코스 셋 동안 /api/ 요청: ${all.length ? [...new Set(all)].join(' ') : '없음'}`);
  assert.ok(!all.some((u) => /\/api\/(runs|boards)/.test(u)), `순위표 요청 없음 ${all}`);
  assert.deepEqual(errs, []);
  await ctx.close();
});
// ───────────────────────── 릴레이 ─────────────────────────
test('릴레이: 라운드 N = 순서[N % 4] · 그 헌터의 빌드 · 동료/탈것/버프/소환물/탄이 넘어가지 않음 · 체력 주머니 · 6라운드 완주', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx);
  await startRush(page, { course: RELAY, preset: 1 }, 'sera');
  const setup = await page.evaluate(() => { const t = window.__game.scenes.find((s) => s.name === 'bossrush'); return { order: t.relay?.order, queue: t.queue, call: t.call?.sub }; });
  assert.deepEqual(setup.order, ['sera', 'victor', 'bran', 'kael'], '순서 = 합류한 헌터 넷, 고른 헌터부터');
  assert.equal(setup.queue.length, 6);
  assert.match(setup.call, /헌터 4명 교대/);
  const seen = [];
  let seraPool = null;
  for (let r = 0; r < 6; r++) {
    await tickUntil(page, `t.phase === 'fight' && t.round === ${r}`, 1500, `라운드 ${r + 1} 전투`);
    const info = await page.evaluate(async (r) => {
      const g = window.__game, t = g.scenes.find((s) => s.name === 'bossrush'), w = t.world, p = w.player, st = g.state;
      const A = await import('/src/scenes/front/arcade.js');
      const S = await import('/src/game/stats.js');
      const id = p.hero.charId;
      // 헌터 선택으로 그 헌터를 골랐을 때의 빌드 (같은 설정)
      const ref = A.buildArcadeState({ ...t.cfg, asc: undefined }, id, { preview: true });
      const rh = ref.heroes[id], rs = S.computeStats(ref, rh), ps = S.computeStats(st, p.hero);
      const keys = ['hp', 'mp', 'atk', 'def', 'mag', 'res', 'crit', 'critDmg', 'moveSpd', 'atkSpd'];
      const wpn = (s, h) => s.inventory.find((i) => i.uid === h.equip.weapon)?.baseId ?? null;
      // 장비는 부가 능력치가 무작위라 같은 빌드를 두 번 만들어도 수치가 다르다 → 칸마다 (베이스 · 등급 · 강화) 를 비교하고,
      // 능력치는 '그 영웅의 빌드로 계산한 값' 과 지금 영웅의 값이 같은지 (넘어온 버프·탈것 보너스 없음) 본다
      const gear = (s, h) => ['weapon', 'body', 'head', 'cloak'].map((k) => { const it = s.inventory.find((i) => i.uid === h.equip[k]); return it ? `${k}:${it.baseId}:${it.rarity}:${it.level}` : `${k}:-`; }).join(' ');
      return {
        id, expect: t.relayHeroAt(r), charId: st.charId, worldHero: w.hero === p.hero, players: w.entities.filter((e) => e.kind === 'player').length,
        cls: [p.hero.classId, rh.classId], lv: [p.hero.level, rh.level], slots: [JSON.stringify(p.hero.slots), JSON.stringify(rh.slots)],
        wpn: [wpn(st, p.hero), wpn(ref, rh)], gear: [gear(st, p.hero), gear(ref, rh)], skills: [JSON.stringify(p.hero.skills), JSON.stringify(rh.skills)],
        asc: [p.hero.asc ?? null, rh.asc ?? null], wtype: [S.computeStats(st, p.hero).weaponType ?? null, rs.weaponType ?? null],
        live: keys.map((k) => [k, p.stats[k], ps[k]]).filter(([, a, b]) => a !== b),
        buffs: Object.keys(p.buffs).filter((k) => p.buffs[k] > 0), mount: p.mount, hp: p.hp, maxHp: p.stats.hp, call: t.call?.sub ?? null,
        companions: w.entities.filter((e) => e.kind === 'companion' || e.kind === 'mount').length, cmpActive: !!w.companions?.active,
      };
    }, r);
    seen.push(info.id);
    assert.equal(info.id, info.expect, `라운드 ${r + 1}: ${info.id} = 순서[${r} % 4]`);
    assert.equal(info.id, setup.order[r % 4]);
    assert.equal(info.charId, info.id, 'state.charId = 지금 헌터');
    assert.ok(info.worldHero, 'world.hero = 지금 헌터');
    assert.equal(info.players, 1, '월드의 영웅은 하나 (앞 헌터는 빠졌다)');
    assert.deepEqual(info.cls[0], info.cls[1], `${info.id} 직업 = 헌터 선택 빌드`);
    assert.deepEqual(info.lv[0], info.lv[1]);
    assert.equal(info.slots[0], info.slots[1], `${info.id} 기술 칸`);
    assert.equal(info.wpn[0], info.wpn[1], `${info.id} 무기`);
    assert.ok(info.wpn[0], `${info.id} 무기 장착`);
    assert.equal(info.gear[0], info.gear[1], `${info.id} 장비 (베이스·등급·강화) = 헌터 선택 빌드`);
    assert.equal(info.skills[0], info.skills[1], `${info.id} 배운 기술·레벨`);
    assert.deepEqual(info.asc[0], info.asc[1]); assert.deepEqual(info.wtype[0], info.wtype[1], `${info.id} 무기 종류`);
    assert.deepEqual(info.live, [], `${info.id} 영웅 능력치 = 자기 빌드로 계산한 값 (넘어온 버프·보너스 없음) ${JSON.stringify(info.live)}`);
    assert.deepEqual(info.buffs, [], `${info.id} 넘어온 버프 없음`);
    assert.equal(info.mount, null, '탈것 없음');
    assert.equal(info.companions, 0, '동료·탈것 엔티티 없음'); assert.equal(info.cmpActive, false, '아케이드는 동료 시스템이 쉰다');
    if (r >= 1 && r <= 3) assert.equal(info.hp, info.maxHp, `처음 나온 ${info.id}: 체력 가득`);
    if (r === 5) break;
    // 다음 교대 전에 앞 헌터에게 '넘어가면 안 되는 것'을 붙인다: 버프 · 무한 수명 스킬 연출 · 동료/탈것 · 주인이 영웅인 소환물 · 영웅 탄
    await page.evaluate(async (r) => {
      const g = window.__game, t = g.scenes.find((s) => s.name === 'bossrush'), w = t.world, p = w.player;
      const { SkillFx } = await import('/src/game/skills.js');
      p.buffs.haste = 99; p.buffs.rage = 99; p.buffs.invincible = 99;
      const mk = (kind, o = {}) => { const e = new SkillFx({ x: p.cx, y: p.cy, w: 20, h: 20, life: 1e9, d: {} }); e.kind = kind; Object.assign(e, o); w.add(e); return e; };
      window.__leak = [mk('effect'), mk('companion', { owner: p }), mk('mount', { rider: p }), mk('summon', { owner: p }), mk('projectile', { team: 'player' })];
      window.__oldPlayer = p;
      if (r === 0) p.hp = Math.round(p.stats.hp * 0.5);   // 세라는 체력 절반으로 내보낸다 → 5라운드에 다시 나올 때 그 체력 + 35% 회복
      if (r === 3) {
        // 교대 직후 라운드 사이 회복을 엿본다 (누가 · 얼마에서 · 얼마나)
        window.__heals = [];
        const proto = Object.getPrototypeOf(p), orig = proto.heal;
        proto.heal = function (amount, show) { window.__heals.push({ id: this.hero?.charId, before: this.hp, amount }); return orig.call(this, amount, show); };
        window.__unheal = () => { proto.heal = orig; };
      }
    }, r);
    await killBoss(page);
    await tickUntil(page, `t.phase === 'ready' && t.round === ${r + 1}`, 600, `라운드 ${r + 1} → ${r + 2} 교대`);
    const after = await page.evaluate(() => {
      const w = window.__game.world, old = window.__oldPlayer;
      const t = window.__game.scenes.find((s) => s.name === 'bossrush');
      return { leakAlive: window.__leak.filter((e) => !e.dead && w.entities.includes(e)).map((e) => e.kind), oldIn: w.entities.includes(old), oldDead: old.dead, same: w.player === old, buffs: Object.keys(w.player.buffs).filter((k) => w.player.buffs[k] > 0), call: t.call?.sub ?? null, id: w.player.hero.charId };
    });
    const nm = { sera: '세라피나', victor: '빅터', bran: '브란', kael: '카엘' }[after.id];
    assert.match(after.call ?? '', new RegExp(`${nm} 차례$`), `라운드 호출에 다음 헌터 이름 ${after.call}`);
    assert.deepEqual(after.leakAlive, [], `넘어간 것 ${after.leakAlive}`);
    assert.equal(after.oldIn, false, '앞 헌터는 월드에서 빠진다'); assert.equal(after.oldDead, true); assert.equal(after.same, false);
    assert.deepEqual(after.buffs, [], '새 헌터 버프 없음');
    if (r === 0) {
      // 세라가 나갈 때 남긴 체력 = 주머니 (절반으로 내보냈다 · 정리 시간 동안의 자연 회복은 그대로 둔다)
      seraPool = await page.evaluate(() => { const t = window.__game.scenes.find((s) => s.name === 'bossrush'); return { ...t.relay.pools.sera, max: window.__oldPlayer.stats.hp }; });
      assert.ok(seraPool.hp >= seraPool.max * 0.5 - 1 && seraPool.hp < seraPool.max * 0.9, `세라 주머니 = 남긴 체력 ${seraPool.hp}/${seraPool.max}`);
    }
    if (r === 3) {
      // 5라운드: 세라가 다시 나온다 — 주머니 체력에서 시작해 라운드 사이 회복(35%, 직업 회복 배율 그대로)을 받는다
      const back = await page.evaluate(() => { window.__unheal?.(); const p = window.__game.world.player; return { id: p.hero.charId, hp: p.hp, max: p.stats.hp, heals: window.__heals }; });
      assert.equal(back.id, 'sera');
      const h = back.heals.find((e) => e.id === 'sera');
      assert.ok(h, `세라 라운드 사이 회복 ${JSON.stringify(back.heals)}`);
      assert.ok(Math.abs(h.before - seraPool.hp) <= 1, `세라는 주머니 체력에서 시작 ${h.before} vs ${seraPool.hp}`);
      assert.ok(Math.abs(h.amount - back.max * 0.35) <= 1, `회복량 = 최대 체력 35% ${h.amount}`);
      assert.ok(back.hp > seraPool.hp && back.hp <= back.max, `세라 체력 주머니 ${seraPool.hp} → ${back.hp}/${back.max}`);
    }
  }
  assert.deepEqual(seen, ['sera', 'victor', 'bran', 'kael', 'sera', 'victor']);
  // 6라운드 격파 → 완주 → 정산 (릴레이 줄 · 기기 기록)
  await killBoss(page);
  await tickUntil(page, "g.top.name === 'arcadeResults'", 900, '완주 → 정산');
  await ticks(page, 200);
  const res = await page.evaluate(() => { const t = window.__game.top; return { title: t.res.title, rows: t.res.rows.map(([a, b]) => [a, typeof b === 'function' ? 'fn' : b]), relay: t.res.extra?.relay, state: window.__game.state?.arcade ? 'arcade' : 'restored' }; });
  assert.equal(res.title, 'BOSS RUSH COMPLETE');
  assert.ok(res.rows.some(([a, b]) => a === '릴레이' && b === '세라피나 → 빅터 → 브란 → 카엘'), JSON.stringify(res.rows));
  assert.ok(res.rows.some(([a, b]) => a === '기록' && b === '기기 기록'));
  assert.deepEqual(res.relay, ['sera', 'victor', 'bran', 'kael']);
  assert.equal(res.state, 'restored', '정산 뒤 임시 세이브를 거둔다');
  // 교대 실패 경로: 없는 헌터 · 빌드가 빠진 헌터 → null, 영웅 그대로
  await startRush(page, { course: RELAY, preset: 0 }, 'kael');
  await tickUntil(page, "t.phase === 'fight'", 900, '두 번째 릴레이 첫 라운드');
  const bad = await page.evaluate(() => {
    const g = window.__game, t = g.scenes.find((s) => s.name === 'bossrush'), w = t.world, p = w.player;
    const a = t.relayHandover('nobody'); delete g.state.heroes.victor; const b = t.relayHandover('victor'); const c = t.relayHandover('kael');
    return { a, b, c, same: w.player === p, id: w.player.hero.charId };
  });
  assert.deepEqual(bad, { a: null, b: null, c: null, same: true, id: 'kael' }, '교대할 수 없으면 아무것도 바꾸지 않는다');
  // 합류한 헌터가 늘면 (리아·이졸데 해금) 순서도 늘고, 1라운드 뒤 교대는 순서[1] — 헌터 선택과 같은 해금 규칙
  await page.evaluate(() => { const g = window.__game, t = g.scenes.find((s) => s.name === 'bossrush'); t.done = true; g.meta.unlockedChars = ['lia', 'isolde']; g.go('arcade', {}, { fade: false }); });
  await waitTop(page, 'arcade');
  await startRush(page, { course: RELAY, preset: 1 }, 'lia');
  const six = await page.evaluate(() => { const g = window.__game, t = g.scenes.find((s) => s.name === 'bossrush'); return { order: t.relay.order, built: t.relay.order.filter((id) => !!g.state.heroes[id]), id: t.world.player.hero.charId, call: t.call?.sub }; });
  assert.deepEqual(six.order, ['lia', 'isolde', 'kael', 'sera', 'victor', 'bran'], `해금 헌터 포함 순서 ${six.order}`);
  assert.deepEqual(six.built, six.order, '순서의 헌터 모두 빌드가 있다');
  assert.equal(six.id, 'lia'); assert.match(six.call, /헌터 6명 교대/);
  await tickUntil(page, "t.phase === 'fight' && t.round === 0", 1500, '해금 릴레이 1라운드');
  await killBoss(page);
  await tickUntil(page, "t.phase === 'ready' && t.round === 1", 600, '해금 릴레이 교대');
  assert.equal(await page.evaluate(() => window.__game.world.player.hero.charId), 'isolde', '2라운드 = 순서[1] (이졸데)');
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 휴식 없음 ─────────────────────────
test('휴식 없음: 라운드 사이 체력·하트 그대로 (보통 코스는 회복) · 점수 ×1.5', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx);
  const probe = async (course) => {
    await startRush(page, { course });
    await tickUntil(page, "t.phase === 'fight'", 900, `코스 ${course} 1라운드`);
    const before = await page.evaluate(() => {
      const w = window.__game.world, p = w.player;
      p.hp = Math.round(p.stats.hp * 0.4);
      const s0 = w.run.score; w.addScore(1000); const gain = w.run.score - s0;
      return { hp: p.hp, max: p.stats.hp, hearts: w.run.hearts, gain, mult: w.diff.scoreMult ?? 1 };
    });
    await killBoss(page);
    await tickUntil(page, "t.phase === 'ready' && t.round === 1", 600, `코스 ${course} 다음 라운드`);
    const after = await page.evaluate(() => { const w = window.__game.world, p = w.player; return { hp: p.hp, hearts: w.run.hearts, banner: w.banner?.sub ?? '' }; });
    await page.evaluate(() => { const g = window.__game, t = g.scenes.find((s) => s.name === 'bossrush'); t.done = true; g.go('arcade', {}, { fade: false }); });
    await waitTop(page, 'arcade');
    return { before, after };
  };
  const norest = await probe(NOREST), normal = await probe(1);
  assert.equal(norest.before.gain, Math.round(1000 * 1.5 * norest.before.mult), `휴식 없음 점수 ×1.5 (${norest.before.gain})`);
  assert.equal(normal.before.gain, Math.round(1000 * normal.before.mult), '보통 코스 점수 ×1');
  assert.ok(Math.abs(norest.after.hp - norest.before.hp) <= Math.ceil(norest.before.max * 0.02), `휴식 없음: 체력 그대로 ${norest.before.hp} → ${norest.after.hp}`);
  assert.equal(norest.after.hearts, norest.before.hearts, '휴식 없음: 하트 그대로');
  assert.ok(normal.after.hp >= normal.before.hp + normal.before.max * 0.34, `보통 코스: 35% 회복 ${normal.before.hp} → ${normal.after.hp}`);
  assert.equal(normal.after.hearts, Math.min(99, normal.before.hearts + 10), '보통 코스: 하트 +10');
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── 무작위 6 ─────────────────────────
test('무작위 6: 오늘의 시드 → 두 번 시작해도 같은 여섯 (도우미와 같음) · 무작위 → 판마다 다름 · 정산 시드 줄', async () => {
  const M = makeMock();
  const ctx = await newContext(M);
  const { page, errs } = await openGame(ctx);
  const q = async (rushSeed) => {
    await startRush(page, { course: RANDOM6, rushSeed });
    const r = await page.evaluate(async () => {
      const A = await import('/src/scenes/front/arcade.js');
      const t = window.__game.scenes.find((s) => s.name === 'bossrush');
      return { queue: [...t.queue], seed: t.seed, daily: t.seedDaily, expect: A.random6Bosses(A.dailyRushSeed(), A.random6Pool(t.p2, t.ex)), pool: A.random6Pool(t.p2, t.ex), call: t.call?.sub };
    });
    await page.evaluate(() => { const g = window.__game, t = g.scenes.find((s) => s.name === 'bossrush'); t.done = true; g.go('arcade', {}, { fade: false }); });
    await waitTop(page, 'arcade');
    return r;
  };
  const d1 = await q('daily'), d2 = await q('daily');
  assert.deepEqual(d1.queue, d2.queue, '오늘의 시드: 같은 여섯');
  assert.deepEqual(d1.queue, d1.expect, '= random6Bosses(dailyRushSeed(), 후보)');
  assert.equal(d1.daily, true); assert.match(d1.call, /오늘의 시드/);
  assert.equal(d1.queue.length, 6); assert.equal(new Set(d1.queue).size, 6); assert.ok(d1.queue.every((id) => d1.pool.includes(id)));
  const rs = [await q('random'), await q('random'), await q('random')];
  assert.ok(new Set(rs.map((r) => r.queue.join(','))).size >= 2, '무작위: 판마다 다른 여섯');
  assert.ok(rs.every((r) => r.daily === false && Number.isInteger(r.seed)));
  // ?seed= 고정 (시험·재현): 같은 시드 → 같은 여섯, 정산에 시드 줄
  await startRush(page, { course: RANDOM6, seed: 4242 });
  const fixed = await page.evaluate(() => { const t = window.__game.scenes.find((s) => s.name === 'bossrush'); return { queue: [...t.queue], seed: t.seed }; });
  assert.equal(fixed.seed, 4242);
  await page.evaluate(() => window.__game.scenes.find((s) => s.name === 'bossrush').finish(false));
  await waitTop(page, 'arcadeResults');
  const rows = await page.evaluate(() => window.__game.top.res.rows.map(([a, b]) => [a, typeof b === 'function' ? 'fn' : b]));
  assert.ok(rows.some(([a, b]) => a === '시드' && b === '4242'), JSON.stringify(rows));
  assert.ok(rows.some(([a, b]) => a === '기록' && b === '기기 기록'));
  const again = await page.evaluate(async (seed) => { const A = await import('/src/scenes/front/arcade.js'); return A.random6Bosses(seed, A.random6Pool(false, false)); }, 4242);
  assert.deepEqual(again, fixed.queue, '같은 시드 → 같은 여섯');
  assert.deepEqual(errs, []);
  await ctx.close();
});

// ───────────────────────── Fold 펼침 화면 한 장 (--fold) ─────────────────────────
if (FOLD) {
  fs.mkdirSync(FOLD, { recursive: true });
  const M = makeMock();
  const ctx = await newContext(M, 'fold_open');
  const { page, errs } = await openGame(ctx);
  await page.evaluate(() => {
    const g = window.__game;
    g.meta.arcadeCfg = { kind: 'bossrush', diff: 'normal', preset: 1, course: 16, rushSeed: 'daily' };
    g.go('arcade', {}, { fade: false });
  });
  await waitTop(page, 'arcade');
  await page.waitForTimeout(600);
  // 코스 줄을 고른 모습 (row 0 = 모드 카드, 1.. = 옵션 줄 → 3 = 옵션[2] 코스)
  const sel = await page.evaluate(() => { const t = window.__game.top; t.row = 3; const o = t.options(); return { name: t.name, kind: t.kind, ids: o.map((x) => x.id), course: o[2]?.value, seed: o[3]?.value }; });
  assert.deepEqual(sel, { name: 'arcade', kind: 'bossrush', ids: ['diff', 'preset', 'course', 'seed'], course: '무작위 6 · 아는 보스 중 여섯', seed: '오늘의 시드' }, `Fold 화면 준비 ${JSON.stringify(sel)}`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(FOLD, 'rush_course_row.png') });
  assert.deepEqual(errs, []);
  await ctx.close();
  await browser.close();
  console.log(`Fold 화면 1장: ${path.join(FOLD, 'rush_course_row.png')}`);
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
console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
