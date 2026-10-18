// 「숨쉬는 원경」 (Stage 5 P2) 성능 확인 — plan §4 P2 수락 2·3. perf_budget 의 계측 라이브러리(lib/perfprobe.mjs)를 그대로 쓴다
// (perf_budget.mjs 는 고치지 않는다).
//
//   node tools/qa/atmos_perf.mjs [--scenes s01,s11,s16,hub] [--tiers medium,low] [--frames 120] [--vp fold_open]
//
// 장면마다 (얼린 페이지, 한 프레임 = 게임 한 스텝 + 그리기 한 번):
//   ms       원경 층(atmos.drawFar + drawFront, 광원 넘김 포함)의 실제 시간 p95 ≤ 0.25 ms (중간)          — 수락 2
//            (계측 끈 별도 패스에서 잼: perfprobe 의 drawImage 감싸기 비용을 빼려고)
//   draws    원경 층이 이 프레임에 더한 drawImage = 층 안에서 센 그리기 + 넘긴 광원 × 2 (조명 층의 어둠 구멍 + 색광)
//            ≤ 4 (중간) · 낮음 = 0                                                                          — 수락 2·3
//   diff     같은 장면을 층을 끄고(setAtmosEnabled(false)) 다시 잰 프레임당 전체 그리기 수와의 중앙값 차이 (참고)
//   grad/canv 워밍업 뒤 원경 층 안의 새 그라데이션·새 캔버스 = 0                                              — 수락 2
//   bytes    구운 스프라이트 바이트 ≤ 1.5 MB (BOSS_PIPELINE §1.4 폰 예산 안)
// 보고서: /tmp/claude-0/qa/tools/atmos_perf.json (+ .md). 빨간 항목이 있으면 종료 코드 1.
// 이 QA 상자는 소프트웨어 래스터이고 부하가 커서 ms 는 참고로 보고, Stage 4 가 끝난 뒤 검증자(P2v)가 기준선과 함께 다시 잰다.
import { openEnv } from './lib/server.mjs';
import { freeze, step, settle } from './lib/step.mjs';
import { gotoRoom, idleFlush, prepWorld } from './lib/rooms.mjs';
import { perfProbeInit, measureFrames, stats } from './lib/perfprobe.mjs';
import { Checks, writeReport, parseFlags, list } from './lib/report.mjs';

const args = parseFlags();
const SCENES = list(args.scenes, ['s01', 's11', 's16', 'hub']);
const TIERS = list(args.tiers, ['medium', 'low']);
const FR = Number(args.frames) || 120;
const VP = String(args.vp || 'fold_open');
const BUDGET = { ms: 0.25, draws: { high: 6, medium: 4, low: 0 }, bytes: 1.5 * 1048576 };
const C = new Checks(false);
const rows = [];

