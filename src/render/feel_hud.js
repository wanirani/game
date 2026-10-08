// 콤보·스타일 HUD · 알림(아나운서) · 각성 게이지와 준비 문구 — owner: FEEL-HUD (W2; hud.js 쪽 정리는 HUD-FINAL W3)
// feel.md §4.10 (콤보·스타일·알림), §6.1 (각성 게이지 UI), §9 WP3. 위치는 MASTER_PLAN §1.8 → hud_layout.js 의 hudLayout() 만 쓴다
// (feel §4.10 의 픽셀 위치·'터치에서 80 px 내리기' 는 §1.8 이 대신한다). 여기서 새 영역 좌표를 정하지 않는다.
//
// ── 그리기 계약: hud.js drawHUD 가 이 순서로 부른다 (각 함수는 ctx 상태를 위젯마다 save/restore 한 번으로 되돌린다) ──
//  0. hudOverflow(world, 'combo' | 'transient') → true = 이번 프레임에 그 위젯이 칸 밖으로 넘치는 연출 중
//       (콤보 열: 랭크 글자 등장 0.16초 · 이정표 박힘 0.12초 / 알림: 단어 2.2배 박힘 · 색수차 0.15초). hud.js 는 그때만
//       다른 영역을 빼는 클립(avoidClip)을 건다 — 쉬는 그림은 칸 안에 들어가므로 매 프레임 자르지 않는다 (R1-REQ-330).
//  1. drawAwGauge(ctx, world, x, y, w, touch) → true = 준비 문구 칸까지 맡았다 (hud.js 는 기존 '필살기 준비!' 를 그리지 않는다)
//                                              false = world.player/run 이 없다 (hud.js 가 기존 문구를 그린다)
//       (x, y, w) = L.awGauge (120×20). 준비 문구는 바로 아래 칸 (x, y + 22, w + 10, 22) = L.ready 에 그린다.
//       1차 전직(tier ≥ 1)부터: '각성'(2차 전직은 '진 각성') + 120×6 핏빛 막대 (흐르는 광택, 맺혔다 떨어지는 핏방울).
//       0차 전직은 막대를 그리지 않는다 (feel §6.1).
//       두 게이지(SP·각성)가 가득 차면 SP 막대와 각성 막대가 함께 빛나고 문구는 '각성 가능!' + [필살 버튼 글리프] + '길게'
//       (키보드 F 키캡 · 패드 RT · 다시 배치한 키 그대로), 터치는 '각성 가능! 필살 버튼을 길게'.
//       SP 만 가득이면 '필살기 준비!' + 필살 버튼 글리프 (0차 전직 포함; 예전처럼 깜빡인다).
//       길게 누르는 중(world.awakenState.holdK 0..1)에는 각성 막대 위로 흰 채움이 차오르고 빛이 세진다.
//  2. drawComboHUD(ctx, world, vw, vh, touch) → true = 콤보 열을 맡았다 (hud.js 의 기존 콤보 표시는 그리지 않는다) | false = world.combo 없음
//       L.combo 칸 안에 오른쪽 정렬. 칸 높이·너비에 맞춰 통째로 줄이고(낮으면 '총 피해' 줄을 뺀 작은 배치) 칸 아래로는 그리지 않는다
//       (쉬는 그림은 칸 안에 들어가고, 넘치는 연출 중에만 칸 아래·오른쪽을 자른다).
//       겹치는 순서: 붓 띠 → 랭크 글자 → 숫자·HITS·막대·총 피해 → 이정표.
//       구운 붓 띠 위 콤보 숫자 (46/52/58/64 px, 타격마다 1.35→1 로 튀고 ±3° 기울기, 랭크 색 그라데이션), 'HITS',
//       콤보 시간 핏빛 막대 (combo.t / combo.window), '총 피해 n', 왼쪽에 스타일 랭크 글자 (D~SSS, −0.12 rad, 다음 랭크까지 진행 고리),
//       콤보 이정표 '{n} HIT!' (10/25/50/100/150/200/300, 2→1 로 박힘). 콤보가 끝나면 숫자가 0.4초 동안 떠오르며 사라진다.
//  3. drawAnnouncer(ctx, world, vw, vh) → 그렸으면 true
//       L.transient 칸 가운데. hud.js 는 world.banner 가 없을 때만 부른다 → 배너(스테이지 제목·STAGE CLEAR·LEVEL UP …)가 이긴다.
//       world.style.ann.cur 를 그린다 (대기열 2·0.8초 간격·0.7초 유지 + 0.25초 사라짐은 style.js 가 관리, 효과음도 style.js).
//       붓 띠가 쓸고 지나가며 단어가 2.2→1 로 박히고(되튐) 0.15초 동안 색수차 (빨강 −2 px · 청록 +2 px), 아래에 한국어 부제 16 px.
//       칸보다 길면 40 % 까지 줄인다 (40 % 로도 칸을 넘는 아주 좁은 칸에서만 25 % 까지). 박힘·색수차 동안 칸 밖(가로 ± 6 px,
//       위 16 px·아래 6 px)을 잘라 낸다 → 2.2배 박힘의 첫 프레임도 옆 상시 영역·패드·토스트 줄을 덮지 않는다 (그 뒤 그림은 그 안에 있다).
//       SSS 는 금빛과 핏빛이 번갈아 빛난다.
//  시간: 튀기기·박힘 연출은 world.rt (실제 시간 — 히트스톱 중에도 흐른다), 알림의 유지·사라짐은 style 의 age (게임 시간).
//  동작 줄이기(settings.reduceMotion): 튀기기·기울기·박힘·색수차·붓 쓸기 없이 나타났다 사라진다. 저품질(low): 광택 흐름·핏방울 생략.
//
// ── 스프라이트 캐시 (feel §4.10 'brush banner sprite, pre-rendered'; §8·MASTER_PLAN §5.2 '스테이지 도중 새 캔버스 0') ──
//  캔버스 7장: 콤보 붓 띠 · 알림 붓 띠 · 게이지 광채 · 랭크 글자 묶음(D~SSS + SSS 핏빛) · 알림 단어 묶음(같은 순서)
//   + 콤보 열 캐시 2장 (R1-REQ-330): NUM = 콤보 숫자(외곽선·랭크 색 그라데이션·기울기, 아래 줄은 흰 번쩍임),
//     LBL = 'HITS' + '총 피해 n'. 둘 다 내용(숫자·랭크·SSS 색 단계·총 피해·화면 배율·글꼴 세대)이 바뀔 때만
//     다시 굽고, 매 프레임은 붙이기만 한다 (쉴 때는 기기 픽셀에 맞춰 1:1 로 붙여 작은 글자도 흐려지지 않는다).
//  매 프레임 요소마다 save/restore 하지 않는다: 위젯마다 한 번 저장하고, 요소 사이에는 열 기준 변환으로 되돌린다.
//  콤보 기울기는 콤보 수에서 정해지는 값이다 (그리는 중에 난수를 쓰지 않는다, R1-REQ-348).
//  부팅 1.5초 뒤 글꼴(BN Dmg · Grenze Gotisch)을 기다렸다가 한가할 때 prewarmFeelHud() 가 굽는다. 그 전에 HUD 가 먼저 그려지면 그때 굽는다.
//  글꼴이 늦게 도착하거나(ui.onFontEpoch) 화면 배율이 올라가면 한가할 때 같은 캔버스에 다시 굽는다 (새 캔버스 없음).
//  brushSprite('banner' | 'band') → 구운 붓 띠 캔버스 | null (다른 HUD 가 같은 붓 띠를 쓰고 싶을 때). 논리 크기는 BRUSH_SIZE.
//  매 프레임 새 그라데이션 없음 (숫자·광택 그라데이션은 원점 기준으로 한 번 만들어 계속 쓴다).
//
// ── 콤보 총 피해 ──
//  world.combo.dmg 가 숫자면 그것을 쓴다 (world.js 가 직접 세게 되면 — requests.jsonl). 없으면 world.style 인스턴스의 onHit 만 감싸
//  (원래 함수를 그대로 부른다) info.dmg 를 콤보 동안 더한다: 콤보가 1타부터 다시 시작하면 0. settings.showDamage 가 끔이면 숨긴다.
//
// 읽는 것 (쓰지 않는다): world.combo {n, t, window}, world.style {rank, progress, ann.cur}, world.run {sp, aw}, world.awakenState {ready, holdK},
//   world.hero {charId, classId}, world.rt, world.time, world.player, world.cutscene/cleared/mode, game.settings {reduceMotion, showDamage}, world.qualityNow().
// 주의 (순환 import): 모듈 최상위에서는 가져온 값에 접근하지 않는다 (예약 타이머·함수 안에서만).
import * as UI from '../core/ui.js';
import { text, font, FONT, COLORS } from '../core/ui.js';
import { clamp, TAU, ease, RNG, rgba, shade, mix, fmt } from '../core/math.js';
import { game } from '../core/game.js';
import { CLASSES } from '../data/classes.js';
import { STYLE } from '../data/feel_hit.js';
import * as AWD from '../data/awaken.js';
import { hudLayout, hudPx } from './hud_layout.js';
import { drawGlyph, bindingOf } from '../core/prompts.js';

