// v2 play — 적 종류표(KINDS)와 행동(AI). GDD §9.2 의 여섯 종 + 보스 자리. docs/v2/PLAY_API.md §3 · §6
// 종류 한 줄 = 자료(모델 · 무기 · 키 · 재질 · 숫자 · 공격 목록 · 클립 이름) + 행동 함수 이름(ai).
// 공격 한 줄: { id, clip, range(이 거리 안에서 시작; [가까이, 멀리] 도 됨), windup(예고) · strike(판정) · recover(틈), dmg,
//   box{f0,f1,side,y0,y1} | radius{r,fwd,y0,y1} | shot{…}, lunge(판정 동안 앞으로 가는 거리), track(예고 동안 영웅을 따라 도는 빠르기 rad/초),
//   guard: 'block'(막힌다) | 'chip'(막아도 조금 닳는다) | 'break'(막을 수 없다 — 구른다), parry(튕겨낼 수 있나), staggerT(튕겨진 뒤 비틀거리는 초),
//   cut [클립 초, 클립 초] 무기가 몸 앞을 지나는 클립 구간 — 판정 구간(strike 초 동안)에 겹쳐 튼다 (없으면 클립 자료의 strike; 재는 법: node tools/v2/play_cliptrace.mjs <clip>),
//   cd[최소,최대] 다음 공격까지, weapon · str (소리 · 타격감 표의 무기와 세기), sound (예고가 시작될 때 hooks.sound 로 낼 사건 이름 — SOUND_FEEL §6) }
import { UNIT, TUNE } from './tune.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const hyp = (x, z) => Math.sqrt(x * x + z * z);
const A = (o) => Object.freeze({ guard: 'block', parry: true, staggerT: 1.25, track: 6, cd: [0.8, 1.4], weapon: 'sword', str: 'M', knock: 240, ...o });

const SLASH = A({ id: 'slash', clip: 'atk2_fore', cut: [0.28, 0.46], range: 86, windup: 0.46, strike: 0.14, recover: 0.42, dmg: 10, lunge: 22, box: { f0: -6, f1: 100, side: 38, y0: 0, y1: 112 } });
const STAB = A({ id: 'stab', clip: 'stab', range: [92, 156], chance: 0.5, windup: 0.52, strike: 0.16, recover: 0.5, dmg: 11, lunge: 74, box: { f0: 0, f1: 112, side: 26, y0: 10, y1: 100 } });
const BOLT = A({ id: 'bolt', kind: 'cast', clip: 'cast_raise', range: 600, windup: 0.8, strike: 0.1, recover: 0.45, dmg: 9, track: 9, cd: [2.2, 3.2], weapon: 'arrow',
  shot: { kind: 'bolt', element: 'blood', speed: 250, r: 13, life: 3.6, y: 0.66 } });
const GRAB = A({ id: 'grab', clip: 'heavy', range: 150, windup: 0.8, strike: 0.3, recover: 0.95, dmg: 16, lunge: 128, track: 2.6, guard: 'break', parry: false, cd: [1.2, 2], weapon: 'blunt', str: 'H', knock: 300,
  box: { f0: -4, f1: 74, side: 40, y0: 0, y1: 112 } });
const SWOOP = A({ id: 'swoop', clip: 'cast_channel', range: 176, windup: 0.62, strike: 0.3, recover: 1.0, dmg: 10, lunge: 126, track: 5, staggerT: 1.5, cd: [1.6, 2.6], weapon: 'dagger',
  box: { f0: -4, f1: 84, side: 40, y0: 0, y1: 130 } });
const SLAM = A({ id: 'slam', clip: 'ground_slam', range: 132, windup: 1.0, strike: 0.16, recover: 1.05, dmg: 24, track: 1.1, guard: 'chip', chip: 0.35, staggerT: 1.9, cd: [1.1, 1.8], weapon: 'blunt', str: 'F', knock: 380, shake: 10,
  radius: { r: 118, fwd: 74, y0: -10, y1: 90 } });
const THRUST = A({ id: 'thrust', clip: 'thrust', range: [136, 226], chance: 0.6, windup: 0.72, strike: 0.18, recover: 0.75, dmg: 16, lunge: 62, track: 1.6, staggerT: 1.7, cd: [1.0, 1.6], weapon: 'great', str: 'H', knock: 320,
  box: { f0: 10, f1: 196, side: 28, y0: 10, y1: 120 } });
