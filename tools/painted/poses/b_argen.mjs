// 아르겐 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/e_argen.js)를 실제로 돌려 만든다 —
//   등장(포효) · 대기 날갯짓 · 숨결(예고 · 쓸기) · 급강하(겨냥 · 돌진) · 날개 돌풍(들기 · 내려치기) · 결정 비 · 꼬리(예고 · 휩쓸기 · 높은 되휩쓸기) ·
//   피격 · 손상 1(2페이즈: 결정 자람 · 핵 노출) · 사라졌다 내리꽂기(그림자 · 기절) · 핵 노출 · 추락(stagger) · corrupt 전환 ·
//   awaken 전환(결정 깨짐 · 은빛) · 손상 2 · 은빛 비행(storm) · 정화(5초: 핵 균열 → 부서짐 → 내려앉음 → 날아오름)
export const STAGE = 's21';
export const POSES = [
  'intro', 'idle', 'idle_b', 'breath_warn', 'breath', 'dive_aim', 'dive', 'gust_raise', 'gust_blow', 'crystals', 'tail_warn', 'tail_sweep',
  'hit', 'dmg1', 'tail_high', 'vanish_shadow', 'vanish_stun', 'coreBurst', 'stagger', 'corrupt', 'awaken', 'dmg2', 'storm',
  'purify_05', 'purify_13', 'purify_22', 'purify_32', 'purify_42',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const X = Math.round(A.cx + 140);
  const nodlg = () => { for (let k = 0; k < 4 && g.top?.name === 'dialogue'; k++) g.top.finish?.(); };
  const step = (n) => { for (let i = 0; i < n; i++) { nodlg(); g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.idleWait = 99; } };
  const px = () => { p.x = X - 460; p.vx = 0; p.facing = 1; };
  const clear = () => {
    for (const e of w.entities) {
      if (e === b || e.kind === 'painted' || e.kind === 'bossart' || e.kind === 'standin') continue;
      if (e.kind === 'hazard' || e.kind === 'projectile' || e.owner === b || e.boss === b) e.dead = true;
    }
    b.clearJobs?.();
  };
  const ph = (n, hp) => { if (b.phase < n) b.debugPhase(n); b.hp = b.stats.maxHp * hp; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); w.cutscene = false; b.flashT = 0;
    b.cancelPattern?.(); b.invuln = false; b.harmless = false;
    b.zx = b.tzx = X; b.zy = b.tzy = b.hoverY(); b.facing = -1; b.fk = -1; b.place();
    b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); b.tzx = X; step(1); }
  };
  const hold = (st, t) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && (b.dieT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'idle_b': for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'breath_warn': settle(); hold('breath', 0.7); break;
      case 'breath': settle(); hold('breath', 1.7); break;
      case 'dive_aim': settle(); hold('dive', 0.6); break;
      case 'dive': settle(); hold('dive', 1.12); break;
      case 'gust_raise': settle(); hold('gust', 0.8); break;
      case 'gust_blow': settle(); hold('gust', 1.25); break;
      case 'crystals': settle(); hold('crystals', 1.35); break;
      case 'tail_warn': settle(); hold('tail', 0.6); break;
      case 'tail_sweep': settle(); hold('tail', 1.05); break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg1': ph(1, 0.55); settle(); for (let i = 0; i < 70; i++) { px(); step(1); } break;
      case 'tail_high': ph(1, 0.55); settle(); hold('tail', 2.0); break;
      case 'vanish_shadow': ph(1, 0.55); settle(); hold('vanish', 1.5); break;
      case 'vanish_stun': ph(1, 0.55); settle(); hold('vanish', 2.6); break;
      case 'coreBurst': ph(1, 0.5); settle(); hold('coreBurst', 1.3); break;
      case 'stagger': ph(1, 0.5); settle(); hold('stagger', 1.0); break;
      case 'corrupt': ph(0, 0.7); settle(); b.debugAct('corrupt'); for (let i = 0; i < 50; i++) { px(); step(1); } break;
      case 'awaken': ph(1, 0.34); settle(); b.debugAct('awaken'); for (let i = 0; i < 72; i++) { px(); step(1); } break;
      case 'dmg2': ph(2, 0.2); settle(); for (let i = 0; i < 60; i++) { px(); step(1); } break;
      case 'storm': ph(2, 0.2); settle(); hold('storm', 1.8); break;
      case 'purify_05': ph(2, 0.1); settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.5); break;
      case 'purify_13': untilDeath(1.3); break;
      case 'purify_22': untilDeath(2.2); break;
      case 'purify_32': untilDeath(3.2); break;
      case 'purify_42': untilDeath(4.2); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    const pr = b._painted?.proxy;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, z: [Math.round(b.zx), Math.round(b.zy)], crys: b.crys.filter((c) => c.alive).length, silver: +(b.silverK ?? 0).toFixed(2), dying: +(b.dying ?? 0).toFixed(2), painted: !!pr && !pr.dead };
  };
})()`;

/** 벤치마크 대본: 480 프레임 주기 (숨결 → 날개 돌풍 → P2 핵 노출 → 꼬리) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 480;
  if (k === 0) { b.hp = b.stats.maxHp; b.debugAct('breath'); }
  if (k === 200) b.debugAct('gust');
  if (k === 300) { if (b.phase < 1) b.debugPhase(1); b.hp = b.stats.maxHp * 0.5; b.debugAct('coreBurst'); }
  if (k === 420) b.debugAct('tail');
  if (b.state === 'idle') b.idleWait = 99;
  p.x = A.cx - 420; p.iframes = 1e9;
}`;

/** rng.mjs 대본: 대사는 바로 넘기고, 0프레임에 남은 공격을 지우고, 705·1095 프레임에 체력을 깎아 페이즈 1 → 2 를 넘긴다 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (w.game?.top?.name === 'dialogue') w.game.top.finish?.();
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && e.kind !== 'bossart' && e.kind !== 'standin' && (e.kind === 'projectile' || e.kind === 'hazard' || e.owner === b || e.boss === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.flashT = 0; b.invuln = false; b.harmless = false;
    w.cutscene = false; w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.36, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.33, { stats: p.stats }, w, {});
}`;
