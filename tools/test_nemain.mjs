// 네메인(b_nemain, s22 외전 보스) 패턴 검사 — 결정적 스텝 (EX2-BOSS, docs/specs/ex_s22.md §8). 갤러리(tools/gallery_bosses_e.html)에서
//  · 모든 공격 패턴 × 페이즈 0/1 debugAct → idle 로 돌아오는지, 판정 개체·탄이 생기는지, 오류 0
//  · 전환 unmask (form2 '네메인' · portraits/b_nemain2 · 가면 깨짐) · debugPhase(n) · 보조 stagger · 없는 상태 경고 ·
//    사망→부활 onReset (가면·'둥지어미' 복원, 어둠·소환수·고리 정리) · 처치 (굴복 5초, 파편 폭발 없음, 부제 '결착') · 적 정지
//  · 보스별: 가면 배율 0.85 → 1.0, 가라앉음/떼 동안 판정 없음, 카운터 → stagger, 까마귀 폭풍 두 띠(낮은/높은)와 노출 0.7,
//    둥지 고리의 틈은 맞지 않음, 그믐 어둠 켜짐 → 복원, 소환 상한(crow ≤ 4 · shadow_hunter ≤ 1), 15% 대사 한 번 + 그믐 강제,
//    투기장(arena r1)에서 패턴 8개가 경계 안에서 돈다, 드롭 u_nemain 정의
// 사용: node tools/test_nemain.mjs   (종료 코드 0 = 모두 통과 · 페이지 오류 0)
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';

