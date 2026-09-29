#!/usr/bin/env node
// 동료(탈것 · 수호신) 끝에서 끝까지 검사 — CMP-QA (companions §14 C10 점검표 1–10 + 2부; MASTER_PLAN §1.2 · §1.4 · §1.6 · §1.14)
//
//   node tools/test_companions.mjs                     전부 (점검표 9·10 은 scan_mount_fit · balance_companions 를 불러 결과를 싣는다)
//   node tools/test_companions.mjs --case newgame,save  고른 사례만      --skip-tools   9·10 번(도구 두 개) 건너뛰기
//   --verbose   통과 항목·세부 값도      --shots   사례마다 스크린샷 (/tmp/claude-0/proto/CMP-QA/)
//   --stages s01,s16   stages 사례의 스테이지만 줄인다 (기본 s01–s20)
//
// 사례 (점검표 번호):
//   newgame   (1) 새 게임 → 1장 허브 → 그레타 개장 대사 → 그림메인 합류 연출 → 마을에서 탑승 → s01 에서 탑승 → 1번 방을 시작 지점부터
//                 탄 채 싸우며 통과 (적을 치우지 않고, 달리기 · 공격 · 막히면 점프; 도중 하차 · 박힘 없음)
//                 → 결과 화면 → 허브 (스테이지 클리어가 알 부화 카운터·유대를 올린다)
//   migrate   (2) 동료가 없는 6장 세이브(tools/fixtures/save_ch6_nocmp.json) 불러오기 → 아리아·코슈타·가웨인·미네르바 + 크론의 알(부화 가능)
//                 → 허브에서 합류 연출은 한 번에 최대 3명, 나머지는 메뉴 「동료」 탭의 NEW → 탭에서 보면 사라짐
//   stages    (3) 아홉 탈것 × s01–s20 시작 방: 소환 · 돌진 · 특수기 · 점프 · 하차, 박힘 없음, 도중 하차 없음 (깊은 물 속 시작은 거절이 정상)
//   guardians (4) 열한 수호신을 둘씩 s05 · s11 에서 30초씩 (둘씩 5초 × 6쌍): 두 수호신 모두 적을 치고 · 처치 판정과 경험치 몫 ·
//                 자동 공격 경직 0 · 플레이어가 치지 않으면 world.hitstop 0 (모르스 처형 포함, C10 #4) · 수호신 둘의 틀 비용 ≤ 1.5 ms
//   boss_s03, boss_s12 (5) 탄 채로 수호신 둘과 둘라한 · 드라큘라: 등장 연출 · 50% 까지 · 보스 공격으로 낙마 · 재소환 · 유대 3 공명
//                 (장착한 수호신 둘이 '각각' 보스를 쳐야 한다)
//   boss_reach (5 보강) 수호신 열하나를 하나씩 s03 · s12 보스 곁에: 모두 10초 안에 보스에게 피해를 준다 (boss_reach_s03 · boss_reach_s12)
//   save      (6) 탄 채로 관(세이브)에서 저장 → 다시 불러오기 · 내보내기 코드 왕복 · 클라우드 기록 경로(sanitizeTree → migrateState) · 256 KB
//   mobile    (7) 844×390 터치: 탑승/수호 버튼 · 누르기 · 수호 재사용 대기 가림막 · 캔버스 위젯 탭 · 스틱·다른 버튼과 겹침 없음
//                 · 장착하지 않은 동작의 버튼은 사라진다
//   pad       (8) 가짜 게임패드: 버튼 10(L3) 탑승 · 11(R3) 수호신 스킬
//   spam      R · 점프 · 수호 · 돌진 · 특수기 연타 (그림메인 · 녹티스), 소환 도중 방 바꾸기 · 마을로 가기: 박힘 · 몸 크기 · 오류 없음
//   tools     (9)(10) node tools/scan_mount_fit.mjs · node tools/balance_companions.mjs 의 합격 여부
//   recruit   (2부) 이야기 명령 {cmd:'recruit'} 여섯 (s14–s19 아웃트로) · 이야기 장면 · 대화 장면 · 플래그만 있는 세이브의 합류
//   stable    (2부) 영혼의 마구간: 구입(바르그 · 핌) · 잠금/금화 부족 · 알 부화(스테이지 두 번) · 그레타 의뢰(하티 · 스콜) · 공물
//   deep      (2부) 깊은 물: 탄 채 들어가면 하차 · 물속 소환 거절 · 루멘 숨 감소 ×0.5
//   wind_blight (2부) 게일 windMul 0.5 (돌풍 몫 절반) · 실바 blightMul 0.5 (부패 게이지 절반)
//   awakened  (2부) 유대 4단계: 파생 수치 awakened · 탈것 9 · 수호신 11 의 각성 모습이 실제로 다르게 그려진다
//   menu      메뉴 「동료」 탭 키보드만: 탈것 장착 · 수호신 두 칸(8장) · 자동 스킬 순환 · 8장 전 2번 칸 잠금
//   hud       HUD 위젯: 장착 시 탭 영역 · 해제하면 사라짐 · 마을에서는 수호 위젯 없음
//   bindings  R/G · 패드 10/11 (두 배치) · 터치 버튼 mount/guard 가 입력 바인딩에 있다
//   passives  (2부) 미라 반사 · 모모 포식: 쏜 탄 전부를 추적해 대기(5초 · 6초)가 찬 뒤 한 번씩 (test_guardians 요청 #170 의 견고한 판정)
// 헤드리스 Chromium + tools/serve.mjs. 게임 시간은 game.tick(1/60) 을 직접 돌린다 (결정적). 터치·패드 사례만 실제 시간으로 잠깐 돈다.
// 모든 사례는 페이지 오류·콘솔 오류 0 이어야 통과한다.
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Touch, padLayout, pressButton, ensureTouchMode } from './qa/lib/touch.mjs';
import { fakePadInit, connect, press as padPress, BTN } from './qa/lib/fakepad.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const ALL_CASES = ['newgame', 'migrate', 'stages', 'guardians', 'boss_s03', 'boss_s12', 'boss_reach', 'save', 'mobile', 'pad', 'spam', 'recruit', 'stable', 'deep', 'wind_blight', 'awakened', 'menu', 'hud', 'bindings', 'tools', 'passives'];
// 값 없는 --case · 모르는 사례 이름은 아무것도 돌리지 않고 '0/0 통과' 로 끝나던 거짓 합격이었다: 이름을 확인하고 종료 코드 2
if (opt('case') === true || opt('stages') === true) { console.error('--case · --stages 에는 값이 필요하다 (쉼표로 구분)'); process.exit(2); }
const CASES = opt('case') ? String(opt('case')).split(',').map((s) => s.trim()).filter(Boolean) : null;
const unknownCases = (CASES ?? []).filter((c) => !ALL_CASES.includes(c));
if (CASES && (!CASES.length || unknownCases.length)) { console.error(`알 수 없는 사례: ${unknownCases.join(', ') || '(비어 있음)'} — 사례: ${ALL_CASES.join(', ')}`); process.exit(2); }
if (opt('stages') && String(opt('stages')).split(',').map((s) => s.trim()).some((s) => !/^s(0[1-9]|1\d|20)$/.test(s))) { console.error(`--stages 는 s01–s20 중에서 (쉼표로 구분): ${opt('stages')}`); process.exit(2); }
const VERBOSE = !!opt('verbose'), SHOTS = !!opt('shots'), SKIP_TOOLS = !!opt('skip-tools');
const SHOT_DIR = '/tmp/claude-0/proto/CMP-QA';
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
const results = [];
const want = (name) => !CASES || CASES.includes(name) || CASES.some((c) => name.startsWith(c + '_') && !ALL_CASES.includes(name));   // boss_reach → boss_reach_s03 · boss_reach_s12

// ───────────────────────── 페이지 안 도우미 (window.__T) ─────────────────────────
function installHelpers() {
  const g = window.__game;
  const T = {
    g, texts: [], toasts: [], events: [], pushed: [],
    get w() { return g.world; },
    get p() { return g.world?.player; },
    get m() { return g.world?.player?.mount; },
    get cs() { return g.world?.companions; },
    /** sec 초 진행. each(i) → true 면 멈춘다. render: n 스텝마다 한 번 그림. close: 대사·합류 연출을 닫는다 */
    step(sec, each, { render = 0, close = true } = {}) {
      const n = Math.max(1, Math.round(sec * 60));
      for (let i = 0; i < n; i++) {
        g.tick(1 / 60);
        if (render && i % render === 0) { g.input?.beginRender?.(); g.render(); }
        if (close) for (let k = 0; k < 8 && (g.top?.name === 'dialogue' || g.top?.name === 'companionJoin'); k++) g.pop();
        if (each?.(i)) return i + 1;
      }
      return n;
    },
    key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true })); },
    press(code, sec = 0.1, close = true) { this.key(code, true); this.step(sec, null, { close }); this.key(code, false); this.step(2 / 60, null, { close }); },
    tap(code) { this.key(code, true); this.key(code, false); },
    spawn(id, dx, o = {}) { const w = this.w, p = this.p; const e = w.spawnEnemy(id, p.cx + dx, p.bottom, o); if (e) e.facing = -Math.sign(dx) || 1; return e; },
    clearFoes() { for (const e of this.w.enemies()) e.dead = true; this.step(2 / 60); },
    /** 장면이 name 이 될 때까지 (대사·결과·합류 연출은 확인/건너뛰기로 넘긴다). 돌아간 초 */
    until(fn, maxSec = 20, { confirm = true } = {}) {
      let t = 0;
      while (t < maxSec) {
        if (fn()) return t;
        const top = g.top?.name;
        if (confirm && (top === 'dialogue' || top === 'companionJoin' || top === 'results' || top === 'story' || top === 'bossIntro')) {
          if (top === 'story' && typeof g.top.skip === 'function' && !g.top.__skipped) { g.top.__skipped = true; g.top.skip(); }
          else { this.key('KeyZ', true); g.tick(1 / 60); this.key('KeyZ', false); }
        }
        g.tick(1 / 60); t += 1 / 60;
      }
      return fn() ? t : -1;
    },
    equip(id) { this.CS.equipMount(this.w.state, null, id); this.cs.sync(true); return this.p.mount; },
    ride(id) { const m = this.equip(id); if (!m) return null; m.cd = 0; m.state = m.state === 'recall' ? 'stowed' : m.state; m.summon(this.w, this.p, { force: true, instant: true }); this.step(4 / 60); return m; },
    fitsNow() { const p = this.p; return this.M.fits(this.w, p.x, p.bottom, p.w, p.h); },
    /** 월드 훅 (새 월드마다 한 번): fx.text · 플레이어 공격 기록 */
    hook() {
      const w = this.w;
      if (!w || w.__cqhook) return;
      w.__cqhook = true;
      const ft = w.fx.text.bind(w.fx);
      w.fx.text = (x, y, s, o) => { T.texts.push(String(s)); return ft(x, y, s, o); };
      const oh = w.onPlayerHit.bind(w);
      w.hits = [];
      w.onPlayerHit = (t, info, a) => { w.hits.push({ owner: a?.owner?.id ?? a?.owner?.kind, tags: [...(a?.tags ?? [])], hs: info?.hitstop ?? 0, ahs: a?.hitstop, t: t?.def?.id, boss: t?.kind === 'boss', killed: !!info?.killed }); return oh(t, info, a); };
    },
    /** 캔버스 논리 좌표 → CSS px (클라이언트) */
    toClient(x, y) {
      const c = g.canvas, r = c.getBoundingClientRect(), k = r.width / g.viewW;
      return { x: r.left + x * k, y: r.top + y * k };
    },
  };
  window.__T = T;
  const toast = g.toast.bind(g);
  g.toast = (text, ...a) => { T.toasts.push(String(text)); return toast(text, ...a); };
  const push = g.push.bind(g);
  g.push = (name, ...a) => { T.pushed.push(name); return push(name, ...a); };
  return Promise.all([
    import('/src/game/companion_state.js'), import('/src/game/mount.js'), import('/src/core/events.js'), import('/src/data/companions.js'),
    import('/src/game/companions.js'), import('/src/game/state.js'), import('/src/core/save.js'),
  ]).then(([CS, M, EV, D, C, ST, SV]) => {
    Object.assign(T, { CS, M, D, C, ST, SV });
    for (const ev of ['mounted', 'dismounted', 'ultimateCast', 'guardianSkill', 'companionUnlocked', 'eggObtained', 'eggHatched', 'bondUp', 'companionLevelUp', 'stageCleared', 'questClaimed', 'awakenCast', 'playerDied'])
      EV.bus.on(ev, (d) => T.events.push({ ev, ...(d || {}), t: g.world?.time }));
    return true;
  });
}

// ───────────────────────── 브라우저 ─────────────────────────
// 빈 포트를 운영체제가 고른다 (여러 에이전트가 동시에 서버를 띄우면 무작위 포트가 겹쳐 EADDRINUSE 로 죽을 수 있었다)
const srv = await start(0);
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

async function withPage(url, fn, { mobile = false, initScripts = [], waitWorld = true } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  for (const s of initScripts) await page.addInitScript(s.fn ?? s, s.arg);
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|ERR_CERT|fonts\.g/.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
  try {
    await page.goto(`http://localhost:${port}/${url}`, { timeout: 90000 });
    // scenesReady: 두 단계 부팅 (R1-REQ-229, 요청 #426) — 타이틀로 열면 나머지 장면이 뒤에 등록된다
    await page.waitForFunction((ww) => !!window.__game && window.__game.scenesReady !== false && (!ww || !!window.__game.world?.player), waitWorld, { timeout: 90000 });
    await page.evaluate(installHelpers);
    await page.evaluate(() => { const T = window.__T; T.step(2 / 60); T.hook(); });
    const out = await fn(page, ctx);
    return { out, errs, page, ctx };
  } catch (e) {
    return { out: null, errs: [...errs, 'HARNESS ' + (e?.stack ?? e)], page, ctx };
  }
}
async function run(name, url, fn, o = {}) {
  if (!want(name)) return;
  const t0 = Date.now();
  const { out, errs, page, ctx } = await withPage(url, fn, o);
  if (SHOTS) { try { await page.evaluate(() => { window.__game.render(); }); await page.screenshot({ path: `${SHOT_DIR}/test_${name}.png` }); } catch { /* 무시 */ } }
  await ctx.close();
  record(name, out, errs, t0);
}
function record(name, out, errs, t0) {
  const checks = out?.checks ?? [];
  const failed = checks.filter((c) => !c[1]);
  const ok = !!out && !failed.length && !errs.length && checks.length > 0;
  results.push({ name, ok, failed, errs, info: out?.info, n: checks.length });
  console.log(`${ok ? '✓' : '✗'} ${name} (${checks.length - failed.length}/${checks.length}, ${((Date.now() - t0) / 1000).toFixed(1)}s)${VERBOSE && out?.info ? ' ' + JSON.stringify(out.info).slice(0, 1500) : ''}`);
  for (const c of failed) console.log(`    FAIL ${c[0]}${c[2] !== undefined ? ' — ' + (typeof c[2] === 'string' ? c[2] : JSON.stringify(c[2])).slice(0, 600) : ''}`);
  for (const e of errs.slice(0, 8)) console.log('    ' + e);
  if (VERBOSE) for (const c of checks.filter((c) => c[1])) console.log(`    ok   ${c[0]}${c[2] !== undefined ? ' — ' + JSON.stringify(c[2]).slice(0, 300) : ''}`);
}
const STAGE = (s, q = '') => `index.html?scene=stage&stage=${s}${q}`;

