// 동료 효과음 — 1부 26종 + 2부 울음소리 5종 (companions §10, MASTER_PLAN §1.9) — owner: AUDIO-CMP
//  import 하는 순간 audio.js 의 defineSfx 로 31종을 등록한다 (companions.js 가 부수 효과용으로 import).
//  이름은 audio.sfx(name, {vol, pitch, pan, delay}) 로 재생한다. 등록 전에 불린 이름은 audio.js 의 _default 로 울린다.
//
//  탈것 울음: 그림메인·코슈타(0.8 + bone_rattle)·이그니스(0.9 + fire) neigh, 바르그 boar_grunt, 스콜 wolf_howl,
//            스칼렛 roar_small, 녹티스 screech, 게일 griffin_cry, 실바 stag_call
//  수호신 울음: 아리아 fairy_chime, 하티 wolf_howl ×1.3, 핌 imp_cackle, 가웨인 knight_guard, 크론 roar_small ×1.6 + bone_rattle,
//            미네르바 owl_hoot, 틱톡 gear_whir, 모르스 scythe, 미라 mirror_chime, 루멘 jelly_zap, 모모 momo_gulp
//  발굽: 그림메인·코슈타 gallop, 바르그 gallop 1.3배·0.5, 늑대·비행형 footstep 0.8배 (data/companions.js 의 hoof)
//
//  도우미 (선택): playCry(def, o) — def.cry {sfx, pitch, extra} 를 재생 (extra 는 살짝 늦게 겹친다)
//                 playKnockOff(def, o) — knock_off(쿵 + 아픈 울음) 뒤에 그 탈것의 울음을 1.3배 높이로
//  정의 필드는 audio.js 와 같다: fn(S, H) 합성, max 동명 동시 수, gap 중복 억제(초), rev 잔향 송신, vary 피치 랜덤,
//  vol 체감 음량 보정(명세 §10 표의 vol), duck [amount, time] 음악 덕킹.
//  음량은 tools/test_sfx.mjs --levels 로 맞췄다 (정상 상태 단기 RMS 가 비슷한 역할의 내장 효과음과 같은 범위).
//  모바일 비용: 한 번 재생에 소스 노드(발진기·노이즈) 최대 18개, 자주 울리는 gallop·fire_breath·bone_rattle 은 2~6개.
import { defineSfx, audio } from './audio.js';

const M = (m) => 440 * Math.pow(2, (m - 69) / 12);
const E0 = {};

// ─────────────────────────────── 합성 도우미 (이 파일 전용) ───────────────────────────────
// S = { e, c, t(시작), p(피치 배율), v(볼륨), out, end } — audio.js 의 효과음 인스턴스

// 여러 점 곡선: pts = [[상대 초, 값], …] 을 지수 램프로 잇는다 (값에 mul 을 곱함)
function curve(param, t, pts, mul) {
  param.setValueAtTime(pts[0][1] * mul, t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) param.exponentialRampToValueAtTime(pts[i][1] * mul, t + pts[i][0]);
}
// 엔벨로프: 0 → pk (a 초, 선형) → hold → 0.0004 (dur, 지수)
function env(g, t, a, hold, dur, pk) {
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a);
  if (hold) g.gain.setValueAtTime(pk, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
}
function lfo(S, t, dur, rate, depth, dest) {
  const c = S.c, l = c.createOscillator(), lg = c.createGain();
  l.frequency.value = rate; lg.gain.value = depth; l.connect(lg); lg.connect(dest);
  l.start(t); l.stop(t + dur + 0.02);
}
function ends(S, at, dur) { if (at + dur > S.end) S.end = at + dur; }

