// 프런트엔드(타이틀·메뉴 흐름) 공용 도우미: 켄번스 배경, 분위기 입자(불씨·안개·박쥐·번개),
// 고딕 장식 패널/구분선/버튼, 터치 패드 표시 제어, 캐릭터 미리보기 인형, 명예의 전당 기록, 아케이드 임시 세이브
// 플랫폼 UI 규칙 (platform §4.5 · §5.1 · §6.2 · §6.3, MASTER_PLAN §1.16) — owner: PLAT-FRONT-A
//  - footer(ctx, vw, vh, keys, touch): 예전 키 글자 문자열('↑↓ 선택   Z 결정   X 뒤로')이나 항목 배열을 prompts.legacyKey 로
//    액션으로 바꿔 지금 기기의 글리프(키캡 · ✕○□△/A·B·X·Y · 터치 문구)로 그린다
//  - gbutton/backButton: { owner } 를 주면 ui.taps 에 등록 (터치 여유 영역으로 44 CSS px 보장) → update 에서 taps.hit(owner).
//    예전 TapZones 도 내부적으로 ui.taps 에 등록한다 (owner = 그 TapZones) → 여유 영역·?debug=taps 오버레이·QA 감사를 함께 쓴다
//  - setPad(show): 옛 이름. 가상 패드는 game.syncPad() 가 장면 플래그(hidePad/showPad)로 정한다 → 맨 위 장면의 플래그만 바꾼다
//  - applySettings: 볼륨·음악 음원 (가상 패드 투명도는 캔버스 패드가 settings.touchOpacity 를 직접 읽는다)
//  - gbutton/frame/ornament/menuItem/shade 의 그라데이션은 크기·색별로 한 번만 만든다 (MASTER_PLAN R12, feel §8: 저사양 프레임당 ≤ 6)
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { saves } from '../../core/save.js';
import { game } from '../../core/game.js';
import { text, FONT, COLORS, hovered, taps } from '../../core/ui.js';
import { drawHints, legacyKey, promptMode } from '../../core/prompts.js';
import { ACTIONS } from '../../data/controls.js';
import { hudSafe } from '../../render/hud_layout.js';
import { clamp, lerp, rand, TAU, rgba, ease } from '../../core/math.js';
import { CHARACTERS, CHAR_ORDER } from '../../data/characters.js';
import { CLASSES, classChain } from '../../data/classes.js';

export const GOLD = '#e8c872', BONE = '#efe4cf', CRIMSON = '#b3122e', INK = '#07030a', DIM = '#9d8f80';
export const EL = { holy: '#fff2b0', fire: '#ff7a2a', ice: '#9fe8ff', dark: '#b060ff', thunder: '#bfe0ff' };

// ───────────────────────── 기기/설정 ─────────────────────────
/**
 * 옛 이름 (platform P-18 §5.1): 가상 패드 표시의 주인은 game.syncPad() 하나다 (입력 모드 'touch' + 장면 플래그).
 * setPad(false) → 장면(없으면 맨 위 장면)에 hidePad = true, setPad(true) → setPad(false) 가 켠 hidePad 만 되돌린다
 * (showPad 를 강제로 켜지 않는다: 게임플레이 장면은 PAD_SCENES 라서 저절로 보이고, 메뉴 장면은 저절로 숨는다).
 * DOM 을 건드리지 않는다. exit() 에서 부르면 아래 장면이 맨 위라서 그 장면의 setPad 표시만 되돌린다.
 */
const PAD_OWN = Symbol('setPad');
export function setPad(show, scene = null) {
  const sc = scene ?? game.top;
  if (!sc || typeof sc !== 'object') return;
  if (!show) { if (!sc.hidePad) { sc.hidePad = true; sc[PAD_OWN] = true; } return; }
  if (sc[PAD_OWN]) { sc.hidePad = false; sc[PAD_OWN] = false; }
}
/** 설정값을 실제 시스템에 반영 (볼륨). 가상 패드 투명도는 캔버스 패드(touchpad.js)가 settings.touchOpacity 를 직접 읽는다 */
export function applySettings(game) {
  const s = game.settings;
  if (!s) return;
  audio.setVolumes(s.musicVol, s.sfxVol);
  audio.setMusicSource?.(s.musicSource);
}
/** 다음 장면 이름이 등록되어 있지 않으면 대체 경로로 */
export function goSafe(game, name, params = {}, opts) {
  if (game.registry[name]) { game.go(name, params, opts); return; }
  if (name === 'hub' || name === 'worldmap') {
    if (game.state) { game.go('stage', { stageId: game.state.lastStage?.stageId ?? nextStageOf(game.state) }, opts); return; }
  }
  game.go('title', {}, opts);
}
function nextStageOf(st) {
  const u = st?.progress?.unlocked ?? ['s01'];
  return u[u.length - 1] ?? 's01';
}
export const isTouch = () => input.touchMode;
export const keyHint = (keys, touch) => (input.touchMode ? touch ?? keys : keys);