// ───────────────────────── 수치 ─────────────────────────
const COL_W = 306;           // 콤보 열 설계 너비 (§1.8 x vw−320 … vw−14)
const COL_H = 108;           // 설계 높이 (y 90 … 200 안)
const COL_H_SMALL = 86;      // '총 피해' 줄을 뺀 작은 배치 (칸이 낮을 때: 휴대폰 + 안전 영역 인셋 등)
const POP_T = 0.1;           // 숫자 튀기기 1.35 → 1
const ROT_MAX = 3 * Math.PI / 180;
const END_T = 0.4;           // 콤보가 끝난 뒤 숫자가 사라지는 시간
const MILE_T = 1.2;          // 이정표 표시 시간 (0.12초 박힘 → 0.9초부터 사라짐)
const RANKUP_T = 0.16;       // 랭크 글자 등장 1.6 → 1
const SLAM_T = 0.12;         // 알림 단어 2.2 → 1 (되튐)
const CHROMA_T = 0.15;       // 색수차 시간
const RING_R = 34;           // 랭크 진행 고리 반지름 (열 좌표)
const LETTER_X = -236, LETTER_Y = 38;   // 랭크 글자 가운데 (열 오른쪽 위 기준)
const NUM_R = -20, NUM_BASE = 60;       // 콤보 숫자 오른쪽 끝·기준선
const RES = [1, 1.5, 2, 2.5];           // 굽는 배율 단계 (ui.bloodText 와 같음)
const RANK_DEF = [
  { r: 'D', min: 100, word: 'GOOD', sub: '좋아', c: '#a0a0a0' }, { r: 'C', min: 250, word: 'NICE', sub: '멋지다', c: '#7ee07e' },
  { r: 'B', min: 500, word: 'GREAT!', sub: '훌륭하다', c: '#5aa8ff' }, { r: 'A', min: 850, word: 'EXCELLENT!', sub: '굉장하다', c: '#c07cff' },
  { r: 'S', min: 1300, word: 'SAVAGE!!', sub: '잔혹하다', c: '#ffa640' }, { r: 'SS', min: 1900, word: 'INSANE!!', sub: '광란', c: '#ff5a4a' },
  { r: 'SSS', min: 2700, word: 'BLOOD NOCTURNE!!!', sub: '피의 야상곡', c: '#ffe070', c2: '#ff3040' },
];
const MILE_DEF = [10, 25, 50, 100, 150, 200, 300];
const ranks = () => (Array.isArray(STYLE?.ranks) && STYLE.ranks.length ? STYLE.ranks : RANK_DEF);
const milestones = () => (Array.isArray(STYLE?.milestones) ? STYLE.milestones : MILE_DEF);
const rankInfo = (r) => (r > 0 ? ranks()[r - 1] ?? null : null);

// 붓 띠 모양 (논리 px). top/bot = 칠한 몸통의 위·아래, 그 아래는 핏방울 자리
const BANNER = { w: 188, h: 62, slant: 16, seed: 7, drips: 3, top: 6, bot: 52 };
const BAND = { w: 470, h: 70, slant: 22, seed: 19, drips: 2, top: 6, bot: 60 };
export const BRUSH_SIZE = { banner: { w: BANNER.w, h: BANNER.h }, band: { w: BAND.w, h: BAND.h } };
const INK = ['#3a020a', '#4a040e', '#5a0612', '#6a0814', '#7a0a1a', '#8a0c1e'];
// 게이지 광채: 안쪽 (ix, iy, iw, ih) 사각형 둘레만 빛난다 → 막대 크기에 맞춰 늘여 그린다
const GLW = { w: 150, h: 34, ix: 15, iy: 12, iw: 120, ih: 10 };
// 랭크 글자 묶음 (칸 140×88, 기준선 62, 한 줄 4칸) · 알림 단어 묶음 (칸 470×64, 기준선 46)
const LET = { w: 140, h: 88, base: 62, cols: 4, size: 52 };
const WRD = { w: 470, h: 64, base: 46, size: 40, skew: -0.2 };

// ───────────────────────── 스프라이트 캐시 ─────────────────────────
/** QA 용 통계 */
export const FEEL_HUD_STATS = { canvases: 0, bakes: 0, fontRebakes: 0, prewarmed: false, syncBakes: 0, dmgHooks: 0, numBakes: 0, lblBakes: 0 };
const SPR = {
  S: 0, banner: undefined, band: null, glow: null, letters: null, words: null,
  letterW: [], wordMeta: [], lastScale: NaN, fontDirty: false, pending: false, watching: false,
  num: null, lbl: null,   // 콤보 열 캐시 캔버스 (bake('all') 에서 한 번 만든다; 내용은 numSprite / lblSprite 가 바뀔 때만 굽는다)
};

function mkCanvas() {
  if (typeof document === 'undefined' || !document.createElement) return null;
  FEEL_HUD_STATS.canvases++;
  return document.createElement('canvas');
}
/** 캔버스 크기를 맞추고 깨끗한 2D 문맥을 돌려준다 (크기가 같으면 지우기만) */
function prep(c, w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.shadowBlur = 0; g.shadowColor = 'transparent'; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
  return g;
}
/** 지금 화면 배율(뒷면 px / 논리 px)에 맞는 굽기 배율 */
function wantScale() {
  const s = Number(game?.scale) || 1;
  return RES.find((v) => v >= s * 0.92) ?? RES[RES.length - 1];
}
const idle = (f) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 500 }) : setTimeout(f, 30));

