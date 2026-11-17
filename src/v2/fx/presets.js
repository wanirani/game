// v2 fx — 효과 모음 (한 번 부르면 되는 프리셋). docs/v2/FX.md §6
// 약속: (x,y,z) = 효과가 나는 자리 — 타격은 맞은 점, 이동·마법은 쏘는 쪽의 발밑. (dx,dz) = 공격·바라보는 방향(단위 벡터).
//       pow = 세기 배율(기본 1). (tx,ty,tz) = 표적의 발밑 (마법). 단위 = 논리 px (영웅 키 ≈ 100).
// 프리셋은 소리 사건(fx.sfx 이름)과 손맛(fx.feel 호출)을 스스로 낸다. fx.feelOn = false 면 손맛은 내지 않는다.
// 명세(E·RB)는 모듈을 읽을 때 한 번 만들고, 실행 중에는 숫자만 넘긴다 → 프레임당 할당 0.
import { E, RB, Q, MESH, MODE } from './engine.js';
import { SPR, DECAL } from './sprites.js';

const rnd = Math.random, PI = Math.PI;

// ───────────── 입자 명세 ─────────────
const S = {
  // 타격
  cutL: E({ sprite: SPR.STREAK, spread: 0, speed: 2, stretch: 2500, size: 14, grow: 1.25, life: 0.11, c0: [3, 3, 3, 1], c1: [1.2, 1.8, 3, 0], pri: 1, min: 1 }),   // 베인 선: 길이 = 두께 × 11 (늘이기로 만든다)
  cutH: E({ sprite: SPR.STREAK, spread: 0, speed: 2, stretch: 2700, size: 20, grow: 1.3, life: 0.14, c0: [3.4, 3.2, 3, 1], c1: [2.2, 1.2, 0.5, 0], pri: 1, min: 1 }),
  cutF: E({ sprite: SPR.STREAK, spread: 0, speed: 2, stretch: 2900, size: 27, grow: 1.3, life: 0.2, c0: [4, 3.8, 3.4, 1], c1: [3, 0.8, 0.3, 0], pri: 1, min: 1 }),
  flashL: E({ sprite: SPR.GLOW, size: 46, grow: 1.6, life: 0.08, c0: [1.5, 1.4, 1.3, 0.6], c1: [1.2, 0.8, 0.4, 0], pri: 1, min: 1 }),
  flashH: E({ sprite: SPR.GLOW, size: 66, grow: 1.6, life: 0.11, c0: [1.6, 1.4, 1.2, 0.7], c1: [1.6, 0.7, 0.25, 0], pri: 1, min: 1 }),
  flashF: E({ sprite: SPR.GLOW, size: 104, grow: 1.5, life: 0.16, c0: [1.7, 1.4, 1.1, 0.6], c1: [2, 0.5, 0.2, 0], pri: 1, min: 1 }),
  spark: E({ sprite: SPR.STREAK, stretch: 2.4, n: 9, spread: 0.7, speed: [260, 680], grav: 1100, drag: 1.4, life: [0.16, 0.36], size: [9, 15], grow: 0.5, c0: [3, 2.2, 1.1, 1], c1: [2, 0.5, 0.1, 0], cv: 0.3, floor: 2 }),
  star: E({ sprite: SPR.STAR, size: 72, grow: 1.5, life: 0.15, spin: [-3, 3], c0: [2.2, 2.2, 2.2, 0.9], c1: [1.8, 1.4, 0.7, 0], pri: 1, min: 1 }),
  starBig: E({ sprite: SPR.STAR, size: 124, grow: 1.5, life: 0.2, spin: [-2, 2], c0: [2.4, 2.3, 2, 0.9], c1: [2.4, 1.6, 0.5, 0], pri: 1, min: 1 }),
  chip: E({ sprite: SPR.SHARD, add: 0, n: 8, spread: 1.0, speed: [140, 400], vy: [140, 340], grav: 1500, drag: 0.4, life: [0.55, 0.95], size: [7, 13], spin: [-14, 14], c0: [0.6, 0.6, 0.66, 1], c1: [0.42, 0.42, 0.48, 1], cv: 0.3, floor: 2 }),
  puff: E({ sprite: SPR.DUST, add: 0, n: 4, shape: 2, rad: 6, speed: [40, 120], vy: [10, 55], drag: 3, life: [0.35, 0.6], size: [28, 46], grow: 2, c0: [0.62, 0.6, 0.67, 0.4], c1: [0.5, 0.5, 0.57, 0], fadeIn: 0.1 }),
  pierce: E({ sprite: SPR.STREAK, stretch: 7, spread: 0, speed: 1200, drag: 7, life: 0.15, size: 28, c0: [3, 3, 3, 1], c1: [1.2, 2, 3, 0], pri: 1, min: 1 }),
  pierceSpark: E({ sprite: SPR.STREAK, stretch: 3, n: 7, spread: 0.22, speed: [400, 900], drag: 3, life: [0.12, 0.26], size: [8, 13], grow: 0.5, c0: [2.6, 2.8, 3, 1], c1: [0.8, 1.4, 2.6, 0] }),
  gold: E({ sprite: SPR.STREAK, stretch: 2.6, n: 16, shape: 1, speed: [300, 760], grav: 800, drag: 1.6, life: [0.2, 0.45], size: [10, 16], grow: 0.5, c0: [3.4, 2.6, 0.9, 1], c1: [2.4, 0.9, 0.1, 0], floor: 2 }),
  guard: E({ sprite: SPR.STREAK, stretch: 2.6, n: 12, spread: 1.15, speed: [380, 860], grav: 500, drag: 2.2, life: [0.14, 0.32], size: [9, 15], grow: 0.5, c0: [2, 3, 3.6, 1], c1: [0.3, 1, 2.6, 0], floor: 2 }),
  blood: E({ sprite: SPR.DROP, stretch: 1.4, add: 0, n: 6, spread: 0.55, speed: [180, 420], vy: [40, 160], grav: 1300, drag: 0.6, life: [0.4, 0.7], size: [8, 14], c0: [0.8, 0.05, 0.1, 1], c1: [0.4, 0, 0.04, 0.8], floor: 1 }),
  // 이동
  dashDust: E({ sprite: SPR.DUST, add: 0, n: 6, spread: 0.55, speed: [60, 170], vy: [10, 60], drag: 3.5, life: [0.3, 0.5], size: [30, 46], grow: 1.9, c0: [0.66, 0.64, 0.72, 0.38], c1: [0.5, 0.5, 0.58, 0], fadeIn: 0.1 }),
  speedLine: E({ sprite: SPR.STREAK, stretch: 5, n: 6, spread: 0.1, speed: [520, 860], drag: 5, life: [0.14, 0.24], size: [8, 12], c0: [1.4, 1.9, 2.6, 0.75], c1: [0.5, 0.9, 1.8, 0], jit: 30 }),
  landDust: E({ sprite: SPR.DUST, add: 0, n: 10, shape: 2, rad: 14, speed: [90, 210], vy: [15, 60], drag: 4, life: [0.35, 0.62], size: [32, 52], grow: 2.1, c0: [0.66, 0.64, 0.71, 0.42], c1: [0.5, 0.5, 0.57, 0], fadeIn: 0.08 }),
  pebble: E({ sprite: SPR.SHARD, add: 0, n: 4, shape: 2, rad: 10, speed: [60, 170], vy: [150, 280], grav: 1400, life: [0.4, 0.62], size: [4, 7], spin: [-12, 12], c0: [0.52, 0.52, 0.58, 1], c1: [0.4, 0.4, 0.45, 1], floor: 2 }),
  stepDust: E({ sprite: SPR.DUST, add: 0, n: 3, shape: 2, rad: 4, speed: [20, 55], vy: [10, 34], drag: 3, life: [0.28, 0.45], size: [18, 28], grow: 1.9, c0: [0.7, 0.68, 0.75, 0.5], c1: [0.5, 0.5, 0.57, 0], fadeIn: 0.15, min: 1 }),
  jumpPuff: E({ sprite: SPR.DUST, add: 0, n: 6, shape: 2, rad: 8, speed: [50, 130], vy: [5, 30], drag: 4, life: [0.3, 0.48], size: [24, 36], grow: 1.9, c0: [0.7, 0.68, 0.75, 0.5], c1: [0.5, 0.5, 0.57, 0], fadeIn: 0.1 }),
  // 적
  bone: E({ sprite: SPR.BONE, add: 0, n: 14, shape: 1, speed: [140, 380], vy: [200, 400], grav: 1500, drag: 0.3, life: [0.75, 1.15], size: [13, 22], spin: [-14, 14], c0: [0.95, 0.9, 0.8, 1], c1: [0.72, 0.68, 0.6, 1], cv: 0.25, floor: 2, pri: 1 }),
  boneDust: E({ sprite: SPR.SMOKE, add: 0, n: 6, shape: 1, speed: [30, 100], vy: [20, 70], drag: 2.5, life: [0.5, 0.85], size: [44, 68], grow: 1.8, c0: [0.8, 0.78, 0.86, 0.42], c1: [0.6, 0.6, 0.7, 0], fadeIn: 0.08 }),
  ash: E({ sprite: SPR.FLAKE, add: 0, shape: 3, rad: 24, h: [0, 105], speed: [40, 120], drag: 0.8, grav: -60, life: [0.7, 1.25], size: [5, 10], spin: [-6, 6], c0: [0.2, 0.19, 0.22, 0.95], c1: [0.08, 0.08, 0.1, 0] }),
  ashEmber: E({ sprite: SPR.EMBER, shape: 3, rad: 24, h: [0, 105], speed: [50, 150], grav: -80, drag: 1, life: [0.5, 0.95], size: [5, 9], c0: [3, 1.3, 0.3, 1], c1: [1.8, 0.3, 0.05, 0] }),
  ashSmoke: E({ sprite: SPR.SMOKE, add: 0, shape: 3, rad: 18, h: [10, 90], speed: [25, 70], drag: 1, life: [0.8, 1.25], size: [42, 62], grow: 1.7, c0: [0.13, 0.11, 0.15, 0.42], c1: [0.2, 0.18, 0.24, 0], fadeIn: 0.15 }),
  hurt: E({ sprite: SPR.STREAK, stretch: 2, n: 4, spread: 0.8, speed: [200, 420], grav: 900, drag: 2, life: [0.12, 0.24], size: [7, 11], c0: [3, 2.8, 2.4, 1], c1: [1.6, 0.6, 0.2, 0] }),
  breath: E({ sprite: SPR.FLAME, spread: 0.3, speed: [300, 560], vy: [0, 40], drag: 1.6, life: [0.3, 0.5], size: [30, 46], grow: 2.2, c0: [1.7, 0.75, 0.18, 0.55], c1: [0.9, 0.12, 0.02, 0] }),
  // 줍기
  sparkleG: E({ sprite: SPR.STAR, n: 10, shape: 3, rad: 18, h: [0, 30], speed: [90, 220], drag: 2, life: [0.4, 0.75], size: [10, 19], spin: [-4, 4], c0: [3.2, 2.5, 0.8, 1], c1: [2.2, 1.2, 0.2, 0] }),
  sparkleH: E({ sprite: SPR.STAR, n: 10, shape: 3, rad: 18, h: [0, 30], speed: [90, 220], drag: 2, life: [0.4, 0.75], size: [10, 19], spin: [-4, 4], c0: [1, 3.2, 1.2, 1], c1: [0.2, 2, 0.5, 0] }),
  sparkleM: E({ sprite: SPR.STAR, n: 10, shape: 3, rad: 18, h: [0, 30], speed: [90, 220], drag: 2, life: [0.4, 0.75], size: [10, 19], spin: [-4, 4], c0: [1, 2, 3.6, 1], c1: [0.2, 0.7, 2.6, 0] }),
  // 불
  flame: E({ sprite: SPR.FLAME, shape: 1, speed: [10, 55], vy: [30, 95], drag: 1.5, grav: -120, life: [0.22, 0.42], size: [28, 42], grow: 0.35, spin: [-2, 2], c0: [1.7, 0.75, 0.18, 0.6], c1: [0.9, 0.12, 0.02, 0], jit: 5, rot: 0 }),
  flameBurst: E({ sprite: SPR.FLAME, n: 14, shape: 1, speed: [120, 400], vy: [40, 170], drag: 3.2, grav: -150, life: [0.35, 0.62], size: [46, 74], grow: 1.5, spin: [-2, 2], c0: [1.8, 0.8, 0.2, 0.62], c1: [0.9, 0.1, 0.02, 0] }),
  ember: E({ sprite: SPR.EMBER, n: 12, shape: 1, speed: [150, 440], vy: [100, 320], grav: 600, drag: 1.2, life: [0.5, 1.05], size: [5, 9], c0: [3.4, 1.7, 0.4, 1], c1: [1.8, 0.3, 0.05, 0], floor: 2 }),
  fireSmoke: E({ sprite: SPR.SMOKE, add: 0, n: 5, shape: 1, speed: [30, 95], vy: [60, 150], drag: 1.5, life: [0.7, 1.15], size: [52, 84], grow: 2, c0: [0.1, 0.08, 0.08, 0.5], c1: [0.2, 0.18, 0.18, 0], fadeIn: 0.15 }),
  flameCol: E({ sprite: SPR.FLAME, n: 20, shape: 3, rad: 40, h: [0, 70], speed: [380, 720], drag: 1.2, life: [0.35, 0.62], size: [52, 84], grow: 0.4, c0: [1.7, 0.75, 0.18, 0.5], c1: [0.9, 0.12, 0.02, 0], rot: 0 }),
  gatherFire: E({ sprite: SPR.EMBER, n: 10, shape: 4, rad: 74, life: [0.2, 0.3], size: [6, 10], c0: [3, 1.4, 0.3, 0], c1: [3.4, 2.2, 0.8, 1] }),
  rock: E({ sprite: SPR.SHARD, add: 0, n: 16, shape: 1, speed: [200, 520], vy: [220, 520], grav: 1500, drag: 0.3, life: [0.7, 1.2], size: [9, 18], spin: [-12, 12], c0: [0.4, 0.3, 0.26, 1], c1: [0.28, 0.24, 0.24, 1], floor: 2 }),
  // 얼음
  snow: E({ sprite: SPR.SNOW, shape: 1, speed: [20, 85], drag: 2, life: [0.3, 0.58], size: [8, 15], spin: [-3, 3], c0: [1.8, 2.7, 3.4, 0.9], c1: [0.6, 1.3, 2.6, 0] }),
  iceChip: E({ sprite: SPR.SHARD, add: 0.55, n: 12, shape: 1, speed: [160, 440], vy: [120, 320], grav: 1300, drag: 0.5, life: [0.5, 0.95], size: [8, 16], spin: [-12, 12], c0: [1.6, 2.3, 2.9, 1], c1: [0.8, 1.5, 2.4, 0.6], floor: 2 }),
  mist: E({ sprite: SPR.SMOKE, add: 0.3, n: 5, shape: 2, rad: 10, speed: [40, 130], drag: 2.5, life: [0.6, 1.05], size: [52, 84], grow: 1.8, c0: [0.7, 0.92, 1.15, 0.36], c1: [0.5, 0.8, 1.05, 0], fadeIn: 0.12 }),
  snowRing: E({ sprite: SPR.SNOW, n: 24, shape: 2, rad: 30, speed: [300, 540], vy: [20, 130], drag: 2.8, life: [0.45, 0.78], size: [10, 19], spin: [-4, 4], c0: [1.9, 2.8, 3.6, 1], c1: [0.6, 1.3, 2.6, 0] }),
  gatherIce: E({ sprite: SPR.SNOW, n: 10, shape: 4, rad: 74, life: [0.2, 0.3], size: [8, 13], c0: [1.4, 2.4, 3.2, 0], c1: [2.4, 3.2, 3.8, 1] }),
  // 번개
  zap: E({ sprite: SPR.STREAK, stretch: 2.6, n: 8, shape: 1, speed: [250, 680], drag: 4, life: [0.1, 0.23], size: [8, 13], c0: [2.6, 3, 3.8, 1], c1: [0.5, 0.6, 2.8, 0] }),
  zapGround: E({ sprite: SPR.STREAK, stretch: 2.2, n: 16, shape: 2, rad: 8, speed: [300, 640], vy: [60, 280], grav: 900, drag: 2, life: [0.2, 0.42], size: [8, 13], c0: [2.6, 3, 3.8, 1], c1: [0.5, 0.6, 2.8, 0], floor: 2 }),
  crackle: E({ sprite: SPR.STAR, shape: 3, rad: 74, h: [0, 30], speed: [0, 40], life: [0.07, 0.15], size: [12, 26], c0: [2.2, 2.6, 3.8, 1], c1: [0.8, 1, 3, 0] }),
  gatherZap: E({ sprite: SPR.CORE, n: 10, shape: 4, rad: 74, life: [0.16, 0.24], size: [6, 10], c0: [1.6, 2, 3.6, 0], c1: [3, 3.2, 4, 1] }),
  // 성
  mote: E({ sprite: SPR.CORE, shape: 3, rad: 58, h: [0, 40], speed: [130, 340], drag: 0.8, life: [0.6, 1.15], size: [6, 11], c0: [3.4, 2.7, 1.1, 1], c1: [2.2, 1.3, 0.3, 0] }),
  holyStar: E({ sprite: SPR.STAR, shape: 3, rad: 52, h: [20, 170], speed: [20, 85], life: [0.4, 0.85], size: [14, 28], spin: [-2, 2], c0: [2.2, 1.9, 1, 0.9], c1: [2.2, 1.5, 0.4, 0] }),
  waveMote: E({ sprite: SPR.CORE, n: 20, spread: 0.62, speed: [300, 560], vy: [20, 95], drag: 2.2, life: [0.4, 0.72], size: [6, 12], c0: [3.4, 2.7, 1.1, 1], c1: [2.2, 1.2, 0.3, 0] }),
  gatherHoly: E({ sprite: SPR.CORE, n: 10, shape: 4, rad: 74, life: [0.2, 0.3], size: [6, 10], c0: [3, 2.2, 0.8, 0], c1: [3.6, 3.2, 1.8, 1] }),
  // 피 · 그림자
  bloodTrail: E({ sprite: SPR.DROP, stretch: 1.2, add: 0, shape: 1, speed: [20, 85], grav: 700, life: [0.3, 0.52], size: [8, 13], c0: [0.8, 0.04, 0.09, 1], c1: [0.36, 0, 0.03, 0.7], floor: 1 }),
  bloodBurst: E({ sprite: SPR.DROP, stretch: 1.6, add: 0, n: 16, shape: 1, speed: [180, 480], vy: [80, 280], grav: 1300, drag: 0.6, life: [0.5, 0.9], size: [9, 17], c0: [0.9, 0.05, 0.1, 1], c1: [0.4, 0, 0.04, 0.8], floor: 1 }),
  bloodGlow: E({ sprite: SPR.GLOW, size: 110, grow: 1.4, life: 0.2, c0: [1.6, 0.12, 0.16, 0.7], c1: [1, 0, 0.05, 0], pri: 1, min: 1 }),
  darkMist: E({ sprite: SPR.SMOKE, add: 0, n: 6, shape: 1, speed: [40, 140], vy: [10, 75], drag: 2.4, life: [0.6, 1.05], size: [52, 84], grow: 1.8, c0: [0.13, 0.02, 0.11, 0.55], c1: [0.2, 0.03, 0.22, 0], fadeIn: 0.1 }),
  shadowSpark: E({ sprite: SPR.STREAK, stretch: 2.4, n: 10, spread: 0.85, speed: [250, 640], drag: 3, life: [0.15, 0.32], size: [8, 13], c0: [2.2, 0.8, 3.4, 1], c1: [0.8, 0.1, 2.2, 0] }),
  gatherBlood: E({ sprite: SPR.DROP, stretch: 1.5, n: 10, shape: 4, rad: 74, life: [0.22, 0.32], size: [7, 11], c0: [2, 0.1, 0.15, 0], c1: [3, 0.3, 0.3, 1] }),
  // 궁극기
  ultGather: E({ sprite: SPR.CORE, n: 44, shape: 4, rad: 330, life: [0.45, 0.62], size: [7, 14], c0: [3, 0.3, 0.3, 0], c1: [3.6, 1.6, 0.7, 1], pri: 1 }),
  emberRain: E({ sprite: SPR.EMBER, n: 60, shape: 3, rad: 430, h: [160, 520], speed: [-300, -130], drag: 0.4, life: [0.9, 1.6], size: [6, 12], c0: [3.4, 1.1, 0.3, 1], c1: [1.8, 0.2, 0.1, 0] }),
  ultSpark: E({ sprite: SPR.STREAK, stretch: 3, n: 40, shape: 2, rad: 20, speed: [500, 1100], vy: [40, 420], grav: 700, drag: 1.6, life: [0.3, 0.7], size: [10, 18], grow: 0.5, c0: [3.6, 2.4, 1.2, 1], c1: [2.6, 0.3, 0.2, 0], floor: 2 }),
};