export function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '-'; // 손상된 기록의 날짜
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fmtPlay(sec = 0) {
  sec = Math.max(0, Math.floor(Number(sec) || 0)); // 숫자가 아닌 값(손상된 기록)은 0
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${h}시간 ${String(m).padStart(2, '0')}분` : `${m}분 ${String(s).padStart(2, '0')}초`;
}
export function fmtClock(sec = 0) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60), cs = Math.floor((sec * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ───────────────────────── 그라데이션 캐시 (MASTER_PLAN R12) ─────────────────────────
// 프런트 장면은 매 프레임 같은 패널·버튼을 그린다 → 그라데이션을 (모양·색·크기) 키로 한 번만 만들고 다시 쓴다.
// 좌표가 움직이는 것은 원점 기준으로 만들어 ctx.translate(x, y) 한 뒤 채운다. 알파가 움직이는 것은 globalAlpha 로 곱한다.
const GRADS = new Map();
const GRADS_MAX = 320;
let gradMade = 0;
function keepGrad(key, g) {
  if (GRADS.size >= GRADS_MAX) GRADS.delete(GRADS.keys().next().value);
  GRADS.set(key, g);
  gradMade++;
  return g;
}
/** 캐시된 선형 그라데이션 (x0,y0)→(x1,y1), stops = [[위치, 색], …]. 같은 key 면 다시 만들지 않는다 */
export function linGrad(ctx, key, x0, y0, x1, y1, stops) {
  const g = GRADS.get(key);
  if (g) return g;
  const n = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) n.addColorStop(o, c);
  return keepGrad(key, n);
}
/** 캐시된 원형 그라데이션 (x,y 중심, r0→r1) */
export function radGrad(ctx, key, x, y, r0, r1, stops) {
  const g = GRADS.get(key);
  if (g) return g;
  const n = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) n.addColorStop(o, c);
  return keepGrad(key, n);
}
/** 지금까지 만든 그라데이션 수 (QA: 프레임마다 늘지 않아야 한다) */
export function gradStats() { return { made: gradMade, cached: GRADS.size }; }
const R1 = (v) => Math.max(1, Math.round(v));

// ───────────────────────── 스프라이트 캐시 ─────────────────────────
const SPR = {};
function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
/** 부드러운 원형 광원 스프라이트 (색별 캐시) */
export function glowSprite(color = '#ff9a3a') {
  const k = 'g' + color;
  if (SPR[k]) return SPR[k];
  const c = mkCanvas(64, 64), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, rgba(color, 1)); g.addColorStop(0.25, rgba(color, 0.55)); g.addColorStop(1, rgba(color, 0));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (SPR[k] = c);
}
/** 안개 덩어리 스프라이트 */
function fogSprite(tint = '#6a5a78') {
  const k = 'f' + tint;
  if (SPR[k]) return SPR[k];
  const c = mkCanvas(256, 128), x = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const cx = 40 + i * 30 + rand(-10, 10), cy = 64 + rand(-16, 16), r = rand(40, 64);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(tint, 0.2)); g.addColorStop(1, rgba(tint, 0));
    x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  }
  return (SPR[k] = c);
}

// ───────────────────────── 배경 ─────────────────────────
/**
 * 켄번스(느린 줌+팬) 커버 그리기. t: 초. px/py: 시차 오프셋(px)
 * 이미지가 없으면 고딕 그라데이션 + 달로 대체
 */
export function kenBurns(ctx, img, vw, vh, t, { z0 = 1.04, z1 = 1.12, period = 46, panX = 0.03, panY = 0.02, px = 0, py = 0, ox = 0.5, oy = 0.5, alpha = 1, phase = 0 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (img) {
    const k = 0.5 - 0.5 * Math.cos(((t + phase) / period) * TAU);
    const z = lerp(z0, z1, k);
    const s = Math.max(vw / img.width, vh / img.height) * z;
    const dw = img.width * s, dh = img.height * s;
    const sx = Math.sin((t + phase) * TAU / (period * 1.37)) * panX * vw;
    const sy = Math.cos((t + phase) * TAU / (period * 1.61)) * panY * vh;
    ctx.drawImage(img, (vw - dw) * ox + sx + px, (vh - dh) * oy + sy + py, dw, dh);
  } else {
    const H = R1(vh);
    ctx.fillStyle = linGrad(ctx, `kb|${H}`, 0, 0, 0, H, [[0, '#2a0610'], [0.55, '#12040c'], [1, '#040106']]);
    ctx.fillRect(0, 0, vw, vh);
    const mx = vw * 0.5 + px * 0.5, my = vh * 0.3;
    ctx.translate(mx, my);
    ctx.fillStyle = radGrad(ctx, 'kbMoon', 0, 0, 10, 150, [[0, 'rgba(255,90,80,0.95)'], [0.55, 'rgba(180,20,30,0.7)'], [1, 'rgba(120,0,20,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, 150, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
/** 위·아래 어둡게 + 비네팅 */
export function shade(ctx, vw, vh, { top = 0.55, bottom = 0.75, vig = 0.7, tint = null } = {}) {
  const W = R1(vw), H = R1(vh);
  ctx.fillStyle = linGrad(ctx, `sd|${H}|${top}|${bottom}`, 0, 0, 0, H, [[0, `rgba(4,1,6,${top})`], [0.35, 'rgba(4,1,6,0)'], [0.62, 'rgba(4,1,6,0)'], [1, `rgba(4,1,6,${bottom})`]]);
  ctx.fillRect(0, 0, vw, vh);
  if (vig > 0) {
    ctx.fillStyle = radGrad(ctx, `vg|${W}|${H}|${vig}`, W / 2, H / 2, H * 0.3, W * 0.72, [[0, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${vig})`]]);
    ctx.fillRect(0, 0, vw, vh);
  }
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, vw, vh); }
}

// ───────────────────────── 분위기 입자 ─────────────────────────
/**
 * 번개 섬광을 쳐도 되는가 (지금 설정을 매번 읽는다): '화면 번쩍임' 끔이거나 '동작 줄이기'면 치지 않는다.
 * 설정 화면에서 바꾸고 돌아와도 장면을 다시 열 필요가 없다 (benchmark #6 — 예전에는 장면 enter 에서 한 번만 정했다)
 */
export function lightningAllowed(s = game.settings) {
  return !(s && (Number(s.flashFx ?? 1) <= 0 || s.reduceMotion));
}
/** 불씨·먼지·안개·박쥐·번개를 한 번에 관리하는 가벼운 연출기 (미리 할당, 프레임당 할당 없음)
 *  번개는 useLightning(장면이 켠 것) && lightningAllowed()(설정) 일 때만 친다. 화면 섬광 세기는 settings.flashFx 를 곱한다.
 *  secondP: 번개 뒤 두 번째 섬광 확률 (타이틀 첫 실행은 0) */