/** 붓 한 획 (평행사변형으로 기운 띠: 털 여러 가닥 + 마른 붓 틈 + 윗면 윤기 + 아래로 흐르는 핏방울). 결정적(seed) */
function paintBrush(g, B) {
  const R = new RNG(B.seed);
  const top = B.top, bot = B.bot, th = bot - top;
  const x0 = 3, len = B.w - 6 - B.slant;           // 맨 아래 가닥의 가로 범위 [x0, x0 + len]; 위로 갈수록 slant 만큼 오른쪽으로
  const N = Math.max(12, Math.round(th / 2));
  // 바탕 몸통 (가운데가 비지 않게): 가장자리가 들쭉날쭉한 평행사변형
  const at = (u, v) => [x0 + (1 - v) * B.slant + u * len, top + v * th];
  g.fillStyle = INK[2];
  g.beginPath();
  for (let u = 0.1; u <= 0.965; u += 0.035) { const [px, py] = at(u, 0.1); g.lineTo(px, py + R.range(-1.2, 1.2)); }
  for (let v = 0.1; v <= 0.9; v += 0.2) { const [px, py] = at(0.97 + R.range(-0.012, 0.012), v); g.lineTo(px, py); }
  for (let u = 0.965; u >= 0.1; u -= 0.035) { const [px, py] = at(u, 0.9); g.lineTo(px, py + R.range(-1.2, 1.2)); }
  for (let v = 0.9; v >= 0.1; v -= 0.2) { const [px, py] = at(0.1 + (1 - Math.abs(v * 2 - 1)) * -0.05 + R.range(0, 0.03), v); g.lineTo(px, py); }
  g.closePath(); g.fill();
  g.lineCap = 'round';
  for (let i = 0; i < N; i++) {
    const v = (i + 0.5) / N, y = top + v * th, off = (1 - v) * B.slant;
    const mid = 1 - Math.abs(v * 2 - 1);            // 가장자리 0 … 가운데 1 (가장자리 털은 늦게 시작해 일찍 끝난다 → 끝이 가늘다)
    const us = R.range(0, 0.1) + (1 - mid) * R.range(0.04, 0.22);
    const ue = 1 - R.range(0, 0.03) - (1 - mid) * R.range(0, 0.08);
    const xs = x0 + off + us * len, xe = x0 + off + ue * len;
    g.globalAlpha = R.range(0.8, 1);
    g.strokeStyle = INK[R.int(0, INK.length - 1)];
    g.lineWidth = (th / N) * R.range(1.3, 2.1);
    g.beginPath(); g.moveTo(xs, y + R.range(-0.5, 0.5));
    g.quadraticCurveTo((xs + xe) / 2, y + R.range(-1, 1), xe, y + R.range(-0.6, 0.6));
    g.stroke();
  }
  // 마른 붓 틈 (왼쪽, 붓이 들어간 쪽)
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0, n = Math.round(th / 3.5); k < n; k++) {
    const v = R.range(0.06, 0.94), y = top + v * th, off = (1 - v) * B.slant;
    const xs = x0 + off + R.range(0, 0.12) * len, xe = xs + R.range(0.08, 0.38) * len;
    g.globalAlpha = R.range(0.4, 0.9); g.lineWidth = R.range(0.5, 1.3);
    g.beginPath(); g.moveTo(xs, y); g.lineTo(xe, y + R.range(-0.4, 0.4)); g.stroke();
  }
  // 음영 (칠한 곳에만): 위는 젖은 윤기, 아래는 어둡게 + 밝은 털결 몇 가닥
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = 1;
  const sh = g.createLinearGradient(0, top, 0, bot);
  sh.addColorStop(0, 'rgba(255,120,120,0.30)'); sh.addColorStop(0.2, 'rgba(255,60,60,0.06)');
  sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = sh; g.fillRect(0, 0, B.w, B.h);
  g.strokeStyle = 'rgba(255,110,110,0.22)';
  for (let k = 0; k < 7; k++) {
    const v = R.range(0.08, 0.55), y = top + v * th, off = (1 - v) * B.slant;
    g.lineWidth = R.range(0.5, 1);
    g.beginPath(); g.moveTo(x0 + off + R.range(0.15, 0.45) * len, y); g.lineTo(x0 + off + R.range(0.7, 0.97) * len, y + R.range(-0.5, 0.5)); g.stroke();
  }
  // 핏방울: 아래 가장자리 오른쪽 절반에서 흘러내림 (스프라이트 안에서 끝난다)
  g.globalCompositeOperation = 'source-over';
  for (let d = 0; d < B.drips; d++) {
    const x = x0 + R.range(0.45, 0.93) * len, w = R.range(1.4, 2.4);
    const L = R.range(3, Math.max(4, B.h - bot - w * 2 - 2));
    g.fillStyle = INK[3];
    g.fillRect(x - w / 2, bot - 2, w, L);
    g.beginPath(); g.arc(x, bot - 2 + L, w * 0.95, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,130,130,0.35)'; g.fillRect(x - w * 0.15, bot, w * 0.3, L * 0.6);
  }
}
function bakeBrush(c, B, S) {
  c = c || mkCanvas();
  if (!c) return null;
  const g = prep(c, B.w * S, B.h * S);
  g.scale(S, S);
  paintBrush(g, B);
  return c;
}
function bakeGlow(c, S) {
  c = c || mkCanvas();
  if (!c) return null;
  const g = prep(c, GLW.w * S, GLW.h * S);
  g.scale(S, S);
  g.shadowColor = 'rgba(255,70,90,1)'; g.shadowBlur = 9 * S; g.fillStyle = '#ff5060';
  g.fillRect(GLW.ix, GLW.iy, GLW.iw, GLW.ih);
  g.fillRect(GLW.ix, GLW.iy, GLW.iw, GLW.ih);
  g.shadowBlur = 0; g.shadowColor = 'transparent';
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(GLW.ix, GLW.iy, GLW.iw, GLW.ih);   // 안쪽은 비운다 (막대 자체를 덮지 않게)
  return c;
}
/** 랭크 글자 목록: D … SSS, 마지막에 SSS 핏빛 (번갈아 빛나기) */
function letterList() {
  const R = ranks(), last = R[R.length - 1];
  return [...R.map((d) => ({ t: d.r, c: d.c })), { t: last.r, c: last.c2 ?? '#ff3040' }];
}
function bakeLetters(c, S) {
  c = c || mkCanvas();
  if (!c) return null;
  const list = letterList(), rows = Math.ceil(list.length / LET.cols);
  const g = prep(c, LET.w * LET.cols * S, LET.h * rows * S);
  g.scale(S, S);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  g.font = `900 ${LET.size}px ${FONT.logo}`;
  SPR.letterW = [];
  list.forEach((d, i) => {
    const cx = (i % LET.cols) * LET.w + LET.w / 2, by = Math.floor(i / LET.cols) * LET.h + LET.base;
    const w0 = g.measureText(d.t).width || LET.size;
    const k = Math.min(1, (LET.w - 26) / w0);
    SPR.letterW[i] = w0 * k;
    g.save(); g.translate(cx, by); g.scale(k, 1);
    g.shadowColor = rgba(d.c, 0.9); g.shadowBlur = 12 * S; g.fillStyle = d.c; g.fillText(d.t, 0, 0);
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    g.lineWidth = 6; g.strokeStyle = '#120003'; g.strokeText(d.t, 0, 0);
    const gr = g.createLinearGradient(0, -LET.size * 0.78, 0, 4);
    gr.addColorStop(0, mix(d.c, '#ffffff', 0.72)); gr.addColorStop(0.5, d.c); gr.addColorStop(1, shade(d.c, -0.45));
    g.fillStyle = gr; g.fillText(d.t, 0, 0);
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.3)'; g.strokeText(d.t, 0, -0.5);
    g.restore();
  });
  return c;
}
/** 알림 단어 목록 (랭크 순서 + SSS 핏빛) */
function wordList() {
  const R = ranks(), last = R[R.length - 1];
  return [...R.map((d) => ({ t: d.word ?? d.r, c: d.c, c2: d.c2 })), { t: last.word ?? last.r, c: last.c2 ?? '#ff3040', alt: true }];
}
function bakeWords(c, S) {
  c = c || mkCanvas();
  if (!c) return null;
  const list = wordList();
  const g = prep(c, WRD.w * S, WRD.h * list.length * S);
  g.scale(S, S);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  SPR.wordMeta = [];
  list.forEach((d, i) => {
    let size = WRD.size;
    g.font = `900 ${size}px ${FONT.dmg}`;
    let w = g.measureText(d.t).width || size;
    const room = WRD.w - 56;   // 기울기·외곽선·광채 여유
    if (w > room) { size = Math.max(16, Math.floor(size * room / w)); g.font = `900 ${size}px ${FONT.dmg}`; w = g.measureText(d.t).width || size; }
    SPR.wordMeta[i] = { size, w, t: d.t };
    const top = d.alt ? '#ffd8d0' : d.c2 ? '#fff6c8' : mix(d.c, '#ffffff', 0.75);
    const bottom = d.alt ? '#6a0010' : d.c2 ?? shade(d.c, -0.4);
    g.save(); g.translate(WRD.w / 2, i * WRD.h + WRD.base); g.transform(1, 0, WRD.skew, 1, 0, 0);
    g.shadowColor = rgba(d.c, 0.85); g.shadowBlur = 14 * S; g.fillStyle = d.c; g.fillText(d.t, 0, 0);
    g.shadowBlur = 0; g.shadowColor = 'transparent';
    g.lineWidth = 7; g.strokeStyle = '#1a0006'; g.strokeText(d.t, 0, 0);
    const gr = g.createLinearGradient(0, -size * 0.78, 0, 3);
    gr.addColorStop(0, top); gr.addColorStop(0.5, d.c); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillText(d.t, 0, 0);
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.strokeText(d.t, 0, -0.5);
    g.restore();
  });
  return c;
}
/** 전부 굽기 (what = 'all' | 'fonts'). 같은 캔버스를 다시 쓴다 */
function bake(what = 'all') {
  if (typeof document === 'undefined') { SPR.banner = null; return; }
  const S = Math.max(wantScale(), what === 'fonts' ? SPR.S : 0);
  try {
    if (what === 'all') {
      SPR.banner = bakeBrush(SPR.banner, BANNER, S);
      SPR.band = bakeBrush(SPR.band, BAND, S);
      SPR.glow = bakeGlow(SPR.glow, S);
      SPR.num ??= mkCanvas();   // 크기·내용은 처음 그릴 때 정해진다 (NUM_KEY / LBL_KEY 가 비어 있으니 그때 굽는다)
      SPR.lbl ??= mkCanvas();
    }
    SPR.letters = bakeLetters(SPR.letters, S);
    SPR.words = bakeWords(SPR.words, S);
    SPR.S = S; SPR.fontDirty = false;
    FEEL_HUD_STATS.bakes++;
  } catch (e) {
    console.warn('[feel_hud] 스프라이트 굽기 실패', e);
    SPR.banner ??= null;
  }
}
/** 한가할 때 다시 굽기 (글꼴 도착·화면 배율 상승) */
function schedule() {
  if (SPR.pending) return;
  SPR.pending = true;
  idle(() => {
    SPR.pending = false;
    if (wantScale() > SPR.S) bake('all');
    else if (SPR.fontDirty) { FEEL_HUD_STATS.fontRebakes++; bake('fonts'); }
  });
}
function watchFonts() {
  if (SPR.watching) return;
  SPR.watching = true;
  try {
    UI.onFontEpoch?.((ep, fams) => {
      if (!Array.isArray(fams) || !fams.length || fams.some((f) => f === 'BN Dmg' || f === 'Grenze Gotisch')) { SPR.fontDirty = true; schedule(); }
    });
  } catch { /* 글꼴 세대 알림 없음 */ }
}
/** 그리기 직전: 아직 안 구웠으면 지금 굽고, 화면 배율이 올라갔으면 한가할 때 다시 굽는다 */
function ensureSprites() {
  if (SPR.banner === undefined) { watchFonts(); FEEL_HUD_STATS.syncBakes++; bake('all'); return; }
  const sc = game?.scale;
  if (sc !== SPR.lastScale) { SPR.lastScale = sc; if (wantScale() > SPR.S) schedule(); }
}

/**
 * 스프라이트를 한가할 때 미리 굽는다 (부팅 1.5초 뒤 자동; 장면 enter 에서 불러도 된다). 글꼴(BN Dmg·Grenze Gotisch)을 최대 2.5초 기다린다.
 */
export function prewarmFeelHud() {
  if (FEEL_HUD_STATS.prewarmed || typeof document === 'undefined') return;
  FEEL_HUD_STATS.prewarmed = true;
  watchFonts();
  let done = false;
  const go = () => { if (done) return; done = true; if (SPR.banner === undefined) idle(() => { if (SPR.banner === undefined) bake('all'); }); };
  try {
    const waits = [UI.loadFace?.('BN Dmg'), document.fonts?.load?.(`900 ${LET.size}px ${FONT.logo}`, 'SABCD')].filter((p) => p && typeof p.then === 'function');
    Promise.all(waits).then(go, go);
    setTimeout(go, 2500);
  } catch { go(); }
}
/** 구운 붓 띠 ('banner' 콤보 숫자 뒤 188×62 | 'band' 알림 뒤 470×70, 논리 px) → 캔버스 | null */
export function brushSprite(kind = 'banner') {
  ensureSprites();
  return (kind === 'band' ? SPR.band : SPR.banner) || null;
}
// 부팅 뒤 조금 있다가 미리 굽는다 (모듈 최상위에서는 가져온 값을 건드리지 않는다 — 타이머 안에서만)
if (typeof window !== 'undefined' && typeof setTimeout === 'function') {
  setTimeout(() => { try { prewarmFeelHud(); } catch (e) { console.warn('[feel_hud] prewarm', e); } }, 1500);
}