const DIVE = A({ id: 'dive', clip: 'fly', range: 250, windup: 0.36, strike: 0.5, recover: 0.3, dmg: 5, lunge: 215, track: 12, staggerT: 1.0, cd: [2.0, 3.6], weapon: 'dagger', str: 'L', knock: 150,
  radius: { r: 24, fwd: 0, y0: -30, y1: 60 }, sound: 'enemy.bat.screech' });

// ── 밴시 여왕 (GDD §4 ① · §9.1 104–114분) — 공격마다 예고(windup, 바닥 · 공중 표시) → 판정(strike) → 틈(recover). docs/v2/PLAY_API.md §7 ──
//   mark = 예고 표시 모양(장면이 그린다): 판정 모양(box｜arc｜radius)이 있으면 그것, 탄 · 노래처럼 판정 모양이 없는 것은 mark 로 따로 준다. air: true = 공중에 뜨는 고리(비명 · 노래)
const Q_WAIL = A({ id: 'wail', label: '울음 탄', kind: 'cast', clip: 'cast_channel', cut: [0.14, 0.34], range: 620, windup: 0.75, strike: 0.12, recover: 0.7, dmg: 10, track: 5, cd: [1.1, 1.7], weapon: 'arrow',
  shot: { kind: 'wail', element: 'ice', speed: 235, r: 14, life: 3.2, y: 0.6, fan: 3, spread: 20 }, mark: { box: { f0: 30, f1: 775, side: 16 }, fan: 3, spread: 20 } });   // f1 = 22 + speed × life: the lane is as long as the shot flies
const Q_SWEEP = A({ id: 'sweep', label: '울음 물결', clip: 'cast_sweep', cut: [1.05, 1.32], range: 205, windup: 0.9, strike: 0.2, recover: 0.95, dmg: 16, track: 2.4, staggerT: 1, cd: [0.9, 1.5], weapon: 'great', str: 'H', knock: 300, fx: 'holy.wave',
  arc: { r: 205, deg: 210, y0: -10, y1: 150 } });
const Q_SCREAM = A({ id: 'scream', label: '비명', clip: 'scream', cut: [0.75, 1.15], range: 240, windup: 1.15, strike: 0.25, recover: 1.25, dmg: 14, track: 0, guard: 'break', parry: false, cd: [1.4, 2.2], weapon: 'blunt', str: 'F', knock: 360, shake: 12, stunHero: 0.8, fx: 'ice.nova', air: true, bell: true,
  radius: { r: 235, fwd: 0, y0: -30, y1: 220 } });
const Q_SUMMON = A({ id: 'summon', label: '유령 부르기', kind: 'cast', clip: 'cast_big', cut: [1.62, 1.95], range: 9999, windup: 1.3, strike: 0.12, recover: 0.8, dmg: 0, track: 0, cd: [1.5, 2.2], summon: { kind: 'grave_ghost', n: 2, r: 150 }, mark: { radius: { r: 46, fwd: 0 }, ring: 150 } });
const Q_SONG = A({ id: 'song', label: '배웅가', kind: 'cast', clip: 'cast_channel', cut: [0.17, 1.0], range: 9999, windup: 1.0, strike: 4.0, recover: 1.1, dmg: 5, track: 0, guard: 'break', parry: false, cd: [2.2, 3], weapon: 'blunt', str: 'L', knock: 60, air: true, bell: true,
  pulse: { every: 0.7, r: 330, reso: 0.2 }, mark: { radius: { r: 330, fwd: 0 } } });

// stride = 걷기 클립 한 주기에 나아가는 거리(px). 디딘 발이 가장 덜 미끄러지는 값을 뼈대에서 재서 넣었다 (병사 11 % · 술사 31 % · 주검 52 % · 갑주 32 % — 주검의 어기적 걸음은 본래 발을 끄는 동작이다)
const K = (o) => {
  const k = { weapon: null, r: 15, hp: 30, speed: 90, turn: 8, sight: 300, sightArc: 105, senseNear: 150, weight: 0, stun: 0.3, dieT: 1.3, standoff: 62, attacks: [], lib: true, ...o };
  k.hpx = Math.round(k.height * UNIT * 0.94);   // 맞는 상자 높이 (px)
  k.speed0 = k.speed; k.speed = Math.round(k.speed * (TUNE.enemyPace ?? 1));   // 걷기 · 다가오기 빠르기 × TUNE.enemyPace (표의 숫자는 예전 그대로 speed0 에 남긴다; 걸음 클립은 stride 로 거리에 맞춰 돈다)
  return k;
};

