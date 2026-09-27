// 각성기(초필살기) 연출 감독 B — 브란 · 리아 · 아젤 (+ 2차 전직 '진 각성' 변형) — owner: AWAKEN-DIR-B
// feel.md §6.4 (Bran, Lia, Azel), §5.2 (2차 전직 강조색·장식), §7 (설정), §8 (성능 예산); MASTER_PLAN §1.13, §1.14, R6, R12
//
// 공개 API
//  AWAKEN_DIRECTOR_B[charId] = (p, world, v) => 감독 엔티티   awaken.js directorOf 가 읽는다 (계약: awaken.js 머리말 '감독 계약').
//     감독은 컷인이 닫힌 뒤(t = 0) 시작하고, 돌려준 엔티티가 죽으면 awaken.js 가 연출 상태(cutscene·freezeEnemies·hudHidden·레터박스)를 되돌린다.
//     타격은 모두 v.hit / v.final (tags ['awaken'], capFn = 보스 30% 상한, 마무리는 final:true → class A).
//   bran  철심 해방 — 기사단의 진혼가
//         0.0 대검을 땅에 꽂으면 망령 기사 여섯이 뒤에서 솟아올라 경례 (drawHero 로 한 번씩 구운 푸른 잔상 비트맵, war_horn)
//         0.4 도약 — 대검이 1→3.2배로 자라며 푸른 강철 불꽃에 휩싸이고 화면이 0.9배로 물러난다
//         0.8 화면 높이 전체를 가르는 너비 220의 거대 내려베기 → 대지가 갈라진다 (바닥 균열, 전원 바닥 바운드)
//         1.0–1.9 망령 기사단이 화면을 가로질러 돌격하는 파도 (기사마다 화면의 적 전원 1타, 깃발·흙먼지 벽)
//         1.85 브란과 기사단이 검을 들어 올리고 2.0 빛의 대검이 하늘에서 균열로 떨어진다 → 2.15 마무리 (삼중 고리·잔해 비)
//   lia   흑우 — 까마귀의 장례
//         0.0 화면이 거의 검게 (0.92) — 적은 붉은 윤곽의 실루엣, 리아의 붉은 눈만 남는다 (crow_caw)
//         0.2 검은 깃털 80개로 흩어져 사라진다 → 0.3–1.4 순간이동 12회: 적의 등 뒤에 나타나 붉은 X자 베기 3연타, 베기 자국이 쌓인다
//         1.6 화면을 덮는 거대한 까마귀 실루엣 (붉은 눈) → 1.9 제자리에 다시 나타나 납도 '찰칵', 0.25초 정적 (음악 0)
//         2.15 쌓인 모든 자국이 한꺼번에 붉게 번쩍이며 모든 적에게 지연 피해 (확정 치명타)
//   azel  크림슨 이클립스 — 진조 해방
//         0.0 핏빛 달이 떠올라 일식 (검은 원판 + 붉은 코로나), bell 0.5
//         0.3 눈이 번뜩이고 피의 날개가 펼쳐진다 → 0.5–1.4 피의 초승달 9개가 화면을 교차 (잔향 이중상, 가장자리에서 핏방울)
//         1.6 손가락 튕기기 '딱' — 0.2초 정지 → 1.75 모든 초승달이 피의 비로 터지고, 적들의 피가 흐름이 되어 아젤에게 (체력 20% 회복)
//         2.2 달이 다시 붉어진다
//  2차 전직 변형 (data/awaken.js T2; 대체 연출이 적용하지 않는 효과까지 여기서 적용한다)
//   bran_guardian   성역의 방벽: 푸른 방패 결계 — 끝난 뒤 3초 무적(awaken.js 가 v.t2.invuln 적용)을 결계 그림으로 보여 준다
//   bran_crusader   성전의 파도: 신성 속성(v.atk), 내려베기·기사 돌격마다 십자 충격파, 빛의 대검이 십자 모양
//   bran_warlord    불꽃 군기: 기사 여섯 모두 불타는 군기를 들고, 콤보 10마다 피해 +2% (이번 각성, 최대 +50%)
//   bran_bloodrage  피의 격노: 핏빛 기사단, 입힌 피해의 10% 흡혈 (+ 마무리 뒤 피의 흐름)
//   lia_shadowmaster 그림자 분신: 모든 순간이동마다 보랏빛 분신이 반대편에서 거울처럼 벤다
//   lia_kunoichi    진홍 꽃보라: 꽃잎 폭풍 (순간이동마다 꽃잎이 터지고 화면을 가로지른다)
//   lia_bladedancer 황금 칼날 소용돌이: 순간이동마다 황금 칼날이 대상 둘레를 돈다
//   lia_reaper      사신의 낫: 처치할 때마다 최대 체력 3% 회복, 영혼이 리아에게 흘러든다 (마무리 낫 휩쓸기는 키트 장식)
//   azel_nosferatu  박쥐 떼: 박쥐 떼가 화면을 휘돌다 마무리에서 적들을 집어삼킨다
//   azel_bloodking  피의 왕관: 머리 위 피의 왕관 (치명타 피해 +50% 는 awaken.js 가 v.atk 스탯에 반영)
//   azel_dawnbringer 여명: 신성 속성, 금빛 날개·금빛 초승달, 마무리에서 일식이 황금빛 해돋이로 바뀐다
//   azel_seraph     빛과 어둠의 날개: 흰 날개와 검은 날개, 흰·검은 초승달이 번갈아 교차
//  AWAKEN_DIR_B_DEBUG   시험용 기록 {casts, bakes, poseBakes, canvases, castCanvases, errors, prepared, last}
//  prepareAwakenB(world?, p?)   캐시 스프라이트 미리 굽기 (스테이지 진입·방 이동·직업 변경 뒤 한가할 때 자동; 시험용으로도 공개)
//
// 성능 (feel §8, MASTER_PLAN §5.2)
//  · 망령 기사·리아 분신은 drawHero 로 한 번씩만 그린 잔상 비트맵. 스테이지 진입·직업 변경 뒤 한가할 때 한 장씩 미리 굽고(퍼펫 그림이 준비된 뒤),
//    장비를 바꿔 낡았으면 컷인이 도는 동안, 그래도 없으면 감독이 틱마다 한 장씩 굽는다 (drawHero ≤ 플레이어 + 1 / 프레임, feel §8 10/6/3).
//  · 그리기 코드에서 그라디언트를 만들지 않는다: 달·코로나·날개·초승달·검·까마귀·깃발은 캔버스 풀(부팅 뒤 한가할 때 8장)에 굽고, 빛은 ULTFX.glow.
//  · 입자는 각성 최대치(700/450/250) 안에서만 뿌린다 (다른 연출이 이미 뿌린 입자 수도 센다).
//  · 화면 전체 층: 배경 어둠 1장 (+ 키트 층·번쩍임). low 에서는 번쩍임이 켜진 동안 어둠을 건너뛴다 (전체 층 ≤ 1).
//  · settings.flashFx·reduceMotion·screenShake 를 따른다 (카메라 연출 폭은 동작 줄이기에서 40%).
import { audio } from '../core/audio.js';
import { game, TILE } from '../core/game.js';
import { bus } from '../core/events.js';
import { clamp, lerp, rand, TAU, ease, rgba } from '../core/math.js';
import { CLASSES } from '../data/classes.js';
import { FXKIT, SkillFx } from './skills.js';
import { ULTFX } from '../render/ultfx.js';
import { drawHero } from '../render/hero.js';
import * as PUP from '../render/hero_puppet.js';
import * as HFX from '../render/hitfx.js';

const PI = Math.PI, HP = PI / 2;
const QCAP = { high: 700, medium: 450, low: 250 };      // 각성 최대 입자 (feel §8)
const RS = { high: 1.25, medium: 1, low: 0.75 };          // 영웅 잔상 비트맵 해상도 배율
const GB = { bw: 160, bt: 240, bb: 34 };                  // 영웅 잔상 비트맵 상자 (발 중앙 기준 좌우 bw, 위 bt, 아래 bb; 월드 px)
const POOL_N = 8;

export const AWAKEN_DIR_B_DEBUG = { casts: 0, bakes: 0, poseBakes: 0, canvases: 0, castCanvases: 0, errors: 0, prepared: null, last: null };

// ═══════════════════════════ 작은 도구 ═══════════════════════════
function qOf(w) {
  let q = null;
  try { q = w?.qualityNow?.() ?? null; } catch { q = null; }
  q = q ?? game?.quality ?? game?.settings?.quality ?? 'high';
  return q === 'low' || q === 'medium' ? q : 'high';
}
function sfx(name, o) { try { audio.sfx(name, o); } catch { /* 소리 없음 */ } }
function flashK() { const k = Number(game?.settings?.flashFx ?? 1); return Number.isFinite(k) ? clamp(k, 0, 1) : 1; }
function report(err, where) { AWAKEN_DIR_B_DEBUG.errors++; console.error(`[awakenB] ${where}`, err); }
const u01 = (t, t0, d) => clamp((t - t0) / d, 0, 1);

// ═══════════════════════════ 캐시 캔버스 풀 ═══════════════════════════
// 부팅 뒤 한가할 때 8장을 만들어 두고, 키별로 굽는다 (가장 오래 안 쓴 것을 다시 굽는다). 시전 중에는 새 캔버스를 만들지 않는다.
const POOL = [];
let USE = 0, LIVE = null;
function newCanvas() {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  AWAKEN_DIR_B_DEBUG.canvases++;
  if (LIVE && !LIVE.over) AWAKEN_DIR_B_DEBUG.castCanvases++;
  return c;
}
function ensurePool() {
  while (POOL.length < POOL_N) {
    const c = newCanvas();
    if (!c) return false;
    POOL.push({ c, key: null, used: 0 });
  }
  return true;
}
function resetG(c) {
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)';
  g.clearRect(0, 0, c.width, c.height);
  return g;
}
/** key 의 캐시 캔버스. 없으면(또는 force) 풀에서 빈 것 → 가장 오래 안 쓴 것(keep·진행 중 시전의 키 제외)을 w×h 로 굽는다 */
function cached(key, w, h, bake, keep = null, force = false) {
  let e = POOL.find((s) => s.key === key);
  if (e && !force) { e.used = ++USE; keep?.add(key); return e.c; }
  if (!e) {
    if (!ensurePool()) return null;
    const busy = LIVE && !LIVE.over ? LIVE.keep : null;
    e = POOL.find((s) => !s.key) ?? POOL.filter((s) => !keep?.has(s.key) && !busy?.has(s.key)).sort((a, b) => a.used - b.used)[0];
    if (!e) return null;
  }
  const W = Math.max(1, Math.ceil(w)), H = Math.max(1, Math.ceil(h));
  if (e.c.width !== W || e.c.height !== H) { e.c.width = W; e.c.height = H; }
  e.key = key; e.used = ++USE; keep?.add(key);
  const g = resetG(e.c);
  g.save();
  try { bake(g, W, H); } catch (err) { console.warn('[awakenB] bake', key, err); }
  g.restore();
  AWAKEN_DIR_B_DEBUG.bakes++;
  return e.c;
}

