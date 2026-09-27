// 몰록 포즈 스크립트 (tools/painted/poses.mjs · bench.mjs · rng.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/c_moloch.js)를 실제로 돌려 만든다 —
//   등장 · 대기 · 돌아서기 · 망치(치켜듦 → 내려침) · 집게(벌림 → 던짐 → 끌어옴) · 쇳물 붓기(창살 열림) · 굴뚝 · 용암 조수 · 화로 광선 ·
//   피격 · 손상 1 · 60% 포효(phase1) · 영혼 · 사슬 · 30% 뿔 부러짐(hornbreak) · 뿔 없는 대기 · 피격 · 손상 2 · 사망(3.2초: 균열 → 폭발 → 가라앉음).
export const STAGE = 's15';
export const POSES = [
  'intro', 'idle', 'turn', 'hammer_up', 'hammer_slam', 'tongs_open', 'tongs_throw', 'tongs_pull', 'pour', 'chimney', 'tide', 'beam',
  'hit', 'dmg1', 'phase1', 'hornbreak_pre', 'hornbreak', 'souls', 'chains', 'idle2', 'hit2', 'dmg2',
  'death_03', 'death_10', 'death_14', 'death_20', 'death_28',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const X = Math.round((b.homeX0 + b.homeX1) / 2);
  const nodlg = () => { for (let k = 0; k < 4 && g.top?.name === 'dialogue'; k++) g.top.finish?.(); };
  const step = (n) => { for (let i = 0; i < n; i++) { nodlg(); g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.idleWait = 99; } };
  const px = () => { p.x = X - 380; p.vx = 0; p.facing = 1; };
  const clear = () => {
    for (const e of w.entities) {
      if (e === b || e.kind === 'painted') continue;
      if (e.kind === 'hazard' || e.kind === 'projectile' || e.owner === b || e.boss === b) e.dead = true;
    }
    b.clearJobs?.(); b.tongs = null; b.beam = null; b.pourK = 0;
  };
  const ph = (n, hp) => { if (b.phase < n) b.debugPhase(n); b.hp = b.stats.maxHp * hp; };
  const place = () => { b.x = X - b.w / 2; b.y = A.floor - b.h; b.vx = 0; b.vy = 0; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); w.cutscene = false; b.flashT = 0;
    b.cancelPattern?.(); b.invuln = false; b.harmless = false;
    place(); b.setState('idle'); b.idleWait = 99; b.facing = -1; b.turnK = -1;
    for (let i = 0; i < 50; i++) { px(); place(); step(1); }
  };
  const hold = (st, t) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 400 && b.dying > 0 && 3.2 - b.dying < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'turn': settle(); b.facing = 1; for (let i = 0; i < 9; i++) { p.x = X + 380; step(1); b.facing = 1; } break;   // 돌아서는 도중 (turnK ≈ 0)
      case 'hammer_up': settle(); hold('hammer', 0.6); break;
      case 'hammer_slam': settle(); hold('hammer', 1.0); break;
      case 'tongs_open': settle(); hold('tongs', 0.5); break;
      case 'tongs_throw': settle(); hold('tongs', 0.95); break;
      case 'tongs_pull': settle(); hold('tongs', 1.6); break;
      case 'pour': settle(); hold('pour', 1.5); break;
      case 'chimney': settle(); hold('chimney', 1.0); break;
      case 'tide': settle(); hold('tide', 1.0); break;
      case 'beam': ph(1, 0.55); settle(); hold('furnaceBeam', 1.6); break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg1': ph(1, 0.5); settle(); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'phase1': settle(); b.debugAct('phase1'); for (let i = 0; i < 36; i++) { px(); step(1); } break;
      case 'souls': ph(2, 0.28); settle(); hold('souls', 1.1); break;
      case 'chains': ph(2, 0.28); settle(); hold('chains', 1.1); break;
      case 'hornbreak_pre': ph(1, 0.305); settle(); b.hurtbox(); b.takeHit(Math.ceil(b.stats.maxHp * 0.01), { stats: p.stats }, w, {}); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'hornbreak': for (let i = 0; i < 48; i++) { px(); step(1); } break;
      case 'idle2': ph(2, 0.28); settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'hit2': ph(2, 0.22); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg2': ph(2, 0.1); settle(); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'death_03': ph(2, 0.08); settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.3); break;
      case 'death_10': untilDeath(1.0); break;
      case 'death_14': untilDeath(1.4); break;
      case 'death_20': untilDeath(2.0); break;
      case 'death_28': untilDeath(2.8); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, form: b.formPhase, pos: [Math.round(b.cx), Math.round(b.bottom)], turnK: +(b.turnK ?? 0).toFixed(2), grate: +(b.grateK ?? 0).toFixed(2), tongs: !!b.tongs, dying: +(b.dying ?? 0).toFixed(2), exploded: !!b.exploded, painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: 480 프레임 주기 (망치 · 집게 → 뿔 없는 형태의 쇳물 붓기 · 영혼) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 480;
  const X = Math.round((b.homeX0 + b.homeX1) / 2);
  if (k === 0) { b.hp = b.stats.maxHp; b.x = X - b.w / 2; b.debugAct('hammer'); }
  if (k === 140) b.debugAct('tongs');
  if (k === 240) { if (b.phase < 2) b.debugPhase(2); b.hp = b.stats.maxHp * 0.28; b.x = X - b.w / 2; b.debugAct('pour'); }
  if (k === 400) b.debugAct('souls');
  if (b.state === 'idle') b.idleWait = 99;
  p.x = X - 380; p.iframes = 1e9;
}`;

/** rng.mjs 대본: 대사 오버레이는 바로 넘기고, 0프레임에 남은 공격을 지우고, 705·1095 프레임에 체력을 깎아 페이즈 1(포효) → 2(뿔 부러짐)를 넘긴다 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (w.game?.top?.name === 'dialogue') w.game.top.finish?.();
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && (e.kind === 'projectile' || e.kind === 'hazard' || e.owner === b || e.boss === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.tongs = null; b.beam = null; b.flashT = 0; b.invuln = false; b.harmless = false;
    w.cutscene = false; w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.42, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.3, { stats: p.stats }, w, {});
}`;
