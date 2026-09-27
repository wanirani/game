// 각성기 연출 감독: 카엘 · 세라 · 빅터 (+ 2차 전직 '진 각성' 변형) — owner: AWAKEN-DIR-A
// feel.md §6.4 (카엘·세라·빅터 시간표), §6.1 (MV 정규화·보스 상한 30%·적 정지·무적), §5.2 (직업 장식 색), §8 (성능 예산)
//
// 계약 (src/game/awaken.js 머리말):
//  AWAKEN_DIRECTOR[charId] = (p, world, v) => 감독 엔티티. 컷인이 닫힌 뒤(t = 0) 시작하고, 엔티티가 죽으면 awaken.js 가
//  world.cutscene·freezeEnemies·hudHidden·레터박스를 되돌린다 (그동안 매 프레임 유지하는 것도 awaken.js).
//  모든 타격은 v.hit / v.final (tags ['awaken'], capFn = 보스 30% 상한, final → A 등급) — 가중치는 v.data.mvWeights 순서 그대로.
//  2차 전직 효과(v.t2): heal · lifesteal · dot · slow · elements · element(v.atk 가 자동) · chain · pierce · execute · shots · crows 등은
//  이 파일이 적용한다 (invuln·critDmg 는 awaken.js 가 적용).
//
// 모양
//  카엘  비질리아 — 여명의 처형식   8연 빛의 채찍(적을 꿰는 베지어 띠, 불타는 자국) → 십자 감옥으로 조여 적을 끌어모음 → 여명 → 빛의 십자가 대폭발
//        성전 기사: 방패 인장 + 체력 10% · 대심문관: 감옥이 불타 3초 화염 지속 피해 · 블러드 헌터: 핏빛 채찍 + 5% 흡혈 · 나이트 레이븐: 채찍 길을 따라 까마귀 떼
//  세라  천상의 문 — 세라핌 레퀴엠 60px 떠올라 여섯 날개 → 하늘 위 장미창(3겹 회전) + 카메라 들어올림 → 좌→우 심판의 기둥 7개(3연타) + 깃털 비
//        → 천상의 문에서 내리꽂히는 심판의 십자광.  성녀: 후광 + 체력 20% · 신탁의 무녀: 끝난 뒤 3초 적 0.5배속 ·
//        대마법사: 화염·냉기·번개 기둥 번갈아 · 폭풍의 소환사: 번개 기둥 + 적 사이를 잇는 연쇄 번개
//  빅터  실버 레퀴엠 — 여섯 발의 장송곡  세피아 + 반투명 여섯 약실 탄창 → 6발(조준 순간 정지·보스>정예>가까운 적·도탄 3회·표식) + 떨어지는 카드
//        → 권총 돌려 집어넣기 '찰칵' → 표식 동시 폭발(은빛 십자 충격파) → 연기를 불고 스페이드 에이스가 뒤집힌다.
//        팬텀: 모든 것을 꿰뚫는 유령탄 · 처형인: 25% 미만 일반 적 처형 · 헬파이어: 착탄마다 화염 폭발 · 건로드: 쌍권총 12발
//
// 성능 (feel §8): 각성 입자 상한 700/450/250 (다른 입자 포함, 8% 여유) · 프레임마다 그라디언트 0 (FXKIT·ULTFX 캐시 스프라이트와
//  이 파일이 스테이지 진입 때 한 번 굽는 스프라이트만) · 화면 전체 층: 암전(배경 뒤) 1 + 키트 층 1 + (high 에서만) 색조 1.
//  카엘의 여명은 암전 층 자체를 바꿔 그려 층 수를 늘리지 않는다.
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { game, TILE } from '../core/game.js';
import { isSolidType } from '../core/physics.js';
import { clamp, lerp, rand, TAU, ease, rgba, overlap } from '../core/math.js';
import { FXKIT } from './skills.js';
import { hitTarget } from './combat.js';
import { ULTFX } from '../render/ultfx.js';
import * as HFX from '../render/hitfx.js';

/** 시험·계측용 기록 (tools 에서 읽는다) */
export const AWAKEN_DIR_A_DEBUG = { runs: 0, errors: 0, last: null, prewarm: null, history: [] };

// ═══════════════════════════ 공용 도구 ═══════════════════════════
const AW_CAP = { high: 700, medium: 450, low: 250 };   // feel §8 각성 최대 입자 (다른 연출 입자 포함)
let SEQ = 0;
const nid = () => 'awA' + (++SEQ);
const hbOf = (e) => (e.hurtbox ? e.hurtbox() : e);
const inflate = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 });
const isBoss = (e, w) => e.kind === 'boss' || !!e.isBoss || e === w?.boss;
const maxHpOf = (e) => e.stats?.maxHp ?? e.maxHp ?? e.stats?.hp ?? e.hp ?? 1;
const alive = (e) => !!e && !e.dead && !(e.dying > 0);
function sfx(name, o) { try { audio.sfx(name, o); } catch { /* 소리 없음 */ } }
/** 4갈래 별 스프라이트 (hitfx 색별 캐시; 미리 굽기에서 만든다) */
function starOf(col) { try { return HFX.star?.(col) ?? null; } catch { return null; } }
function qKey(w) {
  let q = null;
  try { q = w?.qualityNow?.() ?? null; } catch { q = null; }
  q = q ?? game?.quality ?? game?.settings?.quality ?? 'high';
  return q === 'low' || q === 'medium' ? q : 'high';
}
function solid(w, x, y) { try { return isSolidType(w.map.typeAtPx(x, y)); } catch { return false; } }
function flashK() { const k = Number(game?.settings?.flashFx ?? 1); return Number.isFinite(k) ? clamp(k, 0, 1) : 1; }

/** 각성 입자 상한 안에서 뿌릴 수 있는 수 (n 은 high 기준, 품질 배율 적용) */
function room(D, n) {
  const fx = D.w.fx;
  if (!fx?.list) return 0;
  const cap = Math.min(AW_CAP[D.q] * 0.92, fx.max ?? 1400);
  return Math.max(0, Math.min(Math.round(n * D.fq), Math.floor(cap - fx.list.length)));
}
function burst(D, type, x, y, n, o) { const k = room(D, n); for (let i = 0; i < k; i++) D.w.fx.emit(type, x, y, o); return k; }
/** 흐름 방출 (프레임마다 부른다): rate = 초당 개수 (high 기준). key 마다 따로 누적 */
function drip(D, key, dt, rate, fn) {
  const A = (D.accs ??= {});
  A[key] = (A[key] ?? 0) + dt * rate * D.fq;
  let n = Math.floor(A[key]);
  A[key] -= n;
  n = Math.min(n, room(D, n));
  for (let i = 0; i < n; i++) fn(i);
}

/** 화면 안(기본 줌 기준) 적 */
function foesIn(w, rect) {
  const out = [];
  for (const e of w.enemies()) if (!e.invuln && overlap(rect, hbOf(e))) out.push(e);
  return out;
}
/** 가장 적이 몰린 곳 (보스 가중치): {x, y} | null */
function focusOf(w, list) {
  if (!list.length) return null;
  let best = null, bs = -1;
  for (const a of list) {
    let s = isBoss(a, w) ? 4 : a.elite ? 1.5 : 1;
    for (const b of list) if (b !== a && Math.hypot(a.cx - b.cx, a.cy - b.cy) < 240) s += isBoss(b, w) ? 2 : 1;
    if (s > bs) { bs = s; best = a; }
  }
  let sx = 0, sy = 0, n = 0;
  for (const b of list) {
    if (Math.hypot(best.cx - b.cx, best.cy - b.cy) >= 240 && b !== best) continue;
    const k = isBoss(b, w) ? 3 : 1;
    sx += b.cx * k; sy += b.cy * k; n += k;
  }
  return { x: sx / n, y: sy / n };
}
/** 우선순위: 보스 > 정예 > 가까운 적 */
function byPriority(w, p, list) {
  return list.slice().sort((a, b) => {
    const pa = isBoss(a, w) ? 0 : a.elite ? 1 : 2, pb = isBoss(b, w) ? 0 : b.elite ? 1 : 2;
    return pa - pb || Math.hypot(a.cx - p.cx, a.cy - p.cy) - Math.hypot(b.cx - p.cx, b.cy - p.cy);
  });
}
/** 연출 도중 영웅이 방 가장자리 출구를 넘지 않게 (skills.js keepInRoom 과 같은 규칙) */
function keepInRoom(w, p) {
  const m = w.map;
  if (!m || !(m.pxW > 0) || !(m.pxH > 0)) return;
  const maxX = m.pxW - p.w, maxY = m.pxH - p.h;
  if (p.x < 0) { p.x = 0; if (p.vx < 0) p.vx = 0; } else if (p.x > maxX) { p.x = maxX; if (p.vx > 0) p.vx = 0; }
  if (p.y < 0) { p.y = 0; if (p.vy < 0) p.vy = 0; } else if (p.y > maxY) { p.y = maxY; if (p.vy > 0) p.vy = 0; }
}
/** 시전 자세 (가짜 동작으로 렌더러 자세를 잡는다; 판정·휘두르는 소리 없음). h0..h1 에 휘두르고 이후 제자리로 */
function stance(p, w, anim, dur, h0 = 0.04, h1 = null) {
  try {
    p.startMove?.(w, { id: 'awA_' + anim, anim, dur, hit: [h0, h1 ?? h0 + 0.06], box: null, skill: true, sfx: 'magic', cancel: dur, mv: 0, awaken: true });
    p.moveHitDone = true;
  } catch (e) { console.error('[awaken-dir-a] 자세', e); }
}
function fail(D, err) {
  AWAKEN_DIR_A_DEBUG.errors++;
  if (D) { D.err = (D.err ?? 0) + 1; if (D.err > 3) return; }
  console.error('[awaken-dir-a]', err);
}

// ── 그리기 도구 (그라디언트 없음: 캐시 스프라이트·선·다각형만) ──
function lineGlow(ctx, a, col, core, wd) {
  if (!(a > 0.01)) return;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = col;
  ctx.globalAlpha = Math.min(1, 0.16 * a); ctx.lineWidth = wd * 3; ctx.stroke();
  ctx.globalAlpha = Math.min(1, 0.62 * a); ctx.lineWidth = wd; ctx.stroke();
  ctx.strokeStyle = core; ctx.globalAlpha = Math.min(1, a); ctx.lineWidth = Math.max(1.5, wd * 0.32); ctx.stroke();
  ctx.globalAlpha = 1;
}
function rays(ctx, x, y, n, r0, r1, rot, col, a, wd = 0.05) {
  if (!(a > 0.01)) return;
  ctx.globalAlpha = Math.min(1, a); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const an = rot + i * TAU / n;
    ctx.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0);
    ctx.lineTo(x + Math.cos(an - wd) * r1, y + Math.sin(an - wd) * r1);
    ctx.lineTo(x + Math.cos(an + wd) * r1, y + Math.sin(an + wd) * r1);
    ctx.closePath();
  }
  ctx.fill();
  ctx.globalAlpha = 1;
}
/** 꼬리가 뾰족한 빛줄기 (x0,y0 꼬리 → x1,y1 머리) */
function taper(ctx, x0, y0, x1, y1, wd, col, a) {
  if (!(a > 0.01)) return;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy * wd / 2, ny = ux * wd / 2;
  ctx.globalAlpha = Math.min(1, a); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 + nx, y1 + ny); ctx.lineTo(x1 + ux * wd * 0.7, y1 + uy * wd * 0.7); ctx.lineTo(x1 - nx, y1 - ny); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
}
/** 이미지를 기준점(ax, ay)에 맞춰 회전·배율로 */
function blitAt(ctx, img, x, y, s, rot, a, add, ax = 0.5, ay = 0.5, sy = s) {
  if (!img || !(a > 0.01)) return;
  ctx.globalAlpha = Math.min(1, a); ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(s, sy);
  ctx.drawImage(img, -img.width * ax, -img.height * ay);
  ctx.restore();
  ctx.globalAlpha = 1;
}
/** 번개 경로 (평평한 배열) */
function boltPts(x0, y0, x1, y1, n = 8, jag = 22) {
  const P = [x0, y0], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 1; i < n; i++) { const u = i / n, j = rand(-jag, jag) * Math.sin(u * Math.PI); P.push(x0 + dx * u + nx * j, y0 + dy * u + ny * j); }
  P.push(x1, y1);
  return P;
}
function pathPts(ctx, P) { ctx.beginPath(); ctx.moveTo(P[0], P[1]); for (let i = 2; i < P.length; i += 2) ctx.lineTo(P[i], P[i + 1]); }
/** 2차 베지어 */
const bzx = (L, u) => (1 - u) * (1 - u) * L.x0 + 2 * (1 - u) * u * L.cx + u * u * L.x1;
const bzy = (L, u) => (1 - u) * (1 - u) * L.y0 + 2 * (1 - u) * u * L.cy + u * u * L.y1;
/** 베지어의 [0, u] 부분 경로 (드 카스텔조) */
function pathBz(ctx, L, u = 1) {
  ctx.beginPath(); ctx.moveTo(L.x0, L.y0);
  if (u >= 0.999) { ctx.quadraticCurveTo(L.cx, L.cy, L.x1, L.y1); return; }
  ctx.quadraticCurveTo(lerp(L.x0, L.cx, u), lerp(L.y0, L.cy, u), bzx(L, u), bzy(L, u));
}

