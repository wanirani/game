// 요한(b_johan, s27 1부 외전 Ⅱ 보스) 패턴 검사 — 결정적 스텝 (EX-BOSS, docs/specs/ex_s27.md §8.2). tools/probe_johan.html 이 클래스 파일
// (src/game/bosses/e_johan.js)을 바로 불러 가짜 월드에서 돌린다 (데이터는 src/data/bosses_e.js 의 BOSSES_E.b_johan).
//  · 공격 8개 × 페이즈 0/1 × 보통/지옥 = 32판 debugAct → idle(또는 무릎)로 돌아오는지, 판정 지대가 생기는지, **예고 ≥ 0.6초** (역류 물띠 cont 지대 빼고
//    모든 판정 지대의 warn ≥ 0.6 · 처음 판정이 켜지는 시각 ≥ 0.6초), 판정 지대가 경기장 A 안, 무적 풀림, 탐침 기록 0
//  · 판정 배율 = JOHAN_MV 표 · 가장 무거운 한 방 (열쇠 · 장화) ≥ 1.1
//  · 전환 breach (무적 · form2 이름 '검은 물' · 칭호 '요한이었던 것' · breached · 대사 b_johan_breach 한 번 · 곧바로 eelBurst) · debugPhase · 없는 상태 경고
//  · 카운터 창 (keySlam 열쇠 자루 · ballastDrop 장화: 플레이어 한 대 → 무릎 / 수호신 한 대 → 그대로) · 1페이즈 무릎 창 상한 10% ('저항')
//  · 역류: 보스 소유 바람이 불고 (끌림 ≤ 가장 느린 영웅 걷기 70 %) 패턴이 끝나면 꺼짐
//  · 15% 강제 (스토리: 대사 b_johan_last → 긴 무릎 2.5초 / 아케이드: 검은 물 파열, 무릎 없음)
//  · 처치 (스토리: 바퀴 닫힘 · 투구가 떨어짐 · 등불 남음 / 아케이드: 3.0초에 사라짐) · 부활 onReset · 투기장(arena r1 뼈대)에서 경계 안
// 사용: node tools/test_johan.mjs [--shots]   (종료 코드 0 = 모두 통과 · 페이지 오류 0). --shots: /tmp/claude-0/s7/exboss_shots/test_*.png 그림 검토용
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from './serve.mjs';

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = '/tmp/claude-0/s7/exboss_shots';
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 980, height: 640 } });
await ctx.addInitScript(() => { let s = 0x2a7f19c; Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/상태 'nope'/.test(m.text()) && !/Failed to load resource/.test(m.text())) errs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/tools/probe_johan.html?paused=1`);
await page.waitForFunction(() => window.__probe?.done, null, { timeout: 60000 });
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  ' + JSON.stringify(info)}`); };
const shot = async (name, view = null) => {
  if (!SHOTS) return;
  await page.evaluate((v) => { const P = window.__probe; P.view(v === 'boss' ? { cx: P.boss.zx, cy: P.boss.fy - 100, s: 2.0 } : v); P.draw(); }, view);
  await page.locator('canvas').screenshot({ path: `${SHOT_DIR}/test_${name}.png` });
  await page.evaluate(() => window.__probe.view(null));
};

