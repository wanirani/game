// 타격감 표 (v2 · 3D 판) — 소리 층·시각·진동·경직·흔들림·줌의 **단일 기준**. 순수 데이터 + 순수 함수 (node 에서도 돈다, import 없음).
//  소리 쪽(sound.js)이 이 표를 읽는다. 효과 쪽(src/v2/fx)은 아직 자기 프리셋 값을 쓴다 — 둘을 잇는 다리는 fxbridge.js, 값 비교는 docs/v2/FX.md §11.3. 설명·숫자 표: docs/v2/SOUND_FEEL.md
//
//  층(layer) = { k, n, at, g, p, pv, gv, sv, q }
//    k  'o' v1 고급 효과음 샘플 (assets/audio/sfx_v2, 이름 n) · 'n' v2 새 샘플 (assets/v2/audio) · 's' 합성 층 (sound.js SYN[n])
//    at 시작 시각(초, 타격 순간 = 0) · g 음량 · p 피치(재생 속도) · pv/gv 무작위 흔들림(±비율) · sv 시작 위치 흔들림(초)
//    q  이 층이 울리는 최소 품질 (0 낮음부터 · 1 보통부터 · 2 높음만) — 휴대폰에서는 층 수가 준다
//  역할: 휘두름(whoosh, 타격 전) → 순간음(trans) → 몸통(body) → 꼬리(tail: 울림·뼈·천·돌)
const L = (k, n, at = 0, g = 1, p = 1, q = 0, x) => Object.freeze({ k, n, at, g, p, q, pv: 0.045, gv: 0.08, sv: 0, ...x });
const o = (n, at, g, p, q, x) => L('o', n, at, g, p, q, x);
const n = (nm, at, g, p, q, x) => L('n', nm, at, g, p, q, { sv: nm === 'cloth' || nm === 'debris' || nm === 'gear' ? 0.012 : 0, ...x });
const s = (nm, at, g, p, q, x) => L('s', nm, at, g, p, q, x);

/** 품질 단계 이름 → 번호 */
export const QUALITY = Object.freeze({ low: 0, medium: 1, high: 2 });

// ───────────────────────────── 세기 ─────────────────────────────
// stop 경직(초, 60·120 Hz 공통) · shake 흔들림(트라우마 0–1 더하기) · kick 카메라 밀림(월드 단위, 타격 방향) · zoom 줌 배율·시간
// duck [음악 낮춤 0–1, 초] · gain 소리 크기 · tailAt 꼬리 층을 늦추는 시간(경직이 풀릴 때 울림이 피어나게) · haptic 진동 이름
export const STRENGTH = Object.freeze({
  L: Object.freeze({ id: 'L', stop: 0.045, shake: 0.10, kick: 3, zoom: 1, zoomT: 0, duck: null, gain: 1.0, tailAt: 0.02, haptic: 'hitL' }),
  M: Object.freeze({ id: 'M', stop: 0.067, shake: 0.16, kick: 5, zoom: 1, zoomT: 0, duck: null, gain: 1.0, tailAt: 0.03, haptic: 'hitM' }),
  H: Object.freeze({ id: 'H', stop: 0.100, shake: 0.26, kick: 9, zoom: 1.02, zoomT: 0.14, duck: Object.freeze([0.3, 0.35]), gain: 1.04, tailAt: 0.05, haptic: 'hitH' }),
  F: Object.freeze({ id: 'F', stop: 0.133, shake: 0.36, kick: 13, zoom: 1.035, zoomT: 0.18, duck: Object.freeze([0.45, 0.5]), gain: 0.98, tailAt: 0.07, haptic: 'hitF' }),
});
export const STRENGTHS = Object.freeze(Object.keys(STRENGTH));