// ═══════════════════════════ 미리 굽기 (스테이지 진입 때, 한가할 때) ═══════════════════════════
// 시전 도중 캔버스·그라디언트를 만들지 않도록 (feel §8) 이 감독들이 쓰는 색의 빛·기둥 스프라이트와 전용 스프라이트를 미리 만든다.
const PREP = { key: null, scratch: null, dawn: null, cyl: null };
const COLS = {
  kael: ['#fff2b0', '#ffd870', '#fff8e0', '#ffffff', '#8a1426', '#ff8a2a', '#ffe0a0', '#ff2040', '#ffb0b8', '#8a8aff', '#e8e8ff', '#ffb060', '#ff5a6a', '#c8c8ff'],
  sera: ['#fff8d0', '#fff2b0', '#ffe7a0', '#ffffff', '#c8a24a', '#d8f0ff', '#8ac8ff', '#ff7a2a', '#9fe8ff', '#fff2a0', '#bfe0ff', '#e0f0ff', '#ffd0a0'],
  victor: ['#ffd070', '#fff0b0', '#ffe0a0', '#ffffff', '#e8ecff', '#c8d4ff', '#9ab0ff', '#ff2030', '#ff8a90', '#ff7a2a', '#ffb060', '#ffd84a', '#fff0a0'],
};
function mkCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}
/** 카엘: 암전(위 절반) → 여명(아래 절반) 한 장. 위로 밀어 올리면 여명이 아래에서 솟는다 */
function bakeDawn() {
  const c = mkCanvas(8, 512);
  if (!c) return null;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, 'rgba(42,10,14,0.62)'); gr.addColorStop(0.5, 'rgba(42,10,14,0.62)');
  gr.addColorStop(0.6, 'rgba(90,26,16,0.5)'); gr.addColorStop(0.76, 'rgba(255,138,58,0.3)');
  gr.addColorStop(0.9, 'rgba(255,216,112,0.4)'); gr.addColorStop(1, 'rgba(255,242,192,0.55)');
  g.fillStyle = gr; g.fillRect(0, 0, 8, 512);
  return c;
}
/** 빅터: 여섯 약실 탄창 (256²) */
function bakeCylinder() {
  const S = 256, c = mkCanvas(S, S);
  if (!c) return null;
  const g = c.getContext('2d'), R = S / 2;
  g.translate(R, R);
  const body = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 0.95);
  body.addColorStop(0, '#9a9aaa'); body.addColorStop(0.55, '#4a4a58'); body.addColorStop(1, '#16161e');
  g.fillStyle = body; g.beginPath(); g.arc(0, 0, R * 0.94, 0, TAU); g.fill();
  g.strokeStyle = '#d8d8e8'; g.lineWidth = 3; g.stroke();
  g.strokeStyle = 'rgba(200,160,64,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, R * 0.86, 0, TAU); g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * TAU / 6, af = a + TAU / 12;
    // 홈 (약실 사이)
    g.save(); g.rotate(af); g.fillStyle = 'rgba(10,10,16,0.75)';
    g.beginPath(); g.ellipse(R * 0.8, 0, R * 0.12, R * 0.05, 0, 0, TAU); g.fill(); g.restore();
    // 약실
    const x = Math.cos(a) * R * 0.54, y = Math.sin(a) * R * 0.54;
    g.fillStyle = '#050508'; g.beginPath(); g.arc(x, y, R * 0.19, 0, TAU); g.fill();
    g.strokeStyle = '#8a8a9a'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, R * 0.16, -2.4, -0.8); g.stroke();
  }
  g.fillStyle = '#b0b0c0'; g.beginPath(); g.arc(0, 0, R * 0.12, 0, TAU); g.fill();
  g.strokeStyle = '#2a2a34'; g.lineWidth = 2; g.stroke();
  return c;
}
function prewarm(w, p) {
  try {
    const ch = p?.hero?.charId;
    if (!ch || !COLS[ch] || !w) return false;
    const K = FXKIT;
    if (!K?.glow || !K.beamV) return false;
    const key = `${ch}|${p.hero.classId}`;
    if (PREP.key === key) return true;
    if (!PREP.scratch) PREP.scratch = mkCanvas(4, 4);
    const sc = PREP.scratch?.getContext('2d');
    if (!sc) return false;
    for (const c of COLS[ch]) {
      K.glow(sc, 1, 1, 2, c, 1);
      K.beamV(sc, 1, 0, 2, 1, c, 1); K.beamV(sc, 1, 0, 2, 1, c, 1, c);
      K.beamH(sc, 0, 2, 1, 1, c, 1);
    }
    K.beamV(sc, 1, 0, 2, 1, '#ffffff', 1, '#ffffff'); K.beamH(sc, 0, 2, 1, 1, '#ffffff', 1, '#ffffff');
    if (ch === 'kael') { if (!PREP.dawn) PREP.dawn = bakeDawn(); ULTFX.sprite?.('crow'); }
    if (ch === 'sera') { K.glassRose?.(sc, 1, 1, 1, 0, 1, 1); ULTFX.sprite?.('wing'); ULTFX.sprite?.('clock'); }
    if (ch === 'victor') {
      if (!PREP.cyl) PREP.cyl = bakeCylinder();
      ULTFX.sprite?.('muzzle'); ULTFX.sprite?.('skullx');
      for (const c of ['#fff0b0', '#c8d4ff', '#ffb060']) starOf(c);
      for (const [r, s] of [['A', '♠'], ['8', '♣'], ['A', '♣'], ['8', '♠']]) { sc.save(); K.cardShape?.(sc, 38, 54, r, s, 1); sc.restore(); }
    }
    for (const c of ['#ffffff', ...COLS[ch].slice(0, 4)]) ULTFX.glow?.(c);
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.globalAlpha = 1; sc.globalCompositeOperation = 'source-over'; sc.clearRect(0, 0, 4, 4);
    PREP.key = key;
    AWAKEN_DIR_A_DEBUG.prewarm = key;
    return true;
  } catch (e) { console.warn('[awaken-dir-a] 미리 굽기', e); return false; }
}
function idle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout: 800 });
  else setTimeout(fn, 60);
}
function schedulePrewarm() { setTimeout(() => idle(() => { const w = game?.world; if (w?.player) prewarm(w, w.player); }), 350); }
// 부팅 뒤에 버스를 건다 (모듈 최상위에서는 가져온 값에 손대지 않는다: 순환 import 규칙)
if (typeof window !== 'undefined' && typeof setTimeout === 'function') {
  setTimeout(() => {
    try {
      bus.on('stageEntered', schedulePrewarm);
      bus.on('roomEntered', () => {
        for (const L of [...LIVE]) L.check();   // 방이 바뀌어 감독 엔티티가 end 없이 버려졌으면 뒷정리
        const p = game?.world?.player; if (p?.hero && PREP.key !== `${p.hero.charId}|${p.hero.classId}`) schedulePrewarm();
      });
      bus.on('classChanged', () => { PREP.key = null; schedulePrewarm(); });
    } catch (e) { console.warn('[awaken-dir-a] bus', e); }
    schedulePrewarm();
  }, 1300);
}

// ═══════════════════════════ 감독 문맥 · 타격 · 틀 ═══════════════════════════
/** 진행 중인 감독 (방 이동으로 엔티티가 버려졌을 때 roomEntered 에서 뒷정리하려고) */
const LIVE = new Set();
function mkCtx(p, w, v, name) {
  const K = FXKIT;
  const W0 = Array.isArray(v?.data?.mvWeights) ? v.data.mvWeights : [];
  const D = {
    name, p, w, v, K, cam: w.camera, q: qKey(w), fq: clamp(Number(w.fx?.quality) || 1, 0.3, 1),
    t2: v.tier >= 2 ? (v.t2 ?? null) : null, T2c: v.tier >= 2 ? v.classId : null,
    col: v.color, acc: v.accent, dark: v.dark ?? '#05020a', W: W0,
    hits: 0, finals: 0, dealt: 0, healed: 0, wUsed: 0, ls: v.tier >= 2 ? (v.t2?.lifesteal ?? 0) : 0,
    cine: false, err: 0, info: {},
  };
  AWAKEN_DIR_A_DEBUG.runs++;
  AWAKEN_DIR_A_DEBUG.last = { charId: v.charId, classId: v.classId, tier: v.tier, dir: name, hits: 0, finals: 0, done: false, info: D.info };
  return D;
}
function hpSnap(w) { const L = []; for (const e of w.enemies()) L.push(e, e.hp ?? 0); return L; }
/** 흡혈 (블러드 헌터): 이번 타격으로 줄어든 적 체력 합 × 비율 */
function lifesteal(D, snap) {
  let d = 0;
  for (let i = 0; i < snap.length; i += 2) { const e = snap[i]; d += Math.max(0, snap[i + 1] - Math.max(0, e.hp ?? 0)); }
  if (d > 0 && !D.p.dead) { D.dealt += d; D.healed += D.p.heal?.(d * D.ls, false) ?? 0; }
}
/** 각성 타격 (v.hit): 가중치 wgt, 사각형 rect (월드). 흡혈 계산 포함. 반환 맞힌 수 */
function strike(D, rect, wgt, o = {}) {
  const snap = D.ls > 0 ? hpSnap(D.w) : null;
  let n = 0;
  try { n = D.v.hit(rect, wgt, o) || 0; } catch (e) { fail(D, e); }
  D.hits += n; D.wUsed += wgt;
  if (snap && n) lifesteal(D, snap);
  return n;
}
/** 마무리 일격 (v.final: A 등급·띄우기) */
function strikeFinal(D, rect, wgt, o = {}) {
  const snap = D.ls > 0 ? hpSnap(D.w) : null;
  let n = 0;
  try { n = D.v.final(rect, wgt, o) || 0; } catch (e) { fail(D, e); }
  D.hits += n; D.finals++; D.wUsed += wgt;
  if (snap && n) lifesteal(D, snap);
  return n;
}
/** 기본 줌 기준 화면 (연출 줌과 무관) */
const viewOf = (D, pad = 0) => D.K.ultView(D.w, pad);

/**
 * 감독 틀: 배경 뒤 암전(z -1) + 영웅 뒤 층(z 9.6) + 앞 층(z 12, 반환) + 화면 층(선택).
 * o = { dur, steps: [[t, fn(w, e)]], back(ctx, e), rear(ctx, e), draw(ctx, e), screen(ctx, vw, vh, e), tick(e, w, dt), light(L, e), end(e, w), kit }
 */
function director(D, o) {
  const { w, p, K, cam, v } = D;
  const steps = o.steps.slice().sort((a, b) => a[0] - b[0]);
  const bound = (e) => { e.x = cam.x - 80; e.y = cam.y - 80; e.w = cam.vw + 160; e.h = cam.vh + 160; };
  prewarm(w, p);
  try {
    ULTFX.begin(w, p, { color: D.col, accent: D.acc, tier: 2, classId: v.classId, charId: v.charId, dimCol: D.dark, awaken: true, name: false, dur: o.dur, maxDur: o.dur + 5, ...(o.kit || {}) });
  } catch (e) { fail(D, e); }
  const back = K.fx(w, {
    life: o.dur, z: -1, follow: bound,
    draw(ctx, e) {
      try {
        if (o.back) o.back(ctx, e);
        else { const a = 0.62 * Math.min(1, e.lt / 0.2) * clamp((e.life - e.lt) / 0.35, 0, 1); ctx.fillStyle = rgba(D.dark, a); ctx.fillRect(e.x, e.y, e.w, e.h); }
      } catch (err) { fail(D, err); }
    },
  });
  const rear = o.rear ? K.fx(w, { life: o.dur, z: 9.6, follow: bound, draw(ctx, e) { try { o.rear(ctx, e); } catch (err) { fail(D, err); } } }) : null;
  let ended = false;
  const live = { check() { if (!w.entities.includes(ent) || game?.world !== w) finish(ent, w); } };
  const finish = (e, ww) => {
    if (ended) return;
    ended = true;
    LIVE.delete(live);
    back.dead = true; if (rear) rear.dead = true;
    try { o.end?.(e, ww); } catch (err) { fail(D, err); }
    if (D.cine) { try { cam.cineEnd?.(0.4); } catch { /* 카메라 없음 */ } D.cine = false; }
    const L = AWAKEN_DIR_A_DEBUG.last;
    if (L && L.info === D.info) { L.hits = D.hits; L.finals = D.finals; L.dealt = Math.round(D.dealt); L.healed = Math.round(D.healed); L.wUsed = +D.wUsed.toFixed(2); L.done = true; L.errors = D.err; }
    AWAKEN_DIR_A_DEBUG.history.push({ ...L, info: { ...D.info } });
    if (AWAKEN_DIR_A_DEBUG.history.length > 24) AWAKEN_DIR_A_DEBUG.history.shift();
  };
  const ent = K.fx(w, {
    life: o.dur, z: 12, d: { i: 0 }, follow: bound,
    tick(e, ww, dt) {
      D.info.lt = e.lt;
      while (e.d.i < steps.length && steps[e.d.i][0] <= e.lt) { const s = steps[e.d.i++]; try { s[1](ww, e); } catch (err) { fail(D, err); } }
      try { o.tick?.(e, ww, dt); } catch (err) { fail(D, err); }
      keepInRoom(ww, p);
    },
    draw(ctx, e) { try { o.draw?.(ctx, e); } catch (err) { fail(D, err); } },
    light(L, e) { try { o.light?.(L, e); } catch { /* 조명 실패는 무시 */ } },
    end(e, ww) { finish(e, ww); },
  });
  // 방이 바뀌며 엔티티가 end 없이 버려지거나 awaken.js 가 먼저 끝내도 뒷정리는 한 번 (월드 층은 loadRoom 이 비운다 → roomEntered 에서 LIVE 로)
  LIVE.add(live);
  const watch = w.addOverlay?.({ draw() {}, update() { if (ended) { this.dead = true; return; } if (!w.entities.includes(ent)) { this.dead = true; finish(ent, w); } } });
  void watch;
  if (o.screen) K.holdOverlay(w, ent, function (ctx, vw, vh) { try { o.screen(ctx, vw, vh, ent); } catch (err) { fail(D, err); } });
  return ent;
}

