// 아르겐(b_argen, s21 외전 보스) 패턴 검사 — 결정적 스텝 (EX-BOSS). 갤러리(tools/gallery_bosses_e.html, 대역 기믹)에서
//  · 모든 공격 패턴 × 페이즈 0/1/2 debugAct → idle 로 돌아오는지, 판정 개체·탄이 생기는지, 오류 0
//  · 전환 상태(corrupt/awaken) debugAct, debugPhase(n), 보조(stagger), 없는 상태, 사망→부활(onReset), 처치(정화 5초), 적 정지
//  · 보스별 검사: 결정 수(1페이즈 10 → 2페이즈 15, 핵 껍질 깨짐 → 3페이즈 8 → 정화 0), 핵 판정(2페이즈+ · 0.75 / 크게 열리면 0.45),
//    날개 돌풍(바람 대역 경고→돌풍, 플레이어를 밀어내는 방향), 숨결(선분 판정이 먼 쪽 → 가슴 앞으로 쓸림, 3페이즈 되쓸기),
//    꼬리(1페이즈 낮은 띠 1번 · 2페이즈+ 높은 띠 되휩쓸기), 사라졌다 내리꽂기(숨은 동안 무적·판정 없음 · 기절 중 핵 0.45),
//    핵 노출(고리 셋 · 핵에 5% 넣으면 stagger), 은빛 비행(낙뢰 기둥 · 파편), 정화 배너, 드롭 아이템 정의
// 사용: node tools/test_argen.mjs   (종료 코드 0 = 모두 통과 · 페이지 오류 0)
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';