export class Ambience {
  constructor({ embers = 60, motes = 30, bats = 12, fog = true, lightning = true, emberColor = '#ff8a3a', fogTint = '#5a4a6a' } = {}) {
    this.E = []; this.M = []; this.B = []; this.F = [];
    this.emberColor = emberColor; this.fogTint = fogTint; this.useFog = fog; this.useLightning = lightning; this.secondP = 0.6;
    for (let i = 0; i < embers; i++) this.E.push({ x: rand(0, 1), y: rand(0, 1), vx: rand(-0.01, 0.01), vy: -rand(0.02, 0.08), s: rand(0.8, 2.4), ph: rand(0, TAU), life: rand(0, 1) });
    for (let i = 0; i < motes; i++) this.M.push({ x: rand(0, 1), y: rand(0, 1), vx: rand(-0.004, 0.004), vy: rand(-0.004, 0.004), s: rand(0.6, 1.4), ph: rand(0, TAU) });
    for (let i = 0; i < bats; i++) this.B.push(this.newBat(true));
    for (let i = 0; i < 6; i++) this.F.push({ x: rand(-0.3, 1), y: rand(0.62, 1.02), s: rand(1.6, 3.2), v: rand(0.004, 0.014) * (i % 2 ? 1 : -1), a: rand(0.5, 1) });
    this.bolt = null; this.flash = 0; this.nextBolt = rand(2.5, 5); this.boltPts = new Float32Array(64); this.boltN = 0;
    this.forkPts = new Float32Array(32); this.forkN = 0;
  }
  newBat(init = false) {
    const d = rand(0.25, 1);
    return { x: init ? rand(-0.1, 1.1) : (Math.random() < 0.5 ? -0.08 : 1.08), y: rand(0.08, 0.55), d, v: rand(0.03, 0.07) * d, dir: 0, ph: rand(0, TAU), bob: rand(0.01, 0.03) };
  }
  strike(vw, vh, x = null) {
    this.flash = 1;
    const x0 = x ?? rand(vw * 0.05, vw * 0.95);
    let xx = x0, yy = -10, n = 0;
    const P = this.boltPts;
    while (yy < vh * rand(0.55, 0.85) && n < 30) { P[n * 2] = xx; P[n * 2 + 1] = yy; n++; xx += rand(-38, 38); yy += rand(18, 42); }
    this.boltN = n;
    // 곁가지
    const k = Math.max(2, Math.floor(n * rand(0.3, 0.6)));
    let fx = P[k * 2], fy = P[k * 2 + 1], m = 0;
    const F = this.forkPts, dir = Math.random() < 0.5 ? -1 : 1;
    while (m < 12) { F[m * 2] = fx; F[m * 2 + 1] = fy; m++; fx += dir * rand(8, 34); fy += rand(10, 30); }
    this.forkN = m;
    this.boltT = 0.28;
    audio.sfx('thunderclap', { vol: 0.5 });
  }
  update(dt, vw, vh) {
    for (const e of this.E) {
      e.life += dt * 0.25;
      e.x += (e.vx + Math.sin(e.ph + e.life * 6) * 0.004) * dt; e.y += e.vy * dt;
      if (e.y < -0.05 || e.life > 1) { e.x = rand(0, 1); e.y = rand(0.85, 1.05); e.life = 0; e.vy = -rand(0.02, 0.09); }
    }
    for (const m of this.M) {
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.x < -0.02) m.x = 1.02; else if (m.x > 1.02) m.x = -0.02;
      if (m.y < -0.02) m.y = 1.02; else if (m.y > 1.02) m.y = -0.02;
    }
    for (let i = 0; i < this.B.length; i++) {
      const b = this.B[i];
      if (!b.dir) b.dir = b.x < 0.5 ? 1 : -1;
      b.x += b.v * b.dir * dt; b.ph += dt * (9 + b.d * 5);
      if (b.x < -0.15 || b.x > 1.15) { this.B[i] = this.newBat(false); }
    }
    for (const f of this.F) { f.x += f.v * dt; if (f.x > 1.2) f.x = -0.5; if (f.x < -0.6) f.x = 1.1; }
    if (this.useLightning && lightningAllowed()) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.strike(vw, vh); this.nextBolt = rand(5, 10); this.second = Math.random() < this.secondP ? 0.14 : 0; }
      if (this.second > 0) { this.second -= dt; if (this.second <= 0) this.flash = 0.8; }
    } else if (this.flash > 0 || this.second > 0 || this.boltT > 0) {
      // 설정에서 막혔으면 치던 번개·대기 중인 두 번째 섬광도 거둔다 (돌아오자마자 번쩍이지 않게)
      this.flash = 0; this.second = 0; this.boltT = 0;
      if (this.nextBolt < 2.5) this.nextBolt = 2.5;
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.boltT > 0) this.boltT -= dt;
  }
  /** layer: 'back'(번개·먼 박쥐) | 'front'(안개·불씨·가까운 박쥐) */
  draw(ctx, vw, vh, layer = 'front', t = 0, px = 0) {
    ctx.save();
    if (layer === 'back') {
      if (this.boltT > 0 && this.boltN > 1) this.drawBolt(ctx, clamp(this.boltT / 0.28, 0, 1));
      this.drawBats(ctx, vw, vh, t, px, 0, 0.6);
    } else {
      this.drawBats(ctx, vw, vh, t, px, 0.6, 1.01);
      if (this.useFog) {
        const spr = fogSprite(this.fogTint);
        for (const f of this.F) {
          const w = 256 * f.s * (vw / 960), h = 128 * f.s;
          ctx.globalAlpha = 0.55 * f.a;
          ctx.drawImage(spr, f.x * vw - w / 2 + px * 0.6, f.y * vh - h / 2, w, h);
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      const spr = glowSprite(this.emberColor);
      for (const e of this.E) {
        const a = Math.sin(e.life * Math.PI) * (0.55 + 0.45 * Math.sin(t * 7 + e.ph));
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        const s = e.s * 7;
        ctx.drawImage(spr, e.x * vw - s / 2 + px * 0.8, e.y * vh - s / 2, s, s);
      }
      const ms = glowSprite('#c8b8ff');
      for (const m of this.M) {
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 2 + m.ph);
        const s = m.s * 6;
        ctx.drawImage(ms, m.x * vw - s / 2 + px * 0.3, m.y * vh - s / 2, s, s);
      }
      if (this.flash > 0) {
        ctx.globalAlpha = this.flash * 0.32 * clamp(Number(game.settings?.flashFx ?? 1), 0, 1);   // '약하게'(0.5)면 절반
        ctx.fillStyle = '#b8c8ff'; ctx.fillRect(0, 0, vw, vh);
      }
    }
    ctx.restore();
  }
  drawBolt(ctx, k) {
    const P = this.boltPts, n = this.boltN;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const path = (arr, m) => { ctx.beginPath(); ctx.moveTo(arr[0], arr[1]); for (let i = 1; i < m; i++) ctx.lineTo(arr[i * 2], arr[i * 2 + 1]); };
    for (const [w, a, c] of [[14, 0.12, '#6a7aff'], [6, 0.35, '#bfe0ff'], [2, 0.95, '#ffffff']]) {
      ctx.globalAlpha = a * k; ctx.strokeStyle = c; ctx.lineWidth = w;
      path(P, n); ctx.stroke();
      ctx.lineWidth = w * 0.6; path(this.forkPts, this.forkN); ctx.stroke();
    }
    ctx.restore();
  }
  drawBats(ctx, vw, vh, t, px, d0, d1) {
    for (const b of this.B) {
      if (b.d < d0 || b.d >= d1) continue;
      const x = b.x * vw + px * b.d, y = (b.y + Math.sin(b.ph * 0.15) * b.bob) * vh;
      drawBat(ctx, x, y, 7 + b.d * 13, b.ph, b.dir, 0.45 + b.d * 0.55);
    }
  }
}
/** 박쥐 실루엣 (날갯짓) */
export function drawBat(ctx, x, y, s, ph, dir = 1, alpha = 1) {
  const f = Math.sin(ph);
  ctx.save();
  ctx.translate(x, y); ctx.scale(dir * s / 10, s / 10);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#0a0308';
  ctx.beginPath();
  const wy = -6 * f, tip = 3 - 7 * f;
  ctx.moveTo(0, -1.5);
  ctx.quadraticCurveTo(-5, wy - 2, -11, tip - 1);
  ctx.lineTo(-8.5, tip + 2.5); ctx.lineTo(-7, tip + 1); ctx.lineTo(-5, tip + 3.2); ctx.lineTo(-3, 1.6);
  ctx.lineTo(0, 2.6);
  ctx.lineTo(3, 1.6); ctx.lineTo(5, tip + 3.2); ctx.lineTo(7, tip + 1); ctx.lineTo(8.5, tip + 2.5); ctx.lineTo(11, tip - 1);
  ctx.quadraticCurveTo(5, wy - 2, 0, -1.5);
  ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0.5, 1.8, 2.6, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-1.2, -1.6); ctx.lineTo(-1.6, -3.6); ctx.lineTo(-0.3, -2); ctx.lineTo(0.3, -2); ctx.lineTo(1.6, -3.6); ctx.lineTo(1.2, -1.6); ctx.fill();
  // 붉은 역광 테두리
  ctx.strokeStyle = 'rgba(255,70,70,0.35)'; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.restore();
}

