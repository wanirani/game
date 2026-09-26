#!/usr/bin/env node
// 수호신 런타임 테스트 (CMP-SYS; companions §14 C3, §4–§5, §7.4; MASTER_PLAN §1.2 · §1.14)
//   node tools/test_guardians.mjs                A 그룹: CompanionSystem · 1부 수호신 여섯 (아리아 하티 핌 가웨인 크론 미네르바) · 허브 합류
//   node tools/test_guardians.mjs --only B       B 그룹: 틱톡 · 모르스 · 미라 · 루멘 · 모모 (CMP-GUARD-AI-B 의 guardian_ai_b.js)
//   node tools/test_guardians.mjs --only A,B     둘 다
//   --case name[,name]   특정 사례만   --verbose   통과 항목도 자세히   --mobile   모든 사례를 휴대폰 화면(844×390, 터치)으로
//   --shots              사례마다 스크린샷 (/tmp/claude-0/proto/CMP-SYS/)
// 헤드리스 Chromium + tools/serve.mjs. 게임 시간은 game.tick(1/60) 을 직접 돌려 진행한다 (실시간 대기 없이 결정적으로).
// 모든 사례는 페이지 오류·콘솔 오류 0 이어야 통과한다.
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const ONLY = String(opt('only') || 'A').toUpperCase().split(',');
const CASES_ONLY = opt('case') ? String(opt('case')).split(',') : null;
const VERBOSE = !!opt('verbose'), MOBILE = !!opt('mobile'), SHOTS = !!opt('shots');
const SHOT_DIR = '/tmp/claude-0/proto/CMP-SYS';
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

// ── 페이지 안 도우미 (window.__T) ──
function installHelpers() {
  const g = window.__game;
  const T = {
    g, events: [], texts: [],
    get w() { return g.world; },
    get p() { return g.world?.player; },
    /** 게임 시간 sec 초 진행 (each(i) 는 매 스텝 뒤). render: n 스텝마다 한 번 그림 */
    step(sec, each, render = 0) {
      const n = Math.max(1, Math.round(sec * 60));
      for (let i = 0; i < n; i++) {
        g.tick(1 / 60);
        if (render && i % render === 0) { g.input?.beginRender?.(); g.render(); }
        each?.(i);
      }
    },
    key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true })); },
    press(code, sec = 0.1) { this.key(code, true); this.step(sec); this.key(code, false); this.step(2 / 60); },
    spawn(id, dx, o = {}) { const w = this.w, p = this.p; return w.spawnEnemy(id, p.cx + dx, p.bottom, o); },
    clearFoes() { for (const e of this.w.enemies()) e.dead = true; this.step(2 / 60); },
    guards() { return this.w.entities.filter((e) => e.kind === 'companion'); },
    hook() {
      const w = this.w;
      if (w.__hooked) return;
      w.__hooked = true;
      const ft = w.fx.text.bind(w.fx);
      w.fx.text = (x, y, s, o) => { T.texts.push(String(s)); return ft(x, y, s, o); };
      const oh = w.onPlayerHit.bind(w);
      w.hits = [];
      w.onPlayerHit = (t, info, a) => { w.hits.push({ owner: a?.owner?.id ?? a?.owner?.kind, tags: [...(a?.tags ?? [])], hs: info?.hitstop ?? 0, dmg: info?.dmg, t: t?.def?.id }); return oh(t, info, a); };
    },
  };
  window.__T = T;
  return import('/src/core/events.js').then(({ bus }) => {
    for (const ev of ['guardianSkill', 'companionLevelUp', 'bondUp', 'companionUnlocked', 'ultimateCast']) bus.on(ev, (d) => T.events.push({ ev, ...(d || {}) }));
    return true;
  });
}

