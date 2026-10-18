// 파라켈(b_paracel, s26 외전 보스) 패턴 검사 — 결정적 스텝 (CH26-A, docs/specs/ex_s26.md §8). 등록 전이라 레지스트리를 거치지 않고
// tools/probe_paracel.html 이 클래스 파일(src/game/bosses/e_paracel.js)을 바로 불러 가짜 월드에서 돌린다.
//  · 공격 8개 × 페이즈 0/1 × 보통/지옥 debugAct → idle(또는 무릎)로 돌아오는지, 판정 지대·소환이 생기는지, **예고 ≥ 0.6초** (앞 예고를 잇는 잔불·해일 cont 지대 빼고
//    모든 판정 지대의 warn ≥ 0.6 · 처음 판정이 켜지는 시각 ≥ 0.6초), 판정 지대가 경기장 A 안, 오류 0
//  · 전환 fuse (무적 · form2 칭호 '금이 되어 가는 몸' · 같은 이름 · fused · 대사 b_paracel_fuse 한 번 · 곧바로 goldFloor) · debugPhase · 없는 상태 경고
//  · 배양조 깨기 (플레이어 한 대 → 무릎 · 소환 없음 / 수호신 한 대 → 그대로) · 해일 카운터 (솟은 몸에 한 대 → 무릎) · 1페이즈 무릎 창 상한 10% ('저항')
//  · 15% 강제 (스토리: 대사 b_paracel_last → 긴 무릎 2.5초 / 아케이드: 금빛 파열, 무릎 없음) · 처치 (스토리: 금 조각상으로 남음 / 아케이드: 3.0초에 금가루로 사라짐)
//  · 부활 onReset (1페이즈 · 배양조 · 칭호 '수은의 연금술사' · 웅덩이·소환 정리) · 소환 상한 (≤ 3 · 지옥 ≤ 4) · 투기장(arena r1 뼈대)에서 경계 안
// 사용: node tools/test_paracel.mjs [--shots]   (종료 코드 0 = 모두 통과 · 페이지 오류 0). --shots: /tmp/claude-0/s5/ch26/shots/test_*.png 그림 검토용
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from './serve.mjs';

const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = '/tmp/claude-0/s5/ch26/shots';
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 980, height: 640 } });
await ctx.addInitScript(() => { let s = 0x5c4a7e1; Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/상태 'nope'/.test(m.text()) && !/Failed to load resource/.test(m.text())) errs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/tools/probe_paracel.html?paused=1`);
await page.waitForFunction(() => window.__probe?.done, null, { timeout: 60000 });
if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  ' + JSON.stringify(info)}`); };
const shot = async (name, view = null) => {
  if (!SHOTS) return;
  await page.evaluate((v) => { const P = window.__probe; P.view(v === 'boss' ? { cx: P.boss.zx, cy: P.boss.fy - 100, s: 2.2 } : v); P.draw(); }, view);
  await page.locator('canvas').screenshot({ path: `${SHOT_DIR}/test_${name}.png` });
  await page.evaluate(() => window.__probe.view(null));
};

// ── 1) 계약 ──
const names = await page.evaluate(() => { const P = window.__probe; P.build(); return { a: P.boss.attackNames(), h: P.boss.helperNames(), t: P.boss.transitionNames() }; });
check('공격 8개 (삼원소 플라스크 · 수은 웅덩이 · 배양조 · 접합 팔 · 불타는 렌즈 · 황금 변성 · 수은 해일 · 금빛 약비)', names.a.join() === 'flaskVolley,mercuryPool,tankBrood,graftLash,burningGlass,goldFloor,mercuryWave,elixirRain', names);
check('보조 stagger · lastDose · 전환 fuse', names.h.join() === 'stagger,lastDose' && names.t.join() === 'fuse', names);