// ───────────────────────────── 무기 ─────────────────────────────
// whoosh[세기] = 휘두름 층 (feel.swing 이 낸다) · lead = 휘두름 시작 → 닿는 순간(초): 애니메이션이 이만큼 먼저 swing 을 부르면 바람 소리 꼭대기가 타격에 맞는다
// trans[세기] = 타격 순간음 · cut = 베는 무기(살·천 재질에서 베는 소리가 더해짐) · stopK 경직 배율
const SW = (name, p = 1, g = 1) => ({ L: [o(name, 0, 0.5 * g, 1.1 * p)], M: [o(name, 0, 0.62 * g, p)], H: [o(name, 0, 0.75 * g, 0.92 * p), s('air', 0, 0.3, 0.9, 1)], F: [o('slash_heavy', 0, 0.7 * g, 0.84 * p), s('air', 0, 0.42, 0.75, 1), n('cloth', 0.03, 0.28, 0.9, 2)] });
export const WEAPON = Object.freeze({
  sword: { label: '한손검', cut: true, stopK: 1, lead: 0.085, whoosh: SW('slash'),
    trans: { L: [o('hit', 0, 0.7, 1.12)], M: [o('hit', 0, 0.85, 1.02), s('snap', 0, 0.28, 1, 1)], H: [o('hit_heavy', 0, 0.82, 1.03), s('snap', 0, 0.36)], F: [o('hit_heavy', 0, 0.95, 0.94), s('snap', 0, 0.42), o('impact_crack', 0.012, 0.55, 1, 1)] } },
  great: { label: '대검', cut: true, stopK: 1.25, lead: 0.14, whoosh: SW('slash_heavy', 0.86, 1.1),
    trans: { L: [o('hit', 0, 0.8, 0.94)], M: [o('hit_heavy', 0, 0.8, 0.95)], H: [o('hit_heavy', 0, 0.95, 0.86), s('snap', 0, 0.3)], F: [o('hit_heavy', 0, 1.05, 0.78), o('impact_crack', 0.014, 0.7, 0.9), s('snap', 0, 0.36)] } },
  dagger: { label: '단검', cut: true, stopK: 0.8, lead: 0.05, whoosh: SW('dagger', 1.05, 0.9),
    trans: { L: [o('hit', 0, 0.6, 1.3)], M: [o('hit', 0, 0.72, 1.2), s('snap', 0, 0.3, 1.3, 1)], H: [o('hit', 0, 0.85, 1.1), s('snap', 0, 0.38, 1.2)], F: [o('hit_heavy', 0, 0.85, 1.1), s('snap', 0, 0.44, 1.2), o('crit', 0.008, 0.4, 1.05, 1)] } },
  whip: { label: '채찍', cut: false, stopK: 0.9, lead: 0.11, whoosh: { L: [o('whip', 0, 0.55, 1.08)], M: [o('whip', 0, 0.68)], H: [o('whip', 0, 0.8, 0.94), s('air', 0, 0.26, 1.2, 1)], F: [o('whip', 0, 0.9, 0.86), s('air', 0, 0.36, 1, 1)] },
    trans: { L: [o('whip_crack', 0, 0.5, 1.1)], M: [o('whip_crack', 0, 0.65), o('hit', 0.004, 0.5, 1.1, 1)], H: [o('whip_crack', 0, 0.8, 0.95), o('hit', 0.004, 0.7)], F: [o('whip_crack', 0, 0.95, 0.9), o('hit_heavy', 0.004, 0.8), s('snap', 0, 0.4)] } },
  blunt: { label: '둔기', cut: false, stopK: 1.3, lead: 0.15, whoosh: SW('axe', 0.9, 1),
    trans: { L: [o('hit', 0, 0.75, 0.86)], M: [o('hit_heavy', 0, 0.78, 0.9)], H: [o('hit_heavy', 0, 0.95, 0.8), o('down_hit', 0.006, 0.5, 0.9, 1)], F: [o('hit_heavy', 0, 1.05, 0.72), o('ground_bounce', 0.008, 0.7, 0.85), o('impact_crack', 0.016, 0.6, 0.85, 1)] } },
  arrow: { label: '화살', cut: true, stopK: 0.6, lead: 0, whoosh: { L: [o('dagger', 0, 0.45, 1.25)], M: [o('dagger', 0, 0.55, 1.15)], H: [o('dagger', 0, 0.65, 1.05)], F: [o('dagger', 0, 0.75, 0.95), s('air', 0, 0.3, 1.4, 1)] },
    trans: { L: [o('hit', 0, 0.55, 1.4)], M: [o('hit', 0, 0.68, 1.3)], H: [o('hit', 0, 0.8, 1.2), s('snap', 0, 0.3, 1.3)], F: [o('hit_heavy', 0, 0.8, 1.15), s('snap', 0, 0.4, 1.3)] } },
});
export const WEAPONS = Object.freeze(Object.keys(WEAPON));

// ───────────────────────────── 재질 ─────────────────────────────
// body = 몸통 층, tail = 꼬리 층 (세기 M 부터, tailAt 만큼 늦춰 울린다), cutx = 베는 무기일 때 더하는 층
// stopK 경직 배율 (단단할수록 길게) · spark 불티 종류(효과 쪽 힌트) · die = 마지막 일격 때 더하는 층
export const MATERIAL = Object.freeze({
  flesh: { label: '살', stopK: 1, spark: 'blood', body: [o('hit_flesh', 0.004, 0.8), s('thud', 0, 0.5, 1, 1)], tail: [n('cloth', 0, 0.2, 1.1, 2)], cutx: [o('slash', 0, 0.3, 1.25, 1)], die: [o('enemy_die', 0.03, 0.7)] },
  bone: { label: '뼈', stopK: 1.05, spark: 'bone', body: [o('hit_bone', 0.003, 1.0), s('knock', 0, 0.35, 1.2, 1)], tail: [o('bone_rattle', 0, 0.55, 1.05), o('bone_rattle', 0.07, 0.3, 1.3, 2)], cutx: [], die: [o('enemy_die_bone', 0.03, 0.85), o('bone_rattle', 0.16, 0.5, 0.9, 1), n('debris', 0.1, 0.3, 1.3, 2)] },
  armor: { label: '갑옷', stopK: 1.2, spark: 'spark', body: [o('clang', 0, 0.9), s('knock', 0, 0.3, 0.8, 1)], tail: [n('ring', 0, 0.42), o('clang', 0.05, 0.25, 1.4, 2)], cutx: [], die: [o('enemy_die', 0.03, 0.6), o('clang', 0.12, 0.5, 0.8), n('ring', 0.12, 0.35, 0.85, 1)] },
  stone: { label: '돌', stopK: 1.25, spark: 'dust', body: [o('hit_stone', 0, 0.85), s('thud', 0, 0.45, 0.8, 1)], tail: [n('debris', 0, 0.5), n('debris', 0.09, 0.25, 0.8, 2)], cutx: [], die: [o('enemy_die_stone', 0.03, 0.85), n('debris', 0.08, 0.6, 0.75)] },
  wood: { label: '나무', stopK: 0.95, spark: 'splinter', body: [o('step_wood', 0, 2.0, 0.7), s('knock', 0, 0.5, 0.9)], tail: [n('debris', 0, 0.22, 1.5, 1)], cutx: [], die: [o('break_wall', 0.02, 0.6, 1.2), n('debris', 0.06, 0.4, 1.2)] },
  ghost: { label: '영체', stopK: 0.7, spark: 'wisp', body: [o('hit_ghost', 0, 0.9)], tail: [s('wisp', 0, 0.3, 1, 1)], cutx: [], die: [o('enemy_die_ghost', 0.03, 0.85)] },
  cloth: { label: '천', stopK: 0.9, spark: 'thread', body: [n('cloth', 0, 0.75, 0.9), o('hit_flesh', 0.004, 0.55, 1.1), s('thud', 0, 0.3, 1.1, 1)], tail: [n('cloth', 0.02, 0.35, 1.2, 1)], cutx: [o('slash', 0, 0.28, 1.35, 1)], die: [o('enemy_die', 0.03, 0.7), n('cloth', 0.08, 0.5, 0.75)] },
});
export const MATERIALS = Object.freeze(Object.keys(MATERIAL));

