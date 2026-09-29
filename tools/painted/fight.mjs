// 실전 전투 검증: 실제 게임(AI·월드·렌더러)으로 보스전을 처음부터 사망까지 진행하며 상태 커버리지·오류·프레임 비용·스크린샷을 모은다.
// 사용: node tools/painted/fight.mjs <bossId> [--mobile] [--vector] [--out 폴더] [--dmg 0.08] [--every 3]
//        실시간(기본): [--secs 70]            실제 루프(고정 60Hz)에서 플레이어가 보스에게 다가가 공격 키를 누른다
//        --step      : [--frames 9000] [--render 2] [--act 상태@초,상태@초] [--shots 48]
//                      실제 루프를 멈추고(lib.freeze) 1/60 초씩 직접 진행 — 부하가 큰 기계에서도 페이즈 전환·사망까지 결정적으로 간다.
//                      --every 는 시뮬레이션 초(기본 2), --render N = N 프레임마다 그리기(캡처 프레임은 항상 그린다),
//                      --act 는 해당 시각에 boss.debugAct(상태)로 드문 패턴을 강제한다.
//   모든 보스 공통 (BossB/BossC 포함: b.main 은 뼈 용의 전용 필드): 보스 위치 = b.main?.hx ?? b.bx ?? b.cx.
//   플레이어는 죽지 않는다 (die() 를 막고 매 틱/100ms 마다 체력을 최대치로 채움 — 한 방이 최대 체력보다 커도 world.respawn → 보스 회복이 일어나지 않게).
//   전투 도중 대사(dialogue)는 바로 넘긴다. 보스 체력은 --every 마다 --dmg 비율씩 깎는다 (무적 중이면 적용될 때까지 다시 시도).
//   사망(b.dead) 뒤의 표본은 버린다 (world.boss 는 사망 후에도 치운 보스를 가리킨다).
//   출력: <out>/fight_<tag>_<n>_<이유>.png, 상태 방문 수, 페이즈, 채색 활성 비율, FPS(실시간) 또는 틱/그리기 ms(--step), 페이지 오류
import { open, startFight, waitPainted, freeze } from './lib.mjs';
import fs from 'node:fs';
const argv = process.argv.slice(2);
const id = argv[0];
if (!id || id.startsWith('--')) { console.log('usage: node tools/painted/fight.mjs <bossId> [--mobile] [--vector] [--step] [--secs 70 | --frames 9000] [--dmg 0.08] [--every 3] [--act state@t,...]'); process.exit(1); }
const val = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const mobile = argv.includes('--mobile'), vector = argv.includes('--vector'), step = argv.includes('--step');
const secs = +val('secs', 70);
const dmgK = +val('dmg', 0.08), every = +val('every', step ? 2 : 3);
const out = val('out', `/tmp/claude-0/painted/fight_${id}`);
fs.mkdirSync(out, { recursive: true });
const mod = await import(`./poses/${id}.mjs`);
const s = await open({ url: `index.html?scene=stage&stage=${mod.STAGE}&room=boss${vector ? '&painted=0' : ''}`, mobile, dpr: mobile ? 3 : 1.5 });
const tag = (vector ? 'V' : 'P') + (mobile ? 'm' : '') + (step ? 's' : '');
let exitCode = 0;
try {
  await startFight(s.page);
  if (!vector) console.log('bake', JSON.stringify(await waitPainted(s.page, id)));
  // 페이지 쪽 공용 도우미: 보스 위치, 플레이어 유지, 대사 넘기기, 피해 주입
  await s.page.evaluate(() => {
    const g = window.__game;
    window.__fx = {
      hx(b) { return b.main?.hx ?? (Number.isFinite(b.bx) ? b.bx : b.cx); },
      keep() {
        const w = g.world, p = w?.player;
        const top = g.scenes[g.scenes.length - 1];
        if (top?.name === 'dialogue' || top?.name === 'bossIntro') { if (typeof top.finish === 'function') top.finish(); else { g.pop(); top.onDone?.(); top.onEnd?.(); } }
        if (!p) return;
        // 죽지 않게: 모든 사망 경로(피격·기믹·함정)가 부르는 die() 를 막고 체력을 최대치로 채운다
        // (hp 를 1e6 으로 두면 HUD 에 '1000000 / 130' 이 찍혀 스크린샷이 어색하다)
        if (!p.__fightKeep) { p.__fightKeep = true; p.die = function () { this.hp = this.stats?.hp ?? this.stats?.maxHp ?? 1; }; }
        if (!p.dead) p.hp = p.stats?.hp ?? p.stats?.maxHp ?? p.hp;
      },
      /** 보스에게 최대 체력의 k 만큼 피해 → 실제로 들어갔는가 (무적·사망 연출 중이면 false) */
      hurt(k) {
        const w = g.world, b = w?.boss;
        if (!b || b.dead || b.dying > 0 || b.invuln || b.pendingBoss) return false;
        const hp0 = b.hp;
        b.takeHit(Math.ceil(b.stats.maxHp * k), { stats: w.player.stats }, w, {});
        return b.hp < hp0 || b.dying > 0 || b.dead;
      },
    };
  });
  if (!step) {
    // ── 실시간: 실제 루프 + 키보드 ──
    await s.page.evaluate(() => {
      const g = window.__game;
      window.__fight = { states: {}, twin: {}, painted: 0, frames: 0, fps: [], died: false, maxDeathT: 0, phases: [], dmg: 0 };
      const F = window.__fight;
      setInterval(() => {
        window.__fx.keep();
        const w = g.world, b = w?.boss;
        if (!b || b.dead || b.pendingBoss) return;
        F.frames++;
        F.states[b.state] = (F.states[b.state] ?? 0) + 1;
        if (b.twin) F.twin[b.twin.st] = (F.twin[b.twin.st] ?? 0) + 1;
        if (b._painted?.proxy && !b._painted.proxy.dead) F.painted++;
        if (!F.phases.includes(b.phase)) F.phases.push(b.phase);
        if (b.dying > 0) { F.died = true; F.maxDeathT = Math.max(F.maxDeathT, b.deathT ?? 0); }
        F.fps.push(g.fps);
      }, 100);
    });
    const KEY = { left: 'ArrowLeft', right: 'ArrowRight', attack: 'KeyX', jump: 'KeyZ' };
    const t0 = Date.now();
    let shot = 0, lastShot = -99, lastDmg = 0;
    const snap = async (why) => { const f = `${out}/fight_${tag}_${String(shot++).padStart(2, '0')}_${why}.png`; await s.page.screenshot({ path: f }); return f; };
    while ((Date.now() - t0) / 1000 < secs) {
      const el = (Date.now() - t0) / 1000;
      const st = await s.page.evaluate(() => {
        const w = window.__game.world, b = w?.boss, p = w?.player;
        if (!b || !p) return { gone: true, cleared: w?.cleared };
        return { dx: window.__fx.hx(b) - p.cx, state: b.state, dying: b.dying > 0, dead: b.dead, phase: b.phase, twin: !!b.twin };
      });
      if (st.gone || st.dead) { await snap('cleared'); break; }
      // 접근 + 공격
      const dir = st.dx > 60 ? 'right' : st.dx < -60 ? 'left' : null;
      if (dir) await s.page.keyboard.down(KEY[dir]);
      await s.page.keyboard.press(KEY.attack);
      await s.page.waitForTimeout(160);
      if (dir) await s.page.keyboard.up(KEY[dir]);
      if (Math.random() < 0.15) await s.page.keyboard.press(KEY.jump);
      // 진행: every 초마다 보스 체력 dmg 비율 감소 — 무적이라 안 들어갔으면 타이머를 되돌리지 않고 다음 바퀴에 다시
      if (el - lastDmg > every && !st.dying) {
        if (await s.page.evaluate((k) => { const ok = window.__fx.hurt(k); if (ok) window.__fight.dmg++; return ok; }, dmgK)) lastDmg = el;
      }
      if (el - lastShot > (st.dying ? 0.5 : 6)) { lastShot = el; await snap(`${st.state}${st.twin ? '_twin' : ''}${st.dying ? '_dying' : ''}`); }
    }
    const F = await s.page.evaluate(() => window.__fight);
    const fps = [...F.fps].filter((v) => v > 0).sort((a, b) => a - b);
    console.log(JSON.stringify({
      tag, secs: Math.round((Date.now() - t0) / 1000), states: F.states, twinStates: F.twin, phases: F.phases, died: F.died, maxDeathT: +F.maxDeathT.toFixed(2), hits: F.dmg,
      paintedShare: +(F.painted / Math.max(1, F.frames)).toFixed(3), fpsMed: Math.round(fps[fps.length >> 1] ?? 0), fpsP10: Math.round(fps[Math.floor(fps.length * 0.1)] ?? 0),
    }, null, 1));
  } else {
    // ── 한 프레임씩 (--step): 실제 루프 정지 → g.__tick(1/60) 직접 호출, 캡처가 필요한 프레임에서 돌아와 스크린샷 ──
    await freeze(s.page);
    const frames = +val('frames', 9000), renderEvery = Math.max(1, +val('render', 2)), maxShots = +val('shots', 48);
    const acts = String(val('act', '')).split(',').filter(Boolean).map((a) => { const [st, t] = a.split('@'); return { st, t: +t || 0, done: false }; });
    await s.page.evaluate(([dmgK, every, renderEvery, acts]) => {
      const g = window.__game;
      window.__fight = {
        i: 0, simT: 0, lastDmg: 0, dmg: 0, states: {}, twin: {}, painted: 0, samples: 0, phases: [], seen: {}, died: false, deadAt: null, dyingAt: null,
        maxDeathT: 0, deathShots: [0.2, 0.8, 1.6, 2.6], tick: [], draw: [], swaps: 0, boss: g.world.boss, form: undefined, acts, dmgK, every, renderEvery,
      };
    }, [dmgK, every, renderEvery, acts]);
    const run = () => s.page.evaluate((frames) => {
      const g = window.__game, F = window.__fight, dt = 1 / 60;
      for (let n = 0; n < 600 && F.i < frames; n++) {
        const w = g.world;
        if (!w) return { end: true };   // 보스 처치 뒤 스테이지를 떠남 (결말/결과 장면)
        window.__fx.keep();
        let b = w.boss;
        if (b && b !== F.boss) { if (!b.pendingBoss) F.swaps++; F.boss = b; }   // 대역 → 진짜 보스, 재도전 재생성 등
        for (const a of F.acts) if (!a.done && F.simT >= a.t && b && !b.dead && !(b.dying > 0)) { a.done = true; (b.debugAct ?? b.setState).call(b, a.st); }
        if (b && !b.dead && !(b.dying > 0) && F.simT - F.lastDmg >= F.every && window.__fx.hurt(F.dmgK)) { F.lastDmg = F.simT; F.dmg++; }
        const t0 = performance.now();
        g.__tick(dt);
        F.tick.push(performance.now() - t0);
        F.i++; F.simT += dt;
        b = w.boss;
        // 캡처 이유: (페이즈, 상태) 첫 방문 · 모양(form) 변화 · 사망 연출의 정해진 시각 · 사망
        let why = null;
        if (b && !b.dead && !b.pendingBoss) {
          F.samples++;
          F.states[b.state] = (F.states[b.state] ?? 0) + 1;
          if (b.twin) F.twin[b.twin.st] = (F.twin[b.twin.st] ?? 0) + 1;
          if (b._painted?.proxy && !b._painted.proxy.dead) F.painted++;
          if (!F.phases.includes(b.phase)) { F.phases.push(b.phase); why = `phase${b.phase}`; }
          const key = `${b.phase}:${b.state}`;
          if (!F.seen[key]) { F.seen[key] = 1; why ??= `p${b.phase}_${b.state}`; }
          const form = b.form ?? b.formPhase;   // Death/Dracula/Mara… form · BossC formPhase
          if (form !== F.form) { if (F.form !== undefined) why ??= `form_${String(form)}`; F.form = form; }
          if (b.dying > 0) {
            F.died = true; F.dyingAt ??= F.simT; F.maxDeathT = Math.max(F.maxDeathT, b.deathT ?? 0);
            const since = F.simT - F.dyingAt;
            if (F.deathShots.length && since >= F.deathShots[0]) why = `dying_${F.deathShots.shift()}`;
          }
        } else if (b?.dead && F.deadAt == null) { F.deadAt = F.simT; why = 'dead'; }
        if (why || F.i % F.renderEvery === 0) { const r0 = performance.now(); g.__render(); F.draw.push(performance.now() - r0); }
        if (why) return { why, i: F.i, simT: +F.simT.toFixed(2), state: b?.state, phase: b?.phase, hp: b ? +(b.hp / b.stats.maxHp).toFixed(3) : null };
        if (F.deadAt != null && F.simT - F.deadAt > 1) return { end: true };
      }
      return F.i >= frames ? { end: true } : { more: true };
    }, frames);
    let shot = 0;
    const t0 = Date.now();
    for (;;) {
      const r = await run();
      if (r.why && shot < maxShots) {
        const f = `${out}/fight_${tag}_${String(shot++).padStart(2, '0')}_${r.why}.png`;
        await s.page.screenshot({ path: f });
        console.log(`${String(r.simT).padStart(7)}s  ${r.why.padEnd(22)} hp ${r.hp}  → ${f}`);
      }
      if (r.end) break;
    }
    const F = await s.page.evaluate(() => { const F = window.__fight; return { ...F, boss: undefined, acts: F.acts.map((a) => `${a.st}@${a.t}${a.done ? '' : '(not reached)'}`) }; });
    const pct = (a, q) => { if (!a.length) return 0; const v = [...a].sort((x, y) => x - y); return +v[Math.floor(q * (v.length - 1))].toFixed(2); };
    console.log(JSON.stringify({
      tag, wallSecs: Math.round((Date.now() - t0) / 1000), frames: F.i, simSecs: +F.simT.toFixed(1), states: F.states, twinStates: F.twin, phases: F.phases,
      died: F.died, dead: F.deadAt != null, deadAt: F.deadAt == null ? null : +F.deadAt.toFixed(2), maxDeathT: +F.maxDeathT.toFixed(2), hits: F.dmg, swaps: F.swaps, acts: F.acts,
      paintedShare: +(F.painted / Math.max(1, F.samples)).toFixed(3), tickMs: { med: pct(F.tick, 0.5), p95: pct(F.tick, 0.95) }, drawMs: { med: pct(F.draw, 0.5), p95: pct(F.draw, 0.95) },
    }, null, 1));
  }
} catch (e) {
  exitCode = 1;
  console.log('HARNESS ERROR', e?.message ?? e);
}
console.log(s.errors.join('\n') || 'NO ERRORS');
if (s.errors.length) exitCode = 1;
await s.close();
process.exit(exitCode);