/** 교차 출처 격리 (perf_budget 과 같은 방법): performance.now 가 0.1 ms 대신 5 µs 단위가 되어 0.25 ms 예산을 잴 수 있다 */
async function isolate(s) {
  await s.page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const r = await route.fetch();
    const h = { ...r.headers(), 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' };
    delete h['content-encoding']; delete h['content-length'];
    await route.fulfill({ status: r.status(), headers: h, body: await r.body() });
  });
}
const env = await openEnv();
try {
  for (const tier of TIERS) {
    const s = await env.page(VP, '', { settings: { quality: tier }, initScripts: [perfProbeInit()] });
    await isolate(s);
    await s.goto('index.html?scene=stage&stage=s01&room=r1');
    await s.waitGame('!!g.world?.player');
    await freeze(s.page);
    await settle(s.page, 20);
    await idleFlush(s, 900);
    for (const sc of SCENES) {
      const id = `${sc}.${tier}`;
      if (sc === 'hub') {
        await s.eval(() => window.__game.go('hub', {}, { fade: false }));
        for (let i = 0; i < 80; i++) { if (await s.eval(() => window.__game.world?.mode === 'town' && !!window.__game.world?.player)) break; await step(s.page, 2, false); await s.wait(100); }
        await settle(s.page, 20); await idleFlush(s);
      } else await gotoRoom(s, sc, 'r1');
      await prepWorld(s);
      await s.eval((q) => { const g = window.__game; g.autoQualityOn = () => false; g._tier = q; g.world?.applyQuality?.(); }, tier);
      // 원경 층 계측: drawFar/drawFront 를 감싸 실제 시간·안쪽 그리기·그라데이션·캔버스를 센다
      const has = await s.eval(async () => {
        const w = window.__game.world, a = w?.bg?.atmos, P = window.__perf;
        const A = await import('/src/render/atmos.js');
        A.setAtmosEnabled(true);
        window.__atm = { ms: [], own: [], fed: [], grad: 0, canv: 0, warm: true, A };
        if (!a) return false;
        const M = window.__atm;
        let fms = 0, fdraw = 0;
        const wrap = (fn, last) => function (...x) {
          const d0 = P.f.draw, g0 = P.f.grad, c0 = P.f.canv, t0 = P.realNow();
          try { return fn.apply(this, x); } finally {
            fms += P.realNow() - t0; fdraw += P.f.draw - d0;
            if (!M.warm) { M.grad += P.f.grad - g0; M.canv += P.f.canv - c0; }
            // 시간은 계측(P.on)이 꺼진 그리기에서만 모은다 — perfprobe 의 drawImage 감싸기 비용이 섞이지 않게 (counts 는 P.on 일 때만)
            if (last) { if (P.on) { M.own.push(fdraw); M.fed.push(a.stats.fed); } else if (M.timing) M.ms.push(fms); fms = 0; fdraw = 0; }
          }
        };
        a.drawFar = wrap(a.drawFar, false); a.drawFront = wrap(a.drawFront, true);
        return true;
      });
      if (!has) { C.add(`${id}.atmos`, 'fail', 'no atmos layer on this world (bg.atmos null)'); continue; }
      await step(s.page, 40, true);   // 워밍업 (굽기·첫 광원)
      await s.eval(() => { const M = window.__atm; M.warm = false; M.ms.length = 0; M.own.length = 0; M.fed.length = 0; });
      const on = await measureFrames(s.page, FR);
      // 시간 패스: 계측 없이 FR 프레임 (한 스텝 + 그리기)
      await s.eval((n) => { const M = window.__atm; M.timing = true; for (let i = 0; i < n; i++) window.__qaStep(1, true); M.timing = false; }, FR);
      const M = await s.eval(() => { const M = window.__atm; return { ms: M.ms, own: M.own, fed: M.fed, grad: M.grad, canv: M.canv, bytes: M.A.atmosBytes() }; });
      await s.eval(() => window.__atm.A.setAtmosEnabled(false));
      await step(s.page, 4, true);
      const off = await measureFrames(s.page, FR);
      await s.eval(() => window.__atm.A.setAtmosEnabled(true));
      const extra = M.own.map((d, i) => d + 2 * (M.fed[i] || 0));
      const ms = stats(M.ms.map((v) => +v.toFixed(4))), ex = stats(extra);
      const diff = stats(on.frames.map((f) => f.draw)).p50 - stats(off.frames.map((f) => f.draw)).p50;
      const row = { id, scene: sc, tier, frames: M.ms.length, ms, extraDraws: ex, ownDraws: stats(M.own), fedMax: Math.max(0, ...M.fed), diffDrawsP50: diff, grad: M.grad, canv: M.canv, bytes: M.bytes };
      rows.push(row);
      const bd = BUDGET.draws[tier] ?? 4;
      C.add(`${id}.draws`, ex.max <= bd ? 'pass' : 'fail', `extra drawImage per frame max ${ex.max} (own ${row.ownDraws.max} + fed lights ×2; budget ${bd}); whole-frame p50 diff ${diff}`);
      C.add(`${id}.grad`, M.grad === 0 && M.canv === 0 ? 'pass' : 'fail', `new gradients ${M.grad}, new canvases ${M.canv} inside the layer after warm-up (want 0)`);
      if (tier !== 'low') C.add(`${id}.ms`, ms.p95 <= BUDGET.ms ? 'pass' : 'warn', `atmos p95 ${ms.p95.toFixed(3)} ms (budget ${BUDGET.ms}; real clock on this loaded box — the verifier re-measures after Stage 4)`);
      C.add(`${id}.bytes`, M.bytes <= BUDGET.bytes ? 'pass' : 'fail', `baked sprites ${(M.bytes / 1048576).toFixed(2)} MB (≤ 1.5 MB)`);
      console.log(`${id.padEnd(14)} ms p50 ${ms.p50.toFixed(3)} p95 ${ms.p95.toFixed(3)} · extra draws max ${ex.max} (own ${row.ownDraws.max}, fed ${row.fedMax}) · diff p50 ${diff} · grad ${M.grad} canv ${M.canv} · ${(M.bytes / 1024).toFixed(0)} KB`);
    }
    C.add(`${tier}.errors`, s.errs.length ? 'fail' : 'pass', s.errs.length ? s.errs.slice(0, 4).join(' | ') : 'no page errors');
    await s.close();
  }
} finally { await env.close(); }
writeReport('atmos_perf', { when: new Date().toISOString(), vp: VP, frames: FR, budget: BUDGET, counts: C.counts(), rows, checks: C.list }, { title: 'atmos_perf (Stage 5 P2 숨쉬는 원경)' });
const red = C.red.length;
console.log(red ? `✗ ${red} red` : '✓ atmos_perf green');
process.exit(red ? 1 : 0);