// ── 2) 공격 × 페이즈 × 보통/지옥 ──
for (const inferno of [false, true]) {
  for (const ph of [0, 1]) {
    for (const act of names.a) {
      const r = await page.evaluate(({ act, ph, inferno }) => {
        const P = window.__probe;
        P.build({ phase: ph, inferno, story: false });
        P.step(ph ? 6 : 2);   // 등장 · 전환의 강제 패턴(goldFloor)이 끝나게
        const b = P.boss, W = P.world;
        while (b.state !== 'idle') P.step(0.1);
        W.player.x = b.zx - b.facing * 330; W.player.noIframes = false;
        const n0 = P.notes.length, pre = new Set(W.entities), seen = new Set();
        const mins0 = (b._cMinions ?? []).filter((e) => !e.dead).length;
        const ok = b.debugAct(act);
        const A = b.A;
        let t = 0, back = -1, tele = false, maxHaz = 0, firstOn = null, minWarn = 99, outside = [], mins = 0, hits0 = W.player.hits;
        for (; t < 16; t += 0.05) {
          P.step(0.05);
          const ents = W.entities.filter((e) => !pre.has(e));
          for (const z of ents) {
            if (z.kind !== 'hazard' || z.harmless || seen.has(z)) continue;
            seen.add(z);
            if (!z.data?.cont) minWarn = Math.min(minWarn, z.warn);
            if (z.x + z.w < A.x0 - 12 || z.x > A.x1 + 12) outside.push([Math.round(z.x), Math.round(z.w)]);
          }
          const live = ents.filter((e) => e.kind === 'hazard' && !e.harmless);
          maxHaz = Math.max(maxHaz, live.length);
          if (firstOn === null && live.some((z) => z.on)) firstOn = +(t + 0.05).toFixed(2);
          mins = Math.max(mins, (b._cMinions ?? []).filter((e) => !e.dead).length - mins0);
          if (b.telegraph) tele = true;
          if (b.state !== act) { back = t; break; }
        }
        return { ok, back: +back.toFixed(2), next: b.state, maxHaz, firstOn, minWarn: +minWarn.toFixed(2), outside: outside.slice(0, 3), tele, mins, hits: W.player.hits - hits0, inv: b.invuln, sunk: b.sunk, notes: P.notes.slice(n0) };
      }, { act, ph, inferno });
      const tag = `${act} · 페이즈 ${ph}${inferno ? ' · 지옥' : ''}`;
      check(`${tag}: 돌아옴 (${r.back}초 → ${r.next}) · 판정 ${r.maxHaz}${r.mins ? ` · 소환 ${r.mins}` : ''} · 예고 ${r.tele ? '켬' : '없음'} · 첫 판정 ${r.firstOn}초 · 최소 warn ${r.minWarn}`,
        r.ok && r.back > 0 && ['idle', 'stagger'].includes(r.next) && (r.maxHaz > 0 || r.mins > 0) && r.tele && (r.firstOn === null || r.firstOn >= 0.6) && r.minWarn >= 0.6 && !r.outside.length && !r.notes.length && !r.inv && !r.sunk, r);
    }
  }
}
if (SHOTS) {
  for (const [act, ph, sec, inf] of [['flaskVolley', 0, 0.9, 0], ['flaskVolley', 0, 1.45, 0], ['mercuryPool', 0, 1.2, 0], ['tankBrood', 0, 0.6, 0], ['tankBrood', 0, 1.1, 0], ['graftLash', 1, 0.5, 0], ['graftLash', 1, 0.66, 0], ['burningGlass', 1, 0.9, 0], ['burningGlass', 1, 1.3, 0],
    ['goldFloor', 1, 0.9, 0], ['goldFloor', 1, 1.25, 0], ['goldFloor', 1, 2.3, 0], ['mercuryWave', 1, 0.5, 0], ['mercuryWave', 1, 1.1, 0], ['mercuryWave', 1, 2.2, 0], ['elixirRain', 1, 1.2, 0], ['elixirRain', 1, 1.6, 1]]) {
    await page.evaluate(({ act, ph, sec, inf }) => { const P = window.__probe; P.build({ phase: ph, inferno: !!inf, story: false }); P.step(ph ? 6 : 2); const b = P.boss; while (b.state !== 'idle') P.step(0.1); P.world.player.x = b.zx - b.facing * 330; b.debugAct(act); P.step(sec); }, { act, ph, sec, inf });
    await shot(`${act}_p${ph}_${sec}${inf ? '_inf' : ''}`);
  }
}

