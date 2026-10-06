// 엘제베트(b_bride, s24 외전 보스) 패턴 검사 — 결정적 스텝 (EX4-BOSS, docs/specs/ex_s24.md §8). 갤러리(tools/gallery_bosses_e.html)에서
//  · 모든 공격 패턴 × 페이즈 0/1 debugAct → idle 로 돌아오는지, 판정 개체·탄·소환·성배 고리가 생기는지, 오류 0 (debugAct 직전에 있던 개체는 세지 않는다)
//  · 전환 wither (form2 '시든 신부' · portraits/b_bride2 · 판정 84×150 · 아래 끝 A.floor−24 · 발 x 그대로) · debugPhase(n) · 보조 stagger · 없는 상태 경고 ·
//    사망→부활 onReset (귀부인·'엘제베트'·150 높이, 장미·신부·박쥐 떼·핏물 띠·흡수장·잔상·색조 정리, 회복 횟수 0) · 처치 (스토리: 무릎 유지 /
//    아케이드: 3.0초에 꽃잎으로 사라짐, 파편 폭발 없음, 부제 '격파!' — 처치 타격 첫 프레임부터 '시든 신부 격파!') · 적 정지
//  · 보스별: 회춘의 잔 — 체력 > 85% 에서 고르지 않음 · 성배 한 대 → 깨짐 → stagger · 몸통 3% → 깨짐 · 못 끊으면 정확히 +4% · 싸움마다 성공 ≤ 2 ·
//    2페이즈 회복은 49.9% 를 넘지 않고 전환이 다시 걸리지 않음 · 15% 강제 — 하던 패턴(왈츠·욕조·흡수)을 1틱 안에 끊고 성배, 스토리면 b_bride_last 한 번 →
//    깨짐 + 2.5초 무릎, 아케이드면 보통 성배 (s23 VERIFY ① 교훈) · 소환 상한(신부 ≤ 2 · 박쥐 떼 ≤ 2) · 왈츠·마지막 왈츠 착지점이 A 안·A.floor 또는 발판 위 ·
//    잔상이 0.45초 뒤 같은 자리 · 욕조 띠가 A 폭·A.floor 기준 · 흡수 끝에 터짐 · 노출 0.7 · 판정 부위 피해 순서 (2페이즈 머리 > 몸통 > 넝마 자락 — 피해로 잰다,
//    s23 VERIFY ② 교훈) · 가시 채찍 낮은 띠/가운데 띠 · 카운터 창(왈츠 두 가지·흡수 노출 5%) → stagger · 투기장(arena r1)에서 패턴 8개가 경계 안에서 돈다 ·
//    drops 빈 목록 · inferno 를 읽지 않음 · 창 상한(POLISH-4: 1페이즈 무릎 한 번 ≤ 10% · 왈츠 한 번 ≤ 15%, 필살 제외, 2페이즈 없음) · 수호신은 성배를 깨지 않음
// 사용: node tools/test_bride.mjs   (종료 코드 0 = 모두 통과 · 페이지 오류 0). Math.random 은 페이지에서 고정 시드로 바꿔 매번 같은 결과.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from './serve.mjs';

