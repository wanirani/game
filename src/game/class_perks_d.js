// 직업 특성 내용 D — 이졸데 (PERKS-D) (docs/specs/classes_t3.md §3.1 · §4.7 · §5)
//  PERKS_D   { '<CLASSES id | ASCENSIONS id | char:<영웅>>': { only?, N?, <hook>… } }   (§3.2, hook 이름은 class_perks.js HOOK_NAMES)
//  ACTIVES_D { 'asc_<영웅>_<낱말>': (p, w, lv) => true|false }                          (비전 액티브, skills.js castSkill 대체 경로)
//  MARKS_D   { '<표식 키>': (ctx, e, n, k, t) => {…} }                                 (PerkLayer 가 그린다; k = 남은 시간 비율)
//  STATS_D   { procs: { '<항목>.<일>': 횟수 } }  — 발동 횟수 (QA 탐침이 읽는다; 발동 때만 늘어난다)
// 이졸데는 §6 고칠 줄이 없다 (0·1·2차는 skills.js __onSwing·__onPound 의 기존 특성 그대로). 여기는 초월 4 + 비전 1 + 비전 액티브 1.
//  초월: isolde_skysovereign(천뢰 도약) · isolde_abyssdragoon(흑룡 돌진) · isolde_soulherald(영혼 인도) · isolde_speargod(일점)
//  비전: isolde_dragonbond(아르겐의 환영 · 용린) + asc_isolde_breath(아르겐의 숨결)
// 규칙 (§3.5 · §3.6): ./class_perks.js 와 데이터 모듈만 import 한다 (skills.js · player.js · world.js 금지).
// 모듈 최상단에서 가져온 바인딩(K·도우미)을 읽지 않는다 — hook 본문 안에서만. 최상단에서 bus·game·document 를 건드리지 않는다.
// 모든 조절 수치는 항목의 N 표 (ascensions.js 의 perk 문구 숫자와 같아야 한다). 백분율은 문구 그대로 % 값으로 적는다.
// 특성이 만드는 공격은 proc (procAtk · K.uHit{proc:true}) — 비전 액티브의 타격만 보통 스킬 타격 (§5).
// 그리기(표식·게이지·연출 draw)에는 난수·파티클·그라디언트·문자열 조립이 없다 (캐시 스프라이트 K.glow·K.beamH + 선 몇 개).
import { procAtk, mark, markOf, unmark, icd, perkState, procStrike, K } from './class_perks.js';
import { skillVal } from '../data/skills.js';

const TAU = Math.PI * 2;
const ADD = 'lighter';
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const nowOf = (w) => w?.time ?? 0;
const circ = (x, y, r) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
/** 발동 횟수 (QA) */
export const STATS_D = { procs: {} };
const count = (k) => { STATS_D.procs[k] = (STATS_D.procs[k] ?? 0) + 1; };

// ─────────────────────────── 공용 도우미 ───────────────────────────
function sfx(w, name, o) { try { w?.game?.audio?.sfx?.(name, o); } catch { /* 소리 없음 */ } }
function callout(w, x, y, text, color) { try { w.fx.callout?.(x, y, text, { color }); } catch { /* 연출 없음 */ } }
const lowQ = (w) => (w?.fx?.quality ?? 1) < 0.6;
/**
 * 특성 부가 타격 (proc). o: procAtk 옵션 { mv, type, element, kb, stun, tags, hitstop } + dmgColor(숫자 색).
 * 숫자 색이 있으면 K.uHit(playerStrike + 공격 객체, proc·배율 1)로 실어 보낸다 (procAtk 는 dmgColor 를 옮기지 않는다) → 맞힌 수
 */
function strike(w, p, rect, o) {
  if (!o.dmgColor || typeof K.uHit !== 'function') return procStrike(w, p, rect, o);
  return K.uHit(w, p, o.mv ?? 1, {
    rect, type: o.type ?? 'phys', element: o.element ?? null, kb: o.kb ?? [80, -60], hitstop: Math.min(0.08, Math.max(0, o.hitstop ?? 0)),
    shake: 0, tags: o.tags ?? ['melee'], proc: true, crit: o.crit ?? 0, mult: 1, stun: o.stun, dmgColor: o.dmgColor, breakWalls: false, launch: false,
  }) || 0;
}
/** procAtk + 숫자 색 (SkillFx 의 atk 로 쓰는 판정: 같은 hitId 라 적마다 한 번) */
function procAtkC(p, o, color) { const a = procAtk(p, o); a.dmgColor = color; return a; }
/** 캐시 스프라이트·판정 문구를 미리 굽는다 (prewarm: 방 입장 때 한 번 — 전투 중 캔버스 생성 없음) */
function warm(w, cols, calls) {
  for (const c of cols) K.glowSprite?.(c);
  if (calls) for (let i = 0; i < calls.length; i += 2) callout(w, -99999, -99999, calls[i], calls[i + 1]);
}
/** 바닥 y: 공중이면 발 아래 땅(7칸 안), 없으면 발 위치 */
const floorY = (w, p) => (p.onGround ? p.bottom : K.groundAt?.(w, p.cx, p.bottom - 4) ?? p.bottom);
/** 살아 있는 적 (적·보스; 숨은·죽어 가는·무적 제외) */
const liveFoe = (e) => (e.kind === 'enemy' || e.kind === 'boss') && !e.dead && !e.hidden && !(e.dying > 0) && !e.invuln && !e.pendingBoss;
/** 머리 위 작은 마름모 하나 (어두운 테두리: 밝은 배경에서도 읽히게) */
function pip(ctx, x, y, s, col, a) {
  ctx.globalAlpha = a; ctx.fillStyle = col; ctx.strokeStyle = '#0a1018'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.globalAlpha = 1;
}
/** 영웅 게이지 높이: 히트박스 위쪽(p.y)에서 이만큼 위 — puppet 머리·날개에 가리지 않게 (PerkLayer z 9 < 영웅 z 10) */
const METER_DY = 38;
/** 용 그림 마디 (평평한 x,y 배열) — 그릴 때마다 다시 채운다 (할당 없음) */
const PTS = new Float64Array(48);