// ───────────────────────────── 덧붙임 (치명타·막힘·받아치기·마무리) ─────────────────────────────
// add 더할 층 · stop/shake/zoom 은 세기 값에 더하거나(＋) 바꾼다(=) · slow [실시간 초, 배속] · only = 몸통·꼬리 대신 이 층만
export const MOD = Object.freeze({
  crit: { add: [o('crit', 0, 0.55), s('snap', 0, 0.3, 1.5, 1)], stopAdd: 0.033, shakeAdd: 0.08, zoom: 1.03, zoomT: 0.16, gain: 1.0, haptic: 'crit' },
  kill: { stopAdd: 0.05, shakeAdd: 0.06, gain: 1.04 },
  // 막힘: 적의 방패·가드에 막혔다 — 몸통 없이 쇳소리, 경직은 짧고 딱딱하게
  guard: { only: [o('clang', 0, 0.95, 0.92), o('knight_guard', 0.004, 0.5, 1, 1), s('knock', 0, 0.4, 0.7), n('ring', 0.03, 0.3, 1.1, 1)], stop: 0.05, shake: 0.12, kick: -4, zoom: 1, gain: 0.95, haptic: 'guard' },
  // 받아치기: 플레이어의 완벽한 막기 — 맑은 울림 + 짧은 느린 화면
  parry: { only: [o('counter', 0, 0.9), o('clang', 0, 0.8, 1.25), n('ring', 0.02, 0.6, 1.2), o('impact_frame', 0, 0.5, 1, 1), s('snap', 0, 0.45, 1.4)], stop: 0.12, shake: 0.2, kick: 0, zoom: 1.05, zoomT: 0.25, slow: Object.freeze([0.28, 0.35]), duck: Object.freeze([0.5, 0.7]), gain: 1.05, haptic: 'parry', big: true },
  // 마무리 일격: 방의 마지막 적·보스 — 깊은 쿵 + 느린 화면 + 음악이 물러남
  finisher: { add: [s('drop', 0, 0.6), o('kill_slowmo', 0.02, 0.6), n('ring', 0.09, 0.3, 0.7, 2)], stop: 0.18, shakeAdd: 0.2, kick: 16, zoom: 1.08, zoomT: 0.4, slow: Object.freeze([0.36, 0.25]), duck: Object.freeze([0.5, 1.0]), gain: 0.74, haptic: 'finisher', big: true },
});
/** 경직 상한 (초): 보통 타격 · 큰 순간(마무리 일격·받아치기). 효과 쪽은 여기에 '1초 창에 합계 0.4초' 상한(v1 feel §4.1)을 더 건다 */
export const STOP_MAX = 0.2, STOP_MAX_BIG = 0.25;
/** flags 비트 */
export const FLAG = Object.freeze({ crit: 1, kill: 2, guard: 4, parry: 8, finisher: 16 });

// ───────────────────────────── 진동 ─────────────────────────────
// pad [강(저음 모터), 약(고음 모터), ms] · phone = navigator.vibrate 값 (ms | [진동, 쉼, …] | 0 = 없음). 세기 설정(vibeLevel)·60ms 제한은 core/haptics.js 가 맡는다
export const HAPTIC = Object.freeze({
  hitL: { pad: [0, 0.25, 40], phone: 5 }, hitM: { pad: [0.1, 0.4, 60], phone: 8 }, hitH: { pad: [0.35, 0.6, 90], phone: 15 }, hitF: { pad: [0.6, 0.8, 140], phone: [18, 22, 30] },
  crit: { pad: [0.25, 0.75, 80], phone: [10, 18, 14] }, guard: { pad: [0.5, 0.15, 55], phone: 10 }, parry: { pad: [0.2, 0.95, 120], phone: [10, 28, 26] },
  finisher: { pad: [1, 1, 320], phone: [32, 40, 80] }, hurt: { pad: [0.55, 0.25, 140], phone: 30 },
  dash: { pad: [0, 0.2, 35], phone: 0 }, land: { pad: [0.15, 0.1, 40], phone: 0 }, landHeavy: { pad: [0.45, 0.2, 100], phone: 14 },
  cast: { pad: [0.1, 0.45, 70], phone: 10 }, magicHit: { pad: [0.7, 0.6, 180], phone: [24, 20, 36] }, zap: { pad: [0.2, 0.9, 90], phone: [8, 12, 8, 12, 16] },
  chime: { pad: [0, 0.3, 50], phone: 8 }, toll: { pad: [0.9, 0.35, 480], phone: [60, 50, 120] }, ui: { pad: [0, 0, 0], phone: 0 },
  breakL: { pad: [0.05, 0.3, 45], phone: 6 },   // BREAK: a jar, crate or barrel breaking — lighter than the lightest blow that lands on an enemy (hitM: 8 ms)
  // CROSSING (the bell crossing): one heartbeat of the passage, the second toll on the far side, the dull toll of a refusal
  crossBeat: { pad: [0.22, 0.1, 60], phone: 8 }, crossArrive: { pad: [0.8, 0.5, 320], phone: [40, 40, 90] }, dull: { pad: [0.3, 0.05, 80], phone: [14, 40, 10] },
});