// ── 1) 계약 ──
const names = await page.evaluate(() => { const P = window.__probe; P.build(); const b = P.boss; return { a: b.attackNames(), h: b.helperNames(), t: b.transitionNames(), name: b.def.name, title: b.def.title, f2: b.def.form2, w: b.w, h2: b.h, drops: b.def.drops, room: b.p2.room }; });
check('공격 8개 (열쇠 · 닻 · 장화 · 방울 · 물줄기 · 장어 · 역류 · 호스)', names.a.join() === 'keySlam,anchorChain,ballastDrop,airVolley,sluiceJet,eelBurst,undertow,hoseLash', names.a);
check('보조 stagger · lastLight · 전환 breach', names.h.join() === 'stagger,lastLight' && names.t.join() === 'breach', names);
check(`데이터: 요한 / 돌아오지 못한 수문지기 · form2 검은 물 / 요한이었던 것 · 104×168 · 드롭 u_johan`, names.name === '요한' && names.title === '돌아오지 못한 수문지기' && names.f2?.name === '검은 물' && names.f2?.title === '요한이었던 것' && names.w === 104 && names.h2 === 168 && names.drops?.join() === 'u_johan', names);
{
  // 보스 방 뼈대 = s27 맵 boss 방 (EX-STAGE 의 src/data/maps/s27.js 가 있으면 고체를 비교)
  let same = null;
  try {
    const { ROOMS } = await import('../src/data/maps/s27.js');
    const B = ROOMS?.boss ?? (Array.isArray(ROOMS) ? ROOMS.find((r) => r.id === 'boss' || r.boss) : null);
    if (B?.map) {
      const rows = B.map, sol = new Set(['#', '%', '=']), cells = new Set(), want = new Set();
      rows.forEach((row, y) => [...row].forEach((c, x) => { if (sol.has(c) && x > 0 && x < row.length - 1) cells.add(`${x},${y}`); }));   // 양쪽 벽 열은 PATTERNS.room 에 없다 (s26 과 같다)
      for (const [x0, y0, x1, y1] of names.room.solids) for (let y = y0; y <= y1; y++) for (let x = Math.max(1, x0); x <= Math.min(names.room.w - 2, x1); x++) want.add(`${x},${y}`);
      same = [...want].every((k) => cells.has(k)) && [...cells].every((k) => want.has(k)) && rows.length === names.room.h && rows[0].length === names.room.w;
    }
  } catch { same = null; }
  check(`보스 방 고체 = PATTERNS.room (${same === null ? 's27 맵 아직 없음/형식 다름 — 건너뜀' : same ? '같음' : '다름'})`, same !== false, { same });
}

