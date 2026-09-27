// 진홍의 갑주군주 포즈 스크립트 (tools/painted/poses.mjs · bench.mjs · rng.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
export const STAGE = 's04';
// 로직 상태기계를 실제로 돌려 만든다 (렌더러는 상태를 읽기만 하므로 벡터/채색 비교가 공정하다).
//  조립 형태: idle walk sweep(하단/상단 예고·휘두름) overhead leap thrust pillars · 피격 · 손상 1 · 1페이즈 변신(업화)
//  조립 상태 사망(한 방에 30% 아래로 떨어졌을 때) → 새 보스를 만들어 분리 형태: 분리 연출 · 부유 · 로켓 건틀릿 · 할버드 회전 낙하 ·
//  투구 화염탄 · 재조립 압살 · 분리 상태 사망
export const POSES = [
  'idle', 'walk', 'sweep_lw', 'sweep_la', 'sweep_hw', 'sweep_ha', 'over_w', 'over_a', 'leap_crouch', 'leap_air', 'leap_land',
  'thrust_w', 'thrust_a', 'pillars', 'hit', 'dmg1', 'transform1', 'heat_walk',
  'death_a04', 'death_a10', 'death_a18',
  'splitting', 'split_burst', 'split_idle', 'rocket_aim', 'rocket_fly', 'halspin_up', 'halspin_drop', 'halspin_stuck', 'helmfire',
  'crush_hover', 'crush_drop', 'crush_land', 'split_hit',
  'death_s03', 'death_s08', 'death_s14', 'death_s21',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(async () => {
  const BI = await import('/src/game/bosses/index.js');
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const B = () => w.boss;
  const HX = B().homeX;
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; const b = B(); if (b && b.state === 'idle') b.cool = 99; } };   // 매 프레임 그려야 렌더러 시뮬레이션(입자·줄·파편)이 진행된다
  let pd = 260;   // 플레이어와 보스 거리 (보스 왼쪽)
  const px = () => { const b = B(); p.x = Math.max(b.A.x0 + 40, b.cx - pd) - p.w / 2; p.vx = 0; };
  const hold = (st, t, f) => { const b = B(); b.setState(st); b.cool = 99; for (let i = 0; i < Math.round(t * 60); i++) { px(); f?.(b, i); step(1); } };
  const settle = (dist = 150) => {
    const b = B();
    if (b.dying > 0) return;
    pd = dist; b.invuln = false;
    if (!b.split) { b.x = HX - b.w / 2; b.y = b.floorY - b.h; b.vx = 0; b.vy = 0; }
    b.setState('idle'); b.cool = 99; for (let i = 0; i < 70; i++) { px(); step(1); if (!b.split) b.vx = 0; }
    pd = 260;
  };
  const untilDeath = (t) => { for (let i = 0; i < 600 && B().dying > 0 && (B().deathT ?? 0) < t; i++) step(1); };
  const fresh = () => {
    const old = B(), sp = w.bossSpawn;
    for (const e of w.entities) if (e !== old && e !== p && (e.owner === old || e.summoner === old)) e.dead = true;
    old.dead = true;
    w.cleared = false; w.clearT = 0; w.exitCalled = false; w.banner = null; w.slowmo = 0;   // 클리어 연출이 결과 화면으로 넘어가지 않게
    const nb = BI.createBoss(w, sp.id, sp.x, sp.y);
    w.boss = w.add(nb); nb.setState('idle'); nb.cool = 99;
    step(20);
  };
  const toSplit = () => { const b = B(); if (!b.split) { b.phase = 2; b.hp = b.stats.maxHp * 0.25; b.phaseApply(2); } };
  const sweep = (low, t) => hold('sweep', t, (b, i) => { if (i === 0) {} b.low = low; });
  window.__pose = (name) => {
    let b = B();
    switch (name) {
      case 'idle': settle(150); hold('idle', 1.0); break;
      case 'walk': settle(150); pd = 420; hold('idle', 0.9); pd = 260; break;
      case 'sweep_lw': settle(); sweep(true, 0.55); break;
      case 'sweep_la': settle(); sweep(true, 0.83); break;
      case 'sweep_hw': settle(); sweep(false, 0.55); break;
      case 'sweep_ha': settle(); sweep(false, 0.83); break;
      case 'over_w': settle(); hold('overhead', 0.72); break;
      case 'over_a': settle(); hold('overhead', 0.95); break;
      case 'leap_crouch': settle(); hold('leap', 0.5); break;
      case 'leap_air': settle(); pd = 360; hold('leap', 0.95); break;
      case 'leap_land': settle(); pd = 360; hold('leap', 1.0, (bb) => { if (bb.leapLanded && bb.stateT - bb.landT > 0.12) bb.setState('idle'); }); break;
      case 'thrust_w': settle(); hold('thrust', 0.5); break;
      case 'thrust_a': settle(); hold('thrust', 0.72); break;
      case 'pillars': settle(); hold('pillars', 0.9); break;
      case 'hit': settle(); b.hp = b.stats.maxHp * 0.8; hold('idle', 0.4); b.takeHit(1, {}, w, {}); step(1); break;
      case 'dmg1': settle(); b.phase = 1; b.hp = b.stats.maxHp * 0.5; hold('idle', 1.2); break;
      case 'transform1': settle(); b.phase = 0; b.hp = b.stats.maxHp * 0.61; b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'heat_walk': settle(150); b.phase = 1; b.hp = b.stats.maxHp * 0.4; pd = 420; hold('idle', 1.5); pd = 260; break;
      // 조립 상태 사망 (분리 전에 쓰러짐)
      case 'death_a04': settle(); b.takeHit(1e9, {}, w, {}); untilDeath(0.4); break;
      case 'death_a10': untilDeath(1.0); break;
      case 'death_a18': untilDeath(1.8); break;
      // 새 보스 → 분리 형태
      case 'splitting': fresh(); settle(); b = B(); b.phase = 1; b.hp = b.stats.maxHp * 0.31; b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'split_burst': for (let i = 0; i < 16; i++) { px(); step(1); } break;
      case 'split_idle': toSplit(); settle(260); hold('idle', 1.4); break;
      case 'rocket_aim': toSplit(); settle(260); hold('rocket', 0.42); break;
      case 'rocket_fly': toSplit(); settle(260); hold('rocket', 0.7); break;
      case 'halspin_up': toSplit(); settle(260); hold('halSpin', 0.5); break;
      case 'halspin_drop': toSplit(); settle(260); hold('halSpin', 0.88); break;
      case 'halspin_stuck': toSplit(); settle(260); hold('halSpin', 1.2); break;
      case 'helmfire': toSplit(); settle(260); hold('helmFire', 0.66); break;
      case 'crush_hover': toSplit(); settle(260); hold('crush', 0.8); break;
      case 'crush_drop': toSplit(); settle(260); hold('crush', 1.2, (bb) => { if (bb.leapLanded) bb.setState('idle'); }); break;
      case 'crush_land': toSplit(); settle(260); hold('crush', 1.6, (bb) => { if (bb.leapLanded && bb.stateT - bb.landT > 0.15) bb.setState('idle'); }); break;
      case 'split_hit': toSplit(); settle(260); hold('idle', 0.4); B().takeHit(1, {}, w, {}); step(1); break;
      case 'death_s03': toSplit(); settle(260); B().takeHit(1e9, {}, w, {}); untilDeath(0.3); break;
      case 'death_s08': untilDeath(0.8); break;
      case 'death_s14': untilDeath(1.4); break;
      case 'death_s21': untilDeath(2.1); break;
    }
    b = B();
    p.iframes = 0; p.hurtT = 0;   // 캡처 프레임에서는 플레이어가 보이게
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, hp: +(b.hp / b.stats.maxHp).toFixed(2), split: !!b.split, pos: [Math.round(b.cx), Math.round(b.bottom)], hA: +(b.hA ?? 0).toFixed(2), dying: +(b.deathT ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: i = 프레임 번호 (tools/painted/bench.mjs). 조립 패턴 → 분리 형태 패턴을 돈다 */
export const BENCH = `(i, b, p, A) => {
  const k = i % 420;
  if (k === 0 && !b.split) { b.setState('idle'); b.cool = 99; }
  if (k === 30 && !b.split) { b.setState('sweep'); b.cool = 99; }
  if (k === 110 && !b.split) { b.setState('overhead'); b.cool = 99; }
  if (k === 200 && !b.split) { b.hp = b.stats.maxHp * 0.25; b.phase = 2; b.phaseApply(2); b.setState('idle'); b.cool = 99; }
  if (k === 230 && b.split) { b.setState('rocket'); b.cool = 99; }
  if (k === 330 && b.split) { b.setState('helmFire'); b.cool = 99; }
  if (b.state === 'idle') b.cool = 99;
  p.x = b.cx - 260; p.iframes = 1e9;
}`;

/** 게임플레이 결정성 A/B 대본 (tools/painted/rng.mjs): 0 프레임에 굽기 대기 동안 실제 루프가 남긴 상태(속도·탄·예고·연출)를 지우고,
 *  같은 방식으로 두 페이즈(60 % 변신 · 30 % 분리)를 넘긴다 — 채색 / 벡터 두 실행이 같은 출발점에서 시작하도록 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && (e.owner === b || e.owner?.owner === b || e.summoner === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.vx = 0; b.vy = 0; b.y = b.floorY - b.h; b.facing = -1; b.flashT = 0; b.stateT = 0; b._pst = -1; b.last = null; b.last2 = null; b.phaseFx = 0; b.invuln = false;
    b.low = false; b.leapLanded = false; b.tx = undefined; b.aimA = undefined;
    p.y = b.floorY - p.h; p.onGround = true;
    w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 700) { b.hp = b.stats.maxHp * 0.61; b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { stats: p.stats }, w, {}); }
  if (i === 1100) { b.hp = b.stats.maxHp * 0.31; b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { stats: p.stats }, w, {}); }
}`;