// ─── 굽기 함수 (한 번만 실행; 그라디언트·그림자는 여기서만) ───
function lin(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
function rad(g, x0, y0, r0, x1, y1, r1, stops) { const gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }

/** 거대한 대검 (칼끝이 위, 손잡이가 아래; 손잡이 중심 = (w/2, h-50)) */
function bakeBlade(g, w, h) {
  const cx = w / 2, tip = 10, base = h - 86;
  g.fillStyle = lin(g, 0, 0, w, 0, [[0, 'rgba(120,160,255,0)'], [0.5, 'rgba(170,205,255,0.4)'], [1, 'rgba(120,160,255,0)']]);
  g.fillRect(0, tip - 4, w, base - tip + 14);
  g.fillStyle = lin(g, cx - 16, 0, cx + 16, 0, [[0, '#48567a'], [0.44, '#dfe8ff'], [0.52, '#ffffff'], [1, '#7a8aa8']]);
  g.beginPath(); g.moveTo(cx - 15, base); g.lineTo(cx - 12, tip + 44); g.lineTo(cx, tip); g.lineTo(cx + 12, tip + 44); g.lineTo(cx + 15, base); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(8,10,24,0.85)'; g.lineWidth = 2; g.stroke();
  g.strokeStyle = 'rgba(200,225,255,0.95)'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx, base - 8); g.lineTo(cx, tip + 34); g.stroke();
  g.fillStyle = 'rgba(160,200,255,0.9)';   // 칼날의 룬
  for (let i = 0; i < 5; i++) { const y = base - 50 - i * 58; g.fillRect(cx - 5, y, 10, 3); g.fillRect(cx - 1.5, y - 8, 3, 18); }
  g.fillStyle = lin(g, cx - 34, 0, cx + 34, 0, [[0, '#6a4a1a'], [0.5, '#ffe7a0'], [1, '#6a4a1a']]);
  g.fillRect(cx - 34, base, 68, 11);
  g.fillStyle = '#2a1c14'; g.fillRect(cx - 6, base + 11, 12, 52);
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 1.5;
  for (let y = base + 16; y < base + 60; y += 7) { g.beginPath(); g.moveTo(cx - 6, y); g.lineTo(cx + 6, y + 4); g.stroke(); }
  g.fillStyle = '#e8c872'; g.beginPath(); g.arc(cx, base + 70, 8, 0, TAU); g.fill();
}
/** 빛기둥 단면 (가로 64 × 세로 4, 흰색; 세로로 늘여 그린다) */
function bakeBeam(g, w, h) {
  g.fillStyle = lin(g, 0, 0, w, 0, [[0, 'rgba(255,255,255,0)'], [0.22, 'rgba(255,255,255,0.18)'], [0.4, 'rgba(255,255,255,0.72)'], [0.5, 'rgba(255,255,255,1)'], [0.6, 'rgba(255,255,255,0.72)'], [0.78, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
  g.fillRect(0, 0, w, h);
}
const BANNER = {
  base: ['#1c2a5a', '#e8c872', '#e8c872'], bran_paladin: ['#1c2a5a', '#e8c872', '#fff2b0'], bran_berserker: ['#3a1010', '#c8a060', '#c8a060'],
  bran_guardian: ['#163a7a', '#ffd84a', '#ffd84a'], bran_crusader: ['#f0e8d4', '#c01020', '#c01020'], bran_bloodrage: ['#4a0610', '#ff4a5a', '#ff4a5a'],
};
/** 기사단 군기 (깃대 아래 끝 = (5.5, h)) */
function bakeBanner(g, w, h, arg) {
  const [cloth, trim, emb] = BANNER[arg] ?? BANNER.base;
  g.fillStyle = '#2a1c10'; g.fillRect(3, 6, 5, h - 6);
  g.fillStyle = '#e8c872'; g.beginPath(); g.moveTo(5.5, 0); g.lineTo(9.5, 9); g.lineTo(1.5, 9); g.closePath(); g.fill();
  const P = new Path2D();
  P.moveTo(8, 12); P.lineTo(w - 3, 14); P.lineTo(w - 3, h - 34); P.lineTo(w * 0.64, h - 52); P.lineTo(w * 0.42, h - 38); P.lineTo(8, h - 30); P.closePath();
  g.fillStyle = cloth; g.fill(P);
  g.fillStyle = emb; g.fillRect(w * 0.52 - 3, 26, 6, 42); g.fillRect(w * 0.52 - 13, 38, 26, 6);
  g.save(); g.clip(P);
  g.fillStyle = lin(g, 8, 0, w, 0, [[0, 'rgba(0,0,0,0.35)'], [0.5, 'rgba(255,255,255,0.1)'], [1, 'rgba(0,0,0,0.3)']]);
  g.fillRect(0, 0, w, h);
  g.restore();
  g.strokeStyle = trim; g.lineWidth = 2; g.stroke(P);
}
/** 깃 하나: 뿌리 (x, y) 에서 a 방향으로 길이 L, 폭 wd (끝이 뾰족한 잎 모양) */
function featherPath(q, x, y, a, L, wd) {
  const c = Math.cos(a), sn = Math.sin(a), nx = -sn, ny = c;
  q.moveTo(x + nx * wd * 0.5, y + ny * wd * 0.5);
  q.quadraticCurveTo(x + c * L * 0.55 + nx * wd * 0.72, y + sn * L * 0.55 + ny * wd * 0.72, x + c * L, y + sn * L);
  q.quadraticCurveTo(x + c * L * 0.55 - nx * wd * 0.72, y + sn * L * 0.55 - ny * wd * 0.72, x - nx * wd * 0.5, y - ny * wd * 0.5);
  q.closePath();
}
/**
 * 날개를 활짝 편 거대한 까마귀 실루엣 (문장처럼 정면으로 날개를 펴고 머리는 옆을 본다).
 * 몸 중심 (256,150), 눈 (266,42). 검은 실루엣 + 바깥 윤곽만 붉게 (뒤에 깐 굵은 붉은 선) + 깃 사이 어두운 붉은 결
 */
function bakeCrow(g, w, h) {
  const cx = 256, body = [], feathers = [];
  const part = (list, fn) => { const q = new Path2D(); fn(q); list.push(q); };
  part(body, (q) => { q.moveTo(cx, 62); q.bezierCurveTo(cx + 40, 84, cx + 34, 160, cx + 14, 194); q.lineTo(cx - 14, 194); q.bezierCurveTo(cx - 34, 160, cx - 40, 84, cx, 62); q.closePath(); });   // 몸통 (목까지)
  part(body, (q) => { q.arc(cx + 2, 46, 22, 0, TAU); });   // 머리 (날개 선 위로 솟는다)
  part(body, (q) => { q.moveTo(cx + 14, 32); q.quadraticCurveTo(cx + 44, 30, cx + 66, 40); q.quadraticCurveTo(cx + 44, 52, cx + 16, 58); q.closePath(); });   // 굵은 부리 (오른쪽)
  part(body, (q) => { q.moveTo(cx - 16, 52); q.lineTo(cx - 34, 74); q.lineTo(cx - 16, 70); q.lineTo(cx - 24, 88); q.lineTo(cx + 2, 72); q.closePath(); });   // 목 깃털 (삐죽)
  for (let i = 0; i < 5; i++) part(feathers, (q) => featherPath(q, cx + (i - 2) * 5, 182, HP + (i - 2) * 0.22, 70 - Math.abs(i - 2) * 7, 14));   // 꼬리 부채
  for (const sd of [-1, 1]) {
    const ang = (a) => (sd > 0 ? a : PI - a);
    part(body, (q) => { q.moveTo(cx + sd * 14, 98); q.quadraticCurveTo(cx + sd * 70, 40, cx + sd * 150, 32); q.lineTo(cx + sd * 178, 52); q.quadraticCurveTo(cx + sd * 110, 112, cx + sd * 28, 162); q.closePath(); });   // 팔 (어깨 → 손목)
    for (let i = 0; i < 7; i++) part(feathers, (q) => featherPath(q, cx + sd * (148 + i * 4), 34 + i * 11, ang(-0.34 + i * 0.2), 104 - i * 7, 13));   // 첫째 날개깃: 손가락처럼 펼친 7개
    for (let i = 0; i < 6; i++) { const u = i / 5; part(feathers, (q) => featherPath(q, cx + sd * lerp(140, 44, u), lerp(62, 150, u), ang(1.08 + u * 0.46), 60 - u * 14, 17)); }   // 둘째 날개깃 (뒷전)
  }
  const all = [...feathers, ...body];
  g.fillStyle = '#040206';
  for (const q of all) g.fill(q);
  g.globalCompositeOperation = 'destination-over';   // 바깥 윤곽만 붉게: 굵은 붉은 선을 실루엣 뒤에 깐다
  g.strokeStyle = 'rgba(230,30,64,0.95)'; g.lineWidth = 5; g.lineJoin = 'round';
  for (const q of all) g.stroke(q);
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(110,12,30,0.8)'; g.lineWidth = 1.2;   // 깃 사이 결
  for (const q of feathers) g.stroke(q);
  for (const q of body) g.fill(q);   // 몸통 위의 결은 지운다
}
/** 실루엣용 검은 얼룩 (가운데 진함) */
function bakeBlob(g, w, h) {
  const R = w / 2;
  g.fillStyle = rad(g, R, R, 0, R, R, R, [[0, 'rgba(0,0,0,1)'], [0.55, 'rgba(0,0,0,0.85)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, 0, w, h);
}
/** 핏빛 달 (반지름 104) */
function bakeMoon(g, w, h) {
  const c = w / 2, R = 104;
  g.fillStyle = rad(g, c - R * 0.32, c - R * 0.32, R * 0.08, c, c, R, [[0, '#ff9a80'], [0.5, '#d0182a'], [1, '#4a000c']]);
  g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill();
  g.fillStyle = 'rgba(64,0,12,0.38)';
  for (const [x, y, r] of [[-0.3, -0.2, 0.18], [0.25, 0.12, 0.24], [-0.06, 0.4, 0.12], [0.36, -0.36, 0.1], [-0.46, 0.24, 0.09]]) { g.beginPath(); g.arc(c + x * R, c + y * R, r * R, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(255,190,180,0.6)'; g.lineWidth = 3;
  g.beginPath(); g.arc(c, c, R - 2, -2.5, -0.7); g.stroke();
}
/** 일식 코로나 (고리 반지름 54, 빛살은 128 까지) */
function bakeCorona(g, w, h, arg) {
  const c = w / 2, col = arg === 'gold' ? '#ffc860' : '#ff2a3a';
  g.fillStyle = rad(g, c, c, 0, c, c, c, [[0, rgba(col, 0)], [0.38, rgba(col, 0)], [0.415, 'rgba(255,240,235,0.95)'], [0.45, rgba(col, 0.95)], [0.6, rgba(col, 0.4)], [0.8, rgba(col, 0.12)], [1, rgba(col, 0)]]);
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 30; i++) {
    const a = (i + Math.random() * 0.6) / 30 * TAU, r0 = c * 0.44, r1 = c * (0.62 + Math.random() * 0.36), hw = 0.018 + Math.random() * 0.03;
    g.fillStyle = rgba(col, 0.25 + Math.random() * 0.35);
    g.beginPath();
    g.moveTo(c + Math.cos(a - hw * 2) * r0, c + Math.sin(a - hw * 2) * r0);
    g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    g.lineTo(c + Math.cos(a + hw * 2) * r0, c + Math.sin(a + hw * 2) * r0);
    g.closePath(); g.fill();
  }
}
/** 해돋이 (원반 반지름 60, 빛살 128) */
function bakeSun(g, w, h) {
  const c = w / 2;
  g.fillStyle = rad(g, c, c, 0, c, c, c, [[0, '#fffef0'], [0.4, '#ffe89a'], [0.47, '#ffc860'], [0.5, 'rgba(255,160,40,0.55)'], [0.75, 'rgba(255,140,30,0.15)'], [1, 'rgba(255,120,20,0)']]);
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU, r0 = c * 0.5, r1 = c * (i % 2 ? 0.8 : 0.98), hw = 0.05;
    g.fillStyle = i % 2 ? 'rgba(255,220,140,0.35)' : 'rgba(255,240,190,0.55)';
    g.beginPath(); g.moveTo(c + Math.cos(a - hw) * r0, c + Math.sin(a - hw) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.lineTo(c + Math.cos(a + hw) * r0, c + Math.sin(a + hw) * r0); g.closePath(); g.fill();
  }
}
const WING = { blood: ['#3a0008', '#ff2a4a', '#1a0006', '#ff8a9a'], bat: ['#0a0408', '#8a1030', '#000000', '#ff4a6a'], gold: ['#5a3008', '#ffd070', '#3a2006', '#fff8d0'] };
/** 피의 박쥐 날개 막 (어깨 뿌리 = (20, 176), +x·위로 펼쳐진다) */
function bakeWing(g, w, h, arg) {
  const [c0, c1, bone, rim] = WING[arg] ?? WING.blood;
  const sx = 20, sy = 176, wx = 108, wy = 60;
  const tips = [[250, 12], [246, 86], [212, 146], [150, 182]];
  const P = new Path2D();
  P.moveTo(sx, sy); P.lineTo(wx, wy); P.lineTo(tips[0][0], tips[0][1]);
  for (let i = 0; i < tips.length - 1; i++) {
    const [x0, y0] = tips[i], [x1, y1] = tips[i + 1];
    P.quadraticCurveTo(lerp((x0 + x1) / 2, wx, 0.35), lerp((y0 + y1) / 2, wy, 0.35), x1, y1);
  }
  P.quadraticCurveTo(lerp((tips[3][0] + sx) / 2, wx, 0.3), lerp((tips[3][1] + sy) / 2, wy, 0.3) + 12, sx + 26, sy + 10);
  P.closePath();
  g.fillStyle = lin(g, sx, sy, 250, 30, [[0, c0], [0.55, rgba(c1, 0.92)], [1, rgba(c1, 0.72)]]);
  g.fill(P);
  g.strokeStyle = bone; g.lineCap = 'round';
  g.lineWidth = 6; g.beginPath(); g.moveTo(sx, sy); g.lineTo(wx, wy); g.stroke();
  g.lineWidth = 3;
  for (const [x, y] of tips) { g.beginPath(); g.moveTo(wx, wy); g.quadraticCurveTo((wx + x) / 2 + 6, (wy + y) / 2 - 6, x, y); g.stroke(); }
  g.fillStyle = bone; g.beginPath(); g.moveTo(wx - 4, wy); g.lineTo(wx - 2, wy - 16); g.lineTo(wx + 6, wy - 2); g.closePath(); g.fill();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = rgba(rim, 0.55); g.lineWidth = 1.6; g.stroke(P);
}
const CRES = { red: ['#ff1a3a', '#ffe0e4', '#c0142a', '#9a0d1c'], gold: ['#ffc040', '#fffbe8', '#ffd070', '#ffe8a0'], white: ['#f4f0ff', '#ffffff', '#fff2b0', '#ffffff'], dark: ['#2a0c40', '#c090ff', '#b060ff', '#6a2a9a'] };
/** 피의 초승달 (중심 (128,128), 바깥 반지름 108, 두꺼운 쪽이 +x) + 가장자리 핏방울 */
function bakeCres(g, w, h, arg) {
  const [col, edge, glowC, drop] = CRES[arg] ?? CRES.red;
  const cx = w / 2, cy = h / 2, R = 108, half = 1.2;
  const path = (d) => {
    const tx = R * Math.cos(half), ty = R * Math.sin(half), r2 = Math.hypot(tx + d, ty), a2 = Math.atan2(ty, tx + d);
    g.beginPath(); g.arc(cx, cy, R, -half, half, false); g.arc(cx - d, cy, r2, a2, -a2, true); g.closePath();
  };
  g.shadowColor = glowC; g.shadowBlur = 16; g.fillStyle = rgba(col, 0.92); path(R * 0.5); g.fill();
  g.shadowBlur = 5; g.shadowColor = edge; g.fillStyle = edge; path(R * 0.15); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = drop;
  for (let i = 0; i < 11; i++) {
    const a = lerp(-half * 0.9, half * 0.9, i / 10) + (Math.random() - 0.5) * 0.08, r = R + 3 + Math.random() * 8, s = 1.8 + Math.random() * 2.4;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, nx = Math.cos(a + HP), ny = Math.sin(a + HP);
    g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(x + nx * s * 0.8, y + ny * s * 0.8); g.lineTo(x + Math.cos(a) * s * 3.2, y + Math.sin(a) * s * 3.2); g.lineTo(x - nx * s * 0.8, y - ny * s * 0.8); g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, R, -half * 0.92, half * 0.92); g.stroke();
}
const SPEC = {
  blade: { w: 72, h: 480, bake: bakeBlade }, beam: { w: 64, h: 4, bake: bakeBeam }, banner: { w: 56, h: 128, bake: bakeBanner },
  crow: { w: 512, h: 256, bake: bakeCrow }, blob: { w: 64, h: 64, bake: bakeBlob },
  moon: { w: 256, h: 256, bake: bakeMoon }, corona: { w: 256, h: 256, bake: bakeCorona }, sun: { w: 256, h: 256, bake: bakeSun },
  wing: { w: 256, h: 200, bake: bakeWing }, cres: { w: 256, h: 256, bake: bakeCres },
};
/** 'kind[:arg]' 이름의 캐시 스프라이트 */
function spr(name, keep = null) {
  const i = name.indexOf(':'), kind = i < 0 ? name : name.slice(0, i), arg = i < 0 ? null : name.slice(i + 1);
  const d = SPEC[kind];
  if (!d) return null;
  return cached(name, d.w, d.h, (g, w, h) => d.bake(g, w, h, arg), keep ?? (LIVE && !LIVE.over ? LIVE.keep : null));
}
/** 영웅·직업별로 쓰는 캐시 스프라이트 이름 */
function needs(charId, classId) {
  switch (charId) {
    case 'bran': return ['blade', 'beam', 'banner:' + (BANNER[classId] ? classId : 'base')];
    case 'lia': return ['crow', 'blob', 'beam'];
    case 'azel': {
      const n = ['moon', 'corona:red'];
      if (classId === 'azel_dawnbringer') n.push('sun', 'wing:gold', 'cres:gold');
      else if (classId === 'azel_seraph') n.push('cres:white', 'cres:dark');
      else n.push(classId === 'azel_nosferatu' ? 'wing:bat' : 'wing:blood', 'cres:red');
      return n;
    }
    default: return [];
  }
}
/** 이 영웅이 쓰는 빛 색 (ULTFX.glow 풀에 미리 굽는다) */
function glowCols(charId, classId) {
  switch (charId) {
    case 'bran': return ['#cfe0ff', BRAN_TINT[classId] ?? '#9ab0ff', '#ffe8b0'];
    case 'lia': return ['#ff2040', '#b0102a', classId === 'lia_reaper' ? '#6affb0' : classId === 'lia_bladedancer' ? '#ffd84a' : '#ff4a6a'];
    case 'azel': return classId === 'azel_dawnbringer' ? ['#ffd070', '#fff0b0', '#ff2a4a'] : ['#ff1a2a', '#ff2a4a', classId === 'azel_seraph' ? '#b060ff' : '#b0103a'];
    default: return [];
  }
}

/** 이 영웅이 뿌리는 연기 모양 입자 색 (preset 기본색 포함) */
function softCols(charId, classId) {
  switch (charId) {
    case 'bran': return ['#6a9aff', '#e8f0ff', '#5a6a90', '#8a8074', ...(classId === 'bran_warlord' ? ['#ff5020'] : [])];
    case 'lia': return ['#5a0610'];
    case 'azel': return ['#5a0610'];
    default: return [];
  }
}
// ─── 미리 굽기 (스테이지 진입·방 이동·직업 변경 뒤 한가할 때) ───
let PREP_KEY = null, HOOKED = false;
export function prepareAwakenB(world = game?.world, p = world?.player) {
  const cid = p?.hero?.charId, cls = p?.hero?.classId;
  if (!cid || !AWAKEN_DIRECTOR_B[cid] || typeof document === 'undefined') return false;
  if ((CLASSES[cls]?.tier ?? 0) < 1 || world?.mode === 'town') return false;   // 각성할 수 없는 곳·직업은 굽지 않는다
  if (liveCast()) return false;
  const list = needs(cid, cls), key = cid + '|' + cls;
  if (PREP_KEY === key && list.every((n) => POOL.some((s) => s.key === n))) { idle(() => prepPoses(world, p), 600); return true; }
  if (!ensurePool()) return false;
  const keep = new Set();
  for (const n of list) spr(n, keep);
  for (const c of glowCols(cid, cls)) { try { ULTFX.glow?.(c); } catch { /* 빛 스프라이트 실패는 연출만 줄어든다 */ } }
  // 연기 모양 입자(fire·smoke·dust·bloodmist)의 색별 부드러운 원 · 별 (hitfx 캐시; 시전 중에 굽지 않게)
  try { for (const c of softCols(cid, cls)) HFX.soft?.(c); if (cls === 'bran_crusader') HFX.star?.('#fff2b0'); } catch { /* hitfx 캐시 */ }
  PREP_KEY = key; AWAKEN_DIR_B_DEBUG.prepared = key;
  PREP_KEEP = keep;
  idle(() => prepPoses(world, p), 600);   // 망령 기사·분신 잔상도 시전 전에 (한가할 때 한 장씩)
  return true;
}
let PREP_KEEP = null;
/**
 * 잔상 비트맵을 시전 전에 굽는다 (한가할 때 한 장씩, drawHero 1회). 퍼펫 그림이 아직 안 받아졌으면 조금 뒤 다시.
 * 시전 때 look(장비)·직업·해상도가 같으면 그대로 쓰고, 다르면 감독이 틱마다 한 장씩 굽는다 (bakeStep).
 */
function prepPoses(world, p, tries = 0) {
  if (liveCast()) return;
  if (!p || p.dead || !world || world.player !== p || game?.world !== world || world.mode === 'town') return;
  const cid = p.hero?.charId, cls = p.hero?.classId;
  if ((CLASSES[cls]?.tier ?? 0) < 1) return;
  const rs = RS[qOf(world)];
  const jobs = poseJobs(cid, cls).filter((j) => !poseFresh(poseKey(cid, j.name), p, rs));
  if (!jobs.length) return;
  if (!pupReady(p)) { if (tries < 8) setTimeout(() => idle(() => prepPoses(world, p, tries + 1)), 1200); return; }
  try { bakePose({ p, w: world, rs, charId: cid, keep: PREP_KEEP }, jobs[0]); } catch (err) { console.warn('[awakenB] pose', err); return; }
  if (jobs.length > 1) {
    if (tries >= 8) setTimeout(() => prepPoses(world, p, tries), 20);   // 컷인 중: 다음 작업 틈에 바로
    else setTimeout(() => idle(() => prepPoses(world, p, tries), 400), 0);
  }
}
/** 퍼펫 그림이 준비됐는가 (퍼펫이 꺼졌거나 없는 직업은 벡터 그림 → 언제나 준비됨) */
function pupReady(p) {
  try {
    if (!PUP.puppetEnabled?.()) return true;
    if (PUP.puppetFor?.(p, p.look)) return true;
    const cid = p.ch?.id ?? p.hero?.charId, cls = PUP.classOf?.(p, p.look);
    return !(cid && cls && PUP.hasPuppet?.(cid, cls));
  } catch { return true; }
}
function idle(fn, timeout = 900) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout });
  else setTimeout(fn, 80);
}
function schedulePrep(delay = 700) {
  if (typeof setTimeout !== 'function') return;
  setTimeout(() => idle(() => { try { prepareAwakenB(); } catch (e) { console.warn('[awakenB] prepare', e); } }), delay);
}
function hook() {
  if (HOOKED) return;
  HOOKED = true;
  try {
    bus.on('stageEntered', () => schedulePrep(900));
    bus.on('classChanged', () => { PREP_KEY = null; schedulePrep(400); });
    bus.on('roomEntered', () => { if (!liveCast()) schedulePrep(900); });
    // 각성 시전 (컷인 시작): 장비를 바꾼 뒤라 잔상이 낡았으면 컷인이 도는 동안(월드 정지) 한 장씩 굽는다
    // (스테이지에 들어오자마자 각성했거나 미리 굽기가 아직 돌지 않았으면 스프라이트도 여기서: 월드가 멈춘 컷인 동안, 프레임 사이 작업으로)
    bus.on('awakenCast', (e) => {
      const w = game?.world, p = w?.player;
      if (!p || !AWAKEN_DIRECTOR_B[e?.charId ?? p.hero?.charId]) return;
      setTimeout(() => {
        try { ensurePool(); prepareAwakenB(w, p); } catch (err) { console.warn('[awakenB] prepare', err); }
        setTimeout(() => { try { prepPoses(w, p, 8); } catch (err) { console.warn('[awakenB] pose', err); } }, 0);
      }, 0);
    });
  } catch (e) { console.warn('[awakenB] bus', e); }
}
/**
 * 진행 중인 시전이 있는가. 방 이동·스테이지 이탈로 감독 개체가 end() 없이 버려졌으면 여기서 정리한다
 * (그대로 두면 미리 굽기가 계속 막히고 캐시 슬롯도 붙잡힌다)
 */
function liveCast() {
  const L = LIVE;
  if (!L || L.over) return false;
  const w = L.w;
  if (L.main && game?.world === w && w?.entities?.includes(L.main)) return true;
  if (!L.main && game?.world === w) return true;   // 시작 중 (run 전)
  try { finish(L, L.o ?? {}); } catch (err) { report(err, 'stale'); }
  return false;
}
// 부팅 뒤 한가할 때 풀을 만든다 (모듈 최상위에서는 가져온 값에 접근하지 않는다: 순환 import 규칙)
// 이벤트 연결은 모듈 그래프 평가가 끝난 바로 뒤 (첫 각성보다 한참 먼저), 캔버스 풀·미리 굽기는 부팅이 끝나고 한가할 때
if (typeof window !== 'undefined' && typeof setTimeout === 'function') {
  setTimeout(() => { try { hook(); } catch (e) { console.warn('[awakenB] hook', e); } }, 0);
  setTimeout(() => idle(() => { try { ensurePool(); prepareAwakenB(); } catch (e) { console.warn('[awakenB] pool', e); } }, 2500), 1600);
}

// ═══════════════════════════ 영웅 잔상 비트맵 (drawHero 1회) ═══════════════════════════
/** 영웅·직업별 잔상 비트맵 목록 (브란: 망령 기사 경례·돌격 / 리아: 순간이동 베기 둘 + 그림자 분신) */
function poseJobs(charId, classId) {
  switch (charId) {
    case 'bran': {
      const KT = BRAN_TINT[classId] ?? '#9ab0ff';
      return [{ name: 'salute', anim: 'heavy_up', o: { move: true, tint: KT, tintA: 0.72 } }, { name: 'charge', anim: 'heavy_low', o: { move: true, tint: KT, tintA: 0.72 } }];
    }
    case 'lia': {
      const out = [{ name: 'a', anim: 'stab', o: { move: true } }, { name: 'b', anim: 'stab_alt', o: { move: true } }];
      if (classId === 'lia_shadowmaster') out.push({ name: 'c', anim: 'stab_alt', o: { move: true, tint: '#8a4aff', tintA: 0.82 } });
      return out;
    }
    default: return [];
  }
}
const poseKey = (charId, name) => 'pose:' + charId + ':' + name;
const POSE_META = new Map();   // 캐시 키 → { look, sig, cls, rs } (구울 때의 모습)
function lookSig(p) { try { return JSON.stringify(p.look ?? null); } catch { return '?' + Math.random(); } }
/** 캐시의 잔상이 지금 영웅 모습(직업·장비·해상도)과 같은가 */
function poseFresh(key, p, rs) {
  const m = POSE_META.get(key);
  if (!m || !POOL.some((s) => s.key === key)) return false;
  if (m.cls !== p.hero?.classId || m.rs !== rs) return false;
  if (m.look === p.look) return true;
  if (lookSig(p) !== m.sig) return false;
  m.look = p.look;   // 같은 모습의 새 look 객체 (능력치 갱신 등)
  return true;
}
/** 시전 시작: 미리 구운 잔상은 그대로 쓰고, 없거나 낡은 것만 굽기 예약 */
function usePoses(S) {
  for (const j of poseJobs(S.charId, S.cls)) {
    const key = poseKey(S.charId, j.name), e = poseFresh(key, S.p, S.rs) ? POOL.find((s) => s.key === key) : null;
    if (e) { e.used = ++USE; S.keep.add(key); S.bmp[j.name] = { c: e.c, W: e.c.width, H: e.c.height }; }
    else S.queue.push(j);
  }
}
/** 굽기 예약분: 틱마다 한 장 (drawHero 한 번 ≈ 그라디언트 9개 — 프레임 예산 안에서) */
function bakeStep(S) {
  if (!S.queue.length) return;
  const j = S.queue.shift();
  try { S.bmp[j.name] = bakePose(S, j); } catch (err) { report(err, 'pose'); }
}
/** C = { p, w, rs, charId, keep } (감독 문맥 S 또는 미리 굽기) */
function bakePose(C, j) {
  const p = C.p;
  if (typeof p?.snapshot !== 'function') return null;
  const rs = C.rs, W = Math.ceil(2 * GB.bw * rs), H = Math.ceil((GB.bt + GB.bb) * rs), key = poseKey(C.charId, j.name);
  const c = cached(key, W, H, (g) => {
    const s = p.snapshot();
    Object.assign(s, { facing: 1, cx: GB.bw, bottom: GB.bt, x: GB.bw - p.w / 2, y: GB.bt - p.h, vx: 0, vy: 0, onGround: !j.o.air, ride: null, rig: null });
    if (j.o.move) { s.move = { id: 'awb_' + j.anim, anim: j.anim, dur: 0.5, hit: [0.1, 0.2], box: null, skill: true }; s.moveT = j.o.t ?? 0.2; s.anim = j.anim; }
    else { s.move = null; s.moveT = 0; s.anim = j.anim; s.animT = j.o.at ?? 0.06; }
    g.setTransform(rs, 0, 0, rs, 0, 0);
    drawHero(g, s, C.w, { noFx: true });
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (j.o.tint) {
      g.globalCompositeOperation = 'source-atop'; g.globalAlpha = j.o.tintA ?? 0.78;
      g.fillStyle = j.o.tint; g.fillRect(0, 0, W, H);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
  }, C.keep, true);
  AWAKEN_DIR_B_DEBUG.poseBakes++;
  if (c) POSE_META.set(key, { look: p.look, sig: lookSig(p), cls: p.hero?.classId, rs });
  else POSE_META.delete(key);
  return c ? { c, W, H } : null;
}
/** 잔상 비트맵을 발 중앙 (x, bottom) 에 그린다. face < 0 이면 좌우 반전, sc 배율 */
function drawPose(ctx, b, x, bottom, face, a, add = false, sc = 1) {
  if (!b || !(a > 0.004)) return;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
  const dw = 2 * GB.bw * sc, dh = (GB.bt + GB.bb) * sc;
  if (face < 0) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(b.c, 0, 0, b.W, b.H, -GB.bw * sc, bottom - GB.bt * sc, dw, dh); ctx.restore(); }
  else ctx.drawImage(b.c, 0, 0, b.W, b.H, x - GB.bw * sc, bottom - GB.bt * sc, dw, dh);
}

// ═══════════════════════════ 그리기 도구 (그라디언트 없음) ═══════════════════════════
function glow(ctx, col, x, y, r, a) {
  if (!(a > 0.01) || !(r > 1)) return;
  let g = null;
  try { g = ULTFX.glow?.(col) ?? null; } catch { g = null; }
  if (!g) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(g, x - r, y - r, r * 2, r * 2);
}
/** 늘인 빛 (가로 rx, 세로 ry 반지름) */
function glowE(ctx, col, x, y, rx, ry, a) {
  if (!(a > 0.01) || !(rx > 1) || !(ry > 1)) return;
  let g = null;
  try { g = ULTFX.glow?.(col) ?? null; } catch { g = null; }
  if (!g) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(g, x - rx, y - ry, rx * 2, ry * 2);
}
/** 이미지를 (x,y) 기준점(ax, ay: 0..1)에 sx·sy 배율, rot 회전으로 */
function img(ctx, c, x, y, sx, sy, rot, a, add = false, ax = 0.5, ay = 0.5) {
  if (!c || !(a > 0.004) || !sx || !sy) return;
  ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sx, sy);
  ctx.drawImage(c, -c.width * ax, -c.height * ay);
  ctx.restore();
}
/** 세로 빛기둥 (흰 심 + 색 번짐) */
function pillar(ctx, S, x, y0, y1, wd, col, a) {
  if (!(a > 0.01) || !(wd > 0.5)) return;
  glowE(ctx, col, x, (y0 + y1) / 2, wd * 2.2, Math.abs(y1 - y0) * 0.62, 0.8 * a);
  const b = spr('beam');
  if (b) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a > 1 ? 1 : a; ctx.drawImage(b, x - wd, Math.min(y0, y1), wd * 2, Math.abs(y1 - y0)); }
}
/** 가로 빛줄기 */
function band(ctx, x0, x1, y, hh, a) {
  if (!(a > 0.01) || !(hh > 0.5)) return;
  const b = spr('beam');
  if (!b) return;
  ctx.save(); ctx.translate((x0 + x1) / 2, y); ctx.rotate(HP);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a > 1 ? 1 : a;
  ctx.drawImage(b, -hh, -Math.abs(x1 - x0) / 2, hh * 2, Math.abs(x1 - x0));
  ctx.restore();
}
/** 4갈래 반짝임 (경로만) */
function flare(ctx, x, y, s, col, a, rot = 0) {
  if (!(a > 0.01) || s < 1) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a > 1 ? 1 : a; ctx.fillStyle = col;
  for (let i = 0; i < 2; i++) {
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(0, -s * 0.09); ctx.lineTo(s, 0); ctx.lineTo(0, s * 0.09); ctx.closePath(); ctx.fill();
    ctx.rotate(HP);
  }
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, TAU); ctx.fill();
  ctx.restore();
}
/** 빛의 칼선 (가운데가 두꺼운 마름모) */
function cut(ctx, x0, y0, x1, y1, wd, col, a) {
  if (!(a > 0.01)) return;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, 0.5 * a); ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx + nx * wd * 2.4, my + ny * wd * 2.4); ctx.lineTo(x1, y1); ctx.lineTo(mx - nx * wd * 2.4, my - ny * wd * 2.4); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx + nx * wd * 0.55, my + ny * wd * 0.55); ctx.lineTo(x1, y1); ctx.lineTo(mx - nx * wd * 0.55, my - ny * wd * 0.55); ctx.closePath(); ctx.fill();
}
/** 화면(카메라 뷰)을 덮는 어둠막 (low 는 번쩍임이 켜진 동안 건너뛴다: 화면 전체 층 ≤ 1) */
function dimFill(ctx, S, col, a) {
  if (!(a > 0.01)) return;
  if (S.low && (game?.flashFx?.a ?? 0) > 0.03) return;
  const c = S.cam;
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a > 1 ? 1 : a; ctx.fillStyle = col;
  ctx.fillRect(c.x - 90, c.y - 90, c.vw + 180, c.vh + 180);
}
/** 가로 스프라이트 시트의 fi 번째 칸 */
function frame(ctx, c, fi, nf, x, y, sx, sy, rot, a, add = false) {
  if (!c || !(a > 0.004) || !sx || !sy) return;
  const fw = c.width / nf, fh = c.height;
  ctx.globalAlpha = a > 1 ? 1 : a; ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sx, sy);
  ctx.drawImage(c, fi * fw, 0, fw, fh, -fw / 2, -fh / 2, fw, fh);
  ctx.restore();
}
function kitSprite(name) { try { return ULTFX.sprite?.(name) ?? null; } catch { return null; } }
/** 조명: 어둠만 뚫는다 (색광 스프라이트는 색마다 캔버스를 새로 굽으므로 쓰지 않는다 — 빛 번짐은 이 파일의 가산 스프라이트가 그린다) */
function lit(L, x, y, r, col, i) { if (i > 0.01 && Number.isFinite(x) && Number.isFinite(y)) L.add(x, y, r, col, i, false); }

