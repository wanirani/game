// 카론(b_charon, s25 외전 보스) 패턴 검사 — 결정적 스텝 (EX5-BOSS, docs/specs/ex_s25.md §8). 갤러리(tools/gallery_bosses_e.html)에서
//  · 모든 공격 패턴 10개 × 페이즈 0/1 debugAct → idle 로 돌아오는지, 판정 개체·탄·소환이 생기는지, 오류 0 (debugAct 직전에 있던 개체는 세지 않는다)
//  · 전환 unbridle (form2 칭호 '말을 잃은 마부' · 같은 초상화 · 판정 66×168 · 발 = 마차 가운데 x · A.floor · 말 그리기 꺼짐) · debugPhase(n) · 보조 stagger · lastLoad ·
//    없는 상태 경고 · 사망→부활 onReset (마차·말 둘·200×130·'사신의 마부', 관·해골·도깨비불·원혼·혼불·사슬 띠·흡수장·마차 혼·색조 정리) ·
//    처치 (스토리: 주저앉음 유지 / 아케이드: 3.0초에 재로 사라짐, 파편 폭발 없음, 부제 '격파!' — 처치 타격 첫 프레임부터 '카론 격파!') · 적 정지
//  · 보스별: 질주 — 띠 = A.floor−2.6칸…A.floor, 끝이 A 안(말 머리 기준), 투기장 9행 발판 위는 맞지 않음, 카운터 창 한 대 → stagger ·
//    등불 — 플레이어 한 대 → 꺼짐·소환 없음·노출, 수호신 한 대로는 안 꺼짐 · 소환 상한(해골 ≤ 2 · 도깨비불 ≤ 3 · 원혼 ≤ 2) · 관·통행료 기둥이 A 안 ·
//    빈 영구차가 전환 직후 강제 · 망자 부르기 끝에 터짐·노출 0.7 · 15% 강제 — 하던 패턴(질주·빈 영구차·망자 부르기)을 1틱 안에 끊음,
//    스토리면 b_charon_last 한 번 → 2.5초 주저앉음, 아케이드면 보통 올가미 · 1페이즈 창 상한 12/10/8% (필살은 상한 밖) ·
//    판정 부위 피해 순서 (1페이즈 마부 > 몸통 > 바퀴, 2페이즈 머리 > 몸통 > 자락 — 숫자가 아니라 피해로 잰다) ·
//    투기장(arena r1)에서 패턴 10개가 경계 안에서 돈다 · drops 빈 목록 · inferno 를 읽지 않음
// 사용: node tools/test_charon.mjs   (종료 코드 0 = 모두 통과 · 페이지 오류 0). Math.random 은 페이지에서 고정 시드로 바꿔 매번 같은 결과.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from './serve.mjs';