// ───────────────────────── 캐시한 그라데이션 (원점 기준 → 위치가 바뀌어도 그대로 쓴다) ─────────────────────────
// 문맥(ctx)마다 따로 둔다: 콤보 숫자는 NUM 캐시 캔버스에, 광택은 화면 캔버스에 칠하므로 한 프레임에 두 문맥을 오가도 버리지 않는다
const GRADS = new WeakMap();
function gcache(ctx) { let m = GRADS.get(ctx); if (!m) GRADS.set(ctx, (m = { num: new Map(), hi: null })); return m; }
/** SSS(c2 가 있는 랭크)의 금↔핏빛 단계 0..7 (그 밖의 랭크는 0) */
const numPhase = (rank, now) => (rankInfo(rank)?.c2 ? Math.floor(((Math.sin(now * 6) + 1) / 2) * 7.99) : 0);
/** 콤보 숫자 채움: 기준선(by)이 원점 아래 by 에 있는 좌표계 기준. SSS 는 금↔핏빛 8단계 */
function numGrad(ctx, rank, size, ph) {
  const M = gcache(ctx).num;
  const info = rankInfo(rank);
  const key = rank * 10000 + size * 10 + ph;
  let g = M.get(key);
  if (!g) {
    const by = size * 0.36;
    const c = info ? (info.c2 ? mix(info.c, info.c2, ph / 7) : info.c) : '#ffb070';
    g = ctx.createLinearGradient(0, by - size * 0.76, 0, by);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.42, mix(c, '#ffffff', 0.4)); g.addColorStop(1, c);
    if (M.size > 96) M.clear();
    M.set(key, g);
  }
  return g;
}
/** 각성 막대 위로 흐르는 광택 (0 … 22 px) */
function hiGrad(ctx) {
  const m = gcache(ctx);
  if (!m.hi) {
    m.hi = ctx.createLinearGradient(0, 0, 22, 0);
    m.hi.addColorStop(0, 'rgba(255,200,200,0)'); m.hi.addColorStop(0.5, 'rgba(255,225,225,0.8)'); m.hi.addColorStop(1, 'rgba(255,200,200,0)');
  }
  return m.hi;
}
let READY_COLS = null;   // '각성 가능!' 금 ↔ 핏빛 8단계 (처음 쓸 때 만든다)
function readyCol(now) {
  READY_COLS ??= Array.from({ length: 8 }, (_, i) => mix('#ffe070', '#ff4050', i / 7));
  return READY_COLS[Math.floor(((Math.sin(now * 6) + 1) / 2) * 7.99)];
}

// ───────────────────────── 월드별 상태 ─────────────────────────
const STATE = new WeakMap();
const HOOKED = Symbol('feelHudDmg');
function stateOf(world) {
  let s = STATE.get(world);
  if (!s) {
    s = {
      n: 0, num: -1, nStr: '', nSize: 46, nW: -1, hitRt: -9, rot: 0,
      endRt: -9, endN: 0, endStr: '', endSize: 46, endW: -1, endRot: 0,
      rank: 0, rankRt: -9, mile: 0, mileRt: -9, mileStr: '',
      annRef: null, annRt: 0, style: null, dmg: 0, dmgN: 0, dmgShown: -1, dmgStr: '', pct: -1, pctStr: '',
    };
    STATE.set(world, s);
  }
  return s;
}
const numSize = (n) => (n < 10 ? 46 : n < 50 ? 52 : n < 100 ? 58 : 64);
const nowOf = (world) => (Number.isFinite(world?.rt) ? world.rt : Number(world?.time) || 0);
const settingsOf = (world) => world?.game?.settings ?? game?.settings ?? null;
const calmOf = (world) => !!settingsOf(world)?.reduceMotion;
function lowOf(world) { try { return (world?.qualityNow?.() ?? world?.game?.quality) === 'low'; } catch { return false; } }

/** 콤보 피해를 세기 위해 이 월드의 style 인스턴스 onHit 만 감싼다 (world.combo.dmg 가 있으면 하지 않는다) */
function hookStyle(world, s) {
  const S = world.style;
  s.style = S;
  if (!S || typeof S.onHit !== 'function' || S.onHit[HOOKED] || Number.isFinite(world.combo?.dmg)) return;
  const orig = S.onHit;
  const wrapped = function feelHudComboDmg(info, attack, target) {
    try {
      const n = world.combo?.n ?? 0;
      if (n <= 1 || n < s.dmgN) s.dmg = 0;   // 새 콤보 (onPlayerHit 가 combo.n 을 올린 뒤 style.onHit 를 부른다)
      s.dmgN = n;
      const d = Number(info?.dmg);
      if (d > 0 && Number.isFinite(d)) s.dmg += d;
    } catch { /* 표시용 집계 — 실패해도 원래 동작은 그대로 */ }
    return orig.apply(this, arguments);
  };
  wrapped[HOOKED] = true;
  try { S.onHit = wrapped; FEEL_HUD_STATS.dmgHooks++; } catch { /* 고친 수 없는 객체 */ }
}
function comboDmg(world, s) {
  const v = world.combo?.dmg;
  return Number.isFinite(v) ? v : s.dmgN === (world.combo?.n ?? 0) ? s.dmg : 0;
}

/** 콤보 n 번째 타격의 숫자 기울기 −3° … +3°: n 을 섞은 결정적 값 (타격마다 달라 보이지만 난수 상태를 쓰지 않는다) */
function tiltOf(n) {
  let h = Math.imul((n | 0) ^ 0x5bd1e995, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x297a2d39);
  h ^= h >>> 13;
  return (((h >>> 0) / 4294967296) * 2 - 1) * ROT_MAX;
}
/** 콤보 수·랭크 변화 → 튀기기·이정표·끝 연출 시각 */
function track(world, s, now) {
  if (s.style !== world.style) hookStyle(world, s);
  const n = Math.max(0, world.combo.n | 0);
  if (n > s.n) {
    s.hitRt = now;
    s.rot = tiltOf(n);   // 콤보 수로 정해지는 기울기 (그리는 중 난수 없음, R1-REQ-348)
    s.endRt = -9;
    for (const m of milestones()) if (s.n < m && n >= m) { s.mile = m; s.mileRt = now; s.mileStr = `${m} HIT!`; }
  } else if (n < s.n) {
    if (s.n >= 2) { s.endRt = now; s.endN = s.n; s.endStr = s.nStr; s.endSize = s.nSize; s.endW = s.nW; s.endRot = s.rot; }
    if (n > 0) s.hitRt = now;
  }
  s.n = n;
  if (n !== s.num) { s.num = n; s.nStr = String(n); s.nSize = numSize(n); s.nW = -1; }
  const r = world.style?.rank ?? 0;
  if (r > s.rank) s.rankRt = now;
  s.rank = r;
}

// ───────────────────────── 1. 각성 게이지 + 준비 문구 ─────────────────────────
export function drawAwGauge(ctx, world, x, y, w, touch) {
  const p = world?.player, run = world?.run;
  if (!p || !run || !ctx) return false;
  const T = !!touch;
  const now = nowOf(world);
  const hero = world.hero ?? p.hero;
  const tier = CLASSES[hero?.classId]?.tier ?? 0;
  const RU = AWD.AWAKEN_RULES ?? {};
  const has = tier >= (RU.minTier ?? 1) && !!AWD.AWAKEN?.[hero?.charId];
  const max = RU.gaugeMax ?? 100;
  const spFull = (Number(run.sp) || 0) >= (RU.spNeed ?? 100) - 1e-6;
  const aw = clamp(Number(run.aw) || 0, 0, max);
  const awFull = aw >= max - 1e-6;
  // 표시용 준비 상태 (awaken.js 의 world.awakenState.ready 와 같은 규칙: 경직은 보지 않아 깜빡이지 않는다)
  const ready = has && (world.awakenState?.ready === true
    || (spFull && awFull && !p.dead && !world.cutscene && !world.cleared && world.mode !== 'town'));
  const holdK = has ? clamp(Number(world.awakenState?.holdK) || 0, 0, 1) : 0;
  ctx.save();
  if (has) {
    ensureSprites();
    drawGauge(ctx, world, stateOf(world), x, y, w, aw / max, awFull, ready, holdK, tier, now, T);
  }
  drawReady(ctx, world, x, y + 22, w + 10, spFull, ready, holdK, now, T);
  ctx.restore();
  return true;
}