// ── 2) 공격 × 페이즈 × 보통/지옥 (32판) ──
const MV_SEEN = [];
let n32 = 0;
for (const inferno of [false, true]) {
  for (const ph of [0, 1]) {
    for (const act of names.a) {
      const r = await page.evaluate(({ act, ph, inferno }) => {
        const P = window.__probe;
        P.build({ phase: ph, inferno, story: false });
        P.step(ph ? 7 : 2.5);   // 등장 · 전환의 강제 패턴(eelBurst)이 끝나게
        const b = P.boss, W = P.world;
        while (b.state !== 'idle') P.step(0.1);
        W.player.x = b.zx - b.facing * 330; W.player.noIframes = false;
        const n0 = P.notes.length, pre = new Set(W.entities), seen = new Set();
        const ok = b.debugAct(act);
        const A = b.A;
        let t = 0, back = -1, tele = false, maxHaz = 0, firstOn = null, minWarn = 99, outside = [], hits0 = W.player.hits, mvs = [];
        for (; t < 16; t += 0.05) {
          P.step(0.05);
          const ents = W.entities.filter((e) => !pre.has(e));
          for (const z of ents) {
            if (z.kind !== 'hazard' || z.harmless || seen.has(z)) continue;
            seen.add(z);
            if (!z.data?.cont) minWarn = Math.min(minWarn, z.warn);
            mvs.push(z.attack?.mv);
          }
          for (const z of ents) if (z.kind === 'hazard' && !z.harmless && (z.x + z.w < A.x0 - 12 || z.x > A.x1 + 12 || z.x < A.x0 - 60 || z.x + z.w > A.x1 + 60)) outside.push([z.data?.pool ?? '', Math.round(z.x), Math.round(z.w)]);
          const live = ents.filter((e) => e.kind === 'hazard' && !e.harmless);
          maxHaz = Math.max(maxHaz, live.length);
          if (firstOn === null && live.some((z) => z.on)) firstOn = +(t + 0.05).toFixed(2);
          if (b.telegraph) tele = true;
          if (b.zx < A.x0 || b.zx > A.x1) outside.push(['boss', Math.round(b.zx)]);
          if (b.state !== act) { back = t; break; }
        }
        const wind = b.gim('wind', { create: false });
        return { ok, back: +back.toFixed(2), next: b.state, maxHaz, firstOn, minWarn: +minWarn.toFixed(2), outside: outside.slice(0, 3), tele, hits: W.player.hits - hits0, inv: b.invuln, air: b.airH, notes: P.notes.slice(n0), mvs: [...new Set(mvs)], windOn: !!(wind && (wind.gusting || wind.warning)) };
      }, { act, ph, inferno });
      const tag = `${act} · 페이즈 ${ph}${inferno ? ' · 지옥' : ''}`;
      const ok = r.ok && r.back > 0 && ['idle', 'stagger'].includes(r.next) && r.maxHaz > 0 && r.tele && (r.firstOn === null || r.firstOn >= 0.6) && r.minWarn >= 0.6 && !r.outside.length && !r.notes.length && !r.inv && !r.air && !r.windOn;
      if (ok) n32++;
      check(`${tag}: 돌아옴 (${r.back}초 → ${r.next}) · 판정 ${r.maxHaz} · 예고 ${r.tele ? '켬' : '없음'} · 첫 판정 ${r.firstOn}초 · 최소 warn ${r.minWarn}${r.hits ? ` · 맞음 ${r.hits}` : ''}`, ok, r);
      MV_SEEN.push({ tag, mvs: r.mvs });
    }
  }
}
check(`32판 (8패턴 × 페이즈 0/1 × 보통/지옥) 모두 통과: ${n32}/32`, n32 === 32, { n32 });
// 판정 배율(mv)은 데이터 표 JOHAN_MV (src/data/bosses_e.js) 에서만 — 가장 무거운 한 방(열쇠 · 장화)은 모형 「보스 1타 = 모션 1.2」 근처 (0.9–1.3 배)
{
  const { JOHAN_MV } = await import('../src/data/bosses_e.js');
  const table = new Set(Object.values(JOHAN_MV));
  const stray = MV_SEEN.flatMap((x) => x.mvs.filter((m) => !table.has(m)).map((m) => `${x.tag}: ${m}`));
  const heavy = (act) => Math.max(0, ...MV_SEEN.filter((x) => x.tag.startsWith(act + ' ')).flatMap((x) => x.mvs));
  const hv = { keySlam: heavy('keySlam'), ballastDrop: heavy('ballastDrop'), undertow: heavy('undertow') };
  const all = MV_SEEN.flatMap((x) => x.mvs);
  check(`판정 배율 = JOHAN_MV 표 (밖 ${stray.length}) · 열쇠 ${hv.keySlam} · 장화 ${hv.ballastDrop} · 역류 원 ${hv.undertow} · 가장 낮은 ${Math.min(...all)}`,
    !stray.length && hv.keySlam >= 1.1 && hv.ballastDrop >= 1.1 && hv.undertow >= 0.9 && Math.max(...all) <= 1.3 && Math.min(...all) >= 0.1, { stray: stray.slice(0, 6), hv });
}
if (SHOTS) {
  for (const [act, ph, sec, inf] of [['keySlam', 0, 0.6, 0], ['keySlam', 0, 1.2, 0], ['anchorChain', 0, 0.6, 0], ['anchorChain', 0, 0.95, 0], ['ballastDrop', 0, 1.2, 0], ['ballastDrop', 0, 1.7, 0],
    ['airVolley', 0, 0.7, 0], ['airVolley', 1, 1.8, 0], ['sluiceJet', 0, 0.7, 0], ['sluiceJet', 0, 1.2, 0], ['sluiceJet', 1, 2.2, 0], ['eelBurst', 1, 0.7, 0], ['eelBurst', 1, 1.2, 0],
    ['undertow', 1, 0.6, 0], ['undertow', 1, 2.0, 0], ['undertow', 1, 3.4, 0], ['hoseLash', 1, 0.55, 0], ['hoseLash', 1, 0.8, 0], ['eelBurst', 1, 2.0, 1]]) {
    await page.evaluate(({ act, ph, sec, inf }) => { const P = window.__probe; P.build({ phase: ph, inferno: !!inf, story: true }); P.step(ph ? 7 : 2.5); const b = P.boss; while (b.state !== 'idle' || P.world.dialog) P.step(0.1); P.world.player.x = b.zx - b.facing * 330; b.debugAct(act); P.step(sec); }, { act, ph, sec, inf });
    await shot(`${act}_p${ph}_${sec}${inf ? '_inf' : ''}`);
  }
}