/** 적 · 보스 종류표. model = assets/v2/char3d/<model>.glb, weapon = 손에 붙일 소품 모델 id */
export const KINDS = {
  skeleton_soldier: K({ name: '해골 병사', model: 'skeleton_soldier', weapon: 'w_rusty_sword', height: 1.75, material: 'bone', ai: 'melee',
    hp: 34, speed: 104, stride: 78, attacks: [SLASH, STAB], wakeSound: 'enemy.skel.rattle',
    clips: { idle: 'idle_combat', walk: 'walk', hurt: 'hit_light', stagger: 'stagger', death: 'death_back' } }),
  skeleton_mage: K({ name: '해골 술사', model: 'skeleton_mage', weapon: 'w_crystal_staff', grip: { pos: [0, 7, 3], rotX: 100, rotY: 0, rotZ: 0 }, height: 1.85, material: 'bone', ai: 'ranged',
    hp: 26, speed: 78, stride: 86, sight: 400, near: 190, far: 350, attacks: [BOLT], wakeSound: 'enemy.skel.rattle',
    clips: { idle: 'idle', walk: 'walk', hurt: 'hit_light', stagger: 'stagger', death: 'death_back' } }),
  plague_corpse: K({ name: '역병 주검', model: 'plague_corpse', height: 1.76, material: 'flesh', ai: 'melee',
    hp: 82, speed: 46, stride: 40, turn: 3.2, weight: 0.5, stun: 0.14, poise: true, standoff: 96, attacks: [GRAB], dieT: 1.7,
    clips: { idle: 'idle', walk: 'shamble', hurt: 'hit_heavy', stagger: 'stagger', death: 'death_front' } }),
  grave_ghost: K({ name: '무덤 유령', model: 'grave_ghost', height: 1.95, material: 'ghost', ai: 'ghost',
    hp: 30, speed: 80, turn: 6, floats: true, hover: 14, fade: 0.3, solidAfter: 0.9, standoff: 130, attacks: [SWOOP], dieT: 0.8,
    clips: { idle: 'float_idle', walk: 'float_idle', hurt: 'hit_light', stagger: 'stun', death: 'hit_heavy' } }),
  gravekeeper_armor: K({ name: '무덤지기 갑주', model: 'gravekeeper_armor', weapon: 'w_grave_spade', grip: { pos: [0, 9, 4], rotX: -80, rotY: 0, rotZ: 0 }, height: 2.35, material: 'armor', ai: 'melee', elite: true,
    hp: 170, r: 24, speed: 58, stride: 86, turn: 2.4, weight: 0.85, stun: 0.12, poise: true, standoff: 92, armorFront: { arc: 80, k: 0.15 }, attacks: [SLAM, THRUST], dieT: 2.0, steps: true,
    clips: { idle: 'idle_combat', walk: 'brute_walk', hurt: 'block_hit', stagger: 'stagger', death: 'knockdown' } }),
  bat: K({ name: '박쥐', model: 'bat', height: 0.45, material: 'flesh', ai: 'bat', lib: false,
    hp: 8, r: 11, speed: 200, turn: 14, fly: true, hover: 96, pitch: 50, orbit: [130, 190], attacks: [DIVE], dieT: 0.7, sight: 360, sightArc: 180,
    clips: { idle: 'fly', walk: 'fly', hurt: 'fly', stagger: 'fly', death: 'fly' } }),
  // 보스: 밴시 여왕. 1막(체력 절반까지) 울음 탄 · 울음 물결 · 비명 → 절반에서 그 밤으로 달아난다(bossFlee — 장면이 쫓아 건넌 뒤 sim.bossReturn) → 2막 + 유령 부르기 · 배웅가.
  // 비틀거림 눈금(poise)이 차면 2.6초 비틀거린다(그동안 1.3배). 체력이 kneelAt 에 닿으면 무릎 꿇고 조종(길게 친 종)을 기다린다 — 베어서는 끝나지 않는다. docs/v2/PLAY_API.md §7
  banshee_queen: K({ name: '밴시 여왕', model: 'banshee_queen', height: 2.7, material: 'cloth', ai: 'boss', boss: true, element: 'ice',
    hp: 900, r: 30, speed: 70, turn: 3.4, floats: true, hover: 23, weight: 1, stun: 0, poise: true, sight: 520, sightArc: 180, dieT: 2.4,
    attacks: [Q_WAIL, Q_SWEEP, Q_SCREAM, Q_SUMMON, Q_SONG], keepNear: 150, keepFar: 196,
    poiseMax: 100, poiseHit: 0.45, poiseParry: 40, poiseCall: 40, poiseBell: 12, staggerT: 2.6, phaseAt: 0.5, fleeAuto: 4, kneelAt: 0.04, kneelWait: 12, kneelHeal: 0.15, ghostMax: 2,
    onBell: (sim, e) => sim.bossBell(e), onCall: (sim, e) => { sim.addPoise(e, e.def.poiseCall); },
    clips: { idle: 'float_idle', walk: 'float_idle', hurt: 'hit_light', stagger: 'stun', kneel: 'stun', death: 'stun' } }),
};
const ALIAS = { melee: 'skeleton_soldier', soldier: 'skeleton_soldier', skeleton: 'skeleton_soldier', ranged: 'skeleton_mage', mage: 'skeleton_mage', corpse: 'plague_corpse', ghoul: 'plague_corpse',
  ghost: 'grave_ghost', armor: 'gravekeeper_armor', armour: 'gravekeeper_armor', boss: 'banshee_queen' };
