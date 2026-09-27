// 그리모어 포즈 스크립트 (tools/painted/poses.mjs · bench.mjs · rng.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
export const STAGE = 's06';
// 로직 상태기계를 실제로 돌려 만든다 (렌더러는 상태를 읽기만 하므로 벡터/채색 비교가 공정하다).
//  idle(떠다님·깜빡임) pages(책장 폭풍 예고/발사) summon spell(화염/냉기/번개) beam(예고·쓸기) slam(떠오름·낙하·착지) bite(벌림·돌진)
//  피격 · 손상 1/2 · 1페이즈(붉은 잉크) · 2페이즈(금단의 장: 사슬 끊김, 두 원소 동시) · 사망
export const POSES = [
  'idle', 'blink', 'pages_w', 'pages_a', 'summon', 'spell_fire', 'spell_ice', 'spell_thunder', 'beam_w', 'beam_a', 'beam_sweep',
  'slam_hover', 'slam_drop', 'slam_land', 'bite_w', 'bite_a', 'hit', 'dmg1', 'transform1', 'red_idle', 'red_pages',
  'transform2', 'forbidden', 'forbidden_spell', 'forbidden_bite', 'dmg2_beam',
  'death_03', 'death_08', 'death_14', 'death_21',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const HX = b.homeX;
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle') b.cool = 99; } };   // 매 프레임 그려야 렌더러 시뮬레이션(입자·줄·파편)이 진행된다
  const px = () => { p.x = A.x0 + 330; p.vx = 0; };
  const hold = (st, t, f) => { b.setState(st); b.cool = 99; for (let i = 0; i < Math.round(t * 60); i++) { px(); f?.(i); step(1); } };
  const settle = () => {
    if (b.dying > 0) return;
    b.invuln = false; b.blink = 1; b.eyeOpen = 1;
    b.x = HX - b.w / 2 + 80; b.y = A.floor - 240 - b.h / 2; b.vx = 0; b.vy = 0;
    b.setState('idle'); b.cool = 99; for (let i = 0; i < 80; i++) { px(); step(1); }
  };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && (b.deathT ?? 0) < t; i++) step(1); };
  const spell = (el, t) => { b.elemI = ['fire', 'ice', 'thunder'].indexOf(el); hold('spell', t); };
  window.__pose = (name) => {
    switch (name) {
      case 'idle': settle(); hold('idle', 1.0); break;
      case 'blink': settle(); hold('idle', 0.5); b.blink = 0.14; step(2); break;
      case 'pages_w': settle(); hold('pages', 0.45); break;
      case 'pages_a': settle(); hold('pages', 1.05); break;
      case 'summon': settle(); hold('summon', 0.75); break;
      case 'spell_fire': settle(); spell('fire', 0.9); break;
      case 'spell_ice': settle(); spell('ice', 1.25); break;
      case 'spell_thunder': settle(); spell('thunder', 1.35); break;
      case 'beam_w': settle(); hold('beam', 0.8); break;
      case 'beam_a': settle(); hold('beam', 1.4); break;
      case 'beam_sweep': settle(); hold('beam', 2.0); break;
      case 'slam_hover': settle(); hold('slam', 0.7); break;
      case 'slam_drop': settle(); hold('slam', 1.02, () => { if (b.leapLanded) b.setState('idle'); }); break;
      case 'slam_land': settle(); hold('slam', 1.5, () => { if (b.leapLanded && b.stateT - b.landT > 0.18) b.setState('idle'); }); break;
      case 'bite_w': settle(); hold('bite', 0.5); break;
      case 'bite_a': settle(); hold('bite', 0.68); break;
      case 'hit': settle(); b.hp = b.stats.maxHp * 0.8; hold('idle', 0.4); b.takeHit(1, {}, w, {}); step(1); break;
      case 'dmg1': settle(); b.phase = 1; b.hp = b.stats.maxHp * 0.5; hold('idle', 1.0); break;
      case 'transform1': settle(); b.phase = 0; b.hp = b.stats.maxHp * 0.61; b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); for (let i = 0; i < 40; i++) { px(); step(1); } break;
      case 'red_idle': settle(); b.phase = 1; b.hp = b.stats.maxHp * 0.45; hold('idle', 1.2); break;
      case 'red_pages': settle(); b.phase = 1; hold('pages', 1.0); break;
      case 'transform2': settle(); b.phase = 1; b.hp = b.stats.maxHp * 0.31; b.takeHit(b.stats.maxHp * 0.02, {}, w, {}); for (let i = 0; i < 36; i++) { px(); step(1); } break;
      case 'forbidden': settle(); b.phase = 2; b.chainsBroken = true; b.hp = b.stats.maxHp * 0.2; hold('idle', 1.2); break;
      case 'forbidden_spell': settle(); b.phase = 2; spell('fire', 1.3); break;
      case 'forbidden_bite': settle(); b.phase = 2; hold('bite', 0.5); break;
      case 'dmg2_beam': settle(); b.phase = 2; hold('beam', 1.6); break;
      case 'death_03': settle(); b.takeHit(1e9, {}, w, {}); untilDeath(0.3); break;
      case 'death_08': untilDeath(0.8); break;
      case 'death_14': untilDeath(1.4); break;
      case 'death_21': untilDeath(2.1); break;
    }
    p.iframes = 0; p.hurtT = 0;   // 캡처 프레임에서는 플레이어가 보이게
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, hp: +(b.hp / b.stats.maxHp).toFixed(2), open: +(b.open ?? 0).toFixed(2), eye: +(b.eyeOpen ?? 0).toFixed(2), elem: b.elem, chains: !!b.chainsBroken, pos: [Math.round(b.cx), Math.round(b.cy)], dying: +(b.deathT ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: i = 프레임 번호 (tools/painted/bench.mjs) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 400;
  if (k === 0) { b.hp = b.stats.maxHp; b.setState('idle'); b.cool = 99; }
  if (k === 40) { b.setState('pages'); b.cool = 99; }
  if (k === 140) { b.setState('bite'); b.cool = 99; }
  if (k === 220) { b.hp = b.stats.maxHp * 0.25; b.phase = 2; b.chainsBroken = true; b.setState('spell'); b.cool = 99; }
  if (k === 320) { b.setState('beam'); b.cool = 99; }
  if (b.state === 'idle') b.cool = 99;
  p.x = A.x0 + 330; p.iframes = 1e9;
}`;

/** 게임플레이 결정성 A/B 대본 (tools/painted/rng.mjs): 0 프레임에 굽기 대기 동안 실제 루프가 남긴 상태(속도·탄·예고·연출)를 지우고,
 *  같은 방식으로 두 페이즈(60 % 붉은 잉크 · 30 % 금단의 장)를 넘긴다 — 채색 / 벡터 두 실행이 같은 출발점에서 시작하도록 */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && (e.owner === b || e.owner?.owner === b || e.summoner === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.vx = 0; b.vy = 0; b.facing = -1; b.flashT = 0; b.stateT = 0; b._pst = -1; b.last = null; b.last2 = null; b.phaseFx = 0; b.invuln = false;
    b.leapLanded = false; b.tx = undefined; b.ty = undefined; b.bA = undefined; b.beamE = null;
    p.y = b.floorY - p.h; p.onGround = true;
    w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 700) { b.hp = b.stats.maxHp * 0.61; b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { stats: p.stats }, w, {}); }
  if (i === 1100) { b.hp = b.stats.maxHp * 0.31; b.takeHit(Math.ceil(b.stats.maxHp * 0.02), { stats: p.stats }, w, {}); }
}`;