// ───────────────────────────── 타격 조합 ─────────────────────────────
const cache = new Map();
const shift = (ls, dt, k = 1) => ls.map((l) => (dt || k !== 1 ? Object.freeze({ ...l, at: l.at + dt, g: l.g * k }) : l));
/**
 * 타격 한 번의 느낌 — 표에서 조합해 캐시한다 (같은 조합은 같은 객체 → 타격마다 새 객체를 만들지 않는다).
 * @param {string} weapon WEAPON 키 · @param {string} material MATERIAL 키 · @param {string} strength 'L'|'M'|'H'|'F'
 * @param {number} flags FLAG 비트 합 (crit|kill|guard|parry|finisher)
 * @returns {{key, weapon, material, strength, flags, layers, stop, shake, kick, zoom, zoomT, slow, duck, gain, haptic, spark, big}}
 */
export function hitFeel(weapon, material, strength, flags = 0) {
  // 캐시 열쇠는 정수 (문자열을 잇지 않는다 — 타격마다 할당 0). 모르는 이름은 한손검·살·M 으로
  let wi = WEAPONS.indexOf(weapon), mi = MATERIALS.indexOf(material), si = STRENGTHS.indexOf(strength);
  if (wi < 0) wi = 0; if (mi < 0) mi = 0; if (si < 0) si = 1;
  const ck = (((wi * 16 + mi) * 4 + si) * 32) + (flags & 31);
  let r = cache.get(ck);
  if (r) return r;
  weapon = WEAPONS[wi]; material = MATERIALS[mi];
  const key = `${weapon}|${material}|${STRENGTHS[si]}|${flags & 31}`;
  const W = WEAPON[weapon], M = MATERIAL[material], S = STRENGTH[STRENGTHS[si]];
  const only = flags & FLAG.parry ? MOD.parry : flags & FLAG.guard ? MOD.guard : null;
  let layers, stop = S.stop * W.stopK * M.stopK, shake = S.shake, kick = S.kick, zoom = S.zoom, zoomT = S.zoomT, slow = null, duck = S.duck, gain = S.gain, haptic = S.haptic, big = false;
  if (only) {
    layers = only.only.slice(); stop = only.stop; shake = only.shake; kick = only.kick; zoom = only.zoom; zoomT = only.zoomT || 0; slow = only.slow || null; duck = only.duck || null; gain = only.gain; haptic = only.haptic; big = !!only.big;
  } else {
    const bodyK = [0.7, 0.85, 1, 1.1][si];
    layers = [...W.trans[S.id], ...shift(M.body, 0, bodyK)];
    if (W.cut && M.cutx.length) layers.push(...shift(M.cutx, 0, bodyK));
    if (si >= 1) layers.push(...shift(M.tail, S.tailAt, [0, 0.7, 1, 1.15][si]));
    if (si >= 2) layers.push(s('sub', 0, si === 3 ? 0.62 : 0.45, 1, 0));
    for (const m of ['crit', 'kill', 'finisher']) {
      if (!(flags & FLAG[m])) continue;
      const D = MOD[m];
      if (D.add) layers.push(...D.add);
      if (D.stop != null) stop = Math.max(stop, D.stop); if (D.stopAdd) stop += D.stopAdd;
      if (D.shakeAdd) shake += D.shakeAdd; if (D.kick != null) kick = Math.max(kick, D.kick);
      if (D.zoom) { zoom = Math.max(zoom, D.zoom); zoomT = Math.max(zoomT, D.zoomT || 0); }
      if (D.slow) slow = D.slow; if (D.duck) duck = D.duck; if (D.gain) gain *= D.gain; if (D.big) big = true;
      if (D.haptic && (m !== 'crit' || si < 3)) haptic = D.haptic;
    }
    if (flags & (FLAG.kill | FLAG.finisher)) layers.push(...M.die);   // 죽음 층 (재질별: 뼈 무너짐·돌 부서짐 …)
  }
  layers.sort((a, b) => a.at - b.at);
  // 경직 상한: 보통 타격 0.2초 (무기·재질 배율과 치명타·처치를 다 더해도 — 길면 움직임이 무거워진다), 마무리 일격·받아치기만 0.25초
  r = Object.freeze({ key, weapon, material, strength: S.id, flags: flags & 31, layers: Object.freeze(layers), stop: +Math.min(big ? STOP_MAX_BIG : STOP_MAX, stop).toFixed(3), shake: +Math.min(1, shake).toFixed(2), kick, zoom, zoomT, slow, duck, gain: +gain.toFixed(3), haptic, spark: M.spark, big });
  cache.set(ck, r);
  return r;
}
/** 휘두름(타격 전 바람 소리) — { layers, lead, gain } */
export function swingFeel(weapon, strength) {
  let wi = WEAPONS.indexOf(weapon), si = STRENGTHS.indexOf(strength);
  if (wi < 0) wi = 0; if (si < 0) si = 1;
  const ck = -1 - (wi * 4 + si);
  let r = cache.get(ck);
  if (r) return r;
  const W = WEAPON[WEAPONS[wi]], S = STRENGTH[STRENGTHS[si]];
  r = Object.freeze({ key: `sw|${WEAPONS[wi]}|${S.id}`, weapon: WEAPONS[wi], strength: S.id, layers: Object.freeze(W.whoosh[S.id]), lead: W.lead, gain: 0.72 + 0.04 * si, duck: null, haptic: null, big: false });
  cache.set(ck, r);
  return r;
}