// ─────────────────────────── 천뢰 (천뢰의 기사) ───────────────────────────
/** 공중 점프 발밑 번개: 발밑 빛 + 아래로 갈라지는 번개 세 줄기 (번개 모양은 생성 때 한 번 굽는다) */
function skyBurst(w, x, y, r) {
  const b = [K.boltPts(x, y - 12, x - r * 0.75, y + 26, 5, 10), K.boltPts(x, y - 12, x, y + 34, 5, 8), K.boltPts(x, y - 12, x + r * 0.75, y + 26, 5, 10)];
  K.fx(w, {
    life: 0.26, z: 11, x: x - r - 20, y: y - r, w: r * 2 + 40, h: r + 60,
    draw(ctx, e) {
      const a = 1 - e.k;
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x, y, r * (0.6 + 0.5 * e.k), '#bfe8ff', 0.7 * a);
      K.glow(ctx, x, y - 6, r * 0.32, '#ffffff', 0.9 * a);
      for (let i = 0; i < 3; i++) K.drawBolt(ctx, b[i], '#bfe8ff', 2.2, a);
    },
    light(L, e) { L.add(x, y, r * 2.4, '#bfe8ff', 1.1 * (1 - e.k)); },
  });
  w.fx.ring(x, y - 4, { color: '#bfe8ff', r0: 10, r1: r, life: 0.24, width: 4 });
  w.fx.burst('thunder', x, y - 4, 4, { speed: 260, color: '#e0f4ff' });   // ≤ 4: ICD 0.2 < 0.25 (§3.6.3)
  sfx(w, 'thunder', { vol: 0.35, pitch: 1.5 });
}
/** 낙뢰 한 줄기 (proc): (x, 바닥 base) 로 내리꽂는다. 판정 폭 54, 0.5초 경직. 번개 모양은 tick 에서 다시 굽는다 (그리기에 난수 없음) */
function skyBolt(w, p, x, base, delay, N) {
  const top = Math.max((w.camera?.y ?? base - 400) + 10, base - 360);
  K.fx(w, {
    delay, life: 0.28, z: 12, x: x - 70, y: top, w: 140, h: base - top, d: { pts: null, re: 0 },
    start(e, ww) {
      count('isolde_skysovereign.bolt');
      strike(ww, p, { x: x - 27, y: top, w: 54, h: base - top }, { mv: N.boltMvPct / 100, element: 'thunder', kb: [60, -220], stun: N.boltStunT, dmgColor: '#bfe8ff' });
      e.d.pts = K.boltPts(x + 30, top, x, base, 10, 26);
      ww.fx.burst('thunder', x, base - 6, 8, { speed: 360 });
      ww.fx.ring(x, base - 4, { color: '#bfe8ff', r0: 8, r1: 60, life: 0.24, width: 4 });
      sfx(ww, 'thunder', { vol: 0.5, pitch: 1.1 });
    },
    tick(e) { if ((e.d.re += 1) % 4 === 0) e.d.pts = K.boltPts(x - 24 + ((e.d.re * 37) % 48), top, x, base, 10, 26); },
    draw(ctx, e) {
      if (!e.d.pts) return;
      const a = 1 - e.k;
      K.drawBolt(ctx, e.d.pts, '#bfe8ff', 5.5, a);
      K.glow(ctx, x, base, 76, '#bfe8ff', a * 0.85);
    },
    light(L, e) { L.add(x, base - 90, 280, '#bfe8ff', 1.2 * (1 - e.k)); },
  });
}
/**
 * 급강하 착지 추가 낙뢰 extra 줄기: 뇌룡기사의 세 줄기(같은 거르기의 앞 셋) 다음 적들에게, 적이 모자라면 착지한 자리 둘레(좌우 번갈아)에.
 * 지연은 기존 세 줄기 다음 박자부터
 */
function skyBolts(w, p, extra, N) {
  const foes = w.enemies?.().filter((e) => !e.invuln && Math.abs(e.cx - p.cx) < 320 && Math.abs(e.cy - p.cy) < 260).slice(3, 3 + extra) ?? [];
  const gy = p.bottom;
  for (let i = 0; i < extra; i++) {
    const delay = 0.05 + (3 + i) * N.gap, en = foes[i];
    if (en) {
      const base = K.groundAt?.(w, en.cx, en.cy + 40, 12 * 48) ?? en.bottom ?? gy;
      skyBolt(w, p, en.cx, base, delay, N);
    } else {
      const k = i - foes.length, side = k % 2 ? -1 : 1, x = p.cx + side * p.facing * N.spread * (1 + (k >> 1));
      skyBolt(w, p, x, K.groundAt?.(w, x, gy - 40, 6 * 48) ?? gy, delay, N);
    }
  }
}

