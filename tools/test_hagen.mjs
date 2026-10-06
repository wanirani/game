// 하겐(b_hagen, s23 외전 보스) 패턴 검사 — 결정적 스텝 (EX3-BOSS, docs/specs/ex_s23.md §8). 갤러리(tools/gallery_bosses_e.html)에서
//  · 모든 공격 패턴 × 페이즈 0/1 debugAct → idle 로 돌아오는지, 판정 개체·탄·올가미·소환이 생기는지, 오류 0 (debugAct 직전에 있던 개체는 세지 않는다)
//  · 전환 moonrise (form2 '은빛 늑대' · portraits/b_hagen2 · 판정 크기 112×118 · 발 위치 그대로) · debugPhase(n) · 보조 stagger·offer · 없는 상태 경고 ·
//    사망→부활 onReset (사람 모습·'하겐'·146 높이, 올가미·늑대·달빛·화면 색조 정리) · 처치 (쓰러짐 5초 → 사람으로 누움, 파편 폭발 없음, 부제 '결착!') · 적 정지
//  · 보스별: 조준선 마지막 0.25초 고정(빅터면 0.1초 늦게 — 스토리·1페이즈), 장전 노출 1.15, 산탄은 6칸 밖에서 고르지 않음 · 7알 · 한 번에 최대 3알,
//    올가미 ≤ 4 · 한 대에 부서짐 · 밟으면 묶임 · 8초 수명, 소환 상한(snow_wolf ≤ 3), 덮치기 착지점이 A 안·A.floor 위(발판이면 그 발판) · 세 번째는 벽 차기,
//    달 그림자 화면 밖 동안 판정 없음 · 내리꽂기 셋 · 노출 0.7, 카운터(사냥칼·덮치기·노출 5%) → stagger, offer 는 15% 이하 한 번 + 대사 한 번(스토리) →
//    곧바로 clawRush, 투기장(arena r1)에서 패턴 8개가 경계 안에서 돈다, drops 빈 목록, inferno 를 읽지 않음
// 사용: node tools/test_hagen.mjs   (종료 코드 0 = 모두 통과 · 페이지 오류 0)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from './serve.mjs';

const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/상태 'nope'/.test(m.text())) errs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}`));
await page.goto(`http://localhost:${port}/tools/gallery_bosses_e.html?id=b_hagen&paused=1`);
await page.waitForFunction(() => window.__gal?.done, null, { timeout: 60000 });
await page.evaluate(() => { window.__gal.O.paused = true; });

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) console.log('✗', name, JSON.stringify(info)); };
const ID = 'b_hagen';

// ── 1) 공격 패턴 × 페이즈 ──
const attacks = await page.evaluate((id) => { const G = window.__gal; G.build(id); return G.boss.attackNames(); }, ID);
check('공격 패턴 8개 (조준 사격·은 올가미·산탄·사냥칼·무리 부르기·덮치기·할퀴기 연타·달 그림자)', attacks.join() === 'aimedShot,trapLine,buckshot,huntingKnife,packCall,pounce,clawRush,moonDive', attacks);
for (const ph of [0, 1]) {
  for (const act of attacks) {
    const r = await page.evaluate(({ id, ph, act }) => {
      const G = window.__gal;
      G.build(id, { phase: ph });
      G.step(ph ? 6 : 2);   // 등장 · 전환의 강제 패턴(packCall)이 끝나게
      const b = G.boss, W = G.world;
      W.player.x = b.zx - b.facing * 220;   // 산탄이 닿는 거리
      const n0 = G.notes.length;
      const pre = new Set(W.entities);   // 등장 뒤 AI 가 이미 고른 패턴이 남긴 판정·탄은 세지 않는다
      const ok = b.debugAct(act);
      const st0 = b.state;
      let maxHaz = 0, maxProj = 0, traps = 0, tele = false, t = 0, back = -1, hits0 = W.player.hits, ghost = false, mins0 = (b._cMinions ?? []).filter((e) => !e.dead).length, mins = 0;
      for (; t < 14; t += 0.05) {
        G.step(0.05);
        const ents = G.world.entities.filter((e) => !pre.has(e));
        maxHaz = Math.max(maxHaz, ents.filter((e) => e.kind === 'hazard' && !e.harmless).length);
        maxProj = Math.max(maxProj, ents.filter((e) => e.kind === 'projectile').length);
        traps = Math.max(traps, ents.filter((e) => e.def?.id === 'hagen_trap').length);
        mins = Math.max(mins, (b._cMinions ?? []).filter((e) => !e.dead).length);
        if (b.telegraph) tele = true;
        if (b.ghost) ghost = true;
        if (b.state !== act) { back = t; break; }
      }
      return { ok, st0, back: +back.toFixed(2), next: b.state, phase: b.phase, wolf: b.wolf, maxHaz, maxProj, traps, tele, hits: W.player.hits - hits0, ghost, mins: mins - mins0, inv: b.invuln, notes: G.notes.slice(n0) };
    }, { id: ID, ph, act });
    const made = r.maxHaz + r.maxProj + r.traps + (act === 'packCall' ? r.mins : 0) > 0;
    check(`P${ph + 1} ${act}`, r.ok && r.st0 === act && r.back > 0 && r.phase === ph && r.wolf === !!ph && !r.notes.length && made && !r.inv, r);
    results[results.length - 1].summary = `P${ph + 1} ${act.padEnd(13)} → ${String(r.back).padStart(5)}s 판정 ${r.maxHaz} 탄 ${r.maxProj}${r.traps ? ` 올가미 ${r.traps}` : ''}${act === 'packCall' ? ` 소환 ${r.mins}` : ''} 예고 ${r.tele ? 'O' : '-'} 피격 ${r.hits}${r.ghost ? ' 하늘' : ''}`;
  }
}