// ── 3) 전환 fuse ──
{
  const r = await page.evaluate(() => {
    const P = window.__probe;
    P.build({ story: true }); P.step(2);
    const b = P.boss, W = P.world, n0 = P.notes.length;
    b.hp = Math.floor(b.stats.maxHp * 0.52); P.hit(Math.ceil(b.stats.maxHp * 0.05));
    const st0 = b.state, inv0 = b.invuln, title0 = b.def.title;
    let sawDlg = null, t = 0;
    for (; t < 8; t += 0.05) { P.step(0.05); if (W.dialog && !sawDlg) sawDlg = W.dialog.id; if (b.state !== 'fuse') break; }
    let next = b.state;
    for (let u = 0; u < 3 && next === 'idle'; u += 0.05) { P.step(0.05); next = b.state; }   // 쉼(0.5초) 뒤 강제 패턴
    const seen = [...W.state.progress.seenScripts];
    return { st0, inv0, title0, title: b.def.title, name: b.def.name, fused: b.fused, sawDlg, next, t: +t.toFixed(2), seen, phase: b.phase, notes: P.notes.slice(n0) };
  });
  check(`전환 fuse: 무적 · 칭호 '${r.title}' · 이름 '${r.name}' · 대사 ${r.sawDlg} · 다음 ${r.next}`, r.st0 === 'fuse' && r.inv0 && r.title0 === '수은의 연금술사' && r.title === '금이 되어 가는 몸' && r.name === '파라켈 박사' && r.fused && r.sawDlg === 'b_paracel_fuse' && r.next === 'goldFloor' && r.phase === 1 && !r.notes.length, r);
  await shot('fuse_after', 'boss');
}
{
  const r = await page.evaluate(() => { const P = window.__probe; P.build(); P.step(2); const b = P.boss; const n0 = P.notes.length; const okNope = b.debugAct('nope'); b.debugPhase(1); P.step(0.2); return { okNope, fused: b.fused, phase: b.phase, title: b.def.title, warn: P.notes.slice(n0).length }; });
  check('없는 상태 debugAct(nope) → false · debugPhase(1) → fused · 칭호 바뀜', r.okNope === false && r.fused && r.phase === 1 && r.title === '금이 되어 가는 몸', r);
}

