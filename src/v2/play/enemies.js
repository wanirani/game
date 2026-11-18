// v2 play — 적 종류표(KINDS)와 행동(AI). GDD §9.2 의 여섯 종 + 보스 자리. docs/v2/PLAY_API.md §3 · §6
// 종류 한 줄 = 자료(모델 · 무기 · 키 · 재질 · 숫자 · 공격 목록 · 클립 이름) + 행동 함수 이름(ai).
// 공격 한 줄: { id, clip, range(이 거리 안에서 시작; [가까이, 멀리] 도 됨), windup(예고) · strike(판정) · recover(틈), dmg,
//   box{f0,f1,side,y0,y1} | radius{r,fwd,y0,y1} | shot{…}, lunge(판정 동안 앞으로 가는 거리), track(예고 동안 영웅을 따라 도는 빠르기 rad/초),
//   guard: 'block'(막힌다) | 'chip'(막아도 조금 닳는다) | 'break'(막을 수 없다 — 구른다), parry(튕겨낼 수 있나), staggerT(튕겨진 뒤 비틀거리는 초),
//   cut [클립 초, 클립 초] 무기가 몸 앞을 지나는 클립 구간 — 판정 구간(strike 초 동안)에 겹쳐 튼다 (없으면 클립 자료의 strike; 재는 법: node tools/v2/play_cliptrace.mjs <clip>),
//   cd[최소,최대] 다음 공격까지, weapon · str (소리 · 타격감 표의 무기와 세기), sound (예고가 시작될 때 hooks.sound 로 낼 사건 이름 — SOUND_FEEL §6) }
import { UNIT, TUNE } from './tune.js';

const rnd = (a, b) => a + Math.random() * (b - a);
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

// stride = 걷기 클립 한 주기에 나아가는 거리(px). 디딘 발이 가장 덜 미끄러지는 값을 뼈대에서 재서 넣었다 (병사 11 % · 술사 31 % · 주검 52 % · 갑주 32 % — 주검의 어기적 걸음은 본래 발을 끄는 동작이다)
const K = (o) => {
  const k = { weapon: null, r: 15, hp: 30, speed: 90, turn: 8, sight: 300, sightArc: 105, senseNear: 150, weight: 0, stun: 0.3, dieT: 1.3, standoff: 62, attacks: [], lib: true, ...o };
  k.hpx = Math.round(k.height * UNIT * 0.94);   // 맞는 상자 높이 (px)
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
  // 보스 자리: 모델과 숫자만 있다. 규칙(노래 · 유령 부르기 · 조종에 무릎 꿇기)은 AI.boss 를 채우면 된다 — docs/v2/PLAY_API.md §7
  banshee_queen: K({ name: '밴시 여왕', model: 'banshee_queen', height: 2.7, material: 'cloth', ai: 'boss', boss: true,
    hp: 600, r: 30, speed: 60, turn: 3, floats: true, hover: 23, weight: 1, stun: 0, poise: true, attacks: [], dieT: 2.4,
    clips: { idle: 'float_idle', walk: 'float_idle', hurt: 'hit_light', stagger: 'stun', death: 'stun' } }),
};
const ALIAS = { melee: 'skeleton_soldier', soldier: 'skeleton_soldier', skeleton: 'skeleton_soldier', ranged: 'skeleton_mage', mage: 'skeleton_mage', corpse: 'plague_corpse', ghoul: 'plague_corpse',
  ghost: 'grave_ghost', armor: 'gravekeeper_armor', armour: 'gravekeeper_armor', boss: 'banshee_queen' };
