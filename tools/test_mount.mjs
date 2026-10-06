#!/usr/bin/env node
// 탈것 런타임 테스트 (CMP-MOUNT; companions §3, §11.4, §14 C2; world2 §14; MASTER_PLAN §1.2 · §1.7 · §1.14)
//   node tools/test_mount.mjs                          1부 탈것 여섯 (그림메인 바르그 코슈타 스콜 스칼렛 녹티스) + 공통 규칙 + 터치·패드
//   node tools/test_mount.mjs --only mt_ignis,mt_gale,mt_silva   2부 탈것 (CMP-MOUNT-B 의 mount_b.js 가 채운 뒤) — 탈것 id 나 사례 이름으로 고른다
//   (외전 아르겐 mt_argen 은 기본 실행에 든다 · --only mt_argen 으로 따로)
//   --case name[,name]   특정 사례만   --verbose   통과 항목도   --shots   사례마다 스크린샷 (/tmp/claude-0/proto/CMP-MOUNT/)
// 헤드리스 Chromium + tools/serve.mjs. 게임 시간은 game.tick(1/60) 을 직접 돌려 진행한다 (결정적). 터치·패드 사례만 실제 시간으로 잠깐 돈다.
// 모든 사례는 페이지 오류·콘솔 오류 0 이어야 통과한다.
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Touch, padLayout, pressButton, ensureTouchMode } from './qa/lib/touch.mjs';
import { fakePadInit, connect, setButton, BTN } from './qa/lib/fakepad.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf('--' + k); return i < 0 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const P1 = ['mt_warhorse', 'mt_boar', 'mt_skelsteed', 'mt_direwolf', 'mt_wyvern', 'mt_giantbat'];
const P2 = ['mt_ignis', 'mt_gale', 'mt_silva'];
const ONLY = opt('only') ? String(opt('only')).split(',') : null;
const CASES_ONLY = opt('case') ? String(opt('case')).split(',') : null;
const VERBOSE = !!opt('verbose'), SHOTS = !!opt('shots');
const SHOT_DIR = '/tmp/claude-0/proto/CMP-MOUNT';
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
const results = [];

// ── 1) 정적 검사: DISMOUNT_SKILLS 가 skills.js · skills_p2.js 의 순간이동·발사 스킬과 맞는가 (companions §3.6.4) ──
function staticChecks() {
  const checks = [];
  const src = ['src/game/skills.js', 'src/game/skills_p2.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  // 함수 단위로 자른다: SKILL_IMPL(.P2)?.id = … 부터 다음 정의까지
  const re = /^(?:SKILL_IMPL(?:_P2)?\.([a-z0-9_]+)\s*=|ULTS\.([a-z0-9_]+)\s*=|(?:export\s+)?function\s+([A-Za-z0-9_]+))/gm;
  const marks = [];
  let mm;
  while ((mm = re.exec(src))) marks.push({ at: mm.index, id: mm[1] ?? null, ult: !!mm[2] });
  const want = new Set();
  marks.forEach((mk, i) => {
    if (!mk.id) return;
    const body = src.slice(mk.at, marks[i + 1]?.at ?? src.length);
    if (/\bp\.(x|y|cx|bottom|hidden)\s*(=|\+=|-=)[^=]/.test(body) || /\bp\.vy\s*=\s*-(9\d\d|1\d{3})\b/.test(body)) want.add(mk.id);
  });
  // mount.js 는 브라우저 모듈(렌더러를 import)이라 node 에서 읽지 않고 파일에서 목록을 꺼낸다
  const t = fs.readFileSync(path.join(ROOT, 'src/game/mount.js'), 'utf8');
  const m = /export const DISMOUNT_SKILLS\s*=\s*\[([^\]]*)\]/.exec(t);
  const have = new Set(m ? m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : []);
  checks.push(['DISMOUNT_SKILLS 가 grep 결과와 같다', want.size > 0 && [...want].every((id) => have.has(id)) && [...have].every((id) => want.has(id)), { grep: [...want], list: [...have] }]);
  return checks;
}

// ── 2) 브라우저 ──
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

/** 페이지 안 도우미 (window.__T) */
function installHelpers() {
  const g = window.__game;
  const T = {
    g, texts: [], toasts: [], events: [],
    get w() { return g.world; },
    get p() { return g.world?.player; },
    get m() { return g.world?.player?.mount; },
    /** sec 초 진행 (대사는 닫는다). each(i) → true 면 멈춘다. 돌아간 스텝 수 */
    step(sec, each) {
      const n = Math.max(1, Math.round(sec * 60));
      for (let i = 0; i < n; i++) {
        g.tick(1 / 60);
        for (let k = 0; k < 8 && (g.top?.name === 'dialogue' || g.top?.name === 'companionJoin'); k++) g.pop();
        if (each?.(i)) return i + 1;
      }
      return n;
    },
    key(code, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true })); },
    press(code, sec = 0.1) { this.key(code, true); this.step(sec); this.key(code, false); this.step(2 / 60); },
    tap(code) { this.key(code, true); this.key(code, false); },
    spawn(id, dx, o = {}) { const w = this.w, p = this.p; const e = w.spawnEnemy(id, p.cx + dx, p.bottom, o); e.facing = -Math.sign(dx) || 1; return e; },
    clearFoes() { for (const e of this.w.enemies()) e.dead = true; this.step(2 / 60); },
    equip(id) { this.CS.equipMount(this.w.state, null, id); this.w.companions.sync(true); return this.p.mount; },
    ride(id) { const m = this.equip(id); m.cd = 0; m.state = m.state === 'recall' ? 'stowed' : m.state; m.summon(this.w, this.p, { force: true, instant: true }); this.step(4 / 60); return m; },
    reset(m) { if (!m) return; m.cd = 0; m.chargeCd = 0; m.specialCd = 0; m.invulnT = 0; m.hazardT = 0; m.hp = m.maxHp; m.act = null; this.p.iframes = 0; this.p.hurtT = 0; },
    /** 맵에서 조건에 맞는 칸 찾기 (fn(tx, ty, map) → bool) */
    findTile(fn) { const m = this.w.map; for (let ty = 1; ty < m.h - 1; ty++) for (let tx = 1; tx < m.w - 1; tx++) if (fn(tx, ty, m)) return { tx, ty }; return null; },
    /** 발을 (tx 칸 가운데, ty 칸 위쪽 경계) 에 */
    place(tx, ty) { const p = this.p; p.cx = tx * 48 + 24; p.bottom = ty * 48; p.vx = 0; p.vy = 0; p.onGround = false; },
    /** 실시간 사례용: 적 · 이야기 트리거 치우기, 열린 대사 닫기 */
    quiet() { const w = this.w; for (const e of w.entities) if (e.kind === 'enemy' || e.constructor?.name === 'StoryTrigger') e.dead = true; while (g.top?.name === 'dialogue') g.pop(); },
    fitsNow() { const p = this.p; return this.M.fits(this.w, p.x, p.bottom, p.w, p.h); },
    /** 스테이지를 새로 연다 (훅을 건 뒤 처음부터 재기 위해) */
    restart(stageId, roomId = null) { g.go('stage', { stageId, roomId }, { fade: false }); this.step(1 / 60); this.hook(); return this.w; },
    /** 기준 위치 (발) 로 되돌리기 */
    home: null,
    setHome() { const p = this.p; this.home = { x: p.cx, b: p.bottom }; },
    goHome() { const p = this.p, h = this.home; p.cx = h.x; p.bottom = h.b; p.vx = 0; p.vy = 0; this.step(0.3); },
    hook() {
      const w = this.w;
      if (!w || w.__mhook) return;
      w.__mhook = true;
      const ft = w.fx.text.bind(w.fx);
      w.fx.text = (x, y, s, o) => { T.texts.push(String(s)); return ft(x, y, s, o); };
    },
  };
  window.__T = T;
  const toast = g.toast.bind(g);
  g.toast = (text, ...a) => { T.toasts.push(String(text)); return toast(text, ...a); };
  return Promise.all([import('/src/game/companion_state.js'), import('/src/game/mount.js'), import('/src/core/events.js'), import('/src/game/mount_b.js'), import('/src/core/physics.js')]).then(([CS, M, EV, MB, PH]) => {
    T.CS = CS; T.M = M; T.MB = MB; T.PH = PH;
    for (const ev of ['mounted', 'dismounted', 'ultimateCast']) EV.bus.on(ev, (d) => T.events.push({ ev, ...(d || {}), t: g.world?.time }));
    return true;
  });
}