// ───────────────────────── 장식 ─────────────────────────
/** 고딕 구분선 (가운데 마름모 + 양끝 페이드) */
export function ornament(ctx, cx, y, w, { color = GOLD, alpha = 1, gem = CRIMSON } = {}) {
  if (!(w > 0)) w = 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  // 가운데 원점, 폭 100 짜리 그라데이션을 가로로만 늘려 쓴다 → 색마다 하나 (폭이 움직이는 등장 연출도 새로 만들지 않는다)
  ctx.translate(cx, y);
  if (w > 0.5) {
    ctx.save();
    ctx.scale(w / 100, 1);
    ctx.fillStyle = linGrad(ctx, `or|${color}`, -50, 0, 50, 0, [[0, rgba(color, 0)], [0.3, rgba(color, 0.9)], [0.5, color], [0.7, rgba(color, 0.9)], [1, rgba(color, 0)]]);
    ctx.fillRect(-50, -0.75, 100, 1.5);
    ctx.fillRect(-30, 3, 60, 0.8);
    ctx.restore();
  }
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#1a0608'; ctx.fillRect(-6, -6, 12, 12);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.strokeRect(-6, -6, 12, 12);
  ctx.fillStyle = gem; ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * 16, y, 2, 0, TAU); ctx.fill(); }
  ctx.restore();
}
/** 장식 패널: 반투명 그라데이션 + 이중 테두리 + 모서리 문양 + (선택)강조색 글로우 */
export function frame(ctx, x, y, w, h, { accent = GOLD, fill0 = 'rgba(22,10,24,0.9)', fill1 = 'rgba(6,2,8,0.94)', glow = 0, alpha = 1, corners = true, edge = 0.75 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (glow > 0) {
    ctx.save();
    ctx.shadowColor = accent; ctx.shadowBlur = 22 * glow;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.restore();
  }
  // 몸통·윗면 광택: 높이별 캐시 그라데이션 (패널 왼쪽 위를 원점으로)
  const H = R1(h), SH = R1(Math.min(40, h * 0.4));
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = linGrad(ctx, `fr|${fill0}|${fill1}|${H}`, 0, 0, 0, H, [[0, fill0], [1, fill1]]);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = linGrad(ctx, `fs|${accent}|${SH}`, 0, 0, 0, SH, [[0, rgba(accent, 0.12)], [1, rgba(accent, 0)]]);
  ctx.fillRect(0, 0, w, Math.min(40, h * 0.4));
  ctx.restore();
  ctx.strokeStyle = rgba(accent, edge); ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  ctx.strokeStyle = rgba(accent, 0.2); ctx.lineWidth = 1;
  ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
  if (corners) {
    ctx.strokeStyle = accent; ctx.lineWidth = 2;
    const L = Math.min(16, w * 0.2, h * 0.2);
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(cx + sx * L, cy + sy * 1); ctx.lineTo(cx + sx * 1, cy + sy * 1); ctx.lineTo(cx + sx * 1, cy + sy * L); ctx.stroke();
      ctx.fillStyle = accent;
      ctx.save(); ctx.translate(cx + sx * 5, cy + sy * 5); ctx.rotate(Math.PI / 4); ctx.fillRect(-2, -2, 4, 4); ctx.restore();
    }
  }
  ctx.restore();
}
/** 큰 제목 (영문 로고체 + 한글 부제) */
export function heading(ctx, cx, y, eng, kor, { color = GOLD, size = 34, sub = BONE, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(179,18,46,0.8)'; ctx.shadowBlur = 18;
  text(ctx, eng, cx, y, { size, align: 'center', weight: 900, family: FONT.logo, color, ow: 5, outline: 'rgba(20,2,6,0.95)' });
  ctx.shadowBlur = 0;
  if (kor) text(ctx, kor, cx, y + size * 0.72 + 8, { size: Math.round(size * 0.46), align: 'center', weight: 800, family: FONT.title, color: sub, ow: 3 });
  ctx.restore();
  ornament(ctx, cx, y + (kor ? size * 0.72 + 22 : 16), Math.min(420, size * 11), { alpha: alpha * 0.9 });
}
/** 별점 (★) */
export function stars(ctx, x, y, n, max = 5, { color = GOLD, size = 14, gap = 3 } = {}) {
  for (let i = 0; i < max; i++) {
    const cx = x + i * (size + gap) + size / 2;
    starShape(ctx, cx, y, size * 0.5, i < n ? color : 'rgba(255,255,255,0.1)', i < n);
  }
}
export function starShape(ctx, cx, cy, r, fill, glow = false) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
  if (glow) { ctx.shadowColor = fill; ctx.shadowBlur = 8; }
  ctx.fillStyle = fill; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
/** 해골 아이콘 (난이도 표기) */
export function skull(ctx, cx, cy, s, color = BONE, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy); ctx.scale(s / 20, s / 20);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(0, -2, 9, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(5, 7); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
  ctx.fillRect(-4.5, 6, 9, 4);
  ctx.fillStyle = '#12060a';
  ctx.beginPath(); ctx.ellipse(-3.6, -1, 2.6, 3, 0, 0, TAU); ctx.ellipse(3.6, -1, 2.6, 3, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(-1.4, 4.6); ctx.lineTo(1.4, 4.6); ctx.fill();
  ctx.fillRect(-2.2, 7, 1, 3); ctx.fillRect(1.2, 7, 1, 3);
  ctx.restore();
}

/** 메뉴 항목(텍스트형): 선택 시 진홍 띠 + 금색 화살표 + 발광 */
export function menuItem(ctx, r, label, { selected = false, disabled = false, sub = null, k = 1, align = 'left', size = 22, accent = CRIMSON } = {}) {
  const hot = selected || (hovered(r) && !disabled);
  if (disabled) { k *= 0.45; accent = '#4a3a44'; }
  ctx.save();
  if (hot) {
    const W = R1(r.w);
    ctx.save();
    ctx.globalAlpha *= clamp(k, 0, 1);
    ctx.translate(r.x, 0);
    ctx.fillStyle = linGrad(ctx, `mi|${accent}|${W}`, 0, 0, W, 0, [[0, rgba(accent, 0.85)], [0.7, rgba(accent, 0.25)], [1, rgba(accent, 0)]]);
    ctx.fillRect(0, r.y + 3, r.w, r.h - 6);
    ctx.restore();
    ctx.fillStyle = rgba(GOLD, 0.8 * k); ctx.fillRect(r.x, r.y + 3, r.w * 0.7 * k, 1); ctx.fillRect(r.x, r.y + r.h - 4, r.w * 0.5 * k, 1);
    // 화살표
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.moveTo(r.x + 8, r.y + r.h / 2 - 6); ctx.lineTo(r.x + 16, r.y + r.h / 2); ctx.lineTo(r.x + 8, r.y + r.h / 2 + 6); ctx.closePath(); ctx.fill();
  }
  const tx = align === 'center' ? r.x + r.w / 2 : r.x + 28 + (hot ? 6 * k : 0);
  const col = disabled ? (hot ? '#8a7e80' : '#5e5456') : hot ? '#fff6dc' : BONE;
  if (hot && !disabled) { ctx.shadowColor = 'rgba(255,190,110,0.7)'; ctx.shadowBlur = 12; }
  text(ctx, label, tx, r.y + r.h / 2 + (sub ? -1 : size * 0.36), { size, align, weight: 800, family: FONT.title, color: col, ow: 3 });
  ctx.shadowBlur = 0;
  if (sub) text(ctx, sub, tx, r.y + r.h / 2 + 15, { size: 10, align, weight: 700, family: FONT.num, color: disabled ? '#4a4244' : hot ? GOLD : DIM, ow: 2 });
  ctx.restore();
}
// ───────────────────────── 탭 영역 ─────────────────────────
/**
 * 렌더에서 그린 버튼 영역을 기억해 두었다가 update 에서 탭을 판정한다 (ListMenu.hit 과 같은 방식).
 * input.pointer.tapped 는 고정 스텝 한 틱 동안만 참이라, 한 프레임에 여러 틱이 도는 30Hz·저사양 기기에서
 * render 안에서 검사하면 탭을 놓치고, 틱이 없는 120Hz 프레임에서는 두 번 잡힌다.
 *   render: this.taps.clear(); gbutton(ctx, r, '시작', { zones: this.taps, id: 'start' });
 *   update: const tap = this.taps.hit(); if (tap === 'start') …
 */
export class TapZones {
  constructor() { this.list = []; }
  clear() { this.list.length = 0; }
  /**
   * 영역 등록 (render 에서). ui.taps 공용 등록부에도 owner = 이 TapZones 로 올린다 (platform §6.3, P-19):
   * 터치 모드에서는 kind 최소 크기(primary 44 CSS px)에 모자란 만큼 여유 영역이 붙고, ?debug=taps·QA 감사가 이 영역을 본다
   */
  add(id, r, kind = 'primary') {
    if (!r) return r;
    this.list.push({ id, x: r.x, y: r.y, w: r.w, h: r.h });
    taps.add(id, r, { owner: this, kind, src: 'TapZones' });
    return r;
  }
  /** 이번 틱에 탭된 영역의 id (나중에 그린 = 위에 있는 영역 우선; 터치는 여유 영역 안의 가장 가까운 것). 없으면 null */
  hit() {
    const p = input.pointer;
    if (!p.tapped) return null;
    const id = taps.hit(this);
    if (id !== null && id !== undefined) return id;
    // 등록부의 마지막 묶음이 오래됐으면(render 없이 update 만 돈 경우) 기억해 둔 영역으로 판정
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      if (p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h) return z.id;
    }
    return null;
  }
}

const GB_HOT = [[0, 'rgba(140,22,40,0.96)'], [1, 'rgba(60,6,16,0.96)']];
const GB_IDLE = [[0, 'rgba(34,16,32,0.92)'], [1, 'rgba(10,4,12,0.94)']];
/**
 * 둥근 느낌의 고딕 버튼. 탭 판정 (둘 중 하나):
 *  - { owner: 장면, id } → ui.taps 에 등록 (터치 여유 영역으로 44 CSS px 보장) → update 에서 taps.hit(장면) === id
 *  - { zones: TapZones, id } (예전 방식) → update 에서 zones.hit() === id
 * kind: 'primary'(기본) | 'list' | 'icon' | 'dense' (ui.taps 최소 크기 종류)
 */
export function gbutton(ctx, r, label, { selected = false, disabled = false, size = 16, accent = GOLD, sub = null, icon = null, zones = null, id = label, owner = null, kind = 'primary', src = 'gbutton' } = {}) {
  const hot = (selected || hovered(r)) && !disabled;
  ctx.save();
  ctx.save();
  ctx.translate(r.x, r.y);
  const H = R1(r.h);
  ctx.fillStyle = linGrad(ctx, `gb${hot ? 1 : 0}|${H}`, 0, 0, 0, H, hot ? GB_HOT : GB_IDLE);
  ctx.fillRect(0, 0, r.w, r.h);
  ctx.restore();
  ctx.fillStyle = hot ? 'rgba(255,220,160,0.18)' : 'rgba(255,255,255,0.05)'; ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h * 0.4);
  ctx.strokeStyle = disabled ? '#3a2a2a' : hot ? accent : rgba(accent, 0.45); ctx.lineWidth = hot ? 2 : 1.4;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  if (hot) { ctx.shadowColor = accent; ctx.shadowBlur = 10; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); ctx.shadowBlur = 0; }
  const cy = r.y + r.h / 2;
  text(ctx, (icon ? icon + ' ' : '') + label, r.x + r.w / 2, cy + (sub ? -2 : size * 0.36), { size, align: 'center', weight: 800, color: disabled ? '#6a5e5e' : hot ? '#fff4d8' : BONE, ow: 2 });
  if (sub) text(ctx, sub, r.x + r.w / 2, cy + 14, { size: 10, align: 'center', weight: 700, color: DIM, ow: 2 });
  ctx.restore();
  if (!disabled) {
    if (zones) zones.add(id, r, kind);
    else if (owner) taps.add(id, r, { owner, kind, src });
  }
}
/**
 * 좌상단 뒤로가기 버튼 (터치용, 키보드·패드 사용자에게도 표시). id 'back' 으로 등록.
 * zones: TapZones(예전 방식) 또는 장면(owner → ui.taps, update 에서 taps.hit(장면) === 'back'). 반환: 버튼 사각형
 */