function drawGauge(ctx, world, s, x, y, w, f, full, ready, holdK, tier, now, T) {
  // 터치 글자 하한 (hudPx, 11 CSS px): 휴대폰(하한 16–17 논리 px)에서는 라벨 줄이 칸(20 px, 위 4 px 는 SP 막대)에 들어가지 않는다
  // → 막대를 F+1 px 로 키우고 라벨·% 를 막대 안에 쓴다 (체력 칸 HP 숫자와 같은 방식). 칸 L.awGauge 와 SP 막대 +14 계약은 그대로
  const ls = T ? hudPx(12, true) : 10, inl = ls > 12;
  const bh = inl ? Math.min(19, ls + 1) : 6, by = inl ? y + 1 : y + 12, low = lowOf(world);
  const lab = tier >= 2 ? (AWD.T2_PREFIX ?? '진 각성') : '각성';
  const pc = Math.floor(f * 100);
  if (pc !== s.pct) { s.pct = pc; s.pctStr = `${pc}%`; }
  if (!inl) {
    text(ctx, lab, x, y + 9, { size: ls, weight: 700, color: full ? '#ff8a96' : COLORS.dim });
    text(ctx, s.pctStr, x + w, y + 9, { size: ls, align: 'right', weight: 700, family: FONT.num, color: full ? '#ffb0b8' : COLORS.dim });
  }
  // 두 게이지가 가득(또는 길게 누르는 중): SP 막대(hud.js: L.ult 안 (x, y − 14, w, 10))와 각성 막대가 함께 빛난다
  const glowOn = (ready || holdK > 0) && SPR.glow;
  if (glowOn) {   // (요소마다 save/restore 하지 않는다: 합성·알파만 바꿨다가 되돌린다)
    const a = clamp(0.7 + 0.3 * Math.sin(now * 7) + holdK * 0.4, 0, 1);
    const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ga * a;
    glowAround(ctx, x, y - 14, w, 10);
    glowAround(ctx, x, by, w, bh);
    if (holdK > 0) glowAround(ctx, x, by, w, bh);
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = ga;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, by, w, bh);
  const fw = w * clamp(f, 0, 1);
  if (fw > 0) {
    ctx.fillStyle = '#b0102a'; ctx.fillRect(x, by, fw, bh);
    ctx.fillStyle = '#e0303e'; ctx.fillRect(x, by, fw, 2);          // 젖은 윗면
    ctx.fillStyle = '#5a0010'; ctx.fillRect(x, by + bh - 1, fw, 1);
    if (!low) {
      // 흐르는 광택 (1.4초에 한 번 채운 곳을 지나간다)
      const hw = 22, pos = ((now / 1.4) % 1) * (fw + hw) - hw;
      const l = Math.max(0, pos), r = Math.min(fw, pos + hw);
      if (r > l) {   // 광택 그라데이션은 원점 기준 (0 … 22 px) → 옮겼다가 그만큼 되돌린다
        const ox = x + pos;
        ctx.translate(ox, 0);
        ctx.fillStyle = hiGrad(ctx); ctx.fillRect(l - pos, by, r - l, bh);
        ctx.translate(-ox, 0);
      }
      // 핏방울: 막대 아래에 맺혔다가 떨어진다 (채운 곳에서만)
      ctx.fillStyle = '#9a0c20';
      const ga = ctx.globalAlpha;
      for (let i = 0; i < 3; i++) {
        const dx = w * (0.22 + i * 0.29);
        if (dx > fw - 2) break;
        const ph = (now * 0.55 + i * 0.37) % 1;
        if (ph < 0.72) {
          const len = 1 + (ph / 0.72) * 3.2;
          ctx.fillRect(x + dx - 0.7, by + bh, 1.4, len);
          ctx.beginPath(); ctx.arc(x + dx, by + bh + len, 1.1 + ph * 0.5, 0, TAU); ctx.fill();
        } else {
          const t = (ph - 0.72) / 0.28, dy = by + bh + 4.2 + t * t * 9;
          ctx.globalAlpha = ga * (1 - t);
          ctx.beginPath(); ctx.arc(x + dx, dy, 1.3, 0, TAU); ctx.fill();
          ctx.globalAlpha = ga;
        }
      }
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  for (let i = 1; i < 4; i++) ctx.fillRect(x + (w * i) / 4, by, 1, bh);
  if (holdK > 0) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x, by, w * holdK, bh); }
  ctx.strokeStyle = ready ? '#ffe0e0' : full ? '#ff6a7a' : COLORS.goldDark;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 0.5, by - 0.5, w + 1, bh + 1);
  if (inl) {   // 막대 안 라벨·% (외곽선 글자 — 빈 막대·채운 막대 위 모두 읽힌다)
    const ty = by + Math.round(bh / 2 + ls * 0.36);
    text(ctx, lab, x + 4, ty, { size: ls, weight: 800, color: full ? '#ffd0d6' : '#e6d6c4' });
    text(ctx, s.pctStr, x + w - 4, ty, { size: ls, align: 'right', weight: 700, family: FONT.num, color: full ? '#ffe0e4' : '#e6d6c4' });
  }
}
/** 광채 스프라이트의 안쪽 사각형을 (x, y, w, h) 막대에 맞춰 그린다 */
function glowAround(ctx, x, y, w, h) {
  const sx = w / GLW.iw, sy = h / GLW.ih;
  ctx.drawImage(SPR.glow, x - GLW.ix * sx, y - GLW.iy * sy, GLW.w * sx, GLW.h * sy);
}

/** 이 기기에서 필살 버튼 글리프를 그릴 수 있나 (터치는 prompts 가 터치 버튼을 알려 줄 때만 — hud.js 와 같은 규칙) */
function ultGlyphOk(T) {
  if (!T) return true;
  try { return !!bindingOf('ult')?.some?.((b) => b?.type === 'touch'); } catch { return false; }
}
/** 터치 준비 문구: 이 크기로 칸 너비에 들어가는 가장 긴 문구 (휴대폰 하한 17 px 에서는 짧은 문구 — 가로로 누르지 않는다).
 *  크기·너비·글꼴 세대마다 한 번만 잰다 */
const READY_T = ['각성 가능! 필살 버튼을 길게', '각성 가능! 버튼을 길게', '각성 가능! 길게'];
const READY_FIT = { key: '', str: READY_T[0] };
function readyTouchStr(ctx, size, w) {
  const key = `${size}|${w}|${UI.fontEpoch ?? 0}`;
  if (READY_FIT.key === key) return READY_FIT.str;
  ctx.font = font(size, 800);
  let str = READY_T[READY_T.length - 1];
  for (const t of READY_T) if (ctx.measureText(t).width <= w) { str = t; break; }
  READY_FIT.key = key; READY_FIT.str = str;
  return str;
}
function drawReady(ctx, world, x, y, w, spFull, ready, holdK, now, T) {
  const base = y + 16;
  if (ready) {
    const col = holdK > 0 ? '#ffffff' : readyCol(now);
    const size = T ? hudPx(13, true) : 11;
    if (T) {   // 터치: 문구로만 안내 (필살 버튼에 '각성' 라벨이 뜨고, 길게 누르면 버튼 둘레에 고리가 찬다)
      text(ctx, readyTouchStr(ctx, size, w), x, base, { size, weight: 800, color: col, maxWidth: w });
      return;
    }
    const head = '각성 가능!';
    text(ctx, head, x, base, { size, weight: 800, color: col });
    let cx = x + ctx.measureText(head).width + 5;
    const gw = drawGlyph(ctx, 'ult', cx, base - 12, 15) || 0;   // 키보드 F 키캡 · 패드 RT (다시 배치한 키 그대로)
    if (gw > 0) text(ctx, '길게', cx + gw + 4, base, { size, weight: 800, color: col, maxWidth: Math.max(10, x + w - cx - gw - 4) });
    else text(ctx, '필살 버튼을 길게', cx, base, { size, weight: 800, color: col, maxWidth: Math.max(10, x + w - cx) });
    return;
  }
  // 필살기만 가득: 예전 문구 그대로 (1초에 두 번 깜빡임)
  if (!spFull || Math.floor((Number(world.time) || 0) * 4) % 2 !== 0) return;
  const msg = '필살기 준비!';
  text(ctx, msg, x, base, { size: T ? hudPx(14, true) : 11, weight: 800, color: '#ffe070', maxWidth: T ? w : undefined });
  // 터치는 글자만 (글리프 15 px 안 글자가 9 px 로 하한 아래 — 필살 버튼이 가득 찬 반짝임으로 같은 것을 보여 준다)
  if (!T && ultGlyphOk(T)) drawGlyph(ctx, 'ult', x + ctx.measureText(msg).width + 5, base - 12, 15);
}

// ───────────────────────── 2. 콤보 · 스타일 열 ─────────────────────────
// 열 좌표: 원점 = 칸 오른쪽 위 (r.x + r.w, r.y), 설계 크기 COL_W × COL_H 를 k 배로 줄여 그린다 (x 는 음수 쪽).
// 매 프레임 하는 일 (R1-REQ-330): 붓 띠 1장 · 진행 고리 2획 · 랭크 글자 1~2장 · 밑줄 1칠 · NUM 1~2장 · LBL 1장 · 콤보 시간 막대 사각형 몇 개.
// save/restore 는 위젯마다 한 번이고, 요소 사이에는 열 기준 변환 B 로 되돌린다. 자르기는 넘치는 연출 중에만 건다 (comboSpills).
const MILE_SLAM = 0.12;                    // 이정표 2 → 1 박힘 시간
const NUMC = { w: 240, h: 88 };            // NUM 캐시 한 줄 (논리 px; 가운데 = 숫자 회전 중심). 둘째 줄 = 흰 번쩍임
const LBLC = { x: -178, y: 58, w: 178, h: 52 };   // LBL 캐시가 덮는 열 좌표 영역 ('HITS' 기준선 76 · '총 피해' 기준선 102)
const NUM_KEY = { str: '', size: 0, rot: NaN, rank: -1, ph: -1, a: 0, ep: -1, w: 0, row: 0, asc: 0, desc: 0, k: 1 };
const LBL_KEY = { T: null, dmg: '', a: 0, ep: -1, hs: 0, ds: 0 };
/** 'HITS' · '총 피해' 글자 크기 (열 좌표). 터치는 열이 k 배로 줄어 그려지므로 HUD 글자 하한(hudPx, 11 CSS px)을 k 로 나눠 열 좌표로 옮긴다.
 *  위쪽 한계: 'HITS' 는 숫자 기준선(60) 아래, '총 피해' 는 콤보 시간 막대(81–85) 아래·열 높이(108) 안 (LBL 캐시 칸 58–110) */
const LBL_SZ = { hs: 14, ds: 12 };
function labelSizes(T, k) {
  if (!T) { LBL_SZ.hs = 14; LBL_SZ.ds = 12; return LBL_SZ; }
  const kk = k > 0.2 ? k : 0.2;
  LBL_SZ.hs = Math.min(26, Math.max(16, Math.ceil(hudPx(16, true) / kk)));
  LBL_SZ.ds = Math.min(24, Math.max(14, Math.ceil(hudPx(14, true) / kk)));
  return LBL_SZ;
}

/** 열 기준 변환 B 가 축 정렬(회전·기울임 없음)이고 가로세로 배율이 같은가 → 기기 픽셀에 맞춘 1:1 붙이기를 쓸 수 있다 */
const axisAligned = (B) => Math.abs(B.b) < 1e-9 && Math.abs(B.c) < 1e-9 && Math.abs(B.a - B.d) < 1e-9 && B.a > 0;
/** 굽는 배율 = 열 1 단위가 기기 픽셀 몇 개인가 (축 정렬이 아니면 크기 배율의 근사) */
const devScale = (B) => (axisAligned(B) ? B.a : Math.max(0.5, Math.hypot(B.a, B.b)));