// ── 2) 전환 · debugPhase · 보조 · 없는 상태 ──
const trans = await page.evaluate((id) => { const G = window.__gal; G.build(id); return { tr: G.boss.transitionNames(), help: G.boss.helperNames() }; }, ID);
check('전환 상태 moonrise · 보조 stagger·offer', trans.tr.join() === 'moonrise' && trans.help.join() === 'stagger,offer', trans);
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, n0 = G.notes.length, out = {};
    b.debugAct('idle'); b.idleWait = 99; G.step(0.3);
    const foot0 = { x: +b.zx.toFixed(2), y: b.fy };
    out.size0 = [b.w, b.h];
    // 진짜 경계 넘기: 체력 51% 에서 한 대 → onPhase(1) → 전환 moonrise
    b.hp = Math.floor(b.stats.maxHp * 0.51); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
    out.st0 = b.state; out.inv0 = b.invuln; out.contact0 = b.hurtboxes().length;
    G.step(1.9); out.wolf19 = b.wolf; out.name19 = b.def.name;
    G.step(0.2); out.wolf21 = b.wolf; out.name = b.def.name; out.portrait = b.def.portrait; out.title = b.def.title; out.size = [b.w, b.h];
    out.foot = { x: +(b.x + b.w / 2).toFixed(2), y: b.y + b.h, zx: +b.zx.toFixed(2), fy: b.fy }; out.foot0 = foot0;
    out.rifle = !!b.rifleDrop; out.tear = b.tearT > 0;
    let after = null; for (let t = 0; t < 3 && !after; t += 0.05) { G.step(0.05); if (b.state !== 'moonrise' && b.state !== 'idle') after = b.state; }
    out.after = after; out.inv = b.invuln; out.phase = b.phase; out.headMul = b.pHead.defMul;
    // debugAct('moonrise') 로 다시 보여 주기 (형태는 한 번뿐)
    out.re = b.debugAct('moonrise'); out.reState = b.state; G.step(3.2); out.reAfter = b.state; out.reWolf = b.wolf;
    out.notes = G.notes.slice(n0);
    return out;
  }, ID);
  check('전환 moonrise: 무적·판정 없음 · 1.9초까지 사람 → 2.0초 늑대 · form2 은빛 늑대 · portraits/b_hagen2 · 칭호', r.st0 === 'moonrise' && r.inv0 && r.contact0 === 0 && !r.wolf19 && r.name19 === '하겐' && r.wolf21 && r.name === '은빛 늑대' && r.portrait === 'portraits/b_hagen2' && r.title === '사냥꾼이었던 짐승' && !r.notes.length, r);
  check('전환: 판정 크기 60×146 → 112×118 · 발 위치 그대로 · 장총을 내던지고 외투가 찢어짐', r.size0.join() === '60,146' && r.size.join() === '112,118' && r.foot.x === r.foot.zx && r.foot.y === r.foot.fy && r.foot.zx === r.foot0.x && r.foot.fy === r.foot0.y && r.rifle && r.tear, r);
  check('debugAct(moonrise) 다시 보여 주기 → 전환 → 끝 (늑대 그대로)', r.re && r.reState === 'moonrise' && r.reAfter !== 'moonrise' && r.reWolf, { re: r.re, st: r.reState, after: r.reAfter });
  check('전환 뒤: 곧바로 무리 부르기 (강제 packCall) · 주둥이 배율 1.2', r.after === 'packCall' && !r.inv && r.phase === 1 && r.headMul === 1.2, { after: r.after, headMul: r.headMul });
}
for (const n of [0, 1]) {
  const r = await page.evaluate(({ id, n }) => { const G = window.__gal; const n0 = G.notes.length; G.build(id, { phase: n }); G.step(1.0); const b = G.boss; return { phase: b.phase, wolf: b.wolf, inv: b.invuln, name: b.def.name, head: b.pHead.defMul, legs: b.pLegs.defMul, size: [b.w, b.h], parts: b.hitParts().length, notes: G.notes.slice(n0) }; }, { id: ID, n });
  check(`debugPhase(${n}) — ${n ? '늑대 · 주둥이 1.2(노릴 곳) · 등판 · 다리 1.1' : '사람 · 모자 0.9 · 다리 1.15'}`, r.phase === n && r.wolf === !!n && !r.inv && r.head === (n ? 1.2 : 0.9) && r.legs === (n ? 1.1 : 1.15) && r.parts === (n ? 4 : 3) && r.name === (n ? '은빛 늑대' : '하겐') && !r.notes.length, r);
}
for (const ph of [0, 1]) {
  for (const s of [...trans.help, 'idle']) {
    const r = await page.evaluate(({ id, s, ph }) => { const G = window.__gal; G.build(id, { phase: ph }); G.step(ph ? 6 : 2); const b = G.boss, n0 = G.notes.length; const ok = b.debugAct(s); const st0 = b.state; G.step(0.5); const mid = { head: b.pHead.defMul, body: b.pBody.defMul, stunned: b.stunned, offering: b.offering, contact: b.contactParts().length }; G.step(2.4); return { ok, st0, mid, after: b.state, notes: G.notes.slice(n0) }; }, { id: ID, s, ph });
    check(`P${ph + 1} 보조 ${s}`, r.ok && (s === 'idle' ? r.st0 === 'idle' : r.st0 === s && r.after !== s) && !r.notes.length, r);
    if (s === 'stagger') check(`P${ph + 1} stagger: 무릎 1.4초 · 몸통 0.7 · 머리 0.6`, r.mid.stunned && r.mid.body === 0.7 && r.mid.head === 0.6, r.mid);
    if (s === 'offer') check(`P${ph + 1} offer: 가슴을 내줌 2.5초 · 몸통 1.6 · 접촉 없음 → 곧바로 clawRush`, r.mid.offering && r.mid.body === 1.6 && r.mid.contact === 0 && (ph ? r.after === 'clawRush' : true), { mid: r.mid, after: r.after });
  }
}
check('debugAct(없는 상태) → false', (await page.evaluate((id) => { const G = window.__gal; G.build(id); return G.boss.debugAct('nope'); }, ID)) === false, null);

