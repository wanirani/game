// 드라큘라 백작 포즈 스크립트 (tools/painted/poses.mjs · bench.mjs · rng.mjs 가 사용). 페이지 안에서 실행되는 함수 문자열 + 포즈 목록.
// 각 포즈는 로직 상태기계(src/game/bosses/b_dracula.js)를 실제로 돌려 만든다 —
//   1형태(귀족: 망토 소용돌이 순간이동·헬파이어·업화 기둥·박쥐 돌진·피의 나선·권속 소환) · 변신(몸부림 → 폭발 → 마왕이 자라남 → 포효) ·
//   2형태(운석·피의 광선·발톱 연격·도약 내려찍기·지옥불 숨결·날갯짓 돌풍·헬파이어 노바) · 사망(3.6초).
export const STAGE = 's12';
export const POSES = [
  'intro', 'idle', 'tele_wrap', 'tele_bats', 'tele_appear', 'hellfire_w', 'hellfire_a', 'inferno',
  'batdash_w', 'batdash_swarm', 'batdash_reform', 'spiral', 'summon', 'hit', 'dmg1',
  'tf_writhe', 'tf_split', 'tf_burst', 'tf_grow', 'tf_roar',
  'idle2', 'meteor', 'beams_w', 'beams_a', 'claw_w', 'claw_a', 'quake_crouch', 'quake_air', 'quake_land',
  'breath', 'gust', 'nova', 'hit2', 'dmg2',
  'death_05', 'death_12', 'death_20', 'death_27', 'death_34',
];

/** 페이지에 window.__pose(name) 설치 */
export const INSTALL = `(() => {
  const g = window.__game, w = g.world, p = w.player;
  p.hp = 1e9; p.stats.maxHp = 1e9; p.iframes = 1e9;
  const b = w.boss, A = b.A;
  const X = Math.min(A.x1 - 260, A.x0 + Math.max(620, A.w * 0.62));
  const step = (n) => { for (let i = 0; i < n; i++) { g.__tick(1 / 60); g.__render(); p.iframes = 1e9; p.hurtT = 0; if (b.state === 'idle' || b.state === 'd_idle') b.rest = 99; } };
  const px = () => { p.x = X - 380; p.vx = 0; p.facing = 1; };
  const clear = () => { for (const e of w.entities) if (e !== b && e.kind !== 'painted' && (e.kind === 'hazard' || e.kind === 'projectile' || e.owner === b)) e.dead = true; b.clearJobs?.(); b.bats.length = 0; b.swarm = null; b.laneWarn = null; b.beam = null; b.leapWarn = null; b.clawWarn = null; };
  const form1 = (ph, hp) => { if (b.form === 2) b.onReset(w); b.phase = ph; b.hp = b.stats.maxHp * hp; };
  const form2 = (ph, hp) => { if (b.form !== 2) b.becomeDemon(true); b.phase = ph; b.hp = b.stats.maxHp * hp; };
  const settle = () => {
    if (b.dying > 0) return;
    clear(); w.cutscene = false; b.vanish = 0; b.invuln = false; b.harmless = false; b.flashT = 0; b.tfStarted = false; b.redSky = b.phase >= 3 ? b.redSky : 0;
    if (b.form === 2) { b.d2.scale = 1; b.d2.hover = b.d2.hoverT = 0; }
    b.place(X); b.setState(b.form === 2 ? 'd_idle' : 'idle'); b.rest = 99;
    if (b.form === 2) b.restHands(true);
    for (let i = 0; i < 40; i++) { px(); step(1); }
  };
  const hold = (st, t) => { b.setState(st); for (let i = 0; i < Math.round(t * 60); i++) { px(); step(1); } };
  const until = (t) => { for (let i = 0; i < 600 && b.state === 'transform' && b.st < t; i++) { px(); step(1); } };
  const untilDeath = (t) => { for (let i = 0; i < 600 && b.dying > 0 && 3.6 - b.dying < t; i++) step(1); };
  window.__pose = (name) => {
    switch (name) {
      case 'intro': form1(0, 1); settle(); hold('intro', 0.9); break;
      case 'idle': form1(0, 1); settle(); hold('idle', 1.2); break;
      case 'tele_wrap': settle(); hold('tele', 0.22); break;
      case 'tele_bats': settle(); hold('tele', 0.6); break;
      case 'tele_appear': settle(); hold('tele', 0.98); break;
      case 'hellfire_w': settle(); hold('hellfire', 0.3); break;
      case 'hellfire_a': settle(); hold('hellfire', 0.55); break;
      case 'inferno': settle(); hold('inferno', 1.05); break;
      case 'batdash_w': settle(); hold('batdash', 0.22); break;
      case 'batdash_swarm': settle(); hold('batdash', 1.05); break;
      case 'batdash_reform': settle(); hold('batdash', 1.72); break;
      case 'spiral': form1(1, 0.7); settle(); hold('spiral', 1.0); break;
      case 'summon': form1(1, 0.7); settle(); hold('summon', 0.55); break;
      case 'hit': form1(0, 0.9); settle(); hold('idle', 0.4); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(1); break;
      case 'dmg1': form1(1, 0.62); settle(); hold('idle', 1.0); break;
      case 'tf_writhe': form1(1, 0.505); settle(); b.hurtbox(); b.takeHit(Math.ceil(b.stats.maxHp * 0.01), { stats: p.stats }, w, {}); until(0.8); break;
      case 'tf_split': until(1.5); break;
      case 'tf_burst': until(1.72); break;
      case 'tf_grow': until(2.3); break;
      case 'tf_roar': until(3.0); break;
      case 'idle2': form2(2, 0.45); settle(); hold('d_idle', 1.2); break;
      case 'meteor': form2(2, 0.45); settle(); hold('meteor', 1.2); break;
      case 'beams_w': form2(2, 0.45); settle(); hold('beams', 0.4); break;
      case 'beams_a': form2(2, 0.45); settle(); hold('beams', 0.62); break;
      case 'claw_w': form2(2, 0.45); settle(); hold('claw', 0.38); break;
      case 'claw_a': form2(2, 0.45); settle(); hold('claw', 0.56); break;
      case 'quake_crouch': form2(2, 0.45); settle(); hold('quake', 0.3); break;
      case 'quake_air': form2(2, 0.45); settle(); hold('quake', 0.8); break;
      case 'quake_land': form2(2, 0.45); settle(); hold('quake', 1.3); break;
      case 'breath': form2(2, 0.45); settle(); hold('breath', 0.9); break;
      case 'gust': form2(2, 0.45); settle(); hold('gust', 1.0); break;
      case 'nova': form2(3, 0.2); settle(); hold('nova', 1.2); break;
      case 'hit2': form2(2, 0.4); settle(); hold('d_idle', 0.4); b.hurtbox(); b.takeHit(1, { stats: p.stats }, w, {}); step(1); break;
      case 'dmg2': form2(3, 0.15); settle(); hold('d_idle', 1.0); break;
      case 'death_05': form2(3, 0.1); settle(); b.hurtbox(); b.takeHit(1e9, { stats: p.stats }, w, {}); untilDeath(0.5); break;
      case 'death_12': untilDeath(1.2); break;
      case 'death_20': untilDeath(2.0); break;
      case 'death_27': untilDeath(2.7); break;
      case 'death_34': untilDeath(3.4); break;
    }
    p.iframes = 0; p.hurtT = 0;
    g.__render();
    p.iframes = 1e9;
    return { st: b.state, t: +(b.st ?? 0).toFixed(2), hp: +(b.hp / b.stats.maxHp).toFixed(2), ph: b.phase, form: b.form, S: +(b.d2.scale).toFixed(2), pos: [Math.round(b.cx), Math.round(b.bottom)], vanish: +b.vanish.toFixed(2), bats: b.bats.length, dying: +(b.dying).toFixed(2), painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  };
})()`;