/** NUM 캐시를 (숫자, 크기, 기울기, 랭크, SSS 색 단계, 배율, 글꼴 세대) 에 맞춘다 → 숫자 너비 (논리 px) | 0 = 캐시 캔버스 없음 */
function numSprite(str, size, rot, rank, ph, a) {
  const c = SPR.num;
  if (!c) return 0;
  const K = NUM_KEY, ep = UI.fontEpoch ?? 0;
  if (K.str === str && K.size === size && K.rot === rot && K.rank === rank && K.ph === ph && K.a === a && K.ep === ep) return K.w;
  const row = Math.ceil(NUMC.h * a);
  const g = prep(c, NUMC.w * a, row * 2);
  const by = size * 0.36;
  g.font = font(size, 900, FONT.dmg);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
  const m = g.measureText(str);
  const w0 = m.width || size;
  const fit = Math.min(1, (NUMC.w - 24) / (w0 + 8));   // 아주 긴 수(다섯 자리 넘게)는 칸에 맞게 줄인다
  for (let j = 0; j < 2; j++) {
    g.setTransform(a, 0, 0, a, (NUMC.w / 2) * a, (NUMC.h / 2) * a + j * row);
    if (rot) g.rotate(rot);
    if (fit < 1) g.scale(fit, fit);
    if (j === 0) {
      g.lineWidth = 7; g.strokeStyle = '#140004'; g.strokeText(str, 0, by);
      g.fillStyle = numGrad(g, rank, size, ph); g.fillText(str, 0, by);
    } else { g.fillStyle = '#ffffff'; g.fillText(str, 0, by); }
  }
  K.str = str; K.size = size; K.rot = rot; K.rank = rank; K.ph = ph; K.a = a; K.ep = ep; K.w = w0 * fit; K.row = row;
  K.asc = glyphAsc(m, size) * fit; K.desc = glyphDesc(m) * fit; K.k = fit;   // 튀기기가 칸을 넘지 않게 (popFit)
  FEEL_HUD_STATS.numBakes++;
  return K.w;
}
/** 숫자 글자의 기준선 위 높이 / 아래 깊이 (measureText 가 모르면 글꼴 크기의 0.8 / 0) */
const glyphAsc = (m, size) => (m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : size * 0.8);
const glyphDesc = (m) => (m.actualBoundingBoxDescent > 0 ? m.actualBoundingBoxDescent : 0);
/**
 * 튀기기(pop 배)를 칸 안에 가둔다 (열 좌표: 위 0 · 아래 colH · 왼쪽 −colW). 쉬는 숫자의 회전 중심 cy0 을 기준으로 튀되, 윗변이
 * 칸 위로(점수 칸 쪽으로) 나가려 하면 세로 기준점 ay 를 올려 윗변을 칸 위에 붙이고, 칸이 모자라면 pop 을 줄인다.
 * 넘치는 그림이 없으므로 hud.js 가 튀기기 프레임마다 화면 크기 클립을 걸 필요가 없다 (R1-REQ-330). 작은 수(≤ 49)는 예전 그대로
 * 가운데에서 튄다. w = 숫자 너비, by = 회전 중심 → 기준선, asc/desc = 글자 높이·깊이, k = 긴 수를 줄인 배율 → { pop, ay }
 */
function popFit(pop, cy0, w, by, asc, desc, k, rot, colW, colH) {
  if (!(pop > 1)) return { pop: 1, ay: cy0 };
  const o = 3.5 * k + (w / 2) * Math.abs(Math.sin(rot || 0));   // 외곽선 반 폭 + 기울기로 올라가는 끝
  const T0 = cy0 + by * k - asc - o, B0 = cy0 + by * k + desc + o;   // 쉬는 숫자의 윗변·아랫변
  pop = Math.min(pop, Math.max(1, colH / Math.max(1, B0 - T0)), Math.max(1, (colW + NUM_R) / Math.max(1, w + 3.5 * k)));
  if (!(pop > 1)) return { pop: 1, ay: cy0 };
  const hi = (pop * T0) / (pop - 1), lo = (pop * B0 - colH) / (pop - 1);   // 위로 안 넘는 한계 · 아래로 안 넘는 한계
  return { pop, ay: Math.min(hi, Math.max(lo, cy0)) };
}
/** LBL 캐시: 'HITS' + '총 피해 n' (dmg 가 빈 문자열이면 'HITS' 만 — 작은 배치·데미지 숫자 끔·끝나 사라지는 중) */
function lblSprite(T, dmg, a) {
  const c = SPR.lbl;
  if (!c) return false;
  const K = LBL_KEY, ep = UI.fontEpoch ?? 0, hs = LBL_SZ.hs, ds = LBL_SZ.ds;
  if (K.T === T && K.dmg === dmg && K.a === a && K.ep === ep && K.hs === hs && K.ds === ds) return true;
  const g = prep(c, LBLC.w * a, LBLC.h * a);
  g.setTransform(a, 0, 0, a, -LBLC.x * a, -LBLC.y * a);   // 열 좌표 그대로 그린다
  drawLabels(g, T, dmg);
  K.T = T; K.dmg = dmg; K.a = a; K.ep = ep; K.hs = hs; K.ds = ds;
  FEEL_HUD_STATS.lblBakes++;
  return true;
}
/** 'HITS' · 총 피해 (열 좌표) — LBL 캐시에 굽거나, 캐시 캔버스가 없으면 화면에 바로 그린다 */
function drawLabels(g, T, dmg) {
  const hs = LBL_SZ.hs, ds = LBL_SZ.ds;   // labelSizes() 가 이 프레임에 정한 크기 (데스크톱 14/12, 터치 ≥ 16/14 — 하한 / k)
  text(g, 'HITS', NUM_R - 2, 76, { size: hs, align: 'right', weight: 800, family: FONT.dmg, color: '#ffd0a0', ow: 3 });
  // 큰 글자는 기준선을 내려 콤보 시간 막대(아래 끝 85)와 띄운다 (14 px 이하는 예전 102 그대로, 24 px 에서 106)
  if (dmg) text(g, dmg, NUM_R - 2, Math.max(102, Math.ceil(87 + ds * 0.8)), { size: ds, align: 'right', weight: 700, family: FONT.num, color: '#e8d6c0', ow: 3, maxWidth: LBLC.w + NUM_R - 6 });
}
/** LBL 캐시를 붙인다 (dy = 끝 연출의 떠오름). 쉴 때는 기기 픽셀에 맞춰 1:1 */
function blitLabels(ctx, B, dy) {
  const c = SPR.lbl, a = LBL_KEY.a;
  if (dy === 0 && axisAligned(B)) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c, Math.round(B.e + B.a * LBLC.x), Math.round(B.f + B.d * LBLC.y));
    ctx.setTransform(B);
  } else ctx.drawImage(c, 0, 0, c.width, c.height, LBLC.x, LBLC.y + dy, c.width / a, c.height / a);
}

/**
 * 콤보 숫자 (오른쪽 끝 NUM_R, 기준선 NUM_BASE + dy): NUM 캐시를 붙인다. 튀기기(pop)는 오른쪽 끝을 기준으로 하고 칸(colW × colH,
 * 열 좌표) 위·아래·왼쪽으로 넘치지 않게 세로 기준점을 옮긴다 (popFit — 튀기기 프레임에 hud.js 클립이 없어도 점수 칸을 덮지 않는다).
 * 기울기는 구울 때 숫자 가운데를 중심으로 넣었다. flash 0..1 = 흰 번쩍임 (캐시 둘째 줄). 캐시 캔버스가 없으면 바로 그린다 (drawNumber)
 */
function drawNumberSpr(ctx, B, str, size, rot, pop, flash, rank, now, dy = 0, colW = COL_W, colH = COL_H) {
  if (!str) return;
  const w = numSprite(str, size, rot, rank, numPhase(rank, now), devScale(B));
  if (!w) { drawNumber(ctx, str, size, -1, rot, pop, flash, rank, now, dy, colW, colH); return; }
  const c = SPR.num, a = NUM_KEY.a, row = NUM_KEY.row, cw = c.width;
  const cy0 = NUM_BASE - size * 0.36 + dy;   // 쉬는 숫자의 회전 중심 (구운 줄의 가운데)
  let ay = cy0;
  if (pop !== 1) ({ pop, ay } = popFit(pop, cy0, w, size * 0.36, NUM_KEY.asc, NUM_KEY.desc, NUM_KEY.k, rot, colW, colH));
  const cx = NUM_R - (pop * w) / 2, cy = ay + pop * (cy0 - ay);   // 튄 숫자의 회전 중심 (오른쪽 끝 · 세로 기준점 ay 기준)
  const x = cx - (pop * NUMC.w) / 2, y = cy - (pop * NUMC.h) / 2;
  const snap = pop === 1 && dy === 0 && axisAligned(B);
  if (snap) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dx = Math.round(B.e + B.a * x), dyy = Math.round(B.f + B.d * y);
    ctx.drawImage(c, 0, 0, cw, row, dx, dyy, cw, row);
    if (flash > 0) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * flash; ctx.drawImage(c, 0, row, cw, row, dx, dyy, cw, row); ctx.globalAlpha = ga; }
    ctx.setTransform(B);
    return;
  }
  const dw = (pop * cw) / a, dh = (pop * row) / a;
  ctx.drawImage(c, 0, 0, cw, row, x, y, dw, dh);
  if (flash > 0) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * flash; ctx.drawImage(c, 0, row, cw, row, x, y, dw, dh); ctx.globalAlpha = ga; }
}

/** 이번 프레임에 콤보 열이 칸 밖으로 넘치는 연출 중인가: 랭크 글자 등장(1.6 → 1) · 이정표 박힘(2 → 1). 그 밖의 그림은 칸 안에 있다 */
function comboSpills(s, now, calm, mile) {
  if (calm) return false;
  return now - s.rankRt < RANKUP_T + 1 / 60 || (mile && now - s.mileRt < MILE_SLAM + 1 / 60);
}
const ANN_SPILL_T = Math.max(SLAM_T, CHROMA_T) + 1 / 60;   // 알림 단어 박힘·색수차 (칸 위 16 px 까지 넘친다)

/**
 * 이번 프레임에 위젯이 제 칸 밖으로 넘치는 연출 중인가 (which = 'combo' | 'transient'). hud.js 는 true 일 때만 다른 영역을 빼는
 * 클립을 건다 — 쉬는 그림은 칸 안에 있으므로 매 프레임 자르지 않는다 (R1-REQ-330). 콤보는 이 프레임의 콤보·랭크 변화를 먼저
 * 반영한다 (drawComboHUD 가 같은 프레임에 다시 반영해도 바뀌는 것이 없다).
 */