// ─────────────────────────── 흑룡 돌진 (심연의 용기사) ───────────────────────────
function blackDragon(w, p, N) {
  count('isolde_abyssdragoon.charge');
  const f = p.facing, gy = floorY(w, p);
  const a = procAtkC(p, { mv: N.mvPct / 100, element: 'fire', kb: [460, -280], hitstop: N.hitstop, shake: 6, tags: ['melee'] }, '#d8a0ff');
  const rc = { x: 0, y: 0, w: N.len, h: N.h };
  const place = () => { const r = p.relRect(N.x0, N.y0, N.len, N.h); rc.x = r.x; rc.y = r.y; return rc; };
  place();
  const d = { lo: rc.x, hi: rc.x + rc.w, y: rc.y + rc.h / 2 };
  sfx(w, 'fire', { vol: 0.8, pitch: 0.7 }); sfx(w, 'boss_roar', { vol: 0.35, pitch: 1.5 });
  w.camera?.shake?.(5, 0.2);
  K.fx(w, {
    life: N.t, z: 12, atk: a, win: [0, 1], d,
    rect() { return rc; },
    follow(e) { place(); d.lo = Math.min(d.lo, rc.x); d.hi = Math.max(d.hi, rc.x + rc.w); d.y = rc.y + rc.h / 2; e.x = rc.x - 40; e.y = rc.y - 50; e.w = rc.w + 80; e.h = rc.h + 100; },
    tick(e, ww) { if (!lowQ(ww)) ww.fx.emit('fire', rc.x + ((e.lt * 997) % rc.w), d.y, { angle: -Math.PI / 2, spread: 0.6, speed: 140, color: '#c070ff' }); },
    draw(ctx, e) {
      const a2 = Math.min(1, e.lt / 0.05) * (1 - clamp01((e.k - 0.6) / 0.4)), y = d.y;
      const x0 = f > 0 ? rc.x : rc.x + rc.w, x1 = f > 0 ? rc.x + rc.w : rc.x;
      // 검은 불길 몸통 (덧칠하지 않는 어두운 연기 덩이) + 보라·주홍 불빛 테 + 흑룡 (몸통·머리)
      for (let i = 0; i < 7; i++) {
        const u = (i + 0.5) / 7, fl = 0.8 + 0.2 * Math.sin(e.lt * 24 + i * 1.9);
        K.glow(ctx, x0 + (x1 - x0) * u, y + Math.sin(e.lt * 20 + i * 2.3) * 8, rc.h * 0.62 * fl, '#14060e', 0.85 * a2);
      }
      ctx.globalCompositeOperation = ADD;
      K.beamH(ctx, rc.x, rc.x + rc.w, y, rc.h * 0.36, '#c070ff', 0.42 * a2, '#ffd0a0');
      for (let i = 0; i < 5; i++) K.glow(ctx, x0 + (x1 - x0) * (i + 0.5) / 5, y - 14 + Math.sin(e.lt * 30 + i * 2) * 8, 30, i % 2 ? '#ff6a2a' : '#c070ff', 0.5 * a2);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 16; i++) { PTS[i * 2] = x1 - f * (6 + i * 22); PTS[i * 2 + 1] = y + Math.sin(e.lt * 18 - i * 0.7) * 12 * Math.min(1, i / 5); }
      K.stormDragon(ctx, PTS, 16, 1.35, '#b060ff', a2, e.lt);
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x1, y, 70, '#ff6a2a', 0.55 * a2);
    },
    light(L) { L.add((rc.x + rc.w / 2), d.y, rc.w, '#c070ff', 1.2); },
    end(e, ww) { floorFire(ww, p, d.lo, d.hi, gy, N); },
  });
}
/** 불바다: 흑룡 돌진이 지나간 자리 [lo, hi] 바닥에 N.fireT 초 — N.tickT 초마다 proc (숫자는 지속 피해 색) */
function floorFire(w, p, lo, hi, gy, N) {
  const n = Math.max(2, Math.min(10, Math.ceil((hi - lo) / 48)));
  K.fx(w, {
    life: N.fireT, z: 4, x: lo - 20, y: gy - 90, w: hi - lo + 40, h: 100, d: { k: 0 },
    tick(e, ww) {
      while (e.d.k < Math.round(N.fireT / N.tickT) && e.lt >= (e.d.k + 1) * N.tickT - 1e-6) {
        e.d.k++;
        strike(ww, p, { x: lo, y: gy - 64, w: hi - lo, h: 64 }, { mv: N.fireMvPct / 100, element: 'fire', kb: [0, -30], tags: ['melee'], dmgColor: '#ff9a5a' });
        ww.fx.burst('fire', lo + ((e.d.k * 131) % Math.max(1, hi - lo)), gy - 8, 2, { angle: -Math.PI / 2, spread: 0.5, speed: 120, color: '#c070ff' });
      }
    },
    draw(ctx, e) {
      const a = Math.min(1, e.lt / 0.15) * clamp01((e.life - e.lt) / 0.4);
      ctx.globalCompositeOperation = ADD;
      for (let i = 0; i < n; i++) {
        const x = lo + (hi - lo) * (i + 0.5) / n, fl = 0.75 + 0.25 * Math.sin(e.lt * 17 + i * 1.7);
        K.glow(ctx, x, gy - 14 * fl, 34 * fl, '#ff6a2a', 0.6 * a);
        K.glow(ctx, x, gy - 30 * fl, 22 * fl, '#c070ff', 0.65 * a);
      }
      // 불 혀 (위로 날름거리는 보라 불꽃; 한 경로)
      ctx.globalAlpha = 0.55 * a; ctx.fillStyle = '#c070ff';
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const x = lo + (hi - lo) * (i + 0.5) / (n * 2), h = 26 + 18 * Math.sin(e.lt * 13 + i * 2.7), sw = 9 + 3 * Math.sin(e.lt * 9 + i);
        ctx.moveTo(x - sw, gy); ctx.quadraticCurveTo(x - sw * 0.6, gy - h * 0.6, x + Math.sin(e.lt * 11 + i) * 5, gy - h); ctx.quadraticCurveTo(x + sw * 0.6, gy - h * 0.6, x + sw, gy); ctx.closePath();
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    },
    light(L) { L.add((lo + hi) / 2, gy - 30, hi - lo, '#ff6a2a', 0.8); },
  });
}