/** 벤치마크 대본: 480 프레임 주기 (1형태 헬파이어·박쥐 → 2형태 광선·숨결) */
export const BENCH = `(i, b, p, A) => {
  const k = i % 480;
  const X = Math.min(A.x1 - 260, A.x0 + Math.max(620, A.w * 0.62));
  if (k === 0) { if (b.form === 2) b.onReset(b.world); b.hp = b.stats.maxHp; b.phase = 0; b.vanish = 0; b.place(X); b.setState('idle'); }
  if (k === 30) b.setState('hellfire');
  if (k === 130) b.setState('spiral');
  if (k === 240) { b.phase = 2; b.becomeDemon(true); b.hp = b.stats.maxHp * 0.45; b.place(X); b.setState('beams'); }
  if (k === 360) b.setState('breath');
  if (b.state === 'idle' || b.state === 'd_idle') b.rest = 99;
  p.x = X - 380; p.iframes = 1e9;
}`;

/** rng.mjs 대본: 0프레임에 굽기 대기 중 실제 루프가 남긴 것(등장 박쥐·탄·장판·입자)을 지워 채색/벡터 출발 상태를 같게 한 뒤,
 *  705·1095 프레임에 체력을 깎아 페이즈 1 → 2(변신) 를 넘긴다 (기본 대본과 같은 시점). */
export const RNG_SCRIPT = `(i, b, p, w) => {
  if (i === 0) {
    for (const e of w.entities) if (e !== b && e !== p && e.kind !== 'painted' && (e.kind === 'projectile' || e.kind === 'hazard' || e.owner === b || e.owner?.owner === b || e.summoner === b)) e.dead = true;
    if (w.fx?.list) w.fx.list.length = 0;
    b.clearJobs?.(); b.bats.length = 0; b.swarm = null; b.reform = false; b.vanish = 0; b.needTele = false; b.summoned = false; b.rest = undefined;
    b.laneWarn = null; b.beam = null; b.leapWarn = null; b.clawWarn = null; b.flashT = 0; b.invuln = false; b.harmless = false;
    w.cutscene = false; w.hitstop = 0; w.slowmo = 0;
  }
  if (i === 705) b.takeHit(b.stats.maxHp * 0.45, { stats: p.stats }, w, {});
  if (i === 1095) b.takeHit(b.stats.maxHp * 0.3, { stats: p.stats }, w, {});
}`;