// ───────────────────────────── 마법 ─────────────────────────────
// 원소마다 charge(모으기) · release(쏘기) · loop(날아가는 고리, sound.js 가 만든 고리 버퍼) · impact(맞음: 경직·흔들림·줌 포함)
const mag = (label, color, charge, release, loop, impact, fx) => Object.freeze({ label, color, charge, release, loop, impact, ...fx });
export const MAGIC = Object.freeze({
  fire: mag('불', '#ff8a3c', [s('riser', 0, 0.5, 0.9, 0, { el: 'fire' }), o('fire_breath', 0.1, 0.3, 0.8, 1)], [o('fire', 0, 0.9), s('air', 0, 0.35, 0.7), s('sub', 0, 0.3, 1.2, 1)], 'fire',
    [o('explode', 0, 0.7), o('fire', 0.02, 0.6, 0.8), s('sub', 0, 0.5), n('debris', 0.06, 0.35, 1, 1)], { loopG: 0.55, stop: 0.09, shake: 0.34, zoom: 1.03, zoomT: 0.2, duck: [0.4, 0.5], haptic: 'magicHit' }),
  ice: mag('얼음', '#8fd8ff', [s('riser', 0, 0.45, 1.15, 0, { el: 'ice' }), o('ice', 0.25, 0.25, 1.5, 1)], [o('ice', 0, 0.85, 1.1), s('air', 0, 0.3, 1.5), s('snap', 0, 0.3, 1.5, 1)], 'ice',
    [o('ice', 0, 1.1, 0.85), o('hit_stone', 0, 0.6, 1.3), n('debris', 0.03, 0.5, 1.7), n('ring', 0.02, 0.3, 1.5, 1)], { loopG: 0.32, stop: 0.1, shake: 0.26, zoom: 1.025, zoomT: 0.18, duck: [0.35, 0.45], haptic: 'magicHit' }),
  lightning: mag('번개', '#fff27a', [s('riser', 0, 0.75, 1.1, 0, { el: 'lightning' }), s('zap', 0.2, 0.2, 1.4, 1)], [o('thunder', 0, 0.9, 1.1), s('zap', 0, 0.45), s('snap', 0, 0.4, 1.2)], 'lightning',
    [o('thunderclap', 0, 0.8), o('thunder', 0.03, 0.5, 0.8), s('zap', 0, 0.5, 0.8), s('sub', 0, 0.5, 1.1)], { loopG: 0.85, stop: 0.07, shake: 0.4, zoom: 1.04, zoomT: 0.14, duck: [0.45, 0.5], haptic: 'zap' }),
  holy: mag('신성', '#fff4c8', [s('riser', 0, 0.85, 1, 0, { el: 'holy' }), s('shimmer', 0.2, 0.3, 1, 1)], [o('holy', 0, 0.8), n('bell_high', 0, 0.3, 1.5), s('air', 0, 0.25, 1.3, 1)], 'holy',
    [o('holy', 0, 0.9, 0.9), o('cross', 0, 0.5, 1), n('bell_mid', 0.01, 0.45, 2), s('sub', 0, 0.45, 1.2), s('shimmer', 0.05, 0.35, 1, 1)], { loopG: 0.3, stop: 0.09, shake: 0.24, zoom: 1.03, zoomT: 0.25, duck: [0.4, 0.6], haptic: 'magicHit' }),
  blood: mag('피·그림자', '#c0183c', [s('riser', 0, 0.5, 0.85, 0, { el: 'blood' }), o('heartbeat', 0.05, 0.6, 1, 1)], [o('dark', 0, 0.85), o('hit_flesh', 0, 0.5, 0.8), s('air', 0, 0.3, 0.6)], 'blood',
    [o('dark', 0, 0.9, 0.85), o('soul_reap', 0.02, 0.55, 0.9), o('hit_flesh', 0, 0.7, 0.7), s('drop', 0, 0.55, 1.2), s('wisp', 0.06, 0.3, 0.7, 1)], { loopG: 0.55, stop: 0.11, shake: 0.3, zoom: 1.035, zoomT: 0.22, duck: [0.45, 0.6], haptic: 'magicHit' }),
});
export const ELEMENTS = Object.freeze(Object.keys(MAGIC));

// ───────────────────────────── 종 ─────────────────────────────
// 배운 종소리 5가지 (시간을 바꾸는 가락) — [반음(기준 D4), 시각(초), 세기]. 반음 9 이상은 높은 종(bell_high, 기준 D5)으로 친다.
// 가락은 이 게임을 위해 새로 지은 것이다 (라 단조/프리지안 색). toll = 큰 순간의 깊은 종 한 번.
export const BELL = Object.freeze({
  dawn: { label: '새벽의 종', text: '날이 밝는다', notes: [[0, 0, 0.8], [7, 0.3, 0.85], [12, 0.6, 0.9], [14, 0.9, 1], [12, 1.5, 0.7]] },
  dusk: { label: '황혼의 종', text: '해가 진다', notes: [[12, 0, 0.95], [10, 0.32, 0.85], [7, 0.64, 0.85], [3, 0.96, 0.8], [0, 1.45, 1]] },
  bloodmoon: { label: '붉은 달의 종', text: '붉은 달의 밤으로', notes: [[0, 0, 0.9], [1, 0.36, 0.8], [7, 0.72, 0.95], [6, 1.08, 0.85], [0, 1.62, 1], [-12, 1.62, 0.6]] },
  return: { label: '돌아오는 종', text: '지금으로 돌아온다', notes: [[7, 0, 0.85], [3, 0.26, 0.8], [5, 0.52, 0.85], [12, 0.78, 1], [7, 1.3, 0.6], [0, 1.3, 0.7]] },
  still: { label: '멈춘 시간의 종', text: '시간이 멎는다', notes: [[12, 0, 1], [12, 0.5, 0.7], [7, 0.75, 0.8], [12, 1.25, 0.95], [0, 1.25, 0.5]] },
});
export const BELLS = Object.freeze(Object.keys(BELL));

