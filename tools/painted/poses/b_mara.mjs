// 마라 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/d_mara.js)를 실제로 돌려 만든다 —
//   등장 · 대기(요람 흔들림) · 자장가 · 실 · 인형 던지기 · 가위 · 피격 · 변신(dreamshift, 살덩이가 부푼다) · P2 요람의 짐승 대기 · 요람 돌진 ·
//   얼굴들 · 아기 머리 부서짐 · 붕괴 · P3 전환(phase2) · 가짜 새벽(쓰러진 척 → 깨어남) · 비명(입속 눈) · 손상 2 · 사망(3.4초 붕괴).
export const STAGE = 's18';
export const POSES = [
  'intro', 'idle', 'idle_b', 'lullaby', 'threads', 'dolls', 'scissors', 'hit', 'dreamshift',
  'f2_idle', 'f2_walk', 'cradleRush', 'faces', 'heads_broken', 'collapse', 'phase2', 'dawn_fake', 'dawn_wake', 'scream', 'dmg2',
  'death_03', 'death_09', 'death_14', 'death_20', 'death_28',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const nodlg = () => { for (let k = 0; k < 4 && g.top?.name === 'dialogue'; k++) g.top.finish?.(); };
  const step = (n) => { for (let i = 0; i < n; i++) { nodlg(); g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.idleWait = 99; } };
  const px = () => { const L = b.home ?? A; p.x = Math.max(A.x0 + 40, Math.min(A.x1 - 80, b.bx - 330)); p.vx = 0; p.facing = 1; };
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
    if (w.banner && b._fakeBanner === w.banner) w.banner = null;
    b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); step(1); }
  };
  const hold = (st, t) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 400 && b.dying > 0 && (b.dieT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'idle_b': for (let i = 0; i < 44; i++) { px(); step(1); } break;
      case 'lullaby': settle(); hold('lullaby', 1.0); break;
      case 'threads': settle(); hold('threads', 0.8); break;
      case 'dolls': settle(); hold('dolls', 0.6); break;
      case 'scissors': settle(); hold('scissors', 0.55); break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dreamshift': ph(0, 0.62); settle(); b.debugAct('dreamshift'); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'f2_idle': ph(1, 0.55); settle(); for (let i = 0; i < 90; i++) { px(); step(1); } break;
      case 'f2_walk': b.mvx = 120 * (b.facing || 1); for (let i = 0; i < 24; i++) { px(); b.mvx = 120 * (b.facing || 1); step(1); } break;
      case 'cradleRush': ph(1, 0.5); settle(); hold('cradleRush', 0.9); break;
      case 'faces': ph(1, 0.5); settle(); hold('faces', 0.7); break;
      case 'heads_broken': ph(1, 0.45); settle(); for (const h of b.heads.slice(0, 2)) b.hitHead(h, 1e6); for (let i = 0; i < 16; i++) { px(); step(1); } break;
      case 'collapse': ph(1, 0.42); settle(); hold('collapse', 1.2); break;
      case 'phase2': ph(1, 0.32); settle(); b.debugAct('phase2'); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'dawn_fake': ph(2, 0.25); settle(); hold('falseDawn', 0.6); break;
      case 'dawn_wake': for (let i = 0; i < 36; i++) { px(); step(1); } break;
      case 'scream': ph(2, 0.22); settle(); hold('scream', 1.25); break;
      case 'dmg2': ph(2, 0.18); settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'death_03': ph(2, 0.1); settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.3); break;
      case 'death_09': untilDeath(0.9); break;
      case 'death_14': untilDeath(1.4); break;
      case 'death_20': untilDeath(2.0); break;
      case 'death_28': untilDeath(2.8); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    const pr = b._painted?.proxy;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, form: b.form, xy: [Math.round(b.bx), Math.round(b.by)], heads: b.heads.filter((h) => h.alive).length, dying: +(b.dying ?? 0).toFixed(2), painted: !!pr && !pr.dead };
  };
})()`;

/** 벤치마크 대본: 480 프레임 주기 (자장가 → 인형 → P2 요람 돌진 → 얼굴들) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 480;
  if (k === 0) { b.hp = b.stats.maxHp * 0.9; b.debugAct('lullaby'); }
  if (k === 200) b.debugAct('dolls');
  if (k === 260) { if (b.phase < 1) b.debugPhase(1); b.hp = b.stats.maxHp * 0.5; b.debugAct('cradleRush'); }
  if (k === 380) b.debugAct('faces');
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