// ───────────── 띠 명세 ─────────────
export const TRAIL = {
  blade: RB({ mode: 0, life: 0.17, col: [0.9, 1.3, 2, 0.95] }),          // 칼 궤적 (fx.ribbons.start(TRAIL.blade) → push(날 밑동, 날 끝) → end)
  bladeHeavy: RB({ mode: 0, life: 0.24, col: [2.2, 1.3, 0.6, 1] }),
  fire: RB({ mode: 1, life: 0.2, width: 30, col: [2.6, 1, 0.2, 0.9] }),
  ice: RB({ mode: 1, life: 0.18, width: 16, col: [1, 1.9, 2.8, 0.9] }),
  blood: RB({ mode: 1, life: 0.3, width: 24, col: [1.6, 0.06, 0.12, 0.9] }),
  meteor: RB({ mode: 1, life: 0.3, width: 70, col: [2.8, 1, 0.2, 0.9] }),
  bolt: RB({ mode: 2, life: 0.17, width: 15, col: [1.2, 1.5, 3.2, 1], segs: 10, jitter: 22, regen: 0.04 }),
  boltThin: RB({ mode: 2, life: 0.13, width: 8, col: [1.4, 1.2, 3, 0.8], segs: 8, jitter: 34, regen: 0.035 }),
  boltBig: RB({ mode: 2, life: 0.24, width: 34, col: [1.3, 1.5, 3.2, 1], segs: 14, jitter: 46, regen: 0.04 }),
  boltRed: RB({ mode: 2, life: 0.22, width: 16, col: [3, 0.5, 0.4, 1], segs: 9, jitter: 30, regen: 0.04 }),
};