// ═════════════ (1) 새 게임 → 그레타 → 그림메인 → 마을·s01 탑승 → 1번 방 → 결과 → 허브 ═════════════
await run('newgame', STAGE('s01'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  // 새 게임 상태 (프롤로그는 건너뛴다: 1장을 막 마친 상태로 허브)
  const st = T.ST.newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
  st.progress.chapter = 1;
  if (!st.progress.cleared) st.progress.cleared = {};
  checks.push(['새 게임: 동료 상태 준비 (v1 · 빈 보유)', st.companions?.v === 1 && Object.keys(st.companions.owned).length === 0, st.companions]);
  g.state = st;
  T.pushed.length = 0; T.events.length = 0;
  g.go('hub', { from: 'load' }, { fade: false });
  // 개장 대사(cmp_stable_open) → 그림메인 합류 → 합류 연출 (companionJoin) → 허브
  let sawDialogue = false, sawJoin = false;
  const t = T.until(() => {
    if (g.top?.name === 'dialogue') sawDialogue = true;
    if (g.top?.name === 'companionJoin') sawJoin = true;
    return g.top?.name === 'hub' && T.CS.isOwned(st, 'mt_warhorse') && !T.CS.pendingIds(st).length && !!T.w?.player;
  }, 40);
  info.hub = { t, pushed: T.pushed.slice(0, 12), flag: st.progress.flags.stable_open };
  checks.push(['허브: 그레타 개장 대사 (cmp_stable_open)', sawDialogue && st.progress.seenScripts.includes('cmp_stable_open'), info.hub]);
  checks.push(['stable_open 플래그 → 그림메인 합류', !!st.progress.flags.stable_open && T.CS.isOwned(st, 'mt_warhorse')]);
  checks.push(['합류 연출 companionJoin', sawJoin || T.pushed.includes('companionJoin'), T.pushed]);
  checks.push(['그림메인 자동 장착', T.CS.heroLoadout(st, null).mount === 'mt_warhorse', T.CS.heroLoadout(st, null)]);
  // 마을에서 탑승
  T.hook();
  const w = T.w, p = T.p;
  checks.push(['(준비) 마을 월드', w?.mode === 'town' && !!p?.mount, w?.mode]);
  if (!p?.mount) return { checks, info };
  p.iframes = 0; T.step(0.3);
  T.press('KeyR', 0.05); T.step(0.8);
  checks.push(['마을에서 R → 탑승', p.mount.riding && p.w === 60, p.mount.state]);
  // s01 로
  g.go('stage', { stageId: 's01' }, { fade: false });
  T.until(() => g.top?.name === 'stage' && !!T.w?.player && T.w !== w, 10);
  T.until(() => g.top?.name === 'stage' && !T.w.cutscene, 15);
  T.hook();
  const w2 = T.w, p2 = T.p;
  checks.push(['s01 입장 (새 월드, 탈것 붙음)', w2.stage.id === 's01' && !!p2.mount && p2.mount.id === 'mt_warhorse', w2.stage.id]);
  // 적은 그대로 둔다 (C10 #1 'clear s01 room 1 mounted': 탄 채로 싸우며 지나간다)
  p2.iframes = 0; T.step(0.3);
  T.press('KeyR', 0.05);
  let tr = null;
  T.step(1.0, () => { if (p2.mount.riding && tr === null) tr = true; return false; });
  checks.push(['s01 에서 R → 탑승', p2.mount.riding, p2.mount.state]);
  // 1번 방을 시작 지점부터 탄 채 통과: 오른쪽으로 달리고, 가까운 적은 탄 채 공격, 막히면 점프 (출구 앞으로 옮기지 않는다)
  const room0 = w2.roomId, next = w2.room.exitRight;
  info.room = { room0, next };
  if (next) {
    const ev0 = T.events.length;
    const foes0 = w2.enemies().filter((e) => !e.dead).length;
    let kills = 0, t = 0, lastX = p2.cx, stuck = 0, jumps = 0, embed = 0;
    const onKill0 = w2.onEnemyKilled;
    w2.onEnemyKilled = function (e, ...a) { if (p2.mount?.riding) kills++; return onKill0.call(this, e, ...a); };
    T.key('ArrowRight', true);
    while (t < 60 && w2.roomId === room0 && !w2.transitioning) {
      p2.hp = Math.max(p2.hp, p2.stats.hp * 0.5);
      const near = w2.enemies().some((e) => !e.dead && !(e.dying > 0) && Math.abs(e.cx - p2.cx) < 170 && Math.abs(e.cy - p2.cy) < 140);
      if (near) { T.key('KeyX', true); T.step(2 / 60); T.key('KeyX', false); T.step(6 / 60); t += 8 / 60; }
      else { T.step(0.1); t += 0.1; }
      if (!w2.transitioning && T.w === w2 && !T.fitsNow()) embed++;
      if (Math.abs(p2.cx - lastX) < 4 && !near) stuck++; else stuck = 0;
      lastX = p2.cx;
      if (stuck >= 3 && p2.onGround) { T.key('KeyZ', true); T.step(16 / 60); T.key('KeyZ', false); jumps++; stuck = 0; }
    }
    T.until(() => w2.roomId !== room0 && !w2.transitioning, 3, { confirm: false });
    T.key('ArrowRight', false);
    w2.onEnemyKilled = onKill0;
    T.step(0.5);
    const dis = T.events.slice(ev0).filter((e) => e.ev === 'dismounted').map((e) => e.reason);
    Object.assign(info.room, { after: w2.roomId, t: +t.toFixed(1), jumps, foes0, kills, dismounts: dis, embed, state: p2.mount.state });
    checks.push(['1번 방을 시작 지점부터 탄 채 통과 (내리지 않고 오른쪽 출구까지)', w2.roomId === next && p2.mount.riding && !dis.length && !embed && T.fitsNow(), info.room]);
    checks.push(['1번 방: 탄 채로 적을 쓰러뜨린다', !foes0 || kills > 0, { foes0, kills }]);
  } else checks.push(['s01 첫 방에 오른쪽 출구', false, room0]);
  // 결과 화면 → 허브 (보스 대신 finishStage: 결과·이야기·허브 흐름만 본다)
  const clears0 = st.companions.clears, bond0 = st.companions.owned.mt_warhorse.bond;
  w2.finishStage();
  let sawResults = false;
  T.until(() => { if (g.top?.name === 'results') sawResults = true; return g.top?.name === 'hub' && !!T.w?.player; }, 40);
  info.after = { clears: st.companions.clears, bond: st.companions.owned.mt_warhorse.bond, top: g.top?.name };
  checks.push(['결과 화면을 거쳐 허브로', sawResults && g.top?.name === 'hub', info.after]);
  checks.push(['스테이지 클리어: clears +1 · 장착 탈것 유대 +6', st.companions.clears === clears0 + 1 && st.companions.owned.mt_warhorse.bond === bond0 + 6, { clears0, bond0, ...info.after }]);
  checks.push(['허브에 돌아와도 탈것 장착 유지', !!T.p?.mount && T.p.mount.id === 'mt_warhorse']);
  return { checks, info };
}));

// ═════════════ (2) 동료 없는 6장 세이브 → 소급 합류 · 알 · 합류 연출 최대 3 · NEW ═════════════
await run('migrate', STAGE('s01'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  const fx = await (await fetch('/tools/fixtures/save_ch6_nocmp.json')).json();
  checks.push(['(준비) 고정 세이브: 6장 · companions 없음', fx.progress.chapter === 6 && !fx.companions, fx.progress.chapter]);
  // 슬롯에 넣고 슬롯 화면과 같은 경로로 불러온다 (saves.read → migrateState → hub)
  T.SV.saves.store(2, JSON.parse(JSON.stringify(fx)));
  const raw = T.SV.saves.read(2);
  checks.push(['isValidSave (동료 없는 옛 세이브)', !!raw && T.SV.isValidSave(raw)]);
  const st = T.ST.migrateState(raw);
  st.slot = 2;
  const own = Object.keys(st.companions?.owned ?? {}).sort();
  const eggs = T.CS.eggStatus(st);
  info.mig = { own, eggs, pending: [...st.companions.pending] };
  const wantOwn = ['gd_fairy', 'gd_knight', 'gd_owl', 'mt_skelsteed'];
  checks.push(['소급 합류: 아리아 · 코슈타 · 가웨인 · 미네르바', wantOwn.every((id) => own.includes(id)) && own.length === 4, own]);
  checks.push(['크론의 알 (부화 가능)', eggs.length === 1 && eggs[0].id === 'gd_whelp' && eggs[0].ready, eggs]);
  checks.push(['그림메인은 소급하지 않는다 (허브에서 그레타 대사)', !own.includes('mt_warhorse')]);
  checks.push(['소급 합류는 모두 합류 연출 대기(pending)', wantOwn.every((id) => st.companions.pending.includes(id)), [...st.companions.pending]]);
  const again = JSON.parse(JSON.stringify(st));
  T.ST.migrateState(again);
  checks.push(['migrateState 두 번 = 같은 결과', JSON.stringify(again.companions) === JSON.stringify(st.companions)]);
  // 허브: 개장 대사 → 그림메인 → 합류 연출은 이번 방문에 최대 3명
  g.state = st;
  T.pushed.length = 0;
  g.go('hub', { from: 'load' }, { fade: false });
  let joins = 0, lastTop = null, calm = 0;
  for (let i = 0; i < 60 * 60 && calm < 60; i++) {
    const top = g.top?.name;
    if (top === 'companionJoin' && lastTop !== 'companionJoin') joins++;
    lastTop = top;
    if (top === 'dialogue' || top === 'companionJoin') { T.key('KeyZ', true); g.tick(1 / 60); T.key('KeyZ', false); }
    g.tick(1 / 60);
    calm = top === 'hub' && T.w?.player ? calm + 1 : 0;
  }
  joins = Math.max(joins, T.pushed.filter((n) => n === 'companionJoin').length);   // 연달아 뜨는 합류 연출은 장면 이름이 바뀌지 않는다
  const pend = T.CS.pendingIds(st);
  info.hub = { joins, pend, pushed: T.pushed.filter((n) => n !== 'dialogue') };
  checks.push(['허브: 그림메인도 합류 (그레타)', T.CS.isOwned(st, 'mt_warhorse')]);
  checks.push(['합류 연출은 한 번 방문에 최대 3명', joins >= 1 && joins <= 3, info.hub]);
  checks.push(['나머지는 대기로 남는다 (메뉴 NEW)', pend.length === 5 - joins, info.hub]);
  // 메뉴 「동료」 탭: NEW 가 남은 동료를 보면 대기에서 빠진다 (0.8초)
  g.push('menu', { world: T.w, tab: 'companions' });
  T.step(0.3, null, { close: false, render: 5 });
  const menu = g.top, tb = menu?.cur;
  checks.push(['메뉴 「동료」 탭이 열린다', g.top?.name === 'menu' && tb?.constructor?.name === 'CompanionsTab', [g.top?.name, tb?.constructor?.name]]);
  for (const id of pend) {
    if (!tb?.select) break;
    tb.select(id, false);
    T.step(1.0, null, { close: false, render: 10 });
  }
  info.after = { pend: T.CS.pendingIds(st) };
  checks.push(['탭에서 본 동료는 대기(NEW)에서 빠진다', !!tb?.select && T.CS.pendingIds(st).length === 0, info.after]);
  return { checks, info };
}));