// ── 3) 패턴별 검사 ──
{
  const r = await page.evaluate(async (id) => {
    const G = window.__gal, out = {}, n0 = G.notes.length;
    let pre = new Set();
    const act = (b, s) => { pre = new Set(G.world.entities); return b.debugAct(s); };
    const fresh = (pred) => G.world.entities.filter((e) => !pre.has(e) && pred(e));
    const quiet = (b) => { b.debugAct('idle'); b.idleWait = 99; };
    // 조준 사격: 조준선이 플레이어를 따라가다 마지막 0.25초는 고정 → 은탄 (폭 20, 1800px/s) → 장전 노출 (몸통 1.15)
    G.build(id); G.step(2); let b = G.boss, p = G.world.player;
    quiet(b); G.step(0.3); p.x = b.zx - b.facing * 420;
    act(b, 'aimedShot');
    const line = () => { const z = fresh((e) => e.kind === 'hazard' && e.data?.shot)[0]; return z ? { z, x1: Math.round(z.line.x1), y1: Math.round(z.line.y1), x0: Math.round(z.line.x0) } : null; };
    G.step(0.4); const L0 = line();
    p.x += -b.facing * 60; p.y -= 90; G.step(0.3); const L1 = line();   // 0.7초: 아직 따라간다
    G.step(0.27); const L2 = line(); const lockedAt = L2?.z.data.shot.locked;   // 0.97초: 고정 (0.3 + 0.65)
    p.x += b.facing * 50; p.y += 90; G.step(0.15); const L3 = line();   // 1.12초: 고정된 채
    out.aim = { follow: !!L0 && !!L1 && (L0.x1 !== L1.x1 || L0.y1 !== L1.y1), locked: !!lockedAt && L2.x1 === L3.x1 && L2.y1 === L3.y1 && L2.x0 === L3.x0, lockFlag: b.aimLock, th: L0?.z.line.th, lockAt: L0?.z.data.lockAt };
    // 탄 속도: 시작 뒤 두 프레임의 탄 끝 위치 차 (시작 프레임은 아직 조준선 끝이므로 건너뛴다)
    let speed = 0; { let seen = 0, prev = null; for (let t = 0; t < 0.6; t += 1 / 60) { G.step(1 / 60); const z = fresh((e) => e.kind === 'hazard' && e.data?.shot)[0]; if (z?.started) { seen++; if (seen >= 3 && prev) { speed = Math.round(Math.hypot(z.line.x1 - prev[0], z.line.y1 - prev[1]) * 60); break; } if (seen >= 2) prev = [z.line.x1, z.line.y1]; } } }
    out.aim.speed = speed;
    for (let t = 0; t < 1 && !b.reloading; t += 0.05) G.step(0.05);
    G.step(1 / 60);
    out.reload = { reloading: b.reloading, body: b.pBody.defMul };
    // 빅터면 고정이 0.1초 늦다 (스토리 · 1페이즈만)
    G.build(id); G.step(1); b = G.boss;
    out.mercy = { arcade: b.mercy() };
    G.world.mode = 'story'; G.world.player.hero = { charId: 'victor' }; out.mercy.story = b.mercy();
    G.world.player.hero = { charId: 'kael' }; out.mercy.kael = b.mercy();
    G.world.player.hero = { charId: 'victor' }; b.debugPhase(1); G.step(0.5); out.mercy.p2 = b.mercy();
    // 산탄: 6칸 밖이면 고르지 않는다 · 7알 · 1200px/s · 수명 0.35 · 판정 id 3개 (한 번에 최대 3알)
    G.build(id); G.step(2); b = G.boss; p = G.world.player; quiet(b);
    p.x = b.zx - b.facing * 400; G.step(0.05); const far = b.weights().map(([k]) => k);
    p.x = b.zx - b.facing * 200; G.step(0.05); const near = b.weights().map(([k]) => k);
    act(b, 'buckshot'); G.step(0.5);
    const pel = fresh((e) => e.kind === 'projectile');
    out.buck = { far: far.includes('buckshot'), near: near.includes('buckshot'), n: pel.length, ids: new Set(pel.map((e) => e.attack.hitId)).size, speed: Math.round(Math.hypot(pel[0]?.vx ?? 0, pel[0]?.vy ?? 0)), life: pel[0]?.maxLife, mv: pel[0]?.attack.mv };
    // 은 올가미: 셋을 던지고 · 살아 있는 올가미 ≤ 4 · 한 대에 부서짐 · 밟으면 묶임 · 8초 수명
    G.build(id); G.step(2); b = G.boss; p = G.world.player; quiet(b);
    const traps = () => G.world.entities.filter((e) => e.def?.id === 'hagen_trap' && !e.dead);
    p.iframes = 1e9;   // 던지는 동안 발밑 올가미를 밟지 않게
    b.debugAct('trapLine'); G.step(1.2); const t1 = traps().length;
    b.debugAct('trapLine'); G.step(1.2); const t2 = traps().length;
    const weightsFull = b.weights().map(([k]) => k).includes('trapLine');
    quiet(b); G.step(0.2);
    const tr = traps(), T0 = tr[0], A = b.A;
    const inA = tr.every((e) => e.tx >= A.x0 && e.tx <= A.x1 && e.floor === A.floor);
    const armed = tr.every((e) => e.armed);
    const broke = T0.takeHit(5, { team: 'player', dir: 1, tags: [] }, G.world, {}); G.step(0.05);
    const T1 = traps()[0];
    p.iframes = 0; p.vy = 0; p.x = T1.tx - p.w / 2; p.y = A.floor - p.h; const h0 = p.hits;
    G.step(0.1); const bx = p.x, snapped = T1.snapT >= 0;
    p.x += 40; G.step(0.1); const pinned = Math.abs(p.x - bx) < 0.01;
    G.step(0.6); p.x += 40; G.step(0.05); const freed = Math.abs(p.x - bx) > 30;
    out.trap = { t1, t2, weightsFull, inA, armed, broke: broke && T0.dead, hit: p.hits - h0, snapped, pinned, freed, left: traps().length };
    G.step(8.5); out.trap.life = traps().length;
    // 무리 부르기: 설원 늑대 ≤ 3 · 1페이즈는 셋이면 고르지 않는다 · 2페이즈는 충격파만
    G.build(id); G.step(2); b = G.boss; quiet(b);
    const wolves = () => b.minionCount('snow_wolf');
    const caps = [];
    for (let k = 0; k < 3; k++) { b.debugAct('packCall'); G.step(1.4); for (const e of b._cMinions) { e.x = b.A.x0 + 10; e.vx = 0; } caps.push(wolves()); }
    out.pack = { caps, pick1: b.weights().map(([k]) => k).includes('packCall') };
    b.debugPhase(1); G.step(4); quiet(b);
    act(b, 'packCall'); let ring = 0; for (let t = 0; t < 1.6; t += 0.05) { G.step(0.05); ring = Math.max(ring, fresh((e) => e.kind === 'hazard' && e.rects && !e.harmless).length); }
    out.pack.ring2 = ring; out.pack.after2 = wolves(); out.pack.pick2 = b.weights().map(([k]) => k).includes('packCall');
    // 덮치기: 착지점이 A 안 · A.floor 위 · 플레이어가 발판에 있으면 그 발판 · 착지 경직 = 카운터 창 → stagger · 세 번째는 벽 차기
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; p = G.world.player; quiet(b);
    const T = 48; p.x = 36.5 * T - p.w / 2; p.y = 11 * T - p.h - 2; p.vy = 0; G.step(0.3);
    const onPlat = Math.abs(p.bottom - 11 * T) < 2;
    act(b, 'pounce'); let land = null, mark = null;
    for (let t = 0; t < 3 && !land; t += 1 / 60) { G.step(1 / 60); if (!mark && b.pn?.stage === 'warn') mark = { tx: b.pn.tx, ty: b.pn.ty }; if (b.pn?.stage === 'stun') land = { zx: b.zx, fy: b.fy, cWin: b.cWin, tele: b.telegraph }; }
    b.takeHit(10, { team: 'player', dir: 1 }, G.world, {}); G.step(0.05);
    out.pounce = { onPlat, mark, land, A: [b.A.x0, b.A.x1, b.A.floor], counter: b.state };
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
    b.pounceN = 2; act(b, 'pounce'); let wall = false, n2 = null, lands = 0, prevStage = '';
    for (let t = 0; t < 5 && b.state === 'pounce'; t += 1 / 60) { G.step(1 / 60); n2 ??= b.pn?.n; const s = b.pn?.stage; if (s === 'wall') wall = true; if (s === 'stun' && prevStage !== 'stun') lands++; prevStage = s; }
    out.pounce.wall = { n2, wall, lands };
    // 할퀴기 연타: 3타 (170×110) · 경기장 끝에서 멈춤
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
    act(b, 'clawRush'); const claws = new Set(); let endX = 0;
    for (let t = 0; t < 4 && b.state === 'clawRush'; t += 1 / 60) { G.step(1 / 60); for (const z of fresh((e) => e.kind === 'hazard' && !e.harmless && e.w === 170)) claws.add(z.attack.hitId); if (b.state === 'clawRush') endX = b.zx; }
    out.claw = { n: claws.size, endX: Math.round(endX), A: [b.A.x0, b.A.x1] };
    // 달 그림자: 하늘 위(화면 밖) 동안 판정·접촉 없음 · 내리꽂기 셋 (폭 90) · 노출 1초 몸통 0.7 · 노출 중 5% → stagger
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
    act(b, 'moonDive'); const dives = new Set(); let offscreen = 0, offHits = 0, exposed = null, th = 0;
    for (let t = 0; t < 9 && b.state === 'moonDive'; t += 0.05) {
      G.step(0.05);
      for (const z of fresh((e) => e.kind === 'hazard' && e.data?.dive)) { dives.add(z.attack.hitId); th = z.line.th; }
      if (b.fy < b.camTop()) { offscreen++; offHits += b.hitParts().length + b.contactParts().length; }
      if (b.exposed && !exposed) exposed = { body: b.pBody.defMul, parts: b.hitParts().length };
    }
    out.dive = { n: dives.size, th, offscreen, offHits, exposed };
    G.build(id, { phase: 1 }); G.step(6); b = G.boss; quiet(b);
    b.debugAct('moonDive'); for (let t = 0; t < 9 && !b.exposed; t += 0.05) G.step(0.05);
    const wasExp = b.exposed; b.takeHit(Math.ceil(b.stats.maxHp * 0.06), { team: 'player', dir: 1 }, G.world, {}); G.step(0.05);
    out.diveStagger = { wasExp, state: b.state };
    // 사냥칼: 2연 베기 (150×100) · 끝 0.3초 = 카운터 창 → stagger
    G.build(id); G.step(2); b = G.boss; quiet(b);
    act(b, 'huntingKnife'); const cuts = new Set();
    for (let t = 0; t < 3 && !b.cWin; t += 1 / 60) { G.step(1 / 60); for (const z of fresh((e) => e.kind === 'hazard' && !e.harmless && e.w === 150)) cuts.add(z.attack.hitId); }
    const kw = { cWin: b.cWin, tele: b.telegraph };
    b.takeHit(10, { team: 'player', dir: 1 }, G.world, {}); G.step(0.05);
    out.knife = { cuts: cuts.size, ...kw, state: b.state };
    // 15%: offer 강제 + 대사(스토리) 한 번 → 곧바로 clawRush · 다시 15% 아래로 맞아도 두 번째 offer 없음 · 부활 뒤 offer 는 다시, 대사는 다시 안 나온다
    G.S.forceCutscene = false; G.O.story = true;
    G.build(id, { phase: 1 }); G.world.mode = 'story'; G.step(6); b = G.boss; quiet(b);
    b.hp = Math.floor(b.stats.maxHp * 0.16); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
    out.last = { forced: b.forced.slice(), hasScript: !!(await import('../src/data/story.js')).SCRIPTS.b_hagen_last };
    b.idleWait = 0.1; let dlg = null, seq = [];
    for (let t = 0; t < 8; t += 0.05) { G.step(0.05); if (G.world.dialog?.id && !dlg) dlg = G.world.dialog.id; if (seq[seq.length - 1] !== b.state) seq.push(b.state); if (b.state === 'clawRush') break; }
    out.last.dialog = dlg; out.last.seq = seq;
    b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
    out.last.twice = b.forced.includes('offer');
    G.step(3); G.reset(); G.step(0.5);
    b.debugPhase(1); G.step(4); quiet(b);
    b.hp = Math.floor(b.stats.maxHp * 0.16); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, G.world, {});
    out.last.again = b.forced.includes('offer');
    b.idleWait = 0.1; let dlg2 = null; for (let t = 0; t < 4; t += 0.05) { G.step(0.05); if (G.world.dialog?.id === 'b_hagen_last') dlg2 = true; }
    out.last.dialogAgain = dlg2;
    out.last.seen = G.world.state.progress.seenScripts.filter((s) => s === 'b_hagen_last').length;
    G.O.story = false;
    out.notes = G.notes.slice(n0);
    return out;
  }, ID);
  check('조준 사격: 조준선이 플레이어를 따라가다 마지막 0.25초는 고정 (선 폭 20 · lockAt 0.65)', r.aim.follow && r.aim.locked && r.aim.lockFlag && r.aim.th === 20 && r.aim.lockAt === 0.65, r.aim);
  check('조준 사격: 은탄 1800px/s · 장전 노출 몸통 1.15', Math.abs(r.aim.speed - 1800) <= 40 && r.reload.reloading && r.reload.body === 1.15, { speed: r.aim.speed, reload: r.reload });
  check('스승의 봐주기: 스토리 · 1페이즈 · 빅터만 고정 0.1초 늦게 (아케이드·카엘·2페이즈 0)', r.mercy.arcade === 0 && r.mercy.story === 0.1 && r.mercy.kael === 0 && r.mercy.p2 === 0, r.mercy);
  check('산탄: 6칸 밖에서는 고르지 않음 · 7알 · 1200px/s · 수명 0.35 · 판정 id 3개(최대 3알) · mv 0.35', !r.buck.far && r.buck.near && r.buck.n === 7 && r.buck.ids === 3 && r.buck.speed === 1200 && r.buck.life === 0.35 && r.buck.mv === 0.35, r.buck);
  check('은 올가미: 3개 → 두 번째는 1개 더 (살아 있는 올가미 ≤ 4) · 4개면 고르지 않음 · 경기장 바닥 안', r.trap.t1 === 3 && r.trap.t2 === 4 && !r.trap.weightsFull && r.trap.inA && r.trap.armed, r.trap);
  check('은 올가미: 한 대에 부서짐 · 밟으면 피격 + 0.6초 묶임 · 8초 뒤 사라짐', r.trap.broke && r.trap.hit === 1 && r.trap.snapped && r.trap.pinned && r.trap.freed && r.trap.life === 0, r.trap);
  check('무리 부르기: 설원 늑대 2 → 3 → 3 (≤ 3) · 1페이즈 셋이면 고르지 않음 · 2페이즈 충격파만 (그래도 고른다)', r.pack.caps.join() === '2,3,3' && !r.pack.pick1 && r.pack.ring2 >= 1 && r.pack.after2 === 3 && r.pack.pick2, r.pack);
  const pl = r.pounce, A = pl.A;
  check('덮치기: 플레이어가 선 발판에 착지 (A 안 · A.floor 위) · 착지 경직 = 카운터 창 → stagger', pl.onPlat && pl.mark && pl.mark.tx >= A[0] && pl.mark.tx <= A[1] && pl.mark.ty === 528 && pl.land && Math.abs(pl.land.fy - 528) < 0.5 && pl.land.zx >= A[0] && pl.land.zx <= A[1] && pl.land.cWin && pl.land.tele && pl.counter === 'stagger', pl);
  check('덮치기: 세 번째는 벽을 차고 한 번 더 (착지 두 번)', pl.wall.n2 === 2 && pl.wall.wall && pl.wall.lands === 2, pl.wall);
  check('할퀴기 연타: 3타 (170×110) · 경기장 끝에서 멈춤', r.claw.n === 3 && (Math.abs(r.claw.endX - (r.claw.A[0] + 60)) <= 2 || Math.abs(r.claw.endX - (r.claw.A[1] - 60)) <= 2), r.claw);
  check('달 그림자: 화면 밖 동안 판정·접촉 없음 · 내리꽂기 셋 (폭 90) · 노출 몸통 0.7', r.dive.n === 3 && r.dive.th === 90 && r.dive.offscreen > 5 && r.dive.offHits === 0 && r.dive.exposed?.body === 0.7 && r.dive.exposed.parts > 0, r.dive);
  check('달 그림자: 노출 중 최대 체력 5% → stagger', r.diveStagger.wasExp && r.diveStagger.state === 'stagger', r.diveStagger);
  check('사냥칼: 2연 베기 (150×100) · 끝 = 카운터 창 → stagger', r.knife.cuts === 2 && r.knife.cWin && r.knife.tele && r.knife.state === 'stagger', r.knife);
  check('15%: offer 강제 + 대사 b_hagen_last (스토리) → 곧바로 clawRush · 싸움마다 한 번 · 부활 뒤 offer 다시 (대사는 다시 안 나온다)',
    r.last.forced.includes('offer') && r.last.hasScript && r.last.dialog === 'b_hagen_last' && r.last.seq.includes('offer') && r.last.seq[r.last.seq.length - 1] === 'clawRush' && !r.last.twice && r.last.again && !r.last.dialogAgain && r.last.seen === 1, r.last);
  check('패턴별 검사 오류 0', !r.notes.length, r.notes);
}