async function withPage(url, fn, { mobile = false, initScripts = [] } = {}) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  for (const s of initScripts) await page.addInitScript(s.fn, s.arg);
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|ERR_CERT|fonts\.g/.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
  page.on('console', (m) => { if (m.type() === 'warning' && /\[mount\]/.test(m.text())) errs.push('WARN ' + m.text().slice(0, 300)); });
  try {
    await page.goto(`http://localhost:${port}/${url}`, { timeout: 60000 });
    await page.waitForFunction(() => !!window.__game?.world?.player, null, { timeout: 60000 });
    await page.evaluate(installHelpers);
    await page.evaluate(() => { const T = window.__T; T.step(2 / 60); T.hook(); });
    const out = await fn(page, ctx);
    return { out, errs, page, ctx };
  } catch (e) {
    return { out: null, errs: [...errs, 'HARNESS ' + (e?.stack ?? e)], page, ctx };
  }
}
const want = (name, tags) => {
  if (CASES_ONLY && !CASES_ONLY.includes(name)) return false;
  if (ONLY) return ONLY.includes(name) || tags.some((t) => ONLY.includes(t));
  return !tags.includes('p2');
};
async function run(name, tags, url, fn, o = {}) {
  if (!want(name, tags)) return;
  const t0 = Date.now();
  const { out, errs, page, ctx } = await withPage(url, fn, o);
  if (SHOTS) { try { await page.evaluate(() => { window.__game.render(); }); await page.screenshot({ path: `${SHOT_DIR}/test_${name}.png` }); } catch { /* 무시 */ } }
  await ctx.close();
  const checks = out?.checks ?? [];
  const failed = checks.filter((c) => !c[1]);
  const ok = !!out && !failed.length && !errs.length;
  results.push({ name, ok, failed, errs, info: out?.info });
  console.log(`${ok ? '✓' : '✗'} ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)${VERBOSE && out?.info ? ' ' + JSON.stringify(out.info) : ''}`);
  for (const c of failed) console.log(`    FAIL ${c[0]}${c[2] !== undefined ? ' — ' + (typeof c[2] === 'string' ? c[2] : JSON.stringify(c[2])) : ''}`);
  for (const e of errs.slice(0, 8)) console.log('    ' + e);
  if (VERBOSE) for (const c of checks.filter((c) => c[1])) console.log(`    ok   ${c[0]}${c[2] !== undefined ? ' — ' + JSON.stringify(c[2]) : ''}`);
}
const STAGE = (s, q = '') => `index.html?scene=stage&stage=${s}${q}`;

// ═════════════ 정적 ═════════════
if (want('static', ['static'])) {
  const checks = staticChecks();
  const failed = checks.filter((c) => !c[1]);
  results.push({ name: 'static', ok: !failed.length, failed, errs: [] });
  console.log(`${failed.length ? '✗' : '✓'} static`);
  for (const c of failed) console.log(`    FAIL ${c[0]} — ${JSON.stringify(c[2])}`);
  if (VERBOSE) for (const c of checks) console.log(`    ${c[1] ? 'ok  ' : 'FAIL'} ${c[0]} — ${JSON.stringify(c[2])}`);
}

// ═════════════ 그림메인: 소환·질주·돌진·특수기·피해·낙마·재소환 (companions §14 C2) ═════════════
await run('core', ['mt_warhorse'], STAGE('s01', '&cmp=all&cmplv=10&mount=mt_warhorse&ride=1'), (page) => page.evaluate(() => {
  const T = window.__T, checks = [], info = {};
  T.toasts.length = 0; T.events.length = 0;
  const w = T.restart('s01'), p = T.p;
  const ch = p.ch.size;
  // 1) ?ride=1 → 0.6초 안에 탑승 (새 월드의 시간 0 부터)
  let tRide = null;
  T.step(1.2, () => { if (p.mount?.riding && tRide === null) tRide = w.time; return false; });
  const m = p.mount;
  info.tRide = tRide;
  checks.push(['0.6초 안에 탑승', tRide !== null && tRide <= 0.6 + 1e-6, tRide]);
  checks.push(['탑승 몸 60×90', p.w === 60 && p.h === 90, [p.w, p.h]]);
  checks.push(['mounted 이벤트', T.events.some((e) => e.ev === 'mounted' && e.id === 'mt_warhorse')]);
  checks.push(['첫 탑승 안내', T.toasts.some((s) => s.includes('그림메인에 올라탔다'))]);
  T.clearFoes(); T.step(0.3); T.setHome();
  // 2) 오른쪽 1.5초 → |vx| ≥ 390, 질주
  T.reset(m);
  T.key('ArrowRight', true);
  let gallopAt = null;
  T.step(1.5, () => { if (m.galloping && gallopAt === null) gallopAt = w.time; return false; });
  info.vx = Math.round(p.vx); info.anim = m.anim;
  checks.push(['1.5초 뒤 |vx| ≥ 390', Math.abs(p.vx) >= 390, p.vx]);
  checks.push(['질주 (anim run)', m.galloping && m.anim === 'run', m.anim]);
  // 3) 방향 전환 → turn
  T.key('ArrowRight', false); T.key('ArrowLeft', true);
  let turned = false;
  T.step(0.3, () => { if (m.anim === 'turn' || m.turnT > 0) turned = true; return false; });
  T.key('ArrowLeft', false);
  checks.push(['빠르게 달리다 돌아서면 turn', turned]);
  T.step(0.8);
  // 4) 돌진 → 앞의 좀비가 맞고 뜬다
  //   갓 생긴 좀비는 땅에서 솟는 중(state 'rise', 0.9초)이고, 이 연출 상태는 설계상 띄우지 않고 밀기만 한다 (enemy.js SCRIPTED_STATES).
  //   예전에는 솟는 중에 들이받아, 벽에 몰린 좀비가 '벽 바운드'로 뜰 때만 우연히 통과했다 (치명타로 그 자리에서 죽거나 정예라 벽 바운드가 안 나면 실패 ≈ 15%).
  //   → 솟기 시계를 넘겨 다음 틱에 AI 가 스스로 일어서게(walk) 한 뒤 들이받는다 (기다리는 동안 동료가 먼저 치지 않게 한 틱만). 정예 굴림도 끈다.
  T.reset(m); T.clearFoes();
  p.facing = 1;
  const z = T.spawn('zombie', 110, { elite: false });
  z.stateT = 99; T.step(1 / 60);
  checks.push(['(준비) 좀비가 다 솟아 섰다', z.state !== 'rise' && !z.scripted(), z.state]);
  // 돌진 타격 자체의 반응을 기록한다 (벽 바운드·동료 협공이 띄운 것과 구별)
  let chargeReact = null;
  const zHit = z.takeHit;
  z.takeHit = function (dmg, atk, ww, inf) { const r = zHit.call(this, dmg, atk, ww, inf); if (!chargeReact && atk?.tags?.includes('charge')) chargeReact = { vy: Math.round(this.vy), jugg: this.jugg, killed: this.hp <= 0 }; return r; };
  const hp0 = z.hp;
  T.press('KeyC', 0.05);
  let launched = false, chargeSeen = false;
  T.step(0.5, () => { if (m.chargeT > 0) chargeSeen = true; if (z.vy < -100 || z.airborne || z.launched) launched = true; return false; });
  info.charge = { hp0, hp: z.hp, dead: z.dead, react: chargeReact };
  checks.push(['돌진 시작 (chargeT)', chargeSeen]);
  checks.push(['돌진에 좀비가 맞았다', z.dead || z.hp < hp0, info.charge]);
  checks.push(['돌진에 좀비가 떴다 (돌진 타격으로)', launched && !!chargeReact && chargeReact.vy < -100 && chargeReact.jugg, info.charge]);
  checks.push(['돌진 재사용 대기', m.chargeCd >= 0 && m.chargeCd <= 0.8]);
  // 5) ↓+X → 앞발 강타: 재사용 대기 · 반경 180 안의 적
  T.reset(m); T.clearFoes(); T.step(0.2);
  const z1 = T.spawn('zombie', 150), z2 = T.spawn('zombie', -140);
  const a1 = z1.hp, a2 = z2.hp;
  T.key('ArrowDown', true); T.press('KeyX', 0.05); T.key('ArrowDown', false);
  const cdAfter = m.specialCd;
  T.step(0.7);
  info.special = { cd: cdAfter, h1: [a1, z1.hp], h2: [a2, z2.hp] };
  checks.push(['특수기 재사용 대기가 걸렸다', cdAfter > 3, cdAfter]);
  checks.push(['특수기 이름 표시', T.texts.includes('앞발 강타')]);
  checks.push(['앞발 강타가 양옆 적을 쳤다', (z1.dead || z1.hp < a1) && (z2.dead || z2.hp < a2), info.special]);
  // 6) 가벼운 피격: 탈것이 흡수, 경직 없음, 기수는 피해의 30% 이하
  T.reset(m); T.clearFoes(); T.step(0.3);
  const hz = T.spawn('zombie', 300);
  let mh = m.hp, rh = p.hp;
  const light = 10;
  p.takeHit(light, { team: 'enemy', owner: hz, dir: 1, kb: [120, -120] }, w, {});
  info.light = { mount: mh - m.hp, rider: rh - p.hp, hurtT: p.hurtT };
  checks.push(['가벼운 피격: 탈것 HP 감소', m.hp < mh, info.light]);
  checks.push(['가벼운 피격: 기수 피해 ≤ 30%', rh - p.hp <= Math.ceil(light * 0.3), info.light]);
  checks.push(['가벼운 피격: 경직 없음', p.hurtT === 0 && p.riding !== false && m.riding]);
  // 7) 강타: 짧은 경직(0.2)
  T.reset(m);
  mh = m.hp;
  p.takeHit(Math.ceil(m.maxHp * 0.5), { team: 'enemy', owner: hz, dir: 1, kb: [460, -300] }, w, {});
  info.heavy = { hurtT: p.hurtT, mount: mh - m.hp, iframes: p.iframes };
  checks.push(['강타: 짧은 경직 0.2', Math.abs(p.hurtT - 0.2) < 1e-6 && m.riding, info.heavy]);
  // 8) 탈것 HP 1 → 피격 → 낙마 (recall), 몸 원래 크기, 달아나는 탈것
  T.step(1.2);
  T.reset(m); m.hp = 1;
  p.takeHit(20, { team: 'enemy', owner: hz, dir: 1, kb: [120, -120] }, w, {});
  const ghosts = w.entities.filter((e) => e.constructor?.name === 'MountGhost' && e.mode === 'knocked').length;
  info.knock = { state: m.state, cd: m.cd, w: p.w, h: p.h, ghosts };
  checks.push(['낙마 → recall', m.state === 'recall' && !m.riding, info.knock]);
  checks.push(['낙마 → 기수 몸 크기', p.w === ch.w && p.h === ch.h, [p.w, p.h]]);
  checks.push(['낙마 → 달아나는 MountGhost', ghosts === 1]);
  checks.push(['낙마 안내 (재소환 N초)', T.toasts.some((s) => /그림메인이 쓰러졌다! \(재소환 \d+초\)/.test(s))]);
  // recall 중 R → 거절 안내
  T.step(1.3);
  T.press('KeyR', 0.05);
  checks.push(['recall 중 소환 거절 (돌아오지 않았다)', !m.riding && T.toasts.some((s) => s.includes('아직 돌아오지 않았다'))]);
  // 9) 대기가 끝나면 R 로 다시 탄다
  m.cd = 0.01; T.step(0.1);
  checks.push(['recall 끝 → stowed', m.state === 'stowed', m.state]);
  p.iframes = 0; T.step(0.3);
  T.press('KeyR', 0.05);
  T.step(0.6);
  checks.push(['R → 다시 탑승', m.riding && p.w === 60, m.state]);
  // 10) R 두 번: 하차(0.3초) → stowed 2초 대기 → 대기 중 R 거절 → 뒤에 R 로 탑승
  T.press('KeyR', 0.05);
  const afterDis = { state: m.state, w: p.w, vy: p.vy };
  T.step(0.4);
  checks.push(['R → 하차 (dismounting → stowed)', afterDis.state === 'dismounting' && m.state === 'stowed' && p.w === ch.w, afterDis]);
  checks.push(['하차 재소환 대기 2초', m.cd > 1.2 && m.cd <= 2, m.cd]);
  T.press('KeyR', 0.05); T.step(0.1);
  checks.push(['대기 중 R → 안 탄다', !m.riding]);
  T.step(2.0);
  T.press('KeyR', 0.05); T.step(0.6);
  checks.push(['대기 뒤 R → 탑승', m.riding]);
  // 11) R16: 히트스톱 동안 누른 R 도 놓치지 않는다 (buffered)
  T.press('KeyR', 0.05); T.step(2.5);   // 내림 + 대기 끝
  checks.push(['(준비) 내림', !m.riding && m.cd <= 0, [m.state, m.cd]]);
  p.iframes = 0; T.step(0.2);
  w.hitstop = 0.15;
  T.tap('KeyR');
  T.step(0.6);
  checks.push(['히트스톱 중 누른 R 로 탑승', m.riding]);
  // 12) 기수 모습·판정 보정
  const v = m.riderView(p), L = m.riderLift(), hb = p.hurtbox();
  info.view = { sx: Math.round(v.ride?.sx - p.cx), sy: Math.round(v.ride?.sy - p.bottom), lift: [L.dx, L.dy], hb: [hb.y - p.bottom, hb.h] };
  checks.push(['riderView.ride 안장점', !!v.ride && Math.abs(v.ride.sx - p.cx) < 16 && v.ride.sy < p.bottom - 40 && v.ride.sy > p.bottom - 70, info.view]);
  checks.push(['riderView 가 플레이어 필드를 비춘다', v.look === p.look && v.ch === p.ch && v.rig === p.rig && v.facing === p.facing && typeof v.atkSpeedMul === 'number']);
  checks.push(['riderLift ≈ (-4, -15)', Math.abs(L.dx + 4) < 3 && Math.abs(L.dy + 15) < 8, [L.dx, L.dy]]);
  checks.push(['피격 판정 = 탈것 몸 ∪ 기수 몸통', hb.y < p.y && hb.y + hb.h >= p.bottom - 1 && hb.w >= p.w - 8, hb]);
  // 13) 기수 동작 보정 (adaptMove)
  const mv = { id: 'x', anim: 'slash', lunge: 300, vy: -500, vx: 200, pogo: 400, airStall: 0.5, recoil: 50, recoilY: -60, groundPound: 80, hit: [0.1, 0.2], dur: 0.3 };
  const am = m.adaptMove(mv);
  checks.push(['adaptMove: 돌진·체공·반동 제거, canMove', am !== mv && am.canMove === true && !('lunge' in am) && !('vy' in am) && !('vx' in am) && !('pogo' in am) && !('airStall' in am) && !('recoil' in am) && !('recoilY' in am) && !('groundPound' in am) && am.anim === 'slash']);
  checks.push(['adaptMove 캐시', m.adaptMove(mv) === am]);
  // 14) 탑승 공격: 탈것이 멈추지 않는다 (70% 속도)
  T.clearFoes(); T.goHome();
  T.key('ArrowRight', true); T.step(0.6);
  T.press('KeyX', 0.05);
  const vxAtk = p.vx, moving = !!p.move;
  T.step(0.4); T.key('ArrowRight', false); T.step(0.5);
  checks.push(['공격 중에도 달린다 (≥ 60% 속도)', Math.abs(vxAtk) >= m.baseSpeed(p) * 0.6, { vxAtk, moving }]);
  // 15) 착지 충격: 높은 곳에서 떨어져 발밑 적을 튕긴다
  T.clearFoes(); T.step(0.3);
  const lz = T.spawn('zombie', 30);
  const lh = lz.hp;
  p.y -= 260; p.vy = 0; p.onGround = false;
  let landed = false;
  T.step(1.0, () => { if (p.onGround) landed = true; return landed; });
  T.step(0.2);
  checks.push(['높이 떨어지면 착지 충격 (발밑 적 피해)', landed && (lz.dead || lz.hp < lh), { lh, h: lz.hp }]);
  // 16) 2부 레지스트리 (MOUNT_B) 를 읽는다: 등록된 특수기가 기본 특수기를 대신한다
  T.reset(m); T.clearFoes(); T.step(0.2);
  let called = 0;
  T.MB.MOUNT_B.mt_warhorse = { special: (r, ww, pp) => { called++; r.specialCd = 1.23; return true; }, passive: { tick() { called += 0.001; } } };
  T.key('ArrowDown', true); T.press('KeyX', 0.05); T.key('ArrowDown', false);
  T.step(0.1);
  delete T.MB.MOUNT_B.mt_warhorse;
  checks.push(['MOUNT_B.special 이 불린다', called >= 1 && Math.abs(m.specialCd - 1.23) < 0.2, { called, cd: m.specialCd }]);
  checks.push(['MOUNT_B.passive.tick 이 불린다', called % 1 > 0]);
  // 17) 구덩이 추락 → recall + 안전 지점 (박히지 않음)
  T.reset(m); T.step(0.5);
  checks.push(['(준비) 탑승 중', m.riding]);
  p.y = w.map.pxH + 80; p.vy = 400;
  T.step(0.2);
  info.fall = { state: m.state, y: Math.round(p.y), pxH: w.map.pxH, w: p.w };
  checks.push(['구덩이 → recall', m.state === 'recall' && !m.riding, info.fall]);
  checks.push(['구덩이 → 안전 지점 (맵 안, 박히지 않음)', p.y < w.map.pxH && T.fitsNow(), info.fall]);
  // 18) 스테이지 돌아오는 동안 탈것 HP 회복 3%/초
  const hpR = m.hp;
  T.step(1.0);
  checks.push(['타지 않을 때 HP 회복 (3%/초)', m.hp > hpR && Math.abs((m.hp - hpR) - m.maxHp * 0.03) < m.maxHp * 0.01, [hpR, m.hp, m.maxHp]]);
  // 19) 음식·세이브 회복
  m.hp = 10; w.healPlayer(0.25);
  checks.push(['healPlayer → 탈것도 회복', m.hp > 10 + m.maxHp * 0.2, m.hp]);
  return { checks, info };
}));