/** 대심문관: 불타는 감옥 — dot {element, t, mv} 동안 0.5초마다 화염 피해 (각성이 끝난 뒤에도 이어진다) */
function burnFoes(D, list, dot) {
  const { w, K } = D;
  const T = Math.max(0.5, dot?.t ?? 3), every = 0.5, ticks = Math.round(T / every);
  const tg = list.filter(alive);
  if (!tg.length) return null;
  let acc = 0, k = 0;
  D.info.dotTargets = tg.length; D.info.dotTicks = 0;
  return K.fx(w, {
    life: T + 0.15, z: 11,
    follow(e) { const c = w.camera; e.x = c.x - 60; e.y = c.y - 60; e.w = c.vw + 120; e.h = c.vh + 120; },
    tick(e, ww, dt) {
      acc += dt;
      if (Math.random() < 0.6) for (const f of tg) if (alive(f) && room(D, 1)) { const hb = hbOf(f); ww.fx.emit('fire', hb.x + rand(0, hb.w), hb.y + hb.h * rand(0.3, 1), { angle: -Math.PI / 2, spread: 0.5, speed: 90, size: rand(8, 13) }); }
      while (acc >= every && k < ticks) {
        acc -= every; k++;
        const sp0 = ww.run?.sp ?? 0, aw0 = ww.run?.aw ?? 0, after = !ww.cutscene;
        for (const f of tg) {
          if (!alive(f)) continue;
          strike(D, inflate(hbOf(f), 2), 0, { mv: dot?.mv ?? 0.15, element: dot?.element ?? 'fire', hitstop: 0, shake: 0, kb: [0, -30], fx: 'fire', hitId: nid(), dmgColor: '#ff9a3a' });
          burst(D, 'fire', f.cx, f.cy, 5, { speed: 160 });
        }
        if (after && ww.run) { ww.run.sp = sp0; ww.run.aw = aw0; }   // 각성 타격은 게이지를 다시 채우지 않는다 (끝난 뒤의 지속 피해 포함)
        D.info.dotTicks = k;
        if (k === 1) sfx('holywater_burn', { vol: 0.6 });
      }
    },
    draw(ctx, e) {
      const fade = clamp((e.life - e.lt) / 0.3, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      for (const f of tg) { if (!alive(f)) continue; const hb = hbOf(f); K.glow(ctx, f.cx, hb.y + hb.h * 0.7, Math.max(hb.w, 40) * 0.9, '#ff8a2a', 0.45 * fade * (0.85 + 0.15 * Math.sin(e.lt * 30 + f.cx))); }
    },
    light(L) { for (const f of tg) if (alive(f)) L.add(f.cx, f.cy, 110, '#ff8a2a', 0.8); },
  });
}

/** 신탁의 무녀: 각성이 끝난 뒤 T초 동안 적이 mul 배속으로 움직인다 (적 update 의 dt 를 줄여 감싼다, 끝나면 되돌림) */
function slowFoes(D, list, slow) {
  const { w, K, p } = D;
  const mul = clamp(slow?.mul ?? 0.5, 0.1, 1), T = Math.max(0.5, slow?.t ?? 3);
  const tg = list.filter(alive);
  if (!tg.length) return null;
  const S = { on: false, left: T, wraps: [] };
  const apply = () => {
    for (const e of tg) {
      if (!alive(e) || e.__awSlow) continue;
      const own = Object.prototype.hasOwnProperty.call(e, 'update') ? e.update : null;
      const base = e.update;
      if (typeof base !== 'function') continue;
      const rec = { e, own, fn: null };
      rec.fn = function (dt, world) { return base.call(this, dt * mul, world); };
      e.update = rec.fn; e.__awSlow = rec;
      S.wraps.push(rec);
    }
    D.info.slowed = S.wraps.length;
  };
  const restore = () => {
    for (const r of S.wraps) {
      const e = r.e;
      if (e.update === r.fn) { if (r.own) e.update = r.own; else delete e.update; }
      if (e.__awSlow === r) delete e.__awSlow;
    }
    S.wraps.length = 0;
  };
  const clock = ULTFX.sprite?.('clock');
  return K.fx(w, {
    life: 14, z: 11,
    follow(e) { const c = w.camera; e.x = c.x - 60; e.y = c.y - 60; e.w = c.vw + 120; e.h = c.vh + 120; },
    tick(e, ww, dt) {
      if (!S.on) {
        if (ww.cutscene) return;   // 각성 연출이 끝나면 시작
        S.on = true; apply();
        if (S.wraps.length) {
          sfx('clock_tick', { pitch: 0.7 }); sfx('stopwatch', { vol: 0.5, pitch: 0.8 });
          ww.fx.callout?.(p.cx, p.y - 36, '시간 둔화', { color: '#8ac8ff', size: 16 });
        }
      }
      S.left -= dt;
      if (S.left <= 0 || !S.wraps.length) { restore(); e.dead = true; }
    },
    end() { restore(); },
    draw(ctx) {
      if (!S.on) return;
      const k = clamp(S.left / 0.4, 0, 1);
      for (const r of S.wraps) {
        const f = r.e;
        if (!alive(f)) continue;
        const hb = hbOf(f), x = f.cx, y = hb.y - 18;
        K.glow(ctx, f.cx, f.cy, Math.max(hb.w, hb.h) * 0.8, '#8ac8ff', 0.25 * k);
        if (clock) blitAt(ctx, clock, x, y, 0.16, S.left * 0.6, 0.9 * k, true);
      }
    },
  });
}

// ═══════════════════════════ 카엘 — 비질리아 — 여명의 처형식 ═══════════════════════════
function kaelDirector(p, w, v) {
  const D = mkCtx(p, w, v, 'kael');
  const { K, cam } = D;
  const vr = D.T2c?.slice(5) ?? null;   // templar | inquisitor | bloodhunter | nightraven
  const LASH = vr === 'bloodhunter' ? ['#ff2040', '#ffd0d8'] : vr === 'nightraven' ? ['#8a8aff', '#f0f0ff'] : vr === 'inquisitor' ? ['#ff8a2a', '#ffe8b0'] : ['#ffd870', '#fff8e0'];
  const GOLD = '#ffd870';
  const W = D.W.length >= 2 ? D.W : [0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 6.0];
  const nL = W.length - 1, T_L0 = 0.2, T_L1 = 1.1, T_CAGE = 1.1, T_TIGHT = 1.4, T_DAWN = 1.5, T_FIN = 1.7, DUR = 2.75;
  const lashes = [];
  const crows = [];
  const S = { cage: null, fin: null, dawn: -1, caged: [], rain: 0 };
  const crowImg = vr === 'nightraven' ? ULTFX.sprite?.('crow') : null;
  D.info.lashes = 0; D.info.lashHits = 0;
  const hand = () => ({ x: p.cx + p.facing * 30, y: p.bottom - 62 });

  function makeLash(i) {
    const V = viewOf(D), x0 = V.x - 90, x1 = V.x + V.w + 90;
    const dir = i % 2 ? -1 : 1;
    const yA = V.y + V.h * rand(0.04, 0.28), yB = V.y + V.h * rand(0.72, 0.97);
    const y0 = dir > 0 ? yA : yB, y1 = dir > 0 ? yB : yA;
    const list = byPriority(w, p, foesIn(w, viewOf(D, 20)));
    const tg = list.length ? list[i % list.length] : null;
    let cy = (y0 + y1) / 2 + rand(-0.22, 0.22) * V.h;
    if (tg) {
      const u = clamp((tg.cx - x0) / (x1 - x0), 0.14, 0.86), ty = tg.cy + rand(-12, 12);
      cy = (ty - (1 - u) * (1 - u) * y0 - u * u * y1) / (2 * (1 - u) * u);
    }
    cy = clamp(cy, V.y - V.h * 0.5, V.y + V.h * 1.5);
    // 채찍은 카엘 쪽 끝에서 반대쪽으로 갈라져 나간다
    const fromLeft = p.cx < V.x + V.w / 2;
    const L = fromLeft ? { x0, y0, cx: (x0 + x1) / 2, cy, x1, y1 } : { x0: x1, y0: y1, cx: (x0 + x1) / 2, cy, x1: x0, y1: y0 };
    L.i = i; L.t0 = null; L.hit = false; L.seed = rand(0, TAU); L.o = { ...L };
    return L;
  }
  /** 이 채찍이 가로지르는 적 (띠 두께 34px + 판정 상자) */
  function lashFoes(L) {
    const out = [];
    for (const e of foesIn(w, viewOf(D, 120))) {
      const hb = inflate(hbOf(e), 34);
      for (let k = 0; k <= 28; k++) {
        const u = k / 28, x = bzx(L, u), y = bzy(L, u);
        if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) { out.push(e); break; }
      }
    }
    return out;
  }
  function lash(i, ww, e) {
    const L = makeLash(i);
    L.t0 = e.lt;
    lashes.push(L);
    D.info.lashes++;
    const anims = ['lash', 'lash_up', 'lash_down', 'spin'];
    const mid = { x: bzx(L, 0.5), y: bzy(L, 0.5) };
    if (Math.abs(mid.x - p.cx) > 30) p.facing = mid.x > p.cx ? 1 : -1;
    stance(p, ww, anims[i % 4], 0.16, 0.02, 0.08);
    sfx('whip_crack', { pitch: 0.82 + i * 0.035, vol: 0.85 });
    if (vr === 'inquisitor' && i % 2 === 0) sfx('fire', { vol: 0.5, pitch: 0.8 });
    if (vr === 'nightraven' && i % 3 === 0) sfx('crow_caw', { vol: 0.6, pitch: rand(0.9, 1.2) });
    if (vr === 'bloodhunter') sfx('slash', { vol: 0.45, pitch: 0.8 });
    // 판정: 띠가 가로지르는 적마다 가중치 W[i] (같은 hitId → 한 채찍에 한 번)
    const tg = lashFoes(L), hid = nid();
    let n = 0;
    for (const f of tg) n += strike(D, inflate(hbOf(f), 4), 0, { mv: D.v.mv(W[i]), hitId: hid, hitstop: n ? 0 : 0.03, shake: 2, kb: [70 * (L.x1 > L.x0 ? 1 : -1), -160], fx: 'slash' });
    D.wUsed += W[i]; D.info.lashHits += n;
    const hp = tg[0] ? { x: tg[0].cx, y: tg[0].cy } : mid;
    try { ULTFX.beat(ww, hp.x, hp.y, { power: 0.38, color: LASH[0], accent: D.acc }); } catch (err) { fail(D, err); }
    cam.kick?.(rand(-3, 3), rand(-3, 3));
    try { ULTFX.afterimage(ww, p, LASH[0], { life: 0.3 }); } catch { /* 잔상 생략 */ }
    for (const f of tg) {
      if (vr === 'bloodhunter') burst(D, 'blood', f.cx, f.cy, 10, { speed: 320 });
      else burst(D, vr === 'inquisitor' ? 'fire' : 'holy', f.cx, f.cy, 6, { speed: 260 });
    }
    // 까마귀 떼가 채찍 길을 따라 날아간다 (나이트 레이븐)
    if (crowImg) for (let k = 0; k < 3; k++) crows.push({ L, t0: e.lt + k * 0.06, sp: rand(1.3, 1.7), s: rand(0.75, 1.1), off: rand(-26, 26), ph: rand(0, 6) });
  }
  function cage(ww, e) {
    const list = foesIn(w, viewOf(D, 20));
    const V = viewOf(D);
    const f = focusOf(w, list) ?? { x: p.cx + p.facing * 220, y: p.cy - 30 };
    const C = { x: clamp(f.x, V.x + 190, V.x + V.w - 190), y: clamp(f.y, V.y + 170, V.y + V.h - 130) };
    S.cage = { C, t0: e.lt };
    // 십자 감옥: 세로 막대 4 (긴 띠) + 가로 막대 4 (짧은 띠) → 빛의 막대로 된 십자가
    const VX = [-45, -15, 15, 45];
    lashes.forEach((L, i) => {
      const k = Math.floor(i / 2) % 4;
      const tgt = i % 2 === 0 ? { x0: C.x + VX[k], y0: C.y - 200, x1: C.x + VX[k], y1: C.y + 200 } : { x0: C.x - 160, y0: C.y + VX[k], x1: C.x + 160, y1: C.y + VX[k] };
      tgt.cx = (tgt.x0 + tgt.x1) / 2; tgt.cy = (tgt.y0 + tgt.y1) / 2;
      L.cage = tgt;
    });
    S.caged = list.filter((q) => Math.abs(q.cx - C.x) < 420 && Math.abs(q.cy - C.y) < 300);
    sfx('holy', { pitch: 0.6 }); sfx('whip_crack', { pitch: 0.6, vol: 0.9 });
    D.cine = true;
    try { cam.cine?.((p.cx + C.x) / 2, (p.cy + C.y) / 2 - 10, (cam.baseZoom || 1) * 1.04, 0.35); } catch { D.cine = false; }
    ww.fx.ring(C.x, C.y, { color: LASH[0], r0: 300, r1: 60, life: 0.3, width: 8 });
    D.info.cage = S.caged.length;
  }
  function pull(ww, dt) {
    const C = S.cage?.C;
    if (!C) return;
    const sp = 300 * dt;
    for (const e of S.caged) {
      if (!alive(e) || isBoss(e, ww) || e.kind !== 'enemy' || e.def?.fixed || e.wclass === 'FIXED' || (e.def?.kbResist ?? 0) >= 1) continue;
      const dx = C.x - e.cx, dy = C.y - e.cy;
      if (Math.abs(dx) > 14) { const mx = clamp(dx, -sp, sp); if (!solid(ww, e.cx + mx + Math.sign(mx) * e.w * 0.5, e.cy)) e.x += mx; }
      if (e.noGravity && Math.abs(dy) > 14) { const my = clamp(dy, -sp, sp); if (!solid(ww, e.cx, e.cy + my + Math.sign(my) * e.h * 0.5)) e.y += my; }
    }
  }
  function final(ww, e) {
    const C = S.cage?.C ?? { x: p.cx + p.facing * 200, y: p.cy - 40 };
    S.fin = { C, t0: e.lt };
    if (Math.abs(C.x - p.cx) > 20) p.facing = C.x > p.cx ? 1 : -1;
    stance(p, ww, 'launch', 0.7, 0.03, 0.12);
    const targets = foesIn(ww, viewOf(D, 40));
    D.info.hpFin = Math.round(p.hp);
    strikeFinal(D, viewOf(D, 40), W[nL], { element: vr === 'inquisitor' ? 'fire' : 'holy', kb: [380, -640] });
    try { ULTFX.final(ww, C.x, C.y, { color: D.col, accent: D.acc, tier: 2, classId: D.T2c ?? v.classId, targets, flashColor: '#fff8e0' }); } catch (err) { fail(D, err); }
    sfx('awaken_boom'); sfx('holy', { pitch: 0.5 }); sfx('bell', { pitch: 0.7, vol: 0.7 });
    cam.punchZoom?.(1.1, 0.3); cam.addTrauma?.(0.7);
    burst(D, 'holy', C.x, C.y, 60, { speed: 620, color: '#fff2b0' });
    burst(D, 'spark', C.x, C.y, 24, { speed: 820, color: '#ffffff' });
    ww.fx.ring(C.x, C.y, { color: GOLD, r0: 40, r1: cam.vw * 0.7, life: 0.7, width: 18 });
    // 성전 기사: 체력 10% · 블러드 헌터: 흡혈 합계 (피의 흐름이 카엘에게 모인다)
    const heal = D.t2?.heal ?? 0;
    if (heal > 0) { const h0 = p.hp; D.v.heal(heal); D.info.healGot = Math.round(p.hp - h0); burst(D, 'holy', p.cx, p.cy, 18, { speed: 180, color: '#fff2b0' }); sfx('heal', { vol: 0.6 }); }
    if (D.ls > 0) {
      for (const f of targets) for (let k = room(D, 6); k > 0; k--) {
        const dx = p.cx - f.cx, dy = p.cy - f.cy, L = Math.hypot(dx, dy) || 1, s = rand(520, 760);
        ww.fx.emit('blood', f.cx + rand(-10, 10), f.cy + rand(-10, 10), { speed: 0, vx: dx / L * s, vy: dy / L * s, grav: 0, drag: 1, collide: false, life: Math.min(0.9, L / s), size: rand(2.5, 4.5) });
      }
      if (D.healed >= 1) ww.fx.text(p.cx, p.y - 30, `흡혈 +${Math.round(D.healed)}`, { color: '#ff6a8a', size: 18, life: 1.2, vy: -50 });
    }
    D.info.final = { x: Math.round(C.x), y: Math.round(C.y), targets: targets.length };
  }
  const steps = [
    [0, (ww) => {
      stance(p, ww, 'launch', 0.3, 0.05, 0.14);
      sfx('whip_crack', { pitch: 0.8 }); sfx('fire', { vol: 0.55, pitch: 0.7 }); sfx('awaken_charge', { vol: 0.4, pitch: 1.4 });
      const h = hand();
      burst(D, vr === 'inquisitor' ? 'fire' : 'holy', h.x, h.y - 20, 22, { angle: -Math.PI / 2, spread: 0.9, speed: 320, color: LASH[0] });
      ww.fx.ring(p.cx, p.cy, { color: LASH[0], r0: 20, r1: 200, life: 0.45, width: 10 });
    }],
    [T_CAGE, (ww, e) => cage(ww, e)],
    [T_TIGHT, (ww) => {
      sfx('charge_ready', { pitch: 0.7 });
      if (vr === 'inquisitor' && D.t2?.dot) { burnFoes(D, S.caged, D.t2.dot); sfx('fire', { pitch: 0.6 }); }
    }],
    [T_DAWN, () => { S.dawn = 0; sfx('choir_gate', { vol: 0.5, pitch: 1.2 }); }],
    [T_FIN, (ww, e) => final(ww, e)],
  ];
  for (let i = 0; i < nL; i++) steps.push([T_L0 + (nL > 1 ? i * (T_L1 - T_L0) / (nL - 1) : 0), (ww, e) => lash(i, ww, e)]);

  /** 성전 기사: 카엘 뒤 방패 인장 (연출 내내 맥동 → 마무리에서 번쩍이며 커지고 체력이 찬다) */
  function sigilRear(ctx, e) {
    const lt = e.lt, inK = ease.outBack(clamp(lt / 0.3, 0, 1)), endF = clamp((e.life - lt) / 0.4, 0, 1);
    const fin = S.fin ? lt - S.fin.t0 : -1, burstK = fin >= 0 ? clamp(1 - fin / 0.18, 0, 1) : 0;
    const grow = fin >= 0 ? 1 + 0.9 * ease.outCubic(clamp(fin / 0.6, 0, 1)) : 1;
    const a = (fin >= 0 ? clamp(1 - (fin - 0.25) / 0.6, 0, 1) : 1) * endF;
    if (a <= 0.01 || inK <= 0.01) return;
    const x = p.cx, y = p.y + p.h * 0.42, s = 62 * inK * grow * (1 + 0.04 * Math.sin(lt * 9)), pk = 0.72 + 0.28 * Math.sin(lt * 7);
    ctx.globalCompositeOperation = 'lighter';
    K.glow(ctx, x, y, s * 1.9, '#fff2b0', (0.3 + 0.5 * burstK) * a);
    K.runeCircle(ctx, x, p.bottom - 2, s * 1.35, '#e8c872', lt * 1.6, a * 0.9, 0.24, 8);
    ctx.save(); ctx.translate(x, y);
    const shield = () => {
      ctx.beginPath();
      ctx.moveTo(-s * 0.62, -s * 0.74); ctx.lineTo(s * 0.62, -s * 0.74); ctx.lineTo(s * 0.62, -s * 0.1);
      ctx.quadraticCurveTo(s * 0.56, s * 0.56, 0, s * 0.96); ctx.quadraticCurveTo(-s * 0.56, s * 0.56, -s * 0.62, -s * 0.1); ctx.closePath();
    };
    shield(); ctx.globalAlpha = Math.min(1, (0.1 + 0.25 * burstK) * a); ctx.fillStyle = '#e8c872'; ctx.fill();
    lineGlow(ctx, a * pk, '#e8c872', '#fff8e0', 5 + 6 * burstK);
    ctx.beginPath(); ctx.moveTo(0, -s * 0.56); ctx.lineTo(0, s * 0.66); ctx.moveTo(-s * 0.4, -s * 0.16); ctx.lineTo(s * 0.4, -s * 0.16);
    lineGlow(ctx, a * pk, '#fff2b0', '#ffffff', 4 + 5 * burstK);
    ctx.restore();
  }

  return director(D, {
    dur: DUR, steps,
    rear: vr === 'templar' || D.t2?.sigil ? sigilRear : undefined,
    tick(e, ww, dt) {
      const lt = e.lt;
      if (S.dawn >= 0) S.dawn += dt;
      // 감옥으로 조이기 (1.1 → 1.4): 끌어당김
      if (S.cage && lt < T_TIGHT + 0.05) pull(ww, dt);
      // 불타는 채찍 자국
      if (!S.fin && lashes.length) {
        drip(D, 'burn', dt, 8 * lashes.length * (vr === 'inquisitor' ? 2 : 1), () => {
          const L = lashes[(Math.random() * lashes.length) | 0], g = geo(L, lt), u = rand(0.05, 0.95);
          const x = bzx(g, u), y = bzy(g, u);
          if (vr === 'bloodhunter') ww.fx.emit('blood', x, y, { speed: 40, size: rand(2, 3.5) });
          else if (vr === 'nightraven') ww.fx.emit('feather', x, y, { color: '#1a1830', speed: 40 });
          else if (vr === 'inquisitor') ww.fx.emit('fire', x, y, { angle: -Math.PI / 2, spread: 0.6, speed: 70 });
          else ww.fx.emit('ember', x, y, { angle: -Math.PI / 2, spread: 0.6, speed: 70, color: LASH[0] });
        });
      }
      if (lt < 0.25) drip(D, 'hand', dt, 60, () => { const h = hand(); ww.fx.emit('fire', h.x + rand(-8, 8), h.y - rand(0, 30), { angle: -Math.PI / 2, spread: 0.5, speed: 120, color: LASH[0], color2: '#ffffff' }); });
      if (S.cage && !S.fin && lt > T_TIGHT) drip(D, 'motes', dt, 50, () => { const a = rand(0, TAU), r = rand(180, 260), C = S.cage.C; ww.fx.emit('holy', C.x + Math.cos(a) * r, C.y + Math.sin(a) * r, { speed: 0, vx: -Math.cos(a) * 400, vy: -Math.sin(a) * 400, grav: 0, life: 0.5, color: LASH[1] }); });
      // 여명 뒤 황금 불씨 비 (1.5초)
      if (S.fin && lt - S.fin.t0 < 1.5) {
        const V = viewOf(D);
        drip(D, 'rain', dt, 55 * (1 - (lt - S.fin.t0) / 1.5 * 0.6), () => ww.fx.emit('ember', V.x + rand(0, V.w), V.y - 8, { angle: Math.PI / 2, spread: 0.35, speed: rand(60, 170), grav: rand(90, 200), drag: 0.99, life: rand(0.9, 1.6), color: Math.random() < 0.3 ? '#ffffff' : GOLD, size: rand(1.6, 3.2) }));
      }
    },
    back(ctx, e) {
      const a0 = Math.min(1, e.lt / 0.2) * clamp((e.life - e.lt) / 0.35, 0, 1);
      if (S.dawn >= 0 && PREP.dawn) {
        // 암전 → 여명: 한 장을 위로 밀어 올린다 (화면 전체 층 1개 그대로)
        const u = ease.inOutCubic(clamp(S.dawn / 0.4, 0, 1)) * (0.45 + 0.55 * flashK());
        ctx.globalAlpha = a0;
        ctx.drawImage(PREP.dawn, 0, 0, 8, 512, e.x, e.y - e.h * u, e.w, e.h * 2);
        ctx.globalAlpha = 1;
      } else { ctx.fillStyle = rgba(D.dark, 0.62 * a0); ctx.fillRect(e.x, e.y, e.w, e.h); }
    },
    draw(ctx, e) {
      const lt = e.lt, endF = clamp((e.life - lt) / 0.45, 0, 1);
      // 채찍 띠
      for (const L of lashes) {
        const age = lt - L.t0, g = geo(L, lt);
        const grow = clamp(age / 0.08, 0, 1);
        const flash = age < 0.22 ? 1 - age / 0.22 : 0;
        const caged = S.cage ? clamp((lt - S.cage.t0) / 0.3, 0, 1) : 0;
        const finK = S.fin ? clamp(1 - (lt - S.fin.t0) / 0.18, 0, 1) : 1;
        let a = (0.42 + 0.58 * flash) * (0.88 + 0.12 * Math.sin(lt * 38 + L.seed));
        a = Math.max(a, caged * (0.9 + 0.1 * Math.sin(lt * 50 + L.seed)));
        a *= finK * endF;
        if (a <= 0.01) continue;
        pathBz(ctx, g, grow);
        lineGlow(ctx, a, LASH[0], LASH[1], (7 + 7 * flash + 5 * caged) * (S.cage ? 1 : 1));
        if (grow < 1) K.glow(ctx, bzx(g, grow), bzy(g, grow), 60, LASH[1], 1);
      }
      // 까마귀 (나이트 레이븐)
      if (crowImg && crows.length) {
        const fw = crowImg.width / 2, fh = crowImg.height;
        for (const c of crows) {
          const u = (lt - c.t0) * c.sp;
          if (u < 0 || u > 1.15) continue;
          const g = c.L, x = bzx(g, u), y = bzy(g, u) + c.off, dx = bzx(g, Math.min(1, u + 0.02)) - bzx(g, Math.max(0, u - 0.02)), dy = bzy(g, Math.min(1, u + 0.02)) - bzy(g, Math.max(0, u - 0.02));
          const f = Math.floor(lt * 14 + c.ph) & 1, dir = dx >= 0 ? 1 : -1;
          ctx.globalAlpha = clamp((1.15 - u) / 0.15, 0, 1); ctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(dy, Math.abs(dx)) * dir * 0.6); ctx.scale(c.s * dir, c.s);
          ctx.drawImage(crowImg, f * fw, 0, fw, fh, -fw / 2, -fh / 2, fw, fh);
          ctx.restore();
          ctx.globalAlpha = 1;
        }
      }
      // 감옥 중심의 성문양 · 모여드는 빛
      if (S.cage && !S.fin) {
        const C = S.cage.C, u = clamp((lt - S.cage.t0) / 0.3, 0, 1), tight = clamp((lt - T_TIGHT) / 0.3, 0, 1);
        K.runeCircle(ctx, C.x, C.y, 150 * ease.outBack(u) * (1 - 0.25 * tight), LASH[0], lt * 2.2, u, 1, 8);
        K.runeCircle(ctx, C.x, C.y, 90 * u * (1 - 0.2 * tight), '#ffffff', -lt * 3, 0.8 * u, 1, 6);
        ctx.globalCompositeOperation = 'lighter';
        K.glow(ctx, C.x, C.y, 120 + 120 * tight, LASH[0], 0.35 + 0.45 * tight);
        if (tight > 0) K.spiralMotes(ctx, C.x, C.y, tight, D.q === 'low' ? 10 : 22, 300, LASH[1], lt * 3);
      }
      // 빛의 십자가 대폭발
      if (S.fin) {
        // 번쩍 → 0.25초 버틴 뒤 가늘어지며 사라진다 (화면을 오래 덮지 않게)
        const C = S.fin.C, age = lt - S.fin.t0, V = viewOf(D, 80);
        const g = ease.outExpo(clamp(age / 0.12, 0, 1)), decay = 1 - ease.inCubic(clamp((age - 0.22) / 0.7, 0, 1));
        const fade = clamp((e.life - lt) / 0.4, 0, 1) * decay, pulse = 1 + 0.08 * Math.sin(age * 34), wk = g * (0.35 + 0.65 * decay) * pulse;
        if (fade > 0.01) {
          ctx.globalCompositeOperation = 'lighter';
          K.beamV(ctx, C.x, V.y, V.y + V.h, 70 * wk, GOLD, 0.8 * fade);
          K.beamV(ctx, C.x, V.y, V.y + V.h, 24 * wk, '#ffffff', fade, '#ffffff');
          K.beamH(ctx, V.x, V.x + V.w, C.y, 46 * wk, GOLD, 0.8 * fade);
          K.beamH(ctx, V.x, V.x + V.w, C.y, 16 * wk, '#ffffff', fade, '#ffffff');
          K.glow(ctx, C.x, C.y, 240 * (1 + age * 0.6), GOLD, 0.85 * fade * Math.exp(-age * 2.2));
          K.flare(ctx, C.x, C.y, 300 * g, '#fff2b0', fade, Math.PI / 4 + age * 0.4);
          K.runeCircle(ctx, C.x, C.y, 230 * g * (1 + age * 0.3), GOLD, age * 1.2, 0.8 * fade, 1, 8);
          if (D.acc) K.flare(ctx, C.x, C.y, 190 * g, D.acc, 0.7 * fade, -age * 0.6);
        }
      }
      // 불붙은 채찍 끝 (시작)
      if (lt < 0.3) { const h = hand(), k = 1 - lt / 0.3; ctx.globalCompositeOperation = 'lighter'; K.glow(ctx, h.x, h.y - 20, 70 + 40 * Math.sin(lt * 40), LASH[0], k); }
    },
    light(L, e) {
      L.add(p.cx, p.cy, 220, LASH[0], 1);
      if (S.cage) L.add(S.cage.C.x, S.cage.C.y, 420, LASH[0], 1.3);
      if (S.fin) L.add(S.fin.C.x, S.fin.C.y, 900, GOLD, 2 * clamp((e.life - e.lt) / 0.6, 0, 1));
      for (const Lh of lashes.slice(-3)) L.add(bzx(Lh, 0.5), bzy(Lh, 0.5), 260, LASH[0], 0.7);
    },
  });

  /** 채찍 띠의 지금 모양: 흩어진 사선 → (감옥) 십자 막대 → (조이기) 중심으로 15% 수축 */
  function geo(L, lt) {
    if (!L.cage || !S.cage) return L;
    const m = ease.inOutCubic(clamp((lt - S.cage.t0) / 0.3, 0, 1));
    const s = 1 - 0.15 * ease.inCubic(clamp((lt - T_TIGHT) / 0.3, 0, 1)), C = S.cage.C, T = L.cage, O = L.o;
    const px = (a, b) => C.x + (lerp(a, b, m) - C.x) * s, py = (a, b) => C.y + (lerp(a, b, m) - C.y) * s;
    const G = L.g ??= {};
    G.x0 = px(O.x0, T.x0); G.y0 = py(O.y0, T.y0); G.cx = px(O.cx, T.cx); G.cy = py(O.cy, T.cy); G.x1 = px(O.x1, T.x1); G.y1 = py(O.y1, T.y1);
    return G;
  }
}