// ── 3) 전환 breach ──
{
  const r = await page.evaluate(() => {
    const P = window.__probe;
    P.build({ story: true }); P.step(2.5);
    const b = P.boss, W = P.world, n0 = P.notes.length;
    while (b.state !== 'idle') P.step(0.1);
    b.hp = Math.floor(b.stats.maxHp * 0.52); P.hit(Math.ceil(b.stats.maxHp * 0.05));
    const st0 = b.state, inv0 = b.invuln, title0 = b.def.title, name0 = b.def.name;
    let sawDlg = null, t = 0;
    for (; t < 8; t += 0.05) { P.step(0.05); if (W.dialog && !sawDlg) sawDlg = W.dialog.id; if (b.state !== 'breach') break; }
    let next = b.state;
    for (let u = 0; u < 3 && next === 'idle'; u += 0.05) { P.step(0.05); next = b.state; }
    return { st0, inv0, title0, name0, title: b.def.title, name: b.def.name, breached: b.breached, sawDlg, next, t: +t.toFixed(2), phase: b.phase, notes: P.notes.slice(n0), eelK: +b.eelK.toFixed(2) };
  });
  check(`전환 breach: 무적 · 이름 '${r.name0}'→'${r.name}' · 칭호 '${r.title}' · 대사 ${r.sawDlg} · 다음 ${r.next}`, r.st0 === 'breach' && r.inv0 && r.title0 === '돌아오지 못한 수문지기' && r.name0 === '요한' && r.title === '요한이었던 것' && r.name === '검은 물' && r.breached && r.sawDlg === 'b_johan_breach' && r.next === 'eelBurst' && r.phase === 1 && !r.notes.length, r);
  await shot('breach_after', 'boss');
}
{
  const r = await page.evaluate(() => { const P = window.__probe; P.build(); P.step(2.5); const b = P.boss; const n0 = P.notes.length; const okNope = b.debugAct('nope'); b.debugPhase(1); P.step(0.2); return { okNope, breached: b.breached, phase: b.phase, title: b.def.title, warn: P.notes.slice(n0).length }; });
  check('없는 상태 debugAct(nope) → false · debugPhase(1) → breached · 칭호 바뀜', r.okNope === false && r.breached && r.phase === 1 && r.title === '요한이었던 것', r);
}