const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/상태 'nope'/.test(m.text())) errs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/tools/gallery_bosses_e.html?id=b_argen&paused=1`);
await page.waitForFunction(() => window.__gal?.done, null, { timeout: 60000 });
await page.evaluate(() => { window.__gal.O.paused = true; });

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) console.log('✗', name, JSON.stringify(info)); };
const ID = 'b_argen';

// ── 1) 공격 패턴 × 페이즈 ──
const attacks = await page.evaluate((id) => { const G = window.__gal; G.build(id); return G.boss.attackNames(); }, ID);
check('공격 패턴 8개 (숨결·급강하·돌풍·결정 비·꼬리·내리꽂기·핵 노출·은빛 비행)', attacks.length === 8, attacks);
for (const ph of [0, 1, 2]) {
  for (const act of attacks) {
    const r = await page.evaluate(({ id, ph, act }) => {
      const G = window.__gal;
      G.build(id, { phase: ph });
      G.step(4.5);   // 전환의 강제 패턴(coreBurst/storm)이 끝나게
      const b = G.boss, W = G.world;
      const n0 = G.notes.length;
      const ok = b.debugAct(act);
      const st0 = b.state;
      let maxHaz = 0, maxProj = 0, tele = false, t = 0, back = -1, hits0 = W.player.hits, hidden = false;
      for (; t < 14; t += 0.05) {
        G.step(0.05);
        const ents = G.world.entities;
        maxHaz = Math.max(maxHaz, ents.filter((e) => e.kind === 'hazard' && !e.harmless).length);
        maxProj = Math.max(maxProj, ents.filter((e) => e.kind === 'projectile').length);
        if (b.telegraph) tele = true;
        if (b.hidden) hidden = true;
        if (b.state !== act) { back = t; break; }
      }
      return { ok, st0, back: +back.toFixed(2), next: b.state, phase: b.phase, maxHaz, maxProj, tele, hits: W.player.hits - hits0, hidden, inv: b.invuln, notes: G.notes.slice(n0) };
    }, { id: ID, ph, act });
    check(`P${ph + 1} ${act}`, r.ok && r.st0 === act && r.back > 0 && r.phase === ph && !r.notes.length && r.maxHaz + r.maxProj > 0 && !r.inv, r);
    results[results.length - 1].summary = `P${ph + 1} ${act.padEnd(10)} → ${String(r.back).padStart(5)}s 판정 ${r.maxHaz} 탄 ${r.maxProj} 예고 ${r.tele ? 'O' : '-'} 피격 ${r.hits}${r.hidden ? ' 숨음' : ''}`;
  }
}

// ── 2) 전환 · debugPhase · 보조 · 없는 상태 ──
const trans = await page.evaluate((id) => { const G = window.__gal; G.build(id); return { tr: G.boss.transitionNames(), help: G.boss.helperNames() }; }, ID);
check('전환 상태 corrupt · awaken', trans.tr.join() === 'corrupt,awaken', trans);
for (const [i, s] of trans.tr.entries()) {
  const r = await page.evaluate(({ id, s }) => {
    const G = window.__gal; G.build(id); G.step(0.3);
    const b = G.boss, n0 = G.notes.length;
    const ok = b.debugAct(s);
    const st0 = b.state, inv0 = b.invuln;
    G.step(3.0);
    return { ok, st0, inv0, phase: b.phase, after: b.state, inv: b.invuln, dmg: b.dmg, crys: b.crys.filter((c) => c.alive).length, coreBase: b.coreBase, silverK: b.silverK, name: b.def.name, title: b.def.title, notes: G.notes.slice(n0) };
  }, { id: ID, s });
  check(`전환 ${s}`, r.ok && r.st0 === s && r.inv0 && r.phase === i + 1 && r.after !== s && !r.inv && r.dmg === i + 1 && !r.notes.length, r);
  if (s === 'awaken') check('awaken: 칭호 교체(form2) · 은빛 0.45', r.title === '은빛을 되찾는 용' && r.silverK >= 0.45, { title: r.title, silver: r.silverK });
}
const crysByPhase = [];
for (const n of [0, 1, 2]) {
  const r = await page.evaluate(({ id, n }) => { const G = window.__gal; const n0 = G.notes.length; G.build(id, { phase: n }); G.step(2.5); const b = G.boss; return { phase: b.phase, dmg: b.dmg, inv: b.invuln, crys: b.crys.filter((c) => c.alive).length, shell: b.crys.find((c) => c.shell)?.alive, coreBase: b.coreBase, coreParts: b.hitParts().includes(b.pCore), notes: G.notes.slice(n0) }; }, { id: ID, n });
  crysByPhase.push(r.crys);
  check(`debugPhase(${n})`, r.phase === n && r.dmg === n && !r.inv && !r.notes.length, r);
  if (n === 0) check('1페이즈: 핵은 결정 껍질 아래 (판정 부위 아님)', r.shell === true && r.coreBase === 0 && !r.coreParts, r);
  if (n >= 1) check(`${n + 1}페이즈: 껍질이 깨지고 핵이 판정 부위`, r.shell === false && r.coreBase > 0 && r.coreParts, r);
}
check('결정 수 10 → 15 → 8 (2페이즈 자람 · 3페이즈 깨짐)', crysByPhase.join() === '10,15,8', crysByPhase);
for (const s of [...trans.help, 'idle']) {
  const r = await page.evaluate(({ id, s }) => { const G = window.__gal; G.build(id, { phase: 1 }); G.step(4.5); const b = G.boss, n0 = G.notes.length; const ok = b.debugAct(s); const st0 = b.state; G.step(3.2); return { ok, st0, after: b.state, notes: G.notes.slice(n0) }; }, { id: ID, s });
  check(`보조 ${s}`, r.ok && (s === 'idle' ? r.st0 === 'idle' : r.st0 === s && r.after !== s) && !r.notes.length, r);
}
check('debugAct(없는 상태) → false', (await page.evaluate((id) => { const G = window.__gal; G.build(id); return G.boss.debugAct('nope'); }, ID)) === false, null);

// ── 3) 패턴별 검사 ──
{
  const r = await page.evaluate((id) => {
    const G = window.__gal, out = {}, n0 = G.notes.length;
    // 날개 돌풍: 바람 대역 경고 → 돌풍, 방향 = 플레이어 쪽(밀어낸다), 2페이즈+ 핵 노출 · 공허 파편
    G.build(id, { phase: 1 }); G.step(4.5);
    let b = G.boss; const p = G.world.player;
    let shot = 0; const sh = b.shoot.bind(b); b.shoot = (o) => { shot++; return sh(o); };
    b.debugAct('gust'); G.step(0.2);
    const w = b._cStandIns.wind;
    out.gust0 = { phase: w.phase, dir: w.dir, want: Math.sign(p.cx - b.zx) };
    G.step(0.5); out.gust0.core = b.pCore.defMul;   // 날개를 드는 동안 핵이 열린다 (자세 보간 ≈0.4초)
    G.step(0.5); out.gust1 = { phase: w.phase };
    G.step(1.6); out.blades = shot;
    // 숨결: 선분 판정, 끝점이 먼 쪽 바닥에서 가슴 앞으로 (3페이즈 되쓸기)
    for (const ph of [0, 2]) {
      G.build(id, { phase: ph }); G.step(ph ? 7 : 0.5);
      b = G.boss; b.debugAct('breath');
      const xs = []; let line = null;
      for (let t = 0; t < 4.2; t += 0.1) { G.step(0.1); const z = G.world.entities.find((e) => e.kind === 'hazard' && e.line && !e.harmless); if (z) { line = true; xs.push(Math.round(z.line.x1)); } }
      const f = b.br?.f ?? Math.sign(xs[xs.length - 1] - xs[0]) * -1;
      out['breath' + ph] = { line, n: xs.length, first: xs[0], min: Math.min(...xs), max: Math.max(...xs), last: xs[xs.length - 1], zx: Math.round(b.zx) };
    }
    // 꼬리: 1페이즈 휩쓸기 1번(낮은 띠) · 2페이즈 2번(두 번째는 높은 띠)
    for (const ph of [0, 1]) {
      G.build(id, { phase: ph }); G.step(ph ? 4.5 : 0.5);
      b = G.boss; b.debugAct('tail');
      const seen = new Map();
      for (let t = 0; t < 2.8; t += 0.05) { G.step(0.05); for (const z of G.world.entities) if (z.kind === 'hazard' && !z.harmless && z.on && z.h <= 100 && z.w === 140) seen.set(z.attack.hitId, Math.round(G.boss.A.floor - z.y)); }
      out['tail' + ph] = [...seen.values()];
    }
    // 사라졌다 내리꽂기: 숨은 동안 무적·판정 없음·접촉 없음 → 내리꽂힌 뒤 기절 중 핵 0.45
    G.build(id, { phase: 1 }); G.step(4.5); b = G.boss;
    b.debugAct('vanish'); G.step(1.2);
    out.vanishHidden = { hidden: b.hidden, inv: b.invuln, parts: b.hitParts().length, contact: b.contactParts().length };
    G.step(1.6);
    out.vanishStun = { hidden: b.hidden, stunned: b.stunned, core: b.pCore.defMul, dy: Math.round(b.A.floor - b.zy) };
    // 핵 노출: 고리 셋, 핵 0.45, 핵에 5% → stagger
    G.build(id, { phase: 1 }); G.step(4.5); b = G.boss;
    const old = new Set(G.world.entities.filter((z) => z.kind === 'hazard').map((z) => z.attack?.hitId));   // 전환의 강제 coreBurst 가 남긴 고리는 빼고
    b.debugAct('coreBurst'); let rings = new Set();
    for (let t = 0; t < 3.5; t += 0.05) { G.step(0.05); for (const z of G.world.entities) if (z.kind === 'hazard' && z.rects && !z.harmless && !old.has(z.attack.hitId)) rings.add(z.attack.hitId); }
    out.coreBurst = { rings: rings.size, core: b.pCore.defMul };
    G.build(id, { phase: 1 }); G.step(4.5); b = G.boss;
    b.debugAct('coreBurst'); G.step(1.0);
    b.hitCore(b.stats.maxHp * 0.06); G.step(0.1);
    out.stagger = { state: b.state, stunned: b.stunned };
    // 수호신 자동 공격은 핵을 깨지 않는다 (피해만 — BAL-RULES, b_common.ownHit): 핵 부위에 6% 를 쳐도 coreBurst 그대로 · 플레이어 한 대면 추락
    const coreHit = (tags) => { G.build(id, { phase: 1 }); G.step(4.5); b = G.boss; b.debugAct('coreBurst'); G.step(1.0); const hp0 = b.hp; b.hitPart = b.pCore; b.takeHit(Math.ceil(b.stats.maxHp * 0.06), { team: 'player', dir: 1, tags }, G.world, {}); G.step(0.1); return { state: b.state, dmg: hp0 - b.hp }; };
    out.coreGuard = { guard: coreHit(['companion', 'guardian']), player: coreHit(['melee']) };
    // 은빛 비행: 낙뢰 기둥 여럿 + 공허 파편
    G.build(id, { phase: 2 }); G.step(7); b = G.boss;
    let cols = new Set(), shards = 0; const s2 = b.shoot.bind(b); b.shoot = (o) => { shards++; return s2(o); };
    b.debugAct('storm');
    for (let t = 0; t < 3.8; t += 0.05) { G.step(0.05); for (const z of G.world.entities) if (z.kind === 'hazard' && !z.harmless && z.attack?.element === 'thunder') cols.add(z.attack.hitId); }
    out.storm = { cols: cols.size, shards };
    // 정화: 5초 사망, 배너 '정화!', 결정 0, 은빛 1, 드롭 아이템 정의
    G.build(id, { phase: 2 }); G.step(7); b = G.boss;
    G.kill(); const d0 = b.dying;
    G.step(0.5); out.banner = G.world.banner?.sub;
    G.step(3.0); out.mid = { crys: b.crys.filter((c) => c.alive).length, silver: +b.silverK.toFixed(2), purified: b.purified };
    G.step(6); out.end = { dead: b.dead, cleared: G.world.cleared, d0 };
    out.notes = G.notes.slice(n0);
    return out;
  }, ID);
  check('돌풍: 경고 → 돌풍, 플레이어를 밀어내는 방향, 핵 드러남(2페이즈)', r.gust0.phase === 'warn' && r.gust0.dir === r.gust0.want && r.gust0.core === 0.45 && r.gust1.phase === 'on', { g0: r.gust0, g1: r.gust1 });
  check('돌풍: 바람 칼날 6 + 공허 파편 3 (2페이즈)', r.blades === 9, r.blades);
  const b0 = r.breath0, b2 = r.breath2;
  check('숨결: 선분 판정 · 먼 쪽에서 가슴 앞으로 쓸린다 (용 아래·뒤는 안전)', b0.line && b0.n > 10 && Math.abs(b0.first - b0.zx) > Math.abs(b0.last - b0.zx) && Math.abs(b0.last - b0.zx) <= 200, b0);
  check('숨결 3페이즈: 되쓸기 (끝점이 다시 먼 쪽으로)', b2.line && Math.abs(b2.last - b2.zx) > 400, b2);
  check('꼬리: 1페이즈 낮은 띠 1번, 2페이즈 낮은 띠 + 높은 띠', r.tail0.length === 1 && r.tail0[0] === 100 && r.tail1.length === 2 && r.tail1.includes(100) && r.tail1.includes(235), { p1: r.tail0, p2: r.tail1 });
  check('내리꽂기: 숨은 동안 무적·판정 부위 0·접촉 0', r.vanishHidden.hidden && r.vanishHidden.inv && r.vanishHidden.parts === 0 && r.vanishHidden.contact === 0, r.vanishHidden);
  check('내리꽂기: 바닥에서 기절, 핵 0.45 (반격 창)', !r.vanishStun.hidden && r.vanishStun.stunned && r.vanishStun.core === 0.45 && r.vanishStun.dy === 125, r.vanishStun);
  check('핵 노출: 공허 고리 셋, 핵 0.45', r.coreBurst.rings === 3 && r.coreBurst.core === 0.45, r.coreBurst);
  check('핵 노출: 핵에 최대 체력 5% 넘게 → stagger(추락·기절)', r.stagger.state === 'stagger' && r.stagger.stunned, r.stagger);
  check('핵 노출: 수호신 자동 공격은 핵을 깨지 않음 (피해만) · 플레이어 한 대는 추락', r.coreGuard.guard.state === 'coreBurst' && r.coreGuard.guard.dmg > 0 && r.coreGuard.player.state === 'stagger', r.coreGuard);
  check('은빛 비행: 낙뢰 기둥 8+ · 공허 파편', r.storm.cols >= 8 && r.storm.shards >= 9, r.storm);
  check('정화: 사망 5초 · STAGE CLEAR 부제 "아르겐 정화!"', r.end.d0 === 5 && r.banner === '아르겐 정화!', { d0: r.end.d0, banner: r.banner });
  check('정화: 결정이 모두 깨지고 은빛 1 → 사라짐 · 클리어', r.mid.crys === 0 && r.mid.silver === 1 && r.mid.purified && r.end.dead && r.end.cleared, { mid: r.mid, end: r.end });
  check('패턴별 검사 오류 0', !r.notes.length, r.notes);
}
{
  // 처치 히트스톱 동안의 배너: world.onBossDefeated 가 '… 격파!' 를 단 바로 그 프레임부터 '정화' 여야 한다 (정화 틱은 히트스톱이 끝나야 돈다).
  //   W.hitstop 0.25 = S 등급 마무리 일격 (L·M·H·F + 처치 가산은 이보다 짧다) · 보스 러시 'ROUND CLEAR' 배너도 같은 길
  const r = await page.evaluate((id) => {
    const G = window.__gal, out = {};
    for (const kind of ['stage', 'rush']) {
      G.build(id, { phase: 2 }); G.step(7);
      const b = G.boss, W = G.world, n0 = G.notes.length;
      if (kind === 'rush') W.onBossDefeated = (bb) => { W.cleared = true; W.banner = { text: 'ROUND CLEAR', sub: `${bb.def.name} 격파 · 1:23  +12,000`, t: 3 }; };
      G.kill(); W.hitstop = 0.25;
      let wrong = 0, frames = 0; const subs = new Set();
      for (let i = 0; i <= 40; i++) { if (i) G.step(1 / 60); const sub = W.banner?.sub; frames++; if (sub) subs.add(sub); if (typeof sub === 'string' && sub.includes('격파')) wrong++; }
      out[kind] = { wrong, frames, subs: [...subs], notes: G.notes.slice(n0) };
    }
    return out;
  }, ID);
  check('처치 히트스톱: 잘못된 부제("격파") 0 프레임 · 첫 프레임부터 "아르겐 정화!" (STAGE CLEAR · ROUND CLEAR)', r.stage.wrong === 0 && r.rush.wrong === 0 && r.stage.subs.join() === '아르겐 정화!' && r.rush.subs.join() === '아르겐 정화 · 1:23  +12,000' && !r.stage.notes.length && !r.rush.notes.length, r);
}

// ── 4) 사망 → 부활 (onReset) · 적 정지 ──
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id, { phase: 2 }); G.step(7);
    const b = G.boss, n0 = G.notes.length;
    b.debugAct('vanish'); G.step(1.2);
    const mid = { hidden: b.hidden, silver: b.silverK };
    G.reset(); G.step(0.6);
    const g = b._cStandIns ?? {};
    return { mid, phase: b.phase, state: b.state, dmg: b.dmg, title: b.def.title, inv: b.invuln, hidden: b.hidden, crys: b.crys.filter((c) => c.alive).length, shell: b.crys.find((c) => c.shell)?.alive, silver: b.silverK, coreBase: b.coreBase, wind: g.wind ? { phase: g.wind.phase, auto: g.wind.auto } : null, notes: G.notes.slice(n0) };
  }, ID);
  check('사망→부활: 페이즈 0 · 결정 10(껍질 포함) · 은빛 0 · 핵 닫힘 · 칭호 원래대로 · 숨음 풀림', r.phase === 0 && r.dmg === 0 && !r.inv && !r.hidden && r.crys === 10 && r.shell && r.silver === 0 && r.coreBase === 0 && r.title === '공허에 물든 은룡' && !r.notes.length, r);
}
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(0.3);
    const b = G.boss, W = G.world, n0 = G.notes.length;
    b.debugAct('crystals'); G.step(0.8);
    W.freezeEnemies = true;
    const st = b.st, zt = W.entities.filter((e) => e.kind === 'hazard').map((z) => z.t), zx = b.zx;
    G.step(1.0);
    const same = b.st === st && W.entities.filter((e) => e.kind === 'hazard').every((z, i) => z.t === zt[i]) && b.zx === zx;
    W.freezeEnemies = false; G.step(0.2);
    return { same, moved: b.st > st, notes: G.notes.slice(n0) };
  }, ID);
  check('적 정지 중 보스 시계·지대·위치 멈춤', r.same && r.moved && !r.notes.length, r);
}
// ── 5) 데이터 · 드롭 ──
{
  const r = await page.evaluate(async () => {
    const { BOSSES } = await import('../src/data/bosses.js');
    const { ITEMS, BOSS_UNIQUES } = await import('../src/data/items.js');
    const d = BOSSES.b_argen;
    return { has: !!d, stage: d?.stageId, drops: d?.drops, items: (d?.drops ?? []).map((x) => ITEMS[x]?.name ?? null), bu: BOSS_UNIQUES.b_argen, portrait: d?.portrait };
  });
  check('데이터: BOSSES.b_argen · s21 · 드롭 u_argen/u_argen2 정의됨', r.has && r.stage === 's21' && r.items.every(Boolean) && r.items.length === 2 && r.bu?.length === 2, r);
}

const bad = results.filter((r) => !r.ok);
for (const r of results) if (r.summary) console.log(`${r.ok ? '✓' : '✗'} ${r.summary}`);
for (const r of results) if (!r.summary) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
console.log(`\n${results.length - bad.length}/${results.length} 통과`);
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.slice(0, 20).join('\n') : 'NO PAGE ERRORS');
await browser.close(); srv.close();
process.exit(bad.length || errs.length ? 1 : 0);