// ═══════════════════════════ 감독 공통 ═══════════════════════════
let SEQ = 0;
const BRAN_TINT = { bran_guardian: '#a8c0ff', bran_crusader: '#fff0c0', bran_warlord: '#ffb070', bran_bloodrage: '#ff7a7a' };

/** 입자 여유 (각성 최대치 700/450/250 의 SHARE 안에서, 품질 배율 적용 — 나머지는 한꺼번에 맞는 타격 불꽃·처치 파편·키트 몫) */
const SHARE = { high: 0.75, medium: 0.7, low: 0.55 };   // 이 파일 입자의 몫 (나머지는 적 전원을 한꺼번에 때릴 때의 타격 불꽃·처치 파편)
function room(S, n) {
  const fx = S.w.fx;
  if (!fx?.list) return 0;
  const cap = Math.min(QCAP[S.q] * SHARE[S.q], fx.max ?? 1400);
  return Math.max(0, Math.min(Math.round(n * S.fq), Math.floor(cap - fx.list.length)));
}
/**
 * 마무리 직전: 앞 박자들이 남긴 오래된 연기·먼지·불꽃을 먼저 걷어 낸다 (각성 최대치의 k 까지).
 * 마무리 일격은 적 전원의 타격 불꽃·처치 파편(이 파일이 세지 않는 입자)을 한꺼번에 만들므로 여유를 남겨 둔다.
 * 번쩍임·임팩트 프레임이 덮는 순간이라 사라지는 것이 보이지 않는다. 데미지 숫자·글자·고리·스프라이트는 건드리지 않는다.
 */
