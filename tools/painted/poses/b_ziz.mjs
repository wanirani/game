// 지즈 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/c_ziz.js)를 실제로 돌려 만든다 —
//   등장(포효) · 대기 날갯짓 · 돌풍(날개 들기 → 코어 노출 · 내려치기) · 낙뢰 · 발톱 휩쓸기(예고 · 가로지르기) · 깃털 부채 ·
//   피격 · 손상 1(P2: 날개 눈이 뜨임) · 눈 폭풍 · 회오리 · 추락(급강하 · 기절) · P3 전환 · 손상 2 · 눈 파괴 · 사망(3.6초 붕괴).
export const STAGE = 's17';
export const POSES = [
  'intro', 'idle', 'idle_b', 'gust_raise', 'gust_blow', 'bolts', 'talon_warn', 'talon_sweep', 'feathers',
  'hit', 'dmg1', 'eyestorm', 'cyclone', 'crash_dive', 'crash_stun', 'phase2', 'dmg2', 'eyes_burst',
  'death_03', 'death_10', 'death_17', 'death_23', 'death_30',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const X = Math.round(A.cx + 120);
  const nodlg = () => { for (let k = 0; k < 4 && g.top?.name === 'dialogue'; k++) g.top.finish?.(); };
  const step = (n) => { for (let i = 0; i < n; i++) { nodlg(); g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.idleWait = 99; } };
  const px = () => { p.x = X - 420; p.vx = 0; p.facing = 1; };
  const clear = () => {
    for (const e of w.entities) {
      if (e === b || e.kind === 'painted' || e.kind === 'bossart') continue;
      if (e.kind === 'hazard' || e.kind === 'projectile' || e.owner === b || e.boss === b) e.dead = true;
    }
    b.clearJobs?.();
  };
  const ph = (n, hp) => { if (b.phase < n) b.debugPhase(n); b.hp = b.stats.maxHp * hp; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); w.cutscene = false; b.flashT = 0;
    b.cancelPattern?.(); b.invuln = false; b.harmless = false;
    b.zx = b.tzx = X; b.zy = b.tzy = b.hoverY(); b.place();
    b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); b.tzx = X; step(1); }
  };
  const hold = (st, t) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 400 && b.dying > 0 && (b.dieT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'idle_b': for (let i = 0; i < 44; i++) { px(); step(1); } break;
      case 'gust_raise': settle(); hold('gust', 0.75); break;
      case 'gust_blow': settle(); hold('gust', 1.25); break;
      case 'bolts': settle(); hold('bolts', 0.6); break;
      case 'talon_warn': settle(); hold('talon', 0.6); break;
      case 'talon_sweep': settle(); hold('talon', 1.3); break;
      case 'feathers': settle(); hold('feathers', 0.75); break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg1': ph(1, 0.55); settle(); for (let i = 0; i < 60; i++) { px(); step(1); } break;
      case 'eyestorm': ph(1, 0.55); settle(); hold('eyestorm', 0.95); break;
      case 'cyclone': ph(1, 0.5); settle(); hold('cyclone', 1.5); break;
      case 'crash_dive': ph(2, 0.3); settle(); hold('crash', 1.05); break;
      case 'crash_stun': ph(2, 0.3); settle(); hold('crash', 2.4); break;
      case 'phase2': ph(1, 0.34); settle(); b.debugAct('phase2'); for (let i = 0; i < 36; i++) { px(); step(1); } break;
      case 'dmg2': ph(2, 0.2); settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'eyes_burst': ph(2, 0.2); settle(); for (const e of b.eyes.filter((_, i) => i % 3 === 0)) { e.hp = 1; b.hitEye(e, 5); } for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'death_03': ph(2, 0.1); settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.3); break;
      case 'death_10': untilDeath(1.0); break;
      case 'death_17': untilDeath(1.7); break;
      case 'death_23': untilDeath(2.3); break;
      case 'death_30': untilDeath(3.0); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    const pr = b._painted?.proxy;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, z: [Math.round(b.zx), Math.round(b.zy)], eyes: b.eyes.filter((e) => e.alive).length, dying: +(b.dying ?? 0).toFixed(2), painted: !!pr && !pr.dead };
  };
})()`;

/** 벤치마크 대본: 480 프레임 주기 (돌풍 → 깃털 → P2 눈 폭풍 → 회오리) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 480;
  if (k === 0) { b.hp = b.stats.maxHp; b.debugAct('gust'); }
  if (k === 200) b.debugAct('feathers');
  if (k === 260) { if (b.phase < 1) b.debugPhase(1); b.hp = b.stats.maxHp * 0.5; b.debugAct('eyestorm'); }
  if (k === 380) b.debugAct('cyclone');
  if (b.state === 'idle') b.idleWait = 99;
  p.x = A.cx - 400; p.iframes = 1e9;
}`;

/** rng.mjs 대본: 대사는 바로 넘기고, 0프레임에 남은 공격을 지우고, 705·1095 프레임에 체력을 깎아 페이즈 1 → 2 를 넘긴다 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (w.game?.top?.name === 'dialogue') w.game.top.finish?.();
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && e.kind !== 'bossart' && (e.kind === 'projectile' || e.kind === 'hazard' || e.owner === b || e.boss === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.flashT = 0; b.invuln = false; b.harmless = false;
    w.cutscene = false; w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.36, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.33, { stats: p.stats }, w, {});
}`;
