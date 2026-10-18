// 통합 스모크: 여러 화면/스테이지를 차례로 열어 페이지 오류를 수집하고 스크린샷을 남긴다.
// 사용: node tools/integration.mjs [--only s03,hub,s14_boss] [--out dir] [--mobile] [--device <id>] [--dist [dir]] [--list]
//   --device <id> : tools/qa/lib/viewports.mjs 의 기기 (phone2, fold_open, tablet, desk …). --mobile 은 예전 844×390 ×2 터치
//   --dist [dir] : 원본 대신 빌드 결과(dist/web, CSP 적용)를 tools/deploy/serve_dist.mjs 로 띄워 검사 (build_web.mjs 먼저)
//   --list       : 케이스 id 만 출력
// 종료 코드: 0 = 모든 케이스 오류 없음, 1 = 오류가 난 케이스가 있음, 2 = --only 에 없는 케이스 id (조용히 통과하지 않게)
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { VIEWPORTS } from './qa/lib/viewports.mjs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const out = args.out || '/tmp/claude-0/integ';
const DEV = args.device ? VIEWPORTS[String(args.device)] : null;
if (args.device && !DEV) { console.error(`✗ --device: 모르는 기기 '${args.device}' (${Object.keys(VIEWPORTS).join(', ')})`); process.exit(2); }
const mobile = !!args.mobile || !!DEV?.touch;
const ctxOpts = () => (DEV ? structuredClone(DEV.context) : mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
const KEY = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', jump: 'KeyZ', attack: 'KeyX', dash: 'KeyC', sub: 'KeyA', skill1: 'KeyS', skill2: 'KeyD', ult: 'KeyF', menu: 'Escape', enter: 'Enter', swap: 'KeyQ' };
// 1부 s01–s13 + 2부 s14–s20 (P2-QA) + 외전 s21 (EX-INTEG, docs/specs/ex_s21.md) · s22 (EX2-INTEG, docs/specs/ex_s22.md) · s23 (EX3-INTEG, docs/specs/ex_s23.md) · s24 (EX4-INTEG, docs/specs/ex_s24.md) · s25 (EX5-INTEG, docs/specs/ex_s25.md) · s26 (CH26-WIRE, docs/specs/ex_s26.md — 1부 외전). 보스방 케이스 <id>_boss 는 끝에 world.boss 가 있어야 통과한다.
const STAGES = ['s01','s02','s03','s04','s05','s06','s07','s08','s09','s10','s11','s12','s13','s14','s15','s16','s17','s18','s19','s20','s21','s22','s23','s24','s25','s26'];
// 외전 보스방은 그 외전의 보스여야 한다 (world.boss.def.id — 다른 보스로 대신 나오면 실패)
const SIDE_BOSS = { s21: 'b_argen', s22: 'b_nemain', s23: 'b_hagen', s24: 'b_bride', s25: 'b_charon', s26: 'b_paracel' };
const CASES = [
  { id: 'title', url: 'index.html', steps: 'wait:1.5,shot,enter:0.1,wait:1,shot,down:0.1,down:0.1,wait:0.3,shot' },
  { id: 'hub', url: 'index.html?scene=hub', steps: 'wait:2,shot,right:2,shot,menu:0.1,wait:0.5,shot' },
  { id: 'worldmap', url: 'index.html?scene=worldmap', steps: 'wait:1.5,shot,right:0.1,wait:0.3,shot' },
  { id: 'inn', url: 'index.html?scene=inn', steps: 'wait:1.5,shot,down:0.1,enter:0.1,wait:1,shot' },
  { id: 'arcade', url: 'index.html?scene=arcade', steps: 'wait:1.5,shot' },
  ...STAGES.map((s) => ({ id: s, url: `index.html?scene=stage&stage=${s}`, steps: 'wait:3,shot,right:1.2,attack:0.15,wait:0.2,attack:0.15,jump:0.3,right:1,shot,menu:0.1,wait:0.6,shot,menu:0.1,wait:0.4,sub:0.1,skill1:0.1,wait:0.5' })),
  // rightboss:N = 보스가 나올 때까지(최대 N초) 오른쪽으로 걷기, intro:N = 보스 소개·대사를 넘겨 전투가 시작될 때까지(최대 N초).
  // 부하가 큰 기계에서도 고정 시간 대기에 기대지 않는다 (2부 보스방은 입구에서 경기장까지 15칸).
  ...STAGES.map((s) => ({ id: s + '_boss', url: `index.html?scene=stage&stage=${s}&room=boss`, boss: true, bossId: SIDE_BOSS[s], steps: 'wait:2.5,rightboss:8,intro:25,wait:1,shot,attack:0.2,attack:0.2,attack:0.2,wait:1,shot' })),
  // 7번째 영웅 이졸데(창): 1부 첫 스테이지와 2부 합류 다음 스테이지를 이졸데로 (docs/specs/hero7.md)
  ...['s01', 's15'].map((s) => ({ id: s + '_isolde', url: `index.html?scene=stage&stage=${s}&char=isolde`, steps: 'wait:3,shot,right:1.2,attack:0.15,wait:0.2,attack:0.15,jump:0.3,attack:0.15,wait:0.8,right:1,shot,menu:0.1,wait:0.6,shot,menu:0.1,wait:0.4,sub:0.1,skill1:0.1,wait:0.5' })),
  // 회차 「피의 윤회」 (docs/specs/ngplus.md §8): ?ng=N 디버그 세이브 — 2회차 s01 (적 레벨 70 · 배너 '2회차 · CHAPTER 1'), 4회차 s20 보스 (강화 패턴)
  { id: 's01_ng', url: 'index.html?scene=stage&stage=s01&ng=1', steps: 'wait:3,shot,right:1.2,attack:0.15,wait:0.2,attack:0.15,jump:0.3,right:1,shot,menu:0.1,wait:0.6,shot,menu:0.1,wait:0.4,sub:0.1,skill1:0.1,wait:0.5' },
  { id: 's20_boss_ng', url: 'index.html?scene=stage&stage=s20&room=boss&ng=3', boss: true, steps: 'wait:2.5,rightboss:8,intro:25,wait:1,shot,attack:0.2,attack:0.2,attack:0.2,wait:1,shot' },
  { id: 'menu', url: 'index.html?scene=stage&stage=s02', steps: 'wait:2.5,menu:0.1,wait:0.5,down:0.1,enter:0.1,wait:1,shot,KeyE:0.1,wait:0.4,shot,KeyE:0.1,wait:0.4,shot,KeyE:0.1,wait:0.4,shot,KeyE:0.1,wait:0.4,shot' },
  // [retryart] 보스방 입구 재도전 (PLAY P12): 보스전 중 물약 하나를 쓰고 (입구 기록 HP·MP 를 절반으로 낮춰 둔 채) 목숨 1 로 쓰러져 게임오버 → 이어하기.
  //  bossretry:auto = 카운트다운이 0 이 되어 저절로 이어하기 · bossretry:tap = 「이어하기」 버튼을 누른다 (터치 기기는 손가락, 데스크톱은 마우스).
  //  확인: 게임오버의 doorRetry · 보스방 시작 자리(경기장 X 앞) · 보스·경기장 없음 · HP/MP (견습·숙련 가득, 베테랑 이상 입구 값) · 가방 그대로(물약 안 돌려줌)
  //  · 골드·비밀 그대로 · 크레딧 −1 · 목숨 = 난이도 시작값. retryintro:N = 다시 걸어 들어간 뒤 짧은 등장 연출(short)·체력 가득 1페이즈 새 보스·N 초 안에 싸움 시작
  { id: 's01_boss_retry', url: 'index.html?scene=stage&stage=s01&room=boss', boss: true, steps: 'wait:2.5,rightboss:8,intro:25,wait:1,bossretry:auto,shot,rightboss:8,retryintro:8,wait:0.5,shot' },
  { id: 's01_boss_retry_hard', url: 'index.html?scene=stage&stage=s01&room=boss&diff=hard', boss: true, steps: 'wait:2.5,rightboss:8,intro:25,wait:1,bossretry:tap,shot,rightboss:8,retryintro:8,wait:0.5,shot' },
  { id: 's14_boss_retry', url: 'index.html?scene=stage&stage=s14&room=boss', boss: true, steps: 'wait:2.5,rightboss:8,intro:25,wait:1,bossretry:tap,shot,rightboss:10,retryintro:8,wait:0.5,shot' },
  // 무한의 탑: 1층 전투 → (시험 훅 debugKillAll) 층 돌파 → 출구 (데스크톱 ▲, 휴대폰 가만히 서 있기) → 2층. towerfloor:N = 최대 N초
  { id: 'tower', url: 'index.html?scene=tower&seed=4242&preset=3&diff=normal', steps: 'wait:1.5,towerfloor:40,shot' },
  // 외전 26장 (1부 외전, docs/specs/ex_s26.md — CH26-WIRE): s26_gate = 새 세이브의 세계 지도에는 s26 노드가 없고, 7장을 깬 1부 세이브는
  //  해금 연출(외전 · 지하 공방) 뒤 7장 아래에 노드가 열린다 (2부 엔딩 없이) · 정보판 · 출발 → s26 입장.
  //  s26_flow = 입장 → 방 r2–r5 를 차례로 (gotoRoom, 대사 넘김) → 보스방 → 보스 소개 → 채색 렌더러(registry, 벡터 대역 아님) 확인 →
  //  진짜 피해 경로(boss.takeHit)로 50% 변신 · 15% 마지막 한 모금(대사) · 격파 → 결과 → 아웃트로(s26_outro) → 마을, 그리고 저장 상태
  //  (cleared.s26 · ex_s26_done · 이야기 장 그대로 · boss_b_paracel). 무적(buffs.invincible)으로 영웅 레벨과 무관하게 끝까지 간다.
  { id: 's26_gate', url: 'index.html?scene=hub', steps: 'wait:2,wmgate:30,shot' },
  // s26_rush = 1부 외전 코스 「외전 Ⅰ」(#18, 기기 기록): s26 을 연 1부 세이브만 고를 수 있고 (2부·2부 외전을 몰라도), 첫 보스가 나온다. 새 세이브는 코스 0 으로 돌아간다
  { id: 's26_rush', url: 'index.html?scene=arcade', steps: 'wait:1.5,rush26:25,shot' },
  { id: 's26_flow', url: 'index.html?scene=stage&stage=s26', steps: 'wait:3,god:1,shot,rooms:r2|r3|r4|r5,shot,rooms:boss,rightboss:10,intro:25,painted:10,wait:1,shot,bosskill:150,wait:1.5,shot,tohub:150,shot,s26check:1' },
];
if (args.list) { console.log(CASES.map((c) => c.id).join(' ')); process.exit(0); }
const only = args.only ? String(args.only).split(',').map((s) => s.trim()).filter(Boolean) : null;
const unknown = (only || []).filter((id) => !CASES.some((c) => c.id === id));
if (unknown.length) { console.error(`✗ --only 에 없는 케이스: ${unknown.join(', ')}  (전체: node tools/integration.mjs --list)`); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
let srv;
if (args.dist) {
  const { start: startDist } = await import('./deploy/serve_dist.mjs');
  const dir = args.dist === true ? undefined : path.resolve(String(args.dist));
  // 빌드가 없으면 스택 대신 한 줄로 알리고 2 (케이스 실패 1 과 구분 — 준비 오류)
  try { srv = await startDist(port, { quiet: true, ...(dir ? { dir } : {}) }); } catch (e) { console.error(`✗ --dist: ${e.message}`); process.exit(2); }
} else srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const report = [];
for (const c of CASES) {
  if (only && !only.includes(c.id)) continue;
  const ctx = await browser.newContext(ctxOpts());
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|ERR_CERT|fonts\.g/.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
  try {
    await page.goto(`http://localhost:${port}/${c.url}`, { timeout: 30000 });
    // 두 단계 부팅 (R1-REQ-229, 요청 #426): 타이틀로 열면 window.__game 은 타이틀만 등록한 채 먼저 뜨고 나머지 장면은 뒤에 온다
    // (game.scenesReady === false 동안). 단계는 장면이 모두 등록된 뒤에 시작한다 — Node 에서 page.evaluate 로 물어 CSP(--dist) 에도 안전
    {
      const t0 = Date.now();
      let ready = false;
      while (!ready && Date.now() - t0 < 60000) {
        ready = await page.evaluate(() => { const g = window.__game; return !!g && g.scenes.length > 0 && g.scenesReady !== false; }).catch(() => false);
        if (!ready) await page.waitForTimeout(100);
      }
      if (!ready) errs.push('BOOT 60초 안에 장면이 모두 등록되지 않음 (window.__game · game.scenesReady)');
    }
    let n = 0;
    for (const s of c.steps.split(',')) {
      const [k, d] = s.split(':');
      if (k === 'shot') { await page.screenshot({ path: `${out}/${c.id}_${n++}.png` }); continue; }
      if (k === 'wait') { await page.waitForTimeout(Number(d) * 1000); continue; }
      if (k === 'rightboss') {
        const t0 = Date.now();
        await page.keyboard.down(KEY.right);
        // 막히면(가로 이동 없음) 점프해서 계단·턱을 넘는다 (s01 보스방 입구의 2칸 턱 등)
        let lastX = null, jumpT = 0;
        while (Date.now() - t0 < Number(d) * 1000) {
          const st = await page.evaluate(() => { const g = window.__game, w = g?.world; return { boss: !!w?.boss, x: w?.player?.x ?? 0, top: g?.scenes?.[g.scenes.length - 1]?.name }; });
          if (st.boss) break;
          // 길목의 '!' 대사(예: s13 보스방 입구)는 넘긴다
          if (st.top === 'dialogue') { await page.keyboard.press(KEY.enter); await page.waitForTimeout(200); continue; }
          if (st.top === 'pause') { await page.keyboard.press(KEY.menu); await page.waitForTimeout(200); continue; }
          if (lastX != null && Math.abs(st.x - lastX) < 2 && Date.now() - jumpT > 700) {
            jumpT = Date.now();
            // 두 번 점프 (s01 보스방 입구의 벽은 4칸 — 한 번 점프로는 못 넘는다)
            await page.keyboard.down(KEY.jump); await page.waitForTimeout(260); await page.keyboard.up(KEY.jump);
            await page.waitForTimeout(90);
            await page.keyboard.down(KEY.jump); await page.waitForTimeout(260); await page.keyboard.up(KEY.jump);
          }
          lastX = st.x;
          await page.waitForTimeout(120);
        }
        await page.keyboard.up(KEY.right); await page.waitForTimeout(40);
        continue;
      }
      if (k === 'towerfloor') {
        // 무한의 탑: 1층 적이 나오면 모두 쓰러뜨리고, 출구가 열리면 데스크톱은 ▲, 휴대폰(--mobile)은 출구 위에 가만히 서서 2층으로
        const t0 = Date.now();
        let st = null, killed = false, upT = 0;
        while (Date.now() - t0 < Number(d) * 1000) {
          st = await page.evaluate(() => { const g = window.__game, t = g?.scenes?.find((s) => s.name === 'tower'); return { top: g?.top?.name, phase: t?.phase, floor: t?.floor, near: !!t?.gate?.near, fade: g?.fade?.a ?? 0, foes: t?.world?.enemies?.().length ?? -1 }; });
          if (st.floor === 2 && st.phase === 'enter' && st.fade < 0.05) { st.ok = true; break; }
          if (st.top === 'tower' && st.phase === 'fight' && st.foes > 0 && !killed) { killed = true; await page.evaluate(() => window.__game.top.debugKillAll()); }
          if (st.top === 'tower' && st.phase === 'gate' && st.near && !mobile && Date.now() - upT > 600) { upT = Date.now(); await page.keyboard.down(KEY.up); await page.waitForTimeout(120); await page.keyboard.up(KEY.up); }
          await page.waitForTimeout(150);
        }
        if (!st?.ok) errs.push(`NOFLOOR2 ${d}초 안에 2층으로 가지 못함 (${JSON.stringify(st)})`);
        continue;
      }
      if (k === 'bossretry') {
        // [retryart] 보스전 중 물약 하나 → 입구 기록 HP·MP 절반 → 목숨 1 로 쓰러뜨리기 → 게임오버 → 이어하기 (auto | tap) → 입구 확인
        const pre = await page.evaluate(async () => {
          const g = window.__game, w = g.world, p = w?.player;
          if (!w || !p || !w.bossActive) return { err: `보스전이 아님 (bossActive=${!!w?.bossActive})` };
          const potions = () => g.state.inventory.filter((it) => it.baseId === 'c_potion').reduce((a, it) => a + (it.qty ?? 1), 0);
          const p0 = potions();
          let used = null;
          try {
            const inv = await import('/src/game/inventory.js');
            const pot = g.state.inventory.find((it) => it.baseId === 'c_potion');
            p.hp = Math.max(1, Math.floor(p.stats.hp * 0.4));
            used = pot ? inv.useItem(g.state, w.hero, pot.uid, p)?.ok === true : false;
          } catch { used = null; }   // 빌드(--dist)에서는 모듈 경로가 없다: 물약 확인만 건너뛴다
          if (!w.bossDoor) return { err: '보스방 입구 기록(world.bossDoor) 없음' };
          w.bossDoor.hp = Math.max(1, Math.round(p.stats.hp * 0.5)); w.bossDoor.mp = Math.round(p.stats.mp * 0.5);
          const snap = { roomId: w.roomId, door: { ...w.bossDoor }, arenaX: w.arenaX, p0, used, potions: potions(), continues: w.run.continues, gold: g.state.gold, secrets: g.state.progress.secrets.length,
            inv: g.state.inventory.map((it) => `${it.uid}:${it.qty ?? 1}`).sort().join(','), diff: w.diff?.id, lives0: w.diff?.lives };
          w.run.lives = 1; p.hp = 0; p.die(w, 'test');
          return snap;
        });
        if (pre.err) { errs.push('BOSSRETRY ' + pre.err); continue; }
        if (pre.used === false || (pre.used && pre.potions !== pre.p0 - 1)) errs.push(`BOSSRETRY 물약을 쓰지 못함 (${pre.p0} → ${pre.potions})`);
        let t0 = Date.now(), go = null;
        while (Date.now() - t0 < 9000) {
          go = await page.evaluate(() => { const g = window.__game, top = g?.scenes?.[g.scenes.length - 1]; return { top: top?.name, door: !!top?.doorRetry, t: top?.t ?? 0, can: !!top?.canContinue }; });
          if (go.top === 'gameover') break;
          await page.waitForTimeout(150);
        }
        if (go?.top !== 'gameover') { errs.push(`BOSSRETRY 9초 안에 게임오버가 뜨지 않음 (top=${go?.top})`); continue; }
        if (!go.door) errs.push('BOSSRETRY 게임오버에 보스방 입구 재도전 표시(doorRetry)가 없음');
        await page.waitForTimeout(700);   // GO_ARM 뒤 · 버튼이 그려진 뒤
        await page.screenshot({ path: `${out}/${c.id}_${n++}.png` });
        if (d === 'tap') {
          // 게임오버가 이번 프레임에 그린 「이어하기」 사각형 (scene.contRect, 장면 좌표 → CSS px). --dist 번들에는 /src 모듈이 없으므로
          // 모듈(ui.taps)은 contRect 가 없을 때만 불러 본다 — [retryart verify]
          const r = await page.evaluate(async () => {
            const g = window.__game, sc = g.scenes[g.scenes.length - 1];
            let z = sc?.contRect ?? null;
            if (!z) { try { const { taps } = await import('/src/core/ui.js'); z = taps._list.slice(0, taps.n).find((q) => q.id === 'go_cont') ?? null; } catch { /* 빌드: 모듈 경로 없음 */ } }
            if (!z) return null;
            const cr = g.canvas.getBoundingClientRect(), k = (cr.width / g.viewW) * (sc.uiScale ? g.uiK || 1 : 1);
            return { x: cr.left + (z.x + z.w / 2) * k, y: cr.top + (z.y + z.h / 2) * k };
          }).catch(() => null);
          if (!r) errs.push('BOSSRETRY 이어하기 버튼 영역(go_cont)을 찾지 못함');
          else if (mobile) await page.touchscreen.tap(r.x, r.y);
          else await page.mouse.click(r.x, r.y);
        }
        t0 = Date.now();
        while (Date.now() - t0 < (d === 'auto' ? 16000 : 5000)) {
          go = await page.evaluate(() => { const g = window.__game; return { top: g?.scenes?.[g.scenes.length - 1]?.name }; });
          if (go.top !== 'gameover') break;
          await page.waitForTimeout(150);
        }
        if (go.top === 'gameover') { errs.push(`BOSSRETRY 이어하기(${d})가 실행되지 않음`); continue; }
        await page.waitForTimeout(300);
        const post = await page.evaluate(() => {
          const g = window.__game, w = g.world, p = w?.player;
          const potions = g.state.inventory.filter((it) => it.baseId === 'c_potion').reduce((a, it) => a + (it.qty ?? 1), 0);
          return { top: g.scenes[g.scenes.length - 1]?.name, roomId: w?.roomId, boss: !!w?.boss, active: !!w?.bossActive, arena: !!w?.arena, cut: !!w?.cutscene, dead: !!p?.dead,
            cx: p ? p.x + p.w / 2 : null, hp: p?.hp, hpMax: p?.stats?.hp, mp: p?.mp, mpMax: p?.stats?.mp, potions, continues: w?.run?.continues, lives: w?.run?.lives,
            gold: g.state.gold, secrets: g.state.progress.secrets.length, inv: g.state.inventory.map((it) => `${it.uid}:${it.qty ?? 1}`).sort().join(','), retries: w?.bossDoorRetries ?? 0 };
        });
        const bad = [];
        if (post.top !== 'stage') bad.push(`top=${post.top}`);
        if (post.roomId !== pre.roomId) bad.push(`방 ${post.roomId} ≠ ${pre.roomId}`);
        if (post.boss || post.active || post.arena || post.cut) bad.push(`보스·경기장이 남음 (boss=${post.boss} active=${post.active} arena=${post.arena} cutscene=${post.cut})`);
        if (post.dead) bad.push('영웅이 쓰러진 채');
        if (!(post.cx < pre.arenaX + 48)) bad.push(`입구가 아님 (x=${Math.round(post.cx)}, 경기장 X=${pre.arenaX})`);
        const hard = !['easy', 'normal'].includes(pre.diff);
        const wantHp = hard ? Math.min(pre.door.hp, post.hpMax) : post.hpMax, wantMp = hard ? Math.min(pre.door.mp, post.mpMax) : post.mpMax;
        // 이어하기 뒤 0.3초 동안의 자연 회복(MP 재생·회복 특성)은 최대치의 10% 까지 봐준다 (그 아래로 내려가면 안 된다)
        const near = (v, want, max) => v >= want - 0.5 && v <= want + Math.max(1, max * 0.1);
        if (!near(post.hp, wantHp, post.hpMax)) bad.push(`HP ${Math.round(post.hp)} ≠ ${Math.round(wantHp)} (${pre.diff})`);
        if (!near(post.mp, wantMp, post.mpMax)) bad.push(`MP ${Math.round(post.mp)} ≠ ${Math.round(wantMp)} (${pre.diff})`);
        if (post.potions !== pre.potions || post.inv !== pre.inv) bad.push(`가방이 바뀜 (물약 ${pre.potions} → ${post.potions})`);
        if (post.gold !== pre.gold || post.secrets !== pre.secrets) bad.push(`진행이 바뀜 (골드 ${pre.gold}→${post.gold}, 비밀 ${pre.secrets}→${post.secrets})`);
        if (post.continues !== pre.continues - 1) bad.push(`크레딧 ${pre.continues} → ${post.continues}`);
        if (post.lives !== pre.lives0) bad.push(`목숨 ${post.lives} ≠ ${pre.lives0}`);
        if (post.retries !== 1) bad.push(`bossDoorRetries=${post.retries}`);
        if (bad.length) errs.push('BOSSRETRY ' + bad.join(' · '));
        continue;
      }
      if (k === 'retryintro') {
        // [retryart] 재도전의 보스 등장: 짧은 이름 카드(bossIntro.short) → N 초 안에 싸움, 새 보스는 체력 가득 · 1페이즈
        const t0 = Date.now();
        let st = null, short = null;
        while (Date.now() - t0 < Number(d) * 1000) {
          st = await page.evaluate(() => { const g = window.__game, w = g?.world, top = g?.scenes?.[g.scenes.length - 1]; return { top: top?.name, short: top?.name === 'bossIntro' ? !!top.short : null, cut: !!w?.cutscene, active: !!w?.bossActive, hp: w?.boss?.hp, max: w?.boss?.stats?.maxHp, phase: w?.boss?.phase ?? 0, pend: !!w?.boss?.pendingBoss }; });
          if (st.short != null && short == null) short = st.short;
          if (st.top === 'stage' && st.active && !st.cut) { st.ok = true; break; }
          const key = st.top === 'dialogue' ? KEY.enter : st.top === 'pause' ? KEY.menu : null;
          if (key) { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); }
          await page.waitForTimeout(120);
        }
        const sec = (Date.now() - t0) / 1000;
        if (!st?.ok) errs.push(`RETRYINTRO ${d}초 안에 다시 싸움이 시작되지 않음 (${JSON.stringify(st)})`);
        else {
          if (short !== true) errs.push(`RETRYINTRO 짧은 등장 연출이 아님 (short=${short})`);
          if (!st.pend && !(st.hp >= st.max - 0.5)) errs.push(`RETRYINTRO 새 보스 체력이 가득이 아님 (${st.hp}/${st.max})`);
          if (st.phase) errs.push(`RETRYINTRO 보스가 ${st.phase}페이즈에서 시작`);
          console.log(`    · ${c.id} 재도전 등장 → 싸움 ${sec.toFixed(1)}초`);
        }
        continue;
      }
      // ── 외전 26장 흐름 단계 (s26_gate · s26_flow) ──
      const god = () => page.evaluate(() => { const p = window.__game?.world?.player; if (p) { p.buffs.invincible = 9999; if (!p.dead && p.hp < p.stats.hp) p.hp = p.stats.hp; } }).catch(() => null);
      const topName = () => page.evaluate(() => { const g = window.__game; return g?.scenes?.[g.scenes.length - 1]?.name ?? null; }).catch(() => null);
      const tapKey = async (key) => { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); };
      if (k === 'god') { await god(); continue; }
      if (k === 'rooms') {
        // 방을 차례로: world.gotoRoom(방) → 그 방에 들어와 전환이 끝날 때까지 (대사는 넘긴다) → 1초 머문다
        for (const rid of String(d).split('|')) {
          await page.evaluate((r) => window.__game.world.gotoRoom(r), rid);
          const t0 = Date.now();
          let st = null;
          while (Date.now() - t0 < 15000) {
            st = await page.evaluate(() => { const g = window.__game, w = g?.world; return { room: w?.roomId, tr: !!w?.transitioning, top: g?.scenes?.[g.scenes.length - 1]?.name, fade: g?.fade?.a ?? 0 }; });
            if (st.top === 'dialogue') { await tapKey(KEY.enter); await page.waitForTimeout(150); continue; }
            if (st.room === rid && !st.tr && st.fade < 0.05) break;
            await page.waitForTimeout(120);
          }
          if (st?.room !== rid) { errs.push(`ROOMS ${rid} 에 들어가지 못함 (${JSON.stringify(st)})`); break; }
          await god();
          // 방 안에서 잠깐 움직이고 (트리거·기믹이 한 번 돈다) 대사가 뜨면 넘긴다
          await page.keyboard.down(KEY.right); await page.waitForTimeout(500); await page.keyboard.up(KEY.right);
          const t1 = Date.now();
          while (Date.now() - t1 < 6000) { const tp = await topName(); if (tp !== 'dialogue') break; await tapKey(KEY.enter); await page.waitForTimeout(150); }
          console.log(`    · ${c.id} 방 ${rid} 들어옴`);
        }
        continue;
      }
      if (k === 'painted') {
        // 보스가 채색 렌더러(render/painted registry — 벡터 대역 아님)로 그려지는가: 등록 · 준비(ready) · 대리 개체 부착 · 교차 페이드 끝
        const t0 = Date.now();
        let st = null;
        while (Date.now() - t0 < Number(d) * 1000) {
          st = await page.evaluate(async () => {
            const R = await import('/src/render/painted/registry.js').catch(() => null);
            const b = window.__game?.world?.boss, id = b?.def?.id, px = b?._painted?.proxy;
            return { id, has: !!R?.hasPainted?.(id), state: R?.paintedState?.(id) ?? null, proxy: !!(px && !px.dead), k: px?.fadeK?.() ?? 0 };
          });
          if (st.has && st.state === 'ready' && st.proxy && st.k >= 1) break;
          await page.waitForTimeout(250);
        }
        if (!(st?.has && st.state === 'ready' && st.proxy && st.k >= 1)) errs.push(`PAINTED 채색 렌더러로 그려지지 않음 (${JSON.stringify(st)})`);
        else console.log(`    · ${c.id} 채색 보스 ${st.id} (registry ready, 대리 개체 부착)`);
        continue;
      }
      if (k === 'bosskill') {
        // 진짜 피해 경로: boss.takeHit(최대 체력 6%) 를 되풀이 — 50% 변신(무적 동안은 기다림) · 15% 마지막 한 모금(대사는 넘김) · 격파
        const t0 = Date.now();
        let st = null, phase2 = false, last = false, lastLine = false;
        while (Date.now() - t0 < Number(d) * 1000) {
          await god();
          st = await page.evaluate(() => {
            const g = window.__game, w = g?.world, b = w?.boss, top = g?.scenes?.[g.scenes.length - 1]?.name;
            if (!b) return { none: true, top, cleared: !!w?.cleared };
            const r = { top, hp: b.hp, max: b.stats?.maxHp, phase: b.phase ?? 0, dying: b.dying > 0, inv: !!b.invuln, state: b.state, f15: !!b._forced15, cleared: !!w.cleared };
            // 15% 아래에 처음 들어가면 그 보스의 '마지막 한 수'(파라켈 lastDose · 대사)가 시작될 때까지 3초 기다린다 (b._w15 = 기다리기 시작한 시각)
            const low = b.hp / b.stats.maxHp <= 0.15 && b.phase >= 1;
            if (low && !b._itDone) { b._w15 ??= w.time; if (b.state === 'lastDose' || w.time - b._w15 > 3) b._itDone = true; else return r; }
            if (top === 'stage' && !b.invuln && !(b.dying > 0) && w.bossActive && !w.cutscene) b.takeHit(Math.ceil(b.stats.maxHp * 0.06), { team: 'player', tags: ['skill'], dir: 1, stats: w.player?.stats }, w, {});
            return r;
          });
          if (st.phase >= 1) phase2 = true;
          if (st.hp != null && st.max && st.hp / st.max <= 0.15) last = true;
          if (st.top === 'dialogue') { lastLine ||= last && st.state === 'lastDose'; await tapKey(KEY.enter); await page.waitForTimeout(150); continue; }
          if (st.dying || st.cleared || st.none) break;
          await page.waitForTimeout(st.inv ? 300 : 380);
        }
        if (!(st?.dying || st?.cleared || st?.none)) errs.push(`BOSSKILL ${d}초 안에 보스를 쓰러뜨리지 못함 (${JSON.stringify(st)})`);
        if (!phase2) errs.push('BOSSKILL 2페이즈(50% 변신)를 거치지 않음');
        if (c.id.startsWith('s26') && !lastLine) errs.push('BOSSKILL 15% 마지막 한 모금(lastDose 대사 b_paracel_last)이 나오지 않음');
        console.log(`    · ${c.id} 보스 격파 (2페이즈 ${phase2 ? '거침' : '없음'} · 15% ${last ? '지남' : '-'} · 마지막 한 모금 대사 ${lastLine ? '봄' : '-'}) ${((Date.now() - t0) / 1000).toFixed(1)}초`);
        continue;
      }
      if (k === 'tohub') {
        // 격파 뒤: 보스 대사 · 결과 화면 · 아웃트로(이야기 장면) 를 넘겨 마을(hub)까지
        const t0 = Date.now(), seen = [];
        let top = null;
        while (Date.now() - t0 < Number(d) * 1000) {
          top = await topName();
          if (top && seen[seen.length - 1] !== top) seen.push(top);
          if (top === 'hub') break;
          if (top === 'pause') { await tapKey(KEY.menu); await page.waitForTimeout(200); continue; }
          if (top && top !== 'stage') await tapKey(KEY.enter);
          await page.waitForTimeout(top === 'stage' ? 400 : 180);
        }
        if (top !== 'hub') errs.push(`TOHUB ${d}초 안에 마을로 돌아오지 못함 (장면 ${seen.join('>')})`);
        if (!seen.includes('results')) errs.push(`TOHUB 결과 화면이 없었음 (${seen.join('>')})`);
        if (!seen.includes('story')) errs.push(`TOHUB 아웃트로(이야기 장면)가 없었음 (${seen.join('>')})`);
        console.log(`    · ${c.id} 장면 ${seen.join(' > ')}`);
        continue;
      }
      if (k === 's26check') {
        const s = await page.evaluate(() => { const P = window.__game?.state?.progress ?? {}; return { cleared: !!P.cleared?.s26, done: !!P.flags?.ex_s26_done, boss: (P.bosses ?? []).includes('b_paracel'), chapter: P.chapter ?? 0, seen: (P.seenScripts ?? []).includes('s26_outro') }; });
        if (!s.cleared || !s.done || !s.boss || !s.seen) errs.push(`S26 저장 상태가 이상함 (${JSON.stringify(s)})`);
        if (s.chapter >= 26) errs.push(`S26 외전이 이야기 장을 올림 (chapter ${s.chapter})`);
        console.log(`    · ${c.id} 저장: ${JSON.stringify(s)}`);
        continue;
      }
      if (k === 'rush26') {
        const r = await page.evaluate(async () => {
          const A = await import('/src/scenes/front/arcade.js');
          return { menuFresh: A.menuCourses(false, false, false).includes(18), menu26: A.menuCourses(false, false, true).includes(18), online: A.visibleCourses(true, true).includes(18), local: A.localCourse(18),
            ex: A.exKnown({ meta: {}, state: { progress: { unlocked: ['s26'] } } }, new Set()), san0: A.sanitizeCfg({ kind: 'bossrush', course: 18 }, false, null, false, false).course,
            surv0: A.arenaBosses(false, false, false).includes('b_paracel'), surv26: A.arenaBosses(false, false, true).includes('b_paracel') };
        });
        if (r.menuFresh || !r.menu26 || r.online || !r.local || r.ex || r.san0 !== 0 || r.surv0 || !r.surv26) errs.push(`RUSH26 코스·보스 문 규칙이 이상함 (${JSON.stringify(r)})`);
        await page.evaluate(async () => {
          const g = window.__game, { newGameState } = await import('/src/game/state.js'), A = await import('/src/scenes/front/arcade.js');
          const st = newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' }); st.progress.unlocked = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's26']; g.state = st;
          A.startArcade(g, { kind: 'bossrush', course: 18, preset: 2, diff: 'normal' }, 'kael');
        });
        const t0 = Date.now();
        let st = null;
        while (Date.now() - t0 < Number(d) * 1000) {
          st = await page.evaluate(() => { const g = window.__game, t = g.scenes.find((x) => x.name === 'bossrush'); return { top: g.scenes[g.scenes.length - 1]?.name, course: t?.cfg?.course ?? null, queue: t?.queue ?? null, local: !!t?.localOnly, boss: g.world?.boss?.def?.id ?? null }; });
          if (st.boss) break;
          await page.waitForTimeout(250);
        }
        const want = ['b_chimera', 'b_leviathan', 'b_colossus', 'b_frostqueen', 'b_paracel'];
        if (st?.course !== 18 || JSON.stringify(st.queue) !== JSON.stringify(want) || !st.local || st.boss !== 'b_chimera') errs.push(`RUSH26 코스 18 이 제대로 열리지 않음 (${JSON.stringify(st)})`);
        console.log(`    · ${c.id} 외전 Ⅰ: ${JSON.stringify(st)}`);
        continue;
      }
      if (k === 'wmgate') {
        // ① 새 세이브: 지도에 s26 이 없다 ② 7장을 깬 1부 세이브: 해금 연출 → 노드 · 정보판 · 출발 → s26
        const mk = async (cleared) => page.evaluate(async (n) => {
          const g = window.__game, { newGameState } = await import('/src/game/state.js'), { saves } = await import('/src/core/save.js');
          const st = saves.markDebug ? saves.markDebug(newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' })) : newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
          const ids = Array.from({ length: n }, (_, i) => 's' + String(i + 1).padStart(2, '0'));
          for (const id of ids) st.progress.cleared[id] = { rank: 'A', time: 300 };
          st.progress.unlocked = Array.from({ length: n + 1 }, (_, i) => 's' + String(i + 1).padStart(2, '0'));
          st.progress.chapter = n;
          const h = st.heroes?.[st.charId]; if (h) h.level = 28;
          g.state = st;
          g.go('worldmap', {}, { fade: false });
        }, cleared);
        const wm = () => page.evaluate(() => { const g = window.__game, m = g?.scenes?.find((s) => s.name === 'worldmap'); return m ? { top: g.scenes[g.scenes.length - 1]?.name, page: m.page, reveal: m.reveal?.id ?? null, nodes: (m.pages?.[0]?.nodes ?? []).map((n) => n.id), unl: g.state.progress.unlocked.includes('s26'), rev: !!g.state.progress.flags.s26_revealed } : null; });
        await mk(3); await page.waitForTimeout(1500);
        let a = await wm();
        if (!a || a.nodes.includes('s26') || a.unl || a.reveal) errs.push(`WMGATE 새 세이브(3장)에 s26 이 보임 (${JSON.stringify(a)})`);
        await mk(7);
        const t0 = Date.now();
        let b = null, sawReveal = false;
        while (Date.now() - t0 < Number(d) * 1000) {
          b = await wm();
          if (b?.reveal === 's26') sawReveal = true;
          if (sawReveal && !b?.reveal) break;
          await page.waitForTimeout(sawReveal ? 400 : 200);
          if (sawReveal && Date.now() - t0 > 2500) await tapKey(KEY.jump);
        }
        if (!sawReveal) errs.push(`WMGATE 7장 세이브에 해금 연출(s26)이 없음 (${JSON.stringify(b)})`);
        if (!b?.nodes.includes('s26') || !b.unl || !b.rev) errs.push(`WMGATE 7장 세이브에 s26 노드가 없음 (${JSON.stringify(b)})`);
        // 노드를 골라 정보판을 보고 (스크린샷) 출발 → s26 입장
        await page.evaluate(() => { const m = window.__game.scenes.find((s) => s.name === 'worldmap'); const i = m.nodes.findIndex((n) => n.id === 's26'); if (i >= 0) m.index = i; });
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${out}/${c.id}_${n++}.png` });
        const t1 = Date.now();
        let into = null;
        while (Date.now() - t1 < 25000) {
          into = await page.evaluate(() => { const g = window.__game; return { top: g?.scenes?.[g.scenes.length - 1]?.name, stage: g?.world?.stage?.id ?? null, room: g?.world?.roomId ?? null }; });
          if (into.top === 'stage' && into.stage === 's26') break;
          await tapKey(KEY.enter); await page.waitForTimeout(350);
        }
        if (!(into?.top === 'stage' && into.stage === 's26')) errs.push(`WMGATE 출발해도 s26 에 들어가지 않음 (${JSON.stringify(into)})`);
        console.log(`    · ${c.id} 새 세이브 노드 ${a?.nodes.length} (s26 없음) · 7장 세이브 해금 연출 ${sawReveal ? '봄' : '없음'} → ${JSON.stringify(into)}`);
        continue;
      }
      if (k === 'intro') {
        const t0 = Date.now();
        let st = null, seen = null;
        while (Date.now() - t0 < Number(d) * 1000) {
          st = await page.evaluate(() => { const g = window.__game; const top = g?.scenes?.[g.scenes.length - 1]; return { top: top?.name, cut: !!g?.world?.cutscene, active: !!g?.world?.bossActive, mode: top?.name === 'bossIntro' ? top.mode ?? null : null, t: top?.name === 'bossIntro' ? top.t : null, skipAt: top?.name === 'bossIntro' ? top.skipAt ?? null : null }; });
          if (st.top === 'bossIntro' && !seen) seen = { mode: st.mode, skipAt: st.skipAt };
          if (st.top === 'stage' && st.active && !st.cut) { st.ok = true; break; }
          const key = st.top === 'dialogue' ? KEY.enter : st.top === 'bossIntro' ? KEY.jump : st.top === 'pause' ? KEY.menu : null;
          if (key) { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); }
          await page.waitForTimeout(260);
        }
        if (!st?.ok) errs.push(`NOFIGHT ${d}초 안에 보스전이 시작되지 않음 (top=${st?.top}, cutscene=${st?.cut}, bossActive=${st?.active})`);
        else {
          // 보스 등장 연출 (P4a): 소개는 초상화 카드 또는 이름판, 건너뛴 뒤 레터박스·HUD 숨김·연출 붙잡기가 남지 않는다
          if (seen && seen.mode != null && !['card', 'plate'].includes(seen.mode)) errs.push(`INTRO 소개 모드가 이상함 (${seen.mode})`);
          await page.waitForTimeout(700);
          const left = await page.evaluate(() => { const w = window.__game?.world; return w ? { hud: !!w.hudHidden, lb: Math.round(w.letterbox ?? 0), rv: !!(w.reveal && !w.reveal.done), hold: !!w.reveal?.hold } : null; });
          if (left && (left.hud || left.lb > 1 || left.rv || left.hold)) errs.push(`INTRO 등장 연출이 끝나지 않음 (${JSON.stringify(left)})`);
          if (seen) console.log(`    · ${c.id} 보스 소개 ${seen.mode ?? '?'} → 싸움 ${((Date.now() - t0) / 1000 - 0.7).toFixed(1)}초`);
        }
        continue;
      }
      const key = KEY[k] || k;
      await page.keyboard.down(key); await page.waitForTimeout(Number(d || 0.1) * 1000); await page.keyboard.up(key); await page.waitForTimeout(40);
    }
    const info = await page.evaluate(() => { const g = window.__game; return g ? { scenes: g.scenes.map((s) => s.name).join('>'), room: g.world?.roomId, hp: Math.round(g.world?.player?.hp ?? -1), boss: g.world?.boss?.def?.id, fps: Math.round(g.fps) } : null; });
    const fails = [...new Set(errs)];
    // 보스방 케이스는 보스가 실제로 나와야 한다 (없으면 방 id/보스 등록이 깨진 것 — 오류 없이 통과하지 않게)
    if (c.boss && !info?.boss) fails.push(`NOBOSS world.boss 가 없음 (room=${info?.room}, scenes=${info?.scenes})`);
    else if (c.bossId && info?.boss !== c.bossId) fails.push(`WRONGBOSS world.boss ${info?.boss} ≠ ${c.bossId}`);
    report.push({ id: c.id, info, errs: fails });
  } catch (e) { report.push({ id: c.id, info: null, errs: ['HARNESS ' + e.message] }); }
  await ctx.close();
  const r = report[report.length - 1];
  console.log(`${r.errs.length ? '✗' : '✓'} ${c.id} ${JSON.stringify(r.info)}${r.errs.length ? '\n    ' + r.errs.slice(0, 6).join('\n    ') : ''}`);
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
await browser.close(); await srv.close();
const bad = report.filter((r) => r.errs.length);
console.log(`${report.length - bad.length}/${report.length} 통과${bad.length ? ' — 실패: ' + bad.map((r) => r.id).join(', ') : ''}`);
if (bad.length) process.exitCode = 1;