// ─────────────────────────── 영혼 인도 (영혼의 전령) ───────────────────────────
/** 영혼 슬롯 (만료 시각 3칸, 0 = 비었음) → 살아 있는 수 */
function soulsLive(st, tn) { const S = st.souls; return S ? (S[0] > tn) + (S[1] > tn) + (S[2] > tn) : 0; }
/** 영혼 i 의 자리 (영웅 등 뒤에 줄지어 떠 있다) */
function soulPos(p, i, t, out) {
  out.x = p.cx - p.facing * (30 + i * 22);
  out.y = p.y + 4 - i * 12 + Math.sin(t * 3 + i * 2.1) * 5;
  return out;
}
const SP = { x: 0, y: 0 };
/** 작은 영혼 날개 한 쌍 (벡터 두 장; 그라디언트 없음) */
function soulWings(ctx, x, y, s, a) {
  ctx.globalAlpha = 0.6 * a; ctx.fillStyle = '#fff2b0'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 8 * s, y - 12 * s, x - 15 * s, y - 6 * s); ctx.quadraticCurveTo(x - 9 * s, y - 3 * s, x, y + 2 * s);
  ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 8 * s, y - 12 * s, x + 15 * s, y - 6 * s); ctx.quadraticCurveTo(x + 9 * s, y - 3 * s, x, y + 2 * s);
  ctx.fill(); ctx.stroke();
  ctx.globalAlpha = 1;
}

// ─────────────────────────── 일점 (창신) ───────────────────────────
function pinBeam(w, p, N) {
  count('isolde_speargod.beam');
  const r = p.relRect(N.x0, N.y0, N.len, N.h), f = p.facing, y = r.y + r.h / 2, x0 = p.cx + f * N.x0, x1 = x0 + f * N.len;
  const a = procAtk(p, { mv: N.mvPct / 100, crit: N.crit, kb: [460, -220], hitstop: N.hitstop, shake: 7, tags: ['melee'] });
  sfx(w, 'slash_heavy', { pitch: 1.3 }); sfx(w, 'crit', { vol: 0.7, pitch: 1.2 });
  w.camera?.shake?.(6, 0.15);
  w.fx.ring(x1, y, { color: '#ff9aac', r0: 10, r1: 80, life: 0.3, width: 5 });
  K.fx(w, {
    life: N.life, z: 12, atk: a, win: [0, 0.4], x: Math.min(x0, x1) - 40, y: y - 60, w: N.len + 80, h: 120,
    rect() { return r; },
    draw(ctx, e) {
      const a2 = 1 - e.k, grow = Math.min(1, e.lt / 0.06), xe = x0 + (x1 - x0) * grow;
      ctx.globalCompositeOperation = ADD;
      K.beamH(ctx, x0, xe, y, 16 * a2 + 4, '#ff9aac', 0.6 * a2, '#ffffff');
      K.cutLine(ctx, x0, y, xe, y, 7 * a2 + 1, '#ffffff', a2);
      K.glow(ctx, xe, y, 60, '#ff9aac', 0.85 * a2);
      K.glow(ctx, x0, y, 40, '#ffd0d8', 0.7 * a2);
    },
    light(L, e) { L.add((x0 + x1) / 2, y, N.len, '#ff9aac', 1.2 * (1 - e.k)); },
  });
}

// ─────────────────────────── 아르겐 (용의 맹약자) ───────────────────────────
/** 용린 중첩 (만료 → 0) */
function scaleOf(p, w) { const st = perkState(p); return (st.scaleUntil ?? -1) > nowOf(w) ? (st.scale ?? 0) : 0; }
/** 용 날개 한 쌍 (x, y = 어깨, f = 날아가는 쪽, flap -1..1): 반투명 막 + 흰 뼈대 선. 그라디언트 없음 */
function dragonWings(ctx, x, y, f, s, flap, col, a) {
  ctx.globalCompositeOperation = ADD;
  for (let k = 0; k < 2; k++) {
    const lift = (k ? 0.75 : 1) * (0.55 + 0.45 * flap), tx = x - f * (52 + k * 18) * s, ty = y - (78 - k * 14) * s * lift;
    ctx.globalAlpha = (k ? 0.22 : 0.32) * a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - f * 10 * s, ty - 10 * s, tx, ty);
    ctx.quadraticCurveTo(tx - f * 6 * s, y - 20 * s * lift, x - f * 74 * s, y + 6 * s);
    ctx.quadraticCurveTo(x - f * 40 * s, y - 2 * s, x - f * 26 * s, y + 10 * s);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = (k ? 0.45 : 0.8) * a; ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - f * 10 * s, ty - 10 * s, tx, ty); ctx.lineTo(x - f * 74 * s, y + 6 * s); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
/** 아르겐의 환영: 등 뒤에서 날아와 앞뒤 640 구간을 가로지른다 (판정 창 [0.2, 0.8], proc 번개) */
function argen(w, p, N) {
  count('isolde_dragonbond.argen');
  const f = p.facing, cx = p.cx, yy = p.bottom - N.y, x0 = cx - f * N.from, x1 = cx + f * N.from;
  const rc = { x: cx - N.half, y: yy - N.h / 2, w: N.half * 2, h: N.h };
  const a = procAtkC(p, { mv: N.mvPct / 100, element: 'thunder', stun: N.stunT, kb: [200, -180], tags: ['melee'] }, '#9fe8ff');
  sfx(w, 'boss_roar', { vol: 0.45, pitch: 1.6 }); sfx(w, 'thunder', { vol: 0.6, pitch: 0.9 });
  K.fx(w, {
    life: N.life, z: 12, atk: a, win: [N.win0, N.win1], x: Math.min(x0, x1) - 80, y: yy - 120, w: N.from * 2 + 160, h: 240,
    rect() { return rc; },
    start(e, ww) { ww.fx.burst('thunder', x0, yy, 6, { speed: 240, color: '#e8fbff' }); },
    tick(e, ww) { if (e.k > 0.2 && e.k < 0.8 && !lowQ(ww) && ((e.lt * 60) | 0) % 6 === 0) ww.fx.emit('thunder', x0 + (x1 - x0) * e.k, yy + Math.sin(e.lt * 40) * 30, { speed: 180, color: '#9fe8ff' }); },
    draw(ctx, e) {
      const k = e.k, u = 1 - (1 - k) * (1 - k), hx = x0 + (x1 - x0) * u, a2 = Math.min(1, e.lt / 0.08) * clamp01((e.life - e.lt) / 0.14);
      ctx.globalCompositeOperation = ADD;
      // 지나간 자리 (판정 높이 120 의 옅은 빛)
      K.beamH(ctx, x0 + (hx - x0) * 0.25, hx, yy, N.h * 0.4, '#9fe8ff', 0.3 * a2, '#e8fbff');
      for (let i = 0; i < 20; i++) {
        PTS[i * 2] = hx - f * i * 26;
        PTS[i * 2 + 1] = yy + Math.sin((hx - f * i * 26) * 0.018 + e.lt * 6) * 18 * Math.min(1, i / 4);
      }
      // 날개 (어깨 마디에서 위로 펼친 막 두 장 — 날갯짓은 시간 sin)
      dragonWings(ctx, PTS[8], PTS[9], f, 1.25, Math.sin(e.lt * 16), '#9fe8ff', a2);
      K.stormDragon(ctx, PTS, 20, 1.6, '#9fe8ff', a2, e.lt);
      K.glow(ctx, hx, yy, 90, '#e8fbff', 0.5 * a2);
    },
    light(L, e) { L.add(x0 + (x1 - x0) * e.k, yy, 320, '#9fe8ff', 1.3); },
  });
}