// ───────────────────────────── 그 밖의 사건 ─────────────────────────────
// 이름 → { bus(엔진 효과음 묶음), layers, gain, duck?, haptic?, flat?(공간 처리 없음), loop?(고리 버퍼 이름) , stop/shake/zoom(있으면 효과 쪽 추천값) }
const ev = (bus, layers, x) => Object.freeze({ bus, layers: Object.freeze(layers), gain: 1, ...x });
export const EVENT = Object.freeze({
  // 이동 — 발소리는 애니메이션의 발 닿는 순간(contact)이 부른다. 속도(월드 단위/초)는 feel.step(speed) 가 walk/run/sprint 로 나눈다
  'step.walk': ev('f3_step', [o('step_stone', 0, 1.0, 0.96)], { gain: 0.9 }),
  'step.run': ev('f3_step', [o('step_stone', 0, 1.0, 1.02), s('scuff', 0, 0.12, 1, 2)], { gain: 1.5 }),
  'step.sprint': ev('f3_step', [o('step_stone', 0, 1.0, 1.07), s('scuff', 0, 0.2, 1.1, 1), n('gear', 0.01, 0.1, 1.1, 2)], { gain: 1.6 }),
  'move.dash': ev('f3_foley', [o('dash_burst', 0, 0.8), o('dash', 0, 0.6, 1.05), n('cloth', 0.01, 0.4, 1.1, 1), s('air', 0, 0.3, 1.1, 1)], { haptic: 'dash' }),
  'move.jump': ev('f3_foley', [o('jump', 0, 0.9), n('cloth', 0.01, 0.3, 1.25, 1), n('gear', 0, 0.16, 1.1, 2)]),
  'move.land': ev('f3_foley', [o('land', 0, 1.0), o('step_stone', 0.004, 0.9, 0.9), n('gear', 0.015, 0.2, 0.95, 1)], { gain: 1.3, haptic: 'land' }),
  'move.land_heavy': ev('f3_foley', [o('land_heavy', 0, 0.95), s('sub', 0, 0.4, 1.1), n('debris', 0.03, 0.22, 1.2, 1), n('gear', 0.02, 0.3, 0.9, 1)], { haptic: 'landHeavy', shake: 0.14, stop: 0 }),
  'foley.cloth': ev('f3_foley', [n('cloth', 0, 0.5)], { gain: 0.6 }),
  'foley.gear': ev('f3_foley', [n('gear', 0, 0.5)], { gain: 0.5 }),
  'weapon.draw': ev('f3_foley', [n('draw', 0, 0.75), n('gear', 0, 0.2, 0.9, 1), n('ring', 0.24, 0.22, 1.3, 1)], { gain: 0.6 }),
  'weapon.sheath': ev('f3_foley', [o('sheath', 0, 0.9), n('gear', 0.12, 0.25, 0.9, 1)]),
  'hero.hurt': ev('f3_hit', [o('hurt', 0, 0.9), o('hit_flesh', 0, 0.6, 0.85), s('thud', 0, 0.5, 0.8)], { gain: 1.3, haptic: 'hurt', stop: 0.05, shake: 0.3, duck: [0.3, 0.4] }),
  // 적
  'enemy.skel.rattle': ev('f3_enemy', [o('bone_rattle', 0, 0.8), o('bone_rattle', 0.09, 0.45, 1.25, 1)], { gain: 0.85 }),
  'enemy.skel.collapse': ev('f3_enemy', [o('enemy_die_bone', 0, 0.9), o('bone_rattle', 0.12, 0.6, 0.85), o('bone_rattle', 0.27, 0.4, 1.15, 1), n('debris', 0.1, 0.4, 1.25, 1), s('thud', 0.05, 0.4, 0.9)]),
  'enemy.mage.chant': ev('f3_enemy', [n('chant', 0, 0.8), s('wisp', 0.1, 0.25, 0.8, 1)], { gain: 0.6 }),
  'enemy.bat.screech': ev('f3_enemy', [o('screech', 0, 0.5, 1.5), o('bat', 0.02, 0.8, 1.1)], { gain: 1.1 }),
  'enemy.bat.flap': ev('f3_enemy', [o('wing_flap', 0, 0.7, 1.3)], { gain: 1.2 }),
  // 세계
  'world.torch.light': ev('f3_enemy', [o('candle', 0, 0.8, 0.8), o('fire', 0.02, 0.3, 1.3, 1)], { gain: 0.6 }),
  'loop.torch': ev('f3_loop', [], { loop: 'torch', gain: 0.3, life: 3600, keep: true }),
  'loop.street': ev('f3_loop', [], { loop: 'street', gain: 0.1, life: 3600, keep: true, flat: true }),
  // 인터페이스 (작게, 공간 처리 없음)
  'ui.move': ev('f3_ui', [n('ui_tick', 0, 0.7)], { flat: true, gain: 0.5 }),
  'ui.tab': ev('f3_ui', [n('ui_tab', 0, 0.5)], { flat: true, gain: 0.55 }),
  'ui.open': ev('f3_ui', [n('ui_open', 0, 0.5)], { flat: true, gain: 0.55 }),
  'ui.close': ev('f3_ui', [n('ui_close', 0, 0.5)], { flat: true, gain: 0.55 }),
  'ui.ok': ev('f3_ui', [n('ui_ok', 0, 0.5)], { flat: true, gain: 0.6 }),
  'ui.deny': ev('f3_ui', [n('ui_deny', 0, 0.55)], { flat: true, gain: 0.6 }),
  // 깨지는 것들 (BREAK — docs/v2/SOUND_FEEL.md 14). The clay crash has three layer sets; the scene picks one per break (never the same twice in a row) and
  // varies pitch and level itself (feel.play(name, pos, vol, pitch)) on top of each layer's own pv / gv / sv and the bank's rotation of variants.
  // stop / shake = what the scene applies (lighter than an L blow on an enemy: 0.045 / 0.10). A roll through a jar takes no stop at all.
  'break.clay': ev('f3_enemy', [n('clay_crash', 0, 0.92), o('candle', 0.003, 0.5, 1.12, 1), n('clay_tinkle', 0.09, 0.45, 1.0, 1, { sv: 0.1 }), n('debris', 0.13, 0.2, 1.5, 2)], { gain: 1.15, haptic: 'breakL', stop: 0.03, shake: 0.07 }),
  'break.clay.b': ev('f3_enemy', [n('clay_crash', 0, 0.86, 1.08), o('candle', 0, 0.42, 0.9, 1), n('clay_tinkle', 0.16, 0.52, 1.12, 0, { sv: 0.14 })], { gain: 1.15, haptic: 'breakL', stop: 0.03, shake: 0.07 }),
  'break.clay.c': ev('f3_enemy', [n('clay_crash', 0, 0.95, 0.94), o('hit_stone', 0.002, 0.3, 1.3, 1), n('clay_tinkle', 0.05, 0.36, 0.9, 1, { sv: 0.08 }), n('debris', 0.2, 0.18, 1.7, 2)], { gain: 1.15, haptic: 'breakL', stop: 0.03, shake: 0.07 }),
  'break.crate': ev('f3_enemy', [n('wood_crack', 0, 0.95), o('step_wood', 0.004, 1.5, 0.8), s('knock', 0, 0.4, 0.8, 1), n('wood_clatter', 0.07, 0.6, 1, 0, { sv: 0.05 }), n('debris', 0.1, 0.16, 1.2, 2)], { gain: 1.1, haptic: 'breakL', stop: 0.035, shake: 0.09 }),
  'break.barrel': ev('f3_enemy', [n('wood_crack', 0, 0.9, 0.78), s('thud', 0, 0.55, 0.8), n('wood_clatter', 0.08, 0.6, 0.82, 0, { sv: 0.05 }), n('hoop_ring', 0.05, 0.5, 1, 0, { pv: 0.08 }), o('clang', 0.03, 0.22, 0.7, 2)], { gain: 1.15, haptic: 'breakL', stop: 0.04, shake: 0.11 }),
  'pickup.clink': ev('f3_foley', [n('coin_clink', 0, 0.5, 1, 0, { pv: 0.1 })], { gain: 0.7 }),   // a dropped coin touching the ground
  // 종 (가락은 BELL — sound.js 가 층으로 푼다)
  'bell.toll': ev('f3_bell', [n('bell_toll', 0, 0.68), s('drop', 0, 0.5, 0.9), o('bell', 0.004, 0.35, 0.5, 1)], { duck: [0.5, 2.4], haptic: 'toll', shake: 0.3, stop: 0, zoom: 1.04, zoomT: 1.2 }),
  // 건넘 (CROSSING — docs/v2/SOUND_FEEL.md 15): the staged bell crossing (src/v2/game/crossing.js). Its first toll is 'bell.toll' above.
  // gather = the bell's light gathers · rush = the rising rush under the passage, cut at its top where the second toll lands (rush.long: the last 1.25 s of the
  // three-second form) · beat = one heartbeat ring of the passage (the scene lowers the level and raises the pitch a little per beat) · loop.cross = the bed
  // under the passage, stopped by the second toll · arrive.past / arrive.now = the second toll with its tail (warm and low towards 1697, cold and glassy
  // towards tonight) · dull = the refused crossing. None of them sits in the world (flat): the whole picture is the bell.
  'cross.gather': ev('f3_bell', [s('shimmer', 0, 0.5, 1.25), s('wisp', 0, 0.45, 1.2, 1)], { gain: 0.7, flat: true }),
  'cross.rush': ev('f3_big', [n('cross_rush', 0, 0.75, 1, 0, { pv: 0, gv: 0 })], { gain: 0.85, flat: true }),
  'cross.rush.long': ev('f3_big', [n('cross_rush', 1.75, 0.75, 1, 0, { pv: 0, gv: 0 }), s('riser', 0, 0.4, 1, 0, { el: 'holy' })], { gain: 0.85, flat: true }),
  'cross.beat': ev('f3_bell', [n('cross_swell', 0, 0.8, 1, 0, { pv: 0.02, gv: 0.03 })], { gain: 0.9, flat: true, haptic: 'crossBeat' }),
  'loop.cross': ev('f3_loop', [], { loop: 'holy', gain: 0.2, life: 9, flat: true }),
  'cross.arrive.past': ev('f3_bell', [n('bell_toll', 0, 0.42, 0.84), n('cross_tail_past', 0.03, 0.62, 1, 0, { pv: 0 }), s('drop', 0, 0.35, 0.8)], { duck: [0.5, 2.4], haptic: 'crossArrive' }),
  'cross.arrive.now': ev('f3_bell', [n('bell_toll', 0, 0.42, 1.19), n('cross_tail_now', 0.03, 0.55, 1, 0, { pv: 0 }), s('shimmer', 0.08, 0.3, 1.4, 1)], { duck: [0.5, 2.4], haptic: 'crossArrive' }),
  'cross.dull': ev('f3_bell', [n('bell_dull', 0, 0.9, 1, 0, { pv: 0.02 }), s('thud', 0, 0.45, 0.8)], { haptic: 'dull' }),
  // 화면들 (SCREENS — docs/v2/UI_API.md 10): small, flat, never over a fight's sounds. book.chime = an entry was written (the book chip comes up)
  'book.chime': ev('f3_ui', [n('bell_high', 0, 0.34, 1, 0, { pv: 0, gv: 0.03 }), n('bell_high', 0.16, 0.2, 1.498, 1, { pv: 0, gv: 0.03 })], { flat: true, gain: 0.5 }),
  'card.rise': ev('f3_ui', [n('ui_open', 0, 0.42, 1.18), n('cloth', 0.01, 0.2, 1.3, 1)], { flat: true, gain: 0.5 }),   // a card 「얻었다 — …」 rises
  'shop.buy': ev('f3_ui', [n('coin_clink', 0, 0.6, 1, 0, { pv: 0.06 }), n('coin_clink', 0.08, 0.42, 1.18, 0, { pv: 0.06 }), n('ui_ok', 0.03, 0.34)], { flat: true, gain: 0.65 }),   // a purchase: silver changes hands
  'shop.deny': ev('f3_ui', [n('ui_deny', 0, 0.55), n('coin_clink', 0.02, 0.18, 0.7, 1)], { flat: true, gain: 0.6 }),   // a refusal: not enough silver, no room, no use for it now
  'draught.use': ev('f3_bell', [n('bell_mid', 0, 0.5, 1.26, 0, { pv: 0, gv: 0.03 }), s('shimmer', 0.02, 0.4, 1.3), n('ring', 0.05, 0.25, 1.2, 1)], { gain: 0.8, haptic: 'chime' }),   // a draught of holy water keeps the hero on his feet
});
// 마법·종 가락·고리도 사건 이름으로 부를 수 있게 펼친다: magic.<원소>.<charge|release|impact>, loop.magic.<원소>, bell.<가락>
const X = {};
for (const el of ELEMENTS) {
  const m = MAGIC[el];
  X[`magic.${el}.charge`] = ev('f3_magic', m.charge, { gain: 0.8 });
  X[`magic.${el}.release`] = ev('f3_magic', m.release, { gain: 0.95, haptic: 'cast' });
  X[`magic.${el}.impact`] = ev('f3_big', m.impact, { gain: 0.95, stop: m.stop, shake: m.shake, zoom: m.zoom, zoomT: m.zoomT, duck: m.duck, haptic: m.haptic });
  X[`loop.magic.${el}`] = ev('f3_loop', [], { loop: m.loop, gain: m.loopG, life: 8 });
}
for (const b of BELLS) {
  const ls = BELL[b].notes.map(([semi, at, vel]) => (semi >= 9 ? L('n', 'bell_high', at, 0.62 * vel, Math.pow(2, (semi - 12) / 12), 0, { pv: 0, gv: 0.03 }) : L('n', 'bell_mid', at, 0.7 * vel, Math.pow(2, semi / 12), 0, { pv: 0, gv: 0.03 })));
  X[`bell.${b}`] = ev('f3_bell', ls, { duck: [0.5, 2.6], haptic: 'chime', gain: 0.72 });
}
export const EVENTS = Object.freeze({ ...EVENT, ...X });
/** 사건 이름 찾기 표 (문자열을 잇지 않게): MAGIC_EVENT[원소][단계] · BELL_EVENT[가락|'toll'] · MAGIC_LOOP[원소] */
export const MAGIC_EVENT = Object.freeze(Object.fromEntries(ELEMENTS.map((el) => [el, Object.freeze({ charge: `magic.${el}.charge`, release: `magic.${el}.release`, impact: `magic.${el}.impact` })])));
export const MAGIC_LOOP = Object.freeze(Object.fromEntries(ELEMENTS.map((el) => [el, `loop.magic.${el}`])));
export const BELL_EVENT = Object.freeze({ ...Object.fromEntries(BELLS.map((b) => [b, `bell.${b}`])), toll: 'bell.toll' });
export const EVENT_NAMES = Object.freeze(Object.keys(EVENTS));