// ═════════════ 필살기 · 방 이동 · 보스 금지 · 순간이동 스킬 ═════════════
await run('ult_rooms', ['mt_warhorse'], STAGE('s01', '&cmp=all&cmplv=10&mount=mt_warhorse&ride=1'), (page) => page.evaluate(async () => {
  const T = window.__T, w = T.w, p = T.p, checks = [], info = {};
  T.step(0.8);
  const m = p.mount;
  checks.push(['(준비) 탑승', !!m?.riding]);
  T.clearFoes();
  // 1) 필살기 → 내림 (ult) → 연출이 끝나고 2초 안에 다시 탄다
  w.run.sp = 100; p.iframes = 0;
  T.press('KeyF', 0.05);
  let sawUlt = false, calmAt = null, backAt = null, t0 = w.time;
  for (let i = 0; i < 60 * 12; i++) {
    T.g.tick(1 / 60);
    while (T.g.top?.name === 'dialogue') T.g.pop();
    if (m.state === 'ult') sawUlt = true;
    const calm = T.g.top?.name === 'stage' && !w.cutscene && !w.hudHidden && !w.freezeEnemies && !p.hidden;
    if (sawUlt && calm && calmAt === null) calmAt = w.time;
    if (!calm) calmAt = null;
    if (sawUlt && m.riding) { backAt = w.time; break; }
  }
  info.ult = { sawUlt, calmAt, backAt, t0, remount: backAt !== null && calmAt !== null ? +(backAt - calmAt).toFixed(2) : null };
  checks.push(['필살기 시전 → 내림 (ult)', sawUlt, info.ult]);
  checks.push(['연출 뒤 2초 안에 자동 재탑승', backAt !== null && calmAt !== null && backAt - calmAt <= 2.0 + 1e-6, info.ult]);
  checks.push(['필살기 이벤트', T.events.some((e) => e.ev === 'ultimateCast')]);
  // 2) 순간이동 스킬 (DISMOUNT_SKILLS) → 내림 뒤 자동 재탑승 대기
  T.step(0.5);
  m.beforeCast(w, p, 'lia_shadow_step');
  checks.push(['DISMOUNT_SKILLS 스킬 → 내림 (ult 대기)', !m.riding && m.state === 'ult' && Math.abs(m.remountT - 1.2) < 1e-6, [m.state, m.remountT]]);
  T.step(2.2);
  checks.push(['스킬 뒤 자동 재탑승', m.riding]);
  m.beforeCast(w, p, 'kael_vigilia');
  checks.push(['일반 스킬은 내리지 않는다', m.riding]);
  // 3) 방 이동: 모든 방에서 박히지 않는다 (맞는 자리가 없으면 내린다)
  const rooms = Object.keys(w.stage.rooms).filter((r) => r !== 'boss');
  const roomInfo = [];
  for (const r of rooms) {
    if (!m.riding) { m.cd = 0; m.state = 'stowed'; m.summon(w, p, { force: true, instant: true }); }
    w.gotoRoom(r);
    T.step(0.6);
    roomInfo.push({ r, riding: m.riding, fits: T.fitsNow(), w: p.w });
  }
  info.rooms = roomInfo;
  checks.push(['방 이동 뒤 박히지 않음 (모든 방)', roomInfo.every((x) => x.fits), roomInfo]);
  checks.push(['방 이동 뒤에도 탄 채로 (자리가 있으면)', roomInfo.some((x) => x.riding)]);
  // 4) noMount 보스: 내리고 소환 거절
  if (!m.riding) { m.cd = 0; m.state = 'stowed'; m.summon(w, p, { force: true, instant: true }); T.step(0.1); }
  w.companions.onBossStart({ def: { id: 'test', noMount: true } });
  T.step(0.5);
  checks.push(['noMount 보스 → 내림', !m.riding && T.toasts.some((s) => s.includes('겁에 질려 물러섰다')), m.state]);
  m.cd = 0; T.step(0.1);
  T.press('KeyR', 0.05); T.step(0.6);
  checks.push(['noMount 보스전 중 소환 거절', !m.riding && T.toasts.some((s) => s.includes('이 싸움에는 탈것이 겁을 먹었다'))]);
  w.companions.onBossDefeated({ def: { id: 'test' }, stats: { exp: 0 } });
  T.step(0.2);
  T.press('KeyR', 0.05); T.step(0.6);
  checks.push(['보스가 쓰러지면 다시 탈 수 있다', m.riding]);
  // 5) 죽음 → stowed (대기 0), 부활 → HP 가득
  m.hp = 5;
  p.die(w);
  checks.push(['죽음 → 내림 (stowed, 대기 0)', !m.riding && m.state === 'stowed' && m.cd === 0 && p.w === p.ch.size.w]);
  T.step(2.6);
  T.step(1.0);
  checks.push(['부활 → 탈것 HP 가득', m.hp === m.maxHp && !p.dead, [m.hp, m.maxHp, p.dead]]);
  // 6) 편성 해제 → 떼기
  if (!m.riding) { m.cd = 0; m.summon(w, p, { force: true, instant: true }); T.step(0.1); }
  T.CS.equipMount(w.state, null, null); w.companions.sync(true); T.step(0.2);
  checks.push(['편성 해제 → 내리고 떼어진다', !p.mount && p.w === p.ch.size.w]);
  return { checks, info };
}));

