#!/usr/bin/env node
// 동료(탈것 · 수호신) 끝에서 끝까지 검사 — CMP-QA (companions §14 C10 점검표 1–10 + 2부; MASTER_PLAN §1.2 · §1.4 · §1.6 · §1.14)
//
//   node tools/test_companions.mjs                     전부 (점검표 9·10 은 scan_mount_fit · balance_companions 를 불러 결과를 싣는다)
//   node tools/test_companions.mjs --case newgame,save  고른 사례만      --skip-tools   9·10 번(도구 두 개) 건너뛰기
//   --verbose   통과 항목·세부 값도      --shots   사례마다 스크린샷 (/tmp/claude-0/proto/CMP-QA/)
//
// 사례 (점검표 번호):
//   newgame   (1) 새 게임 → 1장 허브 → 그레타 개장 대사 → 그림메인 합류 연출 → 마을에서 탑승 → s01 에서 탑승 → 1번 방을 탄 채 통과
//                 → 결과 화면 → 허브 (스테이지 클리어가 알 부화 카운터·유대를 올린다)
//   migrate   (2) 동료가 없는 6장 세이브(tools/fixtures/save_ch6_nocmp.json) 불러오기 → 아리아·코슈타·가웨인·미네르바 + 크론의 알(부화 가능)
//                 → 허브에서 합류 연출은 한 번에 최대 3명, 나머지는 메뉴 「동료」 탭의 NEW → 탭에서 보면 사라짐
//   stages    (3) 아홉 탈것 × s01–s20 시작 방: 소환 · 돌진 · 특수기 · 점프 · 하차, 박힘 없음 (깊은 물 속 시작은 거절이 정상)
//   guardians (4) 열한 수호신을 둘씩 s05 · s11 에서 30초씩 (둘씩 5초 × 6쌍): 적이 죽는다 · 자동 공격 경직 0 · 틀 시간 증가 ≤ 1.5 ms
//   boss_s03, boss_s12 (5) 탄 채로 수호신 둘과 둘라한 · 드라큘라: 등장 연출 · 50% 까지 · 보스 공격으로 낙마 · 재소환 · 유대 3 공명
//   save      (6) 탄 채로 관(세이브)에서 저장 → 다시 불러오기 · 내보내기 코드 왕복 · 클라우드 기록 경로(sanitizeTree → migrateState) · 256 KB
//   mobile    (7) 844×390 터치: 탑승/수호 버튼 · 누르기 · 수호 재사용 대기 가림막 · 캔버스 위젯 탭 · 스틱·다른 버튼과 겹침 없음
//   pad       (8) 가짜 게임패드: 버튼 10(L3) 탑승 · 11(R3) 수호신 스킬
//   tools     (9)(10) node tools/scan_mount_fit.mjs · node tools/balance_companions.mjs 의 합격 여부
//   recruit   (2부) 이야기 명령 {cmd:'recruit'} 여섯 (s14–s19 아웃트로) · 이야기 장면 · 대화 장면 · 플래그만 있는 세이브의 합류
//   stable    (2부) 영혼의 마구간: 구입(바르그 · 핌) · 잠금/금화 부족 · 알 부화(스테이지 두 번) · 그레타 의뢰(하티 · 스콜) · 공물
//   deep      (2부) 깊은 물: 탄 채 들어가면 하차 · 물속 소환 거절 · 루멘 숨 감소 ×0.5
//   wind_blight (2부) 게일 windMul 0.5 (돌풍 몫 절반) · 실바 blightMul 0.5 (부패 게이지 절반)
//   awakened  (2부) 유대 4단계: 파생 수치 awakened · 탈것 9 · 수호신 11 의 각성 모습이 실제로 다르게 그려진다
//   menu      메뉴 「동료」 탭 키보드만: 탈것 장착 · 수호신 두 칸(8장) · 자동 스킬 순환 · 8장 전 2번 칸 잠금
//   hud       HUD 위젯: 장착 시 탭 영역 · 해제하면 사라짐 · 마을에서는 수호 위젯 없음
//   bindings  R/G · 패드 10/11 (두 배치) · 터치 버튼 mount/guard 가 입력 바인딩에 있다
// 헤드리스 Chromium + tools/serve.mjs. 게임 시간은 game.tick(1/60) 을 직접 돌린다 (결정적). 터치·패드 사례만 실제 시간으로 잠깐 돈다.
// 모든 사례는 페이지 오류·콘솔 오류 0 이어야 통과한다.
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Touch, padLayout, pressButton, ensureTouchMode } from './qa/lib/touch.mjs';
import { fakePadInit, connect, setButton, BTN } from './qa/lib/fakepad.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const CASES = opt('case') ? String(opt('case')).split(',') : null;
const VERBOSE = !!opt('verbose'), SHOTS = !!opt('shots'), SKIP_TOOLS = !!opt('skip-tools');
const SHOT_DIR = '/tmp/claude-0/proto/CMP-QA';
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
const results = [];
const want = (name) => !CASES || CASES.includes(name);

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
        if (confirm && (top === 'dialogue' || top === 'companionJoin' || top === 'results' || top === 'story')) {
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
      w.onPlayerHit = (t, info, a) => { w.hits.push({ owner: a?.owner?.id ?? a?.owner?.kind, tags: [...(a?.tags ?? [])], hs: info?.hitstop ?? 0, t: t?.def?.id }); return oh(t, info, a); };
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
    for (const ev of ['mounted', 'dismounted', 'ultimateCast', 'guardianSkill', 'companionUnlocked', 'eggObtained', 'eggHatched', 'bondUp', 'companionLevelUp', 'stageCleared', 'questClaimed', 'awakenCast'])
      EV.bus.on(ev, (d) => T.events.push({ ev, ...(d || {}), t: g.world?.time }));
    return true;
  });
}