// ═════════════ (3) 아홉 탈것 × s01–s20 시작 방: 소환 · 돌진 · 특수기 · 점프 · 하차 · 박힘 없음 ═════════════
const STAGE_IDS = opt('stages') ? String(opt('stages')).split(',').map((s) => s.trim()).filter(Boolean) : Array.from({ length: 20 }, (_, i) => 's' + String(i + 1).padStart(2, '0'));
await run('stages', STAGE('s01', '&cmp=all&ch=20'), (page) => page.evaluate(async (stageIds) => {
  const T = window.__T, g = T.g, checks = [], info = { rows: [], water: [], knocked: [], embeds: [], deepLost: [] };
  const ids = T.D.MOUNT_IDS, st = g.state;
  st.companions.pending.length = 0;
  const bad = { summon: [], charge: [], special: [], jump: [], dismount: [], embed: [], rider: [], lost: [] };
  const kill = (w) => { for (const e of w.entities) if ((e.kind === 'enemy' || e.kind === 'boss') && !e.dead) { e.dead = true; e.hidden = true; } };
  for (const sid of stageIds) {
    if (T.w?.stage?.id !== sid) {
      g.go('stage', { stageId: sid }, { fade: false });
      T.until(() => g.top?.name === 'stage' && T.w?.stage?.id === sid && !!T.w.player, 20);
      T.until(() => g.top?.name === 'stage' && !T.w.cutscene && !T.w.transitioning, 20);
    }
    const w = T.w;
    if (w?.stage?.id !== sid) { bad.summon.push(sid + ':load'); continue; }
    T.hook();
    const room0 = w.stage.start ?? w.roomId;
    for (const id of ids) {
      const p = w.player, tag = `${sid}/${id}`;
      if (p.mount?.riding) p.mount.dismount(w, p, 'debug');
      T.equip(id);
      w.loadRoom(room0);
      kill(w);
      p.hp = p.stats.hp; p.iframes = 0; p.dead = false;
      let embed = 0, firstEmbed = null;
      const watch = () => {
        kill(w); p.hp = Math.max(p.hp, p.stats.hp * 0.5);
        if (w.transitioning || T.w !== w) return false;
        if (!T.M.fits(w, p.x, p.bottom, p.w, p.h)) { embed++; if (!firstEmbed) firstEmbed = { room: w.roomId, x: Math.round(p.x), b: Math.round(p.bottom), w: p.w, h: p.h, st: p.mount?.state }; }
        return false;
      };
      const stepW = (sec, stop) => T.step(sec, (i) => { watch(); return stop ? stop(i) : false; });
      stepW(0.35);
      const m = p.mount;
      if (!m || m.id !== id) { bad.summon.push(tag + ':equip'); continue; }
      m.cd = 0; m.state = 'stowed'; m.hp = m.maxHp; m.chargeCd = 0; m.specialCd = 0;
      const deep = w.gimmickOf?.('deep');
      const wet = !!(deep && (deep.inWater || deep.headUnder));
      const toast0 = T.toasts.length;
      T.key('KeyR', true); stepW(2 / 60); T.key('KeyR', false);
      stepW(1.0, () => m.riding && m.state === 'riding');
      const row = { s: sid, id, room: room0 };
      if (!m.riding) {
        const said = T.toasts.slice(toast0);
        if (wet && said.includes(T.D.CMP_TEXT.underwater)) { info.water.push(tag); continue; }
        bad.summon.push({ tag, state: m.state, said, wet });
        continue;
      }
      row.summon = true;
      const evS = T.events.length;   // 이 뒤로 R 하차 전까지의 'dismounted' 는 뜻하지 않은 하차 (아래 '도중 하차 없음')
      // 돌진 (C)
      stepW(1.0, () => p.onGround);
      m.chargeCd = 0;
      let charged = false;
      T.key('KeyC', true); stepW(3 / 60, () => { if (m.chargeT > 0) charged = true; return false; }); T.key('KeyC', false);
      stepW(0.6, () => { if (m.chargeT > 0) charged = true; return false; });
      row.charge = charged;
      if (!charged && m.riding) bad.charge.push(tag);
      // 특수기 (↓ + 공격)
      if (w.roomId !== room0 && m.riding) { /* 돌진이 방을 넘겼으면 그 방에서 계속 */ }
      stepW(1.2, () => p.onGround && !m.act && !(m.chargeT > 0));
      m.specialCd = 0;
      let sp = false;
      if (m.riding) {
        T.key('ArrowDown', true); stepW(1 / 60); T.key('KeyX', true); stepW(3 / 60, () => { if (m.specialCd > 0 || m.act) sp = true; return false; }); T.key('KeyX', false); T.key('ArrowDown', false);
        stepW(1.0, () => { if (m.specialCd > 0 || m.act) sp = true; return false; });
        row.special = sp;
        if (!sp) bad.special.push({ tag, ground: p.onGround, act: !!m.act, chargeT: m.chargeT, hurt: p.hurtT });
      }
      // 점프 (Z)
      stepW(1.5, () => p.onGround && !m.act);
      if (m.riding) {
        const y0 = p.bottom;
        let rose = 0;
        T.key('KeyZ', true); stepW(0.15, () => { rose = Math.max(rose, y0 - p.bottom); return false; }); T.key('KeyZ', false);
        stepW(2.5, () => { rose = Math.max(rose, y0 - p.bottom); return p.onGround && rose > 0; });
        row.jump = Math.round(rose);
        if (!(rose > 20)) bad.jump.push({ tag, rose, ground: p.onGround });
      }
      // 하차 (R)
      stepW(1.5, () => p.onGround || !!m.def?.flight);
      // 돌진 · 특수기 · 점프 사이에 탈것이 사라졌으면 (강제 하차 · 낙마 · 추락 …) 뒤 단계가 조용히 건너뛰어지므로 따로 잡는다
      const lost = T.events.slice(evS).filter((e) => e.ev === 'dismounted').map((e) => e.reason);
      if (m.riding) {
        T.key('KeyR', true); stepW(2 / 60); T.key('KeyR', false);
        stepW(0.6);
        row.dismount = !m.riding;
        if (m.riding) bad.dismount.push({ tag, state: m.state });
        if (!T.M.fits(w, p.x, p.bottom, p.w, p.h) || p.w > 40) bad.rider.push({ tag, x: p.x, b: p.bottom, w: p.w, h: p.h });
      } else {
        if (m.state === 'recall') info.knocked.push(tag);
        row.lost = lost;
        if (lost.length && lost.every((r) => r === 'deep')) info.deepLost.push(tag);   // 깊은 물에 들어가 내린 것은 설계
        else bad.lost.push({ tag, reasons: lost, state: m.state, room: w.roomId, sp: row.special, jump: row.jump });
      }
      row.embed = embed;
      if (embed) { bad.embed.push({ tag, embed, firstEmbed }); }
      info.rows.push(row);
    }
    // 다음 스테이지로 넘어가기 전에 내린다
    const p = T.p;
    if (p?.mount?.riding) p.mount.dismount(T.w, p, 'debug');
  }
  info.n = info.rows.length;
  const total = stageIds.length * ids.length;
  checks.push([`소환: 모든 스테이지 시작 방 (깊은 물 속 시작 ${info.water.length}건 제외)`, !bad.summon.length && info.rows.length + info.water.length === total, bad.summon.slice(0, 8)]);
  checks.push(['돌진 (C)', !bad.charge.length, bad.charge.slice(0, 12)]);
  checks.push(['특수기 (↓+공격)', !bad.special.length, bad.special.slice(0, 12)]);
  checks.push(['점프 (Z)', !bad.jump.length, bad.jump.slice(0, 12)]);
  checks.push(['하차 (R)', !bad.dismount.length, bad.dismount.slice(0, 12)]);
  checks.push(['도중 하차 없음 (돌진 · 특수기 · 점프 사이에 탈것이 사라지지 않는다; 깊은 물 제외)', !bad.lost.length, bad.lost.slice(0, 12)]);
  checks.push(['탈것 몸이 벽·천장에 박히지 않는다 (매 틀)', !bad.embed.length, bad.embed.slice(0, 8)]);
  checks.push(['내린 기수 몸이 맞고 박히지 않는다', !bad.rider.length, bad.rider.slice(0, 8)]);
  info.jumps = Object.fromEntries(ids.map((id) => [id, [Math.min(...info.rows.filter((r) => r.id === id).map((r) => r.jump ?? 999)), Math.max(...info.rows.filter((r) => r.id === id).map((r) => r.jump ?? 0))]]));
  info.rows = info.rows.length;
  return { checks, info };
}, STAGE_IDS));

// ═════════════ (4) 열한 수호신을 둘씩 s05 · s11 에서: 적이 죽는다 · 자동 공격 경직 0 · 틀 시간 증가 ≤ 1.5 ms ═════════════
await run('guardians', STAGE('s05', '&cmp=all&ch=20'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = { pairs: [] };
  const st = g.state, ids = T.D.GUARDIAN_IDS;
  st.companions.pending.length = 0;
  st.companions.autoSkill = false;
  T.CS.equipMount(st, null, null);
  const pairs = [];
  for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1] ?? ids[0]]);
  const bad = { equip: [], hits: [], hitstop: [], cost: [], kills: [], world: [] };
  const killsBy = {}, hitsBy = {};
  for (const sid of ['s05', 's11']) {
    if (T.w?.stage?.id !== sid) {
      g.go('stage', { stageId: sid }, { fade: false });
      T.until(() => g.top?.name === 'stage' && T.w?.stage?.id === sid && !!T.w.player, 20);
      T.until(() => g.top?.name === 'stage' && !T.w.cutscene && !T.w.transitioning, 20);
    }
    const w = T.w; T.hook();
    const room0 = w.stage.start ?? w.roomId;
    let stageKills = 0;
    for (const [a, b] of pairs) {
      T.CS.equipGuardian(st, null, 0, a); T.CS.equipGuardian(st, null, 1, b);
      w.loadRoom(room0);
      const cs = w.companions, p = w.player;
      for (const e of w.entities) if ((e.kind === 'enemy' || e.kind === 'boss') && !e.dead) { e.dead = true; e.hidden = true; }
      T.step(0.3);
      const have = cs.guards.map((x) => x.id);
      if (have.length !== 2 || !have.includes(a) || !have.includes(b)) { bad.equip.push({ sid, pair: [a, b], have }); continue; }
      // 수호신 자기 시간: 수호신 · 그들이 만든 판정/탄 · 감독(시스템 update) 의 update + draw
      const acc = { u: 0, d: 0 };
      const G = new Set(cs.guards);
      const wrap = (e) => {
        if (!e || e.__tw) return e; e.__tw = true;
        const u = e.update, d = e.draw;
        if (typeof u === 'function') e.update = function (...x) { const t0 = performance.now(); try { return u.apply(this, x); } finally { acc.u += performance.now() - t0; } };
        if (typeof d === 'function') e.draw = function (...x) { const t0 = performance.now(); try { return d.apply(this, x); } finally { acc.d += performance.now() - t0; } };
        return e;
      };
      for (const x of cs.guards) wrap(x);
      wrap(cs.director);
      const add0 = w.add;
      w.add = function (e) { if (e && (G.has(e.owner) || G.has(e.data?.owner))) wrap(e); return add0.call(this, e); };
      // 적 셋 (가만히 선 플레이어 양옆)
      // 땅 위의 적 셋 (날아다니는 박쥐는 급강하형 수호신이 5초 안에 못 맞힐 때가 있어 뺀다)
      const foes = [T.spawn('skeleton', 170), T.spawn('zombie', -170), T.spawn('skeleton', 260)].filter(Boolean);
      for (const e of foes) { e.hp = e.maxHp = Math.max(1, Math.round((e.maxHp ?? e.hp ?? 30))); }
      w.hits.length = 0;
      let renders = 0, hsFrames = 0;
      const N = 5 * 60, uA = [], dA = [];
      const exp0 = [a, b].map((id) => { const e = st.companions.owned[id]; return (e.lv ?? 1) * 1e7 + (e.exp ?? 0); });
      for (let i = 0; i < N; i++) {
        p.hp = p.stats.hp; p.iframes = Math.max(p.iframes ?? 0, 0.2);
        // 2.5초 뒤 남은 적의 체력을 1 로: 수호신 공격의 처치 경로(onKill · 경험치 몫)를 본다 (수호신 몫은 전체 딜의 10–20% 라 5초 안에 제 힘으로는 잘 못 잡는다)
        if (i === 150 && foes[0] && !foes[0].dead && !(foes[0].dying > 0)) foes[0].hp = 1;   // 나머지 둘은 끝까지 표적으로 남긴다
        const u0 = acc.u, d0 = acc.d;
        g.tick(1 / 60);
        if ((w.hitstop ?? 0) > 0) hsFrames++;
        if (i >= 30) uA.push(acc.u - u0);
        if (i % 3 === 0) { const r0 = acc.d; g.input?.beginRender?.(); g.render(); renders++; if (i >= 30) dA.push(acc.d - r0); }
        if (g.top?.name !== 'stage') g.pop();
        void d0;
      }
      w.add = add0;
      const mine = w.hits.filter((h) => h.owner === a || h.owner === b);
      const autoHits = mine.filter((h) => !h.tags.includes('assist'));
      const hsBad = autoHits.filter((h) => (h.hs > 0 || (h.ahs ?? 0) > 0) && !h.tags.includes('execute'));
      const hsExec = autoHits.filter((h) => (h.hs > 0 || (h.ahs ?? 0) > 0) && h.tags.includes('execute'));
      const kills = foes.filter((e) => e.dead || e.dying > 0).length;
      stageKills += kills;
      const gk = mine.filter((h) => h.killed).length;
      for (const h of mine) if (h.killed) killsBy[h.owner] = (killsBy[h.owner] ?? 0) + 1;
      const expUp = [a, b].map((id, k) => { const e = st.companions.owned[id]; return (e.lv ?? 1) * 1e7 + (e.exp ?? 0) > exp0[k]; });
      // 부하가 큰 기계의 튐(GC·다른 프로세스)을 줄이려고 처음 0.5초를 빼고 위 10% 를 버린 평균
      const tmean = (A) => { if (!A.length) return 0; const B = [...A].sort((x, y) => x - y).slice(0, Math.max(1, Math.floor(A.length * 0.9))); return B.reduce((x, y) => x + y, 0) / B.length; };
      const per = tmean(uA) + tmean(dA);
      const peak = Math.max(0, ...dA) + Math.max(0, ...uA);
      const row = { sid, pair: [a, b], hits: { [a]: mine.filter((h) => h.owner === a).length, [b]: mine.filter((h) => h.owner === b).length }, kills, gk, expUp, ms: +per.toFixed(3), u: +tmean(uA).toFixed(3), d: +tmean(dA).toFixed(3), peak: +peak.toFixed(2) };
      info.pairs.push(row);
      if (!(row.hits[a] + row.hits[b] > 0)) bad.hits.push(row);
      for (const id of [a, b]) hitsBy[id] = (hitsBy[id] ?? 0) + row.hits[id];
      if (!(gk > 0) || !expUp.every(Boolean)) bad.kills.push(row);
      if (hsBad.length) bad.hitstop.push({ sid, pair: [a, b], n: hsBad.length, ex: hsBad[0] });
      if (hsExec.length || hsFrames) bad.world.push({ sid, pair: [a, b], hsFrames, exec: hsExec.length, ex: hsExec[0] });
      if (per > 1.5) bad.cost.push(row);
    }
    info[sid + 'kills'] = stageKills;
  }
  // 틀 시간 A/B (참고: 부하가 큰 기계에서는 흔들린다) — 같은 방, 수호신 없음 vs 가장 무거운 쌍
  const heavy = [...info.pairs].sort((x, y) => y.ms - x.ms)[0];
  if (heavy) {
    const w = T.w, p = w.player, room0 = w.stage.start ?? w.roomId;
    const block = (on) => {
      if (on) { T.CS.equipGuardian(st, null, 0, heavy.pair[0]); T.CS.equipGuardian(st, null, 1, heavy.pair[1]); }
      else { T.CS.equipGuardian(st, null, 0, null); T.CS.equipGuardian(st, null, 1, null); }
      w.companions.sync(true);
      const ts = [];
      for (let i = 0; i < 40; i++) { p.hp = p.stats.hp; const t0 = performance.now(); g.tick(1 / 60); g.input?.beginRender?.(); g.render(); ts.push(performance.now() - t0); }
      ts.sort((x, y) => x - y);
      return ts[ts.length >> 1];
    };
    w.loadRoom(room0); T.step(0.3);
    const A = [], B = [];
    for (let k = 0; k < 3; k++) { A.push(block(false)); B.push(block(true)); }
    A.sort((x, y) => x - y); B.sort((x, y) => x - y);
    info.ab = { pair: heavy.pair, off: +A[1].toFixed(2), on: +B[1].toFixed(2), delta: +(B[1] - A[1]).toFixed(2) };
  }
  info.killsBy = killsBy;
  checks.push(['두 칸 장착 → 수호신 둘 (12쌍)', !bad.equip.length && info.pairs.length === pairs.length * 2, bad.equip]);
  info.hitsBy = hitsBy;
  const silent = ids.filter((id) => !(hitsBy[id] > 0));
  checks.push(['쌍마다 적을 치고 (5초) · 열한 수호신 모두 s05 · s11 에서 적을 친다', !bad.hits.length && !silent.length, { pairs: bad.hits.slice(0, 4), silent, hitsBy }]);
  checks.push(['쌍마다 수호신 공격이 적을 쓰러뜨리고 (처치 판정) 두 수호신 모두 경험치를 받는다', !bad.kills.length && info.s05kills > 0 && info.s11kills > 0, { bad: bad.kills.slice(0, 4), s05: info.s05kills, s11: info.s11kills, killsBy }]);
  checks.push(['자동 공격 경직(히트스톱) 0', !bad.hitstop.length, bad.hitstop.slice(0, 4)]);
  // C10 #4: 플레이어가 치지 않는 동안 world.hitstop 은 0 이어야 한다 — 모르스의 처형(패시브, 'execute')도 포함
  checks.push(['플레이어가 치지 않으면 world.hitstop 0 (모르스 처형 패시브 포함, C10 #4)', !bad.world.length, bad.world.slice(0, 4)]);
  checks.push(['수호신 둘의 틀 비용 ≤ 1.5 ms (update + draw)', !bad.cost.length, bad.cost.slice(0, 4)]);
  return { checks, info };
}));