// ═════════════ 날개: 스칼렛 활공 · 급강하 · 화염 숨결, 녹티스 비행 · 천장 · 초음파 ═════════════
await run('flyers', ['mt_wyvern', 'mt_giantbat'], STAGE('s01', '&cmp=all&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, checks = [], info = {};
  T.step(0.5); T.clearFoes();
  checks.push(['(준비) 방에 위로 나가는 출구 없음', !w.room.exitUp, w.roomId]);
  // 스칼렛: 날갯짓 세 번 → 네 번째는 없음 → 활공 (vy ≤ 150)
  let m = T.ride('mt_wyvern'); T.reset(m); T.step(0.3);
  checks.push(['스칼렛 탑승', m.riding && p.w === 66, [p.w, p.h]]);
  T.key('KeyZ', true); T.step(0.05); T.key('KeyZ', false); T.step(0.35);
  const flapsVy = [];
  for (let i = 0; i < 4; i++) { T.key('KeyZ', true); T.step(1 / 60); flapsVy.push(Math.round(p.vy)); T.key('KeyZ', false); T.step(0.2); }
  info.flaps = flapsVy;
  checks.push(['날갯짓 세 번 (vy = flapVy)', flapsVy.slice(0, 3).every((v) => v <= -500), flapsVy]);
  checks.push(['네 번째 누름은 날갯짓 아님', flapsVy[3] > -500, flapsVy]);
  T.key('KeyZ', true);
  let maxVy = -1e9;
  T.step(0.8, () => { if (!p.onGround) maxVy = Math.max(maxVy, p.vy); return p.onGround; });
  T.key('KeyZ', false);
  info.glideVy = Math.round(maxVy);
  checks.push(['점프를 누른 채 내려오면 활공 (vy ≤ 150)', maxVy <= 150 + 1, maxVy]);
  T.step(1.2, () => p.onGround);
  // 공중 돌진 = 급강하 → 착지 충격파
  T.reset(m); T.step(0.2);
  const dz = T.spawn('zombie', 120);   // 땅에서 먼저 일어서게 둔다
  T.step(1.2);
  const dh = dz.hp;
  T.key('KeyZ', true); T.step(0.2); T.key('KeyZ', false);
  T.press('KeyC', 0.05);
  const kind = m.chargeKind;
  T.step(1.0, () => p.onGround);
  T.step(0.1);
  checks.push(['공중 돌진 = 급강하', kind === 'dive', kind]);
  checks.push(['급강하 착지 충격파', dz.dead || dz.hp < dh, [dh, dz.hp]]);
  // 화염 숨결: 1초, 공중에서도, 낙하 ≤ 60
  T.reset(m); T.clearFoes(); T.step(0.3);
  const bz = T.spawn('zombie', 110), bh = bz.hp;
  T.key('KeyZ', true); T.step(0.25); T.key('KeyZ', false);
  T.step(0.2);
  T.key('ArrowDown', true); T.press('KeyX', 0.05); T.key('ArrowDown', false);
  const breathing = m.act?.name === 'breath';
  let vyMaxBreath = -1e9;
  T.step(0.6, () => { if (!p.onGround && m.act?.name === 'breath') vyMaxBreath = Math.max(vyMaxBreath, p.vy); return false; });
  T.step(1.0);
  checks.push(['공중 화염 숨결', breathing]);
  checks.push(['숨결 중 낙하 ≤ 60', vyMaxBreath <= 61, vyMaxBreath]);
  checks.push(['숨결이 적을 여러 번 친다', bz.dead || bh - bz.hp > 0, [bh, bz.hp]]);
  // 녹티스: 비행 — 점프를 누르고 있으면 오르며 기력이 준다, 기력 0 이면 떠서 내려오기만, 화면 위로 못 나간다
  T.step(0.5, () => p.onGround);
  m.dismount(w, p, 'unequip'); T.step(0.4);
  m = T.ride('mt_giantbat'); T.reset(m); T.step(0.3);
  checks.push(['녹티스 탑승', m.riding && p.w === 70]);
  const st0 = m.stamina;
  T.key('KeyZ', true);
  let minY = 1e9, stMin = st0;
  T.step(4.0, () => { minY = Math.min(minY, p.y); stMin = Math.min(stMin, m.stamina); return false; });
  const vyHold = p.vy;
  T.key('KeyZ', false);
  info.bat = { st0, stMin, minY: Math.round(minY), vyHold };
  checks.push(['상승하면 기력이 준다', stMin < st0 - 0.5, info.bat]);
  checks.push(['화면 위로 나가지 않는다 (y ≥ 4)', minY >= 4 - 0.01, info.bat]);
  checks.push(['기력 0 → 더 오르지 못한다', stMin <= 0.001 && vyHold >= -1, info.bat]);
  let maxFall = -1e9;
  T.step(0.6, () => { if (!p.onGround) maxFall = Math.max(maxFall, p.vy); return p.onGround; });
  checks.push(['점프를 놓으면 천천히 내려온다 (≤ 110)', maxFall <= 111, maxFall]);
  T.step(5, () => p.onGround);
  T.step(1.0);
  checks.push(['땅에서 기력 회복', m.stamina > 0.5, m.stamina]);
  // ↓+점프 = 급강하
  T.key('KeyZ', true); T.step(0.5); T.key('KeyZ', false); T.step(0.1);
  T.key('ArrowDown', true); T.press('KeyZ', 0.05);
  const dive = m.diving, vyD = p.vy;
  T.key('ArrowDown', false);
  checks.push(['↓+점프 = 급강하', dive && vyD >= 600, [dive, vyD]]);
  T.step(2, () => p.onGround);
  // 8방향 흡혈 급습: 위로
  T.reset(m); T.clearFoes(); T.step(0.2);
  T.key('ArrowUp', true); T.key('ArrowRight', true); T.press('KeyC', 0.05); T.key('ArrowUp', false); T.key('ArrowRight', false);
  const d8 = { ...m.chargeDir }, k8 = m.chargeKind;
  T.step(0.1);
  checks.push(['8방향 급습 (↗)', k8 === 'dir8' && d8.x > 0.5 && d8.y < -0.5, d8]);
  T.step(2, () => p.onGround);
  // 초음파: 비밀 드러내기 효과 + 재사용 대기
  T.reset(m); T.step(0.2);
  T.key('ArrowDown', true); T.press('KeyX', 0.05); T.key('ArrowDown', false);
  checks.push(['초음파 재사용 대기', m.specialCd > 5, m.specialCd]);
  checks.push(['초음파 → 비밀 보기 효과', w.entities.some((e) => e.constructor?.name === 'SecretSight')]);
  return { checks, info };
}));