// 목소리: 발진기 w (fp 음높이 곡선) → 포먼트 대역통과 bp 곡선(q) [+ 두 번째 포먼트 bp2 [Hz, q, 비율]] [→ 저역통과 lp]
//   → 엔벨로프(a, hold) [→ 트레몰로 trem [속도, 깊이 0..1]] → S.out.   vib [속도, 센트] 비브라토.  돌려주는 값: 발진기
function voice(S, o) {
  const c = S.c, at = o.at || 0, t = S.t + at, dur = o.dur, p = S.p;
  const os = c.createOscillator(), g = c.createGain();
  os.type = o.w || 'sawtooth';
  curve(os.frequency, t, o.fp, p);
  let n = os;
  if (o.bp) {
    const b = c.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = o.q ?? 4; curve(b.frequency, t, o.bp, p); os.connect(b); n = b;
    if (o.bp2) {
      const b2 = c.createBiquadFilter(), g2 = c.createGain(), sum = c.createGain();
      b2.type = 'bandpass'; b2.frequency.value = o.bp2[0] * p; b2.Q.value = o.bp2[1]; g2.gain.value = o.bp2[2];
      os.connect(b2); b2.connect(g2); g2.connect(sum); b.connect(sum); n = sum;
    }
  }
  if (o.lp) { const b = c.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = o.lp * p; n.connect(b); n = b; }
  env(g, t, o.a ?? 0.02, o.hold, dur, o.vol * S.v);
  n.connect(g);
  if (o.trem) {
    const tg = c.createGain(); tg.gain.value = 1 - o.trem[1] * 0.5;
    lfo(S, t, dur, o.trem[0], o.trem[1] * 0.5, tg.gain);
    g.connect(tg); tg.connect(S.out);
  } else g.connect(S.out);
  if (o.vib) lfo(S, t, dur, o.vib[0], o.vib[1], os.detune);
  os.start(t); os.stop(t + dur + 0.02);
  ends(S, at, dur);
  return os;
}
// 링 변조: 반송파(f0→f1 스윕) × 변조파(mf Hz) → 측파대의 금속성 반짝임
function ring(S, f0, f1, mf, at, dur, vol, o = E0) {
  const c = S.c, t = S.t + at, p = S.p, car = c.createOscillator(), mod = c.createOscillator(), rm = c.createGain(), g = c.createGain();
  car.type = o.w || 'sine';
  car.frequency.setValueAtTime(f0 * p, t);
  if (f1 && f1 !== f0) car.frequency.exponentialRampToValueAtTime(f1 * p, t + (o.sw ?? dur));
  mod.frequency.value = mf * p; rm.gain.value = 0;
  car.connect(rm); mod.connect(rm.gain); rm.connect(g); g.connect(S.out);
  env(g, t, o.a ?? 0.01, o.hold, dur, vol * S.v);
  car.start(t); mod.start(t); car.stop(t + dur + 0.02); mod.stop(t + dur + 0.02);
  ends(S, at, dur);
}
// 으르렁: 톱니(f0→f1, 빠른 떨림) + 대역통과 노이즈 → 웨이브셰이퍼(찌그러짐) → 저역통과 → 엔벨로프
function growl(S, f0, f1, at, dur, vol, o = E0) {
  const c = S.c, t = S.t + at, p = S.p, os = c.createOscillator(), ns = c.createBufferSource(), nb = c.createBiquadFilter();
  const mix = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain();
  os.type = 'sawtooth'; os.frequency.setValueAtTime(f0 * p, t); os.frequency.exponentialRampToValueAtTime(f1 * p, t + dur);
  ns.buffer = S.e.noise; ns.loop = true;
  nb.type = 'bandpass'; nb.frequency.value = (o.nf ?? 900) * p; nb.Q.value = 0.9;
  const ng = c.createGain(); ng.gain.value = o.noise ?? 0.8;
  os.connect(mix); ns.connect(nb); nb.connect(ng); ng.connect(mix);
  let n = mix;
  if (S.e.curve) { const ws = c.createWaveShaper(); ws.curve = S.e.curve(o.drive ?? 3); mix.connect(ws); n = ws; }
  lp.type = 'lowpass'; lp.frequency.setValueAtTime((o.lp ?? 2400) * p, t); lp.frequency.exponentialRampToValueAtTime((o.lp1 ?? 900) * p, t + dur); lp.Q.value = 1.2;
  n.connect(lp); lp.connect(g); g.connect(S.out);
  env(g, t, o.a ?? 0.03, o.hold, dur, vol * S.v);
  if (o.vib) lfo(S, t, dur, o.vib[0], o.vib[1], os.detune);
  os.start(t); ns.start(t, Math.random() * 1.8); os.stop(t + dur + 0.02); ns.stop(t + dur + 0.02);
  ends(S, at, dur);
}

