// 직업 특성 내용 C — 리아·아젤 (PERKS-C) (docs/specs/classes_t3.md §3.1 · §4.5 · §4.6 · §5 · §6)
//  PERKS_C   { '<CLASSES id | ASCENSIONS id | char:<영웅>>': { only?, N?, <훅>… } }   (§3.2, 훅 이름은 class_perks.js HOOK_NAMES)
//  ACTIVES_C { 'asc_<영웅>_<낱말>': (p, w, lv) => true|false }                          (비전 액티브, skills.js castSkill 대체 경로)
//  MARKS_C   { '<표식 키>': (ctx, e, n, k, t) => {…} }                                 (PerkLayer 가 그린다; k = 남은 시간 비율)
//  STATS_C   { procs: { '<항목>.<일>': 횟수 } }  — 발동 횟수 (QA 탐침이 읽는다; 발동 때만 늘어난다)
// 규칙 (§3.5 · §3.6): ./class_perks.js 와 데이터 모듈만 import 한다 (skills.js · player.js · world.js 금지).
// 모듈 최상단에서 가져온 바인딩(K·도우미)을 읽지 않는다 — 훅 본문 안에서만. 최상단에서 bus·game·document 를 건드리지 않는다.
// 모든 조절 수치는 항목의 N 표 (classes.js · ascensions.js 의 perk 문구 숫자와 같다). 백분율은 문구 그대로 % 값으로 적는다.
// 특성이 만드는 공격은 proc (procStrike · K.uHit{proc:true} · K.atk{proc:true}) — 예외: 네필림 깃털(§4.6, 일식을 일으키는 보통 공격)과
// 비전 액티브의 타격(보통 스킬 타격, §5).
// 그리기(표식·게이지·연출 draw)에는 난수·파티클·그라디언트·문자열 조립이 없다 (캐시 스프라이트 K.glow + 선·면 몇 개).
// 투사체 그림(표창·단검·깃털)도 그라디언트 없이 직접 그린다 (K.shurikenRender·daggerRender·featherShape 는 그릴 때마다 그라디언트를 만든다:
// 칼춤의 여왕 단검 8자루 × 2개 = 프레임당 16개 → perf_budget 상한 10 초과).
//
// 항목
//  lia_ninja (C8) 대시 거리 +30% · 대시 표창 · char:azel (C9) 안개 대시 통과 피해·회복 · azel_vampire (S7) 처치 뒤 흡혈 · azel_bloodking (S8) 피의 장벽
//  초월 8: 그림자 화신(분신) · 신기루(잔상 폭발·등 뒤 순간이동) · 칼춤의 여왕(도는 칼날) · 영혼 수확자(영혼·망자의 낫)
//          밤의 군주(피안개) · 혈제(피의 창) · 태양의 검(정오 광선) · 네필림(빛·어둠 깃털, 일식)
//  비전 2: lia_frostcrow(냉기·동결·산산조각) + asc_lia_frostwing · azel_dawnblood(빌린 시간) + asc_azel_lullaby
import { K, procStrike, mark, markOf, unmark, icd, slowEnemy, shieldAdd, shieldAbsorb, shieldOf, perkState } from './class_perks.js';
import { skillVal } from '../data/skills.js';

const TAU = Math.PI * 2;
const ADD = 'lighter';
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const isBoss = (e) => e?.kind === 'boss';
const maxHp = (p) => p?.stats?.hp ?? 1;
const nowOf = (w) => w?.time ?? 0;
const circ = (x, y, r) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
const hpMaxOf = (e) => e?.stats?.maxHp ?? e?.maxHp ?? e?.stats?.hp ?? e?.hp ?? 1;
const lowQ = (w) => (w?.fx?.quality ?? 1) < 0.6;
const outBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
/** 영웅 게이지 높이: 히트박스 위쪽(p.y)에서 이만큼 위 — 퍼펫 그림(머리·후광·날개)에 가리지 않게 (PerkLayer z 9 < 영웅 z 10) */
const METER_DY = 38;
/** 발동 횟수 (QA) */
export const STATS_C = { procs: {} };
const count = (k) => { STATS_C.procs[k] = (STATS_C.procs[k] ?? 0) + 1; };

// ─────────────────────────── 공용 도우미 (훅 안에서만 부른다) ───────────────────────────
function sfx(w, name, o) { try { w?.game?.audio?.sfx?.(name, o); } catch { /* 소리 없음 */ } }
function callout(w, x, y, text, color) { try { w?.fx?.callout?.(x, y, text, { color }); } catch { /* 연출 없음 */ } }
function shake(w, m, t) { w?.camera?.shake?.(m, t); }
/**
 * 특성 부가 타격 (proc). o: { mv, type, element, kb, stun, tags, hitstop, hitId, dir, launch } + dmgColor(숫자 색).
 * 숫자 색이 있으면 K.uHit(playerStrike + 공격 객체)로 같은 proc 공격을 친다 (procAtk 는 dmgColor 를 옮기지 않는다) → 맞힌 수
 */
function strike(w, p, rect, o) {
  if (!o.dmgColor || typeof K.uHit !== 'function') return procStrike(w, p, rect, o);
  return K.uHit(w, p, o.mv ?? 1, {
    rect, type: o.type ?? 'phys', element: o.element ?? null, kb: o.kb ?? [80, -60], hitstop: Math.min(0.08, Math.max(0, o.hitstop ?? 0)),
    shake: o.shake ?? 0, tags: o.tags ?? ['melee'], proc: true, crit: 0, mult: 1, stun: o.stun, dmgColor: o.dmgColor, breakWalls: false,
    launch: !!o.launch, dir: o.dir ?? p.facing, hitId: o.hitId ?? K.nid('pc'),
  }) || 0;
}
/** 살아 있고 맞힐 수 있는 적·보스인가 */
function liveFoe(e, w) {
  return (e.kind === 'enemy' || e.kind === 'boss') && !e.dead && !e.hidden && !(e.dying > 0) && !e.invuln && !e.pendingBoss && !w.inUnrevealedFake?.(e);
}
/** (x, y) 에서 몸통 상자까지 거리가 r 이하인 적마다 fn(e) — 배열을 만들지 않는다 */
function forFoes(w, x, y, r, fn, skip = null) {
  const L = w?.entities;
  if (!L) return 0;
  let n = 0;
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (e === skip || !liveFoe(e, w)) continue;
    const nx = x < e.x ? e.x : x > e.x + e.w ? e.x + e.w : x, ny = y < e.y ? e.y : y > e.y + e.h ? e.y + e.h : y;
    const dx = nx - x, dy = ny - y;
    if (dx * dx + dy * dy > r * r) continue;
    n++;
    fn(e);
  }
  return n;
}
/** 중심 거리 r 안에서 가장 가까운 적 (없으면 null) */
function nearestFoe(w, x, y, r, skip = null) {
  const L = w?.entities;
  if (!L) return null;
  let best = null, bd = r * r;
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (e === skip || !liveFoe(e, w)) continue;
    const dx = e.cx - x, dy = e.cy - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// 가까운 순 max 명 (다시 쓰는 배열 FOES[0..k-1]; 다음 호출 전에 읽는다)
const FOES = [], FOE_D = [];
function nearestN(w, x, y, r, max) {
  const L = w?.entities;
  let k = 0;
  if (L) {
    const r2 = r * r;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (!liveFoe(e, w)) continue;
      const dx = e.cx - x, dy = e.cy - y, d = dx * dx + dy * dy;
      if (d > r2) continue;
      let j;
      if (k < max) j = k++;
      else if (d < FOE_D[max - 1]) j = max - 1;
      else continue;
      while (j > 0 && FOE_D[j - 1] > d) { FOES[j] = FOES[j - 1]; FOE_D[j] = FOE_D[j - 1]; j--; }
      FOES[j] = e; FOE_D[j] = d;
    }
  }
  for (let i = k; i < FOES.length; i++) FOES[i] = null;
  return k;
}
/** 원형 proc 폭발: 판정 + 캐시 빛 두 겹 + 빛 고리 + 파티클 n (≤ 10) × 품질 → 맞힌 수 */
function blast(w, p, x, y, r, o, c1, c2, n = 8) {
  const hits = strike(w, p, circ(x, y, r), o);
  if (typeof K.fx === 'function') K.fx(w, {
    x: x - r * 1.4, y: y - r * 1.4, w: r * 2.8, h: r * 2.8, life: 0.4, z: 12,
    draw(ctx, e) {
      const k = e.k, kk = 1 - (1 - Math.min(1, k * 3)) ** 3, a = 1 - k;
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x, y, r * (0.7 + kk * 0.8), c1, 0.8 * a);
      K.glow(ctx, x, y, r * 0.5 * (1 - k * 0.5), c2, a);
      ctx.globalAlpha = a * 0.85; ctx.strokeStyle = c2; ctx.lineWidth = 6 * a + 1;
      ctx.beginPath(); ctx.arc(x, y, r * (0.3 + kk * 0.95), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    },
    light(L, e) { L.add(x, y, r * 2.4, c1, 1.2 * (1 - e.k)); },
  });
  if (n > 0) w.fx.burst(o.element === 'fire' ? 'fire' : o.element === 'holy' ? 'holy' : o.element === 'ice' ? 'ice' : 'magic', x, y, Math.min(10, n), { speed: r * 2.2, color: c1 });
  return hits;
}
/** 캐시 빛·판정 문구 스프라이트를 미리 굽는다 (prewarm: 방 입장 때 한 번 — 싸움 도중 캔버스 생성 없음) */
function warm(w, cols, calls) {
  for (const c of cols) K.glowSprite?.(c);
  if (calls) for (let i = 0; i < calls.length; i += 2) callout(w, -99999, -99999, calls[i], calls[i + 1]);
}
/** 머리 위 작은 마름모 하나 (어두운 테두리: 밝은 배경에서도 읽히게) */
function pip(ctx, x, y, s, col, a) {
  ctx.globalAlpha = a; ctx.fillStyle = col; ctx.strokeStyle = '#140610'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.globalAlpha = 1;
}