export function hudOverflow(world, which) {
  if (!world || calmOf(world)) return false;
  const now = nowOf(world);
  if (which === 'combo') {
    if (!world.combo) return false;
    const s = stateOf(world);
    track(world, s, now);
    return comboSpills(s, now, false, s.mile > 0 && now - s.mileRt < MILE_T && s.n > 0);
  }
  if (which === 'transient') {
    const cur = world.style?.ann?.cur;
    if (!cur) return false;
    const s = STATE.get(world);
    const tA = s && s.annRef === cur ? now - s.annRt : Number(cur.age) || 0;
    return tA < ANN_SPILL_T;
  }
  return false;
}

export function drawComboHUD(ctx, world, vw, vh, touch) {
  const c = world?.combo;
  if (!c || !ctx) return false;
  const now = nowOf(world);
  const s = stateOf(world);
  track(world, s, now);
  const r = hudLayout(world, vw, vh)?.combo;
  if (!r || !(r.h >= 20) || !(r.w >= 60)) return true;
  const style = world.style, rank = style?.rank ?? 0;
  const n = s.n;
  const ending = n < 2 && s.endN >= 2 && now - s.endRt < END_T;
  const mile = s.mile > 0 && now - s.mileRt < MILE_T && n > 0;
  if (n < 2 && !ending && rank <= 0 && !mile) return true;
  ensureSprites();
  let small = false;
  let k = Math.min(1, r.w / COL_W, r.h / COL_H);
  if (k < 0.7) { small = true; k = Math.min(1, r.w / COL_W, r.h / COL_H_SMALL); }
  const calm = calmOf(world);
  const T = !!touch;   // 휴대폰: 캔버스가 0.7배쯤으로 줄어 보이므로 작은 글자('HITS'·'총 피해'·이정표)를 키운다
  labelSizes(T, k);
  ctx.save();
  ctx.translate(r.x + r.w, r.y);
  if (k !== 1) ctx.scale(k, k);
  const B = ctx.getTransform();
  // 칸 아래·오른쪽으로는 그리지 않는다 (터치 y 297 한계·패드 보호). 쉬는 그림은 칸 안에 있으므로 넘치는 연출 중에만 자른다
  if (comboSpills(s, now, calm, mile)) { ctx.beginPath(); ctx.rect(-COL_W - 200, -200, COL_W + 200 + 6, 200 + r.h / k); ctx.clip(); }
  // 겹치는 순서: 붓 띠 → 랭크 글자 → 밑줄 → 숫자 → HITS·총 피해 → 막대 → 이정표. SS·SSS 글자는 넓어서 붓 띠 왼쪽 끝과 겹치므로
  // 글자를 띠 위에 그린다 (띠를 나중에 그리면 마지막 S 가 붓 자국에 덮인다)
  if (n >= 2) drawComboBanner(ctx, s, now, calm);
  if (rank > 0) drawRankLetter(ctx, B, style, s, rank, now, calm, n < 2 ? 0.7 : 1);   // 콤보가 끊긴 뒤 식어 가는 랭크는 조금 흐리게
  if (n >= 2) drawComboBlock(ctx, B, world, c, s, rank, now, small, calm, T, r.w / k, r.h / k);
  else if (ending) drawComboEnd(ctx, B, s, rank, now, calm, T);
  if (mile) drawMilestone(ctx, B, s, now, small, calm, T, k);
  ctx.restore();
  return true;
}

/** (캐시 캔버스가 없을 때만) 콤보 숫자를 바로 그린다. 오른쪽 끝 NUM_R, 기준선 NUM_BASE + dy. flash 0..1 = 흰 번쩍임 */
function drawNumber(ctx, str, size, w, rot, pop, flash, rank, now, dy = 0, colW = COL_W, colH = COL_H) {
  if (!str) return;
  ctx.font = font(size, 900, FONT.dmg);
  const m = ctx.measureText(str);
  if (!(w > 0)) w = m.width;
  const by = size * 0.36, cy0 = NUM_BASE - by + dy;
  let ay = cy0;
  if (pop !== 1) ({ pop, ay } = popFit(pop, cy0, w, by, glyphAsc(m, size), glyphDesc(m), 1, rot, colW, colH));
  ctx.save();
  // 튀기기는 오른쪽 끝·세로 기준점 ay 를 기준으로 (칸 오른쪽·위로 커지지 않게, popFit), 기울기는 숫자 가운데를 중심으로
  ctx.translate(NUM_R, ay);
  if (pop !== 1) ctx.scale(pop, pop);
  ctx.translate(-w / 2, cy0 - ay);
  if (rot) ctx.rotate(rot);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  ctx.lineWidth = 7; ctx.strokeStyle = '#140004'; ctx.strokeText(str, 0, by);
  ctx.fillStyle = numGrad(ctx, rank, size, numPhase(rank, now)); ctx.fillText(str, 0, by);
  if (flash > 0) { ctx.globalAlpha *= flash; ctx.fillStyle = '#ffffff'; ctx.fillText(str, 0, by); }
  ctx.restore();
  return w;
}

/** 콤보 숫자 뒤 붓 띠 (숫자와 함께 조금 튄다; 오른쪽 끝 (−4, 38) 기준 — 변환 없이 늘인 사각형으로 붙인다) */
function drawComboBanner(ctx, s, now, calm) {
  const B = SPR.banner;
  if (!B) return;
  const popK = calm ? 0 : clamp(1 - (now - s.hitRt) / POP_T, 0, 1);
  const bs = 1 + 0.35 * popK * 0.4;   // 칸 오른쪽 밖으로 나가지 않게 오른쪽 끝을 기준으로
  ctx.drawImage(B, -4 - BANNER.w * bs, 38 + (-BANNER.h / 2 + 2) * bs, BANNER.w * bs, BANNER.h * bs);
}

function drawComboBlock(ctx, B, world, c, s, rank, now, small, calm, T, colW, colH) {
  const info = rankInfo(rank);
  const popK = calm ? 0 : clamp(1 - (now - s.hitRt) / POP_T, 0, 1);
  const pop = 1 + 0.35 * popK;
  // 랭크 색 밑줄 (숫자 아래에 깔린다)
  const ga = ctx.globalAlpha;
  ctx.fillStyle = info?.c ?? '#e8c872';
  ctx.globalAlpha = ga * 0.9;
  ctx.beginPath(); ctx.moveTo(-168, 62.5); ctx.lineTo(-10, 62.5); ctx.lineTo(-12, 65); ctx.lineTo(-170, 65); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = ga;
  // 숫자 (튀기기 + 흰 번쩍임)
  drawNumberSpr(ctx, B, s.nStr, s.nSize, calm ? 0 : s.rot, pop, popK > 0.3 ? (popK - 0.3) / 0.7 * 0.7 : 0, rank, now, 0, colW, colH);
  // HITS + 총 피해 (LBL 캐시; 총 피해는 작은 배치·데미지 숫자 끔이면 뺀다) — 튀는 숫자 위에 (예전 순서 그대로)
  let dmg = '';
  if (!small && settingsOf(world)?.showDamage !== false) {
    const d = comboDmg(world, s);
    if (d > 0) {
      const v = Math.round(d);
      if (v !== s.dmgShown) { s.dmgShown = v; s.dmgStr = `총 피해 ${fmt(v)}`; }
      dmg = s.dmgStr;
    }
  }
  if (lblSprite(T, dmg, devScale(B))) blitLabels(ctx, B, 0);
  else drawLabels(ctx, T, dmg);
  // 콤보 시간 (90×4 핏빛 막대, 오른쪽으로 줄어든다 + 줄어드는 끝에 맺힌 핏방울)
  const bw = 90, bx = NUM_R - 2 - bw, by = 81;
  const f = clamp((Number(c.t) || 0) / (Number(c.window) || 2.6), 0, 1), fw = bw * f, fx = bx + bw - fw;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, 4);
  if (fw > 0) {
    ctx.fillStyle = '#a00c22'; ctx.fillRect(fx, by, fw, 4);
    ctx.fillStyle = info?.c ?? '#ff5a6a'; ctx.fillRect(fx, by, fw, 1);
    if (!small && fw > 3 && !lowOf(world)) {
      const len = 1.2 + ((now * 1.3) % 1) * 4;
      ctx.fillStyle = '#a00c22';
      ctx.fillRect(fx + 0.6, by + 3, 1.5, len);
      ctx.beginPath(); ctx.arc(fx + 1.35, by + 3 + len, 1.3, 0, TAU); ctx.fill();
    }
  }
}

/** 콤보가 끝난 뒤 0.4초: 마지막 숫자와 'HITS' 가 떠오르며 사라진다 */
function drawComboEnd(ctx, B, s, rank, now, calm, T) {
  const t = (now - s.endRt) / END_T;
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (1 - t) * (1 - t);
  const dy = -10 * t;
  drawNumberSpr(ctx, B, s.endStr, s.endSize, calm ? 0 : s.endRot, 1, 0, rank, now, dy);
  if (lblSprite(T, '', devScale(B))) blitLabels(ctx, B, dy);
  else text(ctx, 'HITS', NUM_R - 2, 76 + dy, { size: LBL_SZ.hs, align: 'right', weight: 800, family: FONT.dmg, color: '#ffd0a0', ow: 3 });
  ctx.globalAlpha = ga;
}