// ── 4) 배양조 깨기 · 수호신 한 대 · 무릎 창 상한 ──
{
  const r = await page.evaluate(() => {
    const P = window.__probe;
    const run = (own) => {
      P.build(); P.step(2);
      const b = P.boss; while (b.state !== 'idle') P.step(0.1);
      b.debugAct('tankBrood'); P.step(0.3);
      const hp0 = b.hp;
      P.hit(5, { part: 'pTank', own });
      P.step(0.05);
      const st = b.state;
      P.step(1.2);
      return { st, after: b.state, mins: (b._cMinions ?? []).filter((e) => !e.dead).length, dmg: hp0 - b.hp };
    };
    const own = run(true), guard = run(false);
    // 무릎 창 상한: 무릎 중 최대 체력 100% 한 방 → 10% 만
    P.build(); P.step(2); const b = P.boss; while (b.state !== 'idle') P.step(0.1);
    b.debugAct('stagger'); P.step(0.1);
    const hp0 = b.hp; P.hit(b.stats.maxHp); P.step(0.05);
    const lost = (hp0 - b.hp) / b.stats.maxHp;
    return { own, guard, lost: +lost.toFixed(3), stAfterCap: b.state };
  });
  check(`배양조: 플레이어 한 대 → ${r.own.st} (소환 ${r.own.mins}) · 수호신 한 대 → ${r.guard.st} (소환 ${r.guard.mins})`, r.own.st === 'stagger' && r.own.mins === 0 && r.guard.st === 'tankBrood' && r.guard.mins >= 1, r);
  check(`1페이즈 무릎 창 상한: 100% 한 방 → ${(r.lost * 100).toFixed(1)}% ('저항')`, Math.abs(r.lost - 0.10) < 0.005, r);
}
// ── 5) 해일 카운터 ──
{
  const r = await page.evaluate(() => {
    const P = window.__probe;
    P.build({ phase: 1 }); P.step(6);
    const b = P.boss; while (b.state !== 'idle') P.step(0.1);
    const hp0 = b.hp; b.debugAct('mercuryWave');
    let sunkSeen = false, partsWhileSunk = -1, t = 0;
    for (; t < 6; t += 0.05) { P.step(0.05); if (b.sunk) { sunkSeen = true; partsWhileSunk = b.hitParts().length; } if (b.exposed) break; }
    const exposedAt = +t.toFixed(2);
    P.hit(10); P.step(0.05);
    return { sunkSeen, partsWhileSunk, exposedAt, st: b.state, zx: Math.round(b.zx), A: [Math.round(b.A.x0), Math.round(b.A.x1)], hp: hp0 - b.hp };
  });
  check(`수은 해일: 녹은 동안 판정 ${r.partsWhileSunk} · ${r.exposedAt}초에 솟음 · 한 대 → ${r.st} · 위치 ${r.zx} (A ${r.A})`, r.sunkSeen && r.partsWhileSunk === 0 && r.st === 'stagger' && r.zx > r.A[0] && r.zx < r.A[1], r);
}
// ── 6) 15% 강제 ──
for (const story of [true, false]) {
  const r = await page.evaluate((story) => {
    const P = window.__probe;
    P.build({ phase: 1, story }); P.step(6);
    const b = P.boss, W = P.world; while (b.state !== 'idle' || W.dialog) P.step(0.1);
    b.debugAct('graftLash'); P.step(0.2);
    b.hp = Math.floor(b.stats.maxHp * 0.16); P.hit(Math.ceil(b.stats.maxHp * 0.02)); P.step(0.05);
    const st = b.state; let dlg = null, longSeen = false, t = 0, maxHaz = 0;
    for (; t < 10; t += 0.05) { P.step(0.05); if (W.dialog && !dlg) dlg = W.dialog.id; if (b.state === 'stagger' && b.stagLong) longSeen = true; maxHaz = Math.max(maxHaz, W.entities.filter((e) => e.kind === 'hazard' && !e.harmless).length); if (b.state === 'idle') break; }
    return { st, dlg, longSeen, back: +t.toFixed(2), maxHaz, goldK: +b.goldK.toFixed(2) };
  }, story);
  if (story) check(`15% 강제 (스토리): ${r.st} → 대사 ${r.dlg} → 긴 무릎 → ${r.back}초에 idle`, r.st === 'lastDose' && r.dlg === 'b_paracel_last' && r.longSeen, r);
  else check(`15% 강제 (아케이드): ${r.st} → 금빛 파열 (판정 ${r.maxHaz}) · 무릎 없음`, r.st === 'lastDose' && !r.dlg && !r.longSeen && r.maxHaz >= 1, r);
}
// ── 7) 처치 ──
for (const story of [true, false]) {
  const r = await page.evaluate((story) => {
    const P = window.__probe;
    P.build({ story }); P.step(2);
    const b = P.boss, W = P.world;
    P.kill();
    const banner = W.banner?.sub;
    P.step(5);
    return { banner, dying: +b.dying.toFixed(2), dead: !!b.dead, goldK: +b.goldK.toFixed(2), vanishK: +b.vanishK.toFixed(2), fused: b.fused, title: b.def.title };
  }, story);
  if (story) check(`처치 (스토리): '${r.banner}' · 금 조각상으로 남음 (goldK ${r.goldK})`, r.banner === '파라켈 박사 격파!' && !r.dead && r.dying > 0 && r.goldK >= 0.99 && r.fused, r);
  else check(`처치 (아케이드): 3.0초에 금가루로 사라짐 (vanishK ${r.vanishK})`, r.dead && r.vanishK >= 0.99, r);
  if (story) await shot('dead_statue', 'boss');
}
// ── 8) 부활 onReset ──
{
  const r = await page.evaluate(() => {
    const P = window.__probe;
    P.build({ phase: 1 }); P.step(6);
    const b = P.boss, W = P.world; while (b.state !== 'idle') P.step(0.1);
    b.debugAct('mercuryPool'); P.step(1.2);
    const pools0 = W.entities.filter((e) => e.data?.pool && !e.dead).length;
    b.debugAct('tankBrood'); P.step(1.2);
    const mins0 = (b._cMinions ?? []).filter((e) => !e.dead).length;
    P.deathReset(); P.step(0.2);
    return { pools0, mins0, phase: b.phase, fused: b.fused, title: b.def.title, pools: W.entities.filter((e) => e.data?.pool && !e.dead).length, mins: (b._cMinions ?? []).filter((e) => !e.dead).length, state: b.state, goldK: +b.goldK.toFixed(2) };
  });
  check(`부활: 웅덩이 ${r.pools0}→${r.pools} · 소환 ${r.mins0}→${r.mins} · 페이즈 ${r.phase} · 배양조 · 칭호 '${r.title}'`, r.pools0 > 0 && r.mins0 > 0 && r.pools === 0 && r.mins === 0 && r.phase === 0 && !r.fused && r.title === '수은의 연금술사', r);
}
// ── 9) 소환 상한 ──
for (const inferno of [false, true]) {
  const r = await page.evaluate((inferno) => {
    const P = window.__probe;
    P.build({ inferno }); P.step(2);
    const b = P.boss; let max = 0;
    for (let i = 0; i < 4; i++) { while (b.state !== 'idle') P.step(0.1); b.debugAct('tankBrood'); for (let t = 0; t < 2; t += 0.1) { P.step(0.1); max = Math.max(max, (b._cMinions ?? []).filter((e) => !e.dead).length); } }
    return { max };
  }, inferno);
  check(`소환 상한 ${inferno ? '(지옥) ≤ 4' : '≤ 3'}: ${r.max}`, r.max >= 2 && r.max <= (inferno ? 4 : 3), r);
}
// ── 10) 투기장 (arena r1 뼈대) ──
{
  const r = await page.evaluate((acts) => {
    const P = window.__probe, out = [];
    for (const ph of [0, 1]) for (const act of acts) {
      P.build({ phase: ph, room: 'arena' }); P.step(ph ? 6 : 2);
      const b = P.boss, W = P.world, A = b.A, pre = new Set(W.entities);
      while (b.state !== 'idle') P.step(0.1);
      b.debugAct(act);
      for (let t = 0; t < 12 && b.state === act; t += 0.1) {
        P.step(0.1);
        for (const z of W.entities) if (!pre.has(z) && z.kind === 'hazard' && !z.harmless && (z.x + z.w < A.x0 - 12 || z.x > A.x1 + 12)) out.push(`${act}/${ph}: ${Math.round(z.x)}`);
        if (b.zx < A.x0 || b.zx > A.x1) out.push(`${act}/${ph}: boss ${Math.round(b.zx)}`);
      }
    }
    P.build({ room: 'boss' });
    return { out: [...new Set(out)].slice(0, 6), notes: P.notes.length };
  }, names.a);
  check(`투기장: 패턴 8개 × 페이즈 0/1 가 경계 안`, !r.out.length, r);
}
if (SHOTS) {
  await page.evaluate(() => { const P = window.__probe; P.build(); P.step(2.5); });
  await shot('pose_p0_idle', 'boss');
  await page.evaluate(() => { const P = window.__probe; P.build({ phase: 1 }); P.step(6); const b = P.boss; while (b.state !== 'idle') P.step(0.1); P.step(0.5); });
  await shot('pose_p1_idle', 'boss');
  await page.evaluate(() => { const P = window.__probe; P.build(); P.step(2); P.boss.debugAct('tankBrood'); P.step(0.7); });
  await shot('pose_p0_tank', 'boss');
  await page.evaluate(() => { const P = window.__probe; P.build({ phase: 1 }); P.step(6); P.boss.debugAct('stagger'); P.step(0.6); });
  await shot('pose_p1_stagger', 'boss');
}

const notes = await page.evaluate(() => window.__probe.notes);
check(`페이지 오류 0 (콘솔 오류·경고 ${errs.length} · 탐침 기록 ${notes.length})`, !errs.length && !notes.length, { errs: errs.slice(0, 8), notes: notes.slice(0, 8) });
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 통과`);
await browser.close();
srv.close?.();
process.exit(bad.length ? 1 : 0);