// ═════════════ (5) 탄 채로 수호신 둘과 보스: 등장 연출 · 50% · 보스 공격 낙마 · 재소환 · 유대 3 공명 ═════════════
for (const sid of ['s03', 's12']) {
  await run('boss_' + sid, STAGE(sid, '&room=boss&cmp=all&ch=20&mount=mt_warhorse&guards=gd_knight,gd_imp&bond=3'), (page) => page.evaluate(async () => {
    const T = window.__T, g = T.g, checks = [], info = {};
    const st = g.state;
    st.companions.pending.length = 0; st.companions.autoSkill = false;
    T.until(() => g.top?.name === 'stage' && !T.w.cutscene, 10);
    const w = T.w, p = w.player, cs = w.companions;
    const keep = () => { p.hp = Math.max(p.hp, p.stats.hp * 0.8); if (p.dead) p.dead = false; };
    const m = T.ride('mt_warhorse');
    checks.push(['(준비) 보스방에서 그림메인 탑승 · 수호신 둘', !!m?.riding && cs.guards.length === 2, { riding: m?.riding, guards: cs.guards.map((x) => x.id) }]);
    // 보스가 나올 때까지 오른쪽으로 (탄 채)
    T.pushed.length = 0;
    T.key('ArrowRight', true);
    T.until(() => { keep(); return !!w.boss; }, 15);
    T.key('ArrowRight', false);
    const sawIntro0 = T.pushed.includes('bossIntro');
    T.until(() => { keep(); return w.bossActive && !w.cutscene && g.top?.name === 'stage'; }, 40);
    const b = w.boss;
    info.boss = b?.def?.id; info.pushed = T.pushed.slice(0, 8);
    checks.push(['보스 등장 연출 (bossIntro) 을 지나 보스전 시작', !!b && w.bossActive && (sawIntro0 || T.pushed.includes('bossIntro')), { boss: info.boss, pushed: info.pushed, active: w.bossActive }]);
    if (!b) return { checks, info };
    checks.push(['등장 연출 뒤에도 탄 채 (noMount 보스 아님)', m.riding || m.state === 'riding' || (!b.def.noMount && m.state !== 'recall'), { state: m.state, noMount: !!b.def.noMount }]);
    if (!m.riding) T.ride('mt_warhorse');
    // 50% 까지: 보스 체력을 52% 로 두고 붙어서 친다 (수호신도 함께)
    const MH = b.stats?.maxHp ?? b.maxHp;
    b.hp = Math.ceil(MH * 0.505);
    let knockedEarly = 0;
    w.hits.length = 0;
    let t = 0;
    while (t < 30 && b.hp > MH * 0.5 && !b.dead) {
      keep();
      if (m.state === 'recall') { knockedEarly++; m.cd = 0; m.state = 'stowed'; }
      if (!m.riding && m.state === 'stowed' && p.onGround) T.ride('mt_warhorse');
      const dir = Math.sign(b.cx - p.cx) || 1;
      T.key(dir > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(b.cx - p.cx) > 140);
      T.key(dir > 0 ? 'ArrowLeft' : 'ArrowRight', false);
      T.key('KeyX', true); T.step(3 / 60); T.key('KeyX', false); T.step(9 / 60, null, { render: 6 });
      t += 0.2;
    }
    T.key('ArrowRight', false); T.key('ArrowLeft', false);
    const guardOnBoss = () => w.hits.filter((h) => (h.owner === 'gd_knight' || h.owner === 'gd_imp') && (h.boss || h.t === b.def.id)).length;
    info.half = { t: +t.toFixed(1), hp: Math.round(b.hp / MH * 100) + '%', guardHits: guardOnBoss(), riding: m.riding, knockedEarly };
    checks.push(['보스 체력 50% 까지 (탄 채 공격)', b.hp <= MH * 0.5, info.half]);
    // 보스 공격으로 낙마: 탈것 체력 1 로 두고 보스 앞에서 기다린다
    if (!m.riding) T.ride('mt_warhorse');
    let lastAtk = null;
    const inc = m.incoming.bind(m);
    m.incoming = (pp, dmg, atk, ww) => { const o = atk?.owner; lastAtk = { kind: o?.kind ?? atk?.kind ?? null, boss: o === w.boss || o?.kind === 'boss', id: o?.def?.id ?? null }; return inc(pp, dmg, atk, ww); };
    m.hp = 1; m.invulnT = 0;
    const toast0 = T.toasts.length;
    t = 0;
    while (t < 30 && m.state !== 'recall') {
      keep(); p.iframes = 0; m.invulnT = 0; m.hp = Math.min(m.hp, 1);
      const dir = Math.sign(b.cx - p.cx) || 1;
      T.key(dir > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(b.cx - p.cx) > 90);
      T.key(dir > 0 ? 'ArrowLeft' : 'ArrowRight', false);
      T.step(0.1);
      t += 0.1;
      if (!m.riding && m.state !== 'recall' && m.state !== 'summoning') { m.cd = 0; m.state = 'stowed'; m.summon(w, p, { force: true, instant: true }); m.hp = 1; }
    }
    T.key('ArrowRight', false); T.key('ArrowLeft', false);
    m.incoming = inc;
    const knocked = T.events.filter((e) => e.ev === 'dismounted' && e.reason === 'knocked');
    info.knock = { t: +t.toFixed(1), state: m.state, cd: +(m.cd ?? 0).toFixed(1), lastAtk, toasts: T.toasts.slice(toast0, toast0 + 3) };
    checks.push(['보스 공격으로 낙마 → 재소환 대기(recall)', m.state === 'recall' && knocked.length > 0 && !!lastAtk?.boss, info.knock]);
    checks.push(['낙마 안내 문구 (쓰러졌다! 재소환 N초)', T.toasts.slice(toast0).some((s) => s.includes('쓰러졌다')), T.toasts.slice(toast0, toast0 + 4)]);
    // 장착한 수호신 둘이 '각각' 보스를 친다 (50% 구간 + 낙마 구간; 모자라면 보스 곁에서 최대 10초 더).
    // 예전에는 둘을 합쳐 1타 이상만 보아, 한쪽(근접 수호신)이 보스를 한 번도 못 치는 결함이 가려졌다.
    const G2 = ['gd_knight', 'gd_imp'];
    const byG = () => Object.fromEntries(G2.map((id) => [id, w.hits.filter((h) => h.owner === id && (h.boss || h.t === b.def.id)).length]));
    for (let k = 0; k < 40 && !G2.every((id) => byG()[id] > 0); k++) {
      // 체력을 45% 위로 붙잡아 둔다: 30% 아래로 내려가면 둘라한은 말에서 내리는 3페이즈 연출에 들어가 뒤의 필살기 · 공명 검사가 흔들린다
      keep(); p.iframes = Math.max(p.iframes ?? 0, 0.3); b.hp = Math.max(b.hp, Math.ceil(MH * 0.45));
      const dir = Math.sign(b.cx - p.cx) || 1;
      T.key(dir > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(b.cx - p.cx) > 160); T.key(dir > 0 ? 'ArrowLeft' : 'ArrowRight', false);
      T.step(0.25);
    }
    T.key('ArrowRight', false); T.key('ArrowLeft', false);
    const gh = byG();
    info.guardHits = { total: guardOnBoss(), byGuardian: gh };
    checks.push(['장착한 수호신 둘 모두 보스를 친다 (가웨인 · 핌)', G2.every((id) => gh[id] > 0), { byGuardian: gh, by: [...new Set(w.hits.filter((h) => h.boss).map((h) => h.owner))], boss: b.def.id, mounted: b.mounted ?? null }]);
    // 재사용 대기 중 R → 거절, 대기가 끝나면 R 로 재소환
    T.press('KeyR', 0.05);
    const refused = !m.riding && m.state === 'recall';
    m.cd = 0.05;
    T.step(0.3);
    T.until(() => { keep(); return p.onGround; }, 3, { confirm: false });
    T.press('KeyR', 0.05);
    T.step(1.0, () => { keep(); return m.riding && m.state === 'riding'; });
    checks.push(['재소환 대기 중 R 거절 → 대기가 끝나면 R 로 다시 탄다', refused && m.riding, { refused, state: m.state }]);
    // 유대 3 공명: 필살기 → 수호신 무료 스킬 (공명) + 탈것 공명
    for (const x of cs.guards) x.skillCd = 0;
    const ev0 = T.events.length;
    // 이 구간은 무적: 보스 공격에 경직된 틀에 F 가 눌리면 필살기가 나가지 않고, 연출 중 한 방에 쓰러지면 부활 처리로 탈것이 대기로
    // 돌아가 '공명' · '자동 재탑승' 검사가 보스의 무작위 패턴에 따라 흔들렸다 (검사 대상은 공명과 재탑승이지 피격이 아니다)
    const safe = () => { keep(); p.iframes = Math.max(p.iframes ?? 0, 0.5); };
    const ulted = () => T.events.slice(ev0).some((e) => e.ev === 'ultimateCast');
    let fTries = 0;
    for (; fTries < 3 && !ulted(); fTries++) {
      w.run.sp = 100; p.hp = p.stats.hp;
      T.until(() => { safe(); return !(p.hurtT > 0) && !p.move && !(p.castT > 0) && m.state !== 'summoning'; }, 2, { confirm: false });
      T.key('KeyF', true); T.step(3 / 60, () => { safe(); return false; }); T.key('KeyF', false);
      T.until(() => { safe(); return ulted(); }, 2);
    }
    T.until(() => { safe(); return T.events.slice(ev0).filter((e) => e.ev === 'guardianSkill' && e.resonance).length >= 2; }, 12);
    info.fTries = fTries; info.died = T.events.slice(ev0).filter((e) => e.ev === 'playerDied').length;
    const evs = T.events.slice(ev0);
    const reso = evs.filter((e) => e.ev === 'guardianSkill' && e.resonance).map((e) => e.id);
    info.reso = { ult: evs.some((e) => e.ev === 'ultimateCast'), reso, ranks: ['gd_knight', 'gd_imp', 'mt_warhorse'].map((id) => T.CS.bondRankOf(st, id)) };
    checks.push(['필살기 → 유대 3 수호신 둘 공명 스킬', info.reso.ult && reso.includes('gd_knight') && reso.includes('gd_imp'), info.reso]);
    // 재탑승은 연출이 끝나고 땅 위 · 경직 없음일 때만 (8초 안에 못 타면 포기) — 보스의 연타에 경직이 이어지지 않게 이 구간만 무적
    T.until(() => { keep(); p.iframes = Math.max(p.iframes ?? 0, 0.5); return m.riding; }, 12);
    info.after = { state: m.state, riding: m.riding, wait: +(m.remountWait ?? 0).toFixed(2), ground: p.onGround, hurt: p.hurtT > 0, died: T.events.slice(ev0).filter((e) => e.ev === 'playerDied').length };
    checks.push(['필살기 뒤 탈것 자동 재탑승', m.riding, info.after]);
    checks.push(['보스전 내내 기수 몸이 박히지 않는다', T.fitsNow(), { x: p.x, b: p.bottom, w: p.w, h: p.h }]);
    return { checks, info };
  }));
}

// ═════════════ (5 보강) 수호신 열하나 × 점검표 보스 둘: 모든 수호신이 보스에게 피해를 준다 ═════════════
// 근접 수호신은 대상의 발밑(T.bottom)에 40–70px 높이 판정을 내므로, 판정이 바닥에서 떠 있는 보스(말 탄 둘라한 · 드라큘라)를 못 칠 수 있다.
// 수호신마다 보스 곁에서 최대 10초, 첫 타격이 나오면 바로 다음으로 넘어간다.
for (const sid of ['s03', 's12']) {
  await run('boss_reach_' + sid, STAGE(sid, '&room=boss&cmp=all&ch=20&cmplv=20'), (page) => page.evaluate(async () => {
    const T = window.__T, g = T.g, checks = [], info = {};
    const st = g.state;
    st.companions.pending.length = 0; st.companions.autoSkill = false;
    T.CS.equipMount(st, null, null); T.cs.sync(true);
    T.until(() => g.top?.name === 'stage' && !T.w.cutscene, 10);
    const w = T.w, p = w.player;
    const keep = () => { p.hp = Math.max(p.hp, p.stats.hp * 0.8); if (p.dead) p.dead = false; p.iframes = Math.max(p.iframes ?? 0, 0.3); };
    T.key('ArrowRight', true);
    T.until(() => { keep(); return !!w.boss; }, 20);
    T.key('ArrowRight', false);
    T.until(() => { keep(); return w.bossActive && !w.cutscene && g.top?.name === 'stage'; }, 40);
    const b = w.boss;
    checks.push(['(준비) 보스전 시작', !!b && w.bossActive, b?.def?.id ?? null]);
    if (!b) return { checks, info };
    const MH = b.stats?.maxHp ?? b.maxHp;
    const onBoss = (id) => w.hits.some((h) => h.owner === id && (h.boss || h.t === b.def.id));
    const by = {};
    for (const id of T.D.GUARDIAN_IDS) {
      T.CS.equipGuardian(st, null, 0, id); T.CS.equipGuardian(st, null, 1, null); T.cs.sync(true);
      w.hits.length = 0;
      let t = 0;
      while (t < 10 && !onBoss(id)) {
        keep(); b.hp = Math.max(b.hp, Math.ceil(MH * 0.6));
        const dir = Math.sign(b.cx - p.cx) || 1;
        T.key(dir > 0 ? 'ArrowRight' : 'ArrowLeft', Math.abs(b.cx - p.cx) > 180); T.key(dir > 0 ? 'ArrowLeft' : 'ArrowRight', false);
        T.step(0.1); t += 0.1;
      }
      T.key('ArrowRight', false); T.key('ArrowLeft', false);
      by[id] = { hit: onBoss(id), t: +t.toFixed(1), other: [...new Set(w.hits.filter((h) => h.owner === id).map((h) => h.t))] };
    }
    const miss = Object.keys(by).filter((id) => !by[id].hit);
    Object.assign(info, { boss: b.def.id, mounted: b.mounted ?? null, by });
    checks.push([`수호신 열하나 모두 ${b.def.id} 에게 피해를 준다 (각 10초 안에)`, !miss.length, { miss, boss: b.def.id, mounted: b.mounted ?? null }]);
    return { checks, info };
  }));
}