export function backButton(ctx, x = 14, y = 12, label = '뒤로', zones = null, { w = 92, h = 44 } = {}) {
  const r = { x, y, w, h };
  const own = zones && !(zones instanceof TapZones) ? zones : null;
  gbutton(ctx, r, label, { size: 15, icon: '◀', zones: own ? null : zones, owner: own, id: 'back', src: 'backButton' });
  return r;
}

// ───────────────────────── 조작 안내 (platform §4.5) ─────────────────────────
const ACTION_SET = new Set(ACTIONS);
const VIRTUAL_KEYS = new Set(['dpad', 'dpadH', 'dpadV', 'stickR', 'stickL']);
/** 안내 문자열의 키 글자인가 ('Z', '↑↓', 'Enter', 'confirm' …) */
const isKeyTok = (t) => ACTION_SET.has(t) || VIRTUAL_KEYS.has(t) || legacyKey(t) !== t;
const HINT_CACHE = new Map();
/**
 * 예전 안내 문자열 → prompts.drawHints 항목. 항목은 공백 2칸 이상으로 나뉘고, 항목의 첫 낱말이 키('Z', 'Z/Enter', '↑↓')다.
 * '↑↓ 슬롯 선택   Z 결정   X 타이틀로' → [['↑↓','슬롯 선택'], ['Z','결정'], ['X','타이틀로']] (첫 낱말이 키가 아니면 글자만)
 */
