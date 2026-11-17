// 시범 구간 (docs/v2/SLICE0.md §1) — 시범판 B 의 저작 데이터. 형식: docs/v2/proto_b.md §1, 해석: world.js compileStage
// 순수 데이터(JSON 으로 옮길 수 있다). 단위 = 논리 px, x 오른쪽 · z 화면 안쪽 · y 위.
//   floor   {x,z,w,d, y?=0, thick?, mat}            바닥 판 (윗면 y). 판이 없는 곳 = 구덩이
//   block   {x,z,w,d,h, y?, mat}                    밟을 수 있는 상자 (단상·나무 상자)
//   wall    {x,z,w,d,h, y?, mat, collideH?}         건물·담 (위에 설 수 없다; collideH = 충돌 높이)
//   stairs  {x,z,w,d,h, y?, dir:'x+|x-|z+|z-', steps}
//   pillar  {x,z,r,h}                               8각 돌기둥
//   blocker {x,z,w,d, y?, h?}                       보이지 않는 벽
//   prop    {img,x,z,h, solid?, light?, glow?}      그림 소품 (v1 assets/props 빌보드)
//   window  {x,z,y, side?}                          불 켜진 창 (+ 빛)
const D = Math.PI / 180;
const LAMP = { img: 'deco_village_lamppost', h: 196, solid: 9, solidZ: 9, glow: { y: 0.86, r: 78, c: [1, 0.72, 0.36] }, light: { r: 330, i: 1.7, y: 170 } };
const BRAZIER = { img: 'deco_gate_brazier', h: 112, solid: 20, glow: { y: 0.72, r: 90, c: [1, 0.6, 0.25], flicker: true }, light: { r: 380, i: 1.8, y: 90, c: [1, 0.55, 0.22] } };