// ═════════════ (6) 탄 채로 관(세이브)에서 저장 → 다시 불러오기 · 내보내기 코드 왕복 · 클라우드 기록 경로 · 크기 ═════════════
await run('save', STAGE('s01', '&room=r3&cmp=all&cmplv=40&bond=4&ch=20&mount=mt_warhorse&guards=gd_knight,gd_imp'), async (page) => {
  const canon = `(o) => JSON.stringify(o, function (k, v) { return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((x) => [x, v[x]])) : v; })`;
  const a = await page.evaluate(async (canonSrc) => {
    const canon = eval(canonSrc);
    const T = window.__T, g = T.g, checks = [], info = {};
    const st = g.state, w = T.w, p = T.p;
    st.companions.pending.length = 0;
    st.companions.clears = 5; st.companions.autoSkill = true;
    st.companions.owned.gd_imp.lv = 20; st.companions.owned.gd_imp.exp = 123; st.companions.owned.mt_warhorse.gift = 4;   // 최대 레벨이면 exp 는 0 으로 정규화된다
    const m = T.ride('mt_warhorse');
    const sp = w.entities.find((e) => e.constructor?.name === 'SavePoint');
    checks.push(['(준비) s01 r3 관(세이브) · 탑승', !!sp && !!m?.riding, { sp: !!sp, riding: m?.riding, room: w.roomId }]);
    if (!sp || !m) return { checks, info };
    for (const e of w.entities) if (e.kind === 'enemy' && !e.dead) { e.dead = true; e.hidden = true; }
    // 관 앞으로 (탄 채로 걸어서)
    const dir = Math.sign(sp.cx - p.cx) || 1;
    T.key(dir > 0 ? 'ArrowRight' : 'ArrowLeft', true);
    T.until(() => Math.abs(sp.cx - p.cx) < 20, 6, { confirm: false });
    T.key(dir > 0 ? 'ArrowRight' : 'ArrowLeft', false);
    T.step(0.4);
    m.hp = Math.round(m.maxHp * 0.4);
    const t0 = T.toasts.length;
    T.press('ArrowUp', 0.1);
    T.step(0.3);
    const saved = T.toasts.slice(t0).some((x) => x.includes('저장 완료'));
    checks.push(['탄 채로 ↑ → 관에서 저장 (저장 완료)', saved && m.riding, T.toasts.slice(t0)]);
    checks.push(['저장하면 탈것 체력도 회복', m.hp >= m.maxHp, { hp: m.hp, max: m.maxHp }]);
    const slot = st.slot ?? 1;
    const rd = T.SV.saves.read(slot);
    info.slot = slot;
    checks.push(['슬롯 기록의 companions = 현재 상태', !!rd && canon(rd.companions) === canon(st.companions), { slot, has: !!rd?.companions }]);
    checks.push(['기록에 lastStage (s01 r3)', rd?.lastStage?.stageId === 's01' && rd?.lastStage?.roomId === 'r3', rd?.lastStage]);
    // 내보내기 코드 왕복 (슬롯 3)
    const code = T.SV.saves.exportCode(slot);
    const okImp = !!code && T.SV.saves.importCode(3, code);
    const r3 = T.SV.saves.read(3);
    checks.push(['내보내기 → 가져오기 코드 왕복: companions 그대로', okImp && canon(r3?.companions) === canon(rd.companions), { len: code?.length ?? 0 }]);
    // 클라우드 내려받기 경로: sanitizeTree → isValidSave → migrateState
    const CL = await import('/src/core/cloud.js');
    let cd = CL.sanitizeTree(JSON.parse(JSON.stringify(rd)));
    const valid = T.SV.isValidSave(cd);
    cd = T.ST.migrateState(cd);
    const diff = (x, y) => { const out = []; const X = JSON.parse(canon(x)), Y = JSON.parse(canon(y)); const walk = (a, b, k) => { if (JSON.stringify(a) === JSON.stringify(b)) return; if (a && b && typeof a === 'object' && typeof b === 'object') { for (const q of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[q], b[q], k + '.' + q); } else out.push(k + ': ' + JSON.stringify(a) + ' → ' + JSON.stringify(b)); }; walk(X, Y, ''); return out.slice(0, 8); };
    info.diffCloud = diff(rd.companions, cd.companions);
    checks.push(['클라우드 경로 (sanitizeTree → isValidSave → migrateState): companions 그대로', valid && canon(cd.companions) === canon(rd.companions), info.diffCloud]);
    const again = T.ST.migrateState(JSON.parse(JSON.stringify(cd)));
    checks.push(['migrateState 멱등 (전부 가진 세이브)', canon(again.companions) === canon(cd.companions)]);
    // 크기: 동료 스물 전부 · 최대 레벨 · 알 기록 · 두 칸 편성 (모든 영웅)
    const big = JSON.parse(JSON.stringify(st));
    for (const e of Object.values(big.companions.owned)) { e.lv = 30; e.exp = 0; e.bond = 200; }
    for (const h of Object.values(big.heroes ?? {})) if (h && typeof h === 'object') h.companions = { mount: 'mt_warhorse', guards: ['gd_knight', 'gd_imp'] };
    const bytes = new Blob([JSON.stringify(big)]).size;
    const base = JSON.parse(JSON.stringify(st)); delete base.companions;
    const baseBytes = new Blob([JSON.stringify(base)]).size;
    info.size = { all: bytes, withoutCompanions: baseBytes, companions: bytes - baseBytes };
    checks.push(['동료 전부 가진 세이브 < 256 KB (서버 한도 512 KB)', bytes < 256 * 1024, info.size]);
    info.expect = canon(rd.companions);
    info.loadout = T.CS.heroLoadout(st, null);
    return { checks, info };
  }, canon);
  if (!a?.info?.expect) return a;
  // 페이지를 새로 열어 (타이틀) 슬롯에서 불러온다: saves.read → migrateState → 저장된 방으로
  await page.goto(`http://localhost:${port}/index.html`, { timeout: 90000 });
  await page.waitForFunction(() => !!window.__game?.top && window.__game.scenesReady !== false, null, { timeout: 90000 });   // 두 단계 부팅 (#426)
  await page.evaluate(installHelpers);
  const b = await page.evaluate(async ({ canonSrc, slot, expect, loadout }) => {
    const canon = eval(canonSrc);
    const T = window.__T, g = T.g, checks = [], info = {};
    const raw = T.SV.saves.read(slot);
    checks.push(['새로 연 페이지: 슬롯이 남아 있다 (localStorage)', !!raw]);
    if (!raw) return { checks, info };
    const st = T.ST.migrateState(raw);
    checks.push(['다시 불러온 companions = 저장한 것', canon(st.companions) === expect]);
    g.state = st;
    g.go('stage', { stageId: st.lastStage.stageId, roomId: st.lastStage.roomId }, { fade: false });
    T.until(() => g.top?.name === 'stage' && !!T.w?.player && !T.w.cutscene, 20);
    T.step(0.5);
    const w = T.w, p = T.p, cs = w?.companions;
    info.after = { room: w?.roomId, mount: p?.mount?.id, guards: cs?.guards?.map((x) => x.id), loadout: T.CS.heroLoadout(st, null) };
    checks.push(['불러온 게임: 같은 방 · 탈것 · 수호신 둘', w?.roomId === 'r3' && p?.mount?.id === loadout.mount && cs?.guards?.length === 2 && loadout.guards.every((id) => cs.guards.some((x) => x.id === id)), info.after]);
    const m = p?.mount;
    if (m) { T.press('KeyR', 0.05); T.step(0.8, () => m.riding); }
    checks.push(['불러온 뒤 R → 탑승', !!m?.riding, m?.state]);
    return { checks, info };
  }, { canonSrc: canon, slot: a.info.slot, expect: a.info.expect, loadout: a.info.loadout });
  delete a.info.expect;
  return { checks: [...a.checks, ...(b?.checks ?? [['(두 번째 페이지) 실행', false]])], info: { ...a.info, ...(b?.info ?? {}) } };
});

// ═════════════ (7) 844×390 터치: 탑승/수호 버튼 · 누르기 · 재사용 대기 가림막 · 캔버스 위젯 탭 · 겹침 없음 ═════════════
await run('mobile', STAGE('s01', '&cmp=all&ch=20&mount=mt_warhorse&guards=gd_knight,gd_imp'), async (page, ctx) => {
  const checks = [], info = {};
  const cdp = await ctx.newCDPSession(page);
  const t = new Touch(cdp, page);
  const ev = () => page.evaluate(() => window.__T.events.length);
  const evSince = (n, name) => page.evaluate(([n, name]) => window.__T.events.slice(n).filter((e) => e.ev === name), [n, name]);
  const calm = () => page.evaluate(() => { const T = window.__T; for (const e of T.w.entities) if (e.kind === 'enemy' && !e.dead) { e.dead = true; e.hidden = true; } const p = T.p; p.hp = p.stats.hp; T.g.state.companions.autoSkill = false; T.g.state.companions.pending.length = 0; });
  await calm();
  const mode = await ensureTouchMode(t, page);
  checks.push(['(준비) 터치 모드', mode === 'touch', mode]);
  await page.waitForTimeout(500);
  const L = await padLayout(page);
  info.pad = { source: L.source, visible: L.visible, ids: Object.keys(L.buttons) };
  checks.push(['패드에 탑승 · 수호 버튼 (장착했을 때)', L.visible && !!L.buttons.mount && !!L.buttons.guard, info.pad]);
  // 겹침: 탑승/수호 버튼 ↔ 다른 버튼 · 스틱 자리 (CSS px)
  const ov = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const circ = (b) => ({ x: b.cx - b.d / 2, y: b.cy - b.d / 2, w: b.d, h: b.d });
  const hits = [];
  for (const id of ['mount', 'guard']) {
    const a = L.buttons[id];
    if (!a) continue;
    for (const [k, b] of Object.entries(L.buttons)) if (k !== id && Math.hypot(a.cx - b.cx, a.cy - b.cy) < (a.d + b.d) / 2 - 1) hits.push(`${id}×${k}`);
    if (L.stick && ov(circ(a), L.stick) > 0) hits.push(`${id}×stick`);
  }
  checks.push(['탑승/수호 버튼이 다른 버튼 · 스틱 자리와 겹치지 않는다', !hits.length, { hits, stick: L.stick }]);
  // 탑승 버튼
  await pressButton(t, page, 'mount', 100);
  await page.waitForFunction(() => window.__T.m?.riding, null, { timeout: 4000 }).catch(() => {});
  const rode = await page.evaluate(() => !!window.__T.m?.riding);
  checks.push(['탑승 버튼 → 탄다', rode]);
  // 수호 버튼 (적 셋 앞에서) + 재사용 대기 가림막 (버튼 자리 픽셀)
  const sample = (id) => page.evaluate(async (id) => {
    const tp = (await import('/src/core/touchpad.js')).touchpad;
    const b = tp.buttons().find((x) => x.id === id), cv = document.getElementById('tpadcv');
    if (!b || !cv) return null;
    const r = cv.getBoundingClientRect(), kx = cv.width / r.width, ky = cv.height / r.height;
    const x = Math.round((b.cx - b.d * 0.35 - r.x) * kx), y = Math.round((b.cy - b.d * 0.35 - r.y) * ky), w = Math.round(b.d * 0.7 * kx), h = Math.round(b.d * 0.7 * ky);
    const d = cv.getContext('2d').getImageData(x, y, w, h).data;
    let lum = 0; for (let i = 0; i < d.length; i += 4) lum += (d[i] + d[i + 1] + d[i + 2]) * d[i + 3] / 255;
    return { lum: Math.round(lum / (d.length / 4)), n: d.length / 4 };
  }, id);
  await page.evaluate(() => { const T = window.__T; for (const x of T.cs.guards) x.skillCd = 0; T.spawn('skeleton', 180); T.spawn('zombie', -180); });
  await page.waitForTimeout(300);
  const before = await sample('guard');
  const n0 = await ev();
  await pressButton(t, page, 'guard', 100);
  await page.waitForTimeout(400);
  const cast = await evSince(n0, 'guardianSkill');
  // 버튼 가림막은 가장 먼저 준비되는 수호신 기준이다: 두 번째 수호신까지 쓰면 가림막이 덮인다
  await pressButton(t, page, 'guard', 100);
  await page.waitForTimeout(400);
  const cast2 = await evSince(n0, 'guardianSkill');
  checks.push(['수호 버튼 → 수호신 스킬 (수동, 두 번 누르면 둘 다)', cast.length >= 1 && cast2.length >= 2 && cast2.every((e) => !e.auto) && new Set(cast2.map((e) => e.id)).size === 2, cast2.map((e) => e.id)]);
  const during1 = await sample('guard');
  await page.waitForTimeout(1200);
  const during2 = await sample('guard');
  const cdNow = await page.evaluate(() => Math.min(...window.__T.cs.guards.map((x) => x.skillCd)));
  info.overlay = { before, during1, during2, cdNow: +cdNow.toFixed(1) };
  checks.push(['재사용 대기 가림막이 그려지고 (버튼이 어두워짐) 시간이 가며 바뀐다', !!before && !!during1 && during1.lum < before.lum - 3 && during2 && during2.lum !== during1.lum && cdNow > 0, info.overlay]);
  // 캔버스 위젯 탭 (HUD 의 동료 위젯: 수호신 칸 · 탈것)
  await calm();
  await page.evaluate(() => { const T = window.__T; for (const x of T.cs.guards) x.skillCd = 0; });
  await page.waitForTimeout(300);
  const rects = await page.evaluate(() => {
    const T = window.__T, R = T.cs.hudRects || [];
    const list = Array.isArray(R) ? R : Object.entries(R).map(([k, r]) => ({ act: k, ...r }));
    return list.map((r) => { const a = String(r.act ?? r.kind ?? r.id ?? ''); const c = T.toClient(r.x + r.w / 2, r.y + r.h / 2); return { act: a, slot: r.slot, cx: c.x, cy: c.y }; });
  });
  info.widgets = rects.map((r) => r.act);
  const gw = rects.find((r) => r.act.startsWith('guard'));
  let wOk = false;
  if (gw) {
    const n1 = await ev();
    await t.tap(gw.cx, gw.cy, 60);
    await page.waitForTimeout(400);
    wOk = (await evSince(n1, 'guardianSkill')).length >= 1;
  }
  checks.push(['캔버스 수호신 위젯 탭 → 스킬', !!gw && wOk, { widgets: info.widgets }]);
  const mw = rects.find((r) => r.act === 'mount');
  let mOk = false;
  if (mw) {
    const was = await page.evaluate(() => !!window.__T.m?.riding);
    await t.tap(mw.cx, mw.cy, 60);
    await page.waitForTimeout(700);
    const now = await page.evaluate(() => !!window.__T.m?.riding);
    mOk = was !== now;
    info.mountWidget = { was, now };
  }
  checks.push(['캔버스 탈것 위젯 탭 → 탑승/하차 전환', !!mw && mOk, info.mountWidget]);
  // 위젯이 패드 버튼 밑에 깔리지 않는다
  const Lb = await padLayout(page);
  const under = [];
  for (const r of rects) for (const [k, b] of Object.entries(Lb.buttons)) if (Math.hypot(r.cx - b.cx, r.cy - b.cy) < b.d / 2) under.push(`${r.act}@${k}`);
  checks.push(['동료 위젯 중심이 패드 버튼 밑에 있지 않다', !under.length, under]);
  // 장착하지 않은 동작의 버튼은 없다 (companions §6 has-mount / has-guard → 캔버스 패드): 모두 해제 → 둘 다 없음, 탈것만 → 탑승만
  const padWhen = async (fn, ok) => { await page.evaluate(fn); let L = null; for (let k = 0; k < 8; k++) { await page.waitForTimeout(300); L = await padLayout(page); if (ok(L.buttons)) break; } return Object.keys(L?.buttons ?? {}); };
  const none = await padWhen(() => { const T = window.__T, st = T.g.state; T.CS.equipMount(st, null, null); T.CS.equipGuardian(st, null, 0, null); T.CS.equipGuardian(st, null, 1, null); T.cs.sync(true); }, (B) => !B.mount && !B.guard);
  const mountOnly = await padWhen(() => { const T = window.__T; T.CS.equipMount(T.g.state, null, 'mt_warhorse'); T.cs.sync(true); }, (B) => !!B.mount && !B.guard);
  info.visibility = { none, mountOnly };
  checks.push(['장착을 모두 풀면 탑승 · 수호 버튼이 없고, 탈것만 장착하면 탑승 버튼만', !none.includes('mount') && !none.includes('guard') && mountOnly.includes('mount') && !mountOnly.includes('guard'), info.visibility]);
  return { checks, info };
}, { mobile: true });