// ───────────── 색 ─────────────
const C = {
  white: [1, 1, 1, 1], warm: [1, 0.72, 0.4], steel: [1.1, 1.5, 2.2, 1], steelDk: [0.3, 0.55, 1.2, 1], heavy: [2.4, 1.5, 0.7, 1], heavyDk: [1.4, 0.4, 0.1, 1],
  ringW: [1.6, 1.5, 1.4, 0.9], ringGold: [2.2, 1.6, 0.5, 0.9], ringCyan: [0.6, 1.6, 2.2, 0.9], ringRed: [2.2, 0.25, 0.2, 0.9], ringViolet: [1.2, 0.9, 2.6, 0.9], ringDust: [0.7, 0.7, 0.78, 0.45],
  scorch: [0.02, 0.015, 0.015, 0.75], bloodSplat: [0.22, 0.0, 0.02, 0.8], crackDk: [0.01, 0.01, 0.012, 0.85], dustDecal: [0.5, 0.48, 0.52, 0.22], shadow: [0, 0, 0, 0.5],
  fire: [1.6, 0.6, 0.12, 1], fireA: [3.2, 1.7, 0.45, 1], fireB: [1.7, 0.28, 0.03, 1], fireL: [1, 0.5, 0.18],
  ice: [0.5, 1.3, 1.9, 1], iceA: [1.8, 2.6, 3.2, 0.92], iceB: [0.25, 0.6, 0.95, 1], iceL: [0.4, 0.75, 1],
  zap: [1.0, 0.55, 2.3, 1], zapA: [2.6, 2.8, 3.6, 1], zapB: [0.5, 0.5, 2.4, 1], zapL: [0.6, 0.7, 1],
  holy: [1.8, 1.3, 0.45, 1], holyA: [3.4, 3, 1.9, 1], holyB: [2, 1.2, 0.3, 1], holyL: [1, 0.82, 0.45],
  blood: [1.7, 0.1, 0.14, 1], bloodA: [3, 0.4, 0.4, 1], bloodB: [0.9, 0, 0.05, 1], bloodL: [1, 0.12, 0.14],
  shadow2: [1.1, 0.3, 1.9, 1], shadowA: [2.4, 0.7, 3.2, 1], shadowB: [0.18, 0.02, 0.3, 1], shadowL: [0.6, 0.2, 1],
  rockA: [3, 1.2, 0.3, 1], rockB: [0.34, 0.2, 0.16, 1], bellA: [3.2, 2.6, 1.2, 0.9], bellB: [1.6, 0.9, 0.2, 0.9],
  fireG: [1.5, 0.6, 0.15, 0.85], bloodG: [1.4, 0.1, 0.14, 0.85],
  pickGlow: [[1.2, 0.9, 0.3, 0.6], [0.3, 1.1, 0.4, 0.6], [0.3, 0.7, 1.3, 0.6]], ringBig: [1.5, 1.4, 1.3, 0.42], ringBigRed: [2, 0.25, 0.2, 0.5], ringBigGold: [2, 1.5, 0.5, 0.5],
  danger: [2.2, 0.32, 0.14, 1], shieldA: [0.9, 1.7, 2.4, 0.5], shieldB: [0.15, 0.45, 1.2, 0.5],
  pickG: [2.2, 1.7, 0.5, 0.9], pickH: [0.6, 2.2, 0.8, 0.9], pickM: [0.6, 1.3, 2.4, 0.9],
};
const FAM = {
  fire: { tele: C.fire, rune: DECAL.HOLY, gather: S.gatherFire, light: C.fireL, name: 'fire' },
  ice: { tele: C.ice, rune: DECAL.HOLY, gather: S.gatherIce, light: C.iceL, name: 'ice' },
  zap: { tele: C.zap, rune: DECAL.HOLY, gather: S.gatherZap, light: C.zapL, name: 'lightning' },
  holy: { tele: C.holy, rune: DECAL.BELL, gather: S.gatherHoly, light: C.holyL, name: 'holy' },
  blood: { tele: C.blood, rune: DECAL.BLOOD, gather: S.gatherBlood, light: C.bloodL, name: 'blood' },
  shadow: { tele: C.shadow2, rune: DECAL.BLOOD, gather: S.gatherBlood, light: C.shadowL, name: 'shadow' },
};

// ───────────── 작은 도우미 ─────────────
const gRing = (fx, x, y, z, r, life, col) => fx.quads.ground(Q.RING, x, y, z, r, r, 0, life, col, 0.14, 1, 0, 0, 1, 0, 0, 0.02);
const bRing = (fx, x, y, z, r, life, col) => fx.quads.billboard(Q.RING, x, y, z, r, life, col, 0.22, 1, 0.01);
const scorch = (fx, x, y, z, r, life, col, ember) => fx.quads.ground(Q.SCORCH, x, y, z, r, r, rnd() * 6.28, life, col, 0.75, 1, 0, rnd() * 9, 0, 0, ember, 0.04);
const crack = (fx, x, y, z, r, life, col, add) => fx.quads.ground(Q.CRACK, x, y, z, r, r, rnd() * 6.28, life, col, 0.55, 1, 0, DECAL.CRACK, add, 0, 0, 0.03);
const rune = (fx, x, y, z, r, life, col, cell, spin) => fx.quads.ground(Q.RUNE, x, y, z, r, r, 0, life, col, 0.55, 1, 0, cell, 1, spin, 0, 0.1);
const teleCircle = (fx, x, y, z, r, fill, hold, col) => fx.quads.ground(Q.CIRCLE, x, y, z, r, r, 0, fill + hold, col, 1, 1, fill, 0, 1, 0, 0, 0.08);
const teleLine = (fx, x, y, z, tx, tz, halfW, fill, hold, col) => { const dx = tx - x, dz = tz - z, len = Math.hypot(dx, dz) || 1; return fx.quads.ground(Q.LINE, (x + tx) * 0.5, y, (z + tz) * 0.5, len * 0.5, halfW, Math.atan2(dz, dx), fill + hold, col, 1, 1, fill, 0, 1, 0, 0, 0.06); };
const teleSector = (fx, x, y, z, dx, dz, r, arc, fill, hold, col) => fx.quads.ground(Q.SECTOR, x, y, z, r, r, Math.atan2(dz, dx), fill + hold, col, 1, 1, fill, 0, 1, 0, arc, 0.06);
function feel(fx, stop, kick, trauma, dx, dz) { if (!fx.feelOn) return; const F = fx.feel; if (stop > 0) F.hitStop(stop); if (kick > 0) F.kick(dx, 0, dz, kick); if (trauma > 0) fx.trauma(trauma, dx, 0, dz); }
function castFx(fx, f, x, y, z, r, life) {
  rune(fx, x, y, z, r, life, f.tele, f.rune, 1.6);
  fx.particles.emit(f.gather, x, y + 62, z, 0, 1, 0, 1, y);
  fx.light(x, y + 60, z, 230, f.light, 0.9, life, 0.2, 0);
}
// 베기 메시의 기준틀: X = 앞, 법선을 앞 축 둘레로 roll 만큼 눕힌다 (roll 0 = 수평 베기, ±π/2 = 세로 베기 — 카메라를 본다)
function slash(fx, x, y, z, dx, dz, roll, size, life, colA, colB, start) {
  const s = Math.sin(roll), c = Math.cos(roll);
  return fx.meshes.spawn(MESH.CRESCENT, MODE.SLASH, x, y, z, dx, 0, dz, -dz * s, c, dx * s, size, size, size, life, colA, colB, 1, start);
}
// 날아가는 것 한 걸음: s.(x,y,z) 를 s.(tx,ty,tz) 로 speed 만큼. 닿으면 true. 손잡이 h0 띠 · h1 빛 덩이 · h2 빛 · h3 메시가 따라간다
function fly(fx, s, dt, speed) {
  const dx = s.tx - s.x, dy = s.ty - s.y, dz = s.tz - s.z, d = Math.hypot(dx, dy, dz), st = speed * dt;
  let hit = false;
  if (d <= st) { s.x = s.tx; s.y = s.ty; s.z = s.tz; hit = true; } else { const k = st / d; s.x += dx * k; s.y += dy * k; s.z += dz * k; }
  if (s.h0 >= 0) fx.ribbons.push(s.h0, s.x, s.y, s.z, 0, 0, 0);
  if (s.h1 >= 0) fx.quads.move(s.h1, s.x, s.y, s.z);
  if (s.h2 >= 0) fx.lights.move(s.h2, s.x, s.y, s.z);
  if (s.h3 >= 0) fx.meshes.move(s.h3, s.x, s.y, s.z);
  return hit;
}
function flyEnd(fx, s) { if (s.h0 >= 0) fx.ribbons.end(s.h0); if (s.h1 >= 0) fx.quads.kill(s.h1); if (s.h2 >= 0) fx.lights.kill(s.h2); if (s.h3 >= 0) fx.meshes.kill(s.h3); s.h0 = s.h1 = s.h2 = s.h3 = -1; }

// ───────────── 시퀀스 풀 (시전 → 날아감 → 터짐 같은 여러 박자 효과) ─────────────
class Seq { constructor() { this.on = false; this.kind = 0; this.ph = 0; this.n = 0; this.t = 0.5; this.x = 0.5; this.y = 0.5; this.z = 0.5; this.tx = 0.5; this.ty = 0.5; this.tz = 0.5; this.dx = 0.5; this.dz = 0.5; this.pow = 0.5; this.a = 0.5; this.b = 0.5; this.gy = 0.5; this.h0 = -1; this.h1 = -1; this.h2 = -1; this.h3 = -1; this.i = 0; } }
const STEP = [];
export class Seqs {
  constructor(max) { this.max = max; this.cap = max; this.list = []; for (let i = 0; i < max; i++) this.list.push(new Seq()); this.live = 0; this.fr = new Float64Array(4); this.chain = new Float32Array(max * 12); }
  get dt() { return this.fr[3]; }
  reset(cap) { this.cap = Math.min(this.max, cap); for (let i = 0; i < this.max; i++) this.list[i].on = false; this.live = 0; }
  get(kind, x, y, z, dx, dz, pow, tx, ty, tz) {
    for (let i = 0; i < this.cap; i++) { const s = this.list[i]; if (s.on) continue;
      s.on = true; s.kind = kind; s.ph = 0; s.n = 0; s.t = 0; s.x = x; s.y = y; s.z = z; s.gy = y; s.dx = dx; s.dz = dz; s.pow = pow; s.tx = tx; s.ty = ty; s.tz = tz; s.a = 0; s.b = 0; s.h0 = s.h1 = s.h2 = s.h3 = -1; s.i = i; return s; }
    return null;
  }
  update(fx) { let n = 0; const dt = this.dt; for (let i = 0; i < this.cap; i++) { const s = this.list[i]; if (!s.on) continue; s.t += dt; if (STEP[s.kind](fx, s)) s.on = false; else n++; } this.live = n; }
}
const K = { BREATH: 15, FIREBOLT: 0, FIREPILLAR: 1, METEOR: 2, ICELANCE: 3, ICENOVA: 4, CHAIN: 5, STRIKE: 6, HOLYPILLAR: 7, HOLYWAVE: 8, BELL: 9, BLOODORB: 10, CLAWS: 11, ULT: 12, ASH: 13, COMBO: 14 };