const DROP = new Set(['smoke', 'flake', 'square', 'circle', 'spark', 'star', 'streak', 'soft', 'line']);
function trimFx(S, k = 0.5) {
  const list = S.w.fx?.list;
  if (!Array.isArray(list)) return;
  let over = list.length - Math.floor(QCAP[S.q] * k);
  if (over <= 0) return;
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (over > 0 && DROP.has(q?.shape)) { over--; continue; }
    list[j++] = q;
  }
  list.length = j;
}
function emitN(S, type, x, y, n, opts) {
  const k = room(S, n);
  for (let i = 0; i < k; i++) S.w.fx.emit(type, x, y, opts);
  return k;
}
function view(S, pad = 0) {
  try { const r = FXKIT.ultView?.(S.w, pad); if (r) return r; } catch { /* 기본 뷰 */ }
  return S.v.view(pad);
}
function ground(S, x, y, drop = 8 * TILE) {
  try { return FXKIT.groundAt?.(S.w, x, y, drop) ?? null; } catch { return null; }
}
function foes(S, pad = 20) {
  try { return S.v.foes(view(S, pad)); } catch { return []; }
}
/** 화면에 보이는 적 (그리기용: 무적이어도 포함) */
function visFoes(S) {
  const cam = S.cam, out = [];
  try { for (const e of S.w.enemies()) if (cam.visible(e.x, e.y, e.w, e.h, 40)) out.push(e); } catch { /* 적 없음 */ }
  return out;
}
function beat(S, x, y, power, ground = false) {
  S.beats++;
  try { ULTFX.beat?.(S.w, x, y, { power, color: S.col, accent: S.acc, ground, tier: S.tier }); } catch (err) { report(err, 'beat'); }
}
/** 가짜 동작으로 렌더러 자세를 붙잡는다 (판정 없음). silent 면 휘두르는 소리도 없음 */
function pose(S, anim, dur, o = {}) {
  const p = S.p;
  try {
    const h0 = o.h0 ?? dur * 0.3;
    p.startMove?.(S.w, { id: 'awb_' + anim, anim, dur, hit: [h0, h0 + (o.hw ?? 0.08)], box: null, skill: true, awaken: true, sfx: o.sfx ?? 'slash', cancel: dur, mv: 0 });
    if (o.silent) p.moveHitDone = true;
  } catch (err) { report(err, 'pose'); }
}
/** 연출 구도 (배율은 기본 줌에 곱한다; 동작 줄이기에서는 40%) */
function cine(S, x, y, zk, t) {
  const cam = S.cam;
  if (!cam?.cine || !Number.isFinite(x) || !Number.isFinite(y)) return;
  if (S.calm) zk = 1 + (zk - 1) * 0.4;
  try { cam.cine(x, y, (cam.baseZoom || 1) * zk, t); S.cined = true; } catch (err) { report(err, 'cine'); }
}
function cineOn(S, ent, zk, t) {
  const cam = S.cam;
  if (!cam?.cine || !ent) return;
  if (S.calm) zk = 1 + (zk - 1) * 0.4;
  try { cam.cine(ent, (cam.baseZoom || 1) * zk, t); S.cined = true; } catch (err) { report(err, 'cine'); }
}
function uncine(S, t = 0.3) {
  if (!S.cined) return;
  S.cined = false;
  try { S.cam.cineEnd?.(t); } catch { /* 카메라 없음 */ }
}
/** 연출 도중 영웅이 방 출구를 넘지 않게 (출구 판정은 개체 갱신 뒤: 감독이 플레이어보다 늦게 갱신되므로 여기서 막힌다) */
function keepIn(S) {
  const p = S.p, m = S.w.map;
  if (!p || !m || !(m.pxW > 0) || !(m.pxH > 0)) return;
  const maxX = m.pxW - p.w, maxY = m.pxH - p.h;
  if (p.x < 0) { p.x = 0; if (p.vx < 0) p.vx = 0; } else if (p.x > maxX) { p.x = maxX; if (p.vx > 0) p.vx = 0; }
  if (p.y < 0) { p.y = 0; if (p.vy < 0) p.vy = 0; } else if (p.y > maxY) { p.y = maxY; if (p.vy > 0) p.vy = 0; }
}

/**
 * 타격 (v.hit / v.final) + 2차 전직 효과: 흡혈(lifesteal)·처치 회복(healPerKill)·콤보 피해(comboDmg, 공격 배율로).
 * 실제 피해·처치는 대상의 lastImpact(combat.hitTarget 이 타격마다 새로 만든다)로 센다 (보스 상한이 적용된 값).
 */
function strike(S, rect, wt, o = {}, fin = false) {
  const pre = S.pre;
  pre.clear();
  try { for (const e of S.w.enemies()) pre.set(e, e.lastImpact); } catch { /* 적 없음 */ }
  const a = S.mod ? S.mod(o) : o;
  let n = 0;
  try { n = (fin ? S.v.final(rect, wt, a) : S.v.hit(rect, wt, a)) || 0; } catch (err) { report(err, 'hit'); }
  if (!n) return 0;
  let dmg = 0;
  const killed = [];
  for (const [e, li] of pre) {
    const L = e.lastImpact;
    if (!L || L === li) continue;
    if (L.dmg > 0) dmg += L.dmg;
    if (e.dead || !(e.hp > 0) || e.dying > 0) killed.push(e);
  }
  S.hits += n; S.dmg += dmg; S.kills += killed.length;
  const t2 = S.t2, p = S.p;
  if (t2?.lifesteal > 0 && dmg > 0 && !p.dead) S.healed += p.heal?.(dmg * t2.lifesteal, false) ?? 0;
  if (t2?.healPerKill > 0 && killed.length && !p.dead) S.healed += p.heal?.(p.stats.hp * t2.healPerKill * killed.length, false) ?? 0;
  if (killed.length && S.onKill) { try { S.onKill(S, killed); } catch (err) { report(err, 'kill'); } }
  if (dmg > 0 && S.onDmg) { try { S.onDmg(S, pre); } catch (err) { report(err, 'dmg'); } }
  return n;
}
/** 연출 개체의 컬링 상자: 플레이어 중심으로 뷰를 덮는다 (가짜 벽 판정이 중심을 보므로 중심 = 플레이어) */
function cover(e, S) {
  const c = S.cam, p = S.p, R = Math.max(c.vw, c.vh) + 240;
  e.x = p.cx - R; e.y = p.cy - R; e.w = R * 2; e.h = R * 2;
}
/** 다른 z 층 (감독이 끝나면 같이 사라진다; tail 초만큼 더 남길 수 있다) */
function layer(S, z, draw, tail = 0) {
  return S.w.add(new SkillFx({
    life: S.DUR + 0.05 + tail, z,
    follow: (e) => cover(e, S),
    tick: (e) => { if (S.over && !tail) e.dead = true; },
    draw: (ctx) => { if (S.lt == null) return; try { draw(ctx, S); } catch (err) { report(err, 'draw'); } },
  }));
}
function at(S, t, fn) { S.steps.push([t, fn]); }
function later(S, dt, fn) { S.pend.push([(S.lt ?? 0) + dt, fn]); }

/** 감독 문맥 S + 키트 시작 */
function begin(p, w, v, dur, kit = null) {
  hook();
  if (LIVE && !LIVE.over) LIVE.over = true;   // 끝나지 않은 옛 시전 (방 이동으로 버려진 경우)
  const q = qOf(w);
  const S = {
    p, w, v, cam: w.camera, q, low: q === 'low', fq: w.fx?.quality ?? 1, rs: RS[q],
    charId: v.charId ?? p.hero?.charId, cls: v.classId, tier: v.tier ?? 1, t2: v.t2 ?? null,
    col: v.color, acc: v.accent, dark: v.dark ?? '#05020a', f: p.facing < 0 ? -1 : 1,
    W: Array.isArray(v.data?.mvWeights) ? v.data.mvWeights : [], id: 'awb' + (++SEQ), DUR: dur,
    lt: null, over: false, main: null, steps: [], si: 0, pend: [], keep: new Set(), queue: [], bmp: {},
    hits: 0, dmg: 0, kills: 0, healed: 0, beats: 0, peak: 0, pre: new Map(), mod: null, onKill: null, onDmg: null,
    fk: flashK(), calm: !!game?.settings?.reduceMotion, cined: false, x0: p.cx, b0: p.bottom,
  };
  LIVE = S;
  AWAKEN_DIR_B_DEBUG.casts++;
  if (S.t2?.comboDmg > 0) {
    const k = S.t2.comboDmg;
    S.mod = (o) => ({ mult: (p.dmgMul ?? 1) * (1 + Math.min(0.5, Math.floor((w.combo?.n ?? 0) / 10) * k)), ...o });
  }
  for (const n of needs(S.charId, S.cls)) spr(n, S.keep);   // 미리 구워 두었으면 그대로 (없으면 지금 굽는다)
  usePoses(S);   // 망령 기사·분신 잔상: 미리 구운 것은 그대로, 없거나 낡은 것만 틱마다 한 장씩
  try {
    ULTFX.begin?.(w, p, { color: S.col, accent: S.acc, tier: S.tier, classId: S.cls, charId: S.charId, dimCol: S.dark, awaken: true, dur: Math.min(2.4, dur), maxDur: dur + 3, ...kit });
  } catch (err) { report(err, 'ultfx.begin'); }
  return S;
}
/** 메인 감독 엔티티 (z 12, 앞층 그리기). 돌려준 엔티티가 끝나면 awaken.js 가 연출 상태를 되돌린다 */
function run(S, o) {
  S.steps.sort((a, b) => a[0] - b[0]);
  const ent = new SkillFx({
    life: S.DUR, z: 12,
    follow: (e) => cover(e, S),
    tick(e, ww, dt) {
      S.lt = e.lt;
      if (S.over) { e.dead = true; return; }
      keepIn(S);
      bakeStep(S);
      while (S.si < S.steps.length && S.steps[S.si][0] <= e.lt) { const fn = S.steps[S.si++][1]; try { fn(S); } catch (err) { report(err, 'step'); } }
      for (let i = 0; i < S.pend.length;) {
        if (S.pend[i][0] <= e.lt) { const fn = S.pend[i][1]; S.pend.splice(i, 1); try { fn(S); } catch (err) { report(err, 'step'); } } else i++;
      }
      try { o.tick?.(S, dt); } catch (err) { report(err, 'tick'); }
      const n = ww.fx?.list?.length ?? 0;
      if (n > S.peak) S.peak = n;
      if (e.lt > 6.5) { e.dead = true; finish(S, o); }   // 안전 상한 (awaken.js 최대 7초보다 먼저)
    },
    draw(ctx) { if (S.lt == null) return; try { o.draw?.(ctx, S); } catch (err) { report(err, 'draw'); } },
    light(L) { if (S.lt == null) return; try { o.light?.(L, S); } catch { /* 조명 실패 무시 */ } },
    end() { finish(S, o); },
  });
  S.o = o;
  S.main = S.w.add(ent);
  return S.main;
}
function finish(S, o) {
  if (S.over) return;
  S.over = true;
  if (LIVE === S) LIVE = null;
  try { o.end?.(S); } catch (err) { report(err, 'end'); }
  uncine(S, 0.35);
  if (S.p) S.p.hidden = false;
  if (S.healed >= 1 && S.p && !S.p.dead) {
    try { S.w.fx.text(S.p.cx, S.p.y - 16, '+' + Math.round(S.healed), { color: '#7ee07e', size: 22, life: 1 }); } catch { /* 글자 실패 무시 */ }
  }
  AWAKEN_DIR_B_DEBUG.last = {
    charId: S.charId, classId: S.cls, tier: S.tier, hits: S.hits, dmg: Math.round(S.dmg), kills: S.kills, healed: Math.round(S.healed),
    beats: S.beats, peak: S.peak, lt: +(S.lt ?? 0).toFixed(2), done: true,
  };
}
/** 적 → 영웅으로 휘어 드는 흐름 (피·영혼): 곡선을 따라가는 방울들 */
function makeStreams(S, list, col, dark, dur = 0.8) {
  const p = S.p, n = S.low ? 4 : 8, out = [];
  for (const e of list.slice(0, n)) out.push({ x: e.cx, y: e.cy, bx: (e.cx + p.cx) / 2 + rand(-90, 90), by: Math.min(e.cy, p.cy) - rand(90, 190), d: rand(0, 0.12) });
  return out.length ? { t0: S.lt ?? 0, dur, col, dark, S: out } : null;
}
function drawStreams(ctx, S, st) {
  if (!st) return;
  const u0 = S.lt - st.t0;
  if (u0 < 0 || u0 > st.dur) return;
  const tx = S.p.cx, ty = S.p.cy - 10, nd = S.low ? 6 : 10;
  let g = null;
  try { g = ULTFX.glow?.(st.col) ?? null; } catch { g = null; }
  for (const s of st.S) {
    for (let i = 0; i < nd; i++) {
      const u = clamp((u0 - s.d - i * 0.03) / 0.42, 0, 1);
      if (u <= 0 || u >= 1) continue;
      const iu = 1 - u, x = iu * iu * s.x + 2 * iu * u * s.bx + u * u * tx, y = iu * iu * s.y + 2 * iu * u * s.by + u * u * ty, r = 6.5 * (1 - u * 0.45);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = st.dark;
      ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.fill();
      if (g) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.8; ctx.drawImage(g, x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4); }
    }
  }
  glow(ctx, st.col, tx, ty, 90 + 60 * Math.sin(clamp(u0 / st.dur, 0, 1) * PI), 0.55 * Math.sin(clamp(u0 / st.dur, 0, 1) * PI));
}