const results = [];
async function withPage(url, fn, { mobile = MOBILE } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|ERR_CERT|fonts\.g/.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
  try {
    await page.goto(`http://localhost:${port}/${url}`, { timeout: 45000 });
    await page.waitForFunction(() => window.__game?.world?.player || window.__game?.top?.name === 'hub', null, { timeout: 45000 });
    await page.waitForFunction(() => !!window.__game?.world?.player, null, { timeout: 45000 });
    await page.evaluate(installHelpers);
    await page.evaluate(() => { window.__T.hook(); window.__T.p.iframes = 1e9; });
    const out = await fn(page);
    return { out, errs, page, ctx };
  } catch (e) {
    return { out: null, errs: [...errs, 'HARNESS ' + (e?.stack ?? e)], page, ctx };
  }
}
/** 사례 하나: checks = [[이름, 조건, 설명]] */
async function run(group, name, url, fn, o = {}) {
  if (!ONLY.includes(group)) return;
  if (CASES_ONLY && !CASES_ONLY.includes(name)) return;
  const t0 = Date.now();
  const { out, errs, page, ctx } = await withPage(url, fn, o);
  if (SHOTS) { try { await page.evaluate(() => { window.__game.render(); }); await page.screenshot({ path: `${SHOT_DIR}/${name}.png` }); } catch { /* 무시 */ } }
  await ctx.close();
  const checks = out?.checks ?? [];
  const failed = checks.filter((c) => !c[1]);
  const ok = !!out && !failed.length && !errs.length;
  results.push({ group, name, ok, failed, errs, info: out?.info });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${ok ? '✓' : '✗'} [${group}] ${name} (${sec}s)${VERBOSE && out?.info ? ' ' + JSON.stringify(out.info) : ''}`);
  for (const c of failed) console.log(`    FAIL ${c[0]}${c[2] !== undefined ? ' — ' + (typeof c[2] === 'string' ? c[2] : JSON.stringify(c[2])) : ''}`);
  for (const e of errs.slice(0, 8)) console.log('    ' + e);
  if (VERBOSE) for (const c of checks.filter((c) => c[1])) console.log(`    ok   ${c[0]}`);
}
const STAGE = (s, q = '') => `index.html?scene=stage&stage=${s}${q}`;

// ══════════════════════════ A: CompanionSystem + 1부 수호신 ══════════════════════════
await run('A', 'spawn', STAGE('s05', '&guards=gd_knight,gd_imp&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w;
  const gs = T.guards();
  const dir = w.entities.filter((e) => e.kind === 'director').length;
  // 방 이동 뒤에도 다시 배치되는가
  const rooms = Object.keys(w.stage.rooms), other = rooms.find((r) => r !== w.roomId && !w.stage.rooms[r].boss) ?? rooms[0];
  w.loadRoom(other);
  T.step(0.2);
  const gs2 = T.guards(), p = T.p;
  return {
    info: { ids: gs.map((g) => g.id), z: gs.map((g) => g.z), room2: other },
    checks: [
      ['수호신 엔티티 2개 (kind companion)', gs.length === 2, gs.length],
      ['가웨인·핌', gs.map((g) => g.id).sort().join() === 'gd_imp,gd_knight', gs.map((g) => g.id)],
      ['감독 엔티티 1개', dir === 1, dir],
      ['수호신은 hittables/enemies 에 없다', !w.hittables().some((e) => e.kind === 'companion') && !w.enemies().some((e) => e.kind === 'companion')],
      ['z: 뒤(9) 수호신', gs.every((g) => g.z === (g.def.front ? 11 : 9))],
      ['방 이동 뒤 수호신 2개 · 감독 1개', gs2.length === 2 && w.entities.filter((e) => e.kind === 'director').length === 1, gs2.length],
      ['방 이동 뒤 기준점 근처', gs2.every((g) => Math.hypot(g.cx - p.cx, g.bottom - p.bottom) < 300), gs2.map((g) => Math.round(Math.hypot(g.cx - p.cx, g.bottom - p.bottom)))],
      ['같은 수호신 객체 유지 (재사용 대기 보존)', gs2.every((g) => gs.includes(g))],
    ],
  };
}));

await run('A', 'teleport', STAGE('s05', '&guards=gd_knight,gd_imp&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p;
  T.clearFoes();
  const x0 = p.x;
  p.x = Math.min(w.map.pxW - 120, p.x + 2000);
  if (p.x - x0 < 700) p.x = Math.max(60, x0 - 2000);
  const moved = Math.abs(p.x - x0);
  T.step(0.5);
  const d = T.guards().map((g) => Math.round(Math.hypot(g.cx - p.cx, g.bottom - p.bottom)));
  return { info: { moved, d }, checks: [['플레이어를 700px 넘게 옮김', moved >= 700, moved], ['0.5초 뒤 수호신이 620px 안', d.length === 2 && d.every((v) => v < 620), d]] };
}));

await run('A', 'auto_attack', STAGE('s05', '&guards=gd_knight,gd_imp&cmplv=20'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p;
  T.clearFoes();
  p.facing = 1;
  const zs = [T.spawn('zombie', 150), T.spawn('zombie', 210), T.spawn('zombie', -170)];
  const hp0 = zs.map((z) => z.hp);
  let maxHs = 0, maxComboT = 0, comboMax = 0;
  T.step(3, () => { maxHs = Math.max(maxHs, w.hitstop); if (w.combo.n > 0) maxComboT = Math.max(maxComboT, w.combo.t); comboMax = Math.max(comboMax, w.combo.n); }, 10);
  const lost = zs.map((z, i) => hp0[i] - Math.max(0, z.hp));
  const gh = w.hits.filter((h) => h.tags.includes('guardian'));
  return {
    info: { lost, hits: gh.length, maxHs, maxComboT, comboMax, owners: [...new Set(gh.map((h) => h.owner))] },
    checks: [
      ['입력 없이 3초 안에 적 체력 감소', lost.some((v) => v > 0), lost],
      ['두 수호신 모두 타격', new Set(gh.map((h) => h.owner)).size === 2, [...new Set(gh.map((h) => h.owner))]],
      ['수호신 자동 공격은 경직 0 (world.hitstop 0 유지)', maxHs === 0 && gh.every((h) => h.hs === 0), { maxHs, hs: [...new Set(gh.map((h) => h.hs))] }],
      ['콤보 수는 오르지만 시간(combo.t)은 1초를 넘게 연장하지 않음', comboMax > 0 && maxComboT <= 1.0001, { comboMax, maxComboT }],
      ['태그 companion+guardian', gh.every((h) => h.tags.includes('companion') && h.tags.includes('guardian'))],
      ['키보드 모드: 자동 스킬 없음', !T.events.some((e) => e.ev === 'guardianSkill')],
    ],
  };
}));

await run('A', 'guard_key', STAGE('s05', '&guards=gd_knight,gd_imp&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, cs = w.companions;
  T.clearFoes();
  T.press('KeyG');
  const e1 = T.events.filter((e) => e.ev === 'guardianSkill');
  const cd1 = cs.guards.map((g) => g.skillCd);
  T.press('KeyG');
  const e2 = T.events.filter((e) => e.ev === 'guardianSkill');
  T.press('KeyG');
  const e3 = T.events.filter((e) => e.ev === 'guardianSkill');
  const cool = T.texts.includes('쿨타임');
  const hud = cs.hudInfo();
  return {
    info: { e1: e1.map((e) => e.id), cd1, n3: e3.length, texts: T.texts.slice(-5) },
    checks: [
      ['G → guardianSkill (수동)', e1.length === 1 && e1[0].auto === false, e1],
      ['첫 번째 수호신(슬롯 0)부터', e1[0]?.id === cs.guards[0].id],
      ['재사용 대기 설정', cd1[0] > 20 && cd1[1] === 0, cd1],
      ['두 번째 G → 슬롯 1', e2.length === 2 && e2[1].id === cs.guards[1].id],
      ['세 번째 G → 쿨타임 문구, 시전 없음', e3.length === 2 && cool, T.texts.slice(-4)],
      ['hudInfo 재사용 대기 반영', hud?.guards?.every((g) => !g.ready && g.cd > 0 && g.cdMax > 0), hud],
      ['call-out 대기열 ≤ 2', cs.callouts.length === 2 && cs.callouts[0].line.length > 0, cs.callouts.length],
    ],
  };
}));

await run('A', 'auto_skill_touch', STAGE('s05', '&guards=gd_knight,gd_imp&cmplv=10'), (page) => page.evaluate(async () => {
  const T = window.__T, w = T.w;
  const { input } = await import('/src/core/input.js');
  T.clearFoes();
  input.touchMode = true;
  const auto0 = w.companions.autoOn();
  T.spawn('zombie', 120); T.spawn('zombie', 180); T.spawn('zombie', -140);
  T.step(2.5);   // 좀비는 땅에서 올라오는 동안(harmless) 세지 않는다
  const ev = T.events.filter((e) => e.ev === 'guardianSkill');
  // 자동 스킬 끔 (저장값 false) → 시전 없음
  w.state.companions.autoSkill = false;
  for (const g of w.companions.guards) g.skillCd = 0;
  const n0 = ev.length;
  T.step(1.0);
  const n1 = T.events.filter((e) => e.ev === 'guardianSkill').length;
  return {
    info: { auto0, ev: ev.map((e) => [e.id, e.auto]) },
    checks: [
      ['터치 모드 기본값 = 자동 켬', auto0 === true],
      ['적 3마리 근처 → 자동 스킬', ev.length >= 1 && ev.every((e) => e.auto === true), ev],
      ['자동 스킬 사이 간격 1초 (두 수호신이 한꺼번에 쓰지 않음)', ev.length <= 2 && (ev.length < 2 || ev[0].id !== ev[1].id), ev],
      ['autoSkill=false → 자동 시전 없음', n1 === n0, { n0, n1 }],
    ],
  };
}));

await run('A', 'assist', STAGE('s05', '&guards=gd_knight,gd_imp&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, cs = w.companions;
  T.clearFoes();
  p.facing = 1;
  const z = T.spawn('zombie', 70);
  z.stats.maxHp = z.hp = 1e6;
  T.step(0.1);
  p.stats.crit = 100;       // 치명타 = 협공 조건
  let saw = false;
  T.key('KeyX', true); T.step(0.08); T.key('KeyX', false);
  T.step(0.6, () => { if (cs.guards.some((g) => g.act?.name === 'assist' || g.anim === 'assist')) saw = true; });
  const ah = w.hits.filter((h) => h.tags.includes('assist'));
  const text = T.texts.filter((s) => s === '협공!').length;
  const pl = w.hits.filter((h) => h.owner === 'player').length;
  return {
    info: { pl, assists: ah.map((h) => [h.owner, h.hs]), text, cds: cs.guards.map((g) => g.assistCd) },
    checks: [
      ['플레이어 치명타 적중', pl > 0, pl],
      ['협공 동작', saw],
      ['협공 타격 (tags assist)', ah.length >= 1, ah],
      ["'협공!' 문구 (콤보 줄기마다 한 번)", text === 1, text],
      ['협공 경직 ≤ 0.03 (프레임 단위 반올림 2프레임)', ah.every((h) => h.hs <= 2 / 60 + 1e-6), ah.map((h) => h.hs)],
      ['협공 대기 설정', cs.guards.some((g) => g.assistCd > 1)],
    ],
  };
}));

await run('A', 'no_guardian_hit', STAGE('s05', '&guards=gd_knight,gd_imp&cmplv=20'), (page) => page.evaluate(async () => {
  const T = window.__T, w = T.w;
  T.clearFoes();
  const z = T.spawn('zombie', 150);
  z.noGuardianHit = true;
  const hp0 = z.hp;
  let targeted = false;
  T.step(3, () => { if (w.companions.guards.some((g) => g.target === z)) targeted = true; });
  // 소품 (거울 스위치처럼 takeHit 이 있는 prop) 은 수호신 판정이 건드리지 않는다
  const { gStrike, gAttack } = await import('/src/game/guardian.js');
  const g0 = w.companions.guards[0];
  let propHits = 0;
  const prop = w.add({ kind: 'prop', x: T.p.x, y: T.p.y, w: 40, h: 40, dead: false, cx: T.p.cx, cy: T.p.cy, takeHit() { propHits++; return false; }, update() {}, draw() {}, lights() {} });
  const n = gStrike(w, { x: T.p.x - 10, y: T.p.y - 10, w: 80, h: 80 }, gAttack(g0, {}));
  prop.dead = true;
  return {
    info: { hp0, hp: z.hp, targeted, n, propHits },
    checks: [
      ['noGuardianHit 적: 체력 그대로', z.hp === hp0, [hp0, z.hp]],
      ['noGuardianHit 적을 표적으로 잡지 않음', !targeted],
      ['수호신 판정은 소품을 치지 않음', propHits === 0 && n === 0, { n, propHits }],
    ],
  };
}));

await run('A', 'fairy_knight_skills', STAGE('s05', '&guards=gd_fairy,gd_knight&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, cs = w.companions;
  T.clearFoes();
  p.iframes = 0;
  p.hp = 1;
  cs.debug.skill(0);   // 아리아
  const hpAfter = p.hp, sh = cs.shieldT, inv = p.invuln;
  T.step(2.2);
  const shEnd = cs.shieldT;
  cs.debug.skill(1);   // 가웨인
  const wall = cs.wallT;
  const r = cs.incoming(p, 100, { owner: null, tags: [] });
  // 방패벽이 적 탄을 부순다
  const f = p.facing || 1;
  const pr = w.spawnProjectile({ x: p.cx + f * 180, y: p.bottom - 60, vx: -f * 300, vy: 0, team: 'enemy', w: 12, h: 12, life: 2, attack: { mv: 0, tags: ['projectile'] } });
  T.step(0.5);
  const walls = w.entities.filter((e) => e.kind === 'effect' && e.owner?.id === 'gd_knight').length;
  T.step(4.5);
  const r2 = cs.incoming(p, 100, { owner: null, tags: [] });
  return {
    info: { hpAfter, sh, inv, wall, r, prDead: pr.dead, walls, r2 },
    checks: [
      ['아리아: 회복 (최대 HP 25%)', hpAfter >= Math.floor(p.stats.hp * 0.2), [hpAfter, p.stats.hp]],
      ['아리아: 결계 2초 → shieldT·무적', sh > 1.9 && inv === true, { sh, inv }],
      ['결계 끝', shEnd === 0],
      ['가웨인: 방패벽 wallT ≈ 4', wall >= 3.9 && wall <= 6, wall],
      ['방패벽 중 받는 피해 ×0.7', r?.dmg === 70 && r.cancel === false, r],
      ['방패벽이 적 탄을 부숨', pr.dead === true],
      ['방패벽 연출 개체', walls === 1, walls],
      ['방패벽이 끝나면 incoming → null', r2 === null, r2],
    ],
  };
}));

await run('A', 'wolf_imp_whelp_owl_skills', STAGE('s05', '&guards=gd_spiritwolf,gd_imp&cmplv=15'), (page) => page.evaluate(async () => {
  const T = window.__T, w = T.w, p = T.p, cs = w.companions;
  T.clearFoes();
  p.facing = 1;
  const zs = [T.spawn('zombie', 200), T.spawn('zombie', 320)];
  for (const z of zs) { z.stats.maxHp = z.hp = 1e5; }
  cs.debug.skill(0);   // 하티: 늑대 무리
  let wolves = 0;
  T.step(0.5, () => { wolves = Math.max(wolves, w.entities.filter((e) => e.kind === 'projectile' && e.attack?.owner?.id === 'gd_spiritwolf').length); }, 6);
  const wolfHits = w.hits.filter((h) => h.owner === 'gd_spiritwolf').length;
  cs.debug.skill(1);   // 핌: 운석
  let meteors = 0;
  T.step(3, () => { meteors = Math.max(meteors, w.entities.filter((e) => e.kind === 'projectile' && e.attack?.owner?.id === 'gd_imp' && e.behavior === 'fall').length); }, 6);
  const impHits = w.hits.filter((h) => h.owner === 'gd_imp').length;
  // 크론·미네르바로 편성 바꾸기 (메뉴가 하는 것처럼 장착 후 sync)
  const S = await import('/src/game/companion_state.js');
  S.unlockCompanion(w.state, 'gd_whelp', { silent: true, reveal: false }); S.unlockCompanion(w.state, 'gd_owl', { silent: true, reveal: false });
  S.equipGuardian(w.state, null, 0, 'gd_whelp'); S.equipGuardian(w.state, null, 1, 'gd_owl');
  cs.sync();
  const ids = cs.guards.map((g) => g.id).join();
  T.step(0.2);
  { const z = T.spawn('zombie', 70); z.stats.maxHp = z.hp = 1e5; }   // 뼛조각 궤도(반지름 90) 안
  T.step(1.2);
  cs.debug.skill(0);   // 크론: 뼈 폭풍
  T.step(0.1);
  const bones = w.entities.filter((e) => e.kind === 'projectile' && e.behavior === 'orbit' && e.attack?.owner?.id === 'gd_whelp').length;
  const owl = cs.guards[1];
  cs.debug.skill(1);   // 미네르바: 성광
  T.step(0.3, null, 3);
  const beam = w.entities.filter((e) => e.kind === 'hitbox' && e.owner === owl).length;
  T.step(1.0, null, 6);
  const owlHits = w.hits.filter((h) => h.owner === 'gd_owl').length, whelpHits = w.hits.filter((h) => h.owner === 'gd_whelp').length;
  return {
    info: { wolves, wolfHits, meteors, impHits, ids, bones, beam, owlHits, whelpHits, aura: { crit: p.stats.crit } },
    checks: [
      ['하티: 유령 늑대 3마리', wolves === 3, wolves], ['하티 스킬 적중', wolfHits >= 1, wolfHits],
      ['핌: 운석이 떨어짐', meteors >= 1, meteors], ['핌 스킬 적중', impHits >= 1, impHits],
      ['편성 변경 → 크론·미네르바', ids === 'gd_whelp,gd_owl', ids],
      ['크론: 뼛조각 6개 궤도', bones === 6, bones],
      ['미네르바: 성광 판정', beam === 1, beam], ['크론·미네르바 적중', owlHits >= 1 && whelpHits >= 1, { owlHits, whelpHits }],
    ],
  };
}));

await run('A', 'owl_secrets', STAGE('s01', '&room=r1&guards=gd_owl&cmplv=5'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p;
  const br = w.map.markers.filter((m) => m.breakable);
  const b = br[0];
  if (b) { p.x = b.tx * 48 - 3 * 48; p.y = b.ty * 48 - p.h + 48; p.vx = p.vy = 0; }
  const owl = w.companions.guards[0];
  T.step(0.4, () => { if (b) { p.x = b.tx * 48 - 3 * 48; p.y = b.ty * 48 - p.h + 48; p.vy = 0; } });
  let drawOk = true;
  try { T.g.render(); } catch (e) { drawOk = String(e); }
  return {
    info: { breakables: br.length, secrets: (owl.mem.secrets?.length ?? 0) / 2 },
    checks: [['s01 r1 에 부서지는 벽', br.length > 0, br.length], ['미네르바가 가까운 비밀 벽을 찾음', (owl.mem.secrets?.length ?? 0) >= 2], ['윤곽 그리기 오류 없음', drawOk === true, drawOk]],
  };
}));

await run('A', 'resonance', STAGE('s05', '&guards=gd_knight,gd_imp&cmplv=10&bond=3'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, cs = w.companions;
  T.clearFoes();
  const res = cs.guards.map((g) => g.d?.resonance);
  w.run.sp = 100;
  T.press('KeyF', 0.08);
  const ult = T.events.some((e) => e.ev === 'ultimateCast');
  let sawCut = false;
  T.step(4, () => { if (w.cutscene || T.g.top?.name !== 'stage') sawCut = true; });
  const ev = T.events.filter((e) => e.ev === 'guardianSkill');
  return {
    info: { res, ult, sawCut, ev: ev.map((e) => [e.id, e.resonance]), cds: cs.guards.map((g) => g.skillCd), texts: T.texts.slice(-6) },
    checks: [
      ['유대 3 → 공명 가능', res.every(Boolean), res],
      ['필살기 → ultimateCast', ult],
      ['공명: 두 수호신 무료 시전', ev.length === 2 && ev.every((e) => e.resonance === true), ev],
      ['공명은 재사용 대기를 쓰지 않음', cs.guards.every((g) => g.skillCd === 0), cs.guards.map((g) => g.skillCd)],
      ["'공명!' 문구", T.texts.includes('공명!')],
    ],
  };
}));

await run('A', 'exp_bond', STAGE('s05', '&guards=gd_imp&mount=mt_warhorse&cmplv=3'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, st = w.state, cs = w.companions;
  T.clearFoes();
  const own = st.companions.owned;
  const tot = (id) => { let n = own[id].exp, lv = own[id].lv; return lv * 1e6 + n; };
  const e0 = tot('gd_imp'), b0 = own.gd_imp.bond, m0 = tot('mt_warhorse'), mb0 = own.mt_warhorse.bond;
  const z = T.spawn('zombie', 120);
  z.hp = 1;
  T.step(2.5);
  const killed = z.dead || z.dying > 0 || z.hp <= 0;
  const e1 = tot('gd_imp');
  cs.onBossDefeated({ stats: { exp: 2000 }, def: { id: 'b_test' } });
  const b1 = own.gd_imp.bond, mb1 = own.mt_warhorse.bond, e2 = tot('gd_imp');
  // 50킬마다 유대 +1 (스테이지당 5번)
  const k0 = own.gd_imp.bond;
  for (let i = 0; i < 400; i++) cs.onKill({ def: { id: 'x' }, cx: 0, cy: 0 }, 0);
  const k1 = own.gd_imp.bond;
  return {
    info: { e0, e1, e2, b0, b1, mb0, mb1, k0, k1, m0, lvUp: T.events.filter((e) => e.ev === 'companionLevelUp').length },
    checks: [
      ['수호신 공격으로 처치', killed],
      ['처치 경험치 40% 가 수호신에게', e1 > e0, [e0, e1]],
      ['탑승하지 않은 탈것은 처치 경험치 없음', tot('mt_warhorse') >= m0],
      ['보스 처치: 장착한 수호신·탈것 유대 +10', b1 - b0 === 10 && mb1 - mb0 === 10, { b0, b1, mb0, mb1 }],
      ['보스 경험치 50%', e2 > e1],
      ['50킬마다 유대 +1, 최대 5', k1 - k0 === 5, { k0, k1 }],
    ],
  };
}));

await run('A', 'hud_mount_air', STAGE('s05', '&guards=gd_lumen&mount=mt_warhorse&cmplv=5'), (page) => page.evaluate(async () => {
  const T = window.__T, w = T.w, p = T.p, cs = w.companions;
  const MR = await import('/src/game/mount.js');
  const hud = cs.hudInfo();
  const isRider = !!MR.MountRider && p.mount instanceof MR.MountRider, air = cs.airDrainMul;
  // HUD 위젯 탭 → 스킬
  const { input } = await import('/src/core/input.js');
  cs.hudRects = [{ x: 10, y: 10, w: 40, h: 40, act: 'guard', slot: 0 }];
  input.pointer.tapped = true; input.pointer.x = 30; input.pointer.y = 30;
  cs.handleTaps(p);
  const tapped = T.events.some((e) => e.ev === 'guardianSkill');
  // 편성 해제 → 탈것·수호신 없음
  const S = await import('/src/game/companion_state.js');
  S.equipMount(w.state, null, null); S.equipGuardian(w.state, null, 0, null);
  cs.sync();
  T.step(0.1);
  return {
    info: { hud, air: cs.airDrainMul, after: cs.hudInfo(), mount: !!p.mount },
    checks: [
      ['hudInfo.mount = 그림메인', hud?.mount?.id === 'mt_warhorse' && hud.mount.riding === false, hud?.mount],
      ['hudInfo.guards = 루멘', hud?.guards?.length === 1 && hud.guards[0].id === 'gd_lumen' && hud.guards[0].cdMax > 0, hud?.guards],
      ['player.mount = MountRider (mount.js)', isRider],
      ['루멘 장착 → airDrainMul 0.5, 해제 → 1', air === 0.5 && cs.airDrainMul === 1, [air, cs.airDrainMul]],
      ['HUD 위젯 탭 → 수호신 스킬', tapped],
      ['편성 해제 → hudInfo null · 탈것 떼기 · 수호신 없음', cs.hudInfo() === null && !p.mount && T.guards().length === 0, cs.hudInfo()],
    ],
  };
}));

await run('A', 'air_drain', STAGE('s05', '&guards=gd_lumen&cmplv=5'), (page) => page.evaluate(() => {
  const cs = window.__T.w.companions;
  return { checks: [['루멘 장착 → airDrainMul 0.5', cs.airDrainMul === 0.5, cs.airDrainMul], ['incoming: 아무 효과 없으면 null', cs.incoming(window.__T.p, 50, {}) === null]] };
}));

await run('A', 'town', 'index.html?scene=hub&cmp=gd_knight,gd_imp&guards=gd_knight,gd_imp&cmplv=20', (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, cs = w.companions;
  const gs = T.guards();
  T.step(0.5);
  const z = T.spawn('zombie', 120);
  const hp0 = z.hp;
  let tg = false;
  T.press('KeyG');
  T.step(2, () => { if (cs.guards.some((g) => g.target)) tg = true; });
  return {
    info: { mode: w.mode, n: gs.length, hp0, hp: z.hp },
    checks: [
      ['마을에서 활성', cs.active === true && w.mode === 'town'],
      ['마을에도 수호신이 따라다님', gs.length === 2, gs.length],
      ['G 무시', !T.events.some((e) => e.ev === 'guardianSkill')],
      ['표적을 잡지 않음', !tg],
      ['공격하지 않음', z.hp === hp0 && !w.hits.some((h) => h.tags.includes('guardian')), [hp0, z.hp]],
    ],
  };
}));

await run('A', 'arcade_inactive', 'index.html?scene=stage&stage=s05&guards=gd_knight&cmplv=5', (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g;
  const { World } = await import('/src/game/world.js');
  const st = g.state;
  st.arcade = true;
  let w2 = null, ok = true;
  try { w2 = new World(g, 's01', { mode: 'bossrush' }); } catch (e) { ok = String(e); }
  st.arcade = false;
  return { checks: [['아케이드 월드: 동료 비활성', ok === true && w2.companions.active === false && !w2.entities.some((e) => e.kind === 'companion'), ok], ['아케이드 hudInfo null', w2?.companions.hudInfo() === null]] };
}));

await run('A', 'hub_enter', 'index.html?scene=hub&ch=1', (page) => page.evaluate(async () => {
  const T = window.__T, g = T.g, st = g.state;
  const C = await import('/src/game/companions.js');
  const S = await import('/src/game/companion_state.js');
  const hub = g.top;
  const pushed = [];
  const push0 = g.push.bind(g);
  g.push = (name, prm) => { pushed.push(name); return push0(name, prm); };
  C.companionHubEnter(g, hub);
  // 대사·합류 연출이 떠 있으면 넘긴다
  for (let i = 0; i < 80 && g.top !== hub; i++) { T.press(i % 2 ? 'Enter' : 'KeyZ', 0.05); T.step(0.25); }
  const owned = S.isOwned(st, 'mt_warhorse'), flag = !!st.progress.flags.stable_open, pend = S.pendingIds(st);
  const note0 = C.companionHubNote(st);
  S.obtainEgg(st, 'gd_whelp', { at: -99 });
  const noteEgg = C.companionHubNote(st);
  // 한 번 방문에 합류 연출 최대 3명
  for (const id of ['gd_fairy', 'gd_imp', 'gd_knight', 'gd_owl', 'mt_boar']) S.unlockCompanion(st, id, { source: 'debug' });
  hub._cmpVisit = null;
  const before = S.pendingIds(st).length;
  C.companionHubEnter(g, hub);
  for (let i = 0; i < 120 && g.top !== hub; i++) { T.press(i % 2 ? 'Enter' : 'KeyZ', 0.05); T.step(0.3); if (g.top === hub) C.companionHubEnter(g, hub); }
  const after = S.pendingIds(st).length;
  // 다른 장면이 위에 있으면 아무것도 하지 않는다
  hub._cmpVisit = null;
  g.push('dialogue', { lines: [{ who: 'narrator', text: '…' }], world: hub.world });
  const n0 = pushed.length;
  C.companionHubEnter(g, hub);
  const blocked = pushed.length === n0 + 0;
  return {
    info: { pushed, owned, flag, pend, note0, noteEgg, before, after },
    checks: [
      ['1장: 마구간 개장 → 그림메인 합류', owned && flag],
      ['합류 연출을 보면 pending 에서 빠짐', !pend.includes('mt_warhorse'), pend],
      ['합류 연출 장면 companionJoin', pushed.includes('companionJoin'), pushed],
      ['마구간 알림: 없음 → 알 부화 가능', note0 === null && typeof noteEgg === 'string' && noteEgg.length > 0, { note0, noteEgg }],
      ['방문마다 최대 3명', before === 5 && after === 2, { before, after }],
      ['위에 다른 장면이 있으면 대기', blocked],
    ],
  };
}));

await run('A', 'all_guardians_s05', STAGE('s05', '&cmp=all&cmplv=15'), (page) => allGuardians(page));
await run('A', 'all_guardians_s11', STAGE('s11', '&cmp=all&cmplv=25'), (page) => allGuardians(page));
function allGuardians(page) {
  return page.evaluate(async () => {
    const T = window.__T, w = T.w, p = T.p, cs = w.companions;
    const S = await import('/src/game/companion_state.js');
    const D = await import('/src/data/companions.js');
    w.state.progress.chapter = Math.max(8, w.state.progress.chapter ?? 0);
    const ids = D.GUARDIAN_IDS;
    const pairs = [];
    for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[(i + 1) % ids.length]]);
    const hitBy = {}, skills = {};
    for (const [a, b] of pairs) {
      S.equipGuardian(w.state, null, 0, a); S.equipGuardian(w.state, null, 1, b);
      cs.sync();
      T.clearFoes();
      for (const dx of [140, 220, -160, 300]) { const z = T.spawn('zombie', dx); z.stats.maxHp = z.hp = 1e5; }
      T.step(0.2);
      cs.debug.skill(0); cs.debug.skill(1);
      T.step(3.5, null, 5);
      for (const h of w.hits) if (h.owner) hitBy[h.owner] = (hitBy[h.owner] ?? 0) + 1;
      w.hits.length = 0;
      for (const e of T.events.filter((e) => e.ev === 'guardianSkill')) skills[e.id] = true;
    }
    const miss = ids.filter((id) => !hitBy[id]);
    return { info: { hitBy, skills: Object.keys(skills).length, room: w.roomId }, checks: [['11 수호신 모두 적을 침', miss.length === 0, miss], ['11 수호신 모두 스킬 시전', Object.keys(skills).length === ids.length, Object.keys(skills)], ['플레이어 생존', !p.dead]] };
  });
}

await run('A', 'perf', STAGE('s11', '&guards=gd_knight,gd_imp&cmplv=20'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, cs = w.companions;
  T.clearFoes();
  const spawn = () => { for (const dx of [160, 240, 320, -180, -260, -340]) { const z = T.spawn('zombie', dx); z.stats.maxHp = z.hp = 1e7; } };
  spawn();
  const time = () => { const r = []; for (let k = 0; k < 5; k++) { const t0 = performance.now(); for (let i = 0; i < 60; i++) w.update(1 / 60); r.push((performance.now() - t0) / 60); } r.sort((a, b) => a - b); return r[1]; };
  w.update(1 / 60);
  const withG = time();
  for (const g of cs.guards) g.dead = true;
  cs.guards = []; cs.active = false;
  for (const e of w.entities) if (e.kind === 'projectile' || e.kind === 'hitbox' || e.kind === 'effect') e.dead = true;
  w.update(1 / 60);
  const without = time();
  const delta = withG - without;
  return { info: { withG: +withG.toFixed(3), without: +without.toFixed(3), delta: +delta.toFixed(3) }, checks: [['수호신 2 + 적 6: 업데이트 시간 증가 ≤ 1.5 ms', delta <= 1.5, { withG, without }]] };
}));

// ══════════════════════════ B: guardian_ai_b.js (CMP-GUARD-AI-B) ══════════════════════════
await run('B', 'clock_timestop', STAGE('s05', '&guards=gd_clock&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, cs = w.companions;
  T.clearFoes();
  T.spawn('zombie', 200);
  cs.debug.skill(0);
  T.step(0.05);
  const ts = w.timeStop;
  return { info: { ts }, checks: [['틱톡: timeStop ≈ 2 (Lv10: 2.18)', ts >= 1.9 && ts <= 2.7, ts]] };
}));
await run('B', 'reaper_execute', STAGE('s05', '&guards=gd_reaper&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w;
  T.clearFoes();
  const z = T.spawn('zombie', 160);
  T.step(0.1);
  z.hp = Math.max(1, Math.floor(z.stats.maxHp * 0.1));
  T.step(3, null, 10);
  return { info: { hp: z.hp, texts: T.texts.slice(-4) }, checks: [['모르스: 체력 10% 좀비 처형', z.dead || z.dying > 0 || z.hp <= 0], ["'처형' 문구", T.texts.includes('처형')]] };
}));
await run('B', 'mirra_reflect', STAGE('s05', '&guards=gd_mirra&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p;
  T.clearFoes();
  const z = T.spawn('zombie', 300);
  let reflected = false;
  for (let k = 0; k < 8 && !reflected; k++) {
    const g = w.companions.guards[0];
    const pr = w.spawnProjectile({ x: g.cx + 60, y: g.cy, vx: -120, vy: 0, team: 'enemy', w: 12, h: 12, life: 3, owner: z, attack: { mv: 1, owner: z, tags: ['projectile'] } });
    T.step(0.8, () => { if (pr.team === 'player' || pr.attack?.team === 'player') reflected = true; });
  }
  void p;
  return { checks: [['미라: 5초마다 탄 하나를 되돌림', reflected]] };
}));
await run('B', 'lumen_flash', STAGE('s05', '&guards=gd_lumen&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, cs = w.companions;
  T.clearFoes();
  const zs = [T.spawn('zombie', 150), T.spawn('zombie', 260)];
  for (const z of zs) z.stats.maxHp = z.hp = 1e5;
  cs.debug.skill(0);
  T.step(0.1);
  const stun = zs.map((z) => z.stun ?? 0);
  return { info: { stun, air: cs.airDrainMul }, checks: [['루멘: 화면 안 적 기절 ≥ 1초', stun.every((s) => s >= 1.0), stun], ['airDrainMul 0.5', cs.airDrainMul === 0.5]] };
}));
await run('B', 'momo_eat', STAGE('s05', '&guards=gd_momo&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, cs = w.companions;
  T.clearFoes();
  const z = T.spawn('zombie', 320);
  let eaten = false;
  for (let k = 0; k < 10 && !eaten; k++) {
    const pr = w.spawnProjectile({ x: p.cx + 90, y: p.cy, vx: -40, vy: 0, team: 'enemy', w: 12, h: 12, life: 3, owner: z, attack: { mv: 0, owner: z, tags: ['projectile'] } });
    T.step(0.8, () => { if (pr.dead && pr.life > 0.1) eaten = true; });
  }
  p.iframes = 0; p.hp = Math.floor(p.stats.hp * 0.5);
  const hp0 = p.hp;
  cs.debug.skill(0);
  T.step(1.5);
  return { info: { hp0, hp: p.hp }, checks: [['모모: 가까운 적 탄을 먹음', eaten], ['악몽 포식: 최대 HP 10% 회복', p.hp - hp0 >= Math.floor(p.stats.hp * 0.08), [hp0, p.hp]]] };
}));

await browser.close();
srv.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 사례 통과${bad.length ? ' — 실패: ' + bad.map((r) => r.name).join(', ') : ''}`);
process.exit(bad.length ? 1 : 0);