export default {
  id: 'slice0', name: '시범 구간',
  start: { x: 130, z: 130 },
  goal: { x: 2190, z: 1860 },
  sky: { img: 'bg/s01_village', crop: 0.66, span: 84 * D, bottom: -7 * D, top: [0.035, 0.05, 0.075] },
  fog: { color: [0.07, 0.095, 0.135], near: 760, far: 3300, max: 0.94 },
  light: { ambient: [0.3, 0.33, 0.47], moon: [0.5, 0.52, 0.7], moonDir: [-0.447, 0.745, -0.496] },
  sections: [
    { id: 'street', label: '거리', x0: -200, x1: 1900, z0: -100, z1: 300, cam: { yaw: 12 * D, pitch: 20 * D, dist: 790, lookY: 64, leadX: 90, leadZ: 0, minX: 40, zFollow: 0.55 } },
    { id: 'corner', label: '모퉁이', x0: 1900, x1: 2600, z0: -100, z1: 300, cam: { yaw: 1 * D, pitch: 17 * D, dist: 800, lookY: 80, leadX: 0, leadZ: 150, zFollow: 0.9 } },
    { id: 'alley', label: '골목', x0: 1800, x1: 2600, z0: 300, z1: 1500, cam: { yaw: 0, pitch: 13.5 * D, dist: 660, lookY: 62, leadX: 0, leadZ: 170, minX: 2030, maxX: 2350, zFollow: 1, yawLead: 3 * D } },
    { id: 'yard', label: '마당', x0: 1500, x1: 2900, z0: 1500, z1: 2400, cam: { yaw: 0, pitch: 29 * D, dist: 900, lookY: 30, leadX: 0, leadZ: 40, minX: 2040, maxX: 2340, zFollow: 1, center: { x: 2190, z: 1860, k: 0.3 } } },
  ],
  parts: [
    // ── 횡 구간: 거리 (x 0–2400, z 0–260). 구덩이 = x 1800–1960, z 0–130 에 판이 없다 ──
    { t: 'floor', x: -60, z: 0, w: 1860, d: 260, mat: 'cobble' },
    { t: 'floor', x: 1800, z: 130, w: 160, d: 130, mat: 'cobble' },
    { t: 'floor', x: 1960, z: 0, w: 440, d: 260, mat: 'cobble' },
    { t: 'blocker', x: -60, z: -60, w: 2540, d: 60, y: -400, h: 1200 },                 // 화면 앞쪽 가장자리
    { t: 'wall', x: -160, z: -60, w: 100, d: 400, h: 300, mat: 'facade' },              // 서쪽 끝
    // 길 건너 건물 (북쪽 면) — 높이를 달리해 집 여러 채처럼
    { t: 'wall', x: -160, z: 260, w: 600, d: 90, h: 290, mat: 'facade' },
    { t: 'wall', x: 440, z: 260, w: 470, d: 90, h: 350, mat: 'plaster' },
    { t: 'wall', x: 910, z: 260, w: 500, d: 90, h: 270, mat: 'facade' },
    { t: 'wall', x: 1410, z: 260, w: 570, d: 90, h: 330, mat: 'plaster' },
    { t: 'window', x: 150, z: 259, y: 120 }, { t: 'window', x: 330, z: 259, y: 205, i: 0.5 }, { t: 'window', x: 640, z: 259, y: 230, i: 0.5 },
    { t: 'window', x: 1090, z: 259, y: 190, i: 0.6 }, { t: 'window', x: 1520, z: 259, y: 130 }, { t: 'window', x: 1760, z: 259, y: 240, i: 0.5 },
    { t: 'prop', img: 'deco_gate_banner', x: 520, z: 257, y: 120, h: 190 }, { t: 'prop', img: 'deco_gate_banner', x: 1330, z: 257, y: 70, h: 180 },
    // 가로등 2 · 기둥 2 (앞뒤로 지나갈 수 있다 — 가림 확인)
    { t: 'prop', ...LAMP, x: 430, z: 150 }, { t: 'prop', ...LAMP, x: 1660, z: 66 },
    { t: 'pillar', x: 700, z: 110, r: 24, h: 236 }, { t: 'pillar', x: 1565, z: 196, r: 22, h: 220 },
    // 돌 단상 300×120×72 + 왼쪽 계단
    { t: 'block', x: 900, z: 130, w: 300, d: 120, h: 72, mat: 'stone' },
    { t: 'stairs', x: 804, z: 150, w: 96, d: 84, h: 72, dir: 'x+', steps: 6, mat: 'stone' },
    // 나무 상자 장애물 + 소품
    { t: 'block', x: 1392, z: 92, w: 74, d: 74, h: 64, mat: 'wood' },
    { t: 'prop', img: 'prop_barrel', x: 1500, z: 214, h: 78, solid: 24 },
    { t: 'prop', img: 'deco_village_cart', x: 250, z: 226, h: 104, solid: 70, solidZ: 22 },
    { t: 'prop', img: 'deco_village_haybale', x: 585, z: 236, h: 62, solid: 34, solidZ: 16 },
    { t: 'prop', img: 'deco_village_well', x: 1255, z: 44, h: 132, solid: 46, solidZ: 30 },
    { t: 'prop', img: 'prop_crate', x: 2060, z: 236, h: 62, solid: 30, solidZ: 18 },
    // ── 모퉁이 + 종 구간: 골목 (x 1980–2400, z 260–1560). 가운데 오르막 계단 +96 ──
    { t: 'wall', x: 2400, z: -60, w: 90, d: 1060, h: 450, mat: 'plaster' },             // 동쪽 벽 (거리 끝 + 골목 오른쪽)
    { t: 'wall', x: 1890, z: 350, w: 90, d: 650, h: 450, mat: 'facade' },               // 골목 왼쪽 벽
    { t: 'floor', x: 1980, z: 260, w: 420, d: 440, mat: 'cobble' },
    { t: 'stairs', x: 1980, z: 700, w: 420, d: 200, h: 96, dir: 'z+', steps: 8, mat: 'stone' },
    { t: 'floor', x: 1980, z: 900, w: 420, d: 660, y: 96, thick: 330, mat: 'cobble' },
    { t: 'wall', x: 1980, z: 560, w: 420, d: 30, y: 300, h: 44, mat: 'stone' },           // 골목 위 아치 1
    { t: 'wall', x: 1980, z: 968, w: 420, d: 32, y: 392, h: 58, mat: 'stone' },           // 아치 2 (높은 벽이 끝나는 곳)
    { t: 'window', x: 2399, z: 480, y: 170, side: 'x-' }, { t: 'window', x: 1981, z: 640, y: 210, side: 'x+', i: 0.6 }, { t: 'window', x: 2399, z: 860, y: 280, side: 'x-', i: 0.6 },
    { t: 'prop', img: 'prop_barrel', x: 2016, z: 420, h: 78, solid: 24 }, { t: 'prop', img: 'prop_crate', x: 2364, z: 540, h: 66, solid: 28, solidZ: 20 },
    { t: 'prop', img: 'prop_barrel', x: 2366, z: 600, h: 74, solid: 22 },
    { t: 'prop', ...LAMP, x: 2012, z: 668 }, { t: 'prop', ...LAMP, x: 2368, z: 940 },
    // 높은 벽이 끝난 뒤: 낮은 담 + 양옆 뜰 (z 1000–1560)
    { t: 'wall', x: 1936, z: 1000, w: 44, d: 560, y: 96, h: 52, collideH: 800, mat: 'stone' },
    { t: 'wall', x: 2400, z: 1000, w: 44, d: 560, y: 96, h: 52, collideH: 800, mat: 'stone' },
    { t: 'floor', x: 1480, z: 1000, w: 456, d: 560, y: 92, thick: 330, mat: 'dirt', walk: false },
    { t: 'floor', x: 2444, z: 1000, w: 456, d: 560, y: 92, thick: 330, mat: 'dirt', walk: false },
    { t: 'wall', x: 1400, z: 1000, w: 80, d: 1240, y: 92, h: 250, mat: 'facade' },
    { t: 'wall', x: 2900, z: 1000, w: 80, d: 1240, y: 92, h: 250, mat: 'facade' },
    { t: 'prop', img: 'prop_statue', x: 2034, z: 1190, h: 210, solid: 26 }, { t: 'prop', img: 'prop_statue', x: 2346, z: 1190, h: 210, solid: 26, flip: true },
    { t: 'prop', img: 'deco_grave_deadtree', x: 1760, z: 1230, y: 92, h: 330 }, { t: 'prop', img: 'deco_grave_deadtree', x: 2650, z: 1360, y: 92, h: 300, flip: true },
    { t: 'prop', img: 'deco_grave_deadtree', x: 1640, z: 1450, y: 92, h: 280, flip: true }, { t: 'prop', img: 'deco_village_fence', x: 1800, z: 1080, y: 92, h: 70 },
    { t: 'prop', img: 'deco_village_fence', x: 2620, z: 1120, y: 92, h: 70 }, { t: 'prop', img: 'deco_grave_tomb1', x: 2560, z: 1260, y: 92, h: 90 },
    { t: 'prop', img: 'deco_grave_tomb2', x: 1820, z: 1400, y: 92, h: 90 },
    { t: 'prop', ...LAMP, x: 2014, z: 1420 },
    // ── 마당 900×600 (x 1740–2640, z 1560–2160, y 96) ──
    { t: 'floor', x: 1740, z: 1560, w: 900, d: 600, y: 96, thick: 330, mat: 'dirt' },
    { t: 'wall', x: 1480, z: 1500, w: 456, d: 60, y: 92, h: 56, collideH: 800, mat: 'stone' },
    { t: 'wall', x: 2444, z: 1500, w: 456, d: 60, y: 92, h: 56, collideH: 800, mat: 'stone' },
    { t: 'wall', x: 1680, z: 1560, w: 60, d: 600, y: 92, h: 170, collideH: 800, mat: 'stone' },
    { t: 'wall', x: 2640, z: 1560, w: 60, d: 600, y: 92, h: 170, collideH: 800, mat: 'stone' },
    { t: 'floor', x: 1480, z: 1560, w: 200, d: 680, y: 92, thick: 330, mat: 'dirt', walk: false },
    { t: 'floor', x: 2700, z: 1560, w: 200, d: 680, y: 92, thick: 330, mat: 'dirt', walk: false },
    { t: 'wall', x: 1680, z: 2160, w: 1020, d: 90, y: 92, h: 330, mat: 'facade' },       // 북쪽 성벽
    { t: 'window', x: 1900, z: 2159, y: 300, i: 0.5 }, { t: 'window', x: 2480, z: 2159, y: 300, i: 0.5 },
    { t: 'prop', img: 'deco_gate_portcullis', x: 2190, z: 2157, y: 96, h: 250 },
    { t: 'prop', ...BRAZIER, x: 1790, z: 1630 }, { t: 'prop', ...BRAZIER, x: 2590, z: 1630 },
    { t: 'prop', ...BRAZIER, x: 1790, z: 2100 }, { t: 'prop', ...BRAZIER, x: 2590, z: 2100 },
    { t: 'prop', img: 'prop_gargoyle', x: 1990, z: 2128, h: 150, solid: 34, solidZ: 22 }, { t: 'prop', img: 'prop_gargoyle', x: 2390, z: 2128, h: 150, solid: 34, solidZ: 22, flip: true },
  ],
  spawns: [
    // 길을 따라 11마리
    { kind: 'melee', x: 640, z: 150 }, { kind: 'melee', x: 1080, z: 190 }, { kind: 'ranged', x: 1310, z: 216 },
    { kind: 'melee', x: 1590, z: 100 }, { kind: 'ranged', x: 2130, z: 160 }, { kind: 'melee', x: 2250, z: 90 },
    { kind: 'melee', x: 2190, z: 470 }, { kind: 'ranged', x: 2300, z: 650 }, { kind: 'melee', x: 2100, z: 1000 },
    { kind: 'melee', x: 2280, z: 1180 }, { kind: 'ranged', x: 2190, z: 1420 },
    // 마당 5마리
    { kind: 'melee', x: 1950, z: 1800, yard: true }, { kind: 'melee', x: 2430, z: 1800, yard: true }, { kind: 'melee', x: 2190, z: 2010, yard: true },
    { kind: 'ranged', x: 1880, z: 2070, yard: true }, { kind: 'ranged', x: 2500, z: 2070, yard: true },
  ],
};
