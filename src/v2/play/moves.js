// v2 play — 카엘의 기술표 (GDD §7: 연타 3번 · 셋째는 넓게 / 점프 중 내려베기 / 구른 직후 훑기). docs/v2/PLAY_API.md §4
// 한 줄 = 기술 하나. 시간은 초, 거리는 px. 판정은 영웅이 보는 방향 기준이다(360°).
//   dur      기술 전체 시간            hit   [시작, 끝] 판정이 열려 있는 구간
//   cancel   이 시각부터 다음 타로 넘어갈 수 있다 · free  이 시각부터 이동 · 점프로 끊을 수 있다 (구르기는 판정이 끝나면 언제든)
//   box      { f0, f1, side, y0, y1 }  앞으로 f0…f1, 옆으로 ±side, 높이 y0…y1 (발밑 기준)
//   arc      { r, deg, y0, y1 }        반지름 r 안, 보는 방향 ±deg/2 안 (넓은 베기)
//   step     [t0, t1, 거리]            그 구간에 앞으로 내딛는다 (대상이 가까우면 덜, 멀면 lungeMax 까지 더)
//   clip · lead · tail                 틀 클립 · 판정 전에 보여 줄 준비 동작(클립 초) · 판정 뒤 마무리(클립 초)
//   strike   [클립 초, 클립 초]         칼이 몸 앞을 지나는 클립 구간 — 판정 구간(hit)에 겹쳐 튼다. 없으면 클립 자료의 strike (재는 법: node tools/v2/play_cliptrace.mjs <clip>)
//   str      타격 세기 L·M·H·F (규칙이 읽는다: 울림 · 비틀거림) · mv 피해 배수 · kb 밀어내는 속도 · stop 경직(초)
//   feel     손맛의 세기 (장면 · 채찍 · 소리가 읽는 strength; 없으면 str). 연타는 약 → 중 → 끝(L → M → F)으로 올라가고, 모아 휘감기도 끝(F): 멈춤 · 흔들림 · 소리 · 진동이 또렷이 다르다 (src/v2/feel/table.js, docs/v2/SOUND_FEEL.md 16). 규칙의 str 은 그대로다
// 빠르기 조율 (주인: "느린 느낌"): 규칙 시간(dur · hit · cancel · free · step · recover)을 모두 0.78배(= 1.28배 빨리) 했다. 클립 초(strike · lead · tail)는 그대로 → 같은 클립을 더 빨리 튼다 (판정은 여전히 칼이 지나는 구간 위)
const M = (o) => Object.freeze({ kb: [o.kbv ?? 120, 0], hitstop: o.stop ?? 0.05, sfx: 'slash', weapon: 'whip', strength: o.feel ?? o.str, ...o });   // strength = str (장면이 읽는 이름) · weapon = 카엘의 무기는 채찍 비질리아 (장면이 소리 · 타격감 표의 무기로 쓴다)

export const MOVES = Object.freeze({
  c1: M({ id: 'c1', kind: 'combo', n: 0, clip: 'atk1', dur: 0.344, hit: [0.102, 0.195], cancel: 0.203, free: 0.281, lead: 0.18, tail: 0.4,
    box: { f0: -10, f1: 106, side: 46, y0: 0, y1: 122 }, step: [0.016, 0.133, 20], str: 'M', feel: 'L', mv: 1.0, kbv: 120, stop: 0.045 }),
  c2: M({ id: 'c2', kind: 'combo', n: 1, clip: 'atk2', strike: [0.18, 0.37], dur: 0.359, hit: [0.086, 0.211], cancel: 0.219, free: 0.297, lead: 0.14, tail: 0.4,
    box: { f0: -10, f1: 112, side: 54, y0: 0, y1: 122 }, step: [0.016, 0.125, 22], str: 'M', mv: 1.1, kbv: 140, stop: 0.05 }),
  c3: M({ id: 'c3', kind: 'combo', n: 2, clip: 'atk3', strike: [0.55, 0.82], dur: 0.578, hit: [0.156, 0.297], cancel: 9, free: 0.453, lead: 0.26, tail: 0.6,
    arc: { r: 132, deg: 300, y0: 0, y1: 130 }, step: [0.031, 0.188, 26], str: 'F', mv: 1.65, kbv: 250, stop: 0.09, sfx: 'slash_heavy' }),
  sweep: M({ id: 'sweep', kind: 'sweep', clip: 'launcher', strike: [0.55, 0.76], dur: 0.438, hit: [0.094, 0.211], cancel: 9, free: 0.328, lead: 0.2, tail: 0.5,
    arc: { r: 124, deg: 180, y0: 0, y1: 140 }, step: [0.0, 0.109, 36], str: 'H', mv: 1.35, kbv: 210, stop: 0.07 }),
  // 길게 눌러 모았다 놓는 휘감기 (GDD §7): 멀리 뻗는 채찍. 작은 적은 끌어오고 큰 적에게는 끌려간다 (sim._hitEnemy). 피해 · 울림은 모은 정도(hero.whipLv 0.35…1)를 따른다
  whip: M({ id: 'whip', kind: 'whip', clip: 'charged', strike: [0.93, 1.13], dur: 0.484, hit: [0.094, 0.203], cancel: 9, free: 0.391, lead: 0.1, tail: 0.55,
    box: { f0: 10, f1: 250, side: 40, y0: 0, y1: 150 }, str: 'H', feel: 'F', mv: 1.3, kbv: 40, stop: 0.07, weapon: 'whip', reso: 0.3, sfx: 'slash_heavy' }),
  plunge: M({ id: 'plunge', kind: 'plunge', clip: 'plunge', dur: 9, hit: [0.06, 9], cancel: 9, free: 9, recover: 0.234, fallV: -600, fallG: 2.1,
    box: { f0: -24, f1: 84, side: 46, y0: -50, y1: 110 }, land: { r: 92, fwd: 18, y0: -10, y1: 90 }, str: 'H', mv: 1.5, kbv: 200, stop: 0.08 }),
});
export const COMBO = Object.freeze([MOVES.c1, MOVES.c2, MOVES.c3]);

/** 영웅 상태 이름 (hero.anim) */
export const HERO_ANIMS = Object.freeze(['idle', 'walk', 'run', 'turn', 'jump', 'fall', 'land', 'roll', 'attack', 'guard', 'parry', 'block', 'hurt', 'death', 'charge', 'echo', 'ring', 'call', 'hook']);