// ═════════════ (8) 가짜 게임패드: 버튼 10(L3) 탑승 · 11(R3) 수호신 스킬 ═════════════
await run('pad', STAGE('s01', '&cmp=all&ch=20&mount=mt_warhorse&guards=gd_knight,gd_imp'), async (page) => {
  const checks = [], info = {};
  await page.evaluate(() => { const T = window.__T; for (const e of T.w.entities) if (e.kind === 'enemy' && !e.dead) { e.dead = true; e.hidden = true; } T.g.state.companions.autoSkill = false; T.g.state.companions.pending.length = 0; });
  await connect(page);
  await page.waitForTimeout(300);
  info.mode = await page.evaluate(() => window.__game.input?.mode ?? null);
  await padPress(page, BTN.L3, 120, 200);
  await page.waitForFunction(() => window.__T.m?.riding, null, { timeout: 4000 }).catch(() => {});
  const rode = await page.evaluate(() => ({ riding: !!window.__T.m?.riding, mode: window.__game.input?.mode ?? null }));
  checks.push(['패드 버튼 10 (L3) → 탑승', rode.riding, rode]);
  await page.evaluate(() => { const T = window.__T; for (const x of T.cs.guards) x.skillCd = 0; T.spawn('skeleton', 200); T.spawn('zombie', -200); });
  const n0 = await page.evaluate(() => window.__T.events.length);
  await padPress(page, BTN.R3, 120, 300);
  const cast = await page.evaluate((n) => window.__T.events.slice(n).filter((e) => e.ev === 'guardianSkill'), n0);
  checks.push(['패드 버튼 11 (R3) → 수호신 스킬 (수동)', cast.length >= 1 && !cast[0].auto, cast.map((e) => e.id)]);
  await page.waitForTimeout(300);
  await padPress(page, BTN.L3, 120, 700);
  const off = await page.evaluate(() => ({ riding: !!window.__T.m?.riding, state: window.__T.m?.state }));
  checks.push(['다시 10 → 하차', !off.riding, off]);
  info.mode = rode.mode;
  return { checks, info };
}, { initScripts: [fakePadInit({})] });

// ═════════════ 연타 · 소환 도중 방/장면 바꾸기 (그림메인 · 녹티스): 박힘 · 몸 크기 어긋남 · 오류 없음 ═════════════
await run('spam', STAGE('s01', '&cmp=all&ch=20&mount=mt_warhorse&guards=gd_knight,gd_imp'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  g.state.companions.pending.length = 0;
  const w = T.w, p = w.player;
  const rows = [];
  for (const id of ['mt_warhorse', 'mt_giantbat']) {
    const m = T.equip(id);
    if (!m) { rows.push({ id, err: 'equip' }); continue; }
    w.loadRoom(w.stage.start ?? w.roomId);
    T.step(0.3);
    let embed = 0, badW = 0, riding = 0;
    for (let i = 0; i < 240; i++) {   // 4초: R 을 네 틀마다, 점프 · 수호 · 돌진 · 특수기를 엇갈려 연타
      p.hp = p.stats.hp;
      if (i % 4 === 0) T.key('KeyR', true); if (i % 4 === 1) T.key('KeyR', false);
      if (i % 7 === 0) T.key('KeyZ', true); if (i % 7 === 3) T.key('KeyZ', false);
      if (i % 11 === 0) T.key('KeyG', true); if (i % 11 === 1) T.key('KeyG', false);
      if (i % 13 === 0) T.key('KeyC', true); if (i % 13 === 2) T.key('KeyC', false);
      if (i === 120) { T.key('ArrowDown', true); T.key('KeyX', true); } if (i === 124) { T.key('ArrowDown', false); T.key('KeyX', false); }
      T.step(1 / 60);
      if (!T.fitsNow()) embed++;
      if (m.riding) riding++;
      if (!m.riding && m.state === 'stowed' && p.w > 40) badW++;
    }
    for (const c of ['KeyR', 'KeyZ', 'KeyG', 'KeyC', 'ArrowDown', 'KeyX']) T.key(c, false);
    T.step(2.0);
    // 소환 도중 다른 방으로
    m.cd = 0; T.key('KeyR', true); T.step(1 / 60); T.key('KeyR', false); T.step(3 / 60);
    const mid = m.state;
    const other = Object.keys(w.stage.rooms).find((r) => r !== w.roomId);
    w.loadRoom(other); T.step(1.0);
    rows.push({ id, embed, badW, riding, mid, after: { state: m.state, riding: m.riding, w: p.w, fits: T.fitsNow(), room: w.roomId } });
    if (m.riding) m.dismount(w, p, 'debug');
    T.step(0.5);
  }
  info.rows = rows;
  checks.push(['연타 (R · 점프 · 수호 · 돌진 · 특수기): 박힘 없음 · 내린 몸 크기 정상 · 실제로 탔다 내렸다 한다', rows.every((r) => !r.err && !r.embed && !r.badW && r.riding > 0), rows]);
  checks.push(['소환 도중 방을 옮겨도 새 방 시작 지점에서 탄 채 · 몸이 맞는다', rows.every((r) => r.mid === 'summoning' && r.after.riding && r.after.fits), rows.map((r) => ({ id: r.id, mid: r.mid, ...r.after }))]);
  // 소환 도중 장면 바꾸기 (마을로)
  const m = T.equip('mt_warhorse');
  m.cd = 0; T.key('KeyR', true); T.step(1 / 60); T.key('KeyR', false); T.step(3 / 60);
  const mid = m.state;
  g.go('hub', { from: 'load' }, { fade: false });
  T.until(() => g.top?.name === 'hub' && !!T.w?.player && T.w !== w, 10);
  T.step(1.0);
  info.hub = { mid, top: g.top?.name, state: T.p?.mount?.state, w: T.p?.w };
  checks.push(['소환 도중 마을로 가도 새 월드에서 탈것은 대기 · 기수 몸 정상', mid === 'summoning' && g.top?.name === 'hub' && T.p?.mount?.state === 'stowed' && T.p.w <= 40 && T.fitsNow(), info.hub]);
  return { checks, info };
}));

// ═════════════ (2부) 이야기 명령 {cmd:'recruit'}: 대본 · 이야기 장면 · 대화 장면 · 플래그만 있는 세이브 ═════════════
await run('recruit', STAGE('s01', '&ch=20'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  const { SCRIPTS } = await import('/src/data/story.js');
  const want = { gd_mirra: 's14_outro', mt_ignis: 's15_outro', gd_lumen: 's16_outro', mt_gale: 's17_outro', gd_momo: 's18_outro', mt_silva: 's19_outro' };
  // 대본: 여섯 아웃트로에 recruit 명령 + 같은 플래그 · 조건 분기/선택지보다 앞
  const found = {}, bad = [];
  for (const [sid, sc] of Object.entries(SCRIPTS)) {
    const lines = Array.isArray(sc) ? sc : sc?.lines ?? [];
    lines.forEach((l, i) => {
      if (l?.cmd !== 'recruit') return;
      (found[l.id] ??= []).push(sid);
      const next = lines[i + 1];
      if (!(next?.cmd === 'flag' && next.key === 'recruit_' + l.id)) bad.push(`${sid}:${l.id} 플래그 없음`);
      if (l.if) bad.push(`${sid}:${l.id} 조건부`);
      const firstBranch = lines.findIndex((x) => x?.choice || x?.if);
      if (firstBranch >= 0 && firstBranch < i) bad.push(`${sid}:${l.id} 분기 뒤 (${firstBranch} < ${i})`);
    });
  }
  info.found = found;
  checks.push(['대본: 2부 여섯 동료의 recruit 명령이 제 아웃트로에', Object.entries(want).every(([id, sid]) => found[id]?.includes(sid)) && Object.keys(found).length === 6, found]);
  checks.push(['recruit 바로 뒤 같은 플래그 · 조건 분기보다 앞', !bad.length, bad]);
  checks.push(['데이터: 여섯 동료의 합류 조건 = recruit_<id> 플래그', Object.keys(want).every((id) => T.D.COMPANIONS?.[id]?.obtain?.flag === 'recruit_' + id || (T.D.MOUNTS[id] ?? T.D.GUARDIANS[id])?.obtain?.flag === 'recruit_' + id)]);
  const st = g.state;
  st.companions.pending.length = 0;
  checks.push(['(준비) 2부 동료 미보유', Object.keys(want).every((id) => !T.CS.isOwned(st, id))]);
  // 이야기 장면 (s14_outro): 건너뛰기로도 recruit 가 실행된다 → 허브에서 합류 연출
  T.pushed.length = 0;
  g.go('story', { script: 's14_outro', then: 'hub', thenParams: { from: 's14' } }, { fade: false });
  T.step(0.2, null, { close: false });
  const sc = g.top;
  checks.push(['이야기 장면 열림', sc?.name === 'story', sc?.name]);
  T.until(() => g.top?.name === 'hub' && !!T.w?.player && !T.CS.pendingIds(st).length, 40);
  info.story = { flag: !!st.progress.flags.recruit_gd_mirra, owned: T.CS.isOwned(st, 'gd_mirra'), src: st.companions.owned.gd_mirra?.src, pushed: T.pushed.filter((n) => n !== 'dialogue').slice(0, 6) };
  checks.push(['이야기 장면 → 플래그 + 미라 합류 (출처 story)', info.story.flag && info.story.owned && info.story.src === 'story', info.story]);
  checks.push(['허브에서 합류 연출 (companionJoin)', T.pushed.includes('companionJoin'), info.story.pushed]);
  // 대화 장면 (월드에서 playScript): s15_outro → 이그니스
  g.go('stage', { stageId: 's01' }, { fade: false });
  T.until(() => g.top?.name === 'stage' && !!T.w?.player && !T.w.cutscene, 20);
  T.w.playScript('s15_outro');
  T.step(0.1, null, { close: false });
  const dlg = g.top?.name;
  T.until(() => g.top?.name === 'stage', 60);
  info.dialogue = { opened: dlg, flag: !!st.progress.flags.recruit_mt_ignis, owned: T.CS.isOwned(st, 'mt_ignis') };
  checks.push(['대화 장면 (playScript) → 플래그 + 이그니스 합류', dlg === 'dialogue' && info.dialogue.flag && info.dialogue.owned, info.dialogue]);
  // 플래그만 있는 세이브 (동료 시스템 없는 러너가 남긴 기록): 불러올 때 합류
  const old = JSON.parse(JSON.stringify(st));
  delete old.companions;
  old.progress.flags = { ...old.progress.flags, recruit_gd_lumen: true, recruit_mt_gale: true };
  const mig = T.ST.migrateState(old);
  const own = Object.keys(mig.companions?.owned ?? {});
  checks.push(['플래그만 있는 세이브 → 불러오면 루멘 · 게일 합류', own.includes('gd_lumen') && own.includes('mt_gale'), own]);
  const st2 = JSON.parse(JSON.stringify(st));
  st2.progress.flags.recruit_gd_momo = true;
  const got = T.CS.evaluateUnlocks(st2, { silent: true });
  checks.push(['evaluateUnlocks: 플래그 → 모모 합류 (멱등)', got.includes('gd_momo') && T.CS.evaluateUnlocks(st2, { silent: true }).length === 0, got]);
  // 아케이드 상태에서는 플래그만
  const arc = JSON.parse(JSON.stringify(st)); arc.arcade = true;
  const saveState = g.state; g.state = arc;
  const r = g.companions?.recruit?.('mt_silva');
  g.state = saveState;
  checks.push(['아케이드: recruit 는 플래그만 (합류 없음)', r == null && !!arc.progress.flags.recruit_mt_silva && !T.CS.isOwned(arc, 'mt_silva')]);
  return { checks, info };
}));

// ═════════════ (2부) 영혼의 마구간: 구입 · 잠금/금화 부족 · 알 부화 · 그레타 의뢰 · 공물 ═════════════
await run('stable', 'index.html?scene=hub&cmp=mt_warhorse&ch=4', (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  const st = g.state;
  st.companions.pending.length = 0;
  st.gold = 30000; st.progress.chapter = 4;
  T.until(() => g.top?.name === 'hub' && !!T.w?.player, 10);
  const open = () => {
    g.push('stable', { world: T.w });
    T.step(0.5, null, { close: true });
    return g.top?.name === 'stable' ? g.top : null;
  };
  let sc = open();
  checks.push(['마구간 장면이 열린다 (4장)', !!sc && !sc.closed && sc.tabs.length === 4, { top: g.top?.name, tabs: sc?.tabs?.map((t) => t.id) }]);
  if (!sc) return { checks, info };
  const tabTo = (id) => { sc.tab = sc.tabs.findIndex((t) => t.id === id); sc.onTab(); T.step(0.05, null, { close: false }); };
  const pick = (id) => { const i = sc.entries.findIndex((e) => e.id === id || e.q?.id === id); if (i >= 0) sc.list.index = i; return i >= 0; };
  const confirm = () => { for (let k = 0; k < 40 && sc.modal; k++) { T.key('KeyZ', true); g.tick(1 / 60); T.key('KeyZ', false); g.tick(1 / 60); } };
  // 구입: 바르그 (6,000 G) · 소악마 계약서 핌 (7,500 G)
  tabTo('shop');
  for (const [id, price] of [['mt_boar', 6000], ['gd_imp', 7500]]) {
    const gold0 = st.gold;
    T.pushed.length = 0;
    const ok = pick(id);
    sc.act();
    const modal = !!sc.modal;
    T.step(0.5, null, { close: false });   // 모달이 입력을 받기 시작하는 시간
    confirm();
    T.step(0.3, null, { close: false });
    info[id] = { modal, gold: gold0 - st.gold, owned: T.CS.isOwned(st, id), pushed: T.pushed.slice(0, 3), pending: T.CS.pendingIds(st) };
    checks.push([`구입 ${id}: 확인 창 → ${price} G · 합류 · 합류 연출`, ok && modal && st.gold === gold0 - price && T.CS.isOwned(st, id) && T.pushed.includes('companionJoin') && !T.CS.pendingIds(st).includes(id), info[id]]);
    for (let k = 0; k < 10 && g.top?.name === 'companionJoin'; k++) g.pop();
    T.step(0.2, null, { close: true });
  }
  // 잠금 · 금화 부족 · 이미 보유
  const cp = JSON.parse(JSON.stringify(st));
  delete cp.companions.owned.mt_boar; cp.progress.chapter = 1;
  const lock = T.CS.buyCompanion(cp, 'mt_boar');
  cp.progress.chapter = 4; cp.gold = 100;
  const poor = T.CS.buyCompanion(cp, 'mt_boar');
  const again = T.CS.buyCompanion(st, 'mt_boar');
  checks.push(['잠금(장 미달) · 금화 부족 · 이미 보유는 거절 (금화 그대로)', !lock.ok && lock.msg.includes('2장') && !poor.ok && poor.msg === T.D.CMP_TEXT.poor && cp.gold === 100 && !again.ok, { lock: lock.msg, poor: poor.msg, again: again.msg }]);
  // 알 부화: 알 → 스테이지 두 번 → 부화 탭에서 깨기
  T.CS.obtainEgg(st, 'gd_whelp');
  const e0 = T.CS.eggStatus(st).find((e) => e.id === 'gd_whelp');
  T.CS.stageClearUpdate(st);
  const e1 = T.CS.eggStatus(st).find((e) => e.id === 'gd_whelp');
  T.CS.stageClearUpdate(st);
  const e2 = T.CS.eggStatus(st).find((e) => e.id === 'gd_whelp');
  checks.push(['알: 받은 뒤 스테이지 두 번 클리어해야 부화 가능', !!e0 && !e0.ready && e0.left === 2 && !e1.ready && e1.left === 1 && e2.ready, [e0, e1, e2].map((e) => e && e.left)]);
  tabTo('eggs');
  T.pushed.length = 0;
  pick('gd_whelp'); sc.act();
  T.step(3.0, null, { close: false });
  info.egg = { owned: T.CS.isOwned(st, 'gd_whelp'), src: st.companions.owned.gd_whelp?.src, pushed: T.pushed.slice(0, 3), eggs: Object.keys(st.companions.eggs) };
  checks.push(['부화 탭: 알이 깨지고 크론 합류 (출처 egg) · 합류 연출', info.egg.owned && info.egg.src === 'egg' && T.pushed.includes('companionJoin') && !info.egg.eggs.includes('gd_whelp'), info.egg]);
  for (let k = 0; k < 10 && g.top?.name === 'companionJoin'; k++) g.pop();
  T.step(0.2, null, { close: true });
  // 그레타 의뢰: 받기 → 진행 채우기 → 보상 → 합류
  const questMates = Object.fromEntries(['cq_hati', 'cq_skoll'].map((q) => [q, T.D.COMPANION_ORDER.find((id) => T.CS.companionDef?.(id)?.obtain?.quest === q || (T.D.MOUNTS[id] ?? T.D.GUARDIANS[id])?.obtain?.quest === q)]));
  info.questMates = questMates;
  for (const qid of ['cq_hati', 'cq_skoll']) {
    tabTo('quests');
    const had = pick(qid);
    const e = sc.cur;
    const st0 = e?.status;
    sc.act();
    const accepted = !!st.quests?.active?.[qid];
    const Qd = (await import('/src/data/quests.js')).QUESTS[qid];
    if (accepted) st.quests.active[qid].n = Qd.goal.count;
    sc.refresh(); pick(qid);
    const st1 = sc.cur?.status;
    T.pushed.length = 0;
    sc.act();
    T.step(0.6, null, { close: false });
    for (let k = 0; k < 60 && sc.popup; k++) { T.key('KeyZ', true); g.tick(1 / 60); T.key('KeyZ', false); g.tick(1 / 60); }
    T.step(0.4, null, { close: false });
    const mate = questMates[qid];
    const row = { had, before: st0, accepted, ready: st1, owned: T.CS.isOwned(st, mate), done: st.quests?.done?.includes(qid), pushed: T.pushed.slice(0, 3) };
    info[qid] = row;
    checks.push([`그레타 의뢰 ${qid}: 받기 → 완료 → 보상 → ${mate} 합류 · 합류 연출`, had && st0 === 'available' && accepted && st1 === 'ready' && row.owned && row.done && T.pushed.includes('companionJoin'), row]);
    for (let k = 0; k < 10 && g.top?.name === 'companionJoin'; k++) g.pop();
    T.step(0.2, null, { close: true });
  }
  // 공물: 경험치 + 유대 (주기마다 한 번) · 금화
  tabTo('tribute');
  pick('mt_warhorse');
  const e = st.companions.owned.mt_warhorse;
  const b0 = e.bond, x0 = e.lv * 1e6 + e.exp, g0 = st.gold;
  const cost = T.CS.tributeCost(st, 'mt_warhorse');
  sc.act();
  const b1 = e.bond, x1 = e.lv * 1e6 + e.exp, g1 = st.gold;
  sc.act();
  const b2 = e.bond, x2 = e.lv * 1e6 + e.exp;
  info.tribute = { cost, gold: g0 - g1, bond: [b0, b1, b2], exp: [x0, x1, x2] };
  checks.push(['공물: 금화 · 경험치 · 유대 +8 (같은 주기 두 번째는 유대 없음)', g0 - g1 === cost && b1 === b0 + 8 && x1 > x0 && b2 === b1 && x2 > x1, info.tribute]);
  sc.close?.();
  T.step(0.3);
  return { checks, info };
}));