// ─────────────────────────────── 효과음 31종 ───────────────────────────────
export const CMP_SFX = {
  // ── 소환·해제·탑승 ──
  summon: { max: 2, gap: 0.1, rev: 0.35, vol: 1.2, fn(S, { T, N, FM }) {
    // 붉은 소환진: 차오르는 대역 노이즈 0.35초 + 종 880/1320
    N(S, 0, 0.42, 0.3, { f: ['bandpass', 300, 2600, 1.4, 0.35], a: 0.3 });
    T(S, 'sine', 70, 140, 0, 0.36, 0.14, { a: 0.28, sw: 0.34 });
    FM(S, 880, 3.5, 0.7, 0.33, 0.95, 0.14, { fd: 0.3 });
    T(S, 'sine', 1320, 0, 0.33, 0.8, 0.1, { a: 0.004 });
    T(S, 'triangle', 2640, 0, 0.34, 0.35, 0.03);
    T(S, 'sine', 110, 55, 0.33, 0.22, 0.28);
  } },
  dismiss: { max: 2, gap: 0.1, rev: 0.3, vol: 1.0, fn(S, { T, N }) {
    // 흩어지는 안개: 내려가는 휙 + 220→110 저음
    N(S, 0, 0.46, 0.27, { f: ['bandpass', 2600, 300, 1.2, 0.42], a: 0.03 });
    T(S, 'sine', 220, 110, 0.02, 0.45, 0.21, { a: 0.02, sw: 0.4 });
    T(S, 'triangle', 660, 330, 0, 0.3, 0.04, { a: 0.01 });
    N(S, 0.05, 0.3, 0.06, { f: ['highpass', 5000], a: 0.05 });
  } },
  mount_up: { max: 1, gap: 0.1, rev: 0.1, vol: 1.0, fn(S, { T, N }) {
    // 가죽 안장 삐걱 ×2 (600 Hz 대역 노이즈 + 낮은 톱니 마찰) + 쿵 90 Hz
    N(S, 0, 0.075, 0.4, { f: ['bandpass', 600, 540, 6], a: 0.012 });
    T(S, 'sawtooth', 42, 34, 0, 0.075, 0.28, { a: 0.01, f: ['bandpass', 620, 0, 5] });
    N(S, 0.095, 0.09, 0.45, { f: ['bandpass', 660, 560, 7], a: 0.015 });
    T(S, 'sawtooth', 38, 30, 0.095, 0.09, 0.26, { a: 0.012, f: ['bandpass', 580, 0, 5] });
    T(S, 'sine', 90, 48, 0.17, 0.2, 0.38, { sw: 0.15 });
    N(S, 0.17, 0.08, 0.14, { f: ['lowpass', 900] });
  } },
  // ── 말 ──
  neigh: { max: 2, gap: 0.25, rev: 0.3, vary: 0.04, vol: 1.4, fn(S, { N }) {
    // 말 울음: 톱니 → 포먼트 900→1400→700 Hz, 9 Hz 떨림(비브라토+트레몰로), 0.7초 + 끝 콧김
    const fp = [[0, 430], [0.1, 640], [0.34, 580], [0.56, 400], [0.72, 230]];
    voice(S, { dur: 0.72, vol: 0.6, fp, bp: [[0, 900], [0.2, 1400], [0.72, 700]], q: 2.6, bp2: [2500, 5, 0.35], vib: [9, 70], trem: [9, 0.55], a: 0.04, hold: 0.46 });
    voice(S, { w: 'triangle', dur: 0.72, vol: 0.05, fp: [[0, 215], [0.1, 320], [0.34, 290], [0.56, 200], [0.72, 115]], lp: 900, vib: [9, 70], a: 0.05, hold: 0.4 });
    N(S, 0.6, 0.22, 0.14, { f: ['bandpass', 1300, 500, 1.1], a: 0.03 });
  } },
  gallop: { max: 4, gap: 0.04, rev: 0.04, vary: 0.07, vol: 0.7, fn(S, { T, N }) {
    // 발굽 한 번: 20 ms 저역 노이즈 딸깍 + 70 Hz 쿵
    N(S, 0, 0.024, 0.42, { f: ['lowpass', 2600, 800, 0.9] });
    T(S, 'sine', 125, 62, 0, 0.075, 0.34, { sw: 0.05 });
  } },
  hoof_land: { max: 2, gap: 0.08, rev: 0.15, vol: 1.2, fn(S, { T, N, CRACKLE }) {
    // 무거운 착지: 55 Hz 사인 0.2초 + 노이즈
    N(S, 0, 0.02, 0.3, { f: ['highpass', 2000] });
    T(S, 'sine', 78, 42, 0, 0.26, 0.54, { sw: 0.18 });
    N(S, 0, 0.24, 0.29, { f: ['lowpass', 1500, 170, 0.8] });
    CRACKLE(S, 0.02, 0.16, 3, 0.1, 1600);
  } },
  // ── 짐승 ──
  boar_grunt: { max: 2, gap: 0.2, rev: 0.15, vary: 0.05, vol: 1.2, fn(S, { T, N }) {
    // 멧돼지 꿀꿀 ×3: 사각파 110→80 Hz 끊김 + 콧김, 저역통과
    for (let i = 0; i < 3; i++) {
      const at = i * 0.115, f = 110 - i * 7;
      T(S, 'square', f, 80, at, 0.1, 0.24, { a: 0.008, f: ['lowpass', 760, 420, 1.6] });
      N(S, at, 0.085, 0.2, { a: 0.006, f: ['bandpass', 420, 260, 2] });
    }
  } },
  wolf_howl: { max: 2, gap: 0.3, rev: 0.5, vary: 0.03, vol: 1.3, fn(S, { T, N }) {
    // 늑대 울음: 사인 420→720→560 Hz, 5 Hz 비브라토, 1.1초 + 숨결 노이즈
    const a = T(S, 'sine', 420, 720, 0, 1.1, 0.17, { a: 0.14, hold: 0.55, sw: 0.34, vib: [5, 22] });
    a.frequency.exponentialRampToValueAtTime(560 * S.p, S.t + 1.05);
    const b = T(S, 'triangle', 840, 1440, 0, 1.05, 0.024, { a: 0.18, hold: 0.5, sw: 0.34, vib: [5, 22] });
    b.frequency.exponentialRampToValueAtTime(1120 * S.p, S.t + 1.0);
    N(S, 0, 1.1, 0.035, { f: ['bandpass', 1100, 1500, 0.8], a: 0.25, hold: 0.4 });
  } },
  wolf_bite: { max: 3, gap: 0.05, rev: 0.08, vary: 0.05, vol: 1.0, fn(S, { T, N }) {
    // 딱: 12 ms 고역 노이즈 + 300 Hz 딸깍 + 턱 쿵
    N(S, 0, 0.014, 0.75, { f: ['highpass', 2600] });
    T(S, 'square', 300, 170, 0, 0.035, 0.2, { f: ['lowpass', 1800] });
    T(S, 'sine', 170, 80, 0, 0.07, 0.35);
    N(S, 0.012, 0.05, 0.14, { f: ['bandpass', 1200, 600, 2] });
  } },
  wing_flap: { max: 3, gap: 0.06, rev: 0.1, vary: 0.06, vol: 1.0, fn(S, { T, N }) {
    // 날갯짓: 저역 노이즈 훅 0.12초 + 깃털 스침
    N(S, 0, 0.14, 0.56, { f: ['lowpass', 950, 280, 0.9], a: 0.035 });
    T(S, 'sine', 96, 54, 0, 0.11, 0.22, { a: 0.02 });
    N(S, 0.015, 0.08, 0.1, { f: ['bandpass', 2000, 900, 1.2], a: 0.02 });
  } },
  roar_small: { max: 2, gap: 0.2, rev: 0.3, vary: 0.04, vol: 1.3, fn(S, { T }) {
    // 작은 포효: 톱니 180→120 Hz + 찌그러진 노이즈 0.6초 (크론은 1.6배 높이)
    growl(S, 180, 120, 0, 0.6, 0.17, { a: 0.04, hold: 0.22, vib: [27, 45], nf: 1100, noise: 1.1, drive: 3, lp: 3000, lp1: 1000 });
    T(S, 'sawtooth', 90, 62, 0, 0.55, 0.05, { a: 0.05, hold: 0.2, f: ['lowpass', 400] });
  } },
  fire_breath: { max: 3, gap: 0.08, rev: 0.12, vary: 0.05, vol: 1.0, fn(S, { N }) {
    // 화염 숨결: 800→2400 Hz 로 오르는 대역 노이즈 0.25초 (0.2초마다 다시 울려 이어진다) + 낮은 불꽃 몸통
    N(S, 0, 0.27, 0.42, { f: ['bandpass', 800, 2400, 1.1, 0.25], a: 0.05, hold: 0.1 });
    N(S, 0, 0.27, 0.3, { f: ['lowpass', 520], a: 0.05, hold: 0.1 });
  } },
  screech: { max: 2, gap: 0.2, rev: 0.3, vary: 0.04, vol: 1.1, fn(S, { T, N }) {
    // 박쥐 비명: 높은 사인 3200→5200 Hz 스윕 ×3 + 링 변조 반짝임 + 몸통 끽
    for (let i = 0; i < 3; i++) T(S, 'sine', 3200, 5200, i * 0.085, 0.075, 0.1, { a: 0.006 });
    ring(S, 2400, 3600, 173, 0, 0.28, 0.14, { a: 0.01, hold: 0.1 });
    T(S, 'sawtooth', 1700, 1200, 0, 0.26, 0.05, { a: 0.01, f: ['bandpass', 2400, 0, 3], vib: [40, 60] });
    N(S, 0, 0.24, 0.05, { f: ['highpass', 5500], a: 0.01 });
  } },
  bone_rattle: { max: 3, gap: 0.05, rev: 0.1, vary: 0.05, vol: 0.9, fn(S, { N, R }) {
    // 뼈 달그락: 작은 딸깍 6번이 0.2초 안에 무작위로
    for (let i = 0; i < 6; i++) N(S, i === 0 ? 0 : R() * 0.2, 0.012 + R() * 0.01, 1.2 + R() * 0.8, { f: ['bandpass', 2300 + R() * 2200, 0, 3] });
  } },
  // ── 수호신 ──
  fairy_chime: { max: 2, gap: 0.1, rev: 0.6, vary: 0.02, vol: 1.1, fn(S, { T }) {
    // 요정 방울: 사인 1568/2093/2637 Hz 가 40 ms 간격, 긴 잔향
    [1568, 2093, 2637].forEach((f, i) => T(S, 'sine', f, 0, i * 0.04, 0.75, 0.13, { a: 0.003 }));
    T(S, 'sine', 3136, 0, 0.12, 0.5, 0.05, { a: 0.003 });
    T(S, 'triangle', 5274, 0, 0.12, 0.2, 0.012);
  } },
  knight_guard: { max: 2, gap: 0.1, rev: 0.35, vary: 0.03, vol: 1.1, fn(S, { T, N, FM }) {
    // 기사 방패: 금속 챙 (clang 계열) + 1200 Hz 반짝임
    N(S, 0, 0.025, 0.5, { f: ['highpass', 2500] });
    FM(S, 660, 1.41, 3, 0, 0.5, 0.24, { fd: 0.15 });
    FM(S, 990, 2.76, 1.5, 0.002, 0.35, 0.1, { fd: 0.1 });
    T(S, 'sine', 150, 80, 0, 0.1, 0.32);
    T(S, 'sine', 1200, 0, 0.05, 0.9, 0.07, { a: 0.08, vib: [6, 12] });
    T(S, 'sine', 1800, 0, 0.09, 0.7, 0.035, { a: 0.1 });
  } },
  imp_cackle: { max: 2, gap: 0.25, rev: 0.2, vary: 0.05, vol: 1.0, fn(S, { T }) {
    // 소악마 킥킥 ×5: 사각파 포먼트 끊김 500–800 Hz ('키히힛!')
    [640, 780, 720, 800, 560].forEach((f, i) => {
      const at = i * 0.072;
      T(S, 'square', f, f * 0.82, at, 0.06, 0.4, { a: 0.005, f: ['bandpass', f * 1.4, f * 1.1, 1.4] });
      if (i % 2 === 0) T(S, 'sawtooth', f * 2, f * 1.7, at, 0.045, 0.11, { a: 0.004, f: ['bandpass', 2600, 0, 3] });
    });
  } },
  owl_hoot: { max: 2, gap: 0.25, rev: 0.45, vary: 0.02, vol: 1.0, fn(S, { T, N }) {
    // 부엉이: 부드러운 사인 420 Hz / 380 Hz 각 0.25초 + 숨결
    T(S, 'sine', 420, 400, 0, 0.27, 0.18, { a: 0.05, hold: 0.1, vib: [6, 8] });
    T(S, 'triangle', 840, 800, 0, 0.24, 0.025, { a: 0.05, hold: 0.08 });
    T(S, 'sine', 380, 355, 0.33, 0.3, 0.17, { a: 0.05, hold: 0.12, vib: [6, 8] });
    T(S, 'triangle', 760, 710, 0.33, 0.27, 0.022, { a: 0.05, hold: 0.1 });
    N(S, 0, 0.6, 0.02, { f: ['bandpass', 700, 0, 2], a: 0.08, hold: 0.3 });
  } },
  gear_whir: { max: 2, gap: 0.1, rev: 0.15, vary: 0.03, vol: 0.9, fn(S, { T, N }) {
    // 태엽: 초당 30번 딸깍 0.2초 + 톱니 300 Hz 윙
    for (let i = 0; i < 7; i++) N(S, i / 30, 0.01, 0.9 - i * 0.035, { f: ['bandpass', 3200 - i * 90, 0, 4] });
    T(S, 'sawtooth', 300, 345, 0, 0.24, 0.14, { a: 0.02, hold: 0.12, f: ['lowpass', 1500] });
    T(S, 'sine', 2600, 0, 0.23, 0.18, 0.05, { a: 0.003 });
  } },
  scythe: { max: 3, gap: 0.06, rev: 0.3, vary: 0.04, vol: 1.1, fn(S, { T, N, FM }) {
    // 낫: 400→2400 Hz 휙 + 2600 Hz 금속 울림
    N(S, 0, 0.22, 0.9, { f: ['bandpass', 400, 2400, 1.4, 0.2], a: 0.1 });
    FM(S, 2600, 1.41, 0.8, 0.15, 0.6, 0.1, { fd: 0.2 });
    T(S, 'sine', 3900, 0, 0.16, 0.35, 0.025, { a: 0.003 });
    N(S, 0.15, 0.02, 0.2, { f: ['highpass', 3500] });
  } },
  soul_reap: { max: 2, gap: 0.15, rev: 0.5, vary: 0.02, vol: 1.2, fn(S, { T, N }) {
    // 영혼 거두기: 거꾸로 차오르는 삼각파 합창 화음 + 노이즈, 끝에 끊기는 휙
    [[57, -8], [60, 7], [64, -5], [69, 9]].forEach(([m, d]) => T(S, 'triangle', M(m), 0, 0, 0.62, 0.075, { a: 0.5, det: d, vib: [5, 10] }));
    T(S, 'sawtooth', M(45), 0, 0, 0.62, 0.035, { a: 0.5, f: ['lowpass', 700] });
    N(S, 0, 0.62, 0.13, { f: ['bandpass', 700, 2600, 1.2], a: 0.5 });
    N(S, 0.5, 0.16, 0.22, { f: ['highpass', 1600], a: 0.004 });
  } },
  // ── 알·합류·유대·낙마·협공 ──
  egg_crack: { max: 2, gap: 0.1, rev: 0.2, vary: 0.04, vol: 1.2, fn(S, { T, N }) {
    // 알 깨짐: 바삭한 금 ×3 (고역 노이즈) + 작은 삐약
    for (const at of [0, 0.15, 0.26]) {
      N(S, at, 0.02, 0.6, { f: ['highpass', 2800] });
      N(S, at, 0.05, 0.45, { f: ['bandpass', 1500, 0, 2.5] });
    }
    T(S, 'sine', 1800, 2700, 0.42, 0.15, 0.2, { a: 0.02, vib: [18, 50], sw: 0.1 });
  } },
  companion_join: { max: 1, gap: 0.5, rev: 0.5, vary: 0, vol: 1.3, duck: [0.45, 1.1], fn(S, { T, N, FM }) {
    // 합류 팡파르 1.2초: 오르간 화음 C–E–G–C' 아르페지오 + 종
    [60, 64, 67, 72].forEach((m, i) => T(S, 'organ', M(m), 0, i * 0.1, 1.2 - i * 0.1, 0.085, { a: 0.02, hold: 0.55 - i * 0.08 }));
    T(S, 'organ', M(48), 0, 0, 1.2, 0.085, { a: 0.03, hold: 0.6 });
    FM(S, M(84), 3.5, 1.2, 0.4, 0.8, 0.11, { fd: 0.3 });
    T(S, 'sine', M(91), 0, 0.4, 0.6, 0.035, { a: 0.003 });
    N(S, 0.3, 0.8, 0.03, { f: ['highpass', 6500], a: 0.1 });
  } },
  bond_up: { max: 2, gap: 0.1, rev: 0.35, vary: 0.01, vol: 1.0, fn(S, { T }) {
    // 유대 상승: 두 음 하트 방울 1047/1319 Hz
    T(S, 'sine', 1047, 0, 0, 0.5, 0.16, { a: 0.004, fm: [2, 0.3, 0.1] });
    T(S, 'sine', 1319, 0, 0.11, 0.6, 0.16, { a: 0.004, fm: [2, 0.3, 0.1] });
    T(S, 'triangle', 2638, 0, 0.11, 0.2, 0.025);
  } },
  knock_off: { max: 1, gap: 0.2, rev: 0.2, vary: 0.03, vol: 1.2, fn(S, { T, N, CRACKLE }) {
    // 낙마: 쿵 + 아픈 울음 (탈것 고유 울음은 playKnockOff 가 1.3배 높이로 겹친다)
    T(S, 'sine', 110, 40, 0, 0.3, 0.5, { sw: 0.22 });
    N(S, 0, 0.22, 0.3, { f: ['lowpass', 1400, 200, 0.8] });
    CRACKLE(S, 0.03, 0.18, 3, 0.1, 1400);
    voice(S, { at: 0.04, dur: 0.42, vol: 0.3, fp: [[0, 820], [0.07, 980], [0.42, 460]], bp: [[0, 1600], [0.42, 850]], q: 2.6, vib: [11, 90], trem: [11, 0.5], a: 0.02, hold: 0.08 });
  } },
  assist: { max: 3, gap: 0.05, rev: 0.2, vary: 0.03, vol: 0.9, fn(S, { T, N }) {
    // 협공: 짧은 휙 + 1760 Hz 딩
    N(S, 0, 0.12, 0.55, { f: ['bandpass', 900, 3600, 1.3], a: 0.04 });
    T(S, 'sine', 1760, 0, 0.07, 0.36, 0.19, { a: 0.003, fm: [3, 0.4, 0.08] });
    T(S, 'triangle', 3520, 0, 0.07, 0.12, 0.03);
  } },
  // ── 2부 울음소리 ──
  stag_call: { max: 1, gap: 0.3, rev: 0.45, vary: 0.03, vol: 1.2, fn(S, { T, N }) {
    // 백록 실바: 낮은 끙 뒤에 피리처럼 오르는 영혼의 부름 (600→1500→1200 Hz) + 숨결 + 신령 반짝임
    voice(S, { dur: 0.3, vol: 0.6, fp: [[0, 160], [0.3, 210]], bp: [[0, 520], [0.3, 760]], q: 2.5, vib: [22, 30], a: 0.03 });
    const b = T(S, 'triangle', 620, 1500, 0.18, 0.95, 0.14, { a: 0.1, hold: 0.4, sw: 0.32, vib: [6, 18] });
    b.frequency.exponentialRampToValueAtTime(1200 * S.p, S.t + 1.05);
    T(S, 'sine', 1240, 3000, 0.2, 0.9, 0.03, { a: 0.1, hold: 0.35, sw: 0.3 });
    N(S, 0.15, 0.95, 0.07, { f: ['bandpass', 1600, 2400, 1.2], a: 0.15, hold: 0.3 });
    T(S, 'sine', 2400, 0, 0.55, 0.55, 0.025, { a: 0.02 });
  } },
  griffin_cry: { max: 2, gap: 0.25, rev: 0.35, vary: 0.04, vol: 1.2, fn(S, { T, N }) {
    // 폭풍 그리핀 게일: 독수리의 날카로운 '키이—' 내려가는 비명 + 사자 같은 낮은 으르렁 + 바람
    voice(S, { dur: 0.56, vol: 0.3, fp: [[0, 1900], [0.08, 2300], [0.56, 1250]], bp: [[0, 2500], [0.56, 1600]], q: 1.6, vib: [34, 60], a: 0.02, hold: 0.26 });
    T(S, 'square', 1150, 640, 0.02, 0.5, 0.03, { a: 0.02, hold: 0.2, f: ['bandpass', 2200, 0, 3] });
    T(S, 'sawtooth', 150, 105, 0, 0.5, 0.03, { a: 0.03, hold: 0.15, f: ['lowpass', 620], vib: [26, 40] });
    N(S, 0, 0.55, 0.08, { f: ['bandpass', 3000, 1600, 1.4], a: 0.03 });
  } },
  mirror_chime: { max: 2, gap: 0.12, rev: 0.55, vary: 0.02, vol: 1.1, fn(S, { T, N, FM }) {
    // 거울 요정 미라: 유리 방울 두 음이 거울에 비친 듯 점점 작게 세 번 되울린다
    for (let k = 0; k < 3; k++) {
      const at = k * 0.13, v = Math.pow(0.5, k);
      FM(S, 2349, 3.1, 0.5, at, 0.5, 0.15 * v, { fd: 0.12, a: 0.002 });
      FM(S, 3136, 3.1, 0.4, at + 0.05, 0.45, 0.1 * v, { fd: 0.1, a: 0.002 });
    }
    N(S, 0, 0.3, 0.05, { f: ['highpass', 7000], a: 0.02 });
  } },
  jelly_zap: { max: 3, gap: 0.08, rev: 0.2, vary: 0.04, vol: 1.0, fn(S, { T, N, CRACKLE }) {
    // 등불 해파리 루멘: '삐릿— 삐릿—' 전기 짹짹 두 번 + 지직 + 물속 뽀록
    for (const at of [0, 0.15]) {
      T(S, 'square', 1500, 2400, at, 0.09, 0.08, { a: 0.004, f: ['bandpass', 2600, 0, 2], vib: [60, 120] });
      N(S, at, 0.05, 0.2, { f: ['highpass', 3500] });
    }
    CRACKLE(S, 0, 0.24, 4, 0.14, 4000);
    T(S, 'sine', 300, 720, 0.02, 0.2, 0.2, { a: 0.01 });
  } },
  momo_gulp: { max: 2, gap: 0.2, rev: 0.2, vary: 0.04, vol: 1.0, fn(S, { T, N }) {
    // 꿈먹는 맥 모모: 우물우물 두 번 → 꿀꺽 → 작은 '꺼억'
    for (const at of [0, 0.12]) {
      N(S, at, 0.08, 0.7, { f: ['lowpass', 700, 300, 1], a: 0.01 });
      N(S, at + 0.01, 0.06, 0.4, { f: ['bandpass', 900, 500, 4], a: 0.01 });
    }
    T(S, 'sine', 320, 120, 0.27, 0.14, 0.34, { a: 0.01, sw: 0.1 });
    N(S, 0.27, 0.1, 0.16, { f: ['bandpass', 500, 250, 4], a: 0.01 });
    voice(S, { at: 0.43, dur: 0.2, vol: 0.5, fp: [[0, 120], [0.2, 95]], bp: [[0, 520], [0.2, 420]], q: 3, trem: [24, 0.7], a: 0.02 });
  } },
};