// ═══════════════════════════ 세라 — 천상의 문 — 세라핌 레퀴엠 ═══════════════════════════
const ARCH = [['fire', '#ff7a2a', '#ffd0a0'], ['ice', '#9fe8ff', '#e8fcff'], ['thunder', '#fff2a0', '#ffffff']];
function seraDirector(p, w, v) {
  const D = mkCtx(p, w, v, 'sera');
  const { K, cam } = D;
  const vr = D.T2c?.slice(5) ?? null;   // saint | oracle | archmage | stormcaller
  const W = D.W.length >= 2 ? D.W : [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 5.5];
  const nP = W.length - 1, T_GATE = 0.3, T_P0 = 0.6, GAP = 0.15, PLIFE = 0.34, T_FIN = 1.9, DUR = 2.95;
  const PCOL = vr === 'stormcaller' ? ['#bfe0ff', '#ffffff'] : vr === 'oracle' ? ['#d8f0ff', '#ffffff'] : ['#fff2b0', '#ffffff'];
  const S = { y0: p.y, gate: null, pillars: [], arcs: [], fin: null, feather: 0, halo: vr === 'saint' || !!D.t2?.halo };
  const wing = ULTFX.sprite?.('wing');
  D.info.pillars = 0; D.info.pillarHits = 0; D.info.chains = 0;

  /** 기둥이 쓸고 지나갈 가로 범위: 화면 안 적들의 좌우 끝 (최소 380px, 적이 없으면 화면 전체) — 보스 하나에도 기둥 대부분이 닿는다 */
  function sweepSpan(ww) {
    const V = viewOf(D), list = foesIn(ww, viewOf(D, 10));
    if (!list.length) return { x: V.x, w: V.w };
    let a = Infinity, b = -Infinity;
    for (const f of list) { const hb = hbOf(f); a = Math.min(a, hb.x); b = Math.max(b, hb.x + hb.w); }
    a -= 70; b += 70;
    if (b - a < 380) { const m = (a + b) / 2; a = m - 190; b = m + 190; }
    a = Math.max(a, V.x); b = Math.min(b, V.x + V.w);
    return b - a < 200 ? { x: V.x, w: V.w } : { x: a, w: b - a };
  }
  function pillar(i, ww, e) {
    const V = viewOf(D), SP = (S.span ??= sweepSpan(ww)), step = SP.w / nP;
    const x0 = SP.x + step * i + step * 0.15, x1 = x0 + step * 0.9;
    const el = vr === 'archmage' ? ARCH[i % 3] : null;
    const col = el ? [el[1], el[2]] : PCOL;
    const gy = D.K.groundAt(ww, x0 + step * 0.45, V.y + V.h * 0.35, 16 * TILE) ?? V.y + V.h - 30;
    const P = { i, t0: e.lt, x0, x1, x: x0, px: x0, gy, col, el: el?.[0] ?? (vr === 'stormcaller' ? 'thunder' : 'holy'), n: 0 };
    S.pillars.push(P);
    D.info.pillars++;
    sfx(el ? el[0] : vr === 'stormcaller' ? 'thunder' : 'holy', { vol: 0.6, pitch: 0.95 + i * 0.05 });
    try { ULTFX.beat(ww, x0 + 45, gy - 10, { power: 0.45, color: col[0], accent: D.acc, ground: true }); } catch (err) { fail(D, err); }
  }
  function pillarHit(P, ww, last) {
    const top = (S.gate?.y ?? viewOf(D).y) - 20;
    // 기둥 하나의 판정 = 쓸고 지나가는 띠 전체 (3연타 모두 같은 띠: 띠 안의 적은 기둥마다 3번 맞는다)
    const xa = P.x0 - 45, xb = P.x1 + 45;
    const rect = { x: xa, y: top, w: xb - xa, h: P.gy - top + 12 };
    const n = strike(D, rect, W[P.i] / 3, { element: P.el, hitstop: P.n === 0 ? 0.03 : 0, shake: 2, kb: [40, -200], fx: 'magic' });
    P.n++; D.info.pillarHits += n;
    if (n) burst(D, P.el === 'fire' ? 'fire' : P.el === 'ice' ? 'ice' : P.el === 'thunder' ? 'thunder' : 'holy', P.x, P.gy - 20, 6, { angle: -Math.PI / 2, spread: 1, speed: 260 });
    // 폭풍의 소환사: 기둥에서 가까운 적으로 연쇄 번개
    if (last && vr === 'stormcaller') {
      const inR = foesIn(ww, rect), near = foesIn(ww, viewOf(D, 20)).filter((f) => !inR.includes(f) && Math.abs(f.cx - P.x) < 320).slice(0, 3);
      const my = lerp(top, P.gy, 0.55);
      for (const f of near) {
        S.arcs.push({ x0: P.x, y0: my, x1: f.cx, y1: f.cy, t: 0, P: boltPts(P.x, my, f.cx, f.cy) });
        strike(D, inflate(hbOf(f), 4), W[P.i] / 3, { element: 'thunder', hitstop: 0, shake: 1, kb: [30, -80], fx: 'magic' });
        D.info.chains++;
      }
      if (near.length) sfx('thunder', { vol: 0.4, pitch: 1.3 });
    }
  }
  function final(ww, e) {
    const list = foesIn(ww, viewOf(D, 20));
    const V = viewOf(D);
    const f = focusOf(ww, list);
    const fx0 = clamp(f ? f.x : V.x + V.w / 2, V.x + 120, V.x + V.w - 120);
    const gy = D.K.groundAt(ww, fx0, (f ? f.y : V.y + V.h * 0.5) - 20, 16 * TILE) ?? V.y + V.h - 30;
    S.fin = { x: fx0, gy, t0: e.lt };
    stance(p, ww, 'cast', 0.8, 0.04, 0.12);
    strikeFinal(D, viewOf(D, 40), W[nP], { element: vr === 'stormcaller' ? 'thunder' : 'holy', kb: [300, -660] });
    try { ULTFX.final(ww, fx0, gy - 60, { color: D.col, accent: D.acc, tier: 2, classId: D.T2c ?? v.classId, ground: true, targets: list, flashColor: '#ffffff' }); } catch (err) { fail(D, err); }
    sfx('awaken_boom'); sfx('bell', { pitch: 1.4, vol: 0.7 }); sfx('holy', { pitch: 0.5 });
    if (vr === 'stormcaller') sfx('thunderclap');
    cam.punchZoom?.(1.1, 0.3); cam.addTrauma?.(0.7);
    ww.fx.ering(fx0, gy - 2, { color: PCOL[0], r0: 20, r1: V.w * 0.5, ry: 0.18, life: 0.55, width: 12 });
    burst(D, 'holy', fx0, gy - 30, 50, { speed: 640 });
    burst(D, 'shard', fx0, gy - 6, 14, { angle: -Math.PI / 2, spread: 1.2, speed: 440, color: '#d8d0c0' });
    // 성녀: 체력 20% + 빛이 세라에게 모인다
    const heal = D.t2?.heal ?? 0;
    if (heal > 0) {
      const h0 = p.hp; D.v.heal(heal); D.info.healGot = Math.round(p.hp - h0); sfx('heal', { vol: 0.7 });
      for (let k = room(D, 26); k > 0; k--) { const a = rand(0, TAU), r = rand(120, 260); ww.fx.emit('holy', p.cx + Math.cos(a) * r, p.cy + Math.sin(a) * r, { speed: 0, vx: -Math.cos(a) * r * 2, vy: -Math.sin(a) * r * 2, grav: 0, life: 0.5, color: '#fff2b0' }); }
    }
    // 신탁의 무녀: 끝난 뒤 3초 적 0.5배속
    if (D.t2?.slow) slowFoes(D, foesIn(ww, viewOf(D, 60)), D.t2.slow);
    D.info.final = { x: Math.round(fx0), gy: Math.round(gy), targets: list.length };
  }
  const steps = [
    [0, (ww) => {
      stance(p, ww, 'cast_up', 1.0, 0.06, 0.32);
      sfx('choir_gate'); sfx('holy', { pitch: 0.7 }); sfx('awaken_charge', { vol: 0.35, pitch: 1.5 });
      ww.fx.ring(p.cx, p.cy, { color: '#fff8d0', r0: 20, r1: 220, life: 0.5, width: 10 });
      burst(D, 'holy', p.cx, p.cy, 26, { speed: 380 });
      S.y0 = p.y;
    }],
    [T_GATE, (ww, e) => {
      const V = viewOf(D);
      S.gate = { x: V.x + V.w / 2, y: V.y + 86, t0: e.lt };
      sfx('bell', { pitch: 0.8 }); sfx('choir_gate', { vol: 0.5, pitch: 1.25 });
      D.cine = true;
      try { cam.cine?.(V.x + V.w / 2, V.y + V.h / 2 - 40, cam.baseZoom || 1, 0.4); } catch { D.cine = false; }
    }],
    [0.95, (ww) => stance(p, ww, 'cast_up', 0.95, 0.02, 0.2)],
    [T_FIN - 0.14, () => { sfx('charge_ready', { pitch: 0.6 }); sfx('slash_heavy', { pitch: 0.5, vol: 0.7 }); }],
    [T_FIN, (ww, e) => final(ww, e)],
  ];
  for (let i = 0; i < nP; i++) steps.push([T_P0 + i * GAP, (ww, e) => pillar(i, ww, e)]);

  return director(D, {
    dur: DUR, steps,
    tick(e, ww, dt) {
      const lt = e.lt;
      // 60px 떠오른다 (천장이 있으면 그만큼만) → 끝날 무렵 내려온다
      const lift = 60 * ease.outCubic(clamp(lt / 0.5, 0, 1)) * (1 - ease.inOutCubic(clamp((lt - 2.3) / 0.45, 0, 1)));
      const ny = S.y0 - lift;
      if (!solid(ww, p.x + 4, ny + 2) && !solid(ww, p.x + p.w - 4, ny + 2) && !solid(ww, p.cx, ny + 2)) { p.y = ny; p.vy = 0; }
      else p.vy = Math.min(p.vy, 0);
      // 기둥: 옆으로 쓸며 3연타
      for (const P of S.pillars) {
        const age = lt - P.t0;
        P.x = lerp(P.x0, P.x1, clamp(age / PLIFE, 0, 1));
        const want = age >= 0.24 ? 3 : age >= 0.14 ? 2 : age >= 0.03 ? 1 : 0;
        while (P.n < want) pillarHit(P, ww, P.n === 2);
        if (age < PLIFE && Math.random() < 0.5) burst(D, P.el === 'fire' ? 'fire' : P.el === 'ice' ? 'ice' : 'holy', P.x + rand(-30, 30), P.gy - rand(0, 180), 1, { angle: -Math.PI / 2, spread: 0.2, speed: 200 });
      }
      for (let i = S.arcs.length - 1; i >= 0; i--) { const A = S.arcs[i]; A.t += dt; if (A.t > 0.2) S.arcs.splice(i, 1); else if (((A.t / 0.05) | 0) !== A.k) { A.k = (A.t / 0.05) | 0; A.P = boltPts(A.x0, A.y0, A.x1, A.y1); } }
      // 천상의 깃털 비
      if (lt > 0.3 && lt < 2.1) {
        const V = viewOf(D);
        drip(D, 'feather', dt, 22, () => { const back = Math.random() < 0.6; ww.fx.emit('feather', V.x + rand(0, V.w), V.y - 10, { color: Math.random() < 0.5 ? '#fff8e0' : '#ffe7a0', angle: Math.PI / 2, spread: 0.4, speed: rand(40, 90), grav: 40, life: rand(1.6, 2.4), size: back ? rand(6, 9) : rand(4, 6), layer: back ? 'back' : 'front' }); });
      }
      if (lt < 1.9) drip(D, 'float', dt, 16, () => ww.fx.emit('holy', p.cx + rand(-20, 20), p.bottom + rand(-4, 8), { angle: Math.PI / 2, spread: 0.6, speed: 60, life: 0.45 }));
    },
    back(ctx, e) {
      const a = Math.min(1, e.lt / 0.2) * clamp((e.life - e.lt) / 0.35, 0, 1);
      ctx.fillStyle = rgba('#0a0818', 0.58 * a); ctx.fillRect(e.x, e.y, e.w, e.h);
      // 천상의 문: 스테인드글라스 장미창 + 룬 고리 2겹 (서로 반대로 돈다) + 빛살 + 아래로 내리는 빛
      const G = S.gate;
      if (!G) return;
      const lt = e.lt, k = clamp((lt - G.t0) / 0.35, 0, 1) * clamp((e.life - lt) / 0.45, 0, 1), R = 150 * ease.outBack(clamp((lt - G.t0) / 0.35, 0, 1));
      if (k <= 0.01) return;
      ctx.globalCompositeOperation = 'lighter';
      K.glow(ctx, G.x, G.y, R * 2, '#fff2b0', 0.42 * k);   // 문 가운데가 하얗게 타 버리지 않게 (장미창 색이 보이도록)
      rays(ctx, G.x, G.y, 18, R * 0.6, R * 2.6, lt * 0.25, '#fff2b0', 0.28 * k, 0.04);
      K.beamV(ctx, G.x, G.y, G.y + (e.h * 0.9), R * 0.9, '#fff2b0', 0.16 * k);
      K.glassRose(ctx, G.x, G.y, R, lt * 0.35, 0.8 * k, 0.94);
      K.runeCircle(ctx, G.x, G.y, R * 1.2, D.col, -lt * 0.8, k, 0.94, 8);
      K.runeCircle(ctx, G.x, G.y, R * 0.62, '#ffffff', lt * 1.4, k, 0.94, 6);
    },
    rear(ctx, e) {
      // 여섯 날개 (세라 뒤, z 9.6) + 성녀의 후광
      const lt = e.lt, open = ease.outBack(clamp(lt / 0.45, 0, 1)), fade = clamp((e.life - lt) / 0.45, 0, 1) * clamp(lt / 0.08, 0, 1);
      const rx = p.cx - p.facing * 4, ry = p.y + p.h * 0.32;
      ctx.globalCompositeOperation = 'lighter';
      K.glow(ctx, rx, ry, 150 + 40 * open, '#fff8d0', 0.5 * fade);
      if (wing) {
        const BASE = [-0.62, 0.02, 0.6], SC = [0.95, 0.8, 0.64];
        for (const side of [-1, 1]) for (let k = 2; k >= 0; k--) {
          const rot = lerp(1.25, BASE[k], open) + Math.sin(lt * 6 + k) * 0.06 * open;
          ctx.save(); ctx.translate(rx + side * 5, ry - k * 4); ctx.scale(side, 1);
          blitAt(ctx, wing, 0, 0, SC[k], rot, 0.66 * fade, false, 22 / 256, 178 / 200);
          blitAt(ctx, wing, 0, 0, SC[k], rot, 0.2 * fade, true, 22 / 256, 178 / 200);
          ctx.restore();
        }
      }
      if (S.halo) {
        const hx = p.cx, hy = p.y - 8, hk = clamp((lt - 0.15) / 0.3, 0, 1) * fade, pul = 1 + 0.06 * Math.sin(lt * 7);
        ctx.globalCompositeOperation = 'lighter';
        K.glow(ctx, hx, hy, 46 * pul, '#ffe7a0', 0.7 * hk);
        ctx.globalAlpha = hk; ctx.strokeStyle = '#fff2b0'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.ellipse(hx, hy, 22 * pul, 7 * pul, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
    draw(ctx, e) {
      const lt = e.lt, V = viewOf(D, 60), top = (S.gate?.y ?? V.y) - 10;
      // 심판의 기둥
      for (const P of S.pillars) {
        const age = lt - P.t0;
        if (age > PLIFE + 0.2) continue;
        const u = clamp(age / PLIFE, 0, 1), a = age < 0.04 ? age / 0.04 : age > PLIFE ? clamp(1 - (age - PLIFE) / 0.2, 0, 1) : 1;
        const wd = 45 * (age < 0.05 ? lerp(1.6, 1, age / 0.05) : 1) * (1 - 0.25 * u);
        K.runeCircle(ctx, P.x, P.gy - 1, 90, P.col[0], lt * 4, a, 0.25, 6);
        ctx.globalCompositeOperation = 'lighter';
        K.beamV(ctx, P.x, top, P.gy, wd * 1.4, P.col[0], 0.6 * a);
        K.beamV(ctx, P.x, top, P.gy, wd * 0.45, P.col[1], a, '#ffffff');
        K.glow(ctx, P.x, P.gy, 120, P.col[0], 0.75 * a);
        K.glow(ctx, P.x, top + 10, 80, P.col[1], 0.6 * a);
        if (P.el === 'thunder' && age < PLIFE) {
          ctx.strokeStyle = P.col[0]; pathPts(ctx, boltPts(P.x + rand(-10, 10), top, P.x + rand(-10, 10), P.gy, 9, 26)); lineGlow(ctx, a, P.col[0], '#ffffff', 4);
        }
      }
      // 연쇄 번개
      for (const A of S.arcs) { pathPts(ctx, A.P); lineGlow(ctx, 1 - A.t / 0.2, '#bfe0ff', '#ffffff', 4); }
      // 심판의 십자광: 떨어지는 예고선 → 내리꽂힘
      const G = S.gate;
      if (G && lt > T_FIN - 0.14 && !S.fin) {
        const u = clamp((lt - (T_FIN - 0.14)) / 0.14, 0, 1), x = V.x + V.w / 2;
        ctx.globalCompositeOperation = 'lighter';
        K.beamV(ctx, x, G.y, lerp(G.y, V.y + V.h, ease.inCubic(u)), 10 + 16 * u, '#fff2b0', 0.7);
      }
      if (S.fin && G) {
        // 번쩍임은 짧게 (feel §6.4: 백색 0.3초) — 0.25초 버틴 뒤 십자광이 가늘어지며 사라지고, 퍼지는 빛은 빠르게 식는다
        const F = S.fin, age = lt - F.t0, g = ease.outExpo(clamp(age / 0.1, 0, 1)), decay = 1 - ease.inCubic(clamp((age - 0.25) / 0.6, 0, 1));
        const fade = clamp((e.life - lt) / 0.6, 0, 1) * decay, pul = 1 + 0.07 * Math.sin(age * 36);
        const barY = lerp(G.y, F.gy, 0.38);
        ctx.globalCompositeOperation = 'lighter';
        K.beamV(ctx, F.x, G.y - 20, F.gy + 10, 65 * g * pul, PCOL[0], 0.85 * fade);
        K.beamV(ctx, F.x, G.y - 20, F.gy + 10, 22 * g, '#ffffff', fade, '#ffffff');
        K.beamH(ctx, F.x - 190 * g, F.x + 190 * g, barY, 30 * g * pul, PCOL[0], 0.85 * fade);
        K.beamH(ctx, F.x - 180 * g, F.x + 180 * g, barY, 10 * g, '#ffffff', fade, '#ffffff');
        K.glow(ctx, F.x, F.gy - 20, 280 * (1 + age * 0.5), PCOL[0], 0.85 * fade * Math.exp(-age * 2.4));
        K.flare(ctx, F.x, barY, 220 * g, '#ffffff', fade, age * 0.5);
        K.runeCircle(ctx, F.x, F.gy - 2, 240 * g, PCOL[0], age * 2, fade, 0.22, 8);
        if (vr === 'archmage') for (let k = 0; k < 3; k++) K.runeCircle(ctx, F.x, F.gy - 2, (150 + k * 70) * g, ARCH[k][1], age * (k % 2 ? -2.4 : 2.4), 0.8 * fade, 0.22, 3 + k * 2);
      }
    },
    screen(ctx, vw, vh, e) {
      // 천상의 빛 (high 만: 화면 전체 층 예산) — 문이 열리는 동안 위에서 내려오는 은은한 금빛
      if (D.q !== 'high' || !S.gate) return;
      const k = clamp((e.lt - S.gate.t0) / 0.4, 0, 1) * (S.fin ? clamp(1 - (e.lt - S.fin.t0) / 0.15, 0, 1) : 1);
      if (k <= 0.01) return;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.07 * k * flashK(); ctx.fillStyle = '#ffe7a0'; ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    },
    light(L, e) {
      L.add(p.cx, p.cy, 260, '#fff8d0', 1.2);
      if (S.gate) L.add(S.gate.x, S.gate.y, 420, '#fff2b0', 1.4);
      for (const P of S.pillars) if (e.lt - P.t0 < PLIFE) L.add(P.x, P.gy - 120, 260, P.col[0], 1.2);
      if (S.fin) L.add(S.fin.x, S.fin.gy - 120, 900, '#fff2b0', 2 * clamp((e.life - e.lt) / 0.6, 0, 1));
    },
    end() { p.vy = Math.min(p.vy, 0); },
  });
}

// ═══════════════════════════ 빅터 — 실버 레퀴엠 — 여섯 발의 장송곡 ═══════════════════════════
const CARDS = [['A', '♠'], ['8', '♣'], ['A', '♣'], ['8', '♠']];
function victorDirector(p, w, v) {
  const D = mkCtx(p, w, v, 'victor');
  const { K, cam } = D;
  const vr = D.T2c?.slice(7) ?? null;   // phantom | executioner | hellfire | gunlord
  const W = D.W.length >= 2 ? D.W : [1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.5];
  const nW = W.length - 1;
  const shots = clamp(Math.round(D.t2?.shots ?? nW), 1, 24);
  const T_S0 = 0.3, T_S1 = 1.5, gap = shots > 1 ? (T_S1 - T_S0) / (shots - 1) : 0, T_HOL = 1.6, T_DET = 1.75, T_ACE = 2.0, DUR = 2.85;
  const hop = (k) => W[k % nW] / 3 * (nW / shots);   // 한 발 = 도탄 3회 (쌍권총 12발이면 한 발 가중치 절반: 합은 그대로)
  const SIL = vr === 'phantom' ? '#9ab0ff' : vr === 'executioner' ? '#ff2030' : vr === 'hellfire' ? '#ff7a2a' : '#e8ecff';
  const TRACE = vr === 'phantom' ? '#c8d4ff' : vr === 'hellfire' ? '#ffb060' : '#fff0b0';
  const S = { marks: new Map(), pos: [], bullets: [], locks: [], cards: [], lit: [], order: [], oi: 0, cylA: 0, det: null, ace: -1, trails: [] };
  const cols = vr === 'gunlord' ? 2 : 1;
  D.info.shots = 0; D.info.hopHits = 0; D.info.marks = 0; D.info.executed = 0;

  function nextTarget(ww) {
    const list = foesIn(ww, viewOf(D, 10));
    if (!list.length) return null;
    if (S.oi >= S.order.length || !S.order.every(alive)) { S.order = byPriority(ww, p, list); S.oi = 0; }
    for (let k = 0; k < S.order.length; k++) { const e = S.order[(S.oi + k) % S.order.length]; if (alive(e)) { S.oi = (S.oi + k + 1); return e; } }
    return null;
  }
  function lock(k, ww, e) {
    const tg = nextTarget(ww), V = viewOf(D);
    const x = tg ? tg.cx : V.x + rand(120, V.w - 120), y = tg ? tg.cy : V.y + rand(120, V.h - 140);
    S.locks.push({ x, y, tg, rt: ww.rt ?? 0, k });
    if (Math.abs(x - p.cx) > 16) p.facing = x > p.cx ? 1 : -1;
    ww.hitstop = Math.max(ww.hitstop || 0, shots > 6 ? 0.04 : 0.08);   // 조준 순간 정지 (월드만 멈추고 조준선은 실제 시간으로 조여든다)
    sfx('clock_tick', { pitch: 1.7, vol: 0.6 });
    S.bullets.push({ k, t: e.lt + 0.02, tg, x, y, hops: 0, hit: new Set(), from: null });
  }
  function fire(B, ww, e) {
    const alt = B.k % 2 === 1, g = K.gunOf(p, alt);
    if (B.tg && alive(B.tg)) { B.x = B.tg.cx; B.y = B.tg.cy; }
    const ang = Math.atan2(B.y - g.y, B.x - g.x);
    stance(p, ww, cols === 2 ? (B.k % 4 < 2 ? 'shoot_double' : alt ? 'shoot_alt' : 'shoot') : alt ? 'shoot_alt' : 'shoot', 0.2, 0.01, 0.04);
    K.muzzle(ww, p, g.x, g.y, ang, '#fff0b0', 1.5);
    const mz = ULTFX.sprite?.('muzzle');
    if (mz) ww.fx.sprite(mz, g.x + Math.cos(ang) * 50, g.y + Math.sin(ang) * 50, { size: 150, angle: ang, life: 0.1, s0: 0.6, s1: 1.1 });
    sfx('gun', { pitch: rand(0.78, 0.88), vol: 0.95 }); if (B.k % 2 === 0) sfx('shotgun', { vol: 0.35, pitch: 1.6 });
    cam.kick?.(-Math.cos(ang) * 4, -Math.sin(ang) * 3); cam.punchZoom?.(1.035, 0.05);
    // 약실 불 켜기 · 카드 한 장
    S.lit.push({ k: B.k, rt: ww.rt ?? 0 });
    S.cylA += TAU / 6;
    const V = viewOf(D), c = CARDS[B.k % 4];
    S.cards.push({ x: clamp(B.x + rand(-80, 80), V.x + 40, V.x + V.w - 40), y: V.y - 40, vx: rand(-40, 40), vy: rand(150, 220), rot: rand(-1, 1), vr: rand(-5, 5), r: c[0], s: c[1], sc: rand(0.9, 1.15), ph: rand(0, 6) });
    if (B.k % 3 === 0) sfx('card', { vol: 0.5 });
    D.info.shots++;
    B.from = { x: g.x, y: g.y };
    impactHop(B, ww, e, B.x, B.y, B.tg);
  }
  /** 한 번의 착탄 (또는 팬텀: 선분 위 모두 관통) */
  function impactHop(B, ww, e, x, y, tg) {
    const from = B.from;
    const w8 = hop(B.k);
    let hitList = [];
    if (vr === 'phantom') {
      // 유령탄: 화면 끝까지 꿰뚫는다 (선분 위의 모든 적)
      const ang = Math.atan2(y - from.y, x - from.x), V = viewOf(D, 40), L = Math.hypot(V.w, V.h);
      const ex = from.x + Math.cos(ang) * L, ey = from.y + Math.sin(ang) * L;
      for (const f of foesIn(ww, V)) {
        if (B.hit.has(f) && f !== tg) continue;   // 한 발이 꿰뚫는 적은 한 번씩 (겨눈 적만 도탄마다) — 총량이 일반 탄과 같은 규모로
        const hb = inflate(hbOf(f), 14);
        for (let s = 0; s <= 40; s++) { const u = s / 40, px = lerp(from.x, ex, u), py = lerp(from.y, ey, u); if (px >= hb.x && px <= hb.x + hb.w && py >= hb.y && py <= hb.y + hb.h) { hitList.push(f); break; } }
      }
      S.trails.push({ x0: from.x, y0: from.y, x1: ex, y1: ey, rt: ww.rt ?? 0, ghost: true });
    } else {
      if (tg && alive(tg)) hitList = [tg];
      S.trails.push({ x0: from.x, y0: from.y, x1: x, y1: y, rt: ww.rt ?? 0 });
    }
    const hid = nid();
    let n = 0;
    for (const f of hitList) {
      const wk = vr === 'phantom' && tg && f !== tg ? w8 * 0.45 : w8;   // 유령탄이 지나가며 꿰뚫은 적은 45% (겨눈 적은 온전히)
      n += strike(D, inflate(hbOf(f), 2), wk, { hitId: hid, hitstop: n ? 0 : 0.02, shake: 2, kb: [60 * Math.sign(f.cx - from.x || 1), -120], fx: 'bullet' });
      markFoe(f, ww);
      B.hit.add(f);
    }
    D.info.hopHits += n;
    if (!hitList.length) S.pos.push({ x, y, rt: ww.rt ?? 0 });
    const st = starOf(TRACE);
    if (st) ww.fx.sprite(st, x, y, { size: 90, angle: rand(0, TAU), life: 0.14, s0: 0.3, s1: 1.2 });
    burst(D, 'spark', x, y, 6, { speed: 360, color: '#ffffff' });
    if (vr === 'hellfire' || B.hops === 0) { try { ULTFX.beat(ww, x, y, { power: 0.3, color: SIL, accent: D.acc, shake: false }); } catch (err) { fail(D, err); } }
    if (B.hops > 0) sfx('clang', { pitch: rand(2.0, 2.4), vol: 0.35 });
    B.hops++;
    B.from = { x, y };
    B.x = x; B.y = y;
  }
  function ricochet(B, ww, e) {
    // 다음 대상: 이 탄이 아직 맞히지 않은 가장 가까운 적 → 없으면 같은 적 (바닥에 튕겨 다시)
    const list = foesIn(ww, viewOf(D, 10)).filter(alive);
    let best = null, bd = 1e9;
    for (const f of list) { if (B.hit.has(f)) continue; const d = Math.hypot(f.cx - B.x, f.cy - B.y); if (d < bd) { bd = d; best = f; } }
    if (!best && B.tg && alive(B.tg)) best = B.tg;
    if (!best && list.length) best = list[(Math.random() * list.length) | 0];
    if (best) impactHop(B, ww, e, best.cx + rand(-8, 8), best.cy + rand(-10, 10), best);
    else { const V = viewOf(D); impactHop(B, ww, e, clamp(B.x + rand(-260, 260), V.x + 40, V.x + V.w - 40), clamp(B.y + rand(-160, 160), V.y + 40, V.y + V.h - 40), null); }
  }
  function markFoe(f, ww) {
    let m = S.marks.get(f);
    if (!m) { m = { e: f, x: f.cx, y: f.cy, n: 0, rt: ww.rt ?? 0 }; S.marks.set(f, m); D.info.marks = S.marks.size; }
    m.n++;
  }
  function detonate(ww, e) {
    S.det = { t0: e.lt, rt: ww.rt ?? 0, pts: [] };
    const marked = [...S.marks.values()];
    for (const m of marked) if (alive(m.e)) { m.x = m.e.cx; m.y = m.e.cy; }
    const pts = marked.map((m) => ({ x: m.x, y: m.y, e: m.e })).concat(S.pos.slice(-6).map((q) => ({ x: q.x, y: q.y, e: null })));
    if (!pts.length) { const V = viewOf(D); pts.push({ x: V.x + V.w * 0.6, y: V.y + V.h * 0.5, e: null }); }
    S.det.pts = pts;
    const w8 = W[nW];
    const targets = [];
    for (const m of marked) {
      if (!alive(m.e)) continue;
      targets.push(m.e);
      strikeFinal(D, inflate(hbOf(m.e), 4), w8, { hitId: nid(), kb: [240 * Math.sign(m.e.cx - p.cx || 1), -560], fx: 'bullet', dmgColor: '#e8ecff' });
    }
    if (!targets.length) D.wUsed += w8;
    // 처형인: 표식이 새겨진 일반 적 중 체력 25% 미만 즉시 처형
    const exe = D.t2?.execute ?? 0;
    if (exe > 0) {
      for (const m of marked) {
        const f = m.e;
        if (!alive(f) || isBoss(f, ww) || !(f.hp > 0) || f.hp / maxHpOf(f) >= exe) continue;
        try {
          const atk = D.v.atk(0, { flat: Math.ceil(f.hp) + 1, hitId: nid(), kb: [200 * Math.sign(f.cx - p.cx || 1), -420], hitstop: 0.05, shake: 6, crit: 0, dmgColor: '#ff2030', fx: 'bullet' });
          if (hitTarget(ww, atk, f, f.cx, f.cy)) { D.info.executed++; ww.fx.callout?.(f.cx, f.y - 20, '처형', { color: '#ff3040', size: 18 }); burst(D, 'blood', f.cx, f.cy, 16, { speed: 380 }); }
        } catch (err) { fail(D, err); }
      }
      if (D.info.executed) { sfx('crit', { pitch: 0.55 }); ww.game?.flash?.('#ff1020', 0.35, 4); }
    }
    let cx = 0, cy = 0;
    for (const q of pts) { cx += q.x; cy += q.y; }
    cx /= pts.length; cy /= pts.length;
    try { ULTFX.final(ww, cx, cy, { color: D.col, accent: D.acc, tier: 2, classId: D.T2c ?? v.classId, targets, flashColor: '#f0f0ff' }); } catch (err) { fail(D, err); }
    sfx('awaken_boom'); for (let i = 0; i < Math.min(3, pts.length); i++) sfx('explode', { vol: 0.6, pitch: rand(0.8, 1.05) });
    cam.punchZoom?.(1.12, 0.3); cam.addTrauma?.(0.65);
    for (const q of pts) {
      ww.fx.ring(q.x, q.y, { color: SIL, r0: 10, r1: 150, life: 0.4, width: 9 });
      if (vr === 'hellfire') burst(D, 'fire', q.x, q.y, 10, { speed: 420 });
      else burst(D, 'spark', q.x, q.y, 10, { speed: 480, color: '#ffffff' });
    }
    D.info.final = { marks: marked.length, pts: pts.length, targets: targets.length };
  }
  const steps = [
    [0, (ww) => {
      stance(p, ww, 'shoot_up', 0.32, 0.04, 0.1);
      sfx('cylinder_spin'); sfx('card', { pitch: 0.8 }); sfx('clock_tick', { pitch: 0.6 });
      ww.fx.ring(p.cx, p.cy, { color: '#ffd070', r0: 20, r1: 180, life: 0.4, width: 8 });
    }],
    [T_HOL, (ww) => {
      stance(p, ww, 'spin_blade', 0.32, 0.02, 0.26);
      sfx('sheath', { pitch: 1.35, vol: 0.95 }); sfx('cylinder_spin', { pitch: 1.4, vol: 0.45 });
      ww.fx.callout?.(p.cx, p.y - 28, '찰칵', { color: '#e8e8f0', size: 16 });
      try { ULTFX.afterimage(ww, p, '#ffd070', { life: 0.3 }); } catch { /* 잔상 생략 */ }
    }],
    [T_DET, (ww, e) => detonate(ww, e)],
    [T_ACE, (ww, e) => {
      S.ace = e.lt;
      stance(p, ww, 'shoot_up', 0.8, 0.05, 0.12);
      sfx('card', { pitch: 0.7, vol: 0.9 }); sfx('mist', { vol: 0.4, pitch: 1.3 });
      const g = K.gunOf(p, false);
      for (let k = room(D, 8); k > 0; k--) ww.fx.emit('smoke', g.x + rand(-6, 6), g.y - 10, { angle: -Math.PI / 2 - p.facing * 0.3, spread: 0.4, speed: rand(30, 70), size: rand(8, 14) });
    }],
  ];
  for (let k = 0; k < shots; k++) steps.push([T_S0 + k * gap, (ww, e) => lock(k, ww, e)]);

  return director(D, {
    dur: DUR, steps,
    tick(e, ww, dt) {
      const lt = e.lt;
      for (let i = S.bullets.length - 1; i >= 0; i--) {
        const B = S.bullets[i];
        if (lt < B.t) continue;
        if (!B.from) { fire(B, ww, e); B.t = lt + 0.05; continue; }
        if (B.hops < 3) { ricochet(B, ww, e); B.t = lt + 0.05; continue; }
        S.bullets.splice(i, 1);
      }
      for (let i = S.cards.length - 1; i >= 0; i--) {
        const c = S.cards[i];
        c.x += (c.vx + Math.sin(lt * 4 + c.ph) * 60) * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
        if (c.y > viewOf(D).y + viewOf(D).h + 60) S.cards.splice(i, 1);
      }
      // 건로드: 황금 탄피가 쏟아진다 (난사 동안)
      if (vr === 'gunlord' && lt > T_S0 && lt < T_S1 + 0.2) {
        drip(D, 'casing', dt, 40, () => { const g = K.gunOf(p, Math.random() < 0.5); ww.fx.emit('shard', g.x, g.y - 4, { color: '#e8c060', angle: -Math.PI / 2 - p.facing * 0.5, spread: 0.4, speed: rand(200, 320), size: 2.6, life: 0.7 }); });
      }
    },
    back(ctx, e) {
      const a = Math.min(1, e.lt / 0.2) * clamp((e.life - e.lt) / 0.35, 0, 1);
      ctx.fillStyle = rgba('#1e1206', 0.6 * a); ctx.fillRect(e.x, e.y, e.w, e.h);
    },
    draw(ctx, e) {
      const lt = e.lt, rt = e.world?.rt ?? w.rt ?? 0;
      // 탄도 (도탄) · 유령탄 궤적
      for (let i = S.trails.length - 1; i >= 0; i--) {
        const T = S.trails[i], age = rt - T.rt, life = T.ghost ? 0.5 : 0.16;
        if (age > life) { S.trails.splice(i, 1); continue; }
        const a = 1 - age / life;
        if (T.ghost) { taper(ctx, T.x0, T.y0, T.x1, T.y1, 18, '#4a5aff', 0.35 * a); taper(ctx, T.x0, T.y0, T.x1, T.y1, 8, '#9ab0ff', 0.7 * a); }
        taper(ctx, T.x0, T.y0, T.x1, T.y1, 5, TRACE, 0.8 * a);
        taper(ctx, T.x0, T.y0, T.x1, T.y1, 2, '#ffffff', a);
      }
      // 조준선 (조여들며 잠김 → 불이 들어온다)
      for (let i = S.locks.length - 1; i >= 0; i--) {
        const L = S.locks[i], age = rt - L.rt;
        if (age > 0.5) { S.locks.splice(i, 1); continue; }
        if (L.tg && alive(L.tg)) { L.x = L.tg.cx; L.y = L.tg.cy; }
        const u = ease.outCubic(clamp(age / 0.08, 0, 1)), r = lerp(70, 26, u), a = clamp((0.5 - age) / 0.2, 0, 1);
        crosshair(ctx, L.x, L.y, r, age < 0.08 ? '#ffffff' : vr === 'executioner' ? '#ff3040' : '#ffd070', a, (1 - u) * 1.6);
      }
      // 표식 (은빛 십자, 폭발 전까지)
      if (!S.det) for (const m of S.marks.values()) {
        if (!alive(m.e)) continue;
        const pul = 0.75 + 0.25 * Math.sin(lt * 18 + m.x);
        markIcon(ctx, m.e.cx, m.e.cy, 14 + 3 * Math.min(4, m.n), SIL, pul);
      }
      // 표식 폭발: 은빛 십자 충격파
      if (S.det) {
        const age = lt - S.det.t0, g = ease.outExpo(clamp(age / 0.1, 0, 1)), fade = clamp(1 - age / 0.55, 0, 1);
        if (fade > 0) {
          ctx.globalCompositeOperation = 'lighter';
          for (const q of S.det.pts) {
            const L = 130 * g + age * 120;
            K.beamV(ctx, q.x, q.y - L, q.y + L, 16 * (1 - age), SIL, fade);
            K.beamH(ctx, q.x - L, q.x + L, q.y, 16 * (1 - age), SIL, fade);
            K.glow(ctx, q.x, q.y, 110 * g, '#ffffff', 0.8 * fade);
          }
        }
      }
      // 떨어지는 카드
      for (const c of S.cards) {
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
        const sx = Math.cos(lt * 5 + c.ph);
        ctx.scale(c.sc * (Math.abs(sx) < 0.15 ? 0.15 * Math.sign(sx || 1) : sx), c.sc);
        ctx.globalCompositeOperation = 'source-over';
        K.cardShape(ctx, 38, 54, c.r, c.s, 0.95);
        ctx.restore();
      }
    },
    screen(ctx, vw, vh, e) {
      const lt = e.lt, rt = w.rt ?? 0;
      // 세피아 (high 만) — 폭발에서 걷힌다
      if (D.q === 'high') {
        const a = 0.14 * Math.min(1, lt / 0.25) * (S.det ? clamp(1 - (lt - S.det.t0) / 0.2, 0, 1) : 1);
        if (a > 0.005) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.fillStyle = '#704214'; ctx.fillRect(0, 0, vw, vh); ctx.globalAlpha = 1; }
      }
      // 반투명 여섯 약실 탄창 (건로드: 두 개)
      const cyl = PREP.cyl;
      const ca = Math.min(1, lt / 0.2) * clamp(1 - (lt - T_HOL) / 0.25, 0, 1);
      if (cyl && ca > 0.01) {
        const R = vh * 0.16, spin = lt < 0.3 ? (1 - ease.outCubic(lt / 0.3)) * 9 : 0;
        for (let c = 0; c < cols; c++) {
          const cx = cols === 2 ? (c ? vw * 0.8 : vw * 0.2) : vw * 0.24, cy = vh * 0.36;
          // 쏜 약실이 맨 위에서 불이 켜진 뒤 한 칸(60°) 돌아가 다음 약실이 올라온다
          const shotsOf = S.lit.filter((L) => (cols === 2 ? L.k % 2 === c : true)), n = shotsOf.length;
          const snap = n ? ease.outBack(clamp((rt - shotsOf[n - 1].rt) / 0.12, 0, 1)) : 0;
          const r = n ? n - 1 + snap : 0, ang = -r * TAU / 6 + spin;
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.36 * ca;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.drawImage(cyl, -R, -R, R * 2, R * 2); ctx.restore();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
          for (let j = 0; j < n && j < 6; j++) {
            const aa = -Math.PI / 2 + j * TAU / 6 + ang, rr = R * 0.54;
            const x = cx + Math.cos(aa) * rr, y = cy + Math.sin(aa) * rr, age = rt - shotsOf[j].rt;
            K.glow(ctx, x, y, R * 0.34 * (1 + Math.max(0, 0.4 - age)), '#ffd070', 0.9 * ca);
            ctx.globalAlpha = ca; ctx.fillStyle = '#fff0b0'; ctx.beginPath(); ctx.arc(x, y, R * 0.1, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
          }
        }
      }
      // 스페이드 에이스가 화면 한가운데서 뒤집힌다
      if (S.ace >= 0) {
        const age = lt - S.ace, fade = clamp((e.life - lt) / 0.35, 0, 1) * clamp(age / 0.08, 0, 1);
        if (fade > 0.01) {
          const flip = Math.cos(Math.min(1, age / 0.5) * Math.PI * 3), sc = 2.4 * (1 + 0.1 * (1 - clamp(age / 0.5, 0, 1)));
          const x = vw / 2, y = vh * 0.44;
          ctx.globalCompositeOperation = 'lighter';
          K.glow(ctx, x, y, 150, '#ffd070', 0.5 * fade);
          ctx.globalCompositeOperation = 'source-over';
          ctx.save(); ctx.translate(x, y); ctx.scale(sc * (Math.abs(flip) < 0.06 ? 0.06 : Math.abs(flip)), sc);
          if (flip >= 0 || age > 0.5) K.cardShape(ctx, 38, 54, 'A', '♠', fade);
          else { ctx.globalAlpha = fade; ctx.fillStyle = '#5a0a14'; ctx.fillRect(-19, -27, 38, 54); ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 1.5; ctx.strokeRect(-16, -24, 32, 48); ctx.globalAlpha = 1; }
          ctx.restore();
        }
      }
    },
    light(L, e) {
      L.add(p.cx, p.cy, 220, '#ffd070', 1);
      for (const T of S.trails) L.add(T.x1, T.y1, 160, TRACE, 0.9);
      if (S.det && e.lt - S.det.t0 < 0.6) for (const q of S.det.pts) L.add(q.x, q.y, 260, SIL, 1.4);
    },
  });
}
function crosshair(ctx, x, y, r, col, a, rot = 0) {
  if (!(a > 0.01)) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.beginPath();
  ctx.moveTo(-r - 12, 0); ctx.lineTo(-r * 0.35, 0); ctx.moveTo(r * 0.35, 0); ctx.lineTo(r + 12, 0);
  ctx.moveTo(0, -r - 12); ctx.lineTo(0, -r * 0.35); ctx.moveTo(0, r * 0.35); ctx.lineTo(0, r + 12);
  ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}
function markIcon(ctx, x, y, s, col, a) {
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, s * 0.72, 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 영웅별 각성 감독 (awaken.js 가 FXKIT 이 채워진 뒤 charId 로 찾는다) */
export const AWAKEN_DIRECTOR = { kael: kaelDirector, sera: seraDirector, victor: victorDirector };
