// 빠르기 표 (node, 화면 없음): 영웅의 동작마다 걸리는 시간(초)을 규칙(sim)으로 잰다 — 빠르기 조율 전 · 후 비교용.
//   node tools/v2/speedfire_times.mjs [--json]
const { Sim, TUNE, KINDS, MOVES, flatArena } = await import(process.env.PLAY_ENTRY || '../../src/v2/play/index.js');
const DT = 1 / 60, R = {};
let seed = 777; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const mk = () => new Sim(flatArena(6000, 6000, []), {});
const sp = (h) => Math.hypot(h.vx, h.vz);
// 달려 나가기: 서 있다가 스틱을 끝까지 → 가장 빠른 속도의 90 % 까지 · 0.5초 동안 간 거리
{ const s = mk(), h = s.hero; let t90 = -1; const x0 = h.x;
  for (let i = 1; i <= 90; i++) { s.update(DT, { mx: 1, mz: 0 }); if (t90 < 0 && sp(h) >= 0.9 * TUNE.runX) t90 = i * DT; if (i === 30) R.dist05 = h.x - x0; }
  R.runX = TUNE.runX; R.runZ = TUNE.runZ; R.start90 = t90;
  // 서기: 놓은 뒤 10 px/s 아래까지
  let tStop = -1; const xs = h.x; for (let i = 1; i <= 60; i++) { s.update(DT, {}); if (tStop < 0 && sp(h) < 10) tStop = i * DT; } R.stop = tStop; R.stopDist = h.x - xs; }
// 반전: 오른쪽으로 달리다 왼쪽 → 돌아서기 시간 · 새 쪽으로 70 % 빠르기까지
{ const s = mk(), h = s.hero; for (let i = 0; i < 60; i++) s.update(DT, { mx: 1, mz: 0 });
  let tTurn = -1, t70 = -1; for (let i = 1; i <= 60; i++) { s.update(DT, { mx: -1, mz: 0 }); if (tTurn < 0 && h.anim !== 'turn' && i > 1) tTurn = (i - 1) * DT; if (t70 < 0 && -h.vx > 0.7 * TUNE.runX) t70 = i * DT; }
  R.pivot = tTurn; R.rev70 = t70; }
// 연타 3: 공격을 4틱마다 누른다 (가장 빠르게 잇기) → 각 타의 시작 · 판정 · 끝
{ const s = mk(), h = s.hero; const st = {}; let i = 0, prev = null;
  for (; i < 200; i++) { s.update(DT, { attack: i % 4 === 0 && i < 120 }); const id = h.move?.id ?? null; if (id && id !== prev) st[id] = (i + 1) * DT - DT; if (!id && prev === 'c3') { st.end = (i + 1) * DT; break; } prev = id; }
  R.c1 = MOVES.c1.dur; R.c2 = MOVES.c2.dur; R.c3 = MOVES.c3.dur; R.c2at = st.c2; R.c3at = st.c3; R.comboEnd = st.end;
  R.hit1 = MOVES.c1.hit[0]; R.hit3 = (st.c3 ?? 0) + MOVES.c3.hit[0]; R.chainWin = +(MOVES.c1.dur - MOVES.c1.cancel).toFixed(3); }
// 구르기: 길이 · 거리 · 다시 구르기까지
{ const s = mk(), h = s.hero; const x0 = h.x; let n = 0; s.update(DT, { mx: 1, mz: 0, dash: true }); n++; while (h.dashT > 0 && n < 120) { s.update(DT, { mx: 1, mz: 0 }); n++; }
  R.rollT = TUNE.rollT; R.rollDist = +(h.x - x0).toFixed(0); R.rollCd = TUNE.rollCd; R.rollIfr = TUNE.rollIfr; }
// 휘감기: 모으기 시작부터(누르고 chargeHold 뒤) 다 모일 때까지 + 놓은 뒤 판정 · 끝
{ R.chargeFull = +(TUNE.chargeHold + TUNE.chargeT).toFixed(3); R.whipHit = MOVES.whip.hit[0]; R.whipDur = MOVES.whip.dur; R.sweepDur = MOVES.sweep.dur; R.sweepHit = MOVES.sweep.hit[0]; R.plungeRecover = MOVES.plunge.recover; }
// 점프: 높이 · 공중 시간 · 내려베기(꼭대기에서 눌러 땅에 닿아 일어서기까지)
{ const s = mk(), h = s.hero; let top = 0, n = 0; s.update(DT, { jump: true, jumpHeld: true }); n++; while (!h.onGround && n < 200) { s.update(DT, { jumpHeld: true }); top = Math.max(top, h.y); n++; }
  R.jumpTop = +top.toFixed(0); R.jumpAir = +(n * DT).toFixed(3);
  const s2 = mk(), h2 = s2.hero; let m = 0; s2.update(DT, { jump: true, jumpHeld: true }); while (h2.vy > 0 && m < 200) { s2.update(DT, { jumpHeld: true }); m++; }
  let k = 0; s2.update(DT, { attack: true, jumpHeld: true }); k++; while (h2.move && k < 300) { s2.update(DT, { jumpHeld: true }); k++; } R.plunge = +(k * DT).toFixed(3); }
R.enemy = Object.fromEntries(['skeleton_soldier', 'skeleton_mage', 'plague_corpse', 'grave_ghost', 'gravekeeper_armor', 'bat', 'banshee_queen'].map((k) => [k, KINDS[k].speed]));
R.enemyWindup = Object.fromEntries(['skeleton_soldier', 'plague_corpse', 'gravekeeper_armor'].map((k) => [k, KINDS[k].attacks.map((a) => a.windup).join('/')]));
for (const k in R) if (typeof R[k] === 'number') R[k] = +R[k].toFixed(3);
if (process.argv.includes('--json')) console.log(JSON.stringify(R));
else for (const [k, v] of Object.entries(R)) console.log(k.padEnd(14), typeof v === 'object' ? JSON.stringify(v) : v);
