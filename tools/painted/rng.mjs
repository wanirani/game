// 게임플레이 결정성 A/B: 같은 시드로 채색 / 벡터(?painted=0) 전투를 N 프레임 돌려 Math.random 호출 수와 보스 궤적이 같은지 본다.
// 채색 렌더러가 게임플레이 난수(Math.random, world.fx.emit/burst)를 쓰거나 로직 값을 바꾸면 여기서 갈라진다.
// 사용: node tools/painted/rng.mjs <bossId> [--frames 1500] [--mode pv|vv|pp]
//   --mode pv (기본) 채색 대 벡터 · vv 벡터 대 벡터 (기준선: 도구 자체의 흔들림 확인) · pp 채색 대 채색
//   poses/<bossId>.mjs 의 STAGE 와 (있으면) RNG_SCRIPT(i, b, p, w) — 프레임별 대본(페이즈 전환 등). 없으면 47%/73% 프레임에 체력을 깎아 페이즈를 넘긴다.
//   녹화 전에 두 실행의 출발 상태를 맞춘다 (채색 실행만 굽기를 기다리는 동안 실제 루프가 더 돌기 때문, requests #119/#126/#156/#322):
//     품질 등급 고정(high) · 세계 시계 · 히트스톱/슬로모 · 배경 번개/별똥별 타이머 · 기믹 파티클 누적기 · 카메라 ·
//     보스 위치(homeX, 없으면 방의 보스 출현 지점) · 보스 속도 · 보스 AI 휴식 상태(idleWait/lastAtk/atkCount/forced/jobs) ·
//     보스가 남긴 탄·장판·소환물 · 입자 목록. 보스별 RNG_SCRIPT 의 0 프레임 정리는 이 뒤에 돌아 덮어쓸 수 있다.
import { open, startFight, freeze, waitPainted } from './lib.mjs';
const argv = process.argv.slice(2);
const id = argv[0];
if (!id || id.startsWith('--')) { console.log('usage: node tools/painted/rng.mjs <bossId> [--frames 1500] [--mode pv|vv|pp]'); process.exit(1); }
const val = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const frames = +val('frames', 1500);
const modeArg = String(val('mode', 'pv'));
if (!/^(pv|vv|pp)$/.test(modeArg)) { console.log('--mode must be pv, vv or pp'); process.exit(1); }
const mod = await import(`./poses/${id}.mjs`);
async function run(vector) {
  const s = await open({ url: `index.html?scene=stage&stage=${mod.STAGE}&room=boss${vector ? '&painted=0' : ''}`, dpr: 1 });
  try {
    await startFight(s.page);
    if (!vector) await waitPainted(s.page, id);
    await freeze(s.page);
    const r = await s.page.evaluate(([frames, script]) => {
      const g = window.__game, w = g.world, b = w.boss, p = w.player;
      const user = script ? eval(script) : null;
      let x = 777, calls = 0;
      Math.random = () => { calls++; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
      // ── 출발 상태 맞추기 (실시간 대기가 남긴 흔적) ──
      g.settings.quality = 'high'; g.resize?.();                // 품질 조절기가 한 실행에서만 등급을 내렸을 수 있다 (입자 수 = 난수 호출 수)
      w.time = 10; w.hitstop = 0; w.slowmo = 0; w.timeStop = 0; w.cutscene = false;
      if (w.bg) { w.bg.lightningT = 99; w.bg.lightning = 0; w.bg.shootT = 99; w.bg.shoot = null; }   // 배경 번개 · 별똥별 (녹화 동안 안 나오게)
      if (w.gimmick && 'fxAcc' in w.gimmick) w.gimmick.fxAcc = 0;
      for (const e of w.entities) {
        if (e === b || e === p || e.kind === 'painted' || e.kind === 'bossart') continue;
        if (e.owner === b || e.owner?.owner === b || e.boss === b || e.summoner === b || e.queen === b) e.dead = true;
      }
      if (w.fx?.list) w.fx.list.length = 0;
      if (b.homeX !== undefined) b.x = b.homeX - b.w / 2;
      else if (w.bossSpawn && (w.bossSpawn.id ?? b.def?.id) === b.def?.id) { b.x = w.bossSpawn.x - b.w / 2; b.y = w.bossSpawn.y - b.h; }
      b.vx = 0; b.vy = 0; b.flashT = 0; b.clearJobs?.();
      if ('idleWait' in b) b.idleWait = 1.2;
      if ('lastAtk' in b) b.lastAtk = null;
      if ('atkCount' in b) b.atkCount = 0;
      if (Array.isArray(b.forced)) b.forced.length = 0;
      b.setup?.(); b.hp = b.stats.maxHp; b.phase = 0; b.inferno = false; b.setState('idle'); b.cool = 0.5; b.t = 0;
      p.hp = p.stats.hp = 1e9; p.x = (b.A?.x0 ?? b.x - 400) + 330; p.vx = 0; p.vy = 0;
      w.camera?.follow?.(p, 1 / 60, true);
      const rows = []; let h = 0;
      for (let i = 0; i < frames; i++) {
        p.iframes = 1e9; p.hp = 1e9;
        const top = g.scenes[g.scenes.length - 1];
        if (top?.name === 'dialogue') top.finish?.();            // 페이즈 대사가 위에 뜨면 스테이지가 멈춘다
        if (user) user(i, b, p, w);
        else if (i === Math.round(frames * 0.47)) b.takeHit(b.stats.maxHp * 0.45, { stats: p.stats }, w, {});
        else if (i === Math.round(frames * 0.73)) b.takeHit(b.stats.maxHp * 0.3, { stats: p.stats }, w, {});
        g.__tick(1 / 60); g.__render();
        const row = [b.state, +b.x.toFixed(3), +b.y.toFixed(3), +(b.hp).toFixed(2), calls];
        h = (Math.imul(h ^ Math.round(b.x * 100), 16777619) ^ Math.round(b.y * 100) ^ (calls << 3)) >>> 0;
        rows.push(row);
      }
      return { calls, hash: h, rows, painted: !!b._painted?.proxy && !b._painted.proxy.dead };
    }, [frames, mod.RNG_SCRIPT ?? null]);
    r.errors = s.errors;
    return r;
  } finally {
    await s.close();
  }
}
const [aVec, bVec] = { pv: [false, true], vv: [true, true], pp: [false, false] }[modeArg];
const P = await run(aVec), V = await run(bVec);
let first = -1;
for (let i = 0; i < P.rows.length; i++) if (JSON.stringify(P.rows[i]) !== JSON.stringify(V.rows[i])) { first = i; break; }
const label = (vec) => (vec ? 'vector' : 'painted');
console.log(JSON.stringify({ id, frames, mode: modeArg, a: { run: label(aVec), calls: P.calls, hash: P.hash, proxy: P.painted }, b: { run: label(bVec), calls: V.calls, hash: V.hash, proxy: V.painted } }));
if (first >= 0) console.log('first difference at frame', first, JSON.stringify(P.rows[first]), 'vs', JSON.stringify(V.rows[first]));
const errs = [...P.errors, ...V.errors];
console.log(errs.join('\n') || 'NO ERRORS');
// 채색 실행이 있으면 대리 개체가 실제로 붙어 있어야 한다 (안 붙었으면 벡터끼리 비교한 셈)
const proxyOk = (aVec || P.painted) && (bVec || V.painted);
const same = first < 0 && P.calls === V.calls;
console.log(same && proxyOk ? `PASS: gameplay RNG and boss trajectory identical (${label(aVec)} vs ${label(bVec)})` : !proxyOk ? 'FAIL: painted proxy not attached' : `FAIL: ${modeArg === 'pv' ? 'painted path changes gameplay' : 'runs diverge (harness/start-state nondeterminism)'}`);
process.exit(same && proxyOk && !errs.length ? 0 : 1);
