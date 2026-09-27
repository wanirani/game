// 베헤모스 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/d_behemoth.js)를 실제로 돌려 만든다 —
//   등장 · 대기 · 걷기 · 돌진(긁기 예고 · 질주) · 무릎 꿇음(여왕이 바닥−150 까지) · 뿌리 · 포자 폭발 · 짓밟기(앞발 치켜들기) · 피격 ·
//   P1 전환(여왕이 깨어남) · 여왕의 가시 · 껍데기 소환 · 주머니 터짐 · 기절 · P2 전환(여왕의 비명) · 부패의 숨 · 개화 · 손상 2 · 사망(4초).
export const STAGE = 's19';
export const POSES = [
  'intro', 'idle', 'walk', 'charge_warn', 'charge_run', 'kneel', 'roots', 'sporeBurst', 'stomp', 'hit',
  'phase1', 'queenThorns', 'husks', 'sacs_burst', 'stun', 'phase2', 'rotBreath', 'bloom', 'dmg2',
  'death_03', 'death_10', 'death_16', 'death_24', 'death_34',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const X = Math.round(Math.min(A.x1 - 260, Math.max(A.x0 + 260, b.bx)));
  const nodlg = () => { for (let k = 0; k < 4 && g.top?.name === 'dialogue'; k++) g.top.finish?.(); };
  const step = (n) => { for (let i = 0; i < n; i++) { nodlg(); g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.idleWait = 99; } };
  const px = () => { p.x = Math.max(A.x0 + 40, X - 470); p.vx = 0; p.facing = 1; };
  const clear = () => {
    for (const e of w.entities) {
      if (e === b || e.kind === 'painted' || e.kind === 'bossart') continue;
      if (e.kind === 'hazard' || e.kind === 'projectile' || e.kind === 'enemy' || e.owner === b || e.boss === b) e.dead = true;
    }
    b.clearJobs?.();
  };
  const ph = (n, hp) => { if (b.phase < n) b.debugPhase(n); b.hp = b.stats.maxHp * hp; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); w.cutscene = false; b.flashT = 0;
    b.cancelPattern?.(); b.invuln = false; b.harmless = false;
    b.bx = X; b.mvx = 0; b.place?.();
    b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); b.bx = X; b.mvx = 0; step(1); }
  };
  const hold = (st, t) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 400 && b.dying > 0 && (b.dieT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'walk': settle(); for (let i = 0; i < 30; i++) { px(); b.mvx = -50 * (b.facing || 1) * -1; step(1); } b.mvx = 0; break;
      case 'charge_warn': settle(); hold('charge', 0.6); break;
      case 'charge_run': settle(); hold('charge', 1.25); break;
      case 'kneel': settle(); hold('kneel', 1.0); break;
      case 'roots': settle(); hold('roots', 0.7); break;
      case 'sporeBurst': settle(); hold('sporeBurst', 0.8); break;
      case 'stomp': settle(); hold('stomp', 0.55); break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'phase1': ph(0, 0.62); settle(); b.debugAct('phase1'); for (let i = 0; i < 50; i++) { px(); step(1); } break;
      case 'queenThorns': ph(1, 0.5); settle(); hold('queenThorns', 0.7); break;
      case 'husks': ph(1, 0.5); settle(); hold('husks', 0.8); break;
      case 'sacs_burst': ph(1, 0.45); settle(); for (const s of b.sacs.slice(0, 2)) b.hitSac(s, 1e6); for (let i = 0; i < 16; i++) { px(); step(1); } break;
      case 'stun': ph(1, 0.42); settle(); hold('stun', 1.2); break;
      case 'phase2': ph(1, 0.32); settle(); b.debugAct('phase2'); for (let i = 0; i < 50; i++) { px(); step(1); } break;
      case 'rotBreath': ph(2, 0.25); settle(); hold('rotBreath', 1.2); break;
      case 'bloom': ph(2, 0.22); settle(); hold('bloom', 1.0); break;
      case 'dmg2': ph(2, 0.15); settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'death_03': ph(2, 0.1); settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.3); break;
      case 'death_10': untilDeath(1.0); break;
      case 'death_16': untilDeath(1.6); break;
      case 'death_24': untilDeath(2.4); break;
      case 'death_34': untilDeath(3.4); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    const pr = b._painted?.proxy;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, bx: Math.round(b.bx), sacs: b.sacs.filter((s) => s.alive).length, q: b.queenAwake, dying: +(b.dying ?? 0).toFixed(2), painted: !!pr && !pr.dead };
  };
})()`;

/** 벤치마크 대본: 480 프레임 주기 (포자 폭발 → 짓밟기 → P2 여왕의 가시 → 부패의 숨) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 480;
  if (k === 0) { b.hp = b.stats.maxHp * 0.9; b.debugAct('sporeBurst'); }
  if (k === 200) b.debugAct('stomp');
  if (k === 260) { if (b.phase < 1) b.debugPhase(1); b.hp = b.stats.maxHp * 0.5; b.debugAct('queenThorns'); }
  if (k === 380) b.debugAct('rotBreath');
  if (b.state === 'idle') b.idleWait = 99;
  p.x = A.x0 + 80; p.iframes = 1e9;
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
