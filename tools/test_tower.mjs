// 무한의 탑 시험 (헤드리스 Chromium, 고정 스텝): node tools/test_tower.mjs [--filter=문자열] [--shots=폴더]
//  - API 는 이 파일 안의 흉내(docs/specs/online.md §2)로 답하고, 게임은 디스크에서 https://game.test 로 내보낸다 (로그인 = bn_auth 미리 넣기)
//  - 게임 루프를 멈추고(game._pageHidden) game.tick(1/60) 을 직접 돌린다 → 부하와 상관없이 같은 결과
// 확인: 층 계획 재현(같은 시드 → 같은 방·적, 다른 시드 → 다름)·방 풀 검증(tools/tower_rooms.mjs) ·
//       메뉴 → 헌터 선택 → 탑 · 1층 적 = 계획 · 처치 → 출구(▲) → 2층 · 5층 보스 등장·격파 → 축복(키보드) → 출구(가만히 서 있기) ·
//       축복 12종 효과(능력치·버프·가시·가속·대시 무적·부활) · 10층 안식처(회복 + 축복 셋, 패드로 고르기) · 일시정지 축복 칸 ·
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
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };
const TOKEN = 'T'.repeat(43);
const AUTH = { bn_auth: JSON.stringify({ id: 'hunter01', token: TOKEN }) };

// ───────────────────────── API 흉내 ─────────────────────────
function makeMock() {
  const M = { log: [], runs: [], finishes: [] };
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
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
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
  const P = new T.TowerPlanner(seed ?? t.seed, { stages: t.planner.stages, order: t.planner.order, enemies: t.planner.enemies, bosses: t.planner.bosses, P: t.planner.P, eliteBase: t.planner.eliteBase });
  const p = P.plan(n);
  return { kind: p.kind, key: p.key ?? null, bossId: p.bossId ?? null, foes: p.enemies.map((e) => e.id + (e.elite ? '*' : '')).sort() };
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
  // 방 풀 검증 (validate_maps --stages): 오류 0
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/tower_rooms.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /오류 0개/);
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
  const took5 = await page.evaluate(() => window.__game.top.takenOrder);
  assert.deepEqual(took5, [offer5[2]], '→ 다음 카드 = 세 번째');
  await tickUntil(page, 't.floor === 6', 400, '가만히 서 있으면 6층');
  assert.equal(await page.evaluate(() => window.__game.top.cleared), 5);

  // 축복 12종 효과 (6층 전투 중)
  await tickUntil(page, "t.phase === 'fight'", 200, '6층 전투');
  const fx = await page.evaluate(() => {
    const t = window.__game.top, w = t.world, p = w.player, out = {};
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
  await tickUntil(page, "g.top.name === 'tower' && t.phase === 'gate'", 200, '안식처 → 출구');
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
    await page.waitForFunction(() => window.__game.top?.name === 'tower' && window.__game.top.takenOrder.length > 0, null, { timeout: 8000 });
    assert.equal(await page.evaluate(() => window.__game.top.takenOrder.at(-1)), pt.id);
    await freeze(page);
    await ticks(page, 10);
    await shot(page, `tower_${vp}`);
    assert.deepEqual(errs, []);
    await ctx.close();
  });
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