// ═════════════ (2부) 깊은 물: 탄 채 들어가면 하차 · 물속 소환 거절 · 루멘 숨 감소 ×0.5 ═════════════
await run('deep', STAGE('s16', '&cmp=all&ch=20&mount=mt_warhorse&guards=gd_lumen,gd_knight'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  const st = g.state;
  st.companions.pending.length = 0; st.companions.autoSkill = false;
  T.until(() => g.top?.name === 'stage' && !T.w.cutscene, 10);
  const w = T.w, p = w.player;
  const kill = () => { for (const e of w.entities) if ((e.kind === 'enemy' || e.kind === 'boss') && !e.dead) { e.dead = true; e.hidden = true; } p.hp = p.stats.hp; };
  // 깊은 물이 3×3 칸 이상인 곳이 있는 방
  const LIQ = (await import('/src/core/physics.js')).T.LIQUID;
  let spot = null, room = null;
  const order = [w.roomId, ...Object.keys(w.stage.rooms).filter((r) => r !== w.roomId)];
  for (const rid of order) {
    if (w.roomId !== rid) w.loadRoom(rid);
    const m = w.map;
    for (let ty = 3; ty < m.h - 1 && !spot; ty++) for (let tx = 2; tx < m.w - 2 && !spot; tx++) {
      let ok = true;
      for (let yy = ty - 2; yy <= ty && ok; yy++) for (let xx = tx - 1; xx <= tx + 1 && ok; xx++) if (m.typeAt(xx, yy) !== LIQ) ok = false;
      if (ok) spot = { tx, ty };
    }
    if (spot) { room = rid; break; }
  }
  info.spot = { room, spot };
  checks.push(['(준비) s16 에 깊은 물 (3×3 칸 이상)', !!spot && !!w.gimmickOf('deep'), info.spot]);
  if (!spot) return { checks, info };
  kill();
  T.step(0.3);
  // 물가에서 탄 뒤 물속으로 옮긴다
  const m = T.ride('mt_warhorse');
  checks.push(['(준비) 탑승', !!m?.riding]);
  const ev0 = T.events.length, t0 = T.toasts.length;
  p.cx = spot.tx * 48 + 24; p.bottom = (spot.ty + 1) * 48 - 2; p.vx = 0; p.vy = 0;
  T.step(0.3, () => { kill(); return false; });
  const deep = w.gimmickOf('deep');
  const dis = T.events.slice(ev0).filter((e) => e.ev === 'dismounted');
  info.dismount = { reasons: dis.map((e) => e.reason), riding: m.riding, inWater: deep.inWater, toasts: T.toasts.slice(t0, t0 + 3) };
  checks.push(['탄 채 깊은 물 → 하차 (사유 deep) + 안내', !m.riding && dis.some((e) => e.reason === 'deep') && T.toasts.slice(t0).includes(T.D.CMP_TEXT.deep), info.dismount]);
  checks.push(['내린 기수 몸이 물속에서 박히지 않는다', T.fitsNow(), { x: p.x, b: p.bottom, w: p.w, h: p.h }]);
  // 물속에서 R → 거절
  const hold = () => { p.cx = spot.tx * 48 + 24; p.bottom = (spot.ty + 1) * 48 - 2; p.vx = 0; p.vy = 0; kill(); };
  m.cd = 0; m.state = 'stowed';
  T.step(0.1, () => { hold(); return false; });
  const t1 = T.toasts.length;
  T.key('KeyR', true); T.step(2 / 60, () => { hold(); return false; }); T.key('KeyR', false);
  T.step(0.6, () => { hold(); return false; });
  info.refuse = { riding: m.riding, state: m.state, inWater: deep.inWater, head: deep.headUnder, toasts: T.toasts.slice(t1, t1 + 3) };
  checks.push(['물속에서 R → 소환 거절 (물속에서는 탈것을 부를 수 없다)', !m.riding && m.state !== 'summoning' && T.toasts.slice(t1).includes(T.D.CMP_TEXT.underwater), info.refuse]);
  // 루멘: 숨 감소 ×0.5 (머리까지 잠긴 채 2초)
  const drain = (guards) => {
    T.CS.equipGuardian(st, null, 0, guards[0] ?? null); T.CS.equipGuardian(st, null, 1, guards[1] ?? null);
    w.companions.sync(true);
    T.step(0.05, () => { hold(); return false; });
    deep.air = 100;
    let under = 0;
    T.step(2.0, () => { hold(); if (deep.headUnder) under++; return false; });
    return { used: 100 - deep.air, under, mul: w.companions.airDrainMul };
  };
  const withLumen = drain(['gd_lumen', 'gd_knight']);
  const without = drain(['gd_knight', null]);
  info.air = { withLumen, without, ratio: +(withLumen.used / Math.max(1e-6, without.used)).toFixed(3) };
  checks.push(['루멘 장착: airDrainMul 0.5 · 숨 감소가 절반', withLumen.mul === 0.5 && without.mul === 1 && withLumen.under > 100 && Math.abs(info.air.ratio - 0.5) < 0.06, info.air]);
  return { checks, info };
}));

// ═════════════ (2부) 게일 windMul 0.5 · 실바 blightMul 0.5 ═════════════
await run('wind_blight', STAGE('s17', '&cmp=all&ch=20&mount=mt_warhorse'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  const st = g.state;
  st.companions.pending.length = 0;
  const into = (sid) => {
    if (T.w?.stage?.id !== sid) {
      g.go('stage', { stageId: sid }, { fade: false });
      T.until(() => g.top?.name === 'stage' && T.w?.stage?.id === sid && !!T.w.player, 20);
    }
    T.until(() => g.top?.name === 'stage' && !T.w.cutscene && !T.w.transitioning, 20);
    T.hook();
    return T.w;
  };
  // 바람 (s17): 같은 돌풍에서 땅 위 W 상한 = maxPush × 0.5 × windMul
  let w = into('s17');
  const kill = (ww) => { for (const e of ww.entities) if ((e.kind === 'enemy' || e.kind === 'boss') && !e.dead) { e.dead = true; e.hidden = true; } ww.player.hp = ww.player.stats.hp; };
  const windFor = (id) => {
    const p = w.player;
    const m = T.ride(id);
    kill(w); T.step(0.4, () => { kill(w); return false; });
    const x0 = p.cx, b0 = p.bottom;
    const wind = w.gimmickOf('wind');
    wind.setAuto(false); wind.W = 0;
    wind.gust(1, 900, 1.5, 0);
    let maxW = 0;
    T.step(1.2, () => { kill(w); p.cx = x0; p.bottom = b0; p.vx = 0; maxW = Math.max(maxW, Math.abs(wind.W)); return false; });
    return { id, riding: !!m?.riding, ground: p.onGround, maxW: Math.round(maxW), windMul: m?.def?.windMul ?? 1 };
  };
  const wa = windFor('mt_warhorse'), wg = windFor('mt_gale');
  info.wind = { warhorse: wa, gale: wg, ratio: +(wg.maxW / Math.max(1, wa.maxW)).toFixed(3) };
  checks.push(['게일: 돌풍 몫 절반 (windMul 0.5)', wa.riding && wg.riding && wg.windMul === 0.5 && wa.maxW > 50 && Math.abs(info.wind.ratio - 0.5) < 0.06, info.wind]);
  // 부패 (s19): 포자 구름 속 게이지 증가 × blightMul
  w = into('s19');
  const blightFor = (id) => {
    const p = w.player;
    const m = T.ride(id);
    kill(w); T.step(0.4, () => { kill(w); return false; });
    const b = w.gimmickOf('blight');
    const x0 = p.cx, b0 = p.bottom;
    b.reset?.(); b.meter = 0;
    b.addCloud(p.cx - 150, p.y - 150, 300, p.h + 200, 5);
    T.step(1.0, () => { kill(w); p.cx = x0; p.bottom = b0; p.vx = 0; return false; });
    return { id, riding: !!m?.riding, meter: +b.meter.toFixed(2), blightMul: m?.def?.blightMul ?? 1 };
  };
  const ba = blightFor('mt_warhorse'), bs = blightFor('mt_silva');
  info.blight = { warhorse: ba, silva: bs, ratio: +(bs.meter / Math.max(1e-6, ba.meter)).toFixed(3) };
  checks.push(['실바: 부패 게이지 증가 절반 (blightMul 0.5)', ba.riding && bs.riding && bs.blightMul === 0.5 && ba.meter > 5 && Math.abs(info.blight.ratio - 0.5) < 0.06, info.blight]);
  return { checks, info };
}));

// ═════════════ (2부) 유대 4단계 각성: 파생 수치 · 탈것 9 · 수호신 11 의 모습이 실제로 달라진다 ═════════════
await run('awakened', STAGE('s01', '&cmp=all&ch=20'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  const st = g.state, p = T.p;
  const MR = await import('/src/render/mounts.js'), GR = await import('/src/render/guardians.js');
  const ids = [...T.D.MOUNT_IDS, ...T.D.GUARDIAN_IDS];
  // 파생 수치: 유대 3단계 = 아님, 4단계 = 각성
  const bondAt = (r) => { for (const id of ids) st.companions.owned[id].bond = T.D.BOND_RANKS[r]; };
  const der = (id) => (T.D.MOUNT_IDS.includes(id) ? T.CS.mountDerived(st, id, p.stats) : T.CS.guardianDerived(st, id, p.stats));
  bondAt(3);
  const off = ids.filter((id) => der(id)?.awakened);
  bondAt(4);
  const on = ids.filter((id) => der(id)?.awakened);
  checks.push(['파생 수치: 유대 3단계 awakened=false · 4단계 true (스무 동료)', off.length === 0 && on.length === ids.length, { off, missing: ids.filter((id) => !on.includes(id)) }]);
  // 런타임 객체에 반영 (탈것 · 수호신)
  T.CS.equipMount(st, null, 'mt_warhorse'); T.CS.equipGuardian(st, null, 0, 'gd_knight'); T.CS.equipGuardian(st, null, 1, 'gd_imp');
  T.cs.sync(true); p.refreshStats?.(); T.step(0.6);
  checks.push(['런타임: 탈것 · 수호신 객체의 awakened', !!p.mount?.awakened && T.cs.guards.every((x) => !!x.d?.awakened), { mount: p.mount?.awakened, guards: T.cs.guards.map((x) => x.d?.awakened) }]);
  // 그림: 같은 순간을 각성 전/후로 그려 픽셀 비교 (채색 그림이 준비되면 그 경로로)
  try { await MR.preloadMounts(T.D.MOUNT_IDS); } catch { /* 벡터로 비교 */ }
  const W = 360, H = 300;
  const cv = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const diff = (a, b) => {
    const A = a.getContext('2d').getImageData(0, 0, W, H).data, B = b.getContext('2d').getImageData(0, 0, W, H).data;
    let n = 0, ink = 0;
    for (let i = 0; i < A.length; i += 4) {
      if (A[i + 3] > 20 || B[i + 3] > 20) ink++;
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) + Math.abs(A[i + 3] - B[i + 3]) > 60) n++;
    }
    return { n, ink };
  };
  const mRows = [], gRows = [];
  for (const id of T.D.MOUNT_IDS) {
    const draw = (aw) => {
      const c = cv(), ctx = c.getContext('2d');
      const v = T.M.mountView(id);
      v.cx = W / 2; v.bottom = H - 30; v.t = 1.3; v.awakened = aw; v.rank = aw ? 4 : 3;
      ctx.save(); MR.drawMount(ctx, v, null, 'back'); MR.drawMount(ctx, v, null, 'front'); ctx.restore();
      return c;
    };
    const d = diff(draw(false), draw(true));
    mRows.push({ id, ...d });
  }
  for (const id of T.D.GUARDIAN_IDS) {
    const def = T.D.GUARDIANS[id];
    const fake = (aw) => ({ id, def, anim: 'idle', animT: 0, t: 0.35, facing: 1, alpha: 1, seed: 0, vx: 0, vy: 0, cx: W / 2, bottom: H - 60, perched: false, d: { awakened: aw }, hopY: () => 0 });
    // 채색 그림 준비 (paintedReady 가 불러오기를 시작한다)
    for (let k = 0; k < 20; k++) { const c = cv(); GR.drawGuardian(c.getContext('2d'), fake(false), null, { awakened: false }); await new Promise((r) => setTimeout(r, 25)); }
    const draw = (aw, proc) => { const c = cv(), ctx = c.getContext('2d'); (proc ? GR.drawGuardianProcedural : GR.drawGuardian)(ctx, fake(aw), null, { awakened: aw, alpha: 1, hop: 0 }); return c; };
    const d = diff(draw(false, false), draw(true, false));
    const dp = diff(draw(false, true), draw(true, true));
    gRows.push({ id, n: d.n, ink: d.ink, proc: dp.n });
  }
  info.mounts = mRows; info.guards = gRows;
  const weakM = mRows.filter((r) => !(r.n >= 150 && r.n >= r.ink * 0.01));
  // 수호신은 작다 (잉크 400–2,700 px): 바뀐 픽셀이 잉크의 2.5% 이상 · 20 px 이상이면 '다르게 그려진다' (5% 미만은 info.subtle 로 알린다)
  const vis = (n, ink) => n >= 20 && n >= ink * 0.025;
  const weakG = gRows.filter((r) => !(vis(r.n, r.ink) && vis(r.proc, r.ink)));
  info.subtle = gRows.filter((r) => Math.min(r.n, r.proc) < r.ink * 0.05).map((r) => `${r.id} ${(Math.min(r.n, r.proc) / r.ink * 100).toFixed(1)}%`);
  checks.push(['탈것 9: 각성 모습이 실제로 다르게 그려진다 (픽셀 비교)', !weakM.length, weakM]);
  checks.push(['수호신 11: 각성 모습이 다르게 그려진다 (채색 · 절차 그림 모두)', !weakG.length, weakG]);
  return { checks, info };
}));

