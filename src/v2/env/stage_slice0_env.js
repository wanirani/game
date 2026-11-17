// 시범 구간(SLICE0)을 환경 키트로 다시 지은 저작 데이터. 형식: docs/v2/ENV_KIT.md §4 · 해석: build.js compileEnv
// 뼈대(바닥·벽·계단·기둥·소품의 자리와 크기)는 시범판 B 의 stage_slice0.js 와 **같은 숫자**다 → 충돌·길·적이 B 와 같다.
// 달라진 것은 꾸밈뿐: 벽의 kit:{…}, 소품의 mesh:'…', 키트 전용 part(pave·arch·fence·deco).
// 구간(카메라 틀)·적·시작·하늘·안개·빛은 B 의 것을 그대로 가져온다.
import B0 from '../b/stage_slice0.js';

const LAMP = { mesh: 'lamp', h: 196, solid: 9, solidZ: 9, light: { r: 330, i: 1.7, y: 170 } };
const BRAZIER = { mesh: 'brazier', h: 112, solid: 20, light: { r: 380, i: 1.8, y: 90, c: [1, 0.55, 0.22] } };
const W2 = (u, y, o = {}) => ({ u, y, w: 42, h: 62, ...o });   // 보통 창

export default {
  id: 'slice0_env', name: '시범 구간 (꾸민 배경)',
  start: B0.start, goal: B0.goal, sky: B0.sky, fog: B0.fog, light: B0.light, sections: B0.sections, spawns: B0.spawns,
  chunks: [{ id: 'street', z1: 360 }, { id: 'alley', z1: 1500 }, { id: 'yard', z1: Infinity }],   // 메시를 나누는 덩어리 (보이는 것만 그린다)
  parts: [
    // ── 횡 구간: 거리 ──
    { t: 'floor', x: -60, z: 0, w: 1860, d: 260, mat: 'cobble', kit: { strips: [{ z0: 0, z1: 16, mat: 'flags' }] } },
    { t: 'floor', x: 1800, z: 130, w: 160, d: 130, mat: 'cobble' },
    { t: 'floor', x: 1960, z: 0, w: 440, d: 260, mat: 'cobble', kit: { strips: [{ z0: 0, z1: 16, mat: 'flags' }] } },
    { t: 'blocker', x: -60, z: -60, w: 2540, d: 60, y: -400, h: 1200 },
    { t: 'pave', x: -60, z: 240, w: 2040, d: 20, h: 7, kerb: 'F' },                                  // 건물 앞 올린 보도 + 연석 + 도랑
    { t: 'wall', x: -160, z: -60, w: 100, d: 400, h: 300, mat: 'facade', kit: { style: 'rubble', faces: 'R', gates: [{ side: 'R', u: 190, w: 120, h: 200 }], buttress: [{ side: 'R', u: 80, h: 230, d: 18 }, { side: 'R', u: 300, h: 230, d: 18 }], battlement: true } },
    // 길 건너 집 네 채
    { t: 'wall', x: -160, z: 260, w: 600, d: 90, h: 290, mat: 'facade', kit: {   // A: 돌집 2층
      style: 'stone', faces: 'F', base: 7, quoins: true, courses: [150], tint: [1.0, 1.0, 1.04],
      windows: [W2(190, 66, { lit: 0.9, shutters: true }), W2(300, 66), W2(430, 66, { lit: 0.5, shutters: true }), W2(170, 178, { arch: 'round', h: 70 }), W2(290, 178, { arch: 'round', h: 70, lit: 0.6 }), W2(410, 178, { arch: 'round', h: 70 }), W2(530, 178, { arch: 'round', h: 70, lit: 0.4 })],
      doors: [{ u: 530, w: 60, h: 104, arch: 'round', rise: 7 }],
      hang: [{ type: 'banner', u: 365, y: 60, len: 84, w: 34, c: [0.2, 0.26, 0.5] }, { type: 'sconce', u: 480, y: 120 }],
    } },
    { t: 'wall', x: 440, z: 260, w: 470, d: 90, h: 350, mat: 'plaster', kit: {   // B: 목조 3층 (위층 내밀기)
      style: 'timber', faces: 'F', base: 7, storey: 150, jetty: 14, mid: 250, tint: [1.02, 0.98, 0.92],
      windows: [{ u: 250, y: 60, w: 84, h: 64, lit: 0.9, cols: 3, rows: 2 }, W2(395, 66, { shutters: true, shutterTint: [0.56, 0.3, 0.26] }),
        W2(110, 176, { lit: 0.5, frame: 'timber', h: 56 }), W2(235, 176, { frame: 'timber', h: 56 }), W2(360, 176, { lit: 0.7, frame: 'timber', h: 56 }),
        W2(170, 272, { frame: 'timber', h: 50, w: 38 }), W2(300, 272, { lit: 0.45, frame: 'timber', h: 50, w: 38 })],
      doors: [{ u: 75, w: 58, h: 104, rise: 7, tint: [0.5, 0.3, 0.26] }],
      hang: [{ type: 'sign', u: 250, y: 128, w: 78, h: 20 }],
    } },
    { t: 'wall', x: 910, z: 260, w: 500, d: 90, h: 270, mat: 'facade', kit: {   // C: 예배당 (뾰족 아치 창 + 버팀벽)
      style: 'rubble', faces: 'F', base: 7, plinth: 26, courses: [236],
      windows: [{ u: 140, y: 100, w: 46, h: 116, arch: 'point', lit: 0.8, rows: 3 }, { u: 250, y: 100, w: 46, h: 116, arch: 'point', lit: 0.55, rows: 3 }, { u: 440, y: 92, w: 40, h: 104, arch: 'point', rows: 3 }],
      doors: [{ u: 350, w: 66, h: 122, arch: 'point', rise: 7 }],
      buttress: [{ u: 80, h: 220, d: 14 }, { u: 195, h: 220, d: 14 }, { u: 300, h: 220, d: 14 }, { u: 400, h: 220, d: 14 }, { u: 482, h: 220, d: 14 }],
      hang: [{ type: 'banner', u: 482, y: 86, len: 110, w: 30 }],
    } },
    { t: 'wall', x: 1410, z: 260, w: 570, d: 90, h: 330, mat: 'plaster', kit: {   // D: 목조 2층 (회벽 아래층)
      style: 'timber', lower: 'plaster', faces: 'FR', base: 7, storey: 146, jetty: 12, jettySides: 'FR', tint: [0.94, 0.96, 1.0],
      windows: [W2(105, 64, { lit: 0.9, shutters: true, shutterTint: [0.3, 0.36, 0.56] }), W2(350, 64), { u: 480, y: 60, w: 74, h: 64, lit: 0.7, cols: 3, rows: 2 },
        W2(105, 180, { frame: 'timber' }), W2(240, 180, { lit: 0.5, frame: 'timber' }), W2(370, 180, { frame: 'timber' }), W2(495, 180, { lit: 0.6, frame: 'timber' }),
        W2(45, 200, { side: 'R', lit: 0.5, frame: 'timber', w: 36 })],
      doors: [{ u: 230, w: 58, h: 104, arch: 'round', rise: 7 }],
      hang: [{ type: 'sconce', u: 175, y: 116 }, { type: 'sign', side: 'R', u: 45, y: 118, perp: true }],
    } },
    { t: 'roof', x: -160, z: 260, w: 600, d: 90, y: 290, h: 62, kit: { gable: 'ashlar', chimneys: [{ u: 215, t: 0.72 }], dormers: [{ u: 330, lit: 0.6 }, { u: 480 }] } },
    { t: 'roof', x: 440, z: 260, w: 470, d: 90, y: 350, h: 70, kit: { chimneys: [{ u: 390, t: 0.75, h: 40 }], dormers: [{ u: 150, lit: 0.5 }] } },
    { t: 'roof', x: 910, z: 260, w: 500, d: 90, y: 270, h: 58, kit: { gable: 'rubble', chimneys: [{ u: 60, t: 0.8, w: 20, h: 26 }] } },
    { t: 'roof', x: 1410, z: 260, w: 570, d: 90, y: 330, h: 66, kit: { chimneys: [{ u: 150, t: 0.7 }, { u: 455, t: 0.78, w: 22 }], dormers: [{ u: 300, lit: 0.5 }] } },
    // 가로등 2 · 기둥 2 (앞뒤로 지나갈 수 있다)
    { t: 'prop', ...LAMP, x: 430, z: 150 }, { t: 'prop', ...LAMP, x: 1660, z: 66 },
    { t: 'pillar', x: 700, z: 110, r: 24, h: 236 }, { t: 'pillar', x: 1565, z: 196, r: 22, h: 220 },
    // 화면 앞 가장자리 (시차): 가로등 + 쇠 난간. 길을 막지 않는다
    { t: 'prop', ...LAMP, solid: 0, x: 1010, z: 7 }, { t: 'prop', ...LAMP, solid: 0, x: 2345, z: 7 },
    { t: 'fence', kind: 'iron', x0: 196, z0: 5, x1: 464, z1: 5, h: 44 }, { t: 'fence', kind: 'iron', x0: 1346, z0: 5, x1: 1614, z1: 5, h: 44 },
    // 돌 단상 300×120×72 + 왼쪽 계단
    { t: 'block', x: 900, z: 130, w: 300, d: 120, h: 72, mat: 'stone', kit: { balustrade: true } },
    { t: 'stairs', x: 804, z: 150, w: 96, d: 84, h: 72, dir: 'x+', steps: 6, mat: 'stone', kit: { cheeks: 'K' } },
    // 나무 상자 장애물 + 소품
    { t: 'block', x: 1392, z: 92, w: 74, d: 74, h: 64, mat: 'wood', mesh: 'crate' },
    { t: 'prop', mesh: 'barrel', x: 1500, z: 214, h: 78, solid: 24 },
    { t: 'prop', mesh: 'cart', x: 250, z: 226, h: 104, solid: 70, solidZ: 22 },
    { t: 'prop', mesh: 'hay', x: 585, z: 236, h: 62, solid: 34, solidZ: 16 },
    { t: 'prop', mesh: 'well', x: 1255, z: 44, h: 132, solid: 46, solidZ: 30 },
    { t: 'prop', mesh: 'crate', x: 2060, z: 236, h: 62, solid: 30, solidZ: 18 },
    { t: 'prop', mesh: 'stall', x: 700, z: 237, h: 130, w: 140, solid: 72, solidZ: 23 },             // 새로 놓은 가판대 (벽에 붙여 길을 막지 않는다)
    { t: 'deco', mesh: 'barrel', x: 2084, z: 250, h: 60 }, { t: 'deco', mesh: 'crate', x: 2052, z: 232, y: 62, h: 40 },
    // ── 모퉁이 + 종 구간: 골목 ──
    { t: 'wall', x: 2400, z: -60, w: 90, d: 1060, h: 450, mat: 'plaster', kit: {   // 동쪽 긴 집 (거리 끝 + 골목 오른쪽) — 보이는 면은 L (u = 1000 − z)
      style: 'timber', faces: 'L', storey: 216, jetty: 10, jettySides: 'L', mid: 330, cornice: true, tint: [1.0, 0.95, 0.9],
      windows: [{ side: 'L', u: 380, y: 88, w: 44, h: 74 }, { side: 'L', u: 520, y: 88, w: 44, h: 74, lit: 0.9 }, { side: 'L', u: 668, y: 88, w: 44, h: 74, shutters: true },
        { side: 'L', u: 870, y: 78, w: 62, h: 96, arch: 'round', lit: 0.8, cols: 2, rows: 2 }, { side: 'L', u: 990, y: 88, w: 40, h: 70 },
        ...[60, 200, 340, 480, 620, 820, 940].map((u, i) => ({ side: 'L', u, y: 252, w: 40, h: 62, frame: 'timber', lit: [0.6, 0, 0.5, 0, 0.7, 0, 0.6][i] })),
        ...[130, 410, 690, 880].map((u, i) => ({ side: 'L', u, y: 352, w: 36, h: 52, frame: 'timber', lit: [0, 0.4, 0, 0.5][i] }))],
      doors: [{ side: 'L', u: 596, w: 60, h: 108, arch: 'round' }],
      hang: [{ type: 'sign', side: 'L', u: 455, y: 138, perp: true, c: [0.16, 0.3, 0.2] }, { type: 'sconce', side: 'L', u: 296, y: 176 }, { type: 'banner', side: 'L', u: 760, y: 96, len: 100, w: 36 }],
    } },
    { t: 'wall', x: 1890, z: 350, w: 90, d: 650, h: 450, mat: 'facade', kit: {   // 골목 왼쪽 돌벽 — 보이는 면은 R (u = z − 350)
      style: 'stone', faces: 'R', courses: [222], quoins: true,
      windows: [{ side: 'R', u: 62, y: 92, w: 40, h: 84, arch: 'point', rows: 2 }, { side: 'R', u: 200, y: 92, w: 40, h: 84, arch: 'point', lit: 0.7, rows: 2 },
        ...[130, 290, 450, 585].map((u, i) => ({ side: 'R', u, y: 258, w: 38, h: 70, arch: 'round', lit: [0.5, 0.6, 0, 0.4][i] }))],
      buttress: [{ side: 'R', u: 8, h: 250, d: 16, w: 30 }, { side: 'R', u: 270, h: 250, d: 16, w: 30 }, { side: 'R', u: 540, h: 300, d: 16, w: 30 }],
      hang: [{ type: 'sign', side: 'R', u: 120, y: 136, perp: true }, { type: 'banner', side: 'R', u: 400, y: 190, len: 110, w: 38, c: [0.2, 0.26, 0.5] }],
    } },
    { t: 'floor', x: 1980, z: 260, w: 420, d: 440, mat: 'cobble', kit: { mat: 'slabs', strips: [{ x0: 0, x1: 54, mat: 'flags' }, { x0: 366, x1: 420, mat: 'flags' }] } },   // 골목 바닥은 v1 의 손그림 판석
    { t: 'stairs', x: 1980, z: 700, w: 420, d: 200, h: 96, dir: 'z+', steps: 8, mat: 'stone', kit: { cheeks: 'LR' } },
    { t: 'floor', x: 1980, z: 900, w: 420, d: 660, y: 96, thick: 330, mat: 'cobble', kit: { mat: 'slabs', strips: [{ x0: 0, x1: 54, mat: 'flags' }, { x0: 366, x1: 420, mat: 'flags' }] } },
    { t: 'arch', x: 1980, z: 560, w: 420, d: 30, y: 338, rise: 34, h: 84 },                          // 골목 위 아치 다리 (카메라 길보다 높게)
    { t: 'prop', mesh: 'barrel', x: 2016, z: 420, h: 78, solid: 24 }, { t: 'prop', mesh: 'crate', x: 2364, z: 540, h: 66, solid: 28, solidZ: 20 },
    { t: 'prop', mesh: 'barrel', x: 2366, z: 600, h: 74, solid: 22 },
    { t: 'prop', ...LAMP, x: 2012, z: 668 }, { t: 'prop', ...LAMP, x: 2368, z: 940 },
    // 높은 벽이 끝난 뒤: 낮은 담(갓돌 + 쇠 난간) + 양옆 묘지 뜰
    { t: 'wall', x: 1936, z: 1000, w: 44, d: 560, y: 96, h: 52, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FR', coping: true, rail: 'R', piers: 187 } },
    { t: 'wall', x: 2400, z: 1000, w: 44, d: 560, y: 96, h: 52, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'FL', coping: true, rail: 'L', piers: 187 } },
    { t: 'floor', x: 1480, z: 1000, w: 456, d: 560, y: 92, thick: 330, mat: 'dirt', walk: false, kit: { strips: [{ x0: 300, x1: 456, z0: 150, z1: 420, mat: 'moss' }] } },
    { t: 'floor', x: 2444, z: 1000, w: 456, d: 560, y: 92, thick: 330, mat: 'dirt', walk: false, kit: { strips: [{ x0: 0, x1: 170, z0: 200, z1: 470, mat: 'moss' }] } },
    { t: 'wall', x: 1400, z: 1000, w: 80, d: 1240, y: 92, h: 250, mat: 'facade', kit: { style: 'rubble', faces: 'R', battlement: true, buttress: [220, 520, 820, 1120].map((u) => ({ side: 'R', u, h: 200, d: 20 })) } },
    { t: 'wall', x: 2900, z: 1000, w: 80, d: 1240, y: 92, h: 250, mat: 'facade', kit: { style: 'rubble', faces: 'L', battlement: true, buttress: [120, 420, 720, 1020].map((u) => ({ side: 'L', u, h: 200, d: 20 })) } },
    // 천사상도 그림판으로 남긴다: 키트의 3D 석상(PROPS.statue, 두건 쓴 수호자)은 가까이서 덩어리로만 읽혀 그림보다 못했다 (보기 도구의 늘어놓기에서 볼 수 있다)
    { t: 'prop', img: 'prop_statue', x: 2034, z: 1190, h: 210, solid: 26 }, { t: 'prop', img: 'prop_statue', x: 2346, z: 1190, h: 210, solid: 26, flip: true },
    { t: 'deco', mesh: 'tree', x: 1760, z: 1230, y: 92, h: 330 }, { t: 'deco', mesh: 'tree', x: 2650, z: 1360, y: 92, h: 300, flip: true },
    { t: 'deco', mesh: 'tree', x: 1640, z: 1450, y: 92, h: 280, flip: true }, { t: 'deco', mesh: 'tree', x: 2790, z: 1130, y: 92, h: 250 },
    { t: 'fence', kind: 'wood', x0: 1700, z0: 1080, x1: 1900, z1: 1080, y: 92, h: 50 }, { t: 'fence', kind: 'wood', x0: 2520, z0: 1120, x1: 2720, z1: 1120, y: 92, h: 50 },
    { t: 'deco', mesh: 'tomb', x: 2560, z: 1260, y: 92, h: 90 }, { t: 'deco', mesh: 'tomb', x: 2640, z: 1250, y: 92, h: 76, cross: true }, { t: 'deco', mesh: 'tomb', x: 2500, z: 1400, y: 92, h: 70 },
    { t: 'deco', mesh: 'tomb', x: 1820, z: 1400, y: 92, h: 90 }, { t: 'deco', mesh: 'tomb', x: 1740, z: 1380, y: 92, h: 80, cross: true }, { t: 'deco', mesh: 'tomb', x: 1880, z: 1290, y: 92, h: 72 },
    { t: 'deco', mesh: 'fountain', x: 1640, z: 1180, y: 92 },
    { t: 'prop', ...LAMP, x: 2014, z: 1420 },
    // ── 마당 900×600 ──
    { t: 'floor', x: 1740, z: 1560, w: 900, d: 600, y: 96, thick: 330, mat: 'dirt', kit: { strips: [{ x0: 380, x1: 520, mat: 'flags' }, { z0: 250, z1: 350, mat: 'flags' }, { z0: 0, z1: 26, mat: 'flags' }, { z0: 574, z1: 600, mat: 'flags' }, { x0: 0, x1: 26, mat: 'flags' }, { x0: 874, x1: 900, mat: 'flags' }] } },
    { t: 'wall', x: 1480, z: 1500, w: 456, d: 60, y: 92, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'F', coping: true, rail: 'F', piers: 228 } },
    { t: 'wall', x: 2444, z: 1500, w: 456, d: 60, y: 92, h: 56, collideH: 800, mat: 'stone', kit: { style: 'low', faces: 'F', coping: true, rail: 'F', piers: 228 } },
    { t: 'wall', x: 1680, z: 1560, w: 60, d: 600, y: 92, h: 170, collideH: 800, mat: 'stone', kit: { style: 'stone', faces: 'FR', plinth: 22, cornice: false, coping: true, battlement: true, buttress: [150, 450].map((u) => ({ side: 'R', u, h: 130, d: 14, w: 30 })), hang: [{ type: 'banner', side: 'R', u: 300, y: 40, len: 100, w: 40 }] } },
    { t: 'wall', x: 2640, z: 1560, w: 60, d: 600, y: 92, h: 170, collideH: 800, mat: 'stone', kit: { style: 'stone', faces: 'FL', plinth: 22, cornice: false, coping: true, battlement: true, buttress: [150, 450].map((u) => ({ side: 'L', u, h: 130, d: 14, w: 30 })), hang: [{ type: 'banner', side: 'L', u: 300, y: 40, len: 100, w: 40 }] } },
    { t: 'floor', x: 1480, z: 1560, w: 200, d: 680, y: 92, thick: 330, mat: 'dirt', walk: false },
    { t: 'floor', x: 2700, z: 1560, w: 200, d: 680, y: 92, thick: 330, mat: 'dirt', walk: false },
    { t: 'wall', x: 1680, z: 2160, w: 1020, d: 90, y: 92, h: 330, mat: 'facade', kit: {   // 북쪽 성벽 + 성문
      style: 'stone', faces: 'F', base: 4, plinth: 34, courses: [262], cornice: false, battlement: true,
      gates: [{ u: 510, w: 150, h: 236 }],
      windows: [{ u: 220, y: 176, w: 22, h: 70, arch: 'point', lit: 0.5, cols: 1, rows: 1 }, { u: 800, y: 176, w: 22, h: 70, arch: 'point', lit: 0.5, cols: 1, rows: 1 }, { u: 100, y: 176, w: 22, h: 70, arch: 'point', cols: 1, rows: 1 }, { u: 920, y: 176, w: 22, h: 70, arch: 'point', cols: 1, rows: 1 }],
      buttress: [{ u: 160, h: 250, d: 22, w: 40 }, { u: 860, h: 250, d: 22, w: 40 }],
      hang: [{ type: 'banner', u: 365, y: 100, len: 130, w: 46 }, { type: 'banner', u: 655, y: 100, len: 130, w: 46 }],
    } },
    { t: 'prop', ...BRAZIER, x: 1790, z: 1630 }, { t: 'prop', ...BRAZIER, x: 2590, z: 1630 },
    { t: 'prop', ...BRAZIER, x: 1790, z: 2100 }, { t: 'prop', ...BRAZIER, x: 2590, z: 2100 },
    // 가고일은 그림판으로 남긴다 (손으로 짠 저폴리로는 그림보다 못하다 — ENV_KIT.md §7)
    { t: 'prop', img: 'prop_gargoyle', x: 1990, z: 2128, h: 150, solid: 34, solidZ: 22 }, { t: 'prop', img: 'prop_gargoyle', x: 2390, z: 2128, h: 150, solid: 34, solidZ: 22, flip: true },
  ],
  // 바닥에 붙는 반투명 얼룩 (이끼 · 물웅덩이 · 때) — 그리기 한 번에 묶인다
  decals: [
    { k: 'puddle', x: 520, z: 96, rx: 62, rz: 30 }, { k: 'puddle', x: 1150, z: 70, rx: 46, rz: 24 }, { k: 'puddle', x: 1720, z: 200, rx: 54, rz: 26 }, { k: 'puddle', x: 2170, z: 110, rx: 70, rz: 34 },
    { k: 'puddle', x: 2120, z: 520, rx: 44, rz: 40 }, { k: 'puddle', x: 2260, z: 1130, y: 96, rx: 50, rz: 46 }, { k: 'puddle', x: 2040, z: 1760, y: 96, rx: 80, rz: 44 }, { k: 'puddle', x: 2400, z: 1960, y: 96, rx: 66, rz: 38 },
    { k: 'moss', x: 150, z: 214, rx: 90, rz: 30 }, { k: 'moss', x: 860, z: 226, rx: 80, rz: 26 }, { k: 'moss', x: 1300, z: 226, rx: 100, rz: 26 }, { k: 'moss', x: 1900, z: 222, rx: 70, rz: 30 }, { k: 'moss', x: 990, z: 30, rx: 110, rz: 34 },
    { k: 'moss', x: 2020, z: 470, rx: 40, rz: 90 }, { k: 'moss', x: 2372, z: 380, rx: 36, rz: 100 }, { k: 'moss', x: 2030, z: 1090, y: 96, rx: 44, rz: 110 }, { k: 'moss', x: 2360, z: 1360, y: 96, rx: 44, rz: 120 },
    { k: 'moss', x: 1800, z: 1600, y: 96, rx: 120, rz: 50 }, { k: 'moss', x: 2560, z: 2110, y: 96, rx: 110, rz: 50 }, { k: 'moss', x: 1990, z: 2130, y: 96, rx: 130, rz: 40 },
    { k: 'stain', x: 700, z: 110, rx: 70, rz: 50 }, { k: 'stain', x: 1429, z: 124, rx: 80, rz: 60 }, { k: 'stain', x: 300, z: 150, rx: 120, rz: 60 }, { k: 'stain', x: 1560, z: 130, rx: 110, rz: 50 },
    { k: 'stain', x: 2190, z: 330, rx: 130, rz: 70 }, { k: 'stain', x: 2190, z: 1300, y: 96, rx: 110, rz: 120 }, { k: 'stain', x: 2190, z: 1860, y: 96, rx: 190, rz: 120 }, { k: 'stain', x: 2190, z: 2120, y: 96, rx: 150, rz: 46 },
  ],
};