/** 랭크 글자 묶음의 칸 j 를 (글자 가운데 기준) 그린다 */
function drawLetterCell(ctx, A, j, S) {
  ctx.drawImage(A, (j % LET.cols) * LET.w * S, Math.floor(j / LET.cols) * LET.h * S, LET.w * S, LET.h * S, -LET.w / 2, -LET.base + LET.size * 0.36, LET.w, LET.h);
}
/** 스타일 랭크 글자 (D~SSS) + 다음 랭크까지 진행 고리. alphaK = 콤보가 끊긴 뒤 흐리게 (0.7). 끝나면 변환은 B, 알파는 그대로 */
function drawRankLetter(ctx, B, style, s, rank, now, calm, alphaK) {
  const info = rankInfo(rank);
  if (!info) return;
  const cx = LETTER_X, cy = LETTER_Y;
  const ga = ctx.globalAlpha, al = ga * alphaK;
  ctx.globalAlpha = al;
  const prog = clamp(Number(style?.progress) || 0, 0, 1);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath(); ctx.arc(cx, cy, RING_R, 0, TAU); ctx.stroke();
  if (prog > 0.001) {
    ctx.strokeStyle = info.c;
    ctx.beginPath(); ctx.arc(cx, cy, RING_R, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
  }
  const t = clamp((now - s.rankRt) / RANKUP_T, 0, 1);
  const big = info.r.length > 1 ? 0.35 : 0.6;   // SS·SSS 는 옆 붓 띠를 덜 덮게 덜 튄다
  const sc = calm ? 1 : 1 + big - big * ease.outBack(t);
  const i = rank - 1, A = SPR.letters;
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  const lw = SPR.letterW[i] || LET.size;
  const fit = Math.min(1, (RING_R * 2 + 14) / lw) * sc;
  if (fit !== 1) ctx.scale(fit, fit);
  if (A) {
    drawLetterCell(ctx, A, i, SPR.S);
    if (info.c2) {   // SSS: 금빛 위로 핏빛이 번갈아
      ctx.globalAlpha = al * 0.85 * (Math.sin(now * 6) + 1) / 2;
      drawLetterCell(ctx, A, ranks().length, SPR.S);
    }
  } else text(ctx, info.r, 0, LET.size * 0.36, { size: LET.size, align: 'center', weight: 900, family: FONT.logo, color: info.c, ow: 6 });
  ctx.setTransform(B);
  ctx.globalAlpha = ga;
}

/** 콤보 이정표 '{n} HIT!' — 랭크 글자 아래에서 2→1 로 박힌다. 끝나면 변환은 B, 알파는 그대로 */
function drawMilestone(ctx, B, s, now, small, calm, T = false, k = 1) {
  const t = now - s.mileRt;
  const a = t < MILE_T - 0.3 ? 1 : clamp((MILE_T - t) / 0.3, 0, 1);
  if (a <= 0) return;
  const sc = calm ? 1 : t < MILE_SLAM ? 2 - ease.outCubic(t / MILE_SLAM) : 1;
  const col = s.mile >= 100 ? '#ffe070' : s.mile >= 50 ? '#ffa640' : '#ffffff';
  let size = small ? 14 : 19;
  const y = small ? 82 : 100;   // 기준선을 중심으로 박힌다 (아래로 커지지 않게)
  // 터치: 열이 k 배로 줄어 그려지므로 HUD 글자 하한(hudPx)을 열 좌표로 (원래 크기의 2배까지 — 열 너비 안, 랭크 고리 아래)
  if (T) size = Math.min(size * 2, Math.max(size, Math.ceil(hudPx(size, true) / (k > 0.2 ? k : 0.2))));
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a;
  ctx.translate(LETTER_X, y);
  if (sc !== 1) ctx.scale(sc, sc);
  ctx.transform(1, 0, -0.2, 1, 0, 0);
  text(ctx, s.mileStr, 0, 0, { size, align: 'center', weight: 900, family: FONT.dmg, color: col, outline: '#1a0006', ow: 4 });
  ctx.setTransform(B);
  ctx.globalAlpha = ga;
}

// ───────────────────────── 3. 알림 (아나운서) ─────────────────────────
/** 알림 단어 묶음의 줄 j 를 (단어 가운데·기준선 기준) 그린다 */
function drawWordRow(ctx, W, j, S) {
  ctx.drawImage(W, 0, j * WRD.h * S, WRD.w * S, WRD.h * S, -WRD.w / 2, -WRD.base, WRD.w, WRD.h);
}
export function drawAnnouncer(ctx, world, vw, vh) {
  const cur = world?.style?.ann?.cur;
  if (!cur || !ctx) return false;
  const An = STYLE?.announce ?? { hold: 0.7, fade: 0.25 };
  const age = Number(cur.age) || 0;
  const alpha = age <= An.hold ? 1 : 1 - (age - An.hold) / (An.fade || 0.25);
  if (!(alpha > 0.01)) return false;
  const r = hudLayout(world, vw, vh)?.transient;
  if (!r || !(r.w >= 40) || !(r.h >= 20)) return false;
  const now = nowOf(world);
  const s = stateOf(world);
  if (s.annRef !== cur) { s.annRef = cur; s.annRt = now - age; }
  const tA = Math.max(0, now - s.annRt);
  ensureSprites();
  const calm = calmOf(world);
  const i = clamp((cur.rank | 0) - 1, 0, ranks().length - 1);
  const meta = SPR.wordMeta[i];
  const word = cur.word ?? meta?.t ?? '';
  const cx = r.x + r.w / 2, by = r.y + 38, maxW = r.w - 16;
  ctx.save();
  let ww = meta?.w;
  if (!(ww > 0)) { ctx.font = font(WRD.size, 900, FONT.dmg); ww = ctx.measureText(word).width || 100; }
  let fit = clamp(maxW / (ww + 24), 0.4, 1);
  // 아주 좁은 칸 (큰 패드 touchScale 1.3 + 안전 영역 인셋: 70 px 안팎)에서는 40 % 로도 칸을 넘친다 → 칸에 맞게 더 줄인다 (최소 25 %)
  if (ww * fit > r.w + 8) fit = Math.max(0.25, (r.w + 8) / ww);
  // 박힘(2.2배)·색수차 동안만 칸 밖을 잘라 낸다 (가로 ± 6 px — 옆 영역과의 간격 8 px 안, 위 16 px·아래 6 px 여유): 첫 몇 프레임이
  // 옆 상시 영역(옮겨 간 콤보 열 x 14–314·동료 카드 줄)·패드 버튼·위쪽 토스트 줄을 덮지 않게. 그 뒤 그림은 그 안에 있다 (R1-REQ-330)
  if (!calm && tA < ANN_SPILL_T) { ctx.beginPath(); ctx.rect(r.x - 6, r.y - 16, r.w + 12, r.h + 22); ctx.clip(); }
  const ga = ctx.globalAlpha * clamp(alpha, 0, 1);
  ctx.globalAlpha = ga;
  // 붓 띠: 왼쪽에서 오른쪽으로 쓸며 그려진다 (0.1초)
  const band = SPR.band;
  if (band) {
    const sw = calm ? 1 : ease.outCubic(clamp(tA / 0.1, 0, 1));
    const bw = Math.min(r.w + 12, ww * fit + 110), bh = BAND.h * clamp(fit + 0.15, 0.6, 1);
    if (sw > 0.01) ctx.drawImage(band, 0, 0, band.width * sw, band.height, cx - bw / 2, r.y + 32 - bh * 0.46, bw * sw, bh);
  }
  // 단어: 2.2 → 1 로 박히고 되튄다 + 0.15초 색수차 (요소마다 save/restore 하지 않고, 끝나면 E 로 되돌린다)
  const sc = calm ? 1 : 2.2 - 1.2 * ease.outBack(clamp(tA / SLAM_T, 0, 1));
  const E = ctx.getTransform();
  ctx.translate(cx, by);
  ctx.scale(fit * sc, fit * sc);
  if (!calm && tA < CHROMA_T) {
    const k = 1 - tA / CHROMA_T;
    ctx.font = `900 ${meta?.size ?? WRD.size}px ${FONT.dmg}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.transform(1, 0, WRD.skew, 1, 0, 0);
    ctx.globalAlpha = ga * 0.75 * k;
    ctx.fillStyle = '#ff1030'; ctx.fillText(word, -2, 0);
    ctx.fillStyle = '#20f0ff'; ctx.fillText(word, 2, 0);
    ctx.transform(1, 0, -WRD.skew, 1, 0, 0);
    ctx.globalAlpha = ga;
  }
  const W = SPR.words;
  if (W && meta) {
    drawWordRow(ctx, W, i, SPR.S);
    if (rankInfo(i + 1)?.c2) {   // SSS: 금빛 ↔ 핏빛
      ctx.globalAlpha = ga * 0.8 * (Math.sin(now * 7) + 1) / 2;
      drawWordRow(ctx, W, ranks().length, SPR.S);
      ctx.globalAlpha = ga;
    }
  } else {
    ctx.transform(1, 0, WRD.skew, 1, 0, 0);
    text(ctx, word, 0, 0, { size: WRD.size, align: 'center', weight: 900, family: FONT.dmg, color: cur.c ?? '#fff', outline: '#1a0006', ow: 7 });
  }
  ctx.setTransform(E);
  // 한국어 부제
  if (cur.sub) {
    const sa = calm ? 1 : clamp((tA - 0.06) / 0.1, 0, 1);
    if (sa > 0) {
      ctx.globalAlpha = ga * sa;
      text(ctx, cur.sub, cx, r.y + 58, { size: hudPx(Math.max(11, Math.round(16 * Math.min(1, fit + 0.2)))), align: 'center', weight: 800, family: FONT.title, color: '#f3e2c8', outline: 'rgba(20,0,4,0.92)', ow: 4, maxWidth: maxW });
    }
  }
  ctx.restore();
  return true;
}

/** 시험·도구용 */
export const FEEL_HUD_DEBUG = { SPR, stateOf, bake, hudOverflow, NUM_KEY, LBL_KEY, layout: { COL_W, COL_H, COL_H_SMALL, BANNER, BAND, LET, WRD, GLW, NUMC, LBLC } };