// ═══════════════════════════ 브란 — 철심 해방: 기사단의 진혼가 ═══════════════════════════
function bran(p, w, v) {
  const S = begin(p, w, v, 3.0);
  const f = S.f, cls = S.cls, cam = S.cam, W = S.W;
  const KT = BRAN_TINT[cls] ?? '#9ab0ff';
  const warlord = cls === 'bran_warlord', crusader = cls === 'bran_crusader', blood = cls === 'bran_bloodrage', guardian = cls === 'bran_guardian';
  const wCleave = W[0] ?? 4, wKnight = (i) => W[1 + i] ?? 0.5, wFinal = W[W.length - 1] ?? 4;
  const bannerKey = 'banner:' + (BANNER[cls] ? cls : 'base');
  const gy0 = ground(S, p.cx, p.bottom - 8, 3 * TILE) ?? p.bottom;
  S.gy0 = gy0; S.kt = KT;
  /** 망령 기사 대열 (브란 뒤) */
  const formation = (cx, gy) => {
    const V = view(S), out = [], lo = V.x + 46, hi = V.x + V.w - 46;
    const space = f > 0 ? cx - lo : hi - cx;   // 브란 뒤쪽 화면 여유 (방 끝에 서 있으면 좁다)
    let ahead = 0;
    for (let i = 0; i < 6; i++) {
      const row = i % 2, k = i >> 1, d = 82 + k * 66 + row * 32;
      let x = cx - f * d, back = true;
      if (d > space) { x = cx + f * (104 + ahead * 58); ahead++; back = false; }   // 뒤가 좁으면 앞쪽 뒷줄에 (화면 밖으로 나가지 않게)
      x = clamp(x, lo, hi);
      const g = ground(S, x, gy - 60, 4 * TILE), far = row === 1 || !back;
      out.push({ x, gy: g != null && Math.abs(g - gy) < 90 ? g : gy, s: far ? 0.9 : 1.02, a: far ? 0.46 : 0.6, t0: 0.05 + i * 0.07, ph: rand(0, TAU) });
    }
    return out;
  };
  const knCenter = () => { let x = p.cx; for (const k of S.kn) x += k.x; return x / (S.kn.length + 1); };
  S.kn = formation(p.cx, gy0);
  S.blade = null; S.cut = null; S.charge = []; S.chargeT = -1; S.reform = -1; S.fall = null; S.pillarT = -1; S.cross = null; S.streams = null; S.plant = null;

  // 배경 어둠 (캐릭터 뒤)
  layer(S, -1, (ctx, S) => dimFill(ctx, S, '#060918', 0.56 * u01(S.lt, 0, 0.25) * (1 - u01(S.lt, 2.55, 0.4))));
  // 망령 기사 대열 (브란 뒤)
  layer(S, 9.5, (ctx, S) => {
    const lt = S.lt, b = S.bmp.salute;
    const gone = S.chargeT >= 0 && S.reform < 0 ? u01(lt, S.chargeT, 0.18) : 0;
    const back = S.reform >= 0 ? u01(lt, S.reform, 0.18) : 0;
    const vis = S.reform >= 0 ? back : 1 - gone;
    const endK = 1 - u01(lt, 2.55, 0.4);
    for (const k of S.kn) {
      const rise = S.reform >= 0 ? 1 : ease.outCubic(u01(lt, k.t0, 0.3));
      if (rise <= 0 || vis <= 0.01) continue;
      const bob = Math.sin(lt * 3 + k.ph) * 2, a = k.a * vis * endK * (0.85 + 0.15 * Math.sin(lt * 7 + k.ph));
      glow(ctx, KT, k.x, k.gy - 70 * k.s, 78 * k.s, 0.32 * a);
      if (rise < 1) {   // 땅에서 솟아오른다 (아래부터 드러남)
        ctx.save(); ctx.beginPath(); ctx.rect(k.x - 200, k.gy - (GB.bt * k.s) * rise - 4, 400, GB.bt * k.s * rise + GB.bb + 8); ctx.clip();
        drawPose(ctx, b, k.x, k.gy + (1 - rise) * 24 + bob, f, a, true, k.s);
        ctx.restore();
      } else drawPose(ctx, b, k.x, k.gy + bob, f, a, true, k.s);
      if (S.reform >= 0 && back > 0.5) flare(ctx, k.x + f * 8 * k.s, k.gy - 205 * k.s, 16 + 6 * Math.sin(lt * 20 + k.ph), '#ffffff', 0.7 * a);   // 들어 올린 검끝
      if (warlord && S.reform < 0) drawBanner(ctx, S, k.x - f * 22 * k.s, k.gy - 60 * k.s, k.s * 0.9, a, k.ph, true);
    }
  });

  at(S, 0, (S) => {
    sfx('war_horn', { vol: 1 }); sfx('awaken_charge', { vol: 0.45, pitch: 0.75 });
    pose(S, 'heavy_down', 0.6, { h0: 0.04, sfx: 'slash_heavy' });   // 대검을 땅에 꽂는다
    const tx = p.cx + f * 44;
    S.plant = { x: tx, y: gy0, t: S.lt };
    if (room(S, 2)) { w.fx.ring(tx, gy0 - 6, { color: KT, r0: 6, r1: 120, life: 0.35, width: 6 }); w.fx.ering(tx, gy0 - 2, { color: '#cfe0ff', r0: 10, r1: 220, ry: 0.18, life: 0.45, width: 6 }); }
    emitN(S, 'dust', tx, gy0 - 4, 10, { speed: 170, angle: -HP, spread: 1.3 });
    emitN(S, 'gravel', tx, gy0 - 4, 8, { angle: -HP, spread: 0.9, speed: 320 });
    if (!S.low) HFX.stampDecal?.(w, tx, gy0 - 6, f, 'crack', { floor: true, scale: 1.2, life: 10 });
    cam.kick?.(0, 7); cam.addTrauma?.(0.22);
    cine(S, knCenter(), p.cy - 60, 1.1, 0.35);   // 기사단이 한 화면에 들어오게
  });
  at(S, 0.16, () => { sfx('ghost', { pitch: 0.65, vol: 0.7 }); });
  at(S, 0.3, () => { sfx('holy', { pitch: 0.5, vol: 0.6 }); for (const k of S.kn) emitN(S, 'magic', k.x, k.gy - 60, 3, { color: KT, speed: 90, angle: -HP, spread: 0.8 }); });
  // 0.4 도약 — 대검이 자라며 푸른 강철 불꽃
  at(S, 0.4, (S) => {
    pose(S, 'heavy_up', 0.42, { h0: 0.05, sfx: 'jump' });
    p.vy = -1150; p.vx = 0; p.onGround = false; p.jumpCut = true;
    S.blade = { t0: S.lt, swing: -1, planted: -1 };
    sfx('fire', { pitch: 0.55, vol: 0.9 }); sfx('dash_burst', { pitch: 0.7 });
    emitN(S, 'dust', p.cx, p.bottom - 4, 12, { speed: 230, angle: -HP, spread: 1.5 });
    if (room(S, 1)) w.fx.ering(p.cx, p.bottom - 2, { color: '#cfe0ff', r0: 10, r1: 160, ry: 0.2, life: 0.35, width: 6 });
    cineOn(S, p, 0.9, 0.3);   // 화면이 물러난다 (0.9)
  });
  at(S, 0.72, (S) => {
    pose(S, 'heavy_down', 0.5, { h0: 0.08, sfx: 'slash_heavy' });
    p.vy = Math.max(p.vy, 1650);
    if (S.blade) S.blade.swing = S.lt;
    sfx('dash', { pitch: 0.6 });
  });
  // 0.8 거대 내려베기 — 대지가 갈라진다
  at(S, 0.8, (S) => {
    const V = view(S), list = foes(S);
    let tx = p.cx + f * 300, best = null, bd = 1e9;
    for (const e of list) { const d = (e.cx - p.cx) * f; if (d > -20 && d < 720 && d < bd) { bd = d; best = e; } }
    if (best) tx = best.cx;
    tx = clamp(tx, V.x + 130, V.x + V.w - 130);
    const gy = ground(S, tx, Math.min(p.bottom, gy0) - 60, 10 * TILE) ?? gy0;
    const pts = [];
    for (const s of [-1, 1]) {
      const P = [tx, gy];
      const len = Math.max(200, s > 0 ? V.x + V.w + 40 - tx : tx - V.x + 40);
      for (let i = 1; i <= 16; i++) P.push(tx + s * len * i / 16, gy - 2 + rand(-6, 6));
      pts.push(P);
    }
    S.cut = { x: tx, gy, t: S.lt, pts, top: V.y - 60, bot: V.y + V.h + 60 };
    if (S.blade) S.blade.planted = S.lt;
    strike(S, { x: tx - 110, y: V.y - 60, w: 220, h: V.h + 120 }, wCleave * 0.75, { gb: true, kb: [f * 60, 560], hitstop: 0.12, shake: 12 });
    strike(S, view(S, 30), wCleave * 0.25, { gb: true, kb: [0, 420], hitstop: 0, shake: 0 });   // 갈라진 대지의 충격 (화면 전체)
    beat(S, tx, gy - 10, 1, true);
    w.game?.flash?.('#dfe8ff', 0.4, 4);
    cam.punchZoom?.(1.07, 0.1); cam.kick?.(0, 16); cam.addTrauma?.(0.55);
    sfx('slash_heavy', { pitch: 0.5 }); sfx('explode', { pitch: 0.6 }); sfx('impact_crack'); sfx('break_wall', { vol: 0.8 });
    emitN(S, 'gravel', tx, gy - 6, 26, { angle: -HP, spread: 1.2, speed: 560 });
    emitN(S, 'shard', tx, gy - 6, 10, { angle: -HP, spread: 1.0, speed: 480 });
    if (room(S, 1)) w.fx.ering(tx, gy - 2, { color: '#cfe0ff', r0: 30, r1: V.w * 0.55, ry: 0.14, life: 0.5, width: 12 });
    if (!S.low) for (const dx of [0, -150, 150, -300, 300]) HFX.stampDecal?.(w, tx + dx, gy - 6, dx < 0 ? -1 : 1, 'crack', { floor: true, scale: dx ? 1.3 : 2.2, life: 14 });
    if (crusader) { S.cross = { x: tx, y: gy - 130, t: S.lt }; sfx('bell', { pitch: 0.6, vol: 0.7 }); }
    cine(S, (p.cx + tx) / 2, gy - V.h * 0.3, 0.96, 0.15);
  });
  // 1.0 망령 기사단 돌격 (화면을 가로지르는 파도)
  at(S, 1.0, (S) => {
    uncine(S, 0.35);
    cam.zoomPulse?.(S.calm ? 0.97 : 0.92, 0.22, 0.7, 0.35);
    const V = view(S), gy = S.cut?.gy ?? gy0;
    for (let i = 0; i < 6; i++) {
      const row = i % 2;
      S.charge.push({ i, x: f > 0 ? V.x - 120 - i * 72 : V.x + V.w + 120 + i * 72, gy: gy - row * 16, row, hit: S.id + ':k' + i, beat: false, sc: row ? 0.92 : 1.04, banner: warlord || i % 2 === 0, ph: rand(0, TAU) });
    }
    S.chargeT = S.lt;
    sfx('war_horn', { pitch: 1.2, vol: 0.75 }); sfx('dash_burst', { pitch: 0.6 });
    for (const k of S.kn) emitN(S, 'magic', k.x, k.gy - 60, 4, { color: KT, speed: 160 });
  });
  // 1.85 기사단 재집결 — 브란과 기사들이 검을 들어 올린다
  at(S, 1.85, (S) => {
    S.reform = S.lt;
    S.kn = formation(p.cx, ground(S, p.cx, p.bottom - 8, 3 * TILE) ?? p.bottom);
    pose(S, 'heavy_up', 0.7, { h0: 0.1, sfx: 'slash_heavy' });
    sfx('holy', { pitch: 0.6 }); sfx('charge_ready', { pitch: 0.6 });
    const x = S.cut?.x ?? p.cx + f * 260, gy = S.cut?.gy ?? gy0;
    S.fall = { x, gy, t0: S.lt + 0.12, t1: S.lt + 0.3, hit: -1 };
    cine(S, (p.cx + x) / 2, gy - view(S).h * 0.36, 0.9, 0.3);
  });
  // 2.15 빛의 대검이 균열에 떨어진다 (마무리)
  at(S, 2.15, (S) => {
    const fl = S.fall;
    if (!fl) return;
    fl.hit = S.lt; S.pillarT = S.lt;
    const V = view(S), targets = foes(S, 30);
    trimFx(S, 0.5);
    strike(S, view(S, 40), wFinal, { kb: [f * 300, -700] }, true);
    try { ULTFX.final?.(w, fl.x, fl.gy - 20, { color: S.col, accent: S.acc, tier: 2, classId: cls, charId: S.charId, ground: true, flourish: S.tier >= 2, targets }); } catch (err) { report(err, 'ultfx.final'); }
    sfx('awaken_boom'); sfx('land_heavy', { pitch: 0.6 });
    for (let i = room(S, 26); i > 0; i--) w.fx.emit('gravel', V.x + rand(0, V.w), V.y - 10, { angle: HP, spread: 0.3, speed: rand(60, 220) });   // 잔해 비
    emitN(S, 'ember', fl.x, fl.gy - 60, 22, { speed: 420, color: S.col });
    if (crusader) S.cross = { x: fl.x, y: fl.gy - 160, t: S.lt, big: true };
    if (blood) S.streams = makeStreams(S, targets, '#ff1a2a', '#7a0012');
    uncine(S, 0.5);
  });

  const tick = (S, dt) => {
    const lt = S.lt;
    // 자라는 대검: 푸른 강철 불꽃
    const B = S.blade;
    if (B && (B.planted < 0 || lt - B.planted < 0.3)) {
      const bg = bladeGeo(S);
      for (let i = room(S, 2); i > 0; i--) {
        const u = Math.random();
        w.fx.emit('fire', bg.hx + Math.cos(bg.ang) * bg.len * u, bg.hy + Math.sin(bg.ang) * bg.len * u, { color: '#6a9aff', color2: '#e8f0ff', speed: 50 });
      }
      if (B.planted < 0 && room(S, 1)) w.fx.speedLine(p.cx + rand(-110, 110), p.cy + rand(-80, 60), HP * (p.vy < 0 ? 1 : -1), { len: rand(70, 150), width: 2.5, color: '#cfe0ff', life: 0.18, speed: 900 });
    }
    // 돌격하는 기사: 화면 전체 높이의 판정 띠 (기사마다 적 전원 1타)
    if (S.chargeT >= 0 && S.charge.length) {
      const V = view(S), sp = 1900;
      for (const k of S.charge) {
        if (k.done) continue;
        k.x += f * sp * dt;
        const inView = k.x > V.x - 90 && k.x < V.x + V.w + 90;
        if (inView) {
          strike(S, { x: k.x - 70, y: V.y - 40, w: 140, h: V.h + 80 }, wKnight(k.i), { hitId: k.hit, hitstop: 0, kb: [f * 90, -120], shake: 0 });
          k.tk = (k.tk ?? 0) + 1;
          if (k.tk % 2 === 0) emitN(S, 'smoke', k.x - f * 30, k.gy - rand(4, 30), 1, { color: '#5a6a90', speed: 40, angle: -HP - f * 0.6, spread: 0.4, size: rand(16, 28), life: rand(0.4, 0.65), alpha: 0.45, grav: -30 });
          else emitN(S, 'dust', k.x - f * 16, k.gy - 4, 1, { speed: 140, angle: f > 0 ? PI + 0.3 : -0.3, spread: 0.3 });
          if (blood) emitN(S, 'blood', k.x + f * 30, k.gy - 70, 1, { speed: 160 });
          if (warlord && Math.random() < 0.8) emitN(S, 'fire', k.x - f * 26, k.gy - 150 * k.sc, 1, { color: '#ff5020', speed: 80, angle: -HP, spread: 0.6 });
          if (!k.beat && (k.x - (V.x + V.w / 2)) * f > 0) {
            k.beat = true;
            beat(S, k.x, k.gy - 50, 0.35, true);
            sfx('slash_heavy', { pitch: 0.8 + k.i * 0.06, vol: 0.6 });
            cam.kick?.(f * 3, 0);
            if (crusader && room(S, 1)) { const st = HFX.star?.('#fff2b0'); if (st) w.fx.sprite(st, k.x, k.gy - 90, { size: 120, life: 0.22, s0: 0.3, s1: 1.2 }); }
          }
        }
        if ((f > 0 && k.x > V.x + V.w + 400) || (f < 0 && k.x < V.x - 400)) k.done = true;
      }
    }
  };
  const draw = (ctx, S) => {
    const lt = S.lt;
    // 꽂힌 대검의 빛
    if (S.plant) { const a = 1 - u01(lt, S.plant.t, 0.45); glow(ctx, KT, S.plant.x, S.plant.y - 10, 120, 0.5 * a); }
    // 대검
    const B = S.blade;
    if (B) {
      const fade = B.planted >= 0 ? 1 - u01(lt, B.planted + 0.22, 0.2) : 1;
      if (fade > 0.01) {
        const bg = bladeGeo(S), bl = spr('blade');
        const mx = bg.hx + Math.cos(bg.ang) * bg.len * 0.5, my = bg.hy + Math.sin(bg.ang) * bg.len * 0.5;
        ctx.save(); ctx.translate(mx, my); ctx.rotate(bg.ang + HP);
        glowE(ctx, KT, 0, 0, 34 + bg.len * 0.08, bg.len * 0.62, 0.55 * fade);
        ctx.restore();
        img(ctx, bl, bg.hx, bg.hy, bg.k, bg.k, bg.ang + HP, fade, false, 0.5, (bl ? (bl.height - 50) / bl.height : 0.9));
        img(ctx, bl, bg.hx, bg.hy, bg.k, bg.k, bg.ang + HP, 0.35 * fade, true, 0.5, (bl ? (bl.height - 50) / bl.height : 0.9));
      }
    }
    // 내려베기 기둥 + 갈라진 대지
    const C = S.cut;
    if (C) {
      const age = lt - C.t, a = 1 - u01(age, 0.08, 0.5), wd = 110 * (0.6 + 0.4 * ease.outCubic(u01(age, 0, 0.06)));   // 히트스톱(시간 정지) 동안에도 기둥이 보이게
      if (a > 0.01) {
        pillar(ctx, S, C.x, C.top, C.bot, wd, KT, 0.9 * a);
        pillar(ctx, S, C.x, C.top, C.bot, wd * 0.35, '#ffffff', a);
      }
      const k = ease.outCubic(u01(age, 0, 0.3)), ca = (1 - u01(lt, 2.55, 0.4)) * (0.55 + 0.45 * (1 - u01(age, 0.2, 0.8)));
      if (ca > 0.01) {
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const P of C.pts) {
          const nPts = Math.max(2, Math.round((P.length / 2) * k));
          ctx.beginPath(); ctx.moveTo(P[0], P[1]);
          for (let i = 1; i < nPts; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1]);
          ctx.strokeStyle = rgba(KT, 0.45); ctx.globalAlpha = ca; ctx.lineWidth = 12; ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.stroke();
        }
        glowE(ctx, KT, C.x, C.gy, 260 * k, 40, 0.5 * ca);
      }
    }
    // 성전의 파도 (십자군): 십자 충격파
    if (S.cross) {
      const X = S.cross, age = lt - X.t, a = 1 - u01(age, 0.1, 0.6), k = ease.outCubic(u01(age, 0, 0.35)), big = X.big ? 1.6 : 1;
      if (a > 0.01) {
        const V = view(S);
        band(ctx, X.x - V.w * 0.6 * k * big, X.x + V.w * 0.6 * k * big, X.y, 16 * big, 0.8 * a);
        pillar(ctx, S, X.x, X.y - 260 * k * big, X.y + 200 * k * big, 16 * big, '#fff2b0', 0.8 * a);
        glow(ctx, '#ffe8b0', X.x, X.y, 160 * big * k, 0.5 * a);
      }
    }
    // 돌격하는 망령 기사단
    if (S.chargeT >= 0) {
      const b = S.bmp.charge;
      for (const k of S.charge) {
        if (k.done) continue;
        const bob = Math.abs(Math.sin(lt * 18 + k.ph)) * -6;
        glow(ctx, KT, k.x, k.gy - 70 * k.sc, 86 * k.sc, 0.35);
        drawPose(ctx, b, k.x - f * 84, k.gy + bob, f, 0.12, true, k.sc);   // 잔향 둘
        drawPose(ctx, b, k.x - f * 42, k.gy + bob, f, 0.24, true, k.sc);
        drawPose(ctx, b, k.x, k.gy + bob, f, 0.62, true, k.sc);
        if (k.banner) drawBanner(ctx, S, k.x - f * 20 * k.sc, k.gy - 70 * k.sc + bob, k.sc, 0.85, k.ph + lt * 3, warlord);
      }
    }
    // 하늘에서 떨어지는 빛의 대검
    const F = S.fall;
    if (F) {
      const V = view(S), bl = spr('blade');
      if (lt >= F.t0 - 0.12 && F.hit < 0) {
        const u = u01(lt, F.t0, F.t1 - F.t0), tipY = lerp(V.y - 520, F.gy + 6, ease.inCubic(u)), sc = 2.1;
        if (lt < F.t0) flare(ctx, F.x, V.y + 30, 40 + 20 * Math.sin(lt * 40), '#ffffff', 0.9, lt * 3);   // 하늘의 반짝임
        else {
          const top = tipY - (bl ? (bl.height - 50) * sc : 900);
          pillar(ctx, S, F.x, top, tipY, 50, S.col, 0.55);
          img(ctx, bl, F.x, tipY, sc, sc, PI, 1, false, 0.5, 10 / (bl?.height ?? 480));
          img(ctx, bl, F.x, tipY, sc, sc, PI, 0.6, true, 0.5, 10 / (bl?.height ?? 480));
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; ctx.strokeStyle = '#fff4d0'; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = -3; i <= 3; i++) { const x = F.x + i * 34; ctx.moveTo(x, tipY - 260 - Math.abs(i) * 40); ctx.lineTo(x, tipY - 60 - Math.abs(i) * 30); }
          ctx.stroke();
        }
      }
      if (F.hit >= 0) {   // 박힌 대검 + 빛기둥
        const age = lt - F.hit, a = 1 - u01(age, 0.25, 0.6), sc = 2.1;
        if (a > 0.01) {
          pillar(ctx, S, F.x, V.y - 60, F.gy, 90 * (1 - 0.5 * u01(age, 0, 0.4)), S.col, a);
          img(ctx, bl, F.x, F.gy + 60, sc, sc, PI, a, false, 0.5, 10 / (bl?.height ?? 480));
          glow(ctx, '#ffffff', F.x, F.gy - 20, 220, 0.6 * (1 - u01(age, 0, 0.35)));
        }
      }
    }
    drawStreams(ctx, S, S.streams);
  };
  const light = (L, S) => {
    const lt = S.lt;
    if (S.blade && (S.blade.planted < 0 || lt - S.blade.planted < 0.4)) { const bg = bladeGeo(S); lit(L, bg.hx + Math.cos(bg.ang) * bg.len * 0.5, bg.hy + Math.sin(bg.ang) * bg.len * 0.5, 260, KT, 1.1); }
    if (S.kn.length && (S.chargeT < 0 || S.reform >= 0)) { const k = S.kn[2] ?? S.kn[0]; lit(L, k.x, k.gy - 80, 300, KT, 0.9); }
    if (S.cut && lt - S.cut.t < 0.8) lit(L, S.cut.x, S.cut.gy - 120, 520, KT, 1.3);
    if (S.chargeT >= 0) for (const k of S.charge) if (!k.done && k.i % 2 === 0) lit(L, k.x, k.gy - 70, 240, KT, 0.9);
    if (S.fall && lt >= S.fall.t0) lit(L, S.fall.x, S.fall.gy - 160, 620, '#fff2c0', S.fall.hit >= 0 ? 1.6 * (1 - u01(lt, S.fall.hit + 0.3, 0.6)) : 1);
  };
  const end = (S) => {
    if (guardian && !S.p.dead) domeAfter(S, S.t2?.invuln ?? 3);   // 수호의 방벽: 끝난 뒤 무적 동안 결계를 보여 준다
  };
  return run(S, { tick, draw, light, end });
}
/** 브란의 망령 대검: 손 위치·각도·길이 (도약 중 1→3.2배로 자라고, 0.72초에 앞으로 내려친다) */
function bladeGeo(S) {
  const p = S.p, f = S.f, B = S.blade, lt = S.lt;
  const grow = ease.outBack(u01(lt, B.t0, 0.32));
  const k = lerp(0.24, 0.72, clamp(grow, 0, 1.15));   // 스프라이트 배율 (0.24 ≈ 영웅 대검 길이, 0.72 ≈ 3.2배)
  const sw = B.swing >= 0 ? ease.inCubic(u01(lt, B.swing, 0.08)) : 0;
  const ar = lerp(-HP - 0.25, 0.95, sw);
  const ang = f > 0 ? ar : PI - ar;
  const hx = p.cx + f * lerp(6, 30, sw), hy = p.bottom - p.h * lerp(1.12, 0.6, sw);
  return { k, ang, hx, hy, len: 430 * k };
}
/** 기사단 군기 (펄럭임; warlord 는 키트의 불타는 군기 스프라이트) */
function drawBanner(ctx, S, x, y, sc, a, ph, flame) {
  const c = flame ? (kitSprite('banner') ?? spr('banner:base')) : spr('banner:' + (BANNER[S.cls] ? S.cls : 'base'));
  if (!c) return;
  ctx.save(); ctx.translate(x, y);
  ctx.transform(1, 0, Math.sin(ph * 4) * 0.1, 1, 0, 0);
  const s = flame ? 0.62 * sc : 0.95 * sc;
  img(ctx, c, 0, 0, s, s, 0, a, false, flame ? 0.5 : 5.5 / 56, 1);
  ctx.restore();
  if (flame) glow(ctx, '#ff5020', x, y - 110 * sc, 50 * sc, 0.4 * a);
}
/** 수호성기사: 각성 뒤 무적 동안 브란을 감싸는 방패 결계 */
function domeAfter(S, dur) {
  const p = S.p, w = S.w, dome = kitSprite('dome');
  if (!(dur > 0)) return;
  w.add(new SkillFx({
    life: dur, z: 10.5,
    follow: (e) => { e.x = p.cx - 200; e.y = p.bottom - 260; e.w = 400; e.h = 300; },
    tick: (e) => { if (p.dead || w.game?.world !== w) e.dead = true; },
    draw: (ctx, e) => {
      const a = u01(e.lt, 0, 0.2) * (1 - u01(e.lt, dur - 0.5, 0.5)), pul = 0.85 + 0.15 * Math.sin(e.lt * 6);
      glow(ctx, '#a8c0ff', p.cx, p.bottom - 70, 150, 0.25 * a * pul);
      if (dome) img(ctx, dome, p.cx, p.bottom + 4, 1.25, 1.25, 0, 0.55 * a * pul, true, 0.5, 1);
      else { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#a8c0ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(p.cx, p.bottom, 110, 130, 0, PI, TAU); ctx.stroke(); }
    },
    light: (L) => lit(L, p.cx, p.bottom - 70, 220, '#a8c0ff', 0.7),
  }));
}

// ═══════════════════════════ 리아 — 흑우: 까마귀의 장례 ═══════════════════════════
function lia(p, w, v) {
  // 키트의 색보정·집중선 층은 끈다: 화면이 거의 검게 (0.92) 가라앉아야 붉은 눈·실루엣만 남는다
  const S = begin(p, w, v, 2.95, { lines: false });
  const f = S.f, cls = S.cls, cam = S.cam, W = S.W;
  const shadow = cls === 'lia_shadowmaster', kuno = cls === 'lia_kunoichi', dancer = cls === 'lia_bladedancer', reaper = cls === 'lia_reaper';
  const NB = 12, wBlink = (i) => W[i] ?? 0.36, wFinal = W[W.length - 1] ?? 4.5;
  const RED = '#ff2040';
  S.slashes = []; S.blinks = []; S.petals = []; S.orbits = []; S.vis = []; S.crow = -1; S.back = -1; S.det = -1; S.souls = null;
  S.feathers = [];
  for (let i = 0, n = S.low ? 12 : 26; i < n; i++) S.feathers.push({ a: rand(0, TAU), r: rand(0.25, 0.62), sp: rand(1.2, 2.4) * (i % 2 ? 1 : -1), s: rand(6, 11), y: rand(-0.3, 0.3), ph: rand(0, TAU) });
  const dimK = (S) => u01(S.lt, 0, 0.18) * (1 - u01(S.lt, 2.25, 0.45));
  const eyes = () => ({ x: p.cx + f * 4, y: p.bottom - p.h * 1.08 });

  layer(S, -1, (ctx, S) => dimFill(ctx, S, '#040206', 0.92 * dimK(S)));
  // 거대 까마귀 (적 뒤, 붉은 역광 위의 실루엣)
  layer(S, 1.5, (ctx, S) => {
    if (S.crow < 0) return;
    const u = S.lt - S.crow;
    if (u < 0 || u > 0.8) return;
    const V = view(S), cx = V.x + V.w / 2, cy = V.y + V.h * 0.44, c = spr('crow');
    const open = ease.outBack(u01(u, 0, 0.28)), a = u01(u, 0, 0.06) * (1 - u01(u, 0.52, 0.28)) * 0.92;
    const sw = (V.w * 1.08) / 512, sx = sw * Math.max(0.05, open), sy = sw * (0.9 + 0.1 * Math.min(1, open)) * (1 + 0.03 * Math.sin(u * 18));
    // 붉은 하늘 역광 (검은 실루엣이 읽히게): 넓은 번짐 + 까마귀 뒤의 달처럼 뜨거운 핵
    glowE(ctx, '#b0102a', cx, cy, V.w * 0.62, V.h * 0.6, 0.95 * a);
    glow(ctx, '#ff2040', cx, cy - 30 * sy, V.h * 0.42 * Math.min(1, 0.4 + open), 0.9 * a);
    img(ctx, c, cx, cy, sx, sy, 0, Math.min(1, a * 1.08), false, 0.5, 150 / 256);
    const ex = cx + 10 * sx, ey = cy - 108 * sy;
    glow(ctx, RED, ex, ey, 46, a); flare(ctx, ex, ey, 30, '#ff6070', a, u * 2);
  });
  // 붉은 윤곽 (적 뒤) · 실루엣 (적 위)
  layer(S, 2.5, (ctx, S) => {
    const k = dimK(S) * (S.det >= 0 ? 1 - u01(S.lt, S.det, 0.3) : 1);
    if (k <= 0.01) return;
    for (const e of S.vis) glow(ctx, RED, e.cx, e.cy, Math.max(e.w, e.h) * 0.85 + 16, 0.5 * k);
  });
  layer(S, 4.6, (ctx, S) => {
    const k = dimK(S) * (S.det >= 0 ? 1 - u01(S.lt, S.det, 0.2) : 1), b = spr('blob');
    if (k <= 0.01 || !b) return;
    for (const e of S.vis) img(ctx, b, e.cx, e.cy, (e.w * 1.7) / 64, (e.h * 1.35) / 64, 0, 0.62 * k, false);
  });

  at(S, 0, (S) => {
    sfx('crow_caw', { vol: 1 }); sfx('mist', { vol: 0.6 });
    cine(S, p.cx, p.cy - 30, 1.18, 0.3);   // 붉은 눈에 다가간다
  });
  at(S, 0.2, (S) => {   // 검은 깃털 속으로 사라진다
    p.hidden = true;
    for (let i = room(S, 80); i > 0; i--) w.fx.emit('feather', p.cx + rand(-18, 18), p.cy + rand(-40, 30), { color: i % 5 ? '#0c0a12' : '#3a0a18', speed: rand(120, 420) });
    if (room(S, 1)) w.fx.ring(p.cx, p.cy, { color: '#b0102a', r0: 10, r1: 150, life: 0.3, width: 6 });
    sfx('mist'); sfx('dash', { pitch: 1.3 });
    uncine(S, 0.25);
  });
  for (let i = 0; i < NB; i++) at(S, 0.3 + i * 0.1, (S) => blink(S, i));
  at(S, 1.6, (S) => {   // 화면을 덮는 거대 까마귀
    S.crow = S.lt;
    sfx('crow_caw', { pitch: 0.7, vol: 1 }); sfx('bat', { pitch: 0.6, vol: 0.6 });
    cam.addTrauma?.(0.3); cam.zoomPulse?.(S.calm ? 0.98 : 0.94, 0.15, 0.3, 0.3);
    for (let i = room(S, 30); i > 0; i--) { const V = view(S); w.fx.emit('feather', V.x + rand(0, V.w), V.y + rand(0, V.h * 0.5), { color: '#0c0a12', speed: rand(60, 200) }); }
  });
  at(S, 1.9, (S) => {   // 제자리에 다시 나타나 납도 '찰칵' — 0.25초 정적
    S.back = S.lt;
    p.hidden = false; p.facing = f;
    pose(S, 'stab_alt', 0.4, { h0: 0.34, silent: true });
    sfx('sheath', { vol: 1 });
    try { audio.duck?.(0.95, 0.3); } catch { /* 음악 없음 */ }
    try { w.fx.text(p.cx + f * 26, p.y - 8, '찰칵', { color: '#ffd0d8', size: 18, life: 0.7, vy: -30 }); } catch { /* 글자 실패 무시 */ }
    cine(S, p.cx, p.cy - 20, 1.22, 0.12);
  });
  at(S, 2.15, (S) => {   // 쌓인 자국이 한꺼번에 — 지연 피해 (확정 치명)
    S.det = S.lt;
    const list = foes(S, 30);
    let cx = p.cx, cy = p.cy - 20;
    if (list.length) { cx = 0; cy = 0; for (const e of list) { cx += e.cx; cy += e.cy; } cx /= list.length; cy /= list.length; }
    trimFx(S, 0.5);
    strike(S, view(S, 40), wFinal, { crit: 100, element: 'dark', kb: [f * 200, -520] }, true);
    for (const e of list) { emitN(S, 'blood', e.cx, e.cy, 12, { speed: 380 }); emitN(S, 'bloodmist', e.cx, e.cy, 2, { speed: 40 }); }
    try { ULTFX.final?.(w, cx, cy, { color: RED, accent: S.acc, tier: 2, classId: cls, charId: S.charId, flourish: S.tier >= 2, targets: list, impactFg: RED, impactBg: '#000000', flashColor: RED }); } catch (err) { report(err, 'ultfx.final'); }
    sfx('awaken_boom'); sfx('slash_heavy', { pitch: 0.6 }); sfx('crit', { pitch: 0.7 });
    uncine(S, 0.35); cam.punchZoom?.(1.1, 0.2);
  });
  if (reaper) S.onKill = (S, killed) => { const st = makeStreams(S, killed, '#6affb0', '#0a3a24', 0.7); if (st) S.souls = st; sfx('ghost', { pitch: 1.2, vol: 0.5 }); };

  const tick = (S, dt) => {
    S.vis = visFoes(S);
    if (kuno) {   // 진홍 꽃보라: 화면을 가로지르는 꽃잎 + 순간이동마다 터지는 꽃잎
      const V = view(S);
      if (S.lt > 0.2 && S.lt < 2.3 && S.petals.length < (S.low ? 24 : 60) && Math.random() < 0.9) S.petals.push({ x: f > 0 ? V.x - 20 : V.x + V.w + 20, y: V.y + rand(0, V.h), vx: f * rand(500, 900), vy: rand(40, 140), fi: (Math.random() * 3) | 0, s: rand(0.7, 1.3), r: rand(0, TAU), vr: rand(-10, 10), life: 1.4 });
      for (let i = S.petals.length - 1; i >= 0; i--) { const q = S.petals[i]; q.x += q.vx * dt; q.y += q.vy * dt; q.r += q.vr * dt; q.vx *= 0.995; q.life -= dt; if (q.life <= 0) S.petals.splice(i, 1); }
    }
  };
  const draw = (ctx, S) => {
    const lt = S.lt, V = view(S);
    // 붉은 눈 (사라지기 전 · 다시 나타난 뒤)
    if (lt < 0.22 || (S.back >= 0 && lt - S.back < 0.55)) {
      const E = eyes(), a = lt < 0.22 ? u01(lt, 0, 0.06) : u01(lt, S.back, 0.08) * (1 - u01(lt, S.back + 0.35, 0.2));
      glow(ctx, RED, E.x, E.y, 26, 0.9 * a); flare(ctx, E.x, E.y, 22, '#ff5060', a, 0);
    }
    // 깃털 소용돌이
    if (lt > 0.2 && lt < 2.25) {
      const cx = V.x + V.w / 2, cy = V.y + V.h / 2, fa = u01(lt, 0.2, 0.2) * (1 - u01(lt, 1.95, 0.3));
      ctx.globalCompositeOperation = 'source-over';
      for (const q of S.feathers) {
        const an = q.a + lt * q.sp, x = cx + Math.cos(an) * q.r * V.w * 0.52, y = cy + Math.sin(an) * q.r * V.h * 0.42 + q.y * 60;
        ctx.save(); ctx.translate(x, y); ctx.rotate(an + HP * Math.sign(q.sp) + Math.sin(lt * 6 + q.ph) * 0.4);
        ctx.globalAlpha = 0.85 * fa; ctx.fillStyle = '#0c0a12';
        ctx.beginPath(); ctx.moveTo(q.s, 0); ctx.quadraticCurveTo(0, -q.s * 0.36, -q.s, 0); ctx.quadraticCurveTo(0, q.s * 0.36, q.s, 0); ctx.fill();
        ctx.globalAlpha = 0.5 * fa; ctx.strokeStyle = '#b0102a'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }
    }
    // 쌓인 베기 자국 (붉은 X, 청록 색수차)
    const flashAll = S.det >= 0 ? 1 - u01(lt, S.det, 0.5) : 0, gone = S.det >= 0 ? u01(lt, S.det + 0.25, 0.3) : 0;
    for (const s of S.slashes) {
      const age = lt - s.t, grow = ease.outCubic(u01(age, 0, 0.06)), L = s.L * grow;
      const live = 1 - u01(age, 0.1, 0.12);
      let a = Math.max(live, 0.24 + 0.06 * Math.sin(lt * 20 + s.r * 9));
      if (flashAll > 0) a = Math.min(1, 0.4 + flashAll);
      a *= 1 - gone;
      if (a <= 0.01) continue;
      const wd = flashAll > 0 ? 5 : live > 0.2 ? 3.4 : 2;
      for (const d of [-1, 1]) {
        const t = s.r + d * 0.78, cx = Math.cos(t) * L, sy = Math.sin(t) * L;
        if (!S.low && live > 0.05) cut(ctx, s.x - cx + 2.5, s.y - sy + 1.5, s.x + cx + 2.5, s.y + sy + 1.5, wd * 0.8, '#30e0ff', 0.45 * a * live);
        cut(ctx, s.x - cx, s.y - sy, s.x + cx, s.y + sy, wd, flashAll > 0 ? RED : '#ff2a4a', a);
      }
      if (flashAll > 0) glow(ctx, RED, s.x, s.y, s.L * 1.2, 0.5 * flashAll);
    }
    // 순간이동한 리아 (적 등 뒤) + 붉은 잔상
    for (const B of S.blinks) {
      const age = lt - B.t;
      if (age > 0.34) continue;
      const a = age < 0.14 ? 1 : 1 - u01(age, 0.14, 0.2), bm = S.bmp[B.pose];
      glow(ctx, B.clone ? '#b060ff' : RED, B.x, B.b - 50, 70, 0.45 * a);
      drawPose(ctx, bm, B.x - B.face * 10 * u01(age, 0, 0.14), B.b, B.face, (B.clone ? 0.85 : 1) * a, false);
      if (!B.clone && bm) drawPose(ctx, bm, B.x - B.face * (10 + 26 * u01(age, 0, 0.2)), B.b, B.face, 0.35 * a, true);
    }
    // 황금 칼날 소용돌이 (칼날 무희)
    if (dancer) {
      const bl = kitSprite('blade');
      for (const O of S.orbits) {
        const age = lt - O.t;
        if (age < 0 || age > 0.36) continue;
        const r = lerp(70, 18, ease.inCubic(age / 0.36)), a = 1 - u01(age, 0.22, 0.14);
        for (let i = 0; i < 5; i++) { const an = O.a + i * TAU / 5 + age * 16; img(ctx, bl, O.x + Math.cos(an) * r, O.y + Math.sin(an) * r * 0.8, 0.7, 0.7, an + HP, a, true); }
        glow(ctx, '#ffd84a', O.x, O.y, 60, 0.4 * a);
      }
    }
    // 진홍 꽃보라
    if (kuno && S.petals.length) {
      const pc = kitSprite('petals');
      for (const q of S.petals) frame(ctx, pc, q.fi, 3, q.x, q.y, q.s * Math.cos(q.r * 1.5), q.s, q.r, Math.min(1, q.life * 2), false);
    }
    drawStreams(ctx, S, S.souls);
  };
  const light = (L, S) => {
    const lt = S.lt;
    for (const B of S.blinks) if (lt - B.t < 0.25) lit(L, B.x, B.b - 50, 180, '#ff4060', 1);
    if (S.crow >= 0 && lt - S.crow < 0.8) { const V = view(S); lit(L, V.x + V.w / 2, V.y + V.h * 0.3, 360, '#ff2040', 0.8); }
    if (S.det >= 0 && lt - S.det < 0.6) { const V = view(S); lit(L, V.x + V.w / 2, V.y + V.h / 2, V.w * 0.6, '#ff2040', 1.2); }
    if (!p.hidden) lit(L, p.cx, p.cy, 140, '#ff4060', 0.6);
  };
  return run(S, { tick, draw, light });

  /** 순간이동 한 번: 대상의 등 뒤에 나타나 X자 베기 3연타 */
  function blink(S, i) {
    const V = view(S);
    let list = foes(S);
    list.sort((a, b) => Math.abs(a.cx - S.x0) - Math.abs(b.cx - S.x0));
    const tg = list.length ? list[i % list.length] : null;
    let hx, hy, gx, gb, face;
    if (tg) {
      const tf = tg.facing < 0 ? -1 : tg.facing > 0 ? 1 : (tg.cx >= S.x0 ? -1 : 1);
      face = tf;                                  // 등 뒤에서 대상이 보는 방향으로 벤다
      gx = tg.cx - tf * (tg.w / 2 + 24);
      gb = tg.bottom; hx = tg.cx; hy = tg.cy;
    } else {
      hx = V.x + V.w * rand(0.2, 0.8); gb = ground(S, hx, V.y + V.h * 0.5, 12 * TILE) ?? S.b0; hy = gb - 50;
      face = i % 2 ? -1 : 1; gx = hx - face * 40;
    }
    S.blinks.push({ x: gx, b: gb, face, t: S.lt, pose: i % 2 ? 'b' : 'a' });
    S.slashes.push({ x: hx, y: hy, L: rand(72, 108), r: rand(-0.55, 0.55), t: S.lt });
    if (S.slashes.length > 40) S.slashes.shift();
    if (shadow) {   // 그림자 분신: 반대편에서 거울처럼
      S.blinks.push({ x: 2 * hx - gx, b: gb, face: -face, t: S.lt + 0.02, pose: S.bmp.c ? 'c' : 'a', clone: true });
      S.slashes.push({ x: hx + rand(-8, 8), y: hy + rand(-8, 8), L: rand(64, 96), r: rand(-0.55, 0.55) + HP * 0.5, t: S.lt + 0.03 });
    }
    if (S.blinks.length > 30) S.blinks.splice(0, S.blinks.length - 30);
    if (dancer) S.orbits.push({ x: hx, y: hy, a: rand(0, TAU), t: S.lt });
    if (kuno) for (let k = 0; k < (S.low ? 4 : 8); k++) S.petals.push({ x: hx, y: hy, vx: rand(-420, 420), vy: rand(-380, 120), fi: k % 3, s: rand(0.7, 1.3), r: rand(0, TAU), vr: rand(-12, 12), life: 0.9 });
    if (S.orbits.length > 16) S.orbits.shift();
    const rect = { x: hx - 80, y: hy - 95, w: 160, h: 190 };
    for (let k = 0; k < 3; k++) {
      const hit = (S) => {
        strike(S, rect, wBlink(i) / 3, { hitId: `${S.id}:b${i}:${k}`, dir: face, element: 'dark', hitstop: k === 2 ? 0.025 : 0, kb: [face * 30, -50], shake: k === 2 ? 2 : 0 });
        emitN(S, 'spark', hx, hy, 3, { color: '#ff6070', speed: 360 });
        if (reaper) emitN(S, 'soul', hx, hy, 2, { color: '#6affb0', speed: 60 });
      };
      if (k === 0) hit(S); else later(S, k * 0.035, hit);
    }
    emitN(S, 'feather', gx, gb - 50, 3, { color: '#0c0a12', speed: 160 });
    S.cam.kick?.(rand(-4, 4), rand(-3, 3));
    sfx('slash', { pitch: rand(1.1, 1.5), vol: 0.6 });
    if (i % 3 === 0) sfx('dash', { pitch: 1.4, vol: 0.4 });
  }
}

// ═══════════════════════════ 아젤 — 크림슨 이클립스: 진조 해방 ═══════════════════════════
function azel(p, w, v) {
  const S = begin(p, w, v, 2.95);
  const f = S.f, cls = S.cls, cam = S.cam, W = S.W;
  const dawn = cls === 'azel_dawnbringer', seraph = cls === 'azel_seraph', batsOn = cls === 'azel_nosferatu', crown = cls === 'azel_bloodking';
  const wCres = (i) => W[i] ?? 0.5, wFinal = W[W.length - 1] ?? 5;
  const EL = S.t2?.element ?? 'dark';
  const cresKeys = dawn ? ['cres:gold'] : seraph ? ['cres:white', 'cres:dark'] : ['cres:red'];
  const wingKey = dawn ? 'wing:gold' : batsOn ? 'wing:bat' : 'wing:blood';
  const RED = dawn ? '#ffd070' : '#ff1a2a';
  S.cres = []; S.snap = -1; S.burst = -1; S.back = -1; S.streams = null; S.bats = null;
  if (batsOn) {
    S.bats = [];
    for (let i = 0, n = S.low ? 12 : 26; i < n; i++) S.bats.push({ a0: rand(0, TAU), r: rand(0.25, 0.5), w: rand(2.2, 3.4) * (i % 2 ? 1 : -1), s: rand(0.55, 1.0), ph: rand(0, TAU), tg: null, fx0: 0, fy0: 0, hit: false });
  }
  const eyes = () => ({ x: p.cx + f * 5, y: p.bottom - p.h * 1.06 });

  // 배경: 세상은 어두워지고 붉은색만 남는다
  layer(S, -1, (ctx, S) => dimFill(ctx, S, dawn ? '#0a0806' : '#07030a', 0.62 * u01(S.lt, 0, 0.3) * (1 - u01(S.lt, 2.45, 0.45))));
  // 핏빛 달 · 일식 · (여명) 해돋이 — 화면 위쪽 하늘 (캐릭터 뒤)
  layer(S, -0.9, (ctx, S) => {
    const lt = S.lt, c = S.cam;
    const rise = ease.outCubic(u01(lt, 0, 0.45)), fade = 1 - u01(lt, 2.45, 0.45);
    if (fade <= 0.01) return;
    const R = c.vh * 0.13, mx = c.x + c.vw * 0.5, my = c.y + c.vh * 0.22 + (1 - rise) * c.vh * 0.35;
    const ecl = u01(lt, 0.15, 0.3) * (S.back >= 0 ? 1 - u01(lt, S.back, 0.3) : 1);
    const sunK = dawn && S.burst >= 0 ? ease.outCubic(u01(lt, S.burst, 0.45)) : 0;
    const pulse = S.back >= 0 ? 1 + 0.5 * (1 - u01(lt, S.back + 0.1, 0.4)) * u01(lt, S.back, 0.1) : 1;
    glow(ctx, sunK > 0.5 ? '#ffd070' : '#ff1a2a', mx, my, R * (3.4 + sunK * 2.4), (0.5 - 0.3 * ecl + sunK * 0.4) * fade * rise * pulse);
    img(ctx, spr('moon'), mx, my, R / 104, R / 104, 0, fade * (1 - sunK), false);
    if (ecl > 0.001 && sunK < 1) {
      const ox = (1 - ease.inOutCubic(ecl)) * R * 2.3;
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = fade * (1 - sunK); ctx.fillStyle = '#050104';
      ctx.beginPath(); ctx.arc(mx + ox, my, R * 1.02, 0, TAU); ctx.fill();
      const cs = (R * 1.04) / 54 * (1 + 0.04 * Math.sin(lt * 9));
      img(ctx, spr('corona:red'), mx, my, cs, cs, lt * 0.2, ecl * fade * (1 - sunK) * (0.85 + 0.15 * Math.sin(lt * 13)), true);
    }
    if (sunK > 0) {
      const ss = (R * 1.3) / 60 * (1 + 0.25 * sunK);
      img(ctx, spr('sun'), mx, my, ss, ss, lt * 0.3, sunK * fade, true);
      glow(ctx, '#fff0b0', mx, my, R * 5 * sunK, 0.35 * sunK * fade);
    }
  });
  // 피의 날개 (아젤 뒤)
  layer(S, 9.6, (ctx, S) => {
    const u = S.lt - 0.3;
    if (u < 0) return;
    const open = ease.outBack(u01(u, 0, 0.28)), fade = u01(u, 0, 0.08) * (1 - u01(S.lt, 2.45, 0.4));
    if (fade <= 0.01) return;
    const rx = p.cx - f * 4, ry = p.bottom - p.h * 0.86, flap = Math.sin(S.lt * 5.5) * 0.08 * Math.min(1, open);
    for (const side of [-1, 1]) {
      let c, ax = 20 / 256, ay = 176 / 200;
      if (seraph) { c = kitSprite(side === f ? 'wing' : 'wingD'); ax = 22 / 256; ay = 178 / 200; }
      if (!c) c = spr(wingKey);
      ctx.save(); ctx.translate(rx + side * 6, ry); ctx.scale(side, 1); ctx.rotate(lerp(1.25, -0.15, open) + flap);
      img(ctx, c, 0, 0, 0.95, 0.95, 0, fade, false, ax, ay);
      ctx.restore();
    }
    glow(ctx, seraph ? '#e8d8ff' : RED, rx, ry, 70, 0.4 * fade);
  });

  at(S, 0, (S) => {
    sfx('bell', { pitch: 0.5, vol: 1 }); sfx('heartbeat', { vol: 0.8 });
    cine(S, p.cx, p.cy - 80, 0.94, 0.45);   // 하늘의 달을 올려다본다
  });
  at(S, 0.3, (S) => {   // 눈빛 · 피의 날개
    sfx('eye_glint'); sfx('bat', { vol: 0.8 }); sfx('dark', { pitch: 0.7, vol: 0.6 });
    cam.punchZoom?.(1.04, 0.15);
    const E = eyes();
    if (room(S, 1)) w.fx.ring(E.x, E.y, { color: RED, r0: 4, r1: 60, life: 0.25, width: 3 });
    emitN(S, 'bloodmist', p.cx, p.cy - 20, 6, { speed: 60 });
  });
  for (let i = 0; i < 9; i++) at(S, 0.5 + i * 0.112, (S) => crescent(S, i));
  at(S, 1.6, (S) => {   // 손가락 튕기기 '딱' — 0.2초 정지
    S.snap = S.lt;
    pose(S, 'cast_up', 0.55, { h0: 0.05, silent: true });
    sfx('finger_snap', { vol: 1 });
    const hx = p.cx + f * 22, hy = p.bottom - p.h * 1.05;
    S.snapAt = { x: hx, y: hy };
    try { w.fx.text(hx + f * 18, hy - 16, '딱', { color: '#ffd0d8', size: 22, life: 0.6, vy: -40 }); } catch { /* 글자 실패 무시 */ }
    if (room(S, 1)) w.fx.ring(hx, hy, { color: '#ffffff', r0: 4, r1: 70, life: 0.22, width: 3 });
    cine(S, p.cx + f * 10, p.cy - 30, 1.2, 0.08);
    w.hitstop = Math.max(w.hitstop || 0, 0.2);
  });
  at(S, 1.75, (S) => {   // 모든 초승달이 피의 비로 터진다 + 피의 흐름 (체력 20%)
    S.burst = S.lt;
    const list = foes(S, 30);
    trimFx(S, 0.5);
    strike(S, view(S, 40), wFinal, { element: EL, kb: [f * 260, -640] }, true);
    const heal = (S.v.data?.heal ?? 0.2) + (S.t2?.heal ?? 0);
    if (heal > 0) S.v.heal?.(heal);
    S.streams = makeStreams(S, list, RED, dawn ? '#8a5a10' : '#7a0012', 0.85);
    if (S.q === 'high') { try { FXKIT.grade?.(w, dawn ? '#ffd070' : '#7a0010', dawn ? 0.22 : 0.3, 0.8); } catch (err) { report(err, 'grade'); } }
    // 여명·타천사는 해돋이·흑백 날개를 이 감독이 처음부터 그리므로 키트 장식(달·날개)을 겹치지 않는다
    try { ULTFX.final?.(w, p.cx, p.cy - 10, { color: dawn ? '#fff0b0' : '#ff2a4a', accent: S.acc, tier: 2, classId: cls, charId: S.charId, flourish: S.tier >= 2 && !dawn && !seraph, targets: list, impactFg: dawn ? '#fff2b0' : '#ff2a4a', flashColor: dawn ? '#fff0c0' : '#ff2040' }); } catch (err) { report(err, 'ultfx.final'); }
    sfx('awaken_boom'); sfx('heartbeat', { pitch: 0.8 }); sfx('splash', { pitch: 0.6, vol: 0.7 });
    for (const c of S.cres) {   // 초승달마다 피의 비
      const r = 108 * c.sc, a = c.a0 + c.sweep;
      for (let i = room(S, 7); i > 0; i--) { const t = a + rand(-1.1, 1.1); w.fx.emit(dawn ? 'holy' : 'blood', c.x + Math.cos(t) * r, c.y + Math.sin(t) * r, { speed: rand(80, 260), color: dawn ? '#ffd070' : undefined }); }
    }
    if (S.bats && list.length) S.bats.forEach((b, i) => { b.tg = list[i % list.length]; });
    uncine(S, 0.4);
  });
  at(S, 2.2, (S) => { S.back = S.lt; sfx('bell', { pitch: 0.7, vol: 0.5 }); });

  const tick = (S) => {
    const lt = S.lt;
    for (const c of S.cres) {   // 휘두르는 동안 가장자리에서 핏방울
      const u = u01(lt, c.t, 0.1);
      if (u <= 0 || u >= 1) continue;
      const an = c.a0 + c.sweep * ease.outCubic(u), r = 108 * c.sc;
      for (let i = room(S, 3); i > 0; i--) {
        const t = an + rand(-0.9, 0.9), x = c.x + Math.cos(t) * r, y = c.y + Math.sin(t) * r, tx = -Math.sin(t) * Math.sign(c.sweep), ty = Math.cos(t) * Math.sign(c.sweep);
        S.w.fx.emit(dawn ? 'holy' : 'blood', x, y, { vx: tx * rand(260, 480), vy: ty * rand(260, 480) - 60, speed: 60, size: rand(2, 4) });
      }
    }
    if (S.bats && S.burst >= 0) for (const b of S.bats) if (b.tg && !b.hit && lt - S.burst > 0.28) { b.hit = true; if (!b.tg.dead) emitN(S, 'blood', b.tg.cx, b.tg.cy, 2, { speed: 200 }); }
  };
  const draw = (ctx, S) => {
    const lt = S.lt;
    // 눈빛
    if (lt > 0.28 && lt < 0.9) { const E = eyes(), a = u01(lt, 0.28, 0.06) * (1 - u01(lt, 0.6, 0.3)); glow(ctx, RED, E.x, E.y, 30, 0.9 * a); flare(ctx, E.x, E.y, 30, dawn ? '#fff0b0' : '#ff5060', a, lt * 2); }
    // 피의 왕관 (혈왕)
    if (crown && lt > 0.3) {
      // 마무리에서는 키트 장식(혈왕의 관 + 붉은 번개)이 이어받는다
      const c = kitSprite('crown'), a = u01(lt, 0.3, 0.2) * (S.burst >= 0 ? 1 - u01(lt, S.burst, 0.12) : 1), pul = 1 + 0.06 * Math.sin(lt * 9);
      const cx = p.cx, cy = p.bottom - p.h * 1.5 + Math.sin(lt * 3) * 3;
      glow(ctx, '#ff1a2a', cx, cy, 70 * pul, 0.55 * a);
      img(ctx, c, cx, cy, 0.42 * pul, 0.42 * pul, 0, a, false);
    }
    // 피의 초승달 (잔향 이중상 → 흉터 → 폭발)
    for (const c of S.cres) {
      const u = u01(lt, c.t, 0.1), eu = ease.outCubic(u), cs = spr(c.key);
      if (lt < c.t) continue;
      if (S.burst >= 0 && lt >= S.burst) {
        const bu = u01(lt, S.burst, 0.3);
        if (bu < 1) img(ctx, cs, c.x, c.y, c.sc * (1 + 0.4 * bu), c.sc * (1 + 0.4 * bu), c.a0 + c.sweep, 1 - bu, true);
        continue;
      }
      if (u < 1) {
        for (let k = 3; k >= 0; k--) {
          const au = Math.max(0, eu - k * 0.14);
          img(ctx, cs, c.x + k * 3, c.y + k * 2, c.sc, c.sc, c.a0 + c.sweep * au, k ? 0.42 / (k + 0.5) : 1, k ? true : c.add);
        }
      } else {
        const sa = 0.3 + 0.1 * Math.sin(lt * 17 + c.a0 * 5);
        img(ctx, cs, c.x, c.y, c.sc, c.sc, c.a0 + c.sweep, sa, true);
      }
    }
    // 손가락 튕기기 섬광
    if (S.snap >= 0 && S.snapAt) { const a = 1 - u01(lt, S.snap, 0.3); glow(ctx, '#ffffff', S.snapAt.x, S.snapAt.y, 50, 0.8 * a); flare(ctx, S.snapAt.x, S.snapAt.y, 40, '#ffffff', a, 0.3); }
    // 박쥐 떼 (노스페라투)
    if (S.bats) {
      const bat = kitSprite('bat'), V = view(S), cx = V.x + V.w / 2, cy = V.y + V.h * 0.45;
      const a = u01(lt, 0.4, 0.2) * (1 - u01(lt, 2.3, 0.3));
      if (bat && a > 0.01) for (const b of S.bats) {
        let x = cx + Math.cos(b.a0 + lt * b.w) * b.r * V.w, y = cy + Math.sin(b.a0 + lt * b.w) * b.r * V.h * 0.8;
        if (b.tg && S.burst >= 0) { const k = ease.inCubic(u01(lt, S.burst, 0.28)); x = lerp(x, b.tg.cx, k); y = lerp(y, b.tg.cy, k); if (b.hit) continue; }
        const fi = Math.floor(lt * 16 + b.ph) & 1;
        frame(ctx, bat, fi, 2, x, y, b.s * (b.w > 0 ? 1 : -1), b.s, 0, a, false);
      }
    }
    drawStreams(ctx, S, S.streams);
  };
  const light = (L, S) => {
    const c = S.cam, fade = 1 - u01(S.lt, 2.45, 0.45);
    lit(L, c.x + c.vw * 0.5, c.y + c.vh * 0.22, c.vw * 0.5, dawn && S.burst >= 0 ? '#ffd070' : '#ff2040', 1.1 * fade);
    lit(L, p.cx, p.cy, 200, RED, 0.9 * fade);
  };
  return run(S, { tick, draw, light });

  /** 피의 초승달 하나: 화면을 가로지르는 참격 (화면의 적 전원 1타) */
  function crescent(S, i) {
    const V = view(S);
    const c = {
      x: V.x + V.w * rand(0.24, 0.76), y: V.y + V.h * rand(0.28, 0.7), a0: rand(0, TAU), sweep: (i % 2 ? 1 : -1) * rand(1.4, 2.0),
      sc: rand(1.45, 2.0), key: cresKeys[i % cresKeys.length], t: S.lt, add: cresKeys[i % cresKeys.length] !== 'cres:dark',
    };
    S.cres.push(c);
    strike(S, view(S, 30), wCres(i), { hitId: `${S.id}:c${i}`, element: EL, hitstop: 0.02, kb: [Math.cos(c.a0 + c.sweep) * 120, -150], shake: 3 });
    sfx('slash_heavy', { pitch: rand(0.7, 0.9), vol: 0.7 });
    if (i % 3 === 0) sfx('slash', { pitch: 0.6, vol: 0.6 });
    S.cam.kick?.(Math.cos(c.a0) * 5, Math.sin(c.a0) * 4);
    if (i === 4) beat(S, c.x, c.y, 0.5, false);
  }
}

/** 영웅별 각성 감독 (awaken.js directorOf: 등록 → AWAKEN_DIRECTOR → AWAKEN_DIRECTOR_B → 대체 연출) */
export const AWAKEN_DIRECTOR_B = { bran, lia, azel };
/** 시험용: 캐시 스프라이트 이름('crow', 'cres:gold' …) → 구운 캔버스 (시각 검수) */
AWAKEN_DIR_B_DEBUG.sprite = (name) => spr(name);