// ═════════════ 타격 ═════════════
// 베인 선: 카메라 평면에서 ang 방향으로 누운 가는 빛줄기
function cut(fx, spec, x, y, z, ang) { const Cm = fx.cam, c = Math.cos(ang), s = Math.sin(ang); fx.particles.emit(spec, x, y, z, Cm.right[0] * c + Cm.up[0] * s, Cm.right[1] * c + Cm.up[1] * s, Cm.right[2] * c + Cm.up[2] * s, 1, 0); }
function sparkDir(fx, spec, x, y, z, dx, dz, up, k) { const l = 1 / Math.hypot(dx, up, dz); fx.particles.emit(spec, x, y, z, dx * l, up * l, dz * l, k, fx.groundY); }
function hitSlashLight(fx, x, y, z, dx, dz, pow) {
  const P = fx.particles, ang = (dx >= 0 ? 0.55 : PI - 0.55) + (rnd() - 0.5) * 0.7;
  cut(fx, S.cutL, x, y, z, ang); P.emit(S.flashL, x, y, z, 0, 1, 0, 1, 0); sparkDir(fx, S.spark, x, y, z, dx, dz, 0.3, pow);
  fx.light(x, y, z, 180, C.warm, 0.8, 0.12, 0, 0);
  feel(fx, 0.05, 3, 0.10, dx, dz); fx.sfx('hit.slash.light', x, y, z, 1);
}
function hitSlashHeavy(fx, x, y, z, dx, dz, pow) {
  const P = fx.particles, ang = (dx >= 0 ? 0.6 : PI - 0.6) + (rnd() - 0.5) * 0.4;
  cut(fx, S.cutH, x, y, z, ang); cut(fx, S.cutL, x, y, z, ang + 1.25); P.emit(S.flashH, x, y, z, 0, 1, 0, 1, 0);
  sparkDir(fx, S.spark, x, y, z, dx, dz, 0.35, 1.6 * pow); sparkDir(fx, S.chip, x, y, z, dx, dz, 0.2, 0.5 * pow);
  bRing(fx, x, y, z, 78, 0.22, C.ringW);
  fx.light(x, y, z, 270, C.warm, 1.1, 0.16, 0, 0);
  feel(fx, 0.10, 8, 0.24, dx, dz); fx.sfx('hit.slash.heavy', x, y, z, 1);
}
function hitBlunt(fx, x, y, z, dx, dz, pow) {
  const P = fx.particles;
  P.emit(S.star, x, y, z, 0, 1, 0, 1, 0); P.emit(S.flashH, x, y, z, 0, 1, 0, 1, 0);
  bRing(fx, x, y, z, 96, 0.26, C.ringW);
  sparkDir(fx, S.chip, x, y, z, dx, dz, 0.5, 1.2 * pow); P.emit(S.puff, x, fx.groundY + 6, z, 0, 1, 0, pow, fx.groundY);
  if (y - fx.groundY < 90) gRing(fx, x, fx.groundY, z, 110, 0.35, C.ringDust);
  fx.light(x, y, z, 250, C.warm, 1, 0.16, 0, 0);
  feel(fx, 0.10, 8, 0.28, dx, dz); fx.sfx('hit.blunt', x, y, z, 1);
}
function hitPierce(fx, x, y, z, dx, dz, pow) {
  const P = fx.particles;
  P.emit(S.pierce, x - dx * 40, y, z - dz * 40, dx, 0, dz, 1, 0); P.emit(S.flashL, x, y, z, 0, 1, 0, 1, 0);
  sparkDir(fx, S.pierceSpark, x, y, z, dx, dz, 0.05, pow); sparkDir(fx, S.spark, x, y, z, -dx, -dz, 0.4, 0.35 * pow);
  bRing(fx, x, y, z, 46, 0.16, C.ringCyan);
  fx.light(x, y, z, 170, C.iceL, 0.8, 0.12, 0, 0);
  feel(fx, 0.06, 5, 0.12, dx, dz); fx.sfx('hit.pierce', x, y, z, 1);
}
function hitCrit(fx, x, y, z, dx, dz, pow) {
  const P = fx.particles;
  cut(fx, S.cutH, x, y, z, dx >= 0 ? 0.6 : PI - 0.6); P.emit(S.starBig, x, y, z, 0, 1, 0, 1, 0); P.emit(S.flashH, x, y, z, 0, 1, 0, 1, 0);
  P.emit(S.gold, x, y, z, 0, 1, 0, pow, fx.groundY);
  bRing(fx, x, y, z, 120, 0.28, C.ringGold);
  fx.light(x, y, z, 320, C.holyL, 1.3, 0.2, 0, 0);
  feel(fx, 0.133, 8, 0.3, dx, dz); if (fx.feelOn) { fx.feel.zoomPunch(0.04); fx.feel.flash(1, 0.92, 0.7, 0.16, 9); }
  fx.sfx('hit.crit', x, y, z, 1);
}
function hitGuard(fx, x, y, z, dx, dz, pow) {
  const P = fx.particles;
  P.emit(S.star, x, y, z, 0, 1, 0, 1, 0); sparkDir(fx, S.guard, x, y, z, -dx, -dz, 0.3, pow);
  bRing(fx, x, y, z, 62, 0.2, C.ringCyan);
  fx.light(x, y, z, 220, C.iceL, 1, 0.14, 0, 0);
  feel(fx, 0.07, 4, 0.14, -dx, -dz);
  if (pow > 1.2) { bRing(fx, x, y, z, 130, 0.3, C.ringCyan); if (fx.feelOn) { fx.feel.slowMo(0.4, 0.14); fx.feel.zoomPunch(0.03); } fx.sfx('hit.parry', x, y, z, 1); } else fx.sfx('hit.guard', x, y, z, 1);
}
function hitFinisher(fx, x, y, z, dx, dz, pow) {
  const P = fx.particles, gy = fx.groundY, ang = dx >= 0 ? 0.5 : PI - 0.5;
  cut(fx, S.cutF, x, y, z, ang); cut(fx, S.cutH, x, y, z, ang + 1.3);
  P.emit(S.starBig, x, y, z, 0, 1, 0, 1, 0); P.emit(S.flashF, x, y, z, 0, 1, 0, 1, 0);
  sparkDir(fx, S.spark, x, y, z, dx, dz, 0.4, 2.8 * pow); sparkDir(fx, S.chip, x, y, z, dx, dz, 0.4, 1.2 * pow); P.emit(S.puff, x, gy + 6, z, 0, 1, 0, 1.5, gy);
  bRing(fx, x, y, z, 150, 0.3, C.ringBig); gRing(fx, x, gy, z, 230, 0.5, C.ringBig); gRing(fx, x, gy, z, 140, 0.4, C.ringGold);
  crack(fx, x, gy, z, 120, 5, C.crackDk, 0); scorch(fx, x, gy, z, 90, 5, C.scorch, 0.4);
  fx.light(x, y, z, 460, C.warm, 1.6, 0.35, 0, 0);
  if (fx.feelOn) { const F = fx.feel; F.hitStop(0.133, true); F.slowMo(0.25, 0.3); F.zoomPunch(0.08, 0.12); F.flash(1, 0.96, 0.9, 0.45, 8); F.vignette(0.9, 0.3, 0.1, 0.3, 3); F.kick(dx, 0, dz, 12); fx.trauma(0.5, dx, 0, dz); }
  fx.sfx('hit.finisher', x, y, z, 1); fx.sfx('feel.slowmo', x, y, z, 1);
}
// 무기 휘두르기 (초승달 메시). pow 의 부호 = 베는 쪽, 크기 = 배율
function swingLight(fx, x, y, z, dx, dz, pow) { slash(fx, x + dx * 18, y + 58, z + dz * 18, dx, dz, (pow < 0 ? -0.5 : 0.5), 92 * Math.abs(pow), 0.17, C.steel, C.steelDk, 0.82); fx.sfx('swing.light', x, y, z, 1); }
function swingHeavy(fx, x, y, z, dx, dz, pow) { slash(fx, x + dx * 22, y + 62, z + dz * 22, dx, dz, (pow < 0 ? -1.2 : 1.2), 128 * Math.abs(pow), 0.24, C.heavy, C.heavyDk, 0.78); fx.sfx('swing.heavy', x, y, z, 1); }

// ═════════════ 이동 ═════════════
function moveDash(fx, x, y, z, dx, dz) { sparkDir(fx, S.dashDust, x, y + 8, z, -dx, -dz, 0.25, 1); fx.particles.emit(S.speedLine, x, y + 52, z, -dx, 0, -dz, 1, y); gRing(fx, x, y, z, 54, 0.22, C.ringDust); fx.sfx('move.dash', x, y, z, 1); }
function moveLand(fx, x, y, z, dx, dz, pow) { const P = fx.particles; P.emit(S.landDust, x, y + 6, z, 0, 1, 0, pow, y); P.emit(S.pebble, x, y + 4, z, 0, 1, 0, pow, y); gRing(fx, x, y, z, 70 * pow, 0.3, C.ringDust); if (fx.feelOn && pow > 1.2) fx.trauma(0.06 * pow, 0, 1, 0); fx.sfx('move.land', x, y, z, Math.min(1, pow)); }
function moveStep(fx, x, y, z) { fx.particles.emit(S.stepDust, x, y + 4, z, 0, 1, 0, 1, y); fx.sfx('move.step', x, y, z, 1); }
function moveJump(fx, x, y, z) { fx.particles.emit(S.jumpPuff, x, y + 5, z, 0, 1, 0, 1, y); gRing(fx, x, y, z, 40, 0.2, C.ringDust); fx.sfx('move.jump', x, y, z, 1); }