// ═════════════ 땅의 탈것: 바르그 · 코슈타 · 스콜 (특수기, 가시, 2단 점프, 벽 차기) ═════════════
await run('ground', ['mt_boar', 'mt_skelsteed', 'mt_direwolf'], STAGE('s01', '&cmp=all&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, checks = [], info = {};
  T.step(0.5); T.clearFoes();
  const home = { x: p.cx, b: p.bottom };
  const goHome = () => { p.cx = home.x; p.bottom = home.b; p.vx = 0; p.vy = 0; T.step(0.3); };
  // 가시 칸 (위가 비어 있는 ^)
  // 탈것 몸이 넓어 한 칸짜리 가시 구덩이는 건너 딛는다 → 세 칸 이상 이어진 가시 줄을 고른다
  const spike = T.findTile((tx, ty, m) => [-1, 0, 1].every((d) => m.typeAt(tx + d, ty) === T.PH.T.SPIKE && T.PH.isSolidType(m.typeAt(tx + d, ty + 1))) && m.typeAt(tx, ty - 1) === T.PH.T.EMPTY && m.typeAt(tx, ty - 2) === T.PH.T.EMPTY && m.typeAt(tx + 1, ty - 1) === T.PH.T.EMPTY && m.typeAt(tx - 1, ty - 1) === T.PH.T.EMPTY);
  info.spike = spike;
  const onSpike = (m) => {
    T.reset(m); p.iframes = 0;
    const mh = m.hp, rh = p.hp;
    T.place(spike.tx, spike.ty + 1); p.y -= 6;
    T.step(0.1);
    return { mount: +(mh - m.hp).toFixed(1), rider: +(rh - p.hp).toFixed(1), vy: p.vy, max: m.maxHp };
  };
  // 바르그: 몸 64×80, 땅 파헤치기 (바위 셋), 가시 절반, 돌진 중 슈퍼아머
  let m = T.ride('mt_boar'); T.reset(m); T.step(0.3);
  checks.push(['바르그 몸 64×80', p.w === 64 && p.h === 80]);
  T.key('ArrowDown', true); T.press('KeyX', 0.05); T.key('ArrowDown', false);
  T.step(0.35);
  const rocks = w.entities.filter((e) => e.kind === 'projectile' && e.attack?.tags?.includes('mount')).length;
  checks.push(['땅 파헤치기: 바위 세 덩이', rocks === 3, rocks]);
  T.step(2.0);
  T.reset(m);
  m.charge(w, p, 1, 0); T.step(2 / 60);
  const hzA = T.spawn('zombie', 400);
  p.iframes = 0; m.invulnT = 0;
  p.takeHit(Math.ceil(m.maxHp * 0.6), { team: 'enemy', owner: hzA, dir: -1, kb: [600, -300] }, w, {});
  checks.push(['돌진 중 슈퍼아머 (강타에도 경직 없음)', p.hurtT === 0 && m.chargeT > 0, [p.hurtT, m.chargeT]]);
  T.step(1.0); T.clearFoes();
  if (spike) {
    goHome();
    const r = onSpike(m);
    info.boarSpike = r;
    checks.push(['바르그 가시: 탈것만 (15% × 0.5)', r.rider <= 0 && Math.abs(r.mount - Math.round(r.max * 0.075)) <= 1.01, r]);
  }
  goHome();
  m.dismount(w, p, 'unequip'); T.step(0.4);
  // 코슈타: 2단 점프 (유령 도약), 망령 질주 (완전 무적 + 불꽃 자국), 저승 사슬, 가시 면역
  m = T.ride('mt_skelsteed'); T.reset(m); T.step(0.3);
  T.key('KeyZ', true); T.step(0.05); T.key('KeyZ', false); T.step(0.3);
  const vyBefore = p.vy;
  T.key('KeyZ', true); T.step(1 / 60); const vyAfter = p.vy; T.key('KeyZ', false);
  checks.push(['코슈타 2단 점프', vyAfter < -500 && vyBefore > vyAfter, [vyBefore, vyAfter]]);
  checks.push(['유령 도약 이름', T.texts.includes('유령 도약')]);
  T.step(1.5, () => p.onGround); T.step(0.2);
  T.reset(m);
  m.charge(w, p, 1, 0); T.step(0.25);
  const trails = w.entities.filter((e) => e.kind === 'hitbox' && e.attack?.tags?.includes('trail')).length;
  checks.push(['망령 질주: 무적 + 불꽃 자국', trails >= 2 && p.invuln, trails]);
  T.step(0.6);
  goHome(); T.reset(m); T.step(0.2);
  T.key('ArrowDown', true); T.press('KeyX', 0.05); T.key('ArrowDown', false);
  T.step(0.3);
  const pillars = w.entities.filter((e) => e.kind === 'hitbox' && e.attack?.tags?.includes('special')).length;
  checks.push(['저승 사슬: 기둥 셋', pillars === 3, pillars]);
  T.step(1.0);
  if (spike) {
    goHome();
    const r = onSpike(m);
    info.skelSpike = r;
    checks.push(['코슈타 가시 면역', r.mount === 0 && r.rider <= 0, r]);
  }
  goHome();
  m.dismount(w, p, 'unequip'); T.step(0.4);
  // 스콜: 가장 빠른 발 (480), 2단 점프, 벽 차기, 서리 포효 (공격 속도 +15% 5초)
  m = T.ride('mt_direwolf'); T.reset(m); T.step(0.3);
  checks.push(['스콜 앉는 자세 kneel', m.riderView(p).ride.legs === 'kneel']);
  const spd0 = p.stats.atkSpd ?? 0;
  T.key('ArrowDown', true); T.press('KeyX', 0.05); T.key('ArrowDown', false);
  const spd1 = p.stats.atkSpd ?? 0;
  checks.push(['서리 포효 → 공격 속도 +15', Math.abs(spd1 - spd0 - 15) < 0.01, [spd0, spd1]]);
  T.step(5.3);
  checks.push(['5초 뒤 공격 속도 원래대로', Math.abs((p.stats.atkSpd ?? 0) - spd0) < 0.01, p.stats.atkSpd]);
  // 벽 차기: 오른쪽 벽 옆 공중에서 벽 쪽으로 누르다 점프
  const wall = T.findTile((tx, ty, mp) => {
    const S = (x, y) => T.PH.isSolidType(mp.typeAt(x, y));
    return S(tx, ty) && S(tx, ty - 1) && S(tx, ty - 2) && !S(tx - 1, ty) && !S(tx - 1, ty - 1) && !S(tx - 1, ty - 2) && !S(tx - 2, ty) && !S(tx - 2, ty - 1) && !S(tx - 2, ty - 2) && !S(tx - 1, ty + 1) && !S(tx - 2, ty + 1);
  });
  info.wall = wall;
  if (wall) {
    T.reset(m);
    p.x = wall.tx * 48 - p.w - 2; p.bottom = (wall.ty + 1) * 48 - 4; p.vx = 0; p.vy = 0; p.onGround = false;
    T.key('ArrowRight', true); T.step(3 / 60);
    const hit = p.hitWallDir;
    p.coyote = 0;   // 막 공중에 놓았으니 코요테 시간은 없다
    T.key('KeyZ', true); T.step(1 / 60); T.key('KeyZ', false);
    const kick = { vx: p.vx, vy: p.vy, facing: p.facing, hit };
    T.key('ArrowRight', false);
    info.kick = kick;
    checks.push(['벽 차기 (반대로 튀어 오른다)', kick.vx < -200 && kick.vy < -400 && kick.facing === -1, kick]);
    T.step(1.5, () => p.onGround);
  }
  return { checks, info };
}));

// ═════════════ 물 (s08): 헤엄 속도 ≤ 0.6× · 언제든 차오르기 ═════════════
await run('water', ['mt_warhorse'], STAGE('s08', '&cmp=all&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, checks = [], info = {};
  T.step(0.5); T.clearFoes();
  const m = T.ride('mt_warhorse'); T.reset(m); T.step(0.3);
  // 액체 칸 3줄 깊이 · 폭 5칸 이상인 웅덩이 바닥
  const pool = T.findTile((tx, ty, mp) => {
    const L = (x, y) => mp.typeAt(x, y) === T.PH.T.LIQUID;
    for (let dx = -2; dx <= 2; dx++) { if (!L(tx + dx, ty) || !L(tx + dx, ty - 1)) return false; if (!T.PH.isSolidType(mp.typeAt(tx + dx, ty + 1))) return false; }
    return true;
  });
  info.pool = pool;
  checks.push(['(준비) 물웅덩이', !!pool]);
  if (pool) {
    T.place(pool.tx, pool.ty + 1);
    T.step(0.5);
    const base = m.baseSpeed(p);
    T.key('ArrowRight', true);
    let maxVx = 0;
    T.step(0.6, () => { maxVx = Math.max(maxVx, Math.abs(p.vx)); return false; });
    T.key('ArrowRight', false);
    info.swim = { maxVx: Math.round(maxVx), base: Math.round(base), wet: m.inWater, anim: m.anim };
    checks.push(['물속 속도 ≤ 0.6×', maxVx <= base * 0.6 + 1, info.swim]);
    checks.push(['헤엄 애니메이션', m.anim === 'swim', m.anim]);
    T.place(pool.tx, pool.ty + 1); T.step(0.4);
    T.key('KeyZ', true); T.step(1 / 60); const vy1 = p.vy; T.key('KeyZ', false); T.step(0.1);
    T.key('KeyZ', true); T.step(1 / 60); const vy2 = p.vy; T.key('KeyZ', false);
    checks.push(['물속 점프 (vy = -520)', vy1 <= -480, vy1]);
    checks.push(['물속에서는 언제든 다시 차오른다', vy2 <= -480, vy2]);
  }
  return { checks, info };
}));