/** 발소리 속도 구간 (월드 단위/초) → 사건 이름. 걷기 < 150 ≤ 달리기 < 300 ≤ 전력 */
export function stepEvent(speed) { return speed >= 300 ? 'step.sprint' : speed >= 150 ? 'step.run' : 'step.walk'; }

/** 표가 쓰는 샘플 이름 (미리 받기·검사용): { old:[v1 고급 효과음 이름], neu:[v2 새 샘플 이름], syn:[합성 층 이름] } */
export function usedSources() {
  const old = new Set(), neu = new Set(), syn = new Set();
  const add = (ls) => { for (const l of ls) (l.k === 'o' ? old : l.k === 'n' ? neu : syn).add(l.n); };
  for (const w of WEAPONS) for (const st of STRENGTHS) { add(WEAPON[w].whoosh[st]); add(WEAPON[w].trans[st]); }
  for (const m of MATERIALS) { add(MATERIAL[m].body); add(MATERIAL[m].tail); add(MATERIAL[m].cutx); add(MATERIAL[m].die); }
  for (const k in MOD) { if (MOD[k].add) add(MOD[k].add); if (MOD[k].only) add(MOD[k].only); }
  for (const k in EVENTS) add(EVENTS[k].layers);
  syn.add('sub');
  return { old: [...old], neu: [...neu], syn: [...syn] };
}