// ═════════════ 적 ═════════════
function enemyHurt(fx, x, y, z, dx, dz, pow) { sparkDir(fx, S.hurt, x, y, z, dx, dz, 0.3, pow); fx.sfx('enemy.hurt', x, y, z, 1); }
function deathBone(fx, x, y, z, dx, dz, pow) {
  const P = fx.particles;
  sparkDir(fx, S.bone, x, y + 55, z, dx, dz, 0.6, pow); P.emit(S.boneDust, x, y + 45, z, 0, 1, 0, 1, y); P.emit(S.flashL, x, y + 55, z, 0, 1, 0, 1, 0);
  scorch(fx, x, y, z, 54, 4, C.dustDecal, 0);
  feel(fx, 0.05, 0, 0.14, dx, dz); fx.sfx('enemy.death.bone', x, y, z, 1);
}
function deathAsh(fx, x, y, z, dx, dz, pow) {
  const s = fx.seqs.get(K.ASH, x, y, z, dx, dz, pow, x, y, z); if (!s) return;
  scorch(fx, x, y, z, 50, 5, C.scorch, 0.9); fx.light(x, y + 50, z, 240, C.fireL, 0.7, 0.9, 0.3, 0);
  feel(fx, 0.05, 0, 0.1, dx, dz); fx.sfx('enemy.death.ash', x, y, z, 1);
}
STEP[K.ASH] = (fx, s) => { const dt = fx.seqs.dt;
  const P = fx.particles, k = s.t / 0.75;
  if (k < 1) { P.emit(S.ash, s.x, s.y, s.z, 0, 1, 0, 60 * dt * s.pow, s.y); P.emit(S.ashEmber, s.x, s.y, s.z, 0, 1, 0, 22 * dt * s.pow, s.y); P.emit(S.ashSmoke, s.x, s.y, s.z, 0, 1, 0, 9 * dt, s.y); }
  return s.t > 0.8;
};
function pickup(fx, x, y, z, dx, dz, pow) {
  const kind = pow >= 2.5 ? 2 : pow >= 1.5 ? 1 : 0, P = fx.particles;
  P.emit(kind === 2 ? S.sparkleM : kind === 1 ? S.sparkleH : S.sparkleG, x, y + 20, z, 0, 1, 0, 1, y);
  const col = kind === 2 ? C.pickM : kind === 1 ? C.pickH : C.pickG;
  gRing(fx, x, y, z, 60, 0.35, col); fx.quads.billboard(Q.GLOW, x, y + 40, z, 44, 0.22, C.pickGlow[kind], 0.5, 1.2, 0.02);
  fx.light(x, y + 40, z, 190, kind === 2 ? C.iceL : kind === 1 ? C.holyL : C.warm, 0.7, 0.3, 0, 0);
  fx.sfx(kind === 2 ? 'pickup.mana' : kind === 1 ? 'pickup.heal' : 'pickup.coin', x, y, z, 1);
}

// 보호막 (구 방패). 따라다니게 하려면 fx.last(메시 손잡이)를 받아 fx.meshes.move(h, x, y, z) 를 프레임마다 부른다
function buffShield(fx, x, y, z, dx, dz, pow) {
  fx.last = fx.meshes.spawn(MESH.SPHERE, MODE.SHIELD, x, y + 56, z, 1, 0, 0, 0, 1, 0, 54 * pow, 70 * pow, 54 * pow, 1.0, C.shieldA, C.shieldB, 1, 0);
  gRing(fx, x, y, z, 80, 0.35, C.ringCyan); fx.light(x, y + 56, z, 260, C.iceL, 0.8, 0.9, 0, 0); fx.sfx('buff.shield', x, y, z, 1);
}
// 적의 화염 숨결: 부채꼴 예고(위험색) → 원뿔 불길. (x,y,z) = 적의 발밑, (dx,dz) = 뿜는 방향
function enemyBreath(fx, x, y, z, dx, dz, pow) {
  const s = fx.seqs.get(K.BREATH, x, y, z, dx, dz, pow, x, y, z); if (!s) return;
  teleSector(fx, x, y, z, dx, dz, 270, 0.4, 0.55, 0.5, C.danger); fx.sfx('enemy.breath.cast', x, y, z, 1);
}
STEP[K.BREATH] = (fx, s) => { const dt = fx.seqs.dt;
  if (s.t < 0.55) return false;
  const x = s.x + s.dx * 22, y = s.y + 70, z = s.z + s.dz * 22;
  if (s.ph === 0) {
    s.ph = 1;
    fx.meshes.spawn(MESH.CONE, MODE.CONE, x, y, z, s.dz, 0, -s.dx, 0, 1, 0, 96, 60, 250, 0.6, C.fireA, C.fireB, 1, 0);
    fx.quads.ground(Q.SCORCH, s.x + s.dx * 150, s.y, s.z + s.dz * 150, 120, 60, Math.atan2(s.dz, s.dx), 5, C.scorch, 0.8, 1, 0, rnd() * 9, 0, 0, 1.2, 0.05);
    fx.light(s.x + s.dx * 130, y, s.z + s.dz * 130, 420, C.fireL, 1.4, 0.6, 0.3, 0);
    feel(fx, 0, 0, 0.16, s.dx, s.dz); fx.sfx('enemy.breath.fire', x, y, z, 1);
  }
  const l = 1 / Math.hypot(s.dx, 0.06, s.dz); fx.particles.emit(S.breath, x, y, z, s.dx * l, -0.06 * l, s.dz * l, 70 * dt, s.y);
  return s.t > 1.05;
};