// 스테이지가 쓰는 옛 이름도 표에서 바로 찾을 수 있게 같은 줄을 가리킨다 (KINDS.melee.model …)
for (const k in ALIAS) KINDS[k] = KINDS[ALIAS[k]];
// 옛 장면 코드용: TUNE[kind] = { windup, reachZ } — 바닥 예고 표시가 이 값을 읽는다. 새 코드는 e.atk(box｜radius) · e.tele 를 읽는다 (PLAY_API §3)
for (const k in KINDS) { const a0 = KINDS[k].attacks[0]; if (a0 && !a0.shot && !KINDS[k].fly) TUNE[k] = { windup: a0.windup, reachZ: a0.box ? a0.box.side : a0.radius ? a0.radius.r * 0.5 : 40 }; }
/** 종류 이름(다른 이름 포함) → 종류 한 줄. 모르는 이름은 해골 병사 */
export function kindOf(kind) { return KINDS[kind] ?? KINDS.skeleton_soldier; }
/** 다른 이름을 푼 바른 이름 */
export function kindId(kind) { return ALIAS[kind] ?? (KINDS[kind] ? kind : 'skeleton_soldier'); }

const inRange = (a, d) => (Array.isArray(a.range) ? d >= a.range[0] && d <= a.range[1] : d <= a.range);
function pickAttack(sim, e, D, dist) {
  for (const a of D.attacks) if (inRange(a, dist) && (a.chance == null || Math.random() < a.chance)) return a;
  return null;
}

/**
 * 행동 함수: (sim, e, dt, D) — 깨어 있고, 맞아서 밀리는 중이 아니고, 영웅이 살아 있을 때 프레임마다 불린다.
 * 공격 중(e.state === 'attack')의 진행은 sim.runAttack 이 맡는다. 여기서는 "언제 무엇을 시작하고 그 사이에 어떻게 움직이나"만 정한다.
 */
