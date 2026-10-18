// 보스 등장·격파 연출 표 (Stage 5 P4a 「보스는 사건이다」, plan §5 P4) — 순수 데이터 (import 없음)
//
//  BOSS_INTRO[bossId] = { style, element, plateColor, dur }
//    style      등장 방식 (world.startBoss → BossReveal 이 보스 그리기에 입히는 변형)
//               'drop'     위에서 떨어져 내려 쿵 (먼지 고리·흔들림)
//               'rise'     땅·물·쇳물 아래에서 솟아오름 (바닥선 아래는 잘라 그린다)
//               'descend'  하늘에서 천천히 내려앉음 (흐릿하게 → 또렷하게)
//               'emerge'   어둠 속에서 걸어 나옴 (검은 연기 + 크기 0.86 → 1)
//               'assemble' 조각(뼈·유리·깃털)이 모여 몸이 됨 (0.4 → 1, 반동)
//               'fade'     유령처럼 깜박이며 드러남
//    element    격파 연출 색·입자 (ELEMENTS 의 키): 터지는 입자, 빛기둥·먹 도장 색
//    plateColor 이름판 띠의 먹 색 (악몽 모드는 이 값 대신 진홍 PLATE_NIGHTMARE)
//    dur        등장 변형 길이 (초). 등장 연출 전체(레터박스 → 등장 → 포효 → 이름판)는 REVEAL.total 이하
//
//  introOf(id, def?) → 행 (없으면 가족 기본값 FAMILY[familyOf(id, def)] — 모르는 보스도 예외 없이)
//  elementOf(id, def?) → ELEMENTS 항목 (모르는 속성은 'blood')
//  가족 = 스테이지 번호: A 1–7장 · B 8–13장 · C 2부 14–17장 · D 2부 18–20장 · E 외전 21장 이후 (data/bosses.js 집계와 같은 구분)

/** 등장 연출 시간표 (초). total ≤ 3.2 (plan §5 P4a), 0.8초부터 건너뛰기 */
export const REVEAL = Object.freeze({
  total: 3.2,        // 등장 연출 전체 상한 (월드 쪽 등장 + 이름판/초상화 카드)
  skipAfter: 0.8,    // 이 시각부터 결정·탭으로 건너뛴다
  letterIn: 0.28,    // 레터박스가 들어오는 시간
  camIn: 0.6,        // camera.cine(boss, 1.15, 0.6)
  camZoom: 1.15,
  start: 0.35,       // 등장 변형이 시작하는 시각 (카메라가 보스 쪽으로 반쯤 왔을 때)
  hold: 0.25,        // 착지(포효) 뒤 이름판까지 쉬는 시간
  card: 1.2,         // 이름판·초상화 카드 길이 (재도전·아케이드·시련·악몽은 이름판만, 1.2초)
  readyWait: 1.5,    // world.bossReady() 를 기다리는 최대 시간 (늦게 받는 보스 대역 PendingBoss)
  letterbox: 0.11,   // 레터박스 두께 (화면 높이 비율)
});