// ═════════════ 액체 위험 (독 s07 · 피 s11 · 용암 s13): 탈것이 받는다, 면역·절반 ═════════════
for (const [stage, liq] of [['s07', 'poison'], ['s13', 'lava']]) {
  await run('liquid_' + liq, ['mt_skelsteed', 'mt_wyvern', 'mt_warhorse'], STAGE(stage, '&cmp=all&cmplv=10'), (page) => page.evaluate((liq) => {
    const T = window.__T, w = T.w, p = T.p, checks = [], info = {};
    T.step(0.5); T.clearFoes();
    const pool = T.findTile((tx, ty, mp) => mp.typeAt(tx, ty) === T.PH.T.LIQUID && mp.typeAt(tx, ty - 1) !== T.PH.T.LIQUID && !T.PH.isSolidType(mp.typeAt(tx, ty - 1)) && !T.PH.isSolidType(mp.typeAt(tx, ty - 2)) && !T.PH.isSolidType(mp.typeAt(tx - 1, ty - 1)) && !T.PH.isSolidType(mp.typeAt(tx + 1, ty - 1)));
    info.pool = pool; info.liquid = w.liquid;
    checks.push(['(준비) ' + liq + ' 웅덩이', !!pool && w.liquid === liq, info]);
    if (!pool) return { checks, info };
    const dip = (id) => {
      const m = T.ride(id); T.reset(m); T.step(0.2);
      const mh = m.hp, rh = p.hp;
      T.place(pool.tx, pool.ty + 1); p.vy = 100;
      T.step(0.12);
      const r = { id, mount: +(mh - m.hp).toFixed(1), rider: +(rh - p.hp).toFixed(1), max: m.maxHp, riding: m.riding };
      T.step(0.5);
      m.dismount(w, p, 'unequip'); T.step(0.3);
      const home = w.run.checkpoint; p.x = home.x; p.y = home.y; p.vx = 0; p.vy = 0; T.step(0.3);
      return r;
    };
    const horse = dip('mt_warhorse');
    checks.push(['그림메인: 탈것이 12% 받고 기수는 무사', horse.rider <= 0 && Math.abs(horse.mount - Math.round(horse.max * 0.12)) <= 1.01, horse]);
    const skel = dip('mt_skelsteed');
    if (liq === 'poison') checks.push(['코슈타 독 면역', skel.mount === 0 && skel.rider <= 0, skel]);
    else checks.push(['코슈타 용암 절반', skel.rider <= 0 && Math.abs(skel.mount - Math.round(skel.max * 0.06)) <= 1.01, skel]);
    if (liq === 'lava') { const wy = dip('mt_wyvern'); checks.push(['스칼렛 용암 면역', wy.mount === 0 && wy.rider <= 0, wy]); }
    return { checks, info };
  }, liq));
}

// ═════════════ 깊은 물 · 바람 · 부패 (world2 §14) ═════════════
await run('gimmicks', ['mt_warhorse'], STAGE('s01', '&cmp=all&cmplv=10&mount=mt_warhorse&ride=1'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, checks = [];
  T.step(0.8);
  const m = p.mount;
  checks.push(['(준비) 탑승', m.riding]);
  // 깊은 물에 들어가면 내린다
  m.hazard('deep', p, w);
  checks.push(['깊은 물 → 내림', !m.riding && m.state === 'stowed' && T.toasts.some((s) => s.includes('깊은 물에서는 탈것에서 내려'))]);
  // 물속(깊은 물)에서는 소환 거절
  const real = w.gimmickOf;
  w.gimmickOf = (k) => (k === 'deep' ? { inWater: true, headUnder: true } : real.call(w, k));
  m.cd = 0; T.step(0.1);
  T.press('KeyR', 0.05); T.step(0.6);
  checks.push(['깊은 물 속 소환 거절', !m.riding && T.toasts.some((s) => s.includes('물속에서는 탈것을 부를 수 없다'))]);
  w.gimmickOf = real;
  // 바람·부패 배율 필드 (기믹이 def 에서 읽는다)
  const M = T.p.mount;
  checks.push(['def.windMul · def.blightMul 이 있다', typeof M.def.windMul === 'number' && typeof M.def.blightMul === 'number']);
  // 유대 5단계 「영혼 결속」: 스테이지마다 한 번 쓰러질 위기를 버틴다 (HP 1, 3초 무적)
  T.CS.ownedEntry(w.state, 'mt_warhorse').bond = 200; p.refreshStats();
  M.cd = 0; M.state = 'stowed'; M.summon(w, p, { force: true, instant: true }); T.step(0.6);
  M.hp = 3; M.invulnT = 0; p.iframes = 0;
  const hz = w.spawnEnemy('zombie', p.cx + 300, p.bottom, {});
  p.takeHit(40, { team: 'enemy', owner: hz, dir: 1, kb: [100, -100] }, w, {});
  checks.push(['영혼 결속: 한 번 버틴다 (HP 1, 무적 3초)', M.riding && M.hp === 1 && M.invulnT > 2.9 && T.texts.includes('버텨라, 그림메인!'), [M.hp, M.invulnT]]);
  T.step(3.2); p.iframes = 0; M.invulnT = 0;
  p.takeHit(40, { team: 'enemy', owner: hz, dir: 1, kb: [100, -100] }, w, {});
  checks.push(['두 번째는 낙마', !M.riding && M.state === 'recall', M.state]);
  return { checks };
}));

// ═════════════ 마을: 탈 수 있지만 돌진·특수기는 없다 ═════════════
await run('town', ['mt_warhorse'], 'index.html?scene=hub&cmp=all&cmplv=10&mount=mt_warhorse&ch=5', (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, checks = [];
  T.step(1.0);
  const m = p.mount;
  checks.push(['(준비) 마을 월드', w.mode === 'town' && !!m, w.mode]);
  if (!m) return { checks };
  p.iframes = 0;
  T.press('KeyR', 0.05); T.step(0.8);
  checks.push(['마을에서 탑승', m.riding]);
  checks.push(['마을: 돌진 없음', m.charge(w, p, 1, 0) === false]);
  checks.push(['마을: 특수기 없음', m.trySpecial(w, p) === false]);
  T.key('ArrowRight', true); T.step(1.0); T.key('ArrowRight', false);
  checks.push(['마을에서 달린다', Math.abs(p.vx) > 200 || m.anim === 'run' || m.anim === 'walk', p.vx]);
  return { checks };
}));

// ═════════════ 모든 탈것 × 모든 스테이지 시작 방 (companions §14 C2 마지막 줄) ═════════════
await run('stages', ['mt_warhorse', 'mt_boar', 'mt_skelsteed', 'mt_direwolf', 'mt_wyvern', 'mt_giantbat', 'p2all'], STAGE('s01', '&cmp=all&cmplv=10'), (page) => page.evaluate(async (ids) => {
  const T = window.__T, g = T.g, checks = [], info = { noFit: [], rows: 0 };
  const { STAGES } = await import('/src/data/stages.js');
  const stages = Object.keys(STAGES).filter((s) => /^s\d\d$/.test(s));
  let bad = [];
  for (const sid of stages) {
    g.go('stage', { stageId: sid }, { fade: false });
    T.step(0.3);
    T.hook();
    const w = T.w, p = T.p;
    if (!w || w.stage.id !== sid || !p) { bad.push(sid + ':load'); continue; }
    for (const e of w.enemies()) e.dead = true;
    for (const id of ids) {
      const m = T.equip(id);
      if (!m) { bad.push(sid + ':' + id + ':attach'); continue; }
      m.cd = 0; m.state = 'stowed';
      const ok = m.summon(w, p, { force: true, instant: true });
      T.step(0.15);
      if (!ok) info.noFit.push(sid + ':' + id);
      else if (!m.riding || !T.fitsNow()) bad.push(sid + ':' + id + ':' + (m.riding ? 'embedded' : 'fell-off'));
      else {
        m.chargeCd = 0; m.charge(w, p, p.facing, 0); T.step(0.4);
        m.specialCd = 0; m.act = null; if (p.onGround || m.def.special?.air) m.trySpecial(w, p);
        T.step(0.6);
        if (m.riding && !T.fitsNow()) bad.push(sid + ':' + id + ':embedded-after');
        T.key('KeyZ', true); T.step(0.2); T.key('KeyZ', false); T.step(0.6);
      }
      info.rows++;
      m.dismount(w, p, 'unequip'); T.step(0.1);
      if (!T.M.fits(w, p.x, p.bottom, p.w, p.h)) bad.push(sid + ':' + id + ':rider-embedded');
      p.x = w.run.checkpoint.x; p.y = w.run.checkpoint.y; p.vx = 0; p.vy = 0; p.dead = false; p.hp = p.stats.hp;
      T.step(0.1);
    }
  }
  info.bad = bad; info.stages = stages.length;
  checks.push(['모든 스테이지 시작 방에서 소환·돌진·특수기·점프 (박힘 없음)', bad.length === 0, bad.slice(0, 12)]);
  checks.push(['시작 방에서 자리가 없어 못 탄 경우는 0', info.noFit.length === 0, info.noFit]);
  return { checks, info };
}, ONLY?.some((x) => P2.includes(x)) ? ONLY.filter((x) => P2.includes(x)) : P1));