// ── 4) 카운터 창 (열쇠 자루 · 장화) · 수호신 한 대 · 무릎 창 상한 ──
for (const [act, at, part] of [['keySlam', 1.2, 'pKey'], ['ballastDrop', 1.8, null]]) {
  const r = await page.evaluate(({ act, at, part }) => {
    const P = window.__probe;
    const run = (own) => {
      P.build(); P.step(2.5);
      const b = P.boss; while (b.state !== 'idle') P.step(0.1);
      P.world.player.x = b.zx - b.facing * 330;
      b.debugAct(act); P.step(at);
      const win = act === 'keySlam' ? b.keyStuck : b.bootStuck;
      P.hit(5, { part, own });
      P.step(0.05);
      return { win, st: b.state, stunned: b.stunned };
    };
    return { own: run(true), guard: run(false) };
  }, { act, at, part });
  check(`카운터 ${act}: 창 ${r.own.win} · 플레이어 한 대 → ${r.own.st} · 수호신 한 대 → ${r.guard.st}`, r.own.win && r.own.st === 'stagger' && r.guard.st === act, r);
}
{
  const r = await page.evaluate(() => {
    const P = window.__probe;
    P.build(); P.step(2.5); const b = P.boss; while (b.state !== 'idle') P.step(0.1);
    b.debugAct('stagger'); P.step(0.1);
    const hp0 = b.hp; P.hit(b.stats.maxHp); P.step(0.05);
    return { lost: +((hp0 - b.hp) / b.stats.maxHp).toFixed(3), st: b.state };
  });
  check(`1페이즈 무릎 창 상한: 100% 한 방 → ${(r.lost * 100).toFixed(1)}% ('저항')`, Math.abs(r.lost - 0.10) < 0.005, r);
}
// VERIFY-EX (§2.3 확인 2): 1페이즈 쉼 한 번 IDLE_CAP 3% · 공격 패턴 한 번 PAT_CAP 5.5% (여러 대로 나눠 쳐도) · 2페이즈 · 필살은 상한 없음
{
  const r = await page.evaluate(() => {
    const P = window.__probe;
    const lose = (k, n, setup, tags) => {
      P.build(setup); P.step(setup?.phase ? 7 : 2.5); const b = P.boss; while (b.state !== 'idle') P.step(0.1);
      if (k !== 'idle') { b.debugAct(k); P.step(0.05); }
      const hp0 = b.hp, st = b.state;
      for (let i = 0; i < n; i++) { P.hit(Math.ceil(b.stats.maxHp * 0.2), { tags }); }
      return { lost: +((hp0 - b.hp) / b.stats.maxHp).toFixed(3), st };
    };
    return { idle: lose('idle', 3), pat: lose('airVolley', 3), p2idle: lose('idle', 1, { phase: 1 }), ult: lose('idle', 1, undefined, ['ult']) };
  });
  check(`1페이즈 쉼 상한 ${(r.idle.lost * 100).toFixed(1)}% · 패턴 상한 ${(r.pat.lost * 100).toFixed(1)}% · 2페이즈 쉼 ${(r.p2idle.lost * 100).toFixed(1)}% · 필살 ${(r.ult.lost * 100).toFixed(1)}%`,
    r.idle.st === 'idle' && Math.abs(r.idle.lost - 0.03) < 0.003 && r.pat.st === 'airVolley' && Math.abs(r.pat.lost - 0.055) < 0.003 && r.p2idle.lost > 0.15 && r.ult.lost > 0.15, r);
}
// ── 5) 역류 바람: 불고 · 끌림 ≤ 브란 걷기(245)의 70 % · 끝나면 꺼짐 ──
for (const inferno of [false, true]) {
  const r = await page.evaluate((inferno) => {
    const P = window.__probe;
    P.build({ phase: 1, inferno }); P.step(7);
    const b = P.boss, W = P.world; while (b.state !== 'idle') P.step(0.1);
    W.player.x = b.zx - b.facing * 400;
    b.debugAct('undertow');
    let gust = false, maxV = 0, t = 0, x0 = null, drift = 0;
    for (; t < 10; t += 0.05) {
      P.step(0.05);
      const g = b.gim('wind', { create: false });
      if (g?.gusting) { gust = true; maxV = Math.max(maxV, Math.abs(g.v ?? 0)); }
      if (b.state !== 'undertow') break;
    }
    P.step(0.5);
    const g = b.gim('wind', { create: false });
    return { gust, maxV: Math.round(maxV), after: !!(g && (g.gusting || g.warning)), state: b.state };
  }, inferno);
  check(`역류${inferno ? ' (지옥)' : ''}: 물살 ${r.gust ? '켬' : '없음'} · 끌림 최대 ${r.maxV}px/s (≤ 171) · 끝나면 꺼짐 ${!r.after}`, r.gust && r.maxV > 60 && r.maxV <= 171.5 && !r.after, r);
}
// ── 6) 15% 강제 ──
for (const story of [true, false]) {
  const r = await page.evaluate((story) => {
    const P = window.__probe;
    P.build({ phase: 1, story }); P.step(7);
    const b = P.boss, W = P.world; while (b.state !== 'idle' || W.dialog) P.step(0.1);
    b.debugAct('hoseLash'); P.step(0.2);
    b.hp = Math.floor(b.stats.maxHp * 0.16); P.hit(Math.ceil(b.stats.maxHp * 0.02)); P.step(0.05);
    const st = b.state; let dlg = null, longSeen = false, clutch = 0, t = 0, maxHaz = 0;
    for (; t < 10; t += 0.05) { P.step(0.05); if (W.dialog && !dlg) dlg = W.dialog.id; if (b.state === 'stagger' && b.stagLong) { longSeen = true; clutch = Math.max(clutch, b.ps.clutch); } maxHaz = Math.max(maxHaz, W.entities.filter((e) => e.kind === 'hazard' && !e.harmless).length); if (b.state === 'idle') break; }
    return { st, dlg, longSeen, clutch: +clutch.toFixed(2), back: +t.toFixed(2), maxHaz };
  }, story);
  if (story) check(`15% 강제 (스토리): ${r.st} → 대사 ${r.dlg} → 장어 목을 움켜쥠 (${r.clutch}) · 긴 무릎 → ${r.back}초에 idle`, r.st === 'lastLight' && r.dlg === 'b_johan_last' && r.longSeen && r.clutch > 0.5, r);
  else check(`15% 강제 (아케이드): ${r.st} → 검은 물 파열 (판정 ${r.maxHaz}) · 무릎 없음`, r.st === 'lastLight' && !r.dlg && !r.longSeen && r.maxHaz >= 1, r);
  if (story) await shot('last_clutch', 'boss');
}
// ── 7) 처치 ──
for (const story of [true, false]) {
  const r = await page.evaluate((story) => {
    const P = window.__probe;
    P.build({ story }); P.step(2.5);
    const b = P.boss, W = P.world;
    P.kill(); P.step(0.1);
    const banner = W.banner?.sub;
    P.step(1.0);
    const mid = { closeK: +b.closeK.toFixed(2), wheelOn: b.wheelOn };
    P.step(3.9);
    return { banner, mid, dying: +b.dying.toFixed(2), dead: !!b.dead, closeK: +b.closeK.toFixed(2), drainK: +b.drainK.toFixed(2), helmOff: +b.helmOff.toFixed(2), lampK: +b.lampK.toFixed(2), vanishK: +b.vanishK.toFixed(2), breached: b.breached, wheel: b.hasWheel() };
  }, story);
  if (story) check(`처치 (스토리): '${r.banner}' · 바퀴 닫힘 ${r.closeK} · 검은 물 빠짐 ${r.drainK} · 투구 떨어짐 ${r.helmOff} · 등불 ${r.lampK}`, r.banner === '검은 물 격파!' && !r.dead && r.dying > 0 && r.mid.wheelOn && r.closeK >= 0.99 && r.drainK >= 0.99 && r.helmOff >= 0.99 && r.lampK > 0.5 && r.breached && r.wheel, r);
  else check(`처치 (아케이드): 3.0초에 사라짐 (vanishK ${r.vanishK})`, r.dead && r.vanishK >= 0.99, r);
}
// ── 8) 부활 onReset ──
{
  const r = await page.evaluate(() => {
    const P = window.__probe;
    P.build({ phase: 1 }); P.step(7);
    const b = P.boss, W = P.world; while (b.state !== 'idle') P.step(0.1);
    b.debugAct('undertow'); P.step(1.5);
    const tide0 = W.entities.filter((e) => e.data?.pool === 'undertow' && !e.dead).length;
    const g0 = b.gim('wind', { create: false }); const gust0 = !!(g0 && (g0.gusting || g0.warning));
    P.deathReset(); P.step(0.2);
    const g = b.gim('wind', { create: false });
    return { tide0, gust0, phase: b.phase, breached: b.breached, title: b.def.title, name: b.def.name, tide: W.entities.filter((e) => e.data?.pool === 'undertow' && !e.dead).length, gust: !!(g && (g.gusting || g.warning)), state: b.state, eelK: b.eelK };
  });
  check(`부활: 물띠 ${r.tide0}→${r.tide} · 물살 ${r.gust0}→${r.gust} · 페이즈 ${r.phase} · 창 ${r.breached ? '터짐' : '온전'} · '${r.name} / ${r.title}'`, r.tide0 > 0 && r.gust0 && r.tide === 0 && !r.gust && r.phase === 0 && !r.breached && r.eelK === 0 && r.title === '돌아오지 못한 수문지기' && r.name === '요한', r);
}
// ── 9) 투기장 (arena r1 뼈대) ──
{
  const r = await page.evaluate((acts) => {
    const P = window.__probe, out = [];
    for (const ph of [0, 1]) for (const inferno of [false, true]) for (const act of acts) {
      P.build({ phase: ph, room: 'arena', inferno }); P.step(ph ? 7 : 2.5);
      const b = P.boss, W = P.world, A = b.A, pre = new Set(W.entities);
      while (b.state !== 'idle') P.step(0.1);
      b.debugAct(act);
      for (let t = 0; t < 12 && b.state === act; t += 0.1) {
        P.step(0.1);
        for (const z of W.entities) if (!pre.has(z) && z.kind === 'hazard' && !z.harmless && (z.x + z.w < A.x0 - 12 || z.x > A.x1 + 12 || z.x < A.x0 - 60 || z.x + z.w > A.x1 + 60)) out.push(`${act}/${ph}${inferno ? 'i' : ''}: ${Math.round(z.x)}+${Math.round(z.w)}`);
        if (b.zx < A.x0 || b.zx > A.x1) out.push(`${act}/${ph}: boss ${Math.round(b.zx)}`);
      }
      if (b.state === act) out.push(`${act}/${ph}: 안 끝남`);
    }
    P.build({ room: 'boss' });
    return { out: [...new Set(out)].slice(0, 6), notes: P.notes.length, hasWheel: (() => { P.build({ room: 'arena' }); const h = P.boss.hasWheel(); P.build(); return h; })() };
  }, names.a);
  check(`투기장: 패턴 8개 × 페이즈 0/1 × 보통/지옥 가 경계 안 · 수문 바퀴 없음`, !r.out.length && !r.hasWheel, r);
}
if (SHOTS) {
  await page.evaluate(() => { const P = window.__probe; P.build(); P.step(2.6); });
  await shot('pose_p0_idle', 'boss');
  await page.evaluate(() => { const P = window.__probe; P.build({ phase: 1 }); P.step(7); const b = P.boss; while (b.state !== 'idle') P.step(0.1); P.step(0.5); });
  await shot('pose_p1_idle', 'boss');
  await page.evaluate(() => { const P = window.__probe; P.build({ phase: 1 }); P.step(7); P.boss.debugAct('stagger'); P.step(0.6); });
  await shot('pose_p1_stagger', 'boss');
  await page.evaluate(() => { const P = window.__probe; P.build({ story: true }); P.step(2.5); P.kill(); P.step(4.0); });
  await shot('dead_story', 'boss');
}

const notes = await page.evaluate(() => window.__probe.notes);
check(`페이지 오류 0 (콘솔 오류·경고 ${errs.length} · 탐침 기록 ${notes.length})`, !errs.length && !notes.length, { errs: errs.slice(0, 8), notes: notes.slice(0, 8) });
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 통과`);
await browser.close();
srv.close?.();
process.exit(bad.length ? 1 : 0);
