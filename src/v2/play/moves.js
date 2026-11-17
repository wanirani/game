// v2 play — 카엘의 기술표 (GDD §7: 연타 3번 · 셋째는 넓게 / 점프 중 내려베기 / 구른 직후 훑기). docs/v2/PLAY_API.md §4
// 한 줄 = 기술 하나. 시간은 초, 거리는 px. 판정은 영웅이 보는 방향 기준이다(360°).
//   dur      기술 전체 시간            hit   [시작, 끝] 판정이 열려 있는 구간
//   cancel   이 시각부터 다음 타로 넘어갈 수 있다 · free  이 시각부터 이동 · 점프로 끊을 수 있다 (구르기는 판정이 끝나면 언제든)
//   box      { f0, f1, side, y0, y1 }  앞으로 f0…f1, 옆으로 ±side, 높이 y0…y1 (발밑 기준)
//   arc      { r, deg, y0, y1 }        반지름 r 안, 보는 방향 ±deg/2 안 (넓은 베기)
//   step     [t0, t1, 거리]            그 구간에 앞으로 내딛는다 (대상이 가까우면 덜, 멀면 lungeMax 까지 더)
//   clip · lead · tail                 틀 클립 · 판정 전에 보여 줄 준비 동작(클립 초) · 판정 뒤 마무리(클립 초)
//   str      타격 세기 L·M·H·F (src/v2/feel/table.js) · mv 피해 배수 · kb 밀어내는 속도 · stop 경직(초)
const M = (o) => Object.freeze({ kb: [o.kbv ?? 120, 0], hitstop: o.stop ?? 0.05, sfx: 'slash', weapon: 'sword', ...o });

export const MOVES = Object.freeze({
  c1: M({ id: 'c1', kind: 'combo', n: 0, clip: 'atk1', dur: 0.44, hit: [0.13, 0.25], cancel: 0.26, free: 0.36, lead: 0.18, tail: 0.4,
    box: { f0: -10, f1: 106, side: 46, y0: 0, y1: 122 }, step: [0.02, 0.17, 26], str: 'M', mv: 1.0, kbv: 120, stop: 0.045 }),
  c2: M({ id: 'c2', kind: 'combo', n: 1, clip: 'atk2', dur: 0.46, hit: [0.11, 0.27], cancel: 0.28, free: 0.38, lead: 0.14, tail: 0.4,
    box: { f0: -10, f1: 112, side: 54, y0: 0, y1: 122 }, step: [0.02, 0.16, 30], str: 'M', mv: 1.1, kbv: 140, stop: 0.05 }),
  c3: M({ id: 'c3', kind: 'combo', n: 2, clip: 'atk3', dur: 0.74, hit: [0.2, 0.38], cancel: 9, free: 0.58, lead: 0.26, tail: 0.6,
    arc: { r: 132, deg: 300, y0: 0, y1: 130 }, step: [0.04, 0.24, 34], str: 'F', mv: 1.65, kbv: 250, stop: 0.09, sfx: 'slash_heavy' }),
  sweep: M({ id: 'sweep', kind: 'sweep', clip: 'launcher', dur: 0.56, hit: [0.12, 0.27], cancel: 9, free: 0.42, lead: 0.2, tail: 0.5,
    arc: { r: 124, deg: 180, y0: 0, y1: 140 }, step: [0.0, 0.14, 44], str: 'H', mv: 1.35, kbv: 210, stop: 0.07 }),
  plunge: M({ id: 'plunge', kind: 'plunge', clip: 'plunge', dur: 9, hit: [0.06, 9], cancel: 9, free: 9, recover: 0.3, fallV: -520, fallG: 2.1,
    box: { f0: -24, f1: 84, side: 46, y0: -50, y1: 110 }, land: { r: 92, fwd: 18, y0: -10, y1: 90 }, str: 'H', mv: 1.5, kbv: 200, stop: 0.08 }),
});
export const COMBO = Object.freeze([MOVES.c1, MOVES.c2, MOVES.c3]);

/** 영웅 상태 이름 (hero.anim) */
export const HERO_ANIMS = Object.freeze(['idle', 'walk', 'run', 'jump', 'fall', 'land', 'roll', 'attack', 'guard', 'parry', 'block', 'hurt', 'death']);