// 스테이지가 쓰는 옛 이름도 표에서 바로 찾을 수 있게 같은 줄을 가리킨다 (KINDS.melee.model …)
for (const k in ALIAS) KINDS[k] = KINDS[ALIAS[k]];
// 옛 장면 코드용: TUNE[kind] = { windup, reachZ } — 바닥 예고 표시가 이 값을 읽는다. 새 코드는 e.atk(box｜radius) · e.tele 를 읽는다 (PLAY_API §3)
for (const k in KINDS) { const a0 = KINDS[k].attacks[0]; if (a0 && !a0.shot && !KINDS[k].fly) TUNE[k] = { windup: a0.windup, reachZ: a0.box ? a0.box.side : a0.radius.r * 0.5 }; }
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
    const h = sim.hero, dx = h.x - e.x, dz = h.z - e.z, dist = Math.hypot(dx, dz) || 1;
    if (e.state === 'attack') return sim.runAttack(e, dt);
    sim.turnTo(e, dx, dz, D.turn, dt);
    const aligned = (dx * e.dirX + dz * e.dirZ) / dist > 0.7;
    if (e.cd <= 0 && aligned && Math.abs(h.y - e.y) < 70 && sim.mayAttack(e)) { const a = pickAttack(sim, e, D, dist); if (a) return sim.startAttack(e, a); }
    // 차례를 기다리는 동안(방금 쳤거나, 다른 둘이 치는 중)은 한 발 물러서 둘러싼다 — 여럿이 한 점에 뭉쳐 서지 않게
    const wait = !D.poise && (e.cd > 0.45 || !sim.mayAttack(e)), st = D.standoff + (wait ? D.ring ?? 52 : 0);
    if (dist > st + 8) { sim.steer(e, dx / dist, dz / dist, D.speed, dt); sim.setAnim(e, 'walk', dt); }
    else if (dist < st - 26) { sim.steer(e, -dx / dist, -dz / dist, D.speed * 0.6, dt, true); sim.setAnim(e, 'walk', dt); }
    else if (wait) { sim.steer(e, (-dz / dist) * e.side, (dx / dist) * e.side, D.speed * 0.38, dt, true); sim.setAnim(e, 'walk', dt); }   // 기다리는 동안 옆으로 돈다
    else sim.setAnim(e, 'idle', dt);
  },
  /** 거리를 두고 쏜다 (해골 술사) */
  ranged(sim, e, dt, D) {
    const h = sim.hero, dx = h.x - e.x, dz = h.z - e.z, dist = Math.hypot(dx, dz) || 1;
    if (e.state === 'attack') return sim.runAttack(e, dt);
    sim.turnTo(e, dx, dz, D.turn, dt);
    const close = dist < D.near * 0.6;   // 코앞에서는 쏘지 않고 먼저 물러선다 (1초 넘게 쫓기면 그냥 쏜다)
    e.fleeT = close ? (e.fleeT ?? 0) + dt : 0;
    if (e.cd <= 0 && dist < 600 && (!close || e.fleeT > 1)) { e.fleeT = 0; return sim.startAttack(e, D.attacks[0]); }
    if (dist < D.near) { sim.steer(e, -dx / dist, -dz / dist, D.speed * (close ? 1.5 : 1.1), dt, true); sim.setAnim(e, 'walk', dt); }
    else if (dist > D.far) { sim.steer(e, dx / dist, dz / dist, D.speed, dt); sim.setAnim(e, 'walk', dt); }
    else sim.setAnim(e, 'idle', dt);
  },
  /** 흐린 채 맴돌다가 또렷해지며 덮친다. 덮친 뒤 잠깐만 맞는다 (무덤 유령) */
  ghost(sim, e, dt, D) {
    const h = sim.hero, dx = h.x - e.x, dz = h.z - e.z, dist = Math.hypot(dx, dz) || 1;
    if (e.state === 'attack') {
      const a = e.atk; if (e.stateT > a.windup * 0.45) e.solidT = Math.max(e.solidT, D.solidAfter);
      return sim.runAttack(e, dt);
    }
    sim.turnTo(e, dx, dz, D.turn, dt);
    if (e.cd <= 0 && dist < D.attacks[0].range && e.solidT <= 0 && sim.mayAttack(e)) return sim.startAttack(e, D.attacks[0]);
    const st = D.standoff;
    if (dist > st + 30) sim.steer(e, dx / dist, dz / dist, D.speed, dt);
    else if (dist < st - 30 || e.solidT > 0) sim.steer(e, -dx / dist, -dz / dist, D.speed * 0.7, dt, true);
    else sim.steer(e, (-dz / dist) * e.side, (dx / dist) * e.side, D.speed * 0.6, dt, true);
    sim.setAnim(e, 'walk', dt);
  },
  /** 영웅 둘레를 맴돌다 한 마리씩 내리꽂는다 (박쥐) */
  bat(sim, e, dt, D) {
    const h = sim.hero, dx = h.x - e.x, dz = h.z - e.z, dist = Math.hypot(dx, dz) || 1;
    if (e.state === 'attack') {
      const a = e.atk, u = (e.stateT - a.windup) / a.strike;
      e.hover = e.stateT < a.windup ? D.hover + 18 * (e.stateT / a.windup) : u < 1 ? D.hover + 18 - (D.hover - 30) * Math.sin(Math.PI * Math.min(1, u)) : D.hover;
      return sim.runAttack(e, dt);
    }
    e.hover = D.hover + 9 * Math.sin(e.t * 3.1 + e.id * 1.7);
    e.orb += e.orbW * dt;
    const tx = h.x + Math.cos(e.orb) * e.orbR - e.x, tz = h.z + Math.sin(e.orb) * e.orbR * 0.8 - e.z, td = Math.hypot(tx, tz) || 1;
    sim.steer(e, tx / td, tz / td, Math.min(D.speed, td * 4), dt, true);
    sim.turnTo(e, td > 20 ? tx : dx, td > 20 ? tz : dz, D.turn, dt);
    if (e.cd <= 0 && dist < D.attacks[0].range && sim.mayAttack(e, 1)) return sim.startAttack(e, D.attacks[0]);
    sim.setAnim(e, 'walk', dt);
  },
  /** 보스 자리: 영웅을 보고 떠 있기만 한다. 밴시 여왕의 규칙은 여기에 쓴다 */
  boss(sim, e, dt, D) {
    const h = sim.hero;
    sim.turnTo(e, h.x - e.x, h.z - e.z, D.turn, dt);
    sim.setAnim(e, 'idle', dt);
  },
};

/** 새 종류를 더한다: registerKind('wolfman', { model, height, material, ai: 'melee', attacks: [...], clips: {...} }, 행동 함수(없으면 ai 이름의 것)) */
export function registerKind(id, def, ai) {
  KINDS[id] = K(def);
  if (ai) { AI[id] = ai; KINDS[id].ai = id; }
  return KINDS[id];
}
export const ATTACKS = Object.freeze({ SLASH, STAB, BOLT, GRAB, SWOOP, SLAM, THRUST, DIVE });
export { A as attackDef, rnd };