const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
// 결정적: 페이지의 Math.random 을 시드 난수로 (패턴 선택·착지 흔들림·채찍 띠 순서)
await ctx.addInitScript(() => { let s = 0x2f6e2b1; Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/상태 'nope'/.test(m.text())) errs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/tools/gallery_bosses_e.html?id=b_bride&paused=1`);
await page.waitForFunction(() => window.__gal?.done, null, { timeout: 60000 });
await page.evaluate(() => { window.__gal.O.paused = true; });

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) console.log('✗', name, JSON.stringify(info)); };
const ID = 'b_bride';

// ── 1) 공격 패턴 × 페이즈 ──
const attacks = await page.evaluate((id) => { const G = window.__gal; G.build(id); return G.boss.attackNames(); }, ID);
check('공격 패턴 8개 (피의 왈츠·가시 채찍·핏빛 장미·신부들의 부름·회춘의 잔·피의 욕조·세월 흡수·마지막 왈츠)', attacks.join() === 'waltz,thornLash,roseBloom,brides,goblet,crimsonBath,drain,lastDance', attacks);
for (const ph of [0, 1]) {
  for (const act of attacks) {
    const r = await page.evaluate(({ id, ph, act }) => {
      const G = window.__gal;
      G.build(id, { phase: ph });
      G.step(ph ? 6 : 2);   // 등장 · 전환의 강제 패턴(crimsonBath)이 끝나게
      const b = G.boss, W = G.world;
      if (act === 'goblet') b.hp = Math.floor(b.stats.maxHp * (ph ? 0.4 : 0.8));
      W.player.x = b.zx - b.facing * 220;
      const n0 = G.notes.length;
      const pre = new Set(W.entities);   // 등장 뒤 AI 가 이미 고른 패턴이 남긴 판정·탄은 세지 않는다
      const hp0 = b.hp, ok = b.debugAct(act);
      const st0 = b.state;
      let maxHaz = 0, maxProj = 0, ring = 0, tele = false, t = 0, back = -1, hits0 = W.player.hits, ghost = false, mins0 = (b._cMinions ?? []).filter((e) => !e.dead).length, mins = 0;
      for (; t < 14; t += 0.05) {
        G.step(0.05);
        const ents = G.world.entities.filter((e) => !pre.has(e));
        maxHaz = Math.max(maxHaz, ents.filter((e) => e.kind === 'hazard' && !e.harmless).length);
        maxProj = Math.max(maxProj, ents.filter((e) => e.kind === 'projectile').length);
        ring = Math.max(ring, ents.filter((e) => e.data?.gobRing).length);
        mins = Math.max(mins, (b._cMinions ?? []).filter((e) => !e.dead).length);
        if (b.telegraph) tele = true;
        if (b.ghost) ghost = true;
        if (b.state !== act) { back = t; break; }
      }
      return { ok, st0, back: +back.toFixed(2), next: b.state, phase: b.phase, crone: b.crone, maxHaz, maxProj, ring, tele, hits: W.player.hits - hits0, ghost, mins: mins - mins0, heal: +((b.hp - hp0) / b.stats.maxHp).toFixed(3), inv: b.invuln, notes: G.notes.slice(n0) };
    }, { id: ID, ph, act });
    const made = r.maxHaz + r.maxProj + (act === 'brides' ? r.mins : 0) + (act === 'goblet' ? r.ring : 0) > 0;
    check(`P${ph + 1} ${act}`, r.ok && r.st0 === act && r.back > 0 && r.phase === ph && r.crone === !!ph && !r.notes.length && made && !r.inv, r);
    results[results.length - 1].summary = `P${ph + 1} ${act.padEnd(12)} → ${String(r.back).padStart(5)}s 판정 ${r.maxHaz} 탄 ${r.maxProj}${act === 'brides' ? ` 소환 ${r.mins}` : ''}${act === 'goblet' ? ` 회복 ${r.heal}` : ''} 예고 ${r.tele ? 'O' : '-'} 피격 ${r.hits}${r.ghost ? ' 박쥐' : ''}`;
  }
}

// ── 2) 전환 · debugPhase · 보조 · 없는 상태 ──
const trans = await page.evaluate((id) => { const G = window.__gal; G.build(id); return { tr: G.boss.transitionNames(), help: G.boss.helperNames() }; }, ID);
check('전환 상태 wither · 보조 stagger', trans.tr.join() === 'wither' && trans.help.join() === 'stagger', trans);
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, n0 = G.notes.length, out = {}, A = b.A;
    b.debugAct('idle'); b.idleWait = 99; G.step(0.3);
    const foot0 = +b.zx.toFixed(2);
    out.size0 = [b.w, b.h]; out.bot0 = b.y + b.h; out.floor = A.floor;
    // 진짜 경계 넘기: 체력 51% 에서 한 대 → onPhase(1) → 전환 wither
    b.hp = Math.floor(b.stats.maxHp * 0.51); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
    out.st0 = b.state; out.inv0 = b.invuln; out.contact0 = b.hurtboxes().length;
    G.step(0.5); out.burn = b.burnK > 0;
    G.step(0.7); out.crack = b.crackK > 0;
    G.step(0.7); out.crone19 = b.crone; out.name19 = b.def.name;
    G.step(0.2); out.crone21 = b.crone; out.name = b.def.name; out.portrait = b.def.portrait; out.title = b.def.title; out.size = [b.w, b.h];
    out.bot = +(b.y + b.h).toFixed(2); out.footX = +(b.x + b.w / 2).toFixed(2); out.zx = +b.zx.toFixed(2); out.foot0 = foot0;
    let after = null; for (let t = 0; t < 3 && !after; t += 0.05) { G.step(0.05); if (b.state !== 'wither' && b.state !== 'idle') after = b.state; }
    out.after = after; out.inv = b.invuln; out.phase = b.phase; out.headMul = b.pHead.defMul; out.ragMul = b.pSkirt.defMul;
    // debugAct('wither') 로 다시 보여 주기 (형태는 한 번뿐)
    out.re = b.debugAct('wither'); out.reState = b.state; G.step(3.2); out.reAfter = b.state; out.reCrone = b.crone; out.rePhase = b.phase;
    out.notes = G.notes.slice(n0);
    return out;
  }, ID);
  check('전환 wither: 무적·판정 없음 · 0.4초 베일이 탐 · 1.0초 금 · 1.9초까지 귀부인 → 2.0초 노파 · form2 시든 신부 · portraits/b_bride2 · 칭호', r.st0 === 'wither' && r.inv0 && r.contact0 === 0 && r.burn && r.crack && !r.crone19 && r.name19 === '엘제베트' && r.crone21 && r.name === '시든 신부' && r.portrait === 'portraits/b_bride2' && r.title === '돌려받는 세월' && !r.notes.length, r);
  check('전환: 판정 64×150 → 84×150 · 아래 끝 A.floor → A.floor − 24 · 발 x 그대로', r.size0.join() === '64,150' && r.size.join() === '84,150' && r.bot0 === r.floor && r.bot === r.floor - 24 && r.footX === r.zx && r.zx === r.foot0, r);
  check('debugAct(wither) 다시 보여 주기 → 전환 → 끝 (노파 그대로 · 페이즈 1)', r.re && r.reState === 'wither' && r.reAfter !== 'wither' && r.reCrone && r.rePhase === 1, { re: r.re, st: r.reState, after: r.reAfter });
  check('전환 뒤: 곧바로 피의 욕조 (강제 crimsonBath) · 금 간 얼굴 0.8 · 넝마 자락 1.2', r.after === 'crimsonBath' && !r.inv && r.phase === 1 && r.headMul === 0.8 && r.ragMul === 1.2, { after: r.after, headMul: r.headMul, rag: r.ragMul });
}
for (const n of [0, 1]) {
  const r = await page.evaluate(({ id, n }) => { const G = window.__gal; const n0 = G.notes.length; G.build(id, { phase: n }); G.step(1.0); const b = G.boss; return { phase: b.phase, crone: b.crone, inv: b.invuln, name: b.def.name, head: b.pHead.defMul, body: b.pBody.defMul, skirt: b.pSkirt.defMul, size: [b.w, b.h], parts: b.hitParts().length, notes: G.notes.slice(n0) }; }, { id: ID, n });
  check(`debugPhase(${n}) — ${n ? '노파 · 금 간 얼굴 0.8(노릴 곳) · 몸통 1.0 · 넝마 1.2' : '귀부인 · 베일 0.9 · 몸통 1.0 · 드레스 자락 1.15'}`, r.phase === n && r.crone === !!n && !r.inv && r.head === (n ? 0.8 : 0.9) && r.body === 1 && r.skirt === (n ? 1.2 : 1.15) && r.parts === 3 && r.name === (n ? '시든 신부' : '엘제베트') && r.size[0] === (n ? 84 : 64) && !r.notes.length, r);
}
for (const ph of [0, 1]) {
  for (const s of [...trans.help, 'idle']) {
    const r = await page.evaluate(({ id, s, ph }) => { const G = window.__gal; G.build(id, { phase: ph }); G.step(ph ? 6 : 2); const b = G.boss, n0 = G.notes.length; const ok = b.debugAct(s); const st0 = b.state; G.step(0.5); const mid = { head: b.pHead.defMul, body: b.pBody.defMul, stunned: b.stunned, contact: b.contactParts().length }; G.step(1.4); return { ok, st0, mid, after: b.state, notes: G.notes.slice(n0) }; }, { id: ID, s, ph });
    check(`P${ph + 1} 보조 ${s}`, r.ok && (s === 'idle' ? r.st0 === 'idle' : r.st0 === s && r.after !== s) && !r.notes.length, r);
    if (s === 'stagger') check(`P${ph + 1} stagger: 무릎 1.4초 · 몸통 0.7 · 머리 0.6 · 접촉 없음`, r.mid.stunned && r.mid.body === 0.7 && r.mid.head === 0.6 && r.mid.contact === 0, r.mid);
  }
}
check('debugAct(없는 상태) → false', (await page.evaluate((id) => { const G = window.__gal; G.build(id); return G.boss.debugAct('nope'); }, ID)) === false, null);

// ── 3) 패턴별 검사 ──
{
  const r = await page.evaluate(async (id) => {
    const G = window.__gal, out = {}, n0 = G.notes.length, T = 48;
    let pre = new Set();
    const act = (b, s) => { pre = new Set(G.world.entities); return b.debugAct(s); };
    const fresh = (pred) => G.world.entities.filter((e) => !pre.has(e) && pred(e));
    const quiet = (b) => { b.debugAct('idle'); b.idleWait = 99; };
    const hpk = (b) => b.hp / b.stats.maxHp;
    let b, p, A;
    // ─ 회춘의 잔: 85% 초과면 고르지 않는다 · 85% 이하면 고른다 ─
    G.build(id); G.step(2); b = G.boss; quiet(b);
    b.hp = Math.floor(b.stats.maxHp * 0.9); const pickHigh = b.weights().map(([k]) => k).includes('goblet');
    b.hp = Math.floor(b.stats.maxHp * 0.84); const pickLow = b.weights().map(([k]) => k).includes('goblet');
    out.pick = { high: pickHigh, low: pickLow };
    // 성배 한 대 → 깨짐 → stagger (성배 판정 44×44 · 손 위 · 성배 고리)
    act(b, 'goblet'); G.step(0.4);
    const gp = b.hitParts().includes(b.pGob), gs = [b.pGob.w, b.pGob.h], above = b.pGob.y + b.pGob.h < b.pHead.y + b.pHead.h;
    const hp1 = b.hp; b.hitPart = b.pGob; b.takeHit(5, { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60);
    out.cupHit = { gp, gs, above, state: b.state, up: b.gobletUp, heals: b.heals, broke: b.gobBreakT > 0, healed: b.hp > hp1 };
    // 몸통 3% → 깨짐
    G.build(id); G.step(2); b = G.boss; quiet(b); b.hp = Math.floor(b.stats.maxHp * 0.8);
    act(b, 'goblet'); G.step(0.4);
    b.hitPart = b.pBody; b.takeHit(Math.ceil(b.stats.maxHp * 0.015), { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60); const st1 = b.state;
    b.hitPart = b.pBody; b.takeHit(Math.ceil(b.stats.maxHp * 0.016), { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60);
    out.bodyHit = { after15: st1, after31: b.state };
    // 못 끊으면 정확히 +4% · 성공 ≤ 2 (두 번 성공하면 더는 고르지 않는다)
    G.build(id); G.step(2); b = G.boss; quiet(b); b.hp = Math.floor(b.stats.maxHp * 0.7);
    const h0 = b.hp; act(b, 'goblet'); for (let t = 0; t < 4 && b.state === 'goblet'; t += 1 / 60) G.step(1 / 60);
    const d1 = b.hp - h0; quiet(b);
    act(b, 'goblet'); for (let t = 0; t < 4 && b.state === 'goblet'; t += 1 / 60) G.step(1 / 60); quiet(b);
    out.heal = { d1, want: Math.round(b.stats.maxHp * 0.04), heals: b.heals, pick: b.weights().map(([k]) => k).includes('goblet'), hp: +hpk(b).toFixed(3) };
    // 2페이즈: 49.9% 를 넘지 않고 전환이 다시 걸리지 않음
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b); b.hp = Math.floor(b.stats.maxHp * 0.48);
    act(b, 'goblet'); let seen = new Set(); for (let t = 0; t < 4; t += 1 / 60) { G.step(1 / 60); seen.add(b.state); }
    out.heal2 = { hp: +hpk(b).toFixed(4), max: Math.floor(b.stats.maxHp * 0.499) >= b.hp, phase: b.phase, wither: seen.has('wither'), crone: b.crone, inv: b.invuln };
    // ─ 15% 강제: 하던 패턴(왈츠·욕조·흡수)을 1틱 안에 끊고 성배 · 아케이드면 보통 성배 (끊을 수 있다, 회복) ─
    out.force = {};
    for (const pat of ['waltz', 'crimsonBath', 'drain', 'lastDance']) {
      G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
      act(b, pat); G.step(0.6);
      const st0 = b.state;
      b.hp = Math.floor(b.stats.maxHp * 0.16); b.hitPart = b.pBody; b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
      const same = b.state; G.step(1 / 60);
      out.force[pat] = { pre: st0, sameTick: same, next: b.state, last: b._lastMode, pull: G.world.entities.filter((e) => !e.dead && e.kind === 'hazard' && e.harmless && e.circle == null && e.tick && pat === 'drain').length };
    }
    // 아케이드 강제 성배: 보통 회춘의 잔 (끊지 않으면 회복) · 두 번째 15% 는 없다
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
    b.hp = Math.floor(b.stats.maxHp * 0.16); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60);
    const ah0 = b.hp, ast = b.state; for (let t = 0; t < 3 && b.state === 'goblet'; t += 1 / 60) G.step(1 / 60);
    const aHeal = b.hp - ah0; quiet(b);
    b.hp = Math.floor(b.stats.maxHp * 0.14); b.takeHit(Math.ceil(b.stats.maxHp * 0.01), { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60);
    out.arcade15 = { st: ast, heal: aHeal, want: Math.round(b.stats.maxHp * 0.04), twice: b.state === 'goblet' || b.forced.includes('goblet'), dialog: G.world.dialog?.id ?? null };
    // 스토리: b_bride_last 한 번 → 대사가 끝나면 성배가 깨지고 2.5초 긴 무릎 (몸통 0.6) · 부활 뒤 강제는 다시, 대사는 다시 안 나온다
    G.S.forceCutscene = false; G.O.story = true; G.O.dlg = 1.0;
    G.build(id, { phase: 1 }); G.world.mode = 'story'; G.step(6); b = G.boss; quiet(b);
    act(b, 'crimsonBath'); G.step(0.5);
    b.hp = Math.floor(b.stats.maxHp * 0.16); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
    G.step(2 / 60);   // 1틱: 패턴을 끊고 goblet · 2틱: 성배 첫 프레임 (스토리 15% 판정)
    const sl = { st: b.state, last: b._lastMode, hasScript: !!(await import('../src/data/story.js')).SCRIPTS.b_bride_last, gp: b.hitParts().includes(b.pGob) };
    let dlg = null, seq = [], stagT = 0, body = null;
    for (let t = 0; t < 8; t += 1 / 60) {
      G.step(1 / 60);
      if (G.world.dialog?.id && !dlg) dlg = G.world.dialog.id;
      if (seq[seq.length - 1] !== b.state) seq.push(b.state);
      if (b.state === 'stagger') { stagT += 1 / 60; if (!body && stagT > 0.2) body = { body: b.pBody.defMul, long: b.stagLong }; }
      if (b.state === 'idle' && stagT > 0) break;
    }
    sl.dialog = dlg; sl.seq = seq; sl.stagT = +stagT.toFixed(2); sl.body = body; sl.broke = b.gobBreakT > 0; sl.healedNo = b.hp <= Math.floor(b.stats.maxHp * 0.16);
    G.reset(); G.step(0.5);
    b.debugPhase(1); G.step(6); quiet(b);
    b.hp = Math.floor(b.stats.maxHp * 0.16); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60);
    sl.again = b.state === 'goblet'; sl.lastAgain = b._lastMode;
    let dlg2 = false; for (let t = 0; t < 3; t += 0.05) { G.step(0.05); if (G.world.dialog?.id === 'b_bride_last') dlg2 = true; }
    sl.dialogAgain = dlg2; sl.seen = G.world.state.progress.seenScripts.filter((s) => s === 'b_bride_last').length;
    out.story15 = sl;
    G.O.story = false; G.O.dlg = 1.5;
    // ─ 소환 상한: 1페이즈 흡혈 신부 ≤ 2 · 2페이즈 박쥐 떼 ≤ 2 · 최대면 고르지 않는다 ─
    G.build(id); G.step(2); b = G.boss; quiet(b);
    const caps1 = []; for (let k = 0; k < 3; k++) { b.debugAct('brides'); G.step(1.5); for (const e of b._cMinions) { e.x = b.A.x0 + 10; e.vx = 0; } caps1.push(b.minionCount('vampire_bride')); }
    const pick1 = b.weights().map(([k]) => k).includes('brides');
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
    const caps2 = []; for (let k = 0; k < 3; k++) { b.debugAct('brides'); G.step(1.5); for (const e of b._cMinions) { e.x = b.A.x0 + 10; e.vx = 0; } caps2.push(b.minionCount('bat_swarm')); }
    out.brides = { caps1, pick1, caps2, pick2: b.weights().map(([k]) => k).includes('brides') };
    // ─ 왈츠: 착지점이 A 안 · 플레이어가 선 발판 (A.floor 아래로 가지 않는다) · 박쥐로 흩어진 동안 판정 없음 · 무릎 인사 = 카운터 창 → stagger ─
    G.build(id); G.step(2); b = G.boss; p = G.world.player; A = b.A; quiet(b);
    p.x = 36.5 * T - p.w / 2; p.y = 11 * T - p.h - 2; p.vy = 0; G.step(0.3);
    const onPlat = Math.abs(p.bottom - 11 * T) < 2;
    act(b, 'waltz'); const marks = [], spinZ = new Set(); let ghostHits = 0, ghostN = 0, cw = null;
    for (let t = 0; t < 3 && b.state === 'waltz'; t += 1 / 60) {
      G.step(1 / 60);
      for (const z of fresh((e) => e.data?.mark && !marks.includes(e))) marks.push(z);
      if (b.ghost) { ghostN++; ghostHits += b.hitParts().length + b.contactParts().length; }
      if (b.cWin && !cw) { cw = { tele: b.telegraph }; b.takeHit(10, { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60); cw.state = b.state; break; }
      for (const z of fresh((e) => e.data?.spin)) spinZ.add(z);
    }
    out.waltz = { onPlat, marks: marks.map((z) => [Math.round(z.data.tx), z.data.ty]), A: [A.x0, A.x1, A.floor], ghostN, ghostHits, cw, spins: spinZ.size };
    // ─ 마지막 왈츠: 착지 다섯 · 잔상이 0.45초 뒤 같은 자리 · 무릎 인사 카운터 ─
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
    act(b, 'lastDance'); const spins = new Map(), afters = new Map(); let lcw = null;
    for (let t = 0; t < 4 && b.state === 'lastDance'; t += 1 / 60) {
      G.step(1 / 60);
      for (const z of fresh((e) => e.data?.spin)) if (!spins.has(z.data.k)) spins.set(z.data.k, { x: z.circle.x, y: z.circle.y, t: G.world.time });
      for (const z of fresh((e) => e.data?.after)) { const a = afters.get(z.data.k) ?? { x: z.circle.x, y: z.circle.y, t0: G.world.time, on: null }; if (z.started && a.on == null) a.on = G.world.time; afters.set(z.data.k, a); }
      if (b.cWin && !lcw) { lcw = { tele: b.telegraph }; b.takeHit(10, { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60); lcw.state = b.state; break; }
    }
    out.last = { spins: [...spins.values()].map((s) => [Math.round(s.x), Math.round(s.y)]), afters: [...afters.entries()].map(([k, a]) => ({ k, same: Math.abs(a.x - spins.get(k)?.x) < 0.01 && Math.abs(a.y - spins.get(k)?.y) < 0.01, dt: a.on != null ? +(a.on - spins.get(k).t).toFixed(2) : null })), A: [b.A.x0, b.A.x1], cw: lcw };
    // ─ 가시 채찍: 낮은 띠(디딤면−1칸…디딤면) · 가운데 띠(−2.6…−1.8칸) · 8칸 · 0.35초 간격 ─
    G.build(id); G.step(2); b = G.boss; quiet(b);
    act(b, 'thornLash'); G.step(0.7);
    const L = fresh((e) => e.data?.lash).map((z) => ({ low: z.data.low, y: z.y, h: z.h, w: z.w, warn: z.warn, x: z.x }));
    out.lash = { L, floor: b.A.floor, zx: b.zx, f: b.facing };
    // ─ 피의 욕조: 띠가 경기장 폭 전체 · A.floor 기준 1.6칸 · rehit 0.4 · 떠오름 · 장미 둘 ─
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
    act(b, 'crimsonBath'); G.step(0.2);
    const bz = fresh((e) => e.data?.bath)[0];
    G.step(1.5); const rise = b.ps.rise, roses = fresh((e) => e.data?.rose).length;
    out.bath = { x: bz?.x, w: bz?.w, y: bz?.y, h: bz?.h, warn: bz?.warn, dur: bz?.dur, rehit: bz?.attack.rehit, mv: bz?.attack.mv, A: [b.A.x0, b.A.w, b.A.floor], rise, roses };
    // ─ 세월 흡수: 흡수장 1.6초 → 끝에 터짐(r 150) → 노출 0.9초 몸통 0.7 · 노출 중 5% → stagger ─
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
    act(b, 'drain'); let burst = null, pullOn = 0, exp = null;
    for (let t = 0; t < 3.2 && b.state === 'drain'; t += 1 / 60) {
      G.step(1 / 60);
      const bz2 = fresh((e) => e.data?.drainBurst)[0];
      if (bz2 && bz2.started && !burst) burst = { r: bz2.circle.r, t: +(b.st).toFixed(2), mv: bz2.attack.mv };
      if (fresh((e) => e.kind === 'hazard' && e.harmless && !e.dead && e.w > 1000).length) pullOn++;
      if (b.exposed && !exp) { G.step(1 / 60); exp = { body: b.pBody.defMul, t: +b.st.toFixed(2) }; }
    }
    out.drain = { burst, pullOn, exp };
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
    b.debugAct('drain'); for (let t = 0; t < 3 && !b.exposed; t += 1 / 60) G.step(1 / 60);
    const wasExp = b.exposed; b.hitPart = b.pBody; b.takeHit(Math.ceil(b.stats.maxHp * 0.06), { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60);
    out.drainStagger = { wasExp, state: b.state };
    // ─ 판정 부위 피해 순서 (2페이즈 같은 공격: 머리 > 몸통 > 넝마 자락) — 실제 playerStrike 로 친다 ─
    const { playerStrike } = await import('../src/game/combat.js');
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b); G.step(0.2);
    const dmgOf = (part) => {
      b.hp = Math.floor(b.stats.maxHp * 0.45); b._hits?.clear?.();
      const hp0 = b.hp, cx = part.x + part.w / 2, cy = part.y + part.h / 2;
      const r0 = Math.random; Math.random = () => 0.5;
      try { playerStrike(G.world, { x: cx - 4, y: cy - 4, w: 8, h: 8 }, { team: 'player', owner: G.world.player, stats: { atk: 400, crit: 0 }, mv: 1, hitId: 'tp' + Math.round(cx * 7 + cy), kb: [0, 0], breakWalls: false, dir: 1 }); }
      finally { Math.random = r0; }
      return { dmg: hp0 - b.hp, part: b.hitPart === b.pHead ? 'head' : b.hitPart === b.pBody ? 'body' : b.hitPart === b.pSkirt ? 'rags' : 'other' };
    };
    out.parts = { head: dmgOf(b.pHead), body: dmgOf(b.pBody), rags: dmgOf(b.pSkirt) };
    // ─ 창 상한 (POLISH-4): 1페이즈 무릎 한 번 ≤ 10% (넘는 피해는 줄어 '저항', 곧바로 일어섬) · 왈츠 한 번 ≤ 15% · 필살은 빼고 · 2페이즈 상한 없음 ─
    const mx = () => b.stats.maxHp;
    const hitN = (k, frac, tags) => { const L = []; for (let i = 0; i < k; i++) { const info = {}; b.hitPart = b.pBody; b.takeHit(Math.ceil(mx() * frac), { team: 'player', dir: 1, tags }, G.world, info); L.push(info); } return L; };
    G.build(id); G.step(2); b = G.boss; quiet(b); b.hp = Math.floor(mx() * 0.95);
    b.debugAct('stagger'); G.step(0.2);
    let c0 = b.hp; const si = hitN(4, 0.04); const sLoss = (c0 - b.hp) / mx(); G.step(2 / 60);
    out.capStag = { loss: +sLoss.toFixed(4), capped: si.filter((i) => i.capped).length, resist: si.filter((i) => i.resist).length, stunned: b.stunned, st: b.state };
    G.build(id); G.step(2); b = G.boss; quiet(b); b.hp = Math.floor(mx() * 0.95);
    act(b, 'waltz'); c0 = b.hp; let wn = 0;
    for (let f = 0; f < 108 && b.state === 'waltz'; f++) { G.step(1 / 60); if (!b.ghost && !b.cWin && f % 6 === 0) { hitN(1, 0.03); wn++; } }
    out.capWaltz = { loss: +((c0 - b.hp) / mx()).toFixed(4), hits: wn, st: b.state };
    G.build(id); G.step(2); b = G.boss; quiet(b); b.hp = Math.floor(mx() * 0.95);
    b.debugAct('stagger'); G.step(0.2); c0 = b.hp; hitN(1, 0.2, ['ult']); out.capUlt = +((c0 - b.hp) / mx()).toFixed(4);
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b); b.hp = Math.floor(mx() * 0.45);
    b.debugAct('stagger'); G.step(0.2); c0 = b.hp; hitN(4, 0.04); out.capP2 = +((c0 - b.hp) / mx()).toFixed(4);
    // ─ 회춘의 잔: 수호신 자동 공격은 성배를 '한 대'로 깨지 않는다 (몸통 피해로만 센다) → 못 끊으면 회복 ─
    G.build(id); G.step(2); b = G.boss; quiet(b); b.hp = Math.floor(mx() * 0.8);
    act(b, 'goblet'); G.step(0.4);
    b.hitPart = b.pGob; b.takeHit(Math.ceil(mx() * 0.01), { team: 'player', dir: 1, tags: ['companion', 'guardian'] }, G.world, {}); G.step(1 / 60);
    const gst = b.state, gup = b.gobletUp; for (let t = 0; t < 3 && b.state === 'goblet'; t += 1 / 60) G.step(1 / 60);
    out.gobGuard = { st: gst, up: gup, heals: b.heals, broke: b.gobBreakT > 0 };
    out.notes = G.notes.slice(n0);
    return out;
  }, ID);
  check('회춘의 잔: 체력 85% 초과에서 고르지 않음 · 85% 이하에서 고름', !r.pick.high && r.pick.low, r.pick);
  check('회춘의 잔: 성배 판정 44×44 (머리 위) 한 대 → 깨짐 → stagger (회복 없음)', r.cupHit.gp && r.cupHit.gs.join() === '44,44' && r.cupHit.above && r.cupHit.state === 'stagger' && !r.cupHit.up && r.cupHit.heals === 0 && r.cupHit.broke && !r.cupHit.healed, r.cupHit);
  check('회춘의 잔: 몸통에 최대 체력 3% 이상 → 깨짐 → stagger (1.5% 로는 안 깨짐)', r.bodyHit.after15 === 'goblet' && r.bodyHit.after31 === 'stagger', r.bodyHit);
  check('회춘의 잔: 못 끊으면 정확히 +4% · 두 번 성공하면 더는 고르지 않음 (싸움마다 ≤ 2)', r.heal.d1 === r.heal.want && r.heal.heals === 2 && !r.heal.pick, r.heal);
  check('회춘의 잔 2페이즈: 49.9% 를 넘지 않음 · 전환이 다시 걸리지 않음', r.heal2.max && r.heal2.hp <= 0.499 && r.heal2.phase === 1 && !r.heal2.wither && r.heal2.crone && !r.heal2.inv, r.heal2);
  check('15% 강제: 하던 패턴(왈츠·욕조·흡수·마지막 왈츠)을 1틱 안에 끊고 성배', Object.values(r.force).every((f) => f.pre !== 'goblet' && f.pre !== 'idle' && f.next === 'goblet' && !f.last), r.force);
  check('15% 강제 (아케이드): 보통 회춘의 잔 — 끊지 않으면 +4% · 대사 없음 · 싸움마다 한 번', r.arcade15.st === 'goblet' && r.arcade15.heal === r.arcade15.want && !r.arcade15.twice && !r.arcade15.dialog, r.arcade15);
  const s = r.story15;
  check('15% 강제 (스토리): b_bride_last 한 번 → 카밀라가 성배를 깸 → 2.5초 긴 무릎 (몸통 0.6) · 회복 없음 · 부활 뒤 강제는 다시, 대사는 다시 안 나옴',
    s.st === 'goblet' && s.last && s.hasScript && !s.gp && s.dialog === 'b_bride_last' && s.seq[0] === 'goblet' && s.seq.includes('stagger') && s.broke && s.healedNo && s.body?.body === 0.6 && s.body?.long && s.stagT >= 2.7 && s.stagT <= 2.9
    && s.again && !s.lastAgain && !s.dialogAgain && s.seen === 1, s);
  check('소환 상한: 흡혈 신부 2 → 2 → 2 (≤ 2, 최대면 고르지 않음) · 박쥐 떼 1 → 2 → 2 (≤ 2, 최대면 고르지 않음)', r.brides.caps1.join() === '2,2,2' && !r.brides.pick1 && r.brides.caps2.join() === '1,2,2' && !r.brides.pick2, r.brides);
  const w = r.waltz, A = w.A;
  check('피의 왈츠: 착지 예고 셋 · 착지점이 A 안 · 플레이어가 선 발판(11행) 위 · 박쥐로 흩어진 동안 판정·접촉 없음 · 무릎 인사 = 카운터 창 → stagger',
    w.onPlat && w.marks.length === 3 && w.marks.every(([x, y]) => x >= A[0] && x <= A[1] && (y === 528 || y === A[2]) && y <= A[2]) && w.marks.some(([, y]) => y === 528) && w.ghostN > 5 && w.ghostHits === 0 && w.cw?.tele && w.cw?.state === 'stagger' && w.spins === 3, w);
  const ld = r.last;
  check('마지막 왈츠: 회전 베기 다섯 · 젊은 날의 잔상이 0.45초 뒤 같은 자리 (넷째까지 확인) · 경기장 안 · 무릎 인사 카운터 → stagger',
    ld.spins.length === 5 && ld.afters.length >= 4 && ld.afters.filter((a) => a.dt != null).every((a) => a.same && Math.abs(a.dt - 0.45) <= 0.03) && ld.afters.filter((a) => a.dt != null).length >= 4 && ld.spins.every(([x]) => x >= ld.A[0] && x <= ld.A[1]) && ld.cw?.state === 'stagger', ld);
  const lb = r.lash.L, fl = r.lash.floor, low = lb.find((z) => z.low), mid = lb.find((z) => !z.low);
  check('가시 채찍: 낮은 띠(디딤면−1칸…디딤면) · 가운데 띠(−2.6…−1.8칸) · 8칸 · 0.35초 간격 · 플레이어 쪽',
    lb.length === 2 && low && mid && low.y === fl - 48 && low.h === 48 && Math.abs(mid.y - (fl - 2.6 * 48)) < 0.01 && Math.abs(mid.h - 0.8 * 48) < 0.01 && lb.every((z) => z.w === 384) && Math.abs(Math.abs(lb[1].warn - lb[0].warn) - 0.35) < 1e-6
    && lb.every((z) => (r.lash.f > 0 ? Math.abs(z.x - r.lash.zx) < 1 : Math.abs(z.x + z.w - r.lash.zx) < 1)), r.lash);
  const bt = r.bath;
  check('피의 욕조: 띠 = 경기장 폭 전체 · A.floor 기준 1.6칸 · 예고 1.0초 · 판정 2.4초 · rehit 0.4 · mv 0.35 · 1칸 떠오름 · 장미 둘',
    bt.x === bt.A[0] && bt.w === bt.A[1] && Math.abs(bt.y + bt.h - bt.A[2]) < 0.01 && Math.abs(bt.h - 1.6 * 48) < 0.01 && bt.warn === 1 && bt.dur === 2.4 && bt.rehit === 0.4 && bt.mv === 0.35 && bt.rise > 0.9 && bt.roses === 2, bt);
  check('세월 흡수: 흡수장 → 끝에 터짐 (r 150 · mv 0.85, 2.1초) → 노출 몸통 0.7', r.drain.burst?.r === 150 && r.drain.burst.mv === 0.85 && Math.abs(r.drain.burst.t - 2.1) < 0.05 && r.drain.pullOn > 60 && r.drain.exp?.body === 0.7, r.drain);
  check('세월 흡수: 노출 중 최대 체력 5% → stagger', r.drainStagger.wasExp && r.drainStagger.state === 'stagger', r.drainStagger);
  const pp = r.parts;
  check('판정 부위 피해 순서 (2페이즈 같은 공격): 금 간 얼굴 > 몸통 > 넝마 자락', pp.head.part === 'head' && pp.body.part === 'body' && pp.rags.part === 'rags' && pp.head.dmg > pp.body.dmg && pp.body.dmg > pp.rags.dmg, pp);
  const cs = r.capStag, cw2 = r.capWaltz;
  check('창 상한 (1페이즈): 무릎 한 번에 최대 체력 10% 까지 — 넘는 피해는 줄어들고("저항") 곧바로 일어섬', cs.loss >= 0.0999 && cs.loss <= 0.1011 && cs.capped === 2 && cs.resist === 1 && !cs.stunned && cs.st === 'stagger', cs);
  check('창 상한 (1페이즈): 왈츠 한 번(걸음 · 무릎 인사) 15% 까지 (춤은 끊기지 않음) · 필살은 상한 밖 · 2페이즈 무릎은 상한 없음',
    cw2.hits >= 8 && cw2.loss >= 0.1499 && cw2.loss <= 0.152 && cw2.st === 'waltz' && r.capUlt >= 0.199 && r.capP2 >= 0.159, { waltz: cw2, ult: r.capUlt, p2: r.capP2 });
  check('회춘의 잔: 수호신 자동 공격은 성배를 깨지 않음 (몸통 피해로만 셈) → 못 끊으면 회복', r.gobGuard.st === 'goblet' && r.gobGuard.up && r.gobGuard.heals === 1 && !r.gobGuard.broke, r.gobGuard);
  check('패턴별 검사 오류 0', !r.notes.length, r.notes);
}

// ── 4) 사망 → 부활 (onReset) · 처치 · 적 정지 ──
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, n0 = G.notes.length, W = G.world, d0 = W.lighting.darkness;
    b.debugAct('brides'); G.step(1.4);
    b.hp = Math.floor(b.stats.maxHp * 0.8); b.debugAct('goblet'); for (let t = 0; t < 3 && b.state === 'goblet'; t += 0.05) G.step(0.05);
    const mid = { brides: b.minionCount('vampire_bride'), heals: b.heals };
    b.hp = Math.floor(b.stats.maxHp * 0.51); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, W, {});
    G.step(3.0);   // 전환 → 욕조 (핏물 띠가 깔린다)
    b.debugAct('drain'); G.step(1.0);   // 흡수장
    mid.crone = b.crone; mid.bath = W.entities.filter((e) => e.data?.bath && !e.dead).length; mid.pull = W.entities.filter((e) => e.kind === 'hazard' && e.harmless && e.w > 1000 && !e.dead).length;
    b.debugAct('lastDance'); G.step(0.8); mid.after = W.entities.filter((e) => e.data?.after && !e.dead).length;
    mid.tints = W.overlays.filter((o) => o.owner === b && o.cTint && !o.dead).length;
    G.reset(); G.step(0.6);
    const left = W.entities.filter((e) => !e.dead && e !== b && e.kind !== 'player' && e.kind !== 'bossart' && e.kind !== 'standin' && (e.kind === 'hazard' || e.kind === 'projectile' || e.summoner === b)).length;   // 신부가 쏜 탄 포함
    return { mid, phase: b.phase, state: b.state, crone: b.crone, name: b.def.name, title: b.def.title, portrait: b.def.portrait, h: b.h, w: b.w, bot: b.y + b.h, floor: b.A.floor, inv: b.invuln, heals: b.heals, forced15: b._forced15,
      left, brides: b.minionCount('vampire_bride'), tints: W.overlays.filter((o) => o.owner === b && o.cTint && !o.dead).length, dark: +W.lighting.darkness.toFixed(2), d0: +d0.toFixed(2), notes: G.notes.slice(n0) };
  }, ID);
  check('부활 전: 신부 소환 · 회복 1 · 노파 · 핏물 띠/흡수장/잔상이 실제로 있었다', r.mid.brides > 0 && r.mid.heals === 1 && r.mid.crone && r.mid.pull + r.mid.bath > 0 && r.mid.after > 0, r.mid);
  check('사망→부활: 페이즈 0 · 귀부인 · 엘제베트 · 64×150 · 바닥에 섬 · 장미·신부·박쥐 떼·핏물 띠·흡수장·잔상·색조 정리 · 회복 횟수 0 · 15% 강제 다시 가능',
    r.phase === 0 && !r.crone && r.name === '엘제베트' && r.title === '백작의 첫 신부' && r.portrait === 'portraits/b_bride' && r.h === 150 && r.w === 64 && r.bot === r.floor && !r.inv && r.heals === 0 && !r.forced15
    && r.left === 0 && r.brides === 0 && r.tints === 0 && r.dark === r.d0 && !r.notes.length, r);
}
{
  const r = await page.evaluate((id) => {
    const G = window.__gal, out = {};
    for (const [mode, ph] of [['arcade', 1], ['story', 1], ['arcade', 0]]) {
      G.build(id, { phase: ph }); G.world.mode = mode; G.step(ph ? 6 : 2);
      const b = G.boss, W = G.world, n0 = G.notes.length;
      b.debugAct('roseBloom'); G.step(0.5);
      G.kill(); const d0 = b.dying, ban0 = W.banner?.sub;   // 처치 타격 첫 프레임의 배너
      const until = (T) => { for (let i = 0; i < 2000 && b.dieT < T && !b.dead; i++) G.step(1 / 60); };
      G.step(0.3); const banner = W.banner?.sub;
      until(1.0); const kneel = +b.ps.kneel.toFixed(2), crone = b.crone, v10 = b.vanishK;
      const shards = W.entities.filter((e) => e.kind === 'debris').length;
      until(2.0); const v20 = +b.vanishK.toFixed(2);
      until(3.01); const v30 = +b.vanishK.toFixed(2);
      until(4); G.step(0.5);
      out[mode + ph] = { d0, ban0, banner, kneel, crone, v10, v20, v30, shards, dead: b.dead, dying: +b.dying.toFixed(2), cleared: W.cleared, name: b.def.name,
        roses: W.entities.filter((e) => e.data?.rose && !e.dead).length, notes: G.notes.slice(n0) };
    }
    return out;
  }, ID);
  const a = r.arcade1, s = r.story1, a0 = r.arcade0;
  check('처치: 부제 기본 "격파!" — 처치 타격 첫 프레임부터 "시든 신부 격파!" (50% 를 한 방에 넘겨도) · 파편 폭발 없음 · 장미 기둥 사라짐',
    a.ban0 === '시든 신부 격파!' && a.banner === '시든 신부 격파!' && s.ban0 === '시든 신부 격파!' && a0.ban0 === '시든 신부 격파!' && a0.banner === '시든 신부 격파!' && a0.crone && a0.name === '시든 신부'
    && a.shards === 0 && s.shards === 0 && a.roses === 0 && s.roses === 0, { a: [a.ban0, a.banner], s: s.ban0, a0: [a0.ban0, a0.banner, a0.crone] });
  check('쓰러짐: 무릎 (1.0초) · 언제나 노파', a.kneel > 0.9 && s.kneel > 0.9 && a.crone && s.crone && a0.kneel > 0.9, { a: a.kneel, s: s.kneel, a0: a0.kneel });
  check('아케이드: 무릎 1.2초 → 시든 꽃잎으로 바스러져 3.0초에 사라짐 → 끝', a.v10 === 0 && a.v20 > 0.3 && a.v20 < 0.6 && a.v30 === 1 && a.dead && a.cleared, a);
  check('스토리: 무릎 꿇은 채 남는다 (사라지지 않음)', !s.dead && s.dying > 0 && s.cleared && s.v30 === 0, s);
  check('처치 오류 0', !a.notes.length && !s.notes.length && !a0.notes.length, [...a.notes, ...s.notes, ...a0.notes]);
}
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, W = G.world, n0 = G.notes.length;
    b.debugAct('roseBloom'); G.step(0.5);
    W.freezeEnemies = true;
    const st = b.st, zs = W.entities.filter((e) => e.data?.rose), zt = zs.map((e) => e.t), zx = b.zx;
    G.step(1.0);
    const same = b.st === st && zs.every((e, i) => e.t === zt[i]) && b.zx === zx;
    W.freezeEnemies = false; G.step(0.2);
    return { same, moved: b.st > st, n: zs.length, notes: G.notes.slice(n0) };
  }, ID);
  check('적 정지 중 보스 시계·장미 기둥·위치 멈춤', r.same && r.moved && r.n > 0 && !r.notes.length, r);
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
          G.build(id, { phase: ph }); G.step(ph ? 6 : 2);
          const b = G.boss, A = b.A, n0 = G.notes.length;
          if (act === 'goblet') b.hp = Math.floor(b.stats.maxHp * (ph ? 0.4 : 0.8));
          G.world.player.x = b.zx - b.facing * 200;
          b.debugAct(act);
          let out1 = 0, minX = 1e9, maxX = -1e9, back = -1;
          for (let t = 0; t < 14; t += 0.05) {
            G.step(0.05);
            minX = Math.min(minX, b.zx); maxX = Math.max(maxX, b.zx);
            if (b.zx < A.x0 || b.zx > A.x1 || b.fy > A.floor + 0.5) out1++;
            for (const z of G.world.entities) if (z.kind === 'hazard' && !z.harmless && z.on) { const cx = z.circle ? z.circle.x : z.x + z.w / 2; if (cx < A.x0 - 10 || cx > A.x1 + 10 || z.y > A.floor + 10) out1++; }
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
// ── 6) 데이터 · 그림 · 등록 ──
{
  const r = await page.evaluate(async () => {
    const { BOSSES } = await import('../src/data/bosses.js');
    const { knownBoss } = await import('../src/game/bosses/lazy.js');
    const { BOSS_E } = await import('../src/game/bosses/bosses_e.js');
    const { bosses: EXB } = await import('../src/render/painted/reg/ex-boss.js');
    const d = BOSSES.b_bride;
    const ok = async (u) => (await fetch(u)).ok;
    return { has: !!d, stage: d?.stageId, drops: d?.drops, phases: d?.phases, size: d?.size, form2: d?.form2, portrait: d?.portrait, music: d?.music, weak: d?.weak, resist: d?.resist, lazy: knownBoss('b_bride'), cls: typeof BOSS_E.b_bride, painted: typeof EXB.b_bride,
      files: { p1: await ok('../assets/portraits/b_bride.webp'), p2: await ok('../assets/portraits/b_bride2.webp'), vesper: await ok('../assets/portraits/cmp_gd_vesper.webp'), atlas: await ok('../assets/painted/bosses/b_bride/atlas.webp'), man: await ok('../assets/painted/bosses/b_bride/manifest.json') } };
  });
  check('데이터: BOSSES.b_bride · s24 · phases [0.5] · 64×150 · form2 시든 신부 · 드롭 없음 · dracula · 신성·화염 약점 · lazy · 클래스 · 채색 등록 · 초상화 셋 · 아틀라스',
    r.has && r.stage === 's24' && r.phases?.join() === '0.5' && r.size?.w === 64 && r.size?.h === 150 && r.form2?.name === '시든 신부' && r.form2?.portrait === 'portraits/b_bride2' && Array.isArray(r.drops) && r.drops.length === 0 && r.music === 'dracula'
    && r.weak?.join() === 'holy,fire' && r.resist?.join() === 'dark' && r.lazy && r.cls === 'function' && r.painted === 'function' && Object.values(r.files).every(Boolean), r);
  const src = fs.readFileSync(new URL('../src/game/bosses/e_bride.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('inferno 를 읽지 않음 (세기는 stage.level · diff 한 길로만 — ngplus.md §3.1)', !/\binferno\b/.test(src), null);
  const kb = fs.statSync(new URL('../assets/painted/bosses/b_bride/atlas.webp', import.meta.url)).size / 1024;
  check(`아틀라스 ≤ 96 KiB (${kb.toFixed(1)} KiB)`, kb <= 96, kb);
}

const bad = results.filter((r) => !r.ok);
for (const r of results) if (r.summary) console.log(`${r.ok ? '✓' : '✗'} ${r.summary}`);
for (const r of results) if (!r.summary) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
console.log(`\n${results.length - bad.length}/${results.length} 통과`);
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.slice(0, 20).join('\n') : 'NO PAGE ERRORS');
await browser.close(); srv.close();
process.exit(bad.length || errs.length ? 1 : 0);
