// 카론 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/e_charon.js)를 실제로 돌려 만든다 —
//   등장(모자 들기) · 대기 · 마차 걷기 · 질주(땅 긁기 · 달림 · 앞들기 카운터) · 채찍(머리 위 · 휘두름) · 관 떨구기(덜컹) · 혼불 등불(부풂 · 꺼짐 노출) ·
//   앞발 짓밟기 · 피격 · 손상 1 · 무릎(마차) · unbridle 전환(굴레가 끊어짐 · 마차가 기울어 부서짐 · 마부가 일어섬) · 2페이즈 대기 · 걷기 · 고삐 사슬 ·
//   혼불 휘두르기 · 통행료 · 빈 영구차 · 망자 부르기(무릎 · 노출) · 무릎(마부) · 15% 나동그라짐 · 쓰러짐(주저앉음 → 재와 혼불)
export const STAGE = 's25';
export const POSES = [
  'intro', 'idle', 'walk', 'run_paw', 'run_go', 'run_rear', 'whip_wind', 'whip', 'coffin', 'lantern', 'lantern_out', 'stomp', 'hit', 'dmg1',
  'stagger_h', 'unbridle_07', 'unbridle_14', 'unbridle_22', 'idle2', 'walk2', 'chain', 'swing', 'toll', 'ghost', 'gather', 'gather_exp',
  'stagger_m', 'last', 'fall_05', 'fall_20', 'fall_28',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const X = Math.round(A.cx + 120);
  const nodlg = () => { for (let k = 0; k < 4 && g.top?.name === 'dialogue'; k++) g.top.finish?.(); };
  const step = (n) => { for (let i = 0; i < n; i++) { nodlg(); g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.idleWait = 99; } };
  const px = (d = 420) => { p.x = X - d; p.vx = 0; p.facing = 1; };
  const clear = () => {
    for (const e of w.entities) {
      if (e === b || e.kind === 'painted' || e.kind === 'bossart' || e.kind === 'standin') continue;
      if (e.kind === 'hazard' || e.kind === 'projectile' || e.owner === b || e.boss === b || e.summoner === b) e.dead = true;
    }
    b.clearJobs?.();
  };
  const ph = (n, hp) => { if (b.phase < n) b.debugPhase(n); b.hp = b.stats.maxHp * hp; b.capBud = null; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); w.cutscene = false; b.flashT = 0;
    b.cancelPattern?.(); b.invuln = false; b.harmless = false;
    b.zx = b.tzx = X; b.fy = A.floor; b.facing = -1; b.fk = -1; b.spd = 0; b.run = null; b.place();
    b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); b.tzx = X; b.spd = 0; step(1); }
  };
  const hold = (st, t, d) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(d); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 900 && b.dying > 0 && (b.dieT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'walk': settle(); b.tzx = X - 300; b.spd = 60; for (let i = 0; i < 50; i++) { px(); b.tzx = X - 300; b.spd = 60; step(1); } break;
      case 'run_paw': settle(); hold('deathRun', 0.5, 500); break;
      case 'run_go': settle(); hold('deathRun', 1.15, 700); break;
      case 'run_rear': settle(); b.debugAct('deathRun'); for (let i = 0; i < 400 && !b.cWin && b.state === 'deathRun'; i++) { px(700); step(1); } for (let i = 0; i < 12; i++) { px(700); step(1); } break;
      case 'whip_wind': settle(); hold('whipCrack', 0.35, 330); break;
      case 'whip': settle(); hold('whipCrack', 0.9, 330); break;
      case 'coffin': settle(); hold('coffinDrop', 0.85, 380); break;
      case 'lantern': settle(); hold('soulLantern', 0.9, 380); break;
      case 'lantern_out': settle(); b.debugAct('soulLantern'); for (let i = 0; i < 24; i++) { px(380); step(1); } b.hitPart = b.pLan; b.takeHit(1, { stats: p.stats }, w, {}); for (let i = 0; i < 16; i++) { px(380); step(1); } break;
      case 'stomp': settle(); hold('rearStomp', 0.5, 420); break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg1': ph(0, 0.6); settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'stagger_h': ph(0, 0.6); settle(); hold('stagger', 0.6); break;
      case 'unbridle_07': ph(0, 0.52); settle(); b.hurtbox(); b.capBud = null; b.takeHit(b.stats.maxHp * 0.03, { stats: p.stats }, w, {}); for (let i = 0; i < 42; i++) { px(); step(1); } break;
      case 'unbridle_14': for (let i = 0; i < 42; i++) { px(); step(1); } break;
      case 'unbridle_22': for (let i = 0; i < 48; i++) { px(); step(1); } break;
      case 'idle2': ph(1, 0.45); settle(); for (let i = 0; i < 30; i++) { px(260); step(1); } break;
      case 'walk2': ph(1, 0.45); settle(); b.tzx = X + 300; b.spd = 150; for (let i = 0; i < 40; i++) { px(260); b.tzx = X + 300; b.spd = 150; step(1); } break;
      case 'chain': ph(1, 0.45); settle(); hold('reinChain', 1.15, 300); break;
      case 'swing': ph(1, 0.45); settle(); hold('lanternSwing', 0.56, 300); break;
      case 'toll': ph(1, 0.45); settle(); hold('toll', 0.5, 300); break;
      case 'ghost': ph(1, 0.45); settle(); hold('hearseGhost', 1.7, 300); break;
      case 'gather': ph(1, 0.45); settle(); hold('gatherSouls', 1.2, 300); break;
      case 'gather_exp': ph(1, 0.45); settle(); hold('gatherSouls', 2.3, 300); break;
      case 'stagger_m': ph(1, 0.45); settle(); hold('stagger', 0.7); break;
      case 'last': ph(1, 0.14); settle(); b.stagLong = true; b.debugAct('stagger'); b.stagLong = true; for (let i = 0; i < 70; i++) { px(); step(1); } break;
      case 'fall_05': ph(1, 0.1); settle(); Object.defineProperty(w, 'arcade', { value: true, configurable: true }); b.hurtbox(); b.capBud = null; b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.5); break;   // 쓰러짐: 아케이드 규칙 (world.arcade — 재와 혼불로 사라짐)
      case 'fall_20': untilDeath(2.0); break;
      case 'fall_28': untilDeath(2.8); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    const pr = b._painted?.proxy;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, x: Math.round(b.zx), y: Math.round(b.fy), coach: b.coach, man: b.man, dying: +(b.dying ?? 0).toFixed(2), painted: !!pr && !pr.dead };
  };
})()`;

/** 벤치마크 대본: 600 프레임 주기 (질주 → 채찍 → P2 고삐 사슬 → 망자 부르기) — 말 둘(벡터 탈것 리그) 포함 */
export const BENCH = `(i, b, p, A) => {
  const k = i % 600;
  if (k === 0) { b.hp = b.stats.maxHp; b.capBud = null; b.debugAct('deathRun'); }
  if (k === 150) b.debugAct('whipCrack');
  if (k === 300) { if (b.phase < 1) b.debugPhase(1); b.hp = b.stats.maxHp * 0.45; b.debugAct('reinChain'); }
  if (k === 450) b.debugAct('gatherSouls');
  if (b.state === 'idle') b.idleWait = 99;
  p.x = A.cx - 360; p.iframes = 1e9;
}`;

/** rng.mjs 대본: 대사는 바로 넘기고, 0프레임에 남은 공격을 지우고, 705 프레임에 체력을 깎아 페이즈 1 을 넘긴다 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (w.game?.top?.name === 'dialogue') w.game.top.finish?.();
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && e.kind !== 'bossart' && e.kind !== 'standin' && (e.kind === 'projectile' || e.kind === 'hazard' || e.owner === b || e.boss === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.flashT = 0; b.invuln = false; b.harmless = false;
    w.cutscene = false; w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 705) { b.capBud = null; b.takeHit(b.stats.maxHp * 0.52, { stats: p.stats }, w, {}); }
}`;