export function parseHints(str) {
  if (Array.isArray(str)) return str;
  const key = String(str ?? '');
  let items = HINT_CACHE.get(key);
  if (items) return items;
  items = [];
  for (const seg of key.split(/\s{2,}/)) {
    const s = seg.trim();
    if (!s) continue;
    const sp = s.indexOf(' ');
    const head = sp > 0 ? s.slice(0, sp) : s, rest = sp > 0 ? s.slice(sp + 1).trim() : '';
    const keys = head.split('/').filter(Boolean);
    if (rest && keys.length && keys.every(isKeyTok)) items.push([keys.length > 1 ? keys : keys[0], rest]);
    else items.push([null, s]);
  }
  if (HINT_CACHE.size > 96) HINT_CACHE.clear();
  HINT_CACHE.set(key, items);
  return items;
}
let hintErr = false;
/**
 * 하단 조작 안내: 지금 기기의 글리프 (키보드 키캡 · 패드 ✕○□△/A·B·X·Y · 터치 문구).
 *  keys: 예전 문자열('↑↓ 선택   Z 결정   X 뒤로', legacyKey 로 액션이 된다) 또는 drawHints 항목 배열 [[액션|키, '라벨'], …]
 *  touch: 터치 모드 문구 (없으면 키 항목의 라벨)
 * vw, vh 는 그리는 장면의 좌표 (uiScale 장면이면 game.uiW × game.uiH). safeArea 'full' 이면 아래 인셋만큼 올린다
 */
export function footer(ctx, vw, vh, keys, touch) {
  const m = promptMode();
  if (m === 'touch' ? !(touch ?? keys) : !keys) return;
  const k = taps.space > 0 ? taps.space : 1;
  const sb = (hudSafe(game).b || 0) / k;
  const y = vh - sb;
  ctx.save();
  ctx.translate(0, y - 34);
  ctx.fillStyle = linGrad(ctx, 'foot', 0, 0, 0, 34, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.7)']]);
  ctx.fillRect(0, 0, vw, 34 + sb);
  ctx.restore();
  if (m === 'touch' && typeof touch === 'string') { text(ctx, touch, vw / 2, y - 11, { size: 13, align: 'center', color: '#b8aa98', ow: 2 }); return; }
  const items = parseHints(keys);
  try { drawHints(ctx, items, vw / 2, y - 11, { align: 'center', size: 13, color: '#b8aa98' }); return; } catch (e) { if (!hintErr) { hintErr = true; console.error('[front] hints', e); } }
  if (typeof keys === 'string') text(ctx, keys, vw / 2, y - 11, { size: 13, align: 'center', color: '#b8aa98', ow: 2 });
}
/** 선택 확정 연출용 링 */
export function pulseRing(ctx, x, y, r, color, k) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (1 - k) * 0.8;
  ctx.strokeStyle = color; ctx.lineWidth = 4 * (1 - k) + 1;
  ctx.beginPath(); ctx.arc(x, y, r * (0.4 + k * 0.9), 0, TAU); ctx.stroke();
  ctx.restore();
}
/**
 * wrap() 결과를 n 줄까지만 남긴다. 잘렸으면 마지막 줄 끝을 '…' 로 (문장이 중간에서 뚝 끊겨 보이지 않게).
 * 바로 앞의 wrap 이 맞춰 둔 ctx.font 로 잰다 (같은 크기·굵기로 그릴 것)
 */