/** 격파 연출 속성: burst = 입자 프리셋 (core/particles.js), mote = 천천히 오르는 알갱이, color = 빛기둥·고리, ink = 먹 도장 테두리 */
export const ELEMENTS = Object.freeze({
  blood:   { burst: 'blood',   burst2: 'bloodmist', mote: 'ember', color: '#ff3a50', glow: '#ff9aa6', ink: '#8e0a1e' },
  soul:    { burst: 'soul',    burst2: 'ecto',      mote: 'soul',  color: '#7dffb0', glow: '#d0ffe6', ink: '#1e6a48' },
  fire:    { burst: 'fire',    burst2: 'ember',     mote: 'ember', color: '#ff7a2a', glow: '#ffd070', ink: '#8a2a08' },
  ice:     { burst: 'ice',     burst2: 'shard',     mote: 'ice',   color: '#9fe8ff', glow: '#eafcff', ink: '#2a5a7a', shardColor: '#cff6ff' },
  water:   { burst: 'water',   burst2: 'soul',      mote: 'soul',  color: '#4ad8e8', glow: '#c8f8ff', ink: '#0e4a5a', moteColor: '#9af0ff' },
  thunder: { burst: 'thunder', burst2: 'spark',     mote: 'spark', color: '#bfe0ff', glow: '#ffffff', ink: '#2a3a6a' },
  arcane:  { burst: 'magic',   burst2: 'paper',     mote: 'magic', color: '#b070ff', glow: '#e8d0ff', ink: '#3a1a6a' },
  void:    { burst: 'dark',    burst2: 'magic',     mote: 'magic', color: '#a050ff', glow: '#e0b8ff', ink: '#2a0a4a' },
  bone:    { burst: 'shard',   burst2: 'soul',      mote: 'soul',  color: '#8affa0', glow: '#e8ffe8', ink: '#2a4a2a', shardColor: '#e8dcc4' },
  brass:   { burst: 'spark',   burst2: 'gravel',    mote: 'ember', color: '#ffb04a', glow: '#ffe8b0', ink: '#6a3a0a', shardColor: '#c8963a' },
  rot:     { burst: 'goo',     burst2: 'smoke',     mote: 'soul',  color: '#9ad040', glow: '#e8ffb0', ink: '#3a4a10', moteColor: '#c8f070' },
  dream:   { burst: 'magic',   burst2: 'bloodmist', mote: 'magic', color: '#d060ff', glow: '#f4c8ff', ink: '#4a0a5a' },
  glass:   { burst: 'ice',     burst2: 'shard',     mote: 'holy',  color: '#dff4ff', glow: '#ffffff', ink: '#4a5a7a', shardColor: '#f4fbff' },
  holy:    { burst: 'holy',    burst2: 'gold',      mote: 'holy',  color: '#fff2b0', glow: '#ffffff', ink: '#7a5a10' },
  feather: { burst: 'feather', burst2: 'blood',     mote: 'ember', color: '#ff4a6a', glow: '#ffb0c0', ink: '#5a0a1a' },
  beast:   { burst: 'spark',   burst2: 'dust',      mote: 'ember', color: '#ffcf6a', glow: '#fff0c0', ink: '#6a4a10' },
});

/** 이름판 기본 먹 색 · 악몽(K2: world.opts.nightmare) 진홍판 */
export const PLATE_DEFAULT = '#1a0810';
export const PLATE_NIGHTMARE = '#7a0618';

/** 가족 기본값 (표에 없는 보스) */
export const FAMILY = Object.freeze({
  A: { style: 'emerge', element: 'blood', plateColor: '#1a0810', dur: 1.0 },
  B: { style: 'rise', element: 'soul', plateColor: '#0e1418', dur: 1.0 },
  C: { style: 'assemble', element: 'void', plateColor: '#140a1e', dur: 1.0 },
  D: { style: 'fade', element: 'dream', plateColor: '#12081a', dur: 1.1 },
  E: { style: 'emerge', element: 'blood', plateColor: '#180a0e', dur: 1.0 },
});

