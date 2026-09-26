// 로딩 팝 검사: 실제 흐름(앞 방 → 보스방 → 경기장 트리거 → 등장)에서 채색 굽기가 보스 등장 전에 끝나는지,
// 늦으면 벡터가 몇 프레임 보였다가 교차 페이드되는지 기록한다. 느린 폰은 CPU 쓰로틀로 흉내 낸다.
// 사용: node tools/painted/pop.mjs <bossId> [--mobile] [--cpu 5] [--from boss|ante]
//   --from ante (기본): 보스방 바로 앞 방에서 굽기를 새로 시작해 오른쪽으로 걸어간다 (registry 의 앞 방 미리 굽기 경로)
//   --from boss      : 보스방 입구에서 굽기를 새로 시작 (앞 방을 건너뛴 최악의 경우 — 교차 페이드 확인용)
//   출력: 이벤트 시각(ms) — painted ready / boss created / VECTOR draw (첫·마지막) / 장면 전환, 벡터 프레임 수
import { open } from './lib.mjs';
const argv = process.argv.slice(2);
const id = argv[0];
if (!id) { console.log('usage: node tools/painted/pop.mjs <bossId> [--mobile] [--cpu 5] [--from ante|boss]'); process.exit(1); }
const val = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const mobile = argv.includes('--mobile'), rate = +val('cpu', 1), from = val('from', 'ante');
const mod = await import(`./poses/${id}.mjs`);
const s = await open({ url: `index.html?scene=stage&stage=${mod.STAGE}&room=boss`, mobile, dpr: mobile ? 3 : 1.5 });
const cdp = await s.page.context().newCDPSession(s.page);
if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
const start = await s.page.evaluate(async ([id, from]) => {
  const R = await import('/src/render/painted/registry.js');
  const g = window.__game, w = g.world, st = w.stage;
  const ante = Object.entries(st.rooms).find(([, r]) => ['exitRight', 'exitLeft', 'exitUp', 'exitDown', 'next'].some((k) => st.rooms[r[k]]?.boss))?.[0];
  R.releasePainted(id); if (window.__painted) delete window.__painted[id];
  if (!w.state.progress.seenScripts.includes(id + '_pre')) w.state.progress.seenScripts.push(id + '_pre');
  w.loadRoom(from === 'ante' && ante ? ante : 'boss');   // roomEntered → 미리 굽기 (쓰로틀 상태에서)
  const p = w.player; p.hp = p.stats.hp = 1e9;
  window.__tr = { t0: performance.now(), ev: [], vec: 0 };
  const T = window.__tr, log = (k) => T.ev.push([k, Math.round(performance.now() - T.t0)]);
  let hadBoss = false, hadReady = false, last = '', lastRoom = '';
  const f = () => {
    const w2 = g.world, b = w2.boss, top = g.scenes[g.scenes.length - 1]?.name;
    if (top !== last) { log('scene ' + top); last = top; }
    if (w2.roomId !== lastRoom) { log('room ' + w2.roomId); lastRoom = w2.roomId; }
    if (b && !hadBoss) { hadBoss = true; log('boss created'); const r = b.render.bind(b); b.render = (c, wd) => { T.vec++; log('VECTOR draw'); return r(c, wd); }; }
    if (window.__painted?.[id] && !hadReady) { hadReady = true; log('painted ready ' + JSON.stringify({ ms: window.__painted[id].ms, td: window.__painted[id].td, memMB: window.__painted[id].memMB })); }
    requestAnimationFrame(f);
  };
  f();
  return { ante, from };
}, [id, from]);
await s.page.keyboard.down('ArrowRight');
for (let i = 0; i < 600; i++) {
  await s.page.waitForTimeout(100);
  const b = await s.page.evaluate(() => { const w = window.__game.world; w.player.hp = 1e9; w.player.iframes = 5; return !!w.boss; });
  if (b) break;
}
await s.page.keyboard.up('ArrowRight');
await s.page.waitForTimeout(6000);
const T = await s.page.evaluate(() => window.__tr);
let lastV = -1; const ev = [];
for (const e of T.ev) { if (e[0] === 'VECTOR draw') { if (lastV < 0) ev.push(e); lastV = e[1]; continue; } if (lastV >= 0) { ev.push(['...last VECTOR draw', lastV]); lastV = -1; } ev.push(e); }
if (lastV >= 0) ev.push(['...last VECTOR draw', lastV]);
console.log(JSON.stringify({ id, mobile, cpu: rate, ...start, vectorFrames: T.vec }));
for (const e of ev) console.log(String(e[1]).padStart(7), e[0]);
console.log(s.errors.join('\n') || 'NO ERRORS');
await s.close();