// ─────────────────────────── 등록부 ───────────────────────────
const RET_PIN = { mult: 1 };   // onAttack 반환 (다시 쓰는 객체: perkAttack 이 곧바로 읽는다)

export const PERKS_D = {
  // ── 초월 ──
  /** 천뢰의 기사: 공중 점프 발밑 번개 · 급강하 착지 낙뢰 +1/120 (3~6) · 충격파 반경 +1/10 (최대 +60)
   *  명세 240 → 120: 점프+공중 점프+급강하의 실제 낙하 높이가 120~165 라 240 이면 높은 곳에서 뛰어내릴 때만 늘었다 */
  isolde_skysovereign: {
    N: { icd: 0.2, r: 90, mvPct: 60, stunT: 0.2, per: 120, base: 3, maxExtra: 3, rPer: 10, rMax: 60, boltMvPct: 90, boltStunT: 0.5, spread: 130, gap: 0.07 },
    prewarm(w) { warm(w, ['#bfe8ff', '#e0f4ff', '#ffffff'], null); },
    onJump(p, w, air) {
      if (air !== true || p.dead || !icd(p, 'pkSkyJump', this.N.icd, w)) return;
      count('isolde_skysovereign.jump');
      const x = p.cx, y = p.bottom + 10;
      strike(w, p, circ(x, y, this.N.r), { mv: this.N.mvPct / 100, element: 'thunder', kb: [120, -200], stun: this.N.stunT, dmgColor: '#bfe8ff' });
      skyBurst(w, x, y, this.N.r);
    },
    onPound(p, w, r, fall) {
      const N = this.N, extra = Math.max(0, Math.min(N.maxExtra, Math.floor((fall || 0) / N.per)));
      if (extra > 0) skyBolts(w, p, extra, N);
      const add = Math.min(N.rMax, (fall || 0) / N.rPer);
      if (!(add >= 1)) return undefined;
      count('isolde_skysovereign.radius');
      w.fx.ring(p.cx, p.bottom - 4, { color: '#e0f4ff', r0: r, r1: (r + add) * 1.6, life: 0.4, width: 3 });
      return { r: r + add };
    },
  },
  /** 심연의 용기사: 화염·암흑 피해마다 용염 +1 (최대 20) → 다음 돌진 찌르기가 흑룡 돌진 (380 꿰뚫기 250% + 2초 불바다 0.25초마다 15%) */
  isolde_abyssdragoon: {
    N: { add: 1, max: 20, dark: 1, len: 380, x0: 20, y0: -100, h: 90, mvPct: 250, hitstop: 0.06, t: 0.3, fireT: 2, tickT: 0.25, fireMvPct: 15 },   // dark 1: 암흑 피해도 센다 (흑룡의 검은 불길; 용의 숨결이 화염·암흑을 번갈아 친다) · 명세 max 30 → 20 (§2.8: 30 이면 단일 대상 +2~5 %, 40초에 한 번)
    prewarm(w) { warm(w, ['#c070ff', '#ff6a2a', '#ffd0a0', '#14060e', '#b060ff'], ['용염!', '#d8a0ff']); K.beamSprite?.('#c070ff', '#ffd0a0', true); },
    onHit(p, tgt, info, atk, w) {
      const el = atk?.element;
      if (!(el === 'fire' || (el === 'dark' && this.N.dark)) || !tgt || tgt.kind === 'prop') return;
      const st = perkState(p), was = st.ember ?? 0;
      if (was >= this.N.max) return;
      st.ember = Math.min(this.N.max, was + this.N.add);
      count('isolde_abyssdragoon.ember');
      if (st.ember < this.N.max) return;
      count('isolde_abyssdragoon.full');
      w.fx.ring(p.cx, p.cy, { color: '#c070ff', r0: 14, r1: 80, life: 0.4, width: 5 });
      w.fx.burst('fire', p.cx, p.cy, 8, { speed: 200, color: '#c070ff' });
      callout(w, p.cx, p.y - 30, '용염!', '#d8a0ff');
      sfx(w, 'fire', { vol: 0.6, pitch: 0.6 });
    },
    onSwing(p, w, mv) {
      if (!mv || mv.skill || mv.id !== 'spDash') return;
      const st = perkState(p);
      if ((st.ember ?? 0) < this.N.max) return;
      st.ember = 0;
      blackDragon(w, p, this.N);
    },
    tick(p, w) {
      if ((perkState(p).ember ?? 0) < this.N.max || !icd(p, 'pkAbyssMote', 0.3, w)) return;
      w.fx.emit('fire', p.cx + p.facing * 20, p.bottom - 64, { angle: -Math.PI / 2, spread: 0.5, speed: 70, color: '#c070ff' });
    },
    drawMeter(ctx, p, w) {
      const e = perkState(p).ember ?? 0;
      if (!(e > 0)) return;
      const x = p.cx, y = p.y - METER_DY, k = e / this.N.max;
      if (k >= 1) {
        const pu = 0.8 + 0.2 * Math.sin(nowOf(w) * 9);
        ctx.globalCompositeOperation = ADD;
        K.glow(ctx, x, y, 18 * pu, '#c070ff', 0.8);
        K.glow(ctx, x, y + 2, 8 * pu, '#ffd0a0', 0.8);
        ctx.globalCompositeOperation = 'source-over';
        pip(ctx, x, y, 5.5, '#e8c8ff', 0.95);
        return;
      }
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#14060e'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#c070ff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 7, -Math.PI / 2, -Math.PI / 2 + TAU * k); ctx.stroke();
      ctx.globalAlpha = 1;
    },
  },
  /** 영혼의 전령: 처치마다 영혼 8초 (최대 3, 넷째는 가장 오래된 것을 바꾼다) · 투창 때 영혼도 던진다 (각 40%) · 영혼 3일 때 피격 → 하나가 대신 사라진다 */
  isolde_soulherald: {
    N: { t: 8, max: 3, mvPct: 40, scale: 0.7, life: 0.5, spread: 0.12, iframes: 0.6 },
    prewarm(w) { warm(w, ['#fff2b0', '#ffd84a', '#ffe8a0'], ['영혼의 방패', '#fff2b0']); },
    onKill(p, e, atk, w) {
      const st = perkState(p), S = (st.souls ??= [0, 0, 0]), tn = nowOf(w);
      let j = 0;
      for (let i = 1; i < 3; i++) if (S[i] < S[j]) j = i;   // 빈 칸(0) 또는 가장 오래된 영혼
      S[j] = tn + this.N.t;
      count('isolde_soulherald.soul');
      soulPos(p, j, tn, SP);
      w.fx.burst('holy', e.cx, e.cy, 4, { speed: 120, color: '#fff2b0' });
      w.fx.ring(SP.x, SP.y, { color: '#fff2b0', r0: 4, r1: 30, life: 0.3, width: 3 });
      sfx(w, 'ghost', { vol: 0.25, pitch: 1.6 });
    },
    onSwing(p, w, mv) {
      if (!mv || mv.skill || !(mv.finisher || mv.id === 'spDash')) return;
      const st = perkState(p), S = st.souls, tn = nowOf(w);
      if (!S || !soulsLive(st, tn)) return;
      const f = p.facing, base = f > 0 ? 0 : Math.PI;
      let k = 0;
      for (let i = 0; i < 3; i++) {
        if (!(S[i] > tn)) continue;
        soulPos(p, i, tn, SP);
        const pr = K.throwJavelin(w, p, SP.x, SP.y, base + (k - 1) * this.N.spread * f, { mv: this.N.mvPct / 100, boom: 0, scale: this.N.scale, life: this.N.life, tags: ['melee'], color: '#fff2b0' });
        if (pr?.attack) { pr.attack.proc = true; pr.attack.hitstop = 0; pr.attack.shake = 0; pr.attack.dmgColor = '#fff2b0'; }
        w.fx.burst('holy', SP.x, SP.y, 2, { speed: 90, color: '#fff2b0' });
        k++;
      }
      count('isolde_soulherald.javelin');
    },
    onHurt(p, dmg, atk, w) {
      if (!atk || atk.team !== 'enemy' || atk.flat) return undefined;
      const st = perkState(p), S = st.souls, tn = nowOf(w);
      if (!S || soulsLive(st, tn) < this.N.max) return undefined;
      let j = 0;
      for (let i = 1; i < 3; i++) if (S[i] < S[j]) j = i;
      soulPos(p, j, tn, SP);
      S[j] = 0;
      p.iframes = Math.max(p.iframes ?? 0, this.N.iframes);
      count('isolde_soulherald.shield');
      w.fx.ring(p.cx, p.cy, { color: '#fff2b0', r0: 16, r1: 70, life: 0.35, width: 5 });
      w.fx.burst('holy', SP.x, SP.y, 8, { speed: 220, color: '#fff2b0' });
      K.afterimage?.(w, p, '#fff2b0', 0.25);
      callout(w, p.cx, p.y - 30, '영혼의 방패', '#fff2b0');
      sfx(w, 'holy', { vol: 0.7, pitch: 1.3 });
      return false;
    },
    drawMeter(ctx, p, w) {
      const S = perkState(p).souls, tn = nowOf(w);
      if (!S) return;
      for (let i = 0; i < 3; i++) {
        const left = S[i] - tn;
        if (!(left > 0)) continue;
        const a = left < 1.5 ? 0.45 + 0.55 * Math.abs(Math.sin(tn * 10)) : 1;
        soulPos(p, i, tn, SP);
        ctx.globalCompositeOperation = ADD;
        K.glow(ctx, SP.x, SP.y, 16, '#fff2b0', 0.6 * a);
        K.glow(ctx, SP.x, SP.y, 6, '#ffffff', 0.7 * a);
        ctx.globalCompositeOperation = 'source-over';
        soulWings(ctx, SP.x, SP.y - 2, 0.8, a);
      }
    },
  },
  /** 창신: 같은 적 연타마다 일점 1중첩 (최대 20, 2초) · 중첩당 그 적에게 +1.5% · 20중첩이면 다음 찌르기가 관통 일섬 (700, 250%, 치명타 확정) */
  isolde_speargod: {
    N: { max: 20, t: 2, perPct: 0.3, len: 700, x0: 30, y0: -90, h: 40, mvPct: 150, crit: 100, hitstop: 0.08, life: 0.25, icd: 1.5 },   // §2.8: 명세(맞을 때마다 1중첩 · 1.5% · 일섬 250%)는 단일 +28%, 한 번 휘두를 때 1중첩 · 0.5% · 250% 도 +20% → 0.3% · 150% 로 단일 +14% · 무리 +6%
    prewarm(w) { warm(w, ['#ff9aac', '#ffd0d8', '#ff2040'], null); K.beamSprite?.('#ff9aac', '#ffffff', true); },
    onHit(p, tgt, info, atk, w) {
      if (!atk?.tags?.includes('melee') || !tgt || tgt.dead || tgt.kind === 'prop') return;
      const st = perkState(p), sw = p.curHitId ?? atk.hitId;
      // 한 번 휘두를 때 1중첩: 그 휘두르기에 처음 맞은 적만 센다 (같은 휘두르기의 연타·투창·여러 적 관통은 쌓지도 끊지도 않는다)
      if (sw != null) { if (st.pinSw === sw) return; st.pinSw = sw; }
      if (st.pinT !== tgt) { if (st.pinT) unmark(st.pinT, 'pin'); st.pinT = tgt; }
      const was = markOf(tgt, 'pin'), n = mark(tgt, 'pin', this.N.t, 1, this.N.max);
      if (n >= this.N.max && was < this.N.max) {
        count('isolde_speargod.full');
        w.fx.ring(tgt.cx, tgt.y - 14, { color: '#ff9aac', r0: 26, r1: 8, life: 0.3, width: 4 });
        sfx(w, 'eye_glint', { vol: 0.6, pitch: 1.2 });
      }
    },
    onAttack(p, atk, tgt) {
      if (perkState(p).pinT !== tgt) return undefined;
      const n = markOf(tgt, 'pin');
      if (!n) return undefined;
      RET_PIN.mult = 1 + this.N.perPct / 100 * n;
      return RET_PIN;
    },
    onSwing(p, w, mv) {
      if (!mv?.box || mv.skill) return;
      const st = perkState(p), t = st.pinT;
      if (!t || t.dead || markOf(t, 'pin') < this.N.max || !icd(p, 'pkPinBeam', this.N.icd, w)) return;
      unmark(t, 'pin');
      pinBeam(w, p, this.N);
    },
  },
  // ── 비전 ──
  /** 용의 맹약자: 급강하 착지 → 아르겐의 환영 (앞뒤 640 · 높이 120 · 90% 번개, 4초에 한 번) · 용린 1중첩 (최대 3, 6초) — 중첩당 받는 피해 -5% */
  isolde_dragonbond: {
    N: { icd: 4, from: 420, half: 320, y: 80, h: 120, mvPct: 90, stunT: 0.2, life: 0.45, win0: 0.2, win1: 0.8, max: 3, t: 6, redPct: 5 },
    prewarm(w) { warm(w, ['#9fe8ff', '#e8fbff', '#ffffff'], null); K.beamSprite?.('#9fe8ff', '#e8fbff', true); K.beamSprite?.('#e8fbff', '#ffffff', true); },
    onPound(p, w) {
      const N = this.N, st = perkState(p), n = Math.min(N.max, scaleOf(p, w) + 1);
      st.scale = n; st.scaleUntil = nowOf(w) + N.t;
      count('isolde_dragonbond.scale');
      w.fx.ring(p.cx, p.cy, { color: '#9fe8ff', r0: 40, r1: 18, life: 0.3, width: 3 + n });
      if (icd(p, 'pkArgen', N.icd, w)) argen(w, p, N);
      return undefined;
    },
    onHurt(p, dmg, atk, w) {
      const n = scaleOf(p, w);
      if (!n || !(dmg > 0)) return undefined;
      count('isolde_dragonbond.reduce');
      if (icd(p, 'pkScaleFx', 0.25, w)) { w.fx.burst('ice', p.cx, p.cy, 4, { speed: 160, color: '#9fe8ff' }); w.fx.ring(p.cx, p.cy, { color: '#9fe8ff', r0: 30, r1: 50, life: 0.2, width: 3 }); }
      return dmg * (1 - this.N.redPct / 100 * n);
    },
    drawMeter(ctx, p, w) {
      const n = scaleOf(p, w);
      if (!n) return;
      const tn = nowOf(w), left = (perkState(p).scaleUntil ?? 0) - tn, a = left < 1.2 ? 0.5 + 0.5 * Math.abs(Math.sin(tn * 9)) : 1;
      const x = p.cx, y = p.y - METER_DY;
      ctx.globalCompositeOperation = ADD;
      K.glow(ctx, x, y, 12 + n * 4, '#9fe8ff', 0.35 * a);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < this.N.max; i++) pip(ctx, x + (i - 1) * 11, y, 4.6, i < n ? '#9fe8ff' : '#1a2a3a', i < n ? 0.95 * a : 0.5);
    },
  },
};