// ═════════════ 경계 사례 (검수에서 찾은 결함의 회귀 검사) ═════════════
await run('edge', ['mt_warhorse', 'mt_giantbat', 'mt_direwolf'], STAGE('s01', '&cmp=all&cmplv=10&mount=mt_warhorse'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, checks = [], info = {};
  T.step(0.5); T.clearFoes();
  const m = T.m;
  // 1) R 연타: 소환 무적(0.45초)이 끝없이 이어지면 안 된다 · 빠른 두 번 누름에도 소환이 취소되지 않는다
  let inv = 0, n = 0;
  for (let i = 0; i < 60; i++) { T.key('KeyR', true); T.step(1 / 60); T.key('KeyR', false); for (let k = 0; k < 5; k++) { T.step(1 / 60); n++; if (p.invuln) inv++; } }
  info.rspam = +(inv / n).toFixed(2);
  checks.push(['R 연타로 무적이 이어지지 않는다 (< 50%)', inv / n < 0.5, info.rspam]);
  if (m.riding) { m.dismount(w, p, 'debug'); }
  T.step(2.6); m.cd = 0; p.iframes = 0; T.step(0.1);
  T.press('KeyR', 1 / 60); T.step(3 / 60); T.press('KeyR', 1 / 60); T.step(0.6);
  checks.push(['R 두 번 빠르게 → 그대로 탄다', m.riding, m.state]);
  // 2) 낙마 방향: 뒤에서 맞으면 앞으로, 앞에서 맞으면 뒤로 (공격이 미는 쪽)
  const knock = {};
  for (const side of [-1, 1]) {
    if (!m.riding) { m.cd = 0; m.state = 'stowed'; m.summon(w, p, { force: true, instant: true }); T.step(0.2); }
    T.reset(m); p.facing = 1; m.hp = 1;
    const z = T.spawn('zombie', side * 200);
    p.takeHit(20, { team: 'enemy', owner: z, dir: -side, kb: [200, -200] }, w, {});
    T.step(2 / 60);
    knock[side < 0 ? 'behind' : 'front'] = { state: m.state, vx: Math.round(p.vx) };
    z.dead = true; T.step(1.4); m.cd = 0; m.state = 'stowed'; m.hp = m.maxHp;
    p.x = w.run.checkpoint.x; p.y = w.run.checkpoint.y; p.vx = 0; p.vy = 0; T.step(0.4);
  }
  info.knock = knock;
  checks.push(['낙마: 뒤에서 맞으면 앞으로 날아간다', knock.behind.state === 'recall' && knock.behind.vx > 0, knock.behind]);
  checks.push(['낙마: 앞에서 맞으면 뒤로 날아간다', knock.front.state === 'recall' && knock.front.vx < 0, knock.front]);
  // 3) 가시·용암 튕김은 점프 키를 놓아도 반으로 잘리지 않는다
  m.cd = 0; m.state = 'stowed'; m.summon(w, p, { force: true, instant: true }); T.step(0.3); T.reset(m);
  p.jumpCut = false; m.hazard('spike', p, w); T.step(1 / 60);
  const vyS = p.vy;
  T.step(1.5, () => p.onGround); T.reset(m);
  p.jumpCut = false; m.hazard('lava', p, w); T.step(1 / 60);
  const vyL = p.vy;
  info.bounce = [Math.round(vyS), Math.round(vyL)];
  checks.push(['가시·용암 튕김 유지 (반으로 잘리지 않음)', vyS < -500 && vyL < -560, info.bounce]);
  T.step(1.5, () => p.onGround);
  // 4) 방 이동 직전에 누른 소환은 새 방에서 이어진다
  m.dismount(w, p, 'unequip'); T.step(0.3); m.cd = 0; p.iframes = 0;
  T.press('KeyR', 1 / 60); T.step(2 / 60);
  const st0 = m.state;
  w.gotoRoom(Object.keys(w.stage.rooms)[1]); T.step(1.0);
  checks.push(['소환 중 방 이동 → 새 방에서 탄다', st0 === 'summoning' && m.riding && T.fitsNow(), [st0, m.state]]);
  // 5) 녹티스: 땅에서 ↓+돌진은 제자리 돌진이 아니라 앞으로
  const b = T.ride('mt_giantbat'); T.reset(b);
  T.step(1.0, () => p.onGround);
  const x0 = p.cx; b.chargeCd = 0;
  const okB = b.charge(w, p, 0, 1); const d8 = { ...b.chargeDir };
  T.step(0.3);
  info.batDown = { ok: okB, d8, moved: Math.round(p.cx - x0) };
  checks.push(['녹티스 땅 위 ↓+돌진 → 앞으로', okB && Math.abs(d8.x) > 0.9 && Math.abs(p.cx - x0) > 100, info.batDown]);
  // 6) 탈것 쪽 무적 (영혼 결속 3초 등) 은 내린 기수에게 남지 않는다
  T.step(1.0, () => p.onGround);
  const h = T.ride('mt_warhorse'); T.reset(h); h.invulnT = 3;
  h.dismount(w, p, 'debug');
  checks.push(['내리면 탈것 쪽 무적이 남지 않는다', !p.invuln && h.invulnT === 0, [p.invuln, h.invulnT]]);
  return { checks, info };
}));

// ═════════════ 큰 기수 (브란 36×88) 가 늑대 (78) 에서 천장 밑 공중에 내린다 → 천장에 박히지 않는다 ═════════════
await run('ceiling', ['mt_direwolf'], STAGE('s05', '&char=bran&cmp=all&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, checks = [], info = {};
  T.step(0.5); T.clearFoes();
  const S = (x, y) => T.PH.isSolidType(w.map.typeAt(x, y));
  const spot = T.findTile((tx, ty) => [-1, 0, 1, 2].every((d) => S(tx + d, ty)) && [1, 2].every((k) => [-1, 0, 1, 2].every((d) => !S(tx + d, ty + k))));
  info.spot = spot; info.rider = p.ch.size;
  checks.push(['(준비) 천장 자리 · 기수가 탈것보다 크다', !!spot && p.ch.size.h > 78, info]);
  if (!spot) return { checks, info };
  const res = {};
  for (const reason of ['ult', 'knock', 'toggle']) {
    const m = T.ride('mt_direwolf'); T.reset(m);
    p.cx = spot.tx * 48 + 24; p.y = (spot.ty + 1) * 48 + 0.5; p.vx = 0; p.vy = 0; p.onGround = false;
    if (reason === 'knock') m.knockOff(w, p, 'debug'); else m.dismount(w, p, reason);
    res[reason] = { fits: T.fitsNow(), top: Math.round(p.y), h: p.h };
    m.cd = 0; m.state = 'stowed'; m.remountT = 0;
    p.x = w.run.checkpoint.x; p.y = w.run.checkpoint.y; p.vx = 0; p.vy = 0; T.step(1.0);
  }
  info.res = res;
  checks.push(['천장 밑에서 내려도 기수가 박히지 않는다 (필살기·낙마·하차)', Object.values(res).every((r) => r.fits && r.h === p.ch.size.h), res]);
  return { checks, info };
}));

// ═════════════ 터치 (844×390): 탑승/하차 버튼 ═════════════
await run('touch', ['mt_warhorse', 'touch'], STAGE('s01', '&cmp=all&cmplv=10&mount=mt_warhorse'), async (page, ctx) => {
  const checks = [];
  const cdp = await ctx.newCDPSession(page);
  const t = new Touch(cdp, page);
  await page.evaluate(() => { const T = window.__T; T.quiet(); T.p.iframes = 0; });
  const mode = await ensureTouchMode(t, page);
  checks.push(['터치 모드', mode === 'touch', mode]);
  await page.waitForTimeout(600);
  let L = await padLayout(page);
  checks.push(['탑승 버튼이 보인다', !!L.buttons.mount, { source: L.source, have: Object.keys(L.buttons) }]);
  if (L.buttons.mount) {
    await pressButton(t, page, 'mount', 120);
    await page.waitForFunction(() => window.__game.world.player.mount?.riding, null, { timeout: 8000 }).catch(() => {});
    const r1 = await page.evaluate(() => ({ riding: !!window.__T.m?.riding, hud: window.__T.w.companions.hudInfo()?.mount?.riding }));
    checks.push(['탑승 버튼 → 탑승', r1.riding && r1.hud, r1]);
    // 탑승 중에도 다른 버튼과 겹치지 않는다
    L = await padLayout(page);
    const b = L.buttons, mb = b.mount;
    const overlaps = Object.entries(b).filter(([k, o]) => k !== 'mount' && Math.hypot(o.cx - mb.cx, o.cy - mb.cy) < (o.d + mb.d) / 2).map(([k]) => k);
    checks.push(['탑승 버튼이 다른 버튼과 겹치지 않는다', overlaps.length === 0, overlaps]);
    await page.waitForTimeout(700);
    await pressButton(t, page, 'mount', 120);
    await page.waitForFunction(() => !window.__game.world.player.mount?.riding, null, { timeout: 8000 }).catch(() => {});
    const r2 = await page.evaluate(() => ({ riding: !!window.__T.m?.riding, state: window.__T.m?.state }));
    checks.push(['하차 버튼 → 하차', !r2.riding, r2]);
  }
  return { checks };
}, { mobile: true });