export const AI = {
  /** 다가가서 친다 (해골 병사 · 역병 주검 · 갑주). 깊이를 맞추지 않고 어느 방향에서든 영웅을 보고 친다 */
  melee(sim, e, dt, D) {
    const h = sim.hero, dx = h.x - e.x, dz = h.z - e.z, dist = hyp(dx, dz) || 1;
    if (e.state === 'attack') return sim.runAttack(e, dt);
    sim.faceHero(e, dt);
    const aligned = (dx * e.dirX + dz * e.dirZ) / dist > 0.7;
    if (e.cd <= 0 && aligned && Math.abs(h.y - e.y) < 70 && sim.mayAttack(e)) { const a = pickAttack(sim, e, D, dist); if (a) return sim.startAttack(e, a); }
    // 차례를 기다리는 동안(방금 쳤거나, 다른 둘이 치는 중)은 한 발 물러서 둘러싼다 — 여럿이 한 점에 뭉쳐 서지 않게
    const wait = !D.poise && (e.cd > 0.45 || !sim.mayAttack(e)), st = D.standoff + (wait ? D.ring ?? 52 : 0);
    if (dist > st + 8) { sim.steerHero(e, 1, 0, 1, dt, false); sim.setAnim(e, 'walk', dt); }
    else if (dist < st - 26) { sim.steerHero(e, -1, 0, 0.6, dt, true); sim.setAnim(e, 'walk', dt); }
    else if (wait) { sim.steerHero(e, 0, e.side, 0.38, dt, true); sim.setAnim(e, 'walk', dt); }   // 기다리는 동안 옆으로 돈다
    else sim.setAnim(e, 'idle', dt);
  },
  /** 거리를 두고 쏜다 (해골 술사) */
  ranged(sim, e, dt, D) {
    const h = sim.hero, dx = h.x - e.x, dz = h.z - e.z, dist = hyp(dx, dz) || 1;
    if (e.state === 'attack') return sim.runAttack(e, dt);
    sim.faceHero(e, dt);
    const close = dist < D.near * 0.6;   // 코앞에서는 쏘지 않고 먼저 물러선다 (1초 넘게 쫓기면 그냥 쏜다)
    e.fleeT = close ? (e.fleeT ?? 0) + dt : 0;
    if (e.cd <= 0 && dist < 600 && (!close || e.fleeT > 1)) { e.fleeT = 0; return sim.startAttack(e, D.attacks[0]); }
    if (dist < D.near) { if (close) sim.steerHero(e, -1, 0, 1.5, dt, true); else sim.steerHero(e, -1, 0, 1.1, dt, true); sim.setAnim(e, 'walk', dt); }
    else if (dist > D.far) { sim.steerHero(e, 1, 0, 1, dt, false); sim.setAnim(e, 'walk', dt); }
    else sim.setAnim(e, 'idle', dt);
  },
  /** 흐린 채 맴돌다가 또렷해지며 덮친다. 덮친 뒤 잠깐만 맞는다 (무덤 유령) */
  ghost(sim, e, dt, D) {
    const h = sim.hero, dx = h.x - e.x, dz = h.z - e.z, dist = hyp(dx, dz) || 1;
    if (e.state === 'attack') {
      const a = e.atk; if (e.stateT > a.windup * 0.45) e.solidT = Math.max(e.solidT, D.solidAfter);
      return sim.runAttack(e, dt);
    }
    sim.faceHero(e, dt);
    if (e.cd <= 0 && dist < D.attacks[0].range && e.solidT <= 0 && sim.mayAttack(e)) return sim.startAttack(e, D.attacks[0]);
    const st = D.standoff;
    if (dist > st + 30) sim.steerHero(e, 1, 0, 1, dt, false);
    else if (dist < st - 30 || e.solidT > 0) sim.steerHero(e, -1, 0, 0.7, dt, true);
    else sim.steerHero(e, 0, e.side, 0.6, dt, true);
    sim.setAnim(e, 'walk', dt);
  },
  /** 영웅 둘레를 맴돌다 한 마리씩 내리꽂는다 (박쥐) */
  bat(sim, e, dt, D) {
    const h = sim.hero, dx = h.x - e.x, dz = h.z - e.z, dist = hyp(dx, dz) || 1;
    if (e.state === 'attack') {
      const a = e.atk, u = (e.stateT - a.windup) / a.strike;
      e.hover = e.stateT < a.windup ? D.hover + 18 * (e.stateT / a.windup) : u < 1 ? D.hover + 18 - (D.hover - 30) * Math.sin(Math.PI * Math.min(1, u)) : D.hover;
      return sim.runAttack(e, dt);
    }
    e.hover = D.hover + 9 * Math.sin(e.t * 3.1 + e.id * 1.7);
    e.orb += e.orbW * dt;
    const tx = h.x + Math.cos(e.orb) * e.orbR - e.x, tz = h.z + Math.sin(e.orb) * e.orbR * 0.8 - e.z, td = hyp(tx, tz) || 1;
    sim.steer(e, tx / td, tz / td, Math.min(D.speed, td * 4), dt, true);
    sim.turnTo(e, td > 20 ? tx : dx, td > 20 ? tz : dz, D.turn, dt);
    if (e.cd <= 0 && dist < D.attacks[0].range && sim.mayAttack(e, 1)) return sim.startAttack(e, D.attacks[0]);
    sim.setAnim(e, 'walk', dt);
  },
  /** 밴시 여왕: 거리를 두고 떠다니며 고른다 — 가까우면 울음 물결 / 비명, 멀면 울음 탄, 2막에는 유령 부르기 · 배웅가. 무릎 꿇음 · 달아남도 여기서 */
  boss(sim, e, dt, D) {
    const h = sim.hero, dx = h.x - e.x, dz = h.z - e.z, dist = Math.sqrt(dx * dx + dz * dz) || 1;
    if (e.kneel > 0) {   // 무릎 꿇고 조종을 기다린다. 오래 두면 조금 회복해 다시 일어난다 (막히지 않게)
      e.kneelT += dt; e.hover = Math.max(4, e.hover - 60 * dt); sim.setAnim(e, 'kneel', dt);
      if (e.kneelT > D.kneelWait) { e.kneel = 0; e.hp = Math.round(D.hp * D.kneelHeal); e.cd = 1; e.state = 'chase'; sim.emit('kneel', e, 'rise'); }
      return;
    }
    e.hover += (D.hover - e.hover) * Math.min(1, 4 * dt);
    if (e.hp <= D.kneelAt * D.hp + 0.5) { if (e.state === 'attack') sim._cancelAttack(e, 1); e.kneel = 1; e.kneelT = 0; e.poiseHp = 0; e.staggerK = 0; e.solid = true; e.state = 'kneel'; sim.emit('kneel', e, 'down'); sim.setAnim(e, 'kneel', dt); return; }
    if (e.bphase === 1 && e.hp <= D.hp * D.phaseAt && e.state !== 'attack') { e.bphase = 2; e.fled = true; e.fleeT = 0; e.solid = false; e.poiseHp = 0; e.staggerK = 0; e.cd = 1.2; e.sumCd = 0.5; e.songCd = 5; sim.emit('bossFlee', e); }
    if (e.fled) {   // 그 밤으로 달아났다: 장면이 쫓아 건넌 뒤 sim.bossReturn(e) 를 부른다 (e.fleeHold 를 켜 두지 않으면 fleeAuto 초 뒤 스스로 돌아온다)
      e.fleeT += dt; e.alpha = Math.max(0.12, e.alpha - 2.5 * dt); sim.setAnim(e, 'idle', dt);
      if (!e.fleeHold && D.fleeAuto != null && e.fleeT > D.fleeAuto) sim.bossReturn(e);
      return;
    }
    if (e.alpha < 1) e.alpha = Math.min(1, e.alpha + 2.5 * dt);
    if (e.state === 'attack') return sim.runAttack(e, dt);
    sim.faceHero(e, dt);
    e.sumCd -= dt; e.songCd -= dt;
    if (dist > D.keepFar) { sim.steerHero(e, 1, 0, 1, dt, true); sim.setAnim(e, 'walk', dt); }
    else if (dist < D.keepNear - 40) { sim.steerHero(e, -1, 0, 0.7, dt, true); sim.setAnim(e, 'walk', dt); }
    else { sim.steerHero(e, 0, e.side, 0.35, dt, true); sim.setAnim(e, 'idle', dt); }
    if (e.cd > 0) return;
    const two = e.bphase >= 2; let a = null;
    if (two && e.sumCd <= 0 && sim.countKind('grave_ghost') < D.ghostMax) { a = Q_SUMMON; e.sumCd = 11; }
    else if (two && e.songCd <= 0) { a = Q_SONG; e.songCd = 13; }
    else if (dist < Q_SWEEP.range && (e.lastAtk === 'wail' || Math.random() < 0.75)) a = (e.lastAtk === 'sweep' || Math.random() < 0.38) && e.lastAtk !== 'scream' ? Q_SCREAM : Q_SWEEP;
    else if (dist < Q_WAIL.range) a = Q_WAIL;
    if (a) { e.lastAtk = a.id; sim.startAttack(e, a); if (two) e.cd -= 0.25; }
  },
};

/** 새 종류를 더한다: registerKind('wolfman', { model, height, material, ai: 'melee', attacks: [...], clips: {...} }, 행동 함수(없으면 ai 이름의 것)) */
export function registerKind(id, def, ai) {
  KINDS[id] = K(def);
  if (ai) { AI[id] = ai; KINDS[id].ai = id; }
  return KINDS[id];
}
export const ATTACKS = Object.freeze({ SLASH, STAB, BOLT, GRAB, SWOOP, SLAM, THRUST, DIVE, Q_WAIL, Q_SWEEP, Q_SCREAM, Q_SUMMON, Q_SONG });
export { A as attackDef, rnd };