// ─────────────────────────── 투사체 그림 (그라디언트 없음) ───────────────────────────
/** 표창 (닌자 대시) */
function shurikenR(ctx, pr) {
  const s = 12 * pr.scale;
  ctx.globalCompositeOperation = ADD; K.glow(ctx, 0, 0, s * 1.8, '#b0c0ff', 0.4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(pr.rot);
  ctx.fillStyle = '#d8dcf0'; ctx.strokeStyle = '#0c0a12'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const t = i * Math.PI / 2;
    ctx.lineTo(Math.cos(t) * s, Math.sin(t) * s);
    ctx.lineTo(Math.cos(t + Math.PI / 4) * s * 0.28, Math.sin(t + Math.PI / 4) * s * 0.28);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c0142a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.18, 0, TAU); ctx.fill();
}
/** 금빛 단검 (칼춤의 여왕: 돌 때는 접선 방향, 날아갈 때는 속도 방향) */
function daggerR(ctx, pr) {
  const s = pr.scale;
  const a = pr.behavior === 'orbit' ? (pr.orbitA ?? 0) + (pr.orbitSpeed < 0 ? -Math.PI / 2 : Math.PI / 2) : Math.atan2(pr.vy, pr.vx);
  ctx.rotate(a);
  ctx.globalCompositeOperation = ADD;
  K.glow(ctx, 4 * s, 0, 18 * s, '#ffd84a', 0.55);
  ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffe070';
  ctx.beginPath(); ctx.moveTo(-30 * s, 0); ctx.lineTo(-4 * s, -3 * s); ctx.lineTo(-4 * s, 3 * s); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffe7a0'; ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(18 * s, 0); ctx.lineTo(0, -4 * s); ctx.lineTo(-4 * s, 0); ctx.lineTo(0, 4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(16 * s, 0); ctx.lineTo(1 * s, -1.2 * s); ctx.lineTo(1 * s, 0.4 * s); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a0a2a'; ctx.fillRect(-12 * s, -2 * s, 8 * s, 4 * s);
}
/** 깃털 하나 (원점 중심, +x 방향). col = 빛, c2 = 깃 (빛·어둠·서리) */
function featherAt(ctx, s, col, c2) {
  ctx.globalCompositeOperation = ADD; K.glow(ctx, 0, 0, s * 1.4, col, 0.45);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = c2; ctx.strokeStyle = col; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.quadraticCurveTo(0, -s * 0.36, -s, -s * 0.1); ctx.lineTo(-s * 0.78, 0); ctx.lineTo(-s, s * 0.1); ctx.quadraticCurveTo(0, s * 0.36, s, 0); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.globalAlpha *= 0.85; ctx.beginPath(); ctx.moveTo(-s * 1.1, 0); ctx.lineTo(s, 0); ctx.stroke();
}
function featherLR(ctx, pr) { ctx.rotate(Math.atan2(pr.vy, pr.vx)); featherAt(ctx, 15 * pr.scale, '#fff2b0', '#fff8e0'); }
function featherDR(ctx, pr) { ctx.rotate(Math.atan2(pr.vy, pr.vx)); featherAt(ctx, 15 * pr.scale, '#b060ff', '#3a1a5a'); }

// ─────────────────────────── C9 담피르: 안개 대시 통과 ───────────────────────────
let MIST_ID = 0;
function mistPass(w, p, st, N) {
  const x0 = Math.min(st.mistX, p.cx) - p.w / 2, x1 = Math.max(st.mistX, p.cx) + p.w / 2, y0 = p.y + 4, y1 = p.y + p.h;
  st.mistX = p.cx;
  const L = w.entities;
  for (let i = 0; i < L.length && st.mistN < N.max; i++) {
    const e = L[i];
    if (!liveFoe(e, w) || e === st.mistA || e === st.mistB || e === st.mistC) continue;
    if (e.x > x1 || e.x + e.w < x0 || e.y > y1 || e.y + e.h < y0) continue;
    if (st.mistN === 0) st.mistA = e; else if (st.mistN === 1) st.mistB = e; else st.mistC = e;
    st.mistN++;
    const n = strike(w, p, { x: e.cx - 2, y: e.cy - 2, w: 4, h: 4 }, { mv: N.mvPct / 100, type: 'mag', element: 'dark', kb: [60, -80], dmgColor: '#c070ff', hitId: st.mistHid });
    if (!n) continue;
    count('char:azel.pass');
    p.heal(maxHp(p) * N.healPct / 100, false);
    w.fx.slash(e.cx, e.cy - 6, p.facing > 0 ? -0.5 : Math.PI + 0.5, { radius: 44, arc: 1.8, width: 12, color: '#c070ff', life: 0.16 });
    w.fx.burst('blood', e.cx, e.cy, 3, { speed: 140, color: '#ff2a50' });
    sfx(w, 'slash', { vol: 0.35, pitch: 1.35 });
  }
}

// ─────────────────────────── 그림자 화신: 분신 ───────────────────────────
/** 그림자 분신 실루엣 (벡터: 두건·몸통·다리·단검·스카프; 캐시 빛 하나). h = 영웅 키, lunge 0..1 = 휘두름 */
function drawShade(ctx, x, b, f, a, lunge, h, t) {
  const s = h / 72, lean = f * lunge * 7 * s;
  ctx.globalAlpha = a * 0.45; ctx.fillStyle = '#000000';
  ctx.beginPath(); ctx.ellipse(x, b, 20 * s, 4 * s, 0, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = ADD; ctx.globalAlpha = 1;
  K.glow(ctx, x + lean, b - 38 * s, 50 * s, '#7a3aff', a * 0.55);
  ctx.globalCompositeOperation = 'source-over';
  // 스카프 (뒤로 나부낀다)
  const fl = Math.sin(t * 9) * 4 * s;
  ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#3a1a6a'; ctx.lineWidth = 4 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - f * 3 * s + lean, b - 58 * s); ctx.quadraticCurveTo(x - f * 16 * s, b - 60 * s + fl, x - f * 30 * s, b - 50 * s - fl); ctx.stroke();
  // 다리
  ctx.strokeStyle = '#120820'; ctx.lineWidth = 6 * s;
  ctx.beginPath(); ctx.moveTo(x + f * 3 * s + lean * 0.5, b - 30 * s); ctx.lineTo(x + f * (9 + 6 * lunge) * s, b - 1 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - f * 3 * s + lean * 0.5, b - 30 * s); ctx.lineTo(x - f * 10 * s, b - 1 * s); ctx.stroke();
  // 몸통·두건
  ctx.fillStyle = '#120820'; ctx.strokeStyle = '#b060ff'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - 9 * s + lean, b - 54 * s); ctx.lineTo(x + 9 * s + lean, b - 54 * s);
  ctx.lineTo(x + 7 * s + lean * 0.5, b - 29 * s); ctx.lineTo(x - 7 * s + lean * 0.5, b - 29 * s); ctx.closePath();
  ctx.fill(); ctx.globalAlpha = a * 0.75; ctx.stroke(); ctx.globalAlpha = a * 0.9;
  ctx.beginPath(); ctx.arc(x + lean + f * 1.5 * s, b - 63 * s, 8.5 * s, 0, TAU); ctx.fill();
  ctx.globalAlpha = a * 0.75; ctx.stroke(); ctx.globalAlpha = a * 0.9;
  ctx.beginPath(); ctx.moveTo(x - f * 7 * s + lean, b - 68 * s); ctx.lineTo(x - f * 15 * s + lean, b - 60 * s); ctx.lineTo(x - f * 4 * s + lean, b - 58 * s); ctx.closePath(); ctx.fill();
  // 팔·단검
  const hx = x + lean + f * (12 + 16 * lunge) * s, hy = b - (46 - 6 * lunge) * s;
  ctx.strokeStyle = '#120820'; ctx.lineWidth = 4.5 * s;
  ctx.beginPath(); ctx.moveTo(x + lean + f * 5 * s, b - 50 * s); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = '#e0c8ff'; ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + f * 15 * s, hy - 4 * s + 6 * lunge * s); ctx.stroke();
  // 눈
  ctx.globalAlpha = a; ctx.fillStyle = '#e8d0ff';
  ctx.fillRect(x + lean + f * 3 * s - 1.5 * s, b - 65 * s, 3 * s, 1.6 * s);
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
}
function drawClone(ctx, e) {
  const d = e.d, rem = e.life - e.lt, a = Math.min(1, e.lt / 0.12) * clamp01(rem / 0.35);
  if (a <= 0.01) return;
  const lunge = clamp01(1 - (e.lt - d.sw) / 0.2);
  drawShade(ctx, d.x, d.b, d.face, a * 0.85, lunge, d.h, e.lt);
}
function cloneLight(L, e) { L.add(e.d.x, e.d.b - e.d.h * 0.5, 120, '#7a3aff', 0.6 * clamp01((e.life - e.lt) / 0.35)); }
function spawnClone(w, p, N) {
  const st = perkState(p), L = (st.clones ??= []);
  for (let i = L.length - 1; i >= 0; i--) if (L[i].dead) L.splice(i, 1);
  const cap = lowQ(w) ? N.maxLow : N.max;
  while (L.length >= cap) { const o = L.shift(); o.life = Math.min(o.life, o.lt + 0.15); }
  count('lia_umbra.clone');
  const d = { x: p.cx, b: p.bottom, face: p.facing, sw: -9, h: p.h };
  L.push(K.fx(w, { life: N.t, z: 9, d, x: d.x - 70, y: d.b - p.h - 30, w: 140, h: p.h + 40, draw: drawClone, light: cloneLight }));
  w.fx.burst('dark', d.x, d.b - p.h * 0.5, 5, { speed: 90, color: '#3a1a5a' });
}
function cloneSwing(w, p, mv, N) {
  const L = perkState(p).clones;
  if (!L || !L.length) return;
  const b = mv.box, reach = 1 + (p.stats.reach ?? 0) / 100, bw = b.w * (b.x >= 0 ? reach : 1), hid = 'um' + p.curHitId;
  const sl = mv.slash, sa = sl?.angle ?? 0;
  for (let i = 0; i < L.length; i++) {
    const c = L[i];
    if (c.dead || !c.started || c.lt >= c.life - 0.12) continue;
    const d = c.d, e = nearestFoe(w, d.x, d.b - d.h * 0.5, N.r);
    if (e) d.face = Math.sign(e.cx - d.x) || d.face;
    const x = d.face > 0 ? d.x + b.x : d.x - b.x - bw;
    const n = strike(w, p, { x, y: d.b + b.y, w: bw, h: b.h }, { mv: (mv.mv ?? 1) * N.mvPct / 100, element: 'dark', kb: [100, -60], dmgColor: '#c080ff', hitId: hid, dir: d.face });
    d.sw = c.lt;
    w.fx.slash(d.x + d.face * 24, d.b - d.h * 0.55, d.face > 0 ? sa : Math.PI - sa, { radius: sl?.r ?? 60, arc: sl?.arc ?? 1.6, width: sl?.width ?? 14, color: '#b060ff', life: 0.13 });
    count(n ? 'lia_umbra.hit' : 'lia_umbra.swing');
  }
}