// ───────────────────────── 브라우저 ─────────────────────────
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
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
    await page.waitForFunction((ww) => !!window.__game && (!ww || !!window.__game.world?.player), waitWorld, { timeout: 90000 });
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
  for (const e of w2.enemies()) e.dead = true;
  p2.iframes = 0; T.step(0.3);
  T.press('KeyR', 0.05);
  let tr = null;
  T.step(1.0, () => { if (p2.mount.riding && tr === null) tr = true; return false; });
  checks.push(['s01 에서 R → 탑승', p2.mount.riding, p2.mount.state]);
  // 1번 방을 탄 채 통과: 오른쪽 출구 바로 앞으로 옮겨 오른쪽으로 달린다
  const room0 = w2.roomId, next = w2.room.exitRight;
  info.room = { room0, next };
  if (next) {
    const mp = w2.map;
    let spot = null;
    for (let tx = mp.w - 3; tx > mp.w - 12 && !spot; tx--) for (let ty = 1; ty < mp.h - 1 && !spot; ty++) {
      const s = T.M.findMountSpot(w2, null, p2.mount.def, { cx: tx * 48 + 24, bottom: (ty + 1) * 48 });
      const floor = mp.typeAt(tx, ty + 1);
      if (s && (floor === 1 || floor === 2 || floor === 3)) spot = s;
    }
    info.room.spot = spot;
    if (spot) { p2.cx = spot.cx; p2.bottom = spot.bottom; p2.vx = 0; p2.vy = 0; }
    T.key('ArrowRight', true);
    T.until(() => w2.roomId !== room0 && !w2.transitioning, 8, { confirm: false });
    T.key('ArrowRight', false);
    T.step(0.5);
    info.room.after = w2.roomId;
    checks.push(['1번 방 출구로 탄 채 통과', w2.roomId === next && p2.mount.riding && T.fitsNow(), { room: w2.roomId, riding: p2.mount.riding, state: p2.mount.state }]);
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
  checks.push(['소급 합류는 모두 합류 연출 대기(pending)', wantOwn.every((id) => st.companions.pending.includes(id)), st.companions.pending]);
  const again = JSON.parse(JSON.stringify(st));
  T.ST.migrateState(again);
  checks.push(['migrateState 두 번 = 같은 결과', JSON.stringify(again.companions) === JSON.stringify(st.companions)]);
  // 허브: 개장 대사 → 그림메인 → 합류 연출은 이번 방문에 최대 3명
  g.state = st;
  T.pushed.length = 0;
  g.go('hub', { from: 'load' }, { fade: false });
  let joins = 0, lastTop = null;
  T.until(() => {
    const top = g.top?.name;
    if (top === 'companionJoin' && lastTop !== 'companionJoin') joins++;
    lastTop = top;
    return top === 'hub' && T.pushed.length > 0 && !!T.w?.player && T.until.__idle === undefined && (() => { g.tick(1 / 60); return g.top?.name === 'hub'; })();
  }, 60);
  T.step(1.0, () => { const top = g.top?.name; if (top === 'companionJoin' && lastTop !== 'companionJoin') joins++; lastTop = top; return false; });
  const pend = T.CS.pendingIds(st);
  info.hub = { joins, pend, pushed: T.pushed.filter((n) => n !== 'dialogue') };
  checks.push(['허브: 그림메인도 합류 (그레타)', T.CS.isOwned(st, 'mt_warhorse')]);
  checks.push(['합류 연출은 한 번 방문에 최대 3명', joins >= 1 && joins <= 3, info.hub]);
  checks.push(['나머지는 대기로 남는다 (메뉴 NEW)', pend.length === 5 - joins, info.hub]);
  // 메뉴 「동료」 탭: NEW 가 남은 동료를 보면 대기에서 빠진다 (0.8초)
  g.push('menu', { world: T.w, tab: 'companions' });
  T.step(0.3, null, { close: false, render: 5 });
  const menu = g.top, tab = menu?.tabObj ?? menu?.cur ?? menu?.tab;
  checks.push(['메뉴 「동료」 탭이 열린다', g.top?.name === 'menu', g.top?.name]);
  const left = [...pend];
  let seenAll = true;
  const tabObj = (menu?.tabs ?? []).find?.((t) => t?.constructor?.name === 'CompanionsTab') ?? menu?.current ?? null;
  for (const id of left) {
    const tb = tabObj ?? (menu && Object.values(menu).find((v) => v?.constructor?.name === 'CompanionsTab'));
    if (!tb) { seenAll = false; break; }
    tb.select(id, false);
    T.step(1.0, null, { close: false, render: 10 });
  }
  info.after = { pend: T.CS.pendingIds(st), tab: !!tabObj };
  checks.push(['탭에서 본 동료는 대기(NEW)에서 빠진다', seenAll && T.CS.pendingIds(st).length === 0, info.after]);
  void tab;
  return { checks, info };
}));

await browser.close(); srv.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 사례 통과${bad.length ? ' — 실패: ' + bad.map((r) => r.name).join(', ') : ''}`);
process.exit(bad.length ? 1 : 0);