// ─────────────────────────── 비전 액티브 ───────────────────────────
/** 비전 액티브의 레벨과 무관한 수치 (레벨 수치는 data/skills_asc.js v) */
const ACT_N = {
  breath: { t: 1.5, every: 0.15, reach: 320, mouthX: 26, mouthY: 90, endY: 70, stunT: 0.15, segs: [[0, 115, 56], [105, 215, 96], [205, 320, 136]] },
};
export const ACTIVES_D = {
  /** 아르겐의 숨결: 어깨 위 아르겐의 환영이 1.5초 동안 앞쪽 320 에 번개 숨결 — 0.15초마다 (보통 스킬 타격) n 번, 짧은 경직. 방향 고정·이동 가능 */
  asc_isolde_breath(p, w, lv) {
    const id = 'asc_isolde_breath', A = ACT_N.breath, mv = skillVal(id, 'dmg', lv) / 100, n = Math.max(1, Math.floor(skillVal(id, 'n', lv)));
    const f = p.facing;
    count('asc_isolde_breath.cast');
    K.pose?.(p, w, 'cast', 0.28, { h0: 0.04, sfx: 'magic' });
    sfx(w, 'boss_roar', { vol: 0.5, pitch: 1.55 }); sfx(w, 'thunder', { vol: 0.6, pitch: 1.2 });
    const rc = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
    K.fx(w, {
      life: A.t, z: 11, d: { n: 0, pts: [null, null, null], hit: 9 },
      follow(e) { if (!p.dead) p.facing = f; e.x = f > 0 ? p.cx - 90 : p.cx - A.reach - 70; e.y = p.bottom - 210; e.w = A.reach + 160; e.h = 230; },
      tick(e, ww, dt) {
        if (p.dead || p.world !== ww) { e.life = Math.min(e.life, e.lt); return; }
        e.d.hit += dt;
        while (e.d.n < n && e.lt >= e.d.n * A.every - 1e-6) {
          e.d.n++; e.d.hit = 0;
          const mx = p.cx + f * A.mouthX, hid = K.nid?.('br') ?? 'br' + e.d.n;
          for (let i = 0; i < 3; i++) {
            const [a0, a1, h] = A.segs[i], r = rc[i], cy = p.bottom - A.mouthY + (A.mouthY - A.endY) * (i + 0.5) / 3;
            r.x = f > 0 ? mx + a0 : mx - a1; r.y = cy - h / 2; r.w = a1 - a0; r.h = h;
            K.uHit(ww, p, mv, { rect: r, type: 'phys', element: 'thunder', tags: ['skill'], hitId: hid, stun: A.stunT, kb: [90, -40], hitstop: 0, shake: 0, breakWalls: false, launch: false, dmgColor: '#9fe8ff' });
          }
          const my = p.bottom - A.mouthY, tx = mx + f * A.reach, ty = p.bottom - A.endY;
          for (let i = 0; i < 3; i++) e.d.pts[i] = K.boltPts(mx, my, tx, ty + (i - 1) * 34, 8, 18);
          count('asc_isolde_breath.tick');
          if (e.d.n % 2 === 1) sfx(ww, 'thunder', { vol: 0.3, pitch: 1.6 });
          ww.fx.burst('thunder', tx, ty, 2, { speed: 200, color: '#9fe8ff' });
        }
      },
      draw(ctx, e) {
        const a = Math.min(1, e.lt / 0.1) * clamp01((e.life - e.lt) / 0.2);
        const mx = p.cx + f * A.mouthX, my = p.bottom - A.mouthY, tx = mx + f * A.reach, ty = p.bottom - A.endY, ym = (my + ty) / 2;
        const pu = 0.85 + 0.15 * Math.sin(e.lt * 40);
        ctx.globalCompositeOperation = ADD;
        K.beamH(ctx, mx, tx, ym, 46 * pu, '#9fe8ff', 0.42 * a, '#e8fbff');
        K.beamH(ctx, mx, tx, ym, 12, '#e8fbff', 0.75 * a);
        for (let i = 0; i < 3; i++) if (e.d.pts[i]) K.drawBolt(ctx, e.d.pts[i], '#9fe8ff', 2.4, 0.9 * a * (e.d.hit < 0.1 ? 1 : 0.6));
        K.glow(ctx, tx, ty, 56 * pu, '#9fe8ff', 0.55 * a);
        K.glow(ctx, mx, my, 30, '#e8fbff', 0.85 * a);
        // 어깨 위 아르겐의 환영: 등 뒤에서 어깨를 넘어 앞으로 목을 뻗은 작은 은빛 용
        for (let i = 0; i < 12; i++) {
          const u = i / 11;
          PTS[i * 2] = mx - f * (4 + i * 8);
          PTS[i * 2 + 1] = my - 4 - Math.sin(u * Math.PI) * 30 + u * 26 + Math.sin(e.lt * 7 + i) * 1.5;
        }
        dragonWings(ctx, PTS[12], PTS[13], f, 0.55, Math.sin(e.lt * 12), '#9fe8ff', 0.9 * a);
        ctx.globalCompositeOperation = 'source-over';
        K.stormDragon(ctx, PTS, 12, 0.62, '#9fe8ff', 0.95 * a, e.lt);
      },
      light(L) { L.add(p.cx + f * (A.mouthX + A.reach / 2), p.bottom - A.endY, A.reach + 80, '#9fe8ff', 1.2); },
    });
    return true;
  },
};

