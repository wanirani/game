// 체감(feel) 효과음 45종 — 이동·타격·콤보·필살기·각성 연출용 (feel §4.11, MASTER_PLAN §1.9)
//  audio.js 가 import 해서 SFX 에 병합하고, 각 fn 을 fn(S, H) 로 부른다.
//  H = { T, N, FM, ARP, BOOM, CRACKLE, mtof, R } — audio.js 의 합성 도우미 (톤·노이즈·FM·아르페지오·붐·크래클).
//  이 파일은 audio.js 를 import 하지 않는다 (순환 import 금지).
//
// 정의 필드: fn(S, H) 합성, max 동명 동시 수, gap 중복 억제(초), rev 잔향 송신, vary 피치 랜덤, vol 체감 음량 보정,
//           duck [amount, time] 음악 덕킹, prio 예산 제외(연출음), layer 'hit' 재질 레이어(hit* 7개 이상 재생 중이면 생략),
//           lead 타격 지점까지의 선행 시간(초) — awaken_stinger 는 0.4초 먼저 재생해야 타격이 박자에 맞는다.
// 호출부 음량: 발소리 walk 0.12 / run 0.18 / sprint 0.24 (feel §3.4), 재질 레이어는 hit/hit_heavy 와 함께.

const M = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const FEEL_SFX = {
  // ─────────────── 발소리 (표면별: 노이즈 클릭 + 낮은 사인 쿵) ───────────────
  step_stone: { max: 3, gap: 0.05, vary: 0.02, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.045, 0.32, { f: ['lowpass', 2000, 520, 0.8] });
    N(S, 0.002, 0.012, 0.12, { f: ['highpass', 3800] });
    T(S, 'sine', 115, 62, 0, 0.055, 0.24);
    N(S, 0.008, 0.018, 0.07, { f: ['bandpass', 2600, 0, 2.5] });
  } },
  step_dirt: { max: 3, gap: 0.05, vary: 0.02, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.07, 0.34, { f: ['lowpass', 950, 240, 0.7], a: 0.004 });
    T(S, 'sine', 92, 54, 0, 0.065, 0.24);
    N(S, 0.006, 0.035, 0.08, { f: ['bandpass', 1700, 900, 1.1] });
  } },
  step_wood: { max: 3, gap: 0.05, vary: 0.02, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.05, 0.42, { f: ['bandpass', 900, 0, 3.2] });
    T(S, 'triangle', 245, 185, 0, 0.065, 0.12);
    T(S, 'sine', 125, 78, 0, 0.06, 0.18);
    N(S, 0, 0.01, 0.08, { f: ['highpass', 3200] });
  } },
  step_metal: { max: 3, gap: 0.05, vary: 0.02, vol: 1, fn(S, { T, N, FM }) {
    N(S, 0, 0.014, 0.16, { f: ['highpass', 2600] });
    N(S, 0, 0.035, 0.14, { f: ['bandpass', 1250, 0, 2] });
    T(S, 'sine', 132, 80, 0, 0.05, 0.16);
    FM(S, 1850, 2.76, 1.2, 0.002, 0.2, 0.05, { fd: 0.07 });
  } },
  step_snow: { max: 3, gap: 0.05, vary: 0.02, vol: 1, fn(S, { T, N, CRACKLE }) {
    N(S, 0, 0.075, 0.26, { f: ['highpass', 2300, 0, 0.7], a: 0.012 });
    N(S, 0.01, 0.055, 0.14, { f: ['bandpass', 4200, 2200, 1.2] });
    CRACKLE(S, 0, 0.06, 3, 0.08, 5200);
    T(S, 'sine', 82, 54, 0, 0.05, 0.1);
  } },
  step_water: { max: 3, gap: 0.05, vary: 0.02, vol: 1, fn(S, { T, N, R }) {
    N(S, 0, 0.13, 0.3, { f: ['bandpass', 1500, 480, 0.9], a: 0.004 });
    N(S, 0, 0.045, 0.1, { f: ['highpass', 3600] });
    for (let i = 0; i < 2; i++) T(S, 'sine', 600 + R() * 500, 1500 + R() * 700, 0.02 + R() * 0.06, 0.04, 0.05);
    T(S, 'sine', 92, 56, 0, 0.05, 0.12);
  } },
  step_bone: { max: 3, gap: 0.05, vary: 0.02, vol: 1, fn(S, { T, N, CRACKLE }) {
    N(S, 0, 0.045, 0.28, { f: ['lowpass', 2000, 520, 0.8] });
    T(S, 'sine', 115, 62, 0, 0.055, 0.22);
    N(S, 0.003, 0.022, 0.12, { f: ['bandpass', 2900, 0, 4] });
    CRACKLE(S, 0.004, 0.05, 3, 0.12, 3000);
  } },
  step_flesh: { max: 3, gap: 0.05, vary: 0.02, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.085, 0.36, { f: ['lowpass', 760, 280, 1], a: 0.006 });
    N(S, 0.006, 0.065, 0.15, { f: ['bandpass', 950, 380, 4] });
    T(S, 'sine', 150, 68, 0, 0.08, 0.18);
    T(S, 'sine', 320, 130, 0.01, 0.06, 0.05, { f: ['lowpass', 900] });
  } },
  step_push: { max: 2, gap: 0.06, vary: 0.03, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.1, 0.3, { f: ['bandpass', 700, 2300, 1.2], a: 0.02 });
    T(S, 'sine', 104, 58, 0, 0.055, 0.18);
    N(S, 0, 0.012, 0.06, { f: ['highpass', 3400] });
  } },
  // ─────────────── 이동 전환 ───────────────
  skid: { max: 2, gap: 0.08, vary: 0.04, vol: 1, fn(S, { T, N, CRACKLE }) {
    N(S, 0, 0.26, 0.34, { f: ['bandpass', 1900, 850, 1.5], a: 0.012, hold: 0.08 });
    N(S, 0.01, 0.2, 0.1, { f: ['highpass', 4600], a: 0.02 });
    CRACKLE(S, 0.01, 0.18, 5, 0.08, 3400);
    T(S, 'sine', 92, 58, 0, 0.08, 0.14);
  } },
  pivot: { max: 2, gap: 0.06, vary: 0.04, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.1, 0.34, { f: ['bandpass', 2500, 1100, 2], a: 0.005 });
    N(S, 0, 0.05, 0.18, { f: ['lowpass', 620] });
    T(S, 'sine', 140, 80, 0, 0.05, 0.15);
  } },
  land_heavy: { max: 2, gap: 0.08, rev: 0.12, vary: 0.03, vol: 1, fn(S, { T, N, CRACKLE }) {
    N(S, 0, 0.022, 0.32, { f: ['highpass', 2400] });
    T(S, 'sine', 96, 32, 0, 0.3, 0.8, { sw: 0.2 });
    N(S, 0, 0.26, 0.5, { f: ['lowpass', 1500, 150, 0.7] });
    CRACKLE(S, 0.02, 0.2, 6, 0.12, 1800);
  } },
  dash_burst: { max: 2, gap: 0.05, rev: 0.1, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.22, 0.5, { f: ['bandpass', 420, 3400, 1.1, 0.16], a: 0.012 });
    N(S, 0, 0.06, 0.14, { f: ['highpass', 5200] });
    T(S, 'sine', 185, 70, 0, 0.1, 0.3);
    T(S, 'sawtooth', 92, 46, 0, 0.1, 0.07, { f: ['lowpass', 620] });
  } },
  // ─────────────── 공중 콤보·바운드·다운 ───────────────
  launch: { max: 2, gap: 0.05, rev: 0.12, vol: 1, fn(S, { T, N }) {
    T(S, 'sine', 115, 44, 0, 0.14, 0.62);
    N(S, 0, 0.022, 0.3, { f: ['highpass', 2200] });
    N(S, 0.01, 0.26, 0.38, { f: ['bandpass', 600, 3800, 1.3, 0.22], a: 0.03 });
    T(S, 'triangle', 300, 920, 0.02, 0.18, 0.07, { sw: 0.15 });
  } },
  wall_bounce: { max: 2, gap: 0.08, rev: 0.2, vol: 1, fn(S, { T, N, CRACKLE }) {
    N(S, 0, 0.025, 0.4, { f: ['highpass', 2000] });
    T(S, 'sine', 92, 34, 0, 0.22, 0.85);
    N(S, 0.002, 0.22, 0.55, { f: ['lowpass', 2600, 200, 0.8] });
    T(S, 'square', 260, 90, 0, 0.08, 0.08, { f: ['lowpass', 900] });
    CRACKLE(S, 0.02, 0.15, 6, 0.15, 1500);
  } },
  ground_bounce: { max: 2, gap: 0.08, rev: 0.22, vol: 1, fn(S, { T, N, BOOM, CRACKLE }) {
    N(S, 0, 0.03, 0.42, { f: ['highpass', 1800] });
    BOOM(S, 0, 0.36, 0.72, 82);
    T(S, 'sine', 210, 60, 0, 0.06, 0.25);
    CRACKLE(S, 0.03, 0.22, 7, 0.15, 1400);
  } },
  down_hit: { max: 3, gap: 0.04, rev: 0.08, vol: 1, fn(S, { T, N }) {
    T(S, 'sine', 150, 44, 0, 0.15, 0.72);
    N(S, 0, 0.13, 0.45, { f: ['lowpass', 1800, 250, 0.8] });
    N(S, 0, 0.05, 0.2, { f: ['bandpass', 720, 0, 2] });
    T(S, 'square', 300, 110, 0, 0.05, 0.08, { f: ['lowpass', 1200] });
  } },
  // ─────────────── 카운터·백어택 ───────────────
  counter: { max: 2, gap: 0.06, rev: 0.3, vol: 1, fn(S, { T, N, FM }) {
    N(S, 0, 0.03, 0.36, { f: ['highpass', 5000] });
    FM(S, 2637, 3.01, 2.2, 0, 0.38, 0.2, { fd: 0.1 });
    T(S, 'triangle', 1760, 2637, 0, 0.06, 0.06, { sw: 0.03 });
    T(S, 'sine', 5274, 0, 0.002, 0.26, 0.05);
  } },
  back_attack: { max: 2, gap: 0.06, rev: 0.15, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.06, 0.26, { f: ['bandpass', 3000, 6000, 2] });
    T(S, 'square', 880, 1320, 0, 0.07, 0.05, { hold: 0.02, f: ['lowpass', 3200], sw: 0.04 });
    T(S, 'sine', 1760, 0, 0.04, 0.12, 0.05);
  } },
  // ─────────────── 재질 타격 레이어 (hit/hit_heavy 위에 겹침) ───────────────
  hit_flesh: { max: 3, gap: 0.035, rev: 0.05, layer: 'hit', vol: 1, fn(S, { T, N, CRACKLE }) {
    N(S, 0, 0.12, 0.45, { f: ['lowpass', 1800, 340, 0.9], a: 0.003 });
    N(S, 0.004, 0.1, 0.26, { f: ['bandpass', 720, 300, 3] });
    T(S, 'sine', 180, 70, 0, 0.08, 0.2);
    CRACKLE(S, 0.02, 0.09, 3, 0.08, 1100);
  } },
  hit_bone: { max: 3, gap: 0.035, rev: 0.08, layer: 'hit', vol: 1, fn(S, { T, N, CRACKLE }) {
    N(S, 0, 0.015, 0.4, { f: ['highpass', 2500] });
    N(S, 0.002, 0.04, 0.34, { f: ['bandpass', 2200, 0, 5] });
    T(S, 'triangle', 720, 500, 0, 0.06, 0.08);
    CRACKLE(S, 0.005, 0.07, 4, 0.16, 2600);
  } },
  hit_ghost: { max: 3, gap: 0.04, rev: 0.5, layer: 'hit', vol: 1, fn(S, { T, N }) {
    T(S, 'sine', 880, 440, 0, 0.3, 0.12, { a: 0.005, vib: [9, 60] });
    T(S, 'sine', 1320, 660, 0.01, 0.26, 0.07, { a: 0.005, det: 12 });
    N(S, 0, 0.24, 0.2, { f: ['bandpass', 2600, 900, 4], a: 0.01 });
    T(S, 'sine', 220, 110, 0, 0.12, 0.12);
  } },
  hit_stone: { max: 3, gap: 0.035, rev: 0.08, layer: 'hit', vol: 1, fn(S, { T, N, CRACKLE }) {
    N(S, 0, 0.02, 0.36, { f: ['highpass', 1600] });
    N(S, 0.002, 0.12, 0.34, { f: ['bandpass', 900, 400, 1] });
    CRACKLE(S, 0.01, 0.1, 5, 0.17, 1600);
    T(S, 'sine', 140, 60, 0, 0.08, 0.24);
  } },
  impact_crack: { max: 2, gap: 0.05, rev: 0.25, vol: 1, fn(S, { T, N, CRACKLE }) {
    N(S, 0, 0.02, 0.6, { f: ['highpass', 3000] });
    CRACKLE(S, 0, 0.06, 5, 0.3, 4000);
    N(S, 0.004, 0.2, 0.4, { f: ['bandpass', 1800, 500, 1.6] });
    T(S, 'sine', 72, 30, 0, 0.36, 0.72, { sw: 0.25 });
    T(S, 'sawtooth', 180, 50, 0, 0.2, 0.12, { f: ['lowpass', 800] });
  } },
  // ─────────────── 처치 슬로모션·랭크·아나운서·콤보 ───────────────
  kill_slowmo: { max: 1, gap: 0.2, rev: 0.5, prio: true, duck: [0.4, 0.5], vary: 0.01, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.03, 0.4, { f: ['highpass', 2200] });
    T(S, 'sine', 220, 52, 0, 0.72, 0.42, { sw: 0.6, a: 0.008 });
    N(S, 0.01, 0.8, 0.28, { f: ['bandpass', 1600, 200, 1.5], a: 0.02 });
    T(S, 'sawtooth', 110, 40, 0, 0.7, 0.1, { f: ['lowpass', 700, 200, 1] });
    T(S, 'sine', 1760, 880, 0.02, 0.6, 0.04, { vib: [5, 40], a: 0.03 });
  } },
  rank_up: { max: 1, gap: 0.1, rev: 0.3, prio: true, vary: 0.01, vol: 1, fn(S, { T, N, FM, ARP }) {
    ARP(S, 'square', [72, 76, 79, 84], 0.035, 0.12, 0.05, { f: ['lowpass', 4200] });
    N(S, 0, 0.14, 0.12, { f: ['highpass', 5000], a: 0.02 });
    T(S, 'triangle', 1046.5, 2093, 0, 0.18, 0.06, { sw: 0.1 });
    FM(S, 2093, 2, 0.8, 0.14, 0.42, 0.06);
  } },
  announce: { max: 1, gap: 0.15, rev: 0.35, prio: true, vary: 0.01, vol: 1, fn(S, { T, N, BOOM }) {
    N(S, 0, 0.05, 0.34, { f: ['highpass', 3000] });
    BOOM(S, 0, 0.4, 0.5, 72);
    for (const [f, d] of [[146.8, -9], [220, 7], [293.7, -5]]) T(S, 'sawtooth', f, 0, 0, 0.42, 0.11, { det: d, hold: 0.1, a: 0.006, f: ['lowpass', 3400, 700, 1.4, 0.35] });
    T(S, 'square', 587.3, 0, 0.01, 0.2, 0.03, { f: ['lowpass', 2400] });
  } },
  combo_milestone: { max: 1, gap: 0.08, rev: 0.22, prio: true, vary: 0.005, vol: 1, fn(S, { T, N }) {
    T(S, 'square', 1318.5, 0, 0, 0.08, 0.07, { hold: 0.03, f: ['lowpass', 5000] });
    T(S, 'square', 1760, 0, 0.07, 0.16, 0.07, { hold: 0.04, f: ['lowpass', 5000] });
    T(S, 'triangle', 2637, 0, 0.07, 0.28, 0.06);
    N(S, 0.07, 0.06, 0.1, { f: ['highpass', 6000] });
  } },
  // ─────────────── 필살기 마무리 ───────────────
  ult_impact: { max: 1, gap: 0.1, rev: 0.45, prio: true, duck: [0.6, 1.2], vary: 0.01, vol: 1, fn(S, { T, N, FM, BOOM, CRACKLE }) {
    N(S, 0, 0.04, 0.9, { f: ['highpass', 1200] });
    BOOM(S, 0, 1.1, 1, 86);
    T(S, 'sawtooth', 160, 40, 0, 0.6, 0.16, { f: ['lowpass', 1200, 200, 1] });
    CRACKLE(S, 0.04, 0.6, 10, 0.24, 1800);
    FM(S, 880, 1.41, 2.5, 0.01, 0.8, 0.07, { fd: 0.3 });
    N(S, 0.05, 1.2, 0.28, { f: ['bandpass', 600, 150, 0.8], a: 0.05 });
  } },
  impact_frame: { max: 1, gap: 0.08, rev: 0.2, prio: true, vary: 0.01, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.03, 0.7, { f: ['highpass', 2500] });
    T(S, 'sine', 62, 30, 0, 0.26, 0.6);
    T(S, 'square', 110, 55, 0, 0.12, 0.1, { f: ['lowpass', 1500] });
    N(S, 0.004, 0.07, 0.18, { f: ['bandpass', 4000, 0, 8] });
  } },
  // ─────────────── 각성기 (홀드·차지·컷인·스팅어·폭발) ───────────────
  awaken_hold: { max: 1, gap: 0.2, rev: 0.3, prio: true, vary: 0, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.5, 0.3, { f: ['bandpass', 300, 2800, 2, 0.48], a: 0.42 });
    T(S, 'sawtooth', 110, 440, 0, 0.5, 0.06, { a: 0.4, sw: 0.48, f: ['lowpass', 1600] });
    T(S, 'sine', 220, 880, 0, 0.5, 0.05, { a: 0.4, sw: 0.48 });
  } },
  awaken_charge: { max: 1, gap: 0.3, rev: 0.45, prio: true, duck: [0.5, 1.5], vary: 0, vol: 1, fn(S, { T, N }) {
    T(S, 'sine', 92, 40, 0, 0.32, 0.6);
    N(S, 0, 0.3, 0.4, { f: ['lowpass', 2200, 200, 0.8] });
    N(S, 0, 0.36, 0.28, { f: ['bandpass', 3000, 400, 1.2], a: 0.24 });
    T(S, 'sawtooth', 55, 0, 0, 0.8, 0.1, { a: 0.05, hold: 0.3, det: -8, f: ['lowpass', 480] });
    T(S, 'sawtooth', 55, 0, 0, 0.8, 0.1, { a: 0.05, hold: 0.3, det: 8, f: ['lowpass', 480] });
    T(S, 'triangle', 880, 1760, 0.05, 0.36, 0.05, { vib: [7, 30], a: 0.04 });
  } },
  cutin_whoosh: { max: 2, gap: 0.06, rev: 0.15, prio: true, vary: 0.02, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.2, 0.5, { f: ['bandpass', 500, 4000, 1.4, 0.16], a: 0.06 });
    N(S, 0, 0.12, 0.12, { f: ['highpass', 6000], a: 0.05 });
    T(S, 'sine', 300, 120, 0.1, 0.12, 0.12);
  } },
  brush_stroke: { max: 3, gap: 0.03, rev: 0.12, prio: true, vary: 0.08, vol: 1, fn(S, { N }) {
    N(S, 0, 0.1, 0.4, { f: ['bandpass', 600, 3000, 1.6, 0.09], a: 0.01 });
    N(S, 0.01, 0.06, 0.08, { f: ['highpass', 5000] });
  } },
  seal_stamp: { max: 1, gap: 0.1, rev: 0.25, prio: true, vary: 0.02, vol: 1, fn(S, { T, N }) {
    T(S, 'sine', 180, 120, 0, 0.12, 0.5);
    N(S, 0, 0.07, 0.35, { f: ['bandpass', 700, 0, 4] });
    T(S, 'triangle', 360, 300, 0, 0.08, 0.1);
    N(S, 0, 0.1, 0.25, { f: ['lowpass', 400] });
  } },
  eye_glint: { max: 1, gap: 0.1, rev: 0.5, prio: true, vary: 0.01, vol: 1, fn(S, { T, N, FM }) {
    T(S, 'sine', 3136, 0, 0, 0.4, 0.1);
    T(S, 'sine', 4186, 0, 0.02, 0.35, 0.07);
    FM(S, 2637, 3.5, 1.5, 0, 0.3, 0.06, { fd: 0.1 });
    N(S, 0, 0.15, 0.06, { f: ['highpass', 8000], a: 0.02 });
  } },
  // 타이코 + 합창 코드(디튠 톱니 4성, 로우패스 2400, 1.2초) + 0.4초 전부터 차오르는 역재생 심벌. 타격은 0.4초 지점(lead)
  awaken_stinger: { max: 1, gap: 0.5, rev: 0.55, prio: true, duck: [0.7, 1.6], vary: 0, lead: 0.4, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.41, 0.36, { a: 0.39, f: ['highpass', 4800, 0, 0.7] });
    N(S, 0.04, 0.37, 0.22, { a: 0.35, f: ['bandpass', 1500, 6000, 0.8] });
    T(S, 'sine', 70, 40, 0.4, 0.7, 1, { sw: 0.35 });
    N(S, 0.4, 0.3, 0.55, { f: ['lowpass', 1400, 180, 0.8] });
    N(S, 0.4, 0.025, 0.4, { f: ['bandpass', 1800, 0, 1.5] });
    T(S, 'triangle', 140, 80, 0.4, 0.2, 0.2);
    for (const [m, d] of [[50, -12], [53, 9], [57, -7], [62, 13]]) T(S, 'sawtooth', M(m), 0, 0.4, 1.2, 0.065, { a: 0.07, hold: 0.45, det: d, vib: [5, 10], f: ['lowpass', 2400, 0, 0.7] });
  } },
  awaken_boom: { max: 1, gap: 0.3, rev: 0.55, prio: true, duck: [0.75, 2], vary: 0, vol: 1, fn(S, { T, N, FM, BOOM, CRACKLE }) {
    N(S, 0, 0.05, 1, { f: ['highpass', 1000] });
    BOOM(S, 0, 1.6, 1, 76);
    T(S, 'sawtooth', 120, 30, 0, 1, 0.18, { f: ['lowpass', 1500, 150, 1] });
    T(S, 'sine', 55, 28, 0.05, 1.6, 0.45, { sw: 1.2 });
    CRACKLE(S, 0.05, 0.9, 14, 0.24, 1600);
    FM(S, 440, 1.41, 3, 0.02, 1.4, 0.07, { fd: 0.5 });
    N(S, 0.08, 1.8, 0.32, { f: ['lowpass', 800, 100, 0.7], a: 0.06 });
  } },
  // ─────────────── 영웅별 각성 연출음 ───────────────
  heartbeat: { max: 2, gap: 0.15, rev: 0.2, prio: true, vary: 0.01, vol: 1, fn(S, { T, N }) {
    T(S, 'sine', 62, 40, 0, 0.13, 0.8);
    T(S, 'triangle', 124, 80, 0, 0.08, 0.08);
    N(S, 0, 0.08, 0.3, { f: ['lowpass', 320] });
    T(S, 'sine', 56, 38, 0.16, 0.14, 0.6);
    N(S, 0.16, 0.08, 0.22, { f: ['lowpass', 280] });
  } },
  crow_caw: { max: 1, gap: 0.3, rev: 0.5, prio: true, vary: 0.03, vol: 1, fn(S, { T, N }) {
    for (const [at, f0, f1] of [[0, 740, 560], [0.3, 680, 500]]) {
      T(S, 'sawtooth', f0, f1, at, 0.22, 0.2, { a: 0.01, vib: [30, 80], f: ['bandpass', 1400, 0, 3] });
      T(S, 'square', f0 * 0.98, f1, at, 0.2, 0.05, { a: 0.01, f: ['bandpass', 2400, 0, 4] });
      N(S, at, 0.2, 0.15, { a: 0.01, f: ['bandpass', 1800, 0, 2] });
    }
  } },
  finger_snap: { max: 1, gap: 0.2, rev: 0.4, prio: true, vary: 0.02, vol: 1, fn(S, { T, N }) {
    N(S, 0, 0.012, 0.9, { f: ['highpass', 2000] });
    N(S, 0, 0.04, 0.4, { f: ['bandpass', 2600, 0, 6] });
    T(S, 'sine', 1800, 1200, 0, 0.02, 0.1);
  } },
  cylinder_spin: { max: 1, gap: 0.4, rev: 0.2, prio: true, vary: 0.02, vol: 1, fn(S, { T, N }) {
    // 라쳇 12회 (빨라졌다 느려짐) + 회전 휘잉 + 마지막 잠금 딸깍
    let at = 0;
    for (let i = 0; i < 12; i++) {
      N(S, at, 0.012, 0.3, { f: ['bandpass', 3500, 0, 6] });
      T(S, 'square', 2400, 0, at, 0.008, 0.04);
      at += 0.03 + Math.abs(i - 4) * 0.009;
    }
    N(S, 0, at, 0.08, { f: ['bandpass', 1200, 900, 3], a: 0.05 });
    N(S, at + 0.02, 0.02, 0.5, { f: ['highpass', 2500] });
    T(S, 'sine', 1400, 0, at + 0.02, 0.05, 0.08);
  } },
  choir_gate: { max: 1, gap: 0.5, rev: 0.6, prio: true, duck: [0.4, 1.6], vary: 0, vol: 1, fn(S, { T, N, FM }) {
    for (const [m, d] of [[62, -10], [66, 8], [69, -6], [74, 12]]) T(S, 'sawtooth', M(m), 0, 0, 1.6, 0.05, { a: 0.3, hold: 0.6, det: d, vib: [5, 12], f: ['lowpass', 2400, 0, 0.7] });
    for (const m of [74, 78, 81]) T(S, 'triangle', M(m), 0, 0.05, 1.4, 0.03, { a: 0.25, hold: 0.5 });
    FM(S, 1174.7, 3.5, 1.2, 0.05, 1.5, 0.05, { fd: 0.4 });
    N(S, 0, 1.2, 0.08, { f: ['highpass', 6000], a: 0.4 });
  } },
  war_horn: { max: 1, gap: 0.5, rev: 0.55, prio: true, duck: [0.35, 1.3], vary: 0, vol: 1, fn(S, { T }) {
    T(S, 'sawtooth', 98, 110, 0, 1.25, 0.14, { a: 0.12, hold: 0.6, sw: 0.15, lin: true, vib: [4.5, 10], f: ['lowpass', 650, 1400, 1.2, 0.3] });
    T(S, 'sawtooth', 146.8, 164.8, 0.04, 1.15, 0.08, { a: 0.15, hold: 0.55, sw: 0.15, lin: true, vib: [4.7, 8], f: ['lowpass', 900] });
    T(S, 'square', 55, 0, 0, 1.2, 0.06, { a: 0.1, hold: 0.6, f: ['lowpass', 300] });
  } },
  sheath: { max: 1, gap: 0.2, rev: 0.3, prio: true, vary: 0.02, vol: 1, fn(S, { T, N, FM }) {
    N(S, 0, 0.18, 0.2, { f: ['bandpass', 3000, 6000, 3], a: 0.08 });
    N(S, 0.2, 0.015, 0.6, { f: ['highpass', 3000] });
    FM(S, 2200, 2.76, 1.4, 0.2, 0.25, 0.08, { fd: 0.06 });
    T(S, 'sine', 800, 600, 0.2, 0.03, 0.1);
  } },
};

// 모든 체감 효과음 표시 (audio.js 의 100ms 예산 계산에 쓰인다)
for (const k in FEEL_SFX) FEEL_SFX[k].feel = true;

/** 체감 효과음 이름 목록 (검증 도구용) */
export const FEEL_SFX_NAMES = Object.keys(FEEL_SFX);