// ─────────────────────────── 칼춤의 여왕: 도는 칼날 ───────────────────────────
function queenSpawn(w, p, st, N) {
  const L = (st.qd ??= []);
  for (let i = L.length - 1; i >= 0; i--) if (L[i].dead) L.splice(i, 1);
  while (L.length + N.n > N.max) { const o = L.shift(); o.dead = true; w.fx.burst('spark', o.cx, o.cy, 2, { color: '#ffd84a' }); }
  // 도는 칼날은 공격 하나를 함께 쓴다 (같은 hitId): 같은 적은 칼날 수와 상관없이 0.4초마다 한 번 (숫자 ≤ 2.5/초)
  if (!st.qAtk || st.qAtkP !== p) { st.qAtk = K.atk(p, { mv: N.mvPct / 100, rehit: N.rehit, hitId: K.nid('bq'), kb: [60, -40], hitstop: 0, shake: 0, tags: ['melee'], proc: true, dmgColor: '#ffe070', mult: 1, breakWalls: false }); st.qAtkP = p; }
  const dir = L.length ? Math.sign(L[0].orbitSpeed) || p.facing : p.facing;
  for (let i = 0; i < N.n; i++) {
    L.push(K.shoot(w, p, { x: p.cx, y: p.cy, w: 22, h: 22, scale: 1, behavior: 'orbit', orbitA: 0, orbitR: N.orbitR, orbitSpeed: N.spin * dir, life: N.t,
      pierce: 999, collideWalls: false, render: daggerR, color: '#ffd84a', proc: true, attack: st.qAtk }));   // proc: 표시만 (공격 객체 qAtk 가 proc)
  }
  // 고르게 다시 놓고 모두 4초로 갱신
  const a0 = L.length > N.n ? (L[0].orbitA ?? 0) : 0, k = L.length;
  for (let i = 0; i < k; i++) { const d = L[i]; d.orbitA = a0 + i * TAU / k; d.life = N.t; d.maxLife = N.t; }
  count('lia_bladequeen.spawn');
  w.fx.ring(p.cx, p.cy, { color: '#ffd84a', r0: 20, r1: N.orbitR + 10, life: 0.3, width: 3 });
  sfx(w, 'dagger', { vol: 0.5, pitch: 1.6 });
}
function queenRelease(w, p, st, N) {
  const L = st.qd;
  if (!L || !L.length) return;
  let n = 0;
  for (let i = 0; i < L.length; i++) {
    const d = L[i];
    if (d.dead) continue;
    const a = d.orbitA ?? 0;
    d.behavior = 'straight'; d.vx = Math.cos(a) * N.outSpeed; d.vy = Math.sin(a) * N.outSpeed;
    d.life = N.outLife; d.maxLife = N.outLife; d.pierce = N.outPierce; d.hits = 0; d.collideWalls = true; d.trail = 'gold'; d.trailRate = 0.04;
    d.attack = K.atk(p, { mv: N.outPct / 100, kb: [200, -160], hitstop: 0, shake: 0, tags: ['melee'], proc: true, dmgColor: '#ffe070', mult: 1, breakWalls: false });
    n++;
  }
  L.length = 0;
  if (!n) return;
  count('lia_bladequeen.release');
  w.fx.ring(p.cx, p.cy, { color: '#ffe070', r0: 30, r1: 120, life: 0.3, width: 4 });
  sfx(w, 'slash_heavy', { vol: 0.6, pitch: 1.5 });
}

// ─────────────────────────── 영혼 수확자 ───────────────────────────
function addSouls(w, p, e, n, N) {
  const st = perkState(p), was = st.souls ?? 0;
  st.souls = Math.min(N.max, was + n);
  if (st.souls === was) return;
  count('lia_soulreaper.soul');
  w.fx.burst('soul', e.cx, e.cy, 3, { speed: 70 });
  w.fx.emit('soul', p.cx, p.y + 10, { speed: 40, color: '#6affb0' });
  if (st.souls >= N.max) {
    w.fx.ring(p.cx, p.cy, { color: '#6affb0', r0: 16, r1: 70, life: 0.4, width: 4 });
    sfx(w, 'ghost', { vol: 0.5, pitch: 1.2 });
  }
}
function scythe(w, p, st, N) {
  count('lia_soulreaper.scythe');
  const cx = p.cx, cy = p.cy - 8, f = p.facing, R = N.r, rc = circ(cx, cy, R);
  const hs = nowOf(w) - (st.scT ?? -99) >= N.gap ? N.hitstop : 0;
  st.scT = nowOf(w);
  const A0 = -2.62, A1 = 2.62;
  K.fx(w, {
    life: N.life, z: 12, x: cx - R * 1.3, y: cy - R * 1.3, w: R * 2.6, h: R * 2.6,
    atk: K.atk(p, { mv: N.mvPct / 100, element: 'dark', kb: [320, -380], hitstop: hs, shake: 6, tags: ['melee'], proc: true, dmgColor: '#6affb0', mult: 1, breakWalls: false }), win: [0.1, 0.6],
    rect() { return rc; },
    draw(ctx, e) {
      const u = 1 - (1 - clamp01(e.lt / (N.life * 0.7))) ** 3, t = A0 + (A1 - A0) * u, a = 1 - clamp01((e.k - 0.6) / 0.4);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(f, 1);
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, 0, 0, R * 0.9, '#6affb0', 0.3 * a);
      ctx.lineCap = 'butt';
      const tail = Math.max(A0, t - 1.8);
      for (let i = 0; i < 8; i++) {
        const t0 = tail + (t - tail) * i / 8, t1 = tail + (t - tail) * (i + 1) / 8 + 0.01;
        ctx.globalAlpha = a * (i + 1) / 8 * 0.55; ctx.strokeStyle = '#6affb0'; ctx.lineWidth = 8 + i * 4;
        ctx.beginPath(); ctx.arc(0, 0, R * 0.8, t0, t1); ctx.stroke();
      }
      ctx.globalAlpha = a * 0.9; ctx.strokeStyle = '#e8fff4'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.95, Math.max(A0, t - 0.9), t); ctx.stroke();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.rotate(t - 0.3); K.scytheShape?.(ctx, R * 0.78, a);
      ctx.restore();
    },
    light(L, e) { L.add(cx, cy, R * 1.8, '#6affb0', 1.2 * (1 - e.k)); },
  });
  w.fx.burst('soul', cx, cy, 10, { speed: R * 1.6 });
  callout(w, cx, p.y - 46, '망자의 낫!', '#6affb0');
  shake(w, 6, 0.25);
  sfx(w, 'ghost', { vol: 0.7 }); sfx(w, 'slash_heavy', { vol: 0.8, pitch: 0.8 });
}