const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
// 결정적: 페이지의 Math.random 을 시드 난수로 (패턴 선택·관 방향·사슬 띠 순서)
await ctx.addInitScript(() => { let s = 0x5c4a7e1; Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/상태 'nope'/.test(m.text())) errs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/tools/gallery_bosses_e.html?id=b_charon&paused=1`);
await page.waitForFunction(() => window.__gal?.done, null, { timeout: 60000 });
await page.evaluate(() => { window.__gal.O.paused = true; });

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) console.log('✗', name, JSON.stringify(info)); };
const ID = 'b_charon';

// ── 1) 공격 패턴 × 페이즈 ──
const attacks = await page.evaluate((id) => { const G = window.__gal; G.build(id); return G.boss.attackNames(); }, ID);
check('공격 패턴 10개 (질주·채찍·관·등불·짓밟기·고삐 사슬·등불 휘두르기·통행료·빈 영구차·망자 부르기)', attacks.join() === 'deathRun,whipCrack,coffinDrop,soulLantern,rearStomp,reinChain,lanternSwing,toll,hearseGhost,gatherSouls', attacks);
for (const ph of [0, 1]) {
  for (const act of attacks) {
    const r = await page.evaluate(({ id, ph, act }) => {
      const G = window.__gal;
      G.build(id, { phase: ph });
      G.step(ph ? 7 : 2);   // 등장 · 전환의 강제 패턴(hearseGhost)이 끝나게
      const b = G.boss, W = G.world;
      W.player.x = b.zx - b.facing * 330;
      const n0 = G.notes.length;
      const pre = new Set(W.entities);   // 등장 뒤 AI 가 이미 고른 패턴이 남긴 판정·탄은 세지 않는다
      const ok = b.debugAct(act);
      const st0 = b.state;
      let maxHaz = 0, maxProj = 0, tele = false, t = 0, back = -1, hits0 = W.player.hits, mins0 = (b._cMinions ?? []).filter((e) => !e.dead).length, mins = 0;
      for (; t < 14; t += 0.05) {
        G.step(0.05);
        const ents = G.world.entities.filter((e) => !pre.has(e));
        maxHaz = Math.max(maxHaz, ents.filter((e) => e.kind === 'hazard' && !e.harmless).length);
        maxProj = Math.max(maxProj, ents.filter((e) => e.kind === 'projectile').length);
        mins = Math.max(mins, (b._cMinions ?? []).filter((e) => !e.dead).length);
        if (b.telegraph) tele = true;
        if (b.state !== act) { back = t; break; }
      }
      return { ok, st0, back: +back.toFixed(2), next: b.state, phase: b.phase, coach: b.coach, maxHaz, maxProj, tele, hits: W.player.hits - hits0, mins: mins - mins0, inv: b.invuln, notes: G.notes.slice(n0) };
    }, { id: ID, ph, act });
    const made = r.maxHaz + r.maxProj + r.mins > 0;
    check(`P${ph + 1} ${act}`, r.ok && r.st0 === act && r.back > 0 && r.phase === ph && r.coach === !ph && !r.notes.length && made && !r.inv, r);
    results[results.length - 1].summary = `P${ph + 1} ${act.padEnd(13)} → ${String(r.back).padStart(5)}s 판정 ${r.maxHaz} 탄 ${r.maxProj}${r.mins ? ` 소환 ${r.mins}` : ''} 예고 ${r.tele ? 'O' : '-'} 피격 ${r.hits}`;
  }
}

// ── 2) 전환 · debugPhase · 보조 · 없는 상태 ──
const trans = await page.evaluate((id) => { const G = window.__gal; G.build(id); return { tr: G.boss.transitionNames(), help: G.boss.helperNames() }; }, ID);
check('전환 상태 unbridle · 보조 stagger · lastLoad', trans.tr.join() === 'unbridle' && trans.help.join() === 'stagger,lastLoad', trans);
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, n0 = G.notes.length, out = {}, A = b.A;
    b.debugAct('idle'); b.idleWait = 99; G.step(0.3);
    const zx0 = +b.zx.toFixed(2);
    out.size0 = [b.w, b.h]; out.bot0 = b.y + b.h; out.floor = A.floor; out.title0 = b.def.title; out.horses0 = b.horsesOn;
    // 진짜 경계 넘기: 체력 51% 에서 한 대 → onPhase(1) → 전환 unbridle
    b.hp = Math.floor(b.stats.maxHp * 0.51); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
    out.st0 = b.state; out.inv0 = b.invuln; out.contact0 = b.hurtboxes().length;
    G.step(0.7); out.free = b.hFree; out.coach07 = b.coach;
    G.step(0.9); out.horses16 = b.horsesOn; out.coach16 = b.coach; out.broke = b.broke > 0;
    G.step(0.3); out.stand19 = b.man === 'stand'; out.title19 = b.def.title;
    G.step(0.2); out.stand21 = b.man === 'stand'; out.title = b.def.title; out.name = b.def.name; out.portrait = b.def.portrait; out.size = [b.w, b.h];
    out.bot = +(b.y + b.h).toFixed(2); out.footX = +(b.x + b.w / 2).toFixed(2); out.zx = +b.zx.toFixed(2); out.zx0 = zx0; out.O = [+b.O.x.toFixed(2), +b.O.y.toFixed(2)];
    let after = null; for (let t = 0; t < 3 && !after; t += 0.05) { G.step(0.05); if (b.state !== 'unbridle' && b.state !== 'idle') after = b.state; }
    out.after = after; out.inv = b.invuln; out.phase = b.phase; out.headMul = b.pHead.defMul; out.skirtMul = b.pSkirt.defMul; out.horses = b.horsesOn;
    // debugAct('unbridle') 로 다시 보여 주기 (형태는 한 번뿐)
    out.re = b.debugAct('unbridle'); out.reState = b.state; G.step(3.2); out.reAfter = b.state; out.reCoach = b.coach; out.rePhase = b.phase;
    out.notes = G.notes.slice(n0);
    return out;
  }, ID);
  check('전환 unbridle: 무적·판정 없음 · 0.6초 굴레가 끊어져 말이 내달림 · 1.6초 말 사라짐 · 마차 부서짐 · 1.9초까지 칭호 그대로 → 2.0초 마부 혼자 · form2 말을 잃은 마부 · 같은 초상화',
    r.st0 === 'unbridle' && r.inv0 && r.contact0 === 0 && r.free && r.coach07 && !r.horses16 && !r.coach16 && r.broke && r.title19 === '사신의 마부' && r.stand21 && r.title === '말을 잃은 마부' && r.name === '카론' && r.portrait === 'portraits/b_charon' && !r.notes.length && r.horses0, r);
  check('전환: 판정 200×130 → 66×168 · 아래 끝 A.floor 그대로 · 발 = 마차 가운데 x', r.size0.join() === '200,130' && r.size.join() === '66,168' && r.bot0 === r.floor && r.bot === r.floor && r.footX === r.zx && r.zx === r.zx0 && r.O[0] === r.zx && r.O[1] === r.floor, r);
  check('debugAct(unbridle) 다시 보여 주기 → 전환 → 끝 (마부 그대로 · 페이즈 1)', r.re && r.reState === 'unbridle' && r.reAfter !== 'unbridle' && !r.reCoach && r.rePhase === 1, { re: r.re, st: r.reState, after: r.reAfter });
  check('전환 뒤: 곧바로 빈 영구차 (강제 hearseGhost) · 말 그리기 꺼짐 · 모자 0.85 · 외투 자락 1.15', r.after === 'hearseGhost' && !r.inv && r.phase === 1 && !r.horses && r.headMul === 0.85 && r.skirtMul === 1.15, { after: r.after, headMul: r.headMul, skirt: r.skirtMul, horses: r.horses });
}
for (const n of [0, 1]) {
  const r = await page.evaluate(({ id, n }) => {
    const G = window.__gal; const n0 = G.notes.length; G.build(id, { phase: n }); G.step(1.0); const b = G.boss;
    const parts = b.hitParts().map((p) => p.defMul);
    return { phase: b.phase, coach: b.coach, inv: b.invuln, title: b.def.title, size: [b.w, b.h], parts, horses: b.horsesOn, notes: G.notes.slice(n0) };
  }, { id: ID, n });
  check(`debugPhase(${n}) — ${n ? '마부 · 모자 0.85(노릴 곳) · 몸통 1.0 · 외투 자락 1.15' : '영구 마차 · 마부(마부석) 0.85 · 몸통 1.0 · 바퀴 둘 1.15 · 말 판정 없음'}`,
    r.phase === n && r.coach === !n && !r.inv && r.parts.join() === (n ? '0.85,1,1.15' : '0.85,1,1.15,1.15') && r.title === (n ? '말을 잃은 마부' : '사신의 마부') && r.size.join() === (n ? '66,168' : '200,130') && r.horses === !n && !r.notes.length, r);
}
for (const ph of [0, 1]) {
  for (const s of [...trans.help, 'idle']) {
    const r = await page.evaluate(({ id, s, ph }) => {
      const G = window.__gal; G.build(id, { phase: ph }); G.step(ph ? 7 : 2); const b = G.boss, n0 = G.notes.length;
      const pre = new Set(G.world.entities);
      const ok = b.debugAct(s); const st0 = b.state; G.step(0.5);
      const mid = { man: (b.coach ? b.pMan : b.pHead).defMul, body: (b.coach ? b.pBody : b.pTorso).defMul, stunned: b.stunned, contact: b.contactParts().length };
      let noose = 0; for (let t = 0; t < 1.4; t += 0.05) { G.step(0.05); noose = Math.max(noose, G.world.entities.filter((e) => !pre.has(e) && e.data?.noose).length); }
      return { ok, st0, mid, noose, after: b.state, notes: G.notes.slice(n0) };
    }, { id: ID, s, ph });
    check(`P${ph + 1} 보조 ${s}`, r.ok && (s === 'idle' ? r.st0 === 'idle' : r.st0 === s && r.after !== s) && !r.notes.length, r);
    if (s === 'stagger') check(`P${ph + 1} stagger: 1.4초 · 몸통 0.7 · ${ph ? '머리' : '마부'} 0.6 · 접촉 없음`, r.mid.stunned && r.mid.body === 0.7 && r.mid.man === 0.6 && r.mid.contact === 0, r.mid);
    if (s === 'lastLoad') check(`P${ph + 1} lastLoad (아케이드): 보통 올가미 공격 (warnLine → strikeLine)`, r.noose === 1, r);
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
    const mx = () => G.boss.stats.maxHp;
    let b, p, A;
    // ─ 질주: 띠 A.floor−2.6칸…A.floor · 말 머리부터 마차 끝까지 · 말 머리가 A 안에서 멈춤 · 앞들기 = 카운터 창 → stagger ─
    G.build(id); G.step(2); b = G.boss; A = b.A; quiet(b);
    b.zx = A.x0 + 600; b.facing = b.fk = 1; G.world.player.x = A.x1 - 200; G.step(0.1);
    act(b, 'deathRun'); let band = null, maxX = 0, cw = null, warnW = null;
    for (let t = 0; t < 5 && b.state === 'deathRun'; t += 1 / 60) {
      G.step(1 / 60);
      const wz = fresh((e) => e.data?.runWarn)[0]; if (wz && !warnW) warnW = { x: wz.x, w: wz.w, y: wz.y, h: wz.h };
      const z = fresh((e) => e.data?.run && !e.dead)[0];
      if (z && z.on) band = { x: z.x, w: z.w, y: z.y, h: z.h, mv: z.attack.mv, zx: b.zx };
      maxX = Math.max(maxX, b.zx);
      if (b.cWin && !cw) { cw = { tele: b.telegraph, zx: b.zx }; b.takeHit(10, { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60); cw.state = b.state; break; }
    }
    out.run = { band, warnW, maxX, head: maxX + 254, A: [A.x0, A.x1, A.floor, A.w], cw };
    // 카운터 창: 수호신 한 대로는 무릎이 아니다
    G.build(id); G.step(2); b = G.boss; quiet(b); b.zx = A.x0 + 600; b.facing = b.fk = 1; G.world.player.x = A.x1 - 200; G.step(0.1);
    act(b, 'deathRun'); let gcw = null;
    for (let t = 0; t < 5 && b.state === 'deathRun'; t += 1 / 60) { G.step(1 / 60); if (b.cWin && !gcw) { b.takeHit(10, { team: 'player', dir: 1, tags: ['companion', 'guardian'] }, G.world, {}); G.step(1 / 60); gcw = { state: b.state, cWin: b.cWin }; } }
    out.runGuard = gcw;
    // ─ 등불: 플레이어 한 대 → 꺼짐 · 소환 없음 · 노출 (마부 0.7) ─
    G.build(id); G.step(2); b = G.boss; quiet(b);
    act(b, 'soulLantern'); G.step(0.4);
    const lp = b.hitParts().includes(b.pLan), ls = [b.pLan.w, b.pLan.h];
    b.hitPart = b.pLan; b.takeHit(5, { team: 'player', dir: 1 }, G.world, {}); G.step(2 / 60);
    const lExp = { up: b.lanUp, broken: b.lanBroken, exposed: b.exposed, man: b.pMan.defMul, state: b.state };
    for (let t = 0; t < 2 && b.state === 'soulLantern'; t += 1 / 60) G.step(1 / 60);
    out.lantern = { lp, ls, ...lExp, wisps: b.minionCount('wisp'), seekers: fresh((e) => e.data?.seeker).length, after: b.state };
    // 수호신 한 대로는 안 꺼짐 → 1.2초에 도깨비불 둘 + 혼불 셋
    G.build(id); G.step(2); b = G.boss; quiet(b);
    act(b, 'soulLantern'); G.step(0.4);
    b.hitPart = b.pLan; b.takeHit(Math.ceil(mx() * 0.01), { team: 'player', dir: 1, tags: ['companion', 'guardian'] }, G.world, {}); G.step(2 / 60);
    const gUp = b.lanUp, gBroken = b.lanBroken;
    for (let t = 0; t < 2 && b.state === 'soulLantern'; t += 1 / 60) G.step(1 / 60);
    out.lanGuard = { up: gUp, broken: gBroken, wisps: b.minionCount('wisp'), seekers: fresh((e) => e.data?.seeker).length };
    // ─ 소환 상한: 해골 ≤ 2 (관) · 도깨비불 ≤ 3 (등불) · 원혼 ≤ 2 (망자 부르기) ─
    const caps = (ph, pat, mid) => {
      G.build(id, { phase: ph }); G.step(ph ? 7 : 2); const bb = G.boss; quiet(bb); for (const e of bb._cMinions) e.dead = true; const L = [];
      for (let k = 0; k < 3; k++) { bb.debugAct(pat); for (let t = 0; t < 4 && bb.state === pat; t += 0.05) G.step(0.05); for (const e of bb._cMinions) { e.x = bb.A.x0 + 10; e.vx = 0; } L.push(bb.minionCount(mid)); quiet(bb); }
      return L;
    };
    out.caps = { skel: caps(0, 'coffinDrop', 'skeleton'), wisp: caps(0, 'soulLantern', 'wisp'), ghost: caps(1, 'gatherSouls', 'ghost') };
    // ─ 관 · 통행료 기둥이 A 안 (플레이어가 경기장 끝에 있어도) ─
    const inA = [];
    for (const [ph, pat, key, px] of [[0, 'coffinDrop', 'coffin', 0], [0, 'coffinDrop', 'coffin', 1], [1, 'toll', 'toll', 0], [1, 'toll', 'toll', 1]]) {
      G.build(id, { phase: ph }); G.step(ph ? 7 : 2); b = G.boss; quiet(b); A = b.A;
      G.world.player.x = px ? A.x1 - 30 : A.x0 + 2; G.step(0.05);
      act(b, pat); const xs = new Set();
      for (let t = 0; t < 3 && b.state === pat; t += 1 / 60) { G.step(1 / 60); for (const z of fresh((e) => e.data?.[key])) xs.add(z.x + z.w / 2); }
      inA.push({ pat, px, xs: [...xs].map(Math.round), ok: xs.size > 0 && [...xs].every((x) => x >= A.x0 + 30 && x <= A.x1 - 30) });
    }
    out.inA = inA;
    // ─ 망자 부르기: 흡수장 1.4초 → 터짐 (r 150 · mv 0.85, 1.9초) → 노출 몸통 0.7 · 노출 중 5% → stagger ─
    G.build(id, { phase: 1 }); G.step(7); b = G.boss; quiet(b);
    act(b, 'gatherSouls'); let burst = null, pullOn = 0, exp = null;
    for (let t = 0; t < 3.2 && b.state === 'gatherSouls'; t += 1 / 60) {
      G.step(1 / 60);
      const bz2 = fresh((e) => e.data?.gatherBurst)[0];
      if (bz2 && bz2.started && !burst) burst = { r: bz2.circle.r, t: +(b.st).toFixed(2), mv: bz2.attack.mv };
      if (fresh((e) => e.kind === 'hazard' && e.harmless && !e.dead && e.data?.gather).length) pullOn++;
      if (b.exposed && !exp) { G.step(1 / 60); exp = { body: b.pTorso.defMul, t: +b.st.toFixed(2), tele: b.telegraph }; }
    }
    out.gather = { burst, pullOn, exp };
    G.build(id, { phase: 1 }); G.step(7); b = G.boss; quiet(b);
    b.debugAct('gatherSouls'); for (let t = 0; t < 3 && !b.exposed; t += 1 / 60) G.step(1 / 60);
    const wasExp = b.exposed; b.hitPart = b.pTorso; b.takeHit(Math.ceil(mx() * 0.06), { team: 'player', dir: 1 }, G.world, {}); G.step(2 / 60);
    out.gatherStagger = { wasExp, state: b.state };
    // ─ 15% 강제: 하던 패턴(질주·빈 영구차·망자 부르기)을 1틱 안에 끊고 lastLoad · 아케이드면 보통 올가미 ─
    out.force = {};
    for (const pat of ['deathRun', 'hearseGhost', 'gatherSouls']) {
      G.build(id, { phase: 1 }); G.step(7); b = G.boss; quiet(b);
      act(b, pat); G.step(0.6);
      const st0 = b.state;
      b.hp = Math.floor(mx() * 0.16); b.hitPart = b.pTorso; b.takeHit(Math.ceil(mx() * 0.02), { team: 'player', dir: 1 }, G.world, {});
      const same = b.state; G.step(1 / 60);
      const left = G.world.entities.filter((e) => !e.dead && (e.data?.ghost || e.data?.run || e.data?.gather)).length;
      out.force[pat] = { pre: st0, sameTick: same, next: b.state, last: b._lastMode, left };
    }
    G.build(id, { phase: 1 }); G.step(7); b = G.boss; quiet(b);
    b.hp = Math.floor(mx() * 0.16); b.takeHit(Math.ceil(mx() * 0.02), { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60);
    pre = new Set(); const ast = b.state; let noose = 0, collapse = false;
    for (let t = 0; t < 2 && b.state === 'lastLoad'; t += 1 / 60) { G.step(1 / 60); noose = Math.max(noose, G.world.entities.filter((e) => e.data?.noose && !e.dead).length); }
    collapse = b.state === 'stagger';
    quiet(b); b.hp = Math.floor(mx() * 0.14); b.takeHit(Math.ceil(mx() * 0.01), { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60);
    out.arcade15 = { st: ast, noose, collapse, twice: b.state === 'lastLoad' || b.forced.includes('lastLoad'), dialog: G.world.dialog?.id ?? null };
    // 스토리: b_charon_last 한 번 → 대사가 끝나면 그림메인이 들이받아 2.5초 주저앉음 (몸통 0.6) · 부활 뒤 강제는 다시, 대사는 다시 안 나온다
    G.S.forceCutscene = false; G.O.story = true; G.O.dlg = 1.0;
    G.build(id, { phase: 1 }); G.world.mode = 'story'; G.step(7); b = G.boss; quiet(b);
    act(b, 'gatherSouls'); G.step(0.7);
    b.hp = Math.floor(mx() * 0.16); b.takeHit(Math.ceil(mx() * 0.02), { team: 'player', dir: 1 }, G.world, {});
    G.step(2 / 60);   // 1틱: 패턴을 끊고 lastLoad · 2틱: 올가미 첫 프레임 (스토리 15% 판정)
    const sl = { st: b.state, last: b._lastMode, hasScript: !!(await import('../src/data/story.js')).SCRIPTS.b_charon_last };
    let dlg = null, seq = [], stagT = 0, body = null, nooseS = 0;
    for (let t = 0; t < 8; t += 1 / 60) {
      G.step(1 / 60);
      if (G.world.dialog?.id && !dlg) dlg = G.world.dialog.id;
      if (seq[seq.length - 1] !== b.state) seq.push(b.state);
      nooseS = Math.max(nooseS, G.world.entities.filter((e) => e.data?.noose && !e.dead).length);
      if (b.state === 'stagger') { stagT += 1 / 60; if (!body && stagT > 0.2) body = { body: b.pTorso.defMul, long: b.stagLong, slump: +b.ps.slump.toFixed(2) }; }
      if (b.state === 'idle' && stagT > 0) break;
    }
    sl.dialog = dlg; sl.seq = seq; sl.stagT = +stagT.toFixed(2); sl.body = body; sl.noose = nooseS;
    G.reset(); G.step(0.5);
    b.debugPhase(1); G.step(7); quiet(b);
    b.hp = Math.floor(mx() * 0.16); b.takeHit(Math.ceil(mx() * 0.02), { team: 'player', dir: 1 }, G.world, {}); G.step(1 / 60);
    sl.again = b.state === 'lastLoad'; G.step(1 / 60); sl.lastAgain = b._lastMode;
    let dlg2 = false; for (let t = 0; t < 3; t += 0.05) { G.step(0.05); if (G.world.dialog?.id === 'b_charon_last') dlg2 = true; }
    sl.dialogAgain = dlg2; sl.seen = G.world.state.progress.seenScripts.filter((s) => s === 'b_charon_last').length;
    out.story15 = sl;
    G.O.story = false; G.O.dlg = 1.5;
    // ─ 1페이즈 창 상한: 무릎 한 번 ≤ 10% (넘으면 '저항' · 곧바로 일어섬) · 질주 한 번 ≤ 12% (끊기지 않음) · 등불 노출 한 번 ≤ 8% · 필살은 상한 밖 · 2페이즈 없음 ─
    const hitN = (k, frac, tags, part) => { const L = []; for (let i = 0; i < k; i++) { const info = {}; G.boss.hitPart = part ?? (G.boss.coach ? G.boss.pBody : G.boss.pTorso); G.boss.takeHit(Math.ceil(mx() * frac), { team: 'player', dir: 1, tags }, G.world, info); L.push(info); } return L; };
    G.build(id); G.step(2); b = G.boss; quiet(b); b.hp = Math.floor(mx() * 0.95);
    b.debugAct('stagger'); G.step(0.2);
    let c0 = b.hp; const si = hitN(4, 0.04); const sLoss = (c0 - b.hp) / mx(); G.step(2 / 60);
    out.capStag = { loss: +sLoss.toFixed(4), capped: si.filter((i) => i.capped).length, resist: si.filter((i) => i.resist).length, stunned: b.stunned, st: b.state };
    G.build(id); G.step(2); b = G.boss; quiet(b); b.hp = Math.floor(mx() * 0.95);
    act(b, 'deathRun'); c0 = b.hp; let rn = 0;
    for (let f = 0; f < 100 && b.state === 'deathRun'; f++) { G.step(1 / 60); if (!b.cWin && f % 6 === 0) { hitN(1, 0.03); rn++; } }
    out.capRun = { loss: +((c0 - b.hp) / mx()).toFixed(4), hits: rn, st: b.state };
    G.build(id); G.step(2); b = G.boss; quiet(b); b.hp = Math.floor(mx() * 0.95);
    act(b, 'soulLantern'); G.step(0.4); b.hitPart = b.pLan; b.takeHit(5, { team: 'player', dir: 1 }, G.world, {}); G.step(2 / 60);
    c0 = b.hp; const li = hitN(4, 0.03, null, b.pMan); G.step(2 / 60); out.capLan = { loss: +((c0 - b.hp) / mx()).toFixed(4), resist: li.filter((i) => i.resist).length, exposed: b.exposed, st: b.state };
    G.build(id); G.step(2); b = G.boss; quiet(b); b.hp = Math.floor(mx() * 0.95);
    b.debugAct('stagger'); G.step(0.2); c0 = b.hp; hitN(1, 0.2, ['ult']); out.capUlt = +((c0 - b.hp) / mx()).toFixed(4);
    G.build(id, { phase: 1 }); G.step(7); b = G.boss; quiet(b); b.hp = Math.floor(mx() * 0.45);
    b.debugAct('stagger'); G.step(0.2); c0 = b.hp; hitN(4, 0.04); out.capP2 = +((c0 - b.hp) / mx()).toFixed(4);
    // ─ 판정 부위 피해 순서 (같은 공격): 1페이즈 마부 > 몸통 > 바퀴 · 2페이즈 머리 > 몸통 > 자락 — 실제 playerStrike 로 친다 ─
    const { playerStrike } = await import('../src/game/combat.js');
    const dmgOf = (bb, part, names) => {
      bb.hp = Math.floor(bb.stats.maxHp * (bb.phase ? 0.45 : 0.9)); bb._hits?.clear?.();
      const hp0 = bb.hp, cx = part.x + part.w / 2, cy = part.y + part.h / 2;
      const pl = G.world.player; pl.x = cx - pl.w / 2; pl.y = cy - pl.h / 2;   // 가까운 부위 = 이 부위 (플레이어 가운데 기준)
      const r0 = Math.random; Math.random = () => 0.5;
      try { playerStrike(G.world, { x: cx - 4, y: cy - 4, w: 8, h: 8 }, { team: 'player', owner: G.world.player, stats: { atk: 400, crit: 0 }, mv: 1, hitId: 'tp' + Math.round(cx * 7 + cy), kb: [0, 0], breakWalls: false, dir: 1 }); }
      finally { Math.random = r0; }
      const hp = bb.hitPart; return { dmg: hp0 - bb.hp, part: Object.entries(names).find(([, v]) => v === hp)?.[0] ?? 'other' };
    };
    G.build(id); G.step(2); b = G.boss; quiet(b); G.step(0.2);
    const N1 = { man: b.pMan, body: b.pBody, wheel: b.pWheelR };
    out.parts1 = { man: dmgOf(b, b.pMan, N1), body: dmgOf(b, b.pBody, N1), wheel: dmgOf(b, b.pWheelR, N1) };
    G.build(id, { phase: 1 }); G.step(7); b = G.boss; quiet(b); G.step(0.2);
    const N2 = { head: b.pHead, body: b.pTorso, skirt: b.pSkirt };
    out.parts2 = { head: dmgOf(b, b.pHead, N2), body: dmgOf(b, b.pTorso, N2), skirt: dmgOf(b, b.pSkirt, N2) };
    out.notes = G.notes.slice(n0);
    return out;
  }, ID);
  const rn = r.run, A = rn.A, bd = rn.band;
  check('질주: 경고 띠 = 경기장 폭 전체 · 판정 띠 = A.floor−2.6칸…A.floor · mv 0.9 · 말 머리부터 마차 끝까지 (≈358)',
    rn.warnW?.x === A[0] && rn.warnW?.w === A[3] && Math.abs(rn.warnW.y - (A[2] - 2.6 * 48)) < 0.01 && bd && Math.abs(bd.y - (A[2] - 2.6 * 48)) < 0.01 && Math.abs(bd.y + bd.h - A[2]) < 0.01 && bd.mv === 0.9 && Math.abs(bd.w - 358) < 0.5, rn);
  check('질주: 반대쪽 벽 앞에서 멈춤 — 말 머리가 A 안 · 앞들기 = 카운터 창 (예고) → 플레이어 한 대 → stagger', rn.head <= A[1] + 0.01 && rn.head >= A[1] - 10 && rn.cw?.tele && rn.cw?.state === 'stagger', rn);
  check('질주 카운터 창: 수호신 자동 공격 한 대로는 무릎이 아니다', r.runGuard && r.runGuard.state === 'deathRun', r.runGuard);
  const L = r.lantern;
  check('혼불 등불: 등불 판정 44×44 · 플레이어 한 대 → 꺼짐 · 소환 없음 · 노출 (마부 0.7)', L.lp && L.ls.join() === '44,44' && !L.up && L.broken && L.exposed && L.man === 0.7 && L.state === 'soulLantern' && L.wisps === 0 && L.seekers === 0, L);
  check('혼불 등불: 수호신 자동 공격 한 대로는 안 꺼짐 → 1.2초에 도깨비불 둘 + 따라오는 혼불 셋', r.lanGuard.up && !r.lanGuard.broken && r.lanGuard.wisps === 2 && r.lanGuard.seekers === 3, r.lanGuard);
  check('소환 상한: 해골 1 → 2 → 2 (≤ 2) · 도깨비불 2 → 3 → 3 (≤ 3) · 원혼 1 → 2 → 2 (≤ 2)', r.caps.skel.join() === '1,2,2' && r.caps.wisp.join() === '2,3,3' && r.caps.ghost.join() === '1,2,2', r.caps);
  check('관 · 통행료 기둥: 플레이어가 경기장 끝에 있어도 A 안', r.inA.every((x) => x.ok), r.inA);
  check('망자 부르기: 흡수장 → 끝에 터짐 (r 150 · mv 0.85, 1.9초) → 노출 몸통 0.7 · 카운터 창', r.gather.burst?.r === 150 && r.gather.burst.mv === 0.85 && Math.abs(r.gather.burst.t - 1.9) < 0.05 && r.gather.pullOn > 60 && r.gather.exp?.body === 0.7 && r.gather.exp.tele, r.gather);
  check('망자 부르기: 노출 중 최대 체력 5% → stagger', r.gatherStagger.wasExp && r.gatherStagger.state === 'stagger', r.gatherStagger);
  check('15% 강제: 하던 패턴(질주·빈 영구차·망자 부르기)을 1틱 안에 끊고 lastLoad (띠·마차 혼·흡수장 정리)', Object.values(r.force).every((f) => f.pre !== 'lastLoad' && f.pre !== 'idle' && f.next === 'lastLoad' && !f.last && f.left === 0), r.force);
  check('15% 강제 (아케이드): 보통 올가미 공격 — 주저앉음 없음 · 대사 없음 · 싸움마다 한 번', r.arcade15.st === 'lastLoad' && r.arcade15.noose === 1 && !r.arcade15.collapse && !r.arcade15.twice && !r.arcade15.dialog, r.arcade15);
  const s = r.story15;
  check('15% 강제 (스토리): b_charon_last 한 번 → 그림메인이 들이받아 2.5초 주저앉음 (몸통 0.6) · 올가미 판정 없음 · 부활 뒤 강제는 다시, 대사는 다시 안 나옴',
    s.st === 'lastLoad' && s.last && s.hasScript && s.dialog === 'b_charon_last' && s.seq[0] === 'lastLoad' && s.seq.includes('stagger') && s.noose === 0 && s.body?.body === 0.6 && s.body?.long && s.stagT >= 2.7 && s.stagT <= 2.95
    && s.again && !s.lastAgain && !s.dialogAgain && s.seen === 1, s);
  const cs = r.capStag, cr = r.capRun, cl = r.capLan;
  check('창 상한 (1페이즈): 무릎 한 번에 최대 체력 10% 까지 — 넘는 피해는 줄어들고("저항") 곧바로 일어섬', cs.loss >= 0.0999 && cs.loss <= 0.1011 && cs.capped === 2 && cs.resist === 1 && !cs.stunned && cs.st === 'stagger', cs);
  check('창 상한 (1페이즈): 질주 한 번(경고 · 돌진 · 카운터 창) 12% 까지 (질주는 끊기지 않음)', cr.hits >= 8 && cr.loss >= 0.1199 && cr.loss <= 0.1215 && cr.st === 'deathRun', cr);
  check('창 상한 (1페이즈): 등불 노출 한 번 8% 까지 — 닿으면 노출이 끝남', cl.loss >= 0.0799 && cl.loss <= 0.081 && cl.resist >= 1 && !cl.exposed, cl);
  check('창 상한: 필살은 상한 밖 · 2페이즈 무릎은 상한 없음', r.capUlt >= 0.199 && r.capP2 >= 0.159, { ult: r.capUlt, p2: r.capP2 });
  const p1 = r.parts1, p2 = r.parts2;
  check('판정 부위 피해 순서 (1페이즈 같은 공격): 마부 > 마차 몸통 > 바퀴', p1.man.part === 'man' && p1.body.part === 'body' && p1.wheel.part === 'wheel' && p1.man.dmg > p1.body.dmg && p1.body.dmg > p1.wheel.dmg, p1);
  check('판정 부위 피해 순서 (2페이즈 같은 공격): 모자 머리 > 몸통 > 외투 자락', p2.head.part === 'head' && p2.body.part === 'body' && p2.skirt.part === 'skirt' && p2.head.dmg > p2.body.dmg && p2.body.dmg > p2.skirt.dmg, p2);
  check('패턴별 검사 오류 0', !r.notes.length, r.notes);
}

// ── 4) 사망 → 부활 (onReset) · 처치 · 적 정지 ──
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, n0 = G.notes.length, W = G.world, d0 = W.lighting.darkness;
    W.player.x = b.zx - b.facing * 330;
    b.debugAct('coffinDrop'); G.step(2.0);
    b.debugAct('soulLantern'); G.step(1.4);
    const mid = { skel: b.minionCount('skeleton'), wisp: b.minionCount('wisp'), seekers: W.entities.filter((e) => e.data?.seeker && !e.dead).length };
    b.hp = Math.floor(b.stats.maxHp * 0.51); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, W, {});
    G.step(3.6);   // 전환 → 빈 영구차 (마차 혼이 달린다)
    mid.coach = b.coach; mid.ghost = W.entities.filter((e) => e.data?.ghost && !e.dead).length;
    b.debugAct('gatherSouls'); G.step(1.0); mid.pull = W.entities.filter((e) => e.data?.gather && !e.dead).length; mid.ghosts = b.minionCount('ghost');
    b.debugAct('reinChain'); G.step(0.8); mid.chain = W.entities.filter((e) => e.data?.chain && !e.dead).length;
    mid.tints = W.overlays.filter((o) => o.owner === b && o.cTint && !o.dead).length;
    G.reset(); G.step(0.6);
    const left = W.entities.filter((e) => !e.dead && e !== b && e.kind !== 'player' && e.kind !== 'bossart' && e.kind !== 'standin' && (e.kind === 'hazard' || e.kind === 'projectile' || e.summoner === b)).length;
    return { mid, phase: b.phase, state: b.state, coach: b.coach, horses: b.horsesOn, roofN: b.roofN, name: b.def.name, title: b.def.title, portrait: b.def.portrait, h: b.h, w: b.w, bot: b.y + b.h, floor: b.A.floor, inv: b.invuln, forced15: b._forced15, man: b.man,
      left, minions: (b._cMinions ?? []).filter((e) => !e.dead).length, tints: W.overlays.filter((o) => o.owner === b && o.cTint && !o.dead).length, dark: +W.lighting.darkness.toFixed(2), d0: +d0.toFixed(2), notes: G.notes.slice(n0) };
  }, ID);
  check('부활 전: 해골·도깨비불·혼불 · 마부 혼자 · 마차 혼 · 흡수장 · 원혼 · 사슬 띠가 실제로 있었다', r.mid.skel > 0 && r.mid.wisp > 0 && r.mid.seekers > 0 && !r.mid.coach && r.mid.ghost > 0 && r.mid.pull > 0 && r.mid.ghosts > 0 && r.mid.chain > 0, r.mid);
  check('사망→부활: 페이즈 0 · 마차 · 말 둘 · 마부석 · 카론 · 사신의 마부 · 200×130 · 바닥에 섬 · 관·해골·도깨비불·원혼·혼불·사슬 띠·흡수장·마차 혼·색조 정리 · 15% 강제 다시 가능',
    r.phase === 0 && r.coach && r.horses && r.man === 'seat' && r.roofN === 3 && r.name === '카론' && r.title === '사신의 마부' && r.portrait === 'portraits/b_charon' && r.h === 130 && r.w === 200 && r.bot === r.floor && !r.inv && !r.forced15
    && r.left === 0 && r.minions === 0 && r.tints === 0 && r.dark === r.d0 && !r.notes.length, r);
}
{
  const r = await page.evaluate((id) => {
    const G = window.__gal, out = {};
    for (const [mode, ph] of [['arcade', 1], ['story', 1], ['arcade', 0]]) {
      G.build(id, { phase: ph }); G.world.mode = mode; G.step(ph ? 7 : 2);
      const b = G.boss, W = G.world, n0 = G.notes.length;
      b.debugAct(ph ? 'toll' : 'coffinDrop'); G.step(0.7);
      G.kill(); const d0 = b.dying, ban0 = W.banner?.sub, title0 = b.def.title;   // 처치 타격 첫 프레임의 배너
      const until = (T) => { for (let i = 0; i < 2000 && b.dieT < T && !b.dead; i++) G.step(1 / 60); };
      G.step(0.3); const banner = W.banner?.sub;
      until(1.0); const slump = +b.ps.slump.toFixed(2), coach = b.coach, v10 = b.vanishK;
      const shards = W.entities.filter((e) => e.kind === 'debris').length;
      until(2.0); const v20 = +b.vanishK.toFixed(2);
      until(3.01); const v30 = +b.vanishK.toFixed(2);
      until(4); G.step(0.5);
      out[mode + ph] = { d0, ban0, banner, title0, slump, coach, v10, v20, v30, shards, dead: b.dead, dying: +b.dying.toFixed(2), cleared: W.cleared, horses: b.horsesOn,
        cols: W.entities.filter((e) => (e.data?.toll || e.data?.coffin) && !e.dead).length, notes: G.notes.slice(n0) };
    }
    return out;
  }, ID);
  const a = r.arcade1, s = r.story1, a0 = r.arcade0;
  check('처치: 부제 기본 "격파!" — 처치 타격 첫 프레임부터 "카론 격파!" · 칭호 말을 잃은 마부 (50% 를 한 방에 넘겨도) · 파편 폭발 없음 · 관·기둥 사라짐',
    a.ban0 === '카론 격파!' && a.banner === '카론 격파!' && s.ban0 === '카론 격파!' && a0.ban0 === '카론 격파!' && a0.banner === '카론 격파!' && a0.title0 === '말을 잃은 마부' && !a0.coach && !a0.horses
    && a.shards === 0 && s.shards === 0 && a0.shards === 0 && a.cols === 0 && s.cols === 0 && a0.cols === 0, { a: [a.ban0, a.banner], s: s.ban0, a0: [a0.ban0, a0.banner, a0.title0, a0.coach] });
  check('쓰러짐: 주저앉음 (1.0초) · 언제나 마부 혼자', a.slump > 0.9 && s.slump > 0.9 && a0.slump > 0.9 && !a.coach && !s.coach && !a0.coach, { a: a.slump, s: s.slump, a0: a0.slump });
  check('아케이드: 주저앉음 1.2초 → 재와 혼불로 흩어져 3.0초에 사라짐 → 끝', a.v10 === 0 && a.v20 > 0.3 && a.v20 < 0.6 && a.v30 === 1 && a.dead && a.cleared && a0.dead, a);
  check('스토리: 주저앉은 채 남는다 (사라지지 않음)', !s.dead && s.dying > 0 && s.cleared && s.v30 === 0, s);
  check('처치 오류 0', !a.notes.length && !s.notes.length && !a0.notes.length, [...a.notes, ...s.notes, ...a0.notes]);
}
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, W = G.world, n0 = G.notes.length;
    W.player.x = b.zx - b.facing * 330;
    b.debugAct('coffinDrop'); G.step(0.7);
    W.freezeEnemies = true;
    const st = b.st, zs = W.entities.filter((e) => e.data?.coffin), zt = zs.map((e) => e.t), zx = b.zx, ht = b.horses[0].t;
    G.step(1.0);
    const same = b.st === st && zs.every((e, i) => e.t === zt[i]) && b.zx === zx && b.horses[0].t === ht;
    W.freezeEnemies = false; G.step(0.2);
    return { same, moved: b.st > st, n: zs.length, notes: G.notes.slice(n0) };
  }, ID);
  check('적 정지 중 보스 시계·관·위치·말 걸음 멈춤', r.same && r.moved && r.n > 0 && !r.notes.length, r);
}

// ── 5) 투기장 (maps/arena.js r1 40×14): 패턴 10개가 경계 안에서 돈다 · 질주 띠가 9행 발판 위는 맞지 않음 ──
{
  const r = await page.evaluate(async (id) => {
    const G = window.__gal;
    const { ROOMS } = await import('../src/data/maps/arena.js');
    const rows = ROOMS.r1.map, h = rows.length, w = rows[0].length;
    const solids = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ('#%='.includes(rows[y][x])) solids.push([x, y, x, y]);
    const plat9 = []; for (let x = 0; x < w; x++) if ('#%='.includes(rows[9][x]) && !'#%='.includes(rows[8][x])) plat9.push(x);
    const C = G.boss.constructor, P0 = C.PATTERNS;
    const room = { w, h, x0: 1, solids };
    Object.defineProperty(C, 'PATTERNS', { configurable: true, get: () => ({ ...P0, floorRow: h - 2, room }) });
    const out = { acts: {}, notes: [], plat9 };
    try {
      for (const ph of [0, 1]) {
        for (const act of P0.attacks) {
          G.build(id, { phase: ph }); G.step(ph ? 7 : 2);
          const b = G.boss, A = b.A, n0 = G.notes.length;
          G.world.player.x = b.zx - b.facing * 200;
          b.debugAct(act);
          let out1 = 0, minX = 1e9, maxX = -1e9, back = -1, headOut = 0;
          for (let t = 0; t < 14; t += 0.05) {
            G.step(0.05);
            minX = Math.min(minX, b.zx); maxX = Math.max(maxX, b.zx);
            if (b.zx < A.x0 || b.zx > A.x1 || b.fy > A.floor + 0.5) out1++;
            if (b.coach && (b.zx - 254 < A.x0 - 0.5 || b.zx + 254 > A.x1 + 0.5)) headOut++;
            for (const z of G.world.entities) if (z.kind === 'hazard' && !z.harmless && z.on) { const cx = z.circle ? z.circle.x : z.x + z.w / 2; if (cx < A.x0 - 10 || cx > A.x1 + 10 || z.y > A.floor + 10) out1++; }
            if (b.state !== act) { back = t; break; }
          }
          out.acts[`P${ph + 1} ${act}`] = { back: +back.toFixed(2), out: out1, headOut, x: [Math.round(minX), Math.round(maxX)], A: [A.x0, A.x1, A.floor] };
          out.notes.push(...G.notes.slice(n0));
        }
      }
      // 질주 띠: 9행 발판 위에 선 플레이어는 맞지 않는다 (띠 위 19px 여유)
      G.build(id); G.step(2); const b = G.boss, A = b.A, p = G.world.player, T = 48;
      b.debugAct('idle'); b.idleWait = 99;
      const px = (plat9[Math.floor(plat9.length / 2)] + 0.5) * T;
      b.zx = px < A.cx ? A.x1 - 300 : A.x0 + 300; b.facing = b.fk = px < A.cx ? -1 : 1; G.step(0.05);
      p.x = px - p.w / 2; p.y = 9 * T - p.h - 1; p.vy = 0; G.step(0.2);
      const onPlat = Math.abs(p.bottom - 9 * T) < 2, hits0 = p.hits;
      b.debugAct('deathRun'); let over = false, bandTop = null;
      for (let t = 0; t < 5 && b.state === 'deathRun'; t += 1 / 60) {
        G.step(1 / 60); p.x = px - p.w / 2; p.vx = 0;
        const z = G.world.entities.find((e) => e.data?.run && e.on);
        if (z) { bandTop = z.y; if (z.x < p.cx && z.x + z.w > p.cx) over = true; }
      }
      out.plat = { onPlat, over, hits: p.hits - hits0, gap: bandTop != null ? +(bandTop - p.bottom).toFixed(1) : null };
    } finally { Object.defineProperty(C, 'PATTERNS', { configurable: true, get: () => P0 }); }
    return out;
  }, ID);
  const bad = Object.entries(r.acts).filter(([, v]) => !(v.back > 0) || v.out > 0 || v.headOut > 0);
  check('투기장 r1: 패턴 10개 × 페이즈 2 가 경기장 경계·바닥 안에서 끝까지 돈다 (마차는 말 머리까지 A 안)', bad.length === 0 && Object.keys(r.acts).length === 20 && !r.notes.length, bad.length ? bad : Object.values(r.acts)[0]);
  check('투기장 r1: 질주 띠가 9행 발판 위(띠 위 ≈19px)에 선 플레이어를 지나가도 맞지 않는다', r.plat.onPlat && r.plat.over && r.plat.hits === 0 && r.plat.gap >= 18 && r.plat.gap <= 21, r.plat);
}
// ── 6) 데이터 · 그림 · 등록 ──
{
  const r = await page.evaluate(async () => {
    const { BOSSES } = await import('../src/data/bosses.js');
    const { knownBoss } = await import('../src/game/bosses/lazy.js');
    const { BOSS_E } = await import('../src/game/bosses/bosses_e.js');
    const { bosses: EXB } = await import('../src/render/painted/reg/ex-boss.js');
    const d = BOSSES.b_charon;
    const ok = async (u) => (await fetch(u)).ok;
    return { has: !!d, stage: d?.stageId, drops: d?.drops, phases: d?.phases, size: d?.size, form2: d?.form2, portrait: d?.portrait, music: d?.music, weak: d?.weak, resist: d?.resist, title: d?.title, lazy: knownBoss('b_charon'), cls: typeof BOSS_E.b_charon, painted: typeof EXB.b_charon,
      files: { p1: await ok('../assets/portraits/b_charon.webp'), morgen: await ok('../assets/portraits/cmp_mt_morgen.webp'), lo1: await ok('../assets/lo/portraits/b_charon.webp'), lo2: await ok('../assets/lo/portraits/cmp_mt_morgen.webp'), atlas: await ok('../assets/painted/bosses/b_charon/atlas.webp'), man: await ok('../assets/painted/bosses/b_charon/manifest.json') } };
  });
  check('데이터: BOSSES.b_charon · s25 · phases [0.5] · 200×130 · form2 카론 / 말을 잃은 마부 / 같은 초상화 · 드롭 없음 · boss · 신성 약점 · 암흑·얼음 저항 · lazy · 클래스 · 채색 등록 · 초상화 둘 + lo · 아틀라스',
    r.has && r.stage === 's25' && r.phases?.join() === '0.5' && r.size?.w === 200 && r.size?.h === 130 && r.title === '사신의 마부' && r.form2?.name === '카론' && r.form2?.title === '말을 잃은 마부' && r.form2?.portrait === 'portraits/b_charon' && Array.isArray(r.drops) && r.drops.length === 0 && r.music === 'boss'
    && r.weak?.join() === 'holy' && r.resist?.join() === 'dark,ice' && r.lazy && r.cls === 'function' && r.painted === 'function' && Object.values(r.files).every(Boolean), r);
  const src = fs.readFileSync(new URL('../src/game/bosses/e_charon.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('inferno 를 읽지 않음 (세기는 stage.level · diff 한 길로만 — ngplus.md §3.1)', !/\binferno\b/.test(src), null);
  const af = new URL('../assets/painted/bosses/b_charon/atlas.webp', import.meta.url), kb = fs.existsSync(af) ? fs.statSync(af).size / 1024 : Infinity;
  check(`아틀라스 ≤ 64 KiB (${kb.toFixed(1)} KiB)`, kb <= 64, kb);
}

const bad = results.filter((r) => !r.ok);
for (const r of results) if (r.summary) console.log(`${r.ok ? '✓' : '✗'} ${r.summary}`);
for (const r of results) if (!r.summary) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
console.log(`\n${results.length - bad.length}/${results.length} 통과`);
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.slice(0, 20).join('\n') : 'NO PAGE ERRORS');
await browser.close(); srv.close();
process.exit(bad.length || errs.length ? 1 : 0);
