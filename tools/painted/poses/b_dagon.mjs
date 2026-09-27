// 다곤 포즈 스크립트 (tools/painted/poses.mjs · bench.mjs · rng.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/c_dagon.js)를 실제로 돌려 만든다 —
//   등장(포효) · 대기 · 오르간(들숨: 아가미 벌어짐 → 고리) · 미끼(왕관 숙임 → 떠다니는 미끼) · 촉수(치켜듦 → 수면 휩쓸기) ·
//   휘몰이(잠수 · 물창 → 다시 떠오름) · 돌진(거품 예고 → 옆으로 누운 돌진) · 피격 · 손상 1 · 1차 전환(포효) · 홍수(목장 치켜듦) ·
//   미끼 부서짐 → 경직 · 2차 전환 · 합창(순례자 울부짖음) · 손상 2 · 피격 · 사망(3.4초: 경련 → 체액·살점 → 순례자 풀려남 → 오르간 붕괴 → 가라앉음).
export const STAGE = 's16';
export const POSES = [
  'intro', 'idle', 'organ_in', 'organ_ring', 'lure_up', 'lure_out', 'tent_up', 'tent_lash',
  'whirl_down', 'whirl_up', 'charge_warn', 'charge_dash', 'hit', 'dmg1', 'phase1', 'flood',
  'bulb_break', 'stagger', 'phase2', 'choir', 'idle2', 'hit2', 'dmg2',
  'death_03', 'death_08', 'death_14', 'death_20', 'death_28',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const X = Math.round(Math.min(A.x1 - 260, A.x0 + Math.max(620, A.w * 0.6)));
  const nodlg = () => { for (let k = 0; k < 4 && g.top?.name === 'dialogue'; k++) g.top.finish?.(); };
  const step = (n) => { for (let i = 0; i < n; i++) { nodlg(); g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.idleWait = 99; } };
  const px = () => { p.x = X - 400; p.vx = 0; p.facing = 1; };
  const clear = () => {
    for (const e of w.entities) {
      if (e === b || e === p || e.kind === 'painted' || e.kind === 'bossart' || e.kind === 'standin') continue;
      if (e.kind === 'hazard' || e.kind === 'projectile' || e.kind === 'enemy' || e.owner === b || e.boss === b) e.dead = true;
    }
    b.clearJobs?.(); b.lures.length = 0;
  };
  const ph = (n, hp) => { if (b.phase < n) b.debugPhase(n); b.hp = b.stats.maxHp * hp; };
  const pin = () => { b.bx = b.tbx = X; b.moveSp = 80; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); w.cutscene = false; b.flashT = 0;
    b.cancelPattern?.(); b.invuln = false; b.harmless = false; b.hidden = false;
    b.dash = null; b.rot = 0; b.twitch = 0; b.sink = b.tsink = 0; pin();
    b.setState('idle'); b.idleWait = 99;
    for (let i = 0; i < 50; i++) { px(); pin(); step(1); }
  };
  const hold = (st, t) => { b.debugAct(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 400 && b.dying > 0 && (b.dieT ?? 0) < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': settle(); b.setState('intro'); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'idle': settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'organ_in': settle(); hold('organ', 0.9); break;
      case 'organ_ring': settle(); hold('organ', 1.45); break;
      case 'lure_up': settle(); hold('lure', 0.55); break;
      case 'lure_out': settle(); hold('lure', 1.5); break;
      case 'tent_up': settle(); hold('tentacle', 0.6); break;
      case 'tent_lash': settle(); hold('tentacle', 1.45); break;
      case 'whirl_down': settle(); hold('whirl', 1.7); break;
      case 'whirl_up': settle(); hold('whirl', 3.9); for (let i = 0; i < 400 && b.wUp == null; i++) { px(); step(1); } for (let i = 0; i < 20; i++) { px(); step(1); } break;
      case 'charge_warn': settle(); hold('charge', 0.95); break;
      case 'charge_dash': settle(); hold('charge', 1.2); for (let i = 0; i < 120 && !(b.dash && Math.abs(b.bx - A.cx) < 260); i++) { px(); step(1); } break;
      case 'hit': ph(0, 0.9); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg1': ph(1, 0.6); settle(); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'phase1': settle(); b.debugAct('phase1'); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'flood': ph(1, 0.55); settle(); hold('flood', 0.9); break;
      case 'bulb_break': ph(1, 0.5); settle(); b.hitBulb(b.bulbs[1], 1e9); step(2); break;
      case 'stagger': for (let i = 0; i < 24; i++) { px(); step(1); } break;
      case 'phase2': ph(1, 0.4); settle(); b.debugAct('phase2'); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'choir': ph(2, 0.3); settle(); hold('choir', 1.0); break;
      case 'idle2': ph(2, 0.25); settle(); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'hit2': ph(2, 0.22); settle(); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(2); break;
      case 'dmg2': ph(2, 0.12); settle(); for (let i = 0; i < 30; i++) { px(); step(1); } break;
      case 'death_03': ph(2, 0.08); settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.3); break;
      case 'death_08': untilDeath(0.8); break;
      case 'death_14': untilDeath(1.4); break;
      case 'death_20': untilDeath(2.0); break;
      case 'death_28': untilDeath(2.8); break;
    }
    nodlg();
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, dmg: b.dmg, pos: [Math.round(b.ox), Math.round(b.oy)], sink: +(b.sink ?? 0).toFixed(2), rot: +(b.rot ?? 0).toFixed(2), lures: b.lures.length, bulbs: b.bulbs.map((q) => (q.alive ? 1 : 0)).join(''), dying: +(b.dying ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: 480 프레임 주기 (오르간 → 촉수 → 2페이즈 합창 → 미끼) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 480;
  const X = Math.round(Math.min(A.x1 - 260, A.x0 + Math.max(620, A.w * 0.6)));
  if (k === 0) { b.hp = b.stats.maxHp; b.bx = b.tbx = X; b.debugAct('organ'); }
  if (k === 140) b.debugAct('tentacle');
  if (k === 280) { if (b.phase < 2) b.debugPhase(2); b.hp = b.stats.maxHp * 0.3; b.bx = b.tbx = X; b.debugAct('choir'); }
  if (k === 420) b.debugAct('lure');
  if (b.state === 'idle') b.idleWait = 99;
  p.x = X - 400; p.iframes = 1e9;
}`;

/** rng.mjs 대본: 대사는 바로 넘기고, 0프레임에 남은 공격을 지우고, 705·1095 프레임에 체력을 깎아 페이즈 1 → 2 를 넘긴다 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (w.game?.top?.name === 'dialogue') w.game.top.finish?.();
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && e.kind !== 'bossart' && e.kind !== 'standin' && (e.kind === 'projectile' || e.kind === 'hazard' || e.owner === b || e.boss === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.lures.length = 0; b.flashT = 0; b.invuln = false; b.harmless = false;
    w.cutscene = false; w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.42, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.3, { stats: p.stats }, w, {});
}`;