// ─────────────────────────── 밤의 군주: 피안개 ───────────────────────────
function cloudTick(w, p, d, N) {
  const hid = 'nlc' + Math.floor(nowOf(w) / N.tickT);   // 시간 칸마다 하나: 겹친 피안개도 같은 적은 한 칸에 한 번
  const n = strike(w, p, d.rc, { mv: N.mvPct / 100, type: 'mag', element: 'dark', kb: [0, -30], dmgColor: '#ff4a6a', hitId: hid });
  if (!lowQ(w)) w.fx.emit('bloodmist', d.x + ((d.n * 37) % 60) - 30, d.y + ((d.n * 23) % 40) - 20, { speed: 30 });
  if (!n || p.dead) return;
  count('azel_nightlord.tick');
  const st = perkState(p), H = maxHp(p), cap = H * N.healCapPct / 100, tn = nowOf(w);
  st.nlB = Math.min(cap, (st.nlB ?? cap) + Math.max(0, tn - (st.nlBt ?? tn)) * cap);   // 초당 최대 2%: 1초에 cap 만큼 차는 양동이
  st.nlBt = tn;
  const amt = Math.min(n * H * N.healPct / 100, st.nlB);
  if (amt > 0) { st.nlB -= amt; p.heal(amt, false); w.fx.emit('blood', d.x, d.y, { speed: 120, color: '#ff2a50' }); }
}
function drawCloud(ctx, e) {
  const d = e.d, a = Math.min(1, e.lt / 0.15) * clamp01((e.life - e.lt) / 0.4), R = d.r;
  if (a <= 0.01) return;
  K.glow(ctx, d.x, d.y, R * 1.25, '#3a0010', 0.75 * a);
  ctx.globalCompositeOperation = ADD;
  K.glow(ctx, d.x, d.y, R * 0.9, '#8a0a1e', 0.55 * a);
  ctx.strokeStyle = '#ff2a50'; ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const r = R * (0.35 + i * 0.17), t0 = e.lt * (1.6 + i * 0.4) * (i & 1 ? -1 : 1) + i * 1.3;
    ctx.globalAlpha = a * (0.45 - i * 0.07);
    ctx.beginPath(); ctx.arc(d.x, d.y, r, t0, t0 + 1.9); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function nightCloud(w, p, x, y, N) {
  const st = perkState(p), L = (st.nlc ??= []);
  for (let i = L.length - 1; i >= 0; i--) if (L[i].dead) L.splice(i, 1);
  while (L.length >= N.max) { const o = L.shift(); o.life = Math.min(o.life, o.lt + 0.2); }
  const ticks = Math.floor(N.t / N.tickT + 1e-6);
  count('azel_nightlord.cloud');
  L.push(K.fx(w, {
    life: N.t, z: 8, x: x - N.r * 1.4, y: y - N.r * 1.4, w: N.r * 2.8, h: N.r * 2.8, d: { n: 0, x, y, r: N.r, rc: circ(x, y, N.r) },
    tick(e, ww) { while (e.d.n < ticks && e.lt >= (e.d.n + 1) * N.tickT) { e.d.n++; cloudTick(ww, p, e.d, N); } },
    draw: drawCloud,
    light(Lt, e) { Lt.add(x, y, N.r * 2, '#c0103a', 0.7 * clamp01((e.life - e.lt) / 0.4)); },
  }));
  w.fx.burst('bloodmist', x, y, 4, { speed: 60 });
}

// ─────────────────────────── 혈제: 피의 창 ───────────────────────────
function bloodSpike(w, p, e, delay, mv, N) {
  const x = e.cx, base = K.groundAt?.(w, e.cx, e.bottom - 4) ?? e.bottom, h = N.h, wd = N.wd, seed = ((e.cx * 7) % 10) / 10;
  const R = { x: 0, y: 0, w: 0, h: 0 };
  K.fx(w, {
    delay, life: 0.62, z: 9, x: x - wd * 2, y: base - h - 20, w: wd * 4, h: h + 30, win: [0, 0.3],
    atk: K.atk(p, { mv, element: 'dark', kb: [60, -520], launch: true, hitstop: 0, shake: 2, tags: ['melee'], proc: true, dmgColor: '#ff4a5a', mult: 1, breakWalls: false }),
    rect(fx) { const up = outBack(clamp01(fx.lt / 0.1)); R.x = x - wd * 0.8; R.y = base - h * up; R.w = wd * 1.6; R.h = h * up; return R; },
    start(fx, ww) { ww.fx.burst('blood', x, base - 6, 3, { angle: -Math.PI / 2, spread: 0.8, speed: 280 }); ww.fx.ring(x, base - 4, { color: '#ff1a2a', r0: 6, r1: 40, life: 0.25, width: 3 }); },
    draw(ctx, fx) {
      const up = outBack(clamp01(fx.lt / 0.1)), fade = 1 - clamp01((fx.k - 0.6) / 0.4), sink = fx.k > 0.6 ? (fx.k - 0.6) / 0.4 * h * 0.5 : 0;
      ctx.globalAlpha = fade;
      K.spike?.(ctx, x - wd * 0.8, base + sink, h * 0.5 * up, wd * 0.55, '#ff1a2a', '#5a0010', '#ffb0b8', 1 - seed);
      K.spike?.(ctx, x, base + sink, h * up, wd, '#ff1a2a', '#5a0010', '#ffb0b8', seed);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = ADD; K.glow(ctx, x, base - h * 0.2 * up, h * 0.6, '#ff1a2a', 0.3 * fade); ctx.globalCompositeOperation = 'source-over';
    },
    light(L, fx) { L.add(x, base - h * 0.5, h * 1.4, '#ff1a2a', 0.7 * (1 - fx.k)); },
  });
}

// ─────────────────────────── 태양의 검: 한낮의 일격 ───────────────────────────
function noon(w, p, st, N) {
  count('azel_solaris.noon');
  const f = p.facing, x0 = p.cx + f * 18, y = p.bottom - N.yOff, x1 = x0 + f * N.len;
  const rc = { x: Math.min(x0, x1), y: y - N.h / 2, w: N.len, h: N.h };
  const hs = nowOf(w) - (st.noonT ?? -99) >= N.gap ? N.hitstop : 0;
  st.noonT = nowOf(w);
  K.fx(w, {
    life: N.life, z: 12, x: rc.x - 60, y: rc.y - 80, w: rc.w + 120, h: rc.h + 160, win: [0, N.win],
    atk: K.atk(p, { mv: N.mvPct / 100, element: 'holy', kb: [260, -200], hitstop: hs, shake: 5, tags: ['melee'], proc: true, dmgColor: '#ffc040', mult: 1, breakWalls: false }),
    rect() { return rc; },
    draw(ctx, e) {
      const a = 1 - e.k, th = N.h * 0.55 * (1 - e.k * 0.5) * Math.min(1, e.lt / 0.04 + 0.3);
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x0, y, 90 * a + 20, '#ffc040', 0.75 * a);
      K.beamH(ctx, x0, x1, y, th * 1.4, '#ffc040', 0.55 * a, '#fff8e0');
      K.beamH(ctx, x0, x1, y, th * 0.55, '#fff8e0', a, '#ffffff');
      K.glow(ctx, x0, y, 34, '#ffffff', a);
      ctx.globalCompositeOperation = 'source-over';
    },
    light(L, e) { L.add((x0 + x1) / 2, y, N.len * 0.7, '#ffc040', 1.4 * (1 - e.k)); },
  });
  for (let i = 0; i < 8; i++) w.fx.emit('holy', x0 + f * (i + 0.5) * N.len / 8, y + ((i * 29) % 30) - 15, { speed: 90, color: '#ffd070' });
  callout(w, p.cx, p.y - 46, '한낮의 일격!', '#ffd070');
  shake(w, 7, 0.3);
  sfx(w, 'holy', { vol: 0.9, pitch: 0.8 }); sfx(w, 'thunderclap', { vol: 0.4, pitch: 1.4 });
}

// ─────────────────────────── 서리 까마귀: 냉기·동결 ───────────────────────────
/** 냉기 add 중첩. 5중첩이면 일반 적은 동결(같은 적 5초에 한 번), 보스는 감속(10초에 한 번) */
function chill(w, p, e, add, N) {
  if (!e || e.dead || e.kind === 'prop' || (e.kind !== 'enemy' && e.kind !== 'boss')) return;
  const n = mark(e, 'chill', N.t, add, N.max);
  if (n < N.max) return;
  if (isBoss(e)) {
    if (!icd(e, 'pkFrzB', N.bossIcd, w)) return;
    slowEnemy(e, 1 - N.bossSlowPct / 100, N.bossT, w);
    mark(e, 'frost', N.bossT, 1, 1);
    unmark(e, 'chill');
    count('lia_frostcrow.bossSlow');
  } else {
    if (!icd(e, 'pkFrz', N.frzIcd, w)) return;
    e.stun = Math.max(e.stun ?? 0, N.frzT);
    if (e.vx) e.vx *= 0.2;
    mark(e, 'frozen', N.frzT, 1, 1);
    unmark(e, 'chill');
    count('lia_frostcrow.freeze');
  }
  if (icd(p, 'pkFrzFx', 0.25, w)) {
    w.fx.burst('ice', e.cx, e.cy, 6, { speed: 160 });
    w.fx.ring(e.cx, e.cy, { color: '#bff4ff', r0: 8, r1: Math.max(e.w, e.h) * 0.8, life: 0.3, width: 3 });
    callout(w, e.cx, e.y - 20, '동결!', '#bff4ff');
    sfx(w, 'ice', { vol: 0.55, pitch: 1.2 });
  }
}
function shatter(w, p, e, N) {
  count('lia_frostcrow.shatter');
  const x = e.cx, y = e.cy;
  strike(w, p, circ(x, y, N.shR), { mv: N.shMvPct / 100, element: 'ice', kb: [220, -260], dmgColor: '#bff4ff' });
  forFoes(w, x, y, N.shR, (o) => chill(w, p, o, N.shAdd, N), e);
  if (icd(p, 'pkShFx', 0.25, w)) {
    w.fx.burst('ice', x, y, 10, { speed: 320 });
    w.fx.ring(x, y, { color: '#e8fbff', r0: 10, r1: N.shR, life: 0.3, width: 5 });
    if (icd(p, 'pkShCall', 0.6, w)) callout(w, x, y - 30, '산산조각!', '#e8fbff');
    sfx(w, 'ice', { vol: 0.8, pitch: 0.8 }); sfx(w, 'break_wall', { vol: 0.35, pitch: 1.6 });
  }
}

// ─────────────────────────── 여명의 혈족: 빌린 시간 ───────────────────────────
function dawnBurst(w, p, N) {
  count('azel_dawnblood.saved');
  p.hp = Math.max(p.hp, Math.ceil(maxHp(p) * N.backPct / 100));
  blast(w, p, p.cx, p.cy, N.r, { mv: N.mvPct / 100, element: 'holy', kb: [320, -380], tags: ['melee'], dmgColor: '#ffd070' }, '#ffb060', '#fff2d0', 10);
  callout(w, p.cx, p.y - 46, '여명!', '#fff2d0');
  w.game?.flash?.('#fff2d0', 0.35, 4);
  shake(w, 8, 0.3);
  sfx(w, 'holy', { vol: 0.9 }); sfx(w, 'heal', { vol: 0.6 });
}

// ─────────────────────────── 비전 액티브 도우미 ───────────────────────────
// 서리 깃털 (동결의 날개): 스스로 쫓는 SkillFx (반경 500 안의 적을 고른다 — 투사체 'homing' 은 600 고정이라 직접 조향)
function featherTick(e, w, dt) {
  const d = e.d;
  if (e.lt > d.delay) {
    let tg = d.tgt;
    if ((!tg || tg.dead || tg.dying > 0) && icd(d, 'rt', 0.2, w)) tg = d.tgt = nearestFoe(w, d.x, d.y, d.R);
    if (tg && !tg.dead) {
      const want = Math.atan2(tg.cy - d.y, tg.cx - d.x);
      let cur = Math.atan2(d.vy, d.vx), df = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
      const mt = d.turn * dt;
      cur += df < -mt ? -mt : df > mt ? mt : df;
      const sp = Math.min(d.speed, Math.hypot(d.vx, d.vy) + d.speed * 3 * dt);
      d.vx = Math.cos(cur) * sp; d.vy = Math.sin(cur) * sp;
    }
  }
  d.x += d.vx * dt; d.y += d.vy * dt;
  e.x = d.x - 30; e.y = d.y - 30;
}
function featherRect(e) { const d = e.d, r = d.rc; r.x = d.x - 10; r.y = d.y - 10; return r; }
function featherHit(e) { e.life = Math.min(e.life, e.lt + 0.02); }
function featherDraw(ctx, e) {
  const d = e.d, a = Math.min(1, e.lt / 0.08) * clamp01((e.life - e.lt) / 0.15);
  if (a <= 0.01) return;
  ctx.translate(d.x, d.y); ctx.rotate(Math.atan2(d.vy, d.vx));
  ctx.globalAlpha = a;
  featherAt(ctx, 16, '#bff4ff', '#e8fbff');
  ctx.globalAlpha = 1;
}
// 아멜리아의 자장가: 맞은 적의 3초 지속 피해 (proc, 0.5초마다)
function dawnDot(w, p, e, mvd, A) {
  mark(e, 'dawn', A.dotT, 1, 1);
  const ticks = Math.round(A.dotT / A.tickT);
  K.fx(w, {
    life: A.dotT + 0.02, z: 9, d: { n: 0 },
    tick(fx, ww) {
      if (e.dead || e.dying > 0) { fx.life = Math.min(fx.life, fx.lt); return; }
      while (fx.d.n < ticks && fx.lt >= (fx.d.n + 1) * A.tickT) {
        fx.d.n++;
        strike(ww, p, { x: e.x - 6, y: e.y - 6, w: e.w + 12, h: e.h + 12 }, { mv: mvd, element: 'holy', kb: [0, -20], tags: ['skill'], dmgColor: '#ffb060' });
        ww.fx.emit('holy', e.cx, e.cy - e.h * 0.2, { speed: 70, color: '#ffb060' });
      }
    },
  });
}
// 비전 액티브 수치 (레벨과 무관; 레벨별 값은 skills_asc.js v)
const ACT_N = {
  frostwing: { dist: 300, dashT: 0.18, iframes: 0.25, step: 20, chill: 2, R: 500, speed: 700, life: 1.4, delay: 0.2, turn: 7 },
  lullaby: { costPct: 10, r: 180, arcDeg: 300, dotT: 3, tickT: 0.5, healPct: 150, maxDot: 8 },
};