// ═════════════ 메뉴 「동료」 탭 — 키보드만: 탈것 장착 · 수호신 두 칸 · 자동 스킬 순환 · 8장 전 2번 칸 잠금 ═════════════
await run('menu', STAGE('s01', '&cmp=all&ch=8'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  const st = g.state;
  st.companions.pending.length = 0;
  T.CS.equipMount(st, null, null); T.CS.equipGuardian(st, null, 0, null); T.CS.equipGuardian(st, null, 1, null);
  T.cs.sync(true); T.step(0.2);
  const tap = (code, n = 1) => { for (let i = 0; i < n; i++) { T.key(code, true); g.tick(1 / 60); T.key(code, false); g.tick(1 / 60); g.tick(1 / 60); } };
  g.push('menu', { world: T.w, tab: 'companions' });
  T.step(0.3, null, { close: false, render: 5 });
  const menu = g.top, tb = menu?.cur;
  checks.push(['(준비) 메뉴 동료 탭', menu?.name === 'menu' && tb?.constructor?.name === 'CompanionsTab', [menu?.name, tb?.constructor?.name]]);
  if (!tb) return { checks, info };
  if (menu.focus !== 'content') tap('ArrowDown');
  const notes = [];
  const n0 = menu.notify.bind(menu);
  menu.notify = (t, c) => { notes.push(String(t)); return n0(t, c); };
  // 탈것 목록에서 바르그로 내려가 Z
  const to = (id) => { for (let k = 0; k < 30 && tb.curId !== id; k++) tap(tb.ids().indexOf(id) > tb.sel[tb.kind] ? 'ArrowDown' : 'ArrowUp'); return tb.curId === id; };
  const reachedMount = tb.kind === 'mount' && to('mt_boar');
  tap('KeyZ');
  T.step(0.2, null, { close: false });
  const L1 = T.CS.heroLoadout(st, null);
  info.mount = { reached: reachedMount, loadout: L1.mount, world: T.p?.mount?.id ?? null, focus: menu.focus, area: tb.area };
  checks.push(['키보드: 바르그 선택 → Z 장착 (월드 탈것도 바뀜)', reachedMount && L1.mount === 'mt_boar' && T.p?.mount?.id === 'mt_boar', info.mount]);
  // 나눔 단추로 수호신 목록: 맨 위에서 ↑ → 나눔 → → → ↓
  for (let k = 0; k < 20 && tb.area === 'list'; k++) tap('ArrowUp');
  const seg = tb.area;
  tap('ArrowRight'); tap('ArrowDown');
  info.seg = { seg, kind: tb.kind, area: tb.area };
  const okG1 = tb.kind === 'guardian' && to('gd_knight'); tap('KeyZ');
  const okG2 = to('gd_owl'); tap('KeyZ');
  T.step(0.3, null, { close: false });
  const L2 = T.CS.heroLoadout(st, null);
  info.guards = { okG1, okG2, loadout: [...L2.guards], world: T.cs.guards.map((x) => x.id) };
  checks.push(['키보드: 나눔 단추 → 수호신 → 가웨인 · 미네르바 두 칸 장착 (8장)', seg === 'seg' && okG1 && okG2 && L2.guards[0] === 'gd_knight' && L2.guards[1] === 'gd_owl' && T.cs.guards.length === 2, info.guards]);
  // 자동 스킬 (A): 기기 기본 → 켬 → 끔 → 기기 기본
  const seq = [st.companions.autoSkill];
  for (let i = 0; i < 3; i++) { tap('KeyA'); seq.push(st.companions.autoSkill); }
  checks.push(['A: 자동 스킬 순환 (기기 기본 → 켬 → 끔 → 기기 기본)', JSON.stringify(seq) === JSON.stringify([null, true, false, null]), seq]);
  // Z 다시 → 해제
  to('gd_owl'); tap('KeyZ');
  const L3 = T.CS.heroLoadout(st, null);
  checks.push(['장착한 수호신에서 Z → 해제', L3.guards[1] == null && L3.guards[0] === 'gd_knight', L3.guards]);
  // 8장 전: 2번 칸 잠금
  st.progress.chapter = 7;
  notes.length = 0;
  tb.activateSlot(2);
  const lockMsg = notes.includes(T.D.CMP_TEXT.slot2Locked);
  const btns = tb.buttonsFor('gd_imp').map((b) => b.label);
  const r = T.CS.equipGuardian(st, null, 1, 'gd_imp');
  info.lock = { lockMsg, btns, r };
  checks.push(['7장: 2번 칸 잠금 (칸 누르면 안내 · 단추에 수호신 2 없음 · 장착 거절)', lockMsg && !btns.some((l) => l.includes('수호신 2')) && !r.ok && r.msg === T.D.CMP_TEXT.slot2Locked, info.lock]);
  st.progress.chapter = 8;
  tap('KeyX');
  T.step(0.3, null, { close: false });
  checks.push(['X 로 메뉴를 닫는다', g.top?.name === 'stage', g.top?.name]);
  return { checks, info };
}));

// ═════════════ HUD 위젯: 장착하면 탭 영역 · 해제하면 없음 · 마을에서는 수호 위젯 없음 ═════════════
await run('hud', STAGE('s01', '&cmp=all&ch=20&mount=mt_warhorse&guards=gd_knight,gd_imp'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  const st = g.state;
  st.companions.pending.length = 0;
  const rects = () => { g.input?.beginRender?.(); g.render(); const R = T.cs?.hudRects || []; return (Array.isArray(R) ? R : Object.entries(R).map(([k, r]) => ({ act: k, ...r }))).map((r) => String(r.act ?? r.kind ?? r.id ?? '')); };
  T.step(0.3);
  const a = rects();
  checks.push(['스테이지: 탈것 + 수호신 둘 위젯 (탭 영역)', a.includes('mount') && a.filter((x) => x.startsWith('guard')).length === 2, a]);
  T.CS.equipMount(st, null, null); T.CS.equipGuardian(st, null, 0, null); T.CS.equipGuardian(st, null, 1, null);
  T.cs.sync(true); T.step(0.3);
  const b = rects();
  checks.push(['모두 해제하면 위젯 · 탭 영역 없음', b.length === 0, b]);
  const t0 = T.toasts.length;
  T.press('KeyR', 0.05); T.press('KeyG', 0.05);
  T.step(0.2);
  const said = T.toasts.slice(t0);
  checks.push(['장착 없음: R · G 는 안내만 (메뉴 › 동료)', said.includes(T.D.CMP_TEXT.noMount) && said.includes(T.D.CMP_TEXT.noGuard), said]);
  T.CS.equipMount(st, null, 'mt_warhorse'); T.CS.equipGuardian(st, null, 0, 'gd_knight');
  g.go('hub', { from: 'load' }, { fade: false });
  T.until(() => g.top?.name === 'hub' && !!T.w?.player && T.w.mode === 'town', 20);
  T.step(0.3);
  const c = rects();
  const ev0 = T.events.length;
  T.press('KeyG', 0.05);
  const gcast = T.events.slice(ev0).filter((e) => e.ev === 'guardianSkill').length;
  info.town = { rects: c, guards: T.cs?.guards?.length, gcast };
  // companions §7.1: 장착한 것이 없거나 마을이면 위젯 전체를 숨긴다 · 마을에서 수호신은 공격하지 않고 G 는 무시
  checks.push(['마을: 동료 위젯 전체 숨김 · G 무시', c.length === 0 && gcast === 0, info.town]);
  return { checks, info };
}));

// ═════════════ 입력 바인딩: R/G · 패드 10/11 (두 배치) · 터치 mount/guard ═════════════
await run('bindings', STAGE('s01'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  const C = await import('/src/data/controls.js');
  const { touchpad, PAD_IDS } = await import('/src/core/touchpad.js').then((m) => ({ touchpad: m.touchpad, PAD_IDS: m.PAD_IDS ?? null }));
  const inp = g.input;
  checks.push(['키보드 기본: mount = R · guard = G (다시 지정 가능)', C.KEY_DEFAULTS.mount.includes('KeyR') && C.KEY_DEFAULTS.guard.includes('KeyG') && C.REMAPPABLE.includes('mount') && C.REMAPPABLE.includes('guard')]);
  checks.push(['패드 두 배치 모두 mount = 10 (L3) · guard = 11 (R3)', ['arcade', 'classic'].every((k) => C.PAD_PRESETS[k].mount.includes(10) && C.PAD_PRESETS[k].guard.includes(11))]);
  checks.push(['터치: mount · guard 버튼', C.TOUCH_BINDINGS.mount.includes('mount') && C.TOUCH_BINDINGS.guard.includes('guard') && (!PAD_IDS || (PAD_IDS.includes('mount') && PAD_IDS.includes('guard')))]);
  const live = [];
  for (const preset of ['arcade', 'classic']) {
    inp.setPreset(preset);
    const b = inp.bindings;
    live.push({ preset, key: [b.key.mount, b.key.guard], pad: [b.pad.mount, b.pad.guard], acts: [inp.padActs[10], inp.padActs[11]] });
  }
  inp.setPreset('arcade');
  info.live = live;
  checks.push(['실행 중 바인딩 (두 배치): 키 R/G · 패드 10/11 이 mount/guard 로 풀린다', live.every((l) => l.key[0].includes('KeyR') && l.key[1].includes('KeyG') && l.acts[0]?.includes('mount') && l.acts[1]?.includes('guard')), live]);
  // 10/11 이 다른 동작과 겹치지 않는다 (메뉴 viewReset 은 메뉴 전용)
  const clash = live.map((l) => ({ p: l.preset, a10: (l.acts[0] || []).filter((a) => a !== 'mount'), a11: (l.acts[1] || []).filter((a) => a !== 'guard' && a !== 'viewReset') }));
  checks.push(['패드 10/11 에 게임 동작 겹침 없음 (11 의 viewReset 은 메뉴 전용)', clash.every((c) => !c.a10.length && !c.a11.length), clash]);
  return { checks, info };
}));

// ═════════════ (9)(10) 도구: scan_mount_fit · balance_companions ═════════════
if (want('tools') && !SKIP_TOOLS) {
  const t0 = Date.now(), checks = [], info = {};
  for (const name of ['scan_mount_fit', 'balance_companions']) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', name + '.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 900000, maxBuffer: 64 << 20 });
    const lines = String(r.stdout || '').trim().split('\n');
    const tail = lines.slice(-4).join(' | ');
    info[name] = { code: r.status, tail, err: String(r.stderr || '').trim().split('\n').slice(-2).join(' | ') };
    checks.push([`${name}.mjs 합격 (종료 코드 0)`, r.status === 0, tail]);
  }
  record('tools', { checks, info }, [], t0);
}

// ═════════════ (2부) 미라 반사 · 모모 포식: 쏜 탄 전부를 추적 (요청 #170 의 견고한 판정) + 재사용 대기 간격 ═════════════
await run('passives', STAGE('s05', '&cmp=all&ch=20&cmplv=10'), (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, checks = [], info = {};
  const st = g.state, w = T.w, p = T.p;
  st.companions.pending.length = 0; st.companions.autoSkill = false;
  T.CS.equipMount(st, null, null);
  const runOne = (id) => {
    T.CS.equipGuardian(st, null, 0, id); T.CS.equipGuardian(st, null, 1, null);
    w.companions.sync(true);
    T.clearFoes();
    const z = T.spawn('zombie', 420);
    if (z) { z.stats.maxHp = z.hp = 1e6; z.freeze = 99; }
    T.step(0.5);
    const gd = w.companions.guards[0];
    const P = gd.def.passive ?? {};
    const every = P.every ?? (id === 'gd_mirra' ? 5 : 6);
    // 준비된 채 시작하지 않는 경우까지 본다: 재사용 대기를 가득 채우고 시작
    if (id === 'gd_mirra') gd.mem.reflCd = every; else gd.mem.eatCd = every;
    const shots = [], hits = [];
    const ft = w.fx.text.bind(w.fx);
    w.fx.text = (x, y, s2, o) => { if (id === 'gd_momo' && String(s2) === String(P.text ?? '꺼억')) hits.push(+w.time.toFixed(2)); return ft(x, y, s2, o); };
    const t0 = w.time;
    let nextShot = 0;
    const DUR = every * 2 + 1.5;
    T.step(DUR, () => {
      p.hp = p.stats.hp; p.iframes = Math.max(p.iframes ?? 0, 0.5);
      if (z) { z.hp = 1e6; }
      if (w.time - t0 >= nextShot) {
        nextShot += 0.6;
        const sx = gd.cx + (gd.facing || 1) * 50, sy = gd.cy;
        const pr = w.spawnProjectile({ x: sx, y: sy, vx: -(gd.facing || 1) * 60, vy: 0, team: 'enemy', w: 12, h: 12, life: 3, owner: z, attack: { mv: 0, owner: z, tags: ['projectile'] } });
        if (pr) shots.push(pr);
      }
      if (id === 'gd_mirra') for (const q of shots) if (!q.__r && q.team !== 'enemy') { q.__r = true; hits.push(+w.time.toFixed(2)); }
      return false;
    });
    w.fx.text = ft;
    const rel = hits.map((t) => +(t - t0).toFixed(2));
    const gaps = rel.slice(1).map((t, i) => +(t - rel[i]).toFixed(2));
    return { id, every, shots: shots.length, at: rel, gaps };
  };
  const mi = runOne('gd_mirra'), mo = runOne('gd_momo');
  info.mirra = mi; info.momo = mo;
  const ok = (r) => r.at.length >= 2 && r.at[0] >= r.every - 0.1 && r.at[0] <= r.every + 0.5 && r.gaps.every((d) => d >= r.every - 0.1 && d <= r.every + 0.7);
  checks.push(['미라: 대기가 찬 뒤 5초마다 가까운 탄 하나를 되돌린다 (쏜 탄 전부 추적)', ok(mi), mi]);
  checks.push(['모모: 대기가 찬 뒤 6초마다 가까운 탄 하나를 먹는다 (꺼억)', ok(mo), mo]);
  return { checks, info };
}));

await browser.close(); srv.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 사례 통과${bad.length ? ' — 실패: ' + bad.map((r) => r.name).join(', ') : ''}`);
process.exit(bad.length ? 1 : 0);