// ─────────────────────────── 표식 그리기 (PerkLayer) ───────────────────────────
// (ctx, e, n, k, t): n = 중첩, k = 남은 시간 비율 0..1, t = 월드 시간. 머리 위 = (e.cx, e.y)
export const MARKS_D = {
  /** 일점 (창신): 머리 위 붉은 과녁 — 중첩만큼 차는 고리, 20이면 맥동하는 붉은 빛 + 흰 점 */
  pin(ctx, e, n, k, t) {
    const M = PERKS_D.isolde_speargod.N.max, x = e.x + e.w / 2, y = e.y - 16, full = n >= M, a = 0.55 + 0.45 * Math.min(1, k * 3);
    ctx.globalCompositeOperation = ADD;
    K.glow(ctx, x, y, full ? 24 + 4 * Math.sin(t * 14) : 10 + n * 0.5, full ? '#ff2040' : '#ff9aac', (full ? 0.75 : 0.4) * a);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = '#1a0610'; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.stroke();
    ctx.globalAlpha = a; ctx.strokeStyle = full ? '#ffffff' : '#ff9aac'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 8, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, n / M)); ctx.stroke();
    ctx.fillStyle = full ? '#ffffff' : '#ff2040';
    ctx.beginPath(); ctx.arc(x, y, full ? 3.2 : 1.6 + n * 0.06, 0, TAU); ctx.fill();
  },
};