const RET_FRZ = { mult: 1 }, RET_DAWN = { mult: 1 };   // onAttack 반환 (다시 쓰는 객체: perkAttack 이 곧바로 읽는다)

// ═════════════════════════════════════════ 항목 ═════════════════════════════════════════
export const PERKS_C = {
  // ═════════════ 리아 ═════════════
  // C8 닌자 (1차 → 그림자 군주·카게로우와 그 초월): 대시 거리 +30% (속도로; 무적 시간은 그대로) · 대시할 때 표창 2개 (0.6초에 한 번)
  lia_ninja: {
    N: { dashPct: 30, n: 2, mvPct: 30, spread: 0.08, icd: 0.6, speed: 1000, life: 0.5, pierce: 2 },
    prewarm(w) { warm(w, ['#b0c0ff'], null); },
    dashMul() { return 1 + this.N.dashPct / 100; },
    onDash(p, w) {
      const N = this.N;
      if (p.dead || !icd(p, 'pkNjShur', N.icd, w)) return;
      count('lia_ninja.shuriken');
      const f = p.facing, base = f > 0 ? 0 : Math.PI;
      for (let i = 0; i < N.n; i++) {
        const ang = base + (N.n > 1 ? (i / (N.n - 1) * 2 - 1) * N.spread : 0);
        K.shoot(w, p, {
          x: p.cx + f * 16, y: p.bottom - 52, vx: Math.cos(ang) * N.speed, vy: Math.sin(ang) * N.speed, w: 18, h: 18, scale: 0.9, spin: 30,
          render: shurikenR, color: '#c8d0ff', life: N.life, pierce: N.pierce,
          attack: K.atk(p, { mv: N.mvPct / 100, kb: [80, -40], hitstop: 0, shake: 0, tags: ['melee'], proc: true, dmgColor: '#c8d0ff', mult: 1, breakWalls: false }),
        });
      }
      sfx(w, 'dagger', { vol: 0.45, pitch: 1.4 });
    },
  },
  // ── 초월 ──
  lia_umbra: {
    N: { t: 2.5, max: 2, maxLow: 1, r: 300, mvPct: 35 },
    prewarm(w) { warm(w, ['#7a3aff', '#b060ff'], null); },
    onEnter(p) { const L = perkState(p).clones; if (L) L.length = 0; },
    onDash(p, w) { if (!p.dead) spawnClone(w, p, this.N); },
    onSwing(p, w, mv) { if (mv?.box && !mv.skill) cloneSwing(w, p, mv, this.N); },
  },
  lia_mirage: {
    N: { delay: 0.3, r: 120, mvPct: 150, window: 2, r2: 300, back: 24 },
    prewarm(w) { warm(w, ['#ff4a6a', '#ffd0d8', '#ff9ab0'], ['신기루!', '#ff9ab0']); },
    onDodge(p, w) {
      const N = this.N, x = p.cx, y = p.cy, st = perkState(p);
      st.mirT = nowOf(w) + N.window;
      count('lia_mirage.dodge');
      // 터지기 전 0.3초: 그 자리에 분홍 잔상이 부풀어 오른다
      K.fx(w, {
        life: N.delay + 0.02, z: 11, x: x - 60, y: y - 70, w: 120, h: 140,
        draw(ctx, e) {
          const k = e.k;
          ctx.globalCompositeOperation = ADD;
          K.glow(ctx, x, y, 30 + 50 * k, '#ff4a6a', 0.35 + 0.4 * k);
          ctx.globalAlpha = 0.5 + 0.4 * k; ctx.strokeStyle = '#ffd0d8'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, N.r * (1 - k * 0.7), 0, TAU); ctx.stroke();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        },
      });
      K.setTimeoutFx(w, N.delay, (ww) => {
        count('lia_mirage.boom');
        blast(ww, p, x, y, N.r, { mv: N.mvPct / 100, element: 'fire', kb: [300, -360], dmgColor: '#ff6a8a' }, '#ff4a6a', '#ffd0d8', 10);
        shake(ww, 4, 0.2);
        sfx(ww, 'fire', { vol: 0.7 }); sfx(ww, 'explode', { vol: 0.4, pitch: 1.3 });
      });
    },
    onSwing(p, w, mv) {
      if (!mv || mv.skill || p.dead) return;
      const st = perkState(p);
      if (!(st.mirT > nowOf(w))) return;
      const N = this.N, e = nearestFoe(w, p.cx, p.cy, N.r2);
      if (!e) return;
      const side = e.facing ? -Math.sign(e.facing) : (Math.sign(e.cx - p.cx) || p.facing);   // 등 뒤 (바라보는 쪽의 반대)
      const off = e.w / 2 + N.back;
      let tx = e.cx + side * off, tb = e.bottom;
      if (!K.freeSpot(w, p, tx, tb)) { tb = p.bottom; if (!K.freeSpot(w, p, tx, tb)) return; }
      const ox = p.cx, oy = p.cy;
      K.afterimage?.(w, p, '#ff9ab0', 0.3);
      p.x = tx - p.w / 2; p.y = tb - p.h; p.vx = 0;
      p.facing = Math.sign(e.cx - tx) || p.facing;
      st.mirT = 0;
      count('lia_mirage.blink');
      w.fx.burst('magic', ox, oy, 6, { speed: 140, color: '#ff9ab0' });
      w.fx.burst('magic', p.cx, p.cy, 6, { speed: 140, color: '#ffb0c0' });
      callout(w, p.cx, p.y - 40, '신기루!', '#ff9ab0');
      sfx(w, 'mist', { vol: 0.6, pitch: 1.3 });
    },
    drawMeter(ctx, p, w) {
      const st = p._pk, tn = nowOf(w);
      if (!(st?.mirT > tn)) return;
      const k = (st.mirT - tn) / this.N.window, x = p.cx, y = p.y - METER_DY;
      ctx.globalCompositeOperation = ADD; K.glow(ctx, x, y, 16, '#ff4a6a', 0.6); ctx.globalCompositeOperation = 'source-over';
      pip(ctx, x, y, 6 + Math.sin(tn * 14) * 0.8, '#ff9ab0', 0.95);
      ctx.strokeStyle = '#ffd0d8'; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(x, y, 10, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke(); ctx.globalAlpha = 1;
    },
  },
  lia_bladequeen: {
    N: { every: 4, n: 2, t: 4, max: 8, mvPct: 25, rehit: 0.4, orbitR: 84, spin: 6, outPct: 60, outSpeed: 900, outLife: 0.5, outPierce: 2 },
    prewarm(w) { warm(w, ['#ffd84a', '#ffe070'], null); },
    onEnter(p) { const st = perkState(p); if (st.qd) st.qd.length = 0; st.qAtk = null; },
    onSwing(p, w, mv) {
      if (!mv || mv.skill || p.dead) return;
      const n = p._bdN ?? 0, st = perkState(p);
      if (!(n > 0) || n % this.N.every !== 0 || st.qSw === p.curHitId) return;   // skills.js lia_bladedancer 가 방금 센 4타째 (C-x1)
      st.qSw = p.curHitId;
      queenSpawn(w, p, st, this.N);
    },
    afterHurt(p, dmg, atk, w) { queenRelease(w, p, perkState(p), this.N); },
  },
  lia_soulreaper: {
    N: { kill: 1, elite: 3, bossPct: 10, max: 10, dmgPct: 1, r: 220, mvPct: 300, life: 0.35, hitstop: 0.06, gap: 1.5 },
    prewarm(w) { warm(w, ['#6affb0', '#e8fff4'], ['망자의 낫!', '#6affb0']); },
    dmgMul(p) { const s = p._pk?.souls ?? 0; return s > 0 ? 1 + s * this.N.dmgPct / 100 : 1; },
    onKill(p, e, atk, w) { if (e && !isBoss(e)) addSouls(w, p, e, e.elite ? this.N.elite : this.N.kill, this.N); },
    onHit(p, tgt, info, atk, w) {
      if (!isBoss(tgt) || !(info?.dmg > 0)) return;
      const st = perkState(p), per = hpMaxOf(tgt) * this.N.bossPct / 100;
      st.bossDmg = (st.bossDmg ?? 0) + info.dmg;
      while (per > 0 && st.bossDmg >= per) { st.bossDmg -= per; addSouls(w, p, tgt, 1, this.N); }
    },
    onSwing(p, w, mv) {
      if (!mv?.finisher || mv.skill || p.dead) return;
      const st = perkState(p);
      if ((st.souls ?? 0) < this.N.max) return;
      st.souls = 0;
      scythe(w, p, st, this.N);
    },
    drawMeter(ctx, p, w) {
      const n = p._pk?.souls ?? 0;
      if (!n) return;
      const N = this.N, t = nowOf(w), x0 = p.cx, y0 = p.y - METER_DY + 4, full = n >= N.max;
      if (full) { ctx.globalCompositeOperation = ADD; K.glow(ctx, x0, y0, 30 + Math.sin(t * 8) * 3, '#6affb0', 0.55); ctx.globalCompositeOperation = 'source-over'; }
      ctx.strokeStyle = '#06140c'; ctx.lineWidth = 1.2;
      for (let i = 0; i < n; i++) {
        const a = t * 2.2 + i * TAU / N.max, x = x0 + Math.cos(a) * 20, y = y0 + Math.sin(a) * 6;
        ctx.globalAlpha = full ? 1 : 0.85; ctx.fillStyle = full ? '#e8fff4' : '#6affb0';
        ctx.beginPath(); ctx.arc(x, y, 2.8, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  // ── 비전 ──
  lia_frostcrow: {
    N: { add: 1, max: 5, t: 4, frzT: 1.2, frzIcd: 5, bossT: 2.5, bossSlowPct: 25, bossIcd: 10, dmgPct: 20, shR: 100, shMvPct: 60, shAdd: 2 },
    prewarm(w) { warm(w, ['#bff4ff', '#9fe8ff', '#e8fbff'], ['동결!', '#bff4ff', '산산조각!', '#e8fbff']); },
    onHit(p, tgt, info, atk, w) { if (tgt && !tgt.dead) chill(w, p, tgt, this.N.add, this.N); },
    onAttack(p, atk, tgt) {
      if (!markOf(tgt, 'frozen')) return undefined;
      RET_FRZ.mult = 1 + this.N.dmgPct / 100;
      return RET_FRZ;
    },
    onKill(p, e, atk, w) { if (e && markOf(e, 'frozen')) shatter(w, p, e, this.N); },
  },

  // ═════════════ 아젤 ═════════════
  // C9 담피르 (0차, 아젤 공통): 안개 대시로 적을 통과하면 적 하나마다 위력 30% 암흑 + 최대 HP 1% 회복 (대시당 최대 3명).
  // 흡혈 2% 는 기본 능력치 (data/characters.js azel.base.lifesteal) — 문구 숫자 확인용으로 N.lsPct 에 적어 둔다
  'char:azel': {
    N: { lsPct: 2, mvPct: 30, healPct: 1, max: 3, scanT: 0.08 },
    prewarm(w) { warm(w, ['#c070ff'], null); },
    onDash(p) {
      const st = perkState(p);
      st.mistOn = true; st.mistN = 0; st.mistA = st.mistB = st.mistC = null; st.mistX = p.cx; st.mistScan = 0; st.mistHid = 'azm' + (++MIST_ID);
    },
    tick(p, w, dt) {
      const st = p._pk;
      if (!st?.mistOn) return;   // 대시가 아닐 때 O(1)
      const dashing = p.dashT > 0;
      if (dashing && (st.mistScan -= dt) > 0) return;
      st.mistScan = this.N.scanT;
      if (st.mistN < this.N.max && !p.dead) mistPass(w, p, st, this.N);
      if (!dashing) { st.mistOn = false; st.mistA = st.mistB = st.mistC = null; }
    },
  },
  // S7 진조의 후예 (1차 → 노스페라투·혈왕과 그 초월): 처치하면 3초 동안 흡혈 +4%
  azel_vampire: {
    N: { t: 3, pct: 4 },
    prewarm(w) { warm(w, ['#ff2040'], null); },
    onKill(p, e, atk, w) {
      perkState(p).feast = nowOf(w) + this.N.t;
      count('azel_vampire.feast');
      if (icd(p, 'pkFeastFx', 0.25, w)) {
        w.fx.ring(p.cx, p.cy, { color: '#ff2040', r0: 12, r1: 54, life: 0.3, width: 3 });
        w.fx.burst('blood', e?.cx ?? p.cx, e?.cy ?? p.cy, 4, { speed: 160, color: '#ff2040' });
      }
    },
    onHit(p, tgt, info, atk, w) {
      if (!((p._pk?.feast ?? -1) > nowOf(w)) || !(info?.dmg > 0) || p.dead) return;
      p.heal(info.dmg * this.N.pct / 100, false);
      count('azel_vampire.drain');
    },
    tick(p, w) {
      if (!((p._pk?.feast ?? -1) > nowOf(w)) || !icd(p, 'pkFeastMote', 0.12, w)) return;
      w.fx.emit('blood', p.cx + ((nowOf(w) * 997) % 30) - 15, p.y + 20, { angle: -Math.PI / 2, spread: 0.6, speed: 80, color: '#ff4060', grav: -200 });
    },
    drawMeter(ctx, p, w) {
      const st = p._pk, tn = nowOf(w);
      if (!((st?.feast ?? -1) > tn)) return;
      const k = (st.feast - tn) / this.N.t, x = p.cx + 32, y = p.y - METER_DY + 4;
      ctx.globalAlpha = 0.95; ctx.fillStyle = '#ff2040'; ctx.strokeStyle = '#140610'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.quadraticCurveTo(x + 5, y, x, y + 4); ctx.quadraticCurveTo(x - 5, y, x, y - 7); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.strokeStyle = '#ff8090'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - 1, 8, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },
  // S8 혈왕 (2차 → 혈제): 넘친 회복량 → 피의 장벽 (최대 HP 15%까지, 3초 동안 늘지 않으면 초당 2% 감소) · 장벽이 피해를 먼저 막는다
  azel_bloodking: {
    N: { capPct: 15, holdT: 3, decayPct: 2 },
    prewarm(w) { warm(w, ['#ff1a2a'], null); },
    onOverheal(p, over, w) {
      if (!(over > 0) || p.dead) return;
      const was = shieldOf(p), now = shieldAdd(p, over, maxHp(p) * this.N.capPct / 100);
      if (now > was + 0.01) {
        count('azel_bloodking.shield');
        if (icd(p, 'pkBkFx', 0.35, w)) w.fx.ring(p.cx, p.cy, { color: '#ff1a2a', r0: 18, r1: 44, life: 0.28, width: 2 });
      }
    },
    tick(p, w, dt) {
      const s = p._shield;
      if (!(s > 0)) return;
      if (nowOf(w) - (p._shieldAt ?? 0) > this.N.holdT) p._shield = Math.max(0, s - maxHp(p) * this.N.decayPct / 100 * dt);
    },
    onHurt(p, dmg, atk, w) {
      if (!(shieldOf(p) > 0) || !(dmg > 0)) return undefined;
      const rem = shieldAbsorb(p, dmg);
      count('azel_bloodking.absorb');
      w?.fx?.ring(p.cx, p.cy, { color: '#ff4a5a', r0: 22, r1: 50, life: 0.25, width: 4 });
      w?.fx?.burst('blood', p.cx, p.cy, 3, { speed: 160, color: '#ff1a2a' });
      if (rem <= 0) { p.iframes = Math.max(p.iframes ?? 0, 0.5); sfx(w, 'clang', { vol: 0.4, pitch: 1.3 }); return false; }   // 다 막았다: 경직·콤보 끊김 없음
      return rem;
    },
    drawMeter(ctx, p) {
      const s = p._shield ?? 0;
      if (!(s > 0.5)) return;
      const cap = maxHp(p) * this.N.capPct / 100, n = Math.max(1, Math.min(6, Math.ceil(6 * s / cap))), x0 = p.cx - 2.5 * 9, y = p.y - METER_DY + 14;
      ctx.strokeStyle = '#140208'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const on = i < n;
        ctx.globalAlpha = on ? 0.95 : 0.35; ctx.fillStyle = on ? '#ff1a2a' : '#4a0a12';
        ctx.beginPath(); ctx.arc(x0 + i * 9, y, on ? 3.2 : 2.4, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  // ── 초월 ──
  azel_nightlord: {
    N: { t: 2, r: 90, max: 3, tickT: 0.25, mvPct: 15, healPct: 0.3, healCapPct: 2, refund: 1 },
    prewarm(w) { warm(w, ['#3a0010', '#8a0a1e', '#ff2a50'], null); },
    onEnter(p) { const st = perkState(p); if (st.nlc) st.nlc.length = 0; st.nlX = null; },
    onDash(p, w) {
      const st = perkState(p);
      st.nlX = p.cx; st.nlY = p.cy;
      if (!p.dashAir) return;
      const mx = p.maxAirJumps?.() ?? 1;
      if ((p.airJumpsLeft ?? 0) >= mx) return;
      p.airJumpsLeft = Math.min(mx, (p.airJumpsLeft ?? 0) + this.N.refund);
      count('azel_nightlord.refund');
      w.fx.ring(p.cx, p.cy, { color: '#ff2a50', r0: 12, r1: 48, life: 0.3, width: 3 });
    },
    onDashEnd(p, w) {
      const st = perkState(p);
      if (st.nlX == null || p.dead) return;
      nightCloud(w, p, (st.nlX + p.cx) / 2, (st.nlY + p.cy) / 2, this.N);
      st.nlX = null;
    },
  },
  azel_bloodemperor: {
    N: { minPct: 10, perPct: 20, mvMinPct: 200, mvMaxPct: 300, n: 5, r: 400, h: 150, wd: 26, gap: 0.05 },
    prewarm(w) { warm(w, ['#ff1a2a', '#5a0010'], ['혈액 지배!', '#ff4a5a']); },
    onSwing(p, w, mv) {
      if (!mv?.finisher || mv.skill || p.dead) return;
      const N = this.N, H = maxHp(p), s = shieldOf(p);
      if (!(s >= H * N.minPct / 100)) return;
      const k = nearestN(w, p.cx, p.cy, N.r, N.n);
      if (!k) return;
      const pct = Math.max(N.mvMinPct, Math.min(N.mvMaxPct, N.perPct * s / H * 100));
      p._shield = 0;
      count('azel_bloodemperor.lances');
      for (let i = 0; i < k; i++) bloodSpike(w, p, FOES[i], i * N.gap, pct / 100, N);
      for (let i = 0; i < k; i++) FOES[i] = null;
      callout(w, p.cx, p.y - 46, '혈액 지배!', '#ff4a5a');
      w.fx.ring(p.cx, p.cy, { color: '#ff1a2a', r0: 20, r1: 90, life: 0.35, width: 5 });
      sfx(w, 'dark', { vol: 0.7 }); sfx(w, 'slash_heavy', { vol: 0.6, pitch: 0.8 });
    },
    drawMeter(ctx, p, w) {
      if (!(shieldOf(p) >= maxHp(p) * this.N.minPct / 100)) return;
      const x = p.cx, y = p.y - METER_DY, t = nowOf(w);
      ctx.globalCompositeOperation = ADD; K.glow(ctx, x, y, 20 + Math.sin(t * 7) * 2, '#ff1a2a', 0.6); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ff2a3a'; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - 9, y + 4); ctx.lineTo(x - 9, y - 3); ctx.lineTo(x - 5, y + 1); ctx.lineTo(x, y - 7); ctx.lineTo(x + 5, y + 1); ctx.lineTo(x + 9, y - 3); ctx.lineTo(x + 9, y + 4); ctx.closePath();
      ctx.fill(); ctx.stroke();
    },
  },
  azel_solaris: {
    N: { hit: 2, fin: 6, max: 100, len: 900, h: 70, mvPct: 350, life: 0.35, win: 0.3, hitstop: 0.06, gap: 1.5, yOff: 100 },
    prewarm(w) { warm(w, ['#ffc040', '#fff8e0', '#ffffff'], ['한낮의 일격!', '#ffd070']); K.beamSprite?.('#ffc040', '#fff8e0', true); K.beamSprite?.('#fff8e0', '#ffffff', true); },
    onHit(p, tgt, info, atk, w) {
      const st = perkState(p), was = st.sun ?? 0;
      if (was >= this.N.max) return;
      st.sun = Math.min(this.N.max, was + this.N.hit);
      if (st.sun >= this.N.max) sunReady(w, p);
    },
    onSwing(p, w, mv) {
      if (!mv?.finisher || mv.skill || p.dead) return;
      const st = perkState(p), s = st.sun ?? 0;
      if (s >= this.N.max) { st.sun = 0; noon(w, p, st, this.N); return; }
      st.sun = Math.min(this.N.max, s + this.N.fin);
      if (st.sun >= this.N.max) sunReady(w, p);
    },
    drawMeter(ctx, p, w) {
      const s = p._pk?.sun ?? 0;
      if (!(s > 0)) return;
      const full = s >= this.N.max, x0 = p.cx - 1.5 * 11, y = p.y - METER_DY, t = nowOf(w);
      if (full) { ctx.globalCompositeOperation = ADD; K.glow(ctx, p.cx, y, 30 + Math.sin(t * 9) * 3, '#ffc040', 0.6); ctx.globalCompositeOperation = 'source-over'; }
      for (let i = 0; i < 4; i++) {
        const k = clamp01(s / this.N.max * 4 - i);
        ctx.globalAlpha = 0.5 + 0.5 * k; ctx.fillStyle = k >= 1 ? (full ? '#fff8e0' : '#ffc040') : '#5a4010'; ctx.strokeStyle = '#1a0e02'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x0 + i * 11, y, 3.6 + 1.2 * k, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  },
  azel_nephilim: {
    N: { n: 1, mvPct: 30, speed: 800, life: 0.5, win: 1.5, r: 90, eclPct: 100, icd: 2 },
    prewarm(w) { warm(w, ['#fff2b0', '#b060ff', '#ffffff'], ['일식!', '#e8d8ff']); },
    onSwing(p, w, mv) {
      if (!mv || mv.skill || p.dead) return;
      const st = perkState(p), N = this.N, f = p.facing;
      // 보통 공격 (proc 아님 — 일식을 일으킨다: §3.6 규칙 1 의 예외, §4.6). 빛·어둠이 번갈아
      for (let i = 0; i < N.n; i++) {
        st.pol = !st.pol;
        K.shoot(w, p, {
          x: p.cx + f * 20, y: p.cy - 14 + i * 10, vx: f * N.speed, vy: 0, w: 22, h: 14, scale: 1, render: st.pol ? featherLR : featherDR, life: N.life, pierce: 1,
          color: st.pol ? '#fff2b0' : '#b060ff',
          attack: K.atk(p, { mv: N.mvPct / 100, element: st.pol ? 'holy' : 'dark', kb: [60, -40], hitstop: 0, shake: 0, tags: ['melee', 'feather'] }),
        });
      }
      count('azel_nephilim.feather');
    },
    onHit(p, tgt, info, atk, w) {
      const el = atk?.element;
      if ((el !== 'holy' && el !== 'dark') || !tgt || tgt.dead || tgt.kind === 'prop') return;
      const N = this.N;
      mark(tgt, el === 'holy' ? 'ecH' : 'ecD', N.win, 1, 1);
      if (!markOf(tgt, 'ecH') || !markOf(tgt, 'ecD') || !icd(tgt, 'pkEcl', N.icd, w)) return;
      unmark(tgt, 'ecH'); unmark(tgt, 'ecD');
      const weak = tgt.stats?.weak, e2 = weak?.includes?.('holy') ? 'holy' : 'dark';
      count('azel_nephilim.eclipse');
      const fxOk = icd(p, 'pkEclFx', 0.25, w);
      blast(w, p, tgt.cx, tgt.cy, N.r, { mv: N.eclPct / 100, element: e2, kb: [200, -220], tags: ['melee', 'eclipse'], dmgColor: e2 === 'holy' ? '#ffffff' : '#c080ff' },
        '#ffffff', '#b060ff', fxOk ? 8 : 0);
      if (fxOk) { callout(w, tgt.cx, tgt.y - 24, '일식!', '#e8d8ff'); shake(w, 2, 0.15); sfx(w, 'dark', { vol: 0.6, pitch: 1.3 }); sfx(w, 'holy', { vol: 0.4, pitch: 0.7 }); }
    },
  },
  // ── 비전 ──
  azel_dawnblood: {
    N: { t: 5, inv: 0.8, needPct: 25, backPct: 35, r: 200, mvPct: 150, lowPct: 50, elemPct: 10 },
    prewarm(w) { warm(w, ['#ffb060', '#fff2d0', '#ffd070'], ['빌린 시간!', '#ffb060', '여명!', '#fff2d0']); },
    onLethal(p, atk, w) {
      const st = perkState(p);
      if (st.borrow) { p.hp = 1; return true; }   // 빌린 시간 동안에는 쓰러지지 않는다 — 끝날 때 결판 (명세: HP 1, 채우지 못하면 쓰러진다)
      const run = w?.run;
      if (!run || run.borrowUsed) return undefined;
      run.borrowUsed = true;
      const N = this.N;
      p.hp = 1;
      p.iframes = Math.max(p.iframes ?? 0, N.inv);
      st.borrow = { t: N.t, dealt: 0, need: maxHp(p) * N.needPct / 100, sec: Math.ceil(N.t) };
      count('azel_dawnblood.borrow');
      w.game?.vignette?.('#ffb060', 0.6, 0.8);
      callout(w, p.cx, p.y - 46, '빌린 시간!', '#ffb060');
      w.fx.ring(p.cx, p.cy, { color: '#ffb060', r0: 20, r1: 110, life: 0.5, width: 5 });
      sfx(w, 'heartbeat', { vol: 0.9 });
      return true;
    },
    onHit(p, tgt, info) { const b = p._pk?.borrow; if (b && info?.dmg > 0) b.dealt += info.dmg; },
    tick(p, w, dt) {
      const st = p._pk, b = st?.borrow;
      if (!b) return;   // O(1)
      if (p.dead) { st.borrow = null; return; }
      if (b.dealt >= b.need) { st.borrow = null; dawnBurst(w, p, this.N); return; }
      b.t -= dt;
      const s = Math.ceil(b.t);
      if (s < b.sec) {
        b.sec = s;
        if (s > 0) {
          w.fx.text(p.cx, p.y - 24, String(s), { color: '#ffb060', size: 24, life: 0.7, vy: -40 });
          w.game?.vignette?.('#ffb060', 0.35, 1.2);
          sfx(w, 'heartbeat', { vol: 0.7 });
        }
      }
      if (b.t <= 0) {
        st.borrow = null;
        count('azel_dawnblood.fail');
        p.hp = 0;
        p.die?.(w, null);
      }
    },
    onAttack(p, atk) {
      if (p.hp > maxHp(p) * this.N.lowPct / 100 || (atk.element !== 'holy' && atk.element !== 'dark')) return undefined;
      RET_DAWN.mult = 1 + this.N.elemPct / 100;
      return RET_DAWN;
    },
    drawMeter(ctx, p, w) {
      const b = p._pk?.borrow;
      if (!b) return;
      const x = p.cx, y = p.cy - 4, k = clamp01(b.t / this.N.t), g = clamp01(b.dealt / b.need), t = nowOf(w);
      ctx.globalCompositeOperation = ADD; K.glow(ctx, x, y, 60 + Math.sin(t * 10) * 4, '#ffb060', 0.35); ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.55; ctx.strokeStyle = '#2a0a06'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y, 46, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = '#ffb060'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 46, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      ctx.strokeStyle = '#fff2d0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 38, -Math.PI / 2, -Math.PI / 2 + TAU * g); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    },
  },
};
function sunReady(w, p) {
  count('azel_solaris.ready');
  w.fx.ring(p.cx, p.cy, { color: '#ffc040', r0: 16, r1: 64, life: 0.35, width: 4 });
  sfx(w, 'charge_ready', { vol: 0.6 });
}

// ═════════════════════════════════════════ 비전 액티브 ═════════════════════════════════════════
export const ACTIVES_C = {
  /** 동결의 날개: 앞으로 300 돌진(20px 칸씩 막히면 멈춤, 0.18초, 무적 0.25초) → 지나간 적 베기(보통 스킬 타격, 냉기 2중첩) → 서리 깃털 n 개가 쫓는다 */
  asc_lia_frostwing(p, w, lv) {
    const A = ACT_N.frostwing, id = 'asc_lia_frostwing';
    const mv = skillVal(id, 'dmg', lv) / 100, fm = skillVal(id, 'f', lv) / 100, n = Math.max(1, Math.floor(skillVal(id, 'n', lv)));
    const f = p.facing, x0 = p.cx, b0 = p.bottom, y = p.cy;
    let x1 = x0;
    for (let d = A.step; d <= A.dist; d += A.step) { const x = x0 + f * d; if (!K.freeSpot(w, p, x, b0)) break; x1 = x; }
    count('asc_lia_frostwing.cast');
    p.iframes = Math.max(p.iframes ?? 0, A.iframes);
    K.pose?.(p, w, 'thrust', A.dashT + 0.16, { h0: 0.02, hw: A.dashT, sfx: 'dash' });
    sfx(w, 'ice', { vol: 0.7, pitch: 1.2 }); sfx(w, 'crow_caw', { vol: 0.4, pitch: 1.3 });
    const hid = K.nid('fw');
    K.fx(w, {
      life: A.dashT, z: 12, d: { g: 0 },
      tick(e, ww) {
        const k = Math.min(1, e.lt / A.dashT);
        p.x = x0 + (x1 - x0) * k - p.w / 2; p.vx = 0;
        if (!p.onGround) p.vy = 0;
        K.holdInvuln?.(p);
        if ((e.d.g++ & 1) === 0) K.afterimage?.(ww, p, '#bff4ff', 0.25);
        ww.fx.emit('ice', p.cx - f * 12, p.cy + ((e.d.g * 13) % 40) - 20, { speed: 60 });
      },
      end(e, ww) {
        p.x = x1 - p.w / 2; p.vx = f * 120;
        const rc = { x: Math.min(x0, x1) - 34, y: b0 - p.h - 12, w: Math.abs(x1 - x0) + 68, h: p.h + 24 }, done = [];
        K.fx(ww, {
          life: 0.05, z: 12, atk: K.atk(p, { mv, element: 'ice', kb: [200, -260], hitstop: 0.06, shake: 4, tags: ['skill'], hitId: hid }), win: [0, 1],
          rect() { return rc; },
          onHit(e2, w2) {   // 냉기 2중첩: 패시브 onHit 의 1 + 여기서 1 (이 돌진에 맞은 적만)
            const L = w2.entities;
            for (let i = 0; i < L.length; i++) {
              const en = L[i];
              if (!en._hits?.has(hid) || en.dead || done.includes(en)) continue;
              done.push(en);
              chill(w2, p, en, A.chill - 1, PERKS_C.lia_frostcrow.N);
            }
          },
        });
        K.fx(ww, {
          life: 0.4, z: 11, x: Math.min(x0, x1) - 20, y: y - 30, w: Math.abs(x1 - x0) + 40, h: 60,
          draw(ctx, e2) { const a = 1 - e2.k; K.cutLine(ctx, x0, y, x1, y, 7 * a, '#bff4ff', a); ctx.globalCompositeOperation = ADD; K.glow(ctx, x1, y, 50, '#bff4ff', 0.6 * a); ctx.globalCompositeOperation = 'source-over'; },
        });
        ww.fx.burst('ice', x1, y, 8, { speed: 220 });
        // 서리 깃털: 돌진한 자리에서 위로 부채꼴로 피어나 반경 500 안의 적을 쫓는다
        const k = nearestN(ww, x1, y, A.R, n);
        for (let i = 0; i < n; i++) {
          const ang = -Math.PI / 2 + (n > 1 ? (i / (n - 1) - 0.5) * 1.6 : 0);
          K.fx(ww, {
            life: A.life, z: 11, win: [0.06, 1],
            d: { x: x1, y: y - 10, vx: Math.cos(ang) * A.speed * 0.5, vy: Math.sin(ang) * A.speed * 0.5, tgt: k ? FOES[i % k] : null, R: A.R, speed: A.speed, turn: A.turn, delay: A.delay, rc: { x: 0, y: 0, w: 20, h: 20 } },
            atk: K.atk(p, { mv: fm, element: 'ice', kb: [60, -40], hitstop: 0, shake: 0, tags: ['skill', 'feather'] }),
            tick: featherTick, rect: featherRect, onHit: featherHit, draw: featherDraw,
          });
        }
        for (let i = 0; i < k; i++) FOES[i] = null;
      },
      light(L) { L.add(p.cx, p.cy, 150, '#bff4ff', 1); },
    });
    return true;
  },
  /** 아멜리아의 자장가: 현재 HP 10% 를 바쳐 주위 300도(등 뒤 아래 60도 제외)를 반경 180 초승달로 벤다 → 맞은 적 3초 지속 피해 → 바친 HP 의 150% 회복 */
  asc_azel_lullaby(p, w, lv) {
    const A = ACT_N.lullaby, id = 'asc_azel_lullaby';
    const mv = skillVal(id, 'dmg', lv) / 100, dm = skillVal(id, 'd', lv) / 100;
    const cost = Math.max(0, Math.min(Math.ceil(p.hp) - 1, Math.ceil(p.hp * A.costPct / 100)));
    if (cost > 0) { p.hp -= cost; w.fx.text(p.cx, p.y - 10, '-' + cost, { color: '#ff8a5a', size: 16 }); }
    count('asc_azel_lullaby.cast');
    K.pose?.(p, w, 'slash_wide', 0.42, { h0: 0.05, hw: 0.2, sfx: 'slash_heavy' });
    const f = p.facing, cx = p.cx, cy = p.cy - 6, R = A.r, hid = K.nid('lb');
    const gap = (360 - A.arcDeg) * Math.PI / 180, wedge = Math.PI * 0.75;   // 빠지는 쐐기: 등 뒤 아래(135°) 가운데 60°
    let hits = 0, dots = 0;
    const L = w.entities;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (!liveFoe(e, w)) continue;
      const nx = cx < e.x ? e.x : cx > e.x + e.w ? e.x + e.w : cx, ny = cy < e.y ? e.y : cy > e.y + e.h ? e.y + e.h : cy;
      if ((nx - cx) ** 2 + (ny - cy) ** 2 > R * R) continue;
      let ang = Math.atan2(e.cy - cy, (e.cx - cx) * f);
      if (ang < 0) ang += TAU;
      if (Math.abs(ang - wedge) < gap / 2) continue;
      const n = K.uHit(w, p, mv, { rect: { x: e.cx - 3, y: e.cy - 3, w: 6, h: 6 }, type: 'phys', element: 'holy', kb: [260, -300], hitstop: 0.06, shake: 5, tags: ['skill'], hitId: hid, breakWalls: false, launch: false, dir: Math.sign(e.cx - cx) || f }) || 0;
      if (!n) continue;
      hits += n;
      if (dots < A.maxDot) { dots++; dawnDot(w, p, e, dm, A); }
    }
    if (hits > 0 && cost > 0) p.heal(cost * A.healPct / 100);
    const a0 = Math.PI * 0.75 + gap / 2, a1 = a0 + A.arcDeg * Math.PI / 180;
    K.fx(w, {
      life: 0.42, z: 12, x: cx - R * 1.3, y: cy - R * 1.3, w: R * 2.6, h: R * 2.6,
      draw(ctx, e) {
        const u = 1 - (1 - clamp01(e.lt / 0.24)) ** 3, t = a0 + (a1 - a0) * u, a = 1 - clamp01((e.k - 0.5) / 0.5);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(f, 1);
        ctx.globalCompositeOperation = ADD;
        K.glow(ctx, 0, 0, R * 0.9, '#ffb060', 0.35 * a);
        const tail = Math.max(a0, t - 2.4);
        for (let i = 0; i < 8; i++) {
          const t0 = tail + (t - tail) * i / 8, t1 = tail + (t - tail) * (i + 1) / 8 + 0.01;
          ctx.globalAlpha = a * (i + 1) / 8 * 0.6; ctx.strokeStyle = i > 5 ? '#fff2d0' : '#ffb060'; ctx.lineWidth = 10 + i * 4;
          ctx.beginPath(); ctx.arc(0, 0, R * 0.78, t0, t1); ctx.stroke();
        }
        ctx.globalAlpha = a; ctx.strokeStyle = '#fff2d0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, R * 0.96, Math.max(a0, t - 1.2), t); ctx.stroke();
        ctx.globalAlpha = 1; ctx.restore();
      },
      light(Lt, e) { Lt.add(cx, cy, R * 1.8, '#ffb060', 1.2 * (1 - e.k)); },
    });
    w.fx.burst('holy', cx, cy, 10, { speed: R * 1.4, color: '#ffd070' });
    sfx(w, 'holy', { vol: 0.8 }); sfx(w, 'bell', { vol: 0.35, pitch: 1.4 });
    return true;
  },
};

// ═════════════════════════════════════════ 표식 ═════════════════════════════════════════
// (ctx, e, n, k, t): 캐시 빛 + 선 몇 개. e.x/y/w/h 를 바로 읽는다 (hurtbox() 는 새 객체를 만든다)
export const MARKS_C = {
  /** 냉기 1~5: 머리 위 얼음 마름모 */
  chill(ctx, e, n) {
    const x0 = e.x + e.w / 2 - (n - 1) * 4.5, y = e.y - 12;
    for (let i = 0; i < n; i++) pip(ctx, x0 + i * 9, y, 4, n >= 5 ? '#ffffff' : '#9fe8ff', 0.95);
  },
  /** 동결: 몸을 덮은 얼음 껍질 */
  frozen(ctx, e, n, k) {
    const a = Math.min(1, k * 4), x = e.x - 3, y = e.y - 3, w = e.w + 6, h = e.h + 6;
    ctx.globalCompositeOperation = ADD; K.glow(ctx, x + w / 2, y + h / 2, Math.max(w, h) * 0.8, '#9fe8ff', 0.45 * a); ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.38 * a; ctx.fillStyle = '#bff4ff';
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + h * 0.18); ctx.lineTo(x + w * 0.22, y); ctx.lineTo(x + w * 0.5, y + h * 0.1); ctx.lineTo(x + w * 0.78, y - 4); ctx.lineTo(x + w, y + h * 0.2); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.globalAlpha = 0.6 * a; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + h * 0.2); ctx.lineTo(x + w * 0.45, y + h * 0.5); ctx.lineTo(x + w * 0.35, y + h * 0.8); ctx.moveTo(x + w * 0.45, y + h * 0.5); ctx.lineTo(x + w * 0.7, y + h * 0.62); ctx.stroke();
    ctx.globalAlpha = 1;
  },
  /** 보스 냉기 감속: 발밑 서리 고리 + 머리 위 눈꽃 */
  frost(ctx, e, n, k, t) {
    const x = e.x + e.w / 2, b = e.y + e.h, a = Math.min(1, k * 3);
    ctx.globalAlpha = 0.8 * a; ctx.strokeStyle = '#bff4ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, b - 2, e.w * 0.65, 9, 0, 0, TAU); ctx.stroke();
    const y = e.y - 16, r = 9;
    ctx.lineWidth = 2; ctx.strokeStyle = '#e8fbff';
    for (let i = 0; i < 3; i++) { const q = t * 0.8 + i * Math.PI / 3, c = Math.cos(q) * r, s = Math.sin(q) * r; ctx.beginPath(); ctx.moveTo(x - c, y - s); ctx.lineTo(x + c, y + s); ctx.stroke(); }
    ctx.globalAlpha = 1;
  },
  /** 일식 반쪽: 신성 (흰 왼쪽 반달) */
  ecH(ctx, e, n, k) {
    const x = e.x + e.w / 2, y = e.y - 14;
    ctx.globalAlpha = 0.95 * Math.min(1, k * 3); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#1a1a2a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, 7, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  },
  /** 일식 반쪽: 암흑 (보랏빛 오른쪽 반달) */
  ecD(ctx, e, n, k) {
    const x = e.x + e.w / 2, y = e.y - 14;
    ctx.globalAlpha = 0.95 * Math.min(1, k * 3); ctx.fillStyle = '#7a3aff'; ctx.strokeStyle = '#e8d8ff'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, 7, -Math.PI / 2, Math.PI / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  },
  /** 여명의 지속 피해: 몸을 감싸는 주황 불씨 고리 */
  dawn(ctx, e, n, k, t) {
    const x = e.x + e.w / 2, y = e.y + e.h * 0.45, r = Math.max(e.w, e.h) * 0.55, a = Math.min(1, k * 4);
    ctx.globalCompositeOperation = ADD; K.glow(ctx, x, y, r * 1.2, '#ffb060', 0.35 * a);
    ctx.globalAlpha = 0.8 * a; ctx.strokeStyle = '#ffd070'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, t * 3, t * 3 + 2.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, -t * 4, -t * 4 + 1.6); ctx.stroke();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
};