export function clampLines(ctx, lines, n, maxW) {
  if (lines.length <= n) return lines;
  const out = lines.slice(0, Math.max(0, n));
  if (!out.length) return out;
  let last = out[out.length - 1].replace(/\s+$/, '');
  while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1).replace(/\s+$/, '');
  out[out.length - 1] = last + '…';
  return out;
}

// ───────────────────────── 초상화 ─────────────────────────
/**
 * 초상화를 사각형 안에 커버로 그림 (fx, fy: 초점 0~1). 이미지가 없으면 캐릭터 색 실루엣 대체.
 * silhouette: 잠김 표시 (검은 실루엣 + 붉은 테두리광)
 */
export function portraitIn(ctx, img, r, { fx = 0.5, fy = 0.22, zoom = 1, silhouette = false, alpha = 1, fallback = '#3a2418', fadeBottom = 0 } = {}) {
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.globalAlpha *= alpha;
  if (img) {
    const s = Math.max(r.w / img.width, r.h / img.height) * zoom;
    const dw = img.width * s, dh = img.height * s;
    const dx = r.x + (r.w - dw) * fx, dy = r.y + (r.h - dh) * fy;
    ctx.drawImage(img, dx, dy, dw, dh);
    if (silhouette) {
      // 잠긴 캐릭터: 거의 검게 가리고 붉은 기운만 남김 (초상화는 불투명 이미지라 필터 대신 덮개 사용)
      ctx.fillStyle = 'rgba(5,0,6,0.9)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      // 크기별로 한 번 만든 대각선 그라데이션 (사각형 왼쪽 위 원점)
      const W = R1(r.w), H = R1(r.h);
      ctx.save(); ctx.translate(r.x, r.y);
      ctx.fillStyle = linGrad(ctx, `piSil|${W}|${H}`, 0, H, W, 0, [[0, 'rgba(150,10,30,0.35)'], [0.6, 'rgba(20,4,10,0)'], [1, 'rgba(70,40,140,0.25)']]);
      ctx.fillRect(0, 0, r.w, r.h);
      ctx.restore();
    }
  } else {
    const H = R1(r.h), c0 = silhouette ? '#1a0a10' : fallback;
    ctx.save(); ctx.translate(r.x, r.y);
    ctx.fillStyle = linGrad(ctx, `piFb|${c0}|${H}`, 0, 0, 0, H, [[0, c0], [1, '#07030a']]);
    ctx.fillRect(0, 0, r.w, r.h);
    ctx.restore();
    ctx.fillStyle = silhouette ? '#000' : 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h * 0.34, r.w * 0.18, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h * 0.9, r.w * 0.36, r.h * 0.4, 0, Math.PI, TAU); ctx.fill();
  }
  if (fadeBottom > 0) {
    const fh = R1(r.h * fadeBottom);
    ctx.translate(0, r.y + r.h * (1 - fadeBottom));
    ctx.fillStyle = linGrad(ctx, `piFade|${fh}`, 0, 0, 0, fh, [[0, 'rgba(6,2,8,0)'], [1, 'rgba(6,2,8,0.95)']]);
    ctx.fillRect(r.x, 0, r.w, r.h * fadeBottom + 1);
  }
  ctx.restore();
}