/** 이야기 보스 25명 (s01–s25 보스방). 등장 방식은 각 보스의 _pre 대사·그림과 맞춘다 */
export const BOSS_INTRO = Object.freeze({
  // ── 1부 (A: 1–7장) ──
  b_nightwing:  { style: 'descend',  element: 'blood',   plateColor: '#1e060c', dur: 1.05 },   // 박쥐 떼가 날개 하나로 뭉쳐 내려앉는다
  b_banshee:    { style: 'fade',     element: 'soul',    plateColor: '#06161a', dur: 1.1 },    // 묘지의 통곡 — 깜박이며 드러난다
  b_dullahan:   { style: 'emerge',   element: 'soul',    plateColor: '#0a1020', dur: 1.0 },    // 성문 광장 어둠 속에서 걸어 나온다
  b_crimson:    { style: 'drop',     element: 'fire',    plateColor: '#200806', dur: 0.85 },   // 진홍 갑주가 떨어져 내려 쿵
  b_bonedragon: { style: 'assemble', element: 'bone',    plateColor: '#0c160c', dur: 1.1 },    // 수천 개의 뼈가 서로를 끌어당긴다
  b_grimoire:   { style: 'rise',     element: 'arcane',  plateColor: '#140a22', dur: 1.0 },    // 마도서가 스스로 펼쳐지며 떠오른다
  b_chimera:    { style: 'drop',     element: 'rot',     plateColor: '#101806', dur: 0.85 },   // 깨진 유리관에서 뛰어내린다
  // ── 1부 (B: 8–13장) ──
  b_leviathan:  { style: 'rise',     element: 'water',   plateColor: '#041418', dur: 1.05 },   // 검은 물이 갈라지며 고개를 든다
  b_colossus:   { style: 'rise',     element: 'brass',   plateColor: '#1a1006', dur: 1.1 },    // 시계탑 거인이 삐걱이며 일어선다
  b_frostqueen: { style: 'descend',  element: 'ice',     plateColor: '#0a1622', dur: 1.05 },   // 얼어붙은 첨탑에서 내려앉는다
  b_death:      { style: 'fade',     element: 'soul',    plateColor: '#06140e', dur: 1.1 },    // 종소리와 함께 나타나는 사신
  b_dracula:    { style: 'emerge',   element: 'blood',   plateColor: '#22040a', dur: 1.05 },   // 왕좌의 어둠 속에서 일어선다
  b_chaos:      { style: 'emerge',   element: 'void',    plateColor: '#12061e', dur: 1.1 },    // 형체 없는 어둠이 눈을 뜨며 뭉친다
  // ── 2부 (C: 14–17장) ──
  b_narkissa:   { style: 'assemble', element: 'glass',   plateColor: '#101824', dur: 1.05 },   // 천 개의 거울 조각이 여제가 된다
  b_moloch:     { style: 'rise',     element: 'fire',    plateColor: '#200a04', dur: 1.1 },    // 쇳물의 호수에서 청동 우상이 일어선다
  b_dagon:      { style: 'rise',     element: 'water',   plateColor: '#041816', dur: 1.1 },    // 가라앉은 제단 뒤에서 몸을 일으킨다
  b_ziz:        { style: 'descend',  element: 'thunder', plateColor: '#0a1422', dur: 1.0 },    // 하늘 전체가 날개가 되어 내려온다
  // ── 2부 (D: 18–20장) ──
  b_mara:       { style: 'fade',     element: 'dream',   plateColor: '#16061e', dur: 1.1 },    // 요람이 흔들리며 꿈처럼 드러난다
  b_behemoth:   { style: 'rise',     element: 'rot',     plateColor: '#0e1406', dur: 1.15 },   // 언덕이 꿈틀거리며 일어선다
  b_nihil:      { style: 'fade',     element: 'holy',    plateColor: '#101014', dur: 1.15 },   // 하얀 가면이 공허 속에서 떠오른다
  // ── 외전 (E: 21장 이후) ──
  b_argen:      { style: 'descend',  element: 'void',    plateColor: '#0e0c1e', dur: 1.0 },    // 은빛 용이 둥지 위로 날개를 편다
  b_nemain:     { style: 'drop',     element: 'feather', plateColor: '#1e0610', dur: 0.85 },   // 무너진 종루에서 뛰어내린다
  b_hagen:      { style: 'emerge',   element: 'beast',   plateColor: '#1a1206', dur: 1.0 },    // 모닥불 곁에서 늙은 사냥꾼이 일어선다
  b_bride:      { style: 'emerge',   element: 'blood',   plateColor: '#20060e', dur: 1.0 },    // 장미 제단에서 붉은 드레스가 걸어 나온다
  b_charon:     { style: 'emerge',   element: 'soul',    plateColor: '#0a1410', dur: 1.05 },   // 검은 마차가 소리 없이 멈춘다
  // ── 외전 26장 (1부 외전, 7장 뒤 — CH26-WIRE 로 등록됨) ──
  b_paracel:    { style: 'assemble', element: 'glass',   plateColor: '#141008', dur: 1.15 },   // 플라스크 파편이 모여 연금술사가 된다
});

export const INTRO_STYLES = Object.freeze(['drop', 'rise', 'descend', 'emerge', 'assemble', 'fade']);

/** 보스 가족 'A'..'E': 보스 데이터의 stageId(없으면 'sNN' 이 들어간 id) 번호로 */
export function familyOf(id, def = null) {
  const sid = String(def?.stageId ?? '');
  const m = /s(\d+)/.exec(sid) ?? null;
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(n)) return 'A';
  return n <= 7 ? 'A' : n <= 13 ? 'B' : n <= 17 ? 'C' : n <= 20 ? 'D' : 'E';
}
/** 등장 연출 행 (표에 없으면 가족 기본값; 잘못된 값은 기본값으로 채운다) */
export function introOf(id, def = null) {
  const fam = FAMILY[familyOf(id, def)] ?? FAMILY.A;
  const row = (id && Object.prototype.hasOwnProperty.call(BOSS_INTRO, id)) ? BOSS_INTRO[id] : null;
  if (!row) return fam;
  return {
    style: INTRO_STYLES.includes(row.style) ? row.style : fam.style,
    element: Object.prototype.hasOwnProperty.call(ELEMENTS, row.element) ? row.element : fam.element,
    plateColor: typeof row.plateColor === 'string' ? row.plateColor : fam.plateColor,
    dur: Number.isFinite(row.dur) && row.dur > 0 ? Math.min(row.dur, 1.4) : fam.dur,
  };
}
/** 격파 연출 속성 항목 */
export function elementOf(id, def = null) {
  const k = introOf(id, def).element;
  return ELEMENTS[k] ?? ELEMENTS.blood;
}