// ── 4) 사망 → 부활 (onReset) · 처치 · 적 정지 ──
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, n0 = G.notes.length, W = G.world, d0 = W.lighting.darkness;
    b.debugAct('trapLine'); G.step(1.2);
    b.debugAct('packCall'); G.step(1.4);
    const mid = { traps: W.entities.filter((e) => e.def?.id === 'hagen_trap' && !e.dead).length, wolves: b.minionCount('snow_wolf') };
    b.hp = Math.floor(b.stats.maxHp * 0.51); b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { team: 'player', dir: 1 }, W, {});
    G.step(3.5);
    mid.wolf = b.wolf; mid.moon = +b.moonK.toFixed(2); mid.traps2 = W.entities.filter((e) => e.def?.id === 'hagen_trap' && !e.dead).length;
    G.reset(); G.step(0.6);
    return { mid, phase: b.phase, state: b.state, wolf: b.wolf, name: b.def.name, title: b.def.title, portrait: b.def.portrait, h: b.h, w: b.w, inv: b.invuln, rifle: b.rifleDrop, gun: b.gun,
      traps: W.entities.filter((e) => e.def?.id === 'hagen_trap' && !e.dead).length, wolves: b.minionCount('snow_wolf'), moon: b.moonK, offered: b._offered,
      dark: +W.lighting.darkness.toFixed(2), d0: +d0.toFixed(2), tints: W.overlays.filter((o) => o.owner === b && o.cTint && !o.dead).length, notes: G.notes.slice(n0) };
  }, ID);
  check('올가미는 전환 뒤에도 남는다', r.mid.wolf && r.mid.traps > 0 && r.mid.traps2 === r.mid.traps && r.mid.moon > 0, r.mid);
  check('사망→부활: 페이즈 0 · 사람 · 하겐 · 60×146 · 장총 손에 · 올가미·늑대·달빛·색조 정리 · offer 다시 가능', r.phase === 0 && !r.wolf && r.name === '하겐' && r.title === '늑대를 잡던 사냥꾼' && r.portrait === 'portraits/b_hagen' && r.h === 146 && r.w === 60 && !r.inv && r.rifle === null && r.gun === 'port'
    && r.traps === 0 && r.wolves === 0 && r.moon === 0 && r.tints === 0 && r.dark === r.d0 && !r.offered && r.mid.wolves > 0 && !r.notes.length, r);
}
{
  const r = await page.evaluate((id) => {
    const G = window.__gal, out = {};
    for (const mode of ['arcade', 'story']) {
      G.build(id, { phase: 1 }); G.world.mode = mode; G.step(6);
      const b = G.boss, W = G.world, n0 = G.notes.length;
      b.debugAct('trapLine'); G.step(1.2);
      G.kill(); const d0 = b.dying;
      const until = (T) => { for (let i = 0; i < 2000 && b.dieT < T && !b.dead; i++) G.step(1 / 60); };
      G.step(0.3); const banner = W.banner?.sub;
      until(1.5); const lie = +b.ps.lie.toFixed(2), wolf15 = b.wolf;
      const shards = W.entities.filter((e) => e.kind === 'debris').length;
      until(2.2); const dawn = W.overlays.filter((o) => o.owner === b && o.cTint && !o.dead).length;
      until(3.2); const human = !b.wolf && b.lieHuman && b.ps.lie > 0.95;
      until(4.2); const vanish = b.vanishK;
      until(6); G.step(0.5);
      out[mode] = { d0, banner, lie, wolf15, shards, dawn, human, vanish: +vanish.toFixed(2), dead: b.dead, dying: +b.dying.toFixed(2), cleared: W.cleared,
        traps: W.entities.filter((e) => e.def?.id === 'hagen_trap' && !e.dead).length, notes: G.notes.slice(n0) };
    }
    G.build(id, { phase: 1 }); G.step(6);
    const b = G.boss, W = G.world; G.kill(); G.step(0.2);
    W.banner = { text: 'ROUND CLEAR', sub: '은빛 늑대 격파 · 1:23  +12,000', t: 3 }; G.step(0.1);
    out.rush = W.banner?.sub;
    return out;
  }, ID);
  const a = r.arcade, s = r.story;
  check('처치: 쓰러짐 5초 · 부제 "은빛 늑대 결착!" · 파편 폭발 없음 · 올가미 사라짐', a.d0 === 5 && a.banner === '은빛 늑대 결착!' && a.shards === 0 && s.d0 === 5 && a.traps === 0 && s.traps === 0, { a, s });
  check('쓰러짐: 늑대가 눕고(1.5초) · 새벽빛 색조(1.5–3초) · 3초에 사람으로 누움', a.wolf15 && a.lie > 0.8 && a.dawn >= 1 && a.human && s.human, { a: [a.wolf15, a.lie, a.dawn, a.human], s: [s.wolf15, s.lie, s.dawn, s.human] });
  check('아케이드: 3.5초에 눈보라로 흩어져 사라짐 → 5초에 끝', a.vanish === 1 && a.dead && a.cleared, a);
  check('스토리: 누운 채 남는다 (스테이지가 끝날 때까지)', !s.dead && s.dying > 0 && s.cleared && s.vanish === 0, s);
  check('보스 러시 부제: 낱말만 바꾼다 (시간·점수 그대로)', r.rush === '은빛 늑대 결착 · 1:23  +12,000', r.rush);
  check('처치 오류 0', !a.notes.length && !s.notes.length, [...a.notes, ...s.notes]);
}
{
  const r = await page.evaluate((id) => {
    const G = window.__gal; G.build(id); G.step(2);
    const b = G.boss, W = G.world, n0 = G.notes.length;
    b.debugAct('trapLine'); G.step(0.8);
    W.freezeEnemies = true;
    const st = b.st, trs = W.entities.filter((e) => e.def?.id === 'hagen_trap'), tt = trs.map((e) => e.t), zx = b.zx;
    G.step(1.0);
    const same = b.st === st && trs.every((e, i) => e.t === tt[i]) && b.zx === zx;
    W.freezeEnemies = false; G.step(0.2);
    return { same, moved: b.st > st, n: trs.length, notes: G.notes.slice(n0) };
  }, ID);
  check('적 정지 중 보스 시계·올가미·위치 멈춤', r.same && r.moved && r.n > 0 && !r.notes.length, r);
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
          G.world.player.x = b.zx - b.facing * 200;
          b.debugAct(act);
          let out1 = 0, minX = 1e9, maxX = -1e9, back = -1;
          for (let t = 0; t < 14; t += 0.05) {
            G.step(0.05);
            minX = Math.min(minX, b.zx); maxX = Math.max(maxX, b.zx);
            if (b.zx < A.x0 || b.zx > A.x1 || b.fy > A.floor + 0.5) out1++;
            for (const z of G.world.entities) if (z.kind === 'hazard' && !z.harmless && z.on) { const cx = z.line ? (z.line.x0 + z.line.x1) / 2 : z.x + z.w / 2; if (cx < A.x0 - 200 || cx > A.x1 + 200 || (z.y > A.floor + 10)) out1++; }
            for (const e of G.world.entities) if (e.def?.id === 'hagen_trap' && (e.tx < A.x0 || e.tx > A.x1 || e.floor !== A.floor)) out1++;
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
    const d = BOSSES.b_hagen;
    const ok = async (u) => (await fetch(u)).ok;
    return { has: !!d, stage: d?.stageId, drops: d?.drops, phases: d?.phases, size: d?.size, form2: d?.form2, portrait: d?.portrait, music: d?.music, lazy: knownBoss('b_hagen'), cls: typeof BOSS_E.b_hagen, painted: typeof EXB.b_hagen,
      files: { p1: await ok('../assets/portraits/b_hagen.webp'), p2: await ok('../assets/portraits/b_hagen2.webp'), atlas: await ok('../assets/painted/bosses/b_hagen/atlas.webp'), man: await ok('../assets/painted/bosses/b_hagen/manifest.json') } };
  });
  check('데이터: BOSSES.b_hagen · s23 · phases [0.5] · 60×146 · form2 은빛 늑대 · 드롭 없음 · boss2 · lazy · 클래스 · 채색 등록 · 초상화 둘 · 아틀라스',
    r.has && r.stage === 's23' && r.phases?.join() === '0.5' && r.size?.w === 60 && r.size?.h === 146 && r.form2?.portrait === 'portraits/b_hagen2' && Array.isArray(r.drops) && r.drops.length === 0 && r.music === 'boss2'
    && r.lazy && r.cls === 'function' && r.painted === 'function' && Object.values(r.files).every(Boolean), r);
  const src = fs.readFileSync(new URL('../src/game/bosses/e_hagen.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('inferno 를 읽지 않음 (세기는 stage.level · diff 한 길로만 — ngplus.md §3.1)', !/\binferno\b/.test(src), null);
}

const bad = results.filter((r) => !r.ok);
for (const r of results) if (r.summary) console.log(`${r.ok ? '✓' : '✗'} ${r.summary}`);
for (const r of results) if (!r.summary) console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
console.log(`\n${results.length - bad.length}/${results.length} 통과`);
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.slice(0, 20).join('\n') : 'NO PAGE ERRORS');
await browser.close(); srv.close();
process.exit(bad.length || errs.length ? 1 : 0);