// ═════════════ 게임패드: L3 = 탈것 ═════════════
await run('pad', ['mt_warhorse', 'pad'], STAGE('s01', '&cmp=all&cmplv=10&mount=mt_warhorse'), async (page) => {
  const checks = [];
  await page.evaluate(() => { const T = window.__T; T.quiet(); T.p.iframes = 0; });
  await connect(page);
  await page.waitForTimeout(400);
  const press = async (i) => { await setButton(page, i, 1); await page.waitForTimeout(150); await setButton(page, i, 0); await page.waitForTimeout(150); };
  await press(BTN.L3);
  await page.waitForFunction(() => window.__game.world.player.mount?.riding, null, { timeout: 8000 }).catch(() => {});
  const r1 = await page.evaluate(() => ({ riding: !!window.__T.m?.riding, mode: window.__game.input.mode }));
  checks.push(['L3 → 탑승', r1.riding, r1]);
  await page.waitForTimeout(500);
  await press(BTN.B);   // 아케이드 배치: B = 대시 → 돌진
  const r2 = await page.evaluate(() => ({ cd: window.__T.m?.chargeCd, charging: window.__T.m?.chargeT > 0 }));
  checks.push(['패드 대시 → 돌진', r2.cd > 0 || r2.charging, r2]);
  await page.waitForTimeout(600);
  await press(BTN.L3);
  await page.waitForFunction(() => !window.__game.world.player.mount?.riding, null, { timeout: 8000 }).catch(() => {});
  const r3 = await page.evaluate(() => ({ riding: !!window.__T.m?.riding }));
  checks.push(['L3 → 하차', !r3.riding, r3]);
  return { checks };
}, { initScripts: [fakePadInit({ connected: false })] });

// ═════════════ 외전 아르겐 (mt_argen, docs/specs/ex_s21.md §3): 비룡 리그 · 날갯짓 셋 + 활공 · 뇌광 돌진 · 번개 급강하 충격파 · 은빛 번개 숨결 ═════════════
// 데이터만으로 동작한다 (MOUNT_B 없음): 숨결·충격파의 색·입자·소리는 mount.js ELEM_FX 가 속성(thunder)으로 고른다. 기본 실행에 든다 (--only mt_argen 으로 따로)
await run('ex_mt_argen', ['ex', 'mt_argen'], STAGE('s01', '&cmp=all&cmplv=10'), (page) => page.evaluate(() => {
  const T = window.__T, w = T.w, p = T.p, checks = [], info = {};
  T.step(0.5); T.clearFoes();
  const m = T.ride('mt_argen'); T.reset(m); T.step(0.3);
  T.setHome();
  const def = m.def;
  checks.push(['아르겐 탑승 · 비룡 리그 · 몸 크기', m.riding && def.rig === 'wyvern' && p.w === def.body.w && p.h === def.body.h, [def.rig, p.w, p.h]]);
  // 날갯짓 세 번 → 네 번째는 없음 → 활공
  T.key('KeyZ', true); T.step(0.05); T.key('KeyZ', false); T.step(0.35);
  const flapsVy = [];
  for (let i = 0; i < 4; i++) { T.key('KeyZ', true); T.step(1 / 60); flapsVy.push(Math.round(p.vy)); T.key('KeyZ', false); T.step(0.2); }
  checks.push(['날갯짓 세 번 (네 번째 없음)', flapsVy.slice(0, 3).every((v) => v <= -500) && flapsVy[3] > -500, flapsVy]);
  T.key('KeyZ', true);
  let maxVy = -1e9;
  T.step(0.8, () => { if (!p.onGround) maxVy = Math.max(maxVy, p.vy); return p.onGround; });
  T.key('KeyZ', false);
  checks.push(['활공 (vy ≤ glideFall)', maxVy <= def.flight.glideFall + 1, maxVy]);
  T.step(1.2, () => p.onGround);
  // 공중 돌진 = 번개 급강하 → 착지 충격파 (스칼렛 사례와 같은 순서)
  T.goHome(); T.reset(m); T.step(0.2); p.facing = 1;
  const dz = T.spawn('zombie', 120);
  T.step(1.2);
  const dh = dz.hp;
  T.key('KeyZ', true); T.step(0.2); T.key('KeyZ', false);
  T.press('KeyC', 0.05);
  const kind = m.chargeKind;
  T.step(1.0, () => p.onGround);
  T.step(0.1);
  checks.push(['공중 돌진 = 번개 급강하', kind === 'dive' && T.texts.includes(def.charge.air.name), kind]);
  checks.push(['급강하 착지 충격파', dz.dead || dz.hp < dh, [dh, dz.hp]]);
  // 땅 돌진 = 뇌광 돌진 (번개)
  T.step(0.5); T.clearFoes(); T.goHome(); T.reset(m); T.step(0.2); p.facing = 1;
  const gz = T.spawn('zombie', 120); T.step(1.2);
  const gh = gz.hp;
  T.press('KeyC', 0.05);
  const gk = m.chargeKind, gel = m.chargeAtk?.element;
  T.step(0.6);
  checks.push(['땅 돌진 = 뇌광 돌진 · 번개 · 적을 친다', gk === 'ground' && gel === 'thunder' && (gz.dead || gz.hp < gh), [gk, gel, gh, gz.hp]]);
  // 은빛 번개 숨결: 공중에서도, 1초, 낙하 ≤ vyMax, 번개 색 숨결 판정이 적을 친다
  T.step(0.5); T.clearFoes(); T.goHome(); T.reset(m); T.step(0.3); p.facing = 1;
  const bz = T.spawn('zombie', 110), bh = bz.hp;
  T.step(1.0);
  T.key('KeyZ', true); T.step(0.25); T.key('KeyZ', false);
  T.step(0.2);
  T.key('ArrowDown', true); T.press('KeyX', 0.05); T.key('ArrowDown', false);
  const breathing = m.act?.name === 'breath';
  const hb = w.entities.find((e) => e.kind === 'hitbox' && e.attack?.tags?.includes('special') && Array.isArray(e.cols));
  info.breath = { el: hb?.attack?.element, cols: hb?.cols, light: hb?.light?.color };
  let vyMaxBreath = -1e9;
  T.step(0.6, () => { if (!p.onGround && m.act?.name === 'breath') vyMaxBreath = Math.max(vyMaxBreath, p.vy); return false; });
  T.step(1.0);
  checks.push(['공중 은빛 번개 숨결 · 재사용 대기 · 이름', breathing && m.specialCd > 0 && T.texts.includes(def.special.name), [breathing, m.specialCd]]);
  checks.push(['숨결 판정 = 번개 (색 · 빛 · 속성)', info.breath.el === 'thunder' && info.breath.cols?.[0] === '#4aa8ff' && info.breath.light === '#bfe8ff', info.breath]);
  checks.push(['숨결 중 낙하 ≤ vyMax', vyMaxBreath <= def.special.vyMax + 1, vyMaxBreath]);
  checks.push(['숨결이 적을 친다', bz.dead || bh - bz.hp > 0, [bh, bz.hp]]);
  // 달리기
  T.goHome(); T.reset(m); T.key('ArrowRight', true); T.step(1.2); T.key('ArrowRight', false);
  checks.push(['달린다', Math.abs(p.vx) > def.move.speed * 0.8 || m.anim === 'run', p.vx]);
  checks.push(['돌풍 저항 windMul 0.5 · 탑승 보너스 번개', def.windMul === 0.5 && def.ride.thunder === 15 && def.ride.resThunder === 20]);
  return { checks, info };
}));

// ═════════════ 2부 탈것 (CMP-MOUNT-B 가 채운 뒤: --only mt_ignis,mt_gale,mt_silva) ═════════════
for (const id of P2) {
  await run('p2_' + id, ['p2', id], STAGE('s01', '&cmp=all&cmplv=10'), (page) => page.evaluate((id) => {
    const T = window.__T, w = T.w, p = T.p, checks = [], info = {};
    T.step(0.5); T.clearFoes();
    const m = T.ride(id); T.reset(m); T.step(0.3);
    const def = m.def;
    checks.push(['탑승 · 몸 크기', m.riding && p.w === def.body.w && p.h === def.body.h, [p.w, p.h]]);
    T.key('ArrowRight', true); T.step(1.2); T.key('ArrowRight', false);
    checks.push(['달린다', Math.abs(p.vx) > def.move.speed * 0.8 || m.anim === 'run', p.vx]);
    T.step(0.8);
    const z = T.spawn('zombie', 120), zh = z.hp;
    T.reset(m); p.facing = 1;
    T.press('KeyC', 0.05); T.step(0.6);
    checks.push(['돌진이 적을 친다', z.dead || z.hp < zh, [zh, z.hp]]);
    if (def.charge.trail) checks.push(['돌진 불씨 자국', w.entities.some((e) => e.kind === 'hitbox' && e.attack?.tags?.includes('trail'))]);
    T.step(1.0); T.reset(m); T.step(0.2);
    checks.push(['MOUNT_B 등록 (mount_b.js)', !!T.MB.MOUNT_B[id]?.special, Object.keys(T.MB.MOUNT_B)]);
    T.key('ArrowDown', true); T.press('KeyX', 0.05); T.key('ArrowDown', false);
    checks.push(['특수기 → 재사용 대기', m.specialCd > 0, m.specialCd]);
    checks.push(['특수기 이름', T.texts.includes(def.special.name)]);
    T.step(1.5);
    if (id === 'mt_gale') checks.push(['게일 windMul 0.5', def.windMul === 0.5]);
    if (id === 'mt_silva') checks.push(['실바 blightMul 0.5 · 독 면역', def.blightMul === 0.5 && def.hazard.poison === 0]);
    if (id === 'mt_ignis') checks.push(['이그니스 용암 절반', def.hazard.lava === 0.5]);
    return { checks, info };
  }, id));
}

await browser.close(); srv.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 사례 통과${bad.length ? ' — 실패: ' + bad.map((r) => r.name).join(', ') : ''}`);
process.exit(bad.length ? 1 : 0);