/** 초상화 가장자리를 투명하게 녹인 캐시 캔버스 (컷신에서 CG 위에 자연스럽게 얹기 위함) */
const FEATHER = new Map();
export function featherPortrait(img, key, { side = 0.2, bottom = 0.42, top = 0.06 } = {}) {
  if (!img) return null;
  const k = `${key}|${side}|${bottom}`;
  if (FEATHER.has(k)) return FEATHER.get(k);
  const W = Math.min(520, img.width), H = Math.round(W * img.height / img.width);
  const c = mkCanvas(W, H), x = c.getContext('2d');
  x.drawImage(img, 0, 0, W, H);
  x.globalCompositeOperation = 'destination-in';
  let g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(side, 'rgba(0,0,0,1)'); g.addColorStop(1 - side, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(top, 'rgba(0,0,0,1)'); g.addColorStop(1 - bottom, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  if (FEATHER.size > 10) FEATHER.delete(FEATHER.keys().next().value);
  FEATHER.set(k, c);
  return c;
}

// ───────────────────────── 캐릭터 미리보기 ─────────────────────────
/** 캐릭터(+직업) 외형. classId 를 주면 look.classId 로도 남겨 채색 퍼펫(hero_puppet.classOf)이 그 직업의 원화를 바로 고른다 */
export function lookOf(charId, classId = null, w = {}) {
  const ch = CHARACTERS[charId];
  const look = structuredClone(ch.look);
  if (classId && Object.hasOwn(CLASSES, classId)) {
    for (const c of classChain(classId)) Object.assign(look, structuredClone(c.look || {}));
    look.classId = classId;
  }
  look.weapon = { type: w.type ?? ch.weaponType, style: w.style ?? 1, level: w.level ?? 0, rarity: w.rarity ?? 0, element: w.element ?? null, color: w.color };
  return look;
}
/** drawHero 에 넘길 가짜 엔티티 (직업을 안 주면 그 영웅의 첫 직업 = 캐릭터 선택·새 게임의 모습) */
export function puppet(charId, classId = null, w = {}) {
  const ch = CHARACTERS[charId];
  classId ??= ch?.rootClass ?? null;
  return { look: lookOf(charId, classId, w), ch, facing: 1, anim: 'idle', animT: 0, move: null, moveT: 0, vx: 0, vy: 0, onGround: true, rig: {}, t: 0, stats: { reach: 0 }, charging: 0, muzzleT: 0, cx: 0, bottom: 0, x: 0, y: 0, w: ch.size.w, h: ch.size.h, buffs: {} };
}

// ───────────────────────── 명예의 전당 ─────────────────────────
export const MODES = [
  { id: 'all', name: '전체', eng: 'ALL' },
  { id: 'story', name: '스토리', eng: 'STORY' },
  { id: 'bossrush', name: '보스 러시', eng: 'BOSS RUSH' },
  { id: 'survival', name: '서바이벌', eng: 'SURVIVAL' },
  { id: 'practice', name: '스테이지 연습', eng: 'PRACTICE' },
  { id: 'tower', name: '무한의 탑', eng: 'TOWER' },
];
export const MODE_NAME = Object.fromEntries(MODES.map((m) => [m.id, m.name]));
/** 모드 이름 (알 수 없는 모드·손상된 값은 '') */
export const modeName = (id) => { const k = id || 'story'; return typeof k === 'string' && Object.hasOwn(MODE_NAME, k) ? MODE_NAME[k] : ''; };
const PER_MODE = 20;
const isRec = (h) => !!h && typeof h === 'object' && !Array.isArray(h);
/**
 * meta.highScores 를 믿고 읽을 수 있는 배열로 돌려준다. 손상된 기록(배열이 아님 · null 항목 · 숫자가 아닌 점수)은
 * 제자리에서 고친다 (다음 saveMeta 가 고친 것을 저장). 멀쩡하면 같은 배열을 그대로 돌려준다 (매 프레임 불러도 된다)
 */
export function scoreList(meta) {
  if (!isRec(meta)) return [];
  let a = meta.highScores;
  if (!Array.isArray(a)) a = meta.highScores = [];
  for (const h of a) {
    if (isRec(h) && Number.isFinite(h.score)) continue;
    a = meta.highScores = a.filter(isRec).map((x) => (Number.isFinite(x.score) ? x : { ...x, score: Math.max(0, Math.floor(Number(x.score) || 0)) }));
    break;
  }
  return a;
}
/** 모드별 상위 20개를 유지하며 기록. 반환: 해당 모드 내 순위(0부터) 또는 -1 */
export function recordHighScore(game, entry) {
  const m = game.meta;
  if (!m) return -1;
  scoreList(m);
  const e = { name: '', score: 0, mode: 'story', date: Date.now(), ...entry };
  e.score = Math.max(0, Math.floor(e.score || 0));
  // 스토리 모드는 한 회차(세이브 슬롯+생성 시각)당 한 줄만 남긴다. 회차 「피의 윤회」(ngplus §7)는 created 가 그대로라 run 끝에 ':n' → 회차마다 한 줄 + ng
  // (첫 조각 파일이라 game/ngplus.js 를 import 하지 않고 그 자리에서 읽는다 — main.js recordScore 와 같은 규칙)
  const st = game.state;
  const ng = e.mode === 'story' && st && !st.arcade && Number.isInteger(st.ng?.n) && st.ng.n > 0 ? Math.min(9, st.ng.n) : 0;   // [hook:ng]
  if (e.mode === 'story' && !e.run && st?.created) e.run = `${st.slot ?? 1}:${st.created}${ng ? `:${ng}` : ''}`;   // [hook:ng]
  if (ng) e.ng = ng;   // [hook:ng]
  if (e.run) {
    const old = m.highScores.filter((h) => h.run === e.run && (h.mode || 'story') === e.mode);
    for (const h of old) { e.score = Math.max(e.score, h.score); if (!e.name) e.name = h.name; }
    m.highScores = m.highScores.filter((h) => !old.includes(h));
  }
  m.highScores.push(e);
  m.highScores.sort((a, b) => b.score - a.score);
  const cnt = {};
  m.highScores = m.highScores.filter((h) => { const k = h.mode || 'story'; cnt[k] = (cnt[k] ?? 0) + 1; return cnt[k] <= PER_MODE; });
  saves.saveMeta(m);
  const list = m.highScores.filter((h) => (h.mode || 'story') === e.mode);
  return list.indexOf(e);
}
/** 이 점수가 해당 모드 순위권(20위)에 드는가 */
export function qualifies(game, mode, score) {
  if (!(score > 0)) return false;
  const list = scoreList(game.meta).filter((h) => (h.mode || 'story') === mode);
  return list.length < PER_MODE || score > list[list.length - 1].score;
}
/**
 * 보스 러시 코스별 최단 기록 { [코스 번호]: { time, score, charId, course, date } }.
 * 예전의 단일 기록(meta.bossRushBest)은 처음 읽을 때 그 기록의 코스로 옮긴다.
 */
export function bossRushBests(meta) {
  if (!meta) return {};
  if (!meta.bossRushBests || typeof meta.bossRushBests !== 'object') {
    meta.bossRushBests = {};
    const b = meta.bossRushBest;
    if (b && b.time > 0) meta.bossRushBests[b.course ?? 0] = { ...b, course: b.course ?? 0 };
  }
  return meta.bossRushBests;
}
/**
 * 무한의 탑 난이도별 최고 기록 { [난이도 id]: { floor(돌파한 층), time(초), score, charId, blessings, date } } (front/arcade_run.js 결과 화면이 쓴다).
 * 망가진 값은 빈 기록으로 고친다
 */
export function towerBests(meta) {
  if (!meta) return {};
  const t = meta.towerBest;
  if (!t || typeof t !== 'object' || Array.isArray(t)) meta.towerBest = {};
  return meta.towerBest;
}
/**
 * 아케이드 임시 세이브를 치우고 아케이드 전의 세이브로 되돌린다 (타이틀·아케이드 메뉴·결과 화면).
 * 여기(front/common.js)에 두어 타이틀이 arcade.js(→ 보스·아이템 데이터)를 첫 화면 조각으로 끌어오지 않게 한다 (R1-REQ-229).
 * arcade.js 가 같은 이름으로 다시 내보낸다
 */
export function endArcade(game) {
  if (game.state?.arcade) game.state = game._arcadePrev ?? null;
  game._arcadePrev = null;
}
/** main.js 의 recordScore 를 모드별 보존 버전으로 교체 (시그니처 동일) */
export function installRecordScore(game) {
  if (game._frontRecord) return;
  game._frontRecord = true;
  game.recordScore = (score, stageId, mode = 'story') => recordHighScore(game, {
    score, stageId, mode, charId: game.state?.charId, diff: game.state?.difficulty,
    name: game.state?.name ?? game.meta?.lastInitials ?? '',
  });
}

// ───────────────────────── 기타 ─────────────────────────
/** 부드러운 추종값 */
export const follow = (cur, target, dt, speed = 12) => cur + (target - cur) * (1 - Math.exp(-speed * dt));
/** 등장 애니메이션 (지연 d, 길이 len) → 0..1 */
export const appear = (t, d = 0, len = 0.45, fn = ease.outCubic) => fn(clamp((t - d) / len, 0, 1));
export { CHAR_ORDER };