/** 등록되는 이름 31종 (MASTER_PLAN §1.9 동료 26 + 2부 울음 5, 표 순서) */
export const CMP_SFX_NAMES = Object.freeze(Object.keys(CMP_SFX));

/** defineSfx 로 모두 등록한다 (다시 불러도 같은 정의로 교체될 뿐). 돌려주는 값: 등록된 수 */
export function registerCompanionSfx() {
  let n = 0;
  for (const name of CMP_SFX_NAMES) if (defineSfx(name, CMP_SFX[name], CMP_SFX[name].vol)) n++;
  return n;
}
// import 시점 등록. 순환 import 로 audio.js 가 아직 평가되지 않았다면(TDZ) 모듈 그래프 평가 뒤 한 번 더 시도한다.
try { registerCompanionSfx(); } catch { Promise.resolve().then(() => { try { registerCompanionSfx(); } catch { /* audio.js 없음 → _default 로 재생 */ } }); }

// ─────────────────────────────── 재생 도우미 ───────────────────────────────
/** 동료 울음소리: def.cry = { sfx, pitch, extra? } (data/companions.js). o = { vol, pitch(곱), pan, delay }.
 *  extra(예: 'bone_rattle', 'fire')는 0.06초 늦게 0.7 음량으로 겹친다. def 가 없거나 cry 가 없으면 아무것도 하지 않는다. */
export function playCry(def, o = E0) {
  const cry = def?.cry;
  if (!cry?.sfx) return;
  const vol = o.vol ?? 1, delay = o.delay ?? 0;
  audio.sfx(cry.sfx, { vol, pitch: (cry.pitch ?? 1) * (o.pitch ?? 1), pan: o.pan, delay });
  if (cry.extra) audio.sfx(cry.extra, { vol: vol * 0.7, pan: o.pan, delay: delay + 0.06 });
}
/** 낙마 (companions §3.7): knock_off 뒤에 그 탈것의 울음을 1.3배 높이로 */
export function playKnockOff(def, o = E0) {
  const vol = o.vol ?? 1;
  audio.sfx('knock_off', { vol, pan: o.pan });
  playCry(def, { vol: vol * 0.55, pitch: 1.3, pan: o.pan, delay: 0.08 });
}