// ═════════════ 마법 ═════════════
// ── 불 ──
function impactFire(fx, x, y, z, gy, big) {
  const P = fx.particles;
  P.emit(S.flashH, x, y, z, 0, 1, 0, 1, 0); P.emit(S.flameBurst, x, y, z, 0, 1, 0, big, gy); P.emit(S.ember, x, y, z, 0, 1, 0, big, gy); P.emit(S.fireSmoke, x, y + 20, z, 0, 1, 0, big, gy);
  bRing(fx, x, y, z, 90 * big, 0.25, C.fireA); gRing(fx, x, gy, z, 130 * big, 0.4, C.fireA); scorch(fx, x, gy, z, 60 * big, 6, C.scorch, 1);
  fx.light(x, y, z, 400 * big, C.fireL, 1.5, 0.35, 0.2, 0);
}
function fireBolt(fx, x, y, z, dx, dz, pow, tx, ty, tz) {
  const s = fx.seqs.get(K.FIREBOLT, x, y + 62, z, dx, dz, pow, tx, ty + 50, tz); if (!s) return; s.gy = ty;
  castFx(fx, FAM.fire, x, y, z, 46, 0.5); teleLine(fx, x, y, z, tx, tz, 9, 0.22, 0.35, C.fire); fx.sfx('magic.fire.cast', x, y, z, 1);
}
STEP[K.FIREBOLT] = (fx, s) => { const dt = fx.seqs.dt;
  if (s.ph === 0) { if (s.t < 0.22) return false; s.ph = 1; s.h0 = fx.ribbons.start(TRAIL.fire); s.h1 = fx.quads.billboard(Q.GLOW, s.x, s.y, s.z, 46, 4, C.fireG, 1, 1, 0.03); s.h2 = fx.light(s.x, s.y, s.z, 260, C.fireL, 1.1, 4, 0.25, 1); fx.sfx('magic.fire.fly', s.x, s.y, s.z, 1); }
  const hit = fly(fx, s, dt, 980);
  fx.particles.emit(S.flame, s.x, s.y, s.z, 0, 1, 0, 70 * dt, s.gy);
  if (!hit) return false;
  flyEnd(fx, s); impactFire(fx, s.x, s.y, s.z, s.gy, 1); feel(fx, 0.067, 5, 0.2, s.dx, s.dz); fx.sfx('magic.fire.hit', s.x, s.y, s.z, 1); return true;
};
function firePillar(fx, x, y, z, dx, dz, pow, tx, ty, tz) {
  const s = fx.seqs.get(K.FIREPILLAR, x, y, z, dx, dz, pow, tx, ty, tz); if (!s) return;
  castFx(fx, FAM.fire, x, y, z, 52, 0.7); teleCircle(fx, tx, ty, tz, 74, 0.7, 0.15, C.fire); fx.sfx('magic.fire.cast', x, y, z, 1);
}
STEP[K.FIREPILLAR] = (fx, s) => { const dt = fx.seqs.dt;
  const P = fx.particles;
  if (s.ph === 0) {
    if (s.t < 0.7) return false; s.ph = 1;
    fx.meshes.spawn(MESH.TUBE, MODE.BEAM, s.tx, s.ty, s.tz, 1, 0, 0, 0, 1, 0, 58, 340, 58, 0.8, C.fireA, C.fireB, 1, 0.95);
    fx.meshes.spawn(MESH.TUBE, MODE.BEAM, s.tx, s.ty, s.tz, 0, 0, 1, 0, 1, 0, 26, 420, 26, 0.6, C.holyA, C.fireA, 1, 0.9);
    P.emit(S.flameCol, s.tx, s.ty, s.tz, 0, 1, 0, 1, s.ty); P.emit(S.ember, s.tx, s.ty + 30, s.tz, 0, 1, 0, 1.5, s.ty);
    gRing(fx, s.tx, s.ty, s.tz, 170, 0.45, C.fireA); scorch(fx, s.tx, s.ty, s.tz, 84, 6, C.scorch, 1.4);
    fx.light(s.tx, s.ty + 120, s.tz, 560, C.fireL, 1.7, 0.85, 0.3, 0);
    feel(fx, 0.05, 0, 0.3, 0, 0); fx.sfx('magic.fire.pillar', s.tx, s.ty, s.tz, 1);
  }
  if (s.t < 1.15) P.emit(S.flameCol, s.tx, s.ty, s.tz, 0, 1, 0, 2.6 * dt, s.ty);
  return s.t > 1.2;
};
function meteor(fx, x, y, z, dx, dz, pow, tx, ty, tz) {
  const s = fx.seqs.get(K.METEOR, tx - 250, ty + 640, tz + 150, dx, dz, pow, tx, ty + 20, tz); if (!s) return; s.gy = ty;
  castFx(fx, FAM.fire, x, y, z, 60, 0.9); teleCircle(fx, tx, ty, tz, 124, 1.1, 0.1, C.fire);
  fx.quads.ground(Q.SHADOW, tx, ty, tz, 110, 110, 0, 1.15, C.shadow, 0.25, 1, 0, 0, 0, 0, 0, 0.3);
  fx.sfx('magic.meteor.cast', x, y, z, 1);
}
STEP[K.METEOR] = (fx, s) => { const dt = fx.seqs.dt;
  if (s.ph === 0) {
    if (s.t < 0.55) return false; s.ph = 1; s.a = Math.hypot(s.tx - s.x, s.ty - s.y, s.tz - s.z) / 0.55;
    s.h3 = fx.meshes.spawn(MESH.SPHERE, MODE.SOLID, s.x, s.y, s.z, 1, 0, 0, 0, 1, 0, 34, 30, 32, 3, C.rockA, C.rockB, 0, 0);
    s.h0 = fx.ribbons.start(TRAIL.meteor); s.h1 = fx.quads.billboard(Q.GLOW, s.x, s.y, s.z, 120, 3, C.fireG, 1, 1, 0.05); s.h2 = fx.light(s.x, s.y, s.z, 420, C.fireL, 1.3, 3, 0.3, 1);
    fx.sfx('magic.meteor.fall', s.x, s.y, s.z, 1);
  }
  const hit = fly(fx, s, dt, s.a);
  fx.particles.emit(S.flame, s.x, s.y, s.z, 0, 1, 0, 110 * dt, s.gy); fx.particles.emit(S.fireSmoke, s.x, s.y, s.z, 0, 1, 0, 4 * dt, s.gy);
  if (!hit) return false;
  flyEnd(fx, s); const P = fx.particles, gy = s.gy;
  impactFire(fx, s.x, gy + 30, s.z, gy, 1.7); P.emit(S.rock, s.x, gy + 10, s.z, 0, 1, 0, 1, gy); P.emit(S.flashF, s.x, gy + 40, s.z, 0, 1, 0, 1, 0);
  gRing(fx, s.x, gy, s.z, 330, 0.6, C.ringW); crack(fx, s.x, gy, s.z, 170, 7, C.crackDk, 0); crack(fx, s.x, gy, s.z, 150, 1.2, C.fireA, 1);
  if (fx.feelOn) { const F = fx.feel; F.hitStop(0.12); F.kick(0, -1, 0, 14); fx.trauma(0.6, 0, 1, 0); F.flash(1, 0.6, 0.25, 0.3, 7); F.zoomPunch(0.05); }
  fx.sfx('magic.meteor.impact', s.x, gy, s.z, 1); return true;
};
// ── 얼음 ──
function impactIce(fx, x, y, z, gy, big) {
  const P = fx.particles;
  P.emit(S.flashL, x, y, z, 0, 1, 0, 1, 0); P.emit(S.iceChip, x, y, z, 0, 1, 0, big, gy); P.emit(S.mist, x, gy + 10, z, 0, 1, 0, big, gy); P.emit(S.snow, x, y, z, 0, 1, 0, 8 * big, gy);
  bRing(fx, x, y, z, 70 * big, 0.22, C.ringCyan); gRing(fx, x, gy, z, 110 * big, 0.38, C.ringCyan);
  fx.quads.ground(Q.FROST, x, gy, z, 64 * big, 64 * big, rnd() * 6, 4.5, C.ice, 0.5, 1, 0, rnd() * 9, 1, 0, 0, 0.05);
  fx.meshes.spawn(MESH.SHARDS, MODE.SHARDS, x, gy, z, 1, 0, 0, 0, 1, 0, 50 * big, 78 * big, 50 * big, 1.1, C.iceA, C.iceB, 0, 0);
  fx.light(x, y, z, 340 * big, C.iceL, 1.3, 0.3, 0, 0);
}
function iceLance(fx, x, y, z, dx, dz, pow, tx, ty, tz) {
  const s = fx.seqs.get(K.ICELANCE, x, y + 62, z, dx, dz, pow, tx, ty + 50, tz); if (!s) return; s.gy = ty;
  castFx(fx, FAM.ice, x, y, z, 46, 0.45); teleLine(fx, x, y, z, tx, tz, 7, 0.18, 0.25, C.ice); fx.sfx('magic.ice.cast', x, y, z, 1);
}
STEP[K.ICELANCE] = (fx, s) => { const dt = fx.seqs.dt;
  if (s.ph === 0) {
    if (s.t < 0.18) return false; s.ph = 1;
    // 원뿔(꼭짓점이 앞): 국소 +z = −진행 방향
    const ax = s.tx - s.x, ay = s.ty - s.y, az = s.tz - s.z, l = Math.hypot(ax, ay, az) || 1, fxx = ax / l, fyy = ay / l, fzz = az / l;
    let ux = -fxx * fyy, uy = 1 - fyy * fyy, uz = -fzz * fyy; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const xx = uy * -fzz - uz * -fyy, xy = uz * -fxx - ux * -fzz, xz = ux * -fyy - uy * -fxx;
    s.h3 = fx.meshes.spawn(MESH.CONE, MODE.SOLID, s.x, s.y, s.z, xx, xy, xz, ux, uy, uz, 9, 9, 74, 3, C.iceA, C.iceB, 0, 0);
    s.h0 = fx.ribbons.start(TRAIL.ice); s.h2 = fx.light(s.x, s.y, s.z, 220, C.iceL, 1, 3, 0, 1); fx.sfx('magic.ice.fly', s.x, s.y, s.z, 1);
  }
  const hit = fly(fx, s, dt, 1400);
  fx.particles.emit(S.snow, s.x, s.y, s.z, 0, 1, 0, 60 * dt, s.gy);
  if (!hit) return false;
  flyEnd(fx, s); impactIce(fx, s.x, s.y, s.z, s.gy, 1); feel(fx, 0.067, 5, 0.18, s.dx, s.dz); fx.sfx('magic.ice.hit', s.x, s.y, s.z, 1); return true;
};
function iceNova(fx, x, y, z, dx, dz, pow) {
  const s = fx.seqs.get(K.ICENOVA, x, y, z, dx, dz, pow, x, y, z); if (!s) return;
  castFx(fx, FAM.ice, x, y, z, 70, 0.6); teleCircle(fx, x, y, z, 196, 0.5, 0.1, C.ice); fx.sfx('magic.ice.nova.cast', x, y, z, 1);
}
STEP[K.ICENOVA] = (fx, s) => {
  if (s.t < 0.5) return false;
  const P = fx.particles, x = s.x, y = s.y, z = s.z, n = fx.tier === 'low' ? 3 : fx.tier === 'mid' ? 5 : 6;
  gRing(fx, x, y, z, 230, 0.5, C.ringCyan); gRing(fx, x, y, z, 150, 0.36, C.white);
  fx.quads.ground(Q.FROST, x, y, z, 196, 196, 0, 3.6, C.ice, 0.3, 1, 0, rnd() * 9, 1, 0, 0, 0.04);
  for (let i = 0; i < n; i++) { const a = i / n * 6.2832 + 0.4; fx.meshes.spawn(MESH.SHARDS, MODE.SHARDS, x + Math.cos(a) * 128, y, z + Math.sin(a) * 128, Math.cos(a), 0, Math.sin(a), 0, 1, 0, 52, 96, 52, 1.2 + i * 0.03, C.iceA, C.iceB, 0, 0); }
  P.emit(S.snowRing, x, y + 24, z, 0, 1, 0, 1, y); P.emit(S.mist, x, y + 12, z, 0, 1, 0, 2, y); P.emit(S.iceChip, x, y + 30, z, 0, 1, 0, 1, y);
  fx.light(x, y + 60, z, 520, C.iceL, 1.5, 0.45, 0, 0);
  if (fx.feelOn) { fx.feel.hitStop(0.08); fx.trauma(0.3, 0, 1, 0); fx.feel.flash(0.6, 0.85, 1, 0.12, 8); }
  fx.sfx('magic.ice.nova.burst', x, y, z, 1); return true;
};
// ── 번개 ──
function zapLink(fx, ax, ay, az, bx, by, bz, gy) {
  fx.ribbons.bolt(TRAIL.bolt, ax, ay, az, bx, by, bz); if (fx.tier !== 'low') fx.ribbons.bolt(TRAIL.boltThin, ax, ay, az, bx, by, bz);
  fx.particles.emit(S.zap, bx, by, bz, 0, 1, 0, 1, gy); fx.particles.emit(S.flashL, bx, by, bz, 0, 1, 0, 1, 0);
  bRing(fx, bx, by, bz, 52, 0.18, C.ringViolet); fx.light(bx, by, bz, 320, C.zapL, 1.4, 0.2, 0.5, 0);
  if (fx.feelOn) { fx.feel.hitStop(0.04); fx.trauma(0.12, bx - ax, 0, bz - az); fx.feel.flash(0.7, 0.75, 1, 0.07, 10); }
  fx.sfx('magic.lightning.zap', bx, by, bz, 1);
}
/** 연쇄 번개: 표적은 fx.chain (x,y,z × 최대 4) · fx.chainN 에 미리 넣는다. 0 이면 표적 둘레에 시범용 점을 만든다 */
function chainLightning(fx, x, y, z, dx, dz, pow, tx, ty, tz) {
  const s = fx.seqs.get(K.CHAIN, x, y + 62, z, dx, dz, pow, tx, ty + 50, tz); if (!s) return; s.gy = ty;
  const Cc = fx.seqs.chain, o = s.i * 12; let n = fx.chainN;
  if (n > 0) { for (let i = 0; i < n * 3; i++) Cc[o + i] = fx.chain[i]; fx.chainN = 0; }
  else { n = 3; Cc[o] = tx; Cc[o + 1] = ty + 50; Cc[o + 2] = tz; Cc[o + 3] = tx + 120 * dx - 70 * dz; Cc[o + 4] = ty + 50; Cc[o + 5] = tz + 120 * dz + 90; Cc[o + 6] = tx + 230 * dx + 40 * dz; Cc[o + 7] = ty + 50; Cc[o + 8] = tz + 230 * dz - 70; }
  s.n = n; castFx(fx, FAM.zap, x, y, z, 46, 0.4); teleLine(fx, x, y, z, tx, tz, 6, 0.16, 0.1, C.zap); fx.sfx('magic.lightning.cast', x, y, z, 1);
}
STEP[K.CHAIN] = (fx, s) => {
  if (s.t < 0.18 + s.ph * 0.075) return false;
  const Cc = fx.seqs.chain, o = s.i * 12 + s.ph * 3;
  zapLink(fx, s.x, s.y, s.z, Cc[o], Cc[o + 1], Cc[o + 2], s.gy);
  s.x = Cc[o]; s.y = Cc[o + 1]; s.z = Cc[o + 2]; s.ph++;
  return s.ph >= s.n;
};
function thunderStrike(fx, x, y, z, dx, dz, pow, tx, ty, tz) {
  const s = fx.seqs.get(K.STRIKE, x, y, z, dx, dz, pow, tx, ty, tz); if (!s) return;
  castFx(fx, FAM.zap, x, y, z, 52, 0.6); teleCircle(fx, tx, ty, tz, 88, 0.6, 0.1, C.zap); fx.sfx('magic.thunder.charge', tx, ty, tz, 1);
}
STEP[K.STRIKE] = (fx, s) => { const dt = fx.seqs.dt;
  const P = fx.particles, x = s.tx, y = s.ty, z = s.tz;
  if (s.t < 0.6) { P.emit(S.crackle, x, y, z, 0, 1, 0, 26 * dt, y); return false; }
  fx.ribbons.bolt(TRAIL.boltBig, x + 60, y + 920, z - 40, x, y, z); fx.ribbons.bolt(TRAIL.bolt, x - 90, y + 900, z + 30, x, y, z); if (fx.tier === 'high') fx.ribbons.bolt(TRAIL.boltThin, x + 40, y + 420, z, x + 130, y + 20, z + 50);
  fx.meshes.spawn(MESH.TUBE, MODE.BEAM, x, y, z, 1, 0, 0, 0, 1, 0, 30, 900, 30, 0.24, C.zapA, C.zapB, 1, 0.2);
  P.emit(S.zapGround, x, y + 10, z, 0, 1, 0, 1, y); P.emit(S.flashF, x, y + 30, z, 0, 1, 0, 1, 0); P.emit(S.zap, x, y + 60, z, 0, 1, 0, 1.5, y);
  gRing(fx, x, y, z, 210, 0.4, C.ringViolet); gRing(fx, x, y, z, 120, 0.3, C.white); scorch(fx, x, y, z, 70, 6, C.scorch, 0.6); crack(fx, x, y, z, 90, 1, C.zapA, 1);
  fx.light(x, y + 80, z, 820, C.zapL, 2.2, 0.3, 0.6, 0);
  if (fx.feelOn) { const F = fx.feel; F.hitStop(0.10); F.kick(0, -1, 0, 10); fx.trauma(0.5, 0, 1, 0); F.flash(0.8, 0.85, 1, 0.35, 9); }
  fx.sfx('magic.thunder.strike', x, y, z, 1); return true;
};
// ── 성 ──
function holyPillar(fx, x, y, z, dx, dz, pow, tx, ty, tz) {
  const s = fx.seqs.get(K.HOLYPILLAR, x, y, z, dx, dz, pow, tx, ty, tz); if (!s) return;
  castFx(fx, FAM.holy, x, y, z, 52, 0.7); teleCircle(fx, tx, ty, tz, 84, 0.6, 0.1, C.holy); rune(fx, tx, ty, tz, 80, 1.6, C.holy, DECAL.HOLY, -1.2);
  fx.sfx('magic.holy.cast', x, y, z, 1);
}
STEP[K.HOLYPILLAR] = (fx, s) => { const dt = fx.seqs.dt;
  const P = fx.particles, x = s.tx, y = s.ty, z = s.tz;
  if (s.ph === 0) {
    if (s.t < 0.6) return false; s.ph = 1;
    fx.meshes.spawn(MESH.TUBE, MODE.BEAM, x, y, z, 1, 0, 0, 0, 1, 0, 64, 560, 64, 1.0, C.holyA, C.holyB, 1, 0.8);
    fx.meshes.spawn(MESH.TUBE, MODE.BEAM, x, y, z, 0, 0, 1, 0, 1, 0, 24, 640, 24, 0.85, C.white, C.holyA, 1, 0.6);
    gRing(fx, x, y, z, 190, 0.5, C.ringGold); gRing(fx, x, y, z, 110, 0.35, C.white);
    P.emit(S.holyStar, x, y, z, 0, 1, 0, 8, y); fx.light(x, y + 140, z, 620, C.holyL, 1.7, 1.0, 0, 0);
    if (fx.feelOn) { fx.trauma(0.2, 0, 1, 0); fx.feel.flash(1, 0.92, 0.7, 0.12, 6); }
    fx.sfx('magic.holy.pillar', x, y, z, 1);
  }
  if (s.t < 1.2) { P.emit(S.mote, x, y, z, 0, 1, 0, 46 * dt, y); P.emit(S.holyStar, x, y, z, 0, 1, 0, 8 * dt, y); }
  return s.t > 1.25;
};
function holyWave(fx, x, y, z, dx, dz, pow) {
  const s = fx.seqs.get(K.HOLYWAVE, x, y, z, dx, dz, pow, x, y, z); if (!s) return;
  castFx(fx, FAM.holy, x, y, z, 50, 0.5); teleSector(fx, x, y, z, dx, dz, 290, 0.62, 0.4, 0.1, C.holy); fx.sfx('magic.holy.cast', x, y, z, 1);
}
STEP[K.HOLYWAVE] = (fx, s) => {
  if (s.t < 0.4) return false;
  const x = s.x, y = s.y, z = s.z, dx = s.dx, dz = s.dz;
  slash(fx, x, y + 14, z, dx, dz, 0, 290, 0.5, C.holyA, C.holyB, 0.22); slash(fx, x, y + 40, z, dx, dz, 0.5, 250, 0.42, C.white, C.holyA, 0.22);
  sparkDir(fx, S.waveMote, x + dx * 40, y + 30, z + dz * 40, dx, dz, 0.12, 1);
  fx.quads.ground(Q.GLOW, x + dx * 150, y, z + dz * 150, 200, 200, 0, 0.5, C.holy, 0.4, 1.2, 0, 0, 1, 0, 0, 0.03);
  fx.light(x + dx * 140, y + 50, z + dz * 140, 460, C.holyL, 1.4, 0.45, 0, 0);
  feel(fx, 0.04, 4, 0.16, dx, dz); fx.sfx('magic.holy.wave', x, y, z, 1); return true;
};
function bellChime(fx, x, y, z, dx, dz, pow) {
  const s = fx.seqs.get(K.BELL, x, y, z, dx, dz, pow, x, y, z); if (!s) return;
  fx.meshes.spawn(MESH.BELL, MODE.BELL, x, y + 150, z, 1, 0, 0, 0, 1, 0, 78, 98, 78, 1.35, C.bellA, C.bellB, 1, 19);
  rune(fx, x, y, z, 120, 1.5, C.holy, DECAL.BELL, 0.9); fx.sfx('magic.bell.cast', x, y, z, 1);
}
STEP[K.BELL] = (fx, s) => { const dt = fx.seqs.dt;
  const x = s.x, y = s.y, z = s.z, P = fx.particles;
  if (s.ph < 3 && s.t >= 0.12 + s.ph * 0.32) {
    const i = s.ph++, R = 270 + i * 70;
    gRing(fx, x, y, z, R, 0.8, C.ringGold); if (i !== 1 || fx.tier !== 'low') bRing(fx, x, y + 190, z, 120 + i * 30, 0.5, C.ringGold);
    P.emit(S.holyStar, x, y + 100, z, 0, 1, 0, 6, y); P.emit(S.mote, x, y, z, 0, 1, 0, 10, y);
    fx.light(x, y + 180, z, 520 + i * 60, C.holyL, 1.2, 0.45, 0, 0);
    if (fx.feelOn) { fx.trauma(0.12, 0, 1, 0); fx.feel.zoomPunch(0.02); fx.feel.flash(1, 0.9, 0.6, 0.06, 8); if (i === 2) fx.feel.slowMo(0.6, 0.12); }
    fx.sfx('magic.bell.toll', x, y + 190, z, 1 - i * 0.15);
  }
  return s.t > 1.35;
};
// ── 피 · 그림자 ──
function bloodOrb(fx, x, y, z, dx, dz, pow, tx, ty, tz) {
  const s = fx.seqs.get(K.BLOODORB, x, y + 62, z, dx, dz, pow, tx, ty + 50, tz); if (!s) return; s.gy = ty;
  castFx(fx, FAM.blood, x, y, z, 52, 0.6); teleLine(fx, x, y, z, tx, tz, 11, 0.3, 0.5, C.blood); fx.sfx('magic.blood.cast', x, y, z, 1);
}
STEP[K.BLOODORB] = (fx, s) => { const dt = fx.seqs.dt;
  const P = fx.particles;
  if (s.ph === 0) { if (s.t < 0.3) return false; s.ph = 1; s.h0 = fx.ribbons.start(TRAIL.blood); s.h1 = fx.quads.billboard(Q.GLOW, s.x, s.y, s.z, 58, 5, C.bloodG, 1, 1, 0.05); s.h2 = fx.light(s.x, s.y, s.z, 240, C.bloodL, 1, 5, 0.2, 1); fx.sfx('magic.blood.fly', s.x, s.y, s.z, 1); }
  const hit = fly(fx, s, dt, 560);
  P.emit(S.bloodTrail, s.x, s.y, s.z, 0, 1, 0, 46 * dt, s.gy);
  if (!hit) return false;
  flyEnd(fx, s); const x = s.x, y = s.y, z = s.z, gy = s.gy;
  P.emit(S.bloodGlow, x, y, z, 0, 1, 0, 1, 0); P.emit(S.bloodBurst, x, y, z, 0, 1, 0, 1, gy); P.emit(S.darkMist, x, y, z, 0, 1, 0, 1, gy);
  bRing(fx, x, y, z, 84, 0.26, C.ringRed); gRing(fx, x, gy, z, 120, 0.4, C.ringRed); scorch(fx, x, gy, z, 70, 7, C.bloodSplat, 0);
  fx.light(x, y, z, 340, C.bloodL, 1.3, 0.35, 0, 0);
  feel(fx, 0.067, 5, 0.2, s.dx, s.dz); if (fx.feelOn) fx.feel.vignette(0.5, 0, 0.03, 0.22, 3.5);
  fx.sfx('magic.blood.hit', x, y, z, 1); return true;
};
function shadowClaws(fx, x, y, z, dx, dz, pow, tx, ty, tz) {
  const s = fx.seqs.get(K.CLAWS, x, y, z, dx, dz, pow, tx, ty, tz); if (!s) return;
  castFx(fx, FAM.shadow, x, y, z, 48, 0.45); teleLine(fx, tx - dx * 110, ty, tz - dz * 110, tx + dx * 110, tz + dz * 110, 62, 0.35, 0.1, C.shadow2);
  fx.sfx('magic.shadow.cast', x, y, z, 1);
}
STEP[K.CLAWS] = (fx, s) => {
  if (s.t < 0.35 + s.ph * 0.055) return false;
  const i = s.ph++, o = (i - 1) * 46, x = s.tx + s.dx * o, y = s.ty, z = s.tz + s.dz * o;
  slash(fx, x - s.dx * 30, y + 62, z - s.dz * 30, s.dx, s.dz, 1.25, 104, 0.26, C.shadowA, C.shadowB, 0.7);
  sparkDir(fx, S.shadowSpark, x, y + 60, z, s.dx, s.dz, 0.2, 0.6); if (i === 1) fx.particles.emit(S.darkMist, x, y + 50, z, 0, 1, 0, 1.2, y);
  fx.quads.ground(Q.SCORCH, x, y, z, 14, 60, Math.atan2(s.dz, s.dx), 4, C.scorch, 1, 1, 0, rnd() * 9, 0, 0, 0, 0.03);
  fx.light(x, y + 60, z, 260, C.shadowL, 1.2, 0.2, 0, 0);
  feel(fx, 0.05, 6, 0.14, s.dx, s.dz); fx.sfx('magic.shadow.claw', x, y, z, 1);
  return s.ph >= 3;
};
// ── 궁극기: 붉은 달의 종 (화면을 채우는 시범) ──
function ultBloodMoon(fx, x, y, z, dx, dz, pow) {
  const s = fx.seqs.get(K.ULT, x, y, z, dx, dz, pow, x, y, z); if (!s) return;
  rune(fx, x, y, z, 380, 3.3, C.blood, DECAL.BLOOD, 0.5); rune(fx, x, y, z, 210, 3.3, C.holy, DECAL.BELL, -0.8);
  fx.meshes.spawn(MESH.BELL, MODE.BELL, x, y + 200, z, 1, 0, 0, 0, 1, 0, 104, 128, 104, 3.1, C.bellA, C.bellB, 1, 11);
  fx.particles.emit(S.ultGather, x, y + 80, z, 0, 1, 0, 1, y);
  fx.light(x, y + 120, z, 700, C.bloodL, 1.2, 3.2, 0.2, 1);
  if (fx.feelOn) { const F = fx.feel; F.slowMo(0.35, 0.45); F.zoomPunch(0.06, 0.4); F.vignette(0.35, 0, 0.02, 0.6, 0.6); F.darken(0.4); }
  fx.sfx('ult.cast', x, y, z, 1);
}
STEP[K.ULT] = (fx, s) => { const dt = fx.seqs.dt;
  const x = s.x, y = s.y, z = s.z, P = fx.particles;
  // 종 세 번
  if (s.ph < 3 && s.t >= 0.55 + s.ph * 0.38) {
    const i = s.ph++;
    gRing(fx, x, y, z, 480 + i * 90, 0.9, i === 2 ? C.ringBigRed : C.ringBigGold); bRing(fx, x, y + 264, z, 150 + i * 40, 0.6, C.ringBigGold);
    P.emit(S.holyStar, x, y + 120, z, 0, 1, 0, 8, y);
    if (fx.feelOn) { fx.trauma(0.22, 0, 1, 0); fx.feel.zoomPunch(0.03); }
    fx.sfx('magic.bell.toll', x, y + 264, z, 1);
  }
  // 붉은 빛창 여덟 줄기
  if (s.ph >= 3 && s.n < 8 && s.t >= 1.75 + s.n * 0.085) {
    const i = s.n++, a = i * 2.4 + 0.5, r = 150 + (i % 3) * 95, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r * 0.75;
    fx.meshes.spawn(MESH.TUBE, MODE.BEAM, px, y, pz, 1, 0, 0, 0, 1, 0, 26, 760, 26, 0.5, C.bloodA, C.bloodB, 1, 0.25);
    fx.ribbons.bolt(TRAIL.boltRed, px + 30, y + 760, pz, px, y, pz);
    gRing(fx, px, y, pz, 120, 0.4, C.ringRed); P.emit(S.zapGround, px, y + 10, pz, 0, 1, 0, 0.6, y); scorch(fx, px, y, pz, 44, 5, C.scorch, 1.2);
    fx.light(px, y + 60, pz, 360, C.bloodL, 1.4, 0.3, 0, 0);
    if (fx.feelOn) { fx.feel.hitStop(0.033); fx.trauma(0.14, 0, 1, 0); }
    fx.sfx('ult.lance', px, y, pz, 1);
  }
  P.emit(S.emberRain, x, y, z, 0, 1, 0, 0.5 * dt, y);
  // 마무리
  if (s.ph === 3 && s.t >= 2.6) {
    s.ph = 4;
    slash(fx, x, y + 70, z, 1, 0, 0.9, 520, 0.45, C.holyA, C.bloodA, 0.3); slash(fx, x, y + 70, z, -1, 0, -0.9, 520, 0.45, C.bloodA, C.bloodB, 0.3);
    gRing(fx, x, y, z, 700, 0.9, C.ringBig); gRing(fx, x, y, z, 520, 0.75, C.ringBigRed); gRing(fx, x, y, z, 340, 0.6, C.ringBigGold); bRing(fx, x, y + 90, z, 360, 0.45, C.ringBig);
    P.emit(S.ultSpark, x, y + 30, z, 0, 1, 0, 1, y); P.emit(S.emberRain, x, y, z, 0, 1, 0, 1, y); P.emit(S.flashF, x, y + 80, z, 0, 1, 0, 1, 0); P.emit(S.starBig, x, y + 80, z, 0, 1, 0, 1, 0);
    crack(fx, x, y, z, 300, 7, C.crackDk, 0); crack(fx, x, y, z, 280, 1.4, C.bloodA, 1);
    fx.light(x, y + 100, z, 1200, C.holyL, 2.4, 0.6, 0, 0);
    if (fx.feelOn) { const F = fx.feel; F.hitStop(0.25, true); F.flash(1, 0.9, 0.85, 0.6, 5); F.zoomPunch(0.1, 0.2); F.slowMo(0.25, 0.4); F.kick(0, -1, 0, 16); fx.trauma(0.8, 0, 1, 0); F.vignette(0.6, 0.05, 0.02, 0.5, 1.5); F.darken(0); }
    fx.sfx('ult.final', x, y, z, 1);
  }
  if (s.t > 3.3) { if (fx.feelOn) fx.feel.darken(0); return true; }
  return false;
};

