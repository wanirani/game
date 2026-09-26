// 태엽 거신 포즈 스크립트 (tools/painted/poses.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
export const STAGE = 's09';
export const POSES = [
  'intro', 'idle', 'walk', 'punch_w', 'punch_fly', 'punch_wall', 'punch_back',
  'slam_w', 'slam_hit', 'slam_planted', 'steam', 'saws', 'pend_w', 'pend_swing',
  'core_kneel', 'core_open', 'toll',
  'hit', 'dmg1', 'dmg2',
  'death_05', 'death_12', 'death_20', 'death_27', 'death_33',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; } };
  let PX = 0.28;
  const px = () => { p.x = A.x0 + A.w * PX; p.vx = 0; };
  const clear = () => { for (const e of w.entities) if (e !== b && e.owner === b && !e.dead && e.kind !== 'painted') e.dead = true; b.clearJobs?.(); };
  const act = (st, t, ph = 0, hp = null, pxr = 0.28) => {
    if (b.dying > 0) return;
    PX = pxr; clear();
    if (b.phase !== ph) { b.hp = b.stats.maxHp; b.phase = 0; if (ph) b.debugPhase(ph); b.coreQueued = false; }
    if (hp != null) b.hp = b.stats.maxHp * hp;
    b.bx = Math.min(Math.max(A.cx + 60, b.bxMin), b.bxMax);
    b.crouchT = 0; b.crouch = 0; b.doorT = 0; b.door = 0; b.heat = 0; b.sinceCore = 0;
    b.rest = 99; b.debugAct(st);
    for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); if (b.state === 'idle') { b.rest = 99; b.sinceCore = 0; } }
  };
  const D0 = { v: 0 };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && D0.v - b.dying < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': act('intro', 0.7); break;
      case 'idle': act('idle', 1.2); break;
      case 'walk': act('walk', 0.3, 0, null, 0.08); break;
      case 'punch_w': act('punch', 0.5); break;
      case 'punch_fly': act('punch', 0.8); break;
      case 'punch_wall': act('punch', 1.1); break;
      case 'punch_back': act('punch', 1.5); break;
      case 'slam_w': act('slam', 0.6); break;
      case 'slam_hit': act('slam', 0.93); break;
      case 'slam_planted': act('slam', 1.4); break;
      case 'steam': act('steam', 1.3); break;
      case 'saws': act('saws', 0.9); break;
      case 'pend_w': act('pendulum', 0.55); break;
      case 'pend_swing': act('pendulum', 1.5); break;
      case 'core_kneel': act('core', 0.8); break;
      case 'core_open': act('core', 2.4); break;
      case 'toll': act('toll', 0.7, 2); break;
      case 'hit': act('idle', 0.5, 0, 0.9); b.hurtbox(); b.takeHit(1, {}, w, {}); step(1); break;
      case 'dmg1': act('idle', 1.0, 1, 0.5); break;
      case 'dmg2': act('idle', 1.0, 2, 0.22); break;
      case 'death_05': act('idle', 0.6, 2, 0.2); b.invuln = false; b.takeHit(1e9, {}, w, {}); D0.v = b.dying; untilDeath(0.5); break;
      case 'death_12': untilDeath(1.2); break;
      case 'death_20': untilDeath(2.0); break;
      case 'death_27': untilDeath(2.7); break;
      case 'death_33': untilDeath(3.3); break;
    }
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, bx: Math.round(b.bx), door: +b.door.toFixed(2), crouch: +b.crouch.toFixed(2), dying: +(b.dying ?? 0).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본 (i = 프레임 번호) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 420;
  if (k === 0) { b.hp = b.stats.maxHp; b.rest = 99; b.debugAct('idle'); }
  if (k === 60) b.debugAct('punch');
  if (k === 180) { b.hp = b.stats.maxHp * 0.5; b.debugAct('pendulum'); }
  if (k === 300) b.debugAct('core');
  if (b.state === 'idle') { b.rest = 99; b.sinceCore = 0; }
  p.x = A.x0 + A.w * 0.28; p.iframes = 1e9;
}`;
