// 타격감 소리 시연 대본 — 시험 페이지(tools/v2/sound_view.html)와 검사(tools/v2/sound_check.mjs)가 같은 대본을 쓴다.
//  줄: { t 초, c 호출, a 인자 [, pos {x,y,z}] }.  c = 'swing' | 'hit' | 'play' | 'step' | 'ts'(시간 배속) | 'loop+'/'loop-'(고리 켬/끔, a[0] = 이름) | 'room'
//  (브라우저·node 양쪽에서 import 한다 — 의존 없음. FLAG 값은 src/v2/feel/table.js 와 같다: crit 1 · kill 2 · guard 4 · parry 8 · finisher 16)
const HERO = { x: 0, y: 40, z: 0 }, FOE = { x: 110, y: 50, z: 30 }, FAR = { x: -420, y: 50, z: 900 };

/** 듣는 이(카메라) 기본값 — 시범판 B 의 거리 구간 카메라와 비슷하다: 위치, 보는 방향, 기준 거리 */
export const LISTENER = [0, 300, -700, 0, -0.33, 0.944, 800];

export const DEMOS = {
  // 3연타 + 마무리: 칼 뽑기 → 달려들기 → 베기 M, M(치명타), H → 대검 마무리(느린 화면) → 칼집
  combo: {
    label: '3연타 + 마무리', dur: 4.6, room: 'street',
    ev: [
      { t: 0.00, c: 'play', a: ['weapon.draw'], pos: HERO },
      { t: 0.50, c: 'step', a: [320], pos: HERO }, { t: 0.72, c: 'step', a: [320], pos: HERO },
      { t: 0.92, c: 'swing', a: ['sword', 'M'], pos: HERO }, { t: 1.005, c: 'hit', a: ['sword', 'bone', 'M', 0], pos: FOE },
      { t: 1.32, c: 'swing', a: ['sword', 'M'], pos: HERO }, { t: 1.405, c: 'hit', a: ['sword', 'bone', 'M', 1], pos: FOE },
      { t: 1.78, c: 'swing', a: ['sword', 'H'], pos: HERO }, { t: 1.865, c: 'hit', a: ['sword', 'bone', 'H', 0], pos: FOE },
      { t: 2.30, c: 'play', a: ['foley.cloth'], pos: HERO },
      { t: 2.42, c: 'swing', a: ['great', 'F'], pos: HERO }, { t: 2.56, c: 'hit', a: ['great', 'bone', 'F', 18], pos: FOE },
      { t: 2.74, c: 'ts', a: [0.25] }, { t: 3.10, c: 'ts', a: [1] },
      { t: 3.20, c: 'play', a: ['move.land'], pos: HERO },
      { t: 3.75, c: 'play', a: ['weapon.sheath'], pos: HERO },
    ],
  },
  // 재질 순례: 같은 세기(H)의 한손검으로 살 → 뼈 → 갑옷 → 돌 → 나무 → 영체 → 천, 그리고 막힘·받아치기
  materials: {
    label: '재질 7종 + 막힘 + 받아치기', dur: 6.4, room: 'alley',
    ev: [
      ...['flesh', 'bone', 'armor', 'stone', 'wood', 'ghost', 'cloth'].flatMap((m, i) => [
        { t: 0.1 + i * 0.62, c: 'swing', a: ['sword', 'H'], pos: HERO }, { t: 0.185 + i * 0.62, c: 'hit', a: ['sword', m, 'H', 0], pos: FOE }]),
      { t: 4.55, c: 'swing', a: ['sword', 'M'], pos: HERO }, { t: 4.635, c: 'hit', a: ['sword', 'armor', 'M', 4], pos: FOE },
      { t: 5.3, c: 'hit', a: ['sword', 'armor', 'H', 8], pos: HERO }, { t: 5.42, c: 'ts', a: [0.35] }, { t: 5.7, c: 'ts', a: [1] },
    ],
  },
  // 마법 5원소: 모으기 → 쏘기(+ 날아가는 고리) → 맞음
  spell: {
    label: '마법 5원소', dur: 10.4, room: 'courtyard',
    ev: ['fire', 'ice', 'lightning', 'holy', 'blood'].flatMap((el, i) => {
      const t = 0.1 + i * 2.05;
      return [
        { t, c: 'play', a: [`magic.${el}.charge`], pos: HERO },
        { t: t + 0.86, c: 'play', a: [`magic.${el}.release`], pos: HERO }, { t: t + 0.88, c: 'loop+', a: [`loop.magic.${el}`], pos: HERO },
        { t: t + 1.38, c: 'loop-', a: [`loop.magic.${el}`] }, { t: t + 1.4, c: 'play', a: [`magic.${el}.impact`], pos: FOE },
      ];
    }),
  },
  // 종: 배운 가락 다섯 + 깊은 종
  bells: {
    label: '종 가락 5 + 깊은 종', dur: 20.5, room: 'courtyard',
    ev: ['dawn', 'dusk', 'bloodmoon', 'return', 'still'].map((b, i) => ({ t: 0.1 + i * 3.0, c: 'play', a: [`bell.${b}`] })).concat([{ t: 15.2, c: 'play', a: ['bell.toll'] }]),
  },
  // 적과 세계: 밤거리 바탕 + 횃불 + 해골 덜그럭 → 무너짐, 마법사 주문, 박쥐 (멀리 왼쪽)
  world: {
    label: '적과 세계', dur: 7.6, room: 'hall',
    ev: [
      { t: 0.0, c: 'loop+', a: ['loop.street'] }, { t: 0.1, c: 'play', a: ['world.torch.light'], pos: FOE }, { t: 0.2, c: 'loop+', a: ['loop.torch'], pos: FOE },
      { t: 1.0, c: 'play', a: ['enemy.skel.rattle'], pos: FOE }, { t: 1.7, c: 'play', a: ['enemy.skel.rattle'], pos: FAR },
      { t: 2.4, c: 'play', a: ['enemy.mage.chant'], pos: FAR }, { t: 3.5, c: 'play', a: ['enemy.bat.screech'], pos: FAR }, { t: 3.9, c: 'play', a: ['enemy.bat.flap'], pos: FOE },
      { t: 4.5, c: 'play', a: ['enemy.skel.collapse'], pos: FOE },
      { t: 5.6, c: 'play', a: ['ui.open'] }, { t: 5.9, c: 'play', a: ['ui.move'] }, { t: 6.05, c: 'play', a: ['ui.move'] }, { t: 6.3, c: 'play', a: ['ui.tab'] }, { t: 6.6, c: 'play', a: ['ui.ok'] }, { t: 6.95, c: 'play', a: ['ui.deny'] }, { t: 7.2, c: 'play', a: ['ui.close'] },
      { t: 7.3, c: 'loop-', a: ['loop.torch'] }, { t: 7.3, c: 'loop-', a: ['loop.street'] },
    ],
  },
};

/** 대본 한 줄을 feel(또는 FeelSound) 에 실행한다. loops = 이름 → 고리 번호 (호출부가 Map 을 준다) */
export function runLine(f, e, loops) {
  const a = e.a || [];
  switch (e.c) {
    case 'swing': return f.swing(a[0], a[1], e.pos);
    case 'hit': return f.hit(a[0], a[1], a[2], a[3] || 0, e.pos);
    case 'play': return f.play(a[0], e.pos || null);
    case 'step': return f.step(a[0], e.pos);
    case 'ts': return f.setTimeScale(a[0]);
    case 'room': return f.setRoom(a[0]);
    case 'loop+': { const id = f.loopStart(a[0], e.pos || null); if (id) loops.set(a[0], id); return id; }
    case 'loop-': { const id = loops.get(a[0]); if (id) { f.loopStop(id); loops.delete(a[0]); } return id; }
    default: return null;
  }
}