// ───────────── 목록 ─────────────
// args: 'hit' = 맞은 점 + 방향 · 'self' = 발밑(+방향) · 'aim' = 쏘는 쪽 발밑 → 표적 발밑
const DEF = [
  ['hit.slash.light', 'hit', '약한 베기', hitSlashLight, 'hit', ['hit.slash.light'], 'hitStop 0.05 · kick 3 · trauma 0.10'],
  ['hit.slash.heavy', 'hit', '강한 베기', hitSlashHeavy, 'hit', ['hit.slash.heavy'], 'hitStop 0.10 · kick 8 · trauma 0.24'],
  ['hit.blunt', 'hit', '둔기', hitBlunt, 'hit', ['hit.blunt'], 'hitStop 0.10 · kick 8 · trauma 0.28'],
  ['hit.pierce', 'hit', '찌르기', hitPierce, 'hit', ['hit.pierce'], 'hitStop 0.06 · kick 5 · trauma 0.12'],
  ['hit.crit', 'hit', '치명타', hitCrit, 'hit', ['hit.crit'], 'hitStop 0.133 · kick 8 · trauma 0.30 · zoomPunch 0.04 · flash 0.16'],
  ['hit.guard', 'hit', '막기 · 쳐내기', hitGuard, 'hit', ['hit.guard', 'hit.parry'], 'hitStop 0.07 · kick 4(반대) · trauma 0.14 · (pow>1.2: slowMo 0.4×0.14s · zoomPunch 0.03)'],
  ['hit.finisher', 'hit', '마무리 일격', hitFinisher, 'hit', ['hit.finisher', 'feel.slowmo'], 'hitStop 0.133(강제) · slowMo 0.25×0.30s · zoomPunch 0.08 · flash 0.45 · vignette 0.3 · kick 12 · trauma 0.5'],
  ['swing.light', 'hit', '휘두르기(약)', swingLight, 'self', ['swing.light'], '—'],
  ['swing.heavy', 'hit', '휘두르기(강)', swingHeavy, 'self', ['swing.heavy'], '—'],
  ['move.dash', 'move', '대시', moveDash, 'self', ['move.dash'], '—'],
  ['move.land', 'move', '착지', moveLand, 'self', ['move.land'], '(pow>1.2: trauma 0.06·pow)'],
  ['move.step', 'move', '발걸음', moveStep, 'self', ['move.step'], '—'],
  ['move.jump', 'move', '점프', moveJump, 'self', ['move.jump'], '—'],
  ['enemy.hurt', 'enemy', '피격 불티', enemyHurt, 'hit', ['enemy.hurt'], '— (번쩍임은 hurtFlash(age))'],
  ['enemy.death.bone', 'enemy', '뼈 흩어짐', deathBone, 'self', ['enemy.death.bone'], 'hitStop 0.05 · trauma 0.14'],
  ['enemy.death.ash', 'enemy', '재로 흩어짐', deathAsh, 'self', ['enemy.death.ash'], 'hitStop 0.05 · trauma 0.10 (분해는 dissolveK(age))'],
  ['enemy.breath', 'enemy', '적 화염 숨결', enemyBreath, 'self', ['enemy.breath.cast', 'enemy.breath.fire'], 'trauma 0.16'],
  ['buff.shield', 'enemy', '보호막', buffShield, 'self', ['buff.shield'], '—'],
  ['pickup', 'enemy', '줍기', pickup, 'self', ['pickup.coin', 'pickup.heal', 'pickup.mana'], '— (pow 1 금화 · 2 회복 · 3 마력)'],
  ['fire.bolt', 'fire', '화염탄', fireBolt, 'aim', ['magic.fire.cast', 'magic.fire.fly', 'magic.fire.hit'], 'hitStop 0.067 · kick 5 · trauma 0.2'],
  ['fire.pillar', 'fire', '불기둥', firePillar, 'aim', ['magic.fire.cast', 'magic.fire.pillar'], 'hitStop 0.05 · trauma 0.3'],
  ['fire.meteor', 'fire', '운석', meteor, 'aim', ['magic.meteor.cast', 'magic.meteor.fall', 'magic.meteor.impact'], 'hitStop 0.12 · kick 14(아래) · trauma 0.6 · flash 0.3 · zoomPunch 0.05'],
  ['ice.lance', 'ice', '얼음창', iceLance, 'aim', ['magic.ice.cast', 'magic.ice.fly', 'magic.ice.hit'], 'hitStop 0.067 · kick 5 · trauma 0.18'],
  ['ice.nova', 'ice', '서리 폭발', iceNova, 'self', ['magic.ice.nova.cast', 'magic.ice.nova.burst'], 'hitStop 0.08 · trauma 0.3 · flash 0.12'],
  ['lightning.chain', 'lightning', '연쇄 번개', chainLightning, 'aim', ['magic.lightning.cast', 'magic.lightning.zap'], '고리마다 hitStop 0.04 · trauma 0.12 · flash 0.07'],
  ['lightning.strike', 'lightning', '낙뢰', thunderStrike, 'aim', ['magic.thunder.charge', 'magic.thunder.strike'], 'hitStop 0.10 · kick 10(아래) · trauma 0.5 · flash 0.35'],
  ['holy.pillar', 'holy', '빛기둥', holyPillar, 'aim', ['magic.holy.cast', 'magic.holy.pillar'], 'trauma 0.2 · flash 0.12'],
  ['holy.wave', 'holy', '빛의 파동', holyWave, 'self', ['magic.holy.cast', 'magic.holy.wave'], 'hitStop 0.04 · kick 4 · trauma 0.16'],
  ['holy.bell', 'holy', '종소리 충격파', bellChime, 'self', ['magic.bell.cast', 'magic.bell.toll'], '울릴 때마다 trauma 0.12 · zoomPunch 0.02 · flash 0.06 · (셋째: slowMo 0.6×0.12s)'],
  ['blood.orb', 'blood', '피의 구슬', bloodOrb, 'aim', ['magic.blood.cast', 'magic.blood.fly', 'magic.blood.hit'], 'hitStop 0.067 · kick 5 · trauma 0.2 · vignette 0.22'],
  ['shadow.claws', 'blood', '그림자 발톱', shadowClaws, 'aim', ['magic.shadow.cast', 'magic.shadow.claw'], '발톱마다 hitStop 0.05 · kick 6 · trauma 0.14'],
  ['ult.bloodmoon', 'ult', '궁극기 · 붉은 달의 종', ultBloodMoon, 'self', ['ult.cast', 'magic.bell.toll', 'ult.lance', 'ult.final'], 'slowMo 0.35×0.45s · darken 0.4 · 종 ×3 trauma 0.22 · 빛창 ×8 hitStop 0.033 · 마무리 hitStop 0.25(강제) · flash 0.6 · zoomPunch 0.10 · slowMo 0.25×0.4s · trauma 0.8'],
];
export const PRESET_LIST = DEF.map((d, id) => ({ id, name: d[0], group: d[1], ko: d[2], fn: d[3], args: d[4], sfx: d[5], feel: d[6] }));
export const PRESET_IDS = Object.fromEntries(PRESET_LIST.map((p) => [p.name, p.id]));
export const PRESETS = Object.fromEntries(PRESET_LIST.map((p) => [p.name, p]));