const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/상태 'nope'/.test(m.text())) errs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/tools/gallery_bosses_e.html?id=b_nemain&paused=1`);
await page.waitForFunction(() => window.__gal?.done, null, { timeout: 60000 });
await page.evaluate(() => { window.__gal.O.paused = true; });

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) console.log('✗', name, JSON.stringify(info)); };
const ID = 'b_nemain';

// ── 1) 공격 패턴 × 페이즈 ──
const attacks = await page.evaluate((id) => { const G = window.__gal; G.build(id); return G.boss.attackNames(); }, ID);
check('공격 패턴 8개 (깃털 비수·까마귀 급습·그림자 걸음·비석 없는 무덤·둥지의 부름·까마귀 폭풍·둥지·그믐)', attacks.length === 8, attacks);
for (const ph of [0, 1]) {
  for (const act of attacks) {
    const r = await page.evaluate(({ id, ph, act }) => {
      const G = window.__gal;
      G.build(id, { phase: ph });
      G.step(ph ? 9 : 2);   // 등장 · 전환의 강제 패턴(murder)이 끝나게
      const b = G.boss, W = G.world;
      const n0 = G.notes.length;
      const pre = new Set(W.entities);   // 등장 뒤 AI 가 이미 고른 패턴이 남긴 판정·탄은 세지 않는다
      const ok = b.debugAct(act);
      const st0 = b.state;
      let maxHaz = 0, maxProj = 0, tele = false, t = 0, back = -1, hits0 = W.player.hits, ghost = false, mins0 = (b._cMinions ?? []).length, mins = 0;
      for (; t < 14; t += 0.05) {
        G.step(0.05);
        const ents = G.world.entities.filter((e) => !pre.has(e));
        maxHaz = Math.max(maxHaz, ents.filter((e) => e.kind === 'hazard' && !e.harmless).length);
        maxProj = Math.max(maxProj, ents.filter((e) => e.kind === 'projectile').length);
        mins = Math.max(mins, (b._cMinions ?? []).filter((e) => !e.dead).length);
        if (b.telegraph) tele = true;
        if (b.ghost) ghost = true;
        if (b.state !== act) { back = t; break; }
      }
      return { ok, st0, back: +back.toFixed(2), next: b.state, phase: b.phase, maxHaz, maxProj, tele, hits: W.player.hits - hits0, ghost, mins: mins - mins0, inv: b.invuln, notes: G.notes.slice(n0) };
    }, { id: ID, ph, act });
    const made = r.maxHaz + r.maxProj + (act === 'nestCall' ? r.mins : 0) > 0;
    check(`P${ph + 1} ${act}`, r.ok && r.st0 === act && r.back > 0 && r.phase === ph && !r.notes.length && made && !r.inv, r);
    results[results.length - 1].summary = `P${ph + 1} ${act.padEnd(13)} → ${String(r.back).padStart(5)}s 판정 ${r.maxHaz} 탄 ${r.maxProj}${act === 'nestCall' ? ` 소환 ${r.mins}` : ''} 예고 ${r.tele ? 'O' : '-'} 피격 ${r.hits}${r.ghost ? ' 숨음' : ''}`;
  }
}

// ── 2) 전환 · debugPhase · 보조 · 없는 상태 ──
const trans = await page.evaluate((id) => { const G = window.__gal; G.build(id); return { tr: G.boss.transitionNames(), help: G.boss.helperNames() }; }, ID);
check('전환 상태 unmask · 보조 stagger', trans.tr.join() === 'unmask' && trans.help.join() === 'stagger', trans);
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, n0 = G.notes.length, out = {};
    // 진짜 경계 넘기: 체력 51% 에서 한 대 → onPhase(1) → 전환 unmask
    b.hp = Math.floor(b.stats.maxHp * 0.51); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
    out.ok = true; out.st0 = b.state; out.inv0 = b.invuln;
    G.step(0.4); out.mask04 = b.masked; out.name04 = b.def.name;
    G.step(0.4); out.mask08 = b.masked; out.name08 = b.def.name; out.portrait = b.def.portrait; out.title = b.def.title; out.breakT = b.maskBreakT;
    let after = null; for (let t = 0; t < 3 && !after; t += 0.05) { G.step(0.05); if (b.state !== 'unmask' && b.state !== 'idle') after = b.state; }
    out.after = after; out.inv = b.invuln; out.phase = b.phase; out.forced = b.forced.slice(); out.headMul = b.pHead.defMul;
    // debugAct('unmask') 로 다시 보여 주기 (형태는 한 번뿐)
    out.re = b.debugAct('unmask'); out.reState = b.state; G.step(2.6); out.reAfter = b.state;
    out.notes = G.notes.slice(n0);
    return out;
  }, ID);
  check('전환 unmask: 무적 · 0.6초에 가면이 깨짐 → form2 네메인 · portraits/b_nemain2 · 칭호', r.ok && r.st0 === 'unmask' && r.inv0 && r.mask04 && r.name04 === '둥지어미' && !r.mask08 && r.name08 === '네메인' && r.portrait === 'portraits/b_nemain2' && r.title === '가면을 벗은 어미' && r.breakT > 0 && !r.notes.length, r);
  check('debugAct(unmask) 다시 보여 주기 → 전환 → 끝', r.re && r.reState === 'unmask' && r.reAfter !== 'unmask', { re: r.re, st: r.reState, after: r.reAfter });
  check('전환 unmask 뒤: 곧바로 까마귀 폭풍 (강제 murder) · 머리 배율 1.0', r.after === 'murder' && !r.inv && r.phase === 1 && r.headMul === 1, { after: r.after, forced: r.forced, headMul: r.headMul });
}
for (const n of [0, 1]) {
  const r = await page.evaluate(({ id, n }) => { const G = window.__gal; const n0 = G.notes.length; G.build(id, { phase: n }); G.step(1.0); const b = G.boss; return { phase: b.phase, masked: b.masked, inv: b.invuln, name: b.def.name, head: b.pHead.defMul, notes: G.notes.slice(n0) }; }, { id: ID, n });
  check(`debugPhase(${n}) — 가면 ${n ? '없음 · 머리 1.0' : '있음 · 머리 0.85 (노릴 곳)'}`, r.phase === n && r.masked === !n && !r.inv && r.head === (n ? 1 : 0.85) && r.name === (n ? '네메인' : '둥지어미') && !r.notes.length, r);
}
for (const s of [...trans.help, 'idle']) {
  const r = await page.evaluate(({ id, s }) => { const G = window.__gal; G.build(id, { phase: 1 }); G.step(9); const b = G.boss, n0 = G.notes.length; const ok = b.debugAct(s); const st0 = b.state; G.step(0.5); const mid = { head: b.pHead.defMul, body: b.pBody.defMul, stunned: b.stunned }; G.step(2.0); return { ok, st0, mid, after: b.state, notes: G.notes.slice(n0) }; }, { id: ID, s });
  check(`보조 ${s}`, r.ok && (s === 'idle' ? r.st0 === 'idle' : r.st0 === s && r.after !== s) && !r.notes.length, r);
  if (s === 'stagger') check('stagger: 무릎 1.4초 · 몸통 0.7 · 머리 0.6', r.mid.stunned && r.mid.body === 0.7 && r.mid.head === 0.6, r.mid);
}
check('debugAct(없는 상태) → false', (await page.evaluate((id) => { const G = window.__gal; G.build(id); return G.boss.debugAct('nope'); }, ID)) === false, null);

// ── 3) 패턴별 검사 ──
{
  const r = await page.evaluate(async (id) => {
    const G = window.__gal, out = {}, n0 = G.notes.length;
    // debugAct 직전에 이미 있던 판정은 세지 않는다 (step(9) 동안 AI 가 고른 패턴의 까마귀·기둥·고리가 남아 있을 수 있다 — cancelPattern 은 이미 나간 판정을 지우지 않는다)
    let pre = new Set();
    const act = (b, s) => { pre = new Set(G.world.entities); return b.debugAct(s); };
    const hazards = () => G.world.entities.filter((e) => e.kind === 'hazard' && !e.harmless && !pre.has(e));
    // 깃털 비수: 1페이즈 5개 · 2페이즈 7 + 7
    for (const ph of [0, 1]) {
      G.build(id, { phase: ph }); G.step(ph ? 9 : 2);
      const b = G.boss; let shot = 0; const sh = b.shoot.bind(b); b.shoot = (o) => { shot++; return sh(o); };
      act(b, 'featherVolley'); G.step(1.6);
      out['volley' + ph] = shot;
    }
    // 까마귀 급습: 1페이즈 3 · 2페이즈 5 줄 판정 (폭 34)
    for (const ph of [0, 1]) {
      G.build(id, { phase: ph }); G.step(ph ? 9 : 2);
      const b = G.boss; act(b, 'crowDive');
      const ids = new Set(); let th = 0;
      for (let t = 0; t < 3.5; t += 0.05) { G.step(0.05); for (const z of hazards()) if (z.line) { ids.add(z.attack.hitId); th = z.line.th; } }
      out['dive' + ph] = { n: ids.size, th };
    }
    // 그림자 걸음: 가라앉은 동안 판정 없음 → 솟아오름 = 카운터 창(telegraph) → 맞으면 stagger. 2페이즈는 두 번
    G.build(id); G.step(2); let b = G.boss;
    act(b, 'shadowStep'); G.step(0.5);
    out.sunk = { ghost: b.ghost, parts: b.hitParts().length, contact: b.contactParts().length };
    G.step(0.5);   // 1.0초: 솟아오름
    out.rise = { cWin: b.cWin, tele: b.telegraph, parts: b.hitParts().length };
    b.takeHit(10, { team: 'player', dir: 1 }, G.world, {}); G.step(0.05);
    out.counter = { state: b.state, stunned: b.stunned };
    // 카운터 창: 수호신 자동 공격 한 대로는 무릎이 아니다 (BAL-RULES — b_common.ownHit)
    G.build(id); G.step(2); b = G.boss;
    act(b, 'shadowStep'); G.step(1.0);
    const gw = b.cWin; b.takeHit(10, { team: 'player', dir: 1, tags: ['companion', 'guardian'] }, G.world, {}); G.step(0.05);
    out.counterGuard = { cWin: gw, state: b.state, stunned: b.stunned };
    G.build(id, { phase: 1 }); G.step(9); b = G.boss;
    act(b, 'shadowStep'); let slashes = 0; const seenS = new Set();
    for (let t = 0; t < 4; t += 0.05) { G.step(0.05); for (const z of hazards()) if (!z.line && z.w === 160) seenS.add(z.attack.hitId); if (b.state !== 'shadowStep') break; }
    out.step2 = seenS.size;
    // 비석 없는 무덤: 기둥 5 / 7 (폭 56, 높이 5칸)
    for (const ph of [0, 1]) {
      G.build(id, { phase: ph }); G.step(ph ? 9 : 2); b = G.boss;
      act(b, 'nameless'); const cols = new Map();
      for (let t = 0; t < 3; t += 0.05) { G.step(0.05); for (const z of hazards()) if (z.w === 56) cols.set(z.attack.hitId, Math.round(z.h)); }
      out['grave' + ph] = { n: cols.size, h: [...cols.values()][0] };
    }
    // 둥지의 부름: 까마귀 ≤ 4 · 그림자 헌터 ≤ 1 (2페이즈), 최대치면 고르지 않는다
    G.build(id, { phase: 1 }); G.step(9); b = G.boss;
    const cnt = () => ({ crow: b.minionCount('crow'), hunter: b.minionCount('shadow_hunter') });
    const caps = [];
    for (let k = 0; k < 4; k++) { b.debugAct('nestCall'); G.step(1.7); for (const e of b._cMinions) { e.x = b.A.x0 + 10; e.vx = 0; } caps.push(cnt()); }
    out.nest = { caps, can: b.canCall(), picks: b.weights().map(([k]) => k).includes('nestCall') };
    // 까마귀 폭풍: 떼 동안 판정 없음 · 낮은 띠 + 높은 띠 · 노출 몸통 0.7 · 노출 중 5% → stagger
    G.build(id, { phase: 1 }); G.step(9); b = G.boss;
    act(b, 'murder'); G.step(0.3);
    out.swarm = { ghost: b.ghost, parts: b.hitParts().length, contact: b.contactParts().length };
    const bands = new Set(); let exposed = null;
    const A = b.A, T = 48;
    for (let t = 0; t < 9; t += 0.05) {
      G.step(0.05);
      for (const z of hazards()) if (z.data?.sweep) { const top = Math.round((A.floor - z.y) / T * 10) / 10, bot = Math.round((A.floor - (z.y + z.h)) / T * 10) / 10; bands.add(`${top}-${bot}`); }
      if (b.exposed && !exposed) exposed = { body: b.pBody.defMul, parts: b.hitParts().length, ghost: b.ghost };
      if (b.state !== 'murder') break;
    }
    out.murder = { bands: [...bands], exposed };
    G.build(id, { phase: 1 }); G.step(9); b = G.boss;
    act(b, 'murder'); for (let t = 0; t < 9 && !b.exposed; t += 0.05) G.step(0.05);
    const wasExp = b.exposed;
    b.takeHit(Math.ceil(b.stats.maxHp * 0.06), { team: 'player', dir: 1 }, G.world, {}); G.step(0.05);
    out.murderStagger = { wasExp, state: b.state };
    // 둥지 고리: 반지름 300 → 70, 틈(70°) 안의 플레이어는 맞지 않고 띠 위는 맞는다, 끝에 바깥으로 터진다
    G.build(id, { phase: 1 }); G.step(9); b = G.boss;
    act(b, 'featherCage'); G.step(0.6);
    const cz = G.world.entities.find((e) => e.kind === 'hazard' && e.data?.cage && !e.harmless && !pre.has(e));
    const cg = cz?.data.cage, p = G.world.player, save = { x: p.x, y: p.y };
    const placeAt = (ang) => { const hb = p.hurtbox(), ox = hb.x - p.x + hb.w / 2, oy = hb.y - p.y + hb.h / 2; p.x = cg.cx + Math.cos(ang) * cg.r - ox; p.y = cg.cy + Math.sin(ang) * cg.r - oy; };
    placeAt(cg.gap); const inGap = cz.rects(cz).length;
    placeAt(cg.gap + Math.PI); const onRing = cz.rects(cz).length;
    p.x = save.x; p.y = save.y;
    const r0 = cg.r; G.step(1.42); const r1 = Math.round(cg.r);
    let burst = false; for (let t = 0; t < 1; t += 0.05) { G.step(0.05); if (G.world.entities.some((e) => e.kind === 'hazard' && e.rects && !e.data?.cage && !e.harmless)) burst = true; }
    out.cage = { inGap, onRing, r0: Math.round(r0), r1, burst };
    // 그믐: 어둠 켜짐 → 기습 3번 (각 베기 170×110) → 어둠 복원
    G.build(id, { phase: 1 }); G.step(9); b = G.boss;
    b.debugAct('idle'); b.idleWait = 99; for (let t = 0; t < 6 && b._cDark?.list?.length; t += 0.1) G.step(0.1);   // 저절로 고른 그믐의 어둠이 남아 있으면 끝날 때까지
    const L = G.world.lighting, d0 = L.darkness;
    act(b, 'eclipse'); G.step(0.2); const dOn = L.darkness;
    const cuts = new Set(); let riseWin = 0;
    for (let t = 0; t < 5; t += 0.05) { G.step(0.05); if (b.cWin && b.telegraph) riseWin++; for (const z of hazards()) if (z.w === 170) cuts.add(z.attack.hitId); if (b.state !== 'eclipse') break; }
    G.step(0.6);
    out.eclipse = { d0: +d0.toFixed(2), on: +dOn.toFixed(2), back: +L.darkness.toFixed(2), cuts: cuts.size, riseWin: riseWin > 0 };
    // 그믐 솟아오름에 카운터 → 무릎: 어둠·색조가 걷힌다 (무릎 꿇은 동안 방이 칠흑으로 남지 않게)
    G.build(id, { phase: 1 }); G.step(9); b = G.boss;
    b.debugAct('idle'); b.idleWait = 99; for (let t = 0; t < 6 && b._cDark?.list?.length; t += 0.1) G.step(0.1);
    {
      const LL = G.world.lighting, base = LL.darkness;
      act(b, 'eclipse'); for (let t = 0; t < 3 && !b.cWin; t += 0.02) G.step(0.02);
      const win = b.cWin, dIn = LL.darkness;
      b.takeHit(10, { team: 'player', dir: 1 }, G.world, {}); G.step(0.05);
      const st = b.state; G.step(0.3);
      out.eclStag = { win, st, base: +base.toFixed(2), dIn: +dIn.toFixed(2), after: +LL.darkness.toFixed(2), tints: G.world.overlays.filter((o) => o.owner === b && o.cTint && !o.dead && o.end === null).length };
    }
    // 15%: 대사(스토리) 한 번 + 그믐 강제 (부활해도 대사는 다시 안 나온다)
    G.S.forceCutscene = false; G.O.story = true;
    G.build(id, { phase: 1 }); G.world.mode = 'story'; G.step(9); b = G.boss;
    b.hp = Math.floor(b.stats.maxHp * 0.16); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
    out.last = { forced: b.forced.slice(), hasScript: !!(await import('../src/data/story.js')).SCRIPTS.b_nemain_last };
    act(b, 'eclipse'); G.step(0.2);
    out.last.dialog = G.world.dialog?.id ?? null;
    G.step(3); G.reset(); G.step(0.5);
    b.hp = Math.floor(b.stats.maxHp * 0.16); b.phase = 1; b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
    act(b, 'eclipse'); G.step(0.2);
    out.last.again = G.world.dialog?.id ?? null;
    out.last.seen = G.world.state.progress.seenScripts.filter((s) => s === 'b_nemain_last').length;
    G.O.story = false;
    out.notes = G.notes.slice(n0);
    return out;
  }, ID);
  check('깃털 비수: 1페이즈 5개 · 2페이즈 7 + 7 (반 칸 어긋난 두 번째 부채)', r.volley0 === 5 && r.volley1 === 14, { p1: r.volley0, p2: r.volley1 });
  check('까마귀 급습: 1페이즈 3마리 · 2페이즈 5마리 (선분 폭 34)', r.dive0.n === 3 && r.dive1.n === 5 && r.dive0.th === 34, { p1: r.dive0, p2: r.dive1 });
  check('그림자 걸음: 가라앉은 동안 판정·접촉 없음', r.sunk.ghost && r.sunk.parts === 0 && r.sunk.contact === 0, r.sunk);
  check('그림자 걸음: 솟아오름 = 카운터 창 → 맞으면 stagger', r.rise.cWin && r.rise.tele && r.rise.parts > 0 && r.counter.state === 'stagger' && r.counter.stunned, { rise: r.rise, counter: r.counter });
  check('그림자 걸음 카운터 창: 수호신 자동 공격 한 대로는 무릎이 아니다', r.counterGuard.cWin && r.counterGuard.state === 'shadowStep' && !r.counterGuard.stunned, r.counterGuard);
  check('그림자 걸음 2페이즈: 반대쪽에서 한 번 더 (베기 4타)', r.step2 === 4, r.step2);
  check('비석 없는 무덤: 기둥 5 / 7 · 높이 5칸', r.grave0.n === 5 && r.grave1.n === 7 && r.grave0.h === 240, { p1: r.grave0, p2: r.grave1 });
  const caps = r.nest.caps, last = caps[caps.length - 1];
  check('둥지의 부름: 까마귀 ≤ 4 · 그림자 헌터 ≤ 1 · 최대치면 고르지 않는다', caps.every((c) => c.crow <= 4 && c.hunter <= 1) && last.crow === 4 && last.hunter === 1 && !r.nest.can && !r.nest.picks, r.nest);
  check('까마귀 폭풍: 떼 동안 판정·접촉 없음', r.swarm.ghost && r.swarm.parts === 0 && r.swarm.contact === 0, r.swarm);
  check('까마귀 폭풍: 낮은 띠(바닥…2.4칸) + 높은 띠(3.6…6.6칸) · 노출 몸통 0.7', r.murder.bands.includes('2.4-0') && r.murder.bands.includes('6.6-3.6') && r.murder.bands.length === 2 && r.murder.exposed?.body === 0.7 && r.murder.exposed.parts > 0, r.murder);
  check('까마귀 폭풍: 노출 중 최대 체력 5% → stagger', r.murderStagger.wasExp && r.murderStagger.state === 'stagger', r.murderStagger);
  check('둥지 고리: 틈 안은 맞지 않고 띠 위는 맞는다 · 300 → 70 · 끝에 바깥으로 터진다', r.cage.inGap === 0 && r.cage.onRing === 1 && r.cage.r0 >= 290 && r.cage.r1 <= 72 && r.cage.burst, r.cage);
  check('그믐: 어둠 +0.45 → 기습 3번(카운터 창) → 어둠 복원', r.eclipse.on >= r.eclipse.d0 + 0.44 && r.eclipse.cuts === 3 && r.eclipse.riseWin && r.eclipse.back === r.eclipse.d0, r.eclipse);
  check('그믐 카운터 → 무릎: 어둠·색조가 걷힌다', r.eclStag.win && r.eclStag.st === 'stagger' && r.eclStag.dIn > r.eclStag.base + 0.3 && r.eclStag.after === r.eclStag.base && r.eclStag.tints === 0, r.eclStag);
  check('15%: 그믐 강제 + 대사 b_nemain_last (스토리, 처음만 — 부활 뒤 다시 안 나온다)', r.last.forced.includes('eclipse') && (r.last.hasScript ? r.last.dialog === 'b_nemain_last' && r.last.seen === 1 : r.last.dialog === null) && r.last.again === null, r.last);
  check('패턴별 검사 오류 0', !r.notes.length, r.notes);
}

// ── 4) 사망 → 부활 (onReset) · 처치 · 적 정지 ──
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id, { phase: 1 }); G.step(9);
    const b = G.boss, n0 = G.notes.length, W = G.world, d0 = b._cDark?.base ?? W.lighting.darkness;   // AI 가 고른 그믐이 이미 어둡게 했을 수 있다 → 어둡히기 전 값
    b.debugAct('nestCall'); G.step(1.7);
    const mins = b._cMinions.filter((e) => !e.dead).length;
    b.debugAct('eclipse'); G.step(1.0);
    const mid = { ghost: b.ghost, dark: +W.lighting.darkness.toFixed(2), mins };
    b.debugAct('featherCage'); G.step(0.8);
    G.reset(); G.step(0.6);
    const cages = W.entities.filter((e) => e.kind === 'hazard' && e.data?.cage && !e.dead).length;
    return { mid, phase: b.phase, state: b.state, masked: b.masked, name: b.def.name, title: b.def.title, portrait: b.def.portrait, inv: b.invuln, ghost: b.ghost, dark: +W.lighting.darkness.toFixed(2), d0: +d0.toFixed(2), mins: b._cMinions.filter((e) => !e.dead).length, cages, tints: W.overlays.length, notes: G.notes.slice(n0) };
  }, ID);
  check('사망→부활: 페이즈 0 · 가면 · 둥지어미 · 어둠/소환수/고리 정리', r.phase === 0 && r.masked && r.name === '둥지어미' && r.portrait === 'portraits/b_nemain' && !r.inv && !r.ghost && r.dark === r.d0 && r.mins === 0 && r.cages === 0 && r.mid.mins > 0 && !r.notes.length, r);
}
{
  const r = await page.evaluate((id) => {
    const G = window.__gal, out = {};
    for (const mode of ['arcade', 'story']) {
      G.build(id, { phase: 1 }); G.world.mode = mode; G.step(9);
      const b = G.boss, W = G.world, n0 = G.notes.length;
      G.kill(); const d0 = b.dying;
      const until = (T) => { for (let i = 0; i < 2000 && b.dieT < T && !b.dead; i++) G.step(1 / 60); };
      G.step(0.3); const banner = W.banner?.sub;
      until(1.3); const dag = b.daggersDown;
      until(2.6); const kneel = +b.ps.kneel.toFixed(2);
      const shards = W.entities.filter((e) => e.kind === 'debris').length;
      until(4.2); const vanish = b.vanishK;
      until(6); G.step(0.5);
      out[mode] = { d0, banner, dag, kneel, shards, vanish: +vanish.toFixed(2), dead: b.dead, dying: +b.dying.toFixed(2), cleared: W.cleared, notes: G.notes.slice(n0) };
    }
    // 보스 러시 배너: 'ROUND CLEAR' 부제의 '격파' 만 '결착' 으로 (나머지 글자는 그대로)
    G.build(id, { phase: 1 }); G.step(9);
    const b = G.boss, W = G.world; G.kill(); G.step(0.2);
    W.banner = { text: 'ROUND CLEAR', sub: '네메인 격파 · 1:23  +12,000', t: 3 }; G.step(0.1);
    out.rush = W.banner?.sub;
    return out;
  }, ID);
  const a = r.arcade, s = r.story;
  check('처치: 굴복 5초 · 부제 "네메인 결착!" · 파편 폭발 없음', a.d0 === 5 && a.banner === '네메인 결착!' && a.shards === 0 && s.d0 === 5, { a, s });
  check('굴복: 1.2초 단검이 떨어지고 무릎을 꿇는다', a.dag && a.kneel > 0.9 && s.dag && s.kneel > 0.9, { a: [a.dag, a.kneel], s: [s.dag, s.kneel] });
  check('아케이드: 3.5초에 까마귀로 흩어져 사라짐 → 5초에 끝', a.vanish === 1 && a.dead && a.cleared, a);
  check('스토리: 무릎 꿇은 채 남는다 (스테이지가 끝날 때까지)', !s.dead && s.dying > 0 && s.cleared && s.vanish === 0, s);
  check('보스 러시 부제: 낱말만 바꾼다 (시간·점수 그대로)', r.rush === '네메인 결착 · 1:23  +12,000', r.rush);
  check('처치 오류 0', !a.notes.length && !s.notes.length, [...a.notes, ...s.notes]);
}
{
  // 처치 히트스톱 동안의 배너: world.onBossDefeated 가 '… 격파!' 를 단 바로 그 프레임부터 '결착' 이어야 한다 (쓰러짐 틱은 히트스톱이 끝나야 돈다).
  //   W.hitstop 0.25 = S 등급 마무리 일격 (L·M·H·F + 처치 가산은 이보다 짧다) · 보스 러시 'ROUND CLEAR' 배너도 같은 길
  const r = await page.evaluate((id) => {
    const G = window.__gal, out = {};
    for (const kind of ['stage', 'rush']) {
      G.build(id, { phase: 1 }); G.step(9);
      const b = G.boss, W = G.world, n0 = G.notes.length;
      if (kind === 'rush') W.onBossDefeated = (bb) => { W.cleared = true; W.banner = { text: 'ROUND CLEAR', sub: `${bb.def.name} 격파 · 1:23  +12,000`, t: 3 }; };
      G.kill(); W.hitstop = 0.25;
      let wrong = 0, frames = 0; const subs = new Set();
      for (let i = 0; i <= 40; i++) { if (i) G.step(1 / 60); const sub = W.banner?.sub; frames++; if (sub) subs.add(sub); if (typeof sub === 'string' && sub.includes('격파')) wrong++; }
      out[kind] = { wrong, frames, subs: [...subs], notes: G.notes.slice(n0) };
    }
    return out;
  }, ID);
  check('처치 히트스톱: 잘못된 부제("격파") 0 프레임 · 첫 프레임부터 "네메인 결착!" (STAGE CLEAR · ROUND CLEAR)', r.stage.wrong === 0 && r.rush.wrong === 0 && r.stage.subs.join() === '네메인 결착!' && r.rush.subs.join() === '네메인 결착 · 1:23  +12,000' && !r.stage.notes.length && !r.rush.notes.length, r);
}
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, W = G.world, n0 = G.notes.length;
    b.debugAct('nameless'); G.step(0.8);
    W.freezeEnemies = true;
    const st = b.st, zt = W.entities.filter((e) => e.kind === 'hazard').map((z) => z.t), zx = b.zx;
    G.step(1.0);
    const same = b.st === st && W.entities.filter((e) => e.kind === 'hazard').every((z, i) => z.t === zt[i]) && b.zx === zx;
    W.freezeEnemies = false; G.step(0.2);
    return { same, moved: b.st > st, notes: G.notes.slice(n0) };
  }, ID);
  check('적 정지 중 보스 시계·지대·위치 멈춤', r.same && r.moved && !r.notes.length, r);
}

// ── 5) 투기장 (maps/arena.js r1 40×14): 패턴 8개가 경계 안에서 돈다 ──
{
  const r = await page.evaluate(async (id) => {
    const G = window.__gal;
    const { ROOMS } = await import('../src/data/maps/arena.js');
    const rows = ROOMS.r1.map, h = rows.length, w = rows[0].length;
    const solids = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ('#%='.includes(rows[y][x])) solids.push([x, y, x, y]);
    const C = G.boss.constructor, P0 = C.PATTERNS;
    const room = { w, h, x0: 1, solids };
    Object.defineProperty(C, 'PATTERNS', { configurable: true, get: () => ({ ...P0, floorRow: h - 2, room }) });
    const out = { acts: {}, notes: [] };
    try {
      for (const ph of [0, 1]) {
        for (const act of P0.attacks) {
          G.build(id, { phase: ph }); G.step(ph ? 9 : 2);
          const b = G.boss, A = b.A, n0 = G.notes.length;
          b.debugAct(act);
          let out1 = 0, minX = 1e9, maxX = -1e9, back = -1;
          for (let t = 0; t < 14; t += 0.05) {
            G.step(0.05);
            minX = Math.min(minX, b.zx); maxX = Math.max(maxX, b.zx);
            if (b.zx < A.x0 || b.zx > A.x1 || Math.abs(b.fy - A.floor) > 0.5) out1++;
            for (const z of G.world.entities) if (z.kind === 'hazard' && !z.harmless && z.on) { const cx = z.line ? (z.line.x0 + z.line.x1) / 2 : z.x + z.w / 2; if (cx < A.x0 - 200 || cx > A.x1 + 200 || (z.y > A.floor + 10)) out1++; }
            if (b.state !== act) { back = t; break; }
          }
          out.acts[`P${ph + 1} ${act}`] = { back: +back.toFixed(2), out: out1, x: [Math.round(minX), Math.round(maxX)], A: [A.x0, A.x1, A.floor] };
          out.notes.push(...G.notes.slice(n0));
        }
      }
    } finally { Object.defineProperty(C, 'PATTERNS', { configurable: true, get: () => P0 }); }
    return out;
  }, ID);
  const bad = Object.entries(r.acts).filter(([, v]) => !(v.back > 0) || v.out > 0);
  check('투기장 r1: 패턴 8개 × 페이즈 2 가 경기장 경계·바닥 안에서 끝까지 돈다', bad.length === 0 && Object.keys(r.acts).length === 16 && !r.notes.length, bad.length ? bad : Object.values(r.acts)[0]);
}
// ── 6) 데이터 · 드롭 ──
{
  const r = await page.evaluate(async () => {
    const { BOSSES } = await import('../src/data/bosses.js');
    const { ITEMS, BOSS_UNIQUES } = await import('../src/data/items.js');
    const { knownBoss } = await import('../src/game/bosses/lazy.js');
    const d = BOSSES.b_nemain, it = ITEMS.u_nemain;
    return { has: !!d, stage: d?.stageId, drops: d?.drops, phases: d?.phases, form2: d?.form2, portrait: d?.portrait, item: it ? { name: it.name, wtype: it.wtype, tier: it.tier, lvReq: it.lvReq, atk: it.stats?.atk } : null, bu: BOSS_UNIQUES.b_nemain, lazy: knownBoss('b_nemain') };
  });
  check('데이터: BOSSES.b_nemain · s22 · phases [0.5] · form2 네메인 · 드롭 u_nemain(7단계 단검) · lazy 등록', r.has && r.stage === 's22' && r.phases?.join() === '0.5' && r.form2?.portrait === 'portraits/b_nemain2' && r.item?.wtype === 'dagger' && r.item.tier === 7 && r.bu?.join() === 'u_nemain' && r.lazy, r);
}

const bad = results.filter((r) => !r.ok);
for (const r of results) if (r.summary) console.log(`${r.ok ? '✓' : '✗'} ${r.summary}`);
for (const r of results) if (!r.summary) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
console.log(`\n${results.length - bad.length}/${results.length} 통과`);
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.slice(0, 20).join('\n') : 'NO PAGE ERRORS');
await browser.close(); srv.close();
process.exit(bad.length || errs.length ? 1 : 0);
